// lib/new-logos/artifact-ops.ts — THE OPERATIONS: the one way a composition changes, whoever changes it.
//
// A person dragging a plot, typing in a table cell or moving a slider, and (later) the assistant proposing an edit,
// all produce the same thing: a list of OPERATIONS in this small vocabulary —
//
//   add · update · move · resize · remove · duplicate · order          (primitives)
//   var.add · var.set · var.update · var.rename · var.remove           (shared variables)
//
// Operations are checked here (parseOps: shape; applyOps: meaning) and applied by ONE pure function, run in the
// browser for an immediate result and again on the server against the stored composition, which is the truth. Because
// an operation names what it changes (this primitive, this variable) rather than carrying the whole composition, two
// people — or two tabs — editing different parts never overwrite each other: each batch is applied to whatever is
// stored when it arrives. An operation whose target is already gone is skipped and reported, not an error; adding a
// primitive or variable that already exists is skipped too, so a batch sent twice (a retry after a lost reply) does
// nothing the second time.
//
// Every operation has an inverse (inverseBatch), which is how undo works: the inverse is itself a batch of operations,
// sent the same way.
//
// Pure: no I/O.

import { cleanText } from './clean';
import { isIdent, renameIn } from './expr';
import { LIVE_VALUE_RE } from './compose';
import {
  PRIMITIVE_ID_RE,
  PRIMITIVE_LIMITS,
  compositionBytes,
  sanitizePrimitive,
  sanitizePrimitiveData,
  sanitizeVariable,
  type Composition,
  type Primitive,
  type Variable,
} from './primitives';

export type ArtifactOp =
  | { op: 'add'; primitive: Record<string, unknown>; index?: number }
  | { op: 'update'; id: string; label?: string; data?: Record<string, unknown>; replace?: boolean }
  | { op: 'move'; id: string; x: number; y: number }
  | { op: 'resize'; id: string; w: number; h: number }
  | { op: 'remove'; id: string }
  | { op: 'duplicate'; id: string; as: string; dx?: number; dy?: number }
  | { op: 'order'; id: string; to: 'front' | 'back' | number }
  | { op: 'var.add'; variable: Record<string, unknown> }
  | { op: 'var.set'; name: string; value: number }
  | { op: 'var.update'; name: string; patch: Record<string, unknown> }
  | { op: 'var.rename'; from: string; to: string }
  | { op: 'var.remove'; name: string };

