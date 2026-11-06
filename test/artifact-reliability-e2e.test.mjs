// ARTIFACTS, DEPENDABLY — every tier, through the real routes, against an OpenAI as strict as the real one.
//
// The fault (docs/ARTIFACT-RELIABILITY.md): every call was written as
// `max_tokens` + a fixed `temperature`, which the GPT-5.6 and GPT-6 models
// refuse; the refusal names "this model", so the routes read it as the model
// being unavailable — the map and the reply stepped down to the last rung of
// each ladder, and the easy view and experiences, which stepped down one rung
// onto another refused model, failed for every signed-in person. And a display
// asked for in words was drafted only after the whole map extraction, so an
// extraction that came back empty, unreadable or not at all took the display
// with it, silently.
//
// Here (helpers/fake-openai-contract.mjs holds each model to its contract):
//   - guest, free and Socria One each get a chart, a comparison table, a
//     flowchart, a Venn diagram, a checklist, a study plan and a custom
//     tracker, on the tier's own model, nothing refused;
//   - inline elements in the reply (a comparison, a chart, a diagram) are
//     drawn on every tier, near misses read as what they meant, junk dropped
//     rather than shown as braces; a deep turn on Sol streams;
//   - experiences and the easy view answer on every signed-in tier;
//   - RECOVERY: a map extraction that fails four ways still leaves the display
//     made; a draft that does not hold (invalid, the wrong kind, not JSON, cut
//     off) is repaired once and made; one that still does not hold, or an
//     honest decline, is said in a sentence and adds nothing; a model that is
//     not there steps down; a model that refuses "none" is asked again at low;
//     a higher effort still leaves the answer its room; an experience or a
//     photo that comes back unusable is asked once more.

