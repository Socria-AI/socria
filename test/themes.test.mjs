// Themes — Paper, White, Dark, Celestial and the Socria One blue (lib/theme.ts, app/themes.css).
//
// Paper is the default and the absence of a theme; Dark and Celestial are
// everyone's — Celestial (stored as 'night', its first name) is deep space,
// the whole app under a sky and the Universal Map a star chart;
// White and the One blue come with Socria One and are refused, not just
// hidden, for anyone else. A theme is variables only, on the app's own routes.
// Logos 5 reads them too: its surfaces' own tokens are given for every dark
// ground, and the map becomes a star chart on Celestial (test/celestial.test.mjs).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveTheme, readTheme, themeAppliesTo, THEME_BOOT, THEME_IDS, THEMES } from './.tmp/theme.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

ok('five themes: paper, white, dark, night, one', THEME_IDS.join(',') === 'paper,white,dark,night,one');
ok('paper, dark and night are everyone’s; white and the One blue are One’s', !THEMES.paper.one && !THEMES.dark.one && !THEMES.night.one && THEMES.white.one && THEMES.one.one);
ok('night is Celestial now — the key kept, so a choice made under the old name holds — a dark ground with a sky of a swatch', THEMES.night.id === 'night' && THEMES.night.scheme === 'dark' && THEMES.night.label === 'Celestial' && THEMES.night.swatch[0] === '#060A1A');
ok('the default is paper', effectiveTheme(undefined, false) === 'paper' && effectiveTheme('nonsense', true) === 'paper');
ok('a member gets what they chose', effectiveTheme('one', true) === 'one' && effectiveTheme('white', true) === 'white');
ok('a free account choosing a One theme is shown paper', effectiveTheme('one', false) === 'paper' && effectiveTheme('white', false) === 'paper');
ok('dark needs no membership, and nor does night', effectiveTheme('dark', false) === 'dark' && effectiveTheme('night', false) === 'night');
ok('a broken store reads as paper', readTheme({ getItem: () => { throw new Error('denied'); } }) === 'paper' && readTheme(null) === 'paper');
ok('the app’s routes are themed', ['/chat', '/chat/abc', '/account', '/memory', '/projects/x'].every(themeAppliesTo));
ok('the journal, docs and pages about Socria keep their paper', ['/', '/docs', '/docs/logos-2', '/journal', '/logos', '/one', '/chatter'].every((p) => !themeAppliesTo(p)));

// The boot script, run against a fake page.
function boot(path, stored) {
  const attrs = {}; const style = {};
  const document = { documentElement: { setAttribute: (k, v) => (attrs[k] = v), style } };
  const localStorage = { getItem: () => stored };
  const location = { pathname: path };
  new Function('document', 'localStorage', 'location', THEME_BOOT)(document, localStorage, location);
  return { theme: attrs['data-theme'] ?? null, scheme: style.colorScheme ?? null };
}
ok('the head script applies a stored theme before paint', boot('/chat', 'dark').theme === 'dark' && boot('/chat', 'dark').scheme === 'dark');
ok('  night too', boot('/chat', 'night').theme === 'night' && boot('/chat', 'night').scheme === 'dark');
ok('  and leaves paper as no attribute at all', boot('/chat', 'paper').theme === null);
ok('  and ignores anything that is not a theme', boot('/chat', '"><script>').theme === null);
ok('  and never themes a page outside the app', boot('/', 'dark').theme === null);

const css = read('app/themes.css');
for (const t of ['white', 'dark', 'night', 'one']) ok(`${t} is defined as variables`, new RegExp(`html\\[data-theme="${t}"\\]\\s*\\{`).test(css));
ok('what every dark ground needs is given to night too', /html:is\(\[data-theme="dark"\], \[data-theme="one"\], \[data-theme="night"\]\) body/.test(css));
const uni = read('components/logos5/universe.css');
ok('on Celestial the Universal Map is a star chart: its own dust drifting at depth, glowing sessions, gold names', /html\[data-theme="night"\] \.logos-root \.l5 \.l5n-sky \{\s*display: block;[^}]*var\(--cel-dust/.test(uni) && /html\[data-theme="night"\] \.logos-root \.l5 \.l5b-disc \{[^}]*box-shadow/.test(uni) && /html\[data-theme="night"\] \.logos-root \.l5 \.l5h \{[^}]*--l5b-name: rgba\(240, 216, 158/.test(uni));
ok('on every dark ground a session is a light disc with dark words', /html:is\(\[data-theme="dark"\], \[data-theme="one"\], \[data-theme="night"\]\) \.logos-root \.l5 \.l5h \{[^}]*--l5b-on: #141b2b/.test(uni));
ok('the map’s colours are variables every dark ground turns up', /html:is\(\[data-theme="dark"\], \[data-theme="one"\], \[data-theme="night"\]\) \.logos-root \.l5 \.l5h \{[^}]*--sc-clay/.test(uni));
ok('the picker offers five, a little sky for night', /\.theme\[data-theme-id="night"\] \.theme-swatch/.test(read('app/account-sheet.css')) && /repeat\(5,/.test(read('app/account-sheet.css')));
ok('no theme block for paper — paper is every variable’s fallback', !/data-theme="paper"/.test(css));
const tw = read('tailwind.config.ts');
ok('Tailwind’s paper, ink, moss and surface read the theme, falling back to paper', /var\(--c-paper, 245 243 235\)/.test(tw) && /var\(--c-ink, 31 31 31\)/.test(tw) && /var\(--c-surface, 255 255 255\)/.test(tw) && /var\(--c-moss-600, 94 118 51\)/.test(tw));
ok('the layout boots the theme and scopes it to the app', /THEME_BOOT/.test(read('app/layout.tsx')) && /<ThemeScope \/>/.test(read('app/layout.tsx')));
ok('the account sheet offers the themes', /<ThemePicker isOne=\{isOne\}/.test(read('components/account/AccountSheet.tsx')));
ok('a locked theme cannot be chosen', /if \(locked\) return;/.test(read('components/account/ThemePicker.tsx')));
// The Core chat was the other surface, and it was archived; /chat still shows a Project's home and a
// shared thread without Logos 5 mounted (app/chat/page.tsx), so the page needs its own guard for those.
ok('Logos 5 puts a lapsed member back on paper', /useThemeGuard\(one, planKnown\)/.test(read('components/LogosApp.tsx')));
ok('  and so does /chat, for the pages it shows without Logos 5', /useThemeGuard\(/.test(read('app/chat/page.tsx')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
