// LOGOS 5 — MEMORY: WHAT SOCRIA REMEMBERS, AS AN ATLAS OF A MIND.
//
// What is held down (lib/logos5/memoryAtlas.ts, components/logos5/MemoryView.tsx):
//   • every kind of memory the store keeps has a region; bookkeeping has none;
//   • a memory's state is read from the store and its change record, never
//     invented — proposed, updated this week, a contradiction, older, important;
//   • the atlas is the same on every visit: homes never move, the drawing is
//     deterministic, and adding a memory moves only its own region, a little;
//   • words never overlap one another, a cell, or the edge of the drawing;
//   • an open region shows its own memories and, at the edges, only those
//     elsewhere that connect to it;
//   • on a phone the regions are named inside their lobes and joined by tracts;
//   • the view reads memory only through the private-filtered feeds, and writes
//     only through the store's own routes.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from './.tmp/memoryAtlas.mjs';
import * as U from './.tmp/logos5-under-test.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));

const NOW = Date.UTC(2026, 9, 22);
const D = 86_400_000;
const TYPES = ['Belief', 'Goal', 'Project', 'Concept', 'Person', 'Preference', 'Event', 'Question', 'Decision', 'Plan', 'Insight', 'Source', 'Place', 'Organization', 'Uncertainty', 'Evidence'];
const node = (i, extra = {}) => ({
  id: `m${String(i).padStart(3, '0')}`,
  type: TYPES[i % TYPES.length],
  label: `Memory number ${i} about something`,
  content: `What memory ${i} says, in a sentence.`,
  status: 'active',
  importance: ((i * 37) % 100) / 100,
  seen: 1 + (i % 4),
  createdAt: NOW - (40 + i) * D,
  updatedAt: NOW - (30 + i) * D,
  provenance: [{ kind: 'stated', surface: i % 2 ? 'logos' : 'core', at: NOW - (40 + i) * D, conversationId: `c${i % 5}` }],
  ...extra,
});
const NODES = Array.from({ length: 48 }, (_, i) => node(i));
const EDGES = [];
for (let i = 0; i < 48; i += 3) EDGES.push({ id: `e${i}`, sourceId: NODES[i].id, targetId: NODES[(i + 5) % 48].id, relationship: ['supports', 'part_of', 'depends_on', 'motivated_by'][i % 4] });
for (let i = 1; i < 48; i += 7) EDGES.push({ id: `f${i}`, sourceId: NODES[i].id, targetId: NODES[(i + 16) % 48].id, relationship: 'relevant_to' });

console.log('=== regions ===');
{
  ok('beliefs, insights, assumptions, values: Identity', ['Belief', 'Insight', 'Assumption', 'value', 'Trait'].every((t) => A.regionOf(t) === 'identity'));
  ok('goals and plans: Goals', ['Goal', 'Plan'].every((t) => A.regionOf(t) === 'goals'));
  ok('projects, organisations, decisions, evidence: Projects & Work', ['Project', 'Organization', 'Decision', 'Evidence'].every((t) => A.regionOf(t) === 'work'));
  ok('concepts and sources: Learning', ['Concept', 'Source'].every((t) => A.regionOf(t) === 'learning'));
  ok('people: People & Relationships', A.regionOf('Person') === 'people');
  ok('preferences: Preferences', A.regionOf('Preference') === 'prefs');
  ok('events, experiences, places: Recent Context', ['Event', 'Experience', 'Place'].every((t) => A.regionOf(t) === 'recent'));
  ok('questions and uncertainties: Open Questions', ['Question', 'Uncertainty'].every((t) => A.regionOf(t) === 'questions'));
  ok('the store’s bookkeeping is no memory', A.regionOf('Conversation') === null && A.regionOf('conversation') === null);
  ok('a kind nobody listed is a claim about the person, as the store treats it', A.regionOf('Zeitgeist') === 'identity');
  ok('eight regions, named in words', A.REGIONS.length === 8 && A.REGIONS.every((r) => r.name && r.short && r.hint));
}

