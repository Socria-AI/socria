// WHAT BRINGS THEM, AND WHERE TO START — the onboarding's third and fourth
// beats (lib/onboarding-paths.ts, components/onboarding/FirstRunIntro.tsx).
// Held here: a handful of paths in a person's own words, each with three ways
// to start that are whole first messages; a role said only where a path is
// one; the ids a fixed vocabulary the dashboard can count; and the screen
// wired so that what they start is a conversation of its own, counted like
// any other.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS, PATH_IDS, pathOf, pathForRole, usesFor } from './.tmp/onboarding-paths.mjs';
import { ROLES } from './.tmp/onboarding-roles.mjs';
import { answerAllowed, kindsFor } from './.tmp/dashboard-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const INTENTS = ['decide', 'understand', 'develop', 'problem', 'research'];

console.log('\n=== the paths: what brings them, in their own words ===');
ok('six, each its own', PATHS.length === 6 && new Set(PATH_IDS).size === 6);
ok('studying and trying to understand something are among them', !!pathOf('study') && pathOf('understand')?.title === 'Understanding something');
for (const p of PATHS) {
  ok(`${p.id}: a title, a line, an icon, three ways to start`, !!p.title && p.line.length > 10 && !!p.icon && p.uses.length === 3, JSON.stringify(p));
  ok(`${p.id}: each way to start is a whole first message, of a known kind`, p.uses.every((u) => u.text.length >= 40 && u.text.length <= 180 && /[.?!]$/.test(u.text) && INTENTS.includes(u.intent) && !!u.title), JSON.stringify(p.uses));
  ok(`${p.id}: says a role only when it is one`, p.role === null || ROLES.some((r) => r.id === p.role));
}
const allUses = PATHS.flatMap((p) => p.uses);
ok('no way to start twice', new Set(allUses.map((u) => u.id)).size === allUses.length && new Set(allUses.map((u) => u.text)).size === allUses.length);
ok('in British spelling, plainly', !allUses.some((u) => /\b(color|center|organize|realize|analyze|behavior)\b/i.test(u.text)));
ok('"trying to understand something" and "a decision" say nothing about a life', pathOf('understand').role === null && pathOf('decide').role === null);
ok('a role an earlier onboarding was told leads to its path, or to none', pathForRole('study')?.id === 'study' && pathForRole('create')?.id === 'write' && pathForRole('lead') === null && pathForRole(null) === null);
const mixed = usesFor(null);
ok('with no path, one way in from each of four', mixed.length === 4 && new Set(mixed.map((u) => u.id.split('-')[0])).size === 4);
ok('with a path, its own three', usesFor(pathOf('research')).every((u) => u.id.startsWith('research-')));

console.log('\n=== counted as kinds, never words ===');
ok('every path is an allowed answer to "what brings you"', PATH_IDS.every((id) => answerAllowed('who', id)));
ok('  and so is every earlier role, for the counts already kept', ROLES.every((r) => answerAllowed('who', r.id)));
ok('a path is counted as itself', JSON.stringify(kindsFor('onboarding_answered', { step: 'who', kind: 'understand' })) === '["who:understand"]');
ok('a made-up one is refused', kindsFor('onboarding_answered', { step: 'who', kind: 'astronaut' }) === null);

console.log('\n=== the screen ===');
const intro = read('components/onboarding/FirstRunIntro.tsx');
const css = read('components/onboarding/welcome.css');
const app = read('components/LogosApp.tsx');
const prem = intro.slice(intro.indexOf('export const PREMISE'), intro.indexOf('/* ── words, rising'));
const said = [...prem.matchAll(/t: '([^']*)'/g)].map((m) => m[1]).join('');
ok(
  'it opens on what Socria is, in its own words',
  said === 'Socria is Human-First AI built to expand what people can see, understand, and do, without surrendering the ability to think for themselves.We’re not building humanity’s replacement. We’re building technology that makes humanity more capable.',
  said,
);
const greens = [...prem.matchAll(/t: '([^']*)', hl: true/g)].map((m) => m[1]);
ok('the parts that matter are set in green', greens.join('|') === 'Human-First AI|expand what people can see, understand, and do|think for themselves|makes humanity more capable', greens.join('|'));
ok('  green in every theme — the words, nothing behind them — typed out a character at a time', /\.obw-hl \{\s*color: var\(--obw-green\);\s*\}/.test(css) && /html\[data-theme='dark'\] \.ob-first\.obw \{[^}]*--obw-green:/.test(css) && /html\[data-theme='night'\] \.ob-first\.obw \{[^}]*--obw-green:/.test(css) && !/obw-swash|obw-glow/.test(css) && /function Typed\(/.test(intro) && /prefers-reduced-motion: reduce\)'\)\.matches\) \{\s*setTyped\(total\);/.test(intro));
ok('then the name, what brings them, and where to start', /const order: Beat\[\] = \['premise', 'name', 'who', 'thought'\]/.test(intro) && /What brings you to Socria\?/.test(intro) && /Where shall we start/.test(intro));
ok('a way to start fills the field, to change or send — it never sends by itself', /setText\(u\.text\)/.test(intro) && !/onStart\(u\.text/.test(intro));
ok('or their own words', /placeholder="Or in your own words…"/.test(intro));
ok('nothing moves for someone who asked for less motion', /prefers-reduced-motion: no-preference/.test(css) && /prefers-reduced-motion: reduce/.test(css));
ok('a Logic Map draws itself behind, a node per answer', /function ObMap\(\{ lit \}/.test(intro) && /const LIT: Record<Beat, number> = \{ premise: 1, name: 3, who: 5, thought: 7 \}/.test(intro));

console.log('\n=== what they start is a conversation of its own, and it counts ===');
ok('the welcome starts a line of thinking of its own — never appended to one already open', /firstRun\.reach\('socria\.intro'\);[\s\S]{0,260}startFromHome\(text\);/.test(app));
ok('  and so does the sentence carried from /onboarding', /seeded\.current = true;[\s\S]{0,140}startFromHome\(initialInput\);/.test(app));
ok('it is counted like any other: no flag, no gift', !/firstThought|This one was on us|X-Socria-First-Thought/.test(app + intro));
ok('a free plan is told so under the field, with what is left', /It counts as one of your \$\{limit\} free conversations this month — \$\{left\} left\./.test(app) && /startNote=\{welcomeNote\}/.test(app));
ok('  never to Socria One, a guest, or before the plan is known', /if \(!isSignedIn \|\| one \|\| !planKnown\) return null;/.test(app));
ok('the account’s first name starts the name field', /defaultName=\{user\?\.firstName \?\? null\}/.test(app));
ok('a new account sees it once — even one that brought a guest’s line of thinking along', /wantsWelcome\(firstRun\.state, \{/.test(app) && /accountAgeMs: user\?\.createdAt/.test(app) && /synced: firstRun\.synced/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
