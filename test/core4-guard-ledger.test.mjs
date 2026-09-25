// What stands between a draft and the person, and what Core 4 remembers.
//
//   Answer Guard 2.0     overreach AND underhelp, novelty, voice
//   the stream gate      questions held until the budget decides
//   the novelty gate     already-considered matching
//   the Reasoning Ledger attribution enforced in code; corrections; Logos shape
//   capability evidence  events, counted; independence only across conversations
//   the turn trace       content-free
//   Verify Mode          exact arithmetic; the expected answer never shown
//
// Pure modules only. The same paths through the real route are in
// core4-turn-e2e.test.mjs.

import { guardStructure, sanitizeGuard2, buildGuard2Input, looksWorked, givesThenAsks, leaksHidden, coherent } from './.tmp/guard2.mjs';
import { SentenceGate } from './.tmp/stream-gate.mjs';
import { classify, similarity, gateCandidates } from './.tmp/considered.mjs';
import { scrubPII, grounding, entriesFromPerson, entriesFromSocria, mergeEntries, disputeTurn, supersedeRestated, linksForTurn, consideredView, toLogosGraph } from './.tmp/ledger.mjs';
import { summarize, evidenceFromTurn, assistanceOf } from './.tmp/capability.mjs';
import { buildTrace } from './.tmp/trace.mjs';
import { exactCheck, sanitizeCheck, renderCheck, hiddenValues, computeAsked, statedSlips } from './.tmp/verify.mjs';
import { stripSycophanticOpener, sentencesOf, deleteSentences } from './.tmp/questions.mjs';
import { EMPTY_STATE } from './.tmp/state.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const dec = (type, maxQuestions = 0, extra = {}) => ({
  type, reasonCode: 'test', reason: 'test', intendedOutcome: '', humanWorkPreserved: null, aiWorkPerformed: '', confidence: 0.8,
  guardRequired: true, maxQuestions, objective: '', avoid: [], switchedFrom: null, maxTokens: 600, ...extra,
});
const alloc = (mode, withhold = null) => ({ mode, humanWork: [], aiWork: [], withhold, announce: false, reasonCode: 'test', rationale: 'test', confidence: 0.8 });
const PRACTICE = { what: 'the answer', reason: 'practice_goal', evidence: 'I want to learn this', source: 'message' };

console.log('=== OVERREACH is policed only when something is held back ===');
{
  const leak = "Remember that (fg)' = f'g + fg'. So with f = x^2 and g = sin x you get 2x·sin x + x^2·cos x. Now try it yourself.";
  const g = guardStructure({ decision: dec('HINT'), allocation: alloc('HUMAN_PRACTICES', PRACTICE), draft: leak, considered: [] });
  ok('THE PRODUCT RULE: gives-then-asks is caught', g.findings.some((f) => f.code === 'gives_then_asks'), JSON.stringify(g.findings));
  ok('  and sent back for regeneration, more agency', !!g.retryNote && g.action === 'MODIFY_FOR_MORE_AGENCY');
  const free = guardStructure({ decision: dec('EXPLAIN'), allocation: alloc('AI_EXPLAINS'), draft: leak.replace(' Now try it yourself.', ''), considered: [] });
  ok('the same content, with nothing held back, passes', free.action === 'ALLOW', JSON.stringify(free));
  const worked = '1. Differentiate x^2.\n2. Differentiate sin x.\n3. Combine them with the product rule.';
  ok('a HINT that works the problem is caught', guardStructure({ decision: dec('HINT'), allocation: alloc('HUMAN_PRACTICES', PRACTICE), draft: worked, considered: [] }).findings.some((f) => f.code === 'worked_solution'));
  // Run 2 (debugging-005, debugging-002): an analogous worked example, or a
  // general method, is not their problem worked (council D8, target-aware).
  const target = 'def find_first_at_least(nums, target):\n    lo, hi = 0, len(nums)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if nums[mid] < target: lo = mid\n        else: hi = mid\n    return lo\nfor [1, 4, 4, 7, 9] and target 5 it loops';
  const analog = '1. Take a tiny list like [2, 3] and a target of 3.\n2. Print lo, hi and mid at the top of each iteration.\n3. Look for a state that repeats.';
  ok('an analogous worked method under a withhold passes', !guardStructure({ decision: dec('VERIFY'), allocation: alloc('AI_VERIFIES', PRACTICE), draft: analog, considered: [], target }).findings.some((f) => f.code === 'worked_solution'));
  const theirs = '1. With nums = [1, 4, 4, 7, 9] and target 5, find_first_at_least starts lo=0, hi=5.\n2. mid=2, nums[2]=4 < 5, so lo = mid = 2.\n3. Change lo = mid to lo = mid + 1 and it returns 3.';
  ok('working THEIR problem under a withhold is still caught', guardStructure({ decision: dec('VERIFY'), allocation: alloc('AI_VERIFIES', PRACTICE), draft: theirs, considered: [], target }).findings.some((f) => f.code === 'worked_solution'));
  ok('the same steps in an EXPLAIN with nothing withheld pass', guardStructure({ decision: dec('EXPLAIN'), allocation: alloc('AI_EXPLAINS'), draft: worked, considered: [] }).action === 'ALLOW');

  const hidden = guardStructure({
    decision: dec('VERIFY'), allocation: alloc('AI_VERIFIES', { ...PRACTICE, what: 'the corrected final answer' }),
    draft: 'Not quite — the sign flips in your second line. The answer should be 42. Recheck that step and you will get there.',
    considered: [], hidden: ['42'],
  });
  ok('Verify Mode\'s private value is removed if it leaks', hidden.findings.some((f) => f.code === 'hidden_value') && !/42/.test(hidden.revised ?? ''), JSON.stringify(hidden));
  ok('  and the rest of the feedback kept', /sign flips/.test(hidden.revised ?? ''));
  ok('a withheld turn still consults the model for what structure cannot see',
     guardStructure({ decision: dec('HINT'), allocation: alloc('HUMAN_PRACTICES', PRACTICE), draft: 'Look at which two functions are multiplied together here.', considered: [] }).needsModel === true);
  ok('a free turn with nothing uncertain does not', guardStructure({ decision: dec('ANSWER'), allocation: alloc('AI_EXECUTES'), draft: 'It was founded in 1922 and renamed in 2000.', considered: [] }).needsModel === false);
}

