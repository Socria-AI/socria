// lib/dashboard/aggregate.ts
//
// What the collected rows add up to — every number the developer dashboard
// shows, computed here and nowhere else.
//
// PURE: rows in, a model out. The page only draws what this returns, so every
// figure on it can be tested against fixtures without a database, a Clerk
// instance or a browser.
//
// THREE RULES THE NUMBERS FOLLOW.
//
//   One range scopes everything below the filter row. Cohort figures (the
//   funnel, the composition, engagement) are about the accounts CREATED in the
//   range; time series and counters are about what HAPPENED in it. The KPI
//   tiles say which they are.
//
//   No count is shown that could single someone out. A domain appears only
//   when at least three accounts share it, or it is a public email provider
//   (millions of people); a university's is held to the same floor, because a
//   department or a small college can be a handful of people. The recent
//   sign-ups list shows a kind of address, never an address and never a name.
//
//   A number that rests on partial data says so. Onboarding milestones are
//   kept per account only after it syncs once, so the funnel is a lower
//   bound; the counters began when they were deployed; and on a preview whose
//   Clerk instance is not the one that wrote the database, joins across the
//   two are flagged rather than silently wrong.

import { entitledBy } from '@/lib/entitlement-rule';
import { ROLES } from '@/lib/onboarding-roles';
import { INTENTS, START_MODEL_LABELS, type StartModel } from '@/lib/onboarding-intents';
import { STYLE_META, CONVERSATION_STYLES, type ConversationStyle } from '@/lib/conversation-style';
import { dayOf } from '@/lib/product-event-kinds';
import type { Milestone } from '@/lib/first-run';
import {
  RANGES,
  type AccountRow,
  type Bar,
  type Collected,
  type ConversationRow,
  type DashboardModel,
  type Kpi,
  type Range,
  type RecentRow,
  type StepAnswers,
} from './types';

const DAY = 86_400_000;

/** Public email providers: a domain here says nothing about where somebody works. */
export const PERSONAL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 't-online.de', 'mail.com',
  'zoho.com', 'yandex.com', 'yandex.ru', 'qq.com', '163.com', '126.com', 'naver.com', 'hey.com',
  'fastmail.com', 'tutanota.com', 'orange.fr', 'free.fr', 'libero.it', 'rediffmail.com', 'outlook.de',
]);

/** A university's domain: .edu, .ac.uk, .edu.au and their kind. */
export function isAcademicDomain(domain: string | null | undefined): boolean {
  return !!domain && /(^|\.)(edu|ac\.[a-z]{2,3}|edu\.[a-z]{2,3})$/.test(domain);
}

/** Fewer accounts than this on a domain, and the domain is not named. */
export const DOMAIN_FLOOR = 3;

// ── helpers ─────────────────────────────────────────────────────────────

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function tally<T extends string>(items: T[], order: readonly T[], label: (k: T) => string, muted: readonly T[] = []): Bar[] {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return order.map((k) => ({ id: k, label: label(k), n: counts.get(k) ?? 0, ...(muted.includes(k) ? { muted: true } : {}) }));
}

