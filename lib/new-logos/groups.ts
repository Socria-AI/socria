// lib/new-logos/groups.ts — SPATIAL GROUPS on a canvas: objects kept together, as the person arranges them.
//
// A group is presentation, held in the canvas layout (lib/new-logos/canvas.ts: `groups`, and each item's `group`):
// it says nothing about what its members mean to each other (that is what relations are for). Groups may sit inside
// groups; one may be named, collapsed (its members hidden, the group shown as one small tile that says what it holds),
// expanded, moved whole (every member keeps its place relative to the others), or ungrouped (its members stay, in
// place, in the group around it). Its place is where its members are: a group has no position of its own.
//
// Every change here is a LAYOUT PATCH — the items and groups it touches, as they will be — so the operation engine
// applies it, saves it with the rest of the layout, and reverses it exactly (invertPatch). Pure: no I/O.

import { GAP, GROUP_ID_RE, GROUP_LIMITS, withItem, type Box, type CanvasLayout, type Group, type ItemLayout } from './canvas';

/** A collapsed group's tile on a canvas (drawn in its members' place; not a layout item). */
export const groupRef = (gid: string) => `g:${gid}`;
export const isGroupRef = (ref: string) => ref.startsWith('g:');

export interface LayoutPatch {
  items?: Record<string, Partial<ItemLayout> | null>;
  groups?: Record<string, Group | null>;
}

function rnd(n: number): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(b);
  else for (let k = 0; k < n; k++) b[k] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => a[x % a.length]).join('');
}
export function newGroupId(taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const id = `g_${rnd(10)}`;
    if (!taken.has(id)) return id;
  }
}

const groupsOf = (l: CanvasLayout) => l.groups ?? {};

/** The groups a group sits inside, nearest first. */
export function ancestors(l: CanvasLayout, gid: string): string[] {
  const out: string[] = [];
  let p = groupsOf(l)[gid]?.parent;
  while (p && !out.includes(p) && out.length < GROUP_LIMITS.depth) {
    out.push(p);
    p = groupsOf(l)[p]?.parent;
  }
  return out;
}

/** Groups directly inside a group (or at the top, for undefined). */
export const childGroups = (l: CanvasLayout, gid?: string) => Object.entries(groupsOf(l)).filter(([, g]) => g.parent === gid).map(([id]) => id);

/** Every group inside a group, at any depth. */
export function descendants(l: CanvasLayout, gid: string): string[] {
  const out: string[] = [];
  const walk = (g: string) => {
    for (const c of childGroups(l, g)) if (!out.includes(c)) (out.push(c), walk(c));
  };
  walk(gid);
  return out;
}

/** The objects in a group: directly, or (deep) in it and every group inside it. */
export function membersOf(l: CanvasLayout, gid: string, deep = true): string[] {
  const within = new Set([gid, ...(deep ? descendants(l, gid) : [])]);
  return Object.entries(l.items)
    .filter(([, it]) => it.group && within.has(it.group))
    .map(([ref]) => ref);
}

/** The groups an object sits in, nearest first. */
export function groupsAround(l: CanvasLayout, ref: string): string[] {
  const g = l.items[ref]?.group;
  return g && groupsOf(l)[g] ? [g, ...ancestors(l, g)] : [];
}

