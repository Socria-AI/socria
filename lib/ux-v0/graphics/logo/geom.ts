// lib/ux-v0/graphics/logo/geom.ts — the geometry a mark is built from, on SocriaUX's own vector library
// (geometry.ts): circles, rings, sectors, rounded polygons, leaves, smooth closed forms and strokes, all as editable
// Bézier paths; booleans (union, subtract, intersect) through the same polygon clipping the editor uses; affine
// transforms; and the mark model itself. A mark is a few parts in a 1000-unit square: each part a filled path (or a
// stroked centreline), with cuts subtracted live (they stay editable, drawn as one shape in the document) and a tone
// (the primary ink, a second ink, the accent). Nothing here is a stored picture: every mark is rebuilt from its method
// and parameters, the same parameters giving the same geometry.

import { arcNodes, booleanRegions, ellipseSub, flatten, mapPath, outlineRings, pathBounds, polySub, regionPath, roundPoly, smoothThrough, type BezierPath, type BNode, type Subpath } from '../geometry';

export type P2 = [number, number];
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The side of the square a mark is drawn in. */
export const S = 1000;

export interface PartStroke {
  width: number;
  cap: 'round' | 'butt' | 'square';
  join: 'round' | 'miter';
}
export interface MarkPart {
  name: string;
  /** a filled path (even-odd: rings inside rings are holes), or the centreline of a stroke */
  path: BezierPath;
  /** paths subtracted from it, live */
  cuts?: BezierPath[];
  /** 0 the primary ink, 1 a second ink, 2 the accent */
  tone: 0 | 1 | 2;
  /** drawn as a stroke of this width (no fill) */
  stroke?: PartStroke;
  /** a detail the small version leaves out */
  detail?: boolean;
  /** ring text (an emblem's words around its edge): drawn as text on a circle in the document */
  ringText?: { text: string; cx: number; cy: number; r: number; size: number };
}
export interface Mark {
  method: string;
  parts: MarkPart[];
  /** what was done to it optically and why (centred, thickened, balanced…) */
  notes: string[];
  /** the parameters it was built from (for rebuilding and for the record) */
  params: Record<string, number | string | boolean>;
}

const TAU = Math.PI * 2;
const rad = (d: number) => (d * Math.PI) / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export const path = (...subs: Subpath[]): BezierPath => ({ subpaths: subs });
export const join = (...paths: BezierPath[]): BezierPath => ({ subpaths: paths.flatMap((p) => p.subpaths) });
export const circle = (cx: number, cy: number, r: number) => path(ellipseSub(cx, cy, r, r));
export const ellipse = (cx: number, cy: number, rx: number, ry: number) => path(ellipseSub(cx, cy, rx, ry));
/** A ring: two concentric circles (the inner a hole, even-odd). */
export const ring = (cx: number, cy: number, r: number, w: number) => path(ellipseSub(cx, cy, r, r), ellipseSub(cx, cy, Math.max(1, r - w), Math.max(1, r - w)));
export const rect = (x: number, y: number, w: number, h: number, r = 0) => {
  const pts: P2[] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  return path(r > 0.5 ? roundPoly(pts, Math.min(r, w / 2, h / 2)) : polySub(pts));
};
export const polygon = (pts: readonly P2[], r = 0) => path(r > 0.5 ? roundPoly(pts, r) : polySub(pts));
export const line = (pts: readonly P2[], closed = false) => path(polySub(pts, closed));
export const smooth = (pts: readonly P2[], closed = true, tension = 1) => path(smoothThrough(pts, closed, tension));
export const polar = (cx: number, cy: number, r: number, deg: number): P2 => [cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r];

/** An open arc (a centreline for a stroke), degrees clockwise from the right (y down). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, ry = r): BezierPath {
  return path({ closed: false, nodes: arcNodes(cx, cy, r, ry, rad(a0), rad(a1)) });
}

/** A sector (a slice) of a circle, or of a ring when inner > 0, degrees clockwise from the right. */
export function sector(cx: number, cy: number, r: number, a0: number, a1: number, inner = 0): BezierPath {
  const outer = arcNodes(cx, cy, r, r, rad(a0), rad(a1));
  if (inner > 0.5) {
    const back = arcNodes(cx, cy, inner, inner, rad(a1), rad(a0));
    return path({ closed: true, nodes: [...outer, ...back] });
  }
  return path({ closed: true, nodes: [{ x: r3(cx), y: r3(cy) }, ...outer] });
}

