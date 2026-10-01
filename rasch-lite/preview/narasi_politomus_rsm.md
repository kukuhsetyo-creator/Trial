## Ringkasan 1 Menit (Rating Scale Model (Andrich))

- 🟢 **Reliabilitas** (Hijau): Tes cukup konsisten membedakan responden (reliabilitas person 0,89, separasi 2,87) dan urutan kesulitan butirnya mantap.
- 🟢 **Kecocokan butir** (Hijau): Semua 12 butir berperilaku sesuai harapan model (MNSQ dalam rentang 0,5-1,5).
- 🟢 **Dimensionalitas** (Hijau): Data mendukung asumsi bahwa tes mengukur satu hal utama (eigenvalue kontras pertama 1,52 < 2,0) tanpa pasangan butir yang saling bergantung.
- 🟡 **Kesesuaian target** (Kuning): Rata-rata responden berada 0,53 logit di atas rata-rata butir; responden cenderung mudah memberi skor tinggi pada butir-butir ini.
- 🟢 **Fungsi kategori** (Hijau): Kategori jawaban berfungsi berurutan dan cukup sering dipakai.
- 🟢 **DIF** (Hijau): Tidak ada butir yang berfungsi berbeda secara bermakna antara kelompok L dan P.

## Penjelasan

Analisis Rasch menempatkan kemampuan responden dan kesulitan butir pada satu 'penggaris bersama' yang satuannya disebut logit. Titik nol penggaris ditetapkan pada rata-rata kesulitan butir; angka positif berarti di atas rata-rata itu, angka negatif di bawahnya.

Pada skala bertingkat, posisi responden yang lebih tinggi daripada posisi butir berarti ia lebih mungkin memilih kategori jawaban yang lebih tinggi (misalnya 'setuju' daripada 'netral'). Selisih yang sama selalu bermakna sama di bagian mana pun penggaris, sehingga measure dapat dibandingkan secara adil antar-responden.

### Reliabilitas dan Separasi

Reliabilitas dapat dibayangkan seperti timbangan badan: timbangan yang baik memberi angka yang hampir sama bila Anda menimbang dua kali. Dalam analisis Rasch, reliabilitas person sebesar 0,89 mengindikasikan bahwa sekitar 89% perbedaan measure antar-responden mencerminkan perbedaan yang sebenarnya, sedangkan sisanya adalah galat ukur. Separasi person 2,87 berarti tes ini kira-kira mampu memisahkan responden ke dalam 4 kelompok kemampuan yang berbeda secara statistik (strata 4,17).

Untuk butir, reliabilitas 0,99 dan separasi 9,50 menunjukkan seberapa mantap urutan kesulitan butir bila tes diberikan pada sampel lain yang serupa. Nilai ini terutama dipengaruhi jumlah responden: makin banyak responden, makin presisi posisi setiap butir.

Sebagai pembanding klasik, Cronbach's alpha sebesar 0,91 dihitung dari 306 responden dengan jawaban lengkap. Angka ini sering sedikit berbeda dari reliabilitas person Rasch karena memakai skor mentah dan menyertakan skor ekstrem.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Reliabilitas person (REAL / MODEL) | 0,89 / 0,91 | baik >= 0,80; rendah < 0,67 |
| Separasi person (REAL / MODEL) | 2,87 / 3,10 | >= 2,0 |
| Strata person | 4,17 | (4G + 1) / 3 |
| Reliabilitas item (REAL / MODEL) | 0,99 / 0,99 | >= 0,90 |
| Separasi item (REAL / MODEL) | 9,50 / 9,66 | >= 3,0 |
| RMSE person (REAL) | 0,418 |  |
| SD measure person (populasi) | 1,271 |  |
| Cronbach's alpha | 0,91 | n lengkap = 306 |

Rujukan:

- Fisher, W. P., Jr. (2007). Rating scale instrument quality criteria. Rasch Measurement Transactions, 21(1), 1095.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)
- Wright, B. D., & Masters, G. N. (2002). Number of person or item strata. Rasch Measurement Transactions, 16(3), 888.
- Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. Psychometrika, 16(3), 297-334.

</details>

### Kecocokan Butir dan Responden

