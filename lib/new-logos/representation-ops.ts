// lib/new-logos/representation-ops.ts — HOW A REPRESENTATION CHANGES.
//
// One operation system for the person and the assistant (as artifacts have, lib/new-logos/artifact-ops.ts, which the
// interactive model reuses): add, update, status (a possibility made more or less likely, or ruled out), answer (an
// open question answered), remove, merge (two items that say the same thing become one), relate and unrelate (with
// the relation's standing: established or not), model (artifact operations on the equations, variables, plots and
// tables), keep (an item kept as a node), and turn (a message taken in).
//
// Rules held here, not in prompts:
//   • the assistant never rewords or removes what the person made, and never removes a connection the person made;
//   • every operation is checked on its own: a malformed or refused one is skipped and said why, the rest apply
//     (the assistant's output is read leniently: lib/new-logos/represent-model.ts);
//   • the representation stays within its limits;
//   • earlier wordings and standings are kept on the item (`was`), so a revision can be read;
//   • every batch leaves a BEFORE-IMAGE of exactly what it touched, so it can be reversed precisely, and a summary in
//     words; reversing is itself a batch, so it can be reversed too.
//
// Pure: no I/O.

import { applyOps, type ArtifactOp } from './artifact-ops';
import { evalIn, evaluateScope, type Scope } from './compose';
import { keyFrom, newPrimitive, sanitizeVariable, type Composition, type PlotSeries, type TableColumn, type TableRow, type Variable } from './primitives';
import {
  KIND_WORD,
  NO_CHANGES,
  PRIM_TYPE,
  VIEWS,
  sanitizeView,
  REL_KINDS,
  REP_LIMITS,
  STATUS_WORD,
  TEXT_MAX,
  clip,
  compositionOf,
  freshId,
  isModelKind,
  isRepKind,
  itemById,
  relationId,
  representationBytes,
  sanitizeItem,
  sanitizeRelation,
  summaryOf,
  withComposition,
  type Changes,
  type HypothesisStatus,
  type ItemOf,
  type ModelKind,
  type Origin,
  type RelKind,
  type RelStatus,
  type RepItem,
  type RepKind,
  type RepRelation,
  type Representation,
} from './representation';

export type RepOp =
  | { op: 'add'; item: Record<string, unknown>; near?: string }
  | { op: 'update'; id: string; set: Record<string, unknown> }
  | { op: 'status'; id: string; status: HypothesisStatus; because?: string }
  | { op: 'answer'; id: string; answer: string }
  | { op: 'remove'; id: string }
  | { op: 'merge'; ids: string[]; into: string; text?: string }
  | { op: 'relate'; from: string; to: string; kind: RelKind; status?: RelStatus; label?: string }
  | { op: 'unrelate'; from: string; to: string; kind?: RelKind }
  | { op: 'model'; ops: ArtifactOp[] }
  | { op: 'keep'; id: string; node: string }
  | { op: 'view'; id: string; as: string; x?: string; y?: string }
  | { op: 'turn'; message: string };

export const REP_OP_LIMIT = 80;

/** Exactly what a batch touched, as it was before: enough to put it back. Tuples, never objects keyed by ids. */
export interface Patch {
  /** [id, the item before (null: it was not there), its place in the list before] */
  items: [string, RepItem | null, number][];
  relations: [string, RepRelation | null][];
  variables: Variable[] | null;
  turns: string[] | null;
}
export const EMPTY_PATCH: Patch = { items: [], relations: [], variables: null, turns: null };
export const patchIsEmpty = (p: Patch) => !p.items.length && !p.relations.length && p.variables === null && p.turns === null;

