// MIND MAP 2.0 — one canonical graph, three ways of working with it (Logos 6, November 2026; docs/MIND-MAP-2.md).
//
// What is held down:
//   • ONE MAP: Ideas, Logic and Structure work on the same cards and lines — a card's own data is the card's, where
//     it was put is kept per way of working, and switching loses nothing;
//   • A CARD carries what it means, why it matters, notes, tags, sources, assumptions, fields, a tone and a shape —
//     cleaned like anything else from a browser; a card can still be just its title;
//   • A LINE is first-class: a stable identity, a kind, why it holds, what bears it out, and whether the person
//     confirmed it or Socria read or suggested it; a line of STRUCTURE is not a line of MEANING between the same cards;
//   • STRUCTURE is a deterministic projection: the person's choices first, then containment read from the lines
//     (marked as inferred, never written), never a loop — a line that would close one is refused, with a reason;
//   • the MAP PASS can never take away what the person wrote, confirmed or built structure with;
//   • the canvas is addressable (a reply can point at a card), the views sit on the left by default and can be
//     moved, and the most recent conversation is marked quietly.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import * as M from './.tmp/mindmap-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const quiet = (f) => { const e = console.error; console.error = () => {}; try { return f(); } finally { console.error = e; } };

const BASE = M.sanitizeMap({
  nodes: [
    { id: 'econ', type: 'concept', label: 'Microeconomics' },
    { id: 'oc', type: 'concept', label: 'Opportunity cost', mind: { meaning: 'The value of the next-best alternative forgone.', why: 'It explains the trade-offs in every economic decision.', notes: 'Review Chapter 2.' } },
    { id: 'ppf', type: 'concept', label: 'Production possibility frontier' },
    { id: 'bow', type: 'claim', label: 'The PPF is bowed out' },
    { id: 'sc', type: 'claim', label: 'Scarcity forces choices' },
  ],
  edges: [
    { from: 'oc', to: 'bow', relation: 'supports', why: 'Increasing opportunity cost explains the bowed-out shape of a typical PPF.' },
    { from: 'bow', to: 'ppf', relation: 'applies_to' },
    { from: 'ppf', to: 'econ', relation: 'part_of', kind: 'structure' },
    { from: 'sc', to: 'oc', relation: 'leads_to' },
  ],
});

console.log('\n=== a card carries what it means, cleaned ===');
{
  const m = M.sanitizeNodeMind({ subtitle: 'A trade-off  ', meaning: 'x'.repeat(900), tags: ['#Core', 'core', 'Chapter 2', ...Array(10).fill('t')], sources: [{ title: 'Mankiw ch.1', url: 'https://example.org/ch1' }, { title: 'Bad', url: 'javascript:alert(1)' }, { url: 'https://x.y' }], assumptions: ['Resources are not equally suited to every use.'], props: [{ k: 'Chapter', v: '2' }, { k: '', v: 'x' }], tone: 'moss', shape: 'pill', pos: { i: [10.4, 20], l: [1e9, 3] }, order: 2, folded: true, junk: 1, ai: { meaning: 'Socria’s reading' } });
  ok('kept: subtitle, meaning (clipped), tags (lower case, once each, at most 8), sources, assumptions, fields, tone, shape', m.subtitle === 'A trade-off' && m.meaning.length === 400 && J(m.tags.slice(0, 3)) === J(['core', 'chapter 2', 't']) && m.tags.length <= 8 && m.sources.length === 2 && m.assumptions.length === 1 && J(m.props) === J([{ k: 'Chapter', v: '2' }]) && m.tone === 'moss' && m.shape === 'pill', J(m));
  ok('…a source address only when it is http(s); nothing unknown kept', m.sources[0].url === 'https://example.org/ch1' && !m.sources[1].url && !('junk' in m));
  ok('…positions rounded and kept inside the canvas, per way of working', J(m.pos) === J({ i: [10, 20], l: [20000, 3] }));
  ok('…Socria’s reading kept apart from the person’s own', m.ai.meaning === 'Socria’s reading' && !m.meaning.startsWith('Socria'));
  ok('a card can be its title and nothing else', M.sanitizeNodeMind({}) === undefined && !BASE.nodes.find((n) => n.id === 'econ').mind);
  ok('what a card carries survives a save (sanitizeMap)', BASE.nodes.find((n) => n.id === 'oc').mind.notes === 'Review Chapter 2.');
}