Statistik kecocokan bekerja seperti alarm kejutan. MNSQ bernilai 1 berarti jawaban menyimpang dari harapan model sebesar yang wajar terjadi secara acak. Nilai di atas 1,5 berarti terlalu banyak kejutan, misalnya responden pandai yang salah pada soal mudah; nilai di bawah 0,5 berarti pola jawaban terlalu mudah ditebak. Infit lebih peka terhadap kejutan dari responden yang setara dengan butir, sedangkan outfit lebih peka terhadap beberapa jawaban yang sangat mengejutkan.

Pada sisi responden, 65 dari 349 responden non-ekstrem (19%) memiliki MNSQ di luar rentang 0,5-1,5; yang paling menyimpang antara lain R0134, R0091, R0075, R0207 dan R0005. Karena setiap responden hanya menjawab 12 butir, MNSQ person berfluktuasi cukup besar secara kebetulan, sehingga sebagian responden dapat tampak misfit walaupun menjawab dengan wajar. Pola yang benar-benar menyimpang dapat berasal dari menjawab asal, menebak, kelelahan, atau kesalahan entri data; karena itu responden tersebut perlu diperiksa, bukan otomatis dihapus.

**Saran tindakan:**

- Periksa lembar jawaban responden yang misfit; sebagai analisis sensitivitas, jalankan ulang tanpa mereka dan bandingkan hasilnya.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Rentang MNSQ yang dipakai | 0,5-1,5 | produktif |
| Batas MNSQ merusak pengukuran | 2,0 | > nilai ini: merah |
| Rerata infit / outfit item | 1,00 / 1,00 | ~1,00 |
| Rerata infit / outfit person | 1,00 / 1,00 | ~1,00 |
| Butir di luar rentang | 0 | 0 |
| Butir dengan point-measure negatif | 0 | 0 |
| Responden di luar rentang | 65 (18,6%) |  |

Rujukan:

- Linacre, J. M. (2002). What do infit and outfit, mean-square and standardized mean? Rasch Measurement Transactions, 16(2), 878.
- Wright, B. D., & Masters, G. N. (1982). Rating scale analysis. Chicago: MESA Press.
- Wilson, E. B., & Hilferty, M. M. (1931). The distribution of chi-square. Proceedings of the National Academy of Sciences, 17(12), 684-688.

</details>

### Dimensionalitas dan Dependensi Lokal

Unidimensionalitas berarti semua butir mengukur satu hal yang sama, seperti semua soal ujian matematika memang mengukur kemampuan matematika dan bukan kemampuan membaca. Setelah pengaruh measure dikeluarkan, sisa jawaban (residual) seharusnya acak. Analisis komponen utama atas residual mencari pola yang tersisa; eigenvalue kontras pertama menyatakan kekuatan pola itu dalam satuan 'setara sekian butir'.

Measure menjelaskan 56,3% varians data. Angka ini sangat bergantung pada sebaran kemampuan responden dan kesulitan butir, sehingga tidak dipakai sebagai kriteria tunggal.

Pola yang tersisa (eigenvalue 1,52) masih dalam batas yang wajar terjadi secara kebetulan.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Eigenvalue kontras pertama | 1,52 | < 2,0 hijau; >= 3,0 merah |
| Varians dijelaskan measure | 56,3% | tidak dipakai sebagai kriteria |
| Kontras pertama (% total varians) | 5,5% |  |
| Rata-rata Q3 | -0,092 |  |
| Batas Q3 (rata-rata + 0,2) | 0,108 | +0,2 |
| Q3 maksimum | 0,101 |  |
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

Rata-rata measure responden adalah 0,53 logit, sedangkan rata-rata kesulitan butir ditetapkan 0 logit; selisihnya 0,53 logit, yang mengindikasikan responden cenderung mudah memberi skor tinggi pada butir-butir ini. Sekitar 4% responden berada di atas threshold tersulit dan 0% di bawah threshold termudah, wilayah tempat tes memberi sedikit informasi.

Sebanyak 1 responden mendapat skor maksimum dan 0 skor minimum. Batas kemampuan mereka tidak terukur oleh tes ini, sehingga measure mereka hanya perkiraan dengan penyesuaian 0,3 poin.

**Saran tindakan:**

- Tambahkan butir yang lebih sulit (pernyataan yang lebih 'berat' untuk disetujui) agar responden berkemampuan tinggi juga terukur presisi.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Rerata measure person (non-ekstrem) | 0,53 |  |
| SD measure person | 1,27 |  |
| Rerata measure item | 0,00 | 0 (identifikasi skala) |
| Selisih (targeting) | 0,53 logit = 1,35 satuan | < 1,0 satuan hijau; >= 2,0 satuan merah |
| Satuan targeting | 0,390 logit | yang lebih kecil antara 1 logit dan RMSE person (MODEL); tafsiran teraman tabel Fisher (2007) |
| Person di atas threshold tersulit | 4,3% |  |
| Person di bawah threshold termudah | 0,3% |  |
| Skor ekstrem (maks / min) | 1 / 0 |  |

