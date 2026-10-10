// A DIAGRAM — things, and how they connect.
//
// "Map out the causes of the French Revolution", "an org chart for my team",
// "a flowchart of how admissions works", "a mind map for my essay topic",
// "should we launch? draw it as a decision tree": one state — nodes, each with
// a label and optionally a note, a group, a kind (decision, chance, outcome)
// and an outcome's payoff, and the connections between them, each with an
// optional label and, out of a chance node, a probability. The concept map,
// the mind map, the hierarchy, the flowchart, the decision tree and the
// outline are VIEWS of that one state: switching between them changes how it
// is drawn, never what it holds.
//
// What is computed, never asserted:
//   - where it starts (its roots) and whether it is a tree;
//   - the layout of every view, in abstract units — the same diagram always
//     gives the same picture and no two boxes overlap; a node the person
//     placed by hand stays exactly where they put it;
//   - a decision tree rolled back: a chance node is worth Σ p · value of its
//     branches, a decision node its best branch (and which one is recorded);
//     a missing payoff or probability, or chances that do not add up to one,
//     are reported — never filled in;
//   - what "simple" detail shows: the root and two levels beneath it, or the
//     twelve best-connected nodes.
//
// Two helpers here are shared with display-argument.ts and belong in
// display-base.ts when it next changes: `tidyTree` (a tree layout for any
// forest) and `askedView` (a view request read strictly, so a sentence that
// merely mentions a map is not one).
//
// PURE.

import type { LogosEdge, LogosNode } from '@/lib/logos';
import { settle } from '@/lib/mind/layout';
import { orderSpine } from '@/lib/representation';
import { register, type Part, type ViewDecl } from './core';
import {
  cleanBy,
  cleanId,
  cleanText,
  displayKind,
  findByLabel,
  guardBy,
  guardOwn,
  headOps,
  nextId,
  norm,
  num,
  op,
  registerDisplay,
  sayNum,
  type Args,
  type By,
  type Ctx,
  type DisplayHead,
} from './display-base';

export type DiagramView = 'concept' | 'mind' | 'hierarchy' | 'flow' | 'decision' | 'outline';
export type NodeKind = 'decision' | 'chance' | 'outcome';
export type Detail = 'full' | 'simple';

export interface DiagramNode {
  id: string;
  label: string;
  note?: string;
  /** a cluster it belongs to: "Causes", "Engineering" */
  group?: string;
  /** what it is in a decision tree */
  kind?: NodeKind;
  /** an outcome's payoff — kept on outcomes only; what a decision or a chance is worth is computed */
  value?: number;
  /** where the person placed it in the concept view, 0..1 across and down — both or neither */
  x?: number;
  y?: number;
  by: By;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  /** the chance of this branch, 0..1 — what a chance node's branches carry */
  prob?: number;
  by: By;
}

export interface DiagramState extends DisplayHead {
  view: DiagramView;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** the node the person chose to grow it from; absent, the one node nothing points into (if there is exactly one) */
  root?: string;
  detail: Detail;
}

export const DIAGRAM_LIMITS = {
  nodes: 60,
  edges: 90,
  title: 80,
  label: 80,
  note: 240,
  group: 40,
  groups: 8,
  edgeLabel: 40,
  /** nodes `simple` detail keeps when there is no root */
  simple: 12,
  /** levels beneath the root `simple` detail keeps */
  simpleDepth: 2,
} as const;

const VIEW_IDS: DiagramView[] = ['concept', 'mind', 'hierarchy', 'flow', 'decision', 'outline'];
const KINDS: NodeKind[] = ['decision', 'chance', 'outcome'];
export const KIND_WORD: Record<NodeKind, string> = { decision: 'a decision', chance: 'a chance', outcome: 'an outcome' };
/** Probabilities that add up to one within this are taken to add up to one. */
export const PROB_TOLERANCE = 1e-6;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
/** Arithmetic noise off a computed value, as `num` stores a given one. */
const tidy = (v: number) => Number(v.toPrecision(10));

// ── canonical state ──────────────────────────────────────────────────

export function sanitizeDiagram(raw: unknown): DiagramState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.nodes)) return null;
  const nodes: DiagramNode[] = [];
  const ids = new Set<string>();
  const groups: string[] = [];
  for (const x of r.nodes) {
    if (nodes.length >= DIAGRAM_LIMITS.nodes) break;
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const label = cleanText(o.label ?? o.text ?? o.title, DIAGRAM_LIMITS.label);
    if (!label) continue;
    let id = cleanId(o.id);
    if (!id || ids.has(id)) id = nextId('n', ids);
    ids.add(id);
    const note = cleanText(o.note, DIAGRAM_LIMITS.note) || undefined;
    let group = cleanText(o.group, DIAGRAM_LIMITS.group) || undefined;
    if (group && !groups.includes(group)) {
      if (groups.length < DIAGRAM_LIMITS.groups) groups.push(group);
      else group = undefined;
    }
    const kind = KINDS.includes(o.kind as NodeKind) ? (o.kind as NodeKind) : undefined;
    // a payoff belongs to an outcome; a value on a decision or a chance would be
    // somebody's arithmetic, and that is computed here instead
    const value = kind === 'outcome' ? num(o.value) : null;
    const px = num(o.x, 0, 1);
    const py = num(o.y, 0, 1);
    nodes.push({
      id,
      label,
      ...(note ? { note } : {}),
      ...(group ? { group } : {}),
      ...(kind ? { kind } : {}),
      ...(value !== null ? { value } : {}),
      ...(px !== null && py !== null ? { x: round4(px), y: round4(py) } : {}),
      by: cleanBy(o.by),
    });
  }
  const edges: DiagramEdge[] = [];
  for (const x of Array.isArray(r.edges) ? r.edges : []) {
    if (edges.length >= DIAGRAM_LIMITS.edges) break;
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
    const from = cleanId(o?.from);
    const to = cleanId(o?.to);
    if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) continue;
    if (edges.some((e) => e.from === from && e.to === to)) continue;
    const label = cleanText(o?.label, DIAGRAM_LIMITS.edgeLabel) || undefined;
    const prob = num(o?.prob ?? o?.p, 0, 1);
    edges.push({ from, to, ...(label ? { label } : {}), ...(prob !== null ? { prob } : {}), by: cleanBy(o?.by) });
  }
  const root = cleanId(r.root);
  const base = {
    title: cleanText(r.title, DIAGRAM_LIMITS.title) || 'Diagram',
    nodes,
    edges,
    ...(root && ids.has(root) ? { root } : {}),
    detail: (r.detail === 'simple' ? 'simple' : 'full') as Detail,
  };
  const view = VIEW_IDS.includes(r.view as DiagramView)
    ? (r.view as DiagramView)
    : nodes.some((n) => n.kind) && decisionProblem({ ...base, view: 'decision' }) === null
      ? 'decision'
      : 'concept';
  return { ...base, view };
}

// ── its shape ────────────────────────────────────────────────────────

const nodeOf = (s: DiagramState, id: unknown) => s.nodes.find((n) => n.id === id);
const edgeOf = (s: DiagramState, from: unknown, to: unknown) => s.edges.find((e) => e.from === from && e.to === to);
const said = (s: DiagramState, id: string) => `‘${nodeOf(s, id)?.label ?? id}’`;
const listed = (s: DiagramState, ids: readonly string[], n = 3) => `${ids.slice(0, n).map((id) => said(s, id)).join(', ')}${ids.length > n ? '…' : ''}`;

/** Each node's arrows out and arrows in, each list in the order the nodes are listed. */
function adjacency(s: DiagramState): { out: Map<string, string[]>; inn: Map<string, string[]> } {
  const at = new Map(s.nodes.map((n, i) => [n.id, i]));
  const out = new Map<string, string[]>(s.nodes.map((n) => [n.id, []]));
  const inn = new Map<string, string[]>(s.nodes.map((n) => [n.id, []]));
  for (const e of s.edges) {
    out.get(e.from)?.push(e.to);
    inn.get(e.to)?.push(e.from);
  }
  const order = (a: string, b: string) => (at.get(a) ?? 0) - (at.get(b) ?? 0);
  for (const l of out.values()) l.sort(order);
  for (const l of inn.values()) l.sort(order);
  return { out, inn };
}

/** The nodes nothing points into, in order. */
export function roots(s: DiagramState): string[] {
  const pointed = new Set(s.edges.map((e) => e.to));
  return s.nodes.filter((n) => !pointed.has(n.id)).map((n) => n.id);
}

/** What the diagram grows from: the root the person chose, else the one node nothing points into — null when there is not exactly one. */
export function rootOf(s: DiagramState): string | null {
  if (s.root && nodeOf(s, s.root)) return s.root;
  const r = roots(s);
  return r.length === 1 ? r[0] : null;
}

