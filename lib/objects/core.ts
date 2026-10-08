// OBJECTS OF THOUGHT — the thing the person is reasoning about, held as itself.
//
// The map holds statements about the thinking: claims, steps, questions. That
// is right for an argument and wrong for a matrix. "STEP: perform row
// elimination" is a sentence about a matrix; the person needs the matrix, and
// they need to see what THEIR operation does to it. So a thing that has state
// and can be operated on — a matrix, a function — is held here as a
// first-class object:
//
//   object   one identity ("A") and its history of states
//   state    a value the registry for its kind can check and draw
//   step     the transformation between two states: which operation, with
//            what arguments, WHO CHOSE IT, and that the result was COMPUTED
//
//   STATE A ──(R2 ← R2 − 3R1 · chosen by you · computed)──▶ STATE B
//
// THE RULES THIS FILE KEEPS
//
// 1. Every state after the first is produced by an operation the kind's code
//    computed. Nothing — not the reply model, not the extractor — can put a
//    state into a history; it can only propose an operation, which is checked
//    and computed here, or be refused.
// 2. Provenance is never blurred. The first state says where it came from
//    (the person's own words, material they attached, or Socria's reading of
//    the conversation); each step says who chose the operation and whether
//    Socria had suggested it. "Computed" is not a provenance anyone can claim:
//    it is what this file does.
// 3. The object is canonical and lives in the map (ThinkingMap.objects), so it
//    persists, restores and syncs exactly as the rest of the thinking does.
//    Views are projections of it; none of them holds state of its own.
// 4. A kind is a registry entry, not a branch in a renderer. Adding one is
//    adding an entry; nothing downstream switches on kind names.
//
// PURE.

export type ObjectOrigin = 'person' | 'source' | 'socria';

export interface Step {
  /** the operation's name within its kind — 'comb', 'swap', 'param' */
  op: string;
  args: Record<string, string | number>;
  /** the operation as written in the kind's own notation: "R2 ← R2 − 3R1" */
  said: string;
  /** who CHOSE the operation */
  by: 'person' | 'socria';
  /** Socria proposed it and the person applied it */
  suggested?: boolean;
  /** what the computation showed about this step — never an opinion */
  note?: string;
  at: number;
}

export interface ThoughtObject<S = unknown> {
  id: string;
  kind: string;
  /** what the person calls it: "A", "f" */
  name: string;
  /** where its first state came from */
  origin: ObjectOrigin;
  /** states[0] is the starting state; states[i + 1] is what steps[i] computed */
  states: S[];
  steps: Step[];
  /** which state is current — stepping back moves this, it erases nothing */
  at: number;
  /** how many of the earliest states are no longer kept (the history is capped from its start) */
  trimmed?: number;
}

export interface ObjectSpace {
  objs: ThoughtObject[];
}

/** One addressable part of an object: a row, an entry, a parameter. */
export interface Part {
  id: string;
  label: string;
}

/** A way of showing an object — declared by its kind, available or not by its state. */
export interface ViewDecl<S = unknown> {
  id: string;
  label: string;
  /** what this view shows that the others do not */
  shows: string;
  /** the view an object opens in */
  primary?: boolean;
  /** what a person can do in it */
  interactions: string[];
  /** null when available; otherwise why not, in a sentence */
  unavailable?: (state: S) => string | null;
}

export interface OpDef<S> {
  label: string;
  /** null when the operation is legitimate on this state; otherwise why not */
  check: (state: S, args: Record<string, string | number>) => string | null;
  apply: (state: S, args: Record<string, string | number>) => S;
  say: (args: Record<string, string | number>) => string;
}

