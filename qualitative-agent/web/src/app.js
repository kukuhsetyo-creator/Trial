"use strict";
/*
 * Qualitative Analysis Form (CSPS), edisi peramban.
 *
 * Padanan JavaScript dari versi Python di qualitative-agent/. Aturan proyek
 * (CLAUDE.md) ditegakkan dengan cara yang sama:
 *   1. Logika RTA berdiri sendiri (bagian "RTA" di bawah); tidak ada fungsi
 *      bersama yang bercabang berdasarkan nama metode.
 *   2. Kolom status pada kode dan tema hanya berubah di review(), selalu
 *      bersama satu catatan validation_events. Fungsi penyimpan tidak pernah
 *      menerima parameter status.
 *   3. Berkas sumber hanya dibaca (File API peramban); yang disimpan adalah
 *      teks hasil ekstraksi, bukan berkas aslinya.
 *   4. Setiap pemanggilan API dicatat lewat logCall() sebelum hasilnya dipakai,
 *      dan pemanggilan yang gagal total dicatat lewat logFailure().
 *   Hitungan frekuensi tidak pernah dikirim ke prompt pembentukan tema, dan
 *   penamaan tema menuntut sekurang-kurangnya satu memo tulisan peneliti.
 */

// ===========================================================================
// Konstanta
// ===========================================================================

const APP_NAME = "Qualitative Analysis Form";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_ATTEMPTS = 4;
// Pengenal format dan nama basis data sengaja tidak ikut diganti saat aplikasi
// berganti nama, agar data dan cadangan yang sudah ada tetap terbaca.
const BACKUP_FORMAT = "agen-kualitatif-backup";
const BACKUP_VERSION = 1;
const TABLES = ["documents", "units", "method_runs", "codes", "categories",
  "code_category_links", "memos", "audit_log", "validation_events"];
