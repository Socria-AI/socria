// lib/workspace/tiling.ts
//
// THE LOGOS 3 WORKSPACE, AS DATA: a tree of splits and panels.
//
// A panel is a SURFACE (chat, the map, a model, its parameters…) looking at
// the one canonical state a line of thinking holds. This file knows nothing
// about what any surface draws — only how they are arranged — and nothing here
// is ever written into that canonical state. A layout is a person's own
// arrangement of their screen: it persists per browser, it never travels with
// a session or into a shared room, and changing it never touches a model's
// history. Two people thinking together share the model and keep their own
// layouts.
//
// TILED, NOT FLOATING. A split divides its space among its children in one
// direction, by fractions that sum to one; a panel fills what it is given.
// Nothing overlaps and nothing is lost off-screen, which is the difference
// between a workspace and a pile of windows.
//
// PURE. Every operation takes a layout and returns a new one; the shell
// renders it and the suite holds it.

export const SURFACE_TYPES = ['chat', 'map', 'model', 'params', 'inspector', 'trace'] as const;
export type SurfaceType = (typeof SURFACE_TYPES)[number];

/** What a panel is pointed at, beyond its type. All optional, all small. */
export interface PanelConfig {
  /** a model document, when the panel is pinned to one rather than the active one */
  doc?: string;
  /** a representation of that model (lib/model/views.ts ids), pinned to this panel */
  view?: string;
  /** a lens of the Thinking Map */
  lens?: string;
}

export interface PanelNode {
  kind: 'panel';
  id: string;
  type: SurfaceType;
  config?: PanelConfig;
}

export interface SplitNode {
  kind: 'split';
  id: string;
  /** 'row' lays children side by side; 'col' stacks them */
  dir: 'row' | 'col';
  /** fractions of the split's space, one per child, summing to 1 */
  sizes: number[];
  children: LayoutNode[];
}

export type LayoutNode = PanelNode | SplitNode;

export interface WorkspaceLayout {
  v: 1;
  root: LayoutNode | null;
  /** a panel temporarily given the whole workspace; restore returns the rest */
  maximized?: string | null;
  /** the preset this started from, if any — a starting point, never a mode */
  preset?: PresetId | null;
}

export const LIMITS = { panels: 8, depth: 4, minFraction: 0.1 } as const;

// ── reading ───────────────────────────────────────────────────────

/** Every panel, in reading order (left to right, top to bottom). */
export function panelsOf(layout: WorkspaceLayout): PanelNode[] {
  const out: PanelNode[] = [];
  const walk = (n: LayoutNode | null) => {
    if (!n) return;
    if (n.kind === 'panel') out.push(n);
    else n.children.forEach(walk);
  };
  walk(layout.root);
  return out;
}

export function findPanel(layout: WorkspaceLayout, id: string): PanelNode | null {
  return panelsOf(layout).find((p) => p.id === id) ?? null;
}

/** Is a surface of this type (and config, when given) already open? */
export function isOpen(layout: WorkspaceLayout, type: SurfaceType, config?: PanelConfig): boolean {
  return panelsOf(layout).some(
    (p) =>
      p.type === type &&
      (!config || ((config.doc ?? '') === (p.config?.doc ?? '') && (config.view ?? '') === (p.config?.view ?? '') && (config.lens ?? '') === (p.config?.lens ?? '')))
  );
}