export interface ObjectKind<S = unknown> {
  kind: string;
  label: string;
  sanitize: (raw: unknown) => S | null;
  same: (a: S, b: S) => boolean;
  ops: Record<string, OpDef<S>>;
  /** read an operation out of words, if the words plainly are one */
  readOp: (text: string, state: S) => { op: string; args: Record<string, string | number> } | null;
  /** what the computation can say about a step, comparing before and after */
  consequence: (before: S, after: S, step: Pick<Step, 'op' | 'args'>) => string | null;
  /** canonical facts, for the conversation and synthesis — `guarded` withholds what would be the answer */
  facts: (state: S, opts: { guarded: boolean }) => string[];
  /** the state written out as text, for a model that cannot see the figure */
  text: (state: S) => string;
  parts: (state: S) => Part[];
  partFacts: (state: S, part: string) => string[] | null;
  views: ViewDecl<S>[];
  /** the figure's footprint, for a layout to make room for: live, a step in a trail, or a card */
  size: (state: S, mode: 'live' | 'trail' | 'card') => { w: number; h: number };
  /** a one-line name for the state's shape: "3 × 4 matrix" */
  shape: (state: S) => string;
  /**
   * How many arguments an operation may carry, and how long a text argument
   * may be, when a stored history is re-read. Eight short arguments are
   * enough for a row operation; a scene's "add a box 2 × 1 × 3 on the table"
   * carries more. Absent: 8 and 60.
   */
  argLimits?: { count: number; length: number };
  /** states kept for one object of this kind; absent, MAX_STATES. A scene's states are large, so it keeps fewer. */
  maxStates?: number;
}

// ── the registry ─────────────────────────────────────────────────────

const KINDS = new Map<string, ObjectKind<any>>();

export function register<S>(k: ObjectKind<S>): void {
  KINDS.set(k.kind, k as ObjectKind<any>);
}
export const kindOf = (kind: string): ObjectKind<any> | null => KINDS.get(kind) ?? null;
export const kinds = (): ObjectKind<any>[] => [...KINDS.values()];

// ── reading an object ────────────────────────────────────────────────

export const EMPTY_SPACE: ObjectSpace = { objs: [] };
export const MAX_OBJECTS = 8;
/** States kept per object. The oldest go first; a long elimination is ~10 steps. */
export const MAX_STATES = 40;
const capOf = (k: ObjectKind<any> | null) => Math.max(2, Math.min(MAX_STATES, k?.maxStates ?? MAX_STATES));

export const currentOf = <S>(o: ThoughtObject<S>): S => o.states[Math.min(Math.max(0, o.at), o.states.length - 1)];
export const objOf = (space: ObjectSpace | null | undefined, id: string | null | undefined): ThoughtObject | null =>
  (id && space?.objs.find((o) => o.id === id)) || null;

/** A fresh id from a name: "A", then "A2", "A3". */
export function freshId(space: ObjectSpace, name: string): string {
  const base = name.replace(/[^A-Za-z0-9_]/g, '').slice(0, 12) || 'M';
  if (!space.objs.some((o) => o.id === base)) return base;
  for (let i = 2; i < 100; i++) if (!space.objs.some((o) => o.id === `${base}${i}`)) return `${base}${i}`;
  return `${base}${Date.now() % 1e6}`;
}

/** A name the person has not used yet: A, B, C … for matrices; f, g, h for functions. */
export function freshName(space: ObjectSpace, letters: string): string {
  for (const l of letters) if (!space.objs.some((o) => o.name === l)) return l;
  return letters[0] + (space.objs.length + 1);
}

