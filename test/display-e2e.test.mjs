// AN EVERYDAY DISPLAY, THROUGH THE REAL ROUTES — asked for, drafted, sealed, said.
//
// Workflows 1, 7 and 9 of Logos 3.5 at the level a person meets them: the
// real map and reply route handlers, with the language model scripted
// (test/helpers/fake-openai-logos.mjs). What is held down: a plan asked for
// in words is drafted by the display pass, sealed by the plan's sanitizer and
// added to the workspace's objects, marked as Socria's; a plan made from the
// map is computed from the map with no model asked; what cannot be made —
// an unknown kind, unreadable JSON, a refusal, an empty map, a full workspace
// — is said in a sentence and adds nothing; the model second pass does not
// mistake a display for a model nobody proposed, and a model asked for is
// still built; and the reply model is told what the display holds and that
// it may not rewrite it.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-display');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
for (const [entry, out] of [['app/api/logos/map/route.ts', 'map.mjs'], ['app/api/logos/chat/route.ts', 'chat.mjs']]) {
  await build({
    entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node',
    outfile: join(OUT, out), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
    external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
  });
}

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('logos map') || first.startsWith('[logos') || first.startsWith('[socria')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_display_e2e';

const mapRoute = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const EMPTY = { nodes: [], edges: [] };

async function mapTurn(said, script, { map = EMPTY, today = '2026-10-10', before = [] } = {}) {
  globalThis.__logosScript = [...script];
  globalThis.__logosCalls = [];
  const req = new NextRequest('http://localhost/api/logos/map', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [...before, { role: 'user', content: said }], map, today }),
  });
  const r = await mapRoute.POST(req);
  const json = await r.json();
  return { status: r.status, json, calls: globalThis.__logosCalls, left: globalThis.__logosScript.length };
}

const plansIn = (json) => (json.map?.objects?.objs ?? []).filter((o) => o.kind === 'plan');
const systemOf = (call) => String(call?.messages?.[0]?.content ?? '');

const EXTRACTED = {
  nodes: [{ id: 'essay', label: 'History essay', type: 'concept' }],
  edges: [],
  context: 'planning',
  ask: { action: 'construct', artifact: 'display', topic: 'history essay' },
};
const PLAN = {
  display: {
    kind: 'plan',
    state: {
      title: 'History essay',
      view: 'timeline',
      items: [
        { id: 'i1', text: 'Find three sources', date: '2026-10-12', end: '2026-10-13', by: 'person' },
        { id: 'i2', text: 'Outline', date: '2026-10-14' },
        { id: 'i3', text: 'Draft', date: '2026-10-15', end: '2026-10-16' },
      ],
      links: [{ from: 'i1', to: 'i2' }, { from: 'i2', to: 'i3' }],
    },
  },
  gaps: ['the essay length'],
};

console.log('=== a plan asked for in words ===');
{
  const { status, json, calls } = await mapTurn('Make me a study plan for my history essay due next Friday', [EXTRACTED, PLAN]);
  ok('the route answers', status === 200, String(status));
  ok('the display pass ran once, after the extraction', calls.length === 2 && /EVERYDAY DISPLAYS/.test(systemOf(calls[1])), String(calls.length));
  ok('  told the person’s own calendar day', /Today is 2026-10-10/.test(systemOf(calls[1])));
  ok('  told only about plans, the kind they asked for', /"plan"/.test(systemOf(calls[1])) && /They asked for/.test(systemOf(calls[1])));
  const plans = plansIn(json);
  ok('a plan is in the workspace’s objects', plans.length === 1 && plans[0].states[0].items.length === 3, JSON.stringify(json.map?.objects)?.slice(0, 200));
  ok('  as the kind sealed it: links kept, days real', plans[0]?.states[0].links.length === 2 && plans[0].states[0].items[0].end === '2026-10-13');
  ok('  drafted by Socria, every item marked so — the claimed authorship dropped', plans[0]?.origin === 'socria' && plans[0].states[0].items.every((i) => i.by === 'socria'));
  ok('the turn says what was made, and what could not be filled', json.display?.ok === true && /Drafted by Socria: a plan “History essay”/.test(json.display.says) && /essay length/.test(json.display.says), JSON.stringify(json.display));
  ok('  and names the object, so the workspace can open it', json.display?.id === plans[0]?.id && json.display?.kind === 'plan');
  ok('no model was asked for, so no model failure is reported', !json.build, JSON.stringify(json.build));
}

