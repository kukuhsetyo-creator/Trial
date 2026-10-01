## Ringkasan 1 Menit (Dichotomous Rasch Model)

- 🟡 **Reliability** (Kuning): Konsistensi pengukuran memadai tetapi belum ideal (person reliability 0,77, person separation 1,83).
- 🟡 **Item Fit** (Kuning): 1 item berada di luar rentang MNSQ 0,5-1,5 dan perlu diperiksa: S07.
- 🟢 **Dimensionality** (Hijau): Data mendukung unidimensionality: tes mengukur satu hal utama (first contrast eigenvalue 1,42 < 2,0) tanpa pasangan item yang saling bergantung.
- 🟢 **Targeting** (Hijau): Tingkat kesulitan item sesuai dengan kemampuan person (selisih rata-rata measure 0,25 logit).
- ⚪ **Category Functioning** (Abu-abu): Tidak berlaku: data dichotomous hanya memiliki dua kategori.
- 🔴 **DIF** (Merah): 1 item menunjukkan DIF besar (ETS category C) dan perlu ditelaah isinya: S12.

## Penjelasan

Analisis Rasch menempatkan kemampuan person (responden) dan kesulitan item (butir) pada satu 'penggaris bersama' yang satuannya disebut logit; posisi pada penggaris itu disebut measure. Titik nol penggaris ditetapkan pada rata-rata item measure; angka positif berarti di atas rata-rata itu, angka negatif di bawahnya.

Ketika kemampuan seorang person sama dengan kesulitan sebuah item, peluangnya menjawab benar adalah 50%. Bila kemampuannya satu logit di atas kesulitan item, peluang itu naik menjadi sekitar 73%; dua logit di atas, sekitar 88%. Selisih yang sama selalu bermakna sama di bagian mana pun penggaris, dan inilah yang membuat measure Rasch berbeda dari sekadar menjumlah jawaban benar (raw score).

### Reliability and Separation

Reliability dapat dibayangkan seperti timbangan badan: timbangan yang baik memberi angka yang hampir sama bila Anda menimbang dua kali. Dalam analisis Rasch, person reliability sebesar 0,77 mengindikasikan bahwa sekitar 77% perbedaan measure antar-person mencerminkan perbedaan yang sebenarnya, sedangkan sisanya adalah galat ukur. Person separation 1,83 berarti tes ini kira-kira mampu memisahkan person ke dalam 2 kelompok kemampuan yang berbeda secara statistik (person strata 2,77).

Untuk item, item reliability 0,99 dan item separation 11,83 menunjukkan seberapa stabil hierarki kesulitan item bila tes diberikan pada sampel lain yang serupa. Nilai ini terutama dipengaruhi jumlah person: makin banyak person, makin presisi posisi setiap item.

Sebagai pembanding klasik, KR-20 sebesar 0,81 dihitung dari 397 person dengan jawaban lengkap. Angka ini sering sedikit berbeda dari person reliability Rasch karena memakai raw score dan menyertakan extreme score.

**Saran tindakan:**

- Pertimbangkan menambah item yang tingkat kesulitannya sesuai dengan kemampuan sebagian besar person, karena item yang well-targeted paling banyak menambah presisi.
- Telaah item yang misfit (lihat bagian Item and Person Fit); item yang 'berisik' menurunkan reliability.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Person reliability (REAL / MODEL) | 0,77 / 0,79 | baik >= 0,80; rendah < 0,67 |
| Person separation (REAL / MODEL) | 1,83 / 1,94 | >= 2,0 |
| Person strata | 2,77 | (4G + 1) / 3 |
| Item reliability (REAL / MODEL) | 0,99 / 0,99 | >= 0,90 |
| Item separation (REAL / MODEL) | 11,83 / 12,02 | >= 3,0 |
| Person RMSE (REAL) | 0,615 |  |
| Person measure SD (population) | 1,282 |  |
| KR-20 | 0,81 | n lengkap = 397 |

Rujukan:

- Fisher, W. P., Jr. (2007). Rating scale instrument quality criteria. Rasch Measurement Transactions, 21(1), 1095.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)
- Wright, B. D., & Masters, G. N. (2002). Number of person or item strata. Rasch Measurement Transactions, 16(3), 888.
- Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. Psychometrika, 16(3), 297-334.

</details>

### Item and Person Fit

