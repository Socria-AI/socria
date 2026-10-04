// Which model somebody opens on.
//
// Everyone used to land on Core 2 — the model that needs no account —
// including people who have one and people paying for the environment Core 2
// is not. The product opened on its own weakest surface and waited to be
// corrected.
//
// CORE 2 RETIRES ON 2 OCTOBER, so the last person landing there was the
// signed-out visitor, and that has moved up rather than out: Core 3.1 is open
// with no account, and an account now buys Logos, Core 4 and everything that
// needs somewhere to keep a map. `canUseCore3` became `hasAccount` in the same
// change, because a flag named after a permission it no longer grants is a
// comment that lies.
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
  offeredModels,
  readStoredModel,
  rememberModel,
  withdrawnTo,
} from './.tmp/socria-model-store.mjs';
import { SOCRIA_MODELS as MODELS } from './.tmp/socria-prompt.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readFile = (p) => readFileSync(join(root, p), 'utf8');

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
  const auto = (hasAccount, isOne) => autoModel({ hasAccount, isOne });

  ok('a visitor with no account opens on Core 3.1', auto(false, false) === 'core-3');
  ok('somebody signed in opens on Core 3.1 too', auto(true, false) === 'core-3');
  // LOGOS 1 IS WITHDRAWN, so the member's default is its successor. The rule
  // itself still names `logos`; `autoModel` sends it on. That indirection is
  // the point — turning a model off is one line in the registry, and this
  // assertion is what stops somebody "simplifying" it back into a hard pair.
  ok('a member opens in the Logos surface that is offered', auto(true, true) === 'logos-2');
  ok('...which is not the withdrawn one', auto(true, true) !== 'logos');
  ok('nobody is landed on a model with a retirement date', auto(false, false) !== 'core-2' && auto(true, false) !== 'core-2');

  // The one combination that should not exist, answered safely anyway: a plan
  // claim from a browser with no account must not open a surface the API
  // would bounce every message from.
  ok('One with no account still opens on Core 3.1', auto(false, true) === 'core-3');

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
  chooseModel('core-4');
  ok('a chosen model is stored', readStoredModel() === 'core-4');
  ok('...and is marked as chosen', modelWasChosen() === true);

  // And the flag is sticky: a later default write must not quietly clear it,
  // or the next load would start overriding them again.
  rememberModel('logos');
  ok('a later default does not un-choose', modelWasChosen() === true);
  // The write lands verbatim; the READ is where a withdrawn model hands over.
  // Both halves are asserted, because storing the successor instead would lose
  // what the person actually picked and they would not get it back when the
  // model returns.
  ok('...and what was written is what is stored',
    localStorage.getItem(MODEL_KEY) === 'logos');
  ok('...while reading it back gives the surface that is offered',
    readStoredModel() === 'logos-2');
}

console.log('\n=== what the rule does to each kind of person ===');
{
  // The whole policy, composed the way the page composes it: honour a choice,
  // otherwise resolve by entitlement.
  const opens = ({ hasAccount, isOne }) =>
    modelWasChosen() ? readStoredModel() : autoModel({ hasAccount, isOne });

  fresh();
  ok('a first-time visitor: Core 3.1', opens({ hasAccount: false, isOne: false }) === 'core-3');

  fresh();
  ok('signing in: Core 3.1', opens({ hasAccount: true, isOne: false }) === 'core-3');

  fresh();
  ok('subscribing: Logos', opens({ hasAccount: true, isOne: true }) === 'logos-2');

  // THE ONE THAT MATTERS. A member who deliberately went back to Core must
  // stay there — being returned to Logos on every visit is the product
  // arguing with somebody about their own preference.
  fresh();
  chooseModel('core-3');
  ok('a member who chose Core stays on Core',
    opens({ hasAccount: true, isOne: true }) === 'core-3');
  ok('...and again the visit after', opens({ hasAccount: true, isOne: true }) === 'core-3');

  // The reverse, which is why the default is written without the flag: a
  // lapsed member has never chosen anything, so they are moved off Logos
  // rather than left on a surface they are out of chats for.
  fresh();
  rememberModel('logos');
  ok('a lapsed member is moved back to Core 3.1',
    opens({ hasAccount: true, isOne: false }) === 'core-3');

  // Somebody who chose Logos on the free tier keeps it — Logos is theirs,
  // two lines of thinking a month, and a lapse is not a reason to take the
  // surface away.
  fresh();
  chooseModel('logos');
  ok('a free person who chose Logos keeps a Logos surface',
    opens({ hasAccount: true, isOne: false }) === 'logos-2');

  // Signing out is the exception the page enforces separately, because the
  // API would bounce every message. Asserted here as the rule it is.
  // Signing out no longer costs anybody Core 3.1 — it is open — so the
  // clamp is about the surfaces an account carries.
  fresh();
  chooseModel('logos');
  const signedOut = opens({ hasAccount: false, isOne: false });
  ok('a choice they can no longer use is still their choice, until clamped',
    signedOut === 'logos-2');
  ok('...and the clamp answers Core 3.1', autoModel({ hasAccount: false, isOne: false }) === 'core-3');
}