console.log('\n=== a line is first-class ===');
{
  const x = M.sanitizeEdgeExtra({ id: 'e_1', kind: 'structure', why: 'Because.', evidence: ['Fig. 2.1', 'p. 34', '', 'a', 'b'], status: 'suggested', confidence: 0.834, junk: 1 });
  ok('identity, structure, why, what bears it out (at most 4), status, confidence', x.id === 'e_1' && x.kind === 'structure' && x.why === 'Because.' && J(x.evidence) === J(['Fig. 2.1', 'p. 34', 'a', 'b']) && x.status === 'suggested' && x.confidence === 0.83 && !('junk' in x));
  ok('…a confidence only on a suggestion; an id only of safe characters', M.sanitizeEdgeExtra({ status: 'confirmed', confidence: 0.9 }).confidence === undefined && M.sanitizeEdgeExtra({ id: 'a b<' }).id === undefined);
  const both = M.sanitizeMap({ nodes: [{ id: 'a', type: 'concept', label: 'Derivatives' }, { id: 'b', type: 'concept', label: 'Calculus' }], edges: [{ from: 'a', to: 'b', relation: 'part_of' }, { from: 'a', to: 'b', relation: 'supports', kind: 'structure' }] });
  ok('a line of structure and a line of meaning between the same cards are both kept; structure is always "sits inside"', both.edges.length === 2 && both.edges.filter((e) => e.kind === 'structure').length === 1 && both.edges.every((e) => e.relation === 'part_of'), J(both.edges));
  ok('a line\'s identity is stable, its own when it has one', M.edgeIdOf(BASE.edges[1]) === M.edgeIdOf({ ...BASE.edges[1] }) && M.edgeIdOf({ ...BASE.edges[1], id: 'mine' }) === 'mine' && M.edgeIdOf(BASE.edges[2]) !== M.edgeIdOf({ ...BASE.edges[2], kind: undefined }));
  ok('its status: confirmed (by the person, or structure they made), suggested by Socria, or read from the conversation', M.lineStatus({ status: 'confirmed' }) === 'confirmed' && M.lineStatus({ kind: 'structure' }) === 'confirmed' && M.lineStatus({ status: 'suggested' }) === 'suggested' && M.lineStatus({}) === 'read');
}

