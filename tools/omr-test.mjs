/**
 * Uji akurasi mesin OMR — berjalan di Node tanpa peramban dan tanpa dependensi.
 *
 * Lembar sintetis digambar langsung ke penyangga keabuan memakai geometri yang
 * sama dengan yang dipakai perender template, lalu didegradasi menyerupai foto
 * ponsel (rotasi, keystone proyektif, penggelapan, vignet, derau, pelunakan
 * kompresi) sebelum diserahkan ke detektor. Yang diperiksa bukan sekadar
 * ketepatan pembacaan, melainkan juga sifat gagal-aman: ketika grid tidak
 * selaras, detektor wajib menolak membaca alih-alih mengembalikan pola jawaban
 * yang tampak wajar padahal keliru.
 *
 * Jalankan: npm run test:omr
 */

import {
  computeBubbleCenters,
  computeFiducials,
  computeLayoutMetrics,
  computePageItems,
  normalizeLayout,
} from '../src/ljk/layout.js';
import { DEFAULT_OMR_OPTIONS, detectSheet, projectPoint, solveHomography } from '../src/ljk/omr.js';

const PX_PER_MM = 4;

/* ------------------------------ Kanvas keabuan ---------------------------- */

function createSurface(widthMm, heightMm) {
  const width = Math.round(widthMm * PX_PER_MM);
  const height = Math.round(heightMm * PX_PER_MM);
  return { gray: new Uint8ClampedArray(width * height).fill(255), width, height };
}

function paintRect(surface, x, y, w, h, value = 0) {
  for (let py = Math.max(0, Math.round(y)); py < Math.min(surface.height, Math.round(y + h)); py += 1) {
    for (let px = Math.max(0, Math.round(x)); px < Math.min(surface.width, Math.round(x + w)); px += 1) {
      surface.gray[py * surface.width + px] = value;
    }
  }
}

function paintDisc(surface, cx, cy, radius, value = 0, innerRadius = 0) {
  const outer = radius * radius;
  const inner = innerRadius * innerRadius;
  for (let py = Math.max(0, Math.floor(cy - radius)); py <= Math.min(surface.height - 1, Math.ceil(cy + radius)); py += 1) {
    for (let px = Math.max(0, Math.floor(cx - radius)); px <= Math.min(surface.width - 1, Math.ceil(cx + radius)); px += 1) {
      const d = (px - cx) ** 2 + (py - cy) ** 2;
      if (d <= outer && d >= inner) surface.gray[py * surface.width + px] = value;
    }
  }
}

function paintStroke(surface, x0, y0, x1, y1, thickness, value = 0) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    paintDisc(surface, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness / 2, value);
  }
}

/* ------------------------------ Lembar sintetis --------------------------- */

function renderSheet(layout, pageIndex, answers, marks) {
  const surface = createSurface(layout.pageWidthMm, layout.pageHeightMm);

  computeFiducials(layout).forEach((f) => {
    const side = layout.fiducialSizeMm * PX_PER_MM;
    paintRect(surface, f.xMm * PX_PER_MM - side / 2, f.yMm * PX_PER_MM - side / 2, side, side);
  });

  // Kop halaman: pita bertinta di bagian atas, sepadan dengan lembar sungguhan
  // dan menjadi salah satu petunjuk orientasi bagi detektor.
  for (let line = 0; line < 5; line += 1) {
    paintRect(surface, layout.marginMm * PX_PER_MM, (layout.marginMm + 6 + line * 5) * PX_PER_MM, (layout.pageWidthMm - 2 * layout.marginMm) * PX_PER_MM * (0.9 - line * 0.1), 1.2 * PX_PER_MM, 30);
  }

  const d = layout.bubbleDiameterMm * PX_PER_MM;
  computeBubbleCenters(layout, pageIndex).forEach((c) => {
    const x = c.xMm * PX_PER_MM;
    const y = c.yMm * PX_PER_MM;

    paintDisc(surface, x, y, d / 2, 0, d / 2 - Math.max(1, 0.28 * PX_PER_MM)); // cincin
    paintStroke(surface, x - d * 0.12, y + d * 0.14, x + d * 0.12, y + d * 0.14, 1.2, 40); // huruf opsi
    paintStroke(surface, x, y - d * 0.16, x - d * 0.11, y + d * 0.14, 1.2, 40);

    if (answers.get(c.no) !== c.option) return;
    if (marks.get(c.no) === 'X') {
      const a = d * 0.34;
      paintStroke(surface, x - a, y - a, x + a, y + a, Math.max(1.6, 0.45 * PX_PER_MM));
      paintStroke(surface, x + a, y - a, x - a, y + a, Math.max(1.6, 0.45 * PX_PER_MM));
    } else {
      paintDisc(surface, x, y, d * 0.38);
    }
  });

  return surface;
}

