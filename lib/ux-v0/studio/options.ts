// lib/ux-v0/studio/options.ts — the choices a question offers that come from the engines themselves: the styles the
// style selector picks for these words, the palettes and faces those styles carry, the subjects the lexicon knows, the
// systems the board engine proposes for a website. Inspiration to choose from, never templates: what is chosen
// reaches the engine as a parameter, and the engine still composes everything itself.

import type { StudioState } from './schema';
import { readFacts } from './facts';
import { PERSONALITY, DOMAIN_TEMPERAMENT, LETTERING } from './catalog';
import { answerOf, graphicBriefOf, personalityOf, websiteAskOf, wordsOf } from './apply';
import { selectStyles } from '../graphics/styles/interpret';
import { styleById } from '../graphics/styles/registry';
import { facesFor, paletteFor } from '../graphics/styles/apply';
import { languageDirection } from '../graphics/generative/language';
import { DOMAINS } from '../graphics/generative/lexicon';
import { proposeSystems } from '../boards/pipeline';
import type { MasterDesignSystem } from '../boards/system';
import { graphicFont, knownFont } from '../fonts';
import type { GraphicKind } from '../graphics/compose';

export interface OptionSeed {
  id: string;
  label: string;
  hint?: string;
  swatches?: string[];
  faces?: { display: string; body: string };
  recommended?: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const salt = (st: StudioState) => `${st.createdAt}|${st.prompt.slice(0, 80)}`;

/** The words the style selector reads: the opening sentence, the temperament chosen, the person's own words. */
function lookWords(st: StudioState): { words: string; mood: string[]; kind?: GraphicKind } {
  const b = st.mode === 'graphic' ? graphicBriefOf(st) : null;
  return { words: [st.prompt, ...personalityOf(st)].join(' '), mood: personalityOf(st), ...(b ? { kind: b.kind } : {}) };
}

/** Six styles for these words, best first and kept apart, plus a language generated from the words themselves. */
export function styleOptions(st: StudioState, count = 6): OptionSeed[] {
  const { words, mood, kind } = lookWords(st);
  const picks = selectStyles({ words, mood, kind }, { count, salt: salt(st) });
  const named = readFacts(st.prompt).styles.map((id) => styleById(id)).filter((x): x is NonNullable<typeof x> => !!x);
  const seen = new Set<string>();
  const out: OptionSeed[] = [];
  for (const s of [...named, ...picks.map((p) => p.style)]) {
    if (seen.has(s.id) || out.length >= count) continue;
    seen.add(s.id);
    const p = paletteFor(s, { seed: salt(st) });
    out.push({ id: s.id, label: s.name, hint: s.description.split(/(?<=\.)\s/)[0]?.slice(0, 90), swatches: [p.ground, p.ink, p.accent, p.accent2], recommended: named.some((n) => n.id === s.id) });
  }
  out.push({ id: 'generated', label: 'Made from your words', hint: 'A language drawn from what you said, no style behind it' });
  return out;
}

/** Palettes to choose from: the chosen (or likeliest) styles' own, and the words' own temperament. */
export function paletteOptions(st: StudioState): OptionSeed[] {
  const chosen = (answerOf(st, st.mode === 'board' ? 'b.direction' : 'g.style')?.values ?? []).filter((x) => x !== 'generated');
  const ids = chosen.length ? chosen : styleOptions(st, 4).map((o) => o.id).filter((x) => x !== 'generated');
  const out: OptionSeed[] = [];
  const add = (id: string, label: string, sw: string[], hint?: string) => {
    const key = sw.slice(0, 3).join('|');
    if (out.some((o) => o.swatches?.slice(0, 3).join('|') === key)) return;
    out.push({ id: sw.slice(0, 4).join('|'), label, swatches: sw.slice(0, 4), ...(hint ? { hint } : {}) });
  };
  for (const id of ids.slice(0, 3)) {
    const s = styleById(id);
    if (!s) continue;
    for (const k of [0, 1]) {
      const p = paletteFor(s, { seed: `${salt(st)}|${k}` });
      add(`${id}-${k}`, k ? `${s.name}, another way` : s.name, [p.ground, p.ink, p.accent, p.accent2]);
    }
  }
  // the words' own temperament, with no style behind it
  for (const k of [0, 1, 2]) {
    const d = languageDirection(st.prompt || 'a work', personalityOf(st), `${salt(st)}|lang|${k}`);
    const c = d.tokens.colors;
    add(`lang-${k}`, k === 0 ? 'From your words' : `From your words, ${['', 'warmer', 'cooler'][k]}`, [c.background, c.text, c.accent, (c as Record<string, string>).accent2 ?? c.muted]);
  }
  return out.slice(0, 7);
}

const CLASSIC_PAIRS: readonly [string, string, string][] = [
  ['Fraunces', 'Inter', 'Warm and editorial'],
  ['Space Grotesk', 'Inter', 'Technical and clear'],
  ['Playfair Display', 'Source Sans 3', 'Classic contrast'],
  ['Archivo Black', 'Archivo', 'Loud and sure'],
  ['DM Serif Display', 'DM Sans', 'Quietly elegant'],
  ['Syne', 'Inter', 'Expressive'],
  ['IBM Plex Mono', 'IBM Plex Sans', 'Precise'],
];

const known = (f: string) => !!(graphicFont(f) ?? knownFont(f));

/** Type pairings: the chosen styles' own faces, then pairings that each say something different. */
export function typeOptions(st: StudioState): OptionSeed[] {
  const chosen = (answerOf(st, st.mode === 'board' ? 'b.direction' : 'g.style')?.values ?? []).filter((x) => x !== 'generated');
  const ids = chosen.length ? chosen : styleOptions(st, 3).map((o) => o.id).filter((x) => x !== 'generated');
  const out: OptionSeed[] = [];
  const add = (display: string, body: string, label: string) => {
    if (!known(display) || !known(body) || out.some((o) => o.faces?.display === display && o.faces?.body === body)) return;
    out.push({ id: `${display}|${body}`, label, faces: { display, body }, hint: `${display} with ${body}` });
  };
  for (const id of ids.slice(0, 3)) {
    const s = styleById(id);
    if (!s) continue;
    const f = facesFor(s, salt(st));
    add(f.display, f.body, s.name);
  }
  for (const [d, b, l] of CLASSIC_PAIRS) add(d, b, l);
  return out.slice(0, 6);
}

/** Temperament words, the likeliest for these words first (those already said are chosen for the person). */
export function personalityOptions(st: StudioState): OptionSeed[] {
  const f = readFacts(st.prompt);
  const lean = [...f.mood, ...f.domains.flatMap((d) => DOMAIN_TEMPERAMENT[d] ?? [])];
  const rank = (id: string) => {
    const i = lean.indexOf(id);
    return i < 0 ? 99 : i;
  };
  return [...PERSONALITY].sort((a, b) => rank(a.id) - rank(b.id)).map((p) => ({ id: p.id, label: p.label, recommended: lean.includes(p.id) }));
}

/** Subjects a logo can be about (the generative lexicon's domains), the words' own first. */
export function domainOptions(st: StudioState): OptionSeed[] {
  const f = readFacts(st.prompt);
  return DOMAINS.filter((d) => d.id !== 'general')
    .map((d) => ({ id: d.label, label: cap(d.label), recommended: f.domains.includes(d.id) }))
    .sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended));
}

