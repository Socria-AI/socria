// lib/new-logos/compose.ts — SHARED STATE: what a composition's values are, and which primitive depends on which.
//
// A composition's shared state is its VARIABLES (set by people, through controls or directly) and the DEFINITIONS
// its equations make (revenue = price · quantity; f(x) = a x² + b). Together they are the composition's SCOPE,
// worked out here in dependency order: a definition is evaluated after everything it reads; one that depends on
// itself, or on a name nobody defines, is an error said in words on that equation, and the rest still work.
//
// Everything that reads the scope — a plotted function, a point, a table's formula column, a live value in text —
// is evaluated against it when drawn, so changing a variable changes every dependent primitive at once with no
// bookkeeping: the dependency is in the data (the names an expression reads), not in a list of subscriptions.
//
// The same reading of names gives the REFERENCES between primitives (a control drives an equation, an equation feeds
// a plot, a table supplies a plot's data, a note annotates a figure), drawn on the artifact's plane; and a plain
// DESCRIPTION of the state, so the assistant can be told what an artifact holds and shows rather than shown pixels.
//
// Pure: no I/O.

import { CONSTANTS, formatNumber, referencesOf, tryEvaluate, tryParse, type Ast, type UserFn } from './expr';
import { PRIMITIVE_LABEL, type Composition, type PlotData, type Primitive, type PrimitiveOf, type TableData } from './primitives';

