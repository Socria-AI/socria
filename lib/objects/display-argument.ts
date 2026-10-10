// AN ARGUMENT MAP — an essay's or a debate's reasoning, which the person
// remains responsible for.
//
// "Help me structure my essay on rooftop solar", "map the debate about a
// four-day week": one state — a thesis, the claims that support it, the
// evidence beneath each (with the citation the person gives for it), the
// counterarguments against it and the rebuttals that answer them, the open
// questions and a conclusion — each item a sentence, each under the item it
// bears on, as a tree. The map and the outline are VIEWS of that state.
//
// THE PERSON'S ARGUMENT. Socria may propose a structure, and afterwards add
// counterarguments, questions and claims of its own, and evidence — always
// marked as its own suggestion, for the person to check and give a source.
// It never rewrites, moves or removes what the person wrote, never gives a
// source (a citation is one the person gives), and never states the thesis,
// answers a counterargument or draws the conclusion: those are the person's.
//
// What is computed, never asserted: which claims have no evidence beneath
// them, which counterarguments no rebuttal answers, which questions are open,
// which evidence Socria suggested and which has no source, what is attached
// to nothing, and the order an essay would take it all in.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import {
  cleanBy,
  cleanId,
  cleanText,
  displayKind,
  findByLabel,
  guardBy,
  guardOwn,
  headOps,
  nextId,
  norm,
  op,
  registerDisplay,
  type Args,
  type By,
  type Ctx,
  type DisplayHead,
} from './display-base';
import { askedView, tidyTree, type Box, type BoxOpts } from './display-diagram';

export type ArgumentView = 'map' | 'outline';
export type Role = 'thesis' | 'claim' | 'evidence' | 'counter' | 'rebuttal' | 'question' | 'conclusion';
export type QuestionStatus = 'open' | 'resolved';

export interface ArgItem {
  id: string;
  role: Role;
  /** one sentence */
  text: string;
  /** the item it bears on — absent for the thesis, and for an item attached to nothing */
  parent?: string;
  /** a citation the person gives */
  source?: string;
  /** questions only */
  status?: QuestionStatus;
  by: By;
}

export interface ArgumentState extends DisplayHead {
  view: ArgumentView;
  items: ArgItem[];
}

export const ARGUMENT_LIMITS = { items: 40, text: 240, source: 160, title: 80 } as const;

/** The roles, in the order an outline takes them beneath any one item. */
export const ARG_ROLES: readonly Role[] = ['thesis', 'claim', 'evidence', 'counter', 'rebuttal', 'question', 'conclusion'];
export const ROLE_WORD: Record<Role, string> = {
  thesis: 'Thesis',
  claim: 'Claim',
  evidence: 'Evidence',
  counter: 'Counterargument',
  rebuttal: 'Rebuttal',
  question: 'Question',
  conclusion: 'Conclusion',
};

/** What each kind of item may sit under. */
export const PARENT_ROLES: Record<Role, readonly Role[]> = {
  thesis: [],
  claim: ['thesis'],
  evidence: ['claim', 'thesis', 'counter', 'rebuttal'],
  counter: ['thesis', 'claim', 'evidence'],
  rebuttal: ['counter'],
  question: ['thesis', 'claim', 'evidence', 'counter', 'rebuttal', 'question', 'conclusion'],
  conclusion: ['thesis'],
};

/** Without a parent they may have, these attach to the thesis when there is one; the rest attach to nothing. */
const TO_THESIS = new Set<Role>(['claim', 'counter', 'conclusion']);
/** What Socria may add once the map exists. Its evidence is always its own suggestion. */
const SOCRIA_ADDS = new Set<Role>(['claim', 'counter', 'question', 'evidence']);
const SOCRIA_REFUSED: Partial<Record<Role, string>> = {
  thesis: 'The thesis is yours to state — Socria can suggest one in the conversation.',
  rebuttal: 'Answering a counterargument is yours to do — Socria can suggest a rebuttal in the conversation.',
  conclusion: 'The conclusion is yours to draw — Socria can suggest one in the conversation.',
};
const PLACE_RULE: Record<Role, string> = {
  thesis: 'The thesis is the root; it sits under nothing.',
  claim: 'A claim sits under the thesis.',
  evidence: 'Evidence goes under a claim, the thesis, a counterargument or a rebuttal.',
  counter: 'A counterargument goes against the thesis, a claim or a piece of evidence.',
  rebuttal: 'A rebuttal answers a counterargument.',
  question: 'A question can sit under anything.',
  conclusion: 'A conclusion follows from the thesis.',
};

/** How an item bears on the one it sits under. */
export type Relation = 'supports' | 'opposes' | 'answers' | 'asks' | 'concludes';
export const RELATION: Record<Exclude<Role, 'thesis'>, Relation> = {
  claim: 'supports',
  evidence: 'supports',
  counter: 'opposes',
  rebuttal: 'answers',
  question: 'asks',
  conclusion: 'concludes',
};

const SYNONYM: Record<string, Role> = { counterargument: 'counter', 'counter-argument': 'counter', objection: 'counter' };
function roleOf(v: unknown): Role | null {
  if (typeof v !== 'string') return null;
  const k = v.trim().toLowerCase();
  return ARG_ROLES.includes(k as Role) ? (k as Role) : (SYNONYM[k] ?? null);
}

