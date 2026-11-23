// lib/ux-v0/studio/discovery.ts — the few questions worth asking before a work is made, and the visual answers that
// help a person find their taste.
//
// After what the work cannot be made without (its words, its name: director.ts), SocriaUX asks at most three creative
// questions, and only those that would change the result: what a logo stands for or what a site is for when nothing
// says it; and, when the brief leaves them open, how it should feel (vibes), its colours (palettes) or its lettering
// (real typefaces). Never all three visual questions on its own, never what the words already say, none at all when
// the brief is complete.
//
// Nothing is picked from a fixed list. The model writes the questions and their options when it can be reached
// (/api/ux-v0/studio-questions, held to their shape here: colours that are colours and read, faces that are in the
// font library, vibes in the engine's vocabulary); otherwise they are generated here from the brief and the answers so
// far: palettes from the colour language the brief's own words suggest (the generative engine's languages, a theme the
// words name, the moves a chosen vibe implies), pairings of real faces for the characters the brief and the vibe point
// to, vibes composed from the qualities and themes the subject calls for, each with its palette, its type and its forms.
// Later questions follow earlier answers: palettes and faces asked after a vibe belong to that vibe.
//
// An answer is a tap, the person's own words (hex codes, colours named or described, a typeface named or a style
// described, a feel in their own words), "skip" or "surprise me" — and lands on the decisions the engines already
// read (apply.ts prefsOf): a palette, faces, a feel and words for the look, and the vibe's qualities for the engine to
// realise once the work is composed.

import type { StudioAnswer, StudioState } from './schema';
import { readFacts } from './facts';
import { likedRefs } from './references';
import { FONTS } from '../fonts';
import { hslHex, hslOf, mix } from '../color';
import { contrastRatio } from '../../ux/audit';
import { languageFor, tempersOf, thingsIn, type VisualLanguage } from '../graphics/generative/language';
import { DOMAINS } from '../graphics/generative/lexicon';
import { CHARACTER_LABEL, QUALITIES, THEMES, TYPE_CHARACTERS, TYPE_SETS, characterIn, characterOfFace, qualitiesIn, qualityById, shiftPalette, themeById, themeIn, tokensOf, typeSetFor, type Palette, type TypeCharacter } from '../graphics/creative/lexicon';
import { FORM_KINDS, type FormKind } from '../graphics/creative/forms';

export const DISCOVERY_KINDS = ['text', 'colour', 'type', 'vibe'] as const;
export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number];

export interface PaletteChoice {
  id: string;
  name: string;
  /** how the colours relate, in a few words */
  note: string;
  ground: string;
  ink: string;
  accent: string;
  support: string[];
}

export interface TypeChoice {
  id: string;
  /** the typographic personality it is (creative/lexicon.ts), when known */
  character?: TypeCharacter;
  name: string;
  note: string;
  display: string;
  body: string;
  weight: number;
  case: 'none' | 'upper';
}

export interface VibeChoice {
  id: string;
  name: string;
  note: string;
  /** the engine's qualities this vibe is made of (creative/lexicon.ts) */
  qualities: string[];
  /** a theme, when the vibe is a world (clouds, the ocean…) */
  theme?: string;
  character: TypeCharacter;
  /** its colours, for the preview and as the palette when no other is chosen */
  palette: { ground: string; ink: string; accent: string; support: string[] };
  /** the forms it brings, for the preview */
  form: FormKind;
}

export interface TextChoice {
  id: string;
  label: string;
  words: string;
}

export interface DiscoveryQuestion {
  id: string;
  kind: DiscoveryKind;
  /** what the answer decides: colour, type, vibe, purpose, about, pictures, or another topic the model names */
  decides: string;
  text: string;
  why?: string;
  palettes?: PaletteChoice[];
  faces?: TypeChoice[];
  vibes?: VibeChoice[];
  options?: TextChoice[];
  by: 'model' | 'reader';
}

/** What the conversation keeps of its creative questions. */
export interface DiscoveryState {
  /** the question waiting, with its options (so a tap still means the same after a reload) */
  current?: DiscoveryQuestion;
  /** what has been asked (decides), never asked again */
  asked: string[];
  /** the brief was judged enough (by the model): nothing more is asked */
  done?: boolean;
  /** how many visual questions the opening brief left room for, fixed when the first creative question is asked (so
   * answering one does not take away the next) */
  budget?: number;
}

/** The most creative questions asked in one conversation (required ones — the words, a name — are apart). */
export const MAX_CREATIVE_QUESTIONS = 3;

const P = { graphic: 'g', logo: 'l', website: 'w', board: 'b', system: 's', critique: 'c' } as const;
const pre = (st: Pick<StudioState, 'mode'>) => P[st.mode];
const answer = (st: StudioState, id: string): StudioAnswer | undefined => st.answers[id];
const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const fontByName = (name: string) => FONTS.find((f) => f.name.toLowerCase() === name.trim().toLowerCase());

// ── what is already known: never asked ──

export interface Known {
  palette: boolean;
  type: boolean;
  vibe: boolean;
  purpose: boolean;
  about: boolean;
  pictures: boolean;
}

