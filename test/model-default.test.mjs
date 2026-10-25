// Which model somebody opens on.
//
// Everyone used to land on Core 2 — the model that needs no account —
// including people who have one and people paying for the environment Core 2
// is not. The product opened on its own weakest surface and waited to be
// corrected.
//
// CORE 2 RETIRED ON 2 OCTOBER, and the signed-out visitor who last landed
// there moved up rather than out, to Core 3.1. The fix was to default by
// entitlement: Core 3.1 for everybody, the Logos surface for a member.
//
// ONE SURFACE SINCE 24 OCTOBER 2026. The Core chat was archived with every
// model but Logos 5 (docs/ARCHIVE.md), so there is no entitlement left to
// default by: everybody opens on Logos 5, and /chat chooses it on every
// visit. `autoModel` still takes `hasAccount` and `isOne`; this suite asserts
// that neither moves the answer.
//
// What the suite is still really about is one distinction: a model that is
// stored because the person picked it, and a model that is stored because we
// did — and beside it, that a withdrawn model stays a model, offered to nobody
// and stranding nobody. Get the first wrong and a default becomes "ignore
// what you asked for", which is worse than the bug it replaced.

import {
  MODEL_KEY,
  autoModel,
  chooseModel,
  modelWasChosen,
  offeredModels,
  readStoredModel,
  rememberModel,
  withdrawnTo,
  OTHER_MODELS,
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

console.log('=== the default: Logos 5, for everybody ===');
{
  const auto = (hasAccount, isOne) => autoModel({ hasAccount, isOne });

  // It used to be Core 3.1 for a visitor or a free account, and the Logos
  // surface on offer for a member. Every Core is archived now, so the answer
  // is the one surface whoever asks — a visitor with no account meets it
  // signed out rather than a different product.
  ok('a visitor with no account opens on Logos 5', auto(false, false) === 'logos-3');
  ok('somebody signed in opens on Logos 5 too', auto(true, false) === 'logos-3');
  ok('and so does a member', auto(true, true) === 'logos-3');
  ok('...which is the model the registry calls Logos 5, and offers',
    MODELS['logos-3'].short === 'Logos 5' && offeredModels().includes('logos-3'));
  ok('...which is not a withdrawn one', !MODELS[auto(true, true)].withdrawn);
  ok('nobody is landed on a model with a retirement date', auto(false, false) !== 'core-2' && auto(true, false) !== 'core-2');

  // The one combination that should not exist — a plan claim from a browser
  // with no account — had to be kept off a surface the API would bounce every
  // message from. With one surface it gets the answer everybody gets.
  ok('One with no account opens on Logos 5 as well', auto(false, true) === 'logos-3');

  ok('it is pure — same answer twice', auto(true, true) === auto(true, true));
}

console.log('\n=== ours versus theirs ===');
{
  fresh();
  ok('nothing stored to begin with', readStoredModel() === null);
  ok('and nothing chosen', modelWasChosen() === false);

  // What WE write is a default: it survives, but it never claims to be a
  // decision, so the automatic rule keeps applying on the next visit.
  rememberModel('logos-3');
  ok('a remembered model is stored', readStoredModel() === 'logos-3');
  ok('...but is still not a choice', modelWasChosen() === false);

  // What THEY write outranks it from then on. Core 4 is withdrawn, so its
  // write is asserted where it lands, as written; the read hands it on.
  chooseModel('core-4');
  ok('a chosen model is stored', localStorage.getItem(MODEL_KEY) === 'core-4');
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
  // Nothing is kept under Other models since the archive, so Logos 1 reads
  // back as its successor.
  ok('...while reading it back gives the surface that is offered',
    readStoredModel() === withdrawnTo('logos') && offeredModels().includes(readStoredModel()),
    String(readStoredModel()));
}

console.log('\n=== what the rule does to each kind of person ===');
{
  // The whole policy, composed the way the Core chat composed it: honour a
  // choice, otherwise the automatic default. /chat no longer composes it — it
  // chooses Logos 5 on every visit — but the store has to give that same
  // answer whoever comes and whatever they last picked.
  const opens = ({ hasAccount, isOne }) =>
    modelWasChosen() ? readStoredModel() : autoModel({ hasAccount, isOne });

  fresh();
  ok('a first-time visitor: Logos 5', opens({ hasAccount: false, isOne: false }) === 'logos-3');

  fresh();
  ok('signing in: Logos 5', opens({ hasAccount: true, isOne: false }) === 'logos-3');

  fresh();
  ok('subscribing: Logos 5', opens({ hasAccount: true, isOne: true }) === 'logos-3');

  // A member who deliberately went back to Core used to stay there. Every Core
  // is archived, so the choice is honoured the only way left: it opens where
  // their Core conversations went.
  fresh();
  chooseModel('core-3');
  ok('a member who chose Core opens where their Core conversations went',
    opens({ hasAccount: true, isOne: true }) === 'logos-3');
  ok('...and again the visit after', opens({ hasAccount: true, isOne: true }) === 'logos-3');

  // The lapsed member moved back to Core 3.1 went with the Core chat: there is no Core to move them to.

  // Somebody who chose Logos on the free tier keeps it — Logos is theirs,
  // and a lapse is not a reason to take the surface away. Logos 1 is no longer
  // kept under "Other models": chosen, it reads back as the surface offered.
  fresh();
  chooseModel('logos');
  const kept = opens({ hasAccount: true, isOne: false });
  ok('a free person who chose Logos keeps a Logos surface',
    kept !== null && !!MODELS[kept].logosSurface && !MODELS[kept].withdrawn, String(kept));

  // The clamp that sent a signed-out Logos choice to Core 3.1 went with the Core chat too.
}

// The way back out of Logos (lastCoreModel) went with the Core chat, archived on 24 October 2026.

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
  // The way back out of Logos was checked here; it went with the Core chat.
  let threw = false;
  try { rememberModel('core-3'); chooseModel('logos'); } catch { threw = true; }
  ok('and writing survives', threw === false);
  // The rule reads no stored model — only the open gates, behind a guard —
  // so it still answers.
  ok('the default is still decided', autoModel({ hasAccount: true, isOne: true }) === 'logos-3');
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
  localStorage.setItem(MODEL_KEY, 'logos-3');
  ok('a real one still reads', readStoredModel() === 'logos-3');
  // Logos 2 is real but archived — it must not read as junk, only be handed on.
  localStorage.setItem(MODEL_KEY, 'logos-2');
  ok('Logos 2 is a stored model, read as the surface offered',
    readStoredModel() !== null && readStoredModel() === withdrawnTo('logos-2'), String(readStoredModel()));
}

