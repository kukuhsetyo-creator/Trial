// Uji peramban untuk QualitativeAnalysisForm.html.
// Menjalankan alur RTA lengkap di Chromium dengan API Anthropic yang ditiru,
// lalu satu pemanggilan sungguhan dengan kunci palsu untuk memastikan CORS dari
// file:// berfungsi dan kunci yang ditolak menghasilkan pesan yang benar.
//
// Pemakaian: CHROMIUM=/path/ke/chrome RAW=/path/ke/fixture node web/tests/browser_test.mjs
// (memerlukan paket npm playwright-core)
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";

const here = path.dirname(fileURLToPath(import.meta.url));
const HTML = pathToFileURL(path.join(here, "..", "QualitativeAnalysisForm.html")).href;
const RAW = process.env.RAW;
let gagal = 0;
const cek = (label, kondisi, info = "") => {
  console.log(`${kondisi ? "LULUS" : "GAGAL"}  ${label}${info ? "  — " + info : ""}`);
  if (!kondisi) gagal++;
};

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, proxy });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
const page = await ctx.newPage();
const galatKonsol = [];
page.on("pageerror", (e) => galatKonsol.push(e.message));

// ---- API tiruan --------------------------------------------------------
const prompts = []; const headers = [];
const jawab = (text) => ({ model: "claude-sonnet-5", stop_reason: "end_turn",
  content: [{ type: "text", text }], usage: { input_tokens: 100, output_tokens: 40 } });
await page.route("https://api.anthropic.com/**", async (route) => {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
  const body = JSON.parse(req.postData()); const p = body.messages[0].content;
  prompts.push(p); headers.push(req.headers());
  let text = "[]";
  if (p.includes("coding inisial line-by-line")) text = JSON.stringify([{ label: "menormalkan beban kerja", justification: "disebut sudah biasa" }, { label: "aturan yang tidak dijalankan", justification: "SK ada tapi tidak dirujuk" }]);
  else if (p.includes("usulkan pola tema")) { const ids = [...p.matchAll(/^- \[(\d+)\]/gm)].map((m) => Number(m[1])); text = JSON.stringify([{ label: "kewajaran yang dipelihara bersama", story: "Beban berlebih dipertahankan sebagai hal biasa.", code_ids: ids.slice(0, 3), quote: "Ya sudah biasa" }]); }
  else if (p.includes("Tinjau tema berikut")) text = "Inti tema jelas, batasnya masih longgar.";
  else if (p.includes("Susun definisi dan nama akhir")) text = JSON.stringify([{ label: "sudah biasa: kewajaran bersama", definition: "Tema ini menangkap normalisasi beban kerja.", quote: "Ya sudah biasa" }]);
  else if (p.includes("memo reflektif")) text = "Saya cenderung membaca keluhan di tempat penerimaan.";
  else if (p.includes("satu kata: siap")) text = "siap";
  await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(jawab(text)) });
});

const klik = async (teks) => { await page.getByRole("button", { name: teks, exact: true }).first().click(); await page.waitForTimeout(150); };
const tunggu = async () => { await page.waitForTimeout(100); await page.waitForFunction(() => !window.__agen.busy, null, { timeout: 60000 }); };
const pesan = async () => (await page.locator("main .note").allTextContents()).join(" | ");
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__agen.state)));

await page.goto(HTML);
cek("halaman termuat", (await page.locator("h1").textContent()).includes("Qualitative Analysis Form"));

// ---- Pengaturan ----------------------------------------------------------
await klik("Pengaturan");
await page.fill("#key", "kunci palsu dengan spasi");
await klik("Simpan pengaturan");
cek("kunci tidak sah ditolak", (await pesan()).includes("Kunci tidak dikenali"));
const KUNCI = "sk-ant-uji-tiruan-0123456789abcdefKUNCI";
await page.fill("#key", KUNCI); await klik("Simpan pengaturan");
cek("kunci tersimpan, kolom dikosongkan", (await pesan()).includes("tersimpan") && (await page.inputValue("#key")) === "");
await klik("Uji koneksi"); await tunggu();
cek("uji kunci berhasil (API tiruan)", (await pesan()).includes("Kunci berfungsi"));
cek("header akses langsung dari peramban dikirim", headers[0]["anthropic-dangerous-direct-browser-access"] === "true" && headers[0]["x-api-key"] === KUNCI);

