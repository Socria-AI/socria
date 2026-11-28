// lib/new-logos/representation.ts — A PROBLEM, REPRESENTED.
//
// What a person asks becomes a REPRESENTATION of the problem rather than a reply: typed items joined by relations.
//
//   question     what is being asked (the central question, and later ones)
//   statement    a concise claim: an answer, a point, a word of support — with its basis (well established, worked
//                out, from a source, or an interpretation)
//   hypothesis   a possibility, never a conclusion: open, more likely, less likely, ruled out (in words: no invented
//                numbers)
//   observation  what has been seen or said: by the person, in a source, on record
//   entity       a person or thing the problem involves (a relationship map is entities and relations)
//   unknown      what is missing: a question whose answer would tell possibilities apart (answered in place)
//   caveat       a limit or a risk that must stay visible
//   metric       a measure: a value, or one worked out from the model
//   timeline     events in order; sequence: steps in order
//   document     a source in the library, at a passage
//   equation, variable, plot, matrix — the interactive model: composition primitives (lib/new-logos/primitives.ts)
//                sharing one scope of variables, so moving a variable moves every equation, plot and table using it
//
// A relation's standing is explicit: ESTABLISHED (drawn solid) or UNVERIFIED (drawn dashed). Who made each item
// (the person or the assistant) is kept, and the assistant may not reword or remove what the person made.
//
// The representation EVOLVES: each turn revises what is there (lib/new-logos/representation-ops.ts) instead of adding
// another reply. Earlier wordings stay readable (`was`), and every change can be inspected and reversed.
//
// What is kept apart: the semantic data (here), where an item sits on a canvas (the canvas layout, r:<id>), how it is
// drawn (components/new-logos/represent), and the reasoning behind it (its `detail`, and the turn's record in the
// conversation, which the other interface reads as a message).
//
// Pure: no I/O.

import { PRIMITIVE_ID_RE, PRIMITIVE_LIMITS, sanitizePrimitive, sanitizeVariable, type Composition, type Primitive, type PrimitiveType, type Variable } from './primitives';

// ── vocabulary ───────────────────────────────────────────────────────

export const REP_KINDS = ['question', 'statement', 'hypothesis', 'observation', 'entity', 'unknown', 'caveat', 'metric', 'timeline', 'sequence', 'document', 'equation', 'variable', 'plot', 'matrix', 'diagram', 'media'] as const;
export type RepKind = (typeof REP_KINDS)[number];
export const isRepKind = (v: unknown): v is RepKind => typeof v === 'string' && (REP_KINDS as readonly string[]).includes(v);

/** The kinds that are composition primitives: the interactive model (equations, variables, plots, tables sharing one
 *  scope), diagrams and media. */
export const MODEL_KINDS = ['equation', 'variable', 'plot', 'matrix', 'diagram', 'media'] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];
export const isModelKind = (v: unknown): v is ModelKind => typeof v === 'string' && (MODEL_KINDS as readonly string[]).includes(v);
export const PRIM_TYPE: Record<ModelKind, PrimitiveType> = { equation: 'equation', variable: 'control', plot: 'plot', matrix: 'table', diagram: 'diagram', media: 'media' };

export const BASES = ['known', 'derived', 'sourced', 'interpretation'] as const;
export type Basis = (typeof BASES)[number];
export const STATUSES = ['open', 'stronger', 'weaker', 'ruled_out'] as const;
export type HypothesisStatus = (typeof STATUSES)[number];
export const FROMS = ['person', 'source', 'record'] as const;
export type ObservedFrom = (typeof FROMS)[number];
export const ROLES = ['answer', 'point', 'support'] as const;
export type StatementRole = (typeof ROLES)[number];
export const WEIGHTS = ['note', 'important'] as const;
export type CaveatWeight = (typeof WEIGHTS)[number];
export const REL_KINDS = ['supports', 'contradicts', 'explains', 'causes', 'leads_to', 'part_of', 'answers', 'depends_on', 'derives', 'references', 'about', 'relates'] as const;
export type RelKind = (typeof REL_KINDS)[number];
export const REL_STATUSES = ['established', 'unverified'] as const;
export type RelStatus = (typeof REL_STATUSES)[number];
export type Origin = 'ai' | 'person';

const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);

// ── words (British English; never colour alone) ──────────────────────

