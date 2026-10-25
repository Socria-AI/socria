// METACOGNITIVE REGULATION — THE LEDGER AND ITS STORE (lib/mr/ledger.ts, lib/mr/store.ts).
//
// What is held down:
//   • the ledger is content-free: rowsForTurn writes codes, counts and turn
//     indices, never a word of theirs or of the reply — on a synthetic turn
//     with text planted in every place text could leak from, and on a real
//     regulateTurn result over a real transcript;
//   • a record with a sentence in it is refused whole, on write AND on read;
//   • ids are deterministic: the same turn written twice is one row;
//   • persistAllowed: every unknown is a no (incognito unread = incognito);
//   • the person's view (summarize): newest first, decisions only, at most
//     50, "still in force" read from the latest exposure, shadow marked as
//     not applied;
//   • the store: rows round-trip; retention purges only this person's old
//     rows; one person never reads, purges or deletes another's; delete by
//     conversation and all; a table that is not there is ok:false, never "no
//     rows"; settings default, tolerate a missing column, merge, never write
//     research, and refuse to write onto a read that failed; standing
//     decisions cross conversations only with consent, only while still in
//     force, and never from a conversation-only conversation;
//   • the review's privacy findings: a "from now on" taken back stays taken
//     back (every later row says it again, their settings keep it past the
//     conversation's deletion, and a newer statement still carries); a
//     conversation that becomes conversation-only stops carrying; the view
//     says when a standing one no longer reaches other conversations, when a
//     decision changed nothing, and how many in force it cannot list; a turn
//     in flight writes nothing back after a forget, a delete or a reset;
//     nothing past 180 days is read, and the daily purge removes it.
//
// The database is test/helpers/fake-supabase.mjs (primary keys enforced,
// absent tables and missing columns answered with Postgres's codes).

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as MR from './.tmp/mr-under-test.mjs';
import { readSignals } from './.tmp/signals.mjs';
import { chooseAssist } from './.tmp/assist.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-mr-store');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: [join(root, 'lib/mr/store.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, 'store.mjs'),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [
    {
      name: 'swap',
      setup(b) {
        b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
          const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
          if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
          return undefined;
        });
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
      },
    },
  ],
  external: ['@supabase/*'],
  logLevel: 'error',
});

const logged = [];
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[socria/mr]')) return void logged.push(a.map(String).join(' '));
  orig(...a);
};
console.error = quiet(console.error.bind(console));
console.warn = quiet(console.warn.bind(console));
console.info = quiet(console.info.bind(console));

const store = await import(pathToFileURL(join(OUT, 'store.mjs')).href);
const { db, supabaseAdmin: fakeAdmin } = await import(pathToFileURL(FAKE_DB).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const PV = MR.MR_POLICY_VERSION;
const FULL = { arm: 'full', ifr: true, shadow: false, source: 'deployment' };

/** Every string anywhere in a value. */
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out.push(k), strings(x, out));
  return out;
};
const wordFree = (v) => strings(v).every((s) => s.length <= 80 && !/\s/.test(s));

// A decision, an outcome and a finding in the contract's shapes.
const decision = (o = {}) => ({
  policyVersion: PV,
  interventionId: o.id ?? 'a1b2c3d4e5f6a7b8c9d0',
  action: o.action ?? 'fewer_questions',
  trigger: o.trigger ?? 'ifr.explicit.stop_questions',
  evidenceRefs: [{ turn: o.turn ?? 3, role: 'user', code: 'explicit.stop_questions' }],
  target: ['acs'],
  controls: { questionBudget: { max: 0, enforcement: 'hard' } },
  scope: { kind: o.scope ?? 'conversation' },
  expiration: { afterTurn: o.afterTurn === undefined ? null : o.afterTurn, onRevoke: ['explicit.revoke'] },
  confidence: 0.9,
  uncertainty: [],
  evaluationPlan: { primary: 'friction', expect: ['questions=0'], window: 2 },
  rollback: { revertTo: 'acs_default', when: ['outcome:revert'] },
  loop: 'fast',
  issuedAtTurn: o.turn ?? 3,
  ...(o.carried ? { carried: true } : {}),
  ...(o.extra ?? {}),
});
const unknownDim = (note) => ({ value: 'unknown', provenance: 'none', refs: [], note });
const outcome = (id, turn, regulation = 'keep') => ({
  interventionId: id,
  turn,
  taskCompletion: { value: 'delivered', provenance: 'observed', refs: [{ turn, role: 'user', code: 'observed.no_repeat' }] },
  satisfaction: unknownDim('no_signal'),
  friction: { value: { questionsAsked: 0, repeatRequests: 0, complaints: 0, turnsToUseful: 1 }, provenance: 'observed', refs: [] },
  independentPerformance: unknownDim('no_attempt'),
  retention: unknownDim('needs_delayed_check'),
  autonomy: unknownDim('needs_instrument'),
  regulation,
});

/**
 * A turn's result with TEXT planted everywhere a careless writer could pick
 * it up: the block, the trace, the observations, the goals, the transcript
 * the state was folded from. None of it may reach a row.
 */
function turnResult(o = {}) {
  const turn = o.turn ?? 3;
  const d = o.decision ?? decision({ turn });
  return {
    condition: o.condition ?? FULL,
    state: {
      version: 1,
      policyVersion: PV,
      conversationKey: o.key ?? 'conv_a',
      turn,
      goals: [{ key: 'goal', value: 'pass my organic chemistry final', provenance: 'explicit', turn: 0, refs: [], confidence: 1, expiresAfterTurn: null }],
      preferences: [],
      strategy: { current: 'default', since: 0, source: 'default', changes: [] },
      observations: [{ code: 'explicit.stop_questions', provenance: 'explicit', strength: 'strong', turn, refs: [], confidence: 0.95, quote: 'please stop asking me questions' }],
      uncertainty: [],
      interventions: o.interventions ?? [{ decision: d, status: 'active' }],
      outcomes: o.outcomes ?? [outcome('0123456789abcdef0123', turn), outcome('fedcba9876543210fedc', turn - 1)],
      frozenUntilTurn: null,
      integrity: [],
      ...(o.state ?? {}),
    },
    decision: d,
    assist: { mode: 'inform', questions: 0 },
    block: '\n\nAdjusted for this conversation: they asked you to stop asking questions.\n',
    ceiling: null,
    gate: { hardNoQuestions: true, dropUnsupportedClaims: true },
    trace: 'mr1;arm=full;a=fewer_questions',
    integrity: o.integrity ?? [{ code: 'latency_budget', severity: 'warn', turn, detail: 'ms:52>40', action: 'none' }],
    timing: { ms: o.ms ?? 12.6, deliberated: false },
  };
}
const ctx = (o = {}) => ({ userId: o.userId ?? 'user_a', conversationKey: o.key === undefined ? 'conv_a' : o.key, now: o.now ?? NOW, arm: o.arm ?? 'full', ...(o.conversationOnly ? { conversationOnly: true } : {}) });

// ── pure: ids ────────────────────────────────────────────────────────
console.log('\n=== ids are deterministic ===');
{
  const a = MR.ledgerId('decision', 'conv_a', 3, 'abc');
  ok('a 32-hex id', /^[0-9a-f]{32}$/.test(a), a);
  ok('  the same inputs, the same id', a === MR.ledgerId('decision', 'conv_a', 3, 'abc'));
  ok('  any input changed, a different id', new Set([a, MR.ledgerId('outcome', 'conv_a', 3, 'abc'), MR.ledgerId('decision', 'conv_b', 3, 'abc'), MR.ledgerId('decision', 'conv_a', 4, 'abc'), MR.ledgerId('decision', 'conv_a', 3, 'abd'), MR.ledgerId('decision', null, 3, 'abc')]).size === 6);
  const r1 = MR.rowsForTurn(turnResult(), ctx());
  const r2 = MR.rowsForTurn(turnResult(), ctx({ now: NOW + 5000 }));
  ok('the same turn written again: the same row ids (one row, not two)', JSON.stringify(r1.map((r) => r.id).sort()) === JSON.stringify(r2.map((r) => r.id).sort()));
  const g1 = MR.rowsForTurn(turnResult({ key: null }), ctx({ key: null, now: NOW }));
  const g2 = MR.rowsForTurn(turnResult({ key: null }), ctx({ key: null, now: NOW + 1 }));
  ok('  with no conversation id, two exchanges at the same turn do not overwrite each other', !g1.some((r) => g2.some((s) => s.id === r.id)));
}

// ── pure: rowsForTurn ────────────────────────────────────────────────
console.log('\n=== rowsForTurn: one turn\'s rows, content-free ===');
{
  const rows = MR.rowsForTurn(turnResult(), ctx());
  const kinds = rows.map((r) => r.kind);
  ok('one exposure row', kinds.filter((k) => k === 'exposure').length === 1, kinds.join(','));
  ok('  one decision row, for the decision made this turn', kinds.filter((k) => k === 'decision').length === 1);
  ok('  an outcome row only for the outcome read THIS turn', kinds.filter((k) => k === 'outcome').length === 1 && rows.find((r) => r.kind === 'outcome').record.interventionId === '0123456789abcdef0123');
  ok('  an integrity row per finding', kinds.filter((k) => k === 'integrity').length === 1 && rows.find((r) => r.kind === 'integrity').record.detail === 'ms:52>40');
  const text = JSON.stringify(rows);
  ok('  nothing of the block, the trace, the goals or the observations\' words', !/stop asking|organic|Adjusted|they asked|mr1;|please/i.test(text), text.slice(0, 300));
  ok('  every string in every row is a code', wordFree(rows), strings(rows).find((s) => /\s/.test(s) || s.length > 80));
  const e = rows.find((r) => r.kind === 'exposure');
  ok('  exposure: the condition, MR\'s time rounded, the decision in force, what is active', e.record.arm === 'full' && e.record.ifr === true && e.record.shadow === false && e.record.source === 'deployment' && e.record.ms === 13 && e.record.action === 'fewer_questions' && e.record.interventionId === 'a1b2c3d4e5f6a7b8c9d0' && JSON.stringify(e.record.active) === '["a1b2c3d4e5f6a7b8c9d0"]', JSON.stringify(e.record));
  ok('  every row: this person, this conversation, this turn, this arm, this time', rows.every((r) => r.user_id === 'user_a' && r.conversation_id === 'conv_a' && r.turn === 3 && r.arm === 'full' && r.created_at === NOW && r.policy_version === PV));
  const d = rows.find((r) => r.kind === 'decision');
  ok('  the decision is the MRDecision, whole (it holds no text)', JSON.stringify(d.record) === JSON.stringify(decision()), JSON.stringify(d.record).slice(0, 200));

  const none = MR.rowsForTurn(turnResult({ decision: MR.noneDecision(PV, 'conv_a', 3), interventions: [], outcomes: [], integrity: [] }), ctx());
  ok('a turn with nothing decided: the exposure row only (no-action turns are recorded, for comparison)', none.length === 1 && none[0].kind === 'exposure' && none[0].record.action === 'none');
  const carried = MR.rowsForTurn(turnResult({ decision: decision({ carried: true }), outcomes: [], integrity: [] }), ctx());
  ok('a decision carried from an earlier turn: no second decision row', !carried.some((r) => r.kind === 'decision'));
  const noMs = MR.rowsForTurn(turnResult({ ms: NaN }), ctx()).find((r) => r.kind === 'exposure');
  ok('MR\'s time unknown: left out, not written as 0', noMs && !('ms' in noMs.record), JSON.stringify(noMs?.record));
  const shadow = MR.rowsForTurn(turnResult({ condition: { ...FULL, shadow: true, source: 'experiment', experimentId: 'mr-pilot-1' } }), ctx()).find((r) => r.kind === 'exposure');
  ok('shadow and an experiment are on the exposure row', shadow.record.shadow === true && shadow.record.experimentId === 'mr-pilot-1');
  const local = MR.rowsForTurn(turnResult({ decision: decision({ scope: 'standing' }) }), ctx({ conversationOnly: true })).find((r) => r.kind === 'decision');
  ok('a conversation-only conversation: its decision is marked local', local.record.local === true);

  // text where a code belongs: the record is refused and the refusal is recorded
  const leaky = turnResult({ decision: decision({ trigger: 'they said just tell me the answer' }), integrity: [{ code: 'goal_drift', severity: 'block', turn: 3, detail: 'the reply ignored what they wanted to learn', action: 'revert' }] });
  const lr = MR.rowsForTurn(leaky, ctx());
  ok('a decision with words in it is not written', !lr.some((r) => r.kind === 'decision'), JSON.stringify(lr.map((r) => r.kind)));
  ok('  nor a finding with a sentence for a detail', !lr.some((r) => r.kind === 'integrity' && r.record.code === 'goal_drift'));
  ok('  and the refusal itself is recorded, as codes', lr.some((r) => r.kind === 'integrity' && r.record.code === 'privacy_boundary' && r.record.detail === 'refused:decision') && lr.some((r) => r.record.detail === 'refused:integrity'));
  ok('  with none of the words', !/tell me|ignored/.test(JSON.stringify(lr)));
}

