// Feature gates — an access code entered under Manage Account opens a model
// that names a gate, on production (lib/feature-gates.ts,
// lib/feature-gates-server.ts). Logos 3 was the first; it is open to everyone
// now, so no model names a gate. The new Socria is the second
// (lib/new-socria.ts, test/new-socria.test.mjs): its code opens Logos 5's
// screen, so Manage Account asks for a code wherever that is offered. That
// code is handed out and this repository is public, so the server keeps only
// its fingerprint — and nothing here writes it either.
//
// Held here: the code is checked on the server, in any case and spacing; it
// never ships to the browser; what a browser or an account remembers can only
// name a gate that exists; a gated model would be hidden on production until
// its gate is open; and Logos 3 is no longer gated.

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountGates, gateOpen, normalizeCode, openGates } from './.tmp/feature-gates.mjs';
import { gateForCode } from './.tmp/feature-gates-server.mjs';
import { anyModelGated, isOffered, offeredModels } from './.tmp/socria-model-store.mjs';
import { SOCRIA_MODELS } from './.tmp/socria-prompt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const store = (v) => ({ getItem: () => v });

console.log('=== the code ===');
ok('LOGOS3 opens Logos 3', gateForCode('LOGOS3') === 'logos3');
ok('  in any case, with stray spaces', gateForCode(' logos3 ') === 'logos3' && gateForCode('Logos 3') === 'logos3');
ok('anything else opens nothing', gateForCode('LOGOS2') === null && gateForCode('') === null && gateForCode(null) === null && gateForCode('x'.repeat(500)) === null);
{
  const was = process.env.LOGOS3_ACCESS_CODE;
  process.env.LOGOS3_ACCESS_CODE = 'thinktogether';
  ok('the code can be replaced by an environment variable', gateForCode('THINKTOGETHER') === 'logos3' && gateForCode('LOGOS3') === null);
  if (was === undefined) delete process.env.LOGOS3_ACCESS_CODE; else process.env.LOGOS3_ACCESS_CODE = was;
}
ok('normalised for comparison only', normalizeCode(' lo gos3 ') === 'LOGOS3');
{
  // a stand-in for the real code, set the way an operator would replace it
  const was = process.env.NEW_SOCRIA_ACCESS_CODE;
  process.env.NEW_SOCRIA_ACCESS_CODE = 'mapsnotchats';
  ok('the new Socria\'s code opens its gate', gateForCode('MAPSNOTCHATS') === 'socria');
  ok('  in any case, with stray spaces', gateForCode(' mapsnotchats ') === 'socria' && gateForCode('Maps Not Chats') === 'socria');
  ok('  and nothing near it does', gateForCode('MAPSNOTCHAT') === null && gateForCode('MAPS') === null);
  ok('one code never opens the other', gateForCode('LOGOS3') === 'logos3' && gateForCode('MAPSNOTCHATS') !== 'logos3');
  if (was === undefined) delete process.env.NEW_SOCRIA_ACCESS_CODE; else process.env.NEW_SOCRIA_ACCESS_CODE = was;
}
{
  // unset, the code is the one handed out — kept on the server as its fingerprint alone
  const src = read('lib/feature-gates-server.ts');
  ok('unset, the server compares against the fingerprint it keeps', /const NEW_SOCRIA_FINGERPRINT = '[0-9a-f]{64}';/.test(src) && /socria \? fingerprint\(socria\) : NEW_SOCRIA_FINGERPRINT/.test(src));
  ok('  which a guess does not match', ['SOCRIA', 'NEWSOCRIA', 'LOGOS5', 'SOCRIA5', 'MAPSNOTCHATS'].every((g) => gateForCode(g) !== 'socria'));
}

console.log('\n=== what is remembered ===');
ok('a browser’s gates are read from storage', gateOpen('logos3', store('["logos3"]')) && !gateOpen('logos3', store('[]')));
ok('storage can only name gates that exist', openGates(store('["logos3","admin","root"]')).join() === 'logos3' && openGates(store('["socria","everything"]')).join() === 'socria');
ok('broken storage is no gates', openGates(store('{not json')).length === 0 && openGates({ getItem: () => { throw new Error('denied'); } }).length === 0);
ok('an account’s gates are read from its metadata, and only real ones', accountGates({ access: ['logos3', 'everything'] }).join() === 'logos3' && accountGates(null).length === 0);

