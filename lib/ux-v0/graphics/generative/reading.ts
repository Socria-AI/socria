// lib/ux-v0/graphics/generative/reading.ts — the creative reading of a brief, before any design exists: what it is for,
// what it is about, who it speaks to, where it will be seen, how it should feel, what must be read first, what the
// words themselves offer the eye, and what cannot change. Read from the brief's own words; nothing here picks a layout.

import type { GraphicBrief } from '../compose';
import type { Role } from '../doc';
import { DOMAINS, GENERAL } from './lexicon';
import { clamp } from './util';

export type Purpose = 'promote' | 'announce' | 'sell' | 'inform' | 'celebrate' | 'invite' | 'recruit' | 'identify';
export type Audience = 'general' | 'professional' | 'young' | 'luxury' | 'family' | 'community';
export type Medium = 'print' | 'social' | 'screen' | 'slide';
export type AspectClass = 'tall' | 'portrait' | 'square' | 'landscape' | 'wide';

export interface Opportunity {
  kind: 'monumental' | 'numeral' | 'initial' | 'ampersand' | 'image' | 'images' | 'data' | 'list' | 'long-title' | 'brand' | 'short-words';
  why: string;
  value?: string;
}

export interface CreativeReading {
  purpose: Purpose;
  subject: { text: string; domains: { id: string; label: string; weight: number }[] };
  audience: Audience;
  medium: Medium;
  aspect: AspectClass;
  ratio: number;
  /** 0–100 each: how loud, how warm, how tense, how playful, how serious */
  emotion: { energy: number; warmth: number; tension: number; play: number; gravity: number; words: string[] };
  hierarchy: { order: Role[]; words: number; chars: number; longest: number; facts: number; length: 'short' | 'medium' | 'long' };
  opportunities: Opportunity[];
  constraints: { required: Role[]; images: number; brand: boolean; data: boolean; items: number };
  /** 0 spare … 100 rich: how much the design may carry */
  complexity: number;
  /** the reading, in sentences, for the designer */
  said: string[];
}