Rujukan:

- Fisher, W. P., Jr. (2007). Rating scale instrument quality criteria. Rasch Measurement Transactions, 21(1), 1095.
- Wright, B. D., & Stone, M. H. (1979). Best test design. Chicago: MESA Press.

</details>

### Fungsi Kategori

Kategori jawaban dapat dibayangkan sebagai anak tangga. Setiap threshold adalah titik tempat responden beralih dari satu kategori ke kategori berikutnya, dan seharusnya lebih tinggi daripada threshold sebelumnya. Bila sebuah threshold lebih rendah dari sebelumnya, ada kategori yang jarang menjadi pilihan paling mungkin bagi siapa pun, sehingga responden kemungkinan sulit membedakannya dari kategori di sebelahnya.

Pada RSM, semua butir berbagi threshold yang sama: -1,71; -0,48; 0,36; 1,83 logit (naik berurutan).

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Jumlah kategori ditandai < observasi minimum | 0 | >= 10 per kategori |
| Threshold tidak berurutan | 0 | 0 |
| Rata-rata measure tidak naik | 0 | 0 |
| Outfit kategori tinggi | 0 | >= 2,0 dan melampaui harapan model (z > 1,645) |
| Kategori '1' | n 323 (7,8%), rerata measure -1,52, outfit 1,82 (harapan 1,98), threshold - (SE -) |  |
| Kategori '2' | n 758 (18,3%), rerata measure -0,59, outfit 1,08 (harapan 1,04), threshold -1,71 (SE 0,06) |  |
| Kategori '3' | n 1021 (24,7%), rerata measure 0,20, outfit 0,81 (harapan 0,80), threshold -0,48 (SE 0,04) |  |
| Kategori '4' | n 1243 (30,0%), rerata measure 1,01, outfit 0,74 (harapan 0,72), threshold 0,36 (SE 0,04) |  |
| Kategori '5' | n 794 (19,2%), rerata measure 2,10, outfit 1,25 (harapan 1,26), threshold 1,83 (SE 0,04) |  |

Rujukan:

- Linacre, J. M. (2002). Optimizing rating scale category effectiveness. Journal of Applied Measurement, 3(1), 85-106.
- Andrich, D. (1978). A rating formulation for ordered response categories. Psychometrika, 43(4), 561-573.
- Masters, G. N. (1982). A Rasch model for partial credit scoring. Psychometrika, 47(2), 149-174.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)

</details>

### Keadilan Butir antar-Kelompok (DIF)

DIF terjadi bila dua orang dengan kemampuan yang sama, tetapi dari kelompok berbeda, memiliki peluang berbeda untuk menjawab benar sebuah butir, seperti timbangan yang berat sebelah. Measure setiap responden dikunci, lalu kesulitan setiap butir dihitung ulang terpisah untuk tiap kelompok.

Analisis ini melibatkan sekitar 178 responden kelompok L dan 170 responden kelompok P. Pada sampel kecil, DIF yang nyata dapat terlewat; pada sampel sangat besar, perbedaan kecil pun dapat signifikan, sehingga besar selisih (logit) lebih penting daripada nilai t.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Kelompok (A / B) | L / P | kontras = measure A - measure B |
| Kriteria penanda | kontras mutlak >= 0,5 dan |t| > 2,0 | Draba (1977): t > 2,0; t > 2,4 bila lebih dari 20 butir |
| Kategori ETS (A / B / C) | 12 / 0 / 0 | C: DIF mutlak >= 0,64 dan bermakna melampaui 0,43 (p < 0,05) |

Rujukan:

- Draba, R. E. (1977). The identification and interpretation of item bias (MESA Memorandum No. 25). Chicago: MESA, University of Chicago.
- Zwick, R., Thayer, D. T., & Lewis, C. (1999). An empirical Bayes approach to Mantel-Haenszel DIF analysis. Journal of Educational Measurement, 36(1), 1-28.
- Welch, B. L. (1947). The generalization of 'Student's' problem when several different population variances are involved. Biometrika, 34(1/2), 28-35.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)

</details>
