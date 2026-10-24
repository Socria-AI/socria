// lib/write/pdf.ts — the writing as a PDF, made here, with nothing sent anywhere.
//
// A real PDF: text a reader can select, search and copy, set in the PDF
// standard fonts every PDF reader carries (Times, Helvetica and Courier, with
// Symbol for Greek letters and mathematical signs), laid out on the page the
// writing was set on — its paper, orientation and margins — with its
// headings, paragraphs (aligned, justified, indented and spaced as set),
// lists, quotations, code, tables (a header row repeats on every page the
// table runs onto), pictures, horizontal lines and page breaks; bold,
// italic, underline, strikethrough, superscript, subscript, colours,
// highlights and sizes; links that open; the citations' Sources list.
//
// What it cannot do, it says rather than hides: the standard fonts have no
// Chinese, Arabic, Hebrew, Cyrillic or emoji. `pdfCoverage` names the
// characters a document uses that they cannot show, so the export can offer
// the browser's own print (which uses the page's fonts) instead of a PDF with
// holes in it. A font chosen in the writing becomes its standard counterpart
// — a serif as Times, a sans serif as Helvetica, a monospace as Courier.
//
// PURE given the pictures' pixels; async only to compress (CompressionStream).

import {
  citedSources,
  DEFAULT_FONT,
  DEFAULT_SIZE,
  fontInfo,
  isList,
  pageOf,
  paperOf,
  type Block,
  type WriteDoc,
} from './doc';
import { mediaIdOf } from './media';
import { METRICS, SYMBOL_CODES, WIDTHS, WINANSI_HIGH, type PdfFont } from './pdf-fonts';
import { segments, type Segment } from './render';

/** A picture as a PDF takes it: a JPEG as it is, anything else as pixels. */
export type PdfPicture =
  | { kind: 'jpeg'; bytes: Uint8Array; w: number; h: number; comps: number }
  | { kind: 'raw'; rgb: Uint8Array; alpha?: Uint8Array; w: number; h: number };

export interface PdfOptions {
  when?: Date;
  /** the pictures, by media id */
  pictures?: Map<string, PdfPicture>;
}

type Fam = 'serif' | 'sans' | 'mono';
type RGB = [number, number, number];

interface RunStyle {
  fam: Fam;
  b: boolean;
  i: boolean;
  size: number;
  color: RGB | null;
  bg: RGB | null;
  u: boolean;
  s: boolean;
  script: 'sup' | 'sub' | null;
  href: string | null;
}

const FACE: Record<Fam, [PdfFont, PdfFont, PdfFont, PdfFont]> = {
  serif: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  sans: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  mono: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
};
const faceOf = (s: Pick<RunStyle, 'fam' | 'b' | 'i'>): PdfFont => FACE[s.fam][(s.b ? 1 : 0) + (s.i ? 2 : 0)];

const hexRgb = (h: string | undefined | null): RGB | null => {
  if (!h || !/^#[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
};

// ── characters into the fonts' codes ────────────────────────────────

/** A character's code in WinAnsi, or null. */
function winAnsi(cp: number): number | null {
  if (cp >= 32 && cp <= 126) return cp;
  if (cp >= 160 && cp <= 255) return cp;
  return WINANSI_HIGH[cp] ?? null;
}

/** Stand-ins that are the same thing: spaces of other widths, joiners, the many hyphens and quotes. */
function plainOf(cp: number): number | null {
  if (cp === 9 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000) return 32;
  if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff || cp === 0x2060 || cp === 0xad) return -1;
  if (cp === 0x2010 || cp === 0x2011 || cp === 0x2043) return 45;
  if (cp === 0x2012 || cp === 0x2015) return 150;
  if (cp === 0x2032) return 39;
  if (cp === 0x2033) return 34;
  if (cp === 0x2044) return 47;
  return null;
}

type Glyph = { font: 'base' | 'Symbol'; code: number };

