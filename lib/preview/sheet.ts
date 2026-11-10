// lib/preview/sheet.ts — a workbook (or a CSV) as the grid it is.
//
// What the preview draws: every sheet as columns and rows, its column widths and
// row heights, merged cells, frozen panes, and each cell as the spreadsheet shows
// it — its number format applied (lib/preview/numfmt.ts), bold, italic, colour,
// fill, alignment, wrapping. The reading Socria reasons with (lib/docs/xlsx.ts)
// is separate and keeps the stored values; this is only what a person sees.
//
// PURE (JSZip aside).

import { attr, textOf, type XNode } from '@/lib/docs/xml';
import { BUILTIN_FORMATS, formatCell } from './numfmt';
import { findL, hexColor, kidL, kidsL, openPackage, relsOf, rootOf, themeColors, tint, type Package } from './ooxml';

export interface CellStyle {
  b?: true;
  i?: true;
  u?: true;
  strike?: true;
  color?: string;
  fill?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  valign?: 'top' | 'middle' | 'bottom';
  wrap?: true;
  /** font size in points */
  size?: number;
  font?: string;
  borders?: { t?: string; r?: string; b?: string; l?: string };
  indent?: number;
}

export interface Cell {
  /** as shown */
  text: string;
  /** a number (drawn right-aligned unless the style says otherwise) */
  num?: true;
  style?: CellStyle;
}

export interface Merge {
  r: number;
  c: number;
  rows: number;
  cols: number;
}

export interface Sheet {
  name: string;
  kind: 'grid' | 'chart';
  hidden?: boolean;
  /** rows × cols drawn (within the limits) */
  rows: number;
  cols: number;
  /** cells by row then column; a missing entry is an empty cell */
  cells: (Cell | undefined)[][];
  /** pixels */
  colWidths: number[];
  rowHeights: number[];
  hiddenCols?: number[];
  hiddenRows?: number[];
  merges: Merge[];
  frozen?: { rows: number; cols: number };
  /** the sheet's full size when it was larger than a preview draws */
  cut?: { rows: number; cols: number };
  /** gridlines off in the file */
  noGrid?: true;
}

export interface Workbook {
  sheets: Sheet[];
}

/** The most rows and columns drawn of one sheet; beyond, the preview says so. */
export const MAX_ROWS = 2000;
export const MAX_COLS = 80;
const DEFAULT_COL_PX = 64;
const DEFAULT_ROW_PX = 20;

/** "B12" → [11, 1] (row, col), zero-based. */
export function refToRC(ref: string): [number, number] | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/i.exec(ref.trim());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, c - 1];
}

/** 0 → "A", 26 → "AA". */
export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Excel's column width (in characters of the default font) as pixels. */
const widthPx = (w: number) => Math.max(8, Math.round(w * 7 + 5));
/** A row height in points as pixels. */
const heightPx = (pt: number) => Math.max(6, Math.round((pt * 4) / 3));

interface Styles {
  xfs: { numFmt?: string; style?: CellStyle }[];
}

function colorOf(n: XNode | undefined, theme: Record<string, string>): string | undefined {
  if (!n) return undefined;
  const rgb = hexColor(attr(n, 'rgb'));
  const t = Number(attr(n, 'tint') ?? 0);
  if (rgb) return t ? tint(rgb, t) : rgb;
  const th = attr(n, 'theme');
  if (th !== undefined) {
    // the spreadsheet's theme index runs lt1, dk1, lt2, dk2, accent1…6, hlink, folHlink
    const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    const base = theme[order[Number(th)] ?? ''];
    if (base) return t ? tint(base, t) : base;
  }
  const idx = attr(n, 'indexed');
  if (idx !== undefined) return INDEXED[Number(idx)];
  return undefined;
}

// the legacy palette a few files still use
const INDEXED: Record<number, string> = { 8: '#000000', 9: '#FFFFFF', 10: '#FF0000', 11: '#00FF00', 12: '#0000FF', 13: '#FFFF00', 14: '#FF00FF', 15: '#00FFFF', 16: '#800000', 17: '#008000', 18: '#000080', 19: '#808000', 20: '#800080', 21: '#008080', 22: '#C0C0C0', 23: '#808080' };

