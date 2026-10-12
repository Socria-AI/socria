// lib/docs/pdf-layout.ts — a PDF page's text, put back in the order a person reads it.
//
// A PDF does not hold paragraphs. It holds glyphs drawn at positions, in
// whatever order the program that wrote it chose: a two-column paper may draw
// the right column first, a table cell by cell, a heading after the text under
// it, a bold word twice a hair apart. Joining the text in drawing order — what
// Socria did before — interleaves columns, scrambles tables and doubles bold
// headings. This rebuilds the page from geometry instead:
//
//   1. items      overprinted duplicates (fake bold) removed; ligatures folded
//   2. lines      items on one baseline joined, superscripts and subscripts
//                 kept with their line (x² stays x², H₂O stays H₂O)
//   3. segments   a line split wherever a gap is too wide to be a space — a
//                 column gutter or a table's column
//   4. tables     runs of lines whose short segments align on shared columns
//   5. order      recursive XY-cut over everything else: a page is cut at its
//                 widest whitespace — across for bands, down for columns — so
//                 a full-width title, then two columns, then a full-width
//                 table read in that order, each column top to bottom
//   6. blocks     lines joined into paragraphs at gaps, indents, font changes
//                 and list markers; words broken across lines rejoined
//   7. kinds      title, heading (by size and weight), caption, footnote,
//                 list, equation (by mathematical characters and fonts),
//                 code (monospace); headers and footers are decided across
//                 pages, in lib/docs/pdf.ts
//
// Nothing is invented and nothing is dropped: every character the page holds
// ends up in exactly one block (lib/docs/checks.ts verifies it), and what
// could not be decoded is flagged where it is, not silently cleaned.
//
// PURE — geometry in, blocks out. The PDF itself is opened in lib/docs/pdf.ts.

import { CAPTION, LIST_MARK, MATH_CHARS, PAGE_NUM, plain, toScript, undecodable, wordsIn } from './text';
import type { BlockFlag, BlockKind, Box } from './types';

/** One run of text as the PDF draws it. PDF coordinates: origin bottom left, y the baseline. */
export interface PdfItem {
  s: string;
  x: number;
  y: number;
  /** advance width in points */
  w: number;
  size: number;
  bold?: boolean;
  italic?: boolean;
  /** a monospace font */
  mono?: boolean;
  /** a mathematical font (Symbol, Computer Modern math, STIX, Cambria Math…) */
  math?: boolean;
}

/** An image drawn on the page, as a rectangle in PDF coordinates. */
export interface PdfImage {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfPageIn {
  n: number;
  w: number;
  h: number;
  items: PdfItem[];
  images: PdfImage[];
}

/** A block of the page, before ids are given (lib/docs/pdf.ts numbers them across the document). */
export interface LaidBlock {
  kind: BlockKind;
  text: string;
  level?: number;
  box: Box;
  /** the dominant font size, for ranking headings across the document */
  size: number;
  bold: boolean;
  /** the table this is, when kind is 'table' — an index into the page's tables */
  table?: number;
  /** the figure this is, when kind is 'figure' — an index into the page's figures */
  figure?: number;
  flags?: BlockFlag[];
  /** in the page's top or bottom band — a header or footer candidate, decided across pages */
  band?: 'top' | 'bottom';
}

export interface LaidTable {
  rows: string[][];
  head: number;
  box: Box;
}

export interface LaidFigure {
  box: Box;
}

export interface LaidPage {
  n: number;
  w: number;
  h: number;
  blocks: LaidBlock[];
  tables: LaidTable[];
  figures: LaidFigure[];
  /** characters of text read */
  chars: number;
  /** how many items were drawn twice and kept once */
  overprints: number;
  /** text that is not horizontal (rotated), left out of the flow and counted */
  rotated: number;
  /** most of the page is an image and there is little or no text: a scan */
  scanned: boolean;
  /** the share of characters that could not be decoded */
  garbled: number;
  /** the body font size on this page, by characters */
  bodySize: number;
}

// ── items ───────────────────────────────────────────────────────────

interface Item extends PdfItem {
  /** top-left coordinates */
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  base: number;
}

const LIGATURES: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
const fold = (s: string) => s.replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c).replace(/­/g, '­');

