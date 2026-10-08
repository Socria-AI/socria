// The cover of Logos: the real thing in a smaller frame, terms that cannot go
// stale, and the right name on the door.
//
// Two doors lead into Logos — the pill beside the chat's composer and the gate
// on the Logos surface itself — and one component is both. What goes wrong
// with a cover is a demonstration that is a drawing of the feature rather than
// the feature, a number written into prose that the plan table has since
// changed, and a name on the door for a surface that is not behind it. So:
// Logos 3 wherever it is offered, built live, a different example each time;
// Logos 2 where it is not, with its saddle.

import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { LogosCover, freeTerms } from './.tmp/LogosCover.mjs';
import { COVER_SHOWCASE, DOCS_SHOWCASE, STAGE_DESIGN, STAGE_MODEL, showcaseAt } from './.tmp/logos3-showcase.mjs';
import { ENGINEERING, SCENE_EXAMPLES } from './.tmp/engineering.mjs';
import { DYNAMICS } from './.tmp/dynamics-examples.mjs';
import { PLANS } from './.tmp/entitlements.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('=== the terms are the plan table’s ===');
{
  const n = PLANS.free.counters.chats;
  ok('the free month is two lines of thinking', n === 2, `${n}`);
  ok('and the cover says so, in words', freeTerms() === 'Two lines of thinking a month, free. Socria One for every one after.', freeTerms());
  ok('  read from the table, not written down', !/'Two lines of thinking/.test(read('components/LogosCover.tsx')));
}

console.log('=== the stage is the real thing ===');
{
  const src = read('components/LogosCover.tsx');
  const live = read('components/logos3/LiveExample.tsx');
  ok('Logos 3: the showcase’s figure, built live', /<LiveFigure item=\{item\} \/>/.test(src));
  ok('  a model through the engine’s own on-ramp, drawn by the product’s ModelView', /openFromProposal\(EMPTY_WORKSPACE, ex\.model\(\), \{ at: 0 \}\)/.test(live) && /<ModelView model=\{modelFor\(opened\.doc\)\}/.test(live));
  ok('  a design read by Live 3D’s own reader, drawn by the workspace’s canvas', /readScene\(say, EMPTY_SCENE\)\.preview/.test(live) && /<SceneCanvas scene=\{scene\}/.test(live));
  ok('  and without WebGL, the same scene from above, not nothing', /planPaths\(scene, 640, 300\)/.test(live) && /if \(gl !== true\) return flat;/.test(live));
  ok('  a refused build says so rather than drawing something else', /opened\?\.says/.test(live));
  ok('Logos 2: the saddle the engine builds from the library', /modelById\('saddle'\)/.test(src) && /\{saddle && <ModelView model=\{saddle\} fill \/>\}/.test(src));
  ok('and not a film of either', !/SCENES|requestAnimationFrame/.test(src));
  ok('the inspector under the figure is hidden, not removed', /\.l2-frame \.und \{ display: none; \}/.test(read('app/globals.css')));
}

console.log('=== a different kind of problem each time ===');
{
  const all = [...ENGINEERING, ...DYNAMICS];
  ok('six examples', COVER_SHOWCASE.length === 6);
  ok('every one is an example the product carries', COVER_SHOWCASE.every((s) => (s.kind === 'scene' ? SCENE_EXAMPLES : all).some((e) => e.id === s.id)));
  ok('…quoting its own request, word for word', COVER_SHOWCASE.every((s) => s.said && s.said === (s.kind === 'scene' ? SCENE_EXAMPLES.find((e) => e.id === s.id).say : all.find((e) => e.id === s.id).ask)));
  ok('no two alike', new Set(COVER_SHOWCASE.map((s) => s.id)).size === COVER_SHOWCASE.length);
  ok('at least one design in 3D among the models', COVER_SHOWCASE.some((s) => s.kind === 'scene') && COVER_SHOWCASE.some((s) => s.kind === 'model'));
  ok('the turn wraps, either way', showcaseAt(COVER_SHOWCASE, 6) === COVER_SHOWCASE[0] && showcaseAt(COVER_SHOWCASE, -1) === COVER_SHOWCASE[5]);
  const src = read('components/LogosCover.tsx');
  ok('each opening takes the next, remembered per browser', /if \(open && three\) setTurn\(takeTurn\(\)\);/.test(src) && /localStorage\.setItem\(COVER_TURN_KEY, String\(i \+ 1\)\)/.test(src));
  ok('and “Another example” takes the next at once', /onClick=\{\(\) => setTurn\(takeTurn\(\)\)\}/.test(src));
  ok('the homepage’s subjects are not the cover’s', !COVER_SHOWCASE.some((s) => ['resonance', 'truss', 'ibeam'].includes(s.id)));
  ok('the first is the most immediate: a design in 3D', COVER_SHOWCASE[0].kind === 'scene');
}

console.log('=== each surface its own subjects ===');
{
  const all = [...ENGINEERING, ...DYNAMICS];
  const cover = new Set(COVER_SHOWCASE.map((s) => s.id));
  const docs = new Set(DOCS_SHOWCASE.map((s) => s.id));
  ok('the docs page shows none of the cover’s', [...docs].every((id) => !cover.has(id)));
  ok('the homepage stage shows neither’s', ![STAGE_MODEL.id, STAGE_DESIGN.id].some((id) => cover.has(id) || docs.has(id)) && !cover.has('wing') && !docs.has('wing'));
  ok('the docs items are examples the product carries, quoted word for word', DOCS_SHOWCASE.every((s) => s.said && s.said === (s.kind === 'scene' ? SCENE_EXAMPLES.find((e) => e.id === s.id)?.say : all.find((e) => e.id === s.id)?.ask)));
  ok('the stage’s model is the lift example, asked for in its own words', STAGE_MODEL.said === all.find((e) => e.id === 'lift')?.ask);
  ok('the stage’s wing is built from the very message shown', /<LiveFigure item=\{STAGE_DESIGN\} \/>/.test(read('components/journal/Stage.tsx')) && /<Message role="user" text=\{STAGE_DESIGN\.said\} \/>/.test(read('components/journal/Stage.tsx')));
  const l2 = read('app/docs/content/logos-2.tsx');
  ok('the Logos 2 page keeps no screenshots — its figures are live', !/\.png|<img/.test(l2) && /<DemoLibraryFigure id=\{g\.id\}/.test(l2));
  ok('…and says Logos 3 is the current Logos', /Logos 3 is the current Logos/.test(l2));
  ok('the Logos 3 page shows its own, live', /<DemoShowcase items=\{DOCS_SHOWCASE\} \/>/.test(read('app/docs/content/logos-3.tsx')));
  ok('live figures sit inside the Logos surface wrapper, where the view’s styles live', (read('app/docs/DocsDemo.tsx').match(/logos-root lg-demo d-live-surface/g) || []).length === 2);
}

console.log('=== one card, two doors, the right name on each ===');
{
  const chat = read('app/chat/page.tsx');
  const logos = read('components/LogosApp.tsx');
  ok('the chat opens it as a sheet, for the Logos on offer', /<LogosCover\s+as="modal"\s+version=\{coverVersion\}/.test(chat));
  ok('  Logos 3 wherever it is offered — read after mount, and again when a gate opens', /setCoverVersion\(isOffered\('logos-3'\) \? 'logos-3' : 'logos-2'\)/.test(chat) && /window\.addEventListener\(GATE_CHANGED, read\)/.test(chat));
  ok('  from the pill', /TryLogosPill/.test(chat) && /onOpen=\{\(\) => setLogosModalOpen\(true\)\}/.test(chat));
  ok('  and from a gated pick of Logos', /else setLogosModalOpen\(true\)/.test(chat));
  ok('  and its way in is the newest Logos', /openNewestLogos\(\);\s*return;/.test(chat) && /router\.push\(`\/sign-in\?redirect_url=%2Fchat%3Fmodel%3D\$\{coverVersion\}`\)/.test(chat));
  ok('the Logos surface is it, as the gate, naming itself', /<LogosCover as="gate" version=\{model === 'logos-3' \? 'logos-3' : 'logos-2'\} isSignedIn=\{false\} primaryHref=\{gateHref\} onUnlock=\{unlockWith\} \/>/.test(logos));
  ok('  and sends sign-in back to the same Logos', /model%3D\$\{model === 'logos-3' \? 'logos-3' : 'logos-2'\}/.test(logos));
  ok('  which no longer carries its own plain card', !/lg-gate-card/.test(logos));
  ok('the old film and the Core 4 pill are gone', !/TryLogosModal|TryCore4Pill/.test(chat));
}

console.log('=== rendered ===');
{
  // Server-rendered, the way a suite can: the figure draws nothing without a
  // measured frame, but the card, the words and the way in are all there.
  const render = (props) => {
    try {
      return { html: renderToStaticMarkup(h(LogosCover, props)), threw: null };
    } catch (e) {
      return { html: '', threw: e };
    }
  };
  const g3 = render({ as: 'gate', version: 'logos-3', isSignedIn: false, primaryHref: '/sign-in', onUnlock: async () => false });
  ok('the Logos 3 gate renders', !g3.threw, g3.threw?.message);
  ok('  with its title', /Watch it get built\./.test(g3.html));
  ok('  a request somebody could type, and its name', g3.html.includes(COVER_SHOWCASE[0].title) && /class="l2-said"/.test(g3.html));
  ok('  the terms', /Two lines of thinking a month, free\./.test(g3.html));
  ok('  the way in, by name', /Sign in to open Logos 3/.test(g3.html) && /href="\/sign-in"/.test(g3.html) && !/Logos 2/.test(g3.html));
  ok('  the key, behind a disclosure', /Have an access key\?/.test(g3.html));
  ok('  and no sheet behind it', !/core3-modal-backdrop/.test(g3.html));

  const g2 = render({ as: 'gate', version: 'logos-2', isSignedIn: false, primaryHref: '/sign-in', onUnlock: async () => false });
  ok('the Logos 2 gate renders, as before', !g2.threw && /Your thinking, as a model/.test(g2.html) && /Sign in to open Logos 2/.test(g2.html) && /saddle point/.test(g2.html) && !/Logos 3/.test(g2.html));

  const m3 = render({ as: 'modal', version: 'logos-3', isSignedIn: true, onClose: () => {}, onStart: () => {} });
  ok('the sheet renders', !!m3.html, m3.threw?.message);
  ok('  over a backdrop, with a close and the checkbox', /core3-modal-backdrop/.test(m3.html) && /core3-modal-close/.test(m3.html) && /core3-modal-checkbox/.test(m3.html));
  ok('  and opens Logos 3 for somebody with an account', /Open Logos 3/.test(m3.html) && !/Sign in to open/.test(m3.html));
  ok('  with no key row for them', !/Have an access key/.test(m3.html));
  ok('  and “Another example”', /Another example/.test(m3.html));
  ok('closed, it is nothing', renderToStaticMarkup(h(LogosCover, { as: 'modal', open: false, isSignedIn: true })) === '');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