/** A fresh id that no node in this layout uses. Deterministic, so a suite can read it. */
function freshId(layout: WorkspaceLayout, prefix: 'p' | 's'): string {
  const used = new Set<string>();
  const walk = (n: LayoutNode | null) => {
    if (!n) return;
    used.add(n.id);
    if (n.kind === 'split') n.children.forEach(walk);
  };
  walk(layout.root);
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

// ── transforming ──────────────────────────────────────────────────

/** Rebuild the tree, replacing the node with `id` by what `fn` returns (null removes it). */
function mapNode(
  node: LayoutNode | null,
  id: string,
  fn: (n: LayoutNode) => LayoutNode | null
): LayoutNode | null {
  if (!node) return null;
  if (node.id === id) return fn(node);
  if (node.kind === 'panel') return node;
  const kept: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((c, i) => {
    const next = mapNode(c, id, fn);
    if (next) {
      kept.push(next);
      sizes.push(node.sizes[i] ?? 1 / node.children.length);
    }
  });
  return collapse({ ...node, children: kept, sizes: normalize(sizes) });
}

/** A split with one child is that child; a split with none is nothing; a child split in the same direction merges up. */
function collapse(node: SplitNode): LayoutNode | null {
  if (!node.children.length) return null;
  if (node.children.length === 1) return node.children[0];
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((c, i) => {
    if (c.kind === 'split' && c.dir === node.dir) {
      c.children.forEach((cc, j) => {
        children.push(cc);
        sizes.push(node.sizes[i] * c.sizes[j]);
      });
    } else {
      children.push(c);
      sizes.push(node.sizes[i]);
    }
  });
  return { ...node, children, sizes: normalize(sizes) };
}

export function normalize(sizes: number[]): number[] {
  const clean = sizes.map((s) => (Number.isFinite(s) && s > 0 ? s : 0));
  const sum = clean.reduce((a, b) => a + b, 0);
  if (!sum) return sizes.map(() => 1 / Math.max(1, sizes.length));
  return clean.map((s) => s / sum);
}

function parentOf(root: LayoutNode | null, id: string): SplitNode | null {
  if (!root || root.kind === 'panel') return null;
  for (const c of root.children) {
    if (c.id === id) return root;
    const deeper = parentOf(c, id);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * Open a new panel beside an existing one.
 *
 * `dir` is the direction of the cut: 'row' puts them side by side, 'col'
 * stacks them. When the panel already sits in a split of that direction the
 * new one joins it as a sibling, taking half the target's share, rather than
 * nesting a split inside a split for no reason.
 */
export function splitPanel(
  layout: WorkspaceLayout,
  targetId: string,
  dir: 'row' | 'col',
  panel: { type: SurfaceType; config?: PanelConfig },
  side: 'before' | 'after' = 'after',
  /** the share of the target's room the new panel takes */
  share = 0.5
): { layout: WorkspaceLayout; id: string | null } {
  if (panelsOf(layout).length >= LIMITS.panels) return { layout, id: null };
  const k = Math.min(0.9, Math.max(0.1, share));
  if (!findPanel(layout, targetId)) return { layout, id: null };
  const id = freshId(layout, 'p');
  const fresh: PanelNode = { kind: 'panel', id, type: panel.type, ...(panel.config ? { config: { ...panel.config } } : {}) };
  const parent = parentOf(layout.root, targetId);
  if (parent && parent.dir === dir) {
    const root = mapNode(layout.root, parent.id, (n) => {
      const s = n as SplitNode;
      const i = s.children.findIndex((c) => c.id === targetId);
      const children = [...s.children];
      const sizes = [...s.sizes];
      const given = sizes[i] * k;
      sizes[i] = sizes[i] - given;
      const at = side === 'after' ? i + 1 : i;
      children.splice(at, 0, fresh);
      sizes.splice(at, 0, given);
      return { ...s, children, sizes: normalize(sizes) };
    });
    return { layout: { ...layout, root, preset: null }, id };
  }
  const sid = freshId(layout, 's');
  const root = mapNode(layout.root, targetId, (n) => ({
    kind: 'split',
    id: sid,
    dir,
    sizes: side === 'after' ? [1 - k, k] : [k, 1 - k],
    children: side === 'after' ? [n, fresh] : [fresh, n],
  }));
  return { layout: { ...layout, root, preset: null }, id };
}

/** Close a panel. Its space goes to its neighbours; the last panel can close too. */
export function closePanel(layout: WorkspaceLayout, id: string): WorkspaceLayout {
  if (!findPanel(layout, id)) return layout;
  const root = mapNode(layout.root, id, () => null);
  return { ...layout, root, maximized: layout.maximized === id ? null : layout.maximized ?? null, preset: null };
}

/** Point a panel at a different surface, in place. */
export function replacePanel(layout: WorkspaceLayout, id: string, type: SurfaceType, config?: PanelConfig): WorkspaceLayout {
  if (!findPanel(layout, id)) return layout;
  const root = mapNode(layout.root, id, (n) => ({ kind: 'panel', id: n.id, type, ...(config ? { config: { ...config } } : {}) }));
  return { ...layout, root, preset: null };
}

/** Change what a panel is pointed at — its pinned view, model or lens. */
export function configurePanel(layout: WorkspaceLayout, id: string, config: PanelConfig): WorkspaceLayout {
  const p = findPanel(layout, id);
  if (!p) return layout;
  const merged: PanelConfig = { ...(p.config ?? {}), ...config };
  for (const k of Object.keys(merged) as (keyof PanelConfig)[]) if (!merged[k]) delete merged[k];
  const root = mapNode(layout.root, id, (n) => ({ ...(n as PanelNode), ...(Object.keys(merged).length ? { config: merged } : { config: undefined }) }));
  return { ...layout, root };
}

/**
 * Move the divider after child `index` of a split by `delta` (a fraction of
 * the split). Neither neighbour goes below the minimum, so a panel can be made
 * small but never lost.
 */
export function resizeSplit(layout: WorkspaceLayout, splitId: string, index: number, delta: number): WorkspaceLayout {
  const root = mapNode(layout.root, splitId, (n) => {
    if (n.kind !== 'split' || index < 0 || index >= n.children.length - 1) return n;
    const sizes = [...n.sizes];
    const pair = sizes[index] + sizes[index + 1];
    const min = Math.min(LIMITS.minFraction, pair / 2);
    const a = Math.max(min, Math.min(pair - min, sizes[index] + delta));
    sizes[index] = a;
    sizes[index + 1] = pair - a;
    return { ...n, sizes };
  });
  return { ...layout, root };
}

/** Give one panel the whole workspace for a while; the rest are kept exactly as they were. */
export function maximize(layout: WorkspaceLayout, id: string): WorkspaceLayout {
  return findPanel(layout, id) ? { ...layout, maximized: id } : layout;
}

export function restore(layout: WorkspaceLayout): WorkspaceLayout {
  return { ...layout, maximized: null };
}

/**
 * Drag a panel onto another: an edge splits the target on that side, the
 * centre swaps the two in place.
 */
export function movePanel(
  layout: WorkspaceLayout,
  id: string,
  targetId: string,
  zone: 'left' | 'right' | 'top' | 'bottom' | 'center'
): WorkspaceLayout {
  if (id === targetId) return layout;
  const a = findPanel(layout, id);
  const b = findPanel(layout, targetId);
  if (!a || !b) return layout;
  if (zone === 'center') {
    const swap = (n: LayoutNode | null): LayoutNode | null => {
      if (!n) return null;
      if (n.kind === 'panel') return n.id === a.id ? { ...b } : n.id === b.id ? { ...a } : n;
      return { ...n, children: n.children.map((c) => swap(c)!) };
    };
    return { ...layout, root: swap(layout.root), preset: null };
  }
  const without = closePanel(layout, id);
  const dir = zone === 'left' || zone === 'right' ? 'row' : 'col';
  const side = zone === 'left' || zone === 'top' ? 'before' : 'after';
  const placed = splitPanel(without, targetId, dir, { type: a.type, config: a.config }, side);
  if (!placed.id) return layout;
  // Keep the panel's identity: it moved, it was not replaced.
  const root = mapNode(placed.layout.root, placed.id, (n) => ({ ...(n as PanelNode), id: a.id }));
  return { ...placed.layout, root, maximized: layout.maximized === id ? id : placed.layout.maximized ?? null };
}

/**
 * Add a surface somewhere sensible: beside the largest panel, cut along its
 * longer side. An empty workspace gets it as its only panel.
 */
export function addPanel(
  layout: WorkspaceLayout,
  panel: { type: SurfaceType; config?: PanelConfig },
  aspect = 1.6,
  share = 0.5
): { layout: WorkspaceLayout; id: string | null } {
  if (!layout.root) {
    const id = 'p1';
    return {
      layout: { ...layout, root: { kind: 'panel', id, type: panel.type, ...(panel.config ? { config: { ...panel.config } } : {}) }, maximized: null, preset: null },
      id,
    };
  }
  let best: { id: string; area: number; w: number; h: number } | null = null;
  const walk = (n: LayoutNode, w: number, h: number) => {
    if (n.kind === 'panel') {
      if (!best || w * h > best.area + 1e-9) best = { id: n.id, area: w * h, w, h };
      return;
    }
    n.children.forEach((c, i) => walk(c, n.dir === 'row' ? w * n.sizes[i] : w, n.dir === 'col' ? h * n.sizes[i] : h));
  };
  walk(layout.root, aspect, 1);
  const target = best as { id: string; area: number; w: number; h: number } | null;
  if (!target) return { layout, id: null };
  return splitPanel({ ...layout, maximized: null }, target.id, target.w >= target.h ? 'row' : 'col', panel, 'after', share);
}

// ── presets: starting points, not modes ───────────────────────────

export const PRESETS = [
  { id: 'think', label: 'Think', says: 'The map large, the conversation beneath it.' },
  { id: 'model', label: 'Model', says: 'The model, with its parameters and the inspector beside it.' },
  { id: 'research', label: 'Research', says: 'The map, its evidence, and the conversation.' },
  { id: 'compare', label: 'Compare', says: 'Two models — or two views of one — side by side.' },
  { id: 'deep', label: 'Deep work', says: 'One surface, nearly the whole screen.' },
  { id: 'brainstorm', label: 'Brainstorm', says: 'The map beside the conversation, the inspector close by.' },
] as const;
export type PresetId = (typeof PRESETS)[number]['id'];

const P = (id: string, type: SurfaceType, config?: PanelConfig): PanelNode => ({ kind: 'panel', id, type, ...(config ? { config } : {}) });
const S = (id: string, dir: 'row' | 'col', sizes: number[], children: LayoutNode[]): SplitNode => ({ kind: 'split', id, dir, sizes, children });

/**
 * A preset, built for what this line of thinking actually holds. `docs` are
 * its model documents, newest last; `views` the drawable views of the active
 * one. A preset that wants a model where there is none starts from the map
 * instead — a conceptual question is not handed an empty model panel.
 */
export function presetLayout(
  id: PresetId,
  ctx: { docs: string[]; views?: { id: string; primary?: boolean }[]; hasViz?: boolean }
): WorkspaceLayout {
  const hasModel = ctx.docs.length > 0 || !!ctx.hasViz;
  const lead: SurfaceType = hasModel ? 'model' : 'map';
  let root: LayoutNode;
  switch (id) {
    case 'model':
      root = hasModel
        ? S('s1', 'row', [0.66, 0.34], [
            S('s2', 'col', [0.68, 0.32], [P('p1', 'model'), P('p2', 'chat')]),
            ctx.docs.length
              ? S('s3', 'col', [0.5, 0.5], [P('p3', 'params'), P('p4', 'inspector')])
              : P('p3', 'inspector'),
          ])
        : S('s1', 'col', [0.62, 0.38], [P('p1', 'map'), P('p2', 'chat')]);
      break;
    case 'research':
      root = S('s1', 'row', [0.5, 0.5], [
        P('p1', 'map'),
        S('s2', 'col', [0.5, 0.5], [P('p2', 'map', { lens: 'evidence' }), P('p3', 'chat')]),
      ]);
      break;
    case 'compare': {
      if (ctx.docs.length >= 2) {
        const [a, b] = ctx.docs.slice(-2);
        root = S('s1', 'col', [0.64, 0.36], [
          S('s2', 'row', [0.5, 0.5], [P('p1', 'model', { doc: a }), P('p2', 'model', { doc: b })]),
          P('p3', 'chat'),
        ]);
      } else if (ctx.docs.length === 1) {
        // One model: compare two ways of looking at it, both live on the same state.
        const drawn = (ctx.views ?? []).filter((v) => !v.primary);
        root = S('s1', 'col', [0.64, 0.36], [
          S('s2', 'row', [0.5, 0.5], [P('p1', 'model'), P('p2', 'model', drawn[0] ? { view: drawn[0].id } : undefined)]),
          P('p3', 'chat'),
        ]);
      } else {
        root = S('s1', 'col', [0.64, 0.36], [
          S('s2', 'row', [0.5, 0.5], [P('p1', 'map'), P('p2', 'map', { lens: 'tensions' })]),
          P('p3', 'chat'),
        ]);
      }
      break;
    }
    case 'deep':
      root = S('s1', 'col', [0.84, 0.16], [P('p1', lead), P('p2', 'chat')]);
      break;
    case 'brainstorm':
      root = S('s1', 'row', [0.62, 0.38], [P('p1', 'map'), S('s2', 'col', [0.64, 0.36], [P('p2', 'chat'), P('p3', 'inspector')])]);
      break;
    case 'think':
    default:
      root = S('s1', 'col', [0.62, 0.38], [P('p1', 'map'), P('p2', 'chat')]);
      if (hasModel) root = S('s0', 'row', [0.58, 0.42], [root, P('p3', 'model')]);
      break;
  }
  return { v: 1, root, maximized: null, preset: id };
}

// ── persistence ───────────────────────────────────────────────────

/**
 * A layout read back from storage, or null when it cannot be trusted.
 *
 * Storage is a browser's and can hold anything — an older shape, a hand edit,
 * half a write. Unknown surfaces are dropped, sizes renormalised, depth and
 * count bounded and ids made unique; a layout that is not a layout at all is
 * null, and the caller starts from a preset. Nothing here can reach canonical
 * state: a layout names surfaces and documents, it never holds a model.
 */
export function sanitizeLayout(raw: unknown): WorkspaceLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { v?: unknown; root?: unknown; maximized?: unknown; preset?: unknown };
  if (r.v !== 1) return null;
  const seen = new Set<string>();
  let count = 0;
  const idOk = (v: unknown): v is string => typeof v === 'string' && /^[ps]\d{1,4}$/.test(v) && !seen.has(v);
  const cleanConfig = (c: unknown): PanelConfig | undefined => {
    if (!c || typeof c !== 'object') return undefined;
    const o = c as Record<string, unknown>;
    const out: PanelConfig = {};
    for (const k of ['doc', 'view', 'lens'] as const) {
      const v = o[k];
      if (typeof v === 'string' && /^[\w:.@-]{1,64}$/.test(v)) out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  };
  const walk = (n: unknown, depth: number): LayoutNode | null => {
    if (!n || typeof n !== 'object' || depth > LIMITS.depth) return null;
    const o = n as Record<string, unknown>;
    if (o.kind === 'panel') {
      if (!idOk(o.id) || !(SURFACE_TYPES as readonly string[]).includes(o.type as string) || count >= LIMITS.panels) return null;
      seen.add(o.id);
      count++;
      const config = cleanConfig(o.config);
      return { kind: 'panel', id: o.id, type: o.type as SurfaceType, ...(config ? { config } : {}) };
    }
    if (o.kind === 'split') {
      if (!idOk(o.id) || (o.dir !== 'row' && o.dir !== 'col') || !Array.isArray(o.children)) return null;
      seen.add(o.id);
      const sizesIn = Array.isArray(o.sizes) ? o.sizes : [];
      const children: LayoutNode[] = [];
      const sizes: number[] = [];
      o.children.slice(0, LIMITS.panels).forEach((c, i) => {
        const k = walk(c, depth + 1);
        if (k) {
          children.push(k);
          const s = sizesIn[i];
          sizes.push(typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 1);
        }
      });
      return collapse({ kind: 'split', id: o.id, dir: o.dir, sizes: normalize(sizes), children });
    }
    return null;
  };
  const root = walk(r.root, 0);
  const layout: WorkspaceLayout = { v: 1, root };
  const max = typeof r.maximized === 'string' ? r.maximized : null;
  layout.maximized = max && findPanel(layout, max) ? max : null;
  layout.preset = PRESETS.some((p) => p.id === r.preset) ? (r.preset as PresetId) : null;
  return layout;
}

// ── simple at rest ────────────────────────────────────────────────

/** One surface, the whole workspace. Where Logos 3 starts, and where "one view" returns. */
export function singleLayout(type: SurfaceType, config?: PanelConfig): WorkspaceLayout {
  return { v: 1, root: P('p1', type, config), maximized: null, preset: null };
}

/** The panel with the most room — the one in focus when there are several. */
export function dominantPanel(layout: WorkspaceLayout, aspect = 1.6): PanelNode | null {
  let best: { p: PanelNode; area: number } | null = null;
  const walk = (n: LayoutNode | null, w: number, h: number) => {
    if (!n) return;
    if (n.kind === 'panel') {
      if (!best || w * h > best.area + 1e-9) best = { p: n, area: w * h };
      return;
    }
    n.children.forEach((c, i) => walk(c, n.dir === 'row' ? w * n.sizes[i] : w, n.dir === 'col' ? h * n.sizes[i] : h));
  };
  walk(layout.root, aspect, 1);
  return (best as { p: PanelNode; area: number } | null)?.p ?? null;
}

/** Two surfaces side by side, the first given more room. */
export function pairLayout(a: { type: SurfaceType; config?: PanelConfig }, b: { type: SurfaceType; config?: PanelConfig }, share = 0.5): WorkspaceLayout {
  return { v: 1, root: S('s1', 'row', [share, 1 - share], [P('p1', a.type, a.config), P('p2', b.type, b.config)]), maximized: null, preset: null };
}
