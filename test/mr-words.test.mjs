// WHAT MR CHANGED, IN WORDS FOR THE PERSON (lib/mr/words.ts).
//
// The account sheet lists the latest adjustments, and the API sends only
// codes. These checks hold the words to three promises: every action and
// every rule that can fire has words of its own; an unknown or hostile
// trigger gets the general line and is never echoed back; and no line says
// how the person felt — the reasons are about what was said or what
// happened, never "you were frustrated".

import * as M from './.tmp/mr-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const GENERAL = M.MR_GENERAL_REASON;

// Every trigger shape the ledger can carry, for the sweeping checks below.
const ALL_TRIGGERS = [
  ...M.OBSERVATION_CODES.flatMap((c) => [`ifr.${c}`, `mr.${c}`, c, `ifr.${c}:carried`]),
  ...(M.RULES ?? []).map((r) => r.id),
  'mr.revert', 'mr.deliberate', 'user.length', 'user.carryAcross', 'none', '',
];
const ALL_REASONS = ALL_TRIGGERS.map((t) => M.triggerWords(t));
const ALL_ACTION_WORDS = M.ACTIONS.map((a) => M.actionWords(a));

console.log('\n=== actionWords: every action has its own words ===');
{
  for (const a of M.ACTIONS) {
    if (a === 'none') continue;
    const w = M.actionWords(a);
    ok(`${a} has words`, typeof w === 'string' && w.length > 3, J(w));
  }
  ok("'none' has no words — nothing was adjusted", M.actionWords('none') === '');
  const said = M.ACTIONS.filter((a) => a !== 'none').map((a) => M.actionWords(a));
  ok('no two actions say the same thing', new Set(said).size === said.length, J(said));
  ok('each starts a sentence and ends without a full stop', said.every((w) => /^[A-Z]/.test(w) && !/[.!?]$/.test(w)), J(said));
  const expected = {
    fewer_questions: 'Asked fewer questions',
    worked_example: 'Showed a worked example first',
    shorter: 'Kept replies shorter',
    direct: 'Answered directly',
    execute: 'Just did the task',
    preserve_challenge: 'Kept the quiz a quiz',
    simplify: 'Explained more simply',
    verify: 'Said what it checked',
    task_specific: 'Stuck to what you asked for',
    revert: 'Went back to normal',
    guided_discovery: 'Let you work it out',
  };
  for (const [a, w] of Object.entries(expected)) ok(`${a} → "${w}"`, M.actionWords(a) === w, M.actionWords(a));
  ok('something that is not an action has no words', M.actionWords('delete_everything') === '' && M.actionWords(undefined) === '' && M.actionWords(7) === '');
  ok('  not even a key every object has', M.actionWords('constructor') === '' && M.actionWords('__proto__') === '' && M.actionWords('toString') === '');
}

console.log('\n=== triggerWords: why, in their terms ===');
{
  const expected = {
    'ifr.explicit.direct_answer': 'because you asked for the answer',
    'ifr.explicit.stop_questions': 'because you asked it to stop asking questions',
    'ifr.observed.unproductive_questions': "because the questions weren't helping",
    'ifr.observed.repeated_confusion': "because an explanation didn't land",
    'mr.explicit.quiz': 'because you asked to be quizzed',
    'ifr.observed.routine_task': 'because it was a routine task',
    'ifr.explicit.shorter': 'because you asked for shorter replies',
  };
  for (const [t, w] of Object.entries(expected)) ok(`${t} → "${w}"`, M.triggerWords(t) === w, M.triggerWords(t));

  // the rule table is the source of every trigger a fast-loop decision carries
  const rules = M.RULES ?? [];
  ok('the policy has rules to say (lib/mr/policy.ts RULES)', rules.length > 0, rules.length);
  for (const r of rules) {
    const w = M.triggerWords(r.id);
    ok(`rule ${r.id} has words of its own`, w.startsWith('because ') && w !== GENERAL, w);
    for (const code of r.on) ok(`  and so does what fires it (${code})`, M.triggerWords(code) !== GENERAL && M.triggerWords(code) !== '', M.triggerWords(code));
    ok(`  and its action (${r.action})`, M.actionWords(r.action) !== '', r.action);
  }
  ok('a revert has words that claim nothing about why it worked', M.triggerWords('mr.revert').startsWith('because ') && M.triggerWords('mr.revert') !== GENERAL && !/help|work|better|fixed/.test(M.triggerWords('mr.revert')), M.triggerWords('mr.revert'));
  ok('the deliberative loop says the general line (it has no single observation)', M.triggerWords('mr.deliberate') === GENERAL);

  ok('matched by the code suffix, whichever family fired it', M.triggerWords('ifr.explicit.quiz') === M.triggerWords('mr.explicit.quiz') && M.triggerWords('explicit.quiz') === M.triggerWords('mr.explicit.quiz'));
  ok("an intervention id's ':carried' tail does not change the reason", M.triggerWords('ifr.explicit.stop_questions:carried') === M.triggerWords('ifr.explicit.stop_questions'));
  ok('surrounding space is not part of the code', M.triggerWords('  ifr.explicit.shorter ') === 'because you asked for shorter replies');
  ok("a setting of theirs is said as one ('user.<setting>')", M.triggerWords('user.length') === 'because of your reply-length setting' && M.triggerWords('user.carryAcross').startsWith('because you said it'));
  ok("'none' and an empty trigger have no reason", M.triggerWords('none') === '' && M.triggerWords('') === '' && M.triggerWords('   ') === '');
}

