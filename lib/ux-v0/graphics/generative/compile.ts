// lib/ux-v0/graphics/generative/compile.ts — the Design Program made into the document: each instruction becomes a
// native, editable object (shapes and Bézier-free paths in their own boxes, primitives of the geometry registry, text
// with its path or turn, the brief's details stacked, the designer's pictures cropped or masked, procedural patterns,
// groups with clipping and masks), colours resolved from the palette, effects from the effect registry. Then the
// solver holds the words to the hard rules, and every 'auto' colour is chosen by what actually lies beneath it.

import type { Ctx, Kit } from '../compose';
import { contrastRatio } from '../../../ux/audit';
import { newId, type Node, type TextNode } from '../doc';
import { effectDefaults, type Effect } from '../effects';
import type { Gradient } from '../paint';
import { ensureContrast } from '../../spec';
import { fitText, info, makeCC, pattern as patternOf, photo, setHeight, solve, unresolved, widestWord, type CC } from '../composition/kit';
import type { CompositionPlan } from '../composition/schema';
import { ellipse, pathNode } from '../styles/constructions-kit';
import { hasOpportunity, type CreativeReading } from './reading';
import { type ColourRef, type DesignProgram, type FxRef, type Instruction, type PaintRef } from './program';
import type { Palette } from './construct';
import { parseD, segsBox, segsIn100, type Box } from './util';
import { fitToPath, layoutText } from '../text';

export interface Compiled {
  nodes: Node[];
  /** what the hard rules could not settle */
  unresolved: string[];
}

/** The composition kit's context, for the engine (its palette, its solver, its helpers), without a family. */
export function engineCC(k: Kit, x: Ctx, seed: number, density: number, experimentation: number, symmetry: number): CC {
  const plan = { family: 'generative', params: {}, seed, typography: { scale: 50 }, density, experimentation, symmetry } as unknown as CompositionPlan;
  return makeCC(k, x, plan);
}

/** The palette the program's colour roles name. */
export function paletteOf(cc: CC): Palette {
  return { ground: cc.pal.ground, ink: cc.pal.ink, accent: cc.pal.accent, accent2: cc.pal.accent2, accent3: cc.pal.accent3, muted: cc.pal.muted, paper: cc.x.dir.tokens.colors.background };
}

const AUTO = '#00000001';

