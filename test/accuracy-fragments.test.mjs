// Accuracy: fragments of a longer expression are never checked as if whole.
//
// The failure behind this suite, from the presentation audit: asked to
// "Prove by induction that 1 + 2 + ... + n = n(n+1)/2", the turn plan told the
// reply
//
//   - + n = n(n+1)/2 does not hold (at n = -3.71, the left side is -3.71 …)
//   These results are checked: state them as settled, without hedging.
//
// The full stops of the ellipsis had ended the run of mathematics at
// "1 + 2 +", and the tail "+ n = n(n+1)/2" was checked as an identity. A true
// identity was certified false, and a reply that believed the engine would
// either contradict a correct statement or spend paragraphs reconciling the
// "checked" line with its own proof.
//
// So the assertions here are of two kinds, as in accuracy.test.mjs:
//   - a sum, sequence or chain the engine cannot see whole produces NOTHING
//     (no computed line, no claim, no problem posed) — whichever way the
//     ellipsis was typed, and whether the person or the reply wrote it
//   - the ordinary cases next to them are still checked exactly as before
// Every check goes through planTurn, the same planner the chat route calls,
// or through extract + checkClaim, which is what checkDraft runs on a reply.

import { extract } from './.tmp/claims.mjs';
import { checkClaim, computePosed, describe } from './.tmp/checker.mjs';
import { planTurn, checkDraft } from './.tmp/accuracy.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const COMPUTED = /=== Computed by Socria's math engine/;
const plan = (text) => planTurn({ lastUserText: text, history: [], withhold: false });
/** What the plan would put in front of the model: the computed lines and their claims, as text. */
const said = (p) => JSON.stringify({ block: p.block, computed: p.computed.map((c) => c.result), theirs: p.theirs.map((v) => `${describe(v.claim)} ${v.status}`) });
/** A turn that computes nothing and checks nothing. */
const silent = (text) => {
  const p = plan(text);
  return !COMPUTED.test(p.block) && !p.computed.some((c) => c.result) && p.theirs.length === 0;
};
/** Every claim a reply makes, checked. */
const replyVerdicts = (text) => extract(text, { role: 'reply' }).claims.map((c) => checkClaim(c));
const refutedIn = (text) => replyVerdicts(text).filter((v) => v.status === 'refuted').map((v) => describe(v.claim));

console.log('=== P0: the induction prompt computes nothing ===');
{
  const q = 'Prove by induction that 1 + 2 + ... + n = n(n+1)/2';
  const p = plan(q);
  ok('the harness prompt produces no computed line', !COMPUTED.test(p.block), said(p));
  ok('…and no "does not hold" anywhere in the plan', !/does not hold/.test(p.block), p.block);
  ok('…and no identity is posed from the tail "+ n"', !extract(q, { role: 'person' }).posed.some((x) => x.kind === 'identity'), JSON.stringify(extract(q, { role: 'person' }).posed));

  // The same sum, every way an ellipsis is typed.
  const forms = {
    'Unicode …': 'Prove by induction that 1 + 2 + … + n = n(n+1)/2',
    'spaced . . .': 'Prove by induction that 1 + 2 + . . . + n = n(n+1)/2',
    'midline ⋯': 'Prove that 1 + 2 + ⋯ + n = n(n+1)/2',
    '\\cdots in prose': 'Prove that 1 + 2 + \\cdots + n = n(n+1)/2',
    '\\ldots in prose': 'Prove that 1 + 2 + \\ldots + n = n(n+1)/2',
    '\\dots in prose': 'Prove that 1 + 2 + \\dots + n = n(n+1)/2',
    '\\cdots in $…$': 'Prove that $1 + 2 + \\cdots + n = \\frac{n(n+1)}{2}$',
    '\\ldots in \\(…\\)': 'Prove that \\(1 + 2 + \\ldots + n = \\frac{n(n+1)}{2}\\)',
    '\\cdots in $$…$$': 'Prove that $$1 + 2 + \\cdots + n = \\frac{n(n+1)}{2}$$',
    'only the \\cdots in $…$': 'Prove that 1 + 2 + $\\cdots$ + n = n(n+1)/2',
  };
  for (const [name, text] of Object.entries(forms)) ok(`a sum written with ${name} is skipped`, silent(text), said(plan(text)));

  // A false sum with an ellipsis is skipped too: the engine cannot see the
  // terms, so it has no business saying either way.
  ok('a FALSE sum with an ellipsis is also left alone, not "verified"', silent('Prove that 1 + 2 + ... + n = n^2'), said(plan('Prove that 1 + 2 + ... + n = n^2')));
}

