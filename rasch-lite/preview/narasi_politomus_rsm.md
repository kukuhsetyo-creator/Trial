## Ringkasan 1 Menit (Rating Scale Model (Andrich))

- 🟢 **Reliability** (Hijau): Tes cukup konsisten membedakan person (person reliability 0,89, person separation 2,87) dan hierarki kesulitan item-nya stabil (item reliability 0,99).
- 🟢 **Item Fit** (Hijau): Semua 12 item berperilaku sesuai harapan model (Infit dan Outfit MNSQ dalam rentang 0,5-1,5).
- 🟢 **Dimensionality** (Hijau): Data mendukung unidimensionality: tes mengukur satu hal utama (first contrast eigenvalue 1,52 < 2,0) tanpa pasangan item yang saling bergantung.
- 🟡 **Targeting** (Kuning): Rata-rata person measure berada 0,53 logit di atas rata-rata item measure; person cenderung mudah memberi skor tinggi pada item-item ini.
- 🟢 **Category Functioning** (Hijau): Kategori jawaban berfungsi berurutan dan cukup sering dipakai.
- 🟢 **DIF** (Hijau): Tidak ada item yang menunjukkan DIF bermakna antara kelompok L dan P.

## Penjelasan

Analisis Rasch menempatkan kemampuan person (responden) dan kesulitan item (butir) pada satu 'penggaris bersama' yang satuannya disebut logit; posisi pada penggaris itu disebut measure. Titik nol penggaris ditetapkan pada rata-rata item measure; angka positif berarti di atas rata-rata itu, angka negatif di bawahnya.

Pada skala bertingkat, person measure yang lebih tinggi daripada item measure berarti person itu lebih mungkin memilih kategori jawaban yang lebih tinggi (misalnya 'setuju' daripada 'netral'). Selisih yang sama selalu bermakna sama di bagian mana pun penggaris, sehingga measure dapat dibandingkan secara adil antar-person.

### Reliability and Separation

Reliability dapat dibayangkan seperti timbangan badan: timbangan yang baik memberi angka yang hampir sama bila Anda menimbang dua kali. Dalam analisis Rasch, person reliability sebesar 0,89 mengindikasikan bahwa sekitar 89% perbedaan measure antar-person mencerminkan perbedaan yang sebenarnya, sedangkan sisanya adalah galat ukur. Person separation 2,87 berarti tes ini kira-kira mampu memisahkan person ke dalam 4 kelompok kemampuan yang berbeda secara statistik (person strata 4,17).

Untuk item, item reliability 0,99 dan item separation 9,50 menunjukkan seberapa stabil hierarki kesulitan item bila tes diberikan pada sampel lain yang serupa. Nilai ini terutama dipengaruhi jumlah person: makin banyak person, makin presisi posisi setiap item.

Sebagai pembanding klasik, Cronbach's alpha sebesar 0,91 dihitung dari 306 person dengan jawaban lengkap. Angka ini sering sedikit berbeda dari person reliability Rasch karena memakai raw score dan menyertakan extreme score.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Person reliability (REAL / MODEL) | 0,89 / 0,91 | baik >= 0,80; rendah < 0,67 |
| Person separation (REAL / MODEL) | 2,87 / 3,10 | >= 2,0 |
| Person strata | 4,17 | (4G + 1) / 3 |
| Item reliability (REAL / MODEL) | 0,99 / 0,99 | >= 0,90 |
| Item separation (REAL / MODEL) | 9,50 / 9,66 | >= 3,0 |
| Person RMSE (REAL) | 0,418 |  |
| Person measure SD (population) | 1,271 |  |
| Cronbach's alpha | 0,91 | n lengkap = 306 |

Rujukan:

- Fisher, W. P., Jr. (2007). Rating scale instrument quality criteria. Rasch Measurement Transactions, 21(1), 1095.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)
- Wright, B. D., & Masters, G. N. (2002). Number of person or item strata. Rasch Measurement Transactions, 16(3), 888.
- Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. Psychometrika, 16(3), 297-334.

</details>

### Item and Person Fit

Statistik fit bekerja seperti alarm kejutan. MNSQ bernilai 1 berarti jawaban menyimpang dari harapan model sebesar yang wajar terjadi secara acak. Nilai di atas 1,5 (underfit) berarti terlalu banyak kejutan, misalnya person pandai yang salah pada soal mudah; nilai di bawah 0,5 (overfit) berarti pola jawaban terlalu mudah ditebak. Infit lebih peka terhadap kejutan dari person yang kemampuannya setara dengan kesulitan item, sedangkan outfit lebih peka terhadap beberapa jawaban yang sangat mengejutkan.

