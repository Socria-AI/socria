// lib/ux-v0/boards/model.ts — a Board: one canvas holding a campaign's materials, its Master Design System and the
// notes that explain it.
//
// A Board is the workspace; its MATERIALS are the designs: graphics (a poster, a post, a banner, a label: an editable
// Graphics document the board owns), websites (a link to a website project, never a copy of it) and mockups (a
// presentation of another material in a context: a phone, a wall, a box; it holds a reference to its source, never
// a picture of it). NODES place things on the canvas: a material's presentation (its place and size on the board,
// not the material's own dimensions), notes, section headings, reference pictures, the design-system overview.
// CONNECTORS tie a note to what it explains. Everything carries a stable id; references are checked whenever a board
// is read, and every change is an operation, validated, applied whole or not at all.

import { newId, normalizeAsset, normalizeDoc, type Asset, type GraphicDoc } from '../graphics/doc';
import { GRAPHIC_KINDS, type GraphicBrief, type GraphicKind } from '../graphics/compose';
import { normalizeGraphicBrief } from '../graphics/state';
import { formatOf } from '../graphics/formats';
import { EMPTY_BINDINGS, normalizeBindings, normalizeSystem, type Bindings, type MasterDesignSystem } from './system';

export const BOARD_SCHEMA = 1;
export const MATERIAL_STATUSES = ['planned', 'generating', 'rendering', 'ready', 'failed'] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];
export const ROLES = ['hero', 'information', 'statement', 'teaser', 'action', 'packaging', 'support'] as const;
export type MaterialRole = (typeof ROLES)[number];
export const MOCKUPS = ['phone', 'poster-wall', 'box', 'billboard', 'laptop'] as const;
export type MockupTemplate = (typeof MOCKUPS)[number];
export const ARRANGEMENTS = ['editorial', 'sections', 'grid', 'rows', 'sequence'] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];
export const MOCKUP_LABEL: Record<MockupTemplate, string> = { phone: 'Phone', 'poster-wall': 'Poster on a wall', box: 'Packaging', billboard: 'Billboard', laptop: 'Laptop' };

interface MaterialBase {
  id: string;
  name: string;
  /** what this material is for, in a sentence */
  purpose: string;
  status: MaterialStatus;
  error?: string;
  /** bumps on every change: the key of what is cached of it */
  revision: number;
}
export interface GraphicMaterial extends MaterialBase {
  type: 'graphic';
  role: MaterialRole;
  /** its words and format, exactly as planned */
  brief: GraphicBrief;
  /** which of its composition variants it is (a regeneration takes the next) */
  variant: number;
  doc: GraphicDoc | null;
  bindings: Bindings;
  /** the composition decided for it, with the reasons (the notes explain what is true of it) */
  plan?: { archetype: string; colour: string; said: string[] };
  /** high and medium findings left after the bounded repair */
  findings?: number;
  /** the designer accepted it with findings left */
  accepted?: boolean;
  /** the document's revision when it was last composed: a later revision means it was edited since */
  composed?: number;
}
export interface WebsiteMaterial extends MaterialBase {
  type: 'website';
  projectId: string;
  view: 'desktop' | 'mobile';
  /** the board created the project (a concept), rather than linking one that existed */
  created: boolean;
}
export interface MockupMaterial extends MaterialBase {
  type: 'mockup';
  template: MockupTemplate;
  source: { material: string; artboard: number } | null;
}
export type Material = GraphicMaterial | WebsiteMaterial | MockupMaterial;

interface NodeBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  group?: string;
  locked?: boolean;
}
export interface MaterialNode extends NodeBase {
  type: 'material';
  material: string;
}
/** A fact a generated note states, checked again later: a note that no longer matches its material is said stale. */
export interface Claim {
  material: string;
  fact: 'headline-font' | 'ground' | 'archetype' | 'format' | 'source' | 'system-display' | 'system-body' | 'system-accent' | 'view';
  value: string;
}
export interface NoteNode extends NodeBase {
  type: 'note';
  text: string;
  /** written by SocriaUX from the board's facts (and checked against them), or by the designer */
  generated: boolean;
  /** what it explains */
  about?: string;
  claims?: Claim[];
}
export interface HeadingNode extends NodeBase {
  type: 'heading';
  text: string;
  level: 1 | 2;
}
export interface ReferenceNode extends NodeBase {
  type: 'reference';
  asset: string;
  caption?: string;
}
export interface SystemNode extends NodeBase {
  type: 'system';
}
export type BoardNode = MaterialNode | NoteNode | HeadingNode | ReferenceNode | SystemNode;
export interface Connector {
  id: string;
  from: string;
  to: string;
}