/** Things a mark could call to mind: the metaphors the lexicon knows for the subjects chosen. */
export function ideaOptions(st: StudioState): OptionSeed[] {
  const chosen = [...(answerOf(st, 'l.about')?.values ?? []), ...readFacts(st.prompt).domains].map((x) => x.toLowerCase());
  const doms = DOMAINS.filter((d) => chosen.includes(d.label.toLowerCase()) || chosen.includes(d.id));
  const pool = (doms.length ? doms : DOMAINS.filter((d) => d.id === 'general')).flatMap((d) => d.metaphors.map((m) => ({ id: m.name, label: cap(m.name), hint: m.says })));
  const seen = new Set<string>();
  return pool.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).slice(0, 10);
}

/** Lettering for the name, each set in a face that says it. */
export function letteringOptions(): OptionSeed[] {
  return LETTERING.filter((l) => known(l.face)).map((l) => ({ id: l.id, label: l.label, hint: l.hint, faces: { display: l.face, body: l.face } }));
}

/** Three systems a website could be made in, proposed by the board engine for these words (or none without them). */
export function websiteSystems(st: StudioState): MasterDesignSystem[] {
  const ask = websiteAskOf(st);
  if (!ask) return [];
  return proposeSystems(ask.board, salt(st)).slice(0, 3);
}

export function websiteOptions(systems: readonly MasterDesignSystem[]): OptionSeed[] {
  return systems.map((s, i) => ({ id: `sys-${i}`, label: s.direction.name, hint: s.direction.concept?.split(/(?<=\.)\s/)[0]?.slice(0, 90) ?? s.personality.slice(0, 3).join(', '), swatches: [s.tokens.colors.background, s.tokens.colors.text, s.tokens.colors.accent], faces: { display: s.tokens.fonts.display, body: s.tokens.fonts.body } }));
}

/** The words to compose previews with: the person's headline, else their name, else the opening sentence's subject. */
export function previewWords(st: StudioState): { headline: string; subhead: string } {
  const stage = st.mode === 'board' ? 'b.words' : st.mode === 'website' ? 'w.words' : 'g.words';
  const w = wordsOf(st, stage);
  const f = readFacts(st.prompt);
  const headline = w.headline || w.brand || f.brand || f.headline || (st.prompt.split(/[.,;:]/)[0] ?? '').replace(/^\s*(an?|the|make|create|design)\s+/i, '').slice(0, 48) || 'Your words here';
  return { headline, subhead: w.subhead || f.subhead || '' };
}
