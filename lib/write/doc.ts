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
// The model is deliberately small: blocks of plain text with a few inline
// marks (bold, italic, underline), headings, quotes and lists. That is what a
// Word document, a Markdown file and an essay have in common, and it is what
// every check, export and proposal below can reason about exactly.
//
// PURE. Shared by the editor, the routes and the tests.

export const BLOCK_TYPES = ['p', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const MARK_TYPES = ['b', 'i', 'u'] as const;
export type MarkType = (typeof MARK_TYPES)[number];

/** An inline mark over [s, e) of a block's text. */
export interface Mark {
  s: number;
  e: number;
  t: MarkType;
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

export interface Block {
  id: string;
  t: BlockType;
  /** plain text; '\n' is a line break inside the block */
  text: string;
  marks?: Mark[];
  /** a list item's depth, 1–3 */
  lvl?: number;
  cites?: Cite[];
  /** the Draft Space cards it grew from */
  from?: string[];
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
// would be refused — the person's writing is never silently cut.

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
const MAX_CITES = 12;
const MAX_LINKS = 12;
const MAX_LABEL = 160;
const MAX_QUOTE = 400;

// ── ids ──────────────────────────────────────────────────────────────

let seq = 0;
/** A short id: unique within a document, never meaningful. */
export function uid(prefix = 'b'): string {
  seq = (seq + 1) % 1_679_616;
  return `${prefix}${Date.now().toString(36).slice(-5)}${seq.toString(36).padStart(4, '0')}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

const ID = /^[A-Za-z0-9_-]{1,32}$/;

// ── constructors and reading ─────────────────────────────────────────

export function emptyBlock(t: BlockType = 'p'): Block {
  return { id: uid('b'), t, text: '' };
}

export function emptyDoc(now = Date.now()): WriteDoc {
  return { v: 2, title: '', blocks: [emptyBlock()], cards: [], groups: [], dismissed: [], versions: [], updatedAt: now };
}

export const isHeading = (t: BlockType) => t === 'h1' || t === 'h2' || t === 'h3';
export const isList = (t: BlockType) => t === 'ul' || t === 'ol';

/** Nothing written anywhere: no title, no words, no cards. */
export function isEmptyDoc(doc: WriteDoc | null | undefined): boolean {
  if (!doc) return true;
  return !doc.title.trim() && doc.blocks.every((b) => !b.text.trim()) && doc.cards.length === 0;
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

// ── marks ────────────────────────────────────────────────────────────

/** Marks clipped to the text, empty ones dropped, overlapping ones of a kind joined, in order. */
export function normalizeMarks(marks: readonly Mark[] | undefined, len: number): Mark[] | undefined {
  if (!marks?.length) return undefined;
  const out: Mark[] = [];
  for (const t of MARK_TYPES) {
    const of = marks
      .filter((m) => m && m.t === t)
      .map((m) => ({ s: Math.max(0, Math.min(len, Math.floor(m.s))), e: Math.max(0, Math.min(len, Math.floor(m.e))), t }))
      .filter((m) => m.e > m.s)
      .sort((a, b) => a.s - b.s);
    for (const m of of) {
      const last = out.length && out[out.length - 1].t === t ? out[out.length - 1] : null;
      if (last && m.s <= last.e) last.e = Math.max(last.e, m.e);
      else out.push({ ...m });
    }
  }
  out.sort((a, b) => a.s - b.s || MARK_TYPES.indexOf(a.t) - MARK_TYPES.indexOf(b.t));
  return out.length ? out : undefined;
}

/** True when every character of [s, e) carries mark t. */
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

/** Turn mark t on over [s, e) — or off, when all of it already has it. */
export function toggleMark(block: Block, s: number, e: number, t: MarkType): Block {
  const lo = Math.max(0, Math.min(s, e));
  const hi = Math.min(block.text.length, Math.max(s, e));
  if (hi <= lo) return block;
  const marks = block.marks ?? [];
  if (hasMark(block, lo, hi, t)) {
    const kept: Mark[] = [];
    for (const m of marks) {
      if (m.t !== t || m.e <= lo || m.s >= hi) {
        kept.push(m);
        continue;
      }
      if (m.s < lo) kept.push({ s: m.s, e: lo, t });
      if (m.e > hi) kept.push({ s: hi, e: m.e, t });
    }
    return withMarks(block, kept);
  }
  return withMarks(block, [...marks, { s: lo, e: hi, t }]);
}

function withMarks(block: Block, marks: Mark[]): Block {
  const m = normalizeMarks(marks, block.text.length);
  const { marks: _old, ...rest } = block;
  return m ? { ...rest, marks: m } : rest;
}

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
  const marks = (block.marks ?? []).map((m) => ({ s: mapStart(m.s), e: mapEnd(m.e), t: m.t }));
  const next: Block = { ...block, text };
  return withMarks(next, marks);
}

/** The marks of [s, e), re-based to start at 0 — for text that is cut out and put elsewhere. */
export function sliceMarks(block: Block, s: number, e: number): Mark[] {
  return (block.marks ?? [])
    .filter((m) => m.e > s && m.s < e)
    .map((m) => ({ s: Math.max(m.s, s) - s, e: Math.min(m.e, e) - s, t: m.t }));
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

/**
 * Enter: the block splits at `at`. What follows a heading is a paragraph; an
 * empty list item or quote line is how a list or a quote is left.
 */
export function splitBlock(doc: WriteDoc, id: string, at: number): { doc: WriteDoc; caret: { block: string; offset: number } } {
  const i = blockIndex(doc, id);
  if (i < 0) return { doc, caret: { block: id, offset: at } };
  const b = doc.blocks[i];
  if ((isList(b.t) || b.t === 'quote') && !b.text.trim()) {
    const { lvl: _l, ...rest } = b;
    const plain: Block = { ...rest, t: 'p', text: '' };
    return { doc: replaceBlock(doc, plain), caret: { block: b.id, offset: 0 } };
  }
  const cut = Math.max(0, Math.min(b.text.length, at));
  const head: Block = withMarks({ ...b, text: b.text.slice(0, cut) }, sliceMarks(b, 0, cut));
  const tailType: BlockType = isHeading(b.t) ? 'p' : b.t;
  const tail: Block = withMarks(
    {
      id: uid('b'),
      t: tailType,
      text: b.text.slice(cut),
      ...(isList(tailType) && b.lvl ? { lvl: b.lvl } : {}),
    },
    sliceMarks(b, cut, b.text.length)
  );
  // Splitting at the very start leaves the block where it was and opens a line above it.
  if (cut === 0 && b.text.length > 0) {
    const above: Block = { id: uid('b'), t: isHeading(b.t) ? 'p' : b.t, text: '', ...(isList(b.t) && b.lvl ? { lvl: b.lvl } : {}) };
    const blocks = [...doc.blocks.slice(0, i), above, b, ...doc.blocks.slice(i + 1)];
    return { doc: setBlocks(doc, blocks), caret: { block: b.id, offset: 0 } };
  }
  const blocks = [...doc.blocks.slice(0, i), head, tail, ...doc.blocks.slice(i + 1)];
  return { doc: setBlocks(doc, blocks), caret: { block: tail.id, offset: 0 } };
}

/**
 * Backspace at the start of a block. A heading, quote or list item becomes a
 * paragraph first — one press, one change; a paragraph joins the one above.
 */
export function mergeBack(doc: WriteDoc, id: string): { doc: WriteDoc; caret: { block: string; offset: number } } {
  const i = blockIndex(doc, id);
  if (i < 0) return { doc, caret: { block: id, offset: 0 } };
  const b = doc.blocks[i];
  if (b.t !== 'p') {
    if (isList(b.t) && (b.lvl ?? 1) > 1) return { doc: replaceBlock(doc, { ...b, lvl: (b.lvl ?? 1) - 1 }), caret: { block: id, offset: 0 } };
    const { lvl: _l, ...rest } = b;
    return { doc: replaceBlock(doc, { ...rest, t: 'p' }), caret: { block: id, offset: 0 } };
  }
  if (i === 0) return { doc, caret: { block: id, offset: 0 } };
  return joinBlocks(doc, doc.blocks[i - 1].id, id);
}

/** Delete at the end of a block: the next one joins it. */
export function mergeForward(doc: WriteDoc, id: string): { doc: WriteDoc; caret: { block: string; offset: number } } {
  const i = blockIndex(doc, id);
  if (i < 0 || i >= doc.blocks.length - 1) return { doc, caret: { block: id, offset: doc.blocks[i]?.text.length ?? 0 } };
  return joinBlocks(doc, id, doc.blocks[i + 1].id);
}

/** The second block's words appended to the first's; its citations and origins go with them. */
function joinBlocks(doc: WriteDoc, firstId: string, secondId: string): { doc: WriteDoc; caret: { block: string; offset: number } } {
  const i = blockIndex(doc, firstId);
  const j = blockIndex(doc, secondId);
  const a = doc.blocks[i];
  const b = doc.blocks[j];
  const at = a.text.length;
  const marks = [...(a.marks ?? []), ...(b.marks ?? []).map((m) => ({ s: m.s + at, e: m.e + at, t: m.t }))];
  const cites = uniqBy([...(a.cites ?? []), ...(b.cites ?? [])], (c) => `${c.doc}:${c.block}`).slice(0, MAX_CITES);
  const from = Array.from(new Set([...(a.from ?? []), ...(b.from ?? [])]));
  // An empty block above takes the shape of the one joining it: deleting a blank line keeps a heading a heading.
  const shape = !a.text && b.text ? { t: b.t, ...(b.lvl ? { lvl: b.lvl } : {}) } : { t: a.t, ...(a.lvl ? { lvl: a.lvl } : {}) };
  const { lvl: _l, ...aRest } = a;
  const joined: Block = withMarks(
    { ...aRest, ...shape, text: a.text + b.text, ...(cites.length ? { cites } : {}), ...(from.length ? { from } : {}) },
    marks
  );
  const blocks = doc.blocks.filter((x) => x.id !== b.id).map((x) => (x.id === a.id ? joined : x));
  return { doc: setBlocks(doc, blocks), caret: { block: a.id, offset: at } };
}

/** A point in the writing: a block and an offset into its text. */
export interface Point {
  block: string;
  offset: number;
}

/** Order two points as they fall in the document. */
export function orderPoints(doc: WriteDoc, a: Point, b: Point): [Point, Point] {
  const ia = blockIndex(doc, a.block);
  const ib = blockIndex(doc, b.block);
  return ia < ib || (ia === ib && a.offset <= b.offset) ? [a, b] : [b, a];
}

/**
 * Delete everything between two points, across blocks if need be, and put
 * `ins` where it was. The first block keeps its shape; the last block's tail
 * joins it — as in every word processor.
 */
export function replaceRange(doc: WriteDoc, from: Point, to: Point, ins = ''): { doc: WriteDoc; caret: Point } {
  const [a, b] = orderPoints(doc, from, to);
  const i = blockIndex(doc, a.block);
  const j = blockIndex(doc, b.block);
  if (i < 0 || j < 0) return { doc, caret: a };
  if (i === j) {
    const next = spliceBlock(doc.blocks[i], a.offset, b.offset, ins);
    return { doc: replaceBlock(doc, next), caret: { block: a.block, offset: Math.min(a.offset, b.offset) + ins.length } };
  }
  const first = doc.blocks[i];
  const last = doc.blocks[j];
  const head = spliceBlock(first, a.offset, first.text.length, ins);
  const tailMarks = sliceMarks(last, b.offset, last.text.length).map((m) => ({ s: m.s + head.text.length, e: m.e + head.text.length, t: m.t }));
  const between = doc.blocks.slice(i + 1, j + 1);
  const cites = uniqBy([...(first.cites ?? []), ...between.flatMap((x) => x.cites ?? [])], (c) => `${c.doc}:${c.block}`).slice(0, MAX_CITES);
  const fromIds = Array.from(new Set([...(first.from ?? []), ...between.flatMap((x) => x.from ?? [])]));
  const joined = withMarks(
    { ...head, text: head.text + last.text.slice(b.offset), ...(cites.length ? { cites } : {}), ...(fromIds.length ? { from: fromIds } : {}) },
    [...(head.marks ?? []), ...tailMarks]
  );
  const blocks = [...doc.blocks.slice(0, i), joined, ...doc.blocks.slice(j + 1)];
  return { doc: setBlocks(doc, blocks), caret: { block: first.id, offset: a.offset + ins.length } };
}

/**
 * The writing between two points, as blocks — what a copy takes. Part of one
 * block is its words alone; across blocks, each keeps its shape.
 */
export function blocksInRange(doc: WriteDoc, from: Point, to: Point): Block[] {
  const [a, b] = orderPoints(doc, from, to);
  const i = blockIndex(doc, a.block);
  const j = blockIndex(doc, b.block);
  if (i < 0 || j < 0) return [];
  const out: Block[] = [];
  for (let k = i; k <= j; k++) {
    const blk = doc.blocks[k];
    const s = k === i ? a.offset : 0;
    const e = k === j ? b.offset : blk.text.length;
    if (e <= s && i !== j) continue;
    const part = withMarks({ ...blk, text: blk.text.slice(s, e) }, sliceMarks(blk, s, e));
    if (i === j && !(s === 0 && e === blk.text.length)) {
      const { lvl: _l, cites: _c, ...words } = part;
      out.push({ ...words, t: 'p' });
    } else out.push(part);
  }
  return out;
}

/** Put blocks in after the one named (or at the start), keeping their ids unless they collide. */
export function insertBlocks(doc: WriteDoc, after: string | null, add: Block[]): WriteDoc {
  const taken = new Set(doc.blocks.map((b) => b.id));
  const fresh = add.map((b) => (taken.has(b.id) || !ID.test(b.id) ? { ...b, id: uid('b') } : b));
  const i = after === null ? -1 : blockIndex(doc, after);
  const at = after === null ? 0 : i < 0 ? doc.blocks.length : i + 1;
  return setBlocks(doc, [...doc.blocks.slice(0, at), ...fresh, ...doc.blocks.slice(at)]);
}

/**
 * Text that is several blocks (a paste, an import) put in at a point: the
 * first piece joins the block the caret is in, the last piece takes the rest
 * of that block, and whole blocks go between.
 */
export function insertAt(doc: WriteDoc, at: Point, add: Block[]): { doc: WriteDoc; caret: Point } {
  if (!add.length) return { doc, caret: at };
  const i = blockIndex(doc, at.block);
  if (i < 0) return { doc: insertBlocks(doc, null, add), caret: at };
  const host = doc.blocks[i];
  if (add.length === 1) {
    const one = add[0];
    const spliced = spliceBlock(host, at.offset, at.offset, one.text);
    const marks = [...(spliced.marks ?? []), ...(one.marks ?? []).map((m) => ({ s: m.s + at.offset, e: m.e + at.offset, t: m.t }))];
    // A pasted heading into an empty paragraph is a heading; into words, it is words.
    const shape = !host.text && host.t === 'p' ? { t: one.t, ...(one.lvl ? { lvl: one.lvl } : {}) } : {};
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
    { ...before, text: before.text + first.text, ...(!before.text && host.t === 'p' ? { t: first.t, ...(first.lvl ? { lvl: first.lvl } : {}) } : {}) },
    [...(before.marks ?? []), ...(first.marks ?? []).map((m) => ({ s: m.s + before.text.length, e: m.e + before.text.length, t: m.t }))]
  );
  const taken = new Set(doc.blocks.map((b) => b.id));
  const middle = add.slice(1, -1).map((b) => (taken.has(b.id) || !ID.test(b.id) ? { ...b, id: uid('b') } : b));
  const tailId = taken.has(last.id) || !ID.test(last.id) ? uid('b') : last.id;
  const tail = withMarks(
    { ...last, id: tailId, text: last.text + restText },
    [...(last.marks ?? []), ...restMarks.map((m) => ({ s: m.s + last.text.length, e: m.e + last.text.length, t: m.t }))]
  );
  const blocks = [...doc.blocks.slice(0, i), head, ...middle, tail, ...doc.blocks.slice(i + 1)];
  return { doc: setBlocks(doc, blocks), caret: { block: tail.id, offset: last.text.length } };
}

export function setBlockType(doc: WriteDoc, id: string, t: BlockType): WriteDoc {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b) return doc;
  const { lvl: _l, ...rest } = b;
  return replaceBlock(doc, isList(t) ? { ...rest, t, lvl: b.lvl ?? 1 } : { ...rest, t });
}

/** Tab and Shift+Tab in a list: one level deeper or shallower, between 1 and 3. */
export function indentBlock(doc: WriteDoc, id: string, delta: number): WriteDoc {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b || !isList(b.t)) return doc;
  const lvl = Math.max(1, Math.min(3, (b.lvl ?? 1) + delta));
  return lvl === (b.lvl ?? 1) ? doc : replaceBlock(doc, { ...b, lvl });
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
  const picked = doc.blocks.filter((b) => set.has(b.id));
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
    for (const m of b.marks ?? []) marks.push({ s: m.s - lead + at, e: m.e - lead + at, t: m.t });
  }
  const first = picked[0];
  const cites = uniqBy(picked.flatMap((b) => b.cites ?? []), (c) => `${c.doc}:${c.block}`).slice(0, MAX_CITES);
  const from = Array.from(new Set(picked.flatMap((b) => b.from ?? [])));
  const joined = withMarks({ id: first.id, t: 'p', text, ...(cites.length ? { cites } : {}), ...(from.length ? { from } : {}) }, marks);
  const blocks: Block[] = [];
  for (const b of doc.blocks) {
    if (b.id === first.id) blocks.push(joined);
    else if (!set.has(b.id)) blocks.push(b);
  }
  return setBlocks(doc, blocks);
}

// ── citations ────────────────────────────────────────────────────────

export function addCite(doc: WriteDoc, blockId: string, cite: Omit<Cite, 'id'>): WriteDoc {
  const b = doc.blocks.find((x) => x.id === blockId);
  if (!b) return doc;
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
  return title + '\u0001' + blocks.map((b) => `${b.t}${b.lvl ?? ''}:${b.text}`).join('\u0002');
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

function sanitizeMarksRaw(raw: unknown, len: number): Mark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const marks: Mark[] = [];
  for (const m of raw.slice(0, 2000)) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    if (!(MARK_TYPES as readonly string[]).includes(r.t as string)) continue;
    if (typeof r.s !== 'number' || typeof r.e !== 'number') continue;
    marks.push({ s: r.s, e: r.e, t: r.t as MarkType });
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

function sanitizeBlock(raw: unknown, budget: { left: number }): Block | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const t = (BLOCK_TYPES as readonly string[]).includes(r.t as string) ? (r.t as BlockType) : 'p';
  const text = cleanText(r.text, Math.min(MAX_BLOCK_CHARS, Math.max(0, budget.left)));
  budget.left -= text.length;
  const b: Block = { id: typeof r.id === 'string' && ID.test(r.id) ? r.id : uid('b'), t, text };
  const marks = sanitizeMarksRaw(r.marks, text.length);
  if (marks) b.marks = marks;
  if (isList(t)) b.lvl = typeof r.lvl === 'number' ? Math.max(1, Math.min(3, Math.floor(r.lvl))) : 1;
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
    const b = sanitizeBlock(r, budget);
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
  return {
    v: 2,
    title: cleanText(r.title, MAX_TITLE),
    blocks: blocks.length ? blocks : [emptyBlock()],
    cards,
    groups,
    dismissed,
    versions,
    ...((FACES as readonly string[]).includes(r.face as string) ? { face: r.face as Face } : {}),
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