/** What a board request asks for: the campaign's words, the materials, where the system comes from. */
export interface MaterialSpec {
  kind: GraphicKind | 'website' | 'mockup';
  count: number;
  format?: string;
  template?: MockupTemplate;
}
export interface BoardBrief {
  purpose: string;
  name: string;
  content: GraphicBrief['content'];
  mood: string[];
  materials: MaterialSpec[];
  images: string[];
  /** link this website project rather than make a concept */
  website?: string;
  /** take the system from this website project's approved direction */
  systemFrom?: string;
  annotate: boolean;
}

export interface BoardVersion {
  label: string;
  at: number;
  state: Omit<BoardState, 'versions'>;
}

export interface BoardState {
  schema: typeof BOARD_SCHEMA;
  request: string;
  brief: BoardBrief | null;
  system: MasterDesignSystem | null;
  /** systems proposed for this board, one to approve */
  options: MasterDesignSystem[];
  materials: Material[];
  nodes: BoardNode[];
  connectors: Connector[];
  /** the board's pictures: the brief's, references, a logo */
  assets: Asset[];
  background: { color: string; pattern: 'dots' | 'grid' | 'none' };
  /** annotations shown on the board (they are part of the presentation, never of an exported material) */
  annotations: boolean;
  /** how the board was last arranged (a re-flow keeps to it) */
  arrangement: Arrangement;
  versions: BoardVersion[];
}

export const MAX_MATERIALS = 60;
export const MAX_NODES = 400;
export const MAX_BOARD_VERSIONS = 6;
export const LIMIT = 1_000_000;

export function emptyBoard(): BoardState {
  return { schema: BOARD_SCHEMA, request: '', brief: null, system: null, options: [], materials: [], nodes: [], connectors: [], assets: [], background: { color: '#ecebe6', pattern: 'dots' }, annotations: true, arrangement: 'editorial', versions: [] };
}

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max: number, d = ''): string => (typeof v === 'string' ? v.slice(0, max) : d);
const num = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
const ID = /^[A-Za-z][\w-]{0,47}$/;
const PROJECT_ID = /^[A-Za-z0-9_-]{1,96}$/;
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => ((allowed as readonly string[]).includes(v as string) ? (v as T) : d);
const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d);

export const boardId = (prefix: string) => newId(prefix);

// ── holding a board to its shape ──

function materialOf(v: unknown, seen: Set<string>): Material | null {
  const r = o(v);
  let id = typeof r.id === 'string' && ID.test(r.id) ? r.id : boardId('m');
  while (seen.has(id)) id = boardId('m');
  seen.add(id);
  const base = { id, name: str(r.name, 80).trim() || 'Material', purpose: str(r.purpose, 300), status: pick(r.status, MATERIAL_STATUSES, 'planned'), ...(str(r.error, 300) ? { error: str(r.error, 300) } : {}), revision: Math.round(num(r.revision, 0, 1e9, 0)) };
  if (r.type === 'graphic') {
    const brief = normalizeGraphicBrief(r.brief);
    if (!brief || !brief.formats.length || !formatOf(brief.formats[0])) return null;
    const doc = r.doc ? normalizeDoc(r.doc) : null;
    const status = doc ? base.status : base.status === 'ready' ? 'planned' : base.status;
    const plan = o(r.plan);
    return {
      ...base,
      status,
      type: 'graphic',
      role: pick(r.role, ROLES, 'support'),
      brief,
      variant: Math.round(num(r.variant, 0, 999, 0)),
      doc,
      bindings: doc ? normalizeBindings(r.bindings, doc) : EMPTY_BINDINGS,
      ...(str(plan.archetype, 30) ? { plan: { archetype: str(plan.archetype, 30), colour: str(plan.colour, 20), said: a(plan.said).map((x) => str(x, 240)).filter(Boolean).slice(0, 8) } } : {}),
      ...(typeof r.findings === 'number' ? { findings: Math.round(num(r.findings, 0, 999, 0)) } : {}),
      ...(r.accepted === true ? { accepted: true } : {}),
      ...(typeof r.composed === 'number' && Number.isFinite(r.composed) ? { composed: Math.round(num(r.composed, 0, 1e9, 0)) } : {}),
    };
  }
  if (r.type === 'website') {
    if (typeof r.projectId !== 'string' || !PROJECT_ID.test(r.projectId)) return null;
    return { ...base, type: 'website', projectId: r.projectId, view: r.view === 'mobile' ? 'mobile' : 'desktop', created: r.created === true };
  }
  if (r.type === 'mockup') {
    const s = o(r.source);
    return { ...base, type: 'mockup', template: pick(r.template, MOCKUPS, 'phone'), source: typeof s.material === 'string' && ID.test(s.material) ? { material: s.material, artboard: Math.round(num(s.artboard, 0, 59, 0)) } : null };
  }
  return null;
}