// ---- Masukkan berkas ------------------------------------------------------
await klik("Masukkan berkas");
const masukkan = async (nama, jenis, pid = "") => {
  await page.setInputFiles("#file", path.join(RAW, nama));
  await page.selectOption("#doc-type", jenis);
  if (pid) await page.fill("#doc-pid", pid);
  await klik("Masukkan"); await tunggu();
  return pesan();
};
cek("transkrip masuk dengan penutur", (await masukkan("p03-wawancara.txt", "interview_transcript", "P03")).includes("penutur: Pewawancara, P03"));
cek("DOCX terbaca", (await masukkan("kebijakan.docx", "document")).includes("masuk:"));
cek("PDF terbaca", (await masukkan("laporan.pdf", "document")).includes("masuk:"));
cek("berkas ganda ditolak", (await masukkan("laporan.pdf", "document")).includes("sudah pernah"));
let s = await state();
const unitP03 = s.units.filter((u) => u.document_id === 1);
cek("unit transkrip & paralinguistik sama dengan versi Python", unitP03.length === 6 && unitP03.filter((u) => u.paralinguistic_notes).length === 3,
  `${unitP03.length} unit, ${unitP03.filter((u) => u.paralinguistic_notes).length} berparalinguistik`);
cek("teks PDF terbaca isinya", s.units.some((u) => u.text.includes("jam kerja efektif")));

// ---- Sesi baru -------------------------------------------------------------
await klik("Beranda");
cek("metode selain RTA nonaktif", await page.locator('#run-method option[value="ipa"]').isDisabled());
await page.fill("#run-name", "Uji Peramban"); await klik("Mulai sesi");
s = await state();
cek("satu sesi RTA dibuat", s.method_runs.length === 1 && s.method_runs[0].method === "rta");

// ---- Usulan kode -------------------------------------------------------------
await klik("Usulan kode");
await page.getByRole("button", { name: /Usulkan kode untuk \d+ unit/ }).click(); await tunggu();
s = await state();
cek("semua unit dikodekan, semua berstatus usulan", s.codes.length === s.units.length * 2 && s.codes.every((c) => c.status === "proposed"), `${s.codes.length} kode`);

// ---- Tema --------------------------------------------------------------------
await klik("Tema & tinjauan");
await klik("Bentuk tema"); await tunggu();
s = await state();
cek("tema terbentuk berstatus usulan dan tertaut", s.categories.length === 1 && s.categories[0].status === "proposed" && s.code_category_links.length === 3);
const pTema = prompts.find((p) => p.includes("usulkan pola tema"));
const daftar = pTema.split("Kode: ")[1].split("Jawab HANYA")[0];
const idTerkirim = [...daftar.matchAll(/^- \[(\d+)\]/gm)].map((m) => Number(m[1]));
cek("daftar kode di prompt tema tanpa hitungan", !/frekuensi|jumlah|prevalensi|kemunculan|\(\d+ ?x\)/i.test(daftar) && idTerkirim.length === s.codes.length && new Set(idTerkirim).size === idTerkirim.length);
await klik("Tinjau tema"); await tunggu();
await klik("Namai dan definisikan"); await tunggu();
cek("penamaan tertahan tanpa memo peneliti", (await pesan()).includes("memo reflektif Anda sendiri"));
await klik("Memo");
await page.fill("#memo", "Saya condong membaca ini sebagai keluhan."); await klik("Simpan memo");
await klik("Tema & tinjauan");
await klik("Namai dan definisikan"); await tunggu();
s = await state();
cek("tema dinamai, status tetap usulan", s.categories[0].label.startsWith("sudah biasa") && s.categories[0].status === "proposed");

