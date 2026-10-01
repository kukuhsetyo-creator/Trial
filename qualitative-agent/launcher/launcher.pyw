"""Peluncur Agen Analisis Kualitatif.

Berkas ini dijalankan oleh "Mulai Aplikasi" (Windows, macOS, Linux) dan hanya
memakai pustaka standar Python, karena ia berjalan sebelum komponen aplikasi
terpasang. Tugasnya menyiapkan lingkungan pada pemakaian pertama, lalu membuka
aplikasi di peramban, tanpa pernah meminta pemakai mengetik perintah.

Urutan kerja:
    1. memeriksa versi Python (minimal 3.11);
    2. membuat lingkungan terpisah di .venv bila belum ada;
    3. memasang komponen dari requirements.txt hanya bila berkas itu berubah
       sejak pemasangan terakhir (sidik SHA-256 di .venv/.requirements.sha256);
    4. menyiapkan basis data bila db/qualitative.db belum ada;
    5. menjalankan Streamlit yang hanya dapat diakses dari komputer ini
       (127.0.0.1), menunggu sampai siap, lalu membuka peramban.

Bila aplikasi dari peluncuran sebelumnya masih berjalan, peluncur cukup
membukanya kembali di peramban alih-alih menjalankan salinan kedua.

Flag --headless-test menjalankan seluruh urutan tanpa jendela dan tanpa
membuka peramban, lalu berhenti setelah pemeriksaan kesiapan berhasil. Flag
itu hanya untuk verifikasi.

Kode ini sengaja ditulis agar tetap dapat diurai Python versi lama, supaya
pemakai dengan Python terlalu lama mendapat pesan yang jelas, bukan galat.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import queue
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENV = ROOT / ".venv"
LOGS = ROOT / "logs"
REQUIREMENTS = ROOT / "requirements.txt"
HASH_FILE = VENV / ".requirements.sha256"
DB_FILE = ROOT / "db" / "qualitative.db"
STATE_FILE = LOGS / "server.json"

MIN_PYTHON = (3, 11)
HOST = "127.0.0.1"
PORT_RANGE = range(8501, 8600)
READY_TIMEOUT = 120

IS_WINDOWS = os.name == "nt"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if IS_WINDOWS else 0

JUDUL = "Agen Analisis Kualitatif"


class LauncherError(Exception):
    """Kegagalan dengan pesan yang sudah dapat dibaca pemakai awam."""


# --------------------------------------------------------------------------
# Catatan kerja
# --------------------------------------------------------------------------

def catat(pesan: str) -> None:
    LOGS.mkdir(parents=True, exist_ok=True)
    stempel = datetime.datetime.now().isoformat(timespec="seconds")
    with (LOGS / "launcher.log").open("a", encoding="utf-8") as berkas:
        berkas.write(f"{stempel} {pesan}\n")
    try:
        print(pesan, flush=True)
    except (OSError, ValueError, AttributeError):
        # pythonw di Windows tidak memiliki stdout.
        pass


def python_dasar() -> str:
    """Python konsol untuk membuat lingkungan.

    Di Windows peluncur berjalan lewat pythonw.exe yang tidak memiliki konsol.
    Bila pythonw yang membuat lingkungan, proses turunannya (ensurepip) akan
    memunculkan jendela konsol baru. python.exe yang dijalankan dengan
    CREATE_NO_WINDOW memberi konsol tersembunyi yang diwarisi seluruh turunannya.
    """
    dasar = Path(sys.executable)
    if IS_WINDOWS and dasar.name.lower() == "pythonw.exe":
        konsol = dasar.with_name("python.exe")
        if konsol.exists():
            return str(konsol)
    return str(dasar)


def venv_python() -> Path:
    if IS_WINDOWS:
        return VENV / "Scripts" / "python.exe"
    return VENV / "bin" / "python"


def jalankan(perintah: list, log_name: str, judul_log: str) -> int:
    LOGS.mkdir(parents=True, exist_ok=True)
    with (LOGS / log_name).open("ab") as log:
        log.write(f"\n===== {datetime.datetime.now().isoformat(timespec='seconds')} "
                  f"{judul_log} =====\n".encode("utf-8"))
        log.flush()
        proses = subprocess.run(
            perintah, cwd=str(ROOT), stdout=log, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL, creationflags=NO_WINDOW,
        )
    return proses.returncode


# --------------------------------------------------------------------------
# Langkah persiapan
# --------------------------------------------------------------------------

def periksa_python() -> None:
    if sys.version_info < MIN_PYTHON:
        versi = ".".join(str(x) for x in sys.version_info[:3])
        raise LauncherError(
            f"Versi Python di komputer ini ({versi}) terlalu lama. Pasang Python 3.11 "
            "atau yang lebih baru dari python.org, lalu buka aplikasi ini kembali."
        )


def sidik_requirements() -> str:
    return hashlib.sha256(REQUIREMENTS.read_bytes()).hexdigest()


def siapkan_lingkungan(status) -> None:
    pertama_kali = not venv_python().exists()
    if pertama_kali:
        status("Menyiapkan untuk pertama kali, sekitar 3–5 menit. "
               "Biarkan jendela ini terbuka.")
        catat("Membuat lingkungan .venv")
        kode = jalankan([python_dasar(), "-m", "venv", "--clear", str(VENV)],
                        "install.log", "membuat lingkungan")
        if kode != 0 or not venv_python().exists():
            raise LauncherError(
                "Lingkungan aplikasi gagal dibuat. Pada Linux, komponen 'python3-venv' "
                "mungkin perlu dipasang lebih dahulu. Rincian ada di folder logs, "
                "berkas install.log."
            )

    sidik = sidik_requirements()
    tersimpan = HASH_FILE.read_text(encoding="utf-8").strip() if HASH_FILE.exists() else ""
    if sidik == tersimpan:
        catat("Pemasangan dilewati: komponen sudah terpasang dan tidak berubah.")
        return

    if not pertama_kali:
        status("Memperbarui komponen aplikasi, mohon tunggu beberapa menit…")
    catat("Memasang komponen dari requirements.txt")
    kode = jalankan(
        [str(venv_python()), "-m", "pip", "install", "--disable-pip-version-check",
         "-r", str(REQUIREMENTS)],
        "install.log", "memasang komponen",
    )
    if kode != 0:
        raise LauncherError(
            "Pemasangan komponen aplikasi gagal. Pastikan komputer tersambung ke "
            "internet, lalu buka aplikasi ini kembali; pemasangan akan diulang. "
            "Rincian ada di folder logs, berkas install.log."
        )
    HASH_FILE.write_text(sidik, encoding="utf-8")
    catat("Pemasangan komponen selesai.")


def siapkan_basis_data(status) -> None:
    if DB_FILE.exists():
        return
    status("Menyiapkan tempat penyimpanan data…")
    catat("Menginisialisasi basis data")
    kode = jalankan([str(venv_python()), str(ROOT / "src" / "db_init.py")],
                    "install.log", "menyiapkan basis data")
    if kode != 0 or not DB_FILE.exists():
        raise LauncherError(
            "Tempat penyimpanan data gagal disiapkan. Rincian ada di folder logs, "
            "berkas install.log."
        )


# --------------------------------------------------------------------------
# Server
# --------------------------------------------------------------------------

def siap(port: int, batas_waktu: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/_stcore/health",
                                    timeout=batas_waktu) as respons:
            return respons.status == 200
    except OSError:
        return False


def port_bebas() -> int:
    for port in PORT_RANGE:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if not IS_WINDOWS:
                # Tanpa ini, port yang baru dilepas (TIME_WAIT) dianggap terpakai
                # dan aplikasi berpindah port tanpa alasan. Di Windows opsi ini
                # justru mengizinkan berbagi port yang sedang dipakai, jadi dilewati.
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((HOST, port))
            except OSError:
                continue
            return port
    raise LauncherError("Tidak ada saluran kosong untuk menjalankan aplikasi. "
                        "Mulai ulang komputer, lalu coba lagi.")


def server_sebelumnya() -> int | None:
    """Port aplikasi dari peluncuran sebelumnya bila masih berjalan."""
    if not STATE_FILE.exists():
        return None
    try:
        port = int(json.loads(STATE_FILE.read_text(encoding="utf-8"))["port"])
    except (ValueError, KeyError, OSError):
        return None
    return port if siap(port) else None


class Server:
    def __init__(self) -> None:
        self.proses: subprocess.Popen | None = None
        self.port: int | None = None

    @property
    def url(self) -> str:
        return f"http://{HOST}:{self.port}"

    def mulai(self) -> None:
        self.port = port_bebas()
        LOGS.mkdir(parents=True, exist_ok=True)
        log = (LOGS / "app.log").open("ab")
        log.write(f"\n===== {datetime.datetime.now().isoformat(timespec='seconds')} "
                  f"aplikasi dimulai pada port {self.port} =====\n".encode("utf-8"))
        log.flush()
        catat(f"Menjalankan aplikasi di {self.url}")
        self.proses = subprocess.Popen(
            [str(venv_python()), "-m", "streamlit", "run", str(ROOT / "app" / "main.py"),
             "--server.address", HOST, "--server.port", str(self.port),
             "--server.headless", "true", "--browser.gatherUsageStats", "false"],
            cwd=str(ROOT), stdout=log, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL, creationflags=NO_WINDOW,
        )
        log.close()

        batas = time.monotonic() + READY_TIMEOUT
        while time.monotonic() < batas:
            if self.proses.poll() is not None:
                raise LauncherError(
                    "Aplikasi berhenti sebelum sempat terbuka. Rincian ada di folder "
                    "logs, berkas app.log."
                )
            if siap(self.port):
                STATE_FILE.write_text(json.dumps({"port": self.port, "pid": self.proses.pid}),
                                      encoding="utf-8")
                catat(f"Aplikasi siap di {self.url}")
                return
            time.sleep(0.5)
        self.hentikan()
        raise LauncherError("Aplikasi tidak kunjung siap. Tutup jendela ini, lalu "
                            "buka aplikasi kembali.")

    def hentikan(self) -> None:
        if self.proses is not None and self.proses.poll() is None:
            catat("Menghentikan aplikasi")
            self.proses.terminate()
            try:
                self.proses.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proses.kill()
        try:
            STATE_FILE.unlink()
        except OSError:
            pass


def persiapan(status) -> None:
    status("Memeriksa komputer…")
    periksa_python()
    siapkan_lingkungan(status)
    siapkan_basis_data(status)


# --------------------------------------------------------------------------
# Mode tanpa jendela
# --------------------------------------------------------------------------

def jalan_tanpa_jendela(uji: bool) -> int:
    server = Server()
    try:
        port_lama = None if uji else server_sebelumnya()
        if port_lama is not None:
            catat("Aplikasi sudah berjalan; membukanya kembali di peramban.")
            webbrowser.open(f"http://{HOST}:{port_lama}")
            return 0
        persiapan(catat)
        server.mulai()
    except LauncherError as exc:
        catat(f"GAGAL: {exc}")
        server.hentikan()
        return 1

    if uji:
        catat(f"UJI BERHASIL: aplikasi menjawab di {server.url}")
        server.hentikan()
        return 0

    # Tanpa jendela, peluncur dihentikan lewat sinyal. Sinyal diubah menjadi
    # SystemExit agar blok finally menghentikan aplikasi dan tidak meninggalkan
    # proses Streamlit yang tetap berjalan sendiri.
    for nama in ("SIGTERM", "SIGHUP"):
        if hasattr(signal, nama):
            signal.signal(getattr(signal, nama), lambda *_: sys.exit(0))
    webbrowser.open(server.url)
    try:
        server.proses.wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.hentikan()
    return 0


# --------------------------------------------------------------------------
# Mode berjendela
# --------------------------------------------------------------------------

def jalan_berjendela(root, ttk) -> int:
    port_lama = server_sebelumnya()
    if port_lama is not None:
        catat("Aplikasi sudah berjalan; membukanya kembali di peramban.")
        webbrowser.open(f"http://{HOST}:{port_lama}")
        root.destroy()
        return 0

    server = Server()
    antrean: queue.Queue = queue.Queue()

    root.deiconify()
    root.title(JUDUL)
    root.geometry("480x220")
    root.resizable(False, False)

    bingkai = ttk.Frame(root, padding=18)
    bingkai.pack(fill="both", expand=True)
    ttk.Label(bingkai, text=JUDUL, font=("TkDefaultFont", 13, "bold")).pack(anchor="w")
    label = ttk.Label(bingkai, text="Memeriksa komputer…", wraplength=440, justify="left")
    label.pack(anchor="w", pady=(10, 10), fill="x")
    progres = ttk.Progressbar(bingkai, mode="indeterminate")
    progres.pack(fill="x")
    progres.start(12)

    tombol = ttk.Frame(bingkai)
    tombol.pack(fill="x", pady=(14, 0))
    buka = ttk.Button(tombol, text="Buka lagi di peramban", state="disabled",
                      command=lambda: webbrowser.open(server.url))
    buka.pack(side="left")

    def tutup() -> None:
        label.config(text="Menutup aplikasi…")
        root.update_idletasks()
        server.hentikan()
        root.destroy()

    ttk.Button(tombol, text="Tutup aplikasi", command=tutup).pack(side="right")
    root.protocol("WM_DELETE_WINDOW", tutup)

    def kerja() -> None:
        try:
            persiapan(lambda teks: antrean.put(("status", teks)))
            antrean.put(("status", "Membuka aplikasi di peramban…"))
            server.mulai()
            antrean.put(("siap", None))
        except LauncherError as exc:
            catat(f"GAGAL: {exc}")
            antrean.put(("gagal", str(exc)))
        except Exception as exc:  # noqa: BLE001 - selalu tampilkan pesan, jangan diam
            catat(f"GAGAL tak terduga: {exc!r}")
            antrean.put(("gagal", "Terjadi kendala yang tidak terduga. Rincian ada di "
                                   "folder logs, berkas launcher.log."))

    def periksa_antrean() -> None:
        try:
            while True:
                jenis, isi = antrean.get_nowait()
                if jenis == "status":
                    label.config(text=isi)
                elif jenis == "siap":
                    progres.stop()
                    progres.pack_forget()
                    label.config(text="Aplikasi sudah terbuka di peramban. Biarkan jendela "
                                      "ini terbuka selama bekerja; tekan 'Tutup aplikasi' "
                                      "bila sudah selesai.")
                    buka.config(state="normal")
                    webbrowser.open(server.url)
                elif jenis == "gagal":
                    progres.stop()
                    progres.pack_forget()
                    label.config(text=isi)
        except queue.Empty:
            pass
        root.after(200, periksa_antrean)

    threading.Thread(target=kerja, daemon=True).start()
    root.after(200, periksa_antrean)
    root.mainloop()
    server.hentikan()
    return 0


def main(argv: list | None = None) -> int:
    parser = argparse.ArgumentParser(description=JUDUL)
    parser.add_argument("--headless-test", action="store_true",
                        help="uji tanpa jendela dan tanpa peramban, lalu berhenti")
    args = parser.parse_args(argv)

    if args.headless_test:
        return jalan_tanpa_jendela(uji=True)

    try:
        import tkinter as tk
        from tkinter import ttk
        root = tk.Tk()
        root.withdraw()
    except Exception:  # noqa: BLE001 - tkinter tidak tersedia atau tidak ada layar
        catat("Jendela tidak tersedia; berjalan tanpa jendela.")
        return jalan_tanpa_jendela(uji=False)
    return jalan_berjendela(root, ttk)


if __name__ == "__main__":
    sys.exit(main())