console.log('\n=== rowsForTurn on a real regulated turn ===');
{
  const U = (content) => ({ role: 'user', content });
  const A = (content) => ({ role: 'assistant', content });
  const messages = [
    U('Help me with my thermodynamics homework about the Carnot cycle.'),
    A('What do you already know about heat engines? Which part of the cycle confuses you?'),
    U('stop asking me questions and just show me the steps for the Carnot efficiency'),
  ];
  let real = null, err = '';
  try {
    const last = messages[messages.length - 1].content;
    const signals = readSignals(last);
    const assist = chooseAssist({ lastUserText: last, history: messages.slice(0, -1), guard: false, signals });
    real = MR.regulateTurn({
      conversationKey: 'conv_real',
      messages,
      signals,
      acs: { assist, core: null, split: null },
      turnState: { work: 'conversation', domain: 'general', intent: 'conversation', exchange: { kind: 'task' }, preferences: { questions: 'normal', answerFirst: false, guard: false, learning: null, expertise: null, style: null }, objective: '', understanding: { right: 0, wrong: 0, saidStuck: false } },
      context: { guard: false, length: null, maxReply: 700, shared: false, accuracy: { check: false, computed: false, math: false, theirs: [] } },
      condition: FULL,
      env: { LOGOS_MR: 'on' },
      now: () => 0,
    });
  } catch (e) {
    err = e?.message ?? String(e);
  }
  ok('regulateTurn ran', !!real, err);
  if (real) {
    const rows = MR.rowsForTurn(real, ctx({ key: 'conv_real' }));
    // "stop asking" and "show me the steps" are two decisions in force at once: each is its own row, under its own id
    const ids = real.decision.composedOf ?? [real.decision.interventionId];
    ok('  it decided something, and every decision made is a row of its own', real.decision.action !== 'none' && ids.every((id) => rows.some((r) => r.kind === 'decision' && r.record.interventionId === id)), `${real.decision.action} ${rows.map((r) => r.kind)} ${ids}`);
    ok('  every row sanitizes (nothing refused on a real turn)', !rows.some((r) => r.record.code === 'privacy_boundary'), JSON.stringify(rows.filter((r) => r.kind === 'integrity').map((r) => r.record)));
    ok('  none of their words, none of the reply\'s', !/thermodynamic|Carnot|homework|heat engine|show me|stop asking/i.test(JSON.stringify(rows)), JSON.stringify(rows).slice(0, 300));
    ok('  every string a code', wordFree(rows));
  }
}

// ── pure: sanitizeRecord ─────────────────────────────────────────────
console.log('\n=== sanitizeRecord: an allow-list, and words refuse the record ===');
{
  ok('a decision passes as itself', JSON.stringify(MR.sanitizeRecord('decision', decision())) === JSON.stringify(decision()));
  const extra = MR.sanitizeRecord('decision', { ...decision(), reply: 'Here', debugBlob: { a: 1 } });
  ok('  a key nobody allowed is dropped', extra && !('reply' in extra) && !('debugBlob' in extra));
  ok('  a sentence at a key nobody allowed still refuses the whole record', MR.sanitizeRecord('decision', { ...decision(), note: 'they seemed frustrated today' }) === null);
  ok('  a sentence deep inside (an evidence code) refuses it', MR.sanitizeRecord('decision', { ...decision(), evidenceRefs: [{ turn: 1, role: 'user', code: 'just tell me' }] }) === null);
  ok('  a long string with no spaces refuses it', MR.sanitizeRecord('integrity', { code: 'goal_drift', severity: 'warn', turn: 1, detail: 'x'.repeat(81), action: 'none' }) === null);
  ok('  an 80-character code is still a code', MR.sanitizeRecord('integrity', { code: 'goal_drift', severity: 'warn', turn: 1, detail: 'x'.repeat(80), action: 'none' }) !== null);
  ok('  a required part missing: not a smaller record, not a record', MR.sanitizeRecord('decision', { ...decision(), action: undefined }) === null && MR.sanitizeRecord('decision', { ...decision(), action: 'hug' }) === null);
  ok('  the wrong kind of thing: null', MR.sanitizeRecord('decision', 'fewer_questions') === null && MR.sanitizeRecord('decision', [decision()]) === null && MR.sanitizeRecord('nope', decision()) === null);
  ok('  an unknown integrity code is refused', MR.sanitizeRecord('integrity', { code: 'vibes', severity: 'warn', turn: 1, detail: 'x', action: 'none' }) === null);
  const o = MR.sanitizeRecord('outcome', outcome('abc', 2));
  ok('an outcome keeps "unknown" as a value, and its friction reading whole', o && o.retention.value === 'unknown' && o.friction.value.turnsToUseful === 1 && o.friction.value.questionsAsked === 0);
  ok('  a score where a dimension says unknown is not invented', MR.sanitizeRecord('outcome', { ...outcome('abc', 2), autonomy: { value: 0.7, provenance: 'estimate', refs: [] } })?.autonomy === undefined);
  const deep = { ...decision() };
  let cur = deep;
  for (let i = 0; i < 10; i++) cur = cur.n = {};
  ok('  a record nested deeper than MR ever writes is refused', MR.sanitizeRecord('decision', deep) === null);
  // words without a space for a space test to find
  const asTrigger = (t) => MR.sanitizeRecord('decision', { ...decision(), trigger: t });
  ok('  a sentence in a script written without spaces is refused', asTrigger('请不要再问我问题了') === null && asTrigger('質問はもうやめてください') === null);
  ok('  words joined by zero-width spaces are refused', asTrigger('just​tell​me​the​answer') === null);
  ok('  an emoji or an accented word is not a code', asTrigger('ugh😤') === null && asTrigger('frustré') === null);
  ok('  a no-break space is a space', asTrigger('stop asking') === null);
  ok('  every code MR writes still passes (symbols and all)', asTrigger('ifr.explicit.stop_questions') !== null && MR.sanitizeRecord('integrity', { code: 'control_violation', severity: 'warn', turn: 1, detail: 'questions:2>0', action: 'none' }) !== null && MR.sanitizeRecord('decision', { ...decision(), constrainedBy: ['app_policy:withhold', 'user_instruction:length'] })?.constrainedBy?.length === 2);
}

