// lib/collab.ts
//
// Logos 2 — two people, one map. The part that has no browser in it.
//
// WHAT THIS IS. A shared line of thinking is an ordinary Logos session that
// two people are inside at once. Everything either of them does — a message,
// a node added, a node edited, a reply that arrived from Socria — is an
// EVENT, and both clients apply every event through the same reducer below.
// Two clients that have seen the same events in any order end up holding the
// same state. That property is the whole design; the tests pin it.
//
// WHO OWNS THE ROW. The host. Logos already persists from the browser (the
// host's client writes the session through /api/conversations, as it always
// has), and nothing here changes the access model that keeps accounts apart:
// the guest never writes a row, never reads one, and never needs to. The
// guest holds a mirror of the session in memory for as long as the two of
// them are together; the host keeps it afterwards. That is a deliberate v1
// boundary and the UI says so in words.
//
// WHO SAID WHAT. Every message and every node carries `by` — a participant
// reference — and it survives persistence, so a shared session opened alone
// later still shows who contributed which idea. Two people get two colours,
// assigned by the order they joined, from a fixed pair: moss (the person, in
// this system's own code) for the host, slate (evidence) for the guest.
// Vermilion is not in the pair; it means the machine and would misfile a
// human.
//
// SOCRIA IS THE LAYER BETWEEN THEM, NOT A THIRD VOICE. See collabBlock: it
// tells the model there are two people, names them, and confines it to
// naming connections, disagreements, assumptions and open questions between
// what each has said. It is told, in so many words, never to take a side and
// never to conclude for them.
//
// TRANSPORT-AGNOSTIC. Nothing here knows how an event travels. That lives in
// lib/collab-transport.ts, which has two implementations — one for the same
// browser (testable here) and one across devices — behind one interface.

import { sanitizeByRef, type ByRef, type LogosNode, type LogosNodeType, type Seat, type ThinkingMap } from './logos';
import type { LogosMsg, LogosSession } from './logos-sessions';

// ── people ──────────────────────────────────────────────────────────

export type { ByRef, Seat };

/** The two colours, by seat. Fixed on purpose — see the header. */
export const SEAT_COLOR: Record<Seat, string> = {
  host: '#5e7633', // moss — the person
  guest: '#3A6EA5', // slate — evidence
};

export interface Participant {
  /** stable across reconnects; the Clerk id for an account, else a tab id */
  id: string;
  name: string;
  seat: Seat;
}

export const MAX_NAME = 40;

/** A display name that is never empty and never a novel. */
export function cleanName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const v = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return v || fallback;
}

export function byOf(p: Participant): ByRef {
  return { id: p.id, name: p.name, seat: p.seat };
}

/** The initial that stands for a person where a name will not fit. */
export function initialOf(name: string): string {
  const w = name.trim();
  return (w ? w[0] : '?').toUpperCase();
}

/**
 * A `by` as it arrives from the wire or from storage — trusted for nothing.
 * Returns undefined for anything that is not a plausible reference, so a
 * message with a broken author simply reads as unattributed rather than
 * crashing a render.
 */
export const sanitizeBy = sanitizeByRef;

// ── the share code ──────────────────────────────────────────────────
//
// Six characters from an alphabet with nothing that reads as something else
// over the phone or across a table: no 0/O, no 1/I/L. That is 30^6 — about
// 729 million rooms — which is plenty for a code that only has to be
// unguessable for the length of a conversation.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ2345679';
export const CODE_LEN = 6;

export function makeShareCode(rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  }
  return out;
}

/** Normalise what somebody typed — case, spaces, the dash people add. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.toUpperCase().replace(/[\s-]/g, '');
  return isShareCode(v) ? v : null;
}

export function isShareCode(v: unknown): v is string {
  if (typeof v !== 'string' || v.length !== CODE_LEN) return false;
  for (const ch of v) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** The channel a code names. One room per code, whatever the transport. */
export function roomFor(code: string): string {
  return `logos2:${code}`;
}

// ── events ──────────────────────────────────────────────────────────

export interface EventBase {
  /** unique per event; the reducer drops a repeat */
  id: string;
  /** wall clock at the sender, ms — orders concurrent edits */
  at: number;
  by: ByRef;
}

