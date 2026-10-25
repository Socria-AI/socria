// The Causal Evaluation System's online half (lib/mr/experiment.ts):
// assignment, the experiment registry, which condition a turn runs under, and
// the two comparison arms' text.
import { bucket, armFor, EXPERIMENTS, resolveCondition, REFLECTION_BLOCK, stateBlock, DEFAULT_MR_SETTINGS } from './.tmp/mr-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const units = Array.from({ length: 10_000 }, (_, k) => `user_${k.toString(36)}_${(k * 7919) % 104729}`);

// ── bucket ───────────────────────────────────────────────────────────
console.log('bucket');
ok('deterministic', bucket('user_1', 's') === bucket('user_1', 's'));
ok('the salt changes it', bucket('user_1', 's1') !== bucket('user_1', 's2'));
ok('the unit changes it', bucket('user_1', 's') !== bucket('user_2', 's'));
ok("salt and unit are joined with ':' (no 'a'+'bc' = 'ab'+'c' collision)", bucket('bc', 'a') !== bucket('c', 'ab'));
{
  const xs = units.map((u) => bucket(u, 'mr-pilot-2027s.v1'));
  ok('always in [0,1)', xs.every((x) => x >= 0 && x < 1 && Number.isFinite(x)));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  ok('mean near 0.5', Math.abs(mean - 0.5) < 0.01, mean);
  const bins = Array(10).fill(0);
  for (const x of xs) bins[Math.floor(x * 10)]++;
  ok('each decile within ±3% of 10% over 10k units', bins.every((n) => Math.abs(n / xs.length - 0.1) <= 0.03), bins.join(','));
  const fives = Array(5).fill(0);
  for (const x of xs) fives[Math.floor(x * 5)]++;
  ok('each fifth within ±3% of 20%', fives.every((n) => Math.abs(n / xs.length - 0.2) <= 0.03), fives.join(','));
  ok('no two of 10k units share a bucket', new Set(xs).size === xs.length);
}

// ── the registry ─────────────────────────────────────────────────────
console.log('experiments');
const ids = Object.keys(EXPERIMENTS);
const pilot = EXPERIMENTS['mr-pilot-2027s'];
ok('exactly one experiment is defined', ids.length === 1 && ids[0] === 'mr-pilot-2027s', ids.join(','));
ok('it is inactive', pilot.active === false);
ok('it needs consent, per user', pilot.requiresConsent === true && pilot.unit === 'user');
ok('its description says it awaits IRB approval', /IRB/.test(pilot.description) && /approv/i.test(pilot.description));
ok('five arms: baseline, prompt reflection, state only, full with IFR on and off', JSON.stringify(pilot.arms.map((a) => [a.arm, a.ifr])) === JSON.stringify([['baseline', false], ['prompt_reflection', false], ['state_only', false], ['full', true], ['full', false]]));
ok('equal weights', pilot.arms.every((a) => a.weight === pilot.arms[0].weight && a.weight > 0));
ok('a policy version is registered with it', typeof pilot.policyVersion === 'string' && pilot.policyVersion.length > 0);
ok('the registry cannot be edited at runtime', Object.isFrozen(EXPERIMENTS) && Object.isFrozen(pilot) && Object.isFrozen(pilot.arms) && Object.isFrozen(pilot.arms[0]));