export const OP_LIMITS = { batch: 100 } as const;

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pid = (v: unknown): v is string => typeof v === 'string' && PRIMITIVE_ID_RE.test(v);
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Check a batch's shape. Anything malformed refuses the whole batch: nothing half-applied. */
export function parseOps(raw: unknown): { ok: true; ops: ArtifactOp[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: 'No operations.' };
  if (raw.length > OP_LIMITS.batch) return { ok: false, error: `Too many operations at once (${OP_LIMITS.batch} at most).` };
  const ops: ArtifactOp[] = [];
  for (const [k, r0] of raw.entries()) {
    const r = obj(r0);
    const bad = (why: string) => ({ ok: false as const, error: `Operation ${k + 1}: ${why}` });
    if (!r) return bad('not an operation.');
    switch (r.op) {
      case 'add': {
        const p = obj(r.primitive);
        if (!p) return bad('no primitive.');
        ops.push({ op: 'add', primitive: p, ...(finite(r.index) ? { index: Math.floor(r.index) } : {}) });
        break;
      }
      case 'update': {
        if (!pid(r.id)) return bad('which primitive?');
        const data = r.data === undefined ? undefined : obj(r.data);
        if (r.data !== undefined && !data) return bad('data must be an object.');
        if (r.label !== undefined && typeof r.label !== 'string') return bad('a label is text.');
        ops.push({ op: 'update', id: r.id, ...(typeof r.label === 'string' ? { label: r.label } : {}), ...(data ? { data } : {}), ...(r.replace === true ? { replace: true } : {}) });
        break;
      }
      case 'move':
        if (!pid(r.id) || !finite(r.x) || !finite(r.y)) return bad('a move needs a primitive and a place.');
        ops.push({ op: 'move', id: r.id, x: r.x, y: r.y });
        break;
      case 'resize':
        if (!pid(r.id) || !finite(r.w) || !finite(r.h)) return bad('a resize needs a primitive and a size.');
        ops.push({ op: 'resize', id: r.id, w: r.w, h: r.h });
        break;
      case 'remove':
        if (!pid(r.id)) return bad('which primitive?');
        ops.push({ op: 'remove', id: r.id });
        break;
      case 'duplicate':
        if (!pid(r.id) || !pid(r.as)) return bad('a duplicate needs the primitive and the new id.');
        ops.push({ op: 'duplicate', id: r.id, as: r.as, ...(finite(r.dx) ? { dx: r.dx } : {}), ...(finite(r.dy) ? { dy: r.dy } : {}) });
        break;
      case 'order':
        if (!pid(r.id) || !(r.to === 'front' || r.to === 'back' || finite(r.to))) return bad('an order needs a primitive and front, back or a position.');
        ops.push({ op: 'order', id: r.id, to: r.to as 'front' | 'back' | number });
        break;
      case 'var.add': {
        const v = obj(r.variable);
        if (!v) return bad('no variable.');
        ops.push({ op: 'var.add', variable: v });
        break;
      }
      case 'var.set':
        if (typeof r.name !== 'string' || !finite(r.value)) return bad('a value needs a variable and a number.');
        ops.push({ op: 'var.set', name: r.name, value: r.value });
        break;
      case 'var.update': {
        const patch = obj(r.patch);
        if (typeof r.name !== 'string' || !patch) return bad('which variable, and what changes?');
        ops.push({ op: 'var.update', name: r.name, patch });
        break;
      }
      case 'var.rename':
        if (typeof r.from !== 'string' || typeof r.to !== 'string') return bad('a rename needs both names.');
        ops.push({ op: 'var.rename', from: r.from, to: r.to });
        break;
      case 'var.remove':
        if (typeof r.name !== 'string') return bad('which variable?');
        ops.push({ op: 'var.remove', name: r.name });
        break;
      default:
        return bad('unknown operation.');
    }
  }
  return { ok: true, ops };
}

export interface ApplyResult {
  ok: boolean;
  comp: Composition;
  /** indices of operations whose target was already gone (or already there) */
  skipped: number[];
  error?: string;
  code?: 'invalid' | 'limit';
}

const definedNames = (c: Composition) => new Set<string>([...c.variables.map((v) => v.name), ...c.primitives.flatMap((p) => (p.type === 'equation' && p.data.name ? [p.data.name] : []))]);

/** Rewrite every use of a shared name in a composition (renaming a variable). Shadowed uses are left alone. */
function renameEverywhere(c: Composition, from: string, to: string) {
  const live = (body: string) => body.replace(LIVE_VALUE_RE, (_, src: string) => `{{${renameIn(src, from, to)}}}`);
  for (const p of c.primitives) {
    switch (p.type) {
      case 'equation':
        // a parameter of the same name is a different thing inside this equation
        if (!p.data.params.includes(from)) p.data.expr = renameIn(p.data.expr, from, to);
        break;
      case 'plot':
        for (const s of p.data.series) {
          if (s.kind === 'fn' && from !== 'x') s.expr = renameIn(s.expr, from, to);
          if (s.kind === 'point') (s.x = renameIn(s.x, from, to), (s.y = renameIn(s.y, from, to)));
        }
        break;
      case 'table':
        if (!p.data.columns.some((col) => col.key === from)) for (const col of p.data.columns) if (col.kind === 'formula' && col.expr) col.expr = renameIn(col.expr, from, to);
        break;
      case 'text':
        p.data.body = live(p.data.body);
        break;
      case 'control':
        if (p.data.variable === from) p.data.variable = to;
        break;
      default:
        break;
    }
  }
}

/**
 * Where a use of `from` would come to mean something else if it were called `to`: inside a function whose parameter
 * is `to`, in a plotted function (where x is the plot's own variable), or in a table that has a column named `to`.
 * Returns where, in words, or null when the rename is safe.
 */
