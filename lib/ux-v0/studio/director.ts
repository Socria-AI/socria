// lib/ux-v0/studio/director.ts — the creative director: understanding what is asked, deciding how much there is to
// ask, asking one meaningful question at a time, reading the person's own words for the answer, and knowing when to
// stop talking and make the work.
//
// There are no question paths. Every turn starts from what is understood so far (everything the person has said and
// brought, read by the engines' own readers: ./facts.ts) and asks at most one thing:
//   · what the work cannot be made without, and nothing in the words gives (the words a poster says, a logo's name, a
//     campaign's pieces, the design for a critique) — and even these can be left as marked gaps when the person asks
//     to just make it, except where the work would mean nothing without them (a logo's name);
//   · then, only when the brief is thin, one question that would change the work most for this project (what a logo's
//     business does, what people should do on a site, whether a picture is to be placed or only learnt from, how it
//     should feel) — asked once, never repeated, always skippable;
//   · never typography, colour, spacing or composition as such: those are the engines' to propose, and the person's to
//     change in words when they see the work.
// A detailed brief is made at once; a vague one gets a question or two. Replies are read as the person writes them —
// an answer, a change of mind, a link to learn from, "make it", "surprise me", "skip", "something different" — and
// mapped onto the decisions the engines already read (./apply.ts), so making the work is unchanged.
// Deterministic and free: no model decides what to ask.

import type { StudioAnswer, StudioMode, StudioState } from './schema';
import { said } from './schema';
import { readFacts } from './facts';
import * as C from './catalog';
import { answerOf, wordsOf } from './apply';
import { recognizeIntent } from './intent';
import { modeInfo } from './modes';
import { likedRefs } from './references';

export type Topic = 'what' | 'kind' | 'words' | 'name' | 'about' | 'purpose' | 'materials' | 'feel' | 'pictures' | 'file' | 'source';

export interface Question {
  topic: Topic;
  /** said in Socria's voice, for this project */
  text: string;
  /** at most three ways to answer at a tap; the person can always just write */
  suggestions: string[];
  /** a question that can be skipped (the work is made without it) */
  optional: boolean;
}

export type Move =
  | { kind: 'ask'; question: Question }
  /** a website: three looks drawn as working pages, to choose from — or not */
  | { kind: 'looks' }
  | { kind: 'create' };

/** What the browser knows that the record does not. */
export interface DirectorEnv {
  /** a registry design system is chosen for this work */
  hasSystem?: boolean;
  systemName?: string;
}

const P = { graphic: 'g', logo: 'l', website: 'w', board: 'b', system: 's', critique: 'c' } as const;
const key = (st: Pick<StudioState, 'mode'>, k: string) => `${P[st.mode]}.${k}`;
const resolved = (a: StudioAnswer | undefined) => !!a && (a.skipped || a.delegated || a.values.length > 0 || !!a.text || !!Object.keys(a.numbers ?? {}).length || !!Object.keys(a.fields ?? {}).length);

