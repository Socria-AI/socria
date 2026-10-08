// lib/objects/scene.ts
//
// A LIVE 3D SCENE, AS AN OBJECT OF THOUGHT — a persistent, structured scene
// graph that a person builds by describing it, and edits by describing more
// or by taking hold of a part.
//
// It is a kind in the objects substrate (core.ts), not a parallel system, so
// it inherits what that substrate guarantees: it lives in the map and so
// persists, restores and syncs with the line of thinking; every state after
// the first is computed here from an operation; every step records who chose
// it; a stored history whose states do not follow from their operations is
// cut on load.
//
//   node       one part: a stable id (its identity across every edit), what
//              the person calls it, a shape with exact dimensions in metres,
//              a placement, a look — and, optionally, what it RESTS ON
//   rests on   a support relation kept as structure: a part put on top of
//              another stays on it when the one beneath grows, shrinks or
//              moves. The floor is a support too.
//   operation  add · set · fit · move · moveTo · rotate · scale · look ·
//              place · copy · rename · remove · transform · clear · unit
//
// WHAT IT IS NOT. A geometric preview — shapes, sizes, positions, and mass
// where a density is given (ρ × volume, and no more). Nothing here is loaded,
// stressed, heated or simulated; no claim about how it behaves is made,
// and the facts say so. The physically validated models live elsewhere
// (lib/model/), with their own fidelity.
//
// PURE.

import { register, type ObjectKind } from './core';
import { centroid, localBox, measure, parsePoints, revolveThroat, rotateAbout, sectionOf, toWorld, worldBox, type Box3, type Vec3 } from './scene-geometry';
import { compileExpr } from '@/lib/logos-math';

export type LengthUnit = 'm' | 'cm' | 'mm' | 'in' | 'ft';
export const UNIT_M: Record<LengthUnit, number> = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048 };

export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'capsule', 'prism', 'star', 'ring', 'polygon', 'airfoil', 'surface', 'revolve', 'tube'] as const;
export type SceneShape = (typeof SHAPES)[number];
export const MATERIALS = ['matte', 'plastic', 'metal', 'glass', 'wire'] as const;
export type MaterialKind = (typeof MATERIALS)[number];

export interface SceneNode {
  id: string;
  name: string;
  shape: SceneShape;
  dims: Record<string, number>;
  exprs?: Record<string, string>;
  pos: Vec3;
  /** XYZ Euler angles, degrees */
  rot: Vec3;
  scale: Vec3;
  color: string;
  mat: MaterialKind;
  opacity: number;
  /** what it rests on: 'ground' or another node's id */
  on?: string;
  /** when resting on a node, its x–z offset from that node's centre */
  off?: [number, number];
  /** dimensions nobody gave — defaults, said as such */
  assumed?: string[];
  /** what it is made of, when someone has said */
  material?: string;
  /** kg/m³ — given by the person, or the nominal value for a named material (said as such) */
  density?: number;
  densityFrom?: 'given' | 'nominal';
}

export interface SceneState {
  nodes: SceneNode[];
  /** the counter ids come from, so an id is never reused, even after a part is removed */
  next: number;
  unit: LengthUnit;
}

export const MAX_NODES = 48;

/**
 * NOMINAL DENSITIES, kg/m³ — typical room-temperature values for common
 * materials, used only when a person names a material and gives no density,
 * and always said to be nominal: they are typical values, not a material card,
 * and a measured density replaces one. Words that are as often a colour as a
 * material (gold, silver) and finishes (glass, plastic) are not read as one.
 */
export const NOMINAL_DENSITY: Record<string, number> = {
  steel: 7850, 'stainless steel': 8000, iron: 7870, aluminium: 2700, aluminum: 2700, copper: 8960, brass: 8500, bronze: 8800,
  titanium: 4510, lead: 11340, concrete: 2400, granite: 2700, marble: 2700, brick: 1900, wood: 600, oak: 750, pine: 500,
  water: 1000, ice: 917, rubber: 1100, pla: 1240, abs: 1050, nylon: 1150, foam: 30, cork: 240,
};

// ── dimensions each shape has ───────────────────────────────────────

interface DimSpec {
  key: string;
  label: string;
  def: number;
  min: number;
  max: number;
  /** a count, not a length */
  count?: boolean;
  /** a coordinate bound, which may be negative */
  coord?: boolean;
}

const L = (key: string, label: string, def: number): DimSpec => ({ key, label, def, min: 1e-4, max: 1e4 });
const N = (key: string, label: string, def: number, min: number, max: number): DimSpec => ({ key, label, def, min, max, count: true });
const C = (key: string, label: string, def: number): DimSpec => ({ key, label, def, min: -1e4, max: 1e4, coord: true });

export const DIMS: Record<SceneShape, DimSpec[]> = {
  box: [L('w', 'width', 1), L('h', 'height', 1), L('d', 'depth', 1)],
  sphere: [L('r', 'radius', 0.5)],
  cylinder: [L('r', 'radius', 0.5), L('h', 'height', 1)],
  cone: [L('r', 'radius', 0.5), L('h', 'height', 1)],
  torus: [L('R', 'ring radius', 1), L('r', 'tube radius', 0.25)],
  plane: [L('w', 'width', 4), L('d', 'depth', 4)],
  capsule: [L('r', 'radius', 0.3), L('h', 'height', 1.2)],
  prism: [N('n', 'sides', 6, 3, 64), L('r', 'radius', 0.5), L('h', 'height', 1)],
  star: [N('n', 'points', 5, 3, 32), L('r', 'outer radius', 0.6), L('ri', 'inner radius', 0.3), L('h', 'thickness', 0.2)],
  ring: [L('R', 'outer radius', 0.6), L('r', 'inner radius', 0.4), L('h', 'thickness', 0.2)],
  polygon: [L('h', 'thickness', 0.2)],
  // a NACA four-digit section (m p tt), extruded along its span
  airfoil: [L('c', 'chord', 1), L('h', 'span', 2), N('m', 'max camber (% of chord)', 0, 0, 9), N('p', 'camber position (tenths of chord)', 0, 0, 9), N('t', 'thickness (% of chord)', 12, 1, 40)],
  surface: [C('x0', 'x from', -2), C('x1', 'x to', 2), C('y0', 'y from', -2), C('y1', 'y to', 2), N('n', 'grid', 48, 4, 128)],
  revolve: [C('y0', 'from height', 0), C('y1', 'to height', 2), N('n', 'samples', 64, 8, 200)],
  tube: [C('t0', 't from', 0), C('t1', 't to', 2 * Math.PI), L('r', 'tube radius', 0.05), N('n', 'samples', 200, 8, 1000)],
};

/** The expressions each shape is computed from, and the variables each may use. */
export const EXPRS: Partial<Record<SceneShape, Record<string, string[]>>> = {
  surface: { f: ['x', 'y'] },
  revolve: { r: ['y'] },
  tube: { x: ['t'], y: ['t'], z: ['t'] },
  polygon: { pts: [] },
};

