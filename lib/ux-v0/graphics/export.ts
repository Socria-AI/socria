// lib/ux-v0/graphics/export.ts — a graphic as files: SVG, PDF and SocriaUX's own editable file.
//
//   SVG    the artboard as drawn (text stays text, vectors stay vectors), its faces linked from Google Fonts (a
//          browser that opens the file loads them; offline, a fallback face stands in — said in the export notes)
//   PDF    one page per artboard at its exact size (print artboards in points; screens at 96 px to the inch), the
//          bleed around the trim when asked (with TrimBox and BleedBox set), each page a high-resolution picture of
//          the artboard. Not vector, no embedded fonts, RGB only: said plainly, never claimed otherwise.
//   native the document itself (lib/ux-v0/graphics/doc.ts), with its pictures inside, to open again and edit
//
// The PDF writer has no dependency: a PDF of image pages is a few dozen lines of the format. The pictures it is
// given (JPEG) come from the browser (lib/ux-v0/graphics/raster.ts) or, in tests, from anywhere.

import { graphicFontStylesheet } from '../fonts';
import { normalizeDoc, walk, type Artboard, type GraphicDoc, type Repair } from './doc';
import { pdfPoints } from './formats';
import { renderArtboard, type RenderOptions } from './render';

export const NATIVE_FORMAT = 'socriaux.graphic/1';

/** The faces a document uses, by name. */
export function facesOf(doc: GraphicDoc): string[] {
  const s = new Set<string>([doc.tokens.fonts.display, doc.tokens.fonts.body]);
  for (const b of doc.artboards)
    for (const l of walk(b)) {
      if (l.node.type === 'text' || l.node.type === 'chart') s.add(l.node.font);
      if (l.node.type === 'text') for (const r of l.node.runs ?? []) if (r.font) s.add(r.font);
      if (l.node.type === 'pattern' && l.node.gen === 'technical') s.add('IBM Plex Mono');
    }
  return [...s];
}

/** An artboard as an SVG file (see the head of this file). */
export function svgFile(doc: GraphicDoc, board: Artboard, opts: Omit<RenderOptions, 'guides'> & { linkFonts?: boolean } = {}): string {
  const url = opts.linkFonts === false ? null : graphicFontStylesheet(facesOf(doc));
  const fontCss = opts.fontCss ?? (url ? `@import url('${url}');` : undefined);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderArtboard(doc, board, { ...opts, fontCss, guides: false })}\n`;
}

// ── PDF ──

export interface PdfPage {
  /** a JPEG of the page (bleed included when `bleed` is) */
  jpeg: Uint8Array;
  /** the JPEG's pixel size */
  px: number;
  py: number;
  /** the trim size in points */
  w: number;
  h: number;
  /** bleed around the trim, in points (0: none) */
  bleed: number;
}

const enc = new TextEncoder();
const pdfStr = (s: string) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')})`;
const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** A PDF whose pages are the given pictures, each at its exact size (see the head of this file). */
export function pdfFromPages(pages: readonly PdfPage[], meta: { title: string; now?: number } = { title: 'Graphic' }): Uint8Array {
  if (!pages.length) throw new Error('A PDF needs at least one page.');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    length += b.length;
  };
  const text = (s: string) => push(enc.encode(s));
  const obj = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = length;
    text(`${id} 0 obj\n`);
    if (typeof body === 'string') text(body);
    else for (const b of body) push(b);
    text('\nendobj\n');
  };
  text('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  // 1 catalog, 2 pages, 3 info; each page: page, content, image
  const pageIds = pages.map((_, i) => 4 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  const d = new Date(meta.now ?? Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  obj(3, `<< /Title ${pdfStr(meta.title)} /Producer (SocriaUX Graphics) /Creator (SocriaUX) /CreationDate (D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z) >>`);
  pages.forEach((p, i) => {
    const id = pageIds[i];
    const W = p.w + p.bleed * 2;
    const H = p.h + p.bleed * 2;
    const boxes = p.bleed ? ` /TrimBox [${f2(p.bleed)} ${f2(p.bleed)} ${f2(p.bleed + p.w)} ${f2(p.bleed + p.h)}] /BleedBox [0 0 ${f2(W)} ${f2(H)}]` : '';
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(W)} ${f2(H)}]${boxes} /Resources << /XObject << /Im${i} ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    const content = `q ${f2(W)} 0 0 ${f2(H)} 0 0 cm /Im${i} Do Q`;
    obj(id + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(id + 2, [enc.encode(`<< /Type /XObject /Subtype /Image /Width ${p.px} /Height ${p.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`), p.jpeg, enc.encode('\nendstream')]);
  });
  const xref = length;
  const size = 4 + pages.length * 3;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) table += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  text(`${table}trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The trim size of an artboard in PDF points, and its bleed. */
export function pageSize(b: Artboard, withBleed: boolean): { w: number; h: number; bleed: number } {
  const p = pdfPoints(b);
  const k = b.unit === 'pt' ? 1 : 0.75;
  return { w: p.w, h: p.h, bleed: withBleed ? b.bleed * k : 0 };
}

// ── the editable file ──

/** The document as a file to open again (its pictures inside, given as data addresses by the caller). */
export function nativeFile(doc: GraphicDoc): string {
  return `${JSON.stringify({ format: NATIVE_FORMAT, savedAt: new Date(doc.updatedAt).toISOString(), doc }, null, 1)}\n`;
}

/** A native file opened: the document held to its shape, what was repaired said; null when it is not one. */
export function openNativeFile(text: string): { doc: GraphicDoc; notes: string[] } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (r.format !== NATIVE_FORMAT) return null;
  const rep: Repair = { notes: [] };
  const doc = normalizeDoc(r.doc, rep);
  return doc ? { doc, notes: rep.notes } : null;
}
