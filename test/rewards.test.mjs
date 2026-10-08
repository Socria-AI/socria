// Socria Rewards — the 5-Node Challenge, Give 7 / Get 7, and the promotional
// entitlement engine both of them grant through.
//
// What is pinned here, and why each matters:
//   - a reward applies once, however it is retried, raced or interrupted;
//   - limits (the 30-day bank, four rewarded referrals a month) are checked
//     where they are spent, so concurrent rewards cannot both see room;
//   - paid access is never reduced, replaced or touched: rewards earned while
//     paying are banked, and time running when someone pays is paused;
//   - the challenge counts meaningful, connected nodes the person made, from
//     the stored map, and a starting card sent unchanged is not their words;
//   - only genuinely new accounts are referred, never one's own, never twice;
//   - referral rewards go to the direct referrer only (A→B→C pays B for C).

import { rewardsConfig, DISPOSABLE_DOMAINS } from './.tmp/rewards-config.mjs';
import { applyGrant, resolveAccount, emptyAccount, monthKey, remainingMs, referralsThisMonth, markConverted, daysOf } from './.tmp/promo-engine.mjs';
import { memoryStore } from './.tmp/rewards-store.mjs';
import { labelKey, meaningfulLabel, connectedCount, evaluateChallenge, ownWords, isStarterText } from './.tmp/challenge-rule.mjs';
import { makeCode, normalizeReferralCode, encodeRefCookie, decodeRefCookie, normalizeEmail, checkAttribution, meaningfulSession, activationProgress, CODE_ALPHABET } from './.tmp/referral-rule.mjs';
import {
  grantReward, reconcile, resolvePromo, onPaidAccess, checkChallenge, attributeReferral, checkActivation,
  ensureCode, rewardsStatus, challengeKey, signupKey, activationKey,
} from './.tmp/rewards-service.mjs';
import { OPENINGS, MODEL_OPENING } from './.tmp/first-session.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 8, 12, 0, 0); // 8 Oct 2026, noon UTC
const cfg = rewardsConfig({ REWARDS_ENABLED: '1' });
const ctx = (now, base = false) => ({ now, baseEntitled: base, cfg });

// ── configuration ────────────────────────────────────────────────────
console.log('=== configuration: defaults, overrides, and nothing becomes unlimited ===');
{
  ok('defaults: 5 nodes, 7 days, 4 a month, 30 banked', cfg.challenge.nodes === 5 && cfg.challenge.days === 7 && cfg.referral.signupDays === 7 && cfg.referral.activationDays === 7 && cfg.referral.monthlyCap === 4 && cfg.bankCapDays === 30);
  ok('active = two meaningful sessions', cfg.referral.activationSessions === 2 && cfg.referral.sessionUserTurns === 2);
  const c2 = rewardsConfig({ REWARDS_ENABLED: '1', REWARDS_REFERRAL_MONTHLY_CAP: '6', REWARDS_BANK_CAP_DAYS: '45', REWARDS_CHALLENGE_NODES: '7' });
  ok('limits are configurable', c2.referral.monthlyCap === 6 && c2.bankCapDays === 45 && c2.challenge.nodes === 7);
  const junk = rewardsConfig({ REWARDS_REFERRAL_MONTHLY_CAP: 'lots', REWARDS_BANK_CAP_DAYS: '99999', REWARDS_CHALLENGE_DAYS: '-3' });
  ok('a typo is the default, an extreme is clamped', junk.referral.monthlyCap === 4 && junk.bankCapDays === 365 && junk.challenge.days === 1);
  ok('on outside production by default', rewardsConfig({ VERCEL_ENV: 'preview' }).enabled && rewardsConfig({ NODE_ENV: 'development' }).enabled);
  ok('off on production until switched on', !rewardsConfig({ VERCEL_ENV: 'production' }).enabled && rewardsConfig({ VERCEL_ENV: 'production', REWARDS_ENABLED: '1' }).enabled);
  ok('and REWARDS_ENABLED=0 turns it off anywhere', !rewardsConfig({ VERCEL_ENV: 'preview', REWARDS_ENABLED: '0' }).enabled);
  ok('disposable inboxes are blocked, and more can be added', cfg.referral.blockedDomains.includes('mailinator.com') && rewardsConfig({ REWARDS_BLOCKED_EMAIL_DOMAINS: '@burner.example, not a domain' }).referral.blockedDomains.includes('burner.example') && DISPOSABLE_DOMAINS.length > 5);
}