console.log('\n=== UNDERHELP ===');
{
  const g = guardStructure({ decision: dec('CONTRIBUTE', 0), allocation: alloc('SHARED_REASONING'), draft: 'The funding gap is the variable that matters most here. What do you think?', considered: [] });
  ok('a question over budget is removed, the substance kept', g.revised === 'The funding gap is the variable that matters most here.', JSON.stringify(g));
  ok('  as MODIFY_FOR_MORE_HELP', g.action === 'MODIFY_FOR_MORE_HELP');
  const only = guardStructure({ decision: dec('ANSWER', 0), allocation: alloc('AI_EXECUTES'), draft: 'What have you tried? What do you think the answer is?', considered: [] });
  ok('a reply that is only questions, when the machine should answer → OVERRIDE_WITH_DIRECT_ANSWER', only.action === 'OVERRIDE_WITH_DIRECT_ANSWER' && !!only.retryNote);
  const defl = guardStructure({ decision: dec('ANSWER', 0), allocation: alloc('AI_EXECUTES'), draft: 'It really depends on your goals and what you value most in a school.', considered: [] });
  ok('"it depends on your goals" to a direct request → OVERRIDE_WITH_DIRECT_ANSWER', defl.action === 'OVERRIDE_WITH_DIRECT_ANSWER', JSON.stringify(defl));
  const offer = guardStructure({ decision: dec('ANSWER', 0), allocation: alloc('AI_EXECUTES'), draft: 'It was renamed McCombs in 2000. Let me know if you want more detail on its history.', considered: [] });
  ok('a closing offer is removed', offer.revised === 'It was renamed McCombs in 2000.', JSON.stringify(offer));
  const one = guardStructure({ decision: dec('CLARIFY', 1), allocation: alloc('AI_EXECUTES'), draft: 'Exit code 1 only says the build failed. What is the first red line above it?', considered: [] });
  ok('one allowed question passes untouched', one.action === 'ALLOW', JSON.stringify(one));
  const disg = guardStructure({ decision: dec('CONTRIBUTE', 0), allocation: alloc('SHARED_REASONING'), draft: 'The funding gap is the real constraint here. It might be worth thinking about what investors in Austin actually fund.', considered: [] });
  ok('a disguised question counts against the budget', disg.findings.some((f) => f.code === 'over_budget'), JSON.stringify(disg.findings));
}

console.log('\n=== VOICE ===');
{
  const g = guardStructure({ decision: dec('ANSWER'), allocation: alloc('AI_EXECUTES'), draft: 'Great question! The school took the McCombs name in 2000.', considered: [] });
  ok('a sycophantic opener is removed, the answer kept', g.revised === 'The school took the McCombs name in 2000.', JSON.stringify(g));
  ok('stripSycophanticOpener keeps the rest of the sentence', stripSycophanticOpener('Great question — the answer is 42.') === 'The answer is 42.', stripSycophanticOpener('Great question — the answer is 42.'));
  ok('and leaves ordinary openers alone', stripSycophanticOpener('Good morning to the rest of it.') === 'Good morning to the rest of it.');
}

console.log('\n=== NOVELTY: already considered is not new ===');
{
  const considered = ['they raised: hiring a second engineer would slow the launch', 'they ruled out: raising prices before the pilot ends'];
  const draft = 'Have you considered that hiring another engineer could slow down the launch? The part nobody has priced is the pilot customer churning if onboarding slips.';
  const g = guardStructure({ decision: dec('CONTRIBUTE'), allocation: alloc('SHARED_REASONING'), draft, considered });
  ok('the re-raised objection is caught', g.findings.some((f) => f.side === 'novelty'), JSON.stringify(g.findings));
  ok('  and removed; the new point survives', !/hiring another engineer/.test(g.revised ?? '') && /pilot customer churning/.test(g.revised ?? ''), g.revised);
  const all = guardStructure({ decision: dec('CONTRIBUTE'), allocation: alloc('SHARED_REASONING'), draft: 'Hiring a second engineer would slow down your launch.', considered });
  ok('a statement that overlaps is NOT deleted on word overlap alone — the model judges it', !all.retryNote && all.needsModel && all.novelty.some((v) => v.verdict === 'UNCERTAIN'), JSON.stringify(all));
  const formula = guardStructure({ decision: dec('ANSWER'), allocation: alloc('AI_ASSISTS'), draft: 'Use NETWORKDAYS.INTL, which takes the weekend as an argument: `=NETWORKDAYS.INTL(A2,B2,7,Holidays!$A$2:$A$40)`.', considered: ['NETWORKDAYS assumes a Saturday–Sunday weekend'] });
  ok('pilot finding 4: the correct formula is never deleted for naming the ruled-out function', !formula.revised && !formula.retryNote, JSON.stringify(formula));
  ok('lexical matching sees through inflection', classify('Hiring more engineers slows the launch', ['hiring a second engineer would slow the launch']).verdict === 'REDUNDANT');
  ok('an unrelated point is NOVEL', classify('Onboarding time is the constraint', considered).verdict === 'NOVEL');
  ok('a partial overlap is UNCERTAIN (for the model to judge)', classify('The launch date matters more than pricing', considered).verdict !== 'REDUNDANT');
  ok('similarity is symmetric-ish and bounded', similarity('a b c', '') === 0 && similarity('launch pricing pilot', 'launch pricing pilot') > 0.9);
  ok('questions and perspective sentences are candidates', gateCandidates('One risk is churn. It is sunny. What about pricing?').length === 2);
  ok('building past what they covered is not a re-raise', gateCandidates('You already ruled out raising prices. The remaining lever is support load.', true).length === 1);
  const ans = guardStructure({ decision: dec('ANSWER'), allocation: alloc('HUMAN_LEADS'), draft: 'Raising prices before the pilot ends would hurt trust. Separately, the support load in launch week is unplanned.', considered: ['they ruled out: raising prices before the pilot ends'] });
  ok('an answer given while thinking together is gated too (sent to the model check)', ans.needsModel && ans.novelty.some((v) => v.verdict === 'UNCERTAIN'), JSON.stringify(ans));
  const fact = guardStructure({ decision: dec('ANSWER'), allocation: alloc('AI_EXECUTES'), draft: 'Raising prices before the pilot ends would breach the pilot contract.', considered: ['they ruled out: raising prices before the pilot ends'] });
  ok('an information answer is not', fact.action === 'ALLOW');
}

