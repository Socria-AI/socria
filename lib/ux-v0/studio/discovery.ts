// lib/ux-v0/studio/discovery.ts — the creative director's questions: which to ask, in what order, when to stop.
//
// Each kind of work has its own path of questions, and each question appears only when it is useful:
//   · what the opening sentence already says is never asked (it is recorded as "from your words", changeable later);
//   · a question can depend on an answer before it (a typographic logo is asked about its lettering, a symbol about
//     what it should call to mind; a board with a website is asked what the website must do);
//   · discovery is progressive: the first questions are the accessible ones (depth 1); deeper decisions (palette,
//     type, composition, feel; then what to avoid and references) are offered once there is enough to begin, never
//     imposed;
//   · "enough to begin" is said as soon as the required facts are there; "Start" is then always one click away;
//   · every question takes the person's own words, can be skipped, or left to SocriaUX ("You decide"); "Surprise me"
//     leaves every remaining choice to SocriaUX — except the person's own words, which SocriaUX never invents.
// Deterministic and free: no model decides what to ask.

import type { StudioAnswer, StudioMode, StudioState } from './schema';
import { said } from './schema';
import { readFacts, type StudioFacts } from './facts';
import * as C from './catalog';
import * as O from './options';
import { answerOf } from './apply';
import { recognizeIntent } from './intent';
import { DNA_META, type DnaKey } from '../dna';
import { CLICHES } from '../graphics/logo/brief';
import type { Org } from '../graphics/generative/principles';

export type Control = 'cards' | 'chips' | 'rank' | 'palette' | 'type' | 'sliders' | 'fields' | 'counts' | 'upload';

/** What a card shows: drawn by the engines in the browser (components/ux-v0/studio/previews.tsx). */
export type Preview =
  | { kind: 'format'; format: string }
  | { kind: 'style'; style: string }
  | { kind: 'generated' }
  | { kind: 'org'; org: Org }
  | { kind: 'logo'; category: string }
  | { kind: 'website'; index: number }
  | { kind: 'purpose'; sections: readonly string[] }
  | { kind: 'mode'; mode: StudioMode }
  | { kind: 'source'; source: string }
  | { kind: 'treatment'; treatment: string };

export interface StageOption extends O.OptionSeed {
  preview?: Preview;
}

export interface StageField {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  hint?: string;
}

export interface Stage {
  id: string;
  /** a word or two for the path ("Words", "Look") */
  topic: string;
  /** the question, in Socria's voice */
  question: string;
  /** one line on why it matters */
  why: string;
  control: Control;
  select: 'single' | 'multi' | 'rank';
  max?: number;
  options: StageOption[];
  fields?: StageField[];
  sliders?: { id: DnaKey; label: string; low: string; high: string }[];
  counts?: { id: string; label: string; max: number }[];
  /** for an upload: what it accepts */
  accept?: string;
  required: boolean;
  depth: 1 | 2 | 3;
  allowText: boolean;
  textLabel: string;
  allowDelegate: boolean;
}

/** What the browser knows that the record does not: the design systems and projects on hand. */
export interface DiscoveryEnv {
  /** a registry design system is chosen for this work */
  hasSystem?: boolean;
  systemName?: string;
  systems?: readonly { id: string; name: string }[];
  /** website projects with an approved direction (a board can take its system from one) */
  websites?: readonly { id: string; name: string }[];
  /** projects a design system can be drawn from */
  projects?: readonly { id: string; name: string; kind: string }[];
  /** the systems proposed for a website (lib/ux-v0/studio/options.ts websiteSystems), computed once by the caller */
  websiteSystems?: readonly { direction: { name: string; concept?: string }; personality: string[]; tokens: { colors: Record<string, string>; fonts: { display: string; body: string } } }[];
}

type Body = Omit<Stage, 'id' | 'depth' | 'required'>;
type Partial0 = Pick<StudioAnswer, 'values'> & Partial<Pick<StudioAnswer, 'text' | 'numbers' | 'fields'>>;

interface Def {
  id: string;
  mode: StudioMode;
  depth: 1 | 2 | 3;
  required?: boolean;
  when?: (st: StudioState, f: StudioFacts, env: DiscoveryEnv) => boolean;
  /** an answer the opening words (and attachments) already give */
  fromWords?: (st: StudioState, f: StudioFacts) => Partial0 | null;
  /** a required question counts as answered once this holds */
  done?: (a: StudioAnswer) => boolean;
  build: (st: StudioState, f: StudioFacts, env: DiscoveryEnv) => Body;
}

const opts = (xs: readonly C.CatalogItem[]): StageOption[] => xs.map((x) => ({ id: x.id, label: x.label, ...(x.hint ? { hint: x.hint } : {}) }));
const valuesOf = (st: StudioState, id: string) => answerOf(st, id)?.values ?? [];
const base = { allowText: true, textLabel: 'Describe your own', allowDelegate: true } as const;
const sliders = (keys: readonly DnaKey[]) => keys.map((k) => ({ id: k, label: DNA_META[k].label, low: DNA_META[k].low, high: DNA_META[k].high }));
const hasWords = (a: StudioAnswer, ...keys: string[]) => keys.some((k) => !!a.fields?.[k]?.trim());

const PURPOSE_WORDS: readonly [RegExp, string][] = [
  [/\b(restaurant|caf[eé]|bistro|bakery|bar|coffee (?:shop|house))\b/, 'restaurant'],
  [/\b(event|festival|conference|meetup|summit|gig|wedding|exhibition)\b/, 'event'],
  [/\b(shop|store|products?|e-?commerce|sell)\b/, 'shop'],
  [/\b(launch|waiting ?list|wait ?list|coming soon|pre-?order)\b/, 'launch'],
  [/\b(club|charity|community|society|association|non-?profit|volunteer)\b/, 'organisation'],
  [/\b(book(?:ing|ings)?|appointments?|reservations?|classes|sessions)\b/, 'bookings'],
  [/\b(portfolio|my work|showcase)\b/, 'portfolio'],
  [/\b(blog|magazine|journal|publication|newsletter|articles?)\b/, 'editorial'],
  [/\b(studio|agency|business|company|practice|firm|consultancy|services)\b/, 'business'],
];

const EXPERIENCE_PURPOSE: Readonly<Record<string, string>> = { booking: 'bookings', portfolio: 'portfolio', editorial: 'editorial', checkout: 'shop' };