export const SHAPE_WORD: Record<SceneShape, string> = {
  box: 'box',
  sphere: 'sphere',
  cylinder: 'cylinder',
  cone: 'cone',
  torus: 'torus',
  plane: 'plane',
  capsule: 'capsule',
  prism: 'prism',
  star: 'star',
  ring: 'ring',
  polygon: 'shape',
  airfoil: 'airfoil',
  surface: 'surface',
  revolve: 'revolved shape',
  tube: 'tube',
};

const DEFAULT_COLOR = '#c9c2b0';

// ── reading and checking ────────────────────────────────────────────

const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const vec3 = (v: unknown, def: Vec3): Vec3 | null => {
  if (v === undefined) return def;
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e5)) return null;
  return [v[0], v[1], v[2]];
};

/** Why these dimensions and expressions are not a shape, or null when they are. */
export function shapeProblem(shape: SceneShape, dims: Record<string, number>, exprs?: Record<string, string>): string | null {
  for (const d of DIMS[shape]) {
    const v = dims[d.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `The ${SHAPE_WORD[shape]} needs a ${d.label}.`;
    if (v < d.min || v > d.max) return `A ${d.label} of ${v} is outside what a ${SHAPE_WORD[shape]} here can have (${d.min}–${d.max}${d.count ? '' : ' m'}).`;
    if (d.count && !Number.isInteger(v)) return `The number of ${d.label} must be a whole number.`;
  }
  if (shape === 'star' && dims.ri >= dims.r) return 'A star’s inner radius must be smaller than its outer radius.';
  if (shape === 'ring' && dims.r >= dims.R) return 'A ring’s inner radius must be smaller than its outer radius.';
  if (shape === 'capsule' && dims.h < 2 * dims.r) return 'A capsule must be at least as tall as its diameter.';
  if (shape === 'airfoil' && dims.m > 0 && !(dims.p > 0)) return 'A cambered section needs where along the chord its camber peaks (the second digit).';
  if (shape === 'surface' && (dims.x1 <= dims.x0 || dims.y1 <= dims.y0)) return 'The surface’s range must run from a smaller number to a larger one.';
  if (shape === 'revolve' && dims.y1 <= dims.y0) return 'The revolved shape’s heights must run from a smaller number to a larger one.';
  if (shape === 'tube' && dims.t1 <= dims.t0) return 'The curve’s t must run from a smaller number to a larger one.';
  const want = EXPRS[shape];
  if (want) {
    for (const [key, vars] of Object.entries(want)) {
      const e = exprs?.[key];
      if (!e) return `The ${SHAPE_WORD[shape]} needs ${key === 'pts' ? 'its corners' : `${key} as an expression`}.`;
      if (key === 'pts') {
        if (!parsePoints(e)) return 'A shape needs at least three corners, as numbers.';
      } else if (!compileExpr(e, vars)) return `“${e}” could not be read as an expression in ${vars.join(', ')}.`;
    }
  }
  return null;
}

function sanitizeNode(raw: unknown, ids: Set<string>): SceneNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^[a-z][a-z0-9]{0,23}$/.test(r.id) ? r.id : null;
  if (!id || ids.has(id)) return null;
  const shape = SHAPES.includes(r.shape as SceneShape) ? (r.shape as SceneShape) : null;
  if (!shape) return null;
  const dims: Record<string, number> = {};
  for (const d of DIMS[shape]) {
    const v = num((r.dims as Record<string, unknown> | undefined)?.[d.key]);
    if (v === null) return null;
    dims[d.key] = v;
  }
  let exprs: Record<string, string> | undefined;
  if (EXPRS[shape]) {
    exprs = {};
    for (const key of Object.keys(EXPRS[shape]!)) {
      const e = (r.exprs as Record<string, unknown> | undefined)?.[key];
      if (typeof e !== 'string' || e.length > 400) return null;
      exprs[key] = e;
    }
  }
  if (shapeProblem(shape, dims, exprs)) return null;
  const pos = vec3(r.pos, [0, 0, 0]);
  const rot = vec3(r.rot, [0, 0, 0]);
  const scale = vec3(r.scale, [1, 1, 1]);
  if (!pos || !rot || !scale || scale.some((s) => s <= 0)) return null;
  const name = typeof r.name === 'string' && r.name.trim() && r.name.length <= 40 ? r.name.trim() : SHAPE_WORD[shape];
  const opacity = num(r.opacity);
  const off = Array.isArray(r.off) && r.off.length === 2 && r.off.every((x) => typeof x === 'number' && Number.isFinite(x)) ? ([r.off[0], r.off[1]] as [number, number]) : undefined;
  const node: SceneNode = {
    id,
    name,
    shape,
    dims,
    ...(exprs ? { exprs } : {}),
    pos,
    rot,
    scale,
    color: isHex(r.color) ? r.color.toLowerCase() : DEFAULT_COLOR,
    mat: MATERIALS.includes(r.mat as MaterialKind) ? (r.mat as MaterialKind) : 'matte',
    opacity: opacity !== null ? Math.min(1, Math.max(0.05, opacity)) : 1,
    ...(typeof r.on === 'string' && (r.on === 'ground' || /^[a-z][a-z0-9]{0,23}$/.test(r.on)) ? { on: r.on } : {}),
    ...(off ? { off } : {}),
    ...(Array.isArray(r.assumed) ? { assumed: r.assumed.filter((k): k is string => typeof k === 'string' && DIMS[shape].some((d) => d.key === k)) } : {}),
    ...(typeof r.material === 'string' && r.material.trim() && r.material.length <= 30 ? { material: r.material.trim() } : {}),
    ...(num(r.density) !== null && (r.density as number) > 0.1 && (r.density as number) < 30000 ? { density: r.density as number, densityFrom: r.densityFrom === 'given' ? 'given' : 'nominal' } : {}),
  };
  ids.add(id);
  return node;
}

export function sanitizeScene(raw: unknown): SceneState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.nodes) ? r.nodes : [];
  const ids = new Set<string>();
  const nodes: SceneNode[] = [];
  for (const n of list.slice(0, MAX_NODES)) {
    const s = sanitizeNode(n, ids);
    if (s) nodes.push(s);
  }
  // a support that is not in the scene is no support
  for (const n of nodes) if (n.on && n.on !== 'ground' && !ids.has(n.on)) delete n.on;
  const next = typeof r.next === 'number' && Number.isInteger(r.next) && r.next > 0 ? r.next : nodes.length + 1;
  const unit = Object.keys(UNIT_M).includes(r.unit as string) ? (r.unit as LengthUnit) : 'm';
  return { nodes, next: Math.max(next, nodes.length + 1), unit };
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
function sameNode(a: SceneNode, b: SceneNode): boolean {
  const vecSame = (u: readonly number[], v: readonly number[]) => u.length === v.length && u.every((x, i) => close(x, v[i]));
  const recSame = (u: Record<string, unknown> = {}, v: Record<string, unknown> = {}) =>
    Object.keys(u).length === Object.keys(v).length && Object.keys(u).every((k) => (typeof u[k] === 'number' ? close(u[k] as number, v[k] as number) : u[k] === v[k]));
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.shape === b.shape &&
    recSame(a.dims, b.dims) &&
    recSame(a.exprs, b.exprs) &&
    vecSame(a.pos, b.pos) &&
    vecSame(a.rot, b.rot) &&
    vecSame(a.scale, b.scale) &&
    a.color === b.color &&
    a.mat === b.mat &&
    close(a.opacity, b.opacity) &&
    a.on === b.on &&
    vecSame(a.off ?? [], b.off ?? []) &&
    a.material === b.material &&
    a.density === b.density &&
    a.densityFrom === b.densityFrom
  );
}