function nodeOf(v: unknown, seen: Set<string>): BoardNode | null {
  const r = o(v);
  let id = typeof r.id === 'string' && ID.test(r.id) ? r.id : boardId('bn');
  while (seen.has(id)) id = boardId('bn');
  const base = {
    id,
    x: num(r.x, -LIMIT, LIMIT, 0),
    y: num(r.y, -LIMIT, LIMIT, 0),
    w: num(r.w, 8, 40000, 320),
    h: num(r.h, 8, 40000, 200),
    ...(typeof r.group === 'string' && ID.test(r.group) ? { group: r.group } : {}),
    ...(r.locked === true ? { locked: true } : {}),
  };
  let node: BoardNode | null = null;
  if (r.type === 'material' && typeof r.material === 'string' && ID.test(r.material)) node = { ...base, type: 'material', material: r.material };
  else if (r.type === 'note') {
    const text = str(r.text, 2000).trim();
    if (!text) return null;
    const claims = claimsOf(r.claims);
    node = { ...base, type: 'note', text, generated: r.generated === true, ...(typeof r.about === 'string' && ID.test(r.about) ? { about: r.about } : {}), ...(claims.length ? { claims: claims.slice(0, 8) } : {}) };
  } else if (r.type === 'heading') {
    const text = str(r.text, 200).trim();
    if (!text) return null;
    node = { ...base, type: 'heading', text, level: r.level === 1 ? 1 : 2 };
  } else if (r.type === 'reference' && typeof r.asset === 'string' && ID.test(r.asset)) node = { ...base, type: 'reference', asset: r.asset, ...(str(r.caption, 200).trim() ? { caption: str(r.caption, 200).trim() } : {}) };
  else if (r.type === 'system') node = { ...base, type: 'system' };
  if (node) seen.add(id);
  return node;
}

function briefOf(v: unknown): BoardBrief | null {
  const r = o(v);
  const name = str(r.name, 120).trim();
  const content = o(r.content);
  const headline = str(content.headline, 300).trim();
  if (!headline) return null;
  const g = normalizeGraphicBrief({ purpose: r.purpose, kind: 'poster', formats: ['a4'], content: r.content, mood: r.mood, images: r.images });
  const kinds = [...GRAPHIC_KINDS, 'website', 'mockup'] as const;
  return {
    purpose: str(r.purpose, 600),
    name: name || headline,
    content: g ? g.content : { headline },
    mood: g ? g.mood : [],
    materials: a(r.materials)
      .map((m) => o(m))
      .filter((m) => (kinds as readonly string[]).includes(m.kind))
      .map((m) => ({ kind: m.kind, count: Math.round(num(m.count, 1, 12, 1)), ...(typeof m.format === 'string' && formatOf(m.format) ? { format: m.format } : {}), ...((MOCKUPS as readonly string[]).includes(m.template) ? { template: m.template } : {}) }))
      .slice(0, 16),
    images: a(r.images).map((x) => str(x, 48)).filter((x) => ID.test(x)).slice(0, 12),
    ...(typeof r.website === 'string' && PROJECT_ID.test(r.website) ? { website: r.website } : {}),
    ...(typeof r.systemFrom === 'string' && PROJECT_ID.test(r.systemFrom) ? { systemFrom: r.systemFrom } : {}),
    annotate: r.annotate !== false,
  };
}

/**
 * A board held to its shape (see the head of this file). References are checked: a node of a material that is not
 * there goes, a connector without both ends goes, a mockup whose source is gone keeps no source, a note about
 * something gone is about nothing. Never more than MAX_MATERIALS materials and MAX_NODES nodes.
 */