const SOURCE_TYPES = {
  interview_transcript: "Transkrip wawancara", field_note: "Catatan lapangan",
  document: "Dokumen", book: "Buku", other: "Lainnya",
};
const METHODS = {
  rta: { name: "Reflexive Thematic Analysis (Braun & Clarke)", available: true },
  ta_classic: { name: "Thematic Analysis klasik", available: false },
  ipa: { name: "Interpretative Phenomenological Analysis", available: false },
  grounded_theory: { name: "Grounded Theory", available: false },
};
// Kunci akses: karakter cetak tanpa spasi. Pola longgar karena format kunci
// berbeda antarpenyedia; spasi, baris baru, dan tanda kutip tetap ditolak.
const KEY_PATTERN = /^[\x21-\x7E]{8,}$/;
const NO_QUOTES = /^[^"'`]*$/;

// Penyedia AI. kind menentukan bentuk permintaan: "anthropic", "gemini", atau
// "openai" (Chat Completions yang dipakai bersama oleh banyak penyedia).
// browserVerified: akses langsung dari berkas HTML (file://) sudah diuji.
// Nama model bawaan dapat diubah pemakai di halaman Pengaturan.
const PROVIDERS = {
  anthropic: { label: "Claude (Anthropic)", kind: "anthropic", url: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-5", needsKey: true, browserVerified: true,
    keyHelp: "Buat kunci di <b>platform.claude.com</b>, bagian <i>API Keys</i>." },
  google: { label: "Gemini (Google)", kind: "gemini", url: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash", needsKey: true, browserVerified: true,
    keyHelp: "Buat kunci di <b>aistudio.google.com</b>, menu <i>Get API key</i>." },
  qwen: { label: "Qwen (Alibaba Cloud)", kind: "openai", url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus", needsKey: true, editableUrl: true,
    keyHelp: "Buat kunci di <b>Alibaba Cloud Model Studio</b> (DashScope). Untuk akun wilayah Tiongkok, ganti alamat layanan menjadi <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code>." },
  deepseek: { label: "DeepSeek", kind: "openai", url: "https://api.deepseek.com",
    model: "deepseek-chat", needsKey: true,
    keyHelp: "Buat kunci di <b>platform.deepseek.com</b>, bagian <i>API Keys</i>." },
  openai: { label: "GPT (OpenAI)", kind: "openai", url: "https://api.openai.com/v1",
    model: "gpt-5.6", needsKey: true,
    keyHelp: "Buat kunci di <b>platform.openai.com</b>, bagian <i>API keys</i>." },
  openrouter: { label: "OpenRouter (Qwen, DeepSeek, Llama, dll. dengan satu kunci)", kind: "openai", url: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-chat", needsKey: true,
    keyHelp: "Buat kunci di <b>openrouter.ai</b>, bagian <i>Keys</i>. Nama model ditulis dengan awalan penyedianya, misalnya <code>qwen/…</code> atau <code>deepseek/…</code>." },
  ollama: { label: "Ollama (model lokal di komputer ini)", kind: "openai", url: "http://localhost:11434/v1",
    model: "qwen2.5", needsKey: false, editableUrl: true, local: true,
    keyHelp: "Tidak perlu kunci. Pasang Ollama, unduh modelnya, lalu izinkan akses dari peramban dengan menjalankan Ollama memakai pengaturan <code>OLLAMA_ORIGINS=*</code>." },
  custom: { label: "Lainnya (kompatibel OpenAI)", kind: "openai", url: "",
    model: "", needsKey: false, editableUrl: true,
    keyHelp: "Untuk layanan lain yang menyediakan antarmuka kompatibel OpenAI. Isi alamat layanan, nama model, dan kunci (bila diperlukan) sesuai dokumentasinya." },
};
const SEG_MAX = 1200;
const SEG_MIN = 40;

// Prompt RTA, disalin apa adanya dari config/methods/rta.yaml.
const RTA_PROMPTS = {
  philosophy: "Tema adalah konstruksi aktif peneliti, bukan entitas yang \"ditemukan\". " +
    "Jangan gunakan bahasa frekuensi atau prevalensi kode sebagai justifikasi tema.",
  open_coding:
`Anda membantu peneliti melakukan coding inisial line-by-line. Usulkan kode yang
menangkap makna semantik DAN laten pada unit teks berikut. Jangan mengklaim
kode ini "benar"; sajikan sebagai proposal awal untuk ditinjau peneliti.
Sertakan justifikasi singkat. Konteks dokumen: {document_context}
Unit teks: {unit_text}
`,
  theme_generation:
`Berdasarkan kumpulan kode berikut, usulkan pola tema yang menceritakan sesuatu
yang koheren tentang data, BUKAN pengelompokan berdasar kemiripan permukaan atau
frekuensi kemunculan. Untuk setiap tema, jelaskan "cerita" apa yang ia tangkap
dan sebutkan minimal satu kutipan potensial yang mendukungnya.
Kode: {code_list}
`,
  theme_review:
`Tinjau tema berikut terhadap kode dan kutipan yang menopangnya. Untuk setiap tema,
nilai apakah ia memiliki inti yang jelas dan batas yang dapat dipertahankan, apakah
ia sekadar ringkasan topik alih-alih menangkap sebuah makna, dan apakah ada kode di
dalamnya yang sebenarnya menuturkan cerita lain. Nyatakan tema mana yang perlu
dipecah, digabung, atau dilepas. Jangan menilai tema berdasarkan berapa banyak kode
yang tercakup di dalamnya.
Tema beserta kode pendukungnya: {theme_bundle}
`,
  theme_definition_naming:
`Susun definisi dan nama akhir untuk tema berikut. Definisi menyatakan cakupan dan
batas tema dalam dua sampai empat kalimat, dan nama tema sebaiknya membawa sesuatu
dari suara partisipan alih-alih menjadi label kategori yang datar. Sebutkan satu
kutipan yang paling tajam mewakilinya.
Tema: {theme_label}
Definisi kerja: {theme_definition}
Kode dan kutipan: {codes_and_quotes}
`,
  reflexive_memo:
`Tulis memo reflektif atas keputusan analitik berikut. Fokuskan pada posisi peneliti:
asumsi apa yang sedang bekerja, kemungkinan apa yang tertutup oleh pembacaan ini,
dan bagian data mana yang terasa menolak interpretasi yang sedang dibangun. Memo ini
bukan ringkasan hasil dan tidak boleh menjadi pembenaran atas tema yang sudah dipilih.
Tahap: {stage}
Konteks: {context}
`,
};
const CODE_CONTRACT = `

Jawab HANYA dengan array JSON, tanpa teks pembuka atau penutup, dengan bentuk:
[{"label": "<label kode>", "justification": "<justifikasi singkat>"}]
Sertakan setiap kode yang Anda usulkan sebagai satu elemen array.`;
const THEME_CONTRACT = `

Jawab HANYA dengan array JSON, tanpa teks pembuka atau penutup:
[{"label": "<nama tema>", "story": "<cerita yang ditangkap tema ini>",
  "code_ids": [<id kode yang tercakup>], "quote": "<satu kutipan pendukung>"}]`;
const DEFINITION_CONTRACT = `

Jawab HANYA dengan array JSON berisi satu elemen:
[{"label": "<nama akhir tema>", "definition": "<definisi dua sampai empat kalimat>",
  "quote": "<kutipan paling mewakili>"}]`;

// ===========================================================================
// Utilitas
// ===========================================================================

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class UserError extends Error {}
class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

function toast(message, kind = "ok", ms = 4000) {
  const el = $("#toast");
  el.innerHTML = `<div class="note ${kind}">${esc(message)}</div>`;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = "none"; }, ms);
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractJsonArray(text) {
  const m = String(text).match(/\[[\s\S]*\]/);
  if (!m) throw new UserError("Jawaban AI tidak memuat daftar yang dapat dibaca. Coba lagi.");
  let data;
  try { data = JSON.parse(m[0]); } catch (e) {
    throw new UserError("Jawaban AI tidak dapat dibaca sebagai daftar. Coba lagi.");
  }
  if (!Array.isArray(data)) throw new UserError("Jawaban AI bukan berupa daftar. Coba lagi.");
  return data;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ===========================================================================
// Penyimpanan: IndexedDB peramban
// ===========================================================================

const IDB_NAME = "agen-kualitatif";
const IDB_STORE = "kv";
let db = null;
let S = null;        // data penelitian (ikut dicadangkan)
let SETTINGS = null; // pengaturan lokal (kunci API, tidak pernah ikut dicadangkan)

function emptyState() {
  const s = { format: BACKUP_FORMAT, version: BACKUP_VERSION, seq: {} };
  for (const t of TABLES) { s[t] = []; s.seq[t] = 0; }
  return s;
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
const saveState = () => idbPut("state", S);
const saveSettings = () => idbPut("settings", SETTINGS);

function nextId(table) { S.seq[table] = (S.seq[table] || 0) + 1; return S.seq[table]; }
const byId = (table, id) => S[table].find((r) => r.id === id);

// ===========================================================================
// Persistensi analisis. Tidak satu pun fungsi di bagian ini menerima status.
// ===========================================================================

function addDocument({ title, source_type, file_name, participant_id, metadata }) {
  const row = {
    id: nextId("documents"), title, source_type, file_path: file_name,
    participant_id: participant_id || null, added_at: nowIso(),
    metadata_json: metadata ? JSON.stringify(metadata) : null,
  };
  S.documents.push(row);
  return row;
}

function addUnits(documentId, units) {
  units.forEach((u, i) => S.units.push({
    id: nextId("units"), document_id: documentId, sequence_index: i,
    speaker: u.speaker ?? null, text: u.text, paralinguistic_notes: u.paralinguistic ?? null,
  }));
}

function createRun(method, label) {
  const row = {
    id: nextId("method_runs"), method, project_label: label, started_at: nowIso(),
    status: "in_progress", config_snapshot_json: JSON.stringify({ method, prompts: RTA_PROMPTS }),
  };
  S.method_runs.push(row);
  return row;
}

function saveCodes(runId, unitId, proposals, createdBy = "model") {
  const ids = [];
  for (const p of proposals) {
    const label = String(p.label ?? "").trim();
    if (!label) continue;
    const row = {
      id: nextId("codes"), method_run_id: runId, unit_id: unitId, label,
      justification: p.justification ?? null, coding_level: null,
      status: "proposed", created_by: createdBy, created_at: nowIso(),
    };
    S.codes.push(row);
    ids.push(row.id);
  }
  return ids;
}

function saveCategory(runId, { label, definition, category_type }) {
  const row = {
    id: nextId("categories"), method_run_id: runId, parent_id: null, label: label.trim(),
    definition: definition ?? null, category_type, is_deviant_case: "no",
    status: "proposed", created_at: nowIso(),
  };
  S.categories.push(row);
  return row.id;
}

function linkCodes(categoryId, codeIds) {
  for (const codeId of codeIds) {
    if (!S.code_category_links.some((l) => l.code_id === codeId && l.category_id === categoryId)) {
      S.code_category_links.push({ code_id: codeId, category_id: categoryId });
    }
  }
}

function saveMemo(runId, content, createdBy, relatedCategoryId = null) {
  const row = {
    id: nextId("memos"), method_run_id: runId, related_code_id: null,
    related_category_id: relatedCategoryId, content: content.trim(),
    created_by: createdBy, created_at: nowIso(),
  };
  S.memos.push(row);
  return row.id;
}

const codesOfRun = (runId, statuses) => S.codes.filter((c) => c.method_run_id === runId &&
  (!statuses || statuses.includes(c.status)));
const themesOfRun = (runId, statuses) => S.categories.filter((k) => k.method_run_id === runId &&
  k.category_type === "theme" && (!statuses || statuses.includes(k.status)));
const codesOfCategory = (categoryId) => S.code_category_links
  .filter((l) => l.category_id === categoryId).map((l) => byId("codes", l.code_id)).filter(Boolean);
const unitOf = (code) => byId("units", code.unit_id);
const hasHumanMemo = (runId) => S.memos.some((m) => m.method_run_id === runId && m.created_by === "human");

// ===========================================================================
// Antrean peninjauan: SATU-SATUNYA tempat kolom status berubah.
// ===========================================================================

async function review(targetType, targetId, action, { newLabel, newDefinition, note } = {}) {
  if (!["validated", "revised", "rejected"].includes(action)) throw new UserError("Aksi tidak sah.");
  const table = targetType === "code" ? "codes" : "categories";
  const row = byId(table, targetId);
  if (!row) throw new UserError("Butir yang ditinjau tidak ditemukan.");
  const labelBaru = (newLabel || "").trim() || null;
  if (action === "revised" && !labelBaru && newDefinition == null) {
    throw new UserError("Revisi memerlukan label baru. Bila usulan sudah tepat, pilih Sahkan.");
  }
  const labelLama = row.label;
  row.status = action;
  if (labelBaru) row.label = labelBaru;
  if (newDefinition != null && targetType === "category") row.definition = newDefinition;
  S.validation_events.push({
    id: nextId("validation_events"), target_type: targetType, target_id: targetId, action,
    previous_label: labelLama, new_label: labelBaru, reviewer_note: note || null, reviewed_at: nowIso(),
  });
  await saveState();
}

// ===========================================================================
// Audit trail dan klien API
// ===========================================================================

function logCall(runId, stage, prompt, response) {
  S.audit_log.push({
    id: nextId("audit_log"), method_run_id: runId ?? null, stage, prompt_text: prompt,
    response_text: response.text, model_used: response.model,
    input_tokens: response.input_tokens ?? null, output_tokens: response.output_tokens ?? null,
    called_at: nowIso(),
  });
}

function logFailure(runId, stage, prompt, model, error, attempts) {
  logCall(runId, stage, prompt, {
    text: `[CALL_FAILED] after ${attempts} attempt(s): ${error}`, model,
  });
}

function providerId() { return (SETTINGS && PROVIDERS[SETTINGS.provider]) ? SETTINGS.provider : "anthropic"; }
function provider() { return PROVIDERS[providerId()]; }
function providerConf(id = providerId()) {
  const c = (SETTINGS.providers && SETTINGS.providers[id]) || {};
  return { key: c.key || "", model: c.model || PROVIDERS[id].model, url: (c.url || PROVIDERS[id].url).replace(/\/+$/, "") };
}
function apiKey() { return providerConf().key; }
// Siap memanggil AI: kunci terisi bila penyedianya memerlukan, dan alamat
// serta nama model tidak kosong.
function aiReady() {
  const c = providerConf();
  return (!provider().needsKey || !!c.key) && !!c.url && !!c.model;
}
const aiLabel = () => `${provider().label} · ${providerConf().model || "model belum diisi"}`;

function buildRequest(p, c, prompt, maxTokens) {
  if (p.kind === "anthropic") {
    return { url: c.url, headers: { "x-api-key": c.key, "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true" },
      body: { model: c.model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] } };
  }
  if (p.kind === "gemini") {
    // Batas keluaran tidak dikirim: pada model Gemini yang berpikir, batas yang
    // kecil habis untuk berpikir dan jawabannya kosong.
    return { url: `${c.url}/models/${encodeURIComponent(c.model)}:generateContent`, headers: { "x-goog-api-key": c.key },
      body: { contents: [{ role: "user", parts: [{ text: prompt }] }] } };
  }
  const headers = c.key ? { authorization: `Bearer ${c.key}` } : {};
  return { url: `${c.url}/chat/completions`, headers,
    body: { model: c.model, messages: [{ role: "user", content: prompt }] } };
}

function parseResponse(p, data, c) {
  if (p.kind === "anthropic") {
    return { text: (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
      model: data.model || c.model, input_tokens: data.usage?.input_tokens, output_tokens: data.usage?.output_tokens };
  }
  if (p.kind === "gemini") {
    const parts = data.candidates?.[0]?.content?.parts || [];
    return { text: parts.filter((x) => typeof x.text === "string" && !x.thought).map((x) => x.text).join(""),
      model: data.modelVersion || c.model, input_tokens: data.usageMetadata?.promptTokenCount,
      output_tokens: data.usageMetadata?.candidatesTokenCount };
  }
  const content = data.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((x) => x.text || "").join("") : (content || "");
  return { text, model: data.model || c.model, input_tokens: data.usage?.prompt_tokens, output_tokens: data.usage?.completion_tokens };
}

function classifyFailure(status, detail) {
  if (status === 401 || status === 403) return "auth";
  if (status === 400 && /api[ _-]?key|API_KEY_INVALID|invalid.{0,20}(key|token)|authentication/i.test(detail)) return "auth";
  if (status === 402) return "billing";
  if (status === 404) return "model";
  if (status === 400 && /model/i.test(detail) && /not.{0,12}(found|exist|support)|invalid|unknown/i.test(detail)) return "model";
  if (status === 429) return "rate";
  if (status >= 500) return "server";
  return "request";
}

// Satu-satunya pintu ke penyedia AI mana pun. Pemanggilan yang berhasil dicatat
// oleh pemanggilnya lewat logCall() sebelum hasilnya dipakai; pemanggilan yang
// gagal total dicatat di sini lewat logFailure().
async function callModel(prompt, { stage, runId = null, maxTokens = 2048 }) {
  const id = providerId(), p = PROVIDERS[id], c = providerConf(id);
  if (p.needsKey && !c.key) throw new UserError(`Kunci akses untuk ${p.label} belum diisi. Isi di halaman Pengaturan.`);
  if (!c.url || !c.model) throw new UserError(`Alamat layanan atau nama model untuk ${p.label} belum diisi. Lengkapi di halaman Pengaturan.`);
  const modelTag = `${id}/${c.model}`;
  const req = buildRequest(p, c, prompt, maxTokens);
  let lastError = "", kind = "other", attempts = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    let res;
    try {
      res = await fetch(req.url, { method: "POST", headers: { "content-type": "application/json", ...req.headers },
        body: JSON.stringify(req.body) });
    } catch (e) {
      lastError = `network: ${e.message}`; kind = "network";
      if (attempt < MAX_ATTEMPTS && !p.local) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
      break;
    }
    if (res.ok) {
      const parsed = parseResponse(p, await res.json(), c);
      return { ...parsed, model: `${id}/${parsed.model}` };
    }
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch (e) { detail = res.statusText; }
    lastError = `Error code: ${res.status} - ${detail}`;
    kind = classifyFailure(res.status, detail);
    if ((kind === "rate" || kind === "server") && attempt < MAX_ATTEMPTS) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
    break;
  }
  logFailure(runId, stage, prompt, modelTag, lastError, attempts);
  await saveState();
  const nama = p.label;
  const pesan = {
    auth: `Kunci ditolak oleh ${nama}. Periksa kunci di halaman Pengaturan.`,
    billing: `${nama} menolak permintaan karena saldo atau kuota akun tidak mencukupi.`,
    model: `Model "${c.model}" tidak dikenali oleh ${nama}. Periksa nama model di halaman Pengaturan.`,
    network: p.local
      ? "Ollama tidak dapat dihubungi. Pastikan Ollama sedang berjalan dan dijalankan dengan pengaturan OLLAMA_ORIGINS=* agar menerima akses dari peramban."
      : `Tidak dapat menghubungi ${nama}. Periksa sambungan internet. Bila internet normal, ${nama} mungkin tidak mengizinkan akses langsung dari peramban; pakai model yang sama lewat OpenRouter.`,
    rate: `${nama} sedang membatasi permintaan dari akun ini. Tunggu beberapa menit, lalu coba lagi.`,
    server: `Layanan ${nama} sedang bermasalah. Coba lagi beberapa saat lagi.`,
  }[kind] || `Permintaan ke ${nama} gagal. Rinciannya tercatat di halaman Audit.`;
  throw new ApiError(kind, pesan);
}

// ===========================================================================
// Ekstraksi dan segmentasi (padanan src/ingestion)
// ===========================================================================

const SPEAKER_LINE = /^\s*([A-Z][\p{L}\p{N}_ .'-]{0,40}?)\s*:\s*(.*)$/u;

function detectParalinguistic(text) {
  const notes = [];
  const pauses = [...text.matchAll(/\((\d+(?:[.,]\d+)?)\)/g)].map((m) => m[1]);
  if (pauses.length) notes.push("jeda " + pauses.map((j) => `${j} detik`).join(", "));
  const micro = (text.match(/\(\.\)/g) || []).length;
  if (micro) notes.push(`jeda mikro (${micro}x)`);
  const overlap = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
  if (overlap.length) notes.push("overlap: " + overlap.join("; "));
  const nonVerbal = [...text.matchAll(/\(\(([^)]+)\)\)/g)].map((m) => m[1].trim());
  if (nonVerbal.length) notes.push("non-verbal: " + nonVerbal.join("; "));
  const emphasis = [...new Set([...text.replace(/\(\(([^)]+)\)\)/g, "").matchAll(/\b([A-Z]{2,})\b/g)]
    .map((m) => m[1]).filter((p) => p.length > 2))];
  if (emphasis.length) notes.push("penekanan: " + emphasis.join(", "));
  const elong = [...text.matchAll(/(\w)(:{2,})/g)].map((m) => m[1] + m[2]);
  if (elong.length) notes.push("perpanjangan bunyi: " + elong.join(", "));
  return notes.length ? notes.join(" | ") : null;
}

function extractTranscript(text) {
  const blocks = [];
  let speaker = null, buffer = [];
  const close = () => {
    const t = buffer.map((b) => b.trim()).join(" ").trim();
    if (t) blocks.push({ text: t, speaker, paralinguistic: detectParalinguistic(t) });
    buffer = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(SPEAKER_LINE);
    if (m) { close(); speaker = m[1].trim(); if (m[2].trim()) buffer.push(m[2].trim()); }
    else buffer.push(line.trim());
  }
  close();
  return blocks;
}

const paragraphs = (text) => text.split(/\n\s*\n/).map((p) => p.replace(/[ \t]+/g, " ").trim())
  .filter(Boolean).map((p) => ({ text: p.replace(/\s*\n\s*/g, " ") }));

async function extractDocx(buffer) {
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return paragraphs(result.value);
}

async function extractPdf(buffer) {
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const blocks = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) text += item.str + (item.hasEOL ? "\n" : "");
    for (const b of paragraphs(text)) blocks.push(b);
  }
  return blocks;
}

