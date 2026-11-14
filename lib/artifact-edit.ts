// lib/artifact-edit.ts — CHANGING AN ARTIFACT, NOT REMAKING IT.
//
// "Add elasticity", "make the x axis run from −5 to 5", "add a branch for costs under Operations": an artifact that
// exists is changed where it was asked to change, and nothing else about it moves. Three things make that hold:
//
//   EDITS     a short list of operations on the artifact's specification — add, replace, remove — at paths inside it
//             ("/curves/-", "/x", "/nodes/3/label"). Never a new artifact written from scratch: the parts no edit
//             touches are the same objects they were.
//   CHECKED   the result goes through the same validator the conversation's elements go through
//             (lib/inline-ui.ts sanitizeInlineSpec): a change that would leave a curve that cannot be drawn, a hole off
//             its curve, a node pointing nowhere, is refused whole and the artifact stays as it was. So is a change
//             the validator would quietly drop — a curve added that cannot be drawn is a refusal, not a no-op.
//   SAID      what changed, in words ("added the curve “supply”; x now runs from −5 to 5"), from comparing before
//             and after — the version history's line, and what the conversation is told.
//
// Who proposes an edit does not matter here: the person's own words (readEdit), the editor's controls, or Socria's
// reply (an edit block, app/api/logos/chat/route.ts). Each is applied the same way, as a step of the artifact's
// history (lib/objects/display-kept.ts), so it can be undone and its earlier version restored.
//
// Pure. No model, no network, no clock.

import { sanitizeInlineSpec, type InlineSpec } from './inline-ui';

export type EditOp = { op: 'add' | 'replace' | 'remove'; path: string; value?: unknown };
export const EDIT_LIMITS = { ops: 24, depth: 6, path: 96, value: 6000 } as const;

const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
type Token = string | number | '-';

/** A path inside a specification: "/curves/-", "/nodes/2/label". Plain keys and indices only. */
export function parsePath(path: unknown): Token[] | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > EDIT_LIMITS.path) return null;
  const parts = path.slice(1).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (!parts.length || parts.length > EDIT_LIMITS.depth) return null;
  const out: Token[] = [];
  for (const p of parts) {
    if (p === '-') out.push('-');
    else if (/^(?:0|[1-9]\d{0,3})$/.test(p)) out.push(Number(p));
    else if (KEY.test(p) && !FORBIDDEN.has(p)) out.push(p);
    else return null;
  }
  // the kind of thing an artifact is never changes by an edit
  if (out[0] === 'type') return null;
  return out;
}

/** Edits as a model or a page sent them: well-formed, few, small — or nothing. */
export function sanitizeEdits(raw: unknown): EditOp[] | null {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || !list.length || list.length > EDIT_LIMITS.ops) return null;
  const out: EditOp[] = [];
  for (const e of list) {
    const o = e && typeof e === 'object' ? (e as Record<string, unknown>) : null;
    const op = o?.op === 'add' || o?.op === 'replace' || o?.op === 'remove' ? o.op : null;
    if (!op || !parsePath(o!.path)) return null;
    if (op !== 'remove') {
      if (!('value' in o!) || o!.value === undefined) return null;
      try {
        if (JSON.stringify(o!.value).length > EDIT_LIMITS.value) return null;
      } catch {
        return null;
      }
    }
    out.push(op === 'remove' ? { op, path: String(o!.path) } : { op, path: String(o!.path), value: o!.value });
  }
  return out;
}

