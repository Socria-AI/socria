// LOGOS 5 — THE MIND GRAPH: WHAT SOCRIA REMEMBERS, DRAWN AS A MIND.
//
// What is held down:
//   • a memory falls in the region its kind says — habits, facts, projects —
//     and the store's own bookkeeping is never drawn;
//   • the drawing is the same every time for the same memories;
//   • the weightiest memory of a region leads it, and only memories drawn
//     are joined by axons;
//   • archived or nameless memories are left out, and a cap keeps it
//     readable, with what was left out counted;
//   • on a phone the regions stack, a memory to a row, at the phone's own size;
//   • what is said under a name says how it is known;
//   • the view, signed out, says memory needs an account — nothing is fetched.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as U from './.tmp/logos5-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));

const NOW = Date.UTC(2026, 9, 21);
const mem = (id, type, label, extra = {}) => ({ id, type, label, content: `${label}, in words`, importance: 0.5, seen: 1, confidence: 0.5, createdAt: NOW - 86_400_000, ...extra });
const memories = [
  mem('m1', 'preference', 'Decides with a spreadsheet', { importance: 0.95, seen: 6 }),
  mem('m2', 'belief', 'Teams matter more than pay'),
  mem('m3', 'person', 'Priya, a mentor'),
  mem('m4', 'project', 'Thesis on runway', { importance: 0.9 }),
  mem('m5', 'conversation', 'A chat'),
  mem('m6', 'fact', 'Archived thing', { status: 'archived' }),
  mem('m7', 'goal', '   '),
];
const edges = [
  { id: 'e1', sourceId: 'm1', targetId: 'm4', relationship: 'informs' },
  { id: 'e2', sourceId: 'm2', targetId: 'm5', relationship: 'informs' },
  { id: 'e3', sourceId: 'm3', targetId: 'm3', relationship: 'informs' },
];
const places = new Map([
  ['m1', [{ id: 'a', title: 'Two job offers', surface: 'logos' }, { id: 'b', title: 'Rent or buy', surface: 'logos' }, { id: 'c', title: 'Tax chat', surface: 'core' }]],
  ['m3', [{ id: 'a', title: 'Two job offers', surface: 'logos' }]],
]);

console.log('\n=== regions ===');
{
  ok('habits: how you decide', ['preference', 'belief', 'decision', 'insight', 'value', 'pattern'].every((t) => U.groupOf(t) === 'habit'));
  ok('projects: what you are working on', ['project', 'goal', 'plan', 'Project'].every((t) => U.groupOf(t) === 'project'));
  ok('facts: everything else that is held', ['person', 'place', 'event', 'fact', ''].every((t) => U.groupOf(t) === 'fact'));
  ok('the store’s own bookkeeping is not a memory', U.groupOf('conversation') === null);
}

console.log('\n=== the drawing ===');
{
  const d = U.mindDrawing(memories, edges, places, { now: NOW });
  const ids = d.neurons.map((n) => n.id).sort();
  ok('archived, nameless and bookkeeping memories are left out', JSON.stringify(ids) === JSON.stringify(['m1', 'm2', 'm3', 'm4']), ids);
  ok('it is the same drawing every time', JSON.stringify(U.mindDrawing(memories, edges, places, { now: NOW })) === JSON.stringify(d));
  const byId = Object.fromEntries(d.neurons.map((n) => [n.id, n]));
  ok('the weightiest of a region leads it, larger', byId.m1.lead && !byId.m2.lead && byId.m1.r > byId.m2.r);
  ok('each region has one lead', ['habit', 'fact', 'project'].every((g) => d.neurons.filter((n) => n.group === g && n.lead).length === 1));
  ok('habits to the left, held and worked-on to the right', byId.m1.x < byId.m3.x && byId.m3.y < byId.m4.y);
  ok('an axon only between memories drawn, never to itself', d.axons.length === 1 && d.axons[0].from === 'm1' && d.axons[0].to === 'm4' && d.axons[0].strong, JSON.stringify(d.axons));
  ok('a dendrite per place it was learned, two at least, five at most', byId.m1.dendrites.length === 4 && byId.m2.dendrites.length === 2);
  ok('every region named once', d.regions.map((r) => r.group).sort().join() === 'fact,habit,project');
  ok('nothing left out to count', d.more === 0);
  const habits = U.mindDrawing(memories, edges, places, { now: NOW, group: 'habit' });
  ok('one group: only it, in the middle', habits.neurons.every((n) => n.group === 'habit') && habits.neurons[0].x === 720);
  const many = Array.from({ length: 50 }, (_, i) => mem(`x${String(i).padStart(2, '0')}`, 'fact', `Fact ${i}`));
  const capped = U.mindDrawing(many, [], new Map(), { now: NOW });
  ok('a cap keeps it readable, and what is left out is counted', capped.neurons.length === 36 && capped.more === 14);
  ok('positions are whole numbers inside the drawing', capped.neurons.every((n) => Number.isInteger(n.x) && Number.isInteger(n.y) && n.x > 0 && n.x < capped.width && n.y > 0 && n.y < capped.height));
}

console.log('\n=== on a phone ===');
{
  const d = U.mindDrawing(memories, edges, places, { now: NOW, narrow: true });
  ok('the phone’s own width, one to one', d.width === 390);
  ok('the regions one under another: decide, holding, working on', d.regions.map((r) => r.group).join() === 'habit,fact,project' && d.regions[0].y < d.regions[1].y && d.regions[1].y < d.regions[2].y);
  const ys = d.neurons.map((n) => n.y);
  ok('a memory to a row, downwards, every name on the right', ys.every((y, i) => i === 0 || y > ys[i - 1]) && d.neurons.every((n) => !n.left));
  ok('every cell inside the width, and the drawing as tall as it needs', d.neurons.every((n) => n.x - n.r > 0 && n.x + n.r < 390) && d.height > Math.max(...ys));
  ok('the same memories, axons and leads as on a desktop', d.neurons.length === 4 && d.axons.length === 1 && d.neurons.filter((n) => n.lead).length === 3);
}

console.log('\n=== how it is known ===');
{
  const lines = [{ id: 'a', title: 'A', surface: 'logos' }, { id: 'b', title: 'B', surface: 'logos' }];
  ok('set by you, first', U.subOf('habit', lines, true, NOW, NOW) === 'Habit · set by you');
  ok('seen in several lines of thinking', U.subOf('habit', lines, false, NOW, NOW) === 'Habit · seen in 2 lines of thinking');
  ok('one place: named', U.subOf('fact', [{ id: 'a', title: 'Two job offers', surface: 'logos' }], false, NOW, NOW) === 'Fact · Two job offers');
  ok('long known, nowhere in particular: since when', U.subOf('project', [], false, Date.UTC(2026, 2, 3), NOW) === 'Project · since March');
  ok('a search reads the name and the words', U.memoryMatches({ label: 'Runway', content: 'months of cash' }, 'CASH') && !U.memoryMatches({ label: 'Runway', content: '' }, 'pay') && U.memoryMatches({ label: 'x', content: '' }, '  '));
}

console.log('\n=== the view ===');
{
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => (fetched++, new Response('{}'));
  const s = renderToStaticMarkup(h(U.MindGraphView, { signedIn: false, head: () => h('header', null, 'HEAD'), onOpen: () => {} }));
  globalThis.fetch = realFetch;
  ok('it has the head it was given', s.includes('HEAD'));
  ok('nothing is fetched while it is drawn', fetched === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