export const KIND_WORD: Record<RepKind, string> = {
  question: 'Question',
  statement: 'Statement',
  hypothesis: 'Possibility',
  observation: 'Observation',
  entity: 'Person or thing',
  unknown: 'Open question',
  caveat: 'Caveat',
  metric: 'Measure',
  timeline: 'Timeline',
  sequence: 'Steps',
  document: 'Document',
  equation: 'Equation',
  variable: 'Variable',
  plot: 'Plot',
  matrix: 'Comparison',
  diagram: 'Diagram',
  media: 'Image',
};
export const KIND_COUNT: Record<RepKind, [string, string]> = {
  question: ['question', 'questions'],
  statement: ['statement', 'statements'],
  hypothesis: ['possibility', 'possibilities'],
  observation: ['observation', 'observations'],
  entity: ['person or thing', 'people and things'],
  unknown: ['open question', 'open questions'],
  caveat: ['caveat', 'caveats'],
  metric: ['measure', 'measures'],
  timeline: ['timeline', 'timelines'],
  sequence: ['set of steps', 'sets of steps'],
  document: ['document', 'documents'],
  equation: ['equation', 'equations'],
  variable: ['variable', 'variables'],
  plot: ['plot', 'plots'],
  matrix: ['comparison', 'comparisons'],
  diagram: ['diagram', 'diagrams'],
  media: ['image', 'images'],
};
export const STATUS_WORD: Record<HypothesisStatus, string> = { open: 'Open', stronger: 'More likely', weaker: 'Less likely', ruled_out: 'Ruled out' };
export const BASIS_WORD: Record<Basis, string> = { known: 'Well established', derived: 'Worked out', sourced: 'From a source', interpretation: 'An interpretation' };
export const FROM_WORD: Record<ObservedFrom, string> = { person: 'You said', source: 'In a source', record: 'On record' };
export const REL_WORD: Record<RelKind, string> = {
  supports: 'supports',
  contradicts: 'goes against',
  explains: 'would explain',
  causes: 'causes',
  leads_to: 'leads to',
  part_of: 'part of',
  answers: 'answers',
  depends_on: 'depends on',
  derives: 'derived from',
  references: 'refers to',
  about: 'about',
  relates: 'related to',
};
export const REL_STATUS_WORD: Record<RelStatus, string> = { established: 'Established', unverified: 'Not established' };

// ── the shapes ───────────────────────────────────────────────────────

export interface Cite {
  sourceId: string;
  /** a passage (block) of the source's reading */
  passage?: string;
}
/** An earlier wording or standing, in words: kept so a revision can be read and understood. */
export interface Revision {
  at: number;
  by: Origin;
  text: string;
}
export interface TimelineEvent {
  id: string;
  /** when, as written ("1914", "June 1914", "c. 500 BC", "Week 2") */
  when: string;
  text: string;
  /** false: the date or the event itself is uncertain (drawn dashed) */
  sure: boolean;
}
export interface SequenceStep {
  id: string;
  text: string;
  detail?: string;
}

interface ItemBase {
  id: string;
  by: Origin;
  at: number;
  /** last revised */
  edited?: number;
  /** the person's message (turn) that brought it */
  turn?: string;
  /** the reasoning, evidence or explanation behind it: shown on inspection, never on the canvas */
  detail?: string;
  /** earlier wordings and standings, newest last */
  was?: Revision[];
  /** the node it was kept as, when kept */
  kept?: string;
  /** the documents behind it */
  cites?: Cite[];
  /** how it is shown, when not its kind's usual way (a table as a plot, steps as a timeline): presentation only —
   *  the data is untouched, so changing it back loses nothing */
  view?: ItemView;
}

/** Another way of showing an item: `as`, and for a table drawn as a plot, which columns go across and up. */
export interface ItemView {
  as: string;
  x?: string;
  y?: string;
}
/** The ways each kind can be shown, its usual way first. Which apply to one item can depend on its data
 *  (lib/new-logos/engine/transforms.ts viewsFor). */
export const VIEWS: Partial<Record<RepKind, readonly string[]>> = {
  matrix: ['table', 'plot', 'bars', 'metrics'],
  plot: ['plot', 'table'],
  sequence: ['steps', 'timeline'],
  timeline: ['timeline', 'steps'],
  equation: ['equation', 'plot'],
  variable: ['slider', 'number'],
};
export const VIEW_WORD: Record<string, string> = { table: 'a table', plot: 'a plot', bars: 'bars', metrics: 'measures', steps: 'steps', timeline: 'a timeline', equation: 'an equation', slider: 'a slider', number: 'a number' };
const COLUMN_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export function sanitizeView(kind: RepKind, raw: unknown): ItemView | undefined {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const views = VIEWS[kind];
  if (!o || !views || typeof o.as !== 'string' || !views.includes(o.as) || o.as === views[0]) return undefined;
  return { as: o.as, ...(typeof o.x === 'string' && COLUMN_ID_RE.test(o.x) ? { x: o.x } : {}), ...(typeof o.y === 'string' && COLUMN_ID_RE.test(o.y) ? { y: o.y } : {}) };
}

export type RepItem = ItemBase &
  (
    | { kind: 'question'; text: string }
    | { kind: 'statement'; text: string; basis: Basis; role: StatementRole }
    | { kind: 'hypothesis'; text: string; status: HypothesisStatus; because?: string }
    | { kind: 'observation'; text: string; from: ObservedFrom }
    | { kind: 'entity'; text: string }
    | { kind: 'unknown'; text: string; answer?: string }
    | { kind: 'caveat'; text: string; weight: CaveatWeight }
    | { kind: 'metric'; text: string; value?: string; expr?: string; unit?: string; basis: Basis }
    | { kind: 'timeline'; text: string; events: TimelineEvent[] }
    | { kind: 'sequence'; text: string; steps: SequenceStep[] }
    | { kind: 'document'; text: string; sourceId: string; passage?: string }
    | { kind: 'equation'; text: string; prim: Primitive }
    | { kind: 'variable'; text: string; prim: Primitive }
    | { kind: 'plot'; text: string; prim: Primitive }
    | { kind: 'matrix'; text: string; prim: Primitive }
    | { kind: 'diagram'; text: string; prim: Primitive }
    | { kind: 'media'; text: string; prim: Primitive }
  );
