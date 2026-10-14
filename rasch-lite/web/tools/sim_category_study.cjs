// Studi simulasi kategori Likert (RSM): bias tau menurut jumlah kategori (K), item (L), dan person (N),
// serta laju disordered threshold palsu bila threshold sebenarnya berurutan tetapi rapat.
// Jalankan dari folder rasch-lite:  node web/tools/sim_category_study.cjs [replikasi] > hasil.jsonl
const fs = require("fs"), path = require("path");
const W = path.join(__dirname, "..") + "/";
const T = JSON.parse(fs.readFileSync(W + "build/text.json", "utf8")); globalThis.RASCH_TEXT = T;
const E = require(W + "src/engine.js"); E.setText(T); globalThis.RaschEngine = E;
const A = require(W + "src/advanced.js"); A.setEngine(E);
const C = require(W + "src/cmle.js"); C.setEngine(E);
const reps = +process.argv[2] || 30;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const slope = (x, y) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0; x.forEach((v, k) => { sxy += (v - mx) * (y[k] - my); sxx += (v - mx) ** 2; }); return sxy / sxx; };
function run(K, L, N, spacing, tauGiven = null) {
  const m = K - 1, tau = tauGiven || Array.from({ length: m }, (_, k) => (k - (m - 1) / 2) * spacing);
  const b = Array.from({ length: L }, (_, i) => -1.5 + 3 * i / (L - 1));
  const est = { unc: tau.map(() => []), cor: tau.map(() => []), cml: tau.map(() => []) };
  let disJ = 0, disC = 0, used = 0, collapsed = 0;
  for (let r = 0; r < reps; r++) {
    const rng = A.rng(5000 + r * 7 + K * 101 + L * 13 + N);
    const g = () => { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
    const rows = [];
    for (let n = 0; n < N; n++) {
      const t = g();
      rows.push(["p" + n, ...b.map((bi) => { const psi = [0]; let s = 0; tau.forEach((tk) => { s += t - bi - tk; psi.push(s); });
        const mx = Math.max(...psi), ex = psi.map((v) => Math.exp(v - mx)), z = ex.reduce((a, c) => a + c, 0);
        let u = rng() * z, k = 0; while (u > ex[k] && k < ex.length - 1) { u -= ex[k]; k++; } return k; })]);
    }
    const cols = ["ID", ...b.map((_, i) => "I" + i)];
    let res;
    try { res = E.runAnalysis(E.prepareData({ columns: cols, rows }, { itemCols: cols.slice(1), idCol: "ID" }), "rsm", { runDif: false }); } catch (e) { collapsed++; continue; }
    if (res.coded.m[0] !== m) { collapsed++; continue; }
    const cm = C.estimate(res, { se: false });
    const jt = res.jmle.tau[0], bf = res.jmle.biasFactor;
    tau.forEach((_, k) => { est.unc[k].push(jt[k]); est.cor[k].push(jt[k] * bf); est.cml[k].push(cm.tau[k].cmle); });
    if (jt.some((v, k) => k > 0 && v < jt[k - 1])) disJ++;
    if (cm.tau.some((v, k) => k > 0 && v.cmle < cm.tau[k - 1].cmle)) disC++;
    used++;
  }
  const sl = (key) => +slope(tau, est[key].map(mean)).toFixed(3);
  return { K, L, N, spacing, tau: tau.join(" "), reps: used, collapsed, slope_uncorrected: sl("unc"), slope_corrected: sl("cor"), slope_cmle: sl("cml"),
    bias_factor: +((L - 1) / L).toFixed(3), pct_disordered_jmle: +(100 * disJ / Math.max(used, 1)).toFixed(1), pct_disordered_cmle: +(100 * disC / Math.max(used, 1)).toFixed(1) };
}
if (process.argv[3] === "disorder") {
  // threshold sebenarnya tidak berurutan (tau2 > tau3 sebesar 0,4 logit): daya deteksi JMLE vs CMLE
  for (const L of [5, 10, 20]) for (const N of [200, 500]) console.log(JSON.stringify(run(5, L, N, NaN, [-1.2, 0.2, -0.2, 1.2])));
} else {
  for (const spacing of [1.0, 0.4]) for (const K of [3, 5, 7]) for (const L of [5, 10, 20]) for (const N of [200, 500]) console.log(JSON.stringify(run(K, L, N, spacing)));
}
