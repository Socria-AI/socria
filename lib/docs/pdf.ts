// lib/docs/pdf.ts — a PDF opened, page by page, into a SourceDoc.
//
// pdf.js (through unpdf's serverless build) gives each page's text items with
// their positions and fonts, and an operator list that says where images are
// drawn. lib/docs/pdf-layout.ts turns one page's geometry into blocks; this
// file does what needs the whole document:
//
//   · the body font size, by characters across every page — so a heading is
//     "larger than the text of this document", not of one page
//   · running headers and footers: text in the top or bottom band that
//     repeats across pages (digits treated alike, so "Page 3" is "Page 4")
//   · heading levels, ranked by size across the document
//   · captions joined to the table or figure beside them (lib/docs/build.ts)
//   · ids: "p3.12", "t4", "f2"
//   · which pages are scans (an image, no usable text) and wait for a vision
//     reading — said in the page record, never filled in with a guess
//
// Isomorphic: runs on the server (the reader) and in the browser (to render a
// scanned page for its vision reading). Every page has a fingerprint of what
// was read from it, so an unchanged page is never read twice.

import { fingerprint } from './hash';
import { layoutPage, rawText, type LaidPage, type PdfImage, type PdfItem } from './pdf-layout';
import { linkCaptions } from './build';
import type { RawPage } from './checks';
import type { DocBlock, DocFigure, DocPage, DocTable, SourceDoc } from './types';

export interface PdfReadOptions {
  /** the document's id (a hash of its bytes, computed by the caller) */
  id: string;
  name: string;
  /** read at most this many pages from the start; the rest are said to be unread */
  maxPages?: number;
  /** stop starting new pages after this long (ms) — the rest are said to be unread */
  budgetMs?: number;
  /** pages already read, by fingerprint, to be kept rather than read again */
  known?: Map<string, LaidPage>;
}

/** Fonts whose glyphs are mathematics. */
const MATH_FONT = /symbol|cmmi|cmsy|cmex|cmbsy|msbm|msam|eufm|rsfs|wasy|stixmath|stix.*math|xits.*math|cambria ?math|latinmodern-?math|lmmath|asana|mathematica|euclid|mt ?extra|lucida ?math|mathpi/i;
const MONO_FONT = /courier|mono|consol|menlo|inconsolata|lucida ?console|andale|cmtt|sfmono|code/i;

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

interface PdfjsLike {
  numPages: number;
  getPage(n: number): Promise<PageLike>;
  getMetadata?(): Promise<{ info?: Record<string, unknown> }>;
  destroy?(): Promise<void>;
}
interface PageLike {
  getViewport(o: { scale: number }): { width: number; height: number; transform: number[] };
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  getTextContent(): Promise<{ items: { str?: string; transform?: number[]; width?: number; fontName?: string }[] }>;
  commonObjs: { get(id: string): unknown; has?(id: string): boolean };
  cleanup?(): void;
}

/** One page's geometry, in the viewport's frame (top-left origin) turned back into PDF's (bottom-left). */
async function pageGeometry(page: PageLike, n: number, OPS: Record<string, number>): Promise<{ n: number; w: number; h: number; items: PdfItem[]; images: PdfImage[] }> {
  const vp = page.getViewport({ scale: 1 });
  const W = vp.width;
  const H = vp.height;
  const T = vp.transform as Matrix; // PDF user space → viewport (y down)
  const ops = await page.getOperatorList();
  // images: track the transformation through the graphics state; an image fills the unit square of the CTM
  const images: PdfImage[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) ctm = mul(ctm, args.slice(0, 6) as Matrix);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0];
      if (Array.isArray(m) && m.length >= 6) ctm = mul(ctm, m.slice(0, 6) as Matrix);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintImageXObjectRepeat) {
      const full = mul(T, ctm);
      const pts = [apply(full, 0, 0), apply(full, 1, 0), apply(full, 0, 1), apply(full, 1, 1)];
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      // back to PDF's bottom-left frame for the layout
      images.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: H - Math.max(...ys), y1: H - Math.min(...ys) });
    }
  }
  const tc = await page.getTextContent();
  const fonts = new Map<string, { bold: boolean; italic: boolean; mono: boolean; math: boolean }>();
  const fontOf = (name: string | undefined) => {
    if (!name) return { bold: false, italic: false, mono: false, math: false };
    if (fonts.has(name)) return fonts.get(name)!;
    let f: { name?: string; bold?: boolean; black?: boolean; italic?: boolean; isMonospace?: boolean } = {};
    try {
      if (!page.commonObjs.has || page.commonObjs.has(name)) f = (page.commonObjs.get(name) as typeof f) ?? {};
    } catch {
      f = {};
    }
    const fname = String(f.name ?? '');
    const info = {
      bold: !!f.bold || !!f.black || /bold|black|heavy|semibold|demi/i.test(fname),
      italic: !!f.italic || /italic|oblique/i.test(fname),
      mono: !!f.isMonospace || MONO_FONT.test(fname),
      math: MATH_FONT.test(fname),
    };
    fonts.set(name, info);
    return info;
  };
  const items: (PdfItem & { rot?: boolean })[] = [];
  for (const it of tc.items) {
    if (typeof it.str !== 'string' || !it.str || !Array.isArray(it.transform)) continue;
    const m = mul(T, it.transform as Matrix);
    // the text's direction in the viewport: horizontal text has no shear
    const size = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]) || 10;
    const rot = Math.abs(m[1]) > Math.abs(m[0]) * 0.1;
    const [vx, vy] = [m[4], m[5]];
    const scale = Math.hypot(T[0], T[1]) || 1;
    const f = fontOf(it.fontName);
    items.push({ s: it.str, x: vx, y: H - vy, w: (it.width ?? 0) * scale, size, ...f, ...(rot ? { rot: true } : {}) });
  }
  return { n, w: W, h: H, items, images };
}