// ── canonical state ──────────────────────────────────────────────────

/**
 * One thesis, at most: a later one is not kept (reading it as a claim, or as
 * the other side's thesis, would be a guess). Each item sits under an item
 * its role allows, or — claims, counterarguments and conclusions — under the
 * thesis when there is one, or under nothing. No loops: where items would sit
 * under each other in a circle, the earliest of them lets go of its parent.
 */
export function sanitizeArgument(raw: unknown): ArgumentState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.items)) return null;
  const items: ArgItem[] = [];
  const ids = new Set<string>();
  const asked = new Map<string, string>();
  let thesis: string | null = null;
  for (const x of r.items) {
    if (items.length >= ARGUMENT_LIMITS.items) break;
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const role = roleOf(o.role);
    const text = cleanText(o.text ?? o.label, ARGUMENT_LIMITS.text);
    if (!role || !text || (role === 'thesis' && thesis)) continue;
    let id = cleanId(o.id);
    if (!id || ids.has(id)) id = nextId('a', ids);
    ids.add(id);
    if (role === 'thesis') thesis = id;
    const parent = cleanId(o.parent);
    if (parent) asked.set(id, parent);
    const source = cleanText(o.source, ARGUMENT_LIMITS.source) || undefined;
    items.push({
      id,
      role,
      text,
      ...(source ? { source } : {}),
      ...(role === 'question' ? { status: o.status === 'resolved' ? ('resolved' as const) : ('open' as const) } : {}),
      by: cleanBy(o.by),
    });
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const parentOf = new Map<string, string>();
  for (const it of items) {
    if (it.role === 'thesis') continue;
    const p = byId.get(asked.get(it.id) ?? '');
    if (p && p.id !== it.id && PARENT_ROLES[it.role].includes(p.role)) parentOf.set(it.id, p.id);
    else if (thesis && TO_THESIS.has(it.role)) parentOf.set(it.id, thesis);
  }
  // a loop is cut at its earliest item; a cut claim, counter or conclusion falls back to the thesis (which sits under nothing)
  for (const it of items) {
    const seen = new Set<string>([it.id]);
    let at = parentOf.get(it.id);
    while (at !== undefined && !seen.has(at)) {
      seen.add(at);
      at = parentOf.get(at);
    }
    if (at !== it.id) continue;
    if (thesis && TO_THESIS.has(it.role) && PARENT_ROLES[it.role].includes('thesis')) parentOf.set(it.id, thesis);
    else parentOf.delete(it.id);
  }
  return {
    title: cleanText(r.title, ARGUMENT_LIMITS.title) || 'Argument',
    view: r.view === 'outline' ? 'outline' : 'map',
    items: items.map((i) => {
      const p = parentOf.get(i.id);
      return p ? { ...i, parent: p } : i;
    }),
  };
}

// ── what is computed ─────────────────────────────────────────────────

const find = (s: ArgumentState, id: unknown) => s.items.find((i) => i.id === id);
const thesisOf = (s: ArgumentState) => s.items.find((i) => i.role === 'thesis');
const short = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const said = (s: ArgumentState, id: string) => `‘${short(find(s, id)?.text ?? id)}’`;
const listed = (s: ArgumentState, ids: readonly string[], n = 3) => `${ids.slice(0, n).map((id) => said(s, id)).join('; ')}${ids.length > n ? '…' : ''}`;
const rank = (r: Role) => ARG_ROLES.indexOf(r);

/** Each item's children, in outline order: by role, then as listed. */
function childrenOf(s: ArgumentState): Map<string, string[]> {
  const at = new Map(s.items.map((i, n) => [i.id, n]));
  const out = new Map<string, string[]>(s.items.map((i) => [i.id, []]));
  for (const i of s.items) if (i.parent) out.get(i.parent)?.push(i.id);
  const order = (a: string, b: string) => rank(find(s, a)!.role) - rank(find(s, b)!.role) || at.get(a)! - at.get(b)!;
  for (const l of out.values()) l.sort(order);
  return out;
}

/** Items other than the thesis that sit under nothing. */
export function unattached(s: ArgumentState): string[] {
  return s.items.filter((i) => i.role !== 'thesis' && !i.parent).map((i) => i.id);
}

/** What the map grows from: the thesis, then whatever is attached to nothing (by role, then as listed). */
function tops(s: ArgumentState): string[] {
  const th = thesisOf(s);
  const at = new Map(s.items.map((i, n) => [i.id, n]));
  const loose = unattached(s).sort((a, b) => rank(find(s, a)!.role) - rank(find(s, b)!.role) || at.get(a)! - at.get(b)!);
  return [...(th ? [th.id] : []), ...loose];
}

export interface OutlineLine {
  id: string;
  depth: number;
}

