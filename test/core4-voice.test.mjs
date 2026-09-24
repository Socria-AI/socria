// One personality, many registers.
//
//   Cognitive State  what is happening in the human's thinking
//   Personality State  how Socria meets them there   ← voice.ts, tested here
//   Core Personality  who Socria remains             ← the system prompt
//
// TWO FAILURE MODES, PULLING OPPOSITE WAYS, and the suite has to catch both.
// A personality that never shifts is a costume: the same clipped analytic voice
// aimed at someone who has just said they are struggling. A personality that
// shifts too far is impersonation: slang returned to someone writing in slang,
// which reads as mockery coming from a machine. Every context below asserts
// both that the register moved AND that it did not become someone else.
//
// The anti-pattern block is the load-bearing half. Corporate voice, therapy
// vocabulary, mirroring, forced slang, fake profundity and period-roleplay are
// the six ways this goes wrong in a way a user would immediately clock, and
// none of them is caught by asking "does it have a personality".

import { EMPTY_STATE } from './.tmp/state.mjs';
import { readSignals, NO_SIGNALS } from './.tmp/signals.mjs';
import { allocate } from './.tmp/allocation.mjs';
import { budgetFrom, diminishingReturns } from './.tmp/budget.mjs';
import { selectIntervention, renderDecision } from './.tmp/intervene.mjs';
import { voiceFor, renderVoice } from './.tmp/voice.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const inf = (value, confidence = 0.8) => ({ value, source: 'inferred', confidence, evidence: 'reader' });

/** A whole turn: what the reader saw, what was decided, how it should sound. */
function turn(said, over = {}) {
  const state = { ...EMPTY_STATE, currentFocus: said, ...over };
  const signals = said ? readSignals(said) : NO_SIGNALS;
  const dim = diminishingReturns(state, signals, []);
  const budget = budgetFrom(state, signals, 0, 0, dim);
  const allocation = allocate({ state, signals, contract: NO_SIGNALS });
  const decision = selectIntervention({ state, allocation, budget, diminishing: dim, signals, considered: [], lastUserText: said });
  const voice = voiceFor({ state, signals, decision });
  return { decision, voice, block: renderVoice(voice) + renderDecision(decision, allocation) };
}

// ─────────────────────────────────────────────────────────────────────

console.log('=== casual conversation: looser, still itself ===');
{
  const t = turn("bro we're cooked", { taskKind: 'explore', work: 'conversation', latest: 'reaction' });
  ok('humour is available', t.voice.play === 'light' || t.voice.play === 'dry', t.voice.play);
  ok('  but it never matches their slang back', /do not match their slang back at them/.test(t.block));
  ok('  and enthusiasm is not performed', /no enthusiasm as a performance/.test(t.block));
  ok('it does not become sharp at someone joking', t.voice.edge !== 'sharp', t.voice.edge);
}

console.log('\n=== serious analytical work: composed, compressed, sceptical ===');
{
  const t = turn('The raise timing rests on the churn figure and I want to pressure-test it.', {
    taskKind: 'decide', work: 'judgment', latest: 'request',
    stakes: inf('high'), expertise: { value: 'expert', source: 'observed', confidence: 0.7, evidence: 'shown' },
  });
  ok('the edge comes up', t.voice.edge === 'sharp', t.voice.edge);
  ok('warmth comes down — the problem, not the person', t.voice.warmth === 'cool', t.voice.warmth);
  ok('no humour on a consequential call', t.voice.play === 'none', t.voice.play);
  ok('and it is dense for someone who works in the area', t.voice.density === 'dense', t.voice.density);
  ok('sharp means the weakest joint, not the person', /the target is the claim, never them/.test(t.block));
  ok('  and understatement over escalation', /Understate rather than escalate/.test(t.block));
}

