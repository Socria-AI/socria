// Which model somebody opens on.
//
// Everyone used to land on Core 2 — the model that needs no account —
// including people who have one and people paying for the environment Core 2
// is not. The product opened on its own weakest surface and waited to be
// corrected.
//
// The fix is to default by entitlement, and the whole risk of defaulting by
// entitlement is that it turns into OVERRIDING. So the suite is really about
// one distinction: a model that is stored because the person picked it, and a
// model that is stored because we did. Get that wrong and "open on your best
// surface" becomes "ignore what you asked for", which is worse than the bug
// it replaced.

import {
  MODEL_KEY,
  autoModel,
  chooseModel,
  lastCoreModel,
  modelWasChosen,
  readStoredModel,
  rememberModel,
} from './.tmp/socria-model-store.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** A browser's localStorage, near enough for a policy that only reads strings. */
function store() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}
const fresh = () => { globalThis.localStorage = store(); };
fresh();

console.log('=== the default, by entitlement ===');
{
  const auto = (canUseCore3, isOne) => autoModel({ canUseCore3, isOne });

  ok('a visitor with no account opens on Core 2', auto(false, false) === 'core-2');
  ok('somebody signed in opens on Core 3.1', auto(true, false) === 'core-3');
  ok('a member opens in Logos', auto(true, true) === 'logos');

  // Core 3.1 is what the typed access key grants, so a key-holder is not a
  // stranger — canUseCore3 is sign-in OR the key, and this reads that flag
  // rather than re-deciding who counts.
  ok('the flag is what decides, not how they earned it', auto(true, false) === 'core-3');

  // The one combination that should not exist, answered safely anyway: a
  // plan claim from somebody who cannot even use Core 3.1 must not open a
  // surface they will be bounced out of.
  ok('One without Core 3 access still opens on Core 2', auto(false, true) === 'core-2');

  ok('it is pure — same answer twice', auto(true, true) === auto(true, true));
}

console.log('\n=== ours versus theirs ===');
{
  fresh();
  ok('nothing stored to begin with', readStoredModel() === null);
  ok('and nothing chosen', modelWasChosen() === false);

  // What WE write is a default: it survives, but it never claims to be a
  // decision, so the automatic rule keeps applying on the next visit.
  rememberModel('core-3');
  ok('a remembered model is stored', readStoredModel() === 'core-3');
  ok('...but is still not a choice', modelWasChosen() === false);

  // What THEY write outranks it from then on.
  chooseModel('core-2');
  ok('a chosen model is stored', readStoredModel() === 'core-2');
  ok('...and is marked as chosen', modelWasChosen() === true);

  // And the flag is sticky: a later default write must not quietly clear it,
  // or the next load would start overriding them again.
  rememberModel('logos');
  ok('a later default does not un-choose', modelWasChosen() === true);
  ok('...though it still moves the stored model', readStoredModel() === 'logos');
}

console.log('\n=== what the rule does to each kind of person ===');
{
  // The whole policy, composed the way the page composes it: honour a choice,
  // otherwise resolve by entitlement.
  const opens = ({ canUseCore3, isOne }) =>
    modelWasChosen() ? readStoredModel() : autoModel({ canUseCore3, isOne });

  fresh();
  ok('a first-time visitor: Core 2', opens({ canUseCore3: false, isOne: false }) === 'core-2');

  fresh();
  ok('signing in: Core 3.1', opens({ canUseCore3: true, isOne: false }) === 'core-3');

  fresh();
  ok('subscribing: Logos', opens({ canUseCore3: true, isOne: true }) === 'logos');

  // THE ONE THAT MATTERS. A member who deliberately went back to Core must
  // stay there — being returned to Logos on every visit is the product
  // arguing with somebody about their own preference.
  fresh();
  chooseModel('core-3');
  ok('a member who chose Core stays on Core',
    opens({ canUseCore3: true, isOne: true }) === 'core-3');
  ok('...and again the visit after', opens({ canUseCore3: true, isOne: true }) === 'core-3');

  // The reverse, which is why the default is written without the flag: a
  // lapsed member has never chosen anything, so they are moved off Logos
  // rather than left on a surface they are out of chats for.
  fresh();
  rememberModel('logos');
  ok('a lapsed member is moved back to Core 3.1',
    opens({ canUseCore3: true, isOne: false }) === 'core-3');

  // Somebody who chose Logos on the free tier keeps it — Logos is theirs,
  // two lines of thinking a month, and a lapse is not a reason to take the
  // surface away.
  fresh();
  chooseModel('logos');
  ok('a free person who chose Logos keeps it',
    opens({ canUseCore3: true, isOne: false }) === 'logos');

  // Signing out is the exception the page enforces separately, because the
  // API would bounce every message. Asserted here as the rule it is.
  fresh();
  chooseModel('core-3');
  const signedOut = opens({ canUseCore3: false, isOne: false });
  ok('a choice they can no longer use is still their choice, until clamped',
    signedOut === 'core-3');
  ok('...and the clamp answers Core 2', autoModel({ canUseCore3: false, isOne: false }) === 'core-2');
}

console.log('\n=== the way back out of Logos ===');
{
  // Unchanged behaviour, asserted because the new write path runs through the
  // same function: leaving Logos must not demote somebody who was on Core 3.1
  // before they opened it.
  fresh();
  ok('with nothing stored, the way back is Core 2', lastCoreModel() === 'core-2');

  chooseModel('core-3');
  chooseModel('logos');
  ok('Logos is not remembered as the Core model', lastCoreModel() === 'core-3');

  fresh();
  rememberModel('core-2');
  rememberModel('logos');
  ok('and a default write behaves the same way', lastCoreModel() === 'core-2');
}

console.log('\n=== nothing here throws in a browser that refuses storage ===');
{
  // Private windows, blocked site data, and the thumbnail capture that runs
  // with no storage at all. Every accessor throws there, and a model picker
  // is not worth a white screen.
  globalThis.localStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  ok('reading survives', readStoredModel() === null);
  ok('the chosen flag survives', modelWasChosen() === false);
  ok('the way back survives', lastCoreModel() === 'core-2');
  let threw = false;
  try { rememberModel('core-3'); chooseModel('logos'); } catch { threw = true; }
  ok('and writing survives', threw === false);
  // The rule itself never touches storage, so it still answers.
  ok('the default is still decided', autoModel({ canUseCore3: true, isOne: true }) === 'logos');
}

console.log('\n=== junk in storage is not a model ===');
{
  fresh();
  // 'core-4' is a REAL id but a `soon` teaser — never selectable, so never a
  // valid stored active model. It belongs on this list for that reason.
  for (const junk of ['', 'core-4', 'LOGOS', 'null', '{}', 'gpt-4']) {
    localStorage.setItem(MODEL_KEY, junk);
    ok(`"${junk}" is not a stored model`, readStoredModel() === null);
  }
  localStorage.setItem(MODEL_KEY, 'logos');
  ok('a real one still reads', readStoredModel() === 'logos');
  // Logos 2 is real and selectable — it must store like any other.
  localStorage.setItem(MODEL_KEY, 'logos-2');
  ok('Logos 2 is a stored model', readStoredModel() === 'logos-2');
}

console.log('\n=== leaving a logos surface returns to a Core model ===');
{
  fresh();
  rememberModel('core-3');
  rememberModel('logos-2');   // a logos surface must not become "last core"
  ok('Logos 2 does not overwrite the last Core', lastCoreModel() === 'core-3');
  rememberModel('logos');
  ok('nor does plain Logos', lastCoreModel() === 'core-3');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