Statistik fit bekerja seperti alarm kejutan. MNSQ bernilai 1 berarti jawaban menyimpang dari harapan model sebesar yang wajar terjadi secara acak. Nilai di atas 1,5 (underfit) berarti terlalu banyak kejutan, misalnya person pandai yang salah pada soal mudah; nilai di bawah 0,5 (overfit) berarti pola jawaban terlalu mudah ditebak. Infit lebih peka terhadap kejutan dari person yang kemampuannya setara dengan kesulitan item, sedangkan outfit lebih peka terhadap beberapa jawaban yang sangat mengejutkan.

Item yang underfit (kejutan berlebih): S07 (infit 1,51, outfit 1,96). Pola ini mengindikasikan jawaban yang lebih acak daripada harapan. Kemungkinan penyebabnya antara lain redaksi yang ambigu, kunci jawaban yang keliru, banyak tebakan, atau item yang mengukur hal lain. Bila hanya outfit yang tinggi, sumbernya kemungkinan sedikit jawaban yang sangat mengejutkan (salah ceroboh atau tebakan beruntung), bukan item-nya secara keseluruhan.

Pada sisi person fit, 128 dari 597 person non-extreme (21%) memiliki MNSQ di luar rentang 0,5-1,5; yang paling menyimpang antara lain R0546, R0021, R0510, R0030 dan R0341. Karena setiap person hanya menjawab 20 item, person MNSQ berfluktuasi cukup besar secara kebetulan, sehingga sebagian person dapat tampak misfit walaupun menjawab dengan wajar. Pola yang benar-benar menyimpang dapat berasal dari menjawab asal, menebak, kelelahan, atau kesalahan entri data; karena itu person tersebut perlu diperiksa, bukan otomatis dihapus.

**Saran tindakan:**

- Telaah redaksi, pilihan jawaban, dan kunci S07; revisi bagian yang ambigu.
- Periksa lembar jawaban person yang misfit; sebagai analisis sensitivitas, jalankan ulang tanpa mereka dan bandingkan hasilnya.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| MNSQ fit range | 0,5-1,5 | productive for measurement |
| Degrading MNSQ limit | 2,0 | > nilai ini: merah |
| Mean item Infit / Outfit MNSQ | 1,00 / 1,00 | ~1,00 |
| Mean person Infit / Outfit MNSQ | 1,00 / 1,00 | ~1,00 |
| Misfitting items | 1 | 0 |
| Items with negative PTMEA | 0 | 0 |
| Misfitting persons | 128 (21,4%) |  |
| S07 | Infit 1,51 (ZSTD 11,1), Outfit 1,96 (ZSTD 11,7), PTMEA 0,11 / exp. 0,49 |  |

Rujukan:

- Linacre, J. M. (2002). What do infit and outfit, mean-square and standardized mean? Rasch Measurement Transactions, 16(2), 878.
- Wright, B. D., & Masters, G. N. (1982). Rating scale analysis. Chicago: MESA Press.
- Wilson, E. B., & Hilferty, M. M. (1931). The distribution of chi-square. Proceedings of the National Academy of Sciences, 17(12), 684-688.

</details>

### Dimensionality and Local Dependence

Unidimensionality berarti semua item mengukur satu hal yang sama, seperti semua soal ujian matematika memang mengukur kemampuan matematika dan bukan kemampuan membaca. Setelah pengaruh measure dikeluarkan, sisa jawaban (residual) seharusnya acak. PCA of residuals (analisis komponen utama atas residual) mencari pola yang tersisa; first contrast eigenvalue menyatakan kekuatan pola itu dalam satuan 'setara sekian item'.

Raw variance explained by measures sebesar 37,0%. Angka ini sangat bergantung pada sebaran kemampuan person dan kesulitan item, sehingga tidak dipakai sebagai kriteria tunggal.

Pola yang tersisa (eigenvalue 1,42) masih dalam batas yang wajar terjadi secara kebetulan.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| First contrast eigenvalue | 1,42 | < 2,0 hijau; >= 3,0 merah |
| Raw variance explained by measures | 37,0% | tidak dipakai sebagai kriteria |
| First contrast (% of total variance) | 4,5% |  |
| Mean Q3 | -0,053 |  |
| Q3 cutoff (mean Q3 + 0,2) | 0,147 | +0,2 |
| Max Q3 | 0,056 |  |
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

