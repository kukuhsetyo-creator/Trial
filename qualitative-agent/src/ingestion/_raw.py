"""Penjaga akses read-only terhadap ``data/raw/``.

CLAUDE.md §3 menyatakan ``data/raw/`` bersifat read-only dan tidak ada fungsi apa
pun yang menulis ke folder itu. Aturan semacam ini tidak bertahan bila hanya
ditulis sebagai konvensi, karena pelanggarannya baru terlihat setelah data mentah
rusak dan tidak ada cara mengembalikannya. Seluruh pembacaan berkas mentah
karenanya melewati modul ini, yang menolak mode tulis dan menolak path di luar
direktori tersebut.
"""

from __future__ import annotations

from pathlib import Path
from typing import IO

from src.db import PROJECT_ROOT

RAW_DIR = PROJECT_ROOT / "data" / "raw"
FORBIDDEN_MODE_CHARS = set("wax+")


class RawAccessError(PermissionError):
    """Upaya akses yang melanggar sifat read-only data/raw/."""


def resolve_raw(path: Path | str) -> Path:
    """Mengembalikan path absolut di dalam data/raw/, atau menolak."""
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = (RAW_DIR / candidate).resolve()
    else:
        candidate = candidate.resolve()

    raw_root = RAW_DIR.resolve()
    if not candidate.is_relative_to(raw_root):
        raise RawAccessError(
            f"Berkas sumber harus berada di dalam {raw_root}, bukan {candidate}."
        )
    if not candidate.is_file():
        raise FileNotFoundError(f"Berkas mentah tidak ditemukan: {candidate}")
    return candidate


def open_raw(path: Path | str, mode: str = "rb") -> IO:
    if FORBIDDEN_MODE_CHARS & set(mode):
        raise RawAccessError(
            f"Mode '{mode}' ditolak: data/raw/ hanya boleh dibaca, tidak pernah ditulis."
        )
    return resolve_raw(path).open(mode)


def relative_to_raw(path: Path | str) -> str:
    """Path relatif terhadap data/raw/, sebagaimana disimpan pada documents.file_path."""
    return str(resolve_raw(path).relative_to(RAW_DIR.resolve()))