type Json = Record<string, unknown> | unknown[];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** One edit on a plain copy; a reason when it cannot be applied. */
function applyOne(doc: Json, e: EditOp): string | null {
  const path = parsePath(e.path)!;
  let at: unknown = doc;
  for (let i = 0; i < path.length - 1; i++) {
    const t = path[i];
    if (t === '-') return `“${e.path}” goes past the end of a list.`;
    const next = Array.isArray(at) ? (typeof t === 'number' ? at[t] : undefined) : isObj(at) ? at[t as string] : undefined;
    if (next === undefined || next === null || typeof next !== 'object') return `There is nothing at “${e.path}” to change.`;
    at = next;
  }
  const last = path[path.length - 1];
  const value = e.op === 'remove' ? undefined : clone(e.value);
  if (Array.isArray(at)) {
    if (last === '-') {
      if (e.op !== 'add') return `“${e.path}” is only for adding to the end of a list.`;
      at.push(value);
      return null;
    }
    if (typeof last !== 'number') return `“${e.path}” names a field of a list.`;
    if (e.op === 'add') {
      if (last > at.length) return `“${e.path}” is past the end of the list.`;
      at.splice(last, 0, value);
      return null;
    }
    if (last >= at.length) return `There is nothing at “${e.path}” to ${e.op}.`;
    if (e.op === 'remove') at.splice(last, 1);
    else at[last] = value;
    return null;
  }
  if (!isObj(at) || typeof last !== 'string' || last === '-') return `“${e.path}” does not name a field.`;
  if (e.op === 'replace' && !(last in at)) return `There is nothing at “${e.path}” to replace.`;
  if (e.op === 'remove') {
    if (!(last in at)) return `There is nothing at “${e.path}” to remove.`;
    delete at[last];
    return null;
  }
  at[last] = value;
  return null;
}

/** The value at a path of a plain object, or undefined. */
function valueAt(doc: unknown, path: Token[]): unknown {
  let at = doc;
  for (const t of path) {
    if (Array.isArray(at) && typeof t === 'number') at = at[t];
    else if (isObj(at) && typeof t === 'string') at = at[t];
    else return undefined;
  }
  return at;
}

export type EditResult = { ok: true; spec: InlineSpec; changes: string[] } | { ok: false; why: string };

/**
 * Apply edits to an artifact's specification, all or none. The result is validated whole; anything the validator
 * would refuse, or quietly leave out, refuses the edit — the artifact is never left half-changed or silently unchanged.
 */
export function applyEdits(spec: InlineSpec, edits: readonly EditOp[]): EditResult {
  const ops = sanitizeEdits(edits as unknown);
  if (!ops) return { ok: false, why: 'Those changes were not well formed: nothing was changed.' };
  const before = sanitizeInlineSpec(spec) ?? spec;
  const doc = clone(before) as unknown as Record<string, unknown>;
  for (const e of ops) {
    const why = applyOne(doc, e);
    if (why) return { ok: false, why: `${why} Nothing was changed.` };
  }
  const after = sanitizeInlineSpec(doc);
  if (!after || after.type !== before.type) return { ok: false, why: `That would not leave a valid ${nounOf(before)} — nothing was changed.` };
  // what was added must still be there once validated: a curve that cannot be drawn, a node the validator dropped
  const adds = new Map<string, number>();
  for (const e of ops) {
    if (e.op !== 'add') continue;
    const path = parsePath(e.path)!;
    const parent = path.slice(0, -1);
    if (Array.isArray(valueAt(before, parent)) || path[path.length - 1] === '-') adds.set(JSON.stringify(parent), (adds.get(JSON.stringify(parent)) ?? 0) + 1);
  }
  const removes = new Map<string, number>();
  for (const e of ops) {
    if (e.op !== 'remove') continue;
    const path = parsePath(e.path)!;
    if (typeof path[path.length - 1] === 'number') removes.set(JSON.stringify(path.slice(0, -1)), (removes.get(JSON.stringify(path.slice(0, -1))) ?? 0) + 1);
  }
  for (const [p, n] of adds) {
    const path = JSON.parse(p) as Token[];
    const had = (valueAt(before, path) as unknown[] | undefined)?.length ?? 0;
    const has = (valueAt(after, path) as unknown[] | undefined)?.length ?? 0;
    if (has < had + n - (removes.get(p) ?? 0)) return { ok: false, why: `What was added could not be drawn or did not hold up — nothing was changed.` };
  }
  const changes = specChanges(before, after);
  if (!changes.length) return { ok: false, why: 'That changes nothing.' };
  return { ok: true, spec: after, changes };
}

/**
 * What a person wrote that the validator would quietly leave out: the path of the first collection it shortened (a
 * curve that cannot be drawn, a link to a part that is not there) or the first object it dropped (shading half
 * filled in), else null. The editor's controls ask this before showing a version, so a half-typed formula reads as
 * "not yet", never as the curve gone.
 */