export type ItemOf<K extends RepKind> = Extract<RepItem, { kind: K }>;

export interface RepRelation {
  /** `${from}>${kind}>${to}`: one relation of a kind between two items */
  id: string;
  from: string;
  to: string;
  kind: RelKind;
  status: RelStatus;
  /** a few words saying it more exactly ("was dating") */
  label?: string;
  by: Origin;
  at: number;
}

export interface Representation {
  subtype: 'representation';
  v: 1;
  items: RepItem[];
  relations: RepRelation[];
  /** the model's shared variables (a composition's) */
  variables: Variable[];
  /** the person's messages it has taken in, oldest first */
  turns: string[];
}

export const EMPTY_REPRESENTATION: Representation = { subtype: 'representation', v: 1, items: [], relations: [], variables: [], turns: [] };

export const REP_LIMITS = {
  items: 120,
  relations: 240,
  detail: 2000,
  because: 300,
  label: 60,
  answer: 400,
  value: 40,
  unit: 16,
  expr: 200,
  events: 40,
  when: 40,
  eventText: 200,
  steps: 24,
  stepText: 240,
  stepDetail: 600,
  cites: 6,
  was: 4,
  turns: 400,
  /** the whole representation, as JSON */
  bytes: 400_000,
} as const;

/** How long an item's words may be. The canvas shows a little; inspection shows the rest (`detail`). */
export const TEXT_MAX: Record<RepKind, number> = {
  question: 300,
  statement: 420,
  hypothesis: 200,
  observation: 300,
  entity: 80,
  unknown: 220,
  caveat: 320,
  metric: 80,
  timeline: 120,
  sequence: 120,
  document: 200,
  equation: 120,
  variable: 120,
  plot: 120,
  matrix: 120,
  diagram: 120,
  media: 120,
};

// ── ids ──────────────────────────────────────────────────────────────

/** Names every JavaScript object has: never an id (an id is used to find things). */
const PROTO = new Set(Object.getOwnPropertyNames(Object.prototype));
/** A semantic item's id: lowercase words joined by underscores. The p_ prefix is the model's (primitive ids). */
export const ITEM_ID_RE = /^[a-z][a-z0-9_]{1,39}$/;
export const isItemId = (kind: RepKind, v: unknown): v is string =>
  typeof v === 'string' && !PROTO.has(v) && (isModelKind(kind) ? PRIMITIVE_ID_RE.test(v) : ITEM_ID_RE.test(v) && !v.startsWith('p_'));
const PART_ID_RE = /^[a-z0-9_]{1,24}$/;
const SOURCE_ID_RE = /^s_[A-Za-z0-9]{6,40}$/;
const PASSAGE_RE = /^[A-Za-z0-9_.:-]{1,40}$/;
const TURN_RE = /^[A-Za-z0-9_-]{1,120}$/;
const NODE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
export const relationId = (from: string, kind: RelKind, to: string) => `${from}>${kind}>${to}`;

function rnd(n: number): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(b);
  else for (let k = 0; k < n; k++) b[k] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => a[x % a.length]).join('');
}

/** A fresh id for an item of a kind, from a wanted one when it is usable and free. */
export function freshId(kind: RepKind, wanted: unknown, taken: ReadonlySet<string>): string {
  const model = isModelKind(kind);
  let base = typeof wanted === 'string' ? wanted.trim() : '';
  if (model) {
    base = base.replace(/^p_/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    if (base.length >= 2 && !taken.has(`p_${base}`)) return `p_${base}`;
    for (;;) {
      const id = `p_${(base.slice(0, 14) || 'm')}${rnd(6)}`;
      if (!taken.has(id)) return id;
    }
  }
  base = base
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/^p_/, 'i_')
    .replace(/_+$/, '')
    .slice(0, 32);
  if (base.length >= 2 && ITEM_ID_RE.test(base) && !PROTO.has(base) && !taken.has(base)) return base;
  const stem = base.length >= 2 ? base.slice(0, 30) : kind.slice(0, 1);
  for (let n = 2; n < 1000; n++) {
    const id = `${stem}_${n}`;
    if (ITEM_ID_RE.test(id) && !taken.has(id)) return id;
  }
  for (;;) {
    const id = `${kind.slice(0, 1)}_${rnd(8)}`;
    if (!taken.has(id)) return id;
  }
}

