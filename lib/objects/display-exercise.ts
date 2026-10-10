// AN EXERCISE — labeling and retrieval practice over another display's parts.
//
// Release workflow 5: create and grade a diagram-labeling exercise — and "hide
// the labels so I can test myself". An exercise is a snapshot of a source
// display's parts (a diagram's nodes, a plan's items) with some labels hidden.
// The person recalls them; each answer is graded on the spot, deterministically:
//
//   right   it is the source's label, or an accepted alternative, once case,
//           punctuation, a leading article and a trailing plural s are set aside
//   close   one slip away (two for a longer label) — "check the spelling"
//   wrong   anything else
//
// Help is progressive and asked for, never pushed: the first letter, then the
// letter count, then the context (the source's cue, or the visible labels it
// sits beside) — and never the label itself until the person chooses to reveal
// it. Another round hides again what was missed. What is reported describes
// THIS round ("3 of 8 right, 1 close, 4 to go"), never mastery.
//
// Only the person answers, asks for a hint, reveals, or clears their answers.
// Nothing the conversation is told — facts, text, the parts list, the history —
// contains a hidden label, and part ids are positional (x1, x2 …) so not even
// an id can carry one. A source Socria drew is said to be unverified, and
// nothing here vouches for anything beyond the source.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import { cleanId, cleanText, displayKind, guardBy, headOps, norm, num, op, registerDisplay, todayDay, type Args, type DisplayHead } from './display-base';

export type ExerciseMode = 'label' | 'recall';
export type ExerciseView = 'label' | 'recall' | 'results';
export type Grade = 'right' | 'close' | 'wrong';

export interface ExercisePart {
  id: string;
  /** the source's label — what is being recalled */
  answer: string;
  /** context to recall it by: what it does, where it is */
  cue?: string;
  /** other labels that are also right */
  accept?: string[];
}

export interface ExerciseSource {
  /** the kind of display the parts came from: "diagram", "plan" */
  kind: string;
  title: string;
  /** false when Socria drew the source — a schematic, not a reference */
  verified: boolean;
  note?: string;
}

export interface ExerciseStructure {
  nodes: { id: string; x?: number; y?: number }[];
  edges: { from: string; to: string }[];
}

export interface ExerciseState extends DisplayHead {
  view: ExerciseView;
  mode: ExerciseMode;
  source: ExerciseSource;
  /** where each part sits, for drawing the labeling view — null when there is no picture */
  structure: ExerciseStructure | null;
  parts: ExercisePart[];
  /** the parts being recalled this round, in the parts' order — their labels are not shown */
  hidden: string[];
  /** the person's answers */
  answers: Record<string, string>;
  /** computed from the answers — never stored on anyone's word */
  graded: Record<string, Grade>;
  /** hidden parts whose label the person chose to see */
  revealed: string[];
  /** how many hints each part has had this round, 1..3 */
  hints: Record<string, number>;
  rounds: number;
}

export const EXERCISE_LIMITS = { parts: 40, answer: 80, cue: 160, accept: 4, note: 160, title: 80, source: 80, kind: 24, nodes: 60, edges: 120, rounds: 999, hints: 3, coord: 10000 } as const;

/** What an exercise drawn by Socria says about itself, first. */
export const UNVERIFIED_NOTE = 'Drawn by Socria and not checked against a reference: a schematic to practise with, not an authority.';

const VIEWS: ExerciseView[] = ['label', 'recall', 'results'];

// ── grading ──────────────────────────────────────────────────────────

/** Case, accents and punctuation set aside, a leading article and a trailing plural s dropped: "The Aortas." → "aorta". */
export function normaliseAnswer(v: unknown): string {
  if (typeof v !== 'string') return '';
  let t = v
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(?:the|a|an)\s+/, '');
  if ([...t].length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  return t;
}

