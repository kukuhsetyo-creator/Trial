"""Satu-satunya sumber ambang batas interpretasi RaschLite.

Semua modul (engine ``core``, mesin narasi ``interpret``, grafik, laporan)
membaca angka dari berkas ini, sehingga pengguna cukup mengubah satu tempat.
Modul ini sengaja tidak mengimpor apa pun selain pustaka standar agar dapat
dipakai oleh engine statistik yang harus berjalan tanpa Qt.

Rujukan yang belum dapat dipastikan detail bibliografinya ditandai
``[perlu verifikasi]``.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Kecocokan (fit) item dan person
# ---------------------------------------------------------------------------
#: Rentang mean-square "produktif untuk pengukuran" (Linacre, 2002).
MNSQ_PRODUCTIVE = (0.5, 1.5)
#: Rentang ketat untuk tes taruhan tinggi (default dari spesifikasi proyek;
#: lihat catatan pada REFERENCES["wright_linacre_1994"]).
MNSQ_STRICT = (0.7, 1.3)
#: Korelasi point-measure di bawah nilai ini memicu saran memeriksa kunci
#: jawaban atau kemungkinan item reverse-coded.
PTMEASURE_MIN = 0.0

# ---------------------------------------------------------------------------
# Reliabilitas dan separasi
# ---------------------------------------------------------------------------
PERSON_RELIABILITY_GOOD = 0.80
PERSON_SEPARATION_GOOD = 2.0
ITEM_SEPARATION_GOOD = 3.0
ITEM_RELIABILITY_GOOD = 0.90

# ---------------------------------------------------------------------------
# Dimensionalitas dan dependensi lokal
# ---------------------------------------------------------------------------
#: Eigenvalue kontras pertama PCA residual di bawah nilai ini mendukung
#: unidimensionalitas.
CONTRAST_EIGENVALUE_MAX = 2.0
#: Pasangan item ditandai bila Q3 > rata-rata Q3 + nilai ini.
Q3_RELATIVE_CUTOFF = 0.2

# ---------------------------------------------------------------------------
# Differential Item Functioning
# ---------------------------------------------------------------------------
DIF_CONTRAST_MIN = 0.5
DIF_P_MAX = 0.05

# ---------------------------------------------------------------------------
# Fungsi kategori (model politomus)
# ---------------------------------------------------------------------------
CATEGORY_MIN_COUNT = 10


def mnsq_range(strict: bool = False) -> tuple[float, float]:
    """Kembalikan rentang MNSQ yang dipakai untuk flag misfit."""
    return MNSQ_STRICT if strict else MNSQ_PRODUCTIVE


REFERENCES = {
    "linacre_2002_mnsq": (
        "Linacre, J. M. (2002). What do infit and outfit, mean-square and "
        "standardized mean? Rasch Measurement Transactions, 16(2), 878."
    ),
    "wright_linacre_1994": (
        "Wright, B. D., & Linacre, J. M. (1994). Reasonable mean-square fit "
        "values. Rasch Measurement Transactions, 8(3), 370. "
        "[perlu verifikasi: tabel di artikel ini mencantumkan 0.8-1.2 untuk "
        "MCQ taruhan tinggi dan 0.7-1.3 untuk MCQ biasa]"
    ),
    "wright_masters_1982": (
        "Wright, B. D., & Masters, G. N. (1982). Rating scale analysis. "
        "Chicago: MESA Press."
    ),
    "wright_masters_2002_strata": (
        "Wright, B. D., & Masters, G. N. (2002). Number of person or item "
        "strata. Rasch Measurement Transactions, 16(3), 888."
    ),
    "linacre_winsteps_manual": (
        "Linacre, J. M. Winsteps Rasch measurement computer program user's "
        "guide. Beaverton, OR: Winsteps.com. (bagian Reliability and "
        "separation, Dimensionality, DIF, EXTRSCORE=)"
    ),
    "raiche_2005": (
        "Raîche, G. (2005). Critical eigenvalue sizes in standardized residual "
        "principal components analysis. Rasch Measurement Transactions, "
        "19(1), 1012."
    ),
    "christensen_2017": (
        "Christensen, K. B., Makransky, G., & Horton, M. (2017). Critical "
        "values for Yen's Q3: Identification of local dependence in the Rasch "
        "model using residual correlations. Applied Psychological Measurement, "
        "41(3), 178-194."
    ),
    "yen_1984": (
        "Yen, W. M. (1984). Effects of local item dependence on the fit and "
        "equating performance of the three-parameter logistic model. Applied "
        "Psychological Measurement, 8(2), 125-145."
    ),
    "draba_1977": (
        "Draba, R. E. (1977). The identification and interpretation of item "
        "bias (MESA Memorandum No. 25). University of Chicago. "
        "[perlu verifikasi]"
    ),
    "linacre_2002_categories": (
        "Linacre, J. M. (2002). Optimizing rating scale category "
        "effectiveness. Journal of Applied Measurement, 3(1), 85-106."
    ),
    "andrich_1978": (
        "Andrich, D. (1978). A rating formulation for ordered response "
        "categories. Psychometrika, 43(4), 561-573."
    ),
    "masters_1982": (
        "Masters, G. N. (1982). A Rasch model for partial credit scoring. "
        "Psychometrika, 47(2), 149-174."
    ),
    "wright_stone_1979": (
        "Wright, B. D., & Stone, M. H. (1979). Best test design. Chicago: "
        "MESA Press."
    ),
    "wright_douglas_1977": (
        "Wright, B. D., & Douglas, G. A. (1977). Best procedures for "
        "sample-free item analysis. Applied Psychological Measurement, 1(2), "
        "281-295. [perlu verifikasi: artikel sumber faktor koreksi (L-1)/L]"
    ),
    "wilson_hilferty_1931": (
        "Wilson, E. B., & Hilferty, M. M. (1931). The distribution of "
        "chi-square. Proceedings of the National Academy of Sciences, 17(12), "
        "684-688."
    ),
    "welch_1947": (
        "Welch, B. L. (1947). The generalization of 'Student's' problem when "
        "several different population variances are involved. Biometrika, "
        "34(1/2), 28-35."
    ),
    "cronbach_1951": (
        "Cronbach, L. J. (1951). Coefficient alpha and the internal structure "
        "of tests. Psychometrika, 16(3), 297-334."
    ),
    "linacre_2006_variance": (
        "Linacre, J. M. (2006). Data variance explained by Rasch measures. "
        "Rasch Measurement Transactions, 20(1), 1045. [perlu verifikasi]"
    ),
}
