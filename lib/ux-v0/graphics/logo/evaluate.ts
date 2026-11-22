// lib/ux-v0/graphics/logo/evaluate.ts — a logo concept judged on twelve criteria, each from the geometry itself:
// distinctiveness (apart from the other concepts shown and from plain primitives, clear of clichés), simplicity (its
// complexity against its category's range), memorability (a proxy: simple, distinct, one clear structure), scalability
// and small-size performance (what survives at 16, 24, 32 and 64 px, measured by morphology on a raster), legibility
// (the name spelt exactly, its strokes at least a pixel at header size, its counters open), optical balance (the
// visual centre, the weight of symbol against wordmark), geometry quality (valid paths, one stroke weight, no
// slivers), conceptual coherence and brand relevance (the brief's words it answers), versatility (one colour, a square
// place, a wide one) and technical validity (it renders, its paths are editable, its text is exact). Colour tests and
// contexts are measured too. Nothing here is a trademark search: distinctiveness is relative to what is compared.

import { contrastRatio } from '../../../ux/audit';
import type { LogoBrief } from './brief';
import { coloursFor, COLOUR_SCHEMES, initialMark, logoDoc, smallMark, type ColourScheme } from './build';
import { lettered, methodFit, type LogoConcept } from './concepts';
import { circle, complexityOf, geometryIssues, rect, polygon, ring, type Mark } from './geom';
import { spelledExactly } from './glyphs';
import { colourReliance, components, dilate, downsample, centroid, erode, inkBounds, inkOf, likeness, occupancy, rasterize, strokeSpread, survivalAt, symmetry } from './raster';
import { renderArtboard } from '../render';

export const LOGO_CRITERIA = ['distinctiveness', 'simplicity', 'memorability', 'scalability', 'legibility', 'balance', 'geometry', 'coherence', 'relevance', 'versatility', 'technical', 'small'] as const;
export type LogoCriterion = (typeof LOGO_CRITERIA)[number];
export const CRITERION_LABEL: Record<LogoCriterion, string> = {
  distinctiveness: 'Distinctiveness',
  simplicity: 'Simplicity',
  memorability: 'Memorability',
  scalability: 'Scalability',
  legibility: 'Legibility',
  balance: 'Optical balance',
  geometry: 'Geometry quality',
  coherence: 'Conceptual coherence',
  relevance: 'Brand relevance',
  versatility: 'Versatility',
  technical: 'Technical validity',
  small: 'Small-size performance',
};

export interface CriterionResult {
  key: LogoCriterion;
  label: string;
  score: number;
  pass: boolean;
  notes: string[];
}
export interface ColourTest {
  scheme: ColourScheme;
  /** the weakest contrast of the mark against its ground */
  contrast: number;
  pass: boolean;
  note: string;
}
export interface SizeTest {
  px: number;
  /** what survives at this size, 0–1 */
  survival: number;
  /** counters (enclosed spaces) still open, of those at full size */
  counters: string;
}
export interface LogoEvaluation {
  criteria: CriterionResult[];
  score: number;
  pass: boolean;
  sizes: SizeTest[];
  colours: ColourTest[];
  contexts: { context: string; pass: boolean; note: string }[];
  /** said plainly, every time */
  disclaimer: string;
}

export const SIZES = [16, 24, 32, 64, 128, 512] as const;
export const CONTEXTS = ['light', 'dark', 'app icon', 'web header', 'social avatar', 'business card', 'product mockup'] as const;
const DISCLAIMER = 'Distinctiveness is measured against the concepts compared here and common clichés. It is not a trademark search: no logo is claimed to be legally unique, registrable or clear to use.';

let PRIMS: number[][] | null = null;
/** Plain primitives' signatures (a disc, a square, a ring, a triangle): a mark too like one of these is generic. */
function primitives(): number[][] {
  if (PRIMS) return PRIMS;
  const one = (path: Mark['parts'][number]['path']): Mark => ({ method: 'primitive', params: {}, notes: [], parts: [{ name: 'p', path, tone: 0 }] });
  PRIMS = [
    one(circle(500, 500, 400)),
    one(rect(100, 100, 800, 800)),
    one(ring(500, 500, 400, 120)),
    one(
      polygon([
        [500, 100],
        [900, 860],
        [100, 860],
      ]),
    ),
    one(rect(100, 100, 800, 800, 160)),
  ].map((m) => occupancy(inkOf(rasterize(m, 64, { x: 0, y: 0, w: 1000, h: 1000 })), 64, 10));
  return PRIMS;
}

const TARGET: Record<string, number> = { minimal: 12, lettermark: 18, monogram: 18, emblem: 70, mascot: 26, modular: 30, responsive: 24, geometric: 22, abstract: 20 };

