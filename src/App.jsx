/**
 * AI Grader Sistem
 * Aplikasi koreksi Lembar Jawaban Komputer (LJK) otomatis untuk instrumen
 * psikologis dan tes inteligensi, berbasis Google Gemini Vision API.
 *
 * Arsitektur: client-side murni (tanpa backend). Seluruh pemrosesan citra,
 * penilaian, analisis butir, dan pembuatan laporan berlangsung di peramban.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  Eraser,
  Eye,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Info,
  KeyRound,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  Pencil,
  Play,
  Printer,
  ScanLine,
  Search,
  Settings2,
  Sigma,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  Users,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/* ------------------------------------------------------------------ *
 * 1. KONSTANTA DOMAIN
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'ai-grader-sistem:v1';
const API_KEY_STORAGE = 'ai-grader-sistem:gemini-key';

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — cepat, hemat kuota' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — presisi tertinggi' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — alternatif stabil' },
];

const OPTION_PRESETS = ['ABCD', 'ABCDE'];

const INSTRUMENT_TYPES = [
  'Tes Inteligensi (IQ)',
  'Tes Potensi Akademik',
  'Skala Psikologi',
  'Tes Prestasi Belajar',
  'Lainnya',
];

/**
 * Klasifikasi skor deviasi (M = 100, SD = 15) mengikuti konvensi Wechsler.
 * Batas kelas bersifat konvensional, bukan kategori diagnostik.
 */
const IQ_CLASSES = [
  { min: 130, label: 'Sangat Superior', tone: 'bg-indigo-100 text-indigo-800' },
  { min: 120, label: 'Superior', tone: 'bg-sky-100 text-sky-800' },
  { min: 110, label: 'Di Atas Rata-rata', tone: 'bg-emerald-100 text-emerald-800' },
  { min: 90, label: 'Rata-rata', tone: 'bg-slate-100 text-slate-700' },
  { min: 80, label: 'Di Bawah Rata-rata', tone: 'bg-amber-100 text-amber-800' },
  { min: 70, label: 'Batas Ambang', tone: 'bg-orange-100 text-orange-800' },
  { min: -Infinity, label: 'Sangat Rendah', tone: 'bg-rose-100 text-rose-800' },
];

const DEFAULT_CONFIG = {
  institution: 'Universitas Negeri Malang',
  unit: 'Fakultas Psikologi — Laboratorium Psikodiagnostika',
  address: 'Jl. Semarang No. 5, Malang, Jawa Timur 65145',
  testName: 'Tes Inteligensi Kolektif',
  instrumentType: 'Tes Inteligensi (IQ)',
  examiner: '',
  testDate: new Date().toISOString().slice(0, 10),
  numQuestions: 30,
  optionSet: 'ABCDE',
  penalty: false,
  scaleMax: 100,
  passingScore: 60,
  model: 'gemini-2.5-flash',
  normMode: 'sample', // 'sample' | 'manual'
  normMean: 15,
  normSd: 5,
  showDetailPages: true,
};

/* ------------------------------------------------------------------ *
 * 2. UTILITAS UMUM
 * ------------------------------------------------------------------ */