console.log('=== P0: what sits next to it is still checked ===');
{
  const a = plan('Show that 1+2+3 = 6');
  ok("'1+2+3 = 6' is still checked, and correct", a.theirs.length === 1 && a.theirs[0].status === 'verified', said(a));
  const wrong = plan('Is 1+2+3 = 7?');
  ok("'1+2+3 = 7' is still caught", wrong.theirs.some((v) => v.status === 'refuted'), said(wrong));
  const id = plan('Prove that x^2 - 1 = (x-1)(x+1)');
  ok("'x^2 - 1 = (x-1)(x+1)' is still verified", COMPUTED.test(id.block) && /x\^2 - 1 = \(x-1\)\(x\+1\) holds/.test(id.block), id.block);
  const notId = plan('Prove that x^2 + 1 = (x+1)^2');
  ok('a false identity with no ellipsis is still reported false', /does not hold/.test(notId.block), notId.block);
  const neg = plan('Is -sin(x) = sin(-x)?');
  ok('a left side that opens on a minus is whole, and still checked', /holds/.test(neg.block), neg.block);
  ok('a word between an ellipsis and the formula keeps the claim', refutedIn('Hmm... so 1 + 2 = 4.').length === 1, JSON.stringify(refutedIn('Hmm... so 1 + 2 = 4.')));
  const after = replyVerdicts('Wait… Then x^2 - 1 = (x-1)(x+1) always.');
  ok('an ellipsis that ends a sentence does not swallow the next one', after.length === 1 && after[0].status === 'verified', JSON.stringify(after.map((v) => v.status)));
}

console.log('=== near-misses: sums and sequences a reply writes ===');
{
  // Each of these was a refutation before the fix: the engine "correcting" a right reply.
  const cases = {
    'arithmetic sum with ...': 'So 1 + 2 + 3 + ... + 100 = 5050.',
    'odd numbers with …': 'The sum 1 + 3 + 5 + … + (2n-1) = n^2 for all n.',
    'alternating sum (tail "- n")': 'For all even n, 1 - 2 + 3 - ... - n = -n/2 always.',
    'even numbers': '2 + 4 + 6 + ... + 2n = n(n+1) for every n.',
    'induction step': 'Assume 1 + 2 + ... + k = k(k+1)/2. Then 1 + 2 + ... + k + (k+1) = k(k+1)/2 + (k+1) = (k+1)(k+2)/2.',
    'a sequence 2, 4, 6, ..., 2n': 'The terms 2, 4, 6, ..., 2n = 2n for all n add to n(n+1).',
    'a repeating decimal': 'So 1/3 = 0.333... exactly.',
  };
  for (const [name, text] of Object.entries(cases)) ok(`reply: ${name} is not refuted`, refutedIn(text).length === 0, JSON.stringify(refutedIn(text)));

  const p = plan('Prove that 2 + 4 + 6 + ... + 2n = n(n+1)');
  ok('person: 2 + 4 + … + 2n = n(n+1) computes nothing', silent('Prove that 2 + 4 + 6 + ... + 2n = n(n+1)'), said(p));
  ok('person: an alternating sum with a trailing "- n" computes nothing', silent('Prove that 1 - 2 + 3 - ... - n = -n/2 for all even n'), said(plan('Prove that 1 - 2 + 3 - ... - n = -n/2 for all even n')));

  // The draft check is what would rewrite a reply: it must leave an induction proof alone.
  const ctx = plan('Prove by induction that 1 + 2 + ... + n = n(n+1)/2').context;
  const draft = 'Base case: n = 1 gives 1 = 1(2)/2. Inductive step: assume 1 + 2 + ... + k = k(k+1)/2. Then 1 + 2 + ... + k + (k+1) = k(k+1)/2 + (k+1) = (k+1)(k+2)/2, which is the formula for n = k + 1.';
  const d = checkDraft(draft, ctx);
  ok('the draft check leaves an induction proof alone', d.refuted.length === 0 && !d.retryNote, JSON.stringify({ refuted: d.refuted.map((v) => describe(v.claim)), note: d.retryNote }));
}

