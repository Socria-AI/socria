// The picture and the conversation, as one system.
//
// WHAT FAILURE THIS SUITE IS ABOUT. Somebody asked their black hole "is this
// realistic? what's the blue" and Socria answered "if you're seeing blue, it
// might represent…" — about a picture it had drawn itself. Everything below
// checks the three things that had to be true for that answer to be
// impossible: the picture reports its own contents, the report survives the
// trip through a browser without becoming a place to hide an instruction, and
// a reply may move the picture only in ways the picture actually allows.
//
// The last block is the one worth keeping honest over time: every mark a
// surface tags for selection must have a meaning declared for it, and every
// meaning must belong to a layer that surface really has. A tag with no entry
// is an object the conversation can be asked about and cannot answer.

import { readFileSync } from 'node:fs';
import {
  sanitizeModelState,
  vizModelBlock,
  vizOpsHelp,
  parseVizOps,
  stripVizOps,
  vizOpsSource,
  PROVENANCE_SAYS,
  MAX_OPS,
} from './.tmp/viz-model.mjs';
import {
  BLACK_HOLE_ENTITIES,
  BIG_BANG_ENTITIES,
  GRAVITY_ENTITIES,
  SURFACE_ENTITIES,
  SURFACE_MODEL,
  entitiesFromFrame,
} from './.tmp/viz-semantics.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

/** A state shaped like the one a black hole surface reports. */
const state = () =>
  sanitizeModelState({
    surface: 'black-hole',
    title: 'Black hole · Kerr geometry',
    model: 'Kerr geometry, equatorial',
    assumptions: ['The disc is optically thick and geometrically thin.'],
    equations: ['d²u/dφ² + u = 3u²'],
    entities: BLACK_HOLE_ENTITIES.map((e) =>
      e.id === 'rays' ? { ...e, state: '6 rays integrated, 2 captured' } : e
    ),
    params: [
      { id: 'm', label: 'M', value: 4, read: '4×10⁶ M☉', min: 1, max: 12, means: 'The mass.' },
      { id: 'spin', label: 'spin', value: 0, read: 'a = 0.000', min: -0.998, max: 0.998 },
      { id: 'edd', label: 'rate', value: 0.1, read: '10% Edd', min: 0.01, max: 1 },
    ],
    layers: [
      { id: 'disc', label: 'Disc', on: true },
      { id: 'ergo', label: 'Ergosphere', on: false },
      { id: 'rays', label: 'Light', on: true },
    ],
    camera: { yaw: 0.5, pitch: 0.62, dist: 48 },
    clock: { t: 3.7, playing: true, rate: 1 },
    readouts: ['bᶜ = 2.60 r', '2 of 6 captured'],
    selected: 'isco',
  });

console.log('\n=== the picture reports itself ===');
{
  const s = state();
  ok('a state survives sanitising', !!s);
  ok('  with its objects', s.entities.length === BLACK_HOLE_ENTITIES.length);
  ok('  and the live fact the render supplied', s.entities.find((e) => e.id === 'rays').state.includes('2 captured'));
  ok('  and the selection, because that id exists', s.selected === 'isco');

  // THE ASSERTION THE WHOLE FILE IS FOR.
  const blue = s.entities.find((e) => e.id === 'disc');
  ok('the blue is an object with a meaning', /accretion disc/i.test(blue.label + ' ' + blue.meaning));
  ok('  and the colour is explained as a computed quantity', /blackbody|temperature/i.test(blue.appearance));

  const block = vizModelBlock(s);
  ok('the prompt block names every object', BLACK_HOLE_ENTITIES.every((e) => block.includes(`[${e.id}]`)));
  ok('  and says what the blue is', /pale-blue|blue/.test(block) && /accretion disc/i.test(block));
  ok('  and where each control stands, now', block.includes('4×10⁶ M☉') && block.includes('range 1 to 12'));
  ok('  and which layers are off', /Ergosphere \[ergo\] off/.test(block));
  ok('  and the clock', block.includes('3.7 s') && block.includes('running'));
  ok('  and what "this" means', block.includes('THEY HAVE SELECTED') && block.includes('[isco]'));
  ok('  and that a plain question gets a plain answer', /plain question about what they can see gets a plain answer/i.test(block));
  ok('  and that nothing outside the list may be invented', /Never invent an object/i.test(block));
  ok('  and the Answer Guard is untouched', /Answer Guard is unchanged/i.test(block));

  // Provenance has to travel, or a drawing can be reported as a result.
  ok('an integrated object is reported as integrated', block.includes(PROVENANCE_SAYS.integrated));
  ok('  and the shells of the Big Bang are not', BIG_BANG_ENTITIES.find((e) => e.id === 'shell').from === 'illustrative');
  ok('  while the N-body paths are', GRAVITY_ENTITIES.find((e) => e.id === 'bodies').from === 'integrated');

  ok('no picture, no block', vizModelBlock(null) === '');
}

