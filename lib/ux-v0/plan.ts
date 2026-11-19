// lib/ux-v0/plan.ts — each direction's plan, critiqued before anyone sees it.
//
// A direction states its plan the way a studio's lead would before drawing:
//   - its colours, 4–6 of them, each named;
//   - its type: a display face used with restraint, a body face, a utility face when it has one;
//   - its layout idea, in one line;
//   - ONE SIGNATURE MOVE: the one bold thing it does (the headline set huge, one part on a field of colour, one
//     picture edge to edge, one figure set very large, a sharply uneven split, a framed picture, one moment of
//     motion). Everything around it stays quiet;
//   - ONE DETAIL ONLY ITS SUBJECT HAS: its units, its conventions, its terms (a yoga class's level and room
//     temperature; a bakery's oven times; a lab's °C, % RH and hPa), shown as content, never as decoration.
//
// The plan is then CRITIQUED, in code, before the direction is shown: a look generated pages share that nobody
// asked for (lib/ux-v0/tells.ts), no signature move (or one the design cannot draw), more than one loud move, no
// subject detail, numbering on what is not a sequence. What can be revised is revised, and said; what cannot
// (a detail no one has given yet) is said as still to do. The plan goes to the generator, its signature is held
// in the design (holdSignature, from lib/ux-v0/fit.ts), and the evaluation checks the design kept it.

import { hslOf } from './color';
import { knownFont } from './fonts';
import { splitShare } from './compose';
import { heroVariantsFor, type LayoutDecisions } from './layout';
import { normalizeShape, type DesignSpec, type Look, type Motion, type Section } from './spec';
import { motionFor } from './motion';
import { unaskedTells, type LookProfile } from './tells';
import type { ArtDirection } from './direction';

export const SIGNATURES = ['giant-type', 'colour-field', 'full-bleed-picture', 'oversized-figure', 'uneven-split', 'framed-picture', 'one-motion'] as const;
export type Signature = (typeof SIGNATURES)[number];

export const SIGNATURE_LABEL: Record<Signature, string> = {
  'giant-type': 'the headline set huge',
  'colour-field': 'one part on a field of the accent',
  'full-bleed-picture': 'one picture running edge to edge',
  'oversized-figure': 'one row of figures set very large',
  'uneven-split': 'a sharply uneven split',
  'framed-picture': 'the pictures set in frames',
  'one-motion': 'one orchestrated moment of motion, the headline arriving',
};

/** Which signature each language reaches for first: its own boldness. */
const AFFINITY: Record<string, readonly Signature[]> = {
  broadsheet: ['giant-type', 'framed-picture', 'one-motion'],
  swiss: ['giant-type', 'uneven-split', 'oversized-figure'],
  'quiet-luxury': ['full-bleed-picture', 'framed-picture', 'one-motion'],
  poster: ['giant-type', 'oversized-figure', 'colour-field'],
  craft: ['colour-field', 'framed-picture', 'giant-type'],
  geometric: ['colour-field', 'uneven-split', 'giant-type'],
  utility: ['oversized-figure', 'uneven-split', 'one-motion'],
  gallery: ['full-bleed-picture', 'framed-picture', 'uneven-split'],
  organic: ['framed-picture', 'one-motion', 'colour-field'],
  civic: ['colour-field', 'oversized-figure', 'uneven-split'],
  night: ['full-bleed-picture', 'giant-type', 'one-motion'],
  'retro-print': ['giant-type', 'colour-field', 'oversized-figure'],
  brutal: ['giant-type', 'oversized-figure', 'uneven-split'],
  cinema: ['full-bleed-picture', 'one-motion', 'giant-type'],
  future: ['oversized-figure', 'one-motion', 'giant-type'],
  industrial: ['uneven-split', 'oversized-figure', 'framed-picture'],
  maximal: ['colour-field', 'giant-type', 'oversized-figure'],
};

export interface PlanColour {
  name: string;
  hex: string;
  role: 'ground' | 'surface' | 'ink' | 'muted' | 'accent' | 'second';
}

export interface DesignPlan {
  colours: PlanColour[];
  type: { display: string; body: string; mono?: string; note: string };
  /** the layout idea, one line */
  layout: string;
  signature: Signature;
  /** the signature, in words for this design */
  signatureSays: string;
  /** one detail only this subject has, and the words that show it is there */
  detail: { text: string; terms: string[] };
  /** what the critique changed before anyone saw it */
  revised: string[];
  /** what it could not settle: said, for the designer or the model to supply */
  open: string[];
}

export interface PlanContext {
  /** the kind of work (lib/ux-v0/intent.ts Experience) */
  kind: string;
  /** a task-first screen, not a page */
  screen: boolean;
  hasImage: boolean;
  /** the subject in the designer's words ("yoga class") */
  subject: string;
  /** everything said about the work, to find what only it has */
  words: string;
  decisions?: LayoutDecisions;
  /** the designer set the motion in the brief: it is theirs */
  motionDecided?: boolean;
  /** this direction keeps the designer's own palette and type pair (the faithful reading) */
  ownColours?: boolean;
  /** the alignment and corners the designer decided, for what they asked for */
  align?: string;
  corners?: string;
}

