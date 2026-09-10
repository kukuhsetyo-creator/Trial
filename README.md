# AI Grader Sistem

Aplikasi web untuk mengoreksi Lembar Jawaban Komputer (LJK) pada administrasi
instrumen psikologis dan tes inteligensi. Seluruh pekerjaan berlangsung di
perangkat: pembacaan lembar dikerjakan mesin OMR berbasis Canvas 2D, tanpa
model bahasa, tanpa kunci API, dan tanpa satu pun panggilan jaringan. Aplikasi
yang sama dapat dibungkus menjadi APK Android melalui Capacitor.

## Kemampuan

| Fungsi | Keterangan |
| --- | --- |
| Pembacaan luring | Deteksi bulatan dihitamkan maupun tanda silang, murni pengolahan citra di peramban |
| Entri manual | Papan tombol A–E dan tempel massal, sebagai jalur cadangan maupun jalur utama |
| Kustomisasi layout | Jumlah butir, kolom, baris, opsi, diameter bulatan, jarak, margin, penanda sudut |
| Kunci jawaban | Input per butir, tempel massal, atau diambil dari satu LJK master |
| Penyekoran | Number-right atau formula scoring, skala nilai dan KKM dapat diatur |
| Konversi norma | Skor deviasi M = 100/SD = 15, skor Z, skor T, persentil, klasifikasi |
| Analisis butir | Indeks kesukaran, daya beda kelompok 27%, point-biserial, KR-20 |
| Laporan | PDF A4 berkop resmi dengan lampiran rincian jawaban, plus ekspor CSV |
| Template LJK | Dirender dari geometri yang sama dengan yang dibaca detektor, siap cetak |
| Android | Kamera nativ, penyimpanan berkas lewat Filesystem + Share, APK via Capacitor |

## Teknologi

React 18 (functional component + hooks), Tailwind CSS 3, lucide-react,
html2canvas, jsPDF, Vite, Capacitor 6. Antarmuka berada di `src/App.jsx`;
geometri lembar di `src/ljk/layout.js`; mesin OMR di `src/ljk/omr.js`; cabang
platform di `src/platform.js`.

## Menjalankan

```bash
npm install
npm run dev       # pengembangan di http://localhost:5173
npm run build     # bundel produksi ke dist/
npm run preview   # meninjau hasil build
npm test          # seluruh uji
npm run test:omr  # uji akurasi mesin OMR (Node, tanpa dependensi tambahan)
npm run test:filename  # uji pembersihan nama berkas ekspor
```

### Android

```bash
npm run android:sync   # build web lalu salin ke proyek android/
npm run android:open   # buka di Android Studio untuk membangun APK
```

Membangun APK memerlukan JDK 17 dan Android Studio pada mesin Anda. Proyek
`android/` sudah tersedia di repositori beserta izin kamera pada manifesnya.
Izin `INTERNET` tetap dideklarasikan karena Capacitor melayani aset dari server
lokal di dalam WebView; aplikasi tidak pernah menghubungi alamat di luar
perangkat.

Pencadangan dimatikan (`allowBackup="false"` beserta aturan pengecualian untuk
Android 12 ke atas). Tanpa itu, Android Auto Backup akan menyalin nama peserta
beserta skornya ke Google Drive milik pemakai secara berkala — membatalkan
jaminan bahwa data tidak meninggalkan perangkat, tanpa sepengetahuan pemeriksa
maupun peserta. Konsekuensinya, data koreksi tidak ikut berpindah ketika pemakai
berganti ponsel; ekspor PDF atau CSV adalah jalur pemindahan yang disengaja.

## Cara kerja pembacaan

Template LJK dan mesin OMR membaca satu objek geometri yang sama, dinyatakan
dalam milimeter. Konsekuensinya, mengubah layout tidak pernah membuat posisi
cetak dan titik sampel pembacaan saling melenceng — sesuatu yang tidak dapat
dijamin bila keduanya memelihara angka sendiri-sendiri.

Alur pembacaan satu lembar:

1. Citra diturunkan resolusinya dan diubah ke kanal keabuan.
2. Ambang Otsu global digabung dengan ambang lokal berbasis citra integral,
   sehingga tinta tetap terpisah dari kertas pada pencahayaan yang tidak merata.
