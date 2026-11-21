// lib/ux-v0/dsi/import-pdf.ts — brand guidelines from a PDF.
//
// pdf.js (through unpdf, already a dependency) reads the document with scripting and eval off; nothing in the PDF is
// run. Its text arrives as positioned runs, rebuilt here into blocks the way a reader sees them: runs on one baseline
// joined, a wide gap starting a new cell, cells stacked in one column joined into a block (so a row of swatches stays
// a row of separate colours), large type read as headings. The colours the document fills shapes with are listed per
// page, so a swatch drawn without a written value can still be read (./guidelines.ts says how it is matched, and
// labels it). Pictures are counted, not extracted: a logo inside a PDF is not a usable master, and that is said.
// A PDF without text (a scan) is said too: SocriaUX does not read words out of pictures.

import { guidelinesContent, readGuidelines, type GBlock } from './guidelines';
import { finish, type ImportIssue, type ImportResult } from './import-json';
import type { SourceRef } from './schema';

export const MAX_PDF = 15_000_000;
export const MAX_PDF_PAGES = 60;

interface Item {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface Cell {
  text: string;
  x: number;
  y: number;
  end: number;
  size: number;
  page: number;
}

export interface PdfExtract {
  pages: number;
  read: number;
  blocks: GBlock[];
  fills: { hex: string; page: number; count: number }[];
  images: number;
  chars: number;
}

/** Positioned text runs as cells and blocks, in reading order (see the head of this file). */
export function blocksFromItems(pageItems: { page: number; items: Item[] }[]): GBlock[] {
  const cells: Cell[] = [];
  for (const { page, items } of pageItems) {
    const runs = items
      .filter((it) => typeof it.str === 'string' && it.str.trim())
      .map((it) => {
        const t = it.transform;
        const size = Math.abs(t[3]) || Math.hypot(t[2], t[3]) || it.height || 10;
        return { str: it.str, x: t[4], y: t[5], w: it.width || it.str.length * size * 0.5, size };
      })
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let cur: Cell | null = null;
    for (const r of runs) {
      if (cur && Math.abs(r.y - cur.y) <= cur.size * 0.35 && r.x <= cur.end + cur.size * 1.2 && r.x >= cur.x - 1) {
        const gap = r.x - cur.end;
        cur.text += (gap > cur.size * 0.12 && !cur.text.endsWith(' ') && !r.str.startsWith(' ') ? ' ' : '') + r.str;
        cur.end = Math.max(cur.end, r.x + r.w);
        cur.size = Math.max(cur.size, r.size);
      } else {
        if (cur) cells.push(cur);
        cur = { text: r.str, x: r.x, y: r.y, end: r.x + r.w, size: r.size, page };
      }
    }
    if (cur) cells.push(cur);
  }
  // body size: the size most text is set in
  const weights = new Map<number, number>();
  for (const c of cells) weights.set(Math.round(c.size), (weights.get(Math.round(c.size)) ?? 0) + c.text.length);
  const body = [...weights].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
  // headings: large type, or slightly larger short lines that do not end a sentence (subheads)
  const isHeading = (c: Cell) => (c.size >= body * 1.3 && c.text.trim().length <= 90) || (c.size >= body * 1.12 && c.text.trim().length <= 60 && !/[.,;:]$/.test(c.text.trim()));
  type B = { cells: Cell[]; x: number; lastY: number; size: number; page: number; heading: boolean };
  const blocks: B[] = [];
  for (const page of [...new Set(cells.map((c) => c.page))]) {
    const open: B[] = [];
    for (const c of cells.filter((x) => x.page === page).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const h = isHeading(c);
      // a heading that wraps stays one heading; body text joins the block above it in the same column
      const fit = h
        ? open.find((b) => b.heading && Math.abs(b.x - c.x) <= 6 && b.lastY - c.y > 0 && b.lastY - c.y <= b.size * 1.6 && Math.abs(b.size - c.size) < 1)
        : open.find((b) => !b.heading && Math.abs(b.x - c.x) <= 6 && b.lastY - c.y > 0 && b.lastY - c.y <= b.size * 2.2 && Math.abs(b.size - c.size) < 2.5);
      if (fit) {
        fit.cells.push(c);
        fit.lastY = c.y;
      } else {
        const nb: B = { cells: [c], x: c.x, lastY: c.y, size: c.size, page, heading: h };
        blocks.push(nb);
        open.push(nb);
      }
    }
  }
  const top = (b: B) => b.cells[0].y;
  blocks.sort((a, b) => a.page - b.page || Math.round((top(b) - top(a)) / 4) || a.x - b.x);
  return blocks.map((b, id) => ({ id, page: b.page, lines: b.heading ? [b.cells.map((c) => c.text.replace(/\s+/g, ' ').trim()).join(' ')] : b.cells.map((c) => c.text.replace(/\s+/g, ' ').trim()), ...(b.heading ? { heading: true, level: b.size >= body * 2.4 ? 1 : b.size >= body * 1.3 ? 2 : 3 } : {}) }));
}

const toHex = (args: unknown[]): string | null => {
  const a = args?.[0];
  if (typeof a === 'string' && /^#[0-9a-f]{6}$/i.test(a)) return a.toLowerCase();
  if (args?.length >= 3 && args.slice(0, 3).every((x) => typeof x === 'number')) {
    const nums = (args.slice(0, 3) as number[]).map((x) => (x <= 1 ? x * 255 : x));
    return `#${nums.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
  }
  return null;
};

/** A PDF's text blocks, the colours it fills shapes with, and how many pictures it holds. */
export async function extractPdf(bytes: Uint8Array): Promise<PdfExtract> {
  const { getDocumentProxy, getResolvedPDFJS } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false } as never);
  const { OPS } = (await getResolvedPDFJS()) as unknown as { OPS: Record<string, number> };
  const pages = pdf.numPages;
  const read = Math.min(pages, MAX_PDF_PAGES);
  const pageItems: { page: number; items: Item[] }[] = [];
  const fillCount = new Map<string, { hex: string; page: number; count: number }>();
  let images = 0;
  let chars = 0;
  for (let n = 1; n <= read; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const items = (tc.items as unknown[]).filter((x): x is Item => !!x && typeof (x as Item).str === 'string');
    chars += items.reduce((s, i) => s + i.str.length, 0);
    pageItems.push({ page: n, items });
    const ol = await page.getOperatorList();
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i];
      if (fn === OPS.setFillRGBColor) {
        const hex = toHex(ol.argsArray[i] as unknown[]);
        if (hex) {
          const k = `${n}|${hex}`;
          const e = fillCount.get(k) ?? { hex, page: n, count: 0 };
          e.count++;
          fillCount.set(k, e);
        }
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) images++;
    }
    page.cleanup();
  }
  await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  return { pages, read, blocks: blocksFromItems(pageItems), fills: [...fillCount.values()], images, chars };
}

/** Brand guidelines from a PDF, as a system's content with every fact's page and words (see ./guidelines.ts). */
export async function importPdf(input: { name: string; bytes: Uint8Array }, opts: { now?: number; ref?: string } = {}): Promise<ImportResult & { facts?: ReturnType<typeof readGuidelines> }> {
  const now = opts.now ?? Date.now();
  const issues: ImportIssue[] = [];
  const notes = new Set<string>();
  const src: SourceRef = { kind: 'pdf', ref: opts.ref ?? input.name, file: input.name };
  if (input.bytes.length > MAX_PDF) {
    issues.push({ severity: 'error', file: input.name, message: `${input.name} is larger than ${MAX_PDF / 1_000_000} MB.`, fix: 'Export the guidelines without high-resolution pictures, or import the colour and typography pages only.' });
    return finish({ ...(await import('./schema')).emptyContent(input.name) }, 'pdf', issues, notes, now);
  }
  if (!(input.bytes[0] === 0x25 && input.bytes[1] === 0x50 && input.bytes[2] === 0x44 && input.bytes[3] === 0x46)) {
    issues.push({ severity: 'error', file: input.name, message: `${input.name} is not a PDF, whatever its name says.` });
    return finish((await import('./schema')).emptyContent(input.name), 'pdf', issues, notes, now);
  }
  let ex: PdfExtract;
  try {
    ex = await extractPdf(input.bytes);
  } catch (e) {
    issues.push({ severity: 'error', file: input.name, message: `${input.name} could not be read as a PDF${e instanceof Error && /password/i.test(e.message) ? ': it is protected by a password' : ''}.`, fix: 'Export it again without a password or restrictions.' });
    return finish((await import('./schema')).emptyContent(input.name), 'pdf', issues, notes, now);
  }
  if (ex.pages > ex.read) notes.add(`Only the first ${ex.read} of ${ex.pages} pages were read.`);
  if (ex.chars < 40) {
    issues.push({ severity: 'error', file: input.name, message: `${input.name} has no readable text: it may be scanned pages. SocriaUX does not read words out of pictures.`, fix: 'Export the guidelines from the original document so the text is real text.' });
    return finish((await import('./schema')).emptyContent(input.name), 'pdf', issues, notes, now);
  }
  const facts = readGuidelines(ex.blocks, src, { fills: ex.fills });
  const { content, notes: n2 } = guidelinesContent(facts, src, { now });
  n2.forEach((n) => notes.add(n));
  if (ex.images) notes.add(`The PDF holds ${ex.images} picture${ex.images === 1 ? '' : 's'}; logos inside it were not extracted (a logo in a PDF is not a usable master). Import the logo files themselves (SVG).`);
  notes.add(`Read ${ex.read} page${ex.read === 1 ? '' : 's'}: ${facts.colours.length} colours, ${facts.fonts.length} typefaces, ${facts.sizes.length} type sizes, ${facts.items.length} statements and rules — each with its page and the words it came from.`);
  const r = finish(content, 'pdf', issues, notes, now);
  return { ...r, facts };
}