function itemsOf(page: PdfPageIn): { items: Item[]; overprints: number } {
  const raw: Item[] = [];
  for (const it of page.items) {
    if (!it || typeof it.s !== 'string') continue;
    const s = fold(it.s);
    if (!s.trim()) continue;
    const size = it.size > 0 ? it.size : 10;
    const base = page.h - it.y;
    raw.push({ ...it, s, size, x0: it.x, x1: it.x + Math.max(it.w, size * 0.3 * s.length * 0.5), top: base - size * 0.78, bottom: base + size * 0.22, base });
  }
  // the same text drawn twice a hair apart is fake bold: one copy, made bold
  raw.sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const kept: Item[] = [];
  const byText = new Map<string, Item[]>();
  let overprints = 0;
  for (const it of raw) {
    const same = byText.get(it.s) ?? [];
    const twin = same.find((k) => Math.abs(k.x0 - it.x0) < Math.max(1.6, it.size * 0.25) && Math.abs(k.base - it.base) < Math.max(1.2, it.size * 0.2));
    if (twin) {
      twin.bold = true;
      overprints++;
      continue;
    }
    kept.push(it);
    same.push(it);
    byText.set(it.s, same);
  }
  return { items: kept, overprints };
}

// ── lines and segments ──────────────────────────────────────────────

interface Seg {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  base: number;
  size: number;
  bold: boolean;
  italic: boolean;
  mono: boolean;
  /** share of characters in a mathematical font */
  mathShare: number;
  chars: number;
  /** the line this segment came from */
  line: number;
}

/** Items into lines: one baseline each, with raised and lowered small text kept on its line. */
function linesOf(items: Item[]): Item[][] {
  const byBase = [...items].sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const lines: { base: number; size: number; items: Item[] }[] = [];
  for (const it of byBase) {
    const line = lines.find((l) => Math.abs(l.base - it.base) <= Math.min(l.size, it.size) * 0.38 && Math.abs(l.size - it.size) <= Math.max(l.size, it.size) * 0.35);
    if (line) line.items.push(it);
    else lines.push({ base: it.base, size: it.size, items: [it] });
  }
  // small text sitting raised or lowered beside a line belongs to it (exponents, indices, footnote marks)
  const main = lines.filter((l) => l.items.length);
  for (const l of [...main]) {
    const small = l.items.every((i) => i.s.length <= 4);
    if (!small) continue;
    const host = main.find(
      (h) =>
        h !== l &&
        h.size > l.size * 1.15 &&
        Math.abs(h.base - l.base) <= h.size * 0.62 &&
        l.items.every((i) => h.items.some((j) => i.x0 <= j.x1 + h.size * 0.6 && i.x1 >= j.x0 - h.size * 0.6))
    );
    if (!host) continue;
    for (const i of l.items) {
      const raised = i.base < host.base - host.size * 0.12;
      const lowered = i.base > host.base + host.size * 0.08;
      const mapped = raised ? toScript(i.s, 'sup') : lowered ? toScript(i.s, 'sub') : null;
      host.items.push({ ...i, s: mapped ?? i.s, base: host.base, top: host.base - host.size * 0.78, bottom: host.base + host.size * 0.22, size: host.size, x0: i.x0, x1: i.x1 });
    }
    l.items = [];
  }
  return main.filter((l) => l.items.length).map((l) => l.items.sort((a, b) => a.x0 - b.x0));
}

/** A line into segments: split wherever a gap is too wide to be a space between words. */
function segmentsOf(lines: Item[][]): Seg[] {
  const out: Seg[] = [];
  lines.forEach((line, li) => {
    let cur: Item[] = [];
    const flush = () => {
      if (!cur.length) return;
      let text = '';
      let prev: Item | null = null;
      let mathChars = 0;
      let chars = 0;
      for (const it of cur) {
        if (prev) {
          const gap = it.x0 - prev.x1;
          const needSpace = gap > Math.min(prev.size, it.size) * 0.14 && !/\s$/.test(text) && !/^\s/.test(it.s);
          text += needSpace ? ' ' : '';
        }
        text += it.s;
        const n = it.s.replace(/\s/g, '').length;
        chars += n;
        if (it.math) mathChars += n;
        prev = it;
      }
      const size = dominant(cur.map((i) => [i.size, i.s.length]));
      out.push({
        text: text.replace(/\s+/g, ' ').trim(),
        x0: Math.min(...cur.map((i) => i.x0)),
        x1: Math.max(...cur.map((i) => i.x1)),
        top: Math.min(...cur.map((i) => i.top)),
        bottom: Math.max(...cur.map((i) => i.bottom)),
        base: cur[0].base,
        size,
        bold: share(cur, (i) => !!i.bold) > 0.5,
        italic: share(cur, (i) => !!i.italic) > 0.5,
        mono: share(cur, (i) => !!i.mono) > 0.6,
        mathShare: chars ? mathChars / chars : 0,
        chars,
        line: li,
      });
      cur = [];
    };
    for (const it of line) {
      const last = cur[cur.length - 1];
      // a gap wider than about a space and a half of the type is a gutter or a column
      if (last && it.x0 - last.x1 > Math.max(last.size, it.size) * 1.1) flush();
      cur.push(it);
    }
    flush();
  });
  return out.filter((s) => s.text);
}

