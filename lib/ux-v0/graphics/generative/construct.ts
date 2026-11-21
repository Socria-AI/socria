// lib/ux-v0/graphics/generative/construct.ts — a concept built, as a Design Program. The skeleton of its spatial
// principle (and the second one laid over it), the ground and fields its colour relationship asks for, the focal
// material (a procedural motif, a letterform, the designer's picture treated as the concept says), the operations
// applied to that material as real transformations (turned, repeated, layered, cut and slid, mirrored, printed out of
// register, masked with a pattern, interrupted by a band), structure where the language is rigorous, and the words.
// Every number comes from the concept and a seeded variant; nothing is read from a stored layout.

import { mix } from '../styles/constructions-kit';
import { contrastRatio } from '../../../ux/audit';
import type { CreativeConcept } from './concept';
import { MOTIF_TRAITS } from './lexicon';
import { drawMotif, type MotifCtx } from './motifs';
import type { Principles } from './principles';
import { boxAround, instructionBox, PROGRAM_SCHEMA, type ColourRef, type DesignProgram, type Instruction, type PaintRef } from './program';
import type { CreativeReading } from './reading';
import { skeletonFor, zone, type Skeleton } from './space';
import { typeset } from './typeset';
import { around, clamp, intersect, polySegs, rng, segsToD, smoothSegs, type Box, type P2, type Rng } from './util';

export interface Palette {
  ground: string;
  ink: string;
  accent: string;
  accent2: string;
  accent3: string;
  muted: string;
  paper: string;
}

export interface BuildCtx {
  W: number;
  H: number;
  u: number;
  safe: Box;
  pal: Palette;
  images: number;
  headline: string;
  minText: number;
  styleMotifs: { kind: string; params: Record<string, number> }[];
  /** the language's own pattern generator, when it has one (or a brief or Board asked for one) */
  pattern?: string | null;
  /** a vocabulary given explicitly (a Board's, a model's validated plan): its shapes always appear */
  vocabStrong?: boolean;
}

export interface Built {
  program: DesignProgram;
  sk: Skeleton;
  sk2: Skeleton | null;
  trace: string[];
}

/** A concept moved a little for one variant (the focus, the principle's numbers): the same idea, tried otherwise. */
function variantOf(c: CreativeConcept, v: number, r: Rng): CreativeConcept {
  if (!v) return c;
  const j = (x: number, k: number) => (Number.isInteger(x) ? x : Math.round(x * (1 + r.between(-k, k)) * 1000) / 1000);
  const params = Object.fromEntries(Object.entries(c.orgParams).map(([key, x]) => [key, key === 'seed' ? x + v * 7 : j(x, 0.06)]));
  return {
    ...c,
    focal: c.constraints.focal ? c.focal : { x: clamp(c.focal.x + r.between(-0.06, 0.06), 0.08, 0.92), y: clamp(c.focal.y + r.between(-0.06, 0.06), 0.08, 0.92) },
    orgParams: params,
    typeParams: { ...c.typeParams, scale: clamp((c.typeParams.scale ?? 1) + r.between(-0.06, 0.06), 0.4, 1.3) },
  };
}