// ── colours, named plainly ────────────────────────────────────────────

const FAMILY: [number, string][] = [
  [15, 'red'],
  [40, 'clay'],
  [65, 'ochre'],
  [95, 'olive'],
  [160, 'green'],
  [200, 'teal'],
  [250, 'blue'],
  [290, 'violet'],
  [340, 'plum'],
  [361, 'red'],
];

/** A colour's plain name: how light, and what family ("deep blue", "pale stone", "clay"). */
export function colourName(hex: string): string {
  const [h, s, l] = hslOf(hex);
  if (s < 0.1) return l > 0.94 ? 'paper white' : l > 0.8 ? 'pale stone' : l > 0.55 ? 'stone' : l > 0.25 ? 'slate' : l > 0.1 ? 'graphite' : 'near-black';
  const fam = FAMILY.find(([to]) => h < to)![1];
  const name = fam === 'clay' && s > 0.55 && l > 0.45 ? 'orange' : fam === 'ochre' && l > 0.7 ? 'sand' : fam;
  return l > 0.9 ? `pale ${name}` : l > 0.72 ? `light ${name}` : l < 0.2 ? `deep ${name}` : l < 0.35 ? `dark ${name}` : name;
}

// ── what only this subject has ────────────────────────────────────────

const DETAILS: readonly [RegExp, string, string[]][] = [
  [/\bhot yoga\b|\bbikram\b/, 'each class with its level and the room’s temperature (40 °C)', ['level', '°C']],
  [/\byoga\b/, 'each class with its level and the room’s temperature in °C', ['level', '°C']],
  [/\bpilates\b/, 'each session with its level, and mat or reformer', ['mat', 'reformer']],
  [/\bclimb|\bboulder/, 'routes by grade (V-scale or French grade) and wall', ['grade', 'wall']],
  [/\bpotter|\bceramic|\bkiln/, 'firing days, and the clay body each class uses', ['firing', 'clay']],
  [/\btennis\b|\bpadel\b|\bsquash\b|\bcourt\b/, 'each court with its surface, and whether it is floodlit', ['surface', 'floodlit']],
  [/\bmassage\b|\bspa\b|\bfacial\b|\btreatment\b/, 'each treatment with its length in minutes and its pressure', ['min', 'pressure']],
  [/\bhaircut\b|\bbarber|\bsalon\b|\bhairdress/, 'each service with its length in minutes, and clipper or scissor work', ['min', 'clipper']],
  [/\bswim/, 'each lesson with its stage and the pool’s depth', ['stage', 'depth']],
  [/\bdance\b|\bballet\b/, 'each class with its style and level', ['style', 'level']],
  [/\bbox(ing)?\b|\bmartial\b|\bjiu/, 'each class with its rounds and level', ['rounds', 'level']],
  [/\bspin\b|\bcycl/, 'each ride with its length and bike number', ['bike', 'min']],
  [/\bmuseum\b|\bexhibition\b|\btour\b/, 'each tour with its route, its length and the rooms it passes', ['room', 'min']],
  [/\bcook|\bkitchen\b|\bchef\b/, 'each class with its dish, and what you take home', ['dish', 'take home']],
  [/\bsauna\b/, 'each slot with its temperature, and mixed or single-sex', ['°C', 'mixed']],
  [/\bsurf/, 'each lesson with the tide and the board size', ['tide', 'board']],
  [/\bpiano\b|\bguitar\b|\bviolin\b|\bmusic lesson/, 'each lesson with its grade and length', ['grade', 'min']],
  [/\bescape room\b/, 'each room with its difficulty, how many play and its time limit', ['players', 'min']],
  [/\bmeeting room|\bboardroom/, 'each room with how many it seats and its screen', ['seats', 'screen']],
  [/\bdesk\b|\bcowork/, 'each desk with its floor, its screen and its power', ['floor', 'screen']],
  [/\bbaker|\bbread\b|\bsourdough|\bpatisserie/, 'what comes out of the oven when (sourdough at 7:00, croissants at 8:30)', ['oven', '7:00']],
  [/\bcoffee\b|\bcaf[eé]\b|\bespresso\b|\broaster/, 'the beans on today: origin, process and roast date', ['origin', 'roast']],
  [/\brestaurant\b|\bbistro\b|\bdining\b|\bmenu\b/, 'the menu by course, with what is in season this week', ['course', 'season']],
  [/\bjazz\b|\bgig\b|\bconcert\b|\bclub\b|\bvenue\b/, 'tonight’s line-up with set times and when the doors open', ['set', 'doors']],
  [/\bbar\b|\bcocktail/, 'the list by spirit, with what is poured tonight', ['spirit', 'tonight']],
  [/\barchitect/, 'each project with its place, its year and its floor area in m²', ['m²', 'year']],
  [/\bhotel\b|\binn\b|\bguest ?house\b|\bvilla\b|\bresort\b/, 'each room with its size in m², its view and its bed', ['m²', 'view']],
  [/\blaw\b|\blegal\b|\bsolicitor|\battorney|\bbarrister/, 'each practice area with the courts or tribunals it covers', ['court', 'tribunal']],
  [/\bskin ?care\b|\bserum\b|\bcosmetic|\bbeauty\b/, 'each product with its key ingredients and their percentages', ['%', 'ingredient']],
  [/\bsensor|\blab\b|\blaborator/, 'readings in their own units (°C, % RH, hPa) with each room’s safe range', ['°C', '% RH', 'hPa']],
  [/\bdashboard\b|\bmetric|\banalytic/, 'each figure with its unit and the date it was true', ['as of', 'unit']],
  [/\bmagazine\b|\bstory\b|\bjournal\b|\beditorial\b|\barticle\b|\bessay\b/, 'the byline, the date and the reading time', ['min read', 'by']],
  [/\bportfolio\b|\bmotion design|\bdesigner\b|\billustrat|\bphotograph/, 'each piece with its client, its year and the role played', ['client', 'year']],
  [/\bnon-?profit\b|\bcharity\b|\bdonat|\bfoundation\b/, 'what one gift pays for, in the charity’s own terms', ['pays for']],
  [/\bflorist\b|\bflowers?\b/, 'what is in season this week, stem by stem', ['season', 'stem']],
  [/\bbrew|\bbeer\b/, 'each beer with its ABV and IBU', ['ABV', 'IBU']],
  [/\bwine\b|\bvineyard\b|\bwinery\b/, 'each wine with its grape, its vintage and its region', ['vintage', 'grape']],
  [/\bclinic\b|\bdentist|\bdoctor\b|\bpatient|\btherap/, 'each appointment with its length and who it is with', ['min', 'with']],
  [/\bgym\b|\bfitness\b|\bpersonal train/, 'each class with its intensity and length', ['intensity', 'min']],
  [/\bschool\b|\bcourse\b|\bworkshop\b|\bclass\b/, 'each course with its length, its level and what you will be able to do', ['level', 'weeks']],
  [/\bcheckout\b|\bshop\b|\bstore\b|\bproduct/, 'each product with its materials and its size', ['material', 'size']],
  [/\bfinanc|\bbank\b|\binvest|\bbudget/, 'figures with their currency and the date they were true', ['as of', '£']],
];