// ── the support relation, kept ──────────────────────────────────────

const byId = (s: SceneState, id: string) => s.nodes.find((n) => n.id === id) ?? null;

/** Everything resting, directly or not, on this node. */
export function dependents(s: SceneState, id: string): string[] {
  const out: string[] = [];
  const walk = (x: string) => {
    for (const n of s.nodes) if (n.on === x && !out.includes(n.id)) {
      out.push(n.id);
      walk(n.id);
    }
  };
  walk(id);
  return out;
}

/**
 * Put every resting part where its support says it is: on the floor, its
 * lowest point at y = 0; on a part, its lowest point on that part's highest,
 * at its kept offset. Supports first, so a stack settles bottom-up.
 */
export function settle(s: SceneState): SceneState {
  const nodes = s.nodes.map((n) => ({ ...n, pos: [...n.pos] as Vec3 }));
  const map = new Map(nodes.map((n) => [n.id, n]));
  const done = new Set<string>();
  const visit = (n: SceneNode, depth: number) => {
    if (done.has(n.id) || depth > MAX_NODES) return;
    if (n.on && n.on !== 'ground') {
      const sup = map.get(n.on);
      if (!sup) delete n.on;
      else {
        visit(sup, depth + 1);
        const sb = worldBox(sup);
        const nb = worldBox(n);
        if (sb && nb) {
          const off = n.off ?? [0, 0];
          n.pos[0] = sup.pos[0] + off[0];
          n.pos[2] = sup.pos[2] + off[1];
          const nb2 = worldBox(n)!;
          n.pos[1] += sb.max[1] - nb2.min[1];
        }
      }
    }
    if (n.on === 'ground') {
      const nb = worldBox(n);
      if (nb) n.pos[1] -= nb.min[1];
    }
    // clean the arithmetic so a settled scene compares equal to itself
    n.pos = n.pos.map((v) => (Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e12) / 1e12)) as Vec3;
    done.add(n.id);
  };
  for (const n of nodes) visit(n, 0);
  return { ...s, nodes };
}

// ── operations ──────────────────────────────────────────────────────

type Args = Record<string, string | number>;

const getStr = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
const getNum = (a: Args, k: string) => (typeof a[k] === 'number' ? (a[k] as number) : typeof a[k] === 'string' && a[k] !== '' && Number.isFinite(Number(a[k])) ? Number(a[k]) : undefined);

/** "w=2;h=1" → {w: 2, h: 1} */
export function readPairs(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(/;(?![^(]*\))/)) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
export const writePairs = (o: Record<string, string | number>) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(';');
const readVec = (raw: string | undefined): Vec3 | null => {
  if (!raw) return null;
  const v = raw.split(',').map((x) => Number(x));
  return v.length === 3 && v.every(Number.isFinite) ? (v as Vec3) : null;
};

/** A default name not yet used: "box", "box 2", "box 3". */
function freshNodeName(s: SceneState, word: string): string {
  if (!s.nodes.some((n) => n.name === word)) return word;
  for (let i = 2; i < 200; i++) if (!s.nodes.some((n) => n.name === `${word} ${i}`)) return `${word} ${i}`;
  return `${word} ${s.next}`;
}

/** Where a new or moved part goes, relative to another (or the floor). */
function placeRelative(s: SceneState, n: SceneNode, target: string, side: string, gap: number): SceneNode | string {
  if (target === 'ground' || side === 'ground') return { ...n, on: 'ground', off: undefined };
  const t = byId(s, target);
  if (!t) return 'There is no such part to put it next to.';
  if (t.id === n.id) return 'A part cannot be placed relative to itself.';
  if (dependents(s, n.id).includes(t.id)) return `${t.name} rests on ${n.name}, so ${n.name} cannot go on it.`;
  const tb = worldBox(t);
  const nb = worldBox({ ...n, pos: [0, 0, 0] });
  if (!tb || !nb) return 'That shape could not be measured.';
  const c: Vec3 = [(tb.min[0] + tb.max[0]) / 2, (tb.min[1] + tb.max[1]) / 2, (tb.min[2] + tb.max[2]) / 2];
  const out: SceneNode = { ...n, pos: [...n.pos] as Vec3 };
  delete out.on;
  delete out.off;
  if (side === 'top') {
    if (gap > 0) {
      // above it, with space between: hovering, not resting
      out.pos = [c[0], tb.max[1] + gap - nb.min[1], c[2]];
      return out;
    }
    return { ...out, on: t.id, off: [0, 0] };
  }
  if (side === 'bottom') {
    // beneath it, on the floor
    out.pos = [c[0], 0, c[2]];
    return { ...out, on: 'ground' };
  }
  const axis = side === 'left' || side === 'right' ? 0 : 2;
  const sign = side === 'right' || side === 'front' ? 1 : -1;
  out.pos = [c[0], 0, c[2]];
  out.pos[axis] = sign > 0 ? tb.max[axis] + gap - nb.min[axis] : tb.min[axis] - gap - nb.max[axis];
  // side by side: on whatever the target rests on (the floor, usually), else bottoms aligned
  if (t.on === 'ground' || !t.on) {
    if (t.on === 'ground') return { ...out, on: 'ground' };
    out.pos[1] = tb.min[1] - nb.min[1];
    return out;
  }
  const sup = byId(s, t.on);
  if (sup) return { ...out, on: sup.id, off: [out.pos[0] - sup.pos[0], out.pos[2] - sup.pos[2]] };
  return out;
}

function withNode(s: SceneState, id: string, fn: (n: SceneNode) => SceneNode): SceneState {
  return settle({ ...s, nodes: s.nodes.map((n) => (n.id === id ? fn(n) : n)) });
}

const need = (s: SceneState, a: Args): string | null => {
  const id = getStr(a, 'id');
  if (!id || !byId(s, id)) return 'There is no such part in the scene.';
  return null;
};