/** A character as the fonts can draw it — or null, when none of them can. */
function glyphOf(cp: number): Glyph | null | 'skip' {
  const w = winAnsi(cp);
  if (w !== null) return { font: 'base', code: w };
  const p = plainOf(cp);
  if (p === -1) return 'skip';
  if (p !== null) return { font: 'base', code: p };
  const sym = SYMBOL_CODES[cp];
  if (sym !== undefined) return { font: 'Symbol', code: sym };
  return null;
}

/** The characters a document uses that the PDF's fonts cannot show. */
export function pdfCoverage(doc: Pick<WriteDoc, 'title' | 'blocks'>): { ok: boolean; missing: string[] } {
  const missing = new Set<string>();
  const scan = (s: string) => {
    for (const ch of s) {
      if (ch === '\n') continue;
      const g = glyphOf(ch.codePointAt(0)!);
      if (g === null) missing.add(ch);
      if (missing.size >= 12) return;
    }
  };
  scan(doc.title);
  for (const b of doc.blocks) {
    if (b.t === 'table') for (const r of b.rows ?? []) for (const c of r) scan(c.text);
    else scan(b.text);
    for (const c of b.cites ?? []) scan(c.label + (c.quote ?? ''));
    if (missing.size >= 12) break;
  }
  return { ok: missing.size === 0, missing: Array.from(missing) };
}

// ── measuring ───────────────────────────────────────────────────────

const effSize = (s: RunStyle) => (s.script ? s.size * 0.65 : s.size);

function charWidth(font: PdfFont, code: number): number {
  return WIDTHS[font][code - 32] ?? 500;
}

function textWidth(text: string, style: RunStyle): number {
  const base = faceOf(style);
  const size = effSize(style);
  let w = 0;
  for (const ch of text) {
    const g = glyphOf(ch.codePointAt(0)!);
    if (g === 'skip') continue;
    if (!g) w += charWidth(base, 63);
    else w += charWidth(g.font === 'Symbol' ? 'Symbol' : base, g.code);
  }
  return (w * size) / 1000;
}

// ── laying out words into lines ─────────────────────────────────────

interface Item {
  text: string;
  style: RunStyle;
  kind: 'word' | 'space';
  w: number;
}

interface Line {
  items: Item[];
  width: number;
  /** ends at a line break or the paragraph's end: not justified */
  hard: boolean;
}

function itemsOf(segs: { text: string; style: RunStyle }[], keepSpaces: boolean): (Item | 'br')[] {
  const out: (Item | 'br')[] = [];
  for (const seg of segs) {
    for (const part of seg.text.split(/(\n)/)) {
      if (part === '\n') {
        out.push('br');
        continue;
      }
      if (!part) continue;
      for (const tok of part.match(keepSpaces ? /( |[^ ]+)/g : /(\s+|\S+)/g) ?? []) {
        const space = /^\s+$/.test(tok);
        const text = space && !keepSpaces ? ' ' : tok;
        out.push({ text, style: seg.style, kind: space ? 'space' : 'word', w: textWidth(text, seg.style) });
      }
    }
  }
  return out;
}

/** Words into lines no wider than `avail`: greedy, breaking at spaces; a word longer than a line is broken where it must be. */
function breakLines(items: (Item | 'br')[], avail: number, keepSpaces = false): Line[] {
  const lines: Line[] = [];
  let cur: Item[] = [];
  let width = 0;
  const trimEnd = () => {
    while (!keepSpaces && cur.length && cur[cur.length - 1].kind === 'space') width -= cur.pop()!.w;
  };
  const push = (hard: boolean) => {
    trimEnd();
    lines.push({ items: cur, width: Math.max(0, width), hard });
    cur = [];
    width = 0;
  };
  for (const it of items) {
    if (it === 'br') {
      push(true);
      continue;
    }
    if (it.kind === 'space' && !cur.length && !keepSpaces) continue;
    if (it.kind === 'word' && width + it.w > avail + 0.01 && cur.some((x) => x.kind === 'word')) {
      push(false);
    }
    if (it.kind === 'word' && it.w > avail) {
      // a word wider than the line: broken by characters
      let piece = '';
      for (const ch of it.text) {
        const next = piece + ch;
        if (textWidth(next, it.style) + width > avail && piece) {
          cur.push({ ...it, text: piece, w: textWidth(piece, it.style) });
          width += textWidth(piece, it.style);
          push(false);
          piece = ch;
        } else piece = next;
      }
      if (piece) {
        const w = textWidth(piece, it.style);
        cur.push({ ...it, text: piece, w });
        width += w;
      }
      continue;
    }
    cur.push(it);
    width += it.w;
  }
  push(true);
  return lines;
}

