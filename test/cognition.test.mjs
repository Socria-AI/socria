// The Cognitive State Engine, the Intervention Router, and the Answer Guard.
//
// The case this whole thing exists for is the last block: the move is HINT,
// the product rule is being withheld, and the draft opens with f'g + fg' and
// then asks the person to recall the product rule. Every instruction was
// followed except the only one that mattered.

import { EMPTY_STATE, sanitizeState, renderState, hasStateContent } from './.tmp/state.mjs';
import { route, renderMove, INTERVENTIONS } from './.tmp/router.mjs';
import { checkStructure, looksWorked, sanitizeGuard, retryNote, APPROVED } from './.tmp/guard.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const S = (over = {}) => ({ ...EMPTY_STATE, ...over });

console.log('=== the state fails toward asking, never toward answering ===');
{
  ok('garbage is an empty state', sanitizeState(null).taskKind === 'explore');
  const bad = sanitizeState({
    taskKind: 'definitely-a-lookup',
    demonstratedUnderstanding: 'excellent',
    attempt: 'brilliant',
    urgency: 'EXTREME',
    supportLevel: 'just-tell-them',
  });
  ok('an unknown task kind is not a lookup', bad.taskKind === 'explore');
  ok('unknown understanding is none', bad.demonstratedUnderstanding === 'none',
     'the cautious end, so the router asks rather than answers');
  ok('unknown attempt is none', bad.attempt === 'none');
  ok('unknown urgency is none', bad.urgency === 'none',
     'a forged urgency must not unlock DIRECT');
  ok('unknown support is question', bad.supportLevel === 'question');
  ok('and the router asks on it', route(bad).intervention === 'ASK');

  const long = sanitizeState({ confusions: Array.from({ length: 50 }, (_, i) => `c${i}`) });
  ok('lists are bounded', long.confusions.length === 6, `${long.confusions.length}`);
  ok('an empty state renders nothing', renderState(EMPTY_STATE) === '');
  ok('and reports itself empty', hasStateContent(EMPTY_STATE) === false);
}

console.log('\n=== the router cannot be talked into answering ===');
{
  // Wording reaches the STATE, which a separate pass produces. Nothing about
  // how a message is phrased reaches the choice directly.
  ok('venting is heard, not solved', route(S({ taskKind: 'vent' })).intervention === 'LISTEN');
  ok('a lookup is answered', route(S({ taskKind: 'lookup' })).intervention === 'RETRIEVE');
  ok('and a lookup is never guarded', route(S({ taskKind: 'lookup' })).guard === false,
     'the work is legitimately ours there');
  ok('real urgency outranks pedagogy',
     route(S({ taskKind: 'debug', urgency: 'high' })).intervention === 'DIRECT');
  ok('but ordinary debugging does not',
     route(S({ taskKind: 'debug', urgency: 'some', attempt: 'partial' })).intervention === 'HINT');
}

console.log('\n=== a wrong attempt is told it is wrong, and no more ===');
{
  const m = route(S({ taskKind: 'learn', attempt: 'wrong', demonstratedUnderstanding: 'partial' }));
  ok('it challenges', m.intervention === 'CHALLENGE');
  ok('and withholds the correction', /correct answer/i.test(m.withholds ?? ''), m.withholds ?? '');
  ok('so it is guarded', m.guard === true);
  ok('the objective says to name where', /where/i.test(m.objective));
}

console.log('\n=== the ladder moves with what they have shown ===');
{
  const learn = (over) => route(S({ taskKind: 'learn', ...over }));
  ok('no attempt, could try -> ASK', learn({}).intervention === 'ASK');
  ok('part-way and stalled -> HINT', learn({ attempt: 'partial' }).intervention === 'HINT');
  ok('missing the prerequisite -> TEACH',
     learn({ demonstratedUnderstanding: 'none', confusions: ['what a derivative is', 'why the rule applies'] }).intervention === 'TEACH',
     'asking somebody to derive what they were never given is not teaching');
  ok('and TEACH still withholds the application',
     /applying it/i.test(learn({ demonstratedUnderstanding: 'none', confusions: ['a', 'b'] }).withholds ?? ''));
  ok('solid understanding -> CHALLENGE', learn({ demonstratedUnderstanding: 'solid' }).intervention === 'CHALLENGE');
}

