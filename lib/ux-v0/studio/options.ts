// lib/ux-v0/studio/options.ts — the choices a question offers that come from the engines themselves: the styles the
// style selector picks for these words, the palettes and faces those styles carry, the subjects the lexicon knows, the
// systems the board engine proposes for a website. Inspiration to choose from, never templates: what is chosen
// reaches the engine as a parameter, and the engine still composes everything itself.

import type { StudioState } from './schema';
import { readFacts } from './facts';
import { PERSONALITY, DOMAIN_TEMPERAMENT } from './catalog';
import { answerOf, personalityOf, prefsOf, systemsWithPrefs, websiteAskOf, wordsOf } from './apply';
import { influencesOf, likedOf, paletteOutOf, referenceColours } from './research';
import { styleById } from '../graphics/styles/registry';
import { facesFor } from '../graphics/styles/apply';
import { languageDirection } from '../graphics/generative/language';
import { DOMAINS } from '../graphics/generative/lexicon';
import { proposeSystems } from '../boards/pipeline';
import type { MasterDesignSystem } from '../boards/system';
import { graphicFont, knownFont } from '../fonts';

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

const short = (t: string, n = 28) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t) || 'Untitled';

/**
 * Palettes the person never has to know beforehand: the colours of the references they liked (all of them together,
 * then each), and their own words' temperament. Nothing here is a stock palette: every option is read from what this
 * conversation found or said.
 */
export function paletteOptions(st: StudioState): OptionSeed[] {
  const out: OptionSeed[] = [];
  const add = (label: string, sw: readonly string[], hint?: string) => {
    const key = sw.slice(0, 3).join('|');
    if (sw.length < 3 || out.some((o) => o.swatches?.slice(0, 3).join('|') === key)) return;
    out.push({ id: sw.slice(0, 4).join('|'), label, swatches: sw.slice(0, 4), ...(hint ? { hint } : {}) });
  };
  const liked = likedOf(st);
  const together = paletteOutOf(referenceColours(liked));
  if (together) add('From the references you liked', [together.ground, together.ink, together.accent, together.accent2 ?? together.accent], `${liked.length} reference${liked.length === 1 ? '' : 's'}`, );
  for (const r of liked.slice(0, 3)) {
    const p = paletteOutOf(r.swatches ?? []);
    if (p) add(`From “${short(r.title)}”`, [p.ground, p.ink, p.accent, p.accent2 ?? p.accent], r.creator ? `by ${short(r.creator, 32)}` : undefined);
  }
  // the words' own temperament, with no reference behind it
  for (const k of [0, 1, 2]) {
    const d = languageDirection(st.prompt || 'a work', personalityOf(st), `${salt(st)}|lang|${k}`);
    const c = d.tokens.colors;
    add(k === 0 ? 'From your words' : 'From your words, another way', [c.background, c.text, c.accent, (c as Record<string, string>).accent2 ?? c.muted]);
  }
  return out.slice(0, 6);
}

const known = (f: string) => !!(graphicFont(f) ?? knownFont(f));

/** The influences the conversation found: those its liked references name, and those the person named themselves. */
const influences = (st: StudioState) => [...new Set([...influencesOf(likedOf(st)).styles, ...readFacts(st.prompt).styles])];

/**
 * Type, generated rather than picked from a list: the faces the references' influences carry, then voices the
 * generative language finds for the person's own words and temperament, each one set in itself.
 */
export function typeOptions(st: StudioState): OptionSeed[] {
  const out: OptionSeed[] = [];
  const add = (display: string, body: string, hint: string) => {
    if (!known(display) || !known(body) || out.some((o) => o.faces?.display === display && o.faces?.body === body)) return;
    out.push({ id: `${display}|${body}`, label: display === body ? display : `${display} and ${body}`, faces: { display, body }, hint });
  };
  for (const id of influences(st).slice(0, 3)) {
    const s = styleById(id);
    if (!s) continue;
    const f = facesFor(s, salt(st));
    add(f.display, f.body, 'From your references');
  }
  for (let k = 0; k < 10 && out.length < 6; k++) {
    const d = languageDirection(st.prompt || 'a work', personalityOf(st), `${salt(st)}|type|${k}`);
    add(d.tokens.fonts.display, d.tokens.fonts.body, 'From your words');
  }
  return out.slice(0, 6);
}

/** Lettering for a name: the display voices found for it, each set in the name itself. */
export function letteringOptions(st: StudioState): OptionSeed[] {
  const seen = new Set<string>();
  return typeOptions(st)
    .filter((o) => o.faces && !seen.has(o.faces.display) && (seen.add(o.faces.display), true))
    .map((o) => ({ ...o, id: `${o.faces!.display}|${o.faces!.display}`, label: o.faces!.display, faces: { display: o.faces!.display, body: o.faces!.display } }))
    .slice(0, 5);
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

/** Three systems a website could be made in, proposed by the board engine for these words (or none without them). */
export function websiteSystems(st: StudioState): MasterDesignSystem[] {
  const ask = websiteAskOf(st);
  if (!ask) return [];
  // proposed from the words, then held to the colours and faces the person chose or their references gave
  return systemsWithPrefs(proposeSystems(ask.board, salt(st)).slice(0, 3), prefsOf(st));
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
