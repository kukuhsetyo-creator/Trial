/**
 * Geometri LJK — sumber kebenaran tunggal.
 *
 * Seluruh ukuran dinyatakan dalam milimeter pada bidang halaman. Perender
 * template dan mesin OMR sama-sama memanggil fungsi di berkas ini, sehingga
 * perubahan layout tidak pernah membuat posisi cetak dan titik sampel
 * pembacaan saling melenceng.
 */

export const PX_PER_MM = 96 / 25.4; // 96 dpi CSS

export const DEFAULT_LAYOUT = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginMm: 12,
  columns: 3,
  rowsPerColumn: 20,
  numQuestions: 30,
  optionSet: 'ABCDE',
  bubbleDiameterMm: 5,
  bubbleGapMm: 1.6,
  rowPitchMm: 7.5,
  columnGapMm: 6,
  gridTopMm: 92,
  numberGutterMm: 9,
  fiducialSizeMm: 6,
  fiducialInsetMm: 6,
  footerMm: 14,
};

export const LAYOUT_BOUNDS = {
  columns: [1, 5],
  rowsPerColumn: [4, 40],
  numQuestions: [1, 200],
  bubbleDiameterMm: [3, 8],
  bubbleGapMm: [0.6, 5],
  rowPitchMm: [4.5, 14],
  columnGapMm: [2, 20],
  gridTopMm: [30, 160],
  numberGutterMm: [5, 20],
  marginMm: [6, 25],
  fiducialSizeMm: [3, 10],
  fiducialInsetMm: [3, 20],
  footerMm: [6, 30],
};

const clampNumber = (value, [min, max]) => Math.min(max, Math.max(min, value));

/** Membatasi setiap medan pada rentang yang masih dapat dicetak dan dibaca. */
export function normalizeLayout(input) {
  const layout = { ...DEFAULT_LAYOUT, ...(input || {}) };
  Object.entries(LAYOUT_BOUNDS).forEach(([field, bounds]) => {
    const numeric = Number(layout[field]);
    layout[field] = clampNumber(Number.isFinite(numeric) ? numeric : DEFAULT_LAYOUT[field], bounds);
  });
  layout.columns = Math.round(layout.columns);
  layout.rowsPerColumn = Math.round(layout.rowsPerColumn);
  layout.numQuestions = Math.round(layout.numQuestions);
  if (!['ABCD', 'ABCDE'].includes(layout.optionSet)) layout.optionSet = DEFAULT_LAYOUT.optionSet;
  return layout;
}

/**
 * Kapasitas, jumlah halaman, dan pelanggaran batas cetak. Fungsi ini yang
 * dipakai antarmuka untuk memberi peringatan alih-alih memotong butir diam-diam.
 */
export function computeLayoutMetrics(rawLayout) {
  const layout = normalizeLayout(rawLayout);
  const optionCount = layout.optionSet.length;

  const usableWidthMm = layout.pageWidthMm - 2 * layout.marginMm;
  const columnWidthMm =
    (usableWidthMm - layout.columnGapMm * (layout.columns - 1)) / layout.columns;
  const bubbleBlockMm =
    optionCount * layout.bubbleDiameterMm + (optionCount - 1) * layout.bubbleGapMm;
  const requiredColumnMm = layout.numberGutterMm + bubbleBlockMm;

  const gridBottomLimitMm = layout.pageHeightMm - layout.marginMm - layout.footerMm;
  const availableHeightMm = gridBottomLimitMm - layout.gridTopMm;
  const maxRows = Math.max(0, Math.floor(availableHeightMm / layout.rowPitchMm));

  const perPage = layout.columns * layout.rowsPerColumn;
  const pageCount = Math.max(1, Math.ceil(layout.numQuestions / perPage));

  const issues = [];
  if (requiredColumnMm > columnWidthMm) {
    issues.push(
      `Kolom terlalu sempit: butuh ${requiredColumnMm.toFixed(1)} mm, tersedia ${columnWidthMm.toFixed(1)} mm. ` +
        'Kurangi jumlah kolom, diameter bulatan, atau lebar kolom nomor.',
    );
  }
  if (layout.rowsPerColumn > maxRows) {
    issues.push(
      `Tinggi halaman hanya memuat ${maxRows} baris per kolom, bukan ${layout.rowsPerColumn}. ` +
        'Turunkan jarak antarbaris atau geser awal grid ke atas.',
    );
  }
  if (pageCount > 1) {
    issues.push(
      `Layout ini terbagi menjadi ${pageCount} halaman (${perPage} butir per halaman). ` +
        'Setiap halaman dipindai sebagai lembar terpisah. Nyalakan "Gabungkan lembar dengan nama sama" ' +
        'pada panel Konfigurasi, atau setiap halaman akan terhitung sebagai peserta tersendiri.',
    );
  }

  return {
    layout,
    optionCount,
    usableWidthMm,
    columnWidthMm,
    bubbleBlockMm,
    requiredColumnMm,
    gridBottomLimitMm,
    maxRows,
    perPage,
    pageCount,
    issues,
    printable: requiredColumnMm <= columnWidthMm && layout.rowsPerColumn <= maxRows,
  };
}