console.log('\n=== asked for only in the extractor’s reading ===');
{
  const { json, calls } = await mapTurn('Lay my week out for me — gym Monday, essay Wednesday', [EXTRACTED, PLAN]);
  ok('construct → display runs the display pass even without the words', calls.length === 2 && plansIn(json).length === 1 && json.display?.ok);
  ok('  the pass is offered every kind, to choose the one that fits', /choose the kind below that fits/i.test(systemOf(calls[1])));
}

console.log('\n=== what cannot be made says so, and adds nothing ===');
{
  const unknown = await mapTurn('make me a checklist for moving house', [EXTRACTED, { display: { kind: 'flashcards', state: { cards: [] } } }]);
  ok('an unknown kind: refused, with what can be made', unknown.json.display?.ok === false && unknown.json.display.failure === 'unsupported' && /can make/.test(unknown.json.display.says) && !plansIn(unknown.json).length);
  const junk = await mapTurn('make me a checklist for moving house', [EXTRACTED, 'this is not json']);
  ok('unreadable output: refused, nothing added', junk.json.display?.ok === false && junk.json.display.failure === 'malformed' && !plansIn(junk.json).length);
  const bad = await mapTurn('make me a checklist for moving house', [EXTRACTED, { display: { kind: 'plan', state: 'a list, roughly' } }]);
  ok('a state the kind cannot hold: refused', bad.json.display?.failure === 'malformed' && !plansIn(bad.json).length);
  const no = await mapTurn('make me a timeline of my week', [EXTRACTED, { none: 'Nothing in the conversation is scheduled yet.' }]);
  ok('a pass that declines: its reason, said', no.json.display?.failure === 'declined' && /Nothing in the conversation is scheduled/.test(no.json.display.says));
  const threw = await mapTurn('make me a timeline of my week', [EXTRACTED, new Error('upstream down')]);
  ok('a pass that fails: said as a failure, the map still returned', threw.status === 200 && threw.json.display?.ok === false && threw.json.map?.nodes?.length === 1);
  const full = { nodes: [{ id: 'a', label: 'Moving', type: 'concept' }], edges: [], objects: { objs: Array.from({ length: 16 }, (_, i) => ({ id: `P${i + 1}`, kind: 'plan', name: `P${i + 1}`, origin: 'socria', states: [{ title: `Plan ${i}`, view: 'list', items: [{ id: 'i1', text: 'x', by: 'socria' }], links: [] }], steps: [], at: 0 })) } };
  const over = await mapTurn('make me a checklist for moving house', [EXTRACTED, PLAN], { map: full });
  ok('a full workspace: said, and nothing evicted', over.json.display?.failure === 'full' && plansIn(over.json).length === 16, JSON.stringify(over.json.display));
}

console.log('\n=== a plan made from the map ===');
{
  const map = {
    nodes: [
      { id: 'collect', label: 'Collect the survey data', type: 'claim' },
      { id: 'analyse', label: 'Analyse the responses', type: 'claim' },
      { id: 'write', label: 'Write the report', type: 'claim' },
      { id: 'q', label: 'Is the sample big enough?', type: 'question' },
    ],
    edges: [
      { from: 'collect', to: 'analyse', relation: 'precedes' },
      { from: 'analyse', to: 'write', relation: 'precedes' },
    ],
  };
  const extracted = { ...map, context: 'planning', ask: { action: 'construct', artifact: 'display', topic: 'survey project' } };
  const { json, calls } = await mapTurn('Turn this map into a checklist', [extracted], { map });
  ok('no model is asked to write it: only the extraction ran', calls.length === 1, String(calls.length));
  const p = plansIn(json)[0];
  ok('the map’s ideas are its items, in the map’s words and order', p?.states[0].items.map((i) => i.text).join(' | ') === 'Collect the survey data | Analyse the responses | Write the report', JSON.stringify(p?.states[0].items));
  ok('  a question stays on the map', !p?.states[0].items.some((i) => /sample/.test(i.text)));
  ok('  what precedes what is kept', p?.states[0].links.length === 2);
  ok('  opened as the checklist asked for, made from their map', p?.states[0].view === 'checklist' && p.origin === 'person' && /Made from your map/.test(json.display?.says ?? ''));
  const empty = await mapTurn('Turn this map into a checklist', [{ nodes: [], edges: [] }]);
  ok('an empty map makes nothing, and says why', empty.json.display?.ok === false && /nothing on the map yet/.test(empty.json.display.says));
}

