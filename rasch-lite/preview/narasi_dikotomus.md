## Ringkasan 1 Menit (Rasch dikotomus)

- 🟡 **Reliabilitas** (Kuning): Konsistensi pengukuran memadai tetapi belum ideal (reliabilitas person 0,77).
- 🟡 **Kecocokan butir** (Kuning): 1 butir berada di luar rentang kecocokan 0,5-1,5 dan perlu diperiksa: S07.
- 🟢 **Dimensionalitas** (Hijau): Data mendukung asumsi bahwa tes mengukur satu hal utama (eigenvalue kontras pertama 1,42 < 2,0) tanpa pasangan butir yang saling bergantung.
- 🟢 **Kesesuaian target** (Hijau): Tingkat kesulitan butir sesuai dengan kemampuan responden (selisih rata-rata 0,25 logit).
- ⚪ **Fungsi kategori** (Abu-abu): Tidak berlaku: data dikotomus hanya memiliki dua kategori.
- 🔴 **DIF** (Merah): 1 butir menunjukkan DIF besar antar-kelompok dan perlu ditelaah isinya: S12.

## Penjelasan

Analisis Rasch menempatkan kemampuan responden dan kesulitan butir pada satu 'penggaris bersama' yang satuannya disebut logit. Titik nol penggaris ditetapkan pada rata-rata kesulitan butir; angka positif berarti di atas rata-rata itu, angka negatif di bawahnya.

Ketika kemampuan seseorang sama dengan kesulitan sebuah soal, peluangnya menjawab benar adalah 50%. Bila kemampuannya satu logit di atas kesulitan soal, peluang itu naik menjadi sekitar 73%; dua logit di atas, sekitar 88%. Selisih yang sama selalu bermakna sama di bagian mana pun penggaris, dan inilah yang membuat skor Rasch berbeda dari sekadar menjumlah jawaban benar.

### Reliabilitas dan Separasi

Reliabilitas dapat dibayangkan seperti timbangan badan: timbangan yang baik memberi angka yang hampir sama bila Anda menimbang dua kali. Dalam analisis Rasch, reliabilitas person sebesar 0,77 mengindikasikan bahwa sekitar 77% perbedaan measure antar-responden mencerminkan perbedaan yang sebenarnya, sedangkan sisanya adalah galat ukur. Separasi person 1,83 berarti tes ini kira-kira mampu memisahkan responden ke dalam 2 kelompok kemampuan yang berbeda secara statistik (strata 2,77).

Untuk butir, reliabilitas 0,99 dan separasi 11,83 menunjukkan seberapa mantap urutan kesulitan butir bila tes diberikan pada sampel lain yang serupa. Nilai ini terutama dipengaruhi jumlah responden: makin banyak responden, makin presisi posisi setiap butir.

Sebagai pembanding klasik, KR-20 sebesar 0,81 dihitung dari 397 responden dengan jawaban lengkap. Angka ini sering sedikit berbeda dari reliabilitas person Rasch karena memakai skor mentah dan menyertakan skor ekstrem.

**Saran tindakan:**

- Pertimbangkan menambah butir yang tingkat kesulitannya sesuai dengan kemampuan sebagian besar responden, karena butir yang tepat sasaran paling banyak menambah presisi.
- Telaah butir yang misfit (lihat bagian Kecocokan Butir); butir yang 'berisik' menurunkan reliabilitas.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Reliabilitas person (REAL / MODEL) | 0,77 / 0,79 | baik >= 0,80; rendah < 0,67 |
| Separasi person (REAL / MODEL) | 1,83 / 1,94 | >= 2,0 |
| Strata person | 2,77 | (4G + 1) / 3 |
| Reliabilitas item (REAL / MODEL) | 0,99 / 0,99 | >= 0,90 |
| Separasi item (REAL / MODEL) | 11,83 / 12,02 | >= 3,0 |
| RMSE person (REAL) | 0,615 |  |
| SD measure person (populasi) | 1,282 |  |
| KR-20 | 0,81 | n lengkap = 397 |

Rujukan:

- Fisher, W. P., Jr. (2007). Rating scale instrument quality criteria. Rasch Measurement Transactions, 21(1), 1095.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)
- Wright, B. D., & Masters, G. N. (2002). Number of person or item strata. Rasch Measurement Transactions, 16(3), 888.
- Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. Psychometrika, 16(3), 297-334.

</details>

### Kecocokan Butir dan Responden

Statistik kecocokan bekerja seperti alarm kejutan. MNSQ bernilai 1 berarti jawaban menyimpang dari harapan model sebesar yang wajar terjadi secara acak. Nilai di atas 1,5 berarti terlalu banyak kejutan, misalnya responden pandai yang salah pada soal mudah; nilai di bawah 0,5 berarti pola jawaban terlalu mudah ditebak. Infit lebih peka terhadap kejutan dari responden yang setara dengan butir, sedangkan outfit lebih peka terhadap beberapa jawaban yang sangat mengejutkan.