/** Butir mana saja yang jatuh pada satu halaman, beserta pembagian kolomnya. */
export function computePageItems(rawLayout, pageIndex = 0) {
  const { layout, perPage } = computeLayoutMetrics(rawLayout);
  const start = pageIndex * perPage;
  const count = Math.max(0, Math.min(perPage, layout.numQuestions - start));
  // Kolom diseimbangkan agar butir tidak menumpuk di kolom pertama.
  const rowsUsed = count ? Math.ceil(count / layout.columns) : 0;

  const columns = [];
  for (let col = 0; col < layout.columns; col += 1) {
    const numbers = [];
    for (let row = 0; row < rowsUsed; row += 1) {
      const no = start + col * rowsUsed + row + 1;
      if (no <= start + count) numbers.push(no);
    }
    columns.push(numbers);
  }
  return { start, count, rowsUsed, columns };
}

/** Koordinat pusat empat penanda sudut, dalam milimeter. */
export function computeFiducials(rawLayout) {
  const layout = normalizeLayout(rawLayout);
  const half = layout.fiducialSizeMm / 2;
  const left = layout.fiducialInsetMm + half;
  const right = layout.pageWidthMm - layout.fiducialInsetMm - half;
  const top = layout.fiducialInsetMm + half;
  const bottom = layout.pageHeightMm - layout.fiducialInsetMm - half;
  return [
    { key: 'tl', xMm: left, yMm: top },
    { key: 'tr', xMm: right, yMm: top },
    { key: 'br', xMm: right, yMm: bottom },
    { key: 'bl', xMm: left, yMm: bottom },
  ];
}

/**
 * Pusat setiap bulatan pada satu halaman. Perender menempatkan bulatan pada
 * koordinat ini; detektor menyampel piksel pada koordinat yang sama.
 */
export function computeBubbleCenters(rawLayout, pageIndex = 0) {
  const metrics = computeLayoutMetrics(rawLayout);
  const { layout, columnWidthMm } = metrics;
  const { columns } = computePageItems(rawLayout, pageIndex);
  const options = layout.optionSet.split('');
  const pitchMm = layout.bubbleDiameterMm + layout.bubbleGapMm;

  const centers = [];
  columns.forEach((numbers, col) => {
    const columnLeftMm = layout.marginMm + col * (columnWidthMm + layout.columnGapMm);
    const bubbleLeftMm = columnLeftMm + layout.numberGutterMm;
    numbers.forEach((no, row) => {
      const yMm = layout.gridTopMm + row * layout.rowPitchMm + layout.bubbleDiameterMm / 2;
      options.forEach((option, optionIndex) => {
        centers.push({
          no,
          option,
          optionIndex,
          column: col,
          row,
          xMm: bubbleLeftMm + optionIndex * pitchMm + layout.bubbleDiameterMm / 2,
          yMm,
        });
      });
    });
  });
  return centers;
}

/** Posisi nomor butir (rata kanan terhadap blok bulatan). */
export function computeNumberAnchors(rawLayout, pageIndex = 0) {
  const metrics = computeLayoutMetrics(rawLayout);
  const { layout, columnWidthMm } = metrics;
  const { columns } = computePageItems(rawLayout, pageIndex);

  const anchors = [];
  columns.forEach((numbers, col) => {
    const columnLeftMm = layout.marginMm + col * (columnWidthMm + layout.columnGapMm);
    numbers.forEach((no, row) => {
      anchors.push({
        no,
        xMm: columnLeftMm,
        widthMm: layout.numberGutterMm - 1.5,
        yMm: layout.gridTopMm + row * layout.rowPitchMm + layout.bubbleDiameterMm / 2,
      });
    });
  });
  return anchors;
}