export interface RepApply {
  rep: Representation;
  changes: Changes;
  before: Patch;
  /** operations not applied, with why */
  skipped: { index: number; why: string }[];
  /** new items to be placed near another: [id, near] */
  near: [string, string][];
  /** ids the batch asked for and the ids given: [wanted, actual] (they differ when the wanted one was taken) */
  ids: [string, string][];
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown): number | null => (finite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── the difference between two states ────────────────────────────────

/** The before-image that takes `after` back to `before`, and what changed, by id. */
export function diff(before: Representation, after: Representation): { patch: Patch; changes: Changes } {
  const items: Patch['items'] = [];
  const bIdx = new Map(before.items.map((it, k) => [it.id, k]));
  const aMap = new Map(after.items.map((it) => [it.id, it]));
  const added: string[] = [];
  const revised: string[] = [];
  const removed: Changes['removed'] = [];
  for (const [id, k] of bIdx) {
    const b = before.items[k];
    const a = aMap.get(id);
    if (!a) {
      items.push([id, copy(b), k]);
      removed.push({ id, kind: b.kind, text: b.text });
    } else if (!same(a, b)) {
      items.push([id, copy(b), k]);
      revised.push(id);
    }
  }
  for (const it of after.items)
    if (!bIdx.has(it.id)) {
      items.push([it.id, null, -1]);
      added.push(it.id);
    }
  const relations: Patch['relations'] = [];
  const bRel = new Map(before.relations.map((r) => [r.id, r]));
  const aRel = new Map(after.relations.map((r) => [r.id, r]));
  let related = 0,
    unrelated = 0;
  for (const [id, r] of bRel) {
    const a = aRel.get(id);
    if (!a) {
      relations.push([id, copy(r)]);
      unrelated++;
    } else if (!same(a, r)) {
      relations.push([id, copy(r)]);
      related++;
    }
  }
  for (const [id] of aRel)
    if (!bRel.has(id)) {
      relations.push([id, null]);
      related++;
    }
  return {
    patch: { items, relations, variables: same(before.variables, after.variables) ? null : copy(before.variables), turns: same(before.turns, after.turns) ? null : [...before.turns] },
    changes: { added, revised, removed, related, unrelated },
  };
}

/** Put back what a patch holds: items and relations as they were (or gone, where they were not there). */
export function revertPatch(rep: Representation, patch: Patch): Representation {
  let items = [...rep.items];
  // take out what was not there, and replace what was
  for (const [id, prev] of patch.items) {
    const at = items.findIndex((i) => i.id === id);
    if (prev === null) {
      if (at >= 0) items.splice(at, 1);
    } else if (at >= 0) items[at] = copy(prev);
  }
  // put back what had gone, in its old order
  const missing = patch.items.filter(([id, prev]) => prev !== null && !items.some((i) => i.id === id)).sort((a, b) => a[2] - b[2]);
  for (const [, prev, k] of missing) items.splice(Math.max(0, Math.min(k, items.length)), 0, copy(prev as RepItem));
  items = items.slice(0, REP_LIMITS.items);
  const ids = new Set(items.map((i) => i.id));
  let relations = [...rep.relations];
  for (const [id, prev] of patch.relations) {
    const at = relations.findIndex((r) => r.id === id);
    if (prev === null) {
      if (at >= 0) relations.splice(at, 1);
    } else if (at >= 0) relations[at] = copy(prev);
    else relations.push(copy(prev));
  }
  relations = relations.filter((r) => ids.has(r.from) && ids.has(r.to)).slice(0, REP_LIMITS.relations);
  return { ...rep, items, relations, variables: patch.variables ? copy(patch.variables) : rep.variables, turns: patch.turns ? [...patch.turns] : rep.turns };
}

// ── building an item from what was asked for ────────────────────────

const EQ_LINE = /^\s*([A-Za-z_][A-Za-z0-9_]{0,30})\s*(?:\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*){0,3})\s*\))?\s*=\s*(.+)$/;

/** "profit = (price - cost) * units" or "f(x) = x^2" → name, parameters, expression; a bare expression has no name. */
export function readEquation(s: string): { name: string; params: string[]; expr: string } {
  const m = EQ_LINE.exec(s);
  if (m && !/[<>!]$/.test(m[1]) && !m[3].startsWith('=')) return { name: m[1], params: m[2] ? m[2].split(',').map((x) => x.trim()) : [], expr: m[3].trim() };
  return { name: '', params: [], expr: s.trim() };
}