/** The detail only this subject has: its units, conventions or terms. From what is said first, then what it is. */
export function subjectDetail(words: string, subject = ''): { text: string; terms: string[] } | null {
  const w = ` ${String(words ?? '').toLowerCase()} ${String(subject ?? '').toLowerCase()} `;
  // a line the designer wrote with a number, a unit or a time in it is their own detail
  const own = String(words ?? '')
    .split(/[.;\n]/)
    .map((x) => x.trim())
    .find((x) => x.length > 8 && x.length < 140 && /(\d\s?(°|%|m²|min|mins|hours|h\b|kg|km|cm|ml)|\b\d{1,2}[:.]\d{2}\b|°C|% RH)/i.test(x));
  if (own) return { text: own.charAt(0).toLowerCase() + own.slice(1), terms: (own.match(/\d+\s?(°C|°|%|m²|min|mins|hours|kg|km|cm|ml)|\b\d{1,2}[:.]\d{2}\b/gi) ?? []).slice(0, 3) };
  for (const [re, text, terms] of DETAILS) if (re.test(w)) return { text, terms };
  return null;
}

// ── what a direction can draw, and its signature ──────────────────────

/**
 * The loud move the designer's own decisions already make. Asked for an uneven arrangement, the split is
 * sharply uneven: that is their move, so it is the plan's one bold move, never quieted for another.
 */
export function decidedMoves(decisions: LayoutDecisions | undefined): Signature[] {
  return decisions?.arrangement === 'asymmetric' ? ['uneven-split'] : [];
}

/** Is a split's proportion sharply uneven (a loud move)? */
export const sharplyUneven = (r: unknown): boolean => typeof r === 'number' && (r <= 0.36 || r >= 0.6);

/** A split brought back from sharply uneven, to the nearest proportion that is not: the larger side stays larger. */
export const quietRatio = (r: number): number => (r >= 0.6 ? 0.58 : r <= 0.36 ? 0.38 : r);

/** A split made sharply uneven: the side that was already the larger one becomes much larger (a third against two). */
export const unevenRatio = (r: unknown): number => (typeof r === 'number' && r >= 0.5 ? 0.6 : 0.34);

