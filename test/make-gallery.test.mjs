// WHAT TO MAKE, SEEN BEFORE IT IS CHOSEN — and made as it was seen.
//
//   templates   every choice that fills a display names a real kind and one
//               of its views, and the words it sends are read as exactly that
//               kind and view: the preview is what comes back
//   previews    the gallery draws each template with its own figure over the
//               catalogue's example, opened on the template's view; what the
//               engine builds (a plot, a simulation, a 3D model) and the CAD
//               studio are drawings
//   gallery     thirteen cards, one button each; the preview is a picture —
//               hidden from assistive technology and inert; the chosen card
//               is pressed; the composer's sheet is the same gallery, small
//   artifacts   what the map draws itself is listed once: no second "Plot" of
//               functions a picture already draws, no "Picture" of a display
//               that is here (lib/logos5/artifacts.ts)
//   containment a picture is drawn inside its card, never over the strip
//   phone       the composer's row stays on the screen with a choice made
//   shared      what others shared, under Shared with you in the Universal
//               Map's list, and "Join with a code" — in the More menu and there
//
// components/logos5/MakeGallery.tsx, lib/logos5/make.ts, lib/logos5/artifacts.ts,
// components/display/Gallery.tsx sampleObject, components/logos5/Universe.tsx.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from './.tmp/make-under-test.mjs';

const read = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const none = () => {};

console.log('=== templates: each one is what is made ===');
const filled = M.MAKE_CHOICES.filter((c) => c.template);
ok('nine choices fill a display — "Your own" among them, the custom kind — three are built by the engine, and CAD opens its studio', filled.length === 9 && filled.some((c) => c.id === 'custom' && c.template.kind === 'custom') && M.MAKE_CHOICES.filter((c) => !c.template).map((c) => c.id).join() === 'plot,simulation,model3d,cad', J(M.MAKE_CHOICES.map((c) => [c.id, c.template])));
for (const c of filled) {
  const t = c.template;
  const kind = M.kindOf(t.kind);
  ok(`${c.label}: a display kind (${t.kind})`, M.isDisplayKind(t.kind) && !!kind);
  if (t.view) ok(`  …and one of its views (${t.view})`, (kind?.views ?? []).some((v) => v.id === t.view), J((kind?.views ?? []).map((v) => v.id)));
  for (const asked of [c.ask('mitosis and meiosis'), c.ask('rent 1200, food 400, transport 90'), c.fromHere]) {
    const r = M.readDisplayRequest(asked);
    ok(`  "${asked}" is read as that kind${t.view ? ', on that view' : ''}`, r?.kind === t.kind && (t.view ? r.view === t.view : !r.view), J(r && { kind: r.kind, view: r.view }));
  }
  ok(`  has a line saying what it is for`, typeof c.about === 'string' && c.about.length > 12 && c.about.length < 70, c.about);
}
for (const c of M.MAKE_CHOICES.filter((x) => !x.template)) ok(`${c.label}: built by the engine, said in a line`, typeof c.about === 'string' && c.about.length > 12);

console.log('\n=== previews: the template, drawn over its example ===');
for (const c of filled) {
  const s = M.sampleObject(c.template.kind, c.template.view);
  ok(`${c.label}: an example of the kind${c.template.view ? `, opened on ${c.template.view}` : ''}`, s?.kind === c.template.kind && (!c.template.view || s.states[s.at]?.view === c.template.view), J(s && { kind: s.kind, view: s.states[s.at]?.view }));
}
ok('an unknown kind has no example, and nothing throws', M.sampleObject('sculpture') === null);