/** How complex a silhouette looks: its edge against its area (a disc is about 3.5), its parts, counters and inks. */
export function visualComplexity(ink: Uint8Array, n: number, tones: number): number {
  let edge = 0;
  let area = 0;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (!ink[j * n + i]) continue;
      area++;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1 || !ink[j * n + i - 1] || !ink[j * n + i + 1] || !ink[(j - 1) * n + i] || !ink[(j + 1) * n + i]) edge++;
    }
  const cc = components(ink, n);
  return Math.round((edge / Math.sqrt(Math.max(1, area)) + Math.min(12, cc.parts) * 1.2 + Math.min(8, cc.holes) * 0.8 + tones * 1.5) * 10) / 10;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The concept judged (see the head of this file). `others` are the concepts it is compared with. */
export function evaluateLogo(c: LogoConcept, brief: LogoBrief | null, others: readonly LogoConcept[] = []): LogoEvaluation {
  const mark = c.mark ?? initialMark(c);
  const box = { x: 0, y: 0, w: 1000, h: 1000 };
  const ras = rasterize(mark, 128, box);
  const ink = inkOf(ras);
  const smallInk = inkOf(rasterize(smallMark(mark), 128, box));
  const out: CriterionResult[] = [];
  const add = (key: LogoCriterion, score: number, notes: string[], threshold = 0.6) => out.push({ key, label: CRITERION_LABEL[key], score: Math.round(clamp01(score) * 100) / 100, pass: score >= threshold, notes });

  // distinctiveness
  const sig = c.sig?.length ? c.sig : occupancy(ink, 128, 10);
  const closest = others.filter((o) => o.id !== c.id && o.sig?.length === sig.length).reduce((m, o) => Math.max(m, likeness(sig, o.sig!)), 0);
  const generic = c.mark ? Math.max(...primitives().map((p) => likeness(p, occupancy(ink, 128, 10)))) : 0;
  const risk = c.method && brief ? ({ aperture: '', seed: 'leaf', orbit: 'globe', radial: 'hexagon', trace: 'infinity', organic: 'blob' } as Record<string, string>)[c.method] : '';
  const cliche = !!risk && !!brief?.avoid.includes(risk) && !!c.method && (c.method !== 'seed' || brief.industry.some((i) => ['nature', 'wellbeing', 'food'].includes(i)));
  add('distinctiveness', (others.length ? clamp01((0.92 - closest) / 0.2) * 0.6 : 0.6) + clamp01((0.97 - generic) / 0.17) * 0.4 - (cliche ? 0.3 : 0), [
    others.length ? `closest other concept ${closest.toFixed(2)} alike in structure` : 'no other concept to compare with',
    c.mark ? `closest plain primitive ${generic.toFixed(2)} alike` : 'a wordmark: distinct by its letters and setting',
    ...(cliche ? [`close to a cliché the brief avoids (${risk})`] : []),
  ]);

  // simplicity
  const vc = visualComplexity(ink, 128, new Set(mark.parts.map((p) => p.tone)).size);
  const target = TARGET[c.category] ?? 20;
  add('simplicity', c.mark ? (vc <= target ? 1 : clamp01(1 - (vc - target) / (target * 1.5))) : 0.9, [
    c.mark ? `visual complexity ${vc.toFixed(1)} (edge, parts, counters and inks; a ${c.category} mark reads simply up to ${target})` : 'a wordmark: as simple as its letters',
    `${mark.parts.length} part${mark.parts.length === 1 ? '' : 's'}, ${complexityOf(mark)} anchors and handles to edit`,
  ]);

  // scalability and small sizes
  const surv = (px: number) => survivalAt(ink, 128, px).score;
  const full = components(ink, 128);
  const sizes: SizeTest[] = SIZES.map((px) => {
    if (px >= 128) return { px, survival: 1, counters: `${full.holes}/${full.holes}` };
    const down = downsample(px <= 24 ? smallInk : ink, 128, px);
    const h = components(down, px).holes;
    return { px, survival: Math.round(survivalAt(px <= 24 ? smallInk : ink, 128, px).score * 100) / 100, counters: `${Math.min(h, full.holes)}/${full.holes}` };
  });
  const s24 = surv(24);
  const s32 = surv(32);
  const s64 = surv(64);
  add('scalability', (s24 + s32 + s64) / 3, [`survives ${Math.round(s24 * 100)}% at 24 px, ${Math.round(s32 * 100)}% at 32, ${Math.round(s64 * 100)}% at 64; vector at 512`]);

  // legibility
  const l = lettered(c.wordmark, 100);
  const spelled = l ? spelledExactly(l) : c.wordmark.text.length > 0;
  const header = 32;
  const capAtHeader = c.lockup === 'stacked' ? header * 0.18 : c.mark ? header * 0.42 : header * 0.62;
  const strokePx = l ? (l.strokeWidth / 100) * capAtHeader : capAtHeader * 0.12;
  let counterNote = '';
  let counterScore = 1;
  if (l) {
    // the word drawn at header size and at eight times it: the counters that stay open
    const asMark: Mark = { method: 'wordmark', params: {}, notes: [], parts: l.letters.map((x) => ({ name: x.ch, path: x.path, tone: 0 as const, stroke: { width: l.strokeWidth, cap: 'round' as const, join: 'round' as const } })) };
    const W = l.width + 20;
    const nLow = Math.max(8, Math.round(W / (100 / capAtHeader)));
    const nHi = Math.min(1024, nLow * 8);
    const hi = inkOf(rasterize(asMark, nHi, { x: -10, y: 50 - W / 2, w: W, h: W }));
    const holes = components(hi, nHi).holes;
    const shrunk = components(downsample(hi, nHi, Math.floor(nHi / 8)), Math.floor(nHi / 8)).holes;
    counterScore = holes ? clamp01(shrunk / holes) : 1;
    counterNote = holes ? `${Math.min(shrunk, holes)} of ${holes} counters open at header size` : 'no enclosed counters';
  }
  add(
    'legibility',
    (spelled ? 0.5 : 0) + clamp01(strokePx / 1.2) * 0.25 + counterScore * 0.25,
    [spelled ? `“${c.wordmark.text}” spelt exactly${l ? ' (constructed capitals)' : ' (live text)'}` : 'the spelling does not match', `strokes about ${strokePx.toFixed(1)} px in a ${header} px header`, ...(counterNote ? [counterNote] : [])],
    0.65,
  );

  // optical balance
  const [mx, my] = centroid(ink, 128);
  const ib = inkBounds(ink, 128);
  const off = Math.hypot(mx - (ib.x + ib.w / 2), (my - (ib.y + ib.h / 2)) * 0.45) / Math.max(ib.w, ib.h);
  const sym = symmetry(ink, 128);
  add('balance', clamp01(1 - off / 0.2), [`visual centre ${Math.round(off * 100)}% from the middle of its bounds`, `mirror symmetry ${sym.mirror.toFixed(2)}, rotational ${sym.rotational.toFixed(2)}`]);

  // geometry quality
  const issues = geometryIssues(mark);
  const spread = strokeSpread(ink, 128);
  const strokeBased = mark.parts.some((p) => p.stroke) && spread.ridge > 20;
  const slivers = Math.max(0, full.parts - components(dilate(erode(ink, 128, 1), 128, 1), 128).parts);
  add('geometry', (issues.length ? 0 : 0.6) + (strokeBased ? clamp01(1 - (spread.spread - 0.25) / 0.4) * 0.4 : 0.4) - slivers * 0.05, [
    issues.length ? issues[0] : 'every path valid and drawable',
    strokeBased ? `stroke weight spread ${spread.spread.toFixed(2)} (one weight throughout reads ≤ 0.35)` : 'solid forms: one construction weight',
    ...mark.notes.slice(0, 2),
  ]);

  // conceptual coherence and brand relevance
  const fit = c.method && brief ? methodFit(c.method, brief) : null;
  add('coherence', clamp01(0.45 + c.addresses.length * 0.18 + (c.coreIdea && c.rationale ? 0.1 : 0)), [
    c.addresses.length ? `answers the brief’s ${c.addresses.slice(0, 4).join(', ')}` : 'answers no word of the brief directly',
    'the idea, rationale and construction are written from the same method',
  ]);
  add('relevance', fit ? clamp01(0.35 + fit.score / 5) : clamp01(0.55 + (brief?.personality.length ? 0.15 : 0)), [fit ? `fit to the brief ${fit.score.toFixed(1)} (meanings and temperament shared)` : 'a wordmark speaks for the name directly']);

  // versatility
  const reliance = colourReliance(ras);
  const aspect = ib.w / Math.max(1e-6, ib.h);
  add('versatility', clamp01(1 - reliance / 0.35) * 0.6 + clamp01(1 - Math.abs(Math.log(aspect)) / 0.9) * 0.4, [
    reliance > 0.15 ? `${Math.round(reliance * 100)}% of its edges are colour against colour: a one-colour version loses them` : 'works in one colour: its parts are separated by space, not colour',
    `proportion ${aspect.toFixed(2)}:1 (a square place suits ${Math.abs(Math.log(aspect)) < 0.35 ? 'it well' : 'it less well'})`,
  ]);

  // technical validity
  let rendered = '';
  try {
    const d = logoDoc(c);
    rendered = renderArtboard(d, d.artboards[0]);
  } catch {
    rendered = '';
  }
  const okSvg = !!rendered && !/NaN|undefined|Infinity/.test(rendered);
  add(
    'technical',
    (okSvg ? 0.5 : 0) + (issues.length ? 0 : 0.3) + (spelled ? 0.2 : 0),
    [okSvg ? 'renders as SVG with no broken number' : 'did not render cleanly', 'paths are editable Bézier shapes; cuts are live', l ? 'the name’s source text kept with the drawn letters' : 'the name is live text in an open-licence face'],
    0.99,
  );

  // small sizes
  const s16 = survivalAt(smallInk, 128, 16).score;
  const fullHoles = full.holes;
  const holes16 = components(downsample(smallInk, 128, 16), 16).holes;
  add(
    'small',
    s16 * 0.7 + (fullHoles ? clamp01(holes16 / fullHoles) : 1) * 0.3,
    [`the small version survives ${Math.round(s16 * 100)}% at 16 px`, fullHoles ? `${Math.min(holes16, fullHoles)} of ${fullHoles} counters open at 16 px` : 'no counters to close'],
    0.55,
  );

  // memorability: a proxy from the others, said as one
  const simp = out.find((x) => x.key === 'simplicity')!.score;
  const dist = out.find((x) => x.key === 'distinctiveness')!.score;
  const structure = Math.max(sym.mirror, sym.rotational, sym.vertical);
  const focal = full.parts ? 1 / Math.min(4, full.parts) : 0;
  add('memorability', simp * 0.35 + dist * 0.35 + structure * 0.15 + Math.min(1, focal * 2) * 0.15, ['a proxy, not a recall test: simple, distinct, one clear structure', `${full.parts} separate part${full.parts === 1 ? '' : 's'} in the silhouette`]);

  // colour tests
  const colours: ColourTest[] = COLOUR_SCHEMES.map((scheme) => {
    const col = coloursFor(c, scheme);
    const ground = col.ground ?? '#ffffff';
    const used = new Set(mark.parts.map((p) => p.tone));
    const contrasts = [...used].map((t) => contrastRatio(col.tones[t], ground));
    if (c.wordmark.text) contrasts.push(contrastRatio(col.word, ground));
    const contrast = Math.min(...contrasts);
    const merged = scheme !== 'full' && reliance > 0.15;
    return {
      scheme,
      contrast: Math.round(contrast * 100) / 100,
      pass: contrast >= 3 && !merged,
      note: merged ? 'parts separated only by colour merge here' : contrast >= 3 ? `${contrast.toFixed(1)}:1 against the ground` : `only ${contrast.toFixed(1)}:1 against the ground`,
    };
  });

  // contexts
  const avatarFit = (() => {
    // does the symbol sit inside a circle crop with a margin?
    let outside = 0;
    const n = 128;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (ink[j * n + i] && Math.hypot(i + 0.5 - n / 2, j + 0.5 - n / 2) > n * 0.47) outside++;
    return (
      outside /
      Math.max(
        1,
        ink.reduce((s, v) => s + v, 0),
      )
    );
  })();
  const contexts = [
    { context: 'light', pass: colours.find((x) => x.scheme === 'full')!.pass, note: colours.find((x) => x.scheme === 'full')!.note },
    { context: 'dark', pass: colours.find((x) => x.scheme === 'white')!.pass, note: 'the white version on a dark ground' },
    { context: 'app icon', pass: s32 >= 0.85, note: `the symbol on a tile at 32 px keeps ${Math.round(s32 * 100)}%` },
    { context: 'web header', pass: strokePx >= 0.9 && spelled, note: `the lockup in a ${header} px header: strokes about ${strokePx.toFixed(1)} px` },
    { context: 'social avatar', pass: avatarFit < 0.08, note: avatarFit < 0.08 ? 'fits a circular crop' : `${Math.round(avatarFit * 100)}% of the symbol falls outside a circular crop: it is drawn smaller there` },
    { context: 'business card', pass: (c.wordmark.text.length <= 18 || c.lockup === 'stacked') && strokePx >= 0.6, note: 'the lockup at about 12 mm across' },
    { context: 'product mockup', pass: colours.find((x) => x.scheme === 'single')!.pass, note: 'printed or embossed in one colour' },
  ];
  const score = out.reduce((s, x) => s + x.score, 0) / out.length;
  return { criteria: out, score: Math.round(score * 100) / 100, pass: out.every((x) => x.pass || x.key === 'memorability'), sizes, colours, contexts, disclaimer: DISCLAIMER };
}

/** The scalability line a concept's metadata carries, written from its measures. */
export function scalabilityLine(e: LogoEvaluation): string {
  const at = (px: number) => e.sizes.find((s) => s.px === px)?.survival ?? 0;
  const weak = e.sizes.filter((s) => s.px <= 32 && s.survival < 0.85).map((s) => `${s.px} px`);
  return `Holds ${Math.round(at(32) * 100)}% of its form at 32 px and ${Math.round(at(16) * 100)}% at 16 px in its small version${weak.length ? `; weaker at ${weak.join(', ')}` : ''}; vector to any size above.`;
}