// ── the engine ───────────────────────────────────────────────────────
console.log('=== the engine: stacking, the cap, banking, pausing, expiry ===');
{
  const g = (key, source = 'challenge', days = 7) => ({ key, source, days });
  let a = emptyAccount('u');
  let r = applyGrant(a, g('challenge:u'), ctx(T0));
  ok('a reward starts promotional access now, for seven days', r.outcome === 'active' && r.account.until === T0 + 7 * DAY && r.appliedMs === 7 * DAY && r.endsAt === T0 + 7 * DAY);
  a = r.account;
  r = applyGrant(a, g('referral_signup:u', 'referral_signup'), ctx(T0 + DAY));
  ok('a second reward stacks end to end, not from now', r.account.until === T0 + 14 * DAY);
  ok('the same key twice is a no-op', applyGrant(r.account, g('challenge:u'), ctx(T0 + 2 * DAY)).outcome === 'duplicate');
  a = r.account;

  // the cap: 30 days still to come, at any moment
  let b = emptyAccount('v');
  const outs = [];
  for (let i = 0; i < 6; i++) {
    const rr = applyGrant(b, g(`k${i}`, 'referral_signup'), ctx(T0));
    outs.push(rr);
    b = rr.account;
  }
  ok('four sevens fit, the fifth is trimmed to the cap', outs.slice(0, 4).every((x) => x.appliedMs === 7 * DAY) && outs[4].appliedMs === 2 * DAY && outs[4].trimmedMs === 5 * DAY);
  ok('and past the cap nothing is added', outs[5].outcome === 'bank_full' && outs[5].appliedMs === 0);
  ok('never more than 30 days to come', remainingMs(b, T0) === 30 * DAY);
  ok('as time passes, room returns', applyGrant(b, g('later', 'referral_signup'), ctx(T0 + 10 * DAY)).appliedMs === 7 * DAY);

  // paid access is never touched
  const p = applyGrant(emptyAccount('p'), g('challenge:p'), ctx(T0, true));
  ok('a reward earned while paying is banked, not started', p.outcome === 'banked' && p.account.until === null && p.account.bankedMs === 7 * DAY && p.endsAt === null);
  const paidStill = resolveAccount(p.account, { now: T0 + 3 * DAY, baseEntitled: true });
  ok('…and stays banked while they pay', !paidStill.changed && !paidStill.promoActive && paidStill.account.bankedMs === 7 * DAY);
  const after = resolveAccount(p.account, { now: T0 + 40 * DAY, baseEntitled: false });
  ok('…and starts when the paid access ends — the full seven days', after.changed && after.promoActive && after.account.until === T0 + 47 * DAY && after.account.bankedMs === 0);

  // paying mid-reward loses nothing
  const running = applyGrant(emptyAccount('q'), g('challenge:q'), ctx(T0)).account;
  const paused = resolveAccount(running, { now: T0 + 2 * DAY, baseEntitled: true });
  ok('time running when they subscribe is paused into the bank', paused.changed && paused.account.until === T0 + 2 * DAY && paused.account.bankedMs === 5 * DAY);
  const resumed = resolveAccount(paused.account, { now: T0 + 60 * DAY, baseEntitled: false });
  ok('…and resumes if the paid access ever ends', resumed.account.until === T0 + 65 * DAY);

  // expiry
  const ran = applyGrant(emptyAccount('e'), g('challenge:e'), ctx(T0)).account;
  const live = resolveAccount(ran, { now: T0 + 6 * DAY, baseEntitled: false });
  ok('active until the end', live.promoActive && !live.expired && !live.changed);
  const gone = resolveAccount(ran, { now: T0 + 7 * DAY, baseEntitled: false });
  ok('then over, and reported once', !gone.promoActive && gone.expired && gone.changed);
  const again = resolveAccount(gone.account, { now: T0 + 8 * DAY, baseEntitled: false });
  ok('…only once', !again.expired && !again.changed);

  // the monthly referral limit
  let m = emptyAccount('m');
  const res = [];
  for (let i = 0; i < 6; i++) {
    const rr = applyGrant(m, g(`referral_activation:f${i}`, 'referral_activation', 1), ctx(T0));
    res.push(rr.outcome);
    m = rr.account;
  }
  ok('four rewarded referrals a month, then the limit', res.slice(0, 4).every((o) => o === 'active') && res[4] === 'monthly_cap' && res[5] === 'monthly_cap' && referralsThisMonth(m, T0) === 4);
  const next = applyGrant(m, g('referral_activation:f9', 'referral_activation', 1), ctx(Date.UTC(2026, 10, 1, 0, 0, 1)));
  ok('a new calendar month starts the count again', next.outcome === 'active' && next.account.refCount === 1 && next.account.refMonth === '2026-11');
  ok('months are UTC', monthKey(Date.UTC(2026, 9, 31, 23, 59)) === '2026-10' && monthKey(Date.UTC(2026, 10, 1, 0, 0)) === '2026-11');
  let full = emptyAccount('f');
  for (let i = 0; i < 5; i++) full = applyGrant(full, g(`s${i}`, 'referral_signup'), ctx(T0)).account;
  const blocked = applyGrant(full, g('referral_activation:x', 'referral_activation'), ctx(T0));
  ok('a full bank does not spend a month\'s referral slot', blocked.outcome === 'bank_full' && referralsThisMonth(blocked.account, T0) === 0);

  // conversion
  ok('conversion is recorded once, and only for someone a reward reached', markConverted(ran, T0).converted && !markConverted(markConverted(ran, T0).account, T0).converted && !markConverted(emptyAccount('z'), T0).converted);
  ok('days round up while any of the day remains', daysOf(6 * DAY + 1, DAY) === 7 && daysOf(0, DAY) === 0);
}

