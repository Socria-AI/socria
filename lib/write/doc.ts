// lib/write/doc.ts — one document with two faces: the Draft Space and the Writing Space.
//
// THE PERSON'S OWN WRITING. Socria never types into it. Every change here is
// an operation the person asked for — a keystroke, a card dragged, a proposal
// they accepted one at a time — and nothing in this file can make one by
// itself. The Draft Space (cards, grouped into paragraph-shaped piles) and the
// Writing Space (blocks of prose) are one document, saved together with the
// line of thinking: a card that grows into a paragraph keeps a pointer to the
// card it came from, and turning the board into an outline only ever ADDS to
// the page — it never rewrites what is already written there.
//
// The model is a word processor's, kept exact: blocks of text with inline
// marks — bold, italic, underline, strikethrough, superscript and subscript,
// and the marks that carry a value: a link's address, a colour, a highlight,
// a font, a size — over ranges of the text. Blocks are paragraphs, three
// headings, quotations, bulleted and numbered lists, and code; each can be
// aligned, indented and spaced. Between them can sit a picture, a horizontal
// line, a page break or a table whose cells are blocks of their own. The
// document knows its page: paper, orientation and margins. That is what a
// Word document, a Google Doc and an essay have in common, and it is what
// every check, export and proposal below can reason about exactly — offsets
// into a block's text, never positions on a screen.
//
// ONE SCHEMA, STILL VERSION 2. Everything added since the first Writing Space
// is optional and additive, so every document saved before reads as it was,
// with nothing to migrate. A reader older than this file keeps every word of
// a newer one — a table's words travel in its block's `text` as tab- and
// line-separated cells — and drops only what it cannot show (see
// docs/LOGOS-5.md §8 "Rollback").
//
// PURE. Shared by the editor, the routes and the tests.

