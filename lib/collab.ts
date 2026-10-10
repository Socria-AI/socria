// lib/collab.ts
//
// Logos 3 — two people, one map. The part that has no browser in it.
// (It was Logos 2's, before the room was parked; Logos 3 is where it lives now.)
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
//
// MODELS AND OBJECTS ARE THEIR OWN EVENTS. A room used to carry them only
// inside the host's whole-map event, which REPLACED them: the last extraction
// erased the other seat's model or scene, and a slider moved or a part added
// never reached the other person at all. Now a model document travels as
// `model.revision` and an object of thought as `object.step`, each applied by
// id, and a `map` event only ADDS documents and objects it carries — it never
// rolls one back and never removes one it does not mention. See the model
// store below for how two seats agree on which copy of a document wins.

import { sanitizeByRef, type ByRef, type LogosNode, type LogosNodeType, type Seat, type ThinkingMap } from './logos';
import type { LogosMsg, LogosSession } from './logos-sessions';
import { DOC_CAP, type ModelDoc } from './model/docs';
import { MAX_OBJECTS, type ThoughtObject } from './objects';

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
// Eight, not six, and drawn from the system CSPRNG on the server
// (lib/logos-rooms-server.ts). The old six-character Math.random() code was
// the ONLY thing between a stranger and a private conversation; it is now one
// of three things, behind a Clerk session and a server-side membership check,
// but a share code should still be a random number rather than a plausible
// one. Anything that validates a typed code must agree with the server about
// its length, or every invite link silently fails to open.
export const CODE_LEN = 8;

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
  /**
   * An extraction landed. Its nodes replace the extractor's (hand nodes stay);
   * the documents and objects it carries are ADDED where the room does not
   * have them yet, and nothing it leaves out is removed.
   */
  | (EventBase & { kind: 'map'; map: ThinkingMap })
  /**
   * ONE MODEL DOCUMENT, as it now stands — after a control moved, an undo, a
   * restore, a verb from the conversation — or `null` once it is deleted.
   * With `doc` absent and `active` set, only which document is shown changed.
   * `stamp` orders two seats' copies of one document (see the model store).
   */
  | (EventBase & { kind: 'model.revision'; docId: string; doc?: ModelDoc | null; active?: boolean; stamp: number })
  /**
   * ONE OBJECT OF THOUGHT, as a step left it — a part added to a scene, a row
   * operation — or as a look back along its history left it; `null` once it
   * is removed. Its steps are computed again on arrival (lib/objects/core.ts
   * sanitizeSpace), so nothing arrives claiming a state no step produced.
   */
  | (EventBase & { kind: 'object.step'; objId: string; obj: ThoughtObject | null; stamp: number });

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

// ── the model and object store ──────────────────────────────────────
//
// A model document and an object of thought are each one value per id, and a
// room has to agree on which copy of it is current whatever order the copies
// arrived in. So each id keeps ONE cell — the winning copy, and what it won by
// — and a copy replaces it only if it outranks it:
//
//   stamp   -1  the room's seed (what the session held when the room opened)
//            0  carried by a `map` event — an extraction's copy, the weakest
//               news there is: it may add a document the room lacks, or
//               update a seed or another map's copy, never more
//           ≥1  a `model.revision` or `object.step`: a person's own edit,
//               stamped past every stamp its sender had seen (nextStamp), so an
//               edit made after seeing another's always outranks it
//   by      the event id, which breaks a tie on the stamp the same way on
//           every seat
//
// The winner for an id is the highest (stamp, by) among every copy of it that
// was ever sent — a maximum, so the order they arrive in cannot change it, and
// two seats holding the same events hold the same documents. A deletion is a
// copy whose value is null: it wins or loses like any other, so a stale
// extraction (stamp 0) can never bring a deleted document back.
//
// The stamp rides in the event's PAYLOAD, not in `at`: the server stamps `at`
// with its own clock on the way out, so the sender and the receiver of one
// event would otherwise rank it differently.
//
// Order is fixed too: by the first event that ever mentioned the id (`intro`,
// the smallest event id, again a minimum), so the documents list the same way
// on both screens.

