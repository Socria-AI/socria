// lib/ux-v0/references.ts — what the moodboard means, not just what it holds.
//
// References define a project's atmosphere; they are not assets to paste into
// the page. Each one says what to take from it (its typography, its light, its
// composition, its pacing…) and what to leave, in chips or in the designer's
// own words ("I love this typography, not the palette"; "the architectural
// atmosphere, not the building itself"; "the movement, not the styling"),
// which are read here. Some are things to steer away from; a few are key.
// Only a picture marked as content may be placed in the design.
//
// readBoard() turns the board into inputs the direction engine and the model
// can use: the designer's words (only theirs: never a library's titles),
// what to avoid, colours sampled from references kept for their colour, a
// motion feel from references kept for their movement, and typographic and
// compositional preferences. Explicit requirements in the brief, approved
// decisions, accessibility and function outrank all of it.

import { readMotionWords } from './motion';
import type { Look, Motion } from './spec';
import { REF_ASPECTS, type Moodboard, type MoodboardRef, type RefAspect } from './types';
import { contrastRatio } from '../ux/audit';
import { hslOf, isDark } from './color';

export const ASPECT_LABEL: Record<RefAspect, string> = {
  atmosphere: 'Atmosphere',
  colour: 'Colour',
  typography: 'Typography',
  composition: 'Composition',
  imagery: 'Subject',
  texture: 'Texture',
  motion: 'Movement',
};

const LEXICON: Record<RefAspect, RegExp> = {
  atmosphere: /\b(atmosphere|atmospheric|mood|moods|feeling|feel|vibe|vibes|ambien(ce|t)|light|lighting|energy|spirit|tone)\b/,
  colour: /\b(colou?rs?|palette|palettes|tones|hues?|tints?|shades)\b/,
  typography: /\b(typography|type|typeface|typefaces|fonts?|lettering|letterforms|headlines?|serifs?|sans)\b/,
  composition: /\b(composition|layout|layouts|grid|grids|structure|spacing|arrangement|framing|whitespace|white space|proportions?|asymmetry)\b/,
  imagery: /\b(subject|building|buildings|object|objects|product|people|person|photograph|photography|photo|photos|illustration|depict|the thing itself|itself|literal|literally)\b/,
  texture: /\b(texture|textures|material|materials|grain|paper|surface|surfaces|finish)\b/,
  motion: /\b(motion|movement|moves|moving|animation|animations|pacing|pace|rhythm|transitions?|kinetic)\b/,
};
const STYLING = /\b(visual styling|styling|style|look)\b/;

/**
 * Read a note on a reference. Clauses joined by "but", "not", commas and the
 * like are read one by one; a clause that negates ("not the palette", "ignore
 * the colours", "without the building") leaves what it names, the rest takes it.
 */