import { build } from 'esbuild';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, createHmac } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-artifact-reliability');
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
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-contract.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
const ROUTES = { map: 'app/api/logos/map/route.ts', chat: 'app/api/logos/chat/route.ts', experience: 'app/api/logos/experience/route.ts', easy: 'app/api/logos/easy/route.ts' };
await Promise.all([
  ...Object.entries(ROUTES).map(([name, entry]) =>
    build({
      entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node',
      outfile: join(OUT, `${name}.mjs`), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
      external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
    })
  ),
  build({ entryPoints: [join(root, 'lib/objects/index.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'objects.mjs'), tsconfig: join(root, 'tsconfig.json'), logLevel: 'error' }),
]);

const logs = [];
const keep = (tag) => (...a) => logs.push(`${tag} ${a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}`);
console.info = keep('info');
console.warn = keep('warn');
console.error = keep('error');

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.CLERK_SECRET_KEY = 'sk_test_artifacts';
process.env.SOCRIA_ONE_USER_IDS = 'user_one';

const R = Object.fromEntries(await Promise.all(Object.keys(ROUTES).map(async (k) => [k, await import(pathToFileURL(join(OUT, `${k}.mjs`)).href)])));
const O = await import(pathToFileURL(join(OUT, 'objects.mjs')).href);
const F = await import(pathToFileURL(join(here, 'helpers', 'fake-openai-contract.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, process.stdout.write('  ok   ' + n + '\n')) : (fail++, process.stdout.write('  FAIL ' + n + '  ' + x + '\n')));
const J = (v) => JSON.stringify(v);

// ── a model that writes what each call asks for, correctly: only the contract (or a scripted fault) fails a call ──
const sys = (p) => (p.messages ?? []).filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
const last = (p) => {
  const m = (p.messages ?? []).at(-1);
  return typeof m?.content === 'string' ? m.content : '';
};
function exampleFrom(system) {
  const m = /- "([a-z]+)" — [\s\S]*?\n  Example: (\{.*\})\n/.exec(system);
  return m ? { kind: m[1], state: JSON.parse(m[2]) } : null;
}
const isDraft = (p) => /EVERYDAY DISPLAYS/.test(sys(p));
const isMap = (p) => /You extract the STRUCTURE/.test(sys(p));
const isRepair = (p) => /could not hold|was not JSON|cut off before it finished|is not one of the kinds listed|They asked for an? /.test(last(p));
const EXTRACTED = JSON.stringify({ nodes: [{ id: 'n1', label: 'What they asked for', type: 'concept' }], edges: [], context: 'planning', ask: { action: 'construct', artifact: 'display', topic: 'the request' } });
const MENU = { title: 'Rosa’s Kitchen', kind: 'menu', summary: 'A menu.', sections: [{ title: 'Mains', items: [{ name: 'Mushroom risotto', detail: 'parmesan, thyme', value: '$14.50' }, { name: 'Steak frites', value: '$24.00' }] }] };
let REPLY = 'Here it is.';
let FAULTS = {};
function content(p) {
  if (p.stream) return REPLY;
  if (isMap(p)) {
    if (FAULTS.map instanceof Error) throw FAULTS.map;
    return FAULTS.map ?? EXTRACTED;
  }
  if (isDraft(p)) {
    const ex = exampleFrom(sys(p));
    const good = JSON.stringify({ display: ex, gaps: [] });
    const repairing = isRepair(p);
    if (!repairing && FAULTS.draft !== undefined) return typeof FAULTS.draft === 'function' ? FAULTS.draft(ex) : FAULTS.draft;
    if (repairing && FAULTS.repair !== undefined) return typeof FAULTS.repair === 'function' ? FAULTS.repair(ex) : FAULTS.repair;
    return good;
  }
  if (/untangle|thoughts/i.test(sys(p)) && /JSON/.test(sys(p))) {
    if (!/Nothing in that could be used/.test(last(p)) && FAULTS.experience !== undefined) return FAULTS.experience;
    return JSON.stringify({ cats: [{ id: 't1', cat: 'task' }, { id: 't3', cat: 'commitment' }], groups: [{ name: 'Money', ids: ['t1'] }], ties: [] });
  }
  if ((p.messages ?? []).some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url'))) {
    if (!/could not be read as the shape|cut off/.test(last(p)) && FAULTS.easy !== undefined) return FAULTS.easy;
    return JSON.stringify(MENU);
  }
  return '{}';
}
globalThis.__contractContent = (p) => content(p);

// ── who is asking ──
const guestPass = (sessionId) => {
  const k = createHash('sha256').update(`socria.guest.v1|${process.env.CLERK_SECRET_KEY}`, 'utf8').digest();
  const body = `g.${sessionId}.${Date.now() + 86400000}`;
  return `${body}.${createHmac('sha256', k).update(body, 'utf8').digest('base64url')}`;
};
const TIERS = { guest: null, free: 'user_free', one: 'user_one' };
const OWN = { guest: 'gpt-4o-mini', free: 'gpt-6-luna', one: 'gpt-6.1-terra' };
let seq = 0;
async function post(route, body, tier, { faults = {}, env = {} } = {}) {
  globalThis.__uid = TIERS[tier];
  globalThis.__contractCalls = [];
  FAULTS = faults;
  logs.length = 0;
  const saved = {};
  for (const [k, v] of Object.entries(env)) (saved[k] = process.env[k]), (process.env[k] = v);
  const sessionId = `lg_art_${tier}_${++seq}`;
  const headers = { 'content-type': 'application/json' };
  if (tier === 'guest') headers.cookie = `socria_guest=${guestPass(sessionId)}`;
  try {
    const r = await R[route].POST(new NextRequest(`http://localhost/api/logos/${route}`, { method: 'POST', headers, body: JSON.stringify({ sessionId, ...body }) }));
    const ct = r.headers.get('content-type') || '';
    const json = ct.includes('json') ? await r.json() : null;
    const text = json ? '' : await r.text();
    return { status: r.status, json, text, calls: [...globalThis.__contractCalls], header: r.headers.get('x-socria-model') };
  } finally {
    for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
    FAULTS = {};
  }
}
const mapTurn = (said, tier, opts) => post('map', { messages: [{ role: 'user', content: said }], map: { nodes: [], edges: [] }, today: '2026-11-05' }, tier, opts);
const outcomes = (r) => r.calls.map((c) => `${c.model}:${c.outcome}`);
const objsOf = (r) => r.json?.map?.objects?.objs ?? [];

const ASKS = [
  ['a chart', 'Make a bar chart of my spending: rent 1200, food 400, transport 150', 'data'],
  ['a comparison table', 'Make a comparison table of the iPhone 16 and the Pixel 9', 'compare'],
  // a flowchart picked from the Make list is made in Artifacts; typed, it is the Logic Map's to draw (below)
  ['a flowchart', 'Make a flowchart: how to make a cup of tea', 'diagram'],
  ['a Venn diagram', 'Make a venn diagram of mitosis and meiosis', 'venn'],
  ['a checklist', 'Make me a checklist for moving house', 'plan'],
  ['a study plan', 'Make me a study plan for my history essay due next Friday', 'plan'],
  ['a custom tracker', 'Make me a habit tracker for exercise, reading and sleep', 'custom'],
];

for (const tier of Object.keys(TIERS)) {
  console.log(`\n=== ${tier}: everyday displays, on ${OWN[tier]} ===`);
  for (const [what, said, kind] of ASKS) {
    const r = await mapTurn(said, tier);
    const made = objsOf(r).find((o) => o.id === r.json?.display?.id);
    ok(`${what}: made, the kind asked for`, r.status === 200 && r.json?.display?.ok === true && made?.kind === kind, J({ status: r.status, display: r.json?.display }));
    ok(`  every call on ${OWN[tier]}, nothing refused`, r.calls.length > 0 && r.calls.every((c) => c.model === OWN[tier] && c.outcome === 'ok'), J(outcomes(r)));
  }
}

console.log('\n=== a diagram the Logic Map draws is not also made in Artifacts (Logos 5.5) ===');
for (const tier of Object.keys(TIERS)) {
  const r = await mapTurn('Make a flowchart of how to make a cup of tea', tier);
  const userOf = (p) => (p?.messages ?? []).filter((m) => m.role === 'user').map((m) => String(m.content ?? '')).join('\n');
  ok(`${tier}: no display drafted or made; the map pass is told the shape asked for`, r.status === 200 && !r.json?.display && objsOf(r).length === 0 && r.calls.some((c) => isMap(c.params) && /=== ASKED FOR THIS TURN ===/.test(userOf(c.params)) && /"kind": "process"/.test(userOf(c.params))) && !r.calls.some((c) => isDraft(c.params)), J({ status: r.status, display: r.json?.display, calls: outcomes(r) }));
}

console.log('\n=== how each tier is asked (lib/model-params.ts) ===');
{
  const free = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free');
  const sent = free.calls.map((c) => c.params);
  ok('free: Luna with reasoning off — max_completion_tokens, its temperature kept, no max_tokens', sent.every((p) => p.reasoning_effort === 'none' && p.max_tokens === undefined && typeof p.max_completion_tokens === 'number' && p.temperature === 0), J(sent.map((p) => ({ e: p.reasoning_effort, mt: p.max_tokens, mct: p.max_completion_tokens, t: p.temperature }))));
  const guest = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'guest');
  ok('guest: GPT-4o mini asked exactly as the route writes it', guest.calls.every((c) => c.params.max_tokens > 0 && c.params.reasoning_effort === undefined && c.params.max_completion_tokens === undefined));
  globalThis.__contractLatency = 5;
  const beside = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free');
  globalThis.__contractLatency = 0;
  ok('the display is drafted beside the map, not after it: asked while the extraction was still out', beside.calls.length === 2 && isMap(beside.calls[0].params) && isDraft(beside.calls[1].params) && beside.calls[1].overlapped === true && beside.json?.display?.ok === true, J(beside.calls.map((c) => ({ o: c.outcome, overlapped: c.overlapped }))));
}

console.log('\n=== a map that fails does not take the display with it ===');
for (const [what, fault] of [
  ['the extraction comes back empty', ''],
  ['the extraction comes back unreadable', 'Sorry — I could not do that.'],
  ['the extraction is refused outright (a prompt too long)', Object.assign(new Error("400 This model's maximum context length is 128000 tokens."), { status: 400, code: 'context_length_exceeded' })],
  ['every model on the ladder fails the extraction (503s)', Object.assign(new Error('503 The server is overloaded'), { status: 503 })],
]) {
  const r = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free', { faults: { map: fault } });
  const made = objsOf(r).find((o) => o.id === r.json?.display?.id);
  ok(`${what}: the comparison table is still made, and said`, r.status === 200 && r.json?.display?.ok === true && made?.kind === 'compare' && /comparison/i.test(r.json.display.says), J({ status: r.status, display: r.json?.display, calls: outcomes(r) }));
}

console.log('\n=== a draft that does not hold is repaired once ===');
{
  const cases = [
    ['a state the kind cannot hold', () => JSON.stringify({ display: { kind: 'compare', state: 'a table, roughly' } }), /could not hold/],
    ['the wrong kind', () => JSON.stringify({ display: { kind: 'venn', state: { title: 'x', sets: [] } } }), /They asked for a/],
    ['not JSON', () => 'Here is your table: iPhone vs Pixel…', /was not JSON/],
    ['a kind that does not exist', () => JSON.stringify({ display: { kind: 'flashcards', state: {} } }), /not one of the kinds listed/],
    ['cut off before it finished', (ex) => JSON.stringify({ display: ex, gaps: [] }).replace(/\}$/, '') + ' '.repeat(12000), /cut off/],
  ];
  for (const [what, draft, told] of cases) {
    const r = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free', { faults: { draft } });
    const drafts = r.calls.filter((c) => isDraft(c.params));
    const made = objsOf(r).find((o) => o.id === r.json?.display?.id);
    ok(`${what}: sent back once, told what was wrong, and made`, drafts.length === 2 && told.test(last(drafts[1].params)) && r.json?.display?.ok === true && made?.kind === 'compare', J({ display: r.json?.display, drafts: drafts.map((c) => c.outcome), told: last(drafts[1]?.params ?? {}).slice(0, 80) }));
  }
  const cutCall = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free', { faults: { draft: cases[4][1] } });
  const caps = cutCall.calls.filter((c) => isDraft(c.params)).map((c) => c.params.max_completion_tokens);
  ok('  cut off: the repair is given twice the room', caps.length === 2 && caps[1] === caps[0] * 2, J(caps));
  const still = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free', { faults: { draft: () => 'nope', repair: () => 'still nope' } });
  ok('still not holding after the repair: said in a sentence, nothing added, no third try', still.json?.display?.ok === false && still.json.display.failure === 'malformed' && !/[{}]/.test(still.json.display.says) && !objsOf(still).length && still.calls.filter((c) => isDraft(c.params)).length === 2, J(still.json?.display));
  const declined = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free', { faults: { draft: () => JSON.stringify({ none: 'Nothing has been said about either phone yet.' }) } });
  ok('an honest decline is not argued with: said in its words, one draft', declined.json?.display?.ok === false && /Nothing has been said about either phone yet/.test(declined.json.display.says) && declined.calls.filter((c) => isDraft(c.params)).length === 1, J(declined.json?.display));
  const repairedDecline = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free', { faults: { draft: () => 'not json', repair: () => JSON.stringify({ none: 'There is not enough here to compare.' }) } });
  ok('  a repair that declines honestly: its reason is the one said', /not enough here to compare/.test(repairedDecline.json?.display?.says ?? ''), J(repairedDecline.json?.display));
}

console.log('\n=== models that are not there, or not as known ===');
{
  globalThis.__contractUnavailable = ['gpt-6-luna'];
  const down = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free');
  globalThis.__contractUnavailable = [];
  ok('GPT-6 Luna not enabled on the account: GPT-5.6 Luna answers (asked as a reasoning model: low effort, room)', down.json?.display?.ok === true && down.calls.some((c) => c.model === 'gpt-6-luna' && /^404/.test(c.outcome)) && down.calls.filter((c) => c.outcome === 'ok').every((c) => c.model === 'gpt-5.6-luna' && c.params.reasoning_effort === 'low' && c.params.temperature === undefined), J(outcomes(down)));
  const efforts = F.CONTRACT['gpt-6-luna'].efforts;
  F.CONTRACT['gpt-6-luna'].efforts = ['low', 'medium', 'high'];
  const strict = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free');
  F.CONTRACT['gpt-6-luna'].efforts = efforts;
  ok('Luna refusing "none": asked again at low on Luna itself — no step down — and made', strict.json?.display?.ok === true && strict.calls.every((c) => c.model === 'gpt-6-luna') && strict.calls.some((c) => c.outcome === '400 reasoning_effort') && strict.calls.filter((c) => c.outcome === 'ok').length === 2, J(outcomes(strict)));
  const medium = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'free', { env: { OPENAI_REASONING_EFFORT: 'medium' } });
  ok('OPENAI_REASONING_EFFORT=medium: the reasoning gets its room, nothing comes back cut', medium.json?.display?.ok === true && medium.calls.every((c) => c.outcome === 'ok' && c.params.reasoning_effort === 'medium'), J(outcomes(medium)));
  const one = await mapTurn('Make a comparison table of the iPhone 16 and the Pixel 9', 'one', { faults: { map: Object.assign(new Error('503 overloaded'), { status: 503 }) } });
  ok('Socria One’s map failing on Terra steps down its own ladder, never to a free model', one.calls.filter((c) => isMap(c.params)).every((c) => ['gpt-6.1-terra', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-4o'].includes(c.model)) && one.json?.display?.ok === true, J(outcomes(one)));
}

console.log('\n=== inline elements in the reply, every tier ===');
const COMPARE = '```ui\n{"type":"compare","options":["iPhone 16","Pixel 9"],"rows":[{"label":"Camera","values":["Strong video","Strong stills"]},{"label":"Software","values":["iOS","Android"]}]}\n```\nThe split is software and camera style.';
const chatTurn = (said, tier, reply, opts) => {
  REPLY = reply;
  return post('chat', { messages: [{ role: 'user', content: said }] }, tier, opts);
};
const drawn = (r, type) => {
  const blocks = [...(r.text || '').matchAll(/```ui\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
  return blocks.find((b) => b.type === type) ?? null;
};
for (const tier of Object.keys(TIERS)) {
  const r = await chatTurn('Compare the iPhone 16 and the Pixel 9 side by side', tier, COMPARE);
  ok(`${tier}: a comparison drawn, on ${OWN[tier]}, nothing refused`, r.status === 200 && drawn(r, 'compare')?.options?.length === 2 && r.header === `${tier}/standard/${OWN[tier]}` && r.calls.filter((c) => c.params.stream).every((c) => c.outcome === 'ok'), J({ status: r.status, header: r.header, calls: outcomes(r), text: r.text.slice(0, 120) }));
}
{
  const r = await chatTurn('Prove step by step that the sum of two even numbers is even', 'one', 'Write them as 2a and 2b.\n\n```ui\n{"type":"diagram","view":"flow","title":"Why it is even","nodes":[{"id":"a","label":"2a + 2b"},{"id":"b","label":"2(a + b)"},{"id":"c","label":"Even"}],"edges":[["a","b"],["b","c"]]}\n```');
  const sent = r.calls.find((c) => c.params.stream)?.params;
  ok('a deep turn on Socria One: GPT-6.1 Sol, low effort, no temperature, and its diagram drawn', r.header === 'one/deep/gpt-6.1-sol' && sent?.reasoning_effort === 'low' && sent.temperature === undefined && !!drawn(r, 'diagram'), J({ header: r.header, sent: sent && { e: sent.reasoning_effort, t: sent.temperature }, text: r.text.slice(0, 160) }));
}
{
  const said = 'Chart my spending: rent 1200, food 400, transport 150';
  const bar = await chatTurn(said, 'free', 'Rent is most of it.\n\n```ui\n{"type":"bar","title":"Spending","labels":["Rent","Food","Transport"],"data":["1,200","400","150"],"basis":"given"}\n```');
  const chart = drawn(bar, 'chart');
  ok('a near miss — "type": "bar", "labels", numbers as strings — drawn as the chart it meant, in the grammar', chart?.kind === 'bar' && J(chart.x) === J(['Rent', 'Food', 'Transport']) && J(chart.series[0].values) === J([1200, 400, 150]), J(chart ?? bar.text.slice(0, 200)));
  const cols = await chatTurn('Compare the iPhone 16 and the Pixel 9 side by side', 'free', '```ui\n{"type":"comparison","columns":["Feature","iPhone 16","Pixel 9"],"rows":[["Camera","Strong video","Strong stills"],["Software","iOS","Android"]]}\n```');
  const c = drawn(cols, 'compare');
  ok('a comparison with a header column and rows as arrays: drawn, the header column read as such', J(c?.options) === J(['iPhone 16', 'Pixel 9']) && c.rows.length === 2 && c.rows[0].label === 'Camera', J(c ?? cols.text.slice(0, 200)));
  const objs = await chatTurn('Compare the iPhone 16 and the Pixel 9 side by side', 'free', '```ui\n{"type":"compare","options":[{"name":"iPhone 16","camera":"Strong video","software":"iOS"},{"name":"Pixel 9","camera":"Strong stills","software":"Android"}]}\n```');
  const o = drawn(objs, 'compare');
  ok('options written as objects, a field per point: pivoted into rows', J(o?.options) === J(['iPhone 16', 'Pixel 9']) && o.rows.map((x) => x.label).join() === 'Camera,Software', J(o ?? objs.text.slice(0, 200)));
  const fence = await chatTurn('Compare the iPhone 16 and the Pixel 9 side by side', 'free', COMPARE.replace('```ui', '```socria-ui'));
  ok('an element in a fence called something else ("socria-ui"): drawn, not shown as code', !!drawn(fence, 'compare') && !/socria-ui/.test(fence.text), fence.text.slice(0, 120));
  const junk = await chatTurn('Compare the iPhone 16 and the Pixel 9 side by side', 'free', 'Here.\n\n```ui\n{"type":"compare","options":["iPhone 16"\n```\nThe split is software.');
  ok('a broken element is left out — never a wall of braces — and the words around it stay', !/```ui/.test(junk.text) && !/\{"type"/.test(junk.text) && /The split is software/.test(junk.text), junk.text.slice(0, 160));
}

console.log('\n=== experiences and the easy view, every signed-in tier ===');
{
  let ut = O.create(O.EMPTY_SPACE, 'untangle', { dump: 'pay rent; call mom; finish essay' }, { origin: 'person', name: 'UT0' }).space;
  ut = O.apply(ut, ut.objs[0].id, 'separate', {}, { by: 'person' }).space;
  const state = O.currentOf(ut.objs[0]);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  for (const tier of ['free', 'one']) {
    const e = await post('experience', { kind: 'untangle', action: 'sort', state }, tier);
    ok(`${tier}: an experience answers (it failed for every signed-in tier), on ${OWN[tier]}`, e.status === 200 && e.json?.ops?.length > 0 && e.calls.every((c) => c.model === OWN[tier] && c.outcome === 'ok'), J({ status: e.status, json: e.json, calls: outcomes(e) }));
    const er = await post('experience', { kind: 'untangle', action: 'sort', state }, tier, { faults: { experience: 'not json' } });
    ok(`${tier}:   unusable the first time: asked once more, and answered`, er.status === 200 && er.json?.ops?.length > 0 && er.calls.length === 2, J({ status: er.status, calls: outcomes(er) }));
    const easy = await post('easy', { image: png, said: 'what does this menu say' }, tier);
    ok(`${tier}: the easy view reads the photo (it failed for every signed-in tier), on ${OWN[tier]}`, easy.status === 200 && easy.json?.easy?.kind === 'menu' && easy.calls.every((c) => c.model === OWN[tier] && c.outcome === 'ok'), J({ status: easy.status, json: easy.json, calls: outcomes(easy) }));
    const easyR = await post('easy', { image: png, said: 'what does this menu say' }, tier, { faults: { easy: 'I see a menu.' } });
    ok(`${tier}:   unreadable the first time: read once more, and answered`, easyR.status === 200 && easyR.json?.easy?.kind === 'menu' && easyR.calls.length === 2, J({ status: easyR.status, calls: outcomes(easyR) }));
  }
  const never = await post('experience', { kind: 'untangle', action: 'sort', state }, 'free', { faults: { experience: 'not json' } });
  ok('  (a model that never answers usably is not made up for: two tries, then said)', never.status === 200 || never.status === 422);
}

console.log('\n=== the page says so when a make fails outright (components/LogosApp.tsx) ===');
{
  const app = readFileSync(join(root, 'components', 'LogosApp.tsx'), 'utf8');
  ok('a turn that asked for something to be made is known (the same reader as the server)', /const askedToMake = !!\(lastAsk && typeof lastAsk\.content === 'string' && readDisplayRequest\(lastAsk\.content\)\)/.test(app));
  ok('  a failed pass (a 5xx, a time limit) says it was not made', /if \(!res\.ok && res\.status !== 402 && res\.status !== 503\) \{\s*if \(askedToMake && forSession === activeIdRef\.current\) setBuildNote\(MAKE_FAILED\);/.test(app));
  ok('  and so does a pass that never answered', /\} catch \{[\s\S]{0,300}if \(askedToMake && forSession === activeIdRef\.current\) setBuildNote\(MAKE_FAILED\);/.test(app));
}

console.log(`\nartifact-reliability-e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