console.log('\n=== states, read from the record ===');
{
  const nodes = [
    node(1, { id: 'old', type: 'Plan', label: 'Move to Berlin', status: 'superseded' }),
    node(2, { id: 'new', type: 'Plan', label: 'Move to Lisbon', importance: 0.9, updatedAt: NOW - 2 * D }),
    node(3, { id: 'morning', type: 'Preference', label: 'Works best in the morning' }),
    node(4, { id: 'night', type: 'Preference', label: 'Best work late at night' }),
    node(5, { id: 'try', type: 'Belief', label: 'Stability over upside', status: 'tentative' }),
    node(6, { id: 'wrong', type: 'Belief', label: 'Hates meetings', status: 'contradicted', provenance: [{ kind: 'inferred', surface: 'core', at: NOW - 9 * D }, { kind: 'stated', surface: 'user', at: NOW - 8 * D, note: 'I only hate long ones' }] }),
    node(7, { id: 'chat', type: 'Conversation', label: 'A chat' }),
    node(8, { id: 'blank', label: '   ' }),
    node(9, { id: 'plain', type: 'Person', label: 'Sam', importance: 0.5, updatedAt: NOW - 20 * D }),
  ];
  const edges = [
    { id: 'x1', sourceId: 'old', targetId: 'new', relationship: 'superseded_by', provenance: [{ kind: 'stated', review: 'proposed', note: 'changed from: Berlin' }] },
    { id: 'x2', sourceId: 'morning', targetId: 'night', relationship: 'contradicts', provenance: [{ kind: 'inferred', review: 'proposed', note: 'possible contradiction: “a” and “b”' }] },
  ];
  const changes = [{ id: 'e:x1', kind: 'superseded', review: 'proposed', at: NOW - D, from: { id: 'old', type: 'Plan', label: 'Move to Berlin', content: '', status: 'superseded' }, to: { id: 'new', type: 'Plan', label: 'Move to Lisbon', content: '', status: 'active' }, affected: [], canForget: true }];
  const ms = A.memoriesOf(nodes, edges, changes, NOW);
  const by = Object.fromEntries(ms.map((m) => [m.id, m]));
  ok('bookkeeping and nameless entries are left out', !by.chat && !by.blank && ms.length === 7);
  ok('a change waiting for them draws its new claim dashed', by.new.state.proposed && !by.old.state.proposed);
  ok('  and the earlier position faded', by.old.state.faded && !by.new.state.faded);
  ok('a claim held tentatively is dashed too', by.try.state.proposed);
  ok('updated in the last week: the soft ring', by.new.state.recent && !by.plain.state.recent);
  ok('a possible contradiction marks both sides', by.morning.state.warn === 'possible' && by.night.state.warn === 'possible');
  ok('something they said is not right is marked as theirs', by.wrong.state.warn === 'challenged');
  ok('important is importance at 0.8 or more', by.new.state.pinned && !by.plain.state.pinned);
  ok('what needs them comes first', ms.indexOf(by.new) < ms.indexOf(by.plain) && ms.indexOf(by.morning) < ms.indexOf(by.plain));
  const words = A.stateWords(by.new, NOW);
  ok('every state is said in words too', words.includes('Proposed change') && words.includes('Updated 2 days ago') && words.includes('Important'), words.join('|'));
  // "Confirmed" only for what they confirmed (test/mind-ground.test.mjs): this one they said
  ok('  a memory with nothing pending says how it stands — in their words, not "Confirmed"', A.stateWords(by.plain, NOW)[0] === 'In your words', A.stateWords(by.plain, NOW).join('|'));
  ok('  an earlier position says so', A.stateWords(by.old, NOW).includes('An earlier position'));
  ok('  and a tension is never only a colour', A.stateWords(by.morning, NOW).includes('Possible contradiction'));
  ok('how it is known comes from its first ground', A.knownBy(by.wrong) === 'Socria noticed it' && A.knownBy(by.plain) === 'You said it');
  ok('the filters: waiting, this week, important', A.passes(by.new, 'waiting', '') && !A.passes(by.plain, 'waiting', '') && A.passes(by.new, 'week', '') && !A.passes(by.plain, 'important', ''));
  ok('a search reads the name, the words and the kind', A.passes(by.plain, 'all', 'sam') && A.passes(by.plain, 'all', 'person') && !A.passes(by.plain, 'all', 'lisbon'));
  ok('relationships read as words, both ways round', A.relWord('constrained_by') === 'constrained by' && A.relWord('constrained_by', false) === 'constrains' && A.relWord('superseded_by') === 'replaced by' && A.relWord('made_up_rel') === 'made up rel');
  ok('nothing here is a confidence score', !/confidence/.test(read('lib/logos5/memoryAtlas.ts').replace(/\/\/.*$/gm, '')));
}