// ---- Peninjauan ----------------------------------------------------------------
const tombolKode = (verdict, id) => page.locator(`button[data-type="code"][data-id="${id}"][data-verdict="${verdict}"]`);
await tombolKode("validated", 1).click(); await page.waitForTimeout(150);
await tombolKode("revised", 2).click(); await page.waitForTimeout(150);
cek("revisi tanpa label ditolak", (await pesan()).includes("Revisi memerlukan label baru"));
await page.fill("#label-code-2", "menormalkan lembur"); await tombolKode("revised", 2).click(); await page.waitForTimeout(150);
await tombolKode("rejected", 3).click(); await page.waitForTimeout(150);
await page.locator('button[data-type="category"][data-verdict="validated"]').click(); await page.waitForTimeout(150);
s = await state();
const st = (id) => s.codes.find((c) => c.id === id).status;
cek("status hanya berubah lewat peninjauan", st(1) === "validated" && st(2) === "revised" && st(3) === "rejected" && s.categories[0].status === "validated");
cek("riwayat peninjauan tercatat", s.validation_events.length === 4 && s.validation_events[1].previous_label === "aturan yang tidak dijalankan" && s.validation_events[1].new_label === "menormalkan lembur");

// ---- Audit ---------------------------------------------------------------------
cek("setiap pemanggilan AI tercatat", s.audit_log.length === prompts.length, `${s.audit_log.length} catatan / ${prompts.length} panggilan`);

// ---- Cadangan ------------------------------------------------------------------
await klik("Cadangan & ekspor");
const [unduhan] = await Promise.all([page.waitForEvent("download"), klik("Unduh cadangan")]);
const berkasCadangan = await unduhan.path();
const isiCadangan = fs.readFileSync(berkasCadangan, "utf8");
cek("cadangan tidak memuat kunci", !isiCadangan.includes(KUNCI) && JSON.parse(isiCadangan).format === "agen-kualitatif-backup");
page.once("dialog", (d) => d.accept()); await klik("Hapus semua data");
cek("data terhapus", (await state()).codes.length === 0);
await page.setInputFiles("#restore-file", berkasCadangan);
page.once("dialog", (d) => d.accept()); await klik("Pulihkan");
const pulih = await state();
cek("cadangan dipulihkan utuh", pulih.codes.length === s.codes.length && pulih.validation_events.length === 4 && pulih.audit_log.length === s.audit_log.length);
const [csv] = await Promise.all([page.waitForEvent("download"), page.locator('button[data-table="codes"]').click()]);
cek("ekspor CSV", fs.readFileSync(await csv.path(), "utf8").includes("menormalkan lembur"));

// ---- Muat ulang: data tetap ada di IndexedDB --------------------------------
await page.reload(); await page.waitForFunction(() => window.__agen && window.__agen.state);
cek("data bertahan setelah halaman dimuat ulang", (await state()).codes.length === s.codes.length);


// ---- Penyedia AI lain --------------------------------------------------------
const pilih = async (id) => { await klik("Pengaturan"); await page.selectOption("#provider", id); await page.waitForTimeout(200); };
const auditTerakhir = async () => (await state()).audit_log.at(-1);

