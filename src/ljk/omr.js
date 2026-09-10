/**
 * Mesin OMR luring.
 *
 * Membaca penandaan pada LJK melalui pengolahan citra Canvas 2D murni: tidak
 * ada panggilan jaringan, tidak ada model, tidak ada pustaka visi pihak ketiga.
 * Geometri titik sampel diambil dari modul layout, sehingga detektor selalu
 * menyampel persis di tempat bulatan dicetak.
 */

import { computeBubbleCenters, computeFiducials, normalizeLayout } from './layout.js';

export const DEFAULT_OMR_OPTIONS = {
  maxDim: 1400,
  sampleRadiusFactor: 0.32, // terhadap diameter bulatan
  // Tanda silang menutup jauh lebih sedikit luas daripada bulatan yang
  // dihitamkan penuh, dan pada tepi lembar yang menjauh dari kamera sebagian
  // pikselnya hilang oleh penurunan resolusi. Ambang ditetapkan cukup rendah
  // untuk menangkap silang tipis, sementara perlindungan terhadap noda dan
  // bekas hapusan diserahkan pada selisih antaropsi di bawah ini.
  fillThreshold: 0.16, // ambang kehitaman neto di atas garis dasar lembar
  marginThreshold: 0.1, // selisih minimum terhadap opsi terkuat kedua
  localWindowDivisor: 60,
  localBias: 30,
};

/* ---------------------------- Praproses citra ---------------------------- */

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Citra tidak dapat dimuat.'));
    image.src = src;
  });
}

/** Menurunkan resolusi lalu mengubah ke kanal keabuan tunggal. */
export function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return { gray, width, height };
}

export async function grayscaleFromSource(src, maxDim = DEFAULT_OMR_OPTIONS.maxDim) {
  const image = await loadImageElement(src);
  const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return toGrayscale(ctx.getImageData(0, 0, width, height));
}

/* ------------------------------ Ambang batas ----------------------------- */

/** Ambang global Otsu: memisahkan tinta dari kertas berdasarkan variansi antarkelas. */
export function otsuThreshold(gray) {
  const histogram = new Float64Array(256);
  for (let i = 0; i < gray.length; i += 1) histogram[gray[i]] += 1;

  const total = gray.length;
  let sum = 0;
  for (let level = 0; level < 256; level += 1) sum += level * histogram[level];

  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 128;

  for (let level = 0; level < 256; level += 1) {
    weightBackground += histogram[level];
    if (!weightBackground) continue;
    const weightForeground = total - weightBackground;
    if (!weightForeground) break;

    sumBackground += level * histogram[level];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = level;
    }
  }
  return threshold;
}

function integralImage(gray, width, height) {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  return integral;
}

/**
 * Masker gelap: gabungan ambang global dan ambang lokal. Ambang global menjaga
 * area hitam pekat yang luas (penanda sudut) tetap terdeteksi utuh, sementara
 * ambang lokal menyelamatkan lembar dengan pencahayaan tidak merata.
 */
export function buildDarkMask(gray, width, height, options = {}) {
  const config = { ...DEFAULT_OMR_OPTIONS, ...options };
  const global = otsuThreshold(gray);
  const integral = integralImage(gray, width, height);

  let radius = Math.round(Math.min(width, height) / config.localWindowDivisor);
  radius = Math.max(6, radius);

  const mask = new Uint8Array(width * height);
  const stride = width + 1;

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      const localMean = sum / area;
      const value = gray[y * width + x];
      const dark = value < global || (value < localMean - config.localBias && value < 200);
      mask[y * width + x] = dark ? 1 : 0;
    }
  }
  return { mask, global };
}

/* --------------------------- Penanda sudut (fiducial) -------------------- */

/** Erosi lalu dilasi 3x3: membuang bintik derau tanpa menggerus kotak penanda. */
function openMask(mask, width, height) {
  const eroded = new Uint8Array(mask.length);
  const opened = new Uint8Array(mask.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      eroded[index] =
        mask[index] &&
        mask[index - 1] &&
        mask[index + 1] &&
        mask[index - width] &&
        mask[index + width]
          ? 1
          : 0;
    }
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      opened[index] =
        eroded[index] ||
        eroded[index - 1] ||
        eroded[index + 1] ||
        eroded[index - width] ||
        eroded[index + width]
          ? 1
          : 0;
    }
  }

  return opened;
}