/** The data of a model item, from the plain fields the assistant writes (or a full primitive, from this interface). */
function modelData(kind: ModelKind, o: Record<string, unknown>, comp: Composition): { data: Record<string, unknown>; variable?: Record<string, unknown> } | null {
  const prim = obj(o.prim);
  if (prim && obj(prim.data)) return { data: obj(prim.data) as Record<string, unknown> };
  switch (kind) {
    case 'equation': {
      let name = typeof o.name === 'string' ? o.name.trim() : '';
      let params = Array.isArray(o.params) ? o.params.filter((p): p is string => typeof p === 'string').slice(0, 4) : [];
      let expr = typeof o.expr === 'string' ? o.expr.trim() : typeof o.equation === 'string' ? o.equation.trim() : '';
      if (!name && expr.includes('=')) ({ name, params, expr } = readEquation(expr));
      if (!expr) return null;
      return { data: { name, params, expr: expr.slice(0, 500) } };
    }
    case 'variable': {
      const name = typeof o.name === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(o.name.trim()) ? o.name.trim() : '';
      if (!name) return null;
      const value = num(o.value) ?? 0;
      let min = num(o.min);
      let max = num(o.max);
      if (min === null || max === null || !(max > min)) {
        const span = Math.max(1, Math.abs(value)) * 2;
        min = min ?? (value >= 0 ? 0 : value - span);
        max = max !== null && max > min ? max : Math.max(min + 1, value + span);
      }
      const step = num(o.step);
      const boolean = o.kind === 'boolean' || o.kind === 'toggle';
      const exists = comp.variables.some((v) => v.name === name);
      return {
        data: { variable: name, kind: boolean ? 'toggle' : o.control === 'number' ? 'number' : 'slider', options: [] },
        ...(exists
          ? {}
          : {
              variable: {
                name,
                value: boolean ? (value ? 1 : 0) : value,
                min: boolean ? 0 : min,
                max: boolean ? 1 : max,
                ...(step && step > 0 ? { step } : {}),
                kind: boolean ? 'boolean' : 'number',
                ...(typeof o.label === 'string' || typeof o.text === 'string' ? { label: clip(o.label ?? o.text, 60) } : {}),
                ...(typeof o.unit === 'string' ? { unit: clip(o.unit, 16) } : {}),
              },
            }),
      };
    }
    case 'plot': {
      const raw: unknown[] = Array.isArray(o.series) ? o.series : typeof o.expr === 'string' ? [{ expr: o.expr }] : Array.isArray(o.exprs) ? o.exprs.map((e) => ({ expr: e })) : [];
      const series: PlotSeries[] = [];
      for (const s of raw) {
        const so = typeof s === 'string' ? { expr: s } : obj(s);
        if (!so || typeof so.expr !== 'string' || !so.expr.trim()) continue;
        const e = readEquation(so.expr);
        series.push({ id: `s${series.length + 1}`, kind: 'fn', expr: (e.name === 'y' || /^f$/.test(e.name) ? e.expr : so.expr).trim().slice(0, 300), label: clip(so.label, 40), style: series.length === 0 ? 'solid' : series.length === 1 ? 'dashed' : 'dotted' });
        if (series.length >= 4) break;
      }
      if (!series.length) return null;
      const x = obj(o.x) ?? {};
      const xmin = num(x.min ?? o.xMin), xmax = num(x.max ?? o.xMax);
      const y = obj(o.y) ?? {};
      const ymin = num(y.min ?? o.yMin), ymax = num(y.max ?? o.yMax);
      const yAuto = !(ymin !== null && ymax !== null && ymax > ymin);
      return {
        data: {
          x: { min: xmin !== null && xmax !== null && xmax > xmin ? xmin : -10, max: xmin !== null && xmax !== null && xmax > xmin ? xmax : 10, label: clip(x.label ?? o.xLabel, 30) },
          y: { min: yAuto ? -10 : ymin, max: yAuto ? 10 : ymax, label: clip(y.label ?? o.yLabel, 30), auto: yAuto },
          grid: true,
          series,
        },
      };
    }
    case 'diagram': {
      // boxes in a row, joined as said: the person rearranges them in place
      const shapesIn: unknown[] = Array.isArray(o.shapes) ? o.shapes : Array.isArray(o.boxes) ? o.boxes : Array.isArray(o.nodes) ? o.nodes : [];
      const ids = new Map<string, string>();
      const shapes = shapesIn.slice(0, 12).flatMap((s, k) => {
        const so = typeof s === 'string' ? { label: s } : obj(s);
        const label = so ? clip(so.label ?? so.text ?? so.name, 60) : '';
        if (!label) return [];
        const id = `h${k + 1}`;
        if (so && typeof so.id === 'string') ids.set(so.id, id);
        ids.set(label, id);
        return [{ id, kind: 'box', x: 24 + (k % 4) * 170, y: 30 + Math.floor(k / 4) * 110, w: 140, h: 52, label }];
      });
      if (!shapes.length) return null;
      const connIn: unknown[] = Array.isArray(o.connectors) ? o.connectors : Array.isArray(o.edges) ? o.edges : Array.isArray(o.arrows) ? o.arrows : [];
      const connectors = connIn.slice(0, 24).flatMap((c, k) => {
        const co = obj(c);
        const from = co ? ids.get(String(co.from)) : undefined;
        const to = co ? ids.get(String(co.to)) : undefined;
        return from && to && from !== to ? [{ id: `k${k + 1}`, from, to, label: clip(co?.label, 40), end: 'arrow', style: 'solid' }] : [];
      });
      return { data: { shapes, connectors } };
    }
    case 'media':
      // images come from the person (their uploads); the assistant cannot make one
      return null;
    case 'matrix': {
      const colsRaw: unknown[] = Array.isArray(o.columns) ? o.columns : [];
      const rowsRaw: unknown[] = Array.isArray(o.rows) ? o.rows : [];
      if (!colsRaw.length || !rowsRaw.length) return null;
      const taken = new Set<string>();
      const columns: TableColumn[] = [];
      for (const c of colsRaw.slice(0, 8)) {
        const co = typeof c === 'string' ? { name: c } : obj(c);
        const name = co ? clip(co.name, 40) : '';
        if (!name) continue;
        const key = keyFrom(name, taken);
        taken.add(key);
        const formula = co && typeof co.formula === 'string' ? co.formula.trim().slice(0, 300) : '';
        columns.push({ id: `c${columns.length + 1}`, name, key, kind: formula ? 'formula' : 'text', ...(formula ? { expr: formula } : {}) });
      }
      if (!columns.length) return null;
      const rows: TableRow[] = [];
      for (const r of rowsRaw.slice(0, 40)) {
        const cellsIn: unknown[] = Array.isArray(r) ? r : obj(r) && Array.isArray((r as Record<string, unknown>).cells) ? ((r as Record<string, unknown>).cells as unknown[]) : [];
        const cells: Record<string, string> = Object.create(null);
        columns.forEach((c, k) => {
          if (c.kind === 'formula') return;
          const v = cellsIn[k];
          if (v !== undefined && v !== null) cells[c.id] = clip(String(v), 200);
        });
        rows.push({ id: `r${rows.length + 1}`, cells: { ...cells } });
      }
      // a column whose every cell is a number is a number column (so formulas and plots can use it)
      for (const c of columns) if (c.kind === 'text' && rows.every((r) => r.cells[c.id] !== undefined && /^-?\d+(\.\d+)?$/.test(r.cells[c.id].replace(/,/g, '')))) c.kind = 'number';
      for (const c of columns) if (c.kind === 'number') for (const r of rows) r.cells[c.id] = r.cells[c.id].replace(/,/g, '');
      return { data: { columns, rows } };
    }
  }
}

