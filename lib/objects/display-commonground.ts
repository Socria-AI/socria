// lib/objects/display-commonground.ts — COMMON GROUND: people who disagree, working out what they actually share.
//
// A question two or more people see differently. Each person joins in their
// own name and writes their own perspective — where they stand, and what
// matters to them underneath it. Together they collect what they find: goals
// they share, facts they accept, values, disagreements, questions to clarify,
// evidence they would need, compromises and experiments to try.
//
// THE RULES THIS KIND KEEPS
//
//   No one speaks for anyone. A perspective is written by its author and
//   changed only by them. Socria never writes one, and never agrees,
//   disagrees or resolves anything on anyone's behalf.
//
//   No consensus is manufactured. An item is SHARED only when every person in
//   the session has agreed to it; a disagreement is RESOLVED only when every
//   person says it is. Until then it is open, or contested — and shown so.
//
//   Socria suggests and says so. It may offer a possible shared goal, a
//   clarifying question, an experiment — each marked as Socria's and agreed
//   by no one until people agree to it. It is given only what is in this
//   session: never anyone's private memories or other conversations.
//
// Who may edit this line of thinking at all is decided by the server, by the
// sharing roles every shared line of thinking has. Within it, who wrote what
// is recorded with each operation (`as`) and checked here.
//
// PURE.

import type { Part, ViewDecl } from './core';
import { register } from './core';
import {
  cleanBy,
  cleanId,
  cleanText,
  displayKind,
  guardBy,
  headOps,
  nextId,
  op,
  registerDisplay,
  type Args,
  type By,
  type Ctx,
  type DisplayHead,
  type DisplayMeta,
} from './display-base';
import { cleanLinks, linkOps, REASONING_VERSION, type Link } from './reasoning';

export type GroundView = 'ground' | 'perspectives' | 'open';
export type ItemKind = 'goal' | 'fact' | 'value' | 'disagreement' | 'question' | 'evidence' | 'compromise' | 'experiment';

export interface Participant {
  /** their account id where they have one; otherwise a name-based id */
  id: string;
  name: string;
}
export interface Perspective {
  author: string;
  /** where they stand */
  position: string;
  /** what matters to them underneath it */
  why: string;
}
export interface GroundItem {
  id: string;
  kind: ItemKind;
  text: string;
  by: By;
  /** the participant who wrote it, when a person did */
  author?: string;
  /** who agreed to it — each in their own hand */
  agreed: string[];
  /** who disputes it */
  disputed: string[];
  /** for a disagreement: who considers it resolved */
  resolved: string[];
}

export interface GroundState extends DisplayHead {
  version: number;
  view: GroundView;
  question: string;
  questionBy: By;
  participants: Participant[];
  perspectives: Perspective[];
  items: GroundItem[];
  links: Link[];
}

export const GROUND_LIMITS = { participants: 8, items: 60, text: 240, long: 500, name: 40 } as const;
const L = GROUND_LIMITS;
export const ITEM_KINDS: ItemKind[] = ['goal', 'fact', 'value', 'disagreement', 'question', 'evidence', 'compromise', 'experiment'];
const VIEWS: GroundView[] = ['ground', 'perspectives', 'open'];
export const ITEM_WORD: Record<ItemKind, string> = {
  goal: 'Goal',
  fact: 'Fact',
  value: 'Value',
  disagreement: 'Disagreement',
  question: 'Question to clarify',
  evidence: 'Evidence we would need',
  compromise: 'Possible compromise',
  experiment: 'Experiment to try',
};

const PID = /^[A-Za-z0-9_:.@-]{1,64}$/;
const cleanPid = (v: unknown): string | null => (typeof v === 'string' && PID.test(v) ? v : null);

// ── canonical state ──────────────────────────────────────────────────

const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