function addOp(s: SceneState, a: Args): SceneState {
  const shape = getStr(a, 'shape') as SceneShape;
  const given = readPairs(getStr(a, 'dims'));
  const dims: Record<string, number> = {};
  const assumed: string[] = [];
  for (const d of DIMS[shape]) {
    if (given[d.key] !== undefined) dims[d.key] = Number(given[d.key]);
    else {
      dims[d.key] = d.def;
      assumed.push(d.key);
    }
  }
  const exprPairs = readPairs(getStr(a, 'exprs'));
  const exprs = EXPRS[shape] ? Object.fromEntries(Object.keys(EXPRS[shape]!).map((k) => [k, exprPairs[k] ?? ''])) : undefined;
  const look = readPairs(getStr(a, 'look'));
  const id = `${shape === 'polygon' ? 'shape' : shape}${s.next}`;
  const at = readVec(getStr(a, 'at'));
  // an airfoil lies as a wing does — chord along x, thickness up, span along z — which is its extrusion turned −90° about x
  const rot = readVec(getStr(a, 'rot')) ?? ((shape === 'airfoil' ? [-90, 0, 0] : [0, 0, 0]) as Vec3);
  const node: SceneNode = {
    id,
    name: getStr(a, 'name') || freshNodeName(s, SHAPE_WORD[shape]),
    shape,
    dims,
    ...(exprs ? { exprs } : {}),
    pos: at ?? [0, 0, 0],
    rot,
    scale: [1, 1, 1],
    color: isHex(look.color) ? look.color.toLowerCase() : DEFAULT_COLOR,
    mat: MATERIALS.includes(look.mat as MaterialKind) ? (look.mat as MaterialKind) : 'matte',
    opacity: look.opacity !== undefined ? Math.min(1, Math.max(0.05, Number(look.opacity))) : look.mat === 'glass' ? 0.35 : 1,
    ...(assumed.length ? { assumed } : {}),
  };
  const place = readPairs(getStr(a, 'place'));
  let placed: SceneNode | string = node;
  const yGiven = at !== null && getStr(a, 'free') !== 'y';
  if (place.on) placed = placeRelative({ ...s, nodes: [...s.nodes, node] }, node, place.on, place.side ?? 'top', Number(place.gap ?? 0));
  else if (!yGiven || at === null) placed = { ...node, on: 'ground' };
  if (typeof placed === 'string') throw new Error(placed);
  return settle({ ...s, nodes: [...s.nodes, placed], next: s.next + 1 });
}

function copyOp(s: SceneState, a: Args): SceneState {
  const src = byId(s, getStr(a, 'id')!)!;
  const count = Math.round(getNum(a, 'count') ?? 1);
  let next = s.next;
  const nodes = [...s.nodes];
  const ring = getNum(a, 'ring');
  for (let k = 1; k <= count; k++) {
    const id = `${src.shape === 'polygon' ? 'shape' : src.shape}${next++}`;
    const copy: SceneNode = { ...src, id, name: freshNodeName({ ...s, nodes }, src.name.replace(/ \d+$/, '')), pos: [...src.pos] as Vec3, ...(src.off ? { off: [...src.off] as [number, number] } : {}) };
    if (ring) {
      // around the vertical axis through `cx, cz`, the source being the first of count + 1
      const total = count + 1;
      const cx = getNum(a, 'cx') ?? src.pos[0] - ring;
      const cz = getNum(a, 'cz') ?? src.pos[2];
      const a0 = Math.atan2(src.pos[2] - cz, src.pos[0] - cx);
      const ang = a0 + (2 * Math.PI * k) / total;
      copy.pos[0] = cx + ring * Math.cos(ang);
      copy.pos[2] = cz + ring * Math.sin(ang);
      copy.rot = rotateAbout(src.rot, 'y', (-360 * k) / total);
      if (copy.on && copy.on !== 'ground') {
        const sup = byId(s, copy.on);
        if (sup) copy.off = [copy.pos[0] - sup.pos[0], copy.pos[2] - sup.pos[2]];
      }
    } else {
      const dx = (getNum(a, 'dx') ?? 0) * k;
      const dy = (getNum(a, 'dy') ?? 0) * k;
      const dz = (getNum(a, 'dz') ?? 0) * k;
      copy.pos = [src.pos[0] + dx, src.pos[1] + dy, src.pos[2] + dz];
      if (dy !== 0) {
        // stacked copies rest on the one below them
        if (getStr(a, 'stack') === 'y') {
          copy.on = k === 1 ? src.id : `${src.shape === 'polygon' ? 'shape' : src.shape}${next - 2}`;
          copy.off = [0, 0];
        } else {
          delete copy.on;
          delete copy.off;
        }
      } else if (copy.on && copy.on !== 'ground') copy.off = [(src.off?.[0] ?? 0) + dx, (src.off?.[1] ?? 0) + dz];
    }
    nodes.push(copy);
  }
  return settle({ ...s, nodes, next });
}

