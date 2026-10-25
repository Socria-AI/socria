import 'server-only';
// lib/mr/store.ts — MR's PERSISTENCE: the ledger and the person's settings.
//
// Two places, one responsibility each:
//
//   mr_ledger          the intervention ledger (lib/mr/ledger.ts): content-free
//                      rows of what each turn ran under, decided, and caught.
//                      Kept 180 days: never read past that, purged at write
//                      time and by the daily cron (purgeExpired), so a person
//                      who stops taking turns is not kept longer.
//   user_profiles.mr   the person's MR settings (MRSettings): MR on or off for
//                      them, whether a "from now on" may cross conversations,
//                      and when they last reset it — plus two content-free
//                      markers the server keeps: the "from now on" rules their
//                      words took back (revokedStanding), and the
//                      conversations whose rows were just deleted (forgotten).
//
// MR's state is folded from the transcript every turn (lib/mr/state.ts), so
// nothing here is needed to answer a turn. What IS needed is to know whether
// a read worked — the lesson of Core 4's off-the-record bug (lib/core4/
// store.ts loadState): a failed read must never look like "nothing there".
// So every function fails SOFT, never throws, and SAYS so with an ok flag;
// the caller decides what an unknown means, and for MR an unknown is always
// the more private answer (no write, no carried preference, MR off for the
// turn when their settings cannot be read).
//
// Every query is scoped with .eq('user_id', userId). Every record is
// re-sanitized on the way out as well as the way in, so a row written by an
// older build, or by hand, cannot carry words into a reply or a view. Log
// lines name a table and an error CODE, never a message: a Postgres error
// body can quote the query.
//
// Bounded: each call races a timeout (STORE_TIMEOUT_MS unless the caller
// gives one), the same pattern as Core 4's turn (lib/core4/turn.ts). A
// timed-out read is a failed read.

import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../supabase';
import { mergeForgotten, mergeRevocations, sanitizeSettings, type Revocation } from './adaptation';
import { LEDGER_RETENTION_MS, revocationsOf, sanitizeLedgerRow, standingInForce, type StandingTombstone } from './ledger';
import { DEFAULT_MR_SETTINGS, type LedgerKind, type LedgerRow, type MRSettings } from './types';

/** Every MR table, for account deletion, export and "forget what Socria worked out". */
export const MR_TABLES = ['mr_ledger'] as const;

/**
 * Ledger rows are operational data and do not outlive their usefulness:
 * 180 days (180 * 86_400_000 ms), the same window as Core 4's turn traces.
 * Defined in the pure module so the person's view can use it without a
 * database.
 */
export const MR_RETENTION_MS = LEDGER_RETENTION_MS;

const STORE_TIMEOUT_MS = 4000;
/** rows of this conversation a turn reads */
const TURN_ROWS = 60;
/** standing decisions from other conversations a turn considers */
const STANDING_ROWS = 20;
/** rows that record a revocation a turn reads, from each end (the newest and the earliest) */
const REVOCATION_ROWS = 200;
const COLS = 'user_id, id, conversation_id, turn, kind, policy_version, arm, record, created_at';

// ── failure, said once ───────────────────────────────────────────────

type DbError = { code?: string | null; message?: string | null } | null | undefined;

const tableMissing = (e: DbError) => !!e && (e.code === '42P01' || e.code === 'PGRST205');
const columnMissing = (e: DbError) => !!e && (e.code === '42703' || e.code === 'PGRST204');

const warned = new Set<string>();
function fail(where: string, e: DbError | unknown) {
  const err = e as { code?: string | null; name?: string } | null;
  const what = tableMissing(err as DbError) ? 'table missing — apply supabase/schema.sql' : columnMissing(err as DbError) ? 'column missing — apply supabase/schema.sql' : `error ${err?.code ?? err?.name ?? 'unknown'}`;
  const key = `${where}:${what}`;
  // a missing table or column fails every turn: say it once per process, not per turn
  if (!what.startsWith('error') && warned.has(key)) return;
  warned.add(key);
  console.error(`[socria/mr] ${where}: ${what}`);
}

