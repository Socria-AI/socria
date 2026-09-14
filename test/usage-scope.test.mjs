// Which row is allowed to speak for which counter.
//
// This suite exists because of one shipped bug with a user's name on it. A
// per-conversation marker was written with the counter name `chats` into the
// `chat:<id>` namespace. `chats` is a MONTHLY counter. The panel query asks
// for the month and the conversation together and folded them into a map
// keyed by counter alone — so the marker came back looking like the month's
// tally and overwrote it, and whether somebody had chats left depended on
// which row the database returned last.
//
// Everything below is that bug, held down from several directions.

import {
  foldUsageRows,
  chatScopeFor,
  chatMarkerScope,
} from './.tmp/usage-scope.mjs';
import { COUNTER_SCOPE } from './.tmp/entitlements.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const MONTH = '2026-09';
const CHAT = chatScopeFor('sess_abc');

console.log('=== the two namespaces are not the same namespace ===');
{
  // The whole bug in one assertion.
  ok('a marker is not a per-conversation counter row',
    chatMarkerScope('sess_abc') !== chatScopeFor('sess_abc'),
    `${chatMarkerScope('sess_abc')} vs ${chatScopeFor('sess_abc')}`);

  // And not merely different — the marker must not even be a PREFIX match that
  // a future `.like('chat:%')` query would sweep up.
  ok('the marker does not start with the conversation prefix',
    !chatMarkerScope('sess_abc').startsWith('chat:'),
    chatMarkerScope('sess_abc'));
  ok('the conversation scope does start with chat:',
    chatScopeFor('sess_abc').startsWith('chat:'));

  // Both stay bounded, whatever the client sends as a session id.
  const long = 'x'.repeat(500);
  ok('conversation scope is bounded', chatScopeFor(long).length <= 65);
  ok('marker scope is bounded', chatMarkerScope(long).length <= 69);
  // Distinct ids stay distinct after truncation of a realistic length.
  ok('two ids do not collide', chatScopeFor('sess_a') !== chatScopeFor('sess_b'));
}

console.log('\n=== THE REGRESSION: a marker must never be read as the month ===');
{
  // Exactly the rows production held. The month says 1; a marker for the open
  // conversation also carries counter `chats`. Under the old fold the marker
  // won whenever it came last, and the user was told a different story about
  // their month depending on row order.
  // The two n values are deliberately DIFFERENT. With both at 1 this test
  // passes against the broken fold as well, and proves nothing.
  const rows = [
    { counter: 'chats', scope: MONTH, n: 1 },
    { counter: 'chats', scope: 'chat:sess_abc', n: 2 },
  ];
  const got = foldUsageRows(rows, MONTH, CHAT);
  ok('the month tally survives a same-counter row from the conversation',
    got.chats === 1, JSON.stringify(got));

  // The order must not matter. This is the actual failure mode: the database
  // returns rows in whatever order it likes.
  const reversed = foldUsageRows([...rows].reverse(), MONTH, CHAT);
  ok('and the answer does not depend on row order',
    reversed.chats === got.chats, JSON.stringify(reversed));

  // The dangerous direction: a marker must never INFLATE the month toward the
  // limit, because that is what locks somebody out of a product they paid
  // nothing to be locked out of.
  const inflate = foldUsageRows(
    [
      { counter: 'chats', scope: MONTH, n: 1 },
      { counter: 'chats', scope: 'chat:a', n: 2 },
      { counter: 'chats', scope: 'chat:b', n: 2 },
    ],
    MONTH,
    chatScopeFor('a')
  );
  ok('markers cannot push the month up to the limit', inflate.chats === 1, JSON.stringify(inflate));

  // Markers written under the CORRECT new namespace are simply invisible here.
  const marked = foldUsageRows(
    [
      { counter: 'chats', scope: MONTH, n: 1 },
      { counter: 'chats', scope: chatMarkerScope('sess_abc'), n: 1 },
    ],
    MONTH,
    CHAT
  );
  ok('a correctly-namespaced marker is not folded in at all',
    marked.chats === 1, JSON.stringify(marked));
}

