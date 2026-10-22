// lib/logos5/study.ts — FILES SORTED INTO TOPICS, AND PRACTICE MADE FROM THEM.
//
// Logos 5's study path: a person drops their notes, slides or a review sheet
// and says what they are doing ("help me get ready for exam 2"). Socria sorts
// the files into a handful of topics, says where to start, and makes practice
// from the files' own words and numbers — checked when they submit.
//
// What it promises, and how each promise is kept here, in code:
//
//   1. EVERY QUOTE IS THE FILE'S OWN WORDS, WITH ITS PAGE. The model only
//      points at passages (their block ids, lib/docs/types.ts); the words
//      shown are cut from the block as the file holds it. A quote the block
//      does not contain is replaced by the block's own nearest sentence, and
//      a topic nothing in the files backs is dropped.
//   2. NOTHING IS GENERATED UNTIL IT IS ASKED FOR. Sorting is one call; a
//      topic's practice is made when "Practice this" is pressed.
//   3. YOUR NUMBERS. A journal-entry exercise keeps an event only when every
//      number in it is in the passage it cites, and its answer only when the
//      debits equal the credits and each amount is in the passage (or one
//      step of arithmetic on two of its numbers).
//   4. CHECKED WHEN YOU SUBMIT, NOT BEFORE. Checking is exact and done here.
//
// The whole study — the topics, the practice, what was typed, what was
// checked — is one display's state in the session's map (lib/objects), so it
// is saved, synced and shared with the line of thinking like any display,
// and every saved conversation keeps its shape.
//
// PURE.

import type { DocBlock, SourceDoc } from '@/lib/docs/types';
import { cleanText } from '@/lib/objects/display-base';

// ── what the person is doing ─────────────────────────────────────────

export const INTENTS = {
  exam: 'studying for an exam',
  assignment: 'working through an assignment',
  writing: 'writing something',
  files: 'making sense of your files',
  think: 'thinking something through',
} as const;
export type Intent = keyof typeof INTENTS;
export const INTENT_KEYS = Object.keys(INTENTS) as Intent[];

/**
 * What they are doing, from their words and whether they brought files. A
 * reading, said back as "Looks like: …" and changed with one press — nothing
 * to set up.
 */
export function intentOf(text: string, files: number): Intent {
  const t = (text || '').toLowerCase();
  if (/\b(exam|midterm|final|quiz|test|review sheet|study guide|studying|cram|revise|revision)\b/.test(t)) return 'exam';
  if (/\b(homework|assignment|problem set|pset|worksheet|due)\b/.test(t)) return 'assignment';
  if (/\b(essay|paper|draft|thesis|write|writing|report)\b/.test(t)) return 'writing';
  if (files > 0) return /\b(review|exam)\b/.test(t) ? 'exam' : 'files';
  return 'think';
}

// ── the material, as the model is shown it ───────────────────────────

/** "1:p3.12" — the first file's block p3.12. Short, so the model can point at many. */
export function blockKey(file: number, block: string): string {
  return `${file + 1}:${block}`;
}

export function parseKey(key: unknown): { file: number; block: string } | null {
  if (typeof key !== 'string') return null;
  const m = /^(\d{1,2}):(p\d{1,4}\.\d{1,5})$/.exec(key.trim());
  return m ? { file: Number(m[1]) - 1, block: m[2] } : null;
}

const SKIP_KINDS = new Set(['header', 'footer']);

/** The blocks worth showing anyone: nothing empty, no running heads. */
export function studyBlocks(doc: SourceDoc): DocBlock[] {
  return doc.blocks.filter((b) => !SKIP_KINDS.has(b.kind) && !b.flags?.includes('misread') && b.text.replace(/\s+/g, '').length >= 3);
}

/**
 * The files as numbered passages, for the sorting call: "[1:p3.12] heading:
 * Accrued expenses". Capped by characters, file by file in turn, so a long
 * first file cannot crowd the others out; what was left out is counted.
 */
export function materialFor(docs: SourceDoc[], budget = 36_000): { text: string; shown: number; left: number } {
  const perBlock = 420;
  const lists = docs.map((d) => studyBlocks(d));
  const out: string[][] = docs.map((d, i) => [`## File ${i + 1}: ${cleanText(d.title || d.name, 80)} (${d.pageCount} ${d.pageCount === 1 ? 'page' : 'pages'})`]);
  let used = out.reduce((n, l) => n + l[0].length, 0);
  let shown = 0;
  let total = 0;
  for (const l of lists) total += l.length;
  const at = lists.map(() => 0);
  let moved = true;
  while (moved && used < budget) {
    moved = false;
    for (let f = 0; f < lists.length && used < budget; f++) {
      const b = lists[f][at[f]];
      if (!b) continue;
      at[f] += 1;
      moved = true;
      const line = `[${blockKey(f, b.id)}] ${b.kind === 'paragraph' ? '' : b.kind + ': '}${cleanText(b.text, perBlock)}`;
      if (used + line.length > budget) break;
      out[f].push(line);
      used += line.length + 1;
      shown += 1;
    }
  }
  return { text: out.map((l) => l.join('\n')).join('\n\n'), shown, left: total - shown };
}

// ── verbatim ─────────────────────────────────────────────────────────