export function normalizeBoard(v: unknown, depth = 0): BoardState | null {
  if (!v || typeof v !== 'object') return null;
  const r = o(v);
  const seenM = new Set<string>();
  const materials = a(r.materials)
    .slice(0, MAX_MATERIALS)
    .map((m) => materialOf(m, seenM))
    .filter((m): m is Material => !!m);
  const mids = new Set(materials.map((m) => m.id));
  for (const m of materials) if (m.type === 'mockup' && m.source && (!mids.has(m.source.material) || materials.find((x) => x.id === m.source!.material)?.type !== 'graphic')) m.source = null;
  const seenA = new Set<string>();
  const assets = a(r.assets)
    .slice(0, 48)
    .map((x) => normalizeAsset(x))
    .filter((x): x is Asset => !!x && !seenA.has(x.id) && (seenA.add(x.id), true));
  const seenN = new Set<string>();
  const nodes = a(r.nodes)
    .slice(0, MAX_NODES)
    .map((n) => nodeOf(n, seenN))
    .filter((n): n is BoardNode => !!n)
    .filter((n) => (n.type === 'material' ? mids.has(n.material) : n.type === 'reference' ? seenA.has(n.asset) : true));
  const nids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) if (n.type === 'note' && n.about && !nids.has(n.about)) delete n.about;
  const seenC = new Set<string>();
  const connectors = a(r.connectors)
    .slice(0, MAX_NODES)
    .map((c) => ({ id: typeof o(c).id === 'string' && ID.test(o(c).id) ? o(c).id : boardId('c'), from: str(o(c).from, 48), to: str(o(c).to, 48) }))
    .filter((c) => nids.has(c.from) && nids.has(c.to) && c.from !== c.to && !seenC.has(c.id) && (seenC.add(c.id), true));
  const bg = o(r.background);
  return {
    schema: BOARD_SCHEMA,
    request: str(r.request, 1200),
    brief: briefOf(r.brief),
    system: normalizeSystem(r.system),
    options: a(r.options)
      .map((x) => normalizeSystem(x))
      .filter((x): x is MasterDesignSystem => !!x)
      .slice(0, 4),
    materials,
    nodes,
    connectors,
    assets,
    background: { color: hex(bg.color, '#ecebe6'), pattern: pick(bg.pattern, ['dots', 'grid', 'none'] as const, 'dots') },
    annotations: r.annotations !== false,
    arrangement: pick(r.arrangement, ARRANGEMENTS, 'editorial'),
    versions:
      depth > 0
        ? []
        : a(r.versions)
            .map((x) => {
              const s = normalizeBoard(o(x).state, depth + 1);
              return s ? { label: str(o(x).label, 160) || 'A version', at: typeof o(x).at === 'number' ? Math.round(o(x).at) : Date.now(), state: { ...s, versions: undefined } as unknown as Omit<BoardState, 'versions'> } : null;
            })
            .filter((x): x is BoardVersion => !!x)
            .slice(-MAX_BOARD_VERSIONS),
  };
}

// ── finding things ──

export const nodeOfMaterial = (b: BoardState, materialId: string) => b.nodes.find((n): n is MaterialNode => n.type === 'material' && n.material === materialId) ?? null;
export const materialOfNode = (b: BoardState, node: BoardNode | null | undefined) => (node && node.type === 'material' ? b.materials.find((m) => m.id === node.material) ?? null : null);
export const bounds = (ns: readonly { x: number; y: number; w: number; h: number }[]) => {
  if (!ns.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...ns.map((n) => n.x));
  const y = Math.min(...ns.map((n) => n.y));
  return { x, y, w: Math.max(...ns.map((n) => n.x + n.w)) - x, h: Math.max(...ns.map((n) => n.y + n.h)) - y };
};
export const overlaps = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }, gap = 0) => p.x < q.x + q.w + gap && q.x < p.x + p.w + gap && p.y < q.y + q.h + gap && q.y < p.y + p.h + gap;

/** The intrinsic aspect of a material (width over height): its first artboard, a website's view, a mockup's scene. */
export function aspectOf(m: Material): number {
  if (m.type === 'graphic') {
    const b = m.doc?.artboards[0];
    const f = formatOf(m.brief.formats[0]);
    return b ? b.width / b.height : f ? f.width / f.height : 1;
  }
  if (m.type === 'website') return m.view === 'mobile' ? 390 / 780 : 1280 / 820;
  return m.template === 'phone' ? 0.62 : m.template === 'box' ? 1.05 : m.template === 'billboard' ? 1.7 : m.template === 'laptop' ? 1.5 : 0.82;
}