/** The program compiled (see the head of this file). */
export function compileProgram(cc: CC, prog: DesignProgram, reading: CreativeReading, opts: { keepClear?: boolean } = {}): Compiled {
  const pal = paletteOf(cc);
  const col = (c: ColourRef | undefined, fallback = pal.ink): string => {
    if (!c) return fallback;
    if (c === 'auto') return AUTO;
    if (c.startsWith('#')) return c.slice(0, 7);
    return (pal as unknown as Record<string, string>)[c] ?? fallback;
  };
  const paintOf = (p: PaintRef | null): string | Gradient | null => {
    if (p === null) return null;
    if (typeof p === 'string') return col(p);
    if ('linear' in p) return { type: 'linear', angle: p.linear.angle, stops: p.linear.stops.map((s, i, all) => ({ at: Math.round((i / Math.max(1, all.length - 1)) * 100), color: col(s) })) };
    return { type: 'radial', angle: 0, cx: 0.5, cy: 0.5, stops: p.radial.stops.map((s, i, all) => ({ at: Math.round((i / Math.max(1, all.length - 1)) * 100), color: col(s) })) };
  };
  const fxOf = (list?: FxRef[]): Effect[] | undefined => {
    if (!list?.length) return undefined;
    const raw = list
      .map((f) => {
        const e = effectDefaults(f.kind);
        return e ? { ...e, params: { ...e.params, ...(f.params ?? {}) } } : null;
      })
      .filter((e): e is Effect => !!e);
    return raw.length ? cc.k.paletteFx(cc.x, raw) : undefined;
  };
  const common = (e: Instruction): Record<string, unknown> => ({
    ...(e.name ? { name: e.name } : {}),
    ...(e.rotation ? { rotation: Math.round(e.rotation * 100) / 100 } : {}),
    ...(e.opacity !== undefined ? { opacity: e.opacity } : {}),
    ...(e.blend ? { blend: e.blend } : {}),
    ...(fxOf(e.fx) ? { effects: fxOf(e.fx) } : {}),
    ...(e.skewX ? { skewX: e.skewX } : {}),
    ...(e.flipX ? { flipX: true } : {}),
    ...(e.flipY ? { flipY: true } : {}),
    ...(e.decorative ? { decorative: true } : {}),
  });
  const strokeOf = (s?: { color: ColourRef; width: number; dash?: number[]; cap?: 'butt' | 'round' | 'square' }) =>
    s ? { stroke: { color: col(s.color), width: Math.max(0.3, s.width), ...(s.dash?.length ? { dash: s.dash } : {}), ...(s.cap ? { cap: s.cap } : {}), join: 'round' } } : {};
  const meta = cc.k.metaLines(cc.x);
  const c = cc.x.brief.content;
  const words = c.headline.split(/\s+/).filter(Boolean);
  const autos = new Set<TextNode>();

  const one = (e: Instruction): Node[] => {
    switch (e.op) {
      case 'rect':
        return [cc.k.rect(cc.x, e.role === 'background' ? 'background' : 'motif', e.box, paintOf(e.fill), { ...(e.radius ? { radius: e.radius } : {}), ...strokeOf(e.stroke), ...common(e) })];
      case 'ellipse':
        return [ellipse(cc.x, e.box, paintOf(e.fill), { ...strokeOf(e.stroke), ...common(e) })];
      case 'prim':
        return [cc.k.primNode(cc.x, 'motif', cc.k.primOf(e.kind, e.params ?? {}), e.box, paintOf(e.fill), { ...strokeOf(e.stroke), ...common(e) })];
      case 'path': {
        const segs = parseD(e.d);
        if (!segs) return [];
        const box = segsBox(segs, 0);
        // a path with no height (a straight run) still needs a box to be drawn in
        const b: Box = { x: box.x, y: box.y, w: Math.max(1, box.w), h: Math.max(1, box.h) };
        return [pathNode(cc.x, b, segsIn100(segs, b), paintOf(e.fill), { ...strokeOf(e.stroke), ...common(e) })];
      }
      case 'line': {
        const len = Math.max(1, Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]));
        const deg = (Math.atan2(e.to[1] - e.from[1], e.to[0] - e.from[0]) * 180) / Math.PI;
        const h = Math.max(2, e.width * 3);
        return [
          {
            id: newId('s'),
            type: 'shape',
            shape: 'line',
            role: 'motif',
            name: 'Line',
            fill: null,
            stroke: { color: col(e.color), width: Math.max(0.4, e.width), ...(e.dash?.length ? { dash: e.dash } : {}), ...(e.cap ? { cap: e.cap } : {}) },
            x: (e.from[0] + e.to[0]) / 2 - len / 2,
            y: (e.from[1] + e.to[1]) / 2 - h / 2,
            w: len,
            h,
            rotation: Math.round(deg * 100) / 100,
            opacity: 1,
            ...common(e),
          } as Node,
        ];
      }
      case 'text': {
        const role = e.content === 'brand' ? 'logo' : e.content;
        const text = e.content === 'headline' ? c.headline : e.content === 'subhead' ? (c.subhead ?? '') : e.content === 'meta' ? meta.join('\n') : e.content === 'cta' ? (c.cta ? `${c.cta} →` : '') : (c.brand ?? '');
        if (!text) return [];
        const display = role === 'headline';
        const s: Partial<TextNode> = {
          ...(e.size !== undefined ? { size: e.size } : display ? {} : { size: Math.max(cc.k.minText(cc.x), cc.u * 3) }),
          ...(e.align ? { align: e.align } : {}),
          ...(e.valign ? { valign: e.valign } : {}),
          ...(e.color ? { color: col(e.color) } : {}),
          ...(e.font ? { font: e.font === 'display' ? cc.x.dir.tokens.fonts.display : cc.x.dir.tokens.fonts.body } : {}),
          ...(e.weight ? { weight: e.weight } : {}),
          ...(e.tracking !== undefined ? { tracking: e.tracking } : {}),
          ...(e.lineHeight ? { lineHeight: e.lineHeight } : {}),
          ...(e.case ? { case: e.case } : {}),
          ...(e.italic ? { italic: true } : {}),
          ...(e.vertical ? { vertical: true } : {}),
        };
        let box = e.box;
        let path: TextNode['path'] | undefined;
        if (e.path?.kind === 'custom') {
          const segs = parseD(e.path.d);
          if (segs) {
            const pb = segsBox(segs, 0);
            box = { x: pb.x, y: pb.y, w: Math.max(4, pb.w), h: Math.max(4, pb.h) };
            path = { kind: 'custom', bend: 0, start: 50, d: segsIn100(segs, box) };
          }
        } else if (e.path?.kind === 'circle') path = { kind: 'circle', bend: 0, start: e.path.start, ...(e.path.side ? { side: e.path.side } : {}) };
        else if (e.path?.kind === 'arc') path = { kind: 'arc', bend: e.path.bend, start: 50 };
        else if (e.path?.kind === 'wave') path = { kind: 'wave', bend: 0, start: 50, cycles: e.path.cycles, amplitude: e.path.amplitude };
        const t = cc.k.text(cc.x, role, text, box, { ...s, ...(path ? { path } : {}), ...(e.rotation ? { rotation: e.rotation } : {}) });
        Object.assign(t, common(e));
        if (e.outline) Object.assign(t, { fill: null, stroke: { color: t.color === AUTO ? pal.ink : t.color, width: Math.max(0.8, t.size * 0.025) } });
        else if (e.gradient?.length) t.fill = { type: 'linear', angle: 180, stops: e.gradient.map((g, i, all) => ({ at: Math.round((i / Math.max(1, all.length - 1)) * 100), color: col(g) })) };
        if (e.accentWord !== undefined && words[e.accentWord]) {
          let at = 0;
          for (let i = 0; i < e.accentWord; i++) at = c.headline.indexOf(words[i], at) + words[i].length;
          const start = c.headline.indexOf(words[e.accentWord], at);
          if (start >= 0) t.runs = [{ start, end: start + words[e.accentWord].length, color: pal.accent }];
        }
        // the box trimmed to the words as set (not for a turned or path-set line: the solver reads their footprint)
        if (!path && !t.rotation && !t.vertical) {
          const need = setHeight(cc, t) + cc.u * 0.6;
          const h = Math.min(box.h, need);
          t.y = t.valign === 'middle' ? box.y + (box.h - h) / 2 : t.valign === 'bottom' ? box.y + box.h - h : box.y;
          t.h = h;
        }
        // words set along a path are as long as the path allows, measured (never longer: they would be cut)
        // (measured as the checks measure it: the same path length, the same words as shown, tracking included)
        if (path) t.size = Math.max(cc.k.minText(cc.x), fitToPath(t, cc.x.measure, cc.k.minText(cc.x)) * 0.97);
        if (t.color === AUTO) autos.add(t);
        return [t];
      }
      case 'echo': {
        const num = hasOpportunity(reading, 'numeral')?.value ?? '';
        const initial = c.headline.match(/[A-Za-z0-9]/)?.[0] ?? c.headline.trim()[0] ?? '';
        const text = e.of === 'headline' ? c.headline : e.of === 'numeral' ? num : e.of === 'ampersand' ? '&' : e.of === 'word' ? (words[e.word ?? 0] ?? words[0] ?? '') : initial;
        if (!text) return [];
        const t = cc.k.text(cc.x, 'label', text, e.box, {
          size: e.size,
          font: e.font === 'body' ? cc.x.dir.tokens.fonts.body : cc.x.dir.tokens.fonts.display,
          weight: e.weight ?? Math.max(600, cc.x.dir.look.weight),
          align: e.align ?? 'left',
          valign: 'top',
          lineHeight: 0.84,
          tracking: -20,
          color: col(e.color, pal.accent),
          ...(cc.x.dir.look.case === 'upper' ? { case: 'upper' as const } : {}),
        });
        Object.assign(t, common(e), { decorative: true, name: e.name ?? 'Echo' });
        if (e.outline) Object.assign(t, { fill: null, stroke: { color: col(e.color, pal.accent), width: Math.max(1, e.size * 0.012) } });
        if (e.of === 'numeral') fitText(cc, t, e.size);
        return [t];
      }
      case 'details': {
        const nodes = info(cc, e.box, {
          align: e.align,
          ...(e.fromFoot ? { fromFoot: true } : {}),
          ...(e.scale ? { scale: e.scale } : {}),
          ...(e.color && e.color !== 'auto' ? { color: col(e.color) } : {}),
          ...(e.sub === false ? { sub: false } : {}),
        });
        if (e.color === 'auto') for (const n of nodes) if (n.type === 'text') autos.add(n);
        return nodes;
      }
      case 'image': {
        const mask = e.mask && 'ellipse' in e.mask ? 'ellipse' : e.mask && 'prim' in e.mask ? e.mask.prim : undefined;
        if (e.mask && 'path' in e.mask) {
          const segs = parseD(e.mask.path);
          const asset = cc.images[e.asset];
          if (!segs || !asset) return [];
          const cut = pathNode(cc.x, { x: 0, y: 0, w: e.box.w, h: e.box.h }, segsIn100(segs, e.box), '#000000', { name: 'Cut' });
          return [
            {
              id: newId('g'),
              type: 'group',
              name: e.name ?? 'Masked picture',
              mask: 'alpha',
              x: e.box.x,
              y: e.box.y,
              w: e.box.w,
              h: e.box.h,
              rotation: e.rotation ?? 0,
              opacity: e.opacity ?? 1,
              children: [cut, { ...cc.k.image(cc.x, asset, { x: 0, y: 0, w: e.box.w, h: e.box.h }), name: 'Picture', ...(e.crop ? { crop: e.crop } : {}), ...(e.focus ? { focus: e.focus } : {}) }],
            } as Node,
          ];
        }
        const pic = photo(cc, e.asset, e.box, { ...(mask ? { mask } : {}), ...(e.crop ? { crop: e.crop } : {}), s: { ...common(e), ...(e.focus ? { focus: e.focus } : {}) } });
        return pic ? [pic] : [];
      }
      case 'pattern':
        return [patternOf(cc, e.gen, e.box, { ...(e.params ?? {}), ...(e.scale ? { scale: e.scale } : {}) }, e.inks, e.opacity ?? 1, { ...common(e), ...(e.bound ? { bound: e.bound } : {}) })];
      case 'group': {
        const kids = e.children.flatMap(one).map((n) => ({ ...n, x: n.x - e.box.x, y: n.y - e.box.y }) as Node);
        if (!kids.length) return [];
        return [
          {
            id: newId('g'),
            type: 'group',
            name: e.name ?? 'Group',
            x: e.box.x,
            y: e.box.y,
            w: e.box.w,
            h: e.box.h,
            rotation: e.rotation ?? 0,
            opacity: e.opacity ?? 1,
            children: kids,
            ...(e.clip ? { clip: true } : {}),
            ...(e.blend ? { blend: e.blend } : {}),
            ...(e.flipX ? { flipX: true } : {}),
            ...(e.decorative ? { decorative: true } : {}),
            ...(fxOf(e.fx) ? { effects: fxOf(e.fx) } : {}),
          } as Node,
        ];
      }
    }
  };

  // what lands wholly outside the frame would never show: it is not kept (a document of only what is seen), inside
  // groups too (a child's place is its group's plus its own)
  const shows = (n: Node, ox: number, oy: number): boolean => {
    if (n.type === 'text' && !n.decorative) return true;
    const f = footOf(n);
    return f.x + ox < cc.W && f.y + oy < cc.H && f.x + ox + f.w > 0 && f.y + oy + f.h > 0;
  };
  const prune = (list: Node[], ox: number, oy: number): Node[] =>
    list
      .filter((n) => shows(n, ox, oy))
      .map((n) => (n.type === 'group' && !n.rotation && !n.mask ? ({ ...n, children: prune(n.children, ox + n.x, oy + n.y) } as Node) : n))
      .filter((n) => n.type !== 'group' || n.children.length > 0);
  let nodes = prune(prog.elements.flatMap(one), 0, 0);
  // the hard rules for the words (inside the safe area, never broken mid-word, never over each other)
  for (const t of nodes)
    if (t.type === 'text' && !t.decorative && !t.path && !t.rotation) {
      const wide = widestWord(cc, t);
      if (wide > t.w) t.w = Math.min(cc.safe.w, wide + cc.u);
    }
  nodes = solve(cc, nodes);
  // small figures never sit over the words: a mark, a dash or a node crossing a title is clutter, not design (masses,
  // fields and planes stay: the words' colour is chosen for them below)
  if (opts.keepClear !== false) {
    const frameArea = cc.W * cc.H;
    const wordBoxes = nodes.filter((n): n is TextNode => n.type === 'text' && !n.decorative && !!n.role && ['headline', 'subhead', 'meta', 'cta', 'logo'].includes(n.role)).map((t) => footOf(t));
    nodes = nodes.filter((n) => {
      if (n.type === 'text' || n.role === 'background' || n.decorative) return true;
      const f = footOf(n);
      const big = f.w * f.h > frameArea * 0.12 || /^(Field|Band|Plane|Top plane|Mass|Ground|Mat|Picture|Masked picture|Strip of the picture|Interruption|Frame|Arch frame|Broken frame|Inner frame|Cut piece|Turned|Scrim)$/.test(n.name ?? '');
      if (big) return true;
      return !wordBoxes.some((w) => {
        const ox = Math.max(0, Math.min(w.x + w.w, f.x + f.w) - Math.max(w.x, f.x));
        const oy = Math.max(0, Math.min(w.y + w.h, f.y + f.h) - Math.max(w.y, f.y));
        return ox * oy > Math.min(w.w * w.h, Math.max(1, f.w * f.h)) * 0.06;
      });
    });
  }
  // each 'auto' colour by what lies beneath it; where the words straddle grounds no one colour reads on, they are set
  // on a plate of the paper (a band behind the line), so they read everywhere without a later repair
  for (const t of autos) t.color = readableOn(cc, nodes, t, pal);
  const plates: [TextNode, Node][] = [];
  for (const t of nodes) {
    if (t.type !== 'text' || t.decorative || !t.role || !['headline', 'subhead', 'meta', 'cta', 'logo'].includes(t.role) || t.path) continue;
    const under = fillsBeneath(nodes, t, true, t.rotation ? undefined : wordsBoxOf(cc, t)).filter((f) => f && f !== 'image');
    if (under.length < 2) continue;
    const need = t.role === 'headline' && t.size >= cc.u * 4 ? 3 : 4.5;
    if (Math.min(...under.map((f) => contrastRatio(t.color, f))) >= need) continue;
    const plateFill = [pal.paper, pal.ground, pal.ink].find((f) => contrastRatio(t.color, f) >= need) ?? pal.paper;
    if (contrastRatio(t.color, plateFill) < need) t.color = contrastRatio(pal.ink, plateFill) >= contrastRatio(pal.paper, plateFill) ? pal.ink : pal.paper;
    const wb = wordsBoxOf(cc, t);
    const pad = cc.u * 1.4;
    plates.push([t, cc.k.rect(cc.x, 'motif', { x: wb.x - pad, y: wb.y - pad * 0.6, w: wb.w + pad * 2, h: wb.h + pad * 1.2 }, plateFill, { name: 'Plate', ...(t.rotation ? { rotation: t.rotation } : {}) })]);
  }
  for (const [t, plate] of plates) nodes.splice(nodes.indexOf(t), 0, plate);
  // an accented word reads on the same ground as the rest (else another of the palette that does, else plain)
  for (const t of nodes) {
    if (t.type !== 'text' || !t.runs?.length) continue;
    const under = fillsBeneath(nodes, t).filter((f) => f && f !== 'image');
    const ground0 = under.length ? under : [cc.x.ground];
    const reads = (colour: string) => Math.min(...ground0.map((f) => contrastRatio(colour, f))) >= 3 && contrastRatio(colour, t.color) >= 1.6;
    t.runs = t.runs
      .map((run) => {
        if (!run.color || reads(run.color)) return run;
        const alt = [pal.accent, pal.accent2, pal.accent3, pal.ink, pal.paper].find(reads);
        return alt ? { ...run, color: alt } : null;
      })
      .filter((run): run is NonNullable<typeof run> => !!run);
    if (!t.runs.length) delete t.runs;
  }
  return { nodes, unresolved: unresolved(cc, nodes) };
}