/** The body font size across pages: the size carrying the most characters. */
function bodySizeOf(pages: { items: PdfItem[] }[]): number {
  const m = new Map<number, number>();
  for (const p of pages) for (const it of p.items) m.set(Math.round(it.size * 2) / 2, (m.get(Math.round(it.size * 2) / 2) ?? 0) + it.s.length);
  let best = 10;
  let bw = -1;
  for (const [k, w] of m) if (w > bw) [best, bw] = [k, w];
  return best;
}

const norm = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

/** Laid-out pages into a document: headers, footers, heading levels, captions, ids. */
export function assemble(laid: LaidPage[], meta: { id: string; name: string; pageCount: number; title?: string; unread?: { from: number; to: number } }): SourceDoc {
  // running headers and footers: band text repeating across pages
  const seen = new Map<string, Set<number>>();
  for (const p of laid) for (const b of p.blocks) if (b.band) {
    const k = `${b.band}:${norm(b.text)}`;
    seen.set(k, new Set([...(seen.get(k) ?? []), p.n]));
  }
  const threshold = Math.max(2, Math.ceil(laid.length * (laid.length >= 4 ? 0.3 : 0.5)));
  for (const p of laid) for (const b of p.blocks) {
    if (!b.band) continue;
    if ((seen.get(`${b.band}:${norm(b.text)}`)?.size ?? 0) >= threshold && b.kind === 'paragraph') b.kind = b.band === 'top' ? 'header' : 'footer';
  }
  // heading levels by size across the document; bold headings at body size sit below every sized one
  const sizes = [...new Set(laid.flatMap((p) => p.blocks.filter((b) => b.kind === 'heading').map((b) => Math.round(b.size * 2) / 2)))].sort((a, b) => b - a);
  const body = laid.length ? laid[0].bodySize : 10;
  const blocks: DocBlock[] = [];
  const tables: DocTable[] = [];
  const figures: DocFigure[] = [];
  const pages: DocPage[] = [];
  let shown: string | undefined;
  for (const p of laid) {
    let k = 0;
    const tIds: string[] = p.tables.map((t) => {
      const id = `t${tables.length + 1}`;
      tables.push({ id, page: p.n, rows: t.rows, head: t.head, box: t.box, method: 'text' });
      return id;
    });
    const fIds: string[] = p.figures.map((f) => {
      const id = `f${figures.length + 1}`;
      figures.push({ id, page: p.n, kind: 'image', box: f.box, method: 'text' });
      return id;
    });
    const pageBlocks: DocBlock[] = [];
    for (const b of p.blocks) {
      const id = `p${p.n}.${++k}`;
      const level = b.kind === 'heading' ? Math.min(6, Math.max(1, (b.size > body * 1.08 ? sizes.indexOf(Math.round(b.size * 2) / 2) : sizes.filter((s) => s > body * 1.08).length) + 1)) : undefined;
      const block: DocBlock = {
        id,
        page: p.n,
        kind: b.kind,
        text: b.text,
        ...(level ? { level } : {}),
        box: b.box,
        ...(b.table !== undefined ? { table: tIds[b.table] } : {}),
        ...(b.figure !== undefined ? { figure: fIds[b.figure] } : {}),
        ...(b.kind === 'equation' ? { tex: b.text } : {}),
        method: 'text',
        ...(b.flags?.length ? { flags: b.flags } : {}),
        ...(p.garbled > 0.25 ? { conf: 0.4 } : b.flags?.includes('symbols-missing') ? { conf: 0.7 } : {}),
      };
      if (b.kind === 'title' && !shown) shown = b.text;
      pageBlocks.push(block);
    }
    blocks.push(...pageBlocks);
    const text = pageBlocks.map((b) => b.text).join('\n');
    pages.push({
      n: p.n,
      w: Math.round(p.w * 10) / 10,
      h: Math.round(p.h * 10) / 10,
      method: p.chars ? 'text' : 'none',
      chars: p.chars,
      images: p.figures.length + (p.scanned ? 1 : 0),
      // a page with no text of its own — a scan, text drawn as outlines, a drawing — can only be read from its picture
      ocr: p.scanned || p.garbled > 0.3 || p.chars === 0 ? 'needed' : 'none',
      hash: fingerprint(`${p.n}:${text}:${p.figures.length}:${p.scanned}`),
    });
  }
  linkCaptions(blocks, tables, figures);
  // the title the document shows outranks the one its properties hold
  const title = shown ?? meta.title;
  return {
    v: 1,
    id: meta.id,
    name: meta.name,
    format: 'pdf',
    ...(title ? { title: title.slice(0, 300) } : {}),
    pageCount: meta.pageCount,
    pages,
    blocks,
    tables,
    figures,
    checks: [],
    ...(meta.unread ? { unread: meta.unread } : {}),
  };
}

