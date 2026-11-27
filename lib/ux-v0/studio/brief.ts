// lib/ux-v0/studio/brief.ts — what SocriaUX understands about the work while it is being discussed, and the visual aids
// it may show to help someone say what they want.
//
// The creative brief is internal: never shown as a form. It keeps the person's own words (what it is, what it is for,
// who for, the words to set, how it should feel), and separates what they asked for outright from what the context
// strongly implies, from SocriaUX's own tentative reading, and from what they turned down — so a guess is never handed
// to the designer as a requirement, and a rejected idea never comes back. What they picked from an aid (a palette, a
// pairing of typefaces, a mood) is kept apart, as a picture of their taste, never as a layout to copy.
//
// Aids are compact: a few palettes in real colours, a few pairings of faces SocriaUX actually serves, or a few moods
// (each a palette, a face and a line saying what it would look like). Everything here is held to its shape and size;
// nothing in it is trusted to be a colour, a face or a length until it has been checked.

import { FONTS } from '../fonts';

export interface Palette {
  name: string;
  note: string;
  /** 3–5 colours: the ground first, then an ink that reads on it, then an accent, then support colours */
  colours: string[];
}

export interface TypePair {
  name: string;
  note: string;
  /** a face from the font library, for display */
  display: string;
  /** a face from the font library that sets text */
  body: string;
  weight?: number;
  upper?: boolean;
}

export interface Mood {
  name: string;
  /** what it would look like, in a line */
  note: string;
  /** ground, ink, accent (and one support) */
  colours: string[];
  display: string;
}

export type Aid =
  | { kind: 'palettes'; options: Palette[] }
  | { kind: 'type'; options: TypePair[]; sample: string }
  | { kind: 'moods'; options: Mood[]; sample: string };

export type AidKind = Aid['kind'];
export const AID_KINDS: readonly AidKind[] = ['palettes', 'type', 'moods'];

export interface CreativeBrief {
  /** what is being made, in plain words ("a poster", "a set of launch posts") */
  kind: string;
  /** what it is for */
  purpose: string;
  /** who it is for */
  audience: string;
  /** the words to set in it, exactly as the person gave them (empty when none were given) */
  content: string;
  /** how it should feel, in the person's own words */
  feel: string;
  /** what the person asked for outright */
  explicit: string[];
  /** what the context strongly implies */
  implied: string[];
  /** SocriaUX's own reading, not confirmed — the designer may change it freely */
  tentative: string[];
  /** what the person turned down or wants kept out */
  avoid: string[];
  /** links, pictures, named influences */
  references: string[];
  /** what is still unclear */
  open: string[];
  /** picked from an aid: a picture of their taste, not a layout */
  chosen: { palette?: Palette; type?: TypePair; mood?: Mood };
}

/** The question waiting: its words, an aid when seeing would help, and at most three short replies. */
export interface Ask {
  text: string;
  aid: Aid | null;
  suggestions: string[];
}

export const BRIEF_LIMITS = { line: 300, field: 600, content: 1200, list: 10 } as const;
export const MAX_QUESTIONS = 5;

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]+/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n) : '');
const list = (v: unknown, n: number = BRIEF_LIMITS.list, len: number = BRIEF_LIMITS.line) => [...new Set((Array.isArray(v) ? v : []).map((x) => s(x, len)).filter(Boolean))].slice(0, n);

export const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : null);

const FACE = new Map(FONTS.map((f) => [f.name.toLowerCase(), f]));
/** A face the library serves, by its exact name (any case); null otherwise. */
export const faceNamed = (v: unknown) => (typeof v === 'string' ? FACE.get(v.trim().toLowerCase()) ?? null : null);
const textFace = (v: unknown) => {
  const f = faceNamed(v);
  return f && !f.displayOnly ? f : null;
};

// ── colour readability (the aid shows real colours; an ink that cannot be read on its ground is not offered) ──

const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Colours put in order — ground, then the most readable ink on it — or null when no ink reaches 4.5:1. */
export function readableOrder(colours: readonly string[]): string[] | null {
  const cs = [...new Set(colours.map(hex).filter((c): c is string => !!c))].slice(0, 5);
  if (cs.length < 3) return null;
  const ground = cs[0];
  const rest = cs.slice(1);
  const best = [...rest].sort((a, b) => contrast(ground, b) - contrast(ground, a))[0];
  if (contrast(ground, best) >= 4.5) return [ground, best, ...rest.filter((c) => c !== best)];
  // the ground may be the wrong one: the most readable pair leads
  let pair: [string, string] | null = null;
  let top = 0;
  for (const a of cs) for (const b of cs) if (a !== b && contrast(a, b) > top) (top = contrast(a, b)), (pair = [a, b]);
  if (!pair || top < 4.5) return null;
  return [pair[0], pair[1], ...cs.filter((c) => c !== pair![0] && c !== pair![1])];
}

