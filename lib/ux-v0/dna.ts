// lib/ux-v0/dna.ts — Creative DNA: the project's design language as a few decisions the designer controls.
//
// A project's DNA is a handful of dimensions, each a position between two poles:
//
//   restraint     Minimal ↔ Expressive       ornament, a second ink, frames, boxes, how loud the page is
//   composition   Structured ↔ Experimental  the grid, the rhythm, the opening, proportions, the page's plan
//   typography    Functional ↔ Editorial     the type scale, the headline face, its weight, labels, emphasis
//   motion        Subtle ↔ Immersive         how it moves: stillness, arrivals, parallax, scroll, hover
//   density       Airy ↔ Dense               space, the measure, how much each screen holds
//
// and, where the project needs them: colour (Quiet ↔ Vivid), imagery (Documentary ↔ Stylised), interaction
// (Calm ↔ Tactile) and information (Glanceable ↔ Detailed).
//
// IT IS DERIVED, AND IT IS THE DESIGNER'S. deriveDNA() reads the Living Brief, its decisions, the moodboard's
// references (their measured principles, lib/ux-v0/ref-dna.ts, and what the designer said to take or leave)
// and the kind of work, and places each dimension, saying why. Whatever the designer sets or locks is theirs:
// a new derivation never moves it. A dimension left to SocriaUX follows the brief and the references as they
// change.
//
// IT DRAWS THE DESIGN, NOT THE PROMPT. The engine (lib/ux-v0/direction.ts) chooses visual languages by their own
// DNA (LANGUAGE_DNA), and shapeByDNA() sets each direction's type scale and headline face, grid, rhythm, opening,
// ornament, second ink, motion, spacing, treatment of pictures and hover from it; plans and section layouts are
// ranked by it (PLAN_DNA, BOOKING_DNA). After generation, fitDNA() holds every locked dimension whatever the
// model wrote, and a change that would move one is asked about first (lockedDnaMoves). A design's own DNA can
// be read back (dnaOfDesign), so how far a design is from its DNA is measured, and dnaPatches() moves it
// there, dimension by dimension, as a new version Undo takes back.
//
// It is compact state — numbers, locks and a reason each — stored in the project, and costs no model call.

import { hslHex, hslOf, isDark } from './color';
import { FONTS, knownFont, nearestWeight } from './fonts';
import { motionFor } from './motion';
import { ensureContrast, normalizeShape, type DesignSpec, type DesignTokens, type Look, type Motion, type Patch } from './spec';
import type { DesignBrief, Moodboard, MoodboardRef, RefAspect } from './types';

// ── the dimensions ───────────────────────────────────────────────────

export const DNA_CORE = ['restraint', 'composition', 'typography', 'motion', 'density'] as const;
export const DNA_EXTRA = ['colour', 'imagery', 'interaction', 'information'] as const;
export const DNA_KEYS = [...DNA_CORE, ...DNA_EXTRA] as const;
export type DnaKey = (typeof DNA_KEYS)[number];
export type DnaVector = Partial<Record<DnaKey, number>>;

export interface DnaMeta {
  label: string;
  low: string;
  high: string;
  /** a word for each fifth of the range */
  words: [string, string, string, string, string];
  /** what it changes, said once, for the designer */
  draws: string;
}

export const DNA_META: Record<DnaKey, DnaMeta> = {
  restraint: { label: 'Visual restraint', low: 'Minimal', high: 'Expressive', words: ['Austere', 'Restrained', 'Balanced', 'Expressive', 'Exuberant'], draws: 'ornament, a second ink, frames, boxes and how loud the page is' },
  composition: { label: 'Composition', low: 'Structured', high: 'Experimental', words: ['Strict grid', 'Structured', 'Considered', 'Off-grid', 'Experimental'], draws: 'the grid, the rhythm, the opening and the proportions of the page' },
  typography: { label: 'Typography', low: 'Functional', high: 'Editorial', words: ['Utilitarian', 'Functional', 'Balanced', 'Editorial', 'Statement type'], draws: 'the type scale, the headline face and its weight, labels and emphasis' },
  motion: { label: 'Motion', low: 'Subtle', high: 'Immersive', words: ['Still', 'Subtle', 'Measured', 'Lively', 'Immersive'], draws: 'how the page moves: arrivals, the headline, parallax, scroll and hover' },
  density: { label: 'Visual density', low: 'Airy', high: 'Dense', words: ['Gallery air', 'Airy', 'Balanced', 'Dense', 'Packed'], draws: 'space, the measure and how much each screen holds' },
  colour: { label: 'Colour', low: 'Quiet', high: 'Vivid', words: ['Near-mono', 'Quiet', 'Balanced', 'Vivid', 'Saturated'], draws: 'how saturated the accent is, and whether a second ink joins it' },
  imagery: { label: 'Imagery', low: 'Documentary', high: 'Stylised', words: ['Documentary', 'Natural', 'Treated', 'Stylised', 'Graphic'], draws: 'how pictures are treated: natural, muted, duotone, high contrast' },
  interaction: { label: 'Interaction', low: 'Calm', high: 'Tactile', words: ['Quiet', 'Calm', 'Responsive', 'Tactile', 'Physical'], draws: 'how buttons and links answer a pointer' },
  information: { label: 'Information', low: 'Glanceable', high: 'Detailed', words: ['At a glance', 'Glanceable', 'Balanced', 'Detailed', 'Exhaustive'], draws: 'whether the key figures or the detailed tables lead' },
};

export type DnaSource = 'designer' | 'brief' | 'references' | 'kind';

export interface DnaDim {
  value: number;
  locked: boolean;
  source: DnaSource;
  /** why it sits there, in a phrase or two */
  because: string[];
}

export interface CreativeDNA {
  v: 1;
  dims: Partial<Record<DnaKey, DnaDim>>;
  /** what the derived dimensions were read from, so a new derivation happens only when it changed */
  basis: string;
  updatedAt: number;
}

export const dnaWord = (key: DnaKey, value: number) => DNA_META[key].words[Math.max(0, Math.min(4, Math.floor(value / 20)))];
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r0 = (n: number) => Math.round(clamp(n));

/** The dimensions this kind of work has: the five, and those its kind needs. */
export function dnaKeysFor(kind: string, hasImages: boolean): DnaKey[] {
  const out: DnaKey[] = [...DNA_CORE, 'colour'];
  if (hasImages || kind === 'portfolio' || kind === 'editorial' || kind === 'site') out.push('imagery');
  if (['booking', 'checkout', 'form', 'flow', 'app', 'interactive'].includes(kind)) out.push('interaction');
  if (kind === 'dashboard' || kind === 'data') out.push('information');
  return out;
}

export function emptyDNA(): CreativeDNA {
  return { v: 1, dims: {}, basis: '', updatedAt: 0 };
}

export function normalizeDNA(v: unknown): CreativeDNA | undefined {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : null;
  if (!r) return undefined;
  const dims: Partial<Record<DnaKey, DnaDim>> = {};
  const src = r.dims && typeof r.dims === 'object' ? (r.dims as Record<string, any>) : {};
  for (const k of DNA_KEYS) {
    const d = src[k];
    if (!d || typeof d !== 'object' || typeof d.value !== 'number' || !Number.isFinite(d.value)) continue;
    dims[k] = {
      value: r0(d.value),
      locked: d.locked === true,
      source: (['designer', 'brief', 'references', 'kind'] as const).includes(d.source) ? d.source : 'kind',
      because: (Array.isArray(d.because) ? d.because : []).filter((x: unknown) => typeof x === 'string').map((x: string) => x.replace(/\s+/g, ' ').trim().slice(0, 140)).slice(0, 4),
    };
  }
  return { v: 1, dims, basis: typeof r.basis === 'string' ? r.basis.slice(0, 64) : '', updatedAt: typeof r.updatedAt === 'number' && r.updatedAt > 0 ? r.updatedAt : 0 };
}

