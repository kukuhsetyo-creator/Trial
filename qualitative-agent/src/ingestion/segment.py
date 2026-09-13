"""Segmentasi menjadi unit makna.

Segmentasi di sini bukan pemotongan panjang karakter yang buta terhadap isi.
Prinsip yang dipegang: giliran bicara tidak pernah digabung lintas penutur,
karena unit yang memuat dua suara tidak dapat dikodekan sebagai satu makna;
paragraf pendek yang berkelanjutan boleh digabung sampai ambang panjang; dan
blok yang terlalu panjang dipecah pada batas kalimat, bukan di tengah klausa.

Ambang panjang berfungsi sebagai pagar terhadap unit yang tidak praktis
dikodekan, bukan sebagai aturan pemotongan utama.
"""

from __future__ import annotations

import re

from src.ingestion.blocks import Block

SENTENCE_END = re.compile(r"(?<=[.!?…])\s+(?=[A-Z“\"'(])")

DEFAULT_MAX_CHARS = 1200
DEFAULT_MIN_CHARS = 40


def _pecah_kalimat(teks: str, batas: int) -> list[str]:
    kalimat = SENTENCE_END.split(teks)
    potongan: list[str] = []
    berjalan = ""
    for k in kalimat:
        if not berjalan:
            berjalan = k
        elif len(berjalan) + 1 + len(k) <= batas:
            berjalan = f"{berjalan} {k}"
        else:
            potongan.append(berjalan)
            berjalan = k
    if berjalan:
        potongan.append(berjalan)

    # Kalimat tunggal yang tetap melebihi batas dibiarkan utuh: memotongnya di
    # tengah klausa akan merusak makna, dan unit panjang masih dapat dikodekan
    # sementara unit yang terpenggal tidak.
    return potongan or [teks]


def segment(
    blocks: list[Block],
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    min_chars: int = DEFAULT_MIN_CHARS,
) -> list[Block]:
    unit: list[Block] = []
    berjalan: Block | None = None

    for block in blocks:
        if block.is_empty():
            continue

        # Giliran bicara berdiri sendiri: tidak pernah digabung dengan penutur lain
        # maupun dengan giliran berikutnya dari penutur yang sama, karena pergantian
        # giliran adalah batas makna yang nyata pada data percakapan.
        if block.speaker is not None:
            if berjalan is not None:
                unit.append(berjalan)
                berjalan = None
            for bagian in _pecah_kalimat(block.text, max_chars):
                unit.append(Block(
                    text=bagian,
                    speaker=block.speaker,
                    paralinguistic=block.paralinguistic,
                    source_ref=block.source_ref,
                    meta=dict(block.meta),
                ))
            continue

        if berjalan is None:
            berjalan = Block(text=block.text, source_ref=block.source_ref, meta=dict(block.meta))
        elif len(berjalan.text) < min_chars or len(berjalan.text) + 1 + len(block.text) <= max_chars:
            berjalan.text = f"{berjalan.text} {block.text}".strip()
        else:
            unit.append(berjalan)
            berjalan = Block(text=block.text, source_ref=block.source_ref, meta=dict(block.meta))

        if berjalan is not None and len(berjalan.text) > max_chars:
            bagian = _pecah_kalimat(berjalan.text, max_chars)
            for b in bagian[:-1]:
                unit.append(Block(text=b, source_ref=berjalan.source_ref, meta=dict(berjalan.meta)))
            berjalan = Block(text=bagian[-1], source_ref=berjalan.source_ref, meta=dict(berjalan.meta))

    if berjalan is not None:
        unit.append(berjalan)
    return unit