// Leaving a Logos surface for the last Core model went with the Core chat: there is no Core chat to return to.

console.log('\n=== the retirement is data, and it has happened ===');
{
  // Core 2 carried a leaving date until 2 October, shown in the picker. Past
  // the date it is withdrawn: still able to answer a conversation that was on
  // it, offered to nobody, and nobody whose browser holds it is stranded.
  const docs = readFile('app/docs/content/core-2.tsx');
  ok('Core 2 is withdrawn, with the reason beside the switch', typeof MODELS['core-2'].withdrawn === 'string' && /2 October/.test(MODELS['core-2'].withdrawn));
  // It was kept by name under "Other models" until the archive; nothing is kept there now.
  ok('  and not kept under Other models either', !OTHER_MODELS.includes('core-2') && !offeredModels().includes('core-2'));
  ok('  which the picker would still list apart from the current models', /OTHER_MODELS\.includes\(id\)/.test(readFile('components/ModelPicker.tsx')) && /Other models/.test(readFile('components/ModelPicker.tsx')));
  ok('nothing is leaving any more', Object.values(MODELS).filter((m) => m.leaving).length === 0);
  ok('the model’s own page says it retired', /retired on 2 October/.test(docs));
  ok('  and where the free tier went', /Core 3\.1/.test(docs));

  // The other half of the same change: Core 3.1 became what a signed-out
  // visitor opened on, so it could not require an account. Archived, it
  // still needs none — app/api/chat, which still answers a Core
  // conversation, reads that flag.
  ok('Core 3.1 needs no account', MODELS['core-3'].requiresAuth === false);
  ok('Core 2 still answers a conversation that was on it', MODELS['core-2'].requiresAuth === false && !MODELS['core-2'].soon);
  ok('the surfaces that keep something still need one',
    MODELS['logos'].requiresAuth && MODELS['core-4'].requiresAuth);
  // The menu's "Core 3.1 stays open, signed out" went with the Core chat: Core 3.1 is archived, so it is no way in.
}