Butir dengan kejutan berlebih: S07 (infit 1,51, outfit 1,96). Pola ini mengindikasikan jawaban yang lebih acak daripada harapan. Kemungkinan penyebabnya antara lain redaksi yang ambigu, kunci jawaban yang keliru, banyak tebakan, atau butir yang mengukur hal lain. Bila hanya outfit yang tinggi, sumbernya kemungkinan sedikit jawaban yang sangat mengejutkan (salah ceroboh atau tebakan beruntung), bukan butirnya secara keseluruhan.

Pada sisi responden, 128 dari 597 responden non-ekstrem (21%) memiliki MNSQ di luar rentang 0,5-1,5; yang paling menyimpang antara lain R0546, R0021, R0510, R0030 dan R0341. Karena setiap responden hanya menjawab 20 butir, MNSQ person berfluktuasi cukup besar secara kebetulan, sehingga sebagian responden dapat tampak misfit walaupun menjawab dengan wajar. Pola yang benar-benar menyimpang dapat berasal dari menjawab asal, menebak, kelelahan, atau kesalahan entri data; karena itu responden tersebut perlu diperiksa, bukan otomatis dihapus.

**Saran tindakan:**

- Telaah redaksi, pilihan jawaban, dan kunci S07; revisi bagian yang ambigu.
- Periksa lembar jawaban responden yang misfit; sebagai analisis sensitivitas, jalankan ulang tanpa mereka dan bandingkan hasilnya.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Rentang MNSQ yang dipakai | 0,5-1,5 | produktif |
| Batas MNSQ merusak pengukuran | 2,0 | > nilai ini: merah |
| Rerata infit / outfit item | 1,00 / 1,00 | ~1,00 |
| Rerata infit / outfit person | 1,00 / 1,00 | ~1,00 |
| Butir di luar rentang | 1 | 0 |
| Butir dengan point-measure negatif | 0 | 0 |
| Responden di luar rentang | 128 (21,4%) |  |
| S07 | infit 1,51 (z 11,1), outfit 1,96 (z 11,7), PTMEA 0,11 / harapan 0,49 |  |

Rujukan:

- Linacre, J. M. (2002). What do infit and outfit, mean-square and standardized mean? Rasch Measurement Transactions, 16(2), 878.
- Wright, B. D., & Masters, G. N. (1982). Rating scale analysis. Chicago: MESA Press.
- Wilson, E. B., & Hilferty, M. M. (1931). The distribution of chi-square. Proceedings of the National Academy of Sciences, 17(12), 684-688.

</details>

### Dimensionalitas dan Dependensi Lokal

Unidimensionalitas berarti semua butir mengukur satu hal yang sama, seperti semua soal ujian matematika memang mengukur kemampuan matematika dan bukan kemampuan membaca. Setelah pengaruh measure dikeluarkan, sisa jawaban (residual) seharusnya acak. Analisis komponen utama atas residual mencari pola yang tersisa; eigenvalue kontras pertama menyatakan kekuatan pola itu dalam satuan 'setara sekian butir'.

Measure menjelaskan 37,0% varians data. Angka ini sangat bergantung pada sebaran kemampuan responden dan kesulitan butir, sehingga tidak dipakai sebagai kriteria tunggal.

Pola yang tersisa (eigenvalue 1,42) masih dalam batas yang wajar terjadi secara kebetulan.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Eigenvalue kontras pertama | 1,42 | < 2,0 hijau; >= 3,0 merah |
| Varians dijelaskan measure | 37,0% | tidak dipakai sebagai kriteria |
| Kontras pertama (% total varians) | 4,5% |  |
| Rata-rata Q3 | -0,053 |  |
| Batas Q3 (rata-rata + 0,2) | 0,147 | +0,2 |
| Q3 maksimum | 0,056 |  |
| Pasangan Q3 ditandai | 0 | 0 |

Rujukan:

- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)
- Raîche, G. (2005). Critical eigenvalue sizes in standardized residual principal components analysis. Rasch Measurement Transactions, 19(1), 1012.
- Linacre, J. M. (2006). Data variance explained by Rasch measures. Rasch Measurement Transactions, 20(1), 1045.
- Christensen, K. B., Makransky, G., & Horton, M. (2017). Critical values for Yen's Q3: Identification of local dependence in the Rasch model using residual correlations. Applied Psychological Measurement, 41(3), 178-194.
- Yen, W. M. (1984). Effects of local item dependence on the fit and equating performance of the three-parameter logistic model. Applied Psychological Measurement, 8(2), 125-145.

</details>