/**
 * Masker khusus penanda sudut. Bulatan jawaban boleh dibaca dengan ambang
 * gabungan yang longgar, tetapi pencarian penanda menuntut yang sebaliknya:
 * hanya piksel yang benar-benar pekat. Ambang ketat itu memisahkan tinta cetak
 * dari kertas yang menggelap akibat vignet kamera, dan operasi opening membuang
 * derau garam-merica yang bila dibiarkan akan menyambung penanda dengan
 * latarnya sehingga bentuknya tidak lagi dikenali sebagai bujur sangkar.
 */
export function buildFiducialMask(gray, width, height, globalThreshold, factor) {
  const strict = Math.max(16, globalThreshold * factor);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i += 1) mask[i] = gray[i] < strict ? 1 : 0;
  return openMask(mask, width, height);
}

export const FIDUCIAL_STRICTNESS = [0.5, 0.65, 0.8, 1];


/** Pelabelan komponen terhubung 4-tetangga dengan tumpukan eksplisit. */
export function labelComponents(mask, width, height, minArea = 12) {
  const labels = new Int32Array(width * height).fill(-1);
  const stack = new Int32Array(width * height);
  const components = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== -1) continue;

    const id = components.length;
    let top = 0;
    stack[top += 1] = start;
    labels[start] = id;

    let area = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;

    while (top > 0) {
      const index = stack[top--];
      const x = index % width;
      const y = (index - x) / width;

      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0 && mask[index - 1] && labels[index - 1] === -1) {
        labels[index - 1] = id;
        stack[top += 1] = index - 1;
      }
      if (x < width - 1 && mask[index + 1] && labels[index + 1] === -1) {
        labels[index + 1] = id;
        stack[top += 1] = index + 1;
      }
      if (y > 0 && mask[index - width] && labels[index - width] === -1) {
        labels[index - width] = id;
        stack[top += 1] = index - width;
      }
      if (y < height - 1 && mask[index + width] && labels[index + width] === -1) {
        labels[index + width] = id;
        stack[top += 1] = index + width;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    components.push({
      id,
      area,
      minX,
      maxX,
      minY,
      maxY,
      boxWidth,
      boxHeight,
      cx: sumX / area,
      cy: sumY / area,
      aspect: boxWidth / boxHeight,
      solidity: area / (boxWidth * boxHeight),
    });
  }

  return components.filter((component) => component.area >= minArea);
}

function quadSignedArea(points) {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += a.cx * b.cy - b.cx * a.cy;
  }
  return total / 2;
}

/** Urutan menyusuri keliling segi empat, searah jarum jam pada koordinat citra. */
function orderClockwise(points) {
  const cx = points.reduce((sum, point) => sum + point.cx, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.cy, 0) / points.length;
  const ordered = points
    .slice()
    .sort((a, b) => Math.atan2(a.cy - cy, a.cx - cx) - Math.atan2(b.cy - cy, b.cx - cx));
  return quadSignedArea(ordered) < 0 ? ordered.reverse() : ordered;
}

/** Lambung cembung (Andrew monotone chain) atas himpunan titik komponen. */
function convexHull(points) {
  if (points.length < 4) return points.slice();
  const sorted = points.slice().sort((a, b) => (a.cx === b.cx ? a.cy - b.cy : a.cx - b.cx));
  const cross = (o, a, b) => (a.cx - o.cx) * (b.cy - o.cy) - (a.cy - o.cy) * (b.cx - o.cx);

  const lower = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });

  const upper = [];
  sorted
    .slice()
    .reverse()
    .forEach((point) => {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    });

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Pemilihan empat penanda dari kumpulan kandidat.
 *
 * Bulatan jawaban yang dihitamkan penuh berbagi hampir seluruh ciri bentuk
 * dengan penanda sudut, sehingga ukuran bukan pembeda yang dapat diandalkan —
 * lembar yang terpotret menyerong membuat penanda terjauh menyusut sampai di
 * bawah ukuran bulatan terdekat. Yang tidak pernah berubah adalah letaknya:
 * penanda selalu berada di luar seluruh grid. Karena itu kandidat disaring
 * lewat lambung cembungnya, lalu dipilih segi empat berluas terbesar. Bulatan
 * jawaban, yang menurut konstruksi berada di dalam persegi penanda, tidak akan
 * pernah menjadi titik sudut lambung.
 */