// ── the service, against a store that really interleaves ────────────
let clock = T0;
const events = [];
function deps(store, opts = {}) {
  let seed = 7;
  return {
    store,
    cfg: opts.cfg ?? cfg,
    now: () => clock,
    baseEntitled: async (id) => (opts.paid ?? new Set()).has(id),
    track: (e, p) => events.push([e, p ?? {}]),
    changed: () => {},
    random: (n) => Array.from({ length: n }, () => (seed = (seed * 1103515245 + 12345) % 2147483648) % 256),
  };
}
const jittery = () => memoryStore({ jitter: () => 1 + Math.floor(Math.random() * 6) });

console.log('=== a reward is granted once, however it arrives ===');
{
  const store = jittery();
  const d = deps(store);
  const runs = await Promise.all(Array.from({ length: 25 }, () => grantReward(d, 'u1', { key: 'challenge:u1', source: 'challenge', days: 7 })));
  ok('25 concurrent claims of one reward: exactly one applies', runs.filter((r) => r.fresh).length === 1 && runs.filter((r) => !r.fresh).every((r) => r.outcome === 'duplicate'));
  const acct = await store.getAccount('u1');
  ok('…and the account holds seven days, not more', acct.until === T0 + 7 * DAY && acct.applied.length === 1);
  const rows = await store.listLedger('u1');
  ok('…and the ledger one row, settled', rows.length === 1 && rows[0].status === 'active' && rows[0].appliedMs === 7 * DAY);

  // different rewards at once all land, and the cap holds
  const s2 = jittery();
  const d2 = deps(s2);
  const many = await Promise.all(Array.from({ length: 8 }, (_, i) => grantReward(d2, 'u2', { key: `referral_signup:k${i}`, source: 'referral_signup', days: 7 })));
  const total = many.reduce((n, r) => n + r.appliedMs, 0);
  ok('eight different rewards at once: every one applied once', many.every((r) => r.fresh));
  ok('…and together they never pass the 30-day cap', total === 30 * DAY && remainingMs(await s2.getAccount('u2'), clock) === 30 * DAY, `${total / DAY}`);

  // the monthly limit under concurrency
  const s3 = jittery();
  const d3 = deps(s3);
  const acts = await Promise.all(Array.from({ length: 10 }, (_, i) => grantReward(d3, 'ref', { key: `referral_activation:x${i}`, source: 'referral_activation', days: 1 })));
  ok('ten activations at once: four rewarded, six at the monthly limit', acts.filter((r) => r.outcome === 'active').length === 4 && acts.filter((r) => r.outcome === 'monthly_cap').length === 6);
}

console.log('=== a grant interrupted half-way is finished, never doubled ===');
{
  const store = memoryStore();
  const d = deps(store);
  // the ledger row was written, then the process died before the account was
  await store.insertLedger({ key: 'challenge:c1', userId: 'c1', source: 'challenge', days: 7, createdAt: clock, status: 'pending', appliedMs: 0, endsAt: null, meta: {} });
  ok('reconcile finishes it', (await reconcile(d, 'c1')) === 1 && (await store.getAccount('c1')).until === clock + 7 * DAY);
  ok('…once', (await reconcile(d, 'c1')) === 0 && (await store.getAccount('c1')).until === clock + 7 * DAY);
  // the account was written, then it died before the ledger was settled
  const s2 = memoryStore();
  const d2 = deps(s2);
  await grantReward(d2, 'c2', { key: 'challenge:c2', source: 'challenge', days: 7 });
  await s2.updateLedger('challenge:c2', { status: 'pending' });
  await reconcile(d2, 'c2');
  ok('an applied reward whose ledger was left pending is not applied again', (await s2.getAccount('c2')).until === clock + 7 * DAY && (await s2.getLedger('challenge:c2')).status === 'applied');
}

