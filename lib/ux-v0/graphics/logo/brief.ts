// lib/ux-v0/graphics/logo/brief.ts — what a logo brief says, read from its words: the name (exactly as written), its
// initials, the industry, the audience, the personality, the values, the positioning, what it should call to mind,
// the competitors, where it will be used, a category asked for, and what to avoid. Clichés are avoided by default
// (light bulbs, brains, circuits, rockets, infinity loops, globes, swooshes, gradient blobs, hexagons) unless the
// brief asks for one by name. Deterministic: the same words, the same reading.

import { DOMAINS } from '../generative/lexicon';

import { LOGO_CATEGORIES, type LogoCategory } from './constants';
export { LOGO_CATEGORIES, type LogoCategory };
export const CATEGORY_LABEL: Record<LogoCategory, string> = {
  wordmark: 'Wordmark',
  lettermark: 'Lettermark',
  monogram: 'Monogram',
  abstract: 'Abstract mark',
  geometric: 'Geometric mark',
  organic: 'Organic mark',
  combination: 'Combination mark',
  emblem: 'Emblem',
  mascot: 'Mascot',
  typographic: 'Typographic symbol',
  negative: 'Negative-space mark',
  minimal: 'Minimal mark',
  expressive: 'Expressive mark',
  modular: 'Modular mark',
  responsive: 'Responsive identity',
};

export interface Cliche {
  id: string;
  label: string;
  words: RegExp;
}
/** The clichés a logo avoids unless asked for by name. */
export const CLICHES: readonly Cliche[] = [
  { id: 'lightbulb', label: 'light bulb', words: /\blight ?bulbs?\b/ },
  { id: 'brain', label: 'brain', words: /\bbrains?\b/ },
  { id: 'circuit', label: 'circuit traces', words: /\bcircuits?\b|circuit ?board/ },
  { id: 'rocket', label: 'rocket', words: /\brockets?\b/ },
  { id: 'infinity', label: 'infinity loop', words: /\binfinity\b|infinite loop|figure[- ]?(?:of[- ])?eight/ },
  { id: 'globe', label: 'globe', words: /\bglobes?\b/ },
  { id: 'swoosh', label: 'swoosh', words: /\bswoosh(?:es)?\b|\bswoops?\b/ },
  { id: 'blob', label: 'gradient blob', words: /gradient blobs?|\bblobs?\b/ },
  { id: 'hexagon', label: 'hexagon', words: /\bhexagon(?:s|al)?\b|honeycomb/ },
  // the obvious picture of an industry, avoided the same way
  { id: 'leaf', label: 'a leaf for anything green', words: /\bleaf\b|\bleaves\b/ },
  { id: 'roof', label: 'a roof for property', words: /\broofs?\b|house shape/ },
  { id: 'heart', label: 'a heart for care', words: /\bhearts?\b/ },
  { id: 'shield', label: 'a shield for security', words: /\bshields?\b/ },
  { id: 'bubble', label: 'a speech bubble for talk', words: /speech bubbles?|chat bubbles?/ },
  { id: 'handshake', label: 'a handshake for partnership', words: /\bhandshakes?\b/ },
];

export interface LogoBrief {
  /** the name exactly as written */
  name: string;
  /** one to three capitals */
  initials: string;
  tagline?: string;
  /** subjects of the business (the lexicon's domains) */
  industry: string[];
  audience: string[];
  personality: string[];
  values: string[];
  positioning?: string;
  /** what it should call to mind (subjects and things named) */
  associations: string[];
  competitors: string[];
  uses: string[];
  /** a category asked for */
  wanted?: LogoCategory;
  /** what to avoid: the brief's own words and the default clichés */
  avoid: string[];
  /** clichés the brief asked for by name (so they are allowed) */
  allow: string[];
  /** a creature or thing named for a mascot */
  creature?: string;
  /** what was read, said plainly */
  said: string[];
}

const STOP = new Set([
  'A',
  'An',
  'The',
  'Logo',
  'Create',
  'Design',
  'Make',
  'Draw',
  'Build',
  'Give',
  'We',
  'Our',
  'I',
  'My',
  'For',
  'New',
  'Brand',
  'Identity',
  'Please',
  'It',
  'This',
  'That',
  'Need',
  'Want',
  'Wordmark',
  'Symbol',
  'Mark',
  'Company',
  'Studio',
  'Startup',
]);

