"""Registri grafik, teks "Cara membaca grafik ini", dan ekspor seluruh grafik."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import charts
from .style import save_figure


@dataclass(frozen=True)
class ChartSpec:
    key: str
    title: str
    func: Callable
    per_item: bool
    applies: Callable[[object], bool]
    how_to_read: Callable[[object], str]


def _always(res) -> bool:
    return True


def _poly(res) -> bool:
    return res.model != "dichotomous"


def _has_dif(res) -> bool:
    return res.dif is not None and not res.dif.empty


def _text(s: str) -> Callable[[object], str]:
    return lambda res: s


def _wright_text(res) -> str:
    base = ("Bagian kiri menunjukkan sebaran responden dan bagian kanan posisi butir, keduanya pada "
            "penggaris logit yang sama. Makin ke atas, makin tinggi kemampuan responden dan makin sulit "
            "butirnya. Tes yang tepat sasaran memperlihatkan butir yang tersebar setinggi kebanyakan "
            "responden; wilayah tanpa butir berarti kemampuan di wilayah itu kurang terukur.")
    if res.model != "dichotomous":
        base += (" Titik berwarna adalah threshold tiap butir, yaitu titik peralihan dari satu kategori "
                 "jawaban ke kategori berikutnya.")
    return base


CHARTS: list[ChartSpec] = [
    ChartSpec("wright_map", "Peta Wright", charts.wright_map, False, _always, _wright_text),
    ChartSpec("icc", "Kurva Karakteristik Butir", charts.item_characteristic_curve, True, _always, _text(
        "Garis biru menunjukkan peluang menjawab benar (atau skor harapan) yang diperkirakan model pada "
        "setiap tingkat kemampuan. Titik oranye adalah rata-rata jawaban kelompok responden yang "
        "kemampuannya mirip, dengan garis tegak sebagai rentang ketidakpastian 95%. Bila titik-titik "
        "mengikuti garis, butir berperilaku sesuai model; titik yang jauh dari garis menandakan butir "
        "yang perlu diperiksa.")),
    ChartSpec("category_curves", "Kurva Peluang Kategori", charts.category_probability_curves, True, _poly,
              _text("Setiap kurva menunjukkan peluang memilih satu kategori jawaban pada berbagai tingkat "
                    "kemampuan. Garis tegak adalah threshold, titik tempat dua kategori bersebelahan sama "
                    "mungkinnya. Pada skala yang berfungsi baik, setiap kategori punya puncak sendiri dan "
                    "threshold berurutan dari kiri ke kanan; garis merah menandai threshold yang tidak "
                    "berurutan.")),
    ChartSpec("expected_score", "Kurva Skor Harapan", charts.expected_score_curve, True, _poly,
              _text("Kurva menunjukkan skor yang diharapkan pada butir ini untuk setiap tingkat kemampuan. "
                    "Pita berselang-seling menandai rentang kemampuan tempat skor harapan paling dekat dengan "
                    "suatu kategori. Pita yang sangat sempit berarti kategori itu jarang menjadi skor yang "
                    "diharapkan bagi tingkat kemampuan mana pun.")),
    ChartSpec("test_information", "Fungsi Informasi Tes dan SEM", charts.test_information, False, _always,
              _text("Garis biru (sumbu kiri) menunjukkan seberapa banyak informasi yang diberikan tes pada "
                    "setiap tingkat kemampuan; makin tinggi, makin presisi. Garis oranye (sumbu kanan) adalah "
                    "galat baku pengukuran, kebalikannya: makin rendah, makin presisi. Tes paling tepat untuk "
                    "responden yang kemampuannya berada di sekitar puncak garis biru.")),
    ChartSpec("fit_bubble", "Peta Kecocokan Butir", charts.fit_bubble, False, _always,
              _text("Setiap gelembung adalah satu butir: posisi mendatar menunjukkan kesulitan dan posisi tegak "
                    "menunjukkan nilai kecocokan (MNSQ). Butir di dalam pita hijau berperilaku sesuai harapan; "
                    "butir merah di atas pita terlalu 'berisik', di bawah pita terlalu mudah ditebak. "
                    "Gelembung besar berarti estimasi butir itu kurang presisi.")),
    ChartSpec("person_fit", "Distribusi Kecocokan Responden", charts.person_fit_histogram, False, _always,
              _text("Histogram menunjukkan sebaran nilai kecocokan responden. Sebagian besar responden "
                    "seharusnya berada di pita hijau di sekitar 1,0. Ekor panjang ke kanan menandakan "
                    "responden dengan pola jawaban tak terduga, misalnya menebak atau menjawab asal.")),
    ChartSpec("pca_contrast", "Kontras Pertama PCA Residual", charts.pca_contrast, False, _always,
              _text("Setiap titik adalah satu butir; posisi tegaknya menunjukkan keterkaitan butir dengan pola "
                    "sisa terkuat setelah kemampuan utama dikeluarkan. Bila butir bertitik biru dan oranye "
                    "membentuk dua kelompok isi yang berbeda, tes mungkin mengukur dua hal. Eigenvalue di "
                    "bawah 2 menandakan pola sisa tersebut masih wajar terjadi secara kebetulan.")),
    ChartSpec("dif", "Kesulitan Butir per Kelompok (DIF)", charts.dif_plot, False, _has_dif,
              _text("Untuk setiap butir, titik biru dan oranye menunjukkan kesulitannya bagi masing-masing "
                    "kelompok, dengan garis tegak sebagai rentang ketidakpastian 95%. Bila kedua titik "
                    "berdekatan, butir berfungsi sama bagi kedua kelompok. Pita merah menandai butir yang "
                    "perbedaannya cukup besar dan bermakna secara statistik sehingga isinya perlu ditelaah.")),
    ChartSpec("q3_heatmap", "Matriks Yen's Q3", charts.q3_heatmap, False, _always,
              _text("Setiap kotak menunjukkan keterkaitan sisa jawaban antara dua butir. Warna pucat berarti "
                    "tidak ada keterkaitan tambahan; merah pekat berarti dua butir saling terkait di luar "
                    "kemampuan yang diukur, biru berarti berlawanan arah. Kotak berbingkai hitam adalah "
                    "pasangan yang ditandai dan perlu ditelaah, misalnya karena berasal dari satu wacana.")),
]

SPECS = {c.key: c for c in CHARTS}


def available_charts(res) -> list[ChartSpec]:
    return [c for c in CHARTS if c.applies(res)]


def render(res, key: str, item: str | None = None):
    spec = SPECS[key]
    return spec.func(res, item) if spec.per_item else spec.func(res)


def item_choices(res) -> list[str]:
    """Butir yang dapat digambar per item (butir yang ikut estimasi)."""
    ei = res.coded.item_extreme == 0
    return [n for n, keep in zip(res.coded.item_names, ei) if keep]


def _safe(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in str(name))


def render_gallery(res, out_dir: str | Path, formats=("png", "svg"), items: list[str] | None = None,
                   dpi: int = 300) -> dict[str, list[Path]]:
    """Simpan semua grafik yang berlaku; grafik per butir untuk ``items`` (default semua butir)."""
    out_dir = Path(out_dir)
    written: dict[str, list[Path]] = {}
    targets = items if items is not None else item_choices(res)
    for spec in available_charts(res):
        jobs = [(t, f"{spec.key}_{_safe(t)}") for t in targets] if spec.per_item else [(None, spec.key)]
        for item, stem in jobs:
            fig = render(res, spec.key, item)
            written.setdefault(spec.key, []).extend(save_figure(fig, out_dir / stem, formats, dpi))
            fig.clear()
    return written
