// The rules that decide whether Socria One is ever mentioned.
//
// This suite is mostly about what does NOT happen. The expensive failure for
// this system is not "we missed a conversion" — it is "we interrupted someone
// who was thinking", and that failure is invisible in revenue numbers. So the
// assertions below lean hard on the suppression paths: members, cooldowns,
// sessions, reflective conversations, and people who have not yet got enough
// out of the product to have an opinion about paying for it.

import {
  TRIGGERS,
  TRIGGER_REASONS,
  INTENT_RANK,
  COOLDOWN_DAYS,
  PROACTIVE_MIN,
  SENSITIVE_CONTEXTS,
  DAY_MS,
  EMPTY_PROMPT_STATE,
  cooldownMs,
  copyFor,
  decide,
  bestTrigger,
  engagementFrom,
  reasonForCounter,
} from './.tmp/one-prompt.mjs';
import { COUNTERS } from './.tmp/entitlements.mjs';

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const NOW = 1_800_000_000_000;

/** A free user who has cleared every proactive bar. Tests vary one thing. */
const engaged = {
  sessions: PROACTIVE_MIN.sessions,
  activeDays: PROACTIVE_MIN.activeDays,
  mapNodes: PROACTIVE_MIN.mapNodes,
};
const base = {
  plan: 'free',
  now: NOW,
  state: { ...EMPTY_PROMPT_STATE },
  engagement: engaged,
};
const show = (over) => decide({ ...base, ...over });

console.log('=== the table is complete and coherent ===');
for (const r of TRIGGER_REASONS) {
  const spec = TRIGGERS[r];
  ok(`${r}: has a spec`, !!spec);
  ok(`${r}: has a category`, spec.category === 'entitlement' || spec.category === 'proactive');
  ok(`${r}: intent is ranked`, INTENT_RANK[spec.intent] !== undefined);
  const c = copyFor(r);
  ok(`${r}: has a title`, typeof c.title === 'string' && c.title.length > 3);
  ok(`${r}: has a body`, typeof c.body === 'string' && c.body.length > 20, c.body);
  ok(`${r}: exactly one primary action`, typeof c.primary === 'string' && c.primary.length > 3);
  ok(`${r}: has a quiet way out`, typeof c.secondary === 'string' && c.secondary.length > 2);
}

console.log('\n=== every counter can name its trigger ===');
for (const c of COUNTERS) {
  const r = reasonForCounter(c);
  ok(`${c} → ${r} exists`, !!TRIGGERS[r], r);
  ok(`${c}: trigger is an entitlement`, TRIGGERS[r]?.category === 'entitlement');
  ok(`${c}: trigger is linked back to the counter`, TRIGGERS[r]?.counter === c);
}

console.log('\n=== no dark patterns in any copy ===');
// The list is the spec's: fake urgency, countdowns, guilt, FOMO, shouting.
const BAD = /hurry|act now|limited time|expires?|only \d+ left|don'?t miss|last chance|!{1,}|UPGRADE NOW|unlock premium/i;
for (const r of TRIGGER_REASONS) {
  const c = copyFor(r);
  ok(`${r}: title is calm`, !BAD.test(c.title), c.title);
  ok(`${r}: body is calm`, !BAD.test(c.body), c.body);
  ok(`${r}: primary is calm`, !BAD.test(c.primary), c.primary);
  ok(`${r}: no shouting`, c.title === c.title.replace(/\b[A-Z]{4,}\b/g, ''), c.title);
}

console.log('\n=== limits are never written twice ===');
// The map-full copy must interpolate the real free limit, not restate it.
const mapBody = copyFor('map-full').body;
ok('map-full names the real free node cap', /\b8\b/.test(mapBody), mapBody);
ok('map-full left no placeholder behind', !mapBody.includes('{'), mapBody);

console.log('\n=== a Socria One member is never sold to ===');
for (const r of TRIGGER_REASONS) {
  const d = show({ reason: r, plan: 'one' });
  ok(`${r}: silent for a member`, d.show === false && d.why === 'has-one', JSON.stringify(d));
}

console.log('\n=== free user hits the Logos chat limit ===');
{
  const d = show({ reason: 'chats-spent' });
  ok('chats-spent shows', d.show === true);
  ok('chats-spent is urgent', d.show && d.intent === 'urgent');
  ok('chats-spent is an entitlement prompt', d.show && d.category === 'entitlement');
  ok('body says what ran out', d.show && /month/i.test(d.copy.body), d.show && d.copy.body);
  ok('body says what One changes', d.show && /Socria One/.test(d.copy.body));
  ok(
    'copy is contextual, not generic',
    d.show && !/^upgrade/i.test(d.copy.title),
    d.show && d.copy.title
  );
}

console.log('\n=== free user hits the Explore limit ===');
{
  const d = show({ reason: 'explore-spent' });
  ok('explore-spent shows', d.show === true);
  ok('explore-spent names Explore, not "a limit"', d.show && /Explore/i.test(d.copy.body), d.show && d.copy.body);
  ok('explore-spent title is the user\'s sentence', d.show && d.copy.title === 'Keep exploring', d.show && d.copy.title);
}

