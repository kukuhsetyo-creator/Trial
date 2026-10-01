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
    base = ("Bagian kiri menunjukkan sebaran person measure dan bagian kanan posisi item measure, keduanya pada "
            "penggaris logit yang sama. Makin ke atas, makin tinggi kemampuan person dan makin sulit item-nya. "
            "Tes yang well-targeted memperlihatkan item yang tersebar setinggi kebanyakan person; wilayah tanpa "
            "item berarti kemampuan di wilayah itu kurang terukur.")
    if res.model != "dichotomous":
        base += (" Titik berwarna adalah threshold location tiap item, yaitu titik peralihan dari satu kategori "
                 "jawaban ke kategori berikutnya.")
    return base


CHARTS: list[ChartSpec] = [
    ChartSpec("wright_map", "Wright Map", charts.wright_map, False, _always, _wright_text),
    ChartSpec("icc", "Item Characteristic Curve (ICC)", charts.item_characteristic_curve, True, _always, _text(
        "Garis biru adalah model curve, yaitu peluang menjawab benar (atau expected score) yang diperkirakan "
        "model pada setiap tingkat person measure. Titik oranye adalah observed average kelompok person yang "
        "kemampuannya mirip, dengan garis tegak sebagai rentang ketidakpastian 95%. Bila titik-titik mengikuti "
        "garis, item berperilaku sesuai model; titik yang jauh dari garis menandakan item yang perlu "
        "diperiksa.")),
    ChartSpec("category_curves", "Category Probability Curves", charts.category_probability_curves, True, _poly,
              _text("Setiap kurva menunjukkan peluang memilih satu kategori jawaban pada berbagai tingkat person "
                    "measure. Garis tegak adalah threshold, titik tempat dua kategori bersebelahan sama mungkinnya. "
                    "Pada skala yang berfungsi baik, setiap kategori punya puncak sendiri dan threshold berurutan "
                    "dari kiri ke kanan; garis merah menandai disordered threshold.")),
    ChartSpec("expected_score", "Expected Score Curve", charts.expected_score_curve, True, _poly,
              _text("Kurva menunjukkan expected score pada item ini untuk setiap tingkat person measure. Pita "
                    "berselang-seling menandai rentang measure tempat expected score paling dekat dengan suatu "
                    "kategori. Pita yang sangat sempit berarti kategori itu jarang menjadi skor yang diharapkan "
                    "bagi tingkat kemampuan mana pun.")),
    ChartSpec("test_information", "Test Information Function and SEM", charts.test_information, False, _always,
              _text("Garis biru (sumbu kiri) adalah test information, yaitu seberapa banyak informasi yang diberikan "
                    "tes pada setiap tingkat person measure; makin tinggi, makin presisi. Garis oranye (sumbu "
                    "kanan) adalah standard error of measurement (SEM), kebalikannya: makin rendah, makin presisi. "
                    "Tes paling tepat untuk person yang kemampuannya berada di sekitar puncak garis biru.")),
    ChartSpec("fit_bubble", "Item Fit Bubble Chart", charts.fit_bubble, False, _always,
              _text("Setiap gelembung adalah satu item: posisi mendatar menunjukkan item measure dan posisi tegak "
                    "menunjukkan Infit atau Outfit MNSQ. Item di dalam pita hijau berperilaku sesuai harapan; item "
                    "merah di atas pita underfit (terlalu 'berisik'), di bawah pita overfit (terlalu mudah ditebak). "
                    "Gelembung besar berarti SE item itu besar sehingga estimasinya kurang presisi.")),
    ChartSpec("person_fit", "Person Fit Distribution", charts.person_fit_histogram, False, _always,
              _text("Histogram menunjukkan sebaran Infit dan Outfit MNSQ person. Sebagian besar person seharusnya "
                    "berada di pita hijau di sekitar 1,0. Ekor panjang ke kanan menandakan person dengan pola "
                    "jawaban tak terduga (underfit), misalnya menebak atau menjawab asal.")),
    ChartSpec("pca_contrast", "PCA of Residuals: First Contrast", charts.pca_contrast, False, _always,
              _text("Setiap titik adalah satu item; posisi tegaknya adalah loading pada first contrast, yaitu "
                    "keterkaitan item dengan pola sisa terkuat setelah measure dikeluarkan. Bila item bertitik biru "
                    "(loading positif) dan oranye (loading negatif) membentuk dua kelompok isi yang berbeda, tes "
                    "mungkin mengukur dua hal. First contrast eigenvalue di bawah 2 menandakan pola sisa tersebut "
                    "masih wajar terjadi secara kebetulan.")),
    ChartSpec("dif", "DIF Plot: Item Measure by Group", charts.dif_plot, False, _has_dif,
              _text("Untuk setiap item, titik biru dan oranye menunjukkan item measure bagi masing-masing "
                    "kelompok, dengan garis tegak sebagai rentang ketidakpastian 95%. Bila kedua titik berdekatan, "
                    "item berfungsi sama bagi kedua kelompok. Pita merah menandai item yang DIF contrast-nya cukup "
                    "besar dan bermakna secara statistik sehingga isinya perlu ditelaah.")),
    ChartSpec("q3_heatmap", "Yen's Q3 Matrix", charts.q3_heatmap, False, _always,
              _text("Setiap kotak adalah Q3, yaitu korelasi residual antara dua item. Warna pucat berarti tidak ada "
                    "keterkaitan tambahan; merah pekat berarti dua item saling terkait di luar kemampuan yang "
                    "diukur (local dependence), biru berarti berlawanan arah. Kotak berbingkai hitam adalah "
                    "pasangan yang ditandai dan perlu ditelaah, misalnya karena berasal dari satu wacana.")),
]

SPECS = {c.key: c for c in CHARTS}


def available_charts(res) -> list[ChartSpec]:
    return [c for c in CHARTS if c.applies(res)]


def render(res, key: str, item: str | None = None):
    spec = SPECS[key]
    return spec.func(res, item) if spec.per_item else spec.func(res)


def item_choices(res) -> list[str]:
    """Item yang dapat digambar per item (item yang ikut estimasi)."""
    ei = res.coded.item_extreme == 0
    return [n for n, keep in zip(res.coded.item_names, ei) if keep]


def _safe(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in str(name))


def render_gallery(res, out_dir: str | Path, formats=("png", "svg"), items: list[str] | None = None,
                   dpi: int = 300) -> dict[str, list[Path]]:
    """Simpan semua grafik yang berlaku; grafik per item untuk ``items`` (default semua item)."""
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