console.log('\n=== a withdrawn model: still there, not offered, not stranding anybody ===');
{
  // Since 24 October 2026 every model but Logos 5 is withdrawn, archived with
  // the Core chat (docs/ARCHIVE.md). What is asserted here is the MECHANISM,
  // not which models are off — so the day a line comes out of the registry,
  // these tests keep passing and nothing has to be unpicked.

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
  // Logos surface; a withdrawn Core hands over to a Core while one is offered,
  // and — with every Core archived — to the Logos surface, where its
  // conversations now open. Asserted as the rule rather than as the pair,
  // because the pair is what goes stale.
  const isLogos = (id) => !!MODELS[id].logosSurface;
  for (const id of held) {
    const to = withdrawnTo(id);
    ok(`${id} has a successor`, to !== null);
    if (to) {
      const ownKindOffered = offeredModels().some((o) => o !== id && isLogos(o) === isLogos(id));
      ok(ownKindOffered ? `  ${to} is the same kind of surface` : `  ${to} is the Logos surface, with none of its own kind offered`,
        ownKindOffered ? isLogos(to) === isLogos(id) : isLogos(to));
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
    const back = readStoredModel();
    ok(`a stored ${id} reads back as something offered`,
      OTHER_MODELS.includes(id) ? back === id : back !== null && !MODELS[back].withdrawn, String(back));
    ok('  ...and the raw choice is kept, so restoring the model restores them',
      localStorage.getItem(MODEL_KEY) === id);
    // (Checked here too: that it never became the way back out of Logos — lastCoreModel, gone with the Core chat.)
  }

  // EVERY MENU HAS TO AGREE. There were two: the Core picker beside the
  // composer, and Logos's own inside its composer. Logos's used to iterate
  // `Object.keys(SOCRIA_MODELS)` with no filter, so the model that had just
  // been held back was still one click away on the surface replacing it.
  // Since the archive no surface mounts a model menu — there is one model —
  // but the picker is still a component, the rule is still `offeredModels`
  // in the store, and these assert that nothing builds its own list again.
  const picker = readFile('components/ModelPicker.tsx');
  const chat = readFile('app/chat/page.tsx');
  const logos = readFile('components/LogosApp.tsx');
  const rollsOwn = (src) => /Object\.keys\(SOCRIA_MODELS\)/.test(src);

  ok('the picker takes its list from the store', /offeredModels\(gates\)/.test(picker));
  ok('  and does not build one of its own', !rollsOwn(picker));
  // "The Logos picker is the same picker" went with it: Logos 5 mounts no model menu since the archive.
  ok('Logos does not build a menu of its own', !rollsOwn(logos) && !/lg-model-btn/.test(logos));
  ok('offeredModels leaves out everything withdrawn, except what is kept under Other models',
    offeredModels().every((id) => (!MODELS[id].withdrawn || OTHER_MODELS.includes(id)) && !MODELS[id].soon));
  ok('  and leaves in everything else',
    offeredModels().length === Object.keys(MODELS).filter(
      (id) => (!MODELS[id].withdrawn || OTHER_MODELS.includes(id)) && !MODELS[id].soon).length);

  // /chat selects by name now, on every visit, so it refuses a withdrawn
  // model by naming only the one that is offered.
  const selected = [...chat.matchAll(/chooseModel\(([^)]*)\)/g)].map((m) => m[1].trim());
  ok('the chat page refuses to select one: it selects Logos 5 alone, and that is offered',
    selected.length > 0 && selected.every((a) => a === "'logos-3'") && offeredModels().includes('logos-3'),
    selected.join(','));
  ok('  and drops a ?model= link for one, landing on Logos 5 — every withdrawn model’s successor',
    /searchParams\.delete\('model'\)/.test(chat) && held.every((id) => withdrawnTo(id) === 'logos-3'));

  // The other half of the same bug: Logos assumed WHICH Logos it was. An
  // assumed id means the surface reads the wrong model's switches — its
  // depth, the room and the workspace all come from SOCRIA_MODELS[model].
  ok('the Logos surface is told which one it is', /model = 'logos',/.test(logos));
  ok('  and /chat tells it: Logos 5', /<LogosApp\b[\s\S]*?\smodel="logos-3"/.test(chat));
  // "The one you are on" (pickModel's `next === model`) went with Logos's model menu.
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