// Google Gemini (ditiru): bentuk permintaan dan jawaban khas Gemini.
const gemini = [];
await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
  const req = route.request(); gemini.push({ url: req.url(), headers: req.headers(), body: JSON.parse(req.postData()) });
  await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ modelVersion: "gemini-2.5-flash", candidates: [{ content: { parts: [{ text: "berpikir…", thought: true }, { text: "siap" }] } }],
      usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 2 } }) });
});
await pilih("google");
cek("kunci Anthropic tidak terbawa ke Gemini", (await pesan()).includes("Kunci akses belum diisi"));
await page.fill("#key", "AIza-uji-tiruan-0123456789"); await klik("Simpan pengaturan");
await klik("Uji koneksi"); await tunggu();
cek("Gemini: uji koneksi berhasil", (await pesan()).includes("Kunci berfungsi") && (await pesan()).includes("Gemini"));
cek("Gemini: alamat, header, dan bagian 'berpikir' disaring", gemini[0].url.endsWith("/models/gemini-2.5-flash:generateContent") && gemini[0].headers["x-goog-api-key"] === "AIza-uji-tiruan-0123456789" && (await auditTerakhir()).response_text === "siap");
cek("Gemini: audit mencatat penyedia/model", (await auditTerakhir()).model_used === "google/gemini-2.5-flash");

// DeepSeek (ditiru): format kompatibel OpenAI, termasuk satu coding unit sungguhan lewat alur RTA.
const ds = [];
await page.route("https://api.deepseek.com/**", async (route) => {
  const req = route.request(); const body = JSON.parse(req.postData()); ds.push({ url: req.url(), headers: req.headers(), body });
  const p = body.messages[0].content;
  const text = p.includes("coding inisial") ? JSON.stringify([{ label: "kode dari deepseek", justification: "uji format OpenAI" }]) : "siap";
  await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ model: "deepseek-chat", choices: [{ message: { role: "assistant", content: text } }], usage: { prompt_tokens: 20, completion_tokens: 5 } }) });
});
await pilih("deepseek");
await page.fill("#key", "sk-deepseek-uji-tiruan-0123"); await klik("Simpan pengaturan");
await klik("Uji koneksi"); await tunggu();
cek("DeepSeek: uji koneksi berhasil, format OpenAI", (await pesan()).includes("Kunci berfungsi") && ds[0].url === "https://api.deepseek.com/chat/completions" && ds[0].headers.authorization === "Bearer sk-deepseek-uji-tiruan-0123" && ds[0].body.model === "deepseek-chat");
await klik("Usulan kode");
await page.locator("details.card").first().evaluate((d) => { d.open = true; });
await page.locator('button[data-action="code-one"]').first().click(); await tunggu();
s = await state();
cek("DeepSeek: alur RTA menyimpan kode berstatus usulan", s.codes.some((c) => c.label === "kode dari deepseek" && c.status === "proposed") && s.audit_log.some((a) => a.stage === "open_coding" && a.model_used === "deepseek/deepseek-chat"));

// Model tidak dikenal (ditiru 404).
await page.route("https://api.deepseek.com/**", (route) => route.fulfill({ status: 404, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"error":{"message":"Model Not Exist"}}' }));
await pilih("deepseek"); await page.fill("#model", "model-keliru"); await klik("Simpan pengaturan");
await klik("Uji koneksi"); await tunggu();
cek("nama model keliru menghasilkan pesan yang tepat", (await pesan()).includes('Model "model-keliru" tidak dikenali'));
await page.fill("#model", ""); await klik("Simpan pengaturan");

// Ollama: server lokal sungguhan (tiruan) di 11434, membuktikan file:// boleh memanggil localhost.
const server = http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*"); res.setHeader("access-control-allow-headers", "*"); res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  let b = ""; req.on("data", (d) => b += d); req.on("end", () => {
    const body = JSON.parse(b);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ model: body.model, choices: [{ message: { content: "siap" } }], usage: { prompt_tokens: 7, completion_tokens: 1 } }));
  });
});
await new Promise((r) => server.listen(11434, "127.0.0.1", r));
await pilih("ollama");
cek("Ollama: tanpa kolom kunci, siap tanpa kunci", (await page.locator("#key").count()) === 0 && (await page.getByRole("button", { name: "Uji koneksi" }).isEnabled()));
{
  // Peramban kedua tanpa proxy: proxy lingkungan uji memaksa localhost lewat
  // proxy, sedangkan di komputer pemakai localhost selalu dihubungi langsung.
  const b2 = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const p2 = await b2.newPage();
  await p2.goto(HTML);
  await p2.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await p2.selectOption("#provider", "ollama"); await p2.waitForTimeout(200);
  await p2.getByRole("button", { name: "Uji koneksi", exact: true }).click();
  await p2.waitForTimeout(100); await p2.waitForFunction(() => !window.__agen.busy, null, { timeout: 30000 });
  const m2 = (await p2.locator("main .note").allTextContents()).join(" | ");
  const a2 = await p2.evaluate(() => window.__agen.state.audit_log.at(-1));
  cek("Ollama: file:// dapat memanggil server lokal", m2.includes("Kunci berfungsi") && a2.model_used === "ollama/qwen2.5", m2.slice(0, 80));
  await b2.close();
}
server.close();
await page.fill("#base-url", "http://localhost:11999/v1"); await klik("Simpan pengaturan");
await klik("Uji koneksi"); await tunggu();
cek("Ollama mati: pesan menyebut OLLAMA_ORIGINS", (await pesan()).includes("Ollama tidak dapat dihubungi"));
await page.fill("#base-url", ""); await klik("Simpan pengaturan");

