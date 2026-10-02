/* RaschLite: sepuluh grafik dalam SVG murni (padanan plots/charts.py).
 *
 * Grafik dibangun dengan pustaka plot mini di bawah (sumbu, tick, grid, legenda) tanpa
 * dependensi pihak ketiga. Teks grafik memakai istilah Rasch berbahasa Inggris; penjelasan
 * berbahasa Indonesia ada di panel "Cara membaca grafik ini". Setiap tanda memiliki
 * tooltip (<title>) sehingga nilai dapat dibaca dengan mengarahkan kursor.
 */
(function (root) {
  "use strict";
  let TEXT = root.RASCH_TEXT || null;
  let E = root.RaschEngine || null;
  function setText(t) { TEXT = t; }
  function setEngine(e) { E = e; }
  const TH = () => TEXT.theme;
  const FONT = "'Segoe UI', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";

  function num(x, d = 2) { return root.RaschInterpret ? root.RaschInterpret.num(x, d) : (isFinite(x) ? x.toFixed(d).replace(".", ",") : "-"); }
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const isF = (v) => typeof v === "number" && isFinite(v);
  const fmt = (v) => (Math.abs(v) < 1e-9 ? "0" : (Math.round(v * 1e6) / 1e6).toString().replace("-", "−"));

  function niceTicks(lo, hi, count = 6) {
    if (!(hi > lo)) return [lo];
    const span = hi - lo;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
    return out;
  }

  /** Satu panel plot: koordinat data -> piksel. */
  class Panel {
    constructor(svg, x, y, w, h, xdom, ydom, opts = {}) {
      Object.assign(this, { svg, x, y, w, h, xdom, ydom, opts });
    }
    sx(v) { const [a, b] = this.xdom; return this.opts.invertX ? this.x + this.w - (v - a) / (b - a) * this.w : this.x + (v - a) / (b - a) * this.w; }
    sy(v) { const [a, b] = this.ydom; return this.y + this.h - (v - a) / (b - a) * this.h; }
    frame({ xTicks, yTicks, xLabels, yLabels, xGrid = true, yGrid = true, xTickLabels = true, yTickLabels = true, rightAxis = false } = {}) {
      const t = TH(), s = this.svg;
      const xt = xTicks || niceTicks(this.xdom[0], this.xdom[1], Math.max(3, Math.round(this.w / 110)));
      const yt = yTicks || niceTicks(this.ydom[0], this.ydom[1], Math.max(3, Math.round(this.h / 70)));
      s.push(`<rect x="${this.x}" y="${this.y}" width="${this.w}" height="${this.h}" fill="${t.CHART_BG}"/>`);
      if (xGrid) for (const v of xt) s.push(`<line x1="${this.sx(v)}" y1="${this.y}" x2="${this.sx(v)}" y2="${this.y + this.h}" stroke="${t.CHART_GRID}" stroke-width="1"/>`);
      if (yGrid) for (const v of yt) s.push(`<line x1="${this.x}" y1="${this.sy(v)}" x2="${this.x + this.w}" y2="${this.sy(v)}" stroke="${t.CHART_GRID}" stroke-width="1"/>`);
      s.push(`<line x1="${this.x}" y1="${this.y + this.h}" x2="${this.x + this.w}" y2="${this.y + this.h}" stroke="${t.CHART_AXIS}"/>`);
      s.push(`<line x1="${this.x}" y1="${this.y}" x2="${this.x}" y2="${this.y + this.h}" stroke="${t.CHART_AXIS}"/>`);
      if (xTickLabels) xt.forEach((v, k) => s.push(text(this.sx(v), this.y + this.h + 16, xLabels ? xLabels[k] : fmt(v), { anchor: "middle", size: 11, color: t.INK_SECONDARY })));
      if (yTickLabels) yt.forEach((v, k) => s.push(text(this.x - 7, this.sy(v) + 4, yLabels ? yLabels[k] : fmt(v), { anchor: "end", size: 11, color: t.INK_SECONDARY })));
      return this;
    }
    clip(id) { this.svg.push(`<clipPath id="${id}"><rect x="${this.x}" y="${this.y}" width="${this.w}" height="${this.h}"/></clipPath>`); return `clip-path="url(#${id})"`; }
    line(xs, ys, color, width = 2, extra = "") {
      const pts = [];
      xs.forEach((v, k) => { if (isF(v) && isF(ys[k])) pts.push(`${this.sx(v).toFixed(2)},${this.sy(ys[k]).toFixed(2)}`); });
      this.svg.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" ${extra}/>`);
    }
    vline(v, color, width = 1, extra = "") { this.svg.push(`<line x1="${this.sx(v)}" y1="${this.y}" x2="${this.sx(v)}" y2="${this.y + this.h}" stroke="${color}" stroke-width="${width}" ${extra}/>`); }
    hline(v, color, width = 1, extra = "") { this.svg.push(`<line x1="${this.x}" y1="${this.sy(v)}" x2="${this.x + this.w}" y2="${this.sy(v)}" stroke="${color}" stroke-width="${width}" ${extra}/>`); }
    vspan(a, b, color, opacity) {
      const x1 = Math.min(this.sx(a), this.sx(b)), x2 = Math.max(this.sx(a), this.sx(b));
      this.svg.push(`<rect x="${x1}" y="${this.y}" width="${x2 - x1}" height="${this.h}" fill="${color}" fill-opacity="${opacity}"/>`);
    }
    hspan(a, b, color, opacity) {
      const y1 = Math.min(this.sy(a), this.sy(b)), y2 = Math.max(this.sy(a), this.sy(b));
      this.svg.push(`<rect x="${this.x}" y="${y1}" width="${this.w}" height="${y2 - y1}" fill="${color}" fill-opacity="${opacity}"/>`);
    }
    point(x, y, r, color, tip, extra = "") {
      if (!isF(x) || !isF(y)) return;
      this.svg.push(`<circle cx="${this.sx(x).toFixed(2)}" cy="${this.sy(y).toFixed(2)}" r="${r}" fill="${color}" stroke="${TH().CHART_BG}" stroke-width="1.5" ${extra}>${tip ? `<title>${esc(tip)}</title>` : ""}</circle>`);
    }
    xlabel(s) { this.svg.push(text(this.x + this.w / 2, this.y + this.h + 38, s, { anchor: "middle", size: 12, color: TH().INK_SECONDARY })); }
    ylabel(s, offset = 46) {
      const cx = this.x - offset, cy = this.y + this.h / 2;
      this.svg.push(`<text transform="translate(${cx},${cy}) rotate(-90)" text-anchor="middle" font-size="12" fill="${TH().INK_SECONDARY}" font-family="${FONT}">${esc(s)}</text>`);
    }
  }

  function text(x, y, s, { anchor = "start", size = 11, color = null, weight = "normal" } = {}) {
    return `<text x="${typeof x === "number" ? x.toFixed(2) : x}" y="${typeof y === "number" ? y.toFixed(2) : y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color || TH().INK}" font-family="${FONT}">${esc(s)}</text>`;
  }

  function figure(w, h, title, subtitle) {
    const svg = [];
    svg.w = w; svg.h = h;
    svg.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${TH().CHART_BG}"/>`);
    if (title) svg.push(text(16, 24, title, { size: 16, weight: "bold" }));
    if (subtitle) svg.push(text(16, 42, subtitle, { size: 12, color: TH().INK_SECONDARY }));
    return svg;
  }
  function finish(svg, title) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svg.w} ${svg.h}" width="${svg.w}" height="${svg.h}" role="img" aria-label="${esc(title)}" font-family="${FONT}">${svg.join("")}</svg>`;
  }

  /** Legenda; items: [{label, color, kind: line|dot|patch|diamond|none, opacity}] */
  function legend(svg, x, y, items, { cols = 1, colWidth = 190, size = 11 } = {}) {
    items.forEach((it, k) => {
      const cx = x + (k % cols) * colWidth, cy = y + Math.floor(k / cols) * 18;
      if (it.kind === "line") svg.push(`<line x1="${cx}" y1="${cy - 4}" x2="${cx + 22}" y2="${cy - 4}" stroke="${it.color}" stroke-width="${it.width || 2.5}"/>`);
      else if (it.kind === "patch") svg.push(`<rect x="${cx}" y="${cy - 10}" width="22" height="11" fill="${it.color}" fill-opacity="${it.opacity ?? 0.3}"/>`);
      else if (it.kind === "diamond") svg.push(`<path d="M${cx + 11} ${cy - 10} l6 6 l-6 6 l-6 -6 z" fill="${it.color}"/>`);
      else if (it.kind === "dot") svg.push(`<circle cx="${cx + 11}" cy="${cy - 4}" r="5" fill="${it.color}"/>`);
      svg.push(text(cx + (it.kind === "none" ? 0 : 28), cy, it.label, { size, color: TH().INK }));
    });
  }

  // ------------------------------------------------------------------------------------
  // Helper data
  // ------------------------------------------------------------------------------------
  const finiteRow = (row) => Array.from(row).filter(isF);
  function itemIndex(res, item) { return res.coded.itemNames.indexOf(item); }
  function linspace(a, b, n) { const out = []; for (let k = 0; k < n; k++) out.push(a + (b - a) * k / (n - 1)); return out; }
  function thetaGrid(res, extra, pad = 1, n = 400) {
    const th = Array.from(res.jmle.theta).filter(isF);
    let vals = [Math.min(...th), Math.max(...th)];
    if (extra && extra.length) vals = vals.concat([Math.min(...extra), Math.max(...extra)]);
    return linspace(Math.max(Math.min(...vals) - pad, -8), Math.min(Math.max(...vals) + pad, 8), n);
  }
  function probs(grid, deltaRow) {
    const d = finiteRow(deltaRow);
    const mom = E.moments(grid, [Float64Array.from(d)], d.length);
    const K = d.length + 1;
    return grid.map((_, g) => Array.from({ length: K }, (_, k) => mom.P[g * K + k]));
  }
  function categoryColors(n) {
    const S = TH().SERIES;
    if (n <= S.length) return S.slice(0, n);
    const cividis = ["#00224e", "#35456c", "#666970", "#948e77", "#c8b866", "#fee838"];
    return Array.from({ length: n }, (_, k) => interpColor(cividis, 0.05 + 0.9 * k / (n - 1)));
  }
  function hexToRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function interpColor(stops, t) {
    t = Math.max(0, Math.min(1, t));
    const p = t * (stops.length - 1), i = Math.min(Math.floor(p), stops.length - 2), f = p - i;
    const a = hexToRgb(stops[i]), b = hexToRgb(stops[i + 1]);
    return "#" + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, "0")).join("");
  }
  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /** Bin measure person (kuantil) dengan rerata dan IK 95% (Wilson atau t). */
  function empiricalBins(theta, x, dichotomous) {
    const n = theta.length;
    const nBins = Math.max(6, Math.min(10, Math.floor(n / 40)));
    const sorted = theta.slice().sort((a, b) => a - b);
    const edges = Array.from(new Set(linspace(0, 1, nBins + 1).map((q) => quantile(sorted, q)))).sort((a, b) => a - b);
    const out = [];
    for (let b = 0; b < edges.length - 1; b++) {
      const sel = [];
      theta.forEach((t, k) => {
        let idx = edges.findIndex((e, j) => j < edges.length - 1 && t >= e && (j === edges.length - 2 || t < edges[j + 1]));
        if (idx < 0) idx = t < edges[0] ? 0 : edges.length - 2;
        if (idx === b) sel.push(k);
      });
      const m = sel.length;
      if (!m) continue;
      const xm = sel.reduce((s, k) => s + theta[k], 0) / m;
      const ym = sel.reduce((s, k) => s + x[k], 0) / m;
      let lo, hi;
      if (dichotomous) {
        const z = 1.959964, den = 1 + z * z / m;
        const c = (ym + z * z / (2 * m)) / den;
        const half = z * Math.sqrt(ym * (1 - ym) / m + z * z / (4 * m * m)) / den;
        lo = c - half; hi = c + half;
      } else {
        let sd = 0;
        if (m > 1) { for (const k of sel) sd += (x[k] - ym) ** 2; sd = Math.sqrt(sd / (m - 1)); }
        const half = m > 1 ? E.stdtrit(Math.max(m - 1, 1), 0.975) * sd / Math.sqrt(m) : 0;
        lo = ym - half; hi = ym + half;
      }
      out.push([xm, ym, lo, hi, m]);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------
  // 1. Wright Map
  // ------------------------------------------------------------------------------------
  function wrightMap(res) {
    const t = TH(), poly = res.model !== "dichotomous";
    const pm = res.persons.map((p) => p.measure).filter(isF);
    const nExt = res.persons.filter((p) => p.extreme).length;
    const items = res.items.filter((r) => isF(r.measure)).slice().sort((a, b) => a.measure - b.measure);
    const loc = res.jmle.thresholdLocation;
    const count = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const title = "Wright Map";
    const svg = figure(900, 660, title, `${count(pm.length, "person")} (${count(nExt, "extreme score")}), ${count(items.length, "item")}`);
    let all = pm.concat(items.map((r) => r.measure));
    if (poly) all = all.concat(loc.flatMap(finiteRow));
    const lo = Math.min(...all) - 0.5, hi = Math.max(...all) + 0.5;
    const width = Math.max((hi - lo) / 36, 0.1);
    const edges = []; for (let v = lo; v < hi + width; v += width) edges.push(v);
    const counts = new Array(edges.length - 1).fill(0);
    for (const v of pm) { const k = Math.min(Math.floor((v - lo) / width), counts.length - 1); counts[k]++; }
    const maxC = Math.max(...counts);
    const pL = new Panel(svg, 70, 64, 240, 520, [0, maxC * 1.08], [lo, hi], { invertX: true });
    pL.frame({ yGrid: false });
    counts.forEach((c, k) => {
      if (!c) return;
      const y1 = pL.sy(edges[k + 1]), y2 = pL.sy(edges[k]);
      const gap = (y2 - y1) * 0.09;
      svg.push(`<rect x="${pL.sx(c)}" y="${y1 + gap}" width="${pL.sx(0) - pL.sx(c)}" height="${y2 - y1 - 2 * gap}" fill="${t.NAVY_SERIES}"><title>${esc(`${c} person, measure ${num(edges[k])} s.d. ${num(edges[k + 1])}`)}</title></rect>`);
    });
    const pmMean = pm.reduce((s, v) => s + v, 0) / pm.length;
    pL.hline(pmMean, t.INK_SECONDARY, 1);
    svg.push(`<rect x="${pL.x + 2}" y="${pL.sy(pmMean) - 15}" width="72" height="13" fill="${t.CHART_BG}" fill-opacity="0.85"/>`);
    svg.push(text(pL.x + 4, pL.sy(pmMean) - 4, "person mean", { size: 10, color: t.INK_SECONDARY }));
    pL.xlabel("Number of persons"); pL.ylabel("Measure (logit)", 40);
    const pR = new Panel(svg, 340, 64, 530, 520, [0, 1], [lo, hi]);
    pR.frame({ xGrid: false, xTickLabels: false, yTickLabels: false });
    pR.hline(0, t.INK_SECONDARY, 1);
    if (!poly) {
      const minGap = (hi - lo) * 11 / 400;
      const rows = [];
      for (const r of items) {
        if (rows.length && r.measure - rows[rows.length - 1][0].measure < minGap) rows[rows.length - 1].push(r);
        else rows.push([r]);
      }
      let prev = -Infinity;
      for (const members of rows) {
        const m = members.reduce((s, r) => s + r.measure, 0) / members.length;
        const y = Math.max(m, prev + minGap); prev = y;
        for (const r of members) svg.push(`<line x1="${pR.x + 8}" y1="${pR.sy(r.measure)}" x2="${pR.x + 24}" y2="${pR.sy(r.measure)}" stroke="${t.INK}" stroke-width="2"><title>${esc(`${r.item}: ${num(r.measure)} logit`)}</title></line>`);
        svg.push(`<line x1="${pR.x + 26}" y1="${pR.sy(m)}" x2="${pR.x + 36}" y2="${pR.sy(y)}" stroke="${t.NEUTRAL}" stroke-width="0.8"/>`);
        svg.push(text(pR.x + 40, pR.sy(y) + 4, members.map((r) => r.item).join("  "), { size: 11 }));
      }
      svg.push(text(pR.x + pR.w - 4, pR.sy(0) - 4, "item mean = 0", { anchor: "end", size: 10, color: t.INK_SECONDARY }));
      pR.xlabel("Items (easier below, harder above)");
    } else {
      const mMax = Math.max(...res.coded.m);
      const colors = categoryColors(mMax);
      const n = items.length;
      const xs = (k) => pR.x + (k + 0.5) / n * pR.w;
      items.forEach((r, k) => {
        const i = itemIndex(res, r.item);
        const row = loc[i];
        const fin = finiteRow(row);
        if (fin.length && res.coded.itemExtreme[i] === 0) {
          svg.push(`<line x1="${xs(k)}" y1="${pR.sy(Math.min(...fin))}" x2="${xs(k)}" y2="${pR.sy(Math.max(...fin))}" stroke="${t.NEUTRAL}" stroke-width="1.2"/>`);
          Array.from(row).forEach((v, j) => {
            if (isF(v)) svg.push(`<circle cx="${xs(k)}" cy="${pR.sy(v)}" r="4.5" fill="${colors[j]}" stroke="${t.CHART_BG}" stroke-width="1.2"><title>${esc(`${r.item} threshold ${j + 1}: ${num(v)} logit`)}</title></circle>`);
          });
        }
        const y = pR.sy(r.measure);
        svg.push(`<path d="M${xs(k)} ${y - 6} l6 6 l-6 6 l-6 -6 z" fill="${t.INK}" stroke="${t.CHART_BG}"><title>${esc(`${r.item}: item measure ${num(r.measure)} logit`)}</title></path>`);
        const rot = n > 10;
        svg.push(rot
          ? `<text transform="translate(${xs(k) + 4},${pR.y + pR.h + 8}) rotate(-90)" text-anchor="end" font-size="10" fill="${t.INK_SECONDARY}" font-family="${FONT}">${esc(r.item)}</text>`
          : text(xs(k), pR.y + pR.h + 16, r.item, { anchor: "middle", size: 10, color: t.INK_SECONDARY }));
      });
      legend(svg, pR.x + 8, pR.y + 18, [{ label: "Item measure", color: t.INK, kind: "diamond" }]
        .concat(colors.map((c, j) => ({ label: `Threshold ${j + 1}`, color: c, kind: "dot" }))), { cols: Math.min(6, mMax + 1), colWidth: 100, size: 10 });
      svg.push(text(pR.x + pR.w / 2, pR.y + pR.h + 62, "Items (ordered from easiest)", { anchor: "middle", size: 12, color: t.INK_SECONDARY }));
    }
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // 2. Item Characteristic Curve
  // ------------------------------------------------------------------------------------
  function icc(res, item) {
    const t = TH(), i = itemIndex(res, item), dich = res.model === "dichotomous";
    const delta = finiteRow(res.jmle.delta[i]);
    const th = [], xv = [];
    res.coded.personExtreme.forEach((v, n) => { if (v === 0 && !Number.isNaN(res.coded.X[n][i])) { th.push(res.jmle.theta[n]); xv.push(res.coded.X[n][i]); } });
    const grid = thetaGrid(res, delta);
    const P = probs(grid, delta);
    const curve = P.map((row) => row.reduce((s, p, k) => s + p * k, 0));
    const r = res.items[i];
    const title = `Item Characteristic Curve: ${item}`;
    const svg = figure(760, 480, title, `Measure ${num(r.measure)} logit · Infit MNSQ ${num(r.infit_mnsq)} · Outfit MNSQ ${num(r.outfit_mnsq)}`);
    const m = delta.length;
    const ydom = dich ? [-0.03, 1.03] : [-0.1, m + 0.1];
    const p = new Panel(svg, 78, 64, 650, 340, [grid[0], grid[grid.length - 1]], ydom);
    const labels = res.coded.categoryLabels[i];
    p.frame(dich ? {} : { yTicks: labels.map((_, k) => k), yLabels: labels });
    p.line(grid, curve, t.NAVY_SERIES, 2.5);
    const bins = th.length >= 12 ? empiricalBins(th, xv, dich) : [];
    for (const [bx, by, lo, hi, n] of bins) {
      svg.push(`<line x1="${p.sx(bx)}" y1="${p.sy(Math.max(lo, ydom[0]))}" x2="${p.sx(bx)}" y2="${p.sy(Math.min(hi, ydom[1]))}" stroke="${t.OCHRE}" stroke-width="1.5"/>`);
      p.point(bx, by, 5.5, t.OCHRE, `${n} person, rata-rata measure ${num(bx)}: observed ${num(by)} (IK 95% ${num(lo)} s.d. ${num(hi)})`);
    }
    legend(svg, p.x + 12, p.y + 20, [{ label: "Model curve", color: t.NAVY_SERIES, kind: "line" },
      { label: "Observed average per group (95% CI)", color: t.OCHRE, kind: "dot" }]);
    p.xlabel("Person measure (logit)");
    p.ylabel(dich ? "Probability of correct response" : "Expected score (category)", 50);
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // 3. Category Probability Curves
  // ------------------------------------------------------------------------------------
  function categoryCurves(res, item) {
    const t = TH(), i = itemIndex(res, item);
    const loc = finiteRow(res.jmle.thresholdLocation[i]);
    const tau = res.jmle.threshold[i].filter(isF);
    const labels = res.coded.categoryLabels[i];
    const grid = linspace(Math.min(...loc) - 3, Math.max(...loc) + 3, 400);
    const P = probs(grid, loc);
    const K = loc.length + 1;
    const colors = categoryColors(K);
    const dis = []; for (let k = 1; k < tau.length; k++) if (tau[k] < tau[k - 1]) dis.push(k);
    const title = `Category Probability Curves: ${item}`;
    const svg = figure(800, 480, title, dis.length ? "Disordered thresholds: at least one category is never the most probable response" : "Ordered thresholds");
    const p = new Panel(svg, 70, 64, 540, 340, [grid[0], grid[grid.length - 1]], [0, 1.08]);
    p.frame({ yTicks: [0, 0.2, 0.4, 0.6, 0.8, 1.0] });
    for (const k of dis) p.vspan(loc[k], loc[k - 1], t.PROBLEM, 0.08);
    loc.forEach((v, k) => {
      const bad = dis.includes(k) || dis.includes(k + 1);
      p.vline(v, bad ? t.PROBLEM : t.INK_MUTED, bad ? 1.8 : 0.9);
    });
    for (let k = 0; k < K; k++) {
      const ys = P.map((row) => row[k]);
      p.line(grid, ys, colors[k], 2.5);
      let j = 0; ys.forEach((v, q) => { if (v > ys[j]) j = q; });
      svg.push(text(p.sx(grid[j]), p.sy(ys[j]) - 6, labels[k], { anchor: "middle", size: 11 }));
    }
    const items = labels.map((l, k) => ({ label: `Category ${l}`, color: colors[k], kind: "line" }));
    items.push({ label: "Threshold", color: t.INK_MUTED, kind: "line", width: 1 });
    if (dis.length) items.push({ label: "Disordered threshold", color: t.PROBLEM, kind: "line", width: 2 });
    legend(svg, p.x + p.w + 20, p.y + 120, items);
    p.xlabel("Person measure (logit)"); p.ylabel("Category probability", 46);
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // 4. Expected Score Curve
  // ------------------------------------------------------------------------------------
  function expectedScore(res, item) {
    const t = TH(), i = itemIndex(res, item);
    const loc = finiteRow(res.jmle.thresholdLocation[i]);
    const labels = res.coded.categoryLabels[i];
    const m = loc.length;
    const grid = linspace(Math.min(...loc) - 3.5, Math.max(...loc) + 3.5, 800);
    const P = probs(grid, loc);
    const Ecurve = P.map((row) => row.reduce((s, p, k) => s + p * k, 0));
    const half = [];
    for (let k = 0; k < m; k++) {
      const target = k + 0.5;
      let j = Ecurve.findIndex((v) => v >= target);
      if (j <= 0) j = 1;
      const f = (target - Ecurve[j - 1]) / (Ecurve[j] - Ecurve[j - 1]);
      half.push(grid[j - 1] + f * (grid[j] - grid[j - 1]));
    }
    const bounds = [grid[0], ...half, grid[grid.length - 1]];
    const title = `Expected Score Curve: ${item}`;
    const svg = figure(760, 480, title, "Zones = measure ranges where the expected score is closest to each category");
    const p = new Panel(svg, 70, 64, 660, 340, [grid[0], grid[grid.length - 1]], [-0.1, m + 0.6]);
    p.frame({ yTicks: labels.map((_, k) => k), yLabels: labels });
    for (let k = 0; k <= m; k++) {
      if (k % 2 === 0) p.vspan(bounds[k], bounds[k + 1], t.CHART_GRID, 0.6);
      svg.push(text((p.sx(bounds[k]) + p.sx(bounds[k + 1])) / 2, p.sy(m + 0.3), labels[k], { anchor: "middle", size: 11 }));
    }
    for (const h of half) p.vline(h, t.INK_MUTED, 0.9);
    p.line(grid, Ecurve, t.NAVY_SERIES, 2.5);
    p.xlabel("Person measure (logit)"); p.ylabel("Expected score (category)", 46);
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // 5. Test Information Function and SEM
  // ------------------------------------------------------------------------------------
  function testInformation(res) {
    const t = TH();
    const ei = [];
    res.coded.itemExtreme.forEach((v, i) => { if (v === 0) ei.push(i); });
    const M = Math.max(...ei.map((i) => res.coded.m[i]));
    const loc = ei.map((i) => Float64Array.from(Array.from(res.jmle.thresholdLocation[i]).slice(0, M)));
    const grid = thetaGrid(res, loc.flatMap(finiteRow), 1.5);
    const mom = E.moments(grid, loc, M);
    const info = grid.map((_, g) => { let s = 0; for (let i = 0; i < loc.length; i++) s += mom.W[g * loc.length + i]; return s; });
    const sem = info.map((v) => 1 / Math.sqrt(v));
    let j = 0; info.forEach((v, k) => { if (v > info[j]) j = k; });
    const title = "Test Information Function and Standard Error of Measurement";
    const svg = figure(760, 500, title, "SEM = 1 / √(test information); the higher the information, the smaller the SEM");
    const p = new Panel(svg, 70, 64, 600, 340, [grid[0], grid[grid.length - 1]], [0, Math.max(...info) * 1.15]);
    p.frame();
    p.line(grid, info, t.NAVY_SERIES, 2.5);
    p.point(grid[j], info[j], 5, t.NAVY_SERIES, `Maks. informasi ${num(info[j], 1)} pada ${num(grid[j])} logit`);
    svg.push(text(p.sx(grid[j]) + 9, p.sy(info[j]) - 7, `max. ${num(info[j], 1)} at ${num(grid[j])} logit`, { size: 11 }));
    const semMax = Math.min(Math.max(...sem), Math.max(3, 3 * Math.min(...sem))) * 1.05;
    const p2 = new Panel(svg, p.x, p.y, p.w, p.h, p.xdom, [0, semMax]);
    p2.line(grid, sem.map((v) => Math.min(v, semMax)), t.OCHRE, 2.5);
    svg.push(`<line x1="${p.x + p.w}" y1="${p.y}" x2="${p.x + p.w}" y2="${p.y + p.h}" stroke="${t.CHART_AXIS}"/>`);
    for (const v of niceTicks(0, semMax, 5)) svg.push(text(p.x + p.w + 7, p2.sy(v) + 4, fmt(v), { size: 11, color: t.INK_SECONDARY }));
    svg.push(`<text transform="translate(${p.x + p.w + 50},${p.y + p.h / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="${t.INK_SECONDARY}" font-family="${FONT}">Standard error of measurement, SEM (logit)</text>`);
    legend(svg, p.x, p.y + p.h + 62, [{ label: "Test information (left axis)", color: t.NAVY_SERIES, kind: "line" },
      { label: "Standard error of measurement (right axis)", color: t.OCHRE, kind: "line" }], { cols: 2, colWidth: 250 });
    p.xlabel("Person measure (logit)"); p.ylabel("Test information", 46);
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // 6. Item Fit Bubble Chart
  // ------------------------------------------------------------------------------------
  function fitBubble(res) {
    const t = TH();
    const items = res.items.filter((r) => !r.extreme);
    const [lo, hi] = res.settings.mnsq_range;
    const seMax = Math.max(...items.map((r) => r.se).filter(isF));
    const ymax = Math.max(2, Math.max(...items.flatMap((r) => [r.infit_mnsq, r.outfit_mnsq]).filter(isF)) * 1.12);
    const xs = items.map((r) => r.measure);
    const xpad = (Math.max(...xs) - Math.min(...xs)) * 0.08 + 0.1;
    const xdom = [Math.min(...xs) - xpad, Math.max(...xs) + xpad];
    const title = "Item Fit Bubble Chart";
    const svg = figure(960, 480, title, null);
    ["infit_mnsq", "outfit_mnsq"].forEach((key, k) => {
      const p = new Panel(svg, 70 + k * 450, 70, 400, 320, xdom, [0, ymax]);
      p.frame({ yTickLabels: k === 0 });
      svg.push(text(p.x, p.y - 8, key === "infit_mnsq" ? "Infit MNSQ" : "Outfit MNSQ", { size: 13, weight: "bold", color: t.INK_SECONDARY }));
      p.hspan(lo, hi, t.STATUS.hijau, 0.12);
      p.hline(1, t.INK_MUTED, 0.9);
      items.slice().sort((a, b) => b.se - a.se).forEach((r) => {
        const y = r[key], bad = y < lo || y > hi;
        const rad = Math.sqrt(320 * (r.se / seMax)) * 0.9;
        p.point(r.measure, Math.min(y, ymax), rad, bad ? t.PROBLEM : t.NAVY_SERIES,
          `${r.item}: measure ${num(r.measure)}, ${key === "infit_mnsq" ? "Infit" : "Outfit"} MNSQ ${num(y)}, SE ${num(r.se)}`,
          `fill-opacity="${bad ? 0.85 : 0.75}"`);
        if (bad) svg.push(text(p.sx(r.measure) + 8, p.sy(Math.min(y, ymax)) - 5, r.item, { size: 11 }));
      });
      p.xlabel("Item measure (logit)");
      if (k === 0) p.ylabel("MNSQ", 42);
    });
    legend(svg, 180, 458, [{ label: "Within range", color: t.NAVY_SERIES, kind: "dot" }, { label: "Outside range", color: t.PROBLEM, kind: "dot" },
      { label: `Zone ${num(lo, 1)}-${num(hi, 1)}`, color: t.STATUS.hijau, kind: "patch", opacity: 0.25 },
      { label: "Bubble area proportional to SE", color: "none", kind: "none" }], { cols: 4, colWidth: 170 });
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // 7. Person Fit Distribution
  // ------------------------------------------------------------------------------------
  function personFit(res) {
    const t = TH();
    const ps = res.persons.filter((p) => !p.extreme && isF(p.infit_mnsq));
    const [lo, hi] = res.settings.mnsq_range;
    const title = "Person Fit Distribution";
    const svg = figure(960, 460, title, null);
    const hists = ["infit_mnsq", "outfit_mnsq"].map((key) => {
      const v = ps.map((p) => p[key]);
      const sorted = v.slice().sort((a, b) => a - b);
      const top = Math.max(2.5, Math.ceil(quantile(sorted, 0.99) * 2) / 2);
      const nb = Math.round(top / 0.1);
      const counts = new Array(nb).fill(0);
      for (const x of v) counts[Math.min(Math.max(Math.floor(Math.min(x, top - 1e-9) / 0.1 + 1e-9), 0), nb - 1)]++;
      return { key, v, top, counts };
    });
    const ymax = Math.max(...hists.flatMap((h) => h.counts)) * 1.1;
    hists.forEach(({ key, v, top, counts }, k) => {
      const label = key === "infit_mnsq" ? "Infit MNSQ" : "Outfit MNSQ";
      const p = new Panel(svg, 70 + k * 450, 70, 400, 300, [-0.1, top + 0.1], [0, ymax]);
      p.frame({ yTickLabels: k === 0 });
      svg.push(text(p.x, p.y - 8, label, { size: 13, weight: "bold", color: t.INK_SECONDARY }));
      p.vspan(lo, hi, t.STATUS.hijau, 0.12);
      counts.forEach((c, b) => {
        if (!c) return;
        const x1 = p.sx(b * 0.1), x2 = p.sx(b * 0.1 + 0.082);
        svg.push(`<rect x="${x1}" y="${p.sy(c)}" width="${x2 - x1}" height="${p.sy(0) - p.sy(c)}" fill="${t.NAVY_SERIES}"><title>${esc(`${label} ${num(b * 0.1, 1)}-${num(b * 0.1 + 0.1, 1)}: ${c} person`)}</title></rect>`);
      });
      const out = v.filter((x) => x < lo || x > hi).length;
      svg.push(text(p.x + p.w - 6, p.y + 16, `${out} of ${v.length} outside ${num(lo, 1)}-${num(hi, 1)}`, { anchor: "end", size: 11 }));
      p.xlabel(`${label} (values >= ${num(top, 1)} pooled in the last bar)`);
      if (k === 0) p.ylabel("Number of persons", 46);
    });
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // 8. PCA of Residuals: First Contrast
  // ------------------------------------------------------------------------------------
  function pcaContrast(res) {
    const t = TH(), d = res.dimensionality;
    const load = d.loadings;
    const meas = new Map(res.items.map((r) => [r.item, r.measure]));
    const pts = load.map(([nm, l]) => ({ nm, x: meas.get(nm), y: l }));
    const order = pts.slice().sort((a, b) => a.y - b.y);
    const show = new Set(pts.length <= 15 ? pts.map((p) => p.nm) : [...order.slice(0, 3), ...order.slice(-3)].map((p) => p.nm));
    const eig = d.first_contrast_eigenvalue, R = TEXT.rules;
    const rel = eig < R.CONTRAST_EIGENVALUE_MAX ? "<" : ">=";
    const title = "PCA of Residuals: First Contrast";
    const svg = figure(760, 500, title, `Eigenvalue ${num(eig)} (${rel} ${num(R.CONTRAST_EIGENVALUE_MAX, 1)}); ` +
      `raw variance explained by measures ${num(d.variance_explained_pct, 1)}%`);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const xp = (Math.max(...xs) - Math.min(...xs)) * 0.08 + 0.1, yp = (Math.max(...ys) - Math.min(...ys)) * 0.1 + 0.05;
    const p = new Panel(svg, 78, 64, 650, 340, [Math.min(...xs) - xp, Math.max(...xs) + xp], [Math.min(...ys) - yp, Math.max(...ys) + yp]);
    p.frame();
    p.hline(0, t.INK_MUTED, 0.9);
    for (const q of pts) {
      p.point(q.x, q.y, 6, q.y >= 0 ? t.NAVY_SERIES : t.OCHRE, `${q.nm}: loading ${num(q.y)}, measure ${num(q.x)}`);
      if (show.has(q.nm)) svg.push(text(p.sx(q.x) + 8, p.sy(q.y) - 4, q.nm, { size: 11 }));
    }
    legend(svg, p.x, p.y + p.h + 62, [{ label: "Positive loading", color: t.NAVY_SERIES, kind: "dot" }, { label: "Negative loading", color: t.OCHRE, kind: "dot" }], { cols: 2, colWidth: 170 });
    p.xlabel("Item measure (logit)"); p.ylabel("Loading on first contrast", 52);
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // 9. DIF Plot
  // ------------------------------------------------------------------------------------
  function difPlot(res) {
    const t = TH(), dif = res.dif, z = 1.959964;
    const ga = dif[0].group_a, gb = dif[0].group_b;
    const n = dif.length;
    const W = Math.max(760, 42 * n + 250);
    const title = "DIF Plot: Item Measure by Group";
    const svg = figure(W, 480, title, "Points = item measure per group; bars = 95% CI");
    const vals = dif.flatMap((r) => [r.measure_a - z * r.se_a, r.measure_a + z * r.se_a, r.measure_b - z * r.se_b, r.measure_b + z * r.se_b]).filter(isF);
    const pad = (Math.max(...vals) - Math.min(...vals)) * 0.06;
    const p = new Panel(svg, 70, 84, W - 110, 320, [-0.7, n - 0.3], [Math.min(...vals) - pad, Math.max(...vals) + pad]);
    p.frame({ xGrid: false, xTickLabels: false });
    dif.forEach((r, k) => { if (r.flag_dif) p.vspan(k - 0.45, k + 0.45, t.PROBLEM, 0.1); });
    dif.forEach((r, k) => {
      for (const [off, m, se, color, g] of [[-0.14, r.measure_a, r.se_a, t.NAVY_SERIES, ga], [0.14, r.measure_b, r.se_b, t.OCHRE, gb]]) {
        if (!isF(m)) continue;
        svg.push(`<line x1="${p.sx(k + off)}" y1="${p.sy(m - z * se)}" x2="${p.sx(k + off)}" y2="${p.sy(m + z * se)}" stroke="${color}" stroke-width="1.5"/>`);
        p.point(k + off, m, 5.5, color, `${r.item}, grup ${g}: ${num(m)} logit (SE ${num(se)})`);
      }
      const rot = n > 12;
      svg.push(rot
        ? `<text transform="translate(${p.sx(k) + 4},${p.y + p.h + 8}) rotate(-90)" text-anchor="end" font-size="10" fill="${t.INK_SECONDARY}" font-family="${FONT}">${esc(r.item)}</text>`
        : text(p.sx(k), p.y + p.h + 16, r.item, { anchor: "middle", size: 10, color: t.INK_SECONDARY }));
    });
    const items = [{ label: `Group ${ga}`, color: t.NAVY_SERIES, kind: "dot" }, { label: `Group ${gb}`, color: t.OCHRE, kind: "dot" }];
    if (dif.some((r) => r.flag_dif)) items.push({ label: "Flagged DIF", color: t.PROBLEM, kind: "patch", opacity: 0.25 });
    legend(svg, p.x + 4, 70, items, { cols: 3, colWidth: 150 });
    p.ylabel("Item measure (logit)", 46);
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // 10. Yen's Q3 Matrix
  // ------------------------------------------------------------------------------------
  function q3Heatmap(res) {
    const t = TH(), q3 = res.q3;
    const names = q3.names, L = names.length, Q = q3.matrix;
    const centre = q3.mean;
    let span = 0.3;
    for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) if (a !== b && isF(Q[a][b])) span = Math.max(span, Math.abs(Q[a][b] - centre));
    const cell = Math.max(8, Math.min(40, Math.floor(560 / L)));
    const size = cell * L;
    const W = size + 230, H = size + 150;
    const title = "Yen's Q3 Matrix";
    const svg = figure(W, H, title, `Mean Q3 ${num(q3.mean, 3)}; black boxes = Q3 > ${num(q3.cutoff, 3)} (mean + ${num(TEXT.rules.Q3_RELATIVE_CUTOFF, 1)})`);
    const x0 = 70, y0 = 60;
    const div = [t.NAVY_SERIES, "#F3EEE7", t.PROBLEM];
    const colorOf = (v) => interpColor(div, 0.5 + (v - centre) / (2 * span));
    const flagged = new Set(q3.flagged_pairs.flatMap((p) => [`${p.item_a}|${p.item_b}`, `${p.item_b}|${p.item_a}`]));
    for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) {
      if (a === b) continue;
      const v = Q[a][b];
      const fill = isF(v) ? colorOf(v) : t.CHART_BG;
      svg.push(`<rect x="${x0 + b * cell}" y="${y0 + a * cell}" width="${cell}" height="${cell}" fill="${fill}"><title>${esc(`${names[a]} – ${names[b]}: Q3 ${num(v, 3)}`)}</title></rect>`);
      if (flagged.has(`${names[a]}|${names[b]}`)) svg.push(`<rect x="${x0 + b * cell + 0.7}" y="${y0 + a * cell + 0.7}" width="${cell - 1.4}" height="${cell - 1.4}" fill="none" stroke="${t.INK}" stroke-width="1.6"/>`);
    }
    const step = L <= 40 ? 1 : Math.ceil(L / 40);
    const fs = Math.min(11, Math.max(7, cell * 0.6));
    for (let k = 0; k < L; k += step) {
      svg.push(text(x0 - 5, y0 + k * cell + cell / 2 + 4, names[k], { anchor: "end", size: fs, color: t.INK_SECONDARY }));
      svg.push(`<text transform="translate(${x0 + k * cell + cell / 2 + 4},${y0 + size + 6}) rotate(-90)" text-anchor="end" font-size="${fs}" fill="${t.INK_SECONDARY}" font-family="${FONT}">${esc(names[k])}</text>`);
    }
    const cbx = x0 + size + 30, cbh = Math.min(size, 360), cby = y0 + (size - cbh) / 2;
    const gid = "q3grad" + Math.random().toString(36).slice(2, 8);
    svg.push(`<defs><linearGradient id="${gid}" x1="0" y1="1" x2="0" y2="0">${div.map((c, k) => `<stop offset="${k / 2}" stop-color="${c}"/>`).join("")}</linearGradient></defs>`);
    svg.push(`<rect x="${cbx}" y="${cby}" width="16" height="${cbh}" fill="url(#${gid})"/>`);
    for (const v of niceTicks(centre - span, centre + span, 6)) {
      const yy = cby + cbh - (v - (centre - span)) / (2 * span) * cbh;
      if (yy < cby - 1 || yy > cby + cbh + 1) continue;
      svg.push(`<line x1="${cbx + 16}" y1="${yy}" x2="${cbx + 20}" y2="${yy}" stroke="${t.INK_SECONDARY}"/>`);
      svg.push(text(cbx + 23, yy + 4, fmt(v), { size: 10, color: t.INK_SECONDARY }));
    }
    svg.push(`<text transform="translate(${cbx + 75},${cby + cbh / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="${t.INK_SECONDARY}" font-family="${FONT}">Q3 (residual correlation); neutral colour = mean Q3</text>`);
    return finish(svg, title);
  }


  // ------------------------------------------------------------------------------------
  // Grafik diagnostik lanjutan (versi HTML)
  // ------------------------------------------------------------------------------------
  /** Persentase not-reached dan omitted menurut posisi butir di setiap blok. */
  function missingPattern(ms, blocks) {
    const t = TH();
    const title = "Missing Responses by Item Position";
    const svg = figure(760, 470, title, "Not-reached: blank after the last answered item in the block; omitted: blank before it");
    const maxPos = Math.max(...blocks.blocks.map((b) => b.items.length));
    const ymax = Math.max(10, ...ms.perItem.map((r) => r.pct_not_reached + r.pct_omitted)) * 1.1;
    const p = new Panel(svg, 70, 64, 640, 300, [0.5, maxPos + 0.5], [0, ymax]);
    p.frame({ xTicks: niceTicks(1, maxPos, Math.min(maxPos, 12)).filter((v) => Number.isInteger(v)) });
    const items = [];
    blocks.blocks.forEach((b, k) => {
      const color = t.SERIES[k % t.SERIES.length];
      const rows = b.items.map((i) => ms.perItem[i]);
      p.line(rows.map((r) => r.position), rows.map((r) => r.pct_not_reached), color, 2.5);
      rows.forEach((r) => p.point(r.position, r.pct_not_reached, 4, color, `${r.item}: not-reached ${num(r.pct_not_reached, 1)}%, omitted ${num(r.pct_omitted, 1)}%`));
      if (rows.some((r) => r.pct_omitted > 0)) p.line(rows.map((r) => r.position), rows.map((r) => r.pct_omitted), color, 1.5, `stroke-dasharray="5 4"`);
      items.push({ label: `${b.name} not-reached`, color, kind: "line" });
    });
    if (ms.omitted > 0) items.push({ label: "Omitted (dashed)", color: t.INK_MUTED, kind: "line", width: 1.5 });
    legend(svg, p.x, p.y + p.h + 62, items, { cols: 4, colWidth: 160 });
    p.xlabel("Item position within block"); p.ylabel("Persons (%)", 46);
    return finish(svg, title);
  }

  /** Sebaran first contrast eigenvalue pada data simulasi dibandingkan nilai teramati. */
  function nullEigen(sim, observed) {
    const t = TH(), vals = sim.eig_values.filter(isF);
    const title = "First Contrast Eigenvalue: Observed vs Model-Fitting Simulations";
    const svg = figure(760, 440, title, `${sim.reps} simulated data sets with the same persons, items and missing pattern; P95 = ${num(sim.eig_p95)}`);
    const lo = Math.min(...vals, observed) - 0.2, hi = Math.max(...vals, observed) + 0.3;
    const bins = 20, w = (hi - lo) / bins, cnt = new Array(bins).fill(0);
    vals.forEach((v) => { cnt[Math.min(bins - 1, Math.floor((v - lo) / w))]++; });
    const p = new Panel(svg, 70, 64, 640, 280, [lo, hi], [0, Math.max(...cnt) * 1.2 + 0.5]);
    p.frame();
    cnt.forEach((c, k) => { if (!c) return; const x1 = p.sx(lo + k * w) + 1, x2 = p.sx(lo + (k + 1) * w) - 1; svg.push(`<rect x="${x1}" y="${p.sy(c)}" width="${Math.max(x2 - x1, 1)}" height="${p.sy(0) - p.sy(c)}" fill="${t.NAVY_SERIES}" fill-opacity="0.7"><title>${c} replications</title></rect>`); });
    p.vline(sim.eig_p95, t.OCHRE, 2, `stroke-dasharray="6 4"`);
    p.vline(observed, t.PROBLEM, 2.5);
    svg.push(text(p.sx(observed) + 6, p.y + 16, `observed ${num(observed)}`, { size: 12, color: t.PROBLEM }));
    legend(svg, p.x, p.y + p.h + 62, [{ label: "Simulated eigenvalues", color: t.NAVY_SERIES, kind: "patch", opacity: 0.7 },
      { label: "95th percentile (threshold)", color: t.OCHRE, kind: "line" }, { label: "Observed", color: t.PROBLEM, kind: "line" }], { cols: 3, colWidth: 210 });
    p.xlabel("First contrast eigenvalue"); p.ylabel("Replications", 46);
    return finish(svg, title);
  }

  /** Efisiensi informasi per person terhadap person measure. */
  function infoEfficiency(res, rt) {
    const t = TH(), ps = res.persons.filter((x) => !x.extreme && isF(x.measure));
    const eff = rt.info_eff;
    const title = "Information Efficiency at Each Person's Location";
    const svg = figure(760, 450, title, "Test information at the person's measure divided by the maximum attainable from the items answered");
    const xs = ps.map((x) => x.measure);
    const p = new Panel(svg, 70, 64, 640, 300, [Math.min(...xs) - 0.3, Math.max(...xs) + 0.3], [0, 1]);
    p.frame({ yTicks: [0, 0.25, 0.5, 0.75, 1], yLabels: ["0%", "25%", "50%", "75%", "100%"] });
    p.hspan(0.7, 1, t.STATUS.hijau, 0.1);
    ps.forEach((x, k) => p.point(x.measure, eff[k], 3.5, eff[k] < 0.5 ? t.PROBLEM : t.NAVY_SERIES, `${x.person}: measure ${num(x.measure)}, efficiency ${num(100 * eff[k], 0)}%`, `fill-opacity="0.75"`));
    p.hline(rt.info_eff_median, t.OCHRE, 2, `stroke-dasharray="6 4"`);
    legend(svg, p.x, p.y + p.h + 62, [{ label: "Person", color: t.NAVY_SERIES, kind: "dot" }, { label: "Below 50%", color: t.PROBLEM, kind: "dot" },
      { label: `Median ${num(100 * rt.info_eff_median, 0)}%`, color: t.OCHRE, kind: "line" }], { cols: 3, colWidth: 200 });
    p.xlabel("Person measure (logit)"); p.ylabel("Information efficiency", 52);
    return finish(svg, title);
  }

  // ------------------------------------------------------------------------------------
  // Registri
  // ------------------------------------------------------------------------------------
  const FUNCS = {
    wright_map: wrightMap, icc, category_curves: categoryCurves, expected_score: expectedScore,
    test_information: testInformation, fit_bubble: fitBubble, person_fit: personFit, pca_contrast: pcaContrast,
    dif: difPlot, q3_heatmap: q3Heatmap,
  };
  function specs() { return TEXT.charts; }
  function applies(res, key) {
    if (key === "category_curves" || key === "expected_score") return res.model !== "dichotomous";
    if (key === "dif") return !!(res.dif && res.dif.length);
    return true;
  }
  function availableCharts(res) { return specs().filter((s) => applies(res, s.key)); }
  function itemChoices(res) { return res.coded.itemNames.filter((_, i) => res.coded.itemExtreme[i] === 0); }
  function render(res, key, item) { const spec = specs().find((s) => s.key === key); return spec.perItem ? FUNCS[key](res, item) : FUNCS[key](res); }
  function howToRead(res, key) { const spec = specs().find((s) => s.key === key); return spec.howToRead[res.model === "dichotomous" ? "dichotomous" : "polytomous"]; }

  const api = { setText, setEngine, render, availableCharts, itemChoices, howToRead, categoryColors, empiricalBins, missingPattern, nullEigen, infoEfficiency };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RaschCharts = api;
})(typeof window !== "undefined" ? window : globalThis);