### Kesesuaian Target

Targeting ibarat memasang mistar lompat tinggi. Bila mistar dipasang jauh di bawah kemampuan semua peserta, semuanya lolos dan kita tidak tahu siapa yang paling hebat; bila terlalu tinggi, semuanya gagal. Tes yang tepat sasaran berisi butir dengan kesulitan yang menyebar di sekitar kemampuan responden, sehingga setiap butir memberi informasi.

Rata-rata measure responden adalah 0,25 logit, sedangkan rata-rata kesulitan butir ditetapkan 0 logit; selisihnya 0,25 logit, relatif kecil sehingga butir umumnya berada di sekitar kemampuan responden. Sekitar 9% responden berada di atas butir tersulit dan 4% di bawah butir termudah, wilayah tempat tes memberi sedikit informasi.

Sebanyak 3 responden mendapat skor maksimum dan 0 skor minimum. Batas kemampuan mereka tidak terukur oleh tes ini, sehingga measure mereka hanya perkiraan dengan penyesuaian 0,3 poin.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Rerata measure person (non-ekstrem) | 0,25 |  |
| SD measure person | 1,28 |  |
| Rerata measure item | -0,00 | 0 (identifikasi skala) |
| Selisih (targeting) | 0,25 logit = 0,42 satuan | < 1,0 satuan hijau; >= 2,0 satuan merah |
| Satuan targeting | 0,588 logit | yang lebih kecil antara 1 logit dan RMSE person (MODEL); tafsiran teraman tabel Fisher (2007) |
| Person di atas butir tersulit | 8,8% |  |
| Person di bawah butir termudah | 3,5% |  |
| Skor ekstrem (maks / min) | 3 / 0 |  |

Rujukan:

- Fisher, W. P., Jr. (2007). Rating scale instrument quality criteria. Rasch Measurement Transactions, 21(1), 1095.
- Wright, B. D., & Stone, M. H. (1979). Best test design. Chicago: MESA Press.

</details>

### Fungsi Kategori

Analisis fungsi kategori hanya relevan untuk skala bertingkat (politomus).

### Keadilan Butir antar-Kelompok (DIF)

DIF terjadi bila dua orang dengan kemampuan yang sama, tetapi dari kelompok berbeda, memiliki peluang berbeda untuk menjawab benar sebuah butir, seperti timbangan yang berat sebelah. Measure setiap responden dikunci, lalu kesulitan setiap butir dihitung ulang terpisah untuk tiap kelompok.

Butir yang ditandai: S12 lebih sulit bagi kelompok P (selisih 0,97 logit, p < 0,001, kategori ETS C).

DIF adalah tanda untuk menelaah isi butir, bukan bukti otomatis bahwa butir itu bias. Perbedaan dapat bersumber dari konteks budaya, pilihan kata, atau pengalaman yang lebih akrab bagi satu kelompok, tetapi juga dapat mencerminkan perbedaan pembelajaran yang memang nyata.

Analisis ini melibatkan sekitar 304 responden kelompok L dan 291 responden kelompok P. Pada sampel kecil, DIF yang nyata dapat terlewat; pada sampel sangat besar, perbedaan kecil pun dapat signifikan, sehingga besar selisih (logit) lebih penting daripada nilai p.

**Saran tindakan:**

- Minta panel ahli menelaah isi S12 dari sudut bahasa, konteks, dan keakraban pengalaman bagi tiap kelompok.
- Bila ditemukan sumber bias yang masuk akal, revisi atau ganti butir tersebut.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Kelompok (A / B) | L / P | kontras = measure A - measure B |
| Kriteria penanda | kontras mutlak >= 0,5 dan p < 0,05 | uji t Welch |
| Catatan kriteria | Draba (1977) memakai t > 2,4 untuk tes > 20 butir | RaschLite memakai p < 0,05 (default) |
| Kategori ETS (A / B / C) | 19 / 0 / 1 | C: DIF mutlak >= 0,64 dan bermakna melampaui 0,43 (p < 0,05) |
| S12 | 1,16 vs 2,13; kontras -0,97 (SE 0,21), t(553) = -4,60, p < 0,001 |  |

Rujukan:

- Draba, R. E. (1977). The identification and interpretation of item bias (MESA Memorandum No. 25). Chicago: MESA, University of Chicago. (Kriteria asli: pergeseran >= 0,5 logit dan t > 2,4 untuk tes > 20 butir.)
- Zwick, R., Thayer, D. T., & Lewis, C. (1999). An empirical Bayes approach to Mantel-Haenszel DIF analysis. Journal of Educational Measurement, 36(1), 1-28.
- Welch, B. L. (1947). The generalization of 'Student's' problem when several different population variances are involved. Biometrika, 34(1/2), 28-35.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)

</details>
