// lib/rewards/supabase-rewards-store.ts
//
// The rewards store, on Postgres (supabase/schema.sql, "Socria Rewards").
//
// It keeps the two promises the interface makes (lib/rewards/rewards-store.ts)
// with the database's own guarantees rather than application locks:
//
//   INSERT-IF-ABSENT is a plain insert against a primary key or a unique
//   column. Postgres admits exactly one of two concurrent inserts; the other
//   gets 23505 (unique_violation), which is reported as 'exists'.
//
//   COMPARE-AND-SWAP is `update … where user_id = $1 and version = $2`,
//   returning the row. One of two concurrent updates finds the version it
//   expected and writes; the other matches nothing and is told so.
//
// A database that has not run the migration is not an error the person should
// see: every method throws RewardsUnavailable, and the routes answer "rewards
// are not available here" while everything else in Socria carries on.

import 'server-only';
import { supabaseAdmin } from '../supabase';
import type { PromoAccount, RewardSource } from './promo-engine';
import type { LedgerRow, ReferralRow, ReferralStatus, RewardsStore } from './rewards-store';

export class RewardsUnavailable extends Error {
  constructor(why: string) {
    super(`rewards unavailable: ${why}`);
  }
}

type PgError = { code?: string; message?: string } | null;

const missingTable = (e: PgError) => {
  const m = `${e?.code ?? ''} ${e?.message ?? ''}`.toLowerCase();
  return m.includes('42p01') || m.includes('pgrst205') || /relation .*does not exist/.test(m) || m.includes('schema cache');
};
const duplicate = (e: PgError) => e?.code === '23505' || /duplicate key/i.test(e?.message ?? '');

let warned = false;
function fail(e: PgError, where: string): never {
  if (missingTable(e)) {
    if (!warned) {
      warned = true;
      console.warn('[rewards] the rewards tables are missing — run the "Socria Rewards" section of supabase/schema.sql and rls.sql');
    }
    throw new RewardsUnavailable('tables missing');
  }
  throw new Error(`[rewards] ${where}: ${e?.message ?? 'unknown error'}`);
}

