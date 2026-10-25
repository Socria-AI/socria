// The Longitudinal Adaptation Engine (lib/mr/adaptation.ts): the settings
// parser (and the two content-free markers the server keeps in them: the
// "from now on" rules their words took back, and conversations just
// deleted), the one cross-conversation carry, the promotion recommendation,
// the evidence ladder and the rollback target. Nothing here learns a policy.
import {
  sanitizeSettings,
  standingKey,
  standingFacts,
  STANDING_MAX_AGE_MS,
  PROMOTION_CRITERIA,
  promotionVerdict,
  evidenceLevel,
  rollbackTarget,
  preferenceCodeOf,
  DEFAULT_MR_SETTINGS,
  compose,
  mergeRevocations,
  mergeForgotten,
  publicSettings,
  revokedStandingFrom,
  MAX_REVOKED_STANDING,
  MAX_FORGOTTEN,
  FORGOTTEN_TTL_MS,
} from './.tmp/mr-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DEFAULTS = { version: 1, enabled: true, carryAcross: false, research: null, resetAt: null };

// ── settings ─────────────────────────────────────────────────────────
console.log('sanitizeSettings');
for (const junk of [undefined, null, 0, 42, true, 'nonsense', '{bad json', [], [1, 2], () => 1, Symbol('x'), NaN, '', '[]', 'null']) {
  ok(`junk ${String(typeof junk === 'symbol' ? 'symbol' : JSON.stringify(junk) ?? typeof junk)} → defaults`, eq(sanitizeSettings(junk), DEFAULTS), JSON.stringify(sanitizeSettings(junk)));
}
ok('the defaults are DEFAULT_MR_SETTINGS', eq(sanitizeSettings(null), DEFAULT_MR_SETTINGS));
ok('well-formed values survive', eq(sanitizeSettings({ enabled: false, carryAcross: true, research: { studyId: 'mr-pilot-2027s', consentedAt: 1700000000000 }, resetAt: 1690000000000 }), { version: 1, enabled: false, carryAcross: true, research: { studyId: 'mr-pilot-2027s', consentedAt: 1700000000000 }, resetAt: 1690000000000 }));
ok('a JSON string is read', sanitizeSettings('{"carryAcross":true}').carryAcross === true);
ok('a huge string is not', sanitizeSettings(JSON.stringify({ carryAcross: true, pad: 'x'.repeat(5000) })).carryAcross === false);
ok('strict booleans: "false" is not false', sanitizeSettings({ enabled: 'false' }).enabled === true && sanitizeSettings({ carryAcross: 'true' }).carryAcross === false && sanitizeSettings({ carryAcross: 1 }).carryAcross === false);
ok('each field on its own: a bad research keeps a good carryAcross', eq(sanitizeSettings({ carryAcross: true, research: 'yes' }), { ...DEFAULTS, carryAcross: true }));
for (const [name, research] of [
  ['a study id with spaces', { studyId: 'my study', consentedAt: 1 }],
  ['a study id starting with a dash', { studyId: '-study', consentedAt: 1 }],
  ['a study id too long', { studyId: 'a'.repeat(65), consentedAt: 1 }],
  ['a study id that is not a string', { studyId: 7, consentedAt: 1 }],
  ['no consent time', { studyId: 'mr-pilot' }],
  ['consent at 0', { studyId: 'mr-pilot', consentedAt: 0 }],
  ['negative consent', { studyId: 'mr-pilot', consentedAt: -5 }],
  ['consent NaN', { studyId: 'mr-pilot', consentedAt: NaN }],
  ['consent Infinity', { studyId: 'mr-pilot', consentedAt: Infinity }],
  ['consent as a string', { studyId: 'mr-pilot', consentedAt: '1700000000000' }],
  ['an array', ['mr-pilot', 1]],
]) {
  ok(`research: ${name} → not a participant`, sanitizeSettings({ research }).research === null);
}
ok('research keeps only its two fields', eq(sanitizeSettings({ research: { studyId: 'mr-pilot', consentedAt: 5, arm: 'full', note: 'x' } }).research, { studyId: 'mr-pilot', consentedAt: 5 }));
ok('a bad resetAt → null', [0, -1, NaN, '5', Infinity, {}].every((r) => sanitizeSettings({ resetAt: r }).resetAt === null));
ok('unknown keys are dropped', eq(Object.keys(sanitizeSettings({ enabled: true, admin: true, version: 99 })).sort(), ['carryAcross', 'enabled', 'research', 'resetAt', 'version']) && sanitizeSettings({ version: 99 }).version === 1);
{
  const s = sanitizeSettings('{"__proto__":{"carryAcross":true},"constructor":{"prototype":{"x":1}}}');
  ok('prototype keys do nothing', s.carryAcross === false && {}.carryAcross === undefined && {}.x === undefined);
  const a = sanitizeSettings(null);
  a.enabled = false;
  ok('the result is a fresh object: changing it does not change the defaults', DEFAULT_MR_SETTINGS.enabled === true && sanitizeSettings(null).enabled === true);
}