Pada sisi person fit, 65 dari 349 person non-extreme (19%) memiliki MNSQ di luar rentang 0,5-1,5; yang paling menyimpang antara lain R0134, R0091, R0075, R0207 dan R0005. Karena setiap person hanya menjawab 12 item, person MNSQ berfluktuasi cukup besar secara kebetulan, sehingga sebagian person dapat tampak misfit walaupun menjawab dengan wajar. Pola yang benar-benar menyimpang dapat berasal dari menjawab asal, menebak, kelelahan, atau kesalahan entri data; karena itu person tersebut perlu diperiksa, bukan otomatis dihapus.

**Saran tindakan:**

- Periksa lembar jawaban person yang misfit; sebagai analisis sensitivitas, jalankan ulang tanpa mereka dan bandingkan hasilnya.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| MNSQ fit range | 0,5-1,5 | productive for measurement |
| Degrading MNSQ limit | 2,0 | > nilai ini: merah |
| Mean item Infit / Outfit MNSQ | 1,00 / 1,00 | ~1,00 |
| Mean person Infit / Outfit MNSQ | 1,00 / 1,00 | ~1,00 |
| Misfitting items | 0 | 0 |
| Items with negative PTMEA | 0 | 0 |
| Misfitting persons | 65 (18,6%) |  |

Rujukan:

- Linacre, J. M. (2002). What do infit and outfit, mean-square and standardized mean? Rasch Measurement Transactions, 16(2), 878.
- Wright, B. D., & Masters, G. N. (1982). Rating scale analysis. Chicago: MESA Press.
- Wilson, E. B., & Hilferty, M. M. (1931). The distribution of chi-square. Proceedings of the National Academy of Sciences, 17(12), 684-688.

</details>

### Dimensionality and Local Dependence

Unidimensionality berarti semua item mengukur satu hal yang sama, seperti semua soal ujian matematika memang mengukur kemampuan matematika dan bukan kemampuan membaca. Setelah pengaruh measure dikeluarkan, sisa jawaban (residual) seharusnya acak. PCA of residuals (analisis komponen utama atas residual) mencari pola yang tersisa; first contrast eigenvalue menyatakan kekuatan pola itu dalam satuan 'setara sekian item'.

Raw variance explained by measures sebesar 56,3%. Angka ini sangat bergantung pada sebaran kemampuan person dan kesulitan item, sehingga tidak dipakai sebagai kriteria tunggal.

Pola yang tersisa (eigenvalue 1,52) masih dalam batas yang wajar terjadi secara kebetulan.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| First contrast eigenvalue | 1,52 | < 2,0 hijau; >= 3,0 merah |
| Raw variance explained by measures | 56,3% | tidak dipakai sebagai kriteria |
| First contrast (% of total variance) | 5,5% |  |
| Mean Q3 | -0,092 |  |
| Q3 cutoff (mean Q3 + 0,2) | 0,108 | +0,2 |
| Max Q3 | 0,101 |  |
| Flagged Q3 pairs | 0 | 0 |

Rujukan:

- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)
- Raîche, G. (2005). Critical eigenvalue sizes in standardized residual principal components analysis. Rasch Measurement Transactions, 19(1), 1012.
- Linacre, J. M. (2006). Data variance explained by Rasch measures. Rasch Measurement Transactions, 20(1), 1045.
- Christensen, K. B., Makransky, G., & Horton, M. (2017). Critical values for Yen's Q3: Identification of local dependence in the Rasch model using residual correlations. Applied Psychological Measurement, 41(3), 178-194.
- Yen, W. M. (1984). Effects of local item dependence on the fit and equating performance of the three-parameter logistic model. Applied Psychological Measurement, 8(2), 125-145.

</details>

### Targeting

Targeting ibarat memasang mistar lompat tinggi. Bila mistar dipasang jauh di bawah kemampuan semua peserta, semuanya lolos dan kita tidak tahu siapa yang paling hebat; bila terlalu tinggi, semuanya gagal. Tes yang well-targeted berisi item dengan kesulitan yang menyebar di sekitar kemampuan person, sehingga setiap item memberi informasi.

Rata-rata person measure adalah 0,53 logit, sedangkan rata-rata item measure ditetapkan 0 logit; selisihnya 0,53 logit, yang mengindikasikan person cenderung mudah memberi skor tinggi pada item-item ini. Sekitar 4% person berada di atas threshold tersulit dan 0% di bawah threshold termudah, wilayah tempat tes memberi sedikit informasi.

Sebanyak 1 person mendapat skor maksimum dan 0 skor minimum (extreme score). Batas kemampuan mereka tidak terukur oleh tes ini, sehingga measure mereka hanya perkiraan dengan penyesuaian 0,3 poin.

**Saran tindakan:**