// ── the PDF objects ─────────────────────────────────────────────────

const latin1 = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

/** A PDF literal string of bytes: parentheses and backslashes escaped, everything outside ASCII as octal. */
function pdfBytes(codes: number[]): string {
  let s = '(';
  for (const c of codes) {
    if (c === 40 || c === 41 || c === 92) s += '\\' + String.fromCharCode(c);
    else if (c < 32 || c > 126) s += '\\' + c.toString(8).padStart(3, '0');
    else s += String.fromCharCode(c);
  }
  return s + ')';
}

/** A text string for the document's information: plain ASCII as it is, anything else as UTF-16. */
function pdfText(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return pdfBytes(Array.from(s, (c) => c.charCodeAt(0)));
  let hex = 'FEFF';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else hex += cp.toString(16).padStart(4, '0');
  }
  return `<${hex.toUpperCase()}>`;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return data;
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  void writer.write(new Uint8Array(data)).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const n2 = (n: number) => (Math.round(n * 100) / 100).toString();

// ── the layout ──────────────────────────────────────────────────────

const DEFAULT_LH = 1.15;
/** A line's height for a size, at a word processor's line spacing: single is a little more than the size. */
const lineHeight = (size: number, lh: number) => size * 1.17 * lh;

interface PageOut {
  ops: string[];
  annots: { rect: [number, number, number, number]; href: string }[];
  images: Set<string>;
}