function chooseWidestQuad(candidates) {
  const hull = convexHull(candidates);
  const pool = (hull.length > 16 ? hull.slice().sort((a, b) => b.area - a.area).slice(0, 16) : hull).filter(Boolean);
  if (pool.length < 4) return null;
  if (pool.length === 4) return orderClockwise(pool);

  let best = null;
  let bestArea = 0;
  for (let a = 0; a < pool.length; a += 1) {
    for (let b = a + 1; b < pool.length; b += 1) {
      for (let c = b + 1; c < pool.length; c += 1) {
        for (let d = c + 1; d < pool.length; d += 1) {
          const quad = orderClockwise([pool[a], pool[b], pool[c], pool[d]]);
          const area = Math.abs(quadSignedArea(quad));
          if (area > bestArea) {
            bestArea = area;
            best = quad;
          }
        }
      }
    }
  }
  return best;
}

/**
 * Penetapan keempat penanda tidak boleh bersandar pada kedekatan ke sudut citra:
 * begitu lembar terpotret miring lebih dari sekitar sepuluh derajat, kedekatan
 * itu memasangkan penanda ke sudut yang keliru dan grid mendarat di tempat yang
 * salah tanpa satu pun gejala. Karena itu keempat titik diurutkan menyusuri
 * kelilingnya sendiri, lalu titik awal dipilih sebagai rotasi yang perbandingan
 * sisinya paling mendekati nisbah halaman. Bila tidak ada rotasi yang cocok,
 * pembacaan dibatalkan alih-alih menghasilkan jawaban yang tampak wajar padahal
 * keliru.
 */
export function findFiducials(components, width, height, expectedAspect = 210 / 297, resolveOrientation) {
  const areaLimit = width * height * 0.02;
  const candidates = components.filter(
    (component) =>
      component.area <= areaLimit &&
      component.aspect >= 0.65 &&
      component.aspect <= 1.55 &&
      component.solidity >= 0.48,
  );
  if (candidates.length < 4) return null;

  // Bulatan jawaban yang dihitamkan penuh juga berbentuk cakram padat mendekati
  // bujur sangkar pada kotak pembatasnya, sehingga lolos saringan bentuk. Yang
  // membedakannya dari penanda sudut hanyalah ukuran: penanda dicetak jauh lebih
  // besar. Tanpa batas ukuran ini, empat bulatan terisi di tepi grid dapat
  // terpilih sebagai penanda, dan seluruh grid bergeser beberapa baris tanpa
  // gejala yang kasatmata.
  const largest = candidates.reduce((max, component) => Math.max(max, component.area), 0);
  const strong = candidates.filter((component) => component.area >= largest * 0.2);
  if (strong.length < 4) return null;

  const quad = chooseWidestQuad(strong);
  if (!quad) return null;

  const areas = quad.map((component) => component.area);
  if (Math.max(...areas) / Math.min(...areas) > 6) return null;

  const distance = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

  const candidatesByRotation = [];
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const tl = quad[rotation];
    const tr = quad[(rotation + 1) % 4];
    const br = quad[(rotation + 2) % 4];
    const bl = quad[(rotation + 3) % 4];

    const top = distance(tl, tr);
    const right = distance(tr, br);
    if (right < 1) continue;

    candidatesByRotation.push({
      assignment: { tl, tr, br, bl },
      error: Math.abs(top / right - expectedAspect) / expectedAspect,
    });
  }

  candidatesByRotation.sort((a, b) => a.error - b.error);
  if (!candidatesByRotation.length) return null;

  // Nisbah sisi hanya dipakai sebagai saringan kasar. Ia memang memisahkan
  // rotasi 90 derajat dengan tegas, tetapi tidak dapat membedakan 0 dari 180
  // derajat, dan pada lembar yang terpotret menyerong ia bahkan condong memilih
  // orientasi yang terbalik karena sisi yang menjauh dari kamera memendek.
  const plausible = candidatesByRotation.filter((candidate) => candidate.error <= 0.45);
  if (!plausible.length) return null;

  // Keputusan akhir diserahkan pada bukti isi lembar: orientasi yang benar
  // adalah yang menempatkan seluruh titik sampel tepat di atas cincin bulatan
  // yang tercetak.
  if (plausible.length > 1 && typeof resolveOrientation === 'function') {
    return resolveOrientation(plausible.map((candidate) => candidate.assignment));
  }
  return plausible[0].assignment;
}

