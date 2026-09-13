"""Penyiapan bersama untuk seluruh halaman Streamlit.

Berkas ini hanya mengurus hal-hal teknis antarmuka: path impor, pemuatan
konfigurasi metode, dan komponen tampilan yang dipakai berulang. Tidak ada
logika analisis di sini, dan tidak ada satu pun pernyataan UPDATE terhadap
kolom ``status``; promosi status hanya boleh terjadi lewat
``src/validation/review_queue.py`` atas aksi manusia (CLAUDE.md §2).
"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st
import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.db import DB_PATH, connect  # noqa: E402

METHODS_DIR = PROJECT_ROOT / "config" / "methods"


def db_exists() -> bool:
    return DB_PATH.exists()


def require_db() -> bool:
    """Menampilkan instruksi bila basis data belum diinisialisasi."""
    if db_exists():
        return True
    st.error(
        f"Basis data belum ada di `{DB_PATH.relative_to(PROJECT_ROOT)}`.\n\n"
        "Jalankan lebih dahulu:\n\n```bash\npython src/db_init.py\n```"
    )
    return False


def load_method_configs() -> dict[str, dict]:
    configs: dict[str, dict] = {}
    if not METHODS_DIR.exists():
        return configs
    for path in sorted(METHODS_DIR.glob("*.yaml")):
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as exc:
            st.warning(f"Konfigurasi `{path.name}` gagal diurai: {exc}")
            continue
        if data.get("method"):
            configs[data["method"]] = data
    return configs


def table_count(table: str) -> int:
    conn = connect()
    try:
        return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    finally:
        conn.close()


def pending_module(
    *,
    judul: str,
    modul: list[str],
    langkah: str,
    keterangan: str,
) -> None:
    """Menyatakan bahwa halaman menunggu modul yang belum dibangun.

    Halaman yang modul pendukungnya belum ada sengaja tidak diberi antarmuka
    tiruan. Antarmuka yang tampak berfungsi namun tidak terhubung ke logika
    analisis apa pun lebih berbahaya daripada halaman yang menyatakan dirinya
    belum siap, karena peneliti dapat mengira pekerjaannya tersimpan.
    """
    st.title(judul)
    st.info(
        f"**Halaman ini menunggu modul yang belum dibangun.**\n\n"
        f"Modul yang diperlukan: {', '.join(f'`{m}`' for m in modul)}\n\n"
        f"Urutan pembangunan: {langkah}"
    )
    st.write(keterangan)


def sidebar_footer() -> None:
    st.sidebar.divider()
    st.sidebar.caption(
        "Seluruh kode dan kategori berstatus `proposed` sampai peneliti "
        "mengubahnya lewat antrean peninjauan. Antarmuka ini tidak pernah "
        "mempromosikan status secara otomatis."
    )
