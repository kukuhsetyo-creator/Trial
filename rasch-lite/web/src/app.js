/* RaschLite versi HTML: antarmuka wizard empat langkah, panel hasil, dan ekspor.
 * Padanan gui/ (PySide6) dan report/ pada versi desktop; seluruh teks dari TEXT.strings.
 */
(function () {
  "use strict";
  const TEXT = window.RASCH_TEXT;
  const S = TEXT.strings, C0 = TEXT.common, TH = TEXT.theme;
  const E = window.RaschEngine, I = window.RaschInterpret, CH = window.RaschCharts, X = window.RaschXlsx;
  E.setText(TEXT); I.setText(TEXT); CH.setText(TEXT); CH.setEngine(E);
  const { num } = I;
  const $ = (sel, el = document) => el.querySelector(sel);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const isF = (v) => typeof v === "number" && isFinite(v);

  // Teks antarmuka khusus versi HTML (navigasi, bukan istilah Rasch).
  const W = {
    excel: "Unduh Excel (.xlsx)", html: "Unduh Laporan HTML", pdf: "Cetak / Simpan PDF", charts: "Unduh Semua Grafik (ZIP)",
    working: "Menyiapkan berkas…", savedTo: "Berkas diunduh: {name}", chartsProgress: "Merender grafik {k} dari {n}…",
    offline: "Semua perhitungan berjalan di browser ini; data tidak dikirim ke mana pun.",
    xlsxError: "Berkas Excel tidak dapat dibaca: {error}",
    printed: "Dialog cetak dibuka. Pilih printer \"Simpan sebagai PDF\" (Save as PDF) untuk membuat berkas PDF.",
  };
  const fmtS = E.pyFormat;

  const state = { table: null, fileName: "", prep: null, res: null, interp: null, cancel: false };

  // --------------------------------------------------------------------------------------
  // Kerangka
  // --------------------------------------------------------------------------------------
  const pages = ["import", "model", "run", "results"];
  function go(name) {
    pages.forEach((p, k) => {
      $(`#page-${p}`).classList.toggle("active", p === name);
      const step = $(`#steps`).children[k];
      step.classList.toggle("active", p === name);
      step.classList.toggle("done", k < pages.indexOf(name));
    });
    window.scrollTo(0, 0);
  }
  function banner(el, msg, level = "info", isHtml = false) {
    el.className = `banner ${level}`;
    if (isHtml) el.innerHTML = msg; else el.textContent = msg;
    if (!msg) el.className = "banner";
  }
  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const previewText = (v) => (v === null || v === undefined ? "" : typeof v === "number" ? (Number.isNaN(v) ? "" : String(v)) : String(v));

  // --------------------------------------------------------------------------------------
  // Langkah 1: Impor data
  // --------------------------------------------------------------------------------------
  function guessColumns(table) {
    const cols = table.columns.map(String);
    let idCol = cols.find((c) => ["id", "nama", "name", "nis", "nim", "no", "kode"].includes(c.trim().toLowerCase())) || null;
    const items = [];
    cols.forEach((c, j) => {
      const vals = table.rows.map((r) => r[j]).filter((v) => previewText(v) !== "");
      if (!vals.length) return;
      let ok = 0;
      for (const v of vals) { const f = Number(String(v).replace(",", ".")); if (String(v).trim() !== "" && Number.isInteger(f)) ok++; }
      if (ok / vals.length >= 0.9 && new Set(vals.map(previewText)).size <= 20) items.push(c);
      else if (idCol === null && j === 0) idCol = c;
    });
    return { idCol, items: items.filter((c) => c !== idCol) };
  }

  function setTable(table, name, preset = {}) {
    state.table = table; state.fileName = name;
    $("#file-label").textContent = fmtS(S.FILE_LOADED, { name, rows: table.rows.length, cols: table.columns.length });
    const head = table.rows.slice(0, 20);
    $("#preview").replaceChildren(dataTable(head.map((r) => Object.fromEntries(table.columns.map((c, j) => [c, previewText(r[j])]))),
      table.columns, { sortable: false }));
    const g = guessColumns(table);
    const idCol = preset.id && table.columns.includes(preset.id) ? preset.id : g.idCol;
    const groupCol = preset.group && table.columns.includes(preset.group) ? preset.group : null;
    for (const [sel, val] of [["#id-col", idCol], ["#group-col", groupCol]]) {
      const el = $(sel);
      el.replaceChildren(h("option", { value: "" }, S.NONE_OPTION), ...table.columns.map((c) => h("option", { value: c }, c)));
      el.value = val || "";
    }
    const itemSet = new Set(g.items.filter((c) => c !== groupCol && c !== idCol));
    $("#items").replaceChildren(...table.columns.map((c) => h("label", {}, h("input", { type: "checkbox", value: c, checked: itemSet.has(c) }), " ", c)));
    $("#import-form").hidden = false;
    banner($("#import-banner"), "");
  }

  async function openFile(file) {
    try {
      let table;
      if (/\.(xlsx|xlsm)$/i.test(file.name)) table = await X.readXlsx(await file.arrayBuffer());
      else table = E.parseCsv(await file.text());
      setTable(table, file.name);
    } catch (err) {
      banner($("#import-banner"), fmtS(S.ERR_READ, { error: err.message || err }), "error");
    }
  }

  function loadSample(kind) {
    const s = window.RASCH_SAMPLES[kind];
    setTable(E.parseCsv(s.csv), s.file, { id: "ID", group: "Jenis_Kelamin" });
  }

  function validate() {
    if (!state.table) { banner($("#import-banner"), S.ERR_NO_FILE, "error"); return false; }
    const itemCols = [...$("#items").querySelectorAll("input:checked")].map((x) => x.value);
    const idCol = $("#id-col").value || null, groupCol = $("#group-col").value || null;
    const missing = $("#missing").value.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      state.prep = E.prepareData(state.table, { itemCols, idCol, groupCol, missingCodes: missing });
    } catch (err) {
      banner($("#import-banner"), err.message || String(err), "error");
      return false;
    }
    banner($("#import-banner"), fmtS(S.VALID_OK, { n: state.prep.nPersons, k: state.prep.nItems }), "info");
    return true;
  }

  // --------------------------------------------------------------------------------------
  // Langkah 2: Model
  // --------------------------------------------------------------------------------------
  function issuesHtml(list) { return list.map((i) => "• " + esc(i.message)).join("<br>"); }
  function setupModelPage() {
    const prep = state.prep, R = TEXT.rules;
    const dicho = prep.responseType === "dichotomous";
    $("#detected").textContent = dicho ? S.DETECTED_DICHO : S.DETECTED_POLY;
    $("#recommend").textContent = prep.recommendationReason;
    const box = $("#models");
    box.replaceChildren(...["dichotomous", "rsm", "pcm"].map((key) => {
      const ok = dicho ? key === "dichotomous" : key !== "dichotomous";
      return h("label", { class: ok ? "" : "disabled" },
        h("input", { type: "radio", name: "model", value: key, disabled: !ok, checked: key === prep.recommendedModel }),
        " ", h("b", {}, S.MODEL_LABELS[key]), h("small", {}, S.MODEL_DESC[key]));
    }));
    box.querySelectorAll("input").forEach((r) => r.addEventListener("change", updateCategoryCheck));
    $("#strict-label").textContent = fmtS(S.LBL_STRICT, { lo: num(R.MNSQ_STRICT[0], 1), hi: num(R.MNSQ_STRICT[1], 1),
      dlo: num(R.MNSQ_PRODUCTIVE[0], 1), dhi: num(R.MNSQ_PRODUCTIVE[1], 1) });
    const dif = $("#dif");
    dif.checked = !!prep.groups; dif.disabled = !prep.groups;
    $("#dif-label").textContent = prep.groups ? fmtS(S.LBL_DIF, { col: prep.groupName }) : S.LBL_DIF_NA;
    const notes = prep.issues;
    banner($("#notes-banner"), notes.length ? `<b>${esc(S.DATA_NOTES_TITLE)}</b><br>` + issuesHtml(notes) : "",
      notes.some((i) => i.level === "warning") ? "warning" : "info", true);
    updateCategoryCheck();
  }
  const selectedModel = () => ($('#models input[name="model"]:checked') || {}).value;
  function updateCategoryCheck() {
    const model = selectedModel();
    if (!model || model === "dichotomous") { banner($("#category-banner"), ""); return; }
    const issues = E.categoryIssues(state.prep, model);
    banner($("#category-banner"), `<b>${esc(S.CATEGORY_CHECK_TITLE)}</b><br>` + (issues.length ? issuesHtml(issues) : esc(S.CATEGORY_CHECK_OK)),
      issues.length ? "warning" : "info", true);
  }

  // --------------------------------------------------------------------------------------
  // Langkah 3: Jalankan
  // --------------------------------------------------------------------------------------
  function progressFraction(first, current) {
    if (current <= 1) return 0.95;
    if (first <= current || first <= 1) return 0.02;
    return Math.max(0.02, Math.min(0.95, 0.95 * Math.log(first / current) / Math.log(first)));
  }
  async function run() {
    const model = selectedModel();
    go("run");
    const log = $("#run-log"), bar = $("#run-progress");
    log.textContent = fmtS(S.RUN_START, { model: S.MODEL_LABELS[model], n: state.prep.nPersons, k: state.prep.nItems }) + "\n";
    bar.value = 0; state.cancel = false;
    $("#btn-cancel").disabled = false; $("#btn-run-back").disabled = true;
    banner($("#run-banner"), "");
    let first = null;
    const t0 = performance.now();
    try {
      const res = await E.runAnalysisAsync(state.prep, model, {
        strictFit: $("#strict").checked, runDif: $("#dif").checked,
        shouldCancel: () => state.cancel,
        progress: (it, change, resid) => {
          log.textContent += fmtS(S.RUN_ITER, { it, change: num(change, 5), resid: num(resid, 4) }) + "\n";
          log.scrollTop = log.scrollHeight;
          const score = Math.max(change / 0.001, resid / 0.01);
          if (first === null) first = Math.max(score, 1.0001);
          bar.value = progressFraction(first, score);
        },
      });
      bar.value = 1;
      log.textContent += fmtS(S.RUN_DONE, { sec: num((performance.now() - t0) / 1000, 2) }) + "\n";
      state.res = res; state.interp = I.interpret(res);
      buildResults();
      go("results");
    } catch (err) {
      if (err instanceof E.EstimationCancelled) { banner($("#run-banner"), S.RUN_CANCELLED, "info"); log.textContent += S.RUN_CANCELLED + "\n"; }
      else { banner($("#run-banner"), fmtS(S.RUN_FAILED, { error: err.message || err }), "error"); console.error(err); }
    } finally {
      $("#btn-cancel").disabled = true; $("#btn-run-back").disabled = false;
    }
  }

  // --------------------------------------------------------------------------------------
  // Tabel
  // --------------------------------------------------------------------------------------
  const INT_COLS = new Set(["score", "count", "max_score", "n_categories", "category", "n_a", "n_b"]);
  function fmtValue(v, col) {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? S.YES : "";
    if (typeof v === "number") {
      if (!isFinite(v)) return "";
      if (INT_COLS.has(col) && Number.isInteger(v)) return String(v);
      const d = C0.DECIMALS[col] ?? 2;
      return num(v, d);
    }
    return String(v);
  }
  function difLabels(res) {
    if (!res.dif) return {};
    const ga = res.dif[0].group_a, gb = res.dif[0].group_b;
    return { measure_a: `Measure ${ga}`, se_a: `SE ${ga}`, n_a: `n ${ga}`, measure_b: `Measure ${gb}`, se_b: `SE ${gb}`, n_b: `n ${gb}` };
  }
  function tableFrame(res, key) {
    const TC = C0.TABLE_COLUMNS;
    if (key === "items") {
      const cols = TC.items.filter((c) => c !== "n_categories" || res.model !== "dichotomous");
      return { rows: res.items, cols, flag: res.items.map((r) => r.flag_misfit || r.flag_negative_ptmea), muted: res.items.map((r) => r.extreme) };
    }
    if (key === "persons") {
      const cols = TC.persons.filter((c) => c !== "group" || res.coded.groups);
      return { rows: res.persons, cols, flag: res.persons.map((r) => r.flag_misfit), muted: res.persons.map((r) => r.extreme || !isF(r.measure)) };
    }
    if (key === "categories") {
      if (!res.categories) return null;
      return { rows: res.categories, cols: TC.categories, flag: res.categories.map((r) => C0.CATEGORY_FLAGS.some((f) => r[f])), muted: res.categories.map(() => false) };
    }
    if (key === "dif") {
      if (!res.dif) return null;
      return { rows: res.dif, cols: TC.dif, flag: res.dif.map((r) => r.flag_dif), muted: res.dif.map(() => false) };
    }
    if (key === "loadings") {
      const meas = new Map(res.items.map((r) => [r.item, r.measure]));
      const rows = res.dimensionality.loadings.map(([item, loading]) => ({ item, measure: meas.get(item), loading }))
        .sort((a, b) => b.loading - a.loading);
      return { rows, cols: TC.loadings, flag: rows.map(() => false), muted: rows.map(() => false) };
    }
    if (key === "q3_pairs") {
      const rows = res.q3.flagged_pairs;
      return { rows, cols: TC.q3_pairs, flag: rows.map(() => true), muted: rows.map(() => false) };
    }
    return null;
  }
  function columnLabel(col, res) { return { ...S.COLUMNS, ...(res ? difLabels(res) : {}) }[col] || col; }

  function dataTable(rows, cols, opts = {}) {
    const labels = opts.labels || {};
    const tbl = h("table", { class: "data" });
    const thead = h("thead", {}, h("tr", {}, ...cols.map((c) => {
      const gk = S.COLUMN_GLOSSARY[c];
      const tip = gk && TEXT.glossary[gk] ? `${TEXT.glossary[gk].term}: ${TEXT.glossary[gk].short}` : null;
      return h("th", { title: tip, "data-col": c }, labels[c] || c);
    })));
    const tbody = h("tbody");
    const order = rows.map((_, k) => k);
    const render = () => {
      const frag = document.createDocumentFragment();
      for (const k of order) {
        const r = rows[k];
        const cls = opts.flag && opts.flag[k] ? "flag" : opts.muted && opts.muted[k] ? "dim" : null;
        frag.append(h("tr", { class: cls }, ...cols.map((c) => {
          const v = r[c];
          return h("td", { class: typeof v === "number" && typeof v !== "boolean" ? "num" : null }, opts.format === false ? v : fmtValue(v, c));
        })));
      }
      tbody.replaceChildren(frag);
    };
    render();
    if (opts.sortable !== false) {
      let sortCol = null, dir = 1;
      thead.addEventListener("click", (ev) => {
        const th = ev.target.closest("th"); if (!th) return;
        const c = th.dataset.col;
        dir = sortCol === c ? -dir : 1; sortCol = c;
        thead.querySelectorAll("th").forEach((x) => x.classList.remove("sorted-asc", "sorted-desc"));
        th.classList.add(dir > 0 ? "sorted-asc" : "sorted-desc");
        const key = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : v);
        order.sort((a, b) => {
          const va = key(rows[a][c]), vb = key(rows[b][c]);
          const na = va === null || va === undefined || (typeof va === "number" && !isFinite(va));
          const nb = vb === null || vb === undefined || (typeof vb === "number" && !isFinite(vb));
          if (na !== nb) return na ? 1 : -1;
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir || a - b;
          return String(va).localeCompare(String(vb), "id", { numeric: true }) * dir || a - b;
        });
        render();
      });
    }
    tbl.append(thead, tbody);
    return h("div", { class: "tablewrap" + (opts.preview ? " preview" : "") }, tbl);
  }
  function frameTable(res, key) {
    const f = tableFrame(res, key);
    if (!f) return null;
    const labels = Object.fromEntries(f.cols.map((c) => [c, columnLabel(c, res)]));
    return dataTable(f.rows, f.cols, { labels, flag: f.flag, muted: f.muted });
  }

  // --------------------------------------------------------------------------------------
  // Langkah 4: Hasil
  // --------------------------------------------------------------------------------------
  function chartPanel(res, keys) {
    const specs = CH.availableCharts(res).filter((s) => !keys || keys.includes(s.key));
    const items = CH.itemChoices(res);
    const chartSel = h("select", {}, ...specs.map((s) => h("option", { value: s.key }, s.title)));
    const itemSel = h("select", {}, ...items.map((i) => h("option", { value: i }, i)));
    const holder = h("div", { class: "chart" }), how = h("div", { class: "howto" });
    const bar = h("div", { class: "row" });
    if (specs.length > 1) bar.append(h("span", {}, S.LBL_CHART), chartSel);
    if (specs.some((s) => s.perItem)) bar.append(h("span", {}, S.LBL_ITEM), itemSel);
    const current = () => ({ key: chartSel.value || specs[0].key, item: itemSel.value });
    const draw = () => {
      const { key, item } = current();
      const spec = specs.find((s) => s.key === key);
      itemSel.disabled = !spec.perItem;
      holder.innerHTML = CH.render(res, key, spec.perItem ? item : null);
      how.replaceChildren(h("b", {}, S.HOW_TO_READ), CH.howToRead(res, key));
    };
    const stem = () => { const { key, item } = current(); const spec = specs.find((s) => s.key === key); return key + (spec.perItem ? "_" + safe(item) : ""); };
    bar.append(h("span", { style: "flex:1" }),
      h("button", { onclick: async () => download(stem() + ".png", await svgToPng(holder.innerHTML, 300), "image/png") }, S.BTN_SAVE_PNG.replace("…", "")),
      h("button", { onclick: () => download(stem() + ".svg", holder.innerHTML, "image/svg+xml") }, S.BTN_SAVE_SVG.replace("…", "")));
    chartSel.addEventListener("change", draw); itemSel.addEventListener("change", draw);
    const box = h("div", {}, bar, h("div", { class: "chartbox" }, holder, how));
    box.draw = draw;
    return box;
  }
  const safe = (n) => String(n).replace(/[^\p{L}\p{N}_-]/gu, "_");

  function buildResults() {
    const res = state.res, it = state.interp, s = res.summary;
    const conv = fmtS(res.converged ? S.CONVERGED_OK : S.CONVERGED_NO, { n: s.iterations });
    $("#result-meta").textContent = fmtS(S.RESULT_HEADER, { model: it.modelName, n: s.n_persons, k: s.n_items, conv });
    banner($("#export-banner"), "");
    const tabs = $("#tabs"), panels = $("#panels");
    tabs.replaceChildren(); panels.replaceChildren();
    const add = (title, build) => {
      const panel = h("div", { class: "tabpanel" });
      const btn = h("button", { onclick: () => {
        tabs.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        panels.querySelectorAll(".tabpanel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active"); panel.classList.add("active");
        if (!panel.built) { panel.append(...[].concat(build()).filter(Boolean)); panel.built = true; }
      } }, title);
      tabs.append(btn); panels.append(panel);
      return btn;
    };
    const withChart = (keys, ...content) => { const cp = chartPanel(res, keys); setTimeout(() => cp.draw(), 0); return [...content, cp]; };
    const first = add(S.TAB_SUMMARY, () => summaryTab(res, it));
    add(S.TAB_ITEMS, () => [h("p", { class: "help" }, S.TABLE_HINT), frameTable(res, "items")]);
    add(S.TAB_PERSONS, () => [h("p", { class: "help" }, S.TABLE_HINT), frameTable(res, "persons")]);
    add(S.TAB_CATEGORIES, () => (res.categories ? [h("p", { class: "help" }, S.TABLE_HINT), frameTable(res, "categories")] : [h("p", {}, S.NOT_APPLICABLE_CATEGORIES)]));
    add(S.TAB_DIMENSION, () => {
      const d = res.dimensionality;
      return withChart(["pca_contrast"], h("p", {}, fmtS(S.DIMENSION_TEXT, { eig: num(d.first_contrast_eigenvalue), lim: num(TEXT.rules.CONTRAST_EIGENVALUE_MAX, 1),
        pct: num(d.variance_explained_pct, 1) + "%" })), frameTable(res, "loadings"));
    });
    add(S.TAB_LOCAL, () => {
      const q = res.q3;
      const parts = [h("p", {}, fmtS(S.LOCAL_TEXT, { mean: num(q.mean, 3), cutoff: num(q.cutoff, 3), rel: num(TEXT.rules.Q3_RELATIVE_CUTOFF, 1) }))];
      parts.push(q.flagged_pairs.length ? frameTable(res, "q3_pairs") : h("p", {}, fmtS(S.NO_Q3_PAIRS, { cutoff: num(q.cutoff, 3) })));
      return withChart(["q3_heatmap"], ...parts);
    });
    add(S.TAB_DIF, () => (res.dif ? withChart(["dif"], h("p", { class: "help" }, S.TABLE_HINT), frameTable(res, "dif")) : [h("p", {}, S.NOT_APPLICABLE_DIF)]));
    add(S.TAB_CHARTS, () => withChart(null));
    add(S.TAB_GLOSSARY, () => h("dl", { class: "glossary" }, ...Object.values(TEXT.glossary).flatMap((t) => [h("dt", {}, t.term), h("dd", {}, t.long)])));
    first.click();
  }

  function summaryTab(res, it) {
    const out = [];
    if (it.cautions.length) {
      const b = h("div"); banner(b, `<b>${esc(S.CAUTIONS)}</b><br>` + it.cautions.map((c) => "• " + esc(c)).join("<br>"), "warning", true);
      out.push(b);
    }
    out.push(h("h2", { class: "title" }, S.SUMMARY_1MIN));
    out.push(h("div", { class: "lights" }, ...it.lights.map((l) => {
      const gk = S.LIGHT_GLOSSARY[l.key], g = gk && TEXT.glossary[gk];
      return h("div", { class: "light", title: g ? `${g.term}: ${g.short}` : null },
        h("div", {}, h("span", { class: `dot s-${l.status}` }), h("b", {}, l.title), h("div", { class: "status" }, S.STATUS_TEXT[l.status])),
        h("div", {}, l.sentence));
    })));
    out.push(h("h2", { class: "title" }, S.EXPLANATION));
    it.intro.forEach((p) => out.push(h("p", {}, p)));
    for (const sec of it.sections) {
      out.push(h("h3", {}, h("span", { class: `dot s-${sec.status}` }), sec.title));
      sec.paragraphs.forEach((p) => out.push(h("p", {}, p)));
      if (sec.actions.length) out.push(h("p", {}, h("b", {}, S.ACTIONS)), h("ul", {}, ...sec.actions.map((a) => h("li", {}, a))));
      if (sec.technical.length) {
        out.push(h("details", {}, h("summary", {}, S.REPORT_TECHNICAL),
          h("table", { class: "tech" }, h("tr", {}, ...S.TECH_HEAD.map((x) => h("th", {}, x))),
            ...sec.technical.map((t) => h("tr", {}, h("td", {}, t.label.trim()), h("td", {}, t.value), h("td", {}, t.criterion)))),
          sec.references.length ? h("div", { class: "refs" }, h("p", {}, S.REFERENCES + ":"), h("ul", {}, ...sec.references.map((r) => h("li", {}, r)))) : null));
      }
    }
    return out;
  }

  // --------------------------------------------------------------------------------------
  // Ekspor
  // --------------------------------------------------------------------------------------
  function generatedLine() {
    const d = new Date(), p = (x) => String(x).padStart(2, "0");
    return fmtS(S.REPORT_SUBTITLE, { app: TEXT.app, version: TEXT.version + " (HTML)", when: `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}` });
  }
  function metadata(res) {
    const s = res.summary, st = res.settings, m = S.REPORT_META_ROWS;
    const conv = fmtS(res.converged ? S.CONVERGED_OK : S.CONVERGED_NO, { n: s.iterations });
    const [lo, hi] = st.mnsq_range;
    return [
      [m.source, state.fileName || "-"], [m.model, S.MODEL_LABELS[res.model]],
      [m.persons, `${s.n_persons_estimated} / ${s.n_persons_extreme} (total ${s.n_persons})`],
      [m.items, `${s.n_items_estimated} / ${s.n_items_extreme} (total ${s.n_items})`],
      [m.missing, I.pct(s.missing_pct, 1)], [m.convergence, conv],
      [m.criteria, `max logit change < ${num(st.conv_change, 3)} dan max score residual < ${num(st.conv_resid, 2)}`],
      [m.fit_range, `${num(lo, 1)}-${num(hi, 1)}` + (st.strict_fit ? " (mode ketat)" : "")],
      [m.bias, num(st.bias_factor, 4)], [m.dif, res.dif ? "dianalisis" : "tidak dianalisis"],
    ];
  }

  function exportExcel() {
    const res = state.res, it = state.interp;
    const bold = (v, extra = {}) => ({ v, bold: true, ...extra });
    const sheets = [];
    const rows = [[{ v: S.REPORT_TITLE, bold: true, size: 14, color: TH.NAVY }], [generatedLine()], []];
    for (const [l, v] of metadata(res)) rows.push([bold(l), v]);
    rows.push([], [{ v: S.SUMMARY_1MIN, bold: true, size: 12, color: TH.BRONZE }]);
    rows.push(S.LIGHTS_HEAD.map((x) => bold(x, { fill: TH.SAND, wrap: true })));
    for (const l of it.lights) { const f = TH.STATUS_TINT[l.status]; rows.push([{ v: l.title, fill: f }, { v: TEXT.lightStatus[l.status], fill: f }, { v: l.sentence, fill: f }]); }
    for (const sec of it.sections) {
      if (!sec.technical.length) continue;
      rows.push([], [{ v: sec.title, bold: true, size: 12, color: TH.BRONZE }]);
      rows.push(S.TECH_HEAD.map((x) => bold(x, { fill: TH.SAND, wrap: true })));
      for (const t of sec.technical) rows.push([t.label.trim(), t.value, t.criterion]);
    }
    sheets.push({ name: S.SHEETS.summary, rows, widths: { 0: 42, 1: 40, 2: 90 } });
    const tableSheet = (key) => {
      const f = tableFrame(res, key); if (!f) return;
      const head = f.cols.map((c) => bold(columnLabel(c, res), { fill: TH.SAND, wrap: true }));
      const body = f.rows.map((r, k) => f.cols.map((c) => {
        const v = r[c];
        const fill = f.flag[k] ? TH.FLAG_ROW : f.muted[k] ? TH.BACKGROUND : undefined;
        if (typeof v === "number") return { v: isFinite(v) ? v : null, dec: INT_COLS.has(c) && Number.isInteger(v) ? 0 : (C0.DECIMALS[c] ?? 3), fill };
        if (typeof v === "boolean") return { v: v ? S.YES : "", fill };
        return { v: v === null || v === undefined ? "" : String(v), fill };
      }));
      const widths = {};
      f.cols.forEach((c, j) => { widths[j] = Math.max(8, Math.min(60, Math.max(String(columnLabel(c, res)).length, ...body.map((r) => String(r[j].v ?? "").length)) + 2)); });
      sheets.push({ name: S.SHEETS[key], rows: [head, ...body], widths, freeze: true });
    };
    ["items", "persons", "categories", "dif", "loadings"].forEach(tableSheet);
    const q = res.q3;
    sheets.push({ name: S.SHEETS.q3, freeze: true, rows: [[bold("Q3", { fill: TH.SAND }), ...q.names.map((n) => bold(n, { fill: TH.SAND }))],
      ...q.names.map((n, a) => [n, ...q.names.map((_, b) => ({ v: isF(q.matrix[a][b]) ? q.matrix[a][b] : null, dec: 3 }))])] });
    tableSheet("q3_pairs");
    sheets.push({ name: S.SHEETS.notes, widths: { 0: 14, 1: 140 }, rows: [[bold("Tingkat", { fill: TH.SAND }), bold("Pesan", { fill: TH.SAND })],
      ...res.issues.map((i) => [S.NOTE_LEVELS[i.level] || i.level, i.message])] });
    sheets.push({ name: S.SHEETS.iterations, widths: { 0: 10, 1: 22, 2: 22 }, rows: [S.ITER_HEAD.map((x) => bold(x, { fill: TH.SAND })),
      ...res.jmle.log.map((r) => [r.iteration, { v: r.maxChange, dec: 6 }, { v: r.maxResidual, dec: 6 }])] });
    sheets.push({ name: S.SHEETS.settings, widths: { 0: 24, 1: 24 }, rows: [[bold("Pengaturan", { fill: TH.SAND }), bold("Nilai", { fill: TH.SAND })],
      ...Object.entries(res.settings).map(([k, v]) => [k, Array.isArray(v) ? `(${v.join(", ")})` : typeof v === "boolean" ? (v ? "True" : "False") : String(v)])] });
    download(S.EXPORT_FILES.excel, X.writeXlsx(sheets), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  function flaggedItems(res) {
    const names = new Set(res.items.filter((r) => r.flag_misfit || r.flag_negative_ptmea).map((r) => r.item));
    if (res.categories && res.model === "pcm") res.categories.filter((r) => C0.CATEGORY_FLAGS.some((f) => r[f])).forEach((r) => names.add(r.item));
    if (res.dif) res.dif.filter((r) => r.flag_dif).forEach((r) => names.add(r.item));
    return res.coded.itemNames.filter((n) => names.has(n));
  }

  function reportHtml(forPrint) {
    const res = state.res, it = state.interp;
    const items = CH.itemChoices(res);
    const all = items.length <= 30;
    const chosen = all ? items : flaggedItems(res).slice(0, 30);
    const charts = [];
    for (const spec of CH.availableCharts(res)) {
      if (spec.perItem) chosen.forEach((i) => charts.push([spec, i])); else charts.push([spec, null]);
    }
    const note = all ? S.REPORT_PER_ITEM_ALL : fmtS(S.REPORT_PER_ITEM_FLAGGED, { folder: S.EXPORT_FILES.charts });
    const table = (key) => {
      const f = tableFrame(res, key); if (!f) return "";
      const head = f.cols.map((c) => `<th>${esc(columnLabel(c, res))}</th>`).join("");
      const body = f.rows.map((r, k) => `<tr${f.flag[k] ? ' class="flag"' : f.muted[k] ? ' class="dim"' : ""}>` +
        f.cols.map((c) => `<td${typeof r[c] === "number" ? ' class="num"' : ""}>${esc(fmtValue(r[c], c))}</td>`).join("") + "</tr>").join("");
      return `<h3>${esc(S.TABLE_TITLES[key] || key)}</h3><div class="tablewrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    };
    const css = document.getElementById("app-css").textContent;
    return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(S.REPORT_TITLE)} · ${esc(it.modelName)}</title><style>${css}
body{background:var(--bg)} .tablewrap{max-height:none} table.data th{position:static;cursor:default}
figure{margin:18px 0 28px;break-inside:avoid} figure svg{width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:#fff}
figcaption{background:var(--card);border-left:3px solid var(--bronze);padding:8px 12px;margin-top:8px;color:var(--ink2)}
.meta td:first-child{font-weight:600;background:var(--sand);width:300px}
@media print{header.band,h2.title{break-after:avoid} .light,figure,tr{break-inside:avoid} @page{size:A4;margin:12mm}}
</style></head><body><header class="band"><img alt="CSPS" src="${window.RASCH_LOGO}"><div><div class="kicker">${esc(TEXT.app)}</div>
<h1>${esc(S.REPORT_TITLE)}</h1><div class="ver">${esc(it.modelName)} · ${esc(generatedLine())}</div></div></header><main>
<h2 class="title">${esc(S.REPORT_META)}</h2><table class="data meta">${metadata(res).map(([l, v]) => `<tr><td>${esc(l)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
${it.cautions.length ? `<h2 class="title">${esc(S.CAUTIONS)}</h2><div class="banner warning"><ul>${it.cautions.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
<h2 class="title">${esc(S.SUMMARY_1MIN)}</h2><div class="lights">${it.lights.map((l) => `<div class="light"><div><span class="dot s-${l.status}"></span><b>${esc(l.title)}</b><div class="status">${esc(S.STATUS_TEXT[l.status])}</div></div><div>${esc(l.sentence)}</div></div>`).join("")}</div>
<h2 class="title">${esc(S.EXPLANATION)}</h2>${it.intro.map((p) => `<p>${esc(p)}</p>`).join("")}
${it.sections.map((sec) => `<h3><span class="dot s-${sec.status}"></span>${esc(sec.title)}</h3>${sec.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}` +
  (sec.actions.length ? `<p><b>${esc(S.ACTIONS)}</b></p><ul>${sec.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "") +
  (sec.technical.length ? `<details${forPrint ? " open" : ""}><summary>${esc(S.REPORT_TECHNICAL)}</summary><table class="tech"><tr>${S.TECH_HEAD.map((x) => `<th>${esc(x)}</th>`).join("")}</tr>` +
    sec.technical.map((t) => `<tr><td>${esc(t.label.trim())}</td><td>${esc(t.value)}</td><td>${esc(t.criterion)}</td></tr>`).join("") + "</table>" +
    (sec.references.length ? `<p class="refs">${esc(S.REFERENCES)}:</p><ul class="refs">${sec.references.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "") + "</details>" : "")).join("")}
<h2 class="title">${esc(S.REPORT_CHARTS)}</h2><p class="help">${esc(note)}</p>
${charts.map(([spec, item]) => `<figure><h3>${esc(spec.title + (item ? ": " + item : ""))}</h3>${CH.render(res, spec.key, item)}<figcaption><b>${esc(S.HOW_TO_READ)}.</b> ${esc(CH.howToRead(res, spec.key))}</figcaption></figure>`).join("")}
<h2 class="title">${esc(S.REPORT_TABLES)}</h2><p class="help">${esc(S.REPORT_TABLE_HINT)}</p>
${["items", "persons", "categories", "dif", "loadings", "q3_pairs"].map(table).join("")}
<h2 class="title">${esc(S.REPORT_GLOSSARY)}</h2><dl class="glossary">${Object.values(TEXT.glossary).map((t) => `<dt>${esc(t.term)}</dt><dd>${esc(t.long)}</dd>`).join("")}</dl>
<footer>${esc(TEXT.app)} · ${esc(TEXT.version)} · Center for Social Psychology and Society</footer></main></body></html>`;
  }

  function exportHtml() { download(S.EXPORT_FILES.html, reportHtml(false), "text/html"); }
  function printPdf() {
    let frame = $("#printframe");
    if (frame) frame.remove();
    frame = h("iframe", { id: "printframe", title: "print" });
    document.body.append(frame);
    frame.srcdoc = reportHtml(true);
    frame.onload = () => setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 300);
  }

  async function svgToPng(svgText, dpi) {
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svgText);
    const w = Number(m[1]), hgt = Number(m[2]), scale = dpi / 96;
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale); canvas.height = Math.round(hgt * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
      return new Blob([X.pngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi)], { type: "image/png" });
    } finally { URL.revokeObjectURL(url); }
  }

  async function exportCharts() {
    const res = state.res, msg = $("#export-banner");
    const jobs = [];
    for (const spec of CH.availableCharts(res)) {
      if (spec.perItem) CH.itemChoices(res).forEach((i) => jobs.push([spec.key, i, `${spec.key}_${safe(i)}`]));
      else jobs.push([spec.key, null, spec.key]);
    }
    const files = [];
    for (let k = 0; k < jobs.length; k++) {
      const [key, item, stem] = jobs[k];
      banner(msg, fmtS(W.chartsProgress, { k: k + 1, n: jobs.length }), "info");
      const svg = CH.render(res, key, item);
      files.push({ name: `${S.EXPORT_FILES.charts}/${stem}.svg`, data: svg });
      files.push({ name: `${S.EXPORT_FILES.charts}/${stem}.png`, data: new Uint8Array(await (await svgToPng(svg, 300)).arrayBuffer()) });
    }
    download("grafik_raschlite.zip", X.zip(files), "application/zip");
    banner(msg, fmtS(W.savedTo, { name: `grafik_raschlite.zip (${jobs.length} grafik, PNG 300 dpi + SVG)` }), "info");
  }

  async function guarded(fn, name) {
    const msg = $("#export-banner"), box = $("#export-buttons");
    box.classList.add("busy");
    banner(msg, W.working, "info");
    try { await fn(); if (name) banner(msg, fmtS(W.savedTo, { name }), "info"); }
    catch (err) { console.error(err); banner(msg, fmtS(S.EXPORT_FAILED, { error: err.message || err }), "error"); }
    finally { box.classList.remove("busy"); }
  }

  // --------------------------------------------------------------------------------------
  // Inisialisasi
  // --------------------------------------------------------------------------------------
  function init() {
    document.title = TEXT.app;
    $("#steps").replaceChildren(...S.STEPS.map((s) => h("div", {}, s)));
    $("#app-name").textContent = TEXT.app;
    $("#app-ver").textContent = `versi ${TEXT.version} · HTML`;
    $("#logo").src = window.RASCH_LOGO;
    for (const [id, key] of [["t-import", "IMPORT_TITLE"], ["t-model", "MODEL_TITLE"], ["t-run", "RUN_TITLE"]]) $("#" + id).textContent = S[key];
    $("#import-help").textContent = S.IMPORT_HELP + " " + W.offline;
    $("#btn-open").textContent = S.BTN_OPEN; $("#btn-dicho").textContent = S.BTN_SAMPLE_DICHO; $("#btn-poly").textContent = S.BTN_SAMPLE_POLY;
    $("#file-label").textContent = S.NO_FILE;
    $("#l-id").textContent = S.LBL_ID; $("#l-group").textContent = S.LBL_GROUP; $("#l-missing").textContent = S.LBL_MISSING;
    $("#l-items").textContent = S.LBL_ITEMS; $("#missing").placeholder = S.MISSING_PLACEHOLDER;
    $("#btn-all").textContent = S.BTN_ALL; $("#btn-clear").textContent = S.BTN_CLEAR;
    $("#l-recommend").textContent = S.RECOMMENDED; $("#run-help").textContent = S.RUN_HELP;
    document.querySelectorAll(".btn-back").forEach((b) => (b.textContent = S.BTN_BACK));
    $("#btn-next1").textContent = S.BTN_NEXT; $("#btn-run").textContent = S.BTN_RUN; $("#btn-cancel").textContent = S.BTN_CANCEL;
    $("#btn-new").textContent = S.BTN_NEW;
    $("#btn-excel").textContent = W.excel; $("#btn-html").textContent = W.html; $("#btn-pdf").textContent = W.pdf; $("#btn-charts").textContent = W.charts;

    $("#file").addEventListener("change", (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ""; });
    $("#btn-open").addEventListener("click", () => $("#file").click());
    $("#btn-dicho").addEventListener("click", () => loadSample("dichotomous"));
    $("#btn-poly").addEventListener("click", () => loadSample("polytomous"));
    $("#btn-all").addEventListener("click", () => $("#items").querySelectorAll("input").forEach((x) => (x.checked = true)));
    $("#btn-clear").addEventListener("click", () => $("#items").querySelectorAll("input").forEach((x) => (x.checked = false)));
    $("#btn-next1").addEventListener("click", () => { if (validate()) { setupModelPage(); go("model"); } });
    $("#btn-back2").addEventListener("click", () => go("import"));
    $("#btn-run").addEventListener("click", run);
    $("#btn-cancel").addEventListener("click", () => { state.cancel = true; $("#run-log").textContent += S.RUN_CANCELLING + "\n"; });
    $("#btn-run-back").addEventListener("click", () => go("model"));
    $("#btn-back4").addEventListener("click", () => go("model"));
    $("#btn-new").addEventListener("click", () => go("import"));
    $("#btn-excel").addEventListener("click", () => guarded(exportExcel, S.EXPORT_FILES.excel));
    $("#btn-html").addEventListener("click", () => guarded(exportHtml, S.EXPORT_FILES.html));
    $("#btn-pdf").addEventListener("click", () => guarded(printPdf, null).then(() => banner($("#export-banner"), W.printed, "info")));
    $("#btn-charts").addEventListener("click", () => guarded(exportCharts, null));
    // Seret-lepas berkas ke halaman impor
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { go("import"); openFile(f); } });
    go("import");
  }
  window.RaschApp = { state, loadSample, validate, setupModelPage, run, exportExcel, exportHtml, reportHtml, exportCharts, svgToPng, go };
  init();
})();
