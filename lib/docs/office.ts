// lib/docs/office.ts — what Word, PowerPoint and Excel files have in common.
//
// The Office formats are zips of XML parts that point at each other through
// relationship files: a paragraph's picture is "rId7", and
// word/_rels/document.xml.rels says rId7 is media/image3.png. Shared here:
//
//   parts      the package as names → text or bytes (the server reader builds
//              it from the zip; tests build it from a Map)
//   rels       a part's relationships, targets resolved to part names
//   charts     a chart part carries the numbers it draws — a cache of the
//              spreadsheet behind it — so a chart in a report is read as a
//              table of its exact values, never estimated from a picture
//   diagrams   SmartArt carries its words the same way, as an outline
//   pictures   alt text and the "decorative" mark from a drawing's properties
//   symbols    Symbol and Wingdings characters as the Unicode they draw
//   dates      spreadsheet serial dates, and which number formats are dates
//
// PURE.

import { numbersIn } from './text';
import type { ChartKind } from './types';
import { attr, find, first, isNode, kid, kids, parseXml, textOf, type XNode } from './xml';

/** An Office package: its parts by name. */
export interface OfficeParts {
  names(): string[];
  /** a part as UTF-8 text, or null when it is not in the package */
  text(name: string): string | null;
  /** a part's bytes, or null */
  bytes(name: string): Uint8Array | null;
  /** a package embedded as a part (a spreadsheet inside a Word file), opened — when the reader can */
  open?(name: string): OfficeParts | null;
}

// ── relationships ───────────────────────────────────────────────────

export interface Rel {
  id: string;
  /** the last segment of the relationship type: "image", "chart", "hyperlink", "footer"… */
  type: string;
  /** a part name inside the package, or the URL of an external target */
  target: string;
  external: boolean;
}

function normalizePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
}

/** A relationship target, relative to the folder of the part that names it, as a part name. */
export function resolvePart(dir: string, target: string): string {
  if (target.startsWith('/')) return normalizePath(target.slice(1));
  return normalizePath(dir ? `${dir}/${target}` : target);
}

/** The folder a part is in ("word" for "word/document.xml"). */
export const dirOf = (part: string) => (part.includes('/') ? part.slice(0, part.lastIndexOf('/')) : '');

/** A part's relationships by id. */
export function relsOf(parts: OfficeParts, part: string): Map<string, Rel> {
  const dir = dirOf(part);
  const file = part.slice(part.lastIndexOf('/') + 1);
  const xml = parts.text(`${dir ? `${dir}/` : ''}_rels/${file}.rels`);
  const out = new Map<string, Rel>();
  if (!xml) return out;
  for (const r of find(parseXml(xml), 'Relationship')) {
    const id = r.attrs.Id;
    const target = r.attrs.Target;
    if (!id || !target) continue;
    const external = r.attrs.TargetMode === 'External';
    out.set(id, { id, type: (r.attrs.Type ?? '').split('/').pop() ?? '', target: external ? target : resolvePart(dir, target), external });
  }
  return out;
}

/** The title the file's properties give it, unless it is a placeholder. */
export function coreTitle(parts: OfficeParts): string | undefined {
  const xml = parts.text('docProps/core.xml');
  if (!xml) return undefined;
  const t = textOf(first(parseXml(xml), 'dc:title')).replace(/\s+/g, ' ').trim();
  if (t.length < 2 || /^(untitled|document\d*|presentation\d*|book\d*|powerpoint presentation|microsoft (word|powerpoint|excel)[\s-].*)$/i.test(t)) return undefined;
  return t.slice(0, 300);
}

// ── markup compatibility ────────────────────────────────────────────

/**
 * mc:AlternateContent holds the same content twice — a modern form (Choice)
 * and a fallback for old readers. Reading both would read it twice, so only
 * the first Choice is read (or the Fallback when there is no Choice).
 */
export function alternate(n: XNode): XNode[] {
  const choice = kid(n, 'mc:Choice') ?? kid(n, 'mc:Fallback');
  return choice ? kids(choice) : [];
}

