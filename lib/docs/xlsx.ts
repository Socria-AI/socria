// lib/docs/xlsx.ts — a spreadsheet, read as the tables it holds.
//
// The old reader wrote each sheet out as tab-separated rows: every number as
// stored (0.125 for 12.5%, 45291 for a date), every table on a sheet run
// together. This reads a workbook the way a person looks at one:
//
//   · one page per sheet, headed by the sheet's name
//   · each sheet's tables found as regions — blocks of filled cells set
//     apart by empty rows and columns — with a title cell above a table
//     kept as its caption, and heading rows told from data
//   · values as the sheet shows them where that is unambiguous: dates as
//     ISO dates, percentages as percentages, TRUE/FALSE, errors as written;
//     other numbers as stored, to Excel's own 15 significant digits
//   · charts read from the numbers they cache, cell comments as notes,
//     pictures' alt text
//
// Large sheets are read up to a limit and the rest is said, never dropped
// without a word. Values are what the cells hold — formulas are not
// re-evaluated; the cached result Excel saved is what is read.
//
// PURE — works over OfficeParts.

import { DocBuilder, type MediaRef, type ReaderOut } from './build';
import type { RawPage } from './checks';
import { chartRawText, coreTitle, drawingText, guessHead, mimeOf, pictureInfo, readChart, relsOf, resolvePart, shownValue, visible, type OfficeParts } from './office';
import { DOC_LIMITS } from './sanitize';
import { numbersIn } from './text';
import type { DocCheck } from './types';
import { attr, decodeEntities, find, first, kid, kids, parseXml, relId, textOf, type XNode } from './xml';

/** Excel's built-in number formats, by id. */
const BUILTIN: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy-mm-dd h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
};
for (const id of [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58]) BUILTIN[id] = 'yyyy-mm-dd';

/** Rows looked at in one sheet. */
const MAX_SCAN_ROWS = 5000;
/** Characters read across the workbook before further sheets are left unread. */
const BUDGET = 300_000;

interface Sheet {
  name: string;
  part: string;
  state: 'visible' | 'hidden' | 'veryHidden';
  chart: boolean;
}

interface Workbook {
  parts: OfficeParts;
  part: string;
  shared: string[];
  formats: (string | undefined)[];
  bold: boolean[];
  date1904: boolean;
  sheets: Sheet[];
  /** the range an embedded workbook shows, when it says */
  oleRange?: string;
}

interface Cell {
  v: string;
  bold: boolean;
}

interface SheetCells {
  cells: Map<number, Map<number, Cell>>;
  rows: number;
  scannedAll: boolean;
  hiddenRows: number;
  hiddenCols: number;
}

