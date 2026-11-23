// lib/ux-v0/graphics/visual.ts — the design judged by its rendered pixels, not only by its objects.
//
// The structural checks (check.ts) read the objects: a text's colour against the fills its box overlaps. They cannot
// see what a gradient, a texture, a picture or a cloud really puts behind the words, or how the finished picture
// weighs, so this reads the picture itself. Two renders of the artboard are given (made in the browser:
// components/ux-v0/graphics/visualReview.ts): the design as it is, and the design without its words. From them:
//   legibility  for every text, the colours really beneath its lines (sampled from the render without words) and the
//               contrast of its colour against the worst tenth of them — what a reader meets at the hardest point;
//   weight      where the picture's visual weight sits (the luminance difference from the ground, its centre of mass);
//   coverage    how much of the frame is drawn on, and how much is left open;
//   clutter     how much of it is edges (busy texture against calm areas);
//   focus       whether the headline is where the eye goes: the strongest region of contrast, and the headline's share.
// Each finding says what was measured and, where it can, carries the repair: a text recoloured to the ink that reads
// on everything beneath it, or a quiet panel behind it when no ink would. Deterministic, measured from pixels. It is
// pixel analysis, said as such: nothing here claims to see the design the way a person or a model does.

import { contrastRatio } from '../../ux/audit';
import { boxOnBoard, newId, walk, type Artboard, type GraphicDoc, type Node, type Op, type TextNode } from './doc';
import { approxMeasure, layoutText, type Measure } from './text';
import { inkOnAll } from './check';
import { colorAt } from './paint';

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, row by row */
  data: Uint8ClampedArray | number[];
}

export type VisualKind = 'legibility' | 'weight' | 'coverage' | 'clutter' | 'focus';

export interface VisualFinding {
  kind: VisualKind;
  severity: 'high' | 'medium' | 'low';
  node?: string;
  message: string;
  /** what was measured, in numbers */
  measured: string;
  /** operations that repair it, when the repair takes nothing away */
  fix?: Op[];
}

export interface VisualReport {
  method: 'pixels';
  /** the size the renders were analysed at */
  size: [number, number];
  findings: VisualFinding[];
  measures: {
    legibility: { node: string; name: string; ratio: number; need: number }[];
    /** the centre of visual weight, 0–1 */
    weight: [number, number];
    /** share of the frame drawn on */
    coverage: number;
    /** share of the frame that is edge */
    clutter: number;
    /** the headline's share of the strongest contrast, 0–1 (1: it is where the eye goes) */
    focus: number | null;
  };
}

const lum = (r: number, g: number, b: number) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const hexOf = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const px = (p: Pixels, x: number, y: number): [number, number, number, number] => {
  const i = (Math.max(0, Math.min(p.height - 1, y)) * p.width + Math.max(0, Math.min(p.width - 1, x))) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
};

/** Where the words of a text really are on the artboard (its lines, aligned), not the whole box. */
export function wordsArea(t: TextNode, board: Artboard, measure: Measure = approxMeasure, located?: ReturnType<typeof walk>[number]): { x: number; y: number; w: number; h: number } {
  const l = located ?? walk(board).find((x) => x.node.id === t.id);
  const b = l ? boxOnBoard(l) : { x: t.x, y: t.y, w: t.w, h: t.h };
  if (t.vertical || t.rotation || t.path) return b;
  const L = layoutText(t, measure);
  const w = Math.min(b.w, L.widest || b.w);
  const h = Math.min(b.h, L.height || b.h);
  const x = t.align === 'center' ? b.x + (b.w - w) / 2 : t.align === 'right' ? b.x + b.w - w : b.x;
  const y = t.valign === 'middle' ? b.y + (b.h - h) / 2 : t.valign === 'bottom' ? b.y + b.h - h : b.y;
  return { x, y, w, h };
}