export const SCENE_OPS: Record<string, { label: string; check: (s: SceneState, a: Args) => string | null; apply: (s: SceneState, a: Args) => SceneState; say: (a: Args) => string }> = {
  add: {
    label: 'Add a part',
    check: (s, a) => {
      const shape = getStr(a, 'shape') as SceneShape;
      if (!SHAPES.includes(shape)) return 'That is not a shape this scene can make.';
      if (s.nodes.length >= MAX_NODES) return `A scene holds at most ${MAX_NODES} parts.`;
      const given = readPairs(getStr(a, 'dims'));
      const dims: Record<string, number> = {};
      for (const d of DIMS[shape]) dims[d.key] = given[d.key] !== undefined ? Number(given[d.key]) : d.def;
      const exprPairs = readPairs(getStr(a, 'exprs'));
      const exprs = EXPRS[shape] ? Object.fromEntries(Object.keys(EXPRS[shape]!).map((k) => [k, exprPairs[k] ?? ''])) : undefined;
      const p = shapeProblem(shape, dims, exprs);
      if (p) return p;
      const place = readPairs(getStr(a, 'place'));
      if (place.on && place.on !== 'ground' && !byId(s, place.on)) return 'There is no such part to put it on.';
      return null;
    },
    apply: addOp,
    say: (a) => {
      const d = readPairs(getStr(a, 'dims'));
      const dims = Object.entries(d).map(([k, v]) => `${k} ${v}`).join(', ');
      const place = readPairs(getStr(a, 'place'));
      return `add ${getStr(a, 'shape')}${dims ? ` (${dims})` : ''}${place.on ? ` ${place.side === 'top' || !place.side ? 'on' : place.side + ' of'} ${place.on}` : ''}`;
    },
  },
  set: {
    label: 'Set a dimension',
    check: (s, a) => {
      const miss = need(s, a);
      if (miss) return miss;
      const n = byId(s, getStr(a, 'id')!)!;
      const key = getStr(a, 'key')!;
      if (key.startsWith('expr.')) {
        const k = key.slice(5);
        const vars = EXPRS[n.shape]?.[k];
        if (!vars) return `A ${SHAPE_WORD[n.shape]} has no expression ${k}.`;
        return shapeProblem(n.shape, n.dims, { ...(n.exprs ?? {}), [k]: String(a.value) });
      }
      if (!DIMS[n.shape].some((d) => d.key === key)) return `A ${SHAPE_WORD[n.shape]} has no ${key}.`;
      const v = getNum(a, 'value');
      if (v === undefined) return 'That needs a number.';
      return shapeProblem(n.shape, { ...n.dims, [key]: v }, n.exprs);
    },
    apply: (s, a) =>
      withNode(s, getStr(a, 'id')!, (n) => {
        const key = getStr(a, 'key')!;
        if (key.startsWith('expr.')) return { ...n, exprs: { ...(n.exprs ?? {}), [key.slice(5)]: String(a.value) } };
        return { ...n, dims: { ...n.dims, [key]: getNum(a, 'value')! }, ...(n.assumed ? { assumed: n.assumed.filter((k) => k !== key) } : {}) };
      }),
    say: (a) => `set ${getStr(a, 'id')} ${getStr(a, 'key')} = ${a.value}`,
  },
  fit: {
    label: 'Make it a size along an axis',
    check: (s, a) => {
      const miss = need(s, a);
      if (miss) return miss;
      const size = getNum(a, 'size');
      if (!(size !== undefined && size > 0 && size < 1e4)) return 'A size must be a positive length.';
      const axis = getStr(a, 'axis') ?? '';
      if (!['x', 'y', 'z'].includes(axis)) return 'Which way: width, height or depth?';
      const n = byId(s, getStr(a, 'id')!)!;
      if (!fitKey(n.shape, axis as 'x' | 'y' | 'z')) {
        const b = worldBox({ ...n, rot: [0, 0, 0] });
        const k = { x: 0, y: 1, z: 2 }[axis as 'x' | 'y' | 'z'];
        if (!b || !(b.max[k] - b.min[k] > 1e-9)) return `A ${SHAPE_WORD[n.shape]} has no ${['width', 'height', 'depth'][k]} to set.`;
      }
      return null;
    },
    apply: (s, a) =>
      withNode(s, getStr(a, 'id')!, (n) => {
        const axis = getStr(a, 'axis')!;
        const size = getNum(a, 'size')!;
        const k = { x: 0, y: 1, z: 2 }[axis as 'x' | 'y' | 'z'];
        const key = fitKey(n.shape, axis as 'x' | 'y' | 'z');
        if (key) {
          // the dimension that IS that extent, accounting for the part's own stretch
          const want = size / n.scale[k];
          const v = key === 'r' || key === 'R' ? want / 2 : want;
          const dims = { ...n.dims, [key]: v };
          if (shapeProblem(n.shape, dims, n.exprs)) return n;
          return { ...n, dims, ...(n.assumed ? { assumed: n.assumed.filter((x) => x !== key) } : {}) };
        }
        // no single dimension is that extent (a sphere's height is also its width): stretch
        const b = worldBox({ ...n, rot: [0, 0, 0] });
        if (!b) return n;
        const cur = b.max[k] - b.min[k];
        const scale = [...n.scale] as Vec3;
        scale[k] *= size / cur;
        return { ...n, scale };
      }),
    say: (a) => `make ${getStr(a, 'id')} ${a.size} m along ${getStr(a, 'axis')}`,
  },
  move: {
    label: 'Move by',
    check: need,
    apply: (s, a) =>
      withNode(s, getStr(a, 'id')!, (n) => {
        const dx = getNum(a, 'dx') ?? 0;
        const dy = getNum(a, 'dy') ?? 0;
        const dz = getNum(a, 'dz') ?? 0;
        const out: SceneNode = { ...n, pos: [n.pos[0] + dx, n.pos[1] + dy, n.pos[2] + dz] };
        if (dy !== 0) {
          // lifted or lowered: no longer resting on what it rested on
          delete out.on;
          delete out.off;
        } else if (n.on && n.on !== 'ground') out.off = [(n.off?.[0] ?? 0) + dx, (n.off?.[1] ?? 0) + dz];
        return out;
      }),
    say: (a) => `move ${getStr(a, 'id')} by (${a.dx ?? 0}, ${a.dy ?? 0}, ${a.dz ?? 0})`,
  },
  moveTo: {
    label: 'Move to',
    check: need,
    apply: (s, a) =>
      withNode(s, getStr(a, 'id')!, (n) => {
        const x = getNum(a, 'x') ?? n.pos[0];
        const z = getNum(a, 'z') ?? n.pos[2];
        const y = getNum(a, 'y');
        const out: SceneNode = { ...n, pos: [x, y ?? n.pos[1], z] };
        if (y !== undefined) {
          delete out.on;
          delete out.off;
        } else if (n.on && n.on !== 'ground') {
          const sup = byId(s, n.on);
          if (sup) out.off = [x - sup.pos[0], z - sup.pos[2]];
        }
        return out;
      }),
    say: (a) => `move ${getStr(a, 'id')} to (${a.x ?? '·'}, ${a.y ?? '·'}, ${a.z ?? '·'})`,
  },
  rotate: {
    label: 'Rotate',
    check: (s, a) => need(s, a) ?? (['x', 'y', 'z'].includes(getStr(a, 'axis') ?? '') && getNum(a, 'deg') !== undefined ? null : 'A rotation needs an axis and an angle.'),
    apply: (s, a) => withNode(s, getStr(a, 'id')!, (n) => ({ ...n, rot: rotateAbout(n.rot, getStr(a, 'axis') as 'x' | 'y' | 'z', getNum(a, 'deg')!) })),
    say: (a) => `rotate ${getStr(a, 'id')} ${a.deg}° about ${getStr(a, 'axis')}`,
  },
  scale: {
    label: 'Scale',
    check: (s, a) => {
      const miss = need(s, a);
      if (miss) return miss;
      const f = ['sx', 'sy', 'sz'].map((k) => getNum(a, k) ?? 1);
      if (f.some((v) => !(v > 0) || v > 1000)) return 'A scale must be a positive factor.';
      const n = byId(s, getStr(a, 'id')!)!;
      if (n.scale.some((v, i) => v * f[i] < 1e-4 || v * f[i] > 1e4)) return 'That would make it too small or too large to keep.';
      return null;
    },
    apply: (s, a) => withNode(s, getStr(a, 'id')!, (n) => ({ ...n, scale: n.scale.map((v, i) => v * (getNum(a, ['sx', 'sy', 'sz'][i]) ?? 1)) as Vec3 })),
    say: (a) => (a.sx === a.sy && a.sy === a.sz ? `scale ${getStr(a, 'id')} ×${a.sx}` : `scale ${getStr(a, 'id')} by (${a.sx ?? 1}, ${a.sy ?? 1}, ${a.sz ?? 1})`),
  },
  look: {
    label: 'Change its look',
    check: (s, a) => {
      const miss = need(s, a);
      if (miss) return miss;
      if (a.color !== undefined && !isHex(a.color)) return 'That is not a colour.';
      if (a.mat !== undefined && !MATERIALS.includes(a.mat as MaterialKind)) return 'That is not a finish this scene has.';
      const o = getNum(a, 'opacity');
      if (a.opacity !== undefined && !(o !== undefined && o > 0 && o <= 1)) return 'Opacity runs from just above 0 to 1.';
      return null;
    },
    apply: (s, a) =>
      withNode(s, getStr(a, 'id')!, (n) => ({
        ...n,
        ...(isHex(a.color) ? { color: (a.color as string).toLowerCase() } : {}),
        ...(a.mat ? { mat: a.mat as MaterialKind } : {}),
        ...(getNum(a, 'opacity') !== undefined ? { opacity: Math.max(0.05, getNum(a, 'opacity')!) } : a.mat === 'glass' && n.opacity === 1 ? { opacity: 0.35 } : a.mat && a.mat !== 'glass' && n.mat === 'glass' ? { opacity: 1 } : {}),
      })),
    say: (a) => `look of ${getStr(a, 'id')}: ${[a.color, a.mat, a.opacity !== undefined ? `opacity ${a.opacity}` : ''].filter(Boolean).join(', ')}`,
  },
  place: {
    label: 'Place relative to another part',
    check: (s, a) => {
      const miss = need(s, a);
      if (miss) return miss;
      const r = placeRelative(s, byId(s, getStr(a, 'id')!)!, getStr(a, 'target') ?? 'ground', getStr(a, 'side') ?? 'top', getNum(a, 'gap') ?? 0);
      return typeof r === 'string' ? r : null;
    },
    apply: (s, a) => {
      const r = placeRelative(s, byId(s, getStr(a, 'id')!)!, getStr(a, 'target') ?? 'ground', getStr(a, 'side') ?? 'top', getNum(a, 'gap') ?? 0) as SceneNode;
      return settle({ ...s, nodes: s.nodes.map((n) => (n.id === r.id ? r : n)) });
    },
    say: (a) => `put ${getStr(a, 'id')} ${getStr(a, 'side') === 'top' ? 'on' : (getStr(a, 'side') ?? 'on') + ' of'} ${getStr(a, 'target')}`,
  },
  copy: {
    label: 'Copy',
    check: (s, a) => {
      const miss = need(s, a);
      if (miss) return miss;
      const c = Math.round(getNum(a, 'count') ?? 1);
      if (!(c >= 1 && c <= 40)) return 'Between 1 and 40 copies.';
      if (s.nodes.length + c > MAX_NODES) return `A scene holds at most ${MAX_NODES} parts.`;
      return null;
    },
    apply: copyOp,
    say: (a) => (a.ring ? `copy ${getStr(a, 'id')} ×${a.count} around a circle of radius ${a.ring}` : `copy ${getStr(a, 'id')} ×${a.count ?? 1}, each (${a.dx ?? 0}, ${a.dy ?? 0}, ${a.dz ?? 0}) on`),
  },
  matter: {
    label: 'What it is made of',
    check: (s, a) => {
      const miss = need(s, a);
      if (miss) return miss;
      const name = getStr(a, 'name');
      const rho = getNum(a, 'density');
      if (name !== undefined && (!name.trim() || name.length > 30)) return 'A material, please.';
      if (rho !== undefined && !(rho > 0.1 && rho < 30000)) return 'A density, in kg/m³, between 0.1 and 30 000.';
      if (rho === undefined && !(name && NOMINAL_DENSITY[name.toLowerCase()] !== undefined)) return name ? `No nominal density is kept for ${name} — give one, in kg/m³.` : 'A material or a density, please.';
      return null;
    },
    apply: (s, a) =>
      withNode(s, getStr(a, 'id')!, (n) => {
        const name = getStr(a, 'name');
        const rho = getNum(a, 'density');
        return {
          ...n,
          ...(name ? { material: name.toLowerCase() } : {}),
          density: rho ?? NOMINAL_DENSITY[name!.toLowerCase()],
          densityFrom: rho !== undefined ? 'given' : 'nominal',
        };
      }),
    say: (a) => `${getStr(a, 'id')} is ${[getStr(a, 'name'), a.density !== undefined ? `${a.density} kg/m³` : ''].filter(Boolean).join(', ')}`,
  },
  rename: {
    label: 'Rename',
    check: (s, a) => need(s, a) ?? (typeof a.name === 'string' && a.name.trim() && a.name.length <= 40 ? null : 'A name, please.'),
    apply: (s, a) => withNode(s, getStr(a, 'id')!, (n) => ({ ...n, name: (a.name as string).trim() })),
    say: (a) => `call ${getStr(a, 'id')} “${a.name}”`,
  },
  remove: {
    label: 'Remove',
    check: need,
    apply: (s, a) => {
      const id = getStr(a, 'id')!;
      // what rested on it stays where it is, no longer resting on anything
      return settle({ ...s, nodes: s.nodes.filter((n) => n.id !== id).map((n) => (n.on === id ? (({ on: _o, off: _f, ...rest }) => rest)(n) : n)) });
    },
    say: (a) => `remove ${getStr(a, 'id')}`,
  },
  transform: {
    label: 'Set position, rotation and scale',
    check: (s, a) => {
      const miss = need(s, a);
      if (miss) return miss;
      const vals = ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'].map((k) => getNum(a, k));
      if (vals.some((v) => v === undefined || Math.abs(v) > 1e5)) return 'A transform needs nine numbers.';
      if (vals.slice(6).some((v) => !(v! > 1e-4))) return 'A scale must be positive.';
      return null;
    },
    apply: (s, a) =>
      withNode(s, getStr(a, 'id')!, (n) => {
        const v = (k: string) => getNum(a, k)!;
        const out: SceneNode = { ...n, pos: [v('x'), v('y'), v('z')], rot: [v('rx'), v('ry'), v('rz')], scale: [v('sx'), v('sy'), v('sz')] };
        // dragged off its support (moved vertically): it rests on nothing now
        if (Math.abs(v('y') - n.pos[1]) > 1e-6 && getStr(a, 'keep') !== 'y') {
          delete out.on;
          delete out.off;
        } else if (n.on && n.on !== 'ground') {
          const sup = byId(s, n.on);
          if (sup) out.off = [v('x') - sup.pos[0], v('z') - sup.pos[2]];
        }
        return out;
      }),
    say: (a) => `set ${getStr(a, 'id')} to (${[a.x, a.y, a.z].map((v) => Number(v).toFixed(2)).join(', ')})`,
  },
  clear: {
    label: 'Clear the scene',
    check: (s) => (s.nodes.length ? null : 'The scene is already empty.'),
    apply: (s) => ({ ...s, nodes: [] }),
    say: () => 'clear the scene',
  },
  unit: {
    label: 'Display unit',
    check: (_s, a) => (Object.keys(UNIT_M).includes(String(a.unit)) ? null : 'That is not a length unit here.'),
    apply: (s, a) => ({ ...s, unit: a.unit as LengthUnit }),
    say: (a) => `show lengths in ${a.unit}`,
  },
};