// ── cleaning ─────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Words for display: control characters out, whitespace collapsed, cut at a word boundary with an ellipsis. */
export function clip(v: unknown, max: number, multiline = false): string {
  if (typeof v !== 'string') return '';
  let s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

function cleanCites(v: unknown): Cite[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Cite[] = [];
  for (const c of v) {
    const o = obj(c);
    if (!o || typeof o.sourceId !== 'string' || !SOURCE_ID_RE.test(o.sourceId)) continue;
    const passage = typeof o.passage === 'string' && PASSAGE_RE.test(o.passage) ? o.passage : undefined;
    if (out.some((x) => x.sourceId === o.sourceId && x.passage === passage)) continue;
    out.push({ sourceId: o.sourceId, ...(passage ? { passage } : {}) });
    if (out.length >= REP_LIMITS.cites) break;
  }
  return out.length ? out : undefined;
}

function cleanWas(v: unknown): Revision[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Revision[] = [];
  for (const r of v) {
    const o = obj(r);
    if (!o) continue;
    const text = clip(o.text, 300);
    if (!text) continue;
    out.push({ at: finite(o.at) ? Math.round(o.at) : 0, by: o.by === 'person' ? 'person' : 'ai', text });
  }
  return out.length ? out.slice(-REP_LIMITS.was) : undefined;
}

/** A year-ish number for ordering events: "1914", "June 1914", "c. 500 BC", "2024-03-01", "Week 2". */
export function whenKey(when: string): number | null {
  const s = when.toLowerCase();
  const iso = /(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (iso) return Number(iso[1]) + (Number(iso[2]) - 1) / 12 + (iso[3] ? (Number(iso[3]) - 1) / 372 : 0);
  const bc = /(\d{1,5})\s*(bc|bce)\b/.exec(s);
  if (bc) return -Number(bc[1]);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const yr = /\b(\d{3,4})\b/.exec(s);
  if (yr) {
    const m = months.findIndex((mo) => new RegExp(`\\b${mo}`).test(s));
    return Number(yr[1]) + (m >= 0 ? m / 12 : 0);
  }
  const n = /\b(day|week|month|year|step|stage|phase|hour|minute)\s*(\d{1,4})\b/.exec(s) ?? /\b(\d{1,4})\b/.exec(s);
  return n ? Number(n[n.length - 1]) : null;
}

function cleanEvents(v: unknown): TimelineEvent[] {
  if (!Array.isArray(v)) return [];
  const out: TimelineEvent[] = [];
  const ids = new Set<string>();
  for (const e of v) {
    const o = obj(e);
    if (!o) continue;
    const text = clip(o.text ?? o.event ?? o.label, REP_LIMITS.eventText);
    const when = clip(o.when ?? o.date ?? o.time, REP_LIMITS.when);
    if (!text) continue;
    let id = typeof o.id === 'string' && PART_ID_RE.test(o.id) && !ids.has(o.id) ? o.id : '';
    for (let n = out.length + 1; !id; n++) if (!ids.has(`e${n}`)) id = `e${n}`;
    ids.add(id);
    out.push({ id, when, text, sure: o.sure !== false && o.uncertain !== true });
    if (out.length >= REP_LIMITS.events) break;
  }
  return out;
}

function cleanSteps(v: unknown): SequenceStep[] {
  if (!Array.isArray(v)) return [];
  const out: SequenceStep[] = [];
  const ids = new Set<string>();
  for (const s of v) {
    const o = typeof s === 'string' ? { text: s } : obj(s);
    if (!o) continue;
    const text = clip(o.text ?? o.step ?? o.label, REP_LIMITS.stepText);
    if (!text) continue;
    let id = typeof o.id === 'string' && PART_ID_RE.test(o.id) && !ids.has(o.id) ? o.id : '';
    for (let n = out.length + 1; !id; n++) if (!ids.has(`s${n}`)) id = `s${n}`;
    ids.add(id);
    const detail = clip(o.detail, REP_LIMITS.stepDetail, true);
    out.push({ id, text, ...(detail ? { detail } : {}) });
    if (out.length >= REP_LIMITS.steps) break;
  }
  return out;
}

/** One item, checked: a known kind, a usable id, words within bounds, fields of the right kind. Null when unusable. */
export function sanitizeItem(raw: unknown): RepItem | null {
  const o = obj(raw);
  if (!o || !isRepKind(o.kind)) return null;
  const kind = o.kind;
  if (!isItemId(kind, o.id)) return null;
  const text = clip(o.text, TEXT_MAX[kind]);
  const base: ItemBase = { id: o.id as string, by: o.by === 'person' ? 'person' : 'ai', at: finite(o.at) ? Math.round(o.at) : 0 };
  if (finite(o.edited)) base.edited = Math.round(o.edited);
  if (typeof o.turn === 'string' && TURN_RE.test(o.turn)) base.turn = o.turn;
  const detail = clip(o.detail, REP_LIMITS.detail, true);
  if (detail) base.detail = detail;
  const was = cleanWas(o.was);
  if (was) base.was = was;
  if (typeof o.kept === 'string' && NODE_ID_RE.test(o.kept)) base.kept = o.kept;
  const cites = cleanCites(o.cites);
  if (cites) base.cites = cites;
  const view = sanitizeView(kind, o.view);
  if (view) base.view = view;
  switch (kind) {
    case 'question':
    case 'entity':
      return text ? { ...base, kind, text } : null;
    case 'statement':
      return text ? { ...base, kind, text, basis: oneOf(BASES, o.basis, 'interpretation'), role: oneOf(ROLES, o.role, 'point') } : null;
    case 'hypothesis': {
      if (!text) return null;
      const because = clip(o.because, REP_LIMITS.because);
      return { ...base, kind, text, status: oneOf(STATUSES, o.status, 'open'), ...(because ? { because } : {}) };
    }
    case 'observation':
      return text ? { ...base, kind, text, from: oneOf(FROMS, o.from, 'person') } : null;
    case 'unknown': {
      if (!text) return null;
      const answer = clip(o.answer, REP_LIMITS.answer, true);
      return { ...base, kind, text, ...(answer ? { answer } : {}) };
    }
    case 'caveat':
      return text ? { ...base, kind, text, weight: oneOf(WEIGHTS, o.weight, 'note') } : null;
    case 'metric': {
      const value = clip(o.value, REP_LIMITS.value);
      const expr = clip(o.expr, REP_LIMITS.expr);
      const unit = clip(o.unit, REP_LIMITS.unit);
      if (!text || (!value && !expr)) return null;
      return { ...base, kind, text, basis: oneOf(BASES, o.basis, 'derived'), ...(value ? { value } : {}), ...(expr ? { expr } : {}), ...(unit ? { unit } : {}) };
    }
    case 'timeline': {
      const events = cleanEvents(o.events);
      return events.length ? { ...base, kind, text, events } : null;
    }
    case 'sequence': {
      const steps = cleanSteps(o.steps);
      return steps.length ? { ...base, kind, text, steps } : null;
    }
    case 'document': {
      if (typeof o.sourceId !== 'string' || !SOURCE_ID_RE.test(o.sourceId)) return null;
      const passage = typeof o.passage === 'string' && PASSAGE_RE.test(o.passage) ? o.passage : undefined;
      return { ...base, kind, text, sourceId: o.sourceId, ...(passage ? { passage } : {}) };
    }
    case 'equation':
    case 'variable':
    case 'plot':
    case 'matrix':
    case 'diagram':
    case 'media': {
      const p = obj(o.prim);
      if (!p || p.type !== PRIM_TYPE[kind]) return null;
      const prim = sanitizePrimitive({ ...p, id: o.id, label: text || (typeof p.label === 'string' ? p.label : '') });
      if (!prim || prim.type !== PRIM_TYPE[kind]) return null;
      return { ...base, kind, text: prim.label, prim } as RepItem;
    }
  }
}

export function sanitizeRelation(raw: unknown, ids: ReadonlySet<string>): RepRelation | null {
  const o = obj(raw);
  if (!o || typeof o.from !== 'string' || typeof o.to !== 'string' || o.from === o.to || !ids.has(o.from) || !ids.has(o.to)) return null;
  if (!(REL_KINDS as readonly string[]).includes(o.kind as string)) return null;
  const kind = o.kind as RelKind;
  const label = clip(o.label, REP_LIMITS.label);
  return {
    id: relationId(o.from, kind, o.to),
    from: o.from,
    to: o.to,
    kind,
    status: oneOf(REL_STATUSES, o.status, 'unverified'),
    ...(label ? { label } : {}),
    by: o.by === 'person' ? 'person' : 'ai',
    at: finite(o.at) ? Math.round(o.at) : 0,
  };
}

/** A whole representation, checked. Anything unusable is left out; nothing malformed is kept. */
export function sanitizeRepresentation(raw: unknown): Representation {
  const o = obj(raw);
  if (!o) return { ...EMPTY_REPRESENTATION, items: [], relations: [], variables: [], turns: [] };
  const items: RepItem[] = [];
  const ids = new Set<string>();
  for (const r of Array.isArray(o.items) ? o.items : []) {
    if (items.length >= REP_LIMITS.items) break;
    const it = sanitizeItem(r);
    if (!it || ids.has(it.id)) continue;
    ids.add(it.id);
    items.push(it);
  }
  const relations: RepRelation[] = [];
  const rels = new Set<string>();
  for (const r of Array.isArray(o.relations) ? o.relations : []) {
    if (relations.length >= REP_LIMITS.relations) break;
    const rel = sanitizeRelation(r, ids);
    if (!rel || rels.has(rel.id)) continue;
    rels.add(rel.id);
    relations.push(rel);
  }
  const variables: Variable[] = [];
  for (const v of Array.isArray(o.variables) ? o.variables : []) {
    if (variables.length >= PRIMITIVE_LIMITS.variables) break;
    const x = sanitizeVariable(v);
    if (x && !variables.some((y) => y.name === x.name)) variables.push(x);
  }
  const turns = (Array.isArray(o.turns) ? o.turns : []).filter((t): t is string => typeof t === 'string' && TURN_RE.test(t));
  return { subtype: 'representation', v: 1, items, relations, variables, turns: [...new Set(turns)].slice(-REP_LIMITS.turns) };
}

export const representationBytes = (r: Representation) => JSON.stringify(r).length;

// ── the model: a composition inside ──────────────────────────────────

/** The interactive model as a composition (its primitives and shared variables), for the existing engine and renderers. */
export function compositionOf(rep: Representation): Composition {
  const primitives: Primitive[] = [];
  for (const it of rep.items) if (isModelKind(it.kind)) primitives.push((it as ItemOf<ModelKind>).prim);
  return { subtype: 'composition', v: 2, primitives, variables: rep.variables };
}

/**
 * A representation with its model replaced by `comp` (after artifact operations ran on it): each model item takes its
 * primitive's new state; a primitive no longer there takes its item with it (and the item's relations); a primitive
 * the composition gained becomes an item. The variables are the composition's.
 */
export function withComposition(rep: Representation, comp: Composition, by: Origin, at: number): Representation {
  const prims = new Map(comp.primitives.map((p) => [p.id, p]));
  const items: RepItem[] = [];
  for (const it of rep.items) {
    if (!isModelKind(it.kind)) {
      items.push(it);
      continue;
    }
    const p = prims.get(it.id);
    if (!p) continue;
    prims.delete(it.id);
    items.push({ ...(it as ItemOf<ModelKind>), prim: p, text: p.label });
  }
  for (const p of prims.values()) {
    const kind = (Object.keys(PRIM_TYPE) as ModelKind[]).find((k) => PRIM_TYPE[k] === p.type);
    if (kind) items.push({ id: p.id, kind, by, at, text: p.label, prim: p } as RepItem);
  }
  const ids = new Set(items.map((i) => i.id));
  return { ...rep, items, relations: rep.relations.filter((r) => ids.has(r.from) && ids.has(r.to)), variables: comp.variables };
}

// ── reading it ───────────────────────────────────────────────────────

export const itemById = (rep: Representation, id: string) => rep.items.find((i) => i.id === id);
export const relationsOf = (rep: Representation, id: string) => rep.relations.filter((r) => r.from === id || r.to === id);
/** The other end of a relation, seen from `id`. */
export const otherEnd = (r: RepRelation, id: string) => (r.from === id ? r.to : r.from);

/** The questions in the order asked; the latest is the one being worked on. */
export const questionsOf = (rep: Representation) => rep.items.filter((i): i is ItemOf<'question'> => i.kind === 'question');

/** Words for an item's standing: what it rests on, in a few words (for inspection and reading aloud). */
export function standingWords(it: RepItem): string {
  switch (it.kind) {
    case 'statement':
      return BASIS_WORD[it.basis];
    case 'hypothesis':
      return `Possibility · ${STATUS_WORD[it.status].toLowerCase()}`;
    case 'observation':
      return FROM_WORD[it.from];
    case 'metric':
      return BASIS_WORD[it.basis];
    case 'unknown':
      return it.answer ? 'Answered' : 'Not known yet';
    default:
      return it.by === 'person' ? 'Yours' : '';
  }
}

/** For an item: the items supporting it, going against it, it would explain, and the open questions that bear on it. */
export function bearingOn(rep: Representation, id: string): { supports: RepItem[]; against: RepItem[]; explains: RepItem[]; open: RepItem[]; other: { rel: RepRelation; item: RepItem }[] } {
  const out = { supports: [] as RepItem[], against: [] as RepItem[], explains: [] as RepItem[], open: [] as RepItem[], other: [] as { rel: RepRelation; item: RepItem }[] };
  for (const r of relationsOf(rep, id)) {
    const other = itemById(rep, otherEnd(r, id));
    if (!other) continue;
    if (r.kind === 'supports' && r.to === id) out.supports.push(other);
    else if (r.kind === 'contradicts') out.against.push(other);
    else if (r.kind === 'explains' && r.from === id) out.explains.push(other);
    else if (other.kind === 'unknown' && !other.answer) out.open.push(other);
    else out.other.push({ rel: r, item: other });
  }
  return out;
}

// ── telling the assistant what is there ──────────────────────────────

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;
function itemLine(it: RepItem, rep: Representation, values?: Record<string, number>): string {
  const who = it.by === 'person' ? ' [by the person]' : '';
  const kept = it.kept ? ' [kept]' : '';
  const det = it.detail ? ` — detail: ${clip(it.detail, 160)}` : '';
  switch (it.kind) {
    case 'question':
      return `${it.id} · question${who} · ${q(it.text)}`;
    case 'statement':
      return `${it.id} · statement (${it.role}, ${it.basis})${who}${kept} · ${q(it.text)}${det}`;
    case 'hypothesis':
      return `${it.id} · possibility (${it.status.replace('_', ' ')})${who}${kept} · ${q(it.text)}${it.because ? ` — because: ${clip(it.because, 120)}` : ''}${det}`;
    case 'observation':
      return `${it.id} · observation (${it.from === 'person' ? 'the person said' : it.from === 'source' ? 'in a source' : 'on record'})${who}${kept} · ${q(it.text)}`;
    case 'entity':
      return `${it.id} · person or thing${who} · ${q(it.text)}`;
    case 'unknown':
      return `${it.id} · open question${who} · ${q(it.text)}${it.answer ? ` — answered: ${q(clip(it.answer, 160))}` : ' — not answered'}`;
    case 'caveat':
      return `${it.id} · caveat (${it.weight})${who} · ${q(it.text)}`;
    case 'metric': {
      const v = it.expr && values ? values[`metric:${it.id}`] : undefined;
      return `${it.id} · measure (${it.basis})${who} · ${q(it.text)} = ${it.value ?? (it.expr ? `${it.expr}${v !== undefined && Number.isFinite(v) ? ` → ${v}` : ''}` : '')}${it.unit ? ` ${it.unit}` : ''}`;
    }
    case 'timeline':
      return `${it.id} · timeline${who} · ${q(it.text)}: ${it.events.map((e) => `${e.id} ${e.when ? `${e.when}: ` : ''}${clip(e.text, 60)}${e.sure ? '' : ' (uncertain)'}`).join('; ')}`;
    case 'sequence':
      return `${it.id} · steps${who} · ${q(it.text)}: ${it.steps.map((s, k) => `${k + 1}. ${clip(s.text, 60)}`).join(' ')}`;
    case 'document':
      return `${it.id} · document ${it.sourceId}${it.passage ? ` at ${it.passage}` : ''}${who} · ${q(it.text)}`;
    case 'equation': {
      const d = it.prim.type === 'equation' ? it.prim.data : null;
      return `${it.id} · equation${who} · ${d ? `${d.name ? `${d.name}${d.params.length ? `(${d.params.join(', ')})` : ''} = ` : ''}${d.expr}` : ''}${it.text ? ` (${q(it.text)})` : ''}`;
    }
    case 'variable': {
      const d = it.prim.type === 'control' ? it.prim.data : null;
      const v = d ? rep.variables.find((x) => x.name === d.variable) : undefined;
      return `${it.id} · variable${who} · ${v ? `${v.name} = ${v.value} (from ${v.min} to ${v.max}, step ${v.step}${v.unit ? `, ${v.unit}` : ''})` : 'unset'}${it.text ? ` (${q(it.text)})` : ''}`;
    }
    case 'plot': {
      const d = it.prim.type === 'plot' ? it.prim.data : null;
      return `${it.id} · plot${who} · ${d ? `${d.series.map((s) => (s.kind === 'fn' ? `y = ${s.expr}` : s.label || s.kind)).join('; ')} for x from ${d.x.min} to ${d.x.max}` : ''}${it.text ? ` (${q(it.text)})` : ''}`;
    }
    case 'matrix': {
      const d = it.prim.type === 'table' ? it.prim.data : null;
      return `${it.id} · comparison${who} · ${d ? `columns ${d.columns.map((c) => c.name).join(' | ')}; rows ${d.rows.map((r) => clip(String(r.cells[d.columns[0]?.id ?? ''] ?? ''), 30)).join(', ')}` : ''}${it.text ? ` (${q(it.text)})` : ''}${it.view ? ` [shown as ${it.view.as}]` : ''}`;
    }
    case 'diagram': {
      const d = it.prim.type === 'diagram' ? it.prim.data : null;
      return `${it.id} · diagram${who} · ${d ? d.shapes.map((s) => clip(s.label, 30)).join(', ') : ''}${it.text ? ` (${q(it.text)})` : ''}`;
    }
    case 'media':
      return `${it.id} · image${who} · ${q(it.text || 'an image')}`;
  }
}

/**
 * What the representation holds, as lines the assistant reads before changing it: every item with its id, kind,
 * standing and words, every relation, and the variables. Cut to `max` characters, newest items kept first when cut.
 */
export function briefOf(rep: Representation, values?: Record<string, number>, max = 12_000): string {
  if (!rep.items.length) return 'The representation is empty: this is the first turn.';
  const items = rep.items.map((it) => itemLine(it, rep, values));
  const rels = rep.relations.map((r) => `${r.from} —${r.kind}${r.label ? ` (${r.label})` : ''}→ ${r.to} [${r.status}]${r.by === 'person' ? ' [by the person]' : ''}`);
  const head = 'ITEMS (id · kind · words):';
  let keep = items;
  let text = [head, ...keep, rels.length ? 'RELATIONS:' : '', ...rels].filter(Boolean).join('\n');
  // too long: keep the questions and the newest items whole, say how many older ones were left out
  while (text.length > max && keep.length > 8) {
    keep = [...items.filter((l, k) => rep.items[k].kind === 'question'), ...items.slice(-Math.floor(keep.length * 0.8))];
    keep = [...new Set(keep)];
    text = [head, `(${items.length - keep.length} older items not shown)`, ...keep, rels.length ? 'RELATIONS:' : '', ...rels.slice(-120)].filter(Boolean).join('\n');
  }
  return text.slice(0, max);
}

// ── the record a turn leaves in the conversation ─────────────────────

/** What changed in a batch, by id. */
export interface Changes {
  added: string[];
  revised: string[];
  removed: { id: string; kind: RepKind; text: string }[];
  /** relations made or changed */
  related: number;
  /** relations taken away */
  unrelated: number;
}

export const NO_CHANGES: Changes = { added: [], revised: [], removed: [], related: 0, unrelated: 0 };
export const changed = (c: Changes) => c.added.length + c.revised.length + c.removed.length + c.related + c.unrelated > 0;

function counted(kinds: RepKind[]): string {
  const n = new Map<RepKind, number>();
  for (const k of kinds) n.set(k, (n.get(k) ?? 0) + 1);
  const parts = [...n].map(([k, c]) => (c === 1 ? `${/^[aeiou]/.test(KIND_COUNT[k][0]) ? 'an' : 'a'} ${KIND_COUNT[k][0]}` : `${c} ${KIND_COUNT[k][1]}`));
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** A batch in a sentence or two: "Added 3 possibilities and an open question. Ruled out ‘Avoidance’." */
export function summaryOf(before: Representation, after: Representation, c: Changes, by: Origin): string {
  const out: string[] = [];
  const added = c.added.map((id) => itemById(after, id)).filter((x): x is RepItem => !!x);
  if (added.length) out.push(`Added ${counted(added.map((i) => i.kind))}`);
  for (const id of c.revised.slice(0, 4)) {
    const now = itemById(after, id);
    const was = itemById(before, id);
    if (!now) continue;
    const name = `‘${clip(now.text, 48)}’`;
    if (now.kind === 'hypothesis' && was?.kind === 'hypothesis' && was.status !== now.status) out.push(`${now.status === 'ruled_out' ? 'Ruled out' : `Marked ${STATUS_WORD[now.status].toLowerCase()}`} ${name}`);
    else if (now.kind === 'unknown' && was?.kind === 'unknown' && !was.answer && now.answer) out.push(`Answered ${name}`);
    else out.push(`Revised ${name}`);
  }
  if (c.revised.length > 4) out.push(`revised ${c.revised.length - 4} more`);
  if (c.removed.length) out.push(`Removed ${c.removed.length === 1 ? `‘${clip(c.removed[0].text, 48)}’` : `${c.removed.length} items`}`);
  if (!out.length && c.related) out.push(`${c.related === 1 ? 'Connected two items' : `Made ${c.related} connections`}`);
  if (!out.length && c.unrelated) out.push(`${c.unrelated === 1 ? 'Removed a connection' : `Removed ${c.unrelated} connections`}`);
  if (!out.length) return by === 'person' ? 'No change.' : 'Nothing needed changing.';
  return `${out.join('. ')}.`.replace(/\.\./g, '.');
}

const bullet = (s: string) => `- ${s}`;

/**
 * The turn as a message for the conversation: what the other interface shows for it, and what the History reads.
 * Plain Markdown, built from the items (never generated prose): the answer first when there is one, then what was
 * added and revised by kind, possibilities marked as such.
 */
export function recordOf(after: Representation, c: Changes, scopeValues?: Record<string, number>): string {
  const lines: string[] = [];
  const added = c.added.map((id) => itemById(after, id)).filter((x): x is RepItem => !!x);
  const revised = c.revised.map((id) => itemById(after, id)).filter((x): x is RepItem => !!x);
  const of = (k: RepKind) => added.filter((i) => i.kind === k);
  const answers = added.filter((i): i is ItemOf<'statement'> => i.kind === 'statement' && (i.role === 'answer' || i.role === 'support'));
  for (const a of answers) lines.push(a.text, '');
  const points = added.filter((i): i is ItemOf<'statement'> => i.kind === 'statement' && i.role === 'point');
  if (points.length) lines.push(...points.map((p) => bullet(`${p.text}${p.basis === 'interpretation' ? ' (an interpretation)' : ''}`)), '');
  const hyps = of('hypothesis') as ItemOf<'hypothesis'>[];
  if (hyps.length) lines.push('**Possibilities** (not established)', ...hyps.map((h) => bullet(`${h.text}${h.detail ? ` — ${clip(h.detail, 200)}` : ''}`)), '');
  const obs = of('observation') as ItemOf<'observation'>[];
  if (obs.length) lines.push('**What is known so far**', ...obs.map((o) => bullet(o.text)), '');
  const mets = of('metric') as ItemOf<'metric'>[];
  if (mets.length)
    lines.push(
      ...mets.map((m) => {
        const v = m.value ?? (m.expr && scopeValues && Number.isFinite(scopeValues[`metric:${m.id}`]) ? String(scopeValues[`metric:${m.id}`]) : m.expr ?? '');
        return bullet(`${m.text}: ${v}${m.unit ? ` ${m.unit}` : ''}`);
      }),
      ''
    );
  for (const t of of('timeline') as ItemOf<'timeline'>[]) lines.push(`**${t.text || 'Timeline'}**`, ...t.events.map((e) => bullet(`${e.when ? `${e.when}: ` : ''}${e.text}${e.sure ? '' : ' (uncertain)'}`)), '');
  for (const s of of('sequence') as ItemOf<'sequence'>[]) lines.push(`**${s.text || 'Steps'}**`, ...s.steps.map((x, k) => `${k + 1}. ${x.text}`), '');
  for (const e of of('equation') as ItemOf<'equation'>[]) if (e.prim.type === 'equation') lines.push(bullet(`${e.prim.data.name ? `${e.prim.data.name}${e.prim.data.params.length ? `(${e.prim.data.params.join(', ')})` : ''} = ` : ''}${e.prim.data.expr}`));
  for (const m of of('matrix') as ItemOf<'matrix'>[])
    if (m.prim.type === 'table') {
      const cols = m.prim.data.columns;
      lines.push(`**${m.text || 'Comparison'}**`, `| ${cols.map((x) => x.name).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...m.prim.data.rows.map((r) => `| ${cols.map((x) => (r.cells[x.id] ?? '').replace(/\|/g, '/')).join(' | ')} |`), '');
    }
  const unknowns = of('unknown');
  if (unknowns.length) lines.push('**What would help**', ...unknowns.map((u) => bullet(u.text)), '');
  for (const cv of of('caveat')) lines.push(`_${cv.text}_`, '');
  const changedLines = revised
    .map((r) => (r.kind === 'hypothesis' ? `${r.text}: now ${STATUS_WORD[r.status].toLowerCase()}${r.because ? ` (${r.because})` : ''}` : r.kind === 'unknown' && r.answer ? `${r.text} — ${r.answer}` : r.text))
    .filter(Boolean);
  if (changedLines.length) lines.push('**Revised**', ...changedLines.map(bullet), '');
  if (c.removed.length) lines.push(`_Removed: ${c.removed.map((r) => r.text).join('; ')}_`, '');
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return out || 'The picture is unchanged.';
}
