// One record of what a person has already learned — and the four ways a
// first-run system ruins somebody's day: teaching twice, teaching the wrong
// person, forgetting on refresh, and arguing with itself across devices.

import {
  MILESTONES, EMPTY_FIRST_RUN, FIRST_RUN_KEY, ANALYTICS_FOR,
  parseFirstRun, has, reach, mergeFirstRun, aheadOf,
  legacyMilestones, readFirstRun, writeFirstRun, wantsIntro, wantsCoreLine,
} from './.tmp/first-run.mjs';
import { EVENTS } from './.tmp/analytics.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

console.log('=== reaching a milestone ===');
{
  const a = reach(EMPTY_FIRST_RUN, 'socria.intro', 1000);
  ok('the first time is fresh', a.fresh && has(a.state, 'socria.intro') && a.state.at['socria.intro'] === 1000);
  const b = reach(a.state, 'socria.intro', 2000);
  ok('the second time is not, and the time is kept', !b.fresh && b.state === a.state && b.state.at['socria.intro'] === 1000);
  ok('the input is never mutated', !has(EMPTY_FIRST_RUN, 'socria.intro'));
  const sk = reach(EMPTY_FIRST_RUN, 'logos.aha', 5, { skipped: true });
  ok('a skip still counts as reached', has(sk.state, 'logos.aha') && sk.state.skipped?.includes('logos.aha'));
  ok('every milestone has an analytics event or deliberately none', MILESTONES.every((m) => !ANALYTICS_FOR[m] || EVENTS.includes(ANALYTICS_FOR[m])),
    MILESTONES.filter((m) => ANALYTICS_FOR[m] && !EVENTS.includes(ANALYTICS_FOR[m])).join());
}

console.log('=== parsing, trusted for nothing ===');
{
  ok('junk is empty', Object.keys(parseFirstRun(null).at).length === 0 && Object.keys(parseFirstRun('x').at).length === 0);
  const p = parseFirstRun({ v: 9, at: { 'socria.intro': 12, 'not.a.milestone': 3, 'core.aha': 'soon', 'logos.model': -1 }, skipped: ['core.aha', 'nope', 'core.aha'] });
  ok('unknown milestones are dropped', !('not.a.milestone' in p.at));
  ok('a non-number time is dropped', !has(p, 'core.aha'));
  ok('a non-positive time is dropped', !has(p, 'logos.model'));
  ok('a known one is kept', p.at['socria.intro'] === 12);
  ok('skips are filtered and deduped', JSON.stringify(p.skipped) === '["core.aha"]', JSON.stringify(p.skipped));
}

console.log('=== two devices never argue ===');
{
  const a = { v: 1, at: { 'socria.intro': 100, 'core.first': 500 }, skipped: ['core.first'] };
  const b = { v: 1, at: { 'socria.intro': 300, 'logos.model': 200 } };
  const m = mergeFirstRun(a, b);
  ok('the earliest time wins', m.at['socria.intro'] === 100);
  ok('a milestone either side knows is known', has(m, 'core.first') && has(m, 'logos.model'));
  ok('skips are unioned', m.skipped?.length === 1 && m.skipped[0] === 'core.first');
  ok('a is ahead of b', aheadOf(a, b) && aheadOf(b, a));
  ok('the merge is ahead of neither', !aheadOf(m, m) && !aheadOf(a, m) && !aheadOf(b, m));
  ok('merging is commutative', JSON.stringify(mergeFirstRun(b, a).at) === JSON.stringify({ ...m.at }) || Object.keys(mergeFirstRun(b, a).at).every((k) => mergeFirstRun(b, a).at[k] === m.at[k]));
}