/**
 * Kerapatan tinta pada titik-titik bulatan, disampel selebar bulatan penuh
 * sehingga cincin yang tercetak ikut terhitung.
 */
function gridAlignmentScore(mask, width, height, homography, centers, layout) {
  if (!centers.length) return 0;
  let inked = 0;
  let counted = 0;
  centers.forEach((center) => {
    const point = projectPoint(homography, center.xMm, center.yMm);
    const edge = projectPoint(homography, center.xMm + layout.bubbleDiameterMm / 2, center.yMm);
    if (!point || !edge) return;
    counted += 1;
    inked += sampleDisc(mask, width, height, point.x, point.y, Math.hypot(edge.x - point.x, edge.y - point.y));
  });
  return counted ? inked / counted : 0;
}

/**
 * Kerapatan tinta pada sebuah persegi panjang dalam ruang milimeter, disampel
 * lewat homografi yang sedang diuji.
 */
function bandDensity(mask, width, height, homography, x0, y0, x1, y1, steps = 28) {
  let total = 0;
  let dark = 0;
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const point = projectPoint(homography, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * j) / steps);
      if (!point) continue;
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      total += 1;
      dark += mask[y * width + x];
    }
  }
  return total ? dark / total : 0;
}

/* ------------------------------- Homografi ------------------------------- */

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    }
    if (Math.abs(augmented[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const swap = augmented[pivot];
      augmented[pivot] = augmented[col];
      augmented[col] = swap;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = augmented[row][col] / augmented[col][col];
      if (!factor) continue;
      for (let k = col; k <= size; k += 1) augmented[row][k] -= factor * augmented[col][k];
    }
  }

  return augmented.map((row, index) => row[size] / row[index]);
}

/**
 * Homografi 4 titik dari bidang halaman (mm) ke bidang citra (piksel), sehingga
 * foto yang miring atau berperspektif tetap terpetakan ke grid yang benar.
 */
export function solveHomography(source, target) {
  const matrix = [];
  const vector = [];

  for (let i = 0; i < 4; i += 1) {
    const { x: X, y: Y } = source[i];
    const { x, y } = target[i];
    matrix.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]);
    vector.push(x);
    matrix.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]);
    vector.push(y);
  }

  const solution = solveLinearSystem(matrix, vector);
  if (!solution) return null;
  return [...solution, 1];
}

export function projectPoint(homography, x, y) {
  const denominator = homography[6] * x + homography[7] * y + homography[8];
  if (Math.abs(denominator) < 1e-12) return null;
  return {
    x: (homography[0] * x + homography[1] * y + homography[2]) / denominator,
    y: (homography[3] * x + homography[4] * y + homography[5]) / denominator,
  };
}

/* ------------------------------ Penyampelan ------------------------------ */

function sampleDisc(mask, width, height, cx, cy, radius) {
  const r = Math.max(1.5, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(height - 1, Math.ceil(cy + r));

  let total = 0;
  let dark = 0;
  const squared = r * r;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > squared) continue;
      total += 1;
      dark += mask[y * width + x];
    }
  }
  return total ? dark / total : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/* ----------------------------- Pembacaan lembar -------------------------- */

/**
 * Membaca satu halaman LJK.
 *
 * Keputusan diambil pada kehitaman neto, yaitu rasio piksel gelap dikurangi
 * garis dasar lembar (median seluruh bulatan). Garis dasar itu menyerap
 * kontribusi huruf yang tercetak di dalam bulatan serta perbedaan ketebalan
 * tinta antarcetakan, sehingga ambang tidak perlu disetel ulang tiap kali
 * pencetak atau kamera berganti. Silang dan bulatan yang dihitamkan sama-sama
 * menaikkan kehitaman, jadi keduanya dibaca oleh mekanisme yang sama.
 */
