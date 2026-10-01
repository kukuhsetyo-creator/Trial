"""Penyiapan bersama untuk seluruh halaman Streamlit.

Berkas ini hanya mengurus hal-hal teknis antarmuka: path impor, pemuatan
konfigurasi metode, dan komponen tampilan yang dipakai berulang. Tidak ada
logika analisis di sini, dan tidak ada satu pun pernyataan UPDATE terhadap
kolom ``status``; promosi status hanya boleh terjadi lewat
``src/validation/review_queue.py`` atas aksi manusia (CLAUDE.md §2).
"""

from __future__ import annotations

import datetime
import os
import re
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.db import DB_PATH, connect  # noqa: E402
from src.env import api_key_tersedia, load_env  # noqa: E402

load_env()

METHODS_DIR = PROJECT_ROOT / "config" / "methods"
LOGS_DIR = PROJECT_ROOT / "logs"
DATA_RAW_DIR = PROJECT_ROOT / "data" / "raw"

KEY_NAME = "ANTHROPIC_API_KEY"
# Kunci Anthropic hanya memuat huruf, angka, tanda hubung, dan garis bawah.
# Pola ketat ini sekaligus mencegah baris baru atau tanda sama dengan ikut
# tertulis ke berkas .env dan merusak isinya.
KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,}$")


def db_exists() -> bool:
    return DB_PATH.exists()


def require_db() -> bool:
    """Menampilkan instruksi bila basis data belum diinisialisasi."""
    if db_exists():
        return True
    st.error(
        "Tempat penyimpanan data belum siap. Tutup aplikasi, lalu buka kembali "
        "lewat Mulai Aplikasi; penyiapannya akan dilakukan otomatis."
    )
    return False


def load_method_configs() -> dict[str, dict]:
    """Membungkus pemuat konfigurasi agar kesalahan tampil sebagai pesan, bukan traceback."""
    from config.loader import ConfigError, load_all_method_configs

    try:
        return load_all_method_configs()
    except ConfigError as exc:
        st.error(f"Konfigurasi metode bermasalah: {exc}")
        return {}


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
        "Semua kode dan tema yang diusulkan AI berstatus usulan sampai Anda "
        "meninjaunya. Aplikasi tidak pernah mengesahkan apa pun secara otomatis."
    )


# --------------------------------------------------------------------------
# Kunci akses Anthropic
# --------------------------------------------------------------------------

def _env_path() -> Path:
    # Dibaca saat dipanggil, bukan saat impor, agar selalu mengikuti src.env.
    import src.env
    return src.env.ENV_PATH


def _baris_env_tanpa_kunci() -> list[str]:
    path = _env_path()
    if not path.exists():
        return []
    return [
        baris for baris in path.read_text(encoding="utf-8").splitlines()
        if not baris.strip().startswith(f"{KEY_NAME}=")
    ]


def _tulis_env(baris: list[str]) -> None:
    """Menulis .env secara atomik dengan izin baca-tulis hanya untuk pemilik."""
    path = _env_path()
    fd, sementara = tempfile.mkstemp(dir=str(path.parent), prefix=".env.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as berkas:
            berkas.write("\n".join(baris) + ("\n" if baris else ""))
        try:
            os.chmod(sementara, 0o600)
        except OSError:
            pass
        os.replace(sementara, path)
    except BaseException:
        try:
            os.unlink(sementara)
        except OSError:
            pass
        raise
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def simpan_kunci(kunci: str) -> None:
    """Menyimpan kunci ke .env dan ke lingkungan proses yang sedang berjalan.

    Kunci tidak pernah ditulis ke basis data, audit trail, maupun berkas log.
    """
    kunci = (kunci or "").strip()
    if not KEY_PATTERN.match(kunci):
        raise ValueError(
            "Kunci tidak dikenali. Salin ulang kunci dari halaman Anthropic secara utuh, "
            "tanpa spasi atau tanda kutip."
        )
    _tulis_env(_baris_env_tanpa_kunci() + [f"{KEY_NAME}={kunci}"])
    os.environ[KEY_NAME] = kunci


def hapus_kunci() -> None:
    _tulis_env(_baris_env_tanpa_kunci())
    os.environ.pop(KEY_NAME, None)


# --------------------------------------------------------------------------
# Catatan galat dan folder data
# --------------------------------------------------------------------------

def catat_galat(konteks: str, exc: BaseException) -> None:
    """Menulis rincian teknis ke logs/app.log, dengan kunci akses disamarkan."""
    teks = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    kunci = os.environ.get(KEY_NAME)
    if kunci:
        teks = teks.replace(kunci, "[kunci disamarkan]")
    try:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        stempel = datetime.datetime.now().isoformat(timespec="seconds")
        with (LOGS_DIR / "app.log").open("a", encoding="utf-8") as berkas:
            berkas.write(f"\n===== {stempel} {konteks} =====\n{teks}")
    except OSError:
        pass


def buka_folder(path: Path) -> str | None:
    """Membuka folder di pengelola berkas sistem. Mengembalikan pesan bila gagal.

    Fungsi ini hanya membuka folder untuk dilihat; ia tidak menulis apa pun.
    """
    try:
        if sys.platform.startswith("win"):
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL)
        else:
            subprocess.Popen(["xdg-open", str(path)], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL)
    except OSError:
        return f"Folder tidak dapat dibuka otomatis. Bukalah secara manual di: {path}"
    return None
