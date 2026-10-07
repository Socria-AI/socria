// The first model, and the four ways a coach-mark sequence ruins somebody's
// day: showing up twice, for the wrong person, over an empty map, or refusing
// to die. And the fifth, which this version is about: pointing at a thing by
// a name the canonical model did not give it, or claiming a computation that
// never ran.

import {
  STEPS, byId, planFor, advance, shouldStart, finish, isRunning, indexOf,
  IDLE, DONE, ONBOARDING_KEY, DEFAULT_SHAPE,
} from './.tmp/onboarding.mjs';
import { FIRST_RUN_KEYS, forgetFirstRunLocal, readFirstRun, REPLAYS, withoutMilestones, MILESTONES } from './.tmp/first-run.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const read = (p) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const READY = { signedIn: true, completed: false, nodes: 5, busy: false, composing: false };
const MAP = { model: false, controls: 0, nodes: 5 };
const MODEL = { model: true, controls: 2, control: { label: 'a', kind: 'parameter' }, computed: { operation: 'Evaluate', backend: 'the expression sampler' }, nodes: 2 };
const MODEL_STILL = { model: true, controls: 0, control: null, computed: null, nodes: 2 };

console.log('=== it opens for the right person, at the right moment ===');
{
  ok('a new signed-in person with a real map', shouldStart(READY));
  // THE ONE THAT MATTERS: never twice.
  ok('never for someone who has done it', !shouldStart({ ...READY, completed: true }));
  ok('not signed out', !shouldStart({ ...READY, signedIn: false }));
  // Pointing at a map that is still being drawn points at nothing.
  ok('not while a reply is streaming', !shouldStart({ ...READY, busy: true }));
  // NEVER INTERRUPT A SENTENCE.
  ok('not while they are typing', !shouldStart({ ...READY, composing: true }));
  // Two boxes is not a map.
  for (const n of [0, 1, 2, 3]) ok(`not over ${n} nodes`, !shouldStart({ ...READY, nodes: n }));
  for (const n of [4, 5, 9, 40]) ok(`yes over ${n} nodes`, shouldStart({ ...READY, nodes: n }));
  ok('a model document is a shape by itself', shouldStart({ ...READY, nodes: 1, model: true }));
}

console.log('=== the plan is written for what is actually there ===');
{
  const m = planFor(MODEL);
  ok('three beats', m.length === 3 && STEPS.length === 3);
  ok('the first beat is the one sentence', m[0].title === 'This is your thinking becoming a model.' && planFor(MAP)[0].title === m[0].title);
  ok('on a model with a control, the cue names it and points at it', /move a\./.test(m[0].cue) && m[0].anchor === 'control', m[0].cue);
  ok('  and never calls a parameter an assumption', !/assumption/i.test(m[0].cue + m[0].body));
  ok('on a map, the cue is to press a card', /Press any card/.test(planFor(MAP)[0].cue) && planFor(MAP)[0].anchor === 'map');
  ok('a model with nothing to move asks to open something', /open it/.test(planFor(MODEL_STILL)[0].cue));
  ok('the second beat on a model is the consequence line', m[1].title === 'Change the model, and Logos updates what depends on it.');
  ok('  and names the computation only because one ran', /Evaluate ran again on the expression sampler/.test(m[1].body), m[1].body);
  ok('  a model nothing computed says nothing about computing', !/ran|computed/i.test(planFor(MODEL_STILL)[1].body), planFor(MODEL_STILL)[1].body);
  ok('  and asks for Ask about this next', /Ask about this/.test(m[1].cue));
  ok('the second beat on a map is that every card opens', planFor(MAP)[1].title === 'Every card opens.');
  ok('the last beat releases', m[2].title === 'Now keep thinking.' && m[2].cue === '' && planFor(MAP)[2].title === 'Now keep thinking.');
  ok('byId reads the plan for the shape', byId('became', MODEL).anchor === 'control' && byId('became', MAP).anchor === 'map');
  ok('the default shape is a map', DEFAULT_SHAPE.model === false);
  ok('no copy names a feature', !STEPS.some((s) => /Thinking Map|Logos 2|Core 4/.test(s.body + s.title)));
  ok('no congratulations', !m.some((s) => /congrat|complete!|mastered/i.test(s.title + s.body)));
}

console.log('=== it advances only on what the person did ===');
{
  ok('a card pressed before there is a map is nothing', advance(IDLE, 'node-pressed').at === 'idle');
  ok('the map drawing opens it', advance(IDLE, 'map-drew').at === 'became');
  ok('a model built opens it', advance(IDLE, 'model-built', MODEL).at === 'became');

  // On a model with controls: move → changed; ask → release.
  let s = advance(IDLE, 'model-built', MODEL);
  ok('pressing a card does not skip the move on a model with controls', advance(s, 'node-pressed', MODEL).at === 'became');
  s = advance(s, 'control-moved', MODEL);
  ok('moving a value is the second beat', s.at === 'changed');
  ok('moving it again is not a new thing', advance(s, 'control-moved', MODEL).at === 'changed');
  ok('asking about something releases', advance(s, 'asked', MODEL).at === 'release');
  ok("a card's own action is asking too", advance(s, 'action-taken', MODEL).at === 'release');

  // On a map: press → changed; action → release.
  let t = advance(IDLE, 'map-drew', MAP);
  ok('on a map a control cannot be moved, so it does not advance', advance(t, 'control-moved', MAP).at === 'became');
  t = advance(t, 'node-pressed', MAP);
  ok('a card pressed is the second beat', t.at === 'changed');
  ok('pressing another card is not a new thing', advance(t, 'node-pressed', MAP).at === 'changed');
  ok('asked does not release a map sequence (there is no object to ask about)', advance(t, 'asked', MAP).at === 'changed');
  ok('choosing an action releases', advance(t, 'action-taken', MAP).at === 'release');

  // A model with nothing to move: opening anything is the second beat.
  const u = advance(IDLE, 'model-built', MODEL_STILL);
  ok('a still model advances on a press or an ask', advance(u, 'node-pressed', MODEL_STILL).at === 'changed' && advance(u, 'asked', MODEL_STILL).at === 'changed');

  ok('the last beat stays until finished', advance({ at: 'release' }, 'action-taken').at === 'release');
  ok('finish is done', finish().at === 'done');
  ok('skip from anywhere is done', ['idle', 'became', 'changed', 'release'].every((at) => advance({ at }, 'skip').at === 'done'));
  ok('done stays done', advance(DONE, 'map-drew').at === 'done');
}

