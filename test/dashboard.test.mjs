// The developer dashboard: who may see it, what the counters may hold, what
// the numbers add up to, and what the page shows — and never shows.
//
// The aggregation is checked against a small fixture written by hand, so
// every expected number below can be worked out on paper from the rows.

import {
  Dashboard,
  aggregate,
  isAcademicDomain,
  mayViewDashboard,
  parseAdmins,
  parseRange,
  kindsFor,
  answerAllowed,
  dayOf,
  COUNTED_EVENTS,
  isCounted,
  countFirstParty,
  INTENTS,
  ROLES,
} from './.tmp/dashboard-under-test.mjs';
import { makeCollected } from './helpers/dashboard-fixture.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);

console.log('=== the gate: nobody, unless named ===');
{
  const me = { id: 'user_abc123', emails: [{ address: 'Founder@Example.com', verified: true }] };
  ok('unset: nobody', !mayViewDashboard(me, undefined) && !mayViewDashboard(me, ''));
  ok('signed out: nobody, whatever the list says', !mayViewDashboard(null, 'founder@example.com'));
  ok('a verified address on the list, in any case', mayViewDashboard(me, 'founder@example.com'));
  ok('a Clerk user id on the list', mayViewDashboard(me, 'someone@else.com, user_abc123'));
  const sneaky = { id: 'user_zzz', emails: [{ address: 'founder@example.com', verified: false }] };
  ok('an UNVERIFIED address does not count — anyone can type one into their account', !mayViewDashboard(sneaky, 'founder@example.com'));
  ok('someone else is turned away', !mayViewDashboard({ id: 'user_other', emails: [{ address: 'x@y.com', verified: true }] }, 'founder@example.com user_abc123'));
  const a = parseAdmins(' a@b.co ;user_X1, not-an-entry  C@D.org ');
  ok('the list parses addresses and ids, and ignores the rest', a.emails.has('a@b.co') && a.emails.has('c@d.org') && a.ids.has('user_X1') && a.emails.size === 2 && a.ids.size === 1);
}

console.log('=== the onboarding screen sends kinds, never words ===');
{
  // The server refuses anything else (below, and test/dashboard-e2e); this
  // pins the call sites, so a redesign of the screen keeps sending kinds.
  const src = readFileSync(join(root, 'components/onboarding/FirstRunIntro.tsx'), 'utf8');
  const calls = [...src.matchAll(/answer\('(\w+)', ([^)]+)\)/g)].map((m) => [m[1], m[2].trim()]);
  ok('every step of the screen is counted, and the Skip button on any of them', ['premise', 'name', 'who', 'how', 'thought', 'example'].every((st) => calls.some(([c]) => c === st)) && /answer\(beat, 'skip_all'\)/.test(src), JSON.stringify(calls));
  ok('for the name, only whether one was kept', calls.filter(([c]) => c === 'name').every(([, k]) => k === "clean ? 'given' : 'skipped'"));
  ok('for the first thought, only its starting point', calls.filter(([c]) => c === 'thought').every(([, k]) => k === "intent?.id ?? 'none'"));
  ok('the event is sent from one place', (src.match(/track\('onboarding_answered'/g) ?? []).length === 1);
}

