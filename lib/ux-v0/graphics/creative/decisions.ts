// lib/ux-v0/graphics/creative/decisions.ts — a concept's creative decisions, as a structured record kept with it.
//
// A concept is not a picture to accept or reject: it is a set of decisions — its colour, its typography, its
// composition, its forms, its ground, its depth, its mood — each changeable on its own. Some are read from the design
// itself (the palette from its tokens and ground, the type from its words, the composition from the concept the engine
// recorded); the rest are kept here as they are decided (the theme, the forms and how abstract they are, the depth, the
// qualities asked for). Every decision says where it came from (the engine, the person, another concept), and keeps
// what would restore it, so one decision can be turned down without touching the others.

import { walk, type Artboard, type GraphicDoc, type Node, type ShapeNode, type TextNode, type Tokens } from '../doc';
import type { GraphicDirection } from '../compose';
import { FORM_KINDS, FORM_LABEL, type FormKind } from './forms';
import { CHARACTER_LABEL, characterOfFace, qualityById, themeById, TYPE_CHARACTERS, type Palette, type TypeCharacter } from './lexicon';

export const DECISION_KEYS = ['palette', 'type', 'composition', 'forms', 'background', 'depth', 'mood'] as const;
export type DecisionKey = (typeof DECISION_KEYS)[number];

export const DECISION_LABEL: Record<DecisionKey, string> = {
  palette: 'Colour',
  type: 'Typography',
  composition: 'Composition',
  forms: 'Forms',
  background: 'Ground',
  depth: 'Depth',
  mood: 'Mood',
};

/** What brings a decision back exactly as it was (a reverted decision touches nothing else). */
export interface Restore {
  tokens?: Tokens;
  /** per node: the properties the change set, as they were */
  nodes?: Record<string, Record<string, unknown>>;
  /** nodes the change removed, with where they were */
  removed?: { node: Node; index: number }[];
  /** nodes the change added */
  added?: string[];
  /** the artboard's ground */
  background?: string | null;
  /** the creative state's own fields as they were */
  state?: CreativeState;
}

export interface DecisionSource {
  by: 'engine' | 'you' | 'concept';
  said?: string;
  at: number;
  /** the concept a decision was taken from */
  from?: string;
}

export interface CreativeState {
  theme?: string;
  forms?: { kind: FormKind; abstraction: number; count: number; scale: number; seed: number; ids: string[] };
  background?: { kind: 'flat' | 'gradient' | 'texture'; colours: string[]; id?: string };
  depth?: number;
  qualities?: string[];
  character?: TypeCharacter;
}

export interface CreativeRecord extends CreativeState {
  sources?: Partial<Record<DecisionKey, DecisionSource>>;
  /** what reverting each decision restores, newest last (three kept per decision) */
  history?: Partial<Record<DecisionKey, { said: string; at: number; restore: Restore }[]>>;
}

const MAX_HISTORY = 3;
const MAX_NODES = 160;

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[A-Za-z][\w-]{0,47}$/;

function normalizeState(v: unknown): CreativeState {
  const r = o(v);
  const out: CreativeState = {};
  if (themeById(s(r.theme, 24))) out.theme = s(r.theme, 24);
  const f = o(r.forms);
  if ((FORM_KINDS as readonly string[]).includes(f.kind)) out.forms = { kind: f.kind, abstraction: n(f.abstraction, 0, 100, 40), count: Math.round(n(f.count, 0, 24, 4)), scale: n(f.scale, 0.3, 2.5, 1), seed: Math.round(n(f.seed, 0, 1e9, 1)), ids: (Array.isArray(f.ids) ? f.ids : []).filter((x: unknown): x is string => typeof x === 'string' && ID.test(x)).slice(0, 80) };
  const b = o(r.background);
  if (['flat', 'gradient', 'texture'].includes(b.kind)) out.background = { kind: b.kind, colours: (Array.isArray(b.colours) ? b.colours : []).filter((c: unknown): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 4), ...(typeof b.id === 'string' && ID.test(b.id) ? { id: b.id } : {}) };
  if (typeof r.depth === 'number') out.depth = Math.round(n(r.depth, 0, 3, 0));
  if (Array.isArray(r.qualities)) out.qualities = r.qualities.filter((q: unknown): q is string => typeof q === 'string' && !!qualityById(q)).slice(-8);
  if ((TYPE_CHARACTERS as readonly string[]).includes(r.character)) out.character = r.character;
  return out;
}

