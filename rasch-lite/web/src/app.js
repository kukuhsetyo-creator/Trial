/* RaschLite versi HTML: antarmuka wizard empat langkah, panel hasil, dan ekspor.
 * Padanan gui/ (PySide6) dan report/ pada versi desktop; seluruh teks dari TEXT.strings.
 */
(function () {
  "use strict";
  const TEXT = window.RASCH_TEXT;
  const S = TEXT.strings, C0 = TEXT.common, TH = TEXT.theme;
  const E = window.RaschEngine, I = window.RaschInterpret, CH = window.RaschCharts, X = window.RaschXlsx;
  const A = window.RaschAdvanced, CM = window.RaschCMLE, F = window.RaschInference;
  E.setText(TEXT); I.setText(TEXT); CH.setText(TEXT); CH.setEngine(E);
  A.setEngine(E); CM.setEngine(E); F.setText(TEXT); F.setModules(I, A);
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
    audit: "Unduh Berkas Audit (ZIP)",
    keyFound: "Baris kunci ditemukan (baris {row}, {n} butir): jawaban mentah akan diskor otomatis dengan kunci tersebut dan analisis distraktor dijalankan.",
  };
  const STATUS_X = { ...S.STATUS_TEXT, tentatif: "Belum dapat ditentukan" };
  const LIGHT_X = { ...TEXT.lightStatus, tentatif: "Belum dapat ditentukan" };
  const TINT_X = { ...TH.STATUS_TINT, tentatif: TH.STATUS_TINT.kuning };
  const fmtS = E.pyFormat;

  const state = { table: null, fileName: "", prep: null, res: null, interp: null, cancel: false,
    keyRow: -1, answers: null, origPrep: null, blocks: null, ms: null, adv: null, blockCal: null, runOpts: null };

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
    state.keyRow = A.findKeyRow(table, idCol);
    if (state.keyRow >= 0) {
      const keyCells = table.rows[state.keyRow];
      const withKey = new Set(table.columns.filter((c, j) => c !== idCol && c !== groupCol && keyCells[j] !== null && keyCells[j] !== undefined && String(keyCells[j]).trim() !== ""));
      $("#items").querySelectorAll("input").forEach((x) => (x.checked = withKey.has(x.value)));
      banner($("#import-banner"), fmtS(W.keyFound, { row: state.keyRow + 2, n: withKey.size }), "info");
    }
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
      let table = state.table;
      state.answers = null;
      if (state.keyRow >= 0) {
        const sc = A.scoreWithKey(state.table, state.keyRow, itemCols);
        table = sc.table; state.answers = { keys: sc.keys, raw: sc.raw };
      }
      state.prep = E.prepareData(table, { itemCols, idCol, groupCol, missingCodes: missing });
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
    setupAdvanced();
  }

  /** Opsi diagnostik lanjutan dan perlakuan data kosong (struktur data dipetakan sebelum estimasi). */
  function setupAdvanced() {
    const prep = state.prep, dicho = prep.responseType === "dichotomous";
    state.origPrep = prep;
    state.blocks = A.detectBlocks(prep.itemNames);
    state.ms = A.missingStructure(prep, state.blocks);
    const ms = state.ms;
    document.querySelectorAll('input[name="testtype"]').forEach((r) => (r.checked = r.value === (dicho ? "tes" : "angket")));
    let k = "";
    if (state.answers) {
      const counts = Object.values(state.answers.raw).map((arr) => new Set(arr.filter((v) => v && !v.includes(";"))).size);
      const mx = Math.max(...counts);
      if (mx >= 2) k = String(mx);
    }
    $("#n-options").value = k;
    const size = prep.nPersons * prep.nItems;
    $("#sim-reps").value = size <= 100000 ? "50" : size <= 400000 ? "30" : "0";
    $("#opt-cmle").checked = size <= 40000;
    const blockTxt = state.blocks.detected ? `${state.blocks.blocks.length} blok dikenali dari awalan nama butir (${state.blocks.blocks.map((b) => `${b.name}: ${b.items.length}`).join(", ")}). ` : "Tidak ada blok yang dikenali; seluruh butir diperlakukan sebagai satu urutan. ";
    const sum = $("#missing-summary");
    if (!ms.missing) {
      sum.textContent = blockTxt + "Tidak ada data kosong.";
      $("#treatments").replaceChildren();
      return;
    }
    sum.textContent = blockTxt + `${num(ms.pctMissing, 1)}% sel kosong: ${num(ms.pctOmitted, 1)}% omitted (dilewati di tengah) dan ${num(ms.pctNotReached, 1)}% not-reached (sesudah jawaban terakhir dalam blok). ` +
      (ms.speeded ? `Pola kosong mengikuti posisi butir (korelasi ${num(ms.trend)}): tes tampak speeded.` : "Tidak tampak pola speeded.");
    const rec = ms.speeded && dicho ? "lo1999" : "asis";
    const opts = [
      ["asis", "Kosong = missing", "Semua sel kosong diabaikan dalam estimasi (bawaan)."],
      ["lo1999", "Ludlow & O'Leary (1999)", "Kalibrasi butir: omitted = salah, not-reached diabaikan. Penskoran person: semua kosong = salah, dengan butir dijangkarkan pada hasil kalibrasi."],
      ["allwrong", "Kosong = salah", "Semua sel kosong dihitung salah (kategori terendah) pada kalibrasi maupun penskoran."],
    ];
    $("#treatments").replaceChildren(...opts.map(([v, title, desc]) => h("label", {},
      h("input", { type: "radio", name: "treatment", value: v, checked: v === "asis" }), " ", h("b", {}, title + (v === rec && v !== "asis" ? " (disarankan untuk pola ini)" : "")), h("small", {}, desc))));
  }
  function advancedOptions() {
    const n = parseInt($("#n-options").value, 10);
    return {
      testType: ($('input[name="testtype"]:checked') || {}).value || "tes",
      nOptions: Number.isFinite(n) && n >= 2 ? n : null,
      simReps: Number($("#sim-reps").value) || 0,
      sensitivity: $("#opt-sens").checked, tailored: $("#opt-tailored").checked, cmle: $("#opt-cmle").checked,
      treatment: ($('input[name="treatment"]:checked') || {}).value || "asis", seed: 20240917,
    };
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
    const aopt = advancedOptions();
    state.runOpts = { ...aopt, model, strictFit: $("#strict").checked, runDif: $("#dif").checked };
    try {
      const tr = A.applyTreatment(state.origPrep, state.ms, aopt.treatment);
      if (aopt.treatment !== "asis") log.textContent += `Perlakuan data kosong: ${aopt.treatment === "lo1999" ? "Ludlow & O'Leary (1999)" : "kosong = salah"}\n`;
      const res = await E.runAnalysisAsync(tr.calibPrep, model, {
        strictFit: $("#strict").checked, runDif: $("#dif").checked,
        shouldCancel: () => state.cancel,
        progress: (it, change, resid) => {
          log.textContent += fmtS(S.RUN_ITER, { it, change: num(change, 5), resid: num(resid, 4) }) + "\n";
          log.scrollTop = log.scrollHeight;
          const score = Math.max(change / 0.001, resid / 0.01);
          if (first === null) first = Math.max(score, 1.0001);
          bar.value = 0.5 * progressFraction(first, score);
        },
      });
      bar.value = 0.5;
      log.textContent += "Diagnostik lanjutan:\n";
      let lastLabel = "";
      const adv = await A.runAll(res, { origPrep: state.origPrep, blocks: state.blocks, ms: state.ms, treatment: aopt.treatment, scoringRaw: tr.scoringRaw, answers: state.answers },
        aopt, (label, frac) => {
          if (frac === undefined) { log.textContent += "  " + label + "\n"; lastLabel = label; }
          else { bar.value = 0.5 + 0.5 * Math.min(frac, 1) * 0.95; }
          log.scrollTop = log.scrollHeight;
        }, () => state.cancel);
      void lastLabel;
      bar.value = 1;
      log.textContent += fmtS(S.RUN_DONE, { sec: num((performance.now() - t0) / 1000, 2) }) + "\n";
      state.res = res; state.adv = adv; state.blockCal = null; state.interp = F.interpretAll(res, adv);
      buildResults();
      go("results");
    } catch (err) {
      if (err instanceof E.EstimationCancelled || (err && err.message === "dibatalkan")) { banner($("#run-banner"), S.RUN_CANCELLED, "info"); log.textContent += S.RUN_CANCELLED + "\n"; }
      else { banner($("#run-banner"), fmtS(S.RUN_FAILED, { error: err.message || err }), "error"); console.error(err); }
    } finally {
      $("#btn-cancel").disabled = true; $("#btn-run-back").disabled = false;
    }
  }

  // --------------------------------------------------------------------------------------
  // Tabel
  // --------------------------------------------------------------------------------------
  const INT_COLS = new Set(["score", "count", "max_score", "n_categories", "category", "n_a", "n_b", "not_reached", "answered", "omitted", "n_items", "persons_not_attempted",
    "excluded", "n_persons", "n_items_flagged", "position", "n", "n_options", "n_items_a", "n_items_b", "df_int"]);
  const DEC_X = { p: 3, q: 3, mh_p: 3, mh_q: 3, lr_uniform_p: 3, lr_nonuniform_p: 3, lr_delta_r2: 3, r_observed: 3, r_disattenuated: 3, r_measures: 3, r_pb: 3, r_key: 3,
    coverage: 3, bias: 3, rmse: 3, bias_uncorrected: 3, guttman_gstar: 3, proportion: 3, p_correct: 3, chance: 3, person_reliability: 3, item_reliability: 3,
    reliability_a: 3, reliability_b: 3, q3: 3, q3_relative: 3, mean_loading: 3, min_loading: 3, max_loading: 3, cmle: 3, cmle_se: 3, jmle: 3, jmle_uncorrected: 3, difference: 3, generating: 3, pct_positive: 1, smith_pct: 1, smith_ci_low: 1, smith_ci_high: 1, pct_omitted: 1, pct_not_reached: 1, last_item_answered_pct: 1, df: 1 };
  function fmtValue(v, col) {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? S.YES : "";
    if (typeof v === "number") {
      if (!isFinite(v)) return "";
      if (INT_COLS.has(col) && Number.isInteger(v)) return String(v);
      const d = DEC_X[col] ?? C0.DECIMALS[col] ?? 2;
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
    const adv = state.adv;
    if (key === "items") {
      const cols = TC.items.filter((c) => c !== "n_categories" || res.model !== "dichotomous");
      if (!adv) return { rows: res.items, cols, flag: res.items.map((r) => r.flag_misfit || r.flag_negative_ptmea), muted: res.items.map((r) => r.extreme) };
      const rows = res.items.map((r, k) => ({ ...r, ptmea_gap: adv.flags.rows[k].ptmea_gap, fit_status: FIT_LABEL[adv.flags.rows[k].status], fit_reason: adv.flags.rows[k].reasons }));
      return { rows, cols: [...cols, "ptmea_gap", "fit_status", "fit_reason"], flag: adv.flags.rows.map((r) => r.status === "serius" || r.status === "telaah"), muted: res.items.map((r) => r.extreme) };
    }
    if (key === "persons") {
      const cols = TC.persons.filter((c) => c !== "group" || res.coded.groups);
      if (!adv) return { rows: res.persons, cols, flag: res.persons.map((r) => r.flag_misfit), muted: res.persons.map((r) => r.extreme || !isF(r.measure)) };
      const sc = adv.scored ? new Map(adv.scored.rows.map((r) => [r.person, r])) : null;
      const extra = ["lz_star", "guttman_gstar", "not_reached", "quality"];
      if (sc) extra.push("measure_scored", "se_scored");
      const rows = res.persons.map((r, k) => {
        const q = adv.pq.rows[k], row = { ...r, lz_star: q.lz_star, guttman_gstar: q.guttman_gstar, not_reached: q.not_reached, quality: QUALITY_LABEL[q.quality] };
        if (sc && sc.has(r.person)) { row.measure_scored = sc.get(r.person).measure; row.se_scored = sc.get(r.person).se; }
        return row;
      });
      return { rows, cols: [...cols.filter((c) => c !== "flag_misfit"), ...extra], flag: adv.pq.rows.map((q) => q.flag_underfit || q.flag_chance), muted: res.persons.map((r) => r.extreme || !isF(r.measure)) };
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
  const FIT_LABEL = { serius: "Serius", telaah: "Perlu ditelaah", catatan: "Catatan", overfit: "Overfit", wajar: "Wajar", extreme: "Extreme" };
  const QUALITY_LABEL = { underfit: "Underfit (menyimpang)", tebakan: "Setara tebakan", overfit: "Overfit (tidak merusak)", extreme: "Extreme", wajar: "Wajar" };
  const COLX = {
    ptmea_gap: "PTMEA exp. - obs.", fit_status: "Status fit", fit_reason: "Alasan", lz_star: "lz*", guttman_gstar: "Guttman G*", not_reached: "Not-reached",
    quality: "Kualitas respons", measure_scored: "Measure (skor akhir)", se_scored: "SE (skor akhir)", item: "Item", block: "Blok", position: "Posisi",
    answered: "Dijawab", omitted: "Omitted", pct_omitted: "% omitted", pct_not_reached: "% not-reached", n_items: "Jumlah item",
    persons_not_attempted: "Person tidak mengerjakan blok", last_item_answered_pct: "% mencapai butir terakhir", scenario: "Skenario", excluded: "Dikeluarkan",
    n_persons: "Person", person_reliability: "Person reliability", item_reliability: "Item reliability", person_sd: "Person SD", eigenvalue: "First contrast eigenvalue",
    n_items_flagged: "Item ditandai", mean_abs_shift: "Pergeseran item rata-rata", max_abs_shift: "Pergeseran terbesar", max_shift_item: "Item tergeser terbesar", r_measures: "r item measure",
    status: "Status", reasons: "Alasan", infit_zstd: "Infit ZSTD", outfit_zstd: "Outfit ZSTD", ptmea_gap_z: "z selisih PTMEA",
    measure_original: "Measure (utama)", measure_tailored: "Measure (tailored)", difference: "Selisih", se_difference: "SE selisih", z: "z", flag_guessing: "Dipengaruhi tebakan",
    option: "Opsi", key: "Kunci", count: "n", proportion: "Proporsi", mean_measure: "Rata-rata measure", r_pb: "r point-biserial",
    n: "n", n_options: "Jumlah opsi", p_correct: "Proporsi benar", r_key: "r kunci", chance: "Peluang tebakan", flags: "Tanda",
    mean_loading: "Loading rata-rata", min_loading: "Loading min.", max_loading: "Loading maks.", pct_positive: "% loading positif",
    a: "Gugus A", b: "Gugus B", n_items_a: "Item A", n_items_b: "Item B", r_observed: "r teramati", reliability_a: "Reliabilitas A", reliability_b: "Reliabilitas B",
    r_disattenuated: "r disattenuated", smith_pct: "Uji t Smith (%)", smith_ci_low: "IK bawah (%)", smith_ci_high: "IK atas (%)",
    person_separation: "Person separation", person_mean: "Person mean", converged: "Konvergen",
    q3: "Q3", q3_relative: "Q3 relatif", item_a: "Item A", item_b: "Item B",
    group_a: "Kelompok A", group_b: "Kelompok B", contrast: "DIF contrast", joint_se: "Joint SE", t: "t", df: "df", p: "p", q: "q (BH)", mdc: "MDC (daya 80%)", flag: "Ditandai",
    size: "Ukuran (ETS)", mh_delta: "MH delta", mh_p: "MH p", mh_q: "MH q", mh_ets: "MH ETS", lr_uniform_p: "LR uniform p", lr_nonuniform_p: "LR non-uniform p", lr_delta_r2: "LR delta R2", lr_class: "LR kelas",
    chi2: "Chi-square", range: "Rentang measure", max_mdc: "MDC maks.",
    cmle: "Measure CMLE", cmle_se: "SE CMLE", jmle: "Measure JMLE", jmle_uncorrected: "JMLE tanpa koreksi", generating: "Parameter pembangkit",
    bias: "Bias", rmse: "RMSE", bias_uncorrected: "Bias tanpa koreksi", coverage: "Cakupan IK 95%", threshold: "Threshold",
    measure_a: "Measure A", measure_b: "Measure B", se_a: "SE A", se_b: "SE B", n_a: "n A", n_b: "n B",
  };
  function columnLabel(col, res) { return { ...S.COLUMNS, ...COLX, ...(res ? difLabels(res) : {}) }[col] || col; }
  /** Tabel umum untuk hasil diagnostik lanjutan. */
  function advTable(rows, cols, flagFn, res) {
    if (!rows || !rows.length) return h("p", { class: "mini" }, "Tidak ada baris.");
    const labels = Object.fromEntries(cols.map((c) => [c, columnLabel(c, res)]));
    return dataTable(rows, cols, { labels, flag: rows.map((r) => (flagFn ? !!flagFn(r) : false)) });
  }

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
    const res = state.res, it = state.interp, s = res.summary, adv = state.adv;
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
    const svgBox = (svg) => h("div", { class: "chart", html: svg });
    const first = add(S.TAB_SUMMARY, () => summaryTab(res, it));
    add(S.TAB_ITEMS, () => [h("p", { class: "help" }, S.TABLE_HINT), frameTable(res, "items")]);
    add(S.TAB_PERSONS, () => [h("p", { class: "help" }, S.TABLE_HINT + " Baris berwarna: person underfit menurut lz* (dikotomus) atau MNSQ+ZSTD, atau skor setara tebakan."), frameTable(res, "persons")]);
    add("Kualitas Data", () => dataQualityTab(res, adv, svgBox));
    add("Diagnostik Item", () => itemDiagTab(res, adv));
    add(S.TAB_CATEGORIES, () => (res.categories ? [h("p", { class: "help" }, S.TABLE_HINT), frameTable(res, "categories")] : [h("p", {}, S.NOT_APPLICABLE_CATEGORIES)]));
    add("Reliabilitas & Targeting", () => reliabilityTab(res, adv, svgBox));
    add(S.TAB_DIMENSION, () => {
      const d = res.dimensionality;
      return withChart(["pca_contrast"], ...dimensionTab(res, adv, svgBox), h("h3", {}, "First contrast loadings"),
        h("p", {}, fmtS(S.DIMENSION_TEXT, { eig: num(d.first_contrast_eigenvalue), lim: num(adv.sim && isF(adv.sim.eig_p95) ? adv.sim.eig_p95 : TEXT.rules.CONTRAST_EIGENVALUE_MAX, 2), pct: num(d.variance_explained_pct, 1) + "%" })),
        frameTable(res, "loadings"));
    });
    add(S.TAB_LOCAL, () => {
      const q = res.q3, de = adv.dim;
      const parts = [h("p", {}, `Rata-rata Q3 ${num(q.mean, 3)}. Batas Q3 relatif ${num(de.q3_relative_cutoff, 3)} (${de.q3_source === "simulasi" ? "persentil ke-95 bootstrap parametrik, Christensen dkk. 2017" : "batas tetap"}); pasangan dengan Q3 - rata-rata di atas batas ditandai.`)];
      parts.push(advTable(de.q3_pairs, ["item_a", "item_b", "q3", "q3_relative"], () => true, res));
      if (de.testlets.length) parts.push(h("h3", {}, "Kandidat testlet"), h("ul", {}, ...de.testlets.map((g) => h("li", {}, g.join(", ")))));
      return withChart(["q3_heatmap"], ...parts);
    });
    add(S.TAB_DIF, () => difTab(res, adv, withChart));
    add("Validasi", () => validationTab(res, adv));
    add(S.TAB_CHARTS, () => withChart(null));
    add(S.TAB_GLOSSARY, () => h("dl", { class: "glossary" }, ...[...Object.values(TEXT.glossary), ...Object.values(F.GLOSSARY)].flatMap((t) => [h("dt", {}, t.term), h("dd", {}, t.long)])));
    first.click();
  }

  const confBadge = (c) => (c ? h("span", { class: "conf", title: c.reason }, I_CONF[c.level] || c.level) : null);
  const I_CONF = { tinggi: "keyakinan tinggi", sedang: "keyakinan sedang", rendah: "keyakinan rendah" };

  function summaryTab(res, it) {
    const out = [];
    if (it.cautions.length) {
      const b = h("div"); banner(b, `<b>${esc(S.CAUTIONS)}</b><br>` + it.cautions.map((c) => "• " + esc(c)).join("<br>"), "warning", true);
      out.push(b);
    }
    if (it.synthesis) {
      out.push(h("h2", { class: "title" }, "Sintesis"));
      out.push(h("div", { class: "synth" }, ...it.synthesis.map((p) => h("p", {}, p.text, confBadge(p.confidence)))));
    }
    out.push(h("h2", { class: "title" }, S.SUMMARY_1MIN));
    out.push(h("div", { class: "lights" }, ...it.lights.map((l) => {
      const gk = S.LIGHT_GLOSSARY[l.key], g = gk && TEXT.glossary[gk];
      return h("div", { class: "light", title: g ? `${g.term}: ${g.short}` : null },
        h("div", {}, h("span", { class: `dot s-${l.status}` }), h("b", {}, l.title), h("div", { class: "status" }, STATUS_X[l.status] || l.status), l.confidence ? h("div", { class: "status" }, confBadge(l.confidence)) : null),
        h("div", {}, l.sentence));
    })));
    if (it.actions && it.actions.length) {
      out.push(h("h2", { class: "title" }, "Urutan tindakan"));
      out.push(h("p", { class: "help" }, "Tindakan diurutkan menurut ketergantungan logisnya: masalah kunci dan data diselesaikan sebelum menilai responden, responden sebelum butir, butir sebelum struktur dimensi, dan seterusnya, karena perbaikan di tahap awal dapat mengubah temuan di tahap berikutnya."));
      out.push(h("ol", { class: "stages" }, ...it.actions.map((a) => h("li", {}, h("span", { class: "stage" }, `${a.label}. `), a.text))));
    }
    out.push(h("h2", { class: "title" }, S.EXPLANATION));
    it.intro.forEach((p) => out.push(h("p", {}, p)));
    for (const sec of it.sections) {
      out.push(h("h3", {}, h("span", { class: `dot s-${sec.status}` }), sec.title, confBadge(sec.confidence)));
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

  function dataQualityTab(res, adv, svgBox) {
    const out = [], ms = adv.ms, pq = adv.pq;
    out.push(h("h3", {}, "Struktur data kosong"));
    if (ms && ms.missing) {
      out.push(h("p", {}, `${num(ms.pctMissing, 1)}% sel kosong: ${num(ms.pctOmitted, 1)}% omitted, ${num(ms.pctNotReached, 1)}% not-reached. Korelasi posisi butir dengan % not-reached ${num(ms.trend)}` +
        (ms.speeded ? "; pola speeded." : ".") + ` Perlakuan yang dipakai: ${adv.treatment === "lo1999" ? "Ludlow & O'Leary (1999)" : adv.treatment === "allwrong" ? "kosong = salah" : "kosong = missing"}.`));
      out.push(advTable(ms.blockStats, ["block", "n_items", "pct_omitted", "pct_not_reached", "persons_not_attempted", "last_item_answered_pct"], null, res));
      out.push(svgBox(CH.missingPattern(ms, adv.blocks)));
      out.push(h("details", {}, h("summary", {}, "Data kosong per butir"), advTable(ms.perItem, ["item", "block", "position", "answered", "omitted", "not_reached", "pct_omitted", "pct_not_reached"], null, res)));
    } else out.push(h("p", {}, "Tidak ada data kosong."));
    out.push(h("p", {}, `Jumlah butir yang dijawab berkorelasi ${num(pq.r_answered_measure)} dengan measure (Spearman ${num(pq.rho_answered_measure)}) dan ${num(pq.r_answered_pcorrect)} dengan proporsi benar di antara butir yang dijawab.`));
    out.push(h("h3", {}, "Kualitas respons person"));
    out.push(h("p", {}, pq.method === "lz*" ? `lz* (Snijders, 2001): ${pq.n_underfit} underfit (lz* < -1,645; harapan acak sekitar ${num(pq.expected_false_positive, 0)}), ${pq.n_overfit} overfit. Rata-rata lz* ${num(pq.lz_mean)}, SD ${num(pq.lz_sd)}. Kriteria lama (rentang MNSQ item) menandai ${pq.n_classic} person.`
      : `MNSQ dan ZSTD: ${pq.n_underfit} underfit, ${pq.n_overfit} overfit; rentang MNSQ saja menandai ${pq.n_classic} person.`) + (pq.nOptions ? ` Skor setara tebakan (${pq.nOptions} opsi): ${pq.n_chance} person.` : ""));
    if (adv.scored) out.push(h("p", {}, `Penskoran akhir Ludlow & O'Leary: person reliability (MODEL) ${num(adv.scored.separation.model_reliability)}; lihat kolom 'Measure (skor akhir)' di tab Person.`));
    if (adv.sens) {
      out.push(h("h3", {}, "Analisis sensitivitas"));
      out.push(h("p", { class: "help" }, "Analisis dijalankan ulang tanpa person yang menyimpang; perubahan yang besar berarti kesimpulan bergantung pada responden tersebut."));
      out.push(advTable(adv.sens, ["scenario", "excluded", "n_persons", "person_reliability", "item_reliability", "person_sd", "eigenvalue", "n_items_flagged", "mean_abs_shift", "max_abs_shift", "max_shift_item", "r_measures"], null, res));
    }
    return out;
  }

  function itemDiagTab(res, adv) {
    const out = [];
    out.push(h("p", { class: "help" }, "Status fit menggabungkan MNSQ, ZSTD, dan selisih PTMEA teramati terhadap harapan (lihat Ringkasan). 'Catatan' berarti hanya satu kriteria terpenuhi."));
    out.push(advTable(adv.flags.rows.filter((r) => r.status !== "wajar" && r.status !== "extreme").map((r) => ({ ...r, status: FIT_LABEL[r.status] })),
      ["item", "status", "reasons", "infit_mnsq", "infit_zstd", "outfit_mnsq", "outfit_zstd", "ptmea_obs", "ptmea_exp", "ptmea_gap", "ptmea_gap_z"], (r) => r.status === "Serius" || r.status === "Perlu ditelaah", res));
    const g = adv.guess;
    out.push(h("h3", {}, "Petunjuk tebakan"));
    out.push(h("p", {}, `Korelasi Spearman outfit MNSQ dengan item measure ${num(g.rho_outfit_measure)} (p ${g.p_rho < 0.001 ? "< 0,001" : "= " + num(g.p_rho, 3)}).` +
      (isF(g.unexpected_success) ? ` Jawaban benar pada sel berpeluang < 20%: ${g.unexpected_success} (harapan ${num(g.expected_success_low, 0)}, z = ${num(g.z_success_low)}); jawaban salah pada sel berpeluang > 80%: ${g.unexpected_failure}.` : "")));
    if (adv.tailored && adv.tailored.rows) {
      const t = adv.tailored;
      out.push(h("h3", {}, "Tailored analysis (Andrich, Marais & Humphry, 2012)"));
      out.push(h("p", {}, `Respons dengan peluang benar < ${num(t.cutoff)} dibuang (${t.removed} respons, ${num(t.pct_removed, 1)}%); skala disejajarkan pada butir termudah: ${t.anchor_items.join(", ")}.`));
      out.push(advTable(t.rows, ["item", "measure_original", "measure_tailored", "difference", "se_difference", "z", "flag_guessing"], (r) => r.flag_guessing, res));
    }
    if (adv.distractors) {
      out.push(h("h3", {}, "Analisis distraktor"));
      out.push(advTable(adv.distractors.items, ["item", "key", "n", "n_options", "p_correct", "chance", "r_key", "flags"], (r) => r.flag, res));
      out.push(h("details", {}, h("summary", {}, "Statistik setiap opsi"), advTable(adv.distractors.options, ["item", "option", "key", "count", "proportion", "mean_measure", "r_pb"], (r) => r.key, res)));
    } else if (adv.belowChance && adv.belowChance.length) {
      out.push(h("h3", {}, "Butir di bawah peluang tebakan"));
      out.push(advTable(adv.belowChance.map((x) => ({ item: x.item, p_correct: x.p, chance: x.chance })), ["item", "p_correct", "chance"], () => true, res));
      out.push(h("p", { class: "mini" }, "Untuk analisis distraktor, impor jawaban mentah (huruf opsi) dengan satu baris berisi KUNCI di kolom ID."));
    }
    return out;
  }

  function reliabilityTab(res, adv, svgBox) {
    const rt = adv.rt, s = res.summary;
    const rows = [
      ["Person reliability (REAL / MODEL)", `${num(s.person_reliability)} / ${num(s.person.model_reliability)}`],
      ["SD measure teramati", num(rt.observed_sd, 3)], ["SD sejati (REAL)", num(rt.true_sd, 3)], ["RMSE (REAL / MODEL)", `${num(rt.rmse_real, 3)} / ${num(rt.rmse_model, 3)}`],
      ["Porsi varians galat", I.pct(100 * rt.error_share, 1)], ["RMSE minimum (butir tepat sasaran)", num(rt.rmse_min, 3)], ["Reliabilitas maksimum", num(rt.reliability_max)],
      ["Rata-rata butir dijawab", num(rt.mean_answered, 1)], ["Butir untuk reliabilitas 0,80 / 0,90", `${num(rt.items_for_080, 0)} / ${num(rt.items_for_090, 0)}`],
      [`${s.alpha_label} (kasus lengkap)`, `${num(s.alpha)} (${rt.alpha_complete_n} dari ${s.n_persons} person)` + (rt.alpha_selection_warning ? " — tidak representatif" : "")],
      ["Efisiensi informasi median / P25 / P75", `${I.pct(100 * rt.info_eff_median, 1)} / ${I.pct(100 * rt.info_eff_p25, 1)} / ${I.pct(100 * rt.info_eff_p75, 1)}`],
    ];
    return [h("table", { class: "tech" }, ...rows.map(([a, b]) => h("tr", {}, h("td", {}, a), h("td", {}, b)))), svgBox(CH.infoEfficiency(res, rt))];
  }

  function dimensionTab(res, adv, svgBox) {
    const out = [], de = adv.dim, sim = adv.sim;
    if (sim && sim.reps) {
      out.push(h("p", {}, `Ambang dari ${sim.reps} simulasi data patuh model (benih ${sim.seed}): eigenvalue P95 ${num(sim.eig_p95)}, P99 ${num(sim.eig_p99)}; Q3 relatif P95 ${num(sim.q3rel_p95, 3)}.`));
      out.push(svgBox(CH.nullEigen(sim, res.dimensionality.first_contrast_eigenvalue)));
    }
    if (de.blockRows.length) { out.push(h("h3", {}, "Loading first contrast per blok")); out.push(advTable(de.blockRows, ["block", "n_items", "mean_loading", "min_loading", "max_loading", "pct_positive"], null, res)); }
    const pairs = [de.clusters, ...de.blockPairs].filter(Boolean);
    if (pairs.length) {
      out.push(h("h3", {}, "Korelasi terdisatenuasi dan uji t Smith"));
      out.push(advTable(pairs, ["a", "b", "n_items_a", "n_items_b", "n_persons", "r_observed", "reliability_a", "reliability_b", "r_disattenuated", "smith_pct", "smith_ci_low", "smith_ci_high"], (r) => r.r_disattenuated < A.RULES.DISATTENUATED_HALF, res));
    }
    if (adv.blocks.detected) {
      const box = h("div");
      const btn = h("button", { class: "primary", onclick: async () => {
        btn.disabled = true; box.replaceChildren(h("p", {}, "Mengalibrasi setiap blok…"));
        try {
          state.blockCal = await A.calibrateBlocks(state.res.prep, res.model, adv.blocks, { strictFit: res.settings.strict_fit });
          box.replaceChildren(advTable(state.blockCal.map(({ result, ...r }) => r), ["block", "n_items", "n_persons", "person_reliability", "person_separation", "item_reliability", "eigenvalue", "n_items_flagged", "person_mean", "person_sd", "converged"], null, res));
        } catch (err) { box.replaceChildren(h("p", {}, "Gagal: " + (err.message || err))); }
        btn.disabled = false;
      } }, "Kalibrasi per blok");
      out.push(h("h3", {}, "Kalibrasi per subskala"), h("p", { class: "help" }, "Setiap blok dianalisis sebagai tes tersendiri dengan model dan perlakuan data yang sama. Hasilnya ikut diekspor ke Excel."), btn, box);
    }
    return out;
  }

  function difTab(res, adv, withChart) {
    const dx = adv.dif, out = [];
    if (!dx || !dx.levels || dx.levels.length < 2) return res.dif ? withChart(["dif"], h("p", { class: "help" }, S.TABLE_HINT), frameTable(res, "dif")) : [h("p", {}, S.NOT_APPLICABLE_DIF)];
    out.push(h("p", {}, `Kelompok: ${dx.levels.map((g, k) => `${g} (${dx.sizes[k]})`).join(", ")}. MDC median ${num(dx.mdc_median)} logit; ${I.pct(100 * dx.share_detectable)} item mampu mendeteksi DIF besar (${num(A.RULES.DIF_DETECT_TARGET)} logit) dengan daya 80%.` +
      (dx.purification_iterations ? ` Purifikasi: ${dx.purification_iterations} iterasi.` : "")));
    if (dx.table) {
      const cols = ["item", "contrast", "joint_se", "t", "p", "q", "mdc", "size", "flag"];
      if (dx.dichotomous) cols.push("mh_delta", "mh_p", "mh_q", "mh_ets", "lr_uniform_p", "lr_nonuniform_p", "lr_delta_r2", "lr_class");
      out.push(advTable(dx.table, cols, (r) => r.flag, res));
      if (dx.dtf) out.push(h("p", {}, `DTF: selisih skor harapan rata-rata ${num(dx.dtf.mean_diff)} poin dari ${dx.dtf.max_score} (maks. ${num(dx.dtf.max_abs_diff)}), setara ${num(dx.dtf.logit_equivalent, 3)} logit; menguntungkan ${dx.dtf.favoured}.`));
    } else {
      out.push(h("h3", {}, "Uji omnibus antar-kelompok"), advTable(dx.omnibus, ["item", "chi2", "df", "p", "q", "range", "max_mdc", "flag"], (r) => r.flag, res));
      out.push(h("details", {}, h("summary", {}, "Setiap kelompok lawan kelompok lainnya"), advTable(dx.vs_rest, ["item", "group_a", "measure_a", "measure_b", "contrast", "joint_se", "p", "q", "mdc", "flag"], (r) => r.flag, res)));
    }
    if (res.dif) out.push(h("details", {}, h("summary", {}, "Tabel DIF engine (Draba, tanpa koreksi uji ganda)"), frameTable(res, "dif")));
    return res.dif ? withChart(["dif"], ...out) : out;
  }

  function validationTab(res, adv) {
    const out = [];
    const cm = adv.cmle;
    if (cm && !cm.error) {
      out.push(h("h3", {}, "JMLE dibandingkan dengan CMLE"));
      out.push(h("p", {}, `r ${num(cm.r, 4)}, RMSD ${num(cm.rmsd, 3)} logit, selisih terbesar ${num(cm.max_abs_difference, 3)}; kemiringan JMLE terhadap CMLE ${num(cm.slope_jmle_on_cmle, 3)} (tanpa koreksi bias ${num(cm.slope_uncorrected_on_cmle, 3)}). CMLE memakai ${cm.n_persons_used} person non-extreme, ${cm.iterations} iterasi BFGS, ${cm.converged ? "konvergen" : "TIDAK konvergen"}.`));
      out.push(advTable(cm.items, ["item", "jmle", "jmle_uncorrected", "cmle", "cmle_se", "difference"], (r) => Math.abs(r.difference) > 0.1, res));
      if (cm.tau) out.push(advTable(cm.tau, ["threshold", "jmle", "cmle", "cmle_se"], null, res));
    } else if (cm && cm.error) out.push(h("p", {}, "CMLE gagal: " + cm.error));
    else out.push(h("p", {}, "CMLE tidak dijalankan (aktifkan di langkah Model)."));
    const sim = adv.sim;
    if (sim && sim.reps) {
      out.push(h("h3", {}, "Studi pemulihan parameter"));
      out.push(h("p", {}, `${sim.reps} data simulasi dengan person, item, dan pola kosong yang sama (benih ${sim.seed}; ${sim.failed} gagal). Rata-rata |bias| ${num(sim.recovery_bias, 3)} logit (tanpa koreksi bias ${num(sim.recovery_bias_uncorrected, 3)}), RMSE ${num(sim.recovery_rmse, 3)}, cakupan IK 95% ${I.pct(100 * sim.recovery_coverage, 1)}. Rata-rata person reliability simulasi ${num(sim.person_rel_mean)}.`));
      out.push(advTable(sim.recovery, ["item", "generating", "bias", "bias_uncorrected", "rmse", "coverage", "n"], (r) => r.coverage < 0.9, res));
    }
    out.push(h("h3", {}, "Log konfigurasi"));
    out.push(h("pre", { class: "log" }, JSON.stringify(configLog(), null, 1)));
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
      ...(state.adv ? [["Perlakuan data kosong", { asis: "kosong = missing", lo1999: "Ludlow & O'Leary (1999)", allwrong: "kosong = salah" }[state.adv.treatment]],
        ["Jenis instrumen", state.adv.opts.testType === "tes" ? "tes kemampuan" : "angket"],
        ["Simulasi ambang", state.adv.sim ? `${state.adv.sim.reps} replikasi, benih ${state.adv.sim.seed}` : "tidak dijalankan"]] : []),
    ];
  }

  /** Log konfigurasi untuk audit dan reproduksi. */
  function hashText(str) { let h1 = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h1 ^= str.charCodeAt(i); h1 = Math.imul(h1, 0x01000193) >>> 0; } return h1.toString(16).padStart(8, "0"); }
  function configLog() {
    const res = state.res, adv = state.adv;
    return {
      app: TEXT.app, version: TEXT.version + " (HTML)", generated: new Date().toISOString(), source_file: state.fileName,
      data_fingerprint_fnv1a: state.table ? hashText(JSON.stringify(state.table.rows)) : null,
      n_persons: res.summary.n_persons, n_items: res.summary.n_items, items: res.coded.itemNames,
      options: state.runOpts, engine_settings: res.settings,
      jmle: { converged: res.converged, iterations: res.summary.iterations, max_change: res.summary.max_change, max_residual: res.summary.max_residual },
      advanced_rules: A.RULES, interpretation_rules: Object.fromEntries(Object.entries(TEXT.rules).filter(([k]) => k !== "REFERENCES")),
      blocks: adv ? adv.blocks.blocks.map((b) => ({ name: b.name, items: b.names })) : null,
      timing_seconds: adv ? adv.timing : null, issues: res.issues.map((i) => `${i.level}: ${i.message}`),
    };
  }

  function exportExcel() {
    const res = state.res, it = state.interp;
    const bold = (v, extra = {}) => ({ v, bold: true, ...extra });
    const sheets = [];
    const rows = [[{ v: S.REPORT_TITLE, bold: true, size: 14, color: TH.NAVY }], [generatedLine()], []];
    for (const [l, v] of metadata(res)) rows.push([bold(l), v]);
    rows.push([], [{ v: S.SUMMARY_1MIN, bold: true, size: 12, color: TH.BRONZE }]);
    rows.push(S.LIGHTS_HEAD.map((x) => bold(x, { fill: TH.SAND, wrap: true })));
    for (const l of it.lights) { const f = TINT_X[l.status]; rows.push([{ v: l.title, fill: f }, { v: LIGHT_X[l.status], fill: f }, { v: l.sentence + (l.confidence ? ` (${I_CONF[l.confidence.level]})` : ""), fill: f, wrap: true }]); }
    if (it.synthesis) {
      rows.push([], [{ v: "Sintesis", bold: true, size: 12, color: TH.BRONZE }]);
      it.synthesis.forEach((p) => rows.push(["", "", { v: p.text + (p.confidence ? ` (${I_CONF[p.confidence.level]})` : ""), wrap: true }]));
      rows.push([], [{ v: "Urutan tindakan", bold: true, size: 12, color: TH.BRONZE }]);
      it.actions.forEach((a, k) => rows.push([`${k + 1}. ${a.label}`, "", { v: a.text, wrap: true }]));
    }
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
        if (typeof v === "number") return { v: isFinite(v) ? v : null, dec: INT_COLS.has(c) && Number.isInteger(v) ? 0 : (DEC_X[c] ?? C0.DECIMALS[c] ?? 3), fill };
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
    advancedSheets(sheets, bold);
    download(S.EXPORT_FILES.excel, X.writeXlsx(sheets), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  /** Lembar Excel untuk diagnostik lanjutan. */
  function advancedSheets(sheets, bold) {
    const res = state.res, adv = state.adv; if (!adv) return;
    const sheet = (name, rows, cols) => {
      if (!rows || !rows.length) return;
      const head = cols.map((c) => bold(columnLabel(c, res), { fill: TH.SAND, wrap: true }));
      const body = rows.map((r) => cols.map((c) => {
        const v = r[c];
        if (typeof v === "number") return { v: isFinite(v) ? v : null, dec: INT_COLS.has(c) && Number.isInteger(v) ? 0 : (DEC_X[c] ?? C0.DECIMALS[c] ?? 3) };
        if (typeof v === "boolean") return v ? S.YES : "";
        return v === null || v === undefined ? "" : String(v);
      }));
      const widths = {}; cols.forEach((c, j) => { widths[j] = Math.max(9, Math.min(60, String(columnLabel(c, res)).length + 2)); });
      sheets.push({ name: name.slice(0, 31), rows: [head, ...body], widths, freeze: true });
    };
    if (adv.ms && adv.ms.missing) {
      sheet("Data Kosong Blok", adv.ms.blockStats, ["block", "n_items", "pct_omitted", "pct_not_reached", "persons_not_attempted", "last_item_answered_pct"]);
      sheet("Data Kosong Butir", adv.ms.perItem, ["item", "block", "position", "answered", "omitted", "not_reached", "pct_omitted", "pct_not_reached"]);
    }
    sheet("Kualitas Person", adv.pq.rows.map((r) => ({ ...r, quality: QUALITY_LABEL[r.quality] })), ["person", "measure", "score", "count", "not_reached", "infit_mnsq", "infit_zstd", "outfit_mnsq", "outfit_zstd", "lz_star", "guttman_errors", "guttman_gstar", "chance_p", "quality"]);
    if (adv.scored) sheet("Skor Akhir LO1999", adv.scored.rows, ["person", "score", "max_score", "count", "measure", "se", "extreme"]);
    if (adv.sens) sheet("Sensitivitas", adv.sens, ["scenario", "excluded", "n_persons", "person_reliability", "item_reliability", "person_sd", "eigenvalue", "n_items_flagged", "mean_abs_shift", "max_abs_shift", "max_shift_item", "r_measures"]);
    sheet("Status Fit Item", adv.flags.rows.map((r) => ({ ...r, status: FIT_LABEL[r.status] })), ["item", "status", "reasons", "measure", "count", "infit_mnsq", "infit_zstd", "outfit_mnsq", "outfit_zstd", "ptmea_obs", "ptmea_exp", "ptmea_gap", "ptmea_gap_z"]);
    if (adv.tailored && adv.tailored.rows) sheet("Tailored", adv.tailored.rows, ["item", "measure_original", "measure_tailored", "difference", "se_difference", "z", "flag_guessing"]);
    if (adv.distractors) { sheet("Distraktor Butir", adv.distractors.items, ["item", "key", "n", "n_options", "p_correct", "chance", "r_key", "flags"]); sheet("Distraktor Opsi", adv.distractors.options, ["item", "option", "key", "count", "proportion", "mean_measure", "r_pb"]); }
    if (adv.sim && adv.sim.reps) {
      sheets.push({ name: "Simulasi", widths: { 0: 44, 1: 18 }, rows: [[bold("Statistik", { fill: TH.SAND }), bold("Nilai", { fill: TH.SAND })],
        ["Replikasi (gagal)", `${adv.sim.reps} (${adv.sim.failed})`], ["Benih acak", adv.sim.seed], ["Eigenvalue P95 / P99", `${num(adv.sim.eig_p95)} / ${num(adv.sim.eig_p99)}`],
        ["Q3 relatif P95 / P99", `${num(adv.sim.q3rel_p95, 3)} / ${num(adv.sim.q3rel_p99, 3)}`], ["Laju penandaan item (patuh model)", I.pct(100 * adv.sim.flagged_rate, 1)],
        ["Pemulihan |bias| / RMSE / cakupan", `${num(adv.sim.recovery_bias, 3)} / ${num(adv.sim.recovery_rmse, 3)} / ${I.pct(100 * adv.sim.recovery_coverage, 1)}`],
        ...adv.sim.eig_values.map((v, k) => [`Eigenvalue replikasi ${k + 1}`, { v, dec: 3 }])] });
      sheet("Pemulihan Parameter", adv.sim.recovery, ["item", "generating", "bias", "bias_uncorrected", "rmse", "coverage", "n"]);
    }
    if (adv.dim.blockRows.length) sheet("Loading Blok", adv.dim.blockRows, ["block", "n_items", "mean_loading", "min_loading", "max_loading", "pct_positive"]);
    sheet("Disattenuated", [adv.dim.clusters, ...adv.dim.blockPairs].filter(Boolean), ["a", "b", "n_items_a", "n_items_b", "n_persons", "r_observed", "reliability_a", "reliability_b", "r_disattenuated", "smith_pct", "smith_ci_low", "smith_ci_high"]);
    sheet("Q3 Batas Simulasi", adv.dim.q3_pairs, ["item_a", "item_b", "q3", "q3_relative"]);
    if (state.blockCal) sheet("Kalibrasi per Blok", state.blockCal.map(({ result, ...r }) => r), ["block", "n_items", "n_persons", "person_reliability", "person_separation", "item_reliability", "eigenvalue", "n_items_flagged", "person_mean", "person_sd", "converged"]);
    if (adv.dif && adv.dif.table) sheet("DIF Lanjutan", adv.dif.table, ["item", "group_a", "group_b", "measure_a", "measure_b", "contrast", "joint_se", "t", "df", "p", "q", "mdc", "size", "flag", "mh_delta", "mh_p", "mh_q", "mh_ets", "lr_uniform_p", "lr_nonuniform_p", "lr_delta_r2", "lr_class"]);
    if (adv.dif && adv.dif.omnibus) { sheet("DIF Omnibus", adv.dif.omnibus, ["item", "chi2", "df", "p", "q", "range", "max_mdc", "flag"]); sheet("DIF vs Lainnya", adv.dif.vs_rest, ["item", "group_a", "measure_a", "measure_b", "contrast", "joint_se", "p", "q", "mdc", "flag"]); }
    if (adv.cmle && !adv.cmle.error) sheet("CMLE", adv.cmle.items, ["item", "jmle", "jmle_uncorrected", "cmle", "cmle_se", "difference"]);
    const rm = A.residualMatrix(res);
    sheets.push({ name: "Residual Terstandar", freeze: true, rows: [[bold("Person", { fill: TH.SAND }), ...rm.items.map((n) => bold(n, { fill: TH.SAND }))],
      ...rm.persons.map((p, a) => [p, ...rm.z[a].map((v) => ({ v: isF(v) ? v : null, dec: 3 }))])] });
    sheets.push({ name: "Konfigurasi", widths: { 0: 120 }, rows: JSON.stringify(configLog(), null, 1).split("\n").map((l) => [l]) });
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
${it.synthesis ? `<h2 class="title">Sintesis</h2><div class="synth">${it.synthesis.map((p) => `<p>${esc(p.text)}${p.confidence ? ` <span class="conf">${esc(I_CONF[p.confidence.level])}</span>` : ""}</p>`).join("")}</div>` : ""}
<h2 class="title">${esc(S.SUMMARY_1MIN)}</h2><div class="lights">${it.lights.map((l) => `<div class="light"><div><span class="dot s-${l.status}"></span><b>${esc(l.title)}</b><div class="status">${esc(STATUS_X[l.status] || l.status)}${l.confidence ? ` · ${esc(I_CONF[l.confidence.level])}` : ""}</div></div><div>${esc(l.sentence)}</div></div>`).join("")}</div>
${it.actions && it.actions.length ? `<h2 class="title">Urutan tindakan</h2><ol class="stages">${it.actions.map((a) => `<li><span class="stage">${esc(a.label)}.</span> ${esc(a.text)}</li>`).join("")}</ol>` : ""}
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
${advancedReportTables()}
<h2 class="title">${esc(S.REPORT_GLOSSARY)}</h2><dl class="glossary">${Object.values(TEXT.glossary).map((t) => `<dt>${esc(t.term)}</dt><dd>${esc(t.long)}</dd>`).join("")}</dl>
<footer>${esc(TEXT.app)} · ${esc(TEXT.version)} · Center for Social Psychology and Society</footer></main></body></html>`;
  }

  function advancedReportTables() {
    const adv = state.adv, res = state.res; if (!adv) return "";
    const tbl = (title, rows, cols) => {
      if (!rows || !rows.length) return "";
      const head = cols.map((c) => `<th>${esc(columnLabel(c, res))}</th>`).join("");
      const body = rows.map((r) => "<tr>" + cols.map((c) => `<td${typeof r[c] === "number" ? ' class="num"' : ""}>${esc(fmtValue(r[c], c))}</td>`).join("") + "</tr>").join("");
      return `<h3>${esc(title)}</h3><div class="tablewrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    };
    let out = "";
    if (adv.ms && adv.ms.missing) out += tbl("Data kosong per blok", adv.ms.blockStats, ["block", "n_items", "pct_omitted", "pct_not_reached", "persons_not_attempted", "last_item_answered_pct"]) + `<figure>${CH.missingPattern(adv.ms, adv.blocks)}</figure>`;
    if (adv.sens) out += tbl("Analisis sensitivitas", adv.sens, ["scenario", "excluded", "person_reliability", "item_reliability", "eigenvalue", "n_items_flagged", "mean_abs_shift", "r_measures"]);
    out += tbl("Status fit item (selain wajar)", adv.flags.rows.filter((r) => r.status !== "wajar" && r.status !== "extreme").map((r) => ({ ...r, status: FIT_LABEL[r.status] })), ["item", "status", "reasons", "infit_zstd", "outfit_zstd", "ptmea_obs", "ptmea_exp"]);
    if (adv.tailored && adv.tailored.rows) out += tbl("Tailored analysis: butir terdampak tebakan", adv.tailored.rows.filter((r) => r.flag_guessing), ["item", "measure_original", "measure_tailored", "difference", "z"]);
    if (adv.distractors) out += tbl("Analisis distraktor", adv.distractors.items.filter((r) => r.flag), ["item", "key", "p_correct", "r_key", "flags"]);
    if (adv.sim && adv.sim.reps) out += `<figure>${CH.nullEigen(adv.sim, res.dimensionality.first_contrast_eigenvalue)}</figure>`;
    out += tbl("Korelasi terdisatenuasi dan uji t Smith", [adv.dim.clusters, ...adv.dim.blockPairs].filter(Boolean), ["a", "b", "r_observed", "r_disattenuated", "smith_pct", "smith_ci_low", "smith_ci_high"]);
    if (state.blockCal) out += tbl("Kalibrasi per blok", state.blockCal.map(({ result, ...r }) => r), ["block", "n_items", "person_reliability", "item_reliability", "eigenvalue", "n_items_flagged"]);
    if (adv.dif && adv.dif.table) out += tbl("DIF lanjutan", adv.dif.table, ["item", "contrast", "p", "q", "mdc", "flag", "mh_delta", "mh_ets", "lr_delta_r2", "lr_class"].filter((c) => adv.dif.dichotomous || !/^(mh|lr)_/.test(c)));
    if (adv.cmle && !adv.cmle.error) out += tbl("JMLE dan CMLE", adv.cmle.items, ["item", "jmle", "cmle", "cmle_se", "difference"]);
    return out ? `<h2 class="title">Diagnostik lanjutan</h2>${out}` : "";
  }

  /** Berkas audit: butir, person, matriks residual, dan log konfigurasi (CSV titik desimal). */
  function exportAudit() {
    const res = state.res, adv = state.adv;
    const csvCell = (v) => (v === null || v === undefined || (typeof v === "number" && !isFinite(v)) ? "" : typeof v === "number" ? String(v) : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = (cols, rows) => "\ufeff" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n");
    const thr = res.jmle.threshold;
    const itemRows = res.items.map((r, i) => {
      const row = { item: r.item, measure: r.measure, se: r.se, count: r.count, score: r.score, infit_mnsq: r.infit_mnsq, outfit_mnsq: r.outfit_mnsq,
        ptmea_obs: r.ptmea_obs, ptmea_exp: r.ptmea_exp, extreme: r.extreme, fit_status: adv ? adv.flags.rows[i].status : "" };
      for (let k = 0; k < res.coded.m[i] && res.model !== "dichotomous"; k++) row[`threshold_${k + 1}`] = thr[i][k];
      return row;
    });
    const itemCols = Object.keys(itemRows.reduce((a, r) => Object.assign(a, r), {}));
    const sc = adv && adv.scored ? new Map(adv.scored.rows.map((r) => [r.person, r])) : null;
    const personRows = res.persons.map((r, n) => ({ person: r.person, group: r.group ?? "", measure: r.measure, se: r.se, score: r.score, count: r.count, max_score: r.max_score,
      infit_mnsq: r.infit_mnsq, outfit_mnsq: r.outfit_mnsq, lz_star: adv ? adv.pq.rows[n].lz_star : "", quality: adv ? adv.pq.rows[n].quality : "",
      measure_scored: sc && sc.has(r.person) ? sc.get(r.person).measure : "", se_scored: sc && sc.has(r.person) ? sc.get(r.person).se : "", extreme: r.extreme }));
    const rm = A.residualMatrix(res);
    const resid = "\ufeff" + ["person," + rm.items.map(csvCell).join(","), ...rm.persons.map((p, a) => csvCell(p) + "," + rm.z[a].map((v) => (isF(v) ? v.toFixed(5) : "")).join(","))].join("\r\n");
    const files = [
      { name: "audit_raschlite/items.csv", data: csv(itemCols, itemRows) },
      { name: "audit_raschlite/persons.csv", data: csv(Object.keys(personRows[0]), personRows) },
      { name: "audit_raschlite/standardized_residuals.csv", data: resid },
      { name: "audit_raschlite/config.json", data: JSON.stringify(configLog(), null, 2) },
      { name: "audit_raschlite/README.txt", data: "Berkas audit RaschLite. items.csv dapat dipakai sebagai berkas anchor untuk penyetaraan antar-form (kolom measure dalam logit, sudah dikoreksi bias JMLE). " +
        "standardized_residuals.csv berisi (x - E) / sqrt(W) untuk person dan item non-extreme. config.json mencatat pengaturan, ambang, benih acak simulasi, dan sidik jari data. Desimal memakai titik.\r\n" },
    ];
    if (adv && adv.cmle && !adv.cmle.error) files.push({ name: "audit_raschlite/cmle_items.csv", data: csv(["item", "jmle", "jmle_uncorrected", "cmle", "cmle_se", "difference"], adv.cmle.items) });
    download("audit_raschlite.zip", X.zip(files), "application/zip");
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
    $("#btn-audit").textContent = W.audit;

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
    $("#btn-audit").addEventListener("click", () => guarded(exportAudit, "audit_raschlite.zip"));
    // Seret-lepas berkas ke halaman impor
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { go("import"); openFile(f); } });
    go("import");
  }
  window.RaschApp = { state, loadSample, validate, setupModelPage, run, exportExcel, exportHtml, reportHtml, exportCharts, exportAudit, svgToPng, go, configLog };
  init();
})();