async function readStyles(pkg: Package, path: string | undefined, theme: Record<string, string>): Promise<Styles> {
  const out: Styles = { xfs: [] };
  if (!path) return out;
  const root = rootOf(await pkg.xml(path));
  if (!root) return out;
  const fmts = new Map<number, string>();
  for (const f of kidsL(kidL(root, 'numFmts'), 'numFmt')) fmts.set(Number(attr(f, 'numFmtId')), attr(f, 'formatCode') ?? '');
  const fonts = kidsL(kidL(root, 'fonts'), 'font').map((f) => {
    const s: CellStyle = {};
    if (kidL(f, 'b') && attr(kidL(f, 'b'), 'val') !== '0') s.b = true;
    if (kidL(f, 'i') && attr(kidL(f, 'i'), 'val') !== '0') s.i = true;
    if (kidL(f, 'u') && attr(kidL(f, 'u'), 'val') !== 'none') s.u = true;
    if (kidL(f, 'strike') && attr(kidL(f, 'strike'), 'val') !== '0') s.strike = true;
    const c = colorOf(kidL(f, 'color'), theme);
    if (c && c !== '#000000') s.color = c;
    const sz = Number(attr(kidL(f, 'sz'), 'val'));
    if (sz && sz !== 11) s.size = sz;
    const name = attr(kidL(f, 'name'), 'val');
    if (name && !/^calibri$/i.test(name)) s.font = name;
    return s;
  });
  const fills = kidsL(kidL(root, 'fills'), 'fill').map((f) => {
    const p = kidL(f, 'patternFill');
    if (!p || (attr(p, 'patternType') ?? 'none') === 'none') return undefined;
    return colorOf(kidL(p, 'fgColor'), theme) ?? colorOf(kidL(p, 'bgColor'), theme);
  });
  const borders = kidsL(kidL(root, 'borders'), 'border').map((b) => {
    const side = (name: string) => {
      const s = kidL(b, name);
      const style = attr(s, 'style');
      if (!s || !style || style === 'none') return undefined;
      const w = /thick/.test(style) ? 3 : /medium/.test(style) ? 2 : 1;
      const kind = /dash|dot/i.test(style) ? 'dashed' : style === 'double' ? 'double' : 'solid';
      return `${w}px ${kind} ${colorOf(kidL(s, 'color'), theme) ?? '#000000'}`;
    };
    const o = { t: side('top'), r: side('right'), b: side('bottom'), l: side('left') };
    return o.t || o.r || o.b || o.l ? o : undefined;
  });
  for (const xf of kidsL(kidL(root, 'cellXfs'), 'xf')) {
    const id = Number(attr(xf, 'numFmtId') ?? 0);
    const style: CellStyle = { ...(fonts[Number(attr(xf, 'fontId') ?? 0)] ?? {}) };
    const fill = fills[Number(attr(xf, 'fillId') ?? 0)];
    if (fill) style.fill = fill;
    const bd = borders[Number(attr(xf, 'borderId') ?? 0)];
    if (bd) style.borders = bd;
    const al = kidL(xf, 'alignment');
    if (al) {
      const h = attr(al, 'horizontal');
      if (h === 'center' || h === 'centerContinuous') style.align = 'center';
      else if (h === 'right') style.align = 'right';
      else if (h === 'left') style.align = 'left';
      else if (h === 'justify' || h === 'distributed') style.align = 'justify';
      const v = attr(al, 'vertical');
      if (v === 'top') style.valign = 'top';
      else if (v === 'center') style.valign = 'middle';
      if (attr(al, 'wrapText') === '1' || attr(al, 'wrapText') === 'true') style.wrap = true;
      const ind = Number(attr(al, 'indent') ?? 0);
      if (ind) style.indent = ind;
    }
    out.xfs.push({ numFmt: fmts.get(id) ?? BUILTIN_FORMATS[id], ...(Object.keys(style).length ? { style } : {}) });
  }
  return out;
}