export interface Scope {
  values: Record<string, number>;
  fns: Record<string, UserFn>;
  /** what an equation primitive works out to (named values and bare expressions) */
  results: Record<string, number>;
  /** a primitive's problem, in words */
  errors: Record<string, string>;
  /** where a name comes from */
  defs: Record<string, { kind: 'variable' } | { kind: 'equation'; id: string; fn: boolean }>;
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Names an expression reads, user functions it calls included (a call may also be a product: a(b + 1)). */
function namesIn(ast: Ast | null): Set<string> {
  if (!ast) return new Set();
  const { names, calls } = referencesOf(ast);
  return new Set([...names, ...calls]);
}

const parsed = new Map<string, ReturnType<typeof tryParse>>();
/** Parse with a small cache: the same expressions are drawn many times a second while a slider moves. */
export function parseCached(src: string): ReturnType<typeof tryParse> {
  const hit = parsed.get(src);
  if (hit) return hit;
  const r = tryParse(src);
  if (parsed.size > 2000) parsed.clear();
  parsed.set(src, r);
  return r;
}

export function evaluateScope(c: Composition): Scope {
  const scope: Scope = { values: {}, fns: {}, results: {}, errors: {}, defs: {} };
  for (const v of c.variables) {
    scope.values[v.name] = v.value;
    scope.defs[v.name] = { kind: 'variable' };
  }
  const eqs = c.primitives.filter((p): p is PrimitiveOf<'equation'> => p.type === 'equation');
  const defining = new Map<string, { p: PrimitiveOf<'equation'>; ast: Ast; reads: Set<string> }>();
  const bare: { p: PrimitiveOf<'equation'>; ast: Ast }[] = [];
  for (const p of eqs) {
    const d = p.data;
    if (!d.expr.trim()) {
      scope.errors[p.id] = 'Write an expression.';
      continue;
    }
    const r = parseCached(d.expr);
    if (!r.ast) {
      scope.errors[p.id] = r.error;
      continue;
    }
    if (!d.name) {
      bare.push({ p, ast: r.ast });
      continue;
    }
    if (own(scope.defs, d.name)) {
      const was = scope.defs[d.name];
      scope.errors[p.id] = was.kind === 'variable' ? `“${d.name}” is already a variable.` : `“${d.name}” is already defined by another equation.`;
      continue;
    }
    if (own(CONSTANTS, d.name.toLowerCase())) {
      scope.errors[p.id] = `“${d.name}” already means a constant.`;
      continue;
    }
    const reads = namesIn(r.ast);
    for (const param of d.params) reads.delete(param);
    scope.defs[d.name] = { kind: 'equation', id: p.id, fn: d.params.length > 0 };
    defining.set(d.name, { p, ast: r.ast, reads });
  }

  // dependency order; a definition on a cycle is an error, and so is anything that depends on one
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done' | 'bad'>();
  const visit = (name: string, path: string[]): boolean => {
    const s = state.get(name);
    if (s === 'done') return true;
    if (s === 'bad') return false;
    if (s === 'visiting') {
      const loop = [...path.slice(path.indexOf(name)), name];
      for (const n of loop) {
        const d = defining.get(n);
        if (d) scope.errors[d.p.id] = `Depends on itself: ${loop.join(' → ')}.`;
        state.set(n, 'bad');
      }
      return false;
    }
    state.set(name, 'visiting');
    const d = defining.get(name)!;
    let fine = true;
    for (const dep of d.reads) if (defining.has(dep) && !visit(dep, [...path, name])) fine = false;
    if (state.get(name) === 'bad') return false;
    if (!fine) {
      scope.errors[d.p.id] ??= 'Depends on an equation that cannot be worked out.';
      state.set(name, 'bad');
      return false;
    }
    state.set(name, 'done');
    order.push(name);
    return true;
  };
  for (const name of defining.keys()) visit(name, []);

  for (const name of order) {
    const d = defining.get(name)!;
    if (d.p.data.params.length) {
      scope.fns[name] = { params: d.p.data.params, ast: d.ast };
      // a function's body is checked by evaluating it once with its parameters at 1, so a misspelt name is said
      // where it is written rather than wherever the function is used
      const locals = Object.fromEntries(d.p.data.params.map((k) => [k, 1]));
      const probe = tryEvaluate(d.ast, { values: scope.values, fns: scope.fns, locals });
      if (probe.error) scope.errors[d.p.id] = probe.error;
      continue;
    }
    const r = tryEvaluate(d.ast, { values: scope.values, fns: scope.fns });
    if (r.error) scope.errors[d.p.id] = r.error;
    scope.values[name] = r.value;
    scope.results[d.p.id] = r.value;
  }
  for (const b of bare) {
    const r = tryEvaluate(b.ast, { values: scope.values, fns: scope.fns });
    if (r.error) scope.errors[b.p.id] = r.error;
    scope.results[b.p.id] = r.value;
  }
  return scope;
}

/** Evaluate an expression written somewhere in the composition, against its scope. */
export function evalIn(scope: Scope, src: string, locals?: Record<string, number>): { value: number; error: string | null } {
  if (!src.trim()) return { value: NaN, error: 'Empty.' };
  const r = parseCached(src);
  if (!r.ast) return { value: NaN, error: r.error };
  return tryEvaluate(r.ast, { values: scope.values, fns: scope.fns, locals });
}

/** Names that an expression reads but nothing defines (offered as variables to make). */
export function undefinedNames(scope: Scope, src: string, locals: string[] = []): string[] {
  const r = parseCached(src);
  if (!r.ast) return [];
  return [...namesIn(r.ast)].filter((n) => !locals.includes(n) && !own(scope.defs, n) && !own(CONSTANTS, n.toLowerCase()));
}

// ── text with live values ───────────────────────────────────────────

export const LIVE_VALUE_RE = /\{\{([^{}]{1,200})\}\}/g;

/** Text with each {{expr}} replaced by its value now. */
export function interpolate(body: string, scope: Scope): string {
  return body.replace(LIVE_VALUE_RE, (_, src: string) => {
    const r = evalIn(scope, src);
    return r.error ? `[${src.trim()}: ${r.error.replace(/\.$/, '')}]` : formatNumber(r.value);
  });
}

// ── tables ──────────────────────────────────────────────────────────

export interface TableCell {
  text: string;
  value: number | null;
  error?: string;
}

const numberOf = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const t = s.replace(/[,\s£$€%]/g, '').replace(/^−/, '-');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * A table's cells as shown: numbers read from what was typed, formulas worked out per row, left to right, from the
 * row's own cells (by column key) and the composition's shared values.
 */
export function computeTable(t: TableData, scope: Scope): Record<string, TableCell>[] {
  const keys = new Set(t.columns.map((c) => c.key));
  return t.rows.map((row) => {
    const out: Record<string, TableCell> = {};
    const locals: Record<string, number> = {};
    for (const col of t.columns) {
      if (col.kind === 'formula') {
        const r = col.expr ? evalIn(scope, col.expr, locals) : { value: NaN, error: 'No formula yet.' };
        // a row whose inputs are not filled in yet is blank, not an error
        const waiting = r.error && /^“(.+)” is not defined\.$/.exec(r.error);
        if (waiting && keys.has(waiting[1])) {
          out[col.id] = { text: '', value: null };
          continue;
        }
        out[col.id] = r.error ? { text: '', value: null, error: r.error } : { text: formatNumber(r.value), value: r.value };
        if (!r.error) locals[col.key] = r.value;
        continue;
      }
      const raw = own(row.cells, col.id) ? row.cells[col.id] : '';
      const n = numberOf(raw);
      out[col.id] = { text: raw, value: n };
      if (n !== null) locals[col.key] = n;
    }
    return out;
  });
}

// ── plots ───────────────────────────────────────────────────────────

export interface PlotCurve {
  id: string;
  label: string;
  style: 'solid' | 'dashed' | 'dotted';
  /** polylines in data coordinates, broken where the function is undefined or jumps */
  segments: [number, number][][];
  points?: [number, number][];
  error?: string;
}
export interface PlotPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  error?: string;
}
export interface PlotSample {
  x: { min: number; max: number };
  y: { min: number; max: number };
  curves: PlotCurve[];
  points: PlotPoint[];
}