// ── armFor ───────────────────────────────────────────────────────────
console.log('armFor');
{
  const first = units.slice(0, 200).map((u) => armFor(pilot, u));
  const again = units.slice(0, 200).map((u) => armFor(pilot, u));
  ok('stable across calls', first.every((a, k) => a === again[k]));
  const counts = new Map();
  for (const u of units) {
    const a = armFor(pilot, u);
    const k = `${a.arm}:${a.ifr}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  ok('all five arms are used', counts.size === 5, [...counts].join(' '));
  ok('each arm within ±3% of 20% over 10k users', [...counts.values()].every((n) => Math.abs(n / units.length - 0.2) <= 0.03), [...counts].join(' '));
  const weighted = { ...pilot, salt: 'w', arms: [{ arm: 'baseline', ifr: false, weight: 3 }, { arm: 'full', ifr: true, weight: 1 }] };
  const share = units.filter((u) => armFor(weighted, u).arm === 'baseline').length / units.length;
  ok('weights are honoured (3:1 → 75%)', Math.abs(share - 0.75) <= 0.03, share);
  const zero = { ...pilot, arms: [{ arm: 'full', ifr: true, weight: 0 }, { arm: 'state_only', ifr: false, weight: 1 }, { arm: 'full', ifr: false, weight: NaN }] };
  ok('a zero or non-finite weight gets nobody', units.slice(0, 500).every((u) => armFor(zero, u).arm === 'state_only'));
  ok('a spec with no usable arm assigns baseline', armFor({ ...pilot, arms: [] }, 'u').arm === 'baseline' && armFor({ ...pilot, arms: [{ arm: 'full', ifr: true, weight: -1 }] }, 'u').arm === 'baseline');
  ok('a different salt reshuffles', units.slice(0, 500).some((u) => armFor(pilot, u) !== armFor({ ...pilot, salt: 'other' }, u)));
}

// ── resolveCondition ─────────────────────────────────────────────────
console.log('resolveCondition');
const ON = { mode: 'on', env: {}, userId: 'user_42', shared: false, settings: { ...DEFAULT_MR_SETTINGS }, settingsOk: true };
const R = (over) => resolveCondition({ ...ON, ...over });
const active = { 'mr-pilot-2027s': { ...pilot, active: true } };
const consented = { ...DEFAULT_MR_SETTINGS, research: { studyId: 'mr-pilot-2027s', consentedAt: 1_700_000_000_000 } };
const XENV = { LOGOS_MR_EXPERIMENT: 'mr-pilot-2027s' };
const same = (c, want) => JSON.stringify(c) === JSON.stringify(want);

ok('off → baseline, deployment, no shadow', same(R({ mode: 'off' }), { arm: 'baseline', ifr: false, shadow: false, source: 'deployment' }), JSON.stringify(R({ mode: 'off' })));
ok('off wins over everything', same(R({ mode: 'off', shared: true, settings: consented, env: XENV, experiments: active }), { arm: 'baseline', ifr: false, shadow: false, source: 'deployment' }));
ok('shared → baseline, excluded', same(R({ shared: true }), { arm: 'baseline', ifr: false, shadow: false, source: 'excluded' }));
ok('shared wins over consent to an active experiment', R({ shared: true, settings: consented, env: XENV, experiments: active }).source === 'excluded');
ok('shared, unknown → excluded (fail closed)', R({ shared: undefined }).source === 'excluded');
ok('signed in, settings unreadable → baseline, unavailable', same(R({ settingsOk: false, settings: null }), { arm: 'baseline', ifr: false, shadow: false, source: 'unavailable' }));
ok('… even with an experiment running', R({ settingsOk: false, settings: null, env: XENV, experiments: active }).source === 'unavailable');
ok('a guest with nothing to read → the deployment arm', same(R({ userId: null, settings: null, settingsOk: false }), { arm: 'full', ifr: true, shadow: false, source: 'deployment' }));
ok('their own off → baseline, user_off', same(R({ settings: { ...DEFAULT_MR_SETTINGS, enabled: false } }), { arm: 'baseline', ifr: false, shadow: false, source: 'user_off' }));
ok('their off beats the experiment they consented to', R({ settings: { ...consented, enabled: false }, env: XENV, experiments: active }).source === 'user_off');
ok('the defined experiment is inactive: consent + env still give the deployment arm', R({ settings: consented, env: XENV }).source === 'deployment');
{
  const c = R({ settings: consented, env: XENV, experiments: active });
  const want = armFor(active['mr-pilot-2027s'], 'user_42');
  ok('active + consented + named → its arm, source experiment', c.source === 'experiment' && c.experimentId === 'mr-pilot-2027s' && c.arm === want.arm && c.ifr === (want.arm === 'full' && want.ifr), JSON.stringify(c));
  ok('the assignment is the same next turn', JSON.stringify(R({ settings: consented, env: XENV, experiments: active })) === JSON.stringify(c));
  const arms = new Set(units.slice(0, 400).map((u) => { const x = R({ userId: u, settings: consented, env: XENV, experiments: active }); return `${x.arm}:${x.ifr}`; }));
  ok('enrolled people spread over all five arms', arms.size === 5, [...arms].join(' '));
}
ok('active but not consented → deployment (no silent enrolment)', R({ env: XENV, experiments: active }).source === 'deployment');
ok('consented to another study → deployment', R({ settings: { ...consented, research: { studyId: 'other-study', consentedAt: 1 } }, env: XENV, experiments: active }).source === 'deployment');
ok('consent with no consent time → deployment', R({ settings: { ...consented, research: { studyId: 'mr-pilot-2027s', consentedAt: 0 } }, env: XENV, experiments: active }).source === 'deployment');
ok('consented, but the deployment names no experiment → deployment', R({ settings: consented, env: {}, experiments: active }).source === 'deployment');
ok('a guest is never enrolled', R({ userId: null, settings: consented, env: XENV, experiments: active }).source === 'deployment');
ok('an experiment id that is not in the registry → deployment', R({ settings: consented, env: { LOGOS_MR_EXPERIMENT: 'toString' }, experiments: active }).source === 'deployment');
ok('a registry entry filed under another id is not that experiment', R({ settings: consented, env: XENV, experiments: { 'mr-pilot-2027s': { ...pilot, id: 'other', active: true } } }).source === 'deployment');
ok('LOGOS_MR_ARM picks the deployment arm', same(R({ env: { LOGOS_MR_ARM: 'state_only' } }), { arm: 'state_only', ifr: false, shadow: false, source: 'deployment' }));
ok('LOGOS_IFR=off inside full', same(R({ env: { LOGOS_IFR: 'off' } }), { arm: 'full', ifr: false, shadow: false, source: 'deployment' }));
ok('IFR is only ever on in full', R({ env: { LOGOS_MR_ARM: 'prompt_reflection', LOGOS_IFR: 'on' } }).ifr === false);
ok('shadow is the mode, whatever the arm', R({ mode: 'shadow' }).shadow === true && R({ mode: 'shadow', shared: true }).shadow === true && R({ mode: 'shadow', settings: consented, env: XENV, experiments: active }).shadow === true);
ok('on is not shadow', R({}).shadow === false);
for (const m of [undefined, null, 'OFF', 'On', 'yes', '', 'full']) {
  ok(`an unknown mode ${JSON.stringify(m)} never enforces: baseline, as off`, same(R({ mode: m, settings: consented, env: XENV, experiments: active }), { arm: 'baseline', ifr: false, shadow: false, source: 'deployment' }), JSON.stringify(R({ mode: m })));
}

// ── the prompt-only arm ──────────────────────────────────────────────
console.log('REFLECTION_BLOCK');
ok('a fixed, short block', typeof REFLECTION_BLOCK === 'string' && REFLECTION_BLOCK.length > 80 && REFLECTION_BLOCK.length < 500);
ok('it is the self-reflection the proposal names', /give it/.test(REFLECTION_BLOCK) && /stop asking/.test(REFLECTION_BLOCK) && /different/.test(REFLECTION_BLOCK));
ok('it asks the model, not the person: no question in it', !REFLECTION_BLOCK.includes('?'));
ok('it says not to mention itself', /never mention/i.test(REFLECTION_BLOCK));

// ── the state-only arm ───────────────────────────────────────────────
console.log('stateBlock');
const fact = (key, turn, over = {}) => ({ key, value: 'fewer_questions', provenance: 'explicit', turn, refs: [], confidence: 1, expiresAfterTurn: null, ...over });
const state = (over = {}) => ({
  version: 1,
  policyVersion: 'mr-2026.10.1',
  conversationKey: 'c1',
  turn: 6,
  goals: [],
  preferences: [],
  strategy: { current: 'default', since: 0, source: 'default', changes: [] },
  observations: [],
  uncertainty: [],
  interventions: [],
  outcomes: [],
  frozenUntilTurn: null,
  integrity: [],
  ...over,
});
ok('nothing to say → empty', stateBlock(state()) === '');
ok('only uncertainty → empty (it would be a line on every turn)', stateBlock(state({ uncertainty: ['goal_unstated', 'no_outcome_signal'] })) === '');
{
  const s = stateBlock(state({ preferences: [fact('questions:0', 2)] }));
  ok('their "stop asking" in force is rendered', /stop asking them questions/.test(s) && s.startsWith('==='), s);
}
ok('… not when it is an estimate', stateBlock(state({ preferences: [fact('questions:0', 2, { provenance: 'estimate' })] })) === '');
ok('… not when it has expired', stateBlock(state({ preferences: [fact('questions:0', 2, { expiresAfterTurn: 4 })] })) === '');
ok('the observation-code key works too', /stop asking/.test(stateBlock(state({ preferences: [fact('explicit.stop_questions', 2)] }))));
{
  const s = stateBlock(state({ preferences: [fact('questions:0', 2), fact('strategy:quiz', 5, { value: 'preserve_challenge' })] }));
  ok('a newer "quiz me" replaces an older "stop asking"', /quizzed/.test(s) && !/stop asking/.test(s), s);
}
ok('goals render from key:value', /work it out themselves/.test(stateBlock(state({ goals: [fact('goal', 1, { value: 'learn' })] }))));
ok("the runtime's estimate of the work is not their goal", stateBlock(state({ goals: [fact('work', 6, { value: 'practice', provenance: 'estimate' })] })) === '');
{
  const dec = (id, action) => ({ decision: { interventionId: id, action }, status: 'expired' });
  const out = (id, regulation, turn) => ({ interventionId: id, turn, regulation });
  const s = stateBlock(state({ interventions: [dec('a', 'fewer_questions'), dec('b', 'worked_example')], outcomes: [out('a', 'keep', 3), out('b', 'revert', 5)] }));
  ok('what worked is rendered', /Asking fewer questions went well/.test(s), s);
  ok('what did not is rendered', /A worked example did not help/.test(s), s);
  const s2 = stateBlock(state({ interventions: [dec('a', 'fewer_questions'), dec('c', 'fewer_questions')], outcomes: [out('a', 'keep', 2), out('c', 'revert', 5)] }));
  ok('the latest outcome per kind wins', /did not help/.test(s2) && !/went well/.test(s2), s2);
  ok('an inconclusive outcome says nothing', stateBlock(state({ interventions: [dec('a', 'shorter')], outcomes: [out('a', 'inconclusive', 3)] })) === '');
}
{
  const obs = (code, turn, over = {}) => ({ code, provenance: 'observed', strength: 'moderate', turn, refs: [], confidence: 0.8, ...over });
  ok('a recent observation is rendered', /have not landed/.test(stateBlock(state({ observations: [obs('observed.repeated_confusion', 6)] }))));
  ok('a weak reading is not', stateBlock(state({ observations: [obs('weak.short_reply', 6, { strength: 'weak' }), obs('observed.question_streak', 6, { strength: 'weak' })] })) === '');
  ok('a hypothesis is not', stateBlock(state({ observations: [obs('observed.unproductive_questions', 6, { provenance: 'hypothesis' })] })) === '');
  ok('an old one is not', stateBlock(state({ observations: [obs('observed.repeated_confusion', 3)] })) === '');
  {
    // "ugh" or "come on" is their word for it, about something unknown: the block may not say they called THIS frustrating
    const s = stateBlock(state({ observations: [obs('explicit.frustration', 6, { provenance: 'explicit' })] }));
    ok('their own word for frustration is rendered as their word, about something unknown', /their own message/.test(s) && /not known/.test(s) && !/this is frustrating|are frustrated|feel/.test(s), s);
  }
  {
    // codes are looked up as the table's own entries, never inherited ones
    const junk = stateBlock(
      state({
        observations: [obs('constructor', 6), obs('toString', 6)],
        uncertainty: ['constructor', '__proto__'],
        interventions: [{ decision: { interventionId: 'p', action: 'constructor' }, status: 'expired' }],
        outcomes: [{ interventionId: 'p', turn: 5, regulation: 'keep' }],
        preferences: [fact('constructor', 2), fact('toString', 2, { value: 'hasOwnProperty' })],
      })
    );
    ok("prototype names are not codes: nothing rendered, no 'native code'", junk === '', junk);
  }
  const s = stateBlock(state({ observations: [obs('observed.repeated_confusion', 6)], uncertainty: ['no_outcome_signal', 'goal_unstated'] }));
  ok('uncertainty is added alongside something else', /no sign yet/.test(s) && !/goal/.test(s), s);
}
{
  // nothing a person or the model wrote can reach the block
  const s = stateBlock(
    state({
      preferences: [fact('questions:0', 2, { value: 'SECRET they said: never ask me again', refs: [{ turn: 2, role: 'user', code: 'SECRET' }] }), fact('SECRET key words', 3)],
      goals: [fact('goal', 1, { value: 'SECRET goal text' })],
      uncertainty: ['SECRET uncertainty'],
    })
  );
  ok('no words of theirs, ever: only fixed sentences', !/SECRET/.test(s) && /stop asking/.test(s), s);
  ok('no quotation marks in the block', !/["“”]/.test(s));
}
ok('a missing state → empty', stateBlock(null) === '' && stateBlock(undefined) === '');

console.log(`\nmr-experiment: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