function sharedStringsOf(root: XNode | undefined): string[] {
  // a shared string is plain (t) or rich (runs of r/t); phonetic guides (rPh) are not shown
  return kidsL(root, 'si').map((si) => {
    const t = kidL(si, 't');
    if (t) return textOf(t);
    return kidsL(si, 'r').map((r) => textOf(kidL(r, 't'))).join('');
  });
}

/** Read a .xlsx into the sheets a preview draws. */
export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<Workbook> {
  const pkg = await openPackage(data);
  const wbPath = 'xl/workbook.xml';
  const wb = rootOf(await pkg.xml(wbPath));
  if (!wb) throw new Error('This workbook has no sheets that can be drawn.');
  const rels = await relsOf(pkg, wbPath);
  const relOfType = (t: string) => [...rels.values()].find((r) => r.type === t)?.target;
  const theme = await themeColors(pkg, relOfType('theme'));
  const styles = await readStyles(pkg, relOfType('styles'), theme);
  const shared = sharedStringsOf(rootOf(await pkg.xml(relOfType('sharedStrings') ?? 'xl/sharedStrings.xml')));
  const date1904 = ['1', 'true'].includes(attr(kidL(wb, 'workbookPr'), 'date1904') ?? '');

  const sheets: Sheet[] = [];
  for (const s of kidsL(kidL(wb, 'sheets'), 'sheet')) {
    const rid = Object.entries(s.attrs).find(([k]) => k.endsWith(':id'))?.[1];
    const rel = rid ? rels.get(rid) : undefined;
    const name = attr(s, 'name') ?? `Sheet ${sheets.length + 1}`;
    const hidden = (attr(s, 'state') ?? 'visible') !== 'visible';
    if (!rel) continue;
    if (rel.type === 'chartsheet') {
      sheets.push({ name, kind: 'chart', hidden, rows: 0, cols: 0, cells: [], colWidths: [], rowHeights: [], merges: [] });
      continue;
    }
    const root = rootOf(await pkg.xml(rel.target));
    if (!root) continue;
    sheets.push(readSheet(name, root, shared, styles, date1904, hidden));
  }
  if (!sheets.length) throw new Error('This workbook has no sheets that can be drawn.');
  return { sheets };
}