console.log('\n=== deletions never break the reply (pilot finding 1) ===');
{
  const reply = 'Here is my view.\n\n**Revenue.** Exempting 22% of crossings cuts gross by a quarter. That uncovers the pledge.\n\n**Congestion.** The exempted classes respond least to price.';
  ok('bold lead-ins stay with their sentence', sentencesOf(reply).some((x) => x.startsWith('**Revenue.**')) && !sentencesOf(reply).some((x) => x.startsWith('** ')));
  ok('decimals do not split a sentence', sentencesOf('85 ft·lb × 1.3558 = 115.2 N·m — set it to 115.').length === 1);
  const d1 = deleteSentences(reply, ['Exempting 22% of crossings cuts gross by a quarter.']);
  ok('deleting one sentence leaves the markdown intact', !/(^|\n)\*\* /.test(d1) && d1.includes('**Revenue.** That uncovers the pledge.'), JSON.stringify(d1));
  const d2 = deleteSentences(reply, ['Exempting 22% of crossings cuts gross by a quarter.', 'That uncovers the pledge.']);
  ok('a header left with nothing under it goes too', !d2.includes('Revenue') && d2.includes('**Congestion.**'), JSON.stringify(d2));
  ok('a quote that includes the bold lead-in still finds its sentence', !deleteSentences(reply, ['**Revenue.** Exempting 22% of crossings cuts gross by a quarter.']).includes('cuts gross'));
  ok('a short exact sentence is deletable', deleteSentences('Recheck the sign. It is 395.', ['It is 395.']) === 'Recheck the sign.');
  ok('a short fragment cannot take an unrelated sentence', deleteSentences('The launch is in March and nothing else matters here.', ['March']) === 'The launch is in March and nothing else matters here.');
  ok('code blocks are never touched', deleteSentences('Use this.\n```js\nconst a = 1. \n```\nDone here now.', ['const a = 1.']).includes('const a = 1.'));
}

console.log('\n=== the novelty gate deletes only what can be RAISED (pilot finding 2) ===');
{
  const ctx = { conversationId: 'c9', projectId: null, turn: 1, now: 1 };
  const said = 'Model says an 18% drop. $40M a year is pledged to the bus frequency program. One objection is that retail diverts to suburban malls.';
  const es = entriesFromPerson([
    { kind: 'evidence', text: '$40M a year is pledged to the bus frequency program', quote: '$40M a year is pledged to the bus frequency program', stance: 'asserts', reason: '' },
    { kind: 'objection', text: 'retail diverts to suburban malls', quote: 'retail diverts to suburban malls', stance: 'entertains', reason: '' },
  ], said, ctx);
  const v = consideredView(es, { focus: 'cordon charge', conversationId: 'c9', projectId: null });
  ok('the view still SHOWS the facts they hold', v.lines.some((l) => /\$40M/.test(l)));
  ok('but the gate only holds what can be raised', v.gate.length === 1 && /retail/.test(v.gate[0]), JSON.stringify(v.gate));
  const g = guardStructure({ decision: dec('ANSWER'), allocation: alloc('HUMAN_LEADS'), draft: 'Exempting commercial traffic takes a quarter of gross, which leaves less than the $40M a year pledged to the bus frequency program. Retail diverts to suburban malls, too.', considered: v.gate });
  ok('using their fact in an argument survives', /\$40M/.test(g.revised ?? 'Exempting commercial traffic takes a quarter of gross, which leaves less than the $40M a year pledged to the bus frequency program.'), JSON.stringify(g));
  ok('re-raising their objection is sent to the model check', g.needsModel && g.novelty.some((v) => v.verdict !== 'NOVEL' && /suburban/.test(v.sentence)), JSON.stringify(g));
}

console.log('\n=== council D8: what the guard may and may not do ===');
{
  ok('a hidden 4.2 is not found in 14.2 or 4.25', leaksHidden('The effect is 14.2 points, or 4.25 on the log scale.', ['4.2']).length === 0);
  ok('but is found as a value', leaksHidden('Your estimate should be 4.2 points.', ['4.2']).length === 1);
  ok('and 395 matches 395 but not 3950', leaksHidden('It is 3950 in total.', ['395']).length === 0 && leaksHidden('It is 395.', ['395']).length === 1);
  const tool = guardStructure({ decision: dec('ANSWER'), allocation: alloc('AI_EXECUTES'), draft: 'I searched the docs to confirm this. The default TTL for a Redis key is no expiry: keys persist until deleted or evicted.', considered: [] });
  ok('an unbacked "I searched" is removed, the answer kept', tool.revised && !/searched/.test(tool.revised) && /no expiry/.test(tool.revised), JSON.stringify(tool));
  const trait = guardStructure({ decision: dec('ANSWER'), allocation: alloc('AI_EXECUTES'), draft: "You're clearly a beginner, so let's keep it simple. A list is ordered and a set is not, and set lookups are constant time on average.", considered: [] });
  ok('an inference stated as fact about the person is removed', trait.revised && !/beginner/.test(trait.revised), JSON.stringify(trait));
  ok('a reply that would lose over a quarter of its substance is not shipped edited', !coherent('A long first sentence with most of the substance in it here. Short.', 'Short.'));
  ok('trailing-question removal is not blocked by the size floor', coherent('Short point here. What do you think?', 'Short point here.', false));
  const comp = guardStructure({ decision: dec('EXPLAIN'), allocation: alloc('AI_EXPLAINS'), draft: 'Set lookups are constant time on average because they hash. Does that make sense?', considered: [] });
  ok('"Does that make sense?" is always stripped', comp.revised === 'Set lookups are constant time on average because they hash.', JSON.stringify(comp));
  const nv = guardStructure({ decision: dec('VERIFY'), allocation: alloc('AI_VERIFIES'), draft: 'Look at the second line again and compare the signs.', considered: [] });
  ok('a VERIFY with no verdict is sent back', nv.findings.some((f) => f.code === 'no_verdict') && !!nv.retryNote);
}