/** The order an essay would take it in: depth first from the thesis, each item's children by role (claims, evidence, counterarguments, rebuttals, questions, conclusion), then what is attached to nothing. */
export function outline(s: ArgumentState): OutlineLine[] {
  const kids = childrenOf(s);
  const out: OutlineLine[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, depth });
    for (const c of kids.get(id) ?? []) walk(c, depth + 1);
  };
  for (const t of tops(s)) walk(t, 0);
  return out;
}

const withRole = (s: ArgumentState, role: Role) => s.items.filter((i) => i.role === role);
const beneath = (s: ArgumentState, id: string, role: Role) => s.items.some((i) => i.parent === id && i.role === role);

/** Claims with no evidence beneath them. */
export function unsupportedClaims(s: ArgumentState): string[] {
  return withRole(s, 'claim').filter((c) => !beneath(s, c.id, 'evidence')).map((c) => c.id);
}
/** Counterarguments no rebuttal answers. */
export function unansweredCounters(s: ArgumentState): string[] {
  return withRole(s, 'counter').filter((c) => !beneath(s, c.id, 'rebuttal')).map((c) => c.id);
}
export function openQuestions(s: ArgumentState): string[] {
  return withRole(s, 'question').filter((q) => q.status !== 'resolved').map((q) => q.id);
}
/** Evidence Socria suggested — for the person to check and give a source. */
export function suggestedEvidence(s: ArgumentState): string[] {
  return withRole(s, 'evidence').filter((e) => e.by === 'socria').map((e) => e.id);
}
/** Evidence the person gave. */
export function theirEvidence(s: ArgumentState): string[] {
  return withRole(s, 'evidence').filter((e) => e.by === 'person').map((e) => e.id);
}
export function unsourcedEvidence(s: ArgumentState): string[] {
  return withRole(s, 'evidence').filter((e) => !e.source).map((e) => e.id);
}
/** Claims whose only evidence is Socria's suggestion, not yet given a source — supported on paper, not yet by the person. */
export function restsOnSuggestion(s: ArgumentState): string[] {
  return withRole(s, 'claim')
    .filter((c) => {
      const ev = s.items.filter((i) => i.parent === c.id && i.role === 'evidence');
      return ev.length > 0 && ev.every((e) => e.by === 'socria' && !e.source);
    })
    .map((c) => c.id);
}

export interface ArgumentAudit {
  unsupported: string[];
  /** claims resting only on Socria's unchecked suggestions */
  suggestionOnly: string[];
  unanswered: string[];
  open: string[];
  suggested: string[];
  theirs: string[];
  unsourced: string[];
  unattached: string[];
}

/** Everything computed about the argument at once. */
export function audit(s: ArgumentState): ArgumentAudit {
  return {
    unsupported: unsupportedClaims(s),
    suggestionOnly: restsOnSuggestion(s),
    unanswered: unansweredCounters(s),
    open: openQuestions(s),
    suggested: suggestedEvidence(s),
    theirs: theirEvidence(s),
    unsourced: unsourcedEvidence(s),
    unattached: unattached(s),
  };
}

export interface ArgumentLayout {
  boxes: Box[];
  width: number;
  height: number;
  /** every item that sits under another, and how it bears on it */
  links: { from: string; to: string; relation: Relation }[];
  unattached: string[];
}

/** The map view: a tidy tree from the thesis, each item's children in outline order, with what is attached to nothing beside it. No two boxes overlap. */
export function argumentLayout(s: ArgumentState, opts: BoxOpts = {}): ArgumentLayout {
  const kids = childrenOf(s);
  const lay = tidyTree(tops(s), (id) => kids.get(id) ?? [], opts);
  return {
    ...lay,
    links: s.items.filter((i) => i.parent && i.role !== 'thesis').map((i) => ({ from: i.parent!, to: i.id, relation: RELATION[i.role as Exclude<Role, 'thesis'>] })),
    unattached: unattached(s),
  };
}

