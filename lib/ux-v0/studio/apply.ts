// lib/ux-v0/studio/apply.ts — a conversation's decisions, handed to the engines in their own terms.
//
// Every decision reaches an engine through an input it already reads: the graphic brief (words, kind, format, mood),
// the logo brief's words (name, temperament, the form asked for, what to avoid), the board brief (words, materials),
// the website brief and its design system, the Creative DNA (designer's values), a direction's own fields (a style
// selection, a palette, faces, a composition constraint). Nothing is invented: words are only ever the person's, and
// what was left to SocriaUX is left to the engine's own judgement.

import type { StudioAnswer, StudioState } from './schema';
import { readFacts } from './facts';
import { BOARD_MATERIALS, COMPOSITIONS, CRITIQUE_FOCUS, GRAPHIC_FORMS, IMAGE_TREATMENTS, LETTERING, LOGO_FORMS, OBJECTIVES, PERSONALITY, SITE_FUNCTIONS, SITE_PURPOSES, AVOID_GRAPHIC } from './catalog';
import type { GraphicBrief, GraphicDirection } from '../graphics/compose';
import type { Effect } from '../graphics/effects';
import type { GraphicDoc, Node } from '../graphics/doc';
import { normalizeGraphicBrief } from '../graphics/state';
import type { BoardBrief, MaterialSpec, MockupTemplate } from '../boards/model';
import type { MasterDesignSystem } from '../boards/system';
import type { Org } from '../graphics/generative/principles';
import { emptyDNA, setDim, type CreativeDNA, type DnaKey, type DnaVector } from '../dna';
import { contrastRatio } from '../../ux/audit';
import { ensureContrast } from '../spec';
import { mix } from '../color';
import { likedRefs, paletteOutOf, referenceFaces, referencePalette, referenceWords } from './references';
import { graphicFont, knownFont } from '../fonts';
import { styleById } from '../graphics/styles/registry';
import { TYPE_CHARACTERS, type TypeCharacter } from '../graphics/creative/lexicon';
import { readableSet } from './discovery';

// ── reading answers ──

export const answerOf = (st: StudioState, id: string): StudioAnswer | null => {
  const a = st.answers[id];
  return a && !a.skipped && !a.delegated ? a : null;
};
const values = (st: StudioState, id: string): string[] => answerOf(st, id)?.values ?? [];
const text = (st: StudioState, id: string): string => answerOf(st, id)?.text?.trim() ?? '';
const field = (st: StudioState, id: string, f: string): string => answerOf(st, id)?.fields?.[f]?.trim() ?? '';
const labelsOf = (ids: readonly string[], list: readonly { id: string; label: string }[]) => ids.map((id) => list.find((x) => x.id === id)?.label ?? id);
const lines = (s: string) =>
  s
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** The words for a work: the fields the person filled, else what their opening sentence quoted. */
export function wordsOf(st: StudioState, stage: string): { headline: string; subhead: string; details: string[]; cta: string; brand: string; items: string[]; data: string } {
  const f = readFacts(st.prompt);
  return {
    headline: field(st, stage, 'headline') || f.headline || '',
    subhead: field(st, stage, 'subhead') || f.subhead || '',
    details: lines(field(st, stage, 'details')).length ? lines(field(st, stage, 'details')) : f.meta,
    cta: field(st, stage, 'cta'),
    brand: field(st, stage, 'brand') || f.brand || '',
    items: lines(field(st, stage, 'items')),
    data: field(st, stage, 'data'),
  };
}

/** The temperament chosen, in the engines' words (the person's own words after). */
export function personalityOf(st: StudioState): string[] {
  const ids = [...values(st, `${prefix(st)}.personality`), ...readFacts(st.prompt).mood];
  const own = text(st, `${prefix(st)}.personality`);
  return [...new Set([...labelsOf(ids, PERSONALITY).map((x) => x.toLowerCase()), ...(own ? own.toLowerCase().split(/[,;]+/).map((x) => x.trim()).filter(Boolean) : [])])].slice(0, 8);
}

