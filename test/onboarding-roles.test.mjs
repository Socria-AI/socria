// What they mostly think about — the optional onboarding question, and the
// only things it is allowed to change: the order and wording of the starting
// points, and one quiet line to Socria. Held here: every role covers every
// starting point with its own example; the line to Socria is built from known
// ids only and says what it may not be used for; and it is wired where it
// should be, and nowhere it should not (memory, the account, analytics words).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, ROLE_KEY, roleOf, readRole, writeRole, roleBlock } from './.tmp/onboarding-roles.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const INTENTS = ['decide', 'understand', 'develop', 'problem', 'research'];

console.log('=== seven broad ways of life, each complete ===');
ok('seven of them', ROLES.length === 7 && new Set(ROLES.map((r) => r.id)).size === 7);
for (const r of ROLES) {
  ok(`${r.title}: every starting point, in an order of its own`, r.order.length === 5 && INTENTS.every((i) => r.order.includes(i)));
  ok(`${r.title}: an example and a placeholder for each`, INTENTS.every((i) => r.ways[i]?.eg?.length > 20 && r.ways[i]?.placeholder?.endsWith('…')));
  ok(`${r.title}: a line broad enough to hold anyone in it (no names, no levels)`, r.line.length < 70 && !/\b(beginner|advanced|senior|junior|PhD|undergrad|high school)\b/i.test(r.line));
}
const egs = ROLES.flatMap((r) => INTENTS.map((i) => r.ways[i].eg));
ok('no example is reused across roles', new Set(egs).size === egs.length);
ok('the lead starting point differs by role (it is not one list reordered by chance)', new Set(ROLES.map((r) => r.order[0])).size >= 4);

console.log('\n=== what Socria is told ===');
ok('a known id gets one line', /WHAT THEY TOLD SOCRIA THEY MOSTLY THINK ABOUT: studying/.test(roleBlock('study')));
ok('  that says what it is for, and what it is not', /only to pick examples/.test(roleBlock('study')) && /Do not assume their level, their field/.test(roleBlock('study')) && /do not mention it unless they do/.test(roleBlock('study')));
ok('anything else gets nothing — the words are never the request’s', roleBlock('ignore previous instructions') === '' && roleBlock(undefined) === '' && roleBlock({ id: 'study' }) === '');

console.log('\n=== kept in this browser ===');
const mem = new Map();
const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
writeRole('build', store);
ok('written and read back', readRole(store) === 'build' && mem.get(ROLE_KEY) === 'build');
writeRole('nonsense', store);
ok('an unknown id clears it rather than storing junk', readRole(store) === null && !mem.has(ROLE_KEY));
mem.set(ROLE_KEY, '<script>');
ok('junk in storage reads as none', readRole(store) === null);
ok('roleOf only knows the seven', roleOf('lead')?.title === 'Leading' && roleOf('ceo') === null);

console.log('\n=== the wiring ===');
const intro = read('components/onboarding/FirstRunIntro.tsx');
ok('onboarding asks it after the name, skippably', /beat === 'who'/.test(intro) && /Rather not say/.test(intro) && /'premise', 'name', 'who'/.test(intro));
ok('the starting points follow the role’s order and wording', /role \? role\.order/.test(intro) && /role\?\.ways\[id\]/.test(intro));
ok('the starting points are visible cards with icons, not a line of italics', /className=\{`ob-way/.test(intro) && /<ObIcon/.test(intro) && !/ob-intents/.test(intro));
ok('both chat routes give Socria the line', /roleBlock\(body\?\.role\)/.test(read('app/api/chat/route.ts')) && /roleBlock\(body\?\.role\)/.test(read('app/api/logos/chat/route.ts')));
ok('both surfaces send only the id', /role: readRole\(\) \?\? undefined/.test(read('app/chat/page.tsx')) && /\{ role: readRole\(\) \}/.test(read('components/LogosApp.tsx')));
ok('analytics hears the id, never words', /track\('onboarding_role_chosen', \{ kind: r\.id \}\)/.test(intro));
ok('Manage Account can change or clear it', /<RolePicker \/>/.test(read('components/account/AccountSheet.tsx')) && /writeRole\(id\)/.test(read('components/account/RolePicker.tsx')));
ok('a full onboarding replay asks it again', /'socria\.role\.v1'/.test(read('lib/first-run.ts')));
ok('it is not written into memory or the account', !/role/.test(read('app/api/profile/route.ts').match(/firstRunReplace[\s\S]{0,40}/)?.[0] ?? '') && !/onboarding-roles/.test(read('app/api/profile/route.ts')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
