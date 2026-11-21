// lib/ux-v0/graphics/generative/motifs.ts — visual material drawn procedurally, as native vector instructions. A motif
// is a way of making marks (a waveform, a branching growth, shards of a cut form, rings about a centre, a field of
// pixels…) whose every number comes from the concept and the skeleton: the waveform's frequencies from the title's own
// letters, the rings about the skeleton's centre, the ribbon along its curve, the shards inside its focal zone. No
// motif is a picture or a stored shape: each is generated for this frame and stays editable as paths and shapes.

import type { MotifKind } from './lexicon';
import type { ColourRef, Instruction, PaintRef, StrokeRef } from './program';
import type { Skeleton } from './space';
import { along, around, bboxOf, clamp, cubic, dist, noise1, offsetLine, polySegs, ribbonOutline, segsToD, smoothSegs, type Box, type P2, type Rng } from './util';

export interface MotifCtx {
  W: number;
  H: number;
  u: number;
  sk: Skeleton;
  sk2: Skeleton | null;
  /** where the motif lives (the focal zone, or the frame) */
  zone: Box;
  r: Rng;
  /** 0–1: how much of it (an accent beside a picture, or the whole idea) */
  presence: number;
  weight: number;
  count: number;
  /** figure paints in order (palette roles) */
  paints: ColourRef[];
  /** the colour of drawn lines */
  line: ColourRef;
  /** the title (a signal's frequencies come from its letters) */
  text: string;
  /** the language's own primitives */
  styleMotifs: { kind: string; params: Record<string, number> }[];
  curvature: number;
  rigidity: number;
  angularity: number;
}

const P = (d: string, fill: PaintRef | null, stroke?: StrokeRef, extra: Record<string, unknown> = {}): Instruction => ({ op: 'path', d, fill, ...(stroke ? { stroke } : {}), ...extra }) as Instruction;
const E = (b: Box, fill: PaintRef | null, stroke?: StrokeRef, extra: Record<string, unknown> = {}): Instruction => ({ op: 'ellipse', box: b, fill, ...(stroke ? { stroke } : {}), ...extra }) as Instruction;
const R = (b: Box, fill: PaintRef | null, extra: Record<string, unknown> = {}): Instruction => ({ op: 'rect', box: b, fill, ...extra }) as Instruction;
const L = (a: P2, b: P2, color: ColourRef, width: number, extra: Record<string, unknown> = {}): Instruction => ({ op: 'line', from: a, to: b, color, width, ...extra }) as Instruction;
const paint = (m: MotifCtx, i: number) => m.paints[i % m.paints.length];
const stroke = (m: MotifCtx, k = 1, color?: ColourRef): StrokeRef => ({ color: color ?? m.line, width: Math.max(0.6, m.u * 0.55 * m.weight * k), cap: 'round' });

/** A signal from the words: frequencies and phases from their letters, so each title draws its own wave. */
function signal(text: string) {
  const codes = [...(text || 'signal')].map((ch) => ch.charCodeAt(0));
  const f = [1 + (codes[0] % 5), 2 + ((codes[1] ?? 7) % 7), 5 + ((codes[2] ?? 11) % 9)];
  const ph = [codes.length % 7, (codes[codes.length - 1] ?? 3) % 11, ((codes[3] ?? 5) * 13) % 17].map((v) => v * 0.9);
  return (t: number) => (Math.sin(t * Math.PI * 2 * f[0] + ph[0]) + Math.sin(t * Math.PI * 2 * f[1] + ph[1]) * 0.5 + Math.sin(t * Math.PI * 2 * f[2] + ph[2]) * 0.22) / 1.72;
}

/** The line a linear motif runs along: the skeleton's own curve or axis, else one across its zone. */
function spine(m: MotifCtx): P2[] {
  const sp = m.sk.path ?? m.sk2?.path;
  if (sp && sp.length >= 2) {
    // an axis is a long straight line: sample it inside the frame
    if (sp.length === 2) {
      const out: P2[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const q: P2 = [sp[0][0] + (sp[1][0] - sp[0][0]) * t, sp[0][1] + (sp[1][1] - sp[0][1]) * t];
        if (q[0] >= -m.W * 0.1 && q[0] <= m.W * 1.1 && q[1] >= -m.H * 0.1 && q[1] <= m.H * 1.1) out.push(q);
      }
      if (out.length >= 2) return out;
    } else return sp;
  }
  const z = m.zone;
  const y = z.y + z.h * m.r.between(0.35, 0.65);
  const x0 = m.r.chance(0.5) ? -m.W * 0.04 : z.x;
  const x1 = m.r.chance(0.5) ? m.W * 1.04 : z.x + z.w;
  return cubic([x0, y], [x0 + (x1 - x0) * 0.33, y + z.h * m.r.between(-0.3, 0.3)], [x0 + (x1 - x0) * 0.66, y + z.h * m.r.between(-0.3, 0.3)], [x1, y], 64);
}
const centreOf = (m: MotifCtx): P2 => m.sk.centre ?? m.sk2?.centre ?? [m.zone.x + m.zone.w / 2, m.zone.y + m.zone.h / 2];

