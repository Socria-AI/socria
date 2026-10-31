// lib/objects/display-easy.ts — AN EASY VIEW: a photo, made large, clear and simple.
//
// "On your phone you can take a picture of, like, a restaurant menu … it can
// show stuff and show diagrams of stuff in easier UIs for people with bad eyes
// or older people — it's an artifact." A menu, a medicine label, a bus
// timetable, a letter, a receipt: photographed once, read once by a vision
// model (app/api/logos/easy), and kept here as what it SAYS — its sections and
// items, prices and times, steps and warnings — so it can be drawn in big type,
// in high contrast, read aloud, and pictured plainly: prices as bars, times on
// a line, steps in order (components/display/EasyFigure.tsx).
//
// It is made only by taking or choosing a photo (`internal`): never proposed by
// Socria, never asked for by name. Nothing in it is invented — a price that
// could not be read is not there, and what could not be read is said
// (`unclear`). What is drawn from it (the bars, the next time) is computed
// here, from what was read, never asked of a model.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import { cleanText, displayKind, headOps, readView, registerDisplay, type DisplayHead, type DisplayMeta } from './display-base';

export type EasyView = 'read' | 'glance';
export const EASY_KINDS = ['menu', 'label', 'timetable', 'sign', 'letter', 'receipt', 'instructions', 'list', 'other'] as const;
export type EasyKind = (typeof EASY_KINDS)[number];

export interface EasyItem {
  id: string;
  name: string;
  /** the small print under it: what is in it, what it is */
  detail?: string;
  /** its price or amount, exactly as written: "$6.50", "2 tablets" */
  value?: string;
  /** only what the photo marks: vegetarian, spicy, contains nuts */
  tags?: string[];
}
export interface EasySection {
  id: string;
  /** may be empty: a list with no headings is one section without a title */
  title: string;
  items: EasyItem[];
}
export interface EasyFact {
  label: string;
  value: string;
}
export interface EasyTime {
  time: string;
  label: string;
}

export interface EasyState extends DisplayHead {
  view: EasyView;
  kind: EasyKind;
  /** one or two plain sentences: what this is */
  summary: string;
  sections: EasySection[];
  facts: EasyFact[];
  steps: string[];
  times: EasyTime[];
  /** what the photo states as a caution, word for word */
  warnings: string[];
  /** what could not be read — said, never guessed at */
  unclear: string[];
}

export const EASY_LIMITS = { sections: 12, items: 80, perSection: 40, tags: 4, facts: 12, steps: 20, times: 40, warnings: 8, unclear: 6 } as const;

const VIEWS: EasyView[] = ['read', 'glance'];

/** What each kind of photo is called, for a title it did not have and for the person. */
export const EASY_KIND_WORD: Record<EasyKind, string> = {
  menu: 'menu',
  label: 'label',
  timetable: 'timetable',
  sign: 'sign',
  letter: 'letter',
  receipt: 'receipt',
  instructions: 'instructions',
  list: 'list',
  other: 'photo',
};

const strings = (v: unknown, max: number, count: number): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const s = cleanText(x, max);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= count) break;
  }
  return out;
};

function cleanItem(raw: unknown, id: string): EasyItem | null {
  if (!raw || typeof raw !== 'object') return typeof raw === 'string' && cleanText(raw, 120) ? { id, name: cleanText(raw, 120) } : null;
  const r = raw as Record<string, unknown>;
  const name = cleanText(r.name, 120);
  if (!name) return null;
  const detail = cleanText(r.detail, 240);
  const value = cleanText(r.value, 40);
  const tags = strings(r.tags, 24, EASY_LIMITS.tags).map((t) => t.toLowerCase());
  return { id, name, ...(detail ? { detail } : {}), ...(value ? { value } : {}), ...(tags.length ? { tags } : {}) };
}