/**
 * A PDF's bytes into a SourceDoc. Pages past `maxPages`, or not reached
 * within `budgetMs`, are recorded as unread — the person is told, and can
 * ask for them — rather than dropped without a word.
 */
export async function readPdf(bytes: Uint8Array, opts: PdfReadOptions): Promise<{ doc: SourceDoc; laid: LaidPage[]; raw: RawPage[]; overprints: number }> {
  const { getDocumentProxy, getResolvedPDFJS } = await import('unpdf');
  const pdfjs = (await getResolvedPDFJS()) as unknown as { OPS: Record<string, number> };
  const doc = (await getDocumentProxy(bytes, { verbosity: 0, isEvalSupported: false } as never)) as unknown as PdfjsLike;
  const started = Date.now();
  const total = doc.numPages;
  const limit = Math.min(total, opts.maxPages ?? 150);
  const budget = opts.budgetMs ?? 40_000;
  const geos: Awaited<ReturnType<typeof pageGeometry>>[] = [];
  let last = 0;
  try {
    for (let n = 1; n <= limit; n++) {
      if (n > 1 && Date.now() - started > budget) break;
      const page = await doc.getPage(n);
      try {
        geos.push(await pageGeometry(page, n, pdfjs.OPS));
      } catch {
        // a page pdf.js cannot read is a page with nothing read, said so in its record
        geos.push({ n, w: 612, h: 792, items: [], images: [] });
      }
      page.cleanup?.();
      last = n;
    }
    let title: string | undefined;
    try {
      const meta = await doc.getMetadata?.();
      const t = meta?.info?.Title;
      if (typeof t === 'string' && t.trim().length >= 3 && !/^(untitled|microsoft word|document\d*)/i.test(t.trim())) title = t.trim();
    } catch {
      title = undefined;
    }
    const body = bodySizeOf(geos);
    const laid = geos.map((g) => {
      const key = fingerprint(JSON.stringify([g.n, g.items.length, g.items.slice(0, 50).map((i) => i.s)]));
      const cached = opts.known?.get(key);
      return cached ?? layoutPage(g, { bodySize: body });
    });
    const unread = last < total ? { from: last + 1, to: total } : undefined;
    return {
      doc: assemble(laid, { id: opts.id, name: opts.name, pageCount: total, title, unread }),
      laid,
      raw: geos.map((g) => ({ n: g.n, text: rawText(g) })),
      overprints: laid.reduce((n, p) => n + p.overprints, 0),
    };
  } finally {
    await doc.destroy?.().catch(() => {});
  }
}
