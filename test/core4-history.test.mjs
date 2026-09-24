// Arithmetic over the record — the one place Core 4 holds something the reply
// model does not.
//
// THE STANDARD THIS SUITE ENFORCES, and it is the standard three audits said
// everything else failed: could a frontier model with the current transcript
// produce this sentence? If yes, the finding is worthless, however clever the
// code that found it. So every case here is built so that the load-bearing
// facts — an earlier figure, a count of restatements, a withdrawn support — are
// present ONLY in the revision log and absent from any message.
//
// The negative cases matter as much as the positive ones. A mechanism that
// fires on a single correction, or on one estimate that moved, would be noise
// dressed as insight, and noise is what teaches a person to stop reading.

import { discoverFromHistory, renderHistory, HISTORY_KINDS } from './.tmp/history.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

const e = (over = {}) => ({
  id: 'e1', kind: 'claim', text: 'a thing', owner: 'user', stance: 'asserts', basis: 'quoted',
  quote: 'a thing', reason: '', status: 'active', confidence: 0.8, conversationId: 'c1',
  projectId: null, turn: 1, createdAt: NOW - 30 * DAY, updatedAt: NOW, revisions: [], ...over,
});
const rev = (at, from, change = 'text') => ({ at, by: 'user', change, from });
const find = (fs, kind) => fs.find((f) => f.kind === kind);

// ─────────────────────────────────────────────────────────────────────

console.log('=== a figure they have moved, and which way ===');
{
  // The 6 and the 13 are GONE from the conversation; only "nine weeks" remains.
  const drift = e({
    id: 'est', kind: 'claim', text: 'the rules engine is nine weeks of work',
    createdAt: NOW - 40 * DAY,
    revisions: [
      rev(NOW - 40 * DAY, 'the rules engine is four weeks of work'),
      rev(NOW - 20 * DAY, 'the rules engine is six weeks of work'),
    ],
  });
  const f = find(discoverFromHistory([drift], [], NOW), 'ESTIMATE_DRIFT');
  ok('a series of upward revisions is found', !!f, JSON.stringify(discoverFromHistory([drift], [], NOW).map((x) => x.kind)));
  ok('  with the actual trajectory, not "a few times"', /4 → 6 → 9/.test(f.what), f.what);
  ok('  and the multiplier computed', /1\.5×/.test(f.what), f.what);
  ok('  and it extrapolates on their own pattern', /nearer 1[0-9]/.test(f.whyItMatters), f.whyItMatters);
  ok('  and states why the transcript cannot yield it', /Only the latest figure \(9\)/.test(f.notInTranscript), f.notInTranscript);
  ok('  and how far back it reaches', f.spanDays === 40, String(f.spanDays));

  // One revision is a correction. Two figures is not a series.
  const once = e({ id: 'o', text: 'six weeks', revisions: [rev(NOW - 5 * DAY, 'four weeks')] });
  ok('a single correction is not a pattern', !find(discoverFromHistory([once], [], NOW), 'ESTIMATE_DRIFT'));
  // Up then down is a person converging, not drifting.
  const noisy = e({ id: 'n', text: 'five weeks', revisions: [rev(NOW - 9 * DAY, 'four weeks'), rev(NOW - 4 * DAY, 'nine weeks')] });
  ok('a figure that moves both ways is not a drift', !find(discoverFromHistory([noisy], [], NOW), 'ESTIMATE_DRIFT'));
  // Socria's own numbers are not the person's estimating pattern.
  const mine = e({ id: 'm', owner: 'socria', text: 'nine weeks', revisions: [rev(NOW - 9 * DAY, 'four weeks'), rev(NOW - 4 * DAY, 'six weeks')] });
  ok('Socria\'s own revisions are not a finding about them', !find(discoverFromHistory([mine], [], NOW), 'ESTIMATE_DRIFT'));
}

