"""Inisialisasi basis data SQLite untuk agen analisis kualitatif lokal.

Skrip ini mengeksekusi ``db/schema.sql`` apa adanya terhadap ``db/qualitative.db``
lalu memverifikasi bahwa seluruh tabel dan indeks yang dideklarasikan pada berkas
DDL benar-benar terbentuk.

Catatan penting bagi modul lain: ``PRAGMA foreign_keys`` bersifat per-koneksi dan
tidak tersimpan di dalam berkas basis data. Pernyataan PRAGMA di kepala
``schema.sql`` hanya berlaku untuk koneksi inisialisasi ini, sehingga setiap modul
yang membuka koneksi sendiri wajib menyalakannya kembali.

Skrip tidak pernah menulis apa pun ke ``data/raw/``.

Pemakaian:
    python src/db_init.py                 # buat basis data bila belum ada, lalu verifikasi
    python src/db_init.py --verify-only   # hanya verifikasi, tidak menyentuh skema
    python src/db_init.py --recreate      # hapus basis data lama lalu bangun ulang
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = PROJECT_ROOT / "db" / "schema.sql"
DB_PATH = PROJECT_ROOT / "db" / "qualitative.db"

# Kolom yang menurut Prinsip Non-Negosiasi §0.2 wajib berstatus 'proposed' secara
# default; verifikasi memeriksanya langsung dari metadata basis data.
STATUS_DEFAULT_TARGETS = ("codes", "categories")


def parse_expected_objects(schema_sql: str) -> tuple[list[str], list[str]]:
    """Mengambil daftar nama tabel dan indeks yang dideklarasikan pada DDL."""
    tables = re.findall(r"CREATE\s+TABLE\s+(\w+)", schema_sql, flags=re.IGNORECASE)
    indexes = re.findall(r"CREATE\s+INDEX\s+(\w+)", schema_sql, flags=re.IGNORECASE)
    return sorted(tables), sorted(indexes)


def apply_schema(conn: sqlite3.Connection, schema_sql: str) -> None:
    conn.executescript(schema_sql)
    conn.commit()


def list_objects(conn: sqlite3.Connection, kind: str) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
        (kind,),
    ).fetchall()
    return [row[0] for row in rows]


def status_default(conn: sqlite3.Connection, table: str) -> str | None:
    for column in conn.execute(f"PRAGMA table_info({table})"):
        if column[1] == "status":
            return column[4]
    return None


def verify(conn: sqlite3.Connection, schema_sql: str) -> bool:
    expected_tables, expected_indexes = parse_expected_objects(schema_sql)
    actual_tables = list_objects(conn, "table")
    actual_indexes = list_objects(conn, "index")

    ok = True

    print(f"Basis data : {DB_PATH}")
    print(f"Skema      : {SCHEMA_PATH}")
    print()
    print(f"{'TABEL':<22} {'STATUS':<10} {'KOLOM':>6} {'BARIS':>6}")
    print("-" * 48)
    for table in expected_tables:
        if table in actual_tables:
            columns = len(conn.execute(f"PRAGMA table_info({table})").fetchall())
            rows = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"{table:<22} {'ADA':<10} {columns:>6} {rows:>6}")
        else:
            ok = False
            print(f"{table:<22} {'HILANG':<10} {'-':>6} {'-':>6}")

    extra_tables = [t for t in actual_tables if t not in expected_tables and t != "sqlite_sequence"]
    if extra_tables:
        ok = False
        print("\nTabel di luar skema: " + ", ".join(extra_tables))

    print()
    print(f"{'INDEKS':<22} {'STATUS':<10}")
    print("-" * 32)
    for index in expected_indexes:
        present = index in actual_indexes
        ok = ok and present
        print(f"{index:<22} {'ADA' if present else 'HILANG':<10}")

    print()
    print("Pemeriksaan invarian:")
    fk_enabled = conn.execute("PRAGMA foreign_keys").fetchone()[0]
    print(f"  {'foreign_keys aktif pada koneksi ini':<36}: {'ya' if fk_enabled else 'tidak'}")
    if not fk_enabled:
        ok = False
    for table in STATUS_DEFAULT_TARGETS:
        default = status_default(conn, table)
        correct = default == "'proposed'"
        ok = ok and correct
        label = f"{table}.status DEFAULT"
        print(f"  {label:<36}: {default} ({'sesuai' if correct else 'TIDAK SESUAI'})")

    violations = conn.execute("PRAGMA foreign_key_check").fetchall()
    print(f"  {'pelanggaran foreign key':<36}: {len(violations)}")
    if violations:
        ok = False

    return ok


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inisialisasi dan verifikasi basis data kualitatif.")
    parser.add_argument("--recreate", action="store_true", help="hapus basis data lama lalu bangun ulang")
    parser.add_argument("--verify-only", action="store_true", help="hanya verifikasi, jangan terapkan skema")
    args = parser.parse_args(argv)

    if not SCHEMA_PATH.exists():
        print(f"Gagal: berkas skema tidak ditemukan di {SCHEMA_PATH}", file=sys.stderr)
        return 1

    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    if args.recreate and not args.verify_only and DB_PATH.exists():
        DB_PATH.unlink()
        print(f"Basis data lama dihapus: {DB_PATH}")

    fresh = not DB_PATH.exists()
    if args.verify_only and fresh:
        print(f"Gagal: {DB_PATH} belum ada, tidak ada yang dapat diverifikasi.", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB_PATH)
    try:
        if not args.verify_only:
            if fresh:
                apply_schema(conn, schema_sql)
                print(f"Skema diterapkan pada basis data baru: {DB_PATH}\n")
            else:
                conn.execute("PRAGMA foreign_keys = ON")
                print(
                    f"Basis data sudah ada, skema tidak diterapkan ulang: {DB_PATH}\n"
                    "Gunakan --recreate bila ingin membangun ulang dari nol.\n"
                )
        else:
            conn.execute("PRAGMA foreign_keys = ON")

        ok = verify(conn, schema_sql)
    finally:
        conn.close()

    print()
    print("Hasil verifikasi: " + ("SELURUH OBJEK SESUAI SKEMA" if ok else "TERDAPAT KETIDAKSESUAIAN"))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
