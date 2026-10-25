// The newsletter box, by country.
//
// Unticked where the law wants an opt-in the person makes themselves — the
// EU and the rest of the EEA, the UK and its neighbours, Switzerland, Canada —
// ticked where a ticked box is allowed, and unticked where the country cannot
// be told. The failure this guards is a box that starts ticked for someone in
// Germany: a subscription that is not consent, recorded as if it were.
//
// The second half renders the real sign-up page, on the server, as a request
// from each place would be rendered, and reads the box out of the markup — so
// the chain from Vercel's header to the box's first state is checked whole.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OPT_IN_COUNTRIES, countryFrom, newsletterTickedByDefault } from './.tmp/newsletter-consent.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const ticked = (c) => newsletterTickedByDefault(c);

console.log('=== where the box starts unticked ===');
{
  const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
  ok('all 27 EU states are listed', EU.length === 27 && new Set(EU).size === 27);
  for (const c of EU) ok(`EU ${c}`, ticked(c) === false);
  for (const c of ['IS', 'LI', 'NO']) ok(`EEA ${c}`, ticked(c) === false);
  for (const c of ['GB', 'JE', 'GG', 'IM', 'GI']) ok(`UK and neighbours ${c}`, ticked(c) === false);
  ok('Switzerland', ticked('CH') === false);
  ok('Canada', ticked('CA') === false);
  for (const c of ['AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF']) ok(`EU territory ${c}`, ticked(c) === false);
  ok('"somewhere in Europe"', ticked('EU') === false);
  ok('every listed code is two capitals', [...OPT_IN_COUNTRIES].every((c) => /^[A-Z]{2}$/.test(c)));
}

console.log('\n=== where it starts ticked ===');
{
  ok('the US', ticked('US') === true);
  ok('as the header may write it', ticked(' us ') === true);
  ok('Puerto Rico', ticked('PR') === true);
}

console.log('\n=== where the country cannot be told ===');
{
  for (const v of [null, undefined, '', '  ', 'XX', 'ZZ', 'T1', 'A1', 'A2', 'O1', 'AP', 'USA', 'U', '12', 'D3']) {
    ok(`${JSON.stringify(v)} → unticked`, ticked(v) === false);
  }
  ok('countryFrom tidies a code', countryFrom(' de ') === 'DE');
  ok('countryFrom refuses a non-country', countryFrom('xx') === null && countryFrom('T1') === null);
}

// ── the page itself ──────────────────────────────────────────────────

const OUT = join(here, '.tmp', 'e2e-signup');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// What the page needs from Next and Clerk, reduced to what a server render
// asks of them: the request's headers, a router nobody presses, and Clerk
// not loaded yet — which is how the page renders on the server anyway.
const SHIMS = {
  'next/headers': `export function headers() { return new Headers(globalThis.__headers ?? {}); }
    export function cookies() { return { get: () => undefined, getAll: () => [] }; }`,
  'next/navigation': `export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} });`,
  '@clerk/nextjs': `export const useSignIn = () => ({ isLoaded: false, signIn: undefined, setActive: undefined });
    export const useSignUp = () => ({ isLoaded: false, signUp: undefined, setActive: undefined });`,
};
const shims = { name: 'shims', setup(b) {
  b.onResolve({ filter: /^(next\/headers|next\/navigation|@clerk\/nextjs)$/ }, (a) => ({ path: a.path, namespace: 'shim' }));
  b.onLoad({ filter: /.*/, namespace: 'shim' }, (a) => ({ contents: SHIMS[a.path], loader: 'js' }));
} };
await build({
  entryPoints: [join(here, 'helpers', 'signup-under-test.tsx')],
  bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'signup.mjs'),
  tsconfig: join(root, 'tsconfig.json'), jsx: 'automatic', loader: { '.css': 'empty' },
  alias: {
    'next/link': join(here, 'helpers', 'next-link-shim.mjs'),
    'next/image': join(here, 'helpers', 'next-image-shim.mjs'),
  },
  plugins: [shims],
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  logLevel: 'error',
});
const T = await import(pathToFileURL(join(OUT, 'signup.mjs')).href);

/** The box's first state in the markup: true ticked, false unticked, null absent. */
function box(html) {
  const m = html.match(/<label class="auth-check"><input type="checkbox"([^>]*)>/);
  return m ? /\bchecked\b/.test(m[1]) : null;
}
const page = (country) => {
  globalThis.__headers = country ? { 'x-vercel-ip-country': country } : {};
  return renderToStaticMarkup(h(T.SignUpPage, { searchParams: {} }));
};

console.log('\n=== the sign-up page, as each place sees it ===');
{
  const us = page('US');
  ok('the box is on the page', us.includes('Send me the Socria newsletter'));
  ok('from the US: ticked', box(us) === true);
  for (const c of ['DE', 'FR', 'IE', 'GB', 'CA', 'CH', 'NO']) ok(`from ${c}: unticked`, box(page(c)) === false);
  ok('no header (a local run): unticked', box(page(null)) === false);
  ok('a header that is not a country: unticked', box(page('XX')) === false);
  // What the page says a free account is: Logos 5, the one surface. The Core
  // models it used to name were archived (docs/ARCHIVE.md).
  ok('the page names Logos 5', us.includes('Logos 5: the conversation, and the map of your own reasoning drawn beside it.'));
  globalThis.__headers = {};
  const invited = renderToStaticMarkup(h(T.SignUpPage, { searchParams: { invited: '1' } }));
  ok('…and so does the invitation', /days of Socria One/.test(invited) && invited.includes('Logos 5: the conversation'));
  ok('…and neither version names Core', !/\bCore\b/.test(us) && !/\bCore\b/.test(invited));
}

console.log('\n=== the form on its own ===');
{
  const up = (props) => renderToStaticMarkup(h(T.AuthForm, { kind: 'sign-up', ...props }));
  ok('told nothing, it starts unticked', box(up({})) === false);
  ok('told to, it starts ticked', box(up({ newsletterDefault: true })) === true);
  ok('sign-in has no box', box(renderToStaticMarkup(h(T.AuthForm, { kind: 'sign-in', newsletterDefault: true }))) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