- Tambahkan item yang lebih sulit (pernyataan yang lebih 'berat' untuk disetujui) agar person berkemampuan tinggi juga terukur presisi.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Mean person measure (non-extreme) | 0,53 |  |
| Person measure SD | 1,27 |  |
| Mean item measure | 0,00 | 0 (identifikasi skala) |
| Targeting (mean difference) | 0,53 logit = 1,35 satuan | < 1,0 satuan hijau; >= 2,0 satuan merah |
| Targeting unit | 0,390 logit | yang lebih kecil antara 1 logit dan person RMSE (MODEL); tafsiran teraman tabel Fisher (2007) |
| Persons above the hardest threshold | 4,3% |  |
| Persons below the easiest threshold | 0,3% |  |
| Extreme scores (maximum / minimum) | 1 / 0 |  |

Rujukan:

- Fisher, W. P., Jr. (2007). Rating scale instrument quality criteria. Rasch Measurement Transactions, 21(1), 1095.
- Wright, B. D., & Stone, M. H. (1979). Best test design. Chicago: MESA Press.

</details>

### Category Functioning

Kategori jawaban dapat dibayangkan sebagai anak tangga. Setiap Andrich threshold adalah titik tempat person beralih dari satu kategori ke kategori berikutnya, dan seharusnya lebih tinggi daripada threshold sebelumnya. Bila sebuah threshold lebih rendah dari sebelumnya (disordered threshold), ada kategori yang jarang menjadi pilihan paling mungkin bagi siapa pun, sehingga person kemungkinan sulit membedakannya dari kategori di sebelahnya.

Pada RSM, semua item berbagi Andrich threshold yang sama: -1,71; -0,48; 0,36; 1,83 logit (naik berurutan).

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Categories below minimum count | 0 | >= 10 observasi per kategori |
| Disordered thresholds | 0 | 0 |
| Disordered observed averages | 0 | 0 |
| High category outfit | 0 | >= 2,0 dan melampaui harapan model (z > 1,645) |
| Category '1' | count 323 (7,8%), observed average -1,52, outfit 1,82 (exp. 1,98), Andrich threshold - (SE -) |  |
| Category '2' | count 758 (18,3%), observed average -0,59, outfit 1,08 (exp. 1,04), Andrich threshold -1,71 (SE 0,06) |  |
| Category '3' | count 1021 (24,7%), observed average 0,20, outfit 0,81 (exp. 0,80), Andrich threshold -0,48 (SE 0,04) |  |
| Category '4' | count 1243 (30,0%), observed average 1,01, outfit 0,74 (exp. 0,72), Andrich threshold 0,36 (SE 0,04) |  |
| Category '5' | count 794 (19,2%), observed average 2,10, outfit 1,25 (exp. 1,26), Andrich threshold 1,83 (SE 0,04) |  |

Rujukan:

- Linacre, J. M. (2002). Optimizing rating scale category effectiveness. Journal of Applied Measurement, 3(1), 85-106.
- Andrich, D. (1978). A rating formulation for ordered response categories. Psychometrika, 43(4), 561-573.
- Masters, G. N. (1982). A Rasch model for partial credit scoring. Psychometrika, 47(2), 149-174.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)

</details>

### Differential Item Functioning (DIF)

DIF terjadi bila dua orang dengan kemampuan yang sama, tetapi dari kelompok berbeda, memiliki peluang berbeda untuk menjawab benar sebuah item, seperti timbangan yang berat sebelah. Person measure setiap person dikunci (anchored), lalu item measure dihitung ulang terpisah untuk tiap kelompok; selisih keduanya disebut DIF contrast.

Analisis ini melibatkan sekitar 178 person kelompok L dan 170 person kelompok P. Pada sampel kecil, DIF yang nyata dapat terlewat; pada sampel sangat besar, perbedaan kecil pun dapat signifikan, sehingga besar DIF contrast (logit) lebih penting daripada nilai t.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Groups (A / B) | L / P | DIF contrast = measure A - measure B |
| Flagging criterion | DIF contrast mutlak >= 0,5 dan t mutlak > 2,0 | Draba (1977): t > 2,0; t > 2,4 bila lebih dari 20 item |
| ETS category (A / B / C) | 12 / 0 / 0 | C: DIF mutlak >= 0,64 dan bermakna melampaui 0,43 (p < 0,05) |

Rujukan:

- Draba, R. E. (1977). The identification and interpretation of item bias (MESA Memorandum No. 25). Chicago: MESA, University of Chicago.
- Zwick, R., Thayer, D. T., & Lewis, C. (1999). An empirical Bayes approach to Mantel-Haenszel DIF analysis. Journal of Educational Measurement, 36(1), 1-28.
- Welch, B. L. (1947). The generalization of 'Student's' problem when several different population variances are involved. Biometrika, 34(1/2), 28-35.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)

</details>