const MEM = A.memoriesOf(NODES, EDGES, [], NOW);
const BY = new Map(MEM.map((m) => [m.id, m]));

console.log('\n=== the atlas holds still ===');
{
  const a = A.atlasHomes({ identity: 1 }), b = A.atlasHomes({ identity: 9, goals: 7, work: 3 });
  ok('every region has a home, the same whatever it holds', A.REGIONS.every((r) => a[r.id].cx === b[r.id].cx && a[r.id].cy === b[r.id].cy));
  ok('  only its size follows what it holds, to a limit', b.identity.R > a.identity.R && A.atlasHomes({ identity: 400 }).identity.R === b.identity.R);
  ok('Identity in the middle, the others around it', a.identity.centre && A.RING.length === 7 && A.RING.every((id) => Math.hypot(a[id].cx - a.identity.cx, a[id].cy - a.identity.cy) > 200));
  const s1 = A.overviewScene(MEM, EDGES), s2 = A.overviewScene(MEM, EDGES);
  ok('the same memories, the same drawing', JSON.stringify(s1) === JSON.stringify(s2));
  ok('every memory drawn inside the drawing', s1.cells.every((c) => c.x - c.r > 0 && c.x + c.r < s1.w && c.y - c.r > 0 && c.y + c.r < s1.h));
  ok('every relationship drawn is one the store holds', s1.fibres.every((fb) => EDGES.some((e) => e.id === fb.id && e.sourceId === fb.a && e.targetId === fb.b)));
  ok('  between regions they are bundled', s1.fibres.filter((fb) => fb.inter).every((fb) => fb.p[1][0] !== fb.p[0][0] || fb.p[1][1] !== fb.p[0][1]));

  // one more memory, in Goals
  const extra = A.memoriesOf([...NODES, node(500, { id: 'zzz-new', type: 'Goal', label: 'A goal that just arrived' })], EDGES, [], NOW);
  const s3 = A.overviewScene(extra, EDGES);
  const before = new Map(s1.cells.map((c) => [c.id, c]));
  const moved = s3.cells.filter((c) => before.has(c.id)).map((c) => ({ c, d: Math.hypot(c.x - before.get(c.id).x, c.y - before.get(c.id).y) }));
  ok('adding a memory moves nothing in any other region', moved.filter((x) => x.c.region !== 'goals').every((x) => x.d === 0));
  const own = moved.filter((x) => x.c.region === 'goals').map((x) => x.d).sort((p, q) => p - q);
  ok('  and its own region only a little', own[Math.floor(own.length / 2)] < 16, JSON.stringify(own.map((d) => Math.round(d))));
  const fewer = A.overviewScene(MEM.filter((m) => m.id !== 'm001'), EDGES);
  const around = fewer.cells.filter((c) => before.has(c.id) && c.region !== BY.get('m001').region);
  ok('forgetting one moves nothing elsewhere either', around.every((c) => c.x === before.get(c.id).x && c.y === before.get(c.id).y));
}