/** Folded for comparing: typographic quotes and dashes as plain, whitespace collapsed, case off. */
function fold(s: string): string {
  return s
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * The sentences of a passage, as it holds them: broken after a full stop
 * that a capital follows, and never after a short label ("Q3.", "No.",
 * "e.g.") — that stays with the sentence it starts.
 */
export function sentencesOf(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out: string[] = [];
  let from = 0;
  for (const m of clean.matchAll(/[.!?]+["”’)]*\s+(?=["“(]?[A-Z0-9])/g)) {
    const end = (m.index ?? 0) + m[0].length;
    const piece = clean.slice(from, end).trim();
    if (piece.replace(/[^A-Za-z0-9]/g, '').length < 6 || /\b(?:e\.g|i\.e|vs|etc|No|Fig|p|pp|Mr|Ms|Dr)\.$/.test(piece)) continue;
    out.push(piece);
    from = end;
  }
  const last = clean.slice(from).trim();
  if (last) out.push(last);
  return out.filter((p) => p.replace(/[^A-Za-z0-9]/g, '').length >= 3);
}

const WORD_STOP = new Set('the a an and or of to in on for is are was were be by with as at that this it its from which what when how why not'.split(' '));
const wordsIn = (s: string) => new Set(fold(s).split(/[^a-z0-9$%]+/).filter((w) => w.length > 2 && !WORD_STOP.has(w)));

/**
 * The words of the passage the model meant: its quote if the passage holds it
 * (cut from the passage, so its spelling and punctuation are the file's), else
 * the passage's own sentence closest to it. Never the model's words.
 */
export function verbatimFrom(blockText: string, said: unknown, max = 260): string {
  const text = blockText.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const want = typeof said === 'string' ? said.replace(/^["“'‘]+|["”'’]+$/g, '').replace(/\s+/g, ' ').trim() : '';
  if (want.length >= 8) {
    const i = fold(text).indexOf(fold(want));
    // fold keeps length one-for-one, so the place in the folded text is the place in the text
    if (i >= 0) return clip(text.slice(i, i + want.length), max);
  }
  const sentences = sentencesOf(text);
  if (!sentences.length) return clip(text, max);
  if (!want) return clip(sentences[0], max);
  const w = wordsIn(want);
  let best = sentences[0];
  let score = -1;
  for (const s of sentences) {
    let n = 0;
    for (const x of wordsIn(s)) if (w.has(x)) n += 1;
    if (n > score) {
      score = n;
      best = s;
    }
  }
  return clip(best, max);
}

/** Cut at a word with an ellipsis — the cut is said, the words kept are still the file's. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

// ── the plan ─────────────────────────────────────────────────────────

export const TOPIC_KINDS = ['foundation', 'concept', 'procedure', 'example', 'review'] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];
export const TOPIC_KIND_LABEL: Record<TopicKind, string> = {
  foundation: 'Foundation',
  concept: 'Concept',
  procedure: 'Procedure',
  example: 'Worked example',
  review: 'Review questions',
};

export interface StudyQuote {
  /** the document's id (its hash) */
  doc: string;
  /** "p7.3" */
  block: string;
  page: number;
  /** verbatim — the file's own words */
  text: string;
}

export interface StudyTopic {
  id: string;
  title: string;
  kind: TopicKind;
  /** one line — Socria's, and shown as Socria's */
  summary: string;
  quotes: StudyQuote[];
  /** every passage it rests on, "docIndex:block" resolved to doc + block */
  blocks: { doc: string; block: string }[];
  tables: number;
  /** the questions its passages number, by file — "Q3–Q6" on the board */
  questions?: { doc: string; ns: number[] }[];
  /** equations among its passages */
  formulas?: number;
  /** the terms it defines, when it is a list of terms */
  terms?: number;
  /** the topics it builds on */
  after: string[];
}

export interface StudyFile {
  doc: string;
  name: string;
  pages: number;
}

/** What can be given to be sorted: documents, slides, sheets, notes, photos of a page. */
export const STUDY_ACCEPT = '.pdf,.docx,.pptx,.xlsx,.odt,.odp,.ods,.rtf,.md,.txt,.csv,.tsv,.html,.htm,.tex,.ipynb,.png,.jpg,.jpeg,.webp';

export const MAX_TOPICS = 9;
const MAX_QUOTES = 6;
const MAX_BLOCKS = 40;

/** A topic's sources: the distinct passages it rests on. */
export function sourcesOf(t: StudyTopic): number {
  return new Set([...t.blocks.map((b) => `${b.doc}:${b.block}`), ...t.quotes.map((q) => `${q.doc}:${q.block}`)]).size;
}

function findBlock(docs: SourceDoc[], key: unknown): { doc: SourceDoc; block: DocBlock } | null {
  const k = parseKey(key);
  if (!k) return null;
  const doc = docs[k.file];
  const block = doc?.blocks.find((b) => b.id === k.block);
  return doc && block && !SKIP_KINDS.has(block.kind) ? { doc, block } : null;
}

export interface Sorted {
  course: string;
  topics: StudyTopic[];
  start: string | null;
  /** why that one first — Socria's words */
  why: string;
}

/**
 * The model's sorting, kept only as far as the files bear it out: passages
 * that exist, quotes cut from them, at most nine topics, links only to
 * topics listed before (so the board reads one way and never loops).
 */
export function sanitizeSorted(raw: unknown, docs: SourceDoc[]): Sorted | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.topics) ? r.topics.slice(0, MAX_TOPICS * 2) : [];
  const topics: StudyTopic[] = [];
  const indexToId = new Map<number, string>();
  const rawAfter: unknown[] = [];
  list.forEach((t0, i) => {
    if (topics.length >= MAX_TOPICS || !t0 || typeof t0 !== 'object') return;
    const t = t0 as Record<string, unknown>;
    const title = cleanText(t.title, 60);
    if (!title) return;
    const blocks: { doc: string; block: string }[] = [];
    let tables = 0;
    let formulas = 0;
    let terms = 0;
    const qs = new Map<string, Set<number>>();
    const isTerms = /\b(terms?|glossary|vocabulary|definitions?|key words)\b/i.test(title);
    /** what a passage adds to the counts on its card */
    const tally = (doc: SourceDoc, b: DocBlock) => {
      if (b.kind === 'table') tables += 1;
      if (b.kind === 'equation' || b.tex) formulas += 1;
      if (isTerms && (b.kind === 'list' || /^[A-Z][^.:—–-]{1,40}\s[—–:-]\s/.test(b.text))) terms += 1;
      for (const m of b.text.matchAll(/\bQ(?:uestion)?\s?(\d{1,3})\b/g)) {
        const set = qs.get(doc.id) ?? new Set<number>();
        set.add(Number(m[1]));
        qs.set(doc.id, set);
      }
    };
    const seen = new Set<string>();
    for (const key of Array.isArray(t.blocks) ? t.blocks.slice(0, MAX_BLOCKS * 2) : []) {
      const f = findBlock(docs, key);
      if (!f) continue;
      const id = `${f.doc.id}:${f.block.id}`;
      if (seen.has(id) || blocks.length >= MAX_BLOCKS) continue;
      seen.add(id);
      blocks.push({ doc: f.doc.id, block: f.block.id });
      tally(f.doc, f.block);
    }
    const quotes: StudyQuote[] = [];
    const quoted = new Set<string>();
    for (const q0 of Array.isArray(t.quotes) ? t.quotes.slice(0, MAX_QUOTES * 2) : []) {
      if (quotes.length >= MAX_QUOTES) break;
      const q = (q0 && typeof q0 === 'object' ? q0 : {}) as Record<string, unknown>;
      const f = findBlock(docs, q.block);
      if (!f || f.block.kind === 'table' || f.block.kind === 'figure') continue;
      const text = verbatimFrom(f.block.text, q.text);
      const id = `${f.doc.id}:${f.block.id}:${text}`;
      if (!text || quoted.has(id)) continue;
      quoted.add(id);
      quotes.push({ doc: f.doc.id, block: f.block.id, page: f.block.page, text });
      if (!seen.has(`${f.doc.id}:${f.block.id}`) && blocks.length < MAX_BLOCKS) {
        seen.add(`${f.doc.id}:${f.block.id}`);
        blocks.push({ doc: f.doc.id, block: f.block.id });
        tally(f.doc, f.block);
      }
    }
    // a topic with passages but no quote shows its first passage's own first sentence
    if (!quotes.length) {
      for (const b of blocks) {
        const doc = docs.find((d) => d.id === b.doc);
        const block = doc?.blocks.find((x) => x.id === b.block);
        if (!block || block.kind === 'table' || block.kind === 'figure' || block.kind === 'heading' || block.kind === 'title') continue;
        const text = verbatimFrom(block.text, '');
        if (text) {
          quotes.push({ doc: b.doc, block: b.block, page: block.page, text });
          break;
        }
      }
    }
    // nothing in the files backs it: it is not a topic of theirs
    if (!blocks.length || !quotes.length) return;
    const kind = (TOPIC_KINDS as readonly string[]).includes(String(t.kind)) ? (t.kind as TopicKind) : 'concept';
    const id = `t${topics.length + 1}`;
    indexToId.set(i, id);
    const questions = [...qs].map(([doc, ns]) => ({ doc, ns: [...ns].sort((x, y) => x - y).slice(0, 30) }));
    topics.push({
      id,
      title,
      kind,
      summary: cleanText(t.summary, 180),
      quotes,
      blocks,
      tables,
      ...(questions.length ? { questions } : {}),
      ...(formulas ? { formulas } : {}),
      ...(terms ? { terms } : {}),
      after: [],
    });
    // links are read after every topic is known
    rawAfter.push(t.after);
  });
  if (!topics.length) return null;
  for (const [i, t] of topics.entries()) {
    const raw = rawAfter[i];
    const after = new Set<string>();
    for (const a of Array.isArray(raw) ? raw.slice(0, 4) : []) {
      const id = typeof a === 'number' ? indexToId.get(a) : typeof a === 'string' && /^t\d+$/.test(a) ? a : undefined;
      const at = id ? topics.findIndex((x) => x.id === id) : -1;
      if (id && at >= 0 && at < i) after.add(id);
    }
    t.after = [...after];
  }
  const startRaw = typeof r.start === 'number' ? indexToId.get(r.start) : typeof r.start === 'string' ? r.start : undefined;
  const start = startRaw && topics.some((t) => t.id === startRaw) ? startRaw : recommend(topics);
  return { course: cleanText(r.course, 48), topics, start, why: cleanText(r.why, 200) };
}