/** A short key of what the DNA says (values and locks): directions drawn from another DNA are drawn again. */
export function dnaKeyOf(dna: CreativeDNA | null | undefined): string {
  if (!dna) return '';
  const text = DNA_KEYS.filter((k) => dna.dims[k]).map((k) => `${k}${dna.dims[k]!.value}${dna.dims[k]!.locked ? 'L' : ''}`).join('');
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** The values, each dimension's own or the middle when it has none. */
export function dnaValues(dna: CreativeDNA | DnaVector | null | undefined): Record<DnaKey, number> {
  const out = {} as Record<DnaKey, number>;
  for (const k of DNA_KEYS) {
    const x = dna && 'dims' in dna ? (dna as CreativeDNA).dims[k]?.value : (dna as DnaVector | undefined)?.[k];
    out[k] = typeof x === 'number' ? x : 50;
  }
  return out;
}

/** How much a dimension may steer: what the designer set or locked, fully; the brief or references, mostly; a prior, barely. */
export function strengthOf(dim: DnaDim | undefined): number {
  if (!dim) return 0;
  if (dim.locked || dim.source === 'designer') return 1;
  if (dim.source === 'brief' || dim.source === 'references') return 0.7;
  return 0.2;
}

/** The DNA as a vector and its strengths, for the engine. */
export function dnaSteer(dna: CreativeDNA | null | undefined): { vector: DnaVector; strength: Partial<Record<DnaKey, number>>; info: number; own: number; refs: number; brief: number } {
  const vector: DnaVector = {};
  const strength: Partial<Record<DnaKey, number>> = {};
  if (!dna) return { vector, strength, info: 0, own: 0, refs: 0, brief: 0 };
  for (const k of DNA_KEYS) {
    const d = dna.dims[k];
    if (!d) continue;
    vector[k] = d.value;
    strength[k] = strengthOf(d);
  }
  const core = DNA_CORE.map((k) => strength[k] ?? 0);
  // where the core came from: the designer (set or locked), their references, the brief's words
  const share = (f: (d: DnaDim) => boolean) => DNA_CORE.filter((k) => dna.dims[k] && f(dna.dims[k]!)).length / DNA_CORE.length;
  const own = share((d) => d.locked || d.source === 'designer');
  const refs = share((d) => !d.locked && d.source === 'references');
  const brief = share((d) => !d.locked && d.source === 'brief');
  return { vector, strength, info: core.reduce((s, x) => s + x, 0) / core.length, own, refs, brief };
}

/**
 * How much say the DNA has in which visual languages come forward (0–0.7): as far as the designer set it. A DNA
 * SocriaUX derived from the brief is mostly the brief's own words again, so it only nudges; one read from the
 * references adds what the words could not say.
 */
export function dnaSay(dna: CreativeDNA | null | undefined): number {
  if (!dna) return 0;
  const st = dnaSteer(dna);
  return Math.min(0.7, 0.6 * st.own + 0.25 * st.refs + 0.06 * st.brief);
}

// ── deriving it ──────────────────────────────────────────────────────

/** Priors by kind of work: where a dimension sits when nothing else says. */
const KIND_PRIOR: Record<string, DnaVector> = {
  site: { restraint: 45, composition: 45, typography: 50, motion: 40, density: 45, colour: 45, imagery: 40 },
  portfolio: { restraint: 50, composition: 62, typography: 62, motion: 45, density: 28, colour: 40, imagery: 50 },
  editorial: { restraint: 35, composition: 50, typography: 80, motion: 28, density: 58, colour: 35, imagery: 40 },
  booking: { restraint: 35, composition: 30, typography: 32, motion: 25, density: 48, colour: 42, interaction: 50 },
  checkout: { restraint: 30, composition: 22, typography: 25, motion: 20, density: 50, colour: 38, interaction: 45 },
  form: { restraint: 30, composition: 22, typography: 28, motion: 18, density: 45, colour: 38, interaction: 45 },
  flow: { restraint: 32, composition: 25, typography: 30, motion: 25, density: 45, colour: 40, interaction: 50 },
  app: { restraint: 35, composition: 28, typography: 28, motion: 30, density: 55, colour: 40, interaction: 55 },
  interactive: { restraint: 60, composition: 60, typography: 55, motion: 70, density: 40, colour: 55, interaction: 70 },
  dashboard: { restraint: 25, composition: 18, typography: 18, motion: 12, density: 74, colour: 30, information: 62 },
  data: { restraint: 30, composition: 25, typography: 25, motion: 18, density: 66, colour: 35, information: 60 },
};

/** Words that place a dimension: each a pattern and where it puts it. Read with negation ("not busy" is airy). */
const WORDS: Record<DnaKey, [RegExp, number][]> = {
  restraint: [
    [/\b(minimal|minimalist|restrained|understated|spare|austere|pared[- ]back|quiet|serene|refined|discreet|subtle|clean|muted|sober)\b/, 15],
    [/\b(luxur(y|ious)|elegant|timeless|calm|gallery|considered)\b/, 28],
    [/\b(bold|expressive|vibrant|loud|punchy|striking|maximal(ist)?|exuberant|playful|eclectic|daring|wild|joyful|fun|energetic|rebellious|chaotic|zine|punk)\b/, 85],
  ],
  composition: [
    [/\b(structured|systematic|rigorous|ordered|orderly|organised|organized|grid|modular|rational|swiss|methodical|precise|logical|functional|efficient|clear)\b/, 18],
    [/\b(editorial|magazine|asymmetric(al)?|off[- ]cent(re|er))\b/, 64],
    [/\b(experimental|unconventional|avant[- ]garde|broken grid|collage|layered|unexpected|brutalist|deconstructed|generative|artistic|sculptural|irregular)\b/, 88],
  ],
  typography: [
    [/\b(functional|utilitarian|legible|readable|technical|neutral|plain|systematic|data[- ]dense|interface|ui)\b/, 15],
    [/\b(editorial|magazine|literary|serif|bookish|journal|typographic|lettering|elegant|luxur(y|ious)|fashion|couture)\b/, 82],
    [/\b(statement|poster|giant type|huge type|big type|expressive type)\b/, 92],
  ],
  motion: [
    [/\b(static|still|motionless|no (motion|animation)|reduced motion)\b/, 4],
    [/\b(subtle|calm|gentle|quiet|understated|accessible)\b/, 25],
    [/\b(dynamic|animated|animation|motion|kinetic|lively|energetic|moving)\b/, 75],
    [/\b(immersive|cinematic|scroll[- ](driven|telling)|parallax|interactive story|theatrical)\b/, 90],
  ],
  density: [
    [/\b(airy|spacious|generous|breathing room|white ?space|open|uncluttered|sparse|gallery|calm)\b/, 15],
    [/\b(dense|compact|information[- ]rich|data[- ]rich|detailed|busy|packed|efficient|newspaper|catalogue|inventory)\b/, 82],
  ],
  colour: [
    [/\b(monochrome|mono|black and white|muted|neutral|desaturated|tonal|quiet colou?rs?|earthy|natural tones)\b/, 15],
    [/\b(colou?rful|vibrant|saturated|neon|bright colou?rs?|vivid|multicolou?r|electric|bold colou?rs?)\b/, 85],
  ],
  imagery: [
    [/\b(documentary|natural|candid|authentic|real people|photojournalis(m|tic)|unretouched)\b/, 15],
    [/\b(stylised|stylized|graphic|duotone|illustrat(ed|ion)|treated|high contrast|surreal|editorial photography)\b/, 82],
  ],
  interaction: [
    [/\b(calm|quiet|minimal interaction|unobtrusive)\b/, 20],
    [/\b(tactile|playful|responsive|physical|bouncy|delightful|micro[- ]interactions?)\b/, 82],
  ],
  information: [
    [/\b(at a glance|glanceable|summary|overview|simple|kpis?|key (figures|numbers|metrics)( first)?|figures first)\b/, 22],
    [/\b(detailed|granular|drill[- ]down|in depth|tables?|exhaustive|every (row|record|reading))\b/, 80],
  ],
};

/** A negation just before a word ("not busy", "no gradients, glows"): one word may stand between; a sentence may not. */
const NEGATION = /\b(no|not|without|avoid|never|less|non|nothing)\b(\W+\w+)?\W*$/;

/** Votes the words cast for one dimension: where each match puts it, and the words said. */
function wordVotes(text: string, key: DnaKey): { votes: number[]; said: string[] } {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const votes: number[] = [];
  const said: string[] = [];
  for (const [re, at] of WORDS[key]) {
    const g = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(t))) {
      // what comes just before, within its own sentence or clause (". warm, calm" is not negated by "nothing loud")
      const before = t.slice(Math.max(0, m.index - 24), m.index).split(/[.;:!?]/).pop() ?? '';
      const negated = NEGATION.test(before);
      votes.push(negated ? 100 - at : at);
      said.push(negated ? `not ${m[0]}` : m[0]);
      if (votes.length > 8) break;
    }
  }
  return { votes, said: [...new Set(said)].slice(0, 3) };
}

/** What a reference says about each dimension, measured from its pixels (lib/ux-v0/ref-dna.ts) and read by a model. */
export interface RefDna {
  /** where each dimension sits for this reference, as measured */
  votes: DnaVector;
  /** what was measured, in phrases ("generous negative space", "near-monochrome") */
  said: string[];
  /** how it was read: measured from its pixels, and/or read by a model */
  via: ('pixels' | 'model' | 'motion')[];
  /** the image this was measured from, so it is not measured again */
  of: string;
}

/** A reference's measured DNA as stored, or nothing when it does not hold together. */
export function normalizeRefDna(v: unknown): RefDna | undefined {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : null;
  if (!r || typeof r.of !== 'string' || !r.of) return undefined;
  const votes: DnaVector = {};
  const src = r.votes && typeof r.votes === 'object' ? (r.votes as Record<string, unknown>) : {};
  for (const k of DNA_KEYS) if (typeof src[k] === 'number' && Number.isFinite(src[k])) votes[k] = r0(src[k] as number);
  if (!Object.keys(votes).length) return undefined;
  const via = [...new Set((Array.isArray(r.via) ? r.via : []).filter((x: unknown): x is RefDna['via'][number] => x === 'pixels' || x === 'model' || x === 'motion'))] as RefDna['via'];
  if (!via.length) return undefined;
  const said = (Array.isArray(r.said) ? r.said : []).filter((x: unknown) => typeof x === 'string').map((x: string) => x.replace(/\s+/g, ' ').trim().slice(0, 100)).filter(Boolean).slice(0, 8);
  return { votes, said, via, of: r.of.slice(0, 120) };
}

/** The dimensions an aspect of a reference speaks to. */
const ASPECT_DIMS: Record<RefAspect, DnaKey[]> = {
  atmosphere: ['restraint', 'composition', 'density', 'colour', 'imagery', 'motion', 'typography'],
  colour: ['colour', 'restraint'],
  typography: ['typography'],
  composition: ['composition', 'density'],
  imagery: ['imagery', 'restraint'],
  texture: ['imagery', 'density'],
  motion: ['motion', 'interaction'],
};