export const BLOCK_TYPES = ['p', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol', 'code', 'hr', 'pb', 'img', 'table'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

const TEXT_TYPES: ReadonlySet<string> = new Set(['p', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol', 'code']);
/** A block of words the caret goes into: a paragraph, a heading, a quotation, a list item, code. */
export const isTextType = (t: BlockType) => TEXT_TYPES.has(t);
/** A block with no words of its own at the top level: a picture, a horizontal line, a page break, a table. */
export const isOpaque = (t: BlockType) => !TEXT_TYPES.has(t);

export const MARK_TYPES = ['b', 'i', 'u', 's', 'sup', 'sub', 'a', 'color', 'bg', 'font', 'size'] as const;
export type MarkType = (typeof MARK_TYPES)[number];
/** Marks that are on or off. */
export type FlagMark = 'b' | 'i' | 'u' | 's' | 'sup' | 'sub';
/** Marks that carry a value: a link's address, a colour, a highlight, a font, a size in points. */
export type ValueMark = 'a' | 'color' | 'bg' | 'font' | 'size';
const VALUED: ReadonlySet<string> = new Set(['a', 'color', 'bg', 'font', 'size']);
export const isValued = (t: MarkType): t is ValueMark => VALUED.has(t);

/** An inline mark over [s, e) of a block's text; `v` is the value of a valued mark. */
export interface Mark {
  s: number;
  e: number;
  t: MarkType;
  v?: string;
}

/**
 * A passage of one of their documents that a paragraph stands on. It points
 * at something that was READ — a block of a SourceDoc — and is never made up:
 * there is no way to make one except by choosing the passage.
 */
export interface Cite {
  id: string;
  /** the SourceDoc's id */
  doc: string;
  /** the passage's block id ("p3.12") */
  block: string;
  /** as the person sees it: “Lecture 4 notes, p. 3” */
  label: string;
  /** the passage's own words as read, clipped — for the Sources list */
  quote?: string;
}

export const ALIGNS = ['center', 'right', 'justify'] as const;
/** A paragraph's alignment; absent is the start of the line. */
export type Align = (typeof ALIGNS)[number];

export interface Block {
  id: string;
  t: BlockType;
  /** plain text; '\n' is a line break inside the block. A table's is its cells' words, for anything that reads only words. */
  text: string;
  marks?: Mark[];
  /** a list item's depth, 1–3 */
  lvl?: number;
  cites?: Cite[];
  /** the Draft Space cards it grew from */
  from?: string[];
  /** alignment: centred, to the right, justified */
  align?: Align;
  /** indentation, in steps of half an inch, 1–8 (a list's depth is `lvl`) */
  ind?: number;
  /** line spacing, as a word processor counts it: 1 single, 1.15, 1.5, 2 double */
  lh?: number;
  /** space before and after the paragraph, in points */
  sb?: number;
  sa?: number;
  // ── a picture ──
  /** where its bytes are kept: `m:` and the media id (lib/write/media.ts) */
  src?: string;
  /** what it shows, in words — read aloud, and kept in every export */
  alt?: string;
  /** its width, as a percentage of the line */
  w?: number;
  /** its size in pixels, as it was made */
  iw?: number;
  ih?: number;
  /** whose storage holds it, when not this person's (a shared document) */
  by?: string;
  // ── a table ──
  /** rows of cells; a cell is a block of words (a paragraph) with an id of its own */
  rows?: Block[][];
  /** the columns' widths, as fractions of the table's */
  cols?: number[];
  /** the first row is a header row */
  head?: boolean;
}

export const CARD_KINDS = ['idea', 'claim', 'evidence', 'example', 'counter', 'conclusion', 'question'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  idea: 'Idea',
  claim: 'Claim',
  evidence: 'Evidence',
  example: 'Example',
  counter: 'Counterargument',
  conclusion: 'Conclusion',
  question: 'Question',
};

/** What a card is connected to: a passage of a document, an idea on the Logic Map, or another card. */
export interface CardLink {
  k: 'doc' | 'node' | 'card';
  /** the passage's block id, the node's id, or the card's id */
  id: string;
  /** the document, for a passage */
  doc?: string;
  /** what it was called when it was linked — shown if it has since gone */
  label: string;
  /** a passage's words, verbatim, clipped */
  quote?: string;
}

export interface Card {
  id: string;
  kind: CardKind;
  text: string;
  /** its group, or null for the loose pile */
  group: string | null;
  links?: CardLink[];
  at: number;
}

/** A pile of cards that is, or will be, one paragraph or section. */
export interface Group {
  id: string;
  title: string;
}

export const VERSION_WHY = ['auto', 'manual', 'import', 'restore', 'outline'] as const;
export type VersionWhy = (typeof VERSION_WHY)[number];

/** The writing as it was at a moment — kept so nothing is ever lost to an edit. */
export interface Version {
  id: string;
  at: number;
  why: VersionWhy;
  /** a name the person gave it */
  name?: string;
  title: string;
  blocks: Block[];
}

export const FACES = ['draft', 'write', 'both'] as const;
export type Face = (typeof FACES)[number];

// ── the page ─────────────────────────────────────────────────────────

/** Paper sizes, in inches. */
export const PAPER = {
  letter: { label: 'Letter (8.5 × 11 in)', w: 8.5, h: 11 },
  a4: { label: 'A4 (210 × 297 mm)', w: 210 / 25.4, h: 297 / 25.4 },
  legal: { label: 'Legal (8.5 × 14 in)', w: 8.5, h: 14 },
  a5: { label: 'A5 (148 × 210 mm)', w: 148 / 25.4, h: 210 / 25.4 },
} as const;
export type PaperSize = keyof typeof PAPER;

export interface PageSetup {
  size: PaperSize;
  orient: 'portrait' | 'landscape';
  /** margins in inches: top, right, bottom, left */
  m: [number, number, number, number];
}

export const DEFAULT_PAGE: PageSetup = { size: 'letter', orient: 'portrait', m: [1, 1, 1, 1] };

export function pageOf(doc: Pick<WriteDoc, 'page'>): PageSetup {
  return doc.page ?? DEFAULT_PAGE;
}

/** The paper as it is turned, in inches. */
export function paperOf(p: PageSetup): { w: number; h: number } {
  const s = PAPER[p.size] ?? PAPER.letter;
  return p.orient === 'landscape' ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
}

/** How wide the lines are, in inches: the paper less its side margins. */
export function lineWidthOf(p: PageSetup): number {
  return Math.max(1, paperOf(p).w - p.m[1] - p.m[3]);
}

// ── fonts, sizes, colours, links: the values a mark may carry ──────

export interface FontInfo {
  label: string;
  /** how the page and an exported web page draw it */
  css: string;
  /** what a Word document names it */
  word: string;
  /** which of the standard PDF faces stands in for it */
  kind: 'serif' | 'sans' | 'mono';
}

const SERIF_STACK = "'Iowan Old Style', Charter, 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif";

/**
 * The fonts offered. Each is drawn with fallbacks a reader's device has; a
 * font a Word document names that is not here is kept by its name (fontValue)
 * so it goes back out as it came in.
 */
export const FONTS = {
  serif: { label: 'Serif', css: SERIF_STACK, word: 'Georgia', kind: 'serif' },
  sans: { label: 'Sans serif', css: "var(--font-sans, Inter), Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", word: 'Arial', kind: 'sans' },
  georgia: { label: 'Georgia', css: "Georgia, 'Times New Roman', serif", word: 'Georgia', kind: 'serif' },
  times: { label: 'Times New Roman', css: "'Times New Roman', Times, 'Liberation Serif', Tinos, serif", word: 'Times New Roman', kind: 'serif' },
  garamond: { label: 'Garamond', css: "Garamond, 'EB Garamond', 'Adobe Garamond Pro', 'Cormorant Garamond', Georgia, serif", word: 'Garamond', kind: 'serif' },
  arial: { label: 'Arial', css: "Arial, Helvetica, 'Liberation Sans', Arimo, sans-serif", word: 'Arial', kind: 'sans' },
  calibri: { label: 'Calibri', css: "Calibri, Carlito, 'Segoe UI', Helvetica, Arial, sans-serif", word: 'Calibri', kind: 'sans' },
  verdana: { label: 'Verdana', css: "Verdana, Geneva, 'DejaVu Sans', sans-serif", word: 'Verdana', kind: 'sans' },
  courier: { label: 'Courier New', css: "'Courier New', Courier, 'Liberation Mono', Cousine, monospace", word: 'Courier New', kind: 'mono' },
  mono: { label: 'Monospace', css: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace", word: 'Consolas', kind: 'mono' },
} as const satisfies Record<string, FontInfo>;
export type FontKey = keyof typeof FONTS;
export const FONT_KEYS = Object.keys(FONTS) as FontKey[];
export const DEFAULT_FONT: FontKey = 'serif';
export const DEFAULT_SIZE = 12;
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

const isFontKey = (v: string): v is FontKey => Object.prototype.hasOwnProperty.call(FONTS, v);

/** A font as a mark or a document may carry it: one of FONTS, or a font's own name, safe to put in CSS. */
export function fontValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const raw = v.trim();
  if (isFontKey(raw)) return raw;
  const name = raw.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 48 || !/^[\p{L}\p{N} &.'-]+$/u.test(name)) return null;
  const lower = name.toLowerCase();
  for (const k of FONT_KEYS) if (FONTS[k].word.toLowerCase() === lower && k !== 'serif' && k !== 'sans') return k;
  if (lower === 'consolas') return 'mono';
  return name.replace(/'/g, '');
}

export function fontInfo(v: string | undefined): FontInfo {
  if (v && isFontKey(v)) return FONTS[v];
  const name = v ?? '';
  const kind: FontInfo['kind'] = /mono|courier|consol|code|menlo/i.test(name) ? 'mono' : /sans|arial|helvet|calibri|verdana|segoe|roboto|inter|lato|open|gothic|tahoma|trebuchet|futura|avenir|nunito|montserrat|poppins|source sans/i.test(name) ? 'sans' : 'serif';
  const generic = kind === 'mono' ? 'monospace' : kind === 'sans' ? 'sans-serif' : 'serif';
  return { label: name, css: name ? `'${name}', ${generic}` : SERIF_STACK, word: name || 'Georgia', kind };
}

/** A size in points, between 6 and 96, in half points — as Word counts them. */
export function sizeValue(v: unknown): string | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(Math.max(6, Math.min(96, n)) * 2) / 2;
  return String(r);
}

/** A colour as #rrggbb, lower case. */
export function colorValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : null;
}

/**
 * A link's address, if it is one a page may hold: http(s), mailto or tel.
 * Anything else — a script, a data address, a file on someone's disk — is
 * not a link here, and is not kept.
 */
export function hrefValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s || s.length > 2048 || /[\u0000-\u001F\u007F\s"<>\\^`{|}]/.test(s.replace(/ /g, '%20'))) return null;
  if (/^www\./i.test(s)) s = `https://${s}`;
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(s) || /^tel:\+?[\d\s().-]{3,32}$/i.test(s)) return s;
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return s.replace(/ /g, '%20');
  } catch {
    return null;
  }
}

function markValue(t: MarkType, v: unknown): string | null {
  if (t === 'a') return hrefValue(v);
  if (t === 'color' || t === 'bg') return colorValue(v);
  if (t === 'font') return fontValue(v);
  if (t === 'size') return sizeValue(v);
  return null;
}

export interface WriteDoc {
  v: 2;
  title: string;
  blocks: Block[];
  cards: Card[];
  groups: Group[];
  /** the signatures of issues the person dismissed (lib/write/checks.ts) */
  dismissed: string[];
  versions: Version[];
  /** which face they last had open */
  face?: Face;
  /** paper, orientation and margins — for printing and every export */
  page?: PageSetup;
  /** the document's own font and size in points, under any marks */
  font?: string;
  size?: number;
  /** shown as one flowing page, or as sheets of the paper */
  view?: 'flow' | 'page';
  updatedAt: number;
}

/** What is stored with a line of thinking. `html` is kept, rendered from the blocks, for anything that still reads it. */
export interface StoredDraft {
  title: string;
  html: string;
  doc?: WriteDoc;
}

// ── bounds ───────────────────────────────────────────────────────────
//
// Generous enough for a long essay or a thesis chapter; bounded because the
// whole document travels with the conversation on every save. A document
// near the bound is told so by the editor (nearLimit) long before anything
// would be refused — the person's writing is never silently cut. Pictures are
// not in the document at all: it holds where each one is kept (lib/write/media.ts).

export const MAX_DOC_CHARS = 300_000;
export const MAX_BLOCKS = 6_000;
export const MAX_BLOCK_CHARS = 40_000;
export const MAX_CARDS = 400;
export const MAX_CARD_CHARS = 2_000;
export const MAX_GROUPS = 60;
export const MAX_VERSIONS = 12;
export const MAX_VERSION_CHARS = 400_000;
export const MAX_DISMISSED = 600;
export const MAX_TITLE = 200;
export const MAX_TABLE_ROWS = 500;
export const MAX_TABLE_COLS = 20;
export const MAX_CELL_CHARS = 10_000;
export const MAX_ALT = 300;
const MAX_CITES = 12;
const MAX_LINKS = 12;
const MAX_LABEL = 160;
const MAX_QUOTE = 400;
const MAX_MARKS = 4000;

// ── ids ──────────────────────────────────────────────────────────────

let seq = 0;
/** A short id: unique within a document, never meaningful. */
export function uid(prefix = 'b'): string {
  seq = (seq + 1) % 1_679_616;
  return `${prefix}${Date.now().toString(36).slice(-5)}${seq.toString(36).padStart(4, '0')}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

const ID = /^[A-Za-z0-9_-]{1,32}$/;
/** A picture's source: `m:` and a media id. */
export const MEDIA_SRC = /^m:[a-f0-9]{32}$/;
const OWNER = /^[a-f0-9]{24}$/;

// ── constructors and reading ─────────────────────────────────────────

export function emptyBlock(t: BlockType = 'p'): Block {
  return { id: uid('b'), t, text: '' };
}

export function emptyDoc(now = Date.now()): WriteDoc {
  return { v: 2, title: '', blocks: [emptyBlock()], cards: [], groups: [], dismissed: [], versions: [], updatedAt: now };
}

export const isHeading = (t: BlockType) => t === 'h1' || t === 'h2' || t === 'h3';
export const isList = (t: BlockType) => t === 'ul' || t === 'ol';

/** Nothing written anywhere: no title, no words, no pictures or tables, no cards. */
export function isEmptyDoc(doc: WriteDoc | null | undefined): boolean {
  if (!doc) return true;
  return !doc.title.trim() && doc.blocks.every((b) => isTextType(b.t) && !b.text.trim()) && doc.cards.length === 0;
}

export function docText(doc: Pick<WriteDoc, 'blocks'>): string {
  return doc.blocks.map((b) => b.text).join('\n\n');
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

export function docChars(doc: Pick<WriteDoc, 'blocks'>): number {
  let n = 0;
  for (const b of doc.blocks) n += b.text.length;
  return n;
}

/** Close to what is kept with a conversation — said, so they can export a copy first. */
export const nearLimit = (doc: Pick<WriteDoc, 'blocks'>) => docChars(doc) > MAX_DOC_CHARS * 0.85;

export function blockIndex(doc: Pick<WriteDoc, 'blocks'>, id: string): number {
  return doc.blocks.findIndex((b) => b.id === id);
}

/**
 * Every block of words in reading order: the top-level ones, and inside a
 * table each cell, row by row. What the checks read, what find searches.
 */
export function textBlocks(doc: Pick<WriteDoc, 'blocks'>): Block[] {
  const out: Block[] = [];
  for (const b of doc.blocks) {
    if (b.t === 'table') for (const row of b.rows ?? []) for (const c of row) out.push(c);
    else if (isTextType(b.t)) out.push(b);
  }
  return out;
}

/** Each block of words' place in the reading order — a cell after the blocks above its table. */
export function textOrder(doc: Pick<WriteDoc, 'blocks'>): Map<string, number> {
  return new Map(textBlocks(doc).map((b, k) => [b.id, k]));
}

/** A block of words by its id: a top-level one, or a table's cell. */
export function findText(doc: Pick<WriteDoc, 'blocks'>, id: string): Block | null {
  for (const b of doc.blocks) {
    if (b.id === id) return isTextType(b.t) ? b : null;
    if (b.t === 'table') for (const row of b.rows ?? []) for (const c of row) if (c.id === id) return c;
  }
  return null;
}

/** A block of words replaced, wherever it is — at the top level, or in a table. */
export function replaceText(doc: WriteDoc, next: Block): WriteDoc {
  const i = blockIndex(doc, next.id);
  if (i >= 0) return replaceBlock(doc, next);
  const at = findCell(doc, next.id);
  return at ? updateCell(doc, next.id, next) : doc;
}

// ── marks ────────────────────────────────────────────────────────────

const clampTo = (n: number, len: number) => Math.max(0, Math.min(len, Math.floor(n)));

/**
 * Marks clipped to the text, empty ones dropped, in order. A flag mark's
 * overlapping or touching ranges are joined; for a valued mark each character
 * has at most one value — where two cover it, the later one in the list wins
 * — and neighbouring ranges with the same value are joined.
 */
export function normalizeMarks(marks: readonly Mark[] | undefined, len: number): Mark[] | undefined {
  if (!marks?.length) return undefined;
  const out: Mark[] = [];
  for (const t of MARK_TYPES) {
    const of = marks.filter((m) => m && m.t === t);
    if (!of.length) continue;
    if (!VALUED.has(t)) {
      const spans = of
        .map((m) => ({ s: clampTo(m.s, len), e: clampTo(m.e, len), t }))
        .filter((m) => m.e > m.s)
        .sort((a, b) => a.s - b.s);
      let last: Mark | null = null;
      for (const m of spans) {
        if (last && m.s <= last.e) last.e = Math.max(last.e, m.e);
        else {
          last = { ...m };
          out.push(last);
        }
      }
      continue;
    }
    const valid = of
      .map((m) => ({ s: clampTo(m.s, len), e: clampTo(m.e, len), t, v: m.v }))
      .filter((m): m is Mark & { v: string } => m.e > m.s && typeof m.v === 'string' && !!m.v);
    if (!valid.length) continue;
    if (valid.length === 1) {
      out.push({ ...valid[0] });
      continue;
    }
    const cuts = Array.from(new Set(valid.flatMap((m) => [m.s, m.e]))).sort((a, b) => a - b);
    let prev: Mark | null = null;
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k];
      const b = cuts[k + 1];
      let v: string | undefined;
      for (let x = valid.length - 1; x >= 0; x--) {
        if (valid[x].s <= a && valid[x].e >= b) {
          v = valid[x].v;
          break;
        }
      }
      if (!v) {
        prev = null;
        continue;
      }
      if (prev && prev.v === v && prev.e === a) prev.e = b;
      else {
        prev = { s: a, e: b, t, v };
        out.push(prev);
      }
    }
  }
  out.sort((a, b) => a.s - b.s || MARK_TYPES.indexOf(a.t) - MARK_TYPES.indexOf(b.t));
  return out.length ? out : undefined;
}

/** True when every character of [s, e) carries flag mark t. */
export function hasMark(block: Block, s: number, e: number, t: MarkType): boolean {
  if (e <= s) return false;
  const of = (block.marks ?? []).filter((m) => m.t === t).sort((a, b) => a.s - b.s);
  let at = s;
  for (const m of of) {
    if (m.s > at) break;
    if (m.e > at) at = m.e;
    if (at >= e) return true;
  }
  return at >= e;
}

/** The one value valued mark t has over all of [s, e) — or null where it is absent anywhere or differs. */
export function valueOver(block: Block, s: number, e: number, t: ValueMark): string | null {
  if (e <= s) return marksAt(block, s).find((m) => m.t === t)?.v ?? null;
  const of = (block.marks ?? []).filter((m) => m.t === t && m.e > s && m.s < e).sort((a, b) => a.s - b.s);
  if (!of.length) return null;
  const v = of[0].v ?? null;
  let at = s;
  for (const m of of) {
    if (m.v !== v || m.s > at) return null;
    at = Math.max(at, m.e);
  }
  return at >= e ? v : null;
}

/** The marks a caret at `at` writes with: those on the character before it (or, at the start, the first). */
export function marksAt(block: Block, at: number): Mark[] {
  if (!block.text.length) return [];
  const k = at > 0 ? Math.min(at, block.text.length) - 1 : 0;
  return (block.marks ?? []).filter((m) => m.s <= k && m.e > k);
}

/** Turn flag mark t on over [s, e) — or off, when all of it already has it. Superscript and subscript exclude each other. */
export function toggleMark(block: Block, s: number, e: number, t: MarkType): Block {
  const lo = Math.max(0, Math.min(s, e));
  const hi = Math.min(block.text.length, Math.max(s, e));
  if (hi <= lo || isValued(t)) return block;
  const marks = block.marks ?? [];
  if (hasMark(block, lo, hi, t)) return withMarks(block, cut(marks, lo, hi, (m) => m.t === t));
  const other = t === 'sup' ? 'sub' : t === 'sub' ? 'sup' : null;
  const base = other ? cut(marks, lo, hi, (m) => m.t === other) : marks;
  return withMarks(block, [...base, { s: lo, e: hi, t }]);
}

/** Valued mark t set to `v` over [s, e), whatever it was there — or taken away, for null. */
export function setMark(block: Block, s: number, e: number, t: ValueMark, v: string | null): Block {
  const lo = Math.max(0, Math.min(s, e));
  const hi = Math.min(block.text.length, Math.max(s, e));
  if (hi <= lo) return block;
  const value = v === null ? null : markValue(t, v);
  const kept = cut(block.marks ?? [], lo, hi, (m) => m.t === t);
  return withMarks(block, value ? [...kept, { s: lo, e: hi, t, v: value }] : kept);
}

/** Formatting taken off [s, e): every mark but the ones named (a link is kept unless asked). */
export function clearMarks(block: Block, s: number, e: number, keep: MarkType[] = ['a']): Block {
  const lo = Math.max(0, Math.min(s, e));
  const hi = Math.min(block.text.length, Math.max(s, e));
  if (hi <= lo) return block;
  return withMarks(block, cut(block.marks ?? [], lo, hi, (m) => !keep.includes(m.t)));
}

/** Marks with [lo, hi) cut out of those `which` picks. */
function cut(marks: readonly Mark[], lo: number, hi: number, which: (m: Mark) => boolean): Mark[] {
  const kept: Mark[] = [];
  for (const m of marks) {
    if (!which(m) || m.e <= lo || m.s >= hi) {
      kept.push(m);
      continue;
    }
    if (m.s < lo) kept.push({ ...m, e: lo });
    if (m.e > hi) kept.push({ ...m, s: hi });
  }
  return kept;
}

function withMarks(block: Block, marks: Mark[]): Block {
  const m = block.t === 'code' ? undefined : normalizeMarks(marks, block.text.length);
  const { marks: _old, ...rest } = block;
  return m ? { ...rest, marks: m } : rest;
}

const shifted = (marks: readonly Mark[] | undefined, by: number): Mark[] => (marks ?? []).map((m) => ({ ...m, s: m.s + by, e: m.e + by }));

/**
 * Replace [s, e) of a block's text with `ins`, carrying the marks along: a mark
 * that covered the replaced words covers what replaced them, one that ended
 * before is untouched, one that began after moves with the text.
 */
export function spliceBlock(block: Block, s: number, e: number, ins: string): Block {
  const len = block.text.length;
  const lo = Math.max(0, Math.min(len, Math.min(s, e)));
  const hi = Math.max(0, Math.min(len, Math.max(s, e)));
  const text = block.text.slice(0, lo) + ins + block.text.slice(hi);
  const delta = ins.length - (hi - lo);
  const mapStart = (p: number) => (p < lo ? p : p >= hi ? p + delta : lo);
  const mapEnd = (p: number) => (p <= lo ? p : p > hi ? p + delta : lo + ins.length);
  const marks = (block.marks ?? []).map((m) => ({ ...m, s: mapStart(m.s), e: mapEnd(m.e) }));
  const next: Block = { ...block, text };
  return withMarks(next, marks);
}

/**
 * Words put in at a caret wearing exactly the marks given — what is typed
 * after bold, a font or a size was chosen with nothing selected. The words
 * around them keep theirs.
 */
export function insertMarked(block: Block, at: number, ins: string, marks: readonly Mark[]): Block {
  const off = Math.max(0, Math.min(block.text.length, at));
  const spliced = spliceBlock(block, off, off, ins);
  const lo = off;
  const hi = off + ins.length;
  const kept = cut(spliced.marks ?? [], lo, hi, () => true);
  return withMarks(spliced, [...kept, ...marks.map((m) => ({ ...m, s: lo, e: hi }))]);
}

/** The marks of [s, e), re-based to start at 0 — for text that is cut out and put elsewhere. */
export function sliceMarks(block: Block, s: number, e: number): Mark[] {
  return (block.marks ?? []).filter((m) => m.e > s && m.s < e).map((m) => ({ ...m, s: Math.max(m.s, s) - s, e: Math.min(m.e, e) - s }));
}

// ── what a paragraph is, besides its words ───────────────────────────

/** A block's paragraph settings, to carry onto the block split from it. */
function paraAttrs(b: Block): Partial<Block> {
  const out: Partial<Block> = {};
  if (b.align) out.align = b.align;
  if (b.ind) out.ind = b.ind;
  if (b.lh) out.lh = b.lh;
  if (b.sb !== undefined) out.sb = b.sb;
  if (b.sa !== undefined) out.sa = b.sa;
  return out;
}

export interface ParaPatch {
  align?: Align | null;
  ind?: number | null;
  lh?: number | null;
  sb?: number | null;
  sa?: number | null;
}

/**
 * Alignment, indentation and spacing set on blocks; null takes a setting
 * away. A picture and a table's cell take alignment only; code takes none of
 * alignment or indentation.
 */
export function setParaAttrs(doc: WriteDoc, ids: string[], patch: ParaPatch): WriteDoc {
  const set = new Set(ids);
  const one = (b: Block, cell: boolean): Block => {
    if (!set.has(b.id)) return b;
    if (!cell && !isTextType(b.t) && b.t !== 'img') return b;
    const next: Block = { ...b };
    if (patch.align !== undefined && b.t !== 'code') {
      const a = patch.align && (ALIGNS as readonly string[]).includes(patch.align) && !(b.t === 'img' && patch.align === 'justify') ? patch.align : null;
      if (a) next.align = a;
      else delete next.align;
    }
    if (!cell && b.t !== 'img') {
      if (patch.ind !== undefined && !isList(b.t) && b.t !== 'code') {
        if (patch.ind) next.ind = Math.max(1, Math.min(8, Math.round(patch.ind)));
        else delete next.ind;
      }
      if (patch.lh !== undefined) {
        if (patch.lh) next.lh = lineSpacing(patch.lh);
        else delete next.lh;
      }
      if (patch.sb !== undefined) {
        if (patch.sb === null) delete next.sb;
        else next.sb = points(patch.sb);
      }
      if (patch.sa !== undefined) {
        if (patch.sa === null) delete next.sa;
        else next.sa = points(patch.sa);
      }
    }
    return next;
  };
  let changed = false;
  const blocks = doc.blocks.map((b) => {
    if (b.t === 'table') {
      if (!b.rows?.some((r) => r.some((c) => set.has(c.id)))) return b;
      changed = true;
      return { ...b, rows: b.rows.map((r) => r.map((c) => one(c, true))) };
    }
    const n = one(b, false);
    if (n !== b) changed = true;
    return n;
  });
  return changed ? { ...doc, blocks } : doc;
}

/** Line spacing, between single and triple, to two places. */
export function lineSpacing(n: number): number {
  return Math.round(Math.max(1, Math.min(3, n)) * 100) / 100;
}

/** Points of space, between none and 96. */
export function points(n: number): number {
  return Math.round(Math.max(0, Math.min(96, n)) * 2) / 2;
}

// ── block operations (each returns a new document; the old one is untouched) ──

function setBlocks(doc: WriteDoc, blocks: Block[]): WriteDoc {
  return { ...doc, blocks: blocks.length ? blocks : [emptyBlock()] };
}

export function replaceBlock(doc: WriteDoc, next: Block): WriteDoc {
  return setBlocks(
    doc,
    doc.blocks.map((b) => (b.id === next.id ? next : b))
  );
}

/** A point in the writing: a block and an offset into its text. For a picture, a line, a page break or a table, 0 is before it and 1 after. */
export interface Point {
  block: string;
  offset: number;
}

/**
 * Enter: the block splits at `at`. What follows a heading is a paragraph; an
 * empty list item or quote line is how a list or a quote is left. A table's
 * cell takes a line break instead; at a picture, a new paragraph opens beside it.
 */
export function splitBlock(doc: WriteDoc, id: string, at: number): { doc: WriteDoc; caret: Point } {
  const i = blockIndex(doc, id);
  if (i < 0) {
    const cell = findText(doc, id);
    if (!cell) return { doc, caret: { block: id, offset: at } };
    const cut = Math.max(0, Math.min(cell.text.length, at));
    return { doc: replaceText(doc, spliceBlock(cell, cut, cut, '\n')), caret: { block: id, offset: cut + 1 } };
  }
  const b = doc.blocks[i];
  if (isOpaque(b.t)) {
    const p = emptyBlock();
    const pos = at >= 1 ? i + 1 : i;
    return { doc: setBlocks(doc, [...doc.blocks.slice(0, pos), p, ...doc.blocks.slice(pos)]), caret: { block: p.id, offset: 0 } };
  }
  if ((isList(b.t) || b.t === 'quote') && !b.text.trim()) {
    const { lvl: _l, ...rest } = b;
    const plain: Block = { ...rest, t: 'p', text: '' };
    return { doc: replaceBlock(doc, plain), caret: { block: b.id, offset: 0 } };
  }
  const cut = Math.max(0, Math.min(b.text.length, at));
  const head: Block = withMarks({ ...b, text: b.text.slice(0, cut) }, sliceMarks(b, 0, cut));
  const tailType: BlockType = isHeading(b.t) || (b.t === 'code' && cut >= b.text.length) ? 'p' : b.t;
  const tail: Block = withMarks(
    {
      id: uid('b'),
      t: tailType,
      text: b.text.slice(cut),
      ...(isList(tailType) && b.lvl ? { lvl: b.lvl } : {}),
      ...paraAttrs(b),
    },
    sliceMarks(b, cut, b.text.length)
  );
  // Splitting at the very start leaves the block where it was and opens a line above it.
  if (cut === 0 && b.text.length > 0) {
    const above: Block = { id: uid('b'), t: isHeading(b.t) ? 'p' : b.t, text: '', ...(isList(b.t) && b.lvl ? { lvl: b.lvl } : {}), ...paraAttrs(b) };
    const blocks = [...doc.blocks.slice(0, i), above, b, ...doc.blocks.slice(i + 1)];
    return { doc: setBlocks(doc, blocks), caret: { block: b.id, offset: 0 } };
  }
  const blocks = [...doc.blocks.slice(0, i), head, tail, ...doc.blocks.slice(i + 1)];
  return { doc: setBlocks(doc, blocks), caret: { block: tail.id, offset: 0 } };
}

/**
 * Backspace at the start of a block. A heading, quote, list item or code
 * becomes a paragraph first — one press, one change; an indented paragraph
 * comes out a step; a paragraph joins the one above. After a picture, a line
 * or a table, the press picks that out instead (`select`), so a second press
 * is what takes it away — never the first, by surprise.
 */
export function mergeBack(doc: WriteDoc, id: string): { doc: WriteDoc; caret: Point; select?: string } {
  const i = blockIndex(doc, id);
  if (i < 0) return { doc, caret: { block: id, offset: 0 } };
  const b = doc.blocks[i];
  if (isOpaque(b.t)) return { doc, caret: { block: id, offset: 0 } };
  if (b.t !== 'p') {
    if (isList(b.t) && (b.lvl ?? 1) > 1) return { doc: replaceBlock(doc, { ...b, lvl: (b.lvl ?? 1) - 1 }), caret: { block: id, offset: 0 } };
    const { lvl: _l, ...rest } = b;
    return { doc: replaceBlock(doc, { ...rest, t: 'p' }), caret: { block: id, offset: 0 } };
  }
  if (b.ind) {
    const { ind: _i, ...rest } = b;
    return { doc: replaceBlock(doc, b.ind > 1 ? { ...b, ind: b.ind - 1 } : rest), caret: { block: id, offset: 0 } };
  }
  if (i === 0) return { doc, caret: { block: id, offset: 0 } };
  const prev = doc.blocks[i - 1];
  if (isOpaque(prev.t)) {
    if (!b.text && i < doc.blocks.length - 1) return { doc: removeBlocks(doc, [b.id]), caret: { block: prev.id, offset: 1 }, select: prev.id };
    return { doc, caret: { block: id, offset: 0 }, select: prev.id };
  }
  return joinBlocks(doc, prev.id, id);
}

/** Delete at the end of a block: the next one joins it — or, when it is a picture, a line or a table, is picked out. */
export function mergeForward(doc: WriteDoc, id: string): { doc: WriteDoc; caret: Point; select?: string } {
  const i = blockIndex(doc, id);
  if (i < 0 || i >= doc.blocks.length - 1) return { doc, caret: { block: id, offset: doc.blocks[i]?.text.length ?? 0 } };
  const b = doc.blocks[i];
  const next = doc.blocks[i + 1];
  if (isOpaque(b.t)) return { doc, caret: { block: id, offset: 1 } };
  if (isOpaque(next.t)) {
    if (!b.text) return { doc: removeBlocks(doc, [b.id]), caret: { block: next.id, offset: 0 }, select: next.id };
    return { doc, caret: { block: id, offset: b.text.length }, select: next.id };
  }
  return joinBlocks(doc, id, next.id);
}

/** The second block's words appended to the first's; its citations and origins go with them. */
function joinBlocks(doc: WriteDoc, firstId: string, secondId: string): { doc: WriteDoc; caret: Point } {
  const i = blockIndex(doc, firstId);
  const j = blockIndex(doc, secondId);
  const a = doc.blocks[i];
  const b = doc.blocks[j];
  const at = a.text.length;
  const marks = [...(a.marks ?? []), ...shifted(b.marks, at)];
  const cites = uniqBy([...(a.cites ?? []), ...(b.cites ?? [])], (c) => `${c.doc}:${c.block}`).slice(0, MAX_CITES);
  const from = Array.from(new Set([...(a.from ?? []), ...(b.from ?? [])]));
  // An empty block above takes the shape of the one joining it: deleting a blank line keeps a heading a heading.
  const takeB = !a.text && !!b.text;
  const shape = takeB ? { t: b.t, ...(b.lvl ? { lvl: b.lvl } : {}), ...paraAttrs(b) } : { t: a.t, ...(a.lvl ? { lvl: a.lvl } : {}), ...paraAttrs(a) };
  const { lvl: _l, align: _al, ind: _in, lh: _lh, sb: _sb, sa: _sa, ...aRest } = a;
  const joined: Block = withMarks(
    { ...aRest, ...shape, text: a.text + b.text, ...(cites.length ? { cites } : {}), ...(from.length ? { from } : {}) },
    marks
  );
  const blocks = doc.blocks.filter((x) => x.id !== b.id).map((x) => (x.id === a.id ? joined : x));
  return { doc: setBlocks(doc, blocks), caret: { block: a.id, offset: at } };
}

/** Order two points as they fall in the document. A cell's point stands for its table. */
export function orderPoints(doc: WriteDoc, a: Point, b: Point): [Point, Point] {
  const ia = pointIndex(doc, a.block);
  const ib = pointIndex(doc, b.block);
  if (ia === ib && a.block !== b.block) {
    // two cells of one table: in reading order
    const ord = textOrder(doc);
    return (ord.get(a.block) ?? 0) <= (ord.get(b.block) ?? 0) ? [a, b] : [b, a];
  }
  return ia < ib || (ia === ib && a.offset <= b.offset) ? [a, b] : [b, a];
}

/** The index of the top-level block a point is in — for a cell, its table's. */
function pointIndex(doc: WriteDoc, id: string): number {
  const i = blockIndex(doc, id);
  if (i >= 0) return i;
  const at = findCell(doc, id);
  return at ? at.ti : -1;
}

/** A point in a cell, as a point at its table — before it at the start of a range, after it at the end. */
function lift(doc: WriteDoc, p: Point, side: 'start' | 'end'): Point {
  if (blockIndex(doc, p.block) >= 0) return p;
  const at = findCell(doc, p.block);
  return at ? { block: at.table.id, offset: side === 'start' ? 0 : 1 } : p;
}

/** Where the caret goes when the blocks around index k have gone: the next block of words, else the one before. */
function caretNear(blocks: Block[], k: number): Point {
  for (let x = Math.max(0, k); x < blocks.length; x++) if (isTextType(blocks[x].t)) return { block: blocks[x].id, offset: 0 };
  for (let x = Math.min(blocks.length - 1, k - 1); x >= 0; x--) if (isTextType(blocks[x].t)) return { block: blocks[x].id, offset: blocks[x].text.length };
  return blocks.length ? { block: blocks[Math.min(blocks.length - 1, Math.max(0, k))].id, offset: 0 } : { block: '', offset: 0 };
}

/** At least one block of words, so there is always somewhere to type. */
function withSomeText(blocks: Block[]): Block[] {
  return blocks.some((b) => isTextType(b.t)) ? blocks : [...blocks, emptyBlock()];
}

/**
 * Delete everything between two points, across blocks if need be, and put
 * `ins` where it was. The first block keeps its shape; the last block's tail
 * joins it — as in every word processor. A picture, a line or a table is
 * taken whole or left whole: a range that starts after it or ends before it
 * leaves it be.
 */
export function replaceRange(doc: WriteDoc, from: Point, to: Point, ins = ''): { doc: WriteDoc; caret: Point } {
  // inside one cell of a table
  if (from.block === to.block && blockIndex(doc, from.block) < 0) {
    const cell = findText(doc, from.block);
    if (!cell) return { doc, caret: from };
    const lo = Math.min(from.offset, to.offset);
    const hi = Math.max(from.offset, to.offset);
    return { doc: replaceText(doc, spliceBlock(cell, lo, hi, ins)), caret: { block: from.block, offset: lo + ins.length } };
  }
  const [a0, b0] = orderPoints(doc, from, to);
  const a = lift(doc, a0, 'start');
  const b = lift(doc, b0, 'end');
  const i = blockIndex(doc, a.block);
  const j = blockIndex(doc, b.block);
  if (i < 0 || j < 0) return { doc, caret: a };
  const A = doc.blocks[i];
  const B = doc.blocks[j];
  if (i === j) {
    if (!isOpaque(A.t)) {
      const next = spliceBlock(A, a.offset, b.offset, ins);
      return { doc: replaceBlock(doc, next), caret: { block: a.block, offset: Math.min(a.offset, b.offset) + ins.length } };
    }
    const whole = b.offset > a.offset;
    if (!whole && !ins) return { doc, caret: a };
    if (whole) {
      if (ins) {
        const p: Block = { id: uid('b'), t: 'p', text: ins };
        return { doc: setBlocks(doc, [...doc.blocks.slice(0, i), p, ...doc.blocks.slice(i + 1)]), caret: { block: p.id, offset: ins.length } };
      }
      const blocks = withSomeText([...doc.blocks.slice(0, i), ...doc.blocks.slice(i + 1)]);
      return { doc: setBlocks(doc, blocks), caret: caretNear(blocks, i) };
    }
    const p: Block = { id: uid('b'), t: 'p', text: ins };
    const pos = a.offset >= 1 ? i + 1 : i;
    return { doc: setBlocks(doc, [...doc.blocks.slice(0, pos), p, ...doc.blocks.slice(pos)]), caret: { block: p.id, offset: ins.length } };
  }
  const between = doc.blocks.slice(i + 1, j).filter((x) => isTextType(x.t));
  const lastText = isTextType(B.t) ? [B] : [];
  if (isTextType(A.t)) {
    const head = spliceBlock(A, a.offset, A.text.length, ins);
    const cites = uniqBy([...(A.cites ?? []), ...[...between, ...lastText].flatMap((x) => x.cites ?? [])], (c) => `${c.doc}:${c.block}`).slice(0, MAX_CITES);
    const fromIds = Array.from(new Set([...(A.from ?? []), ...[...between, ...lastText].flatMap((x) => x.from ?? [])]));
    const extra = { ...(cites.length ? { cites } : {}), ...(fromIds.length ? { from: fromIds } : {}) };
    if (isTextType(B.t)) {
      const tailMarks = shifted(sliceMarks(B, b.offset, B.text.length), head.text.length);
      const joined = withMarks({ ...head, text: head.text + B.text.slice(b.offset), ...extra }, [...(head.marks ?? []), ...tailMarks]);
      const blocks = [...doc.blocks.slice(0, i), joined, ...doc.blocks.slice(j + 1)];
      return { doc: setBlocks(doc, blocks), caret: { block: A.id, offset: a.offset + ins.length } };
    }
    // ends at a picture, a line or a table: taken if the range reaches past it, else left
    const keepB = b.offset < 1;
    const blocks = [...doc.blocks.slice(0, i), { ...head, ...extra }, ...(keepB ? [B] : []), ...doc.blocks.slice(j + 1)];
    return { doc: setBlocks(doc, blocks), caret: { block: A.id, offset: a.offset + ins.length } };
  }
  // starts at a picture, a line or a table
  const keepA = a.offset >= 1;
  if (isTextType(B.t)) {
    const tail = withMarks({ ...B, text: ins + B.text.slice(b.offset) }, shifted(sliceMarks(B, b.offset, B.text.length), ins.length));
    const blocks = [...doc.blocks.slice(0, i), ...(keepA ? [A] : []), tail, ...doc.blocks.slice(j + 1)];
    return { doc: setBlocks(doc, blocks), caret: { block: B.id, offset: ins.length } };
  }
  const keepB = b.offset < 1;
  const mid: Block[] = ins ? [{ id: uid('b'), t: 'p', text: ins }] : [];
  const blocks = withSomeText([...doc.blocks.slice(0, i), ...(keepA ? [A] : []), ...mid, ...(keepB ? [B] : []), ...doc.blocks.slice(j + 1)]);
  const caret = mid.length ? { block: mid[0].id, offset: ins.length } : caretNear(blocks, i + (keepA ? 1 : 0));
  return { doc: setBlocks(doc, blocks), caret };
}

/**
 * The writing between two points, as blocks — what a copy takes. Part of one
 * block is its words alone; across blocks, each keeps its shape. A picture, a
 * line or a table comes whole when the range covers it.
 */
export function blocksInRange(doc: WriteDoc, from: Point, to: Point): Block[] {
  if (from.block === to.block && blockIndex(doc, from.block) < 0) {
    const cell = findText(doc, from.block);
    if (!cell) return [];
    const s = Math.min(from.offset, to.offset);
    const e = Math.max(from.offset, to.offset);
    return [withMarks({ id: cell.id, t: 'p', text: cell.text.slice(s, e) }, sliceMarks(cell, s, e))];
  }
  const [a0, b0] = orderPoints(doc, from, to);
  const a = lift(doc, a0, 'start');
  const b = lift(doc, b0, 'end');
  const i = blockIndex(doc, a.block);
  const j = blockIndex(doc, b.block);
  if (i < 0 || j < 0) return [];
  const out: Block[] = [];
  for (let k = i; k <= j; k++) {
    const blk = doc.blocks[k];
    if (isOpaque(blk.t)) {
      const covered = (k > i || a.offset === 0) && (k < j || b.offset >= 1) && !(i === j && a.offset === b.offset);
      if (covered) out.push(blk);
      continue;
    }
    const s = k === i ? a.offset : 0;
    const e = k === j ? b.offset : blk.text.length;
    if (e <= s && i !== j) continue;
    const part = withMarks({ ...blk, text: blk.text.slice(s, e) }, sliceMarks(blk, s, e));
    if (i === j && !(s === 0 && e === blk.text.length)) {
      const { lvl: _l, cites: _c, ...words } = part;
      out.push({ ...words, t: blk.t === 'code' ? 'code' : 'p' });
    } else out.push(part);
  }
  return out;
}

/** The plain words between two points — what a selection says. */
export function textInRange(doc: WriteDoc, from: Point, to: Point): string {
  return blocksInRange(doc, from, to)
    .map((b) => b.text)
    .join('\n\n');
}

/** A block coming in with ids that cannot collide: a fresh id if its own is taken or malformed; a table's cells always fresh. */
function freshen(b: Block, taken: Set<string>): Block {
  const id = taken.has(b.id) || !ID.test(b.id) ? uid('b') : b.id;
  taken.add(id);
  if (b.t !== 'table') return id === b.id ? b : { ...b, id };
  const rows = (b.rows ?? []).map((r) => r.map((c) => ({ ...c, id: uid('td') })));
  return { ...b, id, rows };
}

/** Put blocks in after the one named (or at the start), keeping their ids unless they collide. */
export function insertBlocks(doc: WriteDoc, after: string | null, add: Block[]): WriteDoc {
  const taken = new Set(doc.blocks.map((b) => b.id));
  const fresh = add.map((b) => freshen(b, taken));
  const i = after === null ? -1 : blockIndex(doc, after);
  const at = after === null ? 0 : i < 0 ? doc.blocks.length : i + 1;
  return setBlocks(doc, [...doc.blocks.slice(0, at), ...fresh, ...doc.blocks.slice(at)]);
}

/** Blocks flattened to one run of words and marks, a line each — what a table's cell can hold. */
function flatten(add: Block[]): { text: string; marks: Mark[] } {
  let text = '';
  const marks: Mark[] = [];
  for (const b of add) {
    if (!b.text && b.t !== 'table') continue;
    const words = b.t === 'table' ? b.text.replace(/\t/g, ' ') : b.text;
    if (!words) continue;
    if (text) text += '\n';
    if (b.t !== 'table') marks.push(...shifted(b.marks, text.length));
    text += words;
  }
  return { text, marks };
}

/**
 * Text that is several blocks (a paste, an import) put in at a point: the
 * first piece joins the block the caret is in, the last piece takes the rest
 * of that block, and whole blocks go between. Pictures, lines and tables go
 * in as blocks of their own, splitting the paragraph at the caret; into a
 * table's cell, everything arrives as lines of words.
 */
export function insertAt(doc: WriteDoc, at: Point, add: Block[]): { doc: WriteDoc; caret: Point } {
  if (!add.length) return { doc, caret: at };
  const i = blockIndex(doc, at.block);
  if (i < 0) {
    const cell = findText(doc, at.block);
    if (!cell) return { doc: insertBlocks(doc, null, add), caret: at };
    const flat = flatten(add);
    const off = Math.max(0, Math.min(cell.text.length, at.offset));
    const spliced = spliceBlock(cell, off, off, flat.text);
    const next = withMarks(spliced, [...(spliced.marks ?? []), ...shifted(flat.marks, off)]);
    return { doc: replaceText(doc, next), caret: { block: cell.id, offset: off + flat.text.length } };
  }
  const host = doc.blocks[i];
  const taken = new Set(doc.blocks.map((b) => b.id));
  if (isOpaque(host.t)) {
    const fresh = add.map((b) => freshen(b, taken));
    const pos = at.offset >= 1 ? i + 1 : i;
    const blocks = [...doc.blocks.slice(0, pos), ...fresh, ...doc.blocks.slice(pos)];
    const lastText = [...fresh].reverse().find((b) => isTextType(b.t));
    return { doc: setBlocks(doc, blocks), caret: lastText ? { block: lastText.id, offset: lastText.text.length } : caretNear(blocks, pos + fresh.length) };
  }
  if (add.some((b) => isOpaque(b.t))) {
    const off = Math.max(0, Math.min(host.text.length, at.offset));
    const fresh = add.map((b) => freshen(b, taken));
    // at the start of a paragraph (or on an empty line) they go above it, and the caret stays where it was
    if (off === 0) {
      const blocks = [...doc.blocks.slice(0, i), ...fresh, host, ...doc.blocks.slice(i + 1)];
      return { doc: setBlocks(doc, blocks), caret: { block: host.id, offset: 0 } };
    }
    // anywhere else the paragraph splits around them; its first part keeps what it cites
    const before = withMarks({ ...host, text: host.text.slice(0, off) }, sliceMarks(host, 0, off));
    const rest = host.text.slice(off);
    const needAfter = !!rest || isOpaque(fresh[fresh.length - 1].t);
    const after: Block = withMarks(
      { id: uid('b'), t: rest ? host.t : 'p', text: rest, ...(rest && host.lvl ? { lvl: host.lvl } : {}), ...paraAttrs(host) },
      sliceMarks(host, off, host.text.length)
    );
    const seq = [before, ...fresh, ...(needAfter ? [after] : [])];
    const blocks = [...doc.blocks.slice(0, i), ...seq, ...doc.blocks.slice(i + 1)];
    const lastText = [...fresh].reverse().find((b) => isTextType(b.t));
    const caret = needAfter ? { block: after.id, offset: 0 } : lastText ? { block: lastText.id, offset: lastText.text.length } : caretNear(blocks, i + seq.length);
    return { doc: setBlocks(doc, blocks), caret };
  }
  if (add.length === 1) {
    const one = add[0];
    const spliced = spliceBlock(host, at.offset, at.offset, one.text);
    const marks = [...(spliced.marks ?? []), ...shifted(one.marks, at.offset)];
    // A pasted heading into an empty paragraph is a heading; into words, it is words.
    const shape = !host.text && host.t === 'p' ? { t: one.t, ...(one.lvl ? { lvl: one.lvl } : {}), ...paraAttrs(one) } : {};
    const cites = uniqBy([...(host.cites ?? []), ...(one.cites ?? [])], (c) => `${c.doc}:${c.block}`).slice(0, MAX_CITES);
    const next = withMarks({ ...spliced, ...shape, ...(cites.length ? { cites } : {}) }, marks);
    return { doc: replaceBlock(doc, next), caret: { block: host.id, offset: at.offset + one.text.length } };
  }
  const before = withMarks({ ...host, text: host.text.slice(0, at.offset) }, sliceMarks(host, 0, at.offset));
  const restText = host.text.slice(at.offset);
  const restMarks = sliceMarks(host, at.offset, host.text.length);
  const first = add[0];
  const last = add[add.length - 1];
  const head = withMarks(
    { ...before, text: before.text + first.text, ...(!before.text && host.t === 'p' ? { t: first.t, ...(first.lvl ? { lvl: first.lvl } : {}), ...paraAttrs(first) } : {}) },
    [...(before.marks ?? []), ...shifted(first.marks, before.text.length)]
  );
  const middle = add.slice(1, -1).map((b) => freshen(b, taken));
  const tailId = taken.has(last.id) || !ID.test(last.id) ? uid('b') : last.id;
  const tail = withMarks({ ...last, id: tailId, text: last.text + restText }, [...(last.marks ?? []), ...shifted(restMarks, last.text.length)]);
  const blocks = [...doc.blocks.slice(0, i), head, ...middle, tail, ...doc.blocks.slice(i + 1)];
  return { doc: setBlocks(doc, blocks), caret: { block: tail.id, offset: last.text.length } };
}

/**
 * Around every picture, line and table there is a line to type on: one after
 * it when it is the last block or another one follows. So the caret can
 * always be put past it — and nothing anyone wrote is touched.
 */
export function withTextAround(doc: WriteDoc): WriteDoc {
  let changed = false;
  const out: Block[] = [];
  doc.blocks.forEach((b, k) => {
    out.push(b);
    const next = doc.blocks[k + 1];
    if (isOpaque(b.t) && (!next || isOpaque(next.t))) {
      out.push(emptyBlock());
      changed = true;
    }
  });
  return changed ? { ...doc, blocks: out } : doc;
}

export function setBlockType(doc: WriteDoc, id: string, t: BlockType): WriteDoc {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b || !isTextType(b.t) || !isTextType(t)) return doc;
  const { lvl: _l, ...rest } = b;
  const next: Block = isList(t) ? { ...rest, t, lvl: b.lvl ?? 1 } : { ...rest, t };
  if (t === 'code') {
    delete next.marks;
    delete next.align;
    delete next.ind;
  }
  return replaceBlock(doc, next);
}

/** Tab and Shift+Tab in a list: one level deeper or shallower, between 1 and 3. */
export function indentBlock(doc: WriteDoc, id: string, delta: number): WriteDoc {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b || !isList(b.t)) return doc;
  const lvl = Math.max(1, Math.min(3, (b.lvl ?? 1) + delta));
  return lvl === (b.lvl ?? 1) ? doc : replaceBlock(doc, { ...b, lvl });
}

/** Indent or outdent: a list item a level, any other paragraph half an inch — between none and eight steps. */
export function indentBlocks(doc: WriteDoc, ids: string[], delta: number): WriteDoc {
  let next = doc;
  for (const id of ids) {
    const b = next.blocks.find((x) => x.id === id);
    if (!b || !isTextType(b.t) || b.t === 'code') continue;
    if (isList(b.t)) {
      next = indentBlock(next, id, delta);
      continue;
    }
    const ind = Math.max(0, Math.min(8, (b.ind ?? 0) + delta));
    if (ind === (b.ind ?? 0)) continue;
    const { ind: _i, ...rest } = b;
    next = replaceBlock(next, ind ? { ...b, ind } : rest);
  }
  return next;
}

/** Move blocks (kept in their order) to before the block at `to` in the CURRENT order; `to` = length is the end. */
export function moveBlocks(doc: WriteDoc, ids: string[], to: number): WriteDoc {
  const set = new Set(ids);
  const moving = doc.blocks.filter((b) => set.has(b.id));
  if (!moving.length) return doc;
  const before = doc.blocks.slice(0, Math.max(0, Math.min(doc.blocks.length, to))).filter((b) => !set.has(b.id)).length;
  const rest = doc.blocks.filter((b) => !set.has(b.id));
  const blocks = [...rest.slice(0, before), ...moving, ...rest.slice(before)];
  return blocks.every((b, k) => b === doc.blocks[k]) ? doc : setBlocks(doc, blocks);
}

/** Alt+Shift+↑/↓: one block up or down past its neighbour. */
export function nudgeBlock(doc: WriteDoc, id: string, dir: -1 | 1): WriteDoc {
  const i = blockIndex(doc, id);
  if (i < 0) return doc;
  const to = dir < 0 ? i - 1 : i + 2;
  if (to < 0 || to > doc.blocks.length) return doc;
  return moveBlocks(doc, [id], to);
}

export function removeBlocks(doc: WriteDoc, ids: string[]): WriteDoc {
  const set = new Set(ids);
  return setBlocks(
    doc,
    doc.blocks.filter((b) => !set.has(b.id))
  );
}

/** Several list items or short paragraphs, made one paragraph — their words, in order, joined. */
export function joinIntoParagraph(doc: WriteDoc, ids: string[]): WriteDoc {
  const set = new Set(ids);
  const picked = doc.blocks.filter((b) => set.has(b.id) && isTextType(b.t));
  if (picked.length < 2) return doc;
  let text = '';
  const marks: Mark[] = [];
  for (const b of picked) {
    const t = b.text.trim();
    if (!t) continue;
    const lead = b.text.length - b.text.trimStart().length;
    const sep = text && !/[.!?:;…]["”’)]?$/.test(text) ? '. ' : text ? ' ' : '';
    const at = text.length + sep.length;
    text += sep + t;
    for (const m of b.marks ?? []) marks.push({ ...m, s: m.s - lead + at, e: m.e - lead + at });
  }
  const first = picked[0];
  const cites = uniqBy(picked.flatMap((b) => b.cites ?? []), (c) => `${c.doc}:${c.block}`).slice(0, MAX_CITES);
  const from = Array.from(new Set(picked.flatMap((b) => b.from ?? [])));
  const joined = withMarks({ id: first.id, t: 'p', text, ...paraAttrs(first), ...(cites.length ? { cites } : {}), ...(from.length ? { from } : {}) }, marks);
  const blocks: Block[] = [];
  for (const b of doc.blocks) {
    if (b.id === first.id) blocks.push(joined);
    else if (!set.has(b.id) || !isTextType(b.t)) blocks.push(b);
  }
  return setBlocks(doc, blocks);
}

// ── pictures, lines, page breaks ─────────────────────────────────────

export function makeImage(o: { src: string; alt?: string; w?: number; iw?: number; ih?: number; by?: string; align?: Align }): Block {
  return {
    id: uid('b'),
    t: 'img',
    text: '',
    src: o.src,
    ...(o.alt?.trim() ? { alt: clip(o.alt.replace(/\s+/g, ' ').trim(), MAX_ALT) } : {}),
    ...(o.w ? { w: Math.max(5, Math.min(100, Math.round(o.w))) } : {}),
    ...(o.iw ? { iw: Math.max(1, Math.min(20_000, Math.round(o.iw))) } : {}),
    ...(o.ih ? { ih: Math.max(1, Math.min(20_000, Math.round(o.ih))) } : {}),
    ...(o.by && OWNER.test(o.by) ? { by: o.by } : {}),
    ...(o.align ? { align: o.align } : {}),
  };
}

/** A picture's description, width or owner changed; anything else about it stays. */
export function setImage(doc: WriteDoc, id: string, patch: { alt?: string; w?: number; by?: string; align?: Align | null }): WriteDoc {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b || b.t !== 'img') return doc;
  const next: Block = { ...b };
  if (patch.alt !== undefined) {
    const alt = clip(patch.alt.replace(/\s+/g, ' ').trim(), MAX_ALT);
    if (alt) next.alt = alt;
    else delete next.alt;
  }
  if (patch.w !== undefined) next.w = Math.max(5, Math.min(100, Math.round(patch.w)));
  if (patch.by !== undefined && OWNER.test(patch.by)) next.by = patch.by;
  if (patch.align !== undefined) {
    if (patch.align) next.align = patch.align;
    else delete next.align;
  }
  return replaceBlock(doc, next);
}

export const makeRule = (): Block => ({ id: uid('b'), t: 'hr', text: '' });
export const makePageBreak = (): Block => ({ id: uid('b'), t: 'pb', text: '' });

/** Every picture the writing holds — and every version of it — by media id. */
export function mediaIds(doc: Pick<WriteDoc, 'blocks' | 'versions'>): string[] {
  const out = new Set<string>();
  const add = (bs: Block[]) => {
    for (const b of bs) if (b.t === 'img' && b.src && MEDIA_SRC.test(b.src)) out.add(b.src.slice(2));
  };
  add(doc.blocks);
  for (const v of doc.versions ?? []) add(v.blocks);
  return Array.from(out);
}

// ── tables ───────────────────────────────────────────────────────────

export function emptyCell(): Block {
  return { id: uid('td'), t: 'p', text: '' };
}

/** A table's words as lines of tab-separated cells — what anything that reads only words reads. */
export function tableText(rows: readonly Block[][]): string {
  return rows.map((r) => r.map((c) => c.text.replace(/[\t\n]+/g, ' ')).join('\t')).join('\n');
}

function withTableText(b: Block): Block {
  return { ...b, text: tableText(b.rows ?? []) };
}

/** A table of empty cells, `rows` by `cols`; a header row unless asked otherwise. */
export function makeTable(rows = 3, cols = 3, head = true): Block {
  const r = Math.max(1, Math.min(MAX_TABLE_ROWS, Math.floor(rows)));
  const c = Math.max(1, Math.min(MAX_TABLE_COLS, Math.floor(cols)));
  const cells = Array.from({ length: r }, () => Array.from({ length: c }, emptyCell));
  return withTableText({ id: uid('b'), t: 'table', text: '', rows: cells, ...(head ? { head: true } : {}) });
}

/** A table made from rows of words (an import, a paste). */
export function tableFrom(rows: Block[][], opts: { head?: boolean; cols?: number[] } = {}): Block | null {
  const width = Math.min(MAX_TABLE_COLS, Math.max(0, ...rows.map((r) => r.length)));
  if (!width || !rows.length) return null;
  const body = rows.slice(0, MAX_TABLE_ROWS).map((r) => Array.from({ length: width }, (_, k) => cellOf(r[k])));
  const cols = opts.cols && opts.cols.length === width ? normalizeCols(opts.cols) : undefined;
  return withTableText({ id: uid('b'), t: 'table', text: '', rows: body, ...(opts.head ? { head: true } : {}), ...(cols ? { cols } : {}) });
}

function cellOf(b: Block | undefined): Block {
  if (!b) return emptyCell();
  const text = clip(b.text, MAX_CELL_CHARS);
  return withMarks({ id: ID.test(b.id) ? b.id : uid('td'), t: 'p', text, ...(b.align ? { align: b.align } : {}) }, b.marks ?? []);
}

/** Column widths as fractions that add to one, none narrower than a sliver. */
export function normalizeCols(cols: readonly number[]): number[] | undefined {
  const xs = cols.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = xs.reduce((n, x) => n + x, 0);
  if (!(sum > 0)) return undefined;
  const fr = xs.map((x) => Math.max(0.03, x / sum));
  const total = fr.reduce((n, x) => n + x, 0);
  return fr.map((x) => Math.round((x / total) * 10_000) / 10_000);
}

/** A cell, by its id: its table, the table's index, its row and column. */
export function findCell(doc: Pick<WriteDoc, 'blocks'>, cellId: string): { table: Block; ti: number; r: number; c: number; cell: Block } | null {
  for (let ti = 0; ti < doc.blocks.length; ti++) {
    const t = doc.blocks[ti];
    if (t.t !== 'table') continue;
    const rows = t.rows ?? [];
    for (let r = 0; r < rows.length; r++)
      for (let c = 0; c < rows[r].length; c++) if (rows[r][c].id === cellId) return { table: t, ti, r, c, cell: rows[r][c] };
  }
  return null;
}

/** One cell's words replaced; the table's words follow. */
export function updateCell(doc: WriteDoc, cellId: string, next: Block): WriteDoc {
  const at = findCell(doc, cellId);
  if (!at) return doc;
  const cell: Block = withMarks({ ...next, id: cellId, t: 'p', text: clip(next.text, MAX_CELL_CHARS) }, next.marks ?? []);
  const rows = (at.table.rows ?? []).map((row, r) => (r === at.r ? row.map((c, k) => (k === at.c ? cell : c)) : row));
  return replaceBlock(doc, withTableText({ ...at.table, rows }));
}

function editTable(doc: WriteDoc, tableId: string, fn: (t: Block) => Block | null): WriteDoc {
  const t = doc.blocks.find((b) => b.id === tableId);
  if (!t || t.t !== 'table') return doc;
  const next = fn(t);
  if (next === t) return doc;
  if (!next) return removeBlocks(doc, [tableId]);
  return replaceBlock(doc, withTableText(next));
}

/** A row of empty cells put in at `at` (0 is the top). */
export function insertRow(doc: WriteDoc, tableId: string, at: number): WriteDoc {
  return editTable(doc, tableId, (t) => {
    const rows = t.rows ?? [];
    if (rows.length >= MAX_TABLE_ROWS) return t;
    const width = rows[0]?.length ?? 1;
    const k = Math.max(0, Math.min(rows.length, at));
    const row = Array.from({ length: width }, emptyCell);
    return { ...t, rows: [...rows.slice(0, k), row, ...rows.slice(k)] };
  });
}

/** A row taken out; the last row taken out takes the table. */
export function deleteRow(doc: WriteDoc, tableId: string, r: number): WriteDoc {
  return editTable(doc, tableId, (t) => {
    const rows = (t.rows ?? []).filter((_, k) => k !== r);
    if (!rows.length) return null;
    return { ...t, rows };
  });
}

/** A column of empty cells put in at `at` (0 is the left); the widths make room for it. */
export function insertCol(doc: WriteDoc, tableId: string, at: number): WriteDoc {
  return editTable(doc, tableId, (t) => {
    const rows = t.rows ?? [];
    const width = rows[0]?.length ?? 0;
    if (width >= MAX_TABLE_COLS) return t;
    const k = Math.max(0, Math.min(width, at));
    const cols = t.cols ? normalizeCols([...t.cols.slice(0, k), 1 / (width + 1), ...t.cols.slice(k)]) : undefined;
    const next: Block = { ...t, rows: rows.map((row) => [...row.slice(0, k), emptyCell(), ...row.slice(k)]) };
    if (cols) next.cols = cols;
    return next;
  });
}

/** A column taken out; the last column taken out takes the table. */
export function deleteCol(doc: WriteDoc, tableId: string, c: number): WriteDoc {
  return editTable(doc, tableId, (t) => {
    const rows = (t.rows ?? []).map((row) => row.filter((_, k) => k !== c));
    if (!rows[0]?.length) return null;
    const next: Block = { ...t, rows };
    if (t.cols) {
      const cols = normalizeCols(t.cols.filter((_, k) => k !== c));
      if (cols) next.cols = cols;
      else delete next.cols;
    }
    return next;
  });
}

/** Whether the first row is a header row; the columns' widths. */
export function setTable(doc: WriteDoc, tableId: string, patch: { head?: boolean; cols?: number[] | null }): WriteDoc {
  return editTable(doc, tableId, (t) => {
    const next: Block = { ...t };
    if (patch.head !== undefined) {
      if (patch.head) next.head = true;
      else delete next.head;
    }
    if (patch.cols !== undefined) {
      const width = t.rows?.[0]?.length ?? 0;
      const cols = patch.cols && patch.cols.length === width ? normalizeCols(patch.cols) : undefined;
      if (cols) next.cols = cols;
      else delete next.cols;
    }
    return next;
  });
}

// ── find and replace ─────────────────────────────────────────────────

export interface Hit {
  block: string;
  s: number;
  e: number;
}

/** Every place some words are, in reading order — in paragraphs, headings, lists, code and table cells. */
export function findAll(doc: Pick<WriteDoc, 'blocks'>, query: string, opts: { matchCase?: boolean; wholeWord?: boolean } = {}, max = 5000): Hit[] {
  if (!query) return [];
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const src = opts.wholeWord ? `(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])` : esc;
  const re = new RegExp(src, `gu${opts.matchCase ? '' : 'i'}`);
  const out: Hit[] = [];
  for (const b of textBlocks(doc)) {
    re.lastIndex = 0;
    for (let m = re.exec(b.text); m; m = re.exec(b.text)) {
      if (!m[0].length) {
        re.lastIndex++;
        continue;
      }
      out.push({ block: b.id, s: m.index, e: m.index + m[0].length });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** The found words replaced, each where it is, its marks carried onto what replaced it. */
export function replaceHits(doc: WriteDoc, hits: Hit[], replacement: string): WriteDoc {
  const by = new Map<string, Hit[]>();
  for (const h of hits) by.set(h.block, [...(by.get(h.block) ?? []), h]);
  let next = doc;
  for (const [id, hs] of Array.from(by)) {
    let b = findText(next, id);
    if (!b) continue;
    for (const h of [...hs].sort((x, y) => y.s - x.s)) b = spliceBlock(b, h.s, h.e, replacement);
    next = replaceText(next, b);
  }
  return next;
}

// ── the outline: headings, and the sections under them ──────────────

export interface OutlineItem {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  index: number;
}

export function outlineOf(doc: Pick<WriteDoc, 'blocks'>): OutlineItem[] {
  const out: OutlineItem[] = [];
  doc.blocks.forEach((b, index) => {
    if (isHeading(b.t) && b.text.trim()) out.push({ id: b.id, level: Number(b.t[1]) as 1 | 2 | 3, text: b.text.replace(/\s+/g, ' ').trim(), index });
  });
  return out;
}

/** A heading's section: it and everything under it, to the next heading of its level or higher — [start, end). */
export function sectionOf(doc: Pick<WriteDoc, 'blocks'>, headingId: string): [number, number] | null {
  const i = blockIndex(doc, headingId);
  const h = doc.blocks[i];
  if (!h || !isHeading(h.t)) return null;
  const lvl = Number(h.t[1]);
  let e = i + 1;
  while (e < doc.blocks.length && !(isHeading(doc.blocks[e].t) && Number(doc.blocks[e].t[1]) <= lvl)) e++;
  return [i, e];
}

/** A section moved past the section before or after it at the same level; nothing in either is changed. */
export function moveSection(doc: WriteDoc, headingId: string, dir: -1 | 1): WriteDoc {
  const sec = sectionOf(doc, headingId);
  if (!sec) return doc;
  const [s, e] = sec;
  const lvl = Number(doc.blocks[s].t[1]);
  if (dir < 0) {
    // the section before it at its level, past any headings under that one
    let k = s - 1;
    while (k >= 0 && !(isHeading(doc.blocks[k].t) && Number(doc.blocks[k].t[1]) <= lvl)) k--;
    if (k < 0 || Number(doc.blocks[k].t[1]) !== lvl) return doc;
    const blocks = [...doc.blocks.slice(0, k), ...doc.blocks.slice(s, e), ...doc.blocks.slice(k, s), ...doc.blocks.slice(e)];
    return setBlocks(doc, blocks);
  }
  const nb = doc.blocks[e];
  if (!nb || !isHeading(nb.t) || Number(nb.t[1]) !== lvl) return doc;
  const next = sectionOf(doc, nb.id)!;
  const blocks = [...doc.blocks.slice(0, s), ...doc.blocks.slice(next[0], next[1]), ...doc.blocks.slice(s, e), ...doc.blocks.slice(next[1])];
  return setBlocks(doc, blocks);
}

// ── citations ────────────────────────────────────────────────────────

export function addCite(doc: WriteDoc, blockId: string, cite: Omit<Cite, 'id'>): WriteDoc {
  const b = doc.blocks.find((x) => x.id === blockId);
  if (!b || !isTextType(b.t)) return doc;
  if ((b.cites ?? []).some((c) => c.doc === cite.doc && c.block === cite.block)) return doc;
  const next: Cite = { id: uid('c'), doc: cite.doc, block: cite.block, label: clip(cite.label, MAX_LABEL), ...(cite.quote ? { quote: clip(cite.quote, MAX_QUOTE) } : {}) };
  return replaceBlock(doc, { ...b, cites: [...(b.cites ?? []), next].slice(0, MAX_CITES) });
}

export function removeCite(doc: WriteDoc, blockId: string, citeId: string): WriteDoc {
  const b = doc.blocks.find((x) => x.id === blockId);
  if (!b?.cites) return doc;
  const cites = b.cites.filter((c) => c.id !== citeId);
  const { cites: _c, ...rest } = b;
  return replaceBlock(doc, cites.length ? { ...rest, cites } : rest);
}

/** Every passage the writing cites, numbered in order of first use — the Sources list of an export. */
export function citedSources(doc: Pick<WriteDoc, 'blocks'>): { key: string; n: number; cite: Cite }[] {
  const out: { key: string; n: number; cite: Cite }[] = [];
  const seen = new Map<string, number>();
  for (const b of doc.blocks)
    for (const c of b.cites ?? []) {
      const key = `${c.doc}:${c.block}`;
      if (seen.has(key)) continue;
      seen.set(key, out.length + 1);
      out.push({ key, n: out.length + 1, cite: c });
    }
  return out;
}

// ── the Draft Space: cards and groups ────────────────────────────────

/**
 * A first guess at what a card is, from its own wording — shown as a chip the
 * person changes with one tap. When nothing in the words says, it is an idea.
 */
export function guessKind(text: string): CardKind {
  const t = text.trim().toLowerCase();
  if (!t) return 'idea';
  if (/\?\s*$/.test(t)) return 'question';
  if (/^(but|however|although|though|yet|critics|some (would|might) (say|argue)|on the other hand|counter|objection|the opposing)/.test(t)) return 'counter';
  if (/^(so|therefore|thus|hence|in conclusion|overall|this means|which means|ultimately|in the end)\b/.test(t)) return 'conclusion';
  if (/^(for example|for instance|e\.g\.|like when|such as|imagine|take the case|consider)\b/.test(t)) return 'example';
  if (/(\d+(\.\d+)?\s?(%|percent|per cent)|\b(study|studies|survey|data|research|report|according to|found that|shows that|evidence)\b)/.test(t)) return 'evidence';
  if (/^(i (think|believe|argue)|my (claim|argument|point|thesis)|the (main )?(point|argument|claim) is)\b/.test(t) || /\b(should|must|is better|is worse|causes|leads to)\b/.test(t)) return 'claim';
  return 'idea';
}

export function addCard(doc: WriteDoc, text: string, opts: { kind?: CardKind; group?: string | null; links?: CardLink[]; at?: number; after?: string } = {}): { doc: WriteDoc; card: Card } {
  const card: Card = {
    id: uid('k'),
    kind: opts.kind ?? guessKind(text),
    text: clip(text.replace(/\r\n?/g, '\n').trim(), MAX_CARD_CHARS),
    group: opts.group !== undefined && (opts.group === null || doc.groups.some((g) => g.id === opts.group)) ? opts.group : null,
    ...(opts.links?.length ? { links: opts.links.slice(0, MAX_LINKS) } : {}),
    at: opts.at ?? Date.now(),
  };
  if (doc.cards.length >= MAX_CARDS) return { doc, card };
  const i = opts.after ? doc.cards.findIndex((c) => c.id === opts.after) : -1;
  const cards = i >= 0 ? [...doc.cards.slice(0, i + 1), card, ...doc.cards.slice(i + 1)] : [...doc.cards, card];
  return { doc: { ...doc, cards }, card };
}

export function updateCard(doc: WriteDoc, id: string, patch: Partial<Pick<Card, 'kind' | 'text' | 'links'>>): WriteDoc {
  return {
    ...doc,
    cards: doc.cards.map((c) => {
      if (c.id !== id) return c;
      const next: Card = { ...c, ...patch };
      if (patch.text !== undefined) next.text = clip(patch.text.replace(/\r\n?/g, '\n'), MAX_CARD_CHARS);
      if (patch.links !== undefined) {
        const links = uniqBy(patch.links, (l) => `${l.k}:${l.doc ?? ''}:${l.id}`).slice(0, MAX_LINKS);
        if (links.length) next.links = links;
        else delete next.links;
      }
      return next;
    }),
  };
}

export function linkCard(doc: WriteDoc, id: string, link: CardLink): WriteDoc {
  const c = doc.cards.find((x) => x.id === id);
  if (!c || (link.k === 'card' && link.id === id)) return doc;
  const tidy: CardLink = { k: link.k, id: link.id, label: clip(link.label, MAX_LABEL), ...(link.doc ? { doc: link.doc } : {}), ...(link.quote ? { quote: clip(link.quote, MAX_QUOTE) } : {}) };
  return updateCard(doc, id, { links: [...(c.links ?? []), tidy] });
}

export function unlinkCard(doc: WriteDoc, id: string, link: Pick<CardLink, 'k' | 'id' | 'doc'>): WriteDoc {
  const c = doc.cards.find((x) => x.id === id);
  if (!c?.links) return doc;
  return updateCard(doc, id, { links: c.links.filter((l) => !(l.k === link.k && l.id === link.id && (l.doc ?? '') === (link.doc ?? ''))) });
}

/** Cards removed; the links other cards had to them go too. */
export function removeCards(doc: WriteDoc, ids: string[]): WriteDoc {
  const set = new Set(ids);
  return {
    ...doc,
    cards: doc.cards
      .filter((c) => !set.has(c.id))
      .map((c) => {
        if (!c.links?.some((l) => l.k === 'card' && set.has(l.id))) return c;
        const links = c.links.filter((l) => !(l.k === 'card' && set.has(l.id)));
        const { links: _l, ...rest } = c;
        return links.length ? { ...rest, links } : rest;
      }),
  };
}

/** Cards in a group, in their order on the board. */
export function cardsIn(doc: Pick<WriteDoc, 'cards'>, group: string | null): Card[] {
  return doc.cards.filter((c) => c.group === group);
}

/**
 * A card moved to a group (null: the loose pile), to position `index` among
 * that group's cards as they are now, the card itself not counted.
 */
export function moveCard(doc: WriteDoc, id: string, group: string | null, index: number): WriteDoc {
  const card = doc.cards.find((c) => c.id === id);
  if (!card) return doc;
  if (group !== null && !doc.groups.some((g) => g.id === group)) return doc;
  const rest = doc.cards.filter((c) => c.id !== id);
  const there = rest.filter((c) => c.group === group);
  const moved: Card = { ...card, group };
  const k = Math.max(0, Math.min(there.length, index));
  let at: number;
  if (!there.length) at = rest.length;
  else if (k < there.length) at = rest.indexOf(there[k]);
  else at = rest.indexOf(there[there.length - 1]) + 1;
  const cards = [...rest.slice(0, at), moved, ...rest.slice(at)];
  return { ...doc, cards };
}

/**
 * Cards made one: their words in board order, joined; every link kept; the
 * first card's kind and place. Blocks that grew from any of them now point at
 * the one that is left.
 */
export function mergeCards(doc: WriteDoc, ids: string[]): { doc: WriteDoc; card: Card | null } {
  const set = new Set(ids);
  const picked = doc.cards.filter((c) => set.has(c.id));
  if (picked.length < 2) return { doc, card: null };
  const first = picked[0];
  const text = clip(
    picked
      .map((c) => c.text.trim())
      .filter(Boolean)
      .join(' '),
    MAX_CARD_CHARS
  );
  const links = uniqBy(
    picked.flatMap((c) => c.links ?? []).filter((l) => !(l.k === 'card' && set.has(l.id))),
    (l) => `${l.k}:${l.doc ?? ''}:${l.id}`
  ).slice(0, MAX_LINKS);
  const merged: Card = { ...first, text, ...(links.length ? { links } : {}) };
  if (!links.length) delete merged.links;
  const gone = new Set(picked.slice(1).map((c) => c.id));
  const cards = doc.cards
    .filter((c) => !gone.has(c.id))
    .map((c) => {
      if (c.id === first.id) return merged;
      if (!c.links?.some((l) => l.k === 'card' && gone.has(l.id))) return c;
      const relinked = uniqBy(
        c.links.map((l) => (l.k === 'card' && gone.has(l.id) ? { ...l, id: first.id, label: clip(text, MAX_LABEL) } : l)),
        (l) => `${l.k}:${l.doc ?? ''}:${l.id}`
      );
      return { ...c, links: relinked };
    });
  const blocks = doc.blocks.map((b) => {
    if (!b.from?.some((f) => gone.has(f))) return b;
    return { ...b, from: Array.from(new Set(b.from.map((f) => (gone.has(f) ? first.id : f)))) };
  });
  return { doc: { ...doc, cards, blocks }, card: merged };
}

export function addGroup(doc: WriteDoc, title = '', after?: string): { doc: WriteDoc; group: Group } {
  const group: Group = { id: uid('g'), title: clip(title.replace(/\s+/g, ' ').trim(), MAX_LABEL) };
  if (doc.groups.length >= MAX_GROUPS) return { doc, group };
  const i = after ? doc.groups.findIndex((g) => g.id === after) : -1;
  const groups = i >= 0 ? [...doc.groups.slice(0, i + 1), group, ...doc.groups.slice(i + 1)] : [...doc.groups, group];
  return { doc: { ...doc, groups }, group };
}

export function renameGroup(doc: WriteDoc, id: string, title: string): WriteDoc {
  return { ...doc, groups: doc.groups.map((g) => (g.id === id ? { ...g, title: clip(title.replace(/\s+/g, ' '), MAX_LABEL) } : g)) };
}

/** A group taken away; its cards go back to the loose pile, nothing is lost. */
export function removeGroup(doc: WriteDoc, id: string): WriteDoc {
  return {
    ...doc,
    groups: doc.groups.filter((g) => g.id !== id),
    cards: doc.cards.map((c) => (c.group === id ? { ...c, group: null } : c)),
  };
}

export function moveGroup(doc: WriteDoc, id: string, dir: -1 | 1): WriteDoc {
  const i = doc.groups.findIndex((g) => g.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= doc.groups.length) return doc;
  const groups = [...doc.groups];
  [groups[i], groups[j]] = [groups[j], groups[i]];
  return { ...doc, groups };
}

/** Selected cards gathered into a new group, in board order, placed after the group the first one was in. */
export function groupCards(doc: WriteDoc, ids: string[], title = ''): { doc: WriteDoc; group: Group | null } {
  const set = new Set(ids);
  const picked = doc.cards.filter((c) => set.has(c.id));
  if (!picked.length) return { doc, group: null };
  const after = picked[0].group ?? undefined;
  const made = addGroup(doc, title, after);
  if (made.doc === doc) return { doc, group: null };
  let next = made.doc;
  picked.forEach((c, k) => {
    next = moveCard(next, c.id, made.group.id, k);
  });
  return { doc: next, group: made.group };
}

// ── versions ─────────────────────────────────────────────────────────

const AUTO_EVERY = 10 * 60_000;

function writingKey(title: string, blocks: Block[]): string {
  return title + '\u0001' + blocks.map((b) => `${b.t}${b.lvl ?? ''}:${b.text}${b.src ?? ''}`).join('\u0002');
}

/** The writing kept as a version — unless it is exactly the version kept last. Old automatic ones go first. */
export function keepVersion(doc: WriteDoc, why: VersionWhy, now = Date.now(), name?: string): WriteDoc {
  if (isEmptyDoc({ ...doc, cards: [] })) return doc;
  const last = doc.versions[0];
  if (last && writingKey(last.title, last.blocks) === writingKey(doc.title, doc.blocks) && !name) return doc;
  const v: Version = { id: uid('v'), at: now, why, ...(name?.trim() ? { name: clip(name.trim(), 80) } : {}), title: doc.title, blocks: doc.blocks };
  return { ...doc, versions: boundVersions([v, ...doc.versions]) };
}

/** Kept when it has been a while since the last one and the writing has moved on. */
export function dueForVersion(doc: WriteDoc, now = Date.now()): boolean {
  if (isEmptyDoc({ ...doc, cards: [] })) return false;
  const last = doc.versions[0];
  if (!last) return wordCount(docText(doc)) >= 30;
  if (now - last.at < AUTO_EVERY) return false;
  return writingKey(last.title, last.blocks) !== writingKey(doc.title, doc.blocks);
}

/** The writing put back as it was. What was there is kept first, so a restore is never a loss. */
export function restoreVersion(doc: WriteDoc, id: string, now = Date.now()): WriteDoc {
  const v = doc.versions.find((x) => x.id === id);
  if (!v) return doc;
  const kept = keepVersion(doc, 'restore', now);
  return { ...kept, title: v.title, blocks: v.blocks.length ? v.blocks : [emptyBlock()] };
}

function boundVersions(list: Version[]): Version[] {
  const out = list.slice(0, MAX_VERSIONS * 2);
  const size = (vs: Version[]) => vs.reduce((n, v) => n + v.title.length + v.blocks.reduce((m, b) => m + b.text.length, 0), 0);
  // the oldest automatic ones go first; named ones and the newest stay longest
  while (out.length > MAX_VERSIONS || (out.length > 1 && size(out) > MAX_VERSION_CHARS)) {
    let drop = -1;
    for (let k = out.length - 1; k > 0; k--) if (!out[k].name) { drop = k; break; }
    out.splice(drop > 0 ? drop : out.length - 1, 1);
  }
  return out;
}

// ── storage: what arrives is checked, bounded, and never rewritten ──

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
// control characters other than newline and tab are not writing
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const cleanText = (v: unknown, n: number) => str(v, n).replace(/\r\n?/g, '\n').replace(CTRL, '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sanitizeMarksRaw(raw: unknown, len: number): Mark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const marks: Mark[] = [];
  for (const m of raw.slice(0, MAX_MARKS)) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    if (!(MARK_TYPES as readonly string[]).includes(r.t as string)) continue;
    if (typeof r.s !== 'number' || typeof r.e !== 'number') continue;
    const t = r.t as MarkType;
    if (isValued(t)) {
      const v = markValue(t, r.v);
      if (!v) continue;
      marks.push({ s: r.s, e: r.e, t, v });
    } else marks.push({ s: r.s, e: r.e, t });
  }
  return normalizeMarks(marks, len);
}

function sanitizeCite(raw: unknown): Cite | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const doc = str(r.doc, 64);
  const block = str(r.block, 64);
  if (!doc || !block) return null;
  return {
    id: typeof r.id === 'string' && ID.test(r.id) ? r.id : uid('c'),
    doc,
    block,
    label: cleanText(r.label, MAX_LABEL).replace(/\s+/g, ' ').trim() || 'a passage',
    ...(typeof r.quote === 'string' && r.quote.trim() ? { quote: cleanText(r.quote, MAX_QUOTE) } : {}),
  };
}

function sanitizeAttrs(r: Record<string, unknown>, b: Block) {
  if (typeof r.align === 'string' && (ALIGNS as readonly string[]).includes(r.align) && b.t !== 'code') b.align = r.align as Align;
  const ind = num(r.ind);
  if (ind && ind >= 1 && !isList(b.t) && b.t !== 'code' && b.t !== 'img') b.ind = Math.max(1, Math.min(8, Math.round(ind)));
  const lh = num(r.lh);
  if (lh && b.t !== 'img') b.lh = lineSpacing(lh);
  const sb = num(r.sb);
  if (sb !== null && b.t !== 'img') b.sb = points(sb);
  const sa = num(r.sa);
  if (sa !== null && b.t !== 'img') b.sa = points(sa);
}

function sanitizeCell(raw: unknown, budget: { left: number }, seen: Set<string>): Block {
  if (!raw || typeof raw !== 'object') return emptyCell();
  const r = raw as Record<string, unknown>;
  const text = cleanText(r.text, Math.min(MAX_CELL_CHARS, Math.max(0, budget.left)));
  budget.left -= text.length;
  let id = typeof r.id === 'string' && ID.test(r.id) ? r.id : uid('td');
  if (seen.has(id)) id = uid('td');
  seen.add(id);
  const c: Block = { id, t: 'p', text };
  const marks = sanitizeMarksRaw(r.marks, text.length);
  if (marks) c.marks = marks;
  if (typeof r.align === 'string' && (ALIGNS as readonly string[]).includes(r.align)) c.align = r.align as Align;
  return c;
}

function sanitizeBlock(raw: unknown, budget: { left: number }, seen: Set<string>): Block | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const t = (BLOCK_TYPES as readonly string[]).includes(r.t as string) ? (r.t as BlockType) : 'p';
  const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : uid('b');
  if (t === 'hr' || t === 'pb') return { id, t, text: '' };
  if (t === 'img') {
    if (typeof r.src !== 'string' || !MEDIA_SRC.test(r.src)) return null;
    const b: Block = { id, t, text: '', src: r.src };
    const alt = cleanText(r.alt, MAX_ALT).replace(/\s+/g, ' ').trim();
    if (alt) b.alt = alt;
    const w = num(r.w);
    if (w) b.w = Math.max(5, Math.min(100, Math.round(w)));
    const iw = num(r.iw);
    const ih = num(r.ih);
    if (iw && ih) {
      b.iw = Math.max(1, Math.min(20_000, Math.round(iw)));
      b.ih = Math.max(1, Math.min(20_000, Math.round(ih)));
    }
    if (typeof r.by === 'string' && OWNER.test(r.by)) b.by = r.by;
    if (typeof r.align === 'string' && (ALIGNS as readonly string[]).includes(r.align) && r.align !== 'justify') b.align = r.align as Align;
    return b;
  }
  if (t === 'table') {
    const rawRows = Array.isArray(r.rows) ? r.rows.slice(0, MAX_TABLE_ROWS).filter((x): x is unknown[] => Array.isArray(x)) : [];
    const width = Math.min(MAX_TABLE_COLS, Math.max(0, ...rawRows.map((x) => x.length)));
    if (!rawRows.length || !width) {
      // nothing a table can be made of: its words, if it had any, as a paragraph
      const text = cleanText(r.text, Math.min(MAX_BLOCK_CHARS, Math.max(0, budget.left)));
      budget.left -= text.length;
      return { id, t: 'p', text };
    }
    const rows = rawRows.map((row) => Array.from({ length: width }, (_, k) => sanitizeCell(row[k], budget, seen)));
    const b: Block = { id, t: 'table', text: tableText(rows), rows };
    if (Array.isArray(r.cols) && r.cols.length === width) {
      const cols = normalizeCols(r.cols.map((x) => (typeof x === 'number' ? x : 0)));
      if (cols) b.cols = cols;
    }
    if (r.head === true) b.head = true;
    return b;
  }
  const text = cleanText(r.text, Math.min(MAX_BLOCK_CHARS, Math.max(0, budget.left)));
  budget.left -= text.length;
  const b: Block = { id, t, text };
  const marks = t === 'code' ? undefined : sanitizeMarksRaw(r.marks, text.length);
  if (marks) b.marks = marks;
  if (isList(t)) b.lvl = typeof r.lvl === 'number' ? Math.max(1, Math.min(3, Math.floor(r.lvl))) : 1;
  sanitizeAttrs(r, b);
  if (Array.isArray(r.cites)) {
    const cites = r.cites.map(sanitizeCite).filter((c): c is Cite => !!c).slice(0, MAX_CITES);
    if (cites.length) b.cites = cites;
  }
  if (Array.isArray(r.from)) {
    const from = r.from.filter((f): f is string => typeof f === 'string' && ID.test(f)).slice(0, 24);
    if (from.length) b.from = from;
  }
  return b;
}

function sanitizeBlocks(raw: unknown, chars: number): Block[] {
  const budget = { left: chars };
  const seen = new Set<string>();
  const out: Block[] = [];
  for (const r of Array.isArray(raw) ? raw.slice(0, MAX_BLOCKS) : []) {
    const b = sanitizeBlock(r, budget, seen);
    if (!b) continue;
    if (seen.has(b.id)) b.id = uid('b');
    seen.add(b.id);
    out.push(b);
  }
  return out;
}

function sanitizeLink(raw: unknown): CardLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const k = r.k === 'doc' || r.k === 'node' || r.k === 'card' ? r.k : null;
  const id = str(r.id, 64);
  if (!k || !id) return null;
  const doc = k === 'doc' ? str(r.doc, 64) : '';
  if (k === 'doc' && !doc) return null;
  return {
    k,
    id,
    label: cleanText(r.label, MAX_LABEL).replace(/\s+/g, ' ').trim() || 'linked',
    ...(doc ? { doc } : {}),
    ...(typeof r.quote === 'string' && r.quote.trim() ? { quote: cleanText(r.quote, MAX_QUOTE) } : {}),
  };
}

/** Page setup as it arrives: a known paper, an orientation, margins between a quarter inch and three inches. */
export function sanitizePage(raw: unknown): PageSetup | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const size = typeof r.size === 'string' && Object.prototype.hasOwnProperty.call(PAPER, r.size) ? (r.size as PaperSize) : null;
  if (!size) return null;
  const orient = r.orient === 'landscape' ? 'landscape' : 'portrait';
  const m = Array.isArray(r.m) && r.m.length === 4 ? r.m.map((x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.max(0.25, Math.min(3, x)) * 100) / 100 : 1)) : [1, 1, 1, 1];
  return { size, orient, m: m as [number, number, number, number] };
}

/**
 * A document as it arrives — from storage, from a browser, from an older
 * version of Socria. Everything is checked and bounded; nothing that is
 * the person's writing is reworded, reordered or "cleaned up".
 */
export function sanitizeWriteDoc(raw: unknown): WriteDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 2 || !Array.isArray(r.blocks)) return null;
  const blocks = sanitizeBlocks(r.blocks, MAX_DOC_CHARS);
  const groups: Group[] = [];
  const gseen = new Set<string>();
  for (const g of Array.isArray(r.groups) ? r.groups.slice(0, MAX_GROUPS) : []) {
    if (!g || typeof g !== 'object') continue;
    const id = (g as Record<string, unknown>).id;
    if (typeof id !== 'string' || !ID.test(id) || gseen.has(id)) continue;
    gseen.add(id);
    groups.push({ id, title: cleanText((g as Record<string, unknown>).title, MAX_LABEL).replace(/\s+/g, ' ') });
  }
  const cards: Card[] = [];
  const cseen = new Set<string>();
  for (const c of Array.isArray(r.cards) ? r.cards.slice(0, MAX_CARDS) : []) {
    if (!c || typeof c !== 'object') continue;
    const x = c as Record<string, unknown>;
    let id = typeof x.id === 'string' && ID.test(x.id) ? x.id : uid('k');
    if (cseen.has(id)) id = uid('k');
    cseen.add(id);
    const links = (Array.isArray(x.links) ? x.links : []).map(sanitizeLink).filter((l): l is CardLink => !!l).slice(0, MAX_LINKS);
    cards.push({
      id,
      kind: (CARD_KINDS as readonly string[]).includes(x.kind as string) ? (x.kind as CardKind) : 'idea',
      text: cleanText(x.text, MAX_CARD_CHARS),
      group: typeof x.group === 'string' && gseen.has(x.group) ? x.group : null,
      ...(links.length ? { links } : {}),
      at: typeof x.at === 'number' && Number.isFinite(x.at) ? x.at : 0,
    });
  }
  const versions: Version[] = [];
  let vchars = MAX_VERSION_CHARS;
  for (const v of Array.isArray(r.versions) ? r.versions.slice(0, MAX_VERSIONS) : []) {
    if (!v || typeof v !== 'object' || vchars <= 0) continue;
    const x = v as Record<string, unknown>;
    const vb = sanitizeBlocks(x.blocks, vchars);
    vchars -= vb.reduce((n, b) => n + b.text.length, 0);
    versions.push({
      id: typeof x.id === 'string' && ID.test(x.id) ? x.id : uid('v'),
      at: typeof x.at === 'number' && Number.isFinite(x.at) ? x.at : 0,
      why: (VERSION_WHY as readonly string[]).includes(x.why as string) ? (x.why as VersionWhy) : 'auto',
      ...(typeof x.name === 'string' && x.name.trim() ? { name: cleanText(x.name, 80).trim() } : {}),
      title: cleanText(x.title, MAX_TITLE),
      blocks: vb,
    });
  }
  const dismissed = (Array.isArray(r.dismissed) ? r.dismissed : []).filter((d): d is string => typeof d === 'string' && /^[a-z0-9:_-]{1,64}$/i.test(d)).slice(-MAX_DISMISSED);
  const page = sanitizePage(r.page);
  const font = r.font === undefined ? null : fontValue(r.font);
  const size = num(r.size);
  return {
    v: 2,
    title: cleanText(r.title, MAX_TITLE),
    blocks: blocks.length ? blocks : [emptyBlock()],
    cards,
    groups,
    dismissed,
    versions,
    ...((FACES as readonly string[]).includes(r.face as string) ? { face: r.face as Face } : {}),
    ...(page ? { page } : {}),
    ...(font ? { font } : {}),
    ...(size ? { size: Math.round(Math.max(6, Math.min(36, size)) * 2) / 2 } : {}),
    ...(r.view === 'page' || r.view === 'flow' ? { view: r.view } : {}),
    updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0,
  };
}

/** The draft column as the server keeps it: the title, the compatibility html, and the document. */
export function sanitizeStoredDraft(raw: unknown, maxHtml = 200_000): StoredDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const doc = sanitizeWriteDoc(r.doc);
  if (typeof r.html !== 'string' && !doc) return null;
  return {
    title: str(r.title, MAX_TITLE),
    html: str(r.html, maxHtml),
    ...(doc ? { doc } : {}),
  };
}

// ── small helpers ────────────────────────────────────────────────────

export function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function uniqBy<T>(list: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of list) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