// ── the key ──────────────────────────────────────────────────────────
console.log('standingKey');
const D = (action, controls, over = {}) => ({ action, controls, ...over });
ok('"stop asking" → questions:0', standingKey(D('fewer_questions', { questionBudget: { max: 0, enforcement: 'hard' } })) === 'questions:0');
ok('"just tell me" → strategy:direct (its tail budget does not make it questions:0)', standingKey(D('direct', { strategy: 'direct', answerFirst: true, questionBudget: { max: 0, enforcement: 'tail' } })) === 'strategy:direct');
ok('"quiz me" → strategy:quiz', standingKey(D('preserve_challenge', { strategy: 'preserve_challenge', questionBudget: { max: 1, enforcement: 'tail' } })) === 'strategy:quiz');
ok('"shorter" → verbosity:shorter', standingKey(D('shorter', { verbosity: { ceilingTokens: 360 } })) === 'verbosity:shorter');
ok('"only fix the grammar" → strategy:edit_only', standingKey(D('task_specific', { strategy: 'edit_as_asked', questionBudget: { max: 0, enforcement: 'tail' } })) === 'strategy:edit_only');
ok('"simpler" → style:simpler', standingKey(D('simplify', { simplify: true, scaffolding: 'more' })) === 'style:simpler');
ok("MR's readings of a moment have no key", standingKey(D('worked_example', { strategy: 'worked_example', questionBudget: { max: 0, enforcement: 'tail' } })) === null && standingKey(D('execute', { strategy: 'execute' })) === null);
ok("'none', a bare revert, junk → null", standingKey(D('none', {})) === null && standingKey(D('revert', {})) === null && standingKey(null) === null && standingKey(D('direct', 'x')) === null);
ok('every key means something to the rest of MR', ['questions:0', 'strategy:direct', 'strategy:quiz', 'verbosity:shorter', 'strategy:edit_only', 'style:simpler'].every((k) => preferenceCodeOf({ key: k, value: '' }) !== null));

