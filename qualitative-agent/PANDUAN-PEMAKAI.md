# Panduan Pemakai: Agen Analisis Kualitatif

Aplikasi ini membantu Anda menganalisis data kualitatif seperti transkrip wawancara,
catatan lapangan, dan dokumen. Aplikasi tampil di peramban (Chrome, Edge, Safari,
Firefox), tetapi tidak berada di internet: seluruh data penelitian tetap tersimpan di
komputer Anda. Satu-satunya yang dikirim keluar adalah potongan teks yang Anda minta
untuk dianalisis oleh AI Anthropic, dan setiap pengiriman itu tercatat.

---

## 1. Yang perlu disiapkan sekali saja

- **Python 3.11 atau yang lebih baru.** Ini program pendukung gratis yang dipakai aplikasi
  untuk berjalan. Cara memasangnya ada di bagian 2.
- **Kunci akses Anthropic**, untuk memanggil AI. Cara membuatnya ada di bagian 4.
- **Sambungan internet dan ruang kosong sekitar 1 GB** saat aplikasi dibuka pertama kali.

## 2. Memasang Python

**Windows**

1. Buka **python.org/downloads**, lalu tekan tombol unduh berwarna kuning.
2. Jalankan berkas yang terunduh.
3. Di layar pertama pemasang, **centang kotak "Add python.exe to PATH"** di bagian bawah.
   Langkah ini penting; tanpa centang ini aplikasi tidak dapat menemukan Python.
4. Tekan **Install Now** dan tunggu sampai selesai.

**macOS**

1. Buka **python.org/downloads**, lalu unduh pemasang untuk macOS.
2. Jalankan berkas yang terunduh dan ikuti langkahnya sampai selesai.

**Linux**

Python biasanya sudah tersedia. Pastikan versinya 3.11 atau lebih baru melalui
pengelola aplikasi sistem Anda.

## 3. Membuka aplikasi

1. **Ekstrak berkas ZIP** yang Anda terima.
   - Windows: klik kanan berkas ZIP, pilih **Extract All** (Ekstrak Semua).
   - macOS: klik dua kali berkas ZIP.
2. Pindahkan folder **AgenKualitatif** hasil ekstrak ke folder **Dokumen**. Jangan
   menjalankan aplikasi dari dalam berkas ZIP.
3. Buka folder AgenKualitatif, lalu klik dua kali:
   - Windows: **Mulai Aplikasi** (berkas dengan ikon roda gigi).
   - macOS: **Mulai Aplikasi** (berkas dengan ikon aplikasi).
   - Linux: **mulai-aplikasi.sh**. Bila ditanya, pilih **Jalankan**.

**Bila muncul peringatan keamanan saat pertama kali membuka**

Aplikasi ini tidak dijual melalui toko aplikasi, sehingga sistem operasi memperingatkan
Anda pada pembukaan pertama. Ini wajar.

- Windows: bila muncul layar biru "Windows protected your PC", tekan **More info**, lalu
  **Run anyway**. Bila muncul kotak "Security Warning", tekan **Run**.
- macOS 15 (Sequoia) atau lebih baru: tutup pesan peringatan, lalu buka **Pengaturan
  Sistem → Privasi & Keamanan**, gulir ke bawah, dan tekan **Tetap Buka** (Open Anyway)
  di samping nama "Mulai Aplikasi". Konfirmasi sekali lagi.
- macOS 14 atau lebih lama: klik kanan **Mulai Aplikasi**, pilih **Buka**, lalu tekan
  **Buka** sekali lagi.
- macOS kadang menampilkan pesan bahwa aplikasi dibuka "dari lokasi sementara". Bila
  itu terjadi, seret seluruh folder AgenKualitatif ke folder Dokumen menggunakan Finder,
  lalu buka Mulai Aplikasi dari sana.

**Pembukaan pertama**

Sebuah jendela kecil berjudul *Agen Analisis Kualitatif* akan muncul dan menulis
"Menyiapkan untuk pertama kali". Tahap ini memerlukan internet dan berlangsung sekitar
3–5 menit. Setelah selesai, aplikasi terbuka sendiri di peramban. Pembukaan berikutnya
hanya perlu beberapa detik.

**Selama bekerja, biarkan jendela kecil itu tetap terbuka.** Bila peramban tidak sengaja
tertutup, tekan **Buka lagi di peramban**. Bila sudah selesai bekerja, tekan
**Tutup aplikasi**.