/** The box the words occupy as set (their lines, aligned within the node's box). */
function wordsBoxOf(cc: CC, t: TextNode): Box {
  const l = layoutText({ ...t, autoHeight: false }, cc.x.measure);
  const w = Math.min(t.w, l.widest);
  const h = Math.min(t.h, l.height);
  const x = t.align === 'center' ? t.x + (t.w - w) / 2 : t.align === 'right' ? t.x + t.w - w : t.x;
  const y = t.valign === 'middle' ? t.y + (t.h - h) / 2 : t.valign === 'bottom' ? t.y + t.h - h : t.y;
  return { x, y, w, h };
}

/** A node's footprint, turned when it is turned. */
function footOf(n: Node): Box {
  if (!n.rotation) return { x: n.x, y: n.y, w: n.w, h: n.h };
  const a = (Math.abs(n.rotation) % 180) * (Math.PI / 180);
  const w = Math.abs(n.w * Math.cos(a)) + Math.abs(n.h * Math.sin(a));
  const h = Math.abs(n.w * Math.sin(a)) + Math.abs(n.h * Math.cos(a));
  return { x: n.x + n.w / 2 - w / 2, y: n.y + n.h / 2 - h / 2, w, h };
}

/** The fills beneath a text's box (sampled at five points), in paint order: what the words must read on. */
export function fillsBeneath(nodes: readonly Node[], t0: Node, fineGrid = false, box?: Box): string[] {
  const i = nodes.indexOf(t0);
  const t = box ? { ...t0, ...box } : t0;
  // five points across the box; a text set along a path or turned is sampled on a finer grid (it crosses more)
  const fine = fineGrid || (t.type === 'text' && (!!(t as TextNode).path || !!t.rotation));
  const pts: [number, number][] = fine
    ? [0.1, 0.3, 0.5, 0.7, 0.9].flatMap((fx) => [0.25, 0.5, 0.75].map((fy) => [t.x + t.w * fx, t.y + t.h * fy] as [number, number]))
    : [
        [t.x + t.w / 2, t.y + t.h / 2],
        [t.x + t.w * 0.15, t.y + t.h * 0.3],
        [t.x + t.w * 0.85, t.y + t.h * 0.3],
        [t.x + t.w * 0.15, t.y + t.h * 0.75],
        [t.x + t.w * 0.85, t.y + t.h * 0.75],
      ];
  const out: string[] = [];
  for (const [px, py] of pts) {
    let fill: string | null = null;
    for (let j = (i < 0 ? nodes.length : i) - 1; j >= 0; j--) {
      const n = nodes[j];
      if (n.hidden || (n.opacity ?? 1) < 0.5) continue;
      // a solid letterform or echo behind the words counts as what they sit on; the words themselves do not
      if (n.type === 'text' && !(n.decorative && (n as TextNode).fill !== null && px >= n.x && px <= n.x + n.w && py >= n.y && py <= n.y + n.h)) continue;
      if (n.type === 'text') {
        fill = (n as TextNode).color.slice(0, 7);
        break;
      }
      const inBox = px >= n.x && px <= n.x + n.w && py >= n.y && py <= n.y + n.h;
      if (!inBox || n.rotation) continue;
      if (n.type === 'image') {
        fill = 'image';
        break;
      }
      if (n.type === 'shape' && typeof n.fill === 'string' && (n.shape === 'rect' || n.role === 'background')) {
        fill = n.fill.slice(0, 7);
        break;
      }
    }
    out.push(fill ?? '');
  }
  return out;
}

