/* RaschLite: lapisan inferensi lintas indikator (khusus versi HTML).
 *
 * interpret.js menghasilkan narasi yang setara dengan versi desktop (diuji terhadap Python).
 * Modul ini membangun narasi akhir di atasnya: lampu dinilai dengan logika baru (ZSTD + selisih
 * PTMEA, ambang dimensionalitas dari simulasi, targeting berbasis informasi, DIF dengan daya),
 * setiap vonis diberi tingkat keyakinan, dan ringkasan menalar hubungan antar-indikator.
 * Templat teks dibedakan antara tes kemampuan dan angket.
 */
(function (root) {
  "use strict";
  let TEXT = root.RASCH_TEXT || null, I = root.RaschInterpret || null, A = root.RaschAdvanced || null;
  function setText(t) { TEXT = t; }
  function setModules(interp, adv) { I = interp; A = adv; }
  const isF = (v) => typeof v === "number" && isFinite(v);
  const num = (x, d = 2) => I.num(x, d), pct = (x, d = 0) => I.pct(x, d);
  const names = (v, k, unit) => I.names(v, k, unit);
  const T = (label, value, criterion = "") => ({ label, value, criterion });
  const ST = { GREEN: "hijau", YELLOW: "kuning", RED: "merah", GRAY: "abu", TENTATIVE: "tentatif" };

  const REFS = {
    ludlow_1999: "Ludlow, L. H., & O'Leary, M. (1999). Scoring omitted and not-reached items: Practical data analysis implications. Educational and Psychological Measurement, 59(4), 615-630.",
    snijders_2001: "Snijders, T. A. B. (2001). Asymptotic null distribution of person fit statistics with estimated person parameter. Psychometrika, 66(3), 331-342.",
    meijer_2001: "Meijer, R. R., & Sijtsma, K. (2001). Methodology review: Evaluating person fit. Applied Psychological Measurement, 25(2), 107-135.",
    amh_2012: "Andrich, D., Marais, I., & Humphry, S. (2012). Using a theorem by Andersen and the dichotomous Rasch model to assess the presence of random guessing in multiple choice items. Journal of Educational and Behavioral Statistics, 37(3), 417-442.",
    christensen_2017: "Christensen, K. B., Makransky, G., & Horton, M. (2017). Critical values for Yen's Q3: Identification of local dependence in the Rasch model using residual correlations. Applied Psychological Measurement, 41(3), 178-194.",
    smith_2002: "Smith, E. V. (2002). Detecting and evaluating the impact of multidimensionality using item fit statistics and principal component analysis of residuals. Journal of Applied Measurement, 3(2), 205-231.",
    holland_1988: "Holland, P. W., & Thayer, D. T. (1988). Differential item performance and the Mantel-Haenszel procedure. In H. Wainer & H. I. Braun (Eds.), Test validity (pp. 129-145). Erlbaum.",
    rbg_1986: "Robins, J., Breslow, N., & Greenland, S. (1986). Estimators of the Mantel-Haenszel variance consistent in both sparse data and large-strata limiting models. Biometrics, 42(2), 311-323.",
    swaminathan_1990: "Swaminathan, H., & Rogers, H. J. (1990). Detecting differential item functioning using logistic regression procedures. Journal of Educational Measurement, 27(4), 361-370.",
    jodoin_2001: "Jodoin, M. G., & Gierl, M. J. (2001). Evaluating type I error and power rates using an effect size measure with the logistic regression procedure for DIF detection. Applied Measurement in Education, 14(4), 329-349.",
    bh_1995: "Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate: A practical and powerful approach to multiple testing. Journal of the Royal Statistical Society: Series B, 57(1), 289-300.",
    andersen_1970: "Andersen, E. B. (1970). Asymptotic properties of conditional maximum-likelihood estimators. Journal of the Royal Statistical Society: Series B, 32(2), 283-301.",
    spearman_brown_1910: "Spearman, C. (1910). Correlation calculated from faulty data. British Journal of Psychology, 3(3), 271-295; Brown, W. (1910). Some experimental results in the correlation of mental abilities. British Journal of Psychology, 3(3), 296-322.",
    mantel_1959: "Mantel, N., & Haenszel, W. (1959). Statistical aspects of the analysis of data from retrospective studies of disease. Journal of the National Cancer Institute, 22(4), 719-748.",
  };
  const ref = (...keys) => keys.map((k) => REFS[k] || (TEXT.rules.REFERENCES[k] ?? k));

  const GLOSSARY = {
    not_reached: { term: "Not-reached vs omitted", short: "Kosong karena tidak sempat dikerjakan vs dilewati.", long: "Not-reached adalah butir kosong yang letaknya sesudah butir terakhir yang dijawab dalam satu blok, biasanya karena waktu habis. Omitted adalah butir kosong di tengah rentang yang sudah dikerjakan, biasanya karena person tidak tahu jawabannya. Keduanya memiliki makna berbeda sehingga perlakuannya juga sebaiknya berbeda (Ludlow & O'Leary, 1999)." },
    lz_star: { term: "lz* (person fit)", short: "Statistik person fit berbasis likelihood yang dikoreksi untuk theta estimasi.", long: "lz* membandingkan log-likelihood pola jawaban seseorang dengan harapannya, lalu distandardisasi dengan koreksi Snijders (2001) agar tetap mendekati distribusi normal baku walaupun theta diestimasi. Nilai di bawah -1,645 menandakan pola yang lebih tak terduga daripada wajar (underfit), misalnya menjawab acak atau menyontek; nilai positif besar menandakan pola yang terlalu rapi (overfit), yang tidak merusak pengukuran." },
    guttman: { term: "Guttman errors (G*)", short: "Banyaknya pasangan 'butir mudah salah, butir sulit benar'.", long: "Setiap pasangan butir dengan butir yang lebih mudah dijawab salah tetapi butir yang lebih sulit dijawab benar dihitung sebagai satu Guttman error. G* menormalkan jumlah itu menurut skor sehingga berada antara 0 dan 1." },
    mdc: { term: "Minimum detectable contrast", short: "DIF contrast terkecil yang dapat dideteksi dengan daya 80%.", long: "Dihitung dari joint SE kedua kelompok: (1,96 + 0,84) x joint SE. Bila nilainya lebih besar daripada ukuran DIF yang dianggap penting, tidak ditemukannya DIF belum berarti tidak ada DIF." },
    disattenuated: { term: "Disattenuated correlation", short: "Korelasi antar-measure dari dua gugus item setelah dikoreksi galat ukur.", long: "Korelasi measure person yang dihitung dari dua gugus item dibagi akar perkalian reliabilitas keduanya. Nilai mendekati 1 berarti kedua gugus mengukur hal yang sama; di bawah 0,71 berarti keduanya berbagi kurang dari separuh varians sejati." },
    smith_t: { term: "Smith's t-test", short: "Persentase person yang measure-nya berbeda bermakna antar-gugus item.", long: "Untuk setiap person, measure dari dua gugus item dibandingkan dengan uji t. Bila lebih dari 5% person berbeda bermakna (dengan batas bawah interval kepercayaan di atas 5%), data menunjukkan multidimensionalitas yang berdampak pada person (Smith, 2002)." },
    cmle: { term: "CMLE", short: "Conditional maximum likelihood: estimator item yang tidak bergantung pada estimasi person.", long: "CMLE mengondisikan likelihood pada raw score setiap person sehingga parameter person hilang dari persamaan dan estimasi item konsisten tanpa koreksi bias. Di RaschLite CMLE dipakai sebagai pembanding JMLE; selisih yang kecil memberi bukti bahwa koreksi bias JMLE memadai pada data Anda." },
    tailored: { term: "Tailored analysis", short: "Analisis ulang tanpa respons yang peluang benarnya sangat kecil.", long: "Andrich, Marais dan Humphry (2012) mengusulkan membuang respons dengan peluang benar menurut model di bawah batas c (misalnya 1/jumlah opsi), lalu mengestimasi ulang. Butir yang menjadi jauh lebih sulit setelah itu kemungkinan dipengaruhi tebakan." },
    info_eff: { term: "Information efficiency", short: "Informasi tes pada lokasi person dibandingkan maksimum yang mungkin.", long: "Untuk setiap person, informasi dari butir yang dijawab pada measure-nya dibagi informasi yang akan diperoleh bila setiap butir tepat sasaran. Nilai 1 berarti semua butir tepat di lokasi person." },
    mantel_haenszel: { term: "Mantel-Haenszel DIF", short: "Uji DIF nonparametrik dengan pencocokan pada kemampuan.", long: "Person dikelompokkan menurut measure, lalu peluang benar kedua kelompok dibandingkan di setiap strata. Delta MH (skala ETS) mengikuti klasifikasi A/B/C (Holland & Thayer, 1988)." },
    logistic_dif: { term: "Logistic regression DIF", short: "DIF uniform dan non-uniform melalui regresi logistik.", long: "Peluang benar dimodelkan dari measure, kelompok, dan interaksinya (Swaminathan & Rogers, 1990). Efek kelompok menunjukkan DIF uniform; interaksi menunjukkan DIF non-uniform. Ukuran efek Nagelkerke delta R2 diklasifikasikan menurut Jodoin dan Gierl (2001)." },
  };

  // ------------------------------------------------------------------------------------
  // Tingkat keyakinan
  // ------------------------------------------------------------------------------------
  function confidence(level, reason) { return { level, reason }; }
  const CONF_LABEL = { tinggi: "keyakinan tinggi", sedang: "keyakinan sedang", rendah: "keyakinan rendah" };

  // ------------------------------------------------------------------------------------
  // Bagian: kualitas data dan respons
  // ------------------------------------------------------------------------------------
  function dataQuality(res, adv) {
    const ms = adv.ms, pq = adv.pq, tes = adv.opts.testType === "tes";
    const N = res.summary.n_persons;
    const paras = [], actions = [], tech = [];
    let status = ST.GREEN;
    const bits = [];
    if (ms && ms.missing > 0) {
      paras.push(`Sebanyak ${pct(ms.pctMissing, 1)} sel data kosong. Dari jumlah itu, ${pct(100 * ms.omitted / ms.missing)} tergolong omitted ` +
        `(dilewati di tengah rentang yang dikerjakan) dan ${pct(100 * ms.notReached / ms.missing)} tergolong not-reached (sesudah butir terakhir ` +
        `yang dijawab${adv.blocks.detected ? " di setiap blok" : ""}). Pembedaan ini penting karena butir yang tidak sempat dikerjakan tidak memberi ` +
        "informasi apa pun tentang kemampuan, sedangkan butir yang dilewati kemungkinan besar memang tidak diketahui jawabannya.");
      if (ms.speeded) {
        paras.push(`Pola kosong mengikuti posisi butir (korelasi posisi dengan % not-reached ${num(ms.trend)}): proporsi person yang ` +
          "mencapai butir terakhir menurun tajam, sehingga tes ini tampak speeded. " +
          (isF(pq.r_answered_measure) ? `Jumlah butir yang dijawab berkorelasi ${num(pq.r_answered_measure)} dengan measure dan ${num(pq.r_answered_pcorrect)} ` +
            "dengan proporsi benar di antara butir yang dijawab. " : "") +
          (Math.abs(pq.r_answered_measure) < 0.3 ? "Kecepatan kerja hampir tidak berkaitan dengan kemampuan, sehingga memperlakukan not-reached sebagai missing relatif aman untuk kalibrasi butir. "
            : "Kecepatan kerja berkaitan cukup kuat dengan kemampuan; data kosong tidak dapat dianggap acak terhadap kemampuan. ") +
          (pq.r_answered_pcorrect < -0.3 ? "Korelasi negatif dengan proporsi benar menandakan sebagian person mempercepat kerja dengan mengorbankan ketelitian, misalnya menebak menjelang batas waktu." : ""));
        bits.push("pola speeded");
        if (adv.treatment === "asis") {
          status = ST.YELLOW;
          actions.push({ stage: 1, text: "Pilih perlakuan data kosong secara eksplisit di langkah Model. Untuk tes speeded, prosedur Ludlow dan O'Leary (1999) " +
            "mengalibrasi butir dengan not-reached diabaikan lalu menskor person dengan semua kosong dihitung salah." });
        }
      }
      tech.push(T("Sel kosong (omitted / not-reached)", `${pct(ms.pctMissing, 1)} (${pct(ms.pctOmitted, 1)} / ${pct(ms.pctNotReached, 1)})`, ""));
      tech.push(T("Korelasi posisi butir dengan % not-reached", num(ms.trend), `pola speeded bila >= ${num(A.RULES.SPEED_TREND, 1)} dan not-reached >= ${pct(100 * A.RULES.SPEED_NR_SHARE)} dari sel kosong`));
    }
    const TREAT = { asis: "kosong = missing", lo1999: "Ludlow & O'Leary (1999): kalibrasi dengan not-reached diabaikan, penskoran dengan kosong = salah", allwrong: "semua kosong = salah" };
    tech.push(T("Perlakuan data kosong", TREAT[adv.treatment] || adv.treatment, ""));
    if (adv.scored) {
      paras.push(`Sesuai perlakuan Ludlow dan O'Leary, measure akhir person dihitung ulang dengan item dijangkarkan pada hasil kalibrasi dan semua ` +
        `butir kosong dihitung salah. Person reliability berdasarkan measure akhir ini ${num(adv.scored.separation.model_reliability)} (MODEL), ` +
        `dibandingkan ${num(res.summary.person.model_reliability)} pada measure kalibrasi. Kolom 'Measure (skor akhir)' di tabel Person memuat nilainya.`);
    }
    // kualitas respons person
    const under = pq.n_underfit, ne = pq.n_nonextreme, exp = pq.expected_false_positive;
    const share = 100 * under / Math.max(ne, 1);
    if (pq.method === "lz*") {
      paras.push(`Person fit dinilai dengan lz* (Snijders, 2001), yang mempunyai distribusi rujukan normal baku sehingga laju tanda palsu dapat dikendalikan. ` +
        `${under} dari ${ne} person non-extreme (${pct(share, 1)}) underfit (lz* < ${num(A.RULES.LZ_UNDERFIT, 3)}), padahal secara acak diharapkan sekitar ` +
        `${num(exp, 0)} person (5%). Sebagai pembanding, kriteria lama yang meminjam rentang MNSQ item menandai ${pct(pq.pct_classic, 1)} person; selisih ini ` +
        `menunjukkan bahwa sebagian besar tanda lama berasal dari fluktuasi MNSQ pada person, bukan pola yang benar-benar menyimpang. ` +
        `${pq.n_overfit} person overfit (lz* > ${num(A.RULES.LZ_OVERFIT, 3)}); pola yang terlalu rapi tidak merusak pengukuran dan tidak perlu ditindaklanjuti.` +
        (isF(pq.lz_sd) ? ` Simpangan baku lz* pada data ini ${num(pq.lz_sd)}` + (adv.sim && isF(adv.sim.lz_sd_mean) ? `, sedangkan pada data simulasi yang patuh model ${num(adv.sim.lz_sd_mean)}.` : ".") : ""));
    } else {
      paras.push(`Person fit dinilai dari Infit/Outfit MNSQ yang sekaligus bermakna secara statistik (ZSTD > 2). ${under} dari ${ne} person (${pct(share, 1)}) ` +
        `underfit menurut kriteria gabungan ini, dibandingkan ${pct(pq.pct_classic, 1)} menurut rentang MNSQ saja.`);
    }
    if (tes && pq.nOptions) {
      paras.push(`Dengan ${pq.nOptions} opsi jawaban, peluang benar karena menebak adalah ${pct(100 / pq.nOptions)}. ${pq.n_chance} person memperoleh skor yang tidak ` +
        "lebih tinggi secara bermakna daripada tebakan murni (uji binomial satu sisi, p > 0,05). Skor mereka tidak dapat dibedakan dari menebak, " +
        "walaupun sebagian mungkin memang berkemampuan sangat rendah.");
    }
    if (share > 2 * 5 || (tes && pq.n_chance > 0.1 * N)) { status = status === ST.GREEN ? ST.YELLOW : status; bits.push("responden menyimpang melebihi harapan"); }
    if (share > 20 || (tes && pq.n_chance > 0.2 * N)) { status = ST.RED; }
    if (adv.sens && adv.sens.length > 1) {
      const s0 = adv.sens[0], s1 = adv.sens[1];
      if (!s1.skipped && !s1.error) {
        paras.push(`Analisis sensitivitas: tanpa ${s1.excluded} person yang menyimpang, person reliability berubah dari ${num(s0.person_reliability)} menjadi ` +
          `${num(s1.person_reliability)}, first contrast eigenvalue dari ${num(s0.eigenvalue)} menjadi ${num(s1.eigenvalue)}, dan item measure bergeser ` +
          `rata-rata ${num(s1.mean_abs_shift)} logit (terbesar ${num(s1.max_abs_shift)} pada ${s1.max_shift_item}; korelasi ${num(s1.r_measures, 3)}).` +
          (s1.eigenvalue < s0.eigenvalue - 0.5 ? " Turunnya eigenvalue berarti sebagian 'dimensi kedua' berasal dari responden yang menyimpang, bukan dari isi butir." : "") +
          (s1.person_reliability < s0.person_reliability - 0.03 ? " Reliabilitas justru turun karena responden menyimpang ikut memperlebar sebaran measure; reliabilitas yang dilaporkan sebagian ditopang oleh mereka." : ""));
      }
      tech.push(T("Sensitivitas: reliabilitas person (semua / tanpa menyimpang)", `${num(s0.person_reliability)} / ${num(s1.person_reliability)}`, ""));
    }
    if (under > 0) actions.push({ stage: 2, text: `Periksa lembar jawaban ${under} person underfit${tes && pq.n_chance ? ` dan ${pq.n_chance} person dengan skor setara tebakan` : ""} ` +
      "(tabel Person, kolom Kualitas). Keluarkan hanya bila ada alasan substantif (menjawab asal, identitas ganda, kendala teknis); bandingkan hasilnya dengan tabel sensitivitas." });
    tech.push(T(pq.method === "lz*" ? "Person underfit (lz* < -1,645)" : "Person underfit (MNSQ dan ZSTD)", `${under} (${pct(share, 1)})`, pq.method === "lz*" ? `harapan acak ${num(exp, 0)} (5%)` : ""));
    tech.push(T("Person misfit menurut rentang MNSQ (kriteria lama)", `${pq.n_classic} (${pct(pq.pct_classic, 1)})`, "tidak lagi dipakai untuk vonis"));
    if (tes && pq.nOptions) tech.push(T("Skor setara tebakan", String(pq.n_chance), `binomial, peluang 1/${pq.nOptions}`));
    // kunci jawaban
    if (adv.distractors) {
      const bad = adv.distractors.items.filter((x) => x.flag);
      if (bad.length) {
        status = status === ST.RED ? ST.RED : ST.YELLOW; bits.push(`${bad.length} butir dengan dugaan masalah kunci/distraktor`);
        paras.push(`Analisis distraktor menandai ${bad.length} butir: ${bad.slice(0, 6).map((x) => `${x.item} (${x.flags})`).join("; ")}${bad.length > 6 ? ", dan lainnya" : ""}.`);
        actions.push({ stage: 1, text: `Verifikasi kunci jawaban ${names(bad.map((x) => x.item))} sebelum menafsirkan statistik lain; kunci yang keliru merusak fit, reliabilitas, dan dimensionalitas sekaligus.` });
      }
    } else if (adv.belowChance && adv.belowChance.length) {
      bits.push(`${adv.belowChance.length} butir di bawah peluang tebakan`);
      status = status === ST.RED ? ST.RED : ST.YELLOW;
      paras.push(`${adv.belowChance.length} butir memiliki proporsi benar di bawah peluang tebakan (${names(adv.belowChance.map((x) => `${x.item} ${pct(100 * x.p)}`))}). ` +
        "Ini dapat berarti kunci keliru atau distraktor yang sangat menarik. Unggah jawaban mentah beserta baris KUNCI untuk menguji dugaan ini.");
      actions.push({ stage: 1, text: `Periksa kunci ${names(adv.belowChance.map((x) => x.item))}; impor jawaban mentah dengan baris KUNCI agar analisis distraktor dapat dijalankan.` });
    }
    const conf = N >= 150 ? confidence("tinggi", `N = ${N}`) : N >= 50 ? confidence("sedang", `N = ${N}`) : confidence("rendah", `N = ${N}`);
    const sentence = status === ST.GREEN ? `Tidak ada pola data kosong atau respons yang mengkhawatirkan (${pct(share, 1)} person underfit).`
      : `Perlu perhatian: ${bits.join("; ")}${under ? `; ${pct(share, 1)} person underfit` : ""}.`;
    return { light: { key: "data_quality", title: "Data Quality", status, sentence, confidence: conf },
      section: { key: "data_quality", title: "Data Structure and Response Quality", status, paragraphs: paras, actions: actions.map((a) => a.text), technical: tech,
        references: ref("ludlow_1999", "snijders_2001", "meijer_2001"), confidence: conf }, actions };
  }

  // ------------------------------------------------------------------------------------
  // Reliabilitas
  // ------------------------------------------------------------------------------------
  function reliability(res, adv, base) {
    const rt = adv.rt, sec = JSON.parse(JSON.stringify(base.section));
    const N = res.summary.n_persons;
    sec.paragraphs.push(`Dekomposisi: SD measure person teramati ${num(rt.observed_sd)} logit terdiri atas SD sejati ${num(rt.true_sd)} logit dan galat (RMSE) ` +
      `${num(rt.rmse_real)} logit; galat menyumbang ${pct(100 * rt.error_share)} varians teramati. Bila setiap butir yang dijawab tepat berada di lokasi ` +
      `person, RMSE dapat turun menjadi ${num(rt.rmse_min)} dan reliabilitas maksimum yang mungkin dengan butir sebanyak ini adalah ${num(rt.reliability_max)}.` +
      (rt.reliability_max < 0.8 ? " Karena batas atas ini pun rendah, sumber utamanya adalah sebaran kemampuan yang sempit dan jumlah butir yang dijawab, bukan targeting." : ""));
    if (isF(rt.items_for_080)) {
      sec.paragraphs.push(`Proyeksi Spearman-Brown dengan butir bermutu setara: reliabilitas 0,80 memerlukan sekitar ${Math.ceil(rt.items_for_080)} butir yang dijawab ` +
        `dan 0,90 sekitar ${Math.ceil(rt.items_for_090)} butir, dibandingkan rata-rata ${num(rt.mean_answered, 1)} butir yang dijawab saat ini.`);
    }
    if (rt.alpha_selection_warning) {
      sec.paragraphs.push(`Peringatan seleksi: ${res.summary.alpha_label} hanya dihitung dari ${rt.alpha_complete_n} dari ${N} person (${pct(100 * rt.alpha_complete_share)}) ` +
        "yang menjawab semua butir. Person yang menyelesaikan seluruh tes kemungkinan berbeda secara sistematis (misalnya lebih cepat), sehingga angka ini tidak mewakili sampel.");
    }
    sec.technical.push(T("SD teramati / SD sejati / RMSE (REAL)", `${num(rt.observed_sd, 3)} / ${num(rt.true_sd, 3)} / ${num(rt.rmse_real, 3)}`, ""));
    sec.technical.push(T("Reliabilitas maksimum (semua butir tepat sasaran)", num(rt.reliability_max), "RMSE minimum " + num(rt.rmse_min, 3)));
    sec.technical.push(T("Butir untuk reliabilitas 0,80 / 0,90", `${num(rt.items_for_080, 0)} / ${num(rt.items_for_090, 0)}`, "Spearman-Brown, rata-rata butir dijawab " + num(rt.mean_answered, 1)));
    if (rt.alpha_selection_warning) sec.technical.push(T(`${res.summary.alpha_label}: kasus lengkap`, `${rt.alpha_complete_n} dari ${N}`, `< ${pct(100 * A.RULES.KR20_COMPLETE_MIN)}: tidak representatif`));
    sec.references = sec.references.concat(ref("spearman_brown_1910"));
    const conf = N >= 100 && rt.mean_answered >= 10 ? confidence("tinggi", `N = ${N}`) : N >= 30 ? confidence("sedang", `N = ${N}`) : confidence("rendah", `N = ${N}`);
    sec.confidence = conf;
    const light = { ...base.light, confidence: conf };
    if (base.light.status !== ST.GREEN) light.sentence += ` SD sejati ${num(rt.true_sd)} logit; reliabilitas maksimum ${num(rt.reliability_max)}.`;
    const actions = [];
    if (res.summary.person_reliability < TEXT.rules.PERSON_RELIABILITY_GOOD) actions.push({ stage: 5, text: `Untuk mencapai reliabilitas 0,80 diperlukan sekitar ${Math.ceil(rt.items_for_080 || 0)} butir yang dijawab; ` +
      (rt.reliability_max < 0.8 ? "memperbaiki targeting saja tidak cukup, tambahkan butir atau perluas sebaran kemampuan sampel." : "perbaiki targeting dan tambahkan butir di sekitar lokasi sebagian besar person.") });
    sec.actions = actions.map((a) => a.text);
    return { light, section: sec, actions };
  }

  // ------------------------------------------------------------------------------------
  // Item fit
  // ------------------------------------------------------------------------------------
  function itemFit(res, adv) {
    const tes = adv.opts.testType === "tes";
    const fl = adv.flags.rows.filter((r) => r.status !== "extreme");
    const serious = fl.filter((r) => r.status === "serius"), review = fl.filter((r) => r.status === "telaah");
    const over = fl.filter((r) => r.status === "overfit"), note = fl.filter((r) => r.status === "catatan");
    const [lo, hi] = res.settings.mnsq_range;
    let status, sentence;
    if (serious.length) { status = ST.RED; sentence = `${serious.length} item misfit serius: ${names(serious.map((r) => r.item))}` + (review.length ? `; ${review.length} item lain perlu ditelaah.` : "."); }
    else if (review.length) { status = ST.YELLOW; sentence = `${review.length} item perlu ditelaah: ${names(review.map((r) => r.item))}.`; }
    else { status = ST.GREEN; sentence = `Semua ${fl.length} item berperilaku sesuai harapan model menurut gabungan MNSQ, ZSTD, dan PTMEA.`; }
    const paras = [
      "Penandaan item menggabungkan tiga bukti. Pertama, MNSQ menyatakan besarnya kejutan; kedua, ZSTD menyatakan apakah kejutan itu " +
      "bermakna secara statistik; ketiga, selisih point-measure correlation (PTMEA) teramati terhadap harapan model menyatakan apakah item " +
      "membedakan person sebaik yang seharusnya. Item ditandai perlu ditelaah bila MNSQ di atas rentang dan ZSTD > 2, bila ZSTD > 2 disertai " +
      `PTMEA ${num(A.RULES.PTMEA_GAP_WITH_ZSTD)} di bawah harapan, atau bila PTMEA ${num(A.RULES.PTMEA_GAP_ALONE)} di bawah harapan dan selisihnya ` +
      `bermakna (uji z Fisher). Item serius bila MNSQ > ${num(TEXT.rules.MNSQ_DEGRADING, 1)} dengan ZSTD > 2 atau PTMEA negatif yang bermakna.`,
    ];
    const desc = (r) => `${r.item} (infit ${num(r.infit_mnsq)}, ZSTD ${num(r.infit_zstd, 1)}; outfit ${num(r.outfit_mnsq)}, ZSTD ${num(r.outfit_zstd, 1)}; PTMEA ${num(r.ptmea_obs)} vs ${num(r.ptmea_exp)})`;
    if (serious.length) paras.push(`Item serius: ${serious.slice(0, 8).map(desc).join("; ")}.`);
    if (review.length) paras.push(`Item yang perlu ditelaah: ${review.slice(0, 10).map(desc).join("; ")}${review.length > 10 ? ", dan lainnya" : ""}.`);
    if (note.length) paras.push(`${note.length} item hanya memenuhi satu kriteria (misalnya MNSQ sedikit di luar ${num(lo, 1)}-${num(hi, 1)} tanpa ZSTD bermakna): ${names(note.map((r) => r.item))}. ` +
      "Item ini dicatat tetapi tidak ditandai, karena simpangan sebesar itu wajar terjadi secara kebetulan.");
    if (over.length) paras.push(`Item overfit (${names(over.map((r) => r.item))}) terlalu mudah ditebak polanya; kondisi ini tidak merusak pengukuran.`);
    const g = adv.guess;
    if (g && isF(g.rho_outfit_measure)) {
      if (tes && g.pattern) {
        paras.push(`Outfit berkorelasi ${num(g.rho_outfit_measure)} (Spearman, p ${g.p_rho < 0.001 ? "< 0,001" : "= " + num(g.p_rho, 3)}) dengan kesulitan item: makin sulit item, makin besar outfit-nya. ` +
          "Pola ini adalah petunjuk tebakan, bukan kerusakan isi butir: person berkemampuan rendah sesekali menjawab benar butir sulit. " +
          (isF(g.unexpected_success) ? `Pada sel dengan peluang benar menurut model di bawah 20%, teramati ${g.unexpected_success} jawaban benar, dibandingkan harapan ${num(g.expected_success_low, 0)} (z = ${num(g.z_success_low)}).` : ""));
      } else if (!tes && g.pattern) {
        paras.push(`Outfit berkorelasi ${num(g.rho_outfit_measure)} dengan item measure: item yang paling jarang disetujui paling banyak memuat respons tak terduga. ` +
          "Pada angket, pola ini sering berasal dari gaya respons (misalnya kecenderungan memilih kategori ekstrem atau acquiescence), bukan dari isi butir.");
      }
    }
    const t = adv.tailored;
    if (t && t.rows) {
      const f = t.rows.filter((r) => r.flag_guessing);
      paras.push(`Tailored analysis (Andrich, Marais & Humphry, 2012) membuang ${pct(t.pct_removed, 1)} respons dengan peluang benar < ${num(t.cutoff)} lalu mengestimasi ulang; ` +
        `skala disejajarkan pada ${t.anchor_items.length} butir termudah. ` + (f.length ? `${f.length} butir menjadi lebih sulit secara bermakna (>= ${num(A.RULES.TAILOR_MIN_DIFF)} logit, z > 1,96): ${names(f.map((r) => `${r.item} +${num(r.difference)}`))}. ` +
          "Kesulitan butir-butir ini pada analisis utama kemungkinan diremehkan karena tebakan." : "Tidak ada butir yang kesulitannya berubah bermakna; tebakan tidak tampak mendistorsi kalibrasi."));
    }
    const actions = [];
    const why = tes ? "kunci, distraktor, dan redaksinya" : "redaksi, arah skor (reverse-coded), dan kecocokan isinya dengan konstruk";
    if (serious.length) actions.push({ stage: 3, text: `Telaah ${names(serious.map((r) => r.item))} lebih dulu (${why}); bila tidak ada perbaikan yang masuk akal, keluarkan lalu jalankan ulang.` });
    if (review.length) actions.push({ stage: 3, text: `Telaah ${names(review.map((r) => r.item))}; ` + (tes ? "item dengan PTMEA jauh di bawah harapan biasanya memiliki distraktor yang menarik person berkemampuan tinggi." : "periksa apakah item bermakna ganda atau mengukur aspek lain.") });
    if (tes && g && g.pattern) actions.push({ stage: 3, text: "Karena misfit mengikuti kesulitan, laporkan juga hasil tailored analysis sebagai pembanding, dan pertimbangkan koreksi penskoran untuk tebakan pada butir sulit." });
    const tech = [
      T("Item serius / perlu ditelaah / catatan / overfit", `${serious.length} / ${review.length} / ${note.length} / ${over.length}`, ""),
      T("Item misfit menurut kriteria lama (MNSQ atau PTMEA < 0)", String(adv.flags.classic.length), names(adv.flags.classic) || "-"),
      T("Korelasi Spearman outfit MNSQ dengan item measure", num(g ? g.rho_outfit_measure : NaN), `pola tebakan bila >= ${num(A.RULES.GUESS_RHO)} dan p < 0,05`),
    ];
    if (adv.sim && isF(adv.sim.flagged_rate)) tech.push(T("Laju penandaan pada data simulasi patuh model", pct(100 * adv.sim.flagged_rate, 1), "perkiraan tanda palsu per item"));
    if (t && t.rows) tech.push(T("Tailored analysis: respons dibuang / butir terdampak", `${t.removed} / ${t.n_flagged}`, `c = ${num(t.cutoff)}`));
    const N = res.summary.n_persons, minCount = Math.min(...res.items.filter((x) => !x.extreme).map((x) => x.count));
    const conf = minCount >= 100 ? confidence("tinggi", `setiap item dijawab >= ${minCount} person`) : minCount >= 30 ? confidence("sedang", `item paling sedikit dijawab ${minCount} person`) : confidence("rendah", `item paling sedikit dijawab ${minCount} person`);
    void N;
    return { light: { key: "item_fit", title: "Item Fit", status, sentence, confidence: conf },
      section: { key: "item_fit", title: "Item Fit", status, paragraphs: paras, actions: actions.map((a) => a.text), technical: tech,
        references: ref("linacre_2002_mnsq", "wright_masters_1982", "amh_2012"), confidence: conf }, actions };
  }

  // ------------------------------------------------------------------------------------
  // Dimensionalitas
  // ------------------------------------------------------------------------------------
  function dimensionality(res, adv) {
    const d = res.dimensionality, eig = d.first_contrast_eigenvalue, sim = adv.sim, de = adv.dim, r = TEXT.rules;
    const limit = sim && isF(sim.eig_p95) ? sim.eig_p95 : r.CONTRAST_EIGENVALUE_MAX;
    const fromSim = !!(sim && isF(sim.eig_p95));
    const cl = de.clusters, bp = de.blockPairs || [];
    const minDis = Math.min(...[cl && cl.r_disattenuated, ...bp.map((x) => x.r_disattenuated)].filter(isF));
    const smithHit = [cl, ...bp].filter((x) => x && x.smith_ci_low > A.RULES.SMITH_PCT);
    let status, sentence;
    const pairs = de.q3_pairs;
    if (eig > limit && isF(minDis) && minDis < A.RULES.DISATTENUATED_HALF) {
      status = ST.RED;
      sentence = `Ada dimensi kedua yang nyata: first contrast eigenvalue ${num(eig)} melampaui batas acak ${num(limit)}` + (fromSim ? " (simulasi)" : "") +
        `, dan disattenuated correlation antar-gugus item serendah ${num(minDis)}.`;
    } else if (eig > limit || pairs.length) {
      status = ST.YELLOW;
      const p = []; if (eig > limit) p.push(`eigenvalue ${num(eig)} > batas acak ${num(limit)}`); if (pairs.length) p.push(`${pairs.length} pasangan Q3 melampaui batas`);
      sentence = `Unidimensionality perlu diperiksa (${p.join("; ")}).`;
    } else {
      status = ST.GREEN;
      sentence = `Data mendukung unidimensionality: eigenvalue ${num(eig)} berada dalam rentang acak (batas ${num(limit)}) dan tidak ada local dependence berarti.`;
    }
    const paras = [
      "Ambang eigenvalue tetap (misalnya 2,0) tidak memperhitungkan jumlah butir, jumlah person, dan pola data kosong. " +
      (fromSim ? `Karena itu batas ditentukan dari ${sim.reps} set data simulasi yang patuh model Rasch dengan parameter, ukuran, dan pola kosong yang sama dengan data Anda: ` +
        `eigenvalue acak rata-rata ${num(sim.eig_mean)}, persentil ke-95 ${num(sim.eig_p95)}, persentil ke-99 ${num(sim.eig_p99)}. Eigenvalue teramati ${num(eig)}.`
        : `Simulasi tidak dijalankan, sehingga dipakai batas tetap ${num(limit, 1)}; tafsirkan dengan hati-hati.`),
    ];
    if (de.blockRows && de.blockRows.length) {
      const pos = de.blockRows.filter((b) => b.mean_loading > 0.15), neg = de.blockRows.filter((b) => b.mean_loading < -0.15);
      paras.push(`Rata-rata loading first contrast per blok: ${de.blockRows.map((b) => `${b.block} ${num(b.mean_loading)}`).join(", ")}.` +
        (pos.length && neg.length ? ` Kontras ini memisahkan ${names(pos.map((b) => b.block))} dari ${names(neg.map((b) => b.block))}, sehingga dimensi kedua kemungkinan bersumber dari perbedaan isi antar-blok.` : ""));
    }
    if (cl) paras.push(`Measure person dari sepertiga item berloading tertinggi dan terendah berkorelasi ${num(cl.r_observed)}; setelah dikoreksi galat ukur ` +
      `(disattenuated) ${num(cl.r_disattenuated)}. Uji t Smith: ${pct(cl.smith_pct, 1)} person (IK 95% ${pct(cl.smith_ci_low, 1)}-${pct(cl.smith_ci_high, 1)}) memiliki measure yang berbeda bermakna antar-gugus.`);
    if (bp.length) paras.push(`Antar-blok, disattenuated correlation berkisar ${num(Math.min(...bp.map((x) => x.r_disattenuated)))}-${num(Math.max(...bp.map((x) => x.r_disattenuated)))} ` +
      `dan uji t Smith ${pct(Math.min(...bp.map((x) => x.smith_pct)), 1)}-${pct(Math.max(...bp.map((x) => x.smith_pct)), 1)}. ` +
      (minDis < A.RULES.DISATTENUATED_HALF ? "Korelasi di bawah 0,71 berarti blok-blok berbagi kurang dari separuh varians sejati; skor total mencampur kemampuan yang berbeda." :
        minDis < A.RULES.DISATTENUATED_SAME ? "Blok-blok berkaitan erat tetapi tidak identik." : "Blok-blok mengukur hal yang praktis sama."));
    paras.push(`Local dependence diperiksa dengan Q3 relatif (Q3 - rata-rata Q3) terhadap batas ${num(de.q3_relative_cutoff, 3)}` + (de.q3_source === "simulasi" ? " dari bootstrap parametrik (Christensen dkk., 2017)" : "") +
      `. ${pairs.length ? `${pairs.length} pasangan melampaui batas` + (de.testlets.length ? `, membentuk ${de.testlets.length} kandidat testlet: ${de.testlets.map((g) => "{" + g.join(", ") + "}").join("; ")}.` : ".") : "Tidak ada pasangan yang melampaui batas."}`);
    const actions = [];
    if (status !== ST.GREEN && eig > limit) actions.push({ stage: 4, text: (adv.blocks.detected ? "Kalibrasi setiap blok secara terpisah (tombol 'Kalibrasi per blok' di tab Dimensionality) dan laporkan skor per blok; " : "Telaah isi item berloading positif dan negatif; ") +
      (isF(minDis) && minDis < A.RULES.DISATTENUATED_HALF ? "jangan menjumlahkan semua butir menjadi satu skor." : "skor total masih dapat dipakai bila tujuan penggunaannya membenarkan.") });
    if (de.testlets.length) actions.push({ stage: 4, text: `Pertimbangkan menggabungkan kandidat testlet (${de.testlets.map((g) => g.join("+")).join("; ")}) menjadi item politomus, lalu bandingkan reliabilitasnya.` });
    const tech = [
      T("First contrast eigenvalue", num(eig), fromSim ? `batas acak P95 = ${num(sim.eig_p95)} (simulasi, ${sim.reps} replikasi)` : `batas tetap ${num(limit, 1)}`),
      T("Raw variance explained by measures", pct(d.variance_explained_pct, 1), ""),
    ];
    if (cl) tech.push(T("Disattenuated correlation (klaster 1 vs 3)", num(cl.r_disattenuated), `< ${num(A.RULES.DISATTENUATED_HALF)} beda dimensi; > ${num(A.RULES.DISATTENUATED_SAME)} sama`));
    if (cl) tech.push(T("Uji t Smith (klaster 1 vs 3)", `${pct(cl.smith_pct, 1)} (IK ${pct(cl.smith_ci_low, 1)}-${pct(cl.smith_ci_high, 1)})`, `> ${A.RULES.SMITH_PCT}% multidimensional`));
    tech.push(T("Batas Q3 relatif", num(de.q3_relative_cutoff, 3), de.q3_source === "simulasi" ? "P95 bootstrap parametrik" : "tetap"));
    tech.push(T("Pasangan Q3 di atas batas / kandidat testlet", `${pairs.length} / ${de.testlets.length}`, ""));
    tech.push(T("Vonis dengan ambang lama (2,0 / 3,0)", eig >= r.CONTRAST_EIGENVALUE_RED ? "merah" : eig >= r.CONTRAST_EIGENVALUE_MAX ? "kuning" : "hijau", "untuk audit"));
    void smithHit;
    const N = res.summary.n_persons;
    const conf = fromSim && N >= 200 ? confidence("tinggi", "ambang simulasi, N >= 200") : fromSim ? confidence("sedang", `ambang simulasi, N = ${N}`) : confidence("rendah", "ambang tetap tanpa simulasi");
    return { light: { key: "dimensionality", title: "Dimensionality", status, sentence, confidence: conf },
      section: { key: "dimensionality", title: "Dimensionality and Local Dependence", status, paragraphs: paras, actions: actions.map((a) => a.text), technical: tech,
        references: ref("linacre_winsteps_manual", "raiche_2005", "smith_2002", "christensen_2017", "yen_1984"), confidence: conf }, actions };
  }

  // ------------------------------------------------------------------------------------
  // Targeting
  // ------------------------------------------------------------------------------------
  function targeting(res, adv, base) {
    const rt = adv.rt, R = A.RULES, tes = adv.opts.testType === "tes";
    const med = rt.info_eff_median, p25 = rt.info_eff_p25;
    const status = med >= R.INFO_EFF_GOOD_MEDIAN && p25 >= R.INFO_EFF_GOOD_P25 ? ST.GREEN : med < R.INFO_EFF_POOR_MEDIAN ? ST.RED : ST.YELLOW;
    const diff = res.summary.targeting;
    const iSd = res.summary.item.sd, pSd = res.summary.person.sd;
    const spread = Math.abs(diff) < 0.5 && iSd > 1.5 * pSd;
    const why = spread ? `butir tersebar jauh lebih lebar (SD item ${num(iSd)} logit) daripada person (SD ${num(pSd)} logit), sehingga banyak butir berada jauh dari sebagian besar person.`
      : diff > 0 ? (tes ? "butir relatif mudah." : "butir relatif ringan untuk disetujui.") : (tes ? "butir relatif sulit." : "butir relatif berat untuk disetujui.");
    const sentence = status === ST.GREEN ? `Butir memberi informasi yang efisien pada lokasi sebagian besar person (efisiensi median ${pct(100 * med)}).`
      : `Efisiensi informasi pada lokasi person median ${pct(100 * med)} (kuartil bawah ${pct(100 * p25)}); ${why}`;
    const sec = JSON.parse(JSON.stringify(base.section));
    sec.status = status;
    sec.paragraphs.splice(2, 0, `Selisih rata-rata measure dapat menyembunyikan ketimpangan sebaran: butir bisa rata-rata 'pas' tetapi menumpuk di satu sisi. ` +
      `Karena itu targeting dinilai dari efisiensi informasi: untuk setiap person, informasi yang diberikan butir-butir yang dijawabnya pada measure person itu ` +
      `dibandingkan dengan informasi maksimum bila setiap butir tepat sasaran. Median efisiensi ${pct(100 * med)}, kuartil ${pct(100 * p25)}-${pct(100 * rt.info_eff_p75)}, ` +
      `dan ${pct(rt.info_eff_below_half, 1)} person mendapat kurang dari separuh informasi maksimum.` + (spread ? ` Rata-rata person dan butir hampir berimpit, tetapi ${why}` : ""));
    sec.technical.unshift(T("Efisiensi informasi (median / P25 / P75)", `${pct(100 * med, 1)} / ${pct(100 * p25, 1)} / ${pct(100 * rt.info_eff_p75, 1)}`,
      `hijau: median >= ${pct(100 * R.INFO_EFF_GOOD_MEDIAN)} dan P25 >= ${pct(100 * R.INFO_EFF_GOOD_P25)}; merah: median < ${pct(100 * R.INFO_EFF_POOR_MEDIAN)}`));
    sec.technical.push(T("Vonis dengan kriteria lama (selisih rata-rata)", TEXT.lightStatus[base.light.status], "untuk audit"));
    const N = res.summary.n_persons;
    const conf = N >= 100 ? confidence("tinggi", `N = ${N}`) : confidence("sedang", `N = ${N}`);
    sec.confidence = conf;
    const q1 = res.summary.person_mean - pSd, q3 = res.summary.person_mean + pSd;
    const actions = status === ST.GREEN ? [] : [{ stage: 5, text: (spread ? "Ganti atau tambah butir sehingga kesulitannya berkumpul" : diff > 0 ? "Tambahkan butir yang lebih sulit" : "Tambahkan butir yang lebih mudah") +
      ` di rentang ${num(q1)} sampai ${num(q3)} logit, tempat sebagian besar person berada.` }];
    sec.actions = actions.map((a) => a.text);
    return { light: { key: "targeting", title: "Targeting", status, sentence, confidence: conf }, section: sec, actions };
  }

  // ------------------------------------------------------------------------------------
  // DIF
  // ------------------------------------------------------------------------------------
  function dif(res, adv, base) {
    const dx = adv.dif;
    if (!dx || !dx.levels || dx.levels.length < 2) return { light: { ...base.light, confidence: null }, section: base.section, actions: [] };
    const R = A.RULES, RR = TEXT.rules;
    const rows = dx.table || dx.vs_rest;
    const flagged = dx.table ? dx.table.filter((r) => r.flag) : dx.omnibus.filter((r) => r.flag);
    const big = dx.table ? flagged.filter((r) => Math.abs(r.contrast) >= RR.DIF_ETS_C) : flagged.filter((r) => r.range >= RR.DIF_ETS_C);
    let status, sentence;
    const detect = dx.share_detectable >= R.DIF_DETECT_SHARE;
    if (big.length) { status = ST.RED; sentence = `${big.length} item menunjukkan DIF besar: ${names(big.map((r) => r.item))}.`; }
    else if (flagged.length) { status = ST.YELLOW; sentence = `${flagged.length} item menunjukkan DIF yang perlu ditelaah: ${names(flagged.map((r) => r.item))}.`; }
    else if (dx.table && dx.table.some((r) => (r.mh_ets === "C" && r.mh_q < R.DIF_Q) || (r.lr_class === "C" && r.lr_q < R.DIF_Q))) {
      const tri = dx.table.filter((r) => (r.mh_ets === "C" && r.mh_q < R.DIF_Q) || (r.lr_class === "C" && r.lr_q < R.DIF_Q));
      status = ST.YELLOW; sentence = `Uji Rasch tidak menandai item, tetapi Mantel-Haenszel atau regresi logistik menemukan DIF besar pada ${names(tri.map((r) => r.item))}; telaah item tersebut.`;
      flagged.push(...tri);
    }
    else if (detect) { status = ST.GREEN; sentence = `Tidak ada DIF bermakna, dan ukuran kelompok cukup untuk mendeteksi DIF besar (MDC median ${num(dx.mdc_median)} logit).`; }
    else { status = ST.TENTATIVE; sentence = `Belum dapat ditentukan: tidak ada item yang ditandai, tetapi DIF terkecil yang dapat dideteksi (MDC median ${num(dx.mdc_median)} logit) lebih besar daripada DIF besar (${num(R.DIF_DETECT_TARGET)} logit).`; }
    const sizes = dx.levels.map((g, k) => `${g} ${dx.sizes[k]}`).join(", ");
    const paras = [
      `Kelompok: ${sizes}. Item measure dihitung terpisah untuk tiap kelompok dengan measure person dijangkarkan` + (dx.purification_iterations > 1 ? `; measure person dimurnikan (purifikasi) dari item yang ber-DIF dalam ${dx.purification_iterations} iterasi` : "") + ". " +
      `Sebuah item ditandai bila DIF contrast >= ${num(RR.DIF_CONTRAST_MIN, 1)} logit dan q Benjamini-Hochberg < ${num(R.DIF_Q)}, yaitu setelah koreksi untuk ${rows.length / (dx.table ? 1 : dx.n_groups)} uji sekaligus.`,
      `Daya deteksi: dengan ukuran kelompok ini, DIF contrast terkecil yang dapat dideteksi dengan daya 80% (minimum detectable contrast) bermedian ${num(dx.mdc_median)} logit; ` +
      `hanya ${pct(100 * dx.share_detectable)} item yang mampu mendeteksi DIF besar (${num(R.DIF_DETECT_TARGET)} logit).` +
      (isF(dx.n_factor_needed) && dx.n_factor_needed > 1 ? ` Untuk itu ukuran setiap kelompok perlu kira-kira ${num(dx.n_factor_needed, 1)} kali lebih besar.` : ""),
    ];
    if (dx.table && dx.dichotomous) {
      const mh = dx.table.filter((r) => r.mh_ets === "C" || r.mh_ets === "B"), lr = dx.table.filter((r) => r.lr_class && r.lr_class !== "A");
      const nonu = dx.table.filter((r) => r.lr_nonuniform_p < 0.05 && r.lr_q < R.DIF_Q);
      paras.push(`Pembanding: Mantel-Haenszel (${dx.mh_strata} strata measure) menggolongkan ${mh.length} item ke kategori ETS B/C${mh.length ? ` (${names(mh.map((r) => `${r.item} ${r.mh_ets}`))})` : ""}; ` +
        `regresi logistik (Swaminathan & Rogers, 1990) menandai ${lr.length} item dengan efek bermakna menurut delta R2 Nagelkerke` +
        (nonu.length ? `, termasuk DIF non-uniform pada ${names(nonu.map((r) => r.item))}` : "") + ".");
    }
    if (dx.dtf) paras.push(`Dampak kumulatif tingkat tes: dengan parameter item masing-masing kelompok, skor harapan berbeda rata-rata ${num(dx.dtf.mean_diff)} poin ` +
      `dari maksimum ${dx.dtf.max_score} (setara ${num(dx.dtf.logit_equivalent, 3)} logit pada measure rata-rata), ` + (Math.abs(dx.dtf.mean_diff) < 0.01 * dx.dtf.max_score ? "dapat diabaikan untuk skor total." : `menguntungkan kelompok ${dx.dtf.favoured}.`));
    if (dx.omnibus) paras.push(`Dengan ${dx.n_groups} kelompok, setiap kelompok dibandingkan dengan gabungan kelompok lainnya, dan uji omnibus chi-square menguji apakah item measure sama di semua kelompok.`);
    const actions = [];
    if (flagged.length) actions.push({ stage: 6, text: `Minta panel ahli menelaah isi ${names(flagged.map((r) => r.item))}; DIF adalah tanda untuk ditelaah, bukan bukti bias.` });
    if (status === ST.TENTATIVE) actions.push({ stage: 6, text: "Laporkan DIF sebagai 'belum dapat ditentukan' dan kumpulkan data kelompok yang lebih seimbang sebelum menyimpulkan keadilan butir." });
    const tech = [
      T("Ukuran kelompok", sizes, ""), T("MDC median (daya 80%, alfa 0,05)", `${num(dx.mdc_median)} logit`, `hijau hanya bila >= ${pct(100 * R.DIF_DETECT_SHARE)} item mampu mendeteksi ${num(R.DIF_DETECT_TARGET)} logit`),
      T("Item ditandai (contrast & q BH)", String(flagged.length), `|contrast| >= ${num(RR.DIF_CONTRAST_MIN, 1)} dan q < ${num(R.DIF_Q)}`),
      T("Vonis kriteria lama (Draba)", base.light.status ? TEXT.lightStatus[base.light.status] : "-", "untuk audit"),
    ];
    if (dx.dtf) tech.push(T("DTF: selisih skor harapan rata-rata", `${num(dx.dtf.mean_diff)} (maks. ${num(dx.dtf.max_abs_diff)})`, `dari ${dx.dtf.max_score}`));
    const minN = Math.min(...dx.sizes);
    const conf = detect ? confidence("tinggi", "daya cukup untuk DIF besar") : minN >= 100 ? confidence("sedang", `kelompok terkecil n = ${minN}`) : confidence("rendah", `kelompok terkecil n = ${minN}`);
    return { light: { key: "dif", title: "DIF", status, sentence, confidence: conf },
      section: { key: "dif", title: "Differential Item Functioning (DIF)", status, paragraphs: base.section.paragraphs.slice(0, 1).concat(paras), actions: actions.map((a) => a.text), technical: tech,
        references: ref("draba_1977", "holland_1988", "mantel_1959", "rbg_1986", "swaminathan_1990", "jodoin_2001", "bh_1995"), confidence: conf }, actions };
  }

  // ------------------------------------------------------------------------------------
  // Validasi estimasi
  // ------------------------------------------------------------------------------------
  function validation(res, adv) {
    const cm = adv.cmle, sim = adv.sim;
    if ((!cm || cm.error) && !sim) {
      return { light: { key: "validation", title: "Estimation Check", status: ST.GRAY, sentence: "Pembanding CMLE dan simulasi tidak dijalankan.", confidence: null },
        section: { key: "validation", title: "Estimation Check", status: ST.GRAY, paragraphs: ["Aktifkan pembanding CMLE dan simulasi di langkah Model untuk memeriksa estimasi JMLE."], actions: [], technical: [], references: [] }, actions: [] };
    }
    const paras = [], tech = [];
    let status = ST.GREEN;
    if (cm && !cm.error) {
      paras.push(`Estimasi item JMLE (dengan koreksi bias ${num(res.jmle.biasFactor, 4)}) dibandingkan dengan CMLE, yang tidak bergantung pada estimasi person: ` +
        `korelasi ${num(cm.r, 4)}, RMSD ${num(cm.rmsd, 3)} logit, selisih terbesar ${num(cm.max_abs_difference, 3)} logit, kemiringan JMLE terhadap CMLE ${num(cm.slope_jmle_on_cmle, 3)} ` +
        `(tanpa koreksi bias ${num(cm.slope_uncorrected_on_cmle, 3)}). ` + (cm.rmsd < 0.1 ? "Kedua estimator praktis sepakat; koreksi bias JMLE memadai pada data ini." : "Selisihnya tidak kecil; laporkan CMLE sebagai pembanding untuk butir dengan selisih terbesar."));
      if (!cm.converged) status = ST.YELLOW;
      if (cm.rmsd >= 0.1 || cm.r < 0.99) status = ST.YELLOW;
      tech.push(T("JMLE vs CMLE: r / RMSD / maks.", `${num(cm.r, 4)} / ${num(cm.rmsd, 3)} / ${num(cm.max_abs_difference, 3)}`, "hijau bila RMSD < 0,10 dan r >= 0,99"));
      tech.push(T("CMLE: person dipakai / iterasi / konvergen", `${cm.n_persons_used} / ${cm.iterations} / ${cm.converged ? "ya" : "tidak"}`, ""));
    }
    if (sim && sim.reps) {
      paras.push(`Studi pemulihan parameter pada ${sim.reps} data simulasi dengan desain yang sama (benih acak ${sim.seed}): rata-rata bias mutlak item measure ${num(sim.recovery_bias, 3)} logit ` +
        `(tanpa koreksi bias ${num(sim.recovery_bias_uncorrected, 3)}), RMSE ${num(sim.recovery_rmse, 3)} logit, dan cakupan interval 95% ${pct(100 * sim.recovery_coverage, 1)}.` +
        (sim.recovery_coverage < 0.9 ? " Cakupan di bawah 90% berarti SE model cenderung terlalu kecil untuk desain ini." : ""));
      if (sim.recovery_coverage < 0.9) status = ST.YELLOW;
      tech.push(T("Pemulihan: |bias| / RMSE / cakupan IK 95%", `${num(sim.recovery_bias, 3)} / ${num(sim.recovery_rmse, 3)} / ${pct(100 * sim.recovery_coverage, 1)}`, "cakupan >= 90%"));
    }
    const sentence = status === ST.GREEN ? "JMLE sepakat dengan CMLE dan parameter pulih dengan baik dalam simulasi." : "Ada selisih estimator atau cakupan interval yang perlu dicermati.";
    const conf = sim && sim.reps >= 30 ? confidence("tinggi", `${sim.reps} replikasi`) : confidence("sedang", "replikasi sedikit atau hanya CMLE");
    return { light: { key: "validation", title: "Estimation Check", status, sentence, confidence: conf },
      section: { key: "validation", title: "Estimation Check (CMLE and Parameter Recovery)", status, paragraphs: paras, actions: [], technical: tech, references: ref("andersen_1970", "wright_masters_1982"), confidence: conf }, actions: [] };
  }

  // ------------------------------------------------------------------------------------
  // Sintesis lintas indikator
  // ------------------------------------------------------------------------------------
  function synthesis(res, adv, parts) {
    const s = res.summary, rt = adv.rt, pq = adv.pq, ms = adv.ms, tes = adv.opts.testType === "tes";
    const out = [];
    const relGood = s.person_reliability >= TEXT.rules.PERSON_RELIABILITY_GOOD;
    // 1. presisi
    if (!relGood) {
      const causes = [];
      if (rt.true_sd < 1) causes.push(`varians kemampuan sejati sempit (SD sejati ${num(rt.true_sd)} logit)`);
      const L = s.n_items_estimated;
      if (rt.mean_answered < 0.85 * L) causes.push(`rata-rata hanya ${num(rt.mean_answered, 1)} dari ${L} butir dijawab`);
      if (rt.info_eff_median < A.RULES.INFO_EFF_GOOD_MEDIAN) causes.push(`butir rata-rata hanya memberi ${pct(100 * rt.info_eff_median)} informasi maksimum pada lokasi person`);
      out.push({ text: `Person reliability ${num(s.person_reliability)} belum mencapai ${num(TEXT.rules.PERSON_RELIABILITY_GOOD)} terutama karena ${causes.length ? names(causes, 10, "sebab") : "galat ukur relatif besar"}. ` +
        (rt.reliability_max < TEXT.rules.PERSON_RELIABILITY_GOOD ? `Bahkan dengan targeting sempurna reliabilitas hanya mencapai ${num(rt.reliability_max)}, sehingga memperbaiki targeting saja tidak menyelesaikan masalah.` :
          `Dengan targeting sempurna reliabilitas dapat mencapai ${num(rt.reliability_max)}.`), confidence: parts.reliability.light.confidence });
    }
    // 2. respons menyimpang dan efeknya
    if (adv.sens && adv.sens[1] && !adv.sens[1].skipped && !adv.sens[1].error) {
      const s0 = adv.sens[0], s1 = adv.sens[1];
      const effects = [];
      if (s1.eigenvalue < s0.eigenvalue - 0.5) effects.push(`eigenvalue kontras pertama turun dari ${num(s0.eigenvalue)} ke ${num(s1.eigenvalue)}`);
      if (Math.abs(s1.person_reliability - s0.person_reliability) >= 0.03) effects.push(`reliabilitas berubah dari ${num(s0.person_reliability)} ke ${num(s1.person_reliability)}`);
      if (s1.n_items_flagged < s0.n_items_flagged) effects.push(`item yang ditandai berkurang dari ${s0.n_items_flagged} ke ${s1.n_items_flagged}`);
      out.push({ text: `${pct(pq.pct_underfit, 1)} person menjawab dengan pola menyimpang (harapan acak sekitar 5%). ` +
        (effects.length ? `Tanpa mereka, ${effects.join(", ")}; sebagian masalah pada indikator lain berasal dari responden ini, bukan dari butir.` : "Mengeluarkan mereka hampir tidak mengubah hasil; kesimpulan tidak bergantung pada mereka."),
        confidence: parts.data.light.confidence });
    }
    // 3. tebakan
    if (tes && adv.guess && adv.guess.pattern) {
      const nT = adv.tailored && adv.tailored.rows ? adv.tailored.n_flagged : null;
      out.push({ text: `Misfit mengikuti kesulitan butir (korelasi outfit-measure ${num(adv.guess.rho_outfit_measure)}): pola ini lebih konsisten dengan tebakan pada butir sulit daripada dengan butir yang rusak.` +
        (nT !== null ? ` Tailored analysis mengonfirmasi ${nT} butir yang kesulitannya diremehkan karena tebakan.` : ""), confidence: parts.fit.light.confidence });
    }
    // 4. speededness
    if (ms && ms.speeded) {
      out.push({ text: `Tes bersifat speeded: ${pct(ms.pctNotReached, 1)} sel tidak sempat dikerjakan. ` + (pq.r_answered_pcorrect < -0.3 ? "Person yang mengerjakan lebih banyak butir justru lebih jarang benar, tanda sebagian kecepatan dibayar dengan tebakan. " : "") +
        (adv.treatment === "asis" ? "Hasil saat ini memperlakukan butir yang tidak sempat dikerjakan sebagai missing; pertimbangkan perlakuan Ludlow dan O'Leary untuk penskoran akhir." : ""), confidence: parts.data.light.confidence });
    }
    // 5. dimensionalitas
    const dimL = parts.dim.light;
    if (dimL.status !== ST.GREEN) {
      const bp = adv.dim.blockPairs || [];
      out.push({ text: dimL.sentence + (bp.length ? ` Blok-blok soal berkorelasi sejati ${num(Math.min(...bp.map((x) => x.r_disattenuated)))}-${num(Math.max(...bp.map((x) => x.r_disattenuated)))}, sehingga ${Math.min(...bp.map((x) => x.r_disattenuated)) < A.RULES.DISATTENUATED_HALF ? "skor per blok lebih dapat dipertanggungjawabkan daripada skor total." : "skor total masih dapat dibela."}` : ""),
        confidence: dimL.confidence });
    }
    // 6. DIF
    if (parts.dif.light.status === ST.TENTATIVE) out.push({ text: parts.dif.light.sentence, confidence: parts.dif.light.confidence });
    if (!out.length) out.push({ text: "Indikator-indikator saling konsisten dan tidak menunjukkan masalah yang saling memperkuat.", confidence: confidence("sedang", "ringkasan") });
    return out;
  }

  const STAGES = { 1: "Kunci dan data", 2: "Responden", 3: "Butir", 4: "Struktur", 5: "Presisi", 6: "Keadilan" };

  function interpretAll(res, adv) {
    const base = I.interpret(res);
    const sec = (key) => base.sections.find((x) => x.key === key), lit = (key) => base.lights.find((x) => x.key === key);
    const parts = {
      data: dataQuality(res, adv),
      reliability: reliability(res, adv, { light: lit("reliability"), section: sec("reliability") }),
      fit: itemFit(res, adv),
      dim: dimensionality(res, adv),
      targeting: targeting(res, adv, { light: lit("targeting"), section: sec("targeting") }),
      categories: { light: { ...lit("categories"), confidence: null }, section: sec("categories"), actions: [] },
      dif: dif(res, adv, { light: lit("dif"), section: sec("dif") }),
      validation: validation(res, adv),
    };
    const order = ["data", "reliability", "fit", "dim", "targeting", "categories", "dif", "validation"];
    const actions = order.flatMap((k) => parts[k].actions || []).sort((a, b) => a.stage - b.stage)
      .map((a, k, arr) => ({ ...a, label: STAGES[a.stage], dependsOn: arr.filter((x) => x.stage < a.stage).length ? STAGES[Math.max(...arr.filter((x) => x.stage < a.stage).map((x) => x.stage))] : null }));
    return {
      model: res.model, modelName: base.modelName, testType: adv.opts.testType,
      lights: order.map((k) => parts[k].light), intro: base.intro, sections: order.map((k) => parts[k].section),
      cautions: base.cautions, synthesis: synthesis(res, adv, parts), actions, confidenceLabels: CONF_LABEL, glossary: GLOSSARY, refs: REFS,
    };
  }

  const api = { setText, setModules, interpretAll, GLOSSARY, REFS, STATUS: ST, CONF_LABEL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RaschInference = api;
})(typeof window !== "undefined" ? window : globalThis);