/** One document or object: the copy that is current, and what it won by. */
export interface PartCell<T> {
  value: T | null;
  /** -1 the seed, 0 a map's copy, ≥ 1 an edit's stamp */
  stamp: number;
  /** the id of the event that wrote it ('' for the seed) — breaks a tie on the stamp */
  by: string;
  /** the order key: the earliest event that ever mentioned this id */
  intro: string;
}

const outranks = (a: { stamp: number; by: string }, b: { stamp: number; by: string }): boolean =>
  a.stamp > b.stamp || (a.stamp === b.stamp && a.by > b.by);

/** Offer one copy for an id; it is kept only if it outranks what is there. */
function offer<T>(
  cells: Record<string, PartCell<T>>,
  id: string,
  value: T | null,
  stamp: number,
  by: string,
  intro: string = by
): Record<string, PartCell<T>> {
  const cur = cells[id];
  if (!cur) return { ...cells, [id]: { value, stamp, by, intro } };
  const first = intro < cur.intro ? intro : cur.intro;
  if (!outranks({ stamp, by }, cur)) return first === cur.intro ? cells : { ...cells, [id]: { ...cur, intro: first } };
  return { ...cells, [id]: { value, stamp, by, intro: first } };
}

/** The same rule for a single value — the document being shown, the picture. */
function offerOne<T>(cell: PartCell<T> | undefined, value: T | null, stamp: number, by: string): PartCell<T> {
  if (cell && !outranks({ stamp, by }, cell)) return cell;
  return { value, stamp, by, intro: cell?.intro ?? by };
}

const seedIntro = (i: number) => `!${String(i).padStart(4, '0')}`;

function seedParts(map: ThinkingMap | undefined): Pick<CollabState, 'docs' | 'objs' | 'active' | 'viz'> {
  const docs: Record<string, PartCell<ModelDoc>> = {};
  (map?.models?.docs ?? []).forEach((d, i) => {
    docs[d.id] = { value: d, stamp: -1, by: '', intro: seedIntro(i) };
  });
  const objs: Record<string, PartCell<ThoughtObject>> = {};
  (map?.objects?.objs ?? []).forEach((o, i) => {
    objs[o.id] = { value: o, stamp: -1, by: '', intro: seedIntro(i) };
  });
  return {
    docs,
    objs,
    ...(map?.models ? { active: { value: map.models.active, stamp: -1, by: '', intro: seedIntro(0) } } : {}),
    ...(map?.viz ? { viz: { value: map.viz, stamp: -1, by: '', intro: seedIntro(0) } } : {}),
  };
}

/** The live values of a store, in their fixed order. */
function liveOf<T>(cells: Record<string, PartCell<T>> | undefined): T[] {
  return Object.entries(cells ?? {})
    .filter(([, c]) => c.value !== null)
    .sort(([ia, a], [ib, b]) => (a.intro < b.intro ? -1 : a.intro > b.intro ? 1 : ia < ib ? -1 : ia > ib ? 1 : 0))
    .map(([, c]) => c.value as T);
}

/** The map with its documents, objects and picture as the store holds them. */
function partsInto(map: ThinkingMap, st: Pick<CollabState, 'docs' | 'objs' | 'active' | 'viz'>): ThinkingMap {
  const out: ThinkingMap = { ...map };
  // the newest DOC_CAP, as a workspace keeps them; the first MAX_OBJECTS, as a space keeps them
  const docs = liveOf(st.docs).slice(-DOC_CAP);
  if (docs.length) {
    const want = st.active ? st.active.value : undefined;
    // an explicit null is a choice (an answer drawn as a simulation); a name that is not here falls back to the newest
    const active = want === null ? null : want && docs.some((d) => d.id === want) ? want : docs[docs.length - 1].id;
    out.models = { docs, active };
  } else delete out.models;
  const objs = liveOf(st.objs).slice(0, MAX_OBJECTS);
  if (objs.length) out.objects = { objs };
  else delete out.objects;
  if (st.viz) {
    if (st.viz.value) out.viz = st.viz.value;
    else delete out.viz;
  }
  return out;
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
  /** model documents by id: the current copy of each, and what it won by */
  docs?: Record<string, PartCell<ModelDoc>>;
  /** objects of thought by id, the same way */
  objs?: Record<string, PartCell<ThoughtObject>>;
  /** which document is shown (`value` is its id, or null by choice), and what set it */
  active?: PartCell<string>;
  /** the picture, and the map event that drew it */
  viz?: PartCell<NonNullable<ThinkingMap['viz']>>;
  /** the highest stamp this client has seen: its next edit is stamped past it */
  clock?: number;
}