export interface DnaInput {
  brief: DesignBrief | null;
  board: Moodboard | null;
  /** each reference's measured DNA, by its id */
  refs?: Record<string, RefDna>;
  /** the kind of work (lib/ux-v0/intent.ts) */
  kind: string;
  /** what else the designer said: the first words, the answers */
  words?: string;
}

/** A fingerprint of what derivation reads, so it runs again only when that changed. */
export function dnaBasis(input: DnaInput): string {
  const b = input.brief;
  const refs = (input.board?.refs ?? []).filter((r) => r.state === 'kept' || r.avoid).map((r) => `${r.id}:${r.state}:${r.key ? 1 : 0}:${r.avoid ? 1 : 0}:${(r.take ?? []).join('+')}:${(r.leave ?? []).join('+')}:${(input.refs?.[r.id] ?? r.dna)?.via?.join('+') ?? ''}`);
  const text = [input.kind, b?.objective, b?.visualDirection, b?.layoutDirection, (b?.personality ?? []).join(','), (b?.rules ?? []).join(','), b?.spec?.density, b?.spec?.motion?.feel, b?.layout?.arrangement, b?.layout?.align, b?.typography?.display, input.words ?? '', refs.join('|')].join('¦');
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const takeOf = (r: MoodboardRef) => ({ take: r.take ?? [], leave: r.leave ?? [] });

/**
 * The project's DNA, read from the brief, the moodboard and the kind of work. A dimension the designer set or
 * locked in `prior` stays exactly as it is; the others follow what they are read from.
 */
export function deriveDNA(input: DnaInput, prior?: CreativeDNA | null): CreativeDNA {
  const b = input.brief;
  const kind = input.kind || 'site';
  const hasImages = (b?.references ?? []).length > 0 || (input.board?.refs ?? []).some((r) => r.state === 'kept' && r.asContent);
  // the kind's own dimensions, and any the designer added (the DNA is extendable: a dimension added stays)
  const keys = [...new Set([...dnaKeysFor(kind, hasImages), ...(Object.keys(prior?.dims ?? {}) as DnaKey[])])].filter((k) => DNA_KEYS.includes(k));
  const prior0 = KIND_PRIOR[kind] ?? KIND_PRIOR.site;
  const briefText = b ? [b.visualDirection, b.layoutDirection, b.personality.join(', '), (b.rules ?? []).join('. '), b.objective].join('. ') : '';
  const said = [input.words ?? '', briefText].join('. ');
  const kept = (input.board?.refs ?? []).filter((r) => r.state === 'kept' && !r.avoid);
  const avoided = (input.board?.refs ?? []).filter((r) => r.avoid);
  const dims: Partial<Record<DnaKey, DnaDim>> = {};
  for (const k of keys) {
    const own = prior?.dims[k];
    if (own && (own.locked || own.source === 'designer')) {
      dims[k] = own;
      continue;
    }
    // [value, weight, where it came from, why]
    const votes: [number, number, DnaSource, string][] = [];
    const p = prior0[k];
    if (typeof p === 'number') votes.push([p, 0.6, 'kind', `typical of ${kind === 'site' ? 'a website' : `a ${kind}`}`]);
    // the brief's decisions: what the designer settled in it
    if (b) {
      if (k === 'density' && b.spec?.density) votes.push([b.spec.density === 'spacious' ? 15 : b.spec.density === 'compact' ? 82 : 50, 3, 'brief', `density set to ${b.spec.density} in the brief`]);
      if (k === 'motion' && b.spec?.motion) votes.push([({ still: 3, calm: 25, measured: 45, lively: 72, kinetic: 90 } as Record<string, number>)[b.spec.motion.feel] ?? 40, 3, 'brief', `motion set to ${b.spec.motion.feel} in the brief`]);
      if (k === 'composition' && b.layout?.arrangement) votes.push([b.layout.arrangement === 'asymmetric' ? 72 : b.layout.arrangement === 'layered' ? 76 : b.layout.arrangement === 'single' ? 30 : 38, 2.5, 'brief', `an arrangement you decided (${b.layout.arrangement})`]);
      if (k === 'composition' && b.layout?.align === 'center') votes.push([28, 1.5, 'brief', 'a centred layout you decided']);
      if (k === 'restraint' && b.layout?.pictures === 'dominant') votes.push([62, 1, 'brief', 'pictures lead, as you decided']);
      if (k === 'typography' && b.typography?.display) {
        const f = knownFont(b.typography.display);
        if (f) votes.push([f.displayOnly ? 80 : f.kind === 'serif' ? 70 : f.kind === 'mono' ? 18 : 40, 1, 'brief', `${b.typography.display} for headlines`]);
      }
    }
    // the words
    const w = wordVotes(said, k);
    for (const v of w.votes) votes.push([v, 1.3, 'brief', `your words: “${w.said.join('”, “')}”`]);
    // the references: measured, and what the designer said to take or leave
    for (const r of kept) {
      const m = input.refs?.[r.id] ?? r.dna;
      if (!m || typeof m.votes[k] !== 'number') continue;
      const { take, leave } = takeOf(r);
      const speaks = (as: RefAspect[]) => as.some((a) => ASPECT_DIMS[a].includes(k));
      const liked = speaks(take);
      const disliked = speaks(leave);
      if (disliked) votes.push([100 - (m.votes[k] as number), 1.4, 'references', `what you leave from “${r.title || 'a reference'}”`]);
      else votes.push([m.votes[k] as number, (r.key ? 1.6 : 0.8) * (liked ? 2.2 : 1), 'references', `${liked ? 'what you take from' : ''} “${r.title || 'a reference'}”${m.said[0] ? `: ${m.said[0]}` : ''}`.trim()]);
    }
    for (const r of avoided) {
      const m = input.refs?.[r.id] ?? r.dna;
      if (!m || typeof m.votes[k] !== 'number') continue;
      votes.push([100 - (m.votes[k] as number), 0.9, 'references', `away from “${r.title || 'a reference'}”`]);
    }
    const total = votes.reduce((s, v) => s + v[1], 0);
    const value = total ? votes.reduce((s, v) => s + v[0] * v[1], 0) / total : 50;
    const bySource = (['brief', 'references', 'kind'] as const).map((s) => [s, votes.filter((v) => v[2] === s).reduce((t, v) => t + v[1], 0)] as const);
    const source = [...bySource].sort((x, y) => y[1] - x[1])[0][0];
    const because = [...new Set(votes.filter((v) => v[2] !== 'kind' || votes.every((x) => x[2] === 'kind')).sort((x, y) => y[1] - x[1]).map((v) => v[3]))].slice(0, 3);
    dims[k] = { value: r0(value), locked: own?.locked ?? false, source, because };
  }
  return { v: 1, dims, basis: dnaBasis(input), updatedAt: Date.now() };
}

/** A dimension added to the DNA (one its kind does not have by default): derived like the others, then the designer's to set. */
export function addDim(dna: CreativeDNA, key: DnaKey, input: DnaInput): CreativeDNA {
  if (dna.dims[key]) return dna;
  const placeholder: CreativeDNA = { ...dna, dims: { ...dna.dims, [key]: { value: 50, locked: false, source: 'kind', because: [] } } };
  const derived = deriveDNA(input, placeholder);
  return { ...dna, dims: { ...dna.dims, [key]: derived.dims[key] ?? placeholder.dims[key]! }, updatedAt: Date.now() };
}

/** A dimension taken out of the DNA (only one that was added: the kind's own stay). */
export function removeDim(dna: CreativeDNA, key: DnaKey): CreativeDNA {
  const dims = { ...dna.dims };
  delete dims[key];
  return { ...dna, dims, updatedAt: Date.now() };
}

/** The designer sets a dimension: theirs from now on. */
export function setDim(dna: CreativeDNA, key: DnaKey, value: number): CreativeDNA {
  const was = dna.dims[key];
  return { ...dna, dims: { ...dna.dims, [key]: { value: r0(value), locked: was?.locked ?? false, source: 'designer', because: ['set by you'] } }, updatedAt: Date.now() };
}

/** Lock or unlock a dimension: a locked one holds through directions, generation and every change. */
export function lockDim(dna: CreativeDNA, key: DnaKey, locked: boolean): CreativeDNA {
  const was = dna.dims[key] ?? { value: 50, locked: false, source: 'kind' as DnaSource, because: [] };
  return { ...dna, dims: { ...dna.dims, [key]: { ...was, locked } }, updatedAt: Date.now() };
}

/** Give a dimension back to SocriaUX: unlocked, and read again from the brief and references. */
export function releaseDim(dna: CreativeDNA, key: DnaKey, input: DnaInput): CreativeDNA {
  // kept in the DNA, but SocriaUX's again: read afresh like any dimension the designer has not set
  const dims = { ...dna.dims, [key]: { value: 50, locked: false, source: 'kind' as DnaSource, because: [] } };
  const fresh = deriveDNA(input, { ...dna, dims });
  return { ...dna, dims: { ...dna.dims, [key]: fresh.dims[key] ?? { value: 50, locked: false, source: 'kind', because: [] } }, updatedAt: Date.now() };
}

/**
 * The direction the designer chose, adopted: where it leaned away from the DNA (a bolder or quieter reading of what
 * SocriaUX placed), the DNA follows it — chosen, so the designer's from now on. What they set or locked is untouched.
 */
export function adoptLean(dna: CreativeDNA, lean: DnaVector | undefined, name: string): CreativeDNA {
  if (!lean) return dna;
  const dims = { ...dna.dims };
  let moved = false;
  for (const k of DNA_KEYS) {
    const d = dims[k];
    const v = lean[k];
    if (!d || typeof v !== 'number' || d.locked || d.source === 'designer' || Math.abs(v - d.value) < 1) continue;
    dims[k] = { value: r0(v), locked: false, source: 'designer', because: [`from the direction you chose (${name.slice(0, 60)})`] };
    moved = true;
  }
  return moved ? { ...dna, dims, updatedAt: Date.now() } : dna;
}

/** Everything back to SocriaUX, locks kept. */
export function delegateAll(dna: CreativeDNA, input: DnaInput): CreativeDNA {
  // every dimension stays in the DNA; all but the locked ones are SocriaUX's to read again
  const dims: Partial<Record<DnaKey, DnaDim>> = {};
  for (const k of DNA_KEYS) if (dna.dims[k]) dims[k] = dna.dims[k]!.locked ? dna.dims[k] : { value: 50, locked: false, source: 'kind', because: [] };
  return deriveDNA(input, { ...dna, dims });
}

// ── the engine: languages, plans and layouts by their own DNA ────────

/** Where each visual language (lib/ux-v0/direction.ts LANGUAGES) sits, by its own nature. */
export const LANGUAGE_DNA: Record<string, DnaVector> = {
  broadsheet: { restraint: 30, composition: 40, typography: 85, motion: 30, density: 62, colour: 25, imagery: 30, interaction: 25, information: 60 },
  swiss: { restraint: 40, composition: 25, typography: 45, motion: 55, density: 45, colour: 55, imagery: 50, interaction: 60, information: 50 },
  'quiet-luxury': { restraint: 15, composition: 50, typography: 82, motion: 30, density: 15, colour: 15, imagery: 40, interaction: 25, information: 35 },
  poster: { restraint: 90, composition: 78, typography: 72, motion: 85, density: 55, colour: 90, imagery: 80, interaction: 85, information: 40 },
  craft: { restraint: 55, composition: 45, typography: 50, motion: 40, density: 50, colour: 50, imagery: 35, interaction: 50, information: 40 },
  geometric: { restraint: 50, composition: 55, typography: 45, motion: 50, density: 40, colour: 55, imagery: 45, interaction: 55, information: 45 },
  utility: { restraint: 22, composition: 15, typography: 15, motion: 25, density: 85, colour: 30, imagery: 20, interaction: 30, information: 82 },
  gallery: { restraint: 10, composition: 65, typography: 55, motion: 15, density: 10, colour: 10, imagery: 25, interaction: 15, information: 30 },
  organic: { restraint: 30, composition: 45, typography: 55, motion: 35, density: 25, colour: 35, imagery: 30, interaction: 40, information: 35 },
  civic: { restraint: 25, composition: 10, typography: 20, motion: 10, density: 55, colour: 45, imagery: 15, interaction: 20, information: 60 },
  night: { restraint: 65, composition: 65, typography: 65, motion: 75, density: 30, colour: 50, imagery: 70, interaction: 60, information: 40 },
  'retro-print': { restraint: 85, composition: 60, typography: 62, motion: 80, density: 65, colour: 85, imagery: 85, interaction: 80, information: 45 },
};

/** Where each page plan (direction.ts SITE_PLANS…) sits. */
export const PLAN_DNA: Record<string, DnaVector> = {
  statement: { composition: 55, restraint: 50, typography: 78, density: 35 },
  'image-led': { composition: 60, restraint: 60, imagery: 65, density: 35 },
  index: { composition: 25, restraint: 30, typography: 70, density: 66 },
  poster: { composition: 85, restraint: 85, typography: 78, density: 50 },
  'side-by-side': { composition: 35, restraint: 40, density: 45 },
  centred: { composition: 18, restraint: 25, density: 28 },
  composed: { composition: 78, restraint: 55, density: 45 },
  'work-first': { composition: 55, restraint: 50, imagery: 60, density: 40 },
  'work-index': { composition: 28, typography: 66, density: 62 },
  'one-piece': { composition: 66, restraint: 55, density: 22 },
  'long-read': { composition: 30, typography: 86, density: 55 },
  magazine: { composition: 62, typography: 86, density: 62 },
  'text-first': { composition: 45, typography: 82, density: 50 },
  // a working screen's plans (dashboards, data): what leads, and how much it holds
  'figures-first': { information: 22, composition: 30, restraint: 35, density: 50, typography: 30 },
  'detail-first': { information: 85, composition: 15, restraint: 20, density: 82, typography: 15 },
  'trend-first': { information: 45, composition: 62, restraint: 62, motion: 55, density: 38, typography: 45 },
  // a form's plans
  'one-column': { composition: 15, density: 40, restraint: 25 },
  split: { composition: 58, density: 45, restraint: 45 },
};

/** Where each composition of the booking (spec.ts booking variants) sits. */
export const BOOKING_DNA: Record<string, DnaVector> = {
  strip: { composition: 35, density: 42 },
  calendar: { composition: 25, density: 66, information: 60 },
  list: { composition: 18, density: 60, typography: 58 },
  split: { composition: 58, density: 45 },
  immersive: { composition: 74, restraint: 70, imagery: 70, density: 28 },
};

/** How close a thing's own DNA is to the target: 1 the same, −1 opposite; weighted by how much each dimension steers. */
export function affinity(own: DnaVector | undefined, target: DnaVector, strength: Partial<Record<DnaKey, number>> = {}): number {
  if (!own) return 0;
  let num = 0;
  let den = 0;
  for (const k of DNA_KEYS) {
    const a = own[k];
    const t = target[k];
    if (typeof a !== 'number' || typeof t !== 'number') continue;
    const w = strength[k] ?? 0.5;
    if (w <= 0) continue;
    num += w * (1 - Math.abs(a - t) / 50);
    den += w;
  }
  return den ? Math.max(-1, Math.min(1, num / den)) : 0;
}

/** How different two DNA are, 0 (the same) to 1 (opposite), over the dimensions both have. */
export function dnaDistance(a: DnaVector | undefined, b: DnaVector | undefined): number {
  if (!a || !b) return 0;
  const ks = DNA_KEYS.filter((k) => typeof a[k] === 'number' && typeof b[k] === 'number');
  return ks.length ? ks.reduce((s, k) => s + Math.abs((a[k] as number) - (b[k] as number)), 0) / (ks.length * 100) : 0;
}

/**
 * Controlled divergence: the DNA each of three directions explores. The first is the designer's as it is; the
 * second leans bolder, the third quieter — but only along the dimensions SocriaUX placed: what the designer set
 * or locked is the same in all three.
 */
export function divergentDNA(dna: CreativeDNA | null | undefined, slot: number): { vector: DnaVector; strength: Partial<Record<DnaKey, number>>; said: string } {
  const { vector, strength } = dnaSteer(dna);
  if (!dna || slot === 0) return { vector, strength, said: slot === 0 ? 'your Creative DNA as it is' : '' };
  const lean: DnaVector = slot === 1 ? { composition: 24, restraint: 22, motion: 20, typography: 10, colour: 15 } : { composition: -22, restraint: -22, motion: -18, density: -14, colour: -12 };
  const out: DnaVector = { ...vector };
  const moved: string[] = [];
  const st: Partial<Record<DnaKey, number>> = { ...strength };
  for (const k of DNA_KEYS) {
    const d = dna.dims[k];
    const by = lean[k];
    if (!d || !by || d.locked || d.source === 'designer') continue;
    out[k] = r0(d.value + by);
    // the lean is what this direction is about: it steers as if set
    st[k] = Math.max(st[k] ?? 0, 0.7);
    moved.push(`${DNA_META[k].label.toLowerCase()} ${by > 0 ? 'toward' : 'toward'} ${by > 0 ? DNA_META[k].high.toLowerCase() : DNA_META[k].low.toLowerCase()}`);
  }
  return { vector: out, strength: st, said: moved.length ? `leans ${moved.slice(0, 3).join(', ')}` : 'holds your decisions; differs in its language and composition' };
}

/** What the engine reads from the DNA, where the designer's words did not already say (direction.ts Directives). */
export function dnaDirectives(vector: DnaVector, strength: Partial<Record<DnaKey, number>>): { density?: 'airy' | 'dense'; motion?: Motion['feel']; minimal?: boolean; loud?: boolean; colourful?: boolean; serif?: boolean } {
  const on = (k: DnaKey) => (strength[k] ?? 0) >= 0.6 && typeof vector[k] === 'number';
  const v = (k: DnaKey) => vector[k] as number;
  const out: ReturnType<typeof dnaDirectives> = {};
  if (on('density')) out.density = v('density') <= 30 ? 'airy' : v('density') >= 70 ? 'dense' : undefined;
  if (on('motion')) out.motion = feelFor(v('motion'));
  if (on('restraint')) {
    if (v('restraint') <= 25) out.minimal = true;
    if (v('restraint') >= 78) out.loud = true;
  }
  if (on('colour') && v('colour') >= 75) out.colourful = true;
  if (on('typography')) out.serif = v('typography') >= 72 ? true : v('typography') <= 25 ? false : undefined;
  for (const k of Object.keys(out) as (keyof typeof out)[]) if (out[k] === undefined) delete out[k];
  return out;
}

export function feelFor(v: number): Motion['feel'] {
  return v < 10 ? 'still' : v < 35 ? 'calm' : v < 58 ? 'measured' : v < 80 ? 'lively' : 'kinetic';
}

/** The parts of a language shapeByDNA may choose among (direction.ts Language), passed in to keep this module free of it. */
export interface LanguageLike {
  id: string;
  display: readonly string[];
  body: readonly string[];
  motion: readonly Motion['feel'][];
  moTweak?: Partial<Motion>;
  look: { grid: readonly Look['grid'][]; motifs: readonly (readonly Look['motifs'][number][])[]; containers: readonly Look['containers'][]; buttons: readonly Look['buttons'][] };
}

const EDITORIAL_FACES = ['Fraunces', 'Newsreader', 'Source Serif 4', 'Instrument Serif', 'Cormorant Garamond', 'Libre Baskerville', 'Bodoni Moda', 'EB Garamond', 'Spectral', 'Lora', 'Playfair Display'];
const FUNCTIONAL_FACES = ['Inter', 'IBM Plex Sans', 'Public Sans', 'Archivo', 'Instrument Sans', 'Hanken Grotesk', 'Space Grotesk', 'Work Sans', 'DM Sans'];
const servable = (n: string) => FONTS.some((f) => f.name === n);

export interface Shaped {
  tokens: DesignTokens;
  look: Look;
  compose?: Record<string, string>;
  shapes?: Record<string, Record<string, unknown>>;
  order?: string[];
  /** what the DNA changed, said plainly */
  said: string[];
}

export interface ShapeOptions {
  /** the language the direction speaks, for its own alternatives */
  lang?: LanguageLike | null;
  /** the designer's palette is theirs (the faithful reading, a lock, a design system): colour is not moved */
  keepColours?: boolean;
  /** the designer's type pair is theirs: the faces are not changed */
  keepType?: boolean;
  /** the kind of work: a booking screen keeps its functional core */
  kind?: string;
  hasImages?: boolean;
  /** groups locked in the art direction (direction.ts LockGroup): never moved */
  locks?: readonly string[];
  /** which direction this is (0, 1, 2…): where its language offers none of what the DNA asks, directions take different ones */
  seed?: number;
  /** grids the other directions already use: within what the DNA asks, a different one is taken where there is one */
  taken?: readonly string[];
  /**
   * "look": type, grid, rhythm, ornament, motion, spacing, colour, pictures, hover (before the plan is chosen);
   * "layout": the opening, the proportions and what a dashboard leads with (after the plan set them); "all": both
   */
  phase?: 'look' | 'layout' | 'all';
}

/** The first of `want` the language offers; else one of `want` (the seed-th, so directions differ). */
const pick = <T,>(want: readonly T[], from: readonly T[] | undefined, fallback: T, seed = 0): T => (from ?? []).find((x) => want.includes(x)) ?? want[Math.abs(seed) % Math.max(1, want.length)] ?? fallback;

/**
 * A direction's look, tokens and composition drawn from the DNA: each dimension moves what it governs, as far as
 * it steers (strength), within the language's own character. Returns what changed and says it.
 */
export function shapeByDNA(d: { tokens: DesignTokens; look: Look; compose?: Record<string, string>; shapes?: Record<string, Record<string, unknown>>; order?: string[] }, vector: DnaVector, strength: Partial<Record<DnaKey, number>>, o: ShapeOptions = {}): Shaped {
  let tokens: DesignTokens = { ...d.tokens, colors: { ...d.tokens.colors }, fonts: { ...d.tokens.fonts } };
  let look: Look = { ...d.look, motion: { ...d.look.motion }, motifs: [...d.look.motifs], shapes: [...d.look.shapes] };
  const compose = d.compose ? { ...d.compose } : undefined;
  const shapes = d.shapes ? Object.fromEntries(Object.entries(d.shapes).map(([k, v]) => [k, { ...v }])) : undefined;
  let order = d.order ? [...d.order] : undefined;
  const said: string[] = [];
  const locks = new Set(o.locks ?? []);
  const lang = o.lang ?? null;
  const s = (k: DnaKey) => (typeof vector[k] === 'number' ? strength[k] ?? 0 : 0);
  const v = (k: DnaKey) => vector[k] as number;
  const screen = ['booking', 'checkout', 'form', 'flow', 'app', 'dashboard', 'data'].includes(o.kind ?? '');
  const tell = (k: DnaKey, what: string) => said.push(`${DNA_META[k].label} ${dnaWord(k, v(k)).toLowerCase()} (${v(k)}): ${what}`);
  const phase = o.phase ?? 'all';
  const doLook = phase !== 'layout';
  const doLayout = phase !== 'look';
  const seed = o.seed ?? 0;

  // TYPOGRAPHY: the scale's contrast, the headline face, its weight, labels and emphasis
  if (doLook && s('typography') > 0.3 && !locks.has('type')) {
    const t = v('typography');
    const want = 1.2 + (t / 100) * 0.42;
    const ratio = Math.round((look.ratio + (want - look.ratio) * s('typography')) * 1000) / 1000;
    const changes: string[] = [];
    if (Math.abs(ratio - look.ratio) >= 0.02) (look.ratio = Math.max(1.125, Math.min(1.75, ratio))), changes.push(`a ${look.ratio.toFixed(2)} type scale`);
    if (!o.keepType && s('typography') >= 0.6) {
      const kind = knownFont(tokens.fonts.display)?.kind;
      if (t >= 72 && kind !== 'serif' && !knownFont(tokens.fonts.display)?.displayOnly) {
        const f = [...(lang?.display ?? []), ...EDITORIAL_FACES].find((n) => knownFont(n)?.kind === 'serif' && servable(n) && n !== tokens.fonts.body);
        if (f) (tokens.fonts.display = f), changes.push(`${f} for the headlines`);
      } else if (t <= 28 && kind === 'serif') {
        const f = [...(lang?.display ?? []), ...FUNCTIONAL_FACES].find((n) => knownFont(n)?.kind === 'sans' && servable(n));
        if (f) (tokens.fonts.display = f), changes.push(`${f} for the headlines`);
      }
    }
    const serif = knownFont(tokens.fonts.display)?.kind === 'serif';
    const weight = nearestWeight(tokens.fonts.display, t >= 70 ? (serif ? 400 : 600) : t <= 30 ? 600 : look.weight);
    if (weight !== look.weight && s('typography') >= 0.6) look.weight = weight;
    if (t <= 25 && look.label !== 'mono') (look.label = 'mono'), changes.push('labels in mono');
    if (t >= 75 && serif && look.emphasis !== 'italic') (look.emphasis = 'italic'), changes.push('emphasis in italic');
    if (changes.length) tell('typography', changes.join(', '));
  }

  // COMPOSITION: the grid, the rhythm, the opening and its proportions
  if (s('composition') > 0.3 && !locks.has('layout')) {
    const c = v('composition');
    const changes: string[] = [];
    if (doLook) {
      const structured: Look['grid'][] = ['swiss', 'modular', 'stack'];
      const experimental: Look['grid'][] = c >= 85 ? ['poster', 'asymmetric'] : ['asymmetric', 'poster'];
      let grid = look.grid;
      // within the band the DNA asks for: the language's own choice first, then one no other direction has
      const within = (band: Look['grid'][], fallback: Look['grid']) => {
        const taken = new Set(o.taken ?? []);
        const own = band.includes(grid) ? grid : pick(band, lang?.look.grid, fallback, seed);
        if (!taken.has(own)) return own;
        const offered = (lang?.look.grid ?? []).filter((g) => band.includes(g) && !taken.has(g));
        return offered[0] ?? band.find((g) => !taken.has(g)) ?? own;
      };
      if (c <= 25) grid = within(structured, 'swiss');
      else if (c >= 70) grid = within(experimental, 'asymmetric');
      else if (c <= 40 && (grid === 'poster' || grid === 'asymmetric')) grid = 'editorial';
      if (grid !== look.grid && (s('composition') >= 0.6 || Math.abs(c - 50) >= 30)) (look.grid = grid), changes.push(`a ${grid} grid`);
      const rhythm: Look['rhythm'] = c >= 62 ? 'dramatic' : c <= 35 ? 'even' : look.rhythm;
      if (rhythm !== look.rhythm) (look.rhythm = rhythm), changes.push(`a ${rhythm} rhythm`);
      if (c >= 60 && look.align === 'center') (look.align = 'left'), changes.push('set to one side');
    }
    if (doLayout && s('composition') >= 0.6 && compose && !screen) {
      if (c >= 78 && compose.hero && !['poster', 'statement', 'full-bleed'].includes(compose.hero)) (compose.hero = o.hasImages ? 'full-bleed' : 'poster'), changes.push(`a ${compose.hero} opening`);
      if (c <= 25 && compose.hero && ['poster', 'full-bleed', 'statement'].includes(compose.hero)) (compose.hero = o.hasImages ? 'split' : 'editorial'), changes.push(`a ${compose.hero} opening`);
    }
    if (doLayout && shapes && s('composition') >= 0.6) {
      for (const k of ['hero', 'booking'] as const) {
        const sh = shapes[k];
        if (!sh) continue;
        const r = Number(sh.ratio ?? 0.5);
        const next = c >= 72 ? (r >= 0.5 ? 0.6 : 0.34) : c <= 28 ? 0.5 : r;
        if (Math.abs(next - r) >= 0.04) {
          const n = normalizeShape(k, { ...sh, ratio: next });
          if (n) (shapes[k] = n as Record<string, unknown>), changes.push(k === 'hero' ? (c >= 72 ? 'an uneven opening' : 'an even opening') : c >= 72 ? 'an uneven booking' : 'an even booking');
        }
      }
    }
    if (changes.length) tell('composition', changes.join(', '));
  }

  // RESTRAINT: ornament, the second ink, frames, boxes, buttons
  if (doLook && s('restraint') > 0.3 && !locks.has('motifs')) {
    const r = v('restraint');
    const changes: string[] = [];
    if (r <= 28) {
      const before = look.motifs.length + look.shapes.length;
      look.motifs = look.motifs.filter((m) => m === 'captions' || (m === 'numbering' && r > 15));
      look.shapes = [];
      if (look.motifs.length + look.shapes.length < before) changes.push('ornament taken off');
      if (look.containers === 'bands' || look.containers === 'framed') (look.containers = 'open'), changes.push('open sections');
      if (['block', 'offset'].includes(look.buttons)) (look.buttons = pick(['underline', 'outline', 'solid'], lang?.look.buttons, 'outline', seed)), changes.push(`${look.buttons} buttons`);
      if (look.frame !== 'plain' && r <= 18) (look.frame = 'plain'), changes.push('pictures unframed');
      if (look.accent2 && !locks.has('palette') && r <= 20) (look.accent2 = ''), changes.push('one ink');
    } else if (r >= 72) {
      const offered = new Set((lang?.look.motifs ?? []).flat());
      const add = (['big-numerals', 'marquee', 'shapes', 'pull-quote'] as Look['motifs'][number][]).find((m) => (offered.size ? offered.has(m) : true) && !look.motifs.includes(m));
      if (add) {
        look.motifs = [...look.motifs, add];
        if (add === 'shapes' && !look.shapes.length) look.shapes = ['circle', 'quarter'];
        changes.push(add === 'big-numerals' ? 'figures set large' : add === 'marquee' ? 'a moving line of words' : add === 'shapes' ? 'shapes of its own' : 'a pull quote');
      }
      if (look.containers === 'open' && r >= 80) (look.containers = 'bands'), changes.push('sections in bands');
      if (['underline', 'outline'].includes(look.buttons) && r >= 80) (look.buttons = pick(['block', 'offset', 'solid'], lang?.look.buttons, 'block', seed)), changes.push(`${look.buttons} buttons`);
      if (!look.accent2 && !locks.has('palette') && !o.keepColours && r >= 80) {
        const [h, sat, l] = hslOf(tokens.colors.accent);
        const ink = ensureContrast(hslHex((h + 150) % 360, Math.max(0.45, sat), isDark(tokens.colors.background) ? Math.max(0.55, l) : Math.min(0.45, l)), tokens.colors.background, 3);
        look.accent2 = ink;
        changes.push('a second ink');
      }
    }
    if (changes.length) tell('restraint', changes.join(', '));
  }

  // MOTION: how it moves
  if (doLook && s('motion') > 0.3 && !locks.has('motion')) {
    const m = v('motion');
    const feel = feelFor(m);
    const changes: string[] = [];
    const steps = ['still', 'calm', 'measured', 'lively', 'kinetic'];
    const far = Math.abs(steps.indexOf(feel) - steps.indexOf(look.motion.feel));
    if (feel !== look.motion.feel && (s('motion') >= 0.6 || far >= 2)) {
      look.motion = lang && (lang.motion as readonly string[]).includes(feel) ? motionFor(feel, lang.moTweak) : motionFor(feel);
      changes.push(`${feel} motion`);
    }
    if (look.motion.feel !== 'still') {
      const parallax = m >= 85 ? 2 : m >= 70 ? Math.max(1, look.motion.parallax) : m <= 40 ? 0 : look.motion.parallax;
      if (parallax !== look.motion.parallax) (look.motion = { ...look.motion, parallax }), changes.push(parallax ? `parallax ${parallax}` : 'no parallax');
      const scroll = m >= 82;
      if (scroll !== look.motion.scroll && (m >= 82 || m <= 50)) (look.motion = { ...look.motion, scroll }), changes.push(scroll ? 'arrivals follow the scroll' : 'arrivals on the first screen only');
      const headline: Motion['headline'] = m >= 88 ? 'words' : m >= 60 ? 'mask' : m <= 25 ? 'fade' : look.motion.headline;
      if (headline !== look.motion.headline) (look.motion = { ...look.motion, headline }), changes.push(`the headline ${headline === 'words' ? 'word by word' : headline === 'mask' ? 'through a mask' : 'fading in'}`);
    }
    if (changes.length) tell('motion', changes.join(', '));
  }

  // DENSITY: space and how much each screen holds
  if (doLook && s('density') > 0.3 && !locks.has('layout')) {
    const n = v('density');
    const scale: DesignTokens['scale'] = n <= 33 ? 'spacious' : n >= 67 ? 'compact' : 'comfortable';
    const changes: string[] = [];
    if (scale !== tokens.scale && (s('density') >= 0.6 || Math.abs(n - 50) >= 25)) (tokens = { ...tokens, scale }), changes.push(`${scale} spacing`);
    if (n >= 75 && look.width !== 'wide') (look.width = 'wide'), changes.push('a wide measure');
    if (n <= 22 && look.width === 'wide' && !screen) (look.width = 'standard'), changes.push('a narrower measure');
    if (changes.length) tell('density', changes.join(', '));
  }

  // COLOUR: how saturated the accent is (never the designer's own palette)
  if (doLook && s('colour') > 0.3 && !o.keepColours && !locks.has('palette')) {
    const c = v('colour');
    const [h, sat, l] = hslOf(tokens.colors.accent);
    const want = c <= 25 ? Math.min(sat, 0.32) : c >= 75 ? Math.max(sat, 0.68) : sat;
    if (Math.abs(want - sat) >= 0.06) {
      const accent = ensureContrast(hslHex(h, want, l), tokens.colors.background, 3);
      const accentText = ensureContrast(tokens.colors.accentText, accent, 4.5);
      tokens = { ...tokens, colors: { ...tokens.colors, accent, accentText } };
      tell('colour', c <= 25 ? 'a quieter accent' : 'a more vivid accent');
    }
  }

  // IMAGERY: how pictures are treated
  if (doLook && s('imagery') > 0.3 && !locks.has('imagery')) {
    const im = v('imagery');
    const treatment: DesignTokens['imageTreatment'] = im <= 25 ? 'natural' : im >= 85 ? 'contrast' : im >= 68 ? 'duotone' : im <= 45 ? tokens.imageTreatment : 'muted';
    if (treatment !== tokens.imageTreatment && (s('imagery') >= 0.6 || Math.abs(im - 50) >= 25)) (tokens = { ...tokens, imageTreatment: treatment }), tell('imagery', `pictures ${treatment}`);
  }

  // INTERACTION: how buttons and links answer a pointer
  if (doLook && s('interaction') > 0.3 && !locks.has('motion')) {
    const it = v('interaction');
    const hover: Motion['hover'] = it <= 25 ? 'underline' : it >= 72 ? (look.motion.hover === 'zoom' ? 'zoom' : 'lift') : look.motion.hover;
    if (hover !== look.motion.hover && look.motion.feel !== 'still') (look.motion = { ...look.motion, hover }), tell('interaction', `${hover} on hover`);
  }

  // INFORMATION: what a dashboard leads with
  if (doLayout && s('information') > 0.3 && order?.length) {
    const inf = v('information');
    const lead = inf >= 65 ? 'table' : inf <= 35 ? 'stat-cards' : null;
    if (lead && order.includes(lead) && order[0] !== lead) (order = [lead, ...order.filter((x) => x !== lead)]), tell('information', lead === 'table' ? 'the detailed table first' : 'the key figures first');
  }

  return { tokens, look, ...(compose ? { compose } : {}), ...(shapes ? { shapes } : {}), ...(order ? { order } : {}), said };
}

// ── reading a design's own DNA, and moving a design toward its DNA ───

const GRID_C: Record<string, number> = { swiss: 15, modular: 20, stack: 25, centered: 28, editorial: 45, asymmetric: 72, poster: 88 };
const FEEL_M: Record<string, number> = { still: 0, calm: 25, measured: 48, lively: 70, kinetic: 90 };
const TREAT_I: Record<string, number> = { natural: 15, muted: 38, warm: 40, mono: 72, duotone: 80, contrast: 86 };
const HOVER_I: Record<string, number> = { none: 10, underline: 25, zoom: 50, lift: 62, invert: 80 };
const BUTTON_I: Record<string, number> = { underline: 25, outline: 35, solid: 45, pill: 50, block: 70, offset: 85 };

/** Where a design sits on each dimension, read from its look, tokens and sections. */
export function dnaOfDesign(spec: Pick<DesignSpec, 'tokens' | 'look' | 'sections'>): Record<DnaKey, number> {
  const look = spec.look;
  const t = spec.tokens;
  const hero = spec.sections.find((s) => s.kind === 'hero');
  const composed = spec.sections.some((s) => s.kind === 'compose');
  const serif = knownFont(t.fonts.display)?.kind === 'serif';
  const ornaments = look.motifs.filter((m) => m !== 'captions' && m !== 'numbering').length;
  const loudTones = spec.sections.filter((s) => s.tone === 'accent' || s.tone === 'accent2' || s.tone === 'invert').length;
  const pads = spec.sections.map((s) => (s.pad === 'l' ? -1 : s.pad === 's' ? 1 : 0) as number);
  const pad = pads.length ? pads.reduce((a, b) => a + b, 0) / pads.length : 0;
  const uneven = spec.sections.some((s) => typeof s.shape?.ratio === 'number' && (s.shape.ratio <= 0.38 || s.shape.ratio >= 0.58));
  const tableFirst = spec.sections.findIndex((s) => s.kind === 'table');
  const cardsFirst = spec.sections.findIndex((s) => s.kind === 'stat-cards');
  const [, accentSat] = hslOf(t.colors.accent);
  return {
    typography: r0(((look.ratio - 1.2) / 0.42) * 78 + (serif ? 22 : 0) - (look.label === 'mono' ? 10 : 0) + (look.emphasis === 'italic' ? 6 : 0)),
    composition: r0((GRID_C[look.grid] ?? 45) + (look.rhythm === 'dramatic' ? 8 : 0) + (hero?.variant === 'poster' ? 10 : hero?.variant === 'statement' ? 6 : hero?.variant === 'centered' ? -10 : hero?.variant === 'split' ? -4 : 0) + (composed ? 8 : 0) + (uneven ? 6 : 0) + (look.align === 'center' ? -6 : 0)),
    restraint: r0(18 + ornaments * 13 + (look.shapes.length ? 8 : 0) + (look.accent2 ? 12 : 0) + (look.containers === 'bands' || look.containers === 'framed' ? 8 : 0) + (look.frame !== 'plain' ? 6 : 0) + (look.buttons === 'block' || look.buttons === 'offset' ? 8 : 0) + loudTones * 5),
    motion: r0((FEEL_M[look.motion.feel] ?? 40) + look.motion.parallax * 3 + (look.motion.scroll ? 6 : 0) + (['mask', 'words', 'letters'].includes(look.motion.headline) ? 4 : 0)),
    density: r0((t.scale === 'spacious' ? 20 : t.scale === 'compact' ? 80 : 50) + (look.width === 'wide' ? 5 : look.width === 'narrow' ? -5 : 0) + (spec.sections.length > 8 ? 8 : spec.sections.length < 5 ? -6 : 0) + pad * 8),
    colour: r0(accentSat * 75 + (look.accent2 ? 15 : 0) + loudTones * 3),
    imagery: r0(TREAT_I[t.imageTreatment] ?? 40),
    interaction: r0(((HOVER_I[look.motion.hover] ?? 40) + (BUTTON_I[look.buttons] ?? 45)) / 2),
    information: r0(tableFirst >= 0 && (cardsFirst < 0 || tableFirst < cardsFirst) ? 75 : cardsFirst >= 0 ? 30 : 50),
  };
}

/**
 * Where a direction sits on each dimension before it has sections: its look and tokens, its opening, its booking's
 * proportions, whether it composes its opening, what a dashboard leads with — read as dnaOfDesign reads a page.
 */
export function dnaOfDirection(d: { tokens: DesignTokens; look: Look; compose?: Record<string, string>; shapes?: Record<string, Record<string, unknown>>; plan?: string; order?: string[] }): Record<DnaKey, number> {
  const base = { tone: 'base', pad: 'm', images: [] as string[], content: {} };
  const sections: Record<string, unknown>[] = [];
  if (d.compose?.hero) sections.push({ ...base, id: 'hero', kind: 'hero', variant: d.compose.hero, shape: d.shapes?.hero });
  if (d.compose?.booking) sections.push({ ...base, id: 'booking', kind: 'booking', variant: d.compose.booking, shape: d.shapes?.booking });
  if (d.plan === 'composed') sections.push({ ...base, id: 'opening', kind: 'compose', variant: 'free' });
  for (const k of d.order ?? []) if (!sections.some((x) => x.kind === k)) sections.push({ ...base, id: k, kind: k, variant: 'default' });
  // a typical page's length, so the count of sections says nothing either way
  while (sections.length < 6) sections.push({ ...base, id: `s${sections.length}`, kind: 'text', variant: 'narrow' });
  return dnaOfDesign({ tokens: d.tokens, look: d.look, sections } as unknown as Pick<DesignSpec, 'tokens' | 'look' | 'sections'>);
}

const GRID_ORDER: Look['grid'][] = ['swiss', 'modular', 'stack', 'editorial', 'asymmetric', 'poster'];
const FEEL_ORDER: Motion['feel'][] = ['still', 'calm', 'measured', 'lively', 'kinetic'];
const SCALE_ORDER: DesignTokens['scale'][] = ['spacious', 'comfortable', 'compact'];

/**
 * A direction held to the dimensions the designer set or locked: where its reading is more than the slack from
 * the target, it is moved a step at a time toward it (at most four rounds) — the grid, the rhythm, the opening, the
 * ornament, the motion, the spacing — never a group locked in the art direction. What is left off target is said.
 */
export function holdToDNA<T extends { tokens: DesignTokens; look: Look; compose?: Record<string, string>; shapes?: Record<string, Record<string, unknown>>; plan?: string; order?: string[] }>(d: T, targets: DnaVector, o: { locks?: readonly string[]; lang?: LanguageLike | null; slack?: number; screen?: boolean } = {}): { d: T; moved: DnaKey[]; off: DnaKey[] } {
  const slack = o.slack ?? 12;
  const locks = new Set(o.locks ?? []);
  let cur: T = { ...d, tokens: { ...d.tokens }, look: { ...d.look, motion: { ...d.look.motion }, motifs: [...d.look.motifs], shapes: [...d.look.shapes] }, ...(d.compose ? { compose: { ...d.compose } } : {}) };
  const moved = new Set<DnaKey>();
  const step = <X,>(order: readonly X[], at: X, dir: number): X => order[Math.max(0, Math.min(order.length - 1, order.indexOf(at) + dir))] ?? at;
  for (let round = 0; round < 4; round++) {
    const read = dnaOfDirection(cur);
    const gaps = (Object.keys(targets) as DnaKey[]).filter((k) => typeof targets[k] === 'number' && Math.abs(read[k] - (targets[k] as number)) > slack);
    if (!gaps.length) break;
    let changed = false;
    for (const k of gaps) {
      const up = read[k] < (targets[k] as number);
      const L = cur.look;
      if (k === 'composition' && !locks.has('layout')) {
        if (up ? L.rhythm !== 'dramatic' : L.rhythm !== 'even') cur = { ...cur, look: { ...L, rhythm: up ? 'dramatic' : 'even' } };
        else if (cur.compose?.hero && !o.screen && (up ? !['poster', 'statement'].includes(cur.compose.hero) : ['poster', 'statement', 'full-bleed', 'centered'].includes(cur.compose.hero))) cur = { ...cur, compose: { ...cur.compose, hero: up ? 'statement' : 'editorial' } };
        else {
          const g = step(GRID_ORDER, GRID_ORDER.includes(L.grid) ? L.grid : 'editorial', up ? 1 : -1);
          if (g === L.grid) continue;
          cur = { ...cur, look: { ...L, grid: g, ...(L.align === 'center' && up ? { align: 'left' as const } : {}) } };
        }
      } else if (k === 'restraint' && !locks.has('motifs')) {
        if (!up && L.accent2 && !locks.has('palette')) cur = { ...cur, look: { ...L, accent2: '' } };
        else if (!up && L.motifs.some((m) => m !== 'captions' && m !== 'numbering')) cur = { ...cur, look: { ...L, motifs: L.motifs.filter((m) => m === 'captions' || m === 'numbering'), shapes: [] } };
        else if (!up && (L.containers === 'bands' || L.containers === 'framed') && !locks.has('surface')) cur = { ...cur, look: { ...L, containers: 'open' } };
        else if (!up && ['block', 'offset'].includes(L.buttons) && !locks.has('surface')) cur = { ...cur, look: { ...L, buttons: 'outline' } };
        else if (!up && L.frame !== 'plain' && !locks.has('imagery')) cur = { ...cur, look: { ...L, frame: 'plain' } };
        else if (up) {
          const offered = new Set((o.lang?.look.motifs ?? []).flat());
          const add = (['big-numerals', 'marquee', 'pull-quote', 'shapes'] as Look['motifs'][number][]).find((m) => (offered.size ? offered.has(m) : true) && !L.motifs.includes(m));
          if (add) cur = { ...cur, look: { ...L, motifs: [...L.motifs, add], ...(add === 'shapes' && !L.shapes.length ? { shapes: ['circle', 'quarter'] as Look['shapes'] } : {}) } };
          else if (L.containers === 'open' && !locks.has('surface')) cur = { ...cur, look: { ...L, containers: 'bands' } };
          else if (!['block', 'offset'].includes(L.buttons) && !locks.has('surface')) cur = { ...cur, look: { ...L, buttons: 'block' } };
          else continue;
        } else continue;
      } else if (k === 'motion' && !locks.has('motion')) {
        const f = step(FEEL_ORDER, L.motion.feel, up ? 1 : -1);
        if (f !== L.motion.feel) cur = { ...cur, look: { ...L, motion: o.lang && (o.lang.motion as readonly string[]).includes(f) ? motionFor(f, o.lang.moTweak) : motionFor(f) } };
        else if (up && L.motion.parallax < 2) cur = { ...cur, look: { ...L, motion: { ...L.motion, parallax: L.motion.parallax + 1, scroll: true } } };
        else if (!up && (L.motion.parallax > 0 || L.motion.scroll)) cur = { ...cur, look: { ...L, motion: { ...L.motion, parallax: 0, scroll: false } } };
        else continue;
      } else if (k === 'density' && !locks.has('layout')) {
        const sc = step(SCALE_ORDER, cur.tokens.scale, up ? 1 : -1);
        if (sc !== cur.tokens.scale) cur = { ...cur, tokens: { ...cur.tokens, scale: sc } };
        else if (up && L.width !== 'wide') cur = { ...cur, look: { ...L, width: 'wide' } };
        else if (!up && L.width === 'wide') cur = { ...cur, look: { ...L, width: 'standard' } };
        else continue;
      } else if (k === 'typography' && !locks.has('type')) {
        const want = 1.2 + ((targets.typography as number) / 100) * 0.42;
        const ratio = Math.max(1.125, Math.min(1.75, Math.round((L.ratio + (want - L.ratio) * 0.7 + (up ? 0.03 : -0.03)) * 1000) / 1000));
        if (Math.abs(ratio - L.ratio) < 0.01) {
          if (!up && L.emphasis === 'italic') cur = { ...cur, look: { ...L, emphasis: 'accent' } };
          else if (up && L.label === 'mono') cur = { ...cur, look: { ...L, label: 'caps' } };
          else continue;
        } else cur = { ...cur, look: { ...L, ratio } };
      } else continue;
      moved.add(k);
      changed = true;
    }
    if (!changed) break;
  }
  const read = dnaOfDirection(cur);
  const off = (Object.keys(targets) as DnaKey[]).filter((k) => typeof targets[k] === 'number' && Math.abs(read[k] - (targets[k] as number)) > slack + 6);
  return { d: cur, moved: [...moved], off };
}

export interface DnaGap {
  key: DnaKey;
  target: number;
  actual: number;
  delta: number;
  locked: boolean;
}

/**
 * How faithfully a design keeps its DNA (0–100): the dimensions the designer set or locked count most. The gaps
 * are each dimension's distance from its target, the largest first.
 */
export function dnaConsistency(spec: Pick<DesignSpec, 'tokens' | 'look' | 'sections'>, dna: CreativeDNA | null | undefined): { score: number; gaps: DnaGap[] } {
  if (!dna) return { score: 100, gaps: [] };
  const actual = dnaOfDesign(spec);
  const gaps: DnaGap[] = [];
  let num = 0;
  let den = 0;
  for (const k of DNA_KEYS) {
    const d = dna.dims[k];
    if (!d) continue;
    // a dimension placed only by a prior says little about what the designer wants
    const w = d.locked ? 2 : d.source === 'designer' ? 1.5 : d.source === 'kind' ? 0.3 : 1;
    const delta = actual[k] - d.value;
    gaps.push({ key: k, target: d.value, actual: actual[k], delta, locked: d.locked });
    // within 15 points is on target: the reading of a design is approximate
    num += w * Math.max(0, Math.abs(delta) - 15);
    den += w;
  }
  const score = den ? Math.round(clamp(100 - (num / den) * 1.6)) : 100;
  return { score, gaps: gaps.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
}

/**
 * The patches that move a design toward its DNA, for the dimensions given (all those set or locked when none):
 * its look, its tokens and its sections' settings — nothing regenerated, each a version Undo takes back.
 */
export function dnaPatches(spec: DesignSpec, dna: CreativeDNA, keys?: readonly DnaKey[], o: Omit<ShapeOptions, 'locks'> & { locks?: readonly string[] } = {}): Patch[] {
  const ks = keys ?? DNA_KEYS.filter((k) => dna.dims[k] && (dna.dims[k]!.locked || dna.dims[k]!.source === 'designer'));
  if (!ks.length) return [];
  const vector: DnaVector = {};
  const strength: Partial<Record<DnaKey, number>> = {};
  for (const k of ks) {
    const d = dna.dims[k];
    if (!d) continue;
    vector[k] = d.value;
    strength[k] = 1;
  }
  const hero = spec.sections.find((s) => s.kind === 'hero');
  const booking = spec.sections.find((s) => s.kind === 'booking');
  const shapes: Record<string, Record<string, unknown>> = {};
  if (hero?.shape) shapes.hero = { ...hero.shape };
  if (booking?.shape) shapes.booking = { ...booking.shape };
  const out = shapeByDNA({ tokens: spec.tokens, look: spec.look, shapes }, vector, strength, o);
  const patches: Patch[] = [];
  const what = ks.map((k) => DNA_META[k].label.toLowerCase()).join(', ');
  const lookDiff: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(out.look)) if (JSON.stringify(x) !== JSON.stringify((spec.look as unknown as Record<string, unknown>)[k])) lookDiff[k] = x;
  if (Object.keys(lookDiff).length) patches.push({ op: 'look', look: lookDiff, summary: `Creative DNA: ${what}` });
  const tokenDiff: Record<string, unknown> = {};
  for (const k of ['scale', 'imageTreatment', 'radius'] as const) if (out.tokens[k] !== spec.tokens[k]) tokenDiff[k] = out.tokens[k];
  if (out.tokens.fonts.display !== spec.tokens.fonts.display) tokenDiff.fonts = { display: out.tokens.fonts.display };
  if (out.tokens.colors.accent !== spec.tokens.colors.accent) tokenDiff.colors = { accent: out.tokens.colors.accent, accentText: out.tokens.colors.accentText };
  if (Object.keys(tokenDiff).length) patches.push({ op: 'tokens', tokens: tokenDiff, summary: `Creative DNA: ${what}` });
  for (const [k, sec] of [['hero', hero], ['booking', booking]] as const) {
    if (!sec || !out.shapes?.[k] || sec.locked || sec.fixed) continue;
    if (JSON.stringify(out.shapes[k]) !== JSON.stringify(sec.shape ?? {})) patches.push({ op: 'shape', sectionId: sec.id, shape: out.shapes[k], summary: `Creative DNA: ${what}` });
  }
  return patches;
}

/** The locked dimensions a change would move away from their target (by more than its reading's slack). */
export function lockedDnaMoves(before: Pick<DesignSpec, 'tokens' | 'look' | 'sections'>, after: Pick<DesignSpec, 'tokens' | 'look' | 'sections'>, dna: CreativeDNA | null | undefined): DnaKey[] {
  if (!dna) return [];
  const a = dnaOfDesign(before);
  const b = dnaOfDesign(after);
  return DNA_KEYS.filter((k) => {
    const d = dna.dims[k];
    if (!d?.locked) return false;
    const moved = Math.abs(b[k] - a[k]) >= 10;
    const away = Math.abs(b[k] - d.value) > Math.abs(a[k] - d.value);
    return moved && away;
  });
}

/** A generated design held to its locked DNA, whatever the model wrote: the patches applied, and what was held. */
export function fitDNA(spec: DesignSpec, dna: CreativeDNA | null | undefined, apply: (s: DesignSpec, p: Patch) => DesignSpec | null, o: ShapeOptions = {}): { spec: DesignSpec; held: DnaKey[] } {
  if (!dna) return { spec, held: [] };
  const actual = dnaOfDesign(spec);
  const off = DNA_KEYS.filter((k) => dna.dims[k]?.locked && Math.abs(actual[k] - dna.dims[k]!.value) > 15);
  if (!off.length) return { spec, held: [] };
  let next = spec;
  for (const p of dnaPatches(spec, dna, off, o)) next = apply(next, p) ?? next;
  return { spec: next, held: off };
}

/** The DNA in one compact line for a model: the dimensions with their positions, what is locked, what each asks. */
export function dnaBrief(dna: CreativeDNA | null | undefined): string {
  if (!dna) return '';
  const ks = DNA_KEYS.filter((k) => dna.dims[k]);
  if (!ks.length) return '';
  const pos = ks.map((k) => `${DNA_META[k].label.toLowerCase()} ${dna.dims[k]!.value} (${dnaWord(k, dna.dims[k]!.value).toLowerCase()})`).join('; ');
  const locked = ks.filter((k) => dna.dims[k]!.locked).map((k) => DNA_META[k].label.toLowerCase());
  const v = dnaValues(dna);
  const asks = [
    v.density <= 30 ? 'few sections, each given room; short copy' : v.density >= 70 ? 'more sections and items per screen; compact copy' : '',
    v.composition >= 70 ? 'an unexpected order of sections and uneven pairs; avoid a predictable stack' : v.composition <= 30 ? 'a clear, regular order of sections' : '',
    v.typography >= 70 ? 'headlines written to be set large and read slowly' : v.typography <= 30 ? 'plain, functional headings and labels' : '',
    v.restraint <= 25 ? 'nothing decorative; every element earns its place' : v.restraint >= 75 ? 'room for one or two expressive moments' : '',
  ].filter(Boolean);
  return `CREATIVE DNA (0–100, the designer's design language; the look itself is already set from it): ${pos}.${locked.length ? ` Locked by the designer: ${locked.join(', ')}.` : ''}${asks.length ? ` In sections and copy: ${asks.join('; ')}.` : ''}`;
}