console.log('\n=== entitlement prompts are not rationed by the proactive guards ===');
// They are the answer to an action the person just took. Cooldowns, session
// caps and engagement bars must not silence them.
{
  const hostile = {
    state: {
      dismissals: 9,
      lastDismissedAt: NOW - 1000,
      lastShownAt: NOW - 1000,
      shownThisSession: 7,
      shownTriggers: [],
    },
    engagement: { sessions: 0, activeDays: 0, mapNodes: 0 },
    context: 'reflecting',
  };
  for (const r of TRIGGER_REASONS.filter((x) => TRIGGERS[x].category === 'entitlement')) {
    const d = show({ reason: r, ...hostile });
    ok(`${r}: survives every proactive guard`, d.show === true, JSON.stringify(d));
  }
}

console.log('\n=== but each boundary is explained once per tab, not once per press ===');
// The first press of an exhausted control deserves an answer. The fourth is
// the same person doing the same thing, and answering it again with a sheet
// across the screen is the nagging this whole file exists to prevent.
{
  for (const r of TRIGGER_REASONS.filter((x) => TRIGGERS[x].category === 'entitlement')) {
    const first = show({ reason: r });
    ok(`${r}: the first press is answered`, first.show === true);
    const again = show({
      reason: r,
      state: { ...EMPTY_PROMPT_STATE, shownTriggers: [r] },
    });
    ok(
      `${r}: the second press is not`,
      again.show === false && again.why === 'said-already',
      JSON.stringify(again)
    );
  }

  // Each boundary is its own explanation. Being told the month's chats are
  // spent says nothing about why Research stopped, so it must not silence it.
  const other = show({
    reason: 'research-spent',
    state: { ...EMPTY_PROMPT_STATE, shownTriggers: ['chats-spent'] },
  });
  ok('a different boundary is still explained', other.show === true);

  // The Socria One button is a request, and a request is answered every time.
  const asked = show({
    reason: 'asked',
    state: { ...EMPTY_PROMPT_STATE, shownTriggers: ['asked', 'chats-spent'] },
  });
  ok('pressing the Socria One button always opens it', asked.show === true);

  // A member is refused before any of this is consulted.
  const member = show({
    reason: 'chats-spent',
    plan: 'one',
    state: { ...EMPTY_PROMPT_STATE, shownTriggers: [] },
  });
  ok('a member is still refused first', member.show === false && member.why === 'has-one');

  // And the once-per-tab rule never outranks "something is already open".
  const stacked = show({
    reason: 'chats-spent',
    open: true,
    state: { ...EMPTY_PROMPT_STATE, shownTriggers: ['chats-spent'] },
  });
  ok('already-open still wins', stacked.show === false && stacked.why === 'already-open');
}

console.log('\n=== proactive prompts need real engagement ===');
{
  ok('engaged user sees it', show({ reason: 'returning-thinker' }).show === true);

  const thin = [
    ['one session only', { ...engaged, sessions: PROACTIVE_MIN.sessions - 1 }],
    ['all in one day', { ...engaged, activeDays: PROACTIVE_MIN.activeDays - 1 }],
    ['barely any map', { ...engaged, mapNodes: PROACTIVE_MIN.mapNodes - 1 }],
  ];
  for (const [label, e] of thin) {
    const d = show({ reason: 'returning-thinker', engagement: e });
    ok(`${label}: stays silent`, d.show === false && d.why === 'not-engaged', JSON.stringify(d));
  }
  const none = show({ reason: 'returning-thinker', engagement: undefined });
  ok('no engagement data at all: silent', none.show === false && none.why === 'not-engaged');
}

console.log('\n=== never immediately after signup ===');
// A brand-new account has one session, one day and an empty map. Every one of
// those independently blocks the only proactive trigger.
{
  const fresh = engagementFrom([{ updatedAt: NOW }], 0);
  const d = show({ reason: 'returning-thinker', engagement: fresh });
  ok('a new account sees nothing', d.show === false && d.why === 'not-engaged', JSON.stringify(d));
}

console.log('\n=== max one proactive prompt per session ===');
{
  const after = { ...EMPTY_PROMPT_STATE, shownThisSession: 1 };
  // (shownTriggers is empty here — this is about the proactive session cap.)
  const d = show({ reason: 'returning-thinker', state: after });
  ok('second one in a session is suppressed', d.show === false && d.why === 'session-cap');
  // …but an entitlement prompt still gets through, because they asked for it.
  const e = show({ reason: 'explore-spent', state: after });
  ok('an entitlement prompt is unaffected', e.show === true);
}