const prefix = (st: StudioState) => ({ graphic: 'g', logo: 'l', website: 'w', board: 'b', system: 's', critique: 'c' })[st.mode];

// ── preferences for directions and systems ──

export interface StudioPalette {
  ground: string;
  ink: string;
  accent: string;
  accent2?: string;
}

export interface StudioPrefs {
  /** style profiles chosen (StyleDNA ids), first leading */
  styles: string[];
  /** the person's own words for the look */
  styleWords: string;
  palette: StudioPalette | null;
  faces: { display: string; body: string } | null;
  org: Org | null;
  dna: DnaVector;
  personality: string[];
  avoid: string[];
  /** how the person's own pictures are treated (IMAGE_TREATMENTS), when they chose */
  treatment: string | null;
  /** the mood chosen in the conversation (studio/discovery.ts): the engine's qualities (and a theme) to realise */
  vibe?: { qualities: string[]; theme?: string; name?: string } | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** A palette answer's colours: the option chosen (its swatches) or the person's own pick. */
export function paletteOf(a: StudioAnswer | null): StudioPalette | null {
  if (!a) return null;
  const own = a.fields ?? {};
  const pick = (k: string) => (HEX.test(own[k] ?? '') ? own[k].toLowerCase() : '');
  if (pick('ground') && pick('ink') && pick('accent')) return { ground: pick('ground'), ink: pick('ink'), accent: pick('accent'), ...(pick('accent2') ? { accent2: pick('accent2') } : {}) };
  const sw = (a.values[0] ?? '').split('|').filter((x) => HEX.test(x));
  if (sw.length >= 3) return { ground: sw[0], ink: sw[1], accent: sw[2], ...(sw[3] ? { accent2: sw[3] } : {}) };
  return null;
}

export function facesOf(a: StudioAnswer | null): { display: string; body: string } | null {
  if (!a) return null;
  // a pairing chosen or named in the conversation keeps its faces as fields
  const f = a.fields ?? {};
  if (f.display && f.body) return { display: f.display.slice(0, 60), body: f.body.slice(0, 60) };
  const [display, body] = (a.values[0] ?? '').split('|');
  return display && body ? { display: display.slice(0, 60), body: body.slice(0, 60) } : null;
}

export function prefsOf(st: StudioState): StudioPrefs {
  const p = prefix(st);
  const avoidIds = values(st, `${p}.avoid`);
  const dna: DnaVector = {};
  const feel = answerOf(st, `${p}.feel`);
  for (const [k, v] of Object.entries(feel?.numbers ?? {})) dna[k as DnaKey] = v;
  // the look is never picked from a list: it comes from what the person says about it in their own words, the
  // websites they pointed to (what they take from each), and pictures they brought for their look
  const refs = likedRefs(st);
  const ownWords = text(st, `${p}.look`);
  const fromRefs = referencePalette(refs);
  const fromPictures = values(st, `${p}.pictures`)[0] === 'look' ? paletteOutOf(st.attachments.filter((a) => a.kind === 'image').flatMap((a) => a.swatches ?? [])) : null;
  const ownPalette = paletteOf(answerOf(st, `${p}.palette`));
  const borrowed = fromRefs ?? fromPictures;
  const refFaces = referenceFaces(refs).filter((f) => graphicFont(f) ?? knownFont(f));
  // a mood chosen brings its colours and its type, where nothing more particular was chosen
  const vibeAns = answerOf(st, `${p}.vibe`);
  const vibe = vibeAns && !vibeAns.skipped && vibeAns.values.length ? vibeAns : null;
  const vibePalette = vibe ? paletteOf({ ...vibe, values: [] }) : null;
  const vibeSet = vibe?.fields?.character && (TYPE_CHARACTERS as readonly string[]).includes(vibe.fields.character) ? readableSet(vibe.fields.character as TypeCharacter, 0) : null;
  return {
    styles: [...new Set([...readFacts(st.prompt).styles, ...readFacts(ownWords).styles])].slice(0, 3),
    styleWords: [ownWords, referenceWords(refs)].filter(Boolean).join('; ').slice(0, 600),
    palette: ownPalette ?? (borrowed ? { ground: borrowed.ground, ink: borrowed.ink, accent: borrowed.accent, ...(borrowed.accent2 ? { accent2: borrowed.accent2 } : {}) } : null) ?? vibePalette,
    faces: facesOf(answerOf(st, `${p}.type`)) ?? (refFaces.length ? { display: refFaces[0], body: refFaces[1] ?? refFaces[0] } : null) ?? (vibeSet ? { display: vibeSet.display, body: vibeSet.body } : null),
    org: (COMPOSITIONS.find((c) => c.id === values(st, `${p}.composition`)[0])?.org ?? null) as Org | null,
    dna,
    personality: personalityOf(st).slice(0, 8),
    avoid: [...labelsOf(avoidIds, AVOID_GRAPHIC).map((x) => x.toLowerCase()), ...(text(st, `${p}.avoid`) ? [text(st, `${p}.avoid`)] : []), ...readFacts(st.prompt).avoid],
    treatment: IMAGE_TREATMENTS.some((t) => t.id === values(st, `${p}.treatment`)[0]) ? values(st, `${p}.treatment`)[0] : null,
    vibe: vibe ? { qualities: vibe.values.slice(0, 3), ...(vibe.fields?.theme ? { theme: vibe.fields.theme } : {}), ...(vibe.fields?.name ? { name: vibe.fields.name } : {}) } : null,
  };
}

/** A treatment as the engine's own effect stack, in the person's colours where it takes colours. */
export function treatmentEffects(id: string | null, palette?: StudioPalette | null): Effect[] {
  const ink = palette?.ink ?? '#1b1b1b';
  const paper = palette?.ground ?? '#f2ede2';
  const accent = palette?.accent ?? '#c2410c';
  switch (id) {
    case 'mono':
      return [{ kind: 'mono', on: true, params: { amount: 100 }, color: '#ffffff' }];
    case 'duotone':
      return [{ kind: 'duotone', on: true, params: { amount: 100 }, color: ink, color2: accent }];
    case 'halftone':
      return [{ kind: 'halftone', on: true, params: { size: 7, angle: 45 }, color: ink, color2: paper }];
    case 'riso':
      return [
        { kind: 'misregistration', on: true, params: { offset: 4, opacity: 82 }, color: accent, color2: ink },
        { kind: 'grain', on: true, params: { amount: 32, size: 2, seed: 8 } },
      ];
    case 'posterize':
      return [{ kind: 'posterize', on: true, params: { levels: 4 } }];
    case 'grain':
      return [{ kind: 'grain', on: true, params: { amount: 34, size: 3, seed: 11 } }];
    default:
      return [];
  }
}

/** A composed design with the person's own pictures treated as they chose (nothing else touched). */
export function withTreatment(doc: GraphicDoc, prefs: Pick<StudioPrefs, 'treatment' | 'palette'>): GraphicDoc {
  const fx = treatmentEffects(prefs.treatment, prefs.palette);
  if (!fx.length) return doc;
  const own = new Set(doc.assets.filter((a) => a.source === 'upload').map((a) => a.id));
  const treat = (n: Node): Node => {
    if (n.type === 'image' && own.has(n.asset)) return { ...n, effects: [...(n.effects ?? []).filter((e) => !fx.some((f) => f.kind === e.kind)), ...fx] };
    if (n.type === 'group') return { ...n, children: n.children.map(treat) };
    return n;
  };
  return { ...doc, artboards: doc.artboards.map((b) => ({ ...b, children: b.children.map(treat) })) };
}

/** The Creative DNA the person set with the sliders (only the ones they moved), or undefined. */
export function studioDNA(st: StudioState, prior?: CreativeDNA | null): CreativeDNA | undefined {
  const dims = prefsOf(st).dna;
  const keys = Object.keys(dims) as DnaKey[];
  if (!keys.length) return prior ?? undefined;
  let d = prior ?? emptyDNA();
  for (const k of keys) d = setDim(d, k, dims[k]!);
  return d;
}

/** A palette as a direction's seven colours: ground, ink and accent as chosen, the rest derived to read. */
export function tokensFromPalette(p: StudioPalette, base?: { surface?: string; muted?: string; line?: string }): GraphicDirection['tokens']['colors'] {
  const dark = contrastRatio('#ffffff', p.ground) > contrastRatio('#111111', p.ground);
  const text = contrastRatio(p.ink, p.ground) >= 4.5 ? p.ink : ensureContrast(p.ink, p.ground, 4.5);
  const accentText = contrastRatio('#ffffff', p.accent) >= contrastRatio('#111111', p.accent) ? '#ffffff' : '#111111';
  return {
    background: p.ground,
    surface: base?.surface && !dark ? mix(p.ground, '#ffffff', 0.55) : mix(p.ground, dark ? '#ffffff' : '#000000', 0.06),
    text,
    muted: ensureContrast(mix(text, p.ground, 0.38), p.ground, 4.5),
    accent: p.accent,
    accentText,
    line: mix(text, p.ground, 0.82),
  };
}

/** Directions held to the person's choices: a palette, faces, a composition (an identity from a linked design system
 * keeps its own colours and faces: `keepIdentity`). A style chosen leads the first direction when none of the three
 * is built in it yet. */
export function directionsWithPrefs(dirs: readonly GraphicDirection[], prefs: StudioPrefs, opts: { keepIdentity?: boolean } = {}): GraphicDirection[] {
  return dirs.map((d, i) => {
    let next: GraphicDirection = d;
    if (prefs.palette && !opts.keepIdentity) {
      next = { ...next, tokens: { ...next.tokens, colors: { ...next.tokens.colors, ...tokensFromPalette(prefs.palette, next.tokens.colors), ...(prefs.palette.accent2 ? { accent2: prefs.palette.accent2 } : {}) } } };
    }
    if (prefs.faces && !opts.keepIdentity) next = { ...next, tokens: { ...next.tokens, fonts: { display: prefs.faces.display, body: prefs.faces.body } } };
    if (prefs.org) {
      const gen = next.generative ?? {};
      // the first two follow the composition asked for; the third stays free, so there is still a surprise on offer
      if (i < 2) next = { ...next, generative: { ...gen, constraints: { ...(gen.constraints ?? {}), org: prefs.org } } };
    }
    return next;
  });
}

/** Two directions made one: the first's colours, the second's type, structure and composition. */
export function combineDirections(colour: GraphicDirection, rest: GraphicDirection): GraphicDirection {
  return {
    ...rest,
    name: `${colour.name} × ${rest.name}`.slice(0, 80),
    concept: `The colours of ${colour.name}, with the type and structure of ${rest.name}.`,
    tokens: { ...rest.tokens, colors: { ...colour.tokens.colors } },
  };
}

/** A board's proposed systems held to the person's palette and faces (never a linked design system's). */
export function systemsWithPrefs(systems: readonly MasterDesignSystem[], prefs: StudioPrefs): MasterDesignSystem[] {
  return systems.map((s) => {
    if (s.brand) return s;
    let next = s;
    if (prefs.palette) next = { ...next, tokens: { ...next.tokens, colors: { ...next.tokens.colors, ...tokensFromPalette(prefs.palette, next.tokens.colors) } } };
    if (prefs.faces) next = { ...next, tokens: { ...next.tokens, fonts: { display: prefs.faces.display, body: prefs.faces.body } } };
    return next;
  });
}

// ── briefs ──

/** The graphic brief a conversation arrives at; null without a headline (SocriaUX never invents the words). */
export function graphicBriefOf(st: StudioState, images: readonly string[] = []): GraphicBrief | null {
  const f = readFacts(st.prompt);
  const formId = values(st, 'g.kind')[0];
  const form = GRAPHIC_FORMS.find((x) => x.id === formId) ?? (f.kind ? GRAPHIC_FORMS.find((x) => x.kind === f.kind && (f.story ? x.id === 'story' : true)) : null) ?? GRAPHIC_FORMS[0];
  const w = wordsOf(st, 'g.words');
  if (!w.headline) return null;
  const prefs = prefsOf(st);
  const style = [prefs.styles.length ? `in the style of ${prefs.styles.join(' and ')}` : '', prefs.styleWords].filter(Boolean).join(', ');
  const purpose = [st.prompt.trim(), text(st, 'g.kind'), style, prefs.avoid.length ? `Avoid ${prefs.avoid.join(', ')}.` : ''].filter(Boolean).join(' ').slice(0, 600);
  const data = lines(w.data)
    .map((l) => l.match(/^(.{1,60}?)\s*[:=–-]\s*(-?\d+(?:[.,]\d+)?)\s*%?$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ label: m[1].trim(), value: Number(m[2].replace(',', '.')) }));
  return normalizeGraphicBrief({
    purpose,
    kind: form.kind,
    formats: [form.format],
    content: {
      headline: w.headline,
      ...(w.subhead ? { subhead: w.subhead } : {}),
      ...(w.details.length ? { meta: w.details.slice(0, 4) } : {}),
      ...(w.cta ? { cta: w.cta } : {}),
      ...(w.brand ? { brand: w.brand } : {}),
      ...(w.items.length ? { items: w.items.slice(0, 10) } : {}),
      ...(data.length ? { data } : {}),
    },
    mood: prefs.personality,
    images: [...images],
  });
}

