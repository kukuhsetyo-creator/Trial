# Agen Analisis Data Kualitatif Lokal

Sistem analisis kualitatif yang beroperasi di perangkat sendiri: SQLite untuk data,
Streamlit untuk antarmuka, dan Anthropic API untuk pemanggilan model. Empat tradisi
metodologis diperlakukan sebagai modul epistemologis terpisah, bukan satu algoritma
generik berlabel berbeda.

## Keadaan pembangunan

| Lapisan | Keadaan |
| --- | --- |
| Skema basis data + inisialisasi | selesai |
| Ingest (PDF, DOCX, transkrip) + segmentasi | selesai |
| Konfigurasi empat metode + pemuat | selesai |
| Klien API + audit trail | selesai |
| Coding inisial (utilitas lintas metode) | selesai |
| Modul RTA | selesai |
| Antrean peninjauan manusia | selesai |
| Modul TA klasik, IPA, Grounded Theory | belum dibangun |
| Retrieval vektor, generator laporan | belum dibangun |

## Menjalankan

**Pemakai awam** cukup mengikuti `PANDUAN-PEMAKAI.md`: pasang Python sekali, ekstrak
ZIP, lalu klik dua kali `Mulai Aplikasi` (Windows `.bat`, macOS `.app`) atau
`mulai-aplikasi.sh` (Linux). Peluncur di `launcher/launcher.pyw` hanya memakai pustaka
standar dan mengurus sisanya: membuat `.venv`, memasang `requirements.txt` hanya bila
sidik SHA-256-nya berubah, menyiapkan basis data, menjalankan Streamlit yang terikat ke
`127.0.0.1`, lalu membuka peramban. Kunci akses diisi lewat halaman Pengaturan dan
disimpan di `.env` (izin 600).

**Pengembang**:

```bash
pip install -r requirements.txt
python src/db_init.py                     # buat dan verifikasi basis data
streamlit run app/main.py                 # antarmuka lokal
python -m unittest discover -s tests
python launcher/launcher.pyw --headless-test   # uji peluncur tanpa jendela
python tools/buat_paket.py                # dist/AgenKualitatif-YYYYMMDD.zip
```

Catatan peluncur, pemasangan, dan galat aplikasi tersimpan di `logs/`.

Letakkan berkas penelitian ke `data/raw/` secara manual, atau lewat tombol "Buka folder
data penelitian" di beranda yang hanya membuka folder itu di pengelola berkas. Folder
itu read-only bagi seluruh kode; tidak ada fungsi yang menulis ke sana, dan antarmuka
sengaja tidak menyediakan widget unggahan.

## Alur RTA

```python
from src.coding import rta

run_id = rta.start_run("Studi Beban Kerja Guru")
rta.familiarization(run_id, document_id=1)      # memo kesan awal
rta.code_units(run_id, document_id=1)           # kode inisial, status 'proposed'
rta.generate_themes(run_id)                     # tema, tanpa data prevalensi
rta.review_themes(run_id)                       # penilaian tema untuk peneliti
rta.define_and_name_themes(run_id)              # menuntut memo reflektif peneliti
```

Peninjauan dan promosi status dilakukan peneliti lewat `src/validation/review_queue.py`
atau halaman Tema dan Peninjauan pada antarmuka.

## Prinsip yang ditegakkan kode

Modul metode tidak berbagi logika. `src/coding/open_coding.py` mekanis dan buta
terhadap metode; seluruh perbedaan substantif berada di `config/methods/*.yaml`.

Kolom `status` pada `codes` dan `categories` hanya berubah di
`src/validation/review_queue.py`, selalu bersama satu baris `validation_events` dalam
transaksi yang sama. Tidak satu pun fungsi di `src/store.py` menerima parameter status.

`data/raw/` dijaga `src/ingestion/_raw.py`, yang menolak mode tulis, path di luar
direktori tersebut, dan upaya traversal.

Setiap pemanggilan API tercatat di `audit_log` sebelum pemanggil mengembalikan hasil,
termasuk pemanggilan yang gagal total setelah seluruh percobaan retry habis.

Pada RTA, hitungan frekuensi kode tidak pernah dikirim ke model saat pembentukan tema,
dan permintaan metrik reliabilitas antarpenilai ditolak dengan pengecualian eksplisit.

## Edisi peramban (HTML)

`web/QualitativeAnalysisForm.html` (Qualitative Analysis Form, CSPS) adalah satu berkas yang
berjalan langsung di peramban tanpa Python, peluncur, maupun pemasangan: klik dua kali, lalu
pilih penyedia AI dan isi kuncinya di halaman Pengaturan. Penyedia yang didukung: Claude
(Anthropic), Gemini (Google), Qwen (Alibaba Cloud), DeepSeek, GPT (OpenAI), OpenRouter,
layanan lain yang kompatibel OpenAI, dan Ollama untuk model lokal. Akses langsung dari
`file://` sudah diuji untuk Anthropic, Gemini, dan Ollama; penyedia lain belum. Ia berdampingan dengan versi Python, mencakup alur RTA yang sama, dan
menegakkan aturan `CLAUDE.md` yang sama (status hanya berubah lewat peninjauan, setiap
pemanggilan AI tercatat, tanpa hitungan frekuensi di prompt tema, penamaan tema menuntut
memo peneliti). Data tersimpan di IndexedDB peramban; kunci akses tidak pernah ikut
dalam berkas cadangan. Format cadangan JSON memakai nama tabel dan kolom yang sama
dengan skema SQLite.

```bash
python web/build_html.py   # menyusun ulang dari web/src/ dan web/vendor/
CHROMIUM=/path/chrome RAW=data/raw node web/tests/browser_test.mjs   # perlu playwright-core
```

Pustaka yang disematkan: mammoth.js 1.8.0 (BSD-2-Clause) dan pdf.js 3.11.174
(Apache-2.0); teks lisensinya ada di `web/vendor/`.