export function sanitizeGround(raw: unknown): GroundState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const participants: Participant[] = [];
  for (const x of arr(r.participants)) {
    if (participants.length >= L.participants) break;
    const o = obj(x);
    const id = cleanPid(o?.id);
    const name = cleanText(o?.name, L.name);
    if (!id || !name || participants.some((p) => p.id === id)) continue;
    participants.push({ id, name });
  }
  const pids = new Set(participants.map((p) => p.id));
  const perspectives: Perspective[] = [];
  for (const x of arr(r.perspectives)) {
    const o = obj(x);
    // a perspective is kept with its author's name even after they leave — what they said stays theirs
    const author = cleanPid(o?.author);
    const position = cleanText(o?.position, L.long);
    const why = cleanText(o?.why, L.long);
    if (!author || (!position && !why) || perspectives.some((p) => p.author === author)) continue;
    perspectives.push({ author, position, why });
    if (perspectives.length >= L.participants * 2) break;
  }
  const items: GroundItem[] = [];
  const ids = new Set<string>();
  for (const x of arr(r.items)) {
    if (items.length >= L.items) break;
    const o = obj(x);
    const text = cleanText(o?.text, L.text);
    if (!text) continue;
    let id = cleanId(o?.id);
    if (!id || ids.has(id)) id = nextId('i', ids);
    ids.add(id);
    const by = cleanBy(o?.by);
    const author = by === 'person' ? cleanPid(o?.author) ?? undefined : undefined;
    const marks = (v: unknown) => [...new Set(arr(v).filter((p): p is string => typeof p === 'string' && pids.has(p)))].sort();
    const agreed = marks(o?.agreed);
    const disputed = marks(o?.disputed).filter((p) => !agreed.includes(p));
    const kind: ItemKind = ITEM_KINDS.includes(o?.kind as ItemKind) ? (o!.kind as ItemKind) : 'question';
    items.push({ id, kind, text, by, ...(author ? { author } : {}), agreed, disputed, resolved: kind === 'disagreement' ? marks(o?.resolved) : [] });
  }
  return {
    title: cleanText(r.title, 80) || 'Common Ground',
    version: REASONING_VERSION,
    view: VIEWS.includes(r.view as GroundView) ? (r.view as GroundView) : 'ground',
    question: cleanText(r.question, L.text),
    questionBy: cleanBy(r.questionBy),
    participants,
    perspectives,
    items,
    links: cleanLinks(r.links),
  };
}

// ── what is computed ─────────────────────────────────────────────────

export type ItemStanding = 'shared' | 'contested' | 'open' | 'resolved';

/**
 * Where an item stands, from what each person marked — never from what it
 * says. Shared: everyone in the session agreed (and there are at least two of
 * them). Resolved: a disagreement every person says is resolved. Contested:
 * someone disputes it. Open: anything else.
 */
export function standing(s: GroundState, it: GroundItem): ItemStanding {
  const n = s.participants.length;
  if (it.kind === 'disagreement') return n >= 2 && s.participants.every((p) => it.resolved.includes(p.id)) ? 'resolved' : it.disputed.length ? 'contested' : 'open';
  if (it.disputed.length) return 'contested';
  return n >= 2 && s.participants.every((p) => it.agreed.includes(p.id)) ? 'shared' : 'open';
}

export function sharedGround(s: GroundState): GroundItem[] {
  return s.items.filter((it) => standing(s, it) === 'shared');
}

/** Who has not yet said where they stand — so no one's silence reads as agreement. */
export function waitingOn(s: GroundState, it: GroundItem): Participant[] {
  if (it.kind === 'disagreement') return s.participants.filter((p) => !it.resolved.includes(p.id));
  return s.participants.filter((p) => !it.agreed.includes(p.id) && !it.disputed.includes(p.id));
}

export const nameOf = (s: GroundState, id: string | undefined): string => s.participants.find((p) => p.id === id)?.name ?? (id ? 'someone who has left' : 'Socria');

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<GroundState>[] = [
  { id: 'ground', label: 'Common ground', shows: 'what everyone agreed to, and what is still open or contested', primary: true, interactions: ['agree', 'dispute', 'add what you find'] },
  { id: 'perspectives', label: 'Perspectives', shows: 'where each person stands and what matters to them, side by side, each in their own words', interactions: ['write your perspective'] },
  { id: 'open', label: 'Still open', shows: 'disagreements, questions, evidence needed, and what to try', interactions: ['resolve', 'add a question'] },
];

type S = GroundState;
const withS = (s: S, patch: Partial<S>): S => sanitizeGround({ ...s, ...patch }) ?? s;
const item = (s: S, id: unknown) => s.items.find((x) => x.id === id);
const isIn = (s: S, as: unknown) => typeof as === 'string' && s.participants.some((p) => p.id === as);
const personOnly = (ctx: Ctx, what: string) => (ctx?.by === 'socria' ? `${what} — only the people in this session do that. Socria never speaks for anyone.` : null);
const asWho = (s: S, a: Args, ctx: Ctx): string | null => personOnly(ctx, 'That is for a person') ?? (isIn(s, a.as) ? null : 'Join the session first, in your own name.');