console.log('=== the counters hold tokens from fixed vocabularies, never text ===');
{
  ok('a role answer', JSON.stringify(kindsFor('onboarding_answered', { step: 'who', kind: 'study' })) === '["who:study"]');
  ok('a model answer', JSON.stringify(kindsFor('onboarding_answered', { step: 'how', kind: 'logos-3' })) === '["how:logos-3"]');
  ok('a starting point', JSON.stringify(kindsFor('onboarding_answered', { step: 'thought', kind: 'understand' })) === '["thought:understand"]');
  ok('the Skip button, on a step', JSON.stringify(kindsFor('onboarding_answered', { step: 'who', kind: 'skip_all' })) === '["who:skip_all"]');
  ok('a name is never a kind: only whether one was given', kindsFor('onboarding_answered', { step: 'name', kind: 'Pradeep' }) === null && JSON.stringify(kindsFor('onboarding_answered', { step: 'name', kind: 'given' })) === '["name:given"]');
  ok('a made-up role is refused', kindsFor('onboarding_answered', { step: 'who', kind: 'astronaut' }) === null);
  ok('free text is refused', kindsFor('onboarding_answered', { step: 'thought', kind: 'I want to quit my job' }) === null);
  ok('an unknown step is refused', kindsFor('onboarding_answered', { step: 'secret', kind: 'x' }) === null);
  ok('an event that is not counted is refused', kindsFor('one_prompt_shown', {}) === null && kindsFor(42, {}) === null);
  ok('a sign-up: its referrer and landing kinds, and the campaign', JSON.stringify(kindsFor('signup_completed', { referrer: 'google', landing: 'students', utm_source: 'uta-flyer' })) === '["ref:google","land:students","utm:uta-flyer"]');
  ok('a referrer outside the vocabulary becomes unknown, not text', JSON.stringify(kindsFor('signup_completed', { referrer: 'evil.example.com/?q=me', landing: 'home' })) === '["ref:unknown","land:home"]');
  ok('a campaign tag with spaces or capitals is dropped', JSON.stringify(kindsFor('signup_completed', { referrer: 'direct', landing: 'home', utm_source: 'Hello World' })) === '["ref:direct","land:home"]');
  ok('a milestone counts by surface', JSON.stringify(kindsFor('first_thought_submitted', { surface: 'logos' })) === '["logos"]' && JSON.stringify(kindsFor('socria_intro_started', { surface: 'mars' })) === '["any"]');
  ok('every role, model and starting point is an allowed answer', ROLES.every((r) => answerAllowed('who', r.id)) && INTENTS.every((i) => answerAllowed('thought', i.id)) && ['core-4', 'logos-2', 'logos-3'].every((m) => answerAllowed('how', m)));
  ok('the counted events include every onboarding answer and the sign-up', isCounted('onboarding_answered') && isCounted('signup_completed') && !isCounted('one_checkout_started') && COUNTED_EVENTS.length >= 10);
  ok('the day is the UTC day', dayOf(Date.UTC(2026, 9, 14, 23, 59)) === '2026-10-14');
  let threw = false;
  try {
    countFirstParty('onboarding_answered', { step: 'who', kind: 'study' });
  } catch {
    threw = true;
  }
  ok('the beacon is a no-op without a browser, never a throw', !threw);
}

