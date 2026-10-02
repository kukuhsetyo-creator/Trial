/* RaschLite: Conditional Maximum Likelihood (CMLE) sebagai estimator pembanding.
 *
 * JMLE tetap estimator utama. CMLE di sini menghilangkan parameter person dengan
 * mengondisikan pada raw score masing-masing person (Andersen, 1970), sehingga estimasi item
 * konsisten tanpa koreksi bias (L-1)/L. Data kosong ditangani dengan menghitung elementary
 * symmetric functions (ESF) atas item yang dijawab setiap person.
 *
 * Model: dikotomus dan PCM memakai parameter threshold delta_ij; RSM memakai b_i + tau_j.
 * Optimasi: BFGS dengan gradien analitik; identifikasi melalui penalti pada arah yang tidak
 * memengaruhi likelihood (rata-rata lokasi item = 0, rata-rata tau = 0). SE dari Hessian
 * numerik (beda pusat atas gradien analitik) dengan pseudo-invers pada ruang nol.
 */
(function (root) {
  "use strict";
  let E = root.RaschEngine || null;
  function setEngine(e) { E = e; }
  const isF = (v) => typeof v === "number" && isFinite(v);

  /** Kalikan polinom koefisien a dan b; hasil dinormalisasi (maks = 1) beserta log skala. */
  function polyMul(a, la, b, lb) {
    const out = new Float64Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i++) { const ai = a[i]; if (ai === 0) continue; for (let j = 0; j < b.length; j++) out[i + j] += ai * b[j]; }
    let mx = 0; for (const v of out) if (v > mx) mx = v;
    if (mx > 0) for (let k = 0; k < out.length; k++) out[k] /= mx;
    return { c: out, l: la + lb + Math.log(mx > 0 ? mx : 1) };
  }

  /** Bangun desain: person yang skornya bukan 0/maksimum pada item yang dijawab. */
  function design(coded, itemIdx) {
    const persons = [];
    coded.X.forEach((row, n) => {
      const items = [], xs = [];
      let r = 0, mx = 0;
      itemIdx.forEach((gi, i) => { const v = row[gi]; if (!Number.isNaN(v)) { items.push(i); xs.push(v); r += v; mx += coded.m[gi]; } });
      if (items.length >= 2 && r > 0 && r < mx) persons.push({ n, items, xs, r });
    });
    return persons;
  }

  /**
   * Kelompokkan person menurut himpunan item yang dijawab: ESF hanya bergantung pada himpunan
   * item dan skor, sehingga satu perhitungan melayani semua person dalam kelompok.
   */
  function groupsOf(persons) {
    const map = new Map();
    for (const p of persons) {
      const key = p.items.join(",");
      if (!map.has(key)) map.set(key, { items: p.items, scores: new Map() });
      const g = map.get(key);
      g.scores.set(p.r, (g.scores.get(p.r) || 0) + 1);
    }
    return [...map.values()].map((g) => ({ items: g.items, scores: [...g.scores.entries()] }));
  }

  function makeModel(res) {
    const coded = res.coded, model = res.model;
    const itemIdx = []; coded.itemExtreme.forEach((v, i) => { if (v === 0) itemIdx.push(i); });
    const m = itemIdx.map((i) => coded.m[i]), L = itemIdx.length, M = Math.max(...m);
    const off = []; let P = 0;
    if (model === "rsm") P = L + M; else m.forEach((mi) => { off.push(P); P += mi; });
    const persons = design(coded, itemIdx);
    const groups = groupsOf(persons);
    // jumlah observasi per kategori (statistik cukup)
    const Nik = m.map((mi) => new Float64Array(mi + 1));
    for (const p of persons) p.items.forEach((i, k) => { Nik[i][p.xs[k]] += 1; });
    /** delta[i][j] (j = 0..m_i-1) dari vektor parameter. */
    const deltas = (x) => {
      if (model === "rsm") return m.map((mi, i) => Array.from({ length: mi }, (_, j) => x[i] + x[L + j]));
      return m.map((mi, i) => Array.from({ length: mi }, (_, j) => x[off[i] + j]));
    };
    const location = (x) => (model === "rsm" ? Array.from({ length: L }, (_, i) => x[i]) : m.map((mi, i) => { let s = 0; for (let j = 0; j < mi; j++) s += x[off[i] + j]; return s / mi; }));
    return { coded, model, itemIdx, m, L, M, P, off, persons, groups, Nik, deltas, location };
  }

  /** -logL dan gradien terhadap delta (sebagai daftar per item). */
  function evaluate(mod, x, wantGrad) {
    const { m, groups, Nik } = mod;
    const d = mod.deltas(x);
    // eta_ik = jumlah delta_ij untuk j <= k; koefisien polinom item e_ik = exp(-eta_ik), dinormalisasi
    const eta = d.map((row) => { const e = [0]; let s = 0; for (const v of row) { s += v; e.push(s); } return e; });
    const poly = eta.map((e) => {
      let mn = Infinity; for (const v of e) if (v < mn) mn = v;
      return { c: Float64Array.from(e, (v) => Math.exp(-(v - mn))), l: -mn };
    });
    let nll = 0;
    for (let i = 0; i < m.length; i++) for (let k = 1; k <= m[i]; k++) nll += Nik[i][k] * eta[i][k];
    const gEta = wantGrad ? m.map((mi) => new Float64Array(mi + 1)) : null; // sum_n pi_nik
    for (const grp of groups) {
      const n = grp.items.length;
      const F = new Array(n + 1), B = new Array(n + 1);
      F[0] = { c: Float64Array.of(1), l: 0 };
      for (let k = 0; k < n; k++) { const q = poly[grp.items[k]]; F[k + 1] = polyMul(F[k].c, F[k].l, q.c, q.l); }
      const g = F[n];
      const logG = new Map();
      for (const [r, cnt] of grp.scores) { const lg = Math.log(g.c[r]) + g.l; logG.set(r, lg); nll += cnt * lg; }
      if (!wantGrad) continue;
      B[n] = { c: Float64Array.of(1), l: 0 };
      for (let k = n - 1; k >= 0; k--) { const q = poly[grp.items[k]]; B[k] = polyMul(q.c, q.l, B[k + 1].c, B[k + 1].l); }
      for (let k = 0; k < n; k++) {
        const i = grp.items[k], fa = F[k], fb = B[k + 1];
        // ESF tanpa item i, hanya pada indeks skor yang diperlukan (r - c)
        const wl = fa.l + fb.l, ac = fa.c, bc = fb.c;
        for (const [r, cnt] of grp.scores) {
          const lg = logG.get(r);
          for (let c = 0; c <= m[i]; c++) {
            const s = r - c; if (s < 0) continue;
            let conv = 0;
            const tlo = Math.max(0, s - (bc.length - 1)), thi = Math.min(s, ac.length - 1);
            for (let t = tlo; t <= thi; t++) conv += ac[t] * bc[s - t];
            if (conv <= 0) continue;
            gEta[i][c] += cnt * Math.exp(-eta[i][c] + Math.log(conv) + wl - lg);
          }
        }
      }
    }
    if (!wantGrad) return { nll };
    // d nll / d eta_ik = N_ik - sum pi ; d / d delta_ij = sum_{k >= j} (...)
    const gDelta = m.map((mi, i) => {
      const out = new Float64Array(mi);
      let acc = 0;
      for (let k = mi; k >= 1; k--) { acc += Nik[i][k] - gEta[i][k]; out[k - 1] = acc; }
      return out;
    });
    return { nll, gDelta };
  }

  function objective(mod, x, wantGrad, penalty = true) {
    const ev = evaluate(mod, x, wantGrad);
    const { m, L, M, model, off } = mod;
    const w = 1;
    const loc = mod.location(x);
    const sb = loc.reduce((s, v) => s + v, 0);
    let st = 0; if (model === "rsm") for (let j = 0; j < M; j++) st += x[L + j];
    let f = ev.nll;
    if (penalty) f += w * sb * sb + (model === "rsm" ? w * st * st : 0);
    if (!wantGrad) return { f };
    const g = new Float64Array(mod.P);
    if (model === "rsm") {
      for (let i = 0; i < L; i++) for (let j = 0; j < m[i]; j++) { g[i] += ev.gDelta[i][j]; g[L + j] += ev.gDelta[i][j]; }
      if (penalty) { for (let i = 0; i < L; i++) g[i] += 2 * w * sb; for (let j = 0; j < M; j++) g[L + j] += 2 * w * st; }
    } else {
      for (let i = 0; i < L; i++) for (let j = 0; j < m[i]; j++) g[off[i] + j] = ev.gDelta[i][j] + (penalty ? 2 * w * sb / m[i] : 0);
    }
    return { f, g };
  }

  function startValues(mod, res) {
    const jm = res.jmle, bf = jm.biasFactor, x = new Float64Array(mod.P);
    if (mod.model === "rsm") {
      mod.itemIdx.forEach((gi, i) => { x[i] = jm.b[gi] * bf; });
      const t = jm.tau[mod.itemIdx[0]];
      for (let j = 0; j < mod.M; j++) x[mod.L + j] = (isF(t[j]) ? t[j] : 0) * bf;
    } else {
      mod.itemIdx.forEach((gi, i) => { for (let j = 0; j < mod.m[i]; j++) x[mod.off[i] + j] = jm.delta[gi][j] * bf; });
    }
    return x;
  }

  function* bfgsSteps(fn, x0, opts = {}) {
    const P = x0.length, maxIter = opts.maxIter ?? 500, tol = opts.tol ?? 1e-6;
    let x = Float64Array.from(x0), cur = fn(x, true);
    const H = Array.from({ length: P }, (_, i) => { const r = new Float64Array(P); r[i] = opts.h0 ?? 0.01; return r; });
    let it = 0, converged = false;
    for (it = 1; it <= maxIter; it++) {
      let gmax = 0; for (const v of cur.g) gmax = Math.max(gmax, Math.abs(v));
      if (gmax < tol) { converged = true; break; }
      const dir = new Float64Array(P);
      for (let i = 0; i < P; i++) { let s = 0; const Hi = H[i]; for (let j = 0; j < P; j++) s -= Hi[j] * cur.g[j]; dir[i] = s; }
      let slope = 0; for (let i = 0; i < P; i++) slope += dir[i] * cur.g[i];
      if (slope >= 0) { for (let i = 0; i < P; i++) { H[i].fill(0); H[i][i] = opts.h0 ?? 0.01; dir[i] = -H[i][i] * cur.g[i]; } slope = 0; for (let i = 0; i < P; i++) slope += dir[i] * cur.g[i]; }
      let a = 1, nxt = null, xn = null;
      for (let ls = 0; ls < 40; ls++) {
        xn = Float64Array.from(x, (v, i) => v + a * dir[i]);
        nxt = fn(xn, false);
        if (isF(nxt.f) && nxt.f <= cur.f + 1e-4 * a * slope) break;
        a *= 0.5; nxt = null;
      }
      if (!nxt) { converged = gmax < (opts.tolFallback ?? 1e-3); break; } // batas presisi numerik f
      nxt = fn(xn, true);
      const s = Float64Array.from(xn, (v, i) => v - x[i]), y = Float64Array.from(nxt.g, (v, i) => v - cur.g[i]);
      let sy = 0; for (let i = 0; i < P; i++) sy += s[i] * y[i];
      if (sy > 1e-12) {
        const Hy = new Float64Array(P);
        for (let i = 0; i < P; i++) { let t = 0; for (let j = 0; j < P; j++) t += H[i][j] * y[j]; Hy[i] = t; }
        let yHy = 0; for (let i = 0; i < P; i++) yHy += y[i] * Hy[i];
        const c1 = (sy + yHy) / (sy * sy);
        for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) H[i][j] += c1 * s[i] * s[j] - (Hy[i] * s[j] + s[i] * Hy[j]) / sy;
      }
      x = xn; cur = nxt;
      if (opts.progress) opts.progress(it);
      yield it;
    }
    return { x, f: cur.f, g: cur.g, iterations: it, converged };
  }
  function drive(gen) { let r = gen.next(); while (!r.done) r = gen.next(); return r.value; }
  async function driveAsync(gen, shouldCancel) {
    let r = gen.next();
    while (!r.done) { if (shouldCancel && shouldCancel()) throw new Error("dibatalkan"); await new Promise((ok) => setTimeout(ok, 0)); r = gen.next(); }
    return r.value;
  }
  function bfgs(fn, x0, opts = {}) { return drive(bfgsSteps(fn, x0, opts)); }

  /** Kovarians lewat pseudo-invers Hessian -logL (tanpa penalti) pada komplemen ruang nol. */
  function* covarianceSteps(mod, x, progress) {
    const P = mod.P, h = 1e-4;
    const H = Array.from({ length: P }, () => new Float64Array(P));
    for (let k = 0; k < P; k++) {
      const xp = Float64Array.from(x), xm = Float64Array.from(x);
      xp[k] += h; xm[k] -= h;
      const gp = objective(mod, xp, true, false).g, gm = objective(mod, xm, true, false).g;
      for (let j = 0; j < P; j++) H[j][k] = (gp[j] - gm[j]) / (2 * h);
      if (progress) progress(k + 1, P);
      yield k;
    }
    for (let i = 0; i < P; i++) for (let j = i + 1; j < P; j++) { const v = (H[i][j] + H[j][i]) / 2; H[i][j] = v; H[j][i] = v; }
    // ruang nol: geser semua delta (dikotomus/PCM); RSM: geser b, dan b+ / tau- bersamaan
    const U = [];
    if (mod.model === "rsm") {
      const u1 = new Float64Array(P), u2 = new Float64Array(P);
      for (let i = 0; i < mod.L; i++) { u1[i] = 1; u2[i] = 1; }
      for (let j = 0; j < mod.M; j++) u2[mod.L + j] = -1;
      U.push(u1, u2);
    } else U.push(new Float64Array(P).fill(1));
    const ortho = [];
    for (const u of U) {
      const v = Float64Array.from(u);
      for (const w of ortho) { let d = 0; for (let i = 0; i < P; i++) d += v[i] * w[i]; for (let i = 0; i < P; i++) v[i] -= d * w[i]; }
      let nrm = 0; for (const t of v) nrm += t * t; nrm = Math.sqrt(nrm);
      ortho.push(v.map((t) => t / nrm));
    }
    const A = H.map((row, i) => Array.from(row, (v, j) => v + ortho.reduce((s, w) => s + w[i] * w[j], 0)));
    const inv = E.inverse(A);
    if (!inv) return null;
    return inv.map((row, i) => row.map((v, j) => v - ortho.reduce((s, w) => s + w[i] * w[j], 0)));
  }

  function estimate(res, opts = {}) { return drive(estimateSteps(res, opts)); }
  function estimateAsync(res, opts = {}) { return driveAsync(estimateSteps(res, opts), opts.shouldCancel); }

  function* estimateSteps(res, opts) {
    const mod = makeModel(res);
    if (mod.persons.length < 2 || mod.L < 2) return { error: "data tidak cukup untuk CMLE" };
    const t0 = Date.now();
    const fn = (x, g) => objective(mod, x, g, true);
    const nInfo = Math.max(1, mod.persons.length * 0.25);
    const opt = yield* bfgsSteps(fn, startValues(mod, res), { h0: 1 / nInfo, tol: opts.tol ?? 1e-4, maxIter: opts.maxIter ?? 1000, progress: opts.progress });
    const x = opt.x;
    const loc = mod.location(x), lm = loc.reduce((s, v) => s + v, 0) / mod.L;
    const b = loc.map((v) => v - lm);
    let se = b.map(() => NaN), tauSe = null;
    const withSe = opts.se !== false && mod.P <= (opts.maxSeParams ?? 220);
    let cov = null;
    if (withSe) cov = yield* covarianceSteps(mod, x, opts.seProgress);
    if (cov) {
      // vektor bobot untuk lokasi item terpusat
      const wvec = (i) => {
        const w = new Float64Array(mod.P);
        const add = (k, val) => {
          if (mod.model === "rsm") w[k] += val;
          else for (let j = 0; j < mod.m[k]; j++) w[mod.off[k] + j] += val / mod.m[k];
        };
        add(i, 1); for (let k = 0; k < mod.L; k++) add(k, -1 / mod.L);
        return w;
      };
      const quad = (w) => { let s = 0; for (let i = 0; i < mod.P; i++) if (w[i]) for (let j = 0; j < mod.P; j++) if (w[j]) s += w[i] * cov[i][j] * w[j]; return s; };
      se = b.map((_, i) => Math.sqrt(Math.max(quad(wvec(i)), 0)));
      if (mod.model === "rsm") {
        tauSe = Array.from({ length: mod.M }, (_, j) => {
          const w = new Float64Array(mod.P); for (let k = 0; k < mod.M; k++) w[mod.L + k] = (k === j ? 1 : 0) - 1 / mod.M;
          return Math.sqrt(Math.max(quad(w), 0));
        });
      }
    }
    const jm = res.jmle;
    const items = mod.itemIdx.map((gi, i) => ({ item: res.coded.itemNames[gi], cmle: b[i], cmle_se: se[i], jmle: jm.itemMeasure[gi],
      jmle_uncorrected: jm.b[gi], difference: jm.itemMeasure[gi] - b[i] }));
    let tau = null;
    if (mod.model === "rsm") {
      const t = Array.from({ length: mod.M }, (_, j) => x[mod.L + j]), tm = t.reduce((s, v) => s + v, 0) / mod.M;
      const jt = jm.threshold[mod.itemIdx[0]];
      tau = t.map((v, j) => ({ threshold: j + 1, cmle: v - tm, cmle_se: tauSe ? tauSe[j] : NaN, jmle: jt[j] }));
    } else if (mod.model === "pcm") {
      const d = mod.deltas(x);
      items.forEach((row, i) => { row.cmle_thresholds = d[i].map((v) => v - lm - b[i]); row.jmle_thresholds = Array.from(jm.threshold[mod.itemIdx[i]]).slice(0, mod.m[i]); });
    }
    const a = items.map((r) => r.cmle), j = items.map((r) => r.jmle), ju = items.map((r) => r.jmle_uncorrected);
    const corr = (p, q) => { const mp = p.reduce((s, v) => s + v, 0) / p.length, mq = q.reduce((s, v) => s + v, 0) / q.length; let sx = 0, sy = 0, sxy = 0; p.forEach((v, k) => { sx += (v - mp) ** 2; sy += (q[k] - mq) ** 2; sxy += (v - mp) * (q[k] - mq); }); return { r: sxy / Math.sqrt(sx * sy), slope: sxy / sx }; };
    const cj = corr(a, j), cu = corr(a, ju);
    const rmsd = Math.sqrt(items.reduce((s, r) => s + r.difference ** 2, 0) / items.length);
    return {
      model: mod.model, converged: opt.converged, iterations: opt.iterations, loglik: -objective(mod, x, false, false).f,
      n_persons_used: mod.persons.length, n_items: mod.L, seconds: (Date.now() - t0) / 1000, se_available: !!cov,
      items, tau, r: cj.r, slope_jmle_on_cmle: cj.slope, slope_uncorrected_on_cmle: cu.slope, rmsd,
      max_abs_difference: Math.max(...items.map((r) => Math.abs(r.difference))),
    };
  }

  const api = { setEngine, estimate, estimateAsync, makeModel, evaluate, objective, polyMul, bfgs };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RaschCMLE = api;
})(typeof window !== "undefined" ? window : globalThis);