/** Nodes kept for a restore: plain objects with an id and a type, bounded (they are checked again when re-added). */
const nodesOk = (xs: unknown): { node: Node; index: number }[] =>
  (Array.isArray(xs) ? xs : [])
    .filter((x) => o(o(x).node).id && typeof o(o(x).node).type === 'string')
    .slice(0, MAX_NODES)
    .map((x) => ({ node: o(x).node as Node, index: Math.round(n(o(x).index, 0, 10_000, 0)) }));

function normalizeRestore(v: unknown): Restore | null {
  const r = o(v);
  const out: Restore = {};
  if (r.tokens && o(r.tokens).colors) out.tokens = r.tokens as Tokens;
  if (r.nodes && typeof r.nodes === 'object') {
    const entries = Object.entries(o(r.nodes)).filter(([id]) => ID.test(id)).slice(0, MAX_NODES);
    out.nodes = Object.fromEntries(entries.map(([id, set]) => [id, o(set)]));
  }
  const removed = nodesOk(r.removed);
  if (removed.length) out.removed = removed;
  if (Array.isArray(r.added)) out.added = r.added.filter((x: unknown): x is string => typeof x === 'string' && ID.test(x)).slice(0, MAX_NODES);
  if (r.background === null || (typeof r.background === 'string' && HEX.test(r.background.slice(0, 7)))) out.background = r.background;
  if (r.state) out.state = normalizeState(r.state);
  return Object.keys(out).length ? out : null;
}

/** The record as kept with a document (held to its shape on read). */
export function normalizeCreative(v: unknown): CreativeRecord | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = o(v);
  const out: CreativeRecord = normalizeState(r);
  const src = o(r.sources);
  const sources: CreativeRecord['sources'] = {};
  for (const k of DECISION_KEYS) {
    const x = o(src[k]);
    if (['engine', 'you', 'concept'].includes(x.by)) sources[k] = { by: x.by, at: n(x.at, 0, 1e15, 0), ...(s(x.said, 240) ? { said: s(x.said, 240) } : {}), ...(s(x.from, 60) ? { from: s(x.from, 60) } : {}) };
  }
  if (Object.keys(sources).length) out.sources = sources;
  const hist = o(r.history);
  const history: CreativeRecord['history'] = {};
  for (const k of DECISION_KEYS) {
    const list = (Array.isArray(hist[k]) ? hist[k] : [])
      .map((e: unknown) => {
        const restore = normalizeRestore(o(e).restore);
        return restore ? { said: s(o(e).said, 240), at: n(o(e).at, 0, 1e15, 0), restore } : null;
      })
      .filter(Boolean)
      .slice(-MAX_HISTORY);
    if (list.length) history[k] = list as { said: string; at: number; restore: Restore }[];
  }
  if (Object.keys(history).length) out.history = history;
  return Object.keys(out).length ? out : undefined;
}

// ── reading a concept's decisions from the design ──