// ── pure: which decisions a turn records ─────────────────────────────
console.log('\n=== decision rows: the decisions MADE this turn, each as itself ===');
{
  // "stop asking" (turn 1, still in force) composed with "from now on, shorter" made at turn 3
  const older = decision({ id: 'aaaaaaaaaaaaaaaaaaaa', turn: 1, scope: 'conversation' });
  const fresh = decision({ id: 'bbbbbbbbbbbbbbbbbbbb', turn: 3, action: 'shorter', trigger: 'ifr.explicit.shorter', scope: 'standing', extra: { controls: { verbosity: { ceilingTokens: 360 } } } });
  const composed = { ...fresh, interventionId: 'cccccccccccccccccccc', controls: { questionBudget: { max: 0, enforcement: 'hard' }, verbosity: { ceilingTokens: 360 } }, composedOf: [older.interventionId, fresh.interventionId], constrainedBy: ['user_instruction:length'] };
  const rows = MR.rowsForTurn(turnResult({ decision: composed, interventions: [{ decision: older, status: 'active' }, { decision: fresh, status: 'active' }], outcomes: [], integrity: [] }), ctx());
  const ds = rows.filter((r) => r.kind === 'decision');
  ok('several in force, one made now: one decision row, the one made now, under its own id', ds.length === 1 && ds[0].record.interventionId === fresh.interventionId && ds[0].record.action === 'shorter', JSON.stringify(ds.map((r) => r.record.interventionId)));
  ok('  never the composition (no later turn lists its id as active)', !rows.some((r) => r.kind === 'decision' && r.record.interventionId === composed.interventionId));
  ok('  and its controls are its own — the older "stop asking" does not ride along as standing', !ds[0].record.controls.questionBudget && ds[0].record.scope.kind === 'standing');
  const e = rows.find((r) => r.kind === 'exposure');
  ok('  the exposure still names the decision in force, what is active, and what a higher layer took out', e.record.interventionId === composed.interventionId && e.record.active.includes(older.interventionId) && e.record.active.includes(fresh.interventionId) && JSON.stringify(e.record.constrainedBy) === '["user_instruction:length"]', JSON.stringify(e.record));
  ok('  and the person\'s view shows the one adjustment made, still in force', JSON.stringify(MR.summarize(rows, NOW).map((s) => [s.action, s.status, s.scope])) === '[["shorter","active","standing"]]', JSON.stringify(MR.summarize(rows, NOW)));

  // two made at once ("stop asking and keep it short"), composed
  const both = MR.rowsForTurn(turnResult({ decision: { ...composed, composedOf: ['dddddddddddddddddddd', fresh.interventionId] }, interventions: [{ decision: { ...older, interventionId: 'dddddddddddddddddddd', issuedAtTurn: 3, evidenceRefs: [{ turn: 3, role: 'user', code: 'explicit.stop_questions' }] }, status: 'active' }, { decision: fresh, status: 'active' }], outcomes: [], integrity: [] }), ctx());
  ok('  two made at the same turn: two rows', both.filter((r) => r.kind === 'decision').length === 2);

  // their "you can ask again" ended "stop asking", while "shorter" (turn 1) stays in force
  const shorterOld = decision({ id: 'eeeeeeeeeeeeeeeeeeee', turn: 1, action: 'shorter', trigger: 'ifr.explicit.shorter' });
  const stopOld = decision({ id: 'ffffffffffffffffffff', turn: 2, scope: 'standing' });
  const revert = { ...decision({ id: '11111111111111111111', turn: 3, action: 'revert', trigger: 'mr.revert', scope: 'turn', afterTurn: 3 }), evidenceRefs: [{ turn: 3, role: 'user', code: 'revoke:explicit.revoke' }], controls: {} };
  const rv = MR.rowsForTurn(turnResult({ decision: { ...shorterOld, carried: true }, interventions: [{ decision: shorterOld, status: 'active' }, { decision: stopOld, status: 'revoked', endedAtTurn: 3, endReason: 'revoke:explicit.revoke' }, { decision: revert, status: 'active' }], outcomes: [], integrity: [] }), ctx());
  ok('a revert their words made, hidden by what stays in force: still a row', rv.some((r) => r.kind === 'decision' && r.record.action === 'revert' && r.record.interventionId === revert.interventionId), JSON.stringify(rv.map((r) => r.kind + ':' + r.record.action)));
  ok('  and no row for the adjustment that was merely carried', !rv.some((r) => r.kind === 'decision' && r.record.interventionId === shorterOld.interventionId));
  ok('  the exposure records which rule their words ended (by rule, a code)', JSON.stringify(rv.find((r) => r.kind === 'exposure').record.revoked) === '["ifr.explicit.stop_questions"]');
  // round 7: only a "from now on" (said here or carried) taken back in their words is listed — a stop for this
  // conversation alone, taken back here, is this conversation's, and must not end a "from now on" of the same rule
  const local = MR.rowsForTurn(turnResult({ interventions: [{ decision: { ...stopOld, scope: { kind: 'conversation' } }, status: 'revoked', endedAtTurn: 3, endReason: 'revoke:explicit.revoke' }], outcomes: [], integrity: [] }), ctx());
  ok('  a stop for this conversation only, taken back: not listed', !('revoked' in local.find((r) => r.kind === 'exposure').record), JSON.stringify(local.find((r) => r.kind === 'exposure').record));
  const beforeReset = MR.rowsForTurn(turnResult({ state: { resetTurn: 5 }, interventions: [{ decision: stopOld, status: 'revoked', endedAtTurn: 3, endReason: 'revoke:explicit.revoke' }], outcomes: [], integrity: [] }), ctx());
  ok('  one taken back before their reset: not listed again after it', !('revoked' in beforeReset.find((r) => r.kind === 'exposure').record), JSON.stringify(beforeReset.find((r) => r.kind === 'exposure').record));
  ok('  and a turn that ended nothing has no such field', !('revoked' in MR.rowsForTurn(turnResult(), ctx()).find((r) => r.kind === 'exposure').record));

  // a "from now on" carried into a new conversation, at its first turn (composition reports it as not carried)
  const carriedIn = { ...decision({ id: '22222222222222222222', turn: 0, scope: 'standing' }), loop: 'longitudinal', uncertainty: ['carried_from_earlier_conversation'] };
  const first = MR.rowsForTurn(turnResult({ turn: 0, decision: { ...carriedIn, carried: false }, interventions: [{ decision: { ...carriedIn, carried: true }, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_new' }));
  ok('a preference carried in from another conversation is not a decision made here', !first.some((r) => r.kind === 'decision'), JSON.stringify(first.map((r) => r.kind)));
  ok('  (the exposure still says it is in force)', first.find((r) => r.kind === 'exposure').record.action === 'fewer_questions');
}

console.log('\n=== MR off by their choice: nothing it worked out about them is kept ===');
{
  for (const source of ['user_off', 'unavailable', 'excluded']) {
    const rows = MR.rowsForTurn(turnResult({ condition: { arm: 'baseline', ifr: false, shadow: false, source } }), ctx({ arm: 'baseline' }));
    ok(`${source}: the exposure row only`, rows.length === 1 && rows[0].kind === 'exposure', JSON.stringify(rows.map((r) => r.kind)));
    ok(`  ${source}: the condition, and nothing of what MR would have decided`, rows[0].record.source === source && !('action' in rows[0].record) && !('interventionId' in rows[0].record) && !('active' in rows[0].record), JSON.stringify(rows[0].record));
  }
  const dep = MR.rowsForTurn(turnResult({ condition: { arm: 'baseline', ifr: false, shadow: false, source: 'deployment' } }), ctx({ arm: 'baseline' }));
  ok('  a deployment that runs the baseline arm still records what MR would have done (the comparison)', dep.some((r) => r.kind === 'decision') && MR.summarize(dep, NOW)[0].applied === false);
}

console.log('\n=== the person\'s view after an edited conversation ===');
{
  // turns 0..4 recorded, then they edited back to turn 2 and went on from there
  const d4 = decision({ id: '33333333333333333333', turn: 4 });
  const branch = MR.rowsForTurn(turnResult({ turn: 4, decision: d4, interventions: [{ decision: d4, status: 'active' }], outcomes: [], integrity: [] }), ctx({ now: NOW }));
  const redo = MR.rowsForTurn(turnResult({ turn: 2, decision: MR.noneDecision(PV, 'conv_a', 2), interventions: [], outcomes: [], integrity: [] }), ctx({ now: NOW + 5000 }));
  const s = MR.summarize([...branch, ...redo], NOW + 6000);
  ok('a decision of the turns they edited away is not shown as in force (the newest row, by time, says so)', s.length === 1 && s[0].status === 'ended', JSON.stringify(s));
}

console.log('\n=== standingInForce (pure) ===');
{
  const sd = decision({ id: '44444444444444444444', turn: 2, scope: 'standing' });
  const made = MR.rowsForTurn(turnResult({ key: 'conv_x', turn: 2, decision: sd, interventions: [{ decision: sd, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_x', now: NOW }));
  const cand = made.filter((r) => r.kind === 'decision');
  const own = made.filter((r) => r.kind === 'exposure');
  const revokedAt = (at, rule = 'ifr.explicit.stop_questions') => ({ ...own[0], conversation_id: 'conv_y', id: MR.ledgerId('exposure', 'conv_y', 1, `x${at}`), created_at: at, record: { ...own[0].record, active: [], revoked: [rule] } });
  ok('in force where it was made, nothing since: carried', MR.standingInForce(cand, own, []).length === 1);
  ok('  their words ended the same rule in another conversation since: not carried', MR.standingInForce(cand, own, [revokedAt(NOW + 1)]).length === 0);
  ok('  a revocation from BEFORE it was said does not end it', MR.standingInForce(cand, own, [revokedAt(NOW - 1)]).length === 1);
  ok('  nor one of a different rule', MR.standingInForce(cand, own, [revokedAt(NOW + 1, 'ifr.explicit.shorter')]).length === 1);
  ok('  no exposure of its own conversation: not carried (unknown is a no)', MR.standingInForce(cand, [], []).length === 0);
}

// ── pure: persistAllowed ─────────────────────────────────────────────
console.log('\n=== persistAllowed: every unknown is a no ===');
{
  const base = { userId: 'user_a', shared: false, persistPolicy: 'full', incognito: false, storeOn: true };
  ok('their own conversation, on the record: yes', MR.persistAllowed(base) === true);
  ok('  conversation-only: yes (the rows are codes; the decision is marked local)', MR.persistAllowed({ ...base, persistPolicy: 'conversation_only' }) === true);
  const no = [
    ['signed out', { userId: null }],
    ['an empty user id', { userId: '' }],
    ['shared', { shared: true }],
    ['off the record', { persistPolicy: 'none' }],
    ['a policy nobody knows', { persistPolicy: 'sometimes' }],
    ['incognito', { incognito: true }],
    ['incognito unreadable', { incognito: null }],
    ['the store off', { storeOn: false }],
  ];
  for (const [why, patch] of no) ok(`  ${why}: no`, MR.persistAllowed({ ...base, ...patch }) === false);
  // the whole truth table over the five switches
  let mism = 0;
  for (const userId of ['user_a', null]) for (const shared of [false, true]) for (const persistPolicy of ['full', 'conversation_only', 'none']) for (const incognito of [false, true, null]) for (const storeOn of [true, false]) {
    const want = !!userId && !shared && persistPolicy !== 'none' && incognito === false && storeOn;
    if (MR.persistAllowed({ userId, shared, persistPolicy, incognito, storeOn }) !== want) mism++;
  }
  ok('  all 72 combinations: yes only when every switch says yes', mism === 0, `${mism} wrong`);
}

// ── pure: summarize ──────────────────────────────────────────────────
console.log('\n=== summarize: the person\'s view ===');
{
  const t3 = MR.rowsForTurn(turnResult(), ctx({ now: NOW }));
  const later = MR.rowsForTurn(turnResult({ turn: 4, decision: MR.noneDecision(PV, 'conv_a', 4), interventions: [{ decision: decision(), status: 'active' }], outcomes: [], integrity: [] }), ctx({ now: NOW + 1000 }));
  let s = MR.summarize([...t3, ...later], NOW + 2000);
  ok('one adjustment: decisions only', s.length === 1, JSON.stringify(s));
  ok('  codes and times: turn, when, action, rule', s[0].turn === 3 && s[0].at === NOW && s[0].action === 'fewer_questions' && s[0].trigger === 'ifr.explicit.stop_questions', JSON.stringify(s[0]));
  ok('  still in force (the latest exposure lists it), in a conversation, not standing, applied', s[0].status === 'active' && s[0].conversation === true && s[0].standing === false && s[0].applied === true, JSON.stringify(s[0]));
  const revoked = MR.rowsForTurn(turnResult({ turn: 5, decision: MR.noneDecision(PV, 'conv_a', 5), interventions: [{ decision: decision(), status: 'revoked', endedAtTurn: 5 }], outcomes: [], integrity: [] }), ctx({ now: NOW + 3000 }));
  s = MR.summarize([...t3, ...later, ...revoked], NOW + 4000);
  ok('  revoked later (the latest exposure no longer lists it): ended', s[0].status === 'ended', JSON.stringify(s[0]));
  const rolled = MR.rowsForTurn(turnResult({ turn: 4, decision: MR.noneDecision(PV, 'conv_a', 4), outcomes: [outcome('a1b2c3d4e5f6a7b8c9d0', 4, 'revert')], integrity: [] }), ctx({ now: NOW + 1000 }));
  ok('  an outcome said revert: ended', MR.summarize([...t3, ...rolled], NOW)[0].status === 'ended');
  const lone = t3.filter((r) => r.kind === 'decision');
  ok('  no exposure row to say: its own expiry decides (null = until revoked → active), and applied is unknown', MR.summarize(lone, NOW)[0].status === 'active' && MR.summarize(lone, NOW)[0].applied === null);
  const shortOne = MR.rowsForTurn(turnResult({ decision: decision({ afterTurn: 4 }) }), ctx()).filter((r) => r.kind === 'decision');
  const pastIt = MR.rowsForTurn(turnResult({ turn: 6, decision: MR.noneDecision(PV, 'conv_a', 6), outcomes: [], integrity: [] }), ctx({ now: NOW + 9 })).map((r) => ({ ...r, kind: 'integrity', record: { code: 'latency_budget', severity: 'info', turn: 6, detail: 'x', action: 'none' } }));
  ok('  an expiry the conversation has gone past: ended', MR.summarize([...shortOne, ...pastIt], NOW)[0].status === 'ended');
  const sh = MR.rowsForTurn(turnResult({ condition: { ...FULL, shadow: true } }), ctx());
  ok('  a shadow decision: recorded, not applied', MR.summarize(sh, NOW)[0].applied === false);
  const arm = MR.rowsForTurn(turnResult({ condition: { ...FULL, arm: 'state_only' } }), ctx({ arm: 'state_only' }));
  ok('  a comparison arm that enforces nothing: not applied', MR.summarize(arm, NOW)[0].applied === false);
  const standing = MR.rowsForTurn(turnResult({ decision: decision({ scope: 'standing' }) }), ctx());
  ok('  a standing preference is marked standing', MR.summarize(standing, NOW)[0].standing === true && MR.summarize(standing, NOW)[0].scope === 'standing');
  ok('  and every adjustment says how far it reaches', MR.summarize(t3, NOW)[0].scope === 'conversation');
  ok('  …and past the retention window, ended', MR.summarize(standing, NOW + 181 * DAY)[0].status === 'ended');
  const many = [];
  for (let t = 0; t < 70; t++) many.push(...MR.rowsForTurn(turnResult({ turn: t, decision: decision({ id: `id${String(t).padStart(18, '0')}`, turn: t }), outcomes: [], integrity: [] }), ctx({ now: NOW + t })));
  s = MR.summarize(many, NOW + 100);
  ok('  at most 50, newest first', s.length === 50 && s[0].turn === 69 && s[49].turn === 20 && s.every((x, i) => i === 0 || s[i - 1].at >= x.at));
  const poisoned = [...t3.map((r) => (r.kind === 'decision' ? { ...r, record: { ...r.record, trigger: 'they told me to stop' } } : r))];
  ok('  a row that does not sanitize is not shown', MR.summarize(poisoned, NOW).length === 0);
  ok('  and the view is codes only', wordFree(MR.summarize([...t3, ...later, ...many], NOW)));
}

// ── pure: what the review's privacy findings hold down ───────────────
const J = JSON.stringify;
const exposureOf = (rows) => rows.find((r) => r.kind === 'exposure');
const STOP = 'ifr.explicit.stop_questions';

console.log('\n=== a "from now on" taken back: every later row says it again (MR-PRIV-2) ===');
{
  const stop = decision({ id: 'ffffffffffffffffffff', turn: 1, scope: 'standing' });
  const at = (turn, now, extra = []) =>
    exposureOf(MR.rowsForTurn(turnResult({ key: 'conv_b', turn, decision: MR.noneDecision(PV, 'conv_b', turn), interventions: [{ decision: stop, status: 'revoked', endedAtTurn: 1, endReason: 'revoke:explicit.revoke' }, ...extra], outcomes: [], integrity: [] }), ctx({ key: 'conv_b', now })));
  const t1 = at(1, NOW);
  const t4 = at(4, NOW + 3000);
  ok('the turn they said it: the rule, and not marked as said again', J(t1.record.revoked) === J([STOP]) && !('reasserted' in t1.record), J(t1.record));
  ok('  every later turn says it again (so one lost or deleted row cannot bring it back), marked as said again', J(t4.record.revoked) === J([STOP]) && J(t4.record.reasserted) === J([STOP]), J(t4.record));
  const mine = decision({ id: 'abababababababababab', turn: 0, trigger: 'ifr.observed.unproductive_questions' });
  const reset = at(4, NOW + 3000, [{ decision: mine, status: 'revoked', endedAtTurn: 3, endReason: 'revoke:reset' }]);
  ok('  what their reset ended is not recorded as their words taking something back', J(reset.record.revoked) === J([STOP]), J(reset.record.revoked));
  // only their words taking it back end it past the conversation: a request for questions, a quiz, a learning
  // goal end it HERE (its rule's own revokers) and nowhere else (round-5 review #14, #30)
  for (const why of ['revoke:explicit.wants_questions', 'revoke:explicit.quiz', 'revoke:explicit.learning_goal', undefined]) {
    const row = exposureOf(MR.rowsForTurn(turnResult({ key: 'conv_b', turn: 1, decision: MR.noneDecision(PV, 'conv_b', 1), interventions: [{ decision: stop, status: 'revoked', endedAtTurn: 1, ...(why ? { endReason: why } : {}) }], outcomes: [], integrity: [] }), ctx({ key: 'conv_b', now: NOW })));
    ok(`  ended by ${why ?? 'no reason given'}: not recorded as taken back`, !('revoked' in row.record), J(row.record));
  }
  const rv = MR.revocationsOf([t1, t4, { ...t1, kind: 'decision' }]);
  ok('revocationsOf: said at a turn → that row\'s time; said again → just before its row, marked as said again', J(rv) === J([{ trigger: STOP, at: NOW }, { trigger: STOP, at: NOW + 2999, reasserted: true }]), J(rv));
}

console.log('\n=== standingInForce: their settings, the time a revocation was said, a conversation kept to itself ===');
{
  const sd = decision({ id: '55555555555555555555', turn: 2, scope: 'standing' });
  const made = MR.rowsForTurn(turnResult({ key: 'conv_x', turn: 2, decision: sd, interventions: [{ decision: sd, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_x', now: NOW }));
  const cand = made.filter((r) => r.kind === 'decision');
  const own = made.filter((r) => r.kind === 'exposure');
  ok('a revocation kept in their settings at or after it (its conversation since deleted): not carried', MR.standingInForce(cand, own, [], [{ trigger: STOP, at: NOW }]).length === 0);
  ok('  one from before it: carried — a "from now on" said after they took one back carries as usual', MR.standingInForce(cand, own, [], [{ trigger: STOP, at: NOW - 1 }]).length === 1);
  ok('  one of another rule: carried', MR.standingInForce(cand, own, [], [{ trigger: 'ifr.explicit.shorter', at: NOW + 1 }]).length === 1);
  const row = (turn, at, reasserted) => ({ ...own[0], conversation_id: 'conv_b', turn, id: MR.ledgerId('exposure', 'conv_b', turn, 'exposure'), created_at: at, record: { ...own[0].record, active: [], revoked: [STOP], ...(reasserted ? { reasserted: [STOP] } : {}) } });
  const b1 = row(1, NOW - 10, false), b5 = row(5, NOW + 10, true);
  ok('a later row of the conversation it was taken back in, only saying it again, does not end one said since', MR.standingInForce(cand, own, [b1, b5]).length === 1);
  ok('  dated by the first row of that conversation that says it, even when that one says it again too', MR.standingInForce(cand, own, [row(2, NOW - 5, true), b5]).length === 1);
  ok('  with only the later row there, its time is all there is: not carried (carrying less is the safe way)', MR.standingInForce(cand, own, [b5]).length === 0);
  const local = (at) => ({ ...own[0], id: MR.ledgerId('exposure', 'conv_x', 3, `l${at}`), turn: 3, created_at: at, record: { ...own[0].record, local: true } });
  ok('its conversation became one kept to itself (a local exposure since): not carried (MR-PRIV-6)', MR.standingInForce(cand, [...own, local(NOW + 5)], []).length === 0);
  ok('  a local exposure from before it was said: carried', MR.standingInForce(cand, [local(NOW - 5), ...own], []).length === 1);
  const localRows = MR.rowsForTurn(turnResult(), ctx({ conversationOnly: true }));
  ok('rowsForTurn: a conversation kept to itself marks its exposure row local, not only its decisions', exposureOf(localRows).record.local === true && !('local' in exposureOf(MR.rowsForTurn(turnResult(), ctx())).record));
  ok('  on a turn MR was off for them too', MR.rowsForTurn(turnResult({ condition: { arm: 'baseline', ifr: false, shadow: false, source: 'user_off' } }), ctx({ arm: 'baseline', conversationOnly: true }))[0].record.local === true);
}

console.log('\n=== the person\'s view of a "from now on" taken back elsewhere (MR-PRIV-8) ===');
{
  const sd = decision({ id: '66666666666666666666', turn: 2, scope: 'standing' });
  const a = MR.rowsForTurn(turnResult({ key: 'conv_a', turn: 2, decision: sd, interventions: [{ decision: sd, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_a', now: NOW }));
  ok('(in force where it was said, nothing since: in every conversation)', MR.summarize(a, NOW + 10)[0].scope === 'standing');
  const b = MR.rowsForTurn(turnResult({ key: 'conv_b', turn: 1, decision: MR.noneDecision(PV, 'conv_b', 1), interventions: [{ decision: { ...sd, interventionId: '77777777777777777777', loop: 'longitudinal' }, status: 'revoked', endedAtTurn: 1, endReason: 'revoke:explicit.revoke' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_b', now: NOW + 1000 }));
  const s = MR.summarize([...a, ...b], NOW + 2000);
  ok('taken back in another conversation: still on where it was said, but reaching that conversation only', s.length === 1 && s[0].status === 'active' && s[0].scope === 'conversation' && s[0].standing === true, J(s));
  ok('  the same when only their settings still say so', MR.summarize(a, NOW + 2000, { revokedStanding: [{ trigger: STOP, at: NOW + 1 }] })[0].scope === 'conversation');
  ok('  a revocation from before it was said does not', MR.summarize(a, NOW + 2000, { revokedStanding: [{ trigger: STOP, at: NOW - 1 }] })[0].scope === 'standing');
  const kept = MR.rowsForTurn(turnResult({ key: 'conv_a', turn: 3, decision: { ...sd, carried: true }, interventions: [{ decision: sd, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_a', now: NOW + 3000, conversationOnly: true }));
  ok('  nor does it reach other conversations once its own is kept to itself', MR.summarize([...a, ...kept], NOW + 4000)[0].scope === 'conversation');
}

console.log('\n=== their reset, as a turn of the conversation, and what still holds (MR-PRIV-4) ===');
{
  const withReset = (resetTurn) => {
    const r = turnResult({ turn: 5 });
    return { ...r, state: { ...r.state, resetTurn } };
  };
  ok('the first turn after their reset is on every exposure row since', exposureOf(MR.rowsForTurn(withReset(4), ctx())).record.resetTurn === 4);
  ok('  absent when they never reset, or when it is not a turn index', !('resetTurn' in exposureOf(MR.rowsForTurn(turnResult(), ctx())).record) && !('resetTurn' in exposureOf(MR.rowsForTurn(withReset(-1), ctx())).record) && !('resetTurn' in exposureOf(MR.rowsForTurn(withReset('4'), ctx())).record));
  const RA = NOW + 500;
  const said = (turn, at, rt) => {
    const e = exposureOf(MR.rowsForTurn(turnResult({ turn }), ctx({ now: at })));
    return { ...e, record: { ...e.record, ...(rt !== undefined ? { resetTurn: rt } : {}) } };
  };
  ok('resetTurnOf: never reset → null', MR.resetTurnOf([said(3, NOW)], null, 6) === null);
  ok('  the resetTurn a row since the reset recorded', MR.resetTurnOf([said(3, NOW), said(4, NOW + 1000, 4), said(5, NOW + 2000, 4)], RA, 6) === 4);
  ok('  a row since the reset that recorded none: its own turn', MR.resetTurnOf([said(4, NOW + 1000)], RA, 6) === 4);
  ok('  nothing recorded since: this turn is the first', MR.resetTurnOf([said(3, NOW)], RA, 6) === 6);
  ok('  rows at or before the reset are not read', MR.resetTurnOf([said(2, RA, 2)], RA, 6) === 6);

  // what they asked for before the reset: its decision row is before it, its exposures since still list it
  const old = decision({ id: '88888888888888888888', turn: 1 });
  const since = MR.rowsForTurn(turnResult({ turn: 5, decision: { ...old, carried: true }, interventions: [{ decision: old, status: 'active' }], outcomes: [], integrity: [] }), ctx({ now: RA + 1 }));
  ok('in force with no decision row since the reset: the list is empty, and the count says it is not complete', MR.summarize(since, RA + 2).length === 0 && MR.unlistedInForce(since) === 1, `${MR.summarize(since, RA + 2).length} ${MR.unlistedInForce(since)}`);
  const carriedIn = MR.rowsForTurn(turnResult({ turn: 1, decision: { ...old, carried: true }, interventions: [{ decision: { ...old, loop: 'longitudinal' }, status: 'active' }], outcomes: [], integrity: [] }), ctx({ now: RA + 1 }));
  ok('  one carried in from another conversation is not counted (its decision row is that conversation\'s)', MR.unlistedInForce(carriedIn) === 0);
  ok('  nor what a shadow turn lists (nothing there changed a reply)', MR.unlistedInForce(MR.rowsForTurn(turnResult({ turn: 5, condition: { ...FULL, shadow: true }, decision: { ...old, carried: true }, interventions: [{ decision: old, status: 'active' }] }), ctx({ now: RA + 1 })).filter((r) => r.kind === 'exposure')) === 0);
  ok('  and one with its decision row is listed, not counted', MR.unlistedInForce(MR.rowsForTurn(turnResult(), ctx())) === 0);
}

console.log('\n=== the model calls a conversation made (honesty F4) ===');
{
  const timed = (timing) => {
    const r = turnResult();
    return exposureOf(MR.rowsForTurn({ ...r, timing: { ...r.timing, ...timing } }, ctx()));
  };
  const model = timed({ deliberated: true, modelDeliberated: true });
  const det = timed({ deliberated: true });
  ok('a model asked: on the exposure row', model.record.modelDeliberated === true && model.record.deliberated === true, J(model.record));
  ok('  a deterministic deliberation (or an answer of "none" never asked of a model) is not a model call', !('modelDeliberated' in det.record) && det.record.deliberated === true);
  ok('  only a plain true counts', !('modelDeliberated' in timed({ modelDeliberated: 'yes' }).record));
  ok('  and it survives a read', MR.sanitizeLedgerRow(model)?.record.modelDeliberated === true);
  ok('modelDeliberationsIn counts the model calls, not the turns that deliberated', MR.modelDeliberationsIn([model, det, { ...model, id: MR.ledgerId('exposure', 'conv_a', 9, 'x'), turn: 9 }, { ...model, kind: 'decision' }]) === 2);
  ok('  none in nothing', MR.modelDeliberationsIn([]) === 0 && MR.modelDeliberationsIn(null) === 0);
}

console.log('\n=== what changed the reply, and what did not (honesty F5) ===');
{
  const original = decision({ id: '99999999999999999999', action: 'direct', trigger: 'ifr.explicit.direct_answer', extra: { controls: { questionBudget: { max: 0, enforcement: 'tail' }, strategy: 'direct', answerFirst: true } } });
  const emptied = { ...original, controls: {}, constrainedBy: ['safety:strategy', 'safety:answerFirst', 'safety:questionBudget'] };
  const turn3 = (d, enforced) => {
    const r = turnResult({ decision: d, interventions: [{ decision: original, status: 'active' }], outcomes: [], integrity: [] });
    return MR.rowsForTurn(enforced === undefined ? r : { ...r, enforced }, ctx());
  };
  ok('the regulation\'s own enforced is on the exposure row', exposureOf(turn3(emptied, false)).record.enforced === false && exposureOf(turn3(original, true)).record.enforced === true);
  ok('  a result without it records nothing about it', !('enforced' in exposureOf(turn3(original)).record));
  ok('a higher layer took every control out: recorded, not applied', MR.summarize(turn3(emptied, false), NOW)[0].applied === false);
  ok('  the same read off the decision itself (constrainedBy names every control it set)', MR.summarize(turn3(emptied), NOW)[0].applied === false);
  const row = turn3(emptied).find((x) => x.kind === 'decision');
  ok('  and the row keeps the controls they asked for, with what took them out', row && row.record.controls?.strategy === 'direct' && row.record.constrainedBy?.length === 3, JSON.stringify(row?.record));
  ok('  partly constrained, it still changed the reply', MR.summarize(turn3({ ...original, controls: { questionBudget: { max: 0, enforcement: 'tail' } }, constrainedBy: ['safety:strategy'] }, true), NOW)[0].applied === true);
  const later = MR.rowsForTurn({ ...turnResult({ turn: 4, decision: { ...original, carried: true }, interventions: [{ decision: original, status: 'active' }], outcomes: [], integrity: [] }), enforced: true }, ctx({ now: NOW + 1000 }));
  ok('  taken out on its own turn but enforced on a later one: it did change replies', MR.summarize([...turn3(emptied, false), ...later], NOW + 2000)[0].applied === true);
  const laterOff = MR.rowsForTurn({ ...turnResult({ turn: 4, decision: { ...original, carried: true }, interventions: [{ decision: original, status: 'active' }], outcomes: [], integrity: [] }), enforced: false }, ctx({ now: NOW + 1000 }));
  ok('  …not when that later turn changed nothing either', MR.summarize([...turn3(emptied, false), ...laterOff], NOW + 2000)[0].applied === false);
  const ifrOff = { ...original, uncertainty: ['not_enforced'] };
  const offRows = MR.rowsForTurn({ ...turnResult({ decision: ifrOff, interventions: [{ decision: ifrOff, status: 'active' }], outcomes: [], integrity: [] }), enforced: true }, ctx());
  ok('a decision the condition computed but does not enforce (IFR off): not applied', MR.summarize(offRows, NOW)[0].applied === false);
  const offLater = MR.rowsForTurn({ ...turnResult({ turn: 4, decision: MR.noneDecision(PV, 'conv_a', 4), interventions: [{ decision: ifrOff, status: 'active' }], outcomes: [], integrity: [] }), enforced: true }, ctx({ now: NOW + 1000 }));
  ok('  whatever later turns list as active', MR.summarize([...offRows, ...offLater], NOW + 2000)[0].applied === false);
  ok('  NOT_ENFORCED is the code the fold writes', MR.NOT_ENFORCED === 'not_enforced');
}

// ── the store ────────────────────────────────────────────────────────
console.log('\n=== rows round-trip ===');
{
  db.reset();
  const rows = MR.rowsForTurn(turnResult(), ctx());
  await store.writeRows('user_a', rows, NOW);
  ok('written: one row each, under (user_id, id)', (db.tables.mr_ledger ?? []).length === rows.length, `${(db.tables.mr_ledger ?? []).length} vs ${rows.length}`);
  await store.writeRows('user_a', MR.rowsForTurn(turnResult(), ctx({ now: NOW + 10 })), NOW + 10);
  ok('  the same turn written again is still one row each (deterministic ids, upsert)', db.tables.mr_ledger.length === rows.length);
  const back = await store.loadForTurn('user_a', 'conv_a', { timeoutMs: 1000, carryAcross: false });
  ok('  read back: ok, the same rows', back.ok && back.rows.length === rows.length && back.rows.every((r) => rows.some((w) => w.id === r.id && JSON.stringify(w.record) === JSON.stringify(r.record))), JSON.stringify(back).slice(0, 200));
  ok('  oldest first, and no standing rows without consent', back.rows.every((r, i) => i === 0 || back.rows[i - 1].turn <= r.turn) && back.standing.length === 0 && back.standingOk === true);
  const listed = await store.listForUser('user_a', { limit: 10 });
  ok('  listed for their own view, newest first', listed.ok && listed.rows.length === rows.length);
  const decisionsOnly = await store.listForUser('user_a', { limit: 10, kinds: ['decision'] });
  ok('  listed by kind', decisionsOnly.ok && decisionsOnly.rows.length === 1 && decisionsOnly.rows[0].kind === 'decision');
  // the rewrite at NOW + 10 is the rows' time now; a reset after it hides them, one before it does not
  const reset = await store.loadForTurn('user_a', 'conv_a', { timeoutMs: 1000, carryAcross: false, resetAt: NOW + 11 });
  const before = await store.loadForTurn('user_a', 'conv_a', { timeoutMs: 1000, carryAcross: false, resetAt: NOW + 9 });
  ok('  nothing from before their last reset is read', reset.ok && reset.rows.length === 0 && before.rows.length === rows.length, `${reset.rows.length} ${before.rows.length}`);
  // the same millisecond as the reset is before it — as the carry (adaptation) and the research export read it
  const same = await store.loadForTurn('user_a', 'conv_a', { timeoutMs: 1000, carryAcross: false, resetAt: NOW + 10 });
  const sameListed = await store.listForUser('user_a', { limit: 10, resetAt: NOW + 10 });
  ok('  a row stamped the very millisecond of the reset is not read back either', same.rows.length === 0 && sameListed.rows.length === 0, `${same.rows.length} ${sameListed.rows.length}`);
}

console.log('\n=== a sentence is refused on write and dropped on read ===');
{
  db.reset();
  const good = MR.rowsForTurn(turnResult(), ctx());
  const bad = { ...good.find((r) => r.kind === 'decision'), id: MR.ledgerId('decision', 'conv_a', 3, 'other'), record: { ...decision(), trigger: 'just tell me the answer please' } };
  const foreign = { ...good[0], user_id: 'user_b', id: MR.ledgerId('exposure', 'conv_a', 9, 'x') };
  await store.writeRows('user_a', [...good, bad, foreign], NOW);
  const t = db.tables.mr_ledger ?? [];
  ok('the row with words is not written; the rest are', t.length === good.length && !t.some((r) => r.id === bad.id), t.length);
  ok('  a row that is not this person\'s is not written', !t.some((r) => r.user_id === 'user_b'));
  ok('  and the refusal is logged without the words', logged.some((l) => /refused 2 row/.test(l)) && !logged.some((l) => /tell me/.test(l)), logged.join(' | '));
  // a row put there by something else — an older build, a hand edit
  db.rows('mr_ledger').push({ ...bad, user_id: 'user_a' });
  db.rows('mr_ledger').push({ ...good[0], id: MR.ledgerId('exposure', 'conv_a', 8, 'y'), record: { ...good[0].record, note: 'the person sounded upset' } });
  const back = await store.loadForTurn('user_a', 'conv_a', { timeoutMs: 1000, carryAcross: false });
  ok('  on read, rows with words are dropped', back.ok && back.rows.length === good.length && !/tell me|upset/.test(JSON.stringify(back.rows)), back.rows.length);
  const listed = await store.listForUser('user_a', { limit: 50 });
  ok('  in the person\'s own view too', listed.ok && !/tell me|upset/.test(JSON.stringify(listed.rows)) && listed.rows.length === good.length);
}

console.log('\n=== retention ===');
{
  db.reset();
  const mk = (user, ageDays, turn) => ({ ...MR.rowsForTurn(turnResult({ turn }), ctx({ userId: user, now: NOW - ageDays * DAY }))[0] });
  const old = mk('user_a', 181, 1), kept = mk('user_a', 179, 2), theirs = mk('user_b', 400, 1);
  db.rows('mr_ledger').push(old, kept, theirs);
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ turn: 5 }), ctx()), NOW);
  const t = db.tables.mr_ledger;
  ok('a row older than 180 days is purged at write time', !t.some((r) => r.id === old.id && r.user_id === 'user_a'));
  ok('  one inside the window is kept', t.some((r) => r.id === kept.id));
  ok('  another person\'s old row is not touched by this person\'s write', t.some((r) => r.user_id === 'user_b'));
  ok('  the window is 180 days', store.MR_RETENTION_MS === 180 * DAY && store.MR_TABLES.length === 1 && store.MR_TABLES[0] === 'mr_ledger');
}

console.log('\n=== one person never reaches another\'s rows ===');
{
  db.reset();
  await store.writeRows('user_a', MR.rowsForTurn(turnResult(), ctx({ userId: 'user_a' })), NOW);
  await store.writeRows('user_b', MR.rowsForTurn(turnResult(), ctx({ userId: 'user_b' })), NOW);
  const a = await store.loadForTurn('user_a', 'conv_a', { timeoutMs: 1000, carryAcross: true });
  ok('the same conversation id under two people: each reads only their own', a.ok && a.rows.length > 0 && a.rows.every((r) => r.user_id === 'user_a'));
  const la = await store.listForUser('user_a', { limit: 100 });
  ok('  listing too', la.rows.every((r) => r.user_id === 'user_a'));
  await store.deleteForUser('user_a');
  ok('  deleting all of theirs leaves the other person\'s', db.tables.mr_ledger.length > 0 && db.tables.mr_ledger.every((r) => r.user_id === 'user_b'));
}

console.log('\n=== delete by conversation, and all ===');
{
  db.reset();
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_a' }), ctx({ key: 'conv_a' })), NOW);
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_b' }), ctx({ key: 'conv_b' })), NOW);
  const r1 = await store.deleteForUser('user_a', 'conv_a');
  ok('one conversation: its rows go, the other\'s stay', r1.ok && !db.tables.mr_ledger.some((r) => r.conversation_id === 'conv_a') && db.tables.mr_ledger.some((r) => r.conversation_id === 'conv_b'));
  const r2 = await store.deleteForUser('user_a');
  ok('  all: nothing of theirs left', r2.ok && db.tables.mr_ledger.length === 0);
}

console.log('\n=== a table that is not there is not "no rows" ===');
{
  db.reset();
  db.absent.add('mr_ledger');
  const r = await store.loadForTurn('user_a', 'conv_a', { timeoutMs: 1000, carryAcross: true });
  ok('loadForTurn: ok false, nothing (the caller then cannot persist)', r.ok === false && r.rows.length === 0 && r.standing.length === 0);
  let threw = false;
  try {
    await store.writeRows('user_a', MR.rowsForTurn(turnResult(), ctx()), NOW);
  } catch {
    threw = true;
  }
  ok('  writeRows never throws', !threw);
  ok('  and says so once, by code, not by message', logged.filter((l) => /mr_ledger: table missing/.test(l)).length === 1, logged.filter((l) => /mr_ledger/.test(l)).join(' | '));
  ok('  listForUser: ok false', (await store.listForUser('user_a', { limit: 5 })).ok === false);
  ok('  deleteForUser: ok (a table never created holds nothing of theirs)', (await store.deleteForUser('user_a')).ok === true);
  const h = await store.mrStoreHealth();
  ok('  the health check names it', h.ok === false && /mr_ledger:table_missing/.test(h.detail), JSON.stringify(h));
  db.absent.delete('mr_ledger');
  db.missing.user_profiles = new Set(['mr']);
  const h2 = await store.mrStoreHealth();
  ok('  and a settings column that is not there', h2.ok === false && /user_profiles\.mr:column_missing/.test(h2.detail), JSON.stringify(h2));
  db.reset();
  ok('  both there: ok', (await store.mrStoreHealth()).ok === true);
}

console.log('\n=== settings ===');
{
  db.reset();
  const none = await store.readSettings('user_a');
  ok('no row: the defaults, ok', none.ok && JSON.stringify(none.settings) === JSON.stringify(MR.DEFAULT_MR_SETTINGS) && !none.missing, JSON.stringify(none));
  ok('  the defaults are the private ones: MR on, nothing carried, not a participant', none.settings.enabled === true && none.settings.carryAcross === false && none.settings.research === null);
  db.rows('user_profiles').push({ user_id: 'user_a', profile: 'their pasted profile', understanding: { updatedAt: 5 }, updated_at: 1 });
  const noCol = await store.readSettings('user_a');
  ok('a row with no mr yet: the defaults, ok', noCol.ok && noCol.settings.enabled === true);
  db.tables.user_profiles[0].mr = { version: 1, enabled: 'false', carryAcross: 1, research: { studyId: 'bad id with spaces', consentedAt: 3 }, resetAt: -4 };
  const junk = await store.readSettings('user_a');
  ok('malformed values are not read as choices (the string "false" is not false)', junk.ok && junk.settings.enabled === true && junk.settings.carryAcross === false && junk.settings.research === null && junk.settings.resetAt === null, JSON.stringify(junk.settings));
  delete db.tables.user_profiles[0].mr;

  const w1 = await store.writeSettings('user_a', { enabled: false });
  const w2 = await store.writeSettings('user_a', { carryAcross: true });
  const row = db.tables.user_profiles.find((r) => r.user_id === 'user_a');
  ok('a change merges onto what is stored', w1.ok && w2.ok && row.mr.enabled === false && row.mr.carryAcross === true, JSON.stringify(row.mr));
  ok('  the rest of their profile row is untouched', row.profile === 'their pasted profile' && row.understanding.updatedAt === 5);
  ok('  and it reads back', (await store.readSettings('user_a')).settings.enabled === false);
  await store.writeSettings('user_a', { resetAt: NOW });
  await store.writeSettings('user_a', { resetAt: NOW - 50 });
  ok('  a reset only moves forward', db.tables.user_profiles[0].mr.resetAt === NOW && db.tables.user_profiles[0].mr.enabled === false);

  // research: written only by a study's consent flow
  await store.writeSettings('user_a', { research: { studyId: 'mr-study-1', consentedAt: 7 } });
  ok('research in a patch is ignored: nobody is enrolled by a settings write', db.tables.user_profiles[0].mr.research === null);
  db.tables.user_profiles[0].mr.research = { studyId: 'mr-study-1', consentedAt: 7 };
  await store.writeSettings('user_a', { enabled: true, research: null });
  ok('  and a consent the study recorded is carried over as it was, never cleared by one', JSON.stringify(db.tables.user_profiles[0].mr.research) === JSON.stringify({ studyId: 'mr-study-1', consentedAt: 7 }) && db.tables.user_profiles[0].mr.enabled === true);

  // the settings sheet flips its two switches independently: two writes in flight at once
  db.reset();
  db.rows('user_profiles').push({ user_id: 'user_a', profile: 'p', updated_at: 1, mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null } });
  const [off, noCarry] = await Promise.all([store.writeSettings('user_a', { enabled: false }), store.writeSettings('user_a', { carryAcross: false })]);
  const both = db.tables.user_profiles[0].mr;
  ok('two changes at once: both kept — their "MR off" is never put back on by the other write', off.ok && noCarry.ok && both.enabled === false && both.carryAcross === false, JSON.stringify(both));
  ok('  and the profile row is still one row, its other columns untouched', db.tables.user_profiles.length === 1 && db.tables.user_profiles[0].profile === 'p');
  db.reset();
  const [n1, n2] = await Promise.all([store.writeSettings('user_new', { enabled: false }), store.writeSettings('user_new', { carryAcross: true })]);
  ok('  the same for a person with no profile row yet (two writes both making it)', n1.ok && n2.ok && db.tables.user_profiles.length === 1 && db.tables.user_profiles[0].mr.enabled === false && db.tables.user_profiles[0].mr.carryAcross === true, JSON.stringify(db.tables.user_profiles));
  // a row that changes under every attempt: said, not overwritten
  db.reset();
  db.rows('user_profiles').push({ user_id: 'user_a', updated_at: 5, mr: { version: 1, enabled: false, carryAcross: false, research: null, resetAt: null } });
  const QP = Object.getPrototypeOf(fakeAdmin().from('user_profiles'));
  const update = QP.update;
  QP.update = function (patch, opts) {
    db.tables.user_profiles[0].updated_at += 1000; // another writer, every time, just before this one
    return update.call(this, patch, opts);
  };
  const busy = await store.writeSettings('user_a', { enabled: true });
  QP.update = update;
  ok('  a row that keeps changing under the write: ok false, and their "off" is left as it was', busy.ok === false && db.tables.user_profiles[0].mr.enabled === false, JSON.stringify(busy));

  db.reset();
  const fresh = await store.writeSettings('user_new', { enabled: false });
  ok('a person with no profile row yet: one is made, holding only the setting', fresh.ok && db.tables.user_profiles.length === 1 && db.tables.user_profiles[0].mr.enabled === false && typeof db.tables.user_profiles[0].updated_at === 'number');

  db.reset();
  db.missing.user_profiles = new Set(['mr']);
  const miss = await store.readSettings('user_a');
  ok('the column is not in the database: the defaults, ok, and missing (nobody can have set anything)', miss.ok === true && miss.missing === true && miss.settings.enabled === true);
  const wmiss = await store.writeSettings('user_a', { enabled: false });
  ok('  a change cannot be kept: ok false, missing — said, not swallowed', wmiss.ok === false && wmiss.missing === true && !(db.tables.user_profiles ?? []).length);

  db.reset();
  db.absent.add('user_profiles');
  const broken = await store.readSettings('user_a');
  ok('any other failure: ok false (their "off" may be what could not be read)', broken.ok === false);
  const wbroken = await store.writeSettings('user_a', { enabled: false });
  ok('  and nothing is written onto a read that failed', wbroken.ok === false && !wbroken.missing);
  db.reset();
}

console.log('\n=== standing preferences cross conversations only with consent, and only while in force ===');
{
  db.reset();
  const standingDecision = decision({ id: 'feedfacefeedfacefeed', scope: 'standing', trigger: 'ifr.explicit.stop_questions' });
  // conv_b: "from now on, no questions" at turn 2, still active at turn 3
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_b', turn: 2, decision: standingDecision, interventions: [{ decision: standingDecision, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_b', now: NOW })), NOW);
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_b', turn: 3, decision: { ...standingDecision, carried: true }, interventions: [{ decision: standingDecision, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_b', now: NOW + 1 })), NOW + 1);
  // another person's standing decision
  await store.writeRows('user_b', MR.rowsForTurn(turnResult({ key: 'conv_x', turn: 1, decision: decision({ id: 'bbbbbbbbbbbbbbbbbbbb', scope: 'standing' }), interventions: [{ decision: decision({ id: 'bbbbbbbbbbbbbbbbbbbb', scope: 'standing' }), status: 'active' }] }), ctx({ userId: 'user_b', key: 'conv_x' })), NOW);

  const without = await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: false });
  ok('without their consent: nothing crosses', without.ok && without.standing.length === 0);
  const withIt = await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: true });
  ok('  with it: their standing decision from the other conversation, once', withIt.ok && withIt.standingOk && withIt.standing.length === 1 && withIt.standing[0].record.interventionId === 'feedfacefeedfacefeed', JSON.stringify(withIt.standing.map((r) => r.record.interventionId)));
  ok('  never another person\'s', withIt.standing.every((r) => r.user_id === 'user_a'));
  const inItsOwn = await store.loadForTurn('user_a', 'conv_b', { timeoutMs: 1000, carryAcross: true });
  ok('  in its own conversation it is a row there, not a standing import', inItsOwn.standing.length === 0 && inItsOwn.rows.some((r) => r.kind === 'decision'));

  // lifted at turn 3 in conv_b by words that are not a take-back (a quiz): it is lifted THERE, and still crosses (round 7)
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_b', turn: 3, decision: MR.noneDecision(PV, 'conv_b', 3), interventions: [{ decision: standingDecision, status: 'revoked', endedAtTurn: 3, endReason: 'revoke:explicit.quiz' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_b', now: NOW + 1 })), NOW + 1);
  const lifted = await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: true });
  ok('a "from now on" lifted in its own conversation by a quiz is still carried elsewhere', lifted.ok && lifted.standing.length === 1, JSON.stringify(lifted.standing.map((r) => r.record.interventionId)));
  // taken back at turn 4 in conv_b, in their words
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_b', turn: 4, decision: MR.noneDecision(PV, 'conv_b', 4), interventions: [{ decision: standingDecision, status: 'revoked', endedAtTurn: 4, endReason: 'revoke:explicit.revoke' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_b', now: NOW + 2 })), NOW + 2);
  const after = await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: true });
  ok('a "from now on" they took back is not carried', after.ok && after.standing.length === 0, JSON.stringify(after.standing.map((r) => r.record.interventionId)));

  db.reset();
  const sd = decision({ id: 'cafecafecafecafecafe', scope: 'standing' });
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_private', turn: 1, decision: sd, interventions: [{ decision: sd, status: 'active' }] }), ctx({ key: 'conv_private', conversationOnly: true })), NOW);
  const priv = await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: true });
  ok('a standing decision from a conversation-only conversation never crosses', priv.ok && priv.standing.length === 0);

  db.reset();
  const lone = MR.rowsForTurn(turnResult({ key: 'conv_c', turn: 1, decision: sd, interventions: [{ decision: sd, status: 'active' }] }), ctx({ key: 'conv_c' })).filter((r) => r.kind === 'decision');
  await store.writeRows('user_a', lone, NOW);
  const unseen = await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: true });
  ok('no exposure row to show it is still in force: not carried (unknown is a no)', unseen.ok && unseen.standing.length === 0);
}

