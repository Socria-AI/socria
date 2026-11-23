// lib/ux-v0/graphics/director/evaluate.ts — a result judged before it is shown: what can be measured, measured.
//
// A successful answer from a model is not a successful design. After a design is composed or changed, three things
// are measured from the document itself, in code:
//   adherence   every word the brief gave is on the design, exactly as given;
//   craft       the checks every design passes through (words cut, broken, colliding, off the safe area, too small,
//               too faint: graphics/check.ts), and whether the scale has a real hierarchy;
//   habits      the marks of generic generated design, counted (a graded ground in the purple–blue range, a graded
//               ground at all, rounded cards, pills, glows and soft shadows, small floating shapes that sit behind
//               nothing, everything centred, more than two faces, an effect on most objects, a chart with no data).
// None of this judges taste; it finds facts. The facts go to the person (as notes), to the benchmark (as numbers) and
// to the director's own review of the rendered picture (prompts.ts reviewUser), which is where judgement happens.

import { checkDoc } from '../check';
import { walk, type Artboard, type GraphicDoc, type Node, type TextNode } from '../doc';
import { approxMeasure, type Measure } from '../text';
import type { GraphicContent } from '../compose';

export interface Habits {
  gradientGround: boolean;
  purpleBlueGradient: boolean;
  roundedCards: number;
  pills: number;
  softEffects: number;
  floatingMarks: number;
  centredShare: number;
  faces: number;
  effectShare: number;
  objects: number;
  /** each habit found, said */
  said: string[];
}

const hue = (hex: string): number | null => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx - mn < 0.1) return null;
  const h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
  return (h * 60 + 360) % 360;
};
const stopsOf = (p: unknown): string[] | null => {
  const g = p as { stops?: { color: string }[] } | null;
  return g && typeof g === 'object' && Array.isArray(g.stops) ? g.stops.map((s) => s.color.slice(0, 7)) : null;
};

/** The marks of generic generated design on an artboard, counted (see the head of this file). */
export function habitsOf(board: Artboard): Habits {
  const all = walk(board).map((l) => l.node).filter((n) => !n.hidden);
  const area = board.width * board.height;
  const shapes = all.filter((n): n is Extract<Node, { type: 'shape' }> => n.type === 'shape');
  const texts = all.filter((n): n is TextNode => n.type === 'text' && !n.decorative);
  const gradGrounds = shapes.filter((n) => stopsOf(n.fill) && n.w * n.h > area * 0.5);
  const purpleBlue = gradGrounds.filter((n) => {
    const hs = stopsOf(n.fill)!.map(hue);
    return hs.every((h) => h !== null && h >= 205 && h <= 300);
  });
  const rounded = shapes.filter((n) => n.shape === 'rect' && (n.radius ?? 0) > Math.min(n.w, n.h) * 0.08 && n.w * n.h > area * 0.02 && n.w * n.h < area * 0.45);
  const pills = shapes.filter((n) => n.shape === 'rect' && (n.radius ?? 0) >= Math.min(n.w, n.h) * 0.45 && n.w > n.h * 1.6 && n.w * n.h < area * 0.05);
  const soft = all.filter((n) => (n.effects ?? []).some((e) => e.on !== false && /^(glow|inner-glow|drop-shadow|blur|glass|soft)$/.test(e.kind)));
  // small marks that hold nothing and frame nothing: not rules, not plates, not parts of a group
  const top = board.children.filter((n) => !n.hidden);
  const floating = top.filter((n) => n.type === 'shape' && n.shape !== 'line' && n.role !== 'background' && n.role !== 'cta' && n.role !== 'logo' && !/^(plate|rule|frame)$/i.test(n.name ?? '') && n.w * n.h < area * 0.012 && Math.max(n.w, n.h) < Math.min(board.width, board.height) * 0.16);
  const centred = texts.length ? texts.filter((t) => t.align === 'center').length / texts.length : 0;
  const faces = new Set(texts.map((t) => t.font)).size;
  const withFx = all.filter((n) => (n.effects ?? []).some((e) => e.on !== false)).length;
  const said: string[] = [];
  if (purpleBlue.length) said.push('a purple-to-blue gradient ground');
  else if (gradGrounds.length) said.push('a graded ground');
  if (rounded.length >= 2) said.push(`${rounded.length} rounded cards`);
  if (pills.length) said.push(`${pills.length} pill shape${pills.length === 1 ? '' : 's'}`);
  if (soft.length >= 2) said.push(`${soft.length} objects with glows, blurs or soft shadows`);
  if (floating.length >= 3) said.push(`${floating.length} small shapes floating on their own`);
  if (texts.length >= 3 && centred >= 0.99) said.push('every line centred');
  if (faces > 2) said.push(`${faces} typefaces`);
  if (all.length >= 6 && withFx / all.length > 0.5) said.push('an effect on most objects');
  return { gradientGround: gradGrounds.length > 0, purpleBlueGradient: purpleBlue.length > 0, roundedCards: rounded.length, pills: pills.length, softEffects: soft.length, floatingMarks: floating.length, centredShare: Math.round(centred * 100) / 100, faces, effectShare: all.length ? Math.round((withFx / all.length) * 100) / 100 : 0, objects: all.length, said };
}

/** The brief's words that are not on the design exactly as given. */
export function missingWords(board: Artboard, content: GraphicContent): string[] {
  const shown = walk(board).map((l) => l.node).filter((n): n is TextNode => n.type === 'text' && !n.decorative && !n.hidden).map((t) => t.text.replace(/\s*→$/, ''));
  const has = (w: string) => shown.some((t) => t === w || t.includes(w) || t.split(/\n/).includes(w));
  return [content.headline, content.subhead, content.cta, content.brand, ...(content.meta ?? [])].filter((w): w is string => !!w && !/^\[.*\]$/.test(w) && !has(w));
}

export interface Measured {
  /** what is measurably wrong, most serious first, said */
  findings: string[];
  high: number;
  medium: number;
  habits: Habits;
  missing: string[];
  /** the largest words over the smallest, by size */
  scale: number;
}

/** Everything measurable about an artboard as it stands (see the head of this file). */
export function measure(doc: GraphicDoc, boardId: string, opts: { measure?: Measure; content?: GraphicContent } = {}): Measured {
  const board = doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0];
  const checks = checkDoc(doc, opts.measure ?? approxMeasure).filter((f) => f.artboard === board.id && f.severity !== 'low');
  const habits = habitsOf(board);
  const missing = opts.content ? missingWords(board, opts.content) : [];
  const texts = walk(board).map((l) => l.node).filter((n): n is TextNode => n.type === 'text' && !n.decorative && !n.hidden);
  const sizes = texts.map((t) => t.size);
  const scale = sizes.length > 1 ? Math.round((Math.max(...sizes) / Math.min(...sizes)) * 10) / 10 : 1;
  const findings = [
    ...missing.map((w) => `the brief’s words “${w.slice(0, 60)}” are not on the design`),
    ...checks.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1)).map((f) => f.message),
    ...(texts.length >= 3 && scale < 2.2 ? [`the scale is timid: the largest words are only ${scale}× the smallest`] : []),
    ...habits.said.map((h) => `a generic habit: ${h}`),
  ];
  return { findings, high: checks.filter((f) => f.severity === 'high').length + missing.length, medium: checks.filter((f) => f.severity === 'medium').length, habits, missing, scale };
}