const SENTENCE_END = /(?<=[.!?…])\s+(?=[A-Z“"'(])/;

function splitSentences(text, limit) {
  const parts = [];
  let current = "";
  for (const s of text.split(SENTENCE_END)) {
    if (!current) current = s;
    else if (current.length + 1 + s.length <= limit) current += " " + s;
    else { parts.push(current); current = s; }
  }
  if (current) parts.push(current);
  return parts.length ? parts : [text];
}

function segment(blocks, max = SEG_MAX, min = SEG_MIN) {
  const units = [];
  let cur = null;
  for (const b of blocks) {
    if (!b.text.trim()) continue;
    if (b.speaker != null) {
      if (cur) { units.push(cur); cur = null; }
      for (const part of splitSentences(b.text, max)) {
        units.push({ text: part, speaker: b.speaker, paralinguistic: b.paralinguistic });
      }
      continue;
    }
    if (!cur) cur = { text: b.text };
    else if (cur.text.length < min || cur.text.length + 1 + b.text.length <= max) cur.text = `${cur.text} ${b.text}`.trim();
    else { units.push(cur); cur = { text: b.text }; }
    if (cur.text.length > max) {
      const parts = splitSentences(cur.text, max);
      parts.slice(0, -1).forEach((p) => units.push({ text: p }));
      cur = { text: parts[parts.length - 1] };
    }
  }
  if (cur) units.push(cur);
  return units;
}

async function ingestFile(file, { title, sourceType, participantId }) {
  if (!title.trim()) throw new UserError("Judul dokumen tidak boleh kosong.");
  if (S.documents.some((d) => d.file_path === file.name)) {
    throw new UserError(`Berkas "${file.name}" sudah pernah dimasukkan.`);
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const buffer = await file.arrayBuffer();
  let blocks;
  if (sourceType === "interview_transcript") {
    if (ext !== "txt" && ext !== "md") {
      throw new UserError("Transkrip wawancara harus berupa berkas teks (.txt) agar penanda jeda, overlap, dan penekanan tidak hilang.");
    }
    blocks = extractTranscript(new TextDecoder().decode(buffer));
  } else if (ext === "docx") blocks = await extractDocx(buffer);
  else if (ext === "pdf") blocks = await extractPdf(buffer);
  else if (ext === "txt" || ext === "md") blocks = paragraphs(new TextDecoder().decode(buffer));
  else throw new UserError("Jenis berkas belum didukung. Gunakan .txt, .docx, atau .pdf.");
  if (!blocks.length) throw new UserError("Tidak ada teks yang dapat dibaca dari berkas ini.");
  const units = segment(blocks);
  const doc = addDocument({ title: title.trim(), source_type: sourceType, file_name: file.name,
    participant_id: participantId.trim() || null, metadata: { ukuran_byte: file.size } });
  addUnits(doc.id, units);
  await saveState();
  return { doc, blocks: blocks.length, units: units.length,
    speakers: [...new Set(units.map((u) => u.speaker).filter(Boolean))] };
}

// ===========================================================================
// RTA (padanan src/coding/rta.py)
// ===========================================================================

const RTA = {
  async codeUnit(runId, unit) {
    const doc = byId("documents", unit.document_id);
    const context = doc.title + (doc.participant_id ? ` · partisipan ${doc.participant_id}` : "");
    const prompt = fill(RTA_PROMPTS.open_coding, { document_context: context, unit_text: unit.text }) + CODE_CONTRACT;
    const response = await callModel(prompt, { stage: "open_coding", runId });
    logCall(runId, "open_coding", prompt, response);   // dicatat sebelum hasil dipakai
    await saveState();
    const proposals = extractJsonArray(response.text).filter((p) => p && typeof p === "object");
    const ids = saveCodes(runId, unit.id, proposals);
    await saveState();
    if (!ids.length) throw new UserError("AI tidak mengusulkan kode berlabel untuk unit ini.");
    return ids.length;
  },

  // Daftar kode untuk prompt tema: tanpa hitungan apa pun, urutan diacak agar
  // urutan kemunculan tidak membawa sinyal prevalensi secara diam-diam.
  bundleCodes(codes) {
    return shuffle(codes).map((c) => {
      const u = unitOf(c);
      return `- [${c.id}] ${c.label}` + (c.justification ? ` — justifikasi: ${c.justification}` : "") +
        (u ? `\n  kutipan: "${u.text.slice(0, 220)}"` : "");
    }).join("\n");
  },

  async generateThemes(runId) {
    const codes = codesOfRun(runId, ["proposed", "validated", "revised"]);
    if (!codes.length) throw new UserError("Belum ada kode yang dapat dijadikan dasar pembentukan tema.");
    const prompt = fill(RTA_PROMPTS.theme_generation, { code_list: this.bundleCodes(codes) }) + THEME_CONTRACT;
    const response = await callModel(prompt, { stage: "theme_generation", runId, maxTokens: 4096 });
    logCall(runId, "theme_generation", prompt, response);
    await saveState();
    const valid = new Set(codes.map((c) => c.id));
    const created = [];
    for (const item of extractJsonArray(response.text)) {
      if (!item || typeof item !== "object" || !String(item.label ?? "").trim()) continue;
      let definition = String(item.story ?? "").trim() || null;
      if (item.quote) definition = `${definition || ""}\n\nKutipan: "${String(item.quote).trim()}"`.trim();
      const id = saveCategory(runId, { label: String(item.label), definition, category_type: "theme" });
      const linked = (item.code_ids || []).map(Number).filter((n) => valid.has(n));
      linkCodes(id, linked);
      created.push(String(item.label));
    }
    await saveState();
    if (!created.length) throw new UserError("Tidak ada tema berlabel dalam jawaban AI. Coba lagi.");
    await this.reflexiveMemo(runId, "theme_generation", "Tema yang baru terbentuk: " + created.join("; "));
    return created.length;
  },

  async reviewThemes(runId) {
    const themes = themesOfRun(runId, ["proposed", "validated", "revised"]);
    if (!themes.length) throw new UserError("Belum ada tema yang dapat ditinjau.");
    const bundle = themes.map((t) => `Tema [${t.id}] ${t.label}\n  definisi kerja: ${t.definition || "(belum ada)"}\n` +
      codesOfCategory(t.id).map((k) => `  - ${k.label}: "${(unitOf(k)?.text || "").slice(0, 160)}"\n`).join("")).join("\n");
    const prompt = fill(RTA_PROMPTS.theme_review, { theme_bundle: bundle });
    const response = await callModel(prompt, { stage: "theme_review", runId, maxTokens: 4096 });
    logCall(runId, "theme_review", prompt, response);
    saveMemo(runId, response.text, "model");
    await saveState();
    return response.text;
  },

  async defineAndName(runId) {
    if (!hasHumanMemo(runId)) {
      throw new UserError("Tulis sekurang-kurangnya satu memo reflektif Anda sendiri di halaman Memo sebelum menamai tema. " +
        "RTA menempatkan subjektivitas peneliti sebagai bagian analisis yang harus terekam.");
    }
    const themes = themesOfRun(runId, ["proposed"]);
    if (!themes.length) throw new UserError("Tidak ada tema berstatus usulan yang perlu dinamai.");
    let n = 0;
    for (const t of themes) {
      const codes = codesOfCategory(t.id);
      const prompt = fill(RTA_PROMPTS.theme_definition_naming, {
        theme_label: t.label, theme_definition: t.definition || "(belum ada)",
        codes_and_quotes: codes.map((k) => `- ${k.label}: "${(unitOf(k)?.text || "").slice(0, 200)}"`).join("\n") || "(belum ada kode tertaut)",
      }) + DEFINITION_CONTRACT;
      const response = await callModel(prompt, { stage: "theme_definition_naming", runId });
      logCall(runId, "theme_definition_naming", prompt, response);
      await saveState();
      const data = extractJsonArray(response.text)[0];
      if (!data || typeof data !== "object") throw new UserError("Jawaban AI untuk salah satu tema tidak dapat dibaca.");
      // Hanya label dan definisi yang disunting, dan hanya pada tema yang masih usulan.
      if (t.status === "proposed") {
        t.label = String(data.label || t.label).trim() || t.label;
        let def = String(data.definition || "").trim() || t.definition;
        if (data.quote) def = `${def}\n\nKutipan: "${String(data.quote).trim()}"`;
        t.definition = def;
        n++;
      }
    }
    await saveState();
    return n;
  },

  async familiarization(runId, documentId) {
    const doc = byId("documents", documentId);
    const units = S.units.filter((u) => u.document_id === documentId).sort((a, b) => a.sequence_index - b.sequence_index).slice(0, 12);
    const context = `Dokumen '${doc.title}' (${doc.source_type})` + (doc.participant_id ? `, partisipan ${doc.participant_id}` : "") +
      ".\n\nCuplikan unit:\n" + units.map((u) => `- ${u.text}`).join("\n");
    return this.reflexiveMemo(runId, "familiarization", context);
  },

  async reflexiveMemo(runId, stage, context) {
    const prompt = fill(RTA_PROMPTS.reflexive_memo, { stage, context });
    const response = await callModel(prompt, { stage: "reflexive_memo", runId });
    logCall(runId, "reflexive_memo", prompt, response);
    saveMemo(runId, response.text, "model");
    await saveState();
    return response.text;
  },
};

// ===========================================================================
// Cadangan dan ekspor
// ===========================================================================

function backupJson() {
  // Kunci akses berada di SETTINGS, bukan di S, sehingga tidak pernah ikut tercadangkan.
  return JSON.stringify({ ...S, exported_at: nowIso() }, null, 2);
}

function validateBackup(data) {
  if (!data || data.format !== BACKUP_FORMAT) throw new UserError(`Berkas ini bukan cadangan ${APP_NAME}.`);
  if (data.version > BACKUP_VERSION) throw new UserError("Cadangan ini berasal dari versi aplikasi yang lebih baru.");
  for (const t of TABLES) if (!Array.isArray(data[t])) throw new UserError(`Cadangan tidak lengkap: bagian ${t} hilang.`);
  const s = emptyState();
  for (const t of TABLES) {
    s[t] = data[t];
    s.seq[t] = Math.max(Number(data.seq?.[t] || 0), ...data[t].map((r) => Number(r.id) || 0), 0);
  }
  return s;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

// ===========================================================================
// Antarmuka
// ===========================================================================

const PAGES = [
  ["home", "Beranda"], ["settings", "Pengaturan"], ["ingest", "Masukkan berkas"],
  ["coding", "Usulan kode"], ["themes", "Tema & tinjauan"], ["memos", "Memo"],
  ["audit", "Audit"], ["backup", "Cadangan & ekspor"],
];
const UI = { page: "home", runId: null, busy: false, cancel: false, last: null };

function setPage(page) { UI.page = page; UI.last = null; render(); window.scrollTo(0, 0); }

function runOptions() {
  const runs = S.method_runs.slice().reverse();
  if (UI.runId == null || !byId("method_runs", UI.runId)) UI.runId = runs[0]?.id ?? null;
  return runs.map((r) => `<option value="${r.id}" ${r.id === UI.runId ? "selected" : ""}>#${r.id} · ${esc(r.project_label)}</option>`).join("");
}

function runPicker() {
  if (!S.method_runs.length) {
    return `<div class="note info">Belum ada sesi analisis. Mulai satu sesi di <a href="#" data-go="home">Beranda</a>.</div>`;
  }
  return `<div class="card"><label for="run">Sesi analisis</label><select id="run" data-action="pick-run">${runOptions()}</select></div>`;
}

const chip = (status) => `<span class="chip ${esc(status)}">${{ proposed: "usulan", validated: "sah", revised: "direvisi", rejected: "ditolak" }[status] || esc(status)}</span>`;
const keyWarning = () => (aiReady() ? "" : `<div class="note warn">Pengaturan AI untuk ${esc(provider().label)} belum lengkap, sehingga AI belum dapat dipanggil. <a href="#" data-go="settings">Lengkapi di Pengaturan</a>.</div>`);
const lastMessage = () => (UI.last ? `<div class="note ${UI.last.kind}">${esc(UI.last.text)}</div>` : "");

const VIEWS = {
  home() {
    const total = (t) => S[t].length;
    const hasData = S.documents.length > 0;
    const backupWarn = hasData && !SETTINGS.lastBackupAt
      ? `<div class="note warn"><b>Data Anda belum pernah dicadangkan.</b> Data tersimpan di peramban ini dan akan hilang bila data peramban dibersihkan. <a href="#" data-go="backup">Unduh cadangan sekarang</a>.</div>`
      : (SETTINGS.lastBackupAt ? `<p class="muted">Cadangan terakhir: ${esc(SETTINGS.lastBackupAt)}</p>` : "");
    return `
      <h2>Beranda</h2>
      ${keyWarning()}${backupWarn}${lastMessage()}
      <div class="card">
        <p>Semua data penelitian tersimpan di peramban ini. Hanya potongan teks yang Anda minta untuk dianalisis yang dikirim ke penyedia AI pilihan Anda, dan setiap pengiriman tercatat di halaman Audit.</p>
        <p class="muted">AI yang aktif: <b>${esc(aiLabel())}</b> · <a href="#" data-go="settings">ubah</a></p>
        <ol class="steps">
          <li>Pilih penyedia AI dan isi kuncinya di <a href="#" data-go="settings">Pengaturan</a>.</li>
          <li>Masukkan berkas penelitian di <a href="#" data-go="ingest">Masukkan berkas</a>.</li>
          <li>Mulai sesi analisis di bawah ini.</li>
          <li>Minta usulan kode di <a href="#" data-go="coding">Usulan kode</a>.</li>
          <li>Bentuk tema dan tinjau semua usulan di <a href="#" data-go="themes">Tema &amp; tinjauan</a>.</li>
          <li>Unduh cadangan secara berkala di <a href="#" data-go="backup">Cadangan &amp; ekspor</a>.</li>
        </ol>
      </div>
      <h3>Mulai sesi analisis baru</h3>
      <div class="card">
        <div class="row">
          <div><label for="run-name">Nama proyek atau penelitian</label><input type="text" id="run-name" placeholder="contoh: Studi Beban Kerja Guru"></div>
          <div><label for="run-method">Metode analisis</label><select id="run-method">
            ${Object.entries(METHODS).map(([k, m]) => `<option value="${k}" ${m.available ? "" : "disabled"}>${esc(m.name)}${m.available ? "" : " — belum tersedia"}</option>`).join("")}
          </select></div>
        </div>
        <div class="actions"><button class="btn primary" data-action="new-run">Mulai sesi</button></div>
      </div>
      <h3>Ringkasan</h3>
      <div class="stats">
        ${[["Dokumen", "documents"], ["Unit makna", "units"], ["Sesi", "method_runs"], ["Kode", "codes"], ["Tema", "categories"], ["Memo", "memos"]]
          .map(([l, t]) => `<div class="stat"><b>${total(t)}</b><span>${l}</span></div>`).join("")}
      </div>
      <h3>Sesi analisis</h3>
      ${S.method_runs.length ? `<div class="card tablewrap"><table><tr><th>No.</th><th>Proyek</th><th>Metode</th><th>Dimulai</th><th>Kode</th><th>Menunggu tinjauan</th><th>Tema</th></tr>
        ${S.method_runs.slice().reverse().map((r) => `<tr><td>${r.id}</td><td>${esc(r.project_label)}</td><td>${esc(METHODS[r.method]?.name || r.method)}</td><td>${esc(r.started_at)}</td>
        <td>${codesOfRun(r.id).length}</td><td>${codesOfRun(r.id, ["proposed"]).length}</td><td>${themesOfRun(r.id).length}</td></tr>`).join("")}</table></div>`
        : `<div class="empty">Belum ada sesi analisis.</div>`}`;
  },

  settings() {
    const id = providerId(), p = provider(), c = providerConf();
    const disimpan = (SETTINGS.providers && SETTINGS.providers[id]) || {};
    return `
      <h2>Pengaturan</h2>${lastMessage()}
      <div class="card">
        <h3>Penyedia AI</h3>
        <p>Pilih AI yang akan mengusulkan kode dan tema. Pemakaian AI ditagihkan ke akun Anda di penyedia tersebut.</p>
        <label for="provider">Penyedia</label>
        <select id="provider" data-action="pick-provider">
          ${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === id ? "selected" : ""}>${esc(v.label)}</option>`).join("")}
        </select>
        <p class="muted" style="margin-top:12px">${p.keyHelp}</p>
        ${p.local
          ? `<div class="note ok">Dengan Ollama, teks penelitian diproses di komputer ini dan tidak dikirim ke internet.</div>`
          : `<div class="note info">Teks yang Anda analisis akan dikirim ke <b>${esc(p.label)}</b>. Pastikan hal ini sesuai dengan persetujuan etik dan persetujuan partisipan penelitian Anda.${p.browserVerified ? "" : " Akses langsung dari peramban ke penyedia ini belum diuji; bila tidak tersambung, pakai model yang sama lewat OpenRouter."}</div>`}
      </div>
      <div class="card">
        <h3>Pengaturan ${esc(p.label)}</h3>
        <div class="row">
          <div><label for="model">Nama model</label><input type="text" id="model" value="${esc(disimpan.model || "")}" placeholder="${esc(p.model || "contoh: nama-model")}"></div>
          ${p.editableUrl ? `<div><label for="base-url">Alamat layanan</label><input type="text" id="base-url" value="${esc(disimpan.url || "")}" placeholder="${esc(p.url || "https://…/v1")}"></div>` : ""}
        </div>
        <p class="muted" style="margin-top:8px">Kosongkan untuk memakai nilai bawaan${p.model ? ` (<code>${esc(p.model)}</code>)` : ""}. Nama model dapat dilihat di dokumentasi penyedia.</p>
        ${p.needsKey || id === "custom" ? `
          ${c.key ? `<div class="note ok">Kunci akses sudah tersimpan.</div>` : `<div class="note warn">Kunci akses belum diisi.</div>`}
          <label for="key">Tempel kunci akses di sini</label>
          <input type="password" id="key" autocomplete="off" placeholder="${c.key ? "biarkan kosong untuk mempertahankan kunci yang tersimpan" : "kunci akses"}">` : ""}
        <p class="muted" style="margin-top:8px">Kunci disimpan hanya di peramban ini, terpisah untuk setiap penyedia, tidak pernah ditampilkan ulang, tidak dicatat di audit, dan tidak ikut dalam berkas cadangan. Hapus kunci bila komputer dipakai bersama.</p>
        <div class="actions">
          <button class="btn primary" data-action="save-key">Simpan pengaturan</button>
          <button class="btn" data-action="test-key" ${aiReady() ? "" : "disabled"}>Uji koneksi</button>
          <button class="btn danger" data-action="delete-key" ${c.key ? "" : "disabled"}>Hapus kunci</button>
        </div>
      </div>`;
  },

  ingest() {
    const docs = S.documents.slice().reverse();
    return `
      <h2>Masukkan berkas</h2>${lastMessage()}
      <div class="card">
        <p>Pilih berkas penelitian dari komputer Anda. Berkas aslinya tidak diubah; aplikasi hanya membaca teksnya lalu memecahnya menjadi unit makna.</p>
        <p class="muted">Berkas yang didukung: .txt, .docx, .pdf. Untuk transkrip wawancara, gunakan .txt yang setiap giliran bicaranya diawali nama penutur berhuruf depan kapital dan titik dua, misalnya <code>Pewawancara: ...</code> dan <code>P03: ...</code>.</p>
        <label for="file">Berkas</label><input type="file" id="file" accept=".txt,.md,.docx,.pdf">
        <div class="row" style="margin-top:10px">
          <div><label for="doc-title">Judul dokumen</label><input type="text" id="doc-title"></div>
          <div><label for="doc-type">Jenis sumber</label><select id="doc-type">${Object.entries(SOURCE_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
          <div><label for="doc-pid">Kode partisipan (bila ada)</label><input type="text" id="doc-pid" placeholder="contoh: P03"></div>
        </div>
        <div class="actions"><button class="btn primary" data-action="ingest">Masukkan</button></div>
      </div>
      <h3>Dokumen yang sudah masuk</h3>
      ${docs.length ? docs.map((d) => {
        const units = S.units.filter((u) => u.document_id === d.id).sort((a, b) => a.sequence_index - b.sequence_index);
        return `<details class="card"><summary><b>${esc(d.title)}</b> · ${esc(SOURCE_TYPES[d.source_type] || d.source_type)} · ${units.length} unit${d.participant_id ? ` · partisipan ${esc(d.participant_id)}` : ""}</summary>
          ${units.map((u) => `<blockquote>${u.speaker ? `<b>${esc(u.speaker)}:</b> ` : ""}${esc(u.text)}${u.paralinguistic_notes ? `<div class="muted">${esc(u.paralinguistic_notes)}</div>` : ""}</blockquote>`).join("")}</details>`;
      }).join("") : `<div class="empty">Belum ada dokumen.</div>`}`;
  },

  coding() {
    const picker = runPicker();
    if (!S.method_runs.length) return `<h2>Usulan kode</h2>${picker}`;
    const runId = UI.runId;
    const units = S.units;
    const coded = new Set(codesOfRun(runId).map((c) => c.unit_id));
    const pending = units.filter((u) => !coded.has(u.id));
    return `
      <h2>Usulan kode</h2>${keyWarning()}${picker}${lastMessage()}
      <div class="card">
        <p><b>${coded.size}</b> dari <b>${units.length}</b> unit sudah memiliki usulan kode pada sesi ini.</p>
        <p class="muted">${esc(RTA_PROMPTS.philosophy)}</p>
        <div class="progress" id="prog" ${UI.busy ? "" : "hidden"}><div></div></div>
        <div class="actions">
          <button class="btn primary" data-action="code-all" ${!aiReady() || UI.busy || !pending.length ? "disabled" : ""}>Usulkan kode untuk ${pending.length} unit yang belum dikode</button>
          <button class="btn" data-action="cancel" ${UI.busy ? "" : "hidden"}>Hentikan</button>
        </div>
      </div>
      ${S.documents.map((d) => {
        const du = units.filter((u) => u.document_id === d.id).sort((a, b) => a.sequence_index - b.sequence_index);
        return `<details class="card"><summary><b>${esc(d.title)}</b> · ${du.length} unit</summary>
          <div class="actions"><button class="btn" data-action="familiarize" data-doc="${d.id}" ${!aiReady() || UI.busy ? "disabled" : ""}>Buat memo pembiasaan untuk dokumen ini</button></div>
          ${du.map((u) => {
            const codes = S.codes.filter((c) => c.unit_id === u.id && c.method_run_id === runId);
            return `<div style="margin:12px 0"><blockquote>${u.speaker ? `<b>${esc(u.speaker)}:</b> ` : ""}${esc(u.text)}</blockquote>
              ${codes.map((c) => `<div>${chip(c.status)} <b>${esc(c.label)}</b> <span class="muted">${esc(c.justification || "")}</span></div>`).join("")}
              <button class="btn" data-action="code-one" data-unit="${u.id}" ${!aiReady() || UI.busy ? "disabled" : ""}>${codes.length ? "Minta usulan tambahan" : "Usulkan kode"}</button></div>`;
          }).join("")}</details>`;
      }).join("")}`;
  },

  themes() {
    const picker = runPicker();
    if (!S.method_runs.length) return `<h2>Tema &amp; tinjauan</h2>${picker}`;
    const runId = UI.runId;
    const themes = S.categories.filter((k) => k.method_run_id === runId);
    const queue = codesOfRun(runId, ["proposed"]);
    const counts = (st) => codesOfRun(runId, [st]).length;
    const dis = !aiReady() || UI.busy ? "disabled" : "";
    return `
      <h2>Tema &amp; tinjauan</h2>${keyWarning()}${picker}${lastMessage()}
      <div class="stats">${[["usulan", "proposed"], ["sah", "validated"], ["direvisi", "revised"], ["ditolak", "rejected"]]
        .map(([l, s]) => `<div class="stat"><b>${counts(s)}</b><span>kode ${l}</span></div>`).join("")}</div>
      <h3>Pembentukan tema</h3>
      <div class="card">
        <div class="actions" style="margin-top:0">
          <button class="btn primary" data-action="gen-themes" ${dis}>Bentuk tema</button>
          <button class="btn" data-action="review-themes" ${dis}>Tinjau tema</button>
          <button class="btn" data-action="name-themes" ${dis}>Namai dan definisikan</button>
        </div>
        <p class="muted" style="margin-top:10px">Jumlah kemunculan kode tidak pernah dikirim ke AI saat tema dibentuk: pada RTA, seberapa sering sesuatu muncul bukan alasan sebuah tema. Penamaan tema baru dapat dijalankan setelah Anda menulis sekurang-kurangnya satu memo sendiri.</p>
      </div>
      ${themes.length ? themes.map((t) => {
        const codes = codesOfCategory(t.id);
        return `<div class="card"><div>${chip(t.status)} <b>[${t.id}] ${esc(t.label)}</b></div>
          ${t.definition ? `<p style="white-space:pre-wrap;margin-top:6px">${esc(t.definition)}</p>` : ""}
          <details><summary>${codes.length} kode tertaut</summary>${codes.map((k) => `<div>${chip(k.status)} <b>${esc(k.label)}</b> — <span class="muted">"${esc((unitOf(k)?.text || "").slice(0, 160))}"</span></div>`).join("")}</details>
          ${t.status === "proposed" ? reviewControls("category", t.id) : ""}</div>`;
      }).join("") : `<div class="empty">Belum ada tema.</div>`}
      <h3>Antrean peninjauan kode (${queue.length})</h3>
      <p class="muted">Status hanya berubah di sini, dan setiap tindakan tercatat.</p>
      ${queue.length ? queue.slice(0, 80).map((c) => {
        const u = unitOf(c); const d = u && byId("documents", u.document_id);
        return `<div class="card"><b>[${c.id}] ${esc(c.label)}</b><div class="muted">${esc(d?.title || "")} · ${esc(u?.speaker || "tanpa penutur")}</div>
          <blockquote>${esc(u?.text || "")}</blockquote>${c.justification ? `<div class="muted">Justifikasi AI: ${esc(c.justification)}</div>` : ""}
          ${reviewControls("code", c.id)}</div>`;
      }).join("") : `<div class="note ok">Tidak ada kode yang menunggu peninjauan.</div>`}`;
  },

  memos() {
    const picker = runPicker();
    if (!S.method_runs.length) return `<h2>Memo</h2>${picker}`;
    const memos = S.memos.filter((m) => m.method_run_id === UI.runId).slice().reverse();
    return `
      <h2>Memo reflektif</h2>${picker}${lastMessage()}
      <div class="card">
        <label for="memo">Memo baru</label>
        <textarea id="memo" placeholder="Catat keputusan interpretatif, keraguan, posisionalitas, atau alasan sebuah kode terasa tidak pas."></textarea>
        <div class="actions"><button class="btn primary" data-action="save-memo">Simpan memo</button></div>
      </div>
      ${memos.length ? memos.map((m) => `<div class="card"><div class="muted">#${m.id} · ditulis ${m.created_by === "human" ? "<b>peneliti</b>" : "AI"} · ${esc(m.created_at)}</div><p style="white-space:pre-wrap;margin-top:6px">${esc(m.content)}</p></div>`).join("")
        : `<div class="empty">Belum ada memo pada sesi ini.</div>`}`;
  },

  audit() {
    const rows = S.audit_log.slice().reverse();
    const failed = rows.filter((r) => r.response_text.startsWith("[CALL_FAILED]")).length;
    const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
    return `
      <h2>Audit</h2>
      <p class="muted">Setiap pemanggilan AI tercatat di sini, termasuk yang gagal, sebagai dasar keterlacakan analisis.</p>
      <div class="stats">${[["pemanggilan", rows.length], ["gagal", failed], ["token masukan", sum("input_tokens")], ["token keluaran", sum("output_tokens")]]
        .map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <h3>Rincian</h3>
      ${rows.length ? rows.slice(0, 200).map((r) => `<details class="card"><summary>${r.response_text.startsWith("[CALL_FAILED]") ? "<b>GAGAL</b> · " : ""}#${r.id} · ${esc(r.stage)} · ${esc(r.called_at)} · ${r.input_tokens ?? "-"}/${r.output_tokens ?? "-"} token</summary>
        <label>Teks yang dikirim</label><pre>${esc(r.prompt_text)}</pre><label>Jawaban</label><pre>${esc(r.response_text)}</pre></details>`).join("")
        : `<div class="empty">Belum ada pemanggilan.</div>`}`;
  },

  backup() {
    return `
      <h2>Cadangan &amp; ekspor</h2>${lastMessage()}
      <div class="card">
        <h3 style="margin-top:0">Cadangan</h3>
        <p>Data tersimpan di peramban ini saja. Data akan hilang bila data peramban dibersihkan, peramban diganti, atau komputer diganti. <b>Unduh cadangan secara berkala</b> dan simpan di tempat aman.</p>
        <p class="muted">Berkas cadangan memuat seluruh data penelitian (termasuk transkrip), tetapi tidak memuat kunci akses. Perlakukan berkas ini sama rahasianya dengan data penelitian Anda.</p>
        ${SETTINGS.lastBackupAt ? `<p class="muted">Cadangan terakhir: ${esc(SETTINGS.lastBackupAt)}</p>` : ""}
        <div class="actions"><button class="btn primary" data-action="backup">Unduh cadangan</button></div>
        <h3>Pulihkan dari cadangan</h3>
        <p class="muted">Memulihkan akan <b>menggantikan</b> seluruh data yang ada di peramban ini dengan isi berkas cadangan.</p>
        <input type="file" id="restore-file" accept=".json,application/json">
        <div class="actions"><button class="btn" data-action="restore">Pulihkan</button></div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Ekspor tabel (CSV)</h3>
        <p class="muted">Untuk dibuka di Excel atau perangkat analisis lain. Ini data mentah, bukan laporan.</p>
        <div class="actions">${TABLES.map((t) => `<button class="btn" data-action="csv" data-table="${t}">${t} (${S[t].length})</button>`).join("")}</div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Hapus semua data</h3>
        <p class="muted">Menghapus seluruh data penelitian dari peramban ini. Unduh cadangan lebih dahulu bila masih diperlukan.</p>
        <div class="actions"><button class="btn danger" data-action="wipe">Hapus semua data</button></div>
      </div>`;
  },
};

function reviewControls(type, id) {
  return `<div class="row" style="margin-top:10px">
      <div><label>Catatan peninjau</label><input type="text" id="note-${type}-${id}"></div>
      <div><label>Label hasil revisi</label><input type="text" id="label-${type}-${id}"></div>
    </div>
    <div class="actions">
      <button class="btn primary" data-action="review" data-type="${type}" data-id="${id}" data-verdict="validated">Sahkan</button>
      <button class="btn" data-action="review" data-type="${type}" data-id="${id}" data-verdict="revised">Revisi</button>
      <button class="btn danger" data-action="review" data-type="${type}" data-id="${id}" data-verdict="rejected">Tolak</button>
    </div>`;
}

function render() {
  $("#nav").innerHTML = PAGES.map(([k, l]) => `<button data-go="${k}" ${k === UI.page ? 'aria-current="page"' : ""}>${l}</button>`).join("");
  $("#view").innerHTML = VIEWS[UI.page]();
}

function report(kind, text) { UI.last = { kind, text }; render(); }

async function guarded(fn) {
  if (UI.busy) return;
  UI.busy = true; UI.cancel = false; UI.last = null; render();
  try { await fn(); }
  catch (e) {
    if (e instanceof UserError || e instanceof ApiError) UI.last = { kind: "err", text: e.message };
    else { console.error(e); UI.last = { kind: "err", text: "Terjadi kendala yang tidak terduga: " + e.message }; }
  } finally { UI.busy = false; render(); }
}

function setProgress(done, total) {
  const bar = $("#prog > div");
  if (bar) { $("#prog").hidden = false; bar.style.width = `${Math.round((100 * done) / Math.max(total, 1))}%`; }
}

const ACTIONS = {
  async "new-run"() {
    const name = $("#run-name").value.trim();
    const method = $("#run-method").value;
    if (!METHODS[method]?.available) return report("warn", "Metode ini belum tersedia di versi aplikasi ini.");
    if (!name) return report("warn", "Isi nama proyek lebih dahulu.");
    const run = createRun(method, name);
    await saveState();
    UI.runId = run.id;
    report("ok", `Sesi analisis #${run.id} untuk "${name}" sudah dibuat. Lanjutkan ke Usulan kode.`);
  },

  async "save-key"() {
    const id = providerId();
    const keyInput = $("#key");
    const key = keyInput ? keyInput.value.trim() : "";
    if (keyInput) keyInput.value = "";
    const model = ($("#model")?.value || "").trim();
    const url = ($("#base-url")?.value || "").trim();
    if (key && (!KEY_PATTERN.test(key) || !NO_QUOTES.test(key))) {
      return report("err", "Kunci tidak dikenali. Salin ulang kunci dari halaman penyedia secara utuh, tanpa spasi atau tanda kutip.");
    }
    if (model && !/^[\w.:/@-]+$/.test(model)) return report("err", "Nama model hanya boleh berisi huruf, angka, titik, titik dua, garis miring, @, dan tanda hubung.");
    if (url && !/^https?:\/\/[^\s"'`]+$/.test(url)) return report("err", "Alamat layanan harus diawali http:// atau https://.");
    SETTINGS.providers = SETTINGS.providers || {};
    const conf = SETTINGS.providers[id] || {};
    if (key) conf.key = key;
    if (model) conf.model = model; else delete conf.model;
    if (url) conf.url = url; else delete conf.url;
    SETTINGS.providers[id] = conf;
    await saveSettings();
    report(aiReady() ? "ok" : "warn", aiReady() ? `Pengaturan ${provider().label} tersimpan.` : `Pengaturan tersimpan, tetapi belum lengkap untuk ${provider().label}.`);
  },
  async "delete-key"() {
    const conf = SETTINGS.providers && SETTINGS.providers[providerId()];
    if (conf) delete conf.key;
    await saveSettings();
    report("ok", `Kunci ${provider().label} dihapus dari peramban ini.`);
  },
  "test-key"() {
    return guarded(async () => {
      const prompt = "Balas hanya dengan satu kata: siap.";
      const response = await callModel(prompt, { stage: "key_check", maxTokens: 32 });
      logCall(null, "key_check", prompt, response);
      await saveState();
      UI.last = { kind: "ok", text: `Kunci berfungsi. Aplikasi siap memanggil ${aiLabel()}.` };
    });
  },

  ingest() {
    // Isian dibaca sebelum guarded() menggambar ulang halaman, karena gambar
    // ulang mengosongkan pilihan berkas.
    const file = $("#file").files[0];
    const opsi = { title: $("#doc-title").value || (file ? file.name.replace(/\.[^.]+$/, "") : ""),
      sourceType: $("#doc-type").value, participantId: $("#doc-pid").value };
    return guarded(async () => {
      if (!file) throw new UserError("Pilih berkas lebih dahulu.");
      const r = await ingestFile(file, opsi);
      UI.last = { kind: "ok", text: `"${r.doc.title}" masuk: ${r.units} unit makna dari ${r.blocks} bagian${r.speakers.length ? `, penutur: ${r.speakers.join(", ")}` : ""}.` };
    });
  },

  "code-one"(el) {
    return guarded(async () => {
      const n = await RTA.codeUnit(UI.runId, byId("units", Number(el.dataset.unit)));
      UI.last = { kind: "ok", text: `${n} usulan kode tersimpan dengan status usulan.` };
    });
  },
  "code-all"() {
    return guarded(async () => {
      const coded = new Set(codesOfRun(UI.runId).map((c) => c.unit_id));
      const pending = S.units.filter((u) => !coded.has(u.id));
      let done = 0, codes = 0;
      const failed = [];
      for (const u of pending) {
        if (UI.cancel) break;
        try { codes += await RTA.codeUnit(UI.runId, u); }
        catch (e) {
          if (e instanceof ApiError && (e.kind === "auth" || e.kind === "network")) throw e;
          failed.push(u.id);
        }
        setProgress(++done, pending.length);
      }
      UI.last = { kind: failed.length ? "warn" : "ok",
        text: `${done} unit diproses, ${codes} usulan kode tersimpan${failed.length ? `, ${failed.length} unit gagal (dapat diulang)` : ""}${UI.cancel ? ". Dihentikan atas permintaan Anda." : "."}` };
    });
  },
  cancel() { UI.cancel = true; toast("Menghentikan setelah unit yang sedang diproses selesai…", "info"); },
  familiarize(el) {
    return guarded(async () => {
      await RTA.familiarization(UI.runId, Number(el.dataset.doc));
      UI.last = { kind: "ok", text: "Memo pembiasaan tersimpan di halaman Memo." };
    });
  },

  "gen-themes"() { return guarded(async () => { const n = await RTA.generateThemes(UI.runId); UI.last = { kind: "ok", text: `${n} tema terbentuk, seluruhnya berstatus usulan. Memo reflektif AI tersimpan di halaman Memo.` }; }); },
  "review-themes"() { return guarded(async () => { const t = await RTA.reviewThemes(UI.runId); UI.last = { kind: "info", text: t }; }); },
  "name-themes"() { return guarded(async () => { const n = await RTA.defineAndName(UI.runId); UI.last = { kind: "ok", text: `${n} tema dinamai dan didefinisikan ulang.` }; }); },

  async review(el) {
    const { type, verdict } = el.dataset; const id = Number(el.dataset.id);
    try {
      await review(type, id, verdict, { newLabel: $(`#label-${type}-${id}`)?.value, note: $(`#note-${type}-${id}`)?.value });
      report("ok", { validated: "Disahkan.", revised: "Direvisi.", rejected: "Ditolak." }[verdict]);
    } catch (e) { report("err", e.message); }
  },

  async "save-memo"() {
    const text = $("#memo").value.trim();
    if (!text) return report("warn", "Memo masih kosong.");
    saveMemo(UI.runId, text, "human");
    await saveState();
    report("ok", "Memo tersimpan.");
  },

  async backup() {
    const stamp = nowIso().slice(0, 10).replace(/-/g, "");
    download(`cadangan-qualitative-analysis-form-${stamp}.json`, backupJson(), "application/json");
    SETTINGS.lastBackupAt = nowIso();
    await saveSettings();
    report("ok", "Cadangan diunduh. Simpan berkasnya di tempat aman.");
  },
  async restore() {
    const file = $("#restore-file").files[0];
    if (!file) return report("warn", "Pilih berkas cadangan lebih dahulu.");
    let restored;
    try { restored = validateBackup(JSON.parse(await file.text())); }
    catch (e) { return report("err", e instanceof UserError ? e.message : "Berkas cadangan tidak dapat dibaca."); }
    if (!confirm("Seluruh data di peramban ini akan diganti dengan isi cadangan. Lanjutkan?")) return;
    S = restored;
    await saveState();
    UI.runId = null;
    report("ok", `Cadangan dipulihkan: ${S.documents.length} dokumen, ${S.codes.length} kode, ${S.memos.length} memo.`);
  },
  csv(el) {
    const t = el.dataset.table;
    if (!S[t].length) return report("warn", "Tabel ini masih kosong.");
    download(`${t}.csv`, toCsv(S[t]), "text/csv;charset=utf-8");
  },
  async wipe() {
    if (!confirm("Hapus SELURUH data penelitian dari peramban ini? Tindakan ini tidak dapat dibatalkan.")) return;
    S = emptyState();
    await saveState();
    UI.runId = null;
    report("ok", "Semua data dihapus dari peramban ini.");
  },
};

document.addEventListener("click", (ev) => {
  const go = ev.target.closest("[data-go]");
  if (go) { ev.preventDefault(); return setPage(go.dataset.go); }
  const act = ev.target.closest("[data-action]");
  if (act && act.tagName === "BUTTON" && ACTIONS[act.dataset.action]) {
    ev.preventDefault();
    ACTIONS[act.dataset.action](act);
  }
});
document.addEventListener("change", (ev) => {
  if (ev.target.dataset.action === "pick-run") { UI.runId = Number(ev.target.value); UI.last = null; render(); }
  if (ev.target.dataset.action === "pick-provider" && PROVIDERS[ev.target.value]) {
    SETTINGS.provider = ev.target.value; UI.last = null;
    saveSettings().then(render);
  }
  if (ev.target.id === "file" && ev.target.files[0] && !$("#doc-title").value) {
    $("#doc-title").value = ev.target.files[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  }
});
window.addEventListener("beforeunload", (ev) => { if (UI.busy) { ev.preventDefault(); ev.returnValue = ""; } });

async function start() {
  try {
    if (!window.indexedDB) throw new Error("IndexedDB tidak tersedia");
    db = await idbOpen();
    S = (await idbGet("state")) || emptyState();
    SETTINGS = (await idbGet("settings")) || {};
    // Migrasi dari versi yang hanya mengenal Anthropic.
    if (SETTINGS.apiKey) {
      SETTINGS.providers = SETTINGS.providers || {};
      SETTINGS.providers.anthropic = { ...(SETTINGS.providers.anthropic || {}), key: SETTINGS.apiKey };
      delete SETTINGS.apiKey;
      await saveSettings();
    }
    for (const t of TABLES) { S[t] = S[t] || []; S.seq[t] = S.seq[t] || 0; }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    render();
  } catch (e) {
    $("#view").innerHTML = `<div class="note err">Peramban ini tidak mengizinkan aplikasi menyimpan data (${esc(e.message)}). Gunakan Chrome, Edge, Firefox, atau Safari versi terbaru, dan jangan gunakan mode penyamaran.</div>`;
  }
}
start();

// Untuk pengujian otomatis: akses baca ke keadaan internal.
window.__agen = { get state() { return S; }, get busy() { return UI.busy; }, segment, extractTranscript };