console.log('\n=== carrying across, on real regulated turns (regulateTurn → rowsForTurn → writeRows → loadForTurn → standingFacts) ===');
{
  const U = (content) => ({ role: 'user', content });
  const A = (content) => ({ role: 'assistant', content });
  const SETTINGS = { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null };
  let clock = NOW;
  const regulate = (key, messages, carried) => {
    const last = messages[messages.length - 1].content;
    const signals = readSignals(last);
    const assist = chooseAssist({ lastUserText: last, history: messages.slice(0, -1), guard: false, signals });
    return MR.regulateTurn({
      conversationKey: key, messages, signals, acs: { assist, core: null, split: null },
      turnState: { work: 'conversation', domain: 'general', intent: 'conversation', exchange: { kind: 'task' }, preferences: { questions: 'normal', answerFirst: false, guard: false, learning: null, expertise: null, style: null }, objective: '', understanding: { right: 0, wrong: 0, saidStuck: false } },
      context: { guard: false, length: null, maxReply: 700, shared: false, accuracy: { check: false, computed: false, math: false, theirs: [] } },
      condition: FULL, env: { LOGOS_MR: 'on' }, now: () => 0, carried,
    });
  };
  /** one turn as the Logos route runs it, with their consent to carry */
  const turn = async (key, messages) => {
    const load = await store.loadForTurn('user_a', key, { timeoutMs: 1000, carryAcross: true });
    // their settings as the route reads them: the revocations the store keeps there count too
    const held = (await store.readSettings('user_a')).settings;
    const carried = MR.standingFacts(load.standing, { ...SETTINGS, revokedStanding: held.revokedStanding }, clock);
    const r = regulate(key, messages, carried);
    const rows = MR.rowsForTurn(r, { userId: 'user_a', conversationKey: key, now: clock, arm: 'full' });
    await store.writeRows('user_a', rows, clock);
    clock += 1000;
    return { r, rows, carried: carried.map((f) => f.key) };
  };

  // 1. a "from now on" said while another adjustment is in force
  db.reset();
  const essay = [U('Help me plan my essay on climate policy.'), A('Sure. What is your thesis? What sources do you have?'), U('please stop asking me questions')];
  await turn('conv_essay', essay);
  const t2 = await turn('conv_essay', [...essay, A('Here is a plan: intro, three arguments, conclusion.'), U('from now on, keep your replies shorter')]);
  ok('(the setup) "from now on, shorter" is decided while "stop asking" is still in force', t2.r.decision.composedOf?.length === 2 && t2.r.fresh.some((d) => d.action === 'shorter' && d.scope.kind === 'standing'), JSON.stringify(t2.r.decision.composedOf));
  const next = await turn('conv_next', [U('What is a good way to learn Spanish verbs?')]);
  ok('their "from now on" crosses into the next conversation', JSON.stringify(next.carried) === '["verbosity:shorter"]', JSON.stringify(next.carried));
  ok('  and the "stop asking" said only for that essay does not', !next.carried.includes('questions:0'));
  ok('  the next conversation records no decision of its own for what it carried in', !next.rows.some((r) => r.kind === 'decision'), JSON.stringify(next.rows.map((r) => r.kind)));

  // 2. a "from now on" taken back in the conversation it was carried into
  for (const words of ['you can ask me questions again', 'you can ask me questions again, and keep it shorter']) {
    db.reset();
    clock = NOW;
    await turn('conv_a', [U('Help me with fractions.'), A('Sure. What do you know already? What is a denominator?'), U('from now on, stop asking me questions')]);
    const b0 = [U('Explain photosynthesis.')];
    const b = await turn('conv_b', b0);
    ok(`(the setup) carried into the next conversation [${words}]`, JSON.stringify(b.carried) === '["questions:0"]', JSON.stringify(b.carried));
    const taken = await turn('conv_b', [...b0, A('Plants turn light into sugar.'), U(words)]);
    ok(`  their words there end it [${words}]`, taken.r.state.interventions.some((i) => i.status === 'revoked'), JSON.stringify(taken.r.state.interventions.map((i) => i.status)));
    const c = await turn('conv_c', [U('Help me with my history essay.')]);
    ok(`  and it does not come back in the conversation after [${words}]`, !c.carried.includes('questions:0') && c.r.gate.hardNoQuestions === false, JSON.stringify(c.carried));
  }

  // 3. the read of revocations fails: carry nothing
  db.reset();
  clock = NOW;
  await turn('conv_a', [U('Help me with fractions.'), A('Sure. What do you know already?'), U('from now on, stop asking me questions')]);
  const QP = Object.getPrototypeOf(fakeAdmin().from('mr_ledger'));
  const like = QP.like;
  QP.like = function (c, p) {
    if (c === 'record->>revoked') this.run = () => ({ data: null, error: { code: '57014' }, count: null });
    return like.call(this, c, p);
  };
  const blind = await store.loadForTurn('user_a', 'conv_z', { timeoutMs: 1000, carryAcross: true });
  QP.like = like;
  ok('revocations that cannot be read: nothing carried, and said (standingOk false)', blind.ok && blind.standing.length === 0 && blind.standingOk === false, JSON.stringify({ n: blind.standing.length, s: blind.standingOk }));
  const seen = await store.loadForTurn('user_a', 'conv_z', { timeoutMs: 1000, carryAcross: true });
  ok('  (and when they can be, it is carried)', seen.standing.length === 1 && seen.standingOk === true);

  // 4. taken back where it was carried, and then that conversation deleted (MR-PRIV-2)
  const FRACTIONS = [U('Help me with fractions.'), A('Sure. What do you know already? What is a denominator?'), U('from now on, stop asking me questions')];
  const B0 = [U('Explain photosynthesis.')];
  const TAKEN = [...B0, A('Plants turn light into sugar.'), U('you can ask me questions again')];
  const exposureRow = (t) => t.rows.find((r) => r.kind === 'exposure');
  db.reset();
  clock = NOW;
  await turn('conv_a', FRACTIONS);
  await turn('conv_b', B0);
  await turn('conv_b', TAKEN);
  const gone = await store.forgetConversation('user_a', 'conv_b');
  const c4 = await turn('conv_c', [U('Help me with my history essay.')]);
  ok('taken back in a conversation since deleted: it still does not come back', gone.ok && !c4.carried.includes('questions:0') && c4.r.gate.hardNoQuestions === false, J(c4.carried));

  // 5. the carry could not be read on the turn they took it back (the review's revoke2 path)
  db.reset();
  clock = NOW;
  await turn('conv_a', FRACTIONS);
  await turn('conv_b', B0);
  const QPx = Object.getPrototypeOf(fakeAdmin().from('mr_ledger'));
  const likeX = QPx.like;
  let failOnce = true;
  QPx.like = function (c, p) {
    if (failOnce && c === 'record->scope->>kind') {
      failOnce = false;
      this.run = () => ({ data: null, error: { code: '57014' }, count: null });
    }
    return likeX.call(this, c, p);
  };
  const b1 = await turn('conv_b', TAKEN);
  QPx.like = likeX;
  ok('(the setup) the carry could not be read on the turn they took it back: nothing was there to end', b1.carried.length === 0 && !('revoked' in exposureRow(b1).record), J({ c: b1.carried, e: exposureRow(b1).record }));
  // A LIMIT (docs/MR.md §10): a carried preference is taken back only by the words of the turn it is read on —
  // earlier words in the conversation may be from before it existed (round-5 review #31) — so a take-back on a
  // turn whose carry could not be read is not applied on a later one
  const b2 = await turn('conv_b', [...TAKEN, A('Of course.'), U('What about the Calvin cycle?')]);
  ok('  (a limit) the next turn carries it in, and earlier words do not end it', b2.carried.includes('questions:0') && !('revoked' in exposureRow(b2).record), J({ c: b2.carried, e: exposureRow(b2).record }));
  const b3 = await turn('conv_b', [...TAKEN, A('Of course.'), U('What about the Calvin cycle?'), A('It fixes carbon.'), U('you can ask me questions again')]);
  ok('  said again, it ends it, and it does not come back in the conversation after', b3.carried.includes('questions:0') && exposureRow(b3).record.revoked?.includes(STOP), J({ c: b3.carried, e: exposureRow(b3).record }));
  const c5 = await turn('conv_c', [U('Help me with my history essay.')]);
  ok('  …though every write succeeded', !c5.carried.includes('questions:0') && c5.r.gate.hardNoQuestions === false, J(c5.carried));

  // 6. said again AFTER they took it back, while the conversation they took it back in goes on
  // (the first conversation deleted meanwhile, so the newer statement is the only one there is)
  db.reset();
  clock = NOW;
  await turn('conv_a', FRACTIONS);
  await turn('conv_b', B0);
  await turn('conv_b', TAKEN);
  await store.forgetConversation('user_a', 'conv_a');
  const again = await turn('conv_d', [U('Help me revise for my chemistry exam.'), A('Sure. Which topics? What do you find hardest?'), U('from now on, stop asking me questions')]);
  ok('(the setup) said again, in another conversation, after they took it back', again.r.fresh.some((d) => d.scope.kind === 'standing'), J(again.r.fresh.map((d) => [d.action, d.scope.kind])));
  const b7 = await turn('conv_b', [...TAKEN, A('Of course.'), U('What about the Calvin cycle?')]);
  ok('conv_b goes on: its take-back, said before the newer "from now on", does not end it (round-5 review #31)', b7.carried.includes('questions:0') && !('revoked' in exposureRow(b7).record), J({ c: b7.carried, e: exposureRow(b7).record }));
  const e6 = await turn('conv_e', [U('What is a good way to learn Spanish verbs?')]);
  ok('the newer "from now on" carries: a later row saying an older revocation again does not end it', J(e6.carried) === '["questions:0"]', J(e6.carried));
  db.reset();
}

