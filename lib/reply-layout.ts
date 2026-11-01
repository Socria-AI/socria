// lib/reply-layout.ts — A REPLY, LAID OUT TO BE READ (Logos 5).
//
// The parser (lib/rich-text.ts) says what a reply's blocks ARE. This says how a
// Logos 5 reply sits on the page, so it reads like something written for one
// person rather than a document dropped into a chat window:
//
//   • THE LEAD. A substantive reply opens with a short statement — the answer,
//     or the problem underneath the request; the core prompt asks for exactly
//     that (lib/runtime/behavior.ts) — and the page sets it as a standfirst.
//     Only when it is short, is a statement, and real substance follows it: a
//     reply of a line or two is conversation and stays conversation.
//   • THE HEADING A MODEL FAKES. "**1. Clarify the goals**" on a line of its
//     own, over what follows, is a heading in everything but name. Read as one,
//     it is drawn as one — and joins the folding below — instead of standing as
//     a bold line over bullets.
//   • TERMS. A list whose every item is a bold label and its text is a set of
//     terms, and is laid out as label and text rather than as bold bullets.
//   • FOLDS. Once a reply has said its first part, each further part after the
//     first sixty-odd words opens on request: its title and its first words
//     show, the rest is a press away (a native <details>: the keyboard, screen
//     readers and find-in-page all reach inside it). The rule looks only
//     BACKWARD — at what was written before a heading — so a reply folds the
//     same way while it streams as when it has landed, and nothing on screen
//     jumps when it finishes. A part too short to be worth a press (under
//     three lines on the page) is shown open once it is complete. What
//     belongs to the whole reply is never folded: its closing question, its
//     closing line, and the ways it could go next (a "paths" block).
//   • DISCLOSURE WITHOUT HEADINGS. Most long replies are not written in
//     parts at all: they are paragraphs, one after another, and folding only
//     under headings meant the textbook wall reached the page whole. So a
//     reply with no parts gets the same treatment from what it has already
//     said: once it has drawn two blocks of prose and some hundred and forty
//     words, what follows is folded under one row — titled by the first
//     sentence it would open on, when that is short, or "More" — with how much
//     is in it. The same rule applies inside an over-long first part. It is
//     decided only from what came BEFORE, like every other fold here, so it
//     streams as it lands.
//   • VISUALS ARE NEVER FOLDED. An element is the reply's picture of the
//     thing — a comparison, a chart, a cycle — and hiding it behind a press
//     while the paragraphs it replaces stay open had disclosure backwards. Any
//     drawn element stays in the flow (only a draft and the reasoning behind
//     an answer, which are disclosures themselves, may sit in a fold). One
//     that falls where a fold would be closes the fold before it, and prose
//     after it carries on in a fold of its own, untitled — a continuation of
//     the part it belongs to, not text spilled out of it.
//   • DEPTH ASKED FOR IS DEPTH SHOWN. When the person asked for it — "in
//     detail", "step by step", "walk me through", going deeper from a path, or
//     a Detailed length setting — nothing is folded at all (`disclose: false`;
//     depthAsked below). Folding is for what nobody asked to read in full.
//   • A LONG OPENING STILL LEADS. An opening paragraph too long to be a
//     lead, whose first sentence is a short statement, has that sentence set
//     apart as the lead (splitLead) — the same words, cut at their own full
//     stop.
//   • DENSITY. The markdown a model still writes is drawn as tightly as what
//     it says allows: a loose numbered list is one list with its own numbers;
//     many short items sit in columns; "Term — what it means" lines become
//     terms; points nested under an option stay under it; labelled groups of
//     short points (Pros, Cons) sit side by side; a table whose first column
//     names the points it compares on is drawn as a comparison. Each rule is
//     decided from a list's first few items, so a list that settles line by
//     line while it streams never changes its mind.
//
// Nothing here writes or rewrites a word: it only decides where the words
// that were written go. Copying a reply copies all of it, folded or not.
//
// Pure: no React, no DOM. components/RichText.tsx draws what this returns.

import { bulletBlock, isTableRule, listLine, parseBlocks, stripMarks, type Block } from './rich-text';
import type { InlineSpec } from './inline-ui';

/**
 * Inline elements that are disclosures in their own right — a draft to take
 * away, the reasoning behind an answer — and so may sit in a fold like prose.
 * Every other kind is something to look at or work with, and is never folded.
 */
const SELF_DISCLOSED = new Set<string>(['draft', 'reasoning']);
/**
 * The element kinds drawn as something to look at or work with, named so the
 * rule is legible (and tested) kind by kind — including the kinds still being
 * added (diagram, balance, equation). A kind not named here is treated the
 * same way unless it is one of the self-disclosed two: what cannot be named
 * yet is still never hidden.
 */
export const VISUAL_KINDS = ['chart', 'slider', 'compare', 'options', 'concepts', 'sequence', 'paths', 'decide', 'graph', 'sim', 'check', 'steps', 'claim', 'diagram', 'balance', 'equation'] as const;

/** Whether a block is an element that stays in view: drawn, or still arriving as one. */
export function isVisualBlock(b: Block | undefined | null): boolean {
  if (!b || b.kind !== 'ui') return false;
  // a block that failed its checks draws nothing, so it has nowhere to be
  if (!b.spec && !b.open) return false;
  const type = b.spec?.type ?? b.pending;
  // still arriving and its kind not yet written: a placeholder in the flow, where the element will be
  return !type || !SELF_DISCLOSED.has(type);
}

