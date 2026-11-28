// lib/new-logos/primitives.ts — VISUAL PRIMITIVES and the COMPOSITIONS they make: the data, never the drawing.
//
// An artifact (an artifact node, lib/new-logos/model.ts) is a persistent COMPOSITION of one or more primitives and the
// shared VARIABLES they read. Each primitive has a persistent identity (an id unique in its artifact), a type, a place
// and a size on the artifact's own plane, an optional label, and structured content that depends on its type:
//
//   text      Markdown, notes, callouts and annotations (an annotation points at another primitive); {{expr}} in the
//             text is a live value.
//   graph     a relationship graph: labelled concepts and the typed, optionally directed relationships between them.
//   plot      Cartesian axes with functions of x, data series read from a table, and points worked out from variables.
//   table     columns of text, numbers or formulas (worked out per row from the row and the shared variables), and rows.
//   equation  a named definition (revenue = price · quantity), a function (f(x) = a x² + b) or a bare expression;
//             definitions become shared values other primitives read.
//   control   a slider, number field, toggle or choice bound to a shared variable.
//   diagram   shapes, connectors and labels: processes and structures.
//   media     an image, uploaded (kept privately under the account) or by address, with its caption and source.
//
// Everything here is JSON a person or a program can read and check. HTML is never the canonical form of a primitive:
// renderers (components/new-logos/primitives/) draw from this, and every change arrives as a validated operation
// (lib/new-logos/artifact-ops.ts). The shared-state rules — what reads what, and what a value is — are in compose.ts.
//
// Pure: no I/O.

import { cleanText, cleanUrl } from './clean';
import { EXPR_LIMITS, IDENT_RE, isIdent } from './expr';

export const PRIMITIVE_TYPES = ['text', 'equation', 'control', 'plot', 'table', 'graph', 'diagram', 'media'] as const;
export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];
export const isPrimitiveType = (v: unknown): v is PrimitiveType => typeof v === 'string' && (PRIMITIVE_TYPES as readonly string[]).includes(v);

export const PRIMITIVE_LABEL: Record<PrimitiveType, string> = {
  text: 'Text',
  equation: 'Equation',
  control: 'Control',
  plot: 'Plot',
  table: 'Table',
  graph: 'Relationship graph',
  diagram: 'Diagram',
  media: 'Media',
};

export const PRIMITIVE_LIMITS = {
  primitives: 200,
  variables: 64,
  label: 120,
  /** as long as a document could be before compositions, so nothing written then is cut */
  text: 100_000,
  coord: 1_000_000,
  minW: 120,
  minH: 48,
  maxSize: 4000,
  graphNodes: 150,
  graphEdges: 300,
  shapes: 150,
  connectors: 300,
  series: 8,
  columns: 24,
  rows: 400,
  cell: 500,
  options: 12,
  params: 4,
  /** the whole composition, as JSON */
  bytes: 240_000,
} as const;

export const DEFAULT_SIZE: Record<PrimitiveType, { w: number; h: number }> = {
  text: { w: 340, h: 150 },
  equation: { w: 340, h: 132 },
  control: { w: 300, h: 92 },
  plot: { w: 500, h: 340 },
  table: { w: 460, h: 240 },
  graph: { w: 480, h: 320 },
  diagram: { w: 560, h: 300 },
  media: { w: 380, h: 300 },
};

// ── the shapes ───────────────────────────────────────────────────────

export interface Variable {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  kind: 'number' | 'boolean';
  label?: string;
  unit?: string;
}

export type TextStyle = 'plain' | 'note' | 'callout' | 'annotation';
export interface TextData {
  body: string;
  style: TextStyle;
  /** an annotation's subject: another primitive's id */
  target?: string;
  /** false: {{…}} is shown as written, not as a live value (text written before live values existed) */
  live?: false;
}

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  note?: string;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  directed: boolean;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type PlotSeries =
  | { id: string; kind: 'fn'; expr: string; label: string; style: LineStyle }
  | { id: string; kind: 'table'; table: string; x: string; y: string; label: string; mark: 'line' | 'points'; style: LineStyle }
  | { id: string; kind: 'point'; x: string; y: string; label: string };
