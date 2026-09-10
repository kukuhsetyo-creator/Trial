/**
 * AI Grader Sistem
 * Aplikasi koreksi Lembar Jawaban Komputer (LJK) untuk instrumen psikologis dan
 * tes inteligensi.
 *
 * Arsitektur: luring penuh. Pembacaan lembar dilakukan oleh mesin OMR berbasis
 * Canvas 2D di dalam peramban, tanpa panggilan jaringan, tanpa model bahasa,
 * dan tanpa kunci API. Penyekoran, konversi norma, analisis butir, serta
 * penyusunan laporan seluruhnya berjalan di perangkat.
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
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Crosshair,
  Download,
  Eraser,
  Eye,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Grid3x3,
  Image as ImageIcon,
  Info,
  Keyboard,
  KeyRound,
  Layers,
  ListChecks,
  Loader2,
  Pencil,
  Play,
  Printer,
  Ruler,
  ScanLine,
  Search,
  Settings2,
  Sigma,
  Table2,
  Trash2,
  Upload,
  Users,
  Wand2,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import {
  DEFAULT_LAYOUT,
  LAYOUT_BOUNDS,
  PX_PER_MM,
  computeBubbleCenters,
  computeFiducials,
  computeLayoutMetrics,
  computeNumberAnchors,
  computePageItems,
  normalizeLayout,
} from './ljk/layout.js';
import { DEFAULT_OMR_OPTIONS, detectSheet, grayscaleFromSource } from './ljk/omr.js';
import { capturePhoto, isNativeAndroid, saveBinaryFile } from './platform.js';

/* ------------------------------------------------------------------ *
 * 1. KONSTANTA DOMAIN
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'ai-grader-sistem:v2';

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
  penalty: false,
  scaleMax: 100,
  passingScore: 60,
  normMode: 'sample', // 'sample' | 'manual'
  normMean: 15,
  normSd: 5,
  showDetailPages: true,
  mergeByName: false,
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
async function prepareImageFromDataUrl(dataUrl) {
  const image = await loadImageElement(dataUrl);
  return {
    full: drawToDataUrl(image, 1600, 0.9),
    thumb: drawToDataUrl(image, 220, 0.7),
    width: image.width,
    height: image.height,
  };
}

async function prepareImage(file) {
  return prepareImageFromDataUrl(await fileToDataUrl(file));
}


/* ------------------------------------------------------------------ *
 * 3. LAPISAN PEMBACAAN LURING (OMR) DAN ENTRI MANUAL
 * ------------------------------------------------------------------ */

/** Menyalin hasil deteksi satu halaman ke larik jawaban sepanjang seluruh tes. */
function answersFromDetection(detection, layout, previous) {
  const answers = Array.from({ length: layout.numQuestions }, (_, index) => previous?.[index] ?? null);
  detection.answers.forEach((letter, no) => {
    if (no >= 1 && no <= layout.numQuestions) answers[no - 1] = letter;
  });
  return answers;
}

/** Membaca satu lembar sepenuhnya di perangkat. */
async function readSheetOffline(sheet, layout, omrOptions) {
  if (!sheet.image) {
    throw new Error('Citra tidak tersedia pada sesi ini. Unggah atau potret ulang lembarnya.');
  }
  const grayscale = await grayscaleFromSource(sheet.image, omrOptions.maxDim);
  const detection = detectSheet(grayscale, layout, sheet.pageIndex || 0, omrOptions);
  if (!detection.ok) throw new Error(detection.error);
  return detection;
}

/** Menerjemahkan tempelan string jawaban menjadi larik, mengabaikan pemisah apa pun. */
function parseBulkAnswers(text, layout) {
  const letters = String(text || '')
    .toUpperCase()
    .replace(/[^A-Z-]/g, '')
    .split('');
  const answers = new Array(layout.numQuestions).fill(null);
  letters.slice(0, layout.numQuestions).forEach((letter, index) => {
    answers[index] = layout.optionSet.includes(letter) ? letter : null;
  });
  return answers;
}

/**
 * Lapisan kalibrasi: menggambar citra beserta titik sampel yang benar-benar
 * dibaca detektor, sehingga pemeriksa dapat menilai sendiri apakah grid jatuh
 * tepat di atas bulatan sebelum memproses seluruh antrean.
 */
