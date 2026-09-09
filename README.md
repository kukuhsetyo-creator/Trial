# AI Grader Sistem

Aplikasi web untuk mengoreksi Lembar Jawaban Komputer (LJK) secara otomatis pada
administrasi instrumen psikologis dan tes inteligensi. Pembacaan lembar dilakukan
oleh Google Gemini Vision API, sedangkan penyekoran, konversi norma, analisis
butir, dan penyusunan laporan berlangsung sepenuhnya di peramban tanpa backend.

## Kemampuan

| Fungsi | Keterangan |
| --- | --- |
| Deteksi identitas | Nama peserta dibaca dari kolom identitas, dapat disunting manual |
| Pembacaan jawaban | Pilihan ganda A–D atau A–E, penanda silang (X) maupun bulatan dihitamkan (●) |
| Kunci jawaban | Input per butir, tempel massal, atau diambil dari satu LJK master |
| Penyekoran | Number-right atau formula scoring (benar − salah/(k−1)), skala nilai dapat diatur |
| Konversi norma | Skor deviasi M = 100/SD = 15, skor Z, skor T, persentil, klasifikasi |
| Analisis butir | Indeks kesukaran (p), daya beda (D) kelompok 27%, point-biserial, KR-20 |
| Laporan | PDF A4 berkop resmi dengan lampiran rincian jawaban, plus ekspor CSV |
| Template LJK | Lembar 3 kolom siap cetak, penanda sudut, paginasi otomatis |

## Teknologi

React 18 (functional component + hooks), Tailwind CSS 3, lucide-react,
html2canvas, jsPDF, Vite. Seluruh logika aplikasi berada pada satu berkas
`src/App.jsx`.

## Menjalankan

```bash
npm install
npm run dev      # pengembangan di http://localhost:5173
npm run build    # bundel produksi ke dist/
npm run preview  # meninjau hasil build
```

## Kunci API

Kunci Gemini diperoleh melalui Google AI Studio, lalu dimasukkan pada panel
**Konfigurasi**. Kunci disimpan di `localStorage` peramban dan dikirim langsung
dari klien ke `generativelanguage.googleapis.com`.

Konsekuensinya, kunci tersebut terekspos pada perangkat pemakai. Untuk pemakaian
institusional dengan banyak operator, tempatkan kunci di balik proksi server dan
terapkan pembatasan kuota per pemakai.

## Prompt visi

```
Analisis gambar LJK ini, deteksi nama siswa dan jawaban pilihan ganda nomor 1 sampai N.
Outputkan JSON murni:
{
  "name": "NAMA SISWA",
  "answers": [
    { "no": 1, "ans": "A" },
    { "no": 2, "ans": "B" }
  ]
}
```

Prompt dikirim dengan `temperature: 0` dan `responseMimeType: application/json`.
Butir yang tidak ditandai, ditandai ganda, atau ambigu dikembalikan sebagai
`null` sehingga terhitung sebagai jawaban kosong, bukan salah.

## Catatan metodologis

Skor deviasi yang dihasilkan aplikasi ini merupakan transformasi linear terhadap
norma lokal (rerata dan simpangan baku sampel yang sedang dikoreksi) atau
terhadap parameter normatif yang dimasukkan pemeriksa. Angka tersebut menempatkan
peserta relatif terhadap kelompok pembandingnya dan tidak setara dengan skor IQ
dari instrumen terstandardisasi bernorma nasional. Pembacaan otomatis tetap
memerlukan verifikasi pemeriksa sebelum hasilnya dipakai sebagai dasar keputusan
asesmen.
