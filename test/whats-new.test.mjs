// "WE KILLED THE CHATBOT." — what changed, told once, to the people it changed for.
//
// What is held down:
//   • who: somebody who did something in Socria — a milestone, a conversation —
//     before the new one first opened for them (`socria.opened`), and nobody
//     else: not a person who met Socria as it is now, not before the account's
//     copy of the record is in, never over the premise, never twice;
//   • the moment is per person and the earliest across devices, so it does
//     not depend on when this reached them;
//   • where: over the map on Logos 5, the last beat lifting away to the map
//     (Core's chat told an account too, until it was archived);
//   • what: three beats — the chatbot gone and nothing lost, how to read the
//     map and its lenses, the one box — with Skip, Back and the keyboard;
//   • replayable for testing, and the replay moves the line to now.

import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import {
  EMPTY_FIRST_RUN, MILESTONES, REPLAYS, ANALYTICS_FOR, has, reach, mergeFirstRun, readFirstRun,
  usedBefore, wantsWhatsNew, wantsIntro, withoutMilestones,
} from './.tmp/first-run.mjs';
import { EVENTS } from './.tmp/analytics.mjs';
import * as U from './.tmp/logos5-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 22, 12);
const ctx = (o = {}) => ({ work: [], hydrated: true, synced: true, introShowing: false, ...o });
const opened = (s, t = T0) => reach(s, 'socria.opened', t).state;

console.log('=== who used the Socria before this one ===');
{
  ok('nobody can be told apart before the new one has opened for them', !usedBefore(EMPTY_FIRST_RUN, [T0 - DAY]));
  const fresh = opened(EMPTY_FIRST_RUN);
  ok('a person who met Socria as it is now did nothing before it', !usedBefore(fresh, []));
  const later = reach(reach(fresh, 'socria.intro', T0 + 5000).state, 'socria.thought', T0 + 9000).state;
  ok('  and everything they go on to do is after it', !usedBefore(later, [T0 + 60_000, T0 + DAY]));
  const veteran = opened(reach(reach(EMPTY_FIRST_RUN, 'socria.intro', T0 - 30 * DAY).state, 'core.aha', T0 - 29 * DAY).state);
  ok('a milestone from before it says they were here', usedBefore(veteran, []));
  ok('a conversation last touched before it says so too, with an empty record', usedBefore(opened(EMPTY_FIRST_RUN), [T0 + DAY, T0 - 3 * DAY]));
  ok('  a time that is not one says nothing', !usedBefore(opened(EMPTY_FIRST_RUN), [0, NaN, -5]));
  ok('  and strictly before: the moment itself is the new Socria\'s', !usedBefore(opened(EMPTY_FIRST_RUN), [T0]));
  // what the new Socria records itself never counts as having used the old one
  const recorded = opened(reach(reach(EMPTY_FIRST_RUN, 'logos.merged', T0 - DAY).state, 'socria.new', T0 - DAY).state);
  ok('what is recorded rather than done is not evidence', !usedBefore(recorded, []));
}

console.log('=== who is told ===');
{
  const veteran = opened(reach(EMPTY_FIRST_RUN, 'socria.thought', T0 - 40 * DAY).state);
  ok('somebody who used it before is told', wantsWhatsNew(veteran, ctx()));
  ok('  not before their conversations have loaded', !wantsWhatsNew(veteran, ctx({ hydrated: false })));
  ok('  not before the account\'s copy of the record is in', !wantsWhatsNew(veteran, ctx({ synced: false })));
  // (a veteran with nothing left on screen and no premise on record is shown
  // the premise — wantsIntro — and this waits behind it)
  ok('  not over the premise', !wantsWhatsNew(veteran, ctx({ introShowing: true })));
  ok('  not while a reply or a sort is under way', !wantsWhatsNew(veteran, ctx({ busy: true })));
  const told = reach(veteran, 'socria.new', T0 + 1000).state;
  ok('  never twice', !wantsWhatsNew(told, ctx()));
  ok('  a skip counts as told', !wantsWhatsNew(reach(veteran, 'socria.new', T0, { skipped: true }).state, ctx()));
  const stranger = opened(EMPTY_FIRST_RUN);
  ok('a stranger is not — they get the premise', !wantsWhatsNew(stranger, ctx()) && wantsIntro(stranger, { work: 0, carried: false, hydrated: true }));
  ok('a person who began after it is not, however much they have done since', !wantsWhatsNew(stranger, ctx({ work: [T0 + DAY, T0 + 2 * DAY] })));
  ok('somebody whose only trace is an old conversation is', wantsWhatsNew(stranger, ctx({ work: [T0 - 90 * DAY] })));
  // A blocked store reads as everything learned: a private window is never re-taught
  const blocked = readFirstRun({ getItem: () => { throw new Error('blocked'); } });
  ok('a private window is told nothing', !wantsWhatsNew(blocked, ctx({ work: [1000] })));
}