/** The dimension that is a shape's extent along an axis, if one is. */
export function fitKey(shape: SceneShape, axis: 'x' | 'y' | 'z'): string | null {
  const table: Partial<Record<SceneShape, Partial<Record<'x' | 'y' | 'z', string>>>> = {
    box: { x: 'w', y: 'h', z: 'd' },
    cylinder: { y: 'h' },
    cone: { y: 'h' },
    capsule: { y: 'h' },
    prism: { y: 'h' },
    star: { y: 'h' },
    ring: { y: 'h' },
    polygon: { y: 'h' },
    airfoil: { x: 'c', y: 'h' },
    plane: { x: 'w', z: 'd' },
  };
  return table[shape]?.[axis] ?? null;
}

// ── saying what is there ────────────────────────────────────────────

export const lengthIn = (m: number, unit: LengthUnit) => {
  const v = m / UNIT_M[unit];
  const r = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : Number(v.toPrecision(3)).toString();
  return `${r.replace(/^-/, '−')} ${unit}`;
};

export function sizeOf(n: SceneNode, unit: LengthUnit): string {
  const b = worldBox({ ...n, rot: [0, 0, 0], pos: [0, 0, 0] });
  const d = n.dims;
  const s = n.scale;
  const u = (m: number) => lengthIn(m, unit);
  const uniform = s[0] === s[1] && s[1] === s[2];
  switch (n.shape) {
    case 'box':
      return `${u(d.w * s[0])} wide × ${u(d.h * s[1])} tall × ${u(d.d * s[2])} deep`;
    case 'sphere':
      return uniform ? `radius ${u(d.r * s[0])}` : `stretched sphere ${u(d.r * 2 * s[0])} × ${u(d.r * 2 * s[1])} × ${u(d.r * 2 * s[2])}`;
    case 'cylinder':
    case 'cone':
    case 'capsule':
      return `radius ${u(d.r * s[0])}, ${u(d.h * s[1])} tall`;
    case 'torus':
      return `ring radius ${u(d.R * s[0])}, tube radius ${u(d.r * s[0])}`;
    case 'plane':
      return `${u(d.w * s[0])} × ${u(d.d * s[2])}`;
    case 'prism':
      return `${d.n} sides, radius ${u(d.r * s[0])}, ${u(d.h * s[1])} tall`;
    case 'star':
      return `${d.n} points, radii ${u(d.r * s[0])} and ${u(d.ri * s[0])}, ${u(d.h * s[1])} thick`;
    case 'ring':
      return `radii ${u(d.R * s[0])} and ${u(d.r * s[0])}, ${u(d.h * s[1])} thick`;
    case 'polygon':
      return `${parsePoints(n.exprs?.pts)?.length ?? 0} corners, ${u(d.h * s[1])} thick`;
    case 'airfoil':
      return `NACA ${d.m}${d.p}${String(d.t).padStart(2, '0')}, chord ${u(d.c * s[0])}, span ${u(d.h * s[1])}`;
    case 'surface':
      return `z = ${n.exprs?.f} over x ∈ [${d.x0}, ${d.x1}], y ∈ [${d.y0}, ${d.y1}]`;
    case 'revolve':
      return `r = ${n.exprs?.r} turned about the vertical, y ∈ [${d.y0}, ${d.y1}]`;
    case 'tube':
      return `the curve (${n.exprs?.x}, ${n.exprs?.y}, ${n.exprs?.z}), t ∈ [${Number(d.t0.toFixed(3))}, ${Number(d.t1.toFixed(3))}], tube radius ${u(d.r)}`;
  }
  return b ? `${u(b.max[0] - b.min[0])} × ${u(b.max[1] - b.min[1])} × ${u(b.max[2] - b.min[2])}` : '';
}

