// lib/logos6/omnibox.ts — ONE INPUT (Logos 6, November 2026; docs/OMNIBOX.md).
//
// The chatbox takes whatever someone is thinking or wants done, and nobody chooses a component first. This reads the
// few things that are better done here than by a model, against what is on screen and what was just said:
//   • A THOUGHT — "I think AI makes students too dependent on answers." — is theirs: it goes on the Mind Map as their
//     own card, kept in the conversation, and nothing answers it unless they ask. Read only from words that plainly
//     offer a view ("I think…", "Idea: …", "My argument is…"), never when Socria has just asked them something (then
//     it is an answer), never with a question mark or a request in it, never with files attached.
//   • A NOTE on the card they have selected ("Note: the professor stressed this").
//   • A CONNECTION — "Connect this to my earlier argument" — found among their own cards and PROPOSED: a suggested line
//     they confirm or dismiss; when more than one card fits, they are asked which.
//   • AN ORGANISATION — "Organize these ideas into a hierarchy" — proposed from the lines already on the map (the
//     Structure way of working's inference), applied only when they say so.
//   • A MILESTONE for the chat's objective, added or ticked off by them.
// Everything else — a question, a quiz, a picture, "highlight the demand curve", a change to an artifact, a document —
// goes the way it already goes (lib/runtime/orchestrate.ts, lib/quiz/scope.ts, lib/visual/intent.ts,
// lib/logos5/commands.ts): this adds no second router, it only takes what was never a model's to do.
//
// Pure: no React, no DOM, no clock.

import { wordsOf } from '../logos5/linking';
import type { LogosRelation } from '../logos';

export interface OmniNode {
  id: string;
  label: string;
  type: string;
  hand?: boolean;
  origin?: string;
}

export interface OmniContext {
  /** Socria's last reply asked them something: a statement now is their answer, and gets one */
  asked: boolean;
  /** a quiz, a guess or a challenge is waiting for their answer */
  awaiting?: boolean;
  /** files come with this message (they are brought in, and read) */
  attaching?: boolean;
  /** the card selected on the canvas, if any */
  selected: { id: string; label: string } | null;
  /** the cards on the map, in the map's order (newest last) */
  nodes: readonly OmniNode[];
}

export type OmniIntent =
  | { kind: 'thought'; label: string; type: 'claim' | 'idea' | 'assumption'; /** the card it is to sit inside ("…inside Monopoly") */ inside?: { id: string; label: string } }
  | { kind: 'note'; text: string; target: { id: string; label: string } }
  | { kind: 'connect'; from: OmniNode | null; to: OmniNode | null; candidates: OmniNode[]; relation: LogosRelation; why: string }
  | { kind: 'organize' }
  | { kind: 'milestone'; text: string; done: boolean }
  | { kind: 'chat' };

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n).trim();

// ── a thought ───────────────────────────────────────────────────────

