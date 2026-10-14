// lib/dashboard/types.ts
//
// The developer dashboard's two shapes: what is COLLECTED (lib/dashboard/
// collect.ts — already minimised: a domain, never an address; timestamps,
// never content) and what is SHOWN (lib/dashboard/aggregate.ts → the page).

import type { Milestone } from '@/lib/first-run';
import type { OnboardingStep } from '@/lib/product-event-kinds';

export type Env = 'production' | 'preview' | 'development';

// ── the time range every number below the filter row is scoped to ──

export type Range = '7' | '30' | '90' | 'all';

export const RANGES: readonly { id: Range; label: string; days: number | null }[] = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

export function parseRange(v: unknown): Range {
  return v === '7' || v === '30' || v === '90' || v === 'all' ? v : '30';
}

// ── collected ──

/** One account, as much as the dashboard needs and no more. */
export interface AccountRow {
  id: string;
  createdAt: number;
  /** the latest of Clerk's last-active and last-sign-in times */
  lastSeenAt: number | null;
  /** the primary address's domain, lowercased — never the address */
  domain: string | null;
  /** a verified address at a university */
  academic: boolean;
  /** how they can sign in: 'google' | 'apple' | 'github' | 'microsoft' | 'password' | 'email-code' | another provider */
  methods: string[];
  /** Socria One by grant (lib/socria-one-grant.ts) */
  granted: boolean;
  /** a paid subscription as Clerk's mirror of Stripe last saw it */
  paidMirror: boolean;
  /** when a recorded student month ends, if one was recorded */
  studentUntil: number | null;
}

export interface ProfileRow {
  userId: string;
  firstRun: Partial<Record<Milestone, number>>;
  /** milestones they skipped rather than did — the intro, mostly */
  skipped: Milestone[];
  style: string | null;
}

export interface ConversationRow {
  userId: string;
  /** 'chat' (Core) | 'logos' */
  kind: string;
  createdAt: number;
  updatedAt: number;
}

export interface SubscriptionRow {
  userId: string;
  status: string;
  /** Stripe's period end, in SECONDS */
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

/** A lifecycle-email ledger row: kind 'newsletter' (asked for it) or 'unsubscribed'. */
export interface MailRow {
  userId: string;
  kind: string;
}

export interface ReferralRow {
  userId: string;
  via: string;
  createdAt: number;
  activatedAt: number | null;
}

/** A reward granted (promo_ledger): 'challenge' | 'referral_signup' | 'referral_activation'. */
export interface GrantRow {
  source: string;
  createdAt: number;
}

export interface PromoRow {
  userId: string;
  promoUntil: number | null;
}

/** One first-party count (lib/product-events.ts). */
export interface EventRow {
  day: string;
  event: string;
  kind: string;
  n: number;
}

export type SourceState = 'ok' | 'missing' | 'error' | 'unconfigured' | 'truncated';

export interface SourceHealth {
  id: string;
  label: string;
  state: SourceState;
  rows: number;
  note?: string;
}

export interface Collected {
  now: number;
  env: Env;
  /** null when Clerk could not be read */
  accounts: AccountRow[] | null;
  /** Clerk's own count, which is right even when the list was capped */
  accountsTotal: number | null;
  profiles: ProfileRow[];
  conversations: ConversationRow[];
  subscriptions: SubscriptionRow[];
  mail: MailRow[];
  referrals: ReferralRow[];
  grants: GrantRow[];
  promos: PromoRow[];
  /** null when the counters table does not exist yet */
  events: EventRow[] | null;
  health: SourceHealth[];
}

// ── shown ──

export interface Bar {
  id: string;
  label: string;
  n: number;
  /** drawn in the de-emphasis gray: a "skipped", an "other" */
  muted?: boolean;
}

export interface Kpi {
  id: string;
  label: string;
  value: number | null;
  /** a short line under the number: what it is measured over */
  hint?: string;
  /** change against the previous period of the same length */
  delta?: { n: number; vs: string };
  /** what to show instead of the number itself — a rate, say */
  display?: string;
}

export interface StepAnswers {
  step: OnboardingStep;
  title: string;
  question: string;
  total: number;
  bars: Bar[];
}

export interface RecentRow {
  createdAt: number;
  /** a domain only where it cannot single anyone out; otherwise a kind of address */
  domain: string;
  method: string;
  thought: boolean;
  core: number;
  logos: number;
  plan: string;
  newsletter: boolean;
}

export interface DashboardModel {
  generatedAt: number;
  env: Env;
  range: Range;
  rangeLabel: string;
  kpis: Kpi[];
  signups: { unit: 'day' | 'week'; bins: { label: string; start: number; n: number }[]; total: number } | null;
  funnel: { cohort: number; stages: Bar[]; introSkipped: number; medianMinutesToThought: number | null } | null;
  onboarding: { since: string | null; opened: number; steps: StepAnswers[]; skipAt: Bar[] } | null;
  composition: {
    base: number;
    baseLabel: string;
    surfaces: Bar[];
    styles: Bar[];
    emails: Bar[];
    domains: Bar[];
    methods: Bar[];
    plans: Bar[];
  };
  sources: { since: string | null; total: number; referrers: Bar[]; landings: Bar[]; campaigns: Bar[] } | null;
  engagement: { histogram: Bar[]; returned: { n: number; of: number } | null; medianConversations: number | null };
  rewards: { referralSignups: number; referralActivations: number; challenges: number; promoActive: number };
  recent: RecentRow[];
  notes: string[];
  health: SourceHealth[];
}