// ── the carry ────────────────────────────────────────────────────────
console.log('standingFacts');
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const CARRY = { ...DEFAULTS, carryAcross: true };
let seq = 0;
const row = (record, created_at, over = {}) => ({ user_id: 'u1', id: `r${seq++}`, conversation_id: over.conversation_id ?? 'c1', turn: over.turn ?? 3, kind: over.kind ?? 'decision', policy_version: 'mr-2026.10.1', arm: 'full', record, created_at });
const stopQ = (scope = 'standing', over = {}) => ({
  action: 'fewer_questions',
  trigger: 'ifr.explicit.stop_questions',
  evidenceRefs: [{ turn: 3, role: 'user', code: 'explicit.stop_questions' }],
  controls: { questionBudget: { max: 0, enforcement: 'hard' } },
  scope: { kind: scope },
  expiration: { afterTurn: null, onRevoke: ['explicit.revoke', 'explicit.wants_questions', 'explicit.quiz'] },
  loop: 'fast',
  issuedAtTurn: 3,
  ...over,
});
const shorter = (over = {}) => ({
  action: 'shorter',
  trigger: 'ifr.explicit.shorter',
  evidenceRefs: [{ turn: 1, role: 'user', code: 'explicit.shorter' }],
  controls: { verbosity: { ceilingTokens: 360 } },
  scope: { kind: 'standing' },
  expiration: { afterTurn: null, onRevoke: ['explicit.longer', 'explicit.revoke'] },
  loop: 'fast',
  issuedAtTurn: 1,
  ...over,
});
const revertRow = (codes) => ({ action: 'revert', trigger: 'mr.revert', evidenceRefs: codes.map((c) => ({ turn: 5, role: 'user', code: `revoke:${c}` })), controls: {}, scope: { kind: 'turn' }, expiration: { afterTurn: 5, onRevoke: [] }, loop: 'fast', issuedAtTurn: 5 });
const keys = (fs) => fs.map((f) => f.key).join(',');
{
  const fs = standingFacts([row(stopQ(), NOW - DAY)], CARRY, NOW);
  ok('a standing "stop asking" is carried', fs.length === 1 && eq(fs[0], { key: 'questions:0', value: 'fewer_questions', provenance: 'explicit', turn: 0, refs: [], confidence: 0.9, expiresAfterTurn: null }), JSON.stringify(fs));
  ok('nothing without their consent', standingFacts([row(stopQ(), NOW - DAY)], DEFAULTS, NOW).length === 0);
  ok('nothing when MR is off for them', standingFacts([row(stopQ(), NOW - DAY)], { ...CARRY, enabled: false }, NOW).length === 0);
  ok('a conversation-scoped "stop asking" stays in its conversation', standingFacts([row(stopQ('conversation'), NOW - DAY)], CARRY, NOW).length === 0);
  ok('a standing decision from MR’s reading is never carried', standingFacts([row(stopQ('standing', { trigger: 'ifr.observed.unproductive_questions', evidenceRefs: [{ turn: 3, role: 'assistant', code: 'observed.unproductive_questions' }] }), NOW - DAY)], CARRY, NOW).length === 0);
  ok('a decision that was itself carried in is not a new statement', standingFacts([row(stopQ('standing', { carried: true, loop: 'longitudinal', evidenceRefs: [{ turn: 0, role: 'user', code: 'carried:questions:0' }] }), NOW - DAY)], CARRY, NOW).length === 0);
  ok('rows before their reset are not read', standingFacts([row(stopQ(), NOW - 3 * DAY)], { ...CARRY, resetAt: NOW - 2 * DAY }, NOW).length === 0);
  ok('a row at the reset moment is not read', standingFacts([row(stopQ(), NOW - 2 * DAY)], { ...CARRY, resetAt: NOW - 2 * DAY }, NOW).length === 0);
  ok('rows after their reset are', standingFacts([row(stopQ(), NOW - DAY)], { ...CARRY, resetAt: NOW - 2 * DAY }, NOW).length === 1);
  ok('a row from the future is not read', standingFacts([row(stopQ(), NOW + DAY)], CARRY, NOW).length === 0);
  ok(`a preference older than ${STANDING_MAX_AGE_MS / DAY} days lapses`, standingFacts([row(stopQ(), NOW - STANDING_MAX_AGE_MS - DAY)], CARRY, NOW).length === 0);
  ok('exposure, outcome and integrity rows are never preferences', standingFacts(['exposure', 'outcome', 'integrity'].map((k) => row(stopQ(), NOW - DAY, { kind: k })), CARRY, NOW).length === 0);
  ok('malformed rows are skipped', standingFacts([null, row(null, NOW - DAY), row({ action: 'hack', scope: { kind: 'standing' } }, NOW - DAY), row(stopQ(), NaN), row(stopQ(), NOW - DAY)], CARRY, NOW).length === 1);
}
{
  const both = [row(stopQ(), NOW - 5 * DAY, { conversation_id: 'a' }), row(shorter(), NOW - 4 * DAY, { conversation_id: 'b' })];
  ok('two axes are both carried, sorted by key', keys(standingFacts(both, CARRY, NOW)) === 'questions:0,verbosity:shorter', keys(standingFacts(both, CARRY, NOW)));
  ok('"you can ask me questions again", later, in another conversation, ends it there and everywhere', keys(standingFacts([...both, row(revertRow(['explicit.wants_questions']), NOW - DAY, { conversation_id: 'c' })], CARRY, NOW)) === 'verbosity:shorter');
  ok('"more detail" ends "shorter" only', keys(standingFacts([...both, row(revertRow(['explicit.longer']), NOW - DAY, { conversation_id: 'c' })], CARRY, NOW)) === 'questions:0');
  ok('"never mind, go back" ends them all', standingFacts([...both, row(revertRow(['explicit.revoke']), NOW - DAY)], CARRY, NOW).length === 0);
  const quiz = { action: 'preserve_challenge', trigger: 'mr.explicit.quiz', evidenceRefs: [{ turn: 2, role: 'user', code: 'explicit.quiz' }], controls: { strategy: 'preserve_challenge' }, scope: { kind: 'conversation' }, expiration: { afterTurn: null, onRevoke: ['explicit.revoke'] }, loop: 'fast', issuedAtTurn: 2 };
  ok('a later "quiz me" ends a standing "stop asking", as it does inside a conversation', keys(standingFacts([...both, row(quiz, NOW - DAY)], CARRY, NOW)) === 'verbosity:shorter');
  ok('a revocation BEFORE the statement ends nothing', keys(standingFacts([row(revertRow(['explicit.revoke']), NOW - 9 * DAY), ...both], CARRY, NOW)) === 'questions:0,verbosity:shorter');
  ok('stated again after a revocation, it is carried again', keys(standingFacts([...both, row(revertRow(['explicit.revoke']), NOW - 2 * DAY), row(stopQ(), NOW - DAY)], CARRY, NOW)) === 'questions:0');
  ok('a non-revoking later decision ends nothing', keys(standingFacts([...both, row(stopQ('conversation'), NOW - DAY)], CARRY, NOW)) === 'questions:0,verbosity:shorter');
  ok('a revert keyed to the same axis ends it', keys(standingFacts([...both, row({ ...revertRow([]), controls: { verbosity: { ceilingTokens: 700 } } }, NOW - DAY)], CARRY, NOW)) === 'questions:0');
  const shuffled = [both[1], row(revertRow(['explicit.longer']), NOW - DAY), both[0]];
  ok('order in the input does not matter (time does)', keys(standingFacts(shuffled, CARRY, NOW)) === 'questions:0');
  ok('the same rows give the same facts', eq(standingFacts(both, CARRY, NOW), standingFacts(both, CARRY, NOW)));
  const direct = { action: 'direct', trigger: 'ifr.explicit.direct_answer', evidenceRefs: [{ turn: 1, role: 'user', code: 'explicit.direct_answer' }], controls: { strategy: 'direct', answerFirst: true, questionBudget: { max: 0, enforcement: 'tail' } }, scope: { kind: 'standing' }, expiration: { afterTurn: null, onRevoke: ['explicit.revoke', 'explicit.quiz', 'explicit.wants_questions', 'explicit.learning_goal'] }, loop: 'fast', issuedAtTurn: 1 };
  const fs = standingFacts([row(direct, NOW - 3 * DAY), row({ ...direct, issuedAtTurn: 7, evidenceRefs: [{ turn: 7, role: 'user', code: 'explicit.show_steps' }] }, NOW - DAY, { turn: 7 })], CARRY, NOW);
  ok('the latest statement on an axis wins (one fact, not two)', fs.length === 1 && fs[0].key === 'strategy:direct' && fs[0].value === 'direct');
  ok('carried facts hold no words: codes only', JSON.stringify(standingFacts(both, CARRY, NOW)).match(/"[^"]*\s[^"]*"/) === null);
}
{
  // The ledger writes the decision IN FORCE, which can be several composed (policy.ts compose): merged
  // controls, the newest member's action, trigger and scope. Here "stop asking" (turn 2) was for this
  // conversation only; "from now on, keep it short" (turn 4) was standing.
  const stopHere = stopQ('conversation', { issuedAtTurn: 2, evidenceRefs: [{ turn: 2, role: 'user', code: 'explicit.stop_questions' }], interventionId: 'iv_stop' });
  const shortNow = shorter({ issuedAtTurn: 4, evidenceRefs: [{ turn: 4, role: 'user', code: 'explicit.shorter' }], interventionId: 'iv_short' });
  const composed = compose([stopHere, shortNow], 4, 'mr-2026.10.1', 'cA');
  ok('(fixture) the composed row is standing, newest = shorter, with both controls merged', composed.scope.kind === 'standing' && composed.action === 'shorter' && composed.controls.questionBudget?.max === 0 && !!composed.controls.verbosity, JSON.stringify(composed));
  const fs = standingFacts([row(composed, NOW - DAY, { turn: 4 })], CARRY, NOW);
  ok('a composed row carries only its newest member: "shorter", not the conversation-only "stop asking"', keys(fs) === 'verbosity:shorter' && fs[0].value === 'shorter', JSON.stringify(fs));
  ok('standingKey of a composed decision is its newest member’s', standingKey(composed) === 'verbosity:shorter');
  ok('… and only while that member’s control is still there', standingKey({ ...composed, action: 'fewer_questions', controls: { verbosity: { ceilingTokens: 360 } } }) === null);
  ok('a single-member composedOf is read like any decision', standingKey({ action: 'fewer_questions', controls: { questionBudget: { max: 0, enforcement: 'hard' } }, composedOf: ['x'] }) === 'questions:0');
}
{
  // words said BEFORE a standing statement cannot revoke it, even when a later composed row still cites them
  const quiz = { action: 'preserve_challenge', trigger: 'mr.explicit.quiz', evidenceRefs: [{ turn: 1, role: 'user', code: 'explicit.quiz' }], controls: { strategy: 'preserve_challenge', noRevealAnswers: true, questionBudget: { max: 1, enforcement: 'tail' } }, scope: { kind: 'conversation' }, expiration: { afterTurn: null, onRevoke: ['explicit.revoke'] }, loop: 'fast', issuedAtTurn: 1, interventionId: 'iv_quiz' };
  const shortLater = shorter({ scope: { kind: 'conversation' }, issuedAtTurn: 5, evidenceRefs: [{ turn: 5, role: 'user', code: 'explicit.shorter' }], interventionId: 'iv_s5' });
  const composedB = compose([quiz, shortLater], 5, 'mr-2026.10.1', 'cB');
  ok('(fixture) the later composed row cites the old "quiz me"', composedB.evidenceRefs.some((r) => r.code === 'explicit.quiz' && r.turn === 1));
  const rows = [row(quiz, NOW - 5 * DAY, { turn: 1, conversation_id: 'cB' }), row(stopQ(), NOW - 4 * DAY, { conversation_id: 'cC' }), row(composedB, NOW - 3 * DAY, { turn: 5, conversation_id: 'cB' })];
  ok('an old "quiz me" cited again later does not end a "stop asking" stated after it', keys(standingFacts(rows, CARRY, NOW)) === 'questions:0', keys(standingFacts(rows, CARRY, NOW)));
}
{
  // MR's own readings cite their words ("repeated confusion" points at each "I don't get it"): still not theirs
  const mrReading = stopQ('standing', { trigger: 'ifr.observed.repeated_confusion', action: 'worked_example', evidenceRefs: [{ turn: 3, role: 'user', code: 'explicit.confused' }], controls: { questionBudget: { max: 0, enforcement: 'tail' } } });
  ok('a standing row from MR’s reading that cites their words is not carried', standingFacts([row(mrReading, NOW - DAY)], CARRY, NOW).length === 0);
  ok('an explicit rule with none of their words at that turn is not carried', standingFacts([row(stopQ('standing', { evidenceRefs: [{ turn: 1, role: 'user', code: 'explicit.stop_questions' }] }), NOW - DAY)], CARRY, NOW).length === 0);
  ok('their words at that turn, from the assistant role, are not theirs', standingFacts([row(stopQ('standing', { evidenceRefs: [{ turn: 3, role: 'assistant', code: 'explicit.stop_questions' }] }), NOW - DAY)], CARRY, NOW).length === 0);
}
// ── the markers the server keeps in their settings (MR-PRIV-2, MR-PRIV-11) ──
console.log('settings markers');
{
  const T = 1_700_000_000_000;
  const STOP = 'ifr.explicit.stop_questions';
  const hash = 'a'.repeat(32);
  const s = sanitizeSettings({ enabled: true, revokedStanding: [{ trigger: STOP, at: T }], forgotten: [{ conversation: hash, at: T }] });
  ok('well-formed markers survive the parser', eq(s.revokedStanding, [{ trigger: STOP, at: T }]) && eq(s.forgotten, [{ conversation: hash, at: T }]), JSON.stringify(s));
  ok('  absent when there are none (the defaults stay the defaults)', !('revokedStanding' in sanitizeSettings({})) && !('forgotten' in sanitizeSettings({ revokedStanding: [], forgotten: [] })));
  const junk = sanitizeSettings({
    revokedStanding: [{ trigger: 'they said stop', at: T }, { trigger: STOP, at: 0 }, { trigger: STOP, at: 'x' }, { trigger: 7, at: T }, 'x', null, { trigger: 'ifr.explicit.shorter', at: T + 1 }],
    forgotten: [{ conversation: 'conv_a', at: T }, { conversation: hash.toUpperCase(), at: T }, { conversation: hash, at: -1 }],
  });
  ok('  a rule that is not a code, a time that is not one, a conversation that is not a hash: dropped', eq(junk.revokedStanding, [{ trigger: 'ifr.explicit.shorter', at: T + 1 }]) && !('forgotten' in junk), JSON.stringify(junk));
  ok('  the newest per rule, newest first', eq(revokedStandingFrom([{ trigger: STOP, at: T }, { trigger: STOP, at: T + 5 }, { trigger: 'ifr.explicit.shorter', at: T + 1 }]), [{ trigger: STOP, at: T + 5 }, { trigger: 'ifr.explicit.shorter', at: T + 1 }]));
  const many = sanitizeSettings({ revokedStanding: Array.from({ length: 100 }, (_, i) => ({ trigger: `ifr.explicit.r${i}`, at: T + i })), forgotten: Array.from({ length: 100 }, (_, i) => ({ conversation: i.toString(16).padStart(32, '0'), at: T + i })) });
  ok('  bounded', many.revokedStanding.length === MAX_REVOKED_STANDING && many.forgotten.length === MAX_FORGOTTEN && many.revokedStanding[0].at === T + 99);
  ok('what the person is shown has their choices only, never the markers', eq(Object.keys(publicSettings(s)).sort(), ['carryAcross', 'enabled', 'research', 'resetAt', 'version']));

  const now = T + 10_000;
  let m = mergeRevocations([], [{ trigger: STOP, at: T }], { now, resetAt: null });
  ok('mergeRevocations: a revocation is recorded, by rule and time', m.changed && eq(m.list, [{ trigger: STOP, at: T }]));
  m = mergeRevocations([{ trigger: STOP, at: T }], [{ trigger: STOP, at: T + 50 }], { now, resetAt: null });
  ok('  said again, later, in their words: the newer time wins (it ends the most)', m.changed && eq(m.list, [{ trigger: STOP, at: T + 50 }]));
  m = mergeRevocations([{ trigger: STOP, at: T }], [{ trigger: STOP, at: T + 50, reasserted: true }], { now, resetAt: null });
  ok('  a later row only saying an earlier one again never moves it forward — and writes nothing', !m.changed && eq(m.list, [{ trigger: STOP, at: T }]));
  m = mergeRevocations([], [{ trigger: STOP, at: T + 50, reasserted: true }], { now, resetAt: null });
  ok('  but fills the gap when nothing was recorded (the row of the turn they said it was lost)', m.changed && eq(m.list, [{ trigger: STOP, at: T + 50 }]));
  m = mergeRevocations([{ trigger: STOP, at: T }], [{ trigger: 'ifr.explicit.shorter', at: T + 2 }], { now, resetAt: T + 1 });
  ok('  one at or before their last reset ends nothing, and is dropped', eq(m.list, [{ trigger: 'ifr.explicit.shorter', at: T + 2 }]));
  m = mergeRevocations([{ trigger: STOP, at: T }], [], { now: T + STANDING_MAX_AGE_MS + 1, resetAt: null });
  ok('  one older than any preference that could still be carried is dropped', m.list.length === 0 && m.changed);
  m = mergeRevocations([], [{ trigger: 'they said stop', at: T }, { trigger: STOP, at: 0 }, null], { now, resetAt: null });
  ok('  words for a rule, a bad time, junk: nothing recorded', m.list.length === 0 && !m.changed);

  const f = mergeForgotten([{ conversation: hash, at: T }], { conversation: 'b'.repeat(32), at: T + 5 }, T + 10);
  ok('mergeForgotten: one more marked, newest first', eq(f, [{ conversation: 'b'.repeat(32), at: T + 5 }, { conversation: hash, at: T }]));
  ok('  and a day later it is gone (it only has to outlast a turn still writing)', mergeForgotten(f, null, T + 5 + FORGOTTEN_TTL_MS).length === 0 && FORGOTTEN_TTL_MS === DAY);
}
{
  // standingFacts: their settings' record of a "from now on" taken back
  const STOP = 'ifr.explicit.stop_questions';
  const said = row(stopQ(), NOW - 5 * DAY, { conversation_id: 'a' });
  ok('a statement made at or before a revocation their settings keep: taken back', standingFacts([said], { ...CARRY, revokedStanding: [{ trigger: STOP, at: NOW - 5 * DAY }] }, NOW).length === 0);
  ok('  one made after it carries as usual', keys(standingFacts([said], { ...CARRY, revokedStanding: [{ trigger: STOP, at: NOW - 6 * DAY }] }, NOW)) === 'questions:0');
  ok('  a revocation of another rule ends nothing', keys(standingFacts([said], { ...CARRY, revokedStanding: [{ trigger: 'ifr.explicit.shorter', at: NOW - DAY }] }, NOW)) === 'questions:0');
  ok('  and a taken-back statement still replaces what it replaced on its axis, then holds nothing', standingFacts([row(stopQ('standing', { trigger: 'ifr.explicit.stop_questions_older' }), NOW - 9 * DAY), said], { ...CARRY, revokedStanding: [{ trigger: STOP, at: NOW - DAY }] }, NOW).length === 0);
}
ok("preference codes are the table's own: 'constructor' is not one", preferenceCodeOf({ key: 'constructor', value: '' }) === null && preferenceCodeOf({ key: 'x', value: 'toString' }) === null);