/** The bold moves this direction can actually draw, given what it is and what it has. */
export function drawableSignatures(d: Pick<ArtDirection, 'compose' | 'look' | 'language'> & Partial<Pick<ArtDirection, 'plan' | 'lead'>>, c: PlanContext): Signature[] {
  const out: Signature[] = [];
  const page = !c.screen;
  const heroes = heroVariantsFor(c.decisions, c.hasImage, d.language);
  // the opening this direction draws (lib/ux-v0/study.ts): composed from pieces, its own, else a split when it has a picture
  const composed = page && (d.plan === 'composed' || d.lead === 'compose');
  const hero = composed ? 'compose' : d.compose?.hero ?? (c.hasImage ? 'split' : 'statement');
  // a composed opening has no headline to set huge (its words are held to its columns): its move is elsewhere
  if (page && !composed) out.push('giant-type');
  if (c.hasImage && ((page && hero === 'full-bleed' && heroes.includes('full-bleed')) || d.compose?.booking === 'immersive')) out.push('full-bleed-picture');
  if (page) out.push('colour-field');
  if (page && d.compose?.stats) out.push('oversized-figure');
  // side by side, as the designer decided, stays even: an uneven split is not this design's move
  if (c.decisions?.arrangement !== 'split' && ((page && c.hasImage && hero === 'split' && heroes.includes('split')) || composed || d.compose?.booking === 'split' || d.compose?.booking === 'calendar')) out.push('uneven-split');
  if (page && c.hasImage) out.push('framed-picture');
  // one moment of motion is always drawable, unless the designer set the motion (or ruled it out): on a page that
  // was still, it is the headline arriving, and nothing else moves (oneMoment)
  if (!c.motionDecided) out.push('one-motion');
  return out;
}

/** One orchestrated moment: the headline arrives through a mask; nothing else on the page moves. */
export function oneMoment(m: Motion): Motion {
  if (m.feel !== 'still') return { ...m, headline: 'mask' };
  return { ...motionFor('calm'), headline: 'mask', entrance: 'none', sections: 'none', parallax: 0, scroll: false, hover: 'none', nav: false };
}

/** The loud moves a direction's own composition already makes (a poster plan's huge headline, giant figures…). */
function inherentMoves(d: Pick<ArtDirection, 'compose'>): Signature[] {
  const out: Signature[] = [];
  if (d.compose?.hero === 'poster' || d.compose?.hero === 'statement') out.push('giant-type');
  if (d.compose?.hero === 'full-bleed' || d.compose?.booking === 'immersive') out.push('full-bleed-picture');
  if (d.compose?.stats === 'giant') out.push('oversized-figure');
  return out;
}

// ── the plan, and its critique ────────────────────────────────────────

const DEFAULT_PAIRS = new Set(['Inter|Inter', 'Fraunces|Inter', 'Playfair Display|Inter', 'Space Grotesk|Inter', 'Inter|Space Grotesk']);

export interface PlanIssue {
  id: 'tell' | 'no-signature' | 'too-loud' | 'no-detail' | 'default-type' | 'numbering';
  message: string;
}

/** What makes a plan generic, before anything is drawn. */
export function critiquePlan(plan: DesignPlan, d: Pick<ArtDirection, 'compose' | 'look' | 'language' | 'tokens'>, c: PlanContext): PlanIssue[] {
  const out: PlanIssue[] = [];
  const profile: LookProfile = { colors: d.tokens.colors, fonts: d.tokens.fonts, radius: d.tokens.radius, look: d.look };
  for (const h of unaskedTells(profile, c.words, { ownColours: c.ownColours, align: c.align, corners: c.corners })) out.push({ id: 'tell', message: `It falls into ${h.label}, which nobody asked for.` });
  if (!drawableSignatures(d, c).includes(plan.signature)) out.push({ id: 'no-signature', message: 'It has no bold move this design can draw.' });
  const can = drawableSignatures(d, c);
  const loud = [...new Set([...decidedMoves(c.decisions).filter((m) => can.includes(m)), ...inherentMoves(d), plan.signature])];
  if (loud.length > 1) out.push({ id: 'too-loud', message: `It makes ${loud.length} loud moves (${loud.map((m) => SIGNATURE_LABEL[m]).join('; ')}); one is enough.` });
  if (!plan.detail.terms.length) out.push({ id: 'no-detail', message: 'Nothing in it belongs only to this subject.' });
  if (DEFAULT_PAIRS.has(`${d.tokens.fonts.display}|${d.tokens.fonts.body}`)) out.push({ id: 'default-type', message: `${d.tokens.fonts.display} with ${d.tokens.fonts.body} is the default pair.` });
  if (d.look.motifs.includes('numbering') && !/\b(step|steps|stage|stages|process|how it works|first|then|finally|day \d|week \d|chapter|issue no)\b/i.test(c.words)) out.push({ id: 'numbering', message: 'It numbers parts that are not a sequence.' });
  return out;
}

