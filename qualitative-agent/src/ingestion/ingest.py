"""Orkestrasi ingest: ekstraksi, segmentasi, dan persistensi unit makna.

Alur tunggal dari berkas mentah menjadi baris ``documents`` dan ``units``.
Berkas sumber hanya dibaca; hasil antara ditulis ke ``data/processed/`` dan tidak
pernah ke ``data/raw/`` (CLAUDE.md §3).
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from pathlib import Path
from typing import Any, Callable

from src.db import PROJECT_ROOT, connect
from src.ingestion import extract_docx, extract_pdf, extract_transcript
from src.ingestion._raw import relative_to_raw, resolve_raw
from src.ingestion.blocks import Block
from src.ingestion.segment import segment

PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

SOURCE_TYPES = ("book", "interview_transcript", "document", "field_note", "other")

# Pemilihan ekstraktor mengikuti jenis sumber lebih dahulu, karena transkrip yang
# disimpan sebagai .txt menuntut perlakuan yang sama sekali berbeda dari catatan
# lapangan yang juga .txt.
EXTENSION_EXTRACTORS: dict[str, Callable[[Path | str], list[Block]]] = {
    ".pdf": extract_pdf.extract,
    ".docx": extract_docx.extract,
}


class IngestError(ValueError):
    """Permintaan ingest tidak memenuhi syarat minimum."""


def pilih_ekstraktor(path: Path, source_type: str) -> Callable[[Path | str], list[Block]]:
    if source_type == "interview_transcript":
        if path.suffix.lower() in EXTENSION_EXTRACTORS:
            raise IngestError(
                f"Transkrip berformat {path.suffix} belum didukung; ekstraktor transkrip "
                "membaca berkas teks agar penanda paralinguistik tidak hilang."
            )
        return extract_transcript.extract
    if path.suffix.lower() in EXTENSION_EXTRACTORS:
        return EXTENSION_EXTRACTORS[path.suffix.lower()]
    if path.suffix.lower() in (".txt", ".md", ""):
        return _extract_plain
    raise IngestError(f"Tidak ada ekstraktor untuk berkas berekstensi '{path.suffix}'.")


def _extract_plain(path: Path | str) -> list[Block]:
    source = resolve_raw(path)
    teks = source.read_text(encoding="utf-8", errors="replace")
    return [
        Block(text=paragraf.strip(), source_ref=f"par. {nomor}")
        for nomor, paragraf in enumerate(teks.split("\n\n"), start=1)
        if paragraf.strip()
    ]


def ingest_document(
    file_path: Path | str,
    *,
    title: str,
    source_type: str,
    participant_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    max_chars: int | None = None,
    min_chars: int | None = None,
    allow_duplicate: bool = False,
    conn: sqlite3.Connection | None = None,
) -> dict[str, Any]:
    """Membaca satu berkas mentah dan menyimpannya sebagai dokumen beserta unitnya."""
    if source_type not in SOURCE_TYPES:
        raise IngestError(f"source_type '{source_type}' tidak sah; pilih dari {SOURCE_TYPES}.")
    if not title.strip():
        raise IngestError("Judul dokumen tidak boleh kosong.")
    if participant_id is not None and not participant_id.strip():
        raise IngestError(
            "participant_id kosong lebih buruk daripada tidak diisi: IPA memartisi "
            "analisis berdasarkan nilai ini."
        )

    source = resolve_raw(file_path)
    relatif = relative_to_raw(source)

    ekstraktor = pilih_ekstraktor(source, source_type)
    blocks = ekstraktor(source)
    if not blocks:
        raise IngestError(f"Tidak ada teks yang dapat diekstraksi dari {relatif}.")

    from config.loader import load_settings
    pengaturan = (load_settings().get("segmentation") or {})
    units = segment(
        blocks,
        max_chars=max_chars or pengaturan.get("max_chars_per_unit", 1200),
        min_chars=min_chars or pengaturan.get("min_chars_per_unit", 40),
    )

    owns = conn is None
    conn = conn or connect()
    try:
        if not allow_duplicate:
            ada = conn.execute(
                "SELECT id FROM documents WHERE file_path = ?", (relatif,)
            ).fetchone()
            if ada:
                raise IngestError(
                    f"Berkas '{relatif}' sudah pernah di-ingest sebagai dokumen #{ada[0]}. "
                    "Gunakan allow_duplicate=True bila memang dikehendaki."
                )

        document_id = conn.execute(
            """
            INSERT INTO documents (title, source_type, file_path, participant_id, metadata_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (title.strip(), source_type, relatif, participant_id,
             json.dumps(metadata, ensure_ascii=False) if metadata else None),
        ).lastrowid

        conn.executemany(
            """
            INSERT INTO units (document_id, sequence_index, speaker, text, paralinguistic_notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (document_id, index, unit.speaker, unit.text, unit.paralinguistic)
                for index, unit in enumerate(units)
            ],
        )
        conn.commit()
    finally:
        if owns:
            conn.close()

    _tulis_hasil_antara(document_id, relatif, title, source_type, participant_id, units)

    return {
        "document_id": document_id,
        "file_path": relatif,
        "jumlah_blok": len(blocks),
        "jumlah_unit": len(units),
        "penutur": sorted({u.speaker for u in units if u.speaker}),
        "unit_berparalinguistik": sum(1 for u in units if u.paralinguistic),
    }


def _tulis_hasil_antara(
    document_id: int,
    relatif: str,
    title: str,
    source_type: str,
    participant_id: str | None,
    units: list[Block],
) -> None:
    """Menyimpan hasil ekstraksi dan segmentasi ke data/processed/ untuk portabilitas."""
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    muatan = {
        "document_id": document_id,
        "file_path": relatif,
        "title": title,
        "source_type": source_type,
        "participant_id": participant_id,
        "units": [asdict(u) | {"sequence_index": i} for i, u in enumerate(units)],
    }
    (PROCESSED_DIR / f"document-{document_id}.json").write_text(
        json.dumps(muatan, ensure_ascii=False, indent=2), encoding="utf-8"
    )