// ── promotion ────────────────────────────────────────────────────────
console.log('promotionVerdict');
const ci = (mean, half, n = 400) => ({ mean, lo: mean - half, hi: mean + half, n });
const report = (over = {}, cand = {}, base = {}) => ({
  candidate: 'full',
  baseline: 'baseline',
  randomized: true,
  arms: [
    // guardrail intervals of ±0.01: with a 0.02 non-inferiority margin, ±0.02 on each arm could never show "not worse"
    { arm: 'full', n: 400, metrics: { friction: ci(0.2, 0.03), task_success: ci(0.9, 0.01), control_compliance: ci(0.97, 0.01), satisfaction: ci(0.9, 0.02), independent_performance: ci(0.6, 0.03), ...cand } },
    { arm: 'baseline', n: 400, metrics: { friction: ci(0.35, 0.03), task_success: ci(0.9, 0.01), control_compliance: ci(0.96, 0.01), satisfaction: ci(0.7, 0.02), independent_performance: ci(0.5, 0.03), ...base } },
  ],
  primary: 'friction',
  guardrails: ['task_success', 'control_compliance'],
  independentOutcomeMeasured: false,
  longitudinal: false,
  comparedAgainst: ['baseline'],
  ...over,
});
{
  const v = promotionVerdict(report());
  ok('a randomized, powered report with a clear primary and safe guardrails → recommend', v.promote === true && eq(v.reasons, ['all_criteria_met']), JSON.stringify(v));
  const r = report();
  const before = JSON.stringify(r);
  promotionVerdict(r);
  ok('it applies nothing: the report is unchanged', JSON.stringify(r) === before);
  ok('the criteria are the conservative ones', eq({ ...PROMOTION_CRITERIA }, { minPerArm: 200, requireRandomized: true, primaryLowerBoundAbove: 0, guardrailMargin: 0.02 }) && Object.isFrozen(PROMOTION_CRITERIA));
}
const rejects = (name, r, reason) => {
  const v = promotionVerdict(r);
  ok(`${name} → no (${reason})`, v.promote === false && v.reasons.some((x) => x.startsWith(reason)), JSON.stringify(v));
};
rejects('not randomized', report({ randomized: false }), 'not_randomized');
rejects('underpowered candidate', report({ arms: report().arms.map((a) => (a.arm === 'full' ? { ...a, n: 150 } : a)) }), 'underpowered:candidate');
rejects('underpowered baseline', report({ arms: report().arms.map((a) => (a.arm === 'baseline' ? { ...a, n: 199 } : a)) }), 'underpowered:baseline');
rejects('the primary measured on too few', report({}, { friction: ci(0.2, 0.03, 120) }), 'underpowered:primary');
rejects('satisfaction as the primary, however large', report({ primary: 'satisfaction' }, { satisfaction: ci(0.99, 0.001) }, { satisfaction: ci(0.1, 0.001) }), 'primary_is_satisfaction');
for (const p of ['user_satisfaction', 'csat', 'thumbs_up_rate', 'helpfulness_rating', 'nps']) rejects(`"${p}" as the primary`, report({ primary: p }), 'primary_is_satisfaction');
rejects('a primary with no known direction', report({ primary: 'engagement_minutes' }, { engagement_minutes: ci(9, 1) }, { engagement_minutes: ci(5, 1) }), 'primary_direction_unknown');
rejects('a primary interval that includes no effect', report({}, { friction: ci(0.33, 0.03) }), 'primary_ci_includes_no_effect');
rejects('a primary that got worse', report({}, { friction: ci(0.5, 0.03) }), 'primary_not_better');
rejects('a primary not measured', report({ primary: 'repeat_requests' }), 'primary_not_measured');
rejects('no primary', report({ primary: '' }), 'primary_missing');
rejects('a missing guardrail', report({ guardrails: ['task_success'] }), 'guardrail_missing:control_compliance');
rejects('task success worse beyond the margin', report({}, { task_success: ci(0.85, 0.02) }), 'guardrail_inferior:task_success');
rejects('control compliance worse beyond the margin', report({}, { control_compliance: ci(0.9, 0.01) }), 'guardrail_inferior:control_compliance');
rejects('a guardrail not measured', report({}, { control_compliance: undefined }), 'guardrail_not_measured:control_compliance');
rejects('the candidate is the baseline', report({ candidate: 'baseline' }), 'candidate_is_baseline');
rejects('a missing arm', report({ candidate: 'state_only' }), 'arm_missing:candidate');
rejects('a malformed interval', report({}, { friction: { mean: 0.2, lo: 0.3, hi: 0.1, n: 400 } }), 'primary_not_measured');
ok('a guardrail a hair worse, within 0.02, is non-inferior', promotionVerdict(report({}, { task_success: ci(0.895, 0.005) }, { task_success: ci(0.9, 0.005) })).promote === true);
ok('higher-is-better primary works the other way round', promotionVerdict(report({ primary: 'task_success', guardrails: ['task_success', 'control_compliance'] }, { task_success: ci(0.95, 0.01) }, { task_success: ci(0.9, 0.01) })).promote === true);
ok('custom criteria are honoured', promotionVerdict(report({ arms: report().arms.map((a) => ({ ...a, n: 120, metrics: Object.fromEntries(Object.entries(a.metrics).map(([k, m]) => [k, { ...m, n: 120 }])) })) }), { ...PROMOTION_CRITERIA, minPerArm: 100 }).promote === true);
ok('junk → no', promotionVerdict(null).promote === false && promotionVerdict({}).promote === false);
{
  let v = null;
  let threw = false;
  try {
    v = promotionVerdict({ ...report(), arms: [null, 7, ...report().arms] });
  } catch {
    threw = true;
  }
  ok('a malformed arm entry is skipped, not a crash', !threw && v?.promote === true, threw ? 'threw' : JSON.stringify(v));
  ok('… and the ladder reads past it too', (() => { try { return evidenceLevel({ ...report(), arms: [null, ...report().arms] }) === 'I'; } catch { return false; } })());
}
rejects('a guardrail measured on too few', report({}, { control_compliance: ci(0.97, 0.005, 40) }, { control_compliance: ci(0.96, 0.005, 40) }), 'underpowered:guardrail:control_compliance');
rejects("a prototype name as the primary ('constructor')", report({ primary: 'constructor' }), 'primary_direction_unknown');