console.log('\n=== the way back out of Logos ===');
{
  // Unchanged behaviour, asserted because the new write path runs through the
  // same function: leaving Logos must not demote somebody who was on Core 3.1
  // before they opened it.
  fresh();
  ok('with nothing stored, the way back is Core 3.1', lastCoreModel() === 'core-3');

  chooseModel('core-3');
  chooseModel('logos');
  ok('Logos is not remembered as the Core model', lastCoreModel() === 'core-3');

  fresh();
  rememberModel('core-4');
  rememberModel('logos');
  ok('and a default write behaves the same way', lastCoreModel() === 'core-4');
  // Core 2 still stores and still returns: it answers until 2 October, and a
  // retirement that took somebody out of a conversation early would be the
  // one thing worse than the retirement.
  ok('a model with a date on it is still a model', readStoredModel() === 'logos-2');
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
  ok('the way back survives', lastCoreModel() === 'core-3');
  let threw = false;
  try { rememberModel('core-3'); chooseModel('logos'); } catch { threw = true; }
  ok('and writing survives', threw === false);
  // The rule itself never touches storage, so it still answers.
  ok('the default is still decided', autoModel({ hasAccount: true, isOne: true }) === 'logos-2');
}

console.log('\n=== junk in storage is not a model ===');
{
  fresh();
  // 'core-4' used to belong on this list: it was a `soon` teaser, never
  // selectable, so never a valid stored model. It is a real Core now and is
  // covered by test/core-4 instead. A future teaser goes back here.
  for (const junk of ['', 'core-5', 'LOGOS', 'null', '{}', 'gpt-4']) {
    localStorage.setItem(MODEL_KEY, junk);
    ok(`"${junk}" is not a stored model`, readStoredModel() === null);
  }
  localStorage.setItem(MODEL_KEY, 'logos');
  ok('a real one still reads', readStoredModel() === 'logos-2');
  // Logos 2 is real and selectable — it must store like any other.
  localStorage.setItem(MODEL_KEY, 'logos-2');
  ok('Logos 2 is a stored model', readStoredModel() === 'logos-2');
}

console.log('\n=== leaving a logos surface returns to a Core model ===');
{
  fresh();
  rememberModel('core-3');
  rememberModel('logos');   // a logos surface must not become "last core"
  ok('nor does plain Logos', lastCoreModel() === 'core-3');
}

console.log('\n=== the retirement is data, and it has happened ===');
{
  // Core 2 carried a leaving date until 2 October, shown in the picker. Past
  // the date it is withdrawn: still able to answer a conversation that was on
  // it, offered to nobody, and nobody whose browser holds it is stranded.
  const docs = readFile('app/docs/content/core-2.tsx');
  ok('Core 2 is withdrawn, with the reason beside the switch', typeof MODELS['core-2'].withdrawn === 'string' && /2 October/.test(MODELS['core-2'].withdrawn));
  ok('  and offered to nobody', !offeredModels().includes('core-2'));
  ok('nothing is leaving any more', Object.values(MODELS).filter((m) => m.leaving).length === 0);
  ok('the model’s own page says it retired', /retired on 2 October/.test(docs));
  ok('  and where the free tier went', /Core 3\.1/.test(docs));

  // The other half of the same change: Core 3.1 is what a signed-out visitor
  // now opens on, so it cannot require an account.
  ok('Core 3.1 needs no account', MODELS['core-3'].requiresAuth === false);
  ok('Core 2 still answers a conversation that was on it', MODELS['core-2'].requiresAuth === false && !MODELS['core-2'].soon);
  ok('the surfaces that keep something still need one',
    MODELS['logos'].requiresAuth && MODELS['core-4'].requiresAuth);
  ok('the menu no longer offers Core 2 as the way in, signed out',
    /Core 3\.1 stays open, signed out/.test(readFile('components/ModelPicker.tsx')));
}

