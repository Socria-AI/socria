// A believable, deterministic Collected for the developer dashboard
// (lib/dashboard/types.ts) — for the visual check and the render tests.
//
// Synthetic from end to end: generated ids, generic domains, no real person.
// Seeded, so the same call draws the same dashboard every time.

const DAY = 86_400_000;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick from [[value, weight], …]. */
const pick = (r, table) => {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of table) if ((x -= w) < 0) return v;
  return table[table.length - 1][0];
};

export const FIXTURE_NOW = Date.UTC(2026, 9, 14, 15, 0, 0);

export function makeCollected({ now = FIXTURE_NOW, n = 260, seed = 7, events = true } = {}) {
  const r = rng(seed);
  const accounts = [];
  const profiles = [];
  const conversations = [];
  const subscriptions = [];
  const mail = [];
  const referrals = [];
  const grants = [];
  const promos = [];
  for (let i = 0; i < n; i++) {
    // more of them recently: a product that is growing
    const age = Math.floor(120 * Math.pow(r(), 1.7) * DAY);
    const createdAt = now - age - Math.floor(r() * DAY);
    const domain = pick(r, [['gmail.com', 52], ['outlook.com', 9], ['icloud.com', 5], ['yahoo.com', 4], ['mavs.uta.edu', 15], ['acme-labs.io', 4], ['northwind.example', 3], [`solo${i}.example`, 8]]);
    const academic = domain.endsWith('.edu');
    const methods = [pick(r, [['google', 60], ['email-code', 34], ['apple', 4], ['github', 2]])];
    const active = r() < 0.62;
    const lastSeenAt = active ? Math.min(now, createdAt + Math.floor(r() * (now - createdAt))) : createdAt + Math.floor(r() * DAY);
    const studentUntil = academic && r() < 0.45 ? createdAt + 30 * DAY : null;
    const id = `user_fx${String(i).padStart(4, '0')}`;
    accounts.push({ id, createdAt, lastSeenAt, domain, academic, methods, granted: r() < 0.01, paidMirror: false, studentUntil });

    if (r() < 0.86) {
      const at = {};
      const t = (p, after) => (r() < p ? createdAt + Math.floor(r() * after) : null);
      const intro = t(0.95, 600_000);
      if (intro) at['socria.intro'] = intro;
      const thought = intro && t(0.78, 3_600_000);
      if (thought) at['socria.thought'] = thought;
      if (thought && r() < 0.62) {
        at['core.first'] = thought + 30_000;
        if (r() < 0.6) at['core.aha'] = thought + 400_000;
      }
      if (thought && r() < 0.42) {
        at['logos.first'] = thought + 40_000;
        at['logos.model'] = thought + 60_000;
        if (r() < 0.6) at['logos.manipulated'] = thought + 200_000;
        if (r() < 0.4) at['logos.aha'] = thought + 900_000;
      }
      profiles.push({ userId: id, firstRun: at, skipped: intro && r() < 0.22 ? ['socria.intro'] : [], style: pick(r, [[null, 70], ['direct', 12], ['challenger', 10], ['companion', 8]]) });
    }

    const nConvos = pick(r, [[0, 24], [1, 20], [() => 2 + Math.floor(r() * 3), 25], [() => 5 + Math.floor(r() * 5), 16], [() => 10 + Math.floor(r() * 15), 10], [() => 25 + Math.floor(r() * 40), 5]]);
    const count = typeof nConvos === 'function' ? nConvos() : nConvos;
    const logosShare = pick(r, [[0, 45], [0.5, 30], [1, 25]]);
    for (let k = 0; k < count; k++) {
      const c = createdAt + Math.floor(r() * Math.max(DAY, (now - createdAt) * 0.9));
      conversations.push({ userId: id, kind: r() < logosShare ? 'logos' : 'chat', createdAt: c, updatedAt: Math.min(now, c + Math.floor(r() * 3 * DAY)) });
    }

    const plan = pick(r, [['none', 90], ['active', 6], ['past_due', 1], ['canceled', 3]]);
    if (plan !== 'none') subscriptions.push({ userId: id, status: plan, periodEnd: Math.floor((now + (plan === 'canceled' ? -5 : 20) * DAY) / 1000), cancelAtPeriodEnd: plan === 'canceled' });
    if (r() < 0.56) mail.push({ userId: id, kind: 'newsletter' });
    if (r() < 0.05) mail.push({ userId: id, kind: 'unsubscribed' });
    if (r() < 0.08) referrals.push({ userId: id, via: r() < 0.7 ? 'link' : 'invite', createdAt, activatedAt: r() < 0.5 ? createdAt + 2 * DAY : null });
    if (r() < 0.05) grants.push({ source: 'challenge', createdAt: createdAt + DAY });
    if (r() < 0.03) promos.push({ userId: id, promoUntil: now + 5 * DAY });
  }

  const ev = [];
  if (events) {
    const add = (day, event, kind, n) => n > 0 && ev.push({ day, event, kind, n });
    for (let d = 0; d < 60; d++) {
      const day = new Date(now - d * DAY).toISOString().slice(0, 10);
      const opened = 6 + Math.floor(r() * 10) + Math.floor((60 - d) / 6);
      add(day, 'socria_intro_started', 'core', Math.round(opened * 0.7));
      add(day, 'socria_intro_started', 'logos', Math.round(opened * 0.3));
      const w = (p) => Math.round(opened * p * (0.8 + 0.4 * r()));
      add(day, 'onboarding_answered', 'premise:continued', w(0.9));
      add(day, 'onboarding_answered', 'premise:skip_all', w(0.06));
      add(day, 'onboarding_answered', 'name:given', w(0.62));
      add(day, 'onboarding_answered', 'name:skipped', w(0.24));
      for (const [k, p] of [['study', 0.33], ['build', 0.15], ['research', 0.08], ['create', 0.07], ['lead', 0.05], ['care', 0.03], ['life', 0.06], ['skipped', 0.07], ['skip_all', 0.03]]) add(day, 'onboarding_answered', `who:${k}`, w(p));
      for (const [k, p] of [['core-4', 0.36], ['logos-3', 0.27], ['skipped', 0.14], ['skip_all', 0.01]]) add(day, 'onboarding_answered', `how:${k}`, w(p));
      for (const [k, p] of [['decide', 0.13], ['understand', 0.26], ['develop', 0.1], ['problem', 0.15], ['research', 0.05], ['none', 0.06], ['skip_all', 0.04]]) add(day, 'onboarding_answered', `thought:${k}`, w(p));
      for (const [k, p] of [['understand', 0.05], ['decide', 0.03], ['problem', 0.02]]) add(day, 'onboarding_answered', `example:${k}`, w(p));
      add(day, 'first_thought_submitted', 'core', w(0.46));
      add(day, 'first_thought_submitted', 'logos', w(0.24));
      const signed = Math.round(opened * 0.35);
      for (const [k, p] of [['google', 0.3], ['direct', 0.24], ['unknown', 0.2], ['uta', 0.08], ['chatgpt', 0.06], ['reddit', 0.06], ['other', 0.06]]) add(day, 'signup_completed', `ref:${k}`, Math.round(signed * p));
      for (const [k, p] of [['home', 0.44], ['students', 0.15], ['docs', 0.12], ['sign-up', 0.1], ['blog', 0.06], ['unknown', 0.13]]) add(day, 'signup_completed', `land:${k}`, Math.round(signed * p));
      if (d % 5 === 0) add(day, 'signup_completed', 'utm:reddit-launch', 2);
      if (d % 9 === 0) add(day, 'signup_completed', 'utm:uta-flyer', 3);
    }
  }

  const ok = (id, label, rows) => ({ id, label, state: 'ok', rows });
  return {
    now,
    env: 'production',
    accounts,
    accountsTotal: accounts.length,
    profiles,
    conversations,
    subscriptions,
    mail,
    referrals,
    grants,
    promos,
    events: events ? ev : null,
    health: [
      ok('clerk', 'Accounts (Clerk)', accounts.length),
      ok('profiles', 'Onboarding progress and style (user_profiles)', profiles.length),
      ok('conversations', 'Conversations (owner, kind and times only)', conversations.length),
      ok('subscriptions', 'Subscriptions', subscriptions.length),
      ok('mail', 'Newsletter ledger', mail.length),
      ok('referrals', 'Referrals', referrals.length),
      ok('grants', 'Rewards grants', grants.length),
      ok('promos', 'Rewards promo windows', promos.length),
      events ? ok('events', 'Onboarding counters (product_events)', ev.length) : { id: 'events', label: 'Onboarding counters (product_events)', state: 'missing', rows: 0, note: 'the product_events table does not exist here' },
    ],
  };
}