/** Every descendant with a name, in order, never inside a markup-compatibility fallback. */
export function findIn(n: XNode | undefined, name: string, out: XNode[] = []): XNode[] {
  if (!n) return out;
  for (const c of n.children) {
    if (!isNode(c)) continue;
    if (c.name === 'mc:AlternateContent') {
      for (const a of alternate(c)) {
        if (a.name === name) out.push(a);
        findIn(a, name, out);
      }
      continue;
    }
    if (c.name === name) out.push(c);
    findIn(c, name, out);
  }
  return out;
}

/** The text of DrawingML paragraphs (a:p > a:r > a:t), one line per paragraph. */
export function drawingText(n: XNode | undefined): string {
  if (!n) return '';
  return findIn(n, 'a:p')
    .map((p) => findIn(p, 'a:t').map(textOf).join(''))
    .join('\n')
    .trim();
}

// ── pictures ────────────────────────────────────────────────────────

export interface PictureInfo {
  alt?: string;
  title?: string;
  decorative: boolean;
  hidden: boolean;
}

/** What a drawing's non-visual properties (wp:docPr, p:cNvPr, pic:cNvPr) say about it. */
export function pictureInfo(pr: XNode | undefined): PictureInfo {
  if (!pr) return { decorative: false, hidden: false };
  const alt = (attr(pr, 'descr') ?? '').replace(/\s+/g, ' ').trim();
  const title = (attr(pr, 'title') ?? '').replace(/\s+/g, ' ').trim();
  const dec = first(pr, 'adec:decorative');
  const decorative = !!dec && /^(1|true|on)$/i.test(attr(dec, 'val') ?? '');
  const hidden = /^(1|true|on)$/i.test(attr(pr, 'hidden') ?? '');
  return { ...(alt ? { alt } : {}), ...(title ? { title } : {}), decorative, hidden };
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf', svg: 'image/svg+xml' };
/** An image part's type from its name. */
export const mimeOf = (part: string) => MIME[(/\.([a-z0-9]+)$/i.exec(part)?.[1] ?? '').toLowerCase()] ?? 'application/octet-stream';
/** Image types a vision model can be shown. EMF and WMF (Office's vector previews) are not among them. */
export const visible = (mime: string) => /^image\/(png|jpeg|gif|webp)$/.test(mime);

// ── symbols ─────────────────────────────────────────────────────────

const SYMBOL: Record<number, string> = {
  0x20: ' ', 0x21: '!', 0x22: '∀', 0x23: '#', 0x24: '∃', 0x25: '%', 0x26: '&', 0x27: '∋', 0x28: '(', 0x29: ')', 0x2a: '∗', 0x2b: '+', 0x2c: ',', 0x2d: '−', 0x2e: '.', 0x2f: '/',
  0x30: '0', 0x31: '1', 0x32: '2', 0x33: '3', 0x34: '4', 0x35: '5', 0x36: '6', 0x37: '7', 0x38: '8', 0x39: '9', 0x3a: ':', 0x3b: ';', 0x3c: '<', 0x3d: '=', 0x3e: '>', 0x3f: '?',
  0x40: '≅', 0x41: 'Α', 0x42: 'Β', 0x43: 'Χ', 0x44: 'Δ', 0x45: 'Ε', 0x46: 'Φ', 0x47: 'Γ', 0x48: 'Η', 0x49: 'Ι', 0x4a: 'ϑ', 0x4b: 'Κ', 0x4c: 'Λ', 0x4d: 'Μ', 0x4e: 'Ν', 0x4f: 'Ο',
  0x50: 'Π', 0x51: 'Θ', 0x52: 'Ρ', 0x53: 'Σ', 0x54: 'Τ', 0x55: 'Υ', 0x56: 'ς', 0x57: 'Ω', 0x58: 'Ξ', 0x59: 'Ψ', 0x5a: 'Ζ', 0x5b: '[', 0x5c: '∴', 0x5d: ']', 0x5e: '⊥', 0x5f: '_',
  0x61: 'α', 0x62: 'β', 0x63: 'χ', 0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ', 0x68: 'η', 0x69: 'ι', 0x6a: 'ϕ', 0x6b: 'κ', 0x6c: 'λ', 0x6d: 'μ', 0x6e: 'ν', 0x6f: 'ο',
  0x70: 'π', 0x71: 'θ', 0x72: 'ρ', 0x73: 'σ', 0x74: 'τ', 0x75: 'υ', 0x76: 'ϖ', 0x77: 'ω', 0x78: 'ξ', 0x79: 'ψ', 0x7a: 'ζ', 0x7b: '{', 0x7c: '|', 0x7d: '}', 0x7e: '∼',
  0xa1: 'ϒ', 0xa2: '′', 0xa3: '≤', 0xa4: '⁄', 0xa5: '∞', 0xa6: 'ƒ', 0xa7: '♣', 0xa8: '♦', 0xa9: '♥', 0xaa: '♠', 0xab: '↔', 0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓',
  0xb0: '°', 0xb1: '±', 0xb2: '″', 0xb3: '≥', 0xb4: '×', 0xb5: '∝', 0xb6: '∂', 0xb7: '•', 0xb8: '÷', 0xb9: '≠', 0xba: '≡', 0xbb: '≈', 0xbc: '…',
  0xc0: 'ℵ', 0xc1: 'ℑ', 0xc2: 'ℜ', 0xc3: '℘', 0xc4: '⊗', 0xc5: '⊕', 0xc6: '∅', 0xc7: '∩', 0xc8: '∪', 0xc9: '⊃', 0xca: '⊇', 0xcb: '⊄', 0xcc: '⊂', 0xcd: '⊆', 0xce: '∈', 0xcf: '∉',
  0xd0: '∠', 0xd1: '∇', 0xd5: '∏', 0xd6: '√', 0xd7: '⋅', 0xd8: '¬', 0xd9: '∧', 0xda: '∨', 0xdb: '⇔', 0xdc: '⇐', 0xdd: '⇑', 0xde: '⇒', 0xdf: '⇓',
  0xe0: '◊', 0xe1: '⟨', 0xe5: '∑', 0xf1: '⟩', 0xf2: '∫',
};
const WINGDINGS: Record<number, string> = { 0x6c: '●', 0x6e: '■', 0x6f: '□', 0x71: '❑', 0x75: '◆', 0x76: '❖', 0x77: '⬥', 0x9f: '•', 0xa7: '▪', 0xa8: '◻', 0xd8: '➢', 0xe0: '→', 0xe8: '➔', 0xef: '⇦', 0xf0: '⇨', 0xfb: '✗', 0xfc: '✓', 0xfd: '☒', 0xfe: '☑' };

/**
 * A character Word draws from a symbol font (w:sym, or text in a symbol
 * font) as the Unicode character it looks like — null when it is not known,
 * so the caller can say a symbol was not read rather than print a code.
 */
export function symbolChar(font: string, code: string | number): string | null {
  const n0 = typeof code === 'number' ? code : parseInt(code, 16);
  if (!Number.isFinite(n0)) return null;
  const n = n0 >= 0xf000 && n0 <= 0xf0ff ? n0 - 0xf000 : n0;
  if (/symbol/i.test(font)) return SYMBOL[n] ?? null;
  if (/wingdings|webdings/i.test(font)) return WINGDINGS[n] ?? null;
  if (n0 >= 0xe000 && n0 <= 0xf8ff) return null;
  return n0 > 0 ? String.fromCodePoint(n0) : null;
}

// ── numbers and dates as spreadsheets store them ────────────────────

/** Whether a number format shows a date or a time (literals, colours and locales set aside). */
export function isDateFormat(code: string | undefined): boolean {
  if (!code) return false;
  const c = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[(?:\$|color|red|blue|green|black|white|yellow|magenta|cyan)[^\]]*\]/gi, '');
  return /[dmyhs]/i.test(c.replace(/General/gi, '')) && !/^[\s#0.,%E+\-()]*$/i.test(c);
}