const PERSONALITY: readonly [RegExp, string][] = [
  [/\b(warm|friendly|approachable|kind|caring|welcoming|human|personal|gentle)\b/, 'warm'],
  [/\b(bold|confident|strong|powerful|loud|brave|daring)\b/, 'bold'],
  [/\b(calm|quiet|serene|peaceful|still|soothing|tranquil)\b/, 'calm'],
  [/\b(playful|fun|cheerful|quirky|joyful|witty|cheeky|whimsical)\b/, 'playful'],
  [/\b(premium|luxury|luxurious|elegant|refined|sophisticated|exclusive|upscale)\b/, 'refined'],
  [/\b(modern|contemporary|fresh|clean|current|sleek)\b/, 'modern'],
  [/\b(classic|timeless|heritage|traditional|established|vintage|old[- ]world)\b/, 'classic'],
  [/\b(innovative|smart|clever|inventive|visionary|forward[- ]thinking|pioneering)\b/, 'clever'],
  [/\b(natural|organic|earthy|sustainable|green|eco|ecological|botanical|wild)\b/, 'natural'],
  [/\b(precise|technical|engineered|accurate|rigorous|scientific|exact)\b/, 'precise'],
  [/\b(trust(?:worthy|ed)?|reliable|honest|secure|safe|dependable|credible)\b/, 'trust'],
  [/\b(dynamic|energetic|fast|agile|lively|vibrant|active|kinetic)\b/, 'dynamic'],
  [/\b(minimal|minimalist|simple|understated|restrained|pared[- ]back)\b/, 'minimal'],
  [/\b(expressive|artistic|creative|experimental|edgy|rebellious|unconventional|radical|weird)\b/, 'expressive'],
  [/\b(serious|professional|authoritative|institutional|formal|corporate)\b/, 'serious'],
  [/\b(young|youthful|kids?|children)\b/, 'young'],
];

const VALUES = [
  'clarity',
  'trust',
  'care',
  'community',
  'craft',
  'quality',
  'sustainability',
  'transparency',
  'innovation',
  'courage',
  'curiosity',
  'joy',
  'inclusion',
  'safety',
  'speed',
  'simplicity',
  'honesty',
  'growth',
  'freedom',
  'connection',
  'balance',
  'health',
  'learning',
  'creativity',
  'precision',
  'resilience',
  'openness',
  'respect',
  'heritage',
  'focus',
  'calm',
  'energy',
  'play',
  'access',
  'protection',
  'change',
  'discovery',
  'journey',
  'collaboration',
  'independence',
];

/** Things a brief may name that a mark can stand for (beyond the lexicon's subjects). */
const THINGS = [
  'water',
  'river',
  'sea',
  'ocean',
  'wave',
  'tide',
  'mountain',
  'sun',
  'light',
  'star',
  'moon',
  'seed',
  'tree',
  'root',
  'flower',
  'bloom',
  'stone',
  'bread',
  'grain',
  'coffee',
  'tea',
  'book',
  'page',
  'paper',
  'thread',
  'knot',
  'bridge',
  'door',
  'window',
  'path',
  'road',
  'map',
  'compass',
  'key',
  'lens',
  'eye',
  'voice',
  'sound',
  'signal',
  'spark',
  'flame',
  'wind',
  'bird',
  'wing',
  'feather',
  'fox',
  'owl',
  'bear',
  'cat',
  'fish',
  'whale',
  'bee',
  'wolf',
  'deer',
  'horse',
  'rabbit',
  'frog',
  'dog',
];
const CREATURES = ['owl', 'fox', 'bear', 'cat', 'bird', 'fish', 'whale', 'bee', 'wolf', 'deer', 'rabbit', 'frog', 'dog'];

const USES: readonly [RegExp, string][] = [
  [/\bapp ?icons?\b|\bapps?\b|\bmobile\b/, 'app icon'],
  [/\bfavicons?\b|\bbrowser tab\b/, 'favicon'],
  [/\bweb(?:site)?\b|\bonline\b|\bheader\b/, 'website'],
  [/\bsignage\b|\bsigns?\b|\bstorefront\b|\bshop front\b/, 'signage'],
  [/\bpackag(?:e|es|ing)\b|\blabels?\b|\bbottles?\b|\bboxes\b/, 'packaging'],
  [/\bmerch(?:andise)?\b|\bt-?shirts?\b|\btotes?\b|\bmugs?\b/, 'merchandise'],
  [/\bembroider(?:y|ed)\b|\bpatch(?:es)?\b|\buniforms?\b/, 'embroidery'],
  [/\bsocial\b|\binstagram\b|\bavatar\b|\bprofile\b/, 'social'],
  [/\bprint\b|\bbusiness cards?\b|\bstationery\b|\bletterhead\b/, 'print'],
  [/\bvehicles?\b|\bvans?\b|\btrucks?\b|\bfleet\b/, 'vehicles'],
  [/\bstamps?\b|\bseals?\b/, 'stamp'],
];