## 4. Mengisi kunci akses Anthropic

1. Buka **platform.claude.com** dan masuk dengan akun Anthropic Anda.
2. Buka bagian **API Keys**, lalu buat kunci baru. Salin kunci itu (diawali `sk-ant-`).
3. Di aplikasi, buka halaman **Pengaturan** di menu samping.
4. Tempel kunci ke kolom yang tersedia, tekan **Simpan kunci**, lalu tekan **Uji kunci**.
   Bila muncul pesan "Kunci berfungsi", aplikasi siap dipakai.

Kunci hanya disimpan di komputer ini dan tidak pernah ditampilkan ulang. Pemakaian AI
ditagihkan ke akun Anthropic Anda; jumlah pemakaiannya dapat dilihat di halaman
**Audit Trail**.

## 5. Alur kerja

1. Di halaman beranda, tekan **Buka folder data penelitian**, lalu salin berkas
   penelitian Anda ke folder yang terbuka. Berkas yang didukung: PDF, Word (.docx),
   dan teks (.txt). Untuk transkrip wawancara, gunakan berkas teks yang setiap giliran
   bicaranya diawali nama penutur berhuruf depan kapital dan titik dua, misalnya
   `Pewawancara: ...` dan `P03: ...`.
2. Buka **Langkah 2: Masukkan berkas**, pilih berkas, isi judul dan jenisnya, lalu
   tekan **Ingest**.
3. Kembali ke beranda, isi nama proyek, pilih metode, lalu tekan **Mulai sesi**.
4. Buka **Langkah 4: Usulan kode** untuk meminta usulan kode dari AI pada setiap unit.
5. Buka **Langkah 5: Tema dan tinjauan** untuk membentuk tema dan meninjau seluruh
   usulan. Tidak ada yang sah sampai Anda sendiri menekan **Sahkan**, **Revisi**,
   atau **Tolak**.
6. Tulis catatan reflektif Anda di halaman **Memo**. Penamaan tema baru dapat
   dijalankan setelah Anda menulis sekurang-kurangnya satu memo sendiri.

Saat ini metode yang tersedia adalah **Reflexive Thematic Analysis**. Metode lain
tampil dengan keterangan "belum tersedia".

## 6. Privasi dan etika penelitian

- Seluruh berkas, kode, tema, dan memo tersimpan di folder AgenKualitatif di komputer
  Anda.
- Teks yang Anda minta untuk dianalisis dikirim ke Anthropic. Pastikan hal ini sesuai
  dengan persetujuan etik penelitian dan persetujuan partisipan Anda, dan pertimbangkan
  menyamarkan nama atau identitas partisipan sebelum berkas dimasukkan.
- Aplikasi hanya dapat dibuka dari komputer ini; orang lain di jaringan yang sama tidak
  dapat mengaksesnya.

## 7. Mencadangkan data

Tutup aplikasi lebih dahulu, lalu salin seluruh folder AgenKualitatif ke diska eksternal
atau penyimpanan cadangan Anda. Folder **db** berisi hasil analisis, dan folder **data**
berisi berkas penelitian.

## 8. Bila ada kendala

| Yang terjadi | Yang perlu dilakukan |
| --- | --- |
| Muncul pesan bahwa Python belum ditemukan | Pasang Python seperti di bagian 2. Di Windows, pastikan kotak "Add python.exe to PATH" dicentang. Bila Python sudah terpasang tanpa centang itu, jalankan ulang pemasang Python, pilih **Modify**, lalu **Next** dan centang **Add Python to environment variables**. |
| Pemasangan pertama gagal | Pastikan internet tersambung, lalu buka Mulai Aplikasi lagi. Pemasangan akan diulang otomatis. |
| Peramban tidak terbuka | Tekan **Buka lagi di peramban** di jendela kecil, atau ketik alamat `http://127.0.0.1:8501` di peramban. |
| Mulai Aplikasi diklik dua kali | Tidak masalah. Bila aplikasi sudah berjalan, yang terjadi hanyalah peramban dibuka kembali. |
| Kunci ditolak | Salin ulang kunci dari platform.claude.com secara utuh, atau buat kunci baru. |
| Pesan galat lain | Rincian teknisnya tersimpan di folder **logs** di dalam folder AgenKualitatif. Kirimkan isi folder itu kepada pengelola aplikasi. |