console.log('=== paid subscribers: protected, never touched ===');
{
  const store = memoryStore();
  const paid = new Set(['payer']);
  const d = deps(store, { paid });
  const g = await grantReward(d, 'payer', { key: 'challenge:payer', source: 'challenge', days: 7 });
  ok('a reward to a paying member is banked', g.outcome === 'banked' && (await store.getAccount('payer')).bankedMs === 7 * DAY);
  const p = await resolvePromo(d, 'payer');
  ok('promotional access is not what entitles them while they pay', !p.active && p.bankedMs === 7 * DAY);
  // the plan rule: base OR promotional — promotional never removes base
  const plan = (base, promo) => (base || promo ? 'one' : 'free');
  ok('expiry of a reward can never take away paid access', plan(true, false) === 'one');
  paid.delete('payer');
  clock += 30 * DAY;
  const later = await resolvePromo(d, 'payer');
  ok('when the paid access ends, the banked days start', later.active && later.until === clock + 7 * DAY && later.bankedMs === 0);
  clock = T0;
  // subscribing mid-reward
  const s2 = memoryStore();
  const paid2 = new Set();
  const d2 = deps(s2, { paid: paid2 });
  await grantReward(d2, 'conv', { key: 'challenge:conv', source: 'challenge', days: 7 });
  clock += 3 * DAY;
  paid2.add('conv');
  events.length = 0;
  const c = await onPaidAccess(d2, 'conv');
  const acct = await s2.getAccount('conv');
  ok('subscribing pauses the rest into the bank', acct.until === clock && acct.bankedMs === 4 * DAY);
  ok('…and records the conversion once', c.converted && !(await onPaidAccess(d2, 'conv')).converted && events.filter(([e]) => e === 'rewards_promo_converted').length === 1);
  ok('someone no reward reached is not a conversion', !(await onPaidAccess(d2, 'stranger')).converted);
  clock = T0;
}

console.log('=== promotional access expires on its own ===');
{
  const store = memoryStore();
  const d = deps(store);
  await grantReward(d, 'x', { key: 'challenge:x', source: 'challenge', days: 7 });
  ok('active during the week', (await resolvePromo(d, 'x')).active);
  clock = T0 + 7 * DAY + 1;
  events.length = 0;
  ok('over after it', !(await resolvePromo(d, 'x')).active);
  ok('…the ending reported once', events.filter(([e]) => e === 'rewards_promo_expired').length === 1 && !(await resolvePromo(d, 'x')).active && events.filter(([e]) => e === 'rewards_promo_expired').length === 1);
  ok('someone with no rewards has no promotional state at all', !(await resolvePromo(d, 'nobody')).active && (await store.getAccount('nobody')) === null);
  clock = T0;
}

// ── the 5-Node Challenge ─────────────────────────────────────────────
const node = (id, label, extra = {}) => ({ id, label, ...extra });
const chain = (ids) => ids.slice(1).map((id, i) => ({ from: ids[i], to: id }));
const mine = (text = 'I keep going back and forth about whether to take the research job') => [{ role: 'user', content: text }, { role: 'assistant', content: 'What pulls you toward it?' }];
const fiveMap = () => ({
  nodes: [node('a', 'Take the research job'), node('b', 'Freedom to choose topics'), node('c', 'Lower salary for two years'), node('d', 'Assumes funding renews'), node('e', 'What do I value most?')],
  edges: chain(['a', 'b', 'c', 'd', 'e']),
});

console.log('=== five nodes: meaningful, connected, theirs ===');
{
  ok('a real label is meaningful', meaningfulLabel('Freedom to build') && meaningfulLabel('2x + 6 = 14') && meaningfulLabel('x = 4') && meaningfulLabel('Écrire'));
  ok('a placeholder is not', ['', '  ', 'New node', 'Untitled', 'Idea 3', 'idea', 'Node 12', '…', '....', 'aaaa', 'ab', 'TBD', 'Option ii', '?', 42, null].every((l) => !meaningfulLabel(l)));
  ok('labels fold case, punctuation and a trailing number', labelKey('Freedom, to build!') === labelKey('freedom to build') && labelKey('Step 4.') === 'step');
  ok('…but a line of working keeps its numbers', labelKey('x = 4') !== labelKey('x = 5'));
  ok('five connected nodes count five', connectedCount(fiveMap()) === 5);
  const dup = { nodes: [node('a', 'Freedom'), node('b', 'freedom!'), node('c', 'FREEDOM'), node('d', 'Freedom 2'), node('e', 'Freedom.')], edges: chain(['a', 'b', 'c', 'd', 'e']) };
  ok('five copies of one thought are one node', connectedCount(dup) === 1);
  const empty = { nodes: [node('a', 'Untitled'), node('b', 'New node'), node('c', ''), node('d', 'Idea 1'), node('e', 'Idea 2')], edges: chain(['a', 'b', 'c', 'd', 'e']) };
  ok('empty placeholders count nothing', connectedCount(empty) === 0);
  const split = { nodes: fiveMap().nodes, edges: [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }] };
  ok('disconnected pieces do not add up', connectedCount(split) === 2);
  const reversed = { nodes: fiveMap().nodes, edges: [{ from: 'b', to: 'a' }, { from: 'b', to: 'c' }, { from: 'd', to: 'c' }, { from: 'e', to: 'd' }] };
  ok('edges count in either direction', connectedCount(reversed) === 5);
  const attached = { nodes: [...fiveMap().nodes.slice(0, 4), node('e', 'A quote from the attached paper', { origin: 'source' })], edges: chain(['a', 'b', 'c', 'd', 'e']) };
  ok('attached material does not count toward the five', connectedCount(attached) === 4);
  const bridge = { nodes: [node('a', 'Take the job'), node('b', 'Salary is lower'), node('s', 'Report: wages in research', { origin: 'source' }), node('c', 'Freedom matters more'), node('d', 'Funding may end'), node('e', 'Ask the lab head')], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 's' }, { from: 's', to: 'c' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' }] };
  ok('…but it can connect their nodes', connectedCount(bridge) === 5);
  const kept = { nodes: [...fiveMap().nodes.slice(0, 4), node('e', 'A principle Socria offered', { origin: 'socria' })], edges: chain(['a', 'b', 'c', 'd', 'e']) };
  ok('a suggestion they chose to keep counts', connectedCount(kept) === 5);
  const computed = { nodes: [...fiveMap().nodes.slice(0, 4), node('e', 'Derived total cost', { origin: 'computed' })], edges: chain(['a', 'b', 'c', 'd', 'e']) };
  ok('what the engine computed does not', connectedCount(computed) === 4);
  ok('a malformed map counts nothing, and does not throw', connectedCount(null) === 0 && connectedCount({ nodes: 'x', edges: null }) === 0 && connectedCount({ nodes: [{}, null, { id: 3 }], edges: [{}, null] }) === 0);
}

