// lib/ux-v0/tells.ts — the looks that read as generated: named, detected, and kept out unless asked for.
//
// Generated design clusters around a few looks. Each is a TELL: a combination
// of choices, not one choice. Cream alone is fine; cream with a serif headline
// and a terracotta accent is the look. They are:
//
//   cream-serif-terracotta   a warm cream ground, a serif display face, a terracotta accent
//   black-acid-pop           a near-black ground with one acid-green or vermilion accent and nothing else
//   hairline-columns         newspaper hairline rules boxing every part, numbered sections, dense columns
//   purple-blue-gradient     a purple-to-blue gradient opening on white
//   emoji-markers            emoji as section markers
//   all-centred              everything centred
//   rounded-everything       rounded corners on every box
//   accent-rail-cards        an accent bar down the side of rounded cards
//
// They are detected on a direction before anything is generated, on a
// design's spec, and on its rendered page (the audit's counts). They are kept
// out wherever nobody asked for them: the engine revises a direction that
// shows one (lib/ux-v0/direction.ts), a brief whose proposed palette shows
// one says so (app/api/ux-v0/brief), and the evaluation reports one in a
// design with its fix (lib/ux-v0/evaluate.ts). What the designer asked for is
// theirs: their words, their brief's decisions, a palette they locked.

import { hslOf } from './color';
import { knownFont } from './fonts';
import type { DesignTokens, Look } from './spec';

export const TELLS = ['cream-serif-terracotta', 'black-acid-pop', 'hairline-columns', 'purple-blue-gradient', 'emoji-markers', 'all-centred', 'rounded-everything', 'accent-rail-cards'] as const;
export type Tell = (typeof TELLS)[number];

export const TELL_LABEL: Record<Tell, string> = {
  'cream-serif-terracotta': 'warm cream with a serif headline and a terracotta accent',
  'black-acid-pop': 'near-black with a single acid-green or vermilion accent',
  'hairline-columns': 'newspaper hairline rules around every part, with numbered sections',
  'purple-blue-gradient': 'a purple-to-blue gradient opening on white',
  'emoji-markers': 'emoji as section markers',
  'all-centred': 'everything centred',
  'rounded-everything': 'rounded corners on every box',
  'accent-rail-cards': 'an accent bar down the side of rounded cards',
};

/** The tells that are about colour and type: a palette and type pair the designer set make them theirs. */
export const COLOUR_TELLS: readonly Tell[] = ['cream-serif-terracotta', 'black-acid-pop', 'purple-blue-gradient'];

export interface StyleCounts {
  gradients: number;
  roundedBoxes: number;
  centred: number;
  blocks: number;
  emoji: number;
  /** boxes with an accent bar down one side */
  rails?: number;
}

/** What a look is made of, wherever it comes from: a direction, a spec, a rendered page. */
export interface LookProfile {
  colors: Pick<DesignTokens['colors'], 'background' | 'accent'>;
  fonts: Pick<DesignTokens['fonts'], 'display'>;
  radius: DesignTokens['radius'];
  look: Pick<Look, 'align' | 'grid' | 'containers' | 'rules' | 'motifs'> & { accent2?: string };
  /** the sections' words, for emoji used as markers */
  sections?: readonly { kind: string; content?: Record<string, unknown> }[];
  /** the rendered page's counts, when it was measured */
  style?: StyleCounts | null;
}

export interface TellHit {
  tell: Tell;
  label: string;
  /** what was seen, in words */
  evidence: string;
}

// ── colours, in the terms the tells use ──────────────────────────────