export function droppedBy(raw: unknown, held: unknown, path = ''): string | null {
  if (Array.isArray(raw)) {
    const h = Array.isArray(held) ? held : [];
    if (h.length < raw.length) return path || '/';
    for (let i = 0; i < raw.length; i++) {
      if (!isObj(raw[i])) continue;
      const d = droppedBy(raw[i], h[i], `${path}/${i}`);
      if (d) return d;
    }
    return null;
  }
  if (isObj(raw)) {
    const h = isObj(held) ? held : {};
    for (const [k, v] of Object.entries(raw)) {
      if (isObj(v) && h[k] === undefined) return `${path}/${k}`;
      if (Array.isArray(v) || isObj(v)) {
        const d = droppedBy(v, h[k], `${path}/${k}`);
        if (d) return d;
      }
    }
  }
  return null;
}
const PART_NOUN: Record<string, string> = { curves: 'A curve', params: 'A slider', points: 'A point', area: 'The shading', rects: 'The rectangles', vectors: 'A force', nodes: 'A part', edges: 'A link', items: 'An item', steps: 'A step', terms: 'A term', for: 'A point for', against: 'A point against', cells: 'A cell', pointers: 'A pointer' };
/** The part a dropped path names, in words ("A curve"), for the line that says it does not hold yet. */
export function droppedNoun(path: string): string {
  const keys = path.split('/').filter((k) => k && !/^\d+$/.test(k));
  for (let i = keys.length - 1; i >= 0; i--) if (PART_NOUN[keys[i]]) return PART_NOUN[keys[i]];
  return 'Something';
}

/**
 * The edits that turn one version of an artifact into another — what the editor saves, so a step carries what changed
 * rather than the whole artifact again (a large map would pass the size a step may keep). Per field, and per item of a
 * list that kept its length; a list that grew or shrank is replaced whole. Null when the edits would not reproduce the
 * new version exactly, or there would be too many: the caller then saves the whole version.
 */
export function editsBetween(a: InlineSpec, b: InlineSpec): EditOp[] | null {
  if (a.type !== b.type) return null;
  const A = a as unknown as Record<string, unknown>, B = b as unknown as Record<string, unknown>;
  const ops: EditOp[] = [];
  const keyOk = (k: string) => /^[A-Za-z_][\w]{0,40}$/.test(k);
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (k === 'type' || same(A[k], B[k])) continue;
    if (!keyOk(k)) return null;
    if (!(k in B) || B[k] === undefined) ops.push({ op: 'remove', path: `/${k}` });
    else if (!(k in A) || A[k] === undefined) ops.push({ op: 'add', path: `/${k}`, value: B[k] });
    else if (Array.isArray(A[k]) && Array.isArray(B[k]) && (A[k] as unknown[]).length === (B[k] as unknown[]).length) {
      const xa = A[k] as unknown[], xb = B[k] as unknown[];
      xa.forEach((va, i) => {
        const vb = xb[i];
        if (same(va, vb)) return;
        if (isObj(va) && isObj(vb) && Object.keys({ ...va, ...vb }).every(keyOk)) {
          for (const f of new Set([...Object.keys(va), ...Object.keys(vb)])) {
            if (same(va[f], vb[f])) continue;
            if (vb[f] === undefined) ops.push({ op: 'remove', path: `/${k}/${i}/${f}` });
            else ops.push({ op: f in va && va[f] !== undefined ? 'replace' : 'add', path: `/${k}/${i}/${f}`, value: vb[f] });
          }
        } else ops.push({ op: 'replace', path: `/${k}/${i}`, value: vb });
      });
    } else ops.push({ op: 'replace', path: `/${k}`, value: B[k] });
  }
  if (!ops.length || ops.length > EDIT_LIMITS.ops) return null;
  const r = applyEdits(a, ops);
  return r.ok && same(r.spec, sanitizeInlineSpec(b)) ? ops : null;
}

const NOUN: Partial<Record<InlineSpec['type'], string>> = {
  graph: 'graph', sim: 'simulation', vectors: 'force diagram', trace: 'step-through', diagram: 'diagram', sequence: 'sequence', concepts: 'overview',
  compare: 'comparison', chart: 'chart', slider: 'calculator', steps: 'working', equation: 'equation', balance: 'pros and cons', claim: 'claim', check: 'question', decide: 'decision',
};
export const nounOf = (s: InlineSpec): string => NOUN[s.type] ?? 'artifact';