console.log('\n=== an account deleted while a turn streamed: nothing written for it (round 6 review) ===');
{
  db.reset();
  const rows = MR.rowsForTurn(turnResult({ key: 'conv_a', turn: 1 }), ctx({ key: 'conv_a', now: Date.now() }));
  await store.writeRows('user_a', rows, Date.now(), { hadProfile: true });
  ok('the turn began with their profile, and it is gone: no rows', !(db.tables.mr_ledger ?? []).some((r) => r.user_id === 'user_a'), J(db.tables.mr_ledger));
  ok('  and no profile row made', !(db.tables.user_profiles ?? []).some((r) => r.user_id === 'user_a'));
  await store.writeRows('user_a', rows, Date.now());
  ok('  (someone who never had a profile row: written as before)', (db.tables.mr_ledger ?? []).some((r) => r.user_id === 'user_a'));
  db.reset();
}

console.log('\n=== their settings keep what their words took back, past the conversation it was said in (MR-PRIV-2) ===');
{
  db.reset();
  const T = Date.now() - 600_000;
  const held = () => db.tables.user_profiles?.find((r) => r.user_id === 'user_a')?.mr;
  const sd = decision({ id: 'cafebabecafebabecafe', turn: 1, scope: 'standing' });
  // a turn's revocation never makes their profile row (round 7: none may be an account deleted mid-turn)
  const noRow = await store.writeSettings('user_a', { revoke: [{ trigger: STOP, at: T }] });
  ok('a revocation alone never creates their profile row', !noRow.ok && !(db.tables.user_profiles ?? []).some((r) => r.user_id === 'user_a'), J(db.tables.user_profiles));
  // (their profile row is there — anyone who carries a "from now on" has saved their settings)
  db.rows('user_profiles').push({ user_id: 'user_a', profile: 'x', understanding: {}, updated_at: 1, mr: { version: 1, enabled: true, carryAcross: false, research: null, resetAt: null } });
  const revokedIn = (key, turn, now) =>
    MR.rowsForTurn(turnResult({ key, turn, decision: MR.noneDecision(PV, key, turn), interventions: [{ decision: { ...sd, interventionId: '12121212121212121212', loop: 'longitudinal' }, status: 'revoked', endedAtTurn: 1, endReason: 'revoke:explicit.revoke' }], outcomes: [], integrity: [] }), ctx({ key, now }));
  // conv_a: "from now on, no questions" at T; carried into conv_b and taken back there at T + 1000
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_a', turn: 1, decision: sd, interventions: [{ decision: sd, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_a', now: T })), T);
  await store.writeRows('user_a', revokedIn('conv_b', 1, T + 1000), T + 1000);
  ok('a revocation written to the ledger is kept in their settings too, by rule and time', J(held()?.revokedStanding) === J([{ trigger: STOP, at: T + 1000 }]), J(held()));
  const writes = db.log.filter((l) => l[1] === 'user_profiles').length;
  await store.writeRows('user_a', revokedIn('conv_b', 3, T + 3000), T + 3000);
  ok('  said again on a later turn: nothing more is written, and its time is not moved forward', db.log.filter((l) => l[1] === 'user_profiles').length === writes && J(held().revokedStanding) === J([{ trigger: STOP, at: T + 1000 }]), J(held()));
  ok('  their choices are untouched, and the markers are not part of the settings they are shown', held().enabled === true && held().carryAcross === false && !('revokedStanding' in MR.publicSettings(MR.sanitizeSettings(held()))));
  let c = await store.loadForTurn('user_a', 'conv_c', { timeoutMs: 1000, carryAcross: true });
  ok('(taken back in conv_b: not carried into conv_c)', c.ok && c.standingOk && c.standing.length === 0);
  // as if that settings write had failed: deleting conv_b still keeps the revocation, read off its rows
  db.tables.user_profiles[0].mr = { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null };
  const f = await store.forgetConversation('user_a', 'conv_b');
  ok('forgetting a conversation: its rows go', f.ok && f.marked && !db.tables.mr_ledger.some((r) => r.conversation_id === 'conv_b'));
  ok('  marked forgotten — a hash of its key, never the key — in the same write that keeps what their words took back there', held().forgotten?.[0]?.conversation === store.forgottenKey('conv_b') && !J(held()).includes('conv_b') && J(held().revokedStanding) === J([{ trigger: STOP, at: T + 1000 }]), J(held()));
  c = await store.loadForTurn('user_a', 'conv_c', { timeoutMs: 1000, carryAcross: true });
  ok('  and the "from now on" they took back there does not come back now that it is gone', c.ok && c.standingOk && c.standing.length === 0, J(c.standing.map((r) => r.record.interventionId)));
  const sd2 = decision({ id: 'deadbeefdeadbeefdead', turn: 1, scope: 'standing' });
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_d', turn: 1, decision: sd2, interventions: [{ decision: sd2, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_d', now: T + 5000 })), T + 5000);
  c = await store.loadForTurn('user_a', 'conv_c', { timeoutMs: 1000, carryAcross: true });
  ok('  said again after that, in another conversation: carried, as any newer "from now on" is', c.standing.length === 1 && c.standing[0].record.interventionId === sd2.interventionId, J(c.standing.map((r) => r.record.interventionId)));
  db.reset();
}

