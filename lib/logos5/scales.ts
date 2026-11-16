// lib/logos5/scales.ts — HOW MUCH OF THE UNIVERSAL MAP IS SHOWN: Today, Week, Month, All Time.
//
// One map, four temporal scales. A scale decides which conversations belong on the map; where each one is
// never depends on it (lib/logos5/bubbles.ts lays the whole map out once, from every conversation, and a scale
// only says which of them are lit). So Today is the smallest part of the same universe, and each wider scale
// shows more of it without moving what was already there.
//
// The scales go by ACTIVITY in the person's own time zone (the browser's local calendar):
//   Today      what had activity on this local calendar day
//   Week       ... in the rolling seven days that end today (today and the six days before)
//   Month      ... in the rolling thirty days that end today
//   All Time   everything there is
// "Activity" is the last time something happened in the conversation (Tile.at), never earlier than when it was
// begun. Each window starts at a local midnight and the later ones contain the earlier, so
// Today ⊆ Week ⊆ Month ⊆ All Time, always. A conversation from the future (a clock that ran fast) is in every
// scale, rather than in none.
//
// PURE. No clock: the time is passed in.

export type Scale = 'today' | 'week' | 'month' | 'all';

/** Narrowest first: each contains the one before it. */
export const SCALES: readonly Scale[] = ['today', 'week', 'month', 'all'];

/** The words on the selector, and a shorter form where room is short. */
export const SCALE_SAID: Record<Scale, { long: string; short: string }> = {
  today: { long: 'Today', short: 'Today' },
  week: { long: 'Week', short: 'Week' },
  month: { long: 'Month', short: 'Month' },
  all: { long: 'All Time', short: 'All' },
};

/** How many local days back each window reaches before today (Today: none). */
const DAYS_BACK: Record<Exclude<Scale, 'all'>, number> = { today: 0, week: 6, month: 29 };

/**
 * Where a scale begins, as a time: local midnight today, six days before, or twenty-nine days before;
 * -Infinity for All Time. Counted in calendar days, so a change to or from summer time inside the window
 * neither adds nor takes away a day.
 */
export function scaleFrom(scale: Scale, now: number): number {
  if (scale === 'all') return -Infinity;
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - DAYS_BACK[scale], 0, 0, 0, 0).getTime();
}

/** When a conversation was last active, as the scales read it: never before it was begun. */
export const activityOf = (t: { at: number; started?: number }): number => Math.max(t.at || 0, t.started || 0);

/** Is it on the map at this scale? */
export function inScale(t: { at: number; started?: number }, scale: Scale, now: number): boolean {
  return scale === 'all' || activityOf(t) >= scaleFrom(scale, now);
}

/** The narrowest scale it is on: where a search sends the map to show it. */
export function scaleOf(t: { at: number; started?: number }, now: number): Scale {
  for (const s of SCALES) if (inScale(t, s, now)) return s;
  return 'all';
}

/** Is one scale at least as wide as another? */
export const covers = (wide: Scale, narrow: Scale): boolean => SCALES.indexOf(wide) >= SCALES.indexOf(narrow);

/** How many are on the map at each scale (cumulative: each count includes the narrower ones). */
export function scaleCounts(tiles: readonly { at: number; started?: number }[], now: number): Record<Scale, number> {
  const from = { today: scaleFrom('today', now), week: scaleFrom('week', now), month: scaleFrom('month', now) };
  const out: Record<Scale, number> = { today: 0, week: 0, month: 0, all: tiles.length };
  for (const t of tiles) {
    const a = activityOf(t);
    if (a >= from.month) out.month++;
    if (a >= from.week) out.week++;
    if (a >= from.today) out.today++;
  }
  return out;
}

/** The ids on the map at a scale. */
export function idsInScale(tiles: readonly { id: string; at: number; started?: number }[], scale: Scale, now: number): Set<string> {
  const from = scaleFrom(scale, now);
  const out = new Set<string>();
  for (const t of tiles) if (scale === 'all' || activityOf(t) >= from) out.add(t.id);
  return out;
}

/** The next wider scale that would show more, or null when none would. */
export function widerWithMore(scale: Scale, counts: Record<Scale, number>): Scale | null {
  for (let i = SCALES.indexOf(scale) + 1; i < SCALES.length; i++) if (counts[SCALES[i]] > counts[scale]) return SCALES[i];
  return null;
}
