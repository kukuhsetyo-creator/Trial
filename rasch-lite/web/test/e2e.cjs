// Uji end-to-end RaschLite.html di Chromium (Playwright) lewat file://, seperti dibuka dengan klik ganda.
// Jalankan: node web/test/e2e.cjs [folder-tangkapan-layar]
const path = require("path"), fs = require("fs"), os = require("os");
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const WEB = path.join(__dirname, "..");
const HTML = "file://" + path.join(WEB, "RaschLite.html");
const SHOTS = process.argv[2] || null;
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "golden.json"), "utf8"));
const results = [];
const check = (name, ok, detail = "") => { results.push([name, !!ok, detail]); console.log(`${ok ? "OK   " : "GAGAL"} ${name}${detail ? " | " + detail : ""}`); };
const numId = (v) => (v === null ? "" : v.toFixed(2).replace(".", ","));
const DATA_TP = process.env.RL_TESPERF || null; // data Tes Performansi (opsional, tidak disimpan di repo)
// Kalimat lampu lapisan dasar (setara versi desktop) dihitung ulang di halaman dari hasil yang sama.
const baseLights = (page) => page.evaluate(() => RaschInterpret.interpret(RaschApp.state.res).lights.map((l) => l.sentence));

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) requests.push(r.url()); });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rl-e2e-"));
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false }); };
  const tab = async (title) => { await page.click(`#tabs button:has-text("${title}")`); };

  await page.goto(HTML);
  check("halaman terbuka", (await page.title()) === "RaschLite by CSPS");
  await page.click("#btn-dicho");
  await shot("1_import");
  await page.click("#btn-next1");
  await page.waitForSelector("#page-model.active");
  await shot("2_model");
  await page.click("#btn-run");
  await page.waitForSelector("#page-results.active", { timeout: 60000 });
  await shot("4_ringkasan");
  const g = golden.find((x) => x.case.name === "sample_dich");
  const lights = await page.$$eval(".light", (els) => els.map((e) => e.textContent));
  check("dikotomus: delapan lampu (dengan Data Quality dan Estimation Check)", lights.length === 8, lights.length + " lampu");
  const sentences = await baseLights(page);
  const pyLights = g.markdown.split("## Penjelasan")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.replace(/^- \S+ \*\*.*?\*\* \(.*?\): /, ""));
  check("dikotomus: lapisan narasi dasar identik dengan versi desktop", JSON.stringify(sentences) === JSON.stringify(pyLights));
  check("dikotomus: sintesis lintas indikator tampil", (await page.$$(".synth li")).length >= 1);
  check("dikotomus: setiap lampu memiliki tingkat keyakinan", (await page.$$eval(".light .conf", (e) => e.length)) >= 6);
  await tab("Item Measures");
  await shot("5_item_measures");
  const firstRow = await page.$$eval("#panels .tabpanel.active tbody tr:first-child td", (tds) => tds.map((t) => t.textContent));
  check("dikotomus: tabel Item Measures sama dengan desktop", firstRow[0] === g.items[0].item && firstRow.includes(numId(g.items[0].measure)),
    `${firstRow[0]} measure ${firstRow[4]} (desktop ${numId(g.items[0].measure)})`);
  await page.click("#panels .tabpanel.active th[data-col='measure']");
  const sorted = await page.$$eval("#panels .tabpanel.active tbody tr td:nth-child(5)", (tds) => tds.map((t) => Number(t.textContent.replace(",", "."))));
  check("tabel dapat diurutkan", sorted.every((v, k) => k === 0 || v >= sorted[k - 1]));
  for (const t of ["Person Measures", "Kualitas Data", "Diagnostik Item", "Category Structure", "Reliabilitas & Targeting", "Dimensionality", "Local Dependence", "DIF", "Validasi", "Grafik", "Glosarium"]) await tab(t);
  await tab("Validasi");
  const valText = await page.textContent("#panels .tabpanel.active");
  check("dikotomus: validasi CMLE dan pemulihan parameter", valText.includes("JMLE dibandingkan dengan CMLE") && valText.includes("Studi pemulihan parameter"));
  await tab("Grafik");
  const options = await page.$$eval("#panels .tabpanel.active select:first-of-type option", (o) => o.map((x) => x.value));
  let drawn = 0;
  for (const key of options) {
    await page.selectOption("#panels .tabpanel.active select >> nth=0", key);
    if (await page.$("#panels .tabpanel.active .chart svg")) drawn++;
  }
  await shot("11_grafik");
  check("dikotomus: semua grafik tampil", drawn === options.length && drawn === 8, `${drawn} grafik`);

  // Ekspor
  const dl = async (btn) => { const [d] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click(btn)]); const p = path.join(tmp, d.suggestedFilename()); await d.saveAs(p); return p; };
  const xlsx = await dl("#btn-excel");
  const { execFileSync } = require("child_process");
  const py = path.join(WEB, "..", ".venv", "bin", "python");
  const info = JSON.parse(execFileSync(py, ["-c", `
import json, openpyxl
wb = openpyxl.load_workbook(r"${xlsx}")
ws = wb["Item Measures"]
head = [c.value for c in ws[1]]
print(json.dumps({"sheets": wb.sheetnames, "head": head, "measure": ws.cell(2, head.index("Measure (logit)") + 1).value, "rows": ws.max_row}))`]).toString());
  check("ekspor Excel dibuka openpyxl", info.sheets.length >= 10 && info.head[0] === "Item" && Math.abs(info.measure - g.items[0].measure) < 1e-9 && info.rows === g.items.length + 1,
    `${info.sheets.length} sheet; ${info.sheets.join(", ")}`);
  const html = await dl("#btn-html");
  const htmlText = fs.readFileSync(html, "utf8");
  const ext = htmlText.match(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//gi) || [];
  check("ekspor laporan HTML mandiri", htmlText.includes("<svg") && ext.length === 0, `${(htmlText.length / 1024).toFixed(0)} KB, ${ext.length} tautan eksternal`);
  const zip = await dl("#btn-charts");
  const zinfo = JSON.parse(execFileSync(py, ["-c", `
import json, zipfile, io
from PIL import Image
z = zipfile.ZipFile(r"${zip}")
names = z.namelist()
png = [n for n in names if n.endswith(".png")]
im = Image.open(io.BytesIO(z.read(png[0])))
print(json.dumps({"n": len(names), "png": len(png), "svg": sum(n.endswith(".svg") for n in names), "dpi": im.info.get("dpi"), "size": im.size}))`]).toString());
  check("ekspor ZIP grafik PNG 300 dpi + SVG", zinfo.png === zinfo.svg && zinfo.png > 0 && Math.round(zinfo.dpi[0]) === 300,
    `${zinfo.png} PNG + ${zinfo.svg} SVG, ${JSON.stringify(zinfo.dpi)}, ${zinfo.size.join("x")} px`);
  await page.click("#btn-pdf");
  await page.waitForTimeout(1500);
  const frameOk = await page.$eval("#printframe", (f) => f.contentDocument && f.contentDocument.querySelectorAll("svg").length > 0);
  check("cetak/PDF: laporan siap cetak di iframe", frameOk);

  // Politomus: RSM dan PCM
  for (const model of ["rsm", "pcm"]) {
    await page.click("#btn-new");
    await page.click("#btn-poly");
    await page.click("#btn-next1");
    await page.check(`#models input[value="${model}"]`);
    await page.click("#btn-run");
    await page.waitForSelector("#page-results.active", { timeout: 60000 });
    const gm = golden.find((x) => x.case.name === "sample_" + model);
    const sent = await baseLights(page);
    const pyL = gm.markdown.split("## Penjelasan")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.replace(/^- \S+ \*\*.*?\*\* \(.*?\): /, ""));
    check(`${model}: lapisan narasi dasar identik dengan versi desktop`, JSON.stringify(sent) === JSON.stringify(pyL));
    check(`${model}: CMLE ${model} konvergen`, await page.evaluate(() => RaschApp.state.adv.cmle && RaschApp.state.adv.cmle.converged));
    await tab("Category Structure");
    const nrow = await page.$$eval("#panels .tabpanel.active tbody tr", (r) => r.length);
    check(`${model}: tabel Category Structure`, nrow === gm.categories.length, `${nrow} baris`);
    if (model === "pcm") { await shot("7_category_structure"); await tab("Grafik"); await page.selectOption("#panels .tabpanel.active select >> nth=0", "category_curves"); await page.selectOption("#panels .tabpanel.active select >> nth=1", "A09"); await shot("11_grafik_pcm"); }
  }

  // Unggah .xlsx
  await page.click("#btn-new");
  await page.setInputFiles("#file", path.join(__dirname, "data", "sample_dich.xlsx"));
  await page.waitForFunction(() => !document.querySelector("#import-form").hidden);
  await page.selectOption("#id-col", "ID"); await page.selectOption("#group-col", "Jenis_Kelamin");
  await page.uncheck('#items input[value="Jenis_Kelamin"]').catch(() => {});
  await page.click("#btn-next1");
  await page.click("#btn-run");
  await page.waitForSelector("#page-results.active", { timeout: 60000 });
  const sentX = await baseLights(page);
  check("unggah .xlsx: hasil sama dengan data contoh CSV", JSON.stringify(sentX) === JSON.stringify(pyLights));

  // Jawaban mentah dengan baris KUNCI: satu butir sengaja diberi kunci keliru
  {
    const r = (() => { let a = 7; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const L = 12, opts = ["A", "B", "C", "D"], keys = Array.from({ length: L }, (_, i) => opts[i % 4]);
    const lines = ["ID," + keys.map((_, i) => `Q${i + 1}`).join(","), "KUNCI," + keys.map((k, i) => (i === 5 ? (k === "A" ? "B" : "A") : k)).join(",")];
    for (let n = 0; n < 300; n++) {
      const th = (r() + r() + r() - 1.5) * 2;
      lines.push(`p${n},` + keys.map((k, i) => {
        const b = -1.5 + 3 * i / (L - 1);
        if (r() < 1 / (1 + Math.exp(-(th - b)))) return k;
        const wrong = opts.filter((o) => o !== k); return wrong[Math.floor(r() * 3)];
      }).join(","));
    }
    const f = path.join(tmp, "jawaban_mentah.csv"); fs.writeFileSync(f, lines.join("\n"));
    await page.click("#btn-new");
    await page.setInputFiles("#file", f);
    await page.waitForFunction(() => !document.querySelector("#import-form").hidden);
    const kb = await page.textContent("#import-banner");
    check("jawaban mentah: baris KUNCI dikenali", kb.includes("Baris kunci ditemukan") && kb.includes("12 butir"), kb.slice(0, 80));
    await page.click("#btn-next1");
    await page.waitForSelector("#page-model.active");
    check("jawaban mentah: jumlah opsi terisi otomatis", (await page.inputValue("#n-options")) === "4");
    await page.click("#btn-run");
    await page.waitForSelector("#page-results.active", { timeout: 120000 });
    const dis = await page.evaluate(() => RaschApp.state.adv.distractors.items.filter((x) => x.flag).map((x) => x.item));
    check("jawaban mentah: kunci keliru Q6 terdeteksi lewat distraktor", dis.includes("Q6"), dis.join(","));
    await tab("Diagnostik Item");
    await shot("12_distraktor");
  }

  // Data Tes Performansi (bila tersedia): speeded, empat blok, perlakuan Ludlow & O'Leary
  if (DATA_TP && fs.existsSync(DATA_TP)) {
    await page.click("#btn-new");
    await page.setInputFiles("#file", DATA_TP);
    await page.waitForFunction(() => !document.querySelector("#import-form").hidden);
    await page.selectOption("#group-col", "Gender");
    await page.uncheck('#items input[value="Gender"]').catch(() => {});
    await page.click("#btn-next1");
    await page.waitForSelector("#page-model.active");
    const msum = await page.textContent("#missing-summary");
    check("Tes Performansi: blok dan pola speeded dikenali sebelum estimasi", msum.includes("4 blok") && msum.includes("speeded"), msum.slice(0, 120));
    await shot("2b_model_lanjutan");
    await page.check('#treatments input[value="lo1999"]');
    await page.fill("#n-options", "5");
    const t0 = Date.now();
    await page.click("#btn-run");
    await page.waitForSelector("#page-results.active", { timeout: 300000 });
    const secs = (Date.now() - t0) / 1000;
    const st = await page.evaluate(() => { const a = RaschApp.state.adv, it = RaschApp.state.interp; return { lights: it.lights.map((l) => l.key + ":" + l.status), synth: it.synthesis.length, actions: it.actions.length, scored: !!a.scored, sim: a.sim && a.sim.reps, cm: a.cmle && a.cmle.rmsd, timing: a.timing }; });
    check("Tes Performansi: analisis lengkap selesai", st.synth >= 3 && st.scored && st.sim === 50, `${secs.toFixed(0)} s; ${JSON.stringify(st)}`);
    await shot("4b_sintesis");
    await tab("Kualitas Data"); await shot("13_kualitas_data");
    await tab("Dimensionality");
    await page.click('#panels .tabpanel.active button:has-text("Kalibrasi per blok")');
    await page.waitForFunction(() => RaschApp.state.blockCal && RaschApp.state.blockCal.length === 4, null, { timeout: 60000 });
    await shot("14_dimensi");
    check("Tes Performansi: kalibrasi per blok", true);
    const ax = await dl("#btn-excel");
    const sh = JSON.parse(execFileSync(py, ["-c", `import json, openpyxl; wb = openpyxl.load_workbook(r"${ax}", read_only=True); print(json.dumps(wb.sheetnames))`]).toString());
    check("Tes Performansi: Excel memuat lembar diagnostik lanjutan", ["Kualitas Person", "Sensitivitas", "Simulasi", "Kalibrasi per Blok", "DIF Lanjutan", "Residual Terstandar", "Konfigurasi"].every((n) => sh.includes(n)), sh.length + " lembar");
    const au = await dl("#btn-audit");
    const ai = JSON.parse(execFileSync(py, ["-c", `
import json, zipfile, csv, io
z = zipfile.ZipFile(r"${au}")
n = z.namelist()
res = list(csv.reader(io.StringIO(z.read("audit_raschlite/standardized_residuals.csv").decode("utf-8-sig"))))
cfg = json.loads(z.read("audit_raschlite/config.json"))
print(json.dumps({"names": n, "rows": len(res), "cols": len(res[0]), "treatment": cfg["options"]["treatment"], "seed": cfg["options"]["seed"]}))`]).toString());
    check("Tes Performansi: berkas audit (butir, person, residual, konfigurasi)", ai.names.length >= 5 && ai.rows === 266 && ai.cols === 90 && ai.treatment === "lo1999", JSON.stringify(ai).slice(0, 200));
  }

  // Data tidak valid
  await page.click("#btn-new");
  const bad = path.join(tmp, "salah.csv");
  fs.writeFileSync(bad, "ID,Q1,Q2\na,1,1\nb,2.5,0\nc,0,x\n");
  await page.setInputFiles("#file", bad);
  await page.waitForFunction(() => !document.querySelector("#import-form").hidden);
  await page.check('#items input[value="Q1"]'); await page.check('#items input[value="Q2"]');
  await page.click("#btn-next1");
  const msg = await page.textContent("#import-banner");
  check("data bukan bilangan bulat: pesan jelas, tidak lanjut", msg.includes("bukan bilangan bulat") && (await page.$("#page-import.active")) !== null, msg.slice(0, 90));

  check("tanpa galat JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("tanpa permintaan jaringan", requests.length === 0, requests.slice(0, 3).join(" "));
  await browser.close();
  const failed = results.filter((r) => !r[1]).length;
  console.log(`\n${results.length} pemeriksaan end-to-end, ${failed} gagal`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