console.log('\n=== a conversation that becomes one kept to itself stops carrying what was said in it (MR-PRIV-6) ===');
{
  db.reset();
  const sd = decision({ id: 'b0b0b0b0b0b0b0b0b0b0', turn: 1, scope: 'standing' });
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_k', turn: 1, decision: sd, interventions: [{ decision: sd, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_k', now: NOW })), NOW);
  ok('(said there while it was on the record as usual: carried)', (await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: true })).standing.length === 1);
  await store.writeRows('user_a', MR.rowsForTurn(turnResult({ key: 'conv_k', turn: 2, decision: { ...sd, carried: true }, interventions: [{ decision: sd, status: 'active' }], outcomes: [], integrity: [] }), ctx({ key: 'conv_k', now: NOW + 1000, conversationOnly: true })), NOW + 1000);
  const after = await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: true });
  ok('the next turn there is conversation-only: what was said before it is no longer carried either', after.ok && after.standingOk && after.standing.length === 0, J(after.standing.map((r) => r.record.interventionId)));
  db.reset();
}

console.log('\n=== what they asked to be forgotten is not written back (MR-PRIV-11) ===');
{
  const begun = Date.now() - 60_000; // the turn began before the forget
  const rowsOf = (key, now, turn = 3) => MR.rowsForTurn(turnResult({ key, turn }), ctx({ key, now }));
  db.reset();
  await store.forgetConversation('user_a', 'conv_a');
  await store.writeRows('user_a', rowsOf('conv_a', begun), Date.now());
  ok('a turn of a deleted conversation that writes after the delete writes nothing', !(db.tables.mr_ledger ?? []).length, (db.tables.mr_ledger ?? []).length);
  await store.writeRows('user_a', rowsOf('conv_b', begun), Date.now());
  ok('  another conversation\'s turn is written as usual', db.tables.mr_ledger.length > 0 && db.tables.mr_ledger.every((r) => r.conversation_id === 'conv_b'));
  const later = Date.now() + 5;
  await store.writeRows('user_a', rowsOf('conv_a', later, 0), later);
  ok('  a turn begun after the delete is written (the mark covers what came before it)', db.tables.mr_ledger.some((r) => r.conversation_id === 'conv_a'));

  db.reset();
  await store.stampReset('user_a');
  await store.writeRows('user_a', rowsOf('conv_a', begun), Date.now());
  ok('a turn begun before their reset writes nothing after it', !(db.tables.mr_ledger ?? []).length);

  // the narrow race: the delete lands between writeRows reading their settings and its write
  const QP = Object.getPrototypeOf(fakeAdmin().from('mr_ledger'));
  const then = QP.then;
  const landing = (what) => {
    let armed = true;
    QP.then = function (res, rej) {
      if (armed && this.table === 'mr_ledger' && this.op === 'upsert') {
        armed = false;
        return what().then(() => then.call(this, res, rej));
      }
      return then.call(this, res, rej);
    };
  };
  for (const [name, what] of [['a conversation delete', () => store.forgetConversation('user_a', 'conv_a')], ['a reset', async () => (await store.stampReset('user_a'), await store.deleteForUser('user_a'))]]) {
    db.reset();
    landing(what);
    await store.writeRows('user_a', rowsOf('conv_a', begun), Date.now());
    QP.then = then;
    ok(`${name} that lands while the rows are being written: they are removed again once written`, !(db.tables.mr_ledger ?? []).some((r) => r.conversation_id === 'conv_a'), J((db.tables.mr_ledger ?? []).map((r) => r.kind)));
  }
  db.reset();
}

