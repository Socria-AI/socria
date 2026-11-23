// The design core (lib/ux-v0/design): the designer's answer read as it streams, carried out on HTML artboards,
// cleaned and given ids, edited by hand, kept as versions; the message it is sent; one request start to finish.
//
// No model is called: answers are written here, hostile ones included (scripts, handlers, edits that do not match,
// artboards that do not exist), and every result is read from the document it produced.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const T = await import(pathToFileURL(join(here, '.tmp', 'design-under-test.mjs')).href);
const { protocol: P, apply: A, elements: E, doc: D, formats: F, prompts: PR, frame: FR, flow: FL, start: ST } = T;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, typeof x === 'string' ? x.slice(0, 600) : JSON.stringify(x).slice(0, 600))));
const sec = (s) => console.log(`\n=== ${s} ===`);
const parse = (html) => new JSDOM(html).window.document;
const NOW = 1_800_000_000_000;

const POSTER = `<style>.h{font-size:160px;line-height:.9}</style>
<h1 class="h">Rooms for<br><em>Living</em></h1>
<p class="sub">Six evenings on the future of housing</p>
<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>`;

sec('the answer, read as it is written');
{
  const full = `<say>A section cut open.</say>\n<artboard id="new-1" name="Poster" format="a3" group="dirs">${POSTER}</artboard>\n<edit artboard="ab1"><find>a</find><replace>b</replace><find>c</find><replace>d</replace></edit>\n<remove artboard="ab9"/>\n<tokens>:root{--ink:#111}</tokens>\n<remember>No gradients, ever.</remember>\n<question>Warm or cool?<option>Warm</option><option>Cool</option></question>`;
  const a = P.parseAnswer(full);
  ok('say, a new artboard with its attributes, an edit of two pairs, a removal, tokens, a decision, a question', a.say === 'A section cut open.' && a.blocks.length === 6 && a.blocks[0].kind === 'artboard' && a.blocks[0].format === 'a3' && a.blocks[0].group === 'dirs' && a.blocks[1].pairs.length === 2 && a.blocks[2].artboard === 'ab9' && a.blocks[3].css.includes('--ink') && a.blocks[4].text === 'No gradients, ever.' && a.blocks[5].options.join() === 'Warm,Cool' && !a.open, a);
  const half = full.slice(0, full.indexOf('Six evenings') + 5);
  const h = P.parseAnswer(half);
  ok('half-written: the artboard being written comes back open, with what it has so far', h.open && h.blocks.length === 1 && h.blocks[0].open && h.blocks[0].html.includes('Rooms for') && !h.blocks[0].html.includes('housing'));
  ok('a fence round the answer is read through', P.parseAnswer('```html\n<say>Hi</say><ok/>\n```').ok);
  ok('words with no tags at all are something said', P.parseAnswer('I could not do that.').say === 'I could not do that.');
  ok('a look that found nothing: ok', P.parseAnswer('<say>Fine.</say><ok/>').ok);
}

