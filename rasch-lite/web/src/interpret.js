/* RaschLite: mesin interpretasi (padanan interpret/narrative.py).
 *
 * Kalimat disusun persis seperti versi Python sehingga narasi kedua versi identik
 * (diuji terhadap Markdown dari engine Python). Ambang dibaca dari TEXT.rules yang
 * diekspor dari interpret/rules.py.
 */
(function (root) {
  "use strict";

  let TEXT = root.RASCH_TEXT || null;
  function setText(t) { TEXT = t; }
  const R = () => TEXT.rules;

  function num(x, d = 2) {
    if (x === null || x === undefined || typeof x !== "number" || !isFinite(x)) return "-";
    let text = fixedHalfEven(x, d);
    if (text.startsWith("-") && Number(text) === 0) text = text.slice(1); // tanpa "-0,00"
    return text.replace(".", ",");
  }
  /** Seperti Python f"{x:.{d}f}": pembulatan setengah-ke-genap atas nilai biner eksak. */
  function fixedHalfEven(x, d) {
    const text = x.toFixed(d);
    const exact = Math.abs(x).toFixed(Math.min(d + 30, 100));
    const tail = exact.slice(exact.indexOf(".") + 1 + d);
    if (!/^50*$/.test(tail)) return text;
    const kept = Math.abs(x).toFixed(Math.min(d + 30, 100)).slice(0, exact.indexOf(".") + 1 + d).replace(/\.$/, "");
    const lastDigit = Number(kept.replace(".", "").slice(-1));
    if (lastDigit % 2 === 0) return (x < 0 ? "-" : "") + kept; // genap: dibulatkan ke bawah
    return text;
  }
  function pct(x, d = 0) { return num(x, d) + "%"; }
  function pval(p) {
    if (p === null || p === undefined || !isFinite(p)) return "-";
    return p < 0.001 ? "< 0,001" : num(p, 3);
  }
  function names(values, k, unit = "item") {
    if (k === undefined || k === null) k = TEXT.maxListed;
    values = values.map(String);
    if (!values.length) return "";
    if (values.length > k) return values.slice(0, k).join(", ") + `, dan ${values.length - k} ${unit} lainnya`;
    if (values.length === 1) return values[0];
    return values.slice(0, -1).join(", ") + " dan " + values[values.length - 1];
  }
  const refs = (...keys) => keys.map((k) => R().REFERENCES[k]);
  const T = (label, value, criterion = "") => ({ label, value, criterion });
  const isF = (v) => typeof v === "number" && isFinite(v);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const unique = (arr) => Array.from(new Set(arr));
  const MAX = () => TEXT.maxListed;

  function intro(model) {
    const second = model === "dichotomous"
      ? "Ketika kemampuan seorang person sama dengan kesulitan sebuah item, peluangnya menjawab " +
        "benar adalah 50%. Bila kemampuannya satu logit di atas kesulitan item, peluang itu naik " +
        "menjadi sekitar 73%; dua logit di atas, sekitar 88%. Selisih yang sama selalu bermakna " +
        "sama di bagian mana pun penggaris, dan inilah yang membuat measure Rasch berbeda dari " +
        "sekadar menjumlah jawaban benar (raw score)."
      : "Pada skala bertingkat, person measure yang lebih tinggi daripada item measure berarti " +
        "person itu lebih mungkin memilih kategori jawaban yang lebih tinggi (misalnya 'setuju' " +
        "daripada 'netral'). Selisih yang sama selalu bermakna sama di bagian mana pun penggaris, " +
        "sehingga measure dapat dibandingkan secara adil antar-person.";
    return [
      "Analisis Rasch menempatkan kemampuan person (responden) dan kesulitan item (butir) pada satu " +
      "'penggaris bersama' yang satuannya disebut logit; posisi pada penggaris itu disebut measure. " +
      "Titik nol penggaris ditetapkan pada rata-rata item measure; angka positif berarti di atas " +
      "rata-rata itu, angka negatif di bawahnya.",
      second,
    ];
  }

  function reliability(res) {
    const s = res.summary, r = R();
    const pr = s.person_reliability, ps = s.person_separation, pstr = s.person_strata;
    const ir = s.item_reliability, isep = s.item_separation;
    const personOk = pr >= r.PERSON_RELIABILITY_GOOD && ps >= r.PERSON_SEPARATION_GOOD;
    const itemOk = ir >= r.ITEM_RELIABILITY_GOOD && isep >= r.ITEM_SEPARATION_GOOD;
    let status, sentence;
    if (!isF(pr) || pr < r.PERSON_RELIABILITY_POOR) {
      status = r.RED;
      sentence = `Konsistensi pengukuran person rendah (person reliability ${num(pr)}); measure ` +
        "individual perlu ditafsirkan dengan sangat hati-hati.";
    } else if (personOk && itemOk) {
      status = r.GREEN;
      sentence = `Tes cukup konsisten membedakan person (person reliability ${num(pr)}, person ` +
        `separation ${num(ps)}) dan hierarki kesulitan item-nya stabil (item reliability ${num(ir)}).`;
    } else {
      status = r.YELLOW;
      const weak = [];
      if (!personOk) weak.push(`person reliability ${num(pr)}, person separation ${num(ps)}`);
      if (!itemOk) weak.push(`item reliability ${num(ir)}, item separation ${num(isep)}`);
      sentence = `Konsistensi pengukuran memadai tetapi belum ideal (${weak.join("; ")}).`;
    }
    const strataN = isF(pstr) ? Math.floor(pstr) : 0;
    const paras = [
      "Reliability dapat dibayangkan seperti timbangan badan: timbangan yang baik memberi angka yang " +
      "hampir sama bila Anda menimbang dua kali. Dalam analisis Rasch, person reliability sebesar " +
      `${num(pr)} mengindikasikan bahwa sekitar ${pct(100 * pr)} perbedaan measure antar-person ` +
      "mencerminkan perbedaan yang sebenarnya, sedangkan sisanya adalah galat ukur. Person separation " +
      `${num(ps)} berarti tes ini kira-kira mampu memisahkan person ke dalam ${Math.max(strataN, 1)} kelompok ` +
      `kemampuan yang berbeda secara statistik (person strata ${num(pstr)}).`,
      `Untuk item, item reliability ${num(ir)} dan item separation ${num(isep)} menunjukkan seberapa ` +
      "stabil hierarki kesulitan item bila tes diberikan pada sampel lain yang serupa. Nilai ini " +
      "terutama dipengaruhi jumlah person: makin banyak person, makin presisi posisi setiap item.",
    ];
    if (isF(s.alpha)) {
      paras.push(`Sebagai pembanding klasik, ${s.alpha_label} sebesar ${num(s.alpha)} dihitung dari ` +
        `${s.alpha_n} person dengan jawaban lengkap. Angka ini sering sedikit berbeda dari person ` +
        "reliability Rasch karena memakai raw score dan menyertakan extreme score.");
    }
    const actions = [];
    if (!personOk) {
      actions.push("Pertimbangkan menambah item yang tingkat kesulitannya sesuai dengan kemampuan sebagian " +
        "besar person, karena item yang well-targeted paling banyak menambah presisi.");
      actions.push("Telaah item yang misfit (lihat bagian Item and Person Fit); item yang 'berisik' " +
        "menurunkan reliability.");
    }
    if (!itemOk) {
      actions.push("Bila tujuan Anda memastikan hierarki kesulitan item, perbanyak person atau libatkan " +
        "person dengan kemampuan yang lebih beragam.");
    }
    const p = s.person, i = s.item;
    const tech = [
      T("Person reliability (REAL / MODEL)", `${num(pr)} / ${num(p.model_reliability)}`,
        `baik >= ${num(r.PERSON_RELIABILITY_GOOD)}; rendah < ${num(r.PERSON_RELIABILITY_POOR)}`),
      T("Person separation (REAL / MODEL)", `${num(ps)} / ${num(p.model_separation)}`, `>= ${num(r.PERSON_SEPARATION_GOOD, 1)}`),
      T("Person strata", num(pstr), "(4G + 1) / 3"),
      T("Item reliability (REAL / MODEL)", `${num(ir)} / ${num(i.model_reliability)}`, `>= ${num(r.ITEM_RELIABILITY_GOOD)}`),
      T("Item separation (REAL / MODEL)", `${num(isep)} / ${num(i.model_separation)}`, `>= ${num(r.ITEM_SEPARATION_GOOD, 1)}`),
      T("Person RMSE (REAL)", num(p.real_rmse, 3), ""),
      T("Person measure SD (population)", num(p.sd, 3), ""),
      T(s.alpha_label, num(s.alpha), `n lengkap = ${s.alpha_n}`),
    ];
    const section = { key: "reliability", title: "Reliability and Separation", status, paragraphs: paras, actions,
      technical: tech, references: refs("fisher_2007", "linacre_winsteps_manual", "wright_masters_2002_strata", "cronbach_1951") };
    return [{ key: "reliability", title: "Reliability", status, sentence }, section];
  }

  function itemFit(res) {
    const r = R();
    const est = res.items.filter((x) => !x.extreme);
    const [lo, hi] = res.settings.mnsq_range;
    const isUnder = (x) => x.infit_mnsq > hi || x.outfit_mnsq > hi;
    const under = est.filter(isUnder);
    const over = est.filter((x) => (x.infit_mnsq < lo || x.outfit_mnsq < lo) && !isUnder(x));
    const degrading = est.filter((x) => x.infit_mnsq > r.MNSQ_DEGRADING || x.outfit_mnsq > r.MNSQ_DEGRADING);
    const negpt = est.filter((x) => x.ptmea_obs < r.PTMEASURE_MIN);
    const order = est.map((x) => x.item);
    const byOrder = (set) => order.filter((n) => set.has(n));
    const serious = byOrder(new Set([...degrading.map((x) => x.item), ...negpt.map((x) => x.item)]));
    const flagged = byOrder(new Set([...under.map((x) => x.item), ...over.map((x) => x.item), ...serious]));
    const rng = `${num(lo, 1)}-${num(hi, 1)}`;
    let status, sentence;
    if (serious.length) {
      status = r.RED;
      sentence = `${serious.length} item menunjukkan misfit serius dan perlu ditelaah lebih dulu: ${names(serious)}.`;
    } else if (flagged.length) {
      status = r.YELLOW;
      sentence = `${flagged.length} item berada di luar rentang MNSQ ${rng} dan perlu diperiksa: ${names(flagged)}.`;
    } else {
      status = r.GREEN;
      sentence = `Semua ${est.length} item berperilaku sesuai harapan model (Infit dan Outfit MNSQ dalam ` +
        `rentang ${rng}).`;
    }
    const paras = [
      "Statistik fit bekerja seperti alarm kejutan. MNSQ bernilai 1 berarti jawaban menyimpang dari " +
      `harapan model sebesar yang wajar terjadi secara acak. Nilai di atas ${num(hi, 1)} (underfit) berarti ` +
      "terlalu banyak kejutan, misalnya person pandai yang salah pada soal mudah; nilai di bawah " +
      `${num(lo, 1)} (overfit) berarti pola jawaban terlalu mudah ditebak. Infit lebih peka terhadap ` +
      "kejutan dari person yang kemampuannya setara dengan kesulitan item, sedangkan outfit lebih peka " +
      "terhadap beberapa jawaban yang sangat mengejutkan.",
    ];
    if (under.length) {
      const detail = under.slice(0, MAX()).map((x) => `${x.item} (infit ${num(x.infit_mnsq)}, outfit ${num(x.outfit_mnsq)})`).join("; ");
      const more = under.length > MAX() ? `, serta ${under.length - MAX()} item lain` : "";
      paras.push(`Item yang underfit (kejutan berlebih): ${detail}${more}. Pola ini mengindikasikan jawaban yang ` +
        "lebih acak daripada harapan. Kemungkinan penyebabnya antara lain redaksi yang ambigu, kunci " +
        "jawaban yang keliru, banyak tebakan, atau item yang mengukur hal lain. Bila hanya outfit yang " +
        "tinggi, sumbernya kemungkinan sedikit jawaban yang sangat mengejutkan (salah ceroboh atau " +
        "tebakan beruntung), bukan item-nya secara keseluruhan.");
    }
    if (over.length) {
      paras.push(`Item yang overfit (pola terlalu mudah ditebak): ${names(over.map((x) => x.item))}. Kondisi ini umumnya tidak ` +
        "merusak pengukuran, tetapi dapat menandakan item yang menanyakan hal hampir sama dengan item " +
        "lain atau item yang sangat membedakan kelompok atas dan bawah.");
    }
    if (negpt.length) {
      paras.push(`Point-measure correlation negatif ditemukan pada ${names(negpt.map((x) => x.item))}: person yang lebih mampu ` +
        "justru cenderung mendapat skor lebih rendah pada item tersebut. Hal ini mengindikasikan " +
        "kemungkinan kunci jawaban yang salah, atau pada angket, item berkalimat negatif (reverse-coded) " +
        "yang skornya belum dibalik.");
    } else if (est.length <= 10) {
      paras.push(`Karena skala ini pendek (${est.length} item), periksa juga item yang point-measure correlation ` +
        "teramatinya jauh di bawah nilai harapannya. Pada skala pendek, item reverse-coded yang belum " +
        "dibalik tidak selalu menghasilkan korelasi negatif karena skor item itu sendiri ikut menyusun " +
        "measure.");
    }
    const pe = res.persons.filter((x) => !x.extreme && isF(x.measure));
    const pm = pe.filter((x) => x.flag_misfit);
    const share = 100 * pm.length / Math.max(pe.length, 1);
    const worst = pm.map((x, k) => [x, k]).sort((a, b) => {
      const va = a[0].outfit_mnsq, vb = b[0].outfit_mnsq;
      if (Number.isNaN(va) !== Number.isNaN(vb)) return Number.isNaN(va) ? 1 : -1;
      return vb - va || a[1] - b[1];
    }).slice(0, 5).map((p) => p[0]);
    paras.push(`Pada sisi person fit, ${pm.length} dari ${pe.length} person non-extreme (${pct(share)}) memiliki MNSQ di ` +
      `luar rentang ${rng}` +
      (pm.length ? `; yang paling menyimpang antara lain ${names(worst.map((x) => x.person), 5, "person")}` : "") +
      `. Karena setiap person hanya menjawab ${est.length} item, person MNSQ berfluktuasi cukup besar secara ` +
      "kebetulan, sehingga sebagian person dapat tampak misfit walaupun menjawab dengan wajar. Pola yang " +
      "benar-benar menyimpang dapat berasal dari menjawab asal, menebak, kelelahan, atau kesalahan entri " +
      "data; karena itu person tersebut perlu diperiksa, bukan otomatis dihapus.");
    const actions = [];
    if (degrading.length) actions.push(`Pertimbangkan mengeluarkan ${names(degrading.map((x) => x.item))} (MNSQ > ${num(r.MNSQ_DEGRADING, 1)}) ` +
      "lalu jalankan ulang analisis untuk melihat dampaknya.");
    if (negpt.length) actions.push(`Periksa kunci jawaban atau arah skor ${names(negpt.map((x) => x.item))}; balik skornya bila item ` +
      "tersebut berkalimat negatif (reverse-coded).");
    if (under.length) actions.push(`Telaah redaksi, pilihan jawaban, dan kunci ${names(under.map((x) => x.item))}; revisi bagian yang ` +
      "ambigu.");
    if (over.length) actions.push(`Periksa apakah ${names(over.map((x) => x.item))} tumpang tindih isinya dengan item lain.`);
    if (pm.length) actions.push("Periksa lembar jawaban person yang misfit; sebagai analisis sensitivitas, jalankan ulang " +
      "tanpa mereka dan bandingkan hasilnya.");
    const s = res.summary;
    const tech = [
      T("MNSQ fit range", rng, res.settings.strict_fit ? "strict (high-stakes)" : "productive for measurement"),
      T("Degrading MNSQ limit", num(r.MNSQ_DEGRADING, 1), "> nilai ini: merah"),
      T("Mean item Infit / Outfit MNSQ", `${num(s.item_mean_infit)} / ${num(s.item_mean_outfit)}`, "~1,00"),
      T("Mean person Infit / Outfit MNSQ", `${num(s.person_mean_infit)} / ${num(s.person_mean_outfit)}`, "~1,00"),
      T("Misfitting items", String(flagged.length), "0"),
      T("Items with negative PTMEA", String(negpt.length), "0"),
      T("Misfitting persons", `${pm.length} (${pct(share, 1)})`, ""),
    ];
    for (const x of est.filter((x) => flagged.includes(x.item))) {
      tech.push(T(`  ${x.item}`, `Infit ${num(x.infit_mnsq)} (ZSTD ${num(x.infit_zstd, 1)}), ` +
        `Outfit ${num(x.outfit_mnsq)} (ZSTD ${num(x.outfit_zstd, 1)}), ` +
        `PTMEA ${num(x.ptmea_obs)} / exp. ${num(x.ptmea_exp)}`, ""));
    }
    const rk = ["linacre_2002_mnsq", "wright_masters_1982", "wilson_hilferty_1931"];
    if (res.settings.strict_fit) rk.splice(1, 0, "wright_linacre_1994");
    const section = { key: "item_fit", title: "Item and Person Fit", status, paragraphs: paras, actions, technical: tech, references: refs(...rk) };
    return [{ key: "item_fit", title: "Item Fit", status, sentence }, section];
  }

  function dimensionality(res) {
    const r = R(), d = res.dimensionality, q3 = res.q3;
    const eig = d.first_contrast_eigenvalue;
    const load = d.loadings.map((x, k) => [x[0], x[1], k]).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    const pos = load.slice().reverse().filter((x) => x[1] > 0).map((x) => x[0]).slice(0, 3);
    const neg = load.filter((x) => x[1] < 0).map((x) => x[0]).slice(0, 3);
    const pairs = q3.flagged_pairs;
    const pairText = names(pairs.map((p) => `${p.item_a}-${p.item_b} (Q3 ${num(p.q3)})`), undefined, "pasangan");
    let status, sentence;
    if (eig >= r.CONTRAST_EIGENVALUE_RED) {
      status = r.RED;
      sentence = `Terdapat indikasi dimensi kedua yang cukup kuat (first contrast eigenvalue ${num(eig)}); ` +
        "skor total mungkin mencampur dua hal berbeda.";
    } else if (eig >= r.CONTRAST_EIGENVALUE_MAX || pairs.length) {
      status = r.YELLOW;
      const parts = [];
      if (eig >= r.CONTRAST_EIGENVALUE_MAX) parts.push(`first contrast eigenvalue ${num(eig)}`);
      if (pairs.length) parts.push(`${pairs.length} pasangan item dengan local dependence`);
      sentence = `Asumsi unidimensionality perlu diperiksa (${parts.join(" dan ")}).`;
    } else {
      status = r.GREEN;
      sentence = `Data mendukung unidimensionality: tes mengukur satu hal utama (first contrast eigenvalue ` +
        `${num(eig)} < ${num(r.CONTRAST_EIGENVALUE_MAX, 1)}) tanpa pasangan item yang saling ` +
        "bergantung.";
    }
    const paras = [
      "Unidimensionality berarti semua item mengukur satu hal yang sama, seperti semua soal ujian " +
      "matematika memang mengukur kemampuan matematika dan bukan kemampuan membaca. Setelah pengaruh " +
      "measure dikeluarkan, sisa jawaban (residual) seharusnya acak. PCA of residuals (analisis komponen " +
      "utama atas residual) mencari pola yang tersisa; first contrast eigenvalue menyatakan kekuatan pola " +
      "itu dalam satuan 'setara sekian item'.",
      `Raw variance explained by measures sebesar ${pct(d.variance_explained_pct, 1)}. Angka ini sangat ` +
      "bergantung pada sebaran kemampuan person dan kesulitan item, sehingga tidak dipakai sebagai kriteria " +
      "tunggal.",
    ];
    if (eig >= r.CONTRAST_EIGENVALUE_MAX) {
      paras.push(`First contrast memiliki kekuatan setara sekitar ${num(eig, 1)} item. Item dengan loading positif ` +
        `terbesar (${names(pos)}) dan negatif terbesar (${names(neg)}) membentuk dua kutub. Telaah isi kedua ` +
        "kelompok ini: bila keduanya mengukur aspek yang berbeda secara bermakna (misalnya soal hitungan " +
        "dan soal cerita), dimensi kedua tersebut kemungkinan nyata.");
    } else {
      paras.push(`Pola yang tersisa (eigenvalue ${num(eig)}) masih dalam batas yang wajar terjadi secara ` +
        "kebetulan.");
    }
    if (pairs.length) {
      paras.push(`Local dependence terdeteksi pada ${pairText}. Dua item seperti ini seolah 'saling menyontek': ` +
        "jawaban satu item ikut menentukan jawaban item lain di luar kemampuan yang diukur, misalnya soal " +
        "bertingkat dari satu wacana atau dua item dengan redaksi hampir sama. Akibatnya reliability dapat " +
        "tampak lebih tinggi daripada yang sebenarnya.");
    }
    const actions = [];
    if (eig >= r.CONTRAST_EIGENVALUE_MAX) actions.push(`Bandingkan isi ${names(pos)} dengan ${names(neg)}; bila memang berbeda konstruk, ` +
      "pertimbangkan melaporkan skor terpisah atau menganalisis kedua kelompok secara terpisah.");
    if (pairs.length) actions.push("Untuk pasangan yang saling bergantung, pertimbangkan menggabungkannya menjadi satu item " +
      "bertingkat (testlet), merevisi redaksinya, atau mempertahankan salah satunya.");
    const tech = [
      T("First contrast eigenvalue", num(eig),
        `< ${num(r.CONTRAST_EIGENVALUE_MAX, 1)} hijau; >= ${num(r.CONTRAST_EIGENVALUE_RED, 1)} merah`),
      T("Raw variance explained by measures", pct(d.variance_explained_pct, 1), "tidak dipakai sebagai kriteria"),
      T("First contrast (% of total variance)", pct(d.first_contrast_pct_total, 1), ""),
      T("Mean Q3", num(q3.mean, 3), ""),
      T(`Q3 cutoff (mean Q3 + ${num(r.Q3_RELATIVE_CUTOFF, 1)})`, num(q3.cutoff, 3), `+${num(r.Q3_RELATIVE_CUTOFF, 1)}`),
      T("Max Q3", num(q3.max, 3), ""),
      T("Flagged Q3 pairs", String(pairs.length), "0"),
    ];
    const section = { key: "dimensionality", title: "Dimensionality and Local Dependence", status, paragraphs: paras, actions,
      technical: tech, references: refs("linacre_winsteps_manual", "raiche_2005", "linacre_2006_variance", "christensen_2017", "yen_1984") };
    return [{ key: "dimensionality", title: "Dimensionality", status, sentence }, section];
  }

  function targetingUnit(rmse) {
    return isF(rmse) && rmse > 0 ? Math.min(1, rmse) : 1;
  }

  function targeting(res) {
    const r = R(), s = res.summary;
    const diff = s.targeting;
    const poly = res.model !== "dichotomous";
    const ad = Math.abs(diff);
    const unit = targetingUnit(s.person.model_rmse);
    const ratio = ad / unit;
    const status = ratio < r.TARGETING_GOOD ? r.GREEN : ratio < r.TARGETING_POOR ? r.YELLOW : r.RED;
    const direction = diff > 0
      ? (poly ? "person cenderung mudah memberi skor tinggi pada item-item ini" : "tes relatif mudah bagi kelompok ini")
      : (poly ? "person cenderung jarang memberi skor tinggi pada item-item ini" : "tes relatif sulit bagi kelompok ini");
    const sentence = status === r.GREEN
      ? `Tingkat kesulitan item sesuai dengan kemampuan person (selisih rata-rata measure ${num(diff)} logit).`
      : `Rata-rata person measure berada ${num(ad)} logit ${diff > 0 ? "di atas" : "di bawah"} ` +
        `rata-rata item measure; ${direction}.`;
    const valid = res.persons.filter((x) => isF(x.measure));
    const nMax = res.coded.personExtreme.filter((v) => v === 1).length;
    const nMin = res.coded.personExtreme.filter((v) => v === -1).length;
    let loc;
    if (poly) loc = res.jmle.thresholdLocation.flatMap((row) => Array.from(row).filter(isF));
    else loc = res.items.filter((x) => !x.extreme).map((x) => x.measure);
    const pm = valid.map((x) => x.measure);
    const above = loc.length ? 100 * mean(pm.map((v) => (v > Math.max(...loc) ? 1 : 0))) : NaN;
    const below = loc.length ? 100 * mean(pm.map((v) => (v < Math.min(...loc) ? 1 : 0))) : NaN;
    const tw = poly ? "threshold" : "item";
    const paras = [
      "Targeting ibarat memasang mistar lompat tinggi. Bila mistar dipasang jauh di bawah kemampuan semua " +
      "peserta, semuanya lolos dan kita tidak tahu siapa yang paling hebat; bila terlalu tinggi, semuanya " +
      "gagal. Tes yang well-targeted berisi item dengan kesulitan yang menyebar di sekitar kemampuan person, " +
      "sehingga setiap item memberi informasi.",
      `Rata-rata person measure adalah ${num(s.person_mean)} logit, sedangkan rata-rata item measure ` +
      `ditetapkan 0 logit; selisihnya ${num(diff)} logit` +
      (status === r.GREEN ? ", relatif kecil sehingga item umumnya berada di sekitar kemampuan person. "
        : `, yang mengindikasikan ${direction}. `) +
      `Sekitar ${pct(above)} person berada di atas ${tw} tersulit dan ${pct(below)} di bawah ` +
      `${tw} termudah, wilayah tempat tes memberi sedikit informasi.`,
    ];
    if (nMax || nMin) {
      paras.push(`Sebanyak ${nMax} person mendapat skor maksimum dan ${nMin} skor minimum (extreme score). Batas ` +
        "kemampuan mereka tidak terukur oleh tes ini, sehingga measure mereka hanya perkiraan dengan " +
        "penyesuaian 0,3 poin.");
    }
    const actions = [];
    if (status !== r.GREEN) {
      if (diff > 0) actions.push("Tambahkan item yang lebih sulit" + (poly ? " (pernyataan yang lebih 'berat' untuk disetujui)" : "") +
        " agar person berkemampuan tinggi juga terukur presisi.");
      else actions.push("Tambahkan item yang lebih mudah" + (poly ? " (pernyataan yang lebih mudah disetujui)" : "") +
        " agar person berkemampuan rendah juga terukur presisi.");
    }
    if (nMax + nMin > 0.05 * Math.max(valid.length, 1)) {
      actions.push("Proporsi extreme score cukup besar; pertimbangkan memperluas rentang kesulitan item.");
    }
    const tech = [
      T("Mean person measure (non-extreme)", num(s.person_mean), ""),
      T("Person measure SD", num(s.person.sd), ""),
      T("Mean item measure", num(s.item_mean), "0 (identifikasi skala)"),
      T("Targeting (mean difference)", `${num(diff)} logit = ${num(ratio)} satuan`,
        `< ${num(r.TARGETING_GOOD, 1)} satuan hijau; >= ${num(r.TARGETING_POOR, 1)} satuan merah`),
      T("Targeting unit", `${num(unit, 3)} logit`,
        "yang lebih kecil antara 1 logit dan person RMSE (MODEL); tafsiran teraman tabel Fisher (2007)"),
      T(`Persons above the hardest ${tw}`, pct(above, 1), ""),
      T(`Persons below the easiest ${tw}`, pct(below, 1), ""),
      T("Extreme scores (maximum / minimum)", `${nMax} / ${nMin}`, ""),
    ];
    const section = { key: "targeting", title: "Targeting", status, paragraphs: paras, actions, technical: tech,
      references: refs("fisher_2007", "wright_stone_1979") };
    return [{ key: "targeting", title: "Targeting", status, sentence }, section];
  }

  function categories(res) {
    const r = R();
    if (res.model === "dichotomous" || !res.categories) {
      const section = { key: "categories", title: "Category Functioning", status: r.GRAY,
        paragraphs: ["Analisis category functioning hanya relevan untuk skala bertingkat (polytomous)."],
        actions: [], technical: [], references: [] };
      return [{ key: "categories", title: "Category Functioning", status: r.GRAY,
        sentence: "Tidak berlaku: data dichotomous hanya memiliki dua kategori." }, section];
    }
    const cat = res.categories, rsm = res.model === "rsm";
    const disT = cat.filter((x) => x.flag_disordered_threshold);
    const disA = cat.filter((x) => x.flag_disordered_avg);
    const low = cat.filter((x) => x.flag_low_count);
    const hiOut = cat.filter((x) => x.flag_outfit_high);
    const order = unique(cat.map((x) => x.item));
    const where = (df) => (rsm ? "skala bersama" : names(order.filter((n) => df.some((x) => x.item === n))));
    let status, sentence;
    if (disT.length || disA.length) {
      status = r.RED;
      const bits = [];
      if (disT.length) bits.push(`disordered threshold (${where(disT)})`);
      if (disA.length) bits.push(`observed average tidak naik (${where(disA)})`);
      sentence = `Sebagian kategori jawaban tidak berfungsi berurutan: ${bits.join("; ")}.`;
    } else if (low.length || hiOut.length) {
      status = r.YELLOW;
      const bits = [];
      if (low.length) bits.push(`${low.length} kategori dengan kurang dari ${r.CATEGORY_MIN_COUNT} observasi`);
      if (hiOut.length) bits.push(`${hiOut.length} kategori dengan category outfit tinggi`);
      sentence = `Kategori jawaban berurutan, tetapi ada ${bits.join(" dan ")}.`;
    } else {
      status = r.GREEN;
      sentence = "Kategori jawaban berfungsi berurutan dan cukup sering dipakai.";
    }
    const paras = [
      "Kategori jawaban dapat dibayangkan sebagai anak tangga. Setiap Andrich threshold adalah titik tempat " +
      "person beralih dari satu kategori ke kategori berikutnya, dan seharusnya lebih tinggi daripada " +
      "threshold sebelumnya. Bila sebuah threshold lebih rendah dari sebelumnya (disordered threshold), ada " +
      "kategori yang jarang menjadi pilihan paling mungkin bagi siapa pun, sehingga person kemungkinan sulit " +
      "membedakannya dari kategori di sebelahnya.",
    ];
    if (rsm) {
      const th = cat.map((x) => x.threshold).filter((v) => !Number.isNaN(v) && v !== null);
      paras.push(`Pada RSM, semua item berbagi Andrich threshold yang sama: ${th.map((t) => num(t)).join("; ")} ` +
        `logit (${!disT.length ? "naik berurutan" : "tidak seluruhnya naik berurutan"}).`);
    } else {
      const nItems = order.length;
      const nBad = unique(disT.map((x) => x.item)).length;
      paras.push(`Pada PCM, setiap item memiliki Andrich threshold sendiri; ${nBad} dari ${nItems} item ` +
        "memiliki disordered threshold.");
    }
    const actions = [];
    for (const item of unique(disT.map((x) => x.item))) {
      const block = cat.filter((x) => x.item === item);
      for (const g of disT.filter((x) => x.item === item)) {
        const k = g.category;
        const mid = block[k - 1].label;
        const left = k - 2 >= 0 ? block[k - 2].label : null;
        const right = block[k].label;
        const subject = rsm ? "Pada skala bersama" : `Pada item ${item}`;
        paras.push(`${subject}, threshold menuju kategori '${right}' (${num(block[k].threshold)}) lebih rendah ` +
          `daripada threshold menuju kategori '${mid}' (${num(block[k - 1].threshold)}), sehingga ` +
          `kategori '${mid}' jarang menjadi pilihan paling mungkin.`);
        const neighbours = left !== null ? `'${left}' atau '${right}'` : `'${right}'`;
        actions.push(`${subject}: pertimbangkan menggabungkan kategori '${mid}' dengan ${neighbours}, lalu ` +
          "jalankan ulang analisis; periksa juga apakah label kategori itu mudah dibedakan.");
      }
    }
    if (disA.length) {
      paras.push("Observed average (rata-rata measure person yang memilih tiap kategori) tidak naik berurutan pada " +
        `${where(disA)}: person yang memilih kategori lebih tinggi justru rata-rata berkemampuan lebih ` +
        "rendah. Ini mengindikasikan kategori dipahami tidak sesuai urutan yang dimaksud.");
      actions.push("Telaah label dan urutan kategori yang observed average-nya tidak naik; pastikan tidak ada " +
        "kesalahan pengodean arah skala.");
    }
    if (low.length) {
      const listing = names(low.map((x) => `'${x.label}'` + (rsm ? "" : ` pada ${x.item}`) + ` (${x.count} observasi)`), undefined, "kategori");
      paras.push(`Kategori dengan observasi sangat sedikit: ${listing}. Threshold di sekitarnya kurang stabil.`);
      actions.push("Gabungkan kategori yang jarang dipakai dengan kategori tetangganya bila secara makna masuk akal.");
    }
    if (hiOut.length) {
      const listing = names(hiOut.map((x) => `'${x.label}'` + (rsm ? "" : ` pada ${x.item}`) +
        ` (outfit ${num(x.outfit_mnsq)} vs expected ${num(x.outfit_expected)})`), undefined, "kategori");
      paras.push("Kategori dengan category outfit tinggi, yaitu dipakai secara lebih tidak terduga daripada " +
        `harapan model: ${listing}.`);
      actions.push("Periksa siapa yang memilih kategori dengan category outfit tinggi; pola ini dapat muncul " +
        "bila person memakai kategori tersebut secara tidak konsisten.");
    }
    const tech = [
      T("Categories below minimum count", String(low.length), `>= ${r.CATEGORY_MIN_COUNT} observasi per kategori`),
      T("Disordered thresholds", String(disT.length), "0"),
      T("Disordered observed averages", String(disA.length), "0"),
      T("High category outfit", String(hiOut.length), `>= ${num(r.CATEGORY_OUTFIT_MAX, 1)} dan melampaui harapan model (z > 1,645)`),
    ];
    if (rsm) {
      for (const x of cat) {
        tech.push(T(`  Category '${x.label}'`, `count ${x.count} (${pct(x.percent, 1)}), observed average ${num(x.avg_measure)}, ` +
          `outfit ${num(x.outfit_mnsq)} (exp. ${num(x.outfit_expected)}), ` +
          `Andrich threshold ${num(x.threshold)} (SE ${num(x.threshold_se)})`, ""));
      }
    }
    const section = { key: "categories", title: "Category Functioning", status, paragraphs: paras, actions, technical: tech,
      references: refs("linacre_2002_categories", "andrich_1978", "masters_1982", "linacre_winsteps_manual") };
    return [{ key: "categories", title: "Category Functioning", status, sentence }, section];
  }

  function peq(p) { const t = pval(p); return t.startsWith("<") ? t : `= ${t}`; }

  function dif(res) {
    const r = R(), d = res.dif;
    const title = "Differential Item Functioning (DIF)";
    if (!d || !d.length) {
      const section = { key: "dif", title, status: r.GRAY, paragraphs: ["Pilih kolom grup dengan tepat dua kategori (misalnya jenis kelamin) untuk menjalankan " +
        "analisis DIF."], actions: [], technical: [], references: [] };
      return [{ key: "dif", title: "DIF", status: r.GRAY,
        sentence: "DIF tidak dianalisis (kolom grup tidak dipilih atau tidak memiliki tepat dua kategori)." }, section];
    }
    const flagged = d.filter((x) => x.flag_dif);
    const big = flagged.filter((x) => x.ets_category === "C");
    const ga = d[0].group_a, gb = d[0].group_b;
    const harder = (x) => (x.contrast > 0 ? ga : gb);
    let status, sentence;
    if (big.length) {
      status = r.RED;
      sentence = `${big.length} item menunjukkan DIF besar (ETS category C) dan perlu ditelaah isinya: ` +
        `${names(big.map((x) => x.item))}.`;
    } else if (flagged.length) {
      status = r.YELLOW;
      sentence = `${flagged.length} item menunjukkan DIF yang perlu ditelaah: ${names(flagged.map((x) => x.item))}.`;
    } else {
      status = r.GREEN;
      sentence = `Tidak ada item yang menunjukkan DIF bermakna antara kelompok ${ga} dan ${gb}.`;
    }
    const paras = [
      "DIF terjadi bila dua orang dengan kemampuan yang sama, tetapi dari kelompok berbeda, memiliki peluang " +
      "berbeda untuk menjawab benar sebuah item, seperti timbangan yang berat sebelah. Person measure setiap " +
      "person dikunci (anchored), lalu item measure dihitung ulang terpisah untuk tiap kelompok; selisih " +
      "keduanya disebut DIF contrast.",
    ];
    if (flagged.length) {
      const detail = flagged.slice(0, MAX()).map((x) => `${x.item} lebih sulit bagi kelompok ${harder(x)} (DIF contrast ${num(Math.abs(x.contrast))} logit, ` +
        `t = ${num(Math.abs(x.t))}, ETS category ${x.ets_category})`).join("; ");
      paras.push(`Item yang ditandai: ${detail}.`);
      paras.push("DIF adalah tanda untuk menelaah isi item, bukan bukti otomatis bahwa item itu bias. Perbedaan dapat " +
        "bersumber dari konteks budaya, pilihan kata, atau pengalaman yang lebih akrab bagi satu kelompok, " +
        "tetapi juga dapat mencerminkan perbedaan pembelajaran yang memang nyata.");
    }
    const nA = Math.max(...d.map((x) => x.n_a)), nB = Math.max(...d.map((x) => x.n_b));
    paras.push(`Analisis ini melibatkan sekitar ${nA} person kelompok ${ga} dan ${nB} person kelompok ${gb}. Pada sampel ` +
      "kecil, DIF yang nyata dapat terlewat; pada sampel sangat besar, perbedaan kecil pun dapat signifikan, " +
      "sehingga besar DIF contrast (logit) lebih penting daripada nilai t.");
    const actions = [];
    if (flagged.length) {
      actions.push(`Minta panel ahli menelaah isi ${names(flagged.map((x) => x.item))} dari sudut bahasa, konteks, dan ` +
        "keakraban pengalaman bagi tiap kelompok.");
      actions.push("Bila ditemukan sumber bias yang masuk akal, revisi atau ganti item tersebut.");
    }
    const count = (c) => d.filter((x) => x.ets_category === c).length;
    const tech = [
      T("Groups (A / B)", `${ga} / ${gb}`, "DIF contrast = measure A - measure B"),
      T("Flagging criterion", `DIF contrast mutlak >= ${num(r.DIF_CONTRAST_MIN, 1)} dan t mutlak > ` +
        `${num(res.settings.dif_t_min, 1)}`,
        `Draba (1977): t > ${num(r.DIF_T_MIN, 1)}; t > ${num(r.DIF_T_MIN_MANY_ITEMS, 1)} bila lebih ` +
        `dari ${r.DIF_MANY_ITEMS} item`),
      T("ETS category (A / B / C)", `${count("A")} / ${count("B")} / ${count("C")}`,
        `C: DIF mutlak >= ${num(r.DIF_ETS_C)} dan bermakna melampaui ${num(r.DIF_ETS_B)} (p < 0,05)`),
    ];
    for (const x of flagged) {
      tech.push(T(`  ${x.item}`, `${num(x.measure_a)} vs ${num(x.measure_b)}; DIF contrast ${num(x.contrast)} ` +
        `(Joint SE ${num(x.joint_se)}), t(${num(x.df, 0)}) = ${num(x.t)}, ` +
        `p ${peq(x.p)}`, ""));
    }
    const section = { key: "dif", title, status, paragraphs: paras, actions, technical: tech,
      references: refs("draba_1977", "zwick_1999", "welch_1947", "linacre_winsteps_manual") };
    return [{ key: "dif", title: "DIF", status, sentence }, section];
  }

  function interpret(res) {
    const parts = [reliability(res), itemFit(res), dimensionality(res), targeting(res), categories(res), dif(res)];
    return {
      model: res.model, modelName: TEXT.modelNames[res.model],
      lights: parts.map((p) => p[0]), intro: intro(res.model), sections: parts.map((p) => p[1]),
      cautions: res.issues.filter((i) => i.level === "warning").map((i) => i.message),
    };
  }

  const DOTS = { hijau: "🟢", kuning: "🟡", merah: "🔴", abu: "⚪" };

  function summaryMarkdown(it) {
    const lines = [`## Ringkasan 1 Menit (${it.modelName})`, ""];
    for (const c of it.cautions) if (c.includes("TIDAK konvergen")) lines.push(`> ${c}`, "");
    for (const l of it.lights) lines.push(`- ${DOTS[l.status]} **${l.title}** (${TEXT.lightStatus[l.status]}): ${l.sentence}`);
    return lines.join("\n") + "\n";
  }

  function toMarkdown(it, technical = true) {
    let out = [summaryMarkdown(it), "## Penjelasan", ""];
    out = out.concat(it.intro.map((p) => p + "\n"));
    if (it.cautions.length) out = out.concat(["### Catatan data", ""], it.cautions.map((c) => `- ${c}`), [""]);
    for (const sec of it.sections) {
      out.push(`### ${sec.title}`, "");
      out = out.concat(sec.paragraphs.map((p) => p + "\n"));
      if (sec.actions.length) out = out.concat(["**Saran tindakan:**", ""], sec.actions.map((a) => `- ${a}`), [""]);
      if (technical && sec.technical.length) {
        out.push("<details><summary>Detail teknis</summary>", "", "| Statistik | Nilai | Kriteria |", "|---|---|---|");
        out = out.concat(sec.technical.map((t) => `| ${t.label.trim()} | ${t.value} | ${t.criterion} |`));
        if (sec.references.length) out = out.concat(["", "Rujukan:", ""], sec.references.map((x) => `- ${x}`));
        out.push("", "</details>", "");
      }
    }
    return out.join("\n");
  }

  const api = { setText, interpret, toMarkdown, summaryMarkdown, num, pct, pval, names, targetingUnit };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RaschInterpret = api;
})(typeof window !== "undefined" ? window : globalThis);