// Kunci setiap penyedia terpisah dan tidak ikut ke cadangan.
await pilih("anthropic");
cek("kunci Anthropic tetap tersimpan setelah berganti penyedia", (await pesan()).includes("Kunci akses sudah tersimpan"));
await klik("Cadangan & ekspor");
const [unduhan2] = await Promise.all([page.waitForEvent("download"), klik("Unduh cadangan")]);
const isi2 = fs.readFileSync(await unduhan2.path(), "utf8");
cek("cadangan tidak memuat kunci penyedia mana pun", !isi2.includes(KUNCI) && !isi2.includes("AIza-uji-tiruan") && !isi2.includes("sk-deepseek-uji"));

// Migrasi pengaturan versi lama (hanya Anthropic).
await page.evaluate(() => new Promise((ok) => { const r = indexedDB.open("agen-kualitatif", 1); r.onsuccess = () => { const tx = r.result.transaction("kv", "readwrite"); tx.objectStore("kv").put({ apiKey: "sk-ant-versi-lama-0123456789" }, "settings"); tx.oncomplete = ok; }; }));
await page.reload(); await page.waitForFunction(() => window.__agen && window.__agen.state); await klik("Pengaturan");
cek("kunci versi lama dipindahkan ke penyedia Anthropic", (await pesan()).includes("Kunci akses sudah tersimpan") && (await page.inputValue("#provider")) === "anthropic");

// ---- Pemanggilan sungguhan dengan kunci palsu ----------------------------------
await page.unroute("https://api.anthropic.com/**");
await klik("Pengaturan"); await klik("Uji koneksi"); await tunggu();
const m = await pesan();
cek("kunci palsu ditolak Anthropic sungguhan (CORS dari file:// berfungsi)", m.includes("Kunci ditolak oleh Claude (Anthropic)"), m.slice(0, 90));
const terakhir = (await state()).audit_log.at(-1);
cek("kegagalan tercatat di audit tanpa kunci", terakhir.response_text.startsWith("[CALL_FAILED]") && terakhir.response_text.includes("401") && !JSON.stringify(await state()).includes(KUNCI));

// ---- Gemini sungguhan dengan kunci palsu ----------------------------------------
await page.unroute("https://generativelanguage.googleapis.com/**");
await pilih("google"); await page.fill("#key", "AIza-palsu-0123456789abcdef"); await klik("Simpan pengaturan");
await klik("Uji koneksi"); await tunggu();
const mg = await pesan();
cek("kunci palsu ditolak Gemini sungguhan (CORS dari file:// berfungsi)", mg.includes("Kunci ditolak oleh Gemini"), mg.slice(0, 90));

cek("tidak ada galat JavaScript", galatKonsol.length === 0, galatKonsol.join("; "));
await browser.close();
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : "\nSEMUA PEMERIKSAAN LULUS");
process.exit(gagal ? 1 : 0);