/** Sample a plot's series against the scope: `n` samples across x for each function. */
export function samplePlot(d: PlotData, c: Composition, scope: Scope, n = 320): PlotSample {
  const { min: x0, max: x1 } = d.x;
  const curves: PlotCurve[] = [];
  const points: PlotPoint[] = [];
  const ys: number[] = [];
  for (const s of d.series) {
    if (s.kind === 'fn') {
      const label = s.label || `y = ${s.expr}`;
      const r = parseCached(s.expr);
      if (!s.expr.trim() || !r.ast) {
        curves.push({ id: s.id, label, style: s.style, segments: [], error: s.expr.trim() ? r.error ?? 'Not an expression.' : 'Write a function of x.' });
        continue;
      }
      const raw: [number, number][] = [];
      let error: string | undefined;
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        const v = tryEvaluate(r.ast, { values: scope.values, fns: scope.fns, locals: { x } });
        if (v.error) {
          error = v.error;
          break;
        }
        raw.push([x, v.value]);
      }
      if (error) {
        curves.push({ id: s.id, label, style: s.style, segments: [], error });
        continue;
      }
      for (const [, y] of raw) if (Number.isFinite(y)) ys.push(y);
      curves.push({ id: s.id, label, style: s.style, segments: [raw] });
    } else if (s.kind === 'table') {
      const t = c.primitives.find((p): p is PrimitiveOf<'table'> => p.id === s.table && p.type === 'table');
      const label = s.label || (t ? t.label || 'Table' : 'Table');
      if (!t) {
        curves.push({ id: s.id, label, style: s.style, segments: [], error: 'Its table was removed.' });
        continue;
      }
      const xc = t.data.columns.find((col) => col.id === s.x), yc = t.data.columns.find((col) => col.id === s.y);
      if (!xc || !yc) {
        curves.push({ id: s.id, label, style: s.style, segments: [], error: 'Choose the columns to plot.' });
        continue;
      }
      const cells = computeTable(t.data, scope);
      const pts = cells
        .map((row) => [row[xc.id]?.value, row[yc.id]?.value] as const)
        .filter((p): p is [number, number] => p[0] !== null && p[1] !== null && p[0] !== undefined && p[1] !== undefined && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]);
      for (const [, y] of pts) ys.push(y);
      curves.push({ id: s.id, label: s.label || `${yc.name} by ${xc.name}`, style: s.style, segments: s.mark === 'line' ? [pts] : [], points: pts });
    } else {
      const rx = evalIn(scope, s.x), ry = evalIn(scope, s.y);
      const error = rx.error ?? ry.error ?? undefined;
      points.push({ id: s.id, label: s.label, x: rx.value, y: ry.value, ...(error ? { error } : {}) });
      if (!error && Number.isFinite(ry.value)) ys.push(ry.value);
    }
  }

  // the vertical range: as set, or from what is drawn, ignoring the extremes an asymptote throws up
  let y = { min: d.y.min, max: d.y.max };
  if (d.y.auto) {
    if (ys.length) {
      const sorted = [...ys].sort((a, b) => a - b);
      const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))];
      let lo = sorted.length > 20 ? q(0.02) : sorted[0];
      let hi = sorted.length > 20 ? q(0.98) : sorted[sorted.length - 1];
      if (hi - lo < 1e-9) {
        lo -= Math.max(1, Math.abs(lo) * 0.5);
        hi += Math.max(1, Math.abs(hi) * 0.5);
      }
      const pad = (hi - lo) * 0.08;
      y = { min: lo - pad, max: hi + pad };
    } else y = { min: -10, max: 10 };
  }
  // break a function's line where it leaves for infinity or jumps across the plot (tan x at π/2)
  const span = y.max - y.min;
  for (const cv of curves) {
    const out: [number, number][][] = [];
    for (const seg of cv.segments) {
      let cur: [number, number][] = [];
      for (let k = 0; k < seg.length; k++) {
        const p = seg[k];
        if (!Number.isFinite(p[1])) {
          if (cur.length) out.push(cur);
          cur = [];
          continue;
        }
        const prev = cur[cur.length - 1];
        if (prev && Math.abs(p[1] - prev[1]) > span * 2 && Math.sign(p[1] - (y.min + y.max) / 2) !== Math.sign(prev[1] - (y.min + y.max) / 2)) {
          out.push(cur);
          cur = [];
        }
        cur.push(p);
      }
      if (cur.length) out.push(cur);
    }
    cv.segments = out;
  }
  return { x: { min: x0, max: x1 }, y, curves, points };
}