/**
 * Where to start, when nobody said: the first foundation that others build
 * on, else the topic most others build on, else the first.
 */
export function recommend(topics: StudyTopic[]): string | null {
  if (!topics.length) return null;
  const builtOn = new Map<string, number>();
  for (const t of topics) for (const a of t.after) builtOn.set(a, (builtOn.get(a) ?? 0) + 1);
  const found = topics.find((t) => t.kind === 'foundation' && (builtOn.get(t.id) ?? 0) > 0) ?? topics.find((t) => t.kind === 'foundation');
  if (found) return found.id;
  let best = topics[0];
  for (const t of topics) if ((builtOn.get(t.id) ?? 0) > (builtOn.get(best.id) ?? 0)) best = t;
  return best.id;
}

/**
 * The files sorted with no model at all: one topic per section the files
 * mark with a heading, else one per page. Used when the sorting call cannot
 * be made or comes back with nothing the files bear out — the board is
 * plainer, and every quote on it is still the file's own words.
 */
export function plainSort(docs: SourceDoc[]): Sorted | null {
  const raw: { title: string; kind: TopicKind; blocks: string[]; quotes: { block: string; text: string }[]; after: number[] }[] = [];
  docs.forEach((doc, f) => {
    const blocks = studyBlocks(doc);
    let cur: (typeof raw)[number] | null = null;
    const push = () => {
      if (cur && cur.blocks.length > 1) raw.push(cur);
    };
    const headed = blocks.some((b) => b.kind === 'heading');
    let page = 0;
    for (const b of blocks) {
      const starts = headed ? b.kind === 'heading' && (b.level ?? 1) <= 2 : b.page !== page;
      if (starts) {
        push();
        page = b.page;
        const title = headed ? cleanText(b.text, 60) : `${cleanText(doc.title || doc.name, 40)} · p.${b.page}`;
        cur = { title, kind: /review|question|practice|exercise/i.test(title) ? 'review' : 'concept', blocks: [], quotes: [], after: [] };
      }
      if (!cur) cur = { title: cleanText(doc.title || doc.name, 60), kind: 'concept', blocks: [], quotes: [], after: [] };
      const key = blockKey(f, b.id);
      cur.blocks.push(key);
      if (cur.quotes.length < 3 && (b.kind === 'paragraph' || b.kind === 'list' || b.kind === 'quote')) cur.quotes.push({ block: key, text: '' });
    }
    push();
  });
  if (!raw.length) return null;
  if (raw[0]) raw[0].kind = raw[0].kind === 'review' ? 'review' : 'foundation';
  return sanitizeSorted({ topics: raw.slice(0, MAX_TOPICS), start: 0 }, docs);
}

// ── the board ────────────────────────────────────────────────────────

/**
 * The board as the mockup draws it: the lead row — where to start, in the
 * middle, and the two topics the files say most about either side of it —
 * then the rest, smaller, beneath. Three or fewer topics are all lead.
 */