console.log('\n=== certainty that grew while the evidence did not ===');
{
  const hardening = e({
    id: 'h', kind: 'claim', text: 'the vendor engine cannot express ordering', confidence: 0.9,
    createdAt: NOW - 25 * DAY,
    revisions: [rev(NOW - 20 * DAY, 'the vendor engine probably cannot express ordering'), rev(NOW - 10 * DAY, 'the vendor engine cannot express ordering', 'status')],
  });
  const f = find(discoverFromHistory([hardening], [], NOW), 'CONFIDENCE_WITHOUT_EVIDENCE');
  ok('a position restated into certainty is found', !!f);
  ok('  with the count of restatements', /restated this 2 times/.test(f.what), f.what);
  ok('  and names repetition as the mechanism', /Repetition is doing the work/.test(f.whyItMatters));
  ok('  and says why no message contains this', /count of restatements/.test(f.notInTranscript));

  // Evidence arriving after the first restatement clears it — the belief
  // hardened for a reason, which is what is supposed to happen.
  const withEvidence = [hardening, e({ id: 'v', kind: 'evidence', text: 'ran the vendor trial, ordering is not expressible', createdAt: NOW - 8 * DAY })];
  ok('evidence arriving since clears it', !find(discoverFromHistory(withEvidence, [], NOW), 'CONFIDENCE_WITHOUT_EVIDENCE'));
  // A position stated once is not hardening.
  const fresh = e({ id: 'f', confidence: 0.9, revisions: [] });
  ok('a position stated once is not hardening', !find(discoverFromHistory([fresh], [], NOW), 'CONFIDENCE_WITHOUT_EVIDENCE'));
}

console.log('\n=== something they ruled out, back on the table ===');
{
  const ruled = e({
    id: 'r', kind: 'option', text: 'road pricing on the Elvegata corridor', status: 'rejected',
    stance: 'rejects', reason: 'it needs a national ministerial order, four to six years',
    turn: 2, updatedAt: NOW - 30 * DAY,
  });
  const back = e({ id: 'b', kind: 'option', text: 'a district access charge on the Elvegata corridor, two euro per entry', turn: 14 });
  const f = find(discoverFromHistory([ruled, back], [], NOW), 'REJECTED_RESURFACING');
  ok('a rejected option returning is found', !!f);
  ok('  carrying the reason they gave at the time', /ministerial order/.test(f.what), f.what);
  ok('  and putting the choice back to them', /still applies|change of mind|changed/.test(f.whyItMatters));
  ok('  with the reason placed in the record, not the thread', /in the record, not in the current thread/.test(f.notInTranscript));

  // Something rejected and never raised again is just history.
  ok('a rejection nobody revisited is not a finding', !find(discoverFromHistory([ruled], [], NOW), 'REJECTED_RESURFACING'));
  // The rejection must come FIRST — otherwise this is them ruling it out now.
  const ruledLater = e({ ...ruled, turn: 20 });
  ok('ruling something out now is not it resurfacing', !find(discoverFromHistory([ruledLater, back], [], NOW), 'REJECTED_RESURFACING'));
}

console.log('\n=== a belief still standing on something withdrawn ===');
{
  const base = e({
    id: 'base', kind: 'claim', text: 'the contractor lands the integration in March', status: 'rejected',
    revisions: [{ at: NOW - 12 * DAY, by: 'user', change: 'status', from: 'active', to: 'rejected', reason: 'we withdrew the contractor build' }],
  });
  const holder = e({ id: 'hold', kind: 'decision', text: 'the grant timeline starts in April', updatedAt: NOW });
  const links = [{ from: 'hold', to: 'base', rel: 'depends_on' }];
  const f = find(discoverFromHistory([base, holder], links, NOW), 'SUPPORT_WITHDRAWN');
  ok('a belief resting on a withdrawn support is found', !!f);
  ok('  naming what was withdrawn and why', /ruled out/.test(f.what) && /withdrew the contractor/.test(f.what), f.what);
  ok('  and that it was reasonable when the support was live', /reasonable position when the support was live/.test(f.whyItMatters));

  // Support still standing is not a finding — that is just a sound argument.
  const live = [e({ ...base, status: 'active', revisions: [] }), holder];
  ok('support that still stands is not a finding', !find(discoverFromHistory(live, links, NOW), 'SUPPORT_WITHDRAWN'));
  // A holder they have already dropped needs no warning.
  const bothGone = [base, e({ ...holder, status: 'superseded' })];
  ok('a belief they already dropped is not raised', !find(discoverFromHistory(bothGone, links, NOW), 'SUPPORT_WITHDRAWN'));
}