export function normalizePalette(v: unknown): Palette | null {
  const r = o(v);
  const colours = readableOrder(Array.isArray(r.colours) ? r.colours : [r.ground, r.ink, r.accent, ...(Array.isArray(r.support) ? r.support : [])]);
  const name = s(r.name, 40);
  if (!colours || !name) return null;
  return { name, note: s(r.note, 160), colours };
}

export function normalizeTypePair(v: unknown): TypePair | null {
  const r = o(v);
  const display = faceNamed(r.display);
  const body = textFace(r.body) ?? (display && !display.displayOnly ? display : null);
  const name = s(r.name, 40);
  if (!display || !body || !name) return null;
  const w = Number(r.weight);
  return { name, note: s(r.note, 160), display: display.name, body: body.name, ...(Number.isFinite(w) && w >= 100 && w <= 900 ? { weight: Math.round(w / 100) * 100 } : {}), ...(r.upper === true ? { upper: true } : {}) };
}

export function normalizeMood(v: unknown): Mood | null {
  const r = o(v);
  const colours = readableOrder(Array.isArray(r.colours) ? r.colours : []);
  const display = faceNamed(r.display);
  const name = s(r.name, 40);
  if (!colours || !display || !name) return null;
  return { name, note: s(r.note, 180), colours: colours.slice(0, 4), display: display.name };
}

/** An aid held to shape: two to four options that are all real; null when fewer than two survive. */
export function normalizeAid(v: unknown): Aid | null {
  const r = o(v);
  const kind = AID_KINDS.includes(r.kind) ? (r.kind as AidKind) : null;
  if (!kind) return null;
  const pick = <T>(xs: unknown, f: (x: unknown) => T | null) => {
    const out = (Array.isArray(xs) ? xs : []).map(f).filter((x): x is T => !!x);
    const seen = new Set<string>();
    return out.filter((x) => (seen.has((x as { name: string }).name.toLowerCase()) ? false : (seen.add((x as { name: string }).name.toLowerCase()), true))).slice(0, 4);
  };
  const sample = s(r.sample, 40) || 'Aa';
  if (kind === 'palettes') {
    const options = pick(r.options ?? r.palettes, normalizePalette);
    return options.length >= 2 ? { kind, options } : null;
  }
  if (kind === 'type') {
    const options = pick(r.options ?? r.faces, normalizeTypePair);
    return options.length >= 2 ? { kind, options, sample } : null;
  }
  const options = pick(r.options ?? r.moods, normalizeMood);
  return options.length >= 2 ? { kind, options, sample } : null;
}

export function normalizeAsk(v: unknown): Ask | null {
  const r = o(v);
  const text = s(r.text, 400);
  if (text.length < 4) return null;
  return { text, aid: r.aid ? normalizeAid(r.aid) : null, suggestions: list(r.suggestions, 3, 80) };
}

export function emptyBrief(kind = ''): CreativeBrief {
  return { kind, purpose: '', audience: '', content: '', feel: '', explicit: [], implied: [], tentative: [], avoid: [], references: [], open: [], chosen: {} };
}

/** A brief held to shape and size (null when there is nothing in it at all). */
export function normalizeCreativeBrief(v: unknown): CreativeBrief | null {
  if (!v || typeof v !== 'object') return null;
  const r = o(v);
  const c = o(r.chosen);
  const chosen: CreativeBrief['chosen'] = {};
  const pal = c.palette ? normalizePalette(c.palette) : null;
  const typ = c.type ? normalizeTypePair(c.type) : null;
  const mood = c.mood ? normalizeMood(c.mood) : null;
  if (pal) chosen.palette = pal;
  if (typ) chosen.type = typ;
  if (mood) chosen.mood = mood;
  return {
    kind: s(r.kind, 120),
    purpose: s(r.purpose, BRIEF_LIMITS.field),
    audience: s(r.audience, BRIEF_LIMITS.line),
    content: typeof r.content === 'string' ? r.content.replace(/\u0000/g, '').trim().slice(0, BRIEF_LIMITS.content) : '',
    feel: s(r.feel, BRIEF_LIMITS.field),
    explicit: list(r.explicit),
    implied: list(r.implied),
    tentative: list(r.tentative),
    avoid: list(r.avoid),
    references: list(r.references, 8),
    open: list(r.open, 6),
    chosen,
  };
}

/** What a choice says, in words (for the conversation and the designer). */
export function choiceWords(kind: AidKind, x: Palette | TypePair | Mood): string {
  if (kind === 'palettes') {
    const p = x as Palette;
    return `${p.name} — ${p.colours.join(', ')}`;
  }
  if (kind === 'type') {
    const t = x as TypePair;
    return `${t.name} — ${t.display}${t.body !== t.display ? ` with ${t.body}` : ''}`;
  }
  const m = x as Mood;
  return `${m.name} — ${m.note}`;
}