export function boardRows(topics: StudyTopic[], start: string | null): { lead: string[]; rest: string[] } {
  if (topics.length <= 3) return { lead: topics.map((t) => t.id), rest: [] };
  const first = start && topics.some((t) => t.id === start) ? start : null;
  const others = topics
    .filter((t) => t.id !== first)
    .sort((a, b) => sourcesOf(b) - sourcesOf(a) || topics.indexOf(a) - topics.indexOf(b))
    .slice(0, first ? 2 : 3);
  const chosen = new Set([...(first ? [first] : []), ...others.map((t) => t.id)]);
  let lead = topics.filter((t) => chosen.has(t.id)).map((t) => t.id);
  if (first && lead.length === 3) {
    const sides = lead.filter((id) => id !== first);
    lead = [sides[0], first, sides[1]];
  }
  return { lead, rest: topics.filter((t) => !chosen.has(t.id)).map((t) => t.id) };
}

/** "4 review questions" for a set of questions; the kind's own name otherwise. */
export function kindSaid(t: Pick<StudyTopic, 'kind' | 'questions'>): string {
  const n = (t.questions ?? []).reduce((sum, q) => sum + q.ns.length, 0);
  if (t.kind === 'review' && n) return `${n} review ${n === 1 ? 'question' : 'questions'}`;
  return TOPIC_KIND_LABEL[t.kind];
}

// ── practice ─────────────────────────────────────────────────────────

/** A blank in a sentence from the files: before, the answer, after — all three the file's words. */
export interface ClozeItem {
  id: string;
  before: string;
  answer: string;
  after: string;
  quote: StudyQuote;
}

export interface JournalLine {
  id: string;
  account: string;
  /** other names the same account goes by */
  also: string[];
  side: 'dr' | 'cr';
  amount: number;
  /** why this line — Socria's words, pointing at a passage */
  why: string;
}

export interface JournalEvent {
  id: string;
  /** what happened, with the file's numbers */
  text: string;
  /** the passage it is made from */
  cite: StudyQuote;
  lines: JournalLine[];
  /** a question that points the way without giving it */
  hint: string;
}

export interface Balance {
  assets: number;
  liabilities: number;
  equity: number;
}

export interface Practice {
  id: string;
  topic: string;
  kind: 'cloze' | 'journal';
  title: string;
  /** what it was made from */
  made: StudyQuote[];
  cloze?: ClozeItem[];
  journal?: { events: JournalEvent[]; balance: Balance | null; accounts: string[] };
  /** what the person typed, by blank */
  answers: Record<string, string>;
  /** set when they submit */
  checked: Checked | null;
  /** how many times "more like these" was asked */
  round: number;
}

const TERM_STOP = new Set(
  'about above after again against because before being below between both during each further having here into more most other over same should some such than that their them then there these they this those through under until very what when where which while with would your also only been does doing just like make made many much must need once said shall since used using will'.split(' ')
);

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 2, quarter: 4, monthly: 12, annual: 12, yearly: 12 };

/**
 * Numbers in a passage, as values: "$1,200" → 1200, "6%" → 6, "(350)" → 350.
 * With `words`, the small numbers written out too — "six months" is a 6 —
 * which is what arithmetic on a passage may use, never what an event may cite.
 */
export function numbersIn(text: string, opts: { words?: boolean } = {}): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?<![A-Za-z0-9])\$?\(?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\)?%?/g)) {
    const v = Number(m[1].replace(/,/g, '') + (m[2] ? '.' + m[2] : ''));
    if (Number.isFinite(v)) out.push(v);
  }
  if (opts.words) for (const m of text.toLowerCase().matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|quarter|monthly|annual|yearly)\b/g)) out.push(NUMBER_WORDS[m[1]]);
  return out;
}

/**
 * The word to blank in a sentence: one of the topic's own words when the
 * sentence uses it, else an amount, else its longest uncommon word. Null when
 * nothing in it is worth asking for.
 */
