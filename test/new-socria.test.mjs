// The new Socria, and the code it shipped behind (lib/new-socria.ts).
//
// "Push to main but add a code to access the new socria." Logos 5 — the
// Universal Map as home, the map as the screen, the Core chats brought into
// it, "We killed the chatbot." — shipped to production for whoever entered
// its code under Manage Account; everybody else kept the Logos they had, in
// its Logos 4 layout. On 24 October 2026 that layout was archived with the
// Core chat (docs/ARCHIVE.md): Logos 5 is everybody's, and the code no longer
// chooses the screen. (The code is handed out, and this repository is public:
// the server keeps only its fingerprint, and nothing here writes it.) Held
// here:
//
//   - what opens its gate: the code entered in this browser, on a deployment
//     that offers Logos 5 at all, and nothing else;
//   - what the gate names: Logos 5 with the code, Logos 4 without, wherever a
//     name is still read from it — and the guide on the one screen says
//     Logos 5;
//   - what it used to switch on is the new screen's, for everybody, and the
//     deployment's switch is still not read for it: opening on the map, a
//     first message put in the map's box, the Core chats moved in, the
//     welcome, and the record saying it opened once the record has been read;
//   - and where the code is still entered, and how it is remembered.
// The code itself, and that it never reaches the browser:
// test/feature-gates.test.mjs. A guest's Logos 5: test/guest.test.mjs.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEW_SOCRIA_GATE, logosName, newSocriaOpen } from './.tmp/new-socria.mjs';
import { gateForCode } from './.tmp/feature-gates-server.mjs';
import { GATE_LABEL } from './.tmp/feature-gates.mjs';
import { usedBefore, wantsWhatsNew, EMPTY_FIRST_RUN } from './.tmp/first-run.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const store = (v) => ({ getItem: () => v });

console.log('=== what opens it ===');
{
  const was = process.env.NEW_SOCRIA_ACCESS_CODE;
  process.env.NEW_SOCRIA_ACCESS_CODE = 'mapsnotchats';
  ok('its code opens the new Socria\'s gate', gateForCode('MAPSNOTCHATS') === NEW_SOCRIA_GATE && NEW_SOCRIA_GATE === 'socria');
  if (was === undefined) delete process.env.NEW_SOCRIA_ACCESS_CODE; else process.env.NEW_SOCRIA_ACCESS_CODE = was;
}
ok('  named for what it is under Manage Account', GATE_LABEL.socria === 'The new Socria');
ok('a browser that entered it has it', newSocriaOpen(store('["socria"]')) === true);
ok('one that did not, does not', newSocriaOpen(store('[]')) === false && newSocriaOpen(store(null)) === false);
ok('  nor one holding only the old Logos 3 code', newSocriaOpen(store('["logos3"]')) === false);
ok('  nor broken storage', newSocriaOpen(store('{nope')) === false && newSocriaOpen({ getItem: () => { throw new Error('blocked'); } }) === false);
{
  const flags = read('lib/new-socria.ts');
  ok('and never on a deployment that switched Logos 5 off', /return LOGOS5\.on && gateOpen\(NEW_SOCRIA_GATE, store\)/.test(flags));
}

console.log('\n=== what it is called ===');
ok('Logos 5 with the code', logosName(true) === 'Logos 5');
ok('Logos 4 without it', logosName(false) === 'Logos 4');
{
  // The model menu that named the current Logos was deleted with the Core models; nothing else lists models.
  // The "Try Logos" pill and the Logos cover on Core were archived with the Core chat (docs/ARCHIVE.md).
  const app = read('components/LogosApp.tsx');
  // Logos's own gate, the cover naming the Logos behind it, was archived too: a guest gets Logos 5 (test/guest.test.mjs).
  ok('the guide on Logos names the one Logos there is', /<LogosGuide [^>]*name="Logos 5"/.test(app));
  ok('a start offered to somebody new names no version it may not open', /'logos-3': 'See it laid out \(Logos\)'/.test(read('lib/onboarding-intents.ts')));
}