/** Round tick values for an axis. */
export function ticks(min: number, max: number, count = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

// ── references between primitives ───────────────────────────────────

export interface PrimitiveLink {
  from: string;
  to: string;
  kind: 'drives' | 'defines' | 'data' | 'annotates';
  /** the shared name it goes through */
  via?: string;
}

/** The shared names a primitive reads. */
export function namesUsed(p: Primitive): Set<string> {
  const out = new Set<string>();
  const add = (src: string, locals: string[] = []) => {
    const r = parseCached(src);
    if (!r.ast) return;
    for (const n of namesIn(r.ast)) if (!locals.includes(n)) out.add(n);
  };
  switch (p.type) {
    case 'equation':
      add(p.data.expr, p.data.params);
      break;
    case 'plot':
      for (const s of p.data.series) {
        if (s.kind === 'fn') add(s.expr, ['x']);
        else if (s.kind === 'point') (add(s.x), add(s.y));
      }
      break;
    case 'table': {
      const keys = p.data.columns.map((c) => c.key);
      for (const c of p.data.columns) if (c.kind === 'formula' && c.expr) add(c.expr, keys);
      break;
    }
    case 'text':
      if (p.data.live !== false) for (const m of p.data.body.matchAll(LIVE_VALUE_RE)) add(m[1]);
      break;
    default:
      break;
  }
  return out;
}

/** Which primitive depends on which, and through what. */
export function linksOf(c: Composition): PrimitiveLink[] {
  const providers = new Map<string, { id: string; kind: 'drives' | 'defines' }[]>();
  const give = (name: string, id: string, kind: 'drives' | 'defines') => providers.set(name, [...(providers.get(name) ?? []), { id, kind }]);
  for (const p of c.primitives) {
    if (p.type === 'control' && p.data.variable) give(p.data.variable, p.id, 'drives');
    if (p.type === 'equation' && p.data.name) give(p.data.name, p.id, 'defines');
  }
  const out: PrimitiveLink[] = [];
  const seen = new Set<string>();
  const push = (l: PrimitiveLink) => {
    const k = `${l.from}>${l.to}>${l.kind}`;
    if (seen.has(k) || l.from === l.to) return;
    seen.add(k);
    out.push(l);
  };
  for (const p of c.primitives) {
    for (const name of namesUsed(p)) for (const pr of providers.get(name) ?? []) push({ from: pr.id, to: p.id, kind: pr.kind, via: name });
    if (p.type === 'plot') for (const s of p.data.series) if (s.kind === 'table') push({ from: s.table, to: p.id, kind: 'data' });
    if (p.type === 'text' && p.data.target) push({ from: p.id, to: p.data.target, kind: 'annotates' });
  }
  return out;
}

/** Everything that changes when `id` changes, following references (for highlighting what a control moves). */
export function downstreamOf(links: PrimitiveLink[], id: string): Set<string> {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const at = queue.shift()!;
    for (const l of links) if (l.from === at && l.kind !== 'annotates' && !out.has(l.to)) (out.add(l.to), queue.push(l.to));
  }
  return out;
}

