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

/**
 * Should the rail offer a search box and a filter chip at all?
 *
 * The same threshold the tab bar uses, for the same reason: a search box over
 * four rows is furniture, and a person who can see every session they have
 * does not need to filter them. Unlike the tabs this does NOT require both
 * kinds to be present — typing a word is useful in a list of twelve chats
 * with no map between them, where a Maps tab would only ever be empty. The
 * caller hides the chip on its own when there is nothing for it to keep.
 */
export function shouldShowSearch(items: readonly RailItem[]): boolean {
  return items.length >= TABS_WORTH_SHOWING;
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

// ── when it was last touched ────────────────────────────────────────
//
// THE GROUPS. Ordering by recency already puts the newest row on top, but it
// does not tell you WHERE in your week a row sits — and "was that yesterday or
// three weeks ago" is the question people actually ask a session list. Three
// headings answer it without asking anyone to read a date: today, the week
// around today, and everything behind that.
//
// Three and no more, on purpose. A heading per day turns a list of twelve into
// a list of twelve headings; a heading per month is a filing cabinet. These
// three are the distinctions a person makes out loud.

export type SessionGroup = 'Today' | 'This week' | 'Earlier';

export const SESSION_GROUPS: SessionGroup[] = ['Today', 'This week', 'Earlier'];

/** A day, in milliseconds. Used only to walk back from the start of today. */
const DAY = 86_400_000;

/**
 * Which heading a timestamp belongs under.
 *
 * "Today" is the calendar day, not the last 24 hours: something touched at
 * 11pm last night is yesterday to the person who touched it, however few hours
 * ago that was. "This week" is the six days before today — so the boundary
 * moves with the clock rather than with a week number, and nothing ever
 * appears to jump backwards on a Monday morning.
 *
 * A timestamp in the future files under Today. Clock skew between a device and
 * the server is ordinary, and burying somebody's newest session under
 * "Earlier" because their laptop is ninety seconds fast is the worse failure.
 */
export function groupOf(updatedAt: number, now: number = Date.now()): SessionGroup {
  if (!Number.isFinite(updatedAt)) return 'Earlier';
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (updatedAt >= startOfToday) return 'Today';
  if (updatedAt >= startOfToday - 6 * DAY) return 'This week';
  return 'Earlier';
}

/** The only other thing a row must expose to be grouped or searched. */
export interface RailRow extends RailItem {
  title?: string;
  updatedAt?: number;
}

/**
 * The rows, under their headings, in the order they arrived.
 *
 * Empty groups are dropped rather than rendered empty: a heading with nothing
 * under it is a promise the list did not keep. The input order is preserved
 * inside each group, so whatever sort the caller applied still holds.
 */
export function groupRail<T extends RailRow>(
  items: readonly T[],
  now: number = Date.now()
): { group: SessionGroup; items: T[] }[] {
  const buckets = new Map<SessionGroup, T[]>();
  for (const item of items) {
    const g = groupOf(item?.updatedAt ?? NaN, now);
    const bucket = buckets.get(g);
    if (bucket) bucket.push(item);
    else buckets.set(g, [item]);
  }
  return SESSION_GROUPS.filter((g) => buckets.get(g)?.length).map((g) => ({
    group: g,
    items: buckets.get(g) as T[],
  }));
}

// ── searching the rail ──────────────────────────────────────────────

/**
 * Does this row match what was typed?
 *
 * Case-folded substring, and nothing cleverer. A session list is short enough
 * that fuzzy matching only ever surprises people — somebody typing "berlin"
 * wants the Berlin row, and a scorer that also returns "Brentwood" has made
 * the search worse. An empty query matches everything, so the caller does not
 * have to special-case "nothing typed yet".
 */
export function matchesQuery(item: RailRow, query: string): boolean {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return true;
  return (item?.title ?? '').toLowerCase().includes(q);
}

/**
 * The rows a search box and a "maps only" chip leave standing.
 *
 * Both filters are conjunctive and both are optional, which is what lets the
 * caller render one count — "4 of 12" — that means the same thing however many
 * of the two are on.
 */
export function searchRail<T extends RailRow>(
  items: readonly T[],
  query: string,
  mapsOnly = false
): T[] {
  return items.filter((i) => (!mapsOnly || hasMap(i)) && matchesQuery(i, query));
}
