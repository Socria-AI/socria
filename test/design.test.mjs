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
const { protocol: P, apply: A, elements: E, doc: D, formats: F, prompts: PR, frame: FR, flow: FL, start: ST, locks: LK, pins: PN, history: HI, request: RQ, contrast: CT } = T;

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
  const viaVar = E.facesNamed('.h{font-family:var(--font-display)} p{font-family:var(--type-body)}', ':root{--font-display:"Anton", Impact, sans-serif;--type-body:\'Newsreader\',serif;--ink:#111;--pad:24px}');
  ok('…and from custom properties that carry a face (as shared styles and brand tokens name them, used through var())', viaVar.includes('Anton') && viaVar.includes('Newsreader') && !viaVar.some((x) => /#111|24px|var\(/.test(x)), viaVar);
  const many = 'p{font-family:' + Array.from({ length: 14 }, (_, i) => `"Fallback ${i}"`).join(',') + ',serif} h1{font-family:"Bodoni Moda",serif}';
  const fr = FR.facesFor({ html: `<style>${many}</style>` }, '');
  ok('a long fallback list never crowds a library face out of what is loaded', fr.faces.join() === 'Bodoni Moda' && /Bodoni/.test(fr.href ?? ''), fr);
  ok('a face the library cannot serve is found (it would be drawn in a fallback); a library face and its fallbacks are not', FR.unservedFaces({ html: '<style>h1{font-family:"Helvetica Neue",Arial,sans-serif} p{font-family:"Inter",Arial,sans-serif}</style>' }, ':root{--font-display:"Canela", serif}').join() === 'Helvetica Neue,Canela');
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
  ok('a change after going back branches: nothing is let go, the new version is made from the one shown', s.versions.length === 3 && s.versions[1].said === 'second' && s.versions[2].said === 'third' && s.versions[2].from === 0 && s.at === 2 && !D.canRedo(s));
  ok('…undo goes to the version it was made from (not merely the one before it in time)', D.undoTarget(s) === 0);
  const atFirst = D.moveTo(s, 0);
  ok('…and from there, redo goes to the newest branch', D.redoTarget(atFirst) === 2 && D.canRedo(atFirst));
  s = D.amend(s, d2, NOW + 3);
  ok('a quick run of edits by hand is one version', s.versions.length === 3 && s.doc === d2);
  const onOld = D.amend(D.moveTo(s, 1), d3, NOW + 4);
  ok('…but an edit to an older version (one with later work) becomes a new version, never a rewrite of history', onOld.versions.length === 4 && onOld.versions[1].doc === d2 && onOld.versions[3].from === 1);
  let big = D.keepVersion(D.commit(D.emptyState('poster', 'a3', ''), d1, 'approved one', 'person', NOW), 0, 'Approved: A');
  for (let i = 0; i < D.MAX_VERSIONS + 5; i++) big = D.commit(big, i % 2 ? d2 : d3, `v${i}`, 'person', NOW + i + 1);
  ok('the history is held to its length, but a kept (approved) version is never trimmed, and branches stay linked', big.versions.length === D.MAX_VERSIONS && big.versions[0].kept === 'Approved: A' && big.versions.every((v, i) => v.from === undefined || (v.from >= 0 && v.from < i)), big.versions.slice(0, 3).map((v) => [v.said, v.from, v.kept]));
  const legacy = D.normalizeDesignState({ doc: d2, versions: [{ at: 1, said: 'a', by: 'model', doc: d1 }, { at: 2, said: 'b', by: 'person', doc: d2 }], at: 1 });
  ok('an older history (written before branches) reads as a line: each made from the one before', legacy.versions[1].from === 0 && legacy.versions[0].from === undefined && D.canUndo(legacy));
  const stated = D.normalizeArtboard({ ...d1.artboards[0], state: 'approved', locked: true, locks: [{ id: 'e1', what: 'the headline', at: 5 }, { id: 'nope', what: 'x' }, { id: 'e1', what: 'twice' }] });
  ok('an artboard keeps its state, its lock and its element locks (held to shape: real ids, once each)', stated.state === 'approved' && stated.locked === true && stated.locks.length === 1 && stated.locks[0].what === 'the headline', stated);
  const back = D.normalizeDesignState(JSON.parse(JSON.stringify({ ...s, assets: [{ id: 'img1', name: 'p', src: 'javascript:alert(1)', width: 10, height: 10 }, { id: 'img2', name: 'q', src: 'upload:abc', width: 10, height: 10 }], doc: { ...s.doc, artboards: [...s.doc.artboards, { id: 'bad', width: 0, height: 0 }] } })));
  ok('read back: a picture that is not an upload or an image is dropped; an artboard with no size is dropped', back.assets.length === 1 && back.assets[0].id === 'img2' && back.doc.artboards.length === 1 && back.versions.length === 3 && back.versions[2].from === 0);
  const p = T.normalizeProject(JSON.parse(JSON.stringify({ ...T.makeProject('create', 'x', NOW), medium: 'design', design: s })));
  ok('a design project survives the project store’s normaliser, and is summarised as a design', p.medium === 'design' && p.design.doc.artboards.length === 1 && T.summarize(p).stage === 'design' && T.summarize(p).graphic === 'poster');
}

sec('what the designer is told');
{
  const sys = PR.designSystem();
  ok('one set of instructions, the same every time (cacheable)', sys === PR.designSystem() && sys.length > 4000);
  ok('…naming every tag, every format and the faces', ['<say>', '<artboard', '<edit', '<remove', '<tokens>', '<remember>', '<question>', '<ok/>'].every((t) => sys.includes(t)) && F.FORMATS.every((f) => sys.includes(`${f.id}:`)) && /Instrument Serif/.test(sys));
  ok('…and the defaults it must not reach for', /purple or blue gradient/.test(sys) && /no house style/i.test(sys));
  ok('…every face described by its character, alphabetically within its kind (none first by habit)', /Anton \[headlines\] — tall condensed poster sans/.test(sys) && /UnifrakturMaguntia \[headlines\] — a blackletter/.test(sys) && sys.indexOf('Abril Fatface') < sys.indexOf('Instrument Serif') && sys.indexOf('Instrument Serif') < sys.indexOf('Young Serif'));
  ok('…the look derived from the subject: no fixed type recipe or colour formula, the drift-to default named, restraint kept specific', !/tight tracking on large sizes/.test(sys) && !/usually a ground, an ink and one accent/.test(sys) && /generated design drifts to a few looks/.test(sys) && /dark slate, green or navy ground/.test(sys) && /The image is a decision too/.test(sys) && /never a starting point/.test(sys) && /Restraint is right when the brief asks for it/.test(sys));
  ok('…and the look never tames a deliberate choice; SocriaUX’s own interface faces are not offered as its voice', /never tame a deliberate choice/i.test(sys) && !/Socria’s own voice|interface face/.test(sys));
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
  said.length = 0;
  await FL.runRequest(s0, { words: 'Make the first design from the brief.' }, transport([`<say>A section.</say><artboard id="new-1" format="a3"><style>h1{font-family:"Canela Deck",serif}</style><h1>Hi</h1></artboard>`, '<say>Fine.</say><ok/>']), bench, { parse, now: NOW });
  ok('…a face the library cannot serve is told to the look with what was measured', said[1]?.mode === 'look' && Object.values(said[1].measured ?? {}).flat().some((x) => /Canela Deck/.test(x) && /fallback/.test(x)), said[1]?.measured);
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
  const r = L.designFromLegacy(old, { now: NOW, parse });
  const d = r.project.design;
  const [a1, a2] = d.doc.artboards;
  ok('a graphic becomes a design project, both artboards drawn as they were (SVG, filling the artboard)', r.project.medium === 'design' && r.artboards === 2 && /<svg[^>]*class="legacy"[^>]*width="100%"/.test(a1.html) && a1.html.includes('Rooms') && a2.html.includes('<svg'), a1?.html?.slice(0, 300));
  ok('a print artboard in points is sized in CSS pixels at 96 to the inch, and keeps its format', a1.width === Math.round(842 * 96 / 72) && a1.height === Math.round(1191 * 96 / 72) && a1.format === 'a3' && a1.medium === 'print' && a2.format === 'instagram-square', [a1.width, a1.height, a1.format, a2.format]);
  ok('its own picture comes over as an asset the artboard names; one linked from the web is said, not drawn', d.assets.length === 1 && d.assets[0].src === 'upload:pic-1' && a1.html.includes('asset:img1') && /linked from the web/.test(d.turns[0].text), d.turns[0]?.text);
  ok('one version, the first turn says what happened, the old record kept untouched', d.versions.length === 1 && d.turns.length === 1 && /earlier editor/.test(d.turns[0].text) && r.project.legacy.medium === 'graphic' && r.project.legacy.data.doc.id === 'gd1' && !('graphic' in r.project));
  const kept = T.normalizeProject(JSON.parse(JSON.stringify(r.project)));
  ok('stored and read back: still a design, the legacy record still there', kept.medium === 'design' && kept.design.doc.artboards.length === 2 && kept.legacy?.medium === 'graphic', kept.legacy);
  ok('the frame draws the carried-over artboard with its faces found', FR.facesFor(a1, '').faces.includes('Instrument Serif'), FR.facesFor(a1, ''));
  ok('its SVG text is selectable like any element (ids given as it is carried over)', /<text[^>]*data-sx="e\d+"/.test(a1.html), a1.html.slice(0, 400));

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


sec('the person’s authority: locks, kept typography and colour, approvals');
{
  const HTML = `<style>.sx-root{background:var(--paper);font-family:'Fraunces',serif;color:var(--ink)} .wrap{opacity:1} .h{font-size:160px;line-height:.9} .sub{font-size:20px;color:#c8401c}</style><div class="wrap" data-sx="e1"><h1 class="h" data-sx="e2">Rooms for Living</h1><p class="sub" data-sx="e3">Six evenings</p></div>`;
  const TOK = ':root{--paper:#f4efe4;--ink:#141414;--other:#00ff00}';
  const ab = (o = {}) => ({ id: 'ab1', name: 'Poster', format: 'a3', width: 1123, height: 1587, medium: 'print', html: HTML, x: 0, y: 0, ...o });
  const doc = (o = {}) => ({ artboards: [ab(o)], tokens: TOK });
  const ans = (raw) => P.parseAnswer(raw);
  const apply = (d, raw) => A.applyAnswer(d, ans(raw), { parse, format: 'a3' });
  const edit = (find, replace) => `<edit artboard="ab1"><find>${find}</find><replace>${replace}</replace></edit>`;
  const lockedH = { locks: [{ id: 'e2', what: 'the headline', at: 1 }] };

  let r = apply(doc(lockedH), edit('.sub{font-size:20px', '.sub{font-size:28px'));
  ok('with the headline locked, something else on the artboard still changes', r.touched.length === 1 && !r.failed.length && /font-size:28px/.test(r.doc.artboards[0].html));
  r = apply(doc(lockedH), edit('.h{font-size:160px', '.h{font-size:120px'));
  ok('a change to the locked headline’s own style is refused, and said', !r.touched.length && r.failed.length === 1 && /the headline/.test(r.failed[0]) && /locked/.test(r.failed[0]), r.failed);
  r = apply(doc(lockedH), edit('Rooms for Living', 'Rooms to Live In'));
  ok('…so is a change to its words', !r.touched.length && /the headline/.test(r.failed[0] ?? ''));
  r = apply(doc(lockedH), edit("font-family:'Fraunces',serif", "font-family:'Anton',sans-serif"));
  ok('…and a change to a style it inherits (the root’s face): its typography is part of it', !r.touched.length && /the headline/.test(r.failed[0] ?? ''), r.failed);
  r = apply(doc(lockedH), edit('.wrap{opacity:1}', '.wrap{opacity:.4}'));
  ok('…and to what its container does to everything inside it (opacity)', !r.touched.length && /the headline/.test(r.failed[0] ?? ''));
  r = apply(doc(lockedH), `${edit('.sub{font-size:20px', '.sub{font-size:28px')}${edit('.h{font-size:160px', '.h{font-size:90px')}`);
  ok('of several changes, those that respect the lock are made and the one that breaks it is not', r.touched.length === 1 && r.failed.length === 1 && /font-size:28px/.test(r.doc.artboards[0].html) && /font-size:160px/.test(r.doc.artboards[0].html));
  const REWRITE_OK = `<artboard id="ab1"><style>.sx-root{background:#101010;font-family:'Fraunces',serif;color:var(--ink)} .wrap{opacity:1} .h{font-size:160px;line-height:.9} .band{height:40px;background:#c8401c}</style><div class="band" data-sx="e9"></div><div class="wrap" data-sx="e1"><h1 class="h" data-sx="e2">Rooms for Living</h1></div></artboard>`;
  r = apply(doc(lockedH), REWRITE_OK);
  ok('a whole rewrite that keeps the locked element exactly (its markup and every style reaching it) is made', r.touched.length === 1 && !r.failed.length && /band/.test(r.doc.artboards[0].html) && r.doc.artboards[0].locks.length === 1, r.failed);
  r = apply(doc(lockedH), REWRITE_OK.replace('font-size:160px', 'font-size:200px'));
  ok('a whole rewrite that changes it is refused whole', !r.touched.length && /not rewritten/.test(r.failed[0] ?? '') && /the headline/.test(r.failed[0] ?? ''));
  r = apply(doc(lockedH), `<tokens>:root{--paper:#f4efe4;--ink:#aa0000;--other:#00ff00}</tokens>`);
  ok('shared styles that would recolour the locked headline (through var) are kept as they were, and said', !r.tokensChanged && r.doc.tokens === TOK && /shared styles were not changed/.test(r.failed[0] ?? '') && /the headline/.test(r.failed[0] ?? ''), r.failed);
  r = apply(doc(lockedH), `<tokens>:root{--paper:#f4efe4;--ink:#141414;--other:#0000ff}</tokens>`);
  ok('…shared styles that do not reach it change freely', r.tokensChanged && !r.failed.length);

  const whole = { locked: true, state: 'approved' };
  r = apply(doc(whole), edit('.sub{font-size:20px', '.sub{font-size:28px'));
  ok('an approved, locked artboard: nothing on it changes', !r.touched.length && /locked \(approved\)/.test(r.failed[0] ?? ''), r.failed);
  r = apply(doc(whole), `<artboard id="ab1"><p>new</p></artboard>`);
  ok('…it is not rewritten', !r.touched.length && /not rewritten/.test(r.failed[0] ?? ''));
  r = apply(doc(whole), `<remove artboard="ab1"/>`);
  ok('…nor removed', !r.removed.length && /not removed/.test(r.failed[0] ?? ''));
  r = apply(doc(whole), `<tokens>:root{--paper:#000000;--ink:#141414;--other:#00ff00}</tokens>`);
  ok('…nor changed from under it by the shared styles', !r.tokensChanged && /“Poster”/.test(r.failed[0] ?? ''));
  r = apply(doc(whole), `<artboard id="new-1" format="a3" beside="ab1"><style>.sx-root{background:#000}</style><h1>Another take</h1></artboard><tokens>:root{--paper:#f4efe4;--ink:#141414;--other:#123456}</tokens>`);
  ok('…while another take beside it is made freely, with shared styles it does not use', r.made.length === 1 && r.tokensChanged && !r.failed.length, r.failed);

  r = apply(doc(), `<say>Kept.</say><lock artboard="ab1" element="e2">the headline</lock><lock artboard="ab1" element="e77">a ghost</lock><keep what="typography" artboard="ab1"/><keep what="colours" artboard="ab1"/>`);
  ok('the designer records a lock the person asked for — only on an element that is there', r.locked.length === 1 && r.doc.artboards[0].locks[0].what === 'the headline' && /not there/.test(r.failed[0] ?? '') && r.keep.length === 2, r);
  ok('what is kept is read from the artboard: its faces, and its colours (those written and those reaching it by var)', PN.facesUsed(ab(), TOK).join() === 'Fraunces' && ['#f4efe4', '#141414', '#c8401c'].every((c) => PN.coloursUsed(ab(), TOK).includes(c)) && !PN.coloursUsed(ab(), TOK).includes('#00ff00'), PN.coloursUsed(ab(), TOK));
  ok('a tint or shade of a kept colour is that colour; a neutral beside a kept neutral is kept; another hue is not', PN.colourKept('#e8a48f', ['#c8401c']) && PN.colourKept('#2a2a2a', ['#141414']) && !PN.colourKept('#2f6bff', ['#c8401c', '#141414', '#f4efe4']));
  const pinsKept = { faces: ['Fraunces'], colours: ['#f4efe4', '#141414', '#c8401c'] };
  ok('an artboard set in another face, or in another colour, is said against what was kept', PN.pinNotes({ html: `<style>h1{font-family:"Anton",sans-serif;color:#2f6bff}</style><h1>x</h1>` }, '', pinsKept).length === 2 && PN.pinNotes(ab(), TOK, pinsKept).length === 0, PN.pinNotes({ html: `<style>h1{font-family:"Anton",sans-serif;color:#2f6bff}</style><h1>x</h1>` }, '', pinsKept));

  // through a whole request
  const said = [];
  const transport = (answers) => ({ async send(body) { said.push(body); return { ok: true, text: answers[said.length - 1] ?? '<ok/>', model: 'fake', usage: null }; } });
  const bench = { picture: async () => 'data:image/jpeg;base64,AAAA', measure: async () => ({}) };
  let st = D.commit(D.emptyState('poster', 'a3', 'A lecture poster'), doc(), 'first', 'model', NOW);
  said.length = 0;
  let out = await FL.runRequest(st, { words: 'The headline works. Do not change it.' }, transport(['<say>Locked the headline.</say><lock artboard="ab1" element="e2">the headline</lock>']), bench, { parse, now: NOW + 5 });
  ok('“the headline works, do not change it”: locked, with no new version (a note on the design, not a change to it)', out.kind === 'done' && out.state.versions.length === 1 && out.state.doc.artboards[0].locks?.[0]?.id === 'e2' && out.state.versions[0].doc.artboards[0].locks?.length === 1 && out.turn.text === 'Locked the headline.', out.kind === 'done' ? out.turn : out);
  st = out.state;
  said.length = 0;
  out = await FL.runRequest(st, { words: 'I love this typography. Keep it while exploring a completely different composition.' }, transport([`<say>Two new compositions, same type.</say><keep what="typography" artboard="ab1"/><artboard id="new-1" format="a3" beside="ab1"><style>.sx-root{background:#141414;font-family:'Fraunces',serif;color:#f4efe4}</style><h1>Rooms</h1></artboard><artboard id="new-2" format="a3" beside="ab1"><style>.sx-root{background:#f4efe4;font-family:"Anton",sans-serif}</style><h1>Rooms</h1></artboard>`, '<say>Fine.</say><ok/>']), bench, { parse, now: NOW + 10 });
  ok('“keep this typography, explore other compositions”: the faces are kept for the project', out.kind === 'done' && out.state.memory.pins?.faces?.join() === 'Fraunces', out.kind === 'done' ? out.state.memory : out);
  ok('…the look is told which new artboard left them, and what is still off afterwards is said to the person (never hidden)', said[1]?.mode === 'look' && Object.values(said[1].measured ?? {}).flat().some((x) => /Anton/.test(x) && /said to keep/.test(x)) && out.turn.failed?.some((x) => /Anton/.test(x) && /typefaces/.test(x)), out.kind === 'done' ? out.turn.failed : out);
  const told = RQ.readDesignRequest({ words: 'Try a third', doc: out.state.doc, kind: 'poster', format: 'a3', memory: out.state.memory, turns: [], comments: [] }, () => null);
  ok('…and every later request says what is kept and what is locked', told.ok && /Typefaces the person said to keep — use only these: Fraunces/.test(told.user) && /Locked on ab1[^\n]*\[data-sx="e2"\] the headline/.test(told.user), told.ok ? told.user.slice(0, 1500) : told);

  // approval
  let ap = D.approveArtboard(st, 'ab1', NOW + 20);
  ok('approving an artboard: marked approved, locked whole, and its version kept for good', ap.doc.artboards[0].state === 'approved' && ap.doc.artboards[0].locked === true && ap.versions[ap.at].kept === 'Approved: Poster' && ap.versions.length === st.versions.length + 1);
  said.length = 0;
  out = await FL.runRequest(ap, { words: 'Make the headline red' }, transport([edit('.h{font-size:160px', '.h{color:red;font-size:160px')]), bench, { parse, now: NOW + 30 });
  ok('…a request to change it afterwards changes nothing, and says why', out.kind === 'done' && out.state.versions.length === ap.versions.length && /Nothing on the design changed/.test(out.turn.text) && /locked \(approved\)/.test(out.turn.failed?.[0] ?? ''), out.kind === 'done' ? out.turn : out);
  const reopened = D.reopenArtboard(ap, 'ab1');
  ok('…until the person reopens it (revision requested): then it can change, and the approved version is still in the history', reopened.doc.artboards[0].state === 'revision' && !reopened.doc.artboards[0].locked && reopened.versions.some((v) => v.kept === 'Approved: Poster'));
  const changedLater = D.commit(reopened, { ...reopened.doc, artboards: [{ ...reopened.doc.artboards[0], html: '<p data-sx="e1">later</p>' }] }, 'later', 'person', NOW + 40);
  const keptAt = changedLater.versions.findIndex((v) => v.kept);
  const restored = D.restoreArtboard(changedLater, keptAt, 'ab1', NOW + 50);
  ok('an artboard is brought back from an earlier version as a new version (nothing is overwritten)', /Rooms for Living/.test(restored.doc.artboards[0].html) && restored.versions.length === changedLater.versions.length + 1 && /Brought back “Poster” from version/.test(restored.versions.at(-1).said));

  // earlier versions in a request
  let hv = D.commit(D.emptyState('poster', 'a3', ''), doc({ html: '<style>.sx-root{background:#111}</style><h1 data-sx="e1">One</h1>' }), 'first', 'model', NOW);
  hv = D.commit(hv, doc({ html: '<style>.sx-root{background:#eee}</style><h1 data-sx="e1">Two</h1>' }), 'second', 'model', NOW + 1);
  hv = D.commit(hv, doc({ html: '<style>.sx-root{background:#c00}</style><h1 data-sx="e1">Three</h1>' }), 'third', 'model', NOW + 2);
  ok('the versions the words point at: by number, by order, “before”, “the original”', HI.versionsNamed('take the background from the first version and the typography from version 2', hv).join() === '1,0' && HI.versionsNamed('go back to the colours from before', hv).join() === '1,0' && HI.versionsNamed('the original was better', hv).join() === '0' && HI.versionsNamed('make it bigger', hv).length === 0, HI.versionsNamed('take the background from the first version and the typography from version 2', hv));
  said.length = 0;
  await FL.runRequest(hv, { words: 'Take the background from the first version.', noLook: true }, transport(['<say>Done.</say>']), bench, { parse, now: NOW + 9 });
  const sent = RQ.readDesignRequest(said[0], () => null);
  ok('…are sent with the request, as they were, and shown to the designer', said[0].earlier?.[0]?.n === 1 && /background:#111/.test(said[0].earlier[0].artboards[0].html) && sent.ok && /## Earlier versions/.test(sent.user) && /<was artboard="ab1" version="1">/.test(sent.user), sent.ok ? sent.user.slice(0, 600) : sent);
  const cmp = HI.compareVersions(hv.versions[0].doc, hv.versions[2].doc);
  ok('two versions compared, artboard by artboard', cmp.artboards[0].change === 'changed' && cmp.artboards[0].elements.changed + cmp.artboards[0].elements.same === 1 && !cmp.tokensChanged, cmp);
}

sec('a review: findings to act on or set aside');
{
  const HTML = `<style>.h{font-size:120px}</style><h1 class="h" data-sx="e1">Open House</h1><p data-sx="e2">Friday 18 September</p>`;
  const d = { artboards: [{ id: 'ab1', name: 'Poster', format: 'a3', width: 1123, height: 1587, medium: 'print', html: HTML, x: 0, y: 0 }], tokens: '' };
  const st = D.commit(D.emptyState('poster', 'a3', 'An open house'), d, 'first', 'model', NOW);
  const said = [];
  const RAW = `<say>It reads as an invitation, but the date is easy to miss.</say>
<finding kind="communication" artboard="ab1" element="e2">The date sits at the same size as the address line, so nothing tells a passer-by when to come.<fix>Make the date the second-largest thing on the sheet.</fix></finding>
<finding kind="accessibility" artboard="ab1" element="e9">Grey on cream at 3.1:1.<fix>Darken the grey.</fix></finding>
<finding kind="opinion" artboard="zzz">About nothing shown.</finding>
<edit artboard="ab1"><find>Open House</find><replace>Changed</replace></edit>`;
  const t = { async send(body) { said.push(body); return { ok: true, text: RAW, model: 'fake', usage: { cost: 0.02 } }; } };
  const bench = { picture: async () => 'data:image/jpeg;base64,AAAA', measure: async () => ({ ab1: ['“Friday 18 September” is cut off'] }) };
  const r = await FL.runReview(st, { words: 'Does this tell people when to come?', artboards: ['ab1'], facts: { ab1: ['text at 3.1:1 against its ground'] } }, t, bench, { now: NOW + 5 });
  ok('a review is asked with the pictures and what was measured, and changes nothing', r.kind === 'done' && said[0].mode === 'review' && said[0].pictures.length === 1 && said[0].measured.ab1.length === 2 && r.state.doc === st.doc && r.state.versions.length === 1, r.kind === 'done' ? said[0].measured : r);
  ok('its findings are kept on the turn, by kind, each about something that is there (an element that is not there is not pointed at; a kind it invented is a matter of judgement)', r.kind === 'done' && r.findings.length === 3 && r.findings[0].kind === 'communication' && r.findings[0].element === 'e2' && r.findings[0].fix.startsWith('Make the date') && r.findings[1].kind === 'accessibility' && r.findings[1].element === null && r.findings[2].kind === 'opportunity' && r.findings.every((f) => f.status === 'open' && f.artboard === 'ab1'), r.kind === 'done' ? r.findings : r);
  const two = { ...st, doc: { ...st.doc, artboards: [...st.doc.artboards, { ...st.doc.artboards[0], id: 'ab2', name: 'Second' }] } };
  const r2 = await FL.runReview(two, { words: '', artboards: ['ab1', 'ab2'] }, t, bench, { now: NOW + 6 });
  ok('…with several artboards shown, a finding about one that was not shown is left out', r2.kind === 'done' && r2.findings.length === 2 && said.at(-1).words === 'Review this design.', r2.kind === 'done' ? r2.findings.length : r2);
  const marked = FL.markFinding(r.state, r.findings[0].id, 'applied');
  ok('a finding is applied or set aside one at a time', marked.turns.at(-1).findings[0].status === 'applied' && marked.turns.at(-1).findings[1].status === 'open');
  const back = D.normalizeDesignState(JSON.parse(JSON.stringify(marked)));
  ok('…and kept with the project', back.turns.at(-1).findings.length === 3 && back.turns.at(-1).findings[0].status === 'applied');
  const req = RQ.readDesignRequest({ ...said[0], company: { name: 'Northlight', about: ['An architecture studio'], products: [], audiences: [], principles: ['Plain words'], avoid: ['stock photography'], missing: ['an approved logo'] } }, (v) => (typeof v === 'string' ? v : null));
  ok('the reviewer is told to review, not change — with the company apart from the project', req.ok && req.mode === 'review' && req.tier === 'premium' && /Review, do not change/.test(req.user) && /## The company: Northlight \(permanent/.test(req.user) && /turned down, for good: stock photography/.test(req.user) && /Not available[^\n]*an approved logo/.test(req.user), req.ok ? req.user.slice(0, 900) : req);
  const sys = PR.designSystem();
  ok('the instructions: how to review (specific, kinds kept apart, never the designer’s own taste), what the person has decided, the company, the kinds of work', /# Reviewing/.test(sys) && /never "improve the hierarchy"/.test(sys) && /# What the person has decided/.test(sys) && /Criticism is aimed/.test(sys) && /# The company/.test(sys) && /never invent facts/i.test(sys) && /# Kinds of work/.test(sys) && /<lock artboard=/.test(sys));
  const a = P.parseAnswer('<artboard id="new-1" format="story" seconds="6"><p>x</p></artboard>');
  ok('an artboard that moves says how long', a.blocks[0].seconds === 6 && A.applyAnswer({ artboards: [], tokens: '' }, a, { parse, format: 'story' }).doc.artboards[0].seconds === 6);
}

sec('what is kept stays as it was kept; what is protected holds under new shared styles');
{
  const art = (o = {}) => ({ id: 'ab1', name: 'Poster', format: 'a3', width: 1123, height: 1587, medium: 'print', html: '<style>.h{color:var(--ink);font-family:var(--display)}</style><h1 class="h" data-sx="e1">Rooms</h1><p data-sx="e2" style="color:var(--quiet)">Six evenings</p>', x: 0, y: 0, ...o });
  let st = D.commit(D.emptyState('poster', 'a3', ''), { artboards: [art()], tokens: ':root{--ink:#111;--quiet:#777;--display:Fraunces}' }, 'first', 'model', NOW);
  const ap = D.approveArtboard(st, 'ab1', NOW + 1);
  const approvedAt = ap.at;
  const re = D.reopenArtboard(ap, 'ab1', 'revision', NOW + 2);
  ok('reopening an approved artboard is a version of its own: the approved version is not rewritten', re.versions.length === ap.versions.length + 1 && /Reopened “Poster”/.test(re.versions[re.at].said) && re.versions[approvedAt].doc.artboards[0].state === 'approved' && re.versions[approvedAt].doc.artboards[0].locked === true && re.doc.artboards[0].state === 'revision' && !re.doc.artboards[0].locked);
  const noted = D.annotate(ap, D.withState(ap.doc, 'ab1', 'archived'), 'Changed its status', NOW + 3);
  ok('…nor by any later note on it (a status, a lock): a kept version is never changed in place', noted.versions.length === ap.versions.length + 1 && noted.versions[approvedAt].doc.artboards[0].state === 'approved');
  const plain = D.annotate(st, D.withElementLock(st.doc, 'ab1', 'e1', 'the headline', NOW), 'Locked an element');
  ok('a note on a version that is not kept makes no new version', plain.versions.length === st.versions.length && plain.doc.artboards[0].locks?.[0].id === 'e1');

  // new shared styles against what is protected
  const lockedDoc = { artboards: [art({ locked: true, state: 'approved' }), art({ id: 'ab2', name: 'Draft' })], tokens: st.doc.tokens };
  const hits = (after, p) => LK.protectedUnder(lockedDoc, after, p).map((a) => a.id).join();
  ok('new shared styles that change a colour an approved artboard uses would change it (exactly, with a parser)', hits(':root{--ink:#222;--quiet:#777;--display:Fraunces}', parse) === 'ab1');
  ok('…and the same is found without a parser (the server’s check)', hits(':root{--ink:#222;--quiet:#777;--display:Fraunces}') === 'ab1');
  ok('a new property it never uses changes nothing on it', hits(':root{--ink:#111;--quiet:#777;--display:Fraunces;--accent:#f06}', parse) === '' && hits(':root{--ink:#111;--quiet:#777;--display:Fraunces;--accent:#f06}') === '');
  const elDoc = { artboards: [art({ locks: [{ id: 'e1', what: 'the headline', at: NOW }] })], tokens: st.doc.tokens };
  ok('a locked element is touched only by what reaches it: the other line’s colour may change', LK.protectedUnder(elDoc, ':root{--ink:#111;--quiet:#555;--display:Fraunces}', parse).length === 0 && LK.protectedUnder(elDoc, ':root{--ink:#111;--quiet:#777;--display:Anton}', parse).length === 1);
  ok('nothing protected, nothing held', LK.protectedUnder({ artboards: [art()], tokens: st.doc.tokens }, ':root{--ink:#000}', parse).length === 0);

  // a picture's note is kept with the project
  const kept = D.normalizeDesignState({ ...st, assets: [{ id: 'logo', name: 'Logo', src: 'upload:abc', width: 10, height: 10, note: 'The approved logo: use it as it is.' }] });
  ok('what a picture is (its note) is kept with the project', kept.assets[0].note === 'The approved logo: use it as it is.');
  ok('the canvas is told what is locked, and holds it still (no drag, no retyping)', /m\.sx==='locks'/.test(FR.INTERACT_SOURCE) && /if\(isLocked\(el\)\|\|holdsLocked\(el\)\) return;/.test(FR.INTERACT_SOURCE) && /if\(!el\|\|isLocked\(el\)\) return;/.test(FR.INTERACT_SOURCE));
}

sec('asked for a judgement, or for a change');
{
  const yes = ['Review this poster', 'Critique the typography', 'please evaluate this against our brand', 'What do you think of the headline?', 'Give me your honest feedback', 'Any feedback?', "What's wrong with this?", 'How could this be better?', 'Is this ready for print?', 'Does it communicate our philosophy?', 'Can you vet this before it goes out'];
  const no = ['This looks too much like generic AI branding.', 'The typography feels immature.', 'Make the headline bigger', 'The colors are good, but the composition has no personality.', 'Review section should come before pricing', 'Is this ready? If not, make it bolder', 'Add a review from a customer', 'The headline works. Do not change it.', 'Does this work in dark? Make a dark one'];
  ok('asking for the designer’s judgement is a review', yes.every((w) => RQ.wantsReview(w)), yes.filter((w) => !RQ.wantsReview(w)));
  ok('the person’s own criticism, and anything asked to be made or changed, is a change', no.every((w) => !RQ.wantsReview(w)), no.filter((w) => RQ.wantsReview(w)));
}

sec('contrast, measured on the picture');
{
  // a 200 × 100 picture of what is behind the words (the artboard drawn without them): one ground, or two halves
  const picture = (ground, _words, _box, vary = null) => {
    const w = 200, h = 100, data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const c = vary && x >= w / 2 ? vary : ground;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
    return { data, width: w, height: h, scale: 1 };
  };
  const box = { x: 20, y: 20, w: 160, h: 40 };
  const t = (color, size = 16, weight = 400) => [{ id: 'e1', ...box, color, size, weight, text: 'Reserve a table' }];
  const grey = CT.contrastFacts(t('rgb(150, 150, 150)'), picture([255, 255, 255], [150, 150, 150], box));
  ok('grey words on white are measured and fall short (about 3:1 against 4.5:1)', grey.length === 1 && grey[0].ratio > 2.7 && grey[0].ratio < 3.2 && grey[0].needs === 4.5 && grey[0].over === 'flat', grey);
  ok('black on white is fine: nothing is said', CT.contrastFacts(t('rgb(0, 0, 0)'), picture([255, 255, 255], [0, 0, 0], box)).length === 0);
  ok('the same grey set large needs only 3:1, and passes', CT.contrastFacts(t('rgb(148, 148, 148)', 40), picture([255, 255, 255], [148, 148, 148], box)).length === 0);
  const photo = CT.contrastFacts(t('rgb(255, 255, 255)'), picture([20, 20, 20], [255, 255, 255], box, [230, 230, 230]));
  ok('white words half over a dark ground and half over a pale one: measured at the weaker part, and said to be over something that varies', photo.length === 1 && photo[0].over === 'varied' && photo[0].ratio < 1.5, photo);
  ok('words set on their own colour are found', CT.contrastFacts(t('rgb(200, 30, 30)'), picture([200, 30, 30], [200, 30, 30], box))[0]?.ratio === 1);
  ok('a translucent colour is not guessed at', CT.contrastFacts(t('rgba(0, 0, 0, 0.4)'), picture([255, 255, 255], [150, 150, 150], box)).length === 0);
  ok('it is said as a measurement, with the element and what it needs', /measured/.test(CT.contrastSaid(grey[0])) && /data-sx="e1"/.test(CT.contrastSaid(grey[0])) && /4\.5:1/.test(CT.contrastSaid(grey[0])));
  ok('the frame reports where words are and what they are set in, leaving out decoration', /texts\.push\(\{id:/.test(FR.INTERACT_SOURCE) && /aria-hidden="true"/.test(FR.INTERACT_SOURCE));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