console.log('\n=== the edits ===');
{
  const r = M.applyMapEdits(BASE, [{ op: 'mind', id: 'oc', set: { notes: '', subtitle: 'A trade-off', tags: ['core'] } }]);
  const oc = r.map.nodes.find((n) => n.id === 'oc').mind;
  ok('a card\'s fields set and cleared, the rest kept', oc.subtitle === 'A trade-off' && !oc.notes && J(oc.tags) === J(['core']) && oc.meaning.startsWith('The value'), J(oc));
  const placed = M.applyMapEdits(BASE, [{ op: 'place', id: 'ppf', mode: 'ideas', x: 100, y: 40 }, { op: 'place', id: 'ppf', mode: 'logic', x: -50, y: 300 }]).map.nodes.find((n) => n.id === 'ppf').mind.pos;
  ok('moved in Ideas and in Logic: each kept, neither moves the other', J(placed) === J({ i: [100, 40], l: [-50, 300] }));
  const loop = M.applyMapEdits(BASE, [{ op: 'parent', id: 'econ', parent: 'ppf' }]);
  ok('a card put inside one that sits inside it: refused, saying why, nothing changed', !loop.applied.length && /cannot sit inside .*already sits inside it/.test(loop.refused[0]) && J(loop.map.edges) === J(BASE.edges), J(loop.refused));
  const inside = M.applyMapEdits(BASE, [{ op: 'parent', id: 'oc', parent: 'econ' }]).map;
  ok('put inside: one line of structure, from the card to its parent', inside.edges.some((e) => e.kind === 'structure' && e.from === 'oc' && e.to === 'econ') && inside.edges.filter((e) => e.kind === 'structure' && e.from === 'oc').length === 1);
  const moved = M.applyMapEdits(inside, [{ op: 'parent', id: 'oc', parent: 'ppf' }]).map;
  ok('…moved: the old line of structure goes, every line of meaning stays', moved.edges.filter((e) => e.kind === 'structure' && e.from === 'oc').map((e) => e.to).join() === 'ppf' && moved.edges.some((e) => e.from === 'oc' && e.relation === 'supports'));
  const top = M.applyMapEdits(BASE, [{ op: 'parent', id: 'bow', parent: null }]).map;
  ok('put at the top level by hand: no parent is inferred for it any more', top.nodes.find((n) => n.id === 'bow').mind.top === true && M.structureRows(top).find((r) => r.id === 'bow').depth === 0);
  const ord = M.applyMapEdits(BASE, [{ op: 'order', id: 'sc', order: 5 }, { op: 'fold', id: 'econ', folded: true }]).map;
  ok('reordered and folded, on the card', ord.nodes.find((n) => n.id === 'sc').mind.order === 5 && ord.nodes.find((n) => n.id === 'econ').mind.folded === true);
  const ex = M.applyMapEdits(BASE, [{ op: 'explain', from: 'bow', to: 'ppf', was: 'applies_to', why: 'The bow is a property of the frontier.', evidence: ['Fig. 2.3'], status: 'confirmed' }]);
  const line = ex.map.edges.find((e) => e.from === 'bow');
  ok('a line explained and confirmed', line.why === 'The bow is a property of the frontier.' && J(line.evidence) === J(['Fig. 2.3']) && line.status === 'confirmed' && /Confirmed the line/.test(ex.applied[0].said));
  const both = M.applyMapEdits(BASE, [{ op: 'link', from: 'ppf', to: 'econ', relation: 'relates', status: 'confirmed' }]).map;
  const unmeant = M.applyMapEdits(both, [{ op: 'unlink', from: 'ppf', to: 'econ', kind: 'meaning' }]).map;
  ok('a line of meaning taken off leaves the line of structure between the same cards', unmeant.edges.some((e) => e.from === 'ppf' && e.to === 'econ' && e.kind === 'structure') && !unmeant.edges.some((e) => e.from === 'ppf' && e.to === 'econ' && e.kind !== 'structure'));
  ok('a line the person drew is theirs (confirmed)', both.edges.find((e) => e.relation === 'relates' && e.from === 'ppf').status === 'confirmed');
  const added = M.applyMapEdits(BASE, [{ op: 'add', node: { label: 'Comparative advantage', type: 'idea', hand: true, mind: { made: 5, pos: { i: [1, 2] } } }, parent: 'econ' }]).map;
  const ca = added.nodes.find((n) => n.label === 'Comparative advantage');
  ok('added: with what it carries, inside the card chosen', ca.mind.made === 5 && J(ca.mind.pos) === J({ i: [1, 2] }) && added.edges.some((e) => e.from === ca.id && e.to === 'econ' && e.kind === 'structure'));
}

console.log('\n=== structure: deterministic, inferred where not chosen, never a loop ===');
{
  const rows = M.structureRows(BASE);
  ok('the same map, the same structure', J(rows) === J(M.structureRows(BASE)));
  const at = (id) => rows.find((r) => r.id === id);
  ok('the person\'s structure first: the frontier inside Microeconomics', at('ppf').parent === 'econ' && !at('ppf').inferred);
  ok('containment read from the lines, marked inferred: the bow under the frontier, opportunity cost under the bow (it supports it)', at('bow').parent === 'ppf' && at('bow').inferred && at('oc').parent === 'bow' && at('oc').inferred);
  ok('…and nothing written into the map for it', BASE.edges.filter((e) => e.kind === 'structure').length === 1);
  const mutual = M.sanitizeMap({ nodes: [{ id: 'a', type: 'concept', label: 'A' }, { id: 'b', type: 'concept', label: 'B' }], edges: [{ from: 'a', to: 'b', relation: 'part_of' }, { from: 'b', to: 'a', relation: 'part_of' }] });
  const mr = M.structureRows(mutual);
  ok('two cards each "part of" the other: one sits inside, never both (no loop)', mr.length === 2 && mr.filter((r) => r.parent).length === 1, J(mr));
  const folded = M.applyMapEdits(BASE, [{ op: 'fold', id: 'econ', folded: true }]).map;
  const fr = M.structureRows(folded);
  ok('a folded branch: its card says so, everything under it is hidden', fr.find((r) => r.id === 'econ').folded && fr.find((r) => r.id === 'ppf').hidden && fr.find((r) => r.id === 'oc').hidden);
  ok('the would-be loop is seen through every level', M.wouldCycle(BASE, 'econ', 'ppf') && !M.wouldCycle(BASE, 'oc', 'econ') && M.wouldCycle(BASE, 'oc', 'oc'));
  const outline = M.outlineOf(M.applyMapEdits(BASE, [{ op: 'mind', id: 'oc', set: { subtitle: 'A trade-off' } }]).map);
  ok('the outline, indented, with subtitles', /- Microeconomics\n  - Production possibility frontier\n    - The PPF is bowed out\n      - Opportunity cost — A trade-off/.test(outline), outline);
}