const STOP = new Set(
  'a an the and or for of with to in on at by from my our your their its this that these those new small big little very really make create design designed want need please some something like just into about can could would we i me it is be'.split(' '),
);
const KIND_WORDS = /\b(posters?|flyers?|logos?|logotypes?|wordmarks?|monograms?|emblems?|websites?|web ?sites?|sites?|pages?|landing|campaigns?|boards?|graphics?|covers?|banners?|cards?|labels?|packaging|instagram|posts?|stor(?:y|ies)|carousels?|infographics?|identity|brand(?:ing)?|kit|materials?|series|set|launch|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/gi;
const FEEL_WORDS = new Set([...C.PERSONALITY.map((p) => p.id), ...'clean simple beautiful nice cool fresh sleek stylish premium luxury cute fun striking stunning vibrant colourful colorful dark light bright soft strong'.split(' ')]);

/** What a sentence is about, in a few words ("my bakery's opening" → "bakery opening"). */
export function subjectOf(text: string): string {
  return (text ?? '')
    .replace(/“[^”]*”|"[^"]*"/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(KIND_WORDS, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/['’]s$/, ''))
    .filter((w) => w.length > 2 && !STOP.has(w) && !FEEL_WORDS.has(w))
    .slice(0, 3)
    .join(' ');
}

const title = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const list = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
const a_ = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

// ── what is understood ──

const PURPOSE_WORDS: readonly [RegExp, string][] = [
  [/\b(restaurant|caf[eé]|bistro|bakery|bar|coffee (?:shop|house)|menu)\b/, 'restaurant'],
  [/\b(event|festival|conference|meetup|summit|gig|wedding|exhibition|rsvp)\b/, 'event'],
  [/\b(shop|store|products?|e-?commerce|sell|buy)\b/, 'shop'],
  [/\b(launch|waiting ?list|wait ?list|coming soon|pre-?order)\b/, 'launch'],
  [/\b(club|charity|community|society|association|non-?profit|volunteer|members?)\b/, 'organisation'],
  [/\b(book(?:ing|ings)?|appointments?|reservations?|classes|sessions)\b/, 'bookings'],
  [/\b(portfolio|my work|showcase|see the work|the work)\b/, 'portfolio'],
  [/\b(blog|magazine|journal|publication|newsletter|articles?|read)\b/, 'editorial'],
  [/\b(studio|agency|business|company|practice|firm|consultancy|services|get in touch|contact)\b/, 'business'],
];
const FUNCTION_WORDS: readonly [RegExp, string][] = [
  [/\bbook(?:ing|ings|able)?\b|\bappointments?\b|\breservations?\b|\bclasses\b|\bsessions\b/, 'booking'],
  [/\bcontact\b|\bget in touch\b|\benquir/, 'contact'],
  [/\bnewsletter\b|\bmailing list\b|\bsubscribe\b/, 'newsletter'],
  [/\bwait(?:ing)? ?list\b|\bpre-?order\b/, 'waitlist'],
  [/\brsvp\b/, 'rsvp'],
  [/\bjoin\b|\bmembership\b/, 'join'],
  [/\bgallery\b|\bphotos\b/, 'gallery'],
  [/\bservices\b/, 'services'],
  [/\bmenu\b/, 'menu'],
  [/\bproducts?\b|\bshop\b|\bstore\b|\bsell\b/, 'products'],
  [/\bschedule\b|\bprogramme\b|\bline-?up\b|\btimetable\b/, 'schedule'],
  [/\bour story\b|\babout us\b/, 'story'],
  [/\barticles\b|\bblog\b/, 'articles'],
];
const PURPOSE_FUNCTIONS: Readonly<Record<string, readonly string[]>> = { bookings: ['booking', 'contact'], restaurant: ['menu', 'booking'], shop: ['products', 'contact'], event: ['schedule', 'rsvp'], portfolio: ['gallery', 'contact'], launch: ['waitlist'], organisation: ['join', 'contact'], editorial: ['articles', 'newsletter'], business: ['services', 'contact'] };
const purposeIn = (low: string) => PURPOSE_WORDS.find(([re]) => re.test(low))?.[1];
const functionsIn = (low: string) => [...new Set(FUNCTION_WORDS.filter(([re]) => re.test(low)).map(([, id]) => id))];

/** Everything the person has said, in order (the opening words and every reply). */
const allWords = (st: StudioState) => st.prompt;

export interface Understanding {
  /** the kind of work, said plainly ("poster", "logo", "website", "campaign") */
  kindLabel: string;
  headline: string;
  name: string;
  details: string[];
  about: string;
  purpose: string;
  functions: string[];
  materials: { id: string; count: number }[];
  mood: string[];
  /** what the look is to be drawn from, in words (named styles, colours, references, the person's own words) */
  look: string[];
  pictures: number;
  pictureUse?: 'place' | 'look';
  /** what the work cannot be made without, still missing, in order */
  required: Topic[];
}

const graphicForm = (st: StudioState) => {
  const id = answerOf(st, 'g.kind')?.values[0];
  return C.GRAPHIC_FORMS.find((x) => x.id === id) ?? null;
};

export function understand(st: StudioState): Understanding {
  const f = readFacts(allWords(st));
  const p = P[st.mode];
  const mood = [...new Set([...(answerOf(st, key(st, 'personality'))?.values ?? []), ...f.mood])].slice(0, 6);
  const refs = likedRefs(st);
  const look = [
    ...f.styles.map((s) => s.replace(/-/g, ' ')),
    ...(f.colours.length ? [`${f.colours.length} colour${f.colours.length === 1 ? '' : 's'} named`] : []),
    ...refs.map((r) => `like ${r.host}`),
    ...(answerOf(st, key(st, 'look'))?.text ? [answerOf(st, key(st, 'look'))!.text!] : []),
    ...(answerOf(st, key(st, 'palette')) ? ['your colours'] : []),
  ];
  const images = st.attachments.filter((a) => a.kind === 'image');
  const useAns = answerOf(st, key(st, 'pictures'))?.values[0];
  const base = { mood, look, pictures: images.length, ...(useAns === 'place' || useAns === 'look' ? { pictureUse: useAns as 'place' | 'look' } : {}) };
  const words = wordsOf(st, `${p}.words`);
  const required: Topic[] = [];
  const skipped = (k: string) => !!st.answers[key(st, k)]?.skipped || !!st.answers[key(st, k)]?.delegated;
  if (st.mode === 'graphic') {
    const form = graphicForm(st);
    if (!form && !skipped('kind')) required.push('kind');
    if (!words.headline && !skipped('words')) required.push('words');
    const details = [words.subhead, ...words.details, words.cta].filter(Boolean);
    return { ...base, kindLabel: (form?.label ?? 'graphic').toLowerCase(), headline: words.headline, name: words.brand, details, about: '', purpose: '', functions: [], materials: [], required };
  }
  if (st.mode === 'logo') {
    const name = answerOf(st, 'l.name')?.fields?.name || f.brand || f.headline || '';
    if (!name) required.push('name');
    const aboutAns = answerOf(st, 'l.about');
    const about = [...(aboutAns?.values ?? []), aboutAns?.text ?? ''].filter(Boolean).join(', ') || f.domains.join(', ');
    return { ...base, kindLabel: 'logo', headline: '', name, details: [], about, purpose: '', functions: [], materials: [], required };
  }
  if (st.mode === 'website') {
    const ww = answerOf(st, 'w.words')?.fields ?? {};
    const name = ww.brand || ww.headline || f.brand || f.headline || '';
    if (!name && !skipped('words')) required.push('name');
    return { ...base, kindLabel: 'website', headline: ww.headline || f.headline || '', name, details: [], about: '', purpose: answerOf(st, 'w.purpose')?.values[0] ?? '', functions: answerOf(st, 'w.functions')?.values ?? [], materials: [], required };
  }
  if (st.mode === 'board') {
    const numbers = answerOf(st, 'b.materials')?.numbers ?? {};
    const materials = Object.entries(numbers)
      .filter(([, n]) => n > 0)
      .map(([id, count]) => ({ id, count }));
    if (!materials.length) required.push('materials');
    if (!words.headline && !skipped('words')) required.push('words');
    return { ...base, kindLabel: 'campaign', headline: words.headline, name: words.brand, details: [words.subhead, ...words.details].filter(Boolean), about: '', purpose: '', functions: [], materials, required };
  }
  if (st.mode === 'critique') {
    if (!answerOf(st, 'c.file')?.values.length) required.push('file');
    return { ...base, kindLabel: 'critique', headline: '', name: '', details: [], about: '', purpose: '', functions: [], materials: [], required };
  }
  const src = answerOf(st, 's.source')?.values[0];
  const input = answerOf(st, 's.input');
  if (!src || !(input?.values.length || input?.fields?.url)) required.push('source');
  return { ...base, kindLabel: 'design system', headline: '', name: '', details: [], about: '', purpose: '', functions: [], materials: [], required };
}

// ── what the words already say: recorded "from your words", never asked ──

/** What the person's words settle, recorded as decisions from their words (nothing already decided is overwritten). */
export function seedFromWords(st: StudioState, now = Date.now()): StudioState {
  const words = allWords(st);
  const f = readFacts(words);
  const low = words.toLowerCase();
  const answers = { ...st.answers };
  const put = (id: string, a: Omit<StudioAnswer, 'source' | 'at'>) => {
    if (!answers[id]) answers[id] = { ...a, source: 'words', at: now };
  };
  const p = P[st.mode];
  if (f.mood.length && st.mode !== 'system' && st.mode !== 'critique') put(`${p}.personality`, { values: f.mood.slice(0, 4) });
  if (f.avoid.length && st.mode !== 'system' && st.mode !== 'critique') put(`${p}.avoid`, { values: [], text: f.avoid.join(', ') });
  if (f.styles.length && st.mode !== 'system' && st.mode !== 'critique') put(`${p}.look`, { values: [], text: f.styles.map((s) => s.replace(/-/g, ' ')).join(', ') });
  if (f.colours.length >= 3 && st.mode !== 'system' && st.mode !== 'critique') {
    const [ground, ink, accent] = paletteOrder(f.colours);
    put(`${p}.palette`, { values: [], fields: { ground, ink, accent } });
  }
  if (st.mode === 'graphic') {
    if (f.kind && f.kind !== 'logo' && f.kind !== 'campaign' && f.kind !== 'identity') put('g.kind', { values: [f.story && f.kind === 'social' ? 'story' : C.GRAPHIC_FORMS.find((x) => x.kind === f.kind)?.id ?? 'poster'] });
    if (f.headline) put('g.words', { values: [], fields: { headline: f.headline, ...(f.subhead ? { subhead: f.subhead } : {}), ...(f.meta.length ? { details: f.meta.join('\n') } : {}), ...(f.brand ? { brand: f.brand } : {}) } });
  } else if (st.mode === 'logo') {
    const name = f.brand ?? f.headline;
    if (name) put('l.name', { values: [], fields: { name } });
    if (f.domains.length) put('l.about', { values: f.domains.slice(0, 2) });
    const c = f.logoCategory;
    const form = c ? (c === 'lettermark' ? 'monogram' : C.LOGO_FORMS.find((x) => x.category === c)?.id ?? (['geometric', 'organic', 'minimal', 'negative'].includes(c) ? 'abstract' : null)) : null;
    if (form) put('l.form', { values: [form] });
  } else if (st.mode === 'website') {
    // what it is for, from what is said about it — never from its name ("Mira Studio" is not a studio's site by name alone)
    const plain = words.replace(/“[^”]*”|"[^"]*"/g, ' ').toLowerCase();
    const purpose = (f.experience === 'booking' ? 'bookings' : f.experience === 'portfolio' ? 'portfolio' : f.experience === 'editorial' ? 'editorial' : f.experience === 'checkout' ? 'shop' : undefined) ?? purposeIn(plain);
    if (purpose) put('w.purpose', { values: [purpose] });
    if (f.brand || f.headline) put('w.words', { values: [], fields: { ...(f.brand ? { brand: f.brand } : {}), ...(f.headline ? { headline: f.headline } : {}), ...(f.subhead ? { subhead: f.subhead } : {}) } });
    const named = functionsIn(plain);
    const pur = answers['w.purpose']?.values[0] ?? purpose;
    if (named.length) put('w.functions', { values: named.slice(0, 5) });
    else if (pur && PURPOSE_FUNCTIONS[pur]) answers['w.functions'] ??= { values: [...PURPOSE_FUNCTIONS[pur]], source: 'socria', at: now };
  } else if (st.mode === 'board') {
    const id = /\blaunch\b/.test(low) ? 'launch' : /\b(festival|event|night|conference|fair|exhibition|concert|gig)\b/.test(low) ? 'event' : /\b(sale|offer|discount|% off)\b/.test(low) ? 'offer' : /\b(rollout|rebrand|new identity)\b/.test(low) ? 'identity' : /\b(summer|winter|spring|autumn|season)\b/.test(low) ? 'season' : null;
    if (id) put('b.objective', { values: [id] });
    if (f.headline) put('b.words', { values: [], fields: { headline: f.headline, ...(f.subhead ? { subhead: f.subhead } : {}), ...(f.meta.length ? { details: f.meta.join('\n') } : {}), ...(f.brand ? { brand: f.brand } : {}) } });
    const numbers = materialNumbers(words);
    if (Object.keys(numbers).length) put('b.materials', { values: Object.keys(numbers), numbers });
  } else if (st.mode === 'system') {
    const k = st.attachments.map((x) => x.kind);
    const src = k.includes('tokens') ? 'json' : k.includes('css') ? 'css' : k.includes('pdf') ? 'pdf' : k.includes('font') || k.includes('image') ? 'assets' : f.urls.some((u) => /figma\.com\//i.test(u)) ? 'figma' : f.urls.length ? 'website' : null;
    if (src) put('s.source', { values: [src] });
    if (src === 'website' || src === 'figma') {
      if (f.urls[0]) put('s.input', { values: [], fields: { url: f.urls[0] } });
    } else if (src) {
      const want = src === 'json' ? ['tokens'] : src === 'css' ? ['css'] : src === 'pdf' ? ['pdf'] : ['image', 'font'];
      const ids = st.attachments.filter((a) => want.includes(a.kind)).map((a) => a.id);
      if (ids.length) put('s.input', { values: ids });
    }
  } else if (st.mode === 'critique') {
    const at = st.attachments.find((a) => a.kind === 'page' || a.kind === 'image');
    if (at) put('c.file', { values: [at.id] });
  }
  return { ...st, answers };
}

/** A board's pieces, counted from words ("two posters, three posts and a website"). */
function materialNumbers(words: string): Record<string, number> {
  const numbers: Record<string, number> = {};
  for (const m of readFacts(words).materials) {
    const id = m.kind === 'social' && m.format === 'story' ? 'story' : C.BOARD_MATERIALS.find((x) => x.kind === m.kind)?.id;
    if (id) numbers[id] = Math.min(12, (numbers[id] ?? 0) + m.count);
  }
  return numbers;
}

// ── how much to ask ──

/** How much the brief says beyond what is required: its feel, its look, its details, references to learn from. */
function richness(st: StudioState, u: Understanding): number {
  return (u.mood.length ? 1 : 0) + (u.look.length ? 1 : 0) + (u.details.length ? 1 : 0) + (st.attachments.some((a) => a.kind === 'image') ? 1 : 0);
}

/** The one question that would change this work most, when the brief is thin (asked at most once per conversation). */
function optionalTopic(st: StudioState, u: Understanding): Topic | null {
  const rich = richness(st, u);
  if (st.mode === 'graphic' || st.mode === 'board') {
    if (u.pictures && !u.pictureUse) return 'pictures';
    return rich === 0 ? 'feel' : null;
  }
  if (st.mode === 'logo') {
    if (!u.about) return 'about';
    return rich === 0 ? 'feel' : null;
  }
  if (st.mode === 'website') return u.purpose ? null : 'purpose';
  return null;
}

const OPTIONAL: readonly Topic[] = ['about', 'purpose', 'feel', 'pictures'];
const wasAsked = (st: StudioState, t: Topic) => (st.asked ?? []).includes(t);
const askedAnOptional = (st: StudioState) => (st.asked ?? []).some((t) => (OPTIONAL as readonly string[]).includes(t));

/** What to do next: ask one thing, show a website's looks, or make the work. */
export function nextMove(st: StudioState, env: DirectorEnv = {}): Move {
  if (st.modeBy === 'unsure' && !st.answers.what) return { kind: 'ask', question: questionFor(st, 'what', env) };
  const u = understand(st);
  const go = !!st.answers.go;
  // what the work cannot be made without (when the person asked to just make it, only what cannot be left as a gap)
  const required = go ? u.required.filter((t) => !GAPPABLE[st.mode].includes(t)) : u.required;
  if (required.length) return { kind: 'ask', question: questionFor(st, required[0], env) };
  if (!go) {
    const opt = optionalTopic(st, u);
    if (opt && !wasAsked(st, opt) && !askedAnOptional(st) && !resolved(st.answers[optKey(st, opt)])) return { kind: 'ask', question: questionFor(st, opt, env) };
  }
  // a website's looks are offered once the brief is enough: unless one is chosen, or the person left the choice to SocriaUX
  return st.mode === 'website' && !go && !st.answers['w.aesthetic'] ? { kind: 'looks' } : { kind: 'create' };
}

/** Topics that can be left as a marked gap when the person asks to just make it. */
const GAPPABLE: Record<StudioMode, readonly Topic[]> = { graphic: ['kind', 'words'], website: ['name'], board: ['words'], logo: [], critique: [], system: [] };

const optKey = (st: StudioState, t: Topic) => (t === 'feel' ? key(st, 'personality') : t === 'about' ? 'l.about' : t === 'purpose' ? 'w.purpose' : key(st, t));

// ── the questions, in Socria's voice, for this project ──

const FEEL_PAIRS: Readonly<Record<string, readonly string[]>> = {
  food: ['Warm and handmade', 'Bright and playful', 'Calm and refined'],
  music: ['Loud and raw', 'Dark and cinematic', 'Playful and bright'],
  art: ['Quiet and poetic', 'Bold and experimental', 'Precise and minimal'],
  technology: ['Precise and modern', 'Bold and futuristic', 'Calm and friendly'],
  wellbeing: ['Calm and natural', 'Warm and friendly', 'Quiet and refined'],
  fashion: ['Refined and editorial', 'Bold and loud', 'Minimal and elegant'],
  children: ['Playful and joyful', 'Warm and friendly', 'Bright and bold'],
  celebration: ['Joyful and loud', 'Elegant and warm', 'Bold and playful'],
};
const feelSuggestions = (st: StudioState) => {
  const d = readFacts(allWords(st)).domains.find((x) => FEEL_PAIRS[x]);
  return [...(d ? FEEL_PAIRS[d] : ['Bold and playful', 'Calm and minimal', 'Warm and crafted'])];
};

const it = (st: StudioState) => {
  const u = understand(st);
  if (st.mode === 'graphic') return u.kindLabel === 'graphic' ? 'it' : `the ${u.kindLabel}`;
  return 'it';
};

/** The question for a topic, said for this project. */
export function questionFor(st: StudioState, topic: Topic, env: DirectorEnv = {}): Question {
  const u = understand(st);
  const ranked = recognizeIntent(st.prompt).ranked;
  switch (topic) {
    case 'what': {
      const top = [...ranked].sort((x, y) => y.score - x.score).slice(0, 3).map((r) => WHAT_REPLY[r.mode]);
      return { topic, optional: false, text: 'What are you after — something printed or posted, a logo, a website, a whole campaign? Or should I look closely at a design you already have?', suggestions: [...new Set([...top, 'A poster', 'A logo', 'A website'])].slice(0, 3) };
    }
    case 'kind':
      return { topic, optional: false, text: 'What will it be — a poster, a post for social media, a cover, a card? The format decides the shape everything is composed in.', suggestions: ['A poster', 'An Instagram post', 'A story'] };
    case 'words': {
      const form = graphicForm(st)?.id;
      if (st.mode === 'board') return { topic, optional: false, text: 'What is the campaign’s line — the name or headline every piece is built around? Dates and a place too, if there are any. I set your words exactly as you write them.', suggestions: [] };
      if (form === 'card') return { topic, optional: false, text: 'What goes on the card — the name, then the role, phone or email? I set your words exactly as you write them.', suggestions: [] };
      if (form === 'carousel') return { topic, optional: false, text: 'What is the title, and what are the points — one per slide? I set your words exactly as you write them.', suggestions: [] };
      if (form === 'infographic') return { topic, optional: false, text: 'What is the title, and what are the numbers — one per line, like “Coffee: 42”?', suggestions: [] };
      return { topic, optional: false, text: `What should ${it(st)} say? The headline, and the date or place if there is one — I set your words exactly as you write them, and never make them up.`, suggestions: [] };
    }
    case 'name':
      return st.mode === 'logo'
        ? { topic, optional: false, text: 'What is the name? I’ll set it exactly as you write it, capitals and all.', suggestions: [] }
        : { topic, optional: false, text: 'What is it called? And if you have it, the first thing people should read.', suggestions: [] };
    case 'about':
      return { topic, optional: true, text: `What does ${u.name ? `“${u.name}”` : 'it'} do, or stand for? A line is enough — it gives the mark its ideas, and tells me which clichés to stay away from.`, suggestions: [] };
    case 'purpose':
      return { topic, optional: true, text: 'What should people be able to do on it — book, buy, get in touch, see your work? Each becomes a working part of the page.', suggestions: purposeSuggestions(st) };
    case 'materials':
      return { topic, optional: false, text: 'What should the campaign include? Say it however you like — “two posters, three posts and a website”.', suggestions: ['Two posters and three posts', 'A poster, a story and a website'] };
    case 'pictures': {
      const one = st.attachments.filter((x) => x.kind === 'image').length === 1;
      return { topic, optional: true, text: `Should I place ${one ? 'your picture' : 'your pictures'} in the design, or just take ${one ? 'its' : 'their'} look — the colours and the mood?`, suggestions: ['Place it in the design', 'Just take its look'] };
    }
    case 'feel': {
      const after = st.mode === 'logo' ? 'Or I’ll start from the name.' : 'Or I’ll start from what you’ve said and show you three directions.';
      return u.mood.length
        ? { topic, optional: true, text: `Anything it should look like? Describe it, paste a link to something you like, or drop in a picture. ${after}`, suggestions: [] }
        : { topic, optional: true, text: `How should it feel? A few words is plenty — or point me to something you like: paste a link, or drop in a picture. ${after}`, suggestions: feelSuggestions(st) };
    }
    case 'file':
      return { topic, optional: false, text: 'Which design should I look at? Drop in the page (HTML) or a screenshot (PNG, JPG or SVG). It stays in this browser.', suggestions: [] };
    case 'source':
      return { topic, optional: false, text: 'Where is your design system now? Drop in the tokens, stylesheets or brand guidelines, or paste a link to your site or Figma file.', suggestions: [] };
  }
}

const WHAT_REPLY: Record<StudioMode, string> = { graphic: 'A poster', logo: 'A logo', website: 'A website', board: 'A whole campaign', system: 'Bring in my design system', critique: 'A critique of my design' };

function purposeSuggestions(st: StudioState): string[] {
  const d = readFacts(allWords(st)).domains;
  if (d.includes('food')) return ['See the menu and book a table', 'Order online', 'Get in touch'];
  if (d.includes('wellbeing')) return ['Book a class', 'Get in touch', 'Read about us'];
  if (d.includes('art') || d.includes('architecture')) return ['See the work', 'Get in touch', 'Read about us'];
  return ['Book a session', 'Get in touch', 'See the work'];
}

// ── what Socria says ──

/** What it is for, said back as a person would ("my bakery" → "your bakery"). */
function yourSubject(prompt: string): string {
  // from the opening words (replies are kept after them, joined by " — ")
  const opening = prompt.split(' — ')[0];
  const subject = subjectOf(opening);
  if (!subject) return '';
  const first = subject.split(' ')[0];
  return new RegExp(`\\b(my|our)\\s+(?:[\\p{L}'’-]+\\s+)?${first}`, 'iu').test(opening) ? `your ${subject}` : subject;
}
const PURPOSE_SAID: Record<string, string> = { business: 'for the business', portfolio: 'to show the work', shop: 'to sell from', bookings: 'to take bookings', event: 'for the event', launch: 'for the launch', restaurant: 'for the restaurant', organisation: 'for its members', editorial: 'to publish on' };
const FUNCTION_SAID: Record<string, string> = { booking: 'a booking calendar', contact: 'a contact form', newsletter: 'a newsletter sign-up', waitlist: 'a waiting list', rsvp: 'an RSVP', join: 'a way to join', gallery: 'a gallery', services: 'the services', menu: 'the menu', products: 'the products', schedule: 'the schedule', story: 'the story', articles: 'the articles' };

/** The work as understood, in one line ("A bold poster for “Field Lines”, 12 June · Lisbon"). */
export function restate(st: StudioState): string {
  const u = understand(st);
  const mood = u.mood.filter((m) => C.PERSONALITY.some((x) => x.id === m)).slice(0, 2);
  const lead = `${mood.length ? `${list(mood)} ` : ''}${u.kindLabel}`;
  const art = a_(lead);
  if (st.mode === 'logo') {
    // what it is, in the person's words ("a coffee roastery"), never a category ("food")
    const subj = yourSubject(st.prompt);
    const what = subj && u.name && !subj.toLowerCase().includes(u.name.toLowerCase()) ? `, ${/^your /.test(subj) ? subj : `${a_(subj)} ${subj}`}` : '';
    const own = answerOf(st, 'l.about')?.text;
    return `${title(art)} ${lead} for ${u.name ? `“${u.name}”` : subj || 'you'}${what}${own ? ` — ${own.replace(/[.!]+$/, '').slice(0, 80)}` : ''}`;
  }
  if (st.mode === 'website') {
    const parts = C.SITE_FUNCTIONS.filter((x) => u.functions.includes(x.id)).map((x) => FUNCTION_SAID[x.id] ?? x.label.toLowerCase()).slice(0, 3);
    const pur = PURPOSE_SAID[u.purpose] ?? '';
    return `${title(art)} ${lead} for ${u.name ? `“${u.name}”` : yourSubject(st.prompt) || 'you'}${pur ? `, ${pur}` : ''}${parts.length ? `, with ${list(parts)}` : ''}`;
  }
  if (st.mode === 'board') {
    const pieces = u.materials.map((m) => {
      const label = C.BOARD_MATERIALS.find((x) => x.id === m.id)?.label ?? m.id;
      return m.id === 'website' ? 'a website' : `${m.count} ${(m.count === 1 ? label.replace(/s$/, '') : label).toLowerCase()}`;
    });
    return `${title(art)} ${lead}${u.headline ? ` for “${u.headline}”` : ''}${pieces.length ? `: ${list(pieces)}` : ''}`;
  }
  if (st.mode === 'graphic') {
    const subject = u.headline ? `“${u.headline}”` : yourSubject(st.prompt);
    return `${title(art)} ${lead}${subject ? ` for ${subject}` : ''}${u.details.length ? `, ${u.details.slice(0, 2).join(' · ')}` : ''}`;
  }
  return '';
}

/** What making the work will do, said as it begins. */
export function makingLine(st: StudioState): string {
  const u = understand(st);
  const go = !!st.answers.go;
  const open = go ? ' I’ll decide whatever you left open — change anything once you see it.' : '';
  switch (st.mode) {
    case 'graphic':
      return `Composing three directions for ${u.headline ? `“${u.headline}”` : 'it'} — pick one, combine two, or ask for something different.${open}`;
    case 'logo':
      return `Constructing concepts for “${u.name}” — built from what it stands for, never taken from a library of marks.${open}`;
    case 'board': {
      const n = u.materials.reduce((t, m) => t + m.count, 0);
      return `Planning ${n} piece${n === 1 ? '' : 's'}${u.headline ? ` around “${u.headline}”` : ''}, with three identities to choose from.${open}`;
    }
    case 'website':
      if (go || st.answers['w.aesthetic']) return `Making the page${u.name ? ` for “${u.name}”` : ''}: its structure, its working parts, your words.${go && !st.answers['w.aesthetic'] ? ' I’ll choose the look myself — change anything once you see it.' : ''}`;
      return `Here are three directions for ${u.name ? `“${u.name}”` : 'it'}, each a working page with your words. Choose one, combine two, or ask for something different — or I’ll go with the first.`;
    case 'critique':
      return 'Opening your design. Select any part of it and we’ll reason it through.';
    case 'system':
      return 'Opening the import with what you brought. You’ll see what came across before anything is kept.';
  }
}

/** Socria's first turn: what it understood, then its one question, or the work. */
export function opening(st: StudioState, env: DirectorEnv = {}, now = Date.now()): StudioState {
  const seeded = seedFromWords(st, now);
  const move = nextMove(seeded, env);
  const heard = seeded.modeBy === 'unsure' ? '' : restate(seeded);
  const lead = heard ? `${heard}${env.hasSystem && env.systemName ? `, in ${env.systemName}` : ''}.` : '';
  return speak(seeded, move, lead, now);
}

/** A turn of Socria's: the acknowledgement, then the question (recorded as waiting) or the making. */
function speak(st: StudioState, move: Move, lead: string, now: number): StudioState {
  if (move.kind === 'ask') {
    const q = move.question;
    const asked = [...new Set([...(st.asked ?? []), q.topic])];
    return said({ ...st, pending: q.topic, asked }, { from: 'socria', kind: 'question', stage: q.topic, text: [lead, q.text].filter(Boolean).join(' '), at: now });
  }
  const { pending: _, ...rest } = st;
  if (move.kind === 'looks' && st.transcript.some((m) => m.kind === 'offer')) {
    return said(rest, { from: 'socria', kind: 'offer', stage: 'looks', text: `${lead ? `${lead} ` : ''}The three directions, drawn again with that — choose one, combine two, or ask for something different.`, at: now });
  }
  const enough = lead ? `${lead} That’s enough to begin.` : 'That’s enough to begin.';
  return said(rest, { from: 'socria', kind: move.kind === 'looks' ? 'offer' : 'note', stage: move.kind === 'looks' ? 'looks' : 'making', text: `${enough} ${makingLine(rest)}`, at: now });
}

/** The directions named in words, in the order they are named ("the third and the first" → [2, 0]). */
export function ordinalsIn(low: string): number[] {
  const res = [/\b(first|1st)\b|(?:^|\b(?:option|number|direction|look|no\.?)\s+)(?:one|1)\b/g, /\b(second|2nd)\b|(?:^|\b(?:option|number|direction|look|no\.?)\s+)(?:two|2)\b/g, /\b(third|3rd)\b|(?:^|\b(?:option|number|direction|look|no\.?)\s+)(?:three|3)\b/g, /\b(fourth|4th)\b|(?:^|\b(?:option|number|direction|look|no\.?)\s+)(?:four|4)\b/g];
  const hits: { i: number; at: number }[] = [];
  res.forEach((re, i) => {
    for (const m of low.matchAll(re)) hits.push({ i, at: m.index ?? 0 });
  });
  // a bare number is a choice only in a short message ("mix 1 and 3"), never in a sentence about something else
  if (low.trim().split(/\s+/).length <= 6) for (const m of low.matchAll(/(?<![\d.,])\b([1-4])\b(?![\d.,%]|\s*(?:px|pt|cm|mm|in|columns?|sections?|pages?|x\b))/g)) hits.push({ i: Number(m[1]) - 1, at: m.index ?? 0 });
  return [...new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.i))];
}