/** A copy of instructions in one flat colour (a silhouette for a shadow or a misregistered pass). */
function recolour(list: readonly Instruction[], colour: ColourRef): Instruction[] {
  return list.map((e) => {
    if (e.op === 'group') return { ...e, children: recolour(e.children, colour) };
    if (e.op === 'line') return { ...e, color: colour };
    if (e.op === 'echo') return { ...e, color: colour };
    if (e.op === 'image' || e.op === 'text' || e.op === 'details') return e;
    if (e.op === 'pattern') return e;
    return { ...e, ...(e.fill !== null ? { fill: colour } : {}), ...(e.stroke ? { stroke: { ...e.stroke, color: colour } } : {}) } as Instruction;
  });
}
/** The concept built (see the head of this file). Deterministic for one concept and variant. */
export function construct(b: BuildCtx, c0: CreativeConcept, p: Principles, reading: CreativeReading, variant = 0): Built {
  const r = rng('build', c0.seed, variant);
  const c = variantOf(c0, variant, r.fork('variant'));
  const { W, H, u, safe: S, pal } = b;
  const frame = { W, H, safe: S, u };
  const sk = skeletonFor(c.org, c, frame, r.fork('sk'));
  const sk2 = c.org2 ? skeletonFor(c.org2, { ...c, orgParams: c.org2Params, focal: { x: clamp(1 - c.focal.x, 0.1, 0.9), y: clamp(1 - c.focal.y * 0.8, 0.1, 0.9) } }, frame, r.fork('sk2')) : null;
  const trace: string[] = [];
  const el: Instruction[] = [];
  // the headline as the central element: its zone is the middle of the frame, whatever the principle; the details
  // beneath it; the focal material moves behind or around it
  if (c.constraints.headlineCentral) {
    const mid: Box = { x: S.x + S.w * 0.06, y: S.y + S.h * (W / H > 1.25 ? 0.24 : 0.3), w: S.w * 0.88, h: S.h * (W / H > 1.25 ? 0.4 : 0.3) };
    sk.zones = sk.zones.filter((z) => z.role !== 'type' && z.role !== 'details');
    sk.zones.push({ role: 'type', box: mid }, { role: 'details', box: { x: mid.x, y: mid.y + mid.h + u * 3, w: mid.w, h: Math.min(S.y + S.h - (mid.y + mid.h + u * 3), S.h * 0.2) } });
    trace.push('the headline set as the central element');
  }

  // ── colour: the ground and the figures' paints, by the concept's relationship ──
  const tint = (a: string, k: number) => mix(a, pal.ground, k) as ColourRef;
  let ground: ColourRef = 'ground';
  let paints: ColourRef[];
  let line: ColourRef = 'ink';
  switch (c.colouring) {
    case 'inverse':
      ground = 'ink';
      paints = ['accent', 'accent2', 'paper', 'accent3'];
      line = 'paper';
      break;
    case 'field':
      ground = 'accent';
      paints = ['ink', 'paper', 'accent2'];
      line = 'ink';
      break;
    case 'focal-accent':
      paints = ['accent', tint(pal.ink, 0.82), tint(pal.ink, 0.65), 'ink'];
      break;
    case 'tonal':
      paints = [tint(pal.accent, 0.15), tint(pal.accent, 0.45), tint(pal.accent, 0.7), tint(pal.ink, 0.2)];
      line = tint(pal.ink, 0.3);
      break;
    default:
      paints = ['accent', 'accent2', 'accent3', 'ink'];
  }
  if (c.colouring === 'inverse' || c.colouring === 'field') trace.push(c.colouring === 'inverse' ? 'the ink as the ground' : 'the accent as a whole field');
  el.push({ op: 'rect', box: { x: 0, y: 0, w: W, h: H }, fill: ground, role: 'background', name: 'Ground' });

  // ── the structure's own fields (a division, bands, merged cells) ──
  if (sk.cells.length) {
    const fz = zone(sk, 'focal');
    sk.cells.forEach((cell, i) => {
      const isFocal = !!fz && Math.abs(cell.x - fz.x) < 1 && Math.abs(cell.y - fz.y) < 1;
      const fill: ColourRef | null = c.colouring === 'split' ? (cell.fill === 'ground' ? null : ((cell.fill ?? 'accent') as ColourRef)) : isFocal ? paints[0] : i % 3 === 2 && c.density > 55 ? paints[1] : null;
      if (fill && fill !== ground) el.push({ op: 'rect', box: cell, fill, name: sk.org === 'strata' ? 'Band' : 'Field' });
    });
    trace.push(`${sk.cells.length} ${sk.org === 'strata' ? 'bands' : 'fields'}${c.colouring === 'split' ? ', each in its own colour' : ''}`);
  }

  // ── stacked planes, a frame ──
  if (sk.planes.length) {
    sk.planes.forEach((pl, i) => {
      const top = i === sk.planes.length - 1;
      el.push({
        op: 'rect',
        box: pl.box,
        fill: top ? (ground === 'ground' ? 'paper' : 'ground') : paints[i % paints.length],
        rotation: Math.round(pl.rotation * 10) / 10,
        name: top ? 'Top plane' : 'Plane',
        ...(p.space.layering >= 35 || c.operations.includes('layer') ? { fx: [{ kind: 'drop-shadow', params: { dy: 8, blur: 22, opacity: 22 } }] } : {}),
      });
    });
    trace.push(`${sk.planes.length} planes stacked`);
  }
  if (sk.frame) {
    const f = sk.frame;
    const w = Math.max(1, u * 0.55);
    if (f.arch) {
      const rr = f.box.w / 2;
      const { x, y, w: fw, h: fh } = f.box;
      el.push({
        op: 'path',
        d: `M${x} ${y + fh} L${x} ${y + rr} C${x} ${y + rr * 0.45} ${x + rr * 0.45} ${y} ${x + rr} ${y} C${x + rr * 1.55} ${y} ${x + fw} ${y + rr * 0.45} ${x + fw} ${y + rr} L${x + fw} ${y + fh} Z`,
        fill: null,
        stroke: { color: line, width: w },
        name: 'Arch frame',
      });
    } else if (f.broken) {
      const { x, y, w: fw, h: fh } = f.box;
      const gap0 = x + fw * r.between(0.2, 0.4);
      const gap1 = gap0 + fw * r.between(0.25, 0.4);
      el.push({ op: 'path', d: `M${gap1} ${y} L${x + fw} ${y} L${x + fw} ${y + fh} L${x} ${y + fh} L${x} ${y} L${gap0} ${y}`, fill: null, stroke: { color: line, width: w }, name: 'Broken frame' });
    } else el.push({ op: 'rect', box: f.box, fill: null, stroke: { color: line, width: w }, name: 'Frame' });
    if (f.double) el.push({ op: 'rect', box: { x: f.box.x + u * 1.6, y: f.box.y + u * 1.6, w: f.box.w - u * 3.2, h: f.box.h - u * 3.2 }, fill: null, stroke: { color: line, width: w * 0.5 }, name: 'Inner frame' });
    trace.push(f.arch ? 'an arch' : f.broken ? 'a broken frame' : 'a frame');
  }

  // ── the focal material ──
  const fz0 = zone(sk, 'focal') ?? around(sk.focus[0], sk.focus[1], Math.min(W, H) * 0.5);
  let fz = fz0;
  if (c.operations.includes('crop')) {
    // pushed past the nearest edge: the frame crops it
    const k = r.between(1.25, 1.55);
    const cx = fz.x + fz.w / 2 < W / 2 ? fz.x - fz.w * (k - 1) * 0.7 : fz.x - fz.w * (k - 1) * 0.3;
    const cy = fz.y + fz.h / 2 < H / 2 ? fz.y - fz.h * (k - 1) * 0.7 : fz.y - fz.h * (k - 1) * 0.3;
    fz = { x: cx, y: cy, w: fz.w * k, h: fz.h * k };
    trace.push('cropped by the edge');
  }
  if (c.operations.includes('scale')) fz = around(fz.x + fz.w / 2, fz.y + fz.h / 2, fz.w * 1.18, fz.h * 1.18);
  const mctx = (zoneBox: Box, presence: number, skel: Skeleton = sk): MotifCtx => ({
    W,
    H,
    u,
    sk: skel,
    sk2,
    zone: zoneBox,
    r: r.fork(`motif-${presence}`),
    presence,
    weight: c.motifParams.weight ?? 1,
    count: Math.round(c.motifParams.count ?? 5),
    paints,
    line,
    text: b.headline,
    styleMotifs: b.styleMotifs,
    curvature: p.geometry.curvature,
    rigidity: p.geometry.rigidity,
    angularity: p.geometry.angularity,
  });
  let focal: Instruction[] = [];
  const behind: Instruction[] = [];
  if (c.source === 'image' && b.images > 0) {
    focal = pictures(b, c, sk, fz, paints, r.fork('pictures'), trace);
    if (c.motif && c.motif !== 'glyph') {
      const accentZone = zone(sk, 'quiet') ?? zone(sk, 'type') ?? fz;
      behind.push(...drawMotif(c.motif, mctx(accentZone, Math.min(0.45, c.motifParams.presence ?? 0.35))));
    }
  } else if (c.motif) {
    // the designer's picture is always used: where the concept is led by something else, it supports it
    if (b.images > 0) {
      const spot = zone(sk, 'quiet') ?? zone(sk, 'details') ?? around(W * (1 - c.focal.x), H * (1 - c.focal.y), Math.min(W, H) * 0.42);
      const big = spot.w * spot.h < W * H * 0.08 ? around(spot.x + spot.w / 2, spot.y + spot.h / 2, Math.min(W, H) * 0.4, Math.min(W, H) * 0.32) : spot;
      behind.push(...pictures(b, { ...c, imagery: c.imagery === 'none' || c.imagery === 'full' ? 'masked' : c.imagery }, sk, big, paints, r.fork('support-picture'), trace));
    }
    // cropping suits a letterform, a form, a burst or rings at an edge; steps, bars and frames are drawn where they show
    const bleeds = ['glyph', 'blob', 'burst', 'sectors', 'rings', 'ripple', 'contours', 'spiral', 'horizon', 'arches'].includes(c.motif);
    const visible = sk.mass ? (intersect(sk.mass, { x: 0, y: 0, w: W, h: H }) ?? fz) : fz;
    const z = sk.mass && (MOTIF_TRAITS[c.motif].wants === 'edge' || MOTIF_TRAITS[c.motif].mass) ? (bleeds ? sk.mass : visible) : fz;
    if (sk.mass && z !== sk.mass) focal.push({ op: 'ellipse', box: sk.mass, fill: paints[1], name: 'Mass' });
    // a field of small marks (pixels, a weave, dots, scan lines, circuit traces) is kept out of the words' zone
    const fieldLike = ['pixels', 'weave', 'dots', 'scan', 'circuit', 'lattice', 'network', 'sparkle', 'drops', 'bars'].includes(c.motif);
    focal.push(...drawMotif(c.motif, mctx(fieldLike ? clearOf(z, zone(sk, 'type'), u) : z, c.motifParams.presence ?? 0.8)));
    trace.push(`${c.motif === 'glyph' ? 'a letterform' : c.motif}${c.metaphor ? ` (${c.metaphor.name})` : ''}`);
    if (c.source === 'letterform' && b.styleMotifs.length && r.chance(0.5)) focal.push(...drawMotif('blocks', mctx(around(fz.x + fz.w * 0.7, fz.y + fz.h * 0.7, fz.w * 0.5, fz.h * 0.5), 0.3)));
  }

  // a language that paints in gradients (chrome, iridescence, neon, a sunset, a sky) paints its focal forms so: the
  // largest filled forms take a gradient between its colours; a sky or sunset language also its ground
  const grad = p.colour.gradient;
  if (['metallic', 'iridescent', 'neon', 'sunset', 'sky', 'feature'].includes(grad)) {
    const stops: ColourRef[] = grad === 'metallic' ? ['paper', paints[0], 'ink'] : [paints[0], paints[1] ?? 'accent2'];
    const filled = (list: Instruction[]): Instruction[] => list.flatMap((e) => (e.op === 'group' ? filled(e.children) : 'fill' in e && typeof e.fill === 'string' ? [e] : []));
    const big = filled(focal)
      .sort((a, b) => instructionBox(b).w * instructionBox(b).h - instructionBox(a).w * instructionBox(a).h)
      .slice(0, 2);
    for (const e of big) (e as { fill: PaintRef }).fill = { linear: { angle: r.pick([90, 135, 180, 45]), stops } };
    if ((grad === 'sunset' || grad === 'sky') && el[0].op === 'rect' && !big.length) el[0] = { ...el[0], fill: { linear: { angle: 180, stops: [ground, tint(pal.accent, 0.6)] } } };
    if (big.length || grad === 'sunset' || grad === 'sky') trace.push(`painted in the language’s ${grad} gradient`);
  }

  // ── the operations, on the focal material ──
  // copies of the material (a second pass, a layer, a repeat, a mirror) only where it is light enough to copy
  const heavy = focal.length > 40;
  const ops = heavy ? c.operations.filter((o) => !['offset', 'layer', 'repeat', 'mirror'].includes(o)) : c.operations;
  if (heavy && ops.length < c.operations.length) trace.push('a dense motif left uncopied');
  if (focal.length && !focal.every((e) => e.op === 'image' && e.box.w >= W * 0.98)) {
    const box = boxAround(focal);
    if (ops.includes('rotate') && c.org !== 'axis') {
      const a = p.geometry.angularity >= 55 ? r.pick([15, -15, 30, -30, 45]) : r.pick([6, -6, 9, -9, 12]);
      focal = [{ op: 'group', box, children: focal, rotation: a, name: 'Turned' }];
      trace.push(`turned ${a}°`);
    }
    if (ops.includes('offset')) {
      behind.push({ op: 'group', box: { ...box, x: box.x + u * 1.2, y: box.y + u * 0.8 }, children: translate(recolour(focal, 'accent2'), u * 1.2, u * 0.8), blend: 'multiply', name: 'Second pass', opacity: 0.85 });
      trace.push('printed out of register');
    }
    if (ops.includes('layer')) {
      behind.push({ op: 'group', box: { ...box, x: box.x + u * 2.4, y: box.y + u * 2.4 }, children: translate(recolour(focal, paints[1] ?? 'ink'), u * 2.4, u * 2.4), name: 'Layer beneath' });
      trace.push('a layer offset beneath');
    }
    if (ops.includes('repeat')) {
      const dx = (sk.focus[0] < W / 2 ? 1 : -1) * u * r.between(3, 6);
      const dy = (sk.focus[1] < H / 2 ? 1 : -1) * u * r.between(2, 5);
      for (let k = 2; k >= 1; k--) behind.push({ op: 'group', box: { ...box, x: box.x + dx * k, y: box.y + dy * k }, children: translate(focal, dx * k, dy * k), opacity: k === 1 ? 0.45 : 0.22, name: 'Repeat' });
      trace.push('repeated in a rhythm');
    }
    if (ops.includes('mirror')) {
      const mirrored = translate(focal, W - (box.x * 2 + box.w), 0);
      behind.push({ op: 'group', box: { ...box, x: W - box.x - box.w }, children: mirrored, flipX: true, opacity: 0.55, name: 'Mirror' });
      trace.push('mirrored');
    }
    if (ops.includes('cut')) {
      // cut through the middle and the halves slid apart along the cut
      const vert = box.h > box.w;
      const at = vert ? box.y + box.h * r.between(0.38, 0.62) : box.x + box.w * r.between(0.38, 0.62);
      const slide = Math.min(W, H) * r.between(0.02, 0.05);
      const a: Box = vert ? { x: box.x - u, y: box.y - u, w: box.w + u * 2, h: at - box.y + u } : { x: box.x - u, y: box.y - u, w: at - box.x + u, h: box.h + u * 2 };
      const bb: Box = vert ? { x: box.x - u, y: at, w: box.w + u * 2, h: box.y + box.h - at + u } : { x: at, y: box.y - u, w: box.x + box.w - at + u, h: box.h + u * 2 };
      focal = [
        { op: 'group', box: a, children: focal, clip: true, name: 'Cut piece' },
        { op: 'group', box: vert ? { ...bb, x: bb.x + slide } : { ...bb, y: bb.y + slide }, children: translate(focal, vert ? slide : 0, vert ? 0 : slide), clip: true, name: 'Cut piece' },
      ];
      trace.push('cut and slid apart');
    }
    if (ops.includes('mask') && c.source !== 'image') {
      const main = focal.find((e) => e.op === 'path' && e.fill) ?? focal.find((e) => (e.op === 'ellipse' || e.op === 'prim' || e.op === 'rect') && e.fill);
      if (main) {
        const mb = instructionBox(main);
        focal.push({
          op: 'group',
          box: mb,
          children: [{ ...main, fill: '#ffffff' } as Instruction, { op: 'pattern', gen: r.pick(['halftone', 'lines', 'dots', 'stripes']), box: mb, scale: r.between(0.6, 1.2), inks: ['ink'] }],
          name: 'Patterned form',
          opacity: 0.9,
        });
        trace.push('a pattern masked into the form');
      }
    }
  }
  // a letterform behind the words' zone recedes to a tint (or an outline), so the title is never swallowed
  const tzone = zone(sk, 'type');
  const recede = (list: Instruction[]): Instruction[] =>
    list.map((e) => (e.op === 'echo' && !e.outline && tzone && intersect(e.box, tzone) ? { ...e, opacity: Math.min(e.opacity ?? 1, 0.28) } : e.op === 'group' ? { ...e, children: recede(e.children) } : e));
  focal = recede(focal);
  el.push(...behind, ...focal);

  // ── the second principle, laid over lightly ──
  if (sk2) el.push(...overlay(sk2, b, c, paints, line, r.fork('overlay'), trace));

  // the language's own pattern (or one a brief or a Board asked for), where there is room for it
  const vp = b.pattern;
  if (vp) {
    const q = zone(sk, 'quiet');
    const at = q && q.w * q.h >= W * H * 0.06 ? q : null;
    el.splice(at ? el.length : Math.max(1, el.indexOf(focal[0] ?? el[el.length - 1])), 0, { op: 'pattern', gen: null, box: at ?? fz0, inks: ['accent'], opacity: at ? 0.85 : 0.32, name: 'Pattern' });
    trace.push(`the ${vp}${at ? ' in the quiet space' : ' under the focus'}`);
  }

  // ── structure where the language is rigorous ──
  if ((p.geometry.rigidity >= 65 || ['columns', 'modular'].includes(p.space.grid)) && sk.lines.length && c.colouring !== 'split') {
    for (const [a, z] of sk.lines.slice(0, 3)) el.push({ op: 'line', from: a, to: z, color: line, width: Math.max(0.6, u * 0.3), name: 'Rule' });
    trace.push('rules drawn along the structure');
  }
  if (ops.includes('interrupt')) {
    const tz = zone(sk, 'type') ?? S;
    const y = tz.y + tz.h * r.between(0.3, 0.6);
    const h = Math.min(W, H) * r.between(0.05, 0.11);
    el.push({ op: 'rect', box: { x: -W * 0.02, y: y - h / 2, w: W * 1.04, h }, fill: paints[1] ?? 'accent2', name: 'Interruption', rotation: r.chance(0.4) ? r.pick([-4, 4, -8]) : 0 });
    trace.push('a band through the words');
  }
  if (ops.includes('echo') && c.type !== 'echo') {
    const big = Math.min(W, H) * r.between(0.3, 0.5);
    el.splice(1, 0, { op: 'echo', of: 'headline', box: { x: -big * 0.2, y: H * r.between(0.1, 0.7), w: W * 1.8, h: big * 1.2 }, size: big, color: paints[0], outline: true, opacity: 0.6, name: 'Echo of the title' });
    trace.push('the title echoed in outline behind');
  }
  // small accents in the language's geometry, where it is dense enough to want them
  if ((c.density >= 55 || b.vocabStrong) && b.styleMotifs.length && c.source !== 'geometry') {
    const n = c.density >= 75 ? 3 : b.vocabStrong ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const k = b.styleMotifs[(i + 1) % b.styleMotifs.length];
      const s = u * r.between(3, 7);
      const q = zone(sk, 'quiet');
      const at: P2 = q ? [q.x + r() * q.w, q.y + r() * q.h] : [r.between(0.1, 0.9) * W, r.between(0.1, 0.9) * H];
      el.push({ op: 'prim', kind: k.kind, params: k.params, box: around(at[0], at[1], s, s), fill: paints[(i + 1) % paints.length], name: 'Accent' });
    }
  }

  // ── the words ──
  // a gradient for the letters only from colours that read on the ground they sit on (3.2:1 each, as large type)
  const hexOf = (ref: ColourRef): string => (ref.startsWith('#') ? ref.slice(0, 7) : ((pal as unknown as Record<string, string>)[ref] ?? pal.ink));
  const groundHex = hexOf(ground);
  const readable = (['ink', 'accent', 'accent2', 'accent3', 'paper', ...paints] as ColourRef[]).filter((ref, i, all) => all.findIndex((o) => hexOf(o).toLowerCase() === hexOf(ref).toLowerCase()) === i && contrastRatio(hexOf(ref), groundHex) >= 3.2);
  // two distinct stops: a second readable colour, else the first moved toward the accent as far as it still reads
  const second =
    readable[1] ??
    [0.5, 0.4, 0.3, 0.2].map((k) => mix(hexOf(readable[0] ?? 'ink'), k > 0.35 ? pal.accent2 : pal.accent, k) as ColourRef).find((h) => contrastRatio(h, groundHex) >= 3.2 && h.toLowerCase() !== hexOf(readable[0] ?? 'ink').toLowerCase()) ??
    null;
  const typeGradient = p.type.treatments.some((x) => /gradient|chrome|metallic|iridescent/.test(x)) && readable.length && second ? ([readable[0], second] as ColourRef[]) : null;
  el.push(...typeset({ W, H, u, safe: S, sk, c, reading, headline: b.headline, minText: b.minText, r: r.fork('type'), ink: line, gradient: typeGradient }));
  return { program: { schema: PROGRAM_SCHEMA, frame: { w: W, h: H }, ground, elements: el }, sk, sk2, trace };
}