Rata-rata person measure adalah 0,25 logit, sedangkan rata-rata item measure ditetapkan 0 logit; selisihnya 0,25 logit, relatif kecil sehingga item umumnya berada di sekitar kemampuan person. Sekitar 9% person berada di atas item tersulit dan 4% di bawah item termudah, wilayah tempat tes memberi sedikit informasi.

Sebanyak 3 person mendapat skor maksimum dan 0 skor minimum (extreme score). Batas kemampuan mereka tidak terukur oleh tes ini, sehingga measure mereka hanya perkiraan dengan penyesuaian 0,3 poin.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Mean person measure (non-extreme) | 0,25 |  |
| Person measure SD | 1,28 |  |
| Mean item measure | -0,00 | 0 (identifikasi skala) |
| Targeting (mean difference) | 0,25 logit = 0,42 satuan | < 1,0 satuan hijau; >= 2,0 satuan merah |
| Targeting unit | 0,588 logit | yang lebih kecil antara 1 logit dan person RMSE (MODEL); tafsiran teraman tabel Fisher (2007) |
| Persons above the hardest item | 8,8% |  |
| Persons below the easiest item | 3,5% |  |
| Extreme scores (maximum / minimum) | 3 / 0 |  |

Rujukan:

- Fisher, W. P., Jr. (2007). Rating scale instrument quality criteria. Rasch Measurement Transactions, 21(1), 1095.
- Wright, B. D., & Stone, M. H. (1979). Best test design. Chicago: MESA Press.

</details>

### Category Functioning

Analisis category functioning hanya relevan untuk skala bertingkat (polytomous).

### Differential Item Functioning (DIF)

DIF terjadi bila dua orang dengan kemampuan yang sama, tetapi dari kelompok berbeda, memiliki peluang berbeda untuk menjawab benar sebuah item, seperti timbangan yang berat sebelah. Person measure setiap person dikunci (anchored), lalu item measure dihitung ulang terpisah untuk tiap kelompok; selisih keduanya disebut DIF contrast.

Item yang ditandai: S12 lebih sulit bagi kelompok P (DIF contrast 0,97 logit, t = 4,60, ETS category C).

DIF adalah tanda untuk menelaah isi item, bukan bukti otomatis bahwa item itu bias. Perbedaan dapat bersumber dari konteks budaya, pilihan kata, atau pengalaman yang lebih akrab bagi satu kelompok, tetapi juga dapat mencerminkan perbedaan pembelajaran yang memang nyata.

Analisis ini melibatkan sekitar 304 person kelompok L dan 291 person kelompok P. Pada sampel kecil, DIF yang nyata dapat terlewat; pada sampel sangat besar, perbedaan kecil pun dapat signifikan, sehingga besar DIF contrast (logit) lebih penting daripada nilai t.

**Saran tindakan:**

- Minta panel ahli menelaah isi S12 dari sudut bahasa, konteks, dan keakraban pengalaman bagi tiap kelompok.
- Bila ditemukan sumber bias yang masuk akal, revisi atau ganti item tersebut.

<details><summary>Detail teknis</summary>

| Statistik | Nilai | Kriteria |
|---|---|---|
| Groups (A / B) | L / P | DIF contrast = measure A - measure B |
| Flagging criterion | DIF contrast mutlak >= 0,5 dan t mutlak > 2,0 | Draba (1977): t > 2,0; t > 2,4 bila lebih dari 20 item |
| ETS category (A / B / C) | 19 / 0 / 1 | C: DIF mutlak >= 0,64 dan bermakna melampaui 0,43 (p < 0,05) |
| S12 | 1,16 vs 2,13; DIF contrast -0,97 (Joint SE 0,21), t(553) = -4,60, p < 0,001 |  |

Rujukan:

- Draba, R. E. (1977). The identification and interpretation of item bias (MESA Memorandum No. 25). Chicago: MESA, University of Chicago.
- Zwick, R., Thayer, D. T., & Lewis, C. (1999). An empirical Bayes approach to Mantel-Haenszel DIF analysis. Journal of Educational Measurement, 36(1), 1-28.
- Welch, B. L. (1947). The generalization of 'Student's' problem when several different population variances are involved. Biometrika, 34(1/2), 28-35.
- Linacre, J. M. Winsteps Rasch measurement computer program user's guide. Beaverton, OR: Winsteps.com. (bagian Reliability and separation, Dimensionality, DIF, Table 3.2, STBIAS=, EXTRSCORE=)

</details>