function share<T>(xs: T[], f: (x: T) => boolean): number {
  let w = 0;
  let t = 0;
  for (const x of xs) {
    const n = (x as unknown as Item).s?.length ?? 1;
    t += n;
    if (f(x)) w += n;
  }
  return t ? w / t : 0;
}

/** The value carrying the most weight: [value, weight] pairs. */
function dominant(pairs: [number, number][]): number {
  const m = new Map<number, number>();
  for (const [v, w] of pairs) {
    const k = Math.round(v * 2) / 2;
    m.set(k, (m.get(k) ?? 0) + w);
  }
  let best = pairs[0]?.[0] ?? 10;
  let bw = -1;
  for (const [k, w] of m) if (w > bw || (w === bw && k < best)) [best, bw] = [k, w];
  return best;
}

// ── tables ──────────────────────────────────────────────────────────

const NUMERIC = /^[(\-−–+]?[$€£¥₹]?\s?\d[\d,]*(?:\.\d+)?\s?(?:%|[a-zA-Z°µ]{1,4})?\)?$|^[-–—]$|^n\/?a$/i;
const isNumeric = (s: string) => NUMERIC.test(s.trim());

interface TableRun {
  segs: Seg[];
  lines: number[];
}

/**
 * Runs of lines that are rows of a table: two or more short segments on a
 * line, aligned with the lines around them on shared columns. Two columns of
 * prose also give two segments a line — but long ones, and that is the test:
 * a table's cells are short, or numeric.
 */
function findTables(segs: Seg[], bodySize: number): TableRun[] {
  const byLine = new Map<number, Seg[]>();
  for (const s of segs) byLine.set(s.line, [...(byLine.get(s.line) ?? []), s]);
  const lines = [...byLine.entries()].map(([line, ss]) => ({ line, segs: ss.sort((a, b) => a.x0 - b.x0), top: Math.min(...ss.map((s) => s.top)), bottom: Math.max(...ss.map((s) => s.bottom)) })).sort((a, b) => a.top - b.top);
  const rowish = (l: (typeof lines)[number]) => {
    if (l.segs.length < 2) return false;
    const words = l.segs.map((s) => wordsIn(s.text));
    const numeric = l.segs.filter((s) => isNumeric(s.text)).length;
    const avg = words.reduce((a, b) => a + b, 0) / words.length;
    // prose columns: long segments; a table row: short cells, or at least one number among few words
    return (l.segs.length >= 3 && avg <= 6) || (numeric >= 1 && avg <= 5) || (l.segs.length >= 2 && avg <= 3 && Math.max(...words) <= 5);
  };
  const aligned = (a: Seg[], b: Seg[]) => {
    // the rows share column anchors: most of one row's cells sit over the other's
    let hits = 0;
    for (const s of a) if (b.some((t) => overlap1(s.x0, s.x1, t.x0, t.x1) > 0 || Math.abs(s.x0 - t.x0) < bodySize * 0.8 || Math.abs(s.x1 - t.x1) < bodySize * 0.8)) hits++;
    return hits >= Math.min(a.length, b.length) * 0.75;
  };
  const runs: TableRun[] = [];
  let cur: (typeof lines)[number][] = [];
  const close = () => {
    if (cur.length >= 3 || (cur.length === 2 && cur.every((l) => l.segs.length >= 3))) {
      runs.push({ segs: cur.flatMap((l) => l.segs), lines: cur.map((l) => l.line) });
    }
    cur = [];
  };
  for (const l of lines) {
    const last = cur[cur.length - 1];
    if (rowish(l) && (!last || (l.top - last.bottom < bodySize * 2.2 && aligned(last.segs, l.segs)))) cur.push(l);
    else if (rowish(l)) {
      close();
      cur.push(l);
    } else {
      // a one-segment line under a row whose text sits in one column: a wrapped cell, kept with the table
      if (last && l.segs.length === 1 && cur.length >= 2 && l.top - last.bottom < bodySize * 0.9 && wordsIn(l.segs[0].text) <= 8) {
        const s = l.segs[0];
        const col = last.segs.find((t) => overlap1(s.x0, s.x1, t.x0, t.x1) > 0);
        if (col && col !== last.segs[0]) {
          cur.push(l);
          continue;
        }
      }
      close();
    }
  }
  close();
  return runs;
}