sec('carried out: what each block may do');
{
  const base = { artboards: [], tokens: '' };
  const hostile = `<say>x</say><artboard id="new-1" name="P" format="a3"><script>alert(1)</script><link rel="stylesheet" href="https://evil.test/x.css"><h1 onclick="steal()">Hi</h1><a href="javascript:alert(1)">x</a><iframe src="https://evil.test"></iframe><style>@import url(https://evil.test/y.css); h1{color:red}</style></artboard>`;
  const r = A.applyAnswer(base, P.parseAnswer(hostile), { parse, format: 'a3' });
  const html = r.doc.artboards[0].html;
  ok('a new artboard is made at its format’s size, with a real id', r.made.length === 1 && /^ab/.test(r.made[0]) && r.doc.artboards[0].width === F.formatOf('a3').width && r.ids['new-1'] === r.made[0]);
  ok('scripts, handlers, javascript: links, frames, <link> and @import are taken out', !/<script|onclick|javascript:|<iframe|<link|@import/i.test(html) && /<h1/.test(html) && /h1\{color:red\}/.test(html), html);
  ok('every element is given an id', /<h1 data-sx="e\d+"/.test(html) && /<a data-sx/.test(html));

  const one = A.applyAnswer(base, P.parseAnswer(`<artboard id="new-1" format="a3">${POSTER}</artboard>`), { parse, format: 'a3' }).doc;
  const ab = one.artboards[0];
  ok('elements inside SVG defs are not given ids (gradients stay clean)', !/<stop[^>]*data-sx/.test(ab.html) && /<rect[^>]*data-sx/.test(ab.html));
  const edit = (pairs, id = ab.id) => A.applyAnswer(one, P.parseAnswer(`<edit artboard="${id}">${pairs.map(([f, r]) => `<find>${f}</find><replace>${r}</replace>`).join('')}</edit>`), { parse, format: 'a3' });
  const e1 = edit([['font-size:160px', 'font-size:140px']]);
  ok('an exact edit is carried out, and only the artboard it names is touched', e1.touched.length === 1 && e1.doc.artboards[0].html.includes('font-size:140px') && !e1.failed.length);
  const e2 = edit([['Six evenings   on the\n future', 'Six nights on the future']]);
  ok('whitespace in a find stands for any whitespace', e2.doc.artboards[0].html.includes('Six nights on the future'));
  const e3 = edit([['not there at all', 'x']]);
  ok('an edit that finds nothing is said, and nothing changes', e3.failed.length === 1 && /could not be found/.test(e3.failed[0]) && !e3.touched.length && A.changedSentence(e3, e3.doc) === 'Nothing on the design changed.');
  const twice = { ...one, artboards: [{ ...ab, html: `${ab.html}<p data-sx="e90">same</p><p data-sx="e91">same</p>` }] };
  const e4 = A.applyAnswer(twice, P.parseAnswer(`<edit artboard="${ab.id}"><find>same</find><replace>x</replace></edit>`), { parse, format: 'a3' });
  ok('an edit whose text is there twice is not guessed at', e4.failed.length === 1 && /more than once/.test(e4.failed[0]));
  ok('an edit to an artboard that is not there is said', edit([['a', 'b']], 'nope').failed.some((f) => /not there/.test(f)));
  const ids0 = [...ab.html.matchAll(/data-sx="(e\d+)"/g)].map((m) => m[1]);
  const rew = A.applyAnswer(one, P.parseAnswer(`<artboard id="${ab.id}">${ab.html.replace('Rooms for', 'Homes for')}<p>new line</p></artboard>`), { parse, format: 'a3' }).doc.artboards[0];
  const ids1 = [...rew.html.matchAll(/data-sx="(e\d+)"/g)].map((m) => m[1]);
  ok('a rewrite keeps the artboard and every element it kept keeps its id; a new element gets a new one', rew.id === ab.id && ids0.every((i) => ids1.includes(i)) && ids1.length === ids0.length + 1);
  const dup = A.applyAnswer(one, P.parseAnswer(`<artboard id="${ab.id}"><p data-sx="e1">a</p><p data-sx="e1">b</p></artboard>`), { parse, format: 'a3' }).doc.artboards[0];
  ok('an id written twice is given once', new Set([...dup.html.matchAll(/data-sx="(e\d+)"/g)].map((m) => m[1])).size === 2);
  const fmt = A.applyAnswer(one, P.parseAnswer(`<artboard id="${ab.id}" format="story">${ab.html}</artboard>`), { parse, format: 'a3' }).doc.artboards[0];
  ok('a rewrite may change the format, and the size follows', fmt.format === 'story' && fmt.width === 1080 && fmt.height === 1920);
  const rm = A.applyAnswer(one, P.parseAnswer(`<remove artboard="${ab.id}"/>`), { parse, format: 'a3' });
  ok('a removal removes', !rm.doc.artboards.length && rm.removed[0] === ab.id);
  const tk = A.applyAnswer(one, P.parseAnswer('<tokens>@import url(x.css); :root{--a:#000}</tokens>'), { parse, format: 'a3' });
  ok('shared styles are replaced, an @import taken out', tk.tokensChanged && !/@import/.test(tk.doc.tokens) && tk.doc.tokens.includes('--a'));

  const three = `<artboard id="v1" format="a3" group="d" beside="${ab.id}">x</artboard><artboard id="v2" format="a3" group="d">y</artboard><artboard id="v3" format="a3" group="d">z</artboard>`;
  const g = A.applyAnswer(one, P.parseAnswer(three), { parse, format: 'a3' }).doc.artboards;
  ok('variations: one group, in a row beside the one they vary', g.length === 4 && new Set(g.slice(1).map((a) => a.group)).size === 1 && g.slice(1).every((a) => a.y === ab.y) && g[1].x > ab.x + ab.width && g[2].x > g[1].x && g[3].x > g[2].x);
  const names = {};
  const d1 = A.applyAnswer(base, P.parseAnswer('<artboard id="new-1" format="a3"><h1>Ro'), { parse, format: 'a3', partial: true, names }).doc;
  const d2 = A.applyAnswer(base, P.parseAnswer('<artboard id="new-1" format="a3"><h1>Rooms</h1></artboard>'), { parse, format: 'a3', names }).doc;
  ok('a new artboard keeps one id from its first streamed line to the end', d1.artboards[0].id === d2.artboards[0].id);
  ok('a draft is drawn as written, not cleaned (ids come when it is complete)', !/data-sx/.test(d1.artboards[0].html) && /data-sx/.test(d2.artboards[0].html));
}