console.log('\n=== words ===');
{
  const s = A.overviewScene(MEM, EDGES);
  const free = (L) => L.every((a, i) => L.every((b, j) => i === j || a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y));
  for (const scale of [0.6, 1, 2]) {
    const { labels, names } = A.placeWords(s, BY, { scale });
    const boxes = [...labels.map((l) => l.box), ...names.map((n) => n.box)];
    ok(`at ${scale}×, no two words touch`, free(boxes), boxes.length);
    ok(`  none covers a cell`, labels.every((l) => s.cells.every((c) => c.x + c.r < l.box.x || c.x - c.r > l.box.x + l.box.w || c.y + c.r < l.box.y || c.y - c.r > l.box.y + l.box.h)));
    ok(`  and every one is inside the drawing`, labels.every((l) => l.box.x >= 0 && l.box.y >= 0 && l.box.x + l.box.w <= s.w && l.box.y + l.box.h <= s.h));
  }
  const far = A.placeWords(s, BY, { scale: 0.6 }).labels.length, near = A.placeWords(s, BY, { scale: 2 }).labels.length;
  ok('closer in, more memories are named', near > far, `${far} → ${near}`);
  ok('every region is named, with how much it holds', A.placeWords(s, BY).names.length === 8 && A.placeWords(s, BY).names.every((n) => /^\d+$/.test(n.count)));
  const avoid = [{ x: 0, y: 0, w: 600, h: 60 }];
  ok('nothing is written under the page’s own controls', A.placeWords(s, BY, { avoid }).labels.every((l) => l.box.y > 60 || l.box.x > 600));
  const quiet = MEM[MEM.length - 1];
  ok('a memory that must be named is named', A.placeWords(s, BY, { scale: 0.3, must: new Set([quiet.id]) }).labels.some((l) => l.id === quiet.id) || !s.cells.some((c) => c.id === quiet.id));
  const rel = A.placeRelWords(s.fibres, [], { w: s.w, h: s.h, words: (fb) => A.relWord(fb.rel) });
  ok('relationship words sit apart too', free(rel.map((r) => r.box)) && rel.length > 0);
}

console.log('\n=== a region, opened ===');
{
  const s = A.regionScene(MEM, EDGES, 'work');
  const own = s.cells.filter((c) => !c.ghost);
  ok('its own memories, all of them up to the cap', own.length === Math.min(A.OPEN_CAP, MEM.filter((m) => m.region === 'work').length) && own.every((c) => c.region === 'work'));
  const ids = new Set(own.map((c) => c.id));
  const linked = (id) => EDGES.some((e) => (e.sourceId === id && ids.has(e.targetId)) || (e.targetId === id && ids.has(e.sourceId)));
  ok('at the edges, only memories that connect here', s.cells.filter((c) => c.ghost).every((c) => c.region !== 'work' && linked(c.id)));
  ok('every other region keeps a place at the edge', s.regions.filter((r) => r.quiet).length === 7);
  ok('only relationships that touch it are drawn', s.fibres.every((fb) => ids.has(fb.a) || ids.has(fb.b)));
  const words = A.placeWords(s, BY, { kickers: true, regionNames: true });
  ok('its memories are named with their kind', words.labels.filter((l) => ids.has(l.id)).every((l) => l.kicker));
  ok('the same region opens the same way twice', JSON.stringify(A.regionScene(MEM, EDGES, 'work')) === JSON.stringify(s));
  const from = own.find((c) => s.fibres.some((fb) => fb.a === c.id || fb.b === c.id));
  ok('the arrow keys walk along relationships', !from || ['left', 'right', 'up', 'down'].some((d) => A.neighbourToward(from, s.cells, s.fibres, d)));
}

console.log('\n=== on a phone ===');
{
  const s = A.overviewScene(MEM, EDGES, { narrow: true });
  ok('the phone’s own width', s.w === 390);
  ok('the regions named inside their lobes, where a thumb aims', s.regions.every((r) => r.inner));
  ok('from a distance, tracts between regions and no single fibres', s.tracts.length > 0 && s.fibres.length === 0);
  ok('every cell inside the drawing', s.cells.every((c) => c.x - c.r >= 0 && c.x + c.r <= s.w && c.y - c.r >= 0 && c.y + c.r <= s.h));
  const open = A.regionScene(MEM, EDGES, 'identity', { narrow: true, w: 390, h: 420 });
  ok('a region opened on a phone fits the phone', open.cells.every((c) => c.x > 0 && c.x < 390 && c.y > 0 && c.y < 420) && open.regions.length === 1);
}