// ── a fixture small enough to check by hand ──
const acct = (id, ageDays, o = {}) => ({
  id, createdAt: NOW - ageDays * DAY - (o.extraMs ?? 0), lastSeenAt: o.seenDaysAgo === undefined ? null : NOW - o.seenDaysAgo * DAY,
  domain: o.domain ?? null, academic: !!o.academic, methods: o.methods ?? ['email-code'], granted: !!o.granted, paidMirror: false, studentUntil: o.studentUntil ?? null,
});
const a1 = acct('user_a1', 2, { extraMs: 2 * HOUR, seenDaysAgo: 1 / 24, domain: 'gmail.com', methods: ['google'] });
const a2 = acct('user_a2', 10, { seenDaysAgo: 9, domain: 'mavs.uta.edu', academic: true, studentUntil: NOW + 20 * DAY });
const a3 = acct('user_a3', 40, { seenDaysAgo: 3, domain: 'acme.io', methods: ['google'], granted: true });
const a4 = acct('user_a4', 50, { domain: 'acme.io' });
const a5 = acct('user_a5', 100, { seenDaysAgo: 60, domain: 'acme.io', methods: ['password'] });
const a6 = acct('user_a6', 5, { seenDaysAgo: 4, domain: 'rare-startup.io', methods: ['github'] });
const a7 = acct('user_a7', 20, { domain: 'outlook.com', methods: ['apple'] });
const accounts = [a1, a2, a3, a4, a5, a6, a7];
const day = (d) => new Date(NOW - d * DAY).toISOString().slice(0, 10);
const base = () => ({
  now: NOW,
  env: 'production',
  accounts,
  accountsTotal: 7,
  profiles: [
    { userId: 'user_a1', firstRun: { 'socria.intro': a1.createdAt + 60_000, 'socria.thought': a1.createdAt + 10 * 60_000, 'core.first': a1.createdAt + 11 * 60_000 }, skipped: [], style: null },
    { userId: 'user_a2', firstRun: { 'socria.intro': a2.createdAt + 60_000, 'socria.thought': a2.createdAt + 30 * 60_000, 'logos.model': a2.createdAt + 31 * 60_000 }, skipped: ['socria.intro'], style: 'direct' },
    { userId: 'user_a6', firstRun: { 'socria.intro': a6.createdAt + 60_000 }, skipped: [], style: 'challenger' },
    { userId: 'user_a3', firstRun: { 'socria.intro': a3.createdAt, 'socria.thought': a3.createdAt + HOUR, 'core.first': a3.createdAt + HOUR, 'core.aha': a3.createdAt + 2 * HOUR }, skipped: [], style: null },
  ],
  conversations: [
    { userId: 'user_a1', kind: 'chat', createdAt: a1.createdAt + HOUR, updatedAt: a1.createdAt + HOUR },
    { userId: 'user_a1', kind: 'chat', createdAt: a1.createdAt + 26 * HOUR, updatedAt: a1.createdAt + 26 * HOUR },
    { userId: 'user_a2', kind: 'logos', createdAt: a2.createdAt + HOUR, updatedAt: a2.createdAt + 2 * HOUR },
    { userId: 'user_a3', kind: 'chat', createdAt: a3.createdAt, updatedAt: a3.createdAt + 5 * DAY },
    { userId: 'user_a3', kind: 'chat', createdAt: a3.createdAt, updatedAt: a3.createdAt },
    { userId: 'user_a3', kind: 'chat', createdAt: a3.createdAt, updatedAt: a3.createdAt },
    { userId: 'user_a3', kind: 'logos', createdAt: a3.createdAt, updatedAt: a3.createdAt },
    { userId: 'user_db_only', kind: 'chat', createdAt: NOW - 3 * DAY, updatedAt: NOW - 3 * DAY },
  ],
  subscriptions: [{ userId: 'user_a3', status: 'active', periodEnd: Math.floor((NOW + 10 * DAY) / 1000), cancelAtPeriodEnd: false }],
  mail: [{ userId: 'user_a1', kind: 'newsletter' }, { userId: 'user_a2', kind: 'newsletter' }, { userId: 'user_a2', kind: 'unsubscribed' }, { userId: 'user_a7', kind: 'newsletter' }],
  referrals: [{ userId: 'user_a6', via: 'link', createdAt: a6.createdAt, activatedAt: null }, { userId: 'user_a7', via: 'invite', createdAt: a7.createdAt, activatedAt: a7.createdAt + DAY }],
  grants: [{ source: 'challenge', createdAt: NOW - 3 * DAY }, { source: 'challenge', createdAt: NOW - 40 * DAY }],
  promos: [{ userId: 'user_a7', promoUntil: NOW + 2 * DAY }],
  events: [
    { day: day(1), event: 'onboarding_answered', kind: 'who:study', n: 3 },
    { day: day(2), event: 'onboarding_answered', kind: 'who:build', n: 1 },
    { day: day(2), event: 'onboarding_answered', kind: 'who:skipped', n: 2 },
    { day: day(2), event: 'onboarding_answered', kind: 'who:skip_all', n: 1 },
    { day: day(3), event: 'onboarding_answered', kind: 'premise:skip_all', n: 1 },
    { day: day(3), event: 'onboarding_answered', kind: 'how:core-4', n: 2 },
    { day: day(3), event: 'onboarding_answered', kind: 'how:logos-3', n: 1 },
    { day: day(4), event: 'onboarding_answered', kind: 'thought:understand', n: 2 },
    { day: day(4), event: 'onboarding_answered', kind: 'thought:none', n: 1 },
    { day: day(4), event: 'onboarding_answered', kind: 'name:given', n: 3 },
    { day: day(4), event: 'onboarding_answered', kind: 'name:skipped', n: 1 },
    { day: day(5), event: 'socria_intro_started', kind: 'core', n: 5 },
    { day: day(5), event: 'signup_completed', kind: 'ref:google', n: 2 },
    { day: day(5), event: 'signup_completed', kind: 'land:home', n: 2 },
    { day: day(5), event: 'signup_completed', kind: 'utm:spring', n: 1 },
    { day: day(60), event: 'onboarding_answered', kind: 'who:study', n: 10 },
  ],
  health: [{ id: 'clerk', label: 'Accounts (Clerk)', state: 'ok', rows: 7 }],
});
const bar = (bars, id) => bars.find((b) => b.id === id)?.n;
const kpi = (m, id) => m.kpis.find((k) => k.id === id);