console.log('\n=== emotional uncertainty: quieter and warmer, no therapy-speak ===');
{
  const t = turn("I honestly don't know if I'm cut out for this", { taskKind: 'explore', work: 'reflection', latest: 'information' });
  ok('warmth comes up', t.voice.warmth === 'warm', t.voice.warmth);
  ok('the edge comes off', t.voice.edge === 'soft', t.voice.edge);
  ok('no jokes here', t.voice.play === 'none', t.voice.play);
  ok('warmth is attention, not comfort', /Warmth here is attention, not comfort/.test(t.block));
  ok('  their feelings are not named back at them', /No naming of their feelings back at them/.test(t.block));
  ok('  and no therapy vocabulary', /no therapy vocabulary/.test(t.block));
  ok('  and no reassurance', /no reassurance/.test(t.block));
  ok('it stays short — warmth is not a licence for a paragraph', t.voice.density === 'spare', t.voice.density);
}

console.log('\n=== disagreement: sharper without becoming combative ===');
{
  const t = turn('Users churn because people just do not want to think.', {
    taskKind: 'decide', work: 'judgment', latest: 'information', tensions: ['their explanation does not fit their own numbers'],
  });
  ok('the edge is up', t.voice.edge === 'sharp', t.voice.edge);
  ok('dry humour is allowed — understatement disagrees without escalating', t.voice.play === 'dry', t.voice.play);
  ok('it does not go cold on them', t.voice.warmth === 'neutral', t.voice.warmth);
}

console.log('\n=== high stakes: composed, and no jokes ===');
{
  const t = turn('We sign the lease tomorrow and I think the escalator clause is wrong.', {
    taskKind: 'decide', work: 'judgment', latest: 'information', stakes: inf('high'),
  });
  ok('sharp and unplayful', t.voice.edge === 'sharp' && t.voice.play === 'none', `${t.voice.edge}/${t.voice.play}`);
  ok('and it says why it landed there', /consequential call/.test(t.voice.because), t.voice.because);
}

console.log('\n=== a quick practical ask: hand it over and stop ===');
{
  const t = turn('What is the default isolation level in Postgres?', { work: 'information', latest: 'question' });
  ok('spare', t.voice.density === 'spare', t.voice.density);
  ok('no humour in the way of an answer', t.voice.play === 'none', t.voice.play);
  ok('one idea per sentence', /One idea each/.test(t.block));
}

console.log('\n=== something worked: real energy, not a hype bot ===');
{
  const t = turn('it works — the transpiler round-trips the whole rule set now', { taskKind: 'explore', work: 'conversation', latest: 'information' });
  ok('light and quick', t.voice.play === 'light', t.voice.play);
  ok('warm', t.voice.warmth === 'warm', t.voice.warmth);
  ok('but the edge stays on — what it means matters more than the cheer', t.voice.edge === 'measured', t.voice.edge);
  ok('no exclamation marks', /no exclamation marks/.test(t.block));

  // Praise aimed at Socria is not a discovery and earns no energy.
  const flattery = turn('honestly you are the best tool I have used', { taskKind: 'explore', work: 'conversation', latest: 'reaction' });
  ok('praise for Socria is not treated as a breakthrough', flattery.voice.because !== 'something they were working on came good', flattery.voice.because);
}

console.log('\n=== very different communication styles, same person ===');
{
  const terse = turn('index unused. why', { work: 'diagnosis', latest: 'question' });
  // The two messages must differ ONLY in length. The first draft of this one
  // opened "I have been going round in circles", which is a frustration cue —
  // so it correctly got the quieter register, and the test was comparing
  // emotional content while claiming to compare prose style.
  const verbose = turn('Laying this out properly: the partial index on tenant and created_at is not being chosen, the planner takes a sequential scan across forty million rows, and the statistics and the column types both look correct to me.', { work: 'diagnosis', latest: 'question' });
  // THE REAL ANTI-MIRRORING PROPERTY: register follows the SITUATION, not the
  // person's prose style. Two people in the same work context, one writing four
  // words and one writing sixty, get the same register — because what changed
  // is their typing, not what they need.
  ok('two writers in the same context get the same register',
    terse.voice.warmth === verbose.voice.warmth && terse.voice.edge === verbose.voice.edge && terse.voice.density === verbose.voice.density,
    `${terse.voice.warmth}/${terse.voice.edge}/${terse.voice.density} vs ${verbose.voice.warmth}/${verbose.voice.edge}/${verbose.voice.density}`);
  ok('  and a terse writer is not answered tersely as a style choice', terse.voice.density !== 'spare' || terse.voice.because === 'they asked for a thing', `${terse.voice.density} (${terse.voice.because})`);
  ok('both are told this is register, not character', /shift of register, not of character/.test(terse.block) && /shift of register, not of character/.test(verbose.block));
  ok('  and neither is told to mirror the other', !/match (?:their|the user)/i.test(terse.block.replace(/do not match their slang back at them/gi, '')));
}

