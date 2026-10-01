"""Glosarium istilah Rasch: nama istilah dalam bahasa Inggris aslinya, penjelasan
dalam bahasa Indonesia yang mudah dipahami.

``short`` dipakai sebagai tooltip di GUI (satu kalimat); ``long`` dipakai di
tab Glosarium dan laporan.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Term:
    term: str
    short: str
    long: str


GLOSSARY: dict[str, Term] = {
    "item": Term(
        "Item",
        "Satu soal atau pernyataan dalam tes atau angket (sering disebut butir).",
        "Item adalah satu soal, pertanyaan, atau pernyataan yang dijawab person. Dalam analisis "
        "Rasch setiap item memperoleh item measure, yaitu posisi tingkat kesulitannya (atau "
        "seberapa berat pernyataan itu untuk disetujui) pada skala logit.",
    ),
    "person": Term(
        "Person",
        "Satu responden atau peserta tes yang jawabannya dianalisis.",
        "Person adalah sebutan baku dalam pemodelan Rasch untuk setiap responden, peserta tes, "
        "atau subjek yang memberikan jawaban. Setiap person memperoleh person measure, yaitu "
        "perkiraan kemampuan atau tingkat sifat yang diukur, pada skala logit yang sama dengan item.",
    ),
    "raw_score": Term(
        "Raw Score",
        "Jumlah skor jawaban sebelum diubah menjadi measure dalam logit.",
        "Raw score adalah jumlah skor jawaban seorang person (atau jumlah skor yang diperoleh "
        "sebuah item dari semua person). Model Rasch mengubah raw score menjadi measure pada "
        "skala logit sehingga selisih antar-measure bermakna sama di seluruh rentang skala, "
        "sesuatu yang tidak dimiliki raw score.",
    ),
    "logit": Term(
        "Logit",
        "Satuan 'penggaris bersama' untuk kemampuan person dan kesulitan item.",
        "Logit (log-odds unit) adalah satuan ukur pada analisis Rasch. Kemampuan person dan "
        "kesulitan item diletakkan pada penggaris yang sama, sehingga keduanya dapat dibandingkan "
        "langsung. Bila kemampuan seseorang sama dengan kesulitan item, peluangnya menjawab benar "
        "50%; setiap selisih satu logit mengubah peluang itu dengan cara yang sama di mana pun "
        "posisinya pada penggaris.",
    ),
    "measure": Term(
        "Measure",
        "Posisi person atau item pada penggaris logit.",
        "Person measure adalah perkiraan kemampuan (atau tingkat sifat yang diukur) seorang person; "
        "item measure adalah perkiraan kesulitan item. Rata-rata item measure ditetapkan 0 logit "
        "sebagai titik acuan skala.",
    ),
    "se": Term(
        "Standard Error (SE)",
        "Seberapa presisi sebuah measure; makin kecil makin presisi.",
        "Standard error (Model SE) menunjukkan ketidakpastian perkiraan measure. Secara kasar, "
        "measure yang sebenarnya kemungkinan besar berada dalam rentang measure plus-minus dua kali "
        "SE. SE mengecil bila jumlah item (untuk person) atau jumlah person (untuk item) bertambah.",
    ),
    "extreme": Term(
        "Extreme Score",
        "Skor nol atau sempurna; measure-nya diperkirakan dengan penyesuaian 0,3 poin.",
        "Person yang menjawab semua item benar (atau semua salah) memiliki extreme score: tes tidak "
        "memberi informasi tentang batas kemampuannya, sehingga ia tidak ikut estimasi parameter. "
        "Measure-nya diperkirakan seolah-olah skornya kurang (atau lebih) 0,3 poin dari batas. "
        "Hal yang sama berlaku untuk item yang dijawab benar atau salah oleh semua person.",
    ),
    "mnsq": Term(
        "Mean-Square (MNSQ)",
        "Rasio 'kejutan' teramati terhadap yang wajar menurut model; nilai ideal 1,0.",
        "MNSQ membandingkan seberapa besar jawaban menyimpang dari harapan model dengan "
        "penyimpangan yang wajar terjadi secara acak. Nilai 1 berarti sesuai harapan, di atas 1 "
        "berarti lebih banyak kejutan (noise), dan di bawah 1 berarti pola terlalu mudah ditebak. "
        "Rentang 0,5 sampai 1,5 dianggap produktif untuk pengukuran (Linacre, 2002).",
    ),
    "infit": Term(
        "Infit MNSQ",
        "Statistik fit yang peka terhadap jawaban tak terduga dari person yang kemampuannya dekat "
        "dengan kesulitan item.",
        "Infit adalah mean-square berbobot informasi (information-weighted). Statistik ini paling "
        "peka terhadap pola jawaban yang aneh dari person yang setara dengan item, misalnya item "
        "yang membingungkan bagi person dengan kemampuan sedang.",
    ),
    "outfit": Term(
        "Outfit MNSQ",
        "Statistik fit yang peka terhadap jawaban sangat tak terduga, seperti salah ceroboh atau "
        "tebakan beruntung.",
        "Outfit (outlier-sensitive fit) adalah rata-rata kuadrat standardized residual tanpa "
        "pembobotan. Statistik ini mudah naik oleh beberapa jawaban yang sangat mengejutkan, "
        "misalnya person pandai yang salah pada soal sangat mudah, atau person lemah yang benar "
        "pada soal sangat sulit.",
    ),
    "zstd": Term(
        "ZSTD",
        "Uji signifikansi MNSQ dalam bentuk skor-z; peka terhadap ukuran sampel.",
        "ZSTD (standardized fit) mengubah MNSQ menjadi statistik yang kira-kira berdistribusi "
        "normal baku (transformasi Wilson-Hilferty). Pada sampel besar, penyimpangan kecil yang "
        "tidak berarti secara praktis pun dapat memberi ZSTD besar, sehingga MNSQ lebih diutamakan "
        "untuk menilai besarnya masalah.",
    ),
    "misfit": Term(
        "Misfit (Underfit / Overfit)",
        "Item atau person yang MNSQ-nya berada di luar rentang yang dipakai.",
        "Underfit (MNSQ terlalu tinggi) berarti pola jawaban lebih acak atau lebih mengejutkan "
        "daripada harapan model; kondisi ini yang paling mengganggu pengukuran. Overfit (MNSQ "
        "terlalu rendah) berarti pola jawaban terlalu mudah ditebak, misalnya karena item yang "
        "isinya hampir sama; umumnya tidak merusak measure tetapi dapat membuat reliability tampak "
        "terlalu tinggi.",
    ),
    "ptmeasure": Term(
        "Point-Measure Correlation (PTMEA Corr.)",
        "Korelasi antara skor sebuah item dan person measure; seharusnya positif.",
        "Korelasi ini menunjukkan apakah person yang lebih mampu cenderung mendapat skor lebih "
        "tinggi pada item tersebut. Nilai negatif mengindikasikan kemungkinan kunci jawaban salah "
        "atau item berkalimat negatif (reverse-coded) yang skornya belum dibalik. Kolom 'exp.' "
        "memberi nilai yang diharapkan model sebagai pembanding bagi nilai teramati ('obs.').",
    ),
    "reliability": Term(
        "Reliability",
        "Seberapa konsisten urutan person (atau item) bila pengukuran diulang.",
        "Rasch reliability adalah proporsi varians measure yang bukan galat ukur. Person "
        "reliability 0,80 berarti 80% perbedaan measure antar-person mencerminkan perbedaan yang "
        "sebenarnya. Nilainya sebanding dengan koefisien reliability klasik seperti Cronbach's alpha, "
        "tetapi dihitung dari measure. "
        "Angka REAL memperhitungkan misfit sehingga lebih konservatif daripada angka MODEL.",
    ),
    "separation": Term(
        "Separation",
        "Berapa kali sebaran 'sebenarnya' lebih besar daripada galat pengukuran.",
        "Separation membandingkan sebaran measure yang sebenarnya dengan rata-rata galat ukur "
        "(RMSE). Person separation 2 berarti tes mampu memisahkan person ke dalam beberapa tingkat "
        "kemampuan yang berbeda secara bermakna; item separation 3 berarti urutan kesulitan item "
        "cukup mantap.",
    ),
    "strata": Term(
        "Strata",
        "Perkiraan jumlah kelompok kemampuan yang dapat dibedakan secara statistik.",
        "Strata dihitung sebagai (4 x separation + 1) / 3 (Wright & Masters, 2002). Strata 3 "
        "berarti tes kira-kira dapat membedakan kelompok rendah, sedang, dan tinggi.",
    ),
    "targeting": Term(
        "Targeting",
        "Kesesuaian tingkat kesulitan item dengan kemampuan person.",
        "Targeting dinilai dari selisih rata-rata person measure dengan rata-rata item measure "
        "(yang ditetapkan 0 logit). Tes yang well-targeted berisi item yang tersebar di sekitar "
        "kemampuan sebagian besar person, sehingga setiap item memberi informasi dan measure "
        "diperoleh dengan presisi tertinggi.",
    ),
    "threshold": Term(
        "Andrich Threshold",
        "Titik pada penggaris tempat dua kategori jawaban yang berdampingan sama mungkinnya.",
        "Pada skala bertingkat, Andrich threshold adalah titik tempat peluang memilih kategori k "
        "sama dengan peluang memilih kategori k-1. Threshold seharusnya naik berurutan seperti anak "
        "tangga. Threshold location adalah posisi threshold itu pada skala logit, yaitu item "
        "measure ditambah Andrich threshold.",
    ),
    "disordered_threshold": Term(
        "Disordered Threshold",
        "Threshold yang lebih rendah daripada threshold sebelumnya.",
        "Disordered threshold berarti ada kategori jawaban yang tidak pernah menjadi pilihan "
        "paling mungkin bagi person pada tingkat kemampuan mana pun. Kondisi ini mengindikasikan "
        "bahwa person sulit membedakan kategori tersebut dari kategori di sebelahnya; solusi yang "
        "umum ditelaah adalah menggabungkan kategori atau memperjelas labelnya.",
    ),
    "observed_average": Term(
        "Observed Average",
        "Rata-rata measure person yang memilih sebuah kategori; seharusnya naik berurutan.",
        "Observed average adalah rata-rata (person measure dikurangi item measure) dari semua "
        "person yang memilih kategori tersebut. Pada skala yang berfungsi baik, kategori yang lebih "
        "tinggi dipilih oleh person yang rata-ratanya lebih tinggi; bila tidak naik (disordered "
        "average), urutan kategori kemungkinan tidak dipahami sesuai maksudnya.",
    ),
    "category_outfit": Term(
        "Category Outfit",
        "Outfit MNSQ untuk penggunaan sebuah kategori jawaban.",
        "Category outfit menunjukkan seberapa tidak terduga sebuah kategori dipakai. Linacre (2002) "
        "memakai pedoman outfit kategori di bawah 2,0. Karena nilai harapan category outfit tidak "
        "selalu 1, RaschLite juga menampilkan expected outfit dan menandai kategori hanya bila "
        "outfit-nya tinggi sekaligus melampaui harapan model secara bermakna.",
    ),
    "unidimensionality": Term(
        "Unidimensionality",
        "Semua item mengukur satu kemampuan atau sifat utama yang sama.",
        "Model Rasch mengasumsikan semua item mengukur satu dimensi. Asumsi ini diperiksa dengan "
        "PCA of residuals: setelah pengaruh measure dikeluarkan, sisa jawaban seharusnya acak. "
        "First contrast eigenvalue di bawah 2 mendukung asumsi tersebut.",
    ),
    "first_contrast": Term(
        "First Contrast (PCA of Residuals)",
        "Pola terkuat yang tersisa setelah measure dikeluarkan; kekuatannya dalam satuan item.",
        "First contrast adalah komponen pertama dari principal component analysis (PCA) atas "
        "standardized residual. Eigenvalue-nya dinyatakan dalam satuan 'setara sekian item'; "
        "loading menunjukkan seberapa kuat setiap item terkait dengan pola itu. Item dengan loading "
        "positif dan negatif yang besar membentuk dua kutub yang isinya perlu dibandingkan.",
    ),
    "q3": Term(
        "Yen's Q3 (Local Dependence)",
        "Korelasi residual antar-pasangan item untuk mendeteksi item yang saling bergantung.",
        "Q3 yang jauh di atas rata-rata Q3 menandakan local dependence: dua item 'saling terkait' "
        "di luar kemampuan yang diukur, misalnya soal bertingkat dari satu wacana atau dua item "
        "dengan redaksi hampir sama. RaschLite memakai batas relatif, yaitu rata-rata Q3 + 0,2 "
        "(Christensen dkk., 2017).",
    ),
    "dif": Term(
        "Differential Item Functioning (DIF)",
        "Item berperilaku berbeda bagi kelompok yang kemampuannya setara.",
        "DIF terjadi bila dua kelompok (misalnya laki-laki dan perempuan) dengan kemampuan sama "
        "memiliki peluang berbeda untuk menjawab benar sebuah item. DIF contrast adalah selisih "
        "item measure antar-kelompok. DIF adalah tanda untuk menelaah isi item, bukan bukti "
        "otomatis bahwa item itu bias.",
    ),
    "ets": Term(
        "ETS DIF Category (A / B / C)",
        "Penggolongan besar DIF: A dapat diabaikan, B sedang, C besar.",
        "Penggolongan ini mengikuti Zwick, Thayer, dan Lewis (1999) dalam satuan logit: C bila "
        "DIF contrast mutlak sedikitnya 0,64 logit dan secara bermakna melampaui 0,43 logit; B bila "
        "DIF sedikitnya 0,43 logit dan bermakna berbeda dari nol; selain itu A.",
    ),
}


def tooltip(key: str) -> str:
    """Teks tooltip satu kalimat untuk istilah ``key``."""
    t = GLOSSARY.get(key)
    return f"{t.term}: {t.short}" if t else ""