// said as a thought in so many words: "Idea: …", "Thought — …", "Hypothesis: …"
const MARKED = /^(?:thought|idea|hunch|hypothesis|claim|observation|note|my take|take)\s*[:\-–—]\s*(.{3,})$/i;
// a view offered, not a request made: the opener names it
const OPENERS: [RegExp, 'claim' | 'idea' | 'assumption'][] = [
  [/^(?:i\s+(?:think|believe|reckon|maintain|hold|contend)|i(?:'d| would)\s+argue|in my (?:view|opinion)|my (?:view|position|argument|claim|contention) is|i(?:'m| am) (?:convinced|sure|certain))\b\s*(?:that\s+)?/i, 'claim'],
  [/^(?:i\s+(?:suspect|wonder whether|feel like|guess|have a feeling|have a hunch)|maybe|perhaps|possibly|my (?:hunch|guess|idea) is|one (?:idea|thought) is)\b\s*(?:that\s+)?/i, 'idea'],
  [/^(?:i\s+(?:assume|am assuming|'m assuming)|assuming|presumably)\b\s*(?:that\s+)?/i, 'assumption'],
];
// a request or a question, however it is dressed
const ASKS = /\?|\b(?:can|could|would|will) you\b|\bplease\b|\bhelp me\b|\btell me\b|\bshow me\b|\bexplain\b|\bwalk me\b|\bteach me\b|\bi (?:want|need) you\b|\blet'?s\b|\bquiz me\b|\btest me\b|\bwhat do you think\b|\bdo you (?:think|agree)\b|\bam i right\b|\bright\s*$|\bisn'?t it\b|\bdon'?t you\b|\b(?:we|you) should\b|\bshould (?:we|i)\b|\bshall we\b/i;
// what follows the opener is about the conversation itself — "I think I get it", "I think you're right", "I think
// that's wrong": said to Socria, and answered
const ABOUT_US = /^(?:i|i'm|i am|i've|i'll|i'd|me|my|you|you're|your|we|we're|us|that|that's|this|this is|it|it's|so|yes|no|ok|okay|so far|now)\b/i;
const QUESTION_START = /^(?:why|how|what|when|where|who|whom|whose|which|is|are|was|were|do|does|did|can|could|should|would|will|shall|may|might|have|has|had)\b/i;

// "Idea: price discrimination inside Monopoly": the card it sits inside — read only in the marked form ("Idea: …"),
// where they are saying what the card is, and only when the words after "inside" or "within" name one card plainly
// (its whole name, or every word of them in its name), or "this" (the card selected). Otherwise they are the idea's own
// words: "Idea: thinking inside the box" is that idea, and "I think learning happens inside the classroom" is a claim,
// whatever is on the map.
const INSIDE = /^(.{2,}?)\s*,?\s+(?:inside(?:\s+of)?|within)\s+(?:the\s+)?(?:card\s+|idea\s+)?["“']?(.+?)["”']?[.!]?$/i;

/** The card "inside …" names, or null when it names none plainly (or more than one). */
export function insideCard(phrase: string, ctx: OmniContext): { id: string; label: string } | null {
  const p = phrase.trim();
  if (THIS.test(p)) return ctx.selected;
  const exact = ctx.nodes.filter((n) => n.label.trim().toLowerCase() === p.toLowerCase());
  if (exact.length === 1) return { id: exact[0].id, label: exact[0].label };
  const want = wordsOf(p);
  if (!want.length || exact.length) return null;
  const all = ctx.nodes.filter((n) => {
    const have = new Set(wordsOf(n.label));
    return want.every((w) => have.has(w));
  });
  return all.length === 1 ? { id: all[0].id, label: all[0].label } : null;
}

/** "I think AI makes students too dependent on answers." → their claim, in their words (without the opener). */
export function readThought(text: string, ctx: OmniContext): { label: string; type: 'claim' | 'idea' | 'assumption'; inside?: { id: string; label: string } } | null {
  const t = clip(String(text ?? ''), 400);
  if (!t || t.length > 280 || ctx.asked || ctx.awaiting || ctx.attaching) return null;
  if (ASKS.test(t) || QUESTION_START.test(t)) return null;
  // two sentences at most: a paragraph is something to talk about
  if (t.split(/(?<=[.!])\s+/).filter(Boolean).length > 2) return null;
  // the words, and the card they are to sit inside when they name one
  const placed = (raw: string, type: 'claim' | 'idea' | 'assumption') => {
    const ins = INSIDE.exec(raw.trim());
    const card = ins ? insideCard(ins[2], ctx) : null;
    return ins && card ? { label: tidy(ins[1]), type, inside: card } : { label: tidy(raw), type };
  };
  const marked = t.match(MARKED);
  if (marked) return placed(marked[1], 'idea');
  for (const [re, type] of OPENERS) {
    const m = t.match(re);
    if (!m) continue;
    const rest = t.slice(m[0].length).trim();
    if (rest.split(' ').length < 3 || ABOUT_US.test(rest)) return null;
    return { label: tidy(rest), type };
  }
  return null;
}

function tidy(s: string): string {
  const t = clip(s, 160).replace(/[.!]+$/, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

// ── a note on the selected card ─────────────────────────────────────

const NOTE = /^(?:(?:add (?:a )?)?note|annotate(?: it| this)?)\s*[:\-–—]\s*(.{2,})$/i;

export function readNote(text: string, ctx: OmniContext): { text: string; target: { id: string; label: string } } | null {
  if (!ctx.selected) return null;
  const m = clip(String(text ?? ''), 600).match(NOTE);
  return m ? { text: clip(m[1], 500), target: ctx.selected } : null;
}

// ── a connection, proposed ──────────────────────────────────────────

const CONNECT = /^(?:please\s+)?(?:connect|link|relate|tie)\s+(.+?)\s+(?:to|with|and|into)\s+(.+?)(?:\s+as\s+(.+?))?[.!]?$/i;
const THIS = /^(?:this|that|it|this (?:one|idea|thought|card|point)|that (?:one|idea|thought|card|point)|my (?:last|latest|new) (?:idea|thought|point|claim))$/i;
// what says only "one of mine", nothing about which
const GENERIC = new Set(wordsOf('my earlier previous prior first other older original argument point idea claim thought card one view position the one before'));

const RELATION_WORDS: [RegExp, LogosRelation][] = [
  [/\b(?:support|supports|backs?(?: up)?|evidence for|proves?|confirms?)\b/i, 'supports'],
  [/\b(?:contradict|contradicts|against|conflicts?|undermines?|counter|opposes?|tension)\b/i, 'conflicts'],
  [/\b(?:cause|causes|leads? to|results? in|produces?)\b/i, 'causes'],
  [/\b(?:depends? on|needs?|requires?|relies? on)\b/i, 'depends'],
  [/\b(?:example of|instance of|kind of|type of)\b/i, 'is_a'],
  [/\b(?:part of|belongs (?:to|in)|within)\b/i, 'part_of'],
];

const authored = (n: OmniNode) => n.hand || !n.origin || n.origin === 'socria';

/** The cards that fit a phrase, best first: by the share of its meaningful words they hold, newest breaking ties. */
function fitting(phrase: string, nodes: readonly OmniNode[], skip: string | null): { n: OmniNode; score: number }[] {
  const want = wordsOf(phrase).filter((w) => !GENERIC.has(w));
  const pool = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.id !== skip);
  if (!want.length) {
    // "my earlier argument": their own claims and ideas, newest first
    return pool
      .filter(({ n }) => authored(n) && /^(?:claim|belief|idea|assumption|value|counterpoint|decision|goal)$/.test(n.type))
      .sort((a, b) => b.i - a.i)
      .map(({ n }) => ({ n, score: 0 }));
  }
  return pool
    .map(({ n, i }) => {
      const have = new Set(wordsOf(n.label));
      return { n, i, score: want.filter((w) => have.has(w)).length / want.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.i - a.i)
    .map(({ n, score }) => ({ n, score }));
}

/** "Connect this to my earlier argument" → the two cards (or who to ask about), and the kind of line, proposed. */
export function readConnect(text: string, ctx: OmniContext): Extract<OmniIntent, { kind: 'connect' }> | null {
  const m = clip(String(text ?? ''), 300).match(CONNECT);
  if (!m || ctx.nodes.length < 2) return null;
  const [, fromPhrase, toPhrase, asPhrase] = m;
  // "this": the selected card, else their newest card
  let from: OmniNode | null = null;
  if (THIS.test(fromPhrase.trim())) {
    from = ctx.selected ? ctx.nodes.find((n) => n.id === ctx.selected!.id) ?? null : [...ctx.nodes].reverse().find((n) => n.hand) ?? ctx.nodes[ctx.nodes.length - 1];
  } else {
    const f = fitting(fromPhrase, ctx.nodes, null);
    from = f.length && (f.length === 1 || f[0].score > f[1].score) ? f[0].n : null;
  }
  const fits = fitting(toPhrase, ctx.nodes, from?.id ?? null);
  const sure = fits.length === 1 || (fits.length > 1 && fits[0].score > 0 && fits[0].score > fits[1].score);
  const to = sure ? fits[0].n : null;
  const relation = RELATION_WORDS.find(([re]) => re.test(asPhrase ?? '') || re.test(text))?.[1] ?? 'relates';
  return {
    kind: 'connect',
    from,
    to,
    candidates: to ? [] : fits.slice(0, 3).map((x) => x.n),
    relation,
    why: 'You asked to connect these.',
  };
}

/** Which of the offered cards a reply picks: "the second", "2", or its words. */
export function pickCandidate(text: string, candidates: readonly OmniNode[]): OmniNode | null {
  const t = clip(String(text ?? ''), 200).toLowerCase();
  const ord = t.match(/^(?:the\s+)?(1|2|3|one|two|three|first|second|third)\b/);
  if (ord) {
    const k = { '1': 0, one: 0, first: 0, '2': 1, two: 1, second: 1, '3': 2, three: 2, third: 2 }[ord[1] as '1'];
    return candidates[k] ?? null;
  }
  const f = fitting(t, candidates, null).filter((x) => x.score >= 0.5);
  return f.length === 1 || (f.length > 1 && f[0].score > f[1].score) ? f[0].n : null;
}

// ── an organisation, proposed ───────────────────────────────────────

const ORGANIZE = /\b(?:organi[sz]e|arrange|structure|sort|group|nest|order)\b.{0,40}\b(?:hierarch\w*|tree|outline|structure|levels?|categor\w*|groups?|parents?)\b|\b(?:put|place|make)\b.{0,30}\b(?:in|into)\s+(?:a\s+)?(?:hierarchy|tree|outline)\b/i;

export function readOrganize(text: string, ctx: OmniContext): boolean {
  const t = clip(String(text ?? ''), 300);
  return ctx.nodes.length >= 2 && !/\?$/.test(t) && ORGANIZE.test(t) && !/\b(?:essay|paragraph|code|files?|documents?|notes app|calendar)\b/i.test(t);
}

// ── a milestone ─────────────────────────────────────────────────────

const MILESTONE_ADD = /^(?:add (?:a )?)?milestone\s*[:\-–—]\s*(.{3,120})$/i;
const MILESTONE_DONE = /^(?:mark|tick(?: off)?|check(?: off)?)\s+(?:the\s+)?milestone\s+(.{2,120}?)\s*(?:as\s+)?(?:done|complete|completed|finished)?[.!]?$|^milestone\s+(?:done|complete|completed|reached)\s*[:\-–—]\s*(.{2,120})$/i;

export function readMilestone(text: string): { text: string; done: boolean } | null {
  const t = clip(String(text ?? ''), 200);
  const d = t.match(MILESTONE_DONE);
  if (d) return { text: clip(d[1] ?? d[2] ?? '', 120).replace(/^["“]|["”]$/g, ''), done: true };
  const a = t.match(MILESTONE_ADD);
  return a ? { text: clip(a[1], 120).replace(/[.!]+$/, ''), done: false } : null;
}

// ── the reading ─────────────────────────────────────────────────────

/** What this message is, of the things done here; `chat` for everything that goes the way it always went. */
export function readOmnibox(text: string, ctx: OmniContext): OmniIntent {
  const t = String(text ?? '').trim();
  if (!t) return { kind: 'chat' };
  const ms = readMilestone(t);
  if (ms) return { kind: 'milestone', ...ms };
  const note = readNote(t, ctx);
  if (note) return { kind: 'note', ...note };
  const c = readConnect(t, ctx);
  if (c) return c;
  if (readOrganize(t, ctx)) return { kind: 'organize' };
  const th = readThought(t, ctx);
  if (th) return { kind: 'thought', ...th };
  return { kind: 'chat' };
}

/** What pressing Enter will do, said under the box while it is typed; null when it goes to Socria as always. */
export function omniHint(i: OmniIntent): string | null {
  switch (i.kind) {
    case 'thought': {
      const what = i.type === 'idea' ? 'An idea' : i.type === 'assumption' ? 'An assumption' : 'A thought';
      return `${what}${i.inside ? `, inside “${i.inside.label}”` : ''} — kept on your Mind Map as yours, with no reply`;
    }
    case 'note':
      return `A note on “${i.target.label}”`;
    case 'connect':
      return i.from && i.to ? `Propose a connection: “${i.from.label}” → “${i.to.label}”, for you to confirm` : 'Propose a connection — you choose which cards';
    case 'organize':
      return 'Propose a structure from your connections — applied only if you say so';
    case 'milestone':
      return i.done ? `Tick off a milestone: “${i.text}”` : `A milestone for this chat: “${i.text}”`;
    default:
      return null;
  }
}

/** Did Socria's reply end by asking them something? (Then what they say next is an answer, and is answered.) */
export function replyAsked(reply: string | undefined | null, threadQuestion?: string | null): boolean {
  if (threadQuestion) return true;
  const t = String(reply ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return false;
  const tail = t.slice(-240);
  const last = tail.split(/(?<=[.!?])\s+/).filter(Boolean).pop() ?? '';
  return /\?\s*[)*_"”]*$/.test(last);
}
