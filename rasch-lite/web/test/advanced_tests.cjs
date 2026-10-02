// Uji modul lanjutan (advanced.js, cmle.js): jalankan  node web/test/advanced_tests.cjs
// Kebenaran diuji terhadap solusi bentuk tertutup, enumerasi brute-force, gradien numerik,
// dan studi pemulihan parameter pada data simulasi dengan parameter yang diketahui.
"use strict";
const { readFileSync } = require("fs");
const { join } = require("path");
const web = join(__dirname, "..");
const TEXT = JSON.parse(readFileSync(join(web, "build", "text.json"), "utf8"));
globalThis.RASCH_TEXT = TEXT;
const E = require(join(web, "src", "engine.js")); E.setText(TEXT); globalThis.RaschEngine = E;
const A = require(join(web, "src", "advanced.js")); A.setEngine(E);
const C = require(join(web, "src", "cmle.js")); C.setEngine(E);

let checks = 0, failures = 0;
function ok(cond, label, detail = "") { checks++; if (!cond) { failures++; console.log(`GAGAL  ${label} ${detail}`); } }
function near(a, b, tol, label) { ok(Math.abs(a - b) <= tol, label, `(${a} vs ${b}, tol ${tol})`); }

/** Data simulasi Rasch/PCM dengan parameter diketahui. */
function simulate({ N, b, tau = null, seed = 1, missing = 0, thetaSd = 1 }) {
  const r = A.rng(seed);
  const gauss = () => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const L = b.length, theta = [];
  const rows = [];
  for (let n = 0; n < N; n++) {
    const t = gauss() * thetaSd; theta.push(t);
    rows.push(b.map((bi, i) => {
      if (missing && r() < missing) return null;
      const th = tau ? (Array.isArray(tau[0]) ? tau[i] : tau) : [0];
      const psi = [0]; let s = 0; th.forEach((tk) => { s += t - bi - tk; psi.push(s); });
      const mx = Math.max(...psi), ex = psi.map((v) => Math.exp(v - mx)), z = ex.reduce((a, c) => a + c, 0);
      let u = r() * z, k = 0; while (u > ex[k] && k < ex.length - 1) { u -= ex[k]; k++; }
      return k;
    }));
  }
  const columns = ["ID", ...b.map((_, i) => `I${String(i + 1).padStart(2, "0")}`)];
  return { table: { columns, rows: rows.map((row, n) => [`P${n}`, ...row]) }, theta };
}
const items = (t) => t.columns.slice(1);

// --- 1. Utilitas statistik -------------------------------------------------------------
near(A.chi2Sf(3.841458820694124, 1), 0.05, 1e-6, "chi2Sf df1");
near(A.chi2Sf(5.991464547107979, 2), 0.05, 1e-6, "chi2Sf df2");
near(A.chi2Sf(18.307038053275146, 10), 0.05, 1e-6, "chi2Sf df10");
near(A.binomUpper(3, 10, 0.25), 1 - (0.75 ** 10 + 10 * 0.25 * 0.75 ** 9 + 45 * 0.0625 * 0.75 ** 8), 1e-10, "binomUpper");
{
  const q = A.bhAdjust([0.01, 0.04, 0.03, 0.2]);
  // urutan p: 0,01 0,03 0,04 0,2 -> p*m/r = 0,04 0,06 0,0533 0,2 -> minimum kumulatif dari atas
  near(q[0], 0.04, 1e-12, "BH q1"); near(q[1], 0.16 / 3, 1e-12, "BH q2"); near(q[2], 0.16 / 3, 1e-12, "BH q3"); near(q[3], 0.2, 1e-12, "BH q4");
}
near(A.spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7]), 0.8207826816681233, 1e-12, "spearman ties");
// regresi logistik: pada solusi ML, persamaan skor sum (y - p) x = 0
{
  const x = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4], y = [0, 0, 0, 1, 0, 1, 1, 1, 1, 1];
  const fit = A.logistic(x.map((v) => [1, v]), y);
  let s0 = 0, s1 = 0;
  x.forEach((v, k) => { const p = 1 / (1 + Math.exp(-(fit.beta[0] + fit.beta[1] * v))); s0 += y[k] - p; s1 += (y[k] - p) * v; });
  ok(Math.abs(s0) < 1e-8 && Math.abs(s1) < 1e-8, "logistic persamaan skor", `${s0} ${s1}`);
}

