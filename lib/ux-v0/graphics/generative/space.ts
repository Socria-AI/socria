// lib/ux-v0/graphics/generative/space.ts — spatial principles, worked out for one frame from a concept's own numbers.
// A principle is a way of organising space (divide it, set it on an axis, turn it about a centre, carry it on a curve,
// band it, scatter it, press it to an edge, stack planes, frame it, grid it, balance it on a centre line), never a
// layout: where it divides, at what angle, around which point, how thick each band is all come from the concept, so
// the same principle gives a different structure each time. What comes back is the skeleton the design is built on:
// zones with a role (focal, type, details, quiet, field), and the lines, paths, centres, cells and planes it implies.

import type { CreativeConcept } from './concept';
import type { Org } from './principles';
import { area, around, bboxOf, clamp, cubic, intersect, overlaps, type Box, type P2, type Rng } from './util';

export type ZoneRole = 'focal' | 'type' | 'details' | 'quiet' | 'field';
export interface Zone {
  box: Box;
  role: ZoneRole;
  /** a fill the principle suggests for a field (a band of colour, a block), by palette role */
  fill?: 'ground' | 'accent' | 'accent2' | 'accent3' | 'ink' | 'muted';
}

export interface Skeleton {
  org: Org;
  zones: Zone[];
  /** the focal point, in the frame's coordinates */
  focus: P2;
  /** the curve or axis everything follows (a polyline) */
  path: P2[] | null;
  centre: P2 | null;
  radii: number[];
  /** an axis's angle, degrees */
  angle: number;
  /** structural lines (rules, grid lines, an axis) */
  lines: [P2, P2][];
  /** a division's fields, a grid's merged cells, a stratum's bands */
  cells: (Box & { fill?: Zone['fill'] })[];
  /** stacked planes, back to front */
  planes: { box: Box; rotation: number }[];
  /** a mass pressed to an edge (it runs off the frame) */
  mass: Box | null;
  frame: { box: Box; arch: boolean; broken: boolean; double: boolean } | null;
  /** scattered points (a constellation) */
  points: P2[];
}

export interface Frame {
  W: number;
  H: number;
  safe: Box;
  u: number;
}

const FILLS: Zone['fill'][] = ['accent', 'ink', 'accent2', 'ground', 'accent3', 'muted'];