console.log('\n=== a withdrawn model: still there, not offered, not stranding anybody ===');
{
  // TEMPORARY, AND THE TESTS SAY SO. Logos 1 is held back while Logos 2 is
  // the surface being worked on. What is asserted here is the MECHANISM, not
  // the fact that this particular model is off — so the day the line comes out
  // of the registry, these tests keep passing and nothing has to be unpicked.

  const held = Object.keys(MODELS).filter((id) => MODELS[id].withdrawn);
  ok('a withdrawn model says why, in a sentence',
    held.every((id) => typeof MODELS[id].withdrawn === 'string' && MODELS[id].withdrawn.length > 20));
  // "Withdrawn" is not "removed" and not "soon". The model is still registered,
  // still has an engine, and still answers whoever is already inside it; what
  // it does not do is get OFFERED. `soon` would be the opposite claim — a model
  // that does not exist yet — so a model must not carry both.
  ok('and it is still a model: registered, labelled, with an engine',
    held.every((id) =>
      typeof MODELS[id].label === 'string' && MODELS[id].label.length > 0 &&
      typeof MODELS[id].defaultOpenAIModel === 'string' &&
      MODELS[id].defaultOpenAIModel.length > 0));
  ok('and withdrawn is not the same claim as soon',
    held.every((id) => !MODELS[id].soon));
  // AND IT STILL ANSWERS. Withdrawal is a decision about what gets OFFERED,
  // made on the client; no API route may read it, or somebody mid-conversation
  // in a model we turned off would have their next message bounced — which is
  // taking the work away, not holding the model back.
  const routes = [
    'app/api/chat/route.ts',
    'app/api/logos/chat/route.ts',
    'app/api/logos/map/route.ts',
  ];
  ok('no API route reads the withdrawn flag',
    routes.every((f) => !/withdrawn/.test(readFile(f))));

  // The successor is found by SHAPE. A withdrawn Logos surface hands over to a
  // Logos surface; a withdrawn Core would hand over to a Core. Asserted as the
  // rule rather than as the pair, because the pair is what goes stale.
  for (const id of held) {
    const to = withdrawnTo(id);
    ok(`${id} has a successor`, to !== null);
    if (to) {
      ok(`  ${to} is the same kind of surface`,
        !!MODELS[to].logosSurface === !!MODELS[id].logosSurface);
      ok('  and it is one that is actually offered',
        !MODELS[to].withdrawn && !MODELS[to].soon);
    }
  }

  // Nothing routes INTO a withdrawn model, by any of the three doors.
  fresh();
  ok('the automatic default never lands on one',
    !MODELS[autoModel({ hasAccount: true, isOne: true })].withdrawn &&
    !MODELS[autoModel({ hasAccount: true, isOne: false })].withdrawn &&
    !MODELS[autoModel({ hasAccount: false, isOne: false })].withdrawn);

  for (const id of held) {
    fresh();
    chooseModel(id);
    ok(`a stored ${id} reads back as something offered`,
      !MODELS[readStoredModel()].withdrawn);
    ok('  ...and the raw choice is kept, so restoring the model restores them',
      localStorage.getItem(MODEL_KEY) === id);
    rememberModel(id);
    ok('  ...and it never becomes the way back out of Logos',
      !MODELS[lastCoreModel()].withdrawn);
  }

  // EVERY MENU HAS TO AGREE. There are two: the Core picker beside the
  // composer, and Logos's own inside its composer. Logos's used to iterate
  // `Object.keys(SOCRIA_MODELS)` with no filter, so the model that had just
  // been held back was still one click away on the surface replacing it.
  // The rule is `offeredModels` and it is in the store; these assert that
  // neither menu builds its own list again.
  const picker = readFile('components/ModelPicker.tsx');
  const chat = readFile('app/chat/page.tsx');
  const logos = readFile('components/LogosApp.tsx');
  const rollsOwn = (src) => /Object\.keys\(SOCRIA_MODELS\)/.test(src);

  ok('the Core picker takes its list from the store', /offeredModels\(\)/.test(picker));
  ok('  and does not build one of its own', !rollsOwn(picker));
  ok('the Logos picker is the same picker, so it shows the same list', /<ModelPicker value=\{model\}/.test(logos) && !/lg-model-btn/.test(logos));
  ok('  and does not build one of its own', !rollsOwn(logos));
  ok('offeredModels leaves out everything withdrawn',
    offeredModels().every((id) => !MODELS[id].withdrawn && !MODELS[id].soon));
  ok('  and leaves in everything else',
    offeredModels().length === Object.keys(MODELS).filter(
      (id) => !MODELS[id].withdrawn && !MODELS[id].soon).length);

  ok('the chat page refuses to select one', /withdrawn/.test(chat));
  ok('  and sends a ?model= link for one to the successor',
    /withdrawnTo/.test(chat));

  // The other half of the same bug: Logos assumed WHICH Logos it was. With
  // two surfaces and one withdrawn, an assumed id means the composer names
  // the wrong model and ticks the wrong row.
  ok('the Logos surface is told which one it is', /model = 'logos',/.test(logos));
  ok('  and /chat tells it', /model=\{model\}/.test(chat));
  ok('  so "the one you are on" is not a hard-coded id',
    /if \(next === model\) return;/.test(logos));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
