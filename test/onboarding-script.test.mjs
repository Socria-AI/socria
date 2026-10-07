// The handover from the first-run screen to a composer — and nothing else.
//
// This suite used to check a table of rehearsed replies. The table is gone:
// the first reply a person reads is the product's own. What is left to get
// wrong is the carry — reading it twice, trusting a bad value, losing the
// surface it was written for.

import { carry, takeCarried, CARRY_KEY } from './.tmp/onboarding-script.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const store = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

console.log('=== the carry ===');
{
  const s = store();
  carry(s, { text: '  Offered a job. ', intent: 'decide', surface: 'logos' });
  const first = takeCarried(s);
  ok('what was carried comes back', first?.text === '  Offered a job. ' && first.intent === 'decide');
  ok('  with the surface it was written for', first?.surface === 'logos');
  ok('a second read is null', takeCarried(s) === null);
  ok('  and the key is gone', s.getItem(CARRY_KEY) === null);

  const c = store();
  carry(c, { text: 'x', intent: null });
  ok('no surface means the chat', takeCarried(c)?.surface === undefined);

  const bad = store();
  bad.setItem(CARRY_KEY, '{not json');
  ok('a corrupt value is null, not a crash', takeCarried(bad) === null);
  const empty = store();
  empty.setItem(CARRY_KEY, JSON.stringify({ text: '   ' }));
  ok('an empty sentence is null', takeCarried(empty) === null);
  const junk = store();
  junk.setItem(CARRY_KEY, JSON.stringify({ text: 'ok', surface: 'elsewhere', intent: 7 }));
  const got = takeCarried(junk);
  ok('an unknown surface is dropped, a non-string intent is null', got?.surface === undefined && got?.intent === null);
  const long = store();
  carry(long, { text: 'y'.repeat(5000), intent: null });
  ok('the sentence is capped', (takeCarried(long)?.text.length ?? 0) === 2000);
  const sent = store();
  carry(sent, { text: 'Why does my model fit only the training data?', intent: 'understand', surface: 'logos', send: true });
  ok('onboarding asks for it to be sent on landing', takeCarried(sent)?.send === true);
  const kept = store();
  carry(kept, { text: 'q', intent: null });
  ok('anything else is left in the composer', takeCarried(kept)?.send === undefined);
  const forged = store();
  forged.setItem(CARRY_KEY, JSON.stringify({ text: 'q', send: 'yes' }));
  ok('only a real true sends', takeCarried(forged)?.send === undefined);
  const thrower = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
  carry(thrower, { text: 'z', intent: null });
  ok('a blocked store never throws', takeCarried(thrower) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