function readSheet(name: string, root: XNode, shared: string[], styles: Styles, date1904: boolean, hidden: boolean): Sheet {
  const fmt = kidL(root, 'sheetFormatPr');
  const defCol = attr(fmt, 'defaultColWidth') ? widthPx(Number(attr(fmt, 'defaultColWidth'))) : attr(fmt, 'baseColWidth') ? widthPx(Number(attr(fmt, 'baseColWidth')) + 0.71) : DEFAULT_COL_PX;
  const defRow = attr(fmt, 'defaultRowHeight') ? heightPx(Number(attr(fmt, 'defaultRowHeight'))) : DEFAULT_ROW_PX;
  const cells: (Cell | undefined)[][] = [];
  const rowHeights = new Map<number, number>();
  const hiddenRows: number[] = [];
  let maxR = 0;
  let maxC = 0;
  let fullR = 0;
  let fullC = 0;
  for (const row of kidsL(kidL(root, 'sheetData'), 'row')) {
    const r = Number(attr(row, 'r') ?? 0) - 1;
    if (r < 0) continue;
    fullR = Math.max(fullR, r + 1);
    if (attr(row, 'ht') && attr(row, 'customHeight') !== '0') rowHeights.set(r, heightPx(Number(attr(row, 'ht'))));
    if (attr(row, 'hidden') === '1' || attr(row, 'hidden') === 'true') hiddenRows.push(r);
    if (r >= MAX_ROWS) continue;
    let nextC = 0;
    for (const c of kidsL(row, 'c')) {
      const rc = attr(c, 'r') ? refToRC(attr(c, 'r')!) : [r, nextC];
      if (!rc) continue;
      const col = rc[1];
      nextC = col + 1;
      fullC = Math.max(fullC, col + 1);
      if (col >= MAX_COLS) continue;
      const xf = styles.xfs[Number(attr(c, 's') ?? 0)];
      const cell = cellOf(c, shared, xf, date1904);
      if (!cell) continue;
      (cells[r] ??= [])[col] = cell;
      maxR = Math.max(maxR, r + 1);
      maxC = Math.max(maxC, col + 1);
    }
  }
  // columns: widths and hidden ones
  const colWidths: number[] = [];
  const hiddenCols: number[] = [];
  for (const c of kidsL(kidL(root, 'cols'), 'col')) {
    const min = Number(attr(c, 'min') ?? 1) - 1;
    const max = Math.min(Number(attr(c, 'max') ?? min + 1) - 1, MAX_COLS - 1);
    for (let k = min; k <= max; k++) {
      if (attr(c, 'width')) colWidths[k] = widthPx(Number(attr(c, 'width')));
      if (attr(c, 'hidden') === '1' || attr(c, 'hidden') === 'true') hiddenCols.push(k);
    }
  }
  const merges: Merge[] = [];
  for (const m of kidsL(kidL(root, 'mergeCells'), 'mergeCell')) {
    const [a, b] = (attr(m, 'ref') ?? '').split(':');
    const s = a ? refToRC(a) : null;
    const e = b ? refToRC(b) : s;
    if (!s || !e || s[0] >= MAX_ROWS || s[1] >= MAX_COLS) continue;
    merges.push({ r: s[0], c: s[1], rows: Math.min(e[0], MAX_ROWS - 1) - s[0] + 1, cols: Math.min(e[1], MAX_COLS - 1) - s[1] + 1 });
    maxR = Math.max(maxR, Math.min(e[0] + 1, MAX_ROWS));
    maxC = Math.max(maxC, Math.min(e[1] + 1, MAX_COLS));
  }
  // frozen panes, from the first view
  const pane = findL(kidL(root, 'sheetViews'), 'pane');
  const frozen = pane && /frozen/i.test(attr(pane, 'state') ?? '') ? { rows: Math.floor(Number(attr(pane, 'ySplit') ?? 0)), cols: Math.floor(Number(attr(pane, 'xSplit') ?? 0)) } : undefined;
  const view = kidL(kidL(root, 'sheetViews'), 'sheetView');
  const noGrid = attr(view, 'showGridLines') === '0' || attr(view, 'showGridLines') === 'false';
  // a sheet with nothing on it still shows its first screen of empty cells
  const rows = Math.max(maxR, Math.min(MAX_ROWS, (frozen?.rows ?? 0) + 1), 1);
  const cols = Math.max(maxC, Math.min(MAX_COLS, (frozen?.cols ?? 0) + 1), 1);
  const cut = fullR > MAX_ROWS || fullC > MAX_COLS ? { rows: fullR, cols: fullC } : undefined;
  return {
    name,
    kind: 'grid',
    ...(hidden ? { hidden } : {}),
    rows,
    cols,
    cells,
    colWidths: Array.from({ length: cols }, (_, k) => colWidths[k] ?? defCol),
    rowHeights: Array.from({ length: rows }, (_, k) => rowHeights.get(k) ?? defRow),
    ...(hiddenCols.length ? { hiddenCols } : {}),
    ...(hiddenRows.length ? { hiddenRows: hiddenRows.filter((r) => r < rows) } : {}),
    merges,
    ...(frozen && (frozen.rows || frozen.cols) ? { frozen } : {}),
    ...(cut ? { cut } : {}),
    ...(noGrid ? { noGrid: true as const } : {}),
  };
}