console.log('\n=== Logos 3 on production ===');
const env = process.env.VERCEL_ENV;
process.env.VERCEL_ENV = 'production';
ok('open to everyone: listed with no code entered', isOffered('logos-3', []) && offeredModels([]).includes('logos-3'));
ok('  and still listed for someone who entered the old code', isOffered('logos-3', ['logos3']));
ok('Logos 2 and the Cores are not gated', isOffered('logos-2', []) && isOffered('core-4', []));
ok('no model names a gate, so there is nothing for a code to open', !anyModelGated() && Object.values(SOCRIA_MODELS).every((m) => !m.gate));
{
  // The rule itself stays, for the next model that names a gate. (Each module
  // under test is bundled with its own copy of the registry, so the rule is
  // read from the source rather than exercised with a borrowed gate.)
  const store = read('lib/socria-model-store.ts');
  ok('a gated model would be hidden on production until its gate is open', /!\(m\.gate && isProduction\(\) && !gates\.includes\(m\.gate\)\)/.test(store));
  ok('  and Manage Account would ask for its code', /some\(\(m\) => !!SOCRIA_MODELS\[m\]\.gate\)/.test(store));
}
process.env.VERCEL_ENV = 'preview';
ok('dev and preview list it freely', isOffered('logos-3', []));
if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;

console.log('\n=== wiring ===');
ok('the code never ships to the browser', !/LOGOS3['"]/.test(read('lib/feature-gates.ts')) && !/LOGOS3['"]/.test(read('components/account/AccessCode.tsx')) && /import 'server-only'/.test(read('lib/feature-gates-server.ts')));
{
  // NOR THE NEW SOCRIA'S, ANYWHERE: every word of the source, the docs and the
  // tests is fingerprinted the way the server fingerprints a typed code, and
  // none may be the code — so it is found without this file having to say it
  const fp = /const NEW_SOCRIA_FINGERPRINT = '([0-9a-f]{64})';/.exec(read('lib/feature-gates-server.ts'))?.[1];
  const words = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = join(dir, e.name);
      if (e.isDirectory()) { if (!['node_modules', '.next', '.tmp', '.git'].includes(e.name)) walk(rel); continue; }
      if (!/\.(ts|tsx|mjs|js|md|css|json|sql)$/.test(e.name)) continue;
      for (const w of read(rel).match(/[A-Za-z0-9]{6,32}/g) ?? []) words.add(w.toUpperCase());
    }
  };
  for (const d of ['app', 'components', 'lib', 'docs', 'test', 'scripts', 'supabase']) walk(d);
  for (const f of ['.env.example', 'README.md']) for (const w of read(f).match(/[A-Za-z0-9]{6,32}/g) ?? []) words.add(w.toUpperCase());
  const hit = [...words].some((w) => createHash('sha256').update(w).digest('hex') === fp);
  ok('  nor the new Socria\'s: no word in the source, the docs or the tests is its code', !!fp && words.size > 1000 && !hit, String(words.size));
}
ok('the route checks it, signed in and rate-limited', /gateForCode\(body\?\.code\)/.test(read('app/api/access/gate/route.ts')) && /enforceRateLimit/.test(read('app/api/access/gate/route.ts')) && /Unauthorized|Sign in/.test(read('app/api/access/gate/route.ts')));
ok('Manage Account has the field, shown while a model is gated or the new Socria is offered', /\{\(anyModelGated\(\) \|\| LOGOS5\.on\) && \(\s*<div className="sec">\s*<span className="lbl">Access code<\/span>\s*<AccessCode onOpened=\{onClose\} \/>/.test(read('components/account/AccountSheet.tsx')));
ok('the model menu re-reads what it offers when a gate opens', /GATE_CHANGED/.test(read('components/ModelPicker.tsx')));
ok('a link to Logos 3 obeys the same rule as the menu', /isOffered\(m as SocriaModel\)/.test(read('app/chat/page.tsx')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
