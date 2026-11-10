// SocriaUX (/ux) — the parts that decide what a designer sees and keeps.
//
// What goes wrong here does not throw: a reducer that quietly drops an edge,
// an audit that misses a placeholder-only field, a model reply that pins an
// annotation to an element that is not there, a stored project that comes
// back without its research. Each is checked by what it does.

import {
  makeProject, makeArtboard, makeElement, makeNode, reduce, normalizeProject, uid,
  ungroundedDecisions, supportOf, briefFilled, nextArtboardSlot, LIMITS,
  contrastRatio, auditArtboard, backgroundOf, findingsDigest, tally,
  buildContext, buildSystemPrompt, parseReply, describeArtboard, threadForModel, INTENTS,
  generateCode, artboardFromTemplate, exampleProject, TEMPLATES,
  readIndex, saveProject, loadProject, deleteProject, newer, INDEX_KEY,
} from './.tmp/ux-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== a project, created and normalised ===');
{
  const p = makeProject('  Checkout  ');
  ok('the name is trimmed', p.name === 'Checkout', p.name);
  ok('guided discovery is the default mode', p.mode === 'guided');
  ok('it starts at framing', p.stage === 'frame');
  ok('an empty name becomes Untitled', makeProject('   ').name === 'Untitled project');
  ok('garbage is not a project', normalizeProject({ v: 2 }) === null);
  const n = normalizeProject({ name: 'x', artboards: [{ elements: [{ kind: 'nope', fill: 'red', x: 'a' }] }] });
  const e = n.artboards[0].elements[0];
  ok('an unknown kind becomes a rect', e.kind === 'rect');
  ok('a non-hex colour falls back', e.fill === '#f4f1e8', e.fill);
  ok('a non-number position falls back', e.x === 24);
  const big = normalizeProject({ artboards: Array.from({ length: 40 }, () => ({})) });
  ok('artboards are capped', big.artboards.length === LIMITS.artboards);
  const img = normalizeProject({ artboards: [{ image: { src: 'javascript:alert(1)', w: 1, h: 1 } }] });
  ok('only a data:image URL survives as a screenshot', img.artboards[0].image === null);
}

console.log('\n=== the reducer ===');
{
  let p = makeProject('R');
  const ab = makeArtboard({ id: 'ab1' });
  p = reduce(p, { type: 'artboard/add', artboard: ab });
  ok('an artboard is added', p.artboards.length === 1);
  const btn = makeElement('button', { id: 'b1', x: 10, y: 10 });
  p = reduce(p, { type: 'element/add', artboardId: 'ab1', element: btn });
  ok('an element is added to its artboard', p.artboards[0].elements[0].id === 'b1');
  const same = reduce(p, { type: 'element/update', artboardId: 'ab1', id: 'missing', patch: { x: 1 } });
  ok('an update to nothing returns the same object', same === p);
  p = reduce(p, { type: 'element/update', artboardId: 'ab1', id: 'b1', patch: { x: 40, fill: 'not-a-colour' } });
  ok('an update moves it', p.artboards[0].elements[0].x === 40);
  ok('…and cannot write an invalid colour', p.artboards[0].elements[0].fill === '#354620', p.artboards[0].elements[0].fill);

  p = reduce(p, { type: 'annotation/add', annotation: { id: 'a1', artboardId: 'ab1', elementId: 'b1', text: 'Too small?' } });
  p = reduce(p, { type: 'annotation/add', annotation: { id: 'a2', artboardId: 'nowhere', text: 'lost' } });
  ok('an annotation needs a real artboard', p.annotations.length === 1);

  const n1 = makeNode('assumption', 'Users know the icon', { id: 'n1', artboardId: 'ab1', elementId: 'b1' });
  const n2 = makeNode('decision', 'Icon-only button', { id: 'n2' });
  p = reduce(p, { type: 'node/add', node: n1 });
  p = reduce(p, { type: 'node/add', node: n2 });
  p = reduce(p, { type: 'edge/add', edge: { id: 'e1', from: 'n1', to: 'n2', kind: 'supports' } });
  p = reduce(p, { type: 'edge/add', edge: { id: 'e2', from: 'n2', to: 'n1', kind: 'contradicts' } });
  ok('one relation per pair, a second replaces its kind', p.edges.length === 1 && p.edges[0].kind === 'contradicts', JSON.stringify(p.edges));
  const self = reduce(p, { type: 'edge/add', edge: { id: 'e3', from: 'n1', to: 'n1', kind: 'supports' } });
  ok('a node cannot relate to itself', self === p);

  p = reduce(p, { type: 'element/remove', artboardId: 'ab1', id: 'b1' });
  ok('removing an element unpins its annotation', p.annotations[0].elementId === null);
  ok('…and unlinks its node, keeping the node', p.nodes.find((n) => n.id === 'n1').elementId === null);

  p = reduce(p, { type: 'node/remove', id: 'n1' });
  ok('removing a node removes its edges', p.edges.length === 0);

  p = reduce(p, { type: 'artboard/alternative', id: 'ab1', newId: 'ab2', intent: 'Try a single-step form' });
  const alt = p.artboards.find((a) => a.id === 'ab2');
  ok('an alternative records its parent', alt.parentId === 'ab1');
  ok('…and its intent', alt.intent === 'Try a single-step form');
  ok('…and sits to the right', alt.x > p.artboards[0].x + p.artboards[0].w);
  p = reduce(p, { type: 'artboard/remove', id: 'ab1' });
  ok('removing the parent orphans the alternative cleanly', p.artboards[0].parentId === null);
  ok('…and takes its annotations', p.annotations.length === 0);

  const t0 = p.updatedAt;
  const t = reduce(p, { type: 'mode/set', mode: 'direct' }, t0 + 1000);
  ok('a change stamps updatedAt', t.updatedAt === t0 + 1000);
  ok('setting the same mode changes nothing', reduce(t, { type: 'mode/set', mode: 'direct' }) === t);

  let m = reduce(p, { type: 'message/add', message: { id: 'm1', role: 'socria', text: 'hi', suggestions: [{ id: 's1', type: 'node', kind: 'risk', label: 'R' }] } });
  m = reduce(m, { type: 'message/suggestion', messageId: 'm1', suggestionId: 's1', state: 'accepted' });
  ok('a suggestion is marked accepted', m.messages[0].suggestions[0].state === 'accepted');
}

