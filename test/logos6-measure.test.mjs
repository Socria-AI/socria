// Logos 6, Phase 0: measure first (docs/LOGOS-6-PLAN.md §6.C, §7).
//
// Held here: every part of Logos 6 is switchable and ships on everywhere but production, the proactive
// flag off everywhere until named; a feature test assigns people at random, stably, only on the plans it
// covers, and its control arm sees Logos 5.5 for the parts it covers; the events carry shape and never
// content, and the first-party counter refuses any value outside its vocabularies; the use and voluntary
// return measures count what they say; a checkout is counted against the capability used before it.

import {
  readL6, withArms, armToken, cleanArms, L6_PARTS, EXPERIMENT_PARTS,
  useModel, returnModel,
  armIn, armsFor, runningExperiments, FEATURE_EXPERIMENTS,
  recentCapability, noteCapability, LAST_CAPABILITY_KEY,
  kindsFor, EVENTS, scrub, COUNTED_EVENTS, vocab,
} from './.tmp/logos6-under-test.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== switches: on off production, off in production, proactive only by name ===');
{
  const dev = readL6({}, 'preview');
  const prod = readL6({}, 'production');
  const local = readL6({}, 'development');
  ok('every part but the proactive flag is on in a preview', L6_PARTS.every((p) => dev[p] === (p !== 'proactive')), JSON.stringify(dev));
  ok('and on a local server', L6_PARTS.every((p) => local[p] === (p !== 'proactive')));
  ok('every part is off in production by default', L6_PARTS.every((p) => prod[p] === false), JSON.stringify(prod));
  const allOn = readL6({ all: 'on' }, 'production');
  ok('NEXT_PUBLIC_LOGOS6=on turns the parts on in production', allOn.challenge && allOn.focus && allOn.sources);
  ok('…but never the proactive flag', allOn.proactive === false);
  ok('the proactive flag comes on only by name', readL6({ proactive: 'on' }, 'preview').proactive === true);
  ok('a part named off stays off whatever the rest say', readL6({ all: 'on', focus: 'off' }, 'preview').focus === false);
  ok('a part named on in production is on', readL6({ links: 'on' }, 'production').links === true && readL6({ links: 'on' }, 'production').focus === false);
  const noChallenge = readL6({ challenge: 'off', chip: 'on', proactive: 'on', guessFirst: 'on' }, 'preview');
  ok('the chip, the flag and Guess first need challenge', !noChallenge.chip && !noChallenge.proactive && !noChallenge.guessFirst);
  ok('comparing documents needs sources', readL6({ sources: 'off', compare: 'on' }, 'preview').compare === false);
  const src = read('lib/logos6/switches.ts');
  const literal = L6_PARTS.every((p) => new RegExp(`process\\.env\\.NEXT_PUBLIC_LOGOS6_[A-Z_]+`).test(src));
  ok('every switch is read by its literal name (Next inlines only those)', literal && /process\.env\.NEXT_PUBLIC_LOGOS6,/.test(src) && (src.match(/process\.env\.NEXT_PUBLIC_LOGOS6_/g) ?? []).length === L6_PARTS.length);
}