// --- 2. Blok dan struktur data kosong ---------------------------------------------------
{
  const bl = A.detectBlocks(["S1_01", "S1_02", "S1_03", "S2_01", "S2_02"]);
  ok(bl.detected && bl.blocks.length === 2 && bl.blocks[1].items.join() === "3,4", "detectBlocks awalan");
  ok(!A.detectBlocks(["Q1", "Q2", "Q3"]).detected, "detectBlocks satu blok");
  ok(A.detectBlocks(["A1", "A2", "B1", "B2"]).detected, "detectBlocks tanpa pemisah");
  const table = { columns: ["ID", "S1_01", "S1_02", "S1_03", "S2_01", "S2_02"], rows: [
    ["a", 1, null, 1, 1, null], ["b", 1, 0, null, null, null], ["c", 0, 1, 1, 1, 0], ["d", 1, 1, 0, 0, 1]] };
  const prep = E.prepareData(table, { itemCols: table.columns.slice(1), idCol: "ID" });
  const ms = A.missingStructure(prep, A.detectBlocks(prep.itemNames));
  ok(ms.type[0][1] === 1 && ms.type[0][4] === 2, "omitted vs not-reached (a)");
  ok(ms.type[1][2] === 2 && ms.type[1][3] === 2 && ms.type[1][4] === 2, "blok tidak dikerjakan = not-reached (b)");
  ok(ms.omitted === 1 && ms.notReached === 4, "jumlah omitted/NR", `${ms.omitted}/${ms.notReached}`);
  const tr = A.applyTreatment(prep, ms, "lo1999");
  ok(tr.calibPrep.raw[0][1] === 0 && Number.isNaN(tr.calibPrep.raw[0][4]), "Ludlow-O'Leary: omitted=0, NR=missing");
  ok(tr.scoringRaw.raw[1][4] === 0, "Ludlow-O'Leary: penskoran NR=0");
  const tr2 = A.applyTreatment(prep, ms, "allwrong");
  ok(tr2.calibPrep.raw.every((r) => r.every((v) => !Number.isNaN(v))), "allwrong: tanpa missing");
}

// --- 3. Jawaban mentah + kunci ----------------------------------------------------------
{
  const t = { columns: ["ID", "Q1", "Q2", "Q3"], rows: [["KUNCI", "A", "B;D", "C/D"], ["p1", "a", "D;B", "d"], ["p2", "B", "B", ""], ["p3", "A", "b;d;", "C"]] };
  const k = A.findKeyRow(t, "ID");
  ok(k === 0, "findKeyRow");
  const sc = A.scoreWithKey(t, k, ["Q1", "Q2", "Q3"]);
  ok(JSON.stringify(sc.table.rows.map((r) => r.slice(1))) === JSON.stringify([[1, 1, 1], [0, 0, null], [1, 1, 1]]), "scoreWithKey", JSON.stringify(sc.table.rows));
  ok(A.normAnswer(" b;D; ") === "B;D", "normAnswer opsi ganda");
}