console.log('\n=== what it switched on is the new screen\'s, for everybody ===');
{
  const app = read('components/LogosApp.tsx');
  // The gate choosing the screen (Logos 5 where it was open, the Logos 4 layout elsewhere) was archived: Logos 5 is everybody's.
  ok('the deployment\'s switch is never read alone here', !/LOGOS5\.on/.test(app));
  ok('opening on the map, and a first message put in its box, as they land', /if \(!wanted && !pendingStart && sorted\.some\(\(x\) => x\.messages\.length > 0\)\) setL5Home\(true\);/.test(app) && /const \{ id, message \} = pendingStart;[\s\S]{0,160}setHomeStart\(message\);/.test(app));
  ok('the Core chats are moved in only on the new screen', /if \(!l5 \|\| !cloud \|\| hydrating \|\| !firstRun\.ready\) return;[\s\S]{0,400}\/api\/conversations\/merge/.test(app));
  ok('  and listed beside these only there', /if \(!l5\) return \[\];[\s\S]{0,600}kind: 'core' as const/.test(app));
  ok('the welcome on the map only on the map', /const homeShown = l5 && /.test(app) && /const whatsNewShown =\s*homeShown &&/.test(app));
  // Entering the code while Logos is open no longer moves anyone onto the map: the code no longer opens a screen (archived).
  // The record's "it opened" no longer waits for the gate, on Logos, on Core or on the first-run page; Core's welcome went with the Core chat (archived).
  const hook = read('components/useFirstRun.ts');
  ok('the record waits: "it opened" is reached only once the record has been read', /if \(ready\) reach\('socria\.opened'\);/.test(hook));
}

console.log('\n=== told what changed when it opens, not before ===');
{
  // used the old Socria before the deploy, kept using it after, entered the code later
  const at = { 'socria.intro': 1000, 'core.first': 5000 };
  const before = { ...EMPTY_FIRST_RUN, at: { ...at } };
  ok('before the code, the record holds no "it opened"', !('socria.opened' in before.at));
  const opened = { ...EMPTY_FIRST_RUN, at: { ...at, 'socria.opened': 9000 } };
  ok('once it opens, what they did before it was the old Socria\'s', usedBefore(opened, [6000, 8000]));
  ok('  so the welcome is theirs', wantsWhatsNew(opened, { work: [6000], hydrated: true, synced: true, introShowing: false }));
  const fresh = { ...EMPTY_FIRST_RUN, at: { 'socria.opened': 9000 } };
  ok('somebody whose first visit is with the code is not told something changed', !usedBefore(fresh, [9500]));
}

console.log('\n=== where the code is entered ===');
{
  const sheet = read('components/account/AccountSheet.tsx');
  ok('Manage Account asks for it wherever the new Socria is offered', /\(anyModelGated\(\) \|\| LOGOS5\.on\) &&/.test(sheet));
  const access = read('components/account/AccessCode.tsx');
  ok('opened, it says so and leads there', /socria: \{ href: '\/chat\?model=logos-3', says: 'Open the new Socria →' \}/.test(access));
  ok('  remembered on the account too, so another device has it', /user\.update\(\{ unsafeMetadata: \{ \.\.\.user\.unsafeMetadata, access: \[\.\.\.had, gate\] \} \}\)/.test(access));
  const hook = read('components/useNewSocria.ts');
  ok('and every screen follows it as it changes — here, in another tab, from another device', /addEventListener\(GATE_CHANGED, read\)/.test(hook) && /addEventListener\('storage', read\)/.test(hook));
  ok('  a server-rendered screen starts closed, so its markup matches the server\'s', /useState\(\(\) => atOnce && typeof window !== 'undefined' && newSocriaOpen\(\)\)/.test(hook));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