function sortedBars(counts: Map<string, number>, label: (k: string) => string, muted: (k: string) => boolean = () => false, max = 10): Bar[] {
  const all = [...counts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = all.slice(0, max).map(([k, n]) => ({ id: k, label: label(k), n, ...(muted(k) ? { muted: true } : {}) }));
  const rest = all.slice(max).reduce((s, [, n]) => s + n, 0);
  return rest ? [...head, { id: '__other', label: 'Everything else', n: rest, muted: true }] : head;
}

const NAMES: Record<string, string> = {
  google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', yahoo: 'Yahoo', ecosia: 'Ecosia', brave: 'Brave Search',
  chatgpt: 'ChatGPT', perplexity: 'Perplexity', claude: 'Claude', copilot: 'Copilot', gemini: 'Gemini',
  x: 'X', linkedin: 'LinkedIn', reddit: 'Reddit', facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads',
  youtube: 'YouTube', tiktok: 'TikTok', hackernews: 'Hacker News', producthunt: 'Product Hunt', github: 'GitHub',
  discord: 'Discord', uta: 'UTA', email: 'Email', direct: 'Direct (typed, bookmarked)', other: 'Another site',
  unknown: 'Not recorded (no consent, or no note)',
  home: 'Home page', docs: 'Docs', blog: 'Blog', explore: 'Explore', one: 'Socria One page', logos: 'Logos pages',
  students: 'Students page', support: 'Support', 'sign-up': 'Sign-up page', 'sign-in': 'Sign-in page', chat: 'Chat',
  legal: 'Legal pages', share: 'A shared link', invite: 'An invitation',
};
const named = (k: string) => NAMES[k] ?? k;

// ── the model ───────────────────────────────────────────────────────────

const FUNNEL: { id: Milestone; label: string }[] = [
  { id: 'socria.intro', label: 'Got through the intro (finished or skipped)' },
  { id: 'socria.thought', label: 'Wrote a first thought' },
  { id: 'core.first', label: 'Got a first Core reply' },
  { id: 'core.aha', label: 'Kept going after it' },
  { id: 'logos.model', label: 'Saw their thinking become a Logos map' },
  { id: 'logos.manipulated', label: 'Changed something on the map' },
  { id: 'logos.aha', label: 'Finished the Logos first run' },
];

const PLAN_ORDER = ['paid', 'student', 'granted', 'promo', 'free'] as const;
type Plan = (typeof PLAN_ORDER)[number];
const PLAN_LABEL: Record<Plan, string> = {
  paid: 'Socria One, paid',
  student: 'Socria One, student month',
  granted: 'Socria One, granted',
  promo: 'Socria One, from Rewards',
  free: 'Free',
};

const METHOD_ORDER = ['google', 'apple', 'github', 'microsoft', 'other-oauth', 'password', 'email-code'] as const;
type Method = (typeof METHOD_ORDER)[number];
const METHOD_LABEL: Record<Method, string> = {
  google: 'Google',
  apple: 'Apple',
  github: 'GitHub',
  microsoft: 'Microsoft',
  'other-oauth': 'Another provider',
  password: 'Email and password',
  'email-code': 'Email code',
};

function primaryMethod(methods: string[]): Method {
  for (const m of ['google', 'apple', 'github', 'microsoft'] as const) if (methods.includes(m)) return m;
  if (methods.some((m) => !['password', 'email-code'].includes(m))) return 'other-oauth';
  return methods.includes('password') ? 'password' : 'email-code';
}

export function aggregate(c: Collected, range: Range): DashboardModel {
  const now = c.now;
  const r = RANGES.find((x) => x.id === range)!;
  const from = r.days === null ? -Infinity : now - r.days * DAY;
  const fromDay = r.days === null ? null : dayOf(from);
  const notes: string[] = [];

  // ── who is in the cohort, and what each of them did ──
  const byUser = new Map<string, ConversationRow[]>();
  for (const cv of c.conversations) {
    const list = byUser.get(cv.userId) ?? [];
    list.push(cv);
    byUser.set(cv.userId, list);
  }
  const profiles = new Map(c.profiles.map((p) => [p.userId, p]));
  const dbUsers = new Set<string>([...byUser.keys(), ...profiles.keys()]);

  const accounts: AccountRow[] | null = c.accounts;
  if (accounts && dbUsers.size >= 5) {
    const ids = new Set(accounts.map((a) => a.id));
    const shared = [...dbUsers].filter((u) => ids.has(u)).length;
    if (shared / dbUsers.size < 0.2) {
      notes.push(
        `Only ${shared} of the ${dbUsers.size} people in the database are accounts in this deployment's Clerk instance. ` +
          'This usually means a preview using development Clerk keys against the production database: figures that join the two (surfaces, onboarding progress, plans) only count people found in both.'
      );
    }
  }
  if (!accounts) notes.push('Clerk could not be read, so the account-level figures below are built from the database alone: people who have saved something, not everyone who signed up.');

  // The cohort: accounts created in the range — or, without Clerk, people first seen in the database in it.
  type Member = { id: string; createdAt: number; account: AccountRow | null };
  const members: Member[] = accounts
    ? accounts.filter((a) => a.createdAt >= from).map((a) => ({ id: a.id, createdAt: a.createdAt, account: a }))
    : [...dbUsers]
        .map((id) => {
          const first = Math.min(...(byUser.get(id) ?? []).map((cv) => cv.createdAt), Infinity);
          return { id, createdAt: Number.isFinite(first) ? first : now, account: null };
        })
        .filter((m) => m.createdAt >= from);

  // ── KPIs ──
  const kpis: Kpi[] = [];
  const total = c.accountsTotal ?? accounts?.length ?? (accounts ? null : dbUsers.size);
  kpis.push({ id: 'accounts', label: 'Accounts', value: total, hint: accounts ? 'all time' : 'people in the database' });
  const prevFrom = r.days === null ? null : from - r.days * DAY;
  const newNow = members.length;
  const newPrev = accounts && prevFrom !== null ? accounts.filter((a) => a.createdAt >= prevFrom && a.createdAt < from).length : null;
  kpis.push({
    id: 'new',
    label: 'New accounts',
    value: newNow,
    hint: r.label.toLowerCase(),
    ...(newPrev !== null ? { delta: { n: newNow - newPrev, vs: `the ${r.days} days before` } } : {}),
  });
  const latest = (id: string, a: AccountRow | null): number => {
    const convo = Math.max(...(byUser.get(id) ?? []).map((cv) => cv.updatedAt), -Infinity);
    return Math.max(a?.lastSeenAt ?? -Infinity, convo);
  };
  const everyone: Member[] = accounts
    ? accounts.map((a) => ({ id: a.id, createdAt: a.createdAt, account: a }))
    : [...dbUsers].map((id) => ({ id, createdAt: 0, account: null }));
  const activeIn = (days: number) => everyone.filter((m) => latest(m.id, m.account) >= now - days * DAY).length;
  kpis.push({ id: 'active7', label: 'Active, last 7 days', value: activeIn(7), hint: 'signed in or thought' });
  kpis.push({ id: 'active30', label: 'Active, last 30 days', value: activeIn(30), hint: 'signed in or thought' });

  const subs = new Map(c.subscriptions.map((s) => [s.userId, s]));
  const promos = new Map(c.promos.map((p) => [p.userId, p]));
  const planOf = (id: string, a: AccountRow | null): Plan => {
    const s = subs.get(id);
    if ((s && entitledBy(s.status, s.periodEnd, now)) || a?.paidMirror) return 'paid';
    if (a?.studentUntil && a.studentUntil > now) return 'student';
    if (a?.granted) return 'granted';
    const p = promos.get(id);
    if (p?.promoUntil && p.promoUntil > now) return 'promo';
    return 'free';
  };
  const onOne = everyone.filter((m) => planOf(m.id, m.account) !== 'free');
  const paid = onOne.filter((m) => planOf(m.id, m.account) === 'paid').length;
  kpis.push({ id: 'one', label: 'On Socria One', value: onOne.length, hint: `${paid} paying` });

  const asked = new Set(c.mail.filter((m) => m.kind === 'newsletter').map((m) => m.userId));
  const stopped = new Set(c.mail.filter((m) => m.kind === 'unsubscribed').map((m) => m.userId));
  const subscribed = [...asked].filter((u) => !stopped.has(u));
  const base = total ?? 0;
  kpis.push({
    id: 'newsletter',
    label: 'Newsletter',
    value: subscribed.length,
    hint: base ? `${Math.round((100 * subscribed.length) / base)}% of accounts` : 'subscribed',
  });

  // ── sign-ups over time ──
  let signups: DashboardModel['signups'] = null;
  if (accounts) {
    const unit: 'day' | 'week' = r.days === null || r.days > 90 ? 'week' : 'day';
    const step = unit === 'day' ? DAY : 7 * DAY;
    const startOf = (t: number) => {
      const d = new Date(t);
      d.setUTCHours(0, 0, 0, 0);
      if (unit === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.getTime();
    };
    const first = r.days === null ? Math.min(...accounts.map((a) => a.createdAt), now) : from;
    const bins: { label: string; start: number; n: number }[] = [];
    for (let t = startOf(first); t <= now; t += step) {
      bins.push({ label: new Date(t).toISOString().slice(0, 10), start: t, n: 0 });
    }
    for (const a of members) {
      const s = startOf(a.createdAt);
      const b = bins.find((x) => x.start === s) ?? (s < (bins[0]?.start ?? 0) ? undefined : bins[bins.length - 1]);
      if (b) b.n++;
    }
    signups = { unit, bins, total: members.length };
  }

  // ── the onboarding funnel, per account ──
  let funnel: DashboardModel['funnel'] = null;
  if (members.length) {
    const reached = (m: Member, ms: Milestone) => typeof profiles.get(m.id)?.firstRun?.[ms] === 'number';
    funnel = {
      cohort: members.length,
      stages: FUNNEL.map((f) => ({ id: f.id, label: f.label, n: members.filter((m) => reached(m, f.id)).length })),
      introSkipped: members.filter((m) => profiles.get(m.id)?.skipped?.includes('socria.intro')).length,
      medianMinutesToThought: (() => {
        const xs = members
          .map((m) => profiles.get(m.id)?.firstRun?.['socria.thought'])
          .map((t, i) => (typeof t === 'number' ? Math.max(0, t - members[i].createdAt) / 60_000 : null))
          .filter((x): x is number => x !== null);
        return xs.length ? Math.round(median(xs)!) : null;
      })(),
    };
    notes.push('Onboarding milestones are stored on an account once it has synced from a signed-in browser, so the funnel is a floor: some people reached a step on a device that never synced.');
  }

  // ── the onboarding screen, from the first-party counters ──
  let onboarding: DashboardModel['onboarding'] = null;
  let sources: DashboardModel['sources'] = null;
  if (c.events === null) {
    notes.push('Onboarding answers and sign-up sources need the product_events table (supabase/schema.sql, then rls.sql). Counting starts the moment it exists; nothing before that was kept anywhere this page can read.');
  } else {
    const inRange = c.events.filter((e) => fromDay === null || e.day >= fromDay);
    const since = c.events.length ? c.events.map((e) => e.day).sort()[0] : null;
    const count = (event: string, kind?: string) => inRange.filter((e) => e.event === event && (kind === undefined || e.kind === kind)).reduce((s, e) => s + e.n, 0);
    const answer = (step: string, kind: string) => count('onboarding_answered', `${step}:${kind}`);
    const step = (id: StepAnswers['step'], title: string, question: string, bars: Bar[]): StepAnswers => ({ step: id, title, question, bars, total: bars.reduce((s, b) => s + b.n, 0) });
    const steps: StepAnswers[] = [
      step('who', 'What they think about', 'What do you mostly think about?', [
        ...ROLES.map((role) => ({ id: role.id, label: role.title, n: answer('who', role.id) })),
        { id: 'skipped', label: 'Rather not say', n: answer('who', 'skipped'), muted: true },
      ]),
      step('how', 'How they like to think', 'How do you like to think something through?', [
        // Logos 2 is no longer offered on this screen: shown only if somebody chose it within the range
        ...(Object.keys(START_MODEL_LABELS) as StartModel[]).map((m) => ({ id: m, label: START_MODEL_LABELS[m], n: answer('how', m) })).filter((b) => b.id !== 'logos-2' || b.n > 0),
        { id: 'skipped', label: 'Not sure yet — choose for me', n: answer('how', 'skipped'), muted: true },
      ]),
      step('thought', 'Their way in', 'What are you trying to figure out?', [
        ...INTENTS.map((i) => ({ id: i.id, label: i.title, n: answer('thought', i.id) })),
        { id: 'none', label: 'Just wrote, no starting point', n: answer('thought', 'none'), muted: true },
      ]),
      step('name', 'Their name', 'What should we call you?', [
        { id: 'given', label: 'Gave a name', n: answer('name', 'given') },
        { id: 'skipped', label: 'Rather not say', n: answer('name', 'skipped'), muted: true },
      ]),
      step('example', 'Used the example', 'The “For instance…” line under the field, by way in', INTENTS.map((i) => ({ id: i.id, label: i.title, n: answer('example', i.id) }))),
    ];
    const skipAt: Bar[] = (['premise', 'name', 'who', 'how', 'thought'] as const).map((s) => ({
      id: s,
      label: { premise: 'On the first screen', name: 'At the name', who: 'At "what do you think about"', how: 'At "how do you like to think"', thought: 'At the first thought' }[s],
      n: answer(s, 'skip_all'),
    }));
    onboarding = { since, opened: count('socria_intro_started'), steps, skipAt };

    const keyed = (prefix: string) => {
      const m = new Map<string, number>();
      for (const e of inRange) if (e.event === 'signup_completed' && e.kind.startsWith(prefix)) m.set(e.kind.slice(prefix.length), (m.get(e.kind.slice(prefix.length)) ?? 0) + e.n);
      return m;
    };
    const referrers = keyed('ref:');
    sources = {
      since,
      total: [...referrers.values()].reduce((s, n) => s + n, 0),
      referrers: sortedBars(referrers, named, (k) => k === 'unknown' || k === 'other'),
      landings: sortedBars(keyed('land:'), named, (k) => k === 'unknown' || k === 'other'),
      campaigns: sortedBars(keyed('utm:'), (k) => k),
    };
  }

  // ── composition of the cohort ──
  const surfaceOf = (id: string): 'core' | 'logos' | 'both' | 'none' => {
    const cs = byUser.get(id) ?? [];
    const core = cs.some((cv) => cv.kind !== 'logos');
    const logos = cs.some((cv) => cv.kind === 'logos');
    return core && logos ? 'both' : core ? 'core' : logos ? 'logos' : 'none';
  };
  const surfaces = tally(members.map((m) => surfaceOf(m.id)), ['core', 'logos', 'both', 'none'] as const, (k) => ({ core: 'Core only', logos: 'Logos only', both: 'Both', none: 'No conversations yet' })[k], ['none']);
  const styleOf = (id: string): ConversationStyle => {
    const s = profiles.get(id)?.style;
    return (CONVERSATION_STYLES as readonly string[]).includes(s ?? '') ? (s as ConversationStyle) : 'thinker';
  };
  const styles = tally(members.map((m) => styleOf(m.id)), CONVERSATION_STYLES, (k) => (k === 'thinker' ? `${STYLE_META[k].label} (the default)` : STYLE_META[k].label));
  const kindOfEmail = (a: AccountRow | null): 'academic' | 'personal' | 'work' | 'none' =>
    !a?.domain ? 'none' : a.academic || isAcademicDomain(a.domain) ? 'academic' : PERSONAL_DOMAINS.has(a.domain) ? 'personal' : 'work';
  const emails = tally(members.map((m) => kindOfEmail(m.account)), ['academic', 'personal', 'work', 'none'] as const, (k) => ({ academic: 'University address', personal: 'Personal address', work: 'Work or other domain', none: 'No address' })[k], ['none']);
  const domainCounts = new Map<string, number>();
  for (const a of accounts ?? []) if (a.domain) domainCounts.set(a.domain, (domainCounts.get(a.domain) ?? 0) + 1);
  const cohortDomains = new Map<string, number>();
  for (const m of members) {
    const d = m.account?.domain;
    if (d && (domainCounts.get(d) ?? 0) >= DOMAIN_FLOOR) cohortDomains.set(d, (cohortDomains.get(d) ?? 0) + 1);
  }
  const domains = sortedBars(cohortDomains, (k) => k, () => false, 8);
  // Providers nobody in the range used are noise in a list of how people sign in.
  const methods = tally(members.filter((m) => m.account).map((m) => primaryMethod(m.account!.methods)), METHOD_ORDER, (k) => METHOD_LABEL[k]).filter((b) => b.n > 0);
  const plans = tally(members.map((m) => planOf(m.id, m.account)), PLAN_ORDER, (k) => PLAN_LABEL[k], ['free']);

  // ── engagement ──
  const counts = members.map((m) => (byUser.get(m.id) ?? []).length);
  const bins: [string, (n: number) => boolean][] = [
    ['0', (n) => n === 0], ['1', (n) => n === 1], ['2–4', (n) => n >= 2 && n <= 4], ['5–9', (n) => n >= 5 && n <= 9], ['10–24', (n) => n >= 10 && n <= 24], ['25+', (n) => n >= 25],
  ];
  const histogram: Bar[] = bins.map(([label, test]) => ({ id: label, label, n: counts.filter(test).length, ...(label === '0' ? { muted: true } : {}) }));
  const settled = members.filter((m) => m.createdAt <= now - 2 * DAY);
  const returned = settled.length
    ? { n: settled.filter((m) => (byUser.get(m.id) ?? []).some((cv) => cv.updatedAt >= m.createdAt + DAY)).length, of: settled.length }
    : null;
  const active = counts.filter((n) => n > 0);

  // ── rewards, in the range ──
  const rewards = {
    referralSignups: c.referrals.filter((x) => x.createdAt >= from).length,
    referralActivations: c.referrals.filter((x) => (x.activatedAt ?? -Infinity) >= from).length,
    challenges: c.grants.filter((g) => g.source === 'challenge' && g.createdAt >= from).length,
    promoActive: c.promos.filter((p) => (p.promoUntil ?? 0) > now).length,
  };

  // ── the latest sign-ups, without anyone's identity ──
  const shownDomain = (a: AccountRow | null): string => {
    if (!a?.domain) return 'no address';
    if (PERSONAL_DOMAINS.has(a.domain)) return a.domain;
    if ((domainCounts.get(a.domain) ?? 0) >= DOMAIN_FLOOR) return a.domain;
    return a.academic || isAcademicDomain(a.domain) ? 'university address' : 'work or other domain';
  };
  const recent: RecentRow[] = [...members]
    .sort((x, y) => y.createdAt - x.createdAt)
    .slice(0, 25)
    .map((m) => {
      const cs = byUser.get(m.id) ?? [];
      return {
        createdAt: m.createdAt,
        domain: shownDomain(m.account),
        method: m.account ? METHOD_LABEL[primaryMethod(m.account.methods)] : '—',
        thought: typeof profiles.get(m.id)?.firstRun?.['socria.thought'] === 'number',
        core: cs.filter((cv) => cv.kind !== 'logos').length,
        logos: cs.filter((cv) => cv.kind === 'logos').length,
        plan: PLAN_LABEL[planOf(m.id, m.account)],
        newsletter: asked.has(m.id) && !stopped.has(m.id),
      };
    });

  for (const h of c.health) {
    if (h.state === 'truncated') notes.push(`${h.label} was read up to its cap (${h.rows.toLocaleString('en-US')} rows); figures from it are a floor.`);
  }

  return {
    generatedAt: now,
    env: c.env,
    range,
    rangeLabel: r.label,
    kpis,
    signups,
    funnel,
    onboarding,
    composition: {
      base: members.length,
      baseLabel: accounts ? `accounts created ${r.days === null ? 'at any time' : `in the ${r.label.toLowerCase()}`}` : 'people first seen in the database in this range',
      surfaces,
      styles,
      emails,
      domains,
      methods,
      plans,
    },
    sources,
    engagement: { histogram, returned, medianConversations: median(active) },
    rewards,
    recent,
    notes,
    health: c.health,
  };
}