console.log('\n=== where things are, in each way of working ===');
{
  const m = M.applyMapEdits(BASE, [{ op: 'place', id: 'oc', mode: 'ideas', x: 10, y: 20 }, { op: 'place', id: 'ppf', mode: 'logic', x: 40, y: 50 }]).map;
  const ip = M.ideasPlaces(m), lp = M.logicPlaces(m);
  ok('Ideas: where the person put a card; the others laid out below it, never on it', ip.get('oc').manual && ip.get('oc').x === 10 && [...ip].filter(([id]) => id !== 'oc').every(([, p]) => !p.manual && p.y > 20));
  ok('Logic: its own placement (not Ideas\')', lp.get('ppf').manual && lp.get('ppf').x === 40 && !lp.get('oc').manual);
  ok('Logic: what is supported sits above what supports it', lp.get('bow').y < lp.get('oc').y, J([lp.get('bow'), lp.get('oc')]));
  ok('nothing laid out twice in the same place', new Set([...ip.values()].map((p) => `${p.x},${p.y}`)).size === m.nodes.length);
}

console.log('\n=== a card, inspected ===');
{
  const c = M.connectionsOf(BASE, 'oc');
  ok('what it connects to, each read from here, with why and status', J(c.map((x) => [x.said, x.other.label, x.status])) === J([['supports', 'The PPF is bowed out', 'read'], ['follows from', 'Scarcity forces choices', 'read']]) && c[0].edge.why.startsWith('Increasing'));
  ok('…and from the other end', M.connectionsOf(BASE, 'bow').some((x) => x.said === 'is supported by' && x.other.id === 'oc'));
  ok('the Logic filters bring forward what they name', M.logicFocus(BASE, 'evidence').edges.size === 1 && M.logicFocus(BASE, 'tensions').edges.size === 0 && M.logicFocus(BASE, 'all') === null);
  ok('a path of reasoning between two cards', J(M.pathBetween(BASE, 'sc', 'ppf')) === J(['sc', 'oc', 'bow', 'ppf']));
  ok('what protects a card from the map pass is what the person wrote, not where they put it', M.authored({ notes: 'x' }) && !M.authored({ pos: { i: [1, 1] } }) && !M.authored(undefined));
}

console.log('\n=== the map pass cannot take away what is theirs ===');
{
  const mine = M.applyMapEdits(BASE, [{ op: 'parent', id: 'oc', parent: 'econ' }, { op: 'explain', from: 'oc', to: 'bow', status: 'confirmed' }]).map;
  const pass = M.sanitizeMap({ nodes: [{ id: 'x1', type: 'concept', label: 'opportunity cost' }, { id: 'ppf', type: 'concept', label: 'Production possibility frontier' }, { id: 'bow', type: 'claim', label: 'The PPF is bowed out' }], edges: [{ from: 'x1', to: 'bow', relation: 'supports' }] });
  const kept = M.keepPlaced(mine, pass);
  ok('a card kept under new words keeps what it carries', kept.nodes.find((n) => n.id === 'x1').mind.notes === 'Review Chapter 2.');
  ok('a line kept by the pass keeps its why and its status', (() => { const e = kept.edges.find((x) => x.from === 'x1' && x.relation === 'supports'); return e.status === 'confirmed' && e.why.startsWith('Increasing'); })());
  ok('a card the person built structure with is put back, and the structure with it (to the card\'s new id)', kept.nodes.some((n) => n.id === 'econ') && kept.edges.some((e) => e.kind === 'structure' && e.from === 'x1' && e.to === 'econ') && kept.edges.some((e) => e.kind === 'structure' && e.from === 'ppf' && e.to === 'econ'), J(kept.edges));
  const authored = M.keepPlaced(BASE, M.sanitizeMap({ nodes: [{ id: 'econ', type: 'concept', label: 'Microeconomics' }], edges: [] }));
  ok('a card the person wrote about, dropped by the pass, is put back', authored.nodes.some((n) => n.id === 'oc'));
  const gone = M.keepPlaced({ ...BASE, removed: [M.keyOf('Opportunity cost')] }, M.sanitizeMap({ nodes: [{ id: 'econ', type: 'concept', label: 'Microeconomics' }], edges: [] }));
  ok('…unless they took it off themselves', !gone.nodes.some((n) => n.id === 'oc'));
}