async function paintDetectionOverlay(canvas, imageSrc, detection, omrOptions) {
  if (!canvas || !imageSrc) return;
  const image = await new Promise((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Citra tidak dapat dimuat.'));
    element.src = imageSrc;
  });

  const scale = Math.min(1, omrOptions.maxDim / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  if (!detection?.ok) return;

  Object.values(detection.fiducials).forEach((fiducial) => {
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 2;
    ctx.strokeRect(fiducial.minX - 3, fiducial.minY - 3, fiducial.boxWidth + 6, fiducial.boxHeight + 6);
  });

  detection.samples.forEach((sample) => {
    const marked = sample.net >= omrOptions.fillThreshold;
    ctx.beginPath();
    ctx.arc(sample.x, sample.y, sample.radius, 0, Math.PI * 2);
    ctx.strokeStyle = marked ? '#059669' : 'rgba(148, 163, 184, 0.75)';
    ctx.lineWidth = marked ? 2 : 1;
    ctx.stroke();
  });
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

  // Di WebView Android elemen <a download> tidak berfungsi, sehingga berkas
  // ditulis lewat Filesystem lalu diserahkan ke lembar berbagi sistem.
  return saveBinaryFile({
    filename,
    blob: pdf.output('blob'),
    mimeType: 'application/pdf',
  });
}

function buildCsv(rows, config) {
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

  return '﻿' + [header.map(escape).join(','), ...body].join('\r\n');
}

function exportCsv(rows, config, filename) {
  const blob = new Blob([buildCsv(rows, config)], { type: 'text/csv;charset=utf-8;' });
  return saveBinaryFile({ filename, blob, mimeType: 'text/csv' });
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
 * 7. TEMPLATE LJK (DIRENDER DARI GEOMETRI MILIMETER)
 * ------------------------------------------------------------------ */

const mm = (value) => `${value * PX_PER_MM}px`;

function IdentityLine({ label, widthMm, layout }) {
  return (
    <div className="flex items-end gap-2" style={{ width: mm(widthMm) }}>
      <span
        className="whitespace-nowrap font-bold uppercase tracking-wide text-black"
        style={{ fontSize: mm(2.4) }}
      >
        {label}
      </span>
      <span className="flex-1 border-b border-dotted border-black" style={{ height: mm(4) }} />
    </div>
  );
}

/**
 * Lembar jawaban dirender dari koordinat milimeter yang sama dengan yang
 * disampel detektor. Penanda sudut berfungsi sebagai acuan homografi, sehingga
 * lembar tetap terbaca meski dipotret miring dari kamera ponsel.
 */
function AnswerSheetTemplate({ config, layout, innerRef }) {
  const metrics = computeLayoutMetrics(layout);
  const normalized = metrics.layout;
  const fiducials = computeFiducials(normalized);
  const pages = Array.from({ length: metrics.pageCount }, (_, index) => index);

  const headerTopMm = normalized.marginMm;
  const headerHeightMm = normalized.gridTopMm - normalized.marginMm - 4;
  const innerWidthMm = normalized.pageWidthMm - 2 * normalized.marginMm;
  const bubbleFontPx = normalized.bubbleDiameterMm * 0.4 * PX_PER_MM;

  return (
    <div ref={innerRef} className="print-area space-y-6">
      {pages.map((page) => {
        const centers = computeBubbleCenters(normalized, page);
        const anchors = computeNumberAnchors(normalized, page);
        const { count, start } = computePageItems(normalized, page);

        return (
          <div
            key={page}
            className={cx(
              'relative mx-auto overflow-hidden border border-slate-300 bg-white font-sans text-black',
              page < metrics.pageCount - 1 && 'print-break',
            )}
            style={{ width: mm(normalized.pageWidthMm), height: mm(normalized.pageHeightMm) }}
          >
            {fiducials.map((fiducial) => (
              <span
                key={fiducial.key}
                className="absolute bg-black"
                style={{
                  width: mm(normalized.fiducialSizeMm),
                  height: mm(normalized.fiducialSizeMm),
                  left: mm(fiducial.xMm - normalized.fiducialSizeMm / 2),
                  top: mm(fiducial.yMm - normalized.fiducialSizeMm / 2),
                }}
              />
            ))}

            <div
              className="absolute"
              style={{
                left: mm(normalized.marginMm),
                top: mm(headerTopMm),
                width: mm(innerWidthMm),
                height: mm(headerHeightMm),
              }}
            >
              <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-1.5">
                <div>
                  <p className="font-extrabold uppercase leading-tight tracking-wide" style={{ fontSize: mm(3.4) }}>
                    {config.institution || 'Nama Institusi'}
                  </p>
                  <p className="leading-tight" style={{ fontSize: mm(2.5) }}>
                    {config.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold uppercase" style={{ fontSize: mm(2.8) }}>
                    Lembar Jawaban Komputer
                  </p>
                  <p style={{ fontSize: mm(2.5) }}>
                    Halaman {page + 1} dari {metrics.pageCount}
                  </p>
                </div>
              </div>

              <p className="mt-1.5 font-bold uppercase tracking-wide" style={{ fontSize: mm(2.9) }}>
                {config.testName} — {config.instrumentType}
              </p>

              <div className="mt-2 border border-black" style={{ padding: mm(2) }}>
                <div className="flex" style={{ gap: mm(6) }}>
                  <IdentityLine label="Nama" widthMm={innerWidthMm * 0.55} layout={normalized} />
                  <IdentityLine label="No. Peserta" widthMm={innerWidthMm * 0.35} layout={normalized} />
                </div>
                <div className="mt-1 flex" style={{ gap: mm(6) }}>
                  <IdentityLine label="Kelas / Unit" widthMm={innerWidthMm * 0.55} layout={normalized} />
                  <IdentityLine label="Tanggal" widthMm={innerWidthMm * 0.35} layout={normalized} />
                </div>
              </div>

              {page === 0 ? (
                <div className="mt-2 border border-black bg-slate-50" style={{ padding: mm(2) }}>
                  <p className="font-bold uppercase tracking-wide" style={{ fontSize: mm(2.4) }}>
                    Petunjuk Pengisian
                  </p>
                  <ol
                    className="mt-0.5 list-decimal leading-snug"
                    style={{ fontSize: mm(2.2), paddingLeft: mm(4) }}
                  >
                    <li>Tulis nama dengan HURUF KAPITAL yang jelas pada kolom identitas.</li>
                    <li>Gunakan pensil 2B atau pulpen hitam. Jangan gunakan tipp-ex.</li>
                    <li>
                      Tandai jawaban dengan menghitamkan bulatan penuh (●) atau memberi tanda silang (X) pada satu
                      pilihan saja.
                    </li>
                    <li>Jawaban ganda, ragu, atau terhapus tidak akan dinilai.</li>
                    <li>Jaga keempat kotak hitam di sudut lembar tetap bersih — kotak itu acuan pemindai.</li>
                  </ol>
                </div>
              ) : null}
            </div>

            {anchors.map((anchor) => (
              <span
                key={`no-${anchor.no}`}
                className="absolute text-right font-bold tabular-nums text-black"
                style={{
                  left: mm(anchor.xMm),
                  top: mm(anchor.yMm - normalized.rowPitchMm / 2),
                  width: mm(anchor.widthMm),
                  height: mm(normalized.rowPitchMm),
                  lineHeight: mm(normalized.rowPitchMm),
                  fontSize: mm(2.6),
                }}
              >
                {anchor.no}.
              </span>
            ))}

            {centers.map((center) => (
              <span
                key={`${center.no}-${center.option}`}
                className="absolute flex items-center justify-center rounded-full border border-black font-semibold leading-none text-black"
                style={{
                  width: mm(normalized.bubbleDiameterMm),
                  height: mm(normalized.bubbleDiameterMm),
                  left: mm(center.xMm - normalized.bubbleDiameterMm / 2),
                  top: mm(center.yMm - normalized.bubbleDiameterMm / 2),
                  fontSize: `${bubbleFontPx}px`,
                }}
              >
                {center.option}
              </span>
            ))}

            <div
              className="absolute flex items-end justify-between border-t border-black"
              style={{
                left: mm(normalized.marginMm),
                right: mm(normalized.marginMm),
                bottom: mm(normalized.marginMm + 2),
                paddingTop: mm(1.5),
                fontSize: mm(2.3),
              }}
            >
              <span>
                Butir {start + 1}–{start + count} — Opsi: {normalized.optionSet.split('').join('/')}
              </span>
              <span className="text-right">
                Paraf Pengawas
                <span className="mt-3 block bg-black" style={{ width: mm(25), height: '1px' }} />
              </span>
            </div>
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
 * 10. PANEL PEMINDAIAN LJK (OMR LURING) DAN ENTRI MANUAL
 * ------------------------------------------------------------------ */

const STATUS_META = {
  pending: { label: 'Menunggu', tone: 'bg-slate-100 text-slate-600', icon: ImageIcon },
  processing: { label: 'Dibaca', tone: 'bg-sky-100 text-sky-700', icon: Loader2 },
  done: { label: 'Selesai', tone: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  error: { label: 'Gagal', tone: 'bg-rose-100 text-rose-700', icon: XCircle },
};

function SheetCard({ sheet, metrics, onRemove, onInspect, onRename, onPageIndex, onCalibrate }) {
  const meta = STATUS_META[sheet.status] || STATUS_META.pending;
  const Icon = meta.icon;
  const marked = sheet.answers?.filter(Boolean).length || 0;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="relative aspect-[3/4] bg-slate-100">
        {sheet.thumb ? (
          <img src={sheet.thumb} alt={sheet.fileName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">
            <Keyboard className="h-8 w-8" />
          </div>
        )}
        <span
          className={cx(
            'absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            meta.tone,
          )}
        >
          <Icon className={cx('h-3 w-3', sheet.status === 'processing' && 'animate-spin')} />
          {sheet.source === 'manual' ? 'Manual' : meta.label}
        </span>
        <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
          {sheet.image ? (
            <button
              type="button"
              onClick={() => onCalibrate(sheet.id)}
              className="rounded-md bg-white/90 p-1.5 text-slate-600 hover:bg-white"
              title="Kalibrasi pembacaan"
            >
              <Crosshair className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {sheet.status === 'done' ? (
            <button
              type="button"
              onClick={() => onInspect(sheet.id)}
              className="rounded-md bg-white/90 p-1.5 text-slate-600 hover:bg-white"
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

      <div className="space-y-1.5 px-2.5 py-2">
        <input
          value={sheet.name}
          onChange={(event) => onRename(sheet.id, event.target.value.toUpperCase())}
          placeholder="NAMA PESERTA"
          className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs font-semibold uppercase text-slate-800 focus:border-indigo-400 focus:outline-none"
        />
        {metrics.pageCount > 1 ? (
          <select
            value={sheet.pageIndex || 0}
            onChange={(event) => onPageIndex(sheet.id, Number(event.target.value))}
            className="w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-600 focus:border-indigo-400 focus:outline-none"
          >
            {Array.from({ length: metrics.pageCount }, (_, page) => (
              <option key={page} value={page}>
                Halaman {page + 1}
              </option>
            ))}
          </select>
        ) : null}
        <p className="truncate text-[10px] text-slate-500" title={sheet.error || sheet.fileName}>
          {sheet.status === 'error' ? sheet.error : `${marked} butir terbaca — ${sheet.fileName}`}
        </p>
      </div>
    </div>
  );
}

/** Entri manual: jalur cadangan ketika citra gagal dibaca atau kamera tidak dipakai. */
function ManualEntryCard({ layout, onSubmit }) {
  const [name, setName] = useState('');
  const [answers, setAnswers] = useState(() => new Array(layout.numQuestions).fill(null));
  const [bulk, setBulk] = useState('');
  const options = layout.optionSet.split('');

  useEffect(() => {
    setAnswers((prev) =>
      prev.length === layout.numQuestions
        ? prev
        : Array.from({ length: layout.numQuestions }, (_, index) => prev[index] ?? null),
    );
  }, [layout.numQuestions]);

  const filled = answers.filter(Boolean).length;

  const submit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim().toUpperCase(), answers);
    setName('');
    setAnswers(new Array(layout.numQuestions).fill(null));
    setBulk('');
  };

  return (
    <Card
      title="Entri Manual"
      description="Ketik pola jawaban langsung bila lembar tidak terbaca kamera atau koreksi dilakukan tanpa pemindaian."
      icon={Keyboard}
      actions={
        <Button icon={Play} onClick={submit} disabled={!name.trim() || !filled}>
          Tambah Peserta
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama Peserta">
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value.toUpperCase())}
              placeholder="NAMA LENGKAP"
              className="uppercase"
            />
          </Field>
          <Field label="Tempel Pola Jawaban" hint={`Maksimal ${layout.numQuestions} huruf, tanda - untuk kosong.`}>
            <div className="flex gap-2">
              <TextInput
                value={bulk}
                onChange={(event) => setBulk(event.target.value)}
                placeholder="ABCDE-ACB…"
                className="font-mono uppercase tracking-widest"
              />
              <Button
                variant="secondary"
                icon={Wand2}
                onClick={() => setAnswers(parseBulkAnswers(bulk, layout))}
                disabled={!bulk.trim()}
              >
                Isi
              </Button>
            </div>
          </Field>
        </div>

        <p className="text-xs text-slate-500">
          {filled}/{layout.numQuestions} butir terisi
        </p>

        <div className="thin-scroll grid max-h-72 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {answers.map((letter, index) => (
            <div key={index} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1">
              <span className="w-7 text-right text-[11px] font-semibold tabular-nums text-slate-500">{index + 1}.</span>
              <div className="flex flex-1 gap-1">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => {
                        const next = prev.slice();
                        next[index] = next[index] === option ? null : option;
                        return next;
                      })
                    }
                    className={cx(
                      'h-7 min-w-[28px] flex-1 rounded text-[11px] font-semibold transition-colors',
                      letter === option
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-slate-400 ring-1 ring-inset ring-slate-200 hover:text-indigo-600',
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/**
 * Kalibrasi: memperlihatkan titik yang benar-benar disampel detektor di atas
 * citra asli. Pemeriksa menggeser ambang dan langsung melihat akibatnya,
 * sehingga keputusan pembacaan dapat diaudit alih-alih dipercaya begitu saja.
 */
function CalibrationCard({ sheet, layout, omrOptions, onOmrOptions, onClose, onApply }) {
  const canvasRef = useRef(null);
  const [detection, setDetection] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!sheet?.image) return undefined;

    setBusy(true);
    setError('');
    (async () => {
      try {
        const grayscale = await grayscaleFromSource(sheet.image, omrOptions.maxDim);
        const result = detectSheet(grayscale, layout, sheet.pageIndex || 0, omrOptions);
        if (cancelled) return;
        setDetection(result);
        if (!result.ok) setError(result.error);
        await paintDetectionOverlay(canvasRef.current, sheet.image, result, omrOptions);
      } catch (issue) {
        if (!cancelled) setError(issue?.message || 'Kalibrasi gagal.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sheet?.id, sheet?.image, sheet?.pageIndex, layout, omrOptions]);

  if (!sheet) return null;

  return (
    <Card
      title={`Kalibrasi — ${sheet.name || sheet.fileName}`}
      description="Lingkaran hijau menandai bulatan yang dinilai terisi; kotak biru adalah penanda sudut yang ditemukan."
      icon={Crosshair}
      actions={
        <>
          <Button
            size="sm"
            variant="secondary"
            icon={CheckCircle2}
            onClick={() => onApply(sheet.id, detection)}
            disabled={!detection?.ok}
          >
            Terapkan ke Lembar Ini
          </Button>
          <Button size="sm" variant="ghost" icon={X} onClick={onClose}>
            Tutup
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="thin-scroll overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-2">
          <canvas ref={canvasRef} className="mx-auto block max-w-full" />
        </div>

        <div className="space-y-3">
          {busy ? (
            <p className="inline-flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Membaca ulang lembar…
            </p>
          ) : null}

          {error ? <Banner tone="error" icon={AlertTriangle}>{error}</Banner> : null}

          {detection?.ok ? (
            <dl className="space-y-1.5 text-xs">
              {[
                ['Butir terbaca', `${detection.marked}/${detection.total}`],
                ['Garis dasar lembar', fmt(detection.baseline, 3)],
                ['Ambang Otsu', Math.round(detection.threshold)],
                ['Tidak terbaca', detection.flags.length],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-dashed border-slate-200 pb-1">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <Field
            label={`Ambang kehitaman neto — ${omrOptions.fillThreshold.toFixed(2)}`}
            hint="Seberapa jauh sebuah bulatan harus lebih gelap dari garis dasar lembar untuk dianggap ditandai."
          >
            <input
              type="range"
              min="0.05"
              max="0.6"
              step="0.01"
              value={omrOptions.fillThreshold}
              onChange={(event) => onOmrOptions({ ...omrOptions, fillThreshold: Number(event.target.value) })}
              className="w-full accent-indigo-600"
            />
          </Field>

          <Field
            label={`Selisih minimum antaropsi — ${omrOptions.marginThreshold.toFixed(2)}`}
            hint="Menjaga jawaban ganda atau ragu tetap dihitung sebagai tidak dijawab."
          >
            <input
              type="range"
              min="0.02"
              max="0.4"
              step="0.01"
              value={omrOptions.marginThreshold}
              onChange={(event) => onOmrOptions({ ...omrOptions, marginThreshold: Number(event.target.value) })}
              className="w-full accent-indigo-600"
            />
          </Field>

          <Field
            label={`Radius sampel — ${omrOptions.sampleRadiusFactor.toFixed(2)} × diameter`}
            hint="Perkecil bila cincin bulatan ikut tersampel, perbesar bila penandaan meleset dari pusat."
          >
            <input
              type="range"
              min="0.2"
              max="0.45"
              step="0.01"
              value={omrOptions.sampleRadiusFactor}
              onChange={(event) => onOmrOptions({ ...omrOptions, sampleRadiusFactor: Number(event.target.value) })}
              className="w-full accent-indigo-600"
            />
          </Field>

          <Button
            size="sm"
            variant="ghost"
            icon={Eraser}
            onClick={() => onOmrOptions({ ...DEFAULT_OMR_OPTIONS })}
          >
            Kembalikan ke bawaan
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ScanPanel({
  sheets,
  layout,
  metrics,
  omrOptions,
  onOmrOptions,
  processing,
  progress,
  calibrationId,
  onCalibrate,
  onApplyCalibration,
  onAdd,
  onCapture,
  onRemove,
  onClearAll,
  onProcess,
  onInspect,
  onRename,
  onPageIndex,
  onManualAdd,
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const native = isNativeAndroid();

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
    if (files.length) onAdd(files);
  };

  const pending = sheets.filter((sheet) => sheet.status === 'pending' || sheet.status === 'error').length;
  const calibrationSheet = sheets.find((sheet) => sheet.id === calibrationId) || null;

  return (
    <div className="space-y-4">
      {!metrics.printable ? (
        <Banner tone="warn" icon={AlertTriangle} title="Layout belum layak cetak">
          Perbaiki konfigurasi pada panel Layout LJK sebelum memindai. Selama geometri tidak sah, titik sampel detektor
          tidak akan jatuh di atas bulatan yang tercetak.
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
        <p className="mt-3 text-sm font-semibold text-slate-800">Ambil atau unggah citra LJK</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
          Pastikan keempat kotak hitam di sudut lembar ikut terpotret dan tidak terpotong. Kotak itulah acuan yang
          dipakai untuk meluruskan grid, sehingga foto miring pun tetap terbaca.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button icon={ImageIcon} onClick={() => inputRef.current?.click()}>
            Pilih Berkas
          </Button>
          {native ? (
            <Button variant="secondary" icon={Camera} onClick={onCapture}>
              Potret dengan Kamera
            </Button>
          ) : null}
          {sheets.length ? (
            <Button variant="secondary" icon={Trash2} onClick={onClearAll}>
              Bersihkan Semua
            </Button>
          ) : null}
        </div>
      </div>

      {calibrationSheet ? (
        <CalibrationCard
          sheet={calibrationSheet}
          layout={layout}
          omrOptions={omrOptions}
          onOmrOptions={onOmrOptions}
          onClose={() => onCalibrate(null)}
          onApply={onApplyCalibration}
        />
      ) : null}

      {sheets.length ? (
        <Card
          title={`Antrean Pembacaan — ${sheets.length} lembar`}
          description={`${layout.numQuestions} butir, opsi ${layout.optionSet.split('').join('/')}, ${metrics.pageCount} halaman per peserta`}
          icon={Layers}
          actions={
            <Button icon={processing ? Loader2 : Play} onClick={onProcess} disabled={processing || !pending}>
              {processing ? 'Membaca…' : `Baca ${pending ? `${pending} Lembar` : 'Antrean'}`}
            </Button>
          }
        >
          {processing ? (
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lembar {progress.current} dari {progress.total}
                </span>
                <span className="tabular-nums">
                  {Math.round((progress.current / Math.max(1, progress.total)) * 100)}%
                </span>
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
              <SheetCard
                key={sheet.id}
                sheet={sheet}
                metrics={metrics}
                onRemove={onRemove}
                onInspect={onInspect}
                onRename={onRename}
                onPageIndex={onPageIndex}
                onCalibrate={onCalibrate}
              />
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState icon={ScanLine} title="Belum ada lembar jawaban">
          Unggah citra LJK untuk dibaca mesin OMR luring, atau masukkan pola jawaban lewat entri manual di bawah.
        </EmptyState>
      )}

      <ManualEntryCard layout={layout} onSubmit={onManualAdd} />
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

function ConfigPanel({ config, onConfig, logo, onLogo }) {
  const set = (patch) => onConfig({ ...config, ...patch });

  return (
    <div className="space-y-4">
      <Banner tone="success" icon={WifiOff} title="Aplikasi berjalan luring penuh">
        Tidak ada kunci API, tidak ada panggilan jaringan, dan tidak ada data peserta yang meninggalkan perangkat.
        Pembacaan lembar dikerjakan mesin OMR di dalam peramban, sehingga koreksi tetap berjalan di ruang ujian tanpa
        sinyal sekalipun.
      </Banner>

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
            <Field label="Logo (opsional)" hint="Format PNG/JPG, dibaca dari berkas lokal dan disimpan di perangkat.">
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

        <Card title="Identitas Instrumen" description="Keterangan administrasi yang tercetak pada laporan." icon={Settings2}>
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
            <Field label="Nama Pemeriksa">
              <TextInput
                value={config.examiner}
                onChange={(event) => set({ examiner: event.target.value })}
                placeholder="Nama lengkap dan gelar"
              />
            </Field>
            <Field label="Jumlah butir dan opsi jawaban" hint="Diatur bersama geometri lembar pada panel Layout LJK.">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Lihat panel Layout LJK
              </div>
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
            <Toggle
              checked={config.mergeByName}
              onChange={(value) => set({ mergeByName: value })}
              label="Gabungkan lembar dengan nama sama"
              hint="Diperlukan bila satu peserta mengisi lebih dari satu halaman LJK. Jawaban dari tiap halaman disatukan menjadi satu baris nilai."
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
 * 14b. PANEL LAYOUT LJK
 * ------------------------------------------------------------------ */

const LAYOUT_FIELDS = [
  { key: 'numQuestions', label: 'Jumlah Butir', step: 1, unit: '', hint: 'Jumlah soal pada instrumen.' },
  { key: 'columns', label: 'Jumlah Kolom', step: 1, unit: '', hint: 'Kolom bulatan per halaman.' },
  { key: 'rowsPerColumn', label: 'Baris per Kolom', step: 1, unit: '', hint: 'Kapasitas satu kolom.' },
  { key: 'bubbleDiameterMm', label: 'Diameter Bulatan', step: 0.1, unit: 'mm', hint: 'Bulatan lebih besar lebih mudah dibaca kamera.' },
  { key: 'bubbleGapMm', label: 'Jarak Antarbulatan', step: 0.1, unit: 'mm', hint: 'Celah mendatar antaropsi.' },
  { key: 'rowPitchMm', label: 'Jarak Antarbaris', step: 0.1, unit: 'mm', hint: 'Jarak tegak antarbutir.' },
  { key: 'columnGapMm', label: 'Jarak Antarkolom', step: 0.5, unit: 'mm', hint: 'Celah antarkolom butir.' },
  { key: 'numberGutterMm', label: 'Lebar Kolom Nomor', step: 0.5, unit: 'mm', hint: 'Ruang untuk nomor butir.' },
  { key: 'gridTopMm', label: 'Awal Grid dari Atas', step: 1, unit: 'mm', hint: 'Menentukan tinggi area kop dan identitas.' },
  { key: 'marginMm', label: 'Margin Halaman', step: 1, unit: 'mm', hint: 'Batas cetak sisi halaman.' },
  { key: 'footerMm', label: 'Tinggi Kaki Halaman', step: 1, unit: 'mm', hint: 'Ruang paraf pengawas.' },
  { key: 'fiducialSizeMm', label: 'Ukuran Penanda Sudut', step: 0.5, unit: 'mm', hint: 'Kotak hitam acuan pemindai.' },
  { key: 'fiducialInsetMm', label: 'Jarak Penanda dari Tepi', step: 0.5, unit: 'mm', hint: 'Semakin ke tepi, semakin mudah dikenali.' },
];

function LayoutPanel({ layout, metrics, onLayout, onReset }) {
  const set = (patch) => onLayout(normalizeLayout({ ...layout, ...patch }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Grid3x3} label="Kapasitas Halaman" value={metrics.perPage} sub={`${metrics.layout.columns} kolom × ${metrics.layout.rowsPerColumn} baris`} />
        <StatCard icon={Layers} label="Jumlah Halaman" value={metrics.pageCount} sub={`${metrics.layout.numQuestions} butir`} tone="emerald" />
        <StatCard icon={Ruler} label="Baris Maksimum" value={metrics.maxRows} sub="pada tinggi halaman saat ini" tone="amber" />
        <StatCard
          icon={metrics.printable ? CheckCircle2 : AlertTriangle}
          label="Status Geometri"
          value={metrics.printable ? 'Layak' : 'Perbaiki'}
          sub={`kolom ${metrics.columnWidthMm.toFixed(1)} mm / butuh ${metrics.requiredColumnMm.toFixed(1)} mm`}
          tone={metrics.printable ? 'slate' : 'rose'}
        />
      </div>

      {metrics.issues.length ? (
        <Banner tone={metrics.printable ? 'info' : 'warn'} icon={AlertTriangle} title="Catatan atas layout">
          <ul className="list-disc space-y-0.5 pl-4">
            {metrics.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Banner>
      ) : null}

      <Card
        title="Geometri Lembar Jawaban"
        description="Nilai di bawah ini menjadi acuan tunggal: template dicetak dari angka yang sama dengan yang dibaca mesin OMR."
        icon={Ruler}
        actions={
          <Button size="sm" variant="secondary" icon={Eraser} onClick={onReset}>
            Kembalikan Bawaan
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Opsi Jawaban" hint="Jumlah pilihan per butir.">
            <SelectInput value={layout.optionSet} onChange={(event) => set({ optionSet: event.target.value })}>
              <option value="ABCD">A / B / C / D</option>
              <option value="ABCDE">A / B / C / D / E</option>
            </SelectInput>
          </Field>

          {LAYOUT_FIELDS.map((field) => {
            const bounds = LAYOUT_BOUNDS[field.key];
            return (
              <Field
                key={field.key}
                label={field.unit ? `${field.label} (${field.unit})` : field.label}
                hint={`${field.hint} Rentang ${bounds[0]}–${bounds[1]}.`}
              >
                <TextInput
                  type="number"
                  step={field.step}
                  min={bounds[0]}
                  max={bounds[1]}
                  value={layout[field.key]}
                  onChange={(event) => set({ [field.key]: Number(event.target.value) })}
                />
              </Field>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 15. KOMPONEN AKAR
 * ------------------------------------------------------------------ */

const TABS = [
  { id: 'konfigurasi', label: 'Konfigurasi', icon: Settings2 },
  { id: 'layout', label: 'Layout LJK', icon: Ruler },
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
  const [layout, setLayout] = useState(() => normalizeLayout(persisted?.layout || DEFAULT_LAYOUT));
  const [omrOptions, setOmrOptions] = useState(() => ({
    ...DEFAULT_OMR_OPTIONS,
    ...(persisted?.omrOptions || {}),
  }));
  const [answerKey, setAnswerKey] = useState(() => {
    const size = normalizeLayout(persisted?.layout || DEFAULT_LAYOUT).numQuestions;
    const stored = persisted?.answerKey || [];
    return Array.from({ length: size }, (_, index) => stored[index] || '');
  });
  const [sheets, setSheets] = useState(() => persisted?.sheets || []);
  const [logo, setLogo] = useState(() => persisted?.logo || '');

  const [tab, setTab] = useState('konfigurasi');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [inspectId, setInspectId] = useState(null);
  const [calibrationId, setCalibrationId] = useState(null);
  const [busyExport, setBusyExport] = useState('');
  const [toast, setToast] = useState(null);

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
    const payload = {
      config,
      layout,
      omrOptions,
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
  }, [config, layout, omrOptions, answerKey, logo, sheets]);

  /* ---- Geometri dan konfigurasi turunan ---- */
  const metrics = useMemo(() => computeLayoutMetrics(layout), [layout]);
  const scoringConfig = useMemo(
    () => ({ ...config, numQuestions: layout.numQuestions, optionSet: layout.optionSet }),
    [config, layout.numQuestions, layout.optionSet],
  );

  /* ---- Sinkronisasi panjang larik ketika jumlah butir berubah ---- */
  useEffect(() => {
    setAnswerKey((prev) =>
      prev.length === layout.numQuestions
        ? prev
        : Array.from({ length: layout.numQuestions }, (_, index) => prev[index] || ''),
    );
    setSheets((prev) =>
      prev.map((sheet) =>
        sheet.answers && sheet.answers.length !== layout.numQuestions
          ? {
              ...sheet,
              answers: Array.from({ length: layout.numQuestions }, (_, index) => sheet.answers[index] ?? null),
            }
          : sheet,
      ),
    );
  }, [layout.numQuestions]);

  /* ---- Turunan psikometrik ---- */
  const graded = useMemo(() => {
    const finished = sheets.filter((sheet) => sheet.status === 'done');

    let units = finished.map((sheet) => ({ ...sheet, sheetCount: 1 }));
    if (config.mergeByName) {
      const merged = new Map();
      units.forEach((unit) => {
        const key = (unit.name || '').trim().toUpperCase() || unit.id;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { ...unit, answers: unit.answers.slice() });
          return;
        }
        existing.answers = existing.answers.map((letter, index) => letter ?? unit.answers[index] ?? null);
        existing.sheetCount += 1;
      });
      units = [...merged.values()];
    }

    return units.map((unit) => gradeSheet(unit, answerKey, scoringConfig));
  }, [sheets, answerKey, scoringConfig, config.mergeByName]);

  const { rows, sample, basis } = useMemo(() => applyNorms(graded, scoringConfig), [graded, scoringConfig]);
  const itemStats = useMemo(() => analyzeItems(rows, answerKey, scoringConfig), [rows, answerKey, scoringConfig]);

  const inspected = useMemo(() => rows.find((row) => row.id === inspectId) || null, [rows, inspectId]);
  const keyFilled = answerKey.filter(Boolean).length;

  /* ---- Manipulasi lembar ---- */
  const updateSheet = useCallback((id, patch) => {
    setSheets((prev) => prev.map((sheet) => (sheet.id === id ? { ...sheet, ...patch } : sheet)));
  }, []);

  const makeSheet = useCallback(
    (fileName, image) => ({
      id: uid(),
      fileName,
      name: fileName.replace(/\.[^.]+$/, '').toUpperCase(),
      image: image?.full || '',
      thumb: image?.thumb || '',
      status: 'pending',
      source: 'omr',
      pageIndex: 0,
      error: null,
      answers: new Array(layout.numQuestions).fill(null),
    }),
    [layout.numQuestions],
  );

  const handleAddFiles = useCallback(
    async (files) => {
      const prepared = await Promise.all(
        files.map(async (file) => {
          try {
            return makeSheet(file.name, await prepareImage(file));
          } catch (error) {
            return null;
          }
        }),
      );
      const valid = prepared.filter(Boolean);
      setSheets((prev) => [...prev, ...valid]);
      if (valid.length) notify(`${valid.length} lembar ditambahkan ke antrean.`, 'success');
    },
    [makeSheet, notify],
  );

  const handleCapture = useCallback(async () => {
    try {
      const dataUrl = await capturePhoto();
      if (!dataUrl) return;
      const image = await prepareImageFromDataUrl(dataUrl);
      setSheets((prev) => [...prev, makeSheet(`kamera-${prev.length + 1}.jpg`, image)]);
      notify('Citra dari kamera ditambahkan.', 'success');
    } catch (error) {
      notify(error?.message || 'Pengambilan citra dibatalkan.', 'warn');
    }
  }, [makeSheet, notify]);

  const handleProcess = useCallback(async () => {
    const targets = sheets.filter((sheet) => sheet.status === 'pending' || sheet.status === 'error');
    if (!targets.length) return;

    setProcessing(true);
    setProgress({ current: 0, total: targets.length });

    let success = 0;
    let failure = 0;

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      setProgress({ current: index + 1, total: targets.length });
      updateSheet(target.id, { status: 'processing', error: null });
      await sleep(0); // memberi kesempatan antarmuka memperbarui bilah kemajuan

      try {
        const detection = await readSheetOffline(target, layout, omrOptions);
        updateSheet(target.id, {
          status: 'done',
          source: 'omr',
          answers: answersFromDetection(detection, layout, target.answers),
          confidence: detection.confidence,
          baseline: detection.baseline,
          error: null,
          scannedAt: Date.now(),
        });
        success += 1;
      } catch (error) {
        updateSheet(target.id, { status: 'error', error: error?.message || 'Lembar gagal dibaca.' });
        failure += 1;
      }
    }

    setProcessing(false);
    notify(
      `Pembacaan selesai: ${success} berhasil${failure ? `, ${failure} gagal` : ''}.`,
      failure ? 'warn' : 'success',
    );
    if (success) setTab('hasil');
  }, [sheets, layout, omrOptions, updateSheet, notify]);

  const handleApplyCalibration = useCallback(
    (id, detection) => {
      if (!detection?.ok) return;
      const target = sheets.find((sheet) => sheet.id === id);
      updateSheet(id, {
        status: 'done',
        source: 'omr',
        answers: answersFromDetection(detection, layout, target?.answers),
        confidence: detection.confidence,
        baseline: detection.baseline,
        error: null,
      });
      notify('Hasil kalibrasi diterapkan pada lembar ini.', 'success');
    },
    [sheets, layout, updateSheet, notify],
  );

  const handleManualAdd = useCallback(
    (name, answers) => {
      setSheets((prev) => [
        ...prev,
        {
          id: uid(),
          fileName: 'entri manual',
          name,
          image: '',
          thumb: '',
          status: 'done',
          source: 'manual',
          pageIndex: 0,
          error: null,
          answers: answers.slice(),
        },
      ]);
      notify(`${name} ditambahkan lewat entri manual.`, 'success');
    },
    [notify],
  );

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
  const handlePageIndex = useCallback((id, pageIndex) => updateSheet(id, { pageIndex }), [updateSheet]);
  const handleRemove = useCallback((id) => setSheets((prev) => prev.filter((sheet) => sheet.id !== id)), []);

  /* ---- Ekspor ---- */
  const describeTarget = (result) =>
    result?.target === 'android' ? 'Berkas tersimpan di folder Documents.' : 'Berkas berhasil diunduh.';

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
      const result = await exportElementToPdf(
        reportRef.current,
        `laporan-${slugify(config.testName)}-${config.testDate}.pdf`,
        'portrait',
      );
      notify(`Laporan PDF selesai. ${describeTarget(result)}`, 'success');
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
      const result = await exportElementToPdf(
        templateRef.current,
        `template-ljk-${slugify(config.testName)}.pdf`,
        'portrait',
      );
      notify(`Template LJK selesai. ${describeTarget(result)}`, 'success');
    } catch (error) {
      notify(error?.message || 'Ekspor template gagal.', 'error');
    } finally {
      setBusyExport('');
    }
  }, [config.testName, notify]);

  const handleExportCsv = useCallback(async () => {
    if (!rows.length) {
      notify('Belum ada hasil untuk diekspor.', 'warn');
      return;
    }
    try {
      const result = await exportCsv(
        rows,
        scoringConfig,
        `rekap-${slugify(config.testName)}-${config.testDate}.csv`,
      );
      notify(`Rekapitulasi CSV selesai. ${describeTarget(result)}`, 'success');
    } catch (error) {
      notify(error?.message || 'Ekspor CSV gagal.', 'error');
    }
  }, [rows, scoringConfig, config.testName, config.testDate, notify]);

  const handleResetAll = useCallback(() => {
    if (!window.confirm('Hapus seluruh lembar jawaban dan hasil koreksi pada sesi ini?')) return;
    setSheets([]);
    setCalibrationId(null);
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
                Koreksi LJK luring untuk instrumen psikologis — tanpa jaringan
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <WifiOff className="h-3.5 w-3.5" /> Luring
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              <Users className="h-3.5 w-3.5" /> {rows.length} peserta
            </span>
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                keyFilled === layout.numQuestions ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
              )}
            >
              <KeyRound className="h-3.5 w-3.5" /> {keyFilled}/{layout.numQuestions} kunci
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
                  'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
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
          <ConfigPanel config={config} onConfig={setConfig} logo={logo} onLogo={setLogo} />
        ) : null}

        {tab === 'layout' ? (
          <LayoutPanel
            layout={layout}
            metrics={metrics}
            onLayout={setLayout}
            onReset={() => setLayout(normalizeLayout(DEFAULT_LAYOUT))}
          />
        ) : null}

        {tab === 'kunci' ? (
          <AnswerKeyEditor config={scoringConfig} answerKey={answerKey} onChange={setAnswerKey} sheets={sheets} />
        ) : null}

        {tab === 'pindai' ? (
          <ScanPanel
            sheets={sheets}
            layout={metrics.layout}
            metrics={metrics}
            omrOptions={omrOptions}
            onOmrOptions={setOmrOptions}
            processing={processing}
            progress={progress}
            calibrationId={calibrationId}
            onCalibrate={setCalibrationId}
            onApplyCalibration={handleApplyCalibration}
            onAdd={handleAddFiles}
            onCapture={handleCapture}
            onRemove={handleRemove}
            onClearAll={handleResetAll}
            onProcess={handleProcess}
            onInspect={setInspectId}
            onRename={handleRename}
            onPageIndex={handlePageIndex}
            onManualAdd={handleManualAdd}
          />
        ) : null}

        {tab === 'hasil' ? (
          <div className="space-y-4">
            {!rows.length ? (
              <EmptyState icon={Table2} title="Belum ada nilai yang dihitung">
                Setelah lembar jawaban dibaca dan kunci ditetapkan, tabel nilai, statistik kelompok, serta laporan resmi
                akan tersusun secara otomatis di halaman ini.
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
                    value={rows.filter((row) => row.blank > layout.numQuestions / 2).length}
                    sub="lebih dari separuh butir kosong"
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
                    config={scoringConfig}
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
                      config={scoringConfig}
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
          <AnalysisPanel rows={rows} itemStats={itemStats} sample={sample} basis={basis} config={scoringConfig} />
        ) : null}

        {tab === 'template' ? (
          <div className="space-y-4">
            <Card
              title="Template Lembar Jawaban"
              description="Dirender dari geometri yang sama dengan yang dibaca mesin OMR, sehingga kustomisasi layout tidak pernah membuat pembacaan melenceng."
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
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ['Butir', metrics.layout.numQuestions],
                  ['Kolom × Baris', `${metrics.layout.columns} × ${metrics.layout.rowsPerColumn}`],
                  ['Kapasitas Halaman', `${metrics.perPage} butir`],
                  ['Jumlah Halaman', metrics.pageCount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="text-sm font-bold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Ubah geometri pada panel Layout LJK. Cetak pada kertas A4 dengan skala 100% — penskalaan otomatis
                pencetak menggeser posisi bulatan terhadap penanda sudut dan menurunkan akurasi pembacaan.
              </p>
            </Card>

            <div className="thin-scroll overflow-x-auto rounded-xl bg-slate-200 p-4">
              <AnswerSheetTemplate config={config} layout={metrics.layout} innerRef={templateRef} />
            </div>
          </div>
        ) : null}
      </main>

      <footer className="no-print mx-auto max-w-7xl px-4 pb-10 pt-2 text-center text-[11px] leading-relaxed text-slate-400 sm:px-6">
        AI Grader Sistem — seluruh pemrosesan berlangsung di perangkat, tanpa jaringan. Hasil pembacaan otomatis tetap
        memerlukan verifikasi pemeriksa sebelum digunakan sebagai dasar keputusan asesmen.
      </footer>

      <DetailModal
        row={inspected}
        config={scoringConfig}
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
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-auto opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