// ── what changed, in words ────────────────────────────────────────────

const q = (v: unknown) => `“${String(v).slice(0, 60)}”`;
const num = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)).replace('-', '−');
const range = (r: unknown) => (Array.isArray(r) && r.length === 2 ? `${num(Number(r[0]))} to ${num(Number(r[1]))}` : '');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Items of two lists matched by a key: added, removed, and changed (present in both, different). */
function listDiff<T>(a: readonly T[] | undefined, b: readonly T[] | undefined, key: (x: T) => string) {
  const A = new Map((a ?? []).map((x) => [key(x), x]));
  const B = new Map((b ?? []).map((x) => [key(x), x]));
  return {
    added: [...B.keys()].filter((k) => !A.has(k)).map((k) => B.get(k)!),
    removed: [...A.keys()].filter((k) => !B.has(k)).map((k) => A.get(k)!),
    changed: [...B.keys()].filter((k) => A.has(k) && !same(A.get(k), B.get(k))).map((k) => [A.get(k)!, B.get(k)!] as const),
  };
}

/** What differs between two versions of one artifact, a phrase each — the parts that did not change are not mentioned. */
export function specChanges(a: InlineSpec, b: InlineSpec): string[] {
  const out: string[] = [];
  const A = a as unknown as Record<string, unknown>, B = b as unknown as Record<string, unknown>;
  if ((A.title ?? '') !== (B.title ?? '')) out.push(B.title ? `renamed it ${q(B.title)}` : 'took its title off');
  if (a.type === 'graph' && b.type === 'graph') {
    if (a.expr !== b.expr) out.push(`the equation is now y = ${b.expr}`);
    if ((a.label ?? '') !== (b.label ?? '')) out.push(b.label ? `the first curve is called ${q(b.label)}` : 'the first curve lost its name');
    const c = listDiff(a.curves, b.curves, (x) => x.label ?? x.expr);
    for (const x of c.added) out.push(`added the curve ${x.label ? q(x.label) : `y = ${x.expr}`}`);
    for (const x of c.removed) out.push(`removed the curve ${x.label ? q(x.label) : `y = ${x.expr}`}`);
    for (const [, x] of c.changed) out.push(`${x.label ? q(x.label) : 'a curve'} is now y = ${x.expr}`);
    if (!same(a.x, b.x)) out.push(`x now runs from ${range(b.x)}`);
    if (!same(a.y, b.y)) out.push(b.y ? `y now runs from ${range(b.y)}` : 'y fits the curves again');
    const p = listDiff(a.params, b.params, (x) => x.name);
    for (const x of p.added) out.push(`added a slider for ${x.label || x.name} (${num(x.min)} to ${num(x.max)})`);
    for (const x of p.removed) out.push(`removed the slider for ${x.label || x.name}`);
    for (const [was, x] of p.changed) out.push(was.min !== x.min || was.max !== x.max ? `${x.label || x.name} now slides from ${num(x.min)} to ${num(x.max)}` : was.value !== x.value ? `${x.label || x.name} starts at ${num(x.value)}` : `changed the slider for ${x.label || x.name}`);
    const pt = listDiff(a.points, b.points, (x) => `${x.x},${x.y ?? ''},${x.open ? 'o' : 'f'}`);
    for (const x of pt.added) out.push(`added ${x.open ? 'an open circle' : 'a point'} at x = ${x.x}${x.y !== undefined ? `, y = ${x.y}` : ''}`);
    for (const x of pt.removed) out.push(`removed the ${x.open ? 'open circle' : 'point'} at x = ${x.x}`);
    if (!same(a.area, b.area)) out.push(!b.area ? 'removed the shading' : !a.area ? `shaded from x = ${b.area.from} to x = ${b.area.to}${b.area.rects ? ` with ${b.area.rects.n} rectangles` : ''}` : b.area.rects && !same(a.area.rects, b.area.rects) ? `rectangles: ${b.area.rects.n}, ${b.area.rects.rule} endpoints` : `the shading now runs from x = ${b.area.from} to x = ${b.area.to}`);
    if (!same(a.features, b.features)) {
      const add = b.features.filter((f) => !a.features.includes(f)), rem = a.features.filter((f) => !b.features.includes(f));
      if (add.length) out.push(`now marks ${add.join(', ')}`);
      if (rem.length) out.push(`no longer marks ${rem.join(', ')}`);
    }
    if ((a.tangent ?? '') !== (b.tangent ?? '')) out.push(b.tangent ? 'draws the tangent at a point you drag' : 'removed the tangent');
    if (!same(a.chord, b.chord)) out.push(b.chord ? 'draws the chord between two points you drag' : 'removed the chord');
    const r = listDiff(a.readouts, b.readouts, (x) => x.label);
    for (const x of r.added) out.push(`reads out ${q(x.label)}`);
    for (const x of r.removed) out.push(`no longer reads out ${q(x.label)}`);
  } else if (a.type === 'diagram' && b.type === 'diagram') {
    if (a.view !== b.view) out.push(`shown as ${b.view === 'mind' ? 'a mind map' : b.view === 'tree' ? 'a hierarchy' : b.view === 'flow' ? 'a flow' : b.view === 'cycle' ? 'a cycle' : 'causes'}`);
    const n = listDiff(a.nodes, b.nodes, (x) => x.id);
    const label = (id: string) => b.nodes.find((x) => x.id === id)?.label ?? a.nodes.find((x) => x.id === id)?.label ?? id;
    // a part added to a mind map or a hierarchy is said with where it hangs
    const under = (id: string) => (b.view === 'mind' || b.view === 'tree' ? b.edges.find((e) => e[1] === id && (e.length === 2 || e[2] === 'part')) : undefined);
    for (const x of n.added) {
      const up = under(x.id);
      out.push(up ? `added ${q(x.label)} under ${q(label(up[0]))}` : `added ${q(x.label)}`);
    }
    for (const x of n.removed) out.push(`removed ${q(x.label)}`);
    for (const [was, x] of n.changed) out.push(was.label !== x.label ? `renamed ${q(was.label)} to ${q(x.label)}` : `changed what ${q(x.label)} says`);
    const e = listDiff(a.edges, b.edges, (x) => `${x[0]}>${x[1]}`);
    const newNodes = new Set(n.added.map((x) => x.id)), goneNodes = new Set(n.removed.map((x) => x.id));
    for (const x of e.added) if (!newNodes.has(x[1]) && !newNodes.has(x[0])) out.push(`connected ${q(label(x[0]))} to ${q(label(x[1]))}`);
    for (const x of e.removed) if (!goneNodes.has(x[0]) && !goneNodes.has(x[1])) out.push(`disconnected ${q(label(x[0]))} from ${q(label(x[1]))}`);
    for (const [, x] of e.changed) out.push(`${q(label(x[0]))} → ${q(label(x[1]))} is now ${x[2] ?? 'a plain link'}`);
  } else if (a.type === 'vectors' && b.type === 'vectors') {
    const v = listDiff(a.vectors, b.vectors, (x) => x.label);
    for (const x of v.added) out.push(`added the force ${q(x.label)}`);
    for (const x of v.removed) out.push(`removed the force ${q(x.label)}`);
    for (const [, x] of v.changed) out.push(`${q(x.label)} is now ${x.mag} at ${x.angle}°`);
    const p = listDiff(a.params, b.params, (x) => x.name);
    for (const x of p.added) out.push(`added a slider for ${x.label || x.name}`);
    for (const x of p.removed) out.push(`removed the slider for ${x.label || x.name}`);
    if (a.resultant !== b.resultant) out.push(b.resultant ? 'draws their sum' : 'no longer draws their sum');
  } else if (a.type === 'trace' && b.type === 'trace') {
    if (a.steps.length !== b.steps.length) out.push(`now ${b.steps.length} steps`);
    const changed = b.steps.filter((s, i) => a.steps[i] && !same(s, a.steps[i])).length;
    if (changed) out.push(`changed ${changed} step${changed === 1 ? '' : 's'}`);
  } else if ((a.type === 'sequence' && b.type === 'sequence') || (a.type === 'concepts' && b.type === 'concepts')) {
    const key = (x: { label?: string; name?: string }) => (x.label ?? x.name ?? '') as string;
    const d = listDiff(a.items as { label?: string; name?: string }[], b.items as { label?: string; name?: string }[], key);
    for (const x of d.added) out.push(`added ${q(key(x))}`);
    for (const x of d.removed) out.push(`removed ${q(key(x))}`);
    if (d.changed.length) out.push(`changed ${d.changed.length === 1 ? q(key(d.changed[0][1])) : `${d.changed.length} items`}`);
    if (!d.added.length && !d.removed.length && !d.changed.length && !same(a.items, b.items)) out.push('put them in a new order');
  }
  // anything else that differs, by field — never silent
  if (!out.length || out.every((s) => s.startsWith('renamed it'))) {
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (k === 'type' || k === 'title' || same(A[k], B[k])) continue;
      out.push(`changed ${k}`);
    }
  }
  return out;
}