export function detectSheet(grayscale, rawLayout, pageIndex = 0, options = {}) {
  const config = { ...DEFAULT_OMR_OPTIONS, ...options };
  const layout = normalizeLayout(rawLayout);
  const { gray, width, height } = grayscale;

  const { mask, global } = buildDarkMask(gray, width, height, config);

  // Ambang penanda dinaikkan bertahap: mulai dari yang paling ketat, longgarkan
  // hanya bila keempat kotak belum ditemukan.
  const anchorsMm = computeFiducials(layout);
  const homographyFor = (assignment) =>
    solveHomography(
      anchorsMm.map((anchor) => ({ x: anchor.xMm, y: anchor.yMm })),
      anchorsMm.map((anchor) => ({ x: assignment[anchor.key].cx, y: assignment[anchor.key].cy })),
    );

  const orientationProbe = computeBubbleCenters(layout, pageIndex);

  const resolveOrientation = (assignments) => {
    const score = (assignment) => {
      const homography = homographyFor(assignment);
      if (!homography) return -Infinity;

      // Petunjuk utama: pada orientasi yang benar, setiap titik sampel jatuh di
      // atas cincin bulatan yang tercetak, sedangkan pada orientasi terbalik
      // sebagian besar mendarat di kertas kosong.
      const ringDensity = gridAlignmentScore(mask, width, height, homography, orientationProbe, layout);

      // Petunjuk penunjang: kepala halaman selalu lebih banyak bertinta
      // daripada kakinya, berguna ketika grid mengisi hampir seluruh halaman.
      const header = bandDensity(
        mask,
        width,
        height,
        homography,
        layout.marginMm,
        layout.marginMm,
        layout.pageWidthMm - layout.marginMm,
        layout.gridTopMm - 4,
      );
      const footer = bandDensity(
        mask,
        width,
        height,
        homography,
        layout.marginMm,
        layout.pageHeightMm - layout.marginMm - layout.footerMm,
        layout.pageWidthMm - layout.marginMm,
        layout.pageHeightMm - layout.marginMm,
      );

      return ringDensity * 2 + (header - footer);
    };

    let best = assignments[0];
    let bestScore = -Infinity;
    assignments.forEach((assignment) => {
      const value = score(assignment);
      if (value > bestScore) {
        bestScore = value;
        best = assignment;
      }
    });
    return best;
  };

  let fiducials = null;
  for (const factor of FIDUCIAL_STRICTNESS) {
    const candidateMask = buildFiducialMask(gray, width, height, global, factor);
    fiducials = findFiducials(
      labelComponents(candidateMask, width, height),
      width,
      height,
      layout.pageWidthMm / layout.pageHeightMm,
      resolveOrientation,
    );
    if (fiducials) break;
  }

  if (!fiducials) {
    return {
      ok: false,
      error:
        'Empat penanda sudut tidak ditemukan. Pastikan seluruh lembar terpotret, tidak terpotong, dan latar belakangnya kontras.',
      threshold: global,
    };
  }

  const homography = homographyFor(fiducials);

  if (!homography) {
    return { ok: false, error: 'Posisi penanda sudut tidak membentuk bidang yang sah.', threshold: global };
  }

  const centers = computeBubbleCenters(layout, pageIndex);
  if (!centers.length) {
    return { ok: false, error: 'Halaman ini tidak memuat butir apa pun.', threshold: global };
  }

  // Penjagaan terakhir. Penanda palsu — misalnya huruf opsi yang kebetulan
  // membentuk segi empat lebar — dapat lolos seluruh saringan bentuk dan
  // menghasilkan grid yang mendarat di tempat keliru tanpa gejala apa pun.
  // Karena setiap bulatan selalu tercetak sebagai cincin, keselarasan diuji
  // langsung: bila titik sampel tidak menemukan tinta cincin, pembacaan
  // dibatalkan alih-alih mengembalikan pola jawaban yang tampak masuk akal.
  // Ukuran penanda yang terukur harus sepadan dengan ukuran yang tersirat oleh
  // homografi. Ketidaksepadanan menandakan yang terpilih sebenarnya bukan
  // penanda, atau keempatnya terpasang pada sudut yang keliru.
  const sizeAgreement = anchorsMm.filter((anchor) => {
    const component = fiducials[anchor.key];
    const point = projectPoint(homography, anchor.xMm, anchor.yMm);
    const edge = projectPoint(homography, anchor.xMm + layout.fiducialSizeMm, anchor.yMm);
    if (!point || !edge) return false;
    const expected = Math.hypot(edge.x - point.x, edge.y - point.y);
    const measured = Math.sqrt(component.area);
    const ratio = expected > 0 ? measured / expected : 0;
    return ratio >= 0.55 && ratio <= 1.8;
  }).length;

  if (sizeAgreement < 3) {
    return {
      ok: false,
      error:
        'Ukuran penanda sudut tidak sepadan dengan geometri lembar. Pastikan template dicetak pada skala 100% dan seluruh lembar terpotret utuh.',
      threshold: global,
    };
  }

  const alignment = gridAlignmentScore(mask, width, height, homography, centers, layout);
  if (alignment < 0.12) {
    return {
      ok: false,
      error:
        'Grid tidak selaras dengan lembar. Penanda sudut kemungkinan salah dikenali — potret ulang seluruh lembar dengan latar kontras dan kemiringan wajar.',
      threshold: global,
      alignment,
    };
  }

  const radiusMm = layout.bubbleDiameterMm * config.sampleRadiusFactor;
  const samples = [];

  centers.forEach((center) => {
    const point = projectPoint(homography, center.xMm, center.yMm);
    const edge = projectPoint(homography, center.xMm + radiusMm, center.yMm);
    const edgeDown = projectPoint(homography, center.xMm, center.yMm + radiusMm);
    if (!point || !edge || !edgeDown) return;

    const radiusPx =
      (Math.hypot(edge.x - point.x, edge.y - point.y) +
        Math.hypot(edgeDown.x - point.x, edgeDown.y - point.y)) /
      2;

    samples.push({
      ...center,
      x: point.x,
      y: point.y,
      radius: radiusPx,
      fill: sampleDisc(mask, width, height, point.x, point.y, radiusPx),
    });
  });

  const baseline = median(samples.map((sample) => sample.fill));
  samples.forEach((sample) => {
    sample.net = sample.fill - baseline;
  });

  const byItem = new Map();
  samples.forEach((sample) => {
    if (!byItem.has(sample.no)) byItem.set(sample.no, []);
    byItem.get(sample.no).push(sample);
  });

  const decision = decideAnswers(byItem, config);

  return {
    ok: true,
    samples,
    byItem,
    baseline,
    threshold: global,
    fiducials,
    homography,
    alignment,
    total: byItem.size,
    ...decision,
  };
}