console.log('\n=== made without a model: a worksheet, a labeling exercise ===');
{
  const ws = await mapTurn('Give me a balance sheet worksheet to practise on', [EXTRACTED]);
  const w = (ws.json.map?.objects?.objs ?? []).find((o) => o.kind === 'worksheet');
  ws.calls.length === 1 || console.log(ws.calls.map(systemOf).map((x) => x.slice(0, 60)));
  ok('a worksheet is made from its template — no model asked to write it', ws.calls.length === 1 && w?.states[0].template === 'balance-sheet' && ws.json.display?.ok, String(ws.calls.length));
  ok('  every amount left for the person', w?.states[0].sections.every((sec) => sec.lines.every((l) => l.amount === null)));
  const heart = {
    id: 'D1', kind: 'diagram', name: 'D1', origin: 'socria', steps: [], at: 0,
    states: [{ title: 'The heart', view: 'concept', detail: 'full', nodes: [{ id: 'a', label: 'Aorta', by: 'socria' }, { id: 'b', label: 'Left ventricle', by: 'socria' }, { id: 'c', label: 'Right atrium', by: 'socria' }], edges: [{ from: 'b', to: 'a', by: 'socria' }] }],
  };
  const withHeart = { nodes: [{ id: 'h', label: 'The heart', type: 'concept' }], edges: [], objects: { objs: [heart] } };
  const ex = await mapTurn('Quiz me on this diagram', [{ ...withHeart, context: 'learning', ask: { action: 'construct', artifact: 'display' } }], { map: withHeart });
  const x = (ex.json.map?.objects?.objs ?? []).find((o) => o.kind === 'exercise');
  ok('"quiz me on this diagram": a labeling exercise over it, no model asked', ex.calls.length === 1 && x?.states[0].parts.length === 3 && x.states[0].source.kind === 'diagram');
  ok('  every label hidden, and the diagram said to be Socria’s, unverified', x?.states[0].hidden.length === 3 && x.states[0].source.verified === false);
  const none = await mapTurn('Make a quiz about the causes of World War One', [{ nodes: [], edges: [], ask: { action: 'construct', artifact: 'display' } }]);
  ok('a quiz about a topic, with nothing here, is not written — it says why', none.json.display?.ok === false && /made from something already here/.test(none.json.display.says) && none.calls.length === 1);
}

console.log('\n=== a chart of their own numbers: read from their words, no model asked ===');
{
  const said = 'Make a bar chart of my spending: rent 1,200, food 400, transport 150';
  // the extractor's reading still comes back; a second model pass would be the old, fallible path
  const { json, calls } = await mapTurn(said, [EXTRACTED]);
  const t = (json.map?.objects?.objs ?? []).find((o) => o.kind === 'data');
  ok('no display pass: only the extraction ran', calls.length === 1, String(calls.length));
  ok('their numbers, as written, as theirs, drawn as bars', t?.states[0].basis === 'given' && t.states[0].view === 'bar' && JSON.stringify(t.states[0].rows.map((r) => r.cells)) === JSON.stringify([['Rent', 1200], ['Food', 400], ['Transport', 150]]), JSON.stringify(t?.states[0]));
  ok('  made by the person, from their words — and the turn says so', t?.origin === 'person' && json.display?.ok && /Made from what you wrote: a chart “Spending”/.test(json.display.says), json.display?.says);
}