export interface Decisions {
  palette: Palette & { mode: 'light' | 'dark' };
  type: { display: string; body: string; weight: number; case: 'none' | 'upper'; character: TypeCharacter };
  composition: { idea?: string; intensity: number; density: 'airy' | 'balanced' | 'dense' };
  forms: { kind: FormKind | 'engine' | 'none'; label: string; count: number; abstraction: number | null };
  background: { kind: 'flat' | 'gradient' | 'texture'; colours: string[] };
  depth: number;
  mood: { qualities: string[]; theme?: string; style?: string };
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/** The artboard a change is about (the one named, else the first). */
export const boardOf = (doc: GraphicDoc, id?: string): Artboard => doc.artboards.find((b) => b.id === id) ?? doc.artboards[0];

/** The design's main words: its headline, else its largest text. */
export function mainWords(board: Artboard): TextNode | null {
  const texts = walk(board)
    .map((l) => l.node)
    .filter((x): x is TextNode => x.type === 'text' && !x.hidden);
  return texts.find((t) => t.role === 'headline') ?? texts.sort((p, q) => q.size - p.size)[0] ?? null;
}

/** The forms the creative record placed that are still there. */
export const creativeFormIds = (doc: GraphicDoc, board: Artboard) => {
  const there = new Set(walk(board).map((l) => l.node.id));
  return (board.creative?.forms?.ids ?? []).filter((id) => there.has(id));
};

/** The name of the full-bleed ground a creative change adds when the composition has none of its own. */
export const GROUND_NAME = 'Creative ground';

/**
 * The node that carries the ground as it is seen: the topmost opaque background shape covering the artboard (ours, or
 * the composition's own paper or field of colour). A composition can stack two (a paper beneath a ground); the one on
 * top is the one that shows, so it is the one a change of ground or palette works on.
 */
export function groundCarrier(board: Artboard): ShapeNode | null {
  const W = board.width;
  const H = board.height;
  const grounds = board.children.filter(
    (x): x is ShapeNode =>
      x.type === 'shape' && x.role === 'background' && !x.hidden && !x.locked && x.fill !== null && (x.opacity ?? 1) >= 0.9 && (!x.blend || x.blend === 'normal') && x.x <= W * 0.03 && x.y <= H * 0.03 && x.x + x.w >= W * 0.97 && x.y + x.h >= H * 0.97,
  );
  return grounds[grounds.length - 1] ?? null;
}

/** A paint's gradient stops, when it is a gradient. */
export const stopsOf = (fill: unknown): { at: number; color: string }[] => (fill && typeof fill === 'object' && Array.isArray((fill as { stops?: unknown }).stops) ? ((fill as { stops: { at: number; color: string }[] }).stops) : []);

export function readDecisions(doc: GraphicDoc, boardId?: string, dir?: GraphicDirection | null): Decisions {
  const board = boardOf(doc, boardId);
  const rec = board.creative ?? {};
  const t = doc.tokens;
  // the ground as it is now: the artboard's own (kept as the bottom of any gradient), never a colour remembered from before
  const ground = (board.background || t.colors.background).slice(0, 7);
  const carrier = groundCarrier(board);
  const stops = carrier ? stopsOf(carrier.fill).map((x) => x.color.slice(0, 7)) : [];
  const grain = !!carrier?.effects?.some((e) => e.on !== false && /^(grain|noise)$/.test(e.kind));
  const head = mainWords(board);
  const nodes = walk(board).map((l) => l.node);
  const motifs = nodes.filter((x) => x.role === 'motif' && !x.hidden);
  const ours = creativeFormIds(doc, board);
  const covered = nodes.filter((x) => x.role !== 'background' && !x.hidden).reduce((sum, x) => sum + x.w * x.h, 0) / (board.width * board.height);
  return {
    palette: { ground, ink: t.colors.text, accent: t.colors.accent, support: [t.accent2, t.colors.muted].filter((c): c is string => !!c), mode: lum(ground) < 0.35 ? 'dark' : 'light' },
    type: { display: head?.font ?? t.fonts.display, body: t.fonts.body, weight: head?.weight ?? 600, case: head?.case === 'upper' ? 'upper' : 'none', character: rec.character ?? characterOfFace(head?.font ?? t.fonts.display) },
    composition: { idea: board.concept?.idea, intensity: dir?.intensity ?? 50, density: covered < 0.55 ? 'airy' : covered > 1.1 ? 'dense' : 'balanced' },
    forms:
      rec.forms && ours.length
        ? { kind: rec.forms.kind, label: FORM_LABEL[rec.forms.kind], count: ours.length, abstraction: rec.forms.abstraction }
        : motifs.length
          ? { kind: 'engine', label: `${motifs.length} shape${motifs.length === 1 ? '' : 's'} the engine drew`, count: motifs.length, abstraction: null }
          : { kind: 'none', label: 'no forms', count: 0, abstraction: null },
    background: { kind: grain ? 'texture' : stops.length > 1 ? 'gradient' : 'flat', colours: stops.length > 1 ? stops : [ground] },
    depth: rec.depth ?? (motifs.some((m) => m.effects?.some((e) => e.on && /shadow|blur|glow/.test(e.kind))) ? 1 : 0),
    mood: { qualities: rec.qualities ?? [], ...(rec.theme ? { theme: rec.theme } : {}), ...(doc.style?.primary ? { style: doc.style.primary } : {}) },
  };
}

export interface DecisionView {
  key: DecisionKey;
  label: string;
  value: string;
  /** colours to show beside it */
  swatches?: string[];
  source: DecisionSource['by'];
  said?: string;
  /** it can be turned down (put back as it was before the last change) */
  revertible: boolean;
}

const DEPTH_WORDS = ['flat', 'layered', 'shadowed', 'atmospheric'];

/** Each decision in words, with where it came from, for the concept panel and the model's reading. */
export function decisionViews(doc: GraphicDoc, boardId?: string, dir?: GraphicDirection | null): DecisionView[] {
  const d = readDecisions(doc, boardId, dir);
  const rec = boardOf(doc, boardId).creative ?? {};
  const src = (k: DecisionKey): Pick<DecisionView, 'source' | 'said' | 'revertible'> => ({ source: rec.sources?.[k]?.by ?? 'engine', ...(rec.sources?.[k]?.said ? { said: rec.sources[k]!.said } : {}), revertible: !!rec.history?.[k]?.length });
  const theme = themeById(d.mood.theme);
  return [
    { key: 'palette', label: DECISION_LABEL.palette, value: `${d.palette.mode === 'dark' ? 'A dark' : 'A light'} ground, ${d.palette.support.length ? 'an accent and a supporting colour' : 'one accent'}`, swatches: [d.palette.ground, d.palette.ink, d.palette.accent, ...d.palette.support.slice(0, 1)], ...src('palette') },
    { key: 'type', label: DECISION_LABEL.type, value: `${d.type.display}${d.type.body !== d.type.display ? ` with ${d.type.body}` : ''} — ${CHARACTER_LABEL[d.type.character]}${d.type.case === 'upper' ? ', in capitals' : ''}`, ...src('type') },
    { key: 'composition', label: DECISION_LABEL.composition, value: d.composition.idea ? d.composition.idea.replace(/\.$/, '') : `${d.composition.density === 'airy' ? 'Open' : d.composition.density === 'dense' ? 'Full' : 'Balanced'}, as composed`, ...src('composition') },
    { key: 'forms', label: DECISION_LABEL.forms, value: d.forms.abstraction === null ? d.forms.label.replace(/^./, (c) => c.toUpperCase()) : `${d.forms.count} ${d.forms.label}, ${d.forms.abstraction < 35 ? 'literal' : d.forms.abstraction < 70 ? 'stylised' : 'abstract'}`, ...src('forms') },
    { key: 'background', label: DECISION_LABEL.background, value: d.background.kind === 'gradient' ? 'A graded ground' : d.background.kind === 'texture' ? 'A textured ground' : 'A flat ground', swatches: d.background.colours.slice(0, 2), ...src('background') },
    { key: 'depth', label: DECISION_LABEL.depth, value: DEPTH_WORDS[Math.max(0, Math.min(3, d.depth))].replace(/^./, (c) => c.toUpperCase()), ...src('depth') },
    { key: 'mood', label: DECISION_LABEL.mood, value: [theme ? `${theme.label.replace(/^./, (c) => c.toUpperCase())}` : '', ...d.mood.qualities.slice(-3).map((q) => qualityById(q)?.label ?? q)].filter(Boolean).join(', ') || 'As the concept was conceived', ...src('mood') },
  ];
}