console.log('=== their own words: a starting card sent unchanged is not ===');
{
  ok('a starter is recognised whatever its spacing', isStarterText(OPENINGS[0].message) && isStarterText('  ' + MODEL_OPENING.message.replace(/ /g, '  ') + ' '));
  ok('an edited starter is theirs', !isStarterText(OPENINGS[0].message + ' Also my exam is on Friday.'));
  ok('own words exclude starters and replies', ownWords([{ role: 'user', content: OPENINGS[1].message }, { role: 'assistant', content: 'many words here from Socria' }]) === 0 && ownWords(mine('one two three four five six')) === 6);
  const s = (id, map, messages) => ({ id, map, messages });
  const ev = evaluateChallenge([s('a', fiveMap(), mine())], cfg.challenge);
  ok('five connected nodes and their words: qualifies', ev.qualifies && ev.progress === 5 && ev.sessionId === 'a');
  const starter = evaluateChallenge([s('b', fiveMap(), [{ role: 'user', content: OPENINGS[0].message }])], cfg.challenge);
  ok('the same map from a starter sent unchanged: not yet, and says why', !starter.qualifies && starter.needsOwnWords && starter.progress === 0);
  const progress = evaluateChallenge([s('c', { nodes: fiveMap().nodes.slice(0, 3), edges: chain(['a', 'b', 'c']) }, mine())], cfg.challenge);
  ok('progress is 3/5 for three', !progress.qualifies && progress.progress === 3 && progress.target === 5);
  const hist = evaluateChallenge([s('old1', { nodes: fiveMap().nodes.slice(0, 2), edges: chain(['a', 'b']) }, mine()), s('old2', fiveMap(), mine()), s('new', { nodes: [], edges: [] }, [])], cfg.challenge);
  ok('the best of their maps counts — old ones included', hist.qualifies && hist.sessionId === 'old2');
  ok('no maps: 0/5', evaluateChallenge([], cfg.challenge).progress === 0);
}

console.log('=== the challenge, granted from stored maps ===');
{
  const store = jittery();
  const d = deps(store);
  let maps = [{ id: 's1', map: { nodes: fiveMap().nodes.slice(0, 3), edges: chain(['a', 'b', 'c']) }, messages: mine() }];
  const load = async () => maps;
  const p3 = await checkChallenge(d, 'cu', load);
  ok('in progress: 3/5', p3.state === 'open' && p3.progress === 3 && p3.target === 5);
  ok('nothing granted yet', (await store.getAccount('cu')) === null);
  maps = [{ id: 's1', map: fiveMap(), messages: mine() }];
  events.length = 0;
  const runs = await Promise.all(Array.from({ length: 6 }, () => checkChallenge(d, 'cu', load)));
  ok('complete: seven days, once, however many checks race', runs.every((r) => r.state === 'done') && runs.filter((r) => r.justNow).length === 1 && (await store.getAccount('cu')).until === clock + 7 * DAY);
  ok('…completed and granted reported once each', events.filter(([e]) => e === 'rewards_challenge_completed').length === 1 && events.filter(([e]) => e === 'rewards_challenge_reward_granted').length === 1);
  ok('the challenge cannot be completed twice', (await checkChallenge(d, 'cu', load)).state === 'done' && (await store.listLedger('cu')).length === 1);
  const member = await checkChallenge(deps(memoryStore(), { paid: new Set(['m']) }), 'm', load);
  ok('a paying member is not offered it', member.state === 'member');
  const off = await checkChallenge({ ...d, cfg: rewardsConfig({ REWARDS_ENABLED: '0' }) }, 'z', load);
  ok('switched off, it says so', off.state === 'off');
  const existing = await checkChallenge(deps(memoryStore()), 'veteran', async () => [{ id: 'from-2025', map: fiveMap(), messages: mine() }]);
  ok('an existing user with a qualifying old map is granted on first check', existing.state === 'done' && existing.justNow);
}