console.log('=== nobody who finished the old sequences is taught again ===');
{
  const old = store({ 'socria.firstmap.v1': 'done', 'socria.logos.guide.v1': '1', 'socria.core4IntroDontShowAgain.v1': '1', 'socria.tour.v1': '1' });
  const l = legacyMilestones(old, 7);
  ok('the finished first map is the whole Logos sequence', has(l, 'logos.first') && has(l, 'logos.model') && has(l, 'logos.aha'));
  ok('a dismissed Core 4 announcement is Core met', has(l, 'core.first') && has(l, 'socria.intro'));
  ok('the furniture tour is Socria met', has(legacyMilestones(store({ 'socria.tour.v1': '1' })), 'socria.intro'));
  ok('nothing in storage is nothing learned', Object.keys(legacyMilestones(store()).at).length === 0);
  const r = readFirstRun(old);
  ok('readFirstRun folds the old flags in', has(r, 'logos.aha') && has(r, 'core.first'));
  ok('…and a written record merges with them', (() => {
    const s = store({ 'socria.firstmap.v1': 'done' });
    writeFirstRun(s, { v: 1, at: { 'socria.thought': 9 } });
    const got = readFirstRun(s);
    return has(got, 'socria.thought') && has(got, 'logos.aha');
  })());
}

console.log('=== the browser ===');
{
  const s = store();
  writeFirstRun(s, reach(EMPTY_FIRST_RUN, 'core.aha', 42).state);
  ok('a write reads back', readFirstRun(s).at['core.aha'] === 42 && s.m.has(FIRST_RUN_KEY));
  const corrupt = store({ [FIRST_RUN_KEY]: '{nope' });
  ok('a corrupt record reads as nothing learned', Object.keys(readFirstRun(corrupt).at).length === 0);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const all = readFirstRun(blocked);
  ok('a blocked store reads as everything learned', MILESTONES.every((m) => has(all, m)));
  ok('  and writing to it does not throw', (() => { writeFirstRun(blocked, EMPTY_FIRST_RUN); return true; })());
  ok('no store at all is nothing learned', Object.keys(readFirstRun(null).at).length === 0);
}

console.log('=== who sees the premise ===');
{
  const fresh = EMPTY_FIRST_RUN;
  ok('a new person with nothing', wantsIntro(fresh, { work: 0, carried: false, hydrated: true }));
  ok('not before the list has loaded', !wantsIntro(fresh, { work: 0, carried: false, hydrated: false }));
  ok('not somebody with work on screen', !wantsIntro(fresh, { work: 3, carried: false, hydrated: true }));
  ok('not somebody arriving with a sentence from the introduction', !wantsIntro(fresh, { work: 0, carried: true, hydrated: true }));
  ok('never twice', !wantsIntro(reach(fresh, 'socria.intro').state, { work: 0, carried: false, hydrated: true }));
  ok('a skip counts as seen', !wantsIntro(reach(fresh, 'socria.intro', 1, { skipped: true }).state, { work: 0, carried: false, hydrated: true }));
  // The person who used Logos for months and opens the chat: they have met
  // Socria, whatever the chat's own flags say.
  const logosVeteran = reach(reach(fresh, 'logos.aha').state, 'socria.intro').state;
  ok('a Logos veteran is not new to Socria', !wantsIntro(logosVeteran, { work: 0, carried: false, hydrated: true }));
}

console.log('=== who sees Core\'s one line ===');
{
  ok('after a first reply', wantsCoreLine(EMPTY_FIRST_RUN, { replies: 1, streaming: false }));
  ok('not while it streams', !wantsCoreLine(EMPTY_FIRST_RUN, { replies: 1, streaming: true }));
  ok('not before a reply', !wantsCoreLine(EMPTY_FIRST_RUN, { replies: 0, streaming: false }));
  ok('never twice', !wantsCoreLine(reach(EMPTY_FIRST_RUN, 'core.first').state, { replies: 1, streaming: false }));
  // The person who used Core for months and opens Logos: the Logos sequence
  // is theirs to meet; the record says nothing about Logos yet.
  const coreVeteran = reach(reach(EMPTY_FIRST_RUN, 'socria.intro').state, 'core.aha').state;
  ok('a Core veteran still has Logos ahead of them', !has(coreVeteran, 'logos.aha') && !has(coreVeteran, 'logos.first'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