// ── the evidence ladder ──────────────────────────────────────────────
console.log('evidenceLevel');
const three = (over = {}, metrics = {}) => {
  const r = report({ comparedAgainst: ['baseline', 'prompt_reflection', 'state_only'], ...over });
  r.arms.push({ arm: 'prompt_reflection', n: 400, metrics: { friction: ci(0.3, 0.03), ...(metrics.prompt_reflection ?? {}) } });
  r.arms.push({ arm: 'state_only', n: 400, metrics: { friction: ci(0.28, 0.03), ...(metrics.state_only ?? {}) } });
  return r;
};
ok('not randomized → none', evidenceLevel(report({ randomized: false })) === 'none');
ok('friction better, task success held → I', evidenceLevel(report()) === 'I');
ok('friction better but task success regressed → none', evidenceLevel(report({}, { task_success: ci(0.8, 0.02) })) === 'none');
ok('friction better, but one friction measure worse → none', evidenceLevel(report({}, { repeat_requests: ci(0.3, 0.02) }, { repeat_requests: ci(0.1, 0.02) })) === 'none');
ok('no task measure → none (no regression cannot be shown)', evidenceLevel(report({}, { task_success: undefined })) === 'none');
ok('satisfaction up, friction flat → none', evidenceLevel(report({}, { friction: ci(0.35, 0.03) })) === 'none');
ok('an independent outcome measured and better → II', evidenceLevel(report({ independentOutcomeMeasured: true })) === 'II');
ok('measured but not better → stays I', evidenceLevel(report({ independentOutcomeMeasured: true }, { independent_performance: ci(0.5, 0.03) })) === 'I');
ok('better but the flag says not measured independently → stays I', evidenceLevel(report({ independentOutcomeMeasured: false })) === 'I');
ok('… across sessions → III', evidenceLevel(report({ independentOutcomeMeasured: true, longitudinal: true })) === 'III');
ok('longitudinal without II → I', evidenceLevel(report({ longitudinal: true })) === 'I');
ok('full beats prompt-only and state-only on the primary → IV', evidenceLevel(three({ independentOutcomeMeasured: true, longitudinal: true })) === 'IV');
ok('beats only one of them → III', evidenceLevel(three({ independentOutcomeMeasured: true, longitudinal: true }, { state_only: { friction: ci(0.21, 0.03) } })) === 'III');
ok('not compared against both → III', evidenceLevel(three({ independentOutcomeMeasured: true, longitudinal: true, comparedAgainst: ['baseline', 'prompt_reflection'] })) === 'III');
ok('IV needs III: beats both but not longitudinal → II', evidenceLevel(three({ independentOutcomeMeasured: true })) === 'II');
{
  const r = three({ independentOutcomeMeasured: true, longitudinal: true });
  r.arms = r.arms.map((a) => (a.arm === 'full' ? { ...a, arm: 'full_v2' } : a));
  r.candidate = 'full_v2';
  ok('IV is about full, not any candidate', evidenceLevel(r) === 'III', evidenceLevel(r));
}
ok('equal task success with ±0.02 intervals cannot show non-inferiority within 0.02', promotionVerdict(report({}, { task_success: ci(0.9, 0.02) }, { task_success: ci(0.9, 0.02) })).reasons.includes('guardrail_inferior:task_success'));
ok('junk → none', evidenceLevel(null) === 'none' && evidenceLevel({}) === 'none');