/** A colour for words that reads on everything beneath them: ink or ground or paper, whichever reads best. */
function readableOn(cc: CC, nodes: readonly Node[], t: TextNode, pal: Palette): string {
  const under = fillsBeneath(nodes, t).map((f) => (f === '' ? cc.x.ground : f));
  const solid = under.filter((f) => f !== 'image');
  const large = t.role === 'headline' && t.size >= cc.u * 4;
  const need = large ? 3 : 4.5;
  if (!solid.length) return pal.paper;
  // the system's own colours first (so a Board's token change reaches these words), then the composition's palette;
  // a colour moved off the palette only when none reads
  const tk = cc.x.dir.tokens.colors;
  const candidates = [tk.text, tk.background, tk.accentText, tk.surface, pal.ink, pal.ground, pal.paper, cc.x.accentInk].filter((c, i, all) => /^#[0-9a-f]{6}$/i.test(c) && all.findIndex((o) => o.toLowerCase() === c.toLowerCase()) === i);
  const reads = candidates.find((cand) => Math.min(...solid.map((f) => contrastRatio(cand, f))) >= need);
  if (reads) return reads;
  let best = candidates[0];
  let bestMin = -1;
  for (const cand of candidates) {
    const m = Math.min(...solid.map((f) => contrastRatio(cand, f)));
    if (m > bestMin) ((bestMin = m), (best = cand));
  }
  return ensureContrast(best, solid[0], need);
}
