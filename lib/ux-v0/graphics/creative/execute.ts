// lib/ux-v0/graphics/creative/execute.ts — a creative plan carried out by the engine.
//
// The plan says what should change (plan.ts); this does it, decision by decision, on the design that is there:
//   colour      the palette moved (a theme's, a quality's shifts, colours named, another concept's) and the design
//               repainted role for role — the ground, the words, the accent, the supporting tones — the logo kept as
//               it is unless it would vanish on the new ground;
//   typography  a character's pairing (or faces named, or another concept's) set on the words by role, each fitted so
//               nothing overflows; the logo's own lettering untouched;
//   composition the artboard re-conceived by the generative engine (rethought, unexpected, more air, asymmetric…), the
//               words, pictures, style and anything locked kept, the decisions made since put back on it;
//   forms       the forms a theme or a quality brings (clouds, organic masses, waves…), generated and placed off the
//               words, replacing the motifs they take over from — or the ones there made more abstract, fewer, larger;
//   ground      flat, graded or textured;
//   depth       distance and shadow on the forms, a graded ground;
//   words       changed only as the person wrote them; anything said about one object goes to the precise reader.
// What the person did not ask to change stays as it was. Each decision changed is recorded with what restores it
// (decisions.ts), so it can be turned down alone; the design is checked and repaired (contrast, overflow) before it is
// shown. Locked colours or faces are said, never overridden.

import { mix } from '../../color';
import { contrastRatio } from '../../../ux/audit';
import { FONTS } from '../../fonts';
import { applyOps, newId, walk, type Artboard, type GraphicDoc, type Node, type Op, type Paint, type ShapeNode, type TextNode, type Tokens } from '../doc';
import type { GraphicDirection, GraphicKind } from '../compose';
import { recomposeArtboard, type CreativeEdit } from '../generative/edits';
import { refineDoc } from '../check';
import { approxMeasure, fitSize, type Measure } from '../text';
import { readGraphicEdit } from '../edit';
import { drawForm, placeForms, FORM_LABEL, type FormKind, type Rect } from './forms';
import { CHARACTER_LABEL, qualityById, shiftPalette, themeById, tokensOf, typeSetFor, type Palette, type PaletteShift, type Theme, type TypeCharacter } from './lexicon';
import { boardOf, creativeFormIds, DECISION_LABEL, GROUND_NAME, groundCarrier, mainWords, readDecisions, stopsOf, type CreativeRecord, type CreativeState, type DecisionKey, type DecisionSource, type Restore } from './decisions';
import type { Change, CompositionAction, CreativePlan } from './plan';

export interface ConceptRef {
  id: string;
  name: string;
  doc: GraphicDoc;
}

export interface ExecContext {
  board?: string;
  dir?: GraphicDirection | null;
  kind?: GraphicKind;
  measure?: Measure;
  /** saved concepts, for decisions taken from one ("the typography of concept 2") */
  concepts?: readonly ConceptRef[];
  /** the person's words, kept with each decision as where it came from */
  said: string;
  now?: number;
  /** asking again moves on: the next pairing, other forms */
  turn?: number;
}