/** The words a logo brief is read from (lib/ux-v0/graphics/logo/brief.ts readLogoBrief), and the brief carrying them. */
export function logoWordsOf(st: StudioState): { name: string; words: string } {
  const f = readFacts(st.prompt);
  const name = field(st, 'l.name', 'name') || f.brand || f.headline || '';
  const tagline = field(st, 'l.name', 'tagline');
  const about = [...values(st, 'l.about'), text(st, 'l.about')].filter(Boolean).join(', ');
  const form = LOGO_FORMS.find((x) => x.id === values(st, 'l.form')[0]);
  const letterFace = (values(st, 'l.lettering')[0] ?? '').split('|')[0];
  const letterEntry = letterFace ? graphicFont(letterFace) ?? knownFont(letterFace) : null;
  const lettering = LETTERING.find((x) => x.id === values(st, 'l.lettering')[0]) ?? (letterEntry ? { words: `${letterEntry.note} lettering, like ${letterEntry.name}` } : null);
  const idea = [...values(st, 'l.idea'), text(st, 'l.idea')].filter(Boolean);
  const avoid = [...values(st, 'l.avoid'), ...(text(st, 'l.avoid') ? [text(st, 'l.avoid')] : [])];
  const uses = values(st, 'l.uses');
  const words = [
    st.prompt.trim(),
    name ? `A logo for “${name}”.` : '',
    tagline ? `Tagline: ${tagline}.` : '',
    about ? `It is about ${about}.` : '',
    personalityOf(st).length ? `${personalityOf(st).join(', ')}.` : '',
    form ? `Make it ${form.words}.` : '',
    lettering ? `With ${lettering.words}.` : '',
    idea.length ? `It should call to mind ${idea.join(', ')}.` : '',
    avoid.length ? avoid.map((x) => `Avoid ${x}.`).join(' ') : '',
    uses.length ? `It will be used on ${uses.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 2400);
  return { name, words };
}

export function logoBriefOf(st: StudioState): GraphicBrief | null {
  const { name, words } = logoWordsOf(st);
  if (!name) return null;
  return normalizeGraphicBrief({ purpose: words.slice(0, 600), kind: 'logo', formats: ['logo-sheet'], content: { headline: name, brand: name }, mood: personalityOf(st), images: [] });
}

/** The materials the person asked for, as the board reads them. */
export function materialsOf(st: StudioState): MaterialSpec[] {
  const a = answerOf(st, 'b.materials');
  const counts = a?.numbers ?? {};
  const out: MaterialSpec[] = [];
  for (const m of BOARD_MATERIALS) {
    const n = Math.round(counts[m.id] ?? 0);
    if (n > 0) out.push({ kind: m.kind as MaterialSpec['kind'], count: Math.min(12, n), ...(m.format ? { format: m.format } : {}), ...(m.template ? { template: m.template as MockupTemplate } : {}) });
  }
  return out.length ? out : readFacts(st.prompt).materials;
}

/** The board brief a conversation arrives at; null without a line to compose around or without materials. */
export function boardBriefOf(st: StudioState, images: readonly string[] = []): BoardBrief | null {
  const w = wordsOf(st, 'b.words');
  const materials = materialsOf(st);
  if (!w.headline || !materials.length) return null;
  const prefs = prefsOf(st);
  const objective = labelsOf(values(st, 'b.objective'), OBJECTIVES)[0];
  const style = [prefs.styles.length ? `in the style of ${prefs.styles.join(' and ')}` : '', prefs.styleWords].filter(Boolean).join(', ');
  return {
    purpose: [st.prompt.trim(), objective ? `${objective}.` : '', style, prefs.avoid.length ? `Avoid ${prefs.avoid.join(', ')}.` : ''].filter(Boolean).join(' ').slice(0, 600),
    name: (w.brand || w.headline).slice(0, 80),
    content: { headline: w.headline, ...(w.subhead ? { subhead: w.subhead } : {}), ...(w.details.length ? { meta: w.details.slice(0, 4) } : {}), ...(w.cta ? { cta: w.cta } : {}), ...(w.brand ? { brand: w.brand } : {}) },
    mood: prefs.personality,
    materials,
    images: [...images],
    annotate: true,
  };
}

export interface WebsiteAsk {
  board: BoardBrief;
  purpose: string;
  audience: string;
  functions: string[];
  priorities: string[];
}

/** What the website is for, who for, what it must do, and its words; null without a name or a first line. */
export function websiteAskOf(st: StudioState): WebsiteAsk | null {
  const f = readFacts(st.prompt);
  const purposeId = values(st, 'w.purpose')[0] ?? '';
  const purpose = SITE_PURPOSES.find((x) => x.id === purposeId);
  const name = field(st, 'w.words', 'brand') || f.brand || '';
  const headline = field(st, 'w.words', 'headline') || f.headline || name;
  if (!headline) return null;
  const audience = [...values(st, 'w.audience'), text(st, 'w.audience')].filter(Boolean).join(', ');
  const functions = values(st, 'w.functions');
  const prefs = prefsOf(st);
  const board: BoardBrief = {
    purpose: [st.prompt.trim(), purpose ? `${purpose.label}.` : '', audience ? `For ${audience}.` : '', prefs.styles.length ? `In the spirit of ${prefs.styles.map((id) => styleById(id)?.name ?? id.replace(/-/g, ' ')).join(' and ')}.` : '', prefs.styleWords].filter(Boolean).join(' ').slice(0, 600),
    name: (name || headline).slice(0, 80),
    content: {
      headline,
      ...(field(st, 'w.words', 'subhead') || f.subhead ? { subhead: field(st, 'w.words', 'subhead') || f.subhead } : {}),
      ...(field(st, 'w.words', 'cta') ? { cta: field(st, 'w.words', 'cta') } : {}),
      ...(name ? { brand: name } : {}),
      ...(lines(field(st, 'w.words', 'story')).length ? { body: lines(field(st, 'w.words', 'story')).join(' ') } : {}),
    },
    mood: prefs.personality,
    materials: [],
    images: [],
    annotate: false,
  };
  return { board, purpose: purposeId, audience, functions, priorities: values(st, 'w.priorities') };
}

/** The import a conversation about a design system asks for (components/ux-v0/systems/ImportWizard.tsx). */
export function importAskOf(st: StudioState): { kind: string; url: string; projectId: string; parts: string[]; next: string } {
  return {
    kind: values(st, 's.source')[0] ?? '',
    url: field(st, 's.input', 'url'),
    projectId: values(st, 's.input')[0] ?? '',
    parts: values(st, 's.bring'),
    next: values(st, 's.next')[0] ?? '',
  };
}

/** What a critique should look at first, said as a request to SocriaUX. */
export function critiqueAskOf(st: StudioState): string {
  const focus = labelsOf(values(st, 'c.focus'), CRITIQUE_FOCUS).map((x) => x.toLowerCase());
  const who = field(st, 'c.context', 'audience');
  const goal = field(st, 'c.context', 'goal');
  return [focus.length ? `Look at ${focus.join(', ')} first.` : '', who ? `It is for ${who}.` : '', goal ? `It should ${goal.replace(/^to /i, '')}.` : ''].filter(Boolean).join(' ');
}

/** Functional sections a website needs from what it must do (website engine sections; labels are the interface's
 * own words, never the person's copy, and sample times are said to be samples). */
export function functionalSections(ask: WebsiteAsk, now = Date.now()): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const has = (id: string) => ask.functions.includes(id);
  if (has('booking')) {
    const days = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(now + (i + 1) * 864e5);
      return {
        label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
        date: d.toISOString().slice(0, 10),
        slots: ['09:00', '10:30', '12:00', '14:00', '16:30'].map((t, j) => ({ time: t, status: (i + j) % 5 === 3 ? 'few' : 'open' })),
      };
    });
    const item = ask.purpose === 'restaurant' ? 'A table' : ask.purpose === 'event' ? 'A place' : 'An appointment';
    out.push({ id: 'book', kind: 'booking', variant: 'strip', content: { title: `Book ${item.toLowerCase()}`, item, days, action: 'Confirm', confirmTitle: 'Booked', confirmText: 'A confirmation follows by email.', note: 'Sample days and times: set your own.' }, images: [] });
  }
  const form = (id: string, title: string, fields: { label: string; type: string; required?: boolean }[], submit: string) => out.push({ id, kind: 'form', variant: 'stacked', content: { title, fields: fields.map((x) => ({ label: x.label, type: x.type, required: !!x.required })), submit }, images: [] });
  if (has('rsvp')) form('rsvp', 'RSVP', [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Guests', type: 'number' }], 'Reply');
  if (has('join')) form('join', 'Join', [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }], 'Join');
  if (has('waitlist')) form('waitlist', 'Join the waiting list', [{ label: 'Email', type: 'email', required: true }], 'Join');
  if (has('newsletter')) form('newsletter', 'Newsletter', [{ label: 'Email', type: 'email', required: true }], 'Sign up');
  if (has('contact')) form('contact', 'Get in touch', [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Message', type: 'textarea', required: true }], 'Send');
  // what matters most comes first among them
  const order = (s: Record<string, unknown>) => {
    const id = String(s.id);
    const rank = ask.priorities.indexOf(id === 'book' ? 'book' : id === 'contact' ? 'contact' : '');
    return rank < 0 ? 99 : rank;
  };
  return out.sort((p, q) => order(p) - order(q));
}

export const functionLabels = (ids: readonly string[]) => labelsOf(ids, SITE_FUNCTIONS);