/**
 * A spreadsheet serial date as ISO — 2023-01-01, 2023-01, 2023 or 14:30, as
 * fine as the format shows. The 1900 system counts a 29 February 1900 that
 * never was; that is corrected for.
 */
export function serialToISO(n: number, code = 'yyyy-mm-dd', date1904 = false): string {
  if (!Number.isFinite(n)) return String(n);
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
  const hasDay = /d/i.test(c);
  const hasYear = /y/i.test(c);
  const hasHour = /h/i.test(c);
  const hasSec = /s/i.test(c);
  const hasMonth = /m/i.test(c) && (hasDay || hasYear || !(hasHour || hasSec));
  const days = Math.floor(n);
  const frac = n - days;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const d = new Date(base + (date1904 ? days : days >= 60 ? days - 1 : days) * 86_400_000 + Math.round(frac * 86_400) * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  const date = hasDay || (!hasYear && !hasMonth && !hasHour) ? `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` : hasMonth ? `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}` : hasYear ? String(d.getUTCFullYear()) : '';
  const time = hasHour || (frac > 0 && !hasYear && !hasMonth) ? `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${hasSec ? `:${p(d.getUTCSeconds())}` : ''}` : '';
  return [date, time].filter(Boolean).join(' ') || `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** A stored number as a spreadsheet shows it at full precision: 15 significant digits, no float noise. */
export function plainNumber(v: string): string {
  const n = Number(v);
  if (!v.trim() || !Number.isFinite(n)) return v.trim();
  return String(Number(n.toPrecision(15)));
}

/**
 * A value as the file shows it, as far as that can be said without guessing:
 * dates as ISO dates, percentages as percentages, everything else as the
 * number stored (to 15 significant digits). Thousands separators, currency
 * symbols and rounding are presentation, and the stored number is kept.
 */
export function shownValue(v: string, code?: string, date1904 = false): string {
  const t = v.trim();
  if (!code || /^general$/i.test(code) || !/^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(t)) return /^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(t) ? plainNumber(t) : t;
  if (isDateFormat(code)) return serialToISO(Number(t), code, date1904);
  if (/%/.test(code.replace(/"[^"]*"/g, ''))) return `${String(Number((Number(t) * 100).toPrecision(12)))}%`;
  // a currency the format writes beside the number is the number's unit, and is kept
  const cur = currencyOf(code);
  if (cur) {
    const n = plainNumber(t);
    const neg = n.startsWith('-');
    const abs = neg ? n.slice(1) : n;
    return cur.before ? `${neg ? '-' : ''}${cur.symbol}${abs}` : `${n} ${cur.symbol}`;
  }
  return plainNumber(t);
}

/** The currency a number format writes, and on which side: "$"#,##0.00, [$€-407]#,##0, #,##0 "kr", _($* #,##0_). */
function currencyOf(code: string): { symbol: string; before: boolean } | null {
  const first = code.split(';')[0];
  const bracket = /\[\$([^\]-]+)(?:-[0-9A-Fa-f]+)?\]/.exec(first);
  const quoted = /"([$€£¥₹]|[A-Z]{3}|kr|zł|R\$|Fr\.?)"/.exec(first);
  const bare = /(?<!["\\])([$€£¥₹])/.exec(first.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, ''));
  const hit = bracket ?? quoted ?? bare;
  if (!hit) return null;
  const symbol = hit[1].trim();
  if (!symbol) return null;
  const digit = first.search(/[0#?]/);
  return { symbol, before: digit < 0 || hit.index < digit };
}

// ── charts ──────────────────────────────────────────────────────────

const PLOTS: Record<string, ChartKind> = {
  'c:barChart': 'bar',
  'c:bar3DChart': 'bar',
  'c:lineChart': 'line',
  'c:line3DChart': 'line',
  'c:stockChart': 'stock',
  'c:areaChart': 'area',
  'c:area3DChart': 'area',
  'c:pieChart': 'pie',
  'c:pie3DChart': 'pie',
  'c:ofPieChart': 'pie',
  'c:doughnutChart': 'doughnut',
  'c:scatterChart': 'scatter',
  'c:bubbleChart': 'bubble',
  'c:radarChart': 'radar',
  'c:surfaceChart': 'surface',
  'c:surface3DChart': 'surface',
};

export interface ChartData {
  kind: ChartKind;
  title?: string;
  /** axis titles not written into the table's heading row */
  axes: string[];
  /** header row + one row per category (or per point) */
  rows: string[][];
  head: number;
  series: number;
  /** the file held no cached values for the chart: only its picture could be read */
  empty: boolean;
}

/** The points of a cache (c:strCache, c:numCache, c:strLit, c:numLit) by index, as shown. */
function cachePoints(cache: XNode | undefined, date1904: boolean): { n: number; at: Map<number, string> } {
  const at = new Map<number, string>();
  if (!cache) return { n: 0, at };
  const code = textOf(kid(cache, 'c:formatCode')).trim() || undefined;
  const numeric = cache.name === 'c:numCache' || cache.name === 'c:numLit';
  for (const pt of kids(cache, 'c:pt')) {
    const idx = Number(attr(pt, 'idx'));
    if (!Number.isInteger(idx) || idx < 0 || idx > 100_000) continue;
    const v = textOf(kid(pt, 'c:v'));
    at.set(idx, numeric ? shownValue(v, attr(pt, 'formatCode') ?? code, date1904) : v.replace(/\s+/g, ' ').trim());
  }
  const n = Number(attr(kid(cache, 'c:ptCount'), 'val'));
  return { n: Number.isInteger(n) && n >= 0 ? Math.min(n, 100_000) : at.size ? Math.max(...at.keys()) + 1 : 0, at };
}

/** A data reference's points: a cache inside a reference, a literal, or a multi-level category. */
function refPoints(ref: XNode | undefined, date1904: boolean): { n: number; at: Map<number, string> } {
  if (!ref) return { n: 0, at: new Map() };
  for (const r of kids(ref)) {
    if (r.name === 'c:strRef') return cachePoints(kid(r, 'c:strCache'), date1904);
    if (r.name === 'c:numRef') return cachePoints(kid(r, 'c:numCache'), date1904);
    if (r.name === 'c:strLit' || r.name === 'c:numLit') return cachePoints(r, date1904);
    if (r.name === 'c:multiLvlStrRef') {
      // levels run innermost first; an outer label is written once, where the file puts it
      const levels = kids(kid(r, 'c:multiLvlStrCache'), 'c:lvl').map((l) => cachePoints(l, date1904));
      const n = Number(attr(kid(kid(r, 'c:multiLvlStrCache'), 'c:ptCount'), 'val')) || Math.max(0, ...levels.map((l) => l.n));
      const at = new Map<number, string>();
      for (let i = 0; i < n; i++) {
        const label = [...levels]
          .reverse()
          .map((l) => l.at.get(i))
          .filter((x): x is string => !!x)
          .join(' ');
        if (label) at.set(i, label);
      }
      return { n, at };
    }
  }
  return { n: 0, at: new Map() };
}

/** A title element's words (c:title > c:tx > c:rich, or a reference). */
function titleOf(t: XNode | undefined): string {
  if (!t) return '';
  const tx = kid(t, 'c:tx');
  if (!tx) return '';
  const rich = kid(tx, 'c:rich');
  if (rich) return drawingText(rich).replace(/\s*\n\s*/g, ' ').trim();
  const pts = refPoints(tx, false);
  return [...pts.at.values()].join(' ').trim();
}

/** A series' name, as the file gives it — '' when it gives none (never "Series 1"). */
function seriesName(ser: XNode): string {
  const tx = kid(ser, 'c:tx');
  if (!tx) return '';
  const v = kid(tx, 'c:v');
  if (v) return textOf(v).trim();
  return [...refPoints(tx, false).at.values()].join(' ').trim();
}

/** A chart part (word/charts/chart1.xml, ppt/charts/chart2.xml…) into its kind, title and a table of its values. */
export function readChart(xml: string, date1904?: boolean): ChartData | null {
  const root = parseXml(xml);
  if (first(root, 'cx:chartSpace')) return readChartEx(root);
  if (date1904 === undefined) date1904 = /^(1|true)$/.test(attr(first(root, 'c:date1904'), 'val') ?? '');
  const chart = first(root, 'c:chart');
  if (!chart) return null;
  const plotArea = kid(chart, 'c:plotArea');
  const plots = kids(plotArea).filter((p) => PLOTS[p.name]);
  if (!plots.length) return null;
  const kinds = new Set(
    plots.map((p) => {
      const k = PLOTS[p.name];
      return k === 'bar' && attr(kid(p, 'c:barDir'), 'val') === 'col' ? 'column' : k;
    })
  );
  const kind: ChartKind = kinds.size > 1 ? 'combo' : [...kinds][0];
  const title = titleOf(kid(chart, 'c:title')) || undefined;
  const sers = plots.flatMap((p) => kids(p, 'c:ser').map((s) => ({ s, xy: p.name === 'c:scatterChart' || p.name === 'c:bubbleChart' })));
  sers.sort((a, b) => (Number(attr(kid(a.s, 'c:order'), 'val')) || 0) - (Number(attr(kid(b.s, 'c:order'), 'val')) || 0));
  const axes = kids(plotArea).filter((a) => /^c:(catAx|dateAx|valAx|serAx)$/.test(a.name));
  const catAxis = axes.find((a) => a.name === 'c:catAx' || a.name === 'c:dateAx');
  const xAxis = axes.find((a) => a.name === 'c:valAx' && /^(b|t)$/.test(attr(kid(a, 'c:axPos'), 'val') ?? ''));
  const yAxis = axes.find((a) => a.name === 'c:valAx' && /^(l|r)$/.test(attr(kid(a, 'c:axPos'), 'val') ?? ''));

  const series = sers.map(({ s, xy }) => ({
    name: seriesName(s),
    xy,
    cats: refPoints(kid(s, xy ? 'c:xVal' : 'c:cat'), date1904),
    vals: refPoints(kid(s, xy ? 'c:yVal' : 'c:val'), date1904),
    size: refPoints(kid(s, 'c:bubbleSize'), date1904),
  }));
  const empty = series.every((s) => !s.vals.at.size && !s.cats.at.size);
  const allAxes = axes.map((a) => titleOf(kid(a, 'c:title'))).filter(Boolean);
  const rest = (used: string[]) => {
    const left = [...allAxes];
    for (const u of used) {
      const i = left.indexOf(u);
      if (i >= 0) left.splice(i, 1);
    }
    return left;
  };
  if (!series.length) return { kind, ...(title ? { title } : {}), axes: allAxes, rows: [], head: 0, series: 0, empty: true };

  const allXY = series.every((s) => s.xy);
  const same = (a: Map<number, string>, b: Map<number, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  let rows: string[][];
  let used: string[] = [];
  if (allXY && !series.every((s) => same(s.cats.at, series[0].cats.at))) {
    // points of different series at different x: one row per point
    const hasSize = series.some((s) => s.size.at.size);
    rows = [['', titleOf(kid(xAxis, 'c:title')), titleOf(kid(yAxis, 'c:title')), ...(hasSize ? [''] : [])]];
    used = [rows[0][1], rows[0][2]];
    for (const s of series) {
      const n = Math.max(s.cats.n, s.vals.n);
      for (let i = 0; i < n; i++) rows.push([s.name, s.cats.at.get(i) ?? '', s.vals.at.get(i) ?? '', ...(hasSize ? [s.size.at.get(i) ?? ''] : [])]);
    }
  } else {
    const cats = series.find((s) => s.cats.at.size)?.cats ?? { n: 0, at: new Map<number, string>() };
    const n = Math.max(cats.n, ...series.map((s) => s.vals.n));
    const axisTitle = allXY ? titleOf(kid(xAxis, 'c:title')) : titleOf(kid(catAxis, 'c:title'));
    rows = [[axisTitle, ...series.map((s) => s.name)]];
    used = [axisTitle];
    for (let i = 0; i < n; i++) rows.push([cats.at.get(i) ?? '', ...series.map((s) => s.vals.at.get(i) ?? '')]);
  }
  return { kind, ...(title ? { title } : {}), axes: rest(used.filter(Boolean)), rows, head: 1, series: series.length, empty };
}

/** The newer chart format (waterfall, histogram, treemap, funnel…): data by id, series pointing at it. */
function readChartEx(root: XNode): ChartData | null {
  const data = new Map<string, { cats: Map<number, string>; vals: Map<number, string>; n: number }>();
  for (const d of find(root, 'cx:data')) {
    const id = attr(d, 'id') ?? String(data.size);
    const dims = kids(d).filter((x) => x.name === 'cx:strDim' || x.name === 'cx:numDim');
    const read = (dim: XNode | undefined) => {
      const at = new Map<number, string>();
      const lvl = kid(dim, 'cx:lvl');
      const code = attr(lvl, 'formatCode');
      for (const pt of kids(lvl, 'cx:pt')) {
        const idx = Number(attr(pt, 'idx'));
        if (Number.isInteger(idx) && idx >= 0) at.set(idx, dim?.name === 'cx:numDim' ? shownValue(textOf(pt), code) : textOf(pt).trim());
      }
      return { at, n: Number(attr(lvl, 'ptCount')) || (at.size ? Math.max(...at.keys()) + 1 : 0) };
    };
    const cat = read(dims.find((x) => x.name === 'cx:strDim') ?? dims.find((x) => attr(x, 'type') === 'cat'));
    const val = read(dims.find((x) => x.name === 'cx:numDim'));
    data.set(id, { cats: cat.at, vals: val.at, n: Math.max(cat.n, val.n) });
  }
  const series = find(root, 'cx:series').map((s) => ({
    name: textOf(first(kid(s, 'cx:tx'), 'cx:v')).trim(),
    layout: attr(s, 'layoutId') ?? '',
    data: data.get(attr(kid(s, 'cx:dataId'), 'val') ?? '') ?? [...data.values()][0],
  }));
  if (!series.length) return null;
  const layout = series[0].layout;
  const kind: ChartKind = /waterfall|funnel/i.test(layout) ? 'bar' : /clusteredColumn/i.test(layout) ? 'column' : 'other';
  const title = drawingText(first(first(root, 'cx:title'), 'cx:rich')).replace(/\s*\n\s*/g, ' ').trim() || textOf(first(first(root, 'cx:title'), 'cx:v')).trim() || undefined;
  const cats = series.find((s) => s.data?.cats.size)?.data?.cats ?? new Map<number, string>();
  const n = Math.max(0, ...series.map((s) => s.data?.n ?? 0));
  const rows = [['', ...series.map((s) => s.name)]];
  for (let i = 0; i < n; i++) rows.push([cats.get(i) ?? '', ...series.map((s) => s.data?.vals.get(i) ?? '')]);
  return { kind, ...(title ? { title } : {}), axes: [], rows, head: 1, series: series.length, empty: n === 0 };
}

/**
 * Every value a chart part holds — its title, axis titles, series names,
 * categories and values — as plain text, read straight from the XML. The
 * check compares this with the table read from the chart.
 */
export function chartRawText(xml: string, date1904?: boolean): string {
  const root = parseXml(xml);
  if (date1904 === undefined) date1904 = /^(1|true)$/.test(attr(first(root, 'c:date1904'), 'val') ?? '');
  const out: string[] = [];
  if (first(root, 'cx:chartSpace')) {
    for (const s of find(root, 'cx:series')) out.push(textOf(first(kid(s, 'cx:tx'), 'cx:v')));
    for (const dim of [...find(root, 'cx:strDim'), ...find(root, 'cx:numDim')]) {
      const lvl = kid(dim, 'cx:lvl');
      for (const pt of kids(lvl, 'cx:pt')) out.push(dim.name === 'cx:numDim' ? shownValue(textOf(pt), attr(lvl, 'formatCode')) : textOf(pt).trim());
    }
    const t = first(root, 'cx:title');
    out.push(drawingText(first(t, 'cx:rich')).replace(/\s*\n\s*/g, ' ') || textOf(first(t, 'cx:v')));
    return out.join('\n');
  }
  const chart = first(root, 'c:chart');
  out.push(titleOf(kid(chart, 'c:title')));
  for (const ax of kids(kid(chart, 'c:plotArea')).filter((a) => /Ax$/.test(a.name))) out.push(titleOf(kid(ax, 'c:title')));
  for (const ser of find(chart, 'c:ser')) {
    for (const cache of [...find(ser, 'c:strCache'), ...find(ser, 'c:numCache'), ...find(ser, 'c:strLit'), ...find(ser, 'c:numLit'), ...find(ser, 'c:lvl')]) {
      for (const v of cachePoints(cache, date1904).at.values()) out.push(v);
    }
    const v = kid(kid(ser, 'c:tx'), 'c:v');
    if (v) out.push(textOf(v));
  }
  return out.join('\n');
}

// ── SmartArt ────────────────────────────────────────────────────────

/** A SmartArt data part (word/diagrams/data1.xml) into its words, as an outline in the diagram's order. */
export function readDiagram(xml: string): { text: string; level: number }[] {
  const root = parseXml(xml);
  const pts = new Map<string, { type: string; text: string }>();
  for (const pt of find(root, 'dgm:pt')) {
    const id = attr(pt, 'modelId');
    if (!id) continue;
    pts.set(id, { type: attr(pt, 'type') ?? 'node', text: drawingText(kid(pt, 'dgm:t')).replace(/\s*\n\s*/g, ' ').trim() });
  }
  const children = new Map<string, { id: string; ord: number }[]>();
  for (const c of find(root, 'dgm:cxn')) {
    const type = attr(c, 'type') ?? 'parOf';
    if (type !== 'parOf') continue;
    const src = attr(c, 'srcId');
    const dest = attr(c, 'destId');
    if (!src || !dest) continue;
    children.set(src, [...(children.get(src) ?? []), { id: dest, ord: Number(attr(c, 'srcOrd')) || 0 }]);
  }
  const out: { text: string; level: number }[] = [];
  const seen = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (seen.has(id) || depth > 12) return;
    seen.add(id);
    const p = pts.get(id);
    if (p && (p.type === 'node' || p.type === 'asst') && p.text) out.push({ text: p.text, level: Math.min(4, Math.max(1, depth)) });
    for (const c of (children.get(id) ?? []).sort((a, b) => a.ord - b.ord)) visit(c.id, depth + 1);
  };
  for (const [id, p] of pts) if (p.type === 'doc') visit(id, 0);
  // anything the connections did not reach is still read, at the top level
  for (const [id, p] of pts) if (!seen.has(id) && (p.type === 'node' || p.type === 'asst') && p.text) out.push({ text: p.text, level: 1 });
  return out;
}

/** Every word a SmartArt data part holds, read straight from the XML, for the check. */
export function diagramRawText(xml: string): string {
  return find(parseXml(xml), 'dgm:pt')
    .filter((pt) => /^(node|asst)$/.test(attr(pt, 'type') ?? 'node'))
    .map((pt) => drawingText(kid(pt, 'dgm:t')))
    .join('\n');
}

// ── tables ──────────────────────────────────────────────────────────

const isNumberCell = (c: string) => {
  const t = c.trim();
  return !!t && numbersIn(t).length >= 1 && t.replace(/[\d.,%()\-−–+$€£¥₹\s]/g, '').length <= 3;
};

/**
 * How many leading rows of a table are headings, when the file does not say:
 * a first row of words over rows holding numbers; a bold first row; or, in a
 * table of words, a first row of short labels.
 */
export function guessHead(rows: string[][], boldFirst = false, boldSecond = false): number {
  if (rows.length < 2) return 0;
  const numericRow = (r: string[]) => r.some(isNumberCell);
  const body = rows.slice(1);
  const first = rows[0];
  const firstWords = first.every((c) => !isNumberCell(c) || /^(19|20)\d\d$/.test(c.trim()));
  if (boldFirst) return boldSecond && rows.length > 3 && !numericRow(rows[1]) ? 2 : 1;
  if (firstWords && body.some(numericRow)) {
    // a second row of labels under spanning group labels
    if (rows.length > 3 && first.some((c) => !c.trim()) && !numericRow(rows[1]) && rows.slice(2).some(numericRow)) return 2;
    return 1;
  }
  if (rows.length >= 3 && first.every((c) => c.trim() && c.trim().split(/\s+/).length <= 5) && !body.some(numericRow)) return 1;
  return 0;
}

/** Whether a "table" is a page layout rather than data: one column, or cells of whole paragraphs. */
export function isLayoutTable(rows: string[][]): boolean {
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width <= 1) return true;
  const cells = rows.flat().filter((c) => c.trim());
  if (!cells.length) return true;
  const avg = cells.reduce((n, c) => n + c.length, 0) / cells.length;
  if (rows.length === 1 && cells.some((c) => c.length > 160)) return true;
  return avg > 260;
}