console.log('\n=== the gallery ===');
const g = html(h(M.MakeGallery, { onPick: none }));
const cards = g.match(/<li class="mkg-card[^"]*" data-make="[^"]+"/g) ?? [];
ok('a card for every choice, in order', cards.length === M.MAKE_CHOICES.length && cards.map((x) => x.match(/data-make="([^"]+)"/)[1]).join() === M.MAKE_CHOICES.map((c) => c.id).join(), J(cards));
ok('one button per card: the card is the button', (g.match(/class="mkg-pick"/g) ?? []).length === M.MAKE_CHOICES.length);
const previews = g.match(/<div class="mkg-preview"[^>]*>/g) ?? [];
ok('every preview is a picture: hidden from assistive technology, and inert', previews.length === M.MAKE_CHOICES.length && previews.every((p) => /aria-hidden="true"/.test(p) && /inert=""/.test(p)), J(previews.slice(0, 2)));
ok('the nine displays are drawn by their own figure', (g.match(/class="mkg-figure"/g) ?? []).length === 9);
ok('the plot, the simulation, the 3D model and the CAD studio are drawings', (g.match(/<svg class="mkg-draw"/g) ?? []).length === 4);
ok('  CAD is drawn as a desk in the studio, with its dimension', /data-make="cad"[\s\S]*?<svg class="mkg-draw"[\s\S]*?120 cm/.test(g));
ok('each card says what it is and what it is for', M.MAKE_CHOICES.every((c) => g.includes(`<span class="mkg-name">${c.label}</span>`) && g.includes(c.about.replace(/'/g, '&#x27;'))));
ok('nothing is chosen until it is', !/aria-pressed="true"/.test(g) && !/mkg-card is-on/.test(g));
const on = html(h(M.MakeGallery, { onPick: none, selected: 'venn' }));
ok('the chosen one is pressed, and only it', (on.match(/aria-pressed="true"/g) ?? []).length === 1 && /mkg-card is-on" data-make="venn"/.test(on));
ok('the composer’s sheet: the same gallery, small', /class="mkg is-compact"/.test(html(h(M.MakeGallery, { onPick: none, compact: true }))));
const picker = read('components/logos5/MakePicker.tsx');
ok('the composer’s Make opens the gallery, not a list of words', /<MakeGallery\s+compact/.test(picker) && !/l5-make-opt/.test(picker));
const study = read('components/logos5/Study.tsx');
ok('Artifacts offers the gallery, empty or not', /<MakeGallery/.test(study) && /each is drawn as it will be/.test(study));

console.log('\n=== artifacts: what the map draws, listed once ===');
const venn = 'Venn Diagram: Mitosis and Meiosis';
ok('a picture whose title names a display that is here repeats it', M.pictureRepeatsDisplay(venn, false, ['Mitosis and meiosis']));
ok('  not when nothing here is named', !M.pictureRepeatsDisplay(venn, false, ['Monthly rent']));
ok('  a simulation never repeats a display', !M.pictureRepeatsDisplay(venn, true, ['Mitosis and meiosis']));
ok('  a title of three letters names nothing', !M.pictureRepeatsDisplay('The DNA story', false, ['DNA']));
ok('  no picture, no repeat', !M.pictureRepeatsDisplay('', false, ['Mitosis and meiosis']) && !M.pictureRepeatsDisplay(null, false, ['x']));
ok('the picture and the plot of the same functions: one artifact, the picture', J(M.mapArtifacts({ models: 0, viz: 'picture', plot: true, repeats: false })) === J({ viz: true, plot: false }));
ok('functions nothing else draws: the plot', J(M.mapArtifacts({ models: 0, viz: null, plot: true, repeats: false })) === J({ viz: false, plot: true }));
ok('a model draws them: neither', J(M.mapArtifacts({ models: 1, viz: 'picture', plot: true, repeats: false })) === J({ viz: false, plot: false }));
ok('a picture of a display that is here: not listed', J(M.mapArtifacts({ models: 0, viz: 'picture', plot: false, repeats: true })) === J({ viz: false, plot: false }));
ok('"show me the plot" opens what draws it: the active model, else the newest', M.plotArtifact(['a', 'b'], 'a', true) === 'm:a' && M.plotArtifact(['a', 'b'], null, false) === 'm:b');
ok('  else the picture, else the functions on their own', M.plotArtifact([], null, true) === 'v:viz' && M.plotArtifact([], null, false) === 'v:plot');
const app = read('components/LogosApp.tsx');
ok('Logos 5 lists what the map draws by these rules, not its own copy of them', /mapArtifacts\(\{/.test(app) && /pictureRepeatsDisplay\(/.test(app) && /plotArtifact\(/.test(app) && !/vizRepeatsDisplay/.test(app) && /\.\.\.\(drawn\.viz \?/.test(app) && /\.\.\.\(drawn\.plot \?/.test(app));
const route = read('app/api/logos/map/route.ts');
ok('the map route keeps no picture of its own beside a display it made, whatever the kind', /ONE ANSWER TO ONE ASK/.test(route) && /if \(next\.viz && JSON\.stringify\(next\.viz\) !== JSON\.stringify\(current\.viz \?\? null\)\)/.test(route));

console.log('\n=== containment: a picture is drawn inside its card ===');
const css = read('components/logos5/redesign.css');
const body = css.match(/\.l5s-art-body\s*\{[^}]*\}/)?.[0] ?? '';
ok('the card is what the picture is placed against', /position:\s*relative/.test(body), body);
const panel = css.match(/\.l5s-art-body > :is\(\.ws-model, \.lg-panel, \.s3\)\s*\{[^}]*\}/)?.[0] ?? '';
ok('  and it has a height of its own, and clips', /position:\s*relative/.test(panel) && /height:\s*clamp\(/.test(panel) && /overflow:\s*hidden/.test(panel), panel);

console.log('\n=== a phone: the composer stays on the screen ===');
const l5v = read('components/logos5/l5v.css');
ok('the view is never wider than the screen it is in', /\.l5v-body\s*\{[^}]*min-width:\s*0/.test(l5v));
const l5 = read('components/logos5/l5.css');
ok('with something chosen, the length is its icon, and the send button stays in view', /:has\(\.l5-make\.is-set\) \.l5-concise \.mp-btn \.nm\s*\{[^}]*clip:/.test(l5));
const gcss = read('components/logos5/make-gallery.css');
ok('two to a row on a phone, in Artifacts and in the sheet', /@media \(max-width: 560px\)\s*\{\s*\.mkg,\s*\.mkg\.is-compact\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/.test(gcss));

console.log('\n=== shared with you, and a code ===');
const base = { conversations: [], activeId: null, onOpen: none, onStart: none, contents: true, initial: undefined };
const items = [
  { type: 'project', id: 'p1', title: 'Bio 201 study group', owner: 'Sam' },
  { type: 'conversation', id: 'c1', kind: 'logos', title: 'Krebs cycle', owner: 'Ana' },
];
const withShared = html(h(M.UniverseView, { ...base, shared: items, onOpenShared: none, onJoinCode: none }));
ok('the list has a Shared with you group', /aria-label="Shared with you"/.test(withShared) && />Shared with you</.test(withShared));
ok('  each with its title, what it is and whose it is', /Bio 201 study group/.test(withShared) && /Project · shared by Sam/.test(withShared) && /Krebs cycle/.test(withShared) && /Conversation · shared by Ana/.test(withShared), withShared.slice(withShared.indexOf('Shared with you'), withShared.indexOf('Shared with you') + 600));
ok('  and a way in by a code', /class="l5c-join"/.test(withShared) && /Join with a code/.test(withShared));
const empty = html(h(M.UniverseView, { ...base, shared: [], onOpenShared: none }));
ok('nothing shared yet: it says where it will appear', /When someone shares with you, it appears here\./.test(empty) && !/l5c-join/.test(empty));
const out = html(h(M.UniverseView, { ...base }));
ok('signed out (nothing handed down): no such group', !/Shared with you/.test(out));
const page = read('app/chat/page.tsx');
ok('the page mounts the code dialog and opens it from Logos 5', /<JoinCodeDialog open=\{joinOpen\} onClose=\{\(\) => setJoinOpen\(false\)\} \/>/.test(page) && /onJoinWithCode=\{isSignedIn \? \(\) => setJoinOpen\(true\) : undefined\}/.test(page));
ok('  hands down what is shared, only when signed in', /shared=\{isSignedIn \? sharedItems : undefined\}/.test(page) && /onOpenShared=\{openShared\}/.test(page));
const opener = page.match(/function openShared\(it: SharedIn\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
ok('  a Project opens its home; a line of thinking, together; a Core conversation, beside', /it\.type === 'project'\) return setHomeProject\(it\.id\)/.test(opener) && /it\.kind === 'logos'\) return window\.location\.assign\(`\/chat\?s=\$\{encodeURIComponent\(it\.id\)\}&shared=1`\)/.test(opener) && /setSharedOpen\(it\.id\)/.test(opener), opener);
ok('  and the rewards popups keep quiet while it is open', /!sheet && !joinOpen/.test(page));
ok('the More menu has "Join with a code" when there is somewhere to join', /\.\.\.\(onJoinWithCode \? \[\{ label: 'Join with a code'/.test(app));
const sd = read('components/share/ShareDialog.tsx');
ok('the Share sheet says where the code is entered now', /Joined with “Join with a code”, in the More menu\./.test(sd) && !/in the sidebar/.test(sd));

console.log(`\nmake-gallery: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