const ORD_WORD = ['first', 'second', 'third', 'fourth'];

/** Of two directions named, the one whose colours are wanted first ("the first with the third’s colours" → [2, 0]). */
export function colourFirst(low: string, ords: readonly number[]): [number, number] {
  const [a, b] = ords;
  const named = (i: number) => {
    const w = `(?:${ORD_WORD[i]}|${i + 1}(?:st|nd|rd|th)?)`;
    return new RegExp(`\\b${w}(?:’s|'s)?\\s+(?:one(?:’s|'s)?\\s+)?(?:colou?rs?|palette)|(?:colou?rs?|palette)\\s+(?:of|from)\\s+(?:the\\s+)?${w}\\b`).test(low);
  };
  return named(b) && !named(a) ? [b, a] : [a, b];
}

/** Words that ask for two directions to be made one. */
export const COMBINE_WORDS = /\b(combine|combined|mix|merge|blend|cross|together|with the|and the|plus)\b|colou?rs?|palette|\s[+&]\s/;

// ── reading the person's words ──

export type Heard =
  | { kind: 'make' }
  | { kind: 'surprise' }
  | { kind: 'skip' }
  | { kind: 'different' }
  | { kind: 'looks' }
  | { kind: 'research' }
  | { kind: 'switch'; mode: StudioMode }
  | { kind: 'words' };