export async function toPdf(doc: Pick<WriteDoc, 'title' | 'blocks'> & Partial<Pick<WriteDoc, 'page' | 'font' | 'size'>>, opts: PdfOptions = {}): Promise<Uint8Array> {
  const page = pageOf(doc);
  const paper = paperOf(page);
  const W = paper.w * 72;
  const H = paper.h * 72;
  const [mt, mr, mb, ml] = page.m.map((m) => m * 72);
  const contentW = W - ml - mr;
  const contentH = H - mt - mb;
  const baseFam: Fam = fontInfo(doc.font ?? DEFAULT_FONT).kind;
  const base = doc.size ?? DEFAULT_SIZE;

  const pages: PageOut[] = [];
  let pg: PageOut = { ops: [], annots: [], images: new Set() };
  pages.push(pg);
  let y = 0; // from the top of the content area
  const usedFonts = new Set<PdfFont>();
  const pictures = opts.pictures ?? new Map<string, PdfPicture>();
  const imageNames = new Map<string, string>();

  const newPage = () => {
    pg = { ops: [], annots: [], images: new Set() };
    pages.push(pg);
    y = 0;
  };
  const room = () => contentH - y;
  const X = (x: number) => ml + x;
  const Y = (top: number) => H - mt - top;

  const plainStyle: RunStyle = { fam: baseFam, b: false, i: false, size: base, color: null, bg: null, u: false, s: false, script: null, href: null };
  const styleOf = (seg: Segment, look: Partial<RunStyle>): RunStyle => {
    const fam: Fam = seg.val.font ? fontInfo(seg.val.font).kind : look.fam ?? baseFam;
    return {
      fam,
      b: seg.on.includes('b') || !!look.b,
      i: seg.on.includes('i') || !!look.i,
      size: seg.val.size ? Number(seg.val.size) : look.size ?? base,
      color: hexRgb(seg.val.color) ?? look.color ?? (seg.val.a ? [0.17, 0.36, 0.54] : null),
      bg: hexRgb(seg.val.bg),
      u: seg.on.includes('u') || !!seg.val.a,
      s: seg.on.includes('s'),
      script: seg.on.includes('sup') ? 'sup' : seg.on.includes('sub') ? 'sub' : null,
      href: seg.val.a ?? null,
    };
  };

  /** Glyph runs of one item, split where the font changes to Symbol and back. */
  const runs = (text: string, style: RunStyle): { font: PdfFont; codes: number[] }[] => {
    const baseFont = faceOf(style);
    const out: { font: PdfFont; codes: number[] }[] = [];
    for (const ch of text) {
      const g = glyphOf(ch.codePointAt(0)!);
      if (g === 'skip') continue;
      const font: PdfFont = g && g.font === 'Symbol' ? 'Symbol' : baseFont;
      const code = g ? g.code : 63;
      const last = out[out.length - 1];
      if (last && last.font === font) last.codes.push(code);
      else out.push({ font, codes: [code] });
    }
    return out;
  };

  /** One line drawn with its top at `top` (from the content area's top); returns its height. */
  const drawLine = (line: Line, left: number, avail: number, align: Block['align'], lh: number, top: number) => {
    const items = line.items;
    const styles = items.length ? items.map((it) => it.style) : [plainStyle];
    const height = Math.max(...styles.map((s) => lineHeight(s.size, lh)));
    const asc = Math.max(...styles.map((s) => (effSize(s) * METRICS[faceOf(s)].ascent) / 1000));
    const desc = Math.max(...styles.map((s) => (effSize(s) * -METRICS[faceOf(s)].descent) / 1000));
    const baseline = top + (height - (asc + desc)) / 2 + asc;
    let x = left;
    let extra = 0;
    if (align === 'center') x += (avail - line.width) / 2;
    else if (align === 'right') x += avail - line.width;
    else if (align === 'justify' && !line.hard) {
      const spaces = items.filter((it) => it.kind === 'space').length;
      if (spaces) extra = (avail - line.width) / spaces;
    }
    for (const it of items) {
      const w = it.w + (it.kind === 'space' ? extra : 0);
      const st = it.style;
      const size = effSize(st);
      const rise = st.script === 'sup' ? st.size * 0.33 : st.script === 'sub' ? -st.size * 0.15 : 0;
      const by = Y(baseline) + rise;
      const fa = (size * METRICS[faceOf(st)].ascent) / 1000;
      const fd = (size * -METRICS[faceOf(st)].descent) / 1000;
      if (st.bg) pg.ops.push(`${st.bg.map(n2).join(' ')} rg ${n2(X(x))} ${n2(by - fd)} ${n2(w)} ${n2(fa + fd)} re f`);
      if (it.kind === 'word') {
        const color = st.color ?? [0.137, 0.141, 0.122];
        let cx = X(x);
        const parts: string[] = [];
        for (const r of runs(it.text, st)) {
          usedFonts.add(r.font);
          parts.push(`/${fontRes(r.font)} ${n2(size)} Tf 1 0 0 1 ${n2(cx)} ${n2(by)} Tm ${pdfBytes(r.codes)} Tj`);
          cx += r.codes.reduce((n, c) => n + charWidth(r.font, c), 0) * size / 1000;
        }
        pg.ops.push(`${color.map(n2).join(' ')} rg BT ${parts.join(' ')} ET`);
      }
      if (st.u || st.s) {
        const color = st.color ?? [0.137, 0.141, 0.122];
        const t = Math.max(0.4, st.size * 0.05);
        const ly = st.u ? by - st.size * 0.12 : by + size * 0.28;
        pg.ops.push(`${color.map(n2).join(' ')} RG ${n2(t)} w ${n2(X(x))} ${n2(ly)} m ${n2(X(x + w))} ${n2(ly)} l S`);
        if (st.u && st.s) {
          const sy = by + size * 0.28;
          pg.ops.push(`${n2(X(x))} ${n2(sy)} m ${n2(X(x + w))} ${n2(sy)} l S`);
        }
      }
      if (st.href) {
        const last = pg.annots[pg.annots.length - 1];
        const rect: [number, number, number, number] = [X(x), by - fd, X(x + w), by + fa];
        // one link across words: the rectangles of its words are joined on a line
        if (last && last.href === st.href && Math.abs(last.rect[1] - rect[1]) < 0.5 && Math.abs(last.rect[2] - rect[0]) < extra + 6) last.rect[2] = rect[2];
        else pg.annots.push({ rect, href: st.href });
      }
      x += w;
    }
    return height;
  };

  const fontNames = new Map<PdfFont, string>();
  const fontRes = (f: PdfFont) => {
    let n = fontNames.get(f);
    if (!n) {
      n = `F${fontNames.size + 1}`;
      fontNames.set(f, n);
    }
    return n;
  };

  /** A block of words laid out and drawn: lines kept off the page's foot, the space before and after it. */
  const flow = (
    segs: { text: string; style: RunStyle }[],
    o: { left?: number; right?: number; align?: Block['align']; lh?: number; before?: number; after?: number; keepNext?: number; marker?: { text: string; style: RunStyle; at: number }; bar?: RGB; keepSpaces?: boolean; fill?: RGB }
  ) => {
    const left = o.left ?? 0;
    const avail = contentW - left - (o.right ?? 0);
    const lh = o.lh ?? DEFAULT_LH;
    const lines = breakLines(itemsOf(segs, !!o.keepSpaces), avail, !!o.keepSpaces);
    const heights = lines.map((l) => Math.max(...(l.items.length ? l.items.map((it) => lineHeight(it.style.size, lh)) : [lineHeight(base, lh)])));
    if (y > 0) y += o.before ?? 0;
    // a heading is not left alone at the foot of a page
    const need = (heights[0] ?? 0) + (o.keepNext ?? 0);
    if (y > 0 && need > room()) newPage();
    lines.forEach((line, k) => {
      const h = heights[k];
      if (y > 0 && h > room()) newPage();
      if (o.fill) pg.ops.push(`${o.fill.map(n2).join(' ')} rg ${n2(X(left - 6))} ${n2(Y(y + h))} ${n2(avail + 12)} ${n2(h)} re f`);
      if (o.bar) pg.ops.push(`${o.bar.map(n2).join(' ')} rg ${n2(X(left - 14))} ${n2(Y(y + h))} 2 ${n2(h)} re f`);
      if (k === 0 && o.marker) {
        const m = o.marker;
        usedFonts.add(faceOf(m.style));
        const size = effSize(m.style);
        const asc = (size * METRICS[faceOf(m.style)].ascent) / 1000;
        const desc = (size * -METRICS[faceOf(m.style)].descent) / 1000;
        const baseline = y + (h - (asc + desc)) / 2 + asc;
        const codes = runs(m.text, m.style);
        pg.ops.push(`0.29 0.3 0.27 rg BT ${codes.map((r) => (usedFonts.add(r.font), `/${fontRes(r.font)} ${n2(size)} Tf 1 0 0 1 ${n2(X(m.at))} ${n2(Y(baseline))} Tm ${pdfBytes(r.codes)} Tj`)).join(' ')} ET`);
      }
      y += drawLine(line, left, avail, o.align, lh, y);
    });
    y += o.after ?? 0;
  };

  const segsOf = (b: Pick<Block, 'text' | 'marks'>, look: Partial<RunStyle>) => segments(b.text, b.marks).map((seg) => ({ text: seg.text, style: styleOf(seg, look) }));

  const sources = citedSources(doc);
  const numbers = new Map(sources.map((s) => [s.key, s.n]));
  const citeSegs = (b: Block, look: Partial<RunStyle>) =>
    (b.cites ?? [])
      .map((c) => numbers.get(`${c.doc}:${c.block}`))
      .filter((n): n is number => typeof n === 'number')
      .map((n) => ({ text: `[${n}]`, style: { ...styleOf({ text: '', on: ['sup'], val: {} }, look) } }));

  // ── the title ──
  if (doc.title.trim()) flow([{ text: doc.title.trim(), style: styleOf({ text: '', on: [], val: {} }, { size: base * 2.2 }) }], { after: base * 1.2, lh: 1 });

  const counters = [0, 0, 0, 0];
  const LIST_MARK = ['•', '–', '·'];
  const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
  doc.blocks.forEach((b, k) => {
    const next = doc.blocks[k + 1];
    if (!isList(b.t)) counters.fill(0);
    const lh = b.lh ?? DEFAULT_LH;
    const ind = (b.ind ?? 0) * 36;
    if (b.t === 'pb') {
      if (y > 0) newPage();
      return;
    }
    if (b.t === 'hr') {
      if (y > 0) y += 8;
      if (room() < 10) newPage();
      pg.ops.push(`0.74 0.73 0.68 RG 0.75 w ${n2(X(0))} ${n2(Y(y + 4))} m ${n2(X(contentW))} ${n2(Y(y + 4))} l S`);
      y += 16;
      return;
    }
    if (b.t === 'img') {
      const id = mediaIdOf(b.src);
      const pic = id ? pictures.get(id) : undefined;
      if (!pic) {
        flow([{ text: b.alt ? `[Picture: ${b.alt}]` : '[Picture]', style: styleOf({ text: '', on: ['i'], val: {} }, {}) }], { align: b.align, after: 8 });
        return;
      }
      const iw = pic.w;
      const ih = pic.h;
      let w = b.w ? (contentW * b.w) / 100 : Math.min(contentW, iw * 0.75);
      let h = (w * ih) / iw;
      if (h > contentH) {
        h = contentH;
        w = (h * iw) / ih;
      }
      if (y > 0) y += 6;
      if (h > room()) newPage();
      const x = b.align === 'center' ? (contentW - w) / 2 : b.align === 'right' ? contentW - w : 0;
      let name = imageNames.get(id!);
      if (!name) {
        name = `Im${imageNames.size + 1}`;
        imageNames.set(id!, name);
      }
      pg.images.add(id!);
      pg.ops.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(X(x))} ${n2(Y(y + h))} cm /${name} Do Q`);
      y += h + 10;
      return;
    }
    if (b.t === 'table') {
      const rows = b.rows ?? [];
      if (!rows.length) return;
      const width = rows[0].length;
      const fr = b.cols && b.cols.length === width ? b.cols : Array.from({ length: width }, () => 1 / width);
      const colW = fr.map((f) => f * contentW);
      const pad = 4;
      const size = base * 0.92;
      const layoutRow = (row: Block[], head: boolean) => {
        const cells = row.map((c, ci) => {
          const segs = segsOf(c, { size, b: head });
          const lines = breakLines(itemsOf(segs, false), colW[ci] - pad * 2);
          const heights = lines.map((l) => Math.max(...(l.items.length ? l.items.map((it) => lineHeight(it.style.size, 1)) : [lineHeight(base, 1)])));
          return { c, lines, heights, h: heights.reduce((n, x) => n + x, 0) };
        });
        return { cells, h: Math.max(...cells.map((c) => c.h)) + pad * 2 };
      };
      const drawRow = (laid: ReturnType<typeof layoutRow>, head: boolean) => {
        const top = y;
        let x = 0;
        laid.cells.forEach((cell, ci) => {
          if (head) pg.ops.push(`0.937 0.929 0.902 rg ${n2(X(x))} ${n2(Y(top + laid.h))} ${n2(colW[ci])} ${n2(laid.h)} re f`);
          let ly = top + pad;
          cell.lines.forEach((line, li) => {
            drawLine(line, x + pad, colW[ci] - pad * 2, cell.c.align, 1, ly);
            ly += cell.heights[li];
          });
          x += colW[ci];
        });
        // the grid
        const ops = [`0.74 0.73 0.68 RG 0.5 w`];
        let gx = 0;
        for (let ci = 0; ci <= width; ci++) {
          ops.push(`${n2(X(gx))} ${n2(Y(top))} m ${n2(X(gx))} ${n2(Y(top + laid.h))} l`);
          gx += colW[ci] ?? 0;
        }
        ops.push(`${n2(X(0))} ${n2(Y(top))} m ${n2(X(contentW))} ${n2(Y(top))} l ${n2(X(0))} ${n2(Y(top + laid.h))} m ${n2(X(contentW))} ${n2(Y(top + laid.h))} l S`);
        pg.ops.push(ops.join(' '));
        y += laid.h;
      };
      if (y > 0) y += 6;
      const headRow = b.head ? layoutRow(rows[0], true) : null;
      rows.forEach((row, r) => {
        if (r === 0 && headRow) {
          if (headRow.h + 20 > room() && y > 0) newPage();
          drawRow(headRow, true);
          return;
        }
        const laid = layoutRow(row, false);
        if (laid.h > room() && y > 0) {
          newPage();
          // the header row again, at the top of the page the table runs onto
          if (headRow) drawRow(headRow, true);
        }
        drawRow(laid, false);
      });
      y += 10;
      return;
    }
    if (b.t === 'code') {
      const segs = [{ text: b.text, style: styleOf({ text: '', on: [], val: {} }, { fam: 'mono', size: base * 0.85 }) }];
      flow(segs, { left: 6, right: 6, lh: 1, before: b.sb ?? 4, after: b.sa ?? 10, keepSpaces: true, fill: [0.957, 0.953, 0.937] });
      return;
    }
    if (isList(b.t)) {
      const lvl = Math.max(1, Math.min(3, b.lvl ?? 1));
      for (let d = lvl + 1; d <= 3; d++) counters[d] = 0;
      counters[lvl] = b.t === 'ol' ? counters[lvl] + 1 : 0;
      const n = counters[lvl];
      const mark = b.t === 'ul' ? LIST_MARK[lvl - 1] : lvl === 1 ? `${n}.` : lvl === 2 ? `${String.fromCharCode(96 + (((n - 1) % 26) + 1))}.` : `${ROMAN[(n - 1) % 20]}.`;
      const left = lvl * 27 + 9;
      const look = {};
      flow([...segsOf(b, look), ...citeSegs(b, look)], { left, align: b.align, lh, before: b.sb ?? 0, after: b.sa ?? 3, marker: { text: mark, style: styleOf({ text: '', on: [], val: {} }, {}), at: left - 18 } });
      if (!next || !isList(next.t)) y += 5;
      return;
    }
    if (!b.text.trim() && b.t === 'p') {
      y += lineHeight(base, lh) * 0.6;
      return;
    }
    if (b.t === 'h1' || b.t === 'h2' || b.t === 'h3') {
      const size = base * (b.t === 'h1' ? 1.5 : b.t === 'h2' ? 1.25 : 1.05);
      const look = { size, b: true };
      flow([...segsOf(b, look), ...citeSegs(b, look)], { left: ind, align: b.align, lh: b.lh ?? 1.05, before: b.sb ?? (b.t === 'h1' ? 18 : b.t === 'h2' ? 14 : 11), after: b.sa ?? (b.t === 'h3' ? 4 : 6), keepNext: lineHeight(base, DEFAULT_LH) * 2 });
      return;
    }
    if (b.t === 'quote') {
      const look = { i: true, color: [0.29, 0.3, 0.27] as RGB };
      flow([...segsOf(b, look), ...citeSegs(b, look)], { left: 36 + ind, right: 24, align: b.align, lh, before: b.sb ?? 6, after: b.sa ?? 10, bar: [0.79, 0.77, 0.71] });
      return;
    }
    flow([...segsOf(b, {}), ...citeSegs(b, {})], { left: ind, align: b.align, lh, before: b.sb ?? 0, after: b.sa ?? 8 });
  });

  if (sources.length) {
    flow([{ text: 'Sources', style: styleOf({ text: '', on: ['b'], val: {} }, { size: base * 1.25 }) }], { before: 18, after: 6, keepNext: lineHeight(base, DEFAULT_LH) * 2 });
    for (const s of sources) flow([{ text: `[${s.n}] ${s.cite.label}${s.cite.quote ? ` — “${s.cite.quote}”` : ''}`, style: styleOf({ text: '', on: [], val: {} }, { size: base * 0.92 }) }], { after: 4 });
  }

  // ── the file ──
  const objects: (string | Uint8Array)[] = [];
  const add = (body: string | Uint8Array) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('');
  const pagesObj = add('');
  const fontObj = new Map<PdfFont, number>();
  for (const f of Array.from(fontNames.keys())) fontObj.set(f, add(f === 'Symbol' ? `<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>` : `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
  const imageObj = new Map<string, number>();
  const streamObj = (dict: string, data: Uint8Array) => {
    const head = latin1(`${dict.replace(/>>$/, '')} /Length ${data.length} >>\nstream\n`);
    const tail = latin1('\nendstream');
    const out = new Uint8Array(head.length + data.length + tail.length);
    out.set(head, 0);
    out.set(data, head.length);
    out.set(tail, head.length + data.length);
    return out;
  };
  for (const [id, name] of Array.from(imageNames)) {
    void name;
    const pic = pictures.get(id)!;
    if (pic.kind === 'jpeg') {
      imageObj.set(id, add(streamObj(`<< /Type /XObject /Subtype /Image /Width ${pic.w} /Height ${pic.h} /ColorSpace /${pic.comps === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode >>`, pic.bytes)));
    } else {
      let smask = '';
      if (pic.alpha) {
        const a = add(streamObj(`<< /Type /XObject /Subtype /Image /Width ${pic.w} /Height ${pic.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode >>`, await deflate(pic.alpha)));
        smask = ` /SMask ${a} 0 R`;
      }
      imageObj.set(id, add(streamObj(`<< /Type /XObject /Subtype /Image /Width ${pic.w} /Height ${pic.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smask} >>`, await deflate(pic.rgb))));
    }
  }
  const fontDict = `<< ${Array.from(fontNames).map(([f, n]) => `/${n} ${fontObj.get(f)} 0 R`).join(' ')} >>`;
  const pageIds: number[] = [];
  for (const p of pages) {
    const content = await deflate(latin1(p.ops.join('\n')));
    const contentId = add(streamObj('<< /Filter /FlateDecode >>', content));
    const annotIds = p.annots.map((a) => add(`<< /Type /Annot /Subtype /Link /Rect [${a.rect.map(n2).join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${pdfBytes(Array.from(a.href.replace(/[^\x20-\x7e]/g, (c) => encodeURIComponent(c)), (c) => c.charCodeAt(0)))} >> >>`));
    const xobj = p.images.size ? ` /XObject << ${Array.from(p.images).map((id) => `/${imageNames.get(id)} ${imageObj.get(id)} 0 R`).join(' ')} >>` : '';
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${n2(W)} ${n2(H)}] /Resources << /Font ${fontDict}${xobj} >> /Contents ${contentId} 0 R${annotIds.length ? ` /Annots [${annotIds.map((i) => `${i} 0 R`).join(' ')}]` : ''} >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R /Lang (en) >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const when = opts.when ?? new Date();
  const d = when.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const info = add(`<< /Title ${pdfText(doc.title.trim() || 'Untitled')} /Producer (Socria) /CreationDate (D:${d}Z) >>`);

  const parts: Uint8Array[] = [latin1('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets: number[] = [];
  let pos = parts[0].length;
  objects.forEach((o, k) => {
    offsets.push(pos);
    const head = latin1(`${k + 1} 0 obj\n`);
    const body = typeof o === 'string' ? latin1(o) : o;
    const tail = latin1('\nendobj\n');
    parts.push(head, body, tail);
    pos += head.length + body.length + tail.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(latin1(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export const PDF_TYPE = 'application/pdf';