const local = (tag: string) => `(?:[A-Za-z_][\\w.-]*:)?${tag}`;
const ROW = new RegExp(`<${local('row')}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${local('row')}>)`, 'g');
const CELL = new RegExp(`<${local('c')}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${local('c')}>)`, 'g');
const V = new RegExp(`<${local('v')}>([\\s\\S]*?)</${local('v')}>`);
const T = new RegExp(`<${local('t')}(?:\\s[^>]*)?>([\\s\\S]*?)</${local('t')}>`, 'g');
const attrIn = (s: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(s)?.[1];

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const colName = (c: number): string => {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function parseRange(ref: string | undefined): { r0: number; c0: number; r1: number; c1: number } | null {
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec((ref ?? '').trim());
  if (!m) return null;
  const c0 = colIndex(m[1]);
  const r0 = Number(m[2]) - 1;
  const c1 = m[3] ? colIndex(m[3]) : c0;
  const r1 = m[4] ? Number(m[4]) - 1 : r0;
  return { r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) };
}

/** The workbook part, from the package's own relationships. */
function workbookPart(parts: OfficeParts): string {
  const rels = parts.text('_rels/.rels');
  if (rels) {
    for (const r of find(parseXml(rels), 'Relationship')) {
      if (/officeDocument$/.test(r.attrs.Type ?? '') && r.attrs.Target) return resolvePart('', r.attrs.Target);
    }
  }
  return 'xl/workbook.xml';
}

function openWorkbook(parts: OfficeParts): Workbook | null {
  const part = workbookPart(parts);
  const xml = parts.text(part);
  if (!xml) return null;
  const root = parseXml(xml);
  const rels = relsOf(parts, part);
  const dir = part.slice(0, part.lastIndexOf('/'));
  const date1904 = /^(1|true)$/.test(attr(first(root, 'workbookPr'), 'date1904') ?? attr(first(root, 'x:workbookPr'), 'date1904') ?? '');
  const sheets: Sheet[] = [];
  const listed = [...find(root, 'sheet'), ...find(root, 'x:sheet')];
  for (const s of listed) {
    const rel = rels.get(relId(s) ?? '');
    if (!rel || rel.external) continue;
    const state = attr(s, 'state') === 'hidden' ? 'hidden' : attr(s, 'state') === 'veryHidden' ? 'veryHidden' : 'visible';
    sheets.push({ name: (attr(s, 'name') ?? `Sheet ${sheets.length + 1}`).trim(), part: rel.target, state, chart: /chartsheet$/i.test(rel.type) });
  }
  // a workbook written without its relationships: the sheets by name, in numeric order, named as the workbook lists them
  if (!sheets.length) {
    const re = new RegExp(`^${dir ? `${dir}/` : ''}worksheets/sheet(\\d+)\\.xml$`);
    parts
      .names()
      .filter((n) => re.test(n))
      .sort((a, b) => Number(re.exec(a)![1]) - Number(re.exec(b)![1]))
      .forEach((n, i) => sheets.push({ name: (attr(listed[i], 'name') ?? `Sheet ${i + 1}`).trim(), part: n, state: 'visible', chart: false }));
  }
  // shared strings: a cell's text, written once
  const shared: string[] = [];
  const sstRel = [...rels.values()].find((r) => /sharedStrings$/i.test(r.type));
  const sst = parts.text(sstRel?.target ?? `${dir}/sharedStrings.xml`);
  if (sst) {
    for (const si of [...find(parseXml(sst), 'si'), ...find(parseXml(sst), 'x:si')]) {
      shared.push(
        kids(si)
          .map((c) => (/(^|:)t$/.test(c.name) ? textOf(c) : /(^|:)r$/.test(c.name) ? kids(c).filter((k) => /(^|:)t$/.test(k.name)).map(textOf).join('') : ''))
          .join('')
      );
    }
  }
  // styles: each cell style's number format, and whether its font is bold
  const formats: (string | undefined)[] = [];
  const bold: boolean[] = [];
  const stRel = [...rels.values()].find((r) => /styles$/i.test(r.type));
  const st = parts.text(stRel?.target ?? `${dir}/styles.xml`);
  if (st) {
    const sr = parseXml(st);
    const custom = new Map<number, string>();
    for (const f of find(sr, 'numFmt').concat(find(sr, 'x:numFmt'))) custom.set(Number(attr(f, 'numFmtId')), attr(f, 'formatCode') ?? '');
    const fonts = kids(first(sr, 'fonts') ?? first(sr, 'x:fonts')).map((f) => {
      const b = kids(f).find((k) => /(^|:)b$/.test(k.name));
      return !!b && !/^(0|false)$/i.test(attr(b, 'val') ?? '');
    });
    for (const xf of kids(first(sr, 'cellXfs') ?? first(sr, 'x:cellXfs'))) {
      const id = Number(attr(xf, 'numFmtId') ?? 0);
      formats.push(custom.get(id) ?? BUILTIN[id]);
      bold.push(fonts[Number(attr(xf, 'fontId') ?? 0)] ?? false);
    }
  }
  const ole = attr(first(root, 'oleSize') ?? first(root, 'x:oleSize'), 'ref');
  return { parts, part, shared, formats, bold, date1904, sheets, ...(ole ? { oleRange: ole } : {}) };
}

/** A sheet's filled cells, as the sheet shows their values. */
function readCells(wb: Workbook, xml: string): SheetCells {
  const cells = new Map<number, Map<number, Cell>>();
  let rowNo = -1;
  let rows = 0;
  let scannedAll = true;
  let hiddenRows = 0;
  ROW.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROW.exec(xml))) {
    if (++rows > MAX_SCAN_ROWS) {
      scannedAll = false;
      break;
    }
    const r = attrIn(m[1], 'r');
    rowNo = r ? Number(r) - 1 : rowNo + 1;
    if (/\bhidden="(1|true)"/.test(m[1])) hiddenRows++;
    const inner = m[2] ?? '';
    let col = -1;
    CELL.lastIndex = 0;
    let c: RegExpExecArray | null;
    while ((c = CELL.exec(inner))) {
      const ref = attrIn(c[1], 'r');
      col = ref ? colIndex(ref) : col + 1;
      if (col < 0 || col > 16_384) continue;
      const t = attrIn(c[1], 't') ?? 'n';
      const s = Number(attrIn(c[1], 's') ?? 0);
      const body = c[2] ?? '';
      const raw = decodeEntities(V.exec(body)?.[1] ?? '');
      let v: string;
      if (t === 's') v = wb.shared[Number(raw)] ?? '';
      else if (t === 'inlineStr') v = decodeEntities([...body.matchAll(T)].map((x) => x[1]).join(''));
      else if (t === 'b') v = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw;
      else if (t === 'str' || t === 'e') v = raw;
      else if (t === 'd') v = raw.replace(/T00:00:00(?:\.0+)?Z?$/, '');
      else v = shownValue(raw, wb.formats[s], wb.date1904);
      v = v.replace(/\r\n?/g, '\n').trim();
      if (!v) continue;
      if (!cells.has(rowNo)) cells.set(rowNo, new Map());
      cells.get(rowNo)!.set(col, { v, bold: wb.bold[s] ?? false });
    }
  }
  let hiddenCols = 0;
  for (const col of xml.matchAll(new RegExp(`<${local('col')}\\b([^>]*?)/?>`, 'g'))) {
    if (/\bhidden="(1|true)"/.test(col[1])) hiddenCols += Math.max(1, Number(attrIn(col[1], 'max') ?? 0) - Number(attrIn(col[1], 'min') ?? 0) + 1);
  }
  return { cells, rows, scannedAll, hiddenRows, hiddenCols: Math.min(hiddenCols, 16_384) };
}

