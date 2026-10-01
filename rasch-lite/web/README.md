# RaschLite versi HTML

`RaschLite.html` adalah seluruh aplikasi RaschLite dalam satu berkas (sekitar 380 KB). Berkas ini dapat dibagikan apa adanya, misalnya lewat surel, flashdisk, atau drive bersama. Penerima cukup mengklik dua kali berkas itu untuk membukanya di Chrome, Edge, Firefox, atau Safari versi terbaru, tanpa instalasi dan tanpa koneksi internet. Semua perhitungan berjalan di browser penerima, dan data yang dibuka tidak pernah dikirim ke mana pun.

Alur kerjanya sama dengan versi desktop: Impor Data (CSV atau Excel, termasuk data contoh), Pilih Model (Dichotomous, Rating Scale, atau Partial Credit), Jalankan, lalu Hasil. Hasil memuat Ringkasan 1 Menit, tabel Item Measures, Person Measures, Category Structure, Dimensionality, Local Dependence, DIF, sepuluh grafik beserta panel "Cara membaca grafik ini", dan glosarium. Tersedia empat ekspor:

| Ekspor | Hasil |
|---|---|
| Unduh Excel (.xlsx) | workbook asli: satu sheet per tabel, angka tersimpan sebagai angka |
| Unduh Laporan HTML | satu berkas laporan mandiri dengan grafik SVG |
| Cetak / Simpan PDF | membuka dialog cetak; pilih "Save as PDF" |
| Unduh Semua Grafik (ZIP) | semua grafik dalam PNG 300 dpi dan SVG |

## Kesetaraan dengan versi desktop

Engine JavaScript (`src/engine.js`) adalah porting langsung dari `src/raschlite/core`, dan mesin narasi (`src/interpret.js`) adalah porting dari `interpret/narrative.py`. Pesan, label, glosarium, ambang interpretasi, rujukan, dan teks grafik tidak disalin manual: semuanya diekspor dari paket Python saat build (`tools/export_text.py`).

Kesetaraan diuji terhadap golden file yang dibangkitkan engine Python (`tools/make_golden.py`). Uji mencakup delapan kasus: ketiga model pada data contoh, mode ketat, missing data 10% dengan kode missing khusus, extreme score, DIF, disordered threshold, kategori yang tidak terpakai, dan pemisah titik koma. Setiap angka (solusi JMLE, fit, kategori, PCA, Q3, DIF) harus sama sampai toleransi relatif 10⁻⁶. Narasi Markdown lengkap harus identik huruf demi huruf.

## Membangun dan menguji

Dari folder `rasch-lite`:

```
.venv/bin/python web/build.py              # menghasilkan web/RaschLite.html
.venv/bin/python web/tools/make_golden.py  # golden file dari engine Python
node web/test/run_tests.mjs                # kesetaraan engine, narasi, dan .xlsx
node web/test/e2e.cjs                      # uji browser end-to-end lewat file:// (Playwright)
```

## Batasan khusus versi HTML

- **PDF:** dibuat lewat dialog cetak browser, sehingga tata letaknya sedikit bergantung pada browser.
- **Grafik:** digambar dalam SVG oleh kode sendiri, bukan matplotlib. Isi dan gayanya setara dengan versi desktop, tetapi tidak identik piksel demi piksel.
- **Pembaca Excel:** hanya membaca sheet pertama dan memerlukan browser yang mendukung `DecompressionStream`, yaitu Chrome/Edge 80+, Firefox 113+, dan Safari 16.4+.
- **Batasan metode:** sama dengan versi desktop (lihat README utama).