console.log('\n=== each counter is read from its own home ===');
{
  // A per-conversation counter is read from the conversation, not the month.
  const got = foldUsageRows(
    [
      { counter: 'files', scope: CHAT, n: 3 },
      { counter: 'files', scope: MONTH, n: 99 },
    ],
    MONTH,
    CHAT
  );
  ok('files comes from the conversation, not the month', got.files === 3, JSON.stringify(got));

  // And a monthly counter is read from the month, not the conversation.
  const chatsRows = [
    { counter: 'chats', scope: CHAT, n: 99 },
    { counter: 'chats', scope: MONTH, n: 2 },
  ];
  const got2 = foldUsageRows(chatsRows, MONTH, CHAT);
  ok('chats comes from the month, not the conversation', got2.chats === 2, JSON.stringify(got2));
  // Both orders — the broken fold only got this right when the month happened
  // to be last, which is not something a database promises.
  const got2r = foldUsageRows([...chatsRows].reverse(), MONTH, CHAT);
  ok('...in either row order', got2r.chats === 2, JSON.stringify(got2r));

  // Every counter the table declares round-trips from its declared home.
  for (const [counter, where] of Object.entries(COUNTER_SCOPE)) {
    const scope = where === 'month' ? MONTH : CHAT;
    const r = foldUsageRows([{ counter, scope, n: 7 }], MONTH, CHAT);
    ok(`${counter} reads from its declared ${where} scope`, r[counter] === 7, JSON.stringify(r));

    // ...and is NOT read from the other one.
    const wrong = where === 'month' ? CHAT : MONTH;
    const r2 = foldUsageRows([{ counter, scope: wrong, n: 7 }], MONTH, CHAT);
    ok(`${counter} is ignored in the wrong scope`, r2[counter] === undefined, JSON.stringify(r2));
  }
}

console.log('\n=== a different month, and no conversation ===');
{
  // Last month's rows are not this month's allowance.
  const stale = foldUsageRows([{ counter: 'chats', scope: '2026-08', n: 2 }], MONTH, CHAT);
  ok('a previous month is not folded in', stale.chats === undefined, JSON.stringify(stale));

  // With no conversation open, per-conversation counters have no home and are
  // skipped rather than guessed at.
  const noChat = foldUsageRows(
    [
      { counter: 'chats', scope: MONTH, n: 1 },
      { counter: 'files', scope: 'chat:whatever', n: 5 },
    ],
    MONTH,
    null
  );
  ok('the month still reads with no conversation', noChat.chats === 1);
  ok('per-conversation counters are skipped with no conversation',
    noChat.files === undefined, JSON.stringify(noChat));
}

console.log('\n=== nothing here is worth a 500 ===');
{
  // This runs behind the panel on every surface.
  ok('null rows', JSON.stringify(foldUsageRows(null, MONTH, CHAT)) === '{}');
  ok('undefined rows', JSON.stringify(foldUsageRows(undefined, MONTH, CHAT)) === '{}');
  ok('empty rows', JSON.stringify(foldUsageRows([], MONTH, CHAT)) === '{}');

  // Rows the table should never hold, but might.
  const junk = [
    null,
    undefined,
    {},
    { counter: 'chats' },
    { counter: 'chats', scope: MONTH },
    { counter: 'chats', scope: MONTH, n: 'two' },
    { counter: 'chats', scope: MONTH, n: NaN },
    { counter: 'chats', scope: MONTH, n: Infinity },
    { counter: 42, scope: MONTH, n: 1 },
    { counter: 'not_a_counter', scope: MONTH, n: 1 },
    { counter: '__proto__', scope: MONTH, n: 1 },
  ];
  let threw = null;
  let out;
  try { out = foldUsageRows(junk, MONTH, CHAT); } catch (e) { threw = e; }
  ok('malformed rows do not throw', threw === null, String(threw));
  ok('and none of them produce a count', out && out.chats === undefined, JSON.stringify(out));

  // An unknown counter name must not appear in the map at all — the panel
  // iterates the counters IT knows, but a stray key is how a prototype gets
  // polluted.
  ok('an unknown counter is not admitted', out && out.not_a_counter === undefined);
  ok('__proto__ is not admitted as a count',
    out && Object.prototype.hasOwnProperty.call(out, '__proto__') === false);
  ok('the prototype was not touched', ({}).n === undefined);

  // A good row among bad ones still reads.
  const mixed = foldUsageRows(
    [null, { counter: 'chats', scope: MONTH, n: 2 }, {}],
    MONTH,
    CHAT
  );
  ok('a valid row among junk still counts', mixed.chats === 2, JSON.stringify(mixed));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
