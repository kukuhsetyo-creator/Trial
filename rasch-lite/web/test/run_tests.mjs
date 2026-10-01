// Uji kesetaraan engine JavaScript terhadap golden file dari engine Python.
// Jalankan: node web/test/run_tests.mjs   (setelah python web/tools/export_text.py dan make_golden.py)
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const TEXT = JSON.parse(readFileSync(join(web, "build", "text.json"), "utf8"));
globalThis.RASCH_TEXT = TEXT;
const E = require(join(web, "src", "engine.js"));
E.setText(TEXT);
let I = null;
try { I = require(join(web, "src", "interpret.js")); I.setText(TEXT); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
const golden = JSON.parse(readFileSync(join(here, "golden.json"), "utf8"));
const samples = { dichotomous: "contoh_dikotomus.csv", polytomous: "contoh_politomus.csv" };
const SAMPLE_DIR = join(web, "..", "src", "raschlite", "resources", "sample_data");

const TOL = 1e-6;
let failures = 0, checks = 0;
function fail(msg) { failures++; if (failures <= 40) console.log("  GAGAL:", msg); }
function near(a, b, path) {
  checks++;
  if (b === null) { if (!(a === null || a === undefined || Number.isNaN(a))) fail(`${path}: ${a} != NaN`); return; }
  if (b === "inf" || b === "-inf") { if (a !== (b === "inf" ? Infinity : -Infinity)) fail(`${path}: ${a} != ${b}`); return; }
  if (typeof b === "number") {
    if (typeof a !== "number" || !(Math.abs(a - b) <= TOL * Math.max(1, Math.abs(b)))) fail(`${path}: ${a} != ${b}`);
    return;
  }
  if (typeof b === "boolean") { if (Boolean(a) !== b) fail(`${path}: ${a} != ${b}`); return; }
  if (typeof b === "string") { if (String(a) !== b) fail(`${path}: '${a}' != '${b}'`); return; }
  if (Array.isArray(b)) {
    if (!a || a.length !== b.length) { fail(`${path}: panjang ${a && a.length} != ${b.length}`); return; }
    b.forEach((v, k) => near(a[k], v, `${path}[${k}]`));
    return;
  }
  for (const k of Object.keys(b)) near(a[k], b[k], `${path}.${k}`);
}

for (const g of golden) {
  const c = g.case;
  const t0 = Date.now();
  const failsBefore = failures;
  const path = c.file.startsWith("SAMPLE:") ? join(SAMPLE_DIR, samples[c.file.split(":")[1]]) : join(here, "data", c.file);
  const table = E.parseCsv(readFileSync(path, "utf8"));
  const items = table.columns.filter((col) => col !== c.id && col !== c.group && !(c.drop || []).includes(col));
  const prep = E.prepareData(table, { itemCols: items, idCol: c.id, groupCol: c.group, missingCodes: c.missing || [] });
  near(prep.responseType, g.prep.responseType, "prep.responseType");
  near(prep.recommendedModel, g.prep.recommended, "prep.recommended");
  near(prep.recommendationReason, g.prep.reason, "prep.reason");
  const res = E.runAnalysis(prep, c.model, { strictFit: !!c.strict });
  near(res.jmle.nIter, g.jmle.nIter, "jmle.nIter");
  near(res.jmle.converged, g.jmle.converged, "jmle.converged");
  near(Array.from(res.jmle.theta), g.jmle.theta, "jmle.theta");
  near(Array.from(res.jmle.b), g.jmle.b, "jmle.b");
  near(res.jmle.delta.map((r) => Array.from(r)), g.jmle.delta, "jmle.delta");
  near(res.items, g.items, "items");
  near(res.persons, g.persons, "persons");
  if (g.categories.length) near(res.categories, g.categories, "categories");
  const s = { ...res.summary };
  near(s, g.summary, "summary");
  const d = res.dimensionality;
  near(d.eigenvalues, g.dimensionality.eigenvalues, "pca.eigenvalues");
  near(d.loadings, g.dimensionality.loadings, "pca.loadings");
  near(d.variance_explained_pct, g.dimensionality.variance_explained_pct, "pca.var");
  near(d.first_contrast_pct_total, g.dimensionality.first_contrast_pct_total, "pca.fc_pct");
  near(res.q3.matrix, g.q3.matrix, "q3.matrix");
  near({ mean: res.q3.mean, max: res.q3.max, cutoff: res.q3.cutoff }, { mean: g.q3.mean, max: g.q3.max, cutoff: g.q3.cutoff }, "q3");
  near(res.q3.flagged_pairs, g.q3.flagged_pairs, "q3.pairs");
  near(res.dif || [], g.dif, "dif");
  near(res.issues.map((i) => [i.level, i.code, i.message]), g.issues, "issues");
  near(res.settings, g.settings, "settings");
  if (I) {
    const md = I.toMarkdown(I.interpret(res));
    checks++;
    if (md !== g.markdown) {
      const a = md.split("\n"), b = g.markdown.split("\n");
      const k = a.findIndex((line, j) => line !== b[j]);
      fail(`markdown baris ${k}:\n    JS: ${a[k]}\n    PY: ${b[k]}`);
    }
  }
  console.log(`${failures === failsBefore ? "OK   " : "GAGAL"} ${c.name} (${Date.now() - t0} ms)`);
}

// --- Uji pembaca dan penulis .xlsx ------------------------------------------------------
{
  const X = require(join(web, "src", "xlsx.js"));
  const { execFileSync } = await import("child_process");
  const { writeFileSync, mkdtempSync } = await import("fs");
  const { tmpdir } = await import("os");
  let xf = 0;
  // 1. Data contoh dari .xlsx (dibuat pandas/openpyxl) memberi hasil yang sama dengan golden CSV.
  const table = await X.readXlsx(readFileSync(join(here, "data", "sample_dich.xlsx")));
  const g = golden.find((x) => x.case.name === "sample_dich");
  const items = table.columns.filter((col) => col !== "ID" && col !== "Jenis_Kelamin");
  const res = E.runAnalysis(E.prepareData(table, { itemCols: items, idCol: "ID", groupCol: "Jenis_Kelamin" }), "dichotomous");
  const before = failures;
  near(res.items, g.items, "xlsx.items"); near(res.persons, g.persons, "xlsx.persons"); near(res.dif, g.dif, "xlsx.dif");
  xf += failures - before;
  // 2. Workbook tulisan JS dapat dibuka openpyxl dengan angka, teks, format, dan warna utuh.
  const bytes = X.writeXlsx([
    { name: "Uji: angka/teks?", freeze: true, widths: { 0: 20 },
      rows: [[{ v: "Item", bold: true, fill: "#EEE6DC" }, { v: "Measure (logit)", bold: true }],
             ["A01", { v: -0.6912345, dec: 2, fill: "#F4DED5" }], ["A<&>02", { v: 1.5, dec: 3 }], ["kosong", NaN]] },
    { name: "Kedua", rows: [["x"]] },
  ]);
  const dir = mkdtempSync(join(tmpdir(), "rl-"));
  writeFileSync(join(dir, "t.xlsx"), bytes);
  const py = `
import json, openpyxl
wb = openpyxl.load_workbook(r"${join(dir, "t.xlsx")}")
ws = wb.worksheets[0]
print(json.dumps({"names": wb.sheetnames, "a2": ws["A2"].value, "b2": ws["B2"].value, "fmt": ws["B2"].number_format,
  "fill": ws["B2"].fill.fgColor.rgb, "bold": ws["A1"].font.b, "a3": ws["A3"].value, "b4": ws["B4"].value,
  "freeze": ws.freeze_panes}))`;
  const out = JSON.parse(execFileSync(join(web, "..", ".venv", "bin", "python"), ["-c", py]).toString());
  const expect = { names: ["Uji  angka teks ", "Kedua"], a2: "A01", b2: -0.6912345, fmt: "0.00", fill: "FFF4DED5", bold: true,
    a3: "A<&>02", b4: null, freeze: "B2" };
  const before2 = failures;
  near(out, expect, "xlsx.openpyxl");
  xf += failures - before2;
  console.log(`${xf ? "GAGAL" : "OK   "} xlsx (baca: data contoh .xlsx = golden; tulis: dibuka openpyxl)`);
  console.log(`total ${checks} pemeriksaan, ${failures} gagal`);
  process.exit(failures ? 1 : 0);
}
