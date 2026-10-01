"""Palet warna RaschLite: satu sumber untuk GUI, grafik, dan laporan.

Gaya warna mengikuti identitas visual deck CSPS (latar krem, kartu putih hangat,
tinta cokelat tua, aksen bronze dan navy). Warna seri grafik diturunkan dari
keluarga warna deck yang sama (navy, ochre, sky, plum, sage) dengan kroma sedikit
dinaikkan, lalu divalidasi dengan validator buta warna (CVD) skill dataviz: semua
pasangan bersebelahan lolos dengan Delta E >= 10 (deuteranopia). Ochre berkontras
< 3:1 terhadap latar putih, sehingga setiap grafik wajib memiliki legenda atau
label langsung.
"""

from __future__ import annotations

# --- Permukaan dan tinta (deck CSPS) ------------------------------------------
BACKGROUND = "#F7F3EE"  # latar krem
CARD = "#FFFDF9"  # kartu / panel
SAND = "#EEE6DC"  # chip, header tabel, baris redup
LINE = "#E3D8CB"  # garis tipis
LINE_STRONG = "#D9CBBB"
INK = "#2A2522"  # teks utama
INK_SECONDARY = "#4E443D"
INK_MUTED = "#6B5E54"
BRONZE = "#7A5638"  # label kecil berhuruf kapital, aksen
BRONZE_LIGHT = "#A27A5C"
NAVY = "#1F2F45"  # pita gelap / tombol utama
NAVY_TEXT = "#F4EFE8"
SAND_ON_NAVY = "#E9D3B8"
TERRA_HEAD = "#D8A696"  # header tabel bergaya deck
FLAG_ROW = "#F4DED5"  # baris yang perlu diperiksa (terracotta pucat)
MUTED_ROW = SAND  # baris skor ekstrem / tidak diestimasi

# --- Status (lampu lalu lintas) ----------------------------------------------
STATUS = {"hijau": "#5E8C7A", "kuning": "#C99A3B", "merah": "#A8401F", "abu": "#B5A99C"}
STATUS_TINT = {"hijau": "#DCE8E2", "kuning": "#F6EAD0", "merah": "#F4DED5", "abu": "#EEE6DC"}

# --- Banner ---------------------------------------------------------------------
BANNER = {
    "info": ("#EEF4F8", "#A7DAF2"),
    "warning": ("#FBF1DE", "#E2C27A"),
    "error": ("#F4DED5", "#D8A696"),
}

# --- Grafik ---------------------------------------------------------------------
CHART_BG = "#FFFFFF"  # latar plot putih bersih untuk publikasi
CHART_GRID = "#EAE2D8"
CHART_AXIS = LINE_STRONG
NAVY_SERIES = "#34589A"
OCHRE = "#D08A2E"
SKY = "#2A9AD6"
PLUM = "#9C4A85"
SAGE = "#3C9A7C"
#: Urutan seri tetap (lolos validator CVD).
SERIES = [NAVY_SERIES, OCHRE, SKY, PLUM, SAGE]
PROBLEM = STATUS["merah"]  # sorotan masalah (rust)
GOOD_ZONE = STATUS["hijau"]  # zona "baik" (sage)
NEUTRAL = "#BFB2A4"
DIVERGING = [NAVY_SERIES, "#F3EEE7", PROBLEM]  # Q3: negatif - netral - positif
