// lib/ux-v0/graphics/generative/typeset.ts — the words placed by the concept's type strategy, in the zones its skeleton
// gave: monumental across its zone, broken into a column, turned onto the axis, riding the curve or a ring, run up an
// edge, kept small and exact beside an image, echoed far larger behind itself, beside the date drawn as a shape, or
// held inside a form. The words are always the brief's own, by reference; only where and how they sit is invented.

import type { CreativeConcept } from './concept';
import type { Instruction, ColourRef } from './program';
import type { CreativeReading } from './reading';
import { hasOpportunity } from './reading';
import type { Skeleton } from './space';
import { zone } from './space';
import { along, bboxOf, clamp, intersect, lengthOf, segsToD, smoothSegs, type Box, type P2, type Rng } from './util';

export interface TypeCtx {
  W: number;
  H: number;
  u: number;
  safe: Box;
  sk: Skeleton;
  c: CreativeConcept;
  reading: CreativeReading;
  headline: string;
  minText: number;
  r: Rng;
  /** the colour words take on the ground (resolved by what lies beneath when 'auto') */
  ink: ColourRef;
  /** the language sets its display type in a gradient (chrome, iridescence): the stops, by palette role */
  gradient?: ColourRef[] | null;
}

const inside = (b: Box, S: Box): Box => intersect(b, S) ?? { x: S.x, y: S.y, w: S.w, h: Math.min(S.h, b.h) };

function alignFor(t: TypeCtx, b: Box): 'left' | 'center' | 'right' {
  const a = t.c.typeParams.align ?? 0;
  if (a === 1 || t.c.symmetry >= 60) return 'center';
  if (a === 2) return 'right';
  const S = t.safe;
  const touchesRight = b.x + b.w >= S.x + S.w - t.u * 2;
  const touchesLeft = b.x <= S.x + t.u * 2;
  return touchesRight && !touchesLeft ? 'right' : 'left';
}

/** One word for the accent: the longest, or the last (never the only word). */
function accentWord(t: TypeCtx): number | undefined {
  if (!t.c.typeParams.accent) return undefined;
  const words = t.headline.split(/\s+/).filter(Boolean);
  if (words.length < 2) return undefined;
  const longest = words.reduce((bi, w, i) => (w.replace(/\W/g, '').length > words[bi].replace(/\W/g, '').length ? i : bi), 0);
  return t.r.chance(0.5) ? longest : words.length - 1;
}

