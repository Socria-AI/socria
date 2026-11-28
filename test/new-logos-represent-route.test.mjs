// NEW LOGOS — THE REPRESENTATION ROUTES, END TO END (docs/NEW-LOGOS.md, "Representations").
//
// The turn route (POST /api/new-logos/represent), the representation's own routes (read, the person's changes,
// undo) and the existing conversations route, bundled with the fake database, the fake Clerk and a scripted model, so
// what is checked is what production runs:
//   • a turn becomes operations on the representation, never a reply: the person's message is taken in, the record
//     for the conversation is built from the items, and the representation is kept per person and conversation;
//   • the assistant is told what the representation holds (with ids), what was said elsewhere and not yet
//     represented, what is pointed at, and passages (never whole documents) of the documents named;
//   • its answer is read leniently and applied strictly; an unreadable answer is asked for once more, and an answer
//     that leaves nothing to show is never saved; a model that is down changes nothing;
//   • the person's changes are made on the version they saw (stale: refused with the current state); undo reverses
//     exactly; another account reads nothing and changes nothing; before the migration, { setup: false };
//   • it is gated as every route that asks a model for the person (statically: the trial's gate, the meter, the
//     month's conversations, the rate limit, the takeover list).

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'represent-route');
const H = (f) => join(here, 'helpers', f);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(H('fake-supabase.mjs')).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(H('fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(H('fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: H('server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
const ROUTES = [
  ['convs', 'app/api/conversations/route.ts'],
  ['turn', 'app/api/new-logos/represent/route.ts'],
  ['rep', 'app/api/new-logos/representations/route.ts'],
  ['undo', 'app/api/new-logos/representations/undo/route.ts'],
  ['nodes', 'app/api/new-logos/nodes/route.ts'],
  ['srcs', 'app/api/new-logos/sources/route.ts'],
];
for (const [name, file] of ROUTES)
  await build({ entryPoints: [join(root, file)], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, `${name}.mjs`), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error' });
const quiet = () => {};
console.error = quiet;
console.warn = quiet;
console.info = quiet;
process.env.RATE_LIMIT_DISABLED = '1';
process.env.OPENAI_API_KEY = 'test';

const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
const { NextRequest } = await import('next/server.js');
const X = await import('./.tmp/new-logos-under-test.mjs');
const R = {};
for (const [name] of ROUTES) R[name] = await import(pathToFileURL(join(OUT, `${name}.mjs`)).href);

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
globalThis.__users = { una: { firstName: 'Una', emails: ['una@example.com'] }, vic: { firstName: 'Vic', emails: ['vic@example.com'] } };
const as = (u) => (globalThis.__uid = u);
const req = (method, url, body) => new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = async (fn, method, url, body, params) => {
  const r = await fn(req(method, url, body), params ? { params } : undefined);
  return { status: r.status, json: await r.json().catch(() => null) };
};
const script = (...answers) => {
  globalThis.__logosScript = answers;
  globalThis.__logosCalls = [];
  globalThis.__logosOptions = [];
};
const calls = () => globalThis.__logosCalls ?? [];
const userOf = (c) => c?.messages?.find((m) => m.role === 'user')?.content ?? '';
const putConv = (conversation) => call(R.convs.PUT, 'PUT', '/api/conversations', { conversation });
const turn = (body) => call(R.turn.POST, 'POST', '/api/new-logos/represent', body);
// a conversation's workspace by its id; any workspace by its key (c:… or o:…)
const keyOf = (id) => (/^(c|o):/.test(id) ? id : `c:${id}`);
const getRep = (id) => call(R.rep.GET, 'GET', `/api/new-logos/representations?key=${encodeURIComponent(keyOf(id))}`);
const ops = (id, b) => call(R.rep.POST, 'POST', '/api/new-logos/representations', { key: keyOf(id), ...b });
const undo = (id, entry) => call(R.undo.POST, 'POST', '/api/new-logos/representations/undo', { key: keyOf(id), entry });
const t0 = 1_700_000_000_000;

const FIRST = {
  read: { kind: 'interpersonal', goal: 'why she left her partner for him', needs: 'explore' },
  ops: [
    { op: 'add', id: 'q_main', kind: 'question', text: 'Why did she cheat on her boyfriend to get with me?' },
    { op: 'add', id: 'o_overlap', kind: 'observation', from: 'person', text: 'She began seeing you while still with him.' },
    { op: 'add', id: 'h_attraction', kind: 'hypothesis', text: 'Attraction to you', detail: 'A strong pull to someone new.', near: 'q_main' },
    { op: 'add', id: 'h_unhappy', kind: 'hypothesis', text: 'Unhappy in that relationship' },
    { op: 'add', id: 'h_avoid', kind: 'hypothesis', text: 'Avoiding a hard conversation' },
    { op: 'relate', from: 'h_attraction', to: 'o_overlap', kind: 'explains' },
    { op: 'relate', from: 'h_unhappy', to: 'o_overlap', kind: 'explains' },
    { op: 'add', id: 'u_long', kind: 'unknown', text: 'How long had things been difficult between them?' },
    { op: 'add', id: 'c_only', kind: 'caveat', weight: 'important', text: 'Only she knows her reasons.' },
  ],
  alternatives: [{ label: 'As a timeline', ask: 'Show how it unfolded' }],
};

console.log('=== signed out, and before the migration ===');
{
  db.reset();
  as(null);
  ok('a turn: 401', (await turn({ conversationId: 'lg_x', message: { id: 'm_1', content: 'Hi' } })).status === 401);
  ok('reading and changing: 401', (await getRep('lg_x')).status === 401 && (await ops('lg_x', { ops: [], version: 0 })).status === 401 && (await undo('lg_x', 'b1')).status === 401);
  as('una');
  await putConv({ id: 'lg_pre', title: 'Before', messages: [{ id: 'm_pre1', at: t0, role: 'user', content: 'Why?' }], updatedAt: t0, base: null, known: false });
  db.absent.add('nl_representations');
  const g = await getRep('lg_pre');
  ok('reading answers setup:false (200), not an error', g.status === 200 && g.json.setup === false);
  ok('changing answers setup:false (503)', (await ops('lg_pre', { ops: [{ op: 'add', item: { kind: 'question', text: 'x' } }], version: 0 })).status === 503);
  script(FIRST);
  const t = await turn({ conversationId: 'lg_pre', message: { id: 'm_pre1', content: 'Why?' } });
  ok('a turn answers setup:false (503) and asks no model', t.status === 503 && t.json.setup === false && calls().length === 0, JSON.stringify(t.json));
}

let entry1;
console.log('\n=== a first turn: a representation, not a reply ===');
{
  db.reset();
  as('una');
  const said = 'Why did she cheat on her boyfriend to get with me?';
  await putConv({ id: 'lg_rel', title: 'Her', messages: [{ id: 'm_ask1', at: t0, role: 'user', content: said }], updatedAt: t0, base: null, known: false });
  script('```json\n' + JSON.stringify(FIRST).replace(/}]/, '},]') + '\n```');
  const t = await turn({ conversationId: 'lg_rel', message: { id: 'm_ask1', content: said }, history: [{ id: 'm_ask1', role: 'user', content: said }] });
  ok('the turn is taken in (fenced, with a trailing comma)', t.status === 200 && t.json.ok, JSON.stringify(t.json).slice(0, 300));
  const rep = t.json.representation;
  ok('the representation holds what was asked for', rep.items.length === 7 && rep.relations.length === 2 && rep.items.filter((i) => i.kind === 'hypothesis').length === 3);
  ok('…the person’s message taken in', rep.turns.includes('m_ask1'));
  ok('…kept per person and conversation, at version 1', t.json.version === 1 && db.rows('nl_representations').length === 1 && db.rows('nl_representations')[0].user_id === 'una');
  ok('the record for the conversation is built from the items: possibilities marked as such', /\*\*Possibilities\*\* \(not established\)/.test(t.json.record) && /What would help/.test(t.json.record));
  ok('how the turn was read, and the change in words', t.json.entry.read === 'interpersonal: why she left her partner for him' && /Added .*3 possibilities/.test(t.json.entry.summary), JSON.stringify(t.json.entry));
  ok('where new items belong is said for the canvas', t.json.near.some(([id, n]) => id === 'h_attraction' && n === 'q_main'));
  ok('other views are offered, quietly', t.json.alternatives.length === 1 && t.json.alternatives[0].label === 'As a timeline');
  const c = calls()[0];
  ok('one model call: JSON, the representation instructions, within a time limit', calls().length === 1 && c.response_format?.type === 'json_object' && /You maintain a REPRESENTATION/.test(c.messages[0].content) && globalThis.__logosOptions[0]?.timeout > 0);
  ok('…told the representation is empty and what the person says', /The representation is empty/.test(userOf(c)) && userOf(c).includes(said));
  entry1 = t.json.entry.id;
  const g = await getRep('lg_rel');
  ok('reading it back gives the same, with the log in words (never before-images)', g.json.version === 1 && g.json.representation.items.length === 7 && g.json.log.length === 1 && !('before' in g.json.log[0]));
}

let v2;
console.log('\n=== a second turn revises ===');
{
  as('una');
  const said = 'She told me she had been unhappy for months.';
  script({
    read: { kind: 'interpersonal', goal: 'update' },
    ops: [
      { op: 'add', id: 'o_unhappy', kind: 'evidence', from: 'user', text: said },
      { op: 'answer', id: 'u_long', answer: 'Months, by her account.' },
      { op: 'update', id: 'h_unhappy', status: 'more likely', because: 'She said so.' },
      { op: 'connect', from: 'o_unhappy', to: 'h_unhappy', kind: 'supports', status: 'established' },
    ],
  });
  const history = [
    { id: 'm_ask1', role: 'user', content: 'Why did she cheat on her boyfriend to get with me?' },
    { id: 'm_rep1', role: 'assistant', content: 'record of the first turn' },
    { id: 'm_ask2', role: 'user', content: said },
  ];
  const t = await turn({ conversationId: 'lg_rel', message: { id: 'm_ask2', content: said }, history });
  ok('the second turn is taken in', t.status === 200, JSON.stringify(t.json).slice(0, 300));
  const rep = t.json.representation;
  ok('one observation added; the rest revised in place', rep.items.length === 8 && X.Rep.itemById(rep, 'h_unhappy').status === 'stronger' && X.Rep.itemById(rep, 'u_long').answer === 'Months, by her account.');
  ok('the record is the change', /\*\*Revised\*\*/.test(t.json.record) && !/Attraction to you/.test(t.json.record), t.json.record);
  const u = userOf(calls()[0]);
  ok('the assistant is told what is there, with ids and standings', /h_attraction · possibility \(open\) · "Attraction to you"/.test(u) && /u_long · open question/.test(u), u.slice(0, 600));
  ok('…and the last represented turns, for continuity', /MOST RECENT TURNS \(already represented\)/.test(u) && !/EARLIER IN THE CONVERSATION/.test(u));
  v2 = t.json.version;
}

console.log('\n=== what the person changes, and undo ===');
{
  as('una');
  const stale = await ops('lg_rel', { ops: [{ op: 'status', id: 'h_avoid', status: 'ruled_out', because: 'She talked to him first.' }], version: 1 });
  ok('a change made on a stale version is refused, with the current state to merge', stale.status === 409 && stale.json.code === 'conflict' && stale.json.version === v2 && stale.json.representation.items.length === 8);
  const mine = await ops('lg_rel', { ops: [{ op: 'status', id: 'h_avoid', status: 'ruled_out', because: 'She talked to him first.' }, { op: 'add', item: { id: 'h_mine', kind: 'hypothesis', text: 'She wanted a way out anyway' } }], version: v2 });
  ok('the person’s changes apply on the version they saw', mine.status === 200 && X.Rep.itemById(mine.json.representation, 'h_avoid').status === 'ruled_out' && X.Rep.itemById(mine.json.representation, 'h_mine').by === 'person');
  ok('…and are logged in words', /Ruled out ‘Avoiding a hard conversation’/.test(mine.json.entry.summary), mine.json.entry.summary);
  const bad = await ops('lg_rel', { ops: [{ op: 'turn', message: 'm_fake' }], version: mine.json.version });
  ok('the person cannot mark a message as taken in', bad.status === 400);
  const back = await undo('lg_rel', mine.json.entry.id);
  ok('undo reverses exactly', back.status === 200 && !X.Rep.itemById(back.json.representation, 'h_mine') && X.Rep.itemById(back.json.representation, 'h_avoid').status === 'open' && /^Undid/.test(back.json.entry.summary));
  const toStart = await undo('lg_rel', entry1);
  ok('back to before the first turn: empty again', toStart.status === 200 && toStart.json.representation.items.length === 0, JSON.stringify(toStart.json).slice(0, 200));
  ok('an entry no longer in the history is refused', (await undo('lg_rel', 'bnothere')).status === 404);
}

console.log('\n=== an objective’s workspace ===');
{
  as('una');
  const made = await call(R.nodes.POST, 'POST', '/api/new-logos/nodes', { type: 'objective', title: 'Market research' });
  const oid = made.json.node.id;
  const key = `o:${oid}`;
  const empty = await getRep(key);
  ok('an objective’s workspace starts empty', empty.status === 200 && empty.json.version === 0 && empty.json.representation.items.length === 0);
  const add = await ops(key, { ops: [{ op: 'add', item: { id: 'v_price', kind: 'variable', name: 'price', value: 20, min: 0, max: 50, text: 'Price' } }, { op: 'add', item: { id: 'v_customers', kind: 'variable', name: 'customers', value: 300, min: 0, max: 2000, text: 'Customers' } }, { op: 'add', item: { id: 'mrr', kind: 'equation', expr: 'mrr = price * customers', text: 'Monthly recurring revenue' } }, { op: 'add', item: { id: 'm_mrr', kind: 'metric', text: 'Monthly recurring revenue', expr: 'mrr', unit: '£' } }], version: 0 });
  ok('components are made in it directly, by the person, with no assistant', add.status === 200 && add.json.representation.items.length === 4 && add.json.representation.items.every((i) => i.by === 'person'), JSON.stringify(add.json).slice(0, 300));
  const v = X.RepOps.valuesOf(X.Rep.sanitizeRepresentation(add.json.representation)).values;
  ok('…and compute as one model (price × customers = recurring revenue)', v.mrr === 6000 && v['metric:m_mrr'] === 6000, JSON.stringify(v));
  const moved = await ops(key, { ops: [{ op: 'model', ops: [{ op: 'var.set', name: 'customers', value: 500 }] }], version: add.json.version });
  ok('changing an input changes the result, with no assistant', moved.status === 200 && X.RepOps.valuesOf(X.Rep.sanitizeRepresentation(moved.json.representation)).values['metric:m_mrr'] === 10_000);
  ok('the assistant takes no turns in an objective’s workspace (turns belong to conversations)', (await turn({ conversationId: `o:${oid}`, message: { id: 'm_x', content: 'x' } })).status === 400);
  as('vic');
  ok('another account reads nothing of it and changes nothing', (await getRep(key)).json.version === 0 && (await ops(key, { ops: [{ op: 'add', item: { kind: 'question', text: 'Mine?' } }], version: 0 })).status === 404);
  as('una');
  ok('a workspace that is not an objective of theirs is refused', (await ops('o:n_nothere', { ops: [{ op: 'add', item: { kind: 'question', text: 'x' } }], version: 0 })).status === 404 && (await getRep('x:lg_rel')).status === 400);
}

console.log('\n=== another account ===');
{
  as('vic');
  const g = await getRep('lg_rel');
  ok('reads nothing of it', g.status === 200 && g.json.version === 0 && g.json.representation.items.length === 0);
  ok('changes nothing', (await ops('lg_rel', { ops: [{ op: 'add', item: { kind: 'question', text: 'Mine?' } }], version: 0 })).status === 404);
  script(FIRST);
  const t = await turn({ conversationId: 'lg_rel', message: { id: 'm_ask9', content: 'Why?' } });
  ok('takes no turn in it, and no model is asked', t.status === 404 && calls().length === 0);
  ok('undoes nothing', (await undo('lg_rel', entry1)).status === 404);
}

console.log('\n=== what was said elsewhere, pointing, documents ===');
{
  as('una');
  const old = [
    { id: 'm_o1', at: t0, role: 'user', content: 'I am choosing between selling to shops and selling online.' },
    { id: 'm_o2', at: t0 + 1, role: 'assistant', content: 'Shops give reach; online gives margin.' },
  ];
  await putConv({ id: 'lg_biz', title: 'Channels', messages: [...old, { id: 'm_o3', at: t0 + 2, role: 'user', content: 'Which should I pick?' }], updatedAt: t0 + 2, base: null, known: false });
  const reading = X.sanitizeSourceDoc(X.readPlain('Plan.md', '# Plan\n\n## Pricing\n\nEach kit sells for £24 wholesale.\n\n## Risks\n\nShops pay late.', { id: 'fedcba9876543210' }).doc);
  const src = await call(R.srcs.POST, 'POST', '/api/new-logos/sources', { name: 'Plan.md', mime: 'text/markdown', size: 99, fileId: 'd'.repeat(32), reading });
  const sid = src.json.source.id;
  script({ read: { kind: 'decision', goal: 'pick a channel' }, ops: [{ op: 'add', id: 'q_pick', kind: 'question', text: 'Which channel should I pick?' }, { op: 'add', id: 's_price', kind: 'statement', basis: 'sourced', text: 'A kit sells for £24 wholesale.', cites: [{ sourceId: sid, passage: 'p1.4' }] }] });
  const t = await turn({
    conversationId: 'lg_biz',
    message: { id: 'm_o3', content: 'Which should I pick?' },
    history: old.map(({ id, role, content }) => ({ id, role, content })),
    about: { label: 'Pricing model', of: 'this workspace', lines: ['price = 24', 'cost = 18'] },
    sourceIds: [sid],
  });
  ok('the turn is taken in', t.status === 200, JSON.stringify(t.json).slice(0, 300));
  const u = userOf(calls()[0]);
  ok('what was said elsewhere and not yet represented is given to take in', /EARLIER IN THE CONVERSATION \(not yet represented/.test(u) && u.includes('selling to shops'));
  ok('what the person points at is said', /THE PERSON IS POINTING AT: Pricing model/.test(u) && u.includes('- price = 24'));
  ok('documents come as passages with their ids, not whole', new RegExp(`SOURCE ${sid} "Plan.md"`).test(u) && /\[p\d+\.\d+\] Each kit sells for £24 wholesale\./.test(u), u.slice(u.indexOf('DOCUMENTS'), u.indexOf('DOCUMENTS') + 400));
  ok('what was said elsewhere is taken in with the turn, so it is not shown again as unrepresented', t.json.representation.turns.includes('m_o1') && t.json.representation.turns.includes('m_o3'));
  ok('a statement from a document keeps its citation', (X.Rep.itemById(t.json.representation, 's_price').cites ?? [])[0]?.sourceId === sid);
}

console.log('\n=== answers that cannot be used ===');
{
  as('una');
  await putConv({ id: 'lg_bad', title: 'Bad', messages: [{ id: 'm_b1', at: t0, role: 'user', content: 'What is 2 + 2?' }], updatedAt: t0, base: null, known: false });
  script('Four, obviously.', JSON.stringify({ read: { kind: 'factual' }, ops: [{ op: 'add', id: 'q', kind: 'question', text: 'What is 2 + 2?' }, { op: 'add', id: 'a', kind: 'answer', basis: 'known', text: '4.' }] }));
  const t = await turn({ conversationId: 'lg_bad', message: { id: 'm_b1', content: 'What is 2 + 2?' } });
  ok('an unreadable answer is asked for once more, and the second is used', t.status === 200 && calls().length === 2 && t.json.representation.items.length === 2 && t.json.record === '4.', JSON.stringify(t.json).slice(0, 200));
  ok('…the second ask shows what was sent and asks for the object', calls()[1].messages.length === 4 && /could not be read/.test(calls()[1].messages[3].content));
  await putConv({ id: 'lg_bad2', title: 'Bad 2', messages: [{ id: 'm_b2', at: t0, role: 'user', content: 'Hello?' }], updatedAt: t0, base: null, known: false });
  script('No JSON here.', '{"ops": [{"op": "add", "kind": "question"}]}');
  const t2 = await turn({ conversationId: 'lg_bad2', message: { id: 'm_b2', content: 'Hello?' } });
  ok('two answers that leave nothing to show: refused in neutral words, nothing saved', t2.status === 502 && /could not be used/.test(t2.json.error) && !db.rows('nl_representations').some((r) => r.key === 'c:lg_bad2'), JSON.stringify(t2.json));
  script(Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' }), Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' }), Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' }));
  const t3 = await turn({ conversationId: 'lg_bad2', message: { id: 'm_b2', content: 'Hello?' } });
  ok('a model that is down: a neutral failure that names no provider, nothing saved', t3.status >= 500 && !/openai|gpt|model_not_found/i.test(JSON.stringify(t3.json)) && !db.rows('nl_representations').some((r) => r.key === 'c:lg_bad2'), JSON.stringify(t3.json));
  ok('a message that is too long is refused before any model', (await turn({ conversationId: 'lg_bad2', message: { id: 'm_b3', content: 'x'.repeat(12_001) } })).status === 413);
  ok('a malformed turn is refused', (await turn({ conversationId: 'lg bad', message: { id: 'm_b3', content: 'x' } })).status === 400 && (await turn({ conversationId: 'lg_bad2', message: { id: '', content: 'x' } })).status === 400);
}

console.log('\n=== gated as every route that asks a model for the person ===');
{
  const src = readFileSync(join(root, 'app/api/new-logos/represent/route.ts'), 'utf8');
  ok('the trial’s gate, word for word', /const sleep = await sleepGate\(req, userId[^)]*\);\s*if \(sleep\.refuse\) return sleep\.refuse;\s*if \(sleep\.meter\) meterFor\(sleep\.meter\);/.test(src));
  ok('metered in a context of its own, and a refusal mid-request said as resting', /export const POST = withMeter\(async function POST\(/.test(src) && /sleepAnswer\(e\)/.test(src));
  ok('rate-limited as a chat turn', /enforceRateLimit\(req, userId, 'chat'\)/.test(src));
  ok('a new conversation counted against the month’s conversations, once, as the chat route counts it', /chatAlreadyCounted\(userId, convId\)/.test(src) && /checkAllowance\(userId, plan, 'chats'\)/.test(src) && /claimUnit\(userId, plan, 'chats', convId\)/.test(src));
  ok('the second attempt is ours: uncounted', /uncounted\(\(\) => firstAccepted\(/.test(src));
  ok('behind the takeover gate with the other routes that think', /'\/api\/new-logos\/represent'/.test(readFileSync(join(root, 'lib/takeover.ts'), 'utf8')));
  ok('the person’s message is saved before the turn is asked (the route takes in a message already in the conversation)', /owns\(userId, key\)/.test(src));
}

console.log(`\nnew-logos-represent-route: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