function db() {
  try {
    return supabaseAdmin();
  } catch {
    throw new RewardsUnavailable('no database configured');
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toAccount(r: Record<string, unknown>): PromoAccount {
  return {
    userId: String(r.user_id),
    version: Number(r.version ?? 0),
    until: num(r.promo_until),
    bankedMs: Number(r.banked_ms ?? 0),
    applied: Array.isArray(r.applied) ? (r.applied as unknown[]).filter((k): k is string => typeof k === 'string') : [],
    refMonth: typeof r.ref_month === 'string' ? r.ref_month : null,
    refCount: Number(r.ref_count ?? 0),
    expiredFor: num(r.expired_for),
    convertedAt: num(r.converted_at),
  };
}

function fromAccount(a: PromoAccount) {
  return {
    user_id: a.userId,
    version: a.version,
    promo_until: a.until,
    banked_ms: Math.max(0, Math.round(a.bankedMs)),
    applied: a.applied,
    ref_month: a.refMonth,
    ref_count: a.refCount,
    expired_for: a.expiredFor,
    converted_at: a.convertedAt,
    updated_at: Date.now(),
  };
}

function toLedger(r: Record<string, unknown>): LedgerRow {
  return {
    key: String(r.key),
    userId: String(r.user_id),
    source: r.source as RewardSource,
    days: Number(r.days ?? 0),
    createdAt: Number(r.created_at ?? 0),
    status: (r.status as LedgerRow['status']) ?? 'pending',
    appliedMs: Number(r.applied_ms ?? 0),
    endsAt: num(r.ends_at),
    meta: r.meta && typeof r.meta === 'object' ? (r.meta as LedgerRow['meta']) : {},
  };
}

function toReferral(r: Record<string, unknown>): ReferralRow {
  return {
    userId: String(r.user_id),
    referrerId: typeof r.referrer_id === 'string' ? r.referrer_id : null,
    code: String(r.code),
    via: r.via === 'invite' ? 'invite' : 'link',
    status: (r.status as ReferralStatus) ?? 'signed_up',
    createdAt: Number(r.created_at ?? 0),
    activatedAt: num(r.activated_at),
  };
}

export function supabaseRewardsStore(): RewardsStore {
  return {
    async getAccount(userId) {
      const { data, error } = await db().from('promo_accounts').select('*').eq('user_id', userId).maybeSingle();
      if (error) fail(error, 'getAccount');
      return data ? toAccount(data as Record<string, unknown>) : null;
    },
    async createAccount(a) {
      const { error } = await db().from('promo_accounts').insert(fromAccount(a));
      if (!error) return true;
      if (duplicate(error)) return false;
      fail(error, 'createAccount');
    },
    async casAccount(next, expected) {
      const row = { ...fromAccount(next), version: expected + 1 };
      const { data, error } = await db()
        .from('promo_accounts')
        .update(row)
        .eq('user_id', next.userId)
        .eq('version', expected)
        .select('user_id');
      if (error) fail(error, 'casAccount');
      return Array.isArray(data) && data.length === 1;
    },
    async insertLedger(row) {
      const { error } = await db().from('promo_ledger').insert({
        key: row.key,
        user_id: row.userId,
        source: row.source,
        days: row.days,
        status: row.status,
        applied_ms: row.appliedMs,
        ends_at: row.endsAt,
        meta: row.meta,
        created_at: row.createdAt,
      });
      if (!error) return 'inserted';
      if (duplicate(error)) return 'exists';
      fail(error, 'insertLedger');
    },
    async getLedger(key) {
      const { data, error } = await db().from('promo_ledger').select('*').eq('key', key).maybeSingle();
      if (error) fail(error, 'getLedger');
      return data ? toLedger(data as Record<string, unknown>) : null;
    },
    async listLedger(userId) {
      const { data, error } = await db().from('promo_ledger').select('*').eq('user_id', userId).order('created_at', { ascending: true }).limit(500);
      if (error) fail(error, 'listLedger');
      return ((data ?? []) as Record<string, unknown>[]).map(toLedger);
    },
    async updateLedger(key, patch, opts) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.appliedMs !== undefined) row.applied_ms = Math.max(0, Math.round(patch.appliedMs));
      if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
      let q = db().from('promo_ledger').update(row).eq('key', key);
      if (opts?.onlyIfPending) q = q.eq('status', 'pending');
      const { error } = await q;
      if (error) fail(error, 'updateLedger');
    },
    async getCode(userId) {
      const { data, error } = await db().from('referral_codes').select('code').eq('user_id', userId).maybeSingle();
      if (error) fail(error, 'getCode');
      return (data as { code?: string } | null)?.code ?? null;
    },
    async createCode(userId, code) {
      const { error } = await db().from('referral_codes').insert({ user_id: userId, code, created_at: Date.now() });
      if (!error) return 'inserted';
      if (!duplicate(error)) fail(error, 'createCode');
      // which unique value collided: the person's row, or the code
      const { data } = await db().from('referral_codes').select('user_id').eq('user_id', userId).maybeSingle();
      return data ? 'user_has' : 'taken';
    },
    async ownerOfCode(code) {
      const { data, error } = await db().from('referral_codes').select('user_id').eq('code', code).maybeSingle();
      if (error) fail(error, 'ownerOfCode');
      return (data as { user_id?: string } | null)?.user_id ?? null;
    },
    async getReferral(userId) {
      const { data, error } = await db().from('referrals').select('*').eq('user_id', userId).maybeSingle();
      if (error) fail(error, 'getReferral');
      return data ? toReferral(data as Record<string, unknown>) : null;
    },
    async insertReferral(row) {
      const { error } = await db().from('referrals').insert({
        user_id: row.userId,
        referrer_id: row.referrerId,
        code: row.code,
        via: row.via,
        status: row.status,
        created_at: row.createdAt,
        activated_at: row.activatedAt,
      });
      if (!error) return 'inserted';
      if (duplicate(error)) return 'exists';
      fail(error, 'insertReferral');
    },
    async moveReferral(userId, from, patch) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.activatedAt !== undefined) row.activated_at = patch.activatedAt;
      const { data, error } = await db().from('referrals').update(row).eq('user_id', userId).eq('status', from).select('user_id');
      if (error) fail(error, 'moveReferral');
      return Array.isArray(data) && data.length === 1;
    },
    async listReferralsBy(referrerId) {
      const { data, error } = await db().from('referrals').select('*').eq('referrer_id', referrerId).order('created_at', { ascending: true }).limit(1000);
      if (error) fail(error, 'listReferralsBy');
      return ((data ?? []) as Record<string, unknown>[]).map(toReferral);
    },
  };
}

/**
 * The referrer side of account deletion. The invited person's own row goes
 * with THEIR account (OWNED_TABLES); this removes a deleted person's name from
 * the rows of the people they invited: the link is cut, and anyone still
 * waiting to become active can no longer earn the deleted account anything.
 */
export async function purgeReferrer(userId: string): Promise<void> {
  try {
    const client = supabaseAdmin();
    const a = await client.from('referrals').update({ referrer_id: null, status: 'orphaned' }).eq('referrer_id', userId).eq('status', 'signed_up');
    if (a.error && !missingTable(a.error)) throw a.error;
    const b = await client.from('referrals').update({ referrer_id: null }).eq('referrer_id', userId);
    if (b.error && !missingTable(b.error)) throw b.error;
  } catch (e) {
    if (e instanceof Error && /Supabase env vars missing/.test(e.message)) return;
    throw e;
  }
}