/** Fields of an item's kind that `update` may set (the rest of what it holds is its identity or its history). */
const SETTABLE: Record<RepKind, string[]> = {
  question: ['text', 'detail'],
  statement: ['text', 'detail', 'basis', 'role', 'cites'],
  hypothesis: ['text', 'detail', 'cites'],
  observation: ['text', 'detail', 'from', 'cites'],
  entity: ['text', 'detail'],
  unknown: ['text', 'detail'],
  caveat: ['text', 'detail', 'weight'],
  metric: ['text', 'detail', 'value', 'expr', 'unit', 'basis', 'cites'],
  timeline: ['text', 'detail', 'events'],
  sequence: ['text', 'detail', 'steps'],
  document: ['text', 'detail', 'passage'],
  equation: ['text', 'detail'],
  variable: ['text', 'detail'],
  plot: ['text', 'detail'],
  matrix: ['text', 'detail'],
  diagram: ['text', 'detail'],
  media: ['text', 'detail'],
};

const withWas = (it: RepItem, text: string, by: Origin, at: number): RepItem => ({ ...it, was: [...(it.was ?? []), { at, by, text: clip(text, 300) }].slice(-REP_LIMITS.was) });

// ── applying ─────────────────────────────────────────────────────────

/**
 * Apply a batch, by the person or the assistant. Each operation is checked on its own; what cannot apply is skipped
 * with a reason. Returns the new state, what changed, and the before-image that reverses it.
 */