console.log('=== the headline numbers ===');
const m = aggregate(base(), '30');
{
  ok('accounts, all time', kpi(m, 'accounts').value === 7);
  ok('new in the last 30 days: a1, a2, a6, a7', kpi(m, 'new').value === 4, JSON.stringify(kpi(m, 'new')));
  ok('…against 2 in the 30 days before (a3, a4)', kpi(m, 'new').delta?.n === 2);
  ok('active in 7 days: a1, a3, a6', kpi(m, 'active7').value === 3, String(kpi(m, 'active7').value));
  ok('active in 30 days: and a2', kpi(m, 'active30').value === 4, String(kpi(m, 'active30').value));
  ok('on Socria One: a2 (student), a3 (paid), a7 (Rewards)', kpi(m, 'one').value === 3 && /1 paying/.test(kpi(m, 'one').hint), JSON.stringify(kpi(m, 'one')));
  ok('newsletter: a1 and a7 — a2 asked, then unsubscribed', kpi(m, 'newsletter').value === 2 && /29%/.test(kpi(m, 'newsletter').hint), JSON.stringify(kpi(m, 'newsletter')));
  ok('the people in both systems agree, so no mismatch is reported', !m.notes.some((n) => /Clerk instance/.test(n)));
}

console.log('=== the onboarding funnel, per account ===');
{
  const f = m.funnel;
  ok('the cohort is the 4 new accounts', f.cohort === 4);
  ok('3 got through the intro (a7 never synced)', bar(f.stages, 'socria.intro') === 3);
  ok('2 wrote a first thought', bar(f.stages, 'socria.thought') === 2);
  ok('1 got a first Core reply, 0 kept going, 1 got a Logos map', bar(f.stages, 'core.first') === 1 && bar(f.stages, 'core.aha') === 0 && bar(f.stages, 'logos.model') === 1);
  ok('1 skipped the intro rather than finished it', f.introSkipped === 1);
  ok('median minutes to a first thought: 10 and 30 → 20', f.medianMinutesToThought === 20);
  ok('the funnel says it is a floor', m.notes.some((n) => /floor/.test(n)));
}