console.log('=== near-misses: a dangling operator after a split ===');
{
  // No ellipsis at all: a line break inside a sum leaves "+ n = …" on its own line.
  const split = 'Show that 1 + 2 + 3 +\n+ n = n(n+1)/2 for all n';
  ok('a sum broken across lines: the tail "+ n = …" is not refuted', refutedIn(split).length === 0, JSON.stringify(refutedIn(split)));
  ok('…and the person side poses and claims nothing from it', silent(split), said(plan(split)));
  const minus = 'For all n, 1 - 2 + 3 - 4 +\n- n = -n/2 always.';
  ok('a continued line that opens on a minus is a fragment too', refutedIn(minus).length === 0, JSON.stringify(refutedIn(minus)));
  const rule = 'Next part.\n\n---\n\nd/dx csc(x) = csc(x)cot(x)';
  ok('a horizontal rule does not hide the next line from the check', refutedIn(rule).length === 1, JSON.stringify(refutedIn(rule)));
  const bullet = 'Two facts:\n- d/dx sin(x) = cos(x)\n+ d/dx cos(x) = sin(x)';
  ok('ordinary bullets ("- ", "+ ") are still bullets, and still checked', refutedIn(bullet).length === 1 && replyVerdicts(bullet).length === 2, JSON.stringify(replyVerdicts(bullet).map((v) => `${describe(v.claim)} ${v.status}`)));
  const display = 'We need\n$$\n1 + 2 + 3 + \\\\\n+ n = \\frac{n(n+1)}{2} \\text{ for all } n\n$$';
  ok('the same break inside a displayed block is not refuted', refutedIn(display).length === 0, JSON.stringify(refutedIn(display)));
  // The second lock: computePosed refuses a posed identity with a fragmentary side.
  const forced = computePosed({ kind: 'identity', left: '+ n', right: 'n(n+1)/2', text: '+ n = n(n+1)/2' });
  ok('computePosed never settles an identity whose side opens on "+"', forced.result === null, JSON.stringify(forced));
  const forced2 = computePosed({ kind: 'identity', left: 'x^2 +', right: 'x', text: '' });
  ok('…or ends on an operator', forced2.result === null, JSON.stringify(forced2));
  ok('…and a whole identity is still computed', /holds/.test(computePosed({ kind: 'identity', left: 'x^2 - 1', right: '(x-1)(x+1)', text: '' }).result ?? ''));
}