export function applyRepOps(input: Representation, ops: readonly RepOp[], ctx: { by: Origin; at: number; turn?: string }): RepApply {
  let rep: Representation = { ...input, items: [...input.items], relations: [...input.relations], variables: [...input.variables], turns: [...input.turns] };
  const skipped: RepApply['skipped'] = [];
  const near: [string, string][] = [];
  const ids: [string, string][] = [];
  const remap = new Map<string, string>();
  const ref = (id: unknown) => (typeof id === 'string' ? remap.get(id) ?? id : '');
  const ai = ctx.by === 'ai';
  const skip = (index: number, why: string) => skipped.push({ index, why });
  const indexOf = (id: string) => rep.items.findIndex((i) => i.id === id);
  const put = (k: number, it: RepItem) => {
    rep.items[k] = it;
  };

  (ops.slice(0, REP_OP_LIMIT) as RepOp[]).forEach((op, index) => {
    const o = op as unknown as Record<string, unknown>;
    switch (op.op) {
      case 'turn': {
        if (typeof op.message === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(op.message) && !rep.turns.includes(op.message)) rep.turns = [...rep.turns, op.message].slice(-REP_LIMITS.turns);
        return;
      }
      case 'add': {
        const raw = obj(op.item);
        if (!raw || !isRepKind(raw.kind)) return skip(index, 'not a kind of item');
        const kind = raw.kind;
        const wanted = typeof raw.id === 'string' ? raw.id : '';
        // the same id added again, as the same kind: the assistant meant to revise it
        const existing = wanted ? itemById(rep, ref(wanted)) : undefined;
        if (existing && existing.kind === kind) {
          const set = { ...raw };
          delete set.id;
          delete set.kind;
          const r = applyRepOps(rep, [{ op: 'update', id: existing.id, set }], ctx);
          rep = r.rep;
          if (r.skipped.length) skip(index, r.skipped[0].why);
          return;
        }
        if (rep.items.length >= REP_LIMITS.items) return skip(index, 'the representation is full');
        const taken = new Set(rep.items.map((i) => i.id));
        const id = freshId(kind, wanted, taken);
        if (wanted) {
          remap.set(wanted, id);
          ids.push([wanted, id]);
        }
        const nearId = ref(op.near ?? raw.near);
        if (nearId && itemById(rep, nearId)) near.push([id, nearId]);
        const base = {
          id,
          by: ctx.by,
          at: ctx.at,
          ...(ctx.turn ? { turn: ctx.turn } : {}),
          ...(typeof raw.detail === 'string' ? { detail: raw.detail } : {}),
          ...(Array.isArray(raw.cites) ? { cites: raw.cites } : {}),
        };
        if (isModelKind(kind)) {
          const comp = compositionOf(rep);
          // a variable that already has its control: the assistant means to set it, not to add a second control
          const vname = kind === 'variable' && typeof raw.name === 'string' ? raw.name.trim() : '';
          const control = vname ? rep.items.find((i) => i.kind === 'variable' && i.prim.type === 'control' && i.prim.data.variable === vname) : undefined;
          if (control) {
            remap.set(wanted, control.id);
            const patch: Record<string, unknown> = {};
            for (const key of ['value', 'min', 'max', 'step', 'unit', 'label'] as const) if (raw[key] !== undefined) patch[key] = key === 'unit' || key === 'label' ? clip(raw[key], key === 'unit' ? 16 : 60) : num(raw[key]);
            const res = applyOps(comp, [{ op: 'var.update', name: vname, patch }]);
            if (res.ok) rep = withComposition(rep, res.comp, ctx.by, ctx.at);
            else skip(index, res.error ?? 'the model refused it');
            return;
          }
          const md = modelData(kind, raw, comp);
          if (!md) return skip(index, `a ${kind} needs its content`);
          const label = clip(raw.text ?? raw.label ?? raw.title, TEXT_MAX[kind]);
          const prim = newPrimitive(PRIM_TYPE[kind], { x: 0, y: 0 }, md.data as never);
          const aops: ArtifactOp[] = [];
          if (md.variable) aops.push({ op: 'var.add', variable: md.variable });
          aops.push({ op: 'add', primitive: { ...prim, id, label } as unknown as Record<string, unknown> });
          const res = applyOps(comp, aops);
          if (!res.ok) return skip(index, res.error ?? 'the model refused it');
          rep = withComposition(rep, res.comp, ctx.by, ctx.at);
          const k = indexOf(id);
          if (k < 0) return skip(index, 'the model refused it');
          const it = sanitizeItem({ ...rep.items[k], ...base, kind, prim: (rep.items[k] as ItemOf<ModelKind>).prim, text: label });
          if (it) put(k, it);
          return;
        }
        const fields: Record<string, unknown> = { ...raw, ...base, kind };
        if (kind === 'hypothesis' && !ai) fields.status = fields.status ?? 'open';
        // what the person writes as an observation is theirs to say
        if (kind === 'observation' && !ai) fields.from = fields.from ?? 'person';
        const it = sanitizeItem(fields);
        if (!it) return skip(index, `a ${kind} needs its words`);
        rep.items.push(it);
        return;
      }
      case 'update': {
        const id = ref(op.id);
        const k = indexOf(id);
        if (k < 0) return skip(index, 'not there');
        const it = rep.items[k];
        if (ai && it.by === 'person') return skip(index, 'made by the person: the assistant does not reword it');
        const set = obj(op.set) ?? {};
        const allowed = SETTABLE[it.kind];
        const patch: Record<string, unknown> = {};
        for (const key of allowed) if (key in set) patch[key] = set[key];
        // a model item's content changes through the model (artifact operations); its label and detail here
        // words the person rewrites are theirs: the assistant may not change them back
        let next = sanitizeItem({ ...it, ...patch, edited: ctx.at, ...(!ai && typeof patch.text === 'string' && patch.text.trim() && patch.text.trim() !== it.text ? { by: 'person' } : {}) });
        if (!next) return skip(index, 'that would leave it empty');
        if (next.text !== it.text && it.text) next = withWas(next, it.text, ctx.by, ctx.at);
        if (isModelKind(it.kind) && next.text !== it.text) {
          const res = applyOps(compositionOf(rep), [{ op: 'update', id, label: next.text }]);
          if (res.ok) {
            rep = withComposition(rep, res.comp, ctx.by, ctx.at);
            const kk = indexOf(id);
            if (kk >= 0) put(kk, { ...(next as ItemOf<ModelKind>), prim: (rep.items[kk] as ItemOf<ModelKind>).prim });
            return;
          }
        }
        if (same(next, { ...it, edited: ctx.at })) return;
        put(k, next);
        return;
      }
      case 'status': {
        const id = ref(op.id);
        const k = indexOf(id);
        const it = rep.items[k];
        if (!it || it.kind !== 'hypothesis') return skip(index, 'only a possibility has a standing to change');
        const status = (['open', 'stronger', 'weaker', 'ruled_out'] as const).find((s) => s === op.status);
        if (!status) return skip(index, 'not a standing');
        const because = clip(op.because, REP_LIMITS.because);
        if (status === it.status && (because || '') === (it.because || '')) return;
        const was = `${STATUS_WORD[it.status]}${it.because ? ` — ${it.because}` : ''}`;
        put(k, withWas({ ...it, status, ...(because ? { because } : { because: undefined }), edited: ctx.at } as RepItem, was, ctx.by, ctx.at));
        if (!because) delete (rep.items[k] as { because?: string }).because;
        return;
      }
      case 'answer': {
        const id = ref(op.id);
        const k = indexOf(id);
        const it = rep.items[k];
        if (!it || it.kind !== 'unknown') return skip(index, 'only an open question takes an answer');
        const answer = clip(op.answer, REP_LIMITS.answer, true);
        if (!answer) return skip(index, 'no answer');
        if (answer === it.answer) return;
        put(k, { ...(it.answer ? withWas(it, `Answered: ${it.answer}`, ctx.by, ctx.at) : it), answer, edited: ctx.at } as RepItem);
        return;
      }
      case 'remove': {
        const id = ref(op.id);
        const k = indexOf(id);
        if (k < 0) return;
        const it = rep.items[k];
        if (ai && it.by === 'person') return skip(index, 'made by the person: the assistant does not remove it');
        if (isModelKind(it.kind)) {
          const res = applyOps(compositionOf(rep), [{ op: 'remove', id }]);
          if (!res.ok) return skip(index, res.error ?? 'the model refused it');
          rep = withComposition(rep, res.comp, ctx.by, ctx.at);
          return;
        }
        rep.items.splice(k, 1);
        rep.relations = rep.relations.filter((r) => r.from !== id && r.to !== id);
        return;
      }
      case 'merge': {
        const into = ref(op.into);
        const target = itemById(rep, into);
        const others = (Array.isArray(op.ids) ? op.ids : []).map(ref).filter((id) => id && id !== into);
        if (!target || !others.length) return skip(index, 'nothing to merge');
        const gone = others.map((id) => itemById(rep, id)).filter((x): x is RepItem => !!x);
        if (!gone.length) return skip(index, 'nothing to merge');
        if (gone.some((g) => isModelKind(g.kind)) || isModelKind(target.kind)) return skip(index, 'the model is changed through its own operations');
        if (ai && gone.some((g) => g.by === 'person')) return skip(index, 'made by the person: the assistant does not remove it');
        const k = indexOf(into);
        let next: RepItem = { ...target, edited: ctx.at };
        const text = clip(op.text, TEXT_MAX[target.kind]);
        if (text && text !== target.text && !(ai && target.by === 'person')) next = withWas({ ...next, text } as RepItem, target.text, ctx.by, ctx.at);
        const cites = [...(target.cites ?? []), ...gone.flatMap((g) => g.cites ?? [])];
        if (cites.length) next = sanitizeItem({ ...next, cites }) ?? next;
        put(k, next);
        const goneIds = new Set(gone.map((g) => g.id));
        rep.items = rep.items.filter((i) => !goneIds.has(i.id));
        // their connections now join what they were merged into
        const rels = new Map<string, RepRelation>();
        for (const r of rep.relations) {
          const from = goneIds.has(r.from) ? into : r.from;
          const to = goneIds.has(r.to) ? into : r.to;
          if (from === to) continue;
          const id2 = relationId(from, r.kind, to);
          if (!rels.has(id2)) rels.set(id2, { ...r, id: id2, from, to });
        }
        rep.relations = [...rels.values()];
        return;
      }
      case 'relate': {
        const from = ref(op.from), to = ref(op.to);
        const kind = (REL_KINDS as readonly string[]).includes(op.kind) ? op.kind : null;
        if (!kind) return skip(index, 'not a kind of connection');
        const ids2 = new Set(rep.items.map((i) => i.id));
        const r = sanitizeRelation({ from, to, kind, status: op.status ?? (ai ? 'unverified' : 'established'), label: op.label, by: ctx.by, at: ctx.at }, ids2);
        if (!r) return skip(index, from === to ? 'an item is not connected to itself' : 'one end is not there');
        const at = rep.relations.findIndex((x) => x.id === r.id);
        if (at >= 0) {
          const was = rep.relations[at];
          if (ai && was.by === 'person' && (was.status !== r.status || (was.label ?? '') !== (r.label ?? ''))) return skip(index, 'made by the person: the assistant does not change it');
          rep.relations[at] = { ...r, by: was.by, at: was.at };
          return;
        }
        if (rep.relations.length >= REP_LIMITS.relations) return skip(index, 'too many connections');
        rep.relations.push(r);
        return;
      }
      case 'unrelate': {
        const from = ref(op.from), to = ref(op.to);
        const hit = rep.relations.filter((r) => ((r.from === from && r.to === to) || (r.from === to && r.to === from)) && (!op.kind || r.kind === op.kind));
        if (!hit.length) return;
        if (ai && hit.some((r) => r.by === 'person')) return skip(index, 'made by the person: the assistant does not remove it');
        const gone = new Set(hit.map((r) => r.id));
        rep.relations = rep.relations.filter((r) => !gone.has(r.id));
        return;
      }
      case 'model': {
        const aops = Array.isArray(op.ops) ? op.ops : [];
        if (!aops.length) return;
        // the assistant may not take away the person's parts of the model
        if (ai && aops.some((a) => (a.op === 'remove' || a.op === 'update') && itemById(rep, (a as { id: string }).id)?.by === 'person')) return skip(index, 'made by the person: the assistant does not change it');
        const res = applyOps(compositionOf(rep), aops.filter((a) => a.op !== 'move' && a.op !== 'resize' && a.op !== 'order' && a.op !== 'duplicate'));
        if (!res.ok) return skip(index, res.error ?? 'the model refused it');
        rep = withComposition(rep, res.comp, ctx.by, ctx.at);
        return;
      }
      case 'view': {
        const id = ref(op.id);
        const k = indexOf(id);
        if (k < 0) return skip(index, 'not there');
        const it = rep.items[k];
        const views = VIEWS[it.kind];
        if (!views || typeof op.as !== 'string' || !views.includes(op.as)) return skip(index, `a ${KIND_WORD[it.kind].toLowerCase()} is not shown that way`);
        const view = sanitizeView(it.kind, { as: op.as, x: op.x, y: op.y });
        const next = { ...it } as RepItem;
        if (view) next.view = view;
        else delete next.view;
        if (same(next, it)) return;
        put(k, next);
        return;
      }
      case 'keep': {
        const id = ref(op.id);
        const k = indexOf(id);
        if (k < 0 || typeof op.node !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(op.node)) return skip(index, 'not there');
        put(k, { ...rep.items[k], kept: op.node });
        return;
      }
      default:
        skip(index, `not an operation: ${String(o.op).slice(0, 20)}`);
    }
  });
  if (ops.length > REP_OP_LIMIT) for (let k = REP_OP_LIMIT; k < ops.length; k++) skip(k, 'too many operations in one batch');
  // never past the whole's limit: if a batch would make it too large, nothing of it applies
  if (representationBytes(rep) > REP_LIMITS.bytes) return { rep: input, changes: NO_CHANGES, before: EMPTY_PATCH, skipped: ops.map((_, index) => ({ index, why: 'the representation would be too large' })), near: [], ids: [] };
  const { patch, changes } = diff(input, rep);
  return { rep, changes, before: patch, skipped, near: near.filter(([id]) => rep.items.some((i) => i.id === id)), ids };
}