/** A zone with the words' zone taken out of it: the largest part left beside, above or below the words. */
function clearOf(z: Box, words: Box | null, u: number): Box {
  if (!words) return z;
  const hit = intersect(z, words);
  if (!hit) return z;
  const parts: Box[] = [
    { x: z.x, y: z.y, w: words.x - u * 2 - z.x, h: z.h },
    { x: words.x + words.w + u * 2, y: z.y, w: z.x + z.w - (words.x + words.w + u * 2), h: z.h },
    { x: z.x, y: z.y, w: z.w, h: words.y - u * 2 - z.y },
    { x: z.x, y: words.y + words.h + u * 2, w: z.w, h: z.y + z.h - (words.y + words.h + u * 2) },
  ].filter((b) => b.w > u * 6 && b.h > u * 6);
  const best = parts.sort((a, b) => b.w * b.h - a.w * a.h)[0];
  return best && best.w * best.h >= z.w * z.h * 0.22 ? best : z;
}

/** Instructions moved by (dx, dy) (their boxes, paths and lines). */
function translate(list: readonly Instruction[], dx: number, dy: number): Instruction[] {
  return list.map((e) => {
    switch (e.op) {
      case 'path':
        return {
          ...e,
          d: e.d.replace(
            /([MLCSQT])([^MLHVCSQTZ]*)/g,
            (_m, cmd: string, nums: string) =>
              cmd +
              nums
                .trim()
                .split(/[\s,]+/)
                .filter(Boolean)
                .map((v, i) => String(Math.round((Number(v) + (i % 2 ? dy : dx)) * 100) / 100))
                .join(' ') +
              ' ',
          ),
        };
      case 'line':
        return { ...e, from: [e.from[0] + dx, e.from[1] + dy], to: [e.to[0] + dx, e.to[1] + dy] };
      case 'group':
        return { ...e, box: { ...e.box, x: e.box.x + dx, y: e.box.y + dy }, children: translate(e.children, dx, dy) };
      default:
        return { ...e, box: { ...e.box, x: e.box.x + dx, y: e.box.y + dy } } as Instruction;
    }
  });
}