console.log('\n=== unknown triggers fall back, and are never echoed ===');
{
  const unknown = [
    'ifr.observed.something_new', 'mr.brand_new_rule', 'user.no_such_setting', 'banana', 'ifr.', 'mr..',
    'ifr.__proto__', 'mr.constructor', 'user.toString', 'constructor', 'hasOwnProperty', 'user.__proto__',
    '<img src=x onerror=alert(1)>', 'ifr.explicit.direct_answer<script>', 'I said stop asking me, this is so frustrating', 'x'.repeat(5000),
  ];
  for (const t of unknown) ok(`${J(t.slice(0, 40))} → the general line`, M.triggerWords(t) === GENERAL, M.triggerWords(t));
  for (const t of [undefined, null, 42, {}, ['ifr.explicit.quiz']]) ok(`${J(t) ?? 'undefined'} (not a string) → the general line, no throw`, M.triggerWords(t) === GENERAL);
  ok('the general line is the one the sheet promises', GENERAL === 'because of how the conversation was going');
  const hostile = 'ifr.<b>hello</b>';
  ok('nothing of the input reaches the words', !M.triggerWords(hostile).includes('hello') && !M.adjustmentWords('direct', hostile).includes('hello'));
  ok('a weak reading is never a reason of its own (it never fires a rule alone)', M.triggerWords('ifr.weak.short_reply') === GENERAL && M.triggerWords('weak.terse_run') === GENERAL);
}

console.log('\n=== no line says how the person felt ===');
{
  // A psychological state is never observed (lib/mr/types.ts). The words say
  // what was said or what happened; even their own "frustrating" is not
  // repeated back as a finding about them.
  const FEELING = /frustrat|annoy|upset|angry|anger|irritat|stress|anxious|anxiety|impatien|overwhelm|bored|struggl|confus|you (were|felt|seemed|got|are) |you're /i;
  const every = [...ALL_REASONS, ...ALL_ACTION_WORDS];
  const bad = every.filter((w) => FEELING.test(w));
  ok('not one action or reason names a feeling or a state of theirs', bad.length === 0, J(bad));
  ok("their word 'frustrating' is not turned into 'you were frustrated'", !FEELING.test(M.triggerWords('ifr.explicit.frustration')) && M.triggerWords('ifr.explicit.frustration').startsWith('because you said'), M.triggerWords('ifr.explicit.frustration'));
  ok("their 'I don't get it' is said as theirs, not as a diagnosis", M.triggerWords('ifr.explicit.confused').startsWith('because you said'), M.triggerWords('ifr.explicit.confused'));
  ok('what MR observed is about the conversation, not about them', ['observed.unproductive_questions', 'observed.repeated_confusion', 'observed.verbose_replies', 'observed.question_streak'].every((c) => !/because you /.test(M.triggerWords(`ifr.${c}`))), J(['observed.unproductive_questions', 'observed.repeated_confusion'].map((c) => M.triggerWords(`ifr.${c}`))));
  ok('nothing claims they improved or learned', every.every((w) => !/improv|learn(ed|t)|master|better at|progress/i.test(w)), J(every.filter((w) => /improv|learn|master|progress/i.test(w))));
}

console.log('\n=== content-free: codes never reach the page ===');
{
  const every = [...ALL_REASONS, ...ALL_ACTION_WORDS];
  ok('no words carry a code (no underscores, no ifr./mr./explicit.)', every.every((w) => !/_|\bifr\.|\bmr\.|explicit\.|observed\.|weak\./.test(w)), J(every.filter((w) => /_|ifr\.|mr\./.test(w))));
  ok('every reason is a "because" clause or nothing', ALL_REASONS.every((w) => w === '' || w.startsWith('because ')), J(ALL_REASONS.filter((w) => w && !w.startsWith('because '))));
  ok('the words come from a fixed set (no reason is built from its input)', new Set(ALL_REASONS).size <= M.OBSERVATION_CODES.length + 4, new Set(ALL_REASONS).size);
  ok('the same trigger always gives the same words', ALL_TRIGGERS.every((t) => M.triggerWords(t) === M.triggerWords(t)));
}

console.log('\n=== one line for the list ===');
{
  ok('action, then why', M.adjustmentWords('fewer_questions', 'ifr.observed.unproductive_questions') === "Asked fewer questions because the questions weren't helping");
  ok('an unknown trigger still reads as a sentence', M.adjustmentWords('shorter', 'mr.who_knows') === `Kept replies shorter ${GENERAL}`);
  ok("'none' is not a line at all", M.adjustmentWords('none', 'ifr.explicit.quiz') === '');
  ok("a trigger of 'none' leaves the action on its own", M.adjustmentWords('revert', 'none') === 'Went back to normal');
  ok('an action that is not one is not a line', M.adjustmentWords('drop_tables', 'ifr.explicit.quiz') === '');
  ok('standing: in every conversation', M.adjustmentReachWords({ standing: true, conversation: true }) === 'in every conversation');
  ok('conversation: for the rest of it', M.adjustmentReachWords({ standing: false, conversation: true }) === 'for the rest of that conversation');
  ok('a few turns: nothing more to say', M.adjustmentReachWords({ standing: false, conversation: false }) === '' && M.adjustmentReachWords({}) === '');
  ok('only a plain true counts', M.adjustmentReachWords({ standing: 'true', conversation: 1 }) === '');
}

console.log(`\nmr-words: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
