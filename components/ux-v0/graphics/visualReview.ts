'use client';
// components/ux-v0/graphics/visualReview.ts — the artboard rendered to pixels in this browser and reviewed from them.
//
// The same SVG the canvas shows is drawn twice into an off-screen canvas — as it is, and without its words — with its
// pictures and faces put inside it (as for export), and the two renders are measured (lib/ux-v0/graphics/visual.ts).
// The repairs the review carries (a text recoloured to read on what is really beneath it, a quiet panel where no colour
// would) can be applied and the design reviewed again, a bounded number of times. When a face could not be fetched, the
// render used a stand-in face and the report says so. Nothing leaves the browser except those fetches.

import { applyOps, boardView, fromBoardView, type Artboard, type GraphicDoc, type Node } from '@/lib/ux-v0/graphics/doc';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import { embeddedAssets, embeddedFonts } from '@/lib/ux-v0/graphics/raster';
import { facesOf } from '@/lib/ux-v0/graphics/export';
import { repairsOf, reviewPixels, type Pixels, type VisualReport } from '@/lib/ux-v0/graphics/visual';
import type { Measure } from '@/lib/ux-v0/graphics/text';

async function pixelsOf(svg: string, w: number, h: number): Promise<Pixels> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('The design could not be drawn as a picture.'));
      img.src = url;
    });
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This browser cannot draw the picture.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The artboard with its words hidden (what is beneath them). */
const withoutWords = (b: Artboard): Artboard => {
  const hide = (n: Node): Node => (n.type === 'text' ? ({ ...n, hidden: true } as Node) : n.type === 'group' ? ({ ...n, children: n.children.map(hide) } as Node) : n);
  return { ...b, children: b.children.map(hide) };
};

export interface Reviewed {
  report: VisualReport;
  /** a stand-in face was used where a face could not be fetched */
  fontsSubstituted: boolean;
  ms: number;
}

export interface ReviewOptions {
  measure: Measure;
  resolve: (src: string) => Promise<Blob | null>;
  /** the longest side of the renders, in pixels */
  maxSide?: number;
}

/** The artboard rendered and reviewed from its pixels; null where the browser cannot draw it. */
export async function reviewBoard(doc: GraphicDoc, boardId: string, o: ReviewOptions): Promise<Reviewed | null> {
  if (typeof document === 'undefined') return null;
  const t0 = performance.now();
  const view = boardView(doc, boardId);
  const board = view.artboards.find((b) => b.id === boardId);
  if (!board) return null;
  try {
    const k = (o.maxSide ?? 560) / Math.max(board.width, board.height);
    const w = Math.max(16, Math.round(board.width * k));
    const h = Math.max(16, Math.round(board.height * k));
    const fonts = await embeddedFonts(facesOf(view));
    const assets = await embeddedAssets(view, o.resolve);
    const opts = { measure: o.measure, href: (id: string, src: string) => assets.map.get(id) ?? src, fontCss: fonts.css };
    const full = await pixelsOf(renderArtboard(view, board, { ...opts, idPrefix: `vr-${board.id}-` }), w, h);
    const ground = await pixelsOf(renderArtboard(view, withoutWords(board), { ...opts, idPrefix: `vg-${board.id}-` }), w, h);
    return { report: reviewPixels(view, board, full, ground, k, o.measure), fontsSubstituted: !fonts.ok, ms: Math.round(performance.now() - t0) };
  } catch {
    return null;
  }
}

export interface Repaired {
  doc: GraphicDoc;
  /** the last review (of the design as returned) */
  report: VisualReport;
  /** what was repaired, said */
  fixed: string[];
  rounds: number;
  fontsSubstituted: boolean;
}

/** Review, repair what the review can repair, review again — at most `rounds` times; the design as it then is. */
export async function reviewAndRepair(doc: GraphicDoc, boardId: string, o: ReviewOptions & { rounds?: number }): Promise<Repaired | null> {
  let cur = doc;
  const fixed: string[] = [];
  let last: Reviewed | null = null;
  let rounds = 0;
  for (let i = 0; i <= (o.rounds ?? 2); i++) {
    last = await reviewBoard(cur, boardId, o);
    if (!last) return null;
    const ops = repairsOf(last.report);
    if (!ops.length || i === (o.rounds ?? 2)) break;
    const view = boardView(cur, boardId);
    const r = applyOps(view, ops);
    if (!r.ok) break;
    fixed.push(...last.report.findings.filter((f) => f.fix && f.severity !== 'low').map((f) => f.message));
    cur = fromBoardView(cur, r.doc, boardId);
    rounds++;
  }
  return last ? { doc: cur, report: last.report, fixed, rounds, fontsSubstituted: last.fontsSubstituted } : null;
}

/** A review said in a sentence or two: what was measured, what was repaired, what is left. */
export function saidOf(r: Repaired | Reviewed, opts: { fixedLead?: string } = {}): string {
  const report = r.report;
  const legible = report.measures.legibility;
  const worst = legible.length ? legible.reduce((a, b) => (b.ratio / b.need < a.ratio / a.need ? b : a)) : null;
  const fixed = 'fixed' in r ? r.fixed : [];
  const left = report.findings.filter((f) => f.severity !== 'low');
  if (!fixed.length && !left.length) return `Checked the rendered pixels: every text reads against what is really beneath it${worst ? ` (the hardest at ${worst.ratio}:1)` : ''}.`;
  return [
    `Checked the rendered pixels (${report.size[0]}×${report.size[1]}${r.fontsSubstituted ? ', with a stand-in face where a face could not be fetched' : ''}): ${legible.length} text${legible.length === 1 ? '' : 's'} measured against what is really beneath ${legible.length === 1 ? 'it' : 'them'}${worst ? `, the hardest to read at ${worst.ratio}:1 (${worst.need}:1 needed)` : ''}.`,
    fixed.length ? `${opts.fixedLead ?? 'Repaired'}: ${fixed.slice(0, 2).map((m) => m.replace(/\.$/, '')).join('; ')}.` : '',
    left.length ? `Still to look at: ${left.slice(0, 2).map((f) => f.message.replace(/\.$/, '')).join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
