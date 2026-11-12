// lib/preview/locate.ts — WHERE A PASSAGE SITS IN THE ORIGINAL.
//
// The reading (lib/docs) knows each passage's page and, for a PDF and a deck,
// the box it occupies on that page as fractions of the page. The preview
// draws the original. These are the small, pure pieces that join the two:
//
//   · the passage to mark when a citation or an analysis point is pressed
//     (markOf): its page, its box when the reading has one, and the words to
//     look for when it has none (a Word document is laid out afresh by the
//     preview, so its pages are not the reading's pages; a sheet's grid is not
//     a page at all);
//   · the passage under a press on a page (blockAt): the smallest box that
//     holds the point — so pressing a paragraph in the original picks that
//     paragraph to ask about;
//   · where to draw the mark (markRect), in the page's own pixels, with a
//     little room around the words;
//   · the words a passage is found by in rendered text (needleOf, fold), so a
//     search survives the original's own line breaks, hyphens and quotes.
//
// PURE.

import type { Box, DocBlock, SourceDoc } from '@/lib/docs/types';

export interface Mark {
  /** the document and the passage */
  doc: string;
  block: string;
  /** the reading's page (slide, sheet) */
  page: number;
  /** its box on the page, when the reading has one */
  box?: Box;
  /** its words, as read */
  text: string;
  /** what kind of passage it is */
  kind: DocBlock['kind'];
  /** a new press, even on the same passage, moves the view again */
  seq: number;
}

const SKIP = new Set(['header', 'footer']);

/** The mark for a passage of a document, or null when the document has no such passage. */
export function markOf(doc: SourceDoc, blockId: string, seq = 1): Mark | null {
  const b = doc.blocks.find((x) => x.id === blockId);
  if (!b) return null;
  return { doc: doc.id, block: b.id, page: b.page, ...(validBox(b.box) ? { box: b.box } : {}), text: b.text, kind: b.kind, seq };
}

export function validBox(box: unknown): box is Box {
  return (
    Array.isArray(box) &&
    box.length === 4 &&
    box.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= -0.01 && v <= 1.01) &&
    box[2] > box[0] &&
    box[3] > box[1]
  );
}

/**
 * The passage under a point on a page (fractions of the page, from the top
 * left): the smallest box that holds it. Running heads and feet are never
 * picked; a passage with no box cannot be. Null when nothing is there.
 */
export function blockAt(doc: SourceDoc, page: number, fx: number, fy: number): DocBlock | null {
  let best: DocBlock | null = null;
  let area = Infinity;
  for (const b of doc.blocks) {
    if (b.page !== page || SKIP.has(b.kind) || !validBox(b.box)) continue;
    const [x0, y0, x1, y1] = b.box;
    // a little give at the edges, as a finger is wider than a cursor
    if (fx < x0 - 0.008 || fx > x1 + 0.008 || fy < y0 - 0.006 || fy > y1 + 0.006) continue;
    const a = (x1 - x0) * (y1 - y0);
    if (a < area) {
      area = a;
      best = b;
    }
  }
  return best;
}

/** Whether any passage on a page can be picked by pressing it. */
export const pickable = (doc: SourceDoc | null | undefined, page: number) => !!doc?.blocks.some((b) => b.page === page && !SKIP.has(b.kind) && validBox(b.box));

/** Where to draw a box on a page drawn `w` × `h` pixels: a rectangle with `pad` pixels of room, kept on the page. */
export function markRect(box: Box, w: number, h: number, pad = 4): { left: number; top: number; width: number; height: number } {
  const left = Math.max(0, box[0] * w - pad);
  const top = Math.max(0, box[1] * h - pad);
  const right = Math.min(w, box[2] * w + pad);
  const bottom = Math.min(h, box[3] * h + pad);
  return { left: Math.round(left), top: Math.round(top), width: Math.max(2, Math.round(right - left)), height: Math.max(2, Math.round(bottom - top)) };
}

/** Text folded for finding: quotes and dashes plain, soft hyphens and breaks gone, spaces collapsed, case off. */
export function fold(s: string): string {
  return s
    .replace(/­/g, '')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const LIST_MARK = /^(?:\(?(?:\d{1,3}|[a-z]|[ivxlc]{1,5})[.)]|[-*•▪◦·])\s+/;

/**
 * The words a passage is looked for by in rendered text: its opening, folded,
 * long enough to be unlikely anywhere else and short enough to sit inside
 * one paragraph of the original. Empty for a passage with too few words to
 * find reliably.
 */
export function needleOf(text: string, max = 64): string {
  // a list item's own number or bullet ("4.", "(b)", "iii)", "•") is drawn by the list in rendered text, not written in it
  const f = fold(text).replace(LIST_MARK, '');
  if (f.replace(/[^a-z0-9]/g, '').length < 6) return '';
  if (f.length <= max) return f;
  const cut = f.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return sp > max * 0.5 ? cut.slice(0, sp) : cut;
}

/** The first of `texts` (an element's text, in order) that holds the needle — its index, or -1. */
export function firstHolding(texts: readonly string[], needle: string): number {
  if (!needle) return -1;
  for (let i = 0; i < texts.length; i++) if (fold(texts[i]).includes(needle)) return i;
  // a passage that runs across two elements of the original (a line broken by the layout): its first words alone
  const short = needle.split(' ').slice(0, 5).join(' ');
  if (short.length < 12) return -1;
  for (let i = 0; i < texts.length; i++) if (fold(texts[i]).includes(short)) return i;
  return -1;
}

/** The page word for a document's format. */
export const unitOf = (format: string) => (format === 'pptx' || format === 'odp' ? 'Slide' : format === 'xlsx' || format === 'ods' ? 'Sheet' : 'Page');
