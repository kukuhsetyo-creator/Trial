"""Katalog pesan engine statistik.

Seluruh teks yang dihasilkan ``core`` dan dapat sampai ke pengguna dipusatkan
di sini agar mudah diterjemahkan. Penjelasan berbahasa Indonesia, sedangkan istilah
teknis Rasch (item, person, measure, extreme score, threshold, dan sebagainya)
dipertahankan dalam bahasa Inggris. Placeholder memakai ``str.format``.
"""

UNSUPPORTED_FILE = "Format berkas {suffix} tidak didukung. Gunakan .xlsx atau .csv."
TOO_FEW_ITEMS = "Pilih minimal dua kolom item."
COLUMN_NOT_FOUND = "Kolom berikut tidak ditemukan dalam data: {cols}."
ID_IS_ITEM = "Kolom ID tidak boleh sekaligus dipilih sebagai kolom item."
GROUP_IS_ITEM = "Kolom grup DIF tidak boleh sekaligus dipilih sebagai kolom item."
NON_INTEGER = (
    "Ditemukan {n} nilai yang bukan bilangan bulat pada kolom item, sehingga data "
    "tidak dapat dianalisis. Contoh: {examples}. Perbaiki nilai tersebut atau "
    "daftarkan sebagai kode missing."
)
BAD_VALUE_EXAMPLE = "baris {row} kolom '{col}' berisi '{value}'"
ITEM_NO_VARIANCE = (
    "Item berikut tidak memiliki variasi jawaban (semua person memberi jawaban "
    "yang sama atau kolom kosong) dan dikeluarkan dari analisis: {items}."
)
TOO_FEW_VALID_ITEMS = "Setelah item tanpa variasi dikeluarkan, tersisa kurang dari dua item."
PERSON_NO_RESPONSE = "{n} person tidak memiliki satu pun jawaban dan dikeluarkan dari analisis."
PERSON_HEAVY_MISSING = (
    "{n} person memiliki lebih dari 50% jawaban kosong (contoh: {examples}). "
    "Measure mereka tetap dihitung tetapi kurang presisi (SE lebih besar)."
)
DIF_GROUP_LEVELS = (
    "Kolom grup '{col}' memiliki {k} kategori. Analisis DIF hanya dijalankan bila "
    "kolom grup memiliki tepat 2 kategori, sehingga DIF dinonaktifkan."
)
DIF_GROUP_MISSING = "{n} person tidak memiliki nilai grup dan tidak diikutkan dalam analisis DIF."
DICHOTOMOUS_RECODE = "Data dichotomous dikodekan ulang: nilai {lo} menjadi 0 dan nilai {hi} menjadi 1."
RECOMMEND_DICHOTOMOUS = (
    "Semua jawaban hanya memiliki dua nilai (misalnya benar/salah), sehingga "
    "Dichotomous Rasch Model dipakai."
)
RECOMMEND_RSM = (
    "Semua item memakai rentang skala yang sama ({lo} sampai {hi}). Rating Scale "
    "Model (RSM) disarankan: model ini menganggap jarak antar-pilihan jawaban "
    "(misalnya dari 'setuju' ke 'sangat setuju') sama untuk semua item, sehingga "
    "lebih hemat parameter dan lebih stabil pada sampel kecil."
)
RECOMMEND_PCM = (
    "Rentang skala berbeda antar-item ({examples}). Partial Credit Model (PCM) "
    "disarankan: model ini memberi setiap item struktur kategori sendiri, cocok "
    "untuk soal uraian dengan skor parsial atau angket yang format pilihannya "
    "tidak seragam."
)
RANGE_EXAMPLE = "{items}: {lo}-{hi}"
NOT_DICHOTOMOUS = "Dichotomous Rasch Model hanya dapat dipakai bila data memiliki tepat dua nilai."
UNUSED_CATEGORY_GLOBAL = (
    "Category {cats} tidak pernah dipakai person (rentang data {lo}-{hi}). "
    "Kategori dikodekan ulang menjadi bilangan berurutan tanpa kategori kosong."
)
UNUSED_CATEGORY_ITEM = (
    "Item {item} tidak pernah memakai category {cats}; item ini dianalisis dengan "
    "{k} kategori yang benar-benar terpakai."
)
UNUSED_CATEGORY_ITEM_RSM = (
    "Item {item} tidak pernah memakai category {cats}. Pada RSM category structure "
    "dipakai bersama, sehingga item ini tetap dianalisis dengan skala penuh."
)
COLLAPSE_RSM = (
    "Kategori ujung hanya dipakai oleh person dengan extreme score sehingga threshold-nya "
    "tidak dapat diestimasi. Kategori digabung menjadi: {cats}."
)
COLLAPSE_PCM = (
    "Item {item}: kategori ujung hanya dipakai oleh person dengan extreme score sehingga "
    "threshold-nya tidak dapat diestimasi. Kategori digabung menjadi: {cats}."
)
PCM_EXTREME_ITEM = (
    "Item berikut hanya bervariasi pada person dengan extreme score sehingga "
    "category structure-nya tidak dapat diestimasi pada PCM, dan dikeluarkan: {items}."
)
ITEM_NOT_ESTIMABLE = "Item berikut tidak dijawab oleh person non-extreme dan tidak dapat diestimasi: {items}."
PERSON_NOT_ESTIMABLE = (
    "{n} person hanya menjawab item yang tidak dapat diestimasi sehingga measure "
    "mereka tidak dihitung (contoh: {examples})."
)
EXTREME_PERSONS = (
    "{n} person memiliki extreme score ({n_min} minimum, {n_max} maksimum). "
    "Mereka tidak ikut estimasi parameter dan diberi measure dengan penyesuaian skor 0,3 poin."
)
EXTREME_ITEMS = (
    "Item berikut memiliki extreme score di antara person non-extreme dan diberi "
    "measure dengan penyesuaian skor 0,3 poin: {items}."
)
TOO_FEW_NONEXTREME = (
    "Setelah extreme score disisihkan, tersisa kurang dari dua person atau dua item "
    "yang dapat diestimasi."
)
NOT_CONVERGED = (
    "PERINGATAN: estimasi JMLE TIDAK konvergen setelah {n} iterasi (max logit change "
    "{change:.5f}, max score residual {resid:.4f}). Seluruh hasil perlu ditafsirkan "
    "dengan sangat hati-hati."
)
CONVERGED = "Estimasi JMLE konvergen setelah {n} iterasi."
CANCELLED = "Estimasi dibatalkan oleh pengguna."
BIAS_CORRECTION = (
    "Item measure dan threshold dikoreksi dari JMLE bias dengan faktor (L-1)/L = {factor:.4f} "
    "(L = {L} item). Statistik fit dihitung dari estimasi sebelum koreksi."
)
DIF_TOO_FEW = "Grup '{group}' memiliki kurang dari dua person non-extreme sehingga DIF tidak dihitung."
ALPHA_FEW_COMPLETE = (
    "Cronbach's alpha dihitung dari {n} person dengan jawaban lengkap "
    "(person dengan missing data tidak diikutkan)."
)