export interface Executed {
  doc: GraphicDoc;
  /** what was done, decision by decision */
  done: string[];
  /** what was kept, as asked or because it is locked */
  kept: string[];
  /** what could not be done as asked, with what to do instead */
  notes: string[];
  changed: DecisionKey[];
  /** the change in a few words, for the history */
  label: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hex7 = (c: string) => c.slice(0, 7).toLowerCase();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The concept a change takes a decision from, by id, name or number ("concept 2"). */
export function conceptRef(concepts: readonly ConceptRef[] | undefined, ref: string | undefined): ConceptRef | null {
  if (!ref || !concepts?.length) return null;
  const r = ref.toLowerCase().trim();
  const num = r.match(/(\d+)|\b(first|second|third|fourth|fifth|last)\b/);
  if (num) {
    const words = ['first', 'second', 'third', 'fourth', 'fifth'];
    const i = num[1] ? Number(num[1]) - 1 : num[2] === 'last' ? concepts.length - 1 : words.indexOf(num[2]);
    if (concepts[i]) return concepts[i];
  }
  return concepts.find((c) => c.id === ref || c.name.toLowerCase() === r) ?? concepts.find((c) => r.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(r)) ?? null;
}

// ── colour ──

/** The colour map from one palette's tokens to another's, role for role, and the design repainted with it. */
function repaint(doc: GraphicDoc, board: Artboard, to: ReturnType<typeof tokensOf>, skip: readonly string[] = []): { ops: Op[]; restore: Record<string, Record<string, unknown>>; logoMoved: boolean } {
  const from = doc.tokens;
  // each old colour with its role and its new counterpart; a colour is matched by role first (words to the ink, a
  // button's label to the accent's own text, a shape to the ground or the accent), so a dark logo is not read as a
  // button label because the two happen to be close
  type Role = 'ground' | 'background' | 'text' | 'accent' | 'surface' | 'muted' | 'line' | 'accentText' | 'accent2';
  const entries: { role: Role; from: string; to: string }[] = [];
  const push = (role: Role, a?: string | null, b?: string) => a && b && entries.push({ role, from: hex7(a), to: b });
  push('ground', board.background, to.colors.background);
  for (const k of ['background', 'text', 'accent', 'surface', 'muted', 'line', 'accentText'] as const) push(k, from.colors[k], to.colors[k]);
  push('accent2', from.accent2, to.accent2 ?? to.colors.accent);
  const ORDER: Record<'text' | 'cta' | 'shape', Role[]> = {
    text: ['text', 'muted', 'accent', 'accent2', 'ground', 'background', 'surface', 'line'],
    cta: ['accentText', 'text', 'accent', 'ground', 'background', 'muted'],
    shape: ['ground', 'background', 'surface', 'accent', 'accent2', 'muted', 'line', 'text', 'accentText'],
  };
  const dist = (a: string, b: string) => {
    const x = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const y = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  let order: Role[] = ORDER.shape;
  const swap = (c: unknown): string | null => {
    if (typeof c !== 'string' || !/^#[0-9a-f]{6}/i.test(c)) return null;
    const k = hex7(c);
    const list = order.map((r) => entries.find((e) => e.role === r)).filter((e): e is (typeof entries)[number] => !!e);
    const direct = list.find((e) => e.from === k);
    if (direct) return direct.to + c.slice(7);
    // a tint between two of the old colours keeps its place between the new ones
    let best: (typeof entries)[number] | null = null;
    let bd = Infinity;
    for (const e of list) {
      const d = dist(k, e.from);
      if (d < bd - 0.01) {
        bd = d;
        best = e;
      }
    }
    return bd < 60 && best ? best.to + c.slice(7) : null;
  };
  const paint = (p: Paint | null | undefined): Paint | null => {
    if (!p) return null;
    if (typeof p === 'string') return swap(p);
    const g = p as { stops?: { at: number; color: string }[] };
    if (!Array.isArray(g.stops)) return null;
    let moved = false;
    const stops = g.stops.map((s) => {
      const c = swap(s.color);
      if (c) moved = true;
      return { ...s, color: c ?? s.color };
    });
    return moved ? ({ ...(p as object), stops } as Paint) : null;
  };
  const ops: Op[] = [];
  const restore: Record<string, Record<string, unknown>> = {};
  const newGround = to.colors.background;
  let logoMoved = false;
  for (const l of walk(board)) {
    const nd = l.node;
    if (nd.locked || nd.type === 'image' || nd.type === 'group' || skip.includes(nd.id)) continue;
    const inLogo = nd.role === 'logo' || l.parents.some((p) => p.role === 'logo');
    if (inLogo) {
      // a brand's mark keeps its colours, unless it would no longer be seen on the new ground
      const own = nd.type === 'text' ? nd.color : nd.type === 'shape' && typeof nd.fill === 'string' ? nd.fill : null;
      if (!own || contrastRatio(hex7(own), newGround) >= 2.4) continue;
      logoMoved = true;
    }
    const set: Record<string, unknown> = {};
    const was: Record<string, unknown> = {};
    order = nd.type === 'text' ? (nd.role === 'cta' || l.parents.some((p) => p.role === 'cta') ? ORDER.cta : ORDER.text) : ORDER.shape;
    if (nd.type === 'text') {
      const c = swap(nd.color);
      if (c && c !== nd.color) ((set.color = c), (was.color = nd.color));
      // a word of its own colour inside the words (a run) moves with the palette too
      if (nd.runs?.some((r) => r.color)) {
        let moved = false;
        const runs = nd.runs.map((r) => {
          const rc = r.color ? swap(r.color) : null;
          if (rc && rc !== r.color) moved = true;
          return rc ? { ...r, color: rc } : r;
        });
        if (moved) ((set.runs = runs), (was.runs = nd.runs));
      }
      if (nd.stroke) {
        const sc = swap(nd.stroke.color);
        if (sc) ((set.stroke = { ...nd.stroke, color: sc }), (was.stroke = nd.stroke));
      }
    } else if (nd.type === 'shape') {
      const f = paint(nd.fill);
      if (f) ((set.fill = f), (was.fill = nd.fill));
      if (nd.stroke) {
        const sc = swap(nd.stroke.color);
        if (sc) ((set.stroke = { ...nd.stroke, color: sc }), (was.stroke = nd.stroke));
      }
    }
    if (Object.keys(set).length) {
      ops.push({ op: 'update', id: nd.id, set });
      restore[nd.id] = was;
    }
  }
  ops.push({ op: 'artboard-update', id: board.id, set: { background: newGround } });
  ops.push({ op: 'tokens', set: { colors: to.colors, ...(to.accent2 ? { accent2: to.accent2 } : {}) } });
  return { ops, restore, logoMoved };
}

const rgbOf = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/**
 * A graded ground carried into a new palette: each stop is read as the old ground leaning some way towards one of the
 * old colours (the accent, a supporting tone, the ink, white or black) and drawn as the new ground leaning the same way
 * towards its counterpart — so a sky stays a sky, a glow a glow, in the new colours. A lean to white or black keeps
 * its absolute amount (a highlight on a pale ground stays a highlight on a dark one, not a white band).
 */
export function regrade(stops: readonly string[], was: { ground: string; partners: readonly string[] }, now: { ground: string; partners: readonly string[] }): string[] {
  const g0 = rgbOf(hex7(was.ground));
  const g1 = rgbOf(hex7(now.ground));
  const poles = ['#ffffff', '#000000'];
  const olds = [...was.partners.map(hex7), ...poles];
  const news = [...now.partners.map(hex7), ...poles];
  return stops.map((c0) => {
    const x = rgbOf(hex7(c0));
    let best = { t: 0, i: -1, err: Math.hypot(x[0] - g0[0], x[1] - g0[1], x[2] - g0[2]) };
    olds.forEach((pc, i) => {
      const y = rgbOf(pc);
      const d = [y[0] - g0[0], y[1] - g0[1], y[2] - g0[2]];
      const len2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
      if (len2 < 9) return;
      const t = clamp(((x[0] - g0[0]) * d[0] + (x[1] - g0[1]) * d[1] + (x[2] - g0[2]) * d[2]) / len2, 0, 1);
      const err = Math.hypot(g0[0] + d[0] * t - x[0], g0[1] + d[1] * t - x[1], g0[2] + d[2] * t - x[2]);
      if (err < best.err - 0.5) best = { t, i, err };
    });
    if (best.i < 0 || best.t < 0.02) return hex7(now.ground);
    const to = news[best.i];
    if (best.i >= olds.length - poles.length) {
      // towards white or black: the same distance, not the same share of the way
      const far0 = Math.hypot(...rgbOf(to).map((v, k) => v - g0[k]));
      const far1 = Math.hypot(...rgbOf(to).map((v, k) => v - g1[k]));
      return mix(now.ground, to, far1 > 1 ? clamp((best.t * far0) / far1, 0, 1) : 0);
    }
    return mix(now.ground, to, best.t);
  });
}

// ── typography ──

const fontOk = (name: string) => FONTS.some((f) => f.name === name);
const weightFor = (name: string, want: number) => {
  const f = FONTS.find((x) => x.name === name);
  const list = (f as { weights?: number[] } | undefined)?.weights ?? [400, 700];
  return list.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), list[0]);
};

function retype(doc: GraphicDoc, board: Artboard, set: { display: string; body: string; weight: number; case: 'none' | 'upper'; tracking: number }, measure: Measure): { ops: Op[]; restore: Record<string, Record<string, unknown>> } {
  const ops: Op[] = [];
  const restore: Record<string, Record<string, unknown>> = {};
  const head = mainWords(board);
  for (const l of walk(board)) {
    const nd = l.node;
    if (nd.type !== 'text' || nd.locked || nd.hidden || nd.role === 'logo' || l.parents.some((p) => p.role === 'logo')) continue;
    const display = nd.id === head?.id || nd.role === 'headline';
    const next: Partial<TextNode> = display
      ? { font: set.display, weight: weightFor(set.display, set.weight), case: set.case, tracking: set.tracking }
      : { font: set.body, weight: weightFor(set.body, nd.weight >= 600 ? 600 : 400), ...(nd.case === 'upper' ? {} : {}) };
    // a run that named its own face gives way to the new one (its colour, weight and italic stay)
    if (nd.runs?.some((r) => r.font)) next.runs = nd.runs.map((r) => {
      const { font: _f, ...rest } = r;
      return rest;
    });
    const trial = { ...nd, ...next } as TextNode;
    // the words never overflow their box in the new face: the size steps down until they fit
    const size = nd.autoHeight ? nd.size : Math.min(nd.size, fitSize(trial, measure));
    if (size !== nd.size) next.size = Math.round(size * 10) / 10;
    restore[nd.id] = { font: nd.font, weight: nd.weight, case: nd.case ?? 'none', tracking: nd.tracking, size: nd.size, ...(next.runs ? { runs: nd.runs } : {}) };
    ops.push({ op: 'update', id: nd.id, set: next as Record<string, unknown> });
  }
  ops.push({ op: 'tokens', set: { fonts: { display: set.display, body: set.body } } });
  return { ops, restore };
}

// ── ground ──

const BG_NAME = GROUND_NAME;
const GRAIN = { kind: 'grain', on: true, params: { amount: 22, size: 3, seed: 11 } } as const;

/**
 * A new ground: the ground that shows (ours, or the composition's own paper) takes the new fill — its texture kept for
 * a textured ground, cleared otherwise — and the artboard's colour follows the bottom of it. Only when nothing covers
 * the artboard is a ground of ours added beneath everything.
 */
function groundOps(board: Artboard, kind: 'flat' | 'gradient' | 'texture', colours: string[]): { ops: Op[]; id?: string; carrier?: string; nodes?: Record<string, Record<string, unknown>> } {
  const ops: Op[] = [];
  const bottom = colours[colours.length - 1];
  ops.push({ op: 'artboard-update', id: board.id, set: { background: bottom } });
  const fill: Paint = colours.length > 1 ? ({ type: 'linear', angle: 180, stops: colours.map((c, i) => ({ at: Math.round((i / (colours.length - 1)) * 100) / 100, color: c })) } as Paint) : colours[0];
  const carrier = groundCarrier(board);
  if (carrier) {
    const effects = kind === 'texture' ? [...(carrier.effects ?? []).filter((e) => e.kind !== 'grain'), { ...GRAIN, params: { ...GRAIN.params } }] : (carrier.effects ?? []).filter((e) => !/^(grain|noise)$/.test(e.kind));
    ops.push({ op: 'update', id: carrier.id, set: { fill, effects } });
    return { ops, carrier: carrier.id, nodes: { [carrier.id]: { fill: carrier.fill, effects: carrier.effects ?? [] } } };
  }
  if (kind === 'flat') return { ops };
  const id = newId('cg');
  const node: ShapeNode = {
    id,
    type: 'shape',
    shape: 'rect',
    role: 'background',
    name: BG_NAME,
    decorative: true,
    x: -board.bleed,
    y: -board.bleed,
    w: board.width + board.bleed * 2,
    h: board.height + board.bleed * 2,
    rotation: 0,
    opacity: 1,
    fill,
    ...(kind === 'texture' ? { effects: [{ ...GRAIN, params: { ...GRAIN.params } }] } : {}),
  };
  ops.push({ op: 'add', artboard: board.id, node, index: 0 });
  return { ops, id };
}

// ── forms ──

/** The engine's own decoration, as units: top-level motif shapes, and groups holding nothing but decoration. */
function engineMotifs(board: Artboard, ours: readonly string[]): { node: Node; index: number }[] {
  const decoration = (nd: Node): boolean => (nd.type === 'group' ? nd.children.length > 0 && nd.children.every(decoration) : nd.type !== 'text' && nd.type !== 'image' && nd.type !== 'chart' && (nd.role === 'motif' || (!!nd.decorative && nd.role !== 'background')));
  return board.children.map((node, index) => ({ node, index })).filter(({ node }) => !node.locked && !ours.includes(node.id) && node.role !== 'logo' && node.role !== 'background' && decoration(node));
}

/** Where new forms go in the drawing order: after the ground, beneath everything else. */
const formIndex = (board: Artboard) => {
  let i = 0;
  while (i < board.children.length && board.children[i].role === 'background') i++;
  return i;
};

/** What forms must stay off: the words, the logo, pictures, data — with a margin. */
function avoidOf(board: Artboard): Rect[] {
  const pad = Math.min(board.width, board.height) * 0.025;
  return walk(board)
    .filter((l) => !l.node.hidden && (l.node.type === 'text' || l.node.type === 'image' || l.node.type === 'chart' || ['logo', 'cta', 'data', 'image'].includes(l.node.role ?? '')))
    .map((l) => ({ x: l.node.x - pad, y: l.node.y - pad, w: l.node.w + pad * 2, h: l.node.h + pad * 2 }));
}

function formColours(kind: FormKind, p: Palette, theme: Theme | null): { color: string; color2: string; color3: string } {
  const dark = contrastRatio(p.ground, '#000000') < 7;
  if (kind === 'cloud' || kind === 'snow') {
    if (dark) return { color: mix(p.support[0] ?? '#c9d6ee', '#ffffff', 0.35), color2: mix(p.support[0] ?? '#c9d6ee', p.ground, 0.35), color3: mix(p.ground, '#ffffff', 0.35) };
    return { color: '#ffffff', color2: mix('#ffffff', p.ground, 0.45), color3: mix(p.ground, p.ink, 0.1) };
  }
  if (kind === 'line' || kind === 'grid' || kind === 'ring') return { color: p.accent, color2: p.support[0] ?? mix(p.accent, p.ground, 0.4), color3: mix(p.ink, p.ground, 0.7) };
  if (theme && (kind === theme.forms || kind === theme.forms2) && p.support.length) return { color: p.support[0], color2: p.accent, color3: p.support[1] ?? mix(p.support[0], p.ground, 0.4) };
  return { color: p.accent, color2: p.support[0] ?? mix(p.accent, p.ground, 0.35), color3: mix(p.accent, p.ground, 0.55) };
}

/** Forms drawn for a state, placed off the words, as nodes to add (beneath the words) and their ids. */
function formsFor(board: Artboard, state: NonNullable<CreativeState['forms']>, p: Palette, depth: number, theme: Theme | null, secondary?: FormKind): { nodes: Node[]; ids: string[] } {
  const nodes: Node[] = [];
  const avoid = avoidOf(board);
  const cols = formColours(state.kind, p, theme);
  const boxes = placeForms(state.kind, board.width, board.height, avoid, state.count, state.scale, state.seed);
  // on a dark ground, lines, grids and rings in a luminous accent glow (neon, a screen)
  const lit = contrastRatio(p.ground, '#000000') < 3 && ['line', 'grid', 'ring', 'sparkle'].includes(state.kind) ? cols.color : undefined;
  boxes.forEach((box, i) => nodes.push(...drawForm(state.kind, box, { ...cols, abstraction: state.abstraction, depth, ...(lit ? { glow: lit } : {}) }, state.seed * 31 + i * 7)));
  if (secondary && secondary !== 'none') {
    const small = placeForms(secondary, board.width, board.height, [...avoid, ...boxes], secondary === 'sparkle' || secondary === 'drop' || secondary === 'snow' ? 7 : 2, state.scale * 0.8, state.seed + 101);
    const c2 = formColours(secondary, p, theme);
    small.forEach((box, i) => nodes.push(...drawForm(secondary, box, { ...c2, abstraction: state.abstraction, depth: Math.min(depth, 1) }, state.seed * 17 + i * 13)));
  }
  return { nodes, ids: nodes.map((x) => x.id) };
}

// ── the plan, resolved: explicit changes first, then what themes and qualities imply for what is left ──

interface Resolved {
  theme: Theme | null;
  identity: boolean;
  mode?: 'light' | 'dark';
  palette?: { shifts: PaletteShift[]; colours?: Partial<Palette>; from?: GraphicDoc; base?: Palette };
  type?: { character?: TypeCharacter; display?: string; body?: string; weight?: 'lighter' | 'heavier'; case?: 'upper' | 'none'; from?: GraphicDoc };
  composition?: { action: CompositionAction; from?: GraphicDoc };
  forms?: { kind?: FormKind; abstraction?: number; delta?: number; count?: number; scale?: number; remove?: boolean; from?: GraphicDoc };
  background?: { kind?: 'flat' | 'gradient' | 'texture'; colours?: string[]; tone?: string; from?: GraphicDoc };
  depth?: { delta?: number; level?: number };
  qualities: string[];
  content: { role: string; text: string }[];
  objects: string[];
  reverts: DecisionKey[];
}

function resolve(plan: CreativePlan, ctx: ExecContext, hasForms: boolean): Resolved {
  const out: Resolved = { theme: null, identity: /\b(identity|brand|branding|whole look|everything)\b/i.test(ctx.said), qualities: [], content: [], objects: [], reverts: [] };
  const kept = new Set<string>(plan.keep);
  const from = (ref?: string) => (ref ? conceptRef(ctx.concepts, ref)?.doc : undefined);
  for (const c of plan.changes) {
    switch (c.decision) {
      case 'theme':
        out.theme = themeById(c.theme);
        if (c.mode) out.mode = c.mode;
        if (c.forms || c.abstraction !== undefined) out.forms = { ...(out.forms ?? {}), ...(c.forms ? { kind: c.forms } : {}), ...(c.abstraction !== undefined ? { abstraction: c.abstraction } : {}) };
        break;
      case 'palette':
        out.palette = { shifts: [...(out.palette?.shifts ?? []), ...(c.shifts ?? [])], ...(c.colours ? { colours: { ...(out.palette?.colours ?? {}), ...c.colours } } : out.palette?.colours ? { colours: out.palette.colours } : {}), ...(from(c.from) ? { from: from(c.from) } : {}) };
        break;
      case 'type':
        out.type = { ...(out.type ?? {}), ...c, ...(from(c.from) ? { from: from(c.from) } : {}) } as Resolved['type'];
        break;
      case 'composition':
        out.composition = { action: c.action, ...(from(c.from) ? { from: from(c.from) } : {}) };
        break;
      case 'forms':
        out.forms = { ...(out.forms ?? {}), ...c, ...(from(c.from) ? { from: from(c.from) } : {}) } as Resolved['forms'];
        break;
      case 'background':
        out.background = { ...(out.background ?? {}), ...c, ...(from(c.from) ? { from: from(c.from) } : {}) } as Resolved['background'];
        break;
      case 'depth':
        out.depth = { ...(out.depth ?? {}), ...c };
        break;
      case 'mood':
        out.qualities.push(...c.qualities);
        break;
      case 'content':
        out.content.push({ role: c.role, text: c.text });
        break;
      case 'object':
        out.objects.push(c.words);
        break;
      case 'revert':
        out.reverts.push(c.target);
        break;
      case 'concept':
        break;
    }
  }
  // a theme: its palette, its forms, its ground and depth (and its type only when the whole identity changes)
  const t = out.theme;
  if (t) {
    if (!out.palette && !kept.has('palette')) out.palette = { shifts: [] };
    if (!kept.has('forms')) out.forms = { kind: t.forms, abstraction: t.abstraction, count: undefined, ...(out.forms ?? {}) };
    if (!out.background && !kept.has('background')) out.background = { kind: 'gradient', tone: 'theme' };
    if (!out.depth && !kept.has('depth')) out.depth = { level: t.depth };
    if (out.identity && !out.type && !kept.has('type')) out.type = { character: t.type };
  }
  // qualities: their moves, for what nothing explicit already decides and nothing kept forbids
  for (const id of out.qualities) {
    const q = qualityById(id);
    if (!q) continue;
    if (q.palette && !kept.has('palette') && !out.palette?.colours) out.palette = { ...(out.palette ?? { shifts: [] }), shifts: [...(out.palette?.shifts ?? []), ...q.palette] };
    if (q.type && !kept.has('type') && !out.type) out.type = { character: q.type };
    // a quality keeps the composition as it is — only asking for something original re-conceives it (more room, an
    // asymmetric layout and the like are re-laid out when they are asked for in so many words)
    if (q.composition === 'unexpected' && !kept.has('composition') && !out.composition) out.composition = { action: 'unexpected' };
    if (q.forms && !kept.has('forms')) {
      const f = out.forms ?? {};
      out.forms = { ...f, ...(q.forms.kind && !f.kind && (!hasForms || q.forms.replace) ? { kind: q.forms.kind } : {}), ...(q.forms.abstraction !== undefined && f.abstraction === undefined ? { delta: (f.delta ?? 0) + q.forms.abstraction } : {}), ...(q.forms.count !== undefined ? { count: (f.count ?? 0) + q.forms.count } : {}), ...(q.forms.scale !== undefined ? { scale: (f.scale ?? 0) + q.forms.scale } : {}) };
    }
    if (q.depth !== undefined && !kept.has('depth') && out.depth?.level === undefined) out.depth = { delta: (out.depth?.delta ?? 0) + q.depth };
    if (q.background && !kept.has('background') && !out.background) out.background = { kind: q.background };
  }
  // "keep" always wins
  if (kept.has('palette')) delete out.palette;
  if (kept.has('type')) delete out.type;
  if (kept.has('composition')) delete out.composition;
  if (kept.has('forms')) delete out.forms;
  if (kept.has('background')) delete out.background;
  if (kept.has('depth')) delete out.depth;
  return out;
}

// ── carrying it out ──

export function executePlan(doc0: GraphicDoc, plan: CreativePlan, ctx: ExecContext): Executed | null {
  const measure = ctx.measure ?? approxMeasure;
  const now = ctx.now ?? Date.now();
  const turn = ctx.turn ?? (boardOf(doc0, ctx.board).creative?.qualities?.length ?? 0) + (doc0.revision ?? 0);
  const b00 = boardOf(doc0, ctx.board);
  const R = resolve(plan, ctx, creativeFormIds(doc0, b00).length > 0 || engineMotifs(b00, []).length > 0);
  let doc = clone(doc0);
  const boardId = boardOf(doc, ctx.board).id;
  const board = () => boardOf(doc, boardId);
  const done: string[] = [];
  const kept: string[] = [];
  const notes: string[] = [];
  const changed: DecisionKey[] = [];
  const rec: CreativeRecord = clone(boardOf(doc, ctx.board).creative ?? {});
  const history: NonNullable<CreativeRecord['history']> = rec.history ?? {};
  const sources: NonNullable<CreativeRecord['sources']> = rec.sources ?? {};
  const stateNow = (): CreativeState => ({ ...(rec.theme ? { theme: rec.theme } : {}), ...(rec.forms ? { forms: clone(rec.forms) } : {}), ...(rec.background ? { background: clone(rec.background) } : {}), ...(rec.depth !== undefined ? { depth: rec.depth } : {}), ...(rec.qualities ? { qualities: [...rec.qualities] } : {}), ...(rec.character ? { character: rec.character } : {}) });
  const note = (k: DecisionKey, restore: Restore, by: DecisionSource['by'] = 'you', fromName?: string) => {
    history[k] = [...(history[k] ?? []), { said: ctx.said.slice(0, 240), at: now, restore: { ...restore, ...(sources[k] ? { source: sources[k] } : {}) } as Restore }].slice(-3);
    sources[k] = { by, said: ctx.said.slice(0, 240), at: now, ...(fromName ? { from: fromName } : {}) };
    if (!changed.includes(k)) changed.push(k);
  };
  const apply = (ops: Op[], what: string): boolean => {
    if (!ops.length) return true;
    const r = applyOps(doc, ops);
    if (!r.ok) {
      notes.push(`${what}: ${r.error}`);
      return false;
    }
    doc = r.doc;
    return true;
  };
  const decisions = () => readDecisions(doc, boardId, ctx.dir);
  const depthNow = () => clamp(R.depth?.level ?? (rec.depth ?? decisions().depth) + (R.depth?.delta ?? 0), 0, 3);
  /** Our forms drawn again, same kind, place and seed, in the colours of the palette now on the design. */
  const recolourForms = () => {
    const ours = creativeFormIds(doc, board());
    if (!rec.forms || !ours.length) return;
    const b = board();
    const temp = clone(b);
    temp.children = temp.children.filter((x) => !ours.includes(x.id));
    const theme = themeById(rec.theme);
    const drawn = formsFor(temp, rec.forms, decisions().palette, depthNow(), theme, theme && rec.forms.kind === theme.forms ? theme.forms2 : undefined);
    const at = Math.max(0, formIndex(temp));
    const ops: Op[] = [...ours.map((id) => ({ op: 'remove', id }) as Op), ...drawn.nodes.map((nd, i) => ({ op: 'add', artboard: boardId, node: nd, index: at + i }) as Op)];
    if (apply(ops, 'The forms in the new colours')) rec.forms = { ...rec.forms, ids: drawn.ids };
  };

  // 0. a decision turned down: put back as it was before its last change, nothing else touched
  for (const key of R.reverts) {
    const entry = history[key]?.pop();
    if (!entry) {
      notes.push(`The ${DECISION_LABEL[key].toLowerCase()} has not been changed here yet, so there is nothing to put back.`);
      continue;
    }
    const ops: Op[] = [];
    const r = entry.restore;
    // the forms there now go, whatever they were redrawn as since (a palette change redraws them in its colours)
    const gone = new Set([...(r.added ?? []), ...(key === 'forms' ? creativeFormIds(doc, board()) : [])]);
    for (const id of gone) if (walk(board()).some((l) => l.node.id === id)) ops.push({ op: 'remove', id });
    for (const x of [...(r.removed ?? [])].sort((a, b) => a.index - b.index)) ops.push({ op: 'add', artboard: boardId, node: x.node, index: x.index });
    for (const [id, set] of Object.entries(r.nodes ?? {})) if (walk(board()).some((l) => l.node.id === id) || (r.removed ?? []).some((x) => x.node.id === id)) ops.push({ op: 'update', id, set });
    if (r.tokens) ops.push({ op: 'tokens', set: r.tokens as unknown as Record<string, unknown> });
    if (r.background !== undefined) ops.push({ op: 'artboard-update', id: boardId, set: { background: r.background } });
    if (apply(ops, `Putting the ${DECISION_LABEL[key].toLowerCase()} back`)) {
      if (r.state) Object.assign(rec, r.state);
      const prev = (r as Restore & { source?: DecisionSource }).source;
      if (prev) sources[key] = prev;
      else delete sources[key];
      done.push(`the ${DECISION_LABEL[key].toLowerCase()} put back as it was before “${entry.said.slice(0, 60)}”`);
      if (!changed.includes(key)) changed.push(key);
      if (key === 'palette' || key === 'forms') recolourForms();
    }
  }

  // forms decided before a new composition are drawn again on it, in place of its own new motifs
  let reapply = false;
  // 1. the composition: re-conceived by the engine, the words, pictures, style and anything locked kept
  if (R.composition) {
    const c = R.composition;
    const keepType = plan.keep.includes('type');
    const edits: Record<CompositionAction, CreativeEdit> = {
      rethink: { label: 'the composition rethought', size: 'large', constraints: { keepType } },
      unexpected: { label: 'a composition away from the usual arrangement', size: 'large', constraints: { unexpected: true, unconventional: true, notAiLook: true, keepType } },
      alternative: { label: 'another interpretation of the same concept', size: 'large', constraints: { keepType } },
      airy: { label: 'more space around everything', size: 'small', constraints: { negativeSpace: 72 } },
      denser: { label: 'a fuller composition', size: 'small', constraints: { negativeSpace: 22 } },
      asymmetric: { label: 'an asymmetric, moving composition', size: 'small', constraints: { asymmetric: true, dynamic: true } },
      centred: { label: 'the headline at the centre', size: 'small', constraints: { headlineCentral: true } },
    };
    const b0 = board();
    const before = b0.children.map((x, index) => ({ node: clone(x), index }));
    const groundBefore = decisions().background;
    const dir = ctx.dir ?? { name: doc.direction?.name ?? 'This design', language: doc.direction?.language ?? 'editorial', tokens: doc.tokens, look: { case: 'sentence' as const, tracking: 'normal' as const, weight: 600 }, form: null, intensity: 50 };
    const r = b0.format ? recomposeArtboard(doc, boardId, edits[c.action], { dir, kind: ctx.kind, measure, turn }) : null;
    if (r) {
      doc = r.doc;
      note('composition', before.length <= 160 ? { removed: before, added: board().children.map((x) => x.id), state: stateNow() } : { state: stateNow() });
      done.push(edits[c.action].label);
      // what was decided since the concept was made goes back onto the new composition (its ground, its forms)
      if (rec.background && !R.background) R.background = { kind: groundBefore.kind, colours: groundBefore.colours };
      if (rec.forms) {
        R.forms = { ...(R.forms ?? {}), kind: R.forms?.kind ?? rec.forms.kind, abstraction: R.forms?.abstraction ?? clamp(rec.forms.abstraction + (R.forms?.delta ?? 0), 0, 100) };
        delete R.forms.delta;
        reapply = true;
      }
    } else notes.push('This artboard cannot be re-composed (it was not made by the composer, or has no headline), so its composition was kept.');
  }

  // 2. colour
  if (R.palette) {
    if (doc.locks?.colors) kept.push('the colours (they are locked — unlock them to change the palette)');
    else {
      const d = decisions();
      let p: Palette = R.palette.from ? readDecisions(R.palette.from).palette : { ground: d.palette.ground, ink: d.palette.ink, accent: d.palette.accent, support: d.palette.support };
      if (R.theme && !R.palette.from) {
        const mode = R.mode ?? (R.palette.shifts.includes('darker') ? 'dark' : R.palette.shifts.includes('lighter') ? 'light' : d.palette.mode === 'dark' && R.theme.prefers === 'dark' ? 'dark' : R.theme.prefers);
        p = clone(mode === 'dark' ? R.theme.dark : R.theme.light);
      }
      for (const sh of R.palette.shifts) p = shiftPalette(p, sh);
      if (R.palette.colours) p = { ...p, ...R.palette.colours, support: R.palette.colours.support ?? p.support };
      const tokens = tokensOf(p);
      const b = board();
      const carrier = groundCarrier(b);
      const graded = carrier && !carrier.locked && stopsOf(carrier.fill).length > 1 ? carrier : null;
      const r = repaint(doc, b, tokens, graded ? [graded.id] : []);
      const restore: Restore = { tokens: clone(doc.tokens), background: b.background, nodes: r.restore, state: { ...(rec.background ? { background: clone(rec.background) } : {}) } };
      let regraded: string[] | null = null;
      if (graded) {
        const t0 = doc.tokens;
        const stops = stopsOf(graded.fill);
        regraded = regrade(
          stops.map((x) => x.color),
          { ground: b.background || t0.colors.background, partners: [t0.colors.accent, t0.accent2 ?? t0.colors.accent, t0.colors.muted, t0.colors.text] },
          { ground: tokens.colors.background, partners: [tokens.colors.accent, tokens.accent2 ?? tokens.colors.accent, tokens.colors.muted, tokens.colors.text] },
        );
        r.ops.unshift({ op: 'update', id: graded.id, set: { fill: { ...(graded.fill as object), stops: stops.map((x, i) => ({ ...x, color: regraded![i] + x.color.slice(7) })) } } });
        restore.nodes = { ...(restore.nodes ?? {}), [graded.id]: { fill: graded.fill } };
      }
      if (apply(r.ops, 'The palette')) {
        if (regraded && rec.background) rec.background = { ...rec.background, colours: regraded };
        // the forms take the new colours (unless new forms are drawn below anyway)
        if (!R.forms) recolourForms();
        note('palette', restore, R.palette.from ? 'concept' : 'you', R.palette.from?.name);
        done.push(R.palette.from ? `the colours of “${R.palette.from.name}”` : R.theme ? `the ${R.theme.label} palette` : `the colour ${R.palette.shifts.join(', ') || 'changed'}`);
        if (r.logoMoved) notes.push('The logo’s colours moved with the palette so it stays visible on the new ground.');
      }
    }
  }

  // 3. typography
  if (R.type) {
    if (doc.locks?.fonts) kept.push('the typefaces (they are locked — unlock them to change the type)');
    else {
      const d = decisions();
      const src = R.type.from ? readDecisions(R.type.from).type : null;
      const base = R.type.character ? typeSetFor(R.type.character, { display: d.type.display, body: d.type.body }, turn) : null;
      const display = R.type.display ?? src?.display ?? base?.display ?? d.type.display;
      const body = R.type.body ?? src?.body ?? base?.body ?? d.type.body;
      let weight = src?.weight ?? base?.weight ?? d.type.weight;
      if (R.type.weight === 'heavier') weight = Math.min(900, weight + 200);
      if (R.type.weight === 'lighter') weight = Math.max(300, weight - 200);
      const kase = R.type.case ?? src?.case ?? base?.case ?? d.type.case;
      if (fontOk(display) && fontOk(body)) {
        const r = retype(doc, board(), { display, body, weight, case: kase, tracking: base?.tracking ?? 0 }, measure);
        const restore: Restore = { nodes: r.restore, tokens: clone(doc.tokens), state: { ...(rec.character ? { character: rec.character } : {}) } };
        if (apply(r.ops, 'The typography')) {
          if (R.type.character) rec.character = R.type.character;
          note('type', restore, R.type.from ? 'concept' : 'you', R.type.from?.name);
          done.push(R.type.from ? `the typography of “${R.type.from.name}”: ${display}` : `the type set in ${display}${body !== display ? ` with ${body}` : ''}${R.type.character ? ` (${CHARACTER_LABEL[R.type.character]})` : ''}`);
        }
      }
    }
  }

  // 4. the ground
  if (R.background) {
    const d = decisions();
    const b = board();
    const p = d.palette;
    const src = R.background.from ? readDecisions(R.background.from).background : null;
    let kind = R.background.kind ?? src?.kind ?? (R.background.tone ? (d.background.kind === 'gradient' ? 'gradient' : 'flat') : d.background.kind === 'gradient' ? 'flat' : 'gradient');
    let colours = R.background.colours ?? src?.colours ?? [];
    if (!colours.length) {
      if (R.background.tone === 'theme' && R.theme) colours = [...(d.palette.mode === 'dark' ? R.theme.sky.dark : R.theme.sky.light)];
      else if (R.background.tone === 'darker') colours = [mix(p.ground, '#000000', 0.35)];
      else if (R.background.tone === 'lighter') colours = [mix(p.ground, '#ffffff', 0.45)];
      else colours = kind === 'flat' ? [mix(p.ground, p.accent, p.mode === 'dark' ? 0.22 : 0.18)] : [mix(p.ground, p.accent, p.mode === 'dark' ? 0.22 : 0.2), p.ground];
    }
    if (kind === 'gradient' && colours.length < 2) colours = [mix(colours[0], p.accent, 0.12), colours[0]];
    if (kind === 'texture' && !colours.length) colours = [p.ground];
    const r = groundOps(b, kind as 'flat' | 'gradient' | 'texture', colours);
    const restore: Restore = { background: b.background, ...(r.id ? { added: [r.id] } : {}), ...(r.nodes ? { nodes: r.nodes } : {}), state: { ...(rec.background ? { background: clone(rec.background) } : {}) } };
    if (apply(r.ops, 'The ground')) {
      rec.background = { kind: kind as 'flat' | 'gradient' | 'texture', colours, ...(r.id ?? r.carrier ? { id: (r.id ?? r.carrier)! } : {}) };
      // the words stay readable on the new ground (their colour moves only if they would not be)
      const ground = colours[colours.length - 1];
      const fixes: Op[] = [];
      for (const l of walk(board())) {
        const nd = l.node;
        if (nd.type !== 'text' || nd.locked || l.parents.length) continue;
        if (contrastRatio(hex7(nd.color), ground) >= 3) continue;
        const ink = [p.ink, doc.tokens.colors.text].find((c) => c && contrastRatio(hex7(c), ground) >= 4.5);
        fixes.push({ op: 'update', id: nd.id, set: { color: ink ? hex7(ink) : contrastRatio('#111111', ground) > contrastRatio('#ffffff', ground) ? '#111111' : '#ffffff' } });
      }
      apply(fixes, 'The words on the new ground');
      note('background', restore, R.background.from ? 'concept' : 'you', R.background.from?.name);
      const tone = R.background.tone === 'darker' ? 'a darker ground' : R.background.tone === 'lighter' ? 'a lighter ground' : '';
      done.push(kind === 'gradient' ? (R.theme ? `a ${R.theme.label} ground, graded` : tone ? `${tone}, graded` : 'a graded ground') : kind === 'texture' ? `${tone || 'a'} textured ground`.replace('a darker textured', 'a darker, textured').replace('a lighter textured', 'a lighter, textured') : tone ? `${tone}, flat` : 'a flat ground');
    }
  }

  // 5. the forms
  if (R.forms && !R.forms.kind && !R.forms.remove && !R.forms.from && !creativeFormIds(doc, board()).length && !(R.forms.count && R.forms.count > 0)) {
    // the engine's own shapes, made fewer or larger in place (no new kind of form was asked for)
    const b = board();
    const engine = engineMotifs(b, []);
    const ops: Op[] = [];
    const removed: { node: Node; index: number }[] = [];
    const nodes: Record<string, Record<string, unknown>> = {};
    if (R.forms.count && R.forms.count < 0 && engine.length > 1) {
      const drop = Math.min(engine.length - 1, Math.round(engine.length * -R.forms.count));
      for (const l of [...engine].sort((p, q) => p.node.w * p.node.h - q.node.w * q.node.h).slice(0, drop)) {
        removed.push({ node: clone(l.node), index: b.children.findIndex((x) => x.id === l.node.id) });
        ops.push({ op: 'remove', id: l.node.id });
      }
    }
    if (R.forms.scale) {
      const k = clamp(1 + R.forms.scale, 0.5, 1.8);
      for (const l of engine) {
        if (removed.some((x) => x.node.id === l.node.id)) continue;
        const nd = l.node;
        nodes[nd.id] = { x: nd.x, y: nd.y, w: nd.w, h: nd.h };
        ops.push({ op: 'resize', id: nd.id, x: nd.x - (nd.w * (k - 1)) / 2, y: nd.y - (nd.h * (k - 1)) / 2, w: nd.w * k, h: nd.h * k });
      }
    }
    if (ops.length && apply(ops, 'The shapes')) {
      note('forms', { removed, nodes });
      done.push(removed.length ? `${removed.length} of the shapes taken out, the strongest kept` : `the shapes ${R.forms.scale && R.forms.scale > 0 ? 'larger' : 'smaller'}`);
    }
  } else if (R.forms) {
    const b = board();
    const d = decisions();
    const ours = creativeFormIds(doc, b);
    const engine = engineMotifs(b, ours).map((x) => ({ node: x.node }));
    const prev = rec.forms;
    // more forms asked for where there are none of ours yet: added beside the engine's, not in place of them
    const additive = !prev && !R.forms.kind && !R.forms.from && !!R.forms.count && R.forms.count > 0;
    const fromState = R.forms.from ? boardOf(R.forms.from).creative?.forms : undefined;
    const kind: FormKind = R.forms.remove ? 'none' : (R.forms.kind ?? fromState?.kind ?? prev?.kind ?? R.theme?.forms ?? 'organic');
    const baseCount = R.theme && kind === R.theme.forms ? R.theme.count : prev && prev.kind === kind ? prev.count : fromState?.count ?? (additive ? 3 : Math.max(3, Math.min(6, engine.length || 4)));
    const count = Math.round(clamp(additive ? baseCount : baseCount * (1 + (R.forms.count ?? 0)), kind === 'none' ? 0 : 1, 14));
    const abstraction = clamp(R.forms.abstraction ?? fromState?.abstraction ?? (prev && prev.kind === kind ? prev.abstraction : R.theme?.abstraction ?? 45) + (R.forms.delta ?? 0), 0, 100);
    const scale = clamp((prev && prev.kind === kind ? prev.scale : R.theme && kind === R.theme.forms ? R.theme.scale : 1) * (1 + (R.forms.scale ?? 0)), 0.4, 2.2);
    // new forms of a new kind take over from the motifs there; the same kind is redrawn in place (its seed kept)
    const replacing = !prev || prev.kind !== kind || !!R.forms.from || reapply;
    const seed = replacing ? ((now + turn * 97) % 100000) + 1 : prev!.seed;
    const remove = [...ours, ...((replacing && !additive) || kind === 'none' ? engine.map((l) => l.node.id) : [])];
    const removed = remove.map((id) => ({ node: clone(walk(b).find((l) => l.node.id === id)!.node), index: b.children.findIndex((x) => x.id === id) })).filter((x) => x.index >= 0);
    const ops: Op[] = remove.map((id) => ({ op: 'remove', id }) as Op);
    let ids: string[] = [];
    if (kind !== 'none') {
      const temp = clone(b);
      temp.children = temp.children.filter((x) => !remove.includes(x.id));
      const theme = R.theme ?? themeById(rec.theme);
      const drawn = formsFor(temp, { kind, abstraction, count, scale, seed, ids: [] }, d.palette, depthNow(), theme, theme && kind === theme.forms ? theme.forms2 : undefined);
      ids = drawn.ids;
      const at = Math.max(0, formIndex(temp));
      drawn.nodes.forEach((nd, i) => ops.push({ op: 'add', artboard: boardId, node: nd, index: at + i }));
    }
    const restore: Restore = { removed, added: ids, state: { ...(prev ? { forms: clone(prev) } : {}), ...(rec.theme ? { theme: rec.theme } : {}) } };
    if (apply(ops, 'The forms')) {
      rec.forms = kind === 'none' ? undefined : { kind, abstraction, count, scale, seed, ids };
      if (!rec.forms) delete rec.forms;
      note('forms', restore, R.forms.from ? 'concept' : 'you');
      if (kind !== 'none' && !ids.length) notes.push(`There is no room for ${FORM_LABEL[kind]} that would stay clear of the words in this composition, so none are drawn — say “more space” or “smaller ${FORM_LABEL[kind]}” and they will find a place.`);
      else done.push(kind === 'none' ? 'the forms taken out' : replacing ? `${FORM_LABEL[kind]}${engine.length && !prev ? ' in place of the shapes there' : prev && prev.kind !== kind ? ` in place of the ${FORM_LABEL[prev.kind]}` : ''}, ${abstraction < 35 ? 'literal' : abstraction < 70 ? 'stylised' : 'abstract'}` : `the ${FORM_LABEL[kind]} ${R.forms.delta && R.forms.delta > 0 ? 'more abstract' : R.forms.delta && R.forms.delta < 0 ? 'more literal' : R.forms.count && R.forms.count < 0 ? 'fewer' : R.forms.count && R.forms.count > 0 ? 'more of them' : R.forms.scale && R.forms.scale > 0 ? 'larger' : R.forms.scale && R.forms.scale < 0 ? 'smaller' : 'redrawn'}`);
    }
  }

  // 6. depth: distance and shadow (on the forms; a graded ground when it goes deep)
  if (R.depth) {
    const level = depthNow();
    const b = board();
    const restoreNodes: Record<string, Record<string, unknown>> = {};
    const ops: Op[] = [];
    const ours = new Set(creativeFormIds(doc, b));
    const shapes = walk(b).filter((l) => l.node.type === 'shape' && l.node.role === 'motif' && !l.node.locked && l.parents.length === 0);
    shapes.forEach((l, i) => {
      const nd = l.node as ShapeNode;
      const keepFx = (nd.effects ?? []).filter((e) => !/^(drop-shadow|blur|glow)$/.test(e.kind));
      const far = shapes.length > 1 ? 1 - i / (shapes.length - 1) : 0.3;
      const fx = [...keepFx];
      if (level >= 1 && far < 0.6) fx.push({ kind: 'drop-shadow', on: true, params: { dx: 0, dy: 4 + level * 4, blur: 12 + level * 10, spread: 0, opacity: 10 + level * 6 }, color: '#141a2e' });
      if (level >= 3 && far > 0.6) fx.push({ kind: 'blur', on: true, params: { radius: 1.5 + far * 2.5 } });
      const opacity = level >= 2 ? Math.round((1 - far * 0.4) * 100) / 100 : ours.has(nd.id) ? nd.opacity : 1;
      restoreNodes[nd.id] = { effects: nd.effects ?? [], opacity: nd.opacity };
      ops.push({ op: 'update', id: nd.id, set: { effects: fx, opacity } });
    });
    const restore: Restore = { nodes: restoreNodes, state: { ...(rec.depth !== undefined ? { depth: rec.depth } : {}) } };
    if (shapes.length && apply(ops, 'The depth')) {
      rec.depth = level;
      note('depth', restore);
      const said = level === 0 ? 'flat: no shadow, no distance' : level === 1 ? 'a little depth: soft shadows beneath the forms' : level === 2 ? 'depth: the forms layered by distance, with shadows' : 'atmospheric depth: far forms softened, near ones shadowed';
      done.push(R.depth.delta && R.depth.delta < 0 && level > 0 ? `flatter — ${said}` : said);
    } else if (!shapes.length) {
      rec.depth = level;
      if (!changed.includes('depth')) notes.push('There are no forms to give depth to yet — say a theme or “add organic forms” and they will be drawn with it.');
    }
  }

  // 7. the words, only as the person wrote them
  for (const c of R.content) {
    const target = walk(board()).find((l) => l.node.type === 'text' && l.node.role === c.role && !l.node.locked);
    if (!target) {
      notes.push(`There is no ${c.role} on this artboard to change.`);
      continue;
    }
    const n = target.node as TextNode;
    const trial = { ...n, text: c.text, runs: undefined } as TextNode;
    const size = n.autoHeight ? n.size : Math.min(n.size, fitSize(trial, measure));
    if (apply([{ op: 'update', id: n.id, set: { text: c.text, runs: undefined, ...(size !== n.size ? { size } : {}) } }], `The ${c.role}`)) done.push(`the ${c.role} now reads “${c.text}”`);
  }

  // 8. what was said about one object goes to the precise reader, on the design as it now is
  for (const words of R.objects) {
    const e = readGraphicEdit(words, doc, { artboard: boardId, selection: [], dir: ctx.dir ?? null, measure, kind: ctx.kind });
    if (!e) {
      notes.push(`“${words.slice(0, 60)}” — say which object (the headline, the logo, the background picture) and what about it should change.`);
      continue;
    }
    if (e.question && !e.ops.length && !e.next) {
      notes.push(e.question);
      continue;
    }
    if (e.next) {
      doc = e.next;
      done.push(e.label);
    } else if (apply(e.ops, e.label)) done.push(e.label);
  }

  // 9. the mood recorded (themes and qualities said, newest last)
  if (R.theme || R.qualities.length) {
    const restore: Restore = { state: { ...(rec.theme ? { theme: rec.theme } : {}), ...(rec.qualities ? { qualities: [...rec.qualities] } : {}) } };
    if (R.theme) rec.theme = R.theme.id;
    if (R.qualities.length) rec.qualities = [...(rec.qualities ?? []).filter((q) => !R.qualities.includes(q)), ...R.qualities].slice(-8);
    note('mood', restore);
  }
  for (const k of plan.keep) kept.push(k === 'type' ? 'the typography' : k === 'palette' ? 'the colours' : k === 'words' ? 'the words' : `the ${k}`);

  if (!done.length && !R.reverts.length) {
    if (notes.length) return { doc: doc0, done, kept, notes, changed: [], label: plan.summary };
    return null;
  }
  rec.history = history;
  rec.sources = sources;

  // checked and repaired before it is shown (contrast, overflow, the safe margin) — this artboard only: the others
  // were not asked to change
  const mine = board();
  const checked = refineDoc({ ...doc, artboards: [mine] }, measure);
  const fixedBoard = { ...(checked.doc.artboards[0] ?? mine), creative: rec };
  doc = { ...doc, artboards: doc.artboards.map((b) => (b.id === boardId ? fixedBoard : b)) };
  if (checked.fixed.length) notes.push(`Fixed before showing: ${checked.fixed.slice(0, 3).map((f) => f.replace(/\.$/, '')).join('; ')}.`);
  return { doc, done, kept, notes, changed, label: plan.summary.slice(0, 120) };
}

/** A concept's decisions put on another design (combining concepts): the plan that takes them. */
export function takeFrom(ref: string, keys: readonly DecisionKey[], summary: string): CreativePlan {
  const changes: Change[] = [];
  for (const k of keys) {
    if (k === 'palette') changes.push({ decision: 'palette', from: ref });
    if (k === 'type') changes.push({ decision: 'type', from: ref });
    if (k === 'forms') changes.push({ decision: 'forms', from: ref });
    if (k === 'background') changes.push({ decision: 'background', from: ref });
    if (k === 'composition') changes.push({ decision: 'composition', action: 'alternative', from: ref });
  }
  return { intent: 'concept', summary, keep: [], changes, by: 'reader' };
}