/** The designer's pictures, treated as the concept says. */
function pictures(b: BuildCtx, c: CreativeConcept, sk: Skeleton, fz: Box, paints: ColourRef[], r: Rng, trace: string[]): Instruction[] {
  const { W, H, u } = b;
  const out: Instruction[] = [];
  const frameBox = intersect(fz, { x: -W * 0.2, y: -H * 0.2, w: W * 1.4, h: H * 1.4 }) ?? fz;
  switch (c.imagery) {
    case 'full':
      out.push({ op: 'image', asset: 0, box: { x: 0, y: 0, w: W, h: H }, name: 'Picture', focus: { x: Math.round(c.focal.x * 100), y: Math.round(c.focal.y * 100) } });
      {
        // a scrim where the words go, so they read on the picture without a plate
        const tz = zone(sk, 'type');
        if (tz)
          out.push({
            op: 'rect',
            box: { x: 0, y: tz.y - u * 3, w: W, h: tz.h + u * 6 + (zone(sk, 'details') && zone(sk, 'details')!.y > tz.y ? zone(sk, 'details')!.y + zone(sk, 'details')!.h - (tz.y + tz.h) : 0) },
            fill: 'ink',
            opacity: 0.62,
            name: 'Scrim',
            blend: 'multiply',
          });
      }
      trace.push('the picture full-bleed, a scrim under the words');
      break;
    case 'framed': {
      const pad = u * r.between(2, 4);
      out.push({ op: 'rect', box: frameBox, fill: 'paper', name: 'Mat', fx: [{ kind: 'drop-shadow', params: { dy: 6, blur: 18, opacity: 18 } }] });
      out.push({ op: 'image', asset: 0, box: { x: frameBox.x + pad, y: frameBox.y + pad, w: frameBox.w - pad * 2, h: frameBox.h - pad * 2 }, name: 'Picture' });
      trace.push('the picture framed like a print');
      break;
    }
    case 'masked': {
      const shape = c.motif ? MOTIF_TRAITS[c.motif] : null;
      const C: P2 = [frameBox.x + frameBox.w / 2, frameBox.y + frameBox.h / 2];
      let mask: Extract<Instruction, { op: 'image' }>['mask'];
      if (shape && shape.curvature >= 70 && r.chance(0.6)) {
        const n = 12;
        const pts: P2[] = Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2;
          const k = 1 + Math.sin(i * 1.7 + c.seed) * 0.12;
          return [C[0] + Math.cos(a) * frameBox.w * 0.5 * k, C[1] + Math.sin(a) * frameBox.h * 0.5 * k];
        });
        mask = { path: segsToD(smoothSegs(pts, true)) };
      } else if (shape && shape.rigidity >= 70 && r.chance(0.6)) {
        const pts: P2[] = [
          [frameBox.x + frameBox.w * r.between(0, 0.2), frameBox.y],
          [frameBox.x + frameBox.w, frameBox.y + frameBox.h * r.between(0, 0.25)],
          [frameBox.x + frameBox.w * r.between(0.8, 1), frameBox.y + frameBox.h],
          [frameBox.x, frameBox.y + frameBox.h * r.between(0.7, 1)],
        ];
        mask = { path: segsToD(polySegs(pts, true)) };
      } else mask = r.chance(0.5) ? { ellipse: true } : { prim: 'arch' };
      out.push({ op: 'image', asset: 0, box: frameBox, mask, name: 'Picture' });
      trace.push('the picture masked into a form');
      break;
    }
    case 'cut': {
      const n = r.int(3, 6);
      const vert = frameBox.w >= frameBox.h;
      const slide = Math.min(W, H) * r.between(0.015, 0.04);
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const box = vert
          ? { x: frameBox.x + frameBox.w * t0, y: frameBox.y + (i % 2 ? slide : -slide), w: frameBox.w / n - u * 0.6, h: frameBox.h }
          : { x: frameBox.x + (i % 2 ? slide : -slide), y: frameBox.y + frameBox.h * t0, w: frameBox.w, h: frameBox.h / n - u * 0.6 };
        out.push({ op: 'image', asset: 0, box, crop: vert ? { x: t0, y: 0, w: 1 / n, h: 1 } : { x: 0, y: t0, w: 1, h: 1 / n }, name: 'Strip of the picture' });
      }
      trace.push(`the picture cut into ${n} strips`);
      break;
    }
    default: {
      const ib = { x: frameBox.x + frameBox.w * 0.08, y: frameBox.y + frameBox.h * 0.08, w: frameBox.w * 0.84, h: frameBox.h * 0.84 };
      out.push({ op: 'image', asset: 0, box: ib, name: 'Picture', rotation: r.chance(0.35) ? r.pick([-3, 3, -5]) : 0, fx: [{ kind: 'drop-shadow', params: { dy: 6, blur: 16, opacity: 20 } }] });
      trace.push('the picture set as an inset');
    }
  }
  // more pictures (a collage): smaller, turned, overlapping the first
  if (b.images > 1 && (c.emphasis === 'collage' || c.imagery === 'cut')) {
    for (let i = 1; i < Math.min(4, b.images); i++) {
      const s = Math.min(W, H) * r.between(0.22, 0.34);
      const at: P2 = [clamp(fz.x + fz.w * r.between(0, 1), s / 2, W - s / 2), clamp(fz.y + fz.h * r.between(0, 1), s / 2, H - s / 2)];
      out.push({ op: 'image', asset: i, box: around(at[0], at[1], s, s * r.between(0.7, 1.2)), rotation: r.between(-8, 8), name: 'Picture', fx: [{ kind: 'drop-shadow', params: { dy: 5, blur: 14, opacity: 22 } }] });
    }
    trace.push('the other pictures layered over it');
  }
  void paints;
  void sk;
  return out;
}