export interface PlotData {
  x: { min: number; max: number; label: string };
  y: { min: number; max: number; label: string; auto: boolean };
  grid: boolean;
  series: PlotSeries[];
}

export type ColumnKind = 'text' | 'number' | 'formula';
export interface TableColumn {
  id: string;
  name: string;
  /** the name formulas use for it */
  key: string;
  kind: ColumnKind;
  expr?: string;
}
export interface TableRow {
  id: string;
  cells: Record<string, string>;
}
export interface TableData {
  columns: TableColumn[];
  rows: TableRow[];
}

export interface EquationData {
  /** the name it defines ('' for a bare expression) */
  name: string;
  /** a function's parameters: f(x) = … */
  params: string[];
  expr: string;
}

export type ControlKind = 'slider' | 'number' | 'toggle' | 'choice';
export interface ControlData {
  variable: string;
  kind: ControlKind;
  options: { label: string; value: number }[];
}

export type ShapeKind = 'box' | 'round' | 'ellipse' | 'diamond' | 'text';
export interface DiagramShape {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}
export interface DiagramConnector {
  id: string;
  from: string;
  to: string;
  label: string;
  end: 'arrow' | 'none' | 'both';
  style: 'solid' | 'dashed';
}
export interface DiagramData {
  shapes: DiagramShape[];
  connectors: DiagramConnector[];
}

export type MediaSrc = { kind: 'upload'; id: string } | { kind: 'url'; url: string };
export interface MediaData {
  src: MediaSrc | null;
  alt: string;
  caption: string;
  source?: { label: string; url?: string };
  fit: 'contain' | 'cover';
}

export interface DataOf {
  text: TextData;
  equation: EquationData;
  control: ControlData;
  plot: PlotData;
  table: TableData;
  graph: GraphData;
  diagram: DiagramData;
  media: MediaData;
}

export type Primitive = { [K in PrimitiveType]: { id: string; type: K; x: number; y: number; w: number; h: number; label: string; data: DataOf[K] } }[PrimitiveType];
export type PrimitiveOf<K extends PrimitiveType> = Extract<Primitive, { type: K }>;

export interface Composition {
  subtype: 'composition';
  v: 2;
  primitives: Primitive[];
  variables: Variable[];
}

export const EMPTY_COMPOSITION: Composition = { subtype: 'composition', v: 2, primitives: [], variables: [] };

// ── ids ──────────────────────────────────────────────────────────────

export const PRIMITIVE_ID_RE = /^p_[A-Za-z0-9]{2,24}$/;
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
/** A part's id that is also the name of something every JavaScript object has would read as that thing. */
const PROTO = new Set(Object.getOwnPropertyNames(Object.prototype));
const goodItemId = (v: unknown): v is string => typeof v === 'string' && ITEM_ID_RE.test(v) && !PROTO.has(v);
export const MEDIA_ID_RE = /^[a-f0-9]{32}$/;

function rnd(n: number): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(b);
  else for (let k = 0; k < n; k++) b[k] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => a[x % a.length]).join('');
}
export const newPrimitiveId = () => `p_${rnd(12)}`;
/** an id for a part inside a primitive (a graph node, a row, a shape) */
export const newItemId = (prefix: string) => `${prefix}${rnd(8)}`;

// ── cleaning ─────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const coord = (v: unknown, d = 0) => (finite(v) ? Math.round(clamp(v, -PRIMITIVE_LIMITS.coord, PRIMITIVE_LIMITS.coord)) : d);
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => ((allowed as readonly string[]).includes(v as string) ? (v as T) : d);
const exprText = (v: unknown) => cleanText(v, EXPR_LIMITS.length);
const itemId = (v: unknown, seen: Set<string>, prefix: string): string => {
  let id = goodItemId(v) ? v : newItemId(prefix);
  while (seen.has(id)) id = newItemId(prefix);
  seen.add(id);
  return id;
};