sec('by hand');
{
  const html = E.prepareFragment('<style>.a{color:red}</style><div class="box"><h1>Title</h1><p>One<br>Two</p></div>', parse);
  const id = (tag) => new RegExp(`<${tag} data-sx="(e\\d+)"`).exec(html)[1];
  const s1 = E.applyHandEdit(html, { op: 'style', id: id('h1'), props: { 'font-size': '64px', color: '#c00' } }, parse);
  ok('a style is set as inline style on that element', /<h1 data-sx="e\d+" style="font-size: 64px; color: rgb\(204, 0, 0\);"/.test(s1) || /<h1 data-sx="e\d+" style="font-size: 64px; color: #c00;"/.test(s1), s1);
  const bad = E.applyHandEdit(html, { op: 'style', id: id('h1'), props: { background: 'url(https://evil.test/x.png)', color: 'red;}body{display:none', 'font-size': '10px' } }, parse);
  ok('a value that would reach out or break out of the style is refused', !/evil|display:none/.test(bad) && /font-size: 10px/.test(bad), bad);
  ok('a style removed is removed', !/style=/.test(E.applyHandEdit(s1, { op: 'style', id: id('h1'), props: { 'font-size': null, color: null } }, parse).match(/<h1[^>]*>/)[0]));
  const t = E.applyHandEdit(html, { op: 'text', id: id('p'), text: 'Three\nFour' }, parse);
  ok('words retyped keep their line breaks', /<p data-sx="e\d+">Three<br>Four<\/p>/.test(t), t);
  const m1 = E.applyHandEdit(html, { op: 'move', id: id('h1'), dx: 20, dy: -5 }, parse);
  const m2 = E.applyHandEdit(m1, { op: 'move', id: id('h1'), dx: 5, dy: 5 }, parse);
  ok('moves add up, as translate', /translate: 25px 0px/.test(m2), m2);
  const dup = E.applyHandEdit(html, { op: 'duplicate', id: id('h1') }, parse);
  ok('a duplicate is a new element with its own id, nudged', (dup.match(/<h1 /g) ?? []).length === 2 && new Set([...dup.matchAll(/<h1[^>]*data-sx="(e\d+)"/g)].map((x) => x[1])).size === 2 && /translate: 24px 24px/.test(dup));
  const back = E.applyHandEdit(html, { op: 'order', id: id('p'), to: 'back' }, parse);
  ok('to the back: before its siblings', back.indexOf('<p') < back.indexOf('<h1'));
  ok('a removed element is gone; an element that is not there is said (null)', !/<h1/.test(E.applyHandEdit(html, { op: 'remove', id: id('h1') }, parse)) && E.applyHandEdit(html, { op: 'remove', id: 'e999' }, parse) === null);
  ok('the faces a design names are read from its CSS', E.facesNamed(".a{font-family:'Instrument Serif',serif}", 'h1{font: 700 40px/1 "Space Grotesk", sans-serif}').join() === 'Instrument Serif,Space Grotesk');
  const whole = E.prepareFragment('<!doctype html><html><head><style>h1{color:blue}</style><script>x()</script></head><body><h1>Hi</h1></body></html>', parse);
  ok('a whole page written by mistake is reduced to its styles and its body', /h1\{color:blue\}/.test(whole) && /<h1 data-sx/.test(whole) && !/<html|<body|<script/.test(whole));
}

