"""Helper koneksi SQLite tunggal untuk seluruh modul.

``PRAGMA foreign_keys`` bersifat per-koneksi dan tidak tersimpan di dalam berkas
basis data, sehingga setiap koneksi yang dibuka tanpa menyalakannya kembali akan
diam-diam tidak menegakkan relasi referensial pada skema. Seluruh modul wajib
memakai ``connect()`` di sini alih-alih memanggil ``sqlite3.connect`` langsung.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "db" / "qualitative.db"

# Seluruh stempel waktu pada basis data ini berformat ISO 8601 dengan penanda
# zona eksplisit, baik yang ditulis Python maupun yang lahir dari DEFAULT pada
# skema. CURRENT_TIMESTAMP bawaan SQLite sengaja tidak dipakai karena bentuknya
# ('YYYY-MM-DD HH:MM:SS', tanpa zona) tidak dapat diurutkan bersama nilai ISO
# sebagai string, padahal rekonstruksi kronologi audit trail lintas tabel
# menuntut perbandingan semacam itu.
ISO_DEFAULT_SQL = "(strftime('%Y-%m-%dT%H:%M:%S+00:00','now'))"


def utc_now_iso() -> str:
    """Stempel waktu UTC berformat ISO 8601, presisi detik.

    Padanan Python dari ISO_DEFAULT_SQL. Setiap modul yang menulis kolom
    stempel waktu secara eksplisit wajib memakai fungsi ini agar formatnya
    identik dengan nilai yang dihasilkan DEFAULT pada skema.
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(db_path: Path | str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn
