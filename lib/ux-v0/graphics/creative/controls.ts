// lib/ux-v0/graphics/creative/controls.ts — creative controls made for the design in front, each bound to it.
//
// No control here is decorative, and none is a fixed panel: the set is generated from what the artboard holds and what
// was decided for it — a headline gets its size, weight and spacing; a design with forms of its own gets how many, how
// abstract and how large (named for what they are: "Clouds — how many"); a ground gets its tone; an accent its hue;
// depth its level; a composed artboard how much room it leaves. Each control reads its value from the document and,
// moved, writes it back through the engine that owns that property (the creative executor for forms, depth, colour and
// ground; the composer for room; the text node itself for size, weight and spacing — refitted so nothing overflows).
// Values are absolute and read from the design, so undo, redo and a change in words leave the controls telling the
// truth; reset puts back the value the design had when the control was first moved. Deterministic: no model chooses
// the controls (none is called).

import { FONTS } from '../../fonts';
import { applyOps, boardTokens, walk, type GraphicDoc, type Op, type TextNode } from '../doc';
import type { GraphicDirection, GraphicKind } from '../compose';
import { recomposeArtboard } from '../generative/edits';
import { signatureOfBoard } from '../generative/evaluate';
import { approxMeasure, fitSize, layoutText, type Measure } from '../text';
import { refineDoc } from '../check';
import { creativeFormIds, mainWords, readDecisions } from './decisions';
import { executePlan, weightFor } from './execute';
import { FORM_LABEL } from './forms';
import { themeById } from './lexicon';
import type { Change, CreativePlan } from './plan';

export type ControlGroup = 'type' | 'colour' | 'forms' | 'space' | 'depth';

export interface CreativeControl {
  id: string;
  label: string;
  group: ControlGroup;
  kind: 'range' | 'choice';
  min: number;
  max: number;
  step: number;
  /** how the value is shown ("120%", "34°", "600") */
  unit?: '%' | '°' | 'px' | '' | 'pt';
  options?: { value: number; label: string }[];
  /** the value now, read from the design */
  value: number;
  /** what moving it changes, said */
  says: string;
}

export interface ControlContext {
  dir?: GraphicDirection | null;
  kind?: GraphicKind;
  measure?: Measure;
  now?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hsl = (hex: string): [number, number, number] => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};
const hex = (h: number, s: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
};