const cx = (...parts) => parts.filter(Boolean).join(' ');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const fmt = (value, digits = 2) =>
  Number.isFinite(value) ? Number(value).toFixed(digits) : '—';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function todayLong(iso) {
  const date = iso ? new Date(`${iso}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return iso || '—';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function slugify(text) {
  return String(text || 'laporan')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Berkas gagal dibaca.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Citra tidak dapat dimuat.'));
    image.src = src;
  });
}

function drawToDataUrl(image, maxDim, quality) {
  const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Menormalkan citra LJK sebelum dikirim ke API: resolusi dibatasi agar
 * muatan permintaan tetap ringan tanpa mengorbankan keterbacaan bulatan.
 */
async function prepareImage(file) {
  const original = await fileToDataUrl(file);
  const image = await loadImageElement(original);
  return {
    full: drawToDataUrl(image, 1600, 0.9),
    thumb: drawToDataUrl(image, 220, 0.7),
    width: image.width,
    height: image.height,
  };
}

const stripBase64 = (dataUrl) => String(dataUrl || '').split(',')[1] || '';

/* ------------------------------------------------------------------ *
 * 3. LAPISAN VISI: PROMPT, PEMANGGILAN API, DAN PARSING
 * ------------------------------------------------------------------ */

/**
 * Prompt disusun deterministik: satu tugas, satu format keluaran, tanpa ruang
 * bagi model untuk menambahkan narasi. Instruksi eksplisit mengenai dua bentuk
 * penandaan (silang dan bulatan dihitamkan) menekan kesalahan klasifikasi
 * penanda yang lazim terjadi pada lembar jawaban hasil pemindaian ponsel.
 */
function buildVisionPrompt(numQuestions, optionSet) {
  const options = optionSet.split('').join('/');
  return [
    `Analisis gambar LJK ini, deteksi nama siswa dan jawaban pilihan ganda nomor 1 sampai ${numQuestions}.`,
    '',
    'Aturan pembacaan:',
    `1. Pilihan jawaban yang sah hanya ${options}.`,
    '2. Jawaban dapat ditandai dengan silang (X) pada huruf/kotak, atau dengan bulatan yang dihitamkan penuh (●). Perlakukan keduanya sebagai penandaan yang setara.',
    '3. Jika satu nomor tidak ditandai, ditandai lebih dari satu, atau penandaannya ragu/terhapus, isi "ans" dengan null.',
    '4. Baca nomor butir sesuai label yang tercetak pada lembar, bukan urutan visual kolom. Lembar dapat tersusun dalam beberapa kolom.',
    '5. Nama siswa diambil dari kolom identitas di bagian atas lembar, tulis dalam HURUF KAPITAL tanpa gelar. Jika tidak terbaca, isi dengan "TIDAK TERBACA".',
    '6. Jangan menebak, jangan melengkapi nomor yang tidak ada pada lembar.',
    '',
    'Outputkan JSON murni tanpa penjelasan, tanpa markdown, tanpa blok kode:',
    '{',
    '  "name": "NAMA SISWA",',
    '  "answers": [',
    '    { "no": 1, "ans": "A" },',
    '    { "no": 2, "ans": "B" }',
    '  ]',
    '}',
  ].join('\n');
}

class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

function describeHttpError(status, payload) {
  const apiMessage = payload?.error?.message;
  if (status === 400 && /API key not valid/i.test(apiMessage || '')) {
    return 'API key Gemini tidak valid. Periksa kembali kunci pada panel Konfigurasi.';
  }
  if (status === 403) {
    return 'Akses ditolak (403). Pastikan Generative Language API telah diaktifkan untuk kunci tersebut.';
  }
  if (status === 429) {
    return 'Kuota permintaan terlampaui (429). Turunkan kecepatan pemrosesan atau tunggu beberapa saat.';
  }
  if (status >= 500) {
    return `Layanan Gemini sedang bermasalah (${status}). Coba ulangi beberapa saat lagi.`;
  }
  return apiMessage || `Permintaan gagal dengan status ${status}.`;
}

async function requestGemini({ apiKey, model, prompt, base64, mimeType, signal }) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      topP: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }
    throw new GeminiError(describeHttpError(response.status, payload), response.status);
  }

  const payload = await response.json();
  const blocked = payload?.promptFeedback?.blockReason;
  if (blocked) {
    throw new GeminiError(`Permintaan diblokir oleh filter keamanan (${blocked}).`);
  }

  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!text) throw new GeminiError('Model tidak mengembalikan teks apa pun.');
  return text;
}

/** Pemanggilan dengan backoff eksponensial untuk galat transien (429/5xx). */
async function requestGeminiWithRetry(params, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestGemini(params);
    } catch (error) {
      lastError = error;
      const transient = error instanceof GeminiError && (error.status === 429 || error.status >= 500);
      if (!transient || attempt === attempts - 1) throw error;
      await sleep(1200 * 2 ** attempt);
    }
  }
  throw lastError;
}

/**
 * Model kadang membungkus JSON dalam blok kode atau memakai kutip tunggal.
 * Ekstraksi dilakukan berlapis agar kegagalan parsing tidak membatalkan
 * seluruh berkas dalam satu antrean pemrosesan.
 */
function extractJsonObject(text) {
  let candidate = String(text || '').trim();
  candidate = candidate.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    candidate = candidate.slice(start, end + 1);
  }

  try {
    return JSON.parse(candidate);
  } catch (error) {
    const repaired = candidate
      .replace(/'/g, '"')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\bNone\b/g, 'null')
      .replace(/\b(True|False)\b/g, (match) => match.toLowerCase());
    return JSON.parse(repaired);
  }
}

function normalizeAnswerToken(value, optionSet) {
  if (value === null || value === undefined) return null;
  const token = String(value).trim().toUpperCase();
  if (!token || ['-', 'NULL', 'NONE', 'KOSONG', 'TIDAK', 'N/A'].includes(token)) return null;
  const letter = token[0];
  return optionSet.includes(letter) ? letter : null;
}

/** Mengubah keluaran model menjadi larik jawaban berindeks 0..n-1. */
function normalizeVisionResult(parsed, numQuestions, optionSet) {
  const answers = new Array(numQuestions).fill(null);
  const raw = parsed?.answers ?? parsed?.jawaban ?? [];

  if (Array.isArray(raw)) {
    raw.forEach((entry, index) => {
      if (entry && typeof entry === 'object') {
        const no = Number(entry.no ?? entry.nomor ?? entry.number ?? index + 1);
        if (Number.isInteger(no) && no >= 1 && no <= numQuestions) {
          answers[no - 1] = normalizeAnswerToken(entry.ans ?? entry.answer ?? entry.jawaban, optionSet);
        }
      } else if (index < numQuestions) {
        answers[index] = normalizeAnswerToken(entry, optionSet);
      }
    });
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([key, value]) => {
      const no = Number(key);
      if (Number.isInteger(no) && no >= 1 && no <= numQuestions) {
        answers[no - 1] = normalizeAnswerToken(value, optionSet);
      }
    });
  } else if (typeof raw === 'string') {
    raw
      .replace(/[^A-Za-z-]/g, '')
      .split('')
      .slice(0, numQuestions)
      .forEach((letter, index) => {
        answers[index] = normalizeAnswerToken(letter, optionSet);
      });
  }

  const name = String(parsed?.name ?? parsed?.nama ?? '').trim().toUpperCase() || 'TIDAK TERBACA';
  return { name, answers };
}

/* ------------------------------------------------------------------ *
 * 4. LAPISAN PSIKOMETRI: PENYEKORAN, NORMA, DAN ANALISIS BUTIR
 * ------------------------------------------------------------------ */

function gradeSheet(sheet, answerKey, config) {
  const { numQuestions, optionSet, penalty, scaleMax } = config;
  const items = [];
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  let scored = 0;

  for (let index = 0; index < numQuestions; index += 1) {
    const response = sheet.answers?.[index] ?? null;
    const key = answerKey[index] || null;
    let status = 'nokey';

    if (!key) {
      status = 'nokey';
    } else {
      scored += 1;
      if (!response) {
        blank += 1;
        status = 'blank';
      } else if (response === key) {
        correct += 1;
        status = 'correct';
      } else {
        wrong += 1;
        status = 'wrong';
      }
    }
    items.push({ no: index + 1, response, key, status });
  }

  const distractors = Math.max(1, optionSet.length - 1);
  const rawScore = penalty ? correct - wrong / distractors : correct;
  const scale = scored > 0 ? (Math.max(0, rawScore) / scored) * scaleMax : 0;

  return {
    ...sheet,
    items,
    correct,
    wrong,
    blank,
    scoredItems: scored,
    rawScore,
    scaledScore: scale,
  };
}

function descriptiveStats(values) {
  const list = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  const n = list.length;
  if (!n) return { n: 0, mean: NaN, sd: NaN, min: NaN, max: NaN, median: NaN, range: NaN };

  const mean = list.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1 ? list.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  const median = n % 2 ? list[(n - 1) / 2] : (list[n / 2 - 1] + list[n / 2]) / 2;

  return {
    n,
    mean,
    sd: Math.sqrt(variance),
    min: list[0],
    max: list[n - 1],
    median,
    range: list[n - 1] - list[0],
  };
}

/** Aproksimasi fungsi galat untuk konversi z ke persentil (Abramowitz-Stegun). */
function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function classifyDeviationScore(score) {
  return IQ_CLASSES.find((entry) => score >= entry.min) || IQ_CLASSES[IQ_CLASSES.length - 1];
}

/**
 * Konversi skor mentah menjadi skor deviasi (M = 100, SD = 15). Basis norma
 * dapat bersumber dari sampel yang sedang dikoreksi (norma lokal, ad hoc) atau
 * dari parameter normatif yang dimasukkan manual oleh pemeriksa.
 */
function applyNorms(rows, config) {
  const rawScores = rows.map((row) => row.rawScore);
  const sample = descriptiveStats(rawScores);

  const useManual = config.normMode === 'manual';
  const mean = useManual ? Number(config.normMean) : sample.mean;
  const sdRaw = useManual ? Number(config.normSd) : sample.sd;
  const sd = Number.isFinite(sdRaw) && sdRaw > 0 ? sdRaw : NaN;

  const normed = rows.map((row) => {
    const z = Number.isFinite(sd) ? (row.rawScore - mean) / sd : NaN;
    const deviationIq = Number.isFinite(z) ? 100 + 15 * z : NaN;
    const tScore = Number.isFinite(z) ? 50 + 10 * z : NaN;
    const percentile = Number.isFinite(z) ? clamp(normalCdf(z) * 100, 0.1, 99.9) : NaN;
    return {
      ...row,
      zScore: z,
      deviationIq,
      tScore,
      percentile,
      classification: Number.isFinite(deviationIq) ? classifyDeviationScore(deviationIq) : null,
    };
  });

  return { rows: normed, sample, basis: { mean, sd, mode: config.normMode } };
}

/**
 * Analisis butir klasikal: indeks kesukaran (p), daya beda (D) berbasis
 * kelompok 27% atas dan bawah, serta korelasi point-biserial. Estimasi menjadi
 * tidak stabil pada n kecil, sehingga hasilnya disertai penanda kecukupan.
 */
function analyzeItems(rows, answerKey, config) {
  const n = rows.length;
  const numQuestions = config.numQuestions;
  const empty = { items: [], kr20: NaN, groupSize: 0, n: 0 };
  if (!n) return empty;

  const ordered = rows.slice().sort((a, b) => b.rawScore - a.rawScore);
  const groupSize = Math.max(1, Math.round(n * 0.27));
  const upper = ordered.slice(0, groupSize);
  const lower = ordered.slice(-groupSize);

  const totals = rows.map((row) => row.correct);
  const totalStats = descriptiveStats(totals);

  const items = [];
  let sumPQ = 0;

  for (let index = 0; index < numQuestions; index += 1) {
    const key = answerKey[index] || null;
    const isCorrect = (row) => Boolean(key) && row.items[index]?.status === 'correct';

    const correctCount = rows.filter(isCorrect).length;
    const p = key ? correctCount / n : NaN;
    const q = 1 - p;
    if (key && Number.isFinite(p)) sumPQ += p * q;

    const pUpper = key ? upper.filter(isCorrect).length / groupSize : NaN;
    const pLower = key ? lower.filter(isCorrect).length / groupSize : NaN;
    const discrimination = Number.isFinite(pUpper) && Number.isFinite(pLower) ? pUpper - pLower : NaN;

    let pointBiserial = NaN;
    if (key && Number.isFinite(totalStats.sd) && totalStats.sd > 0 && p > 0 && p < 1) {
      const meanCorrect =
        rows.filter(isCorrect).reduce((sum, row) => sum + row.correct, 0) / correctCount;
      pointBiserial = ((meanCorrect - totalStats.mean) / totalStats.sd) * Math.sqrt(p / q);
    }

    const distribution = {};
    config.optionSet.split('').forEach((letter) => {
      distribution[letter] = rows.filter((row) => row.items[index]?.response === letter).length;
    });
    distribution.kosong = rows.filter((row) => !row.items[index]?.response).length;

    items.push({
      no: index + 1,
      key,
      p,
      discrimination,
      pointBiserial,
      distribution,
      verdict: verdictForItem(p, discrimination),
    });
  }

  const k = answerKey.filter(Boolean).length;
  const varianceTotal = totalStats.sd ** 2;
  const kr20 =
    k > 1 && Number.isFinite(varianceTotal) && varianceTotal > 0
      ? (k / (k - 1)) * (1 - sumPQ / varianceTotal)
      : NaN;

  return { items, kr20, groupSize, n };
}

function verdictForItem(p, discrimination) {
  if (!Number.isFinite(p)) return { label: 'Tanpa kunci', tone: 'bg-slate-100 text-slate-600' };
  if (Number.isFinite(discrimination) && discrimination < 0.2) {
    return { label: 'Revisi', tone: 'bg-rose-100 text-rose-700' };
  }
  if (p < 0.2 || p > 0.9) {
    return { label: 'Tinjau', tone: 'bg-amber-100 text-amber-800' };
  }
  return { label: 'Layak', tone: 'bg-emerald-100 text-emerald-700' };
}

function interpretReliability(kr20) {
  if (!Number.isFinite(kr20)) return 'belum dapat diestimasi';
  if (kr20 >= 0.9) return 'sangat tinggi';
  if (kr20 >= 0.8) return 'tinggi';
  if (kr20 >= 0.7) return 'memadai untuk keputusan kelompok';
  if (kr20 >= 0.6) return 'marginal';
  return 'rendah';
}

/* ------------------------------------------------------------------ *
 * 5. EKSPOR: PDF (html2canvas + jsPDF) DAN CSV
 * ------------------------------------------------------------------ */

async function exportElementToPdf(element, filename, orientation = 'portrait') {
  if (!element) throw new Error('Elemen laporan belum siap dirender.');

  const canvas = await html2canvas(element, {
    scale: window.devicePixelRatio > 1 ? 2 : 1.6,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  const image = canvas.toDataURL('image/jpeg', 0.94);

  let heightLeft = imageHeight;
  let position = 0;

  pdf.addImage(image, 'JPEG', 0, position, imageWidth, imageHeight, undefined, 'FAST');
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(image, 'JPEG', 0, position, imageWidth, imageHeight, undefined, 'FAST');
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}

function downloadCsv(rows, config, filename) {
  const header = [
    'No',
    'Nama',
    'Benar',
    'Salah',
    'Kosong',
    'Skor Mentah',
    `Nilai (0-${config.scaleMax})`,
    'Z',
    'T',
    'Skor Deviasi',
    'Persentil',
    'Klasifikasi',
    'Pola Jawaban',
  ];

  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const body = rows.map((row, index) =>
    [
      index + 1,
      row.name,
      row.correct,
      row.wrong,
      row.blank,
      fmt(row.rawScore, 2),
      fmt(row.scaledScore, 1),
      fmt(row.zScore, 2),
      fmt(row.tScore, 1),
      fmt(row.deviationIq, 0),
      fmt(row.percentile, 1),
      row.classification?.label || '—',
      row.items.map((item) => item.response || '-').join(''),
    ]
      .map(escape)
      .join(','),
  );

  const csv = '﻿' + [header.map(escape).join(','), ...body].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ *
 * 6. KOMPONEN PRIMITIF ANTARMUKA
 * ------------------------------------------------------------------ */

function Button({ variant = 'primary', size = 'md', icon: Icon, children, className, ...rest }) {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-600 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600 shadow-sm',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600 shadow-sm',
  };
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3.5 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-sm gap-2',
  };

  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function Card({ title, description, icon: Icon, actions, children, className }) {
  return (
    <section className={cx('rounded-2xl border border-slate-200 bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {Icon ? (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            ) : null}
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
              {description ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] leading-relaxed text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100';

function TextInput(props) {
  return <input className={cx(inputClass, props.className)} {...props} />;
}

function SelectInput({ children, className, ...rest }) {
  return (
    <div className="relative">
      <select className={cx(inputClass, 'appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50"
    >
      <span
        className={cx(
          'mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-indigo-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cx(
            'h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </span>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{hint}</span> : null}
      </span>
    </button>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function Banner({ tone = 'info', icon: Icon = Info, title, children }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={cx('flex gap-3 rounded-xl border p-3.5', tones[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="text-xs leading-relaxed">
        {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 7. TEMPLATE LJK 3 KOLOM (SIAP CETAK)
 * ------------------------------------------------------------------ */

function IdentityBox({ label, width = 'flex-1' }) {
  return (
    <div className={cx('flex items-end gap-2', width)}>
      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-black">{label}</span>
      <span className="h-[18px] flex-1 border-b border-dotted border-black" />
    </div>
  );
}

function BubbleRow({ no, optionSet }) {
  return (
    <div className="flex items-center gap-2 py-[3.5px]">
      <span className="w-7 shrink-0 text-right text-[10px] font-bold tabular-nums text-black">{no}.</span>
      <div className="flex gap-[7px]">
        {optionSet.split('').map((letter) => (
          <span
            key={letter}
            className="flex h-[17px] w-[17px] items-center justify-center rounded-full border border-black text-[8px] font-semibold leading-none text-black"
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}

function CornerMarks() {
  return (
    <>
      <span className="absolute left-6 top-6 h-3.5 w-3.5 bg-black" />
      <span className="absolute right-6 top-6 h-3.5 w-3.5 bg-black" />
      <span className="absolute bottom-6 left-6 h-3.5 w-3.5 bg-black" />
      <span className="absolute bottom-6 right-6 h-3.5 w-3.5 bg-black" />
    </>
  );
}

/**
 * Lembar jawaban dirancang dengan tiga kolom, penomoran mengalir ke bawah pada
 * setiap kolom, disertai penanda sudut sebagai acuan orientasi saat pemindaian
 * dilakukan dengan kamera ponsel.
 */
function AnswerSheetTemplate({ config, rowsPerColumn, innerRef }) {
  const { numQuestions, optionSet } = config;
  const perPage = rowsPerColumn * 3;
  const pageCount = Math.max(1, Math.ceil(numQuestions / perPage));
  const pages = Array.from({ length: pageCount }, (_, page) => page);

  return (
    <div ref={innerRef} className="print-area space-y-6">
      {pages.map((page) => {
        const start = page * perPage;
        const onThisPage = Math.min(perPage, numQuestions - start);
        // Kolom diseimbangkan agar butir tersebar merata, bukan menumpuk di kolom pertama.
        const rowsHere = Math.ceil(onThisPage / 3);
        const columns = [0, 1, 2].map((col) =>
          Array.from({ length: rowsHere }, (_, row) => start + col * rowsHere + row + 1).filter(
            (no) => no <= start + onThisPage,
          ),
        );

        return (
          <div
            key={page}
            className={cx(
              'a4-canvas relative mx-auto border border-slate-300 px-10 py-9 font-sans text-black',
              page < pageCount - 1 && 'print-break',
            )}
          >
            <CornerMarks />

            <header className="border-b-2 border-black pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[13px] font-extrabold uppercase leading-tight tracking-wide">
                    {config.institution || 'Nama Institusi'}
                  </p>
                  <p className="text-[10px] leading-tight">{config.unit}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-bold uppercase">Lembar Jawaban Komputer</p>
                  <p className="text-[10px]">
                    Halaman {page + 1} dari {pageCount}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide">
                {config.testName} — {config.instrumentType}
              </p>
            </header>

            {page === 0 ? (
              <>
                <div className="mt-4 space-y-2.5 rounded border border-black px-4 py-3">
                  <div className="flex gap-6">
                    <IdentityBox label="Nama" />
                    <IdentityBox label="No. Peserta" width="w-52" />
                  </div>
                  <div className="flex gap-6">
                    <IdentityBox label="Kelas / Unit" />
                    <IdentityBox label="Tanggal" width="w-52" />
                  </div>
                </div>

                <div className="mt-3 rounded border border-black bg-slate-50 px-4 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide">Petunjuk Pengisian</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[9.5px] leading-relaxed">
                    <li>Tulis nama dengan HURUF KAPITAL yang jelas pada kolom identitas.</li>
                    <li>Gunakan pensil 2B atau pulpen hitam. Jangan gunakan tipp-ex.</li>
                    <li>
                      Tandai jawaban dengan menghitamkan bulatan penuh (●) atau memberi tanda silang (X) pada satu
                      pilihan saja.
                    </li>
                    <li>Jawaban ganda, ragu, atau terhapus tidak akan dinilai.</li>
                    <li>Jaga lembar tetap rata dan bersih agar terbaca oleh sistem koreksi otomatis.</li>
                  </ol>
                </div>
              </>
            ) : (
              <div className="mt-4 flex gap-6 rounded border border-black px-4 py-2">
                <IdentityBox label="Nama" />
                <IdentityBox label="No. Peserta" width="w-52" />
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-4">
              {columns.map((column, index) => (
                <div key={index} className="rounded border border-black px-2.5 py-2">
                  {column.length ? (
                    column.map((no) => <BubbleRow key={no} no={no} optionSet={optionSet} />)
                  ) : (
                    <div className="py-2 text-center text-[9px] text-slate-400">—</div>
                  )}
                </div>
              ))}
            </div>

            <footer className="absolute inset-x-10 bottom-10 flex items-end justify-between border-t border-black pt-2 text-[9px]">
              <span>Jumlah butir: {numQuestions} — Opsi: {optionSet.split('').join('/')}</span>
              <span className="text-right">
                Paraf Pengawas
                <span className="mt-4 block h-[1px] w-28 bg-black" />
              </span>
            </footer>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 8. DOKUMEN LAPORAN RESMI (SUMBER RENDER PDF)
 * ------------------------------------------------------------------ */

function ReportMetaRow({ label, value }) {
  return (
    <div className="flex gap-2 text-[10.5px] leading-relaxed">
      <span className="w-32 shrink-0 font-semibold text-black">{label}</span>
      <span className="text-black">: {value}</span>
    </div>
  );
}

function ReportDocument({ config, rows, sample, basis, itemStats, logo, innerRef }) {
  const scaled = descriptiveStats(rows.map((row) => row.scaledScore));
  const passed = rows.filter((row) => row.scaledScore >= config.passingScore).length;
  const distribution = IQ_CLASSES.map((entry) => ({
    label: entry.label,
    count: rows.filter((row) => row.classification?.label === entry.label).length,
  })).filter((entry) => entry.count > 0);

  const reliabilitySentence = Number.isFinite(itemStats.kr20)
    ? `Estimasi konsistensi internal melalui KR-20 sebesar ${fmt(itemStats.kr20, 3)} tergolong ${interpretReliability(
        itemStats.kr20,
      )} pada sampel berukuran ${rows.length} peserta`
    : `Koefisien konsistensi internal KR-20 belum dapat diestimasi karena variansi skor total pada sampel berukuran ${rows.length} peserta belum memadai`;

  const normSentence =
    basis.mode === 'manual'
      ? `parameter normatif yang ditetapkan pemeriksa (M = ${fmt(basis.mean, 2)}; SD = ${fmt(basis.sd, 2)})`
      : `norma lokal yang diturunkan dari sampel pemeriksaan ini (M = ${fmt(basis.mean, 2)}; SD = ${fmt(basis.sd, 2)})`;

  return (
    <div ref={innerRef} className="print-area a4-canvas mx-auto border border-slate-300 px-11 py-10 font-serif text-black">
      <header className="flex items-center gap-4 border-b-[3px] border-double border-black pb-3">
        {logo ? (
          <img src={logo} alt="" className="h-16 w-16 object-contain" crossOrigin="anonymous" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-black text-[9px] font-bold uppercase leading-tight">
            Logo
          </span>
        )}
        <div className="flex-1 text-center">
          <p className="text-[15px] font-extrabold uppercase leading-tight tracking-wide">
            {config.institution || 'Nama Institusi'}
          </p>
          <p className="text-[11px] font-semibold leading-tight">{config.unit}</p>
          <p className="text-[9.5px] leading-tight">{config.address}</p>
        </div>
        <span className="h-16 w-16" />
      </header>

      <h1 className="mt-5 text-center text-[13px] font-bold uppercase tracking-wide underline underline-offset-4">
        Laporan Hasil Pemeriksaan Psikometrik
      </h1>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1">
        <ReportMetaRow label="Nama Instrumen" value={config.testName} />
        <ReportMetaRow label="Jenis Instrumen" value={config.instrumentType} />
        <ReportMetaRow label="Tanggal Administrasi" value={todayLong(config.testDate)} />
        <ReportMetaRow label="Jumlah Butir" value={`${config.numQuestions} butir (opsi ${config.optionSet.split('').join('/')})`} />
        <ReportMetaRow label="Jumlah Peserta" value={`${rows.length} orang`} />
        <ReportMetaRow label="Pemeriksa" value={config.examiner || '—'} />
        <ReportMetaRow
          label="Metode Penyekoran"
          value={config.penalty ? 'Terkoreksi tebakan (formula scoring)' : 'Jumlah jawaban benar (number right)'}
        />
        <ReportMetaRow label="Basis Norma" value={basis.mode === 'manual' ? 'Normatif manual' : 'Norma lokal sampel'} />
      </div>

      <h2 className="mt-5 border-b border-black pb-1 text-[11px] font-bold uppercase tracking-wide">
        A. Statistik Deskriptif
      </h2>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        {[
          ['Rerata Nilai', fmt(scaled.mean, 2)],
          ['Simpangan Baku', fmt(scaled.sd, 2)],
          ['Nilai Terendah', fmt(scaled.min, 1)],
          ['Nilai Tertinggi', fmt(scaled.max, 1)],
          ['Median', fmt(scaled.median, 2)],
          ['Rentang', fmt(scaled.range, 1)],
          ['Mencapai KKM', `${passed}/${rows.length}`],
          ['Reliabilitas (KR-20)', fmt(itemStats.kr20, 3)],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-black px-2 py-1.5">
            <p className="text-[8.5px] font-semibold uppercase leading-tight">{label}</p>
            <p className="mt-0.5 text-[12px] font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-5 border-b border-black pb-1 text-[11px] font-bold uppercase tracking-wide">
        B. Rekapitulasi Nilai Peserta
      </h2>
      <table className="mt-2 w-full border-collapse text-[9.5px]">
        <thead>
          <tr className="bg-slate-200">
            {['No', 'Nama Peserta', 'B', 'S', 'K', 'Skor', 'Nilai', 'Z', 'T', 'Skor Deviasi', 'Persentil', 'Klasifikasi'].map(
              (head) => (
                <th key={head} className="border border-black px-1 py-1 text-center font-bold">
                  {head}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td className="border border-black px-1 py-[3px] text-center tabular-nums">{index + 1}</td>
              <td className="border border-black px-1.5 py-[3px] text-left">{row.name}</td>
              <td className="border border-black px-1 py-[3px] text-center tabular-nums">{row.correct}</td>
              <td className="border border-black px-1 py-[3px] text-center tabular-nums">{row.wrong}</td>
              <td className="border border-black px-1 py-[3px] text-center tabular-nums">{row.blank}</td>
              <td className="border border-black px-1 py-[3px] text-center tabular-nums">{fmt(row.rawScore, 1)}</td>
              <td className="border border-black px-1 py-[3px] text-center font-bold tabular-nums">
                {fmt(row.scaledScore, 1)}
              </td>
              <td className="border border-black px-1 py-[3px] text-center tabular-nums">{fmt(row.zScore, 2)}</td>
              <td className="border border-black px-1 py-[3px] text-center tabular-nums">{fmt(row.tScore, 1)}</td>
              <td className="border border-black px-1 py-[3px] text-center tabular-nums">{fmt(row.deviationIq, 0)}</td>
              <td className="border border-black px-1 py-[3px] text-center tabular-nums">{fmt(row.percentile, 1)}</td>
              <td className="border border-black px-1 py-[3px] text-center">{row.classification?.label || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[8.5px] italic">
        Keterangan: B = benar, S = salah, K = kosong. Skor deviasi dinyatakan pada skala M = 100 dan SD = 15.
      </p>

      {distribution.length ? (
        <>
          <h2 className="mt-5 border-b border-black pb-1 text-[11px] font-bold uppercase tracking-wide">
            C. Sebaran Klasifikasi
          </h2>
          <table className="mt-2 w-full border-collapse text-[9.5px]">
            <thead>
              <tr className="bg-slate-200">
                <th className="border border-black px-2 py-1 text-left font-bold">Kategori</th>
                <th className="border border-black px-2 py-1 text-center font-bold">Frekuensi</th>
                <th className="border border-black px-2 py-1 text-center font-bold">Persentase</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map((entry) => (
                <tr key={entry.label}>
                  <td className="border border-black px-2 py-[3px]">{entry.label}</td>
                  <td className="border border-black px-2 py-[3px] text-center tabular-nums">{entry.count}</td>
                  <td className="border border-black px-2 py-[3px] text-center tabular-nums">
                    {fmt((entry.count / rows.length) * 100, 1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <h2 className="mt-5 border-b border-black pb-1 text-[11px] font-bold uppercase tracking-wide">
        D. Catatan Metodologis
      </h2>
      <p className="mt-2 text-justify text-[10px] leading-relaxed">
        Skor deviasi pada laporan ini diturunkan melalui transformasi linear terhadap {normSentence}. Konsekuensinya,
        posisi relatif setiap peserta hanya bermakna dalam kerangka kelompok pembanding tersebut dan tidak otomatis
        setara dengan skor inteligensi yang dihasilkan oleh instrumen terstandardisasi dengan norma nasional.
        {reliabilitySentence}; interpretasi individual sebaiknya menyertakan pertimbangan kesalahan baku pengukuran,
        terutama ketika ukuran sampel terbatas. Hasil
        pembacaan lembar jawaban dilakukan secara otomatis oleh model visi komputer dan telah melalui verifikasi
        pemeriksa, namun tetap terbuka terhadap kekeliruan pembacaan pada lembar dengan kualitas pemindaian rendah.
      </p>

      <div className="mt-8 flex justify-end">
        <div className="w-64 text-center text-[10px]">
          <p>{todayLong(config.testDate)}</p>
          <p className="font-semibold">Pemeriksa,</p>
          <div className="h-16" />
          <p className="font-bold underline">{config.examiner || '(..............................)'}</p>
        </div>
      </div>

      {config.showDetailPages && rows.length ? (
        <div className="mt-8">
          <div className="print-break" />
          <h2 className="border-b border-black pb-1 text-[11px] font-bold uppercase tracking-wide">
            Lampiran: Rincian Jawaban per Peserta
          </h2>
          <div className="mt-3 space-y-3">
            {rows.map((row, index) => (
              <div key={row.id} className="rounded border border-black px-3 py-2">
                <div className="flex items-baseline justify-between text-[10px]">
                  <span className="font-bold uppercase">
                    {index + 1}. {row.name}
                  </span>
                  <span className="tabular-nums">
                    Nilai {fmt(row.scaledScore, 1)} — Skor deviasi {fmt(row.deviationIq, 0)} ({row.classification?.label || '—'})
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-[3px]">
                  {row.items.map((item) => (
                    <span
                      key={item.no}
                      className={cx(
                        'inline-flex min-w-[30px] flex-col items-center rounded border px-1 py-[1px] text-[7.5px] leading-tight',
                        item.status === 'correct' && 'border-black bg-white',
                        item.status === 'wrong' && 'border-black bg-slate-300',
                        item.status === 'blank' && 'border-dashed border-black bg-white',
                        item.status === 'nokey' && 'border-dotted border-slate-400 bg-white text-slate-500',
                      )}
                    >
                      <span className="tabular-nums">{item.no}</span>
                      <span className="font-bold">{item.response || '-'}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[8.5px] italic">
            Latar putih = benar, latar abu = salah, garis putus-putus = tidak dijawab.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 9. PANEL KUNCI JAWABAN
 * ------------------------------------------------------------------ */

function AnswerKeyEditor({ config, answerKey, onChange, sheets }) {
  const [bulk, setBulk] = useState('');
  const [sourceId, setSourceId] = useState('');

  const filled = answerKey.filter(Boolean).length;
  const options = config.optionSet.split('');

  const setAt = (index, letter) => {
    const next = answerKey.slice();
    next[index] = next[index] === letter ? '' : letter;
    onChange(next);
  };

  const applyBulk = () => {
    const letters = bulk
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .split('')
      .filter((letter) => config.optionSet.includes(letter));
    const next = new Array(config.numQuestions).fill('');
    letters.slice(0, config.numQuestions).forEach((letter, index) => {
      next[index] = letter;
    });
    onChange(next);
    setBulk('');
  };

  const applyFromSheet = () => {
    const sheet = sheets.find((item) => item.id === sourceId);
    if (!sheet) return;
    const next = new Array(config.numQuestions).fill('');
    (sheet.answers || []).slice(0, config.numQuestions).forEach((letter, index) => {
      next[index] = letter || '';
    });
    onChange(next);
  };

  const completedSheets = sheets.filter((sheet) => sheet.status === 'done');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Masukan Cepat" description="Tempel string kunci berurutan, misalnya ABCDEABCDE…" icon={Wand2}>
          <div className="space-y-3">
            <textarea
              value={bulk}
              onChange={(event) => setBulk(event.target.value)}
              rows={3}
              placeholder={`Contoh: ${'ABCDE'.repeat(3).slice(0, Math.min(15, config.numQuestions))}`}
              className={cx(inputClass, 'font-mono uppercase tracking-widest')}
            />
            <div className="flex flex-wrap gap-2">
              <Button icon={ListChecks} onClick={applyBulk} disabled={!bulk.trim()}>
                Terapkan Kunci
              </Button>
              <Button variant="secondary" icon={Eraser} onClick={() => onChange(new Array(config.numQuestions).fill(''))}>
                Kosongkan
              </Button>
              <Button
                variant="ghost"
                icon={Copy}
                onClick={() => navigator.clipboard?.writeText(answerKey.map((letter) => letter || '-').join(''))}
              >
                Salin
              </Button>
            </div>
          </div>
        </Card>

        <Card
          title="Ambil dari LJK Master"
          description="Gunakan satu lembar yang telah dipindai sebagai sumber kunci jawaban."
          icon={ScanLine}
        >
          {completedSheets.length ? (
            <div className="space-y-3">
              <SelectInput value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                <option value="">— Pilih lembar —</option>
                {completedSheets.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.name} ({sheet.fileName})
                  </option>
                ))}
              </SelectInput>
              <Button icon={KeyRound} onClick={applyFromSheet} disabled={!sourceId}>
                Jadikan Kunci Jawaban
              </Button>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Verifikasi ulang hasilnya sebelum digunakan. Kesalahan satu butir pada kunci akan menggeser skor seluruh
                peserta secara sistematis.
              </p>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-slate-500">
              Belum ada lembar yang selesai dipindai. Proses minimal satu LJK pada panel Pindai untuk memakai fitur ini.
            </p>
          )}
        </Card>
      </div>

      <Card
        title={`Kunci Jawaban — ${filled}/${config.numQuestions} butir terisi`}
        description="Klik huruf untuk menetapkan atau membatalkan kunci pada butir terkait."
        icon={KeyRound}
        actions={
          filled < config.numQuestions ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" /> {config.numQuestions - filled} butir belum berkunci
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Kunci lengkap
            </span>
          )
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {answerKey.map((letter, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5"
            >
              <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-500">
                {index + 1}.
              </span>
              <div className="flex flex-1 gap-1">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAt(index, option)}
                    className={cx(
                      'flex h-7 flex-1 items-center justify-center rounded-md border text-xs font-semibold transition-colors',
                      letter === option
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600',
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 10. PANEL PEMINDAIAN LJK
 * ------------------------------------------------------------------ */

const STATUS_META = {
  pending: { label: 'Menunggu', tone: 'bg-slate-100 text-slate-600', icon: ImageIcon },
  processing: { label: 'Diproses', tone: 'bg-sky-100 text-sky-700', icon: Loader2 },
  done: { label: 'Selesai', tone: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  error: { label: 'Gagal', tone: 'bg-rose-100 text-rose-700', icon: XCircle },
};

function SheetCard({ sheet, onRemove, onInspect }) {
  const meta = STATUS_META[sheet.status] || STATUS_META.pending;
  const Icon = meta.icon;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="relative aspect-[3/4] bg-slate-100">
        {sheet.thumb ? (
          <img src={sheet.thumb} alt={sheet.fileName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        <span
          className={cx(
            'absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            meta.tone,
          )}
        >
          <Icon className={cx('h-3 w-3', sheet.status === 'processing' && 'animate-spin')} />
          {meta.label}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          {sheet.status === 'done' ? (
            <button
              type="button"
              onClick={() => onInspect(sheet.id)}
              className="rounded-md bg-white/90 p-1.5 text-slate-700 hover:bg-white"
              title="Periksa hasil"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(sheet.id)}
            className="rounded-md bg-white/90 p-1.5 text-rose-600 hover:bg-white"
            title="Hapus lembar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-xs font-semibold text-slate-800" title={sheet.name || sheet.fileName}>
          {sheet.name || sheet.fileName}
        </p>
        <p className="truncate text-[10px] text-slate-500">
          {sheet.status === 'error'
            ? sheet.error
            : sheet.status === 'done'
              ? `${sheet.answers.filter(Boolean).length} butir terbaca`
              : sheet.fileName}
        </p>
      </div>
    </div>
  );
}

function ScanPanel({ sheets, config, apiKeyReady, processing, progress, onAdd, onRemove, onClearAll, onProcess, onStop, onInspect }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
    if (files.length) onAdd(files);
  };

  const pending = sheets.filter((sheet) => sheet.status === 'pending' || sheet.status === 'error').length;

  return (
    <div className="space-y-4">
      {!apiKeyReady ? (
        <Banner tone="warn" icon={KeyRound} title="API key Gemini belum diisi">
          Buka panel Konfigurasi dan masukkan kunci API Anda. Tanpa kunci tersebut, pemindaian tidak dapat dijalankan
          karena seluruh proses pembacaan citra terjadi langsung dari peramban ke layanan Gemini.
        </Banner>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cx(
          'rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-white',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Upload className="h-6 w-6" />
        </span>
        <p className="mt-3 text-sm font-semibold text-slate-800">Unggah foto atau hasil pindai LJK</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
          Beberapa berkas sekaligus diperbolehkan. Pastikan lembar terpotret utuh, tegak lurus, dan pencahayaan merata —
          tiga faktor yang paling menentukan akurasi pembacaan penanda.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button icon={ImageIcon} onClick={() => inputRef.current?.click()}>
            Pilih Berkas
          </Button>
          {sheets.length ? (
            <Button variant="secondary" icon={Trash2} onClick={onClearAll}>
              Bersihkan Semua
            </Button>
          ) : null}
        </div>
      </div>

      {sheets.length ? (
        <Card
          title={`Antrean Pemindaian — ${sheets.length} lembar`}
          description={`Model aktif: ${config.model} — ${config.numQuestions} butir, opsi ${config.optionSet.split('').join('/')}`}
          icon={Layers}
          actions={
            processing ? (
              <Button variant="danger" icon={X} onClick={onStop}>
                Hentikan
              </Button>
            ) : (
              <Button icon={Play} onClick={onProcess} disabled={!apiKeyReady || !pending}>
                Proses {pending ? `${pending} Lembar` : 'Antrean'}
              </Button>
            )
          }
        >
          {processing ? (
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Membaca lembar {progress.current} dari {progress.total}
                </span>
                <span className="tabular-nums">{Math.round((progress.current / Math.max(1, progress.total)) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {sheets.map((sheet) => (
              <SheetCard key={sheet.id} sheet={sheet} onRemove={onRemove} onInspect={onInspect} />
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState icon={ScanLine} title="Belum ada lembar jawaban">
          Unggah berkas citra LJK untuk memulai. Sistem akan mengekstraksi nama peserta dan pola jawaban, kemudian
          mencocokkannya dengan kunci yang telah Anda tetapkan.
        </EmptyState>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 11. PANEL HASIL DAN VERIFIKASI
 * ------------------------------------------------------------------ */

function ResultsTable({ rows, config, onRename, onInspect, onRemove }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('scaledScore');
  const [ascending, setAscending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');

  const columns = [
    { key: 'name', label: 'Nama Peserta', align: 'left' },
    { key: 'correct', label: 'Benar' },
    { key: 'wrong', label: 'Salah' },
    { key: 'blank', label: 'Kosong' },
    { key: 'rawScore', label: 'Skor' },
    { key: 'scaledScore', label: `Nilai` },
    { key: 'zScore', label: 'Z' },
    { key: 'deviationIq', label: 'Deviasi' },
    { key: 'percentile', label: 'Persentil' },
    { key: 'classification', label: 'Klasifikasi', align: 'left' },
  ];

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()));
    const direction = ascending ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      if (sortKey === 'name') return direction * a.name.localeCompare(b.name, 'id');
      if (sortKey === 'classification') {
        return direction * ((a.deviationIq || 0) - (b.deviationIq || 0));
      }
      const left = Number.isFinite(a[sortKey]) ? a[sortKey] : -Infinity;
      const right = Number.isFinite(b[sortKey]) ? b[sortKey] : -Infinity;
      return direction * (left - right);
    });
  }, [rows, query, sortKey, ascending]);

  const toggleSort = (key) => {
    if (key === sortKey) setAscending((prev) => !prev);
    else {
      setSortKey(key);
      setAscending(key === 'name');
    }
  };

  const commitName = (id) => {
    const cleaned = draftName.trim().toUpperCase();
    if (cleaned) onRename(id, cleaned);
    setEditingId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama peserta…"
            className={cx(inputClass, 'pl-9')}
          />
        </div>
        <p className="text-xs text-slate-500">
          Menampilkan {visible.length} dari {rows.length} peserta
        </p>
      </div>

      <div className="thin-scroll overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                No
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cx(
                    'cursor-pointer select-none px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-indigo-600',
                    column.align === 'left' ? 'text-left' : 'text-center',
                  )}
                  onClick={() => toggleSort(column.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.label}
                    {sortKey === column.key ? (
                      <ChevronDown className={cx('h-3 w-3 transition-transform', ascending && 'rotate-180')} />
                    ) : null}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((row, index) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-3 py-2 text-center text-xs tabular-nums text-slate-400">{index + 1}</td>
                <td className="px-3 py-2">
                  {editingId === row.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={() => commitName(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitName(row.id);
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                      className={cx(inputClass, 'py-1 text-xs uppercase')}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(row.id);
                        setDraftName(row.name);
                      }}
                      className="group inline-flex items-center gap-1.5 text-left text-sm font-medium text-slate-800"
                    >
                      {row.name}
                      <Pencil className="h-3 w-3 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-sm tabular-nums text-emerald-700">{row.correct}</td>
                <td className="px-3 py-2 text-center text-sm tabular-nums text-rose-600">{row.wrong}</td>
                <td className="px-3 py-2 text-center text-sm tabular-nums text-slate-400">{row.blank}</td>
                <td className="px-3 py-2 text-center text-sm tabular-nums text-slate-600">{fmt(row.rawScore, 1)}</td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={cx(
                      'inline-flex min-w-[52px] justify-center rounded-md px-2 py-0.5 text-sm font-bold tabular-nums',
                      row.scaledScore >= config.passingScore
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700',
                    )}
                  >
                    {fmt(row.scaledScore, 1)}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-sm tabular-nums text-slate-600">{fmt(row.zScore, 2)}</td>
                <td className="px-3 py-2 text-center text-sm font-semibold tabular-nums text-slate-800">
                  {fmt(row.deviationIq, 0)}
                </td>
                <td className="px-3 py-2 text-center text-sm tabular-nums text-slate-600">{fmt(row.percentile, 1)}</td>
                <td className="px-3 py-2">
                  {row.classification ? (
                    <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold', row.classification.tone)}>
                      {row.classification.label}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => onInspect(row.id)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                      title="Periksa rincian"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(row.id)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Hapus peserta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 12. MODAL VERIFIKASI PER PESERTA
 * ------------------------------------------------------------------ */

function DetailModal({ row, config, onClose, onEditAnswer, onRename }) {
  if (!row) return null;
  const options = config.optionSet.split('');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <input
              value={row.name}
              onChange={(event) => onRename(row.id, event.target.value.toUpperCase())}
              className="w-full border-0 p-0 text-base font-bold uppercase text-slate-900 focus:outline-none"
            />
            <p className="text-xs text-slate-500">
              {row.fileName} — nilai {fmt(row.scaledScore, 1)} / {config.scaleMax}
              {row.classification ? ` — ${row.classification.label}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="thin-scroll grid flex-1 gap-5 overflow-y-auto px-5 py-4 lg:grid-cols-[minmax(0,300px)_1fr]">
          <div>
            {row.thumb ? (
              <img
                src={row.image || row.thumb}
                alt={row.fileName}
                className="w-full rounded-xl border border-slate-200 object-contain"
              />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400">
                Citra tidak tersimpan pada sesi ini
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ['Benar', row.correct, 'text-emerald-700'],
                ['Salah', row.wrong, 'text-rose-600'],
                ['Kosong', row.blank, 'text-slate-500'],
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-lg border border-slate-200 py-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
                  <p className={cx('text-lg font-bold tabular-nums', tone)}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Koreksi manual jawaban
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {row.items.map((item) => (
                <div
                  key={item.no}
                  className={cx(
                    'flex items-center gap-2 rounded-lg border px-2 py-1.5',
                    item.status === 'correct' && 'border-emerald-200 bg-emerald-50/50',
                    item.status === 'wrong' && 'border-rose-200 bg-rose-50/50',
                    item.status === 'blank' && 'border-slate-200 bg-slate-50',
                    item.status === 'nokey' && 'border-dashed border-slate-200',
                  )}
                >
                  <span className="w-6 text-right text-[11px] font-semibold tabular-nums text-slate-500">{item.no}.</span>
                  <div className="flex flex-1 gap-1">
                    {options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onEditAnswer(row.id, item.no - 1, option)}
                        className={cx(
                          'h-6 flex-1 rounded text-[11px] font-semibold transition-colors',
                          item.response === option
                            ? 'bg-slate-800 text-white'
                            : 'bg-white text-slate-400 ring-1 ring-inset ring-slate-200 hover:text-slate-700',
                          item.key === option && item.response !== option && 'ring-emerald-400 text-emerald-600',
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <span className="w-12 text-right text-[10px] font-semibold uppercase text-slate-400">
                    {item.key ? `K: ${item.key}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Perubahan langsung memperbarui skor, statistik kelompok, dan laporan.
          </p>
          <Button onClick={onClose} icon={CheckCircle2}>
            Selesai
          </Button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 13. PANEL ANALISIS PSIKOMETRIK
 * ------------------------------------------------------------------ */

function Histogram({ rows, config }) {
  const binCount = 8;
  const values = rows.map((row) => row.scaledScore).filter(Number.isFinite);
  if (!values.length) return null;

  const min = 0;
  const max = config.scaleMax;
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const low = min + index * width;
    const high = low + width;
    const count = values.filter((value) =>
      index === binCount - 1 ? value >= low && value <= high : value >= low && value < high,
    ).length;
    return { low, high, count };
  });
  const peak = Math.max(1, ...bins.map((bin) => bin.count));

  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {bins.map((bin, index) => (
          <div key={index} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-semibold tabular-nums text-slate-500">{bin.count || ''}</span>
            <div
              className="w-full rounded-t bg-indigo-500/80 transition-all"
              style={{ height: `${(bin.count / peak) * 100}%`, minHeight: bin.count ? '4px' : '0px' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 border-t border-slate-200 pt-1.5">
        {bins.map((bin, index) => (
          <span key={index} className="flex-1 text-center text-[9px] tabular-nums text-slate-400">
            {Math.round(bin.low)}
          </span>
        ))}
      </div>
    </div>
  );
}

function AnalysisPanel({ rows, itemStats, sample, basis, config }) {
  const scaled = descriptiveStats(rows.map((row) => row.scaledScore));
  const flagged = itemStats.items.filter((item) => item.verdict.label !== 'Layak' && item.key);

  if (!rows.length) {
    return (
      <EmptyState icon={BarChart3} title="Analisis belum tersedia">
        Statistik kelompok dan analisis butir baru dapat dihitung setelah terdapat setidaknya satu lembar jawaban yang
        selesai dikoreksi.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Peserta" value={rows.length} sub="lembar terkoreksi" />
        <StatCard icon={Sigma} label="Rerata Nilai" value={fmt(scaled.mean, 2)} sub={`SD = ${fmt(scaled.sd, 2)}`} tone="emerald" />
        <StatCard
          icon={Award}
          label="Reliabilitas KR-20"
          value={fmt(itemStats.kr20, 3)}
          sub={interpretReliability(itemStats.kr20)}
          tone="amber"
        />
        <StatCard
          icon={AlertTriangle}
          label="Butir Bermasalah"
          value={flagged.length}
          sub={`dari ${itemStats.items.filter((item) => item.key).length} butir berkunci`}
          tone={flagged.length ? 'rose' : 'slate'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Distribusi Nilai" description={`Skala 0–${config.scaleMax}, ${rows.length} peserta`} icon={BarChart3}>
          <Histogram rows={rows} config={config} />
        </Card>

        <Card title="Ringkasan Sebaran" description="Ukuran pemusatan dan penyebaran skor kelompok" icon={Sigma}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            {[
              ['Rerata', fmt(scaled.mean, 2)],
              ['Median', fmt(scaled.median, 2)],
              ['Simpangan baku', fmt(scaled.sd, 2)],
              ['Rentang', fmt(scaled.range, 1)],
              ['Nilai minimum', fmt(scaled.min, 1)],
              ['Nilai maksimum', fmt(scaled.max, 1)],
              ['Rerata skor mentah', fmt(sample.mean, 2)],
              ['Basis norma', basis.mode === 'manual' ? 'Manual' : 'Sampel lokal'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card
        title="Analisis Butir Klasikal"
        description={`Indeks kesukaran (p), daya beda (D) berbasis kelompok 27% atas–bawah (n = ${itemStats.groupSize} per kelompok), dan korelasi point-biserial.`}
        icon={ClipboardList}
      >
        {rows.length < 10 ? (
          <div className="mb-3">
            <Banner tone="warn" icon={AlertTriangle} title="Ukuran sampel terbatas">
              Dengan {rows.length} peserta, estimasi daya beda memiliki galat baku yang besar dan sangat sensitif
              terhadap komposisi kelompok ekstrem. Angka di bawah ini sebaiknya diperlakukan sebagai indikasi awal, bukan
              dasar keputusan untuk membuang butir.
            </Banner>
          </div>
        ) : null}

        <div className="thin-scroll max-h-[520px] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b border-slate-200">
                {['Butir', 'Kunci', 'p', 'D', 'rpbis', 'Sebaran Respons', 'Status'].map((head) => (
                  <th
                    key={head}
                    className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itemStats.items.map((item) => (
                <tr key={item.no} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 text-center text-sm tabular-nums text-slate-500">{item.no}</td>
                  <td className="px-3 py-2 text-center text-sm font-semibold text-slate-800">{item.key || '—'}</td>
                  <td className="px-3 py-2 text-center text-sm tabular-nums text-slate-700">{fmt(item.p, 2)}</td>
                  <td
                    className={cx(
                      'px-3 py-2 text-center text-sm font-semibold tabular-nums',
                      Number.isFinite(item.discrimination) && item.discrimination < 0.2
                        ? 'text-rose-600'
                        : 'text-slate-700',
                    )}
                  >
                    {fmt(item.discrimination, 2)}
                  </td>
                  <td className="px-3 py-2 text-center text-sm tabular-nums text-slate-600">
                    {fmt(item.pointBiserial, 2)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-center gap-1">
                      {Object.entries(item.distribution).map(([label, count]) => (
                        <span
                          key={label}
                          className={cx(
                            'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                            label === item.key ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {label === 'kosong' ? '∅' : label}
                          <span className="font-bold">{count}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cx('inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', item.verdict.tone)}>
                      {item.verdict.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Butir dengan p di bawah 0,20 atau di atas 0,90 nyaris tidak menyumbang variansi sehingga melemahkan daya
          diskriminasi keseluruhan instrumen, sementara D negatif menandakan butir yang justru diuntungkan oleh peserta
          berkemampuan rendah dan lazimnya berakar pada kunci yang keliru atau pengecoh yang ambigu.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 14. PANEL KONFIGURASI
 * ------------------------------------------------------------------ */

function ConfigPanel({ config, onConfig, apiKey, onApiKey, logo, onLogo }) {
  const [revealKey, setRevealKey] = useState(false);
  const set = (patch) => onConfig({ ...config, ...patch });

  return (
    <div className="space-y-4">
      <Card
        title="Kredensial Gemini API"
        description="Kunci disimpan pada localStorage peramban ini dan dikirim langsung ke Google tanpa perantara server."
        icon={KeyRound}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field
            label="API Key"
            hint="Dapatkan melalui Google AI Studio. Kunci bersifat rahasia — hindari memakai perangkat publik."
          >
            <div className="relative">
              <TextInput
                type={revealKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => onApiKey(event.target.value.trim())}
                placeholder="AIza…"
                autoComplete="off"
                className="pr-20 font-mono"
              />
              <button
                type="button"
                onClick={() => setRevealKey((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
              >
                {revealKey ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
          </Field>

          <Field label="Model Visi" hint="Model flash memadai untuk LJK bersih; gunakan pro pada lembar hasil foto ponsel yang buram.">
            <SelectInput value={config.model} onChange={(event) => set({ model: event.target.value })}>
              {GEMINI_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        <div className="mt-4">
          <Banner tone="warn" icon={Lock} title="Konsekuensi arsitektur tanpa backend">
            Aplikasi ini berjalan sepenuhnya di sisi klien, sehingga kunci API berada di peramban pengguna. Untuk
            pemakaian institusional dengan banyak operator, tempatkan kunci pada proksi server dan batasi kuotanya per
            pemakai.
          </Banner>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Identitas Institusi" description="Digunakan pada kop laporan dan template LJK." icon={Building2}>
          <div className="space-y-3">
            <Field label="Nama Institusi">
              <TextInput value={config.institution} onChange={(event) => set({ institution: event.target.value })} />
            </Field>
            <Field label="Unit / Fakultas">
              <TextInput value={config.unit} onChange={(event) => set({ unit: event.target.value })} />
            </Field>
            <Field label="Alamat">
              <TextInput value={config.address} onChange={(event) => set({ address: event.target.value })} />
            </Field>
            <Field label="Logo (opsional)" hint="Format PNG/JPG. Logo hanya tersimpan pada sesi peramban ini.">
              <div className="flex items-center gap-3">
                {logo ? <img src={logo} alt="" className="h-12 w-12 rounded border border-slate-200 object-contain" /> : null}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) onLogo(await fileToDataUrl(file));
                    event.target.value = '';
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {logo ? (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onLogo('')}>
                    Hapus
                  </Button>
                ) : null}
              </div>
            </Field>
          </div>
        </Card>

        <Card title="Parameter Instrumen" description="Struktur tes yang akan dikoreksi." icon={Settings2}>
          <div className="space-y-3">
            <Field label="Nama Tes">
              <TextInput value={config.testName} onChange={(event) => set({ testName: event.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jenis Instrumen">
                <SelectInput
                  value={config.instrumentType}
                  onChange={(event) => set({ instrumentType: event.target.value })}
                >
                  {INSTRUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Tanggal Administrasi">
                <TextInput type="date" value={config.testDate} onChange={(event) => set({ testDate: event.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jumlah Butir" hint="Rentang 1–200 butir.">
                <TextInput
                  type="number"
                  min={1}
                  max={200}
                  value={config.numQuestions}
                  onChange={(event) => set({ numQuestions: clamp(Number(event.target.value) || 1, 1, 200) })}
                />
              </Field>
              <Field label="Opsi Jawaban">
                <SelectInput value={config.optionSet} onChange={(event) => set({ optionSet: event.target.value })}>
                  {OPTION_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset.split('').join(' / ')}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field label="Nama Pemeriksa">
              <TextInput
                value={config.examiner}
                onChange={(event) => set({ examiner: event.target.value })}
                placeholder="Nama lengkap dan gelar"
              />
            </Field>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Kaidah Penyekoran" description="Menentukan transformasi jawaban benar menjadi nilai." icon={Sigma}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Skala Nilai Maksimum">
                <TextInput
                  type="number"
                  min={1}
                  max={1000}
                  value={config.scaleMax}
                  onChange={(event) => set({ scaleMax: clamp(Number(event.target.value) || 100, 1, 1000) })}
                />
              </Field>
              <Field label="Batas Kelulusan (KKM)">
                <TextInput
                  type="number"
                  min={0}
                  value={config.passingScore}
                  onChange={(event) => set({ passingScore: clamp(Number(event.target.value) || 0, 0, config.scaleMax) })}
                />
              </Field>
            </div>
            <Toggle
              checked={config.penalty}
              onChange={(value) => set({ penalty: value })}
              label="Koreksi terhadap tebakan (formula scoring)"
              hint="Skor = benar − salah/(k−1). Menekan keuntungan menebak, namun menghukum peserta yang berani menjawab dengan informasi parsial."
            />
            <Toggle
              checked={config.showDetailPages}
              onChange={(value) => set({ showDetailPages: value })}
              label="Sertakan lampiran rincian jawaban per peserta"
              hint="Menambah halaman pada laporan PDF berisi pola jawaban tiap peserta."
            />
          </div>
        </Card>

        <Card title="Basis Norma" description="Dasar konversi skor mentah menjadi skor deviasi (M = 100, SD = 15)." icon={BarChart3}>
          <div className="space-y-3">
            <SelectInput value={config.normMode} onChange={(event) => set({ normMode: event.target.value })}>
              <option value="sample">Norma lokal — dihitung dari sampel yang sedang dikoreksi</option>
              <option value="manual">Normatif manual — parameter dimasukkan pemeriksa</option>
            </SelectInput>

            {config.normMode === 'manual' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Rerata Normatif (M)">
                  <TextInput
                    type="number"
                    step="0.01"
                    value={config.normMean}
                    onChange={(event) => set({ normMean: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Simpangan Baku (SD)">
                  <TextInput
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={config.normSd}
                    onChange={(event) => set({ normSd: Number(event.target.value) })}
                  />
                </Field>
              </div>
            ) : null}

            <Banner tone="info" icon={Info} title="Interpretasi skor deviasi">
              Norma lokal menempatkan peserta relatif terhadap kelompoknya sendiri, sehingga rerata kelompok selalu
              dipetakan ke 100 berapa pun tingkat kemampuan absolutnya. Angka yang dihasilkan tidak setara dengan IQ
              hasil instrumen terstandardisasi dan tidak dapat dipakai untuk keputusan klinis.
            </Banner>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 15. KOMPONEN AKAR
 * ------------------------------------------------------------------ */

const TABS = [
  { id: 'konfigurasi', label: 'Konfigurasi', icon: Settings2 },
  { id: 'kunci', label: 'Kunci Jawaban', icon: KeyRound },
  { id: 'pindai', label: 'Pindai LJK', icon: ScanLine },
  { id: 'hasil', label: 'Hasil & Nilai', icon: Table2 },
  { id: 'analisis', label: 'Analisis', icon: BarChart3 },
  { id: 'template', label: 'Template LJK', icon: Printer },
];

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export default function App() {
  const persisted = useMemo(loadPersisted, []);

  const [config, setConfig] = useState(() => ({ ...DEFAULT_CONFIG, ...(persisted?.config || {}) }));
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem(API_KEY_STORAGE) || '';
    } catch (error) {
      return '';
    }
  });
  const [answerKey, setAnswerKey] = useState(() => {
    const size = persisted?.config?.numQuestions || DEFAULT_CONFIG.numQuestions;
    const stored = persisted?.answerKey || [];
    return Array.from({ length: size }, (_, index) => stored[index] || '');
  });
  const [sheets, setSheets] = useState(() => persisted?.sheets || []);
  const [logo, setLogo] = useState(() => persisted?.logo || '');
  const [tab, setTab] = useState('konfigurasi');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [inspectId, setInspectId] = useState(null);
  const [busyExport, setBusyExport] = useState('');
  const [toast, setToast] = useState(null);
  const [rowsPerColumn, setRowsPerColumn] = useState(20);

  const abortRef = useRef(null);
  const reportRef = useRef(null);
  const templateRef = useRef(null);

  /* ---- Notifikasi ringan ---- */
  const notify = useCallback((message, tone = 'info') => {
    setToast({ message, tone, id: uid() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ---- Persistensi ---- */
  useEffect(() => {
    try {
      localStorage.setItem(API_KEY_STORAGE, apiKey);
    } catch (error) {
      /* penyimpanan tidak tersedia */
    }
  }, [apiKey]);

  useEffect(() => {
    const payload = {
      config,
      answerKey,
      logo,
      sheets: sheets.map(({ image, ...rest }) => rest),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...payload, logo: '', sheets: payload.sheets.map(({ thumb, ...rest }) => rest) }),
        );
      } catch (inner) {
        /* kuota penyimpanan habis; sesi tetap berjalan di memori */
      }
    }
  }, [config, answerKey, logo, sheets]);

  /* ---- Sinkronisasi panjang larik ketika jumlah butir berubah ---- */
  useEffect(() => {
    setAnswerKey((prev) =>
      prev.length === config.numQuestions
        ? prev
        : Array.from({ length: config.numQuestions }, (_, index) => prev[index] || ''),
    );
    setSheets((prev) =>
      prev.map((sheet) =>
        sheet.answers && sheet.answers.length !== config.numQuestions
          ? {
              ...sheet,
              answers: Array.from({ length: config.numQuestions }, (_, index) => sheet.answers[index] ?? null),
            }
          : sheet,
      ),
    );
  }, [config.numQuestions]);

  /* ---- Turunan psikometrik ---- */
  const graded = useMemo(
    () => sheets.filter((sheet) => sheet.status === 'done').map((sheet) => gradeSheet(sheet, answerKey, config)),
    [sheets, answerKey, config],
  );
  const { rows, sample, basis } = useMemo(() => applyNorms(graded, config), [graded, config]);
  const itemStats = useMemo(() => analyzeItems(rows, answerKey, config), [rows, answerKey, config]);

  const inspected = useMemo(() => rows.find((row) => row.id === inspectId) || null, [rows, inspectId]);
  const apiKeyReady = apiKey.trim().length > 10;
  const keyFilled = answerKey.filter(Boolean).length;

  /* ---- Manipulasi lembar ---- */
  const updateSheet = useCallback((id, patch) => {
    setSheets((prev) => prev.map((sheet) => (sheet.id === id ? { ...sheet, ...patch } : sheet)));
  }, []);

  const handleAddFiles = useCallback(
    async (files) => {
      const prepared = await Promise.all(
        files.map(async (file) => {
          try {
            const image = await prepareImage(file);
            return {
              id: uid(),
              fileName: file.name,
              name: file.name.replace(/\.[^.]+$/, '').toUpperCase(),
              image: image.full,
              thumb: image.thumb,
              status: 'pending',
              error: null,
              answers: new Array(config.numQuestions).fill(null),
            };
          } catch (error) {
            return null;
          }
        }),
      );
      const valid = prepared.filter(Boolean);
      setSheets((prev) => [...prev, ...valid]);
      if (valid.length) notify(`${valid.length} lembar ditambahkan ke antrean.`, 'success');
    },
    [config.numQuestions, notify],
  );

  const handleProcess = useCallback(async () => {
    const targets = sheets.filter((sheet) => sheet.status === 'pending' || sheet.status === 'error');
    if (!targets.length) return;
    if (!apiKeyReady) {
      notify('API key Gemini belum diisi.', 'error');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setProcessing(true);
    setProgress({ current: 0, total: targets.length });

    const prompt = buildVisionPrompt(config.numQuestions, config.optionSet);
    let success = 0;
    let failure = 0;

    for (let index = 0; index < targets.length; index += 1) {
      if (controller.signal.aborted) break;
      const target = targets[index];
      setProgress({ current: index + 1, total: targets.length });
      updateSheet(target.id, { status: 'processing', error: null });

      if (!target.image) {
        updateSheet(target.id, {
          status: 'error',
          error: 'Citra tidak tersedia pada sesi ini. Unggah ulang berkasnya.',
        });
        failure += 1;
        continue;
      }

      try {
        const text = await requestGeminiWithRetry({
          apiKey: apiKey.trim(),
          model: config.model,
          prompt,
          base64: stripBase64(target.image),
          mimeType: 'image/jpeg',
          signal: controller.signal,
        });
        const parsed = extractJsonObject(text);
        const result = normalizeVisionResult(parsed, config.numQuestions, config.optionSet);
        updateSheet(target.id, {
          status: 'done',
          name: result.name,
          answers: result.answers,
          error: null,
          scannedAt: Date.now(),
        });
        success += 1;
      } catch (error) {
        if (controller.signal.aborted) {
          updateSheet(target.id, { status: 'pending' });
          break;
        }
        updateSheet(target.id, {
          status: 'error',
          error: error?.message || 'Lembar gagal dibaca.',
        });
        failure += 1;
      }
    }

    setProcessing(false);
    abortRef.current = null;
    if (!controller.signal.aborted) {
      notify(
        `Pemindaian selesai: ${success} berhasil${failure ? `, ${failure} gagal` : ''}.`,
        failure ? 'warn' : 'success',
      );
      if (success) setTab('hasil');
    }
  }, [sheets, apiKey, apiKeyReady, config, updateSheet, notify]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setProcessing(false);
    notify('Pemrosesan dihentikan.', 'warn');
  }, [notify]);

  const handleEditAnswer = useCallback((id, index, letter) => {
    setSheets((prev) =>
      prev.map((sheet) => {
        if (sheet.id !== id) return sheet;
        const answers = sheet.answers.slice();
        answers[index] = answers[index] === letter ? null : letter;
        return { ...sheet, answers };
      }),
    );
  }, []);

  const handleRename = useCallback((id, name) => updateSheet(id, { name }), [updateSheet]);
  const handleRemove = useCallback((id) => setSheets((prev) => prev.filter((sheet) => sheet.id !== id)), []);

  /* ---- Ekspor ---- */
  const handleExportReport = useCallback(async () => {
    if (!rows.length) {
      notify('Belum ada hasil yang dapat dilaporkan.', 'warn');
      return;
    }
    setBusyExport('report');
    try {
      if (!reportRef.current) {
        setTab('hasil');
        await sleep(400);
      }
      await exportElementToPdf(
        reportRef.current,
        `laporan-${slugify(config.testName)}-${config.testDate}.pdf`,
        'portrait',
      );
      notify('Laporan PDF berhasil diunduh.', 'success');
    } catch (error) {
      notify(error?.message || 'Ekspor PDF gagal.', 'error');
    } finally {
      setBusyExport('');
    }
  }, [rows.length, config.testName, config.testDate, notify]);

  const handleExportTemplate = useCallback(async () => {
    setBusyExport('template');
    try {
      if (!templateRef.current) {
        setTab('template');
        await sleep(400);
      }
      await exportElementToPdf(templateRef.current, `template-ljk-${slugify(config.testName)}.pdf`, 'portrait');
      notify('Template LJK berhasil diunduh.', 'success');
    } catch (error) {
      notify(error?.message || 'Ekspor template gagal.', 'error');
    } finally {
      setBusyExport('');
    }
  }, [config.testName, notify]);

  const handleExportCsv = useCallback(() => {
    if (!rows.length) {
      notify('Belum ada hasil untuk diekspor.', 'warn');
      return;
    }
    downloadCsv(rows, config, `rekap-${slugify(config.testName)}-${config.testDate}.csv`);
    notify('Rekapitulasi CSV berhasil diunduh.', 'success');
  }, [rows, config, notify]);

  const handleResetAll = useCallback(() => {
    if (!window.confirm('Hapus seluruh lembar jawaban dan hasil koreksi pada sesi ini?')) return;
    setSheets([]);
    notify('Data pemindaian dibersihkan.', 'info');
  }, [notify]);

  /* ---- Antarmuka ---- */
  return (
    <div className="min-h-full bg-slate-100">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-900">AI Grader Sistem</h1>
              <p className="text-[11px] leading-tight text-slate-500">
                Koreksi LJK otomatis untuk instrumen psikologis — Gemini Vision
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              <Users className="h-3.5 w-3.5" /> {rows.length} peserta
            </span>
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                keyFilled === config.numQuestions ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
              )}
            >
              <KeyRound className="h-3.5 w-3.5" /> {keyFilled}/{config.numQuestions} kunci
            </span>
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                apiKeyReady ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> {apiKeyReady ? 'API siap' : 'API belum diatur'}
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon={busyExport === 'report' ? Loader2 : FileText}
              onClick={handleExportReport}
              disabled={Boolean(busyExport)}
              className={busyExport === 'report' ? '[&_svg]:animate-spin' : undefined}
            >
              Laporan PDF
            </Button>
          </div>
        </div>

        <nav className="thin-scroll mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={cx(
                  'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                  active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <Icon className="h-4 w-4" />
                {entry.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="no-print mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {tab === 'konfigurasi' ? (
          <ConfigPanel
            config={config}
            onConfig={setConfig}
            apiKey={apiKey}
            onApiKey={setApiKey}
            logo={logo}
            onLogo={setLogo}
          />
        ) : null}

        {tab === 'kunci' ? (
          <AnswerKeyEditor config={config} answerKey={answerKey} onChange={setAnswerKey} sheets={sheets} />
        ) : null}

        {tab === 'pindai' ? (
          <ScanPanel
            sheets={sheets}
            config={config}
            apiKeyReady={apiKeyReady}
            processing={processing}
            progress={progress}
            onAdd={handleAddFiles}
            onRemove={handleRemove}
            onClearAll={handleResetAll}
            onProcess={handleProcess}
            onStop={handleStop}
            onInspect={setInspectId}
          />
        ) : null}

        {tab === 'hasil' ? (
          <div className="space-y-4">
            {!rows.length ? (
              <EmptyState icon={Table2} title="Belum ada nilai yang dihitung">
                Setelah lembar jawaban dipindai dan kunci ditetapkan, tabel nilai, statistik kelompok, serta laporan
                resmi akan tersusun secara otomatis di halaman ini.
              </EmptyState>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard icon={Users} label="Peserta" value={rows.length} sub="lembar terkoreksi" />
                  <StatCard
                    icon={Sigma}
                    label="Rerata Nilai"
                    value={fmt(descriptiveStats(rows.map((row) => row.scaledScore)).mean, 1)}
                    sub={`skala 0–${config.scaleMax}`}
                    tone="emerald"
                  />
                  <StatCard
                    icon={CheckCircle2}
                    label="Mencapai KKM"
                    value={rows.filter((row) => row.scaledScore >= config.passingScore).length}
                    sub={`ambang ${config.passingScore}`}
                    tone="amber"
                  />
                  <StatCard
                    icon={AlertTriangle}
                    label="Perlu Verifikasi"
                    value={rows.filter((row) => row.name === 'TIDAK TERBACA' || row.blank > config.numQuestions / 2).length}
                    sub="nama/pola jawaban meragukan"
                    tone="rose"
                  />
                </div>

                <Card
                  title="Rekapitulasi Nilai"
                  description="Klik nama untuk menyunting, atau ikon mata untuk memverifikasi jawaban butir demi butir."
                  icon={Table2}
                  actions={
                    <>
                      <Button size="sm" variant="secondary" icon={FileSpreadsheet} onClick={handleExportCsv}>
                        CSV
                      </Button>
                      <Button
                        size="sm"
                        icon={busyExport === 'report' ? Loader2 : Download}
                        onClick={handleExportReport}
                        disabled={Boolean(busyExport)}
                        className={busyExport === 'report' ? '[&_svg]:animate-spin' : undefined}
                      >
                        Ekspor PDF
                      </Button>
                    </>
                  }
                >
                  <ResultsTable
                    rows={rows}
                    config={config}
                    onRename={handleRename}
                    onInspect={setInspectId}
                    onRemove={handleRemove}
                  />
                </Card>

                <Card
                  title="Pratinjau Laporan Resmi"
                  description="Dokumen A4 yang akan dicetak ke PDF. Gulir mendatar untuk melihat seluruh lebar halaman."
                  icon={FileText}
                  actions={
                    <Button size="sm" variant="secondary" icon={Printer} onClick={() => window.print()}>
                      Cetak
                    </Button>
                  }
                >
                  <div className="thin-scroll overflow-x-auto rounded-xl bg-slate-200 p-4">
                    <ReportDocument
                      innerRef={reportRef}
                      config={config}
                      rows={rows}
                      sample={sample}
                      basis={basis}
                      itemStats={itemStats}
                      logo={logo}
                    />
                  </div>
                </Card>
              </>
            )}
          </div>
        ) : null}

        {tab === 'analisis' ? (
          <AnalysisPanel rows={rows} itemStats={itemStats} sample={sample} basis={basis} config={config} />
        ) : null}

        {tab === 'template' ? (
          <div className="space-y-4">
            <Card
              title="Template Lembar Jawaban 3 Kolom"
              description="Lembar siap cetak yang selaras dengan pembacaan otomatis: penomoran mengalir per kolom, penanda sudut sebagai acuan orientasi kamera."
              icon={Printer}
              actions={
                <>
                  <Button size="sm" variant="secondary" icon={Printer} onClick={() => window.print()}>
                    Cetak
                  </Button>
                  <Button
                    size="sm"
                    icon={busyExport === 'template' ? Loader2 : Download}
                    onClick={handleExportTemplate}
                    disabled={Boolean(busyExport)}
                    className={busyExport === 'template' ? '[&_svg]:animate-spin' : undefined}
                  >
                    Unduh PDF
                  </Button>
                </>
              }
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Baris per Kolom" hint="Menentukan berapa butir yang dimuat setiap kolom pada satu halaman.">
                  <TextInput
                    type="number"
                    min={5}
                    max={40}
                    value={rowsPerColumn}
                    onChange={(event) => setRowsPerColumn(clamp(Number(event.target.value) || 20, 5, 40))}
                  />
                </Field>
                <Field label="Jumlah Butir">
                  <TextInput
                    type="number"
                    min={1}
                    max={200}
                    value={config.numQuestions}
                    onChange={(event) =>
                      setConfig({ ...config, numQuestions: clamp(Number(event.target.value) || 1, 1, 200) })
                    }
                  />
                </Field>
                <Field label="Kapasitas Halaman">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {rowsPerColumn * 3} butir/halaman —{' '}
                    {Math.max(1, Math.ceil(config.numQuestions / (rowsPerColumn * 3)))} halaman
                  </div>
                </Field>
              </div>
            </Card>

            <div className="thin-scroll overflow-x-auto rounded-xl bg-slate-200 p-4">
              <AnswerSheetTemplate config={config} rowsPerColumn={rowsPerColumn} innerRef={templateRef} />
            </div>
          </div>
        ) : null}
      </main>

      <footer className="no-print mx-auto max-w-7xl px-4 pb-10 pt-2 text-center text-[11px] leading-relaxed text-slate-400 sm:px-6">
        AI Grader Sistem — pemrosesan berlangsung sepenuhnya di peramban. Hasil pembacaan otomatis tetap memerlukan
        verifikasi pemeriksa sebelum digunakan sebagai dasar keputusan asesmen.
      </footer>

      <DetailModal
        row={inspected}
        config={config}
        onClose={() => setInspectId(null)}
        onEditAnswer={handleEditAnswer}
        onRename={handleRename}
      />

      {toast ? (
        <div className="no-print fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
          <div
            className={cx(
              'flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg',
              toast.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
              toast.tone === 'error' && 'border-rose-200 bg-rose-50 text-rose-900',
              toast.tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-900',
              toast.tone === 'info' && 'border-slate-200 bg-white text-slate-800',
            )}
          >
            {toast.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            {toast.tone === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            {toast.tone === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            {toast.tone === 'info' ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            <p className="text-xs leading-relaxed">{toast.message}</p>
            <button type="button" onClick={() => setToast(null)} className="ml-auto opacity-60 transition-opacity hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