/** The changes, as one line: what the version history says, and what the conversation is told. */
export function changeSaid(changes: readonly string[]): string {
  if (!changes.length) return 'changed nothing';
  const shown = changes.slice(0, 4).join('; ');
  return changes.length > 4 ? `${shown}; and ${changes.length - 4} more` : shown;
}

// ── a change, in the person's own words ───────────────────────────────

const unq = (s: string) => s.trim().replace(/^["“'‘]+|["”'’.!]+$/g, '').trim();
const N = String.raw`(-?\d+(?:\.\d+)?)`;
const norm = (s: string) => s.replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim();
const findIndex = <T>(list: readonly T[] | undefined, label: string, key: (x: T) => string | undefined) => {
  const t = label.toLowerCase();
  const i = (list ?? []).findIndex((x) => (key(x) ?? '').toLowerCase() === t);
  return i >= 0 ? i : (list ?? []).findIndex((x) => (key(x) ?? '').toLowerCase().includes(t) && t.length >= 3);
};
const nextNodeId = (ids: readonly string[]) => {
  for (let i = ids.length + 1; i < 400; i++) if (!ids.includes(`n${i}`)) return `n${i}`;
  return `n${ids.length + 400}`;
};

/**
 * EDITS READ OUT OF WORDS, when the words plainly are one: "rename it to Market for tea", "add the curve y = 2 + x
 * called supply", "x from -5 to 5", "add a slider for k from 0 to 10", "add an open point at (1, 2)", "shade from 0 to
 * 2", "use 10 rectangles", "add Costs under Operations", "remove Marketing", "connect Price to Demand", "show it as a
 * mind map", "add a force drag of 5 N at 180 degrees". Anything less plain is not read here — the conversation and
 * Socria's reply take it (an edit block), and nothing is guessed.
 */
export function readEdit(text: string, spec: InlineSpec): EditOp[] | null {
  const t = norm(text).replace(/^(?:ok(?:ay)?|now|please|can you|could you|and)[,\s]+/i, '').replace(/[?.!]+$/, '').replace(/\s+please$/i, '');
  let m: RegExpMatchArray | null;
  // renaming the artifact itself
  if ((m = t.match(/^(?:rename|retitle)\s+(?:it|this|the\s+(?:graph|map|diagram|chart|artifact))\s+(?:to|as)\s+(.{1,80})$/i)) || (m = t.match(/^(?:call|title|name)\s+(?:it|this)\s+(.{1,80})$/i))) {
    return [{ op: 'add', path: '/title', value: unq(m[1]) }];
  }
  if (spec.type === 'graph') {
    if ((m = t.match(new RegExp(String.raw`^add\s+(?:a\s+|another\s+|the\s+)?(?:curve|line|function|graph)?\s*(?:of\s+)?y\s*=\s*(.+?)(?:\s*,?\s*(?:called|labell?ed|named|as)\s+(.{1,40}))?$`, 'i')))) {
      const value = { expr: m[1].trim(), ...(m[2] ? { label: unq(m[2]) } : {}) };
      return spec.curves?.length ? [{ op: 'add', path: '/curves/-', value }] : [{ op: 'add', path: '/curves', value: [value] }];
    }
    if ((m = t.match(/^(?:remove|delete|drop|take off)\s+(?:the\s+)?(?:curve|line)\s+(.{1,40})$/i))) {
      const i = findIndex(spec.curves, unq(m[1]), (c) => c.label ?? c.expr);
      return i >= 0 ? [{ op: 'remove', path: `/curves/${i}` }] : null;
    }
    if ((m = t.match(/^(?:change|set|make)\s+(?:the\s+)?(?:equation|function|first curve|curve)\s+(?:to\s+)?y\s*=\s*(.+)$/i))) return [{ op: 'replace', path: '/expr', value: m[1].trim() }];
    if ((m = t.match(new RegExp(String.raw`^(?:set\s+|make\s+|change\s+)?(?:the\s+)?(x|y)(?:[- ]axis|\s+range|\s+window)?\s+(?:to\s+)?(?:run\s+)?(?:from|between)?\s*${N}\s*(?:to|and|-)\s*${N}$`, 'i')))) {
      const lo = Number(m[2]), hi = Number(m[3]);
      if (!(lo < hi)) return null;
      return [{ op: m[1].toLowerCase() === 'y' && !spec.y ? 'add' : 'replace', path: `/${m[1].toLowerCase()}`, value: [lo, hi] }];
    }
    if ((m = t.match(new RegExp(String.raw`^add\s+(?:a\s+)?(?:slider|parameter|variable)\s+(?:for\s+)?([a-z])\b(?:\s+from\s+${N}\s+to\s+${N})?`, 'i')))) {
      const name = m[1].toLowerCase();
      if (name === 'x' || name === 'y' || spec.params.some((p) => p.name === name)) return null;
      const lo = m[2] !== undefined ? Number(m[2]) : 0, hi = m[3] !== undefined ? Number(m[3]) : 10;
      if (!(lo < hi)) return null;
      return [{ op: 'add', path: '/params/-', value: { name, label: name, min: lo, max: hi, value: lo, step: (hi - lo) / 100 } }];
    }
    if ((m = t.match(new RegExp(String.raw`^add\s+(?:an?\s+)?(open|hollow|filled|closed|solid)?\s*(?:point|dot|circle)\s+at\s+\(?\s*${N}\s*,\s*${N}\s*\)?$`, 'i')))) {
      const value = { x: Number(m[2]), y: Number(m[3]), ...(/open|hollow/i.test(m[1] ?? '') ? { open: true } : {}) };
      return spec.points?.length ? [{ op: 'add', path: '/points/-', value }] : [{ op: 'add', path: '/points', value: [value] }];
    }
    if ((m = t.match(new RegExp(String.raw`^shade\s+(?:the\s+)?(?:area\s+)?(?:under\s+(?:the\s+)?curve\s+)?(?:from\s+)?(?:x\s*=\s*)?${N}\s+to\s+(?:x\s*=\s*)?${N}$`, 'i')))) {
      return [{ op: spec.area ? 'replace' : 'add', path: '/area', value: { ...(spec.area ?? {}), from: Number(m[1]), to: Number(m[2]) } }];
    }
    if ((m = t.match(/^(?:use|show|draw|with)\s+(\d{1,3})\s+rectangles$/i)) && spec.area) {
      return [{ op: spec.area.rects ? 'replace' : 'add', path: '/area/rects', value: { n: Number(m[1]), rule: spec.area.rects?.rule ?? 'left' } }];
    }
    if ((m = t.match(/^(?:mark|show)\s+(?:the\s+|where\s+)?(crossings|turning points|roots|intercept)$/i))) {
      const f = ({ crossings: 'crossings', 'turning points': 'turning', roots: 'roots', intercept: 'intercept' } as const)[m[1].toLowerCase() as 'crossings'];
      return spec.features.includes(f) ? null : [{ op: 'add', path: '/features/-', value: f }];
    }
    return null;
  }
  if (spec.type === 'diagram') {
    if ((m = t.match(/^(?:show|make|turn|display|redraw)\s+(?:it|this)\s+(?:as|into)\s+(?:a\s+)?(mind ?map|tree|hierarchy|flow ?chart|flow|cycle|causes)$/i))) {
      const v = /mind/i.test(m[1]) ? 'mind' : /tree|hier/i.test(m[1]) ? 'tree' : /flow/i.test(m[1]) ? 'flow' : /cycle/i.test(m[1]) ? 'cycle' : 'causes';
      return v === spec.view ? null : [{ op: 'replace', path: '/view', value: v }];
    }
    if ((m = t.match(/^add\s+(?:a\s+)?(?:node|branch|idea|concept|step|box)?\s*(.{1,60}?)\s+(?:under|below|beneath|to|off|from|branching from)\s+(.{1,60})$/i))) {
      const parent = findIndex(spec.nodes, unq(m[2]), (x) => x.label);
      if (parent < 0) return null;
      const id = nextNodeId(spec.nodes.map((x) => x.id));
      return [
        { op: 'add', path: '/nodes/-', value: { id, label: unq(m[1]) } },
        { op: 'add', path: '/edges/-', value: [spec.nodes[parent].id, id] },
      ];
    }
    if ((m = t.match(/^rename\s+(.{1,60}?)\s+(?:to|as)\s+(.{1,60})$/i))) {
      const i = findIndex(spec.nodes, unq(m[1]), (x) => x.label);
      return i >= 0 ? [{ op: 'replace', path: `/nodes/${i}/label`, value: unq(m[2]) }] : null;
    }
    // a link: in a mind map always across the branches, with its kind ("relates" when the words name none) — a part
    // has one parent, so a second connection to it is a link, never a second branch
    const linked = t.match(/^connect\s+(.{1,60}?)\s+(?:to|with|and)\s+(.{1,60})$/i) ?? t.match(/^(?:link|show that\s+)?(.{1,60}?)\s+(causes|leads to|needs|depends on|requires|relates to)\s+(.{1,60})$/i);
    if (linked) {
      const [x, y, word] = linked.length === 3 ? [linked[1], linked[2], ''] : [linked[1], linked[3], linked[2].toLowerCase()];
      const a = findIndex(spec.nodes, unq(x), (n) => n.label), b = findIndex(spec.nodes, unq(y), (n) => n.label);
      if (a < 0 || b < 0 || a === b) return null;
      if (spec.edges.some((e) => e[0] === spec.nodes[a].id && e[1] === spec.nodes[b].id)) return null;
      const rel = /cause/.test(word) ? 'causes' : /lead/.test(word) ? 'leads' : /need|depend|require/.test(word) ? 'needs' : 'relates';
      if (spec.view !== 'mind' && word) return null;
      return [{ op: 'add', path: '/edges/-', value: spec.view === 'mind' ? [spec.nodes[a].id, spec.nodes[b].id, rel] : [spec.nodes[a].id, spec.nodes[b].id] }];
    }
    if ((m = t.match(/^(?:remove|delete|drop)\s+(?:the\s+)?(?:node|branch|idea|step|box)?\s*(.{1,60})$/i))) {
      const i = findIndex(spec.nodes, unq(m[1]), (x) => x.label);
      if (i < 0) return null;
      const id = spec.nodes[i].id;
      // the connections it was part of go with it — last first, so each index still means what it meant
      const edges = spec.edges.map((e, k) => (e[0] === id || e[1] === id ? k : -1)).filter((k) => k >= 0).reverse();
      return [...edges.map((k) => ({ op: 'remove' as const, path: `/edges/${k}` })), { op: 'remove', path: `/nodes/${i}` }];
    }
    return null;
  }
  if (spec.type === 'vectors') {
    if ((m = t.match(new RegExp(String.raw`^add\s+(?:a\s+)?(?:force|vector)\s+(.{1,30}?)\s+(?:of\s+)?${N}\s*(?:n|newtons?)?\s+at\s+${N}\s*(?:°|degrees?)?$`, 'i')))) {
      return [{ op: 'add', path: '/vectors/-', value: { label: unq(m[1]), mag: Number(m[2]), angle: Number(m[3]) } }];
    }
    if ((m = t.match(/^(?:remove|delete|drop)\s+(?:the\s+)?(?:force|vector)\s+(.{1,30})$/i))) {
      const i = findIndex(spec.vectors, unq(m[1]), (x) => x.label);
      return i >= 0 && spec.vectors.length > 1 ? [{ op: 'remove', path: `/vectors/${i}` }] : null;
    }
    return null;
  }
  if (spec.type === 'sequence') {
    if ((m = t.match(/^add\s+(?:a\s+)?(?:step|stage|event)\s+(.{1,80})$/i))) return [{ op: 'add', path: '/items/-', value: { label: unq(m[1]) } }];
    return null;
  }
  return null;
}