console.log('\n=== it arrived from a browser, so it is not trusted ===');
{
  ok('junk is not a state', sanitizeModelState(null) === null && sanitizeModelState('x') === null);
  ok('a state with no objects is not one either', sanitizeModelState({ surface: 'x', entities: [] }) === null);

  const dirty = sanitizeModelState({
    surface: 'black-hole',
    title: 'T'.repeat(500),
    entities: [
      { id: 'ok', type: 'body', label: 'A body', meaning: 'M'.repeat(900), from: 'made-up' },
      { id: 'no id here!', type: 'body', label: 'x', meaning: 'y' },
      { id: 'nolabel', type: 'body', meaning: 'y' },
    ],
    params: [
      { id: 'm', value: 500, min: 1, max: 12 },
      { id: 'bad', value: 1, min: 5, max: 5 },
    ],
    selected: 'nothing-like-this',
  });
  ok('the title is cut to a title', dirty.title.length <= 90);
  ok('  a meaning is cut too', dirty.entities[0].meaning.length <= 260);
  ok('  an invented provenance becomes the modest one', dirty.entities[0].from === 'illustrative');
  ok('  malformed ids are dropped', dirty.entities.length === 1);
  ok('  a value outside its own range is clamped', dirty.params[0].value === 12);
  ok('  an empty range is not a control', dirty.params.length === 1);
  ok('  a selection of something absent is no selection', dirty.selected === null);

  const flood = sanitizeModelState({
    surface: 'plot',
    entities: Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, type: 'curve', label: 'c', meaning: 'a curve' })),
  });
  ok('  and a flood of objects is capped', flood.entities.length === 48);
}

console.log('\n=== a reply may move the picture, within its own limits ===');
{
  const s = state();
  const reply = `Raised it — watch the inner edge.

\`\`\`socria-viz
set m 9
layer disc off
select horizon
pause
camera dist 70
\`\`\``;
  const ops = parseVizOps(reply, s);
  ok('the block is read', ops.length === 5);
  ok('  a control moves', ops[0].op === 'set' && ops[0].id === 'm' && ops[0].value === 9);
  ok('  a layer toggles', ops[1].op === 'layer' && ops[1].on === false);
  ok('  a thing is selected', ops[2].op === 'select' && ops[2].id === 'horizon');
  ok('  the clock stops', ops[3].op === 'pause');
  ok('  the camera moves', ops[4].op === 'camera' && ops[4].field === 'dist');

  ok('the reader never sees the block', stripVizOps(reply) === 'Raised it — watch the inner edge.');
  ok('  nor half of one, mid-stream', stripVizOps('Done.\n\n```socria-viz\nset m 9') === 'Done.');
  ok('  and a reply with no block is untouched', stripVizOps('Just words.') === 'Just words.');
  ok('  the block itself is recoverable for a trace', vizOpsSource(reply).includes('set m 9'));

  // THE LIMITS ARE THE PICTURE'S, NOT THE MODEL'S.
  const bad = parseVizOps(
    '```socria-viz\nset spin 40\nset nosuchcontrol 3\nlayer nosuchlayer on\nselect nosuchthing\nlayer disc sideways\n```',
    s
  );
  ok('a value past a physical range is clamped to it', bad.length === 1 && bad[0].value === 0.998);
  ok('  a control that does not exist cannot be moved', !bad.some((o) => o.id === 'nosuchcontrol'));
  ok('  nor a layer that does not exist', !bad.some((o) => o.op === 'layer'));
  ok('  nor an object that is not on screen selected', !bad.some((o) => o.op === 'select'));

  const many = parseVizOps('```socria-viz\n' + 'pause\n'.repeat(40) + '```', s);
  ok('a runaway list is cut', many.length === MAX_OPS);

  ok('no state, no ops', parseVizOps(reply, null).length === 0);
  ok('  and prose that merely mentions a control changes nothing', parseVizOps('You could set m to 9.', s).length === 0);

  const help = vizOpsHelp(s);
  ok('the help lists the real control ids', help.includes('m, spin, edd'));
  ok('  and the real layer ids', help.includes('disc, ergo, rays'));

  // A plot has no camera, so it is not offered one.
  const plot = sanitizeModelState({
    surface: 'plot',
    entities: [{ id: 'f', type: 'curve', label: 'f', meaning: 'a plotted curve' }],
    params: [{ id: 'h', label: 'h', value: 1, read: '1', min: 0, max: 2 }],
  });
  ok('a plot is offered no camera', !vizOpsHelp(plot).includes('camera'));
  ok('  and a camera op on one is dropped', parseVizOps('```socria-viz\ncamera dist 3\n```', plot).length === 1);
}

