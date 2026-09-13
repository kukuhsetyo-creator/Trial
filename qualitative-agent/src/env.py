"""Pemuatan variabel lingkungan dari berkas .env di akar proyek.

Kunci API tidak pernah disimpan di dalam kode maupun basis data. Ia dibaca dari
lingkungan, dan berkas ``.env`` di akar proyek dimuat ke lingkungan itu bila ada.
Nilai yang sudah diset di shell selalu menang atas isi berkas, sehingga pemakaian
kunci yang berbeda untuk satu sesi tidak menuntut penyuntingan berkas.
"""

from __future__ import annotations

import os

from src.db import PROJECT_ROOT

ENV_PATH = PROJECT_ROOT / ".env"
_sudah_dimuat = False


def load_env(force: bool = False) -> bool:
    """Memuat .env sekali per proses. Mengembalikan True bila berkasnya terbaca."""
    global _sudah_dimuat
    if _sudah_dimuat and not force:
        return ENV_PATH.exists()
    _sudah_dimuat = True
    if not ENV_PATH.exists():
        return False

    try:
        from dotenv import load_dotenv
    except ImportError:
        # Cadangan tanpa dependensi: cukup untuk berkas berbentuk KUNCI=nilai.
        for baris in ENV_PATH.read_text(encoding="utf-8").splitlines():
            baris = baris.strip()
            if not baris or baris.startswith("#") or "=" not in baris:
                continue
            kunci, _, nilai = baris.partition("=")
            os.environ.setdefault(kunci.strip(), nilai.strip().strip("'\""))
        return True

    load_dotenv(ENV_PATH, override=False)
    return True


def api_key_tersedia() -> bool:
    load_env()
    return bool(os.environ.get("ANTHROPIC_API_KEY"))