/** A leaf (a vesica): two arcs meeting in points, its long axis turned by `angle` degrees from upright. */
export function leaf(cx: number, cy: number, w: number, h: number, angle = 0, swell = 0.55): BezierPath {
  const k = w * swell;
  const nodes: BNode[] = [
    { x: 0, y: -h / 2, in: [-k, -h * 0.18], out: [k, -h * 0.18] },
    { x: 0, y: h / 2, in: [k, h * 0.18], out: [-k, h * 0.18] },
  ];
  return rotate(translate(path({ closed: true, nodes }), cx, cy), angle, [cx, cy]);
}

/** A smooth closed form through points around a centre, each radius moved by `wobble` (0–0.5) from seeded noise. */
export function pebble(cx: number, cy: number, rx: number, ry: number, wobble: number, n: number, next: () => number, turn = 0): BezierPath {
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * 360;
    const k = 1 + (next() * 2 - 1) * wobble;
    pts.push([cx + Math.cos(rad(a)) * rx * k, cy + Math.sin(rad(a)) * ry * k]);
  }
  return smooth(pts, true, 1);
}

/** A superellipse (a squircle) as a smooth closed path. */
export function squircleOf(cx: number, cy: number, r: number, n = 4): BezierPath {
  const pts: P2[] = [];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    pts.push([cx + Math.sign(ct) * Math.abs(ct) ** (2 / n) * r, cy + Math.sign(st) * Math.abs(st) ** (2 / n) * r]);
  }
  return smooth(pts, true, 1);
}

// ── transforms ──

export const translate = (p: BezierPath, dx: number, dy: number) => mapPath(p, (x, y) => [x + dx, y + dy]);
export const scaleAbout = (p: BezierPath, sx: number, sy: number, c: P2 = [S / 2, S / 2]) => mapPath(p, (x, y) => [c[0] + (x - c[0]) * sx, c[1] + (y - c[1]) * sy]);
export function rotate(p: BezierPath, deg: number, c: P2 = [S / 2, S / 2]): BezierPath {
  if (!deg) return p;
  const cs = Math.cos(rad(deg));
  const sn = Math.sin(rad(deg));
  return mapPath(p, (x, y) => [c[0] + (x - c[0]) * cs - (y - c[1]) * sn, c[1] + (x - c[0]) * sn + (y - c[1]) * cs]);
}
export const mirrorX = (p: BezierPath, cx = S / 2) => reverse(mapPath(p, (x, y) => [cx * 2 - x, y]));
/** A path's subpaths run the other way (after a mirror, so the winding stays as drawn). */
function reverse(p: BezierPath): BezierPath {
  return {
    subpaths: p.subpaths.map((s) => ({
      closed: s.closed,
      nodes: [...s.nodes].reverse().map((n) => {
        const o: BNode = { x: n.x, y: n.y };
        if (n.out) o.in = n.out;
        if (n.in) o.out = n.in;
        if (n.smooth) o.smooth = true;
        return o;
      }),
    })),
  };
}

// ── booleans (on the flattened geometry; they come back as paths of corner nodes) ──

const ringsOf = (p: BezierPath) => flatten(p, 2).rings;
export const union = (...ps: BezierPath[]) => regionPath(booleanRegions(ps.map(ringsOf), 'union'));
export const subtract = (a: BezierPath, ...bs: BezierPath[]) => regionPath(booleanRegions([ringsOf(a), ...bs.map(ringsOf)], 'subtract'));
export const intersect = (a: BezierPath, b: BezierPath) => regionPath(booleanRegions([ringsOf(a), ringsOf(b)], 'intersect'));
/** A stroke (an open or closed centreline) as an area, round-ended. */
export function strokeArea(p: BezierPath, width: number): BezierPath {
  const f = flatten(p, 2);
  return regionPath(outlineRings(f.rings, f.closed, width));
}
/** A half-plane through a point at an angle (degrees), as a big polygon on the side the normal points to. */
export function halfPlane(px: number, py: number, deg: number, side: 1 | -1): BezierPath {
  const d: P2 = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  const nrm: P2 = [-d[1] * side, d[0] * side];
  const far = S * 4;
  const a: P2 = [px - d[0] * far, py - d[1] * far];
  const b: P2 = [px + d[0] * far, py + d[1] * far];
  return polygon([a, b, [b[0] + nrm[0] * far, b[1] + nrm[1] * far], [a[0] + nrm[0] * far, a[1] + nrm[1] * far]]);
}
/** A bar along a line through a point (for parallel cuts), `w` wide. */
export function bar(px: number, py: number, deg: number, w: number, len = S * 2): BezierPath {
  const d: P2 = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  const n: P2 = [-d[1] * (w / 2), d[0] * (w / 2)];
  return polygon([
    [px - d[0] * len + n[0], py - d[1] * len + n[1]],
    [px + d[0] * len + n[0], py + d[1] * len + n[1]],
    [px + d[0] * len - n[0], py + d[1] * len - n[1]],
    [px - d[0] * len - n[0], py - d[1] * len - n[1]],
  ]);
}