// ── operations ──

/** Claims held to their shape (a material id, a known fact, a value). */
export function claimsOf(v: unknown): Claim[] {
  return a(v)
    .map((c) => ({ material: str(o(c).material, 48), fact: str(o(c).fact, 30), value: str(o(c).value, 120) }))
    .filter((c) => ID.test(c.material) && ['headline-font', 'ground', 'archetype', 'format', 'source', 'system-display', 'system-body', 'system-accent', 'view'].includes(c.fact))
    .slice(0, 12) as Claim[];
}

export type BoardOp =
  | { op: 'node-add'; node: unknown }
  | { op: 'node-move'; ids: string[]; dx: number; dy: number }
  | { op: 'node-set'; id: string; x?: number; y?: number; w?: number; h?: number }
  | { op: 'node-update'; id: string; set: { text?: string; caption?: string; locked?: boolean; level?: 1 | 2 } }
  /** a generated note written again from the facts (it stays generated, its claims replaced); never the designer's own */
  | { op: 'note-write'; id: string; text: string; claims: unknown }
  | { op: 'node-remove'; ids: string[] }
  | { op: 'group'; ids: string[] }
  | { op: 'ungroup'; ids: string[] }
  | { op: 'connect'; from: string; to: string }
  | { op: 'disconnect'; id: string }
  | { op: 'material-add'; material: unknown; place?: { x: number; y: number; w: number; h: number } }
  | { op: 'material-update'; id: string; set: Record<string, unknown> }
  | { op: 'material-remove'; id: string }
  | { op: 'material-duplicate'; id: string }
  | { op: 'system'; system: unknown }
  | { op: 'background'; color?: string; pattern?: 'dots' | 'grid' | 'none' }
  | { op: 'annotations'; visible: boolean }
  | { op: 'arrangement'; how: Arrangement }
  | { op: 'asset'; asset: unknown };

export type BoardResult = { ok: true; board: BoardState; touched: string[] } | { ok: false; error: string; locked?: string[] };

const MATERIAL_FIELDS = new Set(['name', 'purpose', 'status', 'error', 'doc', 'bindings', 'plan', 'findings', 'accepted', 'variant', 'composed', 'brief', 'role', 'source', 'template', 'view', 'projectId']);

/**
 * One operation applied to a board (see the head of this file): validated against what is there, refused with the
 * reason when it would leave the board inconsistent or change something locked. Materials and nodes not touched
 * keep their identity, so a history of boards shares everything that did not change.
 */