console.log('=== bookkeeping ===');
{
  ok('idle and done are not running', !isRunning(IDLE) && !isRunning(DONE));
  ok('the three beats are', ['became', 'changed', 'release'].every((at) => isRunning({ at })));
  ok('indexOf counts the beats', indexOf({ at: 'became' }) === 0 && indexOf({ at: 'changed' }) === 1 && indexOf({ at: 'release' }) === 2 && indexOf(IDLE) === -1);
  ok('the legacy key is still named, for the record that reads it', ONBOARDING_KEY === 'socria.firstmap.v1');
}

console.log('\n=== replaying onboarding, for testing ===');
{
  const mem = new Map(FIRST_RUN_KEYS.map((k) => [k, k === 'socria.firstrun.v1' ? JSON.stringify({ v: 1, at: { 'socria.intro': 1, 'logos.aha': 2 } }) : '1']));
  mem.set('socria.model.v1', 'core-4');
  const store = { getItem: (k) => mem.get(k) ?? null, removeItem: (k) => mem.delete(k), setItem: (k, v) => mem.set(k, v) };
  forgetFirstRunLocal(store);
  ok('every first-run key on the device is forgotten, legacy flags and hints included', FIRST_RUN_KEYS.every((k) => !mem.has(k)) && Object.keys(readFirstRun(store).at).length === 0);
  ok('  and nothing else', mem.get('socria.model.v1') === 'core-4');
  let threw = false;
  try { forgetFirstRunLocal({ removeItem: () => { throw new Error('blocked'); } }); } catch { threw = true; }
  ok('  a blocked store does not throw', !threw);
  const route = read('app/api/profile/route.ts');
  ok('the account copy can be reset or replaced — the writes that are not a union', /testing && b\.firstRunReset === true/.test(route) && /row\.first_run = EMPTY_FIRST_RUN/.test(route) && /testing && b\.firstRunReplace/.test(route));
  ok('  and never on production, where a record only grows', /const testing = !isProduction\(\);/.test(route));
  const rec = { v: 1, at: Object.fromEntries(MILESTONES.map((m, i) => [m, i + 1])), skipped: ['logos.aha'] };
  const core = withoutMilestones(rec, REPLAYS.core.milestones);
  ok('replaying Core takes back exactly its two milestones', !core.at['core.first'] && !core.at['core.aha'] && Object.keys(core.at).length === MILESTONES.length - 2);
  const lg = withoutMilestones(rec, REPLAYS.logos.milestones);
  ok('replaying Logos takes back every logos.* milestone and its skip, nothing else', Object.keys(lg.at).every((m) => !m.startsWith('logos.')) && !lg.skipped && !!lg.at['core.first'] && !!lg.at['socria.intro']);
  ok('  and the old Logos flags that would put them back', ['socria.firstmap.v1', 'socria.logos.guide.v1'].every((k) => REPLAYS.logos.keys.includes(k)));
  ok('replaying the notes takes back found.* and the hints seen', Object.keys(withoutMilestones(rec, REPLAYS.found.milestones).at).every((m) => !m.startsWith('found.')) && REPLAYS.found.keys.includes('socria.hints.seen.v1'));
  const ob = read('components/onboarding/Onboarding.tsx');
  ok('/onboarding?replay=1 resets, then loads clean — never on production', /params\?\.get\('replay'\) === '1' && !isProduction\(\)/.test(ob) && /window\.location\.replace/.test(ob));
  ok('the Logos door opens the newest Logos on offer', /isOffered\('logos-3'\) \? '\/chat\?model=logos-3'/.test(ob));
  const sheet = read('components/account/AccountSheet.tsx');
  const tools = read('components/account/TestingTools.tsx');
  ok('Manage Account has a Testing section', /<TestingTools onClose=\{onClose\} \/>/.test(sheet) && /<span className="lbl">Testing<\/span>/.test(tools));
  ok('  which renders nothing on production', /if \(isProduction\(\)\) return null;/.test(tools));
  ok('  with both replays, the parts, and the layout resets', /href="\/onboarding\?replay=1"/.test(tools) && /href="\/onboarding\?replay=1&to=logos"/.test(tools) && /replayPart\('core'\)/.test(tools) && /replayPart\('logos'\)/.test(tools) && /replayPart\('found'\)/.test(tools) && /CANVAS_PREFIX/.test(tools));
  ok('  and it touches no conversations, maps or memory', !/conversations|\/api\/memory|socria\.logos\.sessions/.test(tools.replace(/never your conversations, maps, models or memory|Nothing here reaches anybody's\s*\/\/ conversations, maps, models or memory\./g, '')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