const jaccard = <T,>(a: Set<T>, b: Set<T>) => {
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / Math.max(1, a.size + b.size - both);
};

interface Region {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

/**
 * A sheet's filled cells into regions: bands of rows set apart by empty rows
 * (a single empty row inside one table is not a break when the rows below it
 * carry on the same columns with data), then, within a band, blocks of
 * columns set apart by empty columns.
 */
export function regionsOf(cells: Map<number, Map<number, Cell | unknown>>): Region[] {
  const rows = [...cells.keys()].sort((a, b) => a - b);
  const bands: number[][] = [];
  for (const r of rows) {
    const last = bands[bands.length - 1];
    if (last && r === last[last.length - 1] + 1) last.push(r);
    else bands.push([r]);
  }
  const colsOf = (band: number[]) => new Set(band.flatMap((r) => [...cells.get(r)!.keys()]));
  const numericRow = (r: number) => [...cells.get(r)!.values()].some((c) => typeof c === 'object' && c && 'v' in c && numbersIn(String((c as Cell).v)).length > 0 && String((c as Cell).v).replace(/[\d.,%()\-−+$€£¥₹\s]/g, '').length <= 3);
  const merged: number[][] = [];
  for (const b of bands) {
    const prev = merged[merged.length - 1];
    if (prev && b[0] - prev[prev.length - 1] === 2 && jaccard(colsOf(prev), colsOf(b)) >= 0.8 && numericRow(b[0])) prev.push(...b);
    else merged.push([...b]);
  }
  const out: Region[] = [];
  for (const band of merged) {
    const cols = [...colsOf(band)].sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const c of cols) {
      const last = groups[groups.length - 1];
      if (last && c === last[last.length - 1] + 1) last.push(c);
      else groups.push([c]);
    }
    const rowsOfGroup = (g: number[]) => new Set(band.filter((r) => g.some((c) => cells.get(r)!.has(c))));
    // an empty column sets tables apart: two tables side by side are more common than a spacer inside one
    for (const g of groups) {
      const rs = [...rowsOfGroup(g)].sort((a, b) => a - b);
      if (!rs.length) continue;
      out.push({ r0: rs[0], r1: rs[rs.length - 1], c0: g[0], c1: g[g.length - 1] });
    }
  }
  return out.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
}

const isNumberish = (v: string) => numbersIn(v).length >= 1 && v.replace(/[\d.,%()\-−+$€£¥₹\s:/]/g, '').length <= 3;

interface Emitted {
  /** cells left unread because a table was cut at the limits, as row → columns */
  clipped: Set<string>;
}