console.log('\n=== THE FAILURE: "Chart my monthly spending…" ===');
{
  const said = 'Chart my monthly spending: rent 1200, food 400, transport 150';
  // what the extractor did with it: told to draw whenever someone says "chart", it sketched bars on
  // the maths Plot lens, and read the ask as a plot — never a display, so nothing was made
  const SKETCHED = {
    nodes: [{ id: 'spend', label: 'Monthly spending', type: 'concept' }],
    edges: [],
    context: 'analysing',
    ask: { action: 'represent', artifact: 'plot', topic: 'monthly spending' },
    viz: { kind: 'diagram', title: 'Spending', parts: [{ o: 'rects', bars: [{ x0: 0, x1: 1, y: 1200 }, { x0: 1, x1: 2, y: 400 }, { x0: 2, x1: 3, y: 150 }] }] },
  };
  const first = await mapTurn(said, [SKETCHED]);
  const t = (first.json.map?.objects?.objs ?? []).find((o) => o.kind === 'data');
  ok('made: a chart, from their words, whatever the extractor read the ask as', first.json.display?.ok === true && t?.states[0].rows.map((r) => r.cells.join('=')).join(', ') === 'Rent=1200, Food=400, Transport=150', JSON.stringify(first.json.display));
  ok('  no second model call', first.calls.length === 1, String(first.calls.length));
  ok('  the extractor’s hand-drawn copy of it is not shown beside it', !first.json.map?.viz, JSON.stringify(first.json.map?.viz)?.slice(0, 120));
  ok('  and the display is named, so it opens beside the map', first.json.display.id === t.id && first.json.display.kind === 'data');
  const quiet = await mapTurn(said, [{ nodes: [], edges: [], context: 'reflecting', ask: { action: 'discuss', artifact: 'answer' } }]);
  ok('made even when the extractor heard only conversation', (quiet.json.map?.objects?.objs ?? []).some((o) => o.kind === 'data') && quiet.json.display?.ok);
  const runs = [];
  for (let i = 0; i < 10; i++) runs.push(await mapTurn(said, [SKETCHED]));
  const states = runs.map((r) => JSON.stringify((r.json.map?.objects?.objs ?? []).find((o) => o.kind === 'data')?.states[0]));
  ok('consistent: ten turns, ten identical charts', states.every((x) => x && x === states[0]));
  const threw = await mapTurn(said, [new Error('upstream down')]);
  ok('when the extractor itself fails, the map is salvaged and nothing is claimed', threw.status === 200 && !threw.json.display?.ok);
}

console.log('\n=== ONE ANSWER TO ONE ASK, whatever the kind: "Venn diagram of mitosis and meiosis" ===');
{
  // The screenshot: a Venn diagram asked for, and beside the display a "Picture" the extractor
  // drew of the same words — overlapping triangles on axes, spilling out of its card. The display
  // is the answer whatever its kind, not only a chart's.
  const said = 'Make a Venn diagram of mitosis and meiosis';
  const DRAWN = { kind: 'diagram', title: 'Venn Diagram: Mitosis and Meiosis', parts: [{ o: 'rects', bars: [{ x0: 0, x1: 1, y: 2 }, { x0: 1, x1: 2, y: 1 }] }] };
  const VENN = {
    display: {
      kind: 'venn',
      state: {
        title: 'Mitosis and meiosis',
        view: 'venn',
        sets: [{ id: 'mi', name: 'Mitosis' }, { id: 'me', name: 'Meiosis' }],
        elements: [
          { id: 'a', label: 'Two daughter cells', sets: ['mi'] },
          { id: 'b', label: 'Four daughter cells', sets: ['me'] },
          { id: 'c', label: 'DNA replicated first', sets: ['mi', 'me'] },
        ],
      },
    },
  };
  const READ = { nodes: [{ id: 'm', label: 'Cell division', type: 'concept' }], edges: [], context: 'learning', ask: { action: 'construct', artifact: 'display', topic: 'mitosis and meiosis' }, viz: DRAWN };
  const { json } = await mapTurn(said, [READ, VENN]);
  const v = (json.map?.objects?.objs ?? []).find((o) => o.kind === 'venn');
  ok('the Venn diagram is made, as a Venn diagram', json.display?.ok === true && !!v, JSON.stringify(json.display));
  ok('  the picture the extractor drew of the same ask is not kept beside it', !json.map?.viz, JSON.stringify(json.map?.viz)?.slice(0, 160));
  const onScreen = { nodes: [{ id: 'f', label: 'y = x²', type: 'concept' }], edges: [], viz: { kind: 'function', expr: 'x^2', title: 'y = x^2' } };
  const kept = await mapTurn(said, [{ ...READ, nodes: onScreen.nodes }, VENN], { map: onScreen });
  // The route answers with the picture on screen or with none, and the screen keeps its own when
  // none comes back (components/LogosApp.tsx: json.map.viz ?? the map's) — never the new drawing.
  const back = kept.json.map?.viz;
  ok('  a picture already on screen stays as it was', kept.json.display?.ok === true && (!back || (back.kind === 'function' && back.expr === 'x^2')), JSON.stringify({ d: kept.json.display?.ok, v: back ?? null }).slice(0, 300));
  // Four views, four jobs (test/four-views-e2e.test.mjs): a picture is made when it is asked for.
  const talk = await mapTurn('How does meiosis make four cells?', [{ ...READ, ask: { action: 'discuss', artifact: 'answer' } }]);
  ok('  with nothing asked for, the extractor’s picture is not kept either — a question is answered in words', !talk.json.display && !talk.json.map?.viz, JSON.stringify(talk.json.display ?? talk.json.map?.viz)?.slice(0, 160));
  const drawn = await mapTurn('Draw how meiosis makes four cells', [{ ...READ, ask: { action: 'represent', artifact: 'diagram' } }]);
  ok('  asked to draw it, the picture is kept', drawn.json.map?.viz?.kind === 'diagram', JSON.stringify(drawn.json.map?.viz)?.slice(0, 160));
}