console.log('\n=== reading the reasoning ===');
{
  let p = makeProject('G');
  const d = makeNode('decision', 'Require an account', { id: 'd' });
  const a = makeNode('assumption', 'People want accounts', { id: 'a' });
  const ev = makeNode('evidence', 'P2 asked why an account', { id: 'ev' });
  for (const n of [d, a, ev]) p = reduce(p, { type: 'node/add', node: n });
  p = reduce(p, { type: 'edge/add', edge: { id: 'x', from: 'a', to: 'd', kind: 'supports' } });
  ok('a decision resting on an assumption is ungrounded', ungroundedDecisions(p).length === 1);
  p = reduce(p, { type: 'edge/add', edge: { id: 'y', from: 'ev', to: 'd', kind: 'supports' } });
  ok('…and grounded once evidence supports it', ungroundedDecisions(p).length === 0);
  ok('support is read from the edges', supportOf(p, 'd').supports.length === 2);
  ok('the brief counts what is filled', briefFilled({ problem: 'Long enough problem', users: 'short', goals: '', constraints: '', success: '' }) === 1);
  ok('the first artboard goes at the origin', JSON.stringify(nextArtboardSlot(makeProject('e'), 390)) === '{"x":0,"y":0}');
}

console.log('\n=== the measured checks ===');
{
  ok('black on white is 21:1', contrastRatio('#000000', '#ffffff') === 21);
  ok('#777 on white just fails AA', contrastRatio('#777777', '#ffffff') < 4.5);
  const ab = artboardFromTemplate('signup');
  const f = auditArtboard(ab);
  const rules = new Set(f.map((x) => x.rule));
  ok('placeholder-only inputs are found', f.filter((x) => x.rule === 'input-label').length === 3, String(f.filter((x) => x.rule === 'input-label').length));
  ok('two primary buttons compete', rules.has('competing-primary'));
  ok('grey helper text fails contrast', f.some((x) => x.rule === 'contrast' && x.title.includes('Book appointments')));
  ok('the 11px password rules are too small', f.some((x) => x.rule === 'small-text' && x.measure === '11px'));
  ok('the 20px checkbox is too small to tap', f.some((x) => x.rule === 'target-size'));
  ok('high severity comes first', f[0].severity === 'high');
  ok('ids are stable across runs', JSON.stringify(auditArtboard(ab).map((x) => x.id)) === JSON.stringify(f.map((x) => x.id)));
  ok('every finding speaks in three registers', f.every((x) => x.question && x.explanation && x.fix && x.principle));
  const t = tally(f);
  ok('the tally adds up', t.high + t.medium + t.low === f.length);
  ok('the digest names elements', /\{element /.test(findingsDigest(f)));
  ok('a clean empty board has no findings', auditArtboard(makeArtboard()).length === 0);

  const card = makeArtboard({ elements: [
    makeElement('rect', { id: 'r', x: 0, y: 0, w: 300, h: 200, fill: '#000000' }),
    makeElement('text', { id: 't', x: 10, y: 10, w: 200, h: 20, color: '#111111', text: 'Dark on dark' }),
  ] });
  ok('text inside a filled shape is measured against the shape', backgroundOf(card, card.elements[1]) === '#000000');
  ok('…which catches dark-on-dark', auditArtboard(card).some((x) => x.rule === 'contrast'));
}

console.log('\n=== what the model is told ===');
{
  const p = exampleProject(1700000000000);
  const ab = p.artboards[0];
  const btn = ab.elements.find((e) => e.kind === 'button');
  const ctx = buildContext(p, { artboardId: ab.id, elementId: btn.id, nodeId: null });
  ok('the brief is in it', ctx.includes('community clinic'));
  ok('every element id is in it', ab.elements.every((e) => ctx.includes(e.id)));
  ok('the selection is named', ctx.includes('SELECTED ELEMENT'));
  ok('the measured checks are in it', ctx.includes('AUTOMATIC CHECKS'));
  ok('beliefs are marked as beliefs', ctx.includes('belief, not observed'));
  ok('the map is in it', p.nodes.every((n) => ctx.includes(n.id)));
  const empty = buildContext(makeProject('E'), { artboardId: null, elementId: null, nodeId: null });
  ok('no research means assumption, said out loud', empty.includes('Anything said about users is therefore an assumption'));
  for (const intent of INTENTS) {
    const s = buildSystemPrompt('guided', intent);
    ok(`the ${intent} prompt asks for JSON and forbids emoji`, s.includes('ONE JSON object') && s.includes('No emoji'));
  }
  ok('guided mode never withholds a requested fact', buildSystemPrompt('guided', 'ask').includes('Never answer a request for information with only a question'));
  ok('code is direct in every mode', buildSystemPrompt('guided', 'code').includes('provide it in every mode'));
  ok('direct mode hands the decision back', buildSystemPrompt('direct', 'critique').includes('Hand the decision back'));
  ok('an artboard description marks mobile', describeArtboard(ab).includes('(mobile)'));
}

console.log('\n=== what is accepted back ===');
{
  const p = exampleProject(1700000000000);
  const ab = p.artboards[0];
  const real = ab.elements[3].id;
  const node = p.nodes[0].id;
  let n = 0;
  const id = () => `s${++n}`;
  const raw = JSON.stringify({
    kind: 'critique',
    reply: 'Three fields rely on placeholders.',
    questions: ['What does the field ask once someone types?', 'What does the field ask once someone types?'.toUpperCase()],
    principles: [{ name: 'Labels', summary: 'WCAG 3.3.2' }],
    annotations: [
      { elementId: real, kind: 'issue', severity: 'high', text: 'No label', principle: 'WCAG 3.3.2' },
      { elementId: 'el_invented', kind: 'issue', severity: 'low', text: 'Pinned to nothing' },
      { elementId: real, kind: 'issue', text: '' },
    ],
    nodes: [
      { kind: 'assumption', label: 'People remember placeholders', linkTo: node, linkKind: 'contradicts' },
      { kind: 'assumption', label: 'Links to a ghost', linkTo: 'n_ghost', linkKind: 'supports' },
      { kind: 'weird', label: 'Unknown kind' },
    ],
    code: null,
  });
  const r = parseReply(raw, p, { artboardId: ab.id, elementId: null, nodeId: null }, id);
  const anns = r.suggestions.filter((s) => s.type === 'annotation');
  const nodes = r.suggestions.filter((s) => s.type === 'node');
  ok('the kind is kept', r.kind === 'critique');
  ok('an empty annotation is dropped', anns.length === 2, String(anns.length));
  ok('a real element id is kept', anns[0].elementId === real);
  ok('an invented element id is unpinned, not trusted', anns[1].elementId === null);
  ok('a link to a real node is kept', nodes[0].linkTo === node && nodes[0].linkKind === 'contradicts');
  ok('a link to a ghost node is dropped', nodes[1].linkTo === null && nodes[1].linkKind === null);
  ok('an unknown node kind falls back', nodes[2].kind === 'assumption');
  ok('every suggestion starts pending', r.suggestions.every((s) => s.state === 'pending'));
  const prose = parseReply('Not JSON at all.', p, { artboardId: null, elementId: null, nodeId: null }, id);
  ok('prose survives as a plain answer', prose.text === 'Not JSON at all.' && prose.suggestions.length === 0);
  const fenced = parseReply('```json\n{"kind":"code","reply":"Here","code":{"language":"css","title":"Btn","content":".b{}","explanation":"x"}}\n```', p, { artboardId: null, elementId: null, nodeId: null }, id);
  ok('fenced JSON is read', fenced.kind === 'code' && fenced.code.language === 'css');
  let pp = p;
  pp = reduce(pp, { type: 'message/add', message: { id: 'q', role: 'socria', text: 'Who fills this in?', questions: ['Patient or caregiver?'] } });
  ok('the thread tells the model which questions it already asked', threadForModel(pp).at(-1).content.includes('Questions asked: Patient or caregiver?'));
}

console.log('\n=== the code an artboard becomes ===');
{
  const g = generateCode(artboardFromTemplate('signup'));
  ok('one h1', (g.html.match(/<h1/g) || []).length === 1);
  ok('buttons are buttons', (g.html.match(/<button type="button"/g) || []).length === 2);
  ok('a placeholder-only field is flagged in the markup', g.html.includes('No visible label in the design'));
  ok('…and in the notes', g.notes.some((n) => n.includes('no visible label')));
  ok('the checkbox keeps its label', g.html.includes('I agree to the Terms'));
  ok('layout is flow, not absolute', !g.css.includes('position: absolute') && g.css.includes('margin-top'));
  ok('focus is visible', g.css.includes(':focus-visible'));
  ok('the document is complete', g.doc.startsWith('<!doctype html>') && g.doc.includes('</html>'));
  const d = generateCode(artboardFromTemplate('dashboard'));
  ok('a shape around content becomes a section', d.html.includes('<section'));
  ok('side-by-side cards become a flex row', /display: flex;\n  flex-wrap: wrap/.test(d.css));
  ok('the nav becomes links', d.html.includes('<nav') && d.html.includes('<a href="#">Customers</a>'));
  const x = generateCode(makeArtboard({ elements: [makeElement('heading', { text: '<script>x</script>' })] }));
  ok('text is escaped', !x.html.includes('<script>x') && x.html.includes('&lt;script&gt;'));
}

console.log('\n=== templates and the example ===');
{
  ok('every template builds', TEMPLATES.every((t) => artboardFromTemplate(t.id).w > 0));
  const ex = exampleProject(1);
  ok('the example has research, a map and relations', ex.research.length >= 4 && ex.nodes.length >= 4 && ex.edges.length >= 2);
  ok('the example survives normalisation intact', JSON.stringify(normalizeProject(JSON.parse(JSON.stringify(ex)))) === JSON.stringify(ex));
  ok('one research note is a belief', ex.research.some((r) => !r.isEvidence));
}

console.log('\n=== the browser store ===');
{
  const mem = new Map();
  const kv = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const a = makeProject('A', {}, 1000);
  const b = makeProject('B', {}, 2000);
  saveProject(a, kv);
  saveProject(b, kv);
  ok('the index lists newest first', readIndex(kv).map((s) => s.name).join() === 'B,A');
  ok('a project comes back whole', JSON.stringify(loadProject(a.id, kv)) === JSON.stringify(a));
  saveProject({ ...a, name: 'A2', updatedAt: 3000 }, kv);
  ok('saving again updates its line, not a second one', readIndex(kv).length === 2 && readIndex(kv)[0].name === 'A2');
  deleteProject(b.id, kv);
  ok('deleting removes both', readIndex(kv).length === 1 && loadProject(b.id, kv) === null);
  mem.set(INDEX_KEY, '{broken');
  ok('a broken index reads as empty, not a crash', readIndex(kv).length === 0);
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  ok('a full store is reported, not thrown', saveProject(a, full).ok === false);
  ok('the newer copy wins', newer({ ...a, updatedAt: 5 }, { ...a, updatedAt: 9 }).updatedAt === 9);
  ok('uid is unique', uid('x') !== uid('x'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