/** One sheet's regions into blocks and tables on its page. */
function emitSheet(b: DocBuilder, page: number, sc: SheetCells, notes: DocCheck[], sheetName: string, crop?: Region | null): Emitted {
  const clipped = new Set<string>();
  let cells = sc.cells;
  if (crop) {
    const kept = new Map<number, Map<number, Cell>>();
    for (const [r, row] of cells) {
      if (r < crop.r0 || r > crop.r1) continue;
      const m = new Map([...row].filter(([c]) => c >= crop.c0 && c <= crop.c1));
      if (m.size) kept.set(r, m);
    }
    cells = kept;
  }
  const regions = regionsOf(cells);
  regions.forEach((g, gi) => {
    const rowsIn: number[] = [];
    for (let r = g.r0; r <= g.r1; r++) {
      const row = cells.get(r);
      if (row && [...row.keys()].some((c) => c >= g.c0 && c <= g.c1)) rowsIn.push(r);
    }
    const width = g.c1 - g.c0 + 1;
    const cellAt = (r: number, c: number) => cells.get(r)?.get(c);
    const rowVals = (r: number) => Array.from({ length: width }, (_, i) => cellAt(r, g.c0 + i)?.v ?? '');
    // one cell: a title or a note
    if (rowsIn.length === 1 && width === 1) {
      const v = rowVals(rowsIn[0])[0];
      const short = v.split(/\s+/).length <= 12 && !/[.;:]$/.test(v);
      b.block({ page, kind: gi === 0 && short ? 'heading' : 'paragraph', text: v, ...(gi === 0 && short ? { level: 2 } : {}) });
      return;
    }
    // one row: a line of the sheet
    if (rowsIn.length === 1) {
      b.block({ page, kind: 'paragraph', text: rowVals(rowsIn[0]).filter(Boolean).join(' | ') });
      return;
    }
    // a title cell over a table: its caption
    let first = 0;
    const top = rowVals(rowsIn[0]);
    if (rowsIn.length >= 3 && width >= 2 && top.filter(Boolean).length === 1 && top[0]) {
      b.block({ page, kind: 'caption', text: top[0] });
      first = 1;
    }
    const body = rowsIn.slice(first);
    // one column of words: lines, not a table
    if (width === 1) {
      const vals = body.map((r) => rowVals(r)[0]);
      const nums = vals.slice(1).filter(isNumberish).length;
      if (vals.length < 3 || nums / Math.max(1, vals.length - 1) < 0.6) {
        for (const v of vals) b.block({ page, kind: 'paragraph', text: v });
        return;
      }
    }
    const maxRows = DOC_LIMITS.rows;
    const maxCols = DOC_LIMITS.cols;
    const keepRows = body.slice(0, maxRows);
    const keepCols = Math.min(width, maxCols);
    if (body.length > maxRows || width > maxCols) {
      for (const r of body.slice(maxRows)) for (const c of cells.get(r)?.keys() ?? []) if (c >= g.c0 && c <= g.c1) clipped.add(`${r}:${c}`);
      if (width > maxCols) for (const r of keepRows) for (const c of cells.get(r)?.keys() ?? []) if (c >= g.c0 + maxCols && c <= g.c1) clipped.add(`${r}:${c}`);
      const range = `${colName(g.c0)}${body[0] + 1}:${colName(g.c1)}${body[body.length - 1] + 1}`;
      const parts = [body.length > maxRows ? `the first ${maxRows} of its ${body.length} rows` : '', width > maxCols ? `the first ${maxCols} of its ${width} columns` : ''].filter(Boolean);
      notes.push({ id: 'unread', level: 'warn', says: `The table at ${sheetName}!${range} was read only in part: ${parts.join(' and ')}.`, pages: [page] });
    }
    const rows = keepRows.map((r) => rowVals(r).slice(0, keepCols));
    const boldRow = (r: number | undefined) => r !== undefined && [...(cells.get(r)?.entries() ?? [])].filter(([c]) => c >= g.c0 && c <= g.c1).every(([, x]) => x.bold) && (cells.get(r)?.size ?? 0) > 0;
    b.table({ page, rows, head: guessHead(rows, boldRow(keepRows[0]), boldRow(keepRows[1])) });
  });
  return { clipped };
}