console.log('\n=== the canvas, addressable; what Socria is told ===');
{
  const art = M.canvasArtifact('map:c1', BASE);
  ok('each card and line has an address on the canvas', art.key === 'map:c1' && art.type === 'map' && art.elements.some((e) => e.id === 'node:oc' && e.label === 'Opportunity cost') && art.elements.filter((e) => e.kind === 'edge').length === 4);
  const ask = M.readVisualAsk('highlight opportunity cost', { artifacts: [art] });
  ok('"highlight opportunity cost" finds the card on the open map', ask?.kind === 'act' && ask.actions[0].targets[0] === 'node:oc', J(ask));
  const line = M.canvasLine(BASE, 'open');
  ok('the open map, as Socria reads it: its cards by exact id, bounded', /^The Mind Map is open \(open\): node:econ “Microeconomics”; node:oc “Opportunity cost”/.test(line) && line.length <= 900);
  const note = M.sanitizeVisNote({ on: line, sel: 'Opportunity cost (node:oc) on “Mind Map”' });
  ok('…carried in the note, cleaned, with how to point at a card', /point at a card with \[its words\]\(vis:focus\/node:…\)/.test(M.visNoteLine(note)) && /They had selected Opportunity cost/.test(M.visNoteLine(note)));
}

console.log('\n=== the canvas, drawn ===');
{
  const draw = (props) => quiet(() => renderToStaticMarkup(h(M.ThinkingCanvas, { map: BASE, onEdits: () => {}, mapKey: 'c1', ...props })));
  const ideas = draw({ initialMode: 'ideas' });
  ok('three ways of working, one chosen, each saying what it is for', /role="tablist" aria-label="Way of working"/.test(ideas) && (ideas.match(/role="tab"/g) || []).length === 3 && /aria-selected="true"[^>]*>[\s\S]*?Ideas/.test(ideas) && /Brainstorm: put ideas anywhere/.test(ideas));
  ok('a card for every card on the map, a button with its name', (ideas.match(/class="tc-card /g) || []).length === BASE.nodes.length && /aria-label="Opportunity cost\. Press to open\."/.test(ideas));
  ok('…its marks: notes', /class="tc-mark is-notes"/.test(ideas));
  ok('add in a keystroke', /placeholder="Add an idea…"/.test(ideas));
  const logic = draw({ initialMode: 'logic' });
  ok('Logic: the lines said in words, and filters to bring tensions, support, assumptions forward', /class="tc-label is-read"[^>]*>supports/.test(logic) && /Tensions/.test(logic) && /Assumptions/.test(logic));
  const structure = draw({ initialMode: 'structure' });
  ok('Structure: an outline, inferred places said as such, each row reorderable and movable by keyboard', /<ol class="tc-outline" aria-label="Structure">/.test(structure) && /from its connections/.test(structure) && /aria-label="Move The PPF is bowed out inside the card above"/.test(structure) && /Tab moves a card inside the one above/.test(structure));
  const ro = draw({ readOnly: true });
  ok('read-only: nothing to add, nothing to connect from', !/tc-add/.test(ro) && !/tc-link-handle/.test(ro));
  const empty = quiet(() => renderToStaticMarkup(h(M.ThinkingCanvas, { map: M.sanitizeMap({ nodes: [], edges: [] }), onEdits: () => {} })));
  ok('an empty map says what to do', /Nothing on the map yet/.test(empty));
  const src = read('components/logos6/ThinkingCanvas.tsx');
  ok('every change is an edit of the one map; no browser dialog', /onEdits\(\[\{ op: 'place'/.test(src) && /op: 'link', from, to: target, relation: 'relates', status: 'confirmed'/.test(src) && !/window\.confirm|window\.alert|window\.prompt/.test(src));
  ok('a card opened shows what Socria read apart from what the person wrote', /Explanation · Socria’s reading of the conversation/.test(src) && /Socria’s interpretation — not yours until you keep it/.test(src));
  ok('a phone keeps the cards legible: the first fit no smaller than 0.7, from the map\'s top left; Fit, pressed, shows all of it', /const least = !all && W < 560 \? 0\.7 : 0\.35;/.test(src) && /onClick=\{\(\) => fit\(true\)\}/.test(src));
  ok('a line with no reason stored says so, whoever drew it; nothing is filled in', /has no explanation stored\. Ask why, or write the reason yourself\./.test(src) && /Socria suggested this line without a reason stored\. Ask why before you confirm it\./.test(src) && /No reason is written for this line yet\./.test(src));
}

console.log('\n=== one entry, the views on the left, the latest marked ===');
{
  const app = read('components/LogosApp.tsx');
  ok('the Mind Map view leads with the canvas; the other drawings a step away, without Graph, Structure, Tensions, Evidence', /const MERGED_LENSES: readonly LensId\[\] = \['graph', 'structure', 'tensions', 'evidence'\];/.test(app) && /<div className="lg-mind-canvas">\{mindCanvas\(drawingsPicker\)\}<\/div>/.test(app) && /hide: MERGED_LENSES/.test(app));
  ok('the Everything view\'s Mind Map entry opens the same canvas, its edits the same map', /mindMap=\{mindCanvas\(/.test(app) && /onEdits=\{\(edits\) => void editMap\(edits\)\}/.test(app));
  ok('the page view\'s switch follows where the views sit (in its bar, never over the page), and can move them', /switchSide=\{navSide\}/.test(app) && /<NavMover side=\{navSide\} onSide=\{setNavSide\} compact \/>/.test(app) && /\{side === 'left' && switcher && <div className="l5v-top-sw">\{switcher\}<\/div>\}/.test(read('components/logos5/L5Views.tsx')));
  const views = read('components/logos5/L5Views.tsx');
  ok('…and the middle when its place is too tight for the switch and 140px of the name, until the bar is wide enough again', /Math\.min\(140, name\.scrollWidth\) - name\.clientWidth/.test(views) && /want !== 'top' && need > 0 && width < need \? 'top' : want/.test(views) && /\.logos-root \.l5 \.l5v-top:is\(\.is-sw-left, \.is-sw-right\):not\(\.is-narrow\) \{ grid-template-columns: minmax\(0, 1fr\) 0 auto; \}/.test(read('components/logos5/l5v.css')));
  ok('the views sit on the left unless moved; a phone keeps them at the top', M.readNavSide() === 'left' && J(M.NAV_SIDES) === J(['left', 'top', 'right']) && /const navSide: NavSide = narrow \? 'top' : navPick;/.test(read('components/logos5/L5Space.tsx')));
  ok('the views are called Mind Map; the Logic Map button is gone where the Mind Map is in the row', /logic_map: 'Mind Map'/.test(read('lib/logos5/views.ts')) && /\{onLogicMap && !mindMap && \(/.test(read('components/logos5/L5Space.tsx')));
  ok('called Mind Map where a person meets it: the board\'s column, the card in Everything, search, Focus, what Socria says on opening it', /<>Mind Map · \{ideaCount\}/.test(read('components/logos5/L5Board.tsx')) && /kicker: `Mind Map · \$\{map\.nodes\.length\}/.test(app) && /node: 'Mind Map'/.test(read('components/logos5/GlobalSearch.tsx')) && /'Show on the Mind Map'/.test(read('components/logos6/Focus.tsx')) && /logic_map: 'the Mind Map'/.test(read('lib/logos5/commands.ts')));
  ok('the most recent conversation: the last touched, a tie to the first', M.latestOf([{ id: 'a', updatedAt: 5 }, { id: 'b', updatedAt: 9 }, { id: 'c', updatedAt: 9 }]) === 'b' && M.latestOf([]) === null && M.latestOf([{ id: 'x' }]) === null);
  ok('…marked quietly in the rail and the map\'s recent list, named for a screen reader', /item\.id === latestId && <span className="s-latest" title="Your most recent conversation" aria-label="most recent" \/>/.test(read('components/LogosRail.tsx')) && /className="l5f-latest"[^>]*aria-label="most recent"/.test(read('components/logos5/MapFind.tsx')));
  ok('the open canvas is told to Socria with the message', /note\.on = canvasLine\(mapRef\.current, 'open'\)/.test(app) && /sanitizeVisNote\(m\.vis\)/.test(read('app/api/conversations/route.ts')));
}

console.log(`\nmind map: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