console.log('\n=== retention: never read past it, and purged daily for everybody (MR-PRIV-12) ===');
{
  db.reset();
  const info = console.info;
  const said = [];
  console.info = (...a) => void said.push(a.map(String).join(' '));
  const cutoff = () => Date.now() - 180 * DAY;
  const aged = (user, key, turn, ageDays) => MR.rowsForTurn(turnResult({ key, turn, outcomes: [], integrity: [] }), ctx({ userId: user, key, now: Date.now() - ageDays * DAY }));
  const old = [...aged('user_a', 'conv_a', 1, 181), ...aged('user_b', 'conv_b', 1, 200)];
  const recent = aged('user_a', 'conv_a', 2, 1);
  db.rows('mr_ledger').push(...old, ...recent);
  const listed = await store.listForUser('user_a', { limit: 50 });
  ok('a row past 180 days is not listed for their view', listed.ok && listed.rows.length === recent.length && listed.rows.every((r) => r.created_at >= cutoff()), listed.rows.length);
  const read = await store.loadForTurn('user_a', 'conv_a', { timeoutMs: 1000, carryAcross: false });
  ok('  nor read by a turn', read.ok && read.rows.length === recent.length);
  const p = await store.purgeExpired();
  ok('the daily purge deletes everybody\'s expired rows, and says how many', p.ok && p.deleted === old.length && !db.tables.mr_ledger.some((r) => r.created_at < cutoff()), J(p));
  ok('  and nothing inside the window', db.tables.mr_ledger.length === recent.length);
  ok('  logging a count, never a person or a conversation', said.some((l) => new RegExp(`retention purge deleted ${old.length} row`).test(l)) && !said.some((l) => /user_|conv_/.test(l)), said.join(' | '));
  for (let i = 0; i < 450; i++) db.rows('mr_ledger').push({ ...old[0], id: MR.ledgerId('exposure', 'conv_old', i, 'exposure'), turn: i, conversation_id: 'conv_old' });
  const p2 = await store.purgeExpired();
  ok('  a backlog bigger than one batch drains in rounds', p2.ok && p2.deleted === 450 && db.tables.mr_ledger.length === recent.length, J(p2));
  db.rows('mr_ledger').push(old[0]);
  const p3 = await store.purgeExpired(Date.now(), 0);
  ok('  no round begins past its time budget (the cron has emails to send)', p3.ok && p3.deleted === 0 && db.tables.mr_ledger.length === recent.length + 1);
  db.reset();
  db.absent.add('mr_ledger');
  const p4 = await store.purgeExpired();
  ok('  a ledger never created has nothing to purge', p4.ok && p4.deleted === 0);
  db.reset();
  console.info = info;
}