/** Is `id` somewhere beneath `above`? */
function isBeneath(s: ArgumentState, id: string, above: string): boolean {
  const seen = new Set<string>();
  for (let at = find(s, id)?.parent; at && !seen.has(at); at = find(s, at)?.parent) {
    if (at === above) return true;
    seen.add(at);
  }
  return false;
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<ArgumentState>[] = [
  {
    id: 'map',
    label: 'Map',
    shows: 'the reasoning as a tree: the thesis, what supports it, what goes against it and what answers that',
    primary: true,
    interactions: ['add evidence under a claim', 'move an item under another', 'give evidence a source'],
    unavailable: (s) => (s.items.length ? null : 'There is nothing to map yet — say your thesis ("my thesis is: …").'),
  },
  {
    id: 'outline',
    label: 'Outline',
    shows: 'the reasoning in the order an essay would take it',
    interactions: ['reword an item', 'mark a question resolved'],
    unavailable: (s) => (s.items.length ? null : 'There is nothing to outline yet — say your thesis ("my thesis is: …").'),
  },
];

const need = (s: ArgumentState, id: unknown): string | null => (find(s, id) ? null : 'There is no such item in the argument.');
const given = (v: unknown) => v !== undefined && v !== '';

function textProblem(v: unknown): string | null {
  const t = cleanText(v, 400);
  if (!t) return 'Say what it says.';
  return t.length > ARGUMENT_LIMITS.text ? `An item holds ${ARGUMENT_LIMITS.text} characters at most — say it more briefly.` : null;
}

function withItems(s: ArgumentState, items: ArgItem[]): ArgumentState {
  return sanitizeArgument({ ...s, items }) ?? s;
}

export const ARGUMENT_OPS = {
  ...headOps<ArgumentState>(views, sanitizeArgument),
  add: op<ArgumentState>(
    'Add',
    (s, a, ctx) => {
      const role = roleOf(a.role);
      if (!role) return 'Say what it is: a thesis, a claim, evidence, a counterargument, a rebuttal, a question or a conclusion.';
      const bad = textProblem(a.text);
      if (bad) return bad;
      if (s.items.length >= ARGUMENT_LIMITS.items) return `An argument map holds ${ARGUMENT_LIMITS.items} items at most.`;
      if (role === 'thesis' && thesisOf(s)) return 'It already has a thesis — reword that one, or add this as a claim.';
      const parent = given(a.parent) ? find(s, a.parent) : undefined;
      if (given(a.parent) && !parent) return 'There is no such item to put it under.';
      if (parent && !PARENT_ROLES[role].includes(parent.role)) return PLACE_RULE[role];
      if (role === 'rebuttal' && !parent) return 'Say which counterargument it answers.';
      if (cleanText(a.source, 400).length > ARGUMENT_LIMITS.source) return `A source holds ${ARGUMENT_LIMITS.source} characters at most.`;
      if (a.by !== 'person' && a.by !== 'socria') return 'Say who wrote it.';
      const forged = guardBy(a, ctx);
      if (forged) return forged;
      if (a.by === 'socria') {
        if (!SOCRIA_ADDS.has(role)) return SOCRIA_REFUSED[role] ?? 'Socria cannot add that.';
        if (cleanText(a.source, 400)) return 'A source is one you give — Socria’s evidence is a suggestion for you to check and source.';
      }
      return null;
    },
    (s, a) => {
      const role = roleOf(a.role)!;
      const source = cleanText(a.source, ARGUMENT_LIMITS.source);
      const item: ArgItem = {
        id: nextId('a', s.items.map((i) => i.id)),
        role,
        text: cleanText(a.text, ARGUMENT_LIMITS.text),
        ...(given(a.parent) ? { parent: String(a.parent) } : {}),
        ...(source ? { source } : {}),
        ...(role === 'question' ? { status: 'open' as const } : {}),
        by: cleanBy(a.by),
      };
      return withItems(s, [...s.items, item]);
    },
    (a) => {
      const role = roleOf(a.role);
      const what = role ? ROLE_WORD[role].toLowerCase() : 'item';
      return `added ${role === 'evidence' ? 'evidence' : `the ${what}`} “${cleanText(a.text, ARGUMENT_LIMITS.text)}”${cleanText(a.source, ARGUMENT_LIMITS.source) ? ` (source: ${cleanText(a.source, ARGUMENT_LIMITS.source)})` : ''}`;
    }
  ),
  text: op<ArgumentState>(
    'Reword',
    (s, a, ctx) =>
      need(s, a.id) ??
      textProblem(a.text) ??
      (find(s, a.id)!.text === cleanText(a.text, ARGUMENT_LIMITS.text) ? 'It already says that.' : null) ??
      guardOwn(find(s, a.id), ctx),
    (s, a) => withItems(s, s.items.map((i) => (i.id === a.id ? { ...i, text: cleanText(a.text, ARGUMENT_LIMITS.text) } : i))),
    (a) => `reworded to “${cleanText(a.text, ARGUMENT_LIMITS.text)}”`
  ),
  source: op<ArgumentState>(
    'Give a source',
    (s, a, ctx) => {
      const miss = need(s, a.id);
      if (miss) return miss;
      if (ctx?.by === 'socria') return 'A source is one you give — Socria can suggest where to look, and you check it.';
      const src = cleanText(a.source, 400);
      if (src.length > ARGUMENT_LIMITS.source) return `A source holds ${ARGUMENT_LIMITS.source} characters at most.`;
      if (!src && !find(s, a.id)!.source) return 'It has no source to clear.';
      return null;
    },
    (s, a) =>
      withItems(
        s,
        s.items.map((i) => {
          if (i.id !== a.id) return i;
          const { source: _old, ...rest } = i;
          const src = cleanText(a.source, ARGUMENT_LIMITS.source);
          return src ? { ...rest, source: src } : rest;
        })
      ),
    (a) => (cleanText(a.source, ARGUMENT_LIMITS.source) ? `source given: ${cleanText(a.source, ARGUMENT_LIMITS.source)}` : 'source cleared')
  ),
  parent: op<ArgumentState>(
    'Move',
    (s, a, ctx) => {
      const miss = need(s, a.id);
      if (miss) return miss;
      const it = find(s, a.id)!;
      if (it.role === 'thesis') return PLACE_RULE.thesis;
      const to = find(s, a.parent);
      if (!to) return 'There is no such item to put it under.';
      if (to.id === it.id || isBeneath(s, to.id, it.id)) return 'That would put it beneath itself.';
      if (!PARENT_ROLES[it.role].includes(to.role)) return PLACE_RULE[it.role];
      if (it.parent === to.id) return 'It is already there.';
      return guardOwn(it, ctx);
    },
    (s, a) => withItems(s, s.items.map((i) => (i.id === a.id ? { ...i, parent: String(a.parent) } : i))),
    () => 'moved under another item'
  ),
  status: op<ArgumentState>(
    'Mark',
    (s, a, ctx) => {
      const miss = need(s, a.id);
      if (miss) return miss;
      const it = find(s, a.id)!;
      if (it.role !== 'question') return 'Only a question is open or resolved.';
      if (a.status !== 'open' && a.status !== 'resolved') return 'A question is open or resolved.';
      if (it.status === a.status) return `It is already ${a.status}.`;
      return guardOwn(it, ctx);
    },
    (s, a) => withItems(s, s.items.map((i) => (i.id === a.id ? { ...i, status: a.status as QuestionStatus } : i))),
    (a) => `marked ${a.status}`
  ),
  remove: op<ArgumentState>(
    'Remove',
    (s, a, ctx) => {
      const miss = need(s, a.id);
      if (miss) return miss;
      const own = guardOwn(find(s, a.id), ctx);
      if (own) return own;
      // its children move, and moving what the person wrote is changing it
      if (ctx?.by === 'socria' && s.items.some((i) => i.parent === a.id && i.by === 'person')) return 'Your items sit beneath it — Socria does not move what you wrote.';
      return null;
    },
    (s, a) => {
      const gone = find(s, a.id)!;
      const up = gone.parent ? find(s, gone.parent) : undefined;
      const th = s.items.find((i) => i.role === 'thesis' && i.id !== gone.id);
      const items = s.items
        .filter((i) => i.id !== gone.id)
        .map((i) => {
          if (i.parent !== gone.id) return i;
          const { parent: _p, ...rest } = i;
          // to the removed item's parent if it may sit there, else the thesis, else nothing
          const to = up && PARENT_ROLES[i.role].includes(up.role) ? up : th && PARENT_ROLES[i.role].includes('thesis') ? th : undefined;
          return to ? { ...rest, parent: to.id } : rest;
        });
      return withItems(s, items);
    },
    () => 'removed'
  ),
};

// ── words → an operation ─────────────────────────────────────────────

const unquote = (v: string) => {
  const m = /^[“"‘']([\s\S]*)[”"’']$/.exec(v.trim());
  return (m ? m[1] : v).trim();
};

/** "the claim before the colon: what is said after it" — null without a colon, or with nothing after it. */
function split(t: string): { head: string; body: string } | null {
  const c = t.indexOf(':');
  if (c < 0) return null;
  const head = t.slice(0, c).trim();
  // "add evidence for X (source: Y)" has no colon before its source: not a head and a body
  if (/\(?\s*\b(?:source|citation|cite|ref)\s*$/i.test(head)) return null;
  const body = unquote(t.slice(c + 1).trim());
  return body ? { head, body } : null;
}

/** "… (source: City Energy Office, 2024)" or "… — source: …" at the end: the words, and the source the person gave. */
function withSource(body: string): { text: string; source?: string } {
  const m = /\s*(?:[([]\s*|[-–—,;]\s*)?\b(?:source|citation|cite|ref)\s*[:=]\s*([^)\]]+?)\s*[)\]]?\s*$/i.exec(body);
  if (!m || m.index === 0) return { text: body };
  const text = body.slice(0, m.index).trim().replace(/[\s.,;–—-]+$/, '');
  return text ? { text: unquote(text), source: m[1].trim() } : { text: body };
}

const STOP = new Set([
  'about', 'after', 'again', 'also', 'because', 'been', 'being', 'could', 'does', 'from', 'have', 'into', 'just',
  'like', 'more', 'most', 'much', 'only', 'over', 'should', 'some', 'such', 'than', 'that', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'would',
  'your', 'claim', 'evidence', 'counterargument', 'counter', 'objection', 'question', 'rebuttal', 'thesis',
  'conclusion', 'point', 'item',
]);
const ROLE_NAMES: Record<string, Role> = {
  thesis: 'thesis',
  claim: 'claim',
  evidence: 'evidence',
  counterargument: 'counter',
  'counter argument': 'counter',
  counter: 'counter',
  objection: 'counter',
  rebuttal: 'rebuttal',
  question: 'question',
  conclusion: 'conclusion',
};

/**
 * The item the words name, among `list`. In turn: a role named when only one
 * item has it ("the counterargument"); the item's words exactly; the item by
 * `findByLabel`; and — unless `strict` — the item more of the words'
 * distinctive words (four letters or more) belong to than to any other
 * ("evidence for the energy bills claim" names "Solar lowers household energy
 * bills"; "the jobs claim" names the one claim about jobs). A name two items
 * share names neither.
 */
function itemNamed(list: readonly ArgItem[], text: string, strict = false): ArgItem | null {
  const t = norm(unquote(text))
    .replace(/^(?:for|to|of|about|on|under|against|behind|supporting|backing|beneath)\s+/, '')
    .replace(/^(?:the|this|that|my|our|your)\s+/, '');
  if (!t) return null;
  const role = ROLE_NAMES[t];
  if (role) {
    const only = list.filter((i) => i.role === role);
    return only.length === 1 ? only[0] : null;
  }
  const exact = list.filter((i) => norm(i.text) === t);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const f = findByLabel(list, (i) => i.text, t);
  if (f) return list.some((i) => i !== f && norm(i.text) === norm(f.text)) ? null : f;
  if (strict) return null;
  const words = [...new Set(t.split(' ').filter((w) => w.length >= 4 && !STOP.has(w)))];
  const scored = list
    .map((i) => {
      const own = new Set(norm(i.text).split(' '));
      return { i, hits: words.filter((w) => own.has(w)).length };
    })
    .sort((a, b) => b.hits - a.hits);
  return scored.length && scored[0].hits >= 1 && (scored.length === 1 || scored[0].hits > scored[1].hits) ? scored[0].i : null;
}

const VIEW_WORDS: Record<ArgumentView, string[]> = {
  map: ['map', 'argument map', 'tree', 'diagram'],
  outline: ['outline', 'essay outline', 'indented list', 'bullet points', 'bullets'],
};

const ADD = /^(?:please\s+)?add\s+(?:a\s+|an\s+|another\s+|one\s+more\s+|some\s+|more\s+|new\s+|a\s+new\s+|a\s+piece\s+of\s+)?/i.source;

/**
 * An operation the words plainly ask for. Conservative by design: this runs
 * on every message while an argument map is in the workspace, so it answers
 * only to the phrases below — each naming an item of THIS argument, or
 * plainly adding one, with what is added after a colon — and otherwise leaves
 * the message to the conversation. What it adds is the person's.
 */
export function readArgumentOp(text: string, s: ArgumentState): { op: string; args: Args } | null {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 600) return null;
  const th = thesisOf(s);

  // "my thesis is: …", "thesis: …", "change my thesis to: …"
  const tm =
    /^(?:my|our|the)\s+(?:main\s+|central\s+|working\s+)?thesis\s+is\s*(?::\s*|that\s+)(.+)$/i.exec(t) ??
    /^thesis\s*:\s*(.+)$/i.exec(t) ??
    /^(?:please\s+)?(?:change|update|set|make)\s+(?:my|the|our)\s+thesis\s+(?:to|as)\s*:?\s*(.+)$/i.exec(t);
  if (tm) {
    const body = unquote(tm[1].replace(/[.!]+$/, ''));
    if (!body) return null;
    if (!th) return { op: 'add', args: { role: 'thesis', text: body, by: 'person' } };
    return norm(body) === norm(th.text) ? null : { op: 'text', args: { id: th.id, text: body } };
  }

  // "add a claim: …", "add a conclusion: …"
  const cm = new RegExp(`${ADD}(claim|reason|conclusion)\\s*(?::\\s*|that\\s+)(.+)$`, 'i').exec(t);
  if (cm) {
    const body = unquote(cm[2]);
    return body ? { op: 'add', args: { role: /conclusion/i.test(cm[1]) ? 'conclusion' : 'claim', text: body, by: 'person' } } : null;
  }

  // "add evidence for <claim>: … (source: …)"
  const em = new RegExp(`${ADD}evidence\\b(.*)$`, 'i').exec(t);
  if (em) {
    const sp = split(em[1]);
    if (!sp) return null;
    const { text: body, source } = withSource(sp.body);
    let parent: ArgItem | null | undefined;
    if (sp.head) {
      parent = itemNamed(s.items.filter((i) => PARENT_ROLES.evidence.includes(i.role)), sp.head);
      if (!parent) return null;
    } else parent = th;
    return { op: 'add', args: { role: 'evidence', text: body, ...(parent ? { parent: parent.id } : {}), ...(source ? { source } : {}), by: 'person' } };
  }

  // "add a counterargument: …" — against the claim named before the colon, else the thesis
  const km = new RegExp(`${ADD}(?:counter[\\s-]?argument|counterpoint|counter-point|counterclaim|objection)\\b(.*)$`, 'i').exec(t);
  if (km) {
    const sp = split(km[1]);
    if (!sp) return null;
    let parent: ArgItem | null | undefined = th;
    const head = sp.head.replace(/^(?:to|against|for|on|about)\s+/i, '');
    if (head && !/^(?:it|this|that|the|my|our)?\s*(?:argument|essay|thesis|debate)?$/i.test(head)) {
      parent = itemNamed(s.items.filter((i) => PARENT_ROLES.counter.includes(i.role)), head);
      if (!parent) return null;
    }
    return { op: 'add', args: { role: 'counter', text: sp.body, ...(parent ? { parent: parent.id } : {}), by: 'person' } };
  }

  // "rebut <counterargument>: …", "add a rebuttal to <counterargument>: …"
  const rb = /^(?:please\s+)?rebut\b(.*)$/i.exec(t) ?? new RegExp(`${ADD}(?:rebuttal|response)\\b(.*)$`, 'i').exec(t);
  if (rb) {
    const sp = split(rb[1]);
    if (!sp) return null;
    const counters = withRole(s, 'counter');
    const head = sp.head.replace(/^(?:to|against|for)\s+/i, '');
    const open = unansweredCounters(s);
    const target = head && !/^(?:it|this|that)$/i.test(head)
      ? itemNamed(counters, head)
      : counters.length === 1
        ? counters[0]
        : open.length === 1
          ? find(s, open[0])!
          : null;
    return target ? { op: 'add', args: { role: 'rebuttal', text: sp.body, parent: target.id, by: 'person' } } : null;
  }

  // "add a question: …", "add a question about <item>: …"
  const qm = new RegExp(`${ADD}(?:open\\s+)?question\\b(.*)$`, 'i').exec(t);
  if (qm) {
    const sp = split(qm[1]);
    if (!sp) return null;
    let parent: ArgItem | null | undefined = th;
    if (sp.head) {
      parent = itemNamed(s.items, sp.head);
      if (!parent) return null;
    }
    return { op: 'add', args: { role: 'question', text: sp.body, ...(parent ? { parent: parent.id } : {}), by: 'person' } };
  }

  // "mark <question> resolved"
  const mk = /^(?:please\s+)?mark\s+(.+?)\s+(?:as\s+)?(resolved|answered|settled|closed|open|unresolved|unanswered|reopened)[.!]?$/i.exec(t);
  if (mk) {
    const status: QuestionStatus = /^(open|unresolved|unanswered|reopened)$/i.test(mk[2]) ? 'open' : 'resolved';
    const questions = withRole(s, 'question');
    const generic = /^(?:it|this|that|the question|this question|that question)$/i.test(mk[1].trim());
    const target = generic ? (questions.length === 1 ? questions[0] : null) : itemNamed(questions, mk[1]);
    return target ? { op: 'status', args: { id: target.id, status } } : null;
  }

  // "the source for <evidence> is …"
  const sm = /^(?:the\s+)?(?:source|citation)\s+(?:for|of)\s+(.+)\s+is\s*:?\s*(.+)$/i.exec(t);
  if (sm) {
    const target = itemNamed(s.items, sm[1]);
    const source = unquote(sm[2].replace(/[.!]+$/, ''));
    return target && source ? { op: 'source', args: { id: target.id, source } } : null;
  }

  // "reword <item> to: …" — or without the colon, the item named plainly
  const rw = /^(?:please\s+)?(?:reword|rephrase)\s+(.+)$/i.exec(t);
  if (rw) {
    const c = /^(.+?)\s+to\s*:\s*(.+)$/i.exec(rw[1]);
    const pairs = c
      ? [{ left: c[1], right: c[2] }]
      : [...rw[1].matchAll(/\s+to\s+/gi)].map((m) => ({ left: rw[1].slice(0, m.index), right: rw[1].slice(m.index! + m[0].length) }));
    for (const p of pairs) {
      const target = itemNamed(s.items, p.left, !c);
      const body = unquote(p.right.replace(/[.!]+$/, ''));
      if (target && body) return { op: 'text', args: { id: target.id, text: body } };
    }
    return null;
  }

  // "remove <item>" — named plainly
  const rm = /^(?:please\s+)?(?:remove|delete|drop|cut|take out)\s+(.+?)[.!]?$/i.exec(t);
  if (rm) {
    const target = itemNamed(s.items, rm[1], true);
    return target ? { op: 'remove', args: { id: target.id } } : null;
  }

  const view = askedView(t, VIEW_WORDS);
  if (view) return view === s.view ? null : { op: 'view', args: { view } };
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function factsOf(s: ArgumentState): string[] {
  const n = s.items.length;
  const out: string[] = [`${s.title}: an argument map of ${n} item${n === 1 ? '' : 's'}, shown as ${s.view === 'map' ? 'a map' : 'an outline'}.`];
  const th = thesisOf(s);
  out.push(th ? `The thesis: ${said(s, th.id)} — ${th.by === 'person' ? 'theirs' : 'proposed by Socria'}.` : 'There is no thesis yet.');
  if (th && !s.items.some((i) => i.parent === th.id && (i.role === 'claim' || i.role === 'evidence'))) out.push('Nothing supports the thesis yet.');
  const a = audit(s);
  const claims = withRole(s, 'claim').length;
  if (claims) {
    out.push(
      a.unsupported.length
        ? `${a.unsupported.length} of ${claims} ${plural(claims, 'claim', 'claims')} ${plural(a.unsupported.length, 'has', 'have')} no evidence beneath ${plural(a.unsupported.length, 'it', 'them')}: ${listed(s, a.unsupported)}.`
        : `Every claim has evidence beneath it.`
    );
    if (a.suggestionOnly.length) out.push(`${listed(s, a.suggestionOnly)} ${plural(a.suggestionOnly.length, 'rests', 'rest')} only on evidence Socria suggested, which nobody has checked or sourced yet.`);
  }
  const counters = withRole(s, 'counter').length;
  if (counters) {
    out.push(
      a.unanswered.length
        ? `${a.unanswered.length} of ${counters} ${plural(counters, 'counterargument', 'counterarguments')} ${plural(a.unanswered.length, 'is', 'are')} not answered by a rebuttal: ${listed(s, a.unanswered)}.`
        : 'Every counterargument is answered by a rebuttal.'
    );
  }
  if (a.open.length) out.push(`${a.open.length} open ${plural(a.open.length, 'question', 'questions')}: ${listed(s, a.open)}.`);
  const unchecked = a.suggested.filter((id) => !find(s, id)!.source);
  if (unchecked.length) out.push(`${unchecked.length} ${plural(unchecked.length, 'piece', 'pieces')} of evidence Socria suggested — for them to check and give a source: ${listed(s, unchecked)}.`);
  const theirsBare = a.theirs.filter((id) => !find(s, id)!.source);
  if (theirsBare.length) out.push(`${theirsBare.length} ${plural(theirsBare.length, 'piece', 'pieces')} of their own evidence ${plural(theirsBare.length, 'has', 'have')} no source yet.`);
  if (a.unattached.length) out.push(`Attached to nothing: ${listed(s, a.unattached)}.`);
  const mine = s.items.filter((i) => i.by === 'person').length;
  if (mine) out.push(`${mine} ${plural(mine, 'item is', 'items are')} the person’s own; Socria does not change those.`);
  return out;
}

function textOf(s: ArgumentState): string {
  const loose = new Set(unattached(s));
  const lines = outline(s).map(({ id, depth }) => {
    const i = find(s, id)!;
    const tags = [i.role === 'question' ? i.status ?? 'open' : '', i.source ? `source: ${i.source}` : ''].filter(Boolean);
    const who = i.by === 'person' ? ' · theirs' : i.role === 'evidence' && !i.source ? ' · Socria’s suggestion, unchecked' : '';
    return `${'  '.repeat(depth)}${ROLE_WORD[i.role]}: ${i.text}${tags.length ? ` [${tags.join('; ')}]` : ''}${loose.has(id) ? ' (attached to nothing)' : ''}${who}`;
  });
  return [`ARGUMENT “${s.title}”`, ...lines].join('\n').slice(0, 2400);
}

export const ARGUMENT = displayKind<ArgumentState>({
  kind: 'argument',
  label: 'Argument',
  sanitize: sanitizeArgument,
  ops: ARGUMENT_OPS,
  readOp: (text, s) => readArgumentOp(text, s),
  consequence: (before, after) => {
    const b = audit(before);
    const a = audit(after);
    const existed = (id: string) => !!find(before, id) && !!find(after, id);
    const supported = b.unsupported.find((id) => !a.unsupported.includes(id) && existed(id));
    if (supported) return `${said(after, supported)} now has evidence beneath it.`;
    const bare = a.unsupported.find((id) => !b.unsupported.includes(id) && existed(id));
    if (bare) return `${said(after, bare)} has no evidence beneath it now.`;
    const answered = b.unanswered.find((id) => !a.unanswered.includes(id) && existed(id));
    if (answered) return `${said(after, answered)} is answered now.`;
    const reopened = a.unanswered.find((id) => !b.unanswered.includes(id) && existed(id));
    if (reopened) return `${said(after, reopened)} is no longer answered.`;
    const newCounter = a.unanswered.find((id) => !find(before, id));
    if (newCounter) return `${said(after, newCounter)} is not answered yet.`;
    const newClaim = a.unsupported.find((id) => !find(before, id));
    if (newClaim) return `${said(after, newClaim)} has no evidence beneath it yet.`;
    if (a.open.length !== b.open.length) return `${a.open.length} ${plural(a.open.length, 'question', 'questions')} open.`;
    return null;
  },
  facts: (s) => factsOf(s),
  text: textOf,
  parts: (s): Part[] => s.items.map((i) => ({ id: i.id, label: i.text })),
  partFacts: (s, part) => {
    const i = find(s, part);
    if (!i) return null;
    const a = audit(s);
    return [
      `${ROLE_WORD[i.role]}: ${i.text}`,
      ...(i.parent ? [`${RELATION[i.role as Exclude<Role, 'thesis'>]} ${said(s, i.parent)}`] : i.role === 'thesis' ? [] : ['attached to nothing']),
      ...(i.source ? [`source: ${i.source}`] : []),
      ...(i.status ? [i.status] : []),
      ...(a.unsupported.includes(i.id) ? ['no evidence beneath it'] : []),
      ...(a.unanswered.includes(i.id) ? ['not answered by a rebuttal'] : []),
      i.by === 'person' ? 'yours' : i.role === 'evidence' ? 'Socria’s suggestion — check it' : 'from Socria',
    ];
  },
  views,
  size: (s, mode) =>
    mode === 'card' ? { w: 260, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 680, h: Math.min(620, 160 + 32 * Math.max(3, s.items.length)) },
  shape: (s) => `${s.view === 'outline' ? 'argument outline' : 'argument map'} · ${s.items.length} item${s.items.length === 1 ? '' : 's'}`,
});

register(ARGUMENT);
registerDisplay({
  kind: 'argument',
  noun: 'argument map',
  handle: 'A',
  about: 'An essay’s or a debate’s reasoning — thesis, claims, evidence, counterarguments, rebuttals and open questions — which stays the person’s own.',
});
