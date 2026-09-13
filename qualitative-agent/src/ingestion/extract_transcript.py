"""Ekstraksi transkrip wawancara dengan pelestarian fitur paralinguistik.

Transkrip berbeda dari prosa pada tiga hal yang seluruhnya bermakna analitik,
terutama bagi IPA: siapa yang berbicara, di mana giliran bicara berganti, dan
apa yang terjadi di antara kata-kata. Jeda, overlap, penekanan, dan tindakan
non-verbal karenanya tidak dibuang, melainkan dipindahkan ke ``paralinguistic``
sementara teks aslinya tetap utuh pada ``text``.

Notasi yang dikenali mengikuti konvensi yang lazim pada transkripsi Jefferson
yang disederhanakan:

    (2.5)        jeda terukur dalam detik
    (.)          jeda mikro
    [teks]       overlap dengan penutur lain
    ((tertawa))  tindakan atau catatan non-verbal
    KAPITAL      penekanan suara
    :::          perpanjangan bunyi
"""

from __future__ import annotations

import re
from pathlib import Path

from src.ingestion._raw import resolve_raw
from src.ingestion.blocks import Block

SPEAKER_LINE = re.compile(r"^\s*([A-Z][\w .'-]{0,40}?)\s*:\s*(.*)$")
PAUSE = re.compile(r"\((\d+(?:[.,]\d+)?)\)")
MICRO_PAUSE = re.compile(r"\(\.\)")
OVERLAP = re.compile(r"\[([^\]]+)\]")
NON_VERBAL = re.compile(r"\(\(([^)]+)\)\)")
EMPHASIS = re.compile(r"\b([A-Z]{2,})\b")
ELONGATION = re.compile(r"(\w)(:{2,})")


def detect_paralinguistic(teks: str) -> str | None:
    """Mengumpulkan penanda paralinguistik pada satu giliran bicara."""
    catatan: list[str] = []

    jeda = PAUSE.findall(teks)
    if jeda:
        catatan.append("jeda " + ", ".join(f"{j} detik" for j in jeda))
    if MICRO_PAUSE.search(teks):
        catatan.append(f"jeda mikro ({len(MICRO_PAUSE.findall(teks))}x)")
    overlap = OVERLAP.findall(teks)
    if overlap:
        catatan.append("overlap: " + "; ".join(o.strip() for o in overlap))
    non_verbal = NON_VERBAL.findall(teks)
    if non_verbal:
        catatan.append("non-verbal: " + "; ".join(n.strip() for n in non_verbal))
    penekanan = [p for p in EMPHASIS.findall(NON_VERBAL.sub("", teks)) if len(p) > 2]
    if penekanan:
        catatan.append("penekanan: " + ", ".join(dict.fromkeys(penekanan)))
    perpanjangan = ELONGATION.findall(teks)
    if perpanjangan:
        catatan.append("perpanjangan bunyi: " + ", ".join(h + t for h, t in perpanjangan))

    return " | ".join(catatan) if catatan else None


def extract(path: Path | str) -> list[Block]:
    """Satu blok per giliran bicara; baris lanjutan digabung ke giliran berjalan."""
    source = resolve_raw(path)
    blocks: list[Block] = []
    speaker_berjalan: str | None = None
    buffer: list[str] = []
    baris_awal = 0

    def tutup_giliran() -> None:
        nonlocal buffer, speaker_berjalan, baris_awal
        if not buffer:
            return
        teks = " ".join(b.strip() for b in buffer).strip()
        if teks:
            blocks.append(Block(
                text=teks,
                speaker=speaker_berjalan,
                paralinguistic=detect_paralinguistic(teks),
                source_ref=f"baris {baris_awal}",
            ))
        buffer = []

    with source.open("r", encoding="utf-8", errors="replace") as handle:
        for nomor, baris in enumerate(handle, start=1):
            if not baris.strip():
                continue
            cocok = SPEAKER_LINE.match(baris)
            if cocok:
                tutup_giliran()
                speaker_berjalan = cocok.group(1).strip()
                baris_awal = nomor
                sisa = cocok.group(2).strip()
                if sisa:
                    buffer.append(sisa)
            else:
                if not buffer:
                    baris_awal = nomor
                buffer.append(baris.strip())
    tutup_giliran()
    return blocks