/** A name formulas can use, from what a person called something: "Unit price (£)" → unit_price. */
export function keyFrom(name: string, taken: Set<string>): string {
  let base = name
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/^[^a-z_]+/, '')
    .slice(0, 28);
  if (!isIdent(base)) base = base ? `${base}_` : 'col';
  if (!IDENT_RE.test(base)) base = 'col';
  let key = base;
  for (let n = 2; taken.has(key) || !isIdent(key); n++) key = `${base}${n}`;
  return key;
}

export function sanitizeVariable(raw: unknown): Variable | null {
  const r = obj(raw);
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!isIdent(name)) return null;
  const kind = pick(r.kind, ['number', 'boolean'] as const, 'number');
  const out: Variable = kind === 'boolean'
    ? { name, kind, value: finite(r.value) && r.value !== 0 ? 1 : 0, min: 0, max: 1, step: 1 }
    : (() => {
        const value = finite(r.value) ? clamp(r.value, -1e12, 1e12) : 0;
        let min = finite(r.min) ? clamp(r.min, -1e12, 1e12) : Math.min(0, value);
        let max = finite(r.max) ? clamp(r.max, -1e12, 1e12) : Math.max(10, value);
        if (!(max > min)) {
          min = Math.min(min, value);
          max = min + Math.max(1, Math.abs(min));
        }
        const step = finite(r.step) && r.step > 0 && r.step <= max - min ? r.step : niceStep(max - min);
        return { name, kind, value, min, max, step };
      })();
  const label = cleanText(r.label, 60);
  if (label) out.label = label;
  const unit = cleanText(r.unit, 20);
  if (unit) out.unit = unit;
  return out;
}