// ── Give 7, Get 7 ─────────────────────────────────────────────────────
console.log('=== codes and the link\'s memory ===');
{
  const codes = new Set(Array.from({ length: 2000 }, (_, i) => makeCode(Array.from({ length: 8 }, (_, j) => (i * 7919 + j * 104729) % 256))));
  ok('codes are eight characters from a misreadable-free alphabet', [...codes].every((c) => c.length === 8 && [...c].every((ch) => CODE_ALPHABET.includes(ch))) && !/[01ILOU]/.test(CODE_ALPHABET));
  ok('codes are read forgivingly: case, spaces, dashes', normalizeReferralCode(' abcd-efgh ') === 'ABCDEFGH' && normalizeReferralCode('2bcd 2fgh') === '2BCD2FGH');
  ok('…but a misreadable character is not guessed at', normalizeReferralCode('ABCDEFGI') === null && normalizeReferralCode('ABCDEFG0') === null);
  ok('…and nothing else is a code', [null, 7, '', 'SHORT', 'TOOLONGCODE', 'ABCDEFG0'].every((c) => normalizeReferralCode(c) === null));
  const c = encodeRefCookie({ code: 'ABCD2345', at: T0 });
  ok('the cookie carries the code and when the link was opened', JSON.stringify(decodeRefCookie(c, T0 + DAY, 30)) === JSON.stringify({ code: 'ABCD2345', at: T0 }));
  ok('a stale or future-dated cookie is ignored', decodeRefCookie(c, T0 + 31 * DAY, 30) === null && decodeRefCookie(encodeRefCookie({ code: 'ABCD2345', at: T0 + DAY }), T0, 30) === null);
  ok('garbage is ignored', [null, '', 'x', 'ABCD2345', 'ABCD2345.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', '<script>.1'].every((v) => decodeRefCookie(v, T0, 30) === null));
}

console.log('=== who is a new friend ===');
{
  ok('emails fold to the mailbox they reach', normalizeEmail('A.B.C+promo@GoogleMail.com') === 'abc@gmail.com' && normalizeEmail('pat+x@work.io') === 'pat@work.io' && normalizeEmail('p.a.t@work.io') === 'p.a.t@work.io' && normalizeEmail('nope') === null);
  const base = {
    referredId: 'new', referrerId: 'old', referredCreatedAt: T0, linkOpenedAt: T0 - 60_000, now: T0 + 3600_000,
    referredEmails: [{ address: 'friend@school.edu', verified: true }],
    referrerEmails: [{ address: 'me@gmail.com', verified: true }],
    alreadyReferred: false, cfg: cfg.referral,
  };
  ok('a new, verified account that opened the link first: yes', checkAttribution(base).ok);
  const why = (o) => checkAttribution({ ...base, ...o }).reason;
  ok('one\'s own code: no', why({ referrerId: 'new' }) === 'self');
  ok('already referred: no', why({ alreadyReferred: true }) === 'already_referred');
  ok('an account older than three days: no', why({ now: T0 + 73 * 3600_000 }) === 'not_new');
  ok('an account that existed before the link was opened: no', why({ linkOpenedAt: T0 + 3600_000 }) === 'joined_before_link');
  ok('no verified email: no', why({ referredEmails: [{ address: 'x@y.com', verified: false }] }) === 'unverified_email');
  ok('a disposable inbox: no', why({ referredEmails: [{ address: 'x@mailinator.com', verified: true }] }) === 'blocked_domain');
  ok('the referrer\'s own address in disguise: no', why({ referredEmails: [{ address: 'M.E+alt@googlemail.com', verified: true }] }) === 'same_person');
}