// --- 4. CMLE ------------------------------------------------------------------------------
{
  // (a) dua item, data lengkap: b2 - b1 = ln(n10 / n01)
  const rows = []; let id = 0;
  const add = (x1, x2, k) => { for (let i = 0; i < k; i++) rows.push([`p${id++}`, x1, x2]); };
  add(1, 0, 30); add(0, 1, 12); add(1, 1, 25); add(0, 0, 9);
  const prep = E.prepareData({ columns: ["ID", "A", "B"], rows }, { itemCols: ["A", "B"], idCol: "ID" });
  const res = E.runAnalysis(prep, "dichotomous", { runDif: false });
  const cm = C.estimate(res, {});
  near(cm.items[1].cmle - cm.items[0].cmle, Math.log(30 / 12), 1e-5, "CMLE 2 item bentuk tertutup");
  // SE bentuk tertutup: var(ln OR) = 1/n10 + 1/n01; untuk selisih b; SE item terpusat = setengahnya
  near(cm.items[0].cmle_se, 0.5 * Math.sqrt(1 / 30 + 1 / 12), 2e-3, "CMLE SE 2 item");
}
{
  // (b) gradien analitik vs numerik dan ESF vs enumerasi (PCM kecil dengan data kosong)
  const sim = simulate({ N: 60, b: [-0.5, 0.2, 0.6], tau: [[-0.8, 0.8], [-0.3, 0.3], [-1, 0.2]], seed: 7, missing: 0.1 });
  const prep = E.prepareData(sim.table, { itemCols: items(sim.table), idCol: "ID" });
  const res = E.runAnalysis(prep, "pcm", { runDif: false });
  const mod = C.makeModel(res);
  const x = Float64Array.from({ length: mod.P }, (_, k) => 0.3 * Math.sin(k + 1));
  const g = C.objective(mod, x, true, true).g;
  let worst = 0;
  for (let k = 0; k < mod.P; k++) {
    const xp = Float64Array.from(x), xm = Float64Array.from(x); xp[k] += 1e-6; xm[k] -= 1e-6;
    const num = (C.objective(mod, xp, false, true).f - C.objective(mod, xm, false, true).f) / 2e-6;
    worst = Math.max(worst, Math.abs(num - g[k]));
  }
  ok(worst < 1e-4, "CMLE gradien analitik = numerik (PCM, missing)", `selisih ${worst}`);
  // log-likelihood bersyarat dibandingkan enumerasi langsung semua pola dengan skor yang sama
  const d = mod.deltas(x);
  let nllEnum = 0;
  for (const p of mod.persons) {
    const ms = p.items.map((i) => mod.m[i]);
    const eta = (i, k) => d[i].slice(0, k).reduce((s, v) => s + v, 0);
    let denom = 0;
    const rec = (k, s, acc) => { if (k === ms.length) { if (s === p.r) denom += Math.exp(-acc); return; } for (let c = 0; c <= ms[k]; c++) rec(k + 1, s + c, acc + eta(p.items[k], c)); };
    rec(0, 0, 0);
    nllEnum += p.items.reduce((s, i, k) => s + eta(i, p.xs[k]), 0) + Math.log(denom);
  }
  near(C.evaluate(mod, x, false).nll, nllEnum, 1e-8, "CMLE ESF = enumerasi");
}
for (const [model, tau] of [["dichotomous", null], ["rsm", [-1.2, -0.2, 1.4]], ["pcm", null]]) {
  // (c) pemulihan parameter: JMLE (terkoreksi) dan CMLE terhadap parameter pembangkit
  const b = Array.from({ length: 20 }, (_, i) => -2 + 4 * i / 19);
  const bc = b.map((v) => v - b.reduce((s, x) => s + x, 0) / b.length);
  const tauP = model === "pcm" ? bc.map((_, i) => [-0.6 - 0.05 * i, 0.6 + 0.05 * i]) : tau;
  const sim = simulate({ N: 600, b: bc, tau: tauP, seed: 11 + bc.length, missing: 0.05 });
  const prep = E.prepareData(sim.table, { itemCols: items(sim.table), idCol: "ID" });
  const res = E.runAnalysis(prep, model, { runDif: false });
  const cm = C.estimate(res, { se: model === "dichotomous" });
  ok(cm.converged, `CMLE konvergen (${model})`);
  const errC = cm.items.map((r, i) => r.cmle - bc[i]), errJ = cm.items.map((r, i) => r.jmle - bc[i]);
  const rmse = (e) => Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length);
  ok(rmse(errC) < 0.15, `pemulihan CMLE ${model}`, `RMSE ${rmse(errC).toFixed(3)}`);
  ok(rmse(errJ) < 0.15, `pemulihan JMLE ${model}`, `RMSE ${rmse(errJ).toFixed(3)}`);
  ok(cm.r > 0.99, `korelasi JMLE-CMLE ${model}`, cm.r);
  if (model === "dichotomous") {
    const cover = cm.items.filter((r, i) => Math.abs(r.cmle - bc[i]) <= 1.96 * r.cmle_se).length / cm.items.length;
    ok(cover >= 0.8, "cakupan IK 95% CMLE", cover);
  }
  if (model === "rsm") cm.tau.forEach((t, j) => near(t.cmle, tau[j] - tau.reduce((s, v) => s + v, 0) / tau.length, 0.15, `tau RSM ${j + 1}`));
}