const CATEGORY_WORDS: readonly [RegExp, LogoCategory][] = [
  [/\b(word ?mark|logotype|logo ?type|name only|just the name)\b/, 'wordmark'],
  [/\b(letter ?mark|initials?)\b/, 'lettermark'],
  [/\bmonogram\b/, 'monogram'],
  [/\bnegative[- ]space\b/, 'negative'],
  [/\b(emblem|badge|crest|seal)\b/, 'emblem'],
  [/\b(mascot|character)\b/, 'mascot'],
  [/\btypographic (symbol|mark)\b/, 'typographic'],
  [/\bcombination mark\b|\bsymbol (?:and|with|plus) (?:a )?(?:word ?mark|name)\b/, 'combination'],
  [/\bresponsive (logo|identity|mark)\b/, 'responsive'],
  [/\bmodular (logo|identity|mark|system)\b/, 'modular'],
  [/\bexpressive (logo|mark|word ?mark)\b/, 'expressive'],
  [/\bminimal (logo|mark|symbol)\b/, 'minimal'],
  [/\babstract (logo|mark|symbol)\b/, 'abstract'],
  [/\bgeometric (logo|mark|symbol)\b/, 'geometric'],
  [/\borganic (logo|mark|symbol)\b/, 'organic'],
];

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const list = (s: string) =>
  s
    .split(/,|;|\band\b|\//)
    .map((x) => clean(x).replace(/[.!?]+$/, ''))
    .filter((x) => x && x.length <= 40);

/** The name the brief gives, exactly as written. */
export function nameOf(text: string): string | null {
  const q = text.match(/[“"‘']([^“”"‘’']{1,40})[”"’']/);
  if (q && /[A-Za-z0-9]/.test(q[1])) return clean(q[1]);
  const pats = [
    /\b(?:called|named|name is|brand(?:ed)? as|company is)\s+([A-Z0-9][\w&'’.-]*(?:\s+(?:&|and|[A-Z0-9][\w&'’.-]*)){0,4})/,
    /\b(?:logo|identity|wordmark|brand) (?:for|of)\s+([A-Z0-9][\w&'’.-]*(?:\s+(?:&|[A-Z0-9][\w&'’.-]*)){0,4})/,
    /^([A-Z][\w&'’.-]*(?:\s+(?:&|[A-Z][\w&'’.-]*)){0,3})\s*(?:is|—|–|-|:|,)\s/,
    // "a website for Kanso, an architecture studio": a capitalised name with what it is said after it
    /\b(?:website|site|web ?page|landing page|page|poster|flyer|campaign|shop|store|app|portfolio|menu|newsletter|board|brochure|card|banner|invitation)s? (?:for|of)\s+([A-Z0-9][\w&'’.-]*(?:\s+(?:&|[A-Z0-9][\w&'’.-]*)){0,3})(?=\s*(?:,|—|–|\(|:)\s*(?:an?|the|our|my)?\s*[a-z])/,
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (!m) continue;
    const words = m[1].split(/\s+/).filter((w) => !STOP.has(w.replace(/[.,]$/, '')));
    // a trailing connector is not part of the name
    while (words.length && /^(&|and)$/i.test(words[words.length - 1])) words.pop();
    const name = clean(words.join(' ').replace(/[.,:;]+$/, ''));
    if (name) return name;
  }
  return null;
}

/** One to three capitals: the first letter of each word (or of each capitalised part of a joined name). */
export function initialsOf(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s\-_&+]+/)
    .filter((w) => /[A-Za-z0-9]/.test(w));
  const letters = words.map((w) => (w.match(/[A-Za-z0-9]/)?.[0] ?? '').toUpperCase()).filter(Boolean);
  if (letters.length >= 2) return letters.slice(0, 3).join('');
  const w = (words[0] ?? 'S').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return w.slice(0, 1) || 'S';
}

