// lib/rewards/rewards-store.ts
//
// What Socria Rewards needs from a database, as an interface — and an
// in-memory implementation of it, for tests and for deployments with no
// database at all.
//
// The interface is deliberately small and made of the two primitives that
// make rewards safe under concurrency, so both implementations can honour
// them exactly:
//
//   INSERT-IF-ABSENT on a unique key (the ledger, codes, referrals). Of two
//   writers racing to record the same reward, exactly one inserts; the other
//   is told it exists.
//
//   COMPARE-AND-SWAP on the account row: "write version N+1 only if it is
//   still version N". Of two writers updating the same account, one wins and
//   the other re-reads and tries again with what the first one did.
//
// Production is lib/rewards/supabase-rewards-store.ts (Postgres unique
// constraints and a conditional update); the tables are in
// supabase/schema.sql.

import type { GrantOutcome, PromoAccount, RewardSource } from './promo-engine';

export type LedgerStatus = 'pending' | 'applied' | GrantOutcome;

export interface LedgerRow {
  /** unique for all time — 'challenge:<user>', 'referral_signup:<user>', 'referral_activation:<referred>' */
  key: string;
  /** who receives it */
  userId: string;
  source: RewardSource;
  days: number;
  createdAt: number;
  status: LedgerStatus;
  /** what was actually added, after the cap (ms) */
  appliedMs: number;
  /** when the promotional window it joined ends, when it went straight to active */
  endsAt: number | null;
  /** short, non-identifying context: never names, never emails */
  meta: Record<string, string | number | null>;
}

export type ReferralStatus =
  | 'signed_up' // the friend joined through the link; waiting for them to become active
  | 'rewarded' // the friend became active and the person who invited them got their days
  | 'capped' // the friend became active, past the inviter's monthly limit
  | 'bank_full' // the friend became active while the inviter's reward time was already at the cap
  | 'orphaned'; // the inviter's account was deleted

export interface ReferralRow {
  /** the person who was invited — one row per account, which is the "one referrer" rule */
  userId: string;
  /** the person who invited them; null once their account is deleted */
  referrerId: string | null;
  code: string;
  /** how they arrived: a referral link, or a Think Together invitation */
  via: 'link' | 'invite';
  status: ReferralStatus;
  createdAt: number;
  activatedAt: number | null;
}

export interface RewardsStore {
  getAccount(userId: string): Promise<PromoAccount | null>;
  /** create the row if there is none; false when one already existed */
  createAccount(a: PromoAccount): Promise<boolean>;
  /** write `next` only if the stored version is still `expected`; true when it was written */
  casAccount(next: PromoAccount, expected: number): Promise<boolean>;

  insertLedger(row: LedgerRow): Promise<'inserted' | 'exists'>;
  getLedger(key: string): Promise<LedgerRow | null>;
  listLedger(userId: string): Promise<LedgerRow[]>;
  /**
   * Settle a ledger row. With `onlyIfPending`, only a row still 'pending' is touched — the form a
   * caller uses when it did NOT apply the reward itself and must never overwrite the outcome the
   * caller that did apply it is about to write (or has written).
   */
  updateLedger(key: string, patch: Partial<Pick<LedgerRow, 'status' | 'appliedMs' | 'endsAt'>>, opts?: { onlyIfPending?: boolean }): Promise<void>;

  getCode(userId: string): Promise<string | null>;
  /** 'user_has' when this person already has a code; 'taken' when the code belongs to someone else */
  createCode(userId: string, code: string): Promise<'inserted' | 'user_has' | 'taken'>;
  ownerOfCode(code: string): Promise<string | null>;

  getReferral(userId: string): Promise<ReferralRow | null>;
  insertReferral(row: ReferralRow): Promise<'inserted' | 'exists'>;
  /** update only while the row is still in `from`; true when it moved */
  moveReferral(userId: string, from: ReferralStatus, patch: Partial<Pick<ReferralRow, 'status' | 'activatedAt'>>): Promise<boolean>;
  listReferralsBy(referrerId: string): Promise<ReferralRow[]>;
}

/**
 * The in-memory store. Single-process, so "atomic" is free — but every method
 * yields to the event loop first (and, with `jitter`, a random number of
 * times), so concurrent callers really do interleave, and a test of a race
 * is a test of the protocol rather than of JavaScript's run-to-completion.
 */
export function memoryStore(opts: { jitter?: () => number } = {}): RewardsStore & { dump(): unknown } {
  const accounts = new Map<string, PromoAccount>();
  const ledger = new Map<string, LedgerRow>();
  const codes = new Map<string, string>(); // userId → code
  const owners = new Map<string, string>(); // code → userId
  const referrals = new Map<string, ReferralRow>();
  const tick = async () => {
    const n = opts.jitter ? opts.jitter() : 1;
    for (let i = 0; i < n; i++) await Promise.resolve();
  };
  const clone = <T>(v: T): T => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {
    async getAccount(userId) {
      await tick();
      return clone(accounts.get(userId) ?? null);
    },
    async createAccount(a) {
      await tick();
      if (accounts.has(a.userId)) return false;
      accounts.set(a.userId, clone(a));
      return true;
    },
    async casAccount(next, expected) {
      await tick();
      const cur = accounts.get(next.userId);
      if (!cur || cur.version !== expected) return false;
      accounts.set(next.userId, clone({ ...next, version: expected + 1 }));
      return true;
    },
    async insertLedger(row) {
      await tick();
      if (ledger.has(row.key)) return 'exists';
      ledger.set(row.key, clone(row));
      return 'inserted';
    },
    async getLedger(key) {
      await tick();
      return clone(ledger.get(key) ?? null);
    },
    async listLedger(userId) {
      await tick();
      return clone([...ledger.values()].filter((r) => r.userId === userId).sort((a, b) => a.createdAt - b.createdAt));
    },
    async updateLedger(key, patch, opts) {
      await tick();
      const cur = ledger.get(key);
      if (!cur) return;
      if (opts?.onlyIfPending && cur.status !== 'pending') return;
      ledger.set(key, { ...cur, ...clone(patch) });
    },
    async getCode(userId) {
      await tick();
      return codes.get(userId) ?? null;
    },
    async createCode(userId, code) {
      await tick();
      if (codes.has(userId)) return 'user_has';
      if (owners.has(code)) return 'taken';
      codes.set(userId, code);
      owners.set(code, userId);
      return 'inserted';
    },
    async ownerOfCode(code) {
      await tick();
      return owners.get(code) ?? null;
    },
    async getReferral(userId) {
      await tick();
      return clone(referrals.get(userId) ?? null);
    },
    async insertReferral(row) {
      await tick();
      if (referrals.has(row.userId)) return 'exists';
      referrals.set(row.userId, clone(row));
      return 'inserted';
    },
    async moveReferral(userId, from, patch) {
      await tick();
      const cur = referrals.get(userId);
      if (!cur || cur.status !== from) return false;
      referrals.set(userId, { ...cur, ...clone(patch) });
      return true;
    },
    async listReferralsBy(referrerId) {
      await tick();
      return clone([...referrals.values()].filter((r) => r.referrerId === referrerId).sort((a, b) => a.createdAt - b.createdAt));
    },
    dump() {
      return { accounts: [...accounts.values()], ledger: [...ledger.values()], codes: [...codes.entries()], referrals: [...referrals.values()] };
    },
  };
}
