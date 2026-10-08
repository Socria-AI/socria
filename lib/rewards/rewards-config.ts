// lib/rewards/rewards-config.ts
//
// SOCRIA REWARDS — every number in one place, read from the environment.
//
//   Create 5 nodes. Get 7 days free.
//   Invite a friend. Give 7 days. Get 7 days.
//
// The numbers are configuration, not code: a limit written into a function is
// a limit that takes a deploy to change, and these are meant to be tuned as
// we learn what they should be. Every value is validated and clamped — an
// environment variable is text somebody typed, and a typo must not become
// "unlimited".
//
// ON OR OFF. Rewards are on everywhere but production, and on production only
// once REWARDS_ENABLED=1 is set — because turning them on there means the
// tables exist (supabase/schema.sql) and somebody decided to start giving
// Socria One away. REWARDS_ENABLED=0 turns them off anywhere.
//
// PURE: reads only the env object it is handed.

export interface RewardsConfig {
  enabled: boolean;
  /** one day, in ms — a constant, kept here so tests can read it */
  dayMs: number;
  challenge: {
    /** connected, meaningful nodes in one map */
    nodes: number;
    days: number;
    /** words of their own the person must have written in the session that drew the map */
    minOwnWords: number;
    /** how many of the person's most recent Logos sessions are examined */
    scanSessions: number;
  };
  referral: {
    /** what the friend gets on signing up */
    signupDays: number;
    /** what the person who invited them gets when the friend becomes active */
    activationDays: number;
    /** rewarded direct referrals per person per calendar month (UTC) */
    monthlyCap: number;
    /** how old an account may be and still count as a new sign-up, in hours */
    newAccountHours: number;
    /** how long the link's cookie lasts, in days */
    cookieDays: number;
    /** meaningful sessions the friend must complete */
    activationSessions: number;
    /** …on at least this many distinct calendar days (1 = no extra rule) */
    activationDistinctDays: number;
    /** a meaningful session: at least this many messages of the person's own… */
    sessionUserTurns: number;
    /** …adding up to at least this many words… */
    sessionWords: number;
    /** email domains that cannot receive a referral reward (disposable mail) */
    blockedDomains: string[];
  };
  /** promotional time that may be waiting — active plus banked — at any moment, in days */
  bankCapDays: number;
}

type Env = Record<string, string | undefined>;

const int = (env: Env, key: string, dflt: number, min: number, max: number): number => {
  const raw = env[key];
  if (raw === undefined || raw === '') return dflt;
  const n = Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** Disposable inboxes: a short list, extended by REWARDS_BLOCKED_EMAIL_DOMAINS. */
export const DISPOSABLE_DOMAINS = [
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'throwawaymail.com',
];

function isProductionEnv(env: Env): boolean {
  const v = env.NEXT_PUBLIC_VERCEL_ENV || env.VERCEL_ENV;
  if (v === 'production' || v === 'preview' || v === 'development') return v === 'production';
  return env.NODE_ENV === 'production';
}

export function rewardsConfig(env: Env = typeof process !== 'undefined' ? (process.env as Env) : {}): RewardsConfig {
  const flag = env.REWARDS_ENABLED;
  const enabled = flag === '0' ? false : flag === '1' ? true : !isProductionEnv(env);
  const extra = (env.REWARDS_BLOCKED_EMAIL_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
    .filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s));
  return {
    enabled,
    dayMs: 86_400_000,
    challenge: {
      nodes: int(env, 'REWARDS_CHALLENGE_NODES', 5, 2, 50),
      days: int(env, 'REWARDS_CHALLENGE_DAYS', 7, 1, 30),
      minOwnWords: int(env, 'REWARDS_CHALLENGE_MIN_WORDS', 5, 0, 200),
      scanSessions: int(env, 'REWARDS_CHALLENGE_SCAN', 60, 1, 500),
    },
    referral: {
      signupDays: int(env, 'REWARDS_REFERRAL_SIGNUP_DAYS', 7, 1, 30),
      activationDays: int(env, 'REWARDS_REFERRAL_ACTIVATION_DAYS', 7, 1, 30),
      monthlyCap: int(env, 'REWARDS_REFERRAL_MONTHLY_CAP', 4, 0, 100),
      newAccountHours: int(env, 'REWARDS_NEW_ACCOUNT_HOURS', 72, 1, 24 * 30),
      cookieDays: int(env, 'REWARDS_REFERRAL_COOKIE_DAYS', 30, 1, 90),
      activationSessions: int(env, 'REWARDS_ACTIVATION_SESSIONS', 2, 1, 20),
      activationDistinctDays: int(env, 'REWARDS_ACTIVATION_DISTINCT_DAYS', 1, 1, 20),
      sessionUserTurns: int(env, 'REWARDS_SESSION_USER_TURNS', 2, 1, 50),
      sessionWords: int(env, 'REWARDS_SESSION_WORDS', 12, 0, 2000),
      blockedDomains: [...new Set([...DISPOSABLE_DOMAINS, ...extra])],
    },
    bankCapDays: int(env, 'REWARDS_BANK_CAP_DAYS', 30, 1, 365),
  };
}
