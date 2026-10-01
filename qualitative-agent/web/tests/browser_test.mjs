// Uji peramban untuk AgenKualitatif.html.
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

const here = path.dirname(fileURLToPath(import.meta.url));
const HTML = pathToFileURL(path.join(here, "..", "AgenKualitatif.html")).href;
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
cek("halaman termuat", (await page.locator("h1").textContent()).includes("Agen Analisis Kualitatif"));

// ---- Pengaturan ----------------------------------------------------------
await klik("Pengaturan");
await page.fill("#key", "kunci palsu dengan spasi");
await klik("Simpan kunci");
cek("kunci tidak sah ditolak", (await pesan()).includes("Kunci tidak dikenali"));
const KUNCI = "sk-ant-uji-tiruan-0123456789abcdefKUNCI";
await page.fill("#key", KUNCI); await klik("Simpan kunci");
cek("kunci tersimpan, kolom dikosongkan", (await pesan()).includes("Kunci tersimpan") && (await page.inputValue("#key")) === "");
await klik("Uji kunci"); await tunggu();
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
await page.reload();
cek("data bertahan setelah halaman dimuat ulang", (await state()).codes.length === s.codes.length);

// ---- Pemanggilan sungguhan dengan kunci palsu ----------------------------------
await page.unroute("https://api.anthropic.com/**");
await klik("Pengaturan"); await klik("Uji kunci"); await tunggu();
const m = await pesan();
cek("kunci palsu ditolak Anthropic sungguhan (CORS dari file:// berfungsi)", m.includes("Kunci ditolak oleh Anthropic"), m.slice(0, 90));
const terakhir = (await state()).audit_log.at(-1);
cek("kegagalan tercatat di audit tanpa kunci", terakhir.response_text.startsWith("[CALL_FAILED]") && terakhir.response_text.includes("401") && !JSON.stringify(await state()).includes(KUNCI));

cek("tidak ada galat JavaScript", galatKonsol.length === 0, galatKonsol.join("; "));
await browser.close();
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : "\nSEMUA PEMERIKSAAN LULUS");
process.exit(gagal ? 1 : 0);