export function interpretNote(note: string): { take: RefAspect[]; leave: RefAspect[]; avoid: boolean; key: boolean } {
  const n = ` ${note.toLowerCase().replace(/[’']/g, "'")} `;
  const take = new Set<RefAspect>();
  const leave = new Set<RefAspect>();
  const avoid = /\b(avoid this|nothing like this|not like this|steer away|hate this|don't want this|do not want this|the opposite of this)\b/.test(n);
  const key = /\b(entire|whole|everything|all of it)\b[^.]{0,40}?\b(feel|look)s? like\b|\bkey reference\b|\bmost important\b|\bthis is (it|the one)\b/.test(n);
  if (key) take.add('atmosphere');
  // split into clauses at contrastive joins, keeping the joining word with what follows
  const clauses = n.split(/(?=\b(?:but|not|no|without|except|ignore|rather than|instead of|apart from)\b)|[,;.]/);
  for (const c of clauses) {
    const negated = /^\s*(but\s+)?(not|no|without|except|ignore|rather than|instead of|apart from)\b|\b(don't|do not|doesn't|never) (like|love|want|use)\b|\bhate\b/.test(c);
    let hit = false;
    for (const a of REF_ASPECTS) {
      if (!LEXICON[a].test(c)) continue;
      hit = true;
      (negated ? leave : take).add(a);
    }
    if (STYLING.test(c) && negated) for (const a of ['colour', 'typography', 'texture'] as const) leave.add(a);
  }
  for (const a of leave) take.delete(a);
  return { take: [...take], leave: [...leave], avoid, key };
}

/** A picture the design may show: kept, a still image, and marked as content (or kept before the distinction). */
export function isContent(r: MoodboardRef): boolean {
  return r.state === 'kept' && r.media !== 'video' && !r.avoid && r.asContent !== false && (r.provider !== 'upload' || r.asContent === true);
}
export const contentRefs = (b: Moodboard): MoodboardRef[] => b.refs.filter(isContent);
export const inspirationRefs = (b: Moodboard): MoodboardRef[] => b.refs.filter((r) => r.state === 'kept' && !r.avoid);
export const avoidRefs = (b: Moodboard): MoodboardRef[] => b.refs.filter((r) => r.avoid && r.state !== 'rejected');

/** What is taken from a reference: its chips, else what its note says, else its atmosphere. */
export function takenFrom(r: MoodboardRef): { take: RefAspect[]; leave: RefAspect[] } {
  if (r.take?.length || r.leave?.length) return { take: r.take ?? [], leave: r.leave ?? [] };
  if (r.note) {
    const n = interpretNote(r.note);
    if (n.take.length || n.leave.length) return { take: n.take, leave: n.leave };
  }
  return { take: ['atmosphere'], leave: [] };
}

export interface BoardReading {
  /** the designer's own words about what they keep (key references count twice) */
  words: string;
  /** what to steer away from */
  avoid: string;
  /** colours sampled from references kept for their colour, most present first */
  colours: string[];
  /** where those colours came from */
  colourFrom: string[];
  motion?: Motion['feel'];
  parallax?: boolean;
  serif?: boolean;
  grid?: Look['grid'];
  density?: 'airy' | 'dense';
  /** the pictures SocriaUX made for the moodboard, by kind (contour, orbit, lattice…): they lean the design's shapes */
  art?: string[];
  /** how many references were read, of which key */
  read: number;
  keys: number;
  /** what was read, said plainly ("type from “Spread”", "steering away from 2") */
  said: string[];
}

export const EMPTY_READING: BoardReading = { words: '', avoid: '', colours: [], colourFrom: [], read: 0, keys: 0, said: [] };

const COMPOSITION_WORDS: [RegExp, Look['grid']][] = [
  [/\b(asymmetr(y|ic|ical)|off-?cent(re|er)|offset)\b/, 'asymmetric'],
  [/\b(swiss|strict grid|column grid|modular grid|international style)\b/, 'swiss'],
  [/\b(poster|full-?bleed|huge type|giant type)\b/, 'poster'],
  [/\b(cent(re|er)d|symmetric(al)?)\b/, 'centered'],
  [/\b(editorial|magazine|side column|margin notes)\b/, 'editorial'],
  [/\b(bento|modular|tiles|mosaic)\b/, 'modular'],
];

export function readBoard(board: Moodboard | null | undefined): BoardReading {
  if (!board) return { ...EMPTY_READING };
  const liked = inspirationRefs(board);
  const avoiding = avoidRefs(board);
  const words: string[] = [];
  const colours: string[] = [];
  const colourFrom: string[] = [];
  const said: string[] = [];
  let typeFrom = '';
  let motionText = '';
  let layoutText = '';
  // key references first: they lead
  for (const r of [...liked].sort((a, b) => Number(!!b.key) - Number(!!a.key))) {
    const { take, leave } = takenFrom(r);
    if (r.note) {
      words.push(r.note);
      if (r.key) words.push(r.note);
    }
    if (take.includes('colour') && !leave.includes('colour') && r.swatches?.length) {
      colours.push(...r.swatches.slice(0, 4));
      colourFrom.push(r.title || 'a reference');
    }
    if (take.includes('typography') && !leave.includes('typography')) {
      typeFrom ||= r.title || 'a reference';
      words.push(r.note ?? '');
    }
    if (take.includes('motion')) motionText += ` ${r.note ?? ''} ${r.media === 'video' ? 'motion' : ''}`;
    if (take.includes('composition')) layoutText += ` ${r.note ?? ''}`;
  }
  const all = words.join('. ').toLowerCase();
  const out: BoardReading = {
    words: words.filter(Boolean).join('. ').slice(0, 1200),
    avoid: avoiding.map((r) => r.note || '').filter(Boolean).join('. ').slice(0, 400),
    colours: [...new Set(colours)].slice(0, 8),
    colourFrom,
    read: liked.length + avoiding.length,
    keys: liked.filter((r) => r.key).length,
    said,
  };
  const art = [...new Set(board.refs.filter((r) => r.provider === 'socriaux' && r.state !== 'rejected' && r.proc).map((r) => String(r.proc!.kind)))];
  if (art.length) out.art = art.slice(0, 6);
  const mo = readMotionWords(motionText || all);
  if (mo.feel) out.motion = mo.feel;
  if (mo.parallax !== undefined) out.parallax = mo.parallax;
  if (/\b(sans|grotesk|grotesque|geometric sans|neo-grotesk)\b/.test(all) && !/\bserif\b(?! *sans)/.test(all.replace(/sans[- ]serif/g, ''))) out.serif = false;
  else if (/\bserif|didone|garamond|old-?style\b/.test(all.replace(/sans[- ]serif/g, ''))) out.serif = true;
  const lt = `${layoutText} ${all}`;
  for (const [re, g] of COMPOSITION_WORDS) if (re.test(lt)) {
    out.grid = g;
    break;
  }
  if (/\b(airy|spacious|generous|white ?space|breathing room)\b/.test(lt)) out.density = 'airy';
  else if (/\b(dense|packed|compact|information-rich)\b/.test(lt)) out.density = 'dense';
  if (out.keys) said.push(`${out.keys} key reference${out.keys === 1 ? '' : 's'} leading`);
  if (out.colours.length) said.push(`colours sampled from ${colourFrom.slice(0, 2).map((t) => `“${t}”`).join(' and ')}`);
  if (typeFrom) said.push(`typography from “${typeFrom}”`);
  if (out.motion) said.push(`${out.motion} motion from your moving references`);
  if (out.grid) said.push(`${/^[aeiou]/.test(out.grid) ? 'an' : 'a'} ${out.grid} composition`);
  if (avoiding.length) said.push(`steering away from ${avoiding.length} reference${avoiding.length === 1 ? '' : 's'}`);
  return out;
}

/** Any value into a reading the engine can use (it arrives at a route from the browser). */
export function normalizeReading(v: unknown): BoardReading | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const hexes = Array.isArray(r.colours) ? r.colours.filter((x): x is string => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)).slice(0, 8) : [];
  const feels = ['still', 'calm', 'measured', 'lively', 'kinetic'];
  const grids = ['stack', 'editorial', 'swiss', 'centered', 'asymmetric', 'poster', 'modular'];
  return {
    words: str(r.words, 1200),
    avoid: str(r.avoid, 400),
    colours: hexes,
    colourFrom: Array.isArray(r.colourFrom) ? r.colourFrom.map((x) => str(x, 80)).filter(Boolean).slice(0, 4) : [],
    ...(feels.includes(r.motion as string) ? { motion: r.motion as Motion['feel'] } : {}),
    ...(typeof r.parallax === 'boolean' ? { parallax: r.parallax } : {}),
    ...(typeof r.serif === 'boolean' ? { serif: r.serif } : {}),
    ...(grids.includes(r.grid as string) ? { grid: r.grid as Look['grid'] } : {}),
    ...(r.density === 'airy' || r.density === 'dense' ? { density: r.density } : {}),
    ...(Array.isArray(r.art) ? { art: r.art.filter((x): x is string => typeof x === 'string' && /^[a-z]{2,16}$/.test(x)).slice(0, 6) } : {}),
    read: typeof r.read === 'number' ? Math.max(0, Math.min(200, Math.round(r.read))) : 0,
    keys: typeof r.keys === 'number' ? Math.max(0, Math.min(200, Math.round(r.keys))) : 0,
    said: Array.isArray(r.said) ? r.said.map((x) => str(x, 120)).filter(Boolean).slice(0, 8) : [],
  };
}

