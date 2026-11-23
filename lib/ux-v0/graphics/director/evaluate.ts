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
import { approxMeasure, layoutText, type Measure } from '../text';
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
  /** the stock poster structure: a picture above, the title beneath it, the details in a strip across the foot */
  stockStructure: boolean;
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
/**
 * One structure turns up under every subject when nothing decides otherwise: the drawn material in the upper part of
 * the sheet, the title set beneath it, and the small words gathered in a strip of two or more columns across the
 * foot. It is a sound structure, and that is why it is the default: found here so that it can be counted across
 * designs and said to whoever looks at the result, not because one use of it is wrong.
 */
function stockStructure(board: Artboard, top: Node[], texts: TextNode[]): boolean {
  const W = board.width;
  const H = board.height;
  const head = texts.find((t) => t.role === 'headline') ?? [...texts].sort((a, b) => b.size - a.size)[0];
  if (!head || texts.length < 3) return false;
  const mid = (n: { y: number; h: number }) => n.y + n.h / 2;
  if (mid(head) < H * 0.36 || mid(head) > H * 0.86) return false;
  // the drawn material (not the ground, not rules), and how much of it sits above the title
  const forms = top.filter((n) => n.type !== 'text' && n.role !== 'background' && !(n.type === 'shape' && n.shape === 'line') && n.w * n.h < W * H * 0.9 && n.h > H * 0.012);
  const mass = (n: Node) => Math.max(0, Math.min(W, n.x + n.w) - Math.max(0, n.x)) * Math.max(0, Math.min(H, n.y + n.h) - Math.max(0, n.y));
  const total = forms.reduce((s, n) => s + mass(n), 0);
  const above = forms.filter((n) => mid(n) < head.y).reduce((s, n) => s + mass(n), 0);
  if (total < W * H * 0.05 || above < total * 0.6) return false;
  // the small words: all beneath the title, low on the sheet, in two columns or more
  const small = texts.filter((t) => t !== head && t.role !== 'logo' && t.size < head.size * 0.5);
  const foot = small.filter((t) => t.y >= head.y + head.h * 0.5 && mid(t) > H * 0.7);
  if (foot.length < 2 || foot.length < small.length * 0.6) return false;
  return foot.some((t) => t.x < W * 0.3) && foot.some((t) => t.x > W * 0.42);
}

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
  const stock = stockStructure(board, top, texts);
  const said: string[] = [];
  if (stock) said.push('the stock poster structure: a picture above, the title beneath it, the details in a strip across the foot');
  if (purpleBlue.length) said.push('a purple-to-blue gradient ground');
  else if (gradGrounds.length) said.push('a graded ground');
  if (rounded.length >= 2) said.push(`${rounded.length} rounded cards`);
  if (pills.length) said.push(`${pills.length} pill shape${pills.length === 1 ? '' : 's'}`);
  if (soft.length >= 2) said.push(`${soft.length} objects with glows, blurs or soft shadows`);
  if (floating.length >= 3) said.push(`${floating.length} small shapes floating on their own`);
  if (texts.length >= 3 && centred >= 0.99) said.push('every line centred');
  if (faces > 2) said.push(`${faces} typefaces`);
  if (all.length >= 6 && withFx / all.length > 0.5) said.push('an effect on most objects');
  return { gradientGround: gradGrounds.length > 0, purpleBlueGradient: purpleBlue.length > 0, roundedCards: rounded.length, pills: pills.length, softEffects: soft.length, floatingMarks: floating.length, centredShare: Math.round(centred * 100) / 100, faces, effectShare: all.length ? Math.round((withFx / all.length) * 100) / 100 : 0, objects: all.length, stockStructure: stock, said };
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

/** Where a text's lines sit inside its box, one rectangle a line (a turned or vertical text: its whole box). */
function inkRects(t: TextNode, measure: Measure): { x: number; y: number; w: number; h: number }[] {
  if (t.vertical || t.rotation) return [{ x: t.x, y: t.y, w: t.w, h: t.h }];
  const lay = layoutText(t, measure);
  if (!lay.lines.length) return [];
  const top = t.valign === 'middle' ? t.y + (t.h - lay.height) / 2 : t.valign === 'bottom' ? t.y + t.h - lay.height : t.y;
  return lay.lines.map((l, i) => {
    const w = Math.max(1, Math.min(l.width, t.w));
    const x = t.align === 'center' ? t.x + (t.w - w) / 2 : t.align === 'right' ? t.x + t.w - w : t.x;
    return { x, y: top + i * lay.leading + l.para * lay.paraGap, w, h: t.size };
  });
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
  // words left beneath an opaque object drawn over them (top level: where a design's forms and words meet). Judged
  // line by line, where the words really sit: a short line leaves most of its row of the box empty, and a form
  // standing in that empty part covers nothing.
  const covered: string[] = [];
  const m = opts.measure ?? approxMeasure;
  board.children.forEach((t, i) => {
    if (t.type !== 'text' || t.decorative || t.hidden) return;
    const lines = inkRects(t, m);
    const over = board.children.slice(i + 1).find((s) => {
      if (!(s.type === 'image' || (s.type === 'shape' && s.fill !== null && s.shape !== 'line')) || s.opacity < 0.5 || (s.blend && s.blend !== 'normal') || s.hidden) return false;
      return lines.some((l) => Math.max(0, Math.min(l.x + l.w, s.x + s.w) - Math.max(l.x, s.x)) * Math.max(0, Math.min(l.y + l.h, s.y + s.h) - Math.max(l.y, s.y)) > l.w * l.h * 0.12);
    });
    if (over) covered.push(`the ${t.role ?? 'words'} (“${t.text.slice(0, 30)}”) are partly covered by ${over.name ? `“${over.name}”` : 'a shape'} drawn over them`);
  });
  const findings = [
    ...missing.map((w) => `the brief’s words “${w.slice(0, 60)}” are not on the design`),
    ...covered,
    ...checks.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1)).map((f) => f.message),
    ...(texts.length >= 3 && scale < 2.2 ? [`the scale is timid: the largest words are only ${scale}× the smallest`] : []),
    ...habits.said.map((h) => `a generic habit: ${h}`),
  ];
  return { findings, high: checks.filter((f) => f.severity === 'high').length + missing.length + covered.length, medium: checks.filter((f) => f.severity === 'medium').length, habits, missing, scale };
}