// ── the log: what each batch did, and how to reverse it ──────────────

export interface LogEntry {
  id: string;
  at: number;
  by: Origin;
  /** the person's message the batch answered */
  turn?: string;
  summary: string;
  /** how the assistant read the turn, in a few words */
  read?: string;
  /** an undo: the entries it reversed */
  undoes?: string[];
  before: Patch;
}

export interface RepRecord {
  rep: Representation;
  log: LogEntry[];
}

export const LOG_LIMITS = { entries: 40, bytes: 900_000 } as const;
export const EMPTY_RECORD: RepRecord = { rep: { subtype: 'representation', v: 1, items: [], relations: [], variables: [], turns: [] }, log: [] };

const logId = (at: number, n: number) => `b${at.toString(36)}${n.toString(36)}${Math.random().toString(36).slice(2, 7).replace(/[^a-z0-9]/g, '') || '0'}`;

/** A log with one more entry, the oldest dropped to stay within bounds. */
export function appendLog(log: readonly LogEntry[], entry: Omit<LogEntry, 'id'>): LogEntry[] {
  const next = [...log, { ...entry, id: logId(entry.at, log.length) }];
  while (next.length > LOG_LIMITS.entries) next.shift();
  while (next.length > 1 && JSON.stringify(next).length > LOG_LIMITS.bytes) next.shift();
  return next;
}