/** A lead is a sentence or two: longer than this and it is a paragraph. */
export const LEAD_MAX_WORDS = 42;
/** …and it needs this much said after it to be leading anything. */
export const LEAD_REST_WORDS = 25;
/** A part folds once this much has been said before it. */
export const FOLD_AFTER_WORDS = 60;
/** A finished part shorter than this many lines on the page is shown open: not worth a press. */
export const FOLD_MIN_LINES = 3;
/** Words to a line of prose at the reply's measure, near enough. */
const WORDS_PER_LINE = 12;
const PREVIEW_WORDS = 16;

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length;

/** A question, by how it ends — quotes and brackets after the mark allowed. */
export const endsAsQuestion = (s: string) => /\?\s*["'’”)\]]*\s*$/.test(s.trim());

// ── reading a reply editorially ──────────────────────────────────────

/** "**Clarify the goals**", "**Cost:**", "**1. Clarify the goals**" — a bold line standing alone. */
const BOLD_LINE = /^\*\*([^*\n]{2,80})\*\*\s*:?\s*$/;

/** The words of a heading a model wrote in bold, or null when the line is emphasis, not a heading. */
export function fakeHeading(text: string): string | null {
  const m = BOLD_LINE.exec(text.trim());
  if (!m) return null;
  const inner = m[1].replace(/:\s*$/, '').trim();
  // a bold sentence is emphasis; a heading is a few words with no full stop
  if (!inner || /[.!?…]$/.test(inner) || wordCount(inner) > 10) return null;
  return inner;
}

/** "**Activation rate:** the share who…", "**Activation rate** — the share who…" */
const TERM_INSIDE = /^\*\*([^*\n]{1,60}?):\*\*\s*(\S[\s\S]*)$/;
const TERM_AFTER = /^\*\*([^*\n]{1,60}?)\*\*\s*[:.—–-]\s*(\S[\s\S]*)$/;

/** A list item as a label and its text, or null when it is not written that way. */
export function termOf(item: string): { label: string; body: string } | null {
  const s = item.trim();
  const m = TERM_INSIDE.exec(s) ?? TERM_AFTER.exec(s);
  if (!m) return null;
  const label = m[1].replace(/[:.]\s*$/, '').trim();
  const body = m[2].trim();
  if (!label || !body || wordCount(label) > 8) return null;
  return { label, body };
}

/**
 * "Latency — the time until…", "Latency: the time until…" — the same shape
 * written without bold. Read as a term only under the strict conditions in
 * listShape: a capitalised label of a few words, an explanation of at least
 * three, and the list's first items all written so. A one-off "Note: …" in an
 * ordinary list is a bullet, as it always was.
 */
const PLAIN_TERM_DASH = /^([A-Z0-9][^—–:.*`\n]{0,40}?)\s+[—–]\s+(\S[\s\S]*)$/;
const PLAIN_TERM_COLON = /^([A-Z0-9][\w\s/&()'’+-]{0,30}?):\s+(\S[\s\S]*)$/;

/** An unbolded list item as a label and its text, or null. */
export function plainTermOf(item: string): { label: string; body: string } | null {
  const s = item.trim();
  if (s.startsWith('**')) return null;
  const m = PLAIN_TERM_DASH.exec(s) ?? PLAIN_TERM_COLON.exec(s);
  if (!m) return null;
  const label = m[1].trim();
  const body = m[2].trim();
  if (!label || wordCount(label) > 4 || wordCount(stripMarks(body)) < 3) return null;
  return { label, body };
}

/** How many of a list's first items decide how it is drawn — few enough to be settled early in a stream. */
const DECIDED_BY = 3;
/** A compact list: at least this many items… */
export const COMPACT_MIN_ITEMS = 5;
/** …each this many words or fewer. */
export const COMPACT_MAX_WORDS = 5;

/** An item short enough to sit in a column: a few words, not a sentence, no maths. */
function shortItem(item: string): boolean {
  const t = stripMarks(item);
  return wordCount(t) <= COMPACT_MAX_WORDS && !/[.;:!?…]/.test(t) && !t.includes('$');
}

const GROUP_ITEM_WORDS = 10;

/**
 * How a list is drawn, decided from its first items so that a list arriving
 * line by line never changes its mind once it has made it up:
 *
 *   • TERMS — the first items (three, or both of two) are each a bold label
 *     and its text; or, with no bold, the first three are each "Label — text"
 *     or "Label: text". A later item not written that way is a plain row of
 *     the same list, not a reason to throw the layout away.
 *   • OPTIONS WITH POINTS UNDER THEM — two to four short items with two or
 *     more short points nested under each of the first two ("Hire an
 *     engineer" over "faster product", "burns runway") are a set of groups,
 *     set side by side like Pros and Cons.
 *   • COMPACT — five or more items, the first five each a few words and no
 *     sentence: columns, not a tall line each. Columns, never chips: nothing
 *     here should look like something to press.
 */
function listShape(b: Extract<Block, { kind: 'ul' | 'ol' }>): Block {
  const { items } = b;
  const subs = b.subs;
  const sub = (k: number) => (subs?.[k]?.length ? { sub: subs[k] } : {});
  const start = b.kind === 'ol' && b.start ? { start: b.start } : {};
  const head = items.slice(0, DECIDED_BY);
  const shortWords = (t: string) => wordCount(stripMarks(t)) <= GROUP_ITEM_WORDS;

  if (b.kind === 'ul' && subs && items.length >= 2 && items.length <= 4) {
    const firstTwo = [0, 1].every((k) => (subs[k]?.length ?? 0) >= 2 && subs[k].slice(0, DECIDED_BY).every(shortWords));
    if (firstTwo && items.every((it) => wordCount(stripMarks(it)) <= 8 && !/[.!?…]$/.test(stripMarks(it)))) {
      return { kind: 'groups', side: true, groups: items.map((h, k) => ({ header: h, items: subs[k] ?? [] })) };
    }
  }
  if (items.length >= 2 && head.every((it) => !!termOf(it))) {
    return { kind: 'terms', ordered: b.kind === 'ol', ...start, items: items.map((it, k) => ({ ...(termOf(it) ?? plainTermOf(it) ?? { label: '', body: it }), ...sub(k) })) };
  }
  if (items.length >= DECIDED_BY && head.every((it) => !!plainTermOf(it))) {
    return { kind: 'terms', ordered: b.kind === 'ol', ...start, items: items.map((it, k) => ({ ...(plainTermOf(it) ?? termOf(it) ?? { label: '', body: it }), ...sub(k) })) };
  }
  if (b.kind === 'ul' && !subs && items.length >= COMPACT_MIN_ITEMS && items.slice(0, COMPACT_MIN_ITEMS).every(shortItem)) {
    return { ...b, compact: true };
  }
  return b;
}

/**
 * Labelled groups set side by side: two to four of them, each titled, the
 * first two with something in them, and the first points of each short. A
 * longer point further down still fits in its column; only a fifth group, or
 * a long point near the top, keeps them stacked.
 */
function groupsShape(b: Extract<Block, { kind: 'groups' }>): Block {
  const g = b.groups;
  const side =
    g.length >= 2 &&
    g.length <= 4 &&
    g.every((x) => !!x.header) &&
    g[0].items.length > 0 &&
    g[1].items.length > 0 &&
    g.every((x) => x.items.slice(0, DECIDED_BY).every((it) => wordCount(stripMarks(it)) <= GROUP_ITEM_WORDS));
  return side ? { ...b, side: true } : b;
}

/**
 * A table that sets things against each other on the same points: two to four
 * columns of values, and a first column that names the points — an empty
 * top-left cell says so outright, or the first rows' labels are a few words
 * each. Drawn with row headers, like the comparison element.
 */
export function tableShape(b: Extract<Block, { kind: 'table' }>): Extract<Block, { kind: 'table' }> {
  const values = b.header.length - 1;
  if (values < 2 || values > 4) return b;
  // an empty corner says it before any row has arrived; otherwise the first rows' labels do
  const named = b.header[0].trim() === '' || (b.rows.length > 0 && b.rows.slice(0, DECIDED_BY).every((r) => wordCount(stripMarks(r[0] ?? '')) <= 4 && (r[0] ?? '').trim() !== ''));
  return named ? { ...b, compare: true } : b;
}

/** A list's items flat again, labels and all, so two halves of one list can be read as one. */
function itemsOf(b: Block): { items: string[]; subs: string[][] } | null {
  if (b.kind === 'ul') return { items: b.items, subs: b.subs ?? b.items.map(() => []) };
  if (b.kind === 'groups') {
    const items: string[] = [];
    for (const g of b.groups) {
      if (g.header) items.push(g.header);
      items.push(...g.items);
    }
    return { items, subs: items.map(() => [] as string[]) };
  }
  return null;
}

/**
 * A LOOSE LIST IS ONE LIST. "1. Define the audience", a blank line, "2. Pick
 * one channel" — the parser reads each item as a list of its own, and each was
 * drawn as "1." (the "1. 1. 1." bug). Adjacent lists of the same kind, with
 * nothing between them but blank lines, are joined back into the one list they
 * are, keeping the first one's number. Bullets are joined the same way, and a
 * joined set of bullets is read again for its group labels. Only ever looks
 * back, so a list growing while it streams only grows.
 */
function joinLists(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === 'ol' && b.kind === 'ol') {
      const anySubs = !!(prev.subs || b.subs);
      const subs = anySubs ? [...(prev.subs ?? prev.items.map(() => [])), ...(b.subs ?? b.items.map(() => []))] : undefined;
      out[out.length - 1] = { kind: 'ol', items: [...prev.items, ...b.items], ...(subs ? { subs } : {}), ...(prev.start ? { start: prev.start } : {}) };
      continue;
    }
    const a = prev ? itemsOf(prev) : null;
    const c = a ? itemsOf(b) : null;
    if (a && c) {
      const subs = [...a.subs, ...c.subs];
      out[out.length - 1] = bulletBlock([...a.items, ...c.items], subs.some((x) => x.length) ? subs : undefined);
      continue;
    }
    out.push(b);
  }
  return out;
}

/** A lead set apart from a long opening paragraph is one sentence of this many words. */
export const LEAD_SPLIT_WORDS: readonly [number, number] = [6, 30];

/**
 * A LONG OPENING PARAGRAPH STILL HAS A LEAD. A reply that opens with a clean
 * one-sentence answer and runs straight on for sixty words lost its standfirst
 * altogether — the answer was set as body text on exactly the verbose replies
 * that most need it marked. When the opening paragraph is too long to be a
 * lead but its first sentence is a statement of six to thirty words, that
 * sentence is set apart as the lead and the rest follows as a paragraph of its
 * own. Nothing is reworded: it is the same text, cut where its own full stop
 * is. Only a paragraph that has finished arriving is cut (one still streaming
 * is the tail, not a block), so the cut is made once and never undone; and
 * not where the cut would leave bold, code, maths or a link open on either side.
 */
function splitLead(blocks: Block[]): Block[] {
  const first = blocks[0];
  if (!first || first.kind !== 'p' || first.split) return blocks;
  const raw = first.text.trim();
  if (raw.includes('\n') || raw.includes('$$') || wordCount(stripMarks(raw)) <= LEAD_MAX_WORDS) return blocks;
  const m = /^(.+?[.!…])\s+(?=["'“‘(]?[A-Z0-9*_])/.exec(raw);
  if (!m) return blocks;
  const lead = m[1].trim();
  const rest = raw.slice(m[0].length).trim();
  // a question before the first full stop: the opening is a question, not a statement to lead with
  if (/[?]/.test(lead)) return blocks;
  const n = wordCount(stripMarks(lead));
  const balanced = (x: string) => (x.match(/\*\*/g) ?? []).length % 2 === 0 && (x.match(/`/g) ?? []).length % 2 === 0 && (x.match(/\$/g) ?? []).length % 2 === 0 && (x.match(/\[/g) ?? []).length === (x.match(/\]/g) ?? []).length;
  if (n < LEAD_SPLIT_WORDS[0] || n > LEAD_SPLIT_WORDS[1] || !rest || !balanced(lead) || !balanced(rest)) return blocks;
  // an abbreviation is not the end of a sentence ("e.g. the…", "Dr. Smith")
  if (/\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Mrs|Ms|St|No|approx)\.$/i.test(lead)) return blocks;
  return [{ kind: 'p', text: lead }, { kind: 'p', text: rest, split: true }, ...blocks.slice(1)];
}