console.log('=== the onboarding screen, from the counters ===');
{
  const o = m.onboarding;
  const step = (s) => o.steps.find((x) => x.step === s);
  ok('"what do you think about": 3 studying, 1 building, 2 rather not say — the 60-day-old 10 left out', bar(step('who').bars, 'study') === 3 && bar(step('who').bars, 'build') === 1 && bar(step('who').bars, 'skipped') === 2);
  ok('"how do you like to think": 2 Core, 1 Logos 3.5 — and Logos 2, offered nowhere now, not listed', bar(step('how').bars, 'core-4') === 2 && bar(step('how').bars, 'logos-3') === 1 && !step('how').bars.some((b) => b.id === 'logos-2'));
  ok('the way in: 2 understand, 1 just wrote', bar(step('thought').bars, 'understand') === 2 && bar(step('thought').bars, 'none') === 1);
  ok('the name: 3 gave one, 1 rather not', bar(step('name').bars, 'given') === 3 && bar(step('name').bars, 'skipped') === 1);
  ok('Skip pressed on the first screen once and at "who" once', bar(o.skipAt, 'premise') === 1 && bar(o.skipAt, 'who') === 1);
  ok('5 opened it', o.opened === 5);
  ok('"skipped" is drawn as context, not as a choice', step('who').bars.find((b) => b.id === 'skipped').muted === true);
  ok('it says when counting began', o.since === day(60));
  const all = aggregate(base(), 'all');
  ok('all time includes the old answers: 13 studying', bar(all.onboarding.steps.find((x) => x.step === 'who').bars, 'study') === 13);
}

console.log('=== where they came from ===');
{
  ok('referrers, landings and campaigns, named', bar(m.sources.referrers, 'google') === 2 && m.sources.referrers[0].label === 'Google' && bar(m.sources.landings, 'home') === 2 && bar(m.sources.campaigns, 'spring') === 1);
  ok('2 sign-ups recorded with a first touch', m.sources.total === 2);
}

console.log('=== who they are ===');
{
  const c = m.composition;
  ok('surfaces: 1 Core, 1 Logos, 2 with nothing yet', bar(c.surfaces, 'core') === 1 && bar(c.surfaces, 'logos') === 1 && bar(c.surfaces, 'both') === 0 && bar(c.surfaces, 'none') === 2);
  ok('styles: 2 the default Thinker, 1 Direct, 1 Challenger', bar(c.styles, 'thinker') === 2 && bar(c.styles, 'direct') === 1 && bar(c.styles, 'challenger') === 1);
  ok('addresses: 1 university, 2 personal, 1 work', bar(c.emails, 'academic') === 1 && bar(c.emails, 'personal') === 2 && bar(c.emails, 'work') === 1);
  ok('no domain in this cohort is shared by three accounts, so none is named', c.domains.length === 0);
  ok('sign-in: Google, Apple, GitHub and an email code — and no zero rows', c.methods.length === 4 && c.methods.every((b) => b.n === 1));
  ok('plans: 1 student month, 1 from Rewards, 2 free', bar(c.plans, 'student') === 1 && bar(c.plans, 'promo') === 1 && bar(c.plans, 'free') === 2 && bar(c.plans, 'paid') === 0);
  const older = aggregate(base(), 'all');
  ok('over all time, acme.io (3 accounts) is named', bar(older.composition.domains, 'acme.io') === 3);
  ok('a paid subscription outranks a grant', bar(older.composition.plans, 'paid') === 1 && bar(older.composition.plans, 'granted') === 0);
  ok('university addresses are recognised by domain', isAcademicDomain('mavs.uta.edu') && isAcademicDomain('cam.ac.uk') && isAcademicDomain('unimelb.edu.au') && !isAcademicDomain('gmail.com') && !isAcademicDomain('education.com'));
}

console.log('=== did they stay ===');
{
  const e = m.engagement;
  ok('conversations per account: two with none, one with 1, one with 2', bar(e.histogram, '0') === 2 && bar(e.histogram, '1') === 1 && bar(e.histogram, '2–4') === 1);
  ok('came back after day one: a1 of the four old enough', e.returned?.n === 1 && e.returned?.of === 4, JSON.stringify(e.returned));
  ok('median conversations among those with any: 1.5', e.medianConversations === 1.5);
}