const norm = (t: string) => t.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');

/** What a message means before what it says: a command, a change of kind, or words to read. */
export function hear(st: StudioState, text: string): Heard {
  const low = norm(text);
  if (/^(just )?(make it|make it now|go|go ahead|start|begin|let'?s go|let'?s do it|do it|create it|build it|ready|that'?s (it|enough|all)|enough|done|looks good|ok go)$/.test(low)) return { kind: 'make' };
  if (/^(surprise me|you decide|you choose|your call|up to you|dealer'?s choice|whatever you think|anything|i don'?t mind|no preference)$/.test(low)) return { kind: 'surprise' };
  if (/^(skip|skip it|skip this|next|pass|not sure|no idea|don'?t know|i don'?t know|no|nope|none|nothing)$/.test(low)) return { kind: 'skip' };
  if (/^(something (completely |totally )?different|other (directions|options|ones)|show me (others|other ones|something else)|none of these|not these|more|more options|try again|again)$/.test(low)) return { kind: 'different' };
  if (/^(show me (some )?(directions|looks|options|ideas)|what could it look like|ideas)$/.test(low)) return { kind: 'looks' };
  if (/\b(find|show|get|look for|search for)\b.*\b(references?|inspiration|examples?)\b|^(references?|inspiration)$/.test(low)) return { kind: 'research' };
  const r = recognizeIntent(text);
  if (r.mode && r.mode !== st.mode && r.confidence >= 0.45 && /\b(actually|instead|rather|no,|not a|make it a|switch to)\b/.test(low)) return { kind: 'switch', mode: r.mode };
  return { kind: 'words' };
}

/** Addresses a message points to for reference: full links, and sites named after "like", "look at", "similar to"… */
export function referenceUrls(text: string): string[] {
  const full = (text.match(/https?:\/\/[^\s"”'<>)]+/gi) ?? []).map((u) => u.replace(/[.,;:]+$/, ''));
  const named = [...text.matchAll(/\b(?:like|look at|looking at|see|similar to|inspired by|in the style of|reference|references|feel of|vibe of)\s+(?:the\s+)?((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|co|app|design|studio|dev|ai|uk|de|fr|nl|se|dk|no|it|es|jp|xyz|art|me|so|site|page|website|agency|shop|store|cafe|coffee))\b/gi)].map((m) => `https://${m[1]}`);
  return [...new Set([...full, ...named])].filter((u) => !/figma\.com\//i.test(u)).slice(0, 2);
}

const CTA = /\b(book now|book a (?:table|class|session)|buy tickets|get tickets|tickets at [^\n,.]+|rsvp[^\n,.]*|sign up[^\n,.]*|join us[^\n,.]*|register[^\n,.]*|shop now|order now|learn more|visit [^\n,.]+)/i;

/** A poster's (or a campaign's) words from a reply: the headline, then what supports it. */
export function wordsFrom(text: string, form?: string): Record<string, string> {
  let t = text.trim().replace(/^(it should say|it says|the headline is|headline|title|call it|it'?s called|the words are)\s*[:\-–—]?\s*/i, '');
  const f = readFacts(t);
  const out: Record<string, string> = {};
  const lines = t
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (f.quoted[0]) {
    out.headline = f.quoted[0];
    if (f.quoted[1]) out.subhead = f.quoted[1];
    t = t.replace(/“[^”]*”|"[^"]*"/g, ' ');
  } else {
    const first = lines[0] ?? t;
    const m = first.match(/^(.{2,60}?)(?:\s+[—–-]\s+|\s*:\s+|,\s+)(.+)$/);
    out.headline = (m ? m[1] : first).replace(/[.!]+$/, '').trim().slice(0, 120);
    const rest = [m ? m[2] : '', ...lines.slice(1)].filter(Boolean).join('\n');
    t = rest;
  }
  if (form === 'carousel') {
    const items = t
      .split(/\n|;|,\s*(?=[A-Z])/)
      .map((x) => x.trim())
      .filter((x) => x.length > 1);
    if (items.length) out.items = items.slice(0, 10).join('\n');
    return out;
  }
  if (form === 'infographic') {
    const data = t.split(/\n|;|,/).map((x) => x.trim()).filter((x) => /[:=–-]\s*-?\d/.test(x));
    if (data.length) out.data = data.join('\n');
    return out;
  }
  const cta = t.match(CTA)?.[0];
  if (cta) {
    out.cta = cta.trim();
    t = t.replace(cta, ' ');
  }
  const meta = readFacts(t).meta;
  const leftover = t
    .split(/\n|\s+[—–]\s+/)
    .map((x) => x.replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, '').trim())
    .filter((x) => x.length > 1);
  const details = [...new Set([...meta, ...leftover.filter((x) => !meta.some((mm) => x.includes(mm)))])].slice(0, 4);
  if (!out.subhead && details.length && !meta.length && details[0].length < 70) out.subhead = details.shift()!;
  if (details.length) out.details = details.join('\n');
  return out;
}

/** A name from a reply: quoted, or after "called", or the reply itself when it is short. */
export function nameFrom(text: string): string {
  const t = text.trim();
  const q = readFacts(t).quoted[0];
  if (q) return q.slice(0, 80);
  const m = t.match(/\b(?:called|named|name is|it'?s|it is|brand is)\s+([\p{Lu}\d][\p{L}\d&'’.-]*(?:\s+[\p{Lu}\d&][\p{L}\d&'’.-]*){0,3})/u);
  if (m) return m[1].replace(/[.,]+$/, '').slice(0, 80);
  const words = t.replace(/[.!]+$/, '').split(/\s+/);
  if (words.length <= 5) return t.replace(/[.!]+$/, '').slice(0, 80);
  const caps = t.match(/^([\p{Lu}\d][\p{L}\d&'’.-]*(?:\s+[\p{Lu}\d&][\p{L}\d&'’.-]*){0,3})/u);
  return (caps ? caps[1] : words.slice(0, 3).join(' ')).slice(0, 80);
}

const formFrom = (text: string) => {
  const low = text.toLowerCase();
  const f = readFacts(text);
  if (/\bstor(?:y|ies)\b/.test(low)) return 'story';
  if (/\bcarousel\b/.test(low)) return 'carousel';
  if (f.kind && f.kind !== 'logo' && f.kind !== 'campaign' && f.kind !== 'identity') return C.GRAPHIC_FORMS.find((x) => x.kind === f.kind)?.id ?? null;
  if (/\b(instagram|social|post|feed)\b/.test(low)) return 'social';
  if (/\b(flyer|leaflet|print)\b/.test(low)) return 'poster';
  return null;
};

/** What the person's own words change of the decisions so far, wherever they are said (changes listed, in words). */
function absorb(st: StudioState, text: string, now: number, skip: readonly string[] = []): { st: StudioState; changed: string[] } {
  const f = readFacts(text);
  const p = P[st.mode];
  const answers = { ...st.answers };
  const changed: string[] = [];
  const put = (id: string, a: Omit<StudioAnswer, 'source' | 'at'>, what: string) => {
    answers[id] = { ...a, source: 'person', at: now };
    changed.push(what);
  };
  if (st.mode === 'system' || st.mode === 'critique') return { st, changed };
  if (f.quoted[0] && !skip.includes('words')) {
    if (st.mode === 'logo') put('l.name', { values: [], fields: { ...(answers['l.name']?.fields ?? {}), name: f.quoted[0] } }, 'the name');
    else if (st.mode === 'website') put('w.words', { values: [], fields: { ...(answers['w.words']?.fields ?? {}), headline: f.quoted[0] } }, 'the first line');
    else put(`${p}.words`, { values: [], fields: { ...(answers[`${p}.words`]?.fields ?? {}), headline: f.quoted[0], ...(f.quoted[1] ? { subhead: f.quoted[1] } : {}) } }, 'the words');
  }
  if (f.mood.length && !skip.includes('feel')) {
    const adding = /\b(also|add|as well|too|plus|more)\b/i.test(text);
    const before = adding ? answers[`${p}.personality`]?.values ?? [] : [];
    put(`${p}.personality`, { values: [...new Set([...f.mood, ...before])].slice(0, 4) }, 'the feel');
  }
  if (f.styles.length && !skip.includes('look')) {
    const before = answers[`${p}.look`]?.text ?? '';
    put(`${p}.look`, { values: [], text: [before, f.styles.map((s) => s.replace(/-/g, ' ')).join(', ')].filter(Boolean).join(', ').slice(0, 400) }, 'the look');
  }
  if (f.colours.length >= 3) {
    const [ground, ink, accent] = paletteOrder(f.colours);
    put(`${p}.palette`, { values: [], fields: { ground, ink, accent } }, 'the colours');
  }
  if (f.avoid.length) {
    const before = answers[`${p}.avoid`]?.text ?? '';
    put(`${p}.avoid`, { values: [], text: [before, ...f.avoid].filter(Boolean).join(', ').slice(0, 400) }, 'what to avoid');
  }
  if (st.mode === 'website') {
    const low = text.toLowerCase();
    const fns = functionsIn(low);
    if (fns.length && !skip.includes('purpose')) put('w.functions', { values: [...new Set([...fns, ...(answers['w.functions']?.source === 'person' ? answers['w.functions'].values : [])])].slice(0, 6) }, 'what it must do');
  }
  return { st: { ...st, answers }, changed: [...new Set(changed)] };
}

/** The answer to the question waiting, read from the person's own words; the acknowledgement it earns. */
function answerTopic(st: StudioState, topic: Topic, text: string, env: DirectorEnv, now: number): { st: StudioState; ack: string; read: boolean } {
  const answers = { ...st.answers };
  const put = (id: string, a: Omit<StudioAnswer, 'source' | 'at'>) => {
    answers[id] = { ...a, source: 'person', at: now };
  };
  const t = text.trim();
  const low = t.toLowerCase();
  const done = (ack: string, read = true) => ({ st: { ...st, answers }, ack, read });
  switch (topic) {
    case 'what': {
      const r = recognizeIntent(t);
      const ranked = [...r.ranked].sort((x, y) => y.score - x.score);
      const mode = r.mode ?? (ranked[0]?.score ? ranked[0].mode : null) ?? (formFrom(t) ? 'graphic' : null);
      if (!mode) return done('', false);
      put('what', { values: [mode] });
      return { st: { ...st, answers, mode, modeBy: 'person', prompt: `${st.prompt} — ${t}`.slice(0, 2000) }, ack: `${title(a_(modeInfo(mode).label))} ${modeInfo(mode).label.toLowerCase()}, then.`, read: true };
    }
    case 'kind': {
      const form = formFrom(t);
      if (!form) return done('', false);
      put('g.kind', { values: [form] });
      return done(`${title(a_(C.GRAPHIC_FORMS.find((x) => x.id === form)!.label))} ${C.GRAPHIC_FORMS.find((x) => x.id === form)!.label.toLowerCase()}.`);
    }
    case 'words': {
      const id = st.mode === 'board' ? 'b.words' : 'g.words';
      const fields = wordsFrom(t, graphicForm(st)?.id);
      if (!fields.headline) return done('', false);
      put(id, { values: [], fields: { ...(answers[id]?.fields ?? {}), ...fields } });
      const extra = [fields.subhead, ...(fields.details?.split('\n') ?? []), fields.cta].filter(Boolean);
      return done(`“${fields.headline}”${extra.length ? `, ${extra.slice(0, 3).join(' · ')}` : ''}.`);
    }
    case 'name': {
      const name = nameFrom(t);
      if (!name) return done('', false);
      if (st.mode === 'logo') put('l.name', { values: [], fields: { ...(answers['l.name']?.fields ?? {}), name } });
      else {
        const rest = t.replace(name, '').replace(/^[\s,.;:—–-]+/, '').trim();
        const q = readFacts(t).quoted;
        put('w.words', { values: [], fields: { ...(answers['w.words']?.fields ?? {}), brand: name, ...(q[1] ? { headline: q[1] } : rest && rest.length < 120 && !/^(and|it|we)\b/i.test(rest) ? { headline: rest.replace(/^(and\s+)?(the first line is|it says)\s*/i, '') } : {}) } });
      }
      return done(`“${name}”.`);
    }
    case 'about': {
      const doms = readFacts(t).domains;
      put('l.about', { values: doms.slice(0, 2), text: t.slice(0, 300) });
      return done(`${t.length < 80 ? `“${t.replace(/[.!]+$/, '')}”` : 'Good'} — that gives it something to say.`);
    }
    case 'purpose': {
      const pur = purposeIn(low) ?? (functionsIn(low).includes('booking') ? 'bookings' : null) ?? 'business';
      const fns = functionsIn(low);
      put('w.purpose', { values: [pur] });
      put('w.functions', { values: (fns.length ? fns : [...(PURPOSE_FUNCTIONS[pur] ?? [])]).slice(0, 6) });
      const labels = C.SITE_FUNCTIONS.filter((x) => (fns.length ? fns : PURPOSE_FUNCTIONS[pur] ?? []).includes(x.id)).map((x) => x.label.toLowerCase());
      return done(labels.length ? `So it needs ${list(labels.slice(0, 3))}.` : 'Good.');
    }
    case 'materials': {
      const numbers = materialNumbers(t);
      if (!Object.keys(numbers).length) return done('', false);
      put('b.materials', { values: Object.keys(numbers), numbers });
      return done('Good.');
    }
    case 'pictures': {
      const look = /\b(look|inspiration|reference|colou?rs?|mood|feel|vibe|just|only|don'?t place|not in)\b/.test(low) && !/\bplace\b(?!.*\b(not|don'?t)\b)/.test(low);
      put(key(st, 'pictures'), { values: [look ? 'look' : 'place'] });
      return done(look ? 'I’ll only take its look — it won’t be placed in the design.' : 'I’ll place it in the design.');
    }
    case 'feel': {
      const f = readFacts(t);
      if (f.mood.length) put(key(st, 'personality'), { values: [...new Set(f.mood)].slice(0, 4) });
      const rest = t.slice(0, 400);
      put(key(st, 'look'), { values: [], text: [answers[key(st, 'look')]?.text, rest].filter(Boolean).join(', ').slice(0, 400) });
      return done(f.mood.length ? `${title(list(f.mood.slice(0, 3)))}.` : 'Good — I’ll take that into it.');
    }
    case 'file':
    case 'source':
      return done('', false);
  }
}

/** The person said to just make it: whatever is open is left to SocriaUX (the person's words left as marked gaps). */
export function makeItNow(st: StudioState, now = Date.now()): StudioState {
  const answers: StudioState['answers'] = { ...st.answers, go: { values: ['now'], source: 'person', at: now } };
  const subject = title(subjectOf(st.prompt));
  const u = understand({ ...st, answers });
  if (st.mode === 'graphic') {
    if (u.required.includes('kind')) answers['g.kind'] = { values: ['poster'], source: 'socria', at: now };
    if (u.required.includes('words')) answers['g.words'] = { values: [], fields: { ...(answers['g.words']?.fields ?? {}), headline: `[${subject || 'Your headline'}]` }, source: 'socria', at: now };
  }
  if (st.mode === 'board' && u.required.includes('words')) answers['b.words'] = { values: [], fields: { ...(answers['b.words']?.fields ?? {}), headline: `[${subject || 'Your line'}]` }, source: 'socria', at: now };
  if (st.mode === 'website' && u.required.includes('name')) answers['w.words'] = { values: [], fields: { ...(answers['w.words']?.fields ?? {}), brand: `[${subject || 'Your name'}]` }, source: 'socria', at: now };
  if (st.mode === 'website' && !answers['w.functions'] && answers['w.purpose']?.values[0]) answers['w.functions'] = { values: [...(PURPOSE_FUNCTIONS[answers['w.purpose'].values[0]] ?? [])], source: 'socria', at: now };
  const { pending: _, ...rest } = st;
  return { ...rest, answers };
}

export interface Turn {
  st: StudioState;
  move: Move;
  /** websites to read for reference (the caller reads them, then adds what it read) */
  research: string[];
  /** the person changed the kind of work (the caller switches it) */
  switchTo?: StudioMode;
}

/** The person's message, read and answered: the decisions it changes, Socria's reply, and what happens next. */
export function respond(st: StudioState, text: string, env: DirectorEnv = {}, opts: { now?: number; attachments?: string[] } = {}): Turn {
  const now = opts.now ?? Date.now();
  const t = text.trim().slice(0, 1200);
  let next = said(st, { from: 'person', kind: 'reply', text: t || 'These', ...(opts.attachments?.length ? { attachments: opts.attachments } : {}), at: now });
  const heard = t ? hear(st, t) : ({ kind: 'words' } as Heard);
  const research = referenceUrls(t);
  if (heard.kind === 'switch') return { st: next, move: nextMove(next, env), research, switchTo: heard.mode };
  if (heard.kind === 'make' || heard.kind === 'surprise') {
    next = makeItNow(next, now);
    const move = nextMove(next, env);
    if (move.kind === 'ask') return { st: speak(next, move, 'I need one thing before I can make it.', now), move, research };
    return { st: speak(next, move, heard.kind === 'surprise' ? 'Leaving the rest to me, then.' : '', now), move, research };
  }
  if (heard.kind === 'research' && !research.length) {
    const lead = 'I can read any website you point me to and take what is useful from it — its colours, its type, how its pages feel. Paste a link to something you like, or drop in a picture.';
    return { st: said(next, { from: 'socria', kind: 'note', text: lead, at: now }), move: nextMove(next, env), research };
  }
  if (heard.kind === 'different' || heard.kind === 'looks') {
    if (st.mode === 'website' && (heard.kind === 'looks' || st.transcript.some((m) => m.kind === 'offer'))) {
      next = { ...next, round: (next.round ?? 0) + (heard.kind === 'different' ? 1 : 0) };
      const { pending: _, ...rest } = next;
      return { st: said(rest, { from: 'socria', kind: 'offer', stage: 'looks', text: heard.kind === 'different' ? 'Three more directions, apart from those you have seen — a style your own words point to stays in the running.' : makingLine(rest), at: now }), move: { kind: 'looks' }, research };
    }
  }
  // a look named while the looks are on offer: "the second one", "the first’s colours with the third's type"
  if (st.mode === 'website' && t && lookOnOffer(st)) {
    const low = norm(t);
    const ords = ordinalsIn(low).filter((i) => i < 3);
    const mix = ords.length >= 2 && COMBINE_WORDS.test(low);
    if (mix || (ords.length === 1 && !/\b(not|don'?t|no|never)\b/.test(low))) {
      const value = mix ? `mix-${colourFirst(low, ords).join('-')}` : `sys-${ords[0]}`;
      next = { ...next, answers: { ...next.answers, 'w.aesthetic': { values: [value], source: 'person', at: now } } };
      return { st: makingIn(next, value, now), move: { kind: 'create' }, research };
    }
  }
  const pending = st.pending as Topic | undefined;
  if (heard.kind === 'skip' && pending) {
    const q = questionFor(st, pending, env);
    if (!q.optional && !GAPPABLE[st.mode].includes(pending)) {
      return { st: said(next, { from: 'socria', kind: 'question', stage: pending, text: `I can’t make it without that, I’m afraid. ${q.text}`, at: now }), move: { kind: 'ask', question: q }, research };
    }
    next = { ...next, answers: { ...next.answers, [optKey(st, pending)]: { values: [], skipped: true, source: 'person', at: now } } };
    const move = nextMove(next, env);
    return { st: speak(next, move, 'Fine — I’ll decide that.', now), move, research };
  }
  // the answer to what was asked, then whatever else the words change
  let ack = '';
  let readAs: Topic | null = null;
  if (pending && t) {
    const r = answerTopic(next, pending, t, env, now);
    if (r.read) {
      next = r.st;
      ack = r.ack;
      readAs = pending;
    }
  }
  if (readAs === 'what') {
    // the kind of work is known now: what the words settle for it is taken from them, then the conversation goes on
    next = seedFromWords({ ...next, pending: undefined }, now);
    const move = nextMove(next, env);
    const heardNow = restate(next);
    return { st: speak(next, move, heardNow ? `${heardNow}.` : ack, now), move, research };
  }
  if (t) {
    const ab = absorb(next, t, now, readAs ? [readAs === 'feel' ? 'feel' : readAs, ...(readAs === 'feel' ? ['look'] : [])] : []);
    next = ab.st;
    if (!readAs && ab.changed.length) ack = `Changed ${list(ab.changed)}.`;
    // words that settle something of what is still open are kept with everything said, for the engines to read
    if (!readAs || readAs === 'feel' || readAs === 'about' || readAs === 'purpose') next = seedFromWords({ ...next, prompt: `${next.prompt} — ${t}`.slice(0, 2000) }, now);
  }
  if (research.length && !ack) ack = `I’ll take a look at ${list(research.map((u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')))}.`;
  if (!readAs && pending && t && !research.length && !ack) {
    // a reply that answers nothing that was asked, and changes nothing named: the question again, said another way
    const q = questionFor(next, pending, env);
    return { st: said(next, { from: 'socria', kind: 'question', stage: pending, text: `I didn’t quite catch that. ${q.text}`, at: now }), move: { kind: 'ask', question: q }, research };
  }
  const move = nextMove(next, env);
  return { st: speak(next, move, ack, now), move, research };
}

/** A website's look chosen (or two combined), and the work made from it. */
export function chooseLook(st: StudioState, choice: number | [number, number], now = Date.now()): StudioState {
  const value = Array.isArray(choice) ? `mix-${choice[0]}-${choice[1]}` : `sys-${choice}`;
  const next = { ...st, answers: { ...st.answers, 'w.aesthetic': { values: [value], source: 'person' as const, at: now } } };
  return makingIn(said(next, { from: 'person', kind: 'reply', text: Array.isArray(choice) ? `The ${ORD_WORD[choice[0]]}’s colours with the ${ORD_WORD[choice[1]]}’s type and structure` : `The ${ORD_WORD[choice]} one`, at: now }), value, now);
}

/**
 * Whether the conversation's last word was that it is making the work, and nothing has been asked since. (Not the same
 * as nextMove() being "create": once a question has been asked it is never chosen again, so a state waiting on its
 * answer can look ready when it is not.)
 */
export function readyToMake(st: StudioState, env: DirectorEnv = {}): boolean {
  const last = [...st.transcript].reverse().find((m) => m.from === 'socria' && (m.kind === 'question' || m.kind === 'offer' || m.stage === 'making'));
  return last?.stage === 'making' && nextMove(st, env).kind === 'create';
}

/** Whether a website's looks are on offer now: offered, and not yet chosen. */
export function lookOnOffer(st: StudioState): boolean {
  if (st.answers['w.aesthetic']) return false;
  // Socria's last turn that moved the conversation on (a site read, or a note about one, does not take the looks away)
  const last = [...st.transcript].reverse().find((m) => m.from === 'socria' && (m.kind === 'question' || m.kind === 'offer' || m.stage === 'making'));
  return last?.kind === 'offer' && last.stage === 'looks';
}

/** Socria says which look the page is made in (marked as making, so a reload picks it up). */
function makingIn(st: StudioState, value: string, now: number): StudioState {
  const mix = value.match(/^mix-(\d)-(\d)$/);
  const one = value.match(/^sys-(\d)$/);
  const which = mix ? `the colours of the ${ORD_WORD[Number(mix[1])]} direction with the type and structure of the ${ORD_WORD[Number(mix[2])]}` : `the ${ORD_WORD[one ? Number(one[1]) : 0]} direction`;
  const { pending: _, ...rest } = st;
  return said(rest, { from: 'socria', kind: 'note', stage: 'making', text: `Making it in ${which}. ${makingLine(rest)}`, at: now });
}

// ── the brief, as understood ──

export interface BriefLine {
  label: string;
  value: string;
  source: 'words' | 'person' | 'socria' | 'gap';
}

/** What is understood, line by line, each with where it came from (for the brief drawer and the rail). */
export function briefLines(st: StudioState, env: DirectorEnv = {}): BriefLine[] {
  const u = understand(st);
  const src = (id: string): BriefLine['source'] => {
    const a = st.answers[id];
    if (!a) return 'words';
    if (a.source === 'socria') return Object.values(a.fields ?? {}).some((v) => /^\[.*\]$/.test(v)) ? 'gap' : 'socria';
    return a.source;
  };
  const out: BriefLine[] = [];
  const p = P[st.mode];
  out.push({ label: 'What', value: `${title(a_(u.kindLabel))} ${u.kindLabel}${env.hasSystem && env.systemName ? `, in ${env.systemName}` : ''}`, source: st.modeBy === 'person' ? 'person' : 'words' });
  if (st.mode === 'graphic' || st.mode === 'board') {
    if (u.headline) out.push({ label: 'Words', value: [`“${u.headline}”`, ...u.details].join(' · '), source: src(`${p}.words`) });
    if (st.mode === 'board' && u.materials.length) out.push({ label: 'Pieces', value: u.materials.map((m) => `${m.id === 'website' ? '' : `${m.count} `}${(C.BOARD_MATERIALS.find((x) => x.id === m.id)?.label ?? m.id).toLowerCase()}`.trim()).join(', '), source: src('b.materials') });
  }
  if (st.mode === 'logo') {
    if (u.name) out.push({ label: 'Name', value: `“${u.name}”`, source: src('l.name') });
    if (u.about) out.push({ label: 'About', value: u.about, source: src('l.about') });
  }
  if (st.mode === 'website') {
    if (u.name) out.push({ label: 'Name', value: [`“${u.name}”`, u.headline && u.headline !== u.name ? `“${u.headline}”` : ''].filter(Boolean).join(' · '), source: src('w.words') });
    const pur = C.SITE_PURPOSES.find((x) => x.id === u.purpose);
    if (pur || u.functions.length) out.push({ label: 'It must', value: [pur?.label, ...C.SITE_FUNCTIONS.filter((x) => u.functions.includes(x.id)).map((x) => x.label.toLowerCase())].filter(Boolean).join(' · '), source: src('w.functions') });
  }
  if (u.mood.length) out.push({ label: 'Feel', value: u.mood.join(', '), source: src(`${p}.personality`) });
  if (u.look.length) out.push({ label: 'Look', value: u.look.join(' · '), source: likedRefs(st).length ? 'person' : src(`${p}.look`) });
  if (u.pictures) out.push({ label: 'Pictures', value: `${u.pictures} ${u.pictures === 1 ? 'picture' : 'pictures'}${u.pictureUse === 'look' ? ', for their look only' : u.pictureUse === 'place' ? ', placed in the design' : ''}`, source: 'person' });
  const open = Object.entries(st.answers).filter(([k, a]) => (a.delegated || a.skipped) && k !== 'go').map(([k]) => TOPIC_LABEL[k.split('.')[1] ?? k] ?? '').filter(Boolean);
  if (open.length || st.answers.go) out.push({ label: 'Left to SocriaUX', value: open.length ? list([...new Set(open)]) : 'anything not said', source: 'socria' });
  return out;
}
const TOPIC_LABEL: Record<string, string> = { personality: 'the feel', look: 'the look', about: 'what it stands for', purpose: 'what it is for', pictures: 'the pictures', words: 'the words', kind: 'the format' };

// ── the kind of work, when the words do not settle it (the home asks nothing: the conversation does) ──

/** Ground, ink and accent from a handful of colours. */
function paletteOrder(cs: readonly string[]): [string, string, string] {
  const lumOf = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const satOf = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b);
    return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
  };
  const xs = [...new Set(cs.map((c) => c.toLowerCase()))].filter((c) => /^#[0-9a-f]{6}$/.test(c));
  const byLum = [...xs].sort((x, y) => lumOf(y) - lumOf(x));
  const ground = byLum[0];
  const ink = byLum[byLum.length - 1];
  const accent = xs.filter((c) => c !== ground && c !== ink).sort((x, y) => satOf(y) - satOf(x))[0] ?? byLum[1];
  return [ground, ink, accent];
}

/** The same conversation, about another kind of work: what carries across does (the feel, the colours, what to
 *  avoid, the look, the person's own words), the rest is read again from everything said. */
export function switchKind(st: StudioState, mode: StudioMode, env: DirectorEnv = {}, now = Date.now()): StudioState {
  const from = P[st.mode];
  const to = P[mode];
  const answers: StudioState['answers'] = {};
  for (const k of ['personality', 'palette', 'avoid', 'look', 'pictures']) {
    const a = st.answers[`${from}.${k}`];
    if (a && a.source !== 'words' && mode !== 'critique' && mode !== 'system') answers[`${to}.${k}`] = a;
  }
  const words = st.answers[st.mode === 'logo' ? 'l.name' : `${from}.words`];
  if (words?.fields && words.source !== 'words') {
    const headline = words.fields.headline || words.fields.name || words.fields.brand || '';
    if (headline) {
      if (mode === 'logo') answers['l.name'] = { ...words, fields: { name: words.fields.brand || headline } };
      else if (mode === 'graphic' || mode === 'board') answers[`${to}.words`] = { ...words, fields: { ...words.fields, headline } };
      else if (mode === 'website') answers['w.words'] = { ...words, fields: { ...words.fields, brand: words.fields.brand || words.fields.name || '', headline: words.fields.headline || '' } };
    }
  }
  if (st.answers.what) answers.what = st.answers.what;
  const { pending: _, ...rest } = st;
  let next: StudioState = { ...rest, mode, modeBy: 'person', answers, asked: [], round: undefined, ...(mode === 'critique' || mode === 'system' ? { systemId: undefined } : {}) };
  next = seedFromWords(next, now);
  const label = modeInfo(mode).label.toLowerCase();
  return speak(next, nextMove(next, env), `${title(a_(label))} ${label}, then.${restate(next) ? ` ${restate(next)}.` : ''}`, now);
}