/**
 * Rich blocks read the way Logos 5 lays a reply out: a bold line standing
 * alone over what follows becomes a heading; a loose list becomes one list;
 * and lists, groups and tables are drawn as densely as what they say allows
 * (listShape, groupsShape, tableShape). `more`: the reply is still arriving
 * after the last block, so a bold line at the end may yet have something
 * under it.
 */
export function editorialBlocks(input: Block[], opts: { more?: boolean } = {}): Block[] {
  const blocks = splitLead(joinLists(input));
  return blocks.map((b, i) => {
    if (b.kind === 'p') {
      const next = blocks[i + 1];
      const followed = next ? next.kind !== 'h' && !(next.kind === 'p' && fakeHeading(next.text)) : !!opts.more;
      const h = followed ? fakeHeading(b.text) : null;
      return h ? { kind: 'h', level: 3, text: h } : b;
    }
    if (b.kind === 'ul' || b.kind === 'ol') return listShape(b);
    if (b.kind === 'groups') return groupsShape(b);
    if (b.kind === 'table') return tableShape(b);
    return b;
  });
}

// ── how much a block says ────────────────────────────────────────────

export function blockWords(b: Block): number {
  switch (b.kind) {
    case 'p':
    case 'quote':
    case 'h':
      return wordCount(stripMarks(b.text));
    case 'ul':
    case 'ol':
      return b.items.reduce((n, it) => n + wordCount(stripMarks(it)), 0) + (b.subs ?? []).flat().reduce((n, it) => n + wordCount(stripMarks(it)), 0);
    case 'terms':
      return b.items.reduce((n, it) => n + wordCount(stripMarks(it.label)) + wordCount(stripMarks(it.body)) + (it.sub ?? []).reduce((m, x) => m + wordCount(stripMarks(x)), 0), 0);
    case 'groups':
      return b.groups.reduce((n, g) => n + (g.header ? wordCount(stripMarks(g.header)) : 0) + g.items.reduce((m, it) => m + wordCount(stripMarks(it)), 0), 0);
    case 'table':
      return [...b.header, ...b.rows.flat()].reduce((n, c) => n + wordCount(stripMarks(c)), 0);
    case 'code':
      return Math.min(40, wordCount(b.text));
    case 'sources':
      return b.items.length * 3;
    case 'ui':
      // an element says something, and takes room: it counts as a short paragraph — unless it failed its checks and draws nothing
      return b.spec || b.open ? 30 : 0;
  }
}