const overlap1 = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** A table run into rows and columns: columns are the x-intervals the cells share. */
function buildTable(run: TableRun): { rows: string[][]; head: number; x0: number; x1: number; top: number; bottom: number } {
  const segs = run.segs;
  // columns come from the most detailed rows — a heading spanning two columns must not merge them
  const perLine = new Map<number, number>();
  for (const s of segs) perLine.set(s.line, (perLine.get(s.line) ?? 0) + 1);
  const most = Math.max(...perLine.values());
  const anchors = segs.filter((s) => (perLine.get(s.line) ?? 0) >= Math.max(2, most - (most >= 4 ? 1 : 0)));
  const sorted = [...anchors].sort((a, b) => a.x0 - b.x0);
  const cols: { x0: number; x1: number }[] = [];
  for (const s of sorted) {
    const c = cols.find((k) => overlap1(s.x0, s.x1, k.x0, k.x1) > Math.min(s.x1 - s.x0, k.x1 - k.x0) * 0.2);
    if (c) {
      c.x0 = Math.min(c.x0, s.x0);
      c.x1 = Math.max(c.x1, s.x1);
    } else cols.push({ x0: s.x0, x1: s.x1 });
  }
  // columns that grew into each other become one
  cols.sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < cols.length; i++) {
    if (cols[i].x0 < cols[i - 1].x1) {
      cols[i - 1].x1 = Math.max(cols[i - 1].x1, cols[i].x1);
      cols.splice(i, 1);
      i--;
    }
  }
  const colOf = (s: Seg) => {
    let best = 0;
    let bo = 0;
    cols.forEach((c, i) => {
      const o = overlap1(s.x0, s.x1, c.x0, c.x1);
      if (o > bo) [best, bo] = [i, o];
    });
    if (bo > 0) return best;
    // overlapping no column: the nearest one, by centres
    const mid = (s.x0 + s.x1) / 2;
    let d = Infinity;
    cols.forEach((c, i) => {
      const e = Math.abs((c.x0 + c.x1) / 2 - mid);
      if (e < d) [best, d] = [i, e];
    });
    return best;
  };
  const lineOrder = [...new Set(run.lines)];
  const lineTop = new Map(lineOrder.map((l) => [l, Math.min(...segs.filter((s) => s.line === l).map((s) => s.top))]));
  lineOrder.sort((a, b) => lineTop.get(a)! - lineTop.get(b)!);
  const rows: string[][] = [];
  let prevLine: number | null = null;
  for (const l of lineOrder) {
    const cells = new Array(cols.length).fill('');
    const ls = segs.filter((s) => s.line === l).sort((a, b) => a.x0 - b.x0);
    for (const s of ls) {
      const c = colOf(s);
      cells[c] = cells[c] ? `${cells[c]} ${s.text}` : s.text;
    }
    // a line filling only cells the row above already has, with words not numbers, continues that row
    const filled = cells.filter(Boolean).length;
    const prev = rows[rows.length - 1];
    if (prev && prevLine !== null && filled < Math.max(2, cols.length - 1) && cells.every((c, i) => !c || (prev[i] && !isNumeric(c) && !isNumeric(prev[i])))) {
      cells.forEach((c, i) => {
        if (c) prev[i] = `${prev[i]} ${c}`;
      });
    } else rows.push(cells);
    prevLine = l;
  }
  // header rows: leading rows of words over columns that are numbers below
  let head = 0;
  const body = (from: number) => rows.slice(from);
  const numericCols = cols.map((_, c) => {
    const vals = body(1).map((r) => r[c]).filter(Boolean);
    return vals.length > 0 && vals.filter(isNumeric).length / vals.length >= 0.6;
  });
  if (rows.length >= 2 && numericCols.some(Boolean)) {
    for (let r = 0; r < Math.min(2, rows.length - 1); r++) {
      const looksHead = rows[r].every((cell, c) => !cell || !numericCols[c] || !isNumeric(cell));
      if (looksHead) head = r + 1;
      else break;
    }
  } else if (rows.length >= 2) {
    const firstBold = run.segs.filter((s) => s.line === lineOrder[0]).every((s) => s.bold);
    if (firstBold) head = 1;
  }
  return {
    rows,
    head,
    x0: Math.min(...segs.map((s) => s.x0)),
    x1: Math.max(...segs.map((s) => s.x1)),
    top: Math.min(...segs.map((s) => s.top)),
    bottom: Math.max(...segs.map((s) => s.bottom)),
  };
}

