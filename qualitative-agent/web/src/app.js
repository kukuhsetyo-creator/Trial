"use strict";
/*
 * Agen Analisis Kualitatif, edisi peramban.
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

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_ATTEMPTS = 4;
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
const KEY_PATTERN = /^[A-Za-z0-9_-]{20,}$/;
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

function apiKey() { return (SETTINGS && SETTINGS.apiKey) || ""; }

async function callClaude(prompt, { stage, runId = null, maxTokens = 2048 }) {
  const key = apiKey();
  if (!key) throw new UserError("Kunci akses Anthropic belum diisi. Isi di halaman Pengaturan.");
  const model = DEFAULT_MODEL;
  let lastError = "", kind = "other", attempts = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
      });
    } catch (e) {
      lastError = `network: ${e.message}`; kind = "network";
      if (attempt < MAX_ATTEMPTS) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
      break;
    }
    if (res.ok) {
      const data = await res.json();
      return {
        text: (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
        model: data.model || model,
        input_tokens: data.usage?.input_tokens, output_tokens: data.usage?.output_tokens,
        stop_reason: data.stop_reason,
      };
    }
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch (e) { detail = res.statusText; }
    lastError = `Error code: ${res.status} - ${detail}`;
    if (res.status === 401 || res.status === 403) { kind = "auth"; break; }
    if (res.status === 429 || res.status >= 500) {
      kind = res.status === 429 ? "rate" : "server";
      if (attempt < MAX_ATTEMPTS) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
      break;
    }
    kind = "request"; break;
  }
  logFailure(runId, stage, prompt, model, lastError, attempts);
  await saveState();
  const pesan = {
    auth: "Kunci ditolak oleh Anthropic. Periksa kunci di halaman Pengaturan.",
    network: "Tidak dapat menghubungi Anthropic. Periksa sambungan internet, lalu coba lagi.",
    rate: "Anthropic sedang membatasi permintaan dari akun ini. Tunggu beberapa menit, lalu coba lagi.",
    server: "Layanan Anthropic sedang bermasalah. Coba lagi beberapa saat lagi.",
  }[kind] || "Permintaan ke Anthropic gagal. Rinciannya tercatat di halaman Audit.";
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
    const response = await callClaude(prompt, { stage: "open_coding", runId });
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
    const response = await callClaude(prompt, { stage: "theme_generation", runId, maxTokens: 4096 });
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
    const response = await callClaude(prompt, { stage: "theme_review", runId, maxTokens: 4096 });
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
      const response = await callClaude(prompt, { stage: "theme_definition_naming", runId });
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
    const response = await callClaude(prompt, { stage: "reflexive_memo", runId });
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
  if (!data || data.format !== BACKUP_FORMAT) throw new UserError("Berkas ini bukan cadangan Agen Analisis Kualitatif.");
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
const keyWarning = () => (apiKey() ? "" : `<div class="note warn">Kunci akses Anthropic belum diisi, sehingga AI belum dapat dipanggil. <a href="#" data-go="settings">Isi di Pengaturan</a>.</div>`);
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
        <p>Semua data penelitian tersimpan di peramban ini. Hanya potongan teks yang Anda minta untuk dianalisis yang dikirim ke AI Anthropic, dan setiap pengiriman tercatat di halaman Audit.</p>
        <ol class="steps">
          <li>Isi kunci akses di <a href="#" data-go="settings">Pengaturan</a>.</li>
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
    return `
      <h2>Pengaturan</h2>${lastMessage()}
      <div class="card">
        <h3 style="margin-top:0">Kunci akses Anthropic</h3>
        <p>Aplikasi memanggil AI milik Anthropic untuk mengusulkan kode dan tema. Buat kunci di <b>platform.claude.com</b>: masuk, buka bagian <i>API Keys</i>, buat kunci baru, lalu tempel di bawah. Pemakaian AI ditagihkan ke akun Anthropic Anda.</p>
        <p class="muted">Kunci disimpan hanya di peramban ini, tidak pernah ditampilkan ulang, tidak dicatat di audit, dan tidak ikut dalam berkas cadangan. Siapa pun yang memakai akun komputer dan peramban ini dapat memakai kunci tersebut; hapus kunci bila komputer dipakai bersama.</p>
        ${apiKey() ? `<div class="note ok">Kunci akses sudah tersimpan.</div>` : `<div class="note warn">Kunci akses belum diisi.</div>`}
        <label for="key">Tempel kunci akses di sini</label>
        <input type="password" id="key" placeholder="sk-ant-..." autocomplete="off">
        <div class="actions">
          <button class="btn primary" data-action="save-key">Simpan kunci</button>
          <button class="btn" data-action="test-key" ${apiKey() ? "" : "disabled"}>Uji kunci</button>
          <button class="btn danger" data-action="delete-key" ${apiKey() ? "" : "disabled"}>Hapus kunci</button>
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
          <button class="btn primary" data-action="code-all" ${!apiKey() || UI.busy || !pending.length ? "disabled" : ""}>Usulkan kode untuk ${pending.length} unit yang belum dikode</button>
          <button class="btn" data-action="cancel" ${UI.busy ? "" : "hidden"}>Hentikan</button>
        </div>
      </div>
      ${S.documents.map((d) => {
        const du = units.filter((u) => u.document_id === d.id).sort((a, b) => a.sequence_index - b.sequence_index);
        return `<details class="card"><summary><b>${esc(d.title)}</b> · ${du.length} unit</summary>
          <div class="actions"><button class="btn" data-action="familiarize" data-doc="${d.id}" ${!apiKey() || UI.busy ? "disabled" : ""}>Buat memo pembiasaan untuk dokumen ini</button></div>
          ${du.map((u) => {
            const codes = S.codes.filter((c) => c.unit_id === u.id && c.method_run_id === runId);
            return `<div style="margin:12px 0"><blockquote>${u.speaker ? `<b>${esc(u.speaker)}:</b> ` : ""}${esc(u.text)}</blockquote>
              ${codes.map((c) => `<div>${chip(c.status)} <b>${esc(c.label)}</b> <span class="muted">${esc(c.justification || "")}</span></div>`).join("")}
              <button class="btn" data-action="code-one" data-unit="${u.id}" ${!apiKey() || UI.busy ? "disabled" : ""}>${codes.length ? "Minta usulan tambahan" : "Usulkan kode"}</button></div>`;
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
    const dis = !apiKey() || UI.busy ? "disabled" : "";
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
    const input = $("#key");
    const key = input.value.trim();
    input.value = "";
    if (!KEY_PATTERN.test(key)) return report("err", "Kunci tidak dikenali. Salin ulang kunci dari halaman Anthropic secara utuh, tanpa spasi atau tanda kutip.");
    SETTINGS.apiKey = key;
    await saveSettings();
    report("ok", "Kunci tersimpan.");
  },
  async "delete-key"() {
    delete SETTINGS.apiKey;
    await saveSettings();
    report("ok", "Kunci dihapus dari peramban ini.");
  },
  "test-key"() {
    return guarded(async () => {
      const prompt = "Balas hanya dengan satu kata: siap.";
      const response = await callClaude(prompt, { stage: "key_check", maxTokens: 32 });
      logCall(null, "key_check", prompt, response);
      await saveState();
      UI.last = { kind: "ok", text: "Kunci berfungsi. Aplikasi siap memanggil AI." };
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
    download(`cadangan-agen-kualitatif-${stamp}.json`, backupJson(), "application/json");
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