/** The controls this artboard calls for, generated from what it holds and what was decided for it. */
export function controlsFor(doc: GraphicDoc, boardId: string | undefined): CreativeControl[] {
  const board = doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0];
  if (!board) return [];
  const out: CreativeControl[] = [];
  const d = readDecisions(doc, board.id);
  const rec = board.creative ?? {};
  const head = mainWords(board);
  const t = boardTokens(doc, board);
  const theme = themeById(rec.theme);
  // the forms first when they are what the design is about (a theme), the type first otherwise
  if (rec.forms && creativeFormIds(doc, board).length) {
    const name = FORM_LABEL[rec.forms.kind].replace(/^./, (c) => c.toUpperCase());
    out.push(
      { id: 'forms-count', label: `${name} — how many`, group: 'forms', kind: 'range', min: 1, max: 12, step: 1, unit: '', value: creativeFormIds(doc, board).length, says: `how many ${FORM_LABEL[rec.forms.kind]} there are` },
      { id: 'forms-abstraction', label: `${name} — how abstract`, group: 'forms', kind: 'range', min: 0, max: 100, step: 5, unit: '%', value: Math.round(rec.forms.abstraction), says: `from literal ${FORM_LABEL[rec.forms.kind]} to abstract forms` },
      { id: 'forms-scale', label: `${name} — how large`, group: 'forms', kind: 'range', min: 40, max: 200, step: 5, unit: '%', value: Math.round((rec.forms.scale ?? 1) * 100), says: `the size of the ${FORM_LABEL[rec.forms.kind]}` },
    );
  }
  if (head && !head.locked) {
    const f = FONTS.find((x) => x.name === head.font);
    out.push({ id: 'head-size', label: 'Headline — size', group: 'type', kind: 'range', min: Math.round(head.size * 0.5), max: Math.round(head.size * 1.8), step: 1, unit: board.unit === 'pt' ? 'pt' : 'px', value: Math.round(head.size), says: 'the size of the headline (it is refitted so no word breaks)' });
    if (f && (f.variable || f.weights.length > 1)) {
      const ws = f.variable ? [100, 200, 300, 400, 500, 600, 700, 800, 900].filter((x) => x >= f.weights[0] && x <= f.weights[1]) : [...f.weights];
      if (ws.length > 1) out.push({ id: 'head-weight', label: `Headline — weight (${head.font})`, group: 'type', kind: 'choice', min: ws[0], max: ws[ws.length - 1], step: 100, value: head.weight, options: ws.map((x) => ({ value: x, label: String(x) })), says: `the weights ${head.font} has` });
    }
    out.push({ id: 'head-tracking', label: 'Headline — letter spacing', group: 'type', kind: 'range', min: -60, max: 300, step: 5, unit: '', value: Math.round(head.tracking ?? 0), says: 'the space between the headline’s letters (thousandths of an em)' });
  }
  // colour: the ground's tone and the accent's hue, from the design's own colours
  const ground = (board.background || t.colors.background).slice(0, 7);
  if (/^#[0-9a-f]{6}$/i.test(ground)) out.push({ id: 'ground-tone', label: theme?.id === 'cloud' || theme?.id === 'space' ? 'Sky — tone' : 'Ground — tone', group: 'colour', kind: 'range', min: 4, max: 98, step: 1, unit: '%', value: Math.round(hsl(ground)[2] * 100), says: 'how light or dark the ground is (the words keep their contrast)' });
  const accent = t.colors.accent.slice(0, 7);
  if (/^#[0-9a-f]{6}$/i.test(accent) && hsl(accent)[1] > 0.08) out.push({ id: 'accent-hue', label: 'Accent — hue', group: 'colour', kind: 'range', min: 0, max: 355, step: 5, unit: '°', value: Math.round(hsl(accent)[0] / 5) * 5, says: 'the accent moved around the colour wheel, everywhere it is used' });
  // depth, and the room the composition leaves (an artboard the composer made)
  out.push({ id: 'depth', label: 'Depth', group: 'depth', kind: 'choice', min: 0, max: 3, step: 1, value: d.depth, options: [{ value: 0, label: 'Flat' }, { value: 1, label: 'Layered' }, { value: 2, label: 'Shadowed' }, { value: 3, label: 'Atmospheric' }], says: 'distance and shadow on the forms' });
  if (board.format && head) out.push({ id: 'room', label: 'Room — how much is left open', group: 'space', kind: 'range', min: 15, max: 80, step: 5, unit: '%', value: Math.round(signatureOfBoard(board).empty * 20) * 5, says: 'the composition laid out again to leave this much open (the words, pictures and style kept)' });
  return out;
}

/** A control moved: the design with that value, through the engine that owns the property (null when it cannot). */
export function applyControl(doc: GraphicDoc, boardId: string, id: string, value: number, ctx: ControlContext = {}): { doc: GraphicDoc; label: string } | null {
  const board = doc.artboards.find((b) => b.id === boardId);
  if (!board) return null;
  const measure = ctx.measure ?? approxMeasure;
  const now = ctx.now ?? Date.now();
  const rec = board.creative ?? {};
  const head = mainWords(board);
  const plan = (changes: Change[], summary: string): { doc: GraphicDoc; label: string } | null => {
    const p: CreativePlan = { intent: 'global', summary, keep: ['words', 'logo', 'pictures'], changes, by: 'reader' };
    const e = executePlan(doc, p, { board: boardId, dir: ctx.dir, kind: ctx.kind, measure, said: summary, now, turn: 0 });
    return e && e.doc !== doc ? { doc: e.doc, label: summary } : null;
  };
  const update = (set: Record<string, unknown>, label: string): { doc: GraphicDoc; label: string } | null => {
    if (!head) return null;
    const r = applyOpsSafe(doc, [{ op: 'update', id: head.id, set }]);
    if (!r) return null;
    // checked and repaired as any change is (a box grown to hold its words, contrast), on this artboard alone
    const mine = r.artboards.find((b) => b.id === boardId)!;
    const checked = refineDoc({ ...r, tokens: boardTokens(r, mine), artboards: [mine] }, measure);
    const fixed = checked.doc.artboards[0];
    return { doc: fixed ? { ...r, artboards: r.artboards.map((b) => (b.id === boardId ? { ...fixed, ...(b.tokens ? { tokens: b.tokens } : {}) } : b)) } : r, label };
  };
  switch (id) {
    case 'forms-count': {
      if (!rec.forms) return null;
      const n = Math.max(1, rec.forms.count || creativeFormIds(doc, board).length || 1);
      return plan([{ decision: 'forms', kind: rec.forms.kind, count: clamp(value / n - 1, -1, 3) }], `${FORM_LABEL[rec.forms.kind]}: ${value}`);
    }
    case 'forms-abstraction':
      return rec.forms ? plan([{ decision: 'forms', kind: rec.forms.kind, abstraction: clamp(value, 0, 100) }], `${FORM_LABEL[rec.forms.kind]} ${value}% abstract`) : null;
    case 'forms-scale': {
      if (!rec.forms) return null;
      const s = Math.max(0.2, rec.forms.scale ?? 1);
      return plan([{ decision: 'forms', kind: rec.forms.kind, scale: clamp(value / 100 / s - 1, -0.8, 1.5) }], `${FORM_LABEL[rec.forms.kind]} at ${value}%`);
    }
    case 'depth':
      return plan([{ decision: 'depth', level: clamp(Math.round(value), 0, 3) }], `depth: ${['flat', 'layered', 'shadowed', 'atmospheric'][clamp(Math.round(value), 0, 3)]}`);
    case 'ground-tone': {
      const d = readDecisions(doc, boardId);
      const colours = d.background.colours.map((c) => {
        const [h, s] = hsl(c.slice(0, 7));
        // every stop keeps its place relative to the bottom one
        const [, , l0] = hsl(d.background.colours[d.background.colours.length - 1].slice(0, 7));
        const [, , l] = hsl(c.slice(0, 7));
        return hex(h, s, clamp(value / 100 + (l - l0), 0.02, 0.99));
      });
      return plan([{ decision: 'background', kind: d.background.kind, colours }], `the ground at ${value}% light`);
    }
    case 'accent-hue': {
      const t = boardTokens(doc, board);
      const [, s, l] = hsl(t.colors.accent.slice(0, 7));
      return plan([{ decision: 'palette', colours: { accent: hex(((value % 360) + 360) % 360, s, l) } }], `the accent at ${value}°`);
    }
    case 'head-size': {
      if (!head) return null;
      const size = Math.max(6, value);
      const k = size / head.size;
      // the box grows to hold the widest word (never past the safe margin), the words refitted if they still would not fit
      const widest = Math.max(0, ...(head.case === 'upper' ? head.text.toUpperCase() : head.text).split(/\s+/).filter(Boolean).map((w) => layoutText({ ...head, text: w, runs: undefined, size, w: 1e5, autoHeight: false }, measure).widest));
      const room = board.width - board.safe - head.x;
      const w = clamp(Math.max(head.w, widest * 1.04), head.w * 0.5, Math.max(head.w, room));
      const trial = { ...head, size, w, h: head.h * k } as TextNode;
      const fitted = head.autoHeight ? size : Math.min(size, fitSize(trial, measure, 6));
      const r = update({ size: Math.round(fitted * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(head.h * k * 10) / 10 }, '');
      const now2 = r ? mainWords(r.doc.artboards.find((b) => b.id === boardId) ?? board) : null;
      return r && now2 ? { doc: r.doc, label: `the headline at ${Math.round(now2.size)}${board.unit}${Math.round(now2.size) < Math.round(size) ? ' (as large as it fits)' : ''}` } : null;
    }
    case 'head-weight':
      return head ? update({ weight: weightFor(head.font, value) }, `the headline in weight ${weightFor(head.font, value)}`) : null;
    case 'head-tracking': {
      if (!head) return null;
      const trial = { ...head, tracking: value } as TextNode;
      const fitted = head.autoHeight ? head.size : Math.min(head.size, fitSize(trial, measure, 6));
      return update({ tracking: Math.round(value), ...(fitted < head.size ? { size: Math.round(fitted * 10) / 10 } : {}) }, `the headline spaced ${value}`);
    }
    case 'room': {
      const dir = ctx.dir ?? { name: doc.direction?.name ?? 'This design', language: doc.direction?.language ?? 'editorial', tokens: boardTokens(doc, board), look: { case: 'sentence' as const, tracking: 'normal' as const, weight: 600 }, form: null, intensity: 50 };
      const r = recomposeArtboard(doc, boardId, { label: `${value}% left open`, size: 'small', constraints: { negativeSpace: clamp(value, 10, 85) } }, { dir: { ...dir, tokens: boardTokens(doc, board) }, kind: ctx.kind, measure, turn: 0 });
      if (!r) return null;
      // what it really leaves open is said (the composer aims at the share; the words and pictures decide the rest)
      const got = Math.round(signatureOfBoard(r.doc.artboards.find((b) => b.id === boardId) ?? board).empty * 100);
      return { doc: r.doc, label: `the composition laid out again: ${got}% left open${Math.abs(got - value) > 7 ? ` (you asked for ${value}%)` : ''}` };
    }
  }
  return null;
}

function applyOpsSafe(doc: GraphicDoc, ops: Op[]): GraphicDoc | null {
  const r = applyOps(doc, ops);
  return r.ok ? r.doc : null;
}

/** Every text and its fit after a control (for tests: nothing overflows). */
export const textsOf = (doc: GraphicDoc, boardId: string) => walk(doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0]).filter((l) => l.node.type === 'text');