/** A seeded choice between a language's two favourite moves, so projects differ; else the first. */
function chooseSignature(d: Pick<ArtDirection, 'compose' | 'look' | 'language'>, c: PlanContext, r: () => number): Signature {
  const can = drawableSignatures(d, c);
  const decided = decidedMoves(c.decisions).filter((m) => can.includes(m));
  if (decided.length) return decided[0];
  const inherent = inherentMoves(d).filter((m) => can.includes(m));
  if (inherent.length) return inherent[0];
  const pref = (AFFINITY[d.language] ?? ['giant-type', 'colour-field', 'one-motion']).filter((m) => can.includes(m));
  if (pref.length > 1 && r() < 0.5) return pref[1];
  return pref[0] ?? can[0] ?? 'one-motion';
}

/**
 * A direction with its plan, critiqued and revised before anyone sees it. What the critique finds and code can
 * change is changed (another drawable signature; the extra loud moves quieted; a default type pair given the
 * language's second body face; numbering taken off what is not a sequence) and listed in `revised`; what it
 * cannot settle (a subject detail nobody has given) stays in `open`.
 */
export function plannedDirection<D extends ArtDirection>(d: D, c: PlanContext, r: () => number, body2?: string, given?: { detail?: string; signature?: Signature }): D & { designPlan: DesignPlan } {
  let dir: D = { ...d, look: { ...d.look }, tokens: { ...d.tokens, fonts: { ...d.tokens.fonts } }, compose: { ...(d.compose ?? {}) } };
  const revised: string[] = [];
  const decided = decidedMoves(c.decisions).find((m) => drawableSignatures(dir, c).includes(m));
  let signature = decided ?? (given?.signature && drawableSignatures(dir, c).includes(given.signature) ? given.signature : chooseSignature(dir, c, r));
  const fromModel = given?.detail ? { text: given.detail, terms: termsOf(given.detail) } : null;
  const detail = fromModel && fromModel.terms.length ? fromModel : subjectDetail(c.words, c.subject) ?? { text: `[one fact only this ${c.subject || 'subject'} has]`, terms: [] };
  const draft = (): DesignPlan => planOf(dir, signature, detail, revised, []);
  for (const issue of critiquePlan(draft(), dir, c)) {
    if (issue.id === 'no-signature') {
      const can = drawableSignatures(dir, c);
      if (can.length) (signature = chooseSignature(dir, c, r)), revised.push(`Gave it a bold move it can draw: ${SIGNATURE_LABEL[signature]}.`);
    } else if (issue.id === 'too-loud') {
      // the composition's own loud move stays the signature; the others are quieted
      const keep = decided ?? inherentMoves(dir)[0] ?? signature;
      signature = keep;
      if (dir.compose?.stats === 'giant' && keep !== 'oversized-figure') dir = { ...dir, compose: { ...dir.compose, stats: 'row' } };
      if ((dir.compose?.hero === 'poster' || dir.compose?.hero === 'statement') && keep !== 'giant-type') dir = { ...dir, compose: { ...dir.compose, hero: 'editorial' } };
      revised.push(`Kept one loud move (${SIGNATURE_LABEL[keep]}) and quieted the rest.`);
    } else if (issue.id === 'default-type' && body2 && body2 !== dir.tokens.fonts.body && !knownFont(body2)?.displayOnly) {
      dir = { ...dir, tokens: { ...dir.tokens, fonts: { ...dir.tokens.fonts, body: body2 } } };
      revised.push(`Paired the headline face with ${body2} instead of the default pair.`);
    } else if (issue.id === 'numbering' && !d.locks?.includes('motifs')) {
      dir = { ...dir, look: { ...dir.look, motifs: dir.look.motifs.filter((m) => m !== 'numbering') } };
      revised.push('Took the numbering off parts that are not a sequence.');
    }
  }
  const open = critiquePlan(draft(), dir, c)
    .filter((i) => i.id === 'no-detail' || i.id === 'tell')
    .map((i) => (i.id === 'no-detail' ? `Add one detail only this ${c.subject || 'subject'} has: its units, its conventions or its terms.` : i.message));
  dir = drawPlan(dir, signature, c);
  return { ...dir, designPlan: planOf(dir, signature, detail, revised, open) };
}

/**
 * The direction drawn to its plan, in its own fields, so a design generated from it already makes the move
 * (and nothing at generation is left to change): the look's frame and headline motion, the opening's scale and
 * a split's proportion, giant figures only when they are the move. Motion the designer set is theirs.
 */