// ── measuring ──

export function boundsOfParts(parts: readonly MarkPart[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of parts) {
    const b = pathBounds(p.path);
    const pad = p.stroke ? p.stroke.width / 2 : 0;
    if (p.ringText) {
      x0 = Math.min(x0, p.ringText.cx - p.ringText.r - p.ringText.size);
      y0 = Math.min(y0, p.ringText.cy - p.ringText.r - p.ringText.size);
      x1 = Math.max(x1, p.ringText.cx + p.ringText.r + p.ringText.size);
      y1 = Math.max(y1, p.ringText.cy + p.ringText.r + p.ringText.size);
    }
    if (!(b.w > 0 || b.h > 0)) continue;
    x0 = Math.min(x0, b.x - pad);
    y0 = Math.min(y0, b.y - pad);
    x1 = Math.max(x1, b.x + b.w + pad);
    y1 = Math.max(y1, b.y + b.h + pad);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: S, h: S };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Every number of the mark finite, every part drawable: the geometry is valid. */
export function geometryIssues(m: Mark): string[] {
  const out: string[] = [];
  if (!m.parts.length) out.push('the mark has no parts');
  m.parts.forEach((p) => {
    const all = [p.path, ...(p.cuts ?? [])].flatMap((q) => q.subpaths.flatMap((s) => s.nodes.flatMap((n) => [n.x, n.y, ...(n.in ?? []), ...(n.out ?? [])])));
    if (all.some((v) => !Number.isFinite(v))) out.push(`${p.name}: a coordinate is not a number`);
    if (!p.path.subpaths.some((s) => s.nodes.length >= 2) && !p.ringText) out.push(`${p.name}: an empty path`);
    if (!p.stroke && !p.ringText && p.path.subpaths.some((s) => !s.closed && s.nodes.length > 1)) out.push(`${p.name}: an open path is filled`);
    if (p.stroke && !(p.stroke.width > 0)) out.push(`${p.name}: a stroke with no width`);
  });
  return out;
}

/** How complex the mark is: anchors, parts, cuts and inks (a count, compared with each category's range). */
export function complexityOf(m: Mark): number {
  const nodes = m.parts.reduce(
    (s, p) =>
      s +
      p.path.subpaths.reduce((t, sp) => t + sp.nodes.length, 0) +
      (p.cuts ?? []).reduce(
        (t, c) =>
          t +
          Math.min(
            12,
            c.subpaths.reduce((u, sp) => u + sp.nodes.length, 0),
          ) /
            3,
        0,
      ),
    0,
  );
  const tones = new Set(m.parts.map((p) => p.tone)).size;
  return Math.round(nodes + m.parts.length * 3 + tones * 4 + (m.parts.some((p) => p.ringText) ? 20 : 0));
}

/** Every path of the mark moved by a map (fitting, centring): parts, cuts and ring text alike. */
export function mapMark(m: Mark, f: (x: number, y: number) => P2, scale: number): Mark {
  return {
    ...m,
    parts: m.parts.map((p) => ({
      ...p,
      path: mapPath(p.path, f),
      ...(p.cuts ? { cuts: p.cuts.map((c) => mapPath(c, f)) } : {}),
      ...(p.stroke ? { stroke: { ...p.stroke, width: r3(p.stroke.width * scale) } } : {}),
      ...(p.ringText ? { ringText: { ...p.ringText, cx: r3(f(p.ringText.cx, p.ringText.cy)[0]), cy: r3(f(p.ringText.cx, p.ringText.cy)[1]), r: r3(p.ringText.r * scale), size: r3(p.ringText.size * scale) } } : {}),
    })),
  };
}

/** The mark fitted into the square: its larger side `size` units, centred on (cx, cy). */
export function fitMark(m: Mark, size = 840, cx = S / 2, cy = S / 2): Mark {
  const b = boundsOfParts(m.parts);
  const k = size / Math.max(1, Math.max(b.w, b.h));
  const ox = cx - (b.x + b.w / 2) * k;
  const oy = cy - (b.y + b.h / 2) * k;
  return mapMark(m, (x, y) => [x * k + ox, y * k + oy], k);
}

export const tau = TAU;