/** Split a convex polygon by a line through p with direction a (radians): the two pieces. */
function split(poly: P2[], p: P2, a: number): [P2[], P2[]] {
  const n: P2 = [-Math.sin(a), Math.cos(a)];
  const side = (q: P2) => (q[0] - p[0]) * n[0] + (q[1] - p[1]) * n[1];
  const A: P2[] = [];
  const B: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i];
    const d = poly[(i + 1) % poly.length];
    const sc = side(c);
    const sd = side(d);
    (sc >= 0 ? A : B).push(c);
    if (sc >= 0 !== sd >= 0) {
      const t = sc / (sc - sd);
      const q: P2 = [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t];
      A.push(q);
      B.push(q);
    }
  }
  return [A, B];
}

const closedBlob = (c: P2, rx: number, ry: number, seed: number, wobble: number, n = 14): P2[] => {
  const nz = noise1(seed);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + nz(i * 0.9) * wobble;
    return [c[0] + Math.cos(a) * rx * k, c[1] + Math.sin(a) * ry * k] as P2;
  });
};

const STAR = (c: P2, r0: number, r1: number, points: number, turn = 0): P2[] =>
  Array.from({ length: points * 2 }, (_, i) => {
    const a = (i / (points * 2)) * Math.PI * 2 + turn;
    const rr = i % 2 ? r1 : r0;
    return [c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr] as P2;
  });

