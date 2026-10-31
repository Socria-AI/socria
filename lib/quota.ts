// lib/quota.ts — THE FREE PLAN'S ALLOWANCES, SPENT ATOMICALLY (server only).
//
// lib/entitlements.ts says what each plan allows; this is where a route takes
// one of it. Two shapes:
//
//   claimUnit   a thing charged ONCE: a conversation, its Logic Map, an
//               artifact, a document. A marker row beside the month's count
//               remembers the thing, so a retried turn, a map redrawn or an
//               artifact saved again is never charged twice — and the check
//               and the charge are one statement (claim_logos_unit), so two
//               requests racing for the last free unit cannot both win.
//   consume     a count: the nodes a map gains. `upTo` takes what is left
//               rather than refusing outright — a map pass that would add
//               five nodes with three left keeps three.
//
// THE FALLBACK. The two functions are in supabase/schema.sql and are applied
// by hand (docs/FREEMIUM.md). Until they are, a deployment still counts —
// through the older read-then-bump path, which is right except under a race
// for the last unit — and says so in the log. Only when the usage table
// itself is missing does a limit go unenforced (as lib/usage.ts has always
// done: a person who cannot be checked is let through, never blocked by an
// outage), and that is logged as an error, not a warning, because it means
// the free plan is not being held.
//
// WHO IS COUNTED. Free accounts, against PLANS.free. Socria One is counted
// only where it has a fair-use ceiling (conversations); everything it holds
// unlimited is not written at all. A signed-out caller is never counted here:
// guests have their own, smaller pass (lib/guest-pass.ts).

import { supabaseAdmin } from './supabase';
import { limitOf, type Counter, type UnitCounter } from './entitlements';
import { chatMarkerScope } from './usage-scope';
import { monthKey, readUsage, bumpUsage } from './usage';
import type { Plan } from './socria-one';

export type Claim = { ok: true; used: number; limit: number | null; already: boolean } | { ok: false; used: number; limit: number };
export type Taken = { ok: boolean; granted: number; used: number; limit: number | null };

/**
 * The marker for one thing. A conversation keeps the marker it has always had
 * (`chatmark:`), so every conversation counted before these limits is still
 * known; the rest are new namespaces, never read as a month or a conversation
 * (lib/usage-scope.ts foldUsageRows reads a counter only from its home scope).
 */
export function unitMark(counter: UnitCounter, key: string): string {
  const k = key.replace(/\s+/g, ' ').slice(0, 120);
  if (counter === 'chats') return chatMarkerScope(k);
  return `${counter === 'maps' ? 'mapmark' : counter === 'artifacts' ? 'artmark' : 'docmark'}:${k}`;
}

const said = new Set<string>();
/** Once per instance per kind: the log says the free plan is not being held, without saying it on every request. */
function warnOnce(kind: string, message: string, error = false) {
  if (said.has(kind)) return;
  said.add(kind);
  (error ? console.error : console.warn)(message);
}

function missingFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return m.includes('42883') || m.includes('pgrst202') || (m.includes('function') && (m.includes('does not exist') || m.includes('could not find')));
}
function missingTable(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return m.includes('42p01') || m.includes('pgrst205') || (m.includes('relation') && m.includes('does not exist'));
}

/** Whether this plan counts this counter at all. */
function counted(plan: Plan, counter: Counter): number | null | undefined {
  const limit = limitOf(plan, counter);
  // unlimited on this plan: nothing to hold, nothing written
  if (limit === null) return undefined;
  return limit;
}

/**
 * Charge one thing against a monthly unit counter, or say it is already paid
 * for, or refuse it at the limit. Never charges twice for the same key.
 */
export async function claimUnit(userId: string | null, plan: Plan, counter: UnitCounter, key: string, at = Date.now()): Promise<Claim> {
  const limit = counted(plan, counter);
  if (!userId || limit === undefined || !key) return { ok: true, used: 0, limit: limit ?? null, already: false };
  const scope = monthKey(at);
  const mark = unitMark(counter, key);
  try {
    const { data, error } = await supabaseAdmin().rpc('claim_logos_unit', { p_user: userId, p_mark: mark, p_scope: scope, p_counter: counter, p_limit: limit, p_at: at });
    if (!error) {
      const used = await readUsage(userId, counter);
      if (data === 'refused') return { ok: false, used, limit: limit as number };
      return { ok: true, used, limit, already: data === 'already' };
    }
    if (!missingFunction(error)) {
      if (missingTable(error)) {
        warnOnce('table', '[quota] logos_usage is missing — free-plan limits are NOT being enforced (docs/FREEMIUM.md)', true);
        return { ok: true, used: 0, limit, already: false };
      }
      console.error('[quota] claim:', error.message);
      return { ok: true, used: 0, limit, already: false };
    }
    warnOnce('fn', '[quota] claim_logos_unit is not installed — counting without the atomic check (docs/FREEMIUM.md)');
  } catch (e) {
    console.error('[quota] claim failed:', e instanceof Error ? e.message : 'error');
    return { ok: true, used: 0, limit, already: false };
  }
  return fallbackClaim(userId, counter, mark, limit as number, at);
}