// --- 5. Person fit lz* dan kualitas respons --------------------------------------------
{
  const b = Array.from({ length: 30 }, (_, i) => -2.5 + 5 * i / 29);
  // data bersih: lz* mendekati N(0, 1)
  const clean = simulate({ N: 400, b, seed: 4 });
  const pc = E.prepareData(clean.table, { itemCols: items(clean.table), idCol: "ID" });
  const pqc = A.personQuality(E.runAnalysis(pc, "dichotomous", { runDif: false }), null, {});
  const lz = pqc.rows.map((x) => x.lz_star).filter(Number.isFinite);
  const m = lz.reduce((s, v) => s + v, 0) / lz.length, s = Math.sqrt(lz.reduce((a, v) => a + (v - m) ** 2, 0) / lz.length);
  ok(Math.abs(m) < 0.15 && Math.abs(s - 1) < 0.15, "lz* ~ N(0,1) pada data patuh model", `${m.toFixed(3)} / ${s.toFixed(3)}`);
  ok(pqc.n_underfit / pqc.n_nonextreme < 0.09, "laju positif palsu lz* pada data bersih", pqc.n_underfit / pqc.n_nonextreme);
  // 20 person terakhir menjawab acak (p = 0,5)
  const sim = simulate({ N: 400, b, seed: 3 });
  const r = A.rng(99);
  sim.table.rows.slice(-20).forEach((row) => { for (let j = 1; j < row.length; j++) row[j] = r() < 0.5 ? 1 : 0; });
  const prep = E.prepareData(sim.table, { itemCols: items(sim.table), idCol: "ID" });
  const res = E.runAnalysis(prep, "dichotomous", { runDif: false });
  const pq = A.personQuality(res, null, { nOptions: 2 });
  const hit = pq.rows.slice(-20).filter((x) => x.flag_underfit).length;
  ok(hit >= 14, "lz* mendeteksi responden acak", `${hit}/20`);
  ok(pq.rows.slice(-20).filter((x) => x.flag_chance).length >= 15, "skor setara tebakan (2 opsi)");
}