console.log('\n=== the health check does not count the table ===');
{
  db.reset();
  const QP = Object.getPrototypeOf(fakeAdmin().from('mr_ledger'));
  const select = QP.select;
  const asked = [];
  QP.select = function (cols, opts = {}) {
    asked.push([this.table, opts]);
    return select.call(this, cols, opts);
  };
  const h = await store.mrStoreHealth();
  QP.select = select;
  ok('it asks whether the table and column are there, reading no rows', h.ok && asked.length === 2 && asked.every(([, o]) => o.head === true), JSON.stringify(asked));
  ok('  and never for an exact count (a scan of the whole ledger, slower as it grows)', asked.every(([, o]) => o.count !== 'exact'), JSON.stringify(asked));
}

console.log('\n=== incognito, failing closed ===');
{
  db.reset();
  ok('no conversation row yet: false', (await store.readIncognito('user_a', 'conv_a')) === false);
  db.rows('conversations').push({ id: 'conv_a', user_id: 'user_a', incognito: true });
  ok('incognito: true', (await store.readIncognito('user_a', 'conv_a')) === true);
  ok('  another person\'s row is not this person\'s answer', (await store.readIncognito('user_b', 'conv_a')) === false);
  db.missing.conversations = new Set(['incognito']);
  ok('no such column: false (nobody can have switched it on)', (await store.readIncognito('user_a', 'conv_a')) === false);
  db.reset();
  db.absent.add('conversations');
  ok('a read that fails: null — and persistAllowed reads null as incognito', (await store.readIncognito('user_a', 'conv_a')) === null && MR.persistAllowed({ userId: 'user_a', shared: false, persistPolicy: 'full', incognito: null, storeOn: true }) === false);
  db.reset();
}

console.log('\n=== the log is content-free ===');
ok('no log line holds a sentence of anybody\'s', !logged.some((l) => /tell me|upset|frustrated|their pasted/i.test(l)), logged.join(' | '));

console.log(`\nmr store: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