sec('the frame');
{
  ok(':root, html and body are read as the artboard’s root, and nothing else is', FR.scopeCss(':root{--a:1} html,body{margin:0} tbody td{x:1} .embody{y:1}') === '.sx-root{--a:1} .sx-root,.sx-root{margin:0} tbody td{x:1} .embody{y:1}', FR.scopeCss(':root{--a:1} html,body{margin:0} tbody td{x:1} .embody{y:1}'));
  ok('pictures are put in by asset id; one that is missing is a transparent pixel', FR.scopeFragment('<img src="asset:p1"><img src="asset:p2">', new Map([['p1', 'data:image/png;base64,AAA']])).includes('src="data:image/png;base64,AAA"') && FR.scopeFragment('<img src="asset:p2">', new Map()).includes(FR.TRANSPARENT));
  const a = { id: 'ab1', name: 'x', format: 'a3', width: 1123, height: 1587, medium: 'print', html: `<style>h1{font-family:'Instrument Serif',serif}</style><h1 data-sx="e1">Hi</h1><script>steal()</script>`, x: 0, y: 0 };
  const page = FR.frameDoc(a, ':root{--ink:#000}', { parse, nonce: 'n0nce', assets: new Map(), interactive: true });
  ok('the frame’s page: no network, no script but ours, the faces linked, the root sized exactly', /connect-src 'none'/.test(page) && /script-src 'nonce-n0nce'/.test(page) && !/steal\(\)/.test(page) && /fonts\.googleapis\.com\/css2\?family=Instrument\+Serif/.test(page) && /\.sx-root\{position:relative;width:1123px;height:1587px/.test(page), page.slice(0, 900));
  ok('the shared styles are scoped the same way', /\.sx-root\{--ink:#000\}/.test(page));
}

sec('a design project, kept');
{
  let s = D.emptyState('poster', 'a3', 'A brief');
  const d1 = { artboards: [{ id: 'ab1', name: 'A', format: 'a3', width: 1123, height: 1587, medium: 'print', html: '<p data-sx="e1">1</p>', x: 0, y: 0 }], tokens: '' };
  const d2 = { ...d1, artboards: [{ ...d1.artboards[0], html: '<p data-sx="e1">2</p>' }] };
  const d3 = { ...d1, artboards: [{ ...d1.artboards[0], html: '<p data-sx="e1">3</p>' }] };
  s = D.commit(s, d1, 'first', 'model', NOW);
  s = D.commit(s, d2, 'second', 'person', NOW + 1);
  ok('each change is a version', s.versions.length === 2 && s.at === 1 && s.doc === d2);
  s = D.moveTo(s, 0);
  ok('undo shows the version before', s.doc.artboards[0].html.includes('>1<') && D.canRedo(s));
  s = D.commit(s, d3, 'third', 'person', NOW + 2);
  ok('a change after an undo replaces what could have been redone', s.versions.length === 2 && s.versions[1].said === 'third' && !D.canRedo(s));
  s = D.amend(s, d2, NOW + 3);
  ok('a quick run of edits by hand is one version', s.versions.length === 2 && s.doc === d2);
  const back = D.normalizeDesignState(JSON.parse(JSON.stringify({ ...s, assets: [{ id: 'img1', name: 'p', src: 'javascript:alert(1)', width: 10, height: 10 }, { id: 'img2', name: 'q', src: 'upload:abc', width: 10, height: 10 }], doc: { ...s.doc, artboards: [...s.doc.artboards, { id: 'bad', width: 0, height: 0 }] } })));
  ok('read back: a picture that is not an upload or an image is dropped; an artboard with no size is dropped', back.assets.length === 1 && back.assets[0].id === 'img2' && back.doc.artboards.length === 1 && back.versions.length === 2);
  const p = T.normalizeProject(JSON.parse(JSON.stringify({ ...T.makeProject('create', 'x', NOW), medium: 'design', design: s })));
  ok('a design project survives the project store’s normaliser, and is summarised as a design', p.medium === 'design' && p.design.doc.artboards.length === 1 && T.summarize(p).stage === 'design' && T.summarize(p).graphic === 'poster');
}

sec('what the designer is told');
{
  const sys = PR.designSystem();
  ok('one set of instructions, the same every time (cacheable)', sys === PR.designSystem() && sys.length > 4000);
  ok('…naming every tag, every format and the faces', ['<say>', '<artboard', '<edit', '<remove', '<tokens>', '<remember>', '<question>', '<ok/>'].every((t) => sys.includes(t)) && F.FORMATS.every((f) => sys.includes(`${f.id}:`)) && /Instrument Serif/.test(sys));
  ok('…and the defaults it must not reach for', /purple or blue gradient/.test(sys) && /no house style/i.test(sys));
  const abs = [1, 2, 3, 4, 5].map((i) => ({ id: `ab${i}`, name: `Board ${i}`, format: 'a3', width: 1123, height: 1587, medium: 'print', html: `<p data-sx="e1">words ${i}</p>`.padEnd(30_000, ' '), x: 0, y: 0 }));
  ok('focus: the selected artboard, those named, or all when they are few', PR.focusFor('smaller', abs, 'ab3').join() === 'ab3' && PR.focusFor('change Board 2', abs, null).join() === 'ab2' && PR.focusFor('x', abs.slice(0, 3), null).length === 3 && PR.focusFor('make all of them warmer', abs, null).length >= 2);
  const msg = PR.writeUser({ words: 'Make this smaller', selection: { artboard: 'ab1', element: 'e1', label: 'the p' }, answering: null, kind: 'poster', format: 'a3', memory: { brief: 'A lecture poster', decisions: ['keep the serif'], rejected: ['neon'] }, system: { name: 'Northlight', rules: ['Rule: never italic'] }, assets: [{ id: 'img1', name: 'photo', src: '', width: 800, height: 600 }], comments: [{ id: 'c1', artboard: 'ab1', element: 'e1', text: 'too tight', at: 0, resolved: false }], turns: [{ id: 't', role: 'person', text: 'earlier', at: 0 }], tokens: ':root{}', artboards: abs.slice(0, 2), focus: ['ab1'], words_of: { ab2: 'words 2' }, measured: { ab1: ['words cut off in e1'] } });
  ok('the message: the words, the selection, the brief, decisions, what was turned down, the brand, pictures, notes, the conversation', ['Make this smaller', 'data-sx="e1"', 'A lecture poster', 'keep the serif', 'neon', 'Northlight', 'Rule: never italic', 'asset:img1', 'too tight', 'Person: earlier'].every((x) => msg.includes(x)), msg.slice(0, 2000));
  ok('…the artboard in question in full, the others by their words, and what was measured', msg.includes('<artboard id="ab1">') && !msg.includes('<artboard id="ab2">') && msg.includes('its words: “words 2”') && msg.includes('words cut off in e1'));
}

sec('one request, start to finish');
{
  const said = [];
  const transport = (answers) => ({
    async send(body, onText) {
      said.push(body);
      const text = typeof answers === 'function' ? answers(body) : answers[said.length - 1] ?? '<ok/>';
      if (text == null) return { ok: false, error: 'down' };
      for (const piece of text.match(/[\s\S]{1,40}/g) ?? []) onText(piece);
      return { ok: true, text, model: 'fake', usage: { cost: 0.01 } };
    },
  });
  const bench = { picture: async () => 'data:image/jpeg;base64,AAAA', measure: async () => ({}) };
  const s0 = D.emptyState('poster', 'a3', 'A lecture poster');
  said.length = 0;
  const drafts = [];
  const r = await FL.runRequest(s0, { words: 'Make the first design from the brief.' }, transport([`<say>A section.</say><artboard id="new-1" format="a3">${POSTER}</artboard><remember>Keep it to two faces.</remember>`, '<say>One fix.</say><edit artboard="ZZZ"><find>a</find><replace>b</replace></edit>']), bench, { parse, onDraft: (d) => drafts.push(d), now: NOW });
  ok('a new design: written, drawn as it streamed, kept as a version, said', r.kind === 'done' && r.state.versions.length === 1 && r.state.doc.artboards.length === 1 && drafts.length >= 1 && r.turn.text === 'A section.', r);
  ok('…the drafts and the result are one artboard (one id throughout)', drafts.every((d) => !d.artboards.length || d.artboards[0].id === r.state.doc.artboards[0].id));
  ok('…looked at once, with its picture', said.length === 2 && said[1].mode === 'look' && said[1].pictures.length === 1 && said[1].artboards[0] === r.state.doc.artboards[0].id);
  ok('…an edit the look made to an artboard it was not shown is held, not applied', r.looked && r.looked.held === 1 && r.looked.fixed === 0);
  ok('…a decision said to be kept is kept', r.state.memory.decisions.includes('Keep it to two faces.'));
  ok('…both turns are in the conversation', r.state.turns.length === 2 && r.state.turns[0].role === 'person' && r.state.turns[1].touched.length === 1);

  said.length = 0;
  const ab = r.state.doc.artboards[0];
  const r2 = await FL.runRequest(r.state, { words: 'Make the headline smaller', selection: { artboard: ab.id, element: 'e1', label: 'h1' } }, transport([`<say>Smaller.</say><edit artboard="${ab.id}"><find>font-size:160px</find><replace>font-size:130px</replace></edit>`]), bench, { parse, now: NOW + 10 });
  ok('an edit: one call, no look, a new version', said.length === 1 && r2.kind === 'done' && r2.state.versions.length === 2 && r2.state.doc.artboards[0].html.includes('font-size:130px') && !r2.looked);
  ok('…the selection travelled with the request', said[0].selection.element === 'e1');

  said.length = 0;
  const q = await FL.runRequest(r2.state, { words: 'Make it pop' }, transport(['<say>One thing first.</say><question>Louder or quieter?<option>Louder</option><option>Quieter</option></question>']), bench, { parse, now: NOW + 20 });
  ok('a question: asked with its choices, nothing committed', q.kind === 'question' && q.question.options.length === 2 && q.state.versions.length === 2 && q.turn.options.length === 2);

  said.length = 0;
  const n = await FL.runRequest(r2.state, { words: 'x' }, transport([`<say>Done.</say><edit artboard="${ab.id}"><find>nowhere</find><replace>x</replace></edit>`]), bench, { parse, now: NOW + 30 });
  ok('an answer that changed nothing says so, lists why, and makes no version', n.kind === 'done' && n.state.versions.length === 2 && /Nothing on the design changed/.test(n.turn.text) && n.turn.failed.length === 1);

  const f = await FL.runRequest(r2.state, { words: 'x' }, transport(() => null), bench, { parse, now: NOW + 40 });
  ok('the designer unreachable: said as a failure, the design as it was', f.kind === 'failed' && f.error === 'down');

  said.length = 0;
  const fixed = await FL.runRequest(s0, { words: 'Make a poster' }, transport((b) => (b.mode === 'look' ? `<say>The title is too big.</say><edit artboard="${b.artboards[0]}"><find>font-size:160px</find><replace>font-size:120px</replace></edit>` : `<artboard id="new-1" format="a3">${POSTER}</artboard>`)), bench, { parse, now: NOW + 50 });
  ok('a look’s correction to the artboard it saw is carried out, in the same version', fixed.kind === 'done' && fixed.looked.fixed === 1 && fixed.state.versions.length === 1 && fixed.state.doc.artboards[0].html.includes('font-size:120px'));
}

sec('a conversation becomes a design project');
{
  const st = T.opening(T.emptyStudio('graphic', 'A bold poster for “Field Lines”, “Code that draws”, 12–30 June 2027, Lisbon', { now: NOW }), {}, NOW);
  const r = T.startFrom({ ...T.makeProject('create', 'Untitled design', NOW) }, st, { systems: [], websiteSystems: [], now: NOW });
  ok('a graphic begun in conversation starts as a design project, its brief written down', r.ok && r.project.medium === 'design' && /Field Lines/.test(r.project.design.memory.brief) && r.project.design.kind === 'poster' && !!F.formatOf(r.project.design.format) && r.project.name === 'Field Lines', r.ok ? r.project.design : r);
  const lg = T.opening(T.emptyStudio('logo', 'A logo for “Harbour & Co”, a seafood restaurant', { now: NOW }), {}, NOW);
  const rl = T.startFrom({ ...T.makeProject('create', 'Untitled design', NOW) }, lg, { systems: [], websiteSystems: [], now: NOW });
  ok('a logo starts on a logo sheet', rl.ok && rl.project.design.kind === 'logo' && rl.project.design.format === 'logo-sheet', rl.ok ? rl.project.design : rl);
  ok('the first request is said per kind', /logo sheet/.test(ST.firstRequest('logo')) && /campaign/.test(ST.firstRequest('campaign')) && /first design/.test(ST.firstRequest('poster')));
}

sec('a graphic or a board from the earlier editor, carried over');
{
  const L = T.legacy;
  const gdoc = {
    schema: 1, id: 'gd1', name: 'Rooms', tokens: { colors: { background: '#f2efe8', text: '#15181b', accent: '#f0b02e' }, fonts: { display: 'Instrument Serif', body: 'DM Mono' } },
    artboards: [
      { id: 'ab1', name: 'Poster A3', width: 842, height: 1191, unit: 'pt', dpi: 300, format: 'a3', background: '#f2efe8', bleed: 9, safe: 28, children: [
        { type: 'text', id: 't1', name: 'Headline', x: 40, y: 60, w: 700, h: 200, text: 'Rooms for Living', font: 'Instrument Serif', size: 90, weight: 400, color: '#15181b' },
        { type: 'image', id: 'i1', name: 'Photo', x: 40, y: 400, w: 400, h: 300, asset: 'img1' },
      ] },
      { id: 'ab2', name: 'Square', width: 1080, height: 1080, unit: 'px', format: 'instagram-square', background: '#15181b', children: [] },
    ],
    assets: [{ id: 'img1', kind: 'image', src: 'upload:pic-1', width: 1200, height: 900, name: 'dusk.jpg', source: 'upload' }, { id: 'img2', kind: 'image', src: 'https://example.com/x.jpg', width: 10, height: 10, name: 'web.jpg', source: 'library' }],
  };
  const old = { ...T.makeProject('create', 'Rooms for Living', NOW), medium: 'graphic', intent: 'A lecture poster', graphic: { brief: { purpose: 'A lecture series', kind: 'poster', formats: ['a3'], content: { headline: 'Rooms for Living' }, mood: [], images: [] }, options: [], direction: null, doc: gdoc, versions: [] } };
  const r = L.designFromLegacy(old, { now: NOW });
  const d = r.project.design;
  const [a1, a2] = d.doc.artboards;
  ok('a graphic becomes a design project, both artboards drawn as they were (SVG, filling the artboard)', r.project.medium === 'design' && r.artboards === 2 && /<svg[^>]*class="legacy"[^>]*width="100%"/.test(a1.html) && a1.html.includes('Rooms') && a2.html.includes('<svg'), a1?.html?.slice(0, 300));
  ok('a print artboard in points is sized in CSS pixels at 96 to the inch, and keeps its format', a1.width === Math.round(842 * 96 / 72) && a1.height === Math.round(1191 * 96 / 72) && a1.format === 'a3' && a1.medium === 'print' && a2.format === 'instagram-square', [a1.width, a1.height, a1.format, a2.format]);
  ok('its own picture comes over as an asset the artboard names; one linked from the web is said, not drawn', d.assets.length === 1 && d.assets[0].src === 'upload:pic-1' && a1.html.includes('asset:img1') && /linked from the web/.test(d.turns[0].text), d.turns[0]?.text);
  ok('one version, the first turn says what happened, the old record kept untouched', d.versions.length === 1 && d.turns.length === 1 && /earlier editor/.test(d.turns[0].text) && r.project.legacy.medium === 'graphic' && r.project.legacy.data.doc.id === 'gd1' && !('graphic' in r.project));
  const kept = T.normalizeProject(JSON.parse(JSON.stringify(r.project)));
  ok('stored and read back: still a design, the legacy record still there', kept.medium === 'design' && kept.design.doc.artboards.length === 2 && kept.legacy?.medium === 'graphic', kept.legacy);
  ok('the frame draws the carried-over artboard with its faces found', FR.facesFor(a1, '').faces.includes('Instrument Serif'), FR.facesFor(a1, ''));
  const els = E.prepareFragment(a1.html, parse);
  ok('its SVG text is selectable like any element (ids given)', /<text[^>]*data-sx="e\d+"/.test(els), els.slice(0, 400));

  const board = { ...T.makeProject('create', 'Campaign', NOW), medium: 'board', board: { request: 'A campaign', brief: null, materials: [
    { id: 'm1', type: 'graphic', name: 'Poster', doc: gdoc },
    { id: 'm2', type: 'mockup', name: 'On a wall' },
    { id: 'm3', type: 'website', name: 'Site' },
  ] } };
  const rb = L.designFromLegacy(board, { now: NOW });
  ok('a board brings its graphic materials as grouped artboards, and names the mockup and site it did not redraw', rb.project.medium === 'design' && rb.artboards === 2 && rb.project.design.doc.artboards.every((x) => x.group === 'legacy-Poster') && /1 mockup/.test(rb.project.design.turns[0].text) && /website schematic/.test(rb.project.design.turns[0].text) && rb.project.design.kind === 'campaign', rb.project.design.turns[0]?.text);
  const empty = L.designFromLegacy({ ...T.makeProject('create', 'Nothing', NOW), medium: 'graphic' }, { now: NOW });
  ok('an old graphic with no document opens empty, ready for a first request', empty.artboards === 0 && empty.project.design.versions.length === 0 && /no artboards yet/.test(empty.project.design.turns[0].text));
  ok('a website is not touched', L.designFromLegacy({ ...T.makeProject('create', 'Site', NOW) }, { now: NOW }) === null);
  ok('the faces to load before measuring are those it is set in', L.legacyFaces(old).includes('Instrument Serif') && L.legacyFaces(old).includes('DM Mono'));
}

sec('a broad change made by edits is looked at; an exact one is not');
{
  const s0 = D.emptyState('poster', 'a3', 'A poster');
  const made = await FL.runRequest(s0, { words: 'Make a poster', noLook: true }, { send: async () => ({ ok: true, text: `<artboard id="new-1" format="a3">${POSTER}</artboard>`, usage: null }) }, { picture: async () => 'data:image/jpeg;base64,AAAA', measure: async () => [] }, { parse, now: NOW });
  const id = made.state.doc.artboards[0].id;
  const modes = [];
  const t = (edit) => ({ send: async (b) => { modes.push(b.mode); return { ok: true, text: b.mode === 'look' ? '<say>Fine.</say><ok/>' : `<say>Done.</say><edit artboard="${id}"><find>font-size:160px</find><replace>${edit}</replace></edit>`, usage: null }; } });
  const bench = { picture: async () => 'data:image/jpeg;base64,AAAA', measure: async () => [] };
  modes.length = 0;
  await FL.runRequest(made.state, { words: 'Make it feel more cinematic' }, t('font-size:150px'), bench, { parse, now: NOW + 1 });
  ok('a change of feel carried out as edits: looked at once', modes.join() === 'write,look', modes);
  modes.length = 0;
  await FL.runRequest(made.state, { words: 'Make the headline slightly smaller' }, t('font-size:140px'), bench, { parse, now: NOW + 2 });
  ok('an exact change to something named: not looked at', modes.join() === 'write', modes);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
