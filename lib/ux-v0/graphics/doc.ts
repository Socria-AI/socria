// lib/ux-v0/graphics/doc.ts — the graphics document: what a poster, a carousel, a card or a cover IS, as data.
//
// A graphic is never stored as a picture of itself. It is a versioned, serializable scene graph that no renderer owns:
//
//   document  → artboards (each its own size, units, resolution, background, bleed, safe area)
//             → nodes, in drawing order: text, shape, image, group (nested), chart
//             → assets (pictures, by id) and tokens (the direction's colours and faces)
//
// Every node has a stable id, a role (headline, subhead, body, cta, meta, logo, image, motif, background, data,
// caption, label) that format adaptation and contextual edits read, a box in its parent's coordinates (x, y, w, h,
// rotation about its centre, opacity) and lock and visibility flags. Paths and shape recipes live in a 0–100 box,
// scaled to the node's box (lib/ux-v0/shape.ts). Text is text: exact wording, never a picture of letters.
//
// normalizeDoc() is the only way in. A document from storage, an import or a model is held to its shape: unknown
// node types dropped, numbers clamped, colours checked, ids made unique, references to missing assets removed, and
// what was repaired said. Operations (applyOp) are the only way to change it: each is validated and applied as a
// whole or not at all, so an edit that fails leaves the previous document exactly as it was.

import { normalizeRecipe, parsePath, type ShapeRecipe } from '../shape';

export const GFX_SCHEMA = 1;

export const ROLES = ['headline', 'subhead', 'body', 'cta', 'meta', 'logo', 'image', 'motif', 'background', 'data', 'caption', 'label'] as const;
export type Role = (typeof ROLES)[number];

export const UNITS = ['px', 'pt'] as const;
export type Unit = (typeof UNITS)[number];

export interface Stop {
  at: number;
  color: string;
}
/** A fill: a colour, or a gradient (an angle in degrees for linear; radial from the centre). */
export type Paint = string | { type: 'linear' | 'radial'; angle: number; stops: Stop[] };

