"""Gaya visual bersama: palet Okabe-Ito, font, sumbu tenang, dan ekspor.

Palet kategorikal memakai urutan tetap Okabe-Ito (Okabe & Ito, 2008) yang
telah diperiksa dengan validator buta warna (CVD) skill dataviz: semua slot
lolos; oranye, ungu-kemerahan, dan biru langit berkontras < 3:1 terhadap latar
putih sehingga setiap grafik wajib memiliki legenda atau label langsung.
Vermilion dicadangkan sebagai warna status "masalah" dan hijau kebiruan
sebagai warna zona "baik", sehingga tidak dipakai sebagai warna seri pada
grafik yang juga menampilkan status.
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

import matplotlib as mpl
from matplotlib import font_manager
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.figure import Figure

BLACK = "#000000"
ORANGE = "#E69F00"
SKY = "#56B4E9"
GREEN = "#009E73"
YELLOW = "#F0E442"
BLUE = "#0072B2"
VERMILLION = "#D55E00"
PURPLE = "#CC79A7"

#: Urutan seri tetap (tanpa vermilion yang dicadangkan untuk status). Urutan ini
#: lolos validator CVD dengan Delta E >= 8 untuk setiap pasangan bersebelahan;
#: hitam tidak dipakai sebagai seri karena gagal batas kroma.
SERIES = [BLUE, ORANGE, GREEN, SKY, PURPLE]
PROBLEM = VERMILLION
GOOD_ZONE = GREEN

SURFACE = "#FFFFFF"
INK = "#1F1F1F"
INK_SECONDARY = "#4D4D4D"
INK_MUTED = "#7A7A7A"
GRID = "#E6E6E6"
NEUTRAL = "#BDBDBD"

FONT_CANDIDATES = ["Segoe UI", "DejaVu Sans", "Liberation Sans", "Arial"]

#: Peta warna divergen (biru - abu netral - vermilion) untuk Q3.
DIVERGING = LinearSegmentedColormap.from_list("raschlite_div", [BLUE, "#F2F2F2", VERMILLION])


def category_colors(n: int) -> list:
    """Warna untuk n kategori berurutan: Okabe-Ito bila n <= 5, selain itu ramp
    ordinal cividis (dirancang aman bagi buta warna) yang disertai label langsung."""
    if n <= len(SERIES):
        return SERIES[:n]
    cmap = mpl.colormaps["cividis"]
    return [cmap(0.05 + 0.9 * k / (n - 1)) for k in range(n)]


def font_family() -> str:
    available = {f.name for f in font_manager.fontManager.ttflist}
    for name in FONT_CANDIDATES:
        if name in available:
            return name
    return "sans-serif"


def rc() -> dict:
    return {
        "font.family": font_family(),
        "font.size": 9.5,
        "axes.titlesize": 12,
        "axes.titleweight": "bold",
        "axes.titlelocation": "left",
        "axes.labelsize": 9.5,
        "axes.labelcolor": INK_SECONDARY,
        "axes.edgecolor": GRID,
        "axes.linewidth": 0.8,
        "axes.facecolor": SURFACE,
        "axes.grid": True,
        "axes.axisbelow": True,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "grid.color": GRID,
        "grid.linewidth": 0.6,
        "grid.linestyle": "-",
        "xtick.color": INK_MUTED,
        "ytick.color": INK_MUTED,
        "xtick.labelcolor": INK_SECONDARY,
        "ytick.labelcolor": INK_SECONDARY,
        "xtick.major.size": 0,
        "ytick.major.size": 0,
        "lines.linewidth": 2.0,
        "lines.solid_capstyle": "round",
        "lines.solid_joinstyle": "round",
        "legend.frameon": False,
        "legend.fontsize": 8.5,
        "figure.facecolor": SURFACE,
        "savefig.facecolor": SURFACE,
        "svg.fonttype": "none",
    }


@contextmanager
def styled():
    """Konteks rcParams RaschLite; semua grafik dibuat di dalam konteks ini."""
    with mpl.rc_context(rc()):
        yield


def new_figure(width: float = 8.0, height: float = 5.0) -> Figure:
    return Figure(figsize=(width, height), layout="constrained")


def titles(ax, title: str, subtitle: str | None = None) -> None:
    """Judul rata kiri dengan subjudul berwarna redup."""
    ax.set_title(title, loc="left", color=INK, pad=18 if subtitle else 8)
    if subtitle:
        ax.text(0.0, 1.015, subtitle, transform=ax.transAxes, ha="left", va="bottom",
                fontsize=8.5, color=INK_MUTED)


def save_figure(fig: Figure, stem: str | Path, formats=("png", "svg"), dpi: int = 300) -> list[Path]:
    """Simpan grafik sebagai PNG 300 dpi dan/atau SVG; kembalikan daftar berkas."""
    stem = Path(stem)
    stem.parent.mkdir(parents=True, exist_ok=True)
    out = []
    for fmt in formats:
        path = stem.with_suffix(f".{fmt}")
        fig.savefig(path, format=fmt, dpi=dpi if fmt == "png" else None, facecolor=SURFACE)
        out.append(path)
    return out