/** Why the diagram is not one hierarchy under one root, in a sentence — null when it is. */
export function treeProblem(s: DiagramState): string | null {
  if (!s.nodes.length) return 'There is nothing in it to arrange yet.';
  const { out, inn } = adjacency(s);
  if (s.root && nodeOf(s, s.root)) {
    const into = inn.get(s.root) ?? [];
    if (into.length) return `${said(s, s.root)} is the root, but ${said(s, into[0])} points into it — nothing sits above the top of a hierarchy.`;
  }
  const r = rootOf(s);
  if (!r) {
    const rs = roots(s);
    if (!rs.length) return 'Everything in it has something pointing into it, so there is no top to hang a hierarchy from.';
    return `It has ${rs.length} tops (${listed(s, rs)}); a hierarchy has one — connect them, or choose the root.`;
  }
  for (const n of s.nodes) {
    const into = inn.get(n.id) ?? [];
    if (into.length > 1) return `${said(s, n.id)} sits under both ${said(s, into[0])} and ${said(s, into[1])}; in a hierarchy each thing sits under one.`;
  }
  const seen = new Set([r]);
  const queue = [r];
  while (queue.length) {
    for (const v of out.get(queue.shift()!) ?? []) {
      if (!seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  const missed = s.nodes.find((n) => !seen.has(n.id));
  return missed ? `${said(s, missed.id)} is not reached from ${said(s, r)}.` : null;
}

/** One root, everything beneath it by exactly one path. */
export const isTree = (s: DiagramState): boolean => treeProblem(s) === null;

export interface Tree {
  root: string;
  /** each reached node's children, in order */
  children: Map<string, string[]>;
  /** how far each reached node is from the root */
  depth: Map<string, number>;
  /** the nodes the tree does not reach, in order */
  loose: string[];
}

/**
 * The tree a diagram is drawn as from a root: breadth first, so each node
 * sits at its shortest distance from the root. `directed` follows the arrows
 * only; otherwise a connection counts either way — a mind map radiates from
 * its centre whichever way its lines were drawn — the arrows out of a node
 * first, then the arrows into it.
 */
export function treeFrom(s: DiagramState, root: string, directed = false): Tree {
  const { out, inn } = adjacency(s);
  const children = new Map<string, string[]>();
  const depth = new Map<string, number>([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const u = queue.shift()!;
    const kids: string[] = [];
    for (const v of [...(out.get(u) ?? []), ...(directed ? [] : (inn.get(u) ?? []))]) {
      if (depth.has(v)) continue;
      depth.set(v, depth.get(u)! + 1);
      kids.push(v);
      queue.push(v);
    }
    children.set(u, kids);
  }
  return { root, children, depth, loose: s.nodes.filter((n) => !depth.has(n.id)).map((n) => n.id) };
}

export interface OutlineLine {
  id: string;
  depth: number;
}

/** The diagram as an indented list from its root, depth first. What the root does not reach is listed as loose. */
export function outlineOf(s: DiagramState): { lines: OutlineLine[]; loose: string[] } {
  const r = rootOf(s);
  if (!r) return { lines: [], loose: s.nodes.map((n) => n.id) };
  const t = treeFrom(s, r);
  const lines: OutlineLine[] = [];
  const walk = (id: string, depth: number) => {
    lines.push({ id, depth });
    for (const c of t.children.get(id) ?? []) walk(c, depth + 1);
  };
  walk(r, 0);
  return { lines, loose: t.loose };
}

// ── simple detail ────────────────────────────────────────────────────

/** The nodes `simple` detail shows: the root and two levels beneath it — or, with no root, the twelve best-connected nodes (ties go to the earlier node). */
export function simpleIds(s: DiagramState): string[] {
  const r = rootOf(s);
  if (r) {
    const t = treeFrom(s, r);
    return s.nodes.filter((n) => (t.depth.get(n.id) ?? Infinity) <= DIAGRAM_LIMITS.simpleDepth).map((n) => n.id);
  }
  const degree = new Map(s.nodes.map((n) => [n.id, 0]));
  for (const e of s.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const keep = new Set(
    s.nodes
      .map((n, i) => ({ id: n.id, d: degree.get(n.id) ?? 0, i }))
      .sort((a, b) => b.d - a.d || a.i - b.i)
      .slice(0, DIAGRAM_LIMITS.simple)
      .map((x) => x.id)
  );
  return s.nodes.filter((n) => keep.has(n.id)).map((n) => n.id);
}

/** What is drawn: all of it, or in simple detail only `simpleIds` and the connections among them (the root kept as the root). */
export function visible(s: DiagramState): DiagramState {
  if (s.detail !== 'simple') return s;
  const keep = new Set(simpleIds(s));
  const r = rootOf(s);
  return {
    ...s,
    ...(r ? { root: r } : {}),
    nodes: s.nodes.filter((n) => keep.has(n.id)),
    edges: s.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };
}

// ── a decision tree, rolled back ─────────────────────────────────────

/** The chances out of a chance node: what they add up to, and which branches have none. */
function chancesOut(s: DiagramState, id: string): { given: number; missing: string[]; branches: number } {
  const es = s.edges.filter((e) => e.from === id);
  return {
    given: es.reduce((a, e) => a + (e.prob ?? 0), 0),
    missing: es.filter((e) => e.prob === undefined).map((e) => e.to),
    branches: es.length,
  };
}

function sumProblem(s: DiagramState, id: string, c: ReturnType<typeof chancesOut>): string | null {
  if (!c.branches) return null;
  if (!c.missing.length && Math.abs(c.given - 1) > PROB_TOLERANCE) return `The chances out of ${said(s, id)} add up to ${sayNum(c.given, 4)}, not 1.`;
  if (c.missing.length && c.given > 1 + PROB_TOLERANCE) return `The chances out of ${said(s, id)} already add up to ${sayNum(c.given, 4)}, more than 1.`;
  return null;
}

/** Chance nodes whose probabilities cannot be right: every branch has one and they do not add up to 1, or those given already pass 1. */
export function probabilityProblems(s: DiagramState): string[] {
  return s.nodes.filter((n) => n.kind === 'chance').flatMap((n) => sumProblem(s, n.id, chancesOut(s, n.id)) ?? []);
}

export interface Rollback {
  root: string | null;
  /** what each node reached from the root is worth, or null where that cannot be computed */
  values: Record<string, number | null>;
  /** at each decision node whose options all have values, the best one (the first, when two are worth the same) */
  best: Record<string, string>;
  /** what the probabilities out of each chance node add up to, where every branch has one */
  sums: Record<string, number>;
  /** everything that stops the computation, in words — nothing is assumed in its place */
  problems: string[];
}

/**
 * Roll a decision tree back from its root: an outcome is worth its payoff, a
 * chance node Σ p · value over its branches (its probabilities must add up to
 * 1 within PROB_TOLERANCE), a decision node its best option. A missing payoff
 * or probability leaves the value unknown and is reported — never guessed.
 */
export function rollback(s: DiagramState): Rollback {
  const res: Rollback = { root: rootOf(s), values: {}, best: {}, sums: {}, problems: [] };
  const problem = (p: string) => {
    if (res.problems.length < 12 && !res.problems.includes(p)) res.problems.push(p);
  };
  if (!res.root) {
    problem(
      !s.nodes.length
        ? 'There is nothing in it to roll back.'
        : roots(s).length
          ? 'It has more than one starting point — choose the root to roll it back from.'
          : 'Everything in it has something pointing into it — choose the root to roll it back from.'
    );
    return res;
  }
  const { out } = adjacency(s);
  const visiting = new Set<string>();
  const done = new Set<string>();
  const worth = (id: string): number | null => {
    if (visiting.has(id) || done.has(id)) {
      problem(`${said(s, id)} is reached by more than one path — in a decision tree each point is reached one way.`);
      return null;
    }
    visiting.add(id);
    const n = nodeOf(s, id)!;
    const kids = out.get(id) ?? [];
    let v: number | null = null;
    if (n.kind === 'outcome') {
      if (kids.length) problem(`${said(s, id)} is an outcome but has branches after it.`);
      else if (n.value === undefined) problem(`${said(s, id)} has no payoff yet.`);
      else v = n.value;
    } else if (n.kind === 'chance') {
      if (!kids.length) problem(`${said(s, id)} is a chance node with no branches.`);
      else {
        const vals = kids.map(worth);
        const c = chancesOut(s, id);
        for (const k of c.missing) problem(`The branch from ${said(s, id)} to ${said(s, k)} has no probability.`);
        const bad = sumProblem(s, id, c);
        if (bad) problem(bad);
        if (!c.missing.length) res.sums[id] = tidy(c.given);
        if (!c.missing.length && !bad && vals.every((x) => x !== null)) {
          v = tidy(kids.reduce((a, k, i) => a + edgeOf(s, id, k)!.prob! * vals[i]!, 0));
        }
      }
    } else if (n.kind === 'decision') {
      if (!kids.length) problem(`${said(s, id)} is a decision with no options.`);
      else {
        const vals = kids.map(worth);
        if (vals.every((x) => x !== null)) {
          let bi = 0;
          vals.forEach((x, i) => {
            if (x! > vals[bi]!) bi = i;
          });
          res.best[id] = kids[bi];
          v = vals[bi];
        }
      }
    } else {
      problem(`${said(s, id)} is not marked as a decision, a chance or an outcome.`);
      kids.forEach(worth);
    }
    visiting.delete(id);
    done.add(id);
    res.values[id] = v;
    return v;
  };
  worth(res.root);
  for (const n of s.nodes) if (n.kind && !done.has(n.id)) problem(`${said(s, n.id)} is not connected to the tree from ${said(s, res.root)}.`);
  return res;
}

/** Why it cannot be drawn as a decision tree — null when it can. Missing payoffs and probabilities do not stop the drawing; they are shown as missing. */
function decisionProblem(s: DiagramState): string | null {
  if (!s.nodes.some((n) => n.kind)) return 'No node is marked as a decision, a chance or an outcome yet — say which is which and it can be drawn as a decision tree.';
  return probabilityProblems(s)[0] ?? null;
}

// ── layouts, in abstract units ───────────────────────────────────────

/** A node's box: its centre, and its size. */
export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The size every box is drawn at, and the room between them. */
export interface BoxOpts {
  w?: number;
  h?: number;
  gapX?: number;
  gapY?: number;
}

const dim = (v: unknown, d: number, min: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : d);
function boxSizes(o: BoxOpts = {}) {
  return { w: dim(o.w, 150, 1), h: dim(o.h, 48, 1), gapX: dim(o.gapX, 28, 0), gapY: dim(o.gapY, 56, 0) };
}

export interface TreeLayout {
  boxes: Box[];
  width: number;
  height: number;
}

/**
 * A tidy tree for a forest given as its roots and a way to find children:
 * each leaf takes the next slot across, each parent is centred over its first
 * and last child, and depth runs down the page (or across it, `dir: 'right'`).
 * Two nodes at one depth are always a whole slot apart and depths are a whole
 * row apart, so no two boxes overlap. A node reached twice is drawn once,
 * where it was first reached; trees of a forest stand half a slot apart.
 */
export function tidyTree(rootIds: readonly string[], childrenOf: (id: string) => readonly string[], opts: BoxOpts & { dir?: 'down' | 'right' } = {}): TreeLayout {
  const { w, h, gapX, gapY } = boxSizes(opts);
  const right = opts.dir === 'right';
  const depthOf = new Map<string, number>();
  const slotOf = new Map<string, number>();
  const order: string[] = [];
  let next = 0;
  let deepest = 0;
  let maxSlot = 0;
  const place = (id: string, d: number): number => {
    depthOf.set(id, d);
    order.push(id);
    deepest = Math.max(deepest, d);
    const xs: number[] = [];
    for (const c of childrenOf(id)) if (!depthOf.has(c)) xs.push(place(c, d + 1));
    const slot = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : next++;
    slotOf.set(id, slot);
    maxSlot = Math.max(maxSlot, slot);
    return slot;
  };
  let trees = 0;
  for (const r of rootIds) {
    if (depthOf.has(r)) continue;
    if (trees++) next += 0.5;
    place(r, 0);
  }
  if (!order.length) return { boxes: [], width: 0, height: 0 };
  const along = right ? h + gapY : w + gapX;
  const across = right ? w + gapX : h + gapY;
  const boxes = order.map((id) => {
    const a = slotOf.get(id)! * along;
    const d = depthOf.get(id)! * across;
    return right ? { id, x: d + w / 2, y: a + h / 2, w, h } : { id, x: a + w / 2, y: d + h / 2, w, h };
  });
  const spanA = maxSlot * along + (right ? h : w);
  const spanD = deepest * across + (right ? w : h);
  return { boxes, width: right ? spanD : spanA, height: right ? spanA : spanD };
}

export interface HierarchyLayout extends TreeLayout {
  /** the connections the tree is drawn along, parent → child */
  tree: [string, string][];
  /** connections that are not part of the tree, drawn across it */
  extra: [string, string][];
}

/**
 * The hierarchy (an org chart) as a tidy tree, following the arrows from the
 * root. A diagram that is not one tree is still drawn whole: each node sits
 * under the first thing that reaches it, every further top starts a tree of
 * its own beside the first, and connections outside the tree are `extra`.
 */
export function hierarchyLayout(s: DiagramState, opts: BoxOpts & { dir?: 'down' | 'right' } = {}): HierarchyLayout {
  const { out } = adjacency(s);
  const r = rootOf(s);
  const starts = [...(r ? [r] : []), ...roots(s), ...s.nodes.map((n) => n.id)];
  const parent = new Map<string, string | null>();
  const kids = new Map<string, string[]>();
  const tops: string[] = [];
  for (const st of starts) {
    if (parent.has(st)) continue;
    parent.set(st, null);
    tops.push(st);
    const queue = [st];
    while (queue.length) {
      const u = queue.shift()!;
      const ks: string[] = [];
      for (const v of out.get(u) ?? []) {
        if (parent.has(v)) continue;
        parent.set(v, u);
        ks.push(v);
        queue.push(v);
      }
      kids.set(u, ks);
    }
  }
  const lay = tidyTree(tops, (id) => kids.get(id) ?? [], opts);
  const tree: [string, string][] = [];
  for (const [c, p] of parent) if (p) tree.push([p, c]);
  const inTree = new Set(tree.map(([a, b]) => `${a}>${b}`));
  return { ...lay, tree, extra: s.edges.filter((e) => !inTree.has(`${e.from}>${e.to}`)).map((e) => [e.from, e.to]) };
}

/** A decision tree reads left to right: the hierarchy layout, turned on its side. */
export function decisionLayout(s: DiagramState, opts: BoxOpts = {}): HierarchyLayout {
  return hierarchyLayout(s, { ...opts, dir: 'right' });
}

export interface FlowLayout {
  boxes: Box[];
  width: number;
  height: number;
  /** the nodes in each layer, top to bottom, each layer in its drawn order */
  layers: string[][];
  /** connections that run back up the flow — the loops — drawn as returns */
  back: [string, string][];
}

/**
 * A flowchart in layers, top to bottom. The layering is lib/representation's
 * `orderSpine` — loops broken at the connection that closes them, found by a
 * depth-first walk from the starts, then each node in the layer after the
 * latest thing that leads to it (longest path). Within each layer the order
 * is improved by barycentre sweeps (each node towards the average place of
 * its neighbours), keeping the order with the fewest crossings. Layers are
 * a row apart and the nodes in a layer a slot apart, so nothing overlaps.
 */
export function flowLayout(s: DiagramState, opts: BoxOpts = {}): FlowLayout {
  const { w, h, gapX, gapY } = boxSizes(opts);
  if (!s.nodes.length) return { boxes: [], width: 0, height: 0, layers: [], back: [] };
  const asMap: Parameters<typeof orderSpine>[0] = {
    nodes: s.nodes.map((n): LogosNode => ({ id: n.id, type: 'step', label: n.label })),
    edges: s.edges.map((e): LogosEdge => ({ from: e.from, to: e.to, relation: 'precedes' })),
  };
  const order = orderSpine(asMap, new Set(s.nodes.map((n) => n.id)));
  const layerOf = new Map<string, number>();
  order.forEach((l, i) => l.forEach((id) => layerOf.set(id, i)));
  const fwd = s.edges.filter((e) => layerOf.get(e.to)! > layerOf.get(e.from)!);
  const back = s.edges.filter((e) => layerOf.get(e.to)! <= layerOf.get(e.from)!);
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const e of fwd) {
    preds.set(e.to, [...(preds.get(e.to) ?? []), e.from]);
    succs.set(e.from, [...(succs.get(e.from) ?? []), e.to]);
  }
  // a node's place, in slots from the middle of its layer — which is where it is drawn
  const places = () => {
    const m = new Map<string, number>();
    order.forEach((l) => l.forEach((id, i) => m.set(id, i - (l.length - 1) / 2)));
    return m;
  };
  const crossings = () => {
    const p = places();
    let c = 0;
    for (let i = 0; i < fwd.length; i++) {
      for (let j = i + 1; j < fwd.length; j++) {
        const a = fwd[i];
        const b = fwd[j];
        if (layerOf.get(a.from) !== layerOf.get(b.from) || layerOf.get(a.to) !== layerOf.get(b.to)) continue;
        if ((p.get(a.from)! - p.get(b.from)!) * (p.get(a.to)! - p.get(b.to)!) < 0) c++;
      }
    }
    return c;
  };
  const reorder = (L: number, nb: Map<string, string[]>) => {
    const p = places();
    const keyed = order[L].map((id, i) => {
      const ns = nb.get(id) ?? [];
      return { id, i, key: ns.length ? ns.reduce((a, x) => a + p.get(x)!, 0) / ns.length : p.get(id)! };
    });
    keyed.sort((a, b) => a.key - b.key || a.i - b.i);
    order[L] = keyed.map((k) => k.id);
  };
  let best = order.map((l) => l.slice());
  let fewest = crossings();
  for (let sweep = 0; sweep < 8 && fewest > 0; sweep++) {
    if (sweep % 2 === 0) for (let L = 1; L < order.length; L++) reorder(L, preds);
    else for (let L = order.length - 2; L >= 0; L--) reorder(L, succs);
    const c = crossings();
    if (c < fewest) {
      fewest = c;
      best = order.map((l) => l.slice());
    }
  }
  const widest = Math.max(...best.map((l) => l.length));
  const boxes: Box[] = [];
  best.forEach((l, L) =>
    l.forEach((id, i) => boxes.push({ id, x: (i - (l.length - 1) / 2 + (widest - 1) / 2) * (w + gapX) + w / 2, y: L * (h + gapY) + h / 2, w, h }))
  );
  return {
    boxes,
    width: widest * (w + gapX) - gapX,
    height: best.length * (h + gapY) - gapY,
    layers: best,
    back: back.map((e) => [e.from, e.to]),
  };
}

export interface RadialLayout {
  boxes: Box[];
  width: number;
  height: number;
  /** where the root sits; null when there is no root */
  centre: { x: number; y: number } | null;
  /** the radius of each ring, the root's (0) first */
  rings: number[];
  /** the connections the mind map radiates along, parent → child */
  tree: [string, string][];
  /** nodes not connected to the root, set in rows beneath */
  loose: string[];
}

/**
 * A mind map: the root at the centre, each level on a ring around it. Each
 * node's share of the circle is its share of the leaves beneath it, centred
 * in its parent's share, from the top going clockwise. Each ring is far
 * enough out that the two closest nodes on it are a box's diagonal apart and
 * a diagonal beyond the ring inside it, so no two boxes overlap.
 */
export function radialLayout(s: DiagramState, opts: BoxOpts = {}): RadialLayout {
  const { w, h, gapX, gapY } = boxSizes(opts);
  const r0 = rootOf(s);
  const boxes: Box[] = [];
  let width = 0;
  let height = 0;
  let centre: RadialLayout['centre'] = null;
  const rings: number[] = [];
  const tree: [string, string][] = [];
  let loose = s.nodes.map((n) => n.id);
  if (r0) {
    const t = treeFrom(s, r0);
    loose = t.loose;
    const leaves = new Map<string, number>();
    const count = (id: string): number => {
      const ks = t.children.get(id) ?? [];
      const n = ks.length ? ks.reduce((a, k) => a + count(k), 0) : 1;
      leaves.set(id, n);
      return n;
    };
    count(r0);
    const angle = new Map<string, number>();
    const share = (id: string, a0: number, a1: number) => {
      angle.set(id, (a0 + a1) / 2);
      let a = a0;
      for (const k of t.children.get(id) ?? []) {
        const span = ((a1 - a0) * leaves.get(k)!) / leaves.get(id)!;
        share(k, a, a + span);
        tree.push([id, k]);
        a += span;
      }
    };
    share(r0, -Math.PI / 2, (3 * Math.PI) / 2);
    // centres this far apart cannot overlap: overlapping needs |dx| < w and |dy| < h
    const apart = Math.hypot(w + gapX, h + gapY);
    const deepest = Math.max(...t.depth.values());
    rings.push(0);
    for (let d = 1; d <= deepest; d++) {
      const on = [...t.depth].filter(([, k]) => k === d).map(([id]) => angle.get(id)!).sort((a, b) => a - b);
      let r = rings[d - 1] + apart;
      if (on.length > 1) {
        let closest = 2 * Math.PI - (on[on.length - 1] - on[0]);
        for (let i = 1; i < on.length; i++) closest = Math.min(closest, on[i] - on[i - 1]);
        r = Math.max(r, apart / (2 * Math.sin(Math.max(1e-6, Math.min(closest, Math.PI)) / 2)));
      }
      rings.push(r);
    }
    const at = new Map<string, { x: number; y: number }>();
    for (const [id, d] of t.depth) at.set(id, { x: rings[d] * Math.cos(angle.get(id)!), y: rings[d] * Math.sin(angle.get(id)!) });
    const pts = [...at.values()];
    const minX = Math.min(...pts.map((p) => p.x)) - w / 2;
    const minY = Math.min(...pts.map((p) => p.y)) - h / 2;
    width = Math.max(...pts.map((p) => p.x)) + w / 2 - minX;
    height = Math.max(...pts.map((p) => p.y)) + h / 2 - minY;
    for (const n of s.nodes) {
      const p = at.get(n.id);
      if (p) boxes.push({ id: n.id, x: p.x - minX, y: p.y - minY, w, h });
    }
    centre = { x: -minX, y: -minY };
  }
  if (loose.length) {
    const per = Math.max(1, Math.floor((Math.max(width, w) + gapX) / (w + gapX)));
    const top = height ? height + gapY : 0;
    loose.forEach((id, i) => boxes.push({ id, x: (i % per) * (w + gapX) + w / 2, y: top + Math.floor(i / per) * (h + gapY) + h / 2, w, h }));
    width = Math.max(width, Math.min(loose.length, per) * (w + gapX) - gapX);
    height = top + Math.ceil(loose.length / per) * (h + gapY) - gapY;
  }
  return { boxes, width, height, centre, rings, tree, loose };
}

export interface ConceptLayout {
  boxes: Box[];
  /** the frame a person's 0..1 placement is measured across */
  width: number;
  height: number;
  /** the nodes the person placed, which sit exactly where they put them */
  placed: string[];
}

/** Where a node placed at (x, y) ∈ 0..1 has its centre in a W × H frame — its box always inside the frame. */
export function placedAt(x: number, y: number, W: number, H: number, w: number, h: number): { x: number; y: number } {
  return { x: w / 2 + x * Math.max(0, W - w), y: h / 2 + y * Math.max(0, H - h) };
}

/** The inverse, for a renderer turning a drag into a `place` operation: 0..1 across and down, rounded as the state keeps it. */
export function placementOf(cx: number, cy: number, W: number, H: number, w: number, h: number): { x: number; y: number } {
  const unit = (v: number, room: number) => round4(Math.min(1, Math.max(0, room > 0 ? v / room : 0)));
  return { x: unit(cx - w / 2, W - w), y: unit(cy - h / 2, H - h) };
}

/**
 * A concept map. Nodes the person placed stay exactly where they put them.
 * The rest are arranged by lib/mind/layout's `settle` (springs along the
 * connections, deterministic from a ring), drawn towards the nodes they
 * connect to, then each set — in order — in the nearest free cell of a grid
 * a box and a gap wide: so they never overlap one another, nor a node the
 * person placed. The grid has room for every node whatever was placed where.
 */
export function conceptLayout(s: DiagramState, opts: BoxOpts = {}): ConceptLayout {
  const { w, h, gapX, gapY } = boxSizes(opts);
  if (!s.nodes.length) return { boxes: [], width: 0, height: 0, placed: [] };
  const cw = w + gapX;
  const ch = h + gapY;
  const isPlaced = (n: DiagramNode) => n.x !== undefined && n.y !== undefined;
  const placed = s.nodes.filter(isPlaced);
  const free = s.nodes.filter((n) => !isPlaced(n));
  // a placed box can block at most four cells, so this many cells always leaves one for every free node
  const need = free.length + 4 * placed.length + 2;
  const cols = Math.max(4, Math.ceil(Math.sqrt((need * 1.6 * ch) / cw)));
  const rows = Math.max(3, Math.ceil(need / cols));
  const W = cols * cw;
  const H = rows * ch;
  const settled = settle(
    s.nodes.map((n) => ({ id: n.id, type: n.group ?? '' })),
    s.edges.map((e): [string, string] => [e.from, e.to]),
    W,
    H,
    s.nodes.length > 40 ? 200 : 300
  );
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of s.nodes) pos.set(n.id, isPlaced(n) ? placedAt(n.x!, n.y!, W, H, w, h) : { ...settled[n.id] });
  const near = new Map<string, string[]>(s.nodes.map((n) => [n.id, []]));
  for (const e of s.edges) {
    near.get(e.from)!.push(e.to);
    near.get(e.to)!.push(e.from);
  }
  // towards what each free node connects to — the placed nodes above all
  for (let k = 0; k < 24; k++) {
    for (const n of free) {
      const ns = near.get(n.id)!;
      if (!ns.length) continue;
      let x = settled[n.id].x;
      let y = settled[n.id].y;
      for (const m of ns) {
        x += pos.get(m)!.x;
        y += pos.get(m)!.y;
      }
      pos.set(n.id, { x: x / (1 + ns.length), y: y / (1 + ns.length) });
    }
  }
  const taken = new Set<string>();
  const blocked = (cx: number, cy: number) =>
    placed.some((n) => {
      const p = pos.get(n.id)!;
      return Math.abs(p.x - cx) < w + gapX / 2 && Math.abs(p.y - cy) < h + gapY / 2;
    });
  const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  for (const n of free) {
    const p = pos.get(n.id)!;
    const c0 = clampInt(Math.floor(p.x / cw), 0, cols - 1);
    const r0 = clampInt(Math.floor(p.y / ch), 0, rows - 1);
    let cell: { c: number; r: number } | null = null;
    for (let k = 0; !cell && k <= Math.max(cols, rows); k++) {
      const ring: { c: number; r: number; d: number }[] = [];
      for (let r = Math.max(0, r0 - k); r <= Math.min(rows - 1, r0 + k); r++) {
        for (let c = Math.max(0, c0 - k); c <= Math.min(cols - 1, c0 + k); c++) {
          if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== k) continue;
          ring.push({ c, r, d: ((c + 0.5) * cw - p.x) ** 2 + ((r + 0.5) * ch - p.y) ** 2 });
        }
      }
      ring.sort((a, b) => a.d - b.d || a.r - b.r || a.c - b.c);
      cell = ring.find((q) => !taken.has(`${q.c},${q.r}`) && !blocked((q.c + 0.5) * cw, (q.r + 0.5) * ch)) ?? null;
    }
    // the grid always has room (see `need`); were it ever full the node would keep its settled place
    if (cell) {
      taken.add(`${cell.c},${cell.r}`);
      pos.set(n.id, { x: (cell.c + 0.5) * cw, y: (cell.r + 0.5) * ch });
    }
  }
  return { boxes: s.nodes.map((n) => ({ id: n.id, ...pos.get(n.id)!, w, h })), width: W, height: H, placed: placed.map((n) => n.id) };
}

export interface DrawnLine {
  from: string;
  to: string;
  label?: string;
  prob?: number;
  /** along the shape; back up it (a loop in a flow); or across it (not part of the tree) */
  how: 'along' | 'back' | 'across';
}

export interface Drawing {
  view: DiagramView;
  boxes: Box[];
  width: number;
  height: number;
  lines: DrawnLine[];
  /** nodes the view could not set into its shape, drawn in rows beneath */
  loose: string[];
}

/** What the current view draws: the visible part of the diagram (see `visible`), laid out for that view. An outline is a list, not a picture — null; see `outlineOf`. */
export function drawDiagram(s: DiagramState, opts: BoxOpts = {}): Drawing | null {
  const v = visible(s);
  const line = (e: DiagramEdge, how: DrawnLine['how']): DrawnLine => ({
    from: e.from,
    to: e.to,
    ...(e.label ? { label: e.label } : {}),
    ...(e.prob !== undefined ? { prob: e.prob } : {}),
    how,
  });
  const keyed = (pairs: [string, string][]) => new Set(pairs.map(([a, b]) => `${a}>${b}`));
  const drawn = (l: { boxes: Box[]; width: number; height: number }, how: (e: DiagramEdge) => DrawnLine['how'], loose: string[] = []): Drawing => ({
    view: s.view,
    boxes: l.boxes,
    width: l.width,
    height: l.height,
    lines: v.edges.map((e) => line(e, how(e))),
    loose,
  });
  if (s.view === 'outline') return null;
  if (s.view === 'hierarchy' || s.view === 'decision') {
    const l = s.view === 'decision' ? decisionLayout(v, opts) : hierarchyLayout(v, opts);
    const tree = keyed(l.tree);
    return drawn(l, (e) => (tree.has(`${e.from}>${e.to}`) ? 'along' : 'across'));
  }
  if (s.view === 'flow') {
    const l = flowLayout(v, opts);
    const back = keyed(l.back);
    return drawn(l, (e) => (back.has(`${e.from}>${e.to}`) ? 'back' : 'along'));
  }
  if (s.view === 'mind') {
    const l = radialLayout(v, opts);
    const tree = keyed(l.tree);
    return drawn(l, (e) => (tree.has(`${e.from}>${e.to}`) ? 'along' : 'across'), l.loose);
  }
  return drawn(conceptLayout(v, opts), () => 'along');
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<DiagramState>[] = [
  {
    id: 'concept',
    label: 'Concept map',
    shows: 'ideas and how they relate, placed where you put them',
    primary: true,
    interactions: ['drag a node to place it', 'connect two nodes', 'rename a node'],
  },
  {
    id: 'mind',
    label: 'Mind map',
    shows: 'everything radiating from one central idea',
    interactions: ['add a branch to a node', 'rename a node'],
    unavailable: (s) => (!s.nodes.length ? 'There is nothing in it yet.' : rootOf(s) ? null : 'A mind map grows from one central idea — choose the root first.'),
  },
  {
    id: 'hierarchy',
    label: 'Hierarchy',
    shows: 'what sits under what, level by level — an org chart',
    interactions: ['add a node under another', 'rename a node'],
    unavailable: treeProblem,
  },
  {
    id: 'flow',
    label: 'Flowchart',
    shows: 'the order things happen in, step after step, with the loops back',
    interactions: ['connect a step to the next'],
  },
  {
    id: 'decision',
    label: 'Decision tree',
    shows: 'choices, chances and outcomes, with each option rolled back to what it is worth',
    interactions: ['set a probability', 'set a payoff'],
    unavailable: decisionProblem,
  },
  {
    id: 'outline',
    label: 'Outline',
    shows: 'the same structure as an indented list',
    interactions: ['rename a node'],
    unavailable: (s) => (!s.nodes.length ? 'There is nothing in it yet.' : rootOf(s) ? null : 'An outline needs a root to indent from — choose one first.'),
  },
];

export const VIEW_LABEL: Record<DiagramView, string> = Object.fromEntries(views.map((v) => [v.id, v.label])) as Record<DiagramView, string>;
const VIEW_NOUN: Record<DiagramView, string> = {
  concept: 'a concept map',
  mind: 'a mind map',
  hierarchy: 'a hierarchy',
  flow: 'a flowchart',
  decision: 'a decision tree',
  outline: 'an outline',
};

const needNode = (s: DiagramState, id: unknown): string | null => (nodeOf(s, id) ? null : 'There is no such node in the diagram.');
const given = (v: unknown) => v !== undefined && v !== '';

function labelProblem(v: unknown): string | null {
  const l = cleanText(v, 400);
  if (!l) return 'Say what it is called.';
  return l.length > DIAGRAM_LIMITS.label ? `A label holds ${DIAGRAM_LIMITS.label} characters at most — say it more briefly, and put the rest in its note.` : null;
}

/** Content is written by someone, and who is recorded: the arguments must say, and say truly. */
const authored = (a: Args, ctx: Ctx): string | null => (a.by === 'person' || a.by === 'socria' ? guardBy(a, ctx) : 'Say who wrote it.');

function withGraph(s: DiagramState, nodes: DiagramNode[], edges: DiagramEdge[] = s.edges): DiagramState {
  return sanitizeDiagram({ ...s, nodes, edges }) ?? s;
}

/** A change to one node, with one optional field set or cleared. */
function setField(s: DiagramState, id: unknown, key: 'note' | 'group', value: string): DiagramState {
  return withGraph(
    s,
    s.nodes.map((n) => {
      if (n.id !== id) return n;
      const next: DiagramNode = { ...n };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    })
  );
}

export const DIAGRAM_OPS = {
  ...headOps<DiagramState>(views, sanitizeDiagram),
  addNode: op<DiagramState>(
    'Add a node',
    (s, a, ctx) => {
      const bad = labelProblem(a.label);
      if (bad) return bad;
      if (s.nodes.length >= DIAGRAM_LIMITS.nodes) return `A diagram holds ${DIAGRAM_LIMITS.nodes} nodes at most.`;
      if (given(a.parent)) {
        if (!nodeOf(s, a.parent)) return 'There is no such node to put it under.';
        if (s.edges.length >= DIAGRAM_LIMITS.edges) return `A diagram holds ${DIAGRAM_LIMITS.edges} connections at most.`;
      }
      if (given(a.kind) && !KINDS.includes(a.kind as NodeKind)) return 'A node is a decision, a chance or an outcome.';
      if (given(a.value)) {
        if (num(a.value) === null) return 'A payoff is a number.';
        if (a.kind === 'decision' || a.kind === 'chance') return 'Only an outcome has a payoff — what a decision or a chance is worth is computed from its branches.';
      }
      return authored(a, ctx);
    },
    (s, a) => {
      const id = nextId('n', s.nodes.map((n) => n.id));
      const value = num(a.value);
      // a payoff is an outcome's: given one, the node is an outcome
      const kind = KINDS.includes(a.kind as NodeKind) ? (a.kind as NodeKind) : value !== null ? 'outcome' : undefined;
      const node: DiagramNode = {
        id,
        label: cleanText(a.label, DIAGRAM_LIMITS.label),
        ...(kind ? { kind } : {}),
        ...(kind === 'outcome' && value !== null ? { value } : {}),
        by: cleanBy(a.by),
      };
      const edges = given(a.parent) ? [...s.edges, { from: String(a.parent), to: id, by: cleanBy(a.by) }] : s.edges;
      return withGraph(s, [...s.nodes, node], edges);
    },
    (a) => `added “${cleanText(a.label, DIAGRAM_LIMITS.label)}”${given(a.parent) ? ' beneath another node' : ''}`
  ),
  rename: op<DiagramState>(
    'Rename',
    (s, a, ctx) => needNode(s, a.id) ?? labelProblem(a.label) ?? guardOwn(nodeOf(s, a.id), ctx),
    (s, a) => withGraph(s, s.nodes.map((n) => (n.id === a.id ? { ...n, label: cleanText(a.label, DIAGRAM_LIMITS.label) } : n))),
    (a) => `renamed “${cleanText(a.label, DIAGRAM_LIMITS.label)}”`
  ),
  note: op<DiagramState>(
    'Note',
    (s, a, ctx) =>
      needNode(s, a.id) ??
      (cleanText(a.note, 400).length > DIAGRAM_LIMITS.note ? `A note holds ${DIAGRAM_LIMITS.note} characters at most.` : null) ??
      guardOwn(nodeOf(s, a.id), ctx),
    (s, a) => setField(s, a.id, 'note', cleanText(a.note, DIAGRAM_LIMITS.note)),
    (a) => (cleanText(a.note, DIAGRAM_LIMITS.note) ? 'noted' : 'note cleared')
  ),
  group: op<DiagramState>(
    'Group',
    (s, a, ctx) => {
      const miss = needNode(s, a.id);
      if (miss) return miss;
      const g = cleanText(a.group, 400);
      if (g.length > DIAGRAM_LIMITS.group) return `A group’s name holds ${DIAGRAM_LIMITS.group} characters at most.`;
      const groups = new Set(s.nodes.map((n) => n.group).filter(Boolean));
      if (g && !groups.has(g) && groups.size >= DIAGRAM_LIMITS.groups) return `A diagram has ${DIAGRAM_LIMITS.groups} groups at most.`;
      return guardOwn(nodeOf(s, a.id), ctx);
    },
    (s, a) => setField(s, a.id, 'group', cleanText(a.group, DIAGRAM_LIMITS.group)),
    (a) => (cleanText(a.group, DIAGRAM_LIMITS.group) ? `put in ${cleanText(a.group, DIAGRAM_LIMITS.group)}` : 'taken out of its group')
  ),
  kind: op<DiagramState>(
    'Mark as',
    (s, a, ctx) =>
      needNode(s, a.id) ?? (a.kind === '' || KINDS.includes(a.kind as NodeKind) ? null : 'A node is a decision, a chance or an outcome.') ?? guardOwn(nodeOf(s, a.id), ctx),
    (s, a) =>
      withGraph(
        s,
        s.nodes.map((n) => {
          if (n.id !== a.id) return n;
          const { kind: _k, ...rest } = n;
          return KINDS.includes(a.kind as NodeKind) ? { ...rest, kind: a.kind as NodeKind } : rest;
        })
      ),
    (a) => (KINDS.includes(a.kind as NodeKind) ? `marked as ${KIND_WORD[a.kind as NodeKind]}` : 'no longer marked')
  ),
  value: op<DiagramState>(
    'Set the payoff',
    (s, a, ctx) => {
      const miss = needNode(s, a.id);
      if (miss) return miss;
      const n = nodeOf(s, a.id)!;
      if (a.value === '') return n.value === undefined ? 'It has no payoff to clear.' : guardOwn(n, ctx);
      if (num(a.value) === null) return 'A payoff is a number.';
      if (n.kind === 'decision' || n.kind === 'chance') return `‘${n.label}’ is ${KIND_WORD[n.kind]}; what it is worth is computed from its branches, not set.`;
      return guardOwn(n, ctx);
    },
    (s, a) =>
      withGraph(
        s,
        s.nodes.map((n) => {
          if (n.id !== a.id) return n;
          const { value: _v, ...rest } = n;
          const v = num(a.value);
          return v === null ? rest : { ...rest, kind: 'outcome' as const, value: v };
        })
      ),
    (a) => (num(a.value) === null ? 'payoff cleared' : `payoff set to ${sayNum(num(a.value)!)}`)
  ),
  removeNode: op<DiagramState>(
    'Remove',
    (s, a, ctx) => {
      const miss = needNode(s, a.id);
      if (miss) return miss;
      const own = guardOwn(nodeOf(s, a.id), ctx);
      if (own) return own;
      if (ctx?.by === 'socria' && s.edges.some((e) => (e.from === a.id || e.to === a.id) && e.by === 'person')) {
        return 'It has connections you made — Socria does not remove what you wrote.';
      }
      return null;
    },
    (s, a) => withGraph(s, s.nodes.filter((n) => n.id !== a.id), s.edges.filter((e) => e.from !== a.id && e.to !== a.id)),
    () => 'removed, with its connections'
  ),
  connect: op<DiagramState>(
    'Connect',
    (s, a, ctx) => {
      if (!nodeOf(s, a.from) || !nodeOf(s, a.to)) return 'There is no such node in the diagram.';
      if (a.from === a.to) return 'A node cannot connect to itself.';
      if (edgeOf(s, a.from, a.to)) return 'They are already connected that way.';
      if (s.edges.length >= DIAGRAM_LIMITS.edges) return `A diagram holds ${DIAGRAM_LIMITS.edges} connections at most.`;
      if (cleanText(a.label, 400).length > DIAGRAM_LIMITS.edgeLabel) return `A connection’s label holds ${DIAGRAM_LIMITS.edgeLabel} characters at most.`;
      if (given(a.prob) && num(a.prob, 0, 1) === null) return 'A probability is between 0 and 1.';
      return authored(a, ctx);
    },
    (s, a) => {
      const label = cleanText(a.label, DIAGRAM_LIMITS.edgeLabel);
      const prob = num(a.prob, 0, 1);
      const edge: DiagramEdge = { from: String(a.from), to: String(a.to), ...(label ? { label } : {}), ...(prob !== null ? { prob } : {}), by: cleanBy(a.by) };
      return withGraph(s, s.nodes, [...s.edges, edge]);
    },
    (a) => `connected${cleanText(a.label, DIAGRAM_LIMITS.edgeLabel) ? ` (${cleanText(a.label, DIAGRAM_LIMITS.edgeLabel)})` : ''}`
  ),
  disconnect: op<DiagramState>(
    'Disconnect',
    (s, a, ctx) => {
      const e = edgeOf(s, a.from, a.to);
      return e ? guardOwn(e, ctx, 'That connection') : 'They are not connected that way.';
    },
    (s, a) => withGraph(s, s.nodes, s.edges.filter((e) => !(e.from === a.from && e.to === a.to))),
    () => 'disconnected'
  ),
  prob: op<DiagramState>(
    'Set the chance',
    (s, a, ctx) => {
      const e = edgeOf(s, a.from, a.to);
      if (!e) return 'They are not connected that way.';
      if (a.p === '') return e.prob === undefined ? 'It has no probability to clear.' : guardOwn(e, ctx, 'That branch');
      if (num(a.p, 0, 1) === null) return 'A probability is between 0 and 1.';
      return guardOwn(e, ctx, 'That branch');
    },
    (s, a) =>
      withGraph(
        s,
        s.nodes,
        s.edges.map((e) => {
          if (e.from !== a.from || e.to !== a.to) return e;
          const { prob: _p, ...rest } = e;
          const p = num(a.p, 0, 1);
          return p === null ? rest : { ...rest, prob: p };
        })
      ),
    (a) => (num(a.p, 0, 1) === null ? 'probability cleared' : `chance set to ${sayNum(num(a.p, 0, 1)! * 100, 2)}%`)
  ),
  place: op<DiagramState>(
    'Place',
    (s, a, ctx) => {
      const miss = needNode(s, a.id);
      if (miss) return miss;
      const unplace = a.x === '' && a.y === '';
      if (!unplace && (num(a.x, 0, 1) === null || num(a.y, 0, 1) === null)) return 'A place is a position across and down, each between 0 and 1.';
      if (unplace && nodeOf(s, a.id)!.x === undefined) return 'It is not placed by hand.';
      return guardOwn(nodeOf(s, a.id), ctx);
    },
    (s, a) =>
      withGraph(
        s,
        s.nodes.map((n) => {
          if (n.id !== a.id) return n;
          const { x: _x, y: _y, ...rest } = n;
          const x = num(a.x, 0, 1);
          const y = num(a.y, 0, 1);
          return x === null || y === null ? rest : { ...rest, x, y };
        })
      ),
    (a) => (a.x === '' && a.y === '' ? 'left for the layout to place' : 'placed')
  ),
  root: op<DiagramState>(
    'Make the root',
    (s, a) => (a.id === '' ? (s.root ? null : 'It has no root chosen to clear.') : (needNode(s, a.id) ?? (s.root === a.id ? 'It is already the root.' : null))),
    (s, a) => {
      const { root: _r, ...rest } = s;
      return sanitizeDiagram(a.id === '' ? rest : { ...rest, root: String(a.id) }) ?? s;
    },
    (a) => (a.id === '' ? 'root cleared' : 'made the root')
  ),
  detail: op<DiagramState>(
    'Detail',
    (s, a) => {
      if (a.detail !== 'full' && a.detail !== 'simple') return 'Detail is full or simple.';
      return s.detail === a.detail ? `It is already shown ${a.detail === 'simple' ? 'simply' : 'in full'}.` : null;
    },
    (s, a) => sanitizeDiagram({ ...s, detail: a.detail }) ?? s,
    (a) => (a.detail === 'simple' ? 'shown simply' : 'shown in full')
  ),
};

// ── words → an operation ─────────────────────────────────────────────

const unquote = (v: string) => {
  const m = /^[“"‘']([\s\S]*)[”"’']$/.exec(v.trim());
  return (m ? m[1] : v).trim();
};

/** The words that may surround a view request without being part of what is asked for. */
const VIEW_FILLER = new Set([
  'please', 'can', 'could', 'would', 'will', 'you', 'i', 'id', 'want', 'like', 'lets', 'let', 'us', 'me', 'to', 'show', 'view', 'see',
  'display', 'draw', 'redraw', 'turn', 'switch', 'change', 'make', 'put', 'lay', 'out', 'it', 'this', 'that', 'them', 'everything', 'the',
  'a', 'an', 'as', 'into', 'in', 'back', 'instead', 'form', 'layout', 'now', 'again', 'go', 'one',
]);
const VIEW_TRIGGER = /\b(show|view|see|display|draw|redraw|turn|switch|change|make|put|lay|as|into)\b/;
/** What the thing being re-shown may be called: "show this diagram as …", "turn the mind map into …". */
const OBJECT_WORDS = new Set(['diagram', 'map', 'chart', 'graph', 'picture', 'argument', 'essay', 'thing', 'structure']);

/**
 * A view request in words, read strictly. With "as" or "into", what follows
 * the last of them, once the words of asking (a, the, view, instead, please …)
 * are set aside, must be exactly one of a view's names, and what comes before
 * may only be words of asking and a name for the thing itself ("turn the mind
 * map into an outline"); without them, the whole message must be. So "show it
 * as a mind map" and "switch to the org chart view" are requests; "show me
 * the org chart of the company", "show me on a map where Athens is" and
 * "explain the causes as a mind map" are not. `words` are in normalised form;
 * the first view whose words match wins.
 */
export function askedView(text: string, words: Record<string, readonly string[]>): string | null {
  const t = norm(text);
  if (!t || t.length > 90 || !VIEW_TRIGGER.test(t)) return null;
  const strip = (x: string) => x.split(' ').filter((w) => w && !VIEW_FILLER.has(w)).join(' ');
  const names = new Set(Object.values(words).flat());
  const named = (x: string) => Object.keys(words).find((v) => words[v].includes(x)) ?? null;
  const m = /^(.*)\b(?:as|into)\b(.*)$/.exec(t);
  if (!m) return named(strip(t));
  const before = strip(m[1]);
  if (before && !OBJECT_WORDS.has(before) && !names.has(before)) return null;
  return named(strip(m[2]));
}

// views are tried in this order, so "decision tree" is never read as a "tree" (a hierarchy)
const VIEW_WORDS: Record<DiagramView, string[]> = {
  decision: ['decision tree', 'decision diagram'],
  mind: ['mind map', 'mindmap', 'spider diagram'],
  concept: ['concept map', 'concept diagram', 'network'],
  hierarchy: ['hierarchy', 'org chart', 'organisation chart', 'organization chart', 'organigram', 'tree', 'tree diagram', 'family tree'],
  flow: ['flowchart', 'flow chart', 'flow diagram', 'process diagram', 'flow'],
  outline: ['outline', 'indented list', 'bullet points', 'bullets'],
};

/** The node whose label the words are exactly (articles and quotes aside); null when two nodes share that label, undefined when none has it. */
function exactNode(s: DiagramState, text: string): DiagramNode | null | undefined {
  const want = norm(unquote(text));
  if (!want) return undefined;
  const hits = s.nodes.filter((n) => norm(n.label) === want);
  return hits.length === 1 ? hits[0] : hits.length ? null : undefined;
}

/** The node the words name: exactly, else by `findByLabel` — and never one whose label another node shares. */
function nodeNamed(s: DiagramState, text: string): DiagramNode | null {
  const exact = exactNode(s, text);
  if (exact !== undefined) return exact;
  const n = findByLabel(s.nodes, (x) => x.label, unquote(text));
  return n && !s.nodes.some((m) => m !== n && norm(m.label) === norm(n.label)) ? n : null;
}

/**
 * The node named strictly enough to remove it: the words are its label, or
 * hold its whole label with at most two more words ("the pricing node").
 */
function nodeStrict(s: DiagramState, text: string): DiagramNode | null {
  const t = text.replace(/\s+(?:node|box|bubble|idea|item)$/i, '').replace(/\s+from\s+(?:the\s+)?(?:diagram|map|chart)$/i, '');
  const exact = exactNode(s, t);
  if (exact !== undefined) return exact;
  const said = ` ${norm(t)} `;
  const words = norm(t).split(' ').filter(Boolean).length;
  let best: DiagramNode | null = null;
  for (const n of s.nodes) {
    const l = norm(n.label);
    if (!l || !said.includes(` ${l} `) || words - l.split(' ').length > 2) continue;
    if (!best || l.length > norm(best.label).length) best = n;
  }
  return best && !s.nodes.some((m) => m !== best && norm(m.label) === norm(best!.label)) ? best : null;
}

/** Every way of cutting the words in two at a separator, left to right. */
function cuts(text: string, sep: RegExp): { left: string; right: string }[] {
  const out: { left: string; right: string }[] = [];
  const re = new RegExp(sep.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const left = text.slice(0, m.index).trim();
    const right = text.slice(m.index + m[0].length).trim();
    if (left && right) out.push({ left, right });
    if (!m[0].length) re.lastIndex++;
  }
  return out;
}

/**
 * Two nodes the words name either side of a separator, each found by
 * `resolve`. Exact names win; two readings that disagree are no reading.
 */
function pairOf(s: DiagramState, text: string, sep: RegExp, resolve: (s: DiagramState, t: string) => DiagramNode | null = nodeNamed): [DiagramNode, DiagramNode] | null {
  const cs = cuts(text, sep);
  for (const c of cs) {
    const a = exactNode(s, c.left);
    const b = exactNode(s, c.right);
    if (a && b && a.id !== b.id) return [a, b];
  }
  const found: [DiagramNode, DiagramNode][] = [];
  for (const c of cs) {
    const a = resolve(s, c.left);
    const b = resolve(s, c.right);
    if (a && b && a.id !== b.id) found.push([a, b]);
  }
  return new Set(found.map(([a, b]) => `${a.id}>${b.id}`)).size === 1 ? found[0] : null;
}

/** Words that ask for more of something rather than name a thing: "add more detail to …", "add it to …". Quoted, they are a label. */
const NOT_A_LABEL = /^(?:(?:more|some|any|extra|further|few|several|many|lots|a few|a couple|a bit|a little)\b.*|details?|examples?|context|information|info|notes?|it|this|that|these|those|them|one|something|everything|anything)$/;

/** "30%", "30 percent", "0.3" — a probability, or null. */
function chance(v: string, unit: string | undefined): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return num(unit || n > 1 ? n / 100 : n, 0, 1);
}

const SIMPLER = /^(?:(?:please|can you|could you)\s+)*(?:make (?:this|it|the (?:diagram|map|chart)) (?:simpler|less detailed|less busy|less cluttered)|simplify(?: (?:this|it|the (?:diagram|map|chart)))?|show less(?: detail)?|less detail|fewer details)(?: please)?$/;
const EVERYTHING = /^(?:(?:please|can you|could you)\s+)*(?:show (?:everything|it all|all of it|all the (?:nodes|details?)|(?:the )?(?:whole|full) (?:diagram|map|chart))|full detail|everything)(?: please)?$/;

/**
 * An operation the words plainly ask for. Conservative by design: this runs
 * on every message while a diagram is in the workspace, so it answers only
 * when the words name nodes of THIS diagram (or plainly add one), and
 * otherwise leaves the message to the conversation.
 */
export function readDiagramOp(text: string, s: DiagramState): { op: string; args: Args } | null {
  const t = text.trim().replace(/[.!]+$/, '').trim();
  if (!t || t.length > 200) return null;
  const low = norm(t);

  // how much is shown — only when it would change what is drawn
  if (SIMPLER.test(low)) return s.detail === 'full' && simpleIds(s).length < s.nodes.length ? { op: 'detail', args: { detail: 'simple' } } : null;
  if (EVERYTHING.test(low)) return s.detail === 'simple' ? { op: 'detail', args: { detail: 'full' } } : null;

  const view = askedView(t, VIEW_WORDS);
  if (view) return view === s.view ? null : { op: 'view', args: { view } };

  // "the chance of X is 30%", "X has a 30% chance": the branch into X
  const pm =
    /^(?:and\s+)?(?:the\s+)?(?:chance|probability|likelihood|odds)\s+(?:of|that|for)\s+(.+?)\s+(?:is|are|=|should be|becomes)\s+(?:about\s+)?(\d+(?:\.\d+)?)\s*(%|percent)?$/i.exec(t) ??
    /^(.+?)\s+has\s+an?\s+(\d+(?:\.\d+)?)\s*(%|percent)\s+chance$/i.exec(t);
  if (pm) {
    const target = nodeNamed(s, pm[1]);
    const p = chance(pm[2], pm[3]);
    if (!target || p === null) return null;
    const into = s.edges.filter((e) => e.to === target.id);
    const fromChance = into.filter((e) => nodeOf(s, e.from)?.kind === 'chance');
    const e = into.length === 1 ? into[0] : fromChance.length === 1 ? fromChance[0] : null;
    return e ? { op: 'prob', args: { from: e.from, to: e.to, p } } : null;
  }

  // "rename X to Y"
  const rn = /^(?:please\s+)?rename\s+(.+)$/i.exec(t);
  if (rn) {
    const cs = cuts(rn[1], /\s+(?:to|as|into)\s+/);
    const pick = cs.find((c) => exactNode(s, c.left)) ?? cs.find((c) => nodeNamed(s, c.left));
    const n = pick ? nodeNamed(s, pick.left) : null;
    const label = pick ? unquote(pick.right) : '';
    return n && label ? { op: 'rename', args: { id: n.id, label } } : null;
  }

  // "make X the root"
  const mr = /^(?:please\s+)?(?:make|set)\s+(.+?)\s+(?:as\s+)?(?:the\s+)?(?:root|centre|center|central idea|main idea|top)$/i.exec(t);
  if (mr) {
    const n = nodeStrict(s, mr[1]);
    return n ? { op: 'root', args: { id: n.id } } : null;
  }

  // "disconnect A from B", "remove the link between A and B"
  const dc =
    /^(?:please\s+)?(?:remove|delete|drop|cut)\s+(?:the\s+)?(?:connection|link|edge|arrow|line)\s+(?:between|from)\s+(.+)$/i.exec(t) ??
    /^(?:please\s+)?(?:disconnect|unlink)\s+(.+)$/i.exec(t);
  if (dc) {
    const pair = pairOf(s, dc[1], /\s+(?:and|from|to)\s+/);
    const e = pair ? (edgeOf(s, pair[0].id, pair[1].id) ?? edgeOf(s, pair[1].id, pair[0].id)) : null;
    return e ? { op: 'disconnect', args: { from: e.from, to: e.to } } : null;
  }

  // "remove X"
  const rm = /^(?:please\s+)?(?:remove|delete|drop|take out|get rid of)\s+(.+)$/i.exec(t);
  if (rm) {
    const n = nodeStrict(s, rm[1]);
    return n ? { op: 'removeNode', args: { id: n.id } } : null;
  }

  // "connect A to B", "link A and B"
  const cn = /^(?:please\s+)?(?:connect|link|join)\s+(.+)$/i.exec(t);
  if (cn) {
    const pair = pairOf(s, cn[1], /\s+(?:to|and|with)\s+/);
    return pair ? { op: 'connect', args: { from: pair[0].id, to: pair[1].id, by: 'person' } } : null;
  }

  // "add X under Y", "add X to Y" — Y a node of this diagram
  const ad = /^(?:please\s+)?(?:add|put|attach|hang)\s+(.+)$/i.exec(t);
  if (ad) {
    const cs = cuts(ad[1], /\s+(?:under|below|beneath|to|onto)\s+/).filter((c) => !/\bnext$/i.test(c.left));
    // the parent is named by the shortest tail that is a node: "path to market under strategy"
    const pick = [...cs].reverse().find((c) => exactNode(s, c.right)) ?? (cs.length ? cs[cs.length - 1] : null);
    const parent = pick ? nodeNamed(s, pick.right) : null;
    if (pick && parent) {
      const quoted = /^[“"‘']/.test(pick.left.trim());
      const label = unquote(pick.left.replace(/^(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:node|box|bubble|branch|idea|step|child)\s*(?:called|named|for|:)?\s*/i, ''));
      if (!label || (!quoted && NOT_A_LABEL.test(norm(label)))) return null;
      const known = exactNode(s, label);
      if (known) return known.id === parent.id ? null : { op: 'connect', args: { from: parent.id, to: known.id, by: 'person' } };
      return { op: 'addNode', args: { label, parent: parent.id, by: 'person' } };
    }
    // "add a node called X" — a node on its own
    const alone = /^(?:a\s+|an\s+)?(?:new\s+)?(?:node|box|bubble|idea)\s*(?:called|named|:)\s*(.+)$/i.exec(ad[1]);
    if (alone && unquote(alone[1])) return { op: 'addNode', args: { label: unquote(alone[1]), by: 'person' } };
    return null;
  }

  // "A causes B", "A leads to B" — both already in the diagram, and named plainly:
  // with no verb of asking, "I wonder if stress causes poor sleep" is a thought, not an edit
  for (const [sep, label] of [
    [/\s+(?:causes|cause)\s+/, 'causes'],
    [/\s+(?:leads to|lead to)\s+/, 'leads to'],
  ] as const) {
    if (!sep.test(t)) continue;
    const pair = pairOf(s, t, sep, nodeStrict);
    if (pair) return { op: 'connect', args: { from: pair[0].id, to: pair[1].id, label, by: 'person' } };
  }
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

function factsOf(s: DiagramState, guarded: boolean): string[] {
  const n = s.nodes.length;
  const m = s.edges.length;
  const out: string[] = [`${s.title}: a diagram of ${n} node${n === 1 ? '' : 's'} and ${m} connection${m === 1 ? '' : 's'}, shown as ${VIEW_NOUN[s.view]}.`];
  const r = rootOf(s);
  if (r) out.push(`It grows from ${said(s, r)}${s.root ? ', chosen as the root' : ''}.`);
  else if (n > 1) {
    const rs = roots(s);
    out.push(rs.length ? `${rs.length} nodes have nothing pointing into them: ${listed(s, rs)}.` : 'Every node has something pointing into it — there is no starting point.');
  }
  if (n > 1 && isTree(s)) out.push(`It is one tree, ${Math.max(...treeFrom(s, r!, true).depth.values()) + 1} levels deep.`);
  if (s.view === 'hierarchy' && !isTree(s)) out.push(`It cannot be drawn as a hierarchy: ${treeProblem(s)}`);
  if (s.nodes.some((x) => x.kind)) {
    const rb = rollback(s);
    const top = rb.root !== null ? rb.values[rb.root] : null;
    if (top !== null && top !== undefined) {
      if (guarded) out.push('Every payoff and probability it needs is there, so it can be rolled back — what each option is worth is theirs to work out.');
      else {
        out.push(`Rolled back, ${said(s, rb.root!)} is worth ${sayNum(top)}.`);
        for (const [d, c] of Object.entries(rb.best).slice(0, 3)) {
          const option = edgeOf(s, d, c)?.label;
          out.push(`At ${said(s, d)}, the best option is ${option ? `‘${option}’ (to ${said(s, c)})` : said(s, c)}, worth ${sayNum(rb.values[c]!)}.`);
        }
      }
    }
    for (const p of rb.problems.slice(0, 4)) out.push(p);
  }
  const groups = new Map<string, number>();
  for (const x of s.nodes) if (x.group) groups.set(x.group, (groups.get(x.group) ?? 0) + 1);
  if (groups.size) out.push(`Groups: ${[...groups].map(([g, k]) => `${g} (${k})`).join(', ')}.`);
  if (s.detail === 'simple') out.push(`Shown simply: ${visible(s).nodes.length} of ${n} nodes.`);
  const mine = s.nodes.filter((x) => x.by === 'person').length;
  if (mine) out.push(`${mine} node${mine === 1 ? ' is' : 's are'} the person’s own; Socria does not change those.`);
  return out;
}

function textOf(s: DiagramState): string {
  const at = new Map(s.nodes.map((x, i) => [x.id, i + 1]));
  const lines = s.nodes.map((x) => {
    const bits = [
      x.group ? ` {${x.group}}` : '',
      x.kind ? ` [${x.kind}${x.value !== undefined ? ` = ${sayNum(x.value)}` : ''}]` : '',
      x.note ? ` — ${x.note}` : '',
      x.by === 'person' ? ' · theirs' : '',
    ];
    return `${at.get(x.id)}. ${x.label}${bits.join('')}`;
  });
  const links = s.edges.map(
    (e) =>
      `${at.get(e.from)} → ${at.get(e.to)}${e.label ? ` (${e.label})` : ''}${e.prob !== undefined ? ` p=${sayNum(e.prob, 4)}` : ''}${e.by === 'person' ? ' · theirs' : ''}`
  );
  const r = rootOf(s);
  return [
    `DIAGRAM “${s.title}” (${VIEW_LABEL[s.view].toLowerCase()}${s.detail === 'simple' ? ', shown simply' : ''})`,
    ...(r ? [`Root: ${at.get(r)}. ${nodeOf(s, r)!.label}`] : []),
    'Nodes:',
    ...lines,
    ...(links.length ? ['Connections:', ...links] : []),
  ]
    .join('\n')
    .slice(0, 2400);
}

export const DIAGRAM = displayKind<DiagramState>({
  kind: 'diagram',
  label: 'Diagram',
  sanitize: sanitizeDiagram,
  ops: DIAGRAM_OPS,
  readOp: (text, s) => readDiagramOp(text, s),
  consequence: (before, after) => {
    const was = new Set(probabilityProblems(before));
    const now = probabilityProblems(after);
    const fresh = now.find((p) => !was.has(p));
    if (fresh) return fresh;
    if (was.size && !now.length) return 'The chances out of every chance node add up to 1 now.';
    for (const n of before.nodes) {
      const m = nodeOf(after, n.id);
      if (m && n.value !== undefined && m.value === undefined && m.kind !== 'outcome') return `${said(before, n.id)} is no longer an outcome, so its payoff of ${sayNum(n.value)} is not kept.`;
    }
    if (after.view === 'hierarchy') {
      const tb = isTree(before);
      const ta = isTree(after);
      if (tb && !ta) return `It is no longer one hierarchy: ${treeProblem(after)}`;
      if (!tb && ta) return 'It is one hierarchy again: one root, and everything under exactly one thing.';
    }
    return null;
  },
  facts: (s, opts) => factsOf(s, opts.guarded),
  text: textOf,
  parts: (s): Part[] => s.nodes.map((n) => ({ id: n.id, label: n.label })),
  partFacts: (s, part) => {
    const n = nodeOf(s, part);
    if (!n) return null;
    const ins = s.edges.filter((e) => e.to === n.id).map((e) => `${said(s, e.from)}${e.label ? ` (${e.label})` : ''}`);
    const outs = s.edges.filter((e) => e.from === n.id).map((e) => `${said(s, e.to)}${e.label ? ` (${e.label})` : ''}`);
    return [
      n.label,
      ...(n.kind ? [KIND_WORD[n.kind]] : []),
      ...(n.value !== undefined ? [`payoff ${sayNum(n.value)}`] : []),
      ...(n.group ? [`in ${n.group}`] : []),
      ...(n.note ? [n.note] : []),
      ...(ins.length ? [`from ${ins.join(', ')}`] : []),
      ...(outs.length ? [`to ${outs.join(', ')}`] : []),
      n.by === 'person' ? 'yours' : 'from Socria',
    ];
  },
  views,
  size: (s, mode) =>
    mode === 'card' ? { w: 260, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 720, h: Math.min(640, 240 + 20 * Math.max(4, s.nodes.length)) },
  shape: (s) => `${VIEW_LABEL[s.view].toLowerCase()} · ${s.nodes.length} node${s.nodes.length === 1 ? '' : 's'}`,
});

register(DIAGRAM);
registerDisplay({
  kind: 'diagram',
  noun: 'diagram',
  handle: 'D',
  about: 'Things and how they connect — a concept map, a mind map, a hierarchy or org chart, a flowchart, a decision tree.',
  // "mind map" and "concept map" are the Thinking Map's own shapes; said of a new artifact, these words are a diagram's
  called: [
    { words: ['flowchart', 'flow chart', 'process diagram', 'process flowchart', 'workflow diagram'], view: 'flow' },
    { words: ['decision tree', 'probability tree', 'tree diagram', 'expected value tree'], view: 'decision' },
    { words: ['org chart', 'organisational chart', 'organizational chart', 'hierarchy chart', 'hierarchy diagram', 'family tree'], view: 'hierarchy' },
    { words: ['spider diagram', 'radial diagram', 'spider map'], view: 'mind' },
    { words: ['concept diagram', 'network diagram', 'node diagram', 'relationship diagram'], view: 'concept' },
  ],
  spec: `{"title": "short", "view": "concept|mind|hierarchy|flow|decision|outline", "nodes": [{"id": "n1", "label": "a few words", "note": "optional", "group": "optional cluster", "kind": "decision|chance|outcome — decision trees only", "value": 100}], "edges": [{"from": "n1", "to": "n2", "label": "optional, e.g. yes / no", "prob": 0.4}], "root": "n1"}
  "value" is an outcome's payoff and "prob" a chance branch's probability — write them only where the conversation gives them (the branches out of a chance node must add up to 1); leave a gap rather than guess one. What a decision is worth is computed, never written.`,
  example: {
    title: 'Signing up',
    view: 'flow',
    nodes: [
      { id: 'a', label: 'Open the app' },
      { id: 'b', label: 'Enter an email' },
      { id: 'c', label: 'Email valid?' },
      { id: 'd', label: 'Account made' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd', label: 'yes' },
      { from: 'c', to: 'b', label: 'no' },
    ],
  },
  tell: () =>
    'A DIAGRAM is the person’s structure. How it is laid out and — in a decision tree — what each choice is worth are computed by the workspace: use those values, never recompute them. A missing probability or payoff is a gap to name, never one to fill with a guess.',
});