// ── rollback ─────────────────────────────────────────────────────────
console.log('rollbackTarget');
const KNOWN = ['mr-2026.09.1', 'mr-2026.10.1', 'mr-2026.11.1'];
ok('a valid pin wins', eq(rollbackTarget('mr-2026.11.1', 'mr-2026.09.1', KNOWN), { version: 'mr-2026.09.1', reason: 'pinned' }));
ok('a pin equal to the current one means the version before it', eq(rollbackTarget('mr-2026.11.1', 'mr-2026.11.1', KNOWN), { version: 'mr-2026.10.1', reason: 'previous' }));
ok('no pin → the previous version', eq(rollbackTarget('mr-2026.10.1', null, KNOWN), { version: 'mr-2026.09.1', reason: 'previous' }));
ok('an unknown pin is ignored, and says so', eq(rollbackTarget('mr-2026.11.1', 'mr-1999.1', KNOWN), { version: 'mr-2026.10.1', reason: 'pin_unknown:previous' }));
ok('nothing earlier → stay, and turn MR off', eq(rollbackTarget('mr-2026.09.1', null, KNOWN), { version: 'mr-2026.09.1', reason: 'no_earlier_version:turn_mr_off' }));
ok('an unknown current → the latest known', eq(rollbackTarget('mr-x', null, KNOWN), { version: 'mr-2026.11.1', reason: 'current_unknown:latest_known' }));
ok('no known versions → stay', rollbackTarget('mr-x', null, []).version === 'mr-x');
ok('the one real version today has nothing earlier', rollbackTarget('mr-2026.10.1', null, ['mr-2026.10.1']).reason.startsWith('no_earlier_version'));
// STRATEGIES may hold a candidate not yet promoted: "rolling back" onto it would be trying it
ok('a pin to a LATER version is not a rollback: the previous one, and it says so', eq(rollbackTarget('mr-2026.10.1', 'mr-2026.11.1', KNOWN), { version: 'mr-2026.09.1', reason: 'pin_not_earlier:previous' }), JSON.stringify(rollbackTarget('mr-2026.10.1', 'mr-2026.11.1', KNOWN)));
ok('… and with nothing earlier, stay and turn MR off', eq(rollbackTarget('mr-2026.09.1', 'mr-2026.11.1', KNOWN), { version: 'mr-2026.09.1', reason: 'pin_not_earlier:no_earlier_version:turn_mr_off' }));
ok('an unknown current with a known pin → the pin', eq(rollbackTarget('mr-x', 'mr-2026.09.1', KNOWN), { version: 'mr-2026.09.1', reason: 'pinned' }));

console.log(`\nmr-adaptation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