console.log('\n=== their instruction outranks the reading ===');
{
  // `tooDirect` is the signal for "you gave me too much / gave it away", not
  // for "you were harsh" — worth stating, because the obvious reading of the
  // field name is the wrong one.
  const tooHard = turn('that was too much', { taskKind: 'explore', work: 'conversation', latest: 'reaction' });
  ok('"that was too much" softens the edge', tooHard.voice.edge === 'soft' && tooHard.voice.warmth === 'warm', `${tooHard.voice.edge}/${tooHard.voice.warmth}`);
  ok('  and says so in the reason', /landed too hard/.test(tooHard.voice.because), tooHard.voice.because);
}

console.log('\n=== safety outranks everything ===');
{
  const t = turn('I think I am having a heart attack, what do I do', { work: 'information', latest: 'question', urgency: 'high' });
  ok('no humour', t.voice.play === 'none');
  ok('no warmth performance in the way of the instruction', t.voice.warmth === 'neutral', t.voice.warmth);
  ok('spare', t.voice.density === 'spare');
}

console.log('\n=== ANTI-PATTERNS: the six ways a user immediately clocks it ===');
{
  const all = [
    turn("bro we're cooked", { taskKind: 'explore', work: 'conversation', latest: 'reaction' }),
    turn("I don't know if I'm cut out for this", { taskKind: 'explore', work: 'reflection', latest: 'information' }),
    turn('Pressure-test the churn figure.', { taskKind: 'decide', work: 'judgment', latest: 'request', stakes: inf('high') }),
    turn('What is the default isolation level?', { work: 'information', latest: 'question' }),
  ].map((t) => t.block);

  for (const [i, b] of all.entries()) {
    const tag = `[case ${i + 1}]`;
    // Therapy-speak and reassurance are named and forbidden where warmth is up.
    ok(`${tag} never instructs reassurance`, !/\breassure\b(?!.*\bno\b)/i.test(b) || /no reassurance|Do not reassure/i.test(b));
    // No mode is ever named to the model.
    ok(`${tag} names no mode`, !/\b(?:you are in|switch to|entering|adopt(?:ing)?|use) (?:a )?(?:\w+ )?(?:mode|persona|voice|register)\b/i.test(b));
    ok(`${tag} does not expose the dial values`, !/warmth\s*[:=]|edge\s*[:=]|play\s*[:=]|density\s*[:=]/i.test(b));
    // It must not leak as self-narration.
    ok(`${tag} forbids explaining the adaptation`, /do not explain how you are adapting/i.test(b));
    // Personality must not buy length.
    ok(`${tag} forbids adding a sentence`, /do not let it add a single sentence/i.test(b));
    // No period roleplay, no archaism, anywhere in the register block.
    ok(`${tag} no archaic or period language`, !/\b(?:indeed|whilst|hitherto|thus|hence|one might|shall we|old sport|my dear)\b/i.test(b));
  }
}

console.log('\n=== the register never overrides the reasoning ===');
{
  // A warm register on a wrong attempt must not suppress the verdict.
  const wrong = turn('I got 2x cos x, and honestly I am stuck and fed up', {
    work: 'verification', latest: 'attempt', attempt: 'wrong', stuck: 'stalled',
  });
  ok('warmth is up for someone struggling', wrong.voice.warmth === 'warm', wrong.voice.warmth);
  ok('  and the move is still the corrective one', ['CORRECT', 'VERIFY', 'EXPLAIN', 'HINT'].includes(wrong.decision.type), wrong.decision.type);
  ok('  and length is still governed above, not by the register', /how much you say is settled above/.test(wrong.block));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
