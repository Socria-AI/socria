// Themes — Paper, White, Dark and the Socria One blue (lib/theme.ts, app/themes.css).
//
// Paper is the default and the absence of a theme; Dark is everyone's; White
// and the One blue come with Socria One and are refused, not just hidden,
// for anyone else. A theme is variables only, on the app's own routes.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveTheme, readTheme, themeAppliesTo, THEME_BOOT, THEME_IDS, THEMES } from './.tmp/theme.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

ok('four themes: paper, white, dark, one', THEME_IDS.join(',') === 'paper,white,dark,one');
ok('paper and dark are everyone’s; white and the One blue are One’s', !THEMES.paper.one && !THEMES.dark.one && THEMES.white.one && THEMES.one.one);
ok('the default is paper', effectiveTheme(undefined, false) === 'paper' && effectiveTheme('nonsense', true) === 'paper');
ok('a member gets what they chose', effectiveTheme('one', true) === 'one' && effectiveTheme('white', true) === 'white');
ok('a free account choosing a One theme is shown paper', effectiveTheme('one', false) === 'paper' && effectiveTheme('white', false) === 'paper');
ok('dark needs no membership', effectiveTheme('dark', false) === 'dark');
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
ok('  and leaves paper as no attribute at all', boot('/chat', 'paper').theme === null);
ok('  and ignores anything that is not a theme', boot('/chat', '"><script>').theme === null);
ok('  and never themes a page outside the app', boot('/', 'dark').theme === null);

const css = read('app/themes.css');
for (const t of ['white', 'dark', 'one']) ok(`${t} is defined as variables`, new RegExp(`html\\[data-theme="${t}"\\]\\s*\\{`).test(css));
ok('no theme block for paper — paper is every variable’s fallback', !/data-theme="paper"/.test(css));
const tw = read('tailwind.config.ts');
ok('Tailwind’s paper, ink, moss and surface read the theme, falling back to paper', /var\(--c-paper, 245 243 235\)/.test(tw) && /var\(--c-ink, 31 31 31\)/.test(tw) && /var\(--c-surface, 255 255 255\)/.test(tw) && /var\(--c-moss-600, 94 118 51\)/.test(tw));
ok('the layout boots the theme and scopes it to the app', /THEME_BOOT/.test(read('app/layout.tsx')) && /<ThemeScope \/>/.test(read('app/layout.tsx')));
ok('the account sheet offers the themes', /<ThemePicker isOne=\{isOne\}/.test(read('components/account/AccountSheet.tsx')));
ok('a locked theme cannot be chosen', /if \(locked\) return;/.test(read('components/account/ThemePicker.tsx')));
ok('both app surfaces put a lapsed member back on paper', /useThemeGuard\(/.test(read('app/chat/page.tsx')) && /useThemeGuard\(one, planKnown\)/.test(read('components/LogosApp.tsx')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