/** A drawing part's charts, pictures and shapes into figures on a page. Returns its raw text. */
function emitDrawing(parts: OfficeParts, b: DocBuilder, page: number, drawingPart: string, media: { figure: number; part: string }[], date1904: boolean): string {
  const xml = parts.text(drawingPart);
  if (!xml) return '';
  const rels = relsOf(parts, drawingPart);
  const root = parseXml(xml);
  const raw: string[] = [];
  const anchors = kids(first(root, 'xdr:wsDr') ?? root).filter((a) => /Anchor$/.test(a.name));
  const visit = (n: XNode | undefined) => {
    if (!n) return;
    for (const c of kids(n)) {
      if (c.name === 'mc:AlternateContent') {
        const alt = kid(c, 'mc:Choice') ?? kid(c, 'mc:Fallback');
        if (alt) visit(alt);
        continue;
      }
      if (c.name === 'xdr:grpSp') {
        visit(c);
        continue;
      }
      if (c.name === 'xdr:graphicFrame') {
        const info = pictureInfo(first(c, 'xdr:cNvPr'));
        const ref = first(c, 'c:chart') ?? first(c, 'cx:chart');
        const rel = rels.get(relId(ref) ?? '');
        const cxml = rel && !rel.external ? parts.text(rel.target) : null;
        const chart = cxml ? readChart(cxml, date1904) : null;
        if (chart) {
          raw.push(chartRawText(cxml!, date1904), info.alt ?? '', info.title ?? '');
          const t = chart.rows.length > 1 ? b.table({ page, rows: chart.rows, head: chart.head, ...(chart.title ? { caption: chart.title } : {}) }) : undefined;
          b.figure({ page, kind: 'chart', chart: chart.kind, ...(chart.title ? { caption: chart.title } : {}), ...(info.alt ? { alt: info.alt } : {}), ...(t !== undefined ? { table: t } : {}) }, [chart.title, ...chart.axes, info.alt, info.title].filter(Boolean).join('\n'));
        }
        continue;
      }
      if (c.name === 'xdr:pic') {
        const info = pictureInfo(first(c, 'xdr:cNvPr'));
        if (info.decorative) continue;
        const rel = rels.get(attr(first(c, 'a:blip'), 'embed') ?? '');
        raw.push(info.alt ?? '', info.title ?? '');
        const i = b.figure({ page, kind: 'image', ...(info.alt ? { alt: info.alt } : {}) }, [info.alt, info.title].filter(Boolean).join('\n'));
        if (rel && !rel.external) media.push({ figure: i, part: rel.target });
        continue;
      }
      if (c.name === 'xdr:sp') {
        const t = drawingText(kid(c, 'xdr:txBody'));
        if (t) {
          raw.push(t);
          b.block({ page, kind: 'note', text: t });
        }
      }
    }
  };
  for (const a of anchors) visit(a);
  return raw.join('\n');
}

/** Cell comments ("notes" in Excel) into note blocks at the end of the sheet. Returns their raw text and labels. */
function emitComments(parts: OfficeParts, b: DocBuilder, page: number, part: string): { raw: string; generated: string } {
  const xml = parts.text(part);
  if (!xml) return { raw: '', generated: '' };
  const root = parseXml(xml);
  const authors = find(root, 'author').map(textOf);
  const raw: string[] = [];
  const gen: string[] = [];
  for (const c of find(root, 'comment')) {
    const text = find(kid(c, 'text'), 't').map(textOf).join('').trim();
    if (!text) continue;
    const who = authors[Number(attr(c, 'authorId'))] ?? '';
    const label = `[Comment${who ? ` — ${who}` : ''}] ${attr(c, 'ref') ?? ''}:`;
    raw.push(text);
    gen.push(label);
    b.block({ page, kind: 'note', text: `${label} ${text}` });
  }
  return { raw: raw.join('\n'), generated: gen.join('\n') };
}

/**
 * Filled cells (row → column → value) into the tables and lines of one page,
 * the way a sheet is read. For OpenDocument spreadsheets, which hold their
 * cells differently but are laid out the same. Returns the cells left unread
 * at the limits, as "row:col".
 */
export function emitCells(b: DocBuilder, page: number, cells: Map<number, Map<number, { v: string; bold: boolean }>>, notes: DocCheck[], sheetName: string): Set<string> {
  return emitSheet(b, page, { cells, rows: cells.size, scannedAll: true, hiddenRows: 0, hiddenCols: 0 }, notes, sheetName).clipped;
}