function drawPlan<D extends ArtDirection>(d: D, sig: Signature, c: PlanContext): D {
  const look = { ...d.look, motion: { ...d.look.motion } };
  const shapes = { ...(d.shapes ?? {}) };
  const compose = { ...(d.compose ?? {}) };
  // the move
  if (sig === 'framed-picture' && look.frame === 'plain') look.frame = 'inset';
  if (sig === 'one-motion' && !c.motionDecided && !['mask', 'words', 'letters'].includes(look.motion.headline)) look.motion = oneMoment(look.motion);
  if (sig === 'giant-type' && shapes.hero) shapes.hero = normalizeShape('hero', { ...shapes.hero, scale: Math.max(1.2, Number(shapes.hero.scale ?? 1)) }) ?? shapes.hero;
  if (sig === 'uneven-split') {
    for (const k of ['booking', 'hero'] as const) {
      const r = shapes[k]?.ratio;
      if (shapes[k] && !sharplyUneven(r)) shapes[k] = normalizeShape(k, { ...shapes[k], ratio: unevenRatio(r) }) ?? shapes[k];
    }
  }
  if (sig === 'oversized-figure' && compose.stats) compose.stats = 'giant';
  // everything around it quiet
  if (sig !== 'one-motion' && !c.motionDecided && ['mask', 'words', 'letters'].includes(look.motion.headline)) look.motion.headline = 'fade';
  if (sig !== 'framed-picture' && c.hasImage && ['arch', 'circle', 'inset'].includes(look.frame)) look.frame = 'plain';
  if (sig !== 'giant-type' && shapes.hero && Number(shapes.hero.scale ?? 1) > 1.05) shapes.hero = normalizeShape('hero', { ...shapes.hero, scale: 1.05 }) ?? shapes.hero;
  if (sig !== 'uneven-split' && !decidedMoves(c.decisions).includes('uneven-split')) {
    for (const k of ['booking', 'hero'] as const) {
      const r = shapes[k]?.ratio;
      if (typeof r === 'number' && sharplyUneven(r)) shapes[k] = normalizeShape(k, { ...shapes[k], ratio: quietRatio(r) }) ?? shapes[k];
    }
  }
  if (sig !== 'oversized-figure' && compose.stats === 'giant') compose.stats = 'row';
  return { ...d, look, ...(d.shapes ? { shapes } : {}), ...(d.compose ? { compose } : {}) };
}

const termsOf = (text: string): string[] => {
  const units: string[] = [...(text.match(/\d+\s?(°C|°|%|m²|min|mins|hours|kg|km|cm|ml)|\b\d{1,2}[:.]\d{2}\b|°C|% RH|hPa|ABV|IBU|m²|\b[A-Z]{2,}\b/g) ?? [])];
  const words: string[] = [...(text.toLowerCase().match(/\b(level|grade|vintage|origin|tide|floor|seats|surface|firing|minutes?)\b/g) ?? [])];
  return [...new Set([...units, ...words])].slice(0, 4);
};

function planOf(d: Pick<ArtDirection, 'tokens' | 'look' | 'composition'>, signature: Signature, detail: { text: string; terms: string[] }, revised: string[], open: string[]): DesignPlan {
  const c = d.tokens.colors;
  const col = (hex: string, role: PlanColour['role']): PlanColour => ({ name: colourName(hex), hex, role });
  const named: PlanColour[] = [
    col(c.background, 'ground'),
    col(c.text, 'ink'),
    col(c.accent, 'accent'),
    ...(d.look.accent2 ? [col(d.look.accent2, 'second')] : []),
    ...(c.surface.toLowerCase() !== c.background.toLowerCase() ? [col(c.surface, 'surface')] : []),
    col(c.muted, 'muted'),
  ].slice(0, 6);
  // two colours of one name read as one: the second says what it is for
  const seen = new Map<string, number>();
  for (const x of named) {
    const k = seen.get(x.name) ?? 0;
    seen.set(x.name, k + 1);
    if (k) x.name = `${x.name}, for ${x.role === 'muted' ? 'secondary text' : x.role}`;
  }
  return {
    colours: named,
    type: { display: d.tokens.fonts.display, body: d.tokens.fonts.body, ...(d.look.mono ? { mono: d.look.mono } : {}), note: `${d.tokens.fonts.display} for headlines, used with restraint; ${d.tokens.fonts.body} for reading${d.look.mono ? `; ${d.look.mono} for figures and labels` : ''}.` },
    layout: (String(d.composition ?? '').split(/(?<=[.;])\s/)[0] || '').slice(0, 200),
    signature,
    signatureSays: SIGNATURE_LABEL[signature],
    detail,
    revised: [...revised],
    open: [...open],
  };
}

/** A stored or model-written plan, held to its shape. */
export function normalizeDesignPlan(v: unknown): DesignPlan | undefined {
  const r = v && typeof v === 'object' ? (v as Record<string, any>) : null;
  if (!r || !(SIGNATURES as readonly string[]).includes(r.signature)) return undefined;
  const str = (x: unknown, n: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const hex = (x: unknown) => (typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x) ? x.toLowerCase() : '');
  const ROLES = ['ground', 'surface', 'ink', 'muted', 'accent', 'second'];
  const colours: PlanColour[] = (Array.isArray(r.colours) ? r.colours : [])
    .map((c: any): PlanColour => ({ name: str(c?.name, 40), hex: hex(c?.hex), role: (ROLES.includes(c?.role) ? c.role : 'accent') as PlanColour['role'] }))
    .filter((c: PlanColour) => c.name && c.hex)
    .slice(0, 6);
  const t = r.type && typeof r.type === 'object' ? r.type : {};
  const det = r.detail && typeof r.detail === 'object' ? r.detail : {};
  return {
    colours,
    type: { display: str(t.display, 40), body: str(t.body, 40), ...(str(t.mono, 40) ? { mono: str(t.mono, 40) } : {}), note: str(t.note, 200) },
    layout: str(r.layout, 200),
    signature: r.signature,
    signatureSays: str(r.signatureSays, 120) || SIGNATURE_LABEL[r.signature as Signature],
    detail: { text: str(det.text, 160), terms: (Array.isArray(det.terms) ? det.terms : []).map((x: unknown) => str(x, 24)).filter(Boolean).slice(0, 4) },
    revised: (Array.isArray(r.revised) ? r.revised : []).map((x: unknown) => str(x, 160)).filter(Boolean).slice(0, 6),
    open: (Array.isArray(r.open) ? r.open : []).map((x: unknown) => str(x, 160)).filter(Boolean).slice(0, 4),
  };
}