/**
 * How many lines a block takes on the page, near enough: a list item is at
 * least a line however short, which is why four bullets of three words are
 * worth folding and a sentence of twenty is not.
 */
export function blockLines(b: Block): number {
  const lines = (t: string) => Math.max(1, Math.ceil(wordCount(stripMarks(t)) / WORDS_PER_LINE));
  switch (b.kind) {
    case 'p':
    case 'quote':
    case 'h':
      return lines(b.text);
    case 'ul':
    case 'ol':
      // a compact list sits in columns, two or three to a row; points nested under an item run on one muted line
      return (b.kind === 'ul' && b.compact ? Math.ceil(b.items.length / 2) : b.items.reduce((n, it) => n + lines(it), 0)) + (b.subs ?? []).filter((x) => x.length).length;
    case 'terms':
      return b.items.reduce((n, it) => n + lines(`${it.label} ${it.body}`) + (it.sub?.length ? 1 : 0), 0);
    case 'groups':
      return b.groups.reduce((n, g) => n + (g.header ? 1 : 0) + g.items.reduce((m, it) => m + lines(it), 0), 0);
    case 'table':
      return b.rows.length + 1;
    case 'code':
      return Math.max(1, b.text.split('\n').length);
    case 'sources':
      return b.items.length;
    case 'ui':
      return b.spec || b.open ? 4 : 0;
  }
}