/** Candidate boxes for words in the safe area: halves, thirds, golden bands, quadrants, corners. */
function candidates(S: Box, land: boolean): Box[] {
  const out: Box[] = [];
  const bandH = (y0: number, y1: number) => out.push({ x: S.x, y: S.y + S.h * y0, w: S.w, h: S.h * (y1 - y0) });
  const bandV = (x0: number, x1: number) => out.push({ x: S.x + S.w * x0, y: S.y, w: S.w * (x1 - x0), h: S.h });
  for (const [a, b] of [
    [0, 0.36],
    [0.64, 1],
    [0, 0.5],
    [0.5, 1],
    [0.32, 0.68],
    [0, 0.42],
    [0.58, 1],
  ])
    bandH(a, b);
  for (const [a, b] of [
    [0, 0.5],
    [0.5, 1],
    [0, 0.42],
    [0.58, 1],
    [0, 0.62],
    [0.38, 1],
  ])
    bandV(a, b);
  const qw = land ? 0.48 : 0.62;
  const qh = land ? 0.62 : 0.42;
  for (const [ax, ay] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    out.push({ x: S.x + (S.w - S.w * qw) * ax, y: S.y + (S.h - S.h * qh) * ay, w: S.w * qw, h: S.h * qh });
  return out;
}

/** The free box best for words: big, clear of what is taken, on the side that balances the focus. */
function bestFree(S: Box, taken: readonly Box[], focus: P2, land: boolean, r: Rng, prefer?: (b: Box) => number): Box {
  let best: Box = { x: S.x, y: S.y, w: S.w, h: S.h * 0.34 };
  let score = -Infinity;
  for (const b of candidates(S, land)) {
    const clash = taken.reduce((s, t) => s + area(intersect(b, t) ?? { x: 0, y: 0, w: 0, h: 0 }), 0) / Math.max(1, area(b));
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const away = Math.hypot(cx - focus[0], cy - focus[1]) / Math.hypot(S.w, S.h);
    const wide = Math.min(1, b.w / (S.w * 0.55));
    const s = area(b) / area(S) - clash * 1.6 + away * 0.5 + wide * 0.4 + (prefer ? prefer(b) : 0) + r.between(-0.06, 0.06);
    if (s > score) ((score = s), (best = b));
  }
  return best;
}

/** The details' own place: a smaller free box aligned with the type, else the type zone's foot. */
function detailsNear(S: Box, type: Box, taken: readonly Box[], u: number): Box | null {
  const below = { x: type.x, y: type.y + type.h + u * 2, w: type.w, h: S.y + S.h - (type.y + type.h + u * 2) };
  const above = { x: type.x, y: S.y, w: type.w, h: type.y - u * 2 - S.y };
  for (const b of [below, above])
    if (b.h >= u * 9 && !taken.some((t) => overlaps(t, b, -u))) return { ...b, h: Math.min(b.h, Math.max(u * 12, S.h * 0.24)), y: b === above ? Math.max(S.y, type.y - u * 2 - Math.min(b.h, Math.max(u * 12, S.h * 0.24))) : b.y };
  return null;
}

const quietOf = (S: Box, taken: readonly Box[], land: boolean): Box | null => {
  let best: Box | null = null;
  for (const b of candidates(S, land)) if (!taken.some((t) => overlaps(t, b, 0)) && (!best || area(b) > area(best))) best = b;
  return best;
};

/** A skeleton for one spatial principle (see the head of this file). */
export function skeletonFor(org: Org, c: CreativeConcept, fr: Frame, r: Rng): Skeleton {
  const { W, H, safe: S, u } = fr;
  const land = W / H > 1.25;
  const p = c.orgParams;
  const focus: P2 = [c.focal.x * W, c.focal.y * H];
  const sk: Skeleton = { org, zones: [], focus, path: null, centre: null, radii: [], angle: 0, lines: [], cells: [], planes: [], mass: null, frame: null, points: [] };
  const focalSize = Math.min(W, H) * clamp(0.38 + (1 - c.negativeSpace / 100) * 0.42, 0.3, 0.85);
  const put = (role: ZoneRole, box: Box, fill?: Zone['fill']) => sk.zones.push({ role, box, ...(fill ? { fill } : {}) });

  switch (org) {
    case 'field': {
      const fz = around(focus[0], focus[1], focalSize, focalSize);
      put('focal', fz);
      const tz = bestFree(S, [fz], focus, land, r);
      put('type', tz);
      const dz = detailsNear(S, tz, [fz], u);
      if (dz) put('details', dz);
      break;
    }
    case 'partition': {
      // a binary division of the whole frame: fields of colour edge to edge, unequal by the concept's ratio
      const leaves: Box[] = [{ x: 0, y: 0, w: W, h: H }];
      const depth = clamp(Math.round(p.depth ?? 2), 1, 3);
      let vertical = !!p.vertical;
      for (let d = 0; d < depth; d++) {
        leaves.sort((a, b) => area(b) - area(a));
        const b = leaves.shift()!;
        const ratio = d === 0 ? clamp(p.ratio ?? 0.618, 0.22, 0.78) : r.pick([0.618, 0.382, 0.5, 0.333, 0.667]);
        const v = d === 0 ? vertical : b.w > b.h * 1.1 ? true : b.h > b.w * 1.1 ? false : !vertical;
        const g = p.gutter ? u * 1.4 : 0;
        if (v) leaves.push({ x: b.x, y: b.y, w: b.w * ratio - g / 2, h: b.h }, { x: b.x + b.w * ratio + g / 2, y: b.y, w: b.w * (1 - ratio) - g / 2, h: b.h });
        else leaves.push({ x: b.x, y: b.y, w: b.w, h: b.h * ratio - g / 2 }, { x: b.x, y: b.y + b.h * ratio + g / 2, w: b.w, h: b.h * (1 - ratio) - g / 2 });
        vertical = !v;
      }
      leaves.sort((a, b) => area(b) - area(a));
      // words in the largest field (type-led) or the second; the focus in the other; the rest are fields of colour
      const typeFirst = c.emphasis === 'type' || c.type === 'monumental' || c.type === 'column';
      const [big, second, ...rest] = leaves;
      let typeLeaf = typeFirst ? big : (second ?? big);
      let focalLeaf = typeFirst ? (second ?? big) : big;
      const fa = c.constraints.focal;
      const holding = fa ? leaves.find((b) => fa.x * W >= b.x && fa.x * W <= b.x + b.w && fa.y * H >= b.y && fa.y * H <= b.y + b.h) : undefined;
      if (holding && holding !== focalLeaf) {
        if (holding === typeLeaf) typeLeaf = focalLeaf;
        focalLeaf = holding;
      }
      const textBox = (b: Box) => intersect({ x: b.x + u * 2, y: b.y + u * 2, w: b.w - u * 4, h: b.h - u * 4 }, S) ?? S;
      put('type', textBox(typeLeaf));
      put('focal', focalLeaf);
      leaves.forEach((b, i) => sk.cells.push({ ...b, fill: FILLS[(i + Math.floor(r() * 3)) % FILLS.length] }));
      const small = rest.sort((a, b) => area(a) - area(b))[0];
      if (small && area(small) > area(S) * 0.05) put('details', textBox(small));
      for (const b of leaves) {
        if (b.x > 1)
          sk.lines.push([
            [b.x, b.y],
            [b.x, b.y + b.h],
          ]);
        if (b.y > 1)
          sk.lines.push([
            [b.x, b.y],
            [b.x + b.w, b.y],
          ]);
      }
      break;
    }
    case 'axis': {
      const a = p.angle ?? 30;
      sk.angle = a;
      const rad = (a * Math.PI) / 180;
      const dir: P2 = [Math.cos(rad), Math.sin(rad)];
      const off = (p.offset ?? 0) * Math.min(W, H);
      const o: P2 = [focus[0] - dir[1] * off, focus[1] + dir[0] * off];
      const L = Math.hypot(W, H);
      sk.path = [
        [o[0] - dir[0] * L, o[1] - dir[1] * L],
        [o[0] + dir[0] * L, o[1] + dir[1] * L],
      ];
      sk.lines.push([sk.path[0], sk.path[1]]);
      const band = Math.min(W, H) * 0.26;
      put('focal', around(o[0], o[1], band * 1.6, band * 1.6));
      // the words on one side of the axis (or on it, for a type turned onto it: typeset.ts reads the path)
      const side = (b: Box) => {
        const cx = b.x + b.w / 2 - o[0];
        const cy = b.y + b.h / 2 - o[1];
        return Math.abs(cx * -dir[1] + cy * dir[0]);
      };
      const tz = bestFree(S, [around(o[0], o[1], band, band)], focus, land, r, (b) => Math.min(0.6, side(b) / Math.min(W, H)));
      put('type', tz);
      const dz = detailsNear(S, tz, [around(o[0], o[1], band, band)], u);
      if (dz) put('details', dz);
      break;
    }
    case 'orbit': {
      const C: P2 = c.constraints.focal ? [c.constraints.focal.x * W, c.constraints.focal.y * H] : [(p.cx ?? 0.5) * W, (p.cy ?? 0.5) * H];
      sk.centre = C;
      const n = clamp(Math.round(p.rings ?? 5), 2, 10);
      const g = clamp(p.growth ?? 1.3, 1.05, 1.7);
      const outside = C[0] < 0 || C[0] > W || C[1] < 0 || C[1] > H;
      let r0 = Math.min(W, H) * (outside ? 0.22 : 0.07);
      for (let i = 0; i < n; i++) ((sk.radii[i] = r0), (r0 *= g));
      const R = sk.radii[sk.radii.length - 1];
      const fz = intersect(around(C[0], C[1], R * 2, R * 2 * (p.tilt ?? 1)), { x: 0, y: 0, w: W, h: H }) ?? around(focus[0], focus[1], focalSize);
      sk.focus = [clamp(C[0], fz.x + fz.w * 0.2, fz.x + fz.w * 0.8), clamp(C[1], fz.y + fz.h * 0.2, fz.y + fz.h * 0.8)];
      put('focal', fz);
      const inner = around(C[0], C[1], sk.radii[Math.min(2, n - 1)] * 2);
      const tz = bestFree(S, [inner], C, land, r, (b) => Math.min(0.5, Math.hypot(b.x + b.w / 2 - C[0], b.y + b.h / 2 - C[1]) / Math.hypot(W, H)));
      put('type', tz);
      const dz = detailsNear(S, tz, [inner], u);
      if (dz) put('details', dz);
      break;
    }
    case 'flow': {
      // a curve from one edge to another (never the same point), its bends from the concept
      const edgePoint = (e: number, t: number): P2 => (e === 0 ? [-W * 0.05, H * t] : e === 1 ? [W * t, -H * 0.05] : e === 2 ? [W * 1.05, H * t] : [W * t, H * 1.05]);
      let from = Math.round(p.from ?? 0) % 4;
      let to = Math.round(p.to ?? 2) % 4;
      if (to === from) to = (from + 2) % 4;
      if (land && (from === 1 || from === 3) && (to === 1 || to === 3) && r.chance(0.6)) ((from = 0), (to = 2));
      const p0 = edgePoint(from, r.between(0.15, 0.85));
      const p3 = edgePoint(to, r.between(0.15, 0.85));
      const mid: P2 = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2];
      const nx = -(p3[1] - p0[1]);
      const ny = p3[0] - p0[0];
      const nl = Math.hypot(nx, ny) || 1;
      const b1 = (p.bend ?? 0.5) * 0.55;
      const b2 = (p.bend2 ?? -0.3) * 0.55;
      const p1: P2 = [lerpP(p0, mid, 0.66)[0] + (nx / nl) * b1 * Math.min(W, H), lerpP(p0, mid, 0.66)[1] + (ny / nl) * b1 * Math.min(W, H)];
      const p2: P2 = [lerpP(mid, p3, 0.34)[0] + (nx / nl) * b2 * Math.min(W, H), lerpP(mid, p3, 0.34)[1] + (ny / nl) * b2 * Math.min(W, H)];
      sk.path = cubic(p0, p1, p2, p3, 64);
      const midPts = sk.path.slice(20, 44);
      const fz = bboxOf(midPts, Math.min(W, H) * 0.1);
      sk.focus = midPts[Math.floor(midPts.length / 2)];
      put('focal', fz);
      const corridor = sk.path.map((q) => around(q[0], q[1], Math.min(W, H) * 0.14));
      const tz = bestFree(S, corridor, sk.focus, land, r);
      put('type', tz);
      const dz = detailsNear(S, tz, corridor, u);
      if (dz) put('details', dz);
      break;
    }
    case 'strata': {
      const n = clamp(Math.round(p.bands ?? 5), 3, 8);
      const rh = Math.round(p.rhythm ?? 1);
      const ws = Array.from({ length: n }, (_, i) => (rh === 0 ? 1 + r.between(-0.1, 0.1) : rh === 1 ? (i % 2 ? 0.45 : 1.6) : rh === 2 ? n - i + 0.5 : r.between(0.3, 2)));
      const vert = !!p.vertical;
      const total = ws.reduce((s, v) => s + v, 0);
      let at = 0;
      const bands: Box[] = ws.map((w) => {
        const len = ((vert ? W : H) * w) / total;
        const b = vert ? { x: at, y: 0, w: len, h: H } : { x: 0, y: at, w: W, h: len };
        at += len;
        return b;
      });
      const order = bands.map((b, i) => ({ b, i })).sort((a, b) => area(b.b) - area(a.b));
      const fa = c.constraints.focal;
      const holding = fa ? bands.find((b) => fa.x * W >= b.x && fa.x * W <= b.x + b.w && fa.y * H >= b.y && fa.y * H <= b.y + b.h) : undefined;
      const fb = holding ?? order[1].b;
      const tb = order.find((o) => o.b !== fb)!.b;
      const textBox = (b: Box) => intersect({ x: b.x + u * 1.5, y: b.y + u * 1.5, w: b.w - u * 3, h: b.h - u * 3 }, S) ?? S;
      put('type', textBox(tb));
      put('focal', fb);
      bands.forEach((b, i) => sk.cells.push({ ...b, fill: FILLS[(i + Math.floor(r() * 4)) % FILLS.length] }));
      const db = order
        .slice(2)
        .map((o) => o.b)
        .find((b) => (vert ? b.w : b.h) >= u * 9);
      if (db) put('details', textBox(db));
      for (const b of bands.slice(1))
        sk.lines.push(
          vert
            ? [
                [b.x, 0],
                [b.x, H],
              ]
            : [
                [0, b.y],
                [W, b.y],
              ],
        );
      break;
    }
    case 'constellation': {
      const n = clamp(Math.round(p.count ?? 24), 8, 70);
      const ga = ((p.gradient ?? 0) * Math.PI) / 180;
      const gx = Math.cos(ga);
      const gy = Math.sin(ga);
      const minD = Math.sqrt((W * H) / n) * 0.55;
      for (let tries = 0; sk.points.length < n && tries < n * 30; tries++) {
        const q: P2 = [r.between(-0.02, 1.02) * W, r.between(-0.02, 1.02) * H];
        const t = ((q[0] / W - 0.5) * gx + (q[1] / H - 0.5) * gy + 0.7) / 1.4;
        if (r() > clamp(t, 0.04, 1) * (p.spread ?? 0.8) + 0.08) continue;
        if (sk.points.some((s) => Math.hypot(s[0] - q[0], s[1] - q[1]) < minD)) continue;
        sk.points.push(q);
      }
      const dense = sk.points.length ? bboxOf(sk.points) : around(focus[0], focus[1], focalSize);
      const dc: P2 = [W * 0.5 + gx * W * 0.25, H * 0.5 + gy * H * 0.25];
      sk.focus = dc;
      put('focal', intersect(dense, { x: 0, y: 0, w: W, h: H }) ?? dense);
      const tz = bestFree(
        S,
        sk.points.map((q) => around(q[0], q[1], minD * 0.8)),
        dc,
        land,
        r,
        (b) => -((b.x + b.w / 2 - W / 2) * gx + (b.y + b.h / 2 - H / 2) * gy) / Math.max(W, H),
      );
      put('type', tz);
      const dz = detailsNear(S, tz, [], u);
      if (dz) put('details', dz);
      break;
    }
    case 'edge': {
      const sides = ['l', 't', 'r', 'b', 'tl', 'tr', 'bl', 'br'] as const;
      // a focus asked for in words picks the edge or corner nearest it
      const asked = c.constraints.focal;
      const near = asked
        ? ((fx: number, fy: number) =>
            Math.abs(fx - 0.5) > 0.15 && Math.abs(fy - 0.5) > 0.15 ? (`${fy < 0.5 ? 't' : 'b'}${fx < 0.5 ? 'l' : 'r'}` as (typeof sides)[number]) : Math.abs(fx - 0.5) >= Math.abs(fy - 0.5) ? (fx < 0.5 ? 'l' : 'r') : fy < 0.5 ? 't' : 'b')(
            asked.x,
            asked.y,
          )
        : null;
      const side = near ?? sides[clamp(Math.round(p.side ?? 0), 0, 7)];
      const ext = clamp(p.extent ?? 0.6, 0.35, 0.95);
      const along = clamp(p.along ?? 0.5, 0.1, 0.9);
      const D = Math.min(W, H) * ext * 1.25;
      const mass: Box =
        side === 'l'
          ? { x: -D * 0.45, y: H * along - D / 2, w: D, h: D }
          : side === 'r'
            ? { x: W - D * 0.55, y: H * along - D / 2, w: D, h: D }
            : side === 't'
              ? { x: W * along - D / 2, y: -D * 0.45, w: D, h: D }
              : side === 'b'
                ? { x: W * along - D / 2, y: H - D * 0.55, w: D, h: D }
                : { x: side.includes('l') ? -D * 0.4 : W - D * 0.6, y: side.includes('t') ? -D * 0.4 : H - D * 0.6, w: D, h: D };
      sk.mass = mass;
      const vis = intersect(mass, { x: 0, y: 0, w: W, h: H }) ?? mass;
      sk.focus = [vis.x + vis.w / 2, vis.y + vis.h / 2];
      put('focal', vis);
      const tz = bestFree(S, [vis], sk.focus, land, r);
      put('type', tz);
      const dz = detailsNear(S, tz, [vis], u);
      if (dz) put('details', dz);
      break;
    }
    case 'layers': {
      const n = clamp(Math.round(p.planes ?? 3), 2, 4);
      const spread = p.spread ?? 6;
      const off = (p.offset ?? 0.06) * Math.min(W, H);
      const pw = W * r.between(0.58, 0.78);
      const ph = H * r.between(0.42, 0.62);
      const dx = (focus[0] > W / 2 ? -1 : 1) * off;
      const dy = (focus[1] > H / 2 ? -1 : 1) * off;
      const start: P2 = [clamp(focus[0] - pw / 2 - dx * (n - 1) * 0.5, -pw * 0.15, W - pw * 0.85), clamp(focus[1] - ph / 2 - dy * (n - 1) * 0.5, -ph * 0.1, H - ph * 0.9)];
      for (let i = 0; i < n; i++) sk.planes.push({ box: { x: start[0] + dx * i, y: start[1] + dy * i, w: pw, h: ph }, rotation: (i - (n - 1) / 2) * spread * (r.chance(0.5) ? 1 : -1) });
      const top = sk.planes[sk.planes.length - 1].box;
      put('focal', sk.planes[Math.floor(n / 2)].box);
      put('type', intersect({ x: top.x + u * 4, y: top.y + u * 4, w: top.w - u * 8, h: top.h - u * 8 }, S) ?? S);
      const dz =
        detailsNear(S, intersect(top, S) ?? S, [], u) ??
        bestFree(
          S,
          sk.planes.map((q) => q.box),
          focus,
          land,
          r,
        );
      put('details', dz);
      break;
    }
    case 'frame': {
      const ins = clamp(p.inset ?? 0.08, 0.03, 0.16) * Math.min(W, H);
      const fb: Box = { x: S.x + ins * 0.4, y: S.y + ins * 0.4, w: S.w - ins * 0.8, h: S.h - ins * 0.8 };
      sk.frame = { box: fb, arch: !!p.arch, broken: !!p.broken, double: !!p.double };
      const inner: Box = { x: fb.x + ins, y: fb.y + ins + (p.arch ? fb.w * 0.25 : 0), w: fb.w - ins * 2, h: fb.h - ins * 2 - (p.arch ? fb.w * 0.25 : 0) };
      const [top, bottom] = land
        ? [
            { ...inner, w: inner.w * 0.55 },
            { ...inner, x: inner.x + inner.w * 0.6, w: inner.w * 0.4 },
          ]
        : [
            { ...inner, h: inner.h * 0.5 },
            { ...inner, y: inner.y + inner.h * 0.55, h: inner.h * 0.45 },
          ];
      const focalTop = focus[1] < H / 2;
      put('focal', focalTop ? top : bottom);
      put('type', focalTop ? bottom : top);
      sk.focus = [inner.x + inner.w / 2, (focalTop ? top : bottom).y + (focalTop ? top : bottom).h / 2];
      break;
    }
    case 'grid': {
      const cols = clamp(Math.round(p.cols ?? 4), 2, 7);
      const rows = clamp(Math.round(p.rows ?? 6), 2, 9);
      const g = u * 1.2;
      const cw = (S.w - g * (cols - 1)) / cols;
      const ch = (S.h - g * (rows - 1)) / rows;
      const used = new Set<string>();
      const blocks: Box[] = [];
      const cell = (i: number, j: number, a = 1, b = 1): Box => ({ x: S.x + i * (cw + g), y: S.y + j * (ch + g), w: cw * a + g * (a - 1), h: ch * b + g * (b - 1) });
      // merged blocks: the type's (wide), the focus's (squarish), then a few more
      const tryBlock = (a: number, b: number): Box | null => {
        for (let t = 0; t < 40; t++) {
          const i = r.int(0, cols - a);
          const j = r.int(0, rows - b);
          let free = true;
          for (let x = i; x < i + a && free; x++) for (let y = j; y < j + b && free; y++) if (used.has(`${x},${y}`)) free = false;
          if (!free) continue;
          for (let x = i; x < i + a; x++) for (let y = j; y < j + b; y++) used.add(`${x},${y}`);
          return cell(i, j, a, b);
        }
        return null;
      };
      const tb = tryBlock(Math.max(2, Math.ceil(cols * r.between(0.6, 1))), Math.max(1, Math.round(rows * r.between(0.2, 0.34))));
      const fb = tryBlock(Math.max(1, Math.round(cols * r.between(0.4, 0.7))), Math.max(2, Math.round(rows * r.between(0.3, 0.5))));
      if (tb) put('type', tb);
      if (fb) put('focal', fb);
      for (let k2 = 0; k2 < clamp(Math.round(p.merges ?? 2), 0, 5); k2++) {
        const b = tryBlock(r.int(1, 2), r.int(1, 2));
        if (b) blocks.push(b);
      }
      const db = tryBlock(Math.max(1, Math.round(cols * 0.5)), 1);
      if (db) put('details', db);
      blocks.forEach((b, i) => sk.cells.push({ ...b, fill: FILLS[(i + 1) % FILLS.length] }));
      for (let i = 1; i < cols; i++)
        sk.lines.push([
          [S.x + i * (cw + g) - g / 2, S.y],
          [S.x + i * (cw + g) - g / 2, S.y + S.h],
        ]);
      if (!tb) put('type', bestFree(S, fb ? [fb] : [], focus, land, r));
      if (!fb) put('focal', around(focus[0], focus[1], focalSize));
      break;
    }
    case 'centre': {
      const fy = clamp(focus[1] + (p.drop ?? 0) * H, H * 0.25, H * 0.7);
      const fz = around(W / 2, fy, focalSize * 0.9, focalSize * 0.9);
      sk.focus = [W / 2, fy];
      put('focal', fz);
      const above = fy > H / 2;
      const tz: Box = above ? { x: S.x, y: S.y, w: S.w, h: Math.max(u * 12, fz.y - u * 3 - S.y) } : { x: S.x, y: fz.y + fz.h + u * 3, w: S.w, h: Math.max(u * 12, S.y + S.h - (fz.y + fz.h + u * 3)) };
      put('type', tz);
      sk.lines.push([
        [W / 2, S.y],
        [W / 2, S.y + S.h],
      ]);
      break;
    }
  }
  if (!sk.zones.some((z) => z.role === 'quiet')) {
    const q = quietOf(
      S,
      sk.zones.map((z) => z.box),
      land,
    );
    if (q) put('quiet', q);
  }
  return sk;
}

const lerpP = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const zone = (sk: Skeleton, role: ZoneRole) => sk.zones.find((z) => z.role === role)?.box ?? null;
