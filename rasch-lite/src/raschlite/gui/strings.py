"""Semua string antarmuka RaschLite dalam satu modul (bahasa Indonesia).

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
    "Buka berkas Excel (.xlsx) atau CSV berisi satu baris per responden dan satu kolom per butir. "
    "Nilai jawaban harus berupa bilangan bulat (misalnya 0/1 untuk benar/salah atau 1-5 untuk skala)."
)
BTN_OPEN = "Buka Berkas…"
BTN_SAMPLE_DICHO = "Coba dengan Data Contoh: Dikotomus"
BTN_SAMPLE_POLY = "Coba dengan Data Contoh: Politomus (5 kategori)"
OPEN_FILTER = "Data (*.xlsx *.csv);;Excel (*.xlsx);;CSV (*.csv)"
NO_FILE = "Belum ada berkas yang dibuka."
FILE_LOADED = "Berkas: {name} ({rows} baris, {cols} kolom). Pratinjau 20 baris pertama:"
LBL_ID = "Kolom ID responden"
LBL_ITEMS = "Kolom butir (centang semua butir yang dianalisis)"
LBL_GROUP = "Kolom grup untuk DIF (opsional, tepat 2 kategori)"
LBL_MISSING = "Kode missing (pisahkan dengan koma; sel kosong selalu dianggap missing)"
MISSING_PLACEHOLDER = "contoh: 9, 99, -"
NONE_OPTION = "(tidak ada)"
BTN_ALL = "Pilih semua"
BTN_CLEAR = "Kosongkan"
ERR_NO_FILE = "Buka berkas data atau pilih data contoh terlebih dahulu."
ERR_READ = "Berkas tidak dapat dibaca: {error}"
VALID_OK = "Data valid: {n} responden dan {k} butir siap dianalisis."

# --- Langkah 2: model ----------------------------------------------------------
MODEL_TITLE = "Pilih Model"
DETECTED_DICHO = "Data terdeteksi dikotomus (dua nilai jawaban)."
DETECTED_POLY = "Data terdeteksi politomus (lebih dari dua kategori jawaban)."
MODEL_DICHO = "Rasch dikotomus"
MODEL_RSM = "Rating Scale Model (Andrich)"
MODEL_PCM = "Partial Credit Model (Masters)"
MODEL_LABELS = {"dichotomous": MODEL_DICHO, "rsm": MODEL_RSM, "pcm": MODEL_PCM}
MODEL_DESC = {
    "dichotomous": "Untuk jawaban benar/salah atau ya/tidak.",
    "rsm": "Semua butir berbagi struktur kategori yang sama (cocok untuk angket dengan skala seragam).",
    "pcm": "Setiap butir memiliki struktur kategori sendiri (cocok untuk skor parsial atau skala yang berbeda).",
}
RECOMMENDED = "Rekomendasi"
LBL_STRICT = "Mode ketat untuk tes taruhan tinggi (rentang MNSQ {lo}-{hi}; default {dlo}-{dhi})"
LBL_DIF = "Jalankan analisis DIF berdasarkan kolom grup '{col}'"
LBL_DIF_NA = "Analisis DIF tidak tersedia (kolom grup tidak dipilih atau tidak memiliki tepat 2 kategori)"
CATEGORY_CHECK_TITLE = "Pemeriksaan kategori sebelum estimasi"
CATEGORY_CHECK_OK = "Semua kategori jawaban terpakai."
DATA_NOTES_TITLE = "Catatan data"

# --- Langkah 3: jalankan -------------------------------------------------------
RUN_TITLE = "Menjalankan Estimasi"
RUN_HELP = "Estimasi JMLE berjalan di latar belakang. Anda dapat membatalkannya kapan saja."
BTN_CANCEL = "Batalkan"
RUN_START = "Memulai estimasi {model} untuk {n} responden dan {k} butir…"
RUN_ITER = "Iterasi {it}: perubahan maks {change} logit; residual skor maks {resid}"
RUN_DONE = "Selesai dalam {sec} detik. Membuka hasil…"
RUN_CANCELLED = "Estimasi dibatalkan. Anda dapat kembali dan menjalankannya lagi."
RUN_FAILED = "Estimasi gagal: {error}"
RUN_CANCELLING = "Membatalkan…"

# --- Langkah 4: hasil ----------------------------------------------------------
TAB_SUMMARY = "Ringkasan"
TAB_ITEMS = "Butir"
TAB_PERSONS = "Responden"
TAB_CATEGORIES = "Kategori"
TAB_DIMENSION = "Dimensionalitas"
TAB_LOCAL = "Dependensi Lokal"
TAB_DIF = "DIF"
TAB_CHARTS = "Grafik"
TAB_GLOSSARY = "Glosarium"
RESULT_HEADER = "{model} · {n} responden · {k} butir · {conv}"
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
NOT_APPLICABLE_CATEGORIES = "Analisis kategori hanya berlaku untuk data politomus (RSM atau PCM)."
NOT_APPLICABLE_DIF = "Analisis DIF tidak dijalankan. Pilih kolom grup dengan tepat 2 kategori pada langkah Impor Data."
NO_Q3_PAIRS = "Tidak ada pasangan butir dengan Q3 di atas batas {cutoff}."
DIMENSION_TEXT = (
    "Eigenvalue kontras pertama: {eig} (batas {lim}). Varians data yang dijelaskan measure: {pct}. "
    "Tabel di bawah memuat loading setiap butir pada kontras pertama."
)
LOCAL_TEXT = "Rata-rata Q3: {mean}; batas penanda: {cutoff} (rata-rata + {rel}). Pasangan yang ditandai:"
TABLE_HINT = "Klik judul kolom untuk mengurutkan. Baris berwarna menandakan nilai yang perlu diperiksa."

# --- Grafik --------------------------------------------------------------------
LBL_CHART = "Grafik"
LBL_ITEM = "Butir"
HOW_TO_READ = "Cara membaca grafik ini"
BTN_SAVE_PNG = "Simpan PNG (300 dpi)…"
BTN_SAVE_SVG = "Simpan SVG…"
SAVE_FILTER_PNG = "Gambar PNG (*.png)"
SAVE_FILTER_SVG = "Gambar SVG (*.svg)"
SAVED = "Tersimpan: {path}"

# --- Label kolom tabel ---------------------------------------------------------
COLUMNS = {
    "item": "Butir",
    "person": "Responden",
    "group": "Grup",
    "status": "Status",
    "score": "Skor",
    "count": "Jumlah respons",
    "max_score": "Skor maks",
    "n_categories": "Kategori",
    "measure": "Measure (logit)",
    "se": "SE",
    "infit_mnsq": "Infit MNSQ",
    "infit_zstd": "Infit ZSTD",
    "outfit_mnsq": "Outfit MNSQ",
    "outfit_zstd": "Outfit ZSTD",
    "ptmea_obs": "PTMEA teramati",
    "ptmea_exp": "PTMEA harapan",
    "flag_misfit": "Misfit",
    "flag_negative_ptmea": "PTMEA negatif",
    "category": "Kode",
    "label": "Kategori",
    "percent": "%",
    "avg_measure": "Rerata measure",
    "outfit_expected": "Outfit harapan",
    "outfit_z": "Outfit z",
    "threshold": "Andrich threshold",
    "threshold_se": "SE threshold",
    "threshold_location": "Lokasi threshold",
    "flag_low_count": "< 10 obs.",
    "flag_disordered_threshold": "Threshold tak berurutan",
    "flag_disordered_avg": "Rerata tak naik",
    "flag_outfit_high": "Outfit tinggi",
    "loading": "Loading kontras 1",
    "item_a": "Butir A",
    "item_b": "Butir B",
    "q3": "Q3",
    "q3_relative": "Q3 relatif",
    "measure_a": "Measure grup A",
    "se_a": "SE A",
    "n_a": "n A",
    "measure_b": "Measure grup B",
    "se_b": "SE B",
    "n_b": "n B",
    "contrast": "Kontras DIF",
    "joint_se": "SE gabungan",
    "t": "t Welch",
    "df": "df",
    "p": "p",
    "ets_category": "ETS",
    "flag_dif": "DIF",
}

#: Kunci glosarium untuk tooltip judul kolom.
COLUMN_GLOSSARY = {
    "measure": "measure",
    "se": "se",
    "infit_mnsq": "infit",
    "outfit_mnsq": "outfit",
    "infit_zstd": "zstd",
    "outfit_zstd": "zstd",
    "ptmea_obs": "ptmeasure",
    "ptmea_exp": "ptmeasure",
    "threshold": "threshold",
    "threshold_location": "threshold",
    "contrast": "dif",
    "flag_dif": "dif",
    "q3": "q3",
    "q3_relative": "q3",
    "loading": "unidimensionality",
    "status": "extreme",
}

#: Kunci glosarium untuk tooltip judul lampu lalu lintas.
LIGHT_GLOSSARY = {
    "reliability": "reliability",
    "item_fit": "mnsq",
    "dimensionality": "unidimensionality",
    "targeting": "logit",
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
    "persons": "Responden (dianalisis / ekstrem)",
    "items": "Butir (dianalisis / ekstrem)",
    "missing": "Data hilang",
    "convergence": "Konvergensi",
    "criteria": "Kriteria konvergensi",
    "fit_range": "Rentang MNSQ",
    "bias": "Faktor koreksi bias (L-1)/L",
    "dif": "Kolom grup DIF",
}
REPORT_TABLES = "Tabel"
REPORT_CHARTS = "Grafik"
REPORT_GLOSSARY = "Glosarium"
REPORT_PER_ITEM_ALL = "Grafik per butir ditampilkan untuk semua butir."
REPORT_PER_ITEM_FLAGGED = (
    "Grafik per butir ditampilkan untuk butir yang perlu diperiksa saja; grafik semua butir "
    "tersedia di folder '{folder}'."
)
REPORT_PERSONS_MISFIT_ONLY = (
    "Tabel responden di laporan PDF hanya memuat responden yang misfit; tabel lengkap ada di "
    "workbook Excel dan laporan HTML."
)
REPORT_NO_ROWS = "Tidak ada baris."
SHEETS = {
    "summary": "Ringkasan",
    "items": "Butir",
    "persons": "Responden",
    "categories": "Kategori",
    "dif": "DIF",
    "loadings": "Kontras PCA",
    "q3": "Matriks Q3",
    "q3_pairs": "Pasangan Q3",
    "notes": "Catatan",
    "iterations": "Log Iterasi",
    "settings": "Pengaturan",
}
TABLE_TITLES = {
    "items": "Statistik butir",
    "persons": "Statistik responden",
    "categories": "Fungsi kategori",
    "dif": "Differential Item Functioning",
    "loadings": "Loading kontras pertama PCA residual",
    "q3_pairs": "Pasangan butir dengan Q3 tinggi",
}
NOTE_LEVELS = {"error": "Galat", "warning": "Peringatan", "info": "Info"}
ITER_HEAD = ["Iterasi", "Perubahan maks (logit)", "Residual skor maks"]
LIGHTS_HEAD = ["Aspek", "Status", "Ringkasan"]
REPORT_TABLE_HINT = "Baris berwarna menandakan nilai yang perlu diperiksa; baris abu-abu menandakan skor ekstrem."
REPORT_TECHNICAL = "Detail teknis"
