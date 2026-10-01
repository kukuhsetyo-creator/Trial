"""Semua string antarmuka RaschLite dalam satu modul.

Kebijakan bahasa: istilah teknis Rasch (Item, Person, Measure, Separation, Infit MNSQ,
Andrich Threshold, Wright Map, dan sebagainya) dipertahankan dalam bahasa Inggris aslinya,
sedangkan penjelasan, petunjuk, dan navigasi memakai bahasa Indonesia.

Modul ini sengaja murni Python (tanpa Qt) sehingga label kolom juga dapat dipakai
oleh modul laporan/ekspor. Untuk menerjemahkan aplikasi, cukup salin modul ini.
"""

from __future__ import annotations

APP_TITLE = "RaschLite by CSPS"

# --- Langkah wizard ----------------------------------------------------------
STEPS = ["1  Impor Data", "2  Pilih Model", "3  Jalankan", "4  Hasil"]
BTN_BACK = "‹ Kembali"
BTN_NEXT = "Lanjut ›"
BTN_RUN = "Jalankan Analisis ›"
BTN_NEW = "Analisis Baru"

# --- Langkah 1: impor ----------------------------------------------------------
IMPORT_TITLE = "Impor Data"
IMPORT_HELP = (
    "Buka berkas Excel (.xlsx) atau CSV berisi satu baris per person (responden) dan satu kolom per item. "
    "Nilai jawaban harus berupa bilangan bulat (misalnya 0/1 untuk benar/salah atau 1-5 untuk skala)."
)
BTN_OPEN = "Buka Berkas…"
BTN_SAMPLE_DICHO = "Coba dengan Data Contoh: Dichotomous (benar/salah)"
BTN_SAMPLE_POLY = "Coba dengan Data Contoh: Polytomous (skala 1-5)"
OPEN_FILTER = "Data (*.xlsx *.csv);;Excel (*.xlsx);;CSV (*.csv)"
NO_FILE = "Belum ada berkas yang dibuka."
FILE_LOADED = "Berkas: {name} ({rows} baris, {cols} kolom). Pratinjau 20 baris pertama:"
LBL_ID = "Kolom ID person"
LBL_ITEMS = "Kolom item (centang semua item yang dianalisis)"
LBL_GROUP = "Kolom grup untuk DIF (opsional, tepat 2 kategori)"
LBL_MISSING = "Kode missing (pisahkan dengan koma; sel kosong selalu dianggap missing)"
MISSING_PLACEHOLDER = "contoh: 9, 99, -"
NONE_OPTION = "(tidak ada)"
BTN_ALL = "Pilih semua"
BTN_CLEAR = "Kosongkan"
ERR_NO_FILE = "Buka berkas data atau pilih data contoh terlebih dahulu."
ERR_READ = "Berkas tidak dapat dibaca: {error}"
VALID_OK = "Data valid: {n} person dan {k} item siap dianalisis."

# --- Langkah 2: model ----------------------------------------------------------
MODEL_TITLE = "Pilih Model"
DETECTED_DICHO = "Data terdeteksi dichotomous (dua nilai jawaban)."
DETECTED_POLY = "Data terdeteksi polytomous (lebih dari dua kategori jawaban)."
MODEL_DICHO = "Dichotomous Rasch Model"
MODEL_RSM = "Rating Scale Model (Andrich)"
MODEL_PCM = "Partial Credit Model (Masters)"
MODEL_LABELS = {"dichotomous": MODEL_DICHO, "rsm": MODEL_RSM, "pcm": MODEL_PCM}
MODEL_DESC = {
    "dichotomous": "Untuk jawaban benar/salah atau ya/tidak.",
    "rsm": "Semua item berbagi category structure yang sama (cocok untuk angket dengan skala seragam).",
    "pcm": "Setiap item memiliki category structure sendiri (cocok untuk partial credit atau skala yang berbeda).",
}
RECOMMENDED = "Rekomendasi"
LBL_STRICT = "Mode ketat untuk tes high-stakes (rentang MNSQ {lo}-{hi}; default {dlo}-{dhi})"
LBL_DIF = "Jalankan analisis DIF berdasarkan kolom grup '{col}'"
LBL_DIF_NA = "Analisis DIF tidak tersedia (kolom grup tidak dipilih atau tidak memiliki tepat 2 kategori)"
CATEGORY_CHECK_TITLE = "Pemeriksaan kategori sebelum estimasi"
CATEGORY_CHECK_OK = "Semua kategori jawaban terpakai."
DATA_NOTES_TITLE = "Catatan data"

# --- Langkah 3: jalankan -------------------------------------------------------
RUN_TITLE = "Menjalankan Estimasi"
RUN_HELP = "Estimasi JMLE berjalan di latar belakang. Anda dapat membatalkannya kapan saja."
BTN_CANCEL = "Batalkan"
RUN_START = "Memulai estimasi {model} untuk {n} person dan {k} item…"
RUN_ITER = "Iterasi {it}: max logit change {change}; max score residual {resid}"
RUN_DONE = "Selesai dalam {sec} detik. Membuka hasil…"
RUN_CANCELLED = "Estimasi dibatalkan. Anda dapat kembali dan menjalankannya lagi."
RUN_FAILED = "Estimasi gagal: {error}"
RUN_CANCELLING = "Membatalkan…"

