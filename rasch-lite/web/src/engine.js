/* RaschLite engine (JavaScript): padanan langsung paket Python raschlite.core.
 *
 * Setiap fungsi di sini memiliki pasangan di core/*.py dengan nama yang serupa; urutan
 * operasi dipertahankan agar hasil numerik sama dengan versi desktop (diuji terhadap
 * golden file yang dibangkitkan dari engine Python, lihat web/test/).
 *
 * Tidak ada akses jaringan dan tidak ada dependensi pihak ketiga. Teks pesan untuk
 * pengguna diambil dari objek TEXT yang diekspor dari modul Python saat build.
 */
(function (root) {
  "use strict";

  const EXTREME_SCORE_ADJUSTMENT = 0.3;
  const PROX_EXPANSION = 2.89;
  const TINY = 1e-12;
  const Z_ONE_SIDED_05 = 1.6448536269514722; // ndtri(0.95)
  const MODELS = ["dichotomous", "rsm", "pcm"];

  let TEXT = root.RASCH_TEXT || null;
  function setText(t) { TEXT = t; }
  function M(key) { return TEXT.messages[key]; }

  // ------------------------------------------------------------------------------------
  // Format ala str.format Python: {name}, {name:.4f}
  // ------------------------------------------------------------------------------------
  function pyFormat(template, args) {
    return template.replace(/\{(\w+)(?::\.(\d+)f)?\}/g, function (_, name, dec) {
      const v = args[name];
      if (dec !== undefined) return Number(v).toFixed(Number(dec));
      return String(v);
    });
  }

  class DataValidationError extends Error {
    constructor(message, details) { super(message); this.name = "DataValidationError"; this.details = details || {}; }
  }
  class EstimationCancelled extends Error {
    constructor() { super("cancelled"); this.name = "EstimationCancelled"; }
  }

  function issue(level, code, message, details) { return { level, code, message, details: details || {} }; }

  // ------------------------------------------------------------------------------------
  // Utilitas numerik
  // ------------------------------------------------------------------------------------
  const isNum = (v) => typeof v === "number";
  const finite = (v) => typeof v === "number" && isFinite(v);
  function clip(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function sortedUniqueNumbers(arr) {
    const s = Array.from(new Set(arr)); s.sort((a, b) => a - b); return s;
  }

  /** Solusi sistem linear kecil (eliminasi Gauss, pivot parsial). null bila singular. */
  function solve(A, b) {
    const n = b.length;
    const a = A.map((r) => r.slice());
    const x = b.slice();
    for (let c = 0; c < n; c++) {
      let p = c, best = Math.abs(a[c][c]);
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > best) { best = Math.abs(a[r][c]); p = r; }
      if (best === 0 || !isFinite(best)) return null;
      if (p !== c) { const t = a[p]; a[p] = a[c]; a[c] = t; const u = x[p]; x[p] = x[c]; x[c] = u; }
      for (let r = c + 1; r < n; r++) {
        const f = a[r][c] / a[c][c];
        if (f === 0) continue;
        for (let k = c; k < n; k++) a[r][k] -= f * a[c][k];
        x[r] -= f * x[c];
      }
    }
    for (let c = n - 1; c >= 0; c--) {
      let s = x[c];
      for (let k = c + 1; k < n; k++) s -= a[c][k] * x[k];
      x[c] = s / a[c][c];
    }
    return x;
  }

  function inverse(A) {
    const n = A.length;
    const cols = [];
    for (let j = 0; j < n; j++) {
      const e = new Array(n).fill(0); e[j] = 1;
      const c = solve(A, e);
      if (c === null) return null;
      cols.push(c);
    }
    const inv = [];
    for (let i = 0; i < n; i++) { inv.push([]); for (let j = 0; j < n; j++) inv[i].push(cols[j][i]); }
    return inv;
  }

  /** Dekomposisi eigen matriks simetris (Jacobi siklik). Nilai menurun beserta vektornya. */
  function symmetricEigen(A) {
    const n = A.length;
    const a = A.map((r) => Float64Array.from(r));
    const v = [];
    for (let i = 0; i < n; i++) { const r = new Float64Array(n); r[i] = 1; v.push(r); }
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off < 1e-22) break;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = a[p][q];
          if (Math.abs(apq) < 1e-300) continue;
          const theta = (a[q][q] - a[p][p]) / (2 * apq);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = a[p][k], aqk = a[q][k];
            a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = v[k][p], vkq = v[k][q];
            v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const vals = [];
    for (let i = 0; i < n; i++) vals.push(a[i][i]);
    const order = vals.map((_, i) => i).sort((i, j) => vals[j] - vals[i]);
    return {
      values: order.map((i) => vals[i]),
      vectors: order.map((i) => v.map((row) => row[i])), // vectors[k] = vektor eigen ke-k
    };
  }

  // --- Distribusi -----------------------------------------------------------------------
  function lgamma(x) {
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
      1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  function betacf(a, b, x) {
    const FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 1000; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }

  /** Fungsi beta tak lengkap teregularisasi I_x(a, b). */
  function betainc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
    const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return front * betacf(a, b, x) / a;
    return 1 - front * betacf(b, a, 1 - x) / b;
  }

  function erfc(x) {
    // Pendekatan Chebyshev (Numerical Recipes erfcc), galat relatif < 1.2e-7.
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 +
      t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  function ndtr(x) { return 0.5 * erfc(-x / Math.SQRT2); }

  /** CDF Student t, setara scipy.special.stdtr(df, t). */
  function stdtr(df, t) {
    if (Number.isNaN(df) || Number.isNaN(t) || !(df > 0)) return NaN;
    if (df === Infinity) return ndtr(t);
    if (t === Infinity) return 1;
    if (t === -Infinity) return 0;
    const x = df / (df + t * t);
    const tail = 0.5 * betainc(df / 2, 0.5, x);
    return t < 0 ? tail : 1 - tail;
  }

  /** Kuantil Student t, setara scipy.special.stdtrit(df, p) (bisection). */
  function stdtrit(df, p) {
    let lo = -1e3, hi = 1e3;
    for (let k = 0; k < 200; k++) {
      const mid = 0.5 * (lo + hi);
      if (stdtr(df, mid) < p) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  // ------------------------------------------------------------------------------------
  // Membaca tabel: {columns: [...], rows: [[...]]}; sel berupa string, number, atau null
  // ------------------------------------------------------------------------------------
  function sniffDelimiter(text) {
    const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length).slice(0, 50);
    let best = ",", bestScore = -1;
    for (const d of [",", ";", "\t", "|"]) {
      const counts = lines.map((l) => splitCsvLine(l, d).length);
      if (!counts.length || counts[0] < 2) continue;
      const consistent = counts.filter((c) => c === counts[0]).length;
      const score = consistent * 1000 + counts[0];
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  function splitCsvLine(line, d) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  /** Parser CSV lengkap (kutip, baris baru di dalam kutip, BOM). */
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const d = sniffDelimiter(text);
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); rows.push(row); row = []; cur = "";
      } else cur += ch;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ""));
    const columns = nonEmpty.shift() || [];
    const body = nonEmpty.map((r) => columns.map((_, j) => (j < r.length ? r[j] : "")));
    return { columns: columns.map((c, j) => (c === "" ? `Unnamed: ${j}` : c)), rows: body, delimiter: d };
  }

  // ------------------------------------------------------------------------------------
  // Validasi data (core/data.py: prepare_data)
  // ------------------------------------------------------------------------------------
  function cellToken(v) {
    if (v === null || v === undefined) return "";
    if (isNum(v)) {
      if (Number.isNaN(v)) return "";
      if (Number.isInteger(v)) return String(v);
      return String(v);
    }
    return String(v).trim().toLowerCase();
  }

  function missingTokens(codes) {
    const tokens = new Set(["", "na", "nan", "none", "null"]);
    for (const code of codes || []) {
      const s = String(code).trim().toLowerCase();
      if (!s) continue;
      tokens.add(s);
      const f = parsePyFloat(s);
      if (f !== null && Number.isInteger(f)) tokens.add(String(f));
    }
    return tokens;
  }

  const FLOAT_RE = /^[+-]?((\d[\d_]*)(\.(\d[\d_]*)?)?|\.(\d[\d_]*))([eE][+-]?\d+)?$/;
  function parsePyFloat(s) {
    const t = String(s).trim();
    const low = t.toLowerCase();
    if (/^[+-]?(inf|infinity)$/.test(low)) return low.startsWith("-") ? -Infinity : Infinity;
    if (/^[+-]?nan$/.test(low)) return NaN;
    if (!FLOAT_RE.test(t)) return null;
    return Number(t.replace(/_/g, ""));
  }

  function displayId(v, n) {
    const tok = cellToken(v);
    if (tok === "") return `baris ${n + 2}`;
    if (isNum(v) && Number.isInteger(v)) return String(v);
    return String(v).trim();
  }

  function examples(values, k = 5) {
    const shown = values.slice(0, k).map(String).join(", ");
    return shown + (values.length > k ? " ..." : "");
  }

  function prepareData(table, opts) {
    const itemCols = opts.itemCols.slice();
    const idCol = opts.idCol ?? null, groupCol = opts.groupCol ?? null;
    const maxErr = opts.maxErrorExamples ?? 5;
    if (itemCols.length < 2) throw new DataValidationError(M("TOO_FEW_ITEMS"));
    const colIndex = new Map(table.columns.map((c, j) => [String(c), j]));
    const missingCols = [...itemCols, idCol, groupCol].filter((c) => c !== null && !colIndex.has(String(c)));
    if (missingCols.length) throw new DataValidationError(pyFormat(M("COLUMN_NOT_FOUND"), { cols: missingCols.join(", ") }));
    if (idCol !== null && itemCols.includes(idCol)) throw new DataValidationError(M("ID_IS_ITEM"));
    if (groupCol !== null && itemCols.includes(groupCol)) throw new DataValidationError(M("GROUP_IS_ITEM"));

    const tokens = missingTokens(opts.missingCodes);
    const N0 = table.rows.length, L0 = itemCols.length;
    let raw = [];
    for (let n = 0; n < N0; n++) raw.push(new Array(L0).fill(NaN));
    const bad = []; let nBad = 0;
    for (let j = 0; j < L0; j++) {
      const cj = colIndex.get(String(itemCols[j]));
      for (let n = 0; n < N0; n++) {
        const v = table.rows[n][cj];
        if (tokens.has(cellToken(v))) continue;
        let f = isNum(v) ? v : parsePyFloat(String(v).trim().replace(",", "."));
        if (f === null) f = NaN;
        if (!isFinite(f) || !Number.isInteger(f)) {
          nBad++;
          if (bad.length < maxErr) bad.push([n + 2, String(itemCols[j]), String(v)]);
          continue;
        }
        raw[n][j] = f;
      }
    }
    if (nBad) {
      const ex = bad.map(([r, c, v]) => pyFormat(M("BAD_VALUE_EXAMPLE"), { row: r, col: c, value: v })).join("; ");
      throw new DataValidationError(pyFormat(M("NON_INTEGER"), { n: nBad, examples: ex }), { count: nBad, examples: bad });
    }
    const issues = [];
    let ids;
    if (idCol !== null) {
      const ci = colIndex.get(String(idCol));
      ids = table.rows.map((r, n) => displayId(r[ci], n));
    } else ids = table.rows.map((_, n) => "P" + String(n + 1).padStart(4, "0"));

    let itemNames = itemCols.map(String);
    const keep = [], excludedItems = [];
    for (let j = 0; j < L0; j++) {
      const vals = new Set();
      for (let n = 0; n < N0; n++) if (!Number.isNaN(raw[n][j])) vals.add(raw[n][j]);
      if (vals.size < 2) excludedItems.push(itemNames[j]); else keep.push(j);
    }
    if (excludedItems.length) {
      issues.push(issue("warning", "item_no_variance", pyFormat(M("ITEM_NO_VARIANCE"), { items: excludedItems.join(", ") }),
        { items: excludedItems }));
    }
    if (keep.length < 2) throw new DataValidationError(M("TOO_FEW_VALID_ITEMS"));
    raw = raw.map((r) => keep.map((j) => r[j]));
    itemNames = keep.map((j) => itemNames[j]);
    const L = itemNames.length;

    const nObs = raw.map((r) => r.filter((v) => !Number.isNaN(v)).length);
    const empty = nObs.map((c) => c === 0);
    const excludedPersons = ids.filter((_, n) => empty[n]);
    if (excludedPersons.length) {
      issues.push(issue("warning", "person_no_response", pyFormat(M("PERSON_NO_RESPONSE"), { n: excludedPersons.length }),
        { persons: excludedPersons }));
    }
    const heavy = nObs.map((c, n) => 1 - c / L > 0.5 && !empty[n]);
    if (heavy.some(Boolean)) {
      const listed = ids.filter((_, n) => heavy[n]);
      issues.push(issue("warning", "person_heavy_missing",
        pyFormat(M("PERSON_HEAVY_MISSING"), { n: listed.length, examples: examples(listed) }), { persons: listed }));
    }
    const keepP = empty.map((e) => !e);
    raw = raw.filter((_, n) => keepP[n]);
    ids = ids.filter((_, n) => keepP[n]);

    let groups = null;
    if (groupCol !== null) {
      const gi = colIndex.get(String(groupCol));
      const g = table.rows.filter((_, n) => keepP[n]).map((r) => {
        const v = r[gi];
        return tokens.has(cellToken(v)) ? null : String(v).trim();
      });
      const levels = Array.from(new Set(g.filter((v) => v !== null))).sort();
      if (levels.length !== 2) {
        issues.push(issue("warning", "dif_group_levels", pyFormat(M("DIF_GROUP_LEVELS"), { col: groupCol, k: levels.length }),
          { levels }));
      } else {
        groups = g;
        const nm = g.filter((v) => v === null).length;
        if (nm) issues.push(issue("info", "dif_group_missing", pyFormat(M("DIF_GROUP_MISSING"), { n: nm })));
      }
    }
    const det = detectModel(raw, itemNames);
    if (det.responseType === "dichotomous") {
      const vals = sortedUniqueNumbers(raw.flat().filter((v) => !Number.isNaN(v)));
      if (!(vals[0] === 0 && vals[1] === 1)) {
        issues.push(issue("info", "dichotomous_recode", pyFormat(M("DICHOTOMOUS_RECODE"), { lo: vals[0], hi: vals[1] })));
      }
    }
    return {
      personIds: ids, itemNames, raw, groups, groupName: groups !== null ? groupCol : null,
      responseType: det.responseType, recommendedModel: det.recommended, recommendationReason: det.reason,
      issues, excludedItems, excludedPersons,
      get nPersons() { return this.raw.length; }, get nItems() { return this.itemNames.length; },
    };
  }

  function detectModel(raw, itemNames) {
    const values = sortedUniqueNumbers(raw.flat().filter((v) => !Number.isNaN(v)));
    if (values.length === 2) return { responseType: "dichotomous", recommended: "dichotomous", reason: M("RECOMMEND_DICHOTOMOUS") };
    const L = itemNames.length;
    const ranges = [];
    for (let j = 0; j < L; j++) {
      let lo = Infinity, hi = -Infinity;
      for (const r of raw) { const v = r[j]; if (!Number.isNaN(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      ranges.push([lo, hi]);
    }
    const key = (r) => r[0] + "|" + r[1];
    const distinct = Array.from(new Map(ranges.map((r) => [key(r), r])).values())
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (distinct.length === 1) {
      const [lo, hi] = distinct[0];
      return { responseType: "polytomous", recommended: "rsm", reason: pyFormat(M("RECOMMEND_RSM"), { lo, hi }) };
    }
    const ex = distinct.slice(0, 3).map(([lo, hi]) => {
      const names = itemNames.filter((_, j) => ranges[j][0] === lo && ranges[j][1] === hi);
      return pyFormat(M("RANGE_EXAMPLE"), { items: examples(names, 3), lo, hi });
    });
    return { responseType: "polytomous", recommended: "pcm", reason: pyFormat(M("RECOMMEND_PCM"), { examples: ex.join("; ") }) };
  }

  // ------------------------------------------------------------------------------------
  // Pengodean kategori (core/data.py: category_issues, code_responses)
  // ------------------------------------------------------------------------------------
  function categoryIssues(prep, model) {
    const raw = prep.raw;
    const obsVals = raw.flat().filter((v) => !Number.isNaN(v));
    const issues = [];
    if (model === "dichotomous") return issues;
    const all = sortedUniqueNumbers(obsVals);
    const lo = all[0], hi = all[all.length - 1];
    const allSet = new Set(all);
    const gaps = [];
    for (let v = lo; v <= hi; v++) if (!allSet.has(v)) gaps.push(v);
    if (gaps.length) issues.push(issue("warning", "unused_category_global",
      pyFormat(M("UNUSED_CATEGORY_GLOBAL"), { cats: gaps.join(", "), lo, hi }), { categories: gaps }));
    prep.itemNames.forEach((name, j) => {
      const used = new Set(raw.map((r) => r[j]).filter((v) => !Number.isNaN(v)));
      const unused = all.filter((v) => !used.has(v));
      if (!unused.length) return;
      if (model === "pcm") {
        issues.push(issue("warning", "unused_category_item",
          pyFormat(M("UNUSED_CATEGORY_ITEM"), { item: name, cats: unused.join(", "), k: used.size }),
          { item: name, categories: unused }));
      } else {
        issues.push(issue("info", "unused_category_item_rsm",
          pyFormat(M("UNUSED_CATEGORY_ITEM_RSM"), { item: name, cats: unused.join(", ") }), { item: name, categories: unused }));
      }
    });
    return issues;
  }

  function codeGlobal(rawCols) {
    // rawCols: array baris (N) x kolom; kembalikan kode dan nilai urut
    const values = sortedUniqueNumbers(rawCols.flat().filter((v) => !Number.isNaN(v)));
    const lut = new Map(values.map((v, k) => [v, k]));
    const X = rawCols.map((r) => r.map((v) => (Number.isNaN(v) ? NaN : lut.get(v))));
    return { X, values };
  }

  function findExtremes(X, m, itemStatus) {
    const N = X.length, L = m.length;
    let p = new Array(N).fill(0);
    let it = itemStatus.map((s) => (s === 2 ? 2 : 0));
    const classify = (score, maxs, cnt) => (cnt === 0 ? 2 : score === 0 ? -1 : score === maxs ? 1 : 0);
    for (;;) {
      const newP = p.slice();
      for (let n = 0; n < N; n++) {
        if (p[n] !== 0) continue;
        let s = 0, mx = 0, c = 0;
        for (let i = 0; i < L; i++) {
          if (it[i] !== 0) continue;
          const v = X[n][i];
          if (!Number.isNaN(v)) { s += v; mx += m[i]; c++; }
        }
        newP[n] = classify(s, mx, c);
      }
      const newI = it.slice();
      for (let i = 0; i < L; i++) {
        if (it[i] !== 0) continue;
        let s = 0, c = 0;
        for (let n = 0; n < N; n++) {
          if (newP[n] !== 0) continue;
          const v = X[n][i];
          if (!Number.isNaN(v)) { s += v; c++; }
        }
        newI[i] = classify(s, c * m[i], c);
      }
      const same = newP.every((v, k) => v === p[k]) && newI.every((v, k) => v === it[k]);
      if (same) return { p, it };
      p = newP; it = newI;
    }
  }

  function collapseMap(counts) {
    if (counts.every((c) => c > 0)) return null;
    const keep = counts.map((c) => c > 0);
    if (keep.filter(Boolean).length < 2) return null;
    let acc = 0;
    return keep.map((k) => { if (k) acc++; return Math.max(acc - 1, 0); });
  }
  function mergedLabels(old, newCodes) {
    const max = Math.max(...newCodes);
    const out = Array.from({ length: max + 1 }, () => []);
    old.forEach((grp, k) => out[newCodes[k]].push(...grp));
    return out;
  }
  function labelText(labels) { return labels.map((g) => g.join("+")).join(", "); }

  function codeResponses(prep, model) {
    if (!MODELS.includes(model)) throw new Error(`model tidak dikenal: ${model}`);
    const raw = prep.raw;
    const N = raw.length, L = prep.itemNames.length;
    const issues = categoryIssues(prep, model);
    if (model === "dichotomous" && prep.responseType !== "dichotomous") throw new DataValidationError(M("NOT_DICHOTOMOUS"));
    let X, labels, m;
    if (model === "dichotomous" || model === "rsm") {
      const g = codeGlobal(raw);
      X = g.X;
      labels = Array.from({ length: L }, () => g.values.map((v) => [v]));
      m = new Array(L).fill(g.values.length - 1);
    } else {
      X = raw.map((r) => r.map(() => NaN));
      labels = []; m = [];
      for (let j = 0; j < L; j++) {
        const g = codeGlobal(raw.map((r) => [r[j]]));
        for (let n = 0; n < N; n++) X[n][j] = g.X[n][0];
        labels.push(g.values.map((v) => [v]));
        m.push(g.values.length - 1);
      }
    }
    const itemStatus = new Array(L).fill(0);
    let ext;
    for (;;) {
      ext = findExtremes(X, m, itemStatus);
      const estP = ext.p.map((v) => v === 0), estI = ext.it.map((v) => v === 0);
      let changed = false;
      if (model === "rsm") {
        const Mx = Math.max(...m);
        const counts = new Array(Mx + 1).fill(0);
        for (let n = 0; n < N; n++) if (estP[n]) for (let i = 0; i < L; i++) if (estI[i]) {
          const v = X[n][i]; if (!Number.isNaN(v)) counts[v]++;
        }
        const nc = collapseMap(counts);
        if (nc !== null) {
          const merged = mergedLabels(labels[0], nc);
          issues.push(issue("warning", "collapse_category", pyFormat(M("COLLAPSE_RSM"), { cats: labelText(merged) }), { labels: merged }));
          X = X.map((r) => r.map((v) => (Number.isNaN(v) ? NaN : nc[v])));
          labels = Array.from({ length: L }, () => merged);
          m = m.map(() => merged.length - 1);
          changed = true;
        }
      } else if (model === "pcm") {
        for (let j = 0; j < L; j++) {
          if (!estI[j]) continue;
          const counts = new Array(m[j] + 1).fill(0);
          for (let n = 0; n < N; n++) if (estP[n]) { const v = X[n][j]; if (!Number.isNaN(v)) counts[v]++; }
          const nc = collapseMap(counts);
          if (nc !== null) {
            const merged = mergedLabels(labels[j], nc);
            issues.push(issue("warning", "collapse_category",
              pyFormat(M("COLLAPSE_PCM"), { item: prep.itemNames[j], cats: labelText(merged) }),
              { item: prep.itemNames[j], labels: merged }));
            for (let n = 0; n < N; n++) { const v = X[n][j]; if (!Number.isNaN(v)) X[n][j] = nc[v]; }
            labels[j] = merged;
            m[j] = merged.length - 1;
            changed = true;
          }
        }
        const pcmExt = [];
        for (let j = 0; j < L; j++) if ((ext.it[j] === -1 || ext.it[j] === 1) && itemStatus[j] !== 2) pcmExt.push(j);
        if (pcmExt.length) {
          const names = pcmExt.map((j) => prep.itemNames[j]);
          issues.push(issue("warning", "pcm_extreme_item", pyFormat(M("PCM_EXTREME_ITEM"), { items: names.join(", ") }), { items: names }));
          pcmExt.forEach((j) => { itemStatus[j] = 2; });
          changed = true;
        }
      }
      if (!changed) break;
    }
    const pExt = ext.p, iExt = ext.it;
    const unestItems = prep.itemNames.filter((_, j) => iExt[j] === 2 && itemStatus[j] !== 2);
    if (unestItems.length) issues.push(issue("warning", "item_not_estimable",
      pyFormat(M("ITEM_NOT_ESTIMABLE"), { items: unestItems.join(", ") }), { items: unestItems }));
    const nExtP = pExt.filter((v) => v === -1 || v === 1).length;
    if (nExtP) issues.push(issue("info", "extreme_persons", pyFormat(M("EXTREME_PERSONS"),
      { n: nExtP, n_min: pExt.filter((v) => v === -1).length, n_max: pExt.filter((v) => v === 1).length })));
    const unestP = prep.personIds.filter((_, n) => pExt[n] === 2);
    if (unestP.length) issues.push(issue("warning", "person_not_estimable",
      pyFormat(M("PERSON_NOT_ESTIMABLE"), { n: unestP.length, examples: examples(unestP) }), { persons: unestP }));
    const extItems = prep.itemNames.filter((_, j) => iExt[j] === -1 || iExt[j] === 1);
    if (extItems.length) issues.push(issue("warning", "extreme_items",
      pyFormat(M("EXTREME_ITEMS"), { items: extItems.join(", ") }), { items: extItems }));
    if (pExt.filter((v) => v === 0).length < 2 || iExt.filter((v) => v === 0).length < 2) {
      throw new DataValidationError(M("TOO_FEW_NONEXTREME"));
    }
    return {
      model, personIds: prep.personIds, itemNames: prep.itemNames.slice(), X, m: m.slice(),
      categoryLabels: labels.map((il) => il.map((grp) => grp.join("+"))),
      personExtreme: pExt, itemExtreme: iExt, groups: prep.groups, issues,
    };
  }

  // ------------------------------------------------------------------------------------
  // Model (core/model.py) dalam bentuk matriks datar
  // ------------------------------------------------------------------------------------
  /**
   * Momen untuk theta (n) dan delta (L baris, panjang M, Infinity di atas m_i).
   * Mengembalikan P (n*L*(M+1)), E, W (n*L), G (n*L*M), dan C (opsional).
   */
  function moments(theta, delta, M, withC) {
    const n = theta.length, L = delta.length, K = M + 1;
    const P = new Float64Array(n * L * K), E = new Float64Array(n * L), W = new Float64Array(n * L);
    const G = new Float64Array(n * L * M);
    const C = withC ? new Float64Array(n * L) : null;
    const cum = delta.map((row) => {
      const c = new Float64Array(K);
      for (let k = 1; k < K; k++) c[k] = c[k - 1] + row[k - 1];
      return c;
    });
    const psi = new Float64Array(K);
    for (let p = 0; p < n; p++) {
      const t = theta[p];
      for (let i = 0; i < L; i++) {
        const c = cum[i];
        let mx = -Infinity;
        for (let k = 0; k < K; k++) { const v = t * k - c[k]; psi[k] = v; if (v > mx) mx = v; }
        let s = 0;
        const base = (p * L + i) * K;
        for (let k = 0; k < K; k++) { const e = Math.exp(psi[k] - mx); P[base + k] = e; s += e; }
        let e1 = 0, e2 = 0;
        for (let k = 0; k < K; k++) { const q = P[base + k] / s; P[base + k] = q; e1 += q * k; e2 += q * k * k; }
        const idx = p * L + i;
        E[idx] = e1;
        const w = e2 - e1 * e1;
        W[idx] = w > 0 ? w : 0;
        let acc = 0;
        const gb = idx * M;
        for (let k = K - 1; k >= 1; k--) { acc += P[base + k]; G[gb + k - 1] = acc; }
        if (C) {
          let c4 = 0;
          for (let k = 0; k < K; k++) { const d = k - e1; c4 += P[base + k] * d * d * d * d; }
          C[idx] = c4;
        }
      }
    }
    return { P, E, W, G, C, n, L, M };
  }

  function buildDelta(b, tau, m, M) {
    // tau: array baris (L x M) atau satu baris (M) yang dipakai bersama
    const shared = !Array.isArray(tau[0]) && !(tau[0] instanceof Float64Array);
    return b.map((bi, i) => {
      const row = new Float64Array(M);
      for (let k = 0; k < M; k++) {
        const t = shared ? tau[k] : tau[i][k];
        row[k] = k + 1 <= m[i] ? bi + t : Infinity;
      }
      return row;
    });
  }

  // ------------------------------------------------------------------------------------
  // JMLE (core/jmle.py)
  // ------------------------------------------------------------------------------------
  function prox(X0, obs, m, N, L, maxIter = 10, tol = 0.01) {
    const rp = new Float64Array(N), maxp = new Float64Array(N), cntp = new Float64Array(N);
    const ri = new Float64Array(L), maxi = new Float64Array(L), cnti = new Float64Array(L);
    for (let n = 0; n < N; n++) for (let i = 0; i < L; i++) {
      const k = n * L + i;
      if (!obs[k]) continue;
      rp[n] += X0[k]; maxp[n] += m[i]; cntp[n] += 1; ri[i] += X0[k]; cnti[i] += 1;
    }
    for (let i = 0; i < L; i++) maxi[i] = cnti[i] * m[i];
    const x = Array.from(rp, (r, n) => Math.log(r / (maxp[n] - r)));
    const y = Array.from(ri, (r, i) => Math.log((maxi[i] - r) / r));
    const ym = mean(y);
    let d = y.map((v) => v - ym);
    let theta = x.slice();
    for (let it = 0; it < maxIter; it++) {
      const th = new Array(N);
      for (let n = 0; n < N; n++) {
        let s = 0, s2 = 0;
        for (let i = 0; i < L; i++) if (obs[n * L + i]) { s += d[i]; s2 += d[i] * d[i]; }
        const mu = s / cntp[n];
        const v = Math.max(s2 / cntp[n] - mu * mu, 0);
        th[n] = mu + Math.sqrt(1 + v / PROX_EXPANSION) * x[n];
      }
      theta = th;
      const dn = new Array(L);
      for (let i = 0; i < L; i++) {
        let s = 0, s2 = 0;
        for (let n = 0; n < N; n++) if (obs[n * L + i]) { s += theta[n]; s2 += theta[n] * theta[n]; }
        const mu = s / cnti[i];
        const v = Math.max(s2 / cnti[i] - mu * mu, 0);
        dn[i] = mu + Math.sqrt(1 + v / PROX_EXPANSION) * y[i];
      }
      const dm = mean(dn);
      for (let i = 0; i < L; i++) dn[i] -= dm;
      let maxd = 0;
      for (let i = 0; i < L; i++) maxd = Math.max(maxd, Math.abs(dn[i] - d[i]));
      d = dn;
      if (maxd < tol) break;
    }
    if (!(theta.every(isFinite) && d.every(isFinite))) { theta = x; d = y.map((v) => v - ym); }
    return { theta, d };
  }

  function initialTau(Xe, obs, m, model, N, L, M) {
    const tau = Array.from({ length: L }, () => new Float64Array(M));
    if (model === "dichotomous") return tau;
    if (model === "rsm") {
      const counts = new Array(M + 1).fill(0);
      for (let k = 0; k < N * L; k++) if (obs[k]) counts[Xe[k]]++;
      const t = []; for (let k = 0; k < M; k++) t.push(Math.log(counts[k] / counts[k + 1]));
      const tm = mean(t);
      tau.forEach((row) => { for (let k = 0; k < M; k++) row[k] = t[k] - tm; });
      return tau;
    }
    for (let i = 0; i < L; i++) {
      const counts = new Array(m[i] + 1).fill(0);
      for (let n = 0; n < N; n++) { const k = n * L + i; if (obs[k]) counts[Xe[k]]++; }
      const t = []; for (let k = 0; k < m[i]; k++) t.push(Math.log(counts[k] / counts[k + 1]));
      const tm = mean(t);
      for (let k = 0; k < m[i]; k++) tau[i][k] = t[k] - tm;
    }
    return tau;
  }

  /** Matriks informasi threshold per item: sum_n [G_max(j,k) - G_j G_k] (L x M x M). */
  function blockInformation(mom, obs) {
    const { n, L, M, G } = mom;
    const J = Array.from({ length: L }, () => Array.from({ length: M }, () => new Float64Array(M)));
    for (let p = 0; p < n; p++) for (let i = 0; i < L; i++) {
      if (!obs[p * L + i]) continue;
      const gb = (p * L + i) * M;
      const Ji = J[i];
      for (let j = 0; j < M; j++) {
        const gj = G[gb + j];
        for (let k = 0; k < M; k++) Ji[j][k] += G[gb + Math.max(j, k)] - gj * G[gb + k];
      }
    }
    return J;
  }

  function estimate(coded, options = {}) {
    // Versi sinkron; lihat estimateAsync untuk antarmuka.
    const gen = jmleSteps(coded, options);
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
  }

  async function estimateAsync(coded, options = {}) {
    const gen = jmleSteps(coded, options);
    let r = gen.next();
    while (!r.done) {
      if (options.shouldCancel && options.shouldCancel()) throw new EstimationCancelled();
      await new Promise((res) => setTimeout(res, 0));
      r = gen.next();
    }
    return r.value;
  }

  function* jmleSteps(coded, options) {
    const maxIter = options.maxIter ?? 500, convChange = options.convChange ?? 0.001, convResid = options.convResid ?? 0.01;
    const model = coded.model;
    const X = coded.X, Nall = X.length, Lall = coded.m.length;
    const mAll = coded.m, Mall = Math.max(...mAll);
    const epIdx = [], eiIdx = [];
    coded.personExtreme.forEach((v, n) => { if (v === 0) epIdx.push(n); });
    coded.itemExtreme.forEach((v, i) => { if (v === 0) eiIdx.push(i); });
    const N = epIdx.length, L = eiIdx.length;
    const m = eiIdx.map((i) => mAll[i]);
    const Mx = Math.max(...m);
    const X0 = new Float64Array(N * L), obs = new Uint8Array(N * L);
    for (let a = 0; a < N; a++) for (let c = 0; c < L; c++) {
      const v = X[epIdx[a]][eiIdx[c]];
      if (!Number.isNaN(v)) { X0[a * L + c] = v; obs[a * L + c] = 1; }
    }
    const valid = (i, k) => k + 1 <= m[i];
    // S_ik = jumlah respons >= k (k = 1..M)
    const S = Array.from({ length: L }, () => new Float64Array(Mx));
    for (let a = 0; a < N; a++) for (let i = 0; i < L; i++) {
      const q = a * L + i; if (!obs[q]) continue;
      for (let k = 1; k <= Mx; k++) if (X0[q] >= k) S[i][k - 1] += 1;
    }
    const px = prox(X0, obs, m, N, L);
    let theta = px.theta.slice(), b = px.d.slice();
    let tau = initialTau(X0, obs, m, model, N, L, Mx);
    let tauShared = model === "rsm" ? Float64Array.from(tau[0]) : null;
    let delta = buildDelta(b, tau, m, Mx);
    const log = [];
    let converged = false, maxChange = Infinity, maxResid = Infinity;
    let mom = moments(theta, delta, Mx);
    let it = 0;
    for (it = 1; it <= maxIter; it++) {
      const thetaOld = theta.slice();
      const deltaOld = delta.map((row, i) => Array.from(row, (v, k) => (valid(i, k) ? v : 0)));
      // langkah person
      for (let a = 0; a < N; a++) {
        let r = 0, w = 0;
        for (let i = 0; i < L; i++) { const q = a * L + i; if (obs[q]) { r += X0[q] - mom.E[q]; w += mom.W[q]; } }
        theta[a] = theta[a] + clip(r / Math.max(w, TINY), -1, 1);
      }
      mom = moments(theta, delta, Mx);
      if (model === "rsm") {
        for (let i = 0; i < L; i++) {
          let r = 0, w = 0;
          for (let a = 0; a < N; a++) { const q = a * L + i; if (obs[q]) { r += X0[q] - mom.E[q]; w += mom.W[q]; } }
          b[i] = b[i] - clip(r / Math.max(w, TINY), -1, 1);
        }
        delta = buildDelta(b, tauShared, m, Mx);
        mom = moments(theta, delta, Mx);
        const g = new Float64Array(Mx);
        for (let q = 0; q < N * L; q++) if (obs[q]) for (let k = 0; k < Mx; k++) g[k] += mom.G[q * Mx + k];
        for (let i = 0; i < L; i++) for (let k = 0; k < Mx; k++) g[k] -= S[i][k];
        const Jb = blockInformation(mom, obs);
        const J = Array.from({ length: Mx }, () => new Array(Mx).fill(0));
        for (let i = 0; i < L; i++) for (let j = 0; j < Mx; j++) for (let k = 0; k < Mx; k++) J[j][k] += Jb[i][j][k];
        let step = solve(J, Array.from(g));
        if (step === null) step = Array.from(g, (v, k) => v / Math.max(J[k][k], TINY));
        const big = Math.max(...step.map(Math.abs));
        const f = big > 1 ? 1 / Math.max(big, 1e-300) : 1;
        for (let k = 0; k < Mx; k++) tauShared[k] += step[k] * f;
        const tm = mean(tauShared);
        for (let k = 0; k < Mx; k++) tauShared[k] -= tm;
        const bm = mean(b);
        for (let i = 0; i < L; i++) b[i] -= bm;
        delta = buildDelta(b, tauShared, m, Mx);
      } else {
        const Jb = blockInformation(mom, obs);
        const g = Array.from({ length: L }, () => new Float64Array(Mx));
        for (let q = 0; q < N * L; q++) {
          if (!obs[q]) continue;
          const i = q % L;
          for (let k = 0; k < Mx; k++) g[i][k] += mom.G[q * Mx + k];
        }
        const d = [];
        for (let i = 0; i < L; i++) {
          const mi = m[i];
          const gi = [], Ji = [];
          for (let k = 0; k < Mx; k++) gi.push(valid(i, k) ? g[i][k] - S[i][k] : 0);
          for (let j = 0; j < Mx; j++) {
            Ji.push([]);
            for (let k = 0; k < Mx; k++) Ji[j].push(valid(i, j) && valid(i, k) ? Jb[i][j][k] : (j === k ? 1 : 0));
          }
          let step = solve(Ji, gi);
          if (step === null) step = gi.map((v, k) => v / Math.max(Ji[k][k], TINY));
          step = step.map((v, k) => (valid(i, k) ? v : 0));
          const big = Math.max(...step.map(Math.abs));
          const f = big > 1 ? 1 / Math.max(big, 1e-300) : 1;
          const row = new Float64Array(Mx);
          for (let k = 0; k < Mx; k++) row[k] = (valid(i, k) ? delta[i][k] : 0) + step[k] * f;
          let s = 0; for (let k = 0; k < Mx; k++) s += row[k];
          b[i] = s / mi;
          d.push(row);
        }
        const shift = mean(b);
        for (let i = 0; i < L; i++) {
          b[i] -= shift;
          for (let k = 0; k < Mx; k++) d[i][k] = valid(i, k) ? d[i][k] - shift : Infinity;
        }
        delta = d;
      }
      mom = moments(theta, delta, Mx);
      const rowRes = new Float64Array(N), colRes = new Float64Array(L);
      for (let a = 0; a < N; a++) for (let i = 0; i < L; i++) {
        const q = a * L + i; if (!obs[q]) continue;
        const r = X0[q] - mom.E[q]; rowRes[a] += r; colRes[i] += r;
      }
      let mr = 0;
      for (const v of rowRes) mr = Math.max(mr, Math.abs(v));
      for (const v of colRes) mr = Math.max(mr, Math.abs(v));
      let mc = 0;
      for (let a = 0; a < N; a++) mc = Math.max(mc, Math.abs(theta[a] - thetaOld[a]));
      for (let i = 0; i < L; i++) for (let k = 0; k < Mx; k++) {
        mc = Math.max(mc, Math.abs((valid(i, k) ? delta[i][k] : 0) - deltaOld[i][k]));
      }
      maxResid = mr; maxChange = mc;
      log.push({ iteration: it, maxChange: mc, maxResidual: mr });
      if (options.progress) options.progress(it, mc, mr);
      if (mc < convChange && mr < convResid) { converged = true; break; }
      yield it;
    }
    if (it > maxIter) it = maxIter;

    // --- SE ---------------------------------------------------------------------------
    const personSe = new Float64Array(N), itemSe = new Float64Array(L);
    for (let a = 0; a < N; a++) {
      let w = 0; for (let i = 0; i < L; i++) if (obs[a * L + i]) w += mom.W[a * L + i];
      personSe[a] = 1 / Math.sqrt(w);
    }
    for (let i = 0; i < L; i++) {
      let w = 0; for (let a = 0; a < N; a++) if (obs[a * L + i]) w += mom.W[a * L + i];
      itemSe[i] = 1 / Math.sqrt(w);
    }
    if (model === "pcm") {
      const Jb = blockInformation(mom, obs);
      for (let i = 0; i < L; i++) {
        const Ji = [];
        for (let j = 0; j < Mx; j++) {
          Ji.push([]);
          for (let k = 0; k < Mx; k++) Ji[j].push(valid(i, j) && valid(i, k) ? Jb[i][j][k] : (j === k ? 1 : 0));
        }
        const inv = inverse(Ji);
        let s = 0;
        for (let j = 0; j < Mx; j++) for (let k = 0; k < Mx; k++) if (valid(i, j) && valid(i, k)) s += inv ? inv[j][k] : NaN;
        itemSe[i] = Math.sqrt(s) / m[i];
      }
    }
    const GG = Array.from({ length: L }, () => new Float64Array(Mx));
    for (let q = 0; q < N * L; q++) {
      if (!obs[q]) continue;
      const i = q % L;
      for (let k = 0; k < Mx; k++) { const gv = mom.G[q * Mx + k]; GG[i][k] += gv * (1 - gv); }
    }
    let tauSe;
    if (model === "rsm") {
      const tse = new Float64Array(Mx);
      for (let k = 0; k < Mx; k++) { let s = 0; for (let i = 0; i < L; i++) s += GG[i][k]; tse[k] = 1 / Math.sqrt(s); }
      tauSe = Array.from({ length: L }, (_, i) => Array.from({ length: Mx }, (_, k) => (valid(i, k) ? tse[k] : NaN)));
    } else {
      tauSe = Array.from({ length: L }, (_, i) => Array.from({ length: Mx }, (_, k) => (valid(i, k) ? 1 / Math.sqrt(GG[i][k]) : NaN)));
    }

    // --- Ukuran penuh ------------------------------------------------------------------
    const fullDelta = Array.from({ length: Lall }, () => new Float64Array(Mall).fill(Infinity));
    const fullB = new Float64Array(Lall).fill(NaN), fullItemSe = new Float64Array(Lall).fill(NaN);
    const fullTauSe = Array.from({ length: Lall }, () => new Float64Array(Mall).fill(NaN));
    eiIdx.forEach((gi, c) => {
      for (let k = 0; k < Mx; k++) { fullDelta[gi][k] = delta[c][k]; fullTauSe[gi][k] = tauSe[c][k]; }
      fullB[gi] = b[c]; fullItemSe[gi] = itemSe[c];
    });
    const thetaFull = new Float64Array(Nall).fill(NaN), pseFull = new Float64Array(Nall).fill(NaN);
    epIdx.forEach((gn, a) => { thetaFull[gn] = theta[a]; pseFull[gn] = personSe[a]; });

    const extItems = [];
    coded.itemExtreme.forEach((v, i) => { if (v === -1 || v === 1) extItems.push(i); });
    if (extItems.length) {
      const tauRow = model === "dichotomous" ? new Float64Array(Mall) : tauShared;
      const k = extItems.length;
      const oi = new Uint8Array(N * k);
      for (let a = 0; a < N; a++) extItems.forEach((gi, c) => { if (!Number.isNaN(X[epIdx[a]][gi])) oi[a * k + c] = 1; });
      const mi = extItems.map((gi) => mAll[gi]);
      const target = extItems.map((gi, c) => {
        let cnt = 0; for (let a = 0; a < N; a++) cnt += oi[a * k + c];
        return coded.itemExtreme[gi] < 0 ? EXTREME_SCORE_ADJUSTMENT : cnt * mi[c] - EXTREME_SCORE_ADJUSTMENT;
      });
      const tauX = extItems.map(() => Array.from(tauRow));
      const sol = solveItemLocations(theta, oi, tauX, mi, target, Mall);
      extItems.forEach((gi, c) => {
        fullB[gi] = sol.b[c]; fullItemSe[gi] = sol.se[c];
        const row = buildDelta([sol.b[c]], [tauX[c]], [mi[c]], Mall)[0];
        fullDelta[gi] = row;
      });
    }
    const usable = [];
    coded.itemExtreme.forEach((v, i) => { if (v === -1 || v === 0 || v === 1) usable.push(i); });
    const extP = [];
    coded.personExtreme.forEach((v, n) => { if (v === -1 || v === 1) extP.push(n); });
    if (extP.length) {
      const U = usable.length;
      const op = new Uint8Array(extP.length * U);
      const target = extP.map((gn, a) => {
        let maxs = 0;
        usable.forEach((gi, c) => { if (!Number.isNaN(X[gn][gi])) { op[a * U + c] = 1; maxs += mAll[gi]; } });
        return coded.personExtreme[gn] < 0 ? EXTREME_SCORE_ADJUSTMENT : maxs - EXTREME_SCORE_ADJUSTMENT;
      });
      const sol = solvePersons(usable.map((gi) => fullDelta[gi]), op, target, Mall);
      extP.forEach((gn, a) => { thetaFull[gn] = sol.theta[a]; pseFull[gn] = sol.se[a]; });
    }
    const fullTau = fullDelta.map((row, i) => Array.from(row, (v) => (isFinite(v) ? v - fullB[i] : NaN)));
    const bias = (L - 1) / L;
    return {
      model, theta: thetaFull, personSe: pseFull, b: fullB, itemSe: fullItemSe, delta: fullDelta, tau: fullTau,
      tauSe: fullTauSe, converged, nIter: it, maxChange, maxResidual: maxResid, log, biasFactor: bias,
      get itemMeasure() { return Array.from(this.b, (v) => v * this.biasFactor); },
      get itemMeasureSe() { return Array.from(this.itemSe, (v) => v * this.biasFactor); },
      get threshold() { return this.tau.map((r) => r.map((v) => v * this.biasFactor)); },
      get thresholdSe() { return this.tauSe.map((r) => Array.from(r, (v) => v * this.biasFactor)); },
      get thresholdLocation() { return this.delta.map((r) => Array.from(r, (v) => v * this.biasFactor)); },
    };
  }

  function solvePersons(delta, obs, target, M, maxIter = 200, tol = 1e-7) {
    const n = target.length, L = delta.length;
    const theta = new Float64Array(n);
    let mom;
    for (let it = 0; it < maxIter; it++) {
      mom = moments(theta, delta, M);
      let big = 0;
      for (let a = 0; a < n; a++) {
        let e = 0, w = 0;
        for (let i = 0; i < L; i++) if (obs[a * L + i]) { e += mom.E[a * L + i]; w += mom.W[a * L + i]; }
        const step = clip((target[a] - e) / Math.max(w, TINY), -1, 1);
        theta[a] += step;
        big = Math.max(big, Math.abs(step));
      }
      if (big < tol) break;
    }
    mom = moments(theta, delta, M);
    const se = new Float64Array(n);
    for (let a = 0; a < n; a++) {
      let w = 0; for (let i = 0; i < L; i++) if (obs[a * L + i]) w += mom.W[a * L + i];
      se[a] = 1 / Math.sqrt(w);
    }
    return { theta, se };
  }

  /** Lokasi item dengan person dan threshold tetap (item ekstrem, DIF). obs: n x k datar. */
  function solveItemLocations(theta, obs, tau, m, target, M, maxIter = 200, tol = 1e-7) {
    const k = target.length, n = theta.length;
    const b = new Float64Array(k);
    const tauc = tau.map((row) => Array.from({ length: M }, (_, j) => (j < row.length && isFinite(row[j]) ? row[j] : 0)));
    let mom;
    for (let it = 0; it < maxIter; it++) {
      mom = moments(theta, buildDelta(Array.from(b), tauc, m, M), M);
      let big = 0;
      for (let c = 0; c < k; c++) {
        let e = 0, w = 0;
        for (let a = 0; a < n; a++) if (obs[a * k + c]) { e += mom.E[a * k + c]; w += mom.W[a * k + c]; }
        const step = clip((e - target[c]) / Math.max(w, TINY), -1, 1);
        b[c] += step;
        big = Math.max(big, Math.abs(step));
      }
      if (big < tol) break;
    }
    mom = moments(theta, buildDelta(Array.from(b), tauc, m, M), M);
    const se = new Float64Array(k);
    for (let c = 0; c < k; c++) {
      let w = 0; for (let a = 0; a < n; a++) if (obs[a * k + c]) w += mom.W[a * k + c];
      se[c] = 1 / Math.sqrt(w);
    }
    return { b, se };
  }

  // ------------------------------------------------------------------------------------
  // Fit, reliabilitas (core/fit.py, core/reliability.py)
  // ------------------------------------------------------------------------------------
  function wilsonHilferty(mnsq, q) {
    q = Math.max(q, TINY);
    return (Math.cbrt(mnsq) - 1) * (3 / q) + q / 3;
  }

  function fitStatistics(X0, obs, mom, N, L, axis) {
    const len = axis === 0 ? L : N;
    const y2s = new Float64Array(len), y2w = new Float64Array(len), n = new Float64Array(len), sumW = new Float64Array(len);
    const qo = new Float64Array(len), qi = new Float64Array(len);
    for (let a = 0; a < N; a++) for (let i = 0; i < L; i++) {
      const q = a * L + i; if (!obs[q]) continue;
      const g = axis === 0 ? i : a;
      const w = Math.max(mom.W[q], TINY);
      const y = X0[q] - mom.E[q];
      const y2 = y * y;
      y2s[g] += y2; y2w[g] += y2 / w; n[g] += 1; sumW[g] += w;
      qo[g] += mom.C[q] / (w * w); qi[g] += mom.C[q] - w * w;
    }
    const out = { infit_mnsq: [], outfit_mnsq: [], infit_zstd: [], outfit_zstd: [], count: [] };
    for (let g = 0; g < len; g++) {
      const outfit = y2w[g] / n[g], infit = y2s[g] / sumW[g];
      const qO = Math.sqrt(Math.max(qo[g] / (n[g] * n[g]) - 1 / n[g], 0));
      const qI = Math.sqrt(Math.max(qi[g] / (sumW[g] * sumW[g]), 0));
      out.infit_mnsq.push(infit); out.outfit_mnsq.push(outfit);
      out.infit_zstd.push(wilsonHilferty(infit, Number.isNaN(qI) ? NaN : qI));
      out.outfit_zstd.push(wilsonHilferty(outfit, Number.isNaN(qO) ? NaN : qO));
      out.count.push(n[g]);
    }
    return out;
  }

  function pointMeasure(X0, obs, theta, mom, N, L) {
    const obsR = new Array(L).fill(NaN), expR = new Array(L).fill(NaN);
    for (let i = 0; i < L; i++) {
      const idx = [];
      for (let a = 0; a < N; a++) if (obs[a * L + i]) idx.push(a);
      if (idx.length < 3) continue;
      const x = idx.map((a) => X0[a * L + i]), t = idx.map((a) => theta[a]);
      const e = idx.map((a) => mom.E[a * L + i]), w = idx.map((a) => mom.W[a * L + i]);
      const tm = mean(t), xm = mean(x), em = mean(e);
      let sxx = 0, stt = 0, sxt = 0, see = 0, set = 0, sw = 0;
      for (let r = 0; r < idx.length; r++) {
        const tc = t[r] - tm, xc = x[r] - xm, ec = e[r] - em;
        sxx += xc * xc; stt += tc * tc; sxt += xc * tc; see += ec * ec; set += ec * tc; sw += w[r];
      }
      if (sxx > 0 && stt > 0) obsR[i] = sxt / Math.sqrt(sxx * stt);
      const denom = stt * (see + sw);
      if (denom > 0) expR[i] = set / Math.sqrt(denom);
    }
    return { obsR, expR };
  }

  function separationStatistics(measures, se, infit) {
    const x = [], s = [], inf = [];
    for (let k = 0; k < measures.length; k++) {
      if (isFinite(measures[k]) && isFinite(se[k])) { x.push(measures[k]); s.push(se[k]); if (infit) inf.push(infit[k]); }
    }
    const out = { n: x.length, mean: x.length ? mean(x) : NaN };
    let sd = NaN;
    if (x.length) { const mu = out.mean; let v = 0; for (const xi of x) v += (xi - mu) * (xi - mu); sd = Math.sqrt(v / x.length); }
    out.sd = sd;
    const variants = { model: s };
    if (infit) variants.real = s.map((sv, k) => sv * Math.sqrt(Math.max(1, isFinite(inf[k]) ? inf[k] : 1)));
    for (const [name, err] of Object.entries(variants)) {
      const rmse = err.length ? Math.sqrt(mean(err.map((e) => e * e))) : NaN;
      const trueVar = Math.max(sd * sd - rmse * rmse, 0);
      const trueSd = Math.sqrt(trueVar);
      const rel = sd > 0 ? trueVar / (sd * sd) : NaN;
      const sep = rmse > 0 ? trueSd / rmse : NaN;
      out[`${name}_rmse`] = rmse; out[`${name}_true_sd`] = trueSd; out[`${name}_reliability`] = rel;
      out[`${name}_separation`] = sep; out[`${name}_strata`] = (4 * sep + 1) / 3;
    }
    return out;
  }

  function variance(a) { const mu = mean(a); let v = 0; for (const x of a) v += (x - mu) * (x - mu); return v / (a.length - 1); }

  function cronbachAlpha(rawCols) {
    const data = rawCols.filter((r) => r.every((v) => !Number.isNaN(v)));
    const n = data.length, L = rawCols.length ? rawCols[0].length : 0;
    if (n < 2 || L < 2) return [NaN, n];
    let itemVar = 0;
    for (let j = 0; j < L; j++) itemVar += variance(data.map((r) => r[j]));
    const totalVar = variance(data.map((r) => r.reduce((s, v) => s + v, 0)));
    if (totalVar <= 0) return [NaN, n];
    return [L / (L - 1) * (1 - itemVar / totalVar), n];
  }

  // ------------------------------------------------------------------------------------
  // Kategori (core/categories.py)
  // ------------------------------------------------------------------------------------
  function categoryRows(item, labels, obsList, tau, tauSe, location, minCount, outfitMax) {
    // obsList: [{x, diff, z2, P: [..], z2all: [..]}]
    const m = labels.length - 1, total = obsList.length;
    const rows = [];
    let prevAvg = null;
    for (let k = 0; k <= m; k++) {
      let cnt = 0, sd = 0, sz = 0, sp = 0, spz = 0;
      for (const o of obsList) {
        if (o.x === k) { cnt++; sd += o.diff; sz += o.z2; }
        sp += o.P[k]; spz += o.P[k] * o.z2all[k];
      }
      const avg = cnt ? sd / cnt : NaN;
      const outfit = cnt ? sz / cnt : NaN;
      const expected = sp > 0 ? spz / sp : NaN;
      let se = NaN;
      if (sp > 0) {
        let acc = 0;
        for (const o of obsList) { const pk = o.P[k]; const d = o.z2all[k] - expected; acc += pk * (1 - pk) * d * d; }
        se = Math.sqrt(acc) / sp;
      }
      const z = cnt && se > 0 ? (outfit - expected) / se : NaN;
      rows.push({
        item, category: k, label: labels[k], count: cnt, percent: total ? 100 * cnt / total : NaN,
        avg_measure: avg, outfit_mnsq: outfit, outfit_expected: expected, outfit_z: z,
        threshold: k >= 1 ? tau[k - 1] : NaN, threshold_se: k >= 1 ? tauSe[k - 1] : NaN,
        threshold_location: k >= 1 && location ? location[k - 1] : NaN,
        flag_low_count: cnt < minCount,
        flag_disordered_threshold: k >= 2 && tau[k - 1] < tau[k - 2],
        flag_disordered_avg: prevAvg !== null && isFinite(avg) && avg < prevAvg,
        flag_outfit_high: isFinite(z) && outfit >= outfitMax && z > Z_ONE_SIDED_05,
      });
      if (isFinite(avg)) prevAvg = avg;
    }
    return rows;
  }

  function categoryTable(model, X0, obs, theta, b, mom, N, L, tau, tauSe, location, m, labels, names, minCount, outfitMax) {
    const K = mom.M + 1;
    const mk = (a, i) => {
      const q = a * L + i;
      const w = Math.max(mom.W[q], TINY), e = mom.E[q];
      const P = [], z2all = [];
      for (let k = 0; k < K; k++) { P.push(mom.P[q * K + k]); z2all.push((k - e) * (k - e) / w); }
      const y = X0[q] - e;
      return { x: X0[q], diff: theta[a] - b[i], z2: y * y / w, P, z2all };
    };
    if (model === "rsm") {
      const list = [];
      for (let a = 0; a < N; a++) for (let i = 0; i < L; i++) if (obs[a * L + i]) list.push(mk(a, i));
      return categoryRows(TEXT.allItems, labels[0], list, tau[0], tauSe[0], null, minCount, outfitMax);
    }
    let rows = [];
    for (let i = 0; i < L; i++) {
      const list = [];
      for (let a = 0; a < N; a++) if (obs[a * L + i]) list.push(mk(a, i));
      const mi = m[i];
      rows = rows.concat(categoryRows(names[i], labels[i], list, tau[i].slice(0, mi), tauSe[i].slice(0, mi),
        location[i].slice(0, mi), minCount, outfitMax));
    }
    return rows;
  }

  // ------------------------------------------------------------------------------------
  // Dimensionalitas (core/dimensionality.py)
  // ------------------------------------------------------------------------------------
  function pairwiseCorr(cols) {
    // cols: L array berisi nilai per person (NaN = hilang); min_periods = 3 seperti pandas
    const L = cols.length, n = cols[0].length;
    const C = Array.from({ length: L }, () => new Array(L).fill(NaN));
    for (let i = 0; i < L; i++) {
      for (let j = i; j < L; j++) {
        let c = 0, si = 0, sj = 0;
        for (let a = 0; a < n; a++) { const x = cols[i][a], y = cols[j][a]; if (!Number.isNaN(x) && !Number.isNaN(y)) { c++; si += x; sj += y; } }
        if (c < 3) continue;
        const mi = si / c, mj = sj / c;
        let sxx = 0, syy = 0, sxy = 0;
        for (let a = 0; a < n; a++) {
          const x = cols[i][a], y = cols[j][a];
          if (!Number.isNaN(x) && !Number.isNaN(y)) { const dx = x - mi, dy = y - mj; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
        }
        const den = Math.sqrt(sxx * syy);
        let r = den > 0 ? sxy / den : NaN;
        if (r > 1) r = 1; if (r < -1) r = -1;
        C[i][j] = r; C[j][i] = r;
      }
    }
    return C;
  }

  function residualPca(X0, obs, mom, N, L, names) {
    const cols = [];
    for (let i = 0; i < L; i++) {
      const col = new Array(N);
      for (let a = 0; a < N; a++) {
        const q = a * L + i;
        col[a] = obs[q] ? (X0[q] - mom.E[q]) / Math.sqrt(Math.max(mom.W[q], TINY)) : NaN;
      }
      cols.push(col);
    }
    const corr = pairwiseCorr(cols);
    const C = corr.map((r, i) => r.map((v, j) => (i === j ? 1 : isFinite(v) ? v : 0)));
    const eig = symmetricEigen(C);
    let v1 = eig.vectors[0].slice();
    let amax = 0;
    for (let i = 1; i < L; i++) if (Math.abs(v1[i]) > Math.abs(v1[amax])) amax = i;
    if (v1[amax] < 0) v1 = v1.map((x) => -x);
    const loadings = v1.map((x) => x * Math.sqrt(Math.max(eig.values[0], 0)));
    let sx = 0, cnt = 0;
    for (let q = 0; q < N * L; q++) if (obs[q]) { sx += X0[q]; cnt++; }
    const xm = sx / cnt;
    let explained = 0, unexplained = 0;
    for (let q = 0; q < N * L; q++) if (obs[q]) {
      const d1 = mom.E[q] - xm, d2 = X0[q] - mom.E[q];
      explained += d1 * d1; unexplained += d2 * d2;
    }
    const total = explained + unexplained;
    const explainedEig = unexplained > 0 ? L * explained / unexplained : NaN;
    const totalEig = L + explainedEig;
    return {
      eigenvalues: eig.values, first_contrast_eigenvalue: eig.values[0],
      loadings: names.map((nm, i) => [nm, loadings[i]]),
      variance_explained_pct: total > 0 ? 100 * explained / total : NaN,
      variance_unexplained_pct: total > 0 ? 100 * unexplained / total : NaN,
      explained_eigen_units: explainedEig, total_eigen_units: totalEig,
      first_contrast_pct_total: totalEig > 0 ? 100 * eig.values[0] / totalEig : NaN,
    };
  }

  function yenQ3(X0, obs, mom, N, L, names, relativeCutoff) {
    const cols = [];
    for (let i = 0; i < L; i++) {
      const col = new Array(N);
      for (let a = 0; a < N; a++) { const q = a * L + i; col[a] = obs[q] ? X0[q] - mom.E[q] : NaN; }
      cols.push(col);
    }
    const Q = pairwiseCorr(cols);
    const off = [];
    for (let a = 0; a < L; a++) for (let b = a + 1; b < L; b++) off.push([a, b, Q[a][b]]);
    const fin = off.map((o) => o[2]).filter((v) => !Number.isNaN(v));
    const meanQ = fin.length ? mean(fin) : NaN;
    const limit = meanQ + relativeCutoff;
    const pairs = [];
    for (const [a, b, v] of off) if (isFinite(v) && v > limit) pairs.push({ item_a: names[a], item_b: names[b], q3: v, q3_relative: v - meanQ });
    pairs.sort((p, q) => q.q3 - p.q3);
    return { matrix: Q, names, mean: meanQ, max: fin.length ? Math.max(...fin) : NaN, cutoff: limit, flagged_pairs: pairs };
  }

  // ------------------------------------------------------------------------------------
  // DIF (core/dif.py)
  // ------------------------------------------------------------------------------------
  function difAnalysis(Xe, N, L, theta, tau, m, groups, names, scale, contrastMin, tMin, etsB, etsC, M) {
    const levels = Array.from(new Set(groups.filter((g) => g !== null))).sort();
    const notes = [];
    const per = {};
    for (const g of levels) {
      const sel = [];
      groups.forEach((v, a) => { if (v !== null && v === g) sel.push(a); });
      if (sel.length < 2) { notes.push(g); continue; }
      const score = new Float64Array(L), n = new Float64Array(L);
      for (const a of sel) for (let i = 0; i < L; i++) { const v = Xe[a][i]; if (!Number.isNaN(v)) { score[i] += v; n[i] += 1; } }
      const has = [], target = [], extreme = [];
      for (let i = 0; i < L; i++) {
        const maxs = n[i] * m[i];
        extreme.push((score[i] <= 0 || score[i] >= maxs) && n[i] > 0);
        target.push(score[i] <= 0 ? EXTREME_SCORE_ADJUSTMENT : score[i] >= maxs ? maxs - EXTREME_SCORE_ADJUSTMENT : score[i]);
        if (n[i] > 0) has.push(i);
      }
      const bArr = new Array(L).fill(NaN), seArr = new Array(L).fill(NaN);
      if (has.length) {
        const k = has.length;
        const ob = new Uint8Array(sel.length * k);
        sel.forEach((a, r) => has.forEach((i, c) => { if (!Number.isNaN(Xe[a][i])) ob[r * k + c] = 1; }));
        const sol = solveItemLocations(sel.map((a) => theta[a]), ob, has.map((i) => tau[i]), has.map((i) => m[i]),
          has.map((i) => target[i]), M);
        has.forEach((i, c) => { bArr[i] = sol.b[c]; seArr[i] = sol.se[c]; });
      }
      per[g] = { measure: bArr.map((v) => v * scale), se: seArr.map((v) => v * scale), n: Array.from(n), extreme };
    }
    if (Object.keys(per).length !== 2) return { table: [], notes };
    const [ga, gb] = levels;
    const A = per[ga], B = per[gb];
    const rows = [];
    for (let i = 0; i < L; i++) {
      const contrast = A.measure[i] - B.measure[i];
      const joint = Math.sqrt(A.se[i] ** 2 + B.se[i] ** 2);
      const t = contrast / joint;
      const df = joint ** 4 / (A.se[i] ** 4 / (A.n[i] - 1) + B.se[i] ** 4 / (B.n[i] - 1));
      const p = 2 * stdtr(df, -Math.abs(t));
      const flag = Math.abs(contrast) >= contrastMin && Math.abs(t) > tMin;
      const pBeyond = stdtr(df, -(Math.abs(contrast) - etsB) / joint);
      const ets = Math.abs(contrast) >= etsC && pBeyond < 0.05 ? "C" : Math.abs(contrast) >= etsB && p < 0.05 ? "B" : "A";
      rows.push({
        item: names[i], group_a: ga, group_b: gb, measure_a: A.measure[i], se_a: A.se[i], n_a: A.n[i],
        measure_b: B.measure[i], se_b: B.se[i], n_b: B.n[i], contrast, joint_se: joint, t, df, p,
        extreme_a: A.extreme[i], extreme_b: B.extreme[i], flag_dif: flag, ets_category: ets,
      });
    }
    return { table: rows, notes };
  }

  // ------------------------------------------------------------------------------------
  // Orkestrasi (core/analysis.py)
  // ------------------------------------------------------------------------------------
  const STATUS = () => TEXT.statusLabels; // {"0": "", "-1": ..., "1": ..., "2": ...}

  async function runAnalysisAsync(prep, model, opts = {}) {
    const coded = codeResponses(prep, model);
    return finishAnalysis(prep, model, opts, await estimateAsync(coded, opts), coded);
  }
  function runAnalysis(prep, model, opts = {}) {
    const coded = codeResponses(prep, model);
    return finishAnalysis(prep, model, opts, estimate(coded, opts), coded);
  }

  function finishAnalysis(prep, model, opts, jm, codedIn) {
    const t0 = Date.now();
    const coded = codedIn || codeResponses(prep, model);
    const R = TEXT.rules;
    const strict = !!opts.strictFit, runDif = opts.runDif !== false;
    const issues = [...prep.issues, ...coded.issues];
    if (jm.converged) issues.push(issue("info", "converged", pyFormat(M("CONVERGED"), { n: jm.nIter })));
    else issues.push(issue("warning", "not_converged", pyFormat(M("NOT_CONVERGED"), { n: jm.nIter, change: jm.maxChange, resid: jm.maxResidual })));
    const nEst = coded.itemExtreme.filter((v) => v === 0).length;
    issues.push(issue("info", "bias_correction", pyFormat(M("BIAS_CORRECTION"), { factor: jm.biasFactor, L: nEst })));
    const [lo, hi] = strict ? R.MNSQ_STRICT : R.MNSQ_PRODUCTIVE;
    const names = coded.itemNames;
    const ep = [], ei = [];
    coded.personExtreme.forEach((v, n) => { if (v === 0) ep.push(n); });
    coded.itemExtreme.forEach((v, i) => { if (v === 0) ei.push(i); });
    const N = ep.length, L = ei.length;
    const X0 = new Float64Array(N * L), obs = new Uint8Array(N * L);
    const Xe = ep.map((n) => ei.map((i) => coded.X[n][i]));
    for (let a = 0; a < N; a++) for (let c = 0; c < L; c++) { const v = Xe[a][c]; if (!Number.isNaN(v)) { X0[a * L + c] = v; obs[a * L + c] = 1; } }
    const thetaE = ep.map((n) => jm.theta[n]);
    const me = ei.map((i) => coded.m[i]);
    const Me = Math.max(...me);
    const deltaE = ei.map((i) => Float64Array.from(jm.delta[i].slice(0, Me)));
    const mom = moments(thetaE, deltaE, Me, true);
    const namesE = ei.map((i) => names[i]);
    const itemFit = fitStatistics(X0, obs, mom, N, L, 0);
    const personFit = fitStatistics(X0, obs, mom, N, L, 1);
    const pt = pointMeasure(X0, obs, thetaE, mom, N, L);
    const misfit = (inf, out) => inf < lo || inf > hi || out < lo || out > hi;

    // tabel item
    const usableP = coded.personExtreme.map((v) => v === -1 || v === 0 || v === 1);
    const itemMeasure = jm.itemMeasure, itemSe = jm.itemMeasureSe;
    const items = names.map((nm, i) => {
      let score = 0, count = 0;
      coded.X.forEach((r, n) => { if (usableP[n] && !Number.isNaN(r[i])) { score += r[i]; count++; } });
      const c = ei.indexOf(i);
      const row = {
        item: nm, score, count, max_score: count * coded.m[i], n_categories: coded.m[i] + 1,
        measure: itemMeasure[i], se: itemSe[i],
        infit_mnsq: c >= 0 ? itemFit.infit_mnsq[c] : NaN, infit_zstd: c >= 0 ? itemFit.infit_zstd[c] : NaN,
        outfit_mnsq: c >= 0 ? itemFit.outfit_mnsq[c] : NaN, outfit_zstd: c >= 0 ? itemFit.outfit_zstd[c] : NaN,
        ptmea_obs: c >= 0 ? pt.obsR[c] : NaN, ptmea_exp: c >= 0 ? pt.expR[c] : NaN,
        status: STATUS()[String(coded.itemExtreme[i])], extreme: coded.itemExtreme[i] !== 0,
      };
      row.flag_misfit = misfit(row.infit_mnsq, row.outfit_mnsq);
      row.flag_negative_ptmea = row.ptmea_obs < R.PTMEASURE_MIN;
      return row;
    });
    // tabel person
    const usableI = coded.itemExtreme.map((v) => v === -1 || v === 0 || v === 1);
    const persons = coded.personIds.map((id, n) => {
      let score = 0, count = 0, maxs = 0;
      coded.X[n].forEach((v, i) => { if (usableI[i] && !Number.isNaN(v)) { score += v; count++; maxs += coded.m[i]; } });
      const a = coded.personExtreme[n] === 0 ? ep.indexOf(n) : -1;
      const row = { person: id };
      if (coded.groups) row.group = coded.groups[n];
      Object.assign(row, {
        score, count, max_score: maxs, measure: jm.theta[n], se: jm.personSe[n],
        infit_mnsq: a >= 0 ? personFit.infit_mnsq[a] : NaN, infit_zstd: a >= 0 ? personFit.infit_zstd[a] : NaN,
        outfit_mnsq: a >= 0 ? personFit.outfit_mnsq[a] : NaN, outfit_zstd: a >= 0 ? personFit.outfit_zstd[a] : NaN,
        status: STATUS()[String(coded.personExtreme[n])],
        extreme: coded.personExtreme[n] === -1 || coded.personExtreme[n] === 1,
      });
      row.flag_misfit = misfit(row.infit_mnsq, row.outfit_mnsq);
      return row;
    });

    let categories = null;
    if (model !== "dichotomous") {
      const thr = jm.threshold, thrSe = jm.thresholdSe, loc = jm.thresholdLocation;
      categories = categoryTable(model, X0, obs, thetaE, ei.map((i) => jm.b[i]), mom, N, L,
        ei.map((i) => thr[i]), ei.map((i) => Array.from(thrSe[i])), ei.map((i) => Array.from(loc[i])),
        me, ei.map((i) => coded.categoryLabels[i]), namesE, R.CATEGORY_MIN_COUNT, R.CATEGORY_OUTFIT_MAX);
    }

    // ringkasan
    const pSep = separationStatistics(ep.map((n) => persons[n].measure), ep.map((n) => persons[n].se), ep.map((n) => persons[n].infit_mnsq));
    const iSep = separationStatistics(ei.map((i) => items[i].measure), ei.map((i) => items[i].se), ei.map((i) => items[i].infit_mnsq));
    const usableCols = prep.raw.map((r) => r.filter((_, i) => usableI[i]));
    const [alpha, alphaN] = cronbachAlpha(usableCols);
    let nNaN = 0; coded.X.forEach((r) => r.forEach((v) => { if (Number.isNaN(v)) nNaN++; }));
    const nanmean = (arr) => { const f = arr.filter((v) => !Number.isNaN(v)); return f.length ? mean(f) : NaN; };
    const summary = {
      model: coded.model, n_persons: coded.personIds.length, n_persons_estimated: N,
      n_persons_extreme: coded.personExtreme.filter((v) => v === -1 || v === 1).length,
      n_items: names.length, n_items_estimated: L,
      n_items_extreme: coded.itemExtreme.filter((v) => v === -1 || v === 1).length,
      n_items_excluded_input: prep.excludedItems.length,
      missing_pct: 100 * nNaN / (coded.X.length * names.length),
      person: pSep, item: iSep,
      person_reliability: pSep.real_reliability, item_reliability: iSep.real_reliability,
      person_separation: pSep.real_separation, item_separation: iSep.real_separation,
      person_strata: pSep.real_strata, item_strata: iSep.real_strata,
      alpha, alpha_n: alphaN, alpha_label: coded.model === "dichotomous" ? "KR-20" : "Cronbach's alpha",
      targeting: pSep.mean - iSep.mean, person_mean: pSep.mean, item_mean: iSep.mean,
      item_mean_infit: nanmean(ei.map((i) => items[i].infit_mnsq)), item_mean_outfit: nanmean(ei.map((i) => items[i].outfit_mnsq)),
      person_mean_infit: nanmean(ep.map((n) => persons[n].infit_mnsq)), person_mean_outfit: nanmean(ep.map((n) => persons[n].outfit_mnsq)),
      n_items_misfit: items.filter((r) => r.flag_misfit).length, n_persons_misfit: persons.filter((r) => r.flag_misfit).length,
      converged: jm.converged, iterations: jm.nIter, max_change: jm.maxChange, max_residual: jm.maxResidual,
    };
    const dimensionality = residualPca(X0, obs, mom, N, L, namesE);
    const q3 = yenQ3(X0, obs, mom, N, L, namesE, R.Q3_RELATIVE_CUTOFF);
    const difTmin = L > R.DIF_MANY_ITEMS ? R.DIF_T_MIN_MANY_ITEMS : R.DIF_T_MIN;
    let dif = null;
    if (runDif && coded.groups) {
      const tauE = ei.map((i) => jm.tau[i]);
      const res = difAnalysis(Xe, N, L, thetaE, tauE, me, ep.map((n) => coded.groups[n]), namesE, jm.biasFactor,
        R.DIF_CONTRAST_MIN, difTmin, R.DIF_ETS_B, R.DIF_ETS_C, Me);
      for (const g of res.notes) issues.push(issue("warning", "dif_too_few", pyFormat(M("DIF_TOO_FEW"), { group: g })));
      dif = res.table.length ? res.table : null;
    }
    const settings = {
      model, strict_fit: strict, mnsq_range: [lo, hi], max_iter: opts.maxIter ?? 500, conv_change: opts.convChange ?? 0.001,
      conv_resid: opts.convResid ?? 0.01, bias_factor: jm.biasFactor, q3_relative_cutoff: R.Q3_RELATIVE_CUTOFF,
      dif_contrast_min: R.DIF_CONTRAST_MIN, dif_t_min: difTmin, category_min_count: R.CATEGORY_MIN_COUNT,
      category_outfit_max: R.CATEGORY_OUTFIT_MAX,
    };
    return {
      model, coded, jmle: jm, items, persons, categories, summary, dimensionality, q3, dif, issues, settings,
      prep, elapsedSeconds: (Date.now() - t0) / 1000, get converged() { return this.jmle.converged; },
    };
  }

  const api = {
    setText, pyFormat, DataValidationError, EstimationCancelled, parseCsv, prepareData, categoryIssues, codeResponses,
    moments, buildDelta, estimate, estimateAsync, runAnalysis, runAnalysisAsync, finishAnalysis, stdtr, stdtrit,
    symmetricEigen, solveItemLocations, betainc, EXTREME_SCORE_ADJUSTMENT,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RaschEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
