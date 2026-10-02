/* RaschLite: diagnostik lanjutan (khusus versi HTML).
 *
 * Modul ini membaca hasil engine (res) tanpa mengubah angkanya. Isinya: struktur data kosong
 * (omitted vs not-reached) dan perlakuannya, kualitas respons person (lz*, Guttman, skor
 * setara tebakan), analisis sensitivitas, diagnostik butir (ZSTD + selisih PTMEA, pola
 * tebakan, distraktor, tailored analysis), ambang dimensionalitas dari simulasi data yang
 * patuh model, korelasi terdisatenuasi dan uji t Smith, dekomposisi reliabilitas, targeting
 * berbasis informasi, serta DIF yang melaporkan dayanya.
 *
 * Semua ambang yang dipakai di sini dikumpulkan di RULES agar dapat diaudit.
 */
(function (root) {
  "use strict";
  let E = root.RaschEngine || null;
  function setEngine(e) { E = e; }

  const RULES = {
    LZ_UNDERFIT: -1.645,          // lz* < nilai ini: underfit (one-sided 5%), Snijders (2001)
    LZ_OVERFIT: 1.645,
    ZSTD_SIG: 2.0,                // |ZSTD| > 2: menyimpang secara statistik
    PTMEA_GAP_WITH_ZSTD: 0.10,    // selisih PTMEA harapan - amatan bila ZSTD juga > 2
    PTMEA_GAP_ALONE: 0.15,        // selisih PTMEA yang cukup sendiri bila bermakna (z > 1,96)
    PTMEA_GAP_Z: 1.96,
    CHANCE_ALPHA: 0.05,           // skor tidak melampaui tebakan secara bermakna
    CHANCE_MIN_ANSWERED: 5,
    TAILOR_DEFAULT_C: 0.25,       // Andrich, Marais & Humphry (2012) bila jumlah opsi tidak diketahui
    TAILOR_MIN_DIFF: 0.15,        // kenaikan kesulitan minimal (logit) agar bermakna praktis
    GUESS_RHO: 0.40,              // korelasi Spearman outfit-kesulitan yang dianggap kuat
    SIM_QUANTILE: 0.95,
    DISATTENUATED_HALF: 0.71,     // berbagi kurang dari separuh varians (Linacre)
    DISATTENUATED_SAME: 0.82,
    SMITH_PCT: 5,
    INFO_EFF_GOOD_MEDIAN: 0.70,   // efisiensi informasi median
    INFO_EFF_GOOD_P25: 0.60,
    INFO_EFF_POOR_MEDIAN: 0.50,
    KR20_COMPLETE_MIN: 0.80,      // kasus lengkap minimal 80% sampel
    DIF_POWER_Z: 1.959964 + 0.841621, // alpha 0,05 dua sisi, daya 80%
    DIF_DETECT_TARGET: 0.64,      // DIF besar (ETS C) harus dapat dideteksi
    DIF_DETECT_SHARE: 0.80,       // pada sekurang-kurangnya 80% item
    DIF_Q: 0.05,                  // Benjamini-Hochberg
    LR_R2_B: 0.035, LR_R2_C: 0.070, // Jodoin & Gierl (2001)
    MH_STRATA: 10,
    SPEED_NR_SHARE: 0.5, SPEED_NR_CELLS: 0.02, SPEED_TREND: 0.5,
  };

  // ------------------------------------------------------------------------------------
  // Utilitas statistik
  // ------------------------------------------------------------------------------------
  const isF = (v) => typeof v === "number" && isFinite(v);
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  function sd(a, ddof = 0) { if (a.length - ddof <= 0) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - ddof)); }
  function quantile(arr, q) {
    const s = arr.filter(isF).slice().sort((a, b) => a - b);
    if (!s.length) return NaN;
    const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }
  const median = (a) => quantile(a, 0.5);
  function pearson(x, y) {
    const idx = []; for (let k = 0; k < x.length; k++) if (isF(x[k]) && isF(y[k])) idx.push(k);
    if (idx.length < 3) return NaN;
    const mx = mean(idx.map((k) => x[k])), my = mean(idx.map((k) => y[k]));
    let sxx = 0, syy = 0, sxy = 0;
    for (const k of idx) { const a = x[k] - mx, b = y[k] - my; sxx += a * a; syy += b * b; sxy += a * b; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  function ranks(a) {
    const idx = a.map((v, k) => [v, k]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  }
  function spearman(x, y) {
    const idx = []; for (let k = 0; k < x.length; k++) if (isF(x[k]) && isF(y[k])) idx.push(k);
    if (idx.length < 3) return NaN;
    return pearson(ranks(idx.map((k) => x[k])), ranks(idx.map((k) => y[k])));
  }
  /** p dua sisi untuk korelasi r dengan n pasangan (uji t, df n-2). */
  function corrP(r, n) {
    if (!isF(r) || n < 4) return NaN;
    const t = r * Math.sqrt((n - 2) / Math.max(1 - r * r, 1e-15));
    return 2 * E.stdtr(n - 2, -Math.abs(t));
  }
  const normSf = (z) => 1 - E.ndtr(z);

  /** Gamma tak lengkap teregularisasi P(a, x) (Numerical Recipes gser/gcf). */
  function gammaP(a, x) {
    if (x <= 0) return 0;
    const gln = E.lgamma(a);
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 1000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
      return sum * Math.exp(-x + a * Math.log(x) - gln);
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  function chi2Sf(x, df) { if (!isF(x) || !(df > 0)) return NaN; return x <= 0 ? 1 : 1 - gammaP(df / 2, x / 2); }
  /** P(X >= k) untuk X ~ Binomial(n, p). */
  function binomUpper(k, n, p) { if (k <= 0) return 1; if (k > n) return 0; return E.betainc(k, n - k + 1, p); }
  /** Benjamini-Hochberg: q-value untuk setiap p (NaN dibiarkan). */
  function bhAdjust(ps) {
    const idx = []; ps.forEach((p, k) => { if (isF(p)) idx.push(k); });
    idx.sort((a, b) => ps[a] - ps[b]);
    const m = idx.length, q = ps.map(() => NaN);
    let prev = 1;
    for (let r = m - 1; r >= 0; r--) { const k = idx[r]; prev = Math.min(prev, ps[k] * m / (r + 1)); q[k] = Math.min(prev, 1); }
    return q;
  }
  /** Interval kepercayaan Wilson 95% untuk proporsi. */
  function wilson(x, n) {
    if (!n) return [NaN, NaN];
    const z = 1.959964, p = x / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d, w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - w), Math.min(1, c + w)];
  }
  /** Generator acak berbenih (mulberry32) agar simulasi dapat direproduksi. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // ------------------------------------------------------------------------------------
  // Akses struktur hasil engine
  // ------------------------------------------------------------------------------------
  /** Rekonstruksi matriks inti (person dan item non-extreme) seperti di finishAnalysis. */
  function core(res) {
    if (res._core) return res._core;
    const coded = res.coded, jm = res.jmle;
    const ep = [], ei = [];
    coded.personExtreme.forEach((v, n) => { if (v === 0) ep.push(n); });
    coded.itemExtreme.forEach((v, i) => { if (v === 0) ei.push(i); });
    const N = ep.length, L = ei.length;
    const X0 = new Float64Array(N * L), obs = new Uint8Array(N * L);
    for (let a = 0; a < N; a++) for (let c = 0; c < L; c++) {
      const v = coded.X[ep[a]][ei[c]];
      if (!Number.isNaN(v)) { X0[a * L + c] = v; obs[a * L + c] = 1; }
    }
    const theta = ep.map((n) => jm.theta[n]);
    const m = ei.map((i) => coded.m[i]);
    const M = Math.max(...m);
    const delta = ei.map((i) => Float64Array.from(jm.delta[i].slice(0, M)));
    const mom = E.moments(theta, delta, M, true);
    const c = { ep, ei, N, L, X0, obs, theta, m, M, delta, mom, names: ei.map((i) => coded.itemNames[i]) };
    Object.defineProperty(res, "_core", { value: c, enumerable: false });
    return c;
  }

  /** Bangun prep baru dari matriks raw (nilai asli) melalui prepareData agar validasi sama. */
  function prepFromRaw(prep, raw, rows = null, itemIdx = null) {
    const rsel = rows || prep.raw.map((_, n) => n);
    const isel = itemIdx || prep.itemNames.map((_, i) => i);
    const names = isel.map((i) => prep.itemNames[i]);
    const hasG = !!prep.groupValues;
    const columns = ["__ID__", ...(hasG ? ["__G__"] : []), ...names];
    const tableRows = rsel.map((n) => [prep.personIds[n], ...(hasG ? [prep.groupValues[n]] : []),
      ...isel.map((i) => (Number.isNaN(raw[n][i]) ? null : raw[n][i]))]);
    const p = E.prepareData({ columns, rows: tableRows }, { itemCols: names, idCol: "__ID__", groupCol: hasG ? "__G__" : null });
    p.rowIndex = p.rowIndex.map((k) => prep.rowIndex[rsel[k]]);
    if (hasG) { p.groupName = p.groups ? prep.groupColumn : null; p.groupColumn = prep.groupColumn; }
    return p;
  }

  // ------------------------------------------------------------------------------------
  // 1. Blok butir dan struktur data kosong
  // ------------------------------------------------------------------------------------
  function blockPrefix(name) {
    const s = String(name).trim();
    const m = /^(.*?\S)[_\-.\s]+[^_\-.\s]+$/.exec(s);
    if (m) return m[1];
    const d = /^(.*?\D)\d+$/.exec(s);
    return d ? d[1] : "";
  }
  /** Blok dikenali dari awalan nama (S1_01, S1_02, S2_01 ...); minimal dua blok berisi >= 2 item. */
  function detectBlocks(names) {
    const order = [], map = new Map();
    names.forEach((n, i) => {
      const p = blockPrefix(n);
      if (!map.has(p)) { map.set(p, []); order.push(p); }
      map.get(p).push(i);
    });
    const multi = order.filter((p) => map.get(p).length >= 2);
    if (multi.length >= 2 && order.every((p) => p !== "")) {
      return { detected: true, blocks: order.map((p) => ({ name: p, items: map.get(p), names: map.get(p).map((i) => names[i]) })) };
    }
    return { detected: false, blocks: [{ name: "Semua item", items: names.map((_, i) => i), names: names.slice() }] };
  }

  /** Pisahkan omitted (kosong sebelum jawaban terakhir dalam blok) dari not-reached. */
  function missingStructure(prep, blocks) {
    const N = prep.raw.length, L = prep.itemNames.length;
    const type = prep.raw.map((r) => r.map((v) => (Number.isNaN(v) ? 1 : 0))); // 0 terisi, 1 omitted, 2 NR
    const blockOf = new Array(L), posOf = new Array(L);
    blocks.blocks.forEach((b, k) => b.items.forEach((i, p) => { blockOf[i] = k; posOf[i] = p; }));
    const notAttempted = blocks.blocks.map(() => 0);
    for (let n = 0; n < N; n++) {
      blocks.blocks.forEach((b, k) => {
        let last = -1;
        b.items.forEach((i, p) => { if (!Number.isNaN(prep.raw[n][i])) last = p; });
        if (last < 0) notAttempted[k]++;
        b.items.forEach((i, p) => { if (p > last) type[n][i] = 2; });
      });
    }
    let omitted = 0, nr = 0;
    const perItem = prep.itemNames.map((name, i) => {
      let o = 0, r = 0;
      for (let n = 0; n < N; n++) { if (type[n][i] === 1) o++; else if (type[n][i] === 2) r++; }
      omitted += o; nr += r;
      return { item: name, block: blocks.blocks[blockOf[i]].name, position: posOf[i] + 1, answered: N - o - r,
        omitted: o, not_reached: r, pct_omitted: 100 * o / N, pct_not_reached: 100 * r / N };
    });
    const perPerson = type.map((row) => {
      let a = 0, o = 0, r = 0;
      row.forEach((t) => { if (t === 0) a++; else if (t === 1) o++; else r++; });
      return { answered: a, omitted: o, not_reached: r };
    });
    const cells = N * L, missing = omitted + nr;
    // tren: korelasi posisi relatif dengan % not-reached di dalam blok
    const pos = [], pr = [];
    blocks.blocks.forEach((b) => b.items.forEach((i, p) => { pos.push(b.items.length > 1 ? p / (b.items.length - 1) : 0); pr.push(perItem[i].pct_not_reached); }));
    const trend = spearman(pos, pr);
    const speeded = missing > 0 && nr / missing >= RULES.SPEED_NR_SHARE && nr / cells >= RULES.SPEED_NR_CELLS && trend >= RULES.SPEED_TREND;
    const blockStats = blocks.blocks.map((b, k) => {
      let o = 0, r = 0; b.items.forEach((i) => { o += perItem[i].omitted; r += perItem[i].not_reached; });
      const c = N * b.items.length;
      return { block: b.name, n_items: b.items.length, pct_omitted: 100 * o / c, pct_not_reached: 100 * r / c,
        persons_not_attempted: notAttempted[k], last_item_answered_pct: perItem[b.items[b.items.length - 1]].answered / N * 100 };
    });
    const byRow = new Map(prep.rowIndex.map((r, n) => [r, n]));
    return { type, perItem, perPerson, blockStats, cells, byRow, missing, omitted, notReached: nr,
      pctMissing: 100 * missing / cells, pctOmitted: 100 * omitted / cells, pctNotReached: 100 * nr / cells,
      nrShare: missing ? nr / missing : 0, trend, speeded };
  }

  /** Nilai kategori terendah per item (nilai asli) untuk "kosong dihitung salah". */
  function lowestValues(prep) {
    return prep.itemNames.map((_, i) => {
      let lo = Infinity; for (const r of prep.raw) if (!Number.isNaN(r[i]) && r[i] < lo) lo = r[i];
      return lo;
    });
  }

  /**
   * Perlakuan data kosong.
   *  asis    : semua kosong = missing (bawaan engine).
   *  lo1999  : Ludlow & O'Leary (1999). Kalibrasi item: omitted = salah, not-reached = missing;
   *            penskoran person: keduanya salah dengan item dijangkarkan.
   *  allwrong: semua kosong = salah (kategori terendah).
   */
  function applyTreatment(prep, ms, mode) {
    if (mode === "asis") return { calibPrep: prep, scoringRaw: null };
    const lo = lowestValues(prep);
    const calib = prep.raw.map((r, n) => r.map((v, i) => (Number.isNaN(v) ? (mode === "allwrong" || ms.type[n][i] === 1 ? lo[i] : NaN) : v)));
    const scoring = prep.raw.map((r) => r.map((v, i) => (Number.isNaN(v) ? lo[i] : v)));
    const calibPrep = prepFromRaw(prep, calib);
    return { calibPrep, scoringRaw: mode === "lo1999" ? { raw: scoring, ids: prep.personIds.slice(), itemNames: prep.itemNames.slice() } : null };
  }

  /** Lookup nilai asli -> kode kategori untuk setiap item dari label hasil pengodean. */
  function codeLookup(res) {
    return res.coded.categoryLabels.map((labels) => {
      const map = new Map();
      labels.forEach((lab, k) => String(lab).split("+").forEach((v) => map.set(Number(v), k)));
      return map;
    });
  }

  /**
   * Penskoran person dengan item dijangkarkan (tahap kedua Ludlow & O'Leary).
   * scoring = { raw, ids, itemNames }: matriks nilai asli (baris = person prep awal, kolom = item prep awal).
   */
  function scorePersonsAnchored(res, scoring) {
    const coded = res.coded, jm = res.jmle, lut = codeLookup(res);
    const col = new Map(scoring.itemNames.map((n, j) => [n, j]));
    const usable = []; coded.itemExtreme.forEach((v, i) => { if (v !== 2 && col.has(coded.itemNames[i])) usable.push(i); });
    const Mall = Math.max(...coded.m);
    const U = usable.length, n = scoring.raw.length;
    const obs = new Uint8Array(n * U), target = new Float64Array(n);
    const rows = [];
    for (let a = 0; a < n; a++) {
      let score = 0, maxs = 0, cnt = 0;
      usable.forEach((gi, c) => {
        const v = scoring.raw[a][col.get(coded.itemNames[gi])];
        if (v === null || v === undefined || Number.isNaN(v)) return;
        const code = lut[gi].get(v);
        if (code === undefined) return;
        obs[a * U + c] = 1; score += code; maxs += coded.m[gi]; cnt++;
      });
      target[a] = score <= 0 ? E.EXTREME_SCORE_ADJUSTMENT : score >= maxs ? maxs - E.EXTREME_SCORE_ADJUSTMENT : score;
      rows.push({ person: scoring.ids[a], score, max_score: maxs, count: cnt, extreme: cnt > 0 && (score <= 0 || score >= maxs) });
    }
    const sol = E.solvePersons(usable.map((gi) => jm.delta[gi]), obs, Array.from(target), Mall);
    rows.forEach((r, a) => { r.measure = r.count ? sol.theta[a] : NaN; r.se = r.count ? sol.se[a] : NaN; });
    const fin = rows.filter((r) => !r.extreme && isF(r.measure));
    const sep = E.separationStatistics(fin.map((r) => r.measure), fin.map((r) => r.se), null);
    return { rows, separation: sep };
  }

  // ------------------------------------------------------------------------------------
  // 2. Kualitas respons person
  // ------------------------------------------------------------------------------------
  function personQuality(res, ms, opts = {}) {
    const c = core(res), R = res.settings.mnsq_range, dich = res.model === "dichotomous";
    const k = opts.nOptions && opts.nOptions >= 2 ? opts.nOptions : null;
    const order = c.delta.map((d, i) => [d[0], i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]); // termudah dulu (dikotomus)
    const lzA = new Array(c.N).fill(NaN), gA = new Array(c.N).fill(NaN), gsA = new Array(c.N).fill(NaN);
    if (dich) {
      for (let a = 0; a < c.N; a++) {
        let num = 0, den = 0, spw = 0, sp = 0;
        const ws = [];
        for (let i = 0; i < c.L; i++) {
          const q = a * c.L + i; if (!c.obs[q]) continue;
          const P = Math.min(Math.max(c.mom.E[q], 1e-12), 1 - 1e-12), PQ = P * (1 - P), w = Math.log(P / (1 - P));
          ws.push([q, P, PQ, w]); spw += PQ * w; sp += PQ;
        }
        const cn = sp > 0 ? spw / sp : 0;
        for (const [q, P, PQ, w] of ws) { const wt = w - cn; num += (c.X0[q] - P) * wt; den += wt * wt * PQ; }
        lzA[a] = den > 0 ? num / Math.sqrt(den) : NaN;
        let zeros = 0, G = 0, r = 0, n = 0;
        for (const i of order) { const q = a * c.L + i; if (!c.obs[q]) continue; n++; if (c.X0[q] === 1) { G += zeros; r++; } else zeros++; }
        gA[a] = G; gsA[a] = r > 0 && r < n ? G / (r * (n - r)) : NaN;
      }
    }
    const posOf = new Map(c.ep.map((n, a) => [n, a]));
    const rows = res.persons.map((p, n) => {
      const a = posOf.has(n) ? posOf.get(n) : -1;
      const answered = p.count;
      const row = { person: p.person, measure: p.measure, score: p.score, count: answered,
        infit_mnsq: p.infit_mnsq, infit_zstd: p.infit_zstd, outfit_mnsq: p.outfit_mnsq, outfit_zstd: p.outfit_zstd,
        lz_star: a >= 0 ? lzA[a] : NaN, guttman_errors: a >= 0 ? gA[a] : NaN, guttman_gstar: a >= 0 ? gsA[a] : NaN,
        not_reached: ms && ms.byRow.has(res.prep.rowIndex[n]) ? ms.perPerson[ms.byRow.get(res.prep.rowIndex[n])].not_reached : NaN,
        chance_p: NaN, flag_underfit: false, flag_overfit: false, flag_chance: false, flag_mnsq_classic: !!p.flag_misfit, extreme: p.extreme };
      if (k && dich && answered >= RULES.CHANCE_MIN_ANSWERED) {
        row.chance_p = binomUpper(p.score, answered, 1 / k);
        row.flag_chance = row.chance_p > RULES.CHANCE_ALPHA;
      }
      if (a >= 0) {
        if (dich) {
          row.flag_underfit = row.lz_star < RULES.LZ_UNDERFIT;
          row.flag_overfit = row.lz_star > RULES.LZ_OVERFIT;
        } else {
          row.flag_underfit = (p.infit_mnsq > R[1] && p.infit_zstd > RULES.ZSTD_SIG) || (p.outfit_mnsq > R[1] && p.outfit_zstd > RULES.ZSTD_SIG);
          row.flag_overfit = !row.flag_underfit && ((p.infit_mnsq < R[0] && p.infit_zstd < -RULES.ZSTD_SIG) || (p.outfit_mnsq < R[0] && p.outfit_zstd < -RULES.ZSTD_SIG));
        }
      }
      row.quality = row.flag_underfit ? "underfit" : row.flag_chance ? "tebakan" : row.flag_overfit ? "overfit" : row.extreme ? "extreme" : "wajar";
      return row;
    });
    const nonExt = rows.filter((_, n) => posOf.has(n));
    const nUnder = nonExt.filter((r) => r.flag_underfit).length, nOver = nonExt.filter((r) => r.flag_overfit).length;
    const nClassic = nonExt.filter((r) => r.flag_mnsq_classic).length;
    const nChance = rows.filter((r) => r.flag_chance).length;
    const lzs = nonExt.map((r) => r.lz_star).filter(isF);
    // keterkaitan jumlah butir dijawab dengan measure
    const cnt = res.persons.map((p) => p.count), meas = res.persons.map((p) => p.measure);
    const pc = res.persons.map((p) => (p.max_score > 0 ? p.score / p.max_score : NaN));
    const fin = res.persons.filter((p) => isF(p.measure)).length;
    return {
      rows, method: dich ? "lz*" : "MNSQ+ZSTD", nOptions: k,
      n_nonextreme: nonExt.length, n_underfit: nUnder, n_overfit: nOver, n_classic: nClassic, n_chance: nChance,
      pct_underfit: 100 * nUnder / Math.max(nonExt.length, 1), pct_classic: 100 * nClassic / Math.max(nonExt.length, 1),
      expected_false_positive: dich ? 0.05 * nonExt.length : NaN,
      lz_mean: mean(lzs), lz_sd: sd(lzs, 1),
      r_answered_measure: pearson(cnt, meas), rho_answered_measure: spearman(cnt, meas),
      p_answered_measure: corrP(pearson(cnt, meas), fin), r_answered_pcorrect: pearson(cnt, pc),
      cv_answered: sd(cnt.filter(isF)) / Math.max(mean(cnt.filter(isF)), 1e-9),
    };
  }

  /** Ringkasan yang dibandingkan pada analisis sensitivitas. */
  function snapshot(res) {
    const flags = itemFlags(res);
    return {
      n_persons: res.summary.n_persons, person_reliability: res.summary.person_reliability, item_reliability: res.summary.item_reliability,
      person_sd: res.summary.person.sd, eigenvalue: res.dimensionality.first_contrast_eigenvalue,
      n_items_flagged: flags.rows.filter((r) => r.status === "serius" || r.status === "telaah").length,
      measures: new Map(res.items.filter((r) => !r.extreme).map((r) => [r.item, r.measure])),
    };
  }

  /** Jalankan ulang analisis tanpa kelompok person tertentu; bandingkan berdampingan. */
  async function sensitivity(res, prep, scenarios, opts = {}) {
    const base = snapshot(res);
    const out = [{ scenario: "Semua person", excluded: 0, ...base }];
    for (const sc of scenarios) {
      const drop = new Set(sc.persons);
      if (!drop.size) { out.push({ scenario: sc.label, excluded: 0, skipped: true }); continue; }
      const rows = prep.personIds.map((id, n) => (drop.has(id) ? -1 : n)).filter((n) => n >= 0);
      await tick();
      try {
        const p2 = prepFromRaw(prep, prep.raw, rows);
        const r2 = E.runAnalysis(p2, res.model, { strictFit: res.settings.strict_fit, runDif: false, ...(opts.engine || {}) });
        out.push({ scenario: sc.label, excluded: drop.size, ...snapshot(r2) });
      } catch (err) {
        out.push({ scenario: sc.label, excluded: drop.size, error: err.message || String(err) });
      }
    }
    for (const row of out.slice(1)) {
      if (!row.measures) continue;
      const d = [], a = [], b = [];
      for (const [k, v] of base.measures) if (row.measures.has(k)) { d.push(row.measures.get(k) - v); a.push(v); b.push(row.measures.get(k)); }
      row.mean_abs_shift = mean(d.map(Math.abs));
      let mx = 0, who = null;
      for (const [k, v] of base.measures) if (row.measures.has(k)) { const s = Math.abs(row.measures.get(k) - v); if (s > mx) { mx = s; who = k; } }
      row.max_abs_shift = mx; row.max_shift_item = who; row.r_measures = pearson(a, b);
    }
    out.forEach((r) => delete r.measures);
    return out;
  }

  // ------------------------------------------------------------------------------------
  // 3. Diagnostik butir
  // ------------------------------------------------------------------------------------
  function itemFlags(res) {
    const [lo, hi] = res.settings.mnsq_range;
    const RR = root.RASCH_TEXT ? root.RASCH_TEXT.rules : { MNSQ_DEGRADING: 2.0, PTMEASURE_MIN: 0 };
    const rows = res.items.map((x) => {
      const n = x.count;
      const gap = x.ptmea_exp - x.ptmea_obs;
      const zgap = isF(gap) && n > 3 ? (Math.atanh(Math.max(Math.min(x.ptmea_exp, 0.999), -0.999)) - Math.atanh(Math.max(Math.min(x.ptmea_obs, 0.999), -0.999))) * Math.sqrt(n - 3) : NaN;
      const zUnder = x.infit_zstd > RULES.ZSTD_SIG || x.outfit_zstd > RULES.ZSTD_SIG;
      const mnsqUnder = x.infit_mnsq > hi || x.outfit_mnsq > hi;
      const mnsqOver = x.infit_mnsq < lo || x.outfit_mnsq < lo;
      const zOver = x.infit_zstd < -RULES.ZSTD_SIG || x.outfit_zstd < -RULES.ZSTD_SIG;
      const degrading = (x.infit_mnsq > RR.MNSQ_DEGRADING && x.infit_zstd > RULES.ZSTD_SIG) || (x.outfit_mnsq > RR.MNSQ_DEGRADING && x.outfit_zstd > RULES.ZSTD_SIG);
      const negSig = x.ptmea_obs < RR.PTMEASURE_MIN && zgap > RULES.PTMEA_GAP_Z;
      const reasons = [];
      if (degrading) reasons.push("MNSQ > " + RR.MNSQ_DEGRADING + " dan ZSTD > 2");
      if (negSig) reasons.push("PTMEA negatif, jauh di bawah harapan");
      const reviewMnsq = mnsqUnder && zUnder;
      const reviewZgap = zUnder && gap >= RULES.PTMEA_GAP_WITH_ZSTD;
      const reviewGap = gap >= RULES.PTMEA_GAP_ALONE && zgap > RULES.PTMEA_GAP_Z;
      if (reviewMnsq) reasons.push("MNSQ di atas rentang dan ZSTD > 2");
      if (reviewZgap && !reviewMnsq) reasons.push("ZSTD > 2 disertai PTMEA di bawah harapan");
      if (reviewGap) reasons.push("PTMEA jauh di bawah harapan (daya beda rendah)");
      let status = "wajar";
      if (x.extreme) status = "extreme";
      else if (degrading || negSig) status = "serius";
      else if (reviewMnsq || reviewZgap || reviewGap) status = "telaah";
      else if (mnsqOver && zOver) { status = "overfit"; reasons.push("MNSQ di bawah rentang dan ZSTD < -2 (tidak merusak)"); }
      else if (mnsqUnder || mnsqOver || x.ptmea_obs < RR.PTMEASURE_MIN) { status = "catatan"; reasons.push("hanya satu kriteria terpenuhi (tidak bermakna secara statistik)"); }
      return { item: x.item, measure: x.measure, count: n, infit_mnsq: x.infit_mnsq, infit_zstd: x.infit_zstd, outfit_mnsq: x.outfit_mnsq,
        outfit_zstd: x.outfit_zstd, ptmea_obs: x.ptmea_obs, ptmea_exp: x.ptmea_exp, ptmea_gap: gap, ptmea_gap_z: zgap,
        status, reasons: reasons.join("; "), flag_classic: !!(x.flag_misfit || x.flag_negative_ptmea) };
    });
    return { rows, classic: rows.filter((r) => r.flag_classic).map((r) => r.item) };
  }

  /** Petunjuk tebakan: korelasi outfit dengan kesulitan dan sumber kejutan. */
  function guessingSignals(res) {
    const c = core(res), est = res.items.filter((x) => !x.extreme);
    const rho = spearman(est.map((x) => x.measure), est.map((x) => x.outfit_mnsq));
    const rhoZ = spearman(est.map((x) => x.measure), est.map((x) => x.outfit_zstd));
    const out = { rho_outfit_measure: rho, p_rho: corrP(rho, est.length), rho_outfitz_measure: rhoZ, n_items: est.length };
    if (res.model === "dichotomous") {
      let lucky = 0, careless = 0, low = 0, high = 0;
      const perItem = c.names.map(() => ({ lucky: 0, careless: 0 }));
      for (let a = 0; a < c.N; a++) for (let i = 0; i < c.L; i++) {
        const q = a * c.L + i; if (!c.obs[q]) continue;
        const P = c.mom.E[q];
        if (P < 0.2) { low++; if (c.X0[q] === 1) { lucky++; perItem[i].lucky++; } }
        if (P > 0.8) { high++; if (c.X0[q] === 0) { careless++; perItem[i].careless++; } }
      }
      Object.assign(out, { unexpected_success: lucky, low_prob_cells: low, unexpected_failure: careless, high_prob_cells: high,
        pct_unexpected_success: 100 * lucky / Math.max(low, 1), pct_unexpected_failure: 100 * careless / Math.max(high, 1) });
      let exp = 0, var_ = 0; // jumlah sukses harapan pada sel P < 0,2
      for (let a = 0; a < c.N; a++) for (let i = 0; i < c.L; i++) { const q = a * c.L + i; if (c.obs[q] && c.mom.E[q] < 0.2) { exp += c.mom.E[q]; var_ += c.mom.E[q] * (1 - c.mom.E[q]); } }
      out.expected_success_low = exp; out.z_success_low = var_ > 0 ? (lucky - exp) / Math.sqrt(var_) : NaN;
      out.per_item = c.names.map((nm, i) => ({ item: nm, ...perItem[i] }));
    }
    out.pattern = isF(rho) && rho >= RULES.GUESS_RHO && out.p_rho < 0.05;
    return out;
  }

  /** Tailored analysis (Andrich, Marais & Humphry, 2012): respons berpeluang benar < c dibuang. */
  async function tailoredAnalysis(res, prep, cutoff) {
    if (res.model !== "dichotomous") return null;
    const c = core(res);
    const raw = prep.raw.map((r) => r.slice());
    const itemPrep = new Map(prep.itemNames.map((n, i) => [n, i]));
    let removed = 0;
    for (let a = 0; a < c.N; a++) {
      const n = c.ep[a];
      for (let k = 0; k < c.L; k++) {
        const q = a * c.L + k; if (!c.obs[q]) continue;
        if (c.mom.E[q] < cutoff) { raw[n][itemPrep.get(c.names[k])] = NaN; removed++; }
      }
    }
    await tick();
    let r2;
    try { r2 = E.runAnalysis(prepFromRaw(prep, raw), "dichotomous", { runDif: false, strictFit: res.settings.strict_fit }); }
    catch (err) { return { cutoff, removed, error: err.message || String(err) }; }
    const orig = new Map(res.items.filter((x) => !x.extreme).map((x) => [x.item, x]));
    const tail = new Map(r2.items.filter((x) => !x.extreme).map((x) => [x.item, x]));
    const common = [...orig.keys()].filter((k) => tail.has(k));
    const easy = common.slice().sort((a, b) => orig.get(a).measure - orig.get(b).measure).slice(0, Math.max(2, Math.floor(common.length / 3)));
    const shift = mean(easy.map((k) => orig.get(k).measure)) - mean(easy.map((k) => tail.get(k).measure));
    const rows = common.map((k) => {
      const o = orig.get(k), t = tail.get(k);
      const tm = t.measure + shift, d = tm - o.measure;
      const se = Math.sqrt(Math.abs(t.se * t.se - o.se * o.se));
      const z = se > 0 ? d / se : NaN;
      return { item: k, measure_original: o.measure, measure_tailored: tm, difference: d, se_difference: se, z,
        flag_guessing: d >= RULES.TAILOR_MIN_DIFF && z > 1.96, count_original: o.count, count_tailored: t.count };
    });
    return { cutoff, removed, pct_removed: 100 * removed / Math.max(c.obs.reduce((s, v) => s + v, 0), 1), anchor_items: easy, shift, rows,
      n_flagged: rows.filter((r) => r.flag_guessing).length, person_reliability_tailored: r2.summary.person_reliability };
  }

  /** Normalisasi jawaban mentah: huruf besar, tanpa spasi, opsi ganda diurutkan ("d;b;" -> "B;D"). */
  function normAnswer(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isNaN(v) ? null : String(v);
    let s = String(v).trim().toUpperCase();
    if (!s) return null;
    const parts = s.split(/[;,|]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) return Array.from(new Set(parts)).sort().join(";");
    return parts[0] || null;
  }
  const KEY_ROW = /^(kunci|kunci jawaban|key|answer key|kunci_jawaban)$/i;
  /** Cari baris kunci (nilai ID/kolom pertama "KUNCI"/"KEY"). */
  function findKeyRow(table, idCol) {
    const cols = [idCol, table.columns[0]].filter((c) => c !== null && c !== undefined);
    for (const col of cols) {
      const j = table.columns.indexOf(col); if (j < 0) continue;
      const k = table.rows.findIndex((r) => r[j] !== null && r[j] !== undefined && KEY_ROW.test(String(r[j]).trim()));
      if (k >= 0) return k;
    }
    return -1;
  }
  /** Skor jawaban mentah dengan kunci; kunci alternatif dipisah "/" (mis. "A/C"). */
  function scoreWithKey(table, keyRow, itemCols) {
    const keyCells = table.rows[keyRow];
    const keys = {}, raw = {};
    const cols = itemCols.map((c) => table.columns.indexOf(c));
    itemCols.forEach((c, k) => { keys[c] = String(keyCells[cols[k]] ?? "").split("/").map(normAnswer).filter(Boolean); });
    const rows = table.rows.filter((_, n) => n !== keyRow);
    itemCols.forEach((c) => { raw[c] = []; });
    const scored = rows.map((r) => r.map((v, j) => {
      const k = cols.indexOf(j); if (k < 0) return v;
      const a = normAnswer(v); raw[itemCols[k]].push(a);
      if (a === null) return null;
      return keys[itemCols[k]].includes(a) ? 1 : 0;
    }));
    return { table: { columns: table.columns.slice(), rows: scored }, keys, raw };
  }

  /** Analisis distraktor dari jawaban mentah. */
  function distractors(res, prep, answers, nOptions) {
    const measure = res.persons.map((p) => p.measure);
    const rowsOut = [], items = [];
    for (const name of res.coded.itemNames) {
      const resp = answers.raw[name]; if (!resp) continue;
      const keys = answers.keys[name] || [];
      const vals = prep.rowIndex.map((r) => resp[r]);
      const idx = []; vals.forEach((v, n) => { if (v !== null && isF(measure[n])) idx.push(n); });
      const opts = Array.from(new Set(idx.map((n) => vals[n]))).sort();
      const singles = opts.filter((o) => !o.includes(";"));
      const kOpt = nOptions && nOptions >= 2 ? nOptions : Math.max(singles.length, 2);
      const y = idx.map((n) => measure[n]);
      const optRows = opts.map((o) => {
        const ind = idx.map((n) => (vals[n] === o ? 1 : 0));
        const cnt = ind.reduce((s, v) => s + v, 0);
        const mm = mean(idx.filter((_, k) => ind[k]).map((n) => measure[n]));
        return { item: name, option: o, key: keys.includes(o), count: cnt, proportion: cnt / Math.max(idx.length, 1), mean_measure: mm, r_pb: pearson(ind, y) };
      });
      const keyRows = optRows.filter((r) => r.key);
      const rKey = keyRows.length ? Math.max(...keyRows.map((r) => (isF(r.r_pb) ? r.r_pb : -Infinity))) : NaN;
      const pKey = keyRows.reduce((s, r) => s + r.proportion, 0);
      const better = optRows.filter((r) => !r.key && isF(r.r_pb) && r.r_pb > Math.max(isF(rKey) ? rKey : -1, 0.05) && r.count >= 5);
      const chance = 1 / kOpt;
      const pBelow = binomUpper(Math.round(pKey * idx.length) + 1, idx.length, chance); // P(X > obs | chance)
      const flags = [];
      if (!keyRows.length) flags.push("kunci tidak ditemukan di antara jawaban");
      if (isF(rKey) && rKey <= 0) flags.push("korelasi kunci dengan measure tidak positif");
      if (better.length) flags.push(`distraktor ${better.map((r) => r.option).join(", ")} lebih diskriminatif daripada kunci (dugaan kunci keliru)`);
      if (pKey < chance) flags.push(`proporsi benar ${(100 * pKey).toFixed(0)}% di bawah peluang tebakan ${(100 * chance).toFixed(0)}%`);
      optRows.forEach((r) => rowsOut.push(r));
      items.push({ item: name, key: keys.join("/"), n: idx.length, n_options: kOpt, p_correct: pKey, r_key: rKey, chance,
        p_chance_or_lower: 1 - pBelow, flag: flags.length > 0, flags: flags.join("; ") });
    }
    return { options: rowsOut, items };
  }

  /** Item yang proporsi benarnya di bawah peluang tebakan (data terskor, jumlah opsi diketahui). */
  function belowChance(res, nOptions) {
    if (res.model !== "dichotomous" || !(nOptions >= 2)) return [];
    const ch = 1 / nOptions;
    return res.items.filter((x) => x.count > 0 && x.score / x.count < ch).map((x) => ({ item: x.item, p: x.score / x.count, chance: ch }));
  }

  // ------------------------------------------------------------------------------------
  // 4. Simulasi data yang patuh model (ambang eigenvalue/Q3, pemulihan parameter)
  // ------------------------------------------------------------------------------------
  async function simulate(res, prep, reps, opts = {}) {
    const coded = res.coded, jm = res.jmle;
    const seed = opts.seed ?? 20240917;
    const rand = rng(seed);
    const persons = [], items = [];
    coded.personExtreme.forEach((v, n) => { if (isF(jm.theta[n])) persons.push(n); });
    coded.itemExtreme.forEach((v, i) => { if (v !== 2 && isF(jm.b[i])) items.push(i); });
    const Mall = Math.max(...coded.m);
    const theta = persons.map((n) => jm.theta[n]);
    const delta = items.map((i) => jm.delta[i]);
    const mom = E.moments(theta, delta, Mall);
    const K = Mall + 1, Lp = items.length;
    const genB = new Map(items.map((i) => [coded.itemNames[i], jm.b[i]]));
    const fake = { itemNames: items.map((i) => coded.itemNames[i]), personIds: persons.map((n) => coded.personIds[n]), groupValues: null,
      rowIndex: persons.map((n) => n), raw: null };
    const out = { reps: 0, failed: 0, seed, eig: [], q3rel: [], q3max: [], prel: [], irel: [], flagged: [], recov: new Map(), lzSd: [] };
    for (let r = 0; r < reps; r++) {
      if (opts.shouldCancel && opts.shouldCancel()) break;
      const raw = persons.map((n, a) => items.map((i, c) => {
        if (Number.isNaN(coded.X[n][i])) return NaN;
        const base = (a * Lp + c) * K;
        let u = rand(), k = 0, acc = mom.P[base];
        while (u > acc && k < coded.m[i]) { k++; acc += mom.P[base + k]; }
        return k;
      }));
      fake.raw = raw;
      try {
        const p2 = prepFromRaw(fake, raw);
        const r2 = E.runAnalysis(p2, res.model, { runDif: false, strictFit: res.settings.strict_fit });
        out.eig.push(r2.dimensionality.first_contrast_eigenvalue);
        out.q3rel.push(r2.q3.max - r2.q3.mean); out.q3max.push(r2.q3.max);
        out.prel.push(r2.summary.person_reliability); out.irel.push(r2.summary.item_reliability);
        const fl = itemFlags(r2).rows.filter((x) => !x.extreme);
        out.flagged.push(fl.filter((x) => x.status === "serius" || x.status === "telaah").length / Math.max(fl.length, 1));
        // pemulihan: estimasi (terkoreksi bias) vs parameter pembangkit, dipusatkan pada item bersama
        const est = r2.items.filter((x) => !x.extreme && genB.has(x.item));
        const gm = mean(est.map((x) => genB.get(x.item))), em = mean(est.map((x) => x.measure));
        const emU = mean(est.map((x) => x.measure / r2.jmle.biasFactor));
        for (const x of est) {
          if (!out.recov.has(x.item)) out.recov.set(x.item, { err: [], errU: [], cover: 0, n: 0 });
          const t = genB.get(x.item) - gm, e = x.measure - em, eu = x.measure / r2.jmle.biasFactor - emU;
          const rec = out.recov.get(x.item);
          rec.err.push(e - t); rec.errU.push(eu - t); rec.n++;
          if (Math.abs(e - t) <= 1.96 * x.se) rec.cover++;
        }
        if (r2.model === "dichotomous") {
          const pq = personQuality(r2, null, {});
          out.lzSd.push(pq.lz_sd);
        }
        out.reps++;
      } catch (err) { out.failed++; }
      if (opts.progress) opts.progress(r + 1, reps);
      await tick();
    }
    const q = RULES.SIM_QUANTILE;
    const recRows = [...out.recov.entries()].map(([item, v]) => ({ item, generating: genB.get(item), bias: mean(v.err), rmse: Math.sqrt(mean(v.err.map((e) => e * e))),
      bias_uncorrected: mean(v.errU), coverage: v.cover / Math.max(v.n, 1), n: v.n }));
    return {
      reps: out.reps, failed: out.failed, seed,
      eig_p95: quantile(out.eig, q), eig_p99: quantile(out.eig, 0.99), eig_mean: mean(out.eig), eig_max: Math.max(...out.eig),
      q3rel_p95: quantile(out.q3rel, q), q3rel_p99: quantile(out.q3rel, 0.99), q3max_p95: quantile(out.q3max, q),
      person_rel_mean: mean(out.prel), item_rel_mean: mean(out.irel), flagged_rate: mean(out.flagged),
      lz_sd_mean: mean(out.lzSd),
      recovery: recRows, recovery_bias: mean(recRows.map((r) => Math.abs(r.bias))), recovery_rmse: mean(recRows.map((r) => r.rmse)),
      recovery_bias_uncorrected: mean(recRows.map((r) => Math.abs(r.bias_uncorrected))), recovery_coverage: mean(recRows.map((r) => r.coverage)),
      eig_values: out.eig, q3rel_values: out.q3rel,
    };
  }

  // ------------------------------------------------------------------------------------
  // 5. Dimensionalitas lanjutan
  // ------------------------------------------------------------------------------------
  /** Measure person dari subset item (item dijangkarkan). */
  function subsetMeasures(res, itemIdxCore) {
    const c = core(res), jm = res.jmle;
    const k = itemIdxCore.length;
    const obs = new Uint8Array(c.N * k), target = new Float64Array(c.N), info = [];
    for (let a = 0; a < c.N; a++) {
      let s = 0, mx = 0, cnt = 0;
      itemIdxCore.forEach((i, j) => { const q = a * c.L + i; if (c.obs[q]) { obs[a * k + j] = 1; s += c.X0[q]; mx += c.m[i]; cnt++; } });
      target[a] = s <= 0 ? E.EXTREME_SCORE_ADJUSTMENT : s >= mx ? mx - E.EXTREME_SCORE_ADJUSTMENT : s;
      info.push({ cnt, extreme: cnt === 0 || s <= 0 || s >= mx });
    }
    void jm;
    const sol = E.solvePersons(itemIdxCore.map((i) => c.delta[i]), obs, Array.from(target), c.M);
    return info.map((x, a) => ({ measure: x.cnt ? sol.theta[a] : NaN, se: x.cnt ? sol.se[a] : NaN, valid: x.cnt > 0 && !x.extreme }));
  }

  function compareSubsets(res, A, B, labelA, labelB) {
    const ma = subsetMeasures(res, A), mb = subsetMeasures(res, B);
    const keep = []; ma.forEach((x, a) => { if (x.valid && mb[a].valid) keep.push(a); });
    const xa = keep.map((a) => ma[a].measure), xb = keep.map((a) => mb[a].measure);
    const ra = E.separationStatistics(xa, keep.map((a) => ma[a].se), null).model_reliability;
    const rb = E.separationStatistics(xb, keep.map((a) => mb[a].se), null).model_reliability;
    const r = pearson(xa, xb);
    const rdis = ra > 0 && rb > 0 ? r / Math.sqrt(ra * rb) : NaN;
    let sig = 0;
    keep.forEach((a) => { const t = (ma[a].measure - mb[a].measure) / Math.sqrt(ma[a].se ** 2 + mb[a].se ** 2); if (Math.abs(t) > 1.96) sig++; });
    const ci = wilson(sig, keep.length);
    return { a: labelA, b: labelB, n_items_a: A.length, n_items_b: B.length, n_persons: keep.length, r_observed: r,
      reliability_a: ra, reliability_b: rb, r_disattenuated: rdis, smith_pct: 100 * sig / Math.max(keep.length, 1),
      smith_ci_low: 100 * ci[0], smith_ci_high: 100 * ci[1] };
  }

  function dimensionExtras(res, blocks, sim) {
    const c = core(res), d = res.dimensionality, q3 = res.q3;
    const loadMap = new Map(d.loadings.map(([n, l]) => [n, l]));
    const coreIdx = new Map(c.names.map((n, i) => [n, i]));
    const blockRows = [];
    if (blocks.detected) {
      for (const b of blocks.blocks) {
        const ls = b.names.map((n) => loadMap.get(n)).filter(isF);
        blockRows.push({ block: b.name, n_items: ls.length, mean_loading: mean(ls), min_loading: Math.min(...ls), max_loading: Math.max(...ls),
          pct_positive: 100 * ls.filter((v) => v > 0).length / Math.max(ls.length, 1) });
      }
    }
    // kelompok item dari first contrast: sepertiga atas vs sepertiga bawah (gaya Winsteps)
    const sorted = d.loadings.slice().sort((a, b) => b[1] - a[1]).map((x) => coreIdx.get(x[0])).filter((v) => v !== undefined);
    const third = Math.max(2, Math.floor(sorted.length / 3));
    const top = sorted.slice(0, third), bottom = sorted.slice(-third);
    const clusters = sorted.length >= 6 ? compareSubsets(res, top, bottom, "Loading positif (1/3 atas)", "Loading negatif (1/3 bawah)") : null;
    const blockPairs = [];
    if (blocks.detected) {
      const sets = blocks.blocks.map((b) => b.names.map((n) => coreIdx.get(n)).filter((v) => v !== undefined));
      for (let a = 0; a < sets.length; a++) for (let b = a + 1; b < sets.length; b++) {
        if (sets[a].length >= 2 && sets[b].length >= 2) blockPairs.push(compareSubsets(res, sets[a], sets[b], blocks.blocks[a].name, blocks.blocks[b].name));
      }
    }
    // Q3 dengan ambang simulasi (Christensen dkk., 2017) dan kandidat testlet
    const relCut = sim && isF(sim.q3rel_p95) ? sim.q3rel_p95 : (root.RASCH_TEXT ? root.RASCH_TEXT.rules.Q3_RELATIVE_CUTOFF : 0.2);
    const pairs = [];
    for (let a = 0; a < q3.names.length; a++) for (let b = a + 1; b < q3.names.length; b++) {
      const v = q3.matrix[a][b];
      if (isF(v) && v - q3.mean > relCut) pairs.push({ item_a: q3.names[a], item_b: q3.names[b], q3: v, q3_relative: v - q3.mean });
    }
    pairs.sort((p, q) => q.q3 - p.q3);
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const p of pairs) for (const x of [p.item_a, p.item_b]) if (!parent.has(x)) parent.set(x, x);
    for (const p of pairs) { const ra = find(p.item_a), rb = find(p.item_b); if (ra !== rb) parent.set(ra, rb); }
    const groups = new Map();
    for (const x of parent.keys()) { const r = find(x); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(x); }
    const order = new Map(q3.names.map((n, i) => [n, i]));
    const testlets = [...groups.values()].map((g) => g.sort((a, b) => order.get(a) - order.get(b)));
    return { blockRows, clusters, blockPairs, q3_relative_cutoff: relCut, q3_cutoff: q3.mean + relCut, q3_source: sim ? "simulasi" : "tetap",
      q3_pairs: pairs, testlets };
  }

  async function calibrateBlocks(prep, model, blocks, opts = {}) {
    const rows = [];
    const pos = new Map(prep.itemNames.map((n, i) => [n, i]));
    for (const b of blocks.blocks) {
      await tick();
      try {
        const idx = b.names.map((n) => pos.get(n)).filter((v) => v !== undefined);
        const p2 = prepFromRaw(prep, prep.raw, null, idx);
        const m2 = model === "dichotomous" || p2.responseType !== "dichotomous" ? model : "dichotomous";
        const r2 = E.runAnalysis(p2, m2, { runDif: false, strictFit: opts.strictFit });
        const fl = itemFlags(r2).rows;
        rows.push({ block: b.name, n_items: b.items.length, n_persons: r2.summary.n_persons, person_reliability: r2.summary.person_reliability,
          person_separation: r2.summary.person_separation, item_reliability: r2.summary.item_reliability,
          eigenvalue: r2.dimensionality.first_contrast_eigenvalue, n_items_flagged: fl.filter((x) => x.status === "serius" || x.status === "telaah").length,
          person_mean: r2.summary.person_mean, person_sd: r2.summary.person.sd, converged: r2.converged, result: r2 });
      } catch (err) {
        rows.push({ block: b.name, n_items: b.items.length, error: err.message || String(err) });
      }
    }
    return rows;
  }

  // ------------------------------------------------------------------------------------
  // 6. Reliabilitas dan targeting
  // ------------------------------------------------------------------------------------
  /** Informasi maksimum setiap item (puncak fungsi informasi item). */
  function maxItemInfo(delta, M) {
    const fin = Array.from(delta).filter(isF);
    const lo = Math.min(...fin) - 4, hi = Math.max(...fin) + 4;
    const grid = []; for (let t = lo; t <= hi; t += 0.01) grid.push(t);
    const mom = E.moments(grid, [delta], M);
    let mx = 0; for (let g = 0; g < grid.length; g++) mx = Math.max(mx, mom.W[g]);
    return mx;
  }

  function reliabilityTargeting(res) {
    const c = core(res), s = res.summary;
    const maxInfo = c.delta.map((d) => maxItemInfo(d, c.M));
    const eff = [], semMin = [], answered = [];
    for (let a = 0; a < c.N; a++) {
      let I = 0, Imax = 0, n = 0;
      for (let i = 0; i < c.L; i++) { const q = a * c.L + i; if (c.obs[q]) { I += c.mom.W[q]; Imax += maxInfo[i]; n++; } }
      eff.push(Imax > 0 ? I / Imax : NaN); semMin.push(Imax > 0 ? 1 / Math.sqrt(Imax) : NaN); answered.push(n);
    }
    const p = s.person;
    const trueVar = p.real_true_sd ** 2, trueVarM = p.model_true_sd ** 2;
    const rmseMin = Math.sqrt(mean(semMin.filter(isF).map((v) => v * v)));
    const relMax = trueVarM > 0 ? trueVarM / (trueVarM + rmseMin * rmseMin) : NaN;
    const R = s.person_reliability, Lbar = mean(answered);
    const proj = (target) => (isF(R) && R > 0 && R < 1 ? Lbar * (target / (1 - target)) / (R / (1 - R)) : NaN);
    const completeShare = s.n_persons ? s.alpha_n / s.n_persons : NaN;
    const effF = eff.filter(isF);
    return {
      observed_sd: p.sd, true_sd: p.real_true_sd, model_true_sd: p.model_true_sd, rmse_real: p.real_rmse, rmse_model: p.model_rmse,
      reliability_real: R, reliability_model: p.model_reliability, rmse_min: rmseMin, reliability_max: relMax,
      mean_answered: Lbar, items_for_080: proj(0.8), items_for_090: proj(0.9), true_var: trueVar,
      error_share: p.sd > 0 ? (p.real_rmse ** 2) / (p.sd ** 2) : NaN,
      alpha_complete_n: s.alpha_n, alpha_complete_share: completeShare, alpha_selection_warning: isF(completeShare) && completeShare < RULES.KR20_COMPLETE_MIN,
      info_eff_median: median(effF), info_eff_p25: quantile(effF, 0.25), info_eff_p75: quantile(effF, 0.75),
      info_eff_below_half: 100 * effF.filter((v) => v < 0.5).length / Math.max(effF.length, 1),
      info_eff: eff, max_item_info: maxInfo,
    };
  }

  // ------------------------------------------------------------------------------------
  // 7. DIF lanjutan
  // ------------------------------------------------------------------------------------
  /** Item measure per kelompok dengan theta person dijangkarkan (padanan difAnalysis per kelompok). */
  function groupItemMeasures(c, tauE, sel, theta) {
    const L = c.L, score = new Float64Array(L), n = new Float64Array(L);
    for (const a of sel) for (let i = 0; i < L; i++) { const q = a * L + i; if (c.obs[q]) { score[i] += c.X0[q]; n[i] += 1; } }
    const has = [], target = [], extreme = [];
    for (let i = 0; i < L; i++) {
      const mx = n[i] * c.m[i];
      extreme.push((score[i] <= 0 || score[i] >= mx) && n[i] > 0);
      target.push(score[i] <= 0 ? E.EXTREME_SCORE_ADJUSTMENT : score[i] >= mx ? mx - E.EXTREME_SCORE_ADJUSTMENT : score[i]);
      if (n[i] > 0) has.push(i);
    }
    const b = new Array(L).fill(NaN), se = new Array(L).fill(NaN);
    if (has.length && sel.length >= 2) {
      const k = has.length, ob = new Uint8Array(sel.length * k);
      sel.forEach((a, r) => has.forEach((i, j) => { if (c.obs[a * L + i]) ob[r * k + j] = 1; }));
      const sol = E.solveItemLocations(sel.map((a) => theta[a]), ob, has.map((i) => tauE[i]), has.map((i) => c.m[i]), has.map((i) => target[i]), c.M);
      has.forEach((i, j) => { b[i] = sol.b[j]; se[i] = sol.se[j]; });
    }
    return { b, se, n: Array.from(n), extreme };
  }

  /** Theta person dari item jangkar (purifikasi). */
  function anchoredTheta(c, anchor) {
    const k = anchor.length, obs = new Uint8Array(c.N * k), target = new Float64Array(c.N);
    for (let a = 0; a < c.N; a++) {
      let s = 0, mx = 0;
      anchor.forEach((i, j) => { const q = a * c.L + i; if (c.obs[q]) { obs[a * k + j] = 1; s += c.X0[q]; mx += c.m[i]; } });
      target[a] = s <= 0 ? E.EXTREME_SCORE_ADJUSTMENT : s >= mx ? mx - E.EXTREME_SCORE_ADJUSTMENT : s;
    }
    return Array.from(E.solvePersons(anchor.map((i) => c.delta[i]), obs, Array.from(target), c.M).theta);
  }

  function welch(b1, se1, n1, b2, se2, n2) {
    const contrast = b1 - b2, joint = Math.sqrt(se1 * se1 + se2 * se2), t = contrast / joint;
    const df = joint ** 4 / (se1 ** 4 / (n1 - 1) + se2 ** 4 / (n2 - 1));
    return { contrast, joint, t, df, p: 2 * E.stdtr(df, -Math.abs(t)) };
  }

  /** Regresi logistik (IRLS) untuk DIF; mengembalikan log-likelihood. */
  function logistic(Xrows, y) {
    const p = Xrows[0].length; let beta = new Array(p).fill(0);
    let ll = -Infinity;
    for (let it = 0; it < 50; it++) {
      const H = Array.from({ length: p }, () => new Array(p).fill(0)), g = new Array(p).fill(0);
      let llNew = 0;
      for (let r = 0; r < y.length; r++) {
        const x = Xrows[r]; let eta = 0; for (let j = 0; j < p; j++) eta += x[j] * beta[j];
        const pr = 1 / (1 + Math.exp(-eta)), w = Math.max(pr * (1 - pr), 1e-10);
        llNew += y[r] ? Math.log(Math.max(pr, 1e-300)) : Math.log(Math.max(1 - pr, 1e-300));
        for (let j = 0; j < p; j++) { g[j] += (y[r] - pr) * x[j]; for (let k = 0; k < p; k++) H[j][k] += w * x[j] * x[k]; }
      }
      for (let j = 0; j < p; j++) H[j][j] += 1e-8;
      const step = E.solve(H, g); if (!step) break;
      beta = beta.map((b, j) => b + Math.max(-5, Math.min(5, step[j])));
      if (Math.abs(llNew - ll) < 1e-9) { ll = llNew; break; }
      ll = llNew;
    }
    // log-likelihood akhir pada beta terbaru
    let llf = 0;
    for (let r = 0; r < y.length; r++) { let eta = 0; for (let j = 0; j < p; j++) eta += Xrows[r][j] * beta[j]; const pr = 1 / (1 + Math.exp(-eta)); llf += y[r] ? Math.log(Math.max(pr, 1e-300)) : Math.log(Math.max(1 - pr, 1e-300)); }
    return { beta, ll: llf };
  }
  const nagelkerke = (ll0, ll, n) => { const cs = 1 - Math.exp((2 / n) * (ll0 - ll)); const mx = 1 - Math.exp((2 / n) * ll0); return mx > 0 ? cs / mx : NaN; };

  function difExtras(res, prep) {
    const c = core(res), jm = res.jmle, scale = jm.biasFactor;
    const gv = prep.groupValues; if (!gv) return null;
    const gE = c.ep.map((n) => gv[n]);
    const levels = Array.from(new Set(gE.filter((g) => g !== null))).sort();
    if (levels.length < 2) return { levels, note: "kurang dari dua kelompok" };
    const tauE = c.ei.map((i) => jm.tau[i]);
    const RR = root.RASCH_TEXT ? root.RASCH_TEXT.rules : { DIF_CONTRAST_MIN: 0.5, DIF_ETS_B: 0.43, DIF_ETS_C: 0.64 };
    const sizes = levels.map((g) => gE.filter((x) => x === g).length);
    const out = { levels, sizes, n_groups: levels.length, dichotomous: res.model === "dichotomous" };

    const pairTable = (theta, ga, gb) => {
      const sa = [], sb = []; gE.forEach((g, a) => { if (g === ga) sa.push(a); else if (gb === null ? g !== null : g === gb) sb.push(a); });
      const A = groupItemMeasures(c, tauE, sa, theta), B = groupItemMeasures(c, tauE, sb, theta);
      return c.names.map((nm, i) => {
        const w = welch(A.b[i] * scale, A.se[i] * scale, A.n[i], B.b[i] * scale, B.se[i] * scale, B.n[i]);
        return { item: nm, group_a: ga, group_b: gb === null ? "lainnya" : gb, measure_a: A.b[i] * scale, se_a: A.se[i] * scale, n_a: A.n[i],
          measure_b: B.b[i] * scale, se_b: B.se[i] * scale, n_b: B.n[i], contrast: w.contrast, joint_se: w.joint, t: w.t, df: w.df, p: w.p,
          mdc: RULES.DIF_POWER_Z * w.joint, extreme_a: A.extreme[i], extreme_b: B.extreme[i], b_a_raw: A.b[i], b_b_raw: B.b[i] };
      });
    };
    const finalize = (rows) => {
      const q = bhAdjust(rows.map((r) => r.p));
      rows.forEach((r, k) => {
        r.q = q[k];
        r.flag = Math.abs(r.contrast) >= RR.DIF_CONTRAST_MIN && r.q < RULES.DIF_Q;
        r.size = Math.abs(r.contrast) >= RR.DIF_ETS_C ? "C" : Math.abs(r.contrast) >= RR.DIF_ETS_B ? "B" : "A";
        r.detectable_large = r.mdc <= RULES.DIF_DETECT_TARGET;
      });
      return rows;
    };

    if (levels.length === 2) {
      const [ga, gb] = levels;
      // tahap 1: theta dari semua item; tahap 2+: theta dari item yang tidak ditandai (purifikasi)
      let rows = finalize(pairTable(c.theta, ga, gb));
      const initialFlags = rows.filter((r) => r.flag).map((r) => r.item);
      let flagged = new Set(initialFlags), iter = 0, thetaP = c.theta;
      while (iter < 5) {
        iter++;
        const anchor = c.names.map((_, i) => i).filter((i) => !flagged.has(c.names[i]));
        if (anchor.length === c.L || anchor.length < 2) break;
        thetaP = anchoredTheta(c, anchor);
        const rows2 = finalize(pairTable(thetaP, ga, gb));
        const f2 = new Set(rows2.filter((r) => r.flag).map((r) => r.item));
        rows = rows2;
        if (f2.size === flagged.size && [...f2].every((x) => flagged.has(x))) break;
        flagged = f2;
      }
      out.purification_iterations = iter; out.initial_flags = initialFlags;
      // Mantel-Haenszel dan regresi logistik (dikotomus), dicocokkan pada theta terpurifikasi
      if (res.model === "dichotomous") {
        const ref = ga;
        const valid = []; gE.forEach((g, a) => { if (g !== null) valid.push(a); });
        const K = Math.max(2, Math.min(RULES.MH_STRATA, Math.floor(valid.length / 30)));
        const cuts = []; const th = valid.map((a) => thetaP[a]);
        for (let k = 1; k < K; k++) cuts.push(quantile(th, k / K));
        const stratum = (t) => { let s = 0; while (s < cuts.length && t > cuts[s]) s++; return s; };
        rows.forEach((r, i) => {
          const T = Array.from({ length: K }, () => ({ A: 0, B: 0, C: 0, D: 0 }));
          const X = [], y = [];
          for (const a of valid) {
            const q = a * c.L + i; if (!c.obs[q]) continue;
            const s = T[stratum(thetaP[a])], x = c.X0[q], isRef = gE[a] === ref;
            if (isRef) { if (x === 1) s.A++; else s.B++; } else { if (x === 1) s.C++; else s.D++; }
            const g = isRef ? 0 : 1; X.push([1, thetaP[a], g, thetaP[a] * g]); y.push(x);
          }
          let sA = 0, sE = 0, sV = 0, sR = 0, sS = 0, v1 = 0, v2 = 0, v3 = 0;
          for (const s of T) {
            const n = s.A + s.B + s.C + s.D; if (n < 2) continue;
            const nR = s.A + s.B, nF = s.C + s.D, m1 = s.A + s.C, m0 = s.B + s.D;
            if (!nR || !nF) continue;
            sA += s.A; sE += nR * m1 / n; sV += nR * nF * m1 * m0 / (n * n * (n - 1));
            const Rk = s.A * s.D / n, Sk = s.B * s.C / n, Pk = (s.A + s.D) / n, Qk = (s.B + s.C) / n;
            sR += Rk; sS += Sk; v1 += Pk * Rk; v2 += Pk * Sk + Qk * Rk; v3 += Qk * Sk;
          }
          const alpha = sS > 0 ? sR / sS : NaN;
          const varLn = sR > 0 && sS > 0 ? v1 / (2 * sR * sR) + v2 / (2 * sR * sS) + v3 / (2 * sS * sS) : NaN;
          const chi = sV > 0 ? Math.max(Math.abs(sA - sE) - 0.5, 0) ** 2 / sV : NaN;
          const pMH = chi2Sf(chi, 1);
          const dMH = isF(alpha) && alpha > 0 ? -2.35 * Math.log(alpha) : NaN, seD = 2.35 * Math.sqrt(varLn);
          r.mh_alpha = alpha; r.mh_delta = dMH; r.mh_chi2 = chi; r.mh_p = pMH;
          r.mh_ets = !isF(dMH) ? "-" : Math.abs(dMH) >= 1.5 && (Math.abs(dMH) - 1) / seD > 1.645 ? "C" : Math.abs(dMH) < 1 || !(pMH < 0.05) ? "A" : "B";
          if (y.length >= 20 && y.some((v) => v) && y.some((v) => !v)) {
            const m0 = logistic(X.map((x) => [1]), y), m1 = logistic(X.map((x) => [1, x[1]]), y);
            const m2 = logistic(X.map((x) => [1, x[1], x[2]]), y), m3 = logistic(X, y);
            const n = y.length;
            r.lr_uniform_chi2 = 2 * (m2.ll - m1.ll); r.lr_uniform_p = chi2Sf(r.lr_uniform_chi2, 1);
            r.lr_nonuniform_chi2 = 2 * (m3.ll - m2.ll); r.lr_nonuniform_p = chi2Sf(r.lr_nonuniform_chi2, 1);
            r.lr_total_p = chi2Sf(2 * (m3.ll - m1.ll), 2);
            r.lr_delta_r2 = nagelkerke(m0.ll, m3.ll, n) - nagelkerke(m0.ll, m1.ll, n);
            r.lr_class = !(r.lr_total_p < 0.05) || r.lr_delta_r2 < RULES.LR_R2_B ? "A" : r.lr_delta_r2 < RULES.LR_R2_C ? "B" : "C";
          }
        });
        const q1 = bhAdjust(rows.map((r) => r.mh_p)), q2 = bhAdjust(rows.map((r) => r.lr_total_p));
        rows.forEach((r, k) => { r.mh_q = q1[k]; r.lr_q = q2[k]; });
        out.mh_strata = K;
      }
      // dampak kumulatif tingkat tes (DTF): selisih skor harapan dengan parameter kelompok
      const dtf = [];
      const eA = c.names.map((_, i) => Float64Array.from(c.delta[i], (v, k) => (k < c.m[i] ? v - (c.delta[i].slice(0, c.m[i]).reduce((s, x) => s + x, 0) / c.m[i]) + (isF(rows[i].b_a_raw) ? rows[i].b_a_raw : 0) : Infinity)));
      const eB = c.names.map((_, i) => Float64Array.from(c.delta[i], (v, k) => (k < c.m[i] ? v - (c.delta[i].slice(0, c.m[i]).reduce((s, x) => s + x, 0) / c.m[i]) + (isF(rows[i].b_b_raw) ? rows[i].b_b_raw : 0) : Infinity)));
      const okItems = c.names.map((_, i) => i).filter((i) => isF(rows[i].b_a_raw) && isF(rows[i].b_b_raw));
      const momA = E.moments(c.theta, okItems.map((i) => eA[i]), c.M), momB = E.moments(c.theta, okItems.map((i) => eB[i]), c.M);
      let sumW = 0; const Lk = okItems.length;
      for (let a = 0; a < c.N; a++) {
        let tA = 0, tB = 0;
        for (let j = 0; j < Lk; j++) { tA += momA.E[a * Lk + j]; tB += momB.E[a * Lk + j]; }
        dtf.push(tA - tB);
      }
      const thetaBar = mean(c.theta);
      const momBar = E.moments([thetaBar], okItems.map((i) => c.delta[i]), c.M);
      for (let j = 0; j < Lk; j++) sumW += momBar.W[j];
      const maxScore = okItems.reduce((s, i) => s + c.m[i], 0);
      out.dtf = { mean_diff: mean(dtf), sd_diff: sd(dtf), max_abs_diff: Math.max(...dtf.map(Math.abs)), max_score: maxScore,
        logit_equivalent: sumW > 0 ? mean(dtf) / sumW : NaN, favoured: mean(dtf) > 0 ? ga : gb,
        flagged_sum_contrast: rows.filter((r) => r.flag).reduce((s, r) => s + r.contrast, 0) };
      out.table = rows;
    } else {
      // lebih dari dua kelompok: setiap kelompok lawan sisanya + uji omnibus
      const per = levels.map((g) => finalize(pairTable(c.theta, g, null)));
      const omni = c.names.map((nm, i) => {
        const bs = [], ses = [];
        levels.forEach((g, k) => {
          const sel = []; gE.forEach((x, a) => { if (x === g) sel.push(a); });
          const G = groupItemMeasures(c, tauE, sel, c.theta);
          if (isF(G.b[i]) && isF(G.se[i])) { bs.push(G.b[i] * scale); ses.push(G.se[i] * scale); }
          void k;
        });
        const w = ses.map((s) => 1 / (s * s)), bw = bs.reduce((s, b, k) => s + b * w[k], 0) / w.reduce((s, v) => s + v, 0);
        const chi = bs.reduce((s, b, k) => s + (b - bw) ** 2 * w[k], 0);
        const rng = Math.max(...bs) - Math.min(...bs);
        return { item: nm, chi2: chi, df: bs.length - 1, p: chi2Sf(chi, bs.length - 1), range: rng,
          max_mdc: Math.max(...per.map((t) => t[i].mdc)) };
      });
      const q = bhAdjust(omni.map((r) => r.p));
      omni.forEach((r, k) => { r.q = q[k]; r.flag = r.q < RULES.DIF_Q && r.range >= RR.DIF_CONTRAST_MIN; });
      out.vs_rest = per.flat(); out.omnibus = omni;
    }
    const mdcs = (out.table || out.vs_rest).map((r) => r.mdc).filter(isF);
    out.mdc_median = median(mdcs);
    out.share_detectable = mdcs.filter((v) => v <= RULES.DIF_DETECT_TARGET).length / Math.max(mdcs.length, 1);
    // ukuran kelompok minimum agar DIF besar dapat dideteksi (proyeksi dari SE ~ 1/sqrt(n))
    if (levels.length === 2 && out.table) {
      const f = median(out.table.map((r) => r.mdc / RULES.DIF_DETECT_TARGET).filter(isF));
      out.n_factor_needed = isF(f) ? f * f : NaN;
    }
    return out;
  }

  // ------------------------------------------------------------------------------------
  // 8. Ekspor audit
  // ------------------------------------------------------------------------------------
  function residualMatrix(res) {
    const c = core(res);
    const z = res.coded.personIds.map(() => res.coded.itemNames.map(() => NaN));
    for (let a = 0; a < c.N; a++) for (let i = 0; i < c.L; i++) {
      const q = a * c.L + i; if (!c.obs[q]) continue;
      z[c.ep[a]][c.ei[i]] = (c.X0[q] - c.mom.E[q]) / Math.sqrt(Math.max(c.mom.W[q], 1e-12));
    }
    return { persons: res.coded.personIds, items: res.coded.itemNames, z };
  }


  // ------------------------------------------------------------------------------------
  // 9. Orkestrasi
  // ------------------------------------------------------------------------------------
  /**
   * Jalankan semua diagnostik lanjutan.
   * ctx: { origPrep, blocks, ms, treatment, scoringRaw, answers }
   * opts: { testType, nOptions, simReps, cmle, sensitivity, tailored, seed }
   * step(label, fraction): laporan kemajuan.
   */
  async function runAll(res, ctx, opts, step = () => {}, shouldCancel = () => false) {
    const t0 = Date.now();
    const timing = {};
    const time = async (key, label, fn) => {
      if (shouldCancel()) throw new Error("dibatalkan");
      step(label); await tick();
      const t = Date.now(); const v = await fn(); timing[key] = (Date.now() - t) / 1000; return v;
    };
    const adv = { opts: { ...opts }, blocks: ctx.blocks, ms: ctx.ms, treatment: ctx.treatment || "asis", timing };
    const prep = res.prep;
    const dich = res.model === "dichotomous", tes = opts.testType === "tes";
    adv.scored = ctx.scoringRaw ? await time("scored", "Penskoran person dengan item dijangkarkan (Ludlow & O'Leary)", () => scorePersonsAnchored(res, ctx.scoringRaw)) : null;
    adv.pq = await time("pq", "Kualitas respons person (lz*, Guttman, skor setara tebakan)", () => personQuality(res, ctx.ms, { nOptions: tes ? opts.nOptions : null }));
    adv.flags = itemFlags(res);
    adv.guess = guessingSignals(res);
    adv.belowChance = tes ? belowChance(res, opts.nOptions) : [];
    adv.distractors = ctx.answers ? await time("distractors", "Analisis distraktor", () => distractors(res, prep, ctx.answers, opts.nOptions)) : null;
    adv.rt = await time("rt", "Dekomposisi reliabilitas dan efisiensi informasi", () => reliabilityTargeting(res));
    if (opts.sensitivity !== false) {
      const under = adv.pq.rows.filter((r) => r.flag_underfit).map((r) => r.person);
      const both = adv.pq.rows.filter((r) => r.flag_underfit || r.flag_chance).map((r) => r.person);
      const sc = [{ label: "Tanpa person underfit", persons: under }];
      if (both.length > under.length) sc.push({ label: "Tanpa underfit dan skor setara tebakan", persons: both });
      adv.sens = await time("sens", "Analisis sensitivitas (jalankan ulang tanpa responden menyimpang)", () => sensitivity(res, prep, sc));
    }
    if (tes && dich && opts.tailored !== false) {
      const c = opts.nOptions >= 2 ? 1 / opts.nOptions : RULES.TAILOR_DEFAULT_C;
      adv.tailored = await time("tailored", "Tailored analysis (Andrich, Marais & Humphry, 2012)", () => tailoredAnalysis(res, prep, c));
    }
    if (opts.simReps > 0) {
      adv.sim = await time("sim", `Simulasi ${opts.simReps} data patuh model (ambang eigenvalue/Q3, pemulihan parameter)`,
        () => simulate(res, prep, opts.simReps, { seed: opts.seed, shouldCancel, progress: (k, n) => step(`Simulasi ${k}/${n}`, k / n) }));
    }
    adv.dim = await time("dim", "Dimensionalitas lanjutan (disattenuated correlation, uji t Smith, testlet)", () => dimensionExtras(res, ctx.blocks, adv.sim || null));
    if (prep.groupValues) adv.dif = await time("dif", "DIF lanjutan (MDC, purifikasi, Mantel-Haenszel, regresi logistik, DTF)", () => difExtras(res, prep));
    const CM = root.RaschCMLE;
    if (opts.cmle && CM) {
      adv.cmle = await time("cmle", "CMLE pembanding", async () => {
        try { return await CM.estimateAsync(res, { shouldCancel, seProgress: (k, n) => step(`CMLE: standard error ${k}/${n}`, k / n) }); }
        catch (err) { return { error: err.message || String(err) }; }
      });
    }
    adv.seconds = (Date.now() - t0) / 1000;
    return adv;
  }

  const api = {
    RULES, runAll, setEngine, detectBlocks, blockPrefix, missingStructure, applyTreatment, scorePersonsAnchored, personQuality, sensitivity,
    itemFlags, guessingSignals, tailoredAnalysis, normAnswer, findKeyRow, scoreWithKey, distractors, belowChance, simulate,
    dimensionExtras, calibrateBlocks, reliabilityTargeting, difExtras, residualMatrix, prepFromRaw, core,
    // utilitas (diuji)
    bhAdjust, chi2Sf, gammaP, binomUpper, spearman, pearson, quantile, wilson, logistic, rng, codeLookup,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RaschAdvanced = api;
})(typeof window !== "undefined" ? window : globalThis);