/** The colours beneath an area of the artboard (sampled on a grid from the render without words), darkest-to-lightest. */
function beneath(ground: Pixels, area: { x: number; y: number; w: number; h: number }, k: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const x0 = Math.floor(area.x * k);
  const y0 = Math.floor(area.y * k);
  const x1 = Math.ceil((area.x + area.w) * k);
  const y1 = Math.ceil((area.y + area.h) * k);
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 14));
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    const [r, g, b, a] = px(ground, x, y);
    if (a > 8) out.push([r, g, b]);
  }
  return out.sort((p, q) => lum(...p) - lum(...q));
}

/** The large-text threshold (WCAG: 18 pt, or 14 pt bold), in the artboard's own units. */
const isLarge = (t: TextNode, board: Artboard) => {
  const pt = board.unit === 'pt' ? t.size : t.size * 0.75;
  return pt >= 18 || (pt >= 14 && t.weight >= 700);
};

/**
 * The review: `full` is the artboard as it is, `ground` the artboard without its words, both rendered at `k` pixels per
 * artboard unit (the same size). Findings are ranked, most serious first.
 */
export function reviewPixels(doc: GraphicDoc, board: Artboard, full: Pixels, ground: Pixels, k: number, measure: Measure = approxMeasure): VisualReport {
  const findings: VisualFinding[] = [];
  const legibility: VisualReport['measures']['legibility'] = [];
  const located = walk(board);
  const texts = located.filter((l) => l.node.type === 'text' && !l.node.hidden && !(l.node as TextNode).decorative && (l.node as TextNode).text.trim()) as (ReturnType<typeof walk>[number] & { node: TextNode })[];
  const palette = [doc.tokens.colors.text, doc.tokens.colors.background, doc.tokens.colors.accent, doc.tokens.colors.muted, '#111111', '#ffffff'];
  // 1. legibility: the text's colour against what is really beneath its lines
  for (const l of texts) {
    const t = l.node;
    if (t.fill === null || !/^#[0-9a-f]{6}/i.test(t.color)) continue;
    const area = wordsArea(t, board, measure, l);
    const under = beneath(ground, area, k);
    if (under.length < 4) continue;
    // the worst tenth: what a reader meets at the hardest point of the line
    const worst = under.slice(0, Math.max(1, Math.floor(under.length * 0.1)));
    const best = under.slice(-Math.max(1, Math.floor(under.length * 0.1)));
    const tl = lum(...([1, 3, 5].map((i) => parseInt(t.color.slice(i, i + 2), 16)) as [number, number, number]));
    const ratioOf = (c: [number, number, number]) => {
      const bl = lum(...c);
      return (Math.max(tl, bl) + 0.05) / (Math.min(tl, bl) + 0.05);
    };
    const ratio = Math.min(...[...worst, ...best].map(ratioOf));
    const need = isLarge(t, board) ? 3 : 4.5;
    const name = (t.name ?? t.role ?? 'text').toString();
    legibility.push({ node: t.id, name, ratio: Math.round(ratio * 10) / 10, need });
    if (ratio >= need) continue;
    const samples = [...worst, ...best, under[Math.floor(under.length / 2)]].map((c) => hexOf(...c));
    const ink = inkOnAll(t.color.slice(0, 7), samples, need, palette);
    const spread = contrastRatio(samples[0], samples[samples.length - 1]);
    let fix: Op[] | undefined;
    // one colour when one reads well on all of it; a ground that runs from light to dark beneath the words only lets a
    // grey scrape through on both sides, so it gets a quiet panel instead
    if (ink.ratio >= need && !(spread > 4 && ink.ratio < need * 1.5) && !t.locked) fix = [{ op: 'update', id: t.id, set: { color: ink.color } }];
    else if (!t.locked) {
      // no ink reads on all of it (a busy ground): a quiet panel of the ground's own colour beneath the words
      const pad = Math.max(4, t.size * 0.35);
      const panel = doc.tokens.colors.background;
      const at = board.children.findIndex((n) => n.id === t.id || walk({ ...board, children: [n] }).some((x) => x.node.id === t.id));
      fix = [
        { op: 'add', artboard: board.id, index: Math.max(0, at), node: { id: newId('vp'), type: 'shape', shape: 'rect', role: 'decoration', name: `Panel behind ${name}`, decorative: true, x: area.x - pad, y: area.y - pad, w: area.w + pad * 2, h: area.h + pad * 2, rotation: 0, opacity: 0.9, fill: panel, radius: Math.min(12, pad) } as unknown as Node },
        { op: 'update', id: t.id, set: { color: inkOnAll(t.color.slice(0, 7), [panel], need, palette).color } },
      ];
    }
    findings.push({
      kind: 'legibility',
      severity: ratio < need * 0.67 ? 'high' : 'medium',
      node: t.id,
      message: `“${t.text.replace(/\s+/g, ' ').slice(0, 40)}” reads at ${ratio.toFixed(1)}:1 where it is hardest to read (${need}:1 needed)${spread > 2.5 ? ' — what is beneath it changes from light to dark' : ''}.`,
      measured: `${ratio.toFixed(2)}:1 against the darkest and lightest tenth of the ${under.length} points sampled beneath its lines`,
      ...(fix ? { fix } : {}),
    });
  }
  // 2–4. weight, coverage, clutter: from the full render, against the ground's own colour
  const gc = /^#[0-9a-f]{6}/i.test(board.background ?? '') ? [1, 3, 5].map((i) => parseInt((board.background as string).slice(i, i + 2), 16)) : (() => {
    const c = px(full, 1, 1);
    return [c[0], c[1], c[2]];
  })();
  // the ground as it really is at each point: a graded ground (the ground the creative engine or the composer laid
  // under everything) is followed across the frame, so a sky is not counted as something drawn on it
  const carrier = board.children.find((n) => n.type === 'shape' && !n.hidden && (n.role === 'background' || n.name === 'Creative ground') && n.x <= 1 && n.y <= 1 && n.w >= board.width * 0.98 && n.h >= board.height * 0.98) as (Node & { fill?: unknown }) | undefined;
  const grad = carrier && carrier.fill && typeof carrier.fill === 'object' && (carrier.fill as { type?: string }).type === 'linear' ? (carrier.fill as { angle?: number; stops: { at: number; color: string }[] }) : null;
  const theta = (((grad?.angle ?? 180) - 90) * Math.PI) / 180;
  const groundAt = (u: number, v: number): [number, number, number] => {
    if (!grad?.stops?.length) return [gc[0], gc[1], gc[2]];
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    const t = 0.5 + ((u - 0.5) * c + (v - 0.5) * sn) / Math.max(1e-6, Math.abs(c) + Math.abs(sn));
    const hex = colorAt(grad.stops, Math.max(0, Math.min(1, t))).slice(0, 7);
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  };
  let wx = 0;
  let wy = 0;
  let wsum = 0;
  let drawn = 0;
  let edges = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.min(full.width, full.height) / 160));
  const GX = 6;
  const GY = 8;
  const cell = new Array(GX * GY).fill(0);
  for (let y = step; y < full.height - step; y += step)
    for (let x = step; x < full.width - step; x += step) {
      const [r, g, b] = px(full, x, y);
      const L = lum(r, g, b);
      const [gr, gg, gb] = groundAt(x / full.width, y / full.height);
      const d = Math.abs(L - lum(gr, gg, gb));
      n++;
      if (d > 0.04 || Math.abs(r - gr) + Math.abs(g - gg) + Math.abs(b - gb) > 36) drawn++;
      wx += d * x;
      wy += d * y;
      wsum += d;
      // edge: the change across a step, either way
      const [r2, g2, b2] = px(full, x + step, y);
      const [r3, g3, b3] = px(full, x, y + step);
      const e = Math.abs(L - lum(r2, g2, b2)) + Math.abs(L - lum(r3, g3, b3));
      if (e > 0.12) edges++;
      cell[Math.min(GY - 1, Math.floor((y / full.height) * GY)) * GX + Math.min(GX - 1, Math.floor((x / full.width) * GX))] += e;
    }
  const weight: [number, number] = wsum > 0 ? [wx / wsum / full.width, wy / wsum / full.height] : [0.5, 0.5];
  const coverage = n ? drawn / n : 0;
  const clutter = n ? edges / n : 0;
  const off = Math.hypot(weight[0] - 0.5, weight[1] - 0.5);
  if (off > 0.26) findings.push({ kind: 'weight', severity: 'low', message: `The picture’s weight sits to the ${[weight[0] < 0.42 ? 'left' : weight[0] > 0.58 ? 'right' : '', weight[1] < 0.42 ? 'top' : weight[1] > 0.58 ? 'bottom' : ''].filter(Boolean).join(' and ') || 'side'}: fine if that is the idea, unsettled if not.`, measured: `centre of visual weight at ${Math.round(weight[0] * 100)}%, ${Math.round(weight[1] * 100)}%` });
  if (coverage > 0.78) findings.push({ kind: 'coverage', severity: 'medium', message: `Almost everything is drawn on (${Math.round(coverage * 100)}% of the frame): nothing is left open for the eye to rest.`, measured: `${Math.round(coverage * 100)}% of sampled points differ from the ground` });
  if (coverage < 0.06) findings.push({ kind: 'coverage', severity: 'low', message: `Very little is drawn (${Math.round(coverage * 100)}% of the frame): it may read as unfinished.`, measured: `${Math.round(coverage * 100)}% of sampled points differ from the ground` });
  if (clutter > 0.2) findings.push({ kind: 'clutter', severity: 'medium', message: `It is busy: ${Math.round(clutter * 100)}% of the picture is edges, so the words compete with texture.`, measured: `${Math.round(clutter * 100)}% of sampled points sit on a sharp change of tone` });
  // 5. focus: is the headline where the strongest contrast is?
  let focus: number | null = null;
  const head = texts.find((l) => l.node.role === 'headline') ?? texts.sort((a, b) => b.node.size - a.node.size)[0];
  if (head) {
    const a = wordsArea(head.node, board, measure, head);
    const total = cell.reduce((s, v) => s + v, 0) || 1;
    const top = cell.map((v, i) => ({ v, i })).sort((p, q) => q.v - p.v).slice(0, 3);
    const inHead = (i: number) => {
      const cx = ((i % GX) + 0.5) / GX;
      const cy = (Math.floor(i / GX) + 0.5) / GY;
      return cx * board.width >= a.x - board.width / GX && cx * board.width <= a.x + a.w + board.width / GX && cy * board.height >= a.y - board.height / GY && cy * board.height <= a.y + a.h + board.height / GY;
    };
    focus = Math.round((top.filter((c) => inHead(c.i)).reduce((s, c) => s + c.v, 0) / Math.max(1e-9, top.reduce((s, c) => s + c.v, 0))) * 100) / 100;
    if (focus === 0 && total > 0) findings.push({ kind: 'focus', severity: 'low', node: head.node.id, message: 'The strongest contrast is away from the headline, so the eye goes elsewhere first.', measured: 'none of the three strongest regions of contrast holds the headline' });
  }
  const order = { high: 0, medium: 1, low: 2 } as const;
  findings.sort((p, q) => order[p.severity] - order[q.severity]);
  return { method: 'pixels', size: [full.width, full.height], findings, measures: { legibility, weight, coverage: Math.round(coverage * 100) / 100, clutter: Math.round(clutter * 100) / 100, focus } };
}

/** The repairs a review carries, as one list of operations (legibility first). */
export const repairsOf = (r: VisualReport): Op[] => r.findings.filter((f) => f.fix && f.severity !== 'low').flatMap((f) => f.fix!);