export interface Base {
  id: string;
  name?: string;
  role?: Role;
  /** the box in the parent's coordinates (an artboard's, or a group's own) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** degrees, about the box's centre */
  rotation: number;
  opacity: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface TextNode extends Base {
  type: 'text';
  /** the exact words; "\n" breaks a line */
  text: string;
  font: string;
  weight: number;
  italic?: boolean;
  size: number;
  /** a multiple of the size */
  lineHeight: number;
  /** thousandths of an em */
  tracking: number;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  color: string;
  case?: 'none' | 'upper' | 'lower';
  /** set on its side (read from bottom to top) */
  vertical?: boolean;
  /** an outline instead of (or around) the fill */
  stroke?: { color: string; width: number };
  /** the box grows to fit its words (the size is kept) rather than the words being checked against the box */
  autoHeight?: boolean;
}

export const SHAPES = ['rect', 'ellipse', 'line', 'polygon', 'star', 'path', 'recipe'] as const;
export type ShapeKind = (typeof SHAPES)[number];

export interface ShapeNode extends Base {
  type: 'shape';
  shape: ShapeKind;
  /** a rectangle's corner radius (px) */
  radius?: number;
  /** a polygon's sides, a star's points */
  sides?: number;
  /** a star's inner radius, 0.1–0.95 of the outer */
  inner?: number;
  /** a path in a 0–100 box (M L H V C S Q T Z only) */
  path?: string;
  /** a recipe of SocriaUX's shape grammar, drawn in the node's box */
  recipe?: ShapeRecipe;
  fill: Paint | null;
  stroke?: { color: string; width: number; join?: 'miter' | 'round' | 'bevel'; cap?: 'butt' | 'round' | 'square'; dash?: number[] };
}

export interface ImageNode extends Base {
  type: 'image';
  asset: string;
  fit: 'cover' | 'contain';
  /** where the subject is (0–100), kept in view when covering */
  focus?: { x: number; y: number };
  /** a mask: an ellipse, or a recipe of the shape grammar */
  mask?: 'ellipse' | ShapeRecipe | null;
  radius?: number;
  filter?: { grayscale?: number; contrast?: number; brightness?: number; blur?: number };
}

export interface GroupNode extends Base {
  type: 'group';
  children: Node[];
  /** clip the group's children to its box */
  clip?: boolean;
}

export interface ChartDatum {
  label: string;
  value: number;
  series?: string;
}
export interface ChartNode extends Base {
  type: 'chart';
  chart: 'bar' | 'column' | 'line' | 'donut';
  data: ChartDatum[];
  colors: string[];
  /** values written on the chart */
  values: boolean;
  font: string;
  color: string;
  /** where the numbers come from, said under the chart */
  source?: string;
  /** a prefix or suffix for values ("%", "£") */
  unit?: string;
}

export type Node = TextNode | ShapeNode | ImageNode | GroupNode | ChartNode;
export type NodeType = Node['type'];

export interface Artboard {
  id: string;
  name: string;
  width: number;
  height: number;
  /** px for screens; pt (1/72 in) for print */
  unit: Unit;
  /** the resolution a print artboard is exported at */
  dpi: number;
  /** the preset it was made from (formats.ts) */
  format?: string;
  /** null: transparent */
  background: string | null;
  /** print bleed beyond the trim, in the artboard's units */
  bleed: number;
  /** the margin keep-out for words and logos, in the artboard's units */
  safe: number;
  children: Node[];
  locked?: boolean;
}

export interface Asset {
  id: string;
  kind: 'image';
  /** https:, data:image/… or an upload artifact (upload:<id>) */
  src: string;
  width: number;
  height: number;
  name: string;
  credit?: string;
  /** where it came from */
  source: 'upload' | 'library' | 'made' | 'generated';
}

export interface Tokens {
  colors: { background: string; surface: string; text: string; muted: string; accent: string; accentText: string; line: string };
  fonts: { display: string; body: string };
  accent2?: string;
}

export interface GraphicDoc {
  schema: typeof GFX_SCHEMA;
  id: string;
  name: string;
  /** the direction the design was made in */
  direction?: { name: string; language: string } | null;
  tokens: Tokens;
  artboards: Artboard[];
  assets: Asset[];
  /** decisions the designer locked for the whole design: an edit that would change them is refused and said */
  locks?: { colors?: boolean; fonts?: boolean };
  revision: number;
  updatedAt: number;
}

// ── holding a document to its shape ──

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
const str = (v: unknown, max: number, d = ''): string => (typeof v === 'string' ? v.slice(0, max) : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => ((list as readonly string[]).includes(v as string) ? (v as T) : d);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export function colour(v: unknown, d: string): string {
  if (typeof v !== 'string' || !HEX.test(v.trim())) return d;
  const h = v.trim().toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

/** A fresh id: short, unique enough within a document, safe in SVG ids. */
export function newId(prefix = 'n'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

const MAX_NODES = 800;
const MAX_DEPTH = 6;
const LIMIT = 100_000;

function paint(v: unknown, d: Paint | null): Paint | null {
  if (v === null) return null;
  if (typeof v === 'string') return colour(v, typeof d === 'string' ? d : '#000000');
  const r = o(v);
  if (r.type !== 'linear' && r.type !== 'radial') return d;
  const stops = a(r.stops)
    .map((s) => ({ at: num(o(s).at, 0, 1, 0), color: colour(o(s).color, '') }))
    .filter((s) => s.color)
    .slice(0, 8);
  if (stops.length < 2) return d;
  return { type: r.type, angle: num(r.angle, -360, 360, 90), stops: stops.sort((x, y) => x.at - y.at) };
}

export interface Repair {
  /** what was dropped or changed, said once each */
  notes: string[];
}

function baseOf(r: Record<string, any>, seen: Set<string>, prefix: string): Base {
  let id = typeof r.id === 'string' && /^[A-Za-z][\w-]{0,47}$/.test(r.id) ? r.id : newId(prefix);
  while (seen.has(id)) id = newId(prefix);
  seen.add(id);
  return {
    id,
    ...(typeof r.name === 'string' && r.name.trim() ? { name: r.name.trim().slice(0, 60) } : {}),
    ...((ROLES as readonly string[]).includes(r.role) ? { role: r.role as Role } : {}),
    x: num(r.x, -LIMIT, LIMIT, 0),
    y: num(r.y, -LIMIT, LIMIT, 0),
    w: num(r.w, 1, LIMIT, 100),
    h: num(r.h, 1, LIMIT, 100),
    rotation: num(r.rotation, -360, 360, 0),
    opacity: num(r.opacity, 0, 1, 1),
    ...(r.locked === true ? { locked: true } : {}),
    ...(r.hidden === true ? { hidden: true } : {}),
  };
}

function nodeOf(v: unknown, seen: Set<string>, assets: ReadonlySet<string>, rep: Repair, depth: number, count: { n: number }): Node | null {
  const r = o(v);
  if (count.n >= MAX_NODES) {
    rep.notes.push(`More than ${MAX_NODES} objects: the rest were left out.`);
    return null;
  }
  count.n++;
  switch (r.type) {
    case 'text': {
      const text = str(r.text, 4000);
      if (!text.trim()) {
        rep.notes.push('An empty text was left out.');
        return null;
      }
      return {
        ...baseOf(r, seen, 't'),
        type: 'text',
        text,
        font: str(r.font, 60, 'Inter') || 'Inter',
        weight: Math.round(num(r.weight, 100, 900, 400) / 100) * 100,
        ...(r.italic === true ? { italic: true } : {}),
        size: num(r.size, 4, 2000, 24),
        lineHeight: num(r.lineHeight, 0.7, 3, 1.2),
        tracking: num(r.tracking, -200, 800, 0),
        align: pick(r.align, ['left', 'center', 'right'] as const, 'left'),
        valign: pick(r.valign, ['top', 'middle', 'bottom'] as const, 'top'),
        color: colour(r.color, '#111111'),
        ...(r.case === 'upper' || r.case === 'lower' ? { case: r.case } : {}),
        ...(r.vertical === true ? { vertical: true } : {}),
        ...(r.stroke && typeof r.stroke === 'object' ? { stroke: { color: colour(o(r.stroke).color, '#111111'), width: num(o(r.stroke).width, 0.25, 40, 1) } } : {}),
        ...(r.autoHeight === true ? { autoHeight: true } : {}),
      };
    }
    case 'shape': {
      const shape = pick(r.shape, SHAPES, 'rect');
      let path: string | undefined;
      if (shape === 'path') {
        const rings = typeof r.path === 'string' ? parsePath(r.path) : null;
        if (!rings || !rings.length) {
          rep.notes.push('A path that could not be read safely was left out.');
          return null;
        }
        path = r.path.slice(0, 20000);
      }
      const recipe = shape === 'recipe' ? normalizeRecipe(r.recipe) : null;
      if (shape === 'recipe' && !recipe) {
        rep.notes.push('A shape recipe that could not be read was left out.');
        return null;
      }
      const st = o(r.stroke);
      return {
        ...baseOf(r, seen, 's'),
        type: 'shape',
        shape,
        ...(shape === 'rect' && r.radius !== undefined ? { radius: num(r.radius, 0, 10000, 0) } : {}),
        ...(shape === 'polygon' || shape === 'star' ? { sides: Math.round(num(r.sides, 3, 24, shape === 'star' ? 5 : 6)) } : {}),
        ...(shape === 'star' ? { inner: num(r.inner, 0.1, 0.95, 0.45) } : {}),
        ...(path ? { path } : {}),
        ...(recipe ? { recipe } : {}),
        fill: shape === 'line' ? null : paint(r.fill, '#cccccc'),
        ...(r.stroke && typeof r.stroke === 'object'
          ? {
              stroke: {
                color: colour(st.color, '#111111'),
                width: num(st.width, 0.25, 200, 1),
                ...(['miter', 'round', 'bevel'].includes(st.join) ? { join: st.join } : {}),
                ...(['butt', 'round', 'square'].includes(st.cap) ? { cap: st.cap } : {}),
                ...(Array.isArray(st.dash) ? { dash: st.dash.map((d: unknown) => num(d, 0, 500, 4)).slice(0, 6) } : {}),
              },
            }
          : shape === 'line'
            ? { stroke: { color: '#111111', width: 2 } }
            : {}),
      };
    }
    case 'image': {
      const asset = str(r.asset, 80);
      if (!assets.has(asset)) {
        rep.notes.push('A picture whose file is missing was left out.');
        return null;
      }
      const f = o(r.filter);
      const mask = r.mask === 'ellipse' ? 'ellipse' : r.mask ? normalizeRecipe(r.mask) : null;
      return {
        ...baseOf(r, seen, 'i'),
        type: 'image',
        asset,
        fit: pick(r.fit, ['cover', 'contain'] as const, 'cover'),
        ...(r.focus ? { focus: { x: num(o(r.focus).x, 0, 100, 50), y: num(o(r.focus).y, 0, 100, 50) } } : {}),
        ...(mask ? { mask } : {}),
        ...(r.radius !== undefined ? { radius: num(r.radius, 0, 10000, 0) } : {}),
        ...(r.filter ? { filter: { ...(f.grayscale !== undefined ? { grayscale: num(f.grayscale, 0, 1, 0) } : {}), ...(f.contrast !== undefined ? { contrast: num(f.contrast, 0.2, 3, 1) } : {}), ...(f.brightness !== undefined ? { brightness: num(f.brightness, 0.2, 3, 1) } : {}), ...(f.blur !== undefined ? { blur: num(f.blur, 0, 60, 0) } : {}) } } : {}),
      };
    }
    case 'group': {
      if (depth >= MAX_DEPTH) {
        rep.notes.push(`Groups nested deeper than ${MAX_DEPTH} were flattened away.`);
        return null;
      }
      const children = a(r.children)
        .map((c) => nodeOf(c, seen, assets, rep, depth + 1, count))
        .filter((c): c is Node => !!c);
      if (!children.length) return null;
      return { ...baseOf(r, seen, 'g'), type: 'group', children, ...(r.clip === true ? { clip: true } : {}) };
    }
    case 'chart': {
      const data = a(r.data)
        .map((d) => ({ label: str(o(d).label, 60).trim(), value: num(o(d).value, -1e12, 1e12, NaN), ...(typeof o(d).series === 'string' ? { series: str(o(d).series, 40) } : {}) }))
        .filter((d) => d.label && Number.isFinite(d.value))
        .slice(0, 40);
      if (!data.length) {
        rep.notes.push('A chart with no readable data was left out (SocriaUX does not invent numbers).');
        return null;
      }
      return {
        ...baseOf(r, seen, 'c'),
        type: 'chart',
        chart: pick(r.chart, ['bar', 'column', 'line', 'donut'] as const, 'column'),
        data,
        colors: a(r.colors)
          .map((c) => colour(c, ''))
          .filter(Boolean)
          .slice(0, 12),
        values: r.values !== false,
        font: str(r.font, 60, 'Inter') || 'Inter',
        color: colour(r.color, '#111111'),
        ...(typeof r.source === 'string' && r.source.trim() ? { source: r.source.trim().slice(0, 160) } : {}),
        ...(typeof r.unit === 'string' && r.unit.trim() ? { unit: r.unit.trim().slice(0, 6) } : {}),
      };
    }
    default:
      if (r.type !== undefined) rep.notes.push(`An object of an unknown kind (“${String(r.type).slice(0, 20)}”) was left out.`);
      return null;
  }
}

const DEFAULT_TOKENS: Tokens = {
  colors: { background: '#f5f2ea', surface: '#ffffff', text: '#161512', muted: '#5d5a52', accent: '#2f3d1e', accentText: '#ffffff', line: '#d8d3c6' },
  fonts: { display: 'Fraunces', body: 'Inter' },
};

/** A document held to its shape (see the head of this file); null only when nothing usable is left. */
/** One picture record held to its shape; null for an address SocriaUX will not load (said in the notes). Only https,
 * data:image and the browser's own uploads are pictures; anything else (javascript:, file:, http:) is refused. */
export function normalizeAsset(x: unknown, rep: Repair = { notes: [] }): Asset | null {
  const s = o(x);
  const id = typeof s.id === 'string' && /^[A-Za-z][\w-]{0,47}$/.test(s.id) ? s.id : '';
  const src = typeof s.src === 'string' ? s.src : '';
  const safe = /^https:\/\/[^\s"'<>`]+$/.test(src) || /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/.test(src) || /^upload:[\w-]{1,96}$/.test(src);
  if (!id || !safe) {
    if (id) rep.notes.push(`A picture with an address SocriaUX will not load (“${src.slice(0, 30)}”) was left out.`);
    return null;
  }
  return { id, kind: 'image', src: src.slice(0, 6_000_000), width: num(s.width, 1, 40000, 1000), height: num(s.height, 1, 40000, 1000), name: str(s.name, 120, 'Picture') || 'Picture', ...(typeof s.credit === 'string' ? { credit: s.credit.slice(0, 200) } : {}), source: pick(s.source, ['upload', 'library', 'made', 'generated'] as const, 'upload') };
}

export function normalizeDoc(v: unknown, rep: Repair = { notes: [] }): GraphicDoc | null {
  const r = o(v);
  if (r.schema !== undefined && r.schema !== GFX_SCHEMA) {
    const migrated = migrate(r, rep);
    if (!migrated) return null;
    return normalizeDoc(migrated, rep);
  }
  const t = o(r.tokens);
  const tc = o(t.colors);
  const tokens: Tokens = {
    colors: {
      background: colour(tc.background, DEFAULT_TOKENS.colors.background),
      surface: colour(tc.surface, DEFAULT_TOKENS.colors.surface),
      text: colour(tc.text, DEFAULT_TOKENS.colors.text),
      muted: colour(tc.muted, DEFAULT_TOKENS.colors.muted),
      accent: colour(tc.accent, DEFAULT_TOKENS.colors.accent),
      accentText: colour(tc.accentText, DEFAULT_TOKENS.colors.accentText),
      line: colour(tc.line, DEFAULT_TOKENS.colors.line),
    },
    fonts: { display: str(o(t.fonts).display, 60) || DEFAULT_TOKENS.fonts.display, body: str(o(t.fonts).body, 60) || DEFAULT_TOKENS.fonts.body },
    ...(colour(t.accent2, '') ? { accent2: colour(t.accent2, '') } : {}),
  };
  const assetIds = new Set<string>();
  const assets: Asset[] = [];
  for (const x of a(r.assets).slice(0, 200)) {
    const asset = normalizeAsset(x, rep);
    if (!asset || assetIds.has(asset.id)) continue;
    assetIds.add(asset.id);
    assets.push(asset);
  }
  const seen = new Set<string>();
  const count = { n: 0 };
  const artboards: Artboard[] = [];
  for (const x of a(r.artboards).slice(0, 60)) {
    const b = o(x);
    let id = typeof b.id === 'string' && /^[A-Za-z][\w-]{0,47}$/.test(b.id) ? b.id : newId('ab');
    while (seen.has(id)) id = newId('ab');
    seen.add(id);
    const unit = pick(b.unit, UNITS, 'px');
    const width = num(b.width, 16, 20000, 1080);
    const height = num(b.height, 16, 20000, 1080);
    artboards.push({
      id,
      name: str(b.name, 60, '').trim() || `Artboard ${artboards.length + 1}`,
      width,
      height,
      unit,
      dpi: num(b.dpi, 72, 1200, unit === 'pt' ? 300 : 72),
      ...(typeof b.format === 'string' ? { format: b.format.slice(0, 40) } : {}),
      background: b.background === null ? null : colour(b.background, tokens.colors.background),
      bleed: num(b.bleed, 0, Math.min(width, height) / 4, 0),
      safe: num(b.safe, 0, Math.min(width, height) / 3, Math.round(Math.min(width, height) * 0.06)),
      children: a(b.children)
        .map((c) => nodeOf(c, seen, assetIds, rep, 0, count))
        .filter((c): c is Node => !!c),
      ...(b.locked === true ? { locked: true } : {}),
    });
  }
  if (!artboards.length) return null;
  return {
    schema: GFX_SCHEMA,
    id: typeof r.id === 'string' && /^[\w-]{1,96}$/.test(r.id) ? r.id : newId('gd'),
    name: str(r.name, 100, '').trim() || 'Untitled graphic',
    ...(r.direction && typeof r.direction === 'object' ? { direction: { name: str(o(r.direction).name, 80), language: str(o(r.direction).language, 40) } } : {}),
    tokens,
    artboards,
    assets,
    ...((l) => (l.colors || l.fonts ? { locks: { ...(l.colors ? { colors: true } : {}), ...(l.fonts ? { fonts: true } : {}) } } : {}))({ colors: o(r.locks).colors === true, fonts: o(r.locks).fonts === true }),
    revision: Math.round(num(r.revision, 0, 1e9, 0)),
    updatedAt: typeof r.updatedAt === 'number' && r.updatedAt > 0 ? Math.round(r.updatedAt) : Date.now(),
  };
}

/** A document of another schema brought to this one; null when it cannot be (said in the repair notes). */
export function migrate(r: Record<string, any>, rep: Repair): Record<string, any> | null {
  // schema 0 (unversioned drafts): the same shape without a schema number
  if (r.schema === 0) return { ...r, schema: GFX_SCHEMA };
  rep.notes.push(`A document of schema ${String(r.schema).slice(0, 8)} is newer than this version of SocriaUX can read.`);
  return null;
}

// ── finding things ──

export interface Located {
  node: Node;
  artboard: Artboard;
  /** the chain of groups above it, outermost first */
  parents: GroupNode[];
  /** its index among its siblings */
  index: number;
}

/** Every node of an artboard, depth first in drawing order, with where it is. */
export function walk(board: Artboard): Located[] {
  const out: Located[] = [];
  const go = (list: Node[], parents: GroupNode[]) =>
    list.forEach((node, index) => {
      out.push({ node, artboard: board, parents, index });
      if (node.type === 'group') go(node.children, [...parents, node]);
    });
  go(board.children, []);
  return out;
}

export function locate(doc: GraphicDoc, id: string): Located | null {
  for (const b of doc.artboards) for (const l of walk(b)) if (l.node.id === id) return l;
  return null;
}

/** A node's box in its artboard's coordinates (groups' offsets added; rotation not applied to the box). */
export function boxOnBoard(l: Located): { x: number; y: number; w: number; h: number } {
  const ox = l.parents.reduce((n, g) => n + g.x, 0);
  const oy = l.parents.reduce((n, g) => n + g.y, 0);
  return { x: l.node.x + ox, y: l.node.y + oy, w: l.node.w, h: l.node.h };
}

/** Whether a node or anything above it (a group, its artboard) is locked. */
export function isLocked(l: Located): boolean {
  return !!l.node.locked || !!l.artboard.locked || l.parents.some((g) => g.locked);
}

// ── operations: the only way a document changes ──

export type Op =
  | { op: 'add'; artboard: string; node: unknown; parent?: string; index?: number }
  | { op: 'update'; id: string; set: Record<string, unknown> }
  | { op: 'move'; id: string; dx: number; dy: number }
  | { op: 'resize'; id: string; x?: number; y?: number; w: number; h: number }
  | { op: 'remove'; id: string }
  | { op: 'reorder'; id: string; to: number }
  | { op: 'group'; ids: string[]; name?: string }
  | { op: 'ungroup'; id: string }
  | { op: 'duplicate'; id: string; dx?: number; dy?: number }
  | { op: 'asset'; asset: unknown }
  | { op: 'artboard-add'; artboard: unknown; after?: string }
  | { op: 'artboard-update'; id: string; set: Record<string, unknown> }
  | { op: 'artboard-duplicate'; id: string; name?: string }
  | { op: 'artboard-remove'; id: string }
  | { op: 'artboard-reorder'; id: string; to: number }
  | { op: 'tokens'; set: Record<string, unknown> }
  | { op: 'locks'; colors?: boolean; fonts?: boolean };

export type OpResult = { ok: true; doc: GraphicDoc; touched: string[]; notes: string[] } | { ok: false; error: string; locked?: string[] };

/** Fields an update may set on a node (its id, type and children change only through other operations). */
const FIXED = new Set(['id', 'type', 'children']);

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function reId(n: Node, seen: Set<string>): Node {
  let id = newId(n.id.charAt(0));
  while (seen.has(id)) id = newId(n.id.charAt(0));
  seen.add(id);
  return n.type === 'group' ? { ...n, id, children: n.children.map((c) => reId(c, seen)) } : { ...n, id };
}

const allIds = (doc: GraphicDoc): Set<string> => new Set(doc.artboards.flatMap((b) => [b.id, ...walk(b).map((l) => l.node.id)]));

/** The list a node lives in (an artboard's children or a group's), to change in place on a cloned document. */
function siblings(doc: GraphicDoc, id: string): { list: Node[]; index: number; board: Artboard } | null {
  for (const b of doc.artboards) {
    const find = (list: Node[]): { list: Node[]; index: number } | null => {
      const i = list.findIndex((n) => n.id === id);
      if (i >= 0) return { list, index: i };
      for (const n of list) if (n.type === 'group') {
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    const hit = find(b.children);
    if (hit) return { ...hit, board: b };
  }
  return null;
}

/**
 * One operation, validated and applied as a whole (or not at all). `force` lets an operation touch what is locked:
 * only ever passed when the designer said so.
 */
export function applyOp(doc0: GraphicDoc, op: Op, opts: { force?: boolean } = {}): OpResult {
  const doc = clone(doc0);
  const notes: string[] = [];
  const lockedHit = (id: string): string | null => {
    const l = locate(doc, id);
    return l && isLocked(l) && !opts.force ? (l.node.name ?? l.node.role ?? l.node.type) : null;
  };
  const done = (touched: string[]): OpResult => {
    const rep: Repair = { notes: [] };
    const checked = normalizeDoc({ ...doc, revision: doc0.revision + 1, updatedAt: Date.now() }, rep);
    if (!checked) return { ok: false, error: 'The change would leave the design empty.' };
    return { ok: true, doc: checked, touched, notes: [...notes, ...rep.notes] };
  };
  switch (op.op) {
    case 'add': {
      const board = doc.artboards.find((b) => b.id === op.artboard);
      if (!board) return { ok: false, error: 'That artboard is not in the design.' };
      if (board.locked && !opts.force) return { ok: false, error: 'That artboard is locked.', locked: [board.name] };
      const rep: Repair = { notes: [] };
      const node = nodeOf(op.node, allIds(doc), new Set(doc.assets.map((x) => x.id)), rep, 0, { n: 0 });
      if (!node) return { ok: false, error: rep.notes[0] ?? 'That object is not valid.' };
      let list = board.children;
      if (op.parent) {
        const g = locate(doc, op.parent);
        if (!g || g.node.type !== 'group') return { ok: false, error: 'That group is not in the design.' };
        list = g.node.children;
      }
      const at = op.index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.round(op.index)));
      list.splice(at, 0, node);
      return done([node.id]);
    }
    case 'update': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      if (!opts.force && doc.locks?.colors && ['color', 'fill', 'stroke', 'colors'].some((k) => k in op.set)) return { ok: false, error: 'The colours are locked for this design.', locked: ['the colours'] };
      if (!opts.force && doc.locks?.fonts && ['font', 'weight', 'italic'].some((k) => k in op.set)) return { ok: false, error: 'The typefaces are locked for this design.', locked: ['the typefaces'] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const cur = s.list[s.index] as unknown as Record<string, unknown>;
      const next: Record<string, unknown> = { ...cur };
      for (const [k, v] of Object.entries(op.set)) {
        if (FIXED.has(k)) continue;
        if (v === null && k !== 'fill' && k !== 'mask' && k !== 'background') delete next[k];
        else next[k] = v;
      }
      const rep: Repair = { notes: [] };
      const others = allIds(doc);
      others.delete(op.id);
      const node = nodeOf(next, others, new Set(doc.assets.map((x) => x.id)), rep, 0, { n: 0 });
      if (!node || node.id !== op.id) return { ok: false, error: rep.notes[0] ?? 'That change would make the object invalid.' };
      s.list[s.index] = node;
      notes.push(...rep.notes);
      return done([op.id]);
    }
    case 'move': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const n = s.list[s.index];
      s.list[s.index] = { ...n, x: n.x + (Number(op.dx) || 0), y: n.y + (Number(op.dy) || 0) } as Node;
      return done([op.id]);
    }
    case 'resize': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const n = s.list[s.index];
      const w = Math.max(1, Number(op.w) || n.w);
      const h = Math.max(1, Number(op.h) || n.h);
      // a group's children scale with it
      const scaled = n.type === 'group' ? { ...n, children: n.children.map((c) => scaleNode(c, w / n.w, h / n.h)) } : n;
      s.list[s.index] = { ...scaled, x: op.x ?? n.x, y: op.y ?? n.y, w, h } as Node;
      return done([op.id]);
    }
    case 'remove': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      s.list.splice(s.index, 1);
      return done([op.id]);
    }
    case 'reorder': {
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const [n] = s.list.splice(s.index, 1);
      s.list.splice(Math.max(0, Math.min(s.list.length, Math.round(op.to))), 0, n);
      return done([op.id]);
    }
    case 'group': {
      const ids = [...new Set(op.ids)];
      if (ids.length < 2) return { ok: false, error: 'Grouping needs two objects or more.' };
      const first = siblings(doc, ids[0]);
      if (!first) return { ok: false, error: 'Those objects are not in the design.' };
      const members = ids.map((id) => siblings(doc, id));
      if (members.some((m) => !m || m.list !== first.list)) return { ok: false, error: 'Only objects side by side in the same layer can be grouped.' };
      const locked = ids.map(lockedHit).filter((x): x is string => !!x);
      if (locked.length) return { ok: false, error: `${locked.map((x) => `“${x}”`).join(', ')} ${locked.length > 1 ? 'are' : 'is'} locked.`, locked };
      const nodes = members.map((m) => m!.list[m!.index]).sort((p, q) => first.list.indexOf(p) - first.list.indexOf(q));
      const x = Math.min(...nodes.map((n) => n.x));
      const y = Math.min(...nodes.map((n) => n.y));
      const w = Math.max(...nodes.map((n) => n.x + n.w)) - x;
      const h = Math.max(...nodes.map((n) => n.y + n.h)) - y;
      const at = Math.min(...nodes.map((n) => first.list.indexOf(n)));
      const group: GroupNode = { id: newId('g'), type: 'group', name: op.name?.slice(0, 60) || 'Group', x, y, w: Math.max(1, w), h: Math.max(1, h), rotation: 0, opacity: 1, children: nodes.map((n) => ({ ...n, x: n.x - x, y: n.y - y }) as Node) };
      for (const n of nodes) first.list.splice(first.list.indexOf(n), 1);
      first.list.splice(at, 0, group);
      return done([group.id]);
    }
    case 'ungroup': {
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That group is not in the design.' };
      const g = s.list[s.index];
      if (g.type !== 'group') return { ok: false, error: 'That is not a group.' };
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      s.list.splice(s.index, 1, ...g.children.map((c) => ({ ...c, x: c.x + g.x, y: c.y + g.y, opacity: c.opacity * g.opacity }) as Node));
      return done(g.children.map((c) => c.id));
    }
    case 'duplicate': {
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const copy = reId(clone(s.list[s.index]), allIds(doc));
      const placed = { ...copy, x: copy.x + (op.dx ?? 24), y: copy.y + (op.dy ?? 24), locked: undefined } as Node;
      delete (placed as Partial<Base>).locked;
      s.list.splice(s.index + 1, 0, placed);
      return done([placed.id]);
    }
    case 'asset': {
      const tmp = normalizeDoc({ ...doc, assets: [...doc.assets, op.asset] }, { notes: [] });
      if (!tmp || tmp.assets.length !== doc.assets.length + 1) return { ok: false, error: 'That picture could not be added (its address or kind is not one SocriaUX loads).' };
      doc.assets = tmp.assets;
      return done([tmp.assets[tmp.assets.length - 1].id]);
    }
    case 'artboard-add': {
      const tmp = normalizeDoc({ ...doc, artboards: [op.artboard] }, { notes: [] });
      if (!tmp) return { ok: false, error: 'That artboard is not valid.' };
      const ids = allIds(doc);
      const board = { ...tmp.artboards[0], id: ids.has(tmp.artboards[0].id) ? newId('ab') : tmp.artboards[0].id, children: tmp.artboards[0].children.map((c) => reId(c, ids)) };
      const at = op.after ? doc.artboards.findIndex((b) => b.id === op.after) + 1 : doc.artboards.length;
      doc.artboards.splice(at > 0 ? at : doc.artboards.length, 0, board);
      return done([board.id]);
    }
    case 'artboard-update': {
      const b = doc.artboards.find((x) => x.id === op.id);
      if (!b) return { ok: false, error: 'That artboard is not in the design.' };
      const allowed = ['name', 'width', 'height', 'background', 'bleed', 'safe', 'dpi', 'locked', 'format', 'unit'];
      for (const [k, v] of Object.entries(op.set)) if (allowed.includes(k)) (b as unknown as Record<string, unknown>)[k] = v;
      return done([b.id]);
    }
    case 'artboard-duplicate': {
      const b = doc.artboards.find((x) => x.id === op.id);
      if (!b) return { ok: false, error: 'That artboard is not in the design.' };
      const ids = allIds(doc);
      const copy: Artboard = { ...clone(b), id: newId('ab'), name: op.name?.slice(0, 60) || `${b.name} copy`, children: clone(b.children).map((c) => reId(c, ids)) };
      delete copy.locked;
      doc.artboards.splice(doc.artboards.indexOf(b) + 1, 0, copy);
      return done([copy.id]);
    }
    case 'artboard-remove': {
      if (doc.artboards.length < 2) return { ok: false, error: 'A design keeps at least one artboard.' };
      const i = doc.artboards.findIndex((x) => x.id === op.id);
      if (i < 0) return { ok: false, error: 'That artboard is not in the design.' };
      if (doc.artboards[i].locked && !opts.force) return { ok: false, error: 'That artboard is locked.', locked: [doc.artboards[i].name] };
      doc.artboards.splice(i, 1);
      return done([op.id]);
    }
    case 'artboard-reorder': {
      const i = doc.artboards.findIndex((x) => x.id === op.id);
      if (i < 0) return { ok: false, error: 'That artboard is not in the design.' };
      const [b] = doc.artboards.splice(i, 1);
      doc.artboards.splice(Math.max(0, Math.min(doc.artboards.length, Math.round(op.to))), 0, b);
      return done([op.id]);
    }
    case 'tokens': {
      const s = o(op.set);
      if (!opts.force && ((doc.locks?.colors && s.colors) || (doc.locks?.fonts && s.fonts))) return { ok: false, error: 'That part of the design system is locked.', locked: [doc.locks?.colors && s.colors ? 'the colours' : 'the typefaces'] };
      doc.tokens = { ...doc.tokens, ...(s.colors ? { colors: { ...doc.tokens.colors, ...o(s.colors) } } : {}), ...(s.fonts ? { fonts: { ...doc.tokens.fonts, ...o(s.fonts) } } : {}) } as Tokens;
      return done([]);
    }
    case 'locks': {
      doc.locks = { ...(doc.locks ?? {}), ...(op.colors !== undefined ? { colors: op.colors } : {}), ...(op.fonts !== undefined ? { fonts: op.fonts } : {}) };
      return done([]);
    }
  }
  return { ok: false, error: 'That operation is not one SocriaUX knows.' };
}

/** Several operations as one change: all applied, or none (the first failure is said, the document unchanged). */
export function applyOps(doc: GraphicDoc, ops: readonly Op[], opts: { force?: boolean } = {}): OpResult {
  let cur = doc;
  const touched: string[] = [];
  const notes: string[] = [];
  for (const op of ops) {
    const r = applyOp(cur, op, opts);
    if (!r.ok) return r;
    cur = r.doc;
    touched.push(...r.touched);
    notes.push(...r.notes);
  }
  return { ok: true, doc: { ...cur, revision: doc.revision + 1 }, touched, notes };
}

/** A node scaled by (sx, sy) about its parent's origin: its box, its text and strokes in proportion. */
export function scaleNode(n: Node, sx: number, sy: number): Node {
  const k = Math.sqrt(Math.abs(sx * sy)) || 1;
  const base = { ...n, x: n.x * sx, y: n.y * sy, w: Math.max(1, n.w * sx), h: Math.max(1, n.h * sy) };
  if (n.type === 'text') return { ...(base as TextNode), size: Math.max(4, n.size * k), ...(n.stroke ? { stroke: { ...n.stroke, width: n.stroke.width * k } } : {}) };
  if (n.type === 'shape' && n.stroke) return { ...(base as ShapeNode), stroke: { ...n.stroke, width: Math.max(0.25, n.stroke.width * k) } };
  if (n.type === 'group') return { ...(base as GroupNode), children: n.children.map((c) => scaleNode(c, sx, sy)) };
  return base as Node;
}

/** Every text of a document, by id, exactly as written: what format adaptation and edits must keep. */
export function wordsOf(doc: GraphicDoc): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of doc.artboards) for (const l of walk(b)) if (l.node.type === 'text') out.set(l.node.id, l.node.text);
  return out;
}