export function nodeLine(s: SceneState, n: SceneNode, guarded = false): string {
  const at = n.pos.map((v) => lengthIn(v, s.unit).replace(/ \w+$/, '')).join(', ');
  const m = measure(n);
  const rest = n.on === 'ground' ? 'rests on the floor' : n.on ? `rests on ${byId(s, n.on)?.name ?? n.on}` : 'stands free';
  const rot = n.rot.some((v) => v !== 0) ? `, turned (${n.rot.map((v) => Number(v.toFixed(2))).join(', ')})°` : '';
  const vol = !guarded && m.volume !== null ? `; volume ${m.volume.toPrecision(4)} m³${m.how === 'numerical' ? ' (numerical)' : ''}` : '';
  const assumed = n.assumed?.length ? ` [default ${n.assumed.map((k) => DIMS[n.shape].find((d) => d.key === k)?.label ?? k).join(', ')}]` : '';
  const mm = !guarded ? massOf(n) : null;
  const made =
    n.density !== undefined
      ? `; ${n.material ?? 'material'} at ${n.density} kg/m³${n.densityFrom === 'given' ? '' : ' (nominal — a typical value, not a measurement)'}${mm ? `, mass ${kgSaid(mm.kg)}${mm.how === 'numerical' ? ' (numerical)' : ''}` : ''}`
      : '';
  return `${n.id} “${n.name}”: ${SHAPE_WORD[n.shape]}, ${sizeOf(n, s.unit)}${assumed} at (${at}) ${s.unit}${rot}; ${n.color}${n.mat !== 'matte' ? ` ${n.mat}` : ''}; ${rest}${vol}${made}`;
}

/**
 * What a shape's own geometry says, beyond its size: a revolved contour's
 * narrowest radius (a nozzle's throat) and the area ratios to it; a wing's
 * planform area and aspect ratio. Geometry only — no flow or lift is implied.
 */
function shapeFacts(n: SceneNode, unit: LengthUnit): string[] {
  if (n.shape === 'revolve') {
    const t = revolveThroat(n);
    if (!t || !(t.rMin > 0)) return [];
    // stretched unevenly across, its sections are ellipses: the radii are then its profile's
    const even = Math.abs(n.scale[0] - n.scale[2]) < 1e-9;
    const k = even ? n.scale[0] : 1;
    return [
      `narrowest radius ${lengthIn(t.rMin * k, unit)}${even ? '' : ' (of its profile, before the stretch)'} where its profile has y = ${Number(t.yMin.toPrecision(4))} (its throat); ends ${lengthIn(t.rStart * k, unit)} and ${lengthIn(t.rEnd * k, unit)}`,
      `end-to-throat area ratios (r/r_min)²: ${Number(((t.rStart / t.rMin) ** 2).toPrecision(4))} and ${Number(((t.rEnd / t.rMin) ** 2).toPrecision(4))} — geometry only`,
    ];
  }
  const sec = sectionOf(n);
  if (sec) {
    // small quantities in powers of ten — 1.367×10⁻⁴ m⁴, not 0.0001367
    const e = (v: number) => {
      if (v === 0 || (Math.abs(v) >= 1e-2 && Math.abs(v) < 1e5)) return String(Number(v.toPrecision(4)));
      const k = Math.floor(Math.log10(Math.abs(v)));
      const sup = String(k).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]);
      return `${(v / 10 ** k).toFixed(3)}×10${sup}`;
    };
    const tiny = 1e-9 * Math.sqrt(sec.area);
    const cx = Math.abs(sec.cx) < tiny ? 0 : sec.cx;
    const cz = Math.abs(sec.cz) < tiny ? 0 : sec.cz;
    const off = cx || cz ? `, its centroid (${lengthIn(cx, unit)}, ${lengthIn(cz, unit)}) from the part's middle` : '';
    return [
      `section, in the part's own x–z plane: area ${e(sec.area)} m²${off}; second moments about its centroid — about x (∫z² dA) ${e(sec.Ix)} m⁴, about z (∫x² dA) ${e(sec.Iz)} m⁴ — geometry only, no load is applied`,
    ];
  }
  if (n.shape === 'airfoil') {
    // its outline is in the part's own x–z plane (chord along x, thickness along z), extruded along y to its span
    const c = n.dims.c * n.scale[0];
    const b = n.dims.h * n.scale[1];
    const thick = (n.dims.t / 100) * n.dims.c * n.scale[2];
    return [`planform area ${(c * b).toPrecision(4)} m²; aspect ratio b²/S = ${(b / c).toPrecision(4)}; thickest ${lengthIn(thick, unit)} (${Number(((100 * thick) / c).toPrecision(3))}% of the chord) — geometry only, no lift is computed`];
  }
  return [];
}

/** A part's mass, where its density is known: ρ times the volume, exactly as the volume is. */
export function massOf(n: SceneNode): { kg: number; how: 'exact' | 'numerical'; nominal: boolean } | null {
  if (n.density === undefined) return null;
  const m = measure(n);
  if (m.volume === null) return null;
  return { kg: n.density * m.volume, how: m.how, nominal: n.densityFrom !== 'given' };
}