/** The second principle drawn lightly over the first: its curve, its rings, its scatter, its rules. */
function overlay(sk2: Skeleton, b: BuildCtx, c: CreativeConcept, paints: ColourRef[], line: ColourRef, r: Rng, trace: string[]): Instruction[] {
  const { W, H, u } = b;
  const out: Instruction[] = [];
  const w = Math.max(0.6, u * 0.4);
  if (sk2.path && sk2.path.length > 2) {
    out.push({ op: 'path', d: segsToD(smoothSegs(sk2.path.filter((_, i) => i % 3 === 0))), fill: null, stroke: { color: paints[1] ?? line, width: w * 2.2, cap: 'round' }, name: 'Line of flow' });
    trace.push('a line of flow across it');
  } else if (sk2.path) {
    out.push({ op: 'line', from: sk2.path[0], to: sk2.path[1], color: line, width: w, name: 'Axis', opacity: 0.7 });
    trace.push('an axis through it');
  }
  if (sk2.centre && sk2.radii.length) {
    for (const rad of sk2.radii.slice(0, 4)) out.push({ op: 'ellipse', box: around(sk2.centre[0], sk2.centre[1], rad * 2), fill: null, stroke: { color: line, width: w }, name: 'Ring', opacity: 0.75 });
    trace.push('rings about a second centre');
  }
  if (sk2.points.length) {
    const kinds = b.styleMotifs.length ? b.styleMotifs : [{ kind: 'circle', params: {} }];
    sk2.points.slice(0, 26).forEach((q, i) => {
      const s = u * r.between(1.2, 3.4);
      const k = kinds[i % kinds.length];
      out.push({ op: 'prim', kind: k.kind, params: k.params, box: around(q[0], q[1], s, s), fill: paints[i % paints.length], name: 'Point' });
    });
    trace.push('a scatter of small figures');
  }
  if (sk2.lines.length && !sk2.path) {
    for (const [a, z] of sk2.lines.slice(0, 3)) out.push({ op: 'line', from: a, to: z, color: line, width: w * 0.8, name: 'Rule', opacity: 0.8 });
    trace.push('rules of a second structure');
  }
  if (sk2.planes.length) {
    const pl = sk2.planes[0];
    out.push({ op: 'rect', box: pl.box, fill: paints[1] ?? 'accent2', rotation: pl.rotation, opacity: 0.32, name: 'Plane' });
    trace.push('a translucent plane');
  }
  if (sk2.frame) {
    const f = sk2.frame.box;
    const k = u * 5;
    for (const [x, y, sx, sy] of [
      [f.x, f.y, 1, 1],
      [f.x + f.w, f.y, -1, 1],
      [f.x, f.y + f.h, 1, -1],
      [f.x + f.w, f.y + f.h, -1, -1],
    ] as const)
      out.push({ op: 'path', d: `M${x + sx * k} ${y} L${x} ${y} L${x} ${y + sy * k}`, fill: null, stroke: { color: line, width: w }, name: 'Corner mark' });
    trace.push('corner marks');
  }
  if (sk2.mass) {
    out.push({ op: 'ellipse', box: sk2.mass, fill: paints[2] ?? paints[0], opacity: 0.9, name: 'Mass' });
    trace.push('a mass at the edge');
  }
  void c;
  void W;
  void H;
  return out;
}

export type { PaintRef };