export const GROUND_OPS = {
  ...headOps<S>(views, sanitizeGround),
  question: op<S>(
    'The question',
    (s, a, ctx) => (cleanText(a.text, L.text) ? null : 'Say what you are working out together.') ?? (ctx?.by === 'socria' && s.questionBy === 'person' ? 'The question is in your words — Socria does not rewrite it.' : null) ?? guardBy(a, ctx),
    (s, a) => withS(s, { question: cleanText(a.text, L.text), questionBy: a.by === 'person' ? 'person' : s.questionBy }),
    (a) => `the question: “${cleanText(a.text, 80)}”`
  ),
  join: op<S>(
    'Join',
    (s, a, ctx) =>
      personOnly(ctx, 'Joining') ??
      (cleanPid(a.as) ? null : 'Join with who you are.') ??
      (cleanText(a.name, L.name) ? null : 'Say your name.') ??
      (isIn(s, a.as) ? 'You are already in this session.' : null) ??
      (s.participants.length >= L.participants ? `A session holds ${L.participants} people.` : null),
    (s, a) => withS(s, { participants: [...s.participants, { id: String(a.as), name: cleanText(a.name, L.name) }] }),
    (a) => `${cleanText(a.name, L.name)} joined`
  ),
  leave: op<S>(
    'Leave',
    (s, a, ctx) => asWho(s, a, ctx),
    // what they wrote stays theirs, under their name; their marks on items go with them
    (s, a) =>
      withS(s, {
        participants: s.participants.filter((p) => p.id !== a.as),
        items: s.items.map((it) => ({ ...it, agreed: it.agreed.filter((p) => p !== a.as), disputed: it.disputed.filter((p) => p !== a.as), resolved: it.resolved.filter((p) => p !== a.as) })),
      }),
    () => 'left the session'
  ),
  perspective: op<S>(
    'Your perspective',
    (s, a, ctx) =>
      asWho(s, a, ctx) ??
      (a.position === undefined && a.why === undefined ? 'Say where you stand, or what matters to you.' : null) ??
      ([a.position, a.why].some((v) => v !== undefined && (typeof v !== 'string' || v.length > L.long)) ? `Say it in ${L.long} characters or fewer.` : null),
    (s, a) => {
      const cur = s.perspectives.find((p) => p.author === a.as);
      const position = a.position !== undefined ? cleanText(a.position, L.long) : cur?.position ?? '';
      const why = a.why !== undefined ? cleanText(a.why, L.long) : cur?.why ?? '';
      const rest = s.perspectives.filter((p) => p.author !== a.as);
      return withS(s, { perspectives: position || why ? [...rest, { author: String(a.as), position, why }] : rest });
    },
    () => 'wrote their perspective'
  ),
  add: op<S>(
    'Add',
    (s, a, ctx) =>
      (ITEM_KINDS.includes(a.kind as ItemKind) ? null : 'A goal, fact, value, disagreement, question, evidence needed, compromise or experiment.') ??
      (cleanText(a.text, L.text) ? null : 'Say it.') ??
      (s.items.length >= L.items ? 'This session holds as much as it can.' : null) ??
      (ctx?.by === 'person' || a.by === 'person' ? (isIn(s, a.as) ? null : 'Join the session first, in your own name.') : null) ??
      guardBy(a, ctx),
    (s, a) => {
      const by = cleanBy(a.by);
      const author = by === 'person' ? String(a.as) : undefined;
      // the person who writes something has, by writing it, put it forward — but not agreed to it for anyone else
      return withS(s, {
        items: [...s.items, { id: nextId('i', s.items.map((x) => x.id)), kind: a.kind as ItemKind, text: cleanText(a.text, L.text), by, ...(author ? { author } : {}), agreed: author && a.kind !== 'disagreement' && a.kind !== 'question' ? [author] : [], disputed: [], resolved: [] }],
      });
    },
    (a) => `${a.by === 'socria' ? 'Socria suggested' : 'added'} (${ITEM_WORD[a.kind as ItemKind]?.toLowerCase() ?? a.kind}): “${cleanText(a.text, 60)}”`
  ),
  edit: op<S>(
    'Reword',
    (s, a, ctx) => {
      const it = item(s, a.id);
      if (!it) return 'There is no such item.';
      if (!cleanText(a.text, L.text)) return 'Say it.';
      if (ctx?.by === 'socria') return it.by === 'socria' && !it.agreed.length && !it.disputed.length ? null : 'People have written or marked this — Socria does not change it.';
      if (!isIn(s, a.as)) return 'Join the session first, in your own name.';
      if (it.by === 'person' && it.author !== a.as) return `That is ${nameOf(s, it.author)}’s — only they reword it.`;
      // rewording changes what people agreed to, so it is only done before anyone else has marked it
      if (it.agreed.some((p) => p !== a.as) || it.disputed.length || it.resolved.length) return 'Others have already marked this — add a new one instead, so no one is held to words they did not agree to.';
      return null;
    },
    (s, a) =>
      withS(s, {
        items: s.items.map((it) =>
          it.id === a.id ? { ...it, text: cleanText(a.text, L.text), ...(a.by === 'person' || (typeof a.as === 'string' && isIn(s, a.as)) ? { by: 'person' as By, author: String(a.as) } : {}) } : it
        ),
      }),
    () => 'reworded'
  ),
  remove: op<S>(
    'Remove',
    (s, a, ctx) => {
      const it = item(s, a.id);
      if (!it) return 'There is no such item.';
      if (ctx?.by === 'socria') return 'Only the people in this session remove things.';
      if (!isIn(s, a.as)) return 'Join the session first, in your own name.';
      if (it.by === 'person' && it.author !== a.as) return `That is ${nameOf(s, it.author)}’s — only they remove it.`;
      if (it.agreed.some((p) => p !== a.as) || it.resolved.some((p) => p !== a.as)) return 'Others have agreed to this — it stays unless they take their agreement back.';
      return null;
    },
    (s, a) => withS(s, { items: s.items.filter((it) => it.id !== a.id) }),
    () => 'removed'
  ),
  mark: op<S>(
    'Agree or dispute',
    (s, a, ctx) => asWho(s, a, ctx) ?? (item(s, a.id) ? null : 'There is no such item.') ?? (a.ok === 'agree' || a.ok === 'dispute' || a.ok === '' ? null : 'Agree, dispute, or take your mark back.'),
    (s, a) =>
      withS(s, {
        items: s.items.map((it) => {
          if (it.id !== a.id) return it;
          const me = String(a.as);
          const agreed = it.agreed.filter((p) => p !== me);
          const disputed = it.disputed.filter((p) => p !== me);
          if (a.ok === 'agree') agreed.push(me);
          if (a.ok === 'dispute') disputed.push(me);
          return { ...it, agreed, disputed };
        }),
      }),
    (a) => (a.ok === 'agree' ? 'agreed' : a.ok === 'dispute' ? 'disputed' : 'took their mark back')
  ),
  resolve: op<S>(
    'Resolved for me',
    (s, a, ctx) => {
      const refused = asWho(s, a, ctx);
      if (refused) return refused;
      const it = item(s, a.id);
      if (!it) return 'There is no such item.';
      if (it.kind !== 'disagreement') return 'Only a disagreement is resolved.';
      return a.ok === 'yes' || a.ok === 'no' ? null : 'Say whether it is resolved for you.';
    },
    (s, a) => withS(s, { items: s.items.map((it) => (it.id === a.id ? { ...it, resolved: a.ok === 'yes' ? [...it.resolved.filter((p) => p !== a.as), String(a.as)] : it.resolved.filter((p) => p !== a.as) } : it)) }),
    (a) => (a.ok === 'yes' ? 'resolved, for them' : 'not resolved, for them')
  ),
  ...linkOps<S>(sanitizeGround),
};