function capturedBy(c: Composition, from: string, to: string): string | null {
  const reads = (src: string) => new RegExp(`(^|[^A-Za-z0-9_])${from}([^A-Za-z0-9_]|$)`).test(src);
  for (const p of c.primitives) {
    if (p.type === 'equation' && p.data.params.includes(to) && !p.data.params.includes(from) && reads(p.data.expr)) return `in ${p.data.name}(${p.data.params.join(', ')})`;
    if (p.type === 'plot' && to === 'x' && p.data.series.some((s) => s.kind === 'fn' && reads(s.expr))) return 'in a plot (x is the plotted variable)';
    if (p.type === 'table' && p.data.columns.some((col) => col.key === to) && !p.data.columns.some((col) => col.key === from) && p.data.columns.some((col) => col.kind === 'formula' && col.expr && reads(col.expr))) return 'in a table (a column is called that)';
  }
  return null;
}

/** What else must change when a primitive goes: notes stop pointing at it, plots stop reading it. */
function detach(c: Composition, id: string) {
  for (const p of c.primitives) {
    if (p.type === 'text' && p.data.target === id) delete p.data.target;
    if (p.type === 'plot') p.data.series = p.data.series.filter((s) => s.kind !== 'table' || s.table !== id);
  }
}

/** Apply a batch to a composition. The input is not changed. */
export function applyOps(input: Composition, ops: readonly ArtifactOp[]): ApplyResult {
  const c = copy(input);
  const skipped: number[] = [];
  const fail = (error: string, code: 'invalid' | 'limit' = 'invalid'): ApplyResult => ({ ok: false, comp: input, skipped: [], error, code });
  const find = (id: string) => c.primitives.findIndex((p) => p.id === id);
  for (const [k, op] of ops.entries()) {
    switch (op.op) {
      case 'add': {
        const p = sanitizePrimitive(op.primitive);
        if (!p) return fail(`Operation ${k + 1}: not a primitive.`);
        if (pid(op.primitive.id) && find(op.primitive.id as string) !== -1) {
          skipped.push(k);
          break;
        }
        if (c.primitives.length >= PRIMITIVE_LIMITS.primitives) return fail(`An artifact holds ${PRIMITIVE_LIMITS.primitives} primitives at most.`, 'limit');
        const at = op.index === undefined ? c.primitives.length : Math.max(0, Math.min(c.primitives.length, op.index));
        c.primitives.splice(at, 0, p);
        // references to primitives that are not here are dropped, as when it is read
        if (p.type === 'text' && p.data.target && find(p.data.target) === -1) delete p.data.target;
        if (p.type === 'plot') p.data.series = p.data.series.filter((s) => s.kind !== 'table' || find(s.table) !== -1);
        break;
      }
      case 'update': {
        const i = find(op.id);
        if (i === -1) {
          skipped.push(k);
          break;
        }
        const p = c.primitives[i];
        if (op.label !== undefined) p.label = cleanText(op.label, PRIMITIVE_LIMITS.label);
        if (op.data) {
          const next = sanitizePrimitiveData(p.type, op.replace ? op.data : { ...(p.data as unknown as Record<string, unknown>), ...op.data });
          (p as { data: unknown }).data = next;
          if (p.type === 'text' && p.data.target && (p.data.target === p.id || find(p.data.target) === -1)) delete p.data.target;
          if (p.type === 'plot') p.data.series = p.data.series.filter((s) => s.kind !== 'table' || find(s.table) !== -1);
        }
        break;
      }
      case 'move': {
        const p = c.primitives[find(op.id)];
        if (!p) {
          skipped.push(k);
          break;
        }
        p.x = Math.round(Math.max(-PRIMITIVE_LIMITS.coord, Math.min(PRIMITIVE_LIMITS.coord, op.x)));
        p.y = Math.round(Math.max(-PRIMITIVE_LIMITS.coord, Math.min(PRIMITIVE_LIMITS.coord, op.y)));
        break;
      }
      case 'resize': {
        const p = c.primitives[find(op.id)];
        if (!p) {
          skipped.push(k);
          break;
        }
        p.w = Math.round(Math.max(PRIMITIVE_LIMITS.minW, Math.min(PRIMITIVE_LIMITS.maxSize, op.w)));
        p.h = Math.round(Math.max(PRIMITIVE_LIMITS.minH, Math.min(PRIMITIVE_LIMITS.maxSize, op.h)));
        break;
      }
      case 'remove': {
        const i = find(op.id);
        if (i === -1) {
          skipped.push(k);
          break;
        }
        c.primitives.splice(i, 1);
        detach(c, op.id);
        break;
      }
      case 'duplicate': {
        const src = c.primitives[find(op.id)];
        if (!src || find(op.as) !== -1) {
          skipped.push(k);
          break;
        }
        if (c.primitives.length >= PRIMITIVE_LIMITS.primitives) return fail(`An artifact holds ${PRIMITIVE_LIMITS.primitives} primitives at most.`, 'limit');
        const dup = copy(src) as Primitive;
        dup.id = op.as;
        dup.x = Math.round(src.x + (op.dx ?? 24));
        dup.y = Math.round(src.y + (op.dy ?? 24));
        // a copied equation would define the same name twice: the copy gets the next free one (f → f2)
        if (dup.type === 'equation' && dup.data.name) {
          const taken = definedNames(c);
          const stem = (dup.data.name.replace(/\d+$/, '') || dup.data.name).slice(0, 26);
          let n = 2;
          while (taken.has(`${stem}${n}`) || !isIdent(`${stem}${n}`)) n++;
          dup.data = { ...dup.data, name: `${stem}${n}` };
        }
        c.primitives.push(dup);
        break;
      }
      case 'order': {
        const i = find(op.id);
        if (i === -1) {
          skipped.push(k);
          break;
        }
        const [p] = c.primitives.splice(i, 1);
        const at = op.to === 'front' ? c.primitives.length : op.to === 'back' ? 0 : Math.max(0, Math.min(c.primitives.length, Math.floor(op.to)));
        c.primitives.splice(at, 0, p);
        break;
      }
      case 'var.add': {
        const v = sanitizeVariable(op.variable);
        if (!v) return fail(`Operation ${k + 1}: a variable needs a name of letters, digits and _ that does not already mean something (like sin or pi).`);
        if (c.variables.some((x) => x.name === v.name)) {
          skipped.push(k);
          break;
        }
        if (definedNames(c).has(v.name)) return fail(`“${v.name}” is already defined by an equation.`);
        if (c.variables.length >= PRIMITIVE_LIMITS.variables) return fail(`An artifact holds ${PRIMITIVE_LIMITS.variables} variables at most.`, 'limit');
        c.variables.push(v);
        break;
      }
      case 'var.set': {
        const v = c.variables.find((x) => x.name === op.name);
        if (!v) {
          skipped.push(k);
          break;
        }
        // the value only (a range is changed by var.update), so a run of values sent as the last one means the same
        v.value = v.kind === 'boolean' ? (op.value !== 0 ? 1 : 0) : Math.max(-1e12, Math.min(1e12, op.value));
        break;
      }
      case 'var.update': {
        const i = c.variables.findIndex((x) => x.name === op.name);
        if (i === -1) {
          skipped.push(k);
          break;
        }
        const { name: _ignored, ...patch } = op.patch;
        void _ignored;
        const next = sanitizeVariable({ ...c.variables[i], ...patch, name: op.name });
        if (!next) return fail(`Operation ${k + 1}: not a valid variable.`);
        c.variables[i] = next;
        break;
      }
      case 'var.rename': {
        const v = c.variables.find((x) => x.name === op.from);
        if (!v) {
          skipped.push(k);
          break;
        }
        if (op.to === op.from) break;
        if (!isIdent(op.to)) return fail(`“${op.to}” cannot be a name: letters, digits and _, starting with a letter, and not a word that already means something.`);
        if (definedNames(c).has(op.to)) return fail(`“${op.to}” is already used.`);
        const captured = capturedBy(c, op.from, op.to);
        if (captured) return fail(`“${op.to}” already means something else ${captured}, so renaming to it would change what that says. Choose another name.`);
        v.name = op.to;
        renameEverywhere(c, op.from, op.to);
        break;
      }
      case 'var.remove': {
        const i = c.variables.findIndex((x) => x.name === op.name);
        if (i === -1) {
          skipped.push(k);
          break;
        }
        c.variables.splice(i, 1);
        break;
      }
    }
  }
  if (compositionBytes(c) > PRIMITIVE_LIMITS.bytes) return fail('This artifact would be too large. Split it into two, or keep long text in its own artifact.', 'limit');
  return { ok: true, comp: c, skipped };
}