/** A warm light ground: cream, ivory, sand, peach (not white, not a grey). */
export function warmLight(hex: string): boolean {
  const [h, s, l] = hslOf(hex);
  return h >= 12 && h <= 65 && s >= 0.1 && l >= 0.86 && l <= 0.975;
}
/** Terracotta, rust, burnt orange, tan: the accent that goes with cream. */
export function terracotta(hex: string): boolean {
  const [h, s, l] = hslOf(hex);
  return h >= 5 && h <= 38 && s >= 0.3 && l >= 0.26 && l <= 0.64;
}
export function nearBlack(hex: string): boolean {
  const [, s, l] = hslOf(hex);
  return l <= 0.09 || (l <= 0.13 && s <= 0.3);
}
/** The lone pop on black: an acid green or a vermilion. */
export function acidOrVermilion(hex: string): boolean {
  const [h, s, l] = hslOf(hex);
  const acid = h >= 65 && h <= 160 && s >= 0.55 && l >= 0.38 && l <= 0.74;
  const vermilion = (h <= 22 || h >= 350) && s >= 0.6 && l >= 0.4 && l <= 0.66;
  return acid || vermilion;
}
const purpleBlue = (hex: string) => {
  const [h, s] = hslOf(hex);
  return h >= 225 && h <= 295 && s >= 0.35;
};

// emoji, as a marker at the start of a title or a list item
const EMOJI_START = /^\s*(?:[☀-➿]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF])/;

function emojiMarkers(sections: LookProfile['sections']): number {
  let n = 0;
  for (const s of sections ?? []) {
    const c = s.content ?? {};
    const heads = [c.title, c.eyebrow, ...(Array.isArray(c.items) ? (c.items as any[]).map((i) => i?.title ?? i?.icon) : [])];
    n += heads.filter((t) => typeof t === 'string' && EMOJI_START.test(t)).length;
  }
  return n;
}

/** The tells a look shows, with what was seen. */
export function tellsOf(p: LookProfile): TellHit[] {
  const out: TellHit[] = [];
  const hit = (tell: Tell, evidence: string) => out.push({ tell, label: TELL_LABEL[tell], evidence });
  const serif = knownFont(p.fonts.display)?.kind === 'serif';
  const { background: bg, accent } = p.colors;
  if (warmLight(bg) && serif && terracotta(accent)) hit('cream-serif-terracotta', `a ${bg} ground, ${p.fonts.display} headlines and a ${accent} accent`);
  if (nearBlack(bg) && acidOrVermilion(accent) && !p.look.accent2) hit('black-acid-pop', `a ${bg} ground with one ${accent} accent`);
  const columns = p.look.grid === 'editorial' || p.look.grid === 'swiss';
  if (p.look.rules === 'hairline' && p.look.containers === 'ruled' && (p.look.motifs.includes('numbering') || columns)) hit('hairline-columns', `hairline rules around every part${p.look.motifs.includes('numbering') ? ', numbered sections' : ''}`);
  const st = p.style;
  if (st && st.gradients > 0 && purpleBlue(accent) && hslOf(bg)[2] >= 0.95) hit('purple-blue-gradient', `${st.gradients} gradient${st.gradients > 1 ? 's' : ''} with a ${accent} accent on white`);
  const marks = emojiMarkers(p.sections) + (st?.emoji ?? 0);
  if (marks > 0) hit('emoji-markers', `${marks} emoji used as marker${marks > 1 ? 's' : ''}`);
  const centredText = st && st.blocks > 8 && st.centred / st.blocks > 0.6;
  if ((p.look.align === 'center' && p.look.grid === 'centered') || centredText) hit('all-centred', centredText ? `${st!.centred} of ${st!.blocks} text blocks centred` : 'a centred grid with centred text');
  if ((p.radius === 'round' && p.look.containers === 'cards') || (st && st.roundedBoxes >= 6)) hit('rounded-everything', st && st.roundedBoxes >= 6 ? `${st.roundedBoxes} rounded boxes` : 'round corners on cards everywhere');
  if (st && (st.rails ?? 0) >= 2) hit('accent-rail-cards', `${st.rails} cards with an accent bar`);
  return out;
}

// ── what the designer asked for ──────────────────────────────────────

