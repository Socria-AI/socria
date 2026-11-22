// lib/ux-v0/strategy.ts — the compositional strategy: how a design composes, decided before it is generated.
//
// The order is the mandate's: the direction decides the design, the design the composition, the composition the
// shapes. Before a page is written, its composition is decided from what the direction already holds — its shape
// system (lib/ux-v0/form.ts), its Creative DNA, the designer's words as read (lib/ux-v0/interpret.ts), the kind of
// thing being made and what in it must simply work. The strategy says:
//
//   axis        the spatial logic: a broken orthogonal grid, a diagonal cascade, about a centre, spread across the
//               field, or in layers — each a placement procedure the composer (lib/ux-v0/composer.ts) runs on the
//               part's own content, its numbers drawn from the traits, so no two designs share a layout
//   grid        how strictly it is kept: strict, broken, free; overlap and bleed allowed, how much air
//   type        typography's role in the structure: structural (display type as architecture), editorial, quiet or
//               functional; vertical labels, a tilt, outline numerals, words wrapping a shape, a weight sweep
//   pictures    shaped (cut to the system's shapes), fragmented, cropped hard, framed, or plain (shown whole)
//   navigation  a bar, an index of chapters, a rail at the left edge, a menu; the narrative linear or in chapters
//   recompose   how many parts beyond the opening it composes itself (none for a design that asked for nothing)
//   keep        what stays conventional because it has to work (a booking, a form, prices, an app's screen)
//   avoid       what it may not fall back on
//
// Each decision is said with its reason. The generator is told the strategy (as a direction it composes within,
// inventing its own arrangements), and it is held in code after generation (lib/ux-v0/compose-hold.ts) for the parts
// the strategy composes — so the direction is never an attractive document the page ignores.

import type { CreativeReading } from './interpret';
import { describeForm, formExamples, type FormSystem } from './form';

export const AXES = ['orthogonal', 'diagonal', 'radial', 'scattered', 'layered'] as const;
export type Axis = (typeof AXES)[number];
export const AXIS_LABEL: Record<Axis, string> = {
  orthogonal: 'a broken orthogonal grid',
  diagonal: 'a diagonal cascade',
  radial: 'about a centre',
  scattered: 'spread across the field',
  layered: 'in layers',
};
export const TYPE_ROLES = ['structural', 'editorial', 'quiet', 'functional'] as const;
export const IMAGE_TREATMENTS = ['shaped', 'fragmented', 'cropped', 'framed', 'plain'] as const;
export const NAV_STRATEGIES = ['bar', 'index', 'rail', 'menu'] as const;

export interface CompositionStrategy {
  axis: Axis;
  /** every logic, best first: the parts a page composes take them in turn, so no two read alike */
  ranked: Axis[];
  grid: 'strict' | 'broken' | 'free';
  balance: 'start' | 'end' | 'alternating';
  /** 0–100 */
  overlap: number;
  bleed: number;
  air: number;
  type: { role: (typeof TYPE_ROLES)[number]; vertical: boolean; rotate: number; outline: boolean; wrap: boolean; vary: boolean };
  images: (typeof IMAGE_TREATMENTS)[number];
  nav: (typeof NAV_STRATEGIES)[number];
  narrative: 'linear' | 'chapters';
  /** grounds of another tone meet along an edge of the design's shapes */
  edges: boolean;
  /** parts beyond the opening it composes itself */
  recompose: number;
  keep: string[];
  avoid: string[];
  said: string[];
  seed: number;
}

/** What must work as it is, whatever the strategy: composed by the library, never recomposed. */
export const FUNCTIONAL_KINDS = ['booking', 'form', 'pricing', 'configurator', 'scene', 'chart', 'table', 'faq', 'app-header', 'app-nav', 'feed', 'filters', 'gallery'] as const;

