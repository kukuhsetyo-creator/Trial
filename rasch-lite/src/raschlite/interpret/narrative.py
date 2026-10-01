"""Mesin interpretasi berbasis aturan: Ringkasan 1 Menit, Penjelasan, Detail Teknis.

Semua ambang batas dibaca dari :mod:`raschlite.interpret.rules`. Bahasa sengaja
berhati-hati ("mengindikasikan", "perlu diperiksa") dan tidak menyatakan
kesimpulan kausal atau final. Tidak ada pemanggilan jaringan maupun model bahasa.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import rules

MODEL_NAMES = {
    "dichotomous": "Rasch dikotomus",
    "rsm": "Rating Scale Model (Andrich)",
    "pcm": "Partial Credit Model (Masters)",
}
STATUS_LABELS = {rules.GREEN: "Hijau", rules.YELLOW: "Kuning", rules.RED: "Merah", rules.GRAY: "Abu-abu"}
MAX_LISTED = 6


@dataclass
class Light:
    key: str
    title: str
    status: str
    sentence: str


@dataclass
class TechRow:
    label: str
    value: str
    criterion: str = ""


@dataclass
class Section:
    key: str
    title: str
    status: str
    paragraphs: list[str]
    actions: list[str] = field(default_factory=list)
    technical: list[TechRow] = field(default_factory=list)
    references: list[str] = field(default_factory=list)


@dataclass
class Interpretation:
    model: str
    model_name: str
    lights: list[Light]
    intro: list[str]
    sections: list[Section]
    cautions: list[str]


# ---------------------------------------------------------------------------
# Format angka dan daftar
# ---------------------------------------------------------------------------
def num(x, d: int = 2) -> str:
    """Angka dengan koma desimal; '-' bila tidak tersedia."""
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "-"
    try:
        if not np.isfinite(float(x)):
            return "-"
    except (TypeError, ValueError):
        return str(x)
    return f"{float(x):.{d}f}".replace(".", ",")


def pct(x, d: int = 0) -> str:
    return num(x, d) + "%"


def pval(p) -> str:
    """Nilai p untuk teks: '< 0,001' bila sangat kecil."""
    if p is None or not np.isfinite(p):
        return "-"
    return "< 0,001" if p < 0.001 else num(p, 3)


def names(values, k: int = MAX_LISTED, unit: str = "butir") -> str:
    values = [str(v) for v in values]
    if not values:
        return ""
    if len(values) > k:
        return ", ".join(values[:k]) + f", dan {len(values) - k} {unit} lainnya"
    if len(values) == 1:
        return values[0]
    return ", ".join(values[:-1]) + " dan " + values[-1]


def _refs(*keys: str) -> list[str]:
    return [rules.REFERENCES[k] for k in keys]


# ---------------------------------------------------------------------------
# Pengantar
# ---------------------------------------------------------------------------
def _intro(model: str) -> list[str]:
    if model == "dichotomous":
        second = (
            "Ketika kemampuan seseorang sama dengan kesulitan sebuah soal, peluangnya menjawab "
            "benar adalah 50%. Bila kemampuannya satu logit di atas kesulitan soal, peluang itu "
            "naik menjadi sekitar 73%; dua logit di atas, sekitar 88%. Selisih yang sama selalu "
            "bermakna sama di bagian mana pun penggaris, dan inilah yang membuat skor Rasch "
            "berbeda dari sekadar menjumlah jawaban benar."
        )
    else:
        second = (
            "Pada skala bertingkat, posisi responden yang lebih tinggi daripada posisi butir "
            "berarti ia lebih mungkin memilih kategori jawaban yang lebih tinggi (misalnya "
            "'setuju' daripada 'netral'). Selisih yang sama selalu bermakna sama di bagian mana "
            "pun penggaris, sehingga measure dapat dibandingkan secara adil antar-responden."
        )
    return [
        "Analisis Rasch menempatkan kemampuan responden dan kesulitan butir pada satu "
        "'penggaris bersama' yang satuannya disebut logit. Titik nol penggaris ditetapkan pada "
        "rata-rata kesulitan butir; angka positif berarti di atas rata-rata itu, angka negatif "
        "di bawahnya.",
        second,
    ]


# ---------------------------------------------------------------------------
# Bagian-bagian
# ---------------------------------------------------------------------------
def _reliability(res) -> tuple[Light, Section]:
    s = res.summary
    pr, ps, pstr = s["person_reliability"], s["person_separation"], s["person_strata"]
    ir, isep = s["item_reliability"], s["item_separation"]
    person_ok = pr >= rules.PERSON_RELIABILITY_GOOD and ps >= rules.PERSON_SEPARATION_GOOD
    item_ok = ir >= rules.ITEM_RELIABILITY_GOOD and isep >= rules.ITEM_SEPARATION_GOOD
    if not np.isfinite(pr) or pr < rules.PERSON_RELIABILITY_POOR:
        status = rules.RED
        sentence = (f"Konsistensi pengukuran responden rendah (reliabilitas person {num(pr)}); "
                    "skor individual perlu ditafsirkan dengan sangat hati-hati.")
    elif person_ok and item_ok:
        status = rules.GREEN
        sentence = (f"Tes cukup konsisten membedakan responden (reliabilitas person {num(pr)}, "
                    f"separasi {num(ps)}) dan urutan kesulitan butirnya mantap.")
    else:
        status = rules.YELLOW
        weak = []
        if not person_ok:
            weak.append(f"reliabilitas person {num(pr)}")
        if not item_ok:
            weak.append(f"reliabilitas item {num(ir)}")
        sentence = f"Konsistensi pengukuran memadai tetapi belum ideal ({' dan '.join(weak)})."

    strata_n = int(np.floor(pstr)) if np.isfinite(pstr) else 0
    paras = [
        "Reliabilitas dapat dibayangkan seperti timbangan badan: timbangan yang baik memberi "
        "angka yang hampir sama bila Anda menimbang dua kali. Dalam analisis Rasch, "
        f"reliabilitas person sebesar {num(pr)} mengindikasikan bahwa sekitar {pct(100 * pr)} "
        "perbedaan measure antar-responden mencerminkan perbedaan yang sebenarnya, sedangkan "
        f"sisanya adalah galat ukur. Separasi person {num(ps)} berarti tes ini kira-kira mampu "
        f"memisahkan responden ke dalam {max(strata_n, 1)} kelompok kemampuan yang berbeda "
        f"secara statistik (strata {num(pstr)}).",
        f"Untuk butir, reliabilitas {num(ir)} dan separasi {num(isep)} menunjukkan seberapa mantap "
        "urutan kesulitan butir bila tes diberikan pada sampel lain yang serupa. Nilai ini "
        "terutama dipengaruhi jumlah responden: makin banyak responden, makin presisi posisi "
        "setiap butir.",
    ]
    if np.isfinite(s["alpha"]):
        paras.append(
            f"Sebagai pembanding klasik, {s['alpha_label']} sebesar {num(s['alpha'])} dihitung dari "
            f"{s['alpha_n']} responden dengan jawaban lengkap. Angka ini sering sedikit berbeda "
            "dari reliabilitas person Rasch karena memakai skor mentah dan menyertakan skor ekstrem."
        )
    actions = []
    if not person_ok:
        actions.append("Pertimbangkan menambah butir yang tingkat kesulitannya sesuai dengan kemampuan "
                       "sebagian besar responden, karena butir yang tepat sasaran paling banyak "
                       "menambah presisi.")
        actions.append("Telaah butir yang misfit (lihat bagian Kecocokan Butir); butir yang 'berisik' "
                       "menurunkan reliabilitas.")
    if not item_ok:
        actions.append("Bila tujuan Anda memastikan urutan kesulitan butir, perbanyak responden atau "
                       "libatkan responden dengan kemampuan yang lebih beragam.")
    p, i = s["person"], s["item"]
    tech = [
        TechRow("Reliabilitas person (REAL / MODEL)", f"{num(pr)} / {num(p['model_reliability'])}",
                f"baik >= {num(rules.PERSON_RELIABILITY_GOOD)}; rendah < {num(rules.PERSON_RELIABILITY_POOR)}"),
        TechRow("Separasi person (REAL / MODEL)", f"{num(ps)} / {num(p['model_separation'])}",
                f">= {num(rules.PERSON_SEPARATION_GOOD, 1)}"),
        TechRow("Strata person", num(pstr), "(4G + 1) / 3"),
        TechRow("Reliabilitas item (REAL / MODEL)", f"{num(ir)} / {num(i['model_reliability'])}",
                f">= {num(rules.ITEM_RELIABILITY_GOOD)}"),
        TechRow("Separasi item (REAL / MODEL)", f"{num(isep)} / {num(i['model_separation'])}",
                f">= {num(rules.ITEM_SEPARATION_GOOD, 1)}"),
        TechRow("RMSE person (REAL)", num(p["real_rmse"], 3), ""),
        TechRow("SD measure person (populasi)", num(p["sd"], 3), ""),
        TechRow(s["alpha_label"], num(s["alpha"]), f"n lengkap = {s['alpha_n']}"),
    ]
    section = Section("reliability", "Reliabilitas dan Separasi", status, paras, actions, tech,
                      _refs("fisher_2007", "linacre_winsteps_manual", "wright_masters_2002_strata",
                            "cronbach_1951"))
    return Light("reliability", "Reliabilitas", status, sentence), section


def _item_fit(res) -> tuple[Light, Section]:
    items = res.items
    est = items[~items["extreme"]]
    lo, hi = res.settings["mnsq_range"]
    inf, out = est["infit_mnsq"], est["outfit_mnsq"]
    under = est[(inf > hi) | (out > hi)]
    over = est[((inf < lo) | (out < lo)) & ~((inf > hi) | (out > hi))]
    degrading = est[(inf > rules.MNSQ_DEGRADING) | (out > rules.MNSQ_DEGRADING)]
    negpt = est[est["ptmea_obs"] < rules.PTMEASURE_MIN]
    serious = sorted(set(degrading["item"]) | set(negpt["item"]), key=list(est["item"]).index)
    flagged = sorted(set(under["item"]) | set(over["item"]) | set(serious), key=list(est["item"]).index)
    rng = f"{num(lo, 1)}-{num(hi, 1)}"
    if serious:
        status = rules.RED
        sentence = (f"{len(serious)} butir menunjukkan ketidakcocokan serius dan perlu ditelaah lebih dulu: "
                    f"{names(serious)}.")
    elif flagged:
        status = rules.YELLOW
        sentence = f"{len(flagged)} butir berada di luar rentang kecocokan {rng} dan perlu diperiksa: {names(flagged)}."
    else:
        status = rules.GREEN
        sentence = f"Semua {len(est)} butir berperilaku sesuai harapan model (MNSQ dalam rentang {rng})."

    paras = [
        "Statistik kecocokan bekerja seperti alarm kejutan. MNSQ bernilai 1 berarti jawaban "
        "menyimpang dari harapan model sebesar yang wajar terjadi secara acak. Nilai di atas "
        f"{num(hi, 1)} berarti terlalu banyak kejutan, misalnya responden pandai yang salah pada soal "
        f"mudah; nilai di bawah {num(lo, 1)} berarti pola jawaban terlalu mudah ditebak. Infit lebih "
        "peka terhadap kejutan dari responden yang setara dengan butir, sedangkan outfit lebih peka "
        "terhadap beberapa jawaban yang sangat mengejutkan.",
    ]
    if len(under):
        detail = "; ".join(f"{r.item} (infit {num(r.infit_mnsq)}, outfit {num(r.outfit_mnsq)})"
                           for r in under.head(MAX_LISTED).itertuples())
        more = f", serta {len(under) - MAX_LISTED} butir lain" if len(under) > MAX_LISTED else ""
        paras.append(
            f"Butir dengan kejutan berlebih: {detail}{more}. Pola ini mengindikasikan jawaban yang lebih "
            "acak daripada harapan. Kemungkinan penyebabnya antara lain redaksi yang ambigu, kunci "
            "jawaban yang keliru, banyak tebakan, atau butir yang mengukur hal lain. Bila hanya outfit "
            "yang tinggi, sumbernya kemungkinan sedikit jawaban yang sangat mengejutkan (salah ceroboh "
            "atau tebakan beruntung), bukan butirnya secara keseluruhan."
        )
    if len(over):
        paras.append(
            f"Butir dengan pola terlalu dapat ditebak: {names(over['item'])}. Kondisi ini umumnya tidak "
            "merusak pengukuran, tetapi dapat menandakan butir yang menanyakan hal hampir sama dengan "
            "butir lain atau butir yang sangat membedakan kelompok atas dan bawah."
        )
    if len(negpt):
        paras.append(
            f"Korelasi point-measure negatif ditemukan pada {names(negpt['item'])}: responden yang lebih "
            "mampu justru cenderung mendapat skor lebih rendah pada butir tersebut. Hal ini "
            "mengindikasikan kemungkinan kunci jawaban yang salah, atau pada angket, butir berkalimat "
            "negatif (reverse-coded) yang skornya belum dibalik."
        )
    elif len(est) <= 10:
        paras.append(
            f"Karena skala ini pendek ({len(est)} butir), periksa juga butir yang korelasi point-measure "
            "teramatinya jauh di bawah nilai harapannya. Pada skala pendek, butir berkunci terbalik yang "
            "belum dibalik tidak selalu menghasilkan korelasi negatif karena skor butir itu sendiri ikut "
            "menyusun measure."
        )
    persons = res.persons
    pe = persons[~persons["extreme"] & persons["measure"].notna()]
    pm = pe[pe["flag_misfit"]]
    share = 100.0 * len(pm) / max(len(pe), 1)
    worst = pm.sort_values("outfit_mnsq", ascending=False).head(5)
    paras.append(
        f"Pada sisi responden, {len(pm)} dari {len(pe)} responden non-ekstrem ({pct(share)}) memiliki "
        f"MNSQ di luar rentang {rng}"
        + (f"; yang paling menyimpang antara lain {names(worst['person'], 5, 'responden')}" if len(pm) else "")
        + f". Karena setiap responden hanya menjawab {len(est)} butir, MNSQ person berfluktuasi cukup besar "
        "secara kebetulan, sehingga sebagian responden dapat tampak misfit walaupun menjawab dengan wajar. "
        "Pola yang benar-benar menyimpang dapat berasal dari menjawab asal, menebak, kelelahan, atau "
        "kesalahan entri data; karena itu responden tersebut perlu diperiksa, bukan otomatis dihapus."
    )
    actions = []
    if len(degrading):
        actions.append(f"Pertimbangkan mengeluarkan {names(degrading['item'])} (MNSQ > {num(rules.MNSQ_DEGRADING, 1)}) "
                       "lalu jalankan ulang analisis untuk melihat dampaknya.")
    if len(negpt):
        actions.append(f"Periksa kunci jawaban atau arah skor {names(negpt['item'])}; balik skornya bila "
                       "butir tersebut berkalimat negatif.")
    if len(under):
        actions.append(f"Telaah redaksi, pilihan jawaban, dan kunci {names(under['item'])}; revisi bagian yang "
                       "ambigu.")
    if len(over):
        actions.append(f"Periksa apakah {names(over['item'])} tumpang tindih isinya dengan butir lain.")
    if len(pm):
        actions.append("Periksa lembar jawaban responden yang misfit; sebagai analisis sensitivitas, jalankan "
                       "ulang tanpa mereka dan bandingkan hasilnya.")
    s = res.summary
    tech = [
        TechRow("Rentang MNSQ yang dipakai", rng,
                "ketat (taruhan tinggi)" if res.settings["strict_fit"] else "produktif"),
        TechRow("Batas MNSQ merusak pengukuran", num(rules.MNSQ_DEGRADING, 1), "> nilai ini: merah"),
        TechRow("Rerata infit / outfit item", f"{num(s['item_mean_infit'])} / {num(s['item_mean_outfit'])}", "~1,00"),
        TechRow("Rerata infit / outfit person", f"{num(s['person_mean_infit'])} / {num(s['person_mean_outfit'])}", "~1,00"),
        TechRow("Butir di luar rentang", str(len(flagged)), "0"),
        TechRow("Butir dengan point-measure negatif", str(len(negpt)), "0"),
        TechRow("Responden di luar rentang", f"{len(pm)} ({pct(share, 1)})", ""),
    ]
    for r in est[est["item"].isin(flagged)].itertuples():
        tech.append(TechRow(f"  {r.item}", f"infit {num(r.infit_mnsq)} (z {num(r.infit_zstd, 1)}), "
                                           f"outfit {num(r.outfit_mnsq)} (z {num(r.outfit_zstd, 1)}), "
                                           f"PTMEA {num(r.ptmea_obs)} / harapan {num(r.ptmea_exp)}", ""))
    refs = ["linacre_2002_mnsq", "wright_masters_1982", "wilson_hilferty_1931"]
    if res.settings["strict_fit"]:
        refs.insert(1, "wright_linacre_1994")
    section = Section("item_fit", "Kecocokan Butir dan Responden", status, paras, actions, tech, _refs(*refs))
    return Light("item_fit", "Kecocokan butir", status, sentence), section


def _dimensionality(res) -> tuple[Light, Section]:
    d, q3 = res.dimensionality, res.q3
    eig = d["first_contrast_eigenvalue"]
    load = d["loadings"].sort_values()
    pos = [n for n, v in load[::-1].items() if v > 0][:3]
    neg = [n for n, v in load.items() if v < 0][:3]
    pairs = q3["flagged_pairs"]
    pair_text = names([f"{a}-{b} (Q3 {num(v)})" for a, b, v in zip(pairs["item_a"], pairs["item_b"], pairs["q3"])],
                      unit="pasangan")
    if eig >= rules.CONTRAST_EIGENVALUE_RED:
        status = rules.RED
        sentence = (f"Terdapat indikasi dimensi kedua yang cukup kuat (eigenvalue kontras pertama {num(eig)}); "
                    "skor total mungkin mencampur dua hal berbeda.")
    elif eig >= rules.CONTRAST_EIGENVALUE_MAX or len(pairs):
        status = rules.YELLOW
        parts = []
        if eig >= rules.CONTRAST_EIGENVALUE_MAX:
            parts.append(f"eigenvalue kontras pertama {num(eig)}")
        if len(pairs):
            parts.append(f"{len(pairs)} pasangan butir saling bergantung")
        sentence = f"Asumsi satu dimensi perlu diperiksa ({' dan '.join(parts)})."
    else:
        status = rules.GREEN
        sentence = (f"Data mendukung asumsi bahwa tes mengukur satu hal utama (eigenvalue kontras pertama "
                    f"{num(eig)} < {num(rules.CONTRAST_EIGENVALUE_MAX, 1)}) tanpa pasangan butir yang saling bergantung.")
    paras = [
        "Unidimensionalitas berarti semua butir mengukur satu hal yang sama, seperti semua soal ujian "
        "matematika memang mengukur kemampuan matematika dan bukan kemampuan membaca. Setelah pengaruh "
        "measure dikeluarkan, sisa jawaban (residual) seharusnya acak. Analisis komponen utama atas "
        "residual mencari pola yang tersisa; eigenvalue kontras pertama menyatakan kekuatan pola itu "
        "dalam satuan 'setara sekian butir'.",
        f"Measure menjelaskan {pct(d['variance_explained_pct'], 1)} varians data. Angka ini sangat bergantung "
        "pada sebaran kemampuan responden dan kesulitan butir, sehingga tidak dipakai sebagai kriteria "
        "tunggal.",
    ]
    if eig >= rules.CONTRAST_EIGENVALUE_MAX:
        paras.append(
            f"Kontras pertama memiliki kekuatan setara sekitar {num(eig, 1)} butir. Butir dengan loading positif "
            f"terbesar ({names(pos)}) dan negatif terbesar ({names(neg)}) membentuk dua kutub. Telaah isi kedua "
            "kelompok ini: bila keduanya mengukur aspek yang berbeda secara bermakna (misalnya soal hitungan "
            "dan soal cerita), dimensi kedua tersebut kemungkinan nyata."
        )
    else:
        paras.append(f"Pola yang tersisa (eigenvalue {num(eig)}) masih dalam batas yang wajar terjadi secara kebetulan.")
    if len(pairs):
        paras.append(
            f"Dependensi lokal terdeteksi pada {pair_text}. Dua butir seperti ini seolah 'saling menyontek': "
            "jawaban satu butir ikut menentukan jawaban butir lain di luar kemampuan yang diukur, misalnya "
            "soal bertingkat dari satu wacana atau dua butir dengan redaksi hampir sama. Akibatnya "
            "reliabilitas dapat tampak lebih tinggi daripada yang sebenarnya."
        )
    actions = []
    if eig >= rules.CONTRAST_EIGENVALUE_MAX:
        actions.append(f"Bandingkan isi {names(pos)} dengan {names(neg)}; bila memang berbeda konstruk, "
                       "pertimbangkan melaporkan skor terpisah atau menganalisis kedua kelompok secara terpisah.")
    if len(pairs):
        actions.append("Untuk pasangan yang saling bergantung, pertimbangkan menggabungkannya menjadi satu "
                       "butir bertingkat (testlet), merevisi redaksinya, atau mempertahankan salah satunya.")
    tech = [
        TechRow("Eigenvalue kontras pertama", num(eig),
                f"< {num(rules.CONTRAST_EIGENVALUE_MAX, 1)} hijau; >= {num(rules.CONTRAST_EIGENVALUE_RED, 1)} merah"),
        TechRow("Varians dijelaskan measure", pct(d["variance_explained_pct"], 1), "tidak dipakai sebagai kriteria"),
        TechRow("Kontras pertama (% total varians)", pct(d["first_contrast_pct_total"], 1), ""),
        TechRow("Rata-rata Q3", num(q3["mean"], 3), ""),
        TechRow("Batas Q3 (rata-rata + 0,2)", num(q3["cutoff"], 3), f"+{num(rules.Q3_RELATIVE_CUTOFF, 1)}"),
        TechRow("Q3 maksimum", num(q3["max"], 3), ""),
        TechRow("Pasangan Q3 ditandai", str(len(pairs)), "0"),
    ]
    section = Section("dimensionality", "Dimensionalitas dan Dependensi Lokal", status, paras, actions, tech,
                      _refs("linacre_winsteps_manual", "raiche_2005", "linacre_2006_variance",
                            "christensen_2017", "yen_1984"))
    return Light("dimensionality", "Dimensionalitas", status, sentence), section


def _targeting(res) -> tuple[Light, Section]:
    s = res.summary
    diff = s["targeting"]
    poly = res.model != "dichotomous"
    ad = abs(diff)
    unit = rules.targeting_unit(s["person"]["model_rmse"])
    ratio = ad / unit
    if ratio < rules.TARGETING_GOOD:
        status = rules.GREEN
    elif ratio < rules.TARGETING_POOR:
        status = rules.YELLOW
    else:
        status = rules.RED
    if diff > 0:
        direction = ("responden cenderung mudah memberi skor tinggi pada butir-butir ini" if poly
                     else "tes relatif mudah bagi kelompok ini")
    else:
        direction = ("responden cenderung jarang memberi skor tinggi pada butir-butir ini" if poly
                     else "tes relatif sulit bagi kelompok ini")
    if status == rules.GREEN:
        sentence = f"Tingkat kesulitan butir sesuai dengan kemampuan responden (selisih rata-rata {num(diff)} logit)."
    else:
        sentence = f"Rata-rata responden berada {num(ad)} logit {'di atas' if diff > 0 else 'di bawah'} rata-rata butir; {direction}."
    persons = res.persons
    valid = persons["measure"].notna()
    n_max = int((persons["status"] == "ekstrem maksimum").sum())
    n_min = int((persons["status"] == "ekstrem minimum").sum())
    if poly:
        loc = res.jmle.threshold_location
        loc = loc[np.isfinite(loc)]
    else:
        loc = res.items.loc[~res.items["extreme"], "measure"].to_numpy()
    pm = persons.loc[valid, "measure"].to_numpy()
    above = 100.0 * np.mean(pm > np.max(loc)) if loc.size else np.nan
    below = 100.0 * np.mean(pm < np.min(loc)) if loc.size else np.nan
    target_word = "threshold" if poly else "butir"
    paras = [
        "Targeting ibarat memasang mistar lompat tinggi. Bila mistar dipasang jauh di bawah kemampuan "
        "semua peserta, semuanya lolos dan kita tidak tahu siapa yang paling hebat; bila terlalu tinggi, "
        "semuanya gagal. Tes yang tepat sasaran berisi butir dengan kesulitan yang menyebar di sekitar "
        "kemampuan responden, sehingga setiap butir memberi informasi.",
        f"Rata-rata measure responden adalah {num(s['person_mean'])} logit, sedangkan rata-rata kesulitan "
        f"butir ditetapkan 0 logit; selisihnya {num(diff)} logit"
        + (", relatif kecil sehingga butir umumnya berada di sekitar kemampuan responden. "
           if status == rules.GREEN else f", yang mengindikasikan {direction}. ")
        + 
        f"Sekitar {pct(above)} responden berada di atas {target_word} tersulit dan {pct(below)} di bawah "
        f"{target_word} termudah, wilayah tempat tes memberi sedikit informasi.",
    ]
    if n_max or n_min:
        paras.append(
            f"Sebanyak {n_max} responden mendapat skor maksimum dan {n_min} skor minimum. Batas kemampuan "
            "mereka tidak terukur oleh tes ini, sehingga measure mereka hanya perkiraan dengan penyesuaian "
            "0,3 poin."
        )
    actions = []
    if status != rules.GREEN:
        if diff > 0:
            actions.append("Tambahkan butir yang lebih sulit" + (" (pernyataan yang lebih 'berat' untuk disetujui)"
                                                                 if poly else "") + " agar responden berkemampuan "
                           "tinggi juga terukur presisi.")
        else:
            actions.append("Tambahkan butir yang lebih mudah" + (" (pernyataan yang lebih mudah disetujui)"
                                                                if poly else "") + " agar responden berkemampuan "
                           "rendah juga terukur presisi.")
    if n_max + n_min > 0.05 * max(valid.sum(), 1):
        actions.append("Proporsi skor ekstrem cukup besar; pertimbangkan memperluas rentang kesulitan butir.")
    tech = [
        TechRow("Rerata measure person (non-ekstrem)", num(s["person_mean"]), ""),
        TechRow("SD measure person", num(s["person"]["sd"]), ""),
        TechRow("Rerata measure item", num(s["item_mean"]), "0 (identifikasi skala)"),
        TechRow("Selisih (targeting)", f"{num(diff)} logit = {num(ratio)} satuan",
                f"< {num(rules.TARGETING_GOOD, 1)} satuan hijau; >= {num(rules.TARGETING_POOR, 1)} satuan merah"),
        TechRow("Satuan targeting", f"{num(unit, 3)} logit",
                "yang lebih kecil antara 1 logit dan RMSE person (MODEL); tafsiran teraman tabel Fisher (2007)"),
        TechRow(f"Person di atas {target_word} tersulit", pct(above, 1), ""),
        TechRow(f"Person di bawah {target_word} termudah", pct(below, 1), ""),
        TechRow("Skor ekstrem (maks / min)", f"{n_max} / {n_min}", ""),
    ]
    section = Section("targeting", "Kesesuaian Target", status, paras, actions, tech,
                      _refs("fisher_2007", "wright_stone_1979"))
    return Light("targeting", "Kesesuaian target", status, sentence), section


def _categories(res) -> tuple[Light, Section]:
    if res.model == "dichotomous" or res.categories is None:
        sentence = "Tidak berlaku: data dikotomus hanya memiliki dua kategori."
        section = Section("categories", "Fungsi Kategori", rules.GRAY,
                          ["Analisis fungsi kategori hanya relevan untuk skala bertingkat (politomus)."])
        return Light("categories", "Fungsi kategori", rules.GRAY, sentence), section
    cat = res.categories
    rsm = res.model == "rsm"
    dis_t = cat[cat["flag_disordered_threshold"]]
    dis_a = cat[cat["flag_disordered_avg"]]
    low = cat[cat["flag_low_count"]]
    hi_out = cat[cat["flag_outfit_high"]]
    where = (lambda df: "skala bersama" if rsm else names(sorted(set(df["item"]), key=list(cat["item"]).index)))
    if len(dis_t) or len(dis_a):
        status = rules.RED
        bits = []
        if len(dis_t):
            bits.append(f"threshold tidak berurutan ({where(dis_t)})")
        if len(dis_a):
            bits.append(f"rata-rata measure tidak naik ({where(dis_a)})")
        sentence = f"Sebagian kategori jawaban tidak berfungsi berurutan: {'; '.join(bits)}."
    elif len(low) or len(hi_out):
        status = rules.YELLOW
        bits = []
        if len(low):
            bits.append(f"{len(low)} kategori dengan kurang dari {rules.CATEGORY_MIN_COUNT} observasi")
        if len(hi_out):
            bits.append(f"{len(hi_out)} kategori dengan outfit tinggi")
        sentence = f"Kategori jawaban berurutan, tetapi ada {' dan '.join(bits)}."
    else:
        status = rules.GREEN
        sentence = "Kategori jawaban berfungsi berurutan dan cukup sering dipakai."
    paras = [
        "Kategori jawaban dapat dibayangkan sebagai anak tangga. Setiap threshold adalah titik tempat "
        "responden beralih dari satu kategori ke kategori berikutnya, dan seharusnya lebih tinggi daripada "
        "threshold sebelumnya. Bila sebuah threshold lebih rendah dari sebelumnya, ada kategori yang jarang "
        "menjadi pilihan paling mungkin bagi siapa pun, sehingga responden kemungkinan sulit membedakannya "
        "dari kategori di sebelahnya.",
    ]
    if rsm:
        th = cat["threshold"].dropna().tolist()
        paras.append(f"Pada RSM, semua butir berbagi threshold yang sama: {'; '.join(num(t) for t in th)} logit "
                     f"({'naik berurutan' if not len(dis_t) else 'tidak seluruhnya naik berurutan'}).")
    else:
        n_items = cat["item"].nunique()
        n_bad = dis_t["item"].nunique()
        paras.append(f"Pada PCM, setiap butir memiliki threshold sendiri; {n_bad} dari {n_items} butir memiliki "
                     "threshold yang tidak berurutan.")
    actions = []
    for item, grp in dis_t.groupby("item", sort=False):
        block = cat[cat["item"] == item].reset_index(drop=True)
        for k in grp["category"]:
            k = int(k)
            mid = block.loc[k - 1, "label"]
            left = block.loc[k - 2, "label"] if k - 2 >= 0 else None
            right = block.loc[k, "label"]
            subject = "Pada skala bersama" if rsm else f"Pada butir {item}"
            paras.append(
                f"{subject}, threshold menuju kategori '{right}' ({num(block.loc[k, 'threshold'])}) lebih rendah "
                f"daripada threshold menuju kategori '{mid}' ({num(block.loc[k - 1, 'threshold'])}), sehingga "
                f"kategori '{mid}' jarang menjadi pilihan paling mungkin."
            )
            neighbours = f"'{left}' atau '{right}'" if left is not None else f"'{right}'"
            actions.append(f"{subject}: pertimbangkan menggabungkan kategori '{mid}' dengan {neighbours}, lalu "
                           "jalankan ulang analisis; periksa juga apakah label kategori itu mudah dibedakan.")
    if len(dis_a):
        paras.append(
            f"Rata-rata measure responden tidak naik berurutan pada {where(dis_a)}: responden yang memilih "
            "kategori lebih tinggi justru rata-rata berkemampuan lebih rendah. Ini mengindikasikan kategori "
            "dipahami tidak sesuai urutan yang dimaksud."
        )
        actions.append("Telaah label dan urutan kategori yang rata-rata measure-nya tidak naik; pastikan tidak ada "
                       "kesalahan pengodean arah skala.")
    if len(low):
        listing = names([f"'{r.label}'" + ("" if rsm else f" pada {r.item}") + f" ({r.count} observasi)"
                         for r in low.itertuples()], unit="kategori")
        paras.append(f"Kategori dengan observasi sangat sedikit: {listing}. Threshold di sekitarnya kurang stabil.")
        actions.append("Gabungkan kategori yang jarang dipakai dengan kategori tetangganya bila secara makna masuk akal.")
    if len(hi_out):
        listing = names([f"'{r.label}'" + ("" if rsm else f" pada {r.item}") +
                         f" (outfit {num(r.outfit_mnsq)} vs harapan {num(r.outfit_expected)})"
                         for r in hi_out.itertuples()], unit="kategori")
        paras.append(f"Kategori yang dipakai secara lebih tidak terduga daripada harapan model: {listing}.")
        actions.append("Periksa siapa yang memilih kategori dengan outfit tinggi; pola ini dapat muncul bila "
                       "responden memakai kategori tersebut secara tidak konsisten.")
    tech = [
        TechRow("Jumlah kategori ditandai < observasi minimum", str(len(low)), f">= {rules.CATEGORY_MIN_COUNT} per kategori"),
        TechRow("Threshold tidak berurutan", str(len(dis_t)), "0"),
        TechRow("Rata-rata measure tidak naik", str(len(dis_a)), "0"),
        TechRow("Outfit kategori tinggi", str(len(hi_out)),
                f">= {num(rules.CATEGORY_OUTFIT_MAX, 1)} dan melampaui harapan model (z > 1,645)"),
    ]
    if rsm:
        for r in cat.itertuples():
            tech.append(TechRow(f"  Kategori '{r.label}'",
                                f"n {r.count} ({pct(r.percent, 1)}), rerata measure {num(r.avg_measure)}, "
                                f"outfit {num(r.outfit_mnsq)} (harapan {num(r.outfit_expected)}), "
                                f"threshold {num(r.threshold)} (SE {num(r.threshold_se)})", ""))
    section = Section("categories", "Fungsi Kategori", status, paras, actions, tech,
                      _refs("linacre_2002_categories", "andrich_1978", "masters_1982", "linacre_winsteps_manual"))
    return Light("categories", "Fungsi kategori", status, sentence), section


def _dif(res) -> tuple[Light, Section]:
    dif = res.dif
    if dif is None or dif.empty:
        sentence = "DIF tidak dianalisis (kolom grup tidak dipilih atau tidak memiliki tepat dua kategori)."
        section = Section("dif", "Keadilan Butir antar-Kelompok (DIF)", rules.GRAY,
                          ["Pilih kolom grup dengan tepat dua kategori (misalnya jenis kelamin) untuk menjalankan "
                           "analisis DIF."])
        return Light("dif", "DIF", rules.GRAY, sentence), section
    flagged = dif[dif["flag_dif"]]
    big = flagged[flagged["ets_category"] == "C"]
    ga, gb = dif["group_a"].iloc[0], dif["group_b"].iloc[0]

    def harder(r):
        return ga if r.contrast > 0 else gb

    if len(big):
        status = rules.RED
        sentence = f"{len(big)} butir menunjukkan DIF besar antar-kelompok dan perlu ditelaah isinya: {names(big['item'])}."
    elif len(flagged):
        status = rules.YELLOW
        sentence = f"{len(flagged)} butir menunjukkan DIF yang perlu ditelaah: {names(flagged['item'])}."
    else:
        status = rules.GREEN
        sentence = f"Tidak ada butir yang berfungsi berbeda secara bermakna antara kelompok {ga} dan {gb}."
    paras = [
        "DIF terjadi bila dua orang dengan kemampuan yang sama, tetapi dari kelompok berbeda, memiliki "
        "peluang berbeda untuk menjawab benar sebuah butir, seperti timbangan yang berat sebelah. Measure "
        "setiap responden dikunci, lalu kesulitan setiap butir dihitung ulang terpisah untuk tiap kelompok.",
    ]
    if len(flagged):
        detail = "; ".join(
            f"{r.item} lebih sulit bagi kelompok {harder(r)} (selisih {num(abs(r.contrast))} logit, "
            f"t = {num(abs(r.t))}, "
            f"kategori ETS {r.ets_category})" for r in flagged.head(MAX_LISTED).itertuples())
        paras.append(f"Butir yang ditandai: {detail}.")
        paras.append(
            "DIF adalah tanda untuk menelaah isi butir, bukan bukti otomatis bahwa butir itu bias. Perbedaan "
            "dapat bersumber dari konteks budaya, pilihan kata, atau pengalaman yang lebih akrab bagi satu "
            "kelompok, tetapi juga dapat mencerminkan perbedaan pembelajaran yang memang nyata."
        )
    n_a, n_b = int(dif["n_a"].max()), int(dif["n_b"].max())
    paras.append(
        f"Analisis ini melibatkan sekitar {n_a} responden kelompok {ga} dan {n_b} responden kelompok {gb}. "
        "Pada sampel kecil, DIF yang nyata dapat terlewat; pada sampel sangat besar, perbedaan kecil pun "
        "dapat signifikan, sehingga besar selisih (logit) lebih penting daripada nilai t."
    )
    actions = []
    if len(flagged):
        actions.append(f"Minta panel ahli menelaah isi {names(flagged['item'])} dari sudut bahasa, konteks, dan "
                       "keakraban pengalaman bagi tiap kelompok.")
        actions.append("Bila ditemukan sumber bias yang masuk akal, revisi atau ganti butir tersebut.")
    counts = dif["ets_category"].value_counts()
    tech = [
        TechRow("Kelompok (A / B)", f"{ga} / {gb}", "kontras = measure A - measure B"),
        TechRow("Kriteria penanda", f"kontras mutlak >= {num(rules.DIF_CONTRAST_MIN, 1)} dan |t| > "
                                    f"{num(res.settings['dif_t_min'], 1)}",
                f"Draba (1977): t > {num(rules.DIF_T_MIN, 1)}; t > {num(rules.DIF_T_MIN_MANY_ITEMS, 1)} bila lebih "
                f"dari {rules.DIF_MANY_ITEMS} butir"),
        TechRow("Kategori ETS (A / B / C)",
                f"{counts.get('A', 0)} / {counts.get('B', 0)} / {counts.get('C', 0)}",
                f"C: DIF mutlak >= {num(rules.DIF_ETS_C)} dan bermakna melampaui {num(rules.DIF_ETS_B)} (p < 0,05)"),
    ]
    for r in flagged.itertuples():
        tech.append(TechRow(f"  {r.item}", f"{num(r.measure_a)} vs {num(r.measure_b)}; kontras {num(r.contrast)} "
                                           f"(SE {num(r.joint_se)}), t({num(r.df, 0)}) = {num(r.t)}, p {_peq(r.p)}", ""))
    section = Section("dif", "Keadilan Butir antar-Kelompok (DIF)", status, paras, actions, tech,
                      _refs("draba_1977", "zwick_1999", "welch_1947", "linacre_winsteps_manual"))
    return Light("dif", "DIF", status, sentence), section


def _peq(p) -> str:
    text = pval(p)
    return text if text.startswith("<") else f"= {text}"


def _cautions(res) -> list[str]:
    out = []
    for issue in res.issues:
        if issue.level == "warning":
            out.append(issue.message)
    return out


def interpret(res) -> Interpretation:
    """Bangun interpretasi tiga lapis dari :class:`~raschlite.core.analysis.RaschResults`."""
    parts = [_reliability(res), _item_fit(res), _dimensionality(res), _targeting(res), _categories(res), _dif(res)]
    return Interpretation(
        model=res.model,
        model_name=MODEL_NAMES[res.model],
        lights=[p[0] for p in parts],
        intro=_intro(res.model),
        sections=[p[1] for p in parts],
        cautions=_cautions(res),
    )


_DOTS = {rules.GREEN: "🟢", rules.YELLOW: "🟡", rules.RED: "🔴", rules.GRAY: "⚪"}


def summary_markdown(interp: Interpretation) -> str:
    """Ringkasan 1 Menit dalam Markdown."""
    lines = [f"## Ringkasan 1 Menit ({interp.model_name})", ""]
    for c in interp.cautions:
        if "TIDAK konvergen" in c:
            lines += [f"> {c}", ""]
    for light in interp.lights:
        lines.append(f"- {_DOTS[light.status]} **{light.title}** ({STATUS_LABELS[light.status]}): {light.sentence}")
    return "\n".join(lines) + "\n"


def to_markdown(interp: Interpretation, technical: bool = True) -> str:
    """Seluruh interpretasi (tiga lapis) dalam Markdown."""
    out = [summary_markdown(interp), "## Penjelasan", ""]
    out += [p + "\n" for p in interp.intro]
    if interp.cautions:
        out += ["### Catatan data", ""] + [f"- {c}" for c in interp.cautions] + [""]
    for sec in interp.sections:
        out += [f"### {sec.title}", ""]
        out += [p + "\n" for p in sec.paragraphs]
        if sec.actions:
            out += ["**Saran tindakan:**", ""] + [f"- {a}" for a in sec.actions] + [""]
        if technical and sec.technical:
            out += ["<details><summary>Detail teknis</summary>", "", "| Statistik | Nilai | Kriteria |",
                    "|---|---|---|"]
            out += [f"| {r.label.strip()} | {r.value} | {r.criterion} |" for r in sec.technical]
            if sec.references:
                out += ["", "Rujukan:", ""] + [f"- {r}" for r in sec.references]
            out += ["", "</details>", ""]
    return "\n".join(out)