console.log('\n=== the view: through the store, and nothing private ===');
{
  const v = read('components/logos5/MemoryView.tsx');
  const reads = [...v.matchAll(/'\/api\/mind[^']*'|`\/api\/mind[^`]*`/g)].map((m) => m[0]);
  ok('memory is read only through the private-filtered feeds', reads.length > 0 && reads.every((r) => /scope=logos/.test(r) || /^['`]\/api\/mind\/node['`]$/.test(r)), JSON.stringify(reads));
  ok('  changes, history and decisions included', /\/api\/mind\/changes\?scope=logos/.test(v) && /\/api\/mind\/changes\?scope=logos&node=/.test(v));
  ok('writes go through the store’s own routes', /method: 'PATCH'/.test(v) && /method: 'DELETE'/.test(v) && /method: 'POST'/.test(v));
  ok('  and after each one the view reads again, so what is shown is what was saved', /await read\(\)/.test(v));
  ok('nothing private is filtered in the browser instead', !/\.private\b/.test(v));
  ok('noticed-once claims stay on the full Memory page, where privacy is counted', /href="\/memory"/.test(v));
  const app = read('components/LogosApp.tsx');
  ok('Logos 5 opens it where the Mind Graph was', /<MemoryView\b/.test(app) && !/MindGraphView/.test(app));
  ok('the old drawing is gone, not kept beside it', !/logos5\/MindGraph|logos5\/mindgraph/.test(app + read('test/helpers/logos5-under-test.tsx')));
}

console.log('\n=== drawn ===');
{
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => (fetched++, new Response('{}'));
  const s = renderToStaticMarkup(h(U.MemoryView, { signedIn: false, head: (c) => h('header', null, 'HEAD', c), onOpen: () => {} }));
  globalThis.fetch = realFetch;
  ok('it carries the head it was given', s.includes('HEAD'));
  ok('  and says it is reading, before anything has come back', /Reading what Socria remembers/.test(s));
  ok('nothing is fetched while it is drawn', fetched === 0);
  ok('it is one region of the page, labelled', /<section class="l5mm" aria-label="Memory">/.test(s));
}

console.log('\n=== the inspector: confirm what is right ===');
{
  const NOW2 = Date.UTC(2026, 9, 24);
  const mem = (id, provenance) => U.memoriesOf([{ id, type: 'Preference', label: `Memory ${id}`, content: 'x', status: 'active', importance: 0.5, createdAt: NOW2 - 9e8, updatedAt: NOW2 - 9e8, provenance }], [], [], NOW2)[0];
  const props = (m, confirm) => ({ m, now: NOW2, edges: [], byId: new Map([[m.id, m]]), places: [], changes: [], history: null, busy: false, note: null, onClose: () => {}, onSelect: () => {}, onOpenPlace: () => {}, onSave: () => {}, onChallenge: () => {}, onForget: () => {}, onDecide: () => {}, ...(confirm ? { onConfirm: () => {} } : {}) });
  const reading = renderToStaticMarkup(h(U.MemoryInspector, props(mem('r', [{ kind: 'inferred', surface: 'core', at: NOW2 - 9e8 }]), true)));
  ok('a reading offers "That’s right", and says it is Socria’s reading', reading.includes('That’s right') && reading.includes('Socria’s reading'));
  const yours = renderToStaticMarkup(h(U.MemoryInspector, props(mem('y', [{ kind: 'inferred', surface: 'core', at: NOW2 - 9e8 }, { kind: 'stated', surface: 'user', at: NOW2 - 1e8, note: 'confirmed by you', review: 'confirmed' }]), true)));
  ok('  one they confirmed does not, and says so', !yours.includes('That’s right') && yours.includes('Confirmed'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
