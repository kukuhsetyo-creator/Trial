"""Struktur perantara antara ekstraksi dan segmentasi."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Block:
    """Satu potongan teks hasil ekstraksi, sebelum menjadi unit makna.

    ``speaker`` dan ``paralinguistic`` bernilai None untuk sumber non-transkrip.
    ``source_ref`` menyimpan jejak asal (nomor halaman, paragraf, atau baris) agar
    kutipan dapat ditelusuri kembali ke berkas mentah.
    """

    text: str
    speaker: str | None = None
    paralinguistic: str | None = None
    source_ref: str | None = None
    meta: dict = field(default_factory=dict)

    def is_empty(self) -> bool:
        return not self.text.strip()