/** What each element is called where it is named rather than drawn: a folded row, a screen reader's summary. */
const KIND_SAID: Record<string, string> = {
  chart: 'Chart',
  slider: 'Try the numbers',
  compare: 'Comparison',
  reasoning: 'The reasoning',
  options: 'Choices',
  draft: 'Draft',
  concepts: 'The ideas',
  sequence: 'In order',
  paths: 'Where it could go',
  decide: 'Weighing it up',
  graph: 'Graph',
  sim: 'Simulation',
  check: 'A question to try',
  steps: 'The working',
  claim: 'The claim, checked',
  diagram: 'Diagram',
  balance: 'For and against',
  equation: 'Equation',
};

/**
 * An element as a few words: its kind and its title ("Comparison · Postgres
 * vs MySQL"), or its kind alone. Never empty — a row that names nothing is a
 * press nobody can judge. Read loosely, so a kind added after this was
 * written still names itself by its title.
 */
export function elementLabel(spec: InlineSpec | null, pending?: string): string {
  const type = spec?.type ?? pending ?? '';
  const kind = KIND_SAID[type] ?? 'Element';
  if (!spec) return kind;
  const o = spec as unknown as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const titled =
    str(o.title) ||
    str(o.subject) ||
    (spec.type === 'compare' ? spec.options.join(' vs ') : '') ||
    (spec.type === 'claim' ? `“${spec.claim}”` : '') ||
    (spec.type === 'check' || spec.type === 'options' ? str(o.prompt) : '');
  return titled ? `${kind} · ${titled}` : kind;
}