console.log('\n=== the other everyday asks, end to end ===');
{
  const before = [{ role: 'user', content: 'My expenses: rent 1200, food 400, transport 150' }, { role: 'assistant', content: 'Got it.' }];
  const pie = await mapTurn('Make a pie chart of these expenses.', [{ nodes: [], edges: [] }], { before });
  const p = (pie.json.map?.objects?.objs ?? []).find((o) => o.kind === 'data');
  ok('"Make a pie chart of these expenses." — the numbers said before, as a pie', p?.states[0].view === 'pie' && p.states[0].rows.length === 3 && pie.calls.length === 1, JSON.stringify(p?.states[0])?.slice(0, 200));
  const blank = await mapTurn('Plot revenue over six months.', [{ nodes: [], edges: [] }]);
  const b = (blank.json.map?.objects?.objs ?? []).find((o) => o.kind === 'data');
  ok('"Plot revenue over six months." — an empty line chart, six rows, said to be empty', b?.states[0].view === 'line' && b.states[0].rows.length === 6 && /nothing was made up/.test(blank.json.display?.says ?? ''), blank.json.display?.says);
  ok('  and nothing in it', b?.states[0].rows.every((r) => r.cells.every((c) => c === null)));
  const nl = await mapTurn('Visualize the interval x > 3', [{ nodes: [], edges: [] }]);
  const n = (nl.json.map?.objects?.objs ?? []).find((o) => o.kind === 'numberline');
  ok('"Visualize the interval x > 3" — a number line, open at 3, running on to the right', n?.states[0].intervals[0].lo === 3 && n.states[0].intervals[0].loOpen === true && n.states[0].intervals[0].hi === null && nl.calls.length === 1);
  const cl = await mapTurn('Make a checklist: buy milk, call mom, pay rent', [{ nodes: [], edges: [] }]);
  const c = (cl.json.map?.objects?.objs ?? []).find((o) => o.kind === 'plan');
  ok('"Make a checklist: …" — the items, in order, no model asked', c?.states[0].items.map((i) => i.text).join(' | ') === 'Buy milk | Call mom | Pay rent' && cl.calls.length === 1);
}

console.log('\n=== a function they asked to see ===');
{
  const none = await mapTurn('Graph y = x²', [{ nodes: [{ id: 'f', label: 'y = x²', type: 'concept' }], edges: [], context: 'math' }]);
  ok('"Graph y = x²" with no picture from the extractor: the curve is drawn from their words', none.json.map?.viz?.kind === 'function' && /x/.test(none.json.map.viz.expr), JSON.stringify(none.json.map?.viz)?.slice(0, 160));
  const wrong = await mapTurn('Plot y = x^(2/3)', [{ nodes: [], edges: [], context: 'math', viz: { kind: 'function', expr: 'x^2', title: 'y = x^2' } }]);
  ok('"Plot y = x^(2/3)" drawn as x^2 by the extractor: replaced with the curve they wrote', wrong.json.map?.viz?.expr === 'x^(2/3)', JSON.stringify(wrong.json.map?.viz)?.slice(0, 160));
  const same = await mapTurn('Graph y = x^2', [{ nodes: [], edges: [], context: 'math', viz: { kind: 'function', expr: 'x*x', title: 'A parabola', says: { caption: 'Its vertex is at the origin.' } } }]);
  ok('the extractor’s own picture of the same curve stands', same.json.map?.viz?.title === 'A parabola');
  const chartNotCurve = await mapTurn('Chart my spending: rent 1200, food 400', [{ nodes: [], edges: [] }]);
  ok('a chart of spending is never drawn as a function', !chartNotCurve.json.map?.viz && chartNotCurve.json.display?.ok);
}