console.log('\n=== deciding and creating keep their authorship ===');
{
  ok('a tension is held, not resolved',
     route(S({ taskKind: 'decide', tensions: ['wants out but cannot move'] })).intervention === 'CHALLENGE');
  ok('and the recommendation is withheld',
     /resolve it/i.test(route(S({ taskKind: 'decide', tensions: ['x'] })).withholds ?? ''));
  ok('no position yet -> ASK', route(S({ taskKind: 'decide' })).intervention === 'ASK');
  ok('creating with nothing of theirs -> ASK', route(S({ taskKind: 'create' })).intervention === 'ASK');
  ok('  withholding a version of our own',
     /version of your own/i.test(route(S({ taskKind: 'create' })).withholds ?? ''));
  ok('creating with material -> SYNTHESIZE',
     route(S({ taskKind: 'create', positions: ['the opening works'] })).intervention === 'SYNTHESIZE');
}

console.log('\n=== every move is well-formed ===');
{
  const seen = new Set();
  const states = [
    S({ taskKind: 'vent' }), S({ taskKind: 'lookup' }), S({ taskKind: 'debug', urgency: 'high' }),
    S({ taskKind: 'learn', attempt: 'wrong' }), S({ taskKind: 'learn', attempt: 'partial' }),
    S({ taskKind: 'learn', demonstratedUnderstanding: 'none', confusions: ['a', 'b'] }),
    S({ taskKind: 'learn', demonstratedUnderstanding: 'solid' }), S({ taskKind: 'learn' }),
    S({ taskKind: 'decide', tensions: ['x'] }), S({ taskKind: 'decide' }),
    S({ taskKind: 'decide', positions: ['p'] }), S({ taskKind: 'create' }),
    S({ taskKind: 'create', positions: ['p'] }), S({ taskKind: 'debug' }),
    S({ taskKind: 'debug', attempt: 'partial' }), S({ taskKind: 'explore' }),
    S({ taskKind: 'explore', positions: ['p'] }),
  ];
  for (const st of states) {
    const m = route(st);
    seen.add(m.intervention);
    if (!INTERVENTIONS.includes(m.intervention)) ok('unknown intervention', false, m.intervention);
    if (!m.objective || !m.because) ok('move is incomplete', false, JSON.stringify(m));
    // The invariant that makes `guard` meaningful.
    if (m.guard !== (m.withholds !== null)) ok('guard disagrees with withholds', false, JSON.stringify(m));
  }
  ok('every state produces a valid, complete move', true);
  ok('and the router reaches most of the vocabulary', seen.size >= 7, `${seen.size} distinct`);
  ok('the move block never names itself to the user',
     /Do not narrate it, name it/.test(renderMove(route(S({ taskKind: 'learn' })))));
}

console.log('\n=== THE PRODUCT RULE ===');
{
  // The move is HINT. The product rule is what the person must retrieve.
  const move = route(S({ taskKind: 'learn', attempt: 'partial', currentFocus: 'differentiating x^2 sin x' }));
  ok('the move is HINT', move.intervention === 'HINT');
  ok('and it is guarded', move.guard === true);

  const leak =
    "Remember that (fg)' = f'g + fg'. So with f = x^2 and g = sin x you get " +
    "2x·sin x + x^2·cos x. Now — can you recall the product rule and apply it yourself?";
  const g = checkStructure(move, leak);
  ok('structure catches it before any model runs', g !== null && g.verdict === 'regenerate',
     JSON.stringify(g));
  ok('and says why', /invites them to produce it/i.test(g?.reason ?? ''), g?.reason ?? '');

  // A real hint passes untouched.
  const real = 'You have two functions multiplied together. What does that tell you about which rule applies?';
  ok('an actual hint is left alone', checkStructure(move, real) === null);

  // And the same leak under EXPLAIN is fine — the work is ours there.
  const explain = route(S({ taskKind: 'learn', demonstratedUnderstanding: 'none', confusions: ['a', 'b'] }));
  ok('TEACH permits content structure does not police', checkStructure(explain, 'The product rule says the derivative of a product is the first times the derivative of the second, plus the second times the derivative of the first.') === null);
}