/** Faces the words name outright ("set in Fraunces", "like Helvetica" when the library has it). */
export function facesNamed(text: string): string[] {
  const low = (text ?? '').toLowerCase();
  return FONTS.filter((f) => f.name.length > 3 && new RegExp(`\\b${f.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(low)).map((f) => f.name);
}

const unquoted = (t: string) => t.replace(/“[^”]*”|"[^"]*"/g, ' ');

export function knownOf(st: StudioState): Known {
  const p = pre(st);
  const words = st.prompt;
  // the work's own words (its name, its headline, in quotes) are what it says, not how it should look: "Blue Hour" names
  // no colour, "Spring Fair" asks for no flowers, "Ocean Labs" does not say what the business does
  const f = readFacts(unquoted(words));
  const refs = likedRefs(st);
  const takes = (t: string) => refs.some((r) => !r.take?.length || r.take.includes(t as never));
  const pictures = st.attachments.filter((a) => a.kind === 'image');
  return {
    palette: !!answer(st, `${p}.palette`) || f.colours.length > 0 || (refs.length > 0 && takes('colour') && refs.some((r) => r.colours.length > 0)) || answer(st, `${p}.pictures`)?.values[0] === 'look',
    type: !!answer(st, `${p}.type`) || facesNamed(words).length > 0 || /\b(typeface|font|typography|lettering|serif|sans)\b/i.test(words) && !!characterIn(words) || (refs.length > 0 && takes('type') && refs.some((r) => r.fonts.length > 0)),
    // a picture brought for its look gives the mood as well as the colours
    // (a world named only inside the work's own words — "Spring Fair" — is its name, not a look asked for)
    vibe: !!answer(st, `${p}.vibe`) || f.mood.length > 0 || f.styles.length > 0 || !!answer(st, `${p}.look`)?.text || !!themeIn(unquoted(words)) || (refs.length > 0 && takes('mood')) || answer(st, `${p}.pictures`)?.values[0] === 'look',
    purpose: !!answer(st, 'w.purpose'),
    about: !!answer(st, 'l.about') || f.domains.length > 0,
    pictures: !pictures.length || !!answer(st, `${p}.pictures`),
  };
}

/** How much the brief says beyond what the work needs and beyond its feel: its words' details, colours, type,
 * pictures, references. */
function richness(st: StudioState, k: Known): number {
  const f = readFacts(st.prompt);
  // the details its words carry: dates and places in the sentence, or given with the words when they were asked for
  const w = answer(st, `${pre(st)}.words`)?.fields ?? answer(st, 'w.words')?.fields ?? {};
  const details = (f.meta.length ? 1 : 0) + (f.quoted.length > 1 ? 1 : 0) + (w.details || w.subhead || w.cta ? 1 : 0);
  return (k.palette ? 1 : 0) + (k.type ? 1 : 0) + (details ? 1 : 0) + (st.attachments.some((a) => a.kind === 'image') ? 1 : 0) + (likedRefs(st).length ? 1 : 0);
}

const VISUAL_KINDS = new Set(['colour', 'type', 'vibe']);

/**
 * How many visual questions this brief leaves room for: none when the work is made in a design system (its identity
 * decides), when it says how the work should feel (its colours and lettering follow from the feel, and are changed in
 * words once it is seen) or already says a good deal; one (the feel) when it says a little; two when it says nothing
 * beyond what the work needs. Fixed when the first creative question is asked.
 */
export function visualBudget(st: StudioState): number {
  if (typeof st.discovery?.budget === 'number') return st.discovery.budget;
  // made in a design system: its colours, type and character are the work's, never asked
  if (st.systemId) return 0;
  const k = knownOf(st);
  if (k.vibe) return 0;
  const rich = richness(st, k);
  return rich >= 2 ? 0 : rich === 1 ? 1 : 2;
}

const asked = (st: StudioState) => st.discovery?.asked ?? [];
const settled = (st: StudioState, decides: string) => {
  const p = pre(st);
  const id = decides === 'colour' ? `${p}.palette` : decides === 'type' ? `${p}.type` : decides === 'vibe' ? `${p}.vibe` : decides === 'purpose' ? 'w.purpose' : decides === 'about' ? 'l.about' : decides === 'pictures' ? `${p}.pictures` : `d.${decides}`;
  return !!st.answers[id];
};

/**
 * The creative questions still worth asking, in order (decides). Content that changes the work first (what a logo
 * stands for, what a site is for, whether a picture is placed); then, only when the brief leaves them open, the visual
 * ones that would change it most for this kind of work — at most two of the three, one when the brief already says a
 * good deal, none when it says enough. Never more than MAX_CREATIVE_QUESTIONS in all, and never one asked before.
 */
export function creativeNeeds(st: StudioState): string[] {
  if (st.mode === 'critique' || st.mode === 'system') return [];
  if (st.answers.go || st.discovery?.done) return [];
  const k = knownOf(st);
  const done = new Set(asked(st));
  const content: string[] = [];
  if (st.mode === 'logo' && !k.about) content.push('about');
  if (st.mode === 'website' && !k.purpose) content.push('purpose');
  if (!k.pictures) content.push('pictures');
  // what each kind of work gains most from being asked: a logo is its lettering; a poster, a campaign, a site their feel
  const order = st.mode === 'logo' ? (['type', 'colour', 'vibe'] as const) : (['vibe', 'colour', 'type'] as const);
  const open = order.filter((d) => !done.has(d) && !settled(st, d) && (d === 'colour' ? !k.palette : d === 'type' ? !k.type : !k.vibe));
  // type is asked for a poster, campaign or site only when its words make the lettering matter
  const visual = open.filter((d) => d !== 'type' || st.mode === 'logo' || /\b(type|typograph\w*|letter\w*|font|wordmark|headline)\b/i.test(st.prompt));
  // never more visual questions than the opening brief left room for (two at most: never all three)
  const left = Math.max(0, Math.min(2, visualBudget(st)) - asked(st).filter((d) => VISUAL_KINDS.has(d)).length);
  const all = [...content, ...visual.slice(0, left)];
  const askedCount = asked(st).length;
  return all.filter((d) => !done.has(d) && !settled(st, d)).slice(0, Math.max(0, MAX_CREATIVE_QUESTIONS - askedCount));
}

// ── colours: names, relationships, palettes ──

const HUE_NAMES: readonly [number, readonly [string, string, string]][] = [
  // [hue upper bound, [deep, mid, light]]
  [12, ['Oxblood', 'Poppy', 'Coral']],
  [38, ['Rust', 'Terracotta', 'Apricot']],
  [52, ['Bronze', 'Amber', 'Butter']],
  [68, ['Olive', 'Mustard', 'Lemon']],
  [150, ['Pine', 'Moss', 'Sage']],
  [190, ['Teal', 'Lagoon', 'Sea glass']],
  [235, ['Midnight', 'Cobalt', 'Sky']],
  [265, ['Indigo', 'Iris', 'Lavender']],
  [300, ['Aubergine', 'Plum', 'Lilac']],
  [340, ['Berry', 'Fuchsia', 'Rose']],
  [361, ['Oxblood', 'Poppy', 'Coral']],
];

/** A colour as a designer might name it: by its hue, how deep it is, and for near-greys how warm. */
export function colourName(hex: string): string {
  const [h, s, l] = hslOf(hex);
  if (s < 0.12) {
    if (l < 0.14) return 'Ink';
    if (l < 0.3) return 'Charcoal';
    if (l < 0.55) return 'Stone';
    if (l < 0.82) return 'Fog';
    const warm = h > 20 && h < 70;
    return warm ? 'Linen' : 'Chalk';
  }
  if (l > 0.9) return h > 20 && h < 70 ? 'Cream' : 'Mist';
  const names = HUE_NAMES.find(([upper]) => h < upper)![1];
  return l < 0.32 ? names[0] : l < 0.62 ? names[1] : names[2];
}

const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const rgbDist = (a: string, b: string) => {
  const x = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const y = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** How a palette's colours relate, in words ("a warm accent on a pale ground, with a close supporting tone"). */
function paletteNote(p: Palette): string {
  const [gh, , gl] = hslOf(p.ground);
  const [ah, as] = hslOf(p.accent);
  const warm = (h: number) => h < 70 || h > 320;
  const support = p.support[0];
  const rel = support ? (hueDist(hslOf(support)[0], ah) < 35 ? 'a close supporting tone' : hueDist(hslOf(support)[0], ah) > 140 ? 'a contrasting second colour' : 'a second colour beside it') : 'nothing else';
  return `${as < 0.25 ? 'a quiet' : warm(ah) ? 'a warm' : 'a cool'} accent on ${gl < 0.3 ? 'a deep' : gl > 0.85 ? 'a pale' : 'a mid-toned'} ${hslOf(p.ground)[1] < 0.12 ? 'neutral' : warm(gh) ? 'warm' : 'cool'} ground, with ${rel}`;
}

/** A palette made to read: ink at 4.5:1 on the ground at least, the accent apart from the ground. */
export function readablePalette(p: Palette): Palette {
  const t = tokensOf(p);
  let accent = p.accent;
  // an accent is a mark, not words: it needs to stand apart from the ground, not to be read on it
  for (let i = 0; i < 4 && contrastRatio(accent, p.ground) < 1.8; i++) accent = mix(accent, contrastRatio('#000000', p.ground) > contrastRatio('#ffffff', p.ground) ? '#000000' : '#ffffff', 0.25);
  return { ground: p.ground.toLowerCase(), ink: t.colors.text.toLowerCase(), accent: accent.toLowerCase(), support: p.support.filter((c) => HEX.test(c)).map((c) => c.toLowerCase()).slice(0, 3) };
}

const paletteKey = (p: Palette) => `${p.ground}|${p.accent}`;
const distinct = (list: readonly Palette[], p: Palette) => list.every((q) => rgbDist(q.accent, p.accent) > 60 || rgbDist(q.ground, p.ground) > 60);

function choiceOf(p: Palette, i: number, label?: string): PaletteChoice {
  const r = readablePalette(p);
  return { id: `pal-${i}`, name: label ?? `${colourName(r.ground)} and ${colourName(r.accent).toLowerCase()}`, note: cap(paletteNote(r)), ...r };
}

/** The brief's words, everything said so far, the feel decided, and what the subject itself suggests: what option
 * generators read. */
interface Reading {
  words: string;
  mood: string[];
  seed: string;
  vibe: VibeChoice | null;
  /** the engine's temperaments: those the words name, then those the subject's own temperament suggests */
  tempers: string[];
  /** things named whose colours the language leans toward (bread, the sea, embers) */
  things: string[];
  /** where the subject sits among the engine's qualities (loud, warm, deep, precise), when anything says */
  target: number[] | null;
  /** the words lean to a dark ground (night, dark, dramatic) */
  dark: boolean;
}

interface Temper4 {
  energy: number;
  warmth: number;
  play: number;
  gravity: number;
}

/** The subject's temperament (0–100 each), from the domains its words are about: a bakery is warm and lively, a
 * finance summit grave and cool, a party loud and playful. Null when the words name no subject the lexicon knows. */
function subjectTemper(words: string): Temper4 | null {
  const ids = readFacts(words).domains;
  const ds = DOMAINS.filter((d) => ids.includes(d.id));
  if (!ds.length) return null;
  const avg = (k: keyof Temper4) => ds.reduce((s, d) => s + d[k], 0) / ds.length;
  return { energy: avg('energy'), warmth: avg('warmth'), play: avg('play'), gravity: avg('gravity') };
}

/** The engine's temperaments a subject's temperament suggests, strongest first (warmth to warm, play to playful,
 * energy to dynamic, gravity to classic or serious, stillness to calm, coolness to precise). */
function tempersOfSubject(t: Temper4): string[] {
  const lean: [string, number][] = [
    ['warm', t.warmth - 60],
    ['playful', t.play - 58],
    ['dynamic', t.energy - 68],
    [t.warmth >= 50 ? 'classic' : 'serious', t.gravity - 58],
    ['calm', 38 - t.energy],
    ['precise', 38 - t.warmth],
  ];
  return lean.filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function readingOf(st: StudioState): Reading {
  const p = pre(st);
  const look = answer(st, `${p}.look`)?.text ?? '';
  // what the person has said the work is about or for counts as much as the opening words
  const said = [answer(st, 'l.about')?.text, answer(st, 'w.purpose')?.text].filter(Boolean).join('. ');
  const words = [unquoted(st.prompt), said, look].filter(Boolean).join('. ').replace(/\s+/g, ' ').slice(0, 1200);
  const f = readFacts(words);
  const mood = [...new Set([...(answer(st, `${p}.personality`)?.values ?? []), ...f.mood])].slice(0, 6);
  const own = [...new Set([...tempersOf([words, ...mood].join(' ')), ...mood.flatMap((m) => tempersOf(m))])];
  const t = subjectTemper(words);
  const tempers = [...new Set([...own, ...(t ? tempersOfSubject(t) : [])])].slice(0, 4);
  const qs = qualitiesIn(words).filter((q) => q.id !== 'depth' && q.id !== 'original');
  let target: number[] | null = t ? [(t.energy - 50) / 20 + (t.play - 50) / 40, (t.warmth - 50) / 15, (t.gravity - 50) / 20, (t.gravity - t.play) / 40 + (50 - t.warmth) / 40] : null;
  for (const q of qs) target = (target ?? [0, 0, 0, 0]).map((x, i) => x + axesOf(q)[i]);
  const dark = qs.some((q) => (q.palette ?? []).includes('darker'));
  return { words, mood, seed: `${st.prompt.slice(0, 120)}|${st.createdAt}|${st.round ?? 0}`, vibe: vibeAnswered(st), tempers: tempers.length ? tempers : ['modern'], things: thingsIn(words), target, dark };
}

/** A language for this subject (its temperaments, the things it names), another for each salt. */
const languageOf = (r: Pick<Reading, 'tempers' | 'things' | 'seed'>, salt: string, preferDark = false): VisualLanguage => languageFor(r.tempers, `${r.seed}|${salt}`, { things: r.things, preferDark });
const paletteOfLanguage = (l: VisualLanguage): Palette => ({ ground: l.palette.paper, ink: l.palette.ink, accent: l.palette.primary, support: [l.palette.secondary, l.palette.accent] });

/** The vibe chosen, as it was offered (or as the person's words made it). */
export function vibeAnswered(st: StudioState): VibeChoice | null {
  const a = answer(st, `${pre(st)}.vibe`);
  if (!a || a.skipped) return null;
  const qualities = a.values.filter((v) => !!qualityById(v));
  const theme = a.fields?.theme && themeById(a.fields.theme) ? a.fields.theme : undefined;
  if (!qualities.length && !theme) return null;
  return vibeOf(qualities, theme, { ground: a.fields?.ground, ink: a.fields?.ink, accent: a.fields?.accent }, a.fields?.name ?? '', a.fields?.note ?? '', 'vibe-chosen', (a.fields?.character as TypeCharacter) || undefined);
}

/** Palettes for this brief: from its own colour language, a theme it names, and the vibe chosen. */
export function paletteChoices(st: StudioState, count = 4): PaletteChoice[] {
  const r = readingOf(st);
  const out: Palette[] = [];
  const push = (p: Palette | null) => {
    if (p && distinct(out, readablePalette(p)) && out.length < count) out.push(readablePalette(p));
  };
  // a vibe chosen leads: its own colours, then its moves on the subject's language
  if (r.vibe) push(r.vibe.palette as Palette);
  const theme = themeIn(r.words);
  if (theme) push(r.dark || theme.prefers === 'dark' ? theme.dark : theme.light);
  // deep grounds for most options when the words or the vibe lean dark; one among them otherwise
  const leanDark = r.dark || (!!r.vibe && hslOf(r.vibe.palette.ground)[2] < 0.35);
  // the engine's languages for this subject (its temperaments, the things it names), each seed another reading
  for (let i = 0; i < 10 && out.length < count + 2; i++) {
    let p = paletteOfLanguage(languageOf(r, `pal|${i}`, leanDark ? i % 3 !== 2 : i % 4 === 2));
    if (r.vibe) for (const q of r.vibe.qualities) for (const sh of qualityById(q)?.palette ?? []) p = shiftPalette(p, sh);
    push(p);
  }
  if (theme && out.length < count) push(r.dark || theme.prefers === 'dark' ? theme.light : theme.dark);
  // too few that differ (a subject whose own colours are close — a coffee roastery's browns): its other temperaments
  // lead in turn, then its language without the things named, so the choice is between real alternatives
  const widen = [...r.tempers.slice(1).map((t, i) => ({ tempers: [t, ...r.tempers.filter((x) => x !== t)], things: r.things, salt: `lead${i}` })), { tempers: r.tempers, things: [] as string[], salt: 'plain' }, { tempers: [...r.tempers, 'modern'], things: [] as string[], salt: 'open' }];
  for (const w of widen)
    for (let i = 0; i < 4 && out.length < count; i++) {
      let p = paletteOfLanguage(languageFor(w.tempers, `${r.seed}|pal|${w.salt}|${i}`, { things: w.things, preferDark: leanDark ? i % 2 === 0 : i % 3 === 2 }));
      if (r.vibe) for (const q of r.vibe.qualities) for (const sh of qualityById(q)?.palette ?? []) p = shiftPalette(p, sh);
      push(p);
    }
  // at least one deep ground and one pale one, when the options are all alike
  const dark = out.some((p) => hslOf(p.ground)[2] < 0.35);
  if (!dark && out[0]) {
    const deep = readablePalette(shiftPalette(out[0], 'darker'));
    if (out.length >= count) out[count - 1] = deep;
    else out.push(deep);
  }
  const light = out.some((p) => hslOf(p.ground)[2] > 0.7);
  if (!light && out[0]) {
    const pale = readablePalette(shiftPalette(out[0], 'lighter'));
    if (out.length >= count) out[count - 2] = pale;
    else out.push(pale);
  }
  const seen = new Set<string>();
  return out
    .filter((p) => (seen.has(paletteKey(p)) ? false : (seen.add(paletteKey(p)), true)))
    .slice(0, count)
    .map((p, i) => choiceOf(p, i));
}

// ── typefaces: real pairings for the characters the brief and the vibe point to ──

const KIND_OF = (face: string) => fontByName(face)?.kind ?? 'sans';

/** A pairing of the character whose reading face is a text face (a display-only face is never set for reading). */
export function readableSet(character: TypeCharacter, turn = 0): { display: string; body: string; weight: number; case: 'none' | 'upper' } {
  const set = typeSetFor(character, { display: '', body: '' }, turn);
  if (!fontByName(set.body)?.displayOnly) return set;
  const other = TYPE_SETS[character].find((x) => !fontByName(x.body)?.displayOnly)?.body;
  const sameKind = FONTS.find((f) => !f.displayOnly && f.kind === (fontByName(set.body)?.kind ?? 'sans') && f.name !== set.display)?.name;
  return { ...set, body: other ?? sameKind ?? 'Inter' };
}

/** Pairings of real faces from the library, for the characters this brief calls for, spread across kinds of letter. */
export function typeChoices(st: StudioState, count = 3, avoid: readonly string[] = []): TypeChoice[] {
  const r = readingOf(st);
  const ranked: TypeCharacter[] = [];
  // characters offered before ("show me others") go to the back
  const add = (c: TypeCharacter | null | undefined) => c && !ranked.includes(c) && !avoid.includes(c) && ranked.push(c);
  add(r.vibe?.character);
  add(characterIn(r.words));
  for (const q of qualitiesIn(r.words)) add(q.type as TypeCharacter | undefined);
  for (const m of r.mood) add(characterIn(m));
  // the engine's own reading of the subject's temperament: the faces its language would set for it
  for (let i = 0; i < 5; i++) add(characterOfFace(languageOf(r, `type|${i}`).fonts.display));
  for (const c of ['editorial', 'geometric', 'expressive', 'humanist', 'refined', 'grotesk', 'classical', 'soft', 'condensed', 'retro'] as const) add(c);
  for (const c of avoid) if ((TYPE_CHARACTERS as readonly string[]).includes(c) && !ranked.includes(c as TypeCharacter)) ranked.push(c as TypeCharacter);
  // spread across kinds of letter: a serif, a sans, a display face, before a second of any
  const picked: TypeCharacter[] = [];
  const kinds = new Set<string>();
  for (const c of ranked) {
    const k = KIND_OF(TYPE_SETS[c][0].display);
    if (!kinds.has(k) || picked.length >= ranked.length) {
      picked.push(c);
      kinds.add(k);
    }
    if (picked.length >= count) break;
  }
  for (const c of ranked) if (picked.length < count && !picked.includes(c)) picked.push(c);
  return picked.slice(0, count).map((c, i) => {
    const set = readableSet(c, i + (st.round ?? 0));
    const note = fontByName(set.display)?.note ?? '';
    return { id: `type-${i}`, character: c, name: cap(CHARACTER_LABEL[c]), note: `${set.display}${set.body !== set.display ? ` with ${set.body}` : ''}${note ? ` — ${note.split(/[;,]/)[0]}` : ''}`, display: set.display, body: set.body, weight: set.weight, case: set.case };
  });
}

// ── vibes: qualities and themes the subject calls for, each a palette, a type and forms ──

/** The personality words the engines read, for the qualities of a vibe. */
const QUALITY_FEEL: Readonly<Record<string, readonly string[]>> = {
  futuristic: ['futuristic', 'technical'],
  editorial: ['editorial'],
  sophisticated: ['refined', 'elegant'],
  premium: ['luxurious', 'refined'],
  expressive: ['bold', 'loud'],
  depth: [],
  alive: ['energetic', 'joyful'],
  dramatic: ['bold', 'serious'],
  original: ['experimental'],
  minimal: ['minimal', 'quiet'],
  playful: ['playful', 'friendly'],
  calm: ['calm', 'quiet'],
  warm: ['warm'],
  cool: ['modern'],
  dark: ['serious'],
  light: ['quiet'],
  colourful: ['joyful'],
  muted: ['quiet'],
  mono: ['minimal'],
  retro: ['retro'],
  raw: ['raw'],
  modern: ['modern'],
  corporate: ['precise', 'serious'],
  organic: ['natural', 'crafted'],
  classic: ['classic'],
};

/** A quality as an adjective for a vibe's name ("dark", "colourful"; its edit label says "darker", "more colourful"). */
const adjective = (q: { id: string; label: string }) => (/^more |er$/.test(q.label) ? q.id : q.label);

/** A neutral starting palette, only when nothing about the subject is known (a model's vibe without colours). */
const PLAIN: Palette = { ground: '#f4f1ea', ink: '#1d1d1b', accent: '#3a5bd9', support: ['#c9b99a'] };

/**
 * A vibe from qualities (and a theme): its colours the subject's own language (or the theme's) moved by the qualities,
 * its type the qualities' character or the subject's faces, its forms from the theme or the qualities.
 */
function vibeOf(qualities: readonly string[], theme: string | undefined, palette: Partial<Palette> | null, name: string, note: string, id: string, character?: TypeCharacter, base?: { palette: Palette; character: TypeCharacter }): VibeChoice {
  const t = themeById(theme);
  const qs = qualities.map((q) => qualityById(q)).filter((q): q is NonNullable<ReturnType<typeof qualityById>> => !!q);
  let p: Palette = t ? { ...t.light } : base?.palette ?? PLAIN;
  if (palette?.ground && palette.ink && palette.accent && HEX.test(palette.ground) && HEX.test(palette.ink) && HEX.test(palette.accent)) p = { ground: palette.ground, ink: palette.ink, accent: palette.accent, support: palette.support ?? p.support };
  else {
    if (t && qs.some((q) => (q.palette ?? []).includes('darker'))) p = { ...t.dark };
    for (const q of qs) for (const sh of q.palette ?? []) if (!(t && sh === 'darker')) p = shiftPalette(p, sh);
  }
  const ch = character ?? (qs.find((q) => q.type)?.type as TypeCharacter | undefined) ?? t?.type ?? base?.character ?? 'neutral';
  // the forms the qualities ask for, else the ones that suit them (lines for the precise and the literary, a ring for
  // the luxurious, a low sun for the nostalgic, blocks for the raw, soft shapes for the warm and the calm)
  const suits = (ids: string[]) => qs.some((q) => ids.includes(q.id));
  const form = t?.forms ?? (qs.find((q) => q.forms?.kind)?.forms?.kind as FormKind | undefined) ?? (suits(['calm', 'organic', 'warm', 'playful']) ? 'organic' : suits(['futuristic', 'modern', 'corporate', 'mono', 'minimal', 'editorial', 'classic', 'sophisticated']) ? 'line' : suits(['premium']) ? 'ring' : suits(['retro']) ? 'sun' : suits(['raw']) ? 'block' : 'orb');
  const named = name || (t ? cap([t.label, ...qs.slice(0, 1).map(adjective)].join(', ')) : cap(qs.map(adjective).slice(0, 2).join(' and '))) || 'Your own';
  // what it would look like, in a line: the first quality's way, and the second's first move
  const says = [t?.says, ...qs.map((q) => q.says)].filter((x): x is string => !!x);
  const line = says.length > 1 ? `${says[0]}; ${says[1].split(/,\s*/)[0]}` : says[0] ?? '';
  return { id, name: named, note: note || cap(line), qualities: qs.map((q) => q.id), ...(t ? { theme: t.id } : {}), character: ch, palette: readablePalette(p), form: (FORM_KINDS as readonly string[]).includes(form) ? form : 'organic' };
}

/** The subject's own palette and faces for a vibe (each vibe another reading of the same subject). */
const baseFor = (r: Reading, i: number) => {
  const l = languageOf(r, `vibe|${i}`);
  return { palette: paletteOfLanguage(l), character: characterOfFace(l.fonts.display) };
};

type QualityDef = (typeof QUALITIES)[number];

/**
 * Where a quality sits, read from what it does in the engine (not from a list of moods): how loud (vivid, contrasting,
 * more and bigger forms, heavy type), how warm, how deep, how precise (geometric and technical type, lines and grids
 * against soft, humanist type and organic forms).
 */
function axesOf(q: QualityDef): number[] {
  const sh: readonly string[] = q.palette ?? [];
  const has = (...xs: string[]) => xs.some((x) => sh.includes(x));
  const type = q.type ?? '';
  const forms = q.forms ?? {};
  const loud = (has('vivid', 'contrast', 'neon', 'richer') ? 1 : 0) - (has('muted', 'restrained', 'pastel') ? 1 : 0) + ((forms.count ?? 0) > 0 ? 0.5 : (forms.count ?? 0) < 0 ? -0.5 : 0) + (['expressive', 'condensed', 'grotesk'].includes(type) ? 1 : ['refined', 'luxury', 'classical', 'soft'].includes(type) ? -0.5 : 0);
  const warm = (has('warmer', 'earthy', 'vintage') ? 1 : 0) - (has('cooler', 'neon', 'monochrome') ? 1 : 0);
  const deep = (has('darker', 'richer', 'metallic') ? 1 : 0) - (has('lighter', 'pastel') ? 1 : 0) + ((q.depth ?? 0) > 1 ? 0.5 : 0);
  const precise = (['futuristic', 'geometric', 'mono', 'neutral'].includes(type) ? 1 : ['humanist', 'soft', 'retro', 'friendly'].includes(type) ? -1 : 0) + (forms.kind === 'grid' || forms.kind === 'line' ? 1 : forms.kind === 'organic' ? -1 : 0);
  return [loud, warm, deep, precise];
}
const dist4 = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((x, i) => x - b[i]));
const mid = (a: readonly number[], b: readonly number[]) => a.map((x, i) => (x + b[i]) / 2);
// qualities that describe a mood (depth is how a design is built, "original" a request for a new idea: neither is a vibe)
const MOOD_QUALITIES = () => QUALITIES.filter((q) => q.id !== 'depth' && q.id !== 'original');

/** The quality that sits nearest another (its natural companion in a vibe), drawn toward the subject when one is
 * known; never itself. */
function companion(q: QualityDef, taken: ReadonlySet<string>, target: readonly number[] | null): QualityDef {
  const v = axesOf(q);
  return (
    MOOD_QUALITIES()
      .filter((x) => x.id !== q.id && !taken.has(x.id))
      .map((x) => ({ x, d: dist4(v, axesOf(x)) + (target ? 0.5 * dist4(target, axesOf(x)) : 0) }))
      .sort((a, b) => a.d - b.d || a.x.id.localeCompare(b.x.id))[0]?.x ?? q
  );
}

/**
 * Vibes for this brief, composed rather than chosen: a world its words name; then the mood nearest where its subject
 * and its words sit (a bakery warm and lively, a finance summit grave and cool), with its nearest companion; then
 * moods as different from those already offered as the subject allows (each again with its companion), so the choice
 * compares real alternatives that all belong to this brief. Each vibe's colours are the subject's own language moved
 * by its qualities.
 */
export function vibeChoices(st: StudioState, count = 4, avoid: readonly string[] = []): VibeChoice[] {
  const r = readingOf(st);
  // moods offered before ("show me others") are not offered again while others remain
  const pool = MOOD_QUALITIES().filter((q) => !avoid.includes(q.id) || MOOD_QUALITIES().length - avoid.length < count * 2);
  const fromWords = qualitiesIn(r.words).map((q) => q.id).filter((id) => pool.some((q) => q.id === id));
  const lean = [...fromWords, ...pool.filter((q) => r.tempers.includes(q.id) || r.mood.some((m) => q.words.test(m))).map((q) => q.id)];
  const theme = themeIn(r.words);
  const out: VibeChoice[] = [];
  const centres: number[][] = [];
  const taken = new Set<string>();
  const add = (seed: QualityDef, t?: string) => {
    if (out.length >= count) return;
    const partner = companion(seed, taken, r.target);
    const qs = partner.id === seed.id ? [seed.id] : [seed.id, partner.id];
    qs.forEach((x) => taken.add(x));
    centres.push(partner.id === seed.id ? axesOf(seed) : mid(axesOf(seed), axesOf(partner)));
    out.push(vibeOf(qs, t, null, '', '', `vibe-${out.length}`, undefined, baseFor(r, out.length)));
  };
  if (theme) add(pool.find((q) => q.id === (theme.prefers === 'dark' || r.dark ? 'dramatic' : 'calm'))!, theme.id);
  // the mood the words name, else the one nearest where the subject sits
  const nearest = r.target ? pool.filter((q) => !taken.has(q.id)).sort((a, b) => dist4(axesOf(a), r.target!) - dist4(axesOf(b), r.target!) || a.id.localeCompare(b.id))[0] : undefined;
  const leading = pool.find((q) => q.id === fromWords[0] && !taken.has(q.id)) ?? nearest ?? pool.find((q) => q.id === lean[0] && !taken.has(q.id));
  if (leading) add(leading);
  // the moods that could belong to this subject (the half of them nearest where it sits), when it is known
  const plausible = r.target ? [...pool].sort((a, b) => dist4(axesOf(a), r.target!) - dist4(axesOf(b), r.target!)).slice(0, Math.ceil(pool.length / 2) + 1) : pool;
  while (out.length < count) {
    // among them, as far from every mood offered as possible
    const next = (plausible.some((q) => !taken.has(q.id)) ? plausible : pool)
      .filter((q) => !taken.has(q.id))
      .map((q) => ({ q, d: (centres.length ? Math.min(...centres.map((c) => dist4(axesOf(q), c))) : -dist4(axesOf(q), [0, 0, 0, 0])) - (r.target ? 0.3 * dist4(axesOf(q), r.target) : 0) }))
      .sort((a, b) => b.d - a.d || a.q.id.localeCompare(b.q.id))[0]?.q;
    if (!next) break;
    add(next);
  }
  return out.slice(0, count);
}

// ── the questions, said for this work ──

export interface Subject {
  /** "the poster", "the logo", "the site", "the campaign" */
  it: string;
  /** the words to preview type in: the headline, else the name */
  sample: string;
}

let qseq = 0;
const qid = (decides: string) => `q-${decides}-${(qseq++ % 1000).toString(36)}`;

/** The question for what is to be decided next, with options generated for this brief and the answers so far. */
export function discoveryQuestion(st: StudioState, decides: string, subject: Subject): DiscoveryQuestion | null {
  const f = readFacts(st.prompt);
  const vibe = vibeAnswered(st);
  // asked again ("show me others"): what was offered goes to the back
  const before = st.discovery?.current?.decides === decides ? st.discovery.current : undefined;
  switch (decides) {
    case 'vibe': {
      const vibes = vibeChoices(st, 4, (before?.vibes ?? []).flatMap((v) => v.qualities));
      if (vibes.length < 2) return null;
      return { id: qid('vibe'), kind: 'vibe', decides, by: 'reader', text: `How should ${subject.it} feel? Here are a few moods it could have, drawn from what you’ve said — pick one, or describe it in your own words.`, vibes };
    }
    case 'colour': {
      const palettes = paletteChoices(st);
      if (palettes.length < 2) return null;
      const basis = vibe ? `for the “${vibe.name.toLowerCase()}” feel you chose` : 'from what you’ve said';
      return { id: qid('colour'), kind: 'colour', decides, by: 'reader', text: `Any colours in mind? Here are palettes ${basis} — choose one, or name your own (hex codes or words are fine).`, palettes };
    }
    case 'type': {
      const faces = typeChoices(st, 3, (before?.faces ?? []).map((x) => x.character ?? '').filter(Boolean));
      if (faces.length < 2) return null;
      return { id: qid('type'), kind: 'type', decides, by: 'reader', text: `How should the lettering speak? Here’s “${subject.sample}” set a few ways — choose one, or name a typeface or describe the style you like.`, faces };
    }
    case 'about':
      return { id: qid('about'), kind: 'text', decides, by: 'reader', text: `What does ${subject.sample ? `“${subject.sample}”` : 'it'} do, or stand for? A line is enough — it gives the mark its ideas and tells me which clichés to stay away from.`, options: [] };
    case 'purpose': {
      const options = purposeOptions(f.domains);
      return { id: qid('purpose'), kind: 'text', decides, by: 'reader', text: 'What should people be able to do on it — book, buy, get in touch, see your work? Each becomes a working part of the page.', options };
    }
    case 'pictures': {
      const one = st.attachments.filter((x) => x.kind === 'image').length === 1;
      return { id: qid('pictures'), kind: 'text', decides, by: 'reader', text: `Should I place ${one ? 'your picture' : 'your pictures'} in the design, or just take ${one ? 'its' : 'their'} look — the colours and the mood?`, options: [{ id: 'opt-place', label: 'Place it in the design', words: 'Place it in the design' }, { id: 'opt-look', label: 'Just take its look', words: 'Just take its look' }] };
    }
  }
  return null;
}

function purposeOptions(domains: readonly string[]): TextChoice[] {
  // what the subject's sites are for, said as a person would choose it
  const by: [string, string][] = domains.includes('food') ? [['See the menu and book a table', 'menu, booking'], ['Order online', 'products'], ['Get in touch', 'contact']] : domains.includes('wellbeing') ? [['Book a class', 'booking'], ['Get in touch', 'contact'], ['Read about us', 'story']] : domains.includes('art') || domains.includes('architecture') ? [['See the work', 'gallery'], ['Get in touch', 'contact'], ['Read about us', 'story']] : [['Book a session', 'booking'], ['Get in touch', 'contact'], ['See the work', 'gallery']];
  return by.map(([label], i) => ({ id: `opt-${i}`, label, words: label }));
}

// ── answers: a tap, the person's own words, a skip ──

const now0 = () => Date.now();

/** The discovery record with a question asked (and remembered as asked). */
export function askDiscovery(st: StudioState, q: DiscoveryQuestion): StudioState {
  const prev = st.discovery ?? { asked: [] };
  return { ...st, pending: 'discover', discovery: { current: q, asked: [...new Set([...prev.asked, q.decides])], budget: visualBudget(st), ...(prev.done ? { done: true } : {}) } };
}

/** The question waiting, answered or set aside: nothing pending, what was asked kept. */
export const closeDiscovery = (st: StudioState): StudioState => {
  const { pending: _, ...rest } = st;
  const d = st.discovery;
  return { ...rest, discovery: { asked: d?.asked ?? [], ...(d?.done ? { done: true } : {}), ...(typeof d?.budget === 'number' ? { budget: d.budget } : {}) } };
};
const closed = closeDiscovery;

/** What a palette, faces or a vibe decides, put where the engines read it. */
function applyChoice(st: StudioState, q: DiscoveryQuestion, choice: PaletteChoice | TypeChoice | VibeChoice, now: number): StudioState {
  const p = pre(st);
  const answers = { ...st.answers };
  if (q.kind === 'colour') {
    const c = choice as PaletteChoice;
    answers[`${p}.palette`] = { values: [c.id], fields: { ground: c.ground, ink: c.ink, accent: c.accent, ...(c.support[0] ? { accent2: c.support[0] } : {}), name: c.name }, source: 'person', at: now };
  } else if (q.kind === 'type') {
    const c = choice as TypeChoice;
    answers[`${p}.type`] = { values: [c.id], fields: { display: c.display, body: c.body, weight: String(c.weight), case: c.case, name: c.name }, source: 'person', at: now };
  } else if (q.kind === 'vibe') {
    const c = choice as VibeChoice;
    answers[`${p}.vibe`] = { values: c.qualities, fields: { name: c.name, note: c.note.slice(0, 300), character: c.character, ground: c.palette.ground, ink: c.palette.ink, accent: c.palette.accent, ...(c.theme ? { theme: c.theme } : {}) }, source: 'person', at: now };
    const feel = [...new Set(c.qualities.flatMap((x) => QUALITY_FEEL[x] ?? []))].slice(0, 4);
    if (feel.length) answers[`${p}.personality`] = { values: [...new Set([...feel, ...(answers[`${p}.personality`]?.source === 'person' ? answers[`${p}.personality`].values : [])])].slice(0, 4), source: 'person', at: now };
    answers[`${p}.look`] = { values: [], text: [answers[`${p}.look`]?.source === 'person' ? answers[`${p}.look`].text : '', `${c.name}: ${c.note}`].filter(Boolean).join('; ').slice(0, 400), source: 'person', at: now };
  }
  return { ...st, answers };
}

/** A tap on one of the options offered: the decision taken, and what to say back. */
export function chooseDiscovery(st: StudioState, optionId: string, now = now0()): { st: StudioState; ack: string; words: string } | null {
  const q = st.discovery?.current;
  if (!q) return null;
  const list = [...(q.palettes ?? []), ...(q.faces ?? []), ...(q.vibes ?? [])] as (PaletteChoice | TypeChoice | VibeChoice)[];
  const pick = list.find((x) => x.id === optionId);
  if (pick) {
    const next = closed(applyChoice(st, q, pick, now));
    const what = q.kind === 'colour' ? `the ${pick.name} palette` : q.kind === 'type' ? `${pick.name.toLowerCase()} lettering — ${(pick as TypeChoice).display}` : `${pick.name.toLowerCase()}`;
    return { st: next, ack: `${cap(what)}.`, words: pick.name };
  }
  const opt = q.options?.find((x) => x.id === optionId);
  return opt ? { st, ack: '', words: opt.words } : null;
}

/** A question skipped: decided by SocriaUX, never asked again. */
export function skipDiscovery(st: StudioState, now = now0()): StudioState {
  const q = st.discovery?.current;
  if (!q) return st;
  const p = pre(st);
  const id = q.decides === 'colour' ? `${p}.palette` : q.decides === 'type' ? `${p}.type` : q.decides === 'vibe' ? `${p}.vibe` : q.decides === 'purpose' ? 'w.purpose' : q.decides === 'about' ? 'l.about' : q.decides === 'pictures' ? `${p}.pictures` : `d.${q.decides}`;
  return closed({ ...st, answers: { ...st.answers, [id]: { values: [], skipped: true, source: 'person', at: now } } });
}

/** Colours read from the person's words: hex codes and colours named, as a palette (ground, ink, accent). */
export function paletteFromWords(text: string, base?: Palette | null): Palette | null {
  const f = readFacts(text);
  const cs = f.colours.filter((c) => HEX.test(c));
  if (!cs.length) return null;
  const lum = (h: string) => contrastRatio(h, '#000000');
  const sat = (h: string) => hslOf(h)[1];
  if (cs.length === 1) {
    // one colour named: it is the accent, on a ground and ink that let it sing (from the brief's own palette when there is one)
    const g = base?.ground ?? (lum(cs[0]) > 9 ? '#1d1d1b' : '#f5f2ea');
    return readablePalette({ ground: g, ink: base?.ink ?? (lum(g) > 9 ? '#1d1d1b' : '#f5f2ea'), accent: cs[0], support: base?.support ?? [] });
  }
  const byLum = [...cs].sort((a, b) => lum(b) - lum(a));
  const ground = /\b(dark|black|night|deep)\b.*\b(ground|background)\b|\bon (?:a )?(?:dark|black)\b/i.test(text) ? byLum[byLum.length - 1] : byLum[0];
  const ink = ground === byLum[0] ? byLum[byLum.length - 1] : byLum[0];
  const rest = cs.filter((c) => c !== ground && c !== ink).sort((a, b) => sat(b) - sat(a));
  const accent = rest[0] ?? (sat(ink) > sat(ground) ? ink : ground === byLum[0] ? mix(ink, '#3a5bd9', 0.5) : mix(ground, '#e8a33d', 0.5));
  return readablePalette({ ground, ink: ink === accent ? (lum(ground) > 9 ? '#1d1d1b' : '#f5f2ea') : ink, accent, support: rest.slice(1) });
}

/** Words that only point to something to learn from ("something like larkfield.studio") and say nothing else. */
export function onlyPointsElsewhere(text: string): boolean {
  const rest = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|co|app|design|studio|dev|ai|uk|de|fr|nl|se|dk|no|it|es|jp|xyz|art|me|so|site|page|website|agency|shop|store|cafe|coffee)\b\S*/gi, ' ')
    .replace(/\b(something|anything|like|look at|looking at|see|similar to|inspired by|in the style of|the feel of|the vibe of|or|and|a bit|kind of|sort of|maybe|perhaps|the|this|that|one|site|website|page|please)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}#]+/gu, ' ')
    .trim();
  return rest.length === 0 && /https?:\/\/|\.[a-z]{2,}\b/i.test(text);
}

/**
 * The person's own words, read as the answer to the question waiting: colours (hex codes, colours named, or a way of
 * colouring described), a typeface named or a style of letter described, a feel in their words. False when the words
 * say nothing about it (the caller reads them for anything else they change).
 */
export function answerDiscoveryWords(st: StudioState, text: string, now = now0()): { st: StudioState; ack: string; read: boolean } {
  const q = st.discovery?.current;
  if (!q) return { st, ack: '', read: false };
  const p = pre(st);
  const t = text.trim();
  // a site to learn from is read for what it shows; the question goes on waiting
  if (onlyPointsElsewhere(t)) return { st, ack: '', read: false };
  const answers = { ...st.answers };
  const done = (ack: string) => ({ st: closed({ ...st, answers }), ack, read: true });
  if (q.kind === 'colour') {
    const base = (q.palettes?.[0] as Palette | undefined) ?? null;
    const pal = paletteFromWords(t, base);
    if (pal) {
      answers[`${p}.palette`] = { values: [], text: t.slice(0, 300), fields: { ground: pal.ground, ink: pal.ink, accent: pal.accent, ...(pal.support[0] ? { accent2: pal.support[0] } : {}), name: `${colourName(pal.ground)} and ${colourName(pal.accent).toLowerCase()}` }, source: 'person', at: now };
      return done(`${colourName(pal.ground)} and ${colourName(pal.accent).toLowerCase()} — your colours.`);
    }
    // a way of colouring described ("earthy, sun-faded"): the nearest palette offered moved that way, and the words kept
    const moves = qualitiesIn(t).flatMap((x) => x.palette ?? []);
    const theme = themeIn(t);
    if (moves.length || theme) {
      let p0: Palette = theme ? theme.light : base ? { ground: base.ground, ink: base.ink, accent: base.accent, support: base.support } : { ground: '#f4f1ea', ink: '#1d1d1b', accent: '#3a5bd9', support: [] };
      for (const m of moves) p0 = shiftPalette(p0, m);
      const r = readablePalette(p0);
      answers[`${p}.palette`] = { values: [], text: t.slice(0, 300), fields: { ground: r.ground, ink: r.ink, accent: r.accent, ...(r.support[0] ? { accent2: r.support[0] } : {}), name: `${colourName(r.ground)} and ${colourName(r.accent).toLowerCase()}` }, source: 'person', at: now };
      return done(`${cap(t.replace(/[.!]+$/, '').slice(0, 60))} — I’ve made a palette that way.`);
    }
    if (t.split(/\s+/).length <= 12 && !/\b(make|change|move|logo|headline)\b/i.test(t)) {
      answers[`${p}.look`] = { values: [], text: [answers[`${p}.look`]?.text, `colours: ${t}`].filter(Boolean).join('; ').slice(0, 400), source: 'person', at: now };
      return done('I’ll take that into the colours.');
    }
    return { st, ack: '', read: false };
  }
  // words that are about something else (colours named, a site to learn from) are not this answer: read for what they say
  const elsewhere = (() => {
    const f = readFacts(t);
    return f.colours.length > 0 || f.urls.length > 0 || /\b(?:www\.|[a-z0-9-]+\.(?:com|org|net|io|co|app|design|studio)\b)/i.test(t);
  })();
  if (q.kind === 'type') {
    const named = facesNamed(t);
    const character = characterIn(t);
    if (!named.length && !character && elsewhere) return { st, ack: '', read: false };
    if (named.length || character) {
      const set = character ? readableSet(character, 0) : null;
      const display = named[0] ?? set!.display;
      const body = named[1] ?? (named[0] ? (fontByName(named[0])?.displayOnly ? set?.body ?? 'Inter' : named[0]) : set!.body);
      answers[`${p}.type`] = { values: [], text: t.slice(0, 300), fields: { display, body, ...(set ? { weight: String(set.weight), case: set.case } : {}), name: character ? cap(CHARACTER_LABEL[character]) : display }, source: 'person', at: now };
      return done(`${display}${body !== display ? ` with ${body}` : ''}.`);
    }
    if (t.split(/\s+/).length <= 12 && !/\b(make|change|move|logo|headline)\b/i.test(t)) {
      answers[`${p}.look`] = { values: [], text: [answers[`${p}.look`]?.text, `lettering: ${t}`].filter(Boolean).join('; ').slice(0, 400), source: 'person', at: now };
      return done('I’ll set it that way.');
    }
    return { st, ack: '', read: false };
  }
  if (q.kind === 'vibe') {
    const qs = qualitiesIn(t).map((x) => x.id);
    const theme = themeIn(t)?.id;
    const f = readFacts(t);
    if (!qs.length && !theme && !f.mood.length && elsewhere) return { st, ack: '', read: false };
    if (qs.length || theme || f.mood.length || t.split(/\s+/).length <= 14) {
      const v = vibeOf(qs.slice(0, 3), theme, null, cap(t.replace(/[.!]+$/, '').slice(0, 48)), t.slice(0, 200), 'vibe-own', undefined, baseFor(readingOf({ ...st, prompt: `${st.prompt}. ${t}` }), 0));
      answers[`${p}.vibe`] = { values: v.qualities, fields: { name: v.name, note: v.note, character: v.character, ground: v.palette.ground, ink: v.palette.ink, accent: v.palette.accent, ...(v.theme ? { theme: v.theme } : {}) }, text: t.slice(0, 300), source: 'person', at: now };
      const feel = [...new Set([...f.mood, ...v.qualities.flatMap((x) => QUALITY_FEEL[x] ?? [])])].slice(0, 4);
      if (feel.length) answers[`${p}.personality`] = { values: feel, source: 'person', at: now };
      answers[`${p}.look`] = { values: [], text: [answers[`${p}.look`]?.text, t].filter(Boolean).join('; ').slice(0, 400), source: 'person', at: now };
      return done(`${cap(t.replace(/[.!]+$/, '').slice(0, 60))} — that’s the feel.`);
    }
    return { st, ack: '', read: false };
  }
  return { st, ack: '', read: false };
}

// ── what the model writes, held to its shape ──

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const hex = (v: unknown) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);
const TOPIC = /^[a-z]{2,16}$/;

/**
 * A question the model wrote, held to its shape: colours that are colours (made to read), faces that are in the font
 * library, vibes in the engine's vocabulary, at most four options of each and at least two that hold, words of its
 * own (never copy for the work). Null when it does not hold.
 */
export function normalizeDiscoveryQuestion(v: unknown): DiscoveryQuestion | null {
  const r = o(v);
  const kind = (DISCOVERY_KINDS as readonly string[]).includes(r.kind) ? (r.kind as DiscoveryKind) : null;
  const text = str(r.text, 300);
  if (!kind || !text) return null;
  const decides = kind === 'text' ? (TOPIC.test(str(r.decides, 16)) ? str(r.decides, 16) : 'topic') : kind;
  const base = { id: qid(decides), kind, decides, text, ...(str(r.why, 200) ? { why: str(r.why, 200) } : {}), by: 'model' as const };
  if (kind === 'colour') {
    const palettes = (Array.isArray(r.palettes) ? r.palettes : [])
      .slice(0, 4)
      .map((x: unknown, i: number) => {
        const p = o(x);
        const g = hex(p.ground);
        const ink = hex(p.ink);
        const a = hex(p.accent);
        if (!g || !ink || !a) return null;
        const pal = readablePalette({ ground: g, ink, accent: a, support: (Array.isArray(p.support) ? p.support : []).map(hex).filter((c: string | null): c is string => !!c).slice(0, 3) });
        return { id: `pal-${i}`, name: str(p.name, 40) || `${colourName(pal.ground)} and ${colourName(pal.accent).toLowerCase()}`, note: str(p.note, 140) || cap(paletteNote(pal)), ...pal } as PaletteChoice;
      })
      .filter((x: PaletteChoice | null): x is PaletteChoice => !!x);
    return palettes.length >= 2 ? { ...base, palettes } : null;
  }
  if (kind === 'type') {
    const faces = (Array.isArray(r.faces) ? r.faces : [])
      .slice(0, 4)
      .map((x: unknown, i: number) => {
        const p = o(x);
        const display = fontByName(str(p.display, 60));
        const body = fontByName(str(p.body, 60));
        if (!display || !body || body.displayOnly) return null;
        const character = (TYPE_CHARACTERS as readonly string[]).includes(p.character) ? (p.character as TypeCharacter) : characterOfFace(display.name);
        const set = TYPE_SETS[character].find((s) => s.display === display.name);
        return { id: `type-${i}`, character, name: str(p.name, 40) || cap(CHARACTER_LABEL[character]), note: str(p.note, 140) || `${display.name} with ${body.name}`, display: display.name, body: body.name, weight: clamp(Number(p.weight) || set?.weight || 600, 100, 900), case: p.case === 'upper' ? 'upper' : set?.case ?? 'none' } as TypeChoice;
      })
      .filter((x: TypeChoice | null): x is TypeChoice => !!x);
    return faces.length >= 2 ? { ...base, faces } : null;
  }
  if (kind === 'vibe') {
    const vibes = (Array.isArray(r.vibes) ? r.vibes : [])
      .slice(0, 4)
      .map((x: unknown, i: number) => {
        const p = o(x);
        const qualities = (Array.isArray(p.qualities) ? p.qualities : []).filter((q: unknown): q is string => typeof q === 'string' && !!qualityById(q)).slice(0, 3);
        const theme = typeof p.theme === 'string' && themeById(p.theme) ? p.theme : undefined;
        if (!qualities.length && !theme) return null;
        const character = (TYPE_CHARACTERS as readonly string[]).includes(p.character) ? (p.character as TypeCharacter) : undefined;
        // its own colours when they are colours (made to read), else the qualities' moves on a plain palette
        const pal = o(p.palette);
        const own = hex(pal.ground) && hex(pal.ink) && hex(pal.accent) ? { ground: hex(pal.ground)!, ink: hex(pal.ink)!, accent: hex(pal.accent)!, support: (Array.isArray(pal.support) ? pal.support : []).map(hex).filter((c: string | null): c is string => !!c).slice(0, 3) } : null;
        const v = vibeOf(qualities, theme, own, str(p.name, 40), str(p.note, 160), `vibe-${i}`, character);
        return (FORM_KINDS as readonly string[]).includes(p.form) ? { ...v, form: p.form as FormKind } : v;
      })
      .filter((x: VibeChoice | null): x is VibeChoice => !!x);
    return vibes.length >= 2 ? { ...base, vibes } : null;
  }
  const options = (Array.isArray(r.options) ? r.options : [])
    .slice(0, 4)
    .map((x: unknown, i: number) => ({ id: `opt-${i}`, label: str(o(x).label, 60), words: str(o(x).words, 200) || str(o(x).label, 200) }))
    .filter((x: TextChoice) => x.label && x.words);
  return { ...base, options };
}

/** The discovery record as stored: held to its shape (questions through the same normaliser as the model's). */
export function normalizeDiscovery(v: unknown): DiscoveryState | undefined {
  const r = o(v);
  const asked = [...new Set((Array.isArray(r.asked) ? r.asked : []).filter((x: unknown): x is string => typeof x === 'string' && TOPIC.test(x)))].slice(0, 12);
  const cur = r.current ? storedQuestion(r.current) : null;
  const budget = typeof r.budget === 'number' && Number.isFinite(r.budget) ? Math.max(0, Math.min(2, Math.round(r.budget))) : undefined;
  if (!asked.length && !cur && r.done !== true) return undefined;
  return { asked, ...(cur ? { current: cur } : {}), ...(r.done === true ? { done: true } : {}), ...(budget !== undefined ? { budget } : {}) };
}

/** A stored question: the model's normaliser for its shape, its own options kept as they were offered. */
function storedQuestion(v: unknown): DiscoveryQuestion | null {
  const r = o(v);
  const q = normalizeDiscoveryQuestion({ ...r, faces: r.faces, palettes: r.palettes, vibes: (Array.isArray(r.vibes) ? r.vibes : []).map((x: unknown) => ({ ...o(x) })) });
  if (!q) return null;
  // the options keep the ids they were offered with (a tap after a reload means the same option)
  const keepIds = <T extends { id: string }>(list: T[] | undefined, raw: unknown): T[] | undefined => list?.map((x: T, i: number) => ({ ...x, id: typeof o((raw as unknown[])?.[i]).id === 'string' && /^[\w-]{1,24}$/.test(o((raw as unknown[])[i]).id) ? o((raw as unknown[])[i]).id : x.id }));
  const id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : q.id;
  const decides = typeof r.decides === 'string' && TOPIC.test(r.decides) ? r.decides : q.decides;
  // a stored vibe keeps its own palette and form (they were drawn for this brief)
  const vibes = q.vibes?.map((x, i) => {
    const raw = o((r.vibes as unknown[])?.[i]);
    const pal = o(raw.palette);
    const g = hex(pal.ground);
    const ink = hex(pal.ink);
    const a = hex(pal.accent);
    return { ...x, ...(g && ink && a ? { palette: readablePalette({ ground: g, ink, accent: a, support: (Array.isArray(pal.support) ? pal.support : []).map(hex).filter((c: string | null): c is string => !!c) }) } : {}), ...((FORM_KINDS as readonly string[]).includes(raw.form) ? { form: raw.form as FormKind } : {}) };
  });
  return { ...q, id, decides, by: r.by === 'model' ? 'model' : 'reader', ...(q.palettes ? { palettes: keepIds(q.palettes, r.palettes) } : {}), ...(q.faces ? { faces: keepIds(q.faces, r.faces) } : {}), ...(vibes ? { vibes: keepIds(vibes, r.vibes) } : {}), ...(q.options ? { options: keepIds(q.options, r.options) } : {}) };
}

/** The qualities and theme a chosen vibe asks the engine to realise in the work (for the creative executor). */
export function vibePlanOf(st: StudioState): { qualities: string[]; theme?: string } | null {
  const v = vibeAnswered(st);
  if (!v) return null;
  return { qualities: v.qualities.filter((q) => q !== 'depth' || v.qualities.length === 1), ...(v.theme ? { theme: v.theme } : {}) };
}

/** Every theme and quality, by id, for a model's instructions. */
export const VIBE_VOCABULARY = { themes: THEMES.map((t) => t.id), qualities: QUALITIES.map((q) => q.id), characters: [...TYPE_CHARACTERS] };

// keep the HSL helpers referenced (palette notes and names use them through colourName/paletteNote)
void hslHex;