// ── in words ────────────────────────────────────────────────────────

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plain = (s: string) => s.replace(/[#*_`>]+/g, '').replace(/\s+/g, ' ').trim();

/** What a composition holds, in a few words: "a plot, a table and 2 controls". */
export function summarize(c: Composition): string {
  if (!c.primitives.length) return 'Empty';
  const counts = new Map<string, number>();
  for (const p of c.primitives) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const plural: Record<Primitive['type'], string> = { text: 'text blocks', equation: 'equations', control: 'controls', plot: 'plots', table: 'tables', graph: 'relationship graphs', diagram: 'diagrams', media: 'media' };
  const parts = [...counts.entries()].map(([t, n]) => (n === 1 ? PRIMITIVE_LABEL[t as Primitive['type']].toLowerCase() : `${n} ${plural[t as Primitive['type']]}`));
  const s = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return s[0].toUpperCase() + s.slice(1);
}

/** One primitive in a sentence, from its state now. */
export function describePrimitive(p: Primitive, c: Composition, scope: Scope): string {
  const name = p.label ? ` “${p.label}”` : '';
  const err = scope.errors[p.id] ? ` (problem: ${scope.errors[p.id]})` : '';
  switch (p.type) {
    case 'text': {
      const body = plain(p.data.live === false ? p.data.body : interpolate(p.data.body, scope));
      const what = p.data.style === 'annotation' ? 'Annotation' : p.data.style === 'note' ? 'Note' : p.data.style === 'callout' ? 'Callout' : 'Text';
      const target = p.data.target ? c.primitives.find((x) => x.id === p.data.target) : undefined;
      return `${what}${name}${target ? ` on the ${PRIMITIVE_LABEL[target.type].toLowerCase()}${target.label ? ` “${target.label}”` : ''}` : ''}: ${body || '(empty)'}`;
    }
    case 'equation': {
      const d = p.data;
      const head = d.name ? `${d.name}${d.params.length ? `(${d.params.join(', ')})` : ''} = ` : '';
      const value = !d.params.length && Number.isFinite(scope.results[p.id]) ? ` = ${formatNumber(scope.results[p.id])}` : '';
      return `Equation${name}: ${head}${d.expr}${value}${err}`;
    }
    case 'control': {
      const v = c.variables.find((x) => x.name === p.data.variable);
      if (!v) return `Control${name} bound to “${p.data.variable || 'nothing'}”, which is not a variable`;
      return v.kind === 'boolean'
        ? `Toggle${name} for ${v.name}: ${v.value ? 'on' : 'off'}`
        : `${p.data.kind === 'slider' ? 'Slider' : p.data.kind === 'choice' ? 'Choice' : 'Number field'}${name} for ${v.name}: ${formatNumber(v.value)}${v.unit ? ` ${v.unit}` : ''} (range ${formatNumber(v.min)} to ${formatNumber(v.max)})`;
    }
    case 'plot': {
      const smp = samplePlot(p.data, c, scope, 60);
      const parts = p.data.series.map((s) => {
        if (s.kind === 'fn') return `y = ${s.expr}`;
        if (s.kind === 'table') {
          const cv = smp.curves.find((x) => x.id === s.id);
          return `data “${cv?.label ?? 'table'}” (${cv?.points?.length ?? 0} points)`;
        }
        const pt = smp.points.find((x) => x.id === s.id);
        return pt && !pt.error ? `point ${s.label || ''} at (${formatNumber(pt.x)}, ${formatNumber(pt.y)})`.replace('  ', ' ') : `point ${s.label}`;
      });
      return `Plot${name} for x from ${formatNumber(p.data.x.min)} to ${formatNumber(p.data.x.max)}${p.data.x.label ? ` (${p.data.x.label})` : ''}, y ${p.data.y.auto ? 'fitted' : `from ${formatNumber(p.data.y.min)} to ${formatNumber(p.data.y.max)}`}: ${parts.join('; ') || 'nothing plotted yet'}`;
    }
    case 'table': {
      const cols = p.data.columns.map((col) => (col.kind === 'formula' ? `${col.name} = ${col.expr ?? ''}` : col.name));
      const cells = computeTable(p.data, scope);
      const rows = cells
        .slice(0, 3)
        .map((row) => p.data.columns.map((col) => row[col.id]?.error ? '?' : row[col.id]?.text || '—').join(', '));
      return `Table${name} with columns ${cols.join(' | ')}; ${p.data.rows.length} row${p.data.rows.length === 1 ? '' : 's'}${rows.length ? `: ${rows.map((r) => `[${r}]`).join(' ')}${p.data.rows.length > 3 ? ' …' : ''}` : ''}`;
    }
    case 'graph': {
      const label = new Map(p.data.nodes.map((n) => [n.id, n.label]));
      const edges = p.data.edges.map((e) => `${label.get(e.from)} ${e.directed ? '→' : '—'} ${label.get(e.to)}${e.label ? ` (${e.label})` : ''}`);
      const lone = p.data.nodes.filter((n) => !p.data.edges.some((e) => e.from === n.id || e.to === n.id)).map((n) => n.label);
      return `Relationship graph${name}: ${[...edges, ...lone].join('; ') || 'empty'}`;
    }
    case 'diagram': {
      const label = new Map(p.data.shapes.map((s) => [s.id, plain(s.label) || s.kind]));
      const flows = p.data.connectors.map((k) => `${label.get(k.from)} ${k.end === 'none' ? '—' : k.end === 'both' ? '↔' : '→'} ${label.get(k.to)}${k.label ? ` (${k.label})` : ''}`);
      return `Diagram${name}: ${flows.join('; ') || p.data.shapes.map((s) => plain(s.label)).filter(Boolean).join(', ') || 'empty'}`;
    }
    case 'media': {
      const d = p.data;
      const what = d.src ? (d.src.kind === 'upload' ? 'an uploaded image' : `an image from ${d.src.url}`) : 'no image yet';
      return `Media${name}: ${what}${d.caption ? ` — ${plain(d.caption)}` : d.alt ? ` — ${d.alt}` : ''}${d.source ? ` (source: ${d.source.label})` : ''}`;
    }
  }
}

/**
 * What an artifact holds and shows now, in plain lines for the assistant (the "this" of a question asked about it):
 * the shared variables first, then the equations and controls, then plots and tables, then everything else, each
 * group in reading order (top to bottom, left to right).
 */
export function describeComposition(c: Composition, scope: Scope = evaluateScope(c), maxLines = 12, width = 220): string[] {
  const lines: string[] = [];
  if (c.variables.length)
    lines.push(cut(`Shared variables: ${c.variables.map((v) => (v.kind === 'boolean' ? `${v.name} = ${v.value ? 'on' : 'off'}` : `${v.name} = ${formatNumber(v.value)}${v.unit ? ` ${v.unit}` : ''}`)).join(', ')}`, width));
  // the model first (what defines and moves the shared values), then what shows it, then the rest — each in reading
  // order, top to bottom and left to right — so a large artifact's lines are spent where they say most
  const rank: Record<Primitive['type'], number> = { equation: 0, control: 0, plot: 1, table: 1, text: 2, graph: 2, diagram: 2, media: 2 };
  const reading = [...c.primitives].sort((a, b) => rank[a.type] - rank[b.type] || a.y - b.y || a.x - b.x);
  for (const p of reading) {
    if (lines.length >= maxLines) break;
    lines.push(cut(describePrimitive(p, c, scope), width));
  }
  const more = ' (and more)';
  if (reading.length && lines.length >= maxLines && reading.length > maxLines - (c.variables.length ? 1 : 0)) lines[lines.length - 1] = `${cut(lines[lines.length - 1], width - more.length)}${more}`;
  return lines;
}