export function sanitizeLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LogEntry[] = [];
  for (const e of raw) {
    const o = obj(e);
    const b = o && obj(o.before);
    if (!o || !b || typeof o.id !== 'string' || !/^[a-z0-9]{1,40}$/.test(o.id)) continue;
    const items: Patch['items'] = [];
    for (const t of Array.isArray(b.items) ? b.items : []) {
      if (!Array.isArray(t) || typeof t[0] !== 'string') continue;
      const prev = t[1] === null ? null : sanitizeItem(t[1]);
      if (t[1] !== null && !prev) continue;
      items.push([t[0], prev, finite(t[2]) ? Math.round(t[2]) : -1]);
    }
    const relations: Patch['relations'] = [];
    for (const t of Array.isArray(b.relations) ? b.relations : []) {
      if (!Array.isArray(t) || typeof t[0] !== 'string') continue;
      if (t[1] === null) relations.push([t[0], null]);
      else {
        const ro = obj(t[1]);
        // a relation's ends are checked when it is put back (the items may be put back with it)
        if (ro && typeof ro.from === 'string' && typeof ro.to === 'string') {
          const r = sanitizeRelation(ro, new Set([ro.from, ro.to]));
          if (r) relations.push([t[0], r]);
        }
      }
    }
    const variables = Array.isArray(b.variables) ? b.variables.map(sanitizeVariable).filter((v): v is Variable => !!v) : null;
    const turns = Array.isArray(b.turns) ? b.turns.filter((x): x is string => typeof x === 'string') : null;
    out.push({
      id: o.id,
      at: finite(o.at) ? Math.round(o.at) : 0,
      by: o.by === 'person' ? 'person' : 'ai',
      ...(typeof o.turn === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(o.turn) ? { turn: o.turn } : {}),
      summary: clip(o.summary, 300) || 'A change.',
      ...(typeof o.read === 'string' ? { read: clip(o.read, 200) } : {}),
      ...(Array.isArray(o.undoes) ? { undoes: o.undoes.filter((x): x is string => typeof x === 'string' && /^[a-z0-9]{1,40}$/.test(x)).slice(0, LOG_LIMITS.entries) } : {}),
      before: { items, relations, variables, turns },
    });
  }
  return out.slice(-LOG_LIMITS.entries);
}