export interface StrategyInput {
  form: FormSystem;
  /** the Creative DNA's values (50 where it says nothing) */
  dna?: Partial<Record<'restraint' | 'composition' | 'typography' | 'motion' | 'density' | 'imagery' | 'information', number>>;
  reading?: Pick<CreativeReading, 'qualities' | 'restrictions' | 'refusals'> | null;
  words?: string;
  look: { grid: string; frame: string; buttons?: string; motifs?: readonly string[]; motionFeel?: string };
  /** what is being made (lib/ux-v0/intent.ts) */
  kind?: string;
  screen?: boolean;
  /** the opening's arrangement the reading asked for, when it did */
  arrange?: string;
  seed: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** The strategy for a direction. Deterministic: the same direction composes the same way. */
export function strategyFor(input: StrategyInput): CompositionStrategy {
  const f = input.form;
  const v = (k: keyof NonNullable<StrategyInput['dna']>) => (typeof input.dna?.[k] === 'number' ? (input.dna![k] as number) : 50);
  const q = new Set((input.reading?.qualities ?? []).map((x) => x.id));
  const restricted = new Set((input.reading?.restrictions ?? []).map((x) => x.id));
  const w = ` ${(input.words ?? '').toLowerCase()} `;
  const has = (re: RegExp) => re.test(w);
  const said: string[] = [];
  const c = v('composition');
  const ty = v('typography');
  let r = input.seed >>> 0 || 1;
  const rand = () => ((r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0) % 10000) / 10000;
  const keep = [...FUNCTIONAL_KINDS];
  const avoid = [
    ...(restricted.has('cards') ? ['cards'] : []),
    ...(restricted.has('gradients') ? ['gradients'] : []),
    ...(restricted.has('centred') ? ['centred openings'] : []),
    ...(restricted.has('rounded') ? ['pill buttons', 'round corners'] : []),
    ...(restricted.has('icons') ? ['icons'] : []),
    'card grids that nothing asked for',
    'three equal columns',
    ...(f.radial < 60 ? ['circles as decoration'] : []),
    ...(f.curvature < 45 ? ['blobs'] : []),
  ];
  // a working screen composes for use: the library's layouts, conventional where convention serves the task
  if (input.screen || input.kind === 'dashboard' || input.kind === 'data' || input.kind === 'app') {
    return {
      axis: 'orthogonal', ranked: ['orthogonal'], grid: 'strict', balance: 'start', overlap: 0, bleed: 0, air: clamp(100 - v('density')),
      type: { role: 'functional', vertical: false, rotate: 0, outline: false, wrap: false, vary: false },
      images: 'plain', nav: 'bar', narrative: 'linear', edges: false, recompose: 0, keep, avoid,
      said: ['A working screen: composed for use, in the library’s layouts, conventional where convention serves the task.'], seed: input.seed,
    };
  }
  // did anyone ask for anything? A design nobody said anything about stays simple: the library's layouts, its shapes
  // kept for when they are asked for
  // warmth, coolness and a pace are about colour and motion, not composition: "clean and friendly" asks for nothing here
  const formSaid = [...q].some((id) => !['warm', 'cool', 'calm', 'slow'].includes(id));
  const asked = formSaid || Math.abs(c - 50) >= 12 || Math.abs(ty - 50) >= 12 || Math.abs(v('restraint') - 50) >= 14 || !!input.arrange;
  // the spatial logic: each scored from the traits that make it, a little seeded so two near designs can part ways
  const score: Record<Axis, number> = {
    orthogonal: f.orthogonal * 0.6 + f.order * 0.4,
    diagonal: f.energy * 0.55 + (100 - f.orthogonal) * 0.3 + (has(/\b(diagonal|slant|dynamic|momentum)/) ? 25 : 0),
    radial: f.radial * 0.95,
    scattered: f.fragment * 0.6 + (100 - f.order) * 0.35 + (has(/\b(scatter|distributed|constellation|archive|collage|cut-?up)/) ? 25 : 0),
    layered: f.depth * 0.7 + (q.has('layered') || q.has('immersive') || q.has('cinematic') ? 20 : 0) + (input.arrange === 'layered' ? 15 : 0),
  };
  for (const a of AXES) score[a] += (rand() - 0.5) * 8;
  const ranked = [...AXES].sort((a, b) => score[b] - score[a]);
  const axis = ranked[0];
  const why: Record<Axis, string> = {
    orthogonal: `its shapes keep right angles (${f.orthogonal}) and order (${f.order})`,
    diagonal: `its shapes carry energy (${f.energy}) more than right angles`,
    radial: `its shapes are radial (${f.radial})`,
    scattered: `its shapes are fragmented (${f.fragment}) and irregular`,
    layered: `its shapes are layered (${f.depth})`,
  };
  said.push(`Composed ${AXIS_LABEL[axis]}: ${why[axis]}.`);
  const grid: CompositionStrategy['grid'] = f.order >= 70 && c <= 45 ? 'strict' : f.fragment >= 62 || c >= 72 ? 'free' : 'broken';
  const balance: CompositionStrategy['balance'] = c >= 60 ? 'alternating' : rand() < 0.5 ? 'start' : 'end';
  const overlap = clamp(f.depth * 0.55 + c * 0.35 - f.order * 0.2 + (q.has('layered') ? 20 : 0));
  const bleed = clamp(q.has('cinematic') || q.has('immersive') ? 72 : f.depth * 0.4 + f.scale * 0.3);
  const air = clamp(100 - v('density'));
  // typography as structure
  // what the words say of the type counts as much as the DNA: monumental, loud, poster type is structure
  const loudType = q.has('monumental') || q.has('brutal') || q.has('maximal') || q.has('expressive') || has(/\b(bold type|big type|huge type|giant type|type that moves|statement type|loud)/);
  const editorialType = q.has('editorial') || q.has('museum') || q.has('luxurious') || q.has('cinematic') || has(/\b(magazine|typographic|serif)/);
  const role: CompositionStrategy['type']['role'] = (ty >= 64 || loudType) && f.scale >= 52 ? 'structural' : ty >= 55 || editorialType ? 'editorial' : ty <= 32 ? 'functional' : 'quiet';
  const vertical = asked && (role === 'structural' || role === 'editorial') && (f.orthogonal >= 55 || has(/\b(vertical|spine|poster|signage)/)) && !q.has('calm');
  const rotate = asked && f.energy >= 66 && f.order <= 55 ? (rand() < 0.5 ? -1 : 1) * Math.min(8, 3 + Math.round((f.energy - 66) / 8)) : 0;
  const outline = asked && f.scale >= 64 && f.energy >= 55 && v('restraint') >= 55;
  const wrap = asked && ((ty >= 52 && f.curvature >= 45) || has(/\b(wrap|magazine|editorial|essay|long read)/));
  const vary = asked && v('motion') >= 62 && f.energy >= 50 && input.look.motionFeel !== 'still';
  said.push(`Type ${role === 'structural' ? 'as structure: display sizes carry the composition' : role === 'editorial' ? 'set editorially' : role === 'functional' ? 'kept functional' : 'kept quiet'}${vertical ? ', with labels standing upright' : ''}${rotate ? `, turned ${Math.abs(rotate)}°` : ''}${outline ? ', numerals in outline' : ''}${wrap ? ', words wrapping a shape' : ''}${vary ? ', weight sweeping as it passes' : ''}.`);
  // pictures: shown whole where a work is shown as itself; cut to the shapes where the shapes are the identity
  let images: CompositionStrategy['images'] = 'plain';
  // a museum shows each work whole; restraint does too, unless the restraint is structural (a picture cut to a plan's outline)
  if (q.has('museum') || (q.has('restrained') && !(f.orthogonal >= 70 && asked))) images = input.look.frame === 'inset' || input.look.frame === 'offset' ? 'framed' : 'plain';
  else if (asked && f.fragment >= 68) images = 'fragmented';
  else if (asked && (f.curvature >= 60 || f.orthogonal >= 62 || f.radial >= 62)) images = 'shaped';
  else if (asked && f.scale >= 65) images = 'cropped';
  else if (input.look.frame === 'inset' || input.look.frame === 'offset') images = 'framed';
  said.push(
    images === 'shaped' ? `Pictures cut to its shapes: ${describeForm(f).replace(/\.$/, '').toLowerCase()}.`
    : images === 'fragmented' ? 'The opening picture broken into fragments; the others cut to its shapes.'
    : images === 'cropped' ? 'Pictures cropped hard, at extreme proportions.'
    : images === 'framed' ? 'Pictures shown whole, framed as plates.'
    : 'Pictures shown whole: nothing about this design asks to cut them.',
  );
  const narrative: CompositionStrategy['narrative'] = asked && (has(/\b(story|journey|chapters?|issue|archive|index|non-?linear|essay|long read|catalogue)/) || (q.has('editorial') && c >= 60)) ? 'chapters' : 'linear';
  const nav: CompositionStrategy['nav'] =
    narrative === 'chapters' || has(/\b(index|archive|catalogue|contents)/) ? 'index'
    : asked && f.orthogonal >= 62 && (role === 'structural' || role === 'editorial') && c >= 55 && input.kind !== 'shop' ? 'rail'
    : asked && (q.has('minimal') || q.has('restrained')) && v('restraint') <= 35 ? 'menu'
    : 'bar';
  if (nav !== 'bar') said.push(nav === 'index' ? 'The navigation an index of numbered chapters, each going to its part.' : nav === 'rail' ? 'The navigation standing upright at the left edge, a rail the page reads past.' : 'The navigation folded into a menu: the page keeps its first screen.');
  const edges = asked && !q.has('restrained') && !q.has('minimal') && (f.curvature >= 62 || f.orthogonal >= 72 || f.fragment >= 62);
  if (edges) said.push('Where grounds change, they meet along an edge of its shapes.');
  // how much of the page it composes itself: none for a design that asked for nothing, more the more experimental
  let recompose = !asked ? 0 : c <= 35 ? 0 : c <= 55 ? 1 : c <= 75 ? 2 : 3;
  if (asked && (q.has('experimental') || q.has('asymmetric') || q.has('layered'))) recompose = Math.min(3, recompose + 1);
  if (q.has('minimal') || q.has('restrained')) recompose = Math.min(recompose, 1);
  said.push(recompose ? `${recompose} part${recompose === 1 ? '' : 's'} beyond the opening composed from ${recompose === 1 ? 'its' : 'their'} own content, not as card grids or equal columns; bookings, forms, prices and galleries kept as they work.` : asked ? 'The library’s layouts kept beyond the opening: the composition is structured.' : 'Nothing in the brief asks for an unusual composition: the library’s layouts, simply.');
  return {
    axis: asked ? axis : 'orthogonal',
    ranked: asked ? ranked : ['orthogonal'],
    grid: asked ? grid : 'strict',
    balance,
    overlap: asked ? overlap : 0,
    bleed: asked ? bleed : 0,
    air,
    type: { role: asked ? role : 'quiet', vertical, rotate, outline, wrap, vary },
    images,
    nav,
    narrative,
    edges,
    recompose,
    keep,
    avoid,
    said,
    seed: input.seed,
  };
}

/** A stored strategy held to its shape; undefined when it is not one. */
export function normalizeStrategy(v: unknown): CompositionStrategy | undefined {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : null;
  if (!r || !(AXES as readonly string[]).includes(r.axis)) return undefined;
  const t = r.type && typeof r.type === 'object' ? r.type : {};
  const one = <T extends string>(xs: readonly T[], x: unknown, d: T): T => ((xs as readonly string[]).includes(x as string) ? (x as T) : d);
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string').slice(0, 24).map((y) => y.slice(0, 200)) : []);
  const ranked = Array.isArray(r.ranked) ? [...new Set(r.ranked.filter((x: unknown): x is Axis => (AXES as readonly string[]).includes(x as string)))] : [];
  return {
    axis: r.axis,
    ranked: ranked.length ? ranked : [r.axis],
    grid: one(['strict', 'broken', 'free'] as const, r.grid, 'broken'),
    balance: one(['start', 'end', 'alternating'] as const, r.balance, 'start'),
    overlap: clamp(Number(r.overlap) || 0),
    bleed: clamp(Number(r.bleed) || 0),
    air: clamp(Number(r.air) || 50),
    type: { role: one(TYPE_ROLES, t.role, 'quiet'), vertical: t.vertical === true, rotate: Math.max(-12, Math.min(12, Math.round(Number(t.rotate) || 0))), outline: t.outline === true, wrap: t.wrap === true, vary: t.vary === true },
    images: one(IMAGE_TREATMENTS, r.images, 'plain'),
    nav: one(NAV_STRATEGIES, r.nav, 'bar'),
    narrative: r.narrative === 'chapters' ? 'chapters' : 'linear',
    edges: r.edges === true,
    recompose: Math.max(0, Math.min(3, Math.round(Number(r.recompose) || 0))),
    keep: strs(r.keep),
    avoid: strs(r.avoid),
    said: strs(r.said),
    seed: Math.max(1, Math.round(Number(r.seed) || 1)),
  };
}

/** The strategy as the generator is told it: a direction it composes within, inventing its own arrangements. */
export function strategyBrief(s: CompositionStrategy, form: FormSystem | undefined): string {
  const lines = [
    `COMPOSITION STRATEGY (decided from this direction before you write; compose within it and invent your own arrangements — it is not a template):`,
    ...s.said.map((x) => `- ${x}`),
    `- Spatial logic: ${AXIS_LABEL[s.axis]} on a ${s.grid} grid; overlap ${s.overlap >= 60 ? 'welcome' : s.overlap >= 30 ? 'where it serves' : 'rare'}; ${s.bleed >= 60 ? 'pictures may run edge to edge' : 'pictures within the page'}.`,
    ...(form
      ? [
          `- Shapes (the design's own system): ${describeForm(form)} Use them as picture masks, masses behind words, small echoes of a picture's silhouette, cuts across an edge, or a figure words wrap around — never as scattered decoration. Recipes you may use as they are or vary (keep the kind and the character): ${formExamples(form).map((x) => JSON.stringify({ kind: x.kind, n: x.n, irregular: x.irregular, curve: x.curve, turn: x.turn, cut: x.cut, warp: x.warp, ...(x.mirror ? { mirror: true } : {}) })).join('; ')}.`,
        ]
      : []),
    s.recompose ? `- Compose ${s.recompose} part${s.recompose === 1 ? '' : 's'} beyond the opening as "compose" sections of your own (a field or a layer), from the part's real content; never a grid of cards or three equal columns. Keep ${s.keep.slice(0, 6).join(', ')} as their own kinds: they have to work.` : '- Use the library’s layouts beyond the opening.',
    `- Avoid: ${s.avoid.join(', ')}.`,
  ];
  return lines.join('\n');
}