/** The plan, as the generator is told it. */
export function planBrief(p: DesignPlan | undefined): string {
  if (!p) return '';
  return `THE DIRECTION'S PLAN (follow it):
- Colours: ${p.colours.map((c) => `${c.name} ${c.hex} (${c.role})`).join(', ')}.
- Type: ${p.type.note}
- Layout: ${p.layout}
- The ONE bold move: ${p.signatureSays}. Everything around it stays quiet: no second huge headline, no second field of colour, no second moment of motion.
- Show this as content, in this subject's own terms: ${p.detail.text}.`;
}

// ── the signature, in a design ───────────────────────────────────────

/** The loud moves a design makes. */
export function loudMoves(spec: { sections: DesignSpec['sections']; look?: Look }): Signature[] {
  const out = new Set<Signature>();
  const hero = spec.sections.find((s) => s.kind === 'hero');
  if (hero && (hero.variant === 'poster' || hero.variant === 'statement' || Number(hero.shape?.scale ?? 1) >= 1.15)) out.add('giant-type');
  const composed = spec.sections.filter((s) => s.kind === 'compose').map((s) => JSON.stringify(s.content?.root ?? {}));
  if (spec.sections.some((s) => s.tone === 'accent' || s.tone === 'accent2') || composed.some((j) => /"t":"box","tone":"(accent|invert)"/.test(j))) out.add('colour-field');
  if (spec.sections.some((s) => (s.kind === 'hero' && s.variant === 'full-bleed') || (s.kind === 'booking' && s.variant === 'immersive') || (s.kind === 'cta' && s.variant === 'image'))) out.add('full-bleed-picture');
  if (spec.sections.some((s) => s.kind === 'stats' && s.variant === 'giant') || composed.some((j) => /"t":"figure"/.test(j))) out.add('oversized-figure');
  if (spec.sections.some((s) => ((s.kind === 'hero' && s.variant === 'split') || (s.kind === 'booking' && (s.variant === 'split' || s.variant === 'calendar'))) && sharplyUneven(s.shape?.ratio))) out.add('uneven-split');
  if (spec.sections.some((s) => s.kind === 'compose' && sharplyUneven(splitShare(s.content?.root)))) out.add('uneven-split');
  const look = spec.look as Look | undefined;
  if (look && ['arch', 'circle', 'inset'].includes(look.frame) && spec.sections.some((s) => s.images.length)) out.add('framed-picture');
  if (look && look.motion.feel !== 'still' && ['mask', 'words', 'letters'].includes(look.motion.headline)) out.add('one-motion');
  return [...out];
}

/**
 * A design that makes its direction's one bold move and keeps everything else quiet. The move is drawn where
 * the design can draw it; another loud move is quieted (a second field of colour to the alternate ground, giant
 * figures to a row, a kinetic headline to a fade…). A section the designer fixed or locked, a picture the
 * decisions call for, and motion the designer set are theirs and left alone.
 */