/** The motif drawn (see the head of this file). */
export function drawMotif(kind: MotifKind, m: MotifCtx): Instruction[] {
  const { u, r, zone: z } = m;
  const out: Instruction[] = [];
  const pres = clamp(m.presence, 0.15, 1);
  switch (kind) {
    case 'wave': {
      const base = spine(m);
      const sig = signal(m.text);
      const lines = clamp(1 + (m.count % 4) + (pres > 0.7 ? 1 : 0), 1, 5);
      const amp = Math.min(m.W, m.H) * r.between(0.035, 0.09) * (0.6 + pres * 0.6);
      for (let k = 0; k < lines; k++) {
        const shift = (k - (lines - 1) / 2) * u * r.between(2.2, 4.5);
        const pts = base.map((q, i) => {
          const t = i / (base.length - 1);
          const a = along(base, t);
          const v = sig(t + k * 0.07) * amp * (0.6 + 0.4 * Math.sin(Math.PI * t));
          return [q[0] - a.tan[1] * (v + shift), q[1] + a.tan[0] * (v + shift)] as P2;
        });
        out.push(P(segsToD(smoothSegs(pts)), null, stroke(m, k === 0 ? 2.2 : 1, k === 0 ? paint(m, 0) : m.line), { name: k === 0 ? 'Signal' : 'Signal echo', ...(k ? { opacity: clamp(1 - k * 0.18, 0.35, 1) } : {}) }));
      }
      break;
    }
    case 'pulse': {
      const base = spine(m);
      const sig = signal(m.text);
      const amp = Math.min(m.W, m.H) * 0.12 * (0.5 + pres * 0.5);
      const pts: P2[] = [];
      const beats = clamp(m.count, 3, 8);
      for (let i = 0; i < base.length; i++) {
        const t = i / (base.length - 1);
        const a = along(base, t);
        const inBeat = Math.abs(((t * beats) % 1) - 0.5) < 0.06;
        const v = inBeat ? sig(t) * amp * 2.2 : 0;
        pts.push([a.p[0] - a.tan[1] * v, a.p[1] + a.tan[0] * v]);
      }
      out.push(P(segsToD(polySegs(pts)), null, { ...stroke(m, 2), color: paint(m, 0), cap: 'square' }, { name: 'Pulse' }));
      break;
    }
    case 'bars': {
      const n = clamp(Math.round(10 + pres * 26 + (m.count % 5)), 8, 40);
      const sig = signal(m.text);
      const C = m.sk.centre;
      if (C && m.r.chance(0.6)) {
        const r0 = Math.min(m.W, m.H) * 0.12;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const len = r0 * (0.6 + Math.abs(sig(i / n)) * 2.2);
          const w = ((Math.PI * 2 * r0) / n) * 0.55;
          const p0: P2 = [C[0] + Math.cos(a) * r0, C[1] + Math.sin(a) * r0];
          const p1: P2 = [C[0] + Math.cos(a) * (r0 + len), C[1] + Math.sin(a) * (r0 + len)];
          const nx = -Math.sin(a) * (w / 2);
          const ny = Math.cos(a) * (w / 2);
          out.push(
            P(
              segsToD(
                polySegs(
                  [
                    [p0[0] + nx, p0[1] + ny],
                    [p1[0] + nx, p1[1] + ny],
                    [p1[0] - nx, p1[1] - ny],
                    [p0[0] - nx, p0[1] - ny],
                  ],
                  true,
                ),
              ),
              paint(m, i % 3 === 0 ? 1 : 0),
              undefined,
              { name: 'Bar' },
            ),
          );
        }
      } else {
        const gap = (z.w / n) * 0.28;
        const bw = z.w / n - gap;
        const baseY = z.y + z.h;
        for (let i = 0; i < n; i++) {
          const h = z.h * clamp(0.12 + Math.abs(sig(i / n)) * 0.88, 0.08, 1);
          out.push(R({ x: z.x + i * (bw + gap), y: baseY - h, w: bw, h }, paint(m, i % 5 === 2 ? 1 : 0), { name: 'Bar' }));
        }
      }
      break;
    }
    case 'rings':
    case 'ripple': {
      const C = centreOf(m);
      const radii = m.sk.radii.length ? m.sk.radii : Array.from({ length: clamp(m.count + 2, 4, 10) }, (_, i) => Math.min(m.W, m.H) * (0.05 + i * r.between(0.035, 0.06)));
      const filled = kind === 'rings' && r.chance(0.4);
      const seed = r.int(1, 9999);
      [...radii].reverse().forEach((rad0, i) => {
        if (kind === 'ripple') {
          const pts = closedBlob(C, rad0, rad0 * (m.sk.radii.length ? 1 : r.between(0.85, 1)), seed + i, 0.06 + i * 0.008, 28);
          out.push(P(segsToD(smoothSegs(pts, true)), null, stroke(m, 1 + (i === radii.length - 1 ? 1 : 0)), { name: 'Ripple' }));
        } else if (filled) out.push(E(around(C[0], C[1], rad0 * 2), paint(m, i), undefined, { name: 'Ring' }));
        else out.push(E(around(C[0], C[1], rad0 * 2), null, stroke(m, i === 0 ? 2.4 : 1.1, i % 3 === 1 ? paint(m, 0) : m.line), { name: 'Ring' }));
      });
      break;
    }
    case 'orbits': {
      const C = centreOf(m);
      const n = clamp(m.count, 3, 7);
      const tilt = r.between(-35, 35);
      for (let i = 0; i < n; i++) {
        const rx = Math.min(m.W, m.H) * (0.12 + i * 0.07) * (0.7 + pres * 0.5);
        const ry = rx * r.between(0.3, 0.55);
        out.push(E(around(C[0], C[1], rx * 2, ry * 2), null, stroke(m, 0.9), { rotation: tilt, name: 'Orbit' }));
        const a = r.between(0, Math.PI * 2);
        const pt: P2 = [C[0] + Math.cos(a) * rx, C[1] + Math.sin(a) * ry];
        const rot = (q: P2): P2 => {
          const t = (tilt * Math.PI) / 180;
          const dx = q[0] - C[0];
          const dy = q[1] - C[1];
          return [C[0] + dx * Math.cos(t) - dy * Math.sin(t), C[1] + dx * Math.sin(t) + dy * Math.cos(t)];
        };
        const b = rot(pt);
        out.push(E(around(b[0], b[1], u * r.between(2, 5)), paint(m, i), undefined, { name: 'Body' }));
      }
      out.push(E(around(C[0], C[1], Math.min(m.W, m.H) * 0.1 * (0.6 + pres)), paint(m, 1), undefined, { name: 'Nucleus' }));
      break;
    }
    case 'spiral': {
      const C = centreOf(m);
      const turns = r.between(2.5, 5.5);
      const R0 = Math.min(m.W, m.H) * (0.25 + pres * 0.3);
      const pts: P2[] = [];
      const dir = r.chance(0.5) ? 1 : -1;
      for (let i = 0; i <= 220; i++) {
        const t = i / 220;
        const a = t * turns * Math.PI * 2 * dir;
        const rr = R0 * t;
        pts.push([C[0] + Math.cos(a) * rr, C[1] + Math.sin(a) * rr]);
      }
      out.push(P(segsToD(smoothSegs(pts.filter((_, i) => i % 2 === 0))), null, stroke(m, 2, paint(m, 0)), { name: 'Spiral' }));
      break;
    }
    case 'branch': {
      // growth from an edge toward the focus, each fork a little narrower
      const target = m.sk.focus;
      const fromEdge: P2 = target[0] > m.W / 2 ? [-m.W * 0.02, m.H * r.between(0.5, 1)] : [m.W * 1.02, m.H * r.between(0.5, 1)];
      const segs: P2[][] = [];
      const grow = (p: P2, a: number, len: number, depth: number) => {
        if (depth <= 0 || len < u * 2 || segs.length > 90) return;
        const q: P2 = [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len];
        segs.push([p, q]);
        const spread = 0.35 + m.curvature / 300;
        grow(q, a - spread * r.between(0.6, 1.2), len * r.between(0.62, 0.8), depth - 1);
        if (r.chance(0.75)) grow(q, a + spread * r.between(0.6, 1.2), len * r.between(0.55, 0.75), depth - 1);
      };
      grow(fromEdge, Math.atan2(target[1] - fromEdge[1], target[0] - fromEdge[0]), dist(fromEdge, target) * 0.34, clamp(4 + Math.round(pres * 3), 4, 7));
      out.push(P(segs.map((s) => `M${s[0][0].toFixed(1)} ${s[0][1].toFixed(1)} L${s[1][0].toFixed(1)} ${s[1][1].toFixed(1)}`).join(' '), null, stroke(m, 1.4, paint(m, 0)), { name: 'Growth' }));
      for (const s of segs.filter((_, i) => i % 3 === 2).slice(0, 18)) out.push(E(around(s[1][0], s[1][1], u * r.between(1.2, 2.6)), paint(m, 1), undefined, { name: 'Bud' }));
      break;
    }
    case 'contours': {
      const C = centreOf(m);
      const n = clamp(m.count + 3, 5, 12);
      const seed = r.int(1, 9999);
      const R0 = Math.min(m.W, m.H) * (0.2 + pres * 0.35);
      for (let i = n; i >= 1; i--) {
        const pts = closedBlob(C, (R0 * i) / n, ((R0 * i) / n) * r.between(0.75, 1.05), seed + i * 3, 0.16 + (i / n) * 0.1, 24);
        out.push(P(segsToD(smoothSegs(pts, true)), null, stroke(m, i === n ? 1.6 : 0.9, i % 4 === 0 ? paint(m, 0) : m.line), { name: 'Contour' }));
      }
      break;
    }
    case 'circuit': {
      const g = u * r.between(3.2, 6);
      const traces = clamp(Math.round(4 + pres * 8 + (m.count % 3)), 4, 14);
      for (let t = 0; t < traces; t++) {
        const fromLeft = r.chance(0.5);
        let p: P2 = [fromLeft ? z.x - g : z.x + z.w + g, z.y + Math.round(r.between(0.05, 0.95) * (z.h / g)) * g];
        const pts: P2[] = [p];
        let horizontal = true;
        for (let s = 0; s < r.int(3, 6); s++) {
          const len = g * r.int(2, 7);
          p = horizontal ? [p[0] + (fromLeft ? 1 : -1) * len, p[1]] : [p[0], clamp(p[1] + (r.chance(0.5) ? 1 : -1) * len, z.y, z.y + z.h)];
          pts.push(p);
          horizontal = !horizontal;
        }
        out.push(P(segsToD(polySegs(pts)), null, { ...stroke(m, 1.1, t % 4 === 0 ? paint(m, 0) : m.line), cap: 'square' }, { name: 'Trace' }));
        out.push(E(around(p[0], p[1], u * 1.8), paint(m, t % 3 === 0 ? 1 : 0), undefined, { name: 'Pad' }));
      }
      break;
    }
    case 'network': {
      const n = clamp(Math.round(7 + pres * 14), 6, 22);
      const pts: P2[] = [];
      for (let i = 0; i < n * 20 && pts.length < n; i++) {
        const q: P2 = [z.x + r() * z.w, z.y + r() * z.h];
        if (pts.every((s) => dist(s, q) > (Math.min(z.w, z.h) / Math.sqrt(n)) * 0.7)) pts.push(q);
      }
      const deg = pts.map(() => 0);
      pts.forEach((p, i) => {
        const near = pts
          .map((q, j) => ({ j, d: dist(p, q) }))
          .filter((x) => x.j !== i)
          .sort((a, b) => a.d - b.d)
          .slice(0, 2);
        for (const nb of near) if (nb.j > i) (out.push(L(p, pts[nb.j], m.line, Math.max(0.6, u * 0.35 * m.weight), { name: 'Link' })), deg[i]++, deg[nb.j]++);
      });
      pts.forEach((p, i) => out.push(E(around(p[0], p[1], u * (1.6 + deg[i] * 1.1)), paint(m, i % 4 === 0 ? 1 : 0), undefined, { name: 'Node' })));
      break;
    }
    case 'pixels': {
      const s = u * r.between(2.4, 5.5);
      const cols = Math.max(2, Math.floor(z.w / s));
      const rows = Math.max(2, Math.floor(z.h / s));
      const focus = m.sk.focus;
      const maxD = Math.hypot(z.w, z.h) / 2;
      let k = 0;
      for (let j = 0; j < rows && k < 80; j++)
        for (let i = 0; i < cols && k < 80; i++) {
          const c: P2 = [z.x + (i + 0.5) * s, z.y + (j + 0.5) * s];
          const near = 1 - clamp(dist(c, focus) / maxD, 0, 1);
          if (r() > near * 0.85 * (0.4 + pres * 0.6) + 0.05) continue;
          out.push(R({ x: z.x + i * s, y: z.y + j * s, w: s * 0.92, h: s * 0.92 }, paint(m, (i + j * 3) % 7 === 0 ? 1 : 0), { name: 'Pixel' }));
          k++;
        }
      break;
    }
    case 'scan': {
      const n = clamp(Math.round(10 + pres * 22), 8, 34);
      const gap = z.h / n;
      for (let i = 0; i < n; i++) {
        const y = z.y + i * gap + gap / 2;
        const x0 = z.x + z.w * r.between(0, 0.3);
        const x1 = z.x + z.w * r.between(0.55, 1);
        out.push(L([x0, y], [x1, y], i % 6 === 3 ? paint(m, 0) : m.line, Math.max(0.5, gap * r.between(0.12, 0.38)), { name: 'Scan line', cap: 'butt' }));
      }
      break;
    }
    case 'ribbon': {
      const base = spine(m);
      const w0 = Math.min(m.W, m.H) * r.between(0.08, 0.2) * (0.5 + pres * 0.6);
      const twist = r.between(0.2, 0.9);
      const out1 = ribbonOutline(base, (t) => w0 * (0.25 + 0.75 * Math.abs(Math.sin(Math.PI * (t * twist + 0.2)))));
      out.push(P(segsToD(smoothSegs(out1, true, 0.3)), paint(m, 0), undefined, { name: 'Ribbon' }));
      if (r.chance(0.5)) {
        const second = offsetLine(base, w0 * 0.9);
        out.push(
          P(
            segsToD(
              smoothSegs(
                ribbonOutline(second, (t) => w0 * 0.3 * (0.4 + Math.sin(Math.PI * t))),
                true,
                0.3,
              ),
            ),
            paint(m, 1),
            undefined,
            { name: 'Ribbon', opacity: 0.9 },
          ),
        );
      }
      break;
    }
    case 'shards': {
      let pieces: P2[][] = [
        [
          [z.x, z.y],
          [z.x + z.w, z.y],
          [z.x + z.w, z.y + z.h],
          [z.x, z.y + z.h],
        ],
      ];
      const cuts = clamp(m.count, 3, 7);
      for (let i = 0; i < cuts; i++) {
        pieces.sort((a, b) => bboxArea(b) - bboxArea(a));
        const big = pieces.shift()!;
        const bb = bboxOf(big);
        const [A, B] = split(big, [bb.x + bb.w * r.between(0.3, 0.7), bb.y + bb.h * r.between(0.3, 0.7)], r.between(0, Math.PI));
        pieces.push(...[A, B].filter((p) => p.length >= 3));
      }
      pieces = pieces.slice(0, 9);
      const slide = Math.min(m.W, m.H) * 0.018 * (1 + m.angularity / 60);
      pieces.forEach((pc, i) => {
        const dx = r.between(-1, 1) * slide;
        const dy = r.between(-1, 1) * slide;
        out.push(
          P(
            segsToD(
              polySegs(
                pc.map((q) => [q[0] + dx, q[1] + dy] as P2),
                true,
              ),
            ),
            paint(m, i),
            undefined,
            { name: 'Shard' },
          ),
        );
      });
      break;
    }
    case 'arches': {
      const n = clamp((m.count % 4) + 1, 1, 4);
      const row = r.chance(0.45) && n > 1;
      for (let i = 0; i < n; i++) {
        const w = row ? z.w / n - u * 2 : z.w * (1 - i * 0.2);
        const h = row ? z.h : z.h * (1 - i * 0.16);
        const x = row ? z.x + i * (w + u * 2) : z.x + (z.w - w) / 2;
        const y = z.y + z.h - h;
        const rr = w / 2;
        const d = `M${x} ${y + h} L${x} ${y + rr} C${x} ${y + rr * 0.45} ${x + rr * 0.45} ${y} ${x + rr} ${y} C${x + rr * 1.55} ${y} ${x + w} ${y + rr * 0.45} ${x + w} ${y + rr} L${x + w} ${y + h} Z`;
        out.push(P(d, paint(m, i), undefined, { name: 'Arch' }));
      }
      break;
    }
    case 'curls': {
      const n = clamp((m.count % 4) + 2, 2, 5);
      for (let i = 0; i < n; i++) {
        const x = z.x + z.w * ((i + 0.5) / n) + r.between(-1, 1) * u * 3;
        const pts: P2[] = [];
        for (let k = 0; k <= 30; k++) {
          const t = k / 30;
          pts.push([x + Math.sin(t * Math.PI * r.between(2.2, 3.4) + i) * z.w * 0.06, z.y + z.h - t * z.h]);
        }
        out.push(P(segsToD(smoothSegs(pts)), null, stroke(m, 1.8, paint(m, i)), { name: 'Curl', opacity: clamp(0.95 - i * 0.12, 0.4, 1) }));
      }
      break;
    }
    case 'sectors': {
      const C = centreOf(m);
      const n = clamp(m.count + 2, 4, 12);
      const R0 = Math.min(m.W, m.H) * (0.22 + pres * 0.28);
      const start = r.between(0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        if (r.chance(0.18)) continue;
        const a0 = start + (i / n) * Math.PI * 2;
        const a1 = start + ((i + 1) / n) * Math.PI * 2 - 0.02;
        const rr = R0 * (r.chance(0.5) ? 1 : r.between(0.65, 0.95));
        const pts: P2[] = [C];
        for (let k = 0; k <= 12; k++) {
          const a = a0 + ((a1 - a0) * k) / 12;
          pts.push([C[0] + Math.cos(a) * rr, C[1] + Math.sin(a) * rr]);
        }
        out.push(P(segsToD(polySegs(pts, true)), paint(m, i), undefined, { name: 'Sector' }));
      }
      break;
    }
    case 'burst': {
      const C = centreOf(m);
      const pts = clamp(10 + m.count * 2, 10, 32);
      const R1 = Math.min(m.W, m.H) * (0.28 + pres * 0.32);
      out.push(P(segsToD(polySegs(STAR(C, R1, R1 * r.between(0.55, 0.8), pts, r.between(0, 1)), true)), paint(m, 0), undefined, { name: 'Burst' }));
      if (r.chance(0.5)) out.push(P(segsToD(polySegs(STAR(C, R1 * 0.6, R1 * 0.42, pts, r.between(0, 1)), true)), paint(m, 1), undefined, { name: 'Burst' }));
      break;
    }
    case 'sparkle': {
      const n = clamp(Math.round(5 + pres * 14), 4, 20);
      for (let i = 0; i < n; i++) {
        const c: P2 = [z.x + r() * z.w, z.y + r() * z.h];
        const s = u * r.between(1.5, 6) * (i === 0 ? 2 : 1);
        out.push(P(segsToD(smoothSegs(STAR(c, s, s * 0.22, 4), true, 0.15)), paint(m, i), undefined, { name: 'Spark' }));
      }
      break;
    }
    case 'stack': {
      const n = clamp(m.count, 3, 8);
      const h = z.h / (n * 1.35);
      for (let i = 0; i < n; i++) {
        const w = z.w * (1 - i * r.between(0.04, 0.09));
        out.push(R({ x: z.x + (z.w - w) * (r.chance(0.5) ? 0 : 1) * r.between(0.2, 1), y: z.y + z.h - (i + 1) * h * 1.3, w, h }, paint(m, i), { name: 'Slab', rotation: r.between(-1, 1) * (m.angularity / 30) }));
      }
      break;
    }
    case 'stitch': {
      const base = spine(m);
      out.push(P(segsToD(smoothSegs(base.filter((_, i) => i % 3 === 0))), null, { ...stroke(m, 1.3, paint(m, 0)), dash: [u * 2.2, u * 1.4] }, { name: 'Stitch' }));
      for (let i = 0; i < 9; i++) {
        const a = along(base, (i + 0.5) / 9);
        const nx = -a.tan[1] * u * 2;
        const ny = a.tan[0] * u * 2;
        out.push(L([a.p[0] - nx, a.p[1] - ny], [a.p[0] + nx, a.p[1] + ny], m.line, Math.max(0.6, u * 0.4), { name: 'Cross-stitch' }));
      }
      break;
    }
    case 'weave': {
      const s = u * r.between(4, 8);
      const cols = Math.max(2, Math.floor(z.w / s));
      const rows = Math.max(2, Math.floor(z.h / s));
      let k = 0;
      for (let j = 0; j < rows && k < 64; j++)
        for (let i = 0; i < cols && k < 64; i++, k++) {
          const x = z.x + i * s;
          const y = z.y + j * s;
          const over = (i + j) % 2 === 0;
          out.push(
            over ? L([x + s * 0.12, y + s / 2], [x + s * 0.88, y + s / 2], paint(m, j), s * 0.32, { name: 'Weft', cap: 'butt' }) : L([x + s / 2, y + s * 0.12], [x + s / 2, y + s * 0.88], paint(m, i + 1), s * 0.32, { name: 'Warp', cap: 'butt' }),
          );
        }
      break;
    }
    case 'horizon': {
      const y = clamp(m.sk.focus[1] + r.between(-0.08, 0.12) * m.H, m.H * 0.25, m.H * 0.85);
      const C: P2 = [clamp(m.sk.focus[0], m.W * 0.15, m.W * 0.85), y];
      const R0 = Math.min(m.W, m.H) * (0.16 + pres * 0.2);
      const arc: P2[] = [];
      for (let k = 0; k <= 32; k++) {
        const a = Math.PI + (k / 32) * Math.PI;
        arc.push([C[0] + Math.cos(a) * R0, C[1] + Math.sin(a) * R0]);
      }
      out.push(P(segsToD(polySegs(arc, true)), paint(m, 0), undefined, { name: 'Sun' }));
      out.push(L([-m.W * 0.02, y], [m.W * 1.02, y], m.line, Math.max(1, u * 0.6 * m.weight), { name: 'Horizon' }));
      for (let k = 1; k <= 4; k++) out.push(L([C[0] - R0 * (1 - k * 0.18), y + k * u * 2.4], [C[0] + R0 * (1 - k * 0.18), y + k * u * 2.4], paint(m, 0), Math.max(0.8, u * (1 - k * 0.15)), { name: 'Reflection' }));
      break;
    }
    case 'route': {
      const base = spine(m);
      out.push(P(segsToD(smoothSegs(base.filter((_, i) => i % 4 === 0))), null, { ...stroke(m, 1.4), dash: [u * 2.4, u * 1.8] }, { name: 'Route' }));
      const stops = clamp((m.count % 4) + 3, 3, 6);
      for (let i = 0; i < stops; i++) {
        const a = along(base, 0.08 + (i / (stops - 1)) * 0.84);
        out.push(E(around(a.p[0], a.p[1], u * (i === stops - 1 ? 4.5 : 2.4)), i === stops - 1 ? null : paint(m, i), i === stops - 1 ? stroke(m, 1.6, paint(m, 0)) : undefined, { name: i === stops - 1 ? 'Destination' : 'Stop' }));
      }
      break;
    }
    case 'leaves': {
      const base = spine(m);
      out.push(P(segsToD(smoothSegs(base.filter((_, i) => i % 3 === 0))), null, stroke(m, 1.1), { name: 'Stem' }));
      const n = clamp(Math.round(6 + pres * 10), 5, 16);
      for (let i = 0; i < n; i++) {
        const a = along(base, (i + 0.5) / n);
        const ang = (Math.atan2(a.tan[1], a.tan[0]) * 180) / Math.PI + (i % 2 ? 50 : -50) + r.between(-10, 10);
        const s = u * r.between(4, 9) * (0.6 + pres * 0.5);
        out.push({ op: 'prim', kind: 'leaf', params: { width: 46, bend: Math.round(r.between(-20, 20)) }, box: around(a.p[0], a.p[1], s * 0.55, s * 1.4), fill: paint(m, i), rotation: ang + 90, name: 'Leaf' });
      }
      break;
    }
    case 'glyph': {
      const z2 = m.sk.mass ?? z;
      const big = Math.max(z2.w, z2.h) * r.between(1, 1.35);
      out.push({
        op: 'echo',
        of: m.text.includes('&') && r.chance(0.35) ? 'ampersand' : 'initial',
        box: { x: z2.x - big * 0.08, y: z2.y - big * 0.12, w: big, h: big * 1.1 },
        size: big,
        color: paint(m, 0),
        outline: r.chance(0.25),
        name: 'Letterform',
        decorative: true,
      });
      break;
    }
    case 'blob': {
      const C: P2 = [z.x + z.w / 2, z.y + z.h / 2];
      const pts = closedBlob(C, (z.w / 2) * (0.75 + pres * 0.3), (z.h / 2) * (0.75 + pres * 0.3), r.int(1, 9999), 0.22 + m.curvature / 500, 12);
      out.push(P(segsToD(smoothSegs(pts, true)), paint(m, 0), undefined, { name: 'Form' }));
      if (r.chance(0.55)) {
        const c2: P2 = [C[0] + z.w * r.between(-0.35, 0.35), C[1] + z.h * r.between(-0.35, 0.35)];
        out.push(P(segsToD(smoothSegs(closedBlob(c2, z.w * 0.22, z.h * 0.22, r.int(1, 9999), 0.25, 10), true)), paint(m, 1), undefined, { name: 'Form', blend: 'multiply' }));
      }
      break;
    }
    case 'blocks': {
      const kinds = m.styleMotifs.length
        ? m.styleMotifs
        : [
            { kind: 'circle', params: {} },
            { kind: 'triangle', params: {} },
            { kind: 'semicircle', params: {} },
            { kind: 'diamond', params: {} },
          ];
      const n = clamp(m.count, 3, 8);
      const C = centreOf(m);
      const sp = m.sk.path;
      for (let i = 0; i < n; i++) {
        const k = kinds[i % kinds.length];
        const s = i === 0 ? Math.min(z.w, z.h) * (0.6 + pres * 0.35) : Math.min(z.w, z.h) * r.between(0.12, 0.34);
        let c: P2;
        if (i === 0) c = [z.x + z.w / 2, z.y + z.h / 2];
        else if (sp) c = along(sp.length === 2 ? spine(m) : sp, r.between(0.1, 0.9)).p;
        else if (m.sk.centre) {
          const a = r.between(0, Math.PI * 2);
          const rr = (m.sk.radii[r.int(0, Math.max(0, m.sk.radii.length - 1))] ?? s * 2) * 1;
          c = [C[0] + Math.cos(a) * rr, C[1] + Math.sin(a) * rr];
        } else c = [z.x + r() * z.w, z.y + r() * z.h];
        out.push({
          op: 'prim',
          kind: k.kind,
          params: { ...k.params, ...('seed' in k.params ? { seed: r.int(1, 900) } : {}) },
          box: around(c[0], c[1], s, s),
          fill: paint(m, i),
          rotation: m.angularity > 40 ? r.pick([0, 0, 15, -15, 45, 90]) : 0,
          name: 'Figure',
        });
      }
      break;
    }
    case 'lattice': {
      const s = Math.min(z.w, z.h) / r.int(4, 9);
      for (let x = z.x; x <= z.x + z.w + 0.5; x += s) out.push(L([x, z.y], [x, z.y + z.h], m.line, Math.max(0.4, u * 0.18), { name: 'Grid line', opacity: 0.8 }));
      for (let y = z.y; y <= z.y + z.h + 0.5; y += s) out.push(L([z.x, y], [z.x + z.w, y], m.line, Math.max(0.4, u * 0.18), { name: 'Grid line', opacity: 0.8 }));
      const marks = clamp((m.count % 5) + 2, 2, 6);
      for (let i = 0; i < marks; i++) {
        const cx = z.x + Math.floor(r() * (z.w / s)) * s;
        const cy = z.y + Math.floor(r() * (z.h / s)) * s;
        out.push(R({ x: cx, y: cy, w: s * r.int(1, 2), h: s }, paint(m, i), { name: 'Cell' }));
      }
      break;
    }
    case 'dots': {
      out.push({ op: 'pattern', gen: r.chance(0.5) ? 'halftone' : 'dots', box: z, scale: r.between(0.7, 1.5), inks: ['accent'], name: 'Field', opacity: clamp(0.6 + pres * 0.4, 0.5, 1) });
      break;
    }
    case 'frames': {
      const n = clamp((m.count % 4) + 2, 2, 5);
      for (let i = 0; i < n; i++) {
        const k = 1 - i * 0.16;
        const b = { x: z.x + (z.w * (1 - k)) / 2 + r.between(-1, 1) * u * 2, y: z.y + (z.h * (1 - k)) / 2 + r.between(-1, 1) * u * 2, w: z.w * k, h: z.h * k };
        out.push(R(b, i === n - 1 && r.chance(0.5) ? paint(m, 0) : null, { stroke: stroke(m, i === 0 ? 1.6 : 0.9), rotation: r.between(-1, 1) * (m.angularity / 25), name: 'Frame' }));
      }
      break;
    }
    case 'beams': {
      const src: P2 = m.sk.centre ?? [m.sk.focus[0] < m.W / 2 ? -m.W * 0.05 : m.W * 1.05, m.sk.focus[1]];
      const n = clamp(m.count + 2, 3, 10);
      const toward = Math.atan2(m.sk.focus[1] - src[1], m.sk.focus[0] - src[0]);
      const spread = r.between(0.5, 1.4);
      const len = Math.hypot(m.W, m.H) * 1.1;
      for (let i = 0; i < n; i++) {
        const a = toward - spread / 2 + (spread * i) / (n - 1 || 1);
        const w = (spread / n) * 0.45;
        out.push(
          P(segsToD(polySegs([src, [src[0] + Math.cos(a - w) * len, src[1] + Math.sin(a - w) * len], [src[0] + Math.cos(a + w) * len, src[1] + Math.sin(a + w) * len]], true)), paint(m, i), undefined, {
            name: 'Beam',
            opacity: clamp(0.9 - i * 0.05, 0.4, 1),
          }),
        );
      }
      break;
    }
    case 'drops': {
      const n = clamp(Math.round(4 + pres * 9), 3, 14);
      for (let i = 0; i < n; i++) {
        const c: P2 = [z.x + r() * z.w, z.y + r() * z.h];
        const s = u * r.between(2, 7) * (i === 0 ? 1.8 : 1);
        const d = `M${c[0]} ${c[1] - s * 1.6} C${c[0] + s * 0.4} ${c[1] - s * 0.6} ${c[0] + s} ${c[1] - s * 0.1} ${c[0] + s} ${c[1] + s * 0.4} C${c[0] + s} ${c[1] + s} ${c[0] + s * 0.5} ${c[1] + s * 1.2} ${c[0]} ${c[1] + s * 1.2} C${c[0] - s * 0.5} ${c[1] + s * 1.2} ${c[0] - s} ${c[1] + s} ${c[0] - s} ${c[1] + s * 0.4} C${c[0] - s} ${c[1] - s * 0.1} ${c[0] - s * 0.4} ${c[1] - s * 0.6} ${c[0]} ${c[1] - s * 1.6} Z`;
        out.push(P(d, paint(m, i), undefined, { name: 'Drop' }));
      }
      break;
    }
    case 'steps': {
      const n = clamp(m.count, 3, 8);
      const toRight = m.sk.focus[0] > m.W / 2;
      const w = z.w / n;
      for (let i = 0; i < n; i++) {
        const h = z.h * ((i + 1) / n) * (0.6 + pres * 0.4);
        const x = toRight ? z.x + i * w : z.x + z.w - (i + 1) * w;
        out.push(R({ x, y: z.y + z.h - h, w: w * 0.94, h }, paint(m, i), { name: 'Step' }));
      }
      break;
    }
  }
  return out;
}

const bboxArea = (pts: P2[]) => {
  const b = bboxOf(pts);
  return b.w * b.h;
};