/** Apply a batch to a record and log it. A batch that changes nothing leaves the log as it was. */
export function commit(record: RepRecord, ops: readonly RepOp[], ctx: { by: Origin; at: number; turn?: string; read?: string; summary?: string }): { record: RepRecord; result: RepApply; entry: LogEntry | null } {
  const result = applyRepOps(record.rep, ops, ctx);
  if (patchIsEmpty(result.before)) return { record, result, entry: null };
  const summary = ctx.summary ?? summaryOf(record.rep, result.rep, result.changes, ctx.by);
  const log = appendLog(record.log, { at: ctx.at, by: ctx.by, ...(ctx.turn ? { turn: ctx.turn } : {}), summary, ...(ctx.read ? { read: ctx.read } : {}), before: result.before });
  return { record: { rep: result.rep, log }, result, entry: log[log.length - 1] };
}

/** The entries some later undo reversed. */
export const undoneIn = (log: readonly LogEntry[]) => new Set(log.flatMap((e) => e.undoes ?? []));

/** The newest change still in effect (not an undo, not undone): what "Undo" reverses. */
export function lastInEffect(log: readonly LogEntry[]): LogEntry | null {
  const undone = undoneIn(log);
  for (let i = log.length - 1; i >= 0; i--) if (!log[i].undoes && !undone.has(log[i].id)) return log[i];
  return null;
}

/**
 * Back to how it was before a logged batch: every entry from the newest down to it reversed, in order (the log is a
 * chain — each entry's before-image takes the state after it to the state before it — so reversing the chain is
 * exact, undos and all). The reversal is logged as an entry of its own, saying which entries it undid, so it can be
 * reversed too. Nothing leaves the log but the oldest, past its bounds.
 */
export function revertTo(record: RepRecord, entryId: string, by: Origin, at: number): { record: RepRecord; entry: LogEntry | null; changes: Changes } | null {
  const k = record.log.findIndex((e) => e.id === entryId);
  if (k < 0) return null;
  let rep = record.rep;
  for (let i = record.log.length - 1; i >= k; i--) rep = revertPatch(rep, record.log[i].before);
  const { patch, changes } = diff(record.rep, rep);
  const undone = undoneIn(record.log);
  const undoes = record.log.slice(k).filter((e) => !e.undoes && !undone.has(e.id)).map((e) => e.id);
  if (patchIsEmpty(patch)) return { record, entry: null, changes };
  const target = record.log[k];
  const what = target.summary.replace(/\.$/, '');
  const later = undoes.filter((id) => id !== target.id).length;
  const summary = target.undoes ? `Redid what was undone: ${what.replace(/^Undid: /, '')}.` : `Undid: ${what.charAt(0).toLowerCase()}${what.slice(1)}${later ? ` (and ${later} later change${later === 1 ? '' : 's'})` : ''}.`;
  const log = appendLog(record.log, { at, by, summary, ...(undoes.length ? { undoes } : { undoes: [target.id] }), before: patch });
  return { record: { rep, log }, entry: log[log.length - 1], changes };
}

// ── values the model works out ───────────────────────────────────────

/** The scope of the model, and each measure's value worked out from it (keyed metric:<id>). */
export function valuesOf(rep: Representation): { scope: Scope; values: Record<string, number> } {
  const scope = evaluateScope(compositionOf(rep));
  const values: Record<string, number> = Object.create(null);
  for (const [k, v] of Object.entries(scope.values)) values[k] = v;
  for (const [k, v] of Object.entries(scope.results)) values[k] = v;
  for (const it of rep.items) if (it.kind === 'metric' && it.expr) values[`metric:${it.id}`] = evalIn(scope, it.expr).value;
  return { scope, values };
}