console.log('=== rewards in the range ===');
{
  ok('2 joined from a referral, 1 activated, 1 challenge, 1 in a promo window', m.rewards.referralSignups === 2 && m.rewards.referralActivations === 1 && m.rewards.challenges === 1 && m.rewards.promoActive === 1, JSON.stringify(m.rewards));
}

console.log('=== the recent sign-ups list names nobody ===');
{
  const r = m.recent;
  ok('newest first', r[0].createdAt >= r[1].createdAt && r.length === 4);
  ok('a public provider is shown', r[0].domain === 'gmail.com');
  ok('a domain only one account has is not', r.find((x) => x.method === 'GitHub').domain === 'work or other domain');
  ok('a university only one account has is a kind of address, not its name', r.some((x) => x.domain === 'university address') && !r.some((x) => x.domain === 'mavs.uta.edu'));
  ok('a person who unsubscribed is shown as not subscribed', r.find((x) => x.domain === 'university address').newsletter === false);
  const three = aggregate({ ...base(), accounts: [...accounts, acct('user_a8', 3, { domain: 'mavs.uta.edu', academic: true }), acct('user_a9', 4, { domain: 'mavs.uta.edu', academic: true })], accountsTotal: 9 }, '30');
  ok('…and its name once three accounts share it', three.recent.filter((x) => x.domain === 'mavs.uta.edu').length === 3);
  ok('no row carries an id', !JSON.stringify(r).includes('user_'));
}

console.log('=== partial data is said, not hidden ===');
{
  const noClerk = aggregate({ ...base(), accounts: null, accountsTotal: null }, '30');
  ok('without Clerk: said, and built from the database', noClerk.notes.some((n) => /Clerk could not be read/.test(n)) && noClerk.composition.base > 0 && noClerk.signups === null);
  const noTable = aggregate({ ...base(), events: null }, '30');
  ok('without the counters table: said, with what to run', noTable.onboarding === null && noTable.sources === null && noTable.notes.some((n) => /product_events/.test(n)));
  const strangers = aggregate({ ...base(), accounts: [acct('user_x1', 1), acct('user_x2', 2)], accountsTotal: 2 }, '30');
  ok('a preview whose Clerk is not the database\'s: flagged', strangers.notes.some((n) => /Clerk instance/.test(n)));
  const capped = aggregate({ ...base(), health: [{ id: 'conversations', label: 'Conversations', state: 'truncated', rows: 200000 }] }, '30');
  ok('a capped read is a floor, and says so', capped.notes.some((n) => /cap/.test(n)));
  ok('the range defaults to 30 days', parseRange('garbage') === '30' && parseRange('all') === 'all');
}

console.log('=== the page: what it shows, and what it never does ===');
{
  const big = aggregate(makeCollected(), '30');
  const html = renderToStaticMarkup(h(Dashboard, { model: big }));
  ok('it renders the sections', ['Sign-ups', 'Onboarding', 'Who they are', 'Where they came from', 'Did they stay', 'Rewards', 'Recent sign-ups', 'Data sources'].every((s) => html.includes(s)));
  ok('no email address anywhere — not one @', !html.includes('@'));
  ok('no account id anywhere', !/user_fx/.test(html));
  ok('every chart has a table view', (html.match(/Show as a table/g) ?? []).length >= 15, String((html.match(/Show as a table/g) ?? []).length));
  ok('marks are focusable and labelled', /tabindex="0"/.test(html) && /data-tip-value=/.test(html) && /aria-label="[^"]+: \d+/.test(html));
  ok('the current range is marked', /aria-current="page"[^>]*>(<span aria-hidden="true">✓ <\/span>)?Last 30 days/.test(html));
  ok('the environment is labelled', html.includes('Production'));
  const empty = renderToStaticMarkup(h(Dashboard, { model: aggregate({ ...makeCollected({ events: false }), accounts: [], accountsTotal: 0 }, '7') }));
  ok('an empty deployment renders, and says what is missing', empty.includes('product_events') && !empty.includes('NaN'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