/** The questions, path by path (see the head of this file). */
const DEFS: readonly Def[] = [
  // ── a graphic ──
  {
    id: 'g.kind',
    mode: 'graphic',
    depth: 1,
    required: true,
    fromWords: (_st, f) => (f.kind && f.kind !== 'logo' && f.kind !== 'campaign' && f.kind !== 'identity' ? { values: [f.story && f.kind === 'social' ? 'story' : C.GRAPHIC_FORMS.find((x) => x.kind === f.kind)?.id ?? 'poster'] } : null),
    build: () => ({ ...base, topic: 'Form', question: 'What shape does it take?', why: 'The format decides the proportions everything else is composed in.', control: 'cards', select: 'single', options: C.GRAPHIC_FORMS.map((x) => ({ id: x.id, label: x.label, hint: x.hint, preview: { kind: 'format', format: x.format } })), allowDelegate: false }),
  },
  {
    id: 'g.words',
    mode: 'graphic',
    depth: 1,
    required: true,
    fromWords: (_st, f) => (f.headline ? { values: [], fields: { headline: f.headline, ...(f.subhead ? { subhead: f.subhead } : {}), ...(f.meta.length ? { details: f.meta.join('\n') } : {}), ...(f.brand ? { brand: f.brand } : {}) } } : null),
    done: (a) => hasWords(a, 'headline'),
    build: (st) => {
      const form = valuesOf(st, 'g.kind')[0];
      const fields: StageField[] = [{ id: 'headline', label: form === 'card' ? 'The name on the card' : form === 'label' ? 'The product’s name' : 'The headline', required: true, placeholder: 'Exactly as it should read' }];
      if (form === 'carousel') fields.push({ id: 'items', label: 'One point per slide', multiline: true, placeholder: 'Write it down\nMeet less\nDecide once' });
      else if (form === 'infographic') fields.push({ id: 'data', label: 'Your numbers, one per line', multiline: true, placeholder: 'Coffee: 42\nTea: 31' });
      else fields.push({ id: 'subhead', label: 'A supporting line' });
      fields.push({ id: 'details', label: form === 'card' ? 'Role, phone, email' : 'Details: date, place, price', multiline: true }, { id: 'cta', label: 'What should people do?' }, { id: 'brand', label: 'Brand or organiser' });
      return { ...base, topic: 'Words', question: 'What should it say?', why: 'SocriaUX sets your words exactly and never invents them. Only the headline is needed.', control: 'fields', select: 'single', options: [], fields, allowText: false, allowDelegate: false };
    },
  },
  {
    id: 'g.personality',
    mode: 'graphic',
    depth: 1,
    fromWords: (_st, f) => (f.mood.filter((m) => C.PERSONALITY.some((p) => p.id === m)).length >= 2 ? { values: f.mood.filter((m) => C.PERSONALITY.some((p) => p.id === m)).slice(0, 4) } : null),
    build: (st) => ({ ...base, topic: 'Feel', question: 'How should it feel?', why: 'Pick up to four. The words steer colour, type and composition.', control: 'chips', select: 'multi', max: 4, options: O.personalityOptions(st), textLabel: 'In your own words' }),
  },
  {
    id: 'g.style',
    mode: 'graphic',
    depth: 1,
    fromWords: (_st, f) => (f.styles.length ? { values: f.styles.slice(0, 2) } : null),
    build: (st) => ({ ...base, topic: 'Look', question: 'Which of these is closest?', why: 'Your words, composed in each. Pick one, or two to blend — a starting point, never a template.', control: 'cards', select: 'multi', max: 2, options: O.styleOptions(st).map((o) => ({ ...o, preview: o.id === 'generated' ? { kind: 'generated' } : { kind: 'style', style: o.id } })), textLabel: 'Describe the look you have in mind' }),
  },
  {
    id: 'g.palette',
    mode: 'graphic',
    depth: 2,
    when: (_st, _f, env) => !env.hasSystem,
    build: (st) => ({ ...base, topic: 'Colour', question: 'Which colours feel right?', why: 'Ground, ink and accent. Or pick your own, or take them from a picture.', control: 'palette', select: 'single', options: O.paletteOptions(st), textLabel: 'Describe the colours' }),
  },
  {
    id: 'g.type',
    mode: 'graphic',
    depth: 2,
    when: (_st, _f, env) => !env.hasSystem,
    build: (st) => ({ ...base, topic: 'Type', question: 'Which voice should the type have?', why: 'Each pairing set in its own faces: a display face for the headline, a text face for the rest.', control: 'type', select: 'single', options: O.typeOptions(st), textLabel: 'Name a typeface or describe one' }),
  },
  {
    id: 'g.composition',
    mode: 'graphic',
    depth: 2,
    build: () => ({ ...base, topic: 'Composition', question: 'How should the page be organised?', why: 'The spatial idea behind the layout. Two of the three directions will follow it; one stays free.', control: 'cards', select: 'single', options: C.COMPOSITIONS.map((c) => ({ id: c.id, label: c.label, hint: c.hint, preview: { kind: 'org', org: c.org } })) }),
  },
  {
    id: 'g.feel',
    mode: 'graphic',
    depth: 3,
    build: () => ({ ...base, topic: 'Balance', question: 'Where should it sit between these?', why: 'Move only what matters to you; the rest stays SocriaUX’s to judge.', control: 'sliders', select: 'single', options: [], sliders: sliders(C.FEEL.graphic), allowText: false }),
  },
  {
    id: 'g.avoid',
    mode: 'graphic',
    depth: 3,
    fromWords: (_st, f) => (f.avoid.length ? { values: [], text: f.avoid.join(', ') } : null),
    build: () => ({ ...base, topic: 'Avoid', question: 'Anything it should never do?', why: 'Held as a rule in every direction.', control: 'chips', select: 'multi', options: opts(C.AVOID_GRAPHIC), textLabel: 'Something else to avoid', allowDelegate: false }),
  },
  {
    id: 'g.references',
    mode: 'graphic',
    depth: 3,
    build: () => ({ ...base, topic: 'References', question: 'Any pictures to use, or to learn from?', why: 'A picture you add can be placed in the design, or only read for its colour and mood.', control: 'upload', select: 'multi', options: [], accept: 'image/png,image/jpeg,image/webp,image/gif', allowText: false, allowDelegate: false }),
  },
  {
    id: 'g.treatment',
    mode: 'graphic',
    depth: 3,
    // asked only when there are pictures of the person's own to treat
    when: (st) => st.attachments.some((a) => a.kind === 'image' && !!a.upload),
    build: () => ({ ...base, topic: 'Treatment', question: 'How should your pictures be treated?', why: 'Your own picture, under each treatment the graphics engine can give it. Change it later in the editor.', control: 'cards', select: 'single', options: C.IMAGE_TREATMENTS.map((t) => ({ id: t.id, label: t.label, hint: t.hint, preview: { kind: 'treatment', treatment: t.id } })), textLabel: 'Describe the treatment' }),
  },

  // ── a logo ──
  {
    id: 'l.name',
    mode: 'logo',
    depth: 1,
    required: true,
    fromWords: (_st, f) => {
      const name = f.brand ?? f.headline;
      return name ? { values: [], fields: { name } } : null;
    },
    done: (a) => hasWords(a, 'name'),
    build: () => ({ ...base, topic: 'Name', question: 'What is the name?', why: 'Set exactly as you write it, capitals and all.', control: 'fields', select: 'single', options: [], fields: [{ id: 'name', label: 'The name', required: true, placeholder: 'Halden' }, { id: 'tagline', label: 'A tagline, if it has one' }], allowText: false, allowDelegate: false }),
  },
  {
    id: 'l.about',
    mode: 'logo',
    depth: 1,
    fromWords: (_st, f) => (f.domains.length ? { values: f.domains.slice(0, 2).map((d) => (d === 'food' ? 'food' : d)) } : null),
    build: (st) => ({ ...base, topic: 'Subject', question: 'What is it about?', why: 'The subject gives the mark its ideas — and the clichés to stay away from.', control: 'chips', select: 'multi', max: 2, options: O.domainOptions(st), textLabel: 'What does it do, in a few words?' }),
  },
  {
    id: 'l.personality',
    mode: 'logo',
    depth: 1,
    fromWords: (_st, f) => (f.mood.length >= 2 ? { values: f.mood.slice(0, 4) } : null),
    build: (st) => ({ ...base, topic: 'Personality', question: 'What should it communicate?', why: 'Pick up to four. They decide lettering, weight, softness and colour.', control: 'chips', select: 'multi', max: 4, options: O.personalityOptions(st), textLabel: 'In your own words' }),
  },
  {
    id: 'l.form',
    mode: 'logo',
    depth: 1,
    fromWords: (_st, f) => {
      const c = f.logoCategory;
      if (!c) return null;
      const id = c === 'lettermark' ? 'monogram' : C.LOGO_FORMS.find((x) => x.category === c)?.id ?? (['geometric', 'organic', 'minimal', 'negative'].includes(c) ? 'abstract' : null);
      return id ? { values: [id] } : null;
    },
    build: () => ({ ...base, topic: 'Form', question: 'Typographic, symbolic, or both?', why: 'Each drawn for your name by the logo engine. Pick the one that feels closest.', control: 'cards', select: 'single', options: C.LOGO_FORMS.map((x) => ({ id: x.id, label: x.label, hint: x.hint, preview: { kind: 'logo', category: x.category } })) }),
  },
  {
    id: 'l.lettering',
    mode: 'logo',
    depth: 2,
    when: (st) => ['wordmark', 'monogram', 'combination'].includes(valuesOf(st, 'l.form')[0] ?? ''),
    build: () => ({ ...base, topic: 'Lettering', question: 'How should the name be lettered?', why: 'Your name, set in each voice. The engine draws its own lettering from the one you choose.', control: 'type', select: 'single', options: O.letteringOptions() }),
  },
  {
    id: 'l.idea',
    mode: 'logo',
    depth: 2,
    when: (st) => ['combination', 'abstract', 'emblem'].includes(valuesOf(st, 'l.form')[0] ?? ''),
    build: (st) => ({ ...base, topic: 'Idea', question: 'What should the mark call to mind?', why: 'Up to three ideas the symbol can be built on.', control: 'chips', select: 'multi', max: 3, options: O.ideaOptions(st), textLabel: 'Something else it should suggest' }),
  },
  {
    id: 'l.palette',
    mode: 'logo',
    depth: 2,
    when: (_st, _f, env) => !env.hasSystem,
    build: (st) => ({ ...base, topic: 'Colour', question: 'Which colours should it carry?', why: 'A logo is designed to work in one colour first; these are what it wears.', control: 'palette', select: 'single', options: O.paletteOptions(st), textLabel: 'Describe the colours' }),
  },
  {
    id: 'l.avoid',
    mode: 'logo',
    depth: 3,
    fromWords: (_st, f) => (f.avoid.length ? { values: [], text: f.avoid.join(', ') } : null),
    build: () => ({ ...base, topic: 'Avoid', question: 'What should it never look like?', why: 'The usual clichés are avoided anyway; add anything else.', control: 'chips', select: 'multi', options: [...CLICHES.slice(0, 9).map((c) => ({ id: c.label, label: c.label.charAt(0).toUpperCase() + c.label.slice(1) })), { id: 'gradients', label: 'Gradients' }, { id: 'thin lines', label: 'Thin lines' }, { id: 'script lettering', label: 'Script lettering' }], textLabel: 'Something else to avoid', allowDelegate: false }),
  },
  {
    id: 'l.uses',
    mode: 'logo',
    depth: 3,
    build: () => ({ ...base, topic: 'Uses', question: 'Where will it live?', why: 'So it is tested at the sizes it will really meet.', control: 'chips', select: 'multi', options: opts(C.LOGO_USES), allowText: false }),
  },

  // ── a website ──
  {
    id: 'w.purpose',
    mode: 'website',
    depth: 1,
    required: true,
    fromWords: (st, f) => {
      const low = st.prompt.toLowerCase();
      const byWords = PURPOSE_WORDS.find(([re]) => re.test(low))?.[1];
      const id = (f.experience && EXPERIENCE_PURPOSE[f.experience]) || byWords;
      return id ? { values: [id] } : null;
    },
    build: () => ({ ...base, topic: 'Purpose', question: 'What is the website for?', why: 'It decides what the page must do before how it looks.', control: 'cards', select: 'single', options: C.SITE_PURPOSES.map((x) => ({ id: x.id, label: x.label, hint: x.hint, preview: { kind: 'purpose', sections: x.sections } })), allowDelegate: false }),
  },
  {
    id: 'w.words',
    mode: 'website',
    depth: 1,
    required: true,
    fromWords: (_st, f) => (f.brand || f.headline ? { values: [], fields: { ...(f.brand ? { brand: f.brand } : {}), ...(f.headline ? { headline: f.headline } : {}), ...(f.subhead ? { subhead: f.subhead } : {}) } } : null),
    done: (a) => hasWords(a, 'brand', 'headline'),
    build: () => ({ ...base, topic: 'Words', question: 'What is it called, and what should the first screen say?', why: 'Your words are set as written. A name or a first line is enough to begin.', control: 'fields', select: 'single', options: [], fields: [{ id: 'brand', label: 'The name', placeholder: 'Halden Coffee' }, { id: 'headline', label: 'The first line', placeholder: 'Slow coffee, early mornings' }, { id: 'subhead', label: 'A supporting line' }, { id: 'cta', label: 'The main action', placeholder: 'Book a table' }, { id: 'story', label: 'A few lines about you', multiline: true }], allowText: false, allowDelegate: false }),
  },
  {
    id: 'w.audience',
    mode: 'website',
    depth: 1,
    build: (st) => {
      const list = C.AUDIENCES[valuesOf(st, 'w.purpose')[0] ?? 'business'] ?? C.AUDIENCES.business;
      return { ...base, topic: 'People', question: 'Who is it for?', why: 'Up to three. It shapes the tone, the order and how much each screen holds.', control: 'chips', select: 'multi', max: 3, options: list.map((x) => ({ id: x, label: x })), textLabel: 'Describe them' };
    },
  },
  {
    id: 'w.functions',
    mode: 'website',
    depth: 1,
    build: (st) => {
      const purpose = valuesOf(st, 'w.purpose')[0] ?? 'business';
      const list = C.SITE_FUNCTIONS.filter((x) => x.for.includes(purpose));
      return { ...base, topic: 'Function', question: 'What must it do?', why: 'Each becomes a working part of the page — a booking that books, a form that sends.', control: 'chips', select: 'multi', options: list.map((x, i) => ({ id: x.id, label: x.label, hint: x.hint, recommended: i < 2 })), textLabel: 'Something else it must do' };
    },
  },
  {
    id: 'w.aesthetic',
    mode: 'website',
    depth: 1,
    when: (_st, _f, env) => (env.websiteSystems?.length ?? 0) > 0,
    build: (_st, _f, env) => ({ ...base, topic: 'Look', question: 'Which of these feels like you?', why: env.hasSystem ? `Three expressions of ${env.systemName ?? 'your design system'}, each a working page.` : 'Three directions, each drawn as a working page with your words.', control: 'cards', select: 'single', options: O.websiteOptions((env.websiteSystems ?? []) as never).map((o, i) => ({ ...o, preview: { kind: 'website', index: i } })), textLabel: 'Describe the look you want' }),
  },
  {
    id: 'w.priorities',
    mode: 'website',
    depth: 2,
    build: () => ({ ...base, topic: 'Priorities', question: 'What matters most on the page?', why: 'Put them in order; the page is arranged to match.', control: 'rank', select: 'rank', options: opts(C.SITE_PRIORITIES), allowText: false }),
  },
  {
    id: 'w.feel',
    mode: 'website',
    depth: 2,
    build: () => ({ ...base, topic: 'Experience', question: 'How should it feel to use?', why: 'Move only what matters; the rest stays SocriaUX’s to judge.', control: 'sliders', select: 'single', options: [], sliders: sliders(C.FEEL.website), allowText: false }),
  },
  {
    id: 'w.palette',
    mode: 'website',
    depth: 3,
    when: (_st, _f, env) => !env.hasSystem,
    build: (st) => ({ ...base, topic: 'Colour', question: 'Would you change the colours?', why: 'The look you chose has its own; choose others, or keep them.', control: 'palette', select: 'single', options: O.paletteOptions(st), textLabel: 'Describe the colours' }),
  },
  {
    id: 'w.references',
    mode: 'website',
    depth: 3,
    build: () => ({ ...base, topic: 'Pictures', question: 'Any pictures for the site?', why: 'Kept with the site, ready to place in any section. Nothing is sent anywhere.', control: 'upload', select: 'multi', options: [], accept: 'image/png,image/jpeg,image/webp,image/gif', allowText: false, allowDelegate: false }),
  },

  // ── a board ──
  {
    id: 'b.objective',
    mode: 'board',
    depth: 1,
    fromWords: (st) => {
      const low = st.prompt.toLowerCase();
      const id = /\blaunch\b/.test(low) ? 'launch' : /\b(festival|event|night|conference|fair|exhibition|concert|gig)\b/.test(low) ? 'event' : /\b(sale|offer|discount|% off)\b/.test(low) ? 'offer' : /\b(rollout|rebrand|new identity)\b/.test(low) ? 'identity' : /\b(summer|winter|spring|autumn|season)\b/.test(low) ? 'season' : null;
      return id ? { values: [id] } : null;
    },
    build: () => ({ ...base, topic: 'Objective', question: 'What is the campaign for?', why: 'It decides which material leads and what each one is asked to do.', control: 'cards', select: 'single', options: opts(C.OBJECTIVES) }),
  },
  {
    id: 'b.words',
    mode: 'board',
    depth: 1,
    required: true,
    fromWords: (_st, f) => (f.headline ? { values: [], fields: { headline: f.headline, ...(f.subhead ? { subhead: f.subhead } : {}), ...(f.meta.length ? { details: f.meta.join('\n') } : {}), ...(f.brand ? { brand: f.brand } : {}) } } : null),
    done: (a) => hasWords(a, 'headline'),
    build: () => ({ ...base, topic: 'Words', question: 'What is the campaign’s line?', why: 'Every material is composed around your words, exactly.', control: 'fields', select: 'single', options: [], fields: [{ id: 'headline', label: 'The line', required: true, placeholder: 'Night Market Lisbon' }, { id: 'subhead', label: 'A supporting line' }, { id: 'details', label: 'Details: dates, place', multiline: true }, { id: 'cta', label: 'What should people do?' }, { id: 'brand', label: 'Brand or organiser' }], allowText: false, allowDelegate: false }),
  },
  {
    id: 'b.materials',
    mode: 'board',
    depth: 1,
    required: true,
    fromWords: (_st, f) => {
      if (!f.materials.length) return null;
      const numbers: Record<string, number> = {};
      for (const m of f.materials) {
        const id = m.kind === 'social' && m.format === 'story' ? 'story' : C.BOARD_MATERIALS.find((x) => x.kind === m.kind)?.id;
        if (id) numbers[id] = Math.min(12, (numbers[id] ?? 0) + m.count);
      }
      return Object.keys(numbers).length ? { values: Object.keys(numbers), numbers } : null;
    },
    done: (a) => Object.values(a.numbers ?? {}).some((n) => n > 0),
    build: () => ({ ...base, topic: 'Materials', question: 'What should the board hold?', why: 'Each material is its own composition in one shared identity.', control: 'counts', select: 'multi', options: [], counts: C.BOARD_MATERIALS.map((m) => ({ id: m.id, label: m.label, max: m.id === 'website' ? 1 : 12 })), allowText: false, allowDelegate: false }),
  },
  {
    id: 'b.identity',
    mode: 'board',
    depth: 1,
    when: (_st, _f, env) => !env.hasSystem && ((env.systems?.length ?? 0) > 0 || (env.websites?.length ?? 0) > 0),
    build: (_st, _f, env) => ({
      ...base,
      topic: 'Identity',
      question: 'Whose identity should it share?',
      why: 'One system across every material: proposed fresh, or yours.',
      control: 'cards',
      select: 'single',
      options: [{ id: 'propose', label: 'Let SocriaUX propose', hint: 'Three systems, drawn from your words' }, ...(env.systems ?? []).map((s) => ({ id: `system:${s.id}`, label: s.name, hint: 'Your design system' })), ...(env.websites ?? []).map((w) => ({ id: `website:${w.id}`, label: w.name, hint: 'The direction of your website' }))],
      allowText: false,
    }),
  },
  {
    id: 'b.direction',
    mode: 'board',
    depth: 1,
    fromWords: (_st, f) => (f.styles.length ? { values: f.styles.slice(0, 2) } : null),
    build: (st, _f, env) => ({ ...base, topic: 'Look', question: env.hasSystem ? 'How should your system speak here?' : 'Which of these is closest?', why: 'Your line, composed in each. Pick one, or two to blend.', control: 'cards', select: 'multi', max: 2, options: O.styleOptions(st).map((o) => ({ ...o, preview: o.id === 'generated' ? { kind: 'generated' } : { kind: 'style', style: o.id } })), textLabel: 'Describe the look you have in mind' }),
  },
  {
    id: 'b.personality',
    mode: 'board',
    depth: 2,
    fromWords: (_st, f) => (f.mood.length >= 2 ? { values: f.mood.slice(0, 4) } : null),
    build: (st) => ({ ...base, topic: 'Feel', question: 'How should the campaign feel?', why: 'Pick up to four.', control: 'chips', select: 'multi', max: 4, options: O.personalityOptions(st), textLabel: 'In your own words' }),
  },
  {
    id: 'b.website',
    mode: 'board',
    depth: 2,
    when: (st) => (answerOf(st, 'b.materials')?.numbers?.website ?? 0) > 0 || readFacts(st.prompt).materials.some((m) => m.kind === 'website'),
    build: () => ({ ...base, topic: 'Website', question: 'What must the website do?', why: 'It is made as a working site in the board’s system.', control: 'chips', select: 'multi', options: C.SITE_FUNCTIONS.filter((x) => x.for.includes('event') || x.for.includes('business')).map((x) => ({ id: x.id, label: x.label, hint: x.hint })), textLabel: 'Something else it must do' }),
  },
  {
    id: 'b.palette',
    mode: 'board',
    depth: 3,
    when: (st, _f, env) => !env.hasSystem && !(valuesOf(st, 'b.identity')[0] ?? '').includes(':'),
    build: (st) => ({ ...base, topic: 'Colour', question: 'Which colours should it carry?', why: 'Held across every material.', control: 'palette', select: 'single', options: O.paletteOptions(st), textLabel: 'Describe the colours' }),
  },
  {
    id: 'b.avoid',
    mode: 'board',
    depth: 3,
    fromWords: (_st, f) => (f.avoid.length ? { values: [], text: f.avoid.join(', ') } : null),
    build: () => ({ ...base, topic: 'Avoid', question: 'Anything none of it should do?', why: 'Held as a rule on every material.', control: 'chips', select: 'multi', options: opts(C.AVOID_GRAPHIC), textLabel: 'Something else to avoid', allowDelegate: false }),
  },

  // ── a design system ──
  {
    id: 's.source',
    mode: 'system',
    depth: 1,
    required: true,
    fromWords: (st, f) => {
      const k = st.attachments.map((x) => x.kind);
      const id = k.includes('tokens') ? 'json' : k.includes('css') ? 'css' : k.includes('pdf') ? 'pdf' : k.includes('font') || k.includes('image') ? 'assets' : f.urls.some((u) => /figma\.com\//i.test(u)) ? 'figma' : f.urls.length ? 'website' : null;
      return id ? { values: [id] } : null;
    },
    build: () => ({ ...base, topic: 'Source', question: 'Where is your design system now?', why: 'SocriaUX reads it as it is — references, modes and rules kept — and asks before it guesses.', control: 'cards', select: 'single', options: C.SYSTEM_SOURCES.map((x) => ({ id: x.id, label: x.label, hint: x.hint, preview: { kind: 'source', source: x.id } })), allowText: false, allowDelegate: false }),
  },
  {
    id: 's.input',
    mode: 'system',
    depth: 1,
    required: true,
    fromWords: (st, f) => {
      const src = valuesOf(st, 's.source')[0];
      if (src === 'website' || src === 'figma') return f.urls[0] ? { values: [], fields: { url: f.urls[0] } } : null;
      const want = src === 'json' ? ['tokens'] : src === 'css' ? ['css'] : src === 'pdf' ? ['pdf'] : src === 'assets' ? ['image', 'font'] : [];
      const ids = st.attachments.filter((a) => want.includes(a.kind)).map((a) => a.id);
      return ids.length ? { values: ids } : null;
    },
    done: (a) => a.values.length > 0 || hasWords(a, 'url'),
    build: (st, _f, env) => {
      const src = valuesOf(st, 's.source')[0] ?? 'json';
      if (src === 'website' || src === 'figma')
        return { ...base, topic: 'Where', question: src === 'figma' ? 'Which Figma file?' : 'Which website?', why: src === 'figma' ? 'Paste the file’s link; the import asks for a token only when it needs one.' : 'Only that page and its stylesheets are read; nothing is crawled.', control: 'fields', select: 'single', options: [], fields: [{ id: 'url', label: src === 'figma' ? 'The Figma link' : 'The address', required: true, placeholder: src === 'figma' ? 'https://www.figma.com/design/…' : 'https://' }], allowText: false, allowDelegate: false };
      if (src === 'project') return { ...base, topic: 'Which', question: 'Which of your projects?', why: 'Its colours, type and approved logo become a system.', control: 'cards', select: 'single', options: (env.projects ?? []).map((p) => ({ id: p.id, label: p.name, hint: p.kind })), allowText: false, allowDelegate: false };
      const accept = src === 'json' ? '.json,application/json' : src === 'css' ? '.css,.scss,text/css' : src === 'pdf' ? '.pdf,application/pdf' : '.svg,.png,.jpg,.jpeg,.webp,.ttf,.otf,.woff,.woff2';
      return { ...base, topic: 'Files', question: 'Add the files.', why: 'Kept in this browser; scripts in them are never run.', control: 'upload', select: 'multi', options: [], accept, allowText: false, allowDelegate: false };
    },
  },
  {
    id: 's.bring',
    mode: 'system',
    depth: 2,
    build: () => ({ ...base, topic: 'Parts', question: 'What should come across?', why: 'Everything, unless you say otherwise.', control: 'chips', select: 'multi', options: opts(C.SYSTEM_PARTS), allowText: false }),
  },
  {
    id: 's.next',
    mode: 'system',
    depth: 2,
    build: () => ({ ...base, topic: 'Next', question: 'What will you make with it first?', why: 'The system is offered there once it is in.', control: 'cards', select: 'single', options: [{ id: 'graphic', label: 'A graphic' }, { id: 'website', label: 'A website' }, { id: 'board', label: 'A board' }, { id: 'none', label: 'Nothing yet' }], allowText: false }),
  },

  // ── a critique ──
  {
    id: 'c.file',
    mode: 'critique',
    depth: 1,
    required: true,
    fromWords: (st) => {
      const at = st.attachments.find((a) => a.kind === 'page' || a.kind === 'image');
      return at ? { values: [at.id] } : null;
    },
    done: (a) => a.values.length > 0,
    build: () => ({ ...base, topic: 'Design', question: 'Which design should we look at?', why: 'HTML, PNG, JPG or SVG. It stays in this browser.', control: 'upload', select: 'single', options: [], accept: '.html,.htm,.png,.jpg,.jpeg,.svg,text/html,image/png,image/jpeg,image/svg+xml', allowText: false, allowDelegate: false }),
  },
  {
    id: 'c.focus',
    mode: 'critique',
    depth: 1,
    build: () => ({ ...base, topic: 'Focus', question: 'What should we look at first?', why: 'Up to three. Everything else is still open to question.', control: 'chips', select: 'multi', max: 3, options: opts(C.CRITIQUE_FOCUS), textLabel: 'Something specific' }),
  },
  {
    id: 'c.context',
    mode: 'critique',
    depth: 2,
    build: () => ({ ...base, topic: 'Context', question: 'Who is it for, and what should it do?', why: 'A design can only be judged against what it is for.', control: 'fields', select: 'single', options: [], fields: [{ id: 'audience', label: 'Who it is for' }, { id: 'goal', label: 'What it should do' }], allowText: false }),
  },
];

const defsFor = (mode: StudioMode) => DEFS.filter((d) => d.mode === mode);

const resolved = (a: StudioAnswer | undefined) => !!a && (a.skipped || a.delegated || a.values.length > 0 || !!a.text || !!Object.keys(a.numbers ?? {}).length || !!Object.keys(a.fields ?? {}).length);

function satisfied(d: Def, a: StudioAnswer | undefined): boolean {
  if (!a || a.skipped || a.delegated) return !d.required && resolved(a);
  return d.done ? d.done(a) : resolved(a);
}

export interface Readiness {
  /** every required question is answered */
  canStart: boolean;
  /** the required topics still open */
  missing: string[];
  /** questions settled on the current path, and how many there are */
  done: number;
  total: number;
  /** the accessible questions are done: SocriaUX has enough to begin */
  enough: boolean;
  /** deeper questions are on offer (palette, type, composition…) */
  more: number;
}

/** The questions on this work's path right now, in order (only those whose conditions hold). */
export function pathOf(st: StudioState, env: DiscoveryEnv = {}): Stage[] {
  const f = readFacts(st.prompt);
  return defsFor(st.mode)
    .filter((d) => !d.when || d.when(st, f, env))
    .map((d) => ({ ...d.build(st, f, env), id: d.id, depth: d.depth, required: !!d.required }));
}

/** The question to ask now, or null when nothing more is asked at the depth reached. */
export function currentStage(st: StudioState, env: DiscoveryEnv = {}): Stage | null {
  const depth = st.depth ?? 1;
  const f = readFacts(st.prompt);
  const defs = defsFor(st.mode).filter((d) => !d.when || d.when(st, f, env));
  // a required question first, wherever it is; then the path, as deep as the person has asked to go
  const next = defs.find((d) => d.required && !satisfied(d, st.answers[d.id])) ?? defs.find((d) => d.depth <= depth && !resolved(st.answers[d.id]));
  return next ? { ...next.build(st, f, env), id: next.id, depth: next.depth, required: !!next.required } : null;
}

export function readiness(st: StudioState, env: DiscoveryEnv = {}): Readiness {
  const f = readFacts(st.prompt);
  const defs = defsFor(st.mode).filter((d) => !d.when || d.when(st, f, env));
  const missing = defs.filter((d) => d.required && !satisfied(d, st.answers[d.id])).map((d) => d.build(st, f, env).topic);
  const depth = st.depth ?? 1;
  const inReach = defs.filter((d) => d.depth <= depth);
  const done = inReach.filter((d) => resolved(st.answers[d.id])).length;
  return {
    canStart: missing.length === 0,
    missing,
    done,
    total: inReach.length,
    enough: missing.length === 0 && defs.filter((d) => d.depth === 1).every((d) => resolved(st.answers[d.id])),
    more: defs.filter((d) => d.depth > depth && !resolved(st.answers[d.id])).length,
  };
}

/** What the opening words already settle, recorded as answers "from your words" (never asked again). */
export function seedFromWords(st: StudioState, now = Date.now()): StudioState {
  const f = readFacts(st.prompt);
  const answers = { ...st.answers };
  const settled: string[] = [];
  // in path order, so an answer can depend on one before it (a design system's files on its source)
  for (const d of defsFor(st.mode)) {
    if (answers[d.id] || !d.fromWords) continue;
    const a = d.fromWords({ ...st, answers }, f);
    if (!a) continue;
    answers[d.id] = { ...a, source: 'words', at: now };
    settled.push(d.id);
  }
  let next: StudioState = { ...st, answers };
  if (settled.length) {
    const lines = settled.map((id) => summaryOf(next, id)).filter(Boolean);
    next = said(next, { from: 'socria', kind: 'note', text: `From your words: ${lines.join(' · ')}.`, at: now });
  }
  return next;
}

/** A human summary of an answer, as the transcript and the design context say it. */
export function summaryOf(st: StudioState, id: string, env: DiscoveryEnv = {}): string {
  const a = st.answers[id];
  if (!a) return '';
  if (a.delegated) return 'SocriaUX decides';
  if (a.skipped) return 'Skipped';
  const f = readFacts(st.prompt);
  const d = DEFS.find((x) => x.id === id);
  if (!d) return a.values.join(', ');
  const body = d.build(st, f, env);
  const label = (v: string) => body.options.find((o) => o.id === v)?.label ?? v;
  const parts: string[] = [];
  if (body.control === 'fields') for (const fd of body.fields ?? []) if (a.fields?.[fd.id]) parts.push(fd.id === 'headline' || fd.id === 'name' || fd.id === 'brand' ? `“${a.fields[fd.id]}”` : a.fields[fd.id].split('\n').join(', '));
  if (body.control === 'counts')
    for (const c of body.counts ?? []) {
      const n = a.numbers?.[c.id] ?? 0;
      if (n > 0) parts.push(c.id === 'website' ? c.label : `${n} ${c.label.toLowerCase()}`);
    }
  if (body.control === 'sliders') for (const s of body.sliders ?? []) if (a.numbers?.[s.id] !== undefined) parts.push(`${s.label}: ${dnaWordOf(s.id, a.numbers[s.id])}`);
  if (body.control === 'rank') parts.push(a.values.map((v, i) => `${i + 1}. ${label(v)}`).join(' '));
  else if (body.control === 'upload') parts.push(`${a.values.length} file${a.values.length === 1 ? '' : 's'}`);
  else if (body.control === 'palette') parts.push(a.fields?.accent ? `${a.fields.ground} · ${a.fields.ink} · ${a.fields.accent}` : body.options.find((o) => o.id === a.values[0])?.label ?? (a.values[0] ? a.values[0].split('|').slice(0, 3).join(' · ') : ''));
  else if (!['fields', 'counts', 'sliders'].includes(body.control)) parts.push(...a.values.map(label));
  if (a.text) parts.push(`“${a.text}”`);
  return parts.filter(Boolean).join(', ');
}

const dnaWordOf = (k: DnaKey, v: number) => DNA_META[k].words[Math.max(0, Math.min(4, Math.floor(v / 20)))];

/** The person's answer to a question. */
export function answerStage(st: StudioState, id: string, ans: Partial0, env: DiscoveryEnv = {}, now = Date.now()): StudioState {
  const stage = pathOf(st, env).find((s) => s.id === id);
  const a: StudioAnswer = { values: ans.values.slice(0, 24), ...(ans.text?.trim() ? { text: ans.text.trim().slice(0, 1200) } : {}), ...(ans.numbers && Object.keys(ans.numbers).length ? { numbers: ans.numbers } : {}), ...(ans.fields && Object.keys(ans.fields).length ? { fields: ans.fields } : {}), source: 'person', at: now };
  let next: StudioState = { ...st, answers: { ...st.answers, [id]: a } };
  if (stage) next = said(next, { from: 'socria', kind: 'question', stage: id, text: stage.question, at: now });
  next = said(next, { from: 'person', kind: 'answer', stage: id, text: summaryOf(next, id, env) || 'Answered', at: now });
  return next;
}

export function skipStage(st: StudioState, id: string, env: DiscoveryEnv = {}, now = Date.now()): StudioState {
  const stage = pathOf(st, env).find((s) => s.id === id);
  const next: StudioState = { ...st, answers: { ...st.answers, [id]: { values: [], skipped: true, source: 'person', at: now } } };
  return said(next, { from: 'person', kind: 'answer', stage: id, text: `Skipped${stage ? `: ${stage.topic.toLowerCase()}` : ''}`, at: now });
}

export function delegateStage(st: StudioState, id: string, env: DiscoveryEnv = {}, now = Date.now()): StudioState {
  const stage = pathOf(st, env).find((s) => s.id === id);
  const next: StudioState = { ...st, answers: { ...st.answers, [id]: { values: [], delegated: true, source: 'socria', at: now } } };
  return said(next, { from: 'person', kind: 'answer', stage: id, text: `You decide${stage ? ` the ${stage.topic.toLowerCase()}` : ''}`, at: now });
}

/** "Surprise me": every remaining choice left to SocriaUX (the person's own words are still asked for, if missing). */
export function surprise(st: StudioState, env: DiscoveryEnv = {}, now = Date.now()): StudioState {
  const f = readFacts(st.prompt);
  const answers = { ...st.answers };
  for (const d of defsFor(st.mode)) {
    if (d.when && !d.when({ ...st, answers }, f, env)) continue;
    if (resolved(answers[d.id]) || d.required) continue;
    const body = d.build({ ...st, answers }, f, env);
    // what cannot be left to SocriaUX (what to avoid, the person's own pictures) is simply not asked
    answers[d.id] = body.allowDelegate ? { values: [], delegated: true, source: 'socria', at: now } : { values: [], skipped: true, source: 'socria', at: now };
  }
  return said({ ...st, answers, depth: 3 }, { from: 'person', kind: 'answer', text: 'Surprise me', at: now });
}

/** One step back: the last answer the person (or SocriaUX for them) gave is taken back, to be given again. */
export function stepBack(st: StudioState): StudioState {
  const last = Object.entries(st.answers)
    .filter(([, a]) => a.source !== 'words')
    .sort((p, q) => q[1].at - p[1].at)[0];
  if (!last) return st;
  const answers = { ...st.answers };
  delete answers[last[0]];
  return { ...st, answers };
}

/** Open a decision again (from the design context or the transcript): its answer is taken back to be given anew. */
export function reopen(st: StudioState, id: string): StudioState {
  if (!st.answers[id]) return st;
  const answers = { ...st.answers };
  delete answers[id];
  const def = DEFS.find((d) => d.id === id);
  return { ...st, answers, ...(def && def.depth > (st.depth ?? 1) ? { depth: def.depth } : {}) };
}

/** Go a level deeper: palette, type, composition (then balance, avoid, references). */
export function deeper(st: StudioState): StudioState {
  return { ...st, depth: (Math.min(3, (st.depth ?? 1) + 1) as 1 | 2 | 3) };
}

/** Every decision so far, for the design context: what it is, what was decided, and where it came from. */
export function decisionsOf(st: StudioState, env: DiscoveryEnv = {}): { id: string; topic: string; summary: string; source: StudioAnswer['source'] | 'open'; depth: number }[] {
  return pathOf(st, env).map((s) => {
    const a = st.answers[s.id];
    return { id: s.id, topic: s.topic, summary: a ? summaryOf(st, s.id, env) : '', source: a ? a.source : 'open', depth: s.depth };
  });
}

/** A question's definition for a decision id (any mode): to reopen it in another place. */
export function stageById(st: StudioState, id: string, env: DiscoveryEnv = {}): Stage | null {
  const d = DEFS.find((x) => x.id === id);
  if (!d) return null;
  return { ...d.build(st, readFacts(st.prompt), env), id: d.id, depth: d.depth, required: !!d.required };
}

export type Reply =
  | { kind: 'start' }
  | { kind: 'surprise' }
  | { kind: 'back' }
  | { kind: 'skip' }
  | { kind: 'deeper' }
  | { kind: 'switch'; mode: StudioMode }
  | { kind: 'answer'; stage: string; answer: Partial0 }
  | { kind: 'words'; text: string };

/** What something typed into the conversation means: a command, a change of kind, an answer to the question being
 * asked (in the person's own words), or words to keep. Read without a model. */
export function readReply(st: StudioState, text: string, env: DiscoveryEnv = {}): Reply {
  const t = text.trim();
  const low = t.toLowerCase().replace(/[.!]+$/, '');
  if (/^(surprise me|you decide|you choose|your call|dealer'?s choice|up to you|anything)$/.test(low)) return { kind: 'surprise' };
  if (/^(start|go|begin|make it|let'?s go|create it|do it|ready|that'?s enough|enough)$/.test(low)) return { kind: 'start' };
  if (/^(back|go back|undo)$/.test(low)) return { kind: 'back' };
  if (/^(skip|next|pass|not sure|no idea)$/.test(low)) return { kind: 'skip' };
  if (/^(more|keep refining|refine|go deeper|more choices)$/.test(low)) return { kind: 'deeper' };
  const r = recognizeIntent(t);
  if (r.mode && r.mode !== st.mode && r.confidence >= 0.45 && /\b(actually|instead|rather|no,|not a)\b/.test(low)) return { kind: 'switch', mode: r.mode };
  const stage = currentStage(st, env);
  if (stage) {
    if (stage.control === 'fields') {
      const q = readFacts(t).quoted;
      const first = stage.fields?.[0];
      if (first) return { kind: 'answer', stage: stage.id, answer: { values: [], fields: { ...(st.answers[stage.id]?.fields ?? {}), [first.id]: q[0] ?? t.slice(0, 160) } } };
    }
    if (stage.allowText) {
      // a chip or card named in the words is chosen; the rest of the words are kept as their own
      const hit = stage.options.filter((o) => new RegExp(`\\b${o.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(low)).map((o) => o.id);
      return { kind: 'answer', stage: stage.id, answer: { values: hit.slice(0, stage.max ?? 8), text: t } };
    }
  }
  return { kind: 'words', text: t };
}

/**
 * Words said in the conversation that answer no question: read for what they change (a headline in quotes, temperament
 * words, a style named, colours, something to avoid) and applied to those decisions, which say so; words that change
 * nothing named are kept with the opening words, so every brief and every preview reads them too.
 */
export function reviseFromWords(st: StudioState, text: string, now = Date.now()): { st: StudioState; changed: string[] } {
  const t = text.trim().slice(0, STUDIO_LIMITS_TEXT);
  if (!t) return { st, changed: [] };
  const f = readFacts(t);
  const p = ({ graphic: 'g', logo: 'l', website: 'w', board: 'b', system: 's', critique: 'c' } as const)[st.mode];
  const answers = { ...st.answers };
  const changed: string[] = [];
  const has = (id: string) => DEFS.some((d) => d.id === id && d.mode === st.mode);
  const put = (id: string, a: Omit<StudioAnswer, 'source' | 'at'>, topic: string) => {
    answers[id] = { ...a, source: 'person', at: now };
    changed.push(topic);
  };
  // the person's own words for the work, in quotes
  if (f.quoted[0]) {
    const stage = st.mode === 'logo' ? 'l.name' : `${p}.words`;
    const key = st.mode === 'logo' ? 'name' : 'headline';
    if (has(stage)) put(stage, { values: [], fields: { ...(answers[stage]?.fields ?? {}), [key]: f.quoted[0], ...(f.quoted[1] && st.mode !== 'logo' ? { subhead: f.quoted[1] } : {}) } }, st.mode === 'logo' ? 'the name' : 'the words');
  }
  // temperament
  const personality = `${p}.personality`;
  if (f.mood.length && has(personality)) {
    const ids = f.mood.filter((m) => C.PERSONALITY.some((x) => x.id === m));
    // "make it calm" replaces the feel; "also playful" adds to it
    const adding = /\b(also|add|as well|too|plus|more)\b/i.test(t);
    if (ids.length) put(personality, { values: [...new Set([...ids, ...(adding ? answerOf(st, personality)?.values ?? [] : [])])].slice(0, 4) }, 'the feel');
  }
  // a style named outright
  const style = st.mode === 'board' ? 'b.direction' : `${p}.style`;
  if (f.styles.length && has(style)) put(style, { values: f.styles.slice(0, 2) }, 'the look');
  // three colours or more: a palette (the lightest the ground, the darkest the ink, the most saturated the accent)
  const palette = `${p}.palette`;
  if (f.colours.length >= 3 && has(palette)) {
    const [ground, ink, accent] = paletteOrder(f.colours);
    put(palette, { values: [], fields: { ground, ink, accent } }, 'the colours');
  }
  // something to avoid
  const avoid = `${p}.avoid`;
  if (f.avoid.length && has(avoid)) {
    const before = answerOf(st, avoid);
    put(avoid, { values: before?.values ?? [], text: [before?.text, ...f.avoid].filter(Boolean).join(', ').slice(0, 400) }, 'what to avoid');
  }
  let next: StudioState = said({ ...st, answers }, { from: 'person', kind: 'reply', text: t, at: now });
  if (changed.length) {
    const list = [...new Set(changed)];
    const what = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
    return { st: said(next, { from: 'socria', kind: 'change', text: `Changed ${what}. Everything else stays as it was.`, at: now }), changed: list };
  }
  // nothing named: kept with the opening words, and whatever it settles of what is still open is taken from it
  next = seedFromWords({ ...next, prompt: `${next.prompt} — ${t}`.slice(0, 2000) }, now);
  return { st: said(next, { from: 'socria', kind: 'note', text: 'Kept with everything else you have said: it is read into the brief and every choice from here.', at: now }), changed: [] };
}

const STUDIO_LIMITS_TEXT = 1200;

const lumOf = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const satOf = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};
/** Ground, ink and accent from a handful of colours. */
function paletteOrder(cs: readonly string[]): [string, string, string] {
  const xs = [...new Set(cs.map((c) => c.toLowerCase()))].filter((c) => /^#[0-9a-f]{6}$/.test(c));
  const byLum = [...xs].sort((a, b) => lumOf(b) - lumOf(a));
  const ground = byLum[0];
  const ink = byLum[byLum.length - 1];
  const accent = xs.filter((c) => c !== ground && c !== ink).sort((a, b) => satOf(b) - satOf(a))[0] ?? byLum[1];
  return [ground, ink, accent];
}

/** The question that settles the kind of work, when the words do not: the six modes, the likeliest first. */
export function modeOptions(ranked: readonly { mode: StudioMode; score: number }[]): StageOption[] {
  const order = [...ranked].sort((a, b) => b.score - a.score).map((r) => r.mode);
  const top = order[0];
  return order.map((m) => {
    const info = MODE_LINES[m];
    return { id: m, label: info[0], hint: info[1], preview: { kind: 'mode', mode: m }, recommended: m === top && (ranked.find((r) => r.mode === m)?.score ?? 0) > 0 };
  });
}

const MODE_LINES: Record<StudioMode, [string, string]> = {
  graphic: ['A graphic', 'A poster, a post, a cover, a card'],
  website: ['A website', 'A site or a page that works'],
  logo: ['A logo', 'A mark, a wordmark, an identity'],
  system: ['A design system', 'Bring your brand in'],
  board: ['A board', 'A whole campaign in one system'],
  critique: ['A critique', 'Look closely at a design'],
};