3. Empat penanda sudut dicari melalui pelabelan komponen terhubung. Kandidat
   disaring lewat lambung cembungnya: bulatan jawaban yang dihitamkan penuh
   memiliki bentuk yang nyaris sama dengan penanda, tetapi menurut konstruksi
   selalu berada di dalam persegi penanda sehingga tidak pernah menjadi titik
   sudut lambung.
4. Orientasi diputuskan oleh bukti isi lembar, bukan oleh nisbah sisi. Nisbah
   sisi tidak dapat membedakan rotasi 0 dari 180 derajat, dan pada lembar yang
   terpotret menyerong ia justru condong memilih orientasi terbalik.
5. Homografi empat titik memetakan bidang halaman ke bidang citra, sehingga foto
   miring atau berperspektif tetap terbaca.
6. Setiap bulatan disampel, lalu diputuskan pada kehitaman **neto** — rasio
   piksel gelap dikurangi garis dasar lembar (median seluruh bulatan). Garis
   dasar itu menyerap kontribusi huruf yang tercetak di dalam bulatan serta
   perbedaan ketebalan tinta antarcetakan, sehingga ambang tidak perlu disetel
   ulang setiap kali pencetak atau kamera berganti.
7. Butir yang tidak ditandai, ditandai ganda, atau ragu dikembalikan sebagai
   kosong — bukan salah — sehingga tidak dihukum pada formula scoring.

Dua penjagaan memastikan kegagalan bersifat terbuka, bukan senyap: ukuran
penanda yang terukur harus sepadan dengan ukuran yang tersirat homografi, dan
titik sampel harus benar-benar menemukan tinta cincin yang tercetak. Bila salah
satu tidak terpenuhi, pembacaan ditolak disertai keterangan sebabnya, alih-alih
mengembalikan pola jawaban yang tampak wajar padahal keliru.

Panel kalibrasi menampilkan titik yang benar-benar disampel di atas citra asli
beserta ambang yang sedang berlaku, sehingga keputusan pembacaan dapat diaudit.

## Hasil uji akurasi

`npm run test:omr` menyintesis lembar terisi dari geometri aplikasi, lalu
mendegradasinya menyerupai foto ponsel sebelum diserahkan ke detektor. Empat
layout diuji terhadap sebelas varian citra:

- 44 dari 44 kasus mencapai akurasi 100%, mencakup rotasi sampai 25 derajat,
  keystone proyektif sampai 18%, penggelapan sampai 35% kecerahan asli, vignet,
  derau berat, dan pelunakan kompresi.
- Tidak ada pembacaan keliru yang lolos tanpa terdeteksi. Uji ini gagal bila
  ada satu saja.

Batas patahnya berada di luar rentang itu: keystone di atas sekitar 25% dan
gabungan rotasi besar dengan derau ekstrem membuat detektor menolak membaca.
Penolakan tersebut memang perilaku yang dikehendaki, namun perlu dicatat bahwa
seluruh angka di atas berasal dari lembar sintetis. Akurasi pada lembar
sungguhan — dengan bekas hapusan, kertas tertekuk, dan tekanan pensil yang
beragam — hanya dapat diketahui melalui uji lapangan.

## Catatan metodologis

Skor deviasi yang dihasilkan merupakan transformasi linear terhadap norma lokal
(rerata dan simpangan baku sampel yang sedang dikoreksi) atau terhadap parameter
normatif yang dimasukkan pemeriksa. Angka tersebut menempatkan peserta relatif
terhadap kelompok pembandingnya dan tidak setara dengan skor IQ dari instrumen
terstandardisasi bernorma nasional. Pembacaan otomatis tetap memerlukan
verifikasi pemeriksa sebelum hasilnya dipakai sebagai dasar keputusan asesmen.

Cetak template pada kertas A4 dengan skala 100%, baik lewat tombol Cetak maupun
lewat PDF yang diunduh. Penskalaan otomatis pencetak menggeser posisi bulatan
terhadap penanda sudut dan menurunkan akurasi pembacaan; margin halaman sengaja
ditetapkan nol karena lembar sudah berukuran A4 penuh dengan bantalan tepinya
sendiri.