// ── words → an operation ─────────────────────────────────────────────

/** Operations from words need to know who is speaking, which the conversation does not carry — so only the question is read. */
export function readGroundOp(text: string, _s: S): { op: string; args: Args } | null {
  const m = /^(?:the question is|we(?:'re| are) (?:trying to )?(?:work out|figure out|decide))\s*[:—-]?\s*(.+?)[.!]?$/i.exec(text.trim());
  return m ? { op: 'question', args: { text: cleanText(m[1], L.text), by: 'person' } } : null;
}

// ── the kind ─────────────────────────────────────────────────────────

function factsOf(s: S): string[] {
  const out = [`${s.title}: ${s.participants.length} ${s.participants.length === 1 ? 'person' : 'people'} working out “${s.question || '(no question yet)'}”: ${s.participants.map((p) => p.name).join(', ') || 'no one has joined yet'}.`];
  const shared = sharedGround(s);
  if (shared.length) out.push(`Agreed by everyone: ${shared.map((it) => `${ITEM_WORD[it.kind].toLowerCase()} “${it.text}”`).join('; ')}.`);
  const contested = s.items.filter((it) => standing(s, it) === 'contested');
  if (contested.length) out.push(`Contested: ${contested.map((it) => `“${it.text}”`).join('; ')}.`);
  const open = s.items.filter((it) => it.kind === 'disagreement' && standing(s, it) !== 'resolved');
  if (open.length) out.push(`Disagreements not resolved: ${open.map((it) => `“${it.text}”`).join('; ')}.`);
  const sugg = s.items.filter((it) => it.by === 'socria' && !it.agreed.length);
  if (sugg.length) out.push(`${sugg.length} of Socria’s suggestions no one has agreed to.`);
  out.push('Nothing counts as agreed unless every participant marked it so.');
  return out;
}

function textOf(s: S): string {
  const lines = [`COMMON GROUND “${s.title}” — ${s.question}`];
  for (const p of s.perspectives) lines.push(`${nameOf(s, p.author)} (in their own words): stands — ${p.position || '(not said)'}; matters to them — ${p.why || '(not said)'}`);
  for (const it of s.items) {
    lines.push(`[${ITEM_WORD[it.kind]} · ${standing(s, it)}] ${it.text} — ${it.by === 'socria' ? 'suggested by Socria' : `from ${nameOf(s, it.author)}`}; agreed: ${it.agreed.map((p) => nameOf(s, p)).join(', ') || 'no one'}${it.disputed.length ? `; disputed: ${it.disputed.map((p) => nameOf(s, p)).join(', ')}` : ''}`);
  }
  return lines.join('\n').slice(0, 2600);
}

export const GROUND = displayKind<S>({
  kind: 'commonground',
  label: 'Common Ground',
  sanitize: sanitizeGround,
  ops: GROUND_OPS,
  readOp: readGroundOp,
  consequence: (before, after) => {
    const a = sharedGround(before).length;
    const b = sharedGround(after).length;
    if (b > a) return 'Everyone in the session has now agreed to this.';
    if (b < a) return 'Something is no longer agreed by everyone.';
    const ra = before.items.filter((it) => standing(before, it) === 'resolved').length;
    const rb = after.items.filter((it) => standing(after, it) === 'resolved').length;
    if (rb > ra) return 'Every person here now says this disagreement is resolved.';
    return null;
  },
  facts: (s) => factsOf(s),
  text: textOf,
  parts: (s): Part[] => s.items.map((it) => ({ id: it.id, label: it.text })),
  views,
  maxStates: 30,
  argLimits: { count: 12, length: L.long },
  size: (s, mode) => (mode === 'card' ? { w: 280, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 760, h: Math.min(760, 400 + 26 * s.items.length) }),
  shape: (s) => `${s.participants.length} ${s.participants.length === 1 ? 'person' : 'people'} · ${sharedGround(s).length} agreed by all`,
});

// ── made from the person's words ─────────────────────────────────────

/** A session from how it was asked for: the question in the person's words, and no one in it until they join. Nothing is drafted. */
export function groundFromWords(said: string): GroundState | null {
  const t = cleanText(said, 400);
  const m =
    /\b(?:common ground|agree|disagree|disagreeing|arguing|argue|keep arguing|fighting)\s+(?:on|about|over|regarding)\s+(.+?)(?:[.?!]|$)/i.exec(t) ??
    /\bcommon ground\s*[:—-]\s*(.+?)(?:[.?!]|$)/i.exec(t);
  const question = m ? cleanText(m[1], 240) : '';
  return sanitizeGround({
    title: question ? cleanText(question.charAt(0).toUpperCase() + question.slice(1), 60) : 'Common Ground',
    view: 'perspectives',
    question,
    questionBy: question ? 'person' : 'socria',
  });
}

export const GROUND_META: DisplayMeta = {
  kind: 'commonground',
  noun: 'common ground session',
  handle: 'CG',
  about: 'People who see something differently, each writing where they stand and why, then finding together what they actually share — and what is still open. Nothing counts as agreed until everyone agrees.',
  called: [{ words: ['common ground', 'common ground session'] }],
  intents: [
    /\b(?:find|reach|get to|look for) (?:some |the )?common ground\b/,
    /\b(?:we|they|\w+ and i|i and \w+) (?:cant|cannot|dont|do not|never|couldnt|can never) (?:seem to )?agree\b/,
    /\b(?:we|\w+ and i) (?:disagree|keep arguing|are arguing|keep fighting|argue) (?:about|on|over)\b/,
    /\bhelp (?:us|me) (?:mediate|work through (?:a|our|this|the) disagreement)\b/,
  ],
  experience: true,
  prompts: ['Help us find common ground on whether to move to Denver', 'My cofounder and I keep arguing about raising money', 'We can’t agree on how to split chores'],
  tell: () =>
    'A COMMON GROUND session is people who disagree, each writing their own perspective. Never speak for a participant, never guess what someone thinks, and never call anything agreed unless every participant marked it so — the standings above are computed from their marks. Socria’s suggestions are labelled and agreed by no one until people agree. Nothing private about anyone belongs here.',
};

register(GROUND);
registerDisplay(GROUND_META);
