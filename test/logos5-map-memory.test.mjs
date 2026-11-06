// LOGOS 5.5 — WHAT SOCRIA REMEMBERS, ON THE UNIVERSAL MAP.
//
// What is held down (lib/logos5/memoryAtlas.ts mapMemoriesOf, lib/logos5/
// bubbles.ts, lib/logos5/arrange.ts, components/logos5/Universe.tsx,
// UniverseBubbles.tsx, UniverseParts.tsx):
//   • a memory's kind and its conversations are read from its record and
//     nothing else: yours only if you said it; a file is never a statement
//     about you; a reading waits for a second conversation; an off-the-record
//     or sensitive conversation contributes nothing; a memory naming no
//     conversation is not on the map;
//   • it hangs beside the conversation it came from, away from that one's
//     spokes; between two sessions of one subject; off the newest quick
//     question when it came from quick questions only; and from two subjects
//     the map already joins, it is that curve's card instead of a mark;
//   • nothing it is drawn on moves, and it touches no disc, no subject's
//     name, no quick question's words, no other memory, and stays in the room
//     the map is fitted to (so never under the page's words at the top or the
//     box at the foot);
//   • Memory is a display preference kept with the arrangement, on by
//     default, kept off when turned off, and not taken back by Undo;
//   • signed out there is no Memory and no key; with Memory off the map is
//     drawn exactly as it was; the conversation's card says what it taught,
//     with That's right and Not quite on a reading still waiting.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as U from './.tmp/logos5-under-test.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-map-memory');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const entry = join(OUT, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(root, 'lib/logos5/bubbles.ts'))};`,
  `export { tilesOf, sharedIdeas } from ${JSON.stringify(join(root, 'lib/logos5/universe.ts'))};`,
  `export { homesOf } from ${JSON.stringify(join(root, 'lib/logos5/spatial.ts'))};`,
  `export * as A from ${JSON.stringify(join(root, 'lib/logos5/arrange.ts'))};`,
  `export { mapMemoriesOf, mapProvenance } from ${JSON.stringify(join(root, 'lib/logos5/memoryAtlas.ts'))};`,
].join('\n'));
await build({ entryPoints: { mm: entry }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const B = await import(pathToFileURL(join(OUT, 'mm.mjs')).href);
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const none = () => {};

const NOW = new Date(2026, 10, 6, 15, 0).getTime(); // a Friday afternoon, local time
const H = 3_600_000;
const D = 24 * H;

// ── the conversations: a week of them, in four subjects ──
const conv = (id, title, o) => {
  const turns = o.turns ?? 1;
  const last = NOW - o.ago;
  const began = NOW - (o.began ?? o.ago);
  const step = turns > 1 ? (last - began) / (turns - 1) : 0;
  return {
    id,
    title,
    updatedAt: last,
    projectId: o.project ?? null,
    messages: Array.from({ length: turns }).flatMap((_, i) => [
      { role: 'user', content: i ? o.then ?? 'And then?' : o.first ?? title, at: began + i * step - 60_000 },
      { role: 'assistant', content: i === turns - 1 && o.ask ? `Here it stands. ${o.ask}` : 'Here it stands.', at: began + i * step },
    ]),
    map: { nodes: (o.ideas ?? []).map((label, i) => ({ id: `${id}-${i}`, label })), edges: (o.ideas ?? []).slice(1).map((_, i) => ({ from: `${id}-0`, to: `${id}-${i + 1}` })), ...(o.domain ? { ask: { domain: o.domain } } : {}) },
  };
};
const CONVS = [
  conv('berlin', 'The Berlin offer', { ago: 2 * H, began: 4 * D, turns: 5, domain: 'career', ideas: ['Being stretched', 'Higher salary', 'Smaller team', 'Relocation', 'Visa', 'A year unchallenged', 'Growth', 'Pay', 'Deadline'], ask: 'Would you leave if the pay were equal?' }),
  conv('salary', 'Salary, round two', { ago: 3 * D, turns: 3, domain: 'career', ideas: ['Counter-offer', 'Salary band'] }),
  conv('visa', 'German work visa timing', { ago: 1.5 * D, domain: 'career' }),
  conv('eur', '72,000 EUR in USD', { ago: 2.2 * D, domain: 'career' }),
  conv('tax', 'Tax incidence', { ago: 4 * D + 2 * H, turns: 4, project: 'econ', ideas: ['Tax incidence', 'Elasticity', 'Deadweight loss', 'Supply', 'Demand', 'Burden', 'Wedge', 'Surplus'] }),
  conv('midterm', 'Midterm review', { ago: 1.2 * D, turns: 3, project: 'econ', ideas: ['Elasticity', 'Midterm'] }),
  conv('dwl', 'Deadweight loss', { ago: 3.5 * D, project: 'econ' }),
  conv('essay', 'Why the essay stalls', { ago: 1 * D, turns: 6, domain: 'writing', ideas: ['Being stretched', 'The argument', 'Thesis statement', 'Paragraph two', 'Evidence', 'Voice', 'Outline', 'Draft', 'Counter-argument', 'Conclusion', 'Reader', 'Structure', 'Claim', 'Revision'] }),
  conv('quad', 'x² − 5x + 6', { ago: 3 * D, turns: 3, domain: 'maths', ideas: ['Factoring', 'Roots'] }),
  // said off the record: it contributes nothing to the map
  conv('quiet', 'Something between us', { ago: 2.5 * D, turns: 3, domain: 'career', first: 'This is off the record, but I am thinking of leaving.', ideas: ['Leaving'] }),
];
const PROJECTS = [{ id: 'econ', name: 'ECON 2301', color: 'slate', createdAt: 1 }];

// ── what the store holds: rows as /api/mind?scope=logos gives them ──
const p = (kind, surface, conversationId, ago, extra = {}) => ({ kind, surface, at: NOW - ago * D, ...(conversationId ? { conversationId } : {}), ...extra });
const node = (id, type, label, provenance, o = {}) => ({ id, type, label, content: `${label}.`, status: o.status ?? 'active', importance: o.importance ?? 0.6, seen: provenance.length, createdAt: provenance[0].at, updatedAt: provenance[provenance.length - 1].at, provenance });
const NODES = [
  node('m_friday', 'Decision', 'Decide by Friday', [p('stated', 'logos', 'berlin', 3)], { importance: 0.8 }),
  node('m_stretch', 'Goal', 'Work that stretches me', [p('stated', 'logos', 'berlin', 3.5), p('stated', 'logos', 'essay', 1)], { importance: 0.9 }),
  node('m_growth', 'Belief', 'Weighs growth over pay', [p('tentative', 'logos', 'berlin', 0.1)], { status: 'tentative' }),
  node('m_short', 'Preference', 'Short, direct answers', [p('inferred', 'logos', 'eur', 2.2), p('inferred', 'logos', 'visa', 1.5)], { status: 'tentative', importance: 0.5 }),
  node('m_writing', 'Pattern', 'Thinks best by writing', [p('tentative', 'logos', 'essay', 1)], { status: 'tentative', importance: 0.5 }),
  node('m_mid', 'Event', 'Midterm on the 14th', [p('stated', 'file', null, 6, { sourceNodeId: 'm_src' }), p('inferred', 'logos', 'midterm', 1.2)], { importance: 0.7 }),
  node('m_src', 'Source', 'ECON 2301 syllabus.txt', [p('stated', 'file', null, 6)], { importance: 0.3 }),
  node('m_found', 'Concept', 'Tax burden falls on the less elastic side', [p('researched', 'logos', 'tax', 4)]),
  node('m_both', 'Concept', 'Elasticity decides who pays', [p('stated', 'logos', 'tax', 4), p('stated', 'logos', 'midterm', 1.2)], { importance: 0.4 }),
  node('m_leaving', 'Plan', 'Leave within the year', [p('stated', 'logos', 'quiet', 2.5)], { importance: 0.95 }),
];

console.log('\n=== what each memory is, read from its record ===');
{
  const M = B.mapMemoriesOf(NODES, NOW);
  const by = new Map(M.map((m) => [m.id, m]));
  const words = by.get('m_friday');
  ok('said in their own words in a conversation: in your words, from it', words.source === 'words' && J(words.from) === J(['berlin']) && J(words.saidIn) === J(['berlin']) && !words.waiting && !words.confirmed);
  ok('  said in two: both named, in the order they were said', J(by.get('m_stretch').from) === J(['berlin', 'essay']) && J(by.get('m_stretch').saidIn) === J(['berlin', 'essay']));
  const file = by.get('m_mid');
  ok('read from a file and come up in a conversation: from your file — never in your words — with the file’s name', file.source === 'file' && file.fileName === 'ECON 2301 syllabus.txt' && J(file.from) === J(['midterm']) && !file.saidIn.length);
  ok('  the file itself, and anything read from a file in no conversation, is not on the map: it names no conversation', !by.has('m_src') && !B.mapMemoriesOf([node('f', 'Event', 'Exam in May', [p('stated', 'file', null, 2, { sourceNodeId: 'm_src' })])], NOW).length);
  ok('a reading held lightly in one conversation waits for a second', by.get('m_growth').source === 'reading' && by.get('m_growth').waiting && by.get('m_writing').waiting);
  ok('  seen in two conversations, it does not', by.get('m_short').source === 'reading' && !by.get('m_short').waiting && J(by.get('m_short').from) === J(['eur', 'visa']));
  const gated = B.mapMemoriesOf([node('g', 'Belief', 'Avoids conflict', [p('inferred', 'logos', 'berlin', 1)], { status: 'tentative' })], NOW)[0];
  ok('  a claim about them Socria inferred is only ever a memory once a second conversation saw it (the gate): seen twice, though its record names one', gated.source === 'reading' && !gated.waiting && J(gated.from) === J(['berlin']));
  const event = B.mapMemoriesOf([node('e', 'Event', 'Visa interview on Monday', [p('inferred', 'logos', 'visa', 1)], { status: 'tentative' })], NOW)[0];
  ok('  a reading of what happened, seen once, waits', event.source === 'reading' && event.waiting);
  const confirmed = B.mapMemoriesOf([node('c', 'Belief', 'Weighs growth over pay', [p('tentative', 'logos', 'berlin', 1), { kind: 'stated', surface: 'user', at: NOW, note: 'confirmed by you', review: 'confirmed' }])], NOW)[0];
  ok('That’s right pressed: confirmed, no longer waiting — and still a reading, not called their words', confirmed.confirmed && !confirmed.waiting && confirmed.source === 'reading');
  const edited = B.mapMemoriesOf([node('x', 'Belief', 'Grows before it earns', [p('tentative', 'logos', 'berlin', 1), { kind: 'stated', surface: 'user', at: NOW, note: 'edited by hand' }])], NOW)[0];
  ok('put in their own words (Not quite, or Edit): in your words from then on', edited.source === 'words' && !edited.waiting);
  ok('found in a source, an earlier position, one in dispute, the store’s own bookkeeping: not on the map', !by.has('m_found') && !B.mapMemoriesOf([node('s', 'Plan', 'Move to Berlin', [p('stated', 'logos', 'berlin', 3)], { status: 'superseded' }), node('t', 'Belief', 'Hates meetings', [p('inferred', 'logos', 'berlin', 3), p('inferred', 'logos', 'essay', 1), { kind: 'stated', surface: 'user', at: NOW, note: 'only long ones' }], { status: 'contradicted' }), node('k', 'Conversation', 'A chat', [p('stated', 'logos', 'berlin', 3)])], NOW).length);
  const quiet = B.mapMemoriesOf(NODES, NOW, { quiet: new Set(['quiet', 'essay']) });
  const qb = new Map(quiet.map((m) => [m.id, m]));
  ok('a conversation off the record contributes nothing: a memory only from it is gone, and one also from it no longer names it', !qb.has('m_leaving') && J(qb.get('m_stretch').from) === J(['berlin']) && !qb.has('m_writing'));
  ok('the most important first, as the Memory view orders them', M[0].prio >= M[M.length - 1].prio && M.every((m, i) => i === 0 || M[i - 1].prio >= m.prio));
  const title = (id) => ({ berlin: 'The Berlin offer', essay: 'Why the essay stalls', visa: 'German work visa timing', eur: '72,000 EUR in USD', midterm: 'Midterm review' })[id] ?? null;
  ok('how each is known, said under it on a card', B.mapProvenance(words, 'berlin', title) === 'in your words' && B.mapProvenance(by.get('m_stretch'), 'berlin', title) === 'in your words · also in Why the essay stalls' && B.mapProvenance(file, 'midterm', title) === 'from your file · ECON 2301 syllabus.txt' && B.mapProvenance(by.get('m_growth'), 'berlin', title) === 'Socria’s reading · waiting for a second chat' && B.mapProvenance(confirmed, 'berlin', title) === 'Socria’s reading · you said it’s right' && B.mapProvenance(by.get('m_short'), 'visa', title) === 'Socria’s reading · also in 72,000 EUR in USD' && B.mapProvenance(gated, 'berlin', title) === 'Socria’s reading · seen in a second chat');
  const saidElsewhere = B.mapMemoriesOf([node('y', 'Goal', 'Work that stretches me', [p('stated', 'logos', 'berlin', 2), p('inferred', 'logos', 'essay', 1)])], NOW)[0];
  ok('  said in one and come up in another: on the other’s card it says where it was said', B.mapProvenance(saidElsewhere, 'essay', title) === 'in your words, in The Berlin offer');
}

// ── the map ──
const tiles = B.tilesOf(CONVS);
const homes = B.homesOf(tiles, PROJECTS, B.A.emptyArrangement());
const week = tiles.filter((t) => t.id !== 'quiet');
const memIn = (list) => list.map((m) => ({ id: m.id, text: m.text, from: m.from }));
const QUIET = new Set(['quiet']);
const MEMS = B.mapMemoriesOf(NODES, NOW, { quiet: QUIET });
const layoutOf = (o = {}) => B.bubbleLayout({ lens: 'week', tiles: o.tiles ?? week, all: tiles, homes, ideas: B.sharedIdeas(o.tiles ?? week), links: o.links ?? [], now: NOW, narrow: !!o.narrow, resumeId: 'berlin', ...(o.memories ? { memories: o.memories } : {}) });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const overlap = (a, b, air = 0) => a.x < b.x + b.w + air && b.x < a.x + a.w + air && a.y < b.y + b.h + air && b.y < a.y + a.h + air;
const nearBox = (c, r, b) => Math.hypot(c.x - Math.max(b.x, Math.min(c.x, b.x + b.w)), c.y - Math.max(b.y, Math.min(c.y, b.y + b.h))) < r;
const room = (hb) => hb.r + (hb.halo ? B.HALO : 0);
const apart = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const deg = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const toSeg = (c, a, b) => {
  const vx = b.x - a.x, vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * vx + (c.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(c.x - (a.x + t * vx), c.y - (a.y + t * vy));
};

console.log('\n=== where each hangs ===');
{
  const off = layoutOf();
  const L = layoutOf({ memories: memIn(MEMS) });
  const at = new Map(L.memories.map((m) => [m.id, m]));
  const disc = (id) => L.hubs.find((x) => x.id === id);
  ok('with Memory off nothing of it is there, and an empty list changes nothing', off.memories.length === 0 && J(layoutOf({ memories: [] })) === J(off));
  ok('with Memory on, nothing already drawn moves: the discs, the quick questions, the subjects, the joins and spokes', J(L.hubs) === J(off.hubs) && J(L.dots) === J(off.dots) && J(L.clusters) === J(off.clusters) && J(L.joins) === J(off.joins) && J(L.spokes) === J(off.spokes));
  const friday = at.get('m_friday');
  const berlin = disc('berlin');
  ok('from one conversation: beside its disc, tethered to it', !!friday && J(friday.from) === J(['berlin']) && dist(friday, berlin) - room(berlin) < 110, J(friday));
  const ways = [...L.spokes.filter(([d, hb]) => hb === 'berlin').map(([d]) => deg(berlin, L.byId.get(d))), ...L.joins.filter(([a, b]) => a === 'berlin' || b === 'berlin').map(([a, b]) => deg(berlin, L.byId.get(a === 'berlin' ? b : a))), ...L.links.filter((l) => l.a === 'berlin' || l.b === 'berlin').map((l) => deg(berlin, l.c))];
  ok('  on the side away from its spokes, its joins and the curve that leaves it', ways.length >= 2 && ways.every((w) => apart(deg(berlin, friday), w) >= 35), J({ friday: deg(berlin, friday), ways }));
  ok('  its mark at the end of its words nearest the disc', friday.end === (friday.x < berlin.x - 20 ? 'end' : 'start') && (friday.end === 'end' ? friday.box.x + friday.box.w > friday.x : friday.box.x < friday.x));
  const both = at.get('m_both');
  const tax = disc('tax'), mid = disc('midterm');
  ok('from two sessions of one subject: between them, tethered to both', !!both && J([...both.from].sort()) === J(['midterm', 'tax']) && dist(both, { x: (tax.x + mid.x) / 2, y: (tax.y + mid.y) / 2 }) < dist(tax, mid), J(both));
  ok('from two subjects the map already joins: no mark — said on that curve’s card instead', !at.has('m_stretch') && L.card?.memory === 'm_stretch' && L.links.some((l) => l.key === L.card.link && l.kind === 'idea'));
  ok('  the card is where the computed one would be, as wide', L.card.x === off.card.x && L.card.w === off.card.w);
  const short = at.get('m_short');
  ok('from quick questions only: off the newest of them', !!short && J(short.from) === J(['visa']));
  ok('from a file, come up in a session: beside that session', J(at.get('m_mid')?.from) === J(['midterm']));
  ok('a reading still waiting is drawn too', at.has('m_growth') && at.has('m_writing'));
  ok('one off the record is nowhere on the map', !at.has('m_leaving') && !L.byId.has('quiet'));
  const apartL = layoutOf({ memories: [{ id: 'm_apart', text: 'Learns from worked examples', from: ['quad', 'tax'] }] });
  ok('from two subjects the map does not join: beside the newer of its sessions', J(apartL.memories[0]?.from) === J(['quad']) && !apartL.card?.memory);
  ok('words too long for the map are cut at a word, the whole kept for its title', B.memoryWords('Wants a job that stretches them more than the last one did') === 'Wants a job that stretches them…');
  ok('the same memories hang in the same places every time', J(layoutOf({ memories: memIn(MEMS) }).memories) === J(L.memories));
}

console.log('\n=== it sits on nothing ===');
for (const [name, o] of [['this week', {}], ['this week, on a phone', { narrow: true }], ['with a link of their own', { links: [{ id: 'l1', a: 'berlin', b: 'quad', label: 'deadline' }] }]]) {
  const L = layoutOf({ ...o, memories: memIn(MEMS) });
  const off = layoutOf(o);
  const chips = L.memories.map((m) => m.box);
  ok(`${name}: some are drawn`, L.memories.length >= 4, J(L.memories.map((m) => m.id)));
  ok(`${name}: no memory on a disc or a dot`, chips.every((b) => L.hubs.every((hb) => !nearBox(hb, room(hb), b)) && L.dots.every((d) => !nearBox(d, d.r, b))));
  ok(`${name}: none on a subject’s name, a quick question’s words, a card, or another memory`, chips.every((b, i) => L.clusters.every((c) => !overlap(c.label, b)) && L.dots.filter((d) => d.named).every((d) => !overlap(d.label, b)) && (!L.card || !overlap(L.card, b)) && chips.every((c, j) => j === i || !overlap(c, b))));
  ok(`${name}: each tether crosses no other disc`, L.memories.every((m) => m.from.every((f) => { const a = L.byId.get(f); return L.hubs.every((hb) => hb.id === f || toSeg(hb, a, m) >= room(hb)); })));
  ok(`${name}: all of it in the room the map is fitted to — under neither the page’s words nor the box at the foot`, chips.every((b) => b.x >= L.bounds.x && b.y >= L.bounds.y && b.x + b.w <= L.bounds.x + L.bounds.w && b.y + b.h <= L.bounds.y + L.bounds.h));
  const outside = L.memories.filter((m) => !(m.box.x >= off.bounds.x && m.box.y >= off.bounds.y && m.box.x + m.box.w <= off.bounds.x + off.bounds.w && m.box.y + m.box.h <= off.bounds.y + off.bounds.h));
  if (!o.narrow) ok(`${name}: and that room is the one the map had without it: it is fitted to the screen as before`, !outside.length, J({ outside, bounds: off.bounds }));
  // a phone's map is one subject under another, as narrow as its circles: a memory may have to stand out to the side of them
  else ok(`${name}: a little wider at most, by no more than a memory’s words`, L.bounds.w - off.bounds.w <= Math.max(...chips.map((b) => b.w)) && L.bounds.h === off.bounds.h, J({ grew: L.bounds.w - off.bounds.w }));
}

console.log('\n=== kept with the arrangement ===');
{
  const E = B.A.emptyArrangement();
  ok('on by default', E.display.memory === true && B.A.DEFAULT_DISPLAY.memory === true);
  ok('turned off, it stays off — kept, and read back', B.A.parseArrangement(JSON.parse(J(B.A.setDisplay(E, { memory: false })))).display.memory === false);
  ok('an arrangement from before it existed, or a damaged one, reads as on', B.A.parseArrangement({ display: { chats: false } }).display.memory === true && B.A.parseArrangement({ display: { memory: 'yes' } }).display.memory === true);
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  B.A.writeHome(storage, B.A.setDisplay(E, { memory: false }));
  ok('  and in this browser’s copy', B.A.readHome(storage).display.memory === false);
  const saved = B.A.saveView(B.A.setDisplay(E, { labels: 'titles' }), 'v1', 'Mine', '');
  ok('a saved view put back leaves Memory as it is', B.A.applyView(B.A.setDisplay(saved, { memory: false }), 'v1').display.memory === false && B.A.applyView(saved, 'v1').display.labels === 'titles');
  const src = read('components/logos5/Universe.tsx');
  ok('the key changes it as a preference — not among what Undo takes back', /prefer\(\(a\) => A\.setDisplay\(a, \{ memory: !a\.display\.memory \}\)\)/.test(src) && !/commit\(\(a\) => A\.setDisplay\(a, \{ memory/.test(src));
}

console.log('\n=== the map, drawn ===');
{
  const head = (center, count) => h('header', { className: 'test-head' }, `COUNT:${count}`, center);
  const week0 = { ...U.emptyArrangement(), mode: 'week', seen: { hint: true } };
  const base = { conversations: CONVS, projects: PROJECTS, activeId: null, onOpen: none, onStart: none, head, now: NOW };
  const world = (s) => s.slice(s.indexOf('class="l5h-world"'), s.indexOf('class="l5h-zoom"'));
  const out = html(h(U.UniverseView, { ...base, initial: week0 }));
  ok('signed out there is no Memory: no key, no marks, no legend', !out.includes('l5h-tool is-mem') && !out.includes('l5b-mem') && !out.includes('l5h-legend') && !out.includes('l5b-tether'));
  const on = html(h(U.UniverseView, { ...base, initial: week0, signedIn: true, memory: NODES }));
  ok('signed in: a Memory key among the tools, between the subjects and View, pressed, with how many readings wait', /l5h-tool is-mem is-on" aria-pressed="true"/.test(on) && on.indexOf('All subjects') < on.indexOf('l5h-tool is-mem') && on.indexOf('l5h-tool is-mem') < on.indexOf('l5h-viewbtn"') && /class="l5h-mem-n"[^>]*>2</.test(on), on.match(/l5h-tool is-mem[^]*?<\/button>/)?.[0]);
  ok('  each memory on the map: its mark and its words, how it is known in its class', /class="l5b-mem is-words[^"]*"[^>]*>[^]*?Decide by Friday/.test(on) && /class="l5b-mem is-reading is-waiting/.test(on) && /class="l5b-mem is-file/.test(on) && /class="l5b-mem is-reading[^"]*"[^>]*title="Short, direct answers/.test(on));
  ok('  every one names the conversation it came from', (on.match(/aria-label="What Socria remembers: [^"]*From “[^"]+”/g) ?? []).length === (on.match(/class="l5b-mem /g) ?? []).length && (on.match(/class="l5b-mem /g) ?? []).length >= 4);
  ok('  tethered to it, dotted; a reading still waiting in gold', /class="l5b-tether is-waiting"/.test(on) && /class="l5b-tether"/.test(on));
  ok('  what joins two subjects is said by the memory from both, with Edit and Forget', /class="l5b-card is-memory"[^]*Socria remembers · <span class="l5b-card-kk">in your words<\/span>[^]*Work that stretches me\.[^]*You said it in <em>The Berlin offer<\/em> and again in <em>Why the essay stalls<\/em>\.[^]*>Edit<[^]*>Forget</.test(on));
  ok('  the legend says what the mark is', /class="l5h-legend"[^]*class="l5h-lg-mem"[^]*what Socria remembers/.test(on));
  ok('  nothing from the conversation said off the record', !on.includes('Leave within the year'));
  const offArr = { ...week0, display: { ...week0.display, memory: false } };
  const off = html(h(U.UniverseView, { ...base, initial: offArr, signedIn: true, memory: NODES }));
  ok('Memory off: the key is there, not pressed; nothing of it is drawn', /l5h-tool is-mem" aria-pressed="false"/.test(off) && !off.includes('l5b-mem') && !off.includes('l5h-legend') && !off.includes('l5h-mem-n'));
  ok('  and the map is drawn exactly as it is signed out', world(off) === world(out) && world(out).length > 1000);
  const today = html(h(U.UniverseView, { ...base, initial: { ...week0, mode: 'all' }, signedIn: true, memory: NODES }));
  ok('on the line through time there is no layer to show, so no key', !today.includes('l5h-tool is-mem'));
}

console.log('\n=== what a conversation taught Socria, on its card ===');
{
  const tile = B.tilesOf([CONVS[0]])[0];
  const acts = { onOpen: none, onStar: none, onHide: none, onClose: none };
  const taught = {
    list: [
      { id: 'a', text: 'Decide by Friday', source: 'words', waiting: false, confirmed: false, said: 'in your words' },
      { id: 'b', text: 'Work that stretches me', source: 'words', waiting: false, confirmed: false, said: 'in your words · also in Why the essay stalls' },
      { id: 'c', text: 'Weighs growth over pay', source: 'reading', waiting: true, confirmed: false, said: 'Socria’s reading · waiting for a second chat' },
    ],
    onConfirm: none,
    onCorrect: none,
  };
  const card = html(h(U.PreviewCard, { tile, home: null, starred: false, pinned: false, projects: [], links: [], acts, taught }));
  ok('under what Socria asked: “What it taught Socria · 3”', card.indexOf('Socria asked') < card.indexOf('What it taught Socria · 3') && card.includes('What it taught Socria · 3'));
  ok('  each with its mark, its words and how it is known', /l5h-pv-mem-row is-words[^]*Decide by Friday[^]*in your words/.test(card) && card.includes('in your words · also in Why the essay stalls') && /l5h-pv-mem-row is-reading is-waiting[^]*Socria’s reading · waiting for a second chat/.test(card));
  ok('  a reading still waiting: That’s right, and Not quite — and only there', (card.match(/That’s right/g) ?? []).length === 1 && (card.match(/Not quite/g) ?? []).length === 1 && card.indexOf('Weighs growth over pay') < card.indexOf('That’s right'));
  const nothing = html(h(U.PreviewCard, { tile, home: null, starred: false, pinned: false, projects: [], links: [], acts }));
  ok('a conversation that taught nothing (or was off the record) has no such section', !nothing.includes('What it taught Socria'));
  const many = html(h(U.PreviewCard, { tile, home: null, starred: false, pinned: false, projects: [], links: [], acts, taught: { ...taught, list: Array.from({ length: 8 }, (_, i) => ({ ...taught.list[0], id: `x${i}` })), onMore: none } }));
  ok('  many: the first five, and the rest in Memory', (many.match(/l5h-pv-mem-row /g) ?? []).length === 5 && many.includes('3 more in Memory'));
  const src = read('components/logos5/Universe.tsx');
  ok('That’s right and Not quite are the Memory view’s own writes: confirm, and their words (PATCH /api/mind/node)', /\{ confirm: true \}/.test(src) && /\{ label: text\.slice\(0, 80\) \}/.test(src) && src.includes("fetch('/api/mind/node'") && src.includes("fetch('/api/mind?scope=logos'"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
