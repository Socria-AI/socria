// The word under the dots, and the day's chats.
//
// Two small things, both policy rather than mechanism, which is why they are
// tested apart from what they sit on: an indicator that lies is worse than one
// that says nothing, and a cap that eats somebody's conversation is worse than
// no cap at all.
//
// THE INDICATOR'S ONE RULE: never name an operation that is not running. Every
// marker is emitted from the place that does the work, and the tests below are
// about the presentation layer over those events — precedence when several run
// at once, and a minimum dwell so the truth does not change faster than a person
// can read it.
//
// THE CAP'S ONE RULE: it counts conversations STARTED, not messages sent. A
// thread already counted stays open however long it runs, and a database that
// cannot answer lets the turn through.

import {
  ACTIVITIES, ACTIVITY_MARK, ActivityTrack, encodeActivity, readActivity, shownActivity,
} from './.tmp/activity.mjs';
import {
  core4ChatAllowed,
  dayStart,
  monthStart,
  limitMessage,
  FREE_CORE4_CHATS_PER_MONTH,
} from './.tmp/limits.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

console.log('=== the vocabulary is honest and human ===');
{
  ok('every word is a present participle', ACTIVITIES.every((a) => /ing$/.test(a)), ACTIVITIES.join(','));
  ok('  lower case, one word', ACTIVITIES.every((a) => /^[a-z]+$/.test(a)));
  ok('thinking is in it, and is the default', ACTIVITIES.includes('thinking') && shownActivity([]) === 'thinking');
  // Nothing in the vocabulary names a model, a prompt, a module or an internal
  // stage. The person sees what is happening, not how it is built.
  const INTERNAL = /gpt|model|prompt|guard|allocat|intervene|ledger|graph|core|socria|eval|token/i;
  ok('no internal architecture is named', !ACTIVITIES.some((a) => INTERNAL.test(a)), ACTIVITIES.filter((a) => INTERNAL.test(a)).join(','));
}

console.log('\n=== markers ride the stream and never reach the page as text ===');
{
  const chunk = `Some prose. ${encodeActivity('verifying')}More prose.`;
  const r = readActivity(chunk);
  ok('the marker is pulled out', r.activities.join(',') === 'verifying', JSON.stringify(r.activities));
  ok('  and the prose survives whole', r.text === 'Some prose. More prose.', JSON.stringify(r.text));
  ok('  with nothing left over', r.tail === '');
  ok('the control character cannot be typed or written by a model',
    ACTIVITY_MARK === '\u0001' && ACTIVITY_MARK.charCodeAt(0) < 32);

  // A marker split across a chunk boundary: the partial line is held, not
  // printed, and completes on the next chunk.
  const whole = `before ${encodeActivity('searching')}after`;
  const a = readActivity(whole.slice(0, whole.indexOf('searching') + 3));
  ok('a split marker is held back as tail', a.activities.length === 0 && a.tail.startsWith(ACTIVITY_MARK), JSON.stringify(a));
  ok('  and its prose is still delivered', a.text === 'before ', JSON.stringify(a.text));
  const b = readActivity(a.tail + whole.slice(whole.indexOf('searching') + 3));
  ok('  then completes on the next chunk', b.activities.join(',') === 'searching' && b.text === 'after', JSON.stringify(b));

  // An unknown word is dropped rather than displayed: a future server must not
  // be able to print arbitrary text under the dots.
  const junk = readActivity(`x${ACTIVITY_MARK}rm -rf\ny`);
  ok('an unknown marker is dropped, not shown', junk.activities.length === 0 && junk.text === 'xy', JSON.stringify(junk));
}

console.log('\n=== concurrent operations pick the most meaningful word, not the newest ===');
{
  ok('searching beats thinking', shownActivity(['thinking', 'searching']) === 'searching');
  ok('reading beats remembering', shownActivity(['remembering', 'reading']) === 'reading');
  ok('examining and comparing resolve to one of them, stably',
    shownActivity(['examining', 'comparing']) === shownActivity(['comparing', 'examining']));
  ok('nothing running is thinking', shownActivity([]) === 'thinking');
}