console.log('\n=== structure catches the decidable failures ===');
{
  const ask = route(S({ taskKind: 'learn' }));
  ok('an ASK with no question is rejected',
     checkStructure(ask, 'That is a good place to start.')?.verdict === 'regenerate');
  ok('an ASK that works it first is rejected',
     checkStructure(ask, '1. Take f.\n2. Take g.\n3. Multiply.\nWhat do you think?')?.verdict === 'regenerate');
  ok('a real ASK passes', checkStructure(ask, 'What have you tried so far?') === null);

  const listen = route(S({ taskKind: 'vent' }));
  // Trimmed rather than regenerated now: the acknowledgement was right, only
  // the question on the end was not, and a second draft to remove one
  // sentence costs the person a wait for nothing. The contract is the same —
  // a LISTEN never reaches them asking something.
  const asked = checkStructure(listen, 'That sounds exhausting. What will you do?');
  ok('a LISTEN that asks is never sent asking',
     asked?.verdict === 'revise' && asked.revised === 'That sounds exhausting.', JSON.stringify(asked));
  ok('a LISTEN with a question in the middle is rewritten',
     checkStructure(listen, 'What a week? That sounds exhausting.')?.verdict === 'regenerate');
  ok('a real LISTEN passes', checkStructure(listen, 'That sounds genuinely exhausting.') === null);

  const hint = route(S({ taskKind: 'learn', attempt: 'partial' }));
  const long = 'One. Two. Three. Four. Five. Six. Seven.';
  ok('a HINT that runs long is rejected', checkStructure(hint, long)?.verdict === 'regenerate');
  ok('  and names length as the problem', /sentences/.test(checkStructure(hint, long).reason));

  ok('a worked chain is spotted', looksWorked('So we get A, therefore B, which gives C, hence D.'));
  ok('a numbered procedure is spotted', looksWorked('1. do this\n2. then this\n3. then this'));
  ok('ordinary prose is not', looksWorked('You could think about which rule applies here.') === false);
}

console.log('\n=== the guard verdict is made safe ===');
{
  ok('garbage approves', sanitizeGuard(null).verdict === 'approve');
  ok('an unknown verdict approves', sanitizeGuard({ verdict: 'destroy' }).verdict === 'approve');
  const rev = sanitizeGuard({ verdict: 'revise', reason: 'leaked the rule', revised: 'What rule applies?' });
  ok('a revision survives', rev.verdict === 'revise' && rev.revised === 'What rule applies?');
  ok('an EMPTY revision becomes a regenerate',
     sanitizeGuard({ verdict: 'revise', reason: 'x', revised: '   ' }).verdict === 'regenerate',
     'sending an empty reply would be the worst of both');
  ok('a regenerate keeps its reason',
     sanitizeGuard({ verdict: 'regenerate', reason: 'built around the answer' }).reason === 'built around the answer');
  ok('the retry note never mentions itself',
     /mention this instruction/i.test(retryNote({ verdict: 'regenerate', reason: 'r', by: 'model' }, route(S({ taskKind: 'learn' })))));
  ok('and it repeats what must be withheld',
     /must not produce/i.test(retryNote({ verdict: 'regenerate', reason: 'r', by: 'model' }, route(S({ taskKind: 'learn' })))));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