/**
 * The scene's mass and centre of mass, over the parts whose density is known —
 * each part's mass at its own centroid (scene-geometry.ts centroid), turned and
 * placed. Parts with no density are counted, not guessed.
 */
export function sceneMass(s: SceneState): { kg: number; at: Vec3; weighed: number; unweighed: number; nominal: number; how: 'exact' | 'numerical' } | null {
  let kg = 0;
  const at: Vec3 = [0, 0, 0];
  let weighed = 0;
  let nominal = 0;
  let numerical = false;
  for (const n of s.nodes) {
    const m = massOf(n);
    const c = centroid(n);
    if (!m || !c) continue;
    const w = toWorld(n, c);
    kg += m.kg;
    for (let k = 0; k < 3; k++) at[k] += m.kg * w[k];
    weighed++;
    if (m.nominal) nominal++;
    if (m.how === 'numerical') numerical = true;
  }
  if (!weighed || !(kg > 0)) return null;
  return { kg, at: at.map((v) => v / kg) as Vec3, weighed, unweighed: s.nodes.length - weighed, nominal, how: numerical ? 'numerical' : 'exact' };
}

const kgSaid = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toPrecision(4)} t` : kg >= 1 ? `${kg.toPrecision(4)} kg` : `${(kg * 1000).toPrecision(4)} g`);

export function sceneBox(s: SceneState): Box3 | null {
  const bs = s.nodes.map((n) => worldBox(n)).filter((b): b is Box3 => !!b);
  if (!bs.length) return null;
  return {
    min: [0, 1, 2].map((k) => Math.min(...bs.map((b) => b.min[k]))) as Vec3,
    max: [0, 1, 2].map((k) => Math.max(...bs.map((b) => b.max[k]))) as Vec3,
  };
}

// ── the kind ────────────────────────────────────────────────────────

export const SCENE: ObjectKind<SceneState> = {
  kind: 'scene',
  label: 'Scene',
  sanitize: sanitizeScene,
  same: (a, b) => a.next === b.next && a.unit === b.unit && a.nodes.length === b.nodes.length && a.nodes.every((n, i) => sameNode(n, b.nodes[i])),
  ops: Object.fromEntries(Object.entries(SCENE_OPS).map(([k, v]) => [k, v])),
  readOp: () => null, // the scene reads whole descriptions (scene-intent.ts), not one operation
  consequence: (before, after, step) => {
    const notes: string[] = [];
    const id = typeof step.args.id === 'string' ? step.args.id : null;
    for (const n of after.nodes) {
      const was = before.nodes.find((b) => b.id === n.id);
      if (!was || n.id === id) continue;
      const moved = n.pos.some((v, i) => Math.abs(v - was.pos[i]) > 1e-9);
      if (moved && n.on && n.on !== 'ground') notes.push(`${n.name} moved with it (it rests on ${after.nodes.find((x) => x.id === n.on)?.name ?? n.on})`);
    }
    if (step.op === 'remove' && id) {
      const freed = before.nodes.filter((n) => n.on === id).map((n) => n.name);
      if (freed.length) notes.push(`${freed.join(', ')} stay${freed.length === 1 ? 's' : ''} where ${freed.length === 1 ? 'it was' : 'they were'}, resting on nothing`);
    }
    if (step.op === 'add') {
      const made = after.nodes.find((n) => !before.nodes.some((b) => b.id === n.id));
      if (made?.assumed?.length) notes.push(`${made.assumed.map((k) => DIMS[made.shape].find((d) => d.key === k)?.label ?? k).join(', ')} not given — defaults used`);
    }
    return notes.length ? notes.join('; ') + '.' : null;
  },
  // The parts are the state, written out (text); the facts are what is true OF it.
  facts: (s, { guarded }) => {
    const out = [`a geometric preview — shapes, sizes and positions, and mass only as density × volume; nothing in it is loaded, stressed or simulated`, `${s.nodes.length} part${s.nodes.length === 1 ? '' : 's'}; lengths shown in ${s.unit}; y is up and the floor is y = 0`];
    const b = sceneBox(s);
    if (b) out.push(`everything fits in ${lengthIn(b.max[0] - b.min[0], s.unit)} × ${lengthIn(b.max[1] - b.min[1], s.unit)} × ${lengthIn(b.max[2] - b.min[2], s.unit)}`);
    if (guarded) out.push('volumes and areas withheld while the person works them out');
    else {
      const vols = s.nodes
        .map((n) => ({ n, m: measure(n) }))
        .filter((x) => x.m.volume !== null)
        .map((x) => `${x.n.name} ${x.m.volume!.toPrecision(4)} m³${x.m.how === 'numerical' ? ' (numerical)' : ''}`);
      if (vols.length) out.push(`volumes: ${vols.join('; ')}`);
      const sm = sceneMass(s);
      if (sm) {
        out.push(
          `mass ${kgSaid(sm.kg)} over the ${sm.weighed} part${sm.weighed === 1 ? '' : 's'} with a density${sm.unweighed ? ` (${sm.unweighed} without one, not counted)` : ''}; centre of mass at (${sm.at.map((v) => lengthIn(v, s.unit).replace(/ \w+$/, '')).join(', ')}) ${s.unit}${sm.nominal ? ` — ${sm.nominal} of them on nominal densities, typical values rather than measurements` : ''}`
        );
      }
    }
    return out;
  },
  text: (s) => s.nodes.map((n) => nodeLine(s, n, true)).join('\n') || '(empty scene)',
  parts: (s) => s.nodes.map((n) => ({ id: n.id, label: n.name })),
  partFacts: (s, part) => {
    const n = byId(s, part);
    if (!n) return null;
    const m = measure(n);
    const c = centroid(n);
    return [
      nodeLine(s, n),
      ...(m.area !== null ? [`surface area ${m.area.toPrecision(4)} m²${m.how === 'numerical' ? ' (numerical)' : ''}`] : []),
      ...(m.note ? [m.note] : []),
      ...(c && n.density !== undefined ? [`its centroid is at (${toWorld(n, c).map((v) => lengthIn(v, s.unit).replace(/ \w+$/, '')).join(', ')}) ${s.unit}`] : []),
      ...shapeFacts(n, s.unit),
      ...dependents(s, n.id).map((d) => `${byId(s, d)?.name} rests on it`),
    ];
  },
  views: [
    { id: '3d', label: '3D', shows: 'the scene itself, live — orbit, select, take hold and move', primary: true, interactions: ['orbit', 'select', 'drag', 'describe'] },
    { id: 'parts', label: 'Parts', shows: 'every part with its exact size, position and what it rests on', interactions: ['select', 'edit'] },
  ],
  size: (_s, mode) => (mode === 'card' ? { w: 220, h: 120 } : mode === 'trail' ? { w: 160, h: 90 } : { w: 360, h: 240 }),
  shape: (s) => `scene · ${s.nodes.length} part${s.nodes.length === 1 ? '' : 's'}`,
  argLimits: { count: 12, length: 400 },
  // a state is the whole scene, so fewer are kept than for a matrix
  maxStates: 24,
};

register(SCENE);

export { localBox, worldBox, measure, centroid, toWorld };