console.log('\n=== feature tests: random, stable, narrow, and only by narrowing ===');
{
  ok('nothing runs by default', runningExperiments({}).length === 0 && armsFor('user_1', 'free', {}) === null);
  ok('an unknown id runs nothing', runningExperiments({ LOGOS6_EXPERIMENTS: 'made-up' }).length === 0);
  const env = { LOGOS6_EXPERIMENTS: 'l6-challenge' };
  ok('the challenge test runs when named', runningExperiments(env).map((x) => x.id).join() === 'l6-challenge');
  ok('a guest is never in an arm', armsFor(null, 'free', env) === null);
  ok('a Socria One subscriber is never in an arm', armsFor('user_1', 'one', env) === null);
  const a1 = armsFor('user_1', 'free', env);
  ok('a trial account is assigned', a1 && (a1['l6-challenge'] === 'control' || a1['l6-challenge'] === 'treatment'));
  ok('the same account, the same arm, every time', JSON.stringify(armsFor('user_1', 'free', env)) === JSON.stringify(a1));
  const spec = FEATURE_EXPERIMENTS['l6-challenge'];
  let control = 0;
  for (let i = 0; i < 4000; i++) if (armIn(spec, `user_${i}`) === 'control') control++;
  ok('about half and half over 4,000 accounts', control > 1800 && control < 2200, String(control));
  const tilted = { ...spec, arms: [{ arm: 'control', weight: 0 }, { arm: 'treatment', weight: 1 }] };
  ok('a zero-weight arm gets no one', Array.from({ length: 200 }, (_, i) => armIn(tilted, `u${i}`)).every((a) => a === 'treatment'));
  const flags = readL6({}, 'preview');
  const ctl = withArms(flags, { 'l6-challenge': 'control' });
  ok('the control arm sees Logos 5.5 for the parts the test covers', EXPERIMENT_PARTS['l6-challenge'].every((p) => ctl[p] === false));
  ok('…and everything else as the deployment has it', ctl.focus && ctl.sources && ctl.links);
  const trt = withArms(flags, { 'l6-challenge': 'treatment' });
  ok('the treatment arm sees the deployment as it is', JSON.stringify(trt) === JSON.stringify(flags));
  ok('an arm never turns on a part the deployment has off', withArms(readL6({}, 'production'), { 'l6-challenge': 'treatment' }).challenge === false);
  ok('arms off the wire are cleaned', cleanArms({ 'l6-challenge': 'treatment', 'x y': 'control', z: 'both' })?.['l6-challenge'] === 'treatment' && Object.keys(cleanArms({ 'l6-challenge': 'treatment', 'x y': 'control' })).length === 1);
  ok('nothing usable is no arms', cleanArms('control') === null && cleanArms([]) === null && cleanArms({}) === null);
  ok('the token an event carries', armToken({ 'l6-challenge': 'control' }) === 'control' && armToken(null) === undefined);
  const plan = read('app/api/logos/plan/route.ts');
  ok('the plan route reports the arms, recomputed from the id', /armsFor\(userId \?\? null/.test(plan) && /\.\.\.\(arms \? \{ arms \} : \{\}\)/.test(plan));
}

console.log('\n=== events: shape only, counted only within their vocabularies ===');
{
  for (const e of vocab.L6_EVENTS) ok(`${e} is an event`, EVENTS.includes(e));
  for (const e of vocab.L6_EVENTS) ok(`${e} is counted first-party`, COUNTED_EVENTS.includes(e));
  const clean = scrub({ door: 'words', scope: 'line', count: 3, arm: 'treatment', label: 'my secret thesis', quote: 'words', from: 'a@b.c', to: 'c@d.e' });
  ok('the new keys pass, anything else is dropped', clean.door === 'words' && clean.scope === 'line' && clean.count === 3 && clean.arm === 'treatment' && !('label' in clean) && !('quote' in clean) && !('from' in clean) && !('to' in clean), JSON.stringify(clean));
  const k = (e, p) => JSON.stringify(kindsFor(e, p));
  ok('a challenge asked for, by door and scope', k('challenge_requested', { door: 'words', scope: 'line' }) === '["from:words","scope:line"]');
  ok('…and with its arm beside it', k('challenge_requested', { door: 'chip', arm: 'control' }) === '["from:chip","from:chip|arm:control"]');
  ok('a door that is not one is not counted', kindsFor('challenge_requested', { door: 'my essay about Reconstruction' }) === null);
  ok('a finding acted on, as kind:action', k('finding_action', { kind: 'assumption', outcome: 'kept' }) === '["assumption:kept"]');
  ok('an unknown kind or action is refused', kindsFor('finding_action', { kind: 'nonsense', outcome: 'kept' }) === null && kindsFor('finding_action', { kind: 'risk', outcome: 'loved' }) === null);
  ok('a challenge shown, by outcome and a bounded count', k('challenge_shown', { outcome: 'held', count: 0 }) === '["outcome:held","count:0"]' && k('challenge_shown', { count: 400 }) === '["outcome:found","count:9"]');
  ok('moving between levels, and how', k('level_changed', { door: 'everything', level: 'idea', kind: 'link' }) === '["everything>idea","how:link"]');
  ok('a level to itself is not a move', kindsFor('level_changed', { door: 'line', level: 'line' }) === null);
  ok('a conversation opened, by door', k('conversation_opened', { door: 'disc' }) === '["from:disc"]' && kindsFor('conversation_opened', { door: 'https://x' }) === null);
  ok('Simpler / Deeper', k('simpler_deeper', { kind: 'deeper', door: 'idea' }) === '["which:deeper","from:idea"]');
  ok('a checkout and what came before it', k('one_checkout_context', { kind: 'challenge', trigger: 'trial-end' }) === '["cap:challenge","trigger:trial-end"]');
  ok('a trigger that is not a token is unknown, a capability that is not one is none', k('one_checkout_context', { kind: 'magic', trigger: 'Trial End!' }) === '["cap:none","trigger:unknown"]');
  ok('the onboarding counts are untouched', k('onboarding_answered', { step: 'who', kind: 'skipped' }) === '["who:skipped"]');
}

console.log('\n=== use: by event and key, with the arms beside ===');
{
  const now = Date.UTC(2026, 10, 13, 12);
  const rows = [
    { day: '2026-11-12', event: 'challenge_requested', kind: 'from:words', n: 5 },
    { day: '2026-11-12', event: 'challenge_requested', kind: 'scope:line', n: 5 },
    { day: '2026-11-11', event: 'challenge_requested', kind: 'from:card', n: 2 },
    { day: '2026-11-11', event: 'challenge_requested', kind: 'from:card|arm:treatment', n: 2 },
    { day: '2026-11-11', event: 'finding_action', kind: 'assumption:kept', n: 3 },
    { day: '2026-11-11', event: 'finding_action', kind: 'risk:dismissed', n: 1 },
    { day: '2026-11-10', event: 'level_changed', kind: 'everything>line', n: 4 },
    { day: '2026-11-10', event: 'level_changed', kind: 'how:press', n: 4 },
    { day: '2026-09-01', event: 'challenge_requested', kind: 'from:words', n: 99 },
  ];
  const u = useModel(rows, now, 28);
  ok('an event totals its occurrences, not its keys', u.events.challenge_requested.total === 7, String(u.events.challenge_requested?.total));
  ok('a finding action is one key each', u.events.finding_action.total === 4);
  ok('a move between levels is its a>b key', u.events.level_changed.total === 4);
  ok('outside the window is not counted', !u.events.challenge_requested.keys.some((x) => x.n >= 99));
  const card = u.events.challenge_requested.keys.find((x) => x.kind === 'from:card');
  ok('an arm is counted beside its total', card && card.n === 2 && card.treatment === 2 && card.control === 0 && u.armed);
  ok('no arm, nothing armed', useModel(rows.filter((r) => !r.kind.includes('|arm:')), now).armed === false);
}

console.log('\n=== voluntary return (H4): days 2–7, of their own accord ===');
{
  const D = 86_400_000;
  const start = Date.UTC(2026, 10, 2, 9); // a Monday
  const day = (k) => new Date(Date.UTC(2026, 10, 2) + (k - 1) * D).toISOString().slice(0, 10);
  const now = start + 10 * D;
  const m = returnModel({
    starts: [
      { user: 'a', at: start },
      { user: 'b', at: start },
      { user: 'c', at: start },
      { user: 'd', at: now - 2 * D }, // still in the trial
    ],
    active: [
      { user: 'a', day: day(1) }, { user: 'a', day: day(3) }, { user: 'a', day: day(5) }, // two back
      { user: 'b', day: day(2) }, { user: 'b', day: day(4) }, // both after an email: prompted
      { user: 'c', day: day(1) }, { user: 'c', day: day(6) }, // one back
      { user: 'd', day: day(1) },
    ],
    emails: [
      { user: 'b', at: Date.UTC(2026, 10, 2, 18) }, // day 1 → day 2 is prompted
      { user: 'b', at: Date.UTC(2026, 10, 5, 7) }, // day 4 itself
    ],
    armOf: (u) => (u === 'a' || u === 'b' ? 'treatment' : 'control'),
    now,
  });
  ok('every trial begun is counted, finished or not', m.overall.begun === 4 && m.overall.complete === 3, JSON.stringify(m.overall));
  ok('two days back of their own accord is a return', m.overall.returned === 1);
  ok('a day after an email is prompted, not voluntary', m.prompted === 2, String(m.prompted));
  ok('the share is over finished trials', Math.abs(m.overall.share - 1 / 3) < 1e-9);
  ok('the first day is never a return', Math.abs(m.overall.meanDays - (2 + 0 + 1) / 3) < 1e-9, String(m.overall.meanDays));
  const week = m.rows.find((r) => r.cohort === '2026-11-02' && r.arm === 'all');
  ok('cohorts by the Monday the trial began', !!week && week.begun === 3 && m.rows.some((r) => r.cohort === '2026-11-09' && r.arm === 'all' && r.begun === 1), JSON.stringify(m.rows));
  const t = m.rows.find((r) => r.cohort === '*' && r.arm === 'treatment');
  const c = m.rows.find((r) => r.cohort === '*' && r.arm === 'control');
  ok('each arm beside the total', t && c && t.complete === 2 && t.returned === 1 && c.complete === 1 && c.returned === 0, JSON.stringify(m.rows));
  ok('nothing, read as nothing', returnModel({ starts: [], active: [], emails: [], now }).overall.share === null);
  ok('the measure returns no account id', !JSON.stringify(m).includes('"a"') && !/"user"/.test(JSON.stringify(m)));
}

console.log('\n=== a checkout, counted against the capability before it ===');
{
  const box = new Map();
  const store = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v) };
  const now = Date.UTC(2026, 10, 13);
  ok('nothing used: none', recentCapability(now, store) === 'none');
  noteCapability('challenge', now - 2 * 86_400_000, store);
  ok('used two days ago: that capability', recentCapability(now, store) === 'challenge');
  ok('the key is a Socria key', box.has(LAST_CAPABILITY_KEY) && LAST_CAPABILITY_KEY.startsWith('socria.'));
  ok('eight days ago is too long ago', recentCapability(now + 6 * 86_400_000 + 1, store) === 'none');
  ok('a broken note is none', recentCapability(now, { getItem: () => '{nope' }) === 'none');
  const app = read('components/LogosApp.tsx');
  ok('every way into the One sheet carries its own trigger', ['voice-locked', 'experiments', 'menu', 'maps-limit', 'one-button', 'trial-end', 'sleep', 'gift-deep'].every((t) => app.includes(`'${t}'`)));
  ok('the checkout carries the opening moment, not "asked" for all', /oneOpen \? askTriggerRef\.current : undefined/.test(app));
  ok('and counts what came before it', /l6track\('one_checkout_context', \{ kind: recentCapability\(\)/.test(app));
}

console.log('\n=== the dev page: dev only, and no person ===');
{
  const page = read('app/dev/logos6/page.tsx');
  ok('off production and for the owner, as the trial page', /if \(isProduction\(\)\) return false/.test(page) && /mayViewDashboard/.test(page) && /operatorGranted/.test(page) && /notFound\(\)/.test(page));
  ok('never indexed', /NOINDEX/.test(page));
  const srv = read('lib/logos6/measure-server.ts');
  ok('the reads are server-only', /^import 'server-only';/.test(srv));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