/**
 * The stamp for an edit made here now: past every stamp this client has seen,
 * so it outranks every copy it was looking at when it made it — and the wall
 * clock otherwise, so two seats editing at once are ordered by when.
 */
export function nextStamp(state: Pick<CollabState, 'clock'> | null | undefined, now: number = Date.now()): number {
  return Math.max(Math.floor(now), Math.floor(state?.clock ?? 0) + 1, 1);
}

/** The room's current copy of a model document, or of an object — and what it won by. */
export function partOf(state: CollabState | null | undefined, kind: 'doc', id: string): PartCell<ModelDoc> | null;
export function partOf(state: CollabState | null | undefined, kind: 'obj', id: string): PartCell<ThoughtObject> | null;
export function partOf(state: CollabState | null | undefined, kind: 'doc' | 'obj', id: string): PartCell<unknown> | null {
  if (!state) return null;
  return (kind === 'doc' ? state.docs?.[id] : state.objs?.[id]) ?? null;
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
    ...seedParts(session?.map),
    clock: 0,
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
 *  - a whole-map event replaces the extractor's nodes, keeping any `by` the
 *    extractor dropped, because the extractor does not know who said what —
 *    and only ADDS the documents, objects and picture it carries;
 *  - a model document or an object of thought is one copy per id, the one
 *    with the highest (stamp, event id) — see the model store above.
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
        return { ...base, present, session: ev.session!, cells: seedCells(ev.session!.map), ...seedParts(ev.session!.map) };
      }
      return { ...base, present };
    }
    case 'bye':
      return { ...base, present: state.present.filter((p) => p.id !== ev.by.id) };
    case 'message': {
      if (!state.session) return base;
      // A message keeps the id it was made with; one sent before ids existed
      // takes its event's. The same message twice is one message.
      const id = ev.message.id ?? ev.id;
      if (state.session.messages.some((m) => m.id === id)) return base;
      // A person's turn is signed by whoever sent it. Socria's answer is
      // Socria's: the event's author is the person it answers, which the
      // answer carries as what it replies to — never as a name over its words.
      const { by: _signed, ...words } = ev.message;
      const message: LogosMsg = ev.message.role === 'assistant' ? { ...words, id } : { ...words, id, by: ev.by };
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
      // THE DOCUMENTS, OBJECTS AND PICTURE IT CARRIES ARE OFFERED, NOT IMPOSED.
      // This used to take the event's copies wholesale, so an extraction that
      // carried no model erased the other seat's, and one that carried an
      // older copy rolled back the other seat's slider. A map's copy ranks
      // below any person's edit (stamp 0): it adds what the room lacks and
      // replaces nothing a person changed; what it leaves out stays.
      let docs = state.docs ?? {};
      (ev.map.models?.docs ?? []).forEach((d, i) => {
        docs = offer(docs, d.id, d, 0, ev.id, `${ev.id}:${String(i).padStart(2, '0')}`);
      });
      let objs = state.objs ?? {};
      (ev.map.objects?.objs ?? []).forEach((o, i) => {
        objs = offer(objs, o.id, o, 0, ev.id, `${ev.id}:${String(i).padStart(2, '0')}`);
      });
      const active = ev.map.models ? offerOne(state.active, ev.map.models.active, 0, ev.id) : state.active;
      const viz = ev.map.viz ? offerOne(state.viz, ev.map.viz, 0, ev.id) : state.viz;
      const parts = { docs, objs, active, viz };
      return {
        ...base,
        cells,
        ...parts,
        session: { ...state.session, map: partsInto(deriveMap(ev.map, cells, state.edits, state.removed), parts), updatedAt: ev.at },
      };
    }
    case 'model.revision': {
      if (!state.session) return base;
      const clock = Math.max(state.clock ?? 0, ev.stamp);
      const docs = ev.doc !== undefined ? offer(state.docs ?? {}, ev.docId, ev.doc ? { ...ev.doc, id: ev.docId } : null, ev.stamp, ev.id) : (state.docs ?? {});
      const active = ev.active ? offerOne(state.active, ev.docId, ev.stamp, ev.id) : state.active;
      const parts = { docs, objs: state.objs, active, viz: state.viz };
      return { ...base, ...parts, clock, session: { ...state.session, map: partsInto(state.session.map, parts), updatedAt: ev.at } };
    }
    case 'object.step': {
      if (!state.session) return base;
      const clock = Math.max(state.clock ?? 0, ev.stamp);
      const objs = offer(state.objs ?? {}, ev.objId, ev.obj ? { ...ev.obj, id: ev.objId } : null, ev.stamp, ev.id);
      const parts = { docs: state.docs, objs, active: state.active, viz: state.viz };
      return { ...base, ...parts, clock, session: { ...state.session, map: partsInto(state.session.map, parts), updatedAt: ev.at } };
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

/** The most names a shared line of thinking hands the model at once. */
export const GROUP_MAX = 8;

/** "Ana", "Ana and Ben", "Ana, Ben and Chloe" */
function nameList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The block appended to the Logos system prompt when two or more people are
 * present — the two seats of a room, or everyone in a shared line of thinking.
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
  const named = people.slice(0, GROUP_MAX).map((p) => p.name).filter(Boolean);
  if (named.length < 2) return '';
  const count = named.length === 2 ? 'TWO PEOPLE ARE' : `${named.length} PEOPLE ARE`;
  const them = named.length === 2 ? 'them' : 'them all';
  return `

${count} THINKING HERE TOGETHER: ${nameList(named)}. Every message from a person is prefixed with their name, so you always know who said what. They also talk to each other here; you speak only when one of them asks you to.

You are the shared reasoning layer between ${them} — not a third voice in the discussion, and not a referee. Your whole job is to make what is between them visible:
- CONNECTIONS: where something one of them said bears on something another said, say so, naming both.
- DISAGREEMENTS: where they differ, say plainly what each is claiming and what each would have to believe for their claim to hold. Make the disagreement precise. Do not resolve it.
- ASSUMPTIONS: what one of them is taking for granted that another has not examined — name it and ask whether it is shared.
- QUESTIONS: the question none of them has asked yet, if there is one.

Address them by name when it matters who said what. Never take a side. Never conclude for them, and never tell them who is right — that judgment is theirs, and the point of their being here together is to reach it themselves. Keep it short; other people are waiting to speak.`;
}

/**
 * Appended after collabBlock when one person asked Socria directly — by
 * mentioning @socria, or by replying to something Socria said. The person's
 * name has been cleaned like every name from a browser; the rest is fixed
 * text, so nothing a person typed can speak as an instruction here.
 */
export function addressedBlock(a: { name: string; how: 'mention' | 'reply' }): string {
  const asked =
    a.how === 'reply'
      ? `${a.name} is replying to something you said earlier (it is quoted at the start of their message).`
      : `${a.name} asked you directly (with @socria).`;
  return `

THIS MESSAGE IS FOR YOU. ${asked} Answer ${a.name}: take up what they actually asked, plainly and first, the way someone in the group who was asked would — then, only if it helps, what it connects to in what the others have said. Do not answer the others' messages unless ${a.name} asks you to. Everything above still holds: never take a side between them.`;
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
  return `${origin.replace(/\/$/, '')}/chat?model=logos-3&join=${encodeURIComponent(code)}`;
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