/** A step that makes a slider move in round numbers: about a hundredth of the range. */
export function niceStep(range: number): number {
  if (!(range > 0)) return 1;
  const raw = range / 100;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function sanitizeData(type: PrimitiveType, raw: unknown): DataOf[PrimitiveType] {
  const r = obj(raw);
  switch (type) {
    case 'text': {
      const out: TextData = { body: cleanText(r.body, PRIMITIVE_LIMITS.text, { multiline: true }), style: pick(r.style, ['plain', 'note', 'callout', 'annotation'] as const, 'plain') };
      if (typeof r.target === 'string' && PRIMITIVE_ID_RE.test(r.target)) out.target = r.target;
      if (r.live === false) out.live = false;
      return out;
    }
    case 'equation': {
      const name = typeof r.name === 'string' && isIdent(r.name.trim()) ? r.name.trim() : '';
      const params = name
        ? [...new Set(arr(r.params).filter((p): p is string => isIdent(p) && p !== name))].slice(0, PRIMITIVE_LIMITS.params)
        : [];
      return { name, params, expr: exprText(r.expr) };
    }
    case 'control': {
      const options = arr(r.options)
        .map((o) => obj(o))
        .filter((o) => finite(o.value))
        .map((o) => ({ label: cleanText(o.label, 40) || String(o.value), value: o.value as number }))
        .slice(0, PRIMITIVE_LIMITS.options);
      return { variable: typeof r.variable === 'string' && isIdent(r.variable) ? r.variable : '', kind: pick(r.kind, ['slider', 'number', 'toggle', 'choice'] as const, 'slider'), options };
    }
    case 'plot': {
      const x = obj(r.x), y = obj(r.y);
      let xmin = finite(x.min) ? x.min : -10, xmax = finite(x.max) ? x.max : 10;
      if (!(xmax > xmin)) [xmin, xmax] = [-10, 10];
      let ymin = finite(y.min) ? y.min : -10, ymax = finite(y.max) ? y.max : 10;
      if (!(ymax > ymin)) [ymin, ymax] = [-10, 10];
      const seen = new Set<string>();
      const series: PlotSeries[] = [];
      for (const s of arr(r.series).map(obj)) {
        if (series.length >= PRIMITIVE_LIMITS.series) break;
        const id = itemId(s.id, seen, 's');
        const label = cleanText(s.label, 60);
        const style = pick(s.style, ['solid', 'dashed', 'dotted'] as const, 'solid');
        if (s.kind === 'table') {
          if (typeof s.table !== 'string' || !PRIMITIVE_ID_RE.test(s.table)) continue;
          series.push({ id, kind: 'table', table: s.table, x: goodItemId(s.x) ? s.x : '', y: goodItemId(s.y) ? s.y : '', label, mark: pick(s.mark, ['line', 'points'] as const, 'points'), style });
        } else if (s.kind === 'point') {
          series.push({ id, kind: 'point', x: exprText(s.x), y: exprText(s.y), label });
        } else {
          series.push({ id, kind: 'fn', expr: exprText(s.expr), label, style });
        }
      }
      return {
        x: { min: xmin, max: xmax, label: cleanText(x.label, 60) },
        y: { min: ymin, max: ymax, label: cleanText(y.label, 60), auto: y.auto !== false },
        grid: r.grid !== false,
        series,
      };
    }
    case 'table': {
      const seen = new Set<string>();
      const keys = new Set<string>();
      const columns: TableColumn[] = [];
      for (const c of arr(r.columns).map(obj)) {
        if (columns.length >= PRIMITIVE_LIMITS.columns) break;
        const id = itemId(c.id, seen, 'c');
        const name = cleanText(c.name, 60) || `Column ${columns.length + 1}`;
        const key = typeof c.key === 'string' && isIdent(c.key) && !keys.has(c.key) ? c.key : keyFrom(name, keys);
        keys.add(key);
        const kind = pick(c.kind, ['text', 'number', 'formula'] as const, 'text');
        columns.push(kind === 'formula' ? { id, name, key, kind, expr: exprText(c.expr) } : { id, name, key, kind });
      }
      const live = new Set(columns.filter((c) => c.kind !== 'formula').map((c) => c.id));
      const rowSeen = new Set<string>();
      const rows: TableRow[] = arr(r.rows)
        .slice(0, PRIMITIVE_LIMITS.rows)
        .map(obj)
        .map((row) => {
          const cells: Record<string, string> = {};
          for (const [k, v] of Object.entries(obj(row.cells))) {
            if (!live.has(k) || PROTO.has(k)) continue;
            const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : cleanText(v, PRIMITIVE_LIMITS.cell);
            if (s) cells[k] = s;
          }
          return { id: itemId(row.id, rowSeen, 'r'), cells };
        });
      return { columns, rows };
    }
    case 'graph': {
      const seen = new Set<string>();
      const nodes: GraphNode[] = arr(r.nodes)
        .slice(0, PRIMITIVE_LIMITS.graphNodes)
        .map(obj)
        .map((n) => {
          const out: GraphNode = { id: itemId(n.id, seen, 'g'), label: cleanText(n.label, 120) || 'Concept', x: Math.round(clamp(finite(n.x) ? n.x : 0, -10_000, 10_000)), y: Math.round(clamp(finite(n.y) ? n.y : 0, -10_000, 10_000)) };
          const note = cleanText(n.note, 500, { multiline: true });
          if (note) out.note = note;
          return out;
        });
      const ids = new Set(nodes.map((n) => n.id));
      const eseen = new Set<string>();
      const edges: GraphEdge[] = arr(r.edges)
        .map(obj)
        .filter((e) => typeof e.from === 'string' && typeof e.to === 'string' && ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
        .slice(0, PRIMITIVE_LIMITS.graphEdges)
        .map((e) => ({ id: itemId(e.id, eseen, 'e'), from: e.from as string, to: e.to as string, label: cleanText(e.label, 80), directed: e.directed !== false }));
      return { nodes, edges };
    }
    case 'diagram': {
      const seen = new Set<string>();
      const shapes: DiagramShape[] = arr(r.shapes)
        .slice(0, PRIMITIVE_LIMITS.shapes)
        .map(obj)
        .map((s) => ({
          id: itemId(s.id, seen, 'h'),
          kind: pick(s.kind, ['box', 'round', 'ellipse', 'diamond', 'text'] as const, 'box'),
          x: Math.round(clamp(finite(s.x) ? s.x : 0, -10_000, 10_000)),
          y: Math.round(clamp(finite(s.y) ? s.y : 0, -10_000, 10_000)),
          w: Math.round(clamp(finite(s.w) ? s.w : 120, 24, 2000)),
          h: Math.round(clamp(finite(s.h) ? s.h : 56, 20, 2000)),
          label: cleanText(s.label, 200, { multiline: true }),
        }));
      const ids = new Set(shapes.map((s) => s.id));
      const cseen = new Set<string>();
      const connectors: DiagramConnector[] = arr(r.connectors)
        .map(obj)
        .filter((c) => typeof c.from === 'string' && typeof c.to === 'string' && ids.has(c.from) && ids.has(c.to) && c.from !== c.to)
        .slice(0, PRIMITIVE_LIMITS.connectors)
        .map((c) => ({ id: itemId(c.id, cseen, 'k'), from: c.from as string, to: c.to as string, label: cleanText(c.label, 80), end: pick(c.end, ['arrow', 'none', 'both'] as const, 'arrow'), style: pick(c.style, ['solid', 'dashed'] as const, 'solid') }));
      return { shapes, connectors };
    }
    case 'media': {
      const s = obj(r.src);
      const src: MediaSrc | null =
        s.kind === 'upload' && typeof s.id === 'string' && MEDIA_ID_RE.test(s.id)
          ? { kind: 'upload', id: s.id }
          : s.kind === 'url' && cleanUrl(s.url)
            ? { kind: 'url', url: cleanUrl(s.url)! }
            : null;
      const out: MediaData = { src, alt: cleanText(r.alt, 300), caption: cleanText(r.caption, 500, { multiline: true }), fit: pick(r.fit, ['contain', 'cover'] as const, 'contain') };
      const so = obj(r.source);
      const label = cleanText(so.label, 200);
      const url = cleanUrl(so.url);
      if (label || url) out.source = { label: label || url!, ...(url ? { url } : {}) };
      return out;
    }
  }
}

/** One primitive, checked: null when it is not one. Its id is kept when it is well formed, else made. */
export function sanitizePrimitive(raw: unknown): Primitive | null {
  const r = obj(raw);
  if (!isPrimitiveType(r.type)) return null;
  const type = r.type;
  const d = DEFAULT_SIZE[type];
  return {
    id: typeof r.id === 'string' && PRIMITIVE_ID_RE.test(r.id) ? r.id : newPrimitiveId(),
    type,
    x: coord(r.x),
    y: coord(r.y),
    w: Math.round(clamp(finite(r.w) ? r.w : d.w, PRIMITIVE_LIMITS.minW, PRIMITIVE_LIMITS.maxSize)),
    h: Math.round(clamp(finite(r.h) ? r.h : d.h, PRIMITIVE_LIMITS.minH, PRIMITIVE_LIMITS.maxSize)),
    label: cleanText(r.label, PRIMITIVE_LIMITS.label),
    data: sanitizeData(type, r.data),
  } as Primitive;
}

/** The data of a primitive of a given type, checked (for an operation that replaces or patches it). */
export const sanitizePrimitiveData = <K extends PrimitiveType>(type: K, raw: unknown): DataOf[K] => sanitizeData(type, raw) as DataOf[K];

/**
 * What an artifact holds, checked. Content written before compositions existed (a Markdown document,
 * `{ subtype: 'document', body }`) is read as a composition of one text primitive with a fixed id, so the same
 * artifact means the same thing before and after its first save.
 */
export function sanitizeComposition(raw: unknown): Composition {
  const r = obj(raw);
  if (!Array.isArray(r.primitives)) {
    const body = cleanText(r.body, PRIMITIVE_LIMITS.text, { multiline: true });
    // its {{…}} were written as text, so they stay text
    return { ...EMPTY_COMPOSITION, primitives: body ? [{ id: 'p_body', type: 'text', x: 0, y: 0, w: 640, h: 420, label: '', data: { body, style: 'plain', ...(body.includes('{{') ? { live: false as const } : {}) } }] : [] };
  }
  const seen = new Set<string>();
  const primitives: Primitive[] = [];
  for (const p of r.primitives) {
    if (primitives.length >= PRIMITIVE_LIMITS.primitives) break;
    const clean = sanitizePrimitive(p);
    if (!clean) continue;
    while (seen.has(clean.id)) clean.id = newPrimitiveId();
    seen.add(clean.id);
    primitives.push(clean);
  }
  // references to primitives that are not here are dropped: an annotation's subject, a plot's table
  for (const p of primitives) {
    if (p.type === 'text' && p.data.target && (!seen.has(p.data.target) || p.data.target === p.id)) delete p.data.target;
    if (p.type === 'plot') p.data.series = p.data.series.filter((s) => s.kind !== 'table' || seen.has(s.table));
  }
  const names = new Set<string>();
  const variables: Variable[] = [];
  for (const v of arr(r.variables)) {
    if (variables.length >= PRIMITIVE_LIMITS.variables) break;
    const clean = sanitizeVariable(v);
    if (!clean || names.has(clean.name)) continue;
    names.add(clean.name);
    variables.push(clean);
  }
  return { subtype: 'composition', v: 2, primitives, variables };
}

export const compositionBytes = (c: Composition) => JSON.stringify(c).length;

/** Every uploaded picture a composition shows (for keeping or releasing the bytes). */
export const mediaIdsOf = (c: Composition): string[] =>
  c.primitives.flatMap((p) => (p.type === 'media' && p.data.src?.kind === 'upload' ? [p.data.src.id] : []));

// ── starting points ──────────────────────────────────────────────────

/** A name not yet used in a composition, from a list of the usual ones. */
export function freeName(c: Composition, wanted: string[] = ['a', 'b', 'c', 'k', 'n', 'm', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w']): string {
  const used = new Set<string>([...c.variables.map((v) => v.name), ...c.primitives.flatMap((p) => (p.type === 'equation' && p.data.name ? [p.data.name] : []))]);
  for (const w of wanted) if (!used.has(w) && isIdent(w)) return w;
  for (let n = 1; ; n++) if (!used.has(`v${n}`)) return `v${n}`;
}

/** A new primitive of a type, with content that already shows what it is for. */
export function newPrimitive<K extends PrimitiveType>(type: K, at: { x: number; y: number }, data?: Partial<DataOf[K]>): PrimitiveOf<K> {
  const size = DEFAULT_SIZE[type];
  const base: Record<PrimitiveType, unknown> = {
    text: { body: '', style: 'plain' },
    equation: { name: 'f', params: ['x'], expr: 'x^2' },
    control: { variable: '', kind: 'slider', options: [] },
    plot: { x: { min: -10, max: 10, label: '' }, y: { min: -10, max: 10, label: '', auto: true }, grid: true, series: [{ id: 's1', kind: 'fn', expr: 'sin(x)', label: '', style: 'solid' }] },
    table: {
      columns: [
        { id: 'c1', name: 'Item', key: 'item', kind: 'text' },
        { id: 'c2', name: 'Value', key: 'value', kind: 'number' },
      ],
      rows: [{ id: 'r1', cells: {} }, { id: 'r2', cells: {} }, { id: 'r3', cells: {} }],
    },
    graph: {
      nodes: [
        { id: 'g1', label: 'Cause', x: 90, y: 150 },
        { id: 'g2', label: 'Effect', x: 330, y: 90 },
        { id: 'g3', label: 'Side effect', x: 330, y: 220 },
      ],
      edges: [
        { id: 'e1', from: 'g1', to: 'g2', label: 'leads to', directed: true },
        { id: 'e2', from: 'g1', to: 'g3', label: 'also', directed: true },
      ],
    },
    diagram: {
      shapes: [
        { id: 'h1', kind: 'round', x: 24, y: 110, w: 120, h: 52, label: 'Start' },
        { id: 'h2', kind: 'box', x: 210, y: 110, w: 130, h: 52, label: 'Step' },
        { id: 'h3', kind: 'round', x: 406, y: 110, w: 120, h: 52, label: 'End' },
      ],
      connectors: [
        { id: 'k1', from: 'h1', to: 'h2', label: '', end: 'arrow', style: 'solid' },
        { id: 'k2', from: 'h2', to: 'h3', label: '', end: 'arrow', style: 'solid' },
      ],
    },
    media: { src: null, alt: '', caption: '', fit: 'contain' },
  };
  const raw = { id: newPrimitiveId(), type, x: at.x, y: at.y, w: size.w, h: size.h, label: '', data: { ...(base[type] as object), ...(data ?? {}) } };
  return sanitizePrimitive(raw) as PrimitiveOf<K>;
}

export const STARTERS = ['text', 'model', 'plot', 'table', 'equation', 'control', 'graph', 'diagram', 'media', 'empty'] as const;
export type Starter = (typeof STARTERS)[number];
export const STARTER_LABEL: Record<Starter, string> = {
  text: 'Text',
  model: 'Model: equation, controls and plot',
  plot: 'Plot',
  table: 'Table',
  equation: 'Equation',
  control: 'Control',
  graph: 'Relationship graph',
  diagram: 'Diagram',
  media: 'Media',
  empty: 'Empty',
};

/** What a new artifact begins as. `text` is written into a text primitive when one is made. */
export function starterComposition(kind: Starter, text = ''): Composition {
  return sanitizeComposition(starterRaw(kind, text));
}

function starterRaw(kind: Starter, text: string): Composition {
  const c: Composition = { ...EMPTY_COMPOSITION, primitives: [], variables: [] };
  const at = { x: 0, y: 0 };
  switch (kind) {
    case 'empty':
      return c;
    case 'text':
      c.primitives.push(newPrimitive('text', at, { body: text }));
      return c;
    case 'control': {
      const name = freeName(c);
      c.variables.push({ name, value: 1, min: 0, max: 10, step: 0.1, kind: 'number' });
      c.primitives.push(newPrimitive('control', at, { variable: name }));
      return c;
    }
    case 'model': {
      c.variables.push({ name: 'a', value: 1, min: -3, max: 3, step: 0.1, kind: 'number' }, { name: 'b', value: 0, min: -5, max: 5, step: 0.1, kind: 'number' });
      const ca = newPrimitive('control', { x: 0, y: 0 }, { variable: 'a' });
      const cb = newPrimitive('control', { x: 0, y: 108 }, { variable: 'b' });
      const eq = newPrimitive('equation', { x: 0, y: 216 }, { name: 'f', params: ['x'], expr: 'a x^2 + b' });
      const plot = newPrimitive('plot', { x: 340, y: 0 }, {
        x: { min: -5, max: 5, label: 'x' },
        y: { min: -10, max: 10, label: 'f(x)', auto: false },
        series: [
          { id: 's1', kind: 'fn', expr: 'f(x)', label: 'f(x)', style: 'solid' },
          { id: 's2', kind: 'point', x: '2', y: 'f(2)', label: 'f(2)' },
        ],
      });
      const note = newPrimitive('text', { x: 0, y: 364 }, { body: text || 'Move **a** and **b**: the curve and this value follow. f(2) = {{f(2)}}', style: 'note' });
      eq.w = 320;
      note.w = 320;
      note.h = 112;
      c.primitives.push(ca, cb, eq, plot, note);
      return c;
    }
    default: {
      const p = newPrimitive(kind, at);
      if (kind === 'equation' && text) (p as PrimitiveOf<'equation'>).label = text.slice(0, PRIMITIVE_LIMITS.label);
      c.primitives.push(p);
      return c;
    }
  }
}

/** Primitives' outer bounds on the artifact plane. */
export function boundsOf(ps: readonly Primitive[]): { x: number; y: number; w: number; h: number } | null {
  if (!ps.length) return null;
  const x0 = Math.min(...ps.map((p) => p.x)), y0 = Math.min(...ps.map((p) => p.y));
  const x1 = Math.max(...ps.map((p) => p.x + p.w)), y1 = Math.max(...ps.map((p) => p.y + p.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