/** The one canonical form: positions give the ids, so reading it back is the same state. */
export function sanitizeEasy(raw: unknown): EasyState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind: EasyKind = (EASY_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as EasyKind) : 'other';
  let n = 0;
  const sections: EasySection[] = [];
  for (const s of Array.isArray(r.sections) ? r.sections : []) {
    if (sections.length >= EASY_LIMITS.sections || n >= EASY_LIMITS.items) break;
    if (!s || typeof s !== 'object') continue;
    const sr = s as Record<string, unknown>;
    const items: EasyItem[] = [];
    for (const it of Array.isArray(sr.items) ? sr.items : []) {
      if (items.length >= EASY_LIMITS.perSection || n >= EASY_LIMITS.items) break;
      const item = cleanItem(it, `i${n + 1}`);
      if (item) {
        items.push(item);
        n++;
      }
    }
    if (items.length) sections.push({ id: `s${sections.length + 1}`, title: cleanText(sr.title, 60), items });
  }
  const facts: EasyFact[] = [];
  for (const f of Array.isArray(r.facts) ? r.facts : []) {
    if (facts.length >= EASY_LIMITS.facts) break;
    if (!f || typeof f !== 'object') continue;
    const label = cleanText((f as Record<string, unknown>).label, 40);
    const value = cleanText((f as Record<string, unknown>).value, 160);
    if (label && value && !facts.some((x) => x.label.toLowerCase() === label.toLowerCase() && x.value === value)) facts.push({ label, value });
  }
  const times: EasyTime[] = [];
  for (const t of Array.isArray(r.times) ? r.times : []) {
    if (times.length >= EASY_LIMITS.times) break;
    if (!t || typeof t !== 'object') continue;
    const time = cleanText((t as Record<string, unknown>).time, 20);
    const label = cleanText((t as Record<string, unknown>).label, 120);
    if (time) times.push({ time, label });
  }
  const steps = strings(r.steps, 240, EASY_LIMITS.steps);
  const warnings = strings(r.warnings, 240, EASY_LIMITS.warnings);
  const unclear = strings(r.unclear, 160, EASY_LIMITS.unclear);
  const summary = cleanText(r.summary, 400);
  if (!sections.length && !facts.length && !steps.length && !times.length && !warnings.length && !summary) return null;
  const title = cleanText(r.title, 80) || `The ${EASY_KIND_WORD[kind]}`;
  const base = { title, view: 'read' as EasyView, kind, summary, sections, facts, steps, times, warnings, unclear };
  // shown at a glance only when there is something to draw
  const view: EasyView = r.view === 'glance' && glanceOf(base).kind ? 'glance' : 'read';
  return { ...base, view };
}

// ── what can be drawn from it, computed here ─────────────────────────

/**
 * A price as a number, from how it is written: "$6.50", "£12", "6,50 €",
 * "2 for $5" (the price is 5), "1,200". Null for "market price", for a range
 * it cannot pick one from, and for anything that is not plainly a price.
 */