/** The headline and the details, as instructions (see the head of this file). */
export function typeset(t: TypeCtx): Instruction[] {
  const { u, safe: S, sk, c } = t;
  const out: Instruction[] = [];
  const tz = inside(zone(sk, 'type') ?? { x: S.x, y: S.y, w: S.w, h: S.h * 0.4 }, S);
  const dzRaw = zone(sk, 'details');
  const dz = dzRaw ? inside(dzRaw, S) : null;
  const scale = clamp(c.typeParams.scale ?? 1, 0.4, 1.3);
  const accent = accentWord(t);
  const head = (b: Box, extra: Partial<Extract<Instruction, { op: 'text' }>> = {}): Instruction => ({
    op: 'text',
    content: 'headline',
    box: b,
    color: 'auto',
    ...(accent !== undefined && !t.gradient ? { accentWord: accent } : {}),
    ...(t.gradient && !extra.path ? { gradient: t.gradient } : {}),
    ...extra,
  });
  const details = (b: Box, align: 'left' | 'center' | 'right', fromFoot = false, s = 1): Instruction => ({ op: 'details', box: b, align, ...(fromFoot ? { fromFoot: true } : {}), scale: s, color: 'auto' });
  const splitZone = (b: Box, share: number): [Box, Box] => {
    const gap = u * 2.4;
    if (b.w > b.h * 1.6 && b.h < S.h * 0.3)
      return [
        { ...b, w: b.w * share - gap / 2 },
        { ...b, x: b.x + b.w * share + gap / 2, w: b.w * (1 - share) - gap / 2 },
      ];
    return [
      { ...b, h: b.h * share - gap / 2 },
      { ...b, y: b.y + b.h * share + gap / 2, h: b.h * (1 - share) - gap / 2 },
    ];
  };
  const lowHalf = (b: Box) => b.y + b.h / 2 > t.H * 0.55;
  if (c.constraints.headlineCentral) {
    out.push(head(tz, { align: 'center', valign: 'middle' }));
    out.push(details(dz ?? { ...tz, y: tz.y + tz.h + u * 3, h: S.h * 0.18 }, 'center'));
    return out;
  }

  switch (c.type) {
    case 'monumental': {
      const [hb0, db0] = dz ? [tz, dz] : splitZone(tz, 0.68);
      const hb = { ...hb0, w: hb0.w * clamp(0.82 + scale * 0.18, 0.6, 1) };
      const align = alignFor(t, hb0);
      if (align === 'right') hb.x = hb0.x + hb0.w - hb.w;
      if (align === 'center') hb.x = hb0.x + (hb0.w - hb.w) / 2;
      out.push(head(hb, { align, valign: dz ? (lowHalf(hb) ? 'bottom' : 'top') : 'bottom' }));
      out.push(details(db0, align, !dz ? false : lowHalf(db0)));
      break;
    }
    case 'column': {
      const share = clamp(c.typeParams.column ?? 0.5, 0.34, 0.7);
      const right = alignFor(t, tz) === 'right';
      const colW = Math.max(tz.w * share, u * 16);
      const hb = { x: right ? tz.x + tz.w - colW : tz.x, y: tz.y, w: colW, h: tz.h };
      out.push(head(hb, { align: right ? 'right' : 'left', valign: lowHalf(tz) ? 'bottom' : 'top', lineHeight: 0.88 }));
      const rest = { x: right ? tz.x : tz.x + colW + u * 3, y: tz.y, w: tz.w - colW - u * 3, h: tz.h };
      out.push(details(dz ?? (rest.w >= u * 14 ? rest : { ...tz, y: tz.y + tz.h * 0.7, h: tz.h * 0.3 }), right ? 'right' : 'left', !lowHalf(tz)));
      break;
    }
    case 'axis': {
      const a = sk.org === 'axis' ? sk.angle : (t.r.chance(0.5) ? -1 : 1) * t.r.between(10, 34);
      const vertical = Math.abs(a) >= 80;
      const cx = clamp(sk.org === 'axis' ? sk.focus[0] : tz.x + tz.w / 2, S.x + S.w * 0.25, S.x + S.w * 0.75);
      const cy = clamp(sk.org === 'axis' ? sk.focus[1] : tz.y + tz.h / 2, S.y + S.h * 0.22, S.y + S.h * 0.78);
      const rad = (Math.abs(a) * Math.PI) / 180;
      // the longest run the turned box can have inside the safe area
      const L = vertical ? S.h * 0.86 : Math.min(S.w / Math.max(0.35, Math.cos(rad)), S.h / Math.max(0.35, Math.sin(rad))) * 0.78;
      const thick = Math.min(S.w, S.h) * clamp(0.22 * scale, 0.12, 0.3);
      // a line motif drawn along the same axis: the words run beside it, offset across the axis, never on top of it
      const lineAlong = sk.org === 'axis' && !!t.c.motif && ['wave', 'pulse', 'ribbon', 'stitch', 'route', 'leaves', 'scan'].includes(t.c.motif);
      const off = lineAlong ? (Math.min(t.W, t.H) * 0.22 + thick / 2) * (cy > t.H / 2 ? -1 : 1) : 0;
      const ar = (a * Math.PI) / 180;
      const ox = -Math.sin(ar) * off;
      const oy = Math.cos(ar) * off;
      out.push(head({ x: cx + ox - L / 2, y: cy + oy - thick / 2, w: L, h: thick }, { align: 'center', valign: 'middle', rotation: vertical ? (a > 0 ? 90 : -90) : a }));
      const db = dz ?? (cy > t.H / 2 ? { x: S.x, y: S.y, w: S.w * 0.55, h: S.h * 0.2 } : { x: S.x, y: S.y + S.h * 0.8, w: S.w * 0.55, h: S.h * 0.2 });
      out.push(details(db, alignFor(t, db), cy <= t.H / 2));
      break;
    }
    case 'path': {
      const size = (len: number) => clamp(len / Math.max(6, t.headline.length * 0.62), t.minText * 1.8, Math.min(t.W, t.H) * 0.12);
      const legible = (s: number) => s >= Math.min(t.W, t.H) * 0.055;
      if (sk.path && sk.path.length > 8 && sk.org !== 'axis') {
        // the stretch of the curve inside the safe area, the words set along it
        const pts = sk.path.filter((q) => q[0] >= S.x + u * 2 && q[0] <= S.x + S.w - u * 2 && q[1] >= S.y + u * 8 && q[1] <= S.y + S.h - u * 2);
        if (pts.length >= 8 && legible(size(lengthOf(pts)))) {
          const s = size(lengthOf(pts));
          const lift = pts.map((q, i) => {
            const a = along(pts, i / (pts.length - 1));
            return [q[0] + a.tan[1] * s * 0.35, q[1] - a.tan[0] * s * 0.35] as P2;
          });
          const bb = bboxOf(lift, s * 1.2);
          out.push(head(bb, { size: s, path: { kind: 'custom', d: segsToD(smoothSegs(lift.filter((_, i) => i % 2 === 0))) }, align: 'center' }));
          const db = dz ?? tz;
          out.push(details(db, alignFor(t, db), lowHalf(db)));
          break;
        }
      }
      if (sk.centre && sk.radii.length) {
        // round a ring: the largest that stays inside the frame
        const C = sk.centre;
        const ring = [...sk.radii].reverse().find((rr) => C[0] - rr >= S.x && C[0] + rr <= S.x + S.w && C[1] - rr >= S.y && C[1] + rr <= S.y + S.h) ?? null;
        if (ring && legible(size(Math.PI * ring * 1.1))) {
          const s = size(Math.PI * ring * 1.1);
          out.push(head({ x: C[0] - ring, y: C[1] - ring, w: ring * 2, h: ring * 2 }, { size: s, path: { kind: 'circle', start: t.r.pick([0, 0, 12, 88]) }, align: 'center' }));
          const db = dz ?? tz;
          out.push(details(db, alignFor(t, db), lowHalf(db)));
          break;
        }
      }
      // else an arc of the type zone itself, if it is wide enough to set the words large; else the title monumental
      const hb = { ...tz, h: Math.min(tz.h, Math.max(u * 18, tz.w * 0.42)) };
      if (legible(size(hb.w * 1.1))) {
        out.push(head(hb, { size: size(hb.w * 1.1), path: { kind: 'arc', bend: Math.round(t.r.between(25, 60)) * (t.r.chance(0.5) ? 1 : -1) }, align: 'center' }));
        out.push(details(dz ?? { ...tz, y: hb.y + hb.h + u * 2, h: Math.max(u * 10, tz.h - hb.h - u * 2) }, 'center'));
      } else {
        const [h2, d2] = dz ? [tz, dz] : splitZone(tz, 0.66);
        out.push(head(h2, { align: alignFor(t, h2), valign: 'top' }));
        out.push(details(d2, alignFor(t, d2), lowHalf(d2)));
      }
      break;
    }
    case 'vertical': {
      const atRight = sk.focus[0] < t.W / 2 !== t.r.chance(0.25);
      const thick = Math.min(S.w * 0.3, Math.max(u * 12, tz.w * 0.42)) * clamp(scale, 0.7, 1.2);
      const L = S.h * 0.9;
      const cx = atRight ? S.x + S.w - thick / 2 : S.x + thick / 2;
      const cy = S.y + S.h / 2;
      out.push(head({ x: cx - L / 2, y: cy - thick / 2, w: L, h: thick }, { align: t.r.chance(0.5) ? 'left' : 'right', valign: 'middle', rotation: atRight ? 90 : -90 }));
      const db = dz ?? { x: atRight ? S.x : S.x + thick + u * 4, y: S.y + S.h * 0.72, w: S.w - thick - u * 4, h: S.h * 0.28 };
      out.push(details(db, atRight ? 'left' : 'left', true));
      break;
    }
    case 'quiet': {
      const s = clamp(Math.min(t.W, t.H) * 0.06 * clamp(scale + 0.3, 0.7, 1.4), t.minText * 1.8, Math.min(t.W, t.H) * 0.085);
      const corner = lowHalf(tz) ? 'bottom' : 'top';
      const align = alignFor(t, tz);
      const hb = { x: tz.x, y: tz.y, w: Math.min(tz.w, S.w * 0.62), h: tz.h * 0.5 };
      if (align === 'right') hb.x = tz.x + tz.w - hb.w;
      out.push(head(hb, { size: s, align, valign: corner === 'bottom' ? 'bottom' : 'top' }));
      const db = dz ?? (corner === 'bottom' ? { ...hb, y: tz.y + tz.h * 0.5 + u * 2, h: tz.h * 0.5 - u * 2 } : { ...hb, y: tz.y + tz.h * 0.5 + u * 2, h: tz.h * 0.5 - u * 2 });
      out.push(details(db, align, false, 0.92));
      break;
    }
    case 'echo': {
      // the title huge, cropped by the frame, behind; the readable title set within the type zone
      const words = t.headline.split(/\s+/).filter(Boolean);
      const big = Math.min(t.W, t.H) * t.r.between(0.32, 0.55);
      const bleedLeft = sk.focus[0] > t.W / 2;
      const ey = t.r.between(0.05, 0.55) * t.H;
      // outlined, it can be strong; filled, it recedes (a tint of itself) so the readable title is never fought
      const outline = t.r.chance(0.55);
      out.push({
        op: 'echo',
        of: words.length > 2 && t.r.chance(0.5) ? 'word' : 'headline',
        word: words.reduce((bi, w, i) => (w.length > words[bi].length ? i : bi), 0),
        box: { x: bleedLeft ? -big * 0.35 : t.W * 0.1, y: ey, w: t.W * 1.6, h: big * 1.2 },
        size: big,
        color: 'accent',
        outline,
        align: 'left',
        name: 'Echo of the title',
        opacity: outline ? 0.85 : 0.2,
      });
      const [hb, db] = dz ? [tz, dz] : splitZone(tz, 0.62);
      out.push(head({ ...hb, w: hb.w * clamp(0.7 + scale * 0.2, 0.6, 1) }, { align: alignFor(t, hb), valign: 'top' }));
      out.push(details(db, alignFor(t, db), lowHalf(db)));
      break;
    }
    case 'numeral': {
      const num = hasOpportunity(t.reading, 'numeral')?.value ?? '';
      const fz = zone(sk, 'focal') ?? tz;
      const nb = inside(fz, { x: -t.W, y: -t.H, w: t.W * 3, h: t.H * 3 });
      const big = Math.min(nb.w / Math.max(2, num.length * 0.58), nb.h * 0.9);
      out.push({ op: 'echo', of: 'numeral', box: { x: nb.x, y: nb.y, w: Math.max(nb.w, big * num.length * 0.62), h: big * 1.15 }, size: big, color: 'accent', name: 'The date as a shape', align: 'left' });
      const [hb, db] = dz ? [tz, dz] : splitZone(tz, 0.64);
      out.push(head(hb, { align: alignFor(t, hb), valign: 'top' }));
      out.push(details(db, alignFor(t, db), lowHalf(db)));
      break;
    }
    case 'framed': {
      const host0 = sk.frame?.box ?? sk.planes[sk.planes.length - 1]?.box ?? zone(sk, 'focal') ?? tz;
      // a form too small to hold the title large: the title set in its zone instead
      if (host0.w * host0.h < S.w * S.h * 0.28) {
        const [h2, d2] = dz ? [tz, dz] : splitZone(tz, 0.66);
        out.push(head(h2, { align: alignFor(t, h2), valign: 'top' }));
        out.push(details(d2, alignFor(t, d2), lowHalf(d2)));
        break;
      }
      const host = host0;
      const inner = inside({ x: host.x + host.w * 0.12, y: host.y + host.h * 0.18, w: host.w * 0.76, h: host.h * 0.64 }, S);
      const [hb, db] = splitZone(inner, 0.66);
      out.push(head(hb, { align: 'center', valign: 'bottom' }));
      out.push(details(dz ?? db, 'center'));
      break;
    }
  }
  return out;
}