/** The pre-migration path: read the marker, read the count, bump both. Right except under a race for the last unit. */
async function fallbackClaim(userId: string, counter: UnitCounter, mark: string, limit: number, at: number): Promise<Claim> {
  try {
    const { data, error } = await supabaseAdmin().from('logos_usage').select('n').eq('user_id', userId).eq('scope', mark).eq('counter', counter).maybeSingle();
    if (error && missingTable(error)) {
      warnOnce('table', '[quota] logos_usage is missing — free-plan limits are NOT being enforced (docs/FREEMIUM.md)', true);
      return { ok: true, used: 0, limit, already: false };
    }
    const used = await readUsage(userId, counter);
    if (typeof data?.n === 'number' && data.n > 0) return { ok: true, used, limit, already: true };
    if (used >= limit) return { ok: false, used, limit };
    const next = await bumpUsage(userId, counter, null, 1);
    await supabaseAdmin().rpc('bump_logos_usage', { p_user: userId, p_scope: mark, p_counter: counter, p_by: 1, p_at: at });
    return { ok: true, used: next ?? used + 1, limit, already: false };
  } catch {
    return { ok: true, used: 0, limit, already: false };
  }
}

/** Undo a claim whose work failed (a first turn the model never answered). True when there was one to undo. */
export async function releaseUnit(userId: string | null, plan: Plan, counter: UnitCounter, key: string, at = Date.now()): Promise<boolean> {
  if (!userId || counted(plan, counter) === undefined || !key) return false;
  try {
    const { data, error } = await supabaseAdmin().rpc('release_logos_unit', { p_user: userId, p_mark: unitMark(counter, key), p_scope: monthKey(at), p_counter: counter, p_at: at });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Take `want` from a monthly count. With `upTo`, take what is left when that is
 * less (a map pass keeps the nodes there is room for); without it, all or none.
 */
export async function consume(userId: string | null, plan: Plan, counter: Counter, want: number, opts: { upTo?: boolean } = {}, at = Date.now()): Promise<Taken> {
  const limit = counted(plan, counter);
  if (want <= 0) return { ok: true, granted: 0, used: 0, limit: limit ?? null };
  if (!userId || limit === undefined) return { ok: true, granted: want, used: 0, limit: limit ?? null };
  const scope = monthKey(at);
  for (let attempt = 0; attempt < 2; attempt++) {
    const used = await readUsage(userId, counter);
    const left = Math.max(0, (limit as number) - used);
    const take = opts.upTo ? Math.min(want, left) : left >= want ? want : 0;
    if (take <= 0) return { ok: false, granted: 0, used, limit };
    try {
      const { data, error } = await supabaseAdmin().rpc('consume_logos_usage', { p_user: userId, p_scope: scope, p_counter: counter, p_by: take, p_limit: limit, p_at: at });
      if (!error) {
        // -1: another request took the room first — read again and try once more
        if (data === -1) continue;
        return { ok: take === want, granted: take, used: typeof data === 'number' ? data : used + take, limit };
      }
      if (missingFunction(error)) {
        warnOnce('fn', '[quota] consume_logos_usage is not installed — counting without the atomic check (docs/FREEMIUM.md)');
        const next = await bumpUsage(userId, counter, null, take);
        return { ok: take === want, granted: take, used: next ?? used + take, limit };
      }
      if (missingTable(error)) {
        warnOnce('table', '[quota] logos_usage is missing — free-plan limits are NOT being enforced (docs/FREEMIUM.md)', true);
        return { ok: true, granted: want, used: 0, limit };
      }
      console.error('[quota] consume:', error.message);
      return { ok: true, granted: want, used, limit };
    } catch {
      return { ok: true, granted: want, used, limit };
    }
  }
  const used = await readUsage(userId, counter);
  return { ok: false, granted: 0, used, limit };
}

/** What is left of a monthly count right now — for a pass that must stop short BEFORE it runs. */
export async function left(userId: string | null, plan: Plan, counter: Counter): Promise<{ left: number | null; used: number; limit: number | null }> {
  const limit = counted(plan, counter);
  if (!userId || limit === undefined) return { left: null, used: 0, limit: limit ?? null };
  const used = await readUsage(userId, counter);
  return { left: Math.max(0, (limit as number) - used), used, limit };
}

/** Whether this thing has already been charged — a conversation's Logic Map drawn earlier this month or before. */
export async function unitClaimed(userId: string | null, counter: UnitCounter, key: string): Promise<boolean> {
  if (!userId || !key) return false;
  try {
    const { data, error } = await supabaseAdmin().from('logos_usage').select('n').eq('user_id', userId).eq('scope', unitMark(counter, key)).eq('counter', counter).maybeSingle();
    if (error) return false;
    return typeof data?.n === 'number' && data.n > 0;
  } catch {
    return false;
  }
}
