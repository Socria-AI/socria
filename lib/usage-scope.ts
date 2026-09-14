// lib/usage-scope.ts
//
// Where a usage row lives, and which rows may speak for which counter.
//
// Split out of usage.ts for one reason: usage.ts reaches the database, and the
// suite will not load a module that does. The logic that actually got this
// wrong is pure, so it lives here where a test can hold it.
//
// THE BUG THIS EXISTS TO PREVENT. The usage table is keyed
// (user, scope, counter). Two namespaces share it: the month, and the open
// conversation. The panel query asks for BOTH at once and folds them into one
// map — and the first version of that fold keyed the map by counter alone.
// So any two rows sharing a counter name overwrote each other, and the winner
// was whichever row the database happened to return last.
//
// That was not hypothetical. A per-conversation marker — written to record
// that a conversation had already been charged — used the counter name `chats`
// inside the `chat:<id>` namespace. `chats` is a MONTHLY counter. So the
// marker came back looking like the month's tally and replaced it, and the
// number the product uses to decide whether somebody has any chats left became
// a coin flip. Two fixes, both here: the marker gets a namespace of its own,
// and the fold refuses any row that is not in its counter's home scope — which
// also neutralises the markers already written before this was found.

import { COUNTER_SCOPE, type Counter } from './entitlements';

/** One row of the usage table, as the panel query returns it. */
export interface UsageRow {
  counter: string;
  scope: string;
  n: number;
}

/**
 * The per-conversation namespace.
 *
 * One definition, shared by the counters that live here and by the query that
 * reads them, so the two can never drift into disagreeing about the spelling.
 */
export function chatScopeFor(chatId: string): string {
  return `chat:${chatId.slice(0, 60)}`;
}

/**
 * The namespace for "this conversation has already been charged".
 *
 * The `chatmark:` prefix is load-bearing and must never become `chat:`. That
 * namespace belongs to the per-conversation counters and is read back for the
 * open conversation; a marker written into it is indistinguishable from a
 * tally. The suite holds these two apart.
 */
export function chatMarkerScope(sessionId: string): string {
  return `chatmark:${sessionId.slice(0, 60)}`;
}

/**
 * Fold the rows for the month AND the open conversation into one map.
 *
 * A row only speaks for a counter when it sits in that counter's OWN home
 * scope: monthly counters are read from the month, per-conversation counters
 * from the conversation. Anything else — a marker, a stale row, a counter a
 * later version writes and this one does not know — is skipped rather than
 * trusted, because the alternative is silently overwriting a real number with
 * an unrelated one.
 */
export function foldUsageRows(
  rows: readonly UsageRow[] | null | undefined,
  month: string,
  chatScope: string | null
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows ?? []) {
    if (!row || typeof row.counter !== 'string' || typeof row.scope !== 'string') continue;
    const declared = COUNTER_SCOPE[row.counter as Counter];
    if (!declared) continue;
    const home = declared === 'month' ? month : chatScope;
    if (!home || row.scope !== home) continue;
    if (typeof row.n !== 'number' || !Number.isFinite(row.n)) continue;
    out[row.counter] = row.n;
  }
  return out;
}
