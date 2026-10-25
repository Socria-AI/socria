// Research readiness (lib/mr/research.ts): what a consented export may hold.
// Nothing without consent to that study, no ids, an allow-list of codes.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pseudonym, toResearchEvents, RESEARCH_EVENT_VERSION, VALIDITY_LIMITS, MINIMAL_FIELDS, DEFAULT_MR_SETTINGS } from './.tmp/mr-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const throws = (f) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};
const SECRET = 'test-secret-0123456789-abcdefghijklmnop'; // 38 characters, test-only
const CODE = /^[A-Za-z0-9_][\w.:/=+<>#,@|-]{0,63}$/;

console.log('pseudonym');
ok('24 hex characters', /^[0-9a-f]{24}$/.test(pseudonym('user_1', SECRET, 's:participant')));
ok('deterministic', pseudonym('user_1', SECRET, 's') === pseudonym('user_1', SECRET, 's'));
ok('the scope separates', pseudonym('user_1', SECRET, 'a') !== pseudonym('user_1', SECRET, 'b'));
ok('the secret separates', pseudonym('user_1', SECRET, 's') !== pseudonym('user_1', SECRET + 'x', 's'));
ok('the id separates', pseudonym('user_1', SECRET, 's') !== pseudonym('user_2', SECRET, 's'));
ok("scope and id are joined with ':'", pseudonym('b:c', SECRET, 'a') === pseudonym('c', SECRET, 'a:b') && pseudonym('bc', SECRET, 'a') !== pseudonym('c', SECRET, 'ab'));
ok('a 31-character secret throws', throws(() => pseudonym('u', 'x'.repeat(31), 's')));
ok('a 32-character secret is enough', !throws(() => pseudonym('u', 'x'.repeat(32), 's')));
ok('no secret throws', throws(() => pseudonym('u', undefined, 's')));

console.log('toResearchEvents');
const CONSENT_AT = 1_750_000_000_000;
const STUDY = 'mr-pilot-2027s';
const consented = { ...DEFAULT_MR_SETTINGS, research: { studyId: STUDY, consentedAt: CONSENT_AT } };
const P = { studyId: STUDY, secret: SECRET, settings: consented };
let seq = 0;
const row = (kind, record, created_at = CONSENT_AT + 1000, over = {}) => ({
  user_id: 'user_2abcSECRETID',
  id: `row${seq++}`,
  conversation_id: 'conv_SECRETCONV',
  turn: 3,
  kind,
  policy_version: 'mr-2026.10.1',
  arm: 'full',
  record,
  created_at,
  ...over,
});
const decision = {
  policyVersion: 'mr-2026.10.1',
  interventionId: 'iv_0123456789abcdef',
  action: 'fewer_questions',
  trigger: 'ifr.explicit.stop_questions',
  evidenceRefs: [{ turn: 3, role: 'user', code: 'explicit.stop_questions' }],
  target: ['acs', 'behavior'],
  controls: { questionBudget: { max: 0, enforcement: 'hard' } },
  scope: { kind: 'conversation' },
  expiration: { afterTurn: null, onRevoke: ['explicit.revoke', 'explicit.wants_questions'] },
  confidence: 0.95,
  uncertainty: ['inferred_from_transcript'],
  evaluationPlan: { primary: 'friction', expect: ['questions=0'], window: 2 },
  rollback: { revertTo: 'acs_default', when: ['outcome:revert'] },
  loop: 'fast',
  issuedAtTurn: 3,
  composedOf: ['iv_a', 'iv_b'],
};
const U = { value: 'unknown', provenance: 'none', refs: [] };
const outcome = {
  interventionId: 'iv_0123456789abcdef',
  turn: 4,
  taskCompletion: { value: 'delivered', provenance: 'observed', refs: [{ turn: 4, role: 'assistant', code: 'steps' }] },
  satisfaction: { value: 'positive', provenance: 'explicit', refs: [] },
  friction: { value: { questionsAsked: 0, repeatRequests: 0, complaints: 0, turnsToUseful: null }, provenance: 'observed', refs: [] },
  independentPerformance: { ...U, note: 'no_attempt' },
  retention: { ...U, note: 'needs_delayed_check' },
  autonomy: { ...U, note: 'needs_instrument' },
  regulation: 'keep',
};
const exposure = { v: 1, arm: 'full', ifr: true, shadow: false, source: 'experiment', experimentId: STUDY, ms: 7 };
const integrity = { code: 'oscillation', severity: 'warn', turn: 5, detail: 'changes:4>3', action: 'freeze' };
const rows = [row('exposure', exposure), row('decision', decision), row('outcome', outcome, CONSENT_AT + 2000, { turn: 4 }), row('integrity', integrity, CONSENT_AT + 3000, { turn: 5 })];

{
  const evs = toResearchEvents(rows, P);
  ok('every consented row becomes an event', evs.length === 4, evs.length);
  const all = JSON.stringify(evs);
  ok('no user id, conversation id or intervention id leaves', !/SECRETID|SECRETCONV|user_2abc|conv_|iv_0123/.test(all), all.slice(0, 300));
  ok('the version, study, day, turn, kind and arm are there', evs.every((e) => e.v === RESEARCH_EVENT_VERSION && e.study === STUDY && /^\d{4}-\d{2}-\d{2}$/.test(e.day) && e.arm === 'full') && evs.map((e) => e.kind).join(',') === 'exposure,decision,outcome,integrity' && evs[2].turn === 4);
  ok('the day is coarsened, UTC', evs[0].day === new Date(CONSENT_AT).toISOString().slice(0, 10));
  ok('one participant pseudonym, one conversation pseudonym, and they differ', new Set(evs.map((e) => e.participant)).size === 1 && new Set(evs.map((e) => e.conversation)).size === 1 && evs[0].participant !== evs[0].conversation);
  ok('the participant pseudonym is the scoped HMAC', evs[0].participant === pseudonym('user_2abcSECRETID', SECRET, `${STUDY}:participant`));
  ok('decision and outcome stay linked through the pseudonymous intervention id', evs[1].codes.interventionId === evs[2].codes.interventionId && /^[0-9a-f]{24}$/.test(evs[1].codes.interventionId));
  ok('ifr only on exposures', evs[0].ifr === true && evs.slice(1).every((e) => !('ifr' in e)));
  ok('decision codes are kept', evs[1].codes.action === 'fewer_questions' && evs[1].codes['controls.questionBudget.max'] === 0 && evs[1].codes['controls.questionBudget.enforcement'] === 'hard' && evs[1].codes['scope.kind'] === 'conversation' && evs[1].codes['evidenceRefs.0.code'] === 'explicit.stop_questions' && evs[1].codes['evidenceRefs.n'] === 1 && evs[1].codes['expiration.afterTurn'] === null, JSON.stringify(evs[1].codes));
  ok('composedOf leaves only as a count', evs[1].codes['composedOf.n'] === 2 && !Object.keys(evs[1].codes).some((k) => /^composedOf\.\d/.test(k)));
  ok('the decision record’s own policyVersion field is not duplicated', !('policyVersion' in evs[1].codes) && evs[1].policyVersion === 'mr-2026.10.1');
  ok('outcome codes are kept, refs only as counts', evs[2].codes['taskCompletion.value'] === 'delivered' && evs[2].codes['taskCompletion.refs.n'] === 1 && !('taskCompletion.refs.0.code' in evs[2].codes) && evs[2].codes['friction.value.turnsToUseful'] === null && evs[2].codes['retention.note'] === 'needs_delayed_check' && evs[2].codes.regulation === 'keep', JSON.stringify(evs[2].codes));
  ok('integrity codes are kept', evs[3].codes.code === 'oscillation' && evs[3].codes.detail === 'changes:4>3' && evs[3].codes.action === 'freeze');
  const norm = (k) => `codes.${k.replace(/\.\d+(?=\.|$)/g, '.#')}`;
  ok('every exported code is on MINIMAL_FIELDS', evs.every((e) => Object.keys(e.codes).every((k) => MINIMAL_FIELDS.includes(norm(k)))), evs.flatMap((e) => Object.keys(e.codes)).filter((k) => !MINIMAL_FIELDS.includes(norm(k))).join(','));
  ok('every event field is on MINIMAL_FIELDS', evs.every((e) => Object.keys(e).every((k) => k === 'codes' || MINIMAL_FIELDS.includes(k))));
  ok('every exported string is a code', evs.every((e) => Object.values(e.codes).every((v) => typeof v !== 'string' || CODE.test(v))));
  ok('the same rows give the same export', JSON.stringify(toResearchEvents(rows, P)) === all);
}

console.log('consent');
ok('not a participant → nothing', toResearchEvents(rows, { ...P, settings: DEFAULT_MR_SETTINGS }).length === 0);
ok('a participant in another study → nothing', toResearchEvents(rows, { ...P, settings: { ...consented, research: { studyId: 'other-study', consentedAt: CONSENT_AT } } }).length === 0);
ok('asked for another study → nothing', toResearchEvents(rows, { ...P, studyId: 'other-study' }).length === 0);
ok('a consent with no time → nothing', toResearchEvents(rows, { ...P, settings: { ...consented, research: { studyId: STUDY, consentedAt: 0 } } }).length === 0);
{
  const before = row('decision', decision, CONSENT_AT - 1);
  const at = row('decision', decision, CONSENT_AT);
  const evs = toResearchEvents([before, at], P);
  ok('rows before consent are dropped; a row at the moment of consent is kept', evs.length === 1);
  ok('rows before their reset are dropped', toResearchEvents(rows, { ...P, settings: { ...consented, resetAt: CONSENT_AT + 2500 } }).length === 1);
}
ok('a short secret throws, even before consent is checked', throws(() => toResearchEvents(rows, { ...P, secret: 'short' })) && throws(() => toResearchEvents(rows, { ...P, settings: DEFAULT_MR_SETTINGS, secret: 'short' })));
ok("one person's consent never covers another's rows (throws)", throws(() => toResearchEvents([...rows, row('decision', decision, CONSENT_AT + 1, { user_id: 'user_other' })], P)));
ok('pseudonyms differ between studies for the same person', (() => {
  const other = { studyId: 'study-b', secret: SECRET, settings: { ...consented, research: { studyId: 'study-b', consentedAt: CONSENT_AT } } };
  return toResearchEvents(rows, P)[0].participant !== toResearchEvents(rows, other)[0].participant;
})());

console.log('the allow-list');
{
  const dirty = {
    ...decision,
    trigger: 'x'.repeat(65), // longer than a code
    evidenceRefs: [
      { turn: 3, role: 'user', code: 'they said "stop asking me questions"' },
      { turn: 3, role: 'narrator', code: 'explicit.stop_questions' },
      { turn: 3, role: 'user', code: 'explicit.stop_questions', quote: 'stop asking me questions' },
    ],
    uncertainty: ['not sure they meant it', 'ok_code'],
    action: 'manipulate',
    scope: { kind: 'forever' },
    note: 'free text about them',
    message: 'stop asking me questions',
    controls: { questionBudget: { max: 0, enforcement: 'hard', why: 'they are frustrated' }, strategy: 'socratic' },
    evaluationPlan: { primary: 'happiness', expect: ['questions=0', 'they feel better'], window: 2 },
    nested: { deeper: { text: 'words' } },
    confidence: 'high',
  };
  const ev = toResearchEvents([row('decision', dirty)], P)[0];
  const all = JSON.stringify(ev);
  ok('a string longer than a code is dropped', !('trigger' in ev.codes));
  ok('a quote in an evidence code is dropped', !('evidenceRefs.0.code' in ev.codes) && !/stop asking/.test(all), all.slice(0, 300));
  ok('an unknown role is dropped, the code beside it kept', !('evidenceRefs.1.role' in ev.codes) && ev.codes['evidenceRefs.1.code'] === 'explicit.stop_questions');
  ok('a field not on the list is dropped, wherever it is', !/quote|note|message|why|nested|deeper|words|frustrated/.test(all), all.slice(0, 300));
  ok('a sentence in uncertainty is dropped, a code kept', ev.codes['uncertainty.1'] === 'ok_code' && !('uncertainty.0' in ev.codes) && ev.codes['uncertainty.n'] === 2);
  ok('values outside their vocabulary are dropped', !('action' in ev.codes) && !('scope.kind' in ev.codes) && !('controls.strategy' in ev.codes) && !('evaluationPlan.primary' in ev.codes));
  ok('an expectation that is a sentence is dropped', ev.codes['evaluationPlan.expect.0'] === 'questions=0' && !('evaluationPlan.expect.1' in ev.codes));
  ok('a number field holding a string is dropped', !('confidence' in ev.codes));
}
{
  const long = { ...decision, uncertainty: Array.from({ length: 50 }, (_, k) => `u${k}`) };
  const ev = toResearchEvents([row('decision', long)], P)[0];
  ok('arrays leave as a count and at most 8 entries', ev.codes['uncertainty.n'] === 50 && Object.keys(ev.codes).filter((k) => k.startsWith('uncertainty.') && k !== 'uncertainty.n').length === 8);
}
{
  const evs = toResearchEvents(
    [
      row('mystery', decision),
      row('decision', decision, CONSENT_AT + 5, { arm: 'secret_arm' }),
      row('decision', decision, CONSENT_AT + 5, { turn: -1 }),
      row('decision', decision, CONSENT_AT + 5, { turn: 1.5 }),
      row('decision', decision, 'yesterday'),
      row('decision', null),
      row('decision', decision, CONSENT_AT + 5, { policy_version: 'a policy with words in it' }),
      row('decision', decision, CONSENT_AT + 5, { conversation_id: null }),
    ],
    P
  );
  ok('rows with an unknown kind, arm, turn or time are dropped whole', evs.length === 3, evs.length);
  ok('a record that is not an object exports no codes', evs.some((e) => Object.keys(e.codes).length === 0));
  ok('a policy version that is not a code becomes unknown', evs.some((e) => e.policyVersion === 'unknown'));
  ok('no conversation → "none"', evs.some((e) => e.conversation === 'none'));
}
ok('no rows → no events', toResearchEvents([], P).length === 0 && toResearchEvents(null, P).length === 0);
{
  // the ledger's exposure (lib/mr/ledger.ts LedgerExposure) also says what was in force and whether a model call was spent
  const ledgerExposure = { ...exposure, action: 'fewer_questions', interventionId: 'iv_0123456789abcdef', active: ['iv_0123456789abcdef', 'iv_other'], deliberated: true };
  const [ex, dec] = toResearchEvents([row('exposure', ledgerExposure), row('decision', decision)], P);
  ok('an exposure says what was in force, linked to its decision by pseudonym', ex.codes.action === 'fewer_questions' && ex.codes.interventionId === dec.codes.interventionId && /^[0-9a-f]{24}$/.test(ex.codes.interventionId), JSON.stringify(ex.codes));
  ok('… whether a deliberation (a model call) was spent', ex.codes.deliberated === true);
  ok('… and how many adjustments were active, as a count only', ex.codes['active.n'] === 2 && !Object.keys(ex.codes).some((k) => /^active\.\d/.test(k)) && !/iv_/.test(JSON.stringify(ex)));
  ok('an exposure action outside the vocabulary is dropped', !('action' in toResearchEvents([row('exposure', { ...ledgerExposure, action: 'manipulate' })], P)[0].codes));
  // honesty F5 and F4: a turn whose decision changed nothing is not exposure to the treatment; a model call is a cost
  const [taken, called] = toResearchEvents([row('exposure', { ...ledgerExposure, enforced: false }), row('exposure', { ...ledgerExposure, enforced: true, modelDeliberated: true })], P);
  ok('whether the decision in force changed the reply is exported (a higher layer can take every control out)', taken.codes.enforced === false && called.codes.enforced === true, JSON.stringify(taken.codes));
  ok('  and whether a model was actually asked, apart from a deterministic deliberation', called.codes.modelDeliberated === true && !('modelDeliberated' in taken.codes));
  ok('  only as booleans', !('enforced' in toResearchEvents([row('exposure', { ...ledgerExposure, enforced: 'no' })], P)[0].codes));
  const kept = toResearchEvents([row('exposure', { ...ledgerExposure, local: true, revoked: ['ifr.explicit.stop_questions'], resetTurn: 2 })], P)[0];
  ok('a conversation kept to itself is NOT exported as such: that alone says it touched a sensitive subject', !('local' in kept.codes) && !MINIMAL_FIELDS.includes('codes.local'), JSON.stringify(kept.codes));
  ok('  nor the rules their words took back, nor their reset turn', !Object.keys(kept.codes).some((k) => /^revoked|^resetTurn/.test(k)));
}
{
  // the ledger's retention window (MR-PRIV-12): with `now`, nothing past it leaves, consent or not
  const DAY = 86_400_000;
  const NOWR = CONSENT_AT + 400 * DAY;
  const rows = [row('exposure', exposure, NOWR - 181 * DAY), row('exposure', exposure, NOWR - 179 * DAY)];
  ok('with `now`, a row past the 180-day window is not exported', toResearchEvents(rows, { ...P, now: NOWR }).length === 1);
  ok('  without it, the consent and the reset decide alone (as before)', toResearchEvents(rows, P).length === 2);
  ok('  and the consent still bounds it from below', toResearchEvents([row('exposure', exposure, CONSENT_AT - 1)], { ...P, now: CONSENT_AT + DAY }).length === 0);
  const script = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'mr-research-export.mjs'), 'utf8');
  ok('the export script reads only inside the window, and passes `now` to the transformation', /const since = Math\.max\(settings\.research\.consentedAt, now - LEDGER_RETENTION_MS\);/.test(script) && /\.gte\('created_at', since\)/.test(script) && /toResearchEvents\(rows \?\? \[\], \{ studyId: study, secret, settings, now \}\)/.test(script));
}

console.log('limits and fields');
ok('validity limits name the honest ones', ['English', 'structural', 'Satisfaction is not learning', 'single', 'blind', 'Novelty'].every((w) => VALIDITY_LIMITS.some((l) => l.includes(w))), VALIDITY_LIMITS.length);
ok('validity limits are fixed', Object.isFrozen(VALIDITY_LIMITS) && VALIDITY_LIMITS.length >= 8);
ok('the minimal fields hold no id and no text field', !MINIMAL_FIELDS.some((f) => /user_id|conversation_id|content|quote|text|message|^codes\.policyVersion$|composedOf\.#/.test(f)), MINIMAL_FIELDS.filter((f) => /user_id|conversation_id|content|quote|text|message/.test(f)).join(','));
ok('the minimal fields start with the event’s own', ['v', 'study', 'participant', 'conversation', 'day', 'turn', 'kind', 'arm', 'ifr', 'policyVersion'].every((f) => MINIMAL_FIELDS.includes(f)) && Object.isFrozen(MINIMAL_FIELDS));

console.log(`\nmr-research: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