function termIn(sentence: string, topicWords: Set<string>, used: Set<string>): { start: number; end: number } | null {
  const words = [...sentence.matchAll(/[A-Za-z][A-Za-z'-]{3,}/g)];
  const pick = (m: RegExpMatchArray | undefined) => (m && m.index !== undefined ? { start: m.index, end: m.index + m[0].length } : null);
  const fresh = (w: string) => !used.has(w.toLowerCase());
  const own = words.find((m) => topicWords.has(stem(m[0])) && fresh(m[0]) && !TERM_STOP.has(m[0].toLowerCase()));
  if (own) return pick(own);
  const amount = [...sentence.matchAll(/\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\d+(?:\.\d+)?|\d+%/g)].find((m) => fresh(m[0]));
  if (amount) return pick(amount);
  const long = words.filter((m) => m[0].length >= 6 && !TERM_STOP.has(m[0].toLowerCase()) && fresh(m[0])).sort((a, b) => b[0].length - a[0].length)[0];
  return pick(long);
}

const stem = (w: string) => {
  const s = w.toLowerCase();
  return s.length > 4 && s.endsWith('s') && !s.endsWith('ss') ? s.slice(0, -1) : s;
};

/**
 * Fill-in-the-blank from the topic's own passages: each item a sentence of
 * the file with one word taken out. `round` moves on to sentences not asked
 * yet, so "more like these" is new practice, from the same files.
 */
export function clozeFrom(topic: StudyTopic, docs: SourceDoc[], { round = 0, n = 6 }: { round?: number; n?: number } = {}): ClozeItem[] {
  const topicWords = new Set([...topic.title.matchAll(/[A-Za-z][A-Za-z'-]{3,}/g)].map((m) => stem(m[0])));
  const pool: StudyQuote[] = [...topic.quotes];
  for (const b of topic.blocks) {
    const doc = docs.find((d) => d.id === b.doc);
    const block = doc?.blocks.find((x) => x.id === b.block);
    if (!block || block.kind === 'table' || block.kind === 'figure' || block.kind === 'heading' || block.kind === 'title') continue;
    for (const s of sentencesOf(block.text)) if (s.length >= 30 && s.length <= 260) pool.push({ doc: b.doc, block: b.block, page: block.page, text: s });
  }
  // a quote is often part of a sentence the passage also gives: one of them is asked, not both
  const kept: string[] = [];
  const sentences = pool.filter((q) => {
    const k = fold(q.text.replace(/…$/, ''));
    if (kept.some((x) => x.includes(k) || k.includes(x))) return false;
    kept.push(k);
    return true;
  });
  const out: ClozeItem[] = [];
  const used = new Set<string>();
  const startAt = sentences.length ? (round * n) % sentences.length : 0;
  for (let k = 0; k < sentences.length && out.length < n; k++) {
    const q = sentences[(startAt + k) % sentences.length];
    const text = q.text.replace(/…$/, '');
    const at = termIn(text, topicWords, used);
    if (!at) continue;
    const answer = text.slice(at.start, at.end);
    used.add(answer.toLowerCase());
    out.push({ id: `c${round + 1}.${out.length + 1}`, before: text.slice(0, at.start), answer, after: text.slice(at.end), quote: q });
  }
  return out;
}

/** "Starts with “a” · 8 letters" — a hint, not the answer. */
export function clozeHint(item: ClozeItem): string {
  const a = item.answer;
  if (/\d/.test(a)) return `An amount — it is on page ${item.quote.page}.`;
  return `Starts with “${a[0].toLowerCase()}” · ${a.replace(/[^A-Za-z]/g, '').length} letters`;
}

// ── accounts ─────────────────────────────────────────────────────────

const ACCOUNT_SAME: [RegExp, string][] = [
  [/\bsalar(y|ies)\b/g, 'wages'],
  [/\bwage\b/g, 'wages'],
  [/\ba\/r\b|\bar\b/g, 'accounts receivable'],
  [/\ba\/p\b|\bap\b/g, 'accounts payable'],
  [/\bexp\b|\bexpenses\b/g, 'expense'],
  [/\brev\b|\brevenues\b/g, 'revenue'],
  [/\bdeferred revenue\b/g, 'unearned revenue'],
  [/\baccum\b|\baccumulated\b/g, 'accumulated'],
  [/\bdepr\b|\bdep\b/g, 'depreciation'],
  [/\bpayables\b/g, 'payable'],
  [/\breceivables\b/g, 'receivable'],
  [/\bprepaids?\b/g, 'prepaid'],
];

/** An account's name folded so "Salaries Exp." and "salary expense" are one account. */
export function accountKey(name: string): string {
  let s = ` ${name.toLowerCase().replace(/[^a-z/ ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  for (const [re, to] of ACCOUNT_SAME) s = s.replace(re, to);
  return s
    .replace(/\baccount\b|\bacct\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sameAccount(typed: string, line: Pick<JournalLine, 'account' | 'also'>): boolean {
  const t = accountKey(typed);
  if (!t) return false;
  return [line.account, ...line.also].some((a) => accountKey(a) === t);
}

/** What a person typed as an amount: "$1,200.00" → 1200. NaN when it is not one. */
export function amountOf(typed: string | undefined): number {
  if (typed == null) return NaN;
  const s = String(typed).replace(/[$,\s]/g, '');
  if (!/^\(?-?\d+(\.\d+)?\)?$/.test(s)) return NaN;
  return Math.abs(Number(s.replace(/[()]/g, '')));
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Is this amount in the passage, or one step of arithmetic on two of its numbers? */
export function amountBorne(amount: number, numbers: number[]): boolean {
  if (numbers.some((n) => close(n, amount))) return true;
  for (let i = 0; i < numbers.length; i++)
    for (let j = 0; j < numbers.length; j++) {
      if (i === j) continue;
      const a = numbers[i];
      const b = numbers[j];
      if (close(a + b, amount) || close(a - b, amount) || close(a * b, amount) || (b !== 0 && close(a / b, amount)) || close((a * b) / 100, amount)) return true;
    }
  return false;
}

/**
 * The model's journal-entry exercise, kept only where it is the files' own:
 * an event whose numbers are all in the passage it cites, lines whose debits
 * equal their credits, amounts the passage bears out. A balance check only
 * when its own equation holds. What was dropped is counted, and said.
 */
export function sanitizeJournal(raw: unknown, docs: SourceDoc[]): { title: string; events: JournalEvent[]; balance: Balance | null; accounts: string[]; dropped: number } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const events: JournalEvent[] = [];
  let dropped = 0;
  for (const e0 of Array.isArray(r.events) ? r.events.slice(0, 8) : []) {
    const e = (e0 && typeof e0 === 'object' ? e0 : {}) as Record<string, unknown>;
    const f = findBlock(docs, e.block);
    const text = cleanText(e.text, 200);
    if (!f || !text) {
      dropped += 1;
      continue;
    }
    const nums = numbersIn(f.block.text);
    const told = numbersIn(text).filter((n) => !(n >= 1 && n <= 31 && /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i.test(text)));
    if (told.some((n) => !nums.some((m) => close(m, n)))) {
      dropped += 1;
      continue;
    }
    const lines: JournalLine[] = [];
    for (const l0 of Array.isArray(e.lines) ? e.lines.slice(0, 4) : []) {
      const l = (l0 && typeof l0 === 'object' ? l0 : {}) as Record<string, unknown>;
      const account = cleanText(l.account, 48);
      const side = l.side === 'dr' || l.side === 'debit' ? 'dr' : l.side === 'cr' || l.side === 'credit' ? 'cr' : null;
      const amount = typeof l.amount === 'number' ? l.amount : amountOf(String(l.amount ?? ''));
      if (!account || !side || !(amount > 0)) continue;
      const also = (Array.isArray(l.also) ? l.also : []).map((a) => cleanText(a, 48)).filter(Boolean).slice(0, 3);
      lines.push({ id: `l${lines.length + 1}`, account, also, side, amount, why: cleanText(l.why, 220) });
    }
    const dr = lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
    const cr = lines.filter((l) => l.side === 'cr').reduce((s, l) => s + l.amount, 0);
    const borne = lines.every((l) => amountBorne(l.amount, [...numbersIn(f.block.text, { words: true }), ...told]));
    if (lines.length < 2 || !close(dr, cr) || !dr || !borne) {
      dropped += 1;
      continue;
    }
    // a hint that names the answer is not a hint
    let hint = cleanText(e.hint, 200);
    if (!hint || lines.some((l) => accountKey(hint).includes(accountKey(l.account)))) hint = 'What has happened that the books do not show yet — something used up, earned or owed? Which accounts change, and does each go up or down?';
    events.push({ id: `e${events.length + 1}`, text, cite: { doc: f.doc.id, block: f.block.id, page: f.block.page, text: verbatimFrom(f.block.text, text) }, lines, hint });
    if (events.length >= 5) break;
  }
  let balance: Balance | null = null;
  const b = (r.balance && typeof r.balance === 'object' ? r.balance : null) as Record<string, unknown> | null;
  if (b) {
    const assets = Number(b.assets);
    const liabilities = Number(b.liabilities);
    const equity = Number(b.equity);
    if ([assets, liabilities, equity].every((n) => Number.isFinite(n) && n >= 0) && close(assets, liabilities + equity) && assets > 0) balance = { assets, liabilities, equity };
  }
  const accounts = [...new Set(events.flatMap((e) => e.lines.map((l) => l.account)))];
  return { title: cleanText(r.title, 80), events, balance, accounts, dropped };
}

// ── blanks, filled and checked ───────────────────────────────────────

/** Every blank in a practice set, in the order it is drawn. */
export function blanksOf(p: Practice): string[] {
  if (p.kind === 'cloze') return (p.cloze ?? []).map((c) => c.id);
  const out: string[] = [];
  for (const e of p.journal?.events ?? []) for (const l of e.lines) out.push(`${e.id}.${l.id}.account`, `${e.id}.${l.id}.amount`);
  if (p.journal?.balance) out.push('balance.liabilities', 'balance.equity');
  return out;
}

/** A journal line's amount is one blank, typed in whichever column the person chooses. */
export function lineAmount(answers: Record<string, string>, ev: string, line: string): { side: 'dr' | 'cr' | null; value: number } {
  const dr = amountOf(answers[`${ev}.${line}.dr`]);
  const cr = amountOf(answers[`${ev}.${line}.cr`]);
  if (Number.isFinite(dr) && !Number.isFinite(cr)) return { side: 'dr', value: dr };
  if (Number.isFinite(cr) && !Number.isFinite(dr)) return { side: 'cr', value: cr };
  return { side: null, value: NaN };
}

export function filledOf(p: Practice, answers: Record<string, string> = p.answers): number {
  let n = 0;
  for (const id of blanksOf(p)) {
    const m = /^(e\d+)\.(l\d+)\.amount$/.exec(id);
    if (m) {
      if (lineAmount(answers, m[1], m[2]).side) n += 1;
    } else if ((answers[id] ?? '').trim()) n += 1;
  }
  return n;
}

export interface Gap {
  /** the blank (or row) it is about */
  id: string;
  /** what was asked, short */
  label: string;
  /** what the files say it is */
  answer: string;
  /** why — the file's sentence for a blank, Socria's reason for an entry */
  why: string;
  cite: StudyQuote;
}

export interface Checked {
  /** blank → right or not */
  marks: Record<string, boolean>;
  right: number;
  of: number;
  /** each entry's debits equal its credits, as the person wrote them */
  balanced: boolean | null;
  /** assets = liabilities + equity, with the person's two numbers */
  equation: boolean | null;
  gaps: Gap[];
}

/** An answer folded for checking: case, punctuation and a plural's s do not make it wrong. */
const foldAnswer = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .replace(/(?:es|s)+$/, '');

/** Checked when they submit: exact, here, against the files. */
export function checkPractice(p: Practice, answers: Record<string, string> = p.answers): Checked {
  const marks: Record<string, boolean> = {};
  const gaps: Gap[] = [];
  if (p.kind === 'cloze') {
    for (const c of p.cloze ?? []) {
      const typed = answers[c.id] ?? '';
      const nums = numbersIn(c.answer);
      const ok = nums.length ? nums.length === numbersIn(typed).length && nums.every((n, i) => close(n, numbersIn(typed)[i])) : foldAnswer(typed) === foldAnswer(c.answer);
      marks[c.id] = ok;
      if (!ok) gaps.push({ id: c.id, label: typed.trim() ? `“${cleanText(typed, 40)}” in “…${cleanText(c.before.slice(-40), 40)} ___”` : 'Left blank', answer: c.answer, why: `${c.before}${c.answer}${c.after}`.trim(), cite: c.quote });
    }
    const right = Object.values(marks).filter(Boolean).length;
    return { marks, right, of: Object.keys(marks).length, balanced: null, equation: null, gaps };
  }
  let allBalanced = true;
  let written = 0;
  for (const e of p.journal?.events ?? []) {
    // the person's lines are matched to the answer's by account, so either order is right
    const typed = e.lines.map((l) => ({ line: l.id, account: answers[`${e.id}.${l.id}.account`] ?? '', ...lineAmount(answers, e.id, l.id) }));
    const free = new Set(e.lines.map((l) => l.id));
    const match = new Map<string, JournalLine>();
    for (const t of typed) {
      const k = e.lines.find((l) => free.has(l.id) && sameAccount(t.account, l));
      if (k) {
        free.delete(k.id);
        match.set(t.line, k);
      }
    }
    for (const t of typed) if (!match.has(t.line)) match.set(t.line, e.lines.find((l) => l.id === t.line && free.has(l.id)) ?? e.lines.find((l) => free.has(l.id))!), free.delete(match.get(t.line)!.id);
    let dr = 0;
    let cr = 0;
    const missed: JournalLine[] = [];
    for (const t of typed) {
      const k = match.get(t.line)!;
      const accountOk = sameAccount(t.account, k);
      const amountOk = t.side === k.side && close(t.value, k.amount);
      marks[`${e.id}.${t.line}.account`] = accountOk;
      marks[`${e.id}.${t.line}.amount`] = amountOk;
      if (t.side === 'dr') dr += t.value;
      if (t.side === 'cr') cr += t.value;
      if (!accountOk || !amountOk) missed.push(k);
    }
    // one gap for the entry, with the whole of it: a line is never right on its own
    if (missed.length)
      gaps.push({
        id: e.id,
        label: cleanText(e.text, 80),
        answer: e.lines.map((k) => `${k.side === 'dr' ? 'Debit' : 'Credit'} ${k.account} ${money(k.amount)}`).join(' · '),
        why: [...new Set(missed.map((k) => k.why || `${k.account} is ${k.side === 'dr' ? 'debited' : 'credited'} ${money(k.amount)} here.`))].join(' '),
        cite: e.cite,
      });
    // an entry left blank is unanswered, not unbalanced
    if (dr > 0 || cr > 0) {
      written += 1;
      if (!close(dr, cr)) allBalanced = false;
    }
  }
  let equation: boolean | null = null;
  const bal = p.journal?.balance;
  if (bal) {
    const l = amountOf(answers['balance.liabilities']);
    const q = amountOf(answers['balance.equity']);
    marks['balance.liabilities'] = close(l, bal.liabilities);
    marks['balance.equity'] = close(q, bal.equity);
    equation = Number.isFinite(l) && Number.isFinite(q) && close(l + q, bal.assets);
    if (!marks['balance.liabilities'] || !marks['balance.equity'])
      gaps.push({
        id: 'balance',
        label: 'The equation after the adjustments',
        answer: `${money(bal.assets)} = ${money(bal.liabilities)} + ${money(bal.equity)}`,
        why: 'Each adjustment changes one side of the equation and the other by the same amount, so totalling your entries into the balances keeps it true.',
        cite: p.made[0] ?? p.journal!.events[0].cite,
      });
  }
  const right = Object.values(marks).filter(Boolean).length;
  return { marks, right, of: Object.keys(marks).length, balanced: written > 0 ? allBalanced : null, equation, gaps };
}

export function money(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Does this topic read as bookkeeping — a journal-entry exercise, rather than fill-in-the-blank? */
export function looksLikeEntries(topic: StudyTopic, docs: SourceDoc[]): boolean {
  const said = [topic.title, topic.summary, ...topic.quotes.map((q) => q.text)].join(' ');
  if (/\b(journal entr|adjusting entr|debit|credit|accrual|accrued|deferr|prepaid|unearned|depreciation|ledger|trial balance)\w*/i.test(said)) return true;
  let n = 0;
  for (const b of topic.blocks.slice(0, 12)) {
    const block = docs.find((d) => d.id === b.doc)?.blocks.find((x) => x.id === b.block);
    if (block && /\b(debit|credit|journal)\b/i.test(block.text)) n += 1;
  }
  return n >= 2;
}

// ── the study, as kept ───────────────────────────────────────────────

export interface StudyState {
  v: 1;
  /** "ACCT 2301 · Exam 2" — from the files, or empty */
  course: string;
  goal: Intent;
  /** what they said they are doing, in their words */
  said: string;
  files: StudyFile[];
  topics: StudyTopic[];
  start: string | null;
  why: string;
  /** made with no model: the files' own sections */
  plain?: boolean;
  practice: Practice[];
  at: number;
}

const MAX_PRACTICE = 12;
const DOC_ID = /^[0-9a-f]{16}$/;

function cleanQuote(q: unknown): StudyQuote | null {
  const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>;
  const doc = typeof o.doc === 'string' && DOC_ID.test(o.doc) ? o.doc : null;
  const block = typeof o.block === 'string' && /^p\d{1,4}\.\d{1,5}$/.test(o.block) ? o.block : null;
  const text = cleanText(o.text, 400);
  const page = Math.max(1, Math.min(9999, Math.round(Number(o.page) || 1)));
  return doc && block && text ? { doc, block, page, text } : null;
}

const cleanAnswers = (a: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!a || typeof a !== 'object') return out;
  for (const [k, v] of Object.entries(a).slice(0, 80)) if (/^[A-Za-z0-9_.-]{1,40}$/.test(k) && typeof v === 'string') out[k] = v.slice(0, 80);
  return out;
};

/**
 * A study as it is stored — read back from a session that may be old, edited
 * elsewhere or partly written, and kept only as far as it holds together.
 * Null when there is no study in it.
 */
export function sanitizeStudy(v: unknown): StudyState | null {
  const s = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!s || s.v !== 1) return null;
  const topics: StudyTopic[] = [];
  for (const t0 of Array.isArray(s.topics) ? s.topics.slice(0, MAX_TOPICS) : []) {
    const t = (t0 && typeof t0 === 'object' ? t0 : {}) as Record<string, unknown>;
    const id = typeof t.id === 'string' && /^t\d{1,2}$/.test(t.id) ? t.id : null;
    const title = cleanText(t.title, 60);
    const quotes = (Array.isArray(t.quotes) ? t.quotes.slice(0, MAX_QUOTES) : []).map(cleanQuote).filter((q): q is StudyQuote => !!q);
    if (!id || !title || !quotes.length || topics.some((x) => x.id === id)) continue;
    const blocks = (Array.isArray(t.blocks) ? t.blocks.slice(0, MAX_BLOCKS) : [])
      .map((b) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {}))
      .filter((b) => typeof b.doc === 'string' && DOC_ID.test(b.doc) && typeof b.block === 'string' && /^p\d{1,4}\.\d{1,5}$/.test(b.block))
      .map((b) => ({ doc: String(b.doc), block: String(b.block) }));
    topics.push({
      id,
      title,
      kind: (TOPIC_KINDS as readonly string[]).includes(String(t.kind)) ? (t.kind as TopicKind) : 'concept',
      summary: cleanText(t.summary, 180),
      quotes,
      blocks,
      tables: Math.max(0, Math.min(99, Math.round(Number(t.tables) || 0))),
      ...(() => {
        const questions = (Array.isArray(t.questions) ? t.questions.slice(0, 6) : [])
          .map((q) => (q && typeof q === 'object' ? (q as Record<string, unknown>) : {}))
          .filter((q) => typeof q.doc === 'string' && DOC_ID.test(q.doc) && Array.isArray(q.ns))
          .map((q) => ({ doc: String(q.doc), ns: (q.ns as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 1000).slice(0, 30) }))
          .filter((q) => q.ns.length);
        const formulas = Math.max(0, Math.min(99, Math.round(Number(t.formulas) || 0)));
        const terms = Math.max(0, Math.min(999, Math.round(Number(t.terms) || 0)));
        return { ...(questions.length ? { questions } : {}), ...(formulas ? { formulas } : {}), ...(terms ? { terms } : {}) };
      })(),
      after: (Array.isArray(t.after) ? t.after : []).filter((a): a is string => typeof a === 'string' && /^t\d{1,2}$/.test(a)).slice(0, 4),
    });
  }
  const ids = new Set(topics.map((t) => t.id));
  for (const t of topics) t.after = t.after.filter((a) => ids.has(a) && a !== t.id);
  const files: StudyFile[] = (Array.isArray(s.files) ? s.files.slice(0, 12) : [])
    .map((f) => (f && typeof f === 'object' ? (f as Record<string, unknown>) : {}))
    .filter((f) => typeof f.doc === 'string' && DOC_ID.test(f.doc) && cleanText(f.name, 120))
    .map((f) => ({ doc: String(f.doc), name: cleanText(f.name, 120), pages: Math.max(0, Math.round(Number(f.pages) || 0)) }));
  const practice: Practice[] = [];
  for (const p0 of Array.isArray(s.practice) ? s.practice.slice(-MAX_PRACTICE) : []) {
    const p = (p0 && typeof p0 === 'object' ? p0 : {}) as Record<string, unknown>;
    const kind = p.kind === 'journal' ? 'journal' : p.kind === 'cloze' ? 'cloze' : null;
    const id = typeof p.id === 'string' && /^[a-z0-9]{1,16}$/i.test(p.id) ? p.id : null;
    if (!kind || !id || typeof p.topic !== 'string' || !ids.has(p.topic)) continue;
    const made = (Array.isArray(p.made) ? p.made.slice(0, 6) : []).map(cleanQuote).filter((q): q is StudyQuote => !!q);
    const out: Practice = { id, topic: p.topic, kind, title: cleanText(p.title, 100) || 'Practice', made, answers: cleanAnswers(p.answers), checked: null, round: Math.max(0, Math.min(99, Math.round(Number(p.round) || 0))) };
    if (kind === 'cloze') {
      out.cloze = (Array.isArray(p.cloze) ? p.cloze.slice(0, 12) : [])
        .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
        .map((c) => ({ id: String(c.id ?? ''), before: String(c.before ?? '').slice(0, 300), answer: String(c.answer ?? '').slice(0, 60), after: String(c.after ?? '').slice(0, 300), quote: cleanQuote(c.quote) }))
        .filter((c): c is ClozeItem => /^c\d{1,2}\.\d{1,2}$/.test(c.id) && !!c.answer.trim() && !!c.quote);
      if (!out.cloze.length) continue;
    } else {
      const j = (p.journal && typeof p.journal === 'object' ? p.journal : {}) as Record<string, unknown>;
      const events: JournalEvent[] = [];
      for (const e0 of Array.isArray(j.events) ? j.events.slice(0, 5) : []) {
        const e = (e0 && typeof e0 === 'object' ? e0 : {}) as Record<string, unknown>;
        const cite = cleanQuote(e.cite);
        const lines = (Array.isArray(e.lines) ? e.lines.slice(0, 4) : [])
          .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>) : {}))
          .map((l) => ({
            id: String(l.id ?? ''),
            account: cleanText(l.account, 48),
            also: (Array.isArray(l.also) ? l.also : []).map((a) => cleanText(a, 48)).filter(Boolean).slice(0, 3),
            side: l.side === 'cr' ? ('cr' as const) : ('dr' as const),
            amount: Number(l.amount),
            why: cleanText(l.why, 220),
          }))
          .filter((l) => /^l\d$/.test(l.id) && l.account && l.amount > 0);
        const id = String(e.id ?? '');
        if (!/^e\d$/.test(id) || !cite || lines.length < 2) continue;
        events.push({ id, text: cleanText(e.text, 200), cite, lines, hint: cleanText(e.hint, 200) });
      }
      if (!events.length) continue;
      const b = (j.balance && typeof j.balance === 'object' ? j.balance : null) as Record<string, unknown> | null;
      const balance = b && [b.assets, b.liabilities, b.equity].every((n) => Number.isFinite(Number(n))) ? { assets: Number(b.assets), liabilities: Number(b.liabilities), equity: Number(b.equity) } : null;
      out.journal = { events, balance, accounts: (Array.isArray(j.accounts) ? j.accounts : []).map((a) => cleanText(a, 48)).filter(Boolean).slice(0, 12) };
    }
    // a check is never trusted from storage: it is worked out again from the answers
    if (p.checked) out.checked = checkPractice(out);
    practice.push(out);
  }
  const goal = INTENT_KEYS.includes(s.goal as Intent) ? (s.goal as Intent) : 'files';
  const start = typeof s.start === 'string' && ids.has(s.start) ? s.start : recommend(topics);
  if (!topics.length) return null;
  return {
    v: 1,
    course: cleanText(s.course, 48),
    goal,
    said: cleanText(s.said, 200),
    files,
    topics,
    start,
    why: cleanText(s.why, 200),
    ...(s.plain ? { plain: true } : {}),
    practice,
    at: Number(s.at) || 0,
  };
}

/** "sorted 3 files into 7 topics" */
export function sortedSaid(s: Pick<StudyState, 'files' | 'topics'>): string {
  const f = s.files.length;
  const t = s.topics.length;
  return `sorted ${f} ${f === 1 ? 'file' : 'files'} into ${t} ${t === 1 ? 'topic' : 'topics'}`;
}

/** "Ch5_Adjusting_Entries.pdf · p.7" — where a quote is, in words a person reads. */
export function whereSaid(q: StudyQuote, files: StudyFile[]): string {
  const f = files.find((x) => x.doc === q.doc);
  return `${f ? f.name : 'Your file'} · p.${q.page}`;
}

/** A short name for a file on a chip: "Ch5", "Lecture 9", "Exam 2 review". */
export function shortName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim();
  const ch = /\b(ch(?:apter)?\.?\s*\d+)\b/i.exec(base);
  if (ch) return ch[1].replace(/chapter\s*/i, 'Ch').replace(/\s+/g, '');
  const lecture = /\b(lecture|week|unit|module|lab)\s*(\d+)\b/i.exec(base);
  if (lecture) return `${lecture[1][0].toUpperCase()}${lecture[1].slice(1).toLowerCase()} ${lecture[2]}`;
  if (/\breview\b/i.test(base)) return 'Review';
  return cleanText(base.split(/\s*[-–—:]\s*/)[0], 22);
}

/** "Q3–Q6", "Q2, Q5" — the questions a topic's passages number, said shortly. */
export function questionsSaid(ns: number[]): string {
  if (!ns.length) return '';
  const runs: string[] = [];
  let a = ns[0];
  let b = ns[0];
  for (const n of [...ns.slice(1), Infinity]) {
    if (n === b + 1) {
      b = n;
      continue;
    }
    runs.push(a === b ? `Q${a}` : `Q${a}–Q${b}`);
    a = b = n;
  }
  return runs.slice(0, 2).join(', ') + (runs.length > 2 ? '…' : '');
}
