// The cover of Logos 2: the real thing in a smaller frame, and terms that
// cannot go stale.
//
// Two doors lead into Logos 2 — the pill beside the chat's composer and the
// gate on the Logos surface itself — and they used to say different things
// in different words (a four-scene film of Logos 1; a plain card). One
// component is both now. What goes wrong with a cover is a demonstration that
// is a drawing of the feature rather than the feature, and a number written
// into prose that the plan table has since changed.

import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { Logos2Cover, freeTerms } from './.tmp/Logos2Cover.mjs';
import { PLANS } from './.tmp/entitlements.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('=== the terms are the plan table’s ===');
{
  const n = PLANS.free.counters.chats;
  ok('the free month is two lines of thinking', n === 2, `${n}`);
  ok('and the cover says so, in words', freeTerms() === 'Two lines of thinking a month, free. Socria One for every one after.', freeTerms());
  ok('  read from the table, not written down', !/'Two lines of thinking/.test(read('components/Logos2Cover.tsx')));
}

console.log('=== the stage is the real thing ===');
{
  const src = read('components/Logos2Cover.tsx');
  ok('it mounts the product’s own ModelView', /{model && <ModelView model=\{model\} fill \/>}/.test(src));
  ok('  on a model the engine built from the library', /modelById\('saddle'\)/.test(src));
  ok('  and not a film of one', !/SCENES|requestAnimationFrame/.test(src));
  ok('the inspector under the figure is hidden, not removed', /\.l2-frame \.und \{ display: none; \}/.test(read('app/globals.css')));
}

console.log('=== one card, two doors ===');
{
  const chat = read('app/chat/page.tsx');
  const logos = read('components/LogosApp.tsx');
  ok('the chat opens it as a sheet', /<Logos2Cover\s+as="modal"/.test(chat));
  ok('  from the pill', /TryLogos2Pill/.test(chat) && /onOpen=\{\(\) => setLogosModalOpen\(true\)\}/.test(chat));
  ok('  and from a gated pick of Logos', /else setLogosModalOpen\(true\)/.test(chat));
  ok('the Logos surface is it, as the gate', /<Logos2Cover as="gate" isSignedIn=\{false\} primaryHref=\{gateHref\} onUnlock=\{unlockWith\} \/>/.test(logos));
  ok('  which no longer carries its own plain card', !/lg-gate-card/.test(logos));
  ok('  and sends sign-in back to Logos 2, not a withdrawn surface', /model%3Dlogos-2/.test(logos) && /model%3Dlogos-2/.test(chat));
  ok('the old film and the Core 4 pill are gone', !/TryLogosModal|TryCore4Pill/.test(chat));
}

console.log('=== rendered ===');
{
  // Server-rendered, the way a suite can: the figure draws nothing without a
  // measured frame, but the card, the words and the way in are all there.
  let html = '';
  let threw = null;
  try {
    html = renderToStaticMarkup(h(Logos2Cover, { as: 'gate', isSignedIn: false, primaryHref: '/sign-in', onUnlock: async () => false }));
  } catch (e) {
    threw = e;
  }
  ok('the gate renders', !threw, threw?.message);
  ok('  with the title', /Your thinking, as a model/.test(html));
  ok('  the terms', /Two lines of thinking a month, free\./.test(html));
  ok('  the way in', /Sign in to open Logos 2/.test(html) && /href="\/sign-in"/.test(html));
  ok('  the key, behind a disclosure', /Have an access key\?/.test(html));
  ok('  and no sheet behind it', !/core3-modal-backdrop/.test(html));

  let modal = '';
  try {
    modal = renderToStaticMarkup(h(Logos2Cover, { as: 'modal', isSignedIn: true, onClose: () => {}, onStart: () => {} }));
  } catch (e) {
    threw = e;
  }
  ok('the sheet renders', !!modal, threw?.message);
  ok('  over a backdrop, with a close and the checkbox', /core3-modal-backdrop/.test(modal) && /core3-modal-close/.test(modal) && /core3-modal-checkbox/.test(modal));
  ok('  and opens Logos 2 for somebody with an account', /Open Logos 2/.test(modal) && !/Sign in to open/.test(modal));
  ok('  with no key row for them', !/Have an access key/.test(modal));
  ok('closed, it is nothing', renderToStaticMarkup(h(Logos2Cover, { as: 'modal', open: false, isSignedIn: true })) === '');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
