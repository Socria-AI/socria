// lib/session-rail.ts
//
// What the rail needs to know: which tab a session belongs in, and what a
// person is allowed to rename it to.
//
// THE TABS. The rail used to be one list, deliberately: a chat and a line of
// thinking are the same thing to the person reading it — something they were
// working on — so they interleaved by when each was last touched, and the
// mark on the row said which surface opened it. That reasoning holds right up
// until the list is long. Twelve rows in, "which of these has the map I drew"
// is a question the ordering cannot answer, and scanning for a thumbnail is
// not a substitute for asking.
//
// So the split is by whether there IS a map, not by which surface made it. A
// line of thinking that never grew one belongs with the chats, because that is
// what it is; a Core conversation that did grow one belongs with the maps. The
// surface is an implementation detail of how it started, and filing by it
// would put two identical-looking rows in different tabs.
//
// THE RENAME. Titles have always been auto-suggested and always been
// overridable — the store carries `autoTitledAs` precisely so that a title the
// person set is never silently replaced. There was simply no way to set one.

export type SessionTab = 'all' | 'maps' | 'chats';

export const SESSION_TABS: { id: SessionTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'maps', label: 'Maps' },
  { id: 'chats', label: 'Chats' },
];

/** The only thing a row has to expose to be filed. */
export interface RailItem {
  /** how many nodes its map has; 0 or absent means it never grew one */
  nodes?: number;
}

/**
 * Has this session produced a map?
 *
 * One node is a map. It is a thin one, but it is the thing the Maps tab is
 * for, and a rule that waited for two would hide a session at exactly the
 * moment somebody went looking for it.
 */
export function hasMap(item: RailItem): boolean {
  return (item?.nodes ?? 0) > 0;
}

export function matchesTab(item: RailItem, tab: SessionTab): boolean {
  if (tab === 'all') return true;
  return tab === 'maps' ? hasMap(item) : !hasMap(item);
}

export function filterByTab<T extends RailItem>(items: readonly T[], tab: SessionTab): T[] {
  return items.filter((i) => matchesTab(i, tab));
}

/**
 * How many rows each tab would show.
 *
 * Used to hide the switcher entirely when it would not divide anything: a
 * person with four chats and no maps should not be given a Maps tab that
 * leads to an empty list, and a tab bar over three rows is furniture.
 */
export function tabCounts(items: readonly RailItem[]): Record<SessionTab, number> {
  let maps = 0;
  for (const i of items) if (hasMap(i)) maps++;
  return { all: items.length, maps, chats: items.length - maps };
}

/** Below this the switcher is noise; above it the list needs dividing. */
const TABS_WORTH_SHOWING = 6;

/**
 * Should the rail offer tabs at all?
 *
 * Both sides have to be non-empty — a switcher whose every option but one
 * leads to "nothing here" teaches people not to press it.
 */
export function shouldShowTabs(items: readonly RailItem[]): boolean {
  const c = tabCounts(items);
  return c.all >= TABS_WORTH_SHOWING && c.maps > 0 && c.chats > 0;
}

/** The longest a title may be. Past this it stops being a name. */
export const MAX_TITLE_LEN = 80;

/**
 * What a typed title becomes, or null if it is not a title.
 *
 * Null rather than a fallback on purpose: an empty rename means the person
 * changed their mind, and the honest response is to keep the name they had
 * rather than to invent "Untitled" and make them undo it.
 */
export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Newlines can arrive from a paste and would break a single-line row.
  const v = raw.replace(/\s+/g, ' ').trim();
  if (!v) return null;
  return v.length > MAX_TITLE_LEN ? v.slice(0, MAX_TITLE_LEN).trimEnd() : v;
}