console.log('\n=== dismissing sets a cooldown, and it lengthens ===');
{
  ok('cooldowns are documented in days', COOLDOWN_DAYS.length >= 3);
  ok('never zero after a dismissal', cooldownMs(1) > 0);
  ok('first dismissal ≈ a week', cooldownMs(1) === COOLDOWN_DAYS[0] * DAY_MS);
  ok('second is longer', cooldownMs(2) > cooldownMs(1));
  ok('third is longer still', cooldownMs(3) > cooldownMs(2));
  ok('monotonic across the table', COOLDOWN_DAYS.every((d, i) => i === 0 || d > COOLDOWN_DAYS[i - 1]));
  // The tail must not wrap around to a short cooldown.
  ok('beyond the table it holds at the longest', cooldownMs(99) === COOLDOWN_DAYS[COOLDOWN_DAYS.length - 1] * DAY_MS);
  ok('a never-dismissed user has no cooldown', cooldownMs(0) === 0);

  const dismissedNow = {
    ...EMPTY_PROMPT_STATE,
    dismissals: 1,
    lastDismissedAt: NOW,
  };
  ok(
    'not shown again immediately after closing',
    show({ reason: 'returning-thinker', state: dismissedNow, now: NOW + 1000 }).why === 'cooldown'
  );
  ok(
    'still silent a day later',
    show({ reason: 'returning-thinker', state: dismissedNow, now: NOW + DAY_MS }).why === 'cooldown'
  );
  ok(
    'silent right up to the boundary',
    show({ reason: 'returning-thinker', state: dismissedNow, now: NOW + cooldownMs(1) - 1 }).why === 'cooldown'
  );
  ok(
    'eligible once the cooldown has passed',
    show({ reason: 'returning-thinker', state: dismissedNow, now: NOW + cooldownMs(1) + 1 }).show === true
  );

  // Repeated dismissals back off much further.
  const three = { ...EMPTY_PROMPT_STATE, dismissals: 3, lastDismissedAt: NOW };
  ok(
    'after three refusals, still silent two weeks on',
    show({ reason: 'returning-thinker', state: three, now: NOW + 14 * DAY_MS }).why === 'cooldown'
  );
}

console.log('\n=== sensitive moments are left alone ===');
{
  ok('reflecting is treated as sensitive', SENSITIVE_CONTEXTS.includes('reflecting'));
  const d = show({ reason: 'returning-thinker', context: 'reflecting' });
  ok('no proactive prompt while reflecting', d.show === false && d.why === 'sensitive-context');
  // But a boundary they walked into is still explained — silence would be worse.
  const e = show({ reason: 'explore-spent', context: 'reflecting' });
  ok('an entitlement prompt still explains itself', e.show === true);
  // Ordinary work is unaffected.
  ok('planning is not sensitive', show({ reason: 'returning-thinker', context: 'planning' }).show === true);
}

console.log('\n=== two prompts never stack ===');
for (const r of TRIGGER_REASONS) {
  const d = show({ reason: r, open: true });
  ok(`${r}: suppressed while one is open`, d.show === false && d.why === 'already-open');
}

console.log('\n=== several triggers at once: the best one wins ===');
{
  ok(
    'a spent counter beats a generic nudge',
    bestTrigger(['returning-thinker', 'explore-spent']) === 'explore-spent'
  );
  ok(
    'order does not matter',
    bestTrigger(['explore-spent', 'returning-thinker']) === 'explore-spent'
  );
  ok(
    'a hard limit beats a locked capability',
    bestTrigger(['depth-locked', 'chats-spent']) === 'chats-spent'
  );
  ok('a locked capability beats a nudge', bestTrigger(['returning-thinker', 'draft-locked']) === 'draft-locked');
  ok('nothing in, nothing out', bestTrigger([]) === null);
  ok('single trigger passes through', bestTrigger(['map-full']) === 'map-full');
}

console.log('\n=== engagement is read from real timestamps ===');
{
  const day = 24 * 60 * 60 * 1000;
  const e = engagementFrom([{ updatedAt: NOW }, { updatedAt: NOW - 3 * day }], 6);
  ok('counts sessions', e.sessions === 2);
  ok('counts distinct days', e.activeDays === 2);
  ok('carries map size through', e.mapNodes === 6);

  const sameDay = engagementFrom([{ updatedAt: NOW }, { updatedAt: NOW + 1000 }], 6);
  ok('two sessions one afternoon is one day', sameDay.activeDays === 1);

  const junk = engagementFrom([{ updatedAt: 0 }, { updatedAt: NaN }, { updatedAt: NOW }], 1);
  ok('ignores missing timestamps when counting days', junk.activeDays === 1);
  ok('but still counts the sessions', junk.sessions === 3);
  ok('no sessions at all', engagementFrom([], 0).activeDays === 0);
}

console.log('\n=== the decision is pure ===');
{
  const state = { ...EMPTY_PROMPT_STATE };
  const before = JSON.stringify(state);
  show({ reason: 'returning-thinker', state });
  show({ reason: 'chats-spent', state });
  show({ reason: 'chats-spent', state: { ...state, shownTriggers: ['chats-spent'] } });
  ok('decide() does not mutate the state it is given', JSON.stringify(state) === before);
  ok('and it did not grow a shownTriggers list of its own', state.shownTriggers.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