console.log('=== the moment is the earliest, across devices ===');
{
  const phone = reach(EMPTY_FIRST_RUN, 'socria.opened', T0).state;
  const laptop = reach(EMPTY_FIRST_RUN, 'socria.opened', T0 + 7 * DAY).state;
  const both = mergeFirstRun(laptop, phone);
  ok('the first device to open it sets the line', both.at['socria.opened'] === T0);
  ok('  so what was done between the two opens is the new Socria\'s', !usedBefore(both, [T0 + 2 * DAY]) && usedBefore(laptop, [T0 + 2 * DAY]));
  const toldOnPhone = reach(phone, 'socria.new', T0 + 100).state;
  ok('told on one device, told on all', !wantsWhatsNew(mergeFirstRun(laptop, toldOnPhone), ctx({ work: [T0 - DAY] })));
}

console.log('=== the record ===');
{
  ok('both milestones exist', MILESTONES.includes('socria.opened') && MILESTONES.includes('socria.new'));
  ok('finishing it is an event the product declares', ANALYTICS_FOR['socria.new'] === 'whats_new_completed' && EVENTS.includes('whats_new_completed') && EVENTS.includes('whats_new_started'));
  ok('opening the new Socria is not an event', !ANALYTICS_FOR['socria.opened']);
  const all = Object.fromEntries(MILESTONES.map((m, i) => [m, i + 1]));
  const rec = { v: 1, at: all };
  const again = withoutMilestones(rec, REPLAYS.new.milestones);
  ok('replaying it takes back being told and moves the line', !has(again, 'socria.new') && !has(again, 'socria.opened') && Object.keys(again.at).length === MILESTONES.length - 2);
  ok('  so on the next load everything already here counts as before', usedBefore(reach(again, 'socria.opened', 10_000).state, []));
  const fromScratch = withoutMilestones(rec, REPLAYS.all.milestones);
  ok('replaying everything keeps when it first opened, like the merge', has(fromScratch, 'socria.opened') && has(fromScratch, 'logos.merged') && !has(fromScratch, 'socria.new'));
}

