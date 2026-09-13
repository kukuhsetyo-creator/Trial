"""Ekstraksi teks dari PDF.

Satu blok per paragraf, dengan nomor halaman dipertahankan pada ``source_ref``
agar kutipan dapat dirujuk kembali ke halaman aslinya.
"""

from __future__ import annotations

import re
from pathlib import Path

from src.ingestion._raw import resolve_raw
from src.ingestion.blocks import Block

PARAGRAPH_BREAK = re.compile(r"\n\s*\n")


def extract(path: Path | str) -> list[Block]:
    try:
        import pymupdf
    except ImportError as exc:  # pragma: no cover - bergantung lingkungan
        raise RuntimeError("Paket 'pymupdf' belum terpasang.") from exc

    source = resolve_raw(path)
    blocks: list[Block] = []
    # Dibuka read-only; pymupdf tidak menulis apa pun ke berkas sumber.
    with pymupdf.open(source) as dokumen:
        for nomor, halaman in enumerate(dokumen, start=1):
            teks = halaman.get_text("text")
            for paragraf in PARAGRAPH_BREAK.split(teks):
                bersih = re.sub(r"[ \t]+", " ", paragraf).strip()
                if bersih:
                    blocks.append(Block(text=bersih, source_ref=f"hal. {nomor}"))
    return blocks