export type CollabEvent =
  /** "I am here" — carries the host's session so a guest can adopt it */
  | (EventBase & { kind: 'hello'; participant: Participant; session?: LogosSession })
  | (EventBase & { kind: 'bye' })
  | (EventBase & { kind: 'message'; message: LogosMsg })
  | (EventBase & { kind: 'node.add'; node: LogosNode })
  | (EventBase & { kind: 'node.edit'; nodeId: string; label: string })
  | (EventBase & { kind: 'node.remove'; nodeId: string })
  /** the host's extraction landed; guests take the whole map */
  | (EventBase & { kind: 'map'; map: ThinkingMap });

export type CollabEventKind = CollabEvent['kind'];

/** An event id: time-ordered enough to read, random enough not to collide. */
export function eventId(at: number = Date.now(), rng: () => number = Math.random): string {
  const r = Math.floor(rng() * 0xffffffff).toString(36);
  return `${at.toString(36)}-${r}`;
}

// ── state ───────────────────────────────────────────────────────────

// ── the convergent node store ───────────────────────────────────────
//
// Nodes cannot be kept as a plain array and stay convergent: a remove that
// arrives before its add, or an edit before its add, would land differently
// on two clients. So a node's life is tracked in three order-free structures
// and the array is DERIVED from them on every change:
//
//   cells   — the node as added, with the moment it was added (its sort key,
//             fixed regardless of arrival order) and whether a person added
//             it by hand or the extractor drew it;
//   edits   — the winning label, last-writer-wins by the sender's clock, kept
//             even for a node not yet seen, so an early edit survives its add;
//   removed — a grow-only tombstone set: remove wins, and a re-delivered add
//             for a removed node stays gone.
//
// Two clients holding the same events, in any order, hold the same three and
// therefore derive the same map. That is the whole guarantee; the tests walk
// every ordering of a realistic event set to hold it to it.
interface NodeCell {
  node: LogosNode;
  /** the add event's clock — the node's place in the map, order-independent */
  addedAt: number;
  /** a hand-added node survives re-extraction; an extractor node is replaced by it */
  hand: boolean;
}

export interface CollabState {
  code: string;
  me: Participant;
  /** who is here right now, host first */
  present: Participant[];
  /** the shared session, or null until the host's hello has arrived */
  session: LogosSession | null;
  /** event ids already applied — the idempotence set */
  seen: string[];
  /** node id -> the node as added */
  cells: Record<string, NodeCell>;
  /** node id -> the winning label and when it was set */
  edits: Record<string, { label: string; at: number }>;
  /** node ids removed — grow-only; remove wins over a later add */
  removed: string[];
}

function seedCells(map: ThinkingMap | undefined): Record<string, NodeCell> {
  const out: Record<string, NodeCell> = {};
  (map?.nodes ?? []).forEach((node, i) => {
    // Seed times are 0..n — always older than any real edit's ms clock, so a
    // later edit always wins, and the initial order is preserved.
    out[node.id] = { node, addedAt: i, hand: !!node.by };
  });
  return out;
}