console.log('\n=== a drafted table: the person’s numbers, or labelled examples ===');
{
  // the numbers are in an earlier message and not pointed back to: the drafted path, sealed
  const before = [{ role: 'user', content: 'Last month rent was 1,200, food 400 and transport 150.' }, { role: 'assistant', content: 'Noted.' }];
  const said = 'Make a bar chart of my spending from last month';
  const table = (food, basis) => ({
    display: { kind: 'data', state: { title: 'Spending', view: 'bar', basis, columns: [{ id: 'k', name: 'Category', type: 'text' }, { id: 'v', name: 'Amount', type: 'number', unit: '$' }], rows: [['Rent', 1200], ['Food', food], ['Transport', 150]], x: 'k', y: ['v'] } },
  });
  const good = await mapTurn(said, [EXTRACTED, table(400, 'given')], { before });
  const t = (good.json.map?.objects?.objs ?? []).find((o) => o.kind === 'data');
  ok('their numbers, as theirs, drawn as bars', good.calls.length === 2 && t?.states[0].basis === 'given' && t.states[0].view === 'bar' && good.json.display?.ok);
  const bad = await mapTurn(said, [EXTRACTED, table(425, 'given')], { before });
  const tb = (bad.json.map?.objects?.objs ?? []).find((o) => o.kind === 'data');
  ok('a number they never wrote: the table is marked as examples, and the turn says so', tb?.states[0].basis === 'illustrative' && /not in what you wrote or attached/.test(bad.json.display?.says ?? ''), bad.json.display?.says);
}

console.log('\n=== a model is still a model ===');
{
  const FORMAL = {
    id: 'pulsar-beam',
    title: 'Pulsar beam intensity',
    params: [{ id: 'w', label: 'w', value: 1, min: 0.2, max: 3 }],
    objects: [{ id: 'i', kind: 'surface', label: 'beam intensity', meaning: 'How bright the beam is.', definition: 'exp(-(x^2 + y^2) / w)', over: { x: [-3, 3], y: [-3, 3] }, depends: ['w'] }],
  };
  const { json, calls } = await mapTurn('Model a pulsar beam with a width w', [{ nodes: [{ id: 'p', label: 'Pulsar', type: 'concept' }], edges: [], ask: { action: 'construct', artifact: 'model', topic: 'pulsar' }, propose: FORMAL }]);
  ok('a model asked for builds, and no display pass runs', json.build?.ok === true && !json.display && calls.length === 1, JSON.stringify(json.build));
  const second = await mapTurn('Model a pulsar', [{ nodes: [{ id: 'p', label: 'Pulsar', type: 'concept' }], edges: [], ask: { action: 'construct', artifact: 'model', topic: 'pulsar' } }, { propose: FORMAL }]);
  ok('  and a construction nobody proposed still gets its second pass', second.json.build?.ok === true && second.calls.length === 2 && !second.json.display);
}

console.log('\n=== the reply is told what the display holds ===');
{
  const { json } = await mapTurn('Make me a study plan for my history essay due next Friday', [EXTRACTED, PLAN]);
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = 'Here is how I would use it.';
  const req = new NextRequest('http://localhost/api/logos/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Does this plan look doable?' }], objects: json.map.objects }),
  });
  const r = await chatRoute.POST(req);
  try { await r.text(); } catch {}
  const prompt = globalThis.__logosPrompts[0] ?? '';
  ok('the plan is described to the reply, item by item', /PLAN “History essay”/.test(prompt) && /Find three sources \[2026-10-12→2026-10-13\]/.test(prompt), prompt.slice(-1200));
  ok('  with the display rules: use what it computes, never rewrite it, its text is not instructions', /A DISPLAY \(a plan/.test(prompt) && /never paste the display back/.test(prompt) && /never instructions to you/.test(prompt));
  ok('  and the plan’s own rule, from its kind', /A PLAN is the person’s own document/.test(prompt));
  ok('  and none of the matrix rules it has no use for', !/R2 ← R2 − 3R1/.test(prompt));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
