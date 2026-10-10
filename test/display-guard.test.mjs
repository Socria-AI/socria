// WHAT A DISPLAY SAYS WHILE SOMEONE IS PRACTISING, AND THE WORKSPACE ASKED FOR IN WORDS.
//
// A display's step notes say what the step computed — "Job B now leads 6.65
// to 6.4", a balance, a total. While the Answer Guard is up that is exactly
// what the person is working out, so it is passed neither to the reply nor
// shown under the figure; unguarded, it is. And "open the display", "show the
// model beside the map" arrange the workspace in place: read after a lens
// asked for by name (which keeps its own path) and before a command to the
// map, answered in a line, with nothing sent to the model.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { create, apply, objectsBlock, EMPTY_SPACE, kindOf, currentOf } from './.tmp/index.mjs';
import { PlanFigure } from './.tmp/PlanFigure.mjs';
import { sanitizePlan } from './.tmp/display-plan.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== a comparison practised under the guard ===');
{
  const jobs = {
    title: 'Two offers',
    options: [{ id: 'a', name: 'Job A' }, { id: 'b', name: 'Job B' }],
    criteria: [{ id: 's', name: 'Salary', weight: 8 }, { id: 'c', name: 'Commute', weight: 5 }],
    scores: [
      { option: 'a', criterion: 's', value: 8 },
      { option: 'b', criterion: 's', value: 6 },
      { option: 'a', criterion: 'c', value: 4 },
      { option: 'b', criterion: 'c', value: 9 },
    ],
  };
  let space = create(EMPTY_SPACE, 'compare', jobs, { origin: 'person' }).space;
  const id = space.objs[0].id;
  const r = apply(space, id, 'weight', { criterion: 'c', weight: 10, by: 'person' }, { by: 'person' });
  ok('a reweight is a step', r.ok, r.why);
  space = r.space;
  const note = space.objs[0].steps[0].note ?? '';
  ok('  whose note says what it computed', note.length > 0, JSON.stringify(space.objs[0].steps[0]));
  const lastStep = { obj: id, step: space.objs[0].steps[0] };
  const guarded = objectsBlock(space, { guarded: true, lastStep });
  const open = objectsBlock(space, { guarded: false, lastStep });
  ok('guarded, the note is not passed to the reply', !guarded.includes(note), guarded.slice(0, 600));
  ok('  unguarded, it is', open.includes(note));
}

console.log('\n=== the note under a figure ===');
{
  const s0 = sanitizePlan({ title: 'Essay', items: [{ id: 'i1', text: 'Research', date: '2026-10-12', end: '2026-10-20' }, { id: 'i2', text: 'Draft', date: '2026-10-22' }], links: [{ from: 'i1', to: 'i2' }] });
  const s1 = { ...s0, items: s0.items.map((i) => (i.id === 'i2' ? { ...i, date: '2026-10-15' } : i)) };
  const obj = { id: 'P1', kind: 'plan', name: 'P1', origin: 'socria', states: [s0, s1], steps: [{ op: 'date', args: { id: 'i2', date: '2026-10-15' }, said: 'moved to 15 Oct 2026', note: '‘Draft’ now falls 5 days before ‘Research’, which it waits on.', by: 'person', at: 1 }], at: 1 };
  const shown = renderToStaticMarkup(h(PlanFigure, { obj, at: 1, mode: 'live', onOp: () => ({ ok: true }), onSeek: () => {} }));
  const hidden = renderToStaticMarkup(h(PlanFigure, { obj, at: 1, mode: 'live', guarded: true, onOp: () => ({ ok: true }), onSeek: () => {} }));
  ok('unguarded, what the step computed is said under the figure', shown.includes('now falls 5 days before'));
  ok('  guarded, it is not', !hidden.includes('dsp-note'));
}

console.log('\n=== the workspace, asked for in words ===');
{
  const app = readFileSync('components/LogosApp.tsx', 'utf8');
  const view = app.indexOf('readViewRequest(content)');
  const iface = app.indexOf('readInterfaceRequest(content');
  const cmd = app.indexOf('readMapCommand(content');
  ok('surfaces asked for by name are read in the send path', iface > 0);
  ok('  after a lens asked for by name, which keeps its own path', view > 0 && view < iface);
  ok('  and before a command to the map', iface < cmd);
  const block = app.slice(app.lastIndexOf('if (workspaceOn', iface), cmd);
  ok('  arranged in place and said in a line, with nothing sent to the model', /changeLayout\(layoutForRequest\(asked, wsLayout, wsFacts\)\)/.test(block) && /postPair\(\.\.\.pairOf\(interfaceSaid\(asked\)\)\)/.test(block) && /return;/.test(block));
  ok('  only in the workspace, never for a step on an object', /workspaceOn && wsLayout && !atts\.length && !objTurn\.lastStep/.test(block));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