console.log('\n=== the same correction, across conversations, unnoticed ===');
{
  const mk = (id, conv, from, to) => e({
    id, conversationId: conv, text: `${to} weeks`, createdAt: NOW - 50 * DAY,
    revisions: [rev(NOW - 40 * DAY, `${from} weeks`)],
  });
  const three = [mk('a', 'c1', 6, 13), mk('b', 'c2', 6, 13), mk('c', 'c3', 4, 9)];
  const f = find(discoverFromHistory(three, [], NOW), 'REPEATED_REVISION');
  ok('three estimates each revised upward is a pattern', !!f);
  ok('  reporting each ratio and the mean', /2\.2×, 2\.2×, 2\.3×/.test(f.what) && /2\.2× on average/.test(f.what), f.what);
  ok('  and calling it a property of how they estimate', /property of how the estimates are made/.test(f.whyItMatters));
  ok('  and noting no single thread holds more than one', /spread over 3 conversations/.test(f.notInTranscript), f.notInTranscript);
  ok('two is not a pattern', !find(discoverFromHistory(three.slice(0, 2), [], NOW), 'REPEATED_REVISION'));
}

console.log('\n=== restraint, because noise teaches people to stop reading ===');
{
  ok('an empty record says nothing', discoverFromHistory([], [], NOW).length === 0);
  ok('a single fresh entry says nothing', discoverFromHistory([e({ revisions: [] })], [], NOW).length === 0);
  ok('a retracted entry is invisible', discoverFromHistory([e({ status: 'retracted', revisions: [rev(NOW - 9 * DAY, 'four weeks'), rev(NOW - 4 * DAY, 'six weeks')] })], [], NOW).length === 0);
  ok('nothing renders when nothing was found', renderHistory([]) === '');

  // At most one per kind, furthest-reaching first: a finding that spans
  // sessions is the one they are least able to make for themselves.
  const two = [
    e({ id: 'near', text: 'nine weeks', createdAt: NOW - 3 * DAY, revisions: [rev(NOW - 3 * DAY, 'four weeks'), rev(NOW - 2 * DAY, 'six weeks')] }),
    e({ id: 'far', text: 'nine weeks', createdAt: NOW - 60 * DAY, revisions: [rev(NOW - 60 * DAY, 'four weeks'), rev(NOW - 30 * DAY, 'six weeks')] }),
  ];
  const fs = discoverFromHistory(two, [], NOW);
  ok('one finding per kind', fs.filter((f) => f.kind === 'ESTIMATE_DRIFT').length === 1);
  ok('  and it is the one reaching furthest back', fs[0].ids[0] === 'far', JSON.stringify(fs[0].ids));
}

console.log('\n=== what the block is allowed to say ===');
{
  const f = discoverFromHistory([e({
    id: 'est', text: 'nine weeks', createdAt: NOW - 40 * DAY,
    revisions: [rev(NOW - 40 * DAY, 'four weeks'), rev(NOW - 20 * DAY, 'six weeks')],
  })], [], NOW);
  const block = renderHistory(f);
  ok('the block gives the figures', /4 → 6 → 9/.test(block), block);
  ok('  and says these come from the record and not the thread', /NOT in this thread/.test(block));
  ok('  and demands the numbers rather than a vague impression', /throws away the only part that helps/.test(block));
  ok('  and forbids sounding like surveillance', /never mention a ledger/.test(block) && /never imply surveillance/.test(block));
  ok('  and caps it at one', /Raise at most ONE/.test(block));
  ok('every kind is reachable', HISTORY_KINDS.length === 5);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