console.log('\n=== council D13: Verify Mode only checks what the person posed ===');
{
  ok('an expression from the person, after "what is"', exactCheck('What is 17 * 23 + 4?', 'I got 395')?.verdict === 'correct');
  ok('the FINAL stated value is compared, not any number', exactCheck('What is 17 * 23 + 4?', 'I did 17*23 = 391 then + 4 so the answer is 395')?.verdict === 'correct');
  ok('a date is not arithmetic', exactCheck('What is 2026-03-14 minus 7 days?', 'March 7') === null);
  ok('a version is not arithmetic', exactCheck('What is the diff between 1.2.3 and 1.2.10?', 'the second is newer') === null);
  ok('a dose is not arithmetic', exactCheck('What is 5 mg x 3 per day?', '15 mg') === null);
  ok('an unanchored number in the prose is not a problem', exactCheck('We ran 3 trials of 20 each, the harmonic sum was 1 + 1/2 + 1/3.', 'my proof holds') === null);
  ok('computeAsked evaluates what they asked', computeAsked('Compute 17*23.')?.value === '391');
  ok('and nothing when nothing was posed', computeAsked('How do I compute a moving average in pandas?') === null);

  // A TRAILING CLAUSE IS NOT A SECOND ANSWER.
  //
  // `finalValue` cut after the LAST "is"/"got"/"answer" and compared whatever
  // number came next, so "It is 144. That is roughly 6 times what I expected."
  // was scored against 6 and returned incorrect at confidence 1 — and
  // turn.ts treats method 'exact' as fact that outranks the reader and forces
  // the move. The person did the arithmetic right and was told, unanswerably,
  // that they had not. The clause needed to trigger it is ordinary English.
  ok('a trailing comparison does not become the answer',
    exactCheck('what is 12 * 12', 'It is 144. That is roughly 6 times what I expected.')?.verdict === 'correct');
  ok('nor does an unrelated number after it',
    exactCheck('compute 15 * 4', 'I think the answer is 60. Also my budget is 45 dollars.')?.verdict === 'correct');
  ok('a wrong answer is still wrong', exactCheck('compute 15 * 4', 'I got 55.')?.verdict === 'incorrect');
  ok('  and the number they actually wrote is the one judged',
    exactCheck('what is 12 * 12', '12*12 = 100, but I am not sure')?.verdict === 'incorrect');
}

console.log('\n=== statedSlips: arithmetic it may not judge ===');
{
  // UNGATED, ON EVERY TURN, IN A BLOCK LABELLED "computed exactly", on a move
  // marked forced. `apply` runs strictly left to right, so a correct
  // mixed-precedence line was "corrected" to the wrong value and the reply was
  // told to carry the correction through everything depending on it. For a
  // product whose purpose is helping people check their own working, saying
  // nothing is the only honest option here; precedence belongs to exactCheck's
  // compiler.
  ok('mixed precedence is left alone', statedSlips('2 + 3 * 4 = 14').length === 0);
  ok('  in either order', statedSlips('so 10 + 2 * 5 = 20, which checks out').length === 0);
  ok('one tier is still evaluated left to right', statedSlips('100 - 20 - 5 = 75').length === 0);
  ok('  and a real slip in one tier is still caught', statedSlips('they said 30 + 30 = 70')[0]?.actual === '60');
  // A match preceded by an operator is a fragment of something longer, and the
  // fragment's value is not the writer's claim.
  ok('a fragment of an expression is not harvested', statedSlips('I wrote a[i] * 2 + 1 = 9 for i=4').length === 0);
  ok('  nor is one after an exponent', statedSlips('2^3 + 1 = 9').length === 0);
  ok('but a preceding WORD is fine', statedSlips('budget 40k + 10k = 55k')[0]?.actual === '50k');
  // The case the function was written for (run 2, strategy-014).
  ok('the money slip it exists to catch still lands',
    statedSlips('$410k - $163.9k = $250k')[0]?.actual === '$246.1k');
  ok('  and the correct version stays silent', statedSlips('$410k - $163.9k = $246.1k').length === 0);
}