console.log('\n=== it does not flicker ===');
{
  // The state read can finish in 300ms. A word that appears and vanishes inside
  // half a second is noise wearing the costume of information.
  const t = new ActivityTrack(700);
  ok('starts at thinking', t.current() === 'thinking');
  ok('a real operation shows immediately', t.start('remembering', 1000) === 'remembering');
  ok('  and holds while it is young', t.end('remembering', 1200) === 'remembering', t.current());
  ok('  releasing once it has been readable', t.end('remembering', 2000) === 'thinking', t.current());

  const u = new ActivityTrack(700);
  u.start('remembering', 0);
  ok('a more meaningful operation still has to wait its turn', u.start('searching', 200) === 'remembering');
  ok('  and takes over when the first has had its moment', u.start('searching', 900) === 'searching');
}

console.log('\n=== two conversations a month, counted as conversations ===');
{
  const allow = (over) =>
    core4ChatAllowed({ plan: 'free', usedThisMonth: [], conversationId: 'c-new', ...over });
  // The same number and period the rest of the product sells past, so a person
  // meets ONE boundary rather than two differently shaped ones.
  ok(`the limit is ${FREE_CORE4_CHATS_PER_MONTH}`, FREE_CORE4_CHATS_PER_MONTH === 2);
  ok('a first conversation is allowed', allow({}).allowed);
  ok('a second is', allow({ usedThisMonth: ['a'] }).allowed);
  ok('a third is not', !allow({ usedThisMonth: ['a', 'b'] }).allowed);
  // THE ONE THAT MATTERS: a conversation already counted stays open, however
  // many turns it runs and whenever they come back to it.
  ok('CONTINUING a counted conversation is always free',
    allow({ usedThisMonth: ['a', 'b'], conversationId: 'b' }).allowed);
  ok('  and it is not counted twice', allow({ usedThisMonth: ['a', 'a', 'b'], conversationId: 'b' }).used === 2);
  ok('One has no cap', allow({ plan: 'one', usedThisMonth: ['a', 'b', 'c', 'd'] }).allowed);
  // A read that failed is not a refusal: a cap that eats somebody's
  // conversation during a database blip is worse than a few turns of overage.
  ok('a failed count lets the turn through', allow({ usedThisMonth: [], countOk: false }).allowed);

  const spent = limitMessage(allow({ usedThisMonth: ['a', 'b'] }));
  ok('the message says the work is not gone', /stay open, and stay yours/.test(spent), spent);
  ok('  names what changes it', /Socria One/.test(spent));
  ok('  leaves a way to keep working', /Core 3\.1/.test(spent));
  ok('  counts in words, since it is two', /both of your free Core 4 conversations/.test(spent));
  ok('  and never counts down at them', !/left|remaining|\bonly\b/i.test(spent), spent);
}

console.log('\n=== the month boundary is fixed, not caller-supplied ===');
{
  const mid = Date.UTC(2026, 2, 14, 12, 30, 5);
  ok('a month starts at midnight UTC on the first', monthStart(mid) === Date.UTC(2026, 2, 1));
  ok('  and every moment in that month agrees',
    monthStart(Date.UTC(2026, 2, 31, 23, 59, 59)) === monthStart(mid));
  ok('  while the next one does not', monthStart(Date.UTC(2026, 3, 1, 0, 0, 1)) !== monthStart(mid));
  // December → January is where a naive month + 1 wraps into the wrong year.
  ok('  and the year rolls over correctly',
    monthStart(Date.UTC(2026, 11, 31, 23, 0)) === Date.UTC(2026, 11, 1) &&
    monthStart(Date.UTC(2027, 0, 1, 0, 30)) === Date.UTC(2027, 0, 1));
}

console.log('\n=== the day boundary is fixed, not caller-supplied ===');
{
  const noon = Date.UTC(2026, 2, 14, 12, 30, 5);
  ok('a day starts at midnight UTC', dayStart(noon) === Date.UTC(2026, 2, 14));
  ok('  and every moment in that day agrees', dayStart(Date.UTC(2026, 2, 14, 23, 59, 59)) === dayStart(noon));
  ok('  while the next one does not', dayStart(Date.UTC(2026, 2, 15, 0, 0, 1)) !== dayStart(noon));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