const TIMED_OUT = Symbol('timed out');
async function bounded<T>(p: PromiseLike<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(p), new Promise<typeof TIMED_OUT>((r) => (timer = setTimeout(() => r(TIMED_OUT), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type Res<T = unknown> = { data: T | null; error: DbError };

// ── settings ─────────────────────────────────────────────────────────

const when = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/**
 * The stored jsonb as MRSettings, through the one bounded parser MR has
 * (lib/mr/adaptation.ts sanitizeSettings): strict types (the string "false"
 * is not false), defaults for anything else, the markers bounded.
 */
const settingsFrom = (raw: unknown): MRSettings => sanitizeSettings(raw);

/**
 * How a deleted conversation is remembered for the day its marker lives: a
 * hash of its key, so the settings never hold the id of a conversation that
 * is gone.
 */
export function forgottenKey(conversationKey: string): string {
  return createHash('sha256').update(`forgotten:${conversationKey}`).digest('hex').slice(0, 32);
}

const defaults = (): MRSettings => ({ ...DEFAULT_MR_SETTINGS });

type SettingsRead = { kind: 'ok'; raw: unknown; row: boolean; stamp: number | null } | { kind: 'missing' } | { kind: 'failed' };

async function readRaw(userId: string): Promise<SettingsRead> {
  try {
    const res = await bounded(
      supabaseAdmin().from('user_profiles').select('mr, updated_at').eq('user_id', userId).maybeSingle() as PromiseLike<Res<{ mr?: unknown; updated_at?: unknown }>>,
      STORE_TIMEOUT_MS
    );
    if (res === TIMED_OUT) return fail('user_profiles.mr', { code: 'timeout' }), { kind: 'failed' };
    if (res.error) {
      if (columnMissing(res.error)) return fail('user_profiles.mr', res.error), { kind: 'missing' };
      return fail('user_profiles.mr', res.error), { kind: 'failed' };
    }
    const stamp = Number(res.data?.updated_at);
    return { kind: 'ok', raw: res.data?.mr ?? null, row: !!res.data, stamp: res.data && res.data.updated_at != null && Number.isFinite(stamp) ? stamp : null };
  } catch (e) {
    fail('user_profiles.mr', e);
    return { kind: 'failed' };
  }
}

/**
 * Their MR settings. No row, or no `mr` yet: the defaults, ok. The column not
 * in the database: the defaults, ok, `missing` — nobody can have set anything
 * there. Any other error or a timeout: ok false, and the caller must not read
 * the defaults returned beside it as their choice (their "off" may be what
 * could not be read). `stamp` is the row's updated_at as read (null when
 * there is no row), so a reader can tell an older answer from a newer one.
 */
export async function readSettings(userId: string): Promise<{ ok: boolean; settings: MRSettings; missing?: boolean; stamp?: number | null; row?: boolean }> {
  const r = await readRaw(userId);
  if (r.kind === 'failed') return { ok: false, settings: defaults() };
  if (r.kind === 'missing') return { ok: true, settings: defaults(), missing: true };
  return { ok: true, settings: settingsFrom(r.raw), stamp: r.stamp, row: r.row };
}

/** Attempts at a settings write before giving up on a row that keeps changing under it. */
const WRITE_ATTEMPTS = 3;

/**
 * Change their settings: merged onto what is stored, the rest of their
 * profile row untouched (the write names only updated_at and mr, and
 * user_id when it makes the row).
 *
 * NEVER WRITES `research`. Participation is set by a study's consent flow,
 * not by this API and not by MR: whatever is stored is carried over as it
 * was read, and a `research` in the patch is ignored. If the current
 * settings cannot be read, nothing is written — a merge onto a guess could
 * turn their "off" back on.
 *
 * NOR WRITES OVER A CHANGE IT DID NOT SEE. The settings sheet flips its two
 * switches independently, so two writes can be in flight at once; a plain
 * read-merge-write lets the second put back the first one's old value — and
 * their "MR off" would be silently on again while both answered ok. So the
 * write is conditional on the row's updated_at being what was read (a
 * compare-and-set; a new row is an insert that fails if one appeared), and
 * on a conflict it reads again and merges again, a few times, then says it
 * could not.
 *
 * THE SERVER'S OWN MARKERS ride the same write, merged onto what was read
 * on every attempt so neither write can drop the other's: `revoke` adds
 * "from now on" rules their words took back (lib/mr/adaptation.ts
 * mergeRevocations — and when that changes nothing, nothing is written),
 * `forget` marks a conversation whose rows are being deleted, for a day. A
 * reset drops the revocations it makes moot. `stamp` is the updated_at this
 * write left, for the settings sheet to order answers by.
 */
export async function writeSettings(
  userId: string,
  patch: Partial<Pick<MRSettings, 'enabled' | 'carryAcross'>> & { resetAt?: number; revoke?: readonly Revocation[]; forget?: string }
): Promise<{ ok: boolean; settings?: MRSettings; missing?: boolean; stamp?: number }> {
  const asked = Date.now();
  const forget = typeof patch?.forget === 'string' && patch.forget ? { conversation: forgottenKey(patch.forget), at: asked } : null;
  const onlyMarkers = !!patch?.revoke && !('enabled' in patch) && !('carryAcross' in patch) && !('resetAt' in patch) && !forget;
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const cur = await readRaw(userId);
    if (cur.kind === 'missing') return { ok: false, missing: true };
    if (cur.kind === 'failed') return { ok: false };
    // a turn's revocation never makes their profile row: with none there is nothing carried to take back (a
    // "from now on" crosses only with carryAcross saved), and none may be an account deleted while it streamed
    if (onlyMarkers && !cur.row) return { ok: false, missing: true };
    const held = settingsFrom(cur.raw);
    const reset = when(patch?.resetAt);
    // a reset only ever moves forward
    const resetAt = reset !== null ? Math.max(reset, held.resetAt ?? 0) : held.resetAt;
    const revoked = mergeRevocations(held.revokedStanding ?? [], patch?.revoke ?? [], { now: asked, resetAt });
    const forgotten = mergeForgotten(held.forgotten ?? [], forget, asked);
    // their words taken back again, already on record: there is nothing to write
    if (onlyMarkers && !revoked.changed) return { ok: true, settings: held, ...(cur.stamp !== null ? { stamp: cur.stamp } : {}) };
    const next: MRSettings = {
      version: 1,
      enabled: typeof patch?.enabled === 'boolean' ? patch.enabled : held.enabled,
      carryAcross: typeof patch?.carryAcross === 'boolean' ? patch.carryAcross : held.carryAcross,
      research: held.research,
      resetAt,
      ...(revoked.list.length ? { revokedStanding: revoked.list } : {}),
      ...(forgotten.length ? { forgotten } : {}),
    };
    // strictly newer than what was read, so the next writer's condition cannot match a stale row
    const stamp = Math.max(Date.now(), (cur.stamp ?? 0) + 1);
    try {
      const table = supabaseAdmin().from('user_profiles');
      let q;
      if (!cur.row) q = table.insert({ user_id: userId, updated_at: stamp, mr: next });
      else {
        q = table.update({ mr: next, updated_at: stamp }, { count: 'exact' }).eq('user_id', userId);
        q = cur.stamp === null ? q.is('updated_at', null) : q.eq('updated_at', cur.stamp);
      }
      const res = await bounded(q as PromiseLike<Res & { count?: number | null }>, STORE_TIMEOUT_MS);
      if (res === TIMED_OUT) return fail('user_profiles.mr', { code: 'timeout' }), { ok: false };
      if (res.error) {
        // somebody made the row since the read: read it and merge again
        if (!cur.row && res.error.code === '23505') continue;
        fail('user_profiles.mr', res.error);
        return columnMissing(res.error) ? { ok: false, missing: true } : { ok: false };
      }
      // the row changed since the read: read it and merge again
      if (cur.row && res.count === 0) continue;
      return { ok: true, settings: next, stamp };
    } catch (e) {
      fail('user_profiles.mr', e);
      return { ok: false };
    }
  }
  fail('user_profiles.mr', { code: 'write_conflict' });
  return { ok: false };
}

// ── the ledger ───────────────────────────────────────────────────────

/**
 * Sanitized, this person's, not from before their last reset, and not older
 * than the retention window. A row stamped the same millisecond as the reset
 * counts as before it, as it does for the carry (lib/mr/adaptation.ts) and
 * the research export. Expired rows are filtered in the query too, so they
 * cannot take a page's place; this is the same rule again, for a row the
 * query let through.
 */
function keep(data: unknown, userId: string, resetAt: number | null | undefined, cutoff: number): LedgerRow[] {
  const out: LedgerRow[] = [];
  let dropped = 0;
  for (const raw of Array.isArray(data) ? data : []) {
    const r = sanitizeLedgerRow(raw);
    if (!r || r.user_id !== userId) {
      dropped++;
      continue;
    }
    if (typeof resetAt === 'number' && r.created_at <= resetAt) continue;
    if (r.created_at < cutoff) continue;
    out.push(r);
  }
  if (dropped) console.warn(`[socria/mr] mr_ledger: dropped ${dropped} row(s) that did not sanitize`);
  return out;
}

/** The oldest a row may be and still be read: the retention window, back from now. */
const cutoffAt = (now = Date.now()) => now - MR_RETENTION_MS;

const oldestFirst = (a: LedgerRow, b: LedgerRow) => a.turn - b.turn || a.created_at - b.created_at;

/**
 * What a turn reads: this conversation's latest 60 rows (oldest first), and —
 * only with their consent to carry preferences across (carryAcross) — the
 * standing decisions of their OTHER conversations that are still in force.
 * Nothing older than the retention window is read.
 *
 * ok is the conversation read. A table that is not there, an error or a
 * timeout is ok false with nothing in it, and the caller treats the turn as
 * one it cannot persist. A standing read that fails is standingOk false with
 * no standing rows: a preference not carried is the safe way to be wrong.
 * (standingOk is always present on what this returns; it is optional in the
 * type only so a caller's own timeout fallback need not spell it.)
 *
 * "Still in force" for a standing decision (lib/mr/ledger.ts standingInForce)
 * is the most recent exposure row of its conversation listing it as active,
 * AND no revocation of the same rule since — on an exposure row in any
 * conversation ("you can ask me questions again", said in the conversation
 * it was carried into, ends it for the next one too), or in their settings
 * (revokedStanding: the same, after that conversation is deleted) — AND its
 * conversation not one kept to itself (`local`, on its decision or on any
 * exposure row since). Without the first row it is not carried, and a
 * revocation read that fails carries nothing: a revoked "from now on" must
 * not come back because its revocation could not be seen.
 *
 * `revokedStanding`: the revocations in their settings, when the caller has
 * already read them; otherwise they are read here, alongside the rows that
 * need them, only when there is a candidate at all.
 */
export async function loadForTurn(
  userId: string,
  conversationKey: string | null,
  o: { timeoutMs: number; carryAcross: boolean; resetAt?: number | null; revokedStanding?: readonly StandingTombstone[] }
): Promise<{ ok: boolean; rows: LedgerRow[]; standing: LedgerRow[]; standingOk?: boolean }> {
  const none = { ok: false, rows: [] as LedgerRow[], standing: [] as LedgerRow[], standingOk: false };
  const work = async () => {
    const db = supabaseAdmin();
    const cutoff = cutoffAt();
    const here: PromiseLike<Res<unknown[]>> = conversationKey
      ? (db
          .from('mr_ledger')
          .select(COLS)
          .eq('user_id', userId)
          .eq('conversation_id', conversationKey)
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(TURN_ROWS) as PromiseLike<Res<unknown[]>>)
      : Promise.resolve({ data: [], error: null });
    const standingP: PromiseLike<Res<unknown[]>> = o.carryAcross
      ? (db
          .from('mr_ledger')
          .select(COLS)
          .eq('user_id', userId)
          .eq('kind', 'decision')
          .like('record->scope->>kind', 'standing')
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(STANDING_ROWS) as PromiseLike<Res<unknown[]>>)
      : Promise.resolve({ data: [], error: null });
    const [a, b] = await Promise.all([here, standingP]);
    if (a.error) {
      fail('mr_ledger', a.error);
      return none;
    }
    const rows = keep(a.data, userId, o.resetAt, cutoff).sort(oldestFirst);
    if (!o.carryAcross) return { ok: true, rows, standing: [], standingOk: true };
    if (b.error) {
      fail('mr_ledger', b.error);
      return { ok: true, rows, standing: [], standingOk: false };
    }
    const candidates = keep(b.data, userId, o.resetAt, cutoff).filter(
      (r) => r.conversation_id !== null && r.conversation_id !== conversationKey && (r.record.scope as { kind?: string } | undefined)?.kind === 'standing' && r.record.local !== true
    );
    if (!candidates.length) return { ok: true, rows, standing: [], standingOk: true };
    const convs = [...new Set(candidates.map((r) => r.conversation_id as string))];
    // The turns, anywhere, at which their words had ended something (the rows
    // that carry `revoked`): the newest, so a revocation since is seen, AND the
    // earliest, because every later row of that conversation only says it
    // again, and when it was said is the time of the first (lib/mr/ledger.ts
    // endsOf). Reading only the rows after a candidate would date a revocation
    // said before it by a row written after it, and end a "from now on" they
    // said since.
    const revocations = (ascending: boolean) =>
      db.from('mr_ledger').select(COLS).eq('user_id', userId).eq('kind', 'exposure').like('record->>revoked', '%').gte('created_at', cutoff).order('created_at', { ascending }).limit(REVOCATION_ROWS);
    const [ex, rvNew, rvOld, st] = (await Promise.all([
      // the latest exposures of the conversations they were made in
      db.from('mr_ledger').select(COLS).eq('user_id', userId).eq('kind', 'exposure').in('conversation_id', convs).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(200),
      revocations(false),
      revocations(true),
      o.revokedStanding ? Promise.resolve(null) : readRaw(userId),
    ])) as [Res<unknown[]>, Res<unknown[]>, Res<unknown[]>, SettingsRead | null];
    if (ex.error || rvNew.error || rvOld.error) {
      fail('mr_ledger', ex.error ?? rvNew.error ?? rvOld.error);
      return { ok: true, rows, standing: [], standingOk: false };
    }
    const rv = { data: [...new Map([...(rvOld.data ?? []), ...(rvNew.data ?? [])].map((x) => [(x as { id?: unknown })?.id, x] as const)).values()] };
    // their revocations could not be read: carry nothing rather than something they took back
    if (st && st.kind === 'failed') return { ok: true, rows, standing: [], standingOk: false };
    const tombstones = o.revokedStanding ?? (st && st.kind === 'ok' ? settingsFrom(st.raw).revokedStanding ?? [] : []);
    const standing = standingInForce(candidates, keep(ex.data, userId, o.resetAt, cutoff), keep(rv.data, userId, o.resetAt, cutoff), tombstones);
    return { ok: true, rows, standing, standingOk: true };
  };
  try {
    const r = await bounded(work(), o.timeoutMs);
    if (r === TIMED_OUT) return fail('mr_ledger', { code: 'timeout' }), none;
    return r;
  } catch (e) {
    fail('mr_ledger', e);
    return none;
  }
}

/**
 * Write a turn's rows, after the reply (the route puts this in waitUntil).
 * A row is refused when it is not this person's or its record does not
 * sanitize; the rest are upserted by (user_id, id) — the ids are
 * deterministic, so the same turn written twice is one row. Then this
 * person's rows older than the retention window are purged, once. Never
 * throws; a failure is one content-free log line and one turn of ledger lost.
 *
 * WHAT THEY HAVE SINCE ASKED TO BE FORGOTTEN IS NOT WRITTEN BACK. The turn
 * began before the reply, and a reset, a "forget what Socria worked out" or
 * a conversation delete can land in between; the rows it then writes would
 * put back what they were just told is gone. So their settings are read
 * first (after the reply, so it costs them no time), and a row recorded at
 * or before their last reset, or of a conversation deleted after the row was
 * recorded (`forgotten`), is not written. Settings that cannot be read write
 * nothing: whether they asked cannot be known, and a turn of ledger lost is
 * the smaller harm. And they are read once more after the write: every one
 * of those requests marks their settings BEFORE it deletes, so one that lands
 * between the first read and the write is either seen now — and what it
 * covers is deleted again here — or its delete runs after this write and
 * removes the rows itself.
 *
 * A "FROM NOW ON" THEIR WORDS TOOK BACK is also kept in their settings
 * (revokedStanding), so that it outlives the conversation they said it in.
 * Recording it can fail without failing the rows.
 */
export async function writeRows(userId: string, rows: readonly LedgerRow[], now: number, o: { hadProfile?: boolean } = {}): Promise<void> {
  try {
    const good = new Map<string, LedgerRow>();
    let refused = 0;
    for (const r of rows ?? []) {
      const c = r && r.user_id === userId ? sanitizeLedgerRow(r) : null;
      if (c) good.set(c.id, c);
      else refused++;
    }
    if (refused) console.warn(`[socria/mr] mr_ledger: refused ${refused} row(s) on write`);
    const db = supabaseAdmin();
    if (good.size) {
      const st = await readRaw(userId);
      if (st.kind === 'failed') return fail('mr_ledger', { code: 'settings_unread_nothing_written' });
      // their profile was there when the turn began and is gone now: the account was deleted while it streamed
      if (o.hadProfile && st.kind === 'ok' && !st.row) return void console.info('[socria/mr] mr_ledger: nothing written (the account was deleted during the turn)');
      const held = st.kind === 'ok' ? settingsFrom(st.raw) : defaults();
      const withheld = coveredBy(held, [...good.values()]);
      for (const r of withheld) good.delete(r.id);
      if (withheld.length) console.info(`[socria/mr] mr_ledger: ${withheld.length} row(s) not written (recorded before a reset or a delete)`);
      if (good.size) {
        // A revocation is their choice, not the turn's content: it goes into
        // their settings FIRST, so a ledger write that fails cannot lose it
        // (already on record — the usual case for one said again — writes nothing).
        // (only what was said at this turn: one a row says again is already on record, or was said before a
        // reset, which keeps it from crossing — written now, it would be dated now)
        const revoke: Revocation[] = revocationsOf([...good.values()]).filter((x) => !x.reasserted);
        if (revoke.length && st.kind === 'ok') await writeSettings(userId, { revoke });
        const res = await bounded(db.from('mr_ledger').upsert([...good.values()], { onConflict: 'user_id,id' }) as PromiseLike<Res>, STORE_TIMEOUT_MS);
        if (res === TIMED_OUT) return fail('mr_ledger', { code: 'timeout' });
        if (res.error) return fail('mr_ledger', res.error);
        // asked again: a reset or a forget that landed between the read and the write
        const again = await readRaw(userId);
        if (again.kind === 'failed') fail('mr_ledger', { code: 'settings_unread_after_write' });
        const late = again.kind === 'ok' ? (o.hadProfile && !again.row ? [...good.values()] : coveredBy(settingsFrom(again.raw), [...good.values()])) : [];
        if (late.length) {
          const ids = late.map((r) => r.id);
          const del = await bounded(db.from('mr_ledger').delete().eq('user_id', userId).in('id', ids) as PromiseLike<Res>, STORE_TIMEOUT_MS);
          if (del === TIMED_OUT || del.error) fail('mr_ledger', del === TIMED_OUT ? { code: 'timeout' } : del.error);
          else console.info(`[socria/mr] mr_ledger: ${ids.length} row(s) removed again (a reset or a delete landed while they were written)`);
          for (const id of ids) good.delete(id);
        }
      }
    }
    // Retention, enforced where the data is written.
    if (Number.isFinite(now)) {
      const res = await bounded(db.from('mr_ledger').delete().eq('user_id', userId).lt('created_at', now - MR_RETENTION_MS) as PromiseLike<Res>, STORE_TIMEOUT_MS);
      if (res === TIMED_OUT) return fail('mr_ledger', { code: 'timeout' });
      if (res.error) fail('mr_ledger', res.error);
    }
  } catch (e) {
    fail('mr_ledger', e);
  }
}

/**
 * The rows their settings say must not exist: recorded at or before their
 * last reset, or of a conversation they deleted after the row was recorded.
 */
function coveredBy(s: MRSettings, rows: readonly LedgerRow[]): LedgerRow[] {
  const gone = new Map((s.forgotten ?? []).map((f) => [f.conversation, f.at] as const));
  return rows.filter((r) => {
    const deletedAt = r.conversation_id !== null ? gone.get(forgottenKey(r.conversation_id)) : undefined;
    return (s.resetAt !== null && r.created_at <= s.resetAt) || (deletedAt !== undefined && r.created_at <= deletedAt);
  });
}

/** Expired rows deleted per round of the daily purge, and rounds per run: a backlog drains over days. */
const PURGE_BATCH = 200;
const PURGE_ROUNDS = 25;
/** No new round starts after this long: the cron that runs the purge has emails to send in the same minute. */
const PURGE_BUDGET_MS = 15_000;

/**
 * Every person's ledger rows older than the retention window, deleted — the
 * daily cron's (app/api/cron/lifecycle). writeRows purges only for the
 * person writing, so without this a person who stops taking turns, or a
 * deployment that turned MR off, would keep rows past what the export note
 * promises. Bounded: at most PURGE_BATCH × PURGE_ROUNDS rows a run, by id in
 * batches, each delete still conditioned on the row's age, and no round
 * begun after `budgetMs`. Logs a count, never an id. A table that is not
 * there has nothing to purge.
 */
export async function purgeExpired(now = Date.now(), budgetMs = PURGE_BUDGET_MS): Promise<{ ok: boolean; deleted: number }> {
  const cutoff = cutoffAt(now);
  const began = Date.now();
  let deleted = 0;
  try {
    const db = supabaseAdmin();
    for (let round = 0; round < PURGE_ROUNDS && Date.now() - began < budgetMs; round++) {
      const found = await bounded(
        db.from('mr_ledger').select('id').lt('created_at', cutoff).order('created_at', { ascending: true }).limit(PURGE_BATCH) as PromiseLike<Res<{ id?: unknown }[]>>,
        STORE_TIMEOUT_MS
      );
      if (found === TIMED_OUT) return fail('mr_ledger', { code: 'timeout' }), { ok: false, deleted };
      if (found.error) {
        if (tableMissing(found.error)) return { ok: true, deleted };
        return fail('mr_ledger', found.error), { ok: false, deleted };
      }
      const page = found.data ?? [];
      const ids = [...new Set(page.map((r) => r?.id).filter((id): id is string => typeof id === 'string'))];
      if (!ids.length) break;
      const gone = await bounded(db.from('mr_ledger').delete({ count: 'exact' }).in('id', ids).lt('created_at', cutoff) as PromiseLike<Res & { count?: number | null }>, STORE_TIMEOUT_MS);
      if (gone === TIMED_OUT) return fail('mr_ledger', { code: 'timeout' }), { ok: false, deleted };
      if (gone.error) return fail('mr_ledger', gone.error), { ok: false, deleted };
      deleted += typeof gone.count === 'number' ? gone.count : ids.length;
      if (page.length < PURGE_BATCH) break;
    }
    console.info(`[socria/mr] mr_ledger: retention purge deleted ${deleted} row(s)`);
    return { ok: true, deleted };
  } catch (e) {
    fail('mr_ledger', e);
    return { ok: false, deleted };
  }
}

/**
 * Their rows, newest first, for their own view. `conversationKey` scopes to
 * one conversation (null: rows with no conversation); `kinds` to some kinds;
 * `resetAt` drops what was recorded before their last reset. Nothing older
 * than the retention window.
 */
export async function listForUser(
  userId: string,
  o: { limit: number; conversationKey?: string | null; kinds?: readonly LedgerKind[]; resetAt?: number | null }
): Promise<{ ok: boolean; rows: LedgerRow[] }> {
  try {
    const limit = Math.max(1, Math.min(1000, Math.floor(Number(o.limit) || 1)));
    const cutoff = cutoffAt();
    let q = supabaseAdmin().from('mr_ledger').select(COLS).eq('user_id', userId).gte('created_at', cutoff);
    if (o.conversationKey === null) q = q.is('conversation_id', null);
    else if (typeof o.conversationKey === 'string') q = q.eq('conversation_id', o.conversationKey);
    if (o.kinds?.length) q = q.in('kind', [...o.kinds]);
    const res = await bounded(q.order('created_at', { ascending: false }).limit(limit) as PromiseLike<Res<unknown[]>>, STORE_TIMEOUT_MS);
    if (res === TIMED_OUT) return fail('mr_ledger', { code: 'timeout' }), { ok: false, rows: [] };
    if (res.error) return fail('mr_ledger', res.error), { ok: false, rows: [] };
    return { ok: true, rows: keep(res.data, userId, o.resetAt, cutoff) };
  } catch (e) {
    fail('mr_ledger', e);
    return { ok: false, rows: [] };
  }
}

/**
 * Forget: one conversation's rows (a string), the rows with no conversation
 * (null), or all of theirs (omitted). A table that was never created holds
 * nothing of theirs, so that is ok; any other failure is not.
 */
export async function deleteForUser(userId: string, conversationKey?: string | null): Promise<{ ok: boolean }> {
  try {
    let q = supabaseAdmin().from('mr_ledger').delete().eq('user_id', userId);
    if (conversationKey === null) q = q.is('conversation_id', null);
    else if (typeof conversationKey === 'string') q = q.eq('conversation_id', conversationKey);
    const res = await bounded(q as PromiseLike<Res>, STORE_TIMEOUT_MS);
    if (res === TIMED_OUT) return fail('mr_ledger', { code: 'timeout' }), { ok: false };
    if (res.error) {
      if (tableMissing(res.error)) return { ok: true };
      fail('mr_ledger', res.error);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    fail('mr_ledger', e);
    return { ok: false };
  }
}

/** A settings write that failed for a reason other than a database without the column. */
const failedWrite = (w: { ok: boolean; missing?: boolean }) => !w.ok && !w.missing;

/**
 * Their reset, stamped (MRSettings.resetAt = now), tried twice: what the
 * account-wide forgets do FIRST (DELETE /api/mr, "forget what Socria worked
 * out"), so that a turn already in flight — its rows stamped with when it
 * began — writes nothing back after the delete (writeRows), and nothing
 * recorded before it is read again. `missing`: the database cannot keep it
 * (the delete alone then removes everything there is).
 */
export async function stampReset(userId: string): Promise<{ ok: boolean; missing?: boolean }> {
  const first = await writeSettings(userId, { resetAt: Date.now() });
  if (!failedWrite(first)) return { ok: first.ok, ...(first.missing ? { missing: true } : {}) };
  const again = await writeSettings(userId, { resetAt: Date.now() });
  return { ok: again.ok, ...(again.missing ? { missing: true } : {}) };
}

/**
 * Forget one conversation's rows (DELETE /api/mr?conversation=, and the
 * conversation delete), in this order:
 *   1. the "from now on" rules their words took back there are kept in their
 *      settings (revokedStanding) — writeRows records them as it goes, but
 *      that write can fail, and once these rows are gone nothing else would
 *      say it: the preference would come back everywhere;
 *   2. in the same write, the conversation is marked forgotten (for a day),
 *      so a turn of it still in flight writes nothing back (writeRows);
 *   3. its rows are deleted.
 * The mark is tried twice; one that cannot be kept does not stop the delete
 * (`marked` says whether it was). ok is the delete.
 */
export async function forgetConversation(userId: string, conversationKey: string): Promise<{ ok: boolean; marked: boolean }> {
  let revoke: Revocation[] = [];
  try {
    const res = await bounded(
      supabaseAdmin()
        .from('mr_ledger')
        .select(COLS)
        .eq('user_id', userId)
        .eq('conversation_id', conversationKey)
        .eq('kind', 'exposure')
        .like('record->>revoked', '%')
        .order('created_at', { ascending: true })
        .limit(REVOCATION_ROWS) as PromiseLike<Res<unknown[]>>,
      STORE_TIMEOUT_MS
    );
    if (res === TIMED_OUT) fail('mr_ledger', { code: 'timeout' });
    else if (res.error) {
      if (!tableMissing(res.error)) fail('mr_ledger', res.error);
    } else revoke = revocationsOf(keep(res.data, userId, null, cutoffAt()));
  } catch (e) {
    fail('mr_ledger', e);
  }
  const patch = { forget: conversationKey, ...(revoke.length ? { revoke } : {}) };
  let mark = await writeSettings(userId, patch);
  if (failedWrite(mark)) mark = await writeSettings(userId, patch);
  if (failedWrite(mark)) console.error('[socria/mr] forget: the conversation mark could not be recorded');
  const gone = await deleteForUser(userId, conversationKey);
  return { ok: gone.ok, marked: mark.ok };
}

/**
 * Is this conversation incognito? true / false, or null when that could not
 * be read — and MR treats null as yes (lib/mr/ledger.ts persistAllowed).
 * lib/mind/store.ts isIncognito answers false on an error because the write
 * it guards would fail against the same table; the ledger is a different
 * table, so that reasoning does not carry over. No row yet (a conversation
 * the browser has not saved) is false, as is a database without the column:
 * in neither can anybody have switched it on.
 */
export async function readIncognito(userId: string, conversationKey: string): Promise<boolean | null> {
  try {
    const res = await bounded(
      supabaseAdmin().from('conversations').select('incognito').eq('id', conversationKey).eq('user_id', userId).maybeSingle() as PromiseLike<Res<{ incognito?: unknown }>>,
      STORE_TIMEOUT_MS
    );
    if (res === TIMED_OUT) return fail('conversations.incognito', { code: 'timeout' }), null;
    if (res.error) {
      if (columnMissing(res.error)) return false;
      fail('conversations.incognito', res.error);
      return null;
    }
    return res.data?.incognito === true;
  } catch (e) {
    fail('conversations.incognito', e);
    return null;
  }
}

/**
 * Can this deployment keep MR's records at all? Reported by GET
 * /api/health/upstream so a schema that was never applied is visible, rather
 * than every turn quietly writing nothing. `head: true` reads no rows: this
 * asks whether the table and the column are there, and cannot see anybody's
 * data. No count either: an exact count is a scan of the whole table, and
 * the ledger is the largest MR keeps — a health check that slows as the
 * table grows would one day time out and report a healthy store as broken.
 * `detail` is a code, never a database message.
 */
export async function mrStoreHealth(): Promise<{ ok: boolean; detail: string }> {
  const probe = async (table: string, col: string): Promise<string | null> => {
    try {
      const res = await bounded(supabaseAdmin().from(table).select(col, { head: true }).limit(1) as PromiseLike<Res>, STORE_TIMEOUT_MS);
      if (res === TIMED_OUT) return `${table}:timeout`;
      if (!res.error) return null;
      if (tableMissing(res.error)) return `${table}:table_missing`;
      if (columnMissing(res.error)) return `${table}.${col}:column_missing`;
      return `${table}:error_${res.error.code ?? 'unknown'}`;
    } catch (e) {
      return `${table}:threw_${(e as Error)?.name ?? typeof e}`;
    }
  };
  const found = (await Promise.all([probe('mr_ledger', 'user_id'), probe('user_profiles', 'mr')])).filter((x): x is string => !!x);
  return found.length ? { ok: false, detail: found.join(',') } : { ok: true, detail: 'ok' };
}