/** Start an object from a state. The state is checked by its kind or nothing is made. */
export function create(
  space: ObjectSpace,
  kind: string,
  raw: unknown,
  meta: { name?: string; origin: ObjectOrigin }
): { space: ObjectSpace; obj: ThoughtObject } | null {
  const k = kindOf(kind);
  if (!k || space.objs.length >= MAX_OBJECTS) return null;
  const state = k.sanitize(raw);
  if (state === null) return null;
  const name = (meta.name && /^[A-Za-z][A-Za-z0-9_']{0,7}$/.test(meta.name) ? meta.name : null) ?? freshName(space, kind === 'function' ? 'fghpq' : 'ABCDEFGH');
  const obj: ThoughtObject = { id: freshId(space, name), kind, name, origin: meta.origin, states: [state], steps: [], at: 0 };
  return { space: { objs: [...space.objs, obj] }, obj };
}

export type Applied =
  | { ok: true; space: ObjectSpace; obj: ThoughtObject; step: Step }
  | { ok: false; why: string };

/**
 * Apply an operation to the current state, computed by the kind's code. A
 * step taken from an earlier state replaces what came after it (as an edit
 * after an undo does everywhere) — the states it leaves are the ones the
 * person stepped back from.
 */
export function apply(
  space: ObjectSpace,
  id: string,
  op: string,
  args: Record<string, string | number>,
  who: { by: 'person' | 'socria'; suggested?: boolean; at?: number }
): Applied {
  const obj = objOf(space, id);
  if (!obj) return { ok: false, why: 'There is no such object in the workspace.' };
  const k = kindOf(obj.kind);
  const def = k?.ops[op];
  if (!k || !def) return { ok: false, why: `A ${k?.label.toLowerCase() ?? 'thing'} cannot do that.` };
  const before = currentOf(obj);
  const refused = def.check(before, args);
  if (refused) return { ok: false, why: refused };
  let after: unknown;
  try {
    after = def.apply(before, args);
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : 'That could not be computed.' };
  }
  const note = k.consequence(before, after, { op, args });
  const step: Step = {
    op,
    args,
    said: def.say(args),
    by: who.by,
    ...(who.suggested ? { suggested: true } : {}),
    ...(note ? { note } : {}),
    at: who.at ?? Date.now(),
  };
  let states = [...obj.states.slice(0, obj.at + 1), after];
  let steps = [...obj.steps.slice(0, obj.at), step];
  let trimmed = obj.trimmed ?? 0;
  // Past the cap the OLDEST states go, the start among them. What is kept must
  // still be a chain in which each state follows from the one before by its
  // step — that is what sanitizeSpace re-computes on every load. Keeping the
  // start and dropping states after it broke the chain at the gap, and the
  // next load cut the whole history back to the start.
  const cap = capOf(k);
  while (states.length > cap) {
    states = states.slice(1);
    steps = steps.slice(1);
    trimmed++;
  }
  const next: ThoughtObject = { ...obj, states, steps, at: states.length - 1, ...(trimmed ? { trimmed } : {}) };
  return { ok: true, space: { objs: space.objs.map((o) => (o.id === id ? next : o)) }, obj: next, step };
}

/** Look at an earlier (or later) state without losing any. */
export function seek(space: ObjectSpace, id: string, at: number): ObjectSpace {
  return {
    objs: space.objs.map((o) => (o.id === id ? { ...o, at: Math.min(Math.max(0, Math.round(at)), o.states.length - 1) } : o)),
  };
}

export function remove(space: ObjectSpace, id: string): ObjectSpace {
  return { objs: space.objs.filter((o) => o.id !== id) };
}

// ── what is read back is checked ─────────────────────────────────────

const ORIGINS: ObjectOrigin[] = ['person', 'source', 'socria'];

/**
 * Sanitise an object space read from storage or a request. Every state is
 * re-checked by its kind, and every step is RE-COMPUTED from the state before
 * it: a stored history whose states do not follow from its operations is cut
 * at the first one that does not. A browser cannot hand the conversation a
 * "computed" matrix that nothing computed.
 */
export function sanitizeSpace(raw: unknown): ObjectSpace | undefined {
  const list = (raw as { objs?: unknown })?.objs;
  if (!Array.isArray(list)) return undefined;
  const out: ThoughtObject[] = [];
  const ids = new Set<string>();
  for (const r of list.slice(0, MAX_OBJECTS)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const k = typeof o.kind === 'string' ? kindOf(o.kind) : null;
    if (!k) continue;
    const id = typeof o.id === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(o.id) ? o.id : null;
    if (!id || ids.has(id)) continue;
    const states = Array.isArray(o.states) ? o.states : [];
    const first = k.sanitize(states[0]);
    if (first === null) continue;
    const kept: unknown[] = [first];
    const steps: Step[] = [];
    const rawSteps = Array.isArray(o.steps) ? o.steps : [];
    for (let i = 0; i < rawSteps.length && kept.length < capOf(k); i++) {
      const s = rawSteps[i] as Record<string, unknown> | null;
      const def = s && typeof s.op === 'string' ? k.ops[s.op] : null;
      if (!s || !def) break;
      const args: Record<string, string | number> = {};
      if (s.args && typeof s.args === 'object') {
        const lim = k.argLimits ?? { count: 8, length: 60 };
        for (const [a, v] of Object.entries(s.args as Record<string, unknown>).slice(0, lim.count)) {
          if (typeof v === 'number' && Number.isFinite(v)) args[a] = v;
          else if (typeof v === 'string' && v.length <= lim.length) args[a] = v;
        }
      }
      const before = kept[kept.length - 1];
      if (def.check(before, args)) break;
      let after: unknown;
      try {
        after = def.apply(before, args);
      } catch {
        break;
      }
      const claimed = k.sanitize(states[i + 1]);
      if (claimed === null || !k.same(claimed, after)) break; // the history does not follow — stop here
      kept.push(after);
      const note = k.consequence(before, after, { op: s.op as string, args });
      steps.push({
        op: s.op as string,
        args,
        said: def.say(args),
        by: s.by === 'socria' ? 'socria' : 'person',
        ...(s.suggested === true ? { suggested: true } : {}),
        ...(note ? { note } : {}),
        at: typeof s.at === 'number' && Number.isFinite(s.at) ? s.at : 0,
      });
    }
    const name = typeof o.name === 'string' && /^[A-Za-z][A-Za-z0-9_']{0,7}$/.test(o.name) ? o.name : id;
    const at = typeof o.at === 'number' ? Math.min(Math.max(0, Math.round(o.at)), kept.length - 1) : kept.length - 1;
    const trimmed = typeof o.trimmed === 'number' && Number.isInteger(o.trimmed) && o.trimmed > 0 && o.trimmed < 1e6 ? o.trimmed : 0;
    ids.add(id);
    out.push({
      id,
      kind: k.kind,
      name,
      origin: ORIGINS.includes(o.origin as ObjectOrigin) ? (o.origin as ObjectOrigin) : 'socria',
      states: kept,
      steps,
      at,
      ...(trimmed ? { trimmed } : {}),
    });
  }
  return out.length ? { objs: out } : undefined;
}

/**
 * The extraction answers with the space it was sent, plus anything new it
 * found. By the time it lands the person may have applied operations, so the
 * LIVE objects win and only objects the live space does not have are added.
 */
export function mergeSpaces(live: ObjectSpace | undefined, incoming: ObjectSpace | undefined): ObjectSpace | undefined {
  if (!incoming?.objs.length) return live;
  if (!live?.objs.length) return incoming;
  const added = incoming.objs.filter(
    (o) => !live.objs.some((l) => l.id === o.id || (l.kind === o.kind && kindOf(o.kind)!.same(l.states[0], o.states[0])))
  );
  return added.length ? { objs: [...live.objs, ...added].slice(0, MAX_OBJECTS) } : live;
}

// ── who did what, in words ───────────────────────────────────────────

export function originSaid(o: ThoughtObject): string {
  return o.origin === 'person' ? 'from your own words' : o.origin === 'source' ? 'from material you attached' : 'read from the conversation by Socria — check it';
}

export function stepWho(s: Step): string {
  if (s.by === 'socria') return 'applied by Socria';
  return s.suggested ? 'Socria suggested it; you applied it' : 'chosen by you';
}