console.log('\n=== the stream gate ===');
{
  const run = (chunks, maxQ) => {
    let sent = '';
    const g = new SentenceGate((s) => { sent += s; });
    for (const c of chunks) g.push(c);
    const dropped = g.finish(maxQ);
    return { sent, dropped, out: g.out };
  };
  const a = run(['The funding gap is real. ', 'What do you think about ', 'Austin?'], 0);
  ok('a trailing question beyond the budget never reaches them', a.sent.trim() === 'The funding gap is real.' && a.dropped.length === 1, JSON.stringify(a));
  const b = run(['The funding gap is real. What is the first red line?'], 1);
  ok('within the budget it does', /first red line\?$/.test(b.sent.trim()));
  const c = run(['Why does this matter? ', 'Because investors cluster where exits happened. ', 'That is the mechanism.'], 0);
  ok('a rhetorical question followed by exposition is released in order', c.sent.startsWith('Why does this matter?') && /mechanism\.$/.test(c.sent.trim()), JSON.stringify(c.sent));
  const d = run(['Great question! ', 'It was renamed in 2000.'], 0);
  ok('a sycophantic opener never goes out', d.sent.trim() === 'It was renamed in 2000.', JSON.stringify(d.sent));
  const e = run(['Great question — the answer is 42. ', 'That is all.'], 0);
  ok('but the substance in the same sentence does', e.sent.startsWith('The answer is 42.'), JSON.stringify(e.sent));
  const f = run(['Run this:\n```js\nconst ok = x?.y ?? z;\nconsole.log("why?");\n```\n', 'That fixes it.'], 0);
  ok('code passes through untouched, question marks and all', f.sent.includes('console.log("why?");') && f.sent.includes('x?.y'), JSON.stringify(f.sent));
  // Run 1 (adversarial-001): advice that starts "If you want…" and an "e.g."
  // inside it were split and half-deleted mid-reply.
  const adv = run(['That sorts numerically. If you want something to suggest, a short comment like `// numeric, descending` or a test with mixed-digit scores (e.g. `[9, 100, 85]`) would lock the behaviour in. ', 'Nothing else needs changing.'], 0);
  ok('run 1: advice starting "If you want…" and an "e.g." survive intact, mid-reply', adv.sent.includes('If you want something to suggest, a short comment like') && adv.sent.includes('(e.g. `[9, 100, 85]`) would lock the behaviour in.'), JSON.stringify(adv.sent));
  ok('"e.g." does not end a sentence', sentencesOf('Use a test (e.g. mixed digits) to lock it in. Done.').length === 2);
  const g = run(['It works now. ', 'Let me know if you want me to add tests.'], 1);
  ok('a closing offer is dropped even with budget left', g.sent.trim() === 'It works now.', JSON.stringify(g.sent));
}

console.log('\n=== the guard model is used to delete, never to write ===');
{
  const draft = 'You already weighed cost. The real risk is churn.';
  const m = sanitizeGuard2({ action: 'MODIFY_FOR_MORE_HELP', findings: [{ side: 'novelty', detail: 'x' }], redundant: ['You already weighed cost.', 'A sentence that is not in the draft.'], revised: 'An entirely new reply written by the cheap model.' }, draft);
  ok('only sentences actually in the draft can be named', m.redundant.length === 1 && m.redundant[0] === 'You already weighed cost.');
  ok('no revised prose is accepted', !('revised' in m));
  ok('garbage → ALLOW, marked as no model', sanitizeGuard2(null, draft).action === 'ALLOW' && sanitizeGuard2(null, draft).by === 'none');
  ok('an unknown action → ALLOW', sanitizeGuard2({ action: 'DESTROY' }, draft).action === 'ALLOW');
  const input = buildGuard2Input({ decision: dec('HINT'), allocation: alloc('HUMAN_PRACTICES', PRACTICE), draft: 'x', considered: ['a'] }, 'their words');
  ok('the guard model is told what is kept with them and why', /KEEP WITH THEM: the answer \(practice_goal\)/.test(input));
  ok('looksWorked: a derivation chain', looksWorked('So we get A, therefore B, which gives C, hence D.'));
  ok('looksWorked: not ordinary prose', !looksWorked('You could look at which rule applies here.'));
  ok('givesThenAsks: identity then invitation', givesThenAsks('The rule is (fg)\' = f\'g + fg\'. Now try it yourself.'));
  ok('givesThenAsks: a bare invitation is fine', !givesThenAsks('Now try it yourself.'));
}