console.log('=== what "active" means ===');
{
  const sess = (messages, day = 0) => ({ createdAt: T0 + day * DAY, messages });
  const talk = [
    { role: 'user', content: 'I am trying to understand why the bridge design needs a truss' },
    { role: 'assistant', content: 'What load are you worried about?' },
    { role: 'user', content: 'Mostly wind loads on the long span' },
    { role: 'assistant', content: 'Then let us look at bending.' },
  ];
  ok('two messages of their own words, a dozen words, and a reply: meaningful', meaningfulSession(sess(talk), cfg.referral));
  ok('one message: not yet', !meaningfulSession(sess(talk.slice(0, 2)), cfg.referral));
  ok('no reply from Socria: no', !meaningfulSession(sess(talk.filter((m) => m.role === 'user')), cfg.referral));
  ok('starters sent unchanged are not their words', !meaningfulSession(sess([{ role: 'user', content: OPENINGS[0].message }, { role: 'assistant', content: 'ok' }, { role: 'user', content: OPENINGS[1].message }, { role: 'assistant', content: 'ok' }]), cfg.referral));
  ok('"hi" twice is not use', !meaningfulSession(sess([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello!' }, { role: 'user', content: 'ok' }, { role: 'assistant', content: 'Yes?' }]), cfg.referral));
  const prog = activationProgress([sess(talk), sess(talk), sess([])], cfg.referral);
  ok('two meaningful sessions: active', prog.reached && prog.meaningful === 2);
  const strict = rewardsConfig({ REWARDS_ACTIVATION_DISTINCT_DAYS: '2' }).referral;
  ok('…and, configured, on two different days', !activationProgress([sess(talk), sess(talk)], strict).reached && activationProgress([sess(talk, 0), sess(talk, 1)], strict).reached);
}

const talk2 = () => [
  { createdAt: clock, messages: [{ role: 'user', content: 'Help me think through switching my major to physics' }, { role: 'assistant', content: 'What draws you?' }, { role: 'user', content: 'The labs and the maths, mostly' }, { role: 'assistant', content: 'Tell me more.' }] },
  { createdAt: clock, messages: [{ role: 'user', content: 'Can we map out my thesis argument about urban heat' }, { role: 'assistant', content: 'Sure.' }, { role: 'user', content: 'The central claim is that trees matter most' }, { role: 'assistant', content: 'Why trees?' }] },
];
const person = (email) => ({ createdAt: clock - 3600_000, emails: [{ address: email, verified: true }] });
const emailsOf = { A: [{ address: 'a@a.org', verified: true }], B: [{ address: 'b@b.org', verified: true }], C: [{ address: 'c@c.org', verified: true }], D: [{ address: 'd@d.org', verified: true }] };
const referrerEmails = async (id) => emailsOf[id] ?? [];

console.log('=== Give 7, Get 7: attribution, chains, direct-only rewards ===');
{
  const store = jittery();
  const d = deps(store);
  const codeA = await ensureCode(d, 'A');
  ok('everyone gets a code at once, and keeps it', codeA === (await ensureCode(d, 'A')) && codeA.length === 8);
  const cookieA = { code: codeA, at: clock - 2 * 3600_000 };
  events.length = 0;
  const b = await attributeReferral(d, { userId: 'B', cookie: cookieA, via: 'link', referred: person('b@b.org'), referrerEmails });
  ok('B joins through A\'s link: B gets seven days at once', b.ok && b.grant.outcome === 'active' && (await store.getAccount('B')).until === clock + 7 * DAY);
  ok('…A gets nothing yet', (await store.getAccount('A')) === null);
  ok('…signup reported, and B\'s reward', events.some(([e]) => e === 'rewards_referral_signup_completed') && events.some(([e, p]) => e === 'rewards_referral_reward_granted' && p.kind === 'referral_signup'));
  const twice = await attributeReferral(d, { userId: 'B', cookie: cookieA, via: 'link', referred: person('b@b.org'), referrerEmails });
  ok('one referrer per account: a second attribution is refused', !twice.ok && twice.reason === 'already_referred');
  const racers = await Promise.all(Array.from({ length: 5 }, () => attributeReferral(d, { userId: 'Bx', cookie: cookieA, via: 'link', referred: person('bx@b.org'), referrerEmails })));
  ok('…even when five attributions race', racers.filter((r) => r.ok).length === 1);
  const self = await attributeReferral(d, { userId: 'A', cookie: cookieA, via: 'link', referred: person('a2@a.org'), referrerEmails });
  ok('self-referral is refused', !self.ok && self.reason === 'self');
  const bogus = await attributeReferral(d, { userId: 'Q', cookie: { code: 'ZZZZ2222', at: clock }, via: 'link', referred: person('q@q.org'), referrerEmails });
  ok('an unknown code is refused', !bogus.ok && bogus.reason === 'unknown_code');

  // B can refer immediately; C joins through B
  const codeB = await ensureCode(d, 'B');
  const c = await attributeReferral(d, { userId: 'C', cookie: { code: codeB, at: clock - 3600_000 }, via: 'link', referred: person('c@c.org'), referrerEmails });
  ok('B refers C right away: C gets seven days', c.ok && c.referrerId === 'B');
  const codeC = await ensureCode(d, 'C');
  const dd = await attributeReferral(d, { userId: 'D', cookie: { code: codeC, at: clock - 3600_000 }, via: 'link', referred: person('d@d.org'), referrerEmails });
  ok('…and C refers D: the chain goes on', dd.ok && dd.referrerId === 'C');

  // C becomes active → B is rewarded, A is not
  const notYet = await checkActivation(d, 'C', async () => talk2().slice(0, 1));
  ok('one meaningful session is not active yet', notYet.state === 'signed_up' && notYet.meaningful === 1 && notYet.needed === 2);
  const actC = await checkActivation(d, 'C', async () => talk2());
  ok('C active: B rewarded', actC.state === 'rewarded' && actC.justNow && (await store.getLedger(activationKey('C'))).userId === 'B');
  ok('…A earns nothing for B\'s referral (direct only)', !(await store.listLedger('A')).some((r) => r.key === activationKey('C')));
  ok('…and C\'s activation pays once', (await checkActivation(d, 'C', async () => talk2())).justNow === false && (await store.listLedger('B')).filter((r) => r.source === 'referral_activation').length === 1);
  const actB = await checkActivation(d, 'B', async () => talk2());
  ok('B active: A rewarded for B', actB.state === 'rewarded' && (await store.getLedger(activationKey('B'))).userId === 'A');
  const aRows = await store.listLedger('A');
  ok('A holds exactly one referral reward — for B', aRows.length === 1 && aRows[0].key === activationKey('B'));
  ok('D not active yet: C has nothing', (await store.listLedger('C')).every((r) => r.source !== 'referral_activation'));
}

console.log('=== the monthly referral limit, through the program ===');
{
  const store = memoryStore();
  const d = deps(store);
  const code = await ensureCode(d, 'R');
  for (let i = 0; i < 6; i++) {
    await attributeReferral(d, { userId: `F${i}`, cookie: { code, at: clock - 3600_000 }, via: 'link', referred: person(`f${i}@f.org`), referrerEmails });
  }
  const results = [];
  for (let i = 0; i < 6; i++) results.push((await checkActivation(d, `F${i}`, async () => talk2())).state);
  ok('six friends active in one month: four rewarded, two past the limit', results.filter((s) => s === 'rewarded').length === 4 && results.filter((s) => s === 'capped').length === 2, results.join());
  const acct = await store.getAccount('R');
  ok('R holds 28 days, inside the 30-day cap', remainingMs(acct, clock) === 28 * DAY);
  const st = await rewardsStatus(d, 'R', { challengeSessions: async () => [], activity: async () => [] });
  ok('the panel says 4/4 this month, 28 days earned, 6 joined', st.referral.rewardedThisMonth === 4 && st.referral.monthlyCap === 4 && st.referral.earnedDays === 28 && st.referral.joined === 6 && st.referral.waiting === 0);
}

console.log('=== a paying referrer is rewarded without touching their subscription ===');
{
  const store = memoryStore();
  const d = deps(store, { paid: new Set(['P']) });
  const code = await ensureCode(d, 'P');
  await attributeReferral(d, { userId: 'G', cookie: { code, at: clock - 3600_000 }, via: 'invite', referred: person('g@g.org'), referrerEmails });
  await checkActivation(d, 'G', async () => talk2());
  const acct = await store.getAccount('P');
  ok('their seven days are banked, not started', acct.bankedMs === 7 * DAY && acct.until === null);
  ok('a Think Together invitation is remembered as the way in', (await store.getReferral('G')).via === 'invite');
}

console.log('=== what the person sees ===');
{
  const store = memoryStore();
  const d = deps(store);
  const st0 = await rewardsStatus(d, 'N', { challengeSessions: async () => [{ id: 's', map: { nodes: fiveMap().nodes.slice(0, 3), edges: chain(['a', 'b', 'c']) }, messages: mine() }], activity: async () => [] });
  ok('a new person: a code, 3/5, no promotional time, nothing in history', st0.referral.code.length === 8 && st0.challenge.state === 'open' && st0.challenge.progress === 3 && !st0.promo.active && st0.history.length === 0);
  const st1 = await rewardsStatus(d, 'N', { challengeSessions: async () => [{ id: 's', map: fiveMap(), messages: mine() }], activity: async () => [] });
  ok('after five nodes: done, seven days active, one history line', st1.challenge.state === 'done' && st1.promo.active && st1.promo.daysLeft === 7 && st1.history.length === 1 && st1.history[0].status === 'active' && st1.history[0].days === 7 && st1.history[0].source === 'challenge');
  clock = T0 + 8 * DAY;
  const st2 = await rewardsStatus(d, 'N', { challengeSessions: async () => [], activity: async () => [] });
  ok('a week later: used, no longer active', !st2.promo.active && st2.history[0].status === 'expired');
  clock = T0;
  ok('the keys say what they are for', challengeKey('u') === 'challenge:u' && signupKey('u') === 'referral_signup:u' && activationKey('u') === 'referral_activation:u');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