/** The first words of a part, for its folded row. */
export function previewOf(b: Block | undefined): string {
  if (!b) return '';
  let text = '';
  switch (b.kind) {
    case 'ui':
      text = elementLabel(b.spec, b.pending);
      break;
    case 'p':
    case 'quote':
      text = b.text;
      break;
    case 'ul':
    case 'ol':
      text = b.items[0] ?? '';
      break;
    case 'terms':
      text = b.items[0] ? `${b.items[0].label} — ${b.items[0].body}` : '';
      break;
    case 'groups':
      text = b.groups[0] ? `${b.groups[0].header ? stripMarks(b.groups[0].header).replace(/:$/, '') + ' — ' : ''}${b.groups[0].items[0] ?? ''}` : '';
      break;
    case 'table':
      text = b.header.join(', ');
      break;
    default:
      text = '';
  }
  const words = stripMarks(text).replace(/\$+/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return '';
  return words.length > PREVIEW_WORDS ? `${words.slice(0, PREVIEW_WORDS).join(' ')}…` : words.join(' ');
}

// ── the lead ─────────────────────────────────────────────────────────

/**
 * Whether the first block is the reply's lead: a paragraph of a sentence or two,
 * a statement (not a question, not a line introducing a list), on one line,
 * with real substance after it. `restWords`: what the reply says after it,
 * counting a paragraph still being written.
 */
export function isLead(first: Block | undefined, restWords: number): boolean {
  if (!first || first.kind !== 'p') return false;
  const raw = first.text.trim();
  if (raw.includes('\n') || raw.includes('$$')) return false;
  const t = stripMarks(raw);
  const n = wordCount(t);
  return n >= 4 && n <= LEAD_MAX_WORDS && !endsAsQuestion(t) && !/[:;,]$/.test(t) && restWords >= LEAD_REST_WORDS;
}

// ── the layout ───────────────────────────────────────────────────────

export type Piece =
  /** a block drawn where it stands — `lead` for the opening statement */
  | { kind: 'block'; i: number; lead?: boolean }
  /**
   * Blocks folded under one row. `head` is the heading block it folds under,
   * or -1 for a fold the reply's paragraphs earned without one (its row is
   * then `title`: the first sentence it opens on, or "More"). `cont`: the rest
   * of a fold that an element interrupted, carrying on after it, drawn with
   * no title of its own. `body` holds block indices (it may hold the paragraph
   * still being written, index = blocks.length); `count`, how much is in it
   * ("3 paragraphs"), for a row with no heading to say what it holds.
   */
  | { kind: 'fold'; head: number; body: number[]; preview: string; words: number; lines: number; writing: boolean; title?: string; cont?: boolean; count?: string }
  /** the closing question, never folded */
  | { kind: 'ask'; i: number };

type Fold = Extract<Piece, { kind: 'fold' }>;

export interface LayoutOptions {
  /** the reply is still arriving */
  streaming?: boolean;
  /** the paragraph still being written, after the last block (streaming) — laid out as block index `blocks.length` */
  tail?: string;
  /**
   * The text still being written continues the LAST block rather than
   * standing after it — the next item of a list, the next row of a table
   * (tailShape) — so it is laid out with that block, not as a paragraph.
   */
  tailIn?: boolean;
  /**
   * Whether anything may be folded. False when the person asked for depth
   * (depthAsked): a reply they asked to read in full is shown in full.
   */
  disclose?: boolean;
}

/** A reply with no parts folds what follows once it has drawn this many words of prose… */
export const PARAGRAPH_FOLD_WORDS = 140;
/** …in at least this many blocks of it. */
export const PARAGRAPH_FOLD_BLOCKS = 2;
/** A fold's row is titled by its opening sentence only when that sentence is this short. */
export const FOLD_TITLE_WORDS = 12;

/** Blocks that are prose — what a reader has to read — as against elements, code and sources. */
const PROSE_KINDS = new Set<Block['kind']>(['p', 'quote', 'ul', 'ol', 'terms', 'groups', 'table']);

/**
 * A block's opening sentence, when it is short enough to title a row, or
 * null. `complete`: the block has finished arriving — a sentence at the very
 * end of a paragraph still being written may not have finished yet.
 */
export function openingSentence(b: Block | undefined, complete = true): string | null {
  if (!b || (b.kind !== 'p' && b.kind !== 'quote')) return null;
  const t = stripMarks(b.text).replace(/\s+/g, ' ').trim();
  // a sentence ends at its mark, before a space and a capital (or the end, once the block has landed)
  const m = /^(.+?[.!?…])(?=\s+["'“‘(]?[A-Z0-9]|$)/.exec(t);
  if (!m) return null;
  if (m[1].length === t.length && !complete) return null;
  const said = m[1].replace(/[.…]$/, '').trim();
  const n = wordCount(said);
  if (n < 2 || n > FOLD_TITLE_WORDS || said.includes('$')) return null;
  return said;
}

/** What a fold holds, said in a few words after its title: "3 paragraphs", "a paragraph and a list". */
export function foldCount(blocks: Block[]): string {
  const n = { p: 0, list: 0, table: 0, code: 0 };
  for (const b of blocks) {
    if (b.kind === 'p' || b.kind === 'quote') n.p++;
    else if (b.kind === 'ul' || b.kind === 'ol' || b.kind === 'terms' || b.kind === 'groups') n.list++;
    else if (b.kind === 'table') n.table++;
    else if (b.kind === 'code') n.code++;
  }
  const said = [
    n.p ? (n.p === 1 ? 'a paragraph' : `${n.p} paragraphs`) : '',
    n.list ? (n.list === 1 ? 'a list' : `${n.list} lists`) : '',
    n.table ? (n.table === 1 ? 'a table' : `${n.table} tables`) : '',
    n.code ? 'code' : '',
  ].filter(Boolean);
  if (!said.length) return '';
  return said.length === 1 ? said[0] : `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`;
}

/**
 * Where each block of a reply goes: in the flow, as the lead, inside a fold, or
 * as the closing question. Deterministic and backward-looking, so a reply
 * mid-stream and the same reply landed agree on everything already written.
 *
 * Every decision about a block is made from the blocks BEFORE it — how much
 * has been said, how many parts there have been, whether an element has just
 * interrupted a fold — never from the block itself or anything after it. That
 * is the whole of why a reply cut at any point mid-stream is laid out, for the
 * part already written, exactly as it is once it lands.
 */
export function layoutReply(blocks: Block[], o: LayoutOptions = {}): Piece[] {
  const tailWords = o.streaming && o.tail ? wordCount(stripMarks(o.tail)) : 0;
  const hasTail = tailWords > 0 && !o.tailIn;
  const n = blocks.length + (hasTail ? 1 : 0);
  const joined = tailWords > 0 && o.tailIn ? tailWords : 0;
  const words = (i: number) => (i === blocks.length ? tailWords : blockWords(blocks[i]) + (i === blocks.length - 1 ? joined : 0));
  const lines = (i: number) => (i === blocks.length ? Math.max(1, Math.ceil(tailWords / WORDS_PER_LINE)) : blockLines(blocks[i]) + (i === blocks.length - 1 && joined ? 1 : 0));
  /** the paragraph still being written is prose */
  const prose = (i: number) => i === blocks.length || PROSE_KINDS.has(blocks[i].kind);
  const disclose = o.disclose !== false;
  // a reply that has landed and ends by asking keeps its question out of any fold
  const last = blocks[blocks.length - 1];
  const askAt = !o.streaming && last?.kind === 'p' && endsAsQuestion(stripMarks(last.text)) && blocks.length > 1 ? blocks.length - 1 : -1;

  const pieces: Piece[] = [];
  let fold = null as Fold | null;
  /** the fold an element interrupted: prose after the element carries on in it */
  let broken = null as Fold | null;
  let headings = 0;
  let before = 0;
  /** what the open stretch of the reply has drawn so far — since its start, or since the heading of its first part */
  let openWords = 0;
  let openBlocks = 0;
  for (let i = 0; i < n; i++) {
    if (i === askAt) break;
    const b = i < blocks.length ? blocks[i] : null;
    if (b?.kind === 'h') {
      headings++;
      broken = null;
      if (disclose && headings >= 2 && before >= FOLD_AFTER_WORDS) {
        fold = { kind: 'fold', head: i, body: [], preview: '', words: 0, lines: 0, writing: false };
        pieces.push(fold);
      } else {
        fold = null;
        pieces.push({ kind: 'block', i });
        openWords = 0;
        openBlocks = 0;
      }
    } else if (isVisualBlock(b)) {
      // an element is never put behind a press: it closes the fold it falls in, and what follows it
      // carries on in that fold — so prose after a graph stays under the part it belongs to
      if (fold) broken = fold;
      fold = null;
      pieces.push({ kind: 'block', i });
    } else if (fold) {
      fold.body.push(i);
      fold.words += words(i);
      fold.lines += lines(i);
    } else if (broken) {
      fold = { kind: 'fold', head: broken.head, cont: true, body: [i], preview: '', words: words(i), lines: lines(i), writing: false };
      pieces.push(fold);
      broken = null;
    } else if (disclose && headings <= 1 && prose(i) && openWords >= PARAGRAPH_FOLD_WORDS && openBlocks >= PARAGRAPH_FOLD_BLOCKS) {
      // PARAGRAPH DISCLOSURE: a reply with no parts (or a first part that has run long) has said
      // enough to be getting on with; the rest is a press away, under a row that says what it holds
      const settled = i < blocks.length && !(o.tailIn && i === blocks.length - 1);
      fold = { kind: 'fold', head: -1, body: [i], preview: '', words: words(i), lines: lines(i), writing: false, title: (i < blocks.length ? openingSentence(blocks[i], settled) : openingSentence({ kind: 'p', text: o.tail ?? '' }, false)) ?? 'More' };
      pieces.push(fold);
    } else {
      pieces.push({ kind: 'block', i });
      if (prose(i)) {
        openWords += words(i);
        // the rest of an opening paragraph whose lead was set apart is still that one paragraph
        if (!(b?.kind === 'p' && b.split)) openBlocks++;
      }
    }
    before += words(i);
  }

  // A fold still being written stays folded (its length is not known yet);
  // a finished one too short to be worth a press opens; a heading with nothing
  // under it, once the reply has landed, is just a heading.
  const out: Piece[] = [];
  pieces.forEach((p, k) => {
    if (p.kind !== 'fold') return out.push(p);
    const writing = !!o.streaming && k === pieces.length - 1;
    if (!writing && (p.body.length === 0 || p.lines < FOLD_MIN_LINES)) {
      if (p.head >= 0 && !p.cont) out.push({ kind: 'block', i: p.head });
      out.push(...p.body.map((i) => ({ kind: 'block' as const, i })));
      return;
    }
    out.push(finishFold(p, blocks, writing));
  });
  // A landed reply's closing line — what it opens up next, a short paragraph
  // after its last part — belongs to the whole reply, like its question: it is
  // kept in view rather than folded into the part above it.
  if (!o.streaming) {
    const lf = out.map((p) => p.kind).lastIndexOf('fold');
    const fold = lf >= 0 ? (out[lf] as Fold) : null;
    const after = out.slice(lf + 1);
    const lastBody = fold ? fold.body[fold.body.length - 1] : -1;
    const coda = fold && lastBody >= 0 ? blocks[lastBody] : undefined;
    if (
      fold &&
      fold.body.length >= 2 &&
      after.every((p) => p.kind === 'block' && blocks[p.i]?.kind === 'ui') &&
      coda?.kind === 'p' &&
      blockWords(coda) <= 45
    ) {
      out[lf] = finishFold({ ...fold, body: fold.body.slice(0, -1), words: fold.words - blockWords(coda), lines: fold.lines - blockLines(coda) }, blocks, false);
      out.splice(lf + 1, 0, { kind: 'block', i: lastBody });
    }
  }
  if (askAt >= 0) out.push({ kind: 'ask', i: askAt });

  // the lead, last: it needs to know what follows it
  const head = out[0];
  if (head?.kind === 'block' && head.i === 0) {
    let rest = 0;
    for (let i = 1; i < n; i++) rest += words(i);
    if (isLead(blocks[0], rest)) out[0] = { ...head, lead: true };
  }
  return out;
}

/**
 * A fold's row, filled in: its first words, and — for a fold with no heading
 * to say what it holds — how much is in it. When the row is titled by the
 * fold's own opening sentence, the first words shown are the ones after it,
 * so the row does not say the same thing twice.
 */
function finishFold(p: Fold, blocks: Block[], writing: boolean): Fold {
  const settled = p.body.filter((i) => i < blocks.length).map((i) => blocks[i]);
  const titled = p.head < 0 && !p.cont && p.title && p.title !== 'More';
  let preview = previewOf(settled[0]);
  if (titled && settled[0] && (settled[0].kind === 'p' || settled[0].kind === 'quote')) {
    const text = stripMarks(settled[0].text).replace(/\s+/g, ' ').trim();
    const at = text.indexOf(p.title!);
    const rest = at >= 0 ? text.slice(at + p.title!.length).replace(/^[.!?…]?\s*/, '') : '';
    preview = rest ? previewOf({ kind: 'p', text: rest }) : previewOf(settled[1]);
  }
  const unheaded = p.head < 0 || !!p.cont;
  return { ...p, writing, preview, ...(unheaded && !writing ? { count: foldCount(settled) } : {}) };
}

// ── depth on request ─────────────────────────────────────────────────

/**
 * The person asked to read it in full: "in detail", "step by step", "walk me
 * through", "explain it fully", "everything about", going deeper from one of a
 * reply's paths ("Go deeper: …") — or their length setting is Detailed. Read
 * on the client from the message the reply answers, so no route change is
 * needed and an old conversation is read the same way when it is reopened.
 * "No need to go into detail" is not a request for detail.
 */
const DEPTH_ASK =
  /\b(?:in (?:great |full |more |real |much |a lot of |lots of )?detail|detailed|step[- ]by[- ]step|go(?:ing)? (?:deeper|further|in depth)|take me (?:deeper|further)|deep(?:er)? dive|in[- ]depth|explain (?:[\w'’-]+ ){0,6}?(?:fully|in full|thoroughly|completely)|(?:fully|thoroughly|completely) explain|full explanation|everything (?:about|on|there is)|tell me everything|walk me through|take me through)\b/i;
const NOT_DEPTH = /\b(?:no|not|without|don['’]t|do not|no need to|skip(?: the)?)\s+(?:[\w'’-]+\s+){0,3}?(?:detail|depth|step[- ]by[- ]step|deeper)\b/i;

export function depthAsked(asked?: string | null, length?: string | null): boolean {
  if (length === 'detailed') return true;
  const t = typeof asked === 'string' ? asked : '';
  return DEPTH_ASK.test(t) && !NOT_DEPTH.test(t);
}

// ── a reply still arriving ───────────────────────────────────────────

/** A line of a list, or a heading in markdown's own spelling — each ends a paragraph, so it can settle. */
const isListish = (l: string) => !!listLine(l);
const isHashHeading = (l: string) => /^#{1,3}\s+\S/.test(l);

/**
 * The complete lines at the head of the paragraph still being written that
 * can be drawn as what they are already: a list's items, a table's header and
 * rows (once its rule is complete), a heading — and the lines of prose before
 * them, which the list or table ends. Only whole lines settle, and only lines
 * that end the structure they belong to or extend it, so the settled text is
 * always a prefix of the landed reply read the same way: append-only.
 */
function settleTail(tail: string): { settle: string; tail: string } {
  const lines = tail.split('\n');
  const partial = lines.pop() ?? '';
  let done = 0;
  let j = 0;
  while (j < lines.length) {
    let s = -1;
    for (let k = j; k < lines.length; k++) {
      if (isListish(lines[k]) || isHashHeading(lines[k]) || (lines[k].includes('|') && k + 1 < lines.length && isTableRule(lines[k + 1]))) {
        s = k;
        break;
      }
    }
    if (s < 0) break;
    let e = s + 1;
    if (isListish(lines[s])) while (e < lines.length && (isListish(lines[e]) || /^\s{2,}\S/.test(lines[e]))) e++;
    else if (!isHashHeading(lines[s])) {
      e = s + 2;
      while (e < lines.length && lines[e].includes('|') && lines[e].trim() !== '') e++;
    }
    done = e;
    j = e;
  }
  // a line of prose that a list item is about to end ("Here are the options:" over "- Alf…")
  if (listLine(partial) && done < lines.length) done = lines.length;
  if (!done) return { settle: '', tail };
  return { settle: lines.slice(0, done).join('\n'), tail: [...lines.slice(done), partial].join('\n') };
}

/**
 * A streaming reply split into what has settled (every paragraph with a blank
 * line after it) and the paragraph still being written. Inside an unclosed
 * fence, all of it has settled: the fence is the block being written. With
 * `editorial`, a part's heading that has finished its line settles at once, so
 * a folded part folds as it begins rather than spilling out and jumping in —
 * and so does every complete line of a list or a table (settleTail): a list
 * arrives an item at a time, already a list, instead of as one run-on line of
 * raw dashes and pipes that snaps into shape at the end. `joins`: the text
 * still being written follows the settled text directly, on the next line
 * (so it may be that list's next item, or that table's next row).
 */
export function streamingSplit(text: string, editorial = false): { settled: string; tail: string; joins: boolean } {
  const cut = text.lastIndexOf('\n\n');
  // inside an unclosed fence — as the parser reads fences, one-line blocks and all
  const read = text.includes('```') ? parseBlocks(text, { rich: true }) : [];
  const end = read[read.length - 1];
  const inFence = !!end && (end.kind === 'code' || end.kind === 'ui') && end.open;
  let settled = inFence ? text : cut > 0 ? text.slice(0, cut) : '';
  let tail = inFence ? '' : cut > 0 ? text.slice(cut + 2) : text;
  let joins = false;
  if (editorial && !inFence) {
    const nl = tail.indexOf('\n');
    const first = nl > 0 ? tail.slice(0, nl) : '';
    if (first && (/^#{1,3}\s+\S/.test(first) || fakeHeading(first))) {
      settled = settled ? `${settled}\n\n${first}` : first;
      tail = tail.slice(nl + 1);
      joins = true;
    }
    const more = settleTail(tail);
    if (more.settle) {
      settled = settled ? `${settled}\n\n${more.settle}` : more.settle;
      tail = more.tail;
      joins = true;
    }
  }
  return { settled, tail, joins };
}

/**
 * What the text still being written is, so it can be drawn as what it will be:
 *
 *   'li'    the next item of the list just settled (or of a loose list, after
 *           a blank line — joined to it as the editorial reading joins it)
 *   'sub'   a line under that list's last item: its continuation, or a point
 *           nested under it
 *   'row'   the next row of the table just settled
 *   'list'  the first item of a list not yet begun
 *   'table' a table whose rule has not finished arriving
 *   'p'     a paragraph
 *
 * The first three are drawn inside the block they continue (`tailIn`).
 */
export type TailShape = 'li' | 'sub' | 'row' | 'list' | 'table' | 'p';

export function tailShape(blocks: Block[], tail: string, joins: boolean): TailShape | null {
  if (!tail.trim()) return null;
  const one = !tail.includes('\n');
  const last = blocks[blocks.length - 1];
  const item = one ? listLine(tail) : null;
  const listKind = last?.kind === 'ul' || last?.kind === 'groups' || (last?.kind === 'terms' && !last.ordered) ? 'ul' : last?.kind === 'ol' || (last?.kind === 'terms' && last.ordered) ? 'ol' : null;
  if (listKind && one) {
    if (joins && /^\s{2,}\S/.test(tail)) return 'sub';
    if (item && (listKind === 'ol') === item.ordered && (joins || item.indent < 2)) return 'li';
    // a mark still being typed under a list ("-", "3"): the next item, not a stray character
    if (joins && /^\s*(?:[-•*]|\d{1,3}[.)]?)\s*$/.test(tail)) return 'li';
  }
  if (one && joins && last?.kind === 'table' && tail.trimStart().startsWith('|')) return 'row';
  if (item) return 'list';
  if (tail.trimStart().startsWith('|')) return 'table';
  return 'p';
}