/* --------------------------- Degradasi citra ------------------------------ */

function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function degrade(surface, options, random) {
  const { rotateDeg = 0, perspective = 0, brightness = 1, vignette = 0, noise = 0, blur = 0 } = options;
  const rad = (rotateDeg * Math.PI) / 180;
  const w = surface.width;
  const h = surface.height;

  // Sudut halaman setelah keystone dan rotasi.
  const corners = [
    { x: w * perspective, y: 0 },
    { x: w * (1 - perspective), y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map((point) => {
    const dx = point.x - w / 2;
    const dy = point.y - h / 2;
    return { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
  });

  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxY = Math.max(...corners.map((p) => p.y));
  const pad = 20;
  const outWidth = Math.ceil(maxX - minX) + pad * 2;
  const outHeight = Math.ceil(maxY - minY) + pad * 2;
  const placed = corners.map((p) => ({ x: p.x - minX + pad, y: p.y - minY + pad }));

  const source = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const inverse = solveHomography(placed, source);

  const out = { gray: new Uint8ClampedArray(outWidth * outHeight).fill(255), width: outWidth, height: outHeight };
  const cx = outWidth / 2;
  const cy = outHeight / 2;
  const maxR = Math.hypot(cx, cy);

  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const point = projectPoint(inverse, x, y);
      let value = 255;
      if (point) {
        const sx = Math.round(point.x);
        const sy = Math.round(point.y);
        if (sx >= 0 && sy >= 0 && sx < w && sy < h) value = surface.gray[sy * w + sx];
      }
      let factor = brightness;
      if (vignette) factor *= 1 - vignette * (Math.hypot(x - cx, y - cy) / maxR) ** 2;
      const jitter = noise ? (random() - 0.5) * noise : 0;
      out.gray[y * outWidth + x] = value * factor + jitter;
    }
  }

  // Pelunakan tepi, meniru artefak kompresi dan fokus kamera yang tidak sempurna.
  for (let pass = 0; pass < blur; pass += 1) {
    const copy = out.gray.slice();
    for (let y = 1; y < outHeight - 1; y += 1) {
      for (let x = 1; x < outWidth - 1; x += 1) {
        const i = y * outWidth + x;
        out.gray[i] =
          (copy[i] * 4 + copy[i - 1] + copy[i + 1] + copy[i - outWidth] + copy[i + outWidth]) / 8;
      }
    }
  }

  return out;
}

/* --------------------------------- Skenario ------------------------------- */

const LAYOUTS = {
  '30 butir / 3 kolom / A-E': { numQuestions: 30, columns: 3, rowsPerColumn: 20, optionSet: 'ABCDE' },
  '100 butir / 4 kolom / A-D': {
    numQuestions: 100, columns: 4, rowsPerColumn: 25, optionSet: 'ABCD',
    rowPitchMm: 6.5, bubbleDiameterMm: 4.2, gridTopMm: 88, numberGutterMm: 7, columnGapMm: 4,
  },
  '12 butir / 1 kolom / A-E': { numQuestions: 12, columns: 1, rowsPerColumn: 12, optionSet: 'ABCDE' },
  '60 butir / 2 kolom / A-E': { numQuestions: 60, columns: 2, rowsPerColumn: 30, optionSet: 'ABCDE', rowPitchMm: 6, gridTopMm: 80 },
};

const VARIANTS = {
  'lurus': {},
  'miring 5 derajat': { rotateDeg: 5 },
  'miring 12 derajat': { rotateDeg: 12 },
  'miring 25 derajat': { rotateDeg: 25 },
  'gelap 30%': { brightness: 0.7 },
  'sangat gelap': { brightness: 0.35 },
  'keystone 10%': { perspective: 0.1 },
  'keystone 18%': { perspective: 0.18 },
  'derau berat': { noise: 55, blur: 1 },
  'foto ponsel wajar': { rotateDeg: -4, perspective: 0.05, brightness: 0.75, vignette: 0.2, noise: 16, blur: 1 },
  'foto ponsel buruk': { rotateDeg: -9, perspective: 0.12, brightness: 0.6, vignette: 0.35, noise: 32, blur: 2 },
};

const ACCURACY_FLOOR = { 'lurus': 0.99, 'foto ponsel buruk': 0.9 };

function buildTruth(layout, pageIndex) {
  const options = layout.optionSet.split('');
  const { start, count } = computePageItems(layout, pageIndex);
  const answers = new Map();
  const marks = new Map();
  for (let k = 0; k < count; k += 1) {
    const no = start + k + 1;
    if (k % 9 === 4) {
      answers.set(no, null); // sengaja dikosongkan
      continue;
    }
    answers.set(no, options[(no * 3) % options.length]);
    marks.set(no, k % 3 === 1 ? 'X' : 'FILL');
  }
  return { answers, marks };
}

const random = makeRandom(20260910);
let passed = 0;
let failedSafely = 0;
let failedSilently = 0;

console.log('Uji akurasi mesin OMR luring\n');
console.log(`${'Layout'.padEnd(26)} | ${'Varian citra'.padEnd(19)} | Akurasi  | Catatan`);
console.log('-'.repeat(86));

for (const [layoutName, rawLayout] of Object.entries(LAYOUTS)) {
  const layout = normalizeLayout(rawLayout);
  const metrics = computeLayoutMetrics(layout);
  if (!metrics.printable) {
    console.log(`${layoutName.padEnd(26)} | ${'-'.padEnd(19)} |    ---   | GEOMETRI TIDAK LAYAK CETAK`);
    failedSilently += 1;
    continue;
  }

  const { answers, marks } = buildTruth(layout, 0);
  const base = renderSheet(layout, 0, answers, marks);

  for (const [variantName, variant] of Object.entries(VARIANTS)) {
    const image = degrade(base, variant, random);
    const detection = detectSheet(image, layout, 0, DEFAULT_OMR_OPTIONS);

    if (!detection.ok) {
      failedSafely += 1;
      console.log(`${layoutName.padEnd(26)} | ${variantName.padEnd(19)} |  ditolak | gagal aman: ${detection.error.slice(0, 34)}…`);
      continue;
    }

    let correct = 0;
    const misread = [];
    answers.forEach((expected, no) => {
      const got = detection.answers.get(no) ?? null;
      if (got === expected) correct += 1;
      else misread.push({ no, expected, got, net: detection.samples.filter((s) => s.no === no).map((s) => `${s.option}:${s.net.toFixed(2)}`).join(' ') });
    });
    if (process.env.OMR_VERBOSE && misread.length) console.log('   ->', JSON.stringify(misread));
    const accuracy = correct / answers.size;
    const floor = ACCURACY_FLOOR[variantName] ?? 0.95;
    const ok = accuracy >= floor;
    if (ok) passed += 1;
    else failedSilently += 1;

    console.log(
      `${layoutName.padEnd(26)} | ${variantName.padEnd(19)} | ${(accuracy * 100).toFixed(1).padStart(7)}% | ${
        ok ? 'lulus' : `DI BAWAH AMBANG ${(floor * 100).toFixed(0)}%`
      }`,
    );
  }
}

const total = passed + failedSafely + failedSilently;
// Menolak membaca memang perilaku yang dikehendaki ketika grid tidak selaras,
// tetapi menolak semuanya juga memenuhi syarat "tidak ada yang keliru senyap".
// Karena itu tingkat keberhasilan diberi lantai tersendiri: tanpa lantai ini,
// perubahan yang mematikan detektor akan dilaporkan sebagai LULUS.
const REJECTION_CEILING = 0.15;
const rejectionRate = total ? failedSafely / total : 1;

console.log('-'.repeat(86));
console.log(
  `Lulus: ${passed}/${total} | Gagal aman (ditolak detektor): ${failedSafely} ` +
    `(${(rejectionRate * 100).toFixed(1)}%) | Keliru senyap: ${failedSilently}`,
);

const problems = [];
if (failedSilently > 0) problems.push('terdapat pembacaan keliru yang tidak terdeteksi detektor');
if (rejectionRate > REJECTION_CEILING) {
  problems.push(
    `detektor menolak ${(rejectionRate * 100).toFixed(1)}% skenario, di atas batas ${(REJECTION_CEILING * 100).toFixed(0)}%`,
  );
}
if (!total) problems.push('tidak ada skenario yang dijalankan');

if (problems.length) {
  console.error('\nGAGAL: ' + problems.join('; ') + '.');
  process.exit(1);
}
console.log('\nLULUS: seluruh skenario terbaca, tanpa pembacaan keliru yang lolos tanpa terdeteksi.');