/** The box around a group's members (and the boxes of its inner groups), with room for its name. */
export function groupBounds(l: CanvasLayout, gid: string, sizeOf: (ref: string) => { w: number; h: number }, pad = 18): Box | null {
  const refs = membersOf(l, gid);
  if (!refs.length) return null;
  const boxes = refs.map((r) => ({ x: l.items[r].x, y: l.items[r].y, ...sizeOf(r) }));
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad - 22;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

/**
 * What a collapsed group hides: each hidden object, and the tile that stands for it — its OUTERMOST collapsed group
 * (a group collapsed inside a collapsed group is not drawn at all).
 */
export function hiddenBy(l: CanvasLayout): Map<string, string> {
  const out = new Map<string, string>();
  for (const [ref, it] of Object.entries(l.items)) {
    if (!it.group) continue;
    const chain = [it.group, ...ancestors(l, it.group)];
    const collapsed = chain.filter((g) => groupsOf(l)[g]?.collapsed);
    if (collapsed.length) out.set(ref, collapsed[collapsed.length - 1]);
  }
  return out;
}

/** Collapsed groups drawn as tiles (not inside another collapsed group, and holding something). */
export function tiles(l: CanvasLayout): string[] {
  return Object.entries(groupsOf(l))
    .filter(([gid, g]) => g.collapsed && !ancestors(l, gid).some((a) => groupsOf(l)[a]?.collapsed) && membersOf(l, gid).length > 0)
    .map(([gid]) => gid);
}

/** Expanded groups drawn as frames around their members (not inside a collapsed group, and holding something). */
export function frames(l: CanvasLayout): string[] {
  return Object.entries(groupsOf(l))
    .filter(([gid, g]) => !g.collapsed && !ancestors(l, gid).some((a) => groupsOf(l)[a]?.collapsed) && membersOf(l, gid).length > 0)
    .map(([gid]) => gid);
}

// ── changes, as patches ──────────────────────────────────────────────

/** Apply a patch: items merged onto what they were (a field set to undefined is cleared), groups set or removed. */
export function applyPatch(l: CanvasLayout, p: LayoutPatch): CanvasLayout {
  let next = l;
  for (const [ref, it] of Object.entries(p.items ?? {})) next = withItem(next, ref, it);
  if (p.groups && Object.keys(p.groups).length) {
    const groups = { ...groupsOf(next) };
    for (const [gid, g] of Object.entries(p.groups)) {
      if (!GROUP_ID_RE.test(gid)) continue;
      if (g === null) delete groups[gid];
      else {
        const clean: Group = {};
        if (g.name) clean.name = g.name.replace(/\s+/g, ' ').trim().slice(0, GROUP_LIMITS.name);
        if (g.collapsed) clean.collapsed = true;
        if (g.parent && g.parent !== gid) clean.parent = g.parent;
        groups[gid] = clean;
      }
    }
    const out: CanvasLayout = { items: next.items };
    if (next.view) out.view = next.view;
    if (Object.keys(groups).length) out.groups = groups;
    next = out;
  }
  return next;
}

/** The patch that puts back what `p` changes, read from the layout before it (exact: unset fields are cleared). */
export function invertPatch(before: CanvasLayout, p: LayoutPatch): LayoutPatch {
  const items: Record<string, Partial<ItemLayout> | null> = {};
  for (const ref of Object.keys(p.items ?? {})) {
    const was = before.items[ref];
    items[ref] = was ? { x: was.x, y: was.y, open: was.open ?? undefined, from: was.from ?? undefined, group: was.group ?? undefined } : null;
  }
  const groups: Record<string, Group | null> = {};
  for (const gid of Object.keys(p.groups ?? {})) groups[gid] = groupsOf(before)[gid] ? { ...groupsOf(before)[gid] } : null;
  return { ...(Object.keys(items).length ? { items } : {}), ...(Object.keys(groups).length ? { groups } : {}) };
}

/**
 * Group objects (and groups, by their g: refs) into a new group. When they all sit in one group, the new group sits
 * inside it; otherwise it is at the top. Objects already in other groups move into the new one; groups grouped keep
 * their own members.
 */
export function groupPatch(l: CanvasLayout, refs: readonly string[], opts: { gid: string; name?: string }): LayoutPatch | null {
  const objects = refs.filter((r) => !isGroupRef(r) && l.items[r]);
  const inner = refs.filter(isGroupRef).map((r) => r.slice(2)).filter((g) => groupsOf(l)[g]);
  if (objects.length + inner.length < 1) return null;
  const parents = new Set([...objects.map((r) => l.items[r].group ?? ''), ...inner.map((g) => groupsOf(l)[g].parent ?? '')]);
  const parent = parents.size === 1 ? [...parents][0] || undefined : undefined;
  if (parent && ancestors(l, parent).length + 2 > GROUP_LIMITS.depth) return null;
  const items: Record<string, Partial<ItemLayout> | null> = {};
  for (const r of objects) items[r] = { group: opts.gid };
  const groups: Record<string, Group | null> = { [opts.gid]: { ...(opts.name ? { name: opts.name } : {}), ...(parent ? { parent } : {}) } };
  for (const g of inner) if (g !== opts.gid && !ancestors(l, opts.gid).includes(g)) groups[g] = { ...groupsOf(l)[g], parent: opts.gid };
  return { items, groups };
}

/** Ungroup: the group goes; its members and inner groups stay where they are, in the group around it. */
export function ungroupPatch(l: CanvasLayout, gid: string): LayoutPatch | null {
  const g = groupsOf(l)[gid];
  if (!g) return null;
  const items: Record<string, Partial<ItemLayout> | null> = {};
  for (const r of membersOf(l, gid, false)) items[r] = { group: g.parent ?? undefined };
  const groups: Record<string, Group | null> = { [gid]: null };
  for (const c of childGroups(l, gid)) groups[c] = { ...groupsOf(l)[c], parent: g.parent ?? undefined };
  return { items, groups };
}

export function collapsePatch(l: CanvasLayout, gid: string, collapsed: boolean): LayoutPatch | null {
  const g = groupsOf(l)[gid];
  if (!g || !!g.collapsed === collapsed) return null;
  return { groups: { [gid]: { ...g, collapsed: collapsed || undefined } } };
}

export function renamePatch(l: CanvasLayout, gid: string, name: string): LayoutPatch | null {
  const g = groupsOf(l)[gid];
  if (!g) return null;
  return { groups: { [gid]: { ...g, name: name.trim() || undefined } } };
}

/** Move objects, and groups whole (every member of a g: ref, at any depth), by a distance. */
export function movePatch(l: CanvasLayout, refs: readonly string[], dx: number, dy: number): LayoutPatch | null {
  const all = new Set<string>();
  for (const r of refs) {
    if (isGroupRef(r)) membersOf(l, r.slice(2)).forEach((m) => all.add(m));
    else if (l.items[r]) all.add(r);
  }
  if (!all.size || (!dx && !dy)) return null;
  const items: Record<string, Partial<ItemLayout> | null> = {};
  for (const r of all) items[r] = { x: Math.round(l.items[r].x + dx), y: Math.round(l.items[r].y + dy) };
  return { items };
}

/** Put objects beside a target object (to its right, then below), keeping their arrangement among themselves. */
export function besidePatch(l: CanvasLayout, refs: readonly string[], target: string, sizeOf: (ref: string) => { w: number; h: number }): LayoutPatch | null {
  const t = l.items[target];
  const moving = refs.flatMap((r) => (isGroupRef(r) ? membersOf(l, r.slice(2)) : l.items[r] ? [r] : [])).filter((r) => r !== target);
  if (!t || !moving.length) return null;
  const minX = Math.min(...moving.map((r) => l.items[r].x));
  const minY = Math.min(...moving.map((r) => l.items[r].y));
  const tw = sizeOf(target).w;
  return movePatch(l, moving, t.x + tw + GAP * 1.5 - minX, t.y - minY);
}

/** Arrange objects in tidy rows inside the box they occupy now (for "organise"): a deterministic grid, by order given. */
export function arrangePatch(l: CanvasLayout, refs: readonly string[], sizeOf: (ref: string) => { w: number; h: number }, columns = 3): LayoutPatch | null {
  const objs = refs.filter((r) => l.items[r]);
  if (objs.length < 2) return null;
  const x0 = Math.min(...objs.map((r) => l.items[r].x));
  const y0 = Math.min(...objs.map((r) => l.items[r].y));
  const items: Record<string, Partial<ItemLayout> | null> = {};
  let x = x0, y = y0, rowH = 0;
  objs.forEach((r, k) => {
    const s = sizeOf(r);
    if (k > 0 && k % columns === 0) {
      x = x0;
      y += rowH + GAP;
      rowH = 0;
    }
    items[r] = { x: Math.round(x), y: Math.round(y) };
    x += s.w + GAP;
    rowH = Math.max(rowH, s.h);
  });
  return { items };
}

/** Patches joined in order (a later one wins where both touch the same item or group). */
export function joinPatches(...ps: (LayoutPatch | null | undefined)[]): LayoutPatch {
  const items: Record<string, Partial<ItemLayout> | null> = {};
  const groups: Record<string, Group | null> = {};
  for (const p of ps) {
    if (!p) continue;
    for (const [r, v] of Object.entries(p.items ?? {})) items[r] = v === null ? null : { ...(items[r] ?? {}), ...v };
    for (const [g, v] of Object.entries(p.groups ?? {})) groups[g] = v;
  }
  return { ...(Object.keys(items).length ? { items } : {}), ...(Object.keys(groups).length ? { groups } : {}) };
}

/** A collapsed group in words, for its tile and for reading aloud: "3 possibilities, a model and a document". */
export function contentsInWords(kinds: readonly string[], words: (k: string, n: number) => string): string {
  const n = new Map<string, number>();
  for (const k of kinds) n.set(k, (n.get(k) ?? 0) + 1);
  const parts = [...n].map(([k, c]) => words(k, c));
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
