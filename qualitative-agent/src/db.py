"""Helper koneksi SQLite tunggal untuk seluruh modul.

``PRAGMA foreign_keys`` bersifat per-koneksi dan tidak tersimpan di dalam berkas
basis data, sehingga setiap koneksi yang dibuka tanpa menyalakannya kembali akan
diam-diam tidak menegakkan relasi referensial pada skema. Seluruh modul wajib
memakai ``connect()`` di sini alih-alih memanggil ``sqlite3.connect`` langsung.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "db" / "qualitative.db"


def connect(db_path: Path | str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn
