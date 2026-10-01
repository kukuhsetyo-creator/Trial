"""Glosarium istilah Rasch dalam bahasa awam.

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
    "logit": Term(
        "Logit",
        "Satuan 'penggaris bersama' untuk kemampuan orang dan kesulitan butir.",
        "Logit adalah satuan ukur pada analisis Rasch. Kemampuan responden dan kesulitan "
        "butir diletakkan pada penggaris yang sama, sehingga keduanya dapat dibandingkan "
        "langsung. Bila kemampuan seseorang sama dengan kesulitan butir, peluangnya menjawab "
        "benar 50%; setiap selisih satu logit mengubah peluang itu dengan cara yang sama di "
        "mana pun posisinya pada penggaris.",
    ),
    "measure": Term(
        "Measure",
        "Posisi responden atau butir pada penggaris logit.",
        "Measure person adalah perkiraan kemampuan (atau tingkat sifat yang diukur) seorang "
        "responden; measure item adalah perkiraan kesulitan butir. Rata-rata kesulitan butir "
        "ditetapkan 0 logit sebagai titik acuan.",
    ),
    "se": Term(
        "SE (galat baku)",
        "Seberapa presisi sebuah measure; makin kecil makin presisi.",
        "Standard error menunjukkan ketidakpastian perkiraan. Secara kasar, measure yang "
        "sebenarnya kemungkinan besar berada dalam rentang measure plus-minus dua kali SE. "
        "SE mengecil bila jumlah butir (untuk person) atau jumlah responden (untuk butir) "
        "bertambah.",
    ),
    "infit": Term(
        "Infit",
        "Ukuran kecocokan yang peka terhadap jawaban tak terduga dari responden yang "
        "kemampuannya dekat dengan kesulitan butir.",
        "Infit adalah mean-square berbobot informasi. Statistik ini paling peka terhadap pola "
        "jawaban yang aneh dari responden yang setara dengan butir, misalnya butir yang "
        "membingungkan bagi responden dengan kemampuan sedang.",
    ),
    "outfit": Term(
        "Outfit",
        "Ukuran kecocokan yang peka terhadap jawaban sangat tak terduga, seperti salah "
        "ceroboh atau tebakan beruntung.",
        "Outfit adalah rata-rata kuadrat residual terstandar tanpa pembobotan. Statistik ini "
        "mudah naik oleh beberapa jawaban yang sangat mengejutkan, misalnya responden pandai "
        "yang salah pada soal sangat mudah, atau responden lemah yang benar pada soal sangat "
        "sulit.",
    ),
    "mnsq": Term(
        "MNSQ (mean-square)",
        "Rasio 'kejutan' teramati terhadap yang wajar; nilai ideal 1,0.",
        "MNSQ membandingkan seberapa besar jawaban menyimpang dari harapan model dengan "
        "penyimpangan yang wajar terjadi secara acak. Nilai 1 berarti sesuai harapan, di atas "
        "1 berarti lebih banyak kejutan (noise), dan di bawah 1 berarti pola terlalu mudah "
        "ditebak. Rentang 0,5 sampai 1,5 dianggap produktif untuk pengukuran.",
    ),
    "zstd": Term(
        "ZSTD",
        "Uji signifikansi MNSQ dalam bentuk skor-z; peka terhadap ukuran sampel.",
        "ZSTD mengubah MNSQ menjadi statistik yang kira-kira berdistribusi normal baku "
        "(transformasi Wilson-Hilferty). Pada sampel besar, penyimpangan kecil yang tidak "
        "berarti secara praktis pun dapat memberi ZSTD besar, sehingga MNSQ lebih diutamakan "
        "untuk menilai besarnya masalah.",
    ),
    "separation": Term(
        "Separasi",
        "Berapa kali sebaran 'sebenarnya' lebih besar daripada galat pengukuran.",
        "Separasi membandingkan sebaran measure yang sebenarnya dengan rata-rata galat ukur. "
        "Separasi person 2 berarti tes mampu memisahkan responden ke dalam beberapa tingkat "
        "kemampuan yang berbeda secara bermakna; separasi item 3 berarti urutan kesulitan "
        "butir cukup mantap.",
    ),
    "reliability": Term(
        "Reliabilitas",
        "Seberapa konsisten urutan responden (atau butir) bila pengukuran diulang.",
        "Reliabilitas Rasch adalah proporsi varians measure yang bukan galat. Reliabilitas "
        "person 0,80 berarti 80% perbedaan measure antar-responden mencerminkan perbedaan "
        "sebenarnya. Nilainya setara dengan reliabilitas klasik, tetapi dihitung dari measure.",
    ),
    "strata": Term(
        "Strata",
        "Perkiraan jumlah kelompok kemampuan yang dapat dibedakan secara statistik.",
        "Strata dihitung sebagai (4 x separasi + 1) / 3 (Wright & Masters, 2002). Strata 3 "
        "berarti tes kira-kira dapat membedakan kelompok rendah, sedang, dan tinggi.",
    ),
    "threshold": Term(
        "Threshold",
        "Titik pada penggaris tempat dua kategori jawaban yang berdampingan sama mungkinnya.",
        "Pada skala bertingkat, threshold (Andrich threshold) adalah titik tempat peluang "
        "memilih kategori k sama dengan peluang memilih kategori k-1. Threshold seharusnya "
        "naik berurutan seperti anak tangga; bila tidak berurutan, ada kategori yang jarang "
        "menjadi pilihan paling mungkin.",
    ),
    "ptmeasure": Term(
        "Korelasi point-measure",
        "Korelasi antara jawaban pada sebuah butir dan measure responden; seharusnya positif.",
        "Korelasi ini menunjukkan apakah responden yang lebih mampu cenderung mendapat skor "
        "lebih tinggi pada butir tersebut. Nilai negatif mengindikasikan kemungkinan kunci "
        "jawaban salah atau butir berkalimat negatif yang skornya belum dibalik. Kolom "
        "'harapan' memberi nilai yang diperkirakan model sebagai pembanding.",
    ),
    "dif": Term(
        "DIF",
        "Butir berperilaku berbeda bagi kelompok yang kemampuannya setara.",
        "Differential Item Functioning terjadi bila dua kelompok (misalnya laki-laki dan "
        "perempuan) dengan kemampuan sama memiliki peluang berbeda untuk menjawab benar sebuah "
        "butir. DIF adalah tanda untuk menelaah isi butir, bukan bukti otomatis bahwa butir "
        "itu bias.",
    ),
    "unidimensionality": Term(
        "Unidimensionalitas",
        "Semua butir mengukur satu kemampuan atau sifat utama yang sama.",
        "Model Rasch mengasumsikan semua butir mengukur satu dimensi. Asumsi ini diperiksa "
        "dengan PCA residual: setelah pengaruh measure dikeluarkan, sisa jawaban seharusnya "
        "acak. Eigenvalue kontras pertama di bawah 2 mendukung asumsi tersebut.",
    ),
    "q3": Term(
        "Yen's Q3",
        "Korelasi residual antar-pasangan butir untuk mendeteksi butir yang saling bergantung.",
        "Q3 yang jauh di atas rata-rata menandakan dua butir 'saling terkait' di luar "
        "kemampuan yang diukur, misalnya soal bertingkat dari satu wacana atau dua butir "
        "dengan redaksi hampir sama.",
    ),
    "extreme": Term(
        "Skor ekstrem",
        "Skor nol atau sempurna; measure-nya diperkirakan dengan penyesuaian 0,3 poin.",
        "Responden yang menjawab semua butir benar (atau semua salah) tidak memberi informasi "
        "tentang batas kemampuannya, sehingga tidak ikut estimasi parameter. Measure mereka "
        "diperkirakan seolah-olah skornya kurang (atau lebih) 0,3 poin dari batas.",
    ),
}


def tooltip(key: str) -> str:
    """Teks tooltip satu kalimat untuk istilah ``key``."""
    t = GLOSSARY.get(key)
    return f"{t.term}: {t.short}" if t else ""