console.log('\n=== the ledger: attribution is enforced in code ===');
{
  const said = 'I think we should launch in March, not April, because the conference is in March. I already ruled out a price increase.';
  ok('a verbatim quote is QUOTED', grounding({ text: 'launch in March', quote: 'we should launch in March, not April' }, said) === 'quoted');
  ok('a close paraphrase is PARAPHRASED', grounding({ text: 'Launch in March because of the conference', quote: '' }, said) === 'paraphrased');
  ok('a flipped negation is NOT a paraphrase', grounding({ text: 'They should not launch in March because of the conference', quote: '' }, said) === 'inferred');
  ok('something they never said is INFERRED', grounding({ text: 'They are worried about the budget', quote: 'budget is tight' }, said) === 'inferred');

  const ctx = { conversationId: 'c1', projectId: null, turn: 3, now: 1000 };
  const items = [
    { kind: 'decision', text: 'launch in March', quote: 'we should launch in March, not April', stance: 'asserts', reason: 'the conference is in March' },
    { kind: 'claim', text: 'They are worried about the budget', quote: 'budget is tight', stance: 'asserts', reason: '' },
    { kind: 'alternative', text: 'price increase', quote: 'I already ruled out a price increase', stance: 'rejects', reason: '' },
  ];
  const es = entriesFromPerson(items, said, ctx);
  ok('grounded → owner user', es[0].owner === 'user' && es[0].basis === 'quoted');
  ok('ungrounded → owner unknown, never theirs', es[1].owner === 'unknown' && es[1].quote === '');
  ok('an ungrounded item cannot carry a stance it never showed', es[1].stance === 'entertains');
  ok('a rejection is recorded as ruled out', es[2].status === 'rejected');

  // Run 3 (longitudinal-006): restating what Socria just said is accepting
  // Socria's idea, never theirs (council D10).
  const socriaSaid = 'The early school start this year could explain part of the rise: the usual back-to-school spike simply came earlier.';
  const echo = entriesFromPerson([{ kind: 'hypothesis', text: 'the early school start explains part of the rise', quote: 'the early school start explains part of the rise', stance: 'asserts', reason: '' }],
    'Right, so the early school start explains part of the rise.', ctx, socriaSaid);
  ok('an echo of Socria is not recorded as theirs', echo[0].owner === 'unknown', echo[0].owner);
  const soc = entriesFromSocria('The conference timing only helps if the demo is stable. What would a slipped demo cost you?', 'CONTRIBUTE', ctx);
  ok('what Socria said is Socria\'s', soc.every((e) => e.owner === 'socria'));
  ok('its question and its claim are both recorded', soc.some((e) => e.kind === 'question') && soc.some((e) => e.kind === 'claim'));

  // Adoption: they take up Socria's idea in their own words next turn.
  const ctx4 = { ...ctx, turn: 4, now: 2000 };
  const adopted = entriesFromPerson([{ kind: 'claim', text: 'the conference timing only helps if the demo is stable', quote: 'the conference timing only helps if the demo is stable', stance: 'accepts', reason: '' }],
    'Fair — the conference timing only helps if the demo is stable.', ctx4);
  const links = linksForTurn(adopted, soc, 2000);
  ok('adoption is a NEW user entry, linked derived_from Socria\'s', adopted[0].owner === 'user' && links.some((l) => l.rel === 'derived_from' && soc.some((s) => s.id === l.to)), JSON.stringify(links));
  ok('Socria\'s entry still belongs to Socria', soc.every((e) => e.owner === 'socria'));

  const merged = mergeEntries(es, entriesFromPerson([items[0]], said, { ...ctx, turn: 5, now: 3000 }), 3000);
  ok('saying the same thing again reinforces, not duplicates', merged.created.length === 0 && merged.touched.length === 1);

  const all = [...es, ...soc];
  const disputed = disputeTurn(all, 'c1', 3, 4000, "that's not what I meant");
  ok('a correction disputes their entries from that turn', disputed.length === 2 && disputed.every((e) => e.status === 'disputed'));
  ok('  with the correction in the revision history', disputed[0].revisions.at(-1).change === 'corrected');
  const view = consideredView(all, { focus: 'launch timing', conversationId: 'c1', projectId: null });
  ok('disputed entries are never rendered as theirs again', !view.lines.some((l) => /launch in March/.test(l)), JSON.stringify(view.lines));
  ok('Socria\'s own contributions are rendered as Socria\'s', view.lines.some((l) => l.startsWith('Socria already said')));

  const fresh = entriesFromPerson(items, said, { ...ctx, turn: 6, now: 5000 });
  const v2 = consideredView(fresh, { focus: 'launch', conversationId: 'c1', projectId: null });
  ok('stance is rendered: raised vs ruled out', v2.lines.some((l) => /^they ruled out: price increase/.test(l)), JSON.stringify(v2.lines));
  ok('reasons are carried', v2.lines.some((l) => /because: the conference is in March/.test(l)));

  const graph = toLogosGraph(fresh, links);
  ok('the ledger renders as a Logos graph with owners intact', graph.nodes.length === 3 && graph.nodes.every((n) => 'owner' in n && 'stance' in n) && Array.isArray(graph.edges));
}

console.log('\n=== council D10: identifiers never reach the ledger ===');
{
  const s = scrubPII('Email me at jane.doe@example.com or call +1 (415) 555-0199; invoice 20260914883; see https://x.io/a?token=abc');
  ok('emails, phones, long numbers and query-string links are scrubbed', !/jane|555-0199|20260914883|token=/.test(s), s);
  ok('ordinary numbers stay', scrubPII('The split is 60/40 and we raised $2.4M in 2024.') === 'The split is 60/40 and we raised $2.4M in 2024.');
}

console.log('\n=== capability: events, counted conservatively ===');
{
  const ev = (concept, event, assistance, conversationId, at) => ({ id: `${at}`, concept, event, assistance, conversationId, turn: 1, confidence: 0.7, at });
  const s1 = summarize([
    ev('chain rule', 'misunderstanding', 0, 'c1', 1),
    ev('chain rule', 'demonstrated_assisted', 1, 'c1', 2),
    ev('chain rule', 'demonstrated_unassisted', 0, 'c1', 3),
  ]);
  ok('right-after-help in the SAME conversation is performance, not independence', s1[0].independentAfterHelp === false);
  const s2 = summarize([
    ev('chain rule', 'misunderstanding', 0, 'c1', 1),
    ev('chain rule', 'demonstrated_assisted', 1, 'c1', 2),
    ev('chain rule', 'demonstrated_unassisted', 0, 'c2', 10),
  ]);
  ok('unassisted success in a LATER conversation is', s2[0].independentAfterHelp === true);
  ok('counts are kept separately', s2[0].assisted === 1 && s2[0].unassisted === 1 && s2[0].misunderstandings === 1);
  ok('assistance is read from the previous move', assistanceOf({ type: 'HINT' }) === 1 && assistanceOf({ type: 'ANSWER' }) === 3 && assistanceOf(undefined) === 0);
  const st = { ...EMPTY_STATE, currentFocus: 'chain rule derivative', latest: 'attempt', attempt: 'right', history: [], turn: 2 };
  const e = evidenceFromTurn(st, null, { conversationId: 'c1', turn: 2, now: 99 }, { verdict: 'correct', location: '', errorType: '', expected: '', confidence: 1, method: 'exact' });
  ok('a right attempt with no help before it is demonstrated_unassisted', e.length === 1 && e[0].event === 'demonstrated_unassisted');
  ok('council D12: the reader\'s opinion alone records nothing — a verdict is required', evidenceFromTurn(st, null, { conversationId: 'c1', turn: 2, now: 99 }).length === 0);
  ok('  nor does a checker below 0.85', evidenceFromTurn(st, null, { conversationId: 'c1', turn: 2, now: 99 }, { verdict: 'correct', location: '', errorType: '', expected: '', confidence: 0.8, method: 'checker' }).length === 0);
  ok('a model opinion of their understanding alone produces nothing', evidenceFromTurn({ ...EMPTY_STATE, currentFocus: 'chain rule', demonstratedUnderstanding: 'solid', turn: 2 }, null, { conversationId: 'c1', turn: 2, now: 1 }).length === 0);
}

