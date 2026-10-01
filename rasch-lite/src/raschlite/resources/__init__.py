"""Sumber daya bawaan (dataset contoh)."""

from __future__ import annotations

from pathlib import Path

SAMPLE_DIR = Path(__file__).resolve().parent / "sample_data"
#: Logo CSPS (dari deck CSPS) dan ikon aplikasi turunannya.
BRAND_DIR = Path(__file__).resolve().parent / "brand"
LOGO_PATH = BRAND_DIR / "csps_logo.png"
ICON_PATH = BRAND_DIR / "raschlite_icon.png"

#: Dataset contoh beserta kolom yang dipilih otomatis saat dimuat.
SAMPLES = {
    "dichotomous": {"file": "contoh_dikotomus.csv", "id": "ID", "group": "Jenis_Kelamin"},
    "polytomous": {"file": "contoh_politomus.csv", "id": "ID", "group": "Jenis_Kelamin"},
}


def sample_path(kind: str) -> Path:
    return SAMPLE_DIR / SAMPLES[kind]["file"]
