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
//     three lines on the page) is shown open once it is complete. What belongs to the whole reply is never
//     folded: its closing question, and the ways it could go next (a "paths"
//     block).
//
// Pure: no React, no DOM. components/RichText.tsx draws what this returns.


/** Elements that stay in view whatever heading they fall under: where the reply could go next, and anything the person works with. */
const NEVER_FOLDED = new Set<string>(['paths', 'graph', 'sim', 'slider', 'decide', 'steps', 'check', 'claim']);
import { stripMarks, type Block } from './rich-text';

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
 * Rich blocks read the way Logos 5 lays a reply out: a bold line standing
 * alone over what follows becomes a heading, and a list of labelled items a
 * set of terms. `more`: the reply is still arriving after the last block, so a
 * bold line at the end may yet have something under it.
 */
export function editorialBlocks(blocks: Block[], opts: { more?: boolean } = {}): Block[] {
  return blocks.map((b, i) => {
    if (b.kind === 'p') {
      const next = blocks[i + 1];
      const followed = next ? next.kind !== 'h' && !(next.kind === 'p' && fakeHeading(next.text)) : !!opts.more;
      const h = followed ? fakeHeading(b.text) : null;
      return h ? { kind: 'h', level: 3, text: h } : b;
    }
    if ((b.kind === 'ul' || b.kind === 'ol') && b.items.length >= 2) {
      const terms = b.items.map(termOf);
      if (terms.every((x): x is { label: string; body: string } => !!x)) return { kind: 'terms', ordered: b.kind === 'ol', items: terms };
    }
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
      return b.items.reduce((n, it) => n + wordCount(stripMarks(it)), 0);
    case 'terms':
      return b.items.reduce((n, it) => n + wordCount(stripMarks(it.label)) + wordCount(stripMarks(it.body)), 0);
    case 'groups':
      return b.groups.reduce((n, g) => n + (g.header ? wordCount(stripMarks(g.header)) : 0) + g.items.reduce((m, it) => m + wordCount(stripMarks(it)), 0), 0);
    case 'table':
      return [...b.header, ...b.rows.flat()].reduce((n, c) => n + wordCount(stripMarks(c)), 0);
    case 'code':
      return Math.min(40, wordCount(b.text));
    case 'sources':
      return b.items.length * 3;
    case 'ui':
      // an element says something, and takes room: it counts as a short paragraph
      return 30;
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
      return b.items.reduce((n, it) => n + lines(it), 0);
    case 'terms':
      return b.items.reduce((n, it) => n + lines(`${it.label} ${it.body}`), 0);
    case 'groups':
      return b.groups.reduce((n, g) => n + (g.header ? 1 : 0) + g.items.reduce((m, it) => m + lines(it), 0), 0);
    case 'table':
      return b.rows.length + 1;
    case 'code':
      return Math.max(1, b.text.split('\n').length);
    case 'sources':
      return b.items.length;
    case 'ui':
      return 4;
  }
}

/** The first words of a part, for its folded row. */
export function previewOf(b: Block | undefined): string {
  if (!b) return '';
  let text = '';
  switch (b.kind) {
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
  /** a part folded under its heading: `head` and `body` are block indices (`body` may hold the paragraph still being written, index = blocks.length) */
  | { kind: 'fold'; head: number; body: number[]; preview: string; words: number; lines: number; writing: boolean }
  /** the closing question, never folded */
  | { kind: 'ask'; i: number };

export interface LayoutOptions {
  /** the reply is still arriving */
  streaming?: boolean;
  /** the paragraph still being written, after the last block (streaming) — laid out as block index `blocks.length` */
  tail?: string;
}

/**
 * Where each block of a reply goes: in the flow, as the lead, inside a fold, or
 * as the closing question. Deterministic and backward-looking, so a reply
 * mid-stream and the same reply landed agree on everything already written.
 */
export function layoutReply(blocks: Block[], o: LayoutOptions = {}): Piece[] {
  const tailWords = o.streaming && o.tail ? wordCount(stripMarks(o.tail)) : 0;
  const hasTail = tailWords > 0;
  const n = blocks.length + (hasTail ? 1 : 0);
  const words = (i: number) => (i === blocks.length ? tailWords : blockWords(blocks[i]));
  const lines = (i: number) => (i === blocks.length ? Math.max(1, Math.ceil(tailWords / WORDS_PER_LINE)) : blockLines(blocks[i]));
  // a reply that has landed and ends by asking keeps its question out of any fold
  const last = blocks[blocks.length - 1];
  const askAt = !o.streaming && last?.kind === 'p' && endsAsQuestion(stripMarks(last.text)) && blocks.length > 1 ? blocks.length - 1 : -1;

  const pieces: Piece[] = [];
  let fold: Extract<Piece, { kind: 'fold' }> | null = null;
  let headings = 0;
  let before = 0;
  for (let i = 0; i < n; i++) {
    if (i === askAt) break;
    const b = i < blocks.length ? blocks[i] : null;
    if (b?.kind === 'h') {
      headings++;
      if (headings >= 2 && before >= FOLD_AFTER_WORDS) {
        fold = { kind: 'fold', head: i, body: [], preview: '', words: 0, lines: 0, writing: false };
        pieces.push(fold);
      } else {
        fold = null;
        pieces.push({ kind: 'block', i });
      }
    } else if (b?.kind === 'ui' && b.spec && NEVER_FOLDED.has(b.spec.type)) {
      // where the reply could go next belongs to all of it; and a thing to work with — a graph, a
      // simulation, a question, the working — is never put behind a press
      fold = null;
      pieces.push({ kind: 'block', i });
    } else if (fold) {
      fold.body.push(i);
      fold.words += words(i);
      fold.lines += lines(i);
    } else {
      pieces.push({ kind: 'block', i });
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
      out.push({ kind: 'block', i: p.head }, ...p.body.map((i) => ({ kind: 'block' as const, i })));
      return;
    }
    const first = p.body.find((i) => i < blocks.length);
    out.push({ ...p, writing, preview: previewOf(first === undefined ? undefined : blocks[first]) });
  });
  // A landed reply's closing line — what it opens up next, a short paragraph
  // after its last part — belongs to the whole reply, like its question: it is
  // kept in view rather than folded into the part above it.
  if (!o.streaming) {
    const lf = out.map((p) => p.kind).lastIndexOf('fold');
    const fold = lf >= 0 ? (out[lf] as Extract<Piece, { kind: 'fold' }>) : null;
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
      out[lf] = { ...fold, body: fold.body.slice(0, -1), words: fold.words - blockWords(coda), lines: fold.lines - blockLines(coda) };
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

// ── a reply still arriving ───────────────────────────────────────────

/**
 * A streaming reply split into what has settled (every paragraph with a blank
 * line after it) and the paragraph still being written. Inside an unclosed
 * fence, all of it has settled: the fence is the block being written. With
 * `editorial`, a part's heading that has finished its line settles at once, so
 * a folded part folds as it begins rather than spilling out and jumping in.
 */
export function streamingSplit(text: string, editorial = false): { settled: string; tail: string } {
  const cut = text.lastIndexOf('\n\n');
  const fences = (text.match(/^\s*```/gm) ?? []).length;
  let settled = fences % 2 === 1 ? text : cut > 0 ? text.slice(0, cut) : '';
  let tail = fences % 2 === 1 ? '' : cut > 0 ? text.slice(cut + 2) : text;
  if (editorial) {
    const nl = tail.indexOf('\n');
    const first = nl > 0 ? tail.slice(0, nl) : '';
    if (first && (/^#{1,3}\s+\S/.test(first) || fakeHeading(first))) {
      settled = settled ? `${settled}\n\n${first}` : first;
      tail = tail.slice(nl + 1);
    }
  }
  return { settled, tail };
}