const PURPOSES: [RegExp, Purpose][] = [
  [/\b(hiring|we'?re hiring|join (our|the) team|careers?|vacanc|recruit|volunteers? wanted|apply now)\b/, 'recruit'],
  [/\b(invite|invitation|invited|rsvp|gala|wedding|save the date|join us)\b/, 'invite'],
  [/\b(sale|offer|discount|% off|buy|shop|price|deal|product|launching our|order now)\b/, 'sell'],
  [/\b(celebrat|anniversary|birthday|party|festive|new year|jubilee)\b/, 'celebrate'],
  [/\b(launch|announc|introducing|now open|opening|new|coming soon|premiere)\b/, 'announce'],
  [/\b(guide|how to|infographic|report|data|schedule|programme|program|timetable|facts|explain|statistics|results)\b/, 'inform'],
  [/\b(brand|identity|logo|wordmark)\b/, 'identify'],
];
const AUDIENCES: [RegExp, Audience][] = [
  [/\b(luxury|luxurious|premium|couture|exclusive|fine dining|haute|bespoke|private view)\b/, 'luxury'],
  [/\b(kids|children|family|families|parents|toddlers?)\b/, 'family'],
  [/\b(students?|youth|teen|teens|gen ?z|club night|campus|freshers)\b/, 'young'],
  [/\b(conference|summit|industry|professional|b2b|enterprise|executives?|investors?|corporate|business)\b/, 'professional'],
  [/\b(community|neighbou?rhood|local|charity|volunteer|together|members)\b/, 'community'],
];

const MOOD: Record<'energy' | 'warmth' | 'tension' | 'play' | 'gravity', [RegExp, number][]> = {
  energy: [
    [/\b(bold|loud|dynamic|energetic|energy|vibrant|electric|wild|exciting|explosive|fast|intense|punchy|maximal|maximalist|festival|party|rave)\b/, 22],
    [/\b(calm|quiet|minimal|minimalist|serene|gentle|soft|still|restrained|understated|subtle|elegant|peaceful|slow)\b/, -24],
  ],
  warmth: [
    [/\b(warm|friendly|cosy|cozy|handmade|human|community|welcoming|sunny|summer|earthy|organic|natural)\b/, 18],
    [/\b(cool|cold|clinical|corporate|technical|precise|winter|icy|sterile|futuristic|digital)\b/, -16],
  ],
  tension: [
    [/\b(experimental|edgy|raw|urgent|protest|dark|disruptive|provocative|unsettling|rebellious|underground|glitch|radical|daring|unexpected)\b/, 24],
    [/\b(harmonious|balanced|classic|timeless|safe|traditional|calm)\b/, -15],
  ],
  play: [
    [/\b(playful|fun|funny|quirky|kids|whimsical|joyful|cheerful|pop|silly|colourful|colorful|bright)\b/, 22],
    [/\b(serious|formal|corporate|luxury|sombre|somber|solemn|institutional|academic)\b/, -20],
  ],
  gravity: [
    [/\b(serious|formal|institutional|memorial|heritage|luxury|prestigious|academic|official|authoritative|classic|timeless)\b/, 20],
    [/\b(casual|playful|fun|silly|relaxed|informal)\b/, -18],
  ],
};

const NUMERAL = /\d{1,4}(?:\s*[–-]\s*\d{1,4})?/;

/** The creative reading of a brief, in its format (see the head of this file). */
export function readCreative(brief: GraphicBrief, f: { width: number; height: number; unit: string; id: string }, opts: { tone?: readonly string[] } = {}): CreativeReading {
  const c = brief.content;
  const text = [brief.purpose, c.headline, c.subhead, c.body, ...(c.items ?? []), brief.mood.join(' ')].filter(Boolean).join(' . ').toLowerCase();
  const strong = [c.headline, c.subhead].filter(Boolean).join(' . ').toLowerCase();

  // the subject: the domains the words belong to, by how strongly (the title and subtitle count half again)
  const scored = DOMAINS.map((d) => {
    const all = text.match(new RegExp(d.words.source, 'g'))?.length ?? 0;
    const own = strong.match(new RegExp(d.words.source, 'g'))?.length ?? 0;
    return { d, score: all + own * 0.5 };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  const kept = scored.filter((s) => s.score >= top * 0.34).slice(0, 3);
  const total = kept.reduce((s, k) => s + k.score, 0) || 1;
  const domains = kept.length ? kept.map((k) => ({ id: k.d.id, label: k.d.label, weight: Math.round((k.score / total) * 100) / 100 })) : [{ id: GENERAL.id, label: GENERAL.label, weight: 1 }];

  // the temperament: the subject's, moved by the brief's mood words and the language's tone
  const temper = (key: 'energy' | 'warmth' | 'play' | 'gravity') => {
    const base = kept.length ? kept.reduce((s, k) => s + k.d[key] * (k.score / total), 0) : GENERAL[key];
    return base;
  };
  const moodText = `${text} ${(opts.tone ?? []).join(' ')}`;
  const shift = (key: keyof typeof MOOD) => MOOD[key].reduce((s, [re, v]) => s + (re.test(moodText) ? v : 0), 0);
  const emotion = {
    energy: Math.round(clamp(temper('energy') + shift('energy'), 0, 100)),
    warmth: Math.round(clamp(temper('warmth') + shift('warmth'), 0, 100)),
    tension: Math.round(clamp(30 + shift('tension'), 0, 100)),
    play: Math.round(clamp(temper('play') + shift('play'), 0, 100)),
    gravity: Math.round(clamp(temper('gravity') + shift('gravity'), 0, 100)),
    words: [...new Set(brief.mood.map((w) => w.toLowerCase()))].slice(0, 6),
  };

  const purpose = PURPOSES.find(([re]) => re.test(text))?.[1] ?? (brief.kind === 'identity' ? 'identify' : brief.kind === 'infographic' ? 'inform' : 'promote');
  const audience = AUDIENCES.find(([re]) => re.test(text))?.[1] ?? 'general';
  const medium: Medium = f.unit === 'pt' ? 'print' : /instagram|story|linkedin|social|tiktok|facebook|twitter|x-post/.test(f.id) ? 'social' : /presentation|slide/.test(f.id) ? 'slide' : 'screen';
  const ratio = f.width / f.height;
  const aspect: AspectClass = ratio < 0.62 ? 'tall' : ratio < 0.9 ? 'portrait' : ratio <= 1.15 ? 'square' : ratio <= 2.2 ? 'landscape' : 'wide';

  // the hierarchy: the title first, then what the brief gives, in the order it matters
  const head = c.headline.trim();
  const words = head.split(/\s+/).filter(Boolean);
  const longest = words.reduce((m0, w) => Math.max(m0, w.length), 0);
  const meta = c.meta ?? [];
  const order: Role[] = ['headline', ...(c.subhead ? (['subhead'] as Role[]) : []), ...(meta.length ? (['meta'] as Role[]) : []), ...(c.cta ? (['cta'] as Role[]) : []), ...(c.brand ? (['logo'] as Role[]) : [])];
  const facts = (c.subhead ? 1 : 0) + meta.length + (c.cta ? 1 : 0) + (c.brand ? 1 : 0);
  const length = words.length <= 3 && head.length <= 22 ? 'short' : words.length <= 7 && head.length <= 48 ? 'medium' : 'long';

  // what the words themselves offer the eye
  const opportunities: Opportunity[] = [];
  if (length === 'short') opportunities.push({ kind: 'monumental', why: 'a short title can carry the frame on its own' });
  if (length === 'long') opportunities.push({ kind: 'long-title', why: 'a long title wants a measure, not a monument' });
  const numeral = [head, ...meta].map((s) => s.match(NUMERAL)?.[0]).find(Boolean);
  if (numeral) opportunities.push({ kind: 'numeral', why: `the numbers (${numeral.replace(/\s+/g, '')}) can become a shape`, value: numeral.replace(/\s+/g, '') });
  const initial = head.match(/[A-Za-z]/)?.[0];
  if (initial) opportunities.push({ kind: 'initial', why: `its first letter, ${initial.toUpperCase()}, can be drawn large`, value: initial });
  if (/&/.test(head)) opportunities.push({ kind: 'ampersand', why: 'the ampersand is a form in itself', value: '&' });
  if (brief.images.length) opportunities.push({ kind: brief.images.length > 1 ? 'images' : 'image', why: brief.images.length > 1 ? `${brief.images.length} pictures to build with` : 'a picture to build around' });
  if (c.data?.length) opportunities.push({ kind: 'data', why: 'real numbers to draw' });
  if ((c.items?.length ?? 0) >= 2) opportunities.push({ kind: 'list', why: `${c.items!.length} points in sequence` });
  if (words.length >= 3 && words.every((w) => w.length <= 6)) opportunities.push({ kind: 'short-words', why: 'short words that stack' });
  if (c.brand) opportunities.push({ kind: 'brand', why: `a name to sign it with (${c.brand})` });

  const spare = /\b(minimal|minimalist|simple|clean|spare|quiet|restrained)\b/.test(moodText);
  const rich = /\b(maximal|maximalist|rich|dense|layered|busy|collage|ornate|loud)\b/.test(moodText);
  const complexity = Math.round(clamp(45 + (spare ? -25 : 0) + (rich ? 25 : 0) + (emotion.energy - 50) * 0.3 + Math.min(4, facts) * 2 + (brief.images.length ? 5 : 0), 5, 95));

  const temperament = [
    emotion.energy >= 65 ? 'energetic' : emotion.energy <= 35 ? 'calm' : 'measured',
    emotion.warmth >= 62 ? 'warm' : emotion.warmth <= 38 ? 'cool' : null,
    emotion.tension >= 55 ? 'tense' : null,
    emotion.play >= 62 ? 'playful' : emotion.gravity >= 62 ? 'serious' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const said = [
    `To ${purpose === 'promote' ? 'promote' : purpose === 'sell' ? 'sell' : purpose === 'inform' ? 'inform' : purpose === 'celebrate' ? 'celebrate' : purpose === 'invite' ? 'invite' : purpose === 'recruit' ? 'recruit' : purpose === 'identify' ? 'identify' : 'announce'}: about ${domains.map((d) => d.label).join(' and ')}, for ${audience === 'general' ? 'a general audience' : `a ${audience} audience`}, seen ${medium === 'print' ? 'in print' : medium === 'social' ? 'in a feed' : medium === 'slide' ? 'on a screen in a room' : 'on screen'} (${aspect}).`,
    `It should feel ${temperament}.`,
    `Read first: the title (${words.length} word${words.length === 1 ? '' : 's'}${length === 'short' ? ', short' : length === 'long' ? ', long' : ''}), then ${facts ? `${facts} fact${facts === 1 ? '' : 's'}` : 'nothing else'}.`,
    ...(opportunities.length
      ? [
          `What the words offer: ${opportunities
            .slice(0, 3)
            .map((o) => o.why)
            .join('; ')}.`,
        ]
      : []),
  ];

  return {
    purpose,
    subject: { text: text.slice(0, 200), domains },
    audience,
    medium,
    aspect,
    ratio,
    emotion,
    hierarchy: { order, words: words.length, chars: head.length, longest, facts, length },
    opportunities,
    constraints: { required: order, images: brief.images.length, brand: !!c.brand, data: !!c.data?.length, items: c.items?.length ?? 0 },
    complexity,
    said,
  };
}

export const hasOpportunity = (r: CreativeReading, kind: Opportunity['kind']) => r.opportunities.find((o) => o.kind === kind) ?? null;
