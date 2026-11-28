// lib/ux-v0/design/production.ts — what a format asks of a design that can be measured on it.
//
// A design is made for somewhere: a story with a platform's buttons drawn over its top and bottom, a sheet that is
// trimmed by a blade, a screen people may have asked to keep still. Each of those is a fact about the place, and
// whether a design respects it can be measured on the design as drawn — never guessed:
//
//   cover       words under the part of a format the platform draws over (formats.ts `cover`)
//   margin      on a print sheet, words nearer the trim than the format's safe margin
//   resolution  on a print sheet, a picture enlarged past what its pixels can hold
//   motion      a design that moves and says nothing for those who asked for less motion
//   repetition  in a deck, most slides arranging their words the same way
//
// Each is said as a measurement with its number. None changes anything.

import type { ImageBox } from './brandcheck';
import type { TextBox } from './contrast';
import type { DesignArtboard } from './doc';
import { formatOf, type Format } from './formats';

const MM = 96 / 25.4;
const mm = (px: number) => Math.round((px / MM) * 10) / 10;
const quote = (t: string) => `“${t.slice(0, 40)}${t.length > 40 ? '…' : ''}”`;

/** The part of a format a platform draws over, as rectangles in artboard pixels. */
export function coverZones(f: Pick<Format, 'width' | 'height' | 'cover'>): { x: number; y: number; w: number; h: number; where: string }[] {
  const c = f.cover;
  if (!c) return [];
  const out: { x: number; y: number; w: number; h: number; where: string }[] = [];
  const vertical = !!(c.top || c.bottom);
  const horizontal = !!(c.left || c.right);
  if (vertical && horizontal) {
    // a corner: where the two meet
    const w = (c.right ?? c.left)!;
    const h = (c.bottom ?? c.top)!;
    out.push({ x: c.right ? f.width - w : 0, y: c.bottom ? f.height - h : 0, w, h, where: `the ${c.bottom ? 'bottom' : 'top'}-${c.right ? 'right' : 'left'} corner` });
    return out;
  }
  if (c.top) out.push({ x: 0, y: 0, w: f.width, h: c.top, where: `the top ${c.top} px` });
  if (c.bottom) out.push({ x: 0, y: f.height - c.bottom, w: f.width, h: c.bottom, where: `the bottom ${c.bottom} px` });
  if (c.left) out.push({ x: 0, y: 0, w: c.left, h: f.height, where: `the left ${c.left} px` });
  if (c.right) out.push({ x: f.width - c.right, y: 0, w: c.right, h: f.height, where: `the right ${c.right} px` });
  return out;
}

/** Words where the format's place does not let them be read or kept (see the head of this file). */
export function placementFacts(a: Pick<DesignArtboard, 'format' | 'width' | 'height' | 'medium'>, texts: readonly TextBox[]): string[] {
  const f = formatOf(a.format);
  if (!f) return [];
  const out: string[] = [];
  const zones = a.width === f.width && a.height === f.height ? coverZones(f) : [];
  for (const t of texts) {
    if (t.w < 4 || t.h < 4) continue;
    for (const z of zones) {
      const ox = Math.min(t.x + t.w, z.x + z.w) - Math.max(t.x, z.x);
      const oy = Math.min(t.y + t.h, z.y + z.h) - Math.max(t.y, z.y);
      // (more than a brush with the zone: a third of the line's height inside it)
      if (ox > 4 && oy > Math.min(t.h / 3, 24)) {
        out.push(`under the platform's interface, measured: ${quote(t.text)} (data-sx="${t.id}") sits in ${z.where} of this format, where ${f.cover!.why}`);
        break;
      }
    }
    if (a.medium === 'print' && f.safe > 0) {
      const inside = t.x >= 0 && t.y >= 0 && t.x + t.w <= a.width && t.y + t.h <= a.height;
      const near = Math.min(t.x, t.y, a.width - (t.x + t.w), a.height - (t.y + t.h));
      if (inside && near < f.safe - 2) out.push(`too near the trim, measured: ${quote(t.text)} (data-sx="${t.id}") is ${mm(Math.max(0, near))} mm from the edge the sheet is cut at; this format keeps words ${Math.round(mm(f.safe) * 2) / 2} mm in`);
    }
  }
  return out.slice(0, 6);
}

/** Pictures on a print sheet enlarged past what their pixels hold. */
export function resolutionFacts(a: Pick<DesignArtboard, 'medium'>, images: readonly ImageBox[]): string[] {
  if (a.medium !== 'print') return [];
  const out: string[] = [];
  for (const im of images) {
    if (im.vec || !im.nw || !im.w || im.w < 60) continue;
    const ppi = Math.round(im.nw / (im.w / 96));
    if (ppi < 150) out.push(`too coarse for print, measured: the picture (data-sx="${im.id}") is ${im.nw} px wide and printed ${mm(im.w)} mm wide — about ${ppi} pixels to the inch, where print wants 300 and 150 is the least that holds`);
  }
  return out.slice(0, 4);
}

/** Whether an artboard moves (its CSS animates something). */
export const moves = (a: Pick<DesignArtboard, 'html' | 'seconds'>) => !!a.seconds || /@keyframes\b/i.test(a.html);

/** A design that moves, with nothing said for people who asked for less motion. */
export function motionFacts(a: Pick<DesignArtboard, 'html' | 'seconds'>): string[] {
  if (!moves(a)) return [];
  const out: string[] = [];
  if (!/@media[^{]*prefers-reduced-motion/i.test(a.html)) out.push('it moves, and gives nothing to people who have asked for less motion: add @media (prefers-reduced-motion: reduce) that shows the finished design, still');
  if (/animation[^;{}]*\binfinite\b/i.test(a.html) && a.seconds) out.push(`an animation on it runs forever, but it is ${a.seconds} s long: what is exported stops there, mid-loop unless the loop divides into it`);
  return out;
}

/** How an artboard arranges its words: each run of words as a cell of a coarse grid, with how large it is set. */
export function layoutSignature(texts: readonly TextBox[], w: number, h: number): string[] {
  return texts
    .filter((t) => t.w > 8 && t.h > 8)
    .map((t) => `${Math.round((t.x / w) * 8)}:${Math.round((t.y / h) * 8)}:${Math.round((t.w / w) * 4)}:${t.size >= 60 ? 'L' : t.size >= 28 ? 'M' : 'S'}`)
    .sort();
}

const alike = (a: readonly string[], b: readonly string[]) => {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  const both = b.filter((x) => set.has(x)).length;
  return both / (a.length + b.length - both);
};

/**
 * In a set of slides, the largest group that arranges its words the same way — reported when it is most of them
 * (a deck that repeats one layout). Null when the slides differ, or there are too few to say.
 */
export function repeatedLayout(signatures: Readonly<Record<string, readonly string[]>>): { ids: string[]; of: number } | null {
  const ids = Object.keys(signatures).filter((k) => signatures[k].length > 0);
  if (ids.length < 4) return null;
  let best: string[] = [];
  for (const a of ids) {
    const group = ids.filter((b) => alike(signatures[a], signatures[b]) >= 0.75);
    if (group.length > best.length) best = group;
  }
  return best.length >= Math.max(3, Math.ceil(ids.length * 0.6)) ? { ids: best, of: ids.length } : null;
}

export const repetitionSaid = (r: { ids: string[]; of: number }) => `one arrangement repeated, measured: ${r.ids.length} of these ${r.of} slides set their words in the same places at the same sizes; a deck argues better when a slide's layout follows what it has to say`;
