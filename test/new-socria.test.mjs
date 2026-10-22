// The new Socria, behind its code (lib/new-socria.ts).
//
// "Push to main but add a code to access the new socria." Logos 5 — the
// Universal Map as home, the map as the screen, the Core chats brought into
// it, "We killed the chatbot." — ships to production for whoever enters its
// code under Manage Account; everybody else keeps the Logos they had, in its
// Logos 4 layout. (The code is handed out, and this repository is public:
// the server keeps only its fingerprint, and nothing here writes it.) Held
// here:
//
//   - what opens it: the code's gate in this browser, on a deployment that
//     offers Logos 5 at all, and nothing else;
//   - everything that switches the new Socria on reads that, not the
//     deployment's switch alone: the screen, opening on the map, a first
//     message put in the map's box, the Core chats moved in, the welcome on
//     both surfaces and the moment the record says it opened;
//   - the surface is called what it opens: Logos 5 with the code, Logos 4
//     without;
//   - and nothing is moved or hidden for somebody it has not opened for.
// The code itself, and that it never reaches the browser:
// test/feature-gates.test.mjs.

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
  const picker = read('components/ModelPicker.tsx');
  ok('the model menu names the current Logos by it — its row, its button and its sign-in line', /id === 'logos-3' \? logosName\(newSocria\)/.test(picker) && /<span className="nm">\{short\(id\)\}<\/span>/.test(picker) && /setNeeds\(short\(id\)\)/.test(picker));
  const page = read('app/chat/page.tsx');
  ok('so do the pill and the cover on Core', /<TryLogosPill[\s\S]*?name=\{logosName\(newSocria\)\}/.test(page) && /<LogosCover\s+as="modal"[\s\S]*?name=\{logosName\(newSocria\)\}/.test(page));
  const app = read('components/LogosApp.tsx');
  ok('  and the gate and the guide on Logos', /<LogosCover as="gate"[^>]*name=\{logosName\(newSocria\)\}/.test(app) && /<LogosGuide [^>]*name=\{logosName\(newSocria\)\}/.test(app));
  ok('a start offered to somebody new names no version it may not open', /'logos-3': 'See it laid out \(Logos\)'/.test(read('lib/onboarding-intents.ts')));
}

console.log('\n=== everything that switches it on reads the gate ===');
{
  const app = read('components/LogosApp.tsx');
  ok('the screen: Logos 5 only where the gate is open', /const newSocria = useNewSocria\(true\);/.test(app) && /const l5 = workspaceOn && newSocria;/.test(app));
  ok('  and the deployment\'s switch is never read alone here', !/LOGOS5\.on/.test(app));
  ok('opening on the map, and a first message put in its box, read the gate as they land', /workspace && newSocriaOpen\(\) && !wanted && !pendingStart/.test(app) && /workspace && newSocriaOpen\(\)\) setHomeStart\(message\)/.test(app));
  ok('the Core chats are moved in only on the new screen', /if \(!l5 \|\| !cloud \|\| hydrating \|\| !firstRun\.ready\) return;[\s\S]{0,400}\/api\/conversations\/merge/.test(app));
  ok('  and listed beside these only there', /if \(!l5\) return \[\];[\s\S]{0,600}kind: 'core' as const/.test(app));
  ok('the welcome on the map only on the map', /const homeShown = l5 && /.test(app) && /const whatsNewShown =\s*homeShown &&/.test(app));
  ok('the code entered while Logos is open opens the new Socria on its map', /if \(newSocria && !hadNewSocria\.current && !hydrating && workspaceOn\) setL5Home\(true\);/.test(app));
  ok('the record\'s "it opened" waits for the gate, on Logos', /useFirstRun\(\{ signedIn: !!isSignedIn, surface: 'logos', opened: newSocria \}\)/.test(app));

  const page = read('app/chat/page.tsx');
  ok('the welcome on Core only where the map it points to opens', /const showWhatsNew =\s*\/\/[^\n]*\n\s*newSocria &&/.test(page));
  ok('  and the record\'s "it opened" waits for the gate, on Core', /useFirstRun\(\{ signedIn: !!isSignedIn, surface: 'core', opened: newSocria \}\)/.test(page));
  ok('  and on the first-run page', /useFirstRun\(\{ signedIn: !!isSignedIn, surface, opened: newSocria \}\)/.test(read('components/onboarding/Onboarding.tsx')));
  const hook = read('components/useFirstRun.ts');
  ok('the record waits: "it opened" is reached only once it has', /const opened = opts\.opened !== false;/.test(hook) && /if \(ready && opened\) reach\('socria\.opened'\);/.test(hook));
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