export function applyBoardOp(b: BoardState, op: BoardOp, opts: { force?: boolean } = {}): BoardResult {
  const lockedNode = (id: string) => {
    const n = b.nodes.find((x) => x.id === id);
    return n?.locked && !opts.force ? n : null;
  };
  const nodeName = (n: BoardNode) => (n.type === 'material' ? b.materials.find((m) => m.id === n.material)?.name ?? 'material' : n.type === 'note' ? 'the note' : n.type === 'heading' ? `“${n.text}”` : n.type === 'system' ? 'the design system' : 'the picture');
  const lockedMaterial = (mid: string) => {
    const n = b.nodes.find((x) => x.type === 'material' && x.material === mid);
    return n?.locked && !opts.force ? n : null;
  };
  switch (op.op) {
    case 'node-add': {
      if (b.nodes.length >= MAX_NODES) return { ok: false, error: `A board holds at most ${MAX_NODES} things.` };
      const seen = new Set(b.nodes.map((n) => n.id));
      const n = nodeOf(op.node, seen);
      if (!n) return { ok: false, error: 'That is not something a board can hold.' };
      if (n.type === 'material' && !b.materials.some((m) => m.id === n.material)) return { ok: false, error: 'That material is not on this board.' };
      if (n.type === 'reference' && !b.assets.some((x) => x.id === n.asset)) return { ok: false, error: 'That picture is not on this board.' };
      if (n.type === 'note' && n.about && !b.nodes.some((x) => x.id === n.about)) delete n.about;
      return { ok: true, board: { ...b, nodes: [...b.nodes, n] }, touched: [n.id] };
    }
    case 'node-move': {
      if (!Number.isFinite(op.dx) || !Number.isFinite(op.dy)) return { ok: false, error: 'A move needs a distance.' };
      const ids = new Set(op.ids);
      const hit = op.ids.map(lockedNode).filter(Boolean) as BoardNode[];
      if (hit.length) return { ok: false, error: `${nodeName(hit[0])} is locked.`, locked: hit.map(nodeName) };
      if (!op.ids.every((id) => b.nodes.some((n) => n.id === id))) return { ok: false, error: 'That is not on this board.' };
      return { ok: true, board: { ...b, nodes: b.nodes.map((n) => (ids.has(n.id) ? { ...n, x: Math.max(-LIMIT, Math.min(LIMIT, n.x + op.dx)), y: Math.max(-LIMIT, Math.min(LIMIT, n.y + op.dy)) } : n)) }, touched: [...ids] };
    }
    case 'node-set': {
      const n = b.nodes.find((x) => x.id === op.id);
      if (!n) return { ok: false, error: 'That is not on this board.' };
      if (lockedNode(op.id)) return { ok: false, error: `${nodeName(n)} is locked.`, locked: [nodeName(n)] };
      const vals = [op.x, op.y, op.w, op.h].filter((x) => x !== undefined);
      if (!vals.every((x) => Number.isFinite(x))) return { ok: false, error: 'A size and a place are numbers.' };
      if ((op.w !== undefined && op.w < 8) || (op.h !== undefined && op.h < 8) || (op.w ?? 0) > 40000 || (op.h ?? 0) > 40000) return { ok: false, error: 'That size is outside what a board shows (8 to 40,000).' };
      const next = { ...n, ...(op.x !== undefined ? { x: op.x } : {}), ...(op.y !== undefined ? { y: op.y } : {}), ...(op.w !== undefined ? { w: op.w } : {}), ...(op.h !== undefined ? { h: op.h } : {}) };
      return { ok: true, board: { ...b, nodes: b.nodes.map((x) => (x.id === op.id ? next : x)) }, touched: [op.id] };
    }
    case 'note-write': {
      const n = b.nodes.find((x) => x.id === op.id);
      if (!n || n.type !== 'note') return { ok: false, error: 'That is not a note on this board.' };
      if (!n.generated) return { ok: false, error: 'That note is yours: SocriaUX does not rewrite it.' };
      if (lockedNode(op.id)) return { ok: false, error: `${nodeName(n)} is locked.`, locked: [nodeName(n)] };
      const text = String(op.text ?? '').slice(0, 2000).trim();
      if (!text) return { ok: false, error: 'A note needs words.' };
      const claims = claimsOf(op.claims);
      const next: NoteNode = { ...n, text };
      if (claims.length) next.claims = claims;
      else delete next.claims;
      return { ok: true, board: { ...b, nodes: b.nodes.map((x) => (x.id === op.id ? next : x)) }, touched: [op.id] };
    }
    case 'node-update': {
      const n = b.nodes.find((x) => x.id === op.id);
      if (!n) return { ok: false, error: 'That is not on this board.' };
      const unlocking = Object.keys(op.set).length === 1 && op.set.locked !== undefined;
      if (lockedNode(op.id) && !unlocking) return { ok: false, error: `${nodeName(n)} is locked.`, locked: [nodeName(n)] };
      const next: BoardNode = { ...n };
      if (op.set.text !== undefined) {
        const t = String(op.set.text).slice(0, 2000).trim();
        if (!t) return { ok: false, error: 'A note or a heading needs words.' };
        if (next.type === 'note' || next.type === 'heading') {
          next.text = t;
          // a note the designer rewrote is theirs: SocriaUX no longer checks it against the facts
          if (next.type === 'note' && next.generated) (next.generated = false), delete next.claims;
        }
      }
      if (op.set.caption !== undefined && next.type === 'reference') next.caption = String(op.set.caption).slice(0, 200);
      if (op.set.level !== undefined && next.type === 'heading') next.level = op.set.level === 1 ? 1 : 2;
      if (op.set.locked !== undefined) {
        if (op.set.locked) next.locked = true;
        else delete next.locked;
      }
      return { ok: true, board: { ...b, nodes: b.nodes.map((x) => (x.id === op.id ? next : x)) }, touched: [op.id] };
    }
    case 'node-remove': {
      const ids = new Set(op.ids);
      const hit = op.ids.map(lockedNode).filter(Boolean) as BoardNode[];
      if (hit.length) return { ok: false, error: `${nodeName(hit[0])} is locked.`, locked: hit.map(nodeName) };
      // removing a material's place on the board removes the material too (the board owns its graphics; a linked
      // website project itself is never touched)
      const gone = b.nodes.filter((n) => ids.has(n.id) && n.type === 'material').map((n) => (n as MaterialNode).material);
      let board: BoardState = { ...b, nodes: b.nodes.filter((n) => !ids.has(n.id)), connectors: b.connectors.filter((c) => !ids.has(c.from) && !ids.has(c.to)) };
      for (const mid of gone) {
        const r = applyBoardOp(board, { op: 'material-remove', id: mid }, opts);
        if (r.ok) board = r.board;
      }
      board = { ...board, nodes: board.nodes.map((n) => (n.type === 'note' && n.about && ids.has(n.about) ? (({ about, ...rest }) => rest as NoteNode)(n) : n)) };
      return { ok: true, board, touched: [...ids] };
    }
    case 'group': {
      const ids = [...new Set(op.ids)].filter((id) => b.nodes.some((n) => n.id === id));
      if (ids.length < 2) return { ok: false, error: 'Grouping needs two things or more.' };
      const g = boardId('g');
      return { ok: true, board: { ...b, nodes: b.nodes.map((n) => (ids.includes(n.id) ? { ...n, group: g } : n)) }, touched: ids };
    }
    case 'ungroup': {
      const groups = new Set(b.nodes.filter((n) => op.ids.includes(n.id) && n.group).map((n) => n.group));
      if (!groups.size) return { ok: false, error: 'Nothing there is grouped.' };
      return { ok: true, board: { ...b, nodes: b.nodes.map((n) => (n.group && groups.has(n.group) ? (({ group, ...rest }) => rest as BoardNode)(n) : n)) }, touched: b.nodes.filter((n) => n.group && groups.has(n.group)).map((n) => n.id) };
    }
    case 'connect': {
      if (op.from === op.to || !b.nodes.some((n) => n.id === op.from) || !b.nodes.some((n) => n.id === op.to)) return { ok: false, error: 'A connector joins two things on the board.' };
      if (b.connectors.some((c) => c.from === op.from && c.to === op.to)) return { ok: true, board: b, touched: [] };
      const c = { id: boardId('c'), from: op.from, to: op.to };
      return { ok: true, board: { ...b, connectors: [...b.connectors, c] }, touched: [c.id] };
    }
    case 'disconnect': {
      if (!b.connectors.some((c) => c.id === op.id)) return { ok: false, error: 'That connector is not on this board.' };
      return { ok: true, board: { ...b, connectors: b.connectors.filter((c) => c.id !== op.id) }, touched: [op.id] };
    }
    case 'material-add': {
      if (b.materials.length >= MAX_MATERIALS) return { ok: false, error: `A board holds at most ${MAX_MATERIALS} materials.` };
      const m = materialOf(op.material, new Set(b.materials.map((x) => x.id)));
      if (!m) return { ok: false, error: 'That is not a material a board can hold.' };
      if (m.type === 'mockup' && m.source && b.materials.find((x) => x.id === m.source!.material)?.type !== 'graphic') m.source = null;
      let board: BoardState = { ...b, materials: [...b.materials, m] };
      const touched = [m.id];
      if (op.place) {
        const r = applyBoardOp(board, { op: 'node-add', node: { type: 'material', material: m.id, ...op.place } }, opts);
        if (!r.ok) return r;
        board = r.board;
        touched.push(...r.touched);
      }
      return { ok: true, board, touched };
    }
    case 'material-update': {
      const m = b.materials.find((x) => x.id === op.id);
      if (!m) return { ok: false, error: 'That material is not on this board.' };
      const keys = Object.keys(op.set);
      if (!keys.every((k) => MATERIAL_FIELDS.has(k))) return { ok: false, error: `A material does not have ${keys.find((k) => !MATERIAL_FIELDS.has(k))}.` };
      // a locked material keeps its design: its status may still be read and reported
      if (lockedMaterial(op.id) && keys.some((k) => ['doc', 'bindings', 'brief', 'variant', 'source', 'template', 'view', 'projectId'].includes(k))) return { ok: false, error: `${m.name} is locked.`, locked: [m.name] };
      const merged = { ...m, ...op.set, id: m.id, type: m.type, revision: m.revision + 1 };
      const next = materialOf(merged, new Set());
      if (!next) return { ok: false, error: `That change would leave ${m.name} without what it needs.` };
      next.id = m.id;
      if (next.type === 'mockup' && next.source && b.materials.find((x) => x.id === next.source!.material)?.type !== 'graphic') return { ok: false, error: 'A mockup presents a graphic on this board.' };
      return { ok: true, board: { ...b, materials: b.materials.map((x) => (x.id === op.id ? next : x)) }, touched: [m.id] };
    }
    case 'material-remove': {
      const m = b.materials.find((x) => x.id === op.id);
      if (!m) return { ok: false, error: 'That material is not on this board.' };
      if (lockedMaterial(op.id)) return { ok: false, error: `${m.name} is locked.`, locked: [m.name] };
      const placed = new Set(b.nodes.filter((n) => n.type === 'material' && n.material === op.id).map((n) => n.id));
      return {
        ok: true,
        board: {
          ...b,
          // a mockup of it keeps its place and asks for another source
          materials: b.materials.filter((x) => x.id !== op.id).map((x) => (x.type === 'mockup' && x.source?.material === op.id ? { ...x, source: null, revision: x.revision + 1 } : x)),
          nodes: b.nodes.filter((n) => !placed.has(n.id)),
          connectors: b.connectors.filter((c) => !placed.has(c.from) && !placed.has(c.to)),
        },
        touched: [m.id],
      };
    }
    case 'material-duplicate': {
      const m = b.materials.find((x) => x.id === op.id);
      if (!m) return { ok: false, error: 'That material is not on this board.' };
      const copy = JSON.parse(JSON.stringify(m)) as Material;
      copy.id = boardId('m');
      copy.name = `${m.name} copy`.slice(0, 80);
      copy.revision = 0;
      const place = nodeOfMaterial(b, m.id);
      return applyBoardOp(b, { op: 'material-add', material: copy, ...(place ? { place: { x: place.x + place.w + 64, y: place.y, w: place.w, h: place.h } } : {}) }, opts);
    }
    case 'system': {
      const sys = normalizeSystem(op.system);
      if (!sys) return { ok: false, error: 'That is not a design system.' };
      return { ok: true, board: { ...b, system: sys }, touched: ['system'] };
    }
    case 'background':
      return { ok: true, board: { ...b, background: { color: hex(op.color, b.background.color), pattern: pick(op.pattern, ['dots', 'grid', 'none'] as const, b.background.pattern) } }, touched: ['background'] };
    case 'annotations':
      return { ok: true, board: { ...b, annotations: !!op.visible }, touched: ['annotations'] };
    case 'arrangement':
      return { ok: true, board: { ...b, arrangement: pick(op.how, ARRANGEMENTS, b.arrangement) }, touched: ['arrangement'] };
    case 'asset': {
      const x = normalizeAsset(op.asset);
      if (!x) return { ok: false, error: 'That picture could not be added (its address or kind is not one SocriaUX loads).' };
      if (b.assets.some((y) => y.id === x.id)) return { ok: true, board: b, touched: [] };
      return { ok: true, board: { ...b, assets: [...b.assets, x] }, touched: [x.id] };
    }
  }
  // an operation a board does not know (a model's invention, a damaged file): refused, never ignored
  return { ok: false, error: 'That is not an operation a board knows.' };
}

/** Operations applied in order, all or none. */
export function applyBoardOps(b: BoardState, ops: readonly BoardOp[], opts: { force?: boolean } = {}): BoardResult {
  let cur = b;
  const touched: string[] = [];
  for (const op of ops) {
    if (!op || typeof op !== 'object') return { ok: false, error: 'That is not an operation a board knows.' };
    const r = applyBoardOp(cur, op, opts);
    if (!r.ok) return r;
    cur = r.board;
    touched.push(...r.touched);
  }
  return { ok: true, board: cur, touched };
}

/** A board's state as a version keeps it (no versions inside versions). */
export const snapshotOf = (b: BoardState): Omit<BoardState, 'versions'> => {
  const { versions, ...rest } = b;
  void versions;
  return rest;
};

export type { GraphicDoc, GraphicKind };