# --- Langkah 4: hasil ----------------------------------------------------------
TAB_SUMMARY = "Ringkasan"
TAB_ITEMS = "Item Measures"
TAB_PERSONS = "Person Measures"
TAB_CATEGORIES = "Category Structure"
TAB_DIMENSION = "Dimensionality"
TAB_LOCAL = "Local Dependence"
TAB_DIF = "DIF"
TAB_CHARTS = "Grafik"
TAB_GLOSSARY = "Glosarium"
RESULT_HEADER = "{model} · {n} person · {k} item · {conv}"
CONVERGED_OK = "konvergen dalam {n} iterasi"
CONVERGED_NO = "TIDAK konvergen setelah {n} iterasi"
SUMMARY_1MIN = "Ringkasan 1 Menit"
EXPLANATION = "Penjelasan"
ACTIONS = "Saran tindakan"
TECH_SHOW = "▸ Detail teknis"
TECH_HIDE = "▾ Detail teknis"
TECH_HEAD = ["Statistik", "Nilai", "Kriteria"]
REFERENCES = "Rujukan"
CAUTIONS = "Perhatian"
STATUS_TEXT = {"hijau": "Hijau", "kuning": "Kuning", "merah": "Merah", "abu": "Tidak berlaku"}
NOT_APPLICABLE_CATEGORIES = "Analisis category structure hanya berlaku untuk data polytomous (RSM atau PCM)."
NOT_APPLICABLE_DIF = "Analisis DIF tidak dijalankan. Pilih kolom grup dengan tepat 2 kategori pada langkah Impor Data."
NO_Q3_PAIRS = "Tidak ada pasangan item dengan Q3 di atas batas {cutoff}."
DIMENSION_TEXT = (
    "First contrast eigenvalue: {eig} (batas {lim}). Raw variance explained by measures: {pct}. "
    "Tabel di bawah memuat loading setiap item pada first contrast."
)
LOCAL_TEXT = "Mean Q3: {mean}; batas penanda: {cutoff} (mean Q3 + {rel}). Pasangan item yang ditandai:"
TABLE_HINT = "Klik judul kolom untuk mengurutkan. Baris berwarna menandakan nilai yang perlu diperiksa."

# --- Grafik --------------------------------------------------------------------
LBL_CHART = "Grafik"
LBL_ITEM = "Item"
HOW_TO_READ = "Cara membaca grafik ini"
BTN_SAVE_PNG = "Simpan PNG (300 dpi)…"
BTN_SAVE_SVG = "Simpan SVG…"
SAVE_FILTER_PNG = "Gambar PNG (*.png)"
SAVE_FILTER_SVG = "Gambar SVG (*.svg)"
SAVED = "Tersimpan: {path}"

# --- Label kolom tabel ---------------------------------------------------------
COLUMNS = {
    "item": "Item",
    "person": "Person",
    "group": "Group",
    "status": "Status",
    "score": "Raw Score",
    "count": "Count",
    "max_score": "Max Score",
    "n_categories": "Categories",
    "measure": "Measure (logit)",
    "se": "Model SE",
    "infit_mnsq": "Infit MNSQ",
    "infit_zstd": "Infit ZSTD",
    "outfit_mnsq": "Outfit MNSQ",
    "outfit_zstd": "Outfit ZSTD",
    "ptmea_obs": "PTMEA Corr. (obs.)",
    "ptmea_exp": "PTMEA Corr. (exp.)",
    "flag_misfit": "Misfit",
    "flag_negative_ptmea": "Negative PTMEA",
    "category": "Code",
    "label": "Category",
    "percent": "%",
    "avg_measure": "Observed Average",
    "outfit_expected": "Expected Outfit",
    "outfit_z": "Outfit z",
    "threshold": "Andrich Threshold",
    "threshold_se": "Threshold SE",
    "threshold_location": "Threshold Location",
    "flag_low_count": "Count < 10",
    "flag_disordered_threshold": "Disordered Threshold",
    "flag_disordered_avg": "Disordered Average",
    "flag_outfit_high": "High Outfit",
    "loading": "First Contrast Loading",
    "item_a": "Item A",
    "item_b": "Item B",
    "q3": "Q3",
    "q3_relative": "Relative Q3",
    "measure_a": "Measure Group A",
    "se_a": "SE A",
    "n_a": "n A",
    "measure_b": "Measure Group B",
    "se_b": "SE B",
    "n_b": "n B",
    "contrast": "DIF Contrast",
    "joint_se": "Joint SE",
    "t": "Welch t",
    "df": "df",
    "p": "p",
    "ets_category": "ETS Category",
    "flag_dif": "DIF Flag",
}