/**
 * Keputusan per butir, dipisahkan dari pembacaan citra.
 *
 * Pemisahan ini bukan sekadar kerapian: ambang kehitaman dan selisih antaropsi
 * hanya menyentuh tahap keputusan, sedangkan penurunan resolusi, ambang Otsu,
 * pencarian penanda, dan homografi tidak terpengaruh sama sekali. Dengan
 * memisahkannya, panel kalibrasi dapat menggeser ambang dan melihat akibatnya
 * seketika tanpa membaca ulang citra dari awal.
 */
export function decideAnswers(byItem, options = {}) {
  const config = { ...DEFAULT_OMR_OPTIONS, ...options };
  const answers = new Map();
  const flags = [];

  byItem.forEach((list, no) => {
    const sorted = list.slice().sort((a, b) => b.net - a.net);
    const best = sorted[0];
    const second = sorted[1];
    const margin = second ? best.net - second.net : best.net;

    if (best.net >= config.fillThreshold && margin >= config.marginThreshold) {
      answers.set(no, best.option);
    } else {
      answers.set(no, null);
      flags.push({ no, reason: best.net >= config.fillThreshold ? 'ganda' : 'kosong' });
    }
  });

  const marked = [...answers.values()].filter(Boolean).length;
  return { answers, flags, marked, confidence: byItem.size ? marked / byItem.size : 0 };
}