// --- 6. Simulasi ambang dan dimensionalitas ---------------------------------------------
(async () => {
  {
    const b = Array.from({ length: 24 }, (_, i) => -2 + 4 * i / 23);
    const sim = simulate({ N: 300, b, seed: 5, missing: 0.05 });
    const prep = E.prepareData(sim.table, { itemCols: items(sim.table), idCol: "ID" });
    const res = E.runAnalysis(prep, "dichotomous", { runDif: false });
    const s = await A.simulate(res, prep, 12, { seed: 1 });
    ok(s.reps === 12 && s.failed === 0, "simulasi berjalan");
    ok(s.eig_p95 > 1.3 && s.eig_p95 < 2.6, "eigenvalue acak pada data unidimensional", s.eig_p95);
    ok(res.dimensionality.first_contrast_eigenvalue < s.eig_p95 + 0.6, "data unidimensional tidak melampaui ambang jauh");
    ok(s.recovery_rmse < 0.3 && s.recovery_coverage > 0.85, "pemulihan dalam simulasi", `${s.recovery_rmse} ${s.recovery_coverage}`);
    // dua dimensi: dua blok dengan theta tidak berkorelasi
    const r = A.rng(8);
    const g = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const rows = [];
    for (let n = 0; n < 300; n++) {
      const t1 = g(), t2 = g();
      rows.push([`p${n}`, ...b.map((bi, i) => (r() < 1 / (1 + Math.exp(-((i < 12 ? t1 : t2) - bi))) ? 1 : 0))]);
    }
    const cols = ["ID", ...b.map((_, i) => (i < 12 ? `A_${i}` : `B_${i}`))];
    const p2 = E.prepareData({ columns: cols, rows }, { itemCols: cols.slice(1), idCol: "ID" });
    const r2 = E.runAnalysis(p2, "dichotomous", { runDif: false });
    const bl = A.detectBlocks(p2.itemNames);
    const de = A.dimensionExtras(r2, bl, null);
    ok(bl.detected && de.blockPairs.length === 1, "blok terdeteksi");
    ok(de.blockPairs[0].r_disattenuated < 0.4, "korelasi terdisatenuasi rendah untuk dua dimensi", de.blockPairs[0].r_disattenuated);
    ok(de.blockPairs[0].smith_pct > 10, "uji t Smith > 5%", de.blockPairs[0].smith_pct);
    ok(Math.abs(de.blockRows[0].mean_loading - de.blockRows[1].mean_loading) > 0.4, "loading per blok berlawanan");
  }
  // --- 7. DIF yang ditanam terdeteksi; MDC dihitung -------------------------------------
  {
    const b = Array.from({ length: 20 }, (_, i) => -2 + 4 * i / 19);
    const r = A.rng(21);
    const g = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const rows = [];
    for (let n = 0; n < 800; n++) {
      const grp = n % 2 ? "F" : "M", t = g();
      rows.push([`p${n}`, grp, ...b.map((bi, i) => { const bb = bi + (i === 4 && grp === "F" ? 1.0 : 0); return r() < 1 / (1 + Math.exp(-(t - bb))) ? 1 : 0; })]);
    }
    const cols = ["ID", "G", ...b.map((_, i) => `I${i}`)];
    const prep = E.prepareData({ columns: cols, rows }, { itemCols: cols.slice(2), idCol: "ID", groupCol: "G" });
    const res = E.runAnalysis(prep, "dichotomous", {});
    const dx = A.difExtras(res, prep);
    const row = dx.table.find((x) => x.item === "I4");
    ok(row.flag && row.mh_ets !== "A", "DIF tertanam terdeteksi (Rasch-Welch + MH)", JSON.stringify({ c: row.contrast, q: row.q, mh: row.mh_delta }));
    ok(dx.table.filter((x) => x.flag).length <= 2, "DIF palsu sedikit", dx.table.filter((x) => x.flag).map((x) => x.item).join());
    ok(dx.mdc_median > 0 && dx.mdc_median < 0.64, "MDC pada n = 400 per kelompok", dx.mdc_median);
    ok(Math.abs(dx.dtf.mean_diff) > 0.05, "DTF menangkap dampak DIF", dx.dtf.mean_diff);
    // tiga kelompok
    rows.forEach((rw, n) => { rw[1] = ["X", "Y", "Z"][n % 3]; });
    const p3 = E.prepareData({ columns: cols, rows }, { itemCols: cols.slice(2), idCol: "ID", groupCol: "G" });
    const r3 = E.runAnalysis(p3, "dichotomous", {});
    const d3 = A.difExtras(r3, p3);
    ok(d3.n_groups === 3 && d3.omnibus.length === 20, "DIF tiga kelompok (omnibus)");
  }
  console.log(`${checks - failures}/${checks} pemeriksaan lulus`);
  process.exit(failures ? 1 : 0);
})();