// ── undo ─────────────────────────────────────────────────────────────

/** The operations that undo one operation, given the composition before it. */
export function inverseOf(before: Composition, op: ArtifactOp): ArtifactOp[] {
  const p = 'id' in op ? before.primitives.find((x) => x.id === op.id) : undefined;
  switch (op.op) {
    case 'add': {
      const id = op.primitive.id;
      if (!pid(id) || before.primitives.some((x) => x.id === id)) return [];
      return [{ op: 'remove', id }];
    }
    case 'update':
      return p ? [{ op: 'update', id: p.id, label: p.label, data: copy(p.data) as unknown as Record<string, unknown>, replace: true }] : [];
    case 'move':
      return p ? [{ op: 'move', id: p.id, x: p.x, y: p.y }] : [];
    case 'resize':
      return p ? [{ op: 'resize', id: p.id, w: p.w, h: p.h }] : [];
    case 'remove': {
      if (!p) return [];
      const index = before.primitives.indexOf(p);
      // put it back where it was in the stacking order, and give back what pointed at it
      const pointing = before.primitives.filter((x) => (x.type === 'text' && x.data.target === p.id) || (x.type === 'plot' && x.data.series.some((s) => s.kind === 'table' && s.table === p.id)));
      return [
        { op: 'add', primitive: copy(p) as unknown as Record<string, unknown>, index },
        ...pointing.map((x): ArtifactOp => ({ op: 'update', id: x.id, data: copy(x.data) as unknown as Record<string, unknown>, replace: true })),
      ];
    }
    case 'duplicate':
      return p && !before.primitives.some((x) => x.id === op.as) ? [{ op: 'remove', id: op.as }] : [];
    case 'order':
      return p ? [{ op: 'order', id: p.id, to: before.primitives.indexOf(p) }] : [];
    case 'var.add': {
      const name = op.variable.name;
      return typeof name === 'string' && !before.variables.some((v) => v.name === name) ? [{ op: 'var.remove', name }] : [];
    }
    case 'var.set':
    case 'var.update': {
      const v = before.variables.find((x) => x.name === op.name);
      // a label or unit the change added is taken away again: say "none" explicitly, since a patch merges
      return v ? [{ op: 'var.update', name: v.name, patch: { ...(copy(v) as unknown as Record<string, unknown>), label: v.label ?? '', unit: v.unit ?? '' } }] : [];
    }
    case 'var.rename':
      return before.variables.some((v) => v.name === op.from) && op.from !== op.to ? [{ op: 'var.rename', from: op.to, to: op.from }] : [];
    case 'var.remove': {
      const v = before.variables.find((x) => x.name === op.name);
      if (!v) return [];
      return [{ op: 'var.add', variable: copy(v) as unknown as Record<string, unknown> }];
    }
  }
}

