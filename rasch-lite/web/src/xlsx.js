/* RaschLite: pembaca dan penulis .xlsx tanpa pustaka pihak ketiga, plus penulis ZIP.
 *
 * Pembaca: membuka ZIP (inflate lewat DecompressionStream bawaan browser), membaca
 * workbook pertama, shared strings, dan sel sheet pertama.
 * Penulis: workbook Office Open XML minimal (inline string, angka sebagai angka,
 * format desimal, warna latar, teks tebal, panel beku) dalam ZIP tanpa kompresi.
 */
(function (root) {
  "use strict";

  // --- CRC32 dan ZIP --------------------------------------------------------------------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const enc = new TextEncoder();
  const toBytes = (x) => (typeof x === "string" ? enc.encode(x) : x instanceof Uint8Array ? x : new Uint8Array(x));

  /** ZIP tanpa kompresi (metode 0). files: [{name, data: string|Uint8Array}] */
  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;
    for (const f of files) {
      const name = enc.encode(f.name), data = toBytes(f.data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let pos = 0; for (const p of all) { out.set(p, pos); pos += p.length; }
    return out;
  }

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const b = new Uint8Array(buffer), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("Berkas .xlsx tidak valid (bukan arsip ZIP).");
    const count = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    const out = {};
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
      const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
      const lho = v.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
      const dataStart = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
      const raw = b.subarray(dataStart, dataStart + csize);
      out[name] = { method, raw };
      p += 46 + nlen + xlen + clen;
    }
    return {
      names: Object.keys(out),
      async text(name) {
        const e = out[name];
        if (!e) return null;
        const data = e.method === 0 ? e.raw : await inflateRaw(e.raw);
        return dec.decode(data);
      },
    };
  }

  // --- Membaca XLSX ---------------------------------------------------------------------
  function decodeXml(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e];
    }).replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  }
  function textRuns(xml) {
    let s = "";
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
    const cleaned = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    let m; while ((m = re.exec(cleaned))) s += m[1] ? decodeXml(m[1]) : "";
    return s;
  }
  function colIndex(ref) {
    const letters = ref.replace(/\d+/g, "");
    let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  const attr = (s, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(s); return m ? m[1] : null; };

  async function readXlsx(buffer) {
    const z = await unzip(buffer);
    const wb = await z.text("xl/workbook.xml");
    if (!wb) throw new Error("Berkas .xlsx tidak memiliki workbook.");
    const first = /<sheet\b[^>]*>/.exec(wb);
    let sheetPath = "xl/worksheets/sheet1.xml";
    if (first) {
      const rid = attr(first[0], "r:id");
      const rels = (await z.text("xl/_rels/workbook.xml.rels")) || "";
      const rel = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`).exec(rels);
      if (rel) {
        const target = attr(rel[0], "Target");
        sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
      }
    }
    const sstXml = (await z.text("xl/sharedStrings.xml")) || "";
    const sst = [];
    const reSi = /<si>([\s\S]*?)<\/si>/g;
    let m; while ((m = reSi.exec(sstXml))) sst.push(textRuns(m[1]));
    const sheet = await z.text(sheetPath);
    if (!sheet) throw new Error("Sheet pertama tidak ditemukan di berkas .xlsx.");
    const rows = new Map();
    const reRow = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rowAuto = 0;
    while ((m = reRow.exec(sheet))) {
      const rAttr = attr(m[1], "r");
      const r = rAttr ? Number(rAttr) - 1 : rowAuto;
      rowAuto = r + 1;
      const cells = new Map();
      const reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let c, colAuto = 0;
      while ((c = reC.exec(m[2] || ""))) {
        const ref = attr(c[1], "r");
        const col = ref ? colIndex(ref) : colAuto;
        colAuto = col + 1;
        const type = attr(c[1], "t") || "n";
        const body = c[2] || "";
        const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
        let value = null;
        if (type === "s") value = vm ? sst[Number(vm[1])] : null;
        else if (type === "inlineStr") value = textRuns(body);
        else if (type === "str" || type === "e") value = vm ? decodeXml(vm[1]) : null;
        else if (type === "b") value = vm ? (vm[1] === "1" ? "True" : "False") : null;
        else if (vm) value = Number(vm[1]);
        if (value !== null && value !== "") cells.set(col, value);
      }
      if (cells.size) rows.set(r, cells);
    }
    const idx = Array.from(rows.keys()).sort((a, b) => a - b);
    if (!idx.length) return { columns: [], rows: [] };
    const header = rows.get(idx[0]);
    const ncol = Math.max(...header.keys()) + 1;
    const columns = Array.from({ length: ncol }, (_, j) => (header.has(j) ? String(header.get(j)) : `Unnamed: ${j}`));
    const body = [];
    for (let r = idx[0] + 1; r <= idx[idx.length - 1]; r++) {
      const cells = rows.get(r) || new Map();
      body.push(columns.map((_, j) => (cells.has(j) ? cells.get(j) : null)));
    }
    return { columns, rows: body };
  }

  // --- Menulis XLSX ---------------------------------------------------------------------
  const xmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function colName(j) { let s = ""; j++; while (j > 0) { const r = (j - 1) % 26; s = String.fromCharCode(65 + r) + s; j = Math.floor((j - 1) / 26); } return s; }

  /**
   * sheets: [{name, rows: [[cell]], widths: {col: w}, freeze: true}]
   * cell: null | number | string | {v, dec, fill: "#RRGGBB", bold, size, color, wrap}
   */
  function writeXlsx(sheets) {
    const fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
    const fontKey = new Map([["", 0]]);
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const fillKey = new Map();
    const numFmts = [];
    const fmtKey = new Map([[0, 1], [2, 2]]);
    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const xfKey = new Map([["0|0|0|0", 0]]);
    const fontId = (c) => {
      if (!c.bold && !c.size && !c.color) return 0;
      const k = `${c.bold ? 1 : 0}|${c.size || 11}|${c.color || ""}`;
      if (!fontKey.has(k)) {
        fontKey.set(k, fonts.length);
        fonts.push(`<font>${c.bold ? "<b/>" : ""}<sz val="${c.size || 11}"/>${c.color ? `<color rgb="FF${c.color.slice(1).toUpperCase()}"/>` : ""}<name val="Calibri"/><family val="2"/></font>`);
      }
      return fontKey.get(k);
    };
    const fillId = (hex) => {
      if (!hex) return 0;
      if (!fillKey.has(hex)) {
        fillKey.set(hex, fills.length);
        fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${hex.slice(1).toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`);
      }
      return fillKey.get(hex);
    };
    const fmtId = (dec) => {
      if (dec === undefined || dec === null) return 0;
      if (!fmtKey.has(dec)) { const id = 164 + numFmts.length; fmtKey.set(dec, id); numFmts.push(`<numFmt numFmtId="${id}" formatCode="0.${"0".repeat(dec)}"/>`); }
      return fmtKey.get(dec);
    };
    const styleId = (c) => {
      const f = fontId(c), fi = fillId(c.fill), n = fmtId(c.dec), w = c.wrap ? 1 : 0;
      const k = `${n}|${f}|${fi}|${w}`;
      if (!xfKey.has(k)) {
        xfKey.set(k, xfs.length);
        xfs.push(`<xf numFmtId="${n}" fontId="${f}" fillId="${fi}" borderId="0" xfId="0"${n ? ' applyNumberFormat="1"' : ""}${f ? ' applyFont="1"' : ""}${fi ? ' applyFill="1"' : ""}${w ? ' applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' : "/>"}`);
      }
      return xfKey.get(k);
    };
    const used = new Set();
    const sheetNames = sheets.map((s) => {
      let n = String(s.name).replace(/[\[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
      let k = 2; const base = n;
      while (used.has(n.toLowerCase())) n = (base.slice(0, 28) + " " + k++).slice(0, 31);
      used.add(n.toLowerCase());
      return n;
    });
    const sheetXml = sheets.map((sh) => {
      const rowsXml = sh.rows.map((row, r) => {
        const cells = [];
        row.forEach((cell, j) => {
          if (cell === null || cell === undefined) return;
          const c = typeof cell === "object" ? cell : { v: cell };
          const ref = colName(j) + (r + 1);
          const s = styleId(c);
          const sa = s ? ` s="${s}"` : "";
          if (typeof c.v === "number") { if (isFinite(c.v)) cells.push(`<c r="${ref}"${sa}><v>${c.v}</v></c>`); else if (s) cells.push(`<c r="${ref}"${sa}/>`); }
          else if (typeof c.v === "boolean") cells.push(`<c r="${ref}"${sa} t="inlineStr"><is><t>${c.v ? "Ya" : ""}</t></is></c>`);
          else if (c.v === null || c.v === undefined || c.v === "") { if (s) cells.push(`<c r="${ref}"${sa}/>`); }
          else cells.push(`<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`);
        });
        return `<row r="${r + 1}">${cells.join("")}</row>`;
      }).join("");
      const widths = sh.widths ? Object.entries(sh.widths).map(([j, w]) => `<col min="${Number(j) + 1}" max="${Number(j) + 1}" width="${w}" customWidth="1"/>`).join("") : "";
      const pane = sh.freeze ? '<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight"/></sheetView></sheetViews>' : "";
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `${pane}<sheetFormatPr defaultRowHeight="15"/>${widths ? `<cols>${widths}</cols>` : ""}<sheetData>${rowsXml}</sheetData></worksheet>`;
    });
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join("")}</numFmts>` : "") +
      `<fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    const wbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheetNames.map((n, k) => `<sheet name="${xmlEsc(n)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join("") + "</sheets></workbook>";
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      "</Types>";
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    return zip([
      { name: "[Content_Types].xml", data: ct }, { name: "_rels/.rels", data: rels },
      { name: "xl/workbook.xml", data: wbXml }, { name: "xl/_rels/workbook.xml.rels", data: wbRels },
      { name: "xl/styles.xml", data: styles },
      ...sheetXml.map((x, k) => ({ name: `xl/worksheets/sheet${k + 1}.xml`, data: x })),
    ]);
  }

  // --- PNG: tandai resolusi 300 dpi (chunk pHYs) ----------------------------------------
  function pngWithDpi(bytes, dpi) {
    const b = new Uint8Array(bytes);
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set(enc.encode("pHYs"), 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const ihdrEnd = 8 + 25; // tanda tangan + IHDR (4+4+13+4)
    const out = new Uint8Array(b.length + chunk.length);
    out.set(b.subarray(0, ihdrEnd), 0); out.set(chunk, ihdrEnd); out.set(b.subarray(ihdrEnd), ihdrEnd + chunk.length);
    return out;
  }

  const api = { zip, unzip, readXlsx, writeXlsx, crc32, pngWithDpi, colName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RaschXlsx = api;
})(typeof window !== "undefined" ? window : globalThis);