console.log('\n=== the trace is content-free ===');
{
  const secret = 'MY-PRIVATE-SENTENCE about my divorce';
  const state = { ...EMPTY_STATE, currentGoal: secret, currentFocus: secret, positions: [secret], consideredNow: [{ kind: 'claim', text: secret, quote: secret, stance: 'asserts', reason: secret }], turn: 4 };
  const t = buildTrace({
    state, readOk: true,
    allocation: { ...alloc('SHARED_REASONING'), rationale: secret, withhold: { what: secret, reason: 'authorship', evidence: secret, source: 'message' } },
    decision: dec('CONTRIBUTE', 0, { objective: secret, reason: secret, avoid: [secret] }),
    budget: { streak: 1, density: 0.333333, allowed: 0, reasons: [secret] },
    diminishing: { detected: true, signals: [secret], from: 'asking' },
    novelty: [{ sentence: secret, verdict: 'REDUNDANT', match: secret, score: 0.8, method: 'lexical' }],
    guard: { action: 'MODIFY_FOR_MORE_HELP', findings: [{ side: 'novelty', code: 'already_considered', detail: secret }], by: 'structure' },
    regenerated: false, verify: null, sentQuestions: 0, sentChars: 120,
    ledger: { user: 1, socria: 1, unknown: 0, disputed: 0 }, considered: 3, ms: { state: 10 },
    models: { reply: 'm', cognition: 'c' }, promptVersion: 'core-4-v2',
  });
  const json = JSON.stringify(t);
  ok('no text from the person or from Socria survives into the trace', !json.includes('PRIVATE') && !json.includes('divorce'), json.slice(0, 300));
  ok('reason CODES do', t.guard.codes[0] === 'novelty:already_considered' && t.allocation.withhold === 'authorship');
  ok('numbers are rounded', t.budget.density === 0.33);
}

console.log('\n=== Verify Mode ===');
{
  const r = exactCheck('What is 17 * 23 + 4?', 'I got 395');
  ok('arithmetic is checked exactly', r?.verdict === 'correct' && r.method === 'exact', JSON.stringify(r));
  const w = exactCheck('What is 17 * 23 + 4?', 'I got 385');
  ok('a wrong value is caught exactly', w?.verdict === 'incorrect' && w.expected === '395');
  ok('no number in the attempt → no claim', exactCheck('What is 17 * 23 + 4?', 'I think you multiply first') === null);
  ok('no arithmetic in the problem → no claim', exactCheck('Prove that the square root of two is irrational', 'by contradiction') === null);
  const block = renderCheck(w);
  ok('the reply model is told the verdict…', /VERDICT: incorrect \(computed exactly\)/.test(block));
  ok('…and never the expected answer', !block.includes('395'));
  ok('the guard is told to keep it out', hiddenValues(w).includes('395'));
  ok('big numbers are hidden in both spellings', hiddenValues({ expected: '12000' }).includes('12,000'));
  const c = sanitizeCheck({ verdict: 'incorrect', location: 'your last line, which should read x = 7', errorType: 'sign', expected: 'x = 7', confidence: 0.9 });
  ok('a checker location that gives the answer away is scrubbed', c.location === '' && c.errorType === 'sign', JSON.stringify(c));
  ok('a low-confidence checker verdict is not claimed', renderCheck({ ...c, confidence: 0.4 }) === '');
  ok('an unknown verdict is not claimed', renderCheck({ ...c, verdict: 'unknown' }) === '');
}

console.log('\n=== run 4: a restated position replaces the one they held (learning-012) ===');
{
  const c = { conversationId: 'cpi', projectId: null, turn: 1, now: 100 };
  const said1 = 'The GDP deflator is nominal GDP divided by real GDP, times 100, so it covers every good produced in the economy, including imports. The CPI tends to understate inflation because people substitute toward goods that got relatively cheaper. Both are price indices, so they usually move together.';
  const turn1 = entriesFromPerson([
    { kind: 'claim', text: 'The GDP deflator is nominal over real GDP times 100 and covers all goods produced, including imports', quote: 'so it covers every good produced in the economy, including imports', stance: 'asserts', reason: '' },
    { kind: 'claim', text: 'CPI understates inflation because of substitution toward relatively cheaper goods', quote: 'The CPI tends to understate inflation because people substitute toward goods that got relatively cheaper.', stance: 'asserts', reason: '' },
    { kind: 'claim', text: 'Both are price indices so they usually move together', quote: 'Both are price indices, so they usually move together.', stance: 'asserts', reason: '' },
  ], said1, c);
  const ledger = mergeEntries([], turn1, 100).entries;
  const now2 = [
    { kind: 'claim', text: 'The GDP deflator covers all domestic final output including capital goods and government purchases but not imports, with a basket that changes yearly', quote: '', stance: 'asserts', reason: '' },
    { kind: 'claim', text: 'The fixed CPI basket overstates inflation when consumers substitute toward cheaper goods', quote: '', stance: 'asserts', reason: '' },
  ];
  const gone = supersedeRestated(ledger, now2, 'cpi', 2, 200);
  ok('both corrected positions are superseded', gone.length === 2 && gone.every((e) => e.status === 'superseded'), gone.map((e) => e.text).join(' | '));
  ok('  with the restatement recorded as the reason', gone.every((e) => e.revisions.at(-1).reason.startsWith('restated:')));
  const view = consideredView(ledger, { focus: 'CPI GDP deflator', conversationId: 'cpi', projectId: null });
  ok('  and no longer shown as held', !view.lines.some((l) => /including imports|understates/.test(l)), view.lines.join(' | '));
  ok('  the untouched position still is', view.lines.some((l) => /move together/.test(l)));
  ok('a later turn only: nothing supersedes itself', supersedeRestated(ledger, now2, 'cpi', 1, 300).length === 0);
  ok('another conversation is never touched', supersedeRestated(mergeEntries([], turn1.map((e) => ({ ...e, status: 'active' })), 1).entries, now2, 'other', 2, 300).length === 0);
  // The same position restated: the newest wording is kept, not the old one.
  const same = entriesFromPerson([{ kind: 'claim', text: 'Churn is driven by onboarding', quote: 'churn is driven by onboarding', stance: 'asserts', reason: '' }], 'I think churn is driven by onboarding.', c);
  const flipped = entriesFromPerson([{ kind: 'claim', text: 'Churn is driven by pricing, not onboarding', quote: 'churn is driven by pricing, not onboarding', stance: 'asserts', reason: '' }], 'Actually churn is driven by pricing, not onboarding.', { ...c, turn: 2, now: 200 });
  const m = mergeEntries(mergeEntries([], same, 100).entries, flipped, 200);
  ok('an opposite-polarity restatement is not merged into the old position', m.created.length === 1, JSON.stringify(m.entries.map((e) => e.text)));
  const reworded = entriesFromPerson([{ kind: 'claim', text: 'Churn is mostly driven by onboarding', quote: 'churn is mostly driven by onboarding', stance: 'asserts', reason: '' }], 'Churn is mostly driven by onboarding.', { ...c, turn: 2, now: 200 });
  const m2 = mergeEntries(mergeEntries([], same, 100).entries, reworded, 200);
  ok('the same position reworded keeps their newest wording', m2.created.length === 0 && m2.entries[0].text === 'Churn is mostly driven by onboarding', m2.entries[0].text);
}