console.log('=== where it is shown ===');
{
  const hook = read('components/useFirstRun.ts');
  ok('the hook records the new Socria opening once the record is read, for everybody (no code holds it back now)',/useEffect\(\(\) => \{\s*if \(ready\) reach\('socria\.opened'\);\s*\}, \[ready, reach\]\);/.test(hook));
  ok('  and says when the account copy is in, computed so no frame decides early', /const synced = ready && \(!opts\.signedIn \|\| merged\)/.test(hook) && /accountMerge \?\?= mergeAccount\(\)/.test(hook));
  ok('  every replay asks the account again', (hook.match(/accountMerge = null;/g) ?? []).length === 2);
  ok('  and a milestone a page leaves on still reaches the account', /keepalive: true/.test(hook));
  const app = read('components/LogosApp.tsx');
  ok('Logos 5 tells it on the map, and only there', /const whatsNewShown =\s*homeShown &&\s*!togetherReadOnly &&\s*wantsWhatsNew\(firstRun\.state/.test(app));
  ok('  every conversation counts, the Core chats beside them too', /work: \[\.\.\.withWork\.map\(\(x\) => x\.updatedAt\), \.\.\.chatsBeside\.map\(\(c\) => c\.updatedAt\)\]/.test(app));
  ok('  not over the premise, nor while anything is under way', /introShowing: introWanted/.test(app) && /busy: busy \|\| !!streaming \|\| organizing \|\| sortPending/.test(app));
  ok('  finishing or skipping is reached once', /onDone=\{\(\) => firstRun\.reach\('socria\.new'\)\}/.test(app) && /onSkip=\{\(\) => firstRun\.reach\('socria\.new', \{ skipped: true \}\)\}/.test(app));
  // Core's chat told it too, its last beat opening the map; that was archived with the Core chat (app/chat/page.tsx).
  const tools = read('components/account/TestingTools.tsx');
  ok('Manage Account → Testing can replay it', /replayPart\('new'\)/.test(tools) && /We killed the chatbot/.test(tools));
}

console.log('=== what it says ===');
{
  const noop = () => {};
  const html = renderToStaticMarkup(h(U.WhatsNew, { surface: 'logos', kept: 23, onDone: noop, onSkip: noop }));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok('it opens on the line itself', /We killed the chatbot\./.test(text) && /Socria is a map of your thinking now\./.test(text), text);
  ok('  and says nothing was lost, counting what was kept', /All 23 of your conversations are on it — nothing was lost\./.test(text));
  ok('  it is a labelled dialog', /role="dialog"/.test(html) && /aria-modal="true"/.test(html) && /aria-labelledby="wn-title"/.test(html) && /id="wn-title"/.test(html));
  ok('  three steps, the first lit', (html.match(/<i class="(on|was)?"?/g) ?? []).length >= 1 && /aria-label="Step 1 of 3"/.test(html));
  ok('  Skip is always there; Back is not on the first', /class="wn-skip"/.test(html) && !/class="wn-back"/.test(html));
  ok('  the drawing folds a chat into the map: bubbles, subjects, discs, a link', (html.match(/class="wn-bub"/g) ?? []).length === 5 && (html.match(/class="wn-ring"/g) ?? []).length === 2 && /class="wn-link"/.test(html) && /mask="url\(#/.test(html));
  ok('  and the drawing is hidden from a screen reader', /class="wn-art" aria-hidden="true"/.test(html));
  ok('kept, counted plainly', U.keptLine(0) === 'Nothing you had was lost.' && U.keptLine(1) === 'Your conversation is on it — nothing was lost.' && U.keptLine(1204) === 'All 1,204 of your conversations are on it — nothing was lost.');
  const src = read('components/onboarding/WhatsNew.tsx');
  ok('the second beat reads the map and its four lenses', /Your map, not a list\./.test(src) && ['Today', 'This week', 'This month', 'All time'].every((l) => src.includes(`'${l}'`)) && /as a line through time/.test(src));
  ok('the third is the box, and Projects', /Everything starts in one box\./.test(src) && /Search or start something new…/.test(src) && /drag a conversation onto one to file it/.test(src));
  ok('the last button shows the map over it, or opens it from the chat', /'Show me my map'/.test(src) && /'Take me to my map'/.test(src));
  ok('Esc skips, the arrows step', /e\.key === 'Escape'[\s\S]{0,80}onSkip\(\)/.test(src) && /'ArrowRight'/.test(src) && /'ArrowLeft'/.test(src));
  ok('it says it began, once per showing', /track\('whats_new_started', \{ surface \}\)/.test(src));
  const css = read('components/onboarding/whats-new.css');
  ok('without motion, every drawing rests at the end of its story', /\.wn-bub \{\s*opacity: 0;/.test(css) && /\.wn-typed \{[^}]*opacity: 0;/.test(css) && /\.wn-chip \{\s*opacity: 0;/.test(css) && /@media \(prefers-reduced-motion: no-preference\)/.test(css));
  ok('every dark ground has its own colours', ['dark', 'one', 'night'].every((t) => css.includes(`html[data-theme='${t}'] .wn {`)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