export function priceOf(v: string | undefined): number | null {
  if (!v) return null;
  const s = v.replace(/\s+/g, ' ').trim();
  const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)`;
  const CUR = String.raw`(?:[$£€¥₹₩₺₱]|US\$|USD|EUR|GBP|CHF|Rs\.?)`;
  const AFTER = String.raw`(?:[$£€¥₹₩₺₱]|USD|EUR|GBP|CHF|kr|zł|Kč|lei|Ft)`;
  const m = new RegExp(`${CUR}\\s?${NUM}|${NUM}\\s?${AFTER}`, 'i').exec(s) ?? new RegExp(`^\\D{0,2}${NUM}\\D{0,4}$`).exec(s);
  const raw = m?.[1] ?? m?.[2];
  if (!raw) return null;
  const n = Number(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Minutes past midnight from a time as written: "08:15", "8.15 pm", "20h45", "9 am". Null for a bare number or anything else. */
export function minutesOf(t: string): number | null {
  const m = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?\s*$/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase()[0];
  if (!m[2] && !ap) return null;
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'p' && h !== 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
  }
  if (h === 24 && min === 0) h = 0;
  if (h > 23) return null;
  return h * 60 + min;
}

export interface EasyPrice {
  id: string;
  name: string;
  section: string;
  value: string;
  n: number;
  tags: string[];
}
export interface EasyGlance {
  /** what it is drawn as: its prices as bars, its times on a line, its steps in order — or nothing */
  kind: 'prices' | 'times' | 'steps' | null;
  prices: EasyPrice[];
  times: (EasyTime & { minutes: number | null })[];
  steps: string[];
}

/** What there is to draw, decided from what was read: two prices or more are bars; else two times a line; else two steps a sequence. */
export function glanceOf(s: Pick<EasyState, 'sections' | 'times' | 'steps'>): EasyGlance {
  const prices: EasyPrice[] = [];
  for (const sec of s.sections) {
    for (const it of sec.items) {
      const n = priceOf(it.value);
      if (n !== null) prices.push({ id: it.id, name: it.name, section: sec.title, value: it.value ?? '', n, tags: it.tags ?? [] });
    }
  }
  const times = s.times.map((t) => ({ ...t, minutes: minutesOf(t.time) }));
  const kind = prices.length >= 2 ? 'prices' : times.filter((t) => t.minutes !== null).length >= 2 ? 'times' : s.steps.length >= 2 ? 'steps' : null;
  return { kind, prices, times, steps: s.steps };
}

/** The next time on a timetable from a moment in the day (minutes past midnight): the first one at or after it, else none today. */
export function nextTime(times: readonly { minutes: number | null }[], now: number): number {
  let best = -1;
  times.forEach((t, i) => {
    if (t.minutes === null || t.minutes < now) return;
    if (best < 0 || (t.minutes as number) < (times[best].minutes as number)) best = i;
  });
  return best;
}

/** Every tag on it, in the order first met — what the person can show only. */
export function tagsOf(s: Pick<EasyState, 'sections'>): string[] {
  const out: string[] = [];
  for (const sec of s.sections) for (const it of sec.items) for (const t of it.tags ?? []) if (!out.includes(t)) out.push(t);
  return out;
}

const itemCount = (s: Pick<EasyState, 'sections'>) => s.sections.reduce((n, x) => n + x.items.length, 0);

/** "23 items", "4 steps", "6 times" — what it holds, in a few words. */
export function easyShape(s: EasyState): string {
  const n = itemCount(s);
  const parts = [
    n ? `${n} ${n === 1 ? 'item' : 'items'}` : '',
    s.times.length ? `${s.times.length} ${s.times.length === 1 ? 'time' : 'times'}` : '',
    s.steps.length ? `${s.steps.length} ${s.steps.length === 1 ? 'step' : 'steps'}` : '',
  ].filter(Boolean);
  return `${parts.join(', ') || 'what it says'} · ${EASY_KIND_WORD[s.kind]}`;
}

/** What is read aloud, in order: a line each — what it is, any warning, the facts, then everything on it. */
export function easySpoken(s: EasyState): string[] {
  const lines: string[] = [s.title];
  if (s.summary) lines.push(s.summary);
  for (const w of s.warnings) lines.push(`Note: ${w}`);
  for (const f of s.facts) lines.push(`${f.label}: ${f.value}.`);
  for (const sec of s.sections) {
    if (sec.title) lines.push(sec.title);
    for (const it of sec.items) lines.push(itemSpoken(it));
  }
  s.steps.forEach((st, i) => lines.push(`Step ${i + 1}: ${st}`));
  for (const t of s.times) lines.push(t.label ? `${t.time}: ${t.label}.` : `${t.time}.`);
  return lines;
}

/** One line of it, as it is read aloud: its name, its price, what is in it, what it is marked. */
export function itemSpoken(it: EasyItem): string {
  return [it.name + (it.value ? `, ${it.value}` : '') + '.', it.detail ? `${it.detail}.` : '', it.tags?.length ? `${it.tags.join(', ')}.` : ''].filter(Boolean).join(' ');
}

/** It written out as text — for a model that cannot see the figure, and for the photo's reading in the conversation. */
export function easyText(s: EasyState, max = 4000): string {
  const out: string[] = [`EASY VIEW “${s.title}” — a photo of a ${EASY_KIND_WORD[s.kind]}, as read.`];
  if (s.summary) out.push(s.summary);
  for (const w of s.warnings) out.push(`Warning: ${w}`);
  for (const f of s.facts) out.push(`${f.label}: ${f.value}`);
  for (const sec of s.sections) {
    if (sec.title) out.push(`${sec.title}:`);
    for (const it of sec.items) out.push(`- ${it.name}${it.value ? ` — ${it.value}` : ''}${it.detail ? ` (${it.detail})` : ''}${it.tags?.length ? ` [${it.tags.join(', ')}]` : ''}`);
  }
  s.steps.forEach((st, i) => out.push(`${i + 1}. ${st}`));
  for (const t of s.times) out.push(`${t.time}${t.label ? ` — ${t.label}` : ''}`);
  if (s.unclear.length) out.push(`Could not be read: ${s.unclear.join('; ')}`);
  const text = out.join('\n');
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** What Socria says in the conversation once it is made: what it is, and how to make it easier still. */
export function easySaid(s: EasyState): string {
  const g = glanceOf(s);
  const lo = g.prices.length ? g.prices.reduce((a, b) => (b.n < a.n ? b : a)) : null;
  const hi = g.prices.length ? g.prices.reduce((a, b) => (b.n > a.n ? b : a)) : null;
  const range = lo && hi && lo.n !== hi.n ? ` Prices run from ${lo.value} to ${hi.value}.` : '';
  const shape = easyShape(s).split(' · ')[0];
  const left = s.unclear.length ? ` Some of it could not be read: ${s.unclear.map((u) => u.replace(/[.;:!]+$/, '')).join('; ')}.` : '';
  return `Here is the ${EASY_KIND_WORD[s.kind]} in large print — **${s.title}**, ${shape}.${range} Make the words bigger with **A+**, switch on **High contrast**, or press **Read it to me** to hear it.${left}`.slice(
    0,
    600
  );
}

// ── the kind ─────────────────────────────────────────────────────────

const views: ViewDecl<EasyState>[] = [
  {
    id: 'read',
    label: 'Read it',
    shows: 'everything on it, large and clear, in its own order',
    primary: true,
    interactions: ['make the words bigger or smaller', 'high contrast', 'read it aloud', 'press a line to hear it', 'show only what is marked (vegetarian, …)'],
  },
  {
    id: 'glance',
    label: 'At a glance',
    shows: 'its prices as bars, its times on a line, or its steps in order',
    interactions: ['press a bar to hear it', 'see the next time'],
    unavailable: (s) => (glanceOf(s).kind ? null : 'There is nothing on it to draw — no prices, times or steps.'),
  },
];

type S = EasyState;
export const EASY_OPS = { ...headOps<S>(views, sanitizeEasy) };

const VIEW_WORDS: Record<string, string[]> = { read: ['read it', 'large print', 'big print', 'list', 'text'], glance: ['at a glance', 'glance', 'bars', 'diagram', 'chart', 'picture'] };

export const EASY = displayKind<S>({
  kind: 'easy',
  label: 'Easy view',
  sanitize: sanitizeEasy,
  ops: EASY_OPS,
  readOp: (text) => {
    const v = readView(text, views, VIEW_WORDS);
    return v ? { op: 'view', args: { view: v } } : null;
  },
  facts: (s) => [
    `${s.title}: an easy view of a photo the person took — a ${EASY_KIND_WORD[s.kind]}, ${easyShape(s).split(' · ')[0]} — shown large and clear, as its ${views.find((v) => v.id === s.view)?.label.toLowerCase() ?? s.view}.`,
    'What it says is given below as text: answer from it, keep prices and times exactly as written, and say so when a line could not be read rather than guessing.',
  ],
  text: (s) => easyText(s),
  parts: (s): Part[] => s.sections.flatMap((sec) => sec.items.map((it) => ({ id: it.id, label: it.name }))),
  views,
  // a whole menu is a large state, and only its name and its view ever change
  maxStates: 4,
  argLimits: { count: 4, length: 80 },
  size: (_s, mode) => (mode === 'card' ? { w: 280, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 720, h: 760 }),
  shape: easyShape,
});

/** An example: a café menu, for the preview on Make's card (never shown to the proposal pass: the kind is internal). */
export const EASY_EXAMPLE = {
  title: 'The Corner Café',
  view: 'read',
  kind: 'menu',
  summary: 'A café menu with breakfast and lunch.',
  sections: [
    {
      title: 'Breakfast',
      items: [
        { name: 'Porridge with honey', value: '$4.50', tags: ['vegetarian'] },
        { name: 'Eggs on toast', detail: 'two eggs, any style', value: '$6.00' },
      ],
    },
    {
      title: 'Lunch',
      items: [
        { name: 'Tomato soup', detail: 'with warm bread', value: '$5.50', tags: ['vegetarian'] },
        { name: 'Fish and chips', value: '$12.50' },
      ],
    },
  ],
  facts: [{ label: 'Open', value: 'Mon–Sat, 8 am – 4 pm' }],
  steps: [],
  times: [],
  warnings: ['Ask us about allergies.'],
  unclear: [],
};

export const EASY_META: DisplayMeta = {
  kind: 'easy',
  noun: 'easy view',
  handle: 'Easy',
  about:
    'A photo — a menu, a label, a timetable, a letter — shown large, clear and simple: big type, high contrast, read aloud, and its prices, times or steps drawn plainly. Made by taking or choosing a photo.',
  internal: true,
  madeFrom: 'made from your photo',
  example: EASY_EXAMPLE,
  tell: () =>
    'An EASY VIEW display is a photo the person took — a menu, a label, a timetable — read once and shown large and clear for easy reading. What it says reaches you as its text: answer from that, keep prices and times exactly as written, never add what is not on it, and say plainly when a line could not be read.',
};

register(EASY);
registerDisplay(EASY_META);