/**
 * A ground, a text colour and an accent from sampled colours: the lightest or
 * darkest (whichever the references lean to) as the ground, the most saturated
 * that reads as the accent, and a text colour that reads on the ground.
 */
export function paletteFromSwatches(hexes: readonly string[]): { background: string; text: string; accent: string } | null {
  const xs = [...new Set(hexes.filter((h) => /^#[0-9a-f]{6}$/i.test(h)).map((h) => h.toLowerCase()))];
  if (xs.length < 2) return null;
  const dark = xs.filter(isDark).length > xs.length / 2;
  const byL = [...xs].sort((a, b) => hslOf(a)[2] - hslOf(b)[2]);
  const background = dark ? byL[0] : byL[byL.length - 1];
  const text = dark ? '#f4f1ea' : '#1c1b18';
  const accents = xs.filter((h) => h !== background).sort((a, b) => hslOf(b)[1] - hslOf(a)[1]);
  const accent = accents.find((h) => contrastRatio(h, background) >= 3) ?? accents[0] ?? text;
  return { background, text, accent };
}

/** One reference, as the model is told about it. */
export function describeRef(r: MoodboardRef): string {
  const { take, leave } = takenFrom(r);
  const orient = r.width && r.height ? (r.width > r.height * 1.15 ? 'landscape' : r.height > r.width * 1.15 ? 'portrait' : 'square') : 'unknown';
  return [
    `${r.id} (${r.category}, ${orient}${r.media === 'video' ? ', a moving reference' : ''}${r.key ? ', KEY' : ''}): “${(r.title || r.query || 'untitled').slice(0, 80)}”`,
    take.length ? `take: ${take.map((a) => ASPECT_LABEL[a].toLowerCase()).join(', ')}` : '',
    leave.length ? `leave: ${leave.map((a) => ASPECT_LABEL[a].toLowerCase()).join(', ')}` : '',
    r.note ? `the designer says: “${r.note.slice(0, 200)}”` : '',
    r.swatches?.length && take.includes('colour') ? `colours: ${r.swatches.slice(0, 4).join(' ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