/** Edits between two strings — insert, delete, substitute, or swap two neighbours (the optimal-string-alignment form of Damerau–Levenshtein). */
export function damerauLevenshtein(a: string, b: string): number {
  const A = [...a];
  const B = [...b];
  if (!A.length) return B.length;
  if (!B.length) return A.length;
  const d: number[][] = [];
  for (let i = 0; i <= A.length; i++) d.push(Array.from({ length: B.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= B.length; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[A.length][B.length];
}

const digitsOf = (s: string): string => s.replace(/\D/g, '');

/**
 * Grade an answer against a part: right when it is the label or an accepted
 * alternative once normalised; close when it is one edit away (labels of six
 * characters or fewer) or two (longer); wrong otherwise. Two refinements keep
 * "close" honest: a label under three characters has no near miss, and a
 * different number is never a spelling slip (C3 is not C4).
 */
export function gradeAnswer(text: unknown, part: Pick<ExercisePart, 'answer' | 'accept'>): Grade {
  const said = normaliseAnswer(text);
  if (!said) return 'wrong';
  const targets = [part.answer, ...(part.accept ?? [])].map(normaliseAnswer).filter(Boolean);
  if (targets.includes(said)) return 'right';
  for (const t of targets) {
    const len = [...t].length;
    if (len < 3 || digitsOf(t) !== digitsOf(said)) continue;
    if (damerauLevenshtein(said, t) <= (len <= 6 ? 1 : 2)) return 'close';
  }
  return 'wrong';
}

/** What the person is told about an answer. It never contains the label unless they revealed it. */
export function feedbackFor(grade: Grade | undefined, opts: { revealed?: boolean; answer?: string } = {}): string {
  if (opts.revealed && opts.answer) return `The source labels it “${opts.answer}”.`;
  if (grade === 'right') return 'Right — it matches the label in the source.';
  if (grade === 'close') return 'Close — check the spelling.';
  if (grade === 'wrong') return 'Not this one. Try again, ask for a hint, or reveal it.';
  return 'Not answered yet.';
}

// ── canonical state ──────────────────────────────────────────────────

/** Natural order for ids — p2 before p10 — the same on every machine. */
export function naturalCompare(a: string, b: string): number {
  const ax = a.match(/\d+|\D+/g) ?? [];
  const bx = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === y) continue;
    if (/^\d/.test(x) && /^\d/.test(y)) return Number(x) - Number(y) || x.length - y.length;
    return x < y ? -1 : 1;
  }
  return ax.length - bx.length;
}

function coord(v: unknown): number | null {
  const n = num(v, -EXERCISE_LIMITS.coord, EXERCISE_LIMITS.coord);
  if (n === null) return null;
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

export function sanitizeExercise(raw: unknown): ExerciseState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // parts get positional ids, x1 x2 …, so an id never carries a label; references are mapped across
  const parts: ExercisePart[] = [];
  const idMap = new Map<string, string>();
  for (const x of Array.isArray(r.parts) ? r.parts : []) {
    if (parts.length >= EXERCISE_LIMITS.parts) break;
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const answer = cleanText(o.answer ?? o.label, EXERCISE_LIMITS.answer);
    if (!normaliseAnswer(answer)) continue;
    const id = `x${parts.length + 1}`;
    const old = cleanId(o.id);
    if (old && !idMap.has(old)) idMap.set(old, id);
    const cue = cleanText(o.cue, EXERCISE_LIMITS.cue);
    const accept: string[] = [];
    for (const y of Array.isArray(o.accept) ? o.accept : []) {
      if (accept.length >= EXERCISE_LIMITS.accept) break;
      const t = cleanText(y, EXERCISE_LIMITS.answer);
      const k = normaliseAnswer(t);
      if (!k || k === normaliseAnswer(answer) || accept.some((z) => normaliseAnswer(z) === k)) continue;
      accept.push(t);
    }
    parts.push({ id, answer, ...(cue ? { cue } : {}), ...(accept.length ? { accept } : {}) });
  }
  if (!parts.length) return null;
  const ref = (v: unknown): string | null => {
    const k = cleanId(v);
    return k ? (idMap.get(k) ?? null) : null;
  };
  const inOrder = (ids: Set<string>) => parts.filter((p) => ids.has(p.id)).map((p) => p.id);

  const so = (r.source && typeof r.source === 'object' ? r.source : {}) as Record<string, unknown>;
  const verified = so.verified === true;
  let note = cleanText(so.note, EXERCISE_LIMITS.note);
  if (!verified && !note.startsWith(UNVERIFIED_NOTE)) note = cleanText(note ? `${UNVERIFIED_NOTE} ${note}` : UNVERIFIED_NOTE, EXERCISE_LIMITS.note);
  const sourceTitle = cleanText(so.title, EXERCISE_LIMITS.source) || 'Untitled';
  const source: ExerciseSource = { kind: cleanText(so.kind, EXERCISE_LIMITS.kind) || 'display', title: sourceTitle, verified, ...(note ? { note } : {}) };

  let structure: ExerciseStructure | null = null;
  if (r.structure && typeof r.structure === 'object') {
    const st = r.structure as Record<string, unknown>;
    const nodeMap = new Map<string, string>();
    const nodes: ExerciseStructure['nodes'] = [];
    let extra = 0;
    for (const x of Array.isArray(st.nodes) ? st.nodes : []) {
      if (nodes.length >= EXERCISE_LIMITS.nodes) break;
      const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
      const old = cleanId(o?.id);
      if (!old || nodeMap.has(old)) continue;
      // a node that is a part takes the part's id; any other point is numbered, so it carries no name either
      const id = idMap.get(old) ?? `n${extra + 1}`;
      if (nodes.some((nd) => nd.id === id)) continue;
      if (!idMap.has(old)) extra++;
      nodeMap.set(old, id);
      const px = coord(o?.x);
      const py = coord(o?.y);
      nodes.push({ id, ...(px !== null ? { x: px } : {}), ...(py !== null ? { y: py } : {}) });
    }
    const edges: ExerciseStructure['edges'] = [];
    for (const x of Array.isArray(st.edges) ? st.edges : []) {
      if (edges.length >= EXERCISE_LIMITS.edges) break;
      const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
      const from = nodeMap.get(cleanId(o?.from) ?? '');
      const to = nodeMap.get(cleanId(o?.to) ?? '');
      if (!from || !to || from === to || edges.some((e) => e.from === from && e.to === to)) continue;
      edges.push({ from, to });
    }
    if (nodes.length) structure = { nodes, edges };
  }

  const hiddenSet = new Set<string>();
  if (Array.isArray(r.hidden)) {
    for (const v of r.hidden) {
      const id = ref(v);
      if (id) hiddenSet.add(id);
    }
  } else for (const p of parts) hiddenSet.add(p.id); // an exercise hides everything unless it says otherwise
  const hidden = inOrder(hiddenSet);
  const revealedSet = new Set<string>();
  for (const v of Array.isArray(r.revealed) ? r.revealed : []) {
    const id = ref(v);
    if (id && hiddenSet.has(id)) revealedSet.add(id);
  }
  const answers: [string, string][] = [];
  const hints: [string, number][] = [];
  const ra = r.answers && typeof r.answers === 'object' ? (r.answers as Record<string, unknown>) : {};
  const rh = r.hints && typeof r.hints === 'object' ? (r.hints as Record<string, unknown>) : {};
  const rawAnswer = new Map<string, string>();
  const rawHint = new Map<string, number>();
  for (const [k, v] of Object.entries(ra)) {
    const id = ref(k);
    const t = cleanText(v, EXERCISE_LIMITS.answer);
    if (id && hiddenSet.has(id) && t && !rawAnswer.has(id)) rawAnswer.set(id, t);
  }
  for (const [k, v] of Object.entries(rh)) {
    const id = ref(k);
    if (id && hiddenSet.has(id) && typeof v === 'number' && Number.isInteger(v) && v >= 1 && !rawHint.has(id)) rawHint.set(id, Math.min(EXERCISE_LIMITS.hints, v));
  }
  for (const id of hidden) {
    const a = rawAnswer.get(id);
    if (a) answers.push([id, a]);
    const h = rawHint.get(id);
    if (h) hints.push([id, h]);
  }
  // grades are computed from the answers here, so a stored "right" is never taken on trust
  const graded = answers.map(([id, a]): [string, Grade] => [id, gradeAnswer(a, parts.find((p) => p.id === id)!)]);

  // labeling needs a picture; without one, an exercise is recall from a list
  const mode: ExerciseMode = structure && r.mode !== 'recall' ? 'label' : 'recall';
  let view: ExerciseView = VIEWS.includes(r.view as ExerciseView) ? (r.view as ExerciseView) : mode;
  if (view === 'label' && !structure) view = 'recall';
  const rounds = typeof r.rounds === 'number' && Number.isInteger(r.rounds) ? Math.min(EXERCISE_LIMITS.rounds, Math.max(1, r.rounds)) : 1;
  return {
    title: cleanText(r.title, EXERCISE_LIMITS.title) || cleanText(`${sourceTitle} — test yourself`, EXERCISE_LIMITS.title),
    view,
    mode,
    source,
    structure,
    parts,
    hidden,
    answers: Object.fromEntries(answers),
    graded: Object.fromEntries(graded),
    revealed: inOrder(revealedSet),
    hints: Object.fromEntries(hints),
    rounds,
  };
}

/** Which parts to hide: all of them, or `count` evenly spaced through the order given — never chosen by chance. */
export function chooseHidden(ids: readonly string[], hide?: 'all' | number): string[] {
  if (hide === undefined || hide === 'all' || typeof hide !== 'number' || !Number.isFinite(hide)) return [...ids];
  const k = Math.max(0, Math.min(ids.length, Math.floor(hide)));
  if (k >= ids.length) return [...ids];
  const out: string[] = [];
  for (let i = 0; i < k; i++) out.push(ids[Math.floor(((i + 0.5) * ids.length) / k)]);
  return out;
}

export interface ExerciseSpec {
  sourceKind: string;
  sourceTitle: string;
  /** false when Socria drew the source */
  verified: boolean;
  parts: { id: string; label: string; cue?: string; accept?: string[] }[];
  structure?: { nodes: { id: string; x?: number; y?: number }[]; edges?: { from: string; to: string }[] } | null;
  hide?: 'all' | number;
  note?: string;
  title?: string;
  mode?: ExerciseMode;
}

/**
 * An exercise from another display's parts. The parts are taken in id order
 * (natural: p2 before p10), so which are hidden depends on the parts alone —
 * not on the order they were handed over in, and never on chance.
 */
export function exerciseFrom(spec: ExerciseSpec): ExerciseState | null {
  if (!spec || !Array.isArray(spec.parts)) return null;
  const seen = new Set<string>();
  const parts = spec.parts
    .filter((p) => {
      const id = p && cleanId(p.id);
      if (!id || seen.has(id) || !normaliseAnswer(cleanText(p.label, EXERCISE_LIMITS.answer))) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => naturalCompare(a.id, b.id))
    .slice(0, EXERCISE_LIMITS.parts);
  if (!parts.length) return null;
  return sanitizeExercise({
    title: spec.title,
    mode: spec.mode ?? (spec.structure ? 'label' : 'recall'),
    source: { kind: spec.sourceKind, title: spec.sourceTitle, verified: spec.verified === true, note: spec.note },
    structure: spec.structure ?? null,
    parts: parts.map((p) => ({ id: p.id, answer: p.label, cue: p.cue, accept: p.accept })),
    hidden: chooseHidden(
      parts.map((p) => p.id),
      spec.hide
    ),
    rounds: 1,
  });
}

// ── what is computed ─────────────────────────────────────────────────

const hiddenParts = (s: ExerciseState): ExercisePart[] => s.parts.filter((p) => s.hidden.includes(p.id));
const partOf = (s: ExerciseState, id: unknown): ExercisePart | null => s.parts.find((p) => p.id === id) ?? null;
/** a hidden label the person has not chosen to see */
const concealed = (s: ExerciseState, id: string): boolean => s.hidden.includes(id) && !s.revealed.includes(id);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The number a hidden part goes by — 1, 2, 3 … among the hidden, in order. 0 when it is not hidden. */
export function hiddenNumber(s: ExerciseState, id: string): number {
  return hiddenParts(s).findIndex((p) => p.id === id) + 1;
}

export interface Tally {
  hidden: number;
  right: number;
  close: number;
  wrong: number;
  revealed: number;
  toGo: number;
}

/** This round, counted over the hidden labels. */
export function tally(s: ExerciseState): Tally {
  const t: Tally = { hidden: s.hidden.length, right: 0, close: 0, wrong: 0, revealed: 0, toGo: 0 };
  for (const p of hiddenParts(s)) {
    if (s.revealed.includes(p.id)) t.revealed++;
    else if (s.graded[p.id] === 'right') t.right++;
    else if (s.graded[p.id] === 'close') t.close++;
    else if (s.graded[p.id] === 'wrong') t.wrong++;
    else t.toGo++;
  }
  return t;
}

/** "This round: 3 of 8 right, 1 close, 4 to go." — about this attempt, never about mastery. */
export function tallyLine(s: ExerciseState): string {
  const t = tally(s);
  if (!t.hidden) return 'Nothing is hidden: every label is showing.';
  const bits = [`${t.right} of ${t.hidden} right`];
  if (t.close) bits.push(`${t.close} close`);
  if (t.wrong) bits.push(`${t.wrong} wrong`);
  if (t.revealed) bits.push(`${t.revealed} revealed`);
  if (t.toGo) bits.push(`${t.toGo} to go`);
  return `This round: ${bits.join(', ')}.`;
}

/** A pattern for a label inside other words — whole words, either number — so it can be kept out of what is said. */
function labelPattern(label: string): RegExp | null {
  const core = label.replace(/^(?:the|a|an)\s+/i, '').trim();
  if ([...core].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length < 2) return null;
  const stem = core.replace(/s$/i, '') || core;
  const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?:e?s)?(?![\\p{L}\\p{N}])`, 'giu');
}

function masked(s: ExerciseState, text: string, secret: (p: ExercisePart) => boolean): string {
  let out = text;
  for (const p of s.parts) {
    if (!secret(p)) continue;
    for (const a of [p.answer, ...(p.accept ?? [])]) {
      const re = labelPattern(a);
      if (re) out = out.replace(re, '…');
    }
  }
  return out;
}

/**
 * Words with the label of every hidden part (and its alternatives) taken out —
 * for anything said to the conversation, which never carries a hidden label,
 * even one the person has got right or chosen to see.
 */
export function withoutHidden(s: ExerciseState, text: string): string {
  return masked(s, text, (p) => s.hidden.includes(p.id));
}

/** A label still to be recalled: hidden, not revealed, not yet got right. A hint keeps these out; the rest the person already knows. */
const stillSecret = (s: ExerciseState, p: ExercisePart): boolean => concealed(s, p.id) && s.graded[p.id] !== 'right';

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const letterCount = (w: string): number => [...w].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
const listOf = (xs: (string | number)[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : String(xs[0] ?? ''));

/** The labels a part sits beside in the picture that the person already knows — showing, revealed, or got right. */
function neighbours(s: ExerciseState, id: string): string[] {
  const out: string[] = [];
  for (const e of s.structure?.edges ?? []) {
    const other = e.from === id ? e.to : e.to === id ? e.from : null;
    const p = other ? partOf(s, other) : null;
    if (!p || stillSecret(s, p)) continue;
    if (!out.includes(p.answer)) out.push(p.answer);
  }
  return out;
}

/**
 * A hint for a hidden part. 1: the first letter. 2: the first letter and how
 * many letters (per word). 3: the context — the source's cue, or the visible
 * labels it sits beside. Never the label: every label still to be recalled is
 * kept out of the cue, this one's included.
 */
export function exerciseHint(s: ExerciseState, id: string, level: number): string {
  const p = partOf(s, id);
  if (!p) return '';
  const first = [...normaliseAnswer(p.answer)][0]?.toUpperCase() ?? '?';
  const words = p.answer
    .replace(/^(?:the|a|an)\s+/i, '')
    .split(/[\s-]+/)
    .filter((w) => letterCount(w) > 0);
  if (level <= 1) return `It begins with “${first}”.`;
  if (level === 2) {
    const counts = words.map(letterCount);
    return counts.length <= 1
      ? `It begins with “${first}” and has ${counts[0] ?? 0} letters.`
      : `It begins with “${first}”: ${NUMBER_WORDS[counts.length] ?? counts.length} words, of ${listOf(counts)} letters.`;
  }
  const secret = (q: ExercisePart) => q.id === p.id || stillSecret(s, q);
  const cue = p.cue ? masked(s, p.cue, secret) : '';
  if (cue && /[\p{L}]{2}/u.test(cue.replace(/…/g, ''))) return `Context: ${cue}`;
  const near = neighbours(s, p.id).map((x) => `“${x}”`);
  if (near.length) return masked(s, `It sits next to ${listOf(near)}.`, secret);
  return 'There is no more context for this one — reveal it if you want to see it.';
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<ExerciseState>[] = [
  {
    id: 'label',
    label: 'Label',
    shows: 'the picture with its labels hidden, numbered for you to fill in',
    primary: true,
    interactions: ['type a label into a numbered box', 'ask for a hint', 'reveal a label'],
    unavailable: (s) => (s.structure ? null : 'There is no picture to label — answer from the list instead.'),
  },
  { id: 'recall', label: 'Recall', shows: 'the hidden labels as a numbered list, with their cues, to recall without the picture', interactions: ['type an answer', 'ask for a hint', 'reveal a label'] },
  {
    id: 'results',
    label: 'Results',
    shows: 'how this round went — right, close, wrong — and what is still to go',
    interactions: ['go again on the ones you missed'],
    unavailable: (s) => (Object.keys(s.answers).length || s.revealed.length ? null : 'Nothing answered yet.'),
  },
];

function needHidden(s: ExerciseState, id: unknown): string | null {
  const p = partOf(s, id);
  if (!p) return 'There is no such label in this exercise.';
  if (!s.hidden.includes(p.id)) return 'That label is showing — there is nothing to recall.';
  if (s.revealed.includes(p.id)) return 'That label has been revealed; it comes back to recall in the next round.';
  return null;
}

export const EXERCISE_OPS = {
  ...headOps<ExerciseState>(views, sanitizeExercise),
  answer: op<ExerciseState>(
    'Answer',
    (s, a, ctx) => {
      if (ctx?.by === 'socria' || a.by === 'socria') return 'Only you answer — Socria does not answer for you.';
      const forged = guardBy(a, ctx);
      if (forged) return forged;
      if (a.by !== 'person') return 'Say who is answering.';
      return needHidden(s, a.part) ?? (cleanText(a.text, EXERCISE_LIMITS.answer) ? null : 'Write your answer.');
    },
    (s, a) => sanitizeExercise({ ...s, answers: { ...s.answers, [String(a.part)]: cleanText(a.text, EXERCISE_LIMITS.answer) } }) ?? s,
    () => 'answered a label'
  ),
  hint: op<ExerciseState>(
    'Hint',
    (s, a, ctx) => {
      if (ctx?.by === 'socria') return 'A hint comes when you ask for one.';
      const miss = needHidden(s, a.part);
      if (miss) return miss;
      if (s.graded[String(a.part)] === 'right') return 'You already have that one right.';
      if ((s.hints[String(a.part)] ?? 0) >= EXERCISE_LIMITS.hints) return 'That is every hint there is for it — reveal it if you want to see it.';
      return null;
    },
    (s, a) => sanitizeExercise({ ...s, hints: { ...s.hints, [String(a.part)]: (s.hints[String(a.part)] ?? 0) + 1 } }) ?? s,
    () => 'asked for a hint'
  ),
  reveal: op<ExerciseState>(
    'Reveal',
    (s, a, ctx) => {
      if (ctx?.by === 'socria') return 'Only you choose to see a label.';
      const miss = needHidden(s, a.part);
      if (miss) return miss;
      return s.graded[String(a.part)] === 'right' ? 'You already have that one right.' : null;
    },
    (s, a) => sanitizeExercise({ ...s, revealed: [...s.revealed, String(a.part)] }) ?? s,
    () => 'revealed a label'
  ),
  again: op<ExerciseState>(
    'Another round',
    (s, _a, ctx) => {
      if (ctx?.by === 'socria') return 'Another round clears your answers, so it is yours to start.';
      if (!s.hidden.length) return 'Nothing is hidden — hide the labels first.';
      if (s.hidden.some((id) => s.revealed.includes(id) || s.graded[id] === 'wrong')) return null;
      return s.hidden.some((id) => !s.graded[id])
        ? 'Answer the rest first — or reveal the ones you cannot recall.'
        : 'Nothing to go again on: every hidden label is right or close. Hide them all for a fresh round, or start over.';
    },
    (s) => {
      const redo = new Set(s.hidden.filter((id) => s.revealed.includes(id) || s.graded[id] === 'wrong'));
      const keep = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([id]) => !redo.has(id)));
      return sanitizeExercise({ ...s, answers: keep(s.answers), hints: keep(s.hints), revealed: [], rounds: s.rounds + 1, view: s.mode }) ?? s;
    },
    () => 'started another round'
  ),
  hideAll: op<ExerciseState>(
    'Hide every label',
    (s) => (s.hidden.length === s.parts.length && !s.revealed.length ? 'Every label is already hidden.' : null),
    (s) => sanitizeExercise({ ...s, hidden: s.parts.map((p) => p.id), revealed: [], view: s.mode }) ?? s,
    () => 'hid every label'
  ),
  reset: op<ExerciseState>(
    'Start over',
    (s, _a, ctx) => {
      if (ctx?.by === 'socria') return 'Your answers are yours — Socria does not clear them.';
      return Object.keys(s.answers).length || s.revealed.length || Object.keys(s.hints).length || s.rounds > 1 ? null : 'There is nothing to start over from yet.';
    },
    (s) => sanitizeExercise({ ...s, answers: {}, hints: {}, revealed: [], rounds: 1, view: s.mode }) ?? s,
    () => 'started over'
  ),
};

// ── words → an operation ─────────────────────────────────────────────

const ANSWER_SEP = /^(?:(?:number|no\.?|label|part)\s*|#\s*)?(\d{1,2})\s*(?:is\b|=|:|-|–|—|\)|\.(?!\d))\s*(.+)$/i;
const ANSWER_NAMED = /^(?:(?:number|no\.?|label|part)\s*|#\s*)(\d{1,2})\s+(.+)$/i;
/** words that make "3 is …" a remark rather than a label */
const NOT_A_LABEL =
  /\b(?:not|wrong|incorrect|prime|number|numbers|times|plus|minus|divided|equals?|than|because|my|your|our|his|her|their|maybe|probably|think|guess|sure|unsure|confusing|confused|easy|what|why|how|which|who|hint|reveal|again|best|worst|favourite|favorite|good|bad|great|nice|cool|fine|okay|lol)\b/i;
const NOT_AN_ANSWER = /^(?:right|correct|ok|yes|no|it|this|that|done|wrong)$/i;
const unquote = (t: string): string => t.trim().replace(/^[“"'‘]+|[”"'’]+$/g, '').trim();

/**
 * An operation the words plainly ask for on THIS exercise: "check my answers",
 * "hint for 3" (the third hidden label) or "give me a hint", "reveal 3",
 * "again" / "another round", "hide all the labels", "start over", and an
 * answer by position among the hidden labels — "3 is aorta", "number 3:
 * aorta". Conservative: anything that reads as a remark or a question is left
 * to the conversation.
 */
export function readExerciseOp(text: string, s: ExerciseState, _today: string): { op: string; args: Args } | null {
  const t = text.trim();
  if (!t || t.length > 120) return null;
  const n = norm(t);
  const hid = hiddenParts(s);
  const nth = (k: number): ExercisePart | null => (k >= 1 && k <= hid.length ? hid[k - 1] : null);

  if (
    /^(?:please )?(?:check|grade|mark)(?: (?:it|this|them|my answers?|the answers?|my labels|the labels|my work))?(?: please)?$/.test(n) ||
    /^(?:show|see|view)(?: me)?(?: the| my)? (?:results|score)$/.test(n) ||
    n === 'how did i do'
  ) {
    return { op: 'view', args: { view: 'results' } };
  }
  let m = /^(?:please )?(?:(?:can|could|may) (?:i|you) (?:have|get|give me) )?(?:give me )?(?:a |another |one more )?(?:hint|clue)(?: (?:for|on|about|with))?(?: (?:number|label|part|no))? (\d{1,2})(?: please)?$/.exec(n);
  if (m) {
    const p = nth(Number(m[1]));
    return p ? { op: 'hint', args: { part: p.id } } : null;
  }
  if (/^(?:please )?(?:(?:can|could|may) (?:i|you) (?:have|get|give me) )?(?:(?:give me|i need|i want|id like|i would like) )?(?:a |another |one more |any )?(?:hint|hints|clue)(?: please)?$/.test(n)) {
    const open = hid.filter((p) => !s.revealed.includes(p.id) && s.graded[p.id] !== 'right');
    const p = open.find((x) => (s.hints[x.id] ?? 0) < EXERCISE_LIMITS.hints) ?? open[0];
    return p ? { op: 'hint', args: { part: p.id } } : null;
  }
  m = /^(?:please )?(?:reveal|show me the answer (?:to|for)|show the answer (?:to|for)|give me the answer (?:to|for))(?: (?:number|label|part|no))? (\d{1,2})$/.exec(n);
  if (m) {
    const p = nth(Number(m[1]));
    return p ? { op: 'reveal', args: { part: p.id } } : null;
  }
  if (/^(?:again|go again|try again|again please|another round|one more round|a new round|new round|next round|once more|round two|lets go again|let s go again)$/.test(n)) return { op: 'again', args: {} };
  if (/^(?:please )?hide (?:all|all the labels|the labels|all labels|them all|everything|all of them|every label)$/.test(n) || /^test me on (?:all of them|everything|all the labels|every label)$/.test(n)) {
    return { op: 'hideAll', args: {} };
  }
  if (/^(?:please )?(?:reset|start over|start again|restart|reset the exercise|clear my answers)$/.test(n)) return { op: 'reset', args: {} };
  const view = /^(?:please )?(?:show|view|see|switch to|go to)(?: me)?(?: the| my)? (diagram|picture|labels|list|recall list)$/.exec(n);
  if (view) return { op: 'view', args: { view: /list/.test(view[1]) ? 'recall' : 'label' } };

  // an answer by position: "3 is aorta", "number 3: aorta", "#3 aorta"
  const raw = t.replace(/[.!]+$/, '').trim();
  m = ANSWER_SEP.exec(raw) ?? ANSWER_NAMED.exec(raw);
  if (m) {
    const p = nth(Number(m[1]));
    const said = unquote(m[2]);
    const words = said.split(/\s+/).filter(Boolean);
    if (
      !p ||
      !said ||
      said.length > EXERCISE_LIMITS.answer ||
      words.length > 6 ||
      /[?]/.test(said) ||
      !/\p{L}/u.test(said) ||
      NOT_A_LABEL.test(said) ||
      NOT_AN_ANSWER.test(said) ||
      /\b\d{1,2}\s*(?:is\b|=|:)/i.test(said)
    ) {
      return null;
    }
    return { op: 'answer', args: { part: p.id, text: said, by: 'person' } };
  }
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

function statusOf(s: ExerciseState, id: string): string {
  if (s.revealed.includes(id)) return 'revealed';
  const g = s.graded[id];
  return g === 'right' ? 'right' : g === 'close' ? 'close — check the spelling' : g === 'wrong' ? 'not right yet' : 'not answered yet';
}

/**
 * What the conversation is told: the source and how far to trust it, and this
 * round's count. Never a hidden label — and everything said passes through
 * withoutHidden, so not even a title can carry one.
 */
function exerciseFacts(s: ExerciseState, guarded: boolean): string[] {
  const t = tally(s);
  const hintsUsed = Object.values(s.hints).reduce((a, b) => a + b, 0);
  const out = [
    `${s.title}: a ${s.mode === 'label' ? 'labeling' : 'recall'} exercise on “${s.source.title}” (${s.source.kind}), round ${s.rounds}; ${t.hidden} of ${plural(s.parts.length, 'label')} hidden.`,
    s.source.verified
      ? `It is graded against the labels in “${s.source.title}” as that source gives them; nothing here checks them against any other reference.`
      : `“${s.source.title}” was drawn by Socria and is not verified: the labels are graded against that drawing only, and nothing here vouches for its accuracy.`,
    tallyLine(s),
  ];
  if (hintsUsed) out.push(`${plural(hintsUsed, 'hint')} asked for this round.`);
  out.push(
    guarded
      ? 'They are recalling these themselves: never say, spell or describe a hidden label — not its letters, its length or what it is — beyond the hints they have asked for.'
      : 'Never say a hidden label: the person is testing their own recall.'
  );
  return out.map((line) => withoutHidden(s, line));
}

function exerciseText(s: ExerciseState): string {
  const out = [`EXERCISE “${s.title}” — ${s.mode}, round ${s.rounds}, on “${s.source.title}” (${s.source.kind}${s.source.verified ? '' : '; drawn by Socria, unverified'})`];
  const hid = hiddenParts(s);
  if (hid.length) {
    out.push('Hidden labels, numbered as the person sees them (their answers are not repeated here):');
    hid.forEach((p, i) => out.push(`${i + 1}. ${statusOf(s, p.id)}${s.hints[p.id] ? ` · hint ${s.hints[p.id]} of ${EXERCISE_LIMITS.hints}` : ''}`));
  }
  const shown = s.parts.filter((p) => !s.hidden.includes(p.id)).map((p) => p.answer);
  if (shown.length) out.push(`Showing: ${shown.join('; ')}`);
  out.push(tallyLine(s));
  return withoutHidden(s, out.join('\n')).slice(0, 2400);
}

export const EXERCISE = displayKind<ExerciseState>({
  kind: 'exercise',
  label: 'Exercise',
  sanitize: sanitizeExercise,
  ops: EXERCISE_OPS,
  readOp: (text, s) => readExerciseOp(text, s, todayDay()),
  consequence: (_before, after, step) => {
    const id = String(step.args.part ?? '');
    const k = hiddenNumber(after, id);
    let note: string | null = null;
    if (step.op === 'answer') {
      const g = after.graded[id];
      note = `Label ${k}: ${g === 'right' ? 'right' : g === 'close' ? 'close — check the spelling' : 'not right yet'}. ${tallyLine(after)}`;
    } else if (step.op === 'hint') note = `Label ${k}, hint ${after.hints[id] ?? 1}: ${exerciseHint(after, id, after.hints[id] ?? 1)}`;
    else if (step.op === 'reveal') note = `Label ${k} revealed.`;
    else if (step.op === 'again') note = `Round ${after.rounds}: ${plural(tally(after).toGo, 'label')} to recall again.`;
    else if (step.op === 'hideAll') note = `Every label hidden: ${after.hidden.length} to recall.`;
    else if (step.op === 'reset') note = `Started over: ${plural(after.hidden.length, 'label')} hidden.`;
    return note === null ? null : withoutHidden(after, note);
  },
  facts: (s, opts) => exerciseFacts(s, opts.guarded),
  text: exerciseText,
  // a hidden part goes by its number, never its label
  parts: (s): Part[] => s.parts.map((p) => ({ id: p.id, label: s.hidden.includes(p.id) ? `Label ${hiddenNumber(s, p.id)}` : withoutHidden(s, p.answer) })),
  partFacts: (s, part) => {
    const p = partOf(s, part);
    if (!p) return null;
    if (!s.hidden.includes(p.id)) return [withoutHidden(s, p.answer), 'showing', ...(p.cue ? [withoutHidden(s, p.cue)] : [])];
    return [`hidden label ${hiddenNumber(s, p.id)}`, statusOf(s, p.id), ...(s.hints[p.id] ? [`hint ${s.hints[p.id]} of ${EXERCISE_LIMITS.hints}`] : [])];
  },
  views,
  size: (s, mode) =>
    mode === 'card'
      ? { w: 260, h: 150 }
      : mode === 'trail'
        ? { w: 200, h: 110 }
        : s.view === 'label' && s.structure
          ? { w: 680, h: 560 }
          : { w: 560, h: Math.min(640, 140 + 34 * Math.max(3, s.parts.length)) },
  shape: (s) => `exercise · ${s.hidden.length} of ${plural(s.parts.length, 'label')} hidden · round ${s.rounds}`,
});

register(EXERCISE);
registerDisplay({
  kind: 'exercise',
  noun: 'exercise',
  handle: 'X',
  about: 'Labeling and retrieval practice over another display’s parts — the labels hidden, the answers graded, hints only when asked.',
  practice: true,
  // made from a diagram or the map (display-make.ts), never drafted — a quiz about a topic is not made
  called: [
    {
      words: ['labeling exercise', 'labelling exercise', 'labeling quiz', 'labelling quiz', 'labeling practice', 'labelling practice', 'recall exercise', 'recall practice', 'practice quiz', 'self test', 'quiz'],
    },
  ],
  tell: (guarded) =>
    guarded
      ? 'An EXERCISE is the person recalling labels of their own diagram or map. Do not say a hidden label, confirm a guess or give the answer to a part — the workspace grades their answers and gives hints when they ask; ask what they remember about the part instead.'
      : 'An EXERCISE is the person recalling labels of their own diagram or map; the workspace grades their answers. Do not give hidden labels away unless they ask to see one.',
});