function cellOf(c: XNode, shared: string[], xf: Styles['xfs'][number] | undefined, date1904: boolean): Cell | undefined {
  const t = attr(c, 't') ?? 'n';
  const v = kidL(c, 'v');
  const raw = v ? textOf(v) : '';
  let text = '';
  let num = false;
  let color: string | undefined;
  if (t === 's') text = shared[Number(raw)] ?? '';
  else if (t === 'inlineStr') text = kidsL(kidL(c, 'is'), 't').map(textOf).join('') || kidsL(kidL(c, 'is'), 'r').map((r) => textOf(kidL(r, 't'))).join('');
  else if (t === 'str') text = raw;
  else if (t === 'b') text = raw === '1' ? 'TRUE' : 'FALSE';
  else if (t === 'e') text = raw;
  else if (t === 'd') text = raw.replace('T', ' ').replace(/\.\d+Z?$|Z$/, '');
  else if (raw !== '') {
    const shown = formatCell(raw, xf?.numFmt, date1904);
    text = shown.text;
    color = shown.color;
    num = true;
  }
  if (t === 's' || t === 'inlineStr' || t === 'str') {
    // a text cell under a format with a text section ("@") is shown through it
    if (xf?.numFmt && /;.*;.*;|^@$/.test(xf.numFmt) && xf.numFmt !== '@') text = formatCell(text, xf.numFmt, date1904).text;
  }
  if (!text && !xf?.style?.fill && !xf?.style?.borders) return undefined;
  const style = xf?.style ? { ...xf.style, ...(color ? { color } : {}) } : color ? { color } : undefined;
  return { text, ...(num ? { num: true as const } : {}), ...(style ? { style } : {}) };
}

// ── CSV and TSV ─────────────────────────────────────────────────────

/** RFC 4180 rows: quoted fields, doubled quotes, line breaks inside quotes. */
export function parseDelimited(text: string, delim = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let k = 0; k < src.length; k++) {
    const ch = src[k];
    if (q) {
      if (ch === '"') {
        if (src[k + 1] === '"') {
          f += '"';
          k++;
        } else q = false;
      } else f += ch;
      continue;
    }
    if (ch === '"' && f === '') q = true;
    else if (ch === delim) {
      row.push(f);
      f = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[k + 1] === '\n') k++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
      if (rows.length >= MAX_ROWS + 1) break;
    } else f += ch;
  }
  if (f !== '' || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

/** Which delimiter a delimited text uses: by name, else by what its first lines split on most evenly. */
export function delimiterOf(name: string, text: string): string {
  if (/\.tsv$/i.test(name)) return '\t';
  const head = text.split(/\r?\n/).slice(0, 6);
  let best = ',';
  let score = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = head.map((l) => l.split(d).length - 1);
    const min = Math.min(...counts);
    const s = min > 0 && counts.every((c) => c === counts[0]) ? min * 2 : min;
    if (s > score) {
      score = s;
      best = d;
    }
  }
  return best;
}

/** A CSV or TSV as one sheet, numbers aligned as numbers. */
export function delimitedSheet(name: string, text: string): Workbook {
  const all = parseDelimited(text, delimiterOf(name, text));
  const fullR = all.length;
  const fullC = all.reduce((m, r) => Math.max(m, r.length), 0);
  const data = all.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS));
  const rows = Math.max(1, data.length);
  const cols = Math.max(1, Math.min(MAX_COLS, fullC));
  const cells = data.map((r, ri) =>
    r.map((v): Cell | undefined => {
      if (v === '') return undefined;
      const isNum = /^-?[\d,]*\.?\d+(?:[eE][-+]?\d+)?%?$/.test(v.trim());
      return { text: v, ...(isNum ? { num: true as const } : {}), ...(ri === 0 && !isNum ? { style: { b: true as const } } : {}) };
    })
  );
  // a column as wide as its widest early value, within reason
  const colWidths = Array.from({ length: cols }, (_, c) => Math.min(320, Math.max(DEFAULT_COL_PX, ...data.slice(0, 200).map((r) => (r[c]?.length ?? 0) * 7 + 16))));
  return {
    sheets: [
      {
        name: name.replace(/\.[^.]+$/, '') || 'Sheet',
        kind: 'grid',
        rows,
        cols,
        cells,
        colWidths,
        rowHeights: Array.from({ length: rows }, () => DEFAULT_ROW_PX),
        merges: [],
        frozen: { rows: 1, cols: 0 },
        ...(fullR > MAX_ROWS || fullC > MAX_COLS ? { cut: { rows: fullR, cols: fullC } } : {}),
      },
    ],
  };
}