console.log('\n=== run 5: an uncertainty is what they were unsure of, not what they hold ===');
{
  const c = { conversationId: 'spec', projectId: null, turn: 1, now: 100 };
  const es = entriesFromPerson([
    { kind: 'uncertainty', text: 'They do not know what specificity refers to', quote: "I don't know what specificity refers to", stance: 'asserts', reason: '' },
  ], "Honestly I don't know what specificity refers to.", c);
  const view = consideredView(mergeEntries([], es, 100).entries, { focus: 'specificity', conversationId: 'spec', projectId: null });
  ok('rendered as "they were unsure", never "they hold"', view.lines.some((l) => l.startsWith('they were unsure:')) && !view.lines.some((l) => l.startsWith('they hold:')), view.lines.join(' | '));
}

console.log('\n=== run 6: arithmetic they wrote out is checked exactly (decision-015) ===');
{
  const s = statedSlips('My math: annual debt service ≈ $163,900. $410k − $163.9k = $256k, versus $182k as an associate.');
  ok('"$410k − $163.9k = $256k" is caught, with the right value', s.length === 1 && s[0].actual === '$246.1k' && s[0].stated === '$256k', JSON.stringify(s));
  ok('a wrong product is caught', statedSlips('so 12 x 7 = 82').length === 1);
  for (const fine of ['$410k − $163.9k = $246.1k', 'so 12 x 7 = 84 and 84 + 6 = 90', 'I get 3.5 + 2.25 = 5.75', '$1.2M / 12 = $100k per month', '2024-05-01 = launch date', 'I have 3 kids = chaos', '100 - 7 = 93 roughly']) {
    ok(`no slip in "${fine}"`, statedSlips(fine).length === 0, JSON.stringify(statedSlips(fine)));
  }
}

console.log('\n=== a withheld value inside a code fence was detected and shipped anyway ===');
{
  // deleteSentences shields fenced code so it never mangles a snippet, and
  // leaksHidden reads through fences. So the guard found the value, "removed"
  // it with a delete that refused to touch it, and passed the draft on.
  const withheld = alloc('AI_VERIFIES', PRACTICE);
  const draft = 'Your loop bound is the problem, not the comparison.\n\n```python\nresult = 391  # the value\n```\n\nTry it again from there.';
  const g = guardStructure({ decision: dec('VERIFY'), allocation: withheld, draft, considered: [], hidden: ['391'], target: 'what is 17 * 23 for the loop bound' });
  ok('the leak is found', g.findings.some((f) => f.code === 'hidden_value'), JSON.stringify(g.findings.map((f) => f.code)));
  ok('and no revised draft still carrying it is handed back', !(g.revised ?? '').includes('391'), g.revised);
  ok('  the turn is sent back to be written again instead', !!g.retryNote, JSON.stringify({ retry: g.retryNote, revised: g.revised }));
  // Prose is still removable in place, as before.
  const prose = guardStructure({ decision: dec('VERIFY'), allocation: withheld, draft: 'The loop bound is wrong there. The answer is 391 exactly. Look again at the comparison in the while.', considered: [], hidden: ['391'], target: 'what is 17 * 23' });
  ok('a leak in prose is still deleted in place', !!prose.revised && !prose.revised.includes('391') && prose.revised.includes('loop bound'), JSON.stringify({ revised: prose.revised, retry: prose.retryNote }));
}

console.log('\n=== what maxQuestions actually guarantees on a streamed turn ===');
{
  // Found by an adversarial audit and reproduced here so it stays true on
  // purpose rather than by accident. The gate can only drop what it still
  // HOLDS when the stream ends, and council D4 forbids cutting from the
  // middle of a reply, so maxQuestions binds the tail, not the whole text.
  const run = (chunks, maxQ) => {
    let out = '';
    const g = new SentenceGate((s) => { out += s; });
    for (const c of chunks) g.push(c);
    g.finish(maxQ, []);
    return out;
  };
  const trailing = run(['The gap is real. ', 'What do you think? '], 0);
  ok('a trailing question is dropped at maxQuestions 0', !/\?/.test(trailing), JSON.stringify(trailing));
  const mid = run(['The gap is real. ', 'What do you think? ', 'Also consider the runway. '], 0);
  ok('a question with exposition after it ships — it was rhetorical, and nothing is cut mid-reply', /What do you think\?/.test(mid), JSON.stringify(mid));
  ok('  and the exposition after it is not lost', /Also consider the runway/.test(mid));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