// ── reading order: recursive XY-cut ─────────────────────────────────

interface Rect {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}
type Node<T extends Rect> = T[];

/**
 * Everything on the page in reading order. The page is cut at its widest
 * whitespace: down a gutter when both sides hold tall columns of text, across
 * a band wider than the space between lines otherwise; each part is cut
 * again, until what is left is a single column read top to bottom.
 */
function xyCut<T extends Rect>(rects: T[], size: number, depth = 0): Node<T>[] {
  if (rects.length <= 1 || depth > 24) return [rects];
  const height = Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top));
  // vertical gutters: gaps in the projection of everything onto the x axis
  const gutters = gaps(
    rects.map((r) => [r.x0, r.x1] as [number, number]),
    size * 0.9
  );
  const verticalSplit = (at: number) => {
    const left = rects.filter((r) => (r.x0 + r.x1) / 2 < at);
    const right = rects.filter((r) => (r.x0 + r.x1) / 2 >= at);
    return [left, right] as const;
  };
  const tall = (side: T[]) => {
    if (side.length < 2) return false;
    const h = Math.max(...side.map((r) => r.bottom)) - Math.min(...side.map((r) => r.top));
    return h >= height * 0.45;
  };
  for (const g of gutters.sort((a, b) => b.width - a.width)) {
    const [l, r] = verticalSplit(g.at);
    if (l.length && r.length && tall(l) && tall(r)) return [...xyCut(l, size, depth + 1), ...xyCut(r, size, depth + 1)];
  }
  // horizontal bands: gaps in the projection onto the y axis wider than the space between lines
  const bands = gaps(
    rects.map((r) => [r.top, r.bottom] as [number, number]),
    size * 1.15
  );
  if (bands.length) {
    const cuts = bands.map((b) => b.at).sort((a, b) => a - b);
    const parts: T[][] = [];
    let rest = [...rects];
    for (const c of cuts) {
      parts.push(rest.filter((r) => (r.top + r.bottom) / 2 < c));
      rest = rest.filter((r) => (r.top + r.bottom) / 2 >= c);
    }
    parts.push(rest);
    const nonEmpty = parts.filter((p) => p.length);
    if (nonEmpty.length > 1) return nonEmpty.flatMap((p) => xyCut(p, size, depth + 1));
  }
  // a narrower gutter with content on both sides, even if not tall (side-by-side boxes)
  for (const g of gutters.sort((a, b) => b.width - a.width)) {
    const [l, r] = verticalSplit(g.at);
    if (l.length && r.length && g.width >= size * 1.6) return [...xyCut(l, size, depth + 1), ...xyCut(r, size, depth + 1)];
  }
  return [rects];
}

/** Gaps at least `min` wide between the union of some intervals, with their middles. */
function gaps(intervals: [number, number][], min: number): { at: number; width: number }[] {
  const s = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: { at: number; width: number }[] = [];
  let end = s[0]?.[1] ?? 0;
  for (let i = 1; i < s.length; i++) {
    if (s[i][0] - end >= min) out.push({ at: (s[i][0] + end) / 2, width: s[i][0] - end });
    end = Math.max(end, s[i][1]);
  }
  return out;
}

// ── blocks ──────────────────────────────────────────────────────────

