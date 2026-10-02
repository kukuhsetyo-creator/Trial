# RaschLite versi HTML

`RaschLite.html` adalah seluruh aplikasi RaschLite dalam satu berkas (sekitar 560 KB). Berkas ini dapat dibagikan apa adanya, misalnya lewat surel, flashdisk, atau drive bersama. Penerima cukup mengklik dua kali berkas itu untuk membukanya di Chrome, Edge, Firefox, atau Safari versi terbaru, tanpa instalasi dan tanpa koneksi internet. Semua perhitungan berjalan di browser penerima, dan data yang dibuka tidak pernah dikirim ke mana pun.

Alur kerjanya sama dengan versi desktop: Impor Data (CSV atau Excel, termasuk data contoh), Pilih Model (Dichotomous, Rating Scale, atau Partial Credit), Jalankan, lalu Hasil. Hasil memuat Brief Summary, tabel Item Measures, Person Measures, Category Structure, Dimensionality, Local Dependence, DIF, sepuluh grafik beserta panel "Cara membaca grafik ini", dan glosarium. Tersedia empat ekspor:

| Ekspor | Hasil |
|---|---|
| Unduh Excel (.xlsx) | workbook asli: satu sheet per tabel, angka tersimpan sebagai angka |
| Unduh Laporan HTML | satu berkas laporan mandiri dengan grafik SVG |
| Cetak / Simpan PDF | membuka dialog cetak; pilih "Save as PDF" |
| Unduh Semua Grafik (ZIP) | semua grafik dalam PNG 300 dpi dan SVG |
| Unduh Berkas Audit (ZIP) | `items.csv` (dapat dipakai sebagai anchor untuk penyetaraan antar-form), `persons.csv`, matriks residual terstandar, `config.json` (pengaturan, ambang, benih acak, sidik jari data), dan `cmle_items.csv` bila CMLE dijalankan |

## Lapisan inferensi (khusus versi HTML)

Versi HTML menambahkan lapisan inferensi di atas engine yang setara dengan desktop. Angka engine tidak berubah; yang berubah adalah cara indikator dinilai dan dirangkai. Semua ambang baru dikumpulkan di `RULES` dalam `src/advanced.js`, dan vonis menurut kriteria lama tetap ditampilkan di detail teknis untuk audit.

Sebelum estimasi, struktur data dipetakan: blok butir dikenali dari awalan nama (S1_01, S2_01, ...), sel kosong dipisahkan menjadi omitted dan not-reached menurut posisinya dalam blok, dan pola speeded dideteksi. Pengguna memilih perlakuan secara eksplisit: kosong = missing, prosedur Ludlow dan O'Leary (1999), atau kosong = salah. Bila berkas berisi jawaban mentah (huruf opsi) dengan satu baris berisi `KUNCI` atau `KEY` di kolom ID, data diskor otomatis dan analisis distraktor dijalankan.

Sesudah estimasi, diagnostik berikut dihitung:

| Bidang | Isi |
|---|---|
| Kualitas respons | lz* (Snijders, 2001), Guttman G*, skor setara tebakan (binomial), pemisahan underfit dan overfit, analisis sensitivitas tanpa responden menyimpang |
| Butir | flag gabungan MNSQ, ZSTD, dan selisih PTMEA terhadap harapan; korelasi outfit dengan kesulitan; tailored analysis (Andrich, Marais & Humphry, 2012); distraktor |
| Dimensionalitas | ambang eigenvalue dan Q3 dari simulasi data patuh model dengan ukuran dan pola kosong yang sama; loading per blok; disattenuated correlation; uji t Smith; kandidat testlet; kalibrasi per blok dalam satu klik |
| Reliabilitas dan targeting | dekomposisi SD sejati/RMSE, reliabilitas maksimum, proyeksi Spearman-Brown, peringatan seleksi KR-20, efisiensi informasi pada lokasi person |
| DIF | minimum detectable contrast dan status "belum dapat ditentukan", koreksi Benjamini-Hochberg, purifikasi, Mantel-Haenszel, regresi logistik (uniform dan non-uniform), lebih dari dua kelompok (omnibus), dampak tingkat tes (DTF) |
| Validasi | CMLE sebagai estimator pembanding (dikotomus, RSM, PCM), studi pemulihan parameter dari simulasi |

Ringkasan dibuka dengan sintesis yang menalar hubungan antar-indikator, setiap lampu diberi tingkat keyakinan, dan saran tindakan diurutkan menurut ketergantungan logisnya (kunci dan data, responden, butir, struktur, presisi, keadilan). Templat teks dibedakan antara tes kemampuan dan angket.

## Kesetaraan dengan versi desktop

Engine JavaScript (`src/engine.js`) adalah porting langsung dari `src/raschlite/core`, dan mesin narasi (`src/interpret.js`) adalah porting dari `interpret/narrative.py`. Pesan, label, glosarium, ambang interpretasi, rujukan, dan teks grafik tidak disalin manual: semuanya diekspor dari paket Python saat build (`tools/export_text.py`).

Kesetaraan ini berlaku untuk engine dan lapisan narasi dasar (`interpret.js`); lapisan inferensi di atasnya (`inference.js`) sengaja berbeda dari versi desktop. Kesetaraan diuji terhadap golden file yang dibangkitkan engine Python (`tools/make_golden.py`). Uji mencakup delapan kasus: ketiga model pada data contoh, mode ketat, missing data 10% dengan kode missing khusus, extreme score, DIF, disordered threshold, kategori yang tidak terpakai, dan pemisah titik koma. Setiap angka (solusi JMLE, fit, kategori, PCA, Q3, DIF) harus sama sampai toleransi relatif 10⁻⁶. Narasi Markdown lengkap harus identik huruf demi huruf.

## Membangun dan menguji

Dari folder `rasch-lite`:

```
.venv/bin/python web/build.py              # menghasilkan web/RaschLite.html
.venv/bin/python web/tools/make_golden.py  # golden file dari engine Python
node web/test/run_tests.mjs                # kesetaraan engine, narasi, dan .xlsx
node web/test/advanced_tests.cjs           # diagnostik lanjutan dan CMLE (bentuk tertutup, enumerasi, simulasi)
node web/test/e2e.cjs                      # uji browser end-to-end lewat file:// (Playwright)
```

## Batasan khusus versi HTML

- **PDF:** dibuat lewat dialog cetak browser, sehingga tata letaknya sedikit bergantung pada browser.
- **Grafik:** digambar dalam SVG oleh kode sendiri, bukan matplotlib. Isi dan gayanya setara dengan versi desktop, tetapi tidak identik piksel demi piksel.
- **Pembaca Excel:** hanya membaca sheet pertama dan memerlukan browser yang mendukung `DecompressionStream`, yaitu Chrome/Edge 80+, Firefox 113+, dan Safari 16.4+.
- **Batasan metode:** sama dengan versi desktop (lihat README utama). lz*, Guttman G*, Mantel-Haenszel, regresi logistik, dan tailored analysis hanya tersedia untuk data dikotomus; untuk politomus, person fit memakai MNSQ yang disertai ZSTD.
- **Waktu proses:** simulasi dan CMLE adalah bagian terlama (data 265 x 89: sekitar 7 detik untuk 50 simulasi dan 9 detik untuk CMLE beserta standard error). Keduanya dapat dimatikan di langkah Model.