/** A workbook into a SourceDoc: one page per sheet. */
export function readXlsx(parts: OfficeParts, meta: { id: string; name: string }): ReaderOut {
  const wb = openWorkbook(parts);
  if (!wb || !wb.sheets.length) throw new Error('it has no sheets inside it');
  const b = new DocBuilder('structured');
  const raw: RawPage[] = [];
  const notes: DocCheck[] = [];
  const mediaDraft: { figure: number; part: string }[] = [];
  let unread: { from: number; to: number } | undefined;
  wb.sheets.forEach((s, i) => {
    const page = i + 1;
    if (unread) return;
    if (page > 1 && b.chars > BUDGET) {
      unread = { from: page, to: wb.sheets.length };
      return;
    }
    const label = s.state === 'visible' ? s.name : `${s.name} (hidden sheet)`;
    b.block({ page, kind: 'heading', level: 1, text: label });
    const pageRaw: string[] = [s.name];
    const generated: string[] = s.state === 'visible' ? [] : ['(hidden sheet)'];
    const xml = parts.text(s.part);
    const rels = relsOf(parts, s.part);
    if (xml && !s.chart) {
      const sc = readCells(wb, xml);
      if (!sc.scannedAll) notes.push({ id: 'unread', level: 'warn', says: `${s.name} is longer than Socria reads: its first ${MAX_SCAN_ROWS.toLocaleString('en-US')} rows were looked at.`, pages: [page] });
      if (sc.hiddenRows || sc.hiddenCols)
        notes.push({ id: 'tables', level: 'ok', says: `${s.name} has ${[sc.hiddenRows ? `${sc.hiddenRows} hidden row${sc.hiddenRows === 1 ? '' : 's'}` : '', sc.hiddenCols ? `${sc.hiddenCols} hidden column${sc.hiddenCols === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}; they were read too.`, pages: [page] });
      const { clipped } = emitSheet(b, page, sc, notes, s.name);
      for (const [r, row] of sc.cells) for (const [c, cell] of row) if (!clipped.has(`${r}:${c}`)) pageRaw.push(cell.v);
    }
    for (const rel of rels.values()) {
      if (rel.external) continue;
      if (/drawing$/i.test(rel.type)) pageRaw.push(emitDrawing(parts, b, page, rel.target, mediaDraft, wb.date1904));
      if (/comments$/i.test(rel.type)) {
        const c = emitComments(parts, b, page, rel.target);
        pageRaw.push(c.raw);
        generated.push(c.generated);
      }
    }
    raw.push({ n: page, text: [...pageRaw, ...generated].join('\n') });
  });
  const doc = b.build({ id: meta.id, name: meta.name, format: 'xlsx', pageCount: wb.sheets.length, title: coreTitle(parts), ...(unread ? { unread } : {}) });
  const media: MediaRef[] = mediaDraft
    .map((m) => ({ figure: `f${m.figure + 1}`, page: doc.figures[m.figure]?.page ?? 1, part: m.part, mime: mimeOf(m.part) }))
    .filter((m) => visible(m.mime));
  return { doc, raw, notes, media };
}

/**
 * A spreadsheet embedded in a Word or PowerPoint file, as the tables it
 * shows: the range it says it shows (its OLE size), or its first sheet's
 * used cells. Returns null when it cannot be read.
 */
export function embeddedWorkbook(parts: OfficeParts, b: DocBuilder, page: number, notes: DocCheck[]): { raw: string } | null {
  const wb = openWorkbook(parts);
  const sheet = wb?.sheets.find((s) => s.state === 'visible' && !s.chart) ?? wb?.sheets[0];
  if (!wb || !sheet) return null;
  const xml = parts.text(sheet.part);
  if (!xml) return null;
  const sc = readCells(wb, xml);
  const crop = parseRange(wb.oleRange);
  const { clipped } = emitSheet(b, page, sc, notes, sheet.name, crop);
  const raw: string[] = [];
  for (const [r, row] of sc.cells) {
    for (const [c, cell] of row) {
      if (crop && (r < crop.r0 || r > crop.r1 || c < crop.c0 || c > crop.c1)) continue;
      if (!clipped.has(`${r}:${c}`)) raw.push(cell.v);
    }
  }
  return { raw: raw.join('\n') };
}

/** For the tests: the region finder over plain values. */
export const __test = { parseRange, colIndex, colName };