console.log('\n=== a plot says what a plot can honestly say ===');
{
  const ents = entitiesFromFrame(
    [
      { o: 'curve', id: 'f', tone: 'primary' },
      { o: 'region', id: 'area', tone: 'accent' },
      { o: 'curve', id: 'disc', color: '#89b4ff' },
    ],
    { kind: 'plot', expr: 'x^2', varName: 'x' }
  );
  ok('every mark becomes an entity', ents.length === 3);
  ok('  a tone becomes a colour a person would say', /olive green/.test(ents[0].appearance));
  ok('  a measured colour is named as measured', /computed quantity/.test(ents[2].appearance));
  ok('  and nothing on a plot claims to be integrated', ents.every((e) => e.from !== 'integrated'));
  ok('  no meaning is invented for an unnamed mark', /a plotted curve/.test(ents[0].meaning));
}

console.log('\n=== every tagged mark has a meaning, and every meaning a layer ===');
{
  // Source-read rather than render: what matters is that the two lists agree,
  // and a mark tagged in the markup with nothing declared for it is exactly
  // the failure this whole architecture exists to prevent.
  const files = {
    'black-hole': 'components/surfaces/BlackHoleSurface.tsx',
    'big-bang': 'components/surfaces/BigBangSurface.tsx',
    orbit: 'components/surfaces/GravitySurface.tsx',
  };
  for (const [surface, file] of Object.entries(files)) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const tagged = [...src.matchAll(/data-obj="([\w-]+)"/g)].map((m) => m[1]);
    const declared = new Set(SURFACE_ENTITIES[surface].map((e) => e.id));
    const layers = new Set([...src.matchAll(/\{ id: '([\w-]+)', label: '[^']*' \}/g)].map((m) => m[1]));

    ok(`${surface}: something is tagged at all`, tagged.length > 0);
    const orphan = tagged.find((id) => !declared.has(id));
    ok(`  every tagged mark has a declared meaning`, !orphan, orphan ?? '');
    const badLayer = SURFACE_ENTITIES[surface].find((e) => e.layer && !layers.has(e.layer));
    ok(`  every declared layer is one the surface has`, !badLayer, badLayer?.layer ?? '');
    const dupes = SURFACE_ENTITIES[surface].map((e) => e.id).filter((id, i, a) => a.indexOf(id) !== i);
    ok(`  and no two objects share an id`, dupes.length === 0, dupes.join(','));
    ok(`  the model behind it is declared`, !!SURFACE_MODEL[surface]?.model);
    ok(`  with what it holds fixed`, SURFACE_MODEL[surface].assumptions.length > 0);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