/** The brief read (see the head of this file). `extra` adds what a form gave apart from the words. */
export function readLogoBrief(text: string, extra: Partial<Pick<LogoBrief, 'name' | 'tagline' | 'industry' | 'values' | 'personality' | 'competitors' | 'uses' | 'wanted'>> = {}): LogoBrief {
  const raw = clean(text).slice(0, 2400);
  const low = raw.toLowerCase();
  const said: string[] = [];
  const name = clean(extra.name ?? nameOf(raw) ?? 'Brand').slice(0, 40);
  said.push(`The name is “${name}”, set exactly as written.`);
  const industry = extra.industry ?? DOMAINS.filter((d) => d.words.test(low)).map((d) => d.id);
  const personality = [...new Set([...(extra.personality ?? []), ...PERSONALITY.filter(([re]) => re.test(low)).map(([, t]) => t)])];
  const valueBlock = low.match(/\bvalues?(?: are|:)\s*([^.]+)/)?.[1] ?? '';
  const values = [...new Set([...(extra.values ?? []), ...list(valueBlock).map((v) => v.split(' ').pop() ?? v), ...VALUES.filter((v) => new RegExp(`\\b${v}\\b`).test(low))])].slice(0, 8);
  const audience = list(
    low.match(
      /\b(?:for|audience(?: is|:)|aimed at|serving)\s+((?:young |busy |small |local |independent |first-time )?(?:people|families|parents|students|teams|founders|developers|designers|makers|artists|doctors|patients|travell?ers|cyclists|runners|gardeners|readers|kids|children|teenagers|businesses|companies|cafés|restaurants|shops|communities|women|men|seniors|clinicians|engineers|scientists|farmers|chefs|musicians)[^.,;]*)/,
    )?.[1] ?? '',
  ).slice(0, 3);
  const positioning = raw.match(/\b(?:positioned as|positioning(?: is|:)|we are the|the only)\s+([^.]{4,120})/i)?.[1];
  const things = THINGS.filter((t) => new RegExp(`\\b${t}s?\\b`).test(low));
  const associations = [
    ...new Set([...things, ...(low.match(/\b(?:evoke|suggest|feel like|reminiscent of|inspired by|associations?:)\s+([^.]+)/)?.[1] ? list(low.match(/\b(?:evoke|suggest|feel like|reminiscent of|inspired by|associations?:)\s+([^.]+)/)![1]) : [])]),
  ].slice(0, 8);
  const competitors = extra.competitors ?? list(raw.match(/\b(?:competitors?(?: are|:)|compete with|unlike|different from)\s+([^.]+)/i)?.[1] ?? '').slice(0, 5);
  const uses = extra.uses ?? USES.filter(([re]) => re.test(low)).map(([, u]) => u);
  const wanted = extra.wanted ?? CATEGORY_WORDS.find(([re]) => re.test(low))?.[1];
  const tagline = extra.tagline ?? raw.match(/\b(?:tagline|strapline|slogan)(?: is|:)\s*[“"]?([^”".]{2,60})/i)?.[1];
  // what to avoid: "no X", "avoid X", "without X", "not X"; clichés asked for by name are allowed
  const avoidWords = [...low.matchAll(/\b(?:no|avoid|without|not|never|don't use|do not use)\s+(?:a |an |any |the )?([a-z][a-z -]{2,30}?)(?=[,.;]|\s+(?:or|and|but)\b|$)/g)].map((m) => clean(m[1]));
  const asked = CLICHES.filter((c) => c.words.test(low) && !avoidWords.some((w) => c.words.test(w)));
  const allow = asked.map((c) => c.id);
  const avoid = [...new Set([...avoidWords, ...CLICHES.filter((c) => !allow.includes(c.id)).map((c) => c.id)])];
  const creature = CREATURES.find((c) => new RegExp(`\\b${c}s?\\b`).test(low));
  if (industry.length) said.push(`It works in ${industry.slice(0, 3).join(', ')}.`);
  if (personality.length) said.push(`Its personality: ${personality.join(', ')}.`);
  if (values.length) said.push(`It values ${values.slice(0, 5).join(', ')}.`);
  if (associations.length) said.push(`It may call to mind ${associations.slice(0, 5).join(', ')}.`);
  if (wanted) said.push(`A ${CATEGORY_LABEL[wanted].toLowerCase()} was asked for.`);
  if (uses.length) said.push(`It will be used on ${uses.join(', ')}.`);
  if (allow.length) said.push(`Asked for by name, so allowed: ${asked.map((c) => c.label).join(', ')}.`);
  said.push('Clichés are avoided: light bulbs, brains, circuits, rockets, infinity loops, globes, swooshes, gradient blobs, hexagons.');
  return {
    name,
    initials: initialsOf(name),
    ...(tagline ? { tagline: clean(tagline) } : {}),
    industry,
    audience,
    personality,
    values,
    ...(positioning ? { positioning: clean(positioning) } : {}),
    associations,
    competitors,
    uses,
    ...(wanted ? { wanted } : {}),
    avoid,
    allow,
    ...(creature ? { creature } : {}),
    said,
  };
}

/** Whether the words ask for a logo (rather than another kind of graphic). */
export const asksForLogo = (text: string) => /\b(logo|logotype|word ?mark|letter ?mark|monogram|brand ?mark|emblem|brand identity|visual identity|identity system)\b/i.test(text);