export function holdSignature(spec: DesignSpec, signature: Signature | undefined, o: { decisions?: LayoutDecisions; motionDecided?: boolean } = {}): { spec: DesignSpec; changes: string[] } {
  if (!signature) return { spec, changes: [] };
  const changes: string[] = [];
  const free = (s: Section) => !s.fixed && !s.locked;
  let sections = spec.sections.map((s) => ({ ...s }));
  let look: Look | undefined = spec.look ? { ...spec.look, motion: { ...spec.look.motion } } : undefined;
  const hero = sections.find((s) => s.kind === 'hero' && free(s));
  const pictureDecided = o.decisions?.pictures === 'dominant' || o.decisions?.lead === 'picture';
  // the move itself
  if (signature === 'giant-type' && hero) hero.shape = normalizeShape('hero', { ...(hero.shape ?? {}), scale: Math.max(1.2, Number(hero.shape?.scale ?? 1)) }) ?? hero.shape;
  if (signature === 'colour-field' && !sections.some((s) => s.tone === 'accent')) {
    const field = colourFieldFor(sections);
    if (field) field.tone = 'accent';
  }
  if (signature === 'oversized-figure') {
    const st = sections.find((s) => s.kind === 'stats' && free(s));
    if (st) st.variant = 'giant';
  }
  if (signature === 'uneven-split' && o.decisions?.arrangement !== 'split') {
    const sp = sections.find((s) => free(s) && ((s.kind === 'hero' && s.variant === 'split') || (s.kind === 'booking' && (s.variant === 'split' || s.variant === 'calendar'))));
    if (sp && !sharplyUneven(sp.shape?.ratio)) sp.shape = normalizeShape(sp.kind, { ...(sp.shape ?? {}), ratio: unevenRatio(sp.shape?.ratio) }) ?? sp.shape;
    const cp = !sp ? sections.find((s) => free(s) && s.kind === 'compose' && splitShare(s.content?.root) !== null) : undefined;
    if (cp && !sharplyUneven(splitShare(cp.content.root))) cp.content = { ...cp.content, root: withCols(cp.content.root, 'sharp') };
  }
  if (signature === 'framed-picture' && look && look.frame === 'plain') look = { ...look, frame: 'inset' };
  if (signature === 'one-motion' && look && !o.motionDecided && !['mask', 'words', 'letters'].includes(look.motion.headline)) look = { ...look, motion: oneMoment(look.motion) };
  // everything around it quiet
  const decided = decidedMoves(o.decisions);
  for (const m of loudMoves({ sections, look: look as Look })) {
    if (m === signature || decided.includes(m)) continue;
    if (m === 'giant-type' && hero) {
      if (Number(hero.shape?.scale ?? 1) > 1.05) hero.shape = normalizeShape('hero', { ...(hero.shape ?? {}), scale: 1.05 }) ?? hero.shape;
    } else if (m === 'colour-field') {
      let n = 0;
      for (const s of sections) if (free(s) && (s.tone === 'accent' || s.tone === 'accent2')) (s.tone = 'alt'), n++;
      if (n) changes.push('Kept one bold move: the fields of colour went back to the page’s own grounds.');
    } else if (m === 'oversized-figure') {
      for (const s of sections) if (s.kind === 'stats' && free(s) && s.variant === 'giant') s.variant = 'row';
    } else if (m === 'uneven-split') {
      for (const s of sections) if (free(s) && typeof s.shape?.ratio === 'number' && sharplyUneven(s.shape.ratio)) s.shape = normalizeShape(s.kind, { ...s.shape, ratio: quietRatio(s.shape.ratio) }) ?? s.shape;
      for (const s of sections) if (free(s) && s.kind === 'compose' && sharplyUneven(splitShare(s.content?.root))) s.content = { ...s.content, root: withCols(s.content.root, 'quiet') };
    } else if (m === 'framed-picture' && look) look = { ...look, frame: 'plain' };
    else if (m === 'one-motion' && look && !o.motionDecided) look = { ...look, motion: { ...look.motion, headline: 'fade' } };
    else if (m === 'full-bleed-picture' && !pictureDecided) {
      // a full picture that is not the move is set beside the words instead (the picture is kept)
      for (const s of sections) if (s.kind === 'hero' && s.variant === 'full-bleed' && free(s) && s.images.length) s.variant = 'split';
    }
  }
  sections = sections.map((s, i) => (JSON.stringify(s) === JSON.stringify(spec.sections[i]) ? spec.sections[i] : s));
  const same = sections.every((s, i) => s === spec.sections[i]) && JSON.stringify(look) === JSON.stringify(spec.look);
  return same ? { spec, changes } : { spec: { ...spec, sections, ...(look ? { look } : {}) }, changes };
}

/**
 * The part of a page that can carry a field of the accent: an action, figures or a quote; else the points or the
 * text; else the work, its pictures set on a band of colour.
 */
export function colourFieldFor<S extends Pick<Section, 'kind' | 'fixed' | 'locked'>>(sections: S[]): S | undefined {
  const free = (s: S) => !s.fixed && !s.locked;
  for (const kinds of [['cta', 'stats', 'quote'], ['features', 'text'], ['gallery']]) {
    const s = sections.find((x) => free(x) && kinds.includes(x.kind));
    if (s) return s;
  }
  return undefined;
}

/** A composed section's two columns set sharply uneven, or brought back to a considered proportion; the wider side stays wider. */
function withCols(root: any, to: 'sharp' | 'quiet'): any {
  const [a, b] = root.cols as number[];
  const wideFirst = a >= b;
  return { ...root, cols: to === 'sharp' ? (wideFirst ? [2, 1] : [1, 2]) : wideFirst ? [7, 5] : [5, 7] };
}

/** Does the design show the plan's subject detail? Any of its terms, anywhere in the words. */
export function showsDetail(spec: Pick<DesignSpec, 'sections'>, plan: DesignPlan | undefined): boolean {
  if (!plan || !plan.detail.terms.length) return true;
  const text = JSON.stringify(spec.sections.map((s) => s.content)).toLowerCase();
  return plan.detail.terms.some((t) => text.includes(t.toLowerCase()));
}