const NEG = /\b(no|not|never|avoid|without|less|nothing|instead of|rather than|don'?t|do not|hate|dislike)\b[\w\s,'-]{0,24}$/;

/** A phrase said, and not as something to avoid ("no gradients", "not centred"). */
function said(words: string, re: RegExp): boolean {
  const g = new RegExp(re.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = g.exec(words))) {
    if (!NEG.test(words.slice(Math.max(0, m.index - 40), m.index))) return true;
  }
  return false;
}

export interface AskContext {
  /** the alignment the designer decided (brief.layout.align) */
  align?: string;
  /** the corners the designer set (brief.spec.corners) */
  corners?: string;
  /** the palette and type pair are the designer's (kept from their brief, or locked) */
  ownColours?: boolean;
}

/** The tells the designer asked for, in their words or their decisions: those stay. */
export function askedTells(words: string, ctx: AskContext = {}): Set<Tell> {
  const w = ` ${String(words ?? '').toLowerCase().replace(/\s+/g, ' ')} `;
  const out = new Set<Tell>();
  if (said(w, /\b(cream|ivory|beige|oat|oatmeal|parchment|linen|sand|ecru)\b/) && said(w, /\b(terracotta|rust|clay|burnt orange|sienna|copper|ochre)\b/)) out.add('cream-serif-terracotta');
  if (said(w, /\b(neon|acid|electric|fluorescent|lime|vermilion|signal (red|green|orange))\b/) && said(w, /\b(black|dark|night)\b/)) out.add('black-acid-pop');
  if (said(w, /\b(newspaper|broadsheet|newsprint|hairlines?|hairline rules|ruled columns)\b/)) out.add('hairline-columns');
  if (said(w, /\bgradients?\b/)) out.add('purple-blue-gradient');
  if (said(w, /\bemoji\b/)) out.add('emoji-markers');
  if (ctx.align === 'center' || said(w, /\b(centred|centered|symmetric(al)?)\b/)) out.add('all-centred');
  if (ctx.corners === 'round' || said(w, /\b(rounded|round corners|pills?|bubbly|soft corners)\b/)) out.add('rounded-everything');
  if (said(w, /\b(accent|coloured|colored) (bars?|rails?|stripes?)\b/)) out.add('accent-rail-cards');
  if (ctx.ownColours) for (const t of COLOUR_TELLS) out.add(t);
  return out;
}

/** The tells a look shows that nobody asked for. */
export function unaskedTells(p: LookProfile, words: string, ctx: AskContext = {}): TellHit[] {
  const asked = askedTells(words, ctx);
  return tellsOf(p).filter((h) => !asked.has(h.tell));
}

/** The tells as a line for a model's prompt: what not to do unless the designer asked. */
export function tellsRule(): string {
  return `Do not fall into the looks generated pages share unless the designer asked for one: ${TELLS.map((t) => TELL_LABEL[t]).join('; ')}.`;
}

/**
 * A proposed brief's palette and headline face, read for the colour tells the designer's own words did not ask for.
 * The brief is the designer's to approve, so it is said (as a question still open), not changed behind them.
 */
export function briefTells(b: { palette: readonly { hex: string; role: string }[]; typography: { display: string } }, words: string): TellHit[] {
  const bg = b.palette.find((p) => p.role === 'background')?.hex;
  const accent = b.palette.find((p) => p.role === 'accent')?.hex;
  if (!bg || !accent) return [];
  const p: LookProfile = { colors: { background: bg, accent }, fonts: { display: b.typography.display }, radius: 'soft', look: { align: 'left', grid: 'stack', containers: 'open', rules: 'none', motifs: [] } };
  return unaskedTells(p, words).filter((h) => COLOUR_TELLS.includes(h.tell));
}

/** The open question a brief carries for a tell in its proposed palette. */
export function tellQuestion(h: TellHit): string {
  return `The proposed palette is ${h.label}, a look many generated pages share. Keep it if it is what you want, or say what to change.`;
}