/** The batch that undoes a batch, given the composition before it. */
export function inverseBatch(before: Composition, ops: readonly ArtifactOp[]): ArtifactOp[] {
  let state = before;
  const out: ArtifactOp[] = [];
  for (const op of ops) {
    out.unshift(...inverseOf(state, op));
    const r = applyOps(state, [op]);
    if (r.ok) state = r.comp;
  }
  return out;
}

// ── sending fewer operations ────────────────────────────────────────

/**
 * A batch made shorter without changing what it does: a slider dragged through forty values is one value; a
 * primitive moved, resized or patched several times is its last place, size or merged patch.
 */
export function coalesce(ops: readonly ArtifactOp[]): ArtifactOp[] {
  const out: ArtifactOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.op === op.op) {
      if (op.op === 'var.set' && last.op === 'var.set' && last.name === op.name) {
        out[out.length - 1] = op;
        continue;
      }
      if ((op.op === 'move' || op.op === 'resize') && 'id' in last && last.id === op.id) {
        out[out.length - 1] = op;
        continue;
      }
      if (op.op === 'update' && last.op === 'update' && last.id === op.id && !op.replace && !last.replace) {
        out[out.length - 1] = { op: 'update', id: op.id, ...(op.label !== undefined || last.label !== undefined ? { label: op.label ?? last.label } : {}), ...(op.data || last.data ? { data: { ...(last.data ?? {}), ...(op.data ?? {}) } } : {}) };
        continue;
      }
    }
    out.push(op);
  }
  return out;
}

export type { Variable };