#: Kunci glosarium untuk tooltip judul kolom.
COLUMN_GLOSSARY = {
    "item": "item",
    "person": "person",
    "score": "raw_score",
    "measure": "measure",
    "se": "se",
    "infit_mnsq": "infit",
    "outfit_mnsq": "outfit",
    "infit_zstd": "zstd",
    "outfit_zstd": "zstd",
    "ptmea_obs": "ptmeasure",
    "ptmea_exp": "ptmeasure",
    "flag_misfit": "misfit",
    "avg_measure": "observed_average",
    "outfit_expected": "category_outfit",
    "outfit_z": "category_outfit",
    "threshold": "threshold",
    "threshold_location": "threshold",
    "flag_disordered_threshold": "disordered_threshold",
    "flag_disordered_avg": "observed_average",
    "flag_outfit_high": "category_outfit",
    "contrast": "dif",
    "flag_dif": "dif",
    "ets_category": "ets",
    "q3": "q3",
    "q3_relative": "q3",
    "loading": "first_contrast",
    "status": "extreme",
}

#: Kunci glosarium untuk tooltip judul lampu lalu lintas.
LIGHT_GLOSSARY = {
    "reliability": "reliability",
    "item_fit": "mnsq",
    "dimensionality": "unidimensionality",
    "targeting": "targeting",
    "categories": "threshold",
    "dif": "dif",
}

YES = "Ya"

# --- Ekspor dan laporan ---------------------------------------------------------
BTN_EXPORT = "Ekspor Semua (Excel, HTML, PDF, grafik)…"
EXPORT_DIALOG = "Pilih folder tujuan ekspor"
EXPORT_RUNNING = "Mengekspor: {message}"
EXPORT_DONE = "Ekspor selesai ke folder {folder}: {files}."
EXPORT_FAILED = "Ekspor gagal: {error}"
EXPORT_STEP_CHART = "grafik {k} dari {n} ({name})"
EXPORT_STEP_EXCEL = "workbook Excel"
EXPORT_STEP_HTML = "laporan HTML"
EXPORT_STEP_PDF = "laporan PDF"
EXPORT_FILES = {
    "excel": "laporan_raschlite.xlsx",
    "html": "laporan_raschlite.html",
    "pdf": "laporan_raschlite.pdf",
    "charts": "grafik",
}

REPORT_TITLE = "Laporan Analisis Rasch"
REPORT_SUBTITLE = "Dihasilkan oleh {app} versi {version} pada {when}"
REPORT_META = "Informasi analisis"
REPORT_META_ROWS = {
    "source": "Berkas data",
    "model": "Model",
    "persons": "Person (diestimasi / extreme score)",
    "items": "Item (diestimasi / extreme score)",
    "missing": "Missing data",
    "convergence": "Convergence (JMLE)",
    "criteria": "Convergence criteria",
    "fit_range": "MNSQ fit range",
    "bias": "JMLE bias correction (L-1)/L",
    "dif": "Kolom grup DIF",
}
REPORT_TABLES = "Tabel"
REPORT_CHARTS = "Grafik"
REPORT_GLOSSARY = "Glosarium"
REPORT_PER_ITEM_ALL = "Grafik per item ditampilkan untuk semua item."
REPORT_PER_ITEM_FLAGGED = (
    "Grafik per item ditampilkan untuk item yang perlu diperiksa saja; grafik semua item "
    "tersedia di folder '{folder}'."
)
REPORT_PERSONS_MISFIT_ONLY = (
    "Tabel Person Measures di laporan PDF hanya memuat person yang misfit; tabel lengkap ada di "
    "workbook Excel dan laporan HTML."
)
REPORT_NO_ROWS = "Tidak ada baris."
SHEETS = {
    "summary": "Ringkasan",
    "items": "Item Measures",
    "persons": "Person Measures",
    "categories": "Category Structure",
    "dif": "DIF",
    "loadings": "PCA First Contrast",
    "q3": "Q3 Matrix",
    "q3_pairs": "Q3 Flagged Pairs",
    "notes": "Catatan",
    "iterations": "Iteration Log",
    "settings": "Pengaturan",
}
TABLE_TITLES = {
    "items": "Item Measures",
    "persons": "Person Measures",
    "categories": "Category Structure",
    "dif": "Differential Item Functioning (DIF)",
    "loadings": "PCA of Residuals: First Contrast Loadings",
    "q3_pairs": "Local Dependence: Item Pairs with High Q3",
}
NOTE_LEVELS = {"error": "Galat", "warning": "Peringatan", "info": "Info"}
ITER_HEAD = ["Iterasi", "Max logit change", "Max score residual"]
LIGHTS_HEAD = ["Aspek", "Status", "Ringkasan"]
REPORT_TABLE_HINT = "Baris berwarna menandakan nilai yang perlu diperiksa; baris abu-abu menandakan extreme score."
REPORT_TECHNICAL = "Detail teknis"