console.log('=== review: a tail after a break the tokenizer does not call an ellipsis ===');
{
  // "1 - 2 + 3 - 4 + .. - 2n = -n" is true for every n. Two full stops, "etc"
  // or "and so on" are not marked as an ellipsis, and the leading minus made
  // the tail "- 2n = -n" look whole: it was refuted and, for "Prove that",
  // put in front of the model as "does not hold".
  const tails = {
    'two full stops': 'For all n, 1 - 2 + 3 - 4 + .. - 2n = -n always.',
    '"etc"': 'For all n, 1 - 2 + 3 - 4 + etc - 2n = -n always.',
    '"and so on"': 'For all n, 1 - 2 + 3 - 4 + and so on - 2n = -n always.',
  };
  for (const [name, text] of Object.entries(tails)) {
    ok(`reply: a minus tail after ${name} is not refuted`, refutedIn(text).length === 0, JSON.stringify(refutedIn(text)));
    const q = `Prove that ${text.replace(/^For all n, | always\.$/g, '')}`;
    ok(`person: "${q}" computes nothing`, silent(q), said(plan(q)));
  }
  // A line that ends on an ellipsis continues the formula just as a line that
  // ends on an operator does: its "+ " or "- " is not a list bullet.
  const lines = {
    '"+" after "+ ..."': 'For all n:\n1 + 2 + 3 + ...\n+ n = n(n+1)/2 always.',
    '"-" after "+ ..."': 'For all n:\n1 - 2 + 3 - 4 + ...\n- 2n = -n always.',
    '"+" after "\\cdots"': 'For all n:\n1 + 2 + 3 + \\cdots\n+ n = n(n+1)/2 always.',
  };
  for (const [name, text] of Object.entries(lines)) ok(`reply: a line opening on ${name} is not refuted`, refutedIn(text).length === 0, JSON.stringify(refutedIn(text)));
  // What sits next to the fix is still read.
  ok('a word between two whole claims still lets the second be checked', refutedIn('So 2 + 2 = 4 and then 3 - 1 = 5.').length === 1, JSON.stringify(refutedIn('So 2 + 2 = 4 and then 3 - 1 = 5.')));
  ok('a leading minus after a whole formula is still checked', refutedIn('We have x = 2, and -3 + 1 = 2.').length === 1, JSON.stringify(refutedIn('We have x = 2, and -3 + 1 = 2.')));
  const bullets = 'The options are these…\n- 2 + 2 = 5\n- 3 + 3 = 6';
  ok('a prose line ending on an ellipsis does not swallow the bullets after it', refutedIn(bullets).length === 1, JSON.stringify(refutedIn(bullets)));
}

console.log('=== near-misses: chains and inequalities ===');
{
  // "x = y = 0 always": the link y = 0 pins y down; it is not an identity in y.
  ok("'x = y = 0 always' refutes nothing", refutedIn('Here x = y = 0 always.').length === 0, JSON.stringify(refutedIn('Here x = y = 0 always.')));
  ok("'the answer is y = 3 always' claims no identity", !replyVerdicts('The answer is y = 3 always.').some((v) => v.claim.kind === 'equal'));
  const pyth = replyVerdicts('sin^2 x + cos^2 x = 1 always.');
  ok('…while sin²x + cos²x = 1 always is still verified', pyth.length === 1 && pyth[0].status === 'verified', JSON.stringify(pyth.map((v) => v.status)));
  // a = b = c in distinct names: nothing to compute, nothing claimed.
  ok("'a = b = c' claims nothing", replyVerdicts('We get a = b = c, so a = c.').length === 0, JSON.stringify(replyVerdicts('We get a = b = c, so a = c.').map((v) => describe(v.claim))));
  // A real chain of rewrites is still read link by link.
  const chain = replyVerdicts('x^2 - 1 = (x - 1)(x + 1) = x^2 + 1');
  ok('a chain of rewrites: the right link verified, the wrong link refuted', chain.length === 2 && chain[0].status === 'verified' && chain[1].status === 'refuted', JSON.stringify(chain.map((v) => `${describe(v.claim)} ${v.status}`)));
  // Chained and ASCII inequalities: never an equation, never a claim.
  for (const text of ['If 0 < x < 1 then x^2 < x.', 'For all x in [0, 1], 0 <= x^2 <= 1.', 'Prove that x^2 + 1 >= 2x for all x', 'Prove that a + b >= 2sqrt(ab)', 'So x >= 2 always.']) {
    ok(`inequality claims nothing: ${text}`, replyVerdicts(text).length === 0 && silent(text), JSON.stringify({ reply: replyVerdicts(text).map((v) => describe(v.claim)), plan: said(plan(text)) }));
  }
  // An equality after an inequality is the writer's own equality, read as written.
  const mixed = replyVerdicts('For all x, 0 <= x^2 = x*x.');
  ok('the equality inside "0 <= x^2 = x*x" is still read, and true', mixed.length === 1 && mixed[0].status === 'verified', JSON.stringify(mixed.map((v) => `${describe(v.claim)} ${v.status}`)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
