"""Membuat paket ZIP siap bagi pemakai awam.

Hasil: dist/AgenKualitatif-YYYYMMDD.zip, berisi satu folder AgenKualitatif/ dengan
hanya berkas yang diperlukan untuk menjalankan aplikasi. Lingkungan terpasang,
kunci akses, basis data, data penelitian, catatan audit, log, dan berkas uji
tidak pernah ikut terbungkus.

Izin eksekusi berkas (misalnya Mulai Aplikasi.app/Contents/MacOS/run dan
mulai-aplikasi.sh) dipertahankan di dalam ZIP agar tetap dapat dijalankan
setelah diekstrak di macOS dan Linux.

Pemakaian: python tools/buat_paket.py
"""

from __future__ import annotations

import datetime
import sys
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
NAMA_FOLDER = "AgenKualitatif"

# Direktori yang dikecualikan seluruhnya, relatif terhadap akar proyek.
DIREKTORI_DIKECUALIKAN = {".venv", "logs", "dist", "tests", "tools"}
# Direktori yang isinya dikecualikan, kecuali penanda .gitkeep.
HANYA_GITKEEP = {"data/raw", "data/processed"}


def dikecualikan(relatif: PurePosixPath) -> bool:
    bagian = relatif.parts
    if bagian[0] in DIREKTORI_DIKECUALIKAN:
        return True
    if "__pycache__" in bagian or relatif.suffix == ".pyc":
        return True
    if relatif.name == ".env" or (relatif.name.startswith(".env.") and relatif.name != ".env.example"):
        return True
    if relatif.parent == PurePosixPath("db") and relatif.suffix in (".db", ".db-journal", ".db-wal", ".db-shm"):
        return True
    if relatif.parent == PurePosixPath("audit_trail") and relatif.suffix == ".jsonl":
        return True
    induk = str(relatif.parent)
    if any(induk == d or induk.startswith(d + "/") for d in HANYA_GITKEEP):
        return relatif.name != ".gitkeep"
    return False


def kumpulkan() -> list[Path]:
    berkas = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        relatif = PurePosixPath(path.relative_to(ROOT).as_posix())
        if not dikecualikan(relatif):
            berkas.append(path)
    return berkas


def buat_paket() -> Path:
    DIST.mkdir(exist_ok=True)
    tujuan = DIST / f"{NAMA_FOLDER}-{datetime.date.today():%Y%m%d}.zip"
    with zipfile.ZipFile(tujuan, "w", compression=zipfile.ZIP_DEFLATED) as arsip:
        for path in kumpulkan():
            nama = f"{NAMA_FOLDER}/{path.relative_to(ROOT).as_posix()}"
            info = zipfile.ZipInfo.from_file(path, arcname=nama)
            info.compress_type = zipfile.ZIP_DEFLATED
            arsip.writestr(info, path.read_bytes())
    return tujuan


if __name__ == "__main__":
    hasil = buat_paket()
    with zipfile.ZipFile(hasil) as arsip:
        jumlah = len(arsip.namelist())
    print(f"Paket dibuat: {hasil} ({jumlah} berkas, {hasil.stat().st_size // 1024} KB)")
    sys.exit(0)
