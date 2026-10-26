// SPLIT VIEW, REDONE — "split view is the artifact / logic map whatever the
// user chooses … split views only shows what the user has open in the tabs …
// CAD should be artifact".
//
//   the shell     the view beside is drawn by the same body its tab draws, in
//                 a pane marked with that view (so its own styles hold there)
//   the menu      only what is open here: the other views, and every artifact
//                 by name; nothing that is a panel of its own
//   model tools   a model's parameters, inspector and history are the
//                 model's: opened beside it inside its artifact, one at a time
//   CAD           made, not docked: Make → CAD opens a 3D studio in Artifacts,
//                 and nothing is asked of a model for it
//   the source    no Split View panel survives anywhere a person can reach
//
// The pure rules (choose, dock, splitMenu, screenForRequest) are held in
// test/logos5-views.test.mjs; this holds the pieces that draw them.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as V from './.tmp/split-view-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);

console.log('=== the shell: a view beside another, as its tab draws it ===');
{
  const both = html(h(V.L5Layout, { view: 'chat', primary: h('p', null, 'THE THREAD'), beside: h('p', null, 'THE ARTIFACT'), besideView: 'artifacts', besideTitle: V.SPLIT_NAMES.artifacts, onCloseBeside: () => {}, omni: null, share: 0.4, onShare: () => {}, narrow: false }));
  ok('two views side by side: the open one, and the one beside', both.includes('THE THREAD') && both.includes('THE ARTIFACT') && /class="l5v-body is-chat has-beside"/.test(both));
  ok('  the pane beside is marked with its view, and titled as its tab is', /<aside class="l5v-beside is-artifacts" aria-label="Artifacts"/.test(both) && /class="l5v-beside-t">Artifacts</.test(both));
  ok('  it can be resized, and closed', /role="separator"/.test(both) && /aria-label="Close Artifacts"/.test(both));
  const phone = html(h(V.L5Layout, { view: 'chat', primary: h('p', null, 'THE THREAD'), beside: h('p', null, 'THE ARTIFACT'), besideView: 'artifacts', besideTitle: 'Artifacts', onCloseBeside: () => {}, omni: null, share: 0.4, onShare: () => {}, narrow: true }));
  ok('a phone shows one view: nothing beside', phone.includes('THE THREAD') && !phone.includes('THE ARTIFACT') && !/l5v-beside/.test(phone));
  const css = read('components/logos5/l5v.css');
  ok('the map and the thread beside scroll themselves, as they do as the view', /\.l5v-beside\.is-logic_map \.l5v-beside-body,\s*\.l5v-beside\.is-chat \.l5v-beside-body \{\s*overflow: hidden;/.test(css));
}

console.log('\n=== the menu: only what is open here ===');
{
  const closed = html(h(V.SplitView, { menu: { views: [], artifacts: [] }, besideOn: false, onPick: () => {} }));
  ok('the header button: Split View, a menu, closed until pressed', /aria-haspopup="menu"/.test(closed) && /aria-expanded="false"/.test(closed) && closed.includes('Split View'));
  const shell = read('components/logos5/L5Views.tsx');
  ok('  open: the views, then a group of artifacts by name, and a way to close what is beside', /\{menu\.views\.map\(item\)\}/.test(shell) && /aria-label="Artifacts" className="l5v-menu-sec"/.test(shell) && /Close the view beside/.test(shell));
  ok('  with nothing else open, it says so rather than offering empty views', /Nothing else is open yet/.test(shell));
  const m = V.splitMenu({ view: 'content', beside: 'artifacts', artifacts: [{ key: 'm:1', kind: 'Model', title: 'Saddle' }, { key: 's:2', kind: 'CAD', title: 'Desk' }], open: 'm:1', content: 3, ideas: 0 });
  ok('from Content: the conversation; no Logic Map while it holds no ideas; the model and the CAD scene by name', J(m.views.map((c) => c.beside)) === J(['chat']) && J(m.artifacts.map((c) => c.label)) === J(['Saddle', 'Desk']) && m.artifacts[0].on);
}

console.log('\n=== a model\u2019s tools are the model\u2019s ===');
{
  ok('three: its parameters, its inspector, its history', J(V.MODEL_TOOLS.map((t) => t.label)) === J(['Parameters', 'Inspector', 'History']));
  const plain = html(h(V.ModelArtifact, { model: h('div', { className: 'ws-model' }, 'THE MODEL'), tool: null, onTool: () => {}, renderTool: (t) => h('p', null, `TOOL ${t}`) }));
  ok('the model, with its tools in a toolbar over it — none open, none pressed', plain.includes('THE MODEL') && /role="toolbar" aria-label="The model’s tools"/.test(plain) && (plain.match(/aria-pressed="false"/g) ?? []).length === 3 && !plain.includes('TOOL '));
  const hist = html(h(V.ModelArtifact, { model: h('div', { className: 'ws-model' }, 'THE MODEL'), tool: 'trace', onTool: () => {}, renderTool: (t) => h('p', null, `TOOL ${t}`) }));
  ok('History open: beside the model, inside its card, named, with a way to close it', hist.includes('THE MODEL') && /<aside class="l5m-side" aria-label="History">/.test(hist) && hist.includes('TOOL trace') && /aria-label="Close History"/.test(hist));
  ok('  its button pressed, the others not', /aria-pressed="true"[^>]*>History</.test(hist) && (hist.match(/aria-pressed="true"/g) ?? []).length === 1);
  ok('  one at a time', !hist.includes('TOOL params') && !hist.includes('TOOL inspector'));
  const app = read('components/LogosApp.tsx');
  ok('every model in Artifacts is drawn with its tools, each tool over that model', /<ModelArtifact\s+model=\{renderPanel\(artPanelOf\(`m:\$\{d\.id\}`\)!\)\}/.test(app) && /renderTool=\{\(t\) => renderPanel\(\{ kind: 'panel', id: `l5a-\$\{t\}-\$\{d\.id\}`, type: t, config: \{ doc: d\.id \} \}\)\}/.test(app));
  ok('"show the parameters" opens them in the model; "close the parameters" closes them there', /if \(to\.tool !== undefined\) setModelTool\(to\.tool\)/.test(app));
  ok('"show my memory" opens the account\u2019s Memory, where it lives', /if \(to\.memory && cloud\) setL5Mind\(true\)/.test(app));
  const css = read('components/logos5/redesign.css');
  ok('a narrow card puts the tool under the model, by the card\u2019s own width', /\.l5m-art \{[^}]*container-type: inline-size;/.test(css) && /@container \(max-width: 640px\) \{\s*\.logos-root \.l5 \.l5m-body \{\s*flex-direction: column;/.test(css));
}

console.log('\n=== CAD is an artifact ===');
{
  const cad = V.makeChoice('cad');
  ok('Make offers CAD: build it in 3D by describing it', !!cad && cad.label === 'CAD' && /describing it/.test(cad.about));
  ok('  opened, not asked for: no words are sent for the choice, nothing is asked of a model', cad.opens === 'studio' && V.askFor(cad, 'a desk', true) === null);
  const g = html(h(V.MakeGallery, { onPick: () => {} }));
  ok('  in the gallery, drawn as a desk in the studio, its dimension marked', /data-make="cad"/.test(g) && /data-make="cad"[\s\S]*?120 cm/.test(g));
  const app = read('components/LogosApp.tsx');
  ok('picked, it opens a new 3D studio in Artifacts, the conversation beside', /if \(makeChoice\(id\)\?\.opens === 'studio'\) \{\s*openStudio\(\);/.test(app) && /setArtSel\(\(m\) => \(\{ \.\.\.m, \[id\]: STUDIO \}\)\);\s*setScreen\(\(s\) => onMade\(true, s, narrowRef\.current\)\);/.test(app));
  ok('  listed as CAD while it is open, and every scene is CAD in Artifacts', /kind: 'CAD', title: s\.name/.test(app) && /artKey === STUDIO \? \[\{ key: STUDIO, kind: 'CAD', title: 'New 3D studio'/.test(app));
  ok('  a description sent with it open is built in it — the studio counts as on screen as the view or beside', /artShownRef\.current\?\.startsWith\('s:'\) && \(screenRef\.current\.view === 'artifacts' \|\| screenRef\.current\.beside === 'artifacts'\)/.test(app));
  ok('  and its first description makes its scene, which Artifacts then shows', /if \(open\.panel\.id === STUDIO_PANEL\) \{[\s\S]{0,120}setArtSel\(\(m\) => \(\{ \.\.\.m, \[sid\]: `s:\$\{id\}` \}\)\);/.test(app));
  ok('  something asked for earlier, arriving late, does not take its place', /askedMakeRef\.current = false;\s*setArtSel\(\(m\) => \(\{ \.\.\.m, \[id\]: STUDIO \}\)\)/.test(app) && /m\[sid\] === STUDIO \? m : \{ \.\.\.m, \[sid\]: `d:\$\{displayToOpen\}` \}/.test(app));
  ok('  the composer asks for a description while it is open', /Describe it — e\.g\. a desk 120 cm wide with two drawers/.test(app));
}

console.log('\n=== nothing of the old drawer is left ===');
{
  const app = read('components/LogosApp.tsx');
  const views = read('lib/logos5/views.ts');
  ok('no workspace panel is docked beside a view', !/besidePanelOf|l5b-/.test(app));
  ok('no drawer sections, no panel names', !/SPLIT_SECTIONS|Math Plotting|Interactive Modeling|Studio \(CAD\)|Displays \(Tables|Mind \(Memory History\)|Thinking Map Structure/.test(views + read('components/logos5/L5Views.tsx')));
  ok('the beside pane is the view itself, chosen in Split View', /const besideEl = screen\.beside && screen\.beside !== studyTab \? viewEl\(screen\.beside\) : null/.test(app));
}

console.log(`\nsplit-view: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
