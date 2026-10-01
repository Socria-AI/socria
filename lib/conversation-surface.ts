// lib/conversation-surface.ts
//
// A CONVERSATION IS NOT A CORE CHAT OR A LOGOS SESSION. IT IS A CONVERSATION.
//
// WHAT WAS WRONG. `conversations.kind` was a GATE. LogosApp loaded
// `.filter(c => c.kind === 'logos')`, so a conversation that began in Core was
// invisible to Logos — not merely unopened there, absent — and the only way
// back out of Logos was `lastCoreModel()`, which abandoned whatever you were
// reading and dropped you in Core on a different conversation. Somebody wrote
// four model specifications into Core chats; none of them could be opened on
// the surface that draws models, and nothing on screen explained why.
//
// lib/session-rail.ts had already reached the right answer for the RAIL — "the
// split is by whether there IS a map, not by which surface made it; the surface
// is an implementation detail of how it started" — and the loader never got the
// message. This is that same rule, applied to opening rather than to filing.
//
// SO `kind` STOPS BEING A GATE AND BECOMES A MEMORY: where this conversation
// was last left. Both surfaces list all of them; picking a model MOVES the one
// you are in, keeping its messages; and coming back to it later opens it where
// you left it. That is what a model switcher is, and it is the thing the picker
// has looked like it did since it was built.
//
// WHAT MOVING COSTS. Nothing, except once: a conversation arriving in Logos
// with no map owes one extraction over the history it already has, so the map
// reflects what was actually said rather than starting blank under a thread
// that has been going for twenty turns. `owesExtraction` says when, and says it
// once — a map with nodes is never re-extracted, because that would overwrite
// what somebody had drawn by hand.
//
// PURE. No fetch, no storage, no React.

/** Where a conversation was last left. The stored `kind` column. */
export type Surface = 'logos' | 'chat';

/** The least a conversation has to expose to be placed. */
export interface Placeable {
  /** the stored `kind`; absent on rows written before the column existed */
  kind?: string | null;
  /** its Thinking Map, when it has one */
  map?: { nodes?: unknown[] } | null;
  /** the turns so far */
  messages?: unknown[] | null;
}

/** What a model needs to expose for the switcher to route it. */
export interface ModelFacts {
  logosSurface?: boolean;
}

/**
 * Which surface a conversation opens on when nobody has chosen.
 *
 * `chat` for anything unmarked, which is also what the database defaults to —
 * so a row written before any of this existed opens where it always did.
 */
export function surfaceOf(c: Placeable): Surface {
  return c.kind === 'logos' ? 'logos' : 'chat';
}

/** Which surface a chosen model belongs to. */
export function surfaceForModel(m: ModelFacts | undefined): Surface {
  return m?.logosSurface ? 'logos' : 'chat';
}

/**
 * Does opening this conversation with this model move it?
 *
 * The question the picker asks on every change, and the answer is usually no:
 * picking Core 4 while reading a Core conversation moves nothing, it just
 * changes which engine answers next.
 */
export function moves(c: Placeable, m: ModelFacts | undefined): boolean {
  return surfaceOf(c) !== surfaceForModel(m);
}

/**
 * The conversation after the move — the `kind` and nothing else.
 *
 * MESSAGES, TITLE, MAP, DRAFT AND CONTEXTS ARE UNTOUCHED, and that is the
 * whole point: moving a conversation between surfaces is a change of where it
 * opens, not a change of what it is. A move that rewrote the thread would be a
 * conversion, and a conversion somebody triggered by brushing a dropdown is
 * data loss with a friendly name.
 */
export function moved<T extends Placeable>(c: T, m: ModelFacts | undefined): T {
  const to = surfaceForModel(m);
  return surfaceOf(c) === to ? c : { ...c, kind: to };
}

/** Has anything been said in this conversation yet? */
export function hasHistory(c: Placeable): boolean {
  return Array.isArray(c.messages) && c.messages.length > 0;
}

/** Does it already carry a map? */
export function hasMap(c: Placeable): boolean {
  return Array.isArray(c.map?.nodes) && (c.map?.nodes?.length ?? 0) > 0;
}

/**
 * Is a map owed over the history this conversation already has?
 *
 * TRUE EXACTLY ONCE PER CONVERSATION, and only where it would say something: a
 * thread arriving on the map surface with turns behind it and nothing drawn.
 *
 * NOT when a map already exists — re-extracting would overwrite nodes somebody
 * moved, renamed or deleted by hand, and the extractor has no way to know which
 * of them were theirs. NOT for an empty conversation either: there is nothing
 * to extract from, and the ordinary turn-by-turn extraction will do it the
 * moment anything is said.
 */
export function owesExtraction(c: Placeable, m: ModelFacts | undefined): boolean {
  return surfaceForModel(m) === 'logos' && hasHistory(c) && !hasMap(c);
}

/**
 * What to tell somebody when a conversation moves under them.
 *
 * SAID, NOT SILENT. A thread jumping from one surface to another is the most
 * disorienting thing the picker can do, and the person who pressed it may have
 * been browsing models rather than asking for a move. One line, naming what
 * happened and what it did not touch.
 */
export function moveNote(c: Placeable, m: ModelFacts | undefined): string | null {
  if (!moves(c, m)) return null;
  const to = surfaceForModel(m);
  if (to === 'logos') {
    return hasHistory(c)
      ? owesExtraction(c, m)
        ? 'Opened here with everything you already said — the map is being drawn from it now.'
        : 'Opened here with everything you already said, and the map you had.'
      : 'Opened here. Nothing has been said yet, so the map starts where you do.';
  }
  return hasMap(c)
    ? 'Back in the conversation. The map is kept and is waiting on the other surface.'
    : 'Back in the conversation.';
}