/** The rendered map, derived from the store. Order is (addedAt, id), fixed. */
function deriveMap(
  base: ThinkingMap,
  cells: Record<string, NodeCell>,
  edits: Record<string, { label: string; at: number }>,
  removed: readonly string[]
): ThinkingMap {
  const gone = new Set(removed);
  const present = Object.values(cells).filter((c) => !gone.has(c.node.id));
  present.sort((a, b) => a.addedAt - b.addedAt || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  const nodes = present.map((c) => {
    const e = edits[c.node.id];
    // The edit wins iff it is at least as recent as the add — an edit made
    // before the add (older clock) loses to the label the add carried.
    return e && e.at >= c.addedAt ? { ...c.node, label: e.label } : c.node;
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (base.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to));
  return { ...base, nodes, edges };
}

export function initialState(code: string, me: Participant, session: LogosSession | null): CollabState {
  return {
    code,
    me,
    present: [me],
    session,
    seen: [],
    cells: seedCells(session?.map),
    edits: {},
    removed: [],
  };
}

/** The seat the next arrival takes: the host is whoever opened the room. */
export function seatFor(present: readonly Participant[]): Seat {
  return present.some((p) => p.seat === 'host') ? 'guest' : 'host';
}

/** Hard cap: this is two people, and the UI is built for two. */
export const MAX_PEOPLE = 2;

function withPresent(present: readonly Participant[], p: Participant): Participant[] {
  if (present.some((x) => x.id === p.id)) {
    return present.map((x) => (x.id === p.id ? { ...x, name: p.name } : x));
  }
  if (present.length >= MAX_PEOPLE) return [...present];
  const next = [...present, p];
  // host first, always, so the colours and the order are stable
  return next.sort((a, b) => (a.seat === b.seat ? 0 : a.seat === 'host' ? -1 : 1));
}

/**
 * Apply one event. Pure, idempotent, order-tolerant for the things it has to
 * be tolerant of:
 *
 *  - a repeated event id is a no-op;
 *  - a message is appended once, in arrival order (a conversation IS its
 *    arrival order — there is no truer sequence to recover);
 *  - a node edit wins by `at`, so two clients that saw two edits in opposite
 *    orders still agree on the label;
 *  - a whole-map event replaces the map, keeping any `by` the extractor
 *    dropped, because the extractor does not know who said what.
 */
export function applyEvent(state: CollabState, ev: CollabEvent): CollabState {
  if (state.seen.includes(ev.id)) return state;
  const seen = [...state.seen, ev.id];
  const base = { ...state, seen };

  switch (ev.kind) {
    case 'hello': {
      const present = withPresent(state.present, ev.participant);
      // A guest adopts the host's session on first sight and only then, and
      // seeds its node store from the adopted map at the same moment.
      const adopt = state.session === null && ev.session && ev.participant.seat === 'host';
      if (adopt) {
        return { ...base, present, session: ev.session!, cells: seedCells(ev.session!.map) };
      }
      return { ...base, present };
    }
    case 'bye':
      return { ...base, present: state.present.filter((p) => p.id !== ev.by.id) };
    case 'message': {
      if (!state.session) return base;
      const message: LogosMsg = { ...ev.message, by: ev.by };
      return {
        ...base,
        session: { ...state.session, messages: [...state.session.messages, message], updatedAt: ev.at },
      };
    }
    case 'node.add': {
      if (!state.session) return base;
      // Tombstoned, or already added: a re-delivered add is a no-op.
      if (state.removed.includes(ev.node.id) || state.cells[ev.node.id]) return base;
      const node: LogosNode = { ...ev.node, by: ev.by };
      const cells = { ...state.cells, [node.id]: { node, addedAt: ev.at, hand: true } };
      return {
        ...base,
        cells,
        session: { ...state.session, map: deriveMap(state.session.map, cells, state.edits, state.removed), updatedAt: ev.at },
      };
    }
    case 'node.edit': {
      if (!state.session) return base;
      // Recorded even when the node has not arrived yet, so an edit that
      // precedes its add survives. Last writer wins by the sender's clock,
      // and on a tie the higher label string, so both clients break it alike.
      const prev = state.edits[ev.nodeId];
      if (prev && (ev.at < prev.at || (ev.at === prev.at && ev.label <= prev.label))) return base;
      const edits = { ...state.edits, [ev.nodeId]: { label: ev.label, at: ev.at } };
      return {
        ...base,
        edits,
        session: { ...state.session, map: deriveMap(state.session.map, state.cells, edits, state.removed), updatedAt: ev.at },
      };
    }
    case 'node.remove': {
      if (!state.session) return base;
      // A tombstone, not a filter: remove wins, and it wins whatever order it
      // arrives in relative to the add.
      const removed = state.removed.includes(ev.nodeId) ? state.removed : [...state.removed, ev.nodeId];
      return {
        ...base,
        removed,
        session: { ...state.session, map: deriveMap(state.session.map, state.cells, state.edits, removed), updatedAt: ev.at },
      };
    }
    case 'map': {
      if (!state.session) return base;
      // The extractor rebuilds its own nodes from the thread each turn; a
      // person's hand-added node is not in that output and must survive it.
      // So the map event replaces only the NON-hand cells, keeps the hand
      // ones, and respects the tombstones.
      //
      // The extractor does not carry `by`. Keep the attribution a surviving
      // node already had; for a new one, credit the most recent speaker — the
      // person whose words it was drawn from.
      const lastBy = [...state.session.messages].reverse().find((m) => m.role === 'user')?.by;
      const cells: Record<string, NodeCell> = {};
      for (const [id, cell] of Object.entries(state.cells)) if (cell.hand) cells[id] = cell;
      ev.map.nodes.forEach((n, i) => {
        if (state.removed.includes(n.id) || cells[n.id]) return; // tombstoned, or a hand node keeps its place
        const by = state.cells[n.id]?.node.by ?? n.by ?? lastBy;
        cells[n.id] = { node: by ? { ...n, by } : n, addedAt: ev.at + i, hand: false };
      });
      return {
        ...base,
        cells,
        session: { ...state.session, map: deriveMap(ev.map, cells, state.edits, state.removed), updatedAt: ev.at },
      };
    }
  }
}

export function applyAll(state: CollabState, evs: readonly CollabEvent[]): CollabState {
  return evs.reduce(applyEvent, state);
}

// ── what the other person sees of a node ────────────────────────────

/** Whose idea, or null when nobody claimed it (an older session, or Socria's). */
export function authorOf(n: Pick<LogosNode, 'by'> | Pick<LogosMsg, 'by'>): ByRef | null {
  return n.by ?? null;
}

/** How many ideas each person put on the map — the honest scoreboard. */
export function contributions(map: ThinkingMap): Record<Seat, number> {
  const out: Record<Seat, number> = { host: 0, guest: 0 };
  for (const n of map.nodes) if (n.by) out[n.by.seat]++;
  return out;
}

// ── Socria, between two people ──────────────────────────────────────

/**
 * The block appended to the Logos system prompt when two people are present.
 *
 * Three rules it states in so many words, because a model follows what is
 * enumerated and invents what is not:
 *
 *  1. It is the layer BETWEEN them — not a third participant in the argument.
 *  2. Its job is four things: connections, disagreements, assumptions, open
 *     questions — between what each has said. Naming them is the whole job.
 *  3. It never picks a side and never concludes. A disagreement is held
 *     open and made precise, not resolved.
 */
export function collabBlock(people: readonly Pick<Participant, 'name' | 'seat'>[]): string {
  const named = people.slice(0, MAX_PEOPLE);
  if (named.length < 2) return '';
  const [a, b] = named;
  return `

TWO PEOPLE ARE THINKING HERE TOGETHER: ${a.name} and ${b.name}. Every message from a person is prefixed with their name, so you always know who said what.

You are the shared reasoning layer between them — not a third voice in the discussion, and not a referee. Your whole job is to make what is between them visible:
- CONNECTIONS: where something one of them said bears on something the other said, say so, naming both.
- DISAGREEMENTS: where they differ, say plainly what each is claiming and what each would have to believe for their claim to hold. Make the disagreement precise. Do not resolve it.
- ASSUMPTIONS: what one of them is taking for granted that the other has not examined — name it and ask whether it is shared.
- QUESTIONS: the question neither of them has asked yet, if there is one.

Address them by name when it matters who said what. Never take a side. Never conclude for them, and never tell them who is right — that judgment is theirs, and the point of their being here together is to reach it themselves. Keep it short; two people are waiting to speak.`;
}

/** The thread as the model should read it: each human turn signed. */
export function signTurns(messages: readonly LogosMsg[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages.map((m) =>
    m.role === 'user' && m.by ? { role: m.role, content: `${m.by.name}: ${m.content}` } : { role: m.role, content: m.content }
  );
}

// ── the link ────────────────────────────────────────────────────────

/** Where a guest lands. The model is set so /chat opens the right surface. */
export function joinUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/chat?model=logos-2&join=${encodeURIComponent(code)}`;
}

/** Read a join code off a URL, or null. Tolerant of what people paste. */
export function joinCodeFrom(search: string): string | null {
  try {
    return normalizeCode(new URLSearchParams(search).get('join'));
  } catch {
    return null;
  }
}

// a node a person adds by hand, before the extractor has seen it
export function handNode(id: string, label: string, type: LogosNodeType = 'idea'): LogosNode {
  return { id, type, label: label.trim().slice(0, 120), status: 'open' };
}