const SENTENCE_END = /[.!?:;”"')\]]$/;
const MONO_HINT = /^(?:\s{2,}|[{}();=<>]|\/\/|#include|def |function |const |let |var |import |return )/;

interface LineGroup {
  segs: Seg[];
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  size: number;
  bold: boolean;
  italic: boolean;
  mono: boolean;
  mathShare: number;
}

function groupLines(segs: Seg[]): LineGroup[] {
  // segments of one leaf on the same baseline form one line (a leaf is one column)
  const sorted = [...segs].sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const lines: Seg[][] = [];
  for (const s of sorted) {
    const l = lines.find((ls) => Math.abs(ls[0].base - s.base) <= s.size * 0.38);
    if (l) l.push(s);
    else lines.push([s]);
  }
  return lines
    .map((ls) => {
      ls.sort((a, b) => a.x0 - b.x0);
      const chars = ls.reduce((n, s) => n + s.chars, 0) || 1;
      return {
        segs: ls,
        text: ls.map((s) => s.text).join(' '),
        x0: Math.min(...ls.map((s) => s.x0)),
        x1: Math.max(...ls.map((s) => s.x1)),
        top: Math.min(...ls.map((s) => s.top)),
        bottom: Math.max(...ls.map((s) => s.bottom)),
        size: dominant(ls.map((s) => [s.size, s.chars])),
        bold: ls.reduce((n, s) => n + (s.bold ? s.chars : 0), 0) / chars > 0.5,
        italic: ls.reduce((n, s) => n + (s.italic ? s.chars : 0), 0) / chars > 0.5,
        mono: ls.every((s) => s.mono),
        mathShare: ls.reduce((n, s) => n + s.mathShare * s.chars, 0) / chars,
      };
    })
    .sort((a, b) => a.top - b.top || a.x0 - b.x0);
}

const mathy = (text: string, mathShare: number) => {
  const t = text.replace(/\s/g, '');
  if (!t) return false;
  const m = (t.match(MATH_CHARS) ?? []).length;
  const words = text.split(/\s+/).filter((w) => /^[A-Za-z]{4,}$/.test(w)).length;
  return (mathShare >= 0.3 || m / t.length >= 0.12 || (/=/.test(t) && m >= 2)) && words <= 6;
};

/** Lines of one column into blocks: paragraphs broken at gaps, indents, font changes and markers. */
function blocksOf(lines: LineGroup[], body: number, colX0: number): { lines: LineGroup[]; kind: BlockKind }[] {
  const out: { lines: LineGroup[]; kind: BlockKind }[] = [];
  let cur: LineGroup[] = [];
  let curKind: BlockKind = 'paragraph';
  const kindOfLine = (l: LineGroup): BlockKind => {
    const t = l.text.trim();
    if (CAPTION.test(t)) return 'caption';
    if (l.mono || (MONO_HINT.test(t) && l.mono)) return 'code';
    if (mathy(t, l.mathShare)) return 'equation';
    if (LIST_MARK.test(t)) return 'list';
    return 'paragraph';
  };
  const flush = () => {
    if (cur.length) out.push({ lines: cur, kind: curKind });
    cur = [];
  };
  for (const l of lines) {
    const prev = cur[cur.length - 1];
    const k = kindOfLine(l);
    if (!prev) {
      cur = [l];
      curKind = k;
      continue;
    }
    const gap = l.top - prev.bottom;
    const sizeChange = Math.abs(l.size - prev.size) > Math.max(l.size, prev.size) * 0.12;
    const boldChange = l.bold !== prev.bold && (wordsIn(prev.text) <= 14 || wordsIn(l.text) <= 14);
    const indent = l.x0 - colX0 > body * 1.2 && SENTENCE_END.test(prev.text.trim()) && Math.abs(prev.x0 - colX0) < body * 0.6;
    const breakHere =
      gap > Math.max(prev.size, l.size) * 0.55 ||
      sizeChange ||
      boldChange ||
      k === 'caption' ||
      k === 'list' ||
      (k === 'equation') !== (curKind === 'equation') ||
      (k === 'code') !== (curKind === 'code') ||
      // (k is not 'list' here: a list line already broke above)
      (curKind === 'list' && l.x0 <= cur[0].x0 + body * 0.4) ||
      indent;
    if (breakHere) {
      flush();
      cur = [l];
      curKind = k;
    } else cur.push(l);
  }
  flush();
  return out;
}

/** Lines of a block into its text: a word broken by a hyphen at a line's end is joined. */
function joinLines(lines: LineGroup[], kind: BlockKind): { text: string; hyphen: boolean } {
  if (kind === 'code' || kind === 'equation') return { text: lines.map((l) => l.text).join('\n'), hyphen: false };
  let text = '';
  let hyphen = false;
  for (const l of lines) {
    const t = l.text.trim();
    if (!text) {
      text = t;
      continue;
    }
    const soft = /­$/.test(text);
    const broken = /[\p{Ll}]-$/u.test(text) && /^\p{Ll}/u.test(t);
    if (soft || broken) {
      text = text.replace(/[-­]$/, '') + t;
      hyphen = true;
    } else text += ` ${t}`;
  }
  return { text: text.replace(/­/g, ''), hyphen };
}

// ── the page ────────────────────────────────────────────────────────

/** One page laid out: blocks in reading order, its tables and figures, and what is known about it. */
export function layoutPage(page: PdfPageIn, opts: { bodySize?: number } = {}): LaidPage {
  const W = page.w > 0 ? page.w : 612;
  const H = page.h > 0 ? page.h : 792;
  const norm = (x0: number, top: number, x1: number, bottom: number): Box => [
    round4(Math.max(0, x0 / W)),
    round4(Math.max(0, top / H)),
    round4(Math.min(1, x1 / W)),
    round4(Math.min(1, bottom / H)),
  ];
  const rotated = page.items.filter((i) => i && (i as PdfItem & { rot?: boolean }).rot).length;
  const { items, overprints } = itemsOf({ ...page, items: page.items.filter((i) => !(i as PdfItem & { rot?: boolean }).rot) });
  const chars = items.reduce((n, i) => n + i.s.replace(/\s/g, '').length, 0);
  const garbledChars = items.reduce((n, i) => n + undecodable(i.s), 0);
  const imageArea = page.images.reduce((a, im) => a + Math.max(0, im.x1 - im.x0) * Math.max(0, im.y1 - im.y0), 0) / (W * H);
  const scanned = imageArea >= 0.4 && chars < 40;
  const bodySize = opts.bodySize ?? dominant(items.map((i) => [i.size, i.s.length])) ?? 10;

  const lines = linesOf(items);
  const segs = segmentsOf(lines);

  // the top and bottom bands: headers, footers, page numbers — decided across the document
  const bandOf = (top: number, bottom: number): 'top' | 'bottom' | undefined => (bottom <= H * 0.075 ? 'top' : top >= H * 0.925 ? 'bottom' : undefined);

  // tables first, so the reading order treats each as one piece
  const runs = findTables(
    segs.filter((s) => !bandOf(s.top, s.bottom)),
    bodySize
  );
  const inTable = new Set(runs.flatMap((r) => r.segs));
  const tables = runs.map(buildTable);

  // figures: images of any size worth calling one
  const figures = page.images
    .map((im) => ({ x0: im.x0, x1: im.x1, top: H - im.y1, bottom: H - im.y0 }))
    .filter((r) => ((r.x1 - r.x0) * (r.bottom - r.top)) / (W * H) >= 0.01 && !(scanned && (r.x1 - r.x0) * (r.bottom - r.top) >= W * H * 0.4));

  type Piece = Rect & { seg?: Seg; table?: number; figure?: number };
  const pieces: Piece[] = [
    ...segs.filter((s) => !inTable.has(s)).map((s) => ({ x0: s.x0, x1: s.x1, top: s.top, bottom: s.bottom, seg: s })),
    ...tables.map((t, i) => ({ x0: t.x0, x1: t.x1, top: t.top, bottom: t.bottom, table: i })),
    ...figures.map((f, i) => ({ ...f, figure: i })),
  ];

  // the bands are read apart from the body: top band first, bottom band last
  const top = pieces.filter((p) => p.seg && bandOf(p.top, p.bottom) === 'top');
  const bottom = pieces.filter((p) => p.seg && bandOf(p.top, p.bottom) === 'bottom');
  const bodyPieces = pieces.filter((p) => !top.includes(p) && !bottom.includes(p));

  const blocks: LaidBlock[] = [];
  const emitText = (leaf: Piece[], band?: 'top' | 'bottom') => {
    const segsHere = leaf.filter((p) => p.seg).map((p) => p.seg!);
    if (!segsHere.length) return;
    const lg = groupLines(segsHere);
    const colX0 = Math.min(...lg.map((l) => l.x0));
    for (const b of blocksOf(lg, bodySize, colX0)) {
      const { text, hyphen } = joinLines(b.lines, b.kind);
      const t = text.trim();
      if (!t) continue;
      const size = dominant(b.lines.map((l) => [l.size, l.text.length]));
      const bold = b.lines.every((l) => l.bold);
      const flags: BlockFlag[] = [];
      if (hyphen) flags.push('hyphen-joined');
      if (undecodable(t) > 0) flags.push('symbols-missing');
      blocks.push({
        kind: b.kind,
        text: t,
        box: norm(Math.min(...b.lines.map((l) => l.x0)), Math.min(...b.lines.map((l) => l.top)), Math.max(...b.lines.map((l) => l.x1)), Math.max(...b.lines.map((l) => l.bottom))),
        size,
        bold,
        ...(flags.length ? { flags } : {}),
        ...(band ? { band } : {}),
      });
    }
  };
  const emitLeaf = (leaf: Piece[], band?: 'top' | 'bottom') => {
    // a leaf may hold text and atomic pieces (a table, a figure) — in their vertical order
    const ordered = [...leaf].sort((a, b) => a.top - b.top || a.x0 - b.x0);
    let run: Piece[] = [];
    for (const p of ordered) {
      if (p.seg) run.push(p);
      else {
        emitText(run, band);
        run = [];
        if (p.table !== undefined) {
          const t = tables[p.table];
          blocks.push({ kind: 'table', text: t.rows.map((r) => r.join(' | ')).join('\n'), box: norm(t.x0, t.top, t.x1, t.bottom), size: bodySize, bold: false, table: p.table });
        } else if (p.figure !== undefined) {
          const f = figures[p.figure];
          blocks.push({ kind: 'figure', text: '', box: norm(f.x0, f.top, f.x1, f.bottom), size: bodySize, bold: false, figure: p.figure });
        }
      }
    }
    emitText(run, band);
  };

  emitLeaf(top, 'top');
  for (const leaf of xyCut(bodyPieces, bodySize)) emitLeaf(leaf);
  emitLeaf(bottom, 'bottom');

  // kinds that need the whole page: title, headings, footnotes, page numbers
  const maxSize = Math.max(0, ...blocks.filter((b) => b.kind === 'paragraph').map((b) => b.size));
  for (const b of blocks) {
    if (b.kind !== 'paragraph') continue;
    const words = wordsIn(b.text);
    const short = words <= 18 && !/[.;,]$/.test(b.text.trim());
    if (b.band && PAGE_NUM.test(b.text.trim())) {
      b.kind = b.band === 'top' ? 'header' : 'footer';
      continue;
    }
    if (b.size >= bodySize * 1.15 && short) {
      b.kind = page.n === 1 && b.size === maxSize && b.size >= bodySize * 1.4 && b.box[1] < 0.35 ? 'title' : 'heading';
    } else if (b.bold && short && words <= 14 && b.size >= bodySize * 0.95) {
      b.kind = 'heading';
    } else if (b.size <= bodySize * 0.88 && (b.box[1] >= 0.72 || /^(?:[¹²³⁴⁵⁶⁷⁸⁹⁰*†‡§]|\d{1,2}\s)/.test(b.text))) {
      b.kind = 'footnote';
    }
  }
  return {
    n: page.n,
    w: W,
    h: H,
    blocks,
    tables: tables.map((t) => ({ rows: t.rows, head: t.head, box: norm(t.x0, t.top, t.x1, t.bottom) })),
    figures: figures.map((f) => ({ box: norm(f.x0, f.top, f.x1, f.bottom) })),
    chars,
    overprints,
    rotated,
    scanned,
    garbled: chars ? garbledChars / chars : 0,
    bodySize,
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * The characters a page holds, in drawing order, once each — what the checks
 * compare a reading against (lib/docs/checks.ts). Text drawn twice for bold is
 * counted once, exactly as the layout counts it; nothing else is touched.
 */
export function rawText(page: PdfPageIn): string {
  return itemsOf({ ...page, items: page.items.filter((i) => !(i as PdfItem & { rot?: boolean }).rot) })
    .items.map((i) => plain(i.s))
    .join(' ');
}
