// Feature gates — an access code entered under Manage Account opens Logos 3
// on production (lib/feature-gates.ts, lib/feature-gates-server.ts).
//
// Held here: the code is checked on the server, in any case and spacing; it
// never ships to the browser; what a browser or an account remembers can only
// name a gate that exists; and Logos 3 is hidden on production until its gate
// is open, while dev and preview list it freely.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountGates, gateOpen, normalizeCode, openGates } from './.tmp/feature-gates.mjs';
import { gateForCode } from './.tmp/feature-gates-server.mjs';
import { isOffered, offeredModels } from './.tmp/socria-model-store.mjs';

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

console.log('\n=== what is remembered ===');
ok('a browser’s gates are read from storage', gateOpen('logos3', store('["logos3"]')) && !gateOpen('logos3', store('[]')));
ok('storage can only name gates that exist', openGates(store('["logos3","admin","root"]')).join() === 'logos3');
ok('broken storage is no gates', openGates(store('{not json')).length === 0 && openGates({ getItem: () => { throw new Error('denied'); } }).length === 0);
ok('an account’s gates are read from its metadata, and only real ones', accountGates({ access: ['logos3', 'everything'] }).join() === 'logos3' && accountGates(null).length === 0);

console.log('\n=== Logos 3 on production ===');
const env = process.env.VERCEL_ENV;
process.env.VERCEL_ENV = 'production';
ok('hidden until its gate is open', !isOffered('logos-3', []) && !offeredModels([]).includes('logos-3'));
ok('listed once it is', isOffered('logos-3', ['logos3']) && offeredModels(['logos3']).includes('logos-3'));
ok('Logos 2 and the Cores are not gated', isOffered('logos-2', []) && isOffered('core-4', []));
process.env.VERCEL_ENV = 'preview';
ok('dev and preview list it freely', isOffered('logos-3', []));
if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;

console.log('\n=== wiring ===');
ok('the code never ships to the browser', !/LOGOS3['"]/.test(read('lib/feature-gates.ts')) && !/LOGOS3['"]/.test(read('components/account/AccessCode.tsx')) && /import 'server-only'/.test(read('lib/feature-gates-server.ts')));
ok('the route checks it, signed in and rate-limited', /gateForCode\(body\?\.code\)/.test(read('app/api/access/gate/route.ts')) && /enforceRateLimit/.test(read('app/api/access/gate/route.ts')) && /Unauthorized|Sign in/.test(read('app/api/access/gate/route.ts')));
ok('Manage Account has the field', /<AccessCode onOpened=\{onClose\} \/>/.test(read('components/account/AccountSheet.tsx')));
ok('the model menu re-reads what it offers when a gate opens', /GATE_CHANGED/.test(read('components/ModelPicker.tsx')));
ok('a link to Logos 3 obeys the same rule as the menu', /isOffered\(m as SocriaModel\)/.test(read('app/chat/page.tsx')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
