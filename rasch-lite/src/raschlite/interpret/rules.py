"""Satu-satunya sumber ambang batas interpretasi RaschLite.

Semua modul (engine ``core``, mesin narasi ``interpret``, grafik, laporan)
membaca angka dari berkas ini, sehingga pengguna cukup mengubah satu tempat.
Modul ini sengaja hanya memakai pustaka standar agar dapat dipakai oleh engine
statistik yang harus berjalan tanpa Qt.

Status lampu lalu lintas: "hijau" (memenuhi kriteria), "kuning" (perlu
diperiksa), "merah" (masalah serius yang perlu ditangani), "abu" (tidak
berlaku atau tidak dianalisis). Rujukan yang detailnya belum dapat dipastikan
ditandai ``[perlu verifikasi]``.
"""

from __future__ import annotations

GREEN, YELLOW, RED, GRAY = "hijau", "kuning", "merah", "abu"

# ---------------------------------------------------------------------------
# Kecocokan (fit) item dan person
# ---------------------------------------------------------------------------
#: Rentang mean-square "produktif untuk pengukuran" (Linacre, 2002).
MNSQ_PRODUCTIVE = (0.5, 1.5)
#: Rentang ketat untuk tes pilihan ganda taruhan tinggi (Wright & Linacre, 1994).
MNSQ_STRICT = (0.8, 1.2)
#: MNSQ di atas nilai ini "mendistorsi atau merusak sistem pengukuran"
#: (Linacre, 2002) -> lampu merah.
MNSQ_DEGRADING = 2.0
#: Korelasi point-measure di bawah nilai ini memicu saran memeriksa kunci
#: jawaban atau kemungkinan item reverse-coded -> lampu merah.
PTMEASURE_MIN = 0.0

# ---------------------------------------------------------------------------
# Reliabilitas dan separasi
# ---------------------------------------------------------------------------
PERSON_RELIABILITY_GOOD = 0.80
PERSON_SEPARATION_GOOD = 2.0
ITEM_SEPARATION_GOOD = 3.0
ITEM_RELIABILITY_GOOD = 0.90
#: Di bawah nilai ini reliabilitas person tergolong "poor" (Fisher, 2007)
#: -> lampu merah; antara nilai ini dan PERSON_RELIABILITY_GOOD -> kuning.
PERSON_RELIABILITY_POOR = 0.67

# ---------------------------------------------------------------------------
# Dimensionalitas dan dependensi lokal
# ---------------------------------------------------------------------------
#: Eigenvalue kontras pertama PCA residual di bawah nilai ini mendukung
#: unidimensionalitas (Linacre, manual Winsteps; Raîche, 2005).
CONTRAST_EIGENVALUE_MAX = 2.0
#: Eigenvalue >= nilai ini berarti dimensi sekunder sekuat sedikitnya tiga
#: item (manual Winsteps: eigenvalue setara "kekuatan" sekian item) -> merah.
CONTRAST_EIGENVALUE_RED = 3.0
#: Pasangan item ditandai bila Q3 > rata-rata Q3 + nilai ini
#: (Christensen, Makransky & Horton, 2017). Adanya pasangan bertanda membuat
#: lampu dimensionalitas paling baik kuning.
Q3_RELATIVE_CUTOFF = 0.2

# ---------------------------------------------------------------------------
# Kesesuaian target (targeting): |rerata person - rerata item| dalam logit
# ---------------------------------------------------------------------------
#: Di bawah nilai ini -> hijau; antara keduanya -> kuning; >= POOR -> merah.
#: Titik potong 1 dan 2 adalah konvensi yang ditetapkan untuk RaschLite;
#: tabel Fisher (2007) memakai angka 1 dan 2 untuk kriteria targeting
#: [perlu verifikasi: satuan pada tabel asli].
TARGETING_GOOD = 1.0
TARGETING_POOR = 2.0

# ---------------------------------------------------------------------------
# Differential Item Functioning
# ---------------------------------------------------------------------------
DIF_CONTRAST_MIN = 0.5
DIF_P_MAX = 0.05
#: Kategori ETS dalam logit (Zwick, Thayer & Lewis, 1999, sebagaimana dipakai
#: manual Winsteps): C bila |DIF| >= 0.64 dan p(|DIF| <= 0.43) < .05.
#: Item DIF yang memenuhi kategori C -> lampu merah; DIF lain -> kuning.
DIF_ETS_B = 0.43
DIF_ETS_C = 0.64

# ---------------------------------------------------------------------------
# Fungsi kategori (model politomus), pedoman Linacre (2002)
# ---------------------------------------------------------------------------
CATEGORY_MIN_COUNT = 10
#: Pedoman outfit kategori < 2.0. Kategori ditandai hanya bila outfit >= nilai
#: ini DAN melampaui nilai harapan modelnya (lihat core/categories.py).
CATEGORY_OUTFIT_MAX = 2.0
# Threshold atau rata-rata measure yang tidak naik berurutan -> lampu merah;
# kategori < CATEGORY_MIN_COUNT atau outfit kategori tinggi -> kuning.


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
        "values. Rasch Measurement Transactions, 8(3), 370."
    ),
    "fisher_2007": (
        "Fisher, W. P., Jr. (2007). Rating scale instrument quality criteria. "
        "Rasch Measurement Transactions, 21(1), 1095."
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
        "separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)"
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
        "[perlu verifikasi: nomor memorandum]"
    ),
    "zwick_1999": (
        "Zwick, R., Thayer, D. T., & Lewis, C. (1999). An empirical Bayes "
        "approach to Mantel-Haenszel DIF analysis. Journal of Educational "
        "Measurement, 36(1), 1-28."
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
        "Wright, B. D., & Douglas, G. A. (1977). Conditional versus "
        "unconditional procedures for sample-free item analysis. Educational "
        "and Psychological Measurement, 37(3), 573-586."
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
        "Rasch Measurement Transactions, 20(1), 1045."
    ),
}
