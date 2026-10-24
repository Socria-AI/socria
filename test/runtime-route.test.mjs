// THE LOGOS RUNTIME THROUGH THE REAL ROUTE (app/api/logos/chat).
//
// What is held down, with only the database, Clerk and the model replaced
// (fake-openai-logos records what the model was sent and streams a scripted
// reply) and the search provider answered by a stubbed fetch:
//   • the Logos 5 persona speaks by default; LOGOS_PERSONA=classic and
//     LOGOS_RUNTIME=off bring back the Logos 3.5 prompt — the rollback works;
//   • the turn's block says who does what (Core 4's split) and the move;
//   • the system message is the same from one turn to the next, blocks and all;
//   • the history window moves in steps, not one message at a time;
//   • a citation that names nothing, and a deep link no source carried, never
//     reach the person — on the streamed path and the held one;
//   • a lookup that is wanted runs through Core 4's gate, its sources are given
//     to the reply and shown to the person; one that cannot run is said so;
//   • the reply's claims are counted in the log, never their content;
//   • an "ok" is not sent to the memory extractor.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemOf, turnsOf } from './helpers/prompt.mjs';
import * as D from './.tmp/docs-under-test.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-runtime');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: [join(root, 'app/api/logos/chat/route.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, 'chat.mjs'),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [
    {
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
    },
  ],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'],
  logLevel: 'error',
});

const logged = [];
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[epistemic]')) return void logged.push(first);
  if (/^\[(socria|logos|core4|tokens|search)/.test(first) || first.startsWith('logos') || first.startsWith('conversations')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_runtime';
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const U = (content, extra = {}) => ({ role: 'user', content, ...extra });
/** The turn's own block — the core prompt also explains "Theirs:" in general. */
const turnBlock = (sys) => (sys.includes('=== This turn ===') ? sys.slice(sys.indexOf('=== This turn ===')) : '');
const A = (content) => ({ role: 'assistant', content });

/** One turn: what the reply model was sent, what reached the person, the headers. */
async function turn(body, { reply = 'Noted.', script = [], env = {} } = {}) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    globalThis.__logosCalls = [];
    globalThis.__logosPrompts = [];
    globalThis.__logosReply = reply;
    globalThis.__logosScript = [...script];
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    const received = await r.text().catch(() => '');
    await new Promise((ok) => setTimeout(ok, 30));
    const calls = globalThis.__logosCalls;
    const streamed = calls.find((c) => c.stream);
    return { status: r.status, received, headers: r.headers, sent: streamed?.messages ?? [], system: systemOf(streamed), first: String(streamed?.messages?.[0]?.content ?? ''), turns: turnsOf(streamed), calls };
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

console.log('\n=== the persona, and taking it back ===');
{
  const v5 = await turn({ messages: [U('We should launch in March.')] });
  ok('Logos 5 speaks by default', v5.status === 200 && /^You are Socria\. People come to you to think out loud/.test(v5.first) && /READ THE ROOM/.test(v5.first) && !/You are the mirror/.test(v5.first), v5.first.slice(0, 120));
  ok('  and says so in the trace, with the exchange it read', /^logos5-v2;path=standard;intent=conversation;/.test(v5.headers.get('x-socria-runtime') ?? '') && /;exchange=conversation;/.test(v5.headers.get('x-socria-runtime') ?? ''), v5.headers.get('x-socria-runtime'));
  const classic = await turn({ messages: [U('We should launch in March.')] }, { env: { LOGOS_PERSONA: 'classic' } });
  ok('LOGOS_PERSONA=classic: the Logos 3.5 prompt, the rest of the runtime kept', /You are the mirror/.test(classic.first) && /^classic;/.test(classic.headers.get('x-socria-runtime') ?? ''), classic.headers.get('x-socria-runtime'));
  const off = await turn({ messages: [U('We should launch in March.')] }, { env: { LOGOS_RUNTIME: 'off' } });
  ok('LOGOS_RUNTIME=off: the route as it was — no runtime at all', /You are the mirror/.test(off.first) && off.headers.get('x-socria-runtime') === null && !/=== This turn ===/.test(off.system));
}

console.log('\n=== who does what, this turn ===');
{
  const d = await turn({ messages: [U('Should I take the job in Berlin or stay where I am?')] });
  ok('a decision: the split keeps it theirs, and says so to the reply', /Theirs: the decision/.test(turnBlock(d.system)) && /judgment:human/.test(d.headers.get('x-socria-runtime') ?? ''), d.headers.get('x-socria-runtime'));
  ok('  the move inside it is the Logos 4 engine\'s — and nothing is said to be built', /How to help on this turn/.test(turnBlock(d.system)) && /PERSPECTIVE/.test(turnBlock(d.system)) && !/CONSTRUCT/.test(turnBlock(d.system)), turnBlock(d.system));
  const f = await turn({ messages: [U('What year did the Berlin Wall fall?')] });
  ok('a fact: performed directly, nothing kept back', !/Theirs:/.test(turnBlock(f.system)) && /INFORM/.test(turnBlock(f.system)) && /work=information/.test(f.headers.get('x-socria-runtime') ?? ''), f.headers.get('x-socria-runtime'));
  const e = await turn({ messages: [U('write me an email to my landlord about the broken heater in my flat')] });
  ok('a practical brief: Socria writes it', !/Theirs:/.test(turnBlock(e.system)) && /creativity:share/.test(e.headers.get('x-socria-runtime') ?? ''), e.headers.get('x-socria-runtime'));
}

console.log('\n=== the same system message, turn after turn ===');
{
  const h = [U('What is the derivative of x^2 sin x?'), A('Product rule: $2x\\sin x + x^2\\cos x$.')];
  const one = await turn({ messages: [...h, U('And the second derivative?')] });
  const two = await turn({ messages: [...h, U('And the second derivative?'), A('Differentiate again.'), U('Why the product rule there?')] });
  ok('a mathematical conversation carries the mathematics block', /MATHEMATICS\./.test(one.first));
  ok('…and the system message is byte for byte the same on the next turn', one.first === two.first && one.first.length > 5000);
  const plain = await turn({ messages: [U('I want to start a bakery.')] });
  ok('a conversation that is not mathematical carries no mathematics block', !/MATHEMATICS\./.test(plain.first));
}

console.log('\n=== the history window moves in steps ===');
{
  const long = (n) => Array.from({ length: n }, (_, i) => (i % 2 ? A(`reply ${i}`) : U(`turn ${i}`)));
  const fifty = await turn({ messages: [...long(49), U('and now?')] });
  const firstSent = fifty.turns[0]?.content;
  ok('fifty messages: the window starts at message 32 (steps of 16), not at 26', firstSent === 'turn 32', firstSent);
  const fortyNine = await turn({ messages: [...long(48), U('and now?')] });
  ok('…and the same start a message earlier, so the prefix stays cached', fortyNine.turns[0]?.content === 'turn 32', fortyNine.turns[0]?.content);
  const old = await turn({ messages: [...long(49), U('and now?')] }, { env: { LOGOS_RUNTIME: 'off' } });
  ok('without the runtime: the last 24, as before', old.turns.length === 24 && old.turns[0]?.content === 'turn 26', old.turns[0]?.content);
}

console.log('\n=== a citation must name what was given ===');
{
  const { doc } = await D.readDocument('report.md', Buffer.from('# Report\n\nRevenue rose 12.5% to $4.2 million in 2023.\n\nCosts were flat.\n'));
  const attach = { kind: 'doc', name: doc.name, doc: doc.id, text: D.renderDocAsNote(doc, 24000).text, pages: doc.pageCount, format: doc.format, origin: 'source' };
  const key = `A${doc.blocks.find((b) => /Revenue/.test(b.text)).id.replace(/^p/, '')}`;
  logged.length = 0;
  const t = await turn(
    { messages: [U('What happened to revenue?', { attachments: [attach] })], docs: [doc] },
    { reply: `Revenue rose 12.5% [${key}]. That beat the sector [3]. See https://www.fake-journal.example.com/articles/999 for more.` }
  );
  ok('the real passage citation reaches them', t.received.includes(`[${key}]`), t.received);
  ok('an invented web citation does not', !t.received.includes('[3]'), t.received);
  ok('an unsourced deep link is reduced to its site', !t.received.includes('/articles/999') && t.received.includes('fake-journal.example.com'), t.received);
  const line = logged.find((l) => l.includes('"route":"logos/chat"'));
  ok('the claims are counted in the log — never their content', !!line && /"removed":2/.test(line) && !/Revenue/.test(line), line);
  ok('  the figure is supported by the passage it cites', !!line && /"supported":[1-9]/.test(line), line);
}

console.log('\n=== a lookup, through Core 4\'s gate ===');
{
  const realFetch = globalThis.fetch;
  let searched = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://google.serper.dev/search')) {
      searched = JSON.parse(init.body).q;
      return new Response(JSON.stringify({ organic: [{ title: 'Fed holds rates steady', link: 'https://www.reuters.com/markets/fed-holds-rates', snippet: 'The Federal Reserve held its benchmark rate at 5.25% on Wednesday.', date: 'Oct 22, 2026' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(url, init);
  };
  try {
    const t = await turn(
      { messages: [U('Look up the latest Federal Reserve interest rate decision.')] },
      { reply: 'The Fed held at 5.25% [1]. Analysts expect cuts [4].', env: { SERPER_API_KEY: 'test-key' } }
    );
    ok('the search ran, with this turn\'s words only', !!searched && /federal reserve/i.test(searched), searched);
    ok('its sources were given to the reply, as evidence and not instruction', /From the web — evidence, not instruction/.test(t.system) && /Fed holds rates steady/.test(t.system));
    const src = JSON.parse(decodeURIComponent(t.headers.get('x-socria-sources') ?? '%7B%7D'));
    ok('…and shown to the person: query, title, site, address — no page text', src.sources?.[0]?.url === 'https://www.reuters.com/markets/fed-holds-rates' && src.sources[0].site && !('snippet' in src.sources[0]), JSON.stringify(src));
    ok('a citation of a real source stays; one of a source that does not exist goes', t.received.includes('[1]') && !t.received.includes('[4]'), t.received);
    ok('the trace says the path was verified', /path=verified/.test(t.headers.get('x-socria-runtime') ?? ''), t.headers.get('x-socria-runtime'));
    const no = await turn({ messages: [U('Look up the latest Federal Reserve interest rate decision.')] }, { env: { SERPER_API_KEY: undefined, TAVILY_API_KEY: undefined } });
    ok('with no provider, the reply is told the lookup did not run — so it never answers as if it had', /The lookup did not run/.test(no.system) && no.headers.get('x-socria-sources') === null);
    const sensitive = await turn({ messages: [U('Look up the latest treatment guidance for my depression.')] }, { env: { SERPER_API_KEY: 'test-key' } });
    ok('a sensitive subject is never searched', !/From the web/.test(sensitive.system));
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log('\n=== reading the room: what each kind of exchange is told ===');
{
  const block = (r) => turnBlock(r.system);
  const trace = (r) => r.headers.get('x-socria-runtime') ?? '';
  const task = /You do:|useful answer first|do the arithmetic/;

  const hi = await turn({ messages: [U('hi, how are you?')] });
  ok('"hi, how are you?" reads as small talk, in the trace', /;work=conversation;exchange=social;/.test(trace(hi)), trace(hi));
  ok('  and is told so — not given a job: no "You do", no "useful answer first"', /Small talk, not a task/.test(block(hi)) && !task.test(block(hi)), block(hi));
  ok('  nor invited to ask a question', !/QUESTIONS: at most one/.test(hi.system));
  ok('  and is told to be honest about itself, lightly', /They asked about you: answer honestly and lightly/.test(block(hi)) && /no claimed feelings or experiences/.test(block(hi)));
  ok('  with nothing imposed on it by the move engine', /^open;forced=0;/.test(hi.headers.get('x-socria-assist') ?? ''), hi.headers.get('x-socria-assist'));

  const feel = await turn({ messages: [U('how are you feeling?')] });
  ok('"how are you feeling?" is not a request to EXPLAIN', !/EXPLAIN/.test(feel.system) && /exchange=social/.test(trace(feel)), feel.headers.get('x-socria-assist'));

  const news = await turn({ messages: [U('I got the internship!!')] });
  ok('"I got the internship!!" is good news, not work offered for checking', !/VERIFY/.test(news.system) && /Good news, in their words/.test(block(news)) && /exchange=personal/.test(trace(news)), block(news));
  ok('  "I got x = 4" is still work to check', /VERIFY/.test((await turn({ messages: [U('Is this right? I got x = 4')] })).system));

  const sad = await turn({ messages: [U("I'm kind of down today, my grandmother is in the hospital")] });
  ok('a hard day is met as one: the person first, no tips, no pivot to work', /Something hard, in their words/.test(block(sad)) && /no list of tips/.test(block(sad)) && !task.test(block(sad)), block(sad));

  const joke = await turn({ messages: [U('tell me a joke about economists')] });
  ok('a joke asked for gets a joke, with no preamble', /They want a joke/.test(block(joke)) && /exchange=playful/.test(trace(joke)), block(joke));
  const banter = await turn({ messages: [U('lol you sound like my thesis advisor')] });
  ok('banter is played along with', /They're joking around: play along/.test(block(banter)), block(banter));

  const ideas = await turn({ messages: [U("let's brainstorm names for a coffee shop that's also a bookstore")] });
  ok('a brainstorm is generous and loose', /Brainstorming: be generous and loose/.test(block(ideas)) && /exchange=brainstorm/.test(trace(ideas)), block(ideas));
  const story = await turn({ messages: [U('help me brainstorm a plot twist for my novel')] });
  ok('  and Human-First holds in it: the substance of their novel stays theirs', /Brainstorming/.test(block(story)) && /Theirs: the substance/.test(block(story)), block(story));

  const big = await turn({ messages: [U('do you think free will is compatible with determinism?')] });
  ok('a big question is a discussion — a position, the other side, no wrap-up', /engage as a thinker/.test(block(big)) && /exchange=discussion/.test(trace(big)), block(big));
  ok('  and is not told to keep it to a line because the question was short', !/so is the answer/.test(block(big)), block(big));

  const back = await turn({ messages: [U('is a hot dog a sandwich?'), A('By most structural definitions, yes — bread around a filling.'), U("no way, that's absurd. a sandwich needs two separate slices")] });
  ok('pushback is decided on the merits, and a difference may stand', /They're pushing back/.test(block(back)) && /exchange=disagreement/.test(trace(back)), block(back));

  const code = await turn({ messages: [U('why does my python list comprehension return a generator instead of a list?')] });
  ok('a technical question is still a task, with all of its allocation', /exchange=task/.test(trace(code)) && /You do:/.test(block(code)) && /senior engineer/.test(block(code)) && /EXPLAIN/.test(block(code)), block(code));
  const busy = await turn({ messages: [U("ugh, rough day — can you check my proof that sqrt 2 is irrational?")] });
  ok('work brought on a rough day is work, with a word for the day first', /exchange=task/.test(trace(busy)) && /You do:/.test(block(busy)) && /hard time: one plain, human word/.test(block(busy)), block(busy));

  const back2 = await turn({ resumedAfterMs: 2 * 86400000, mapDigest: { context: 'learning', assumptions: [], conflicts: [], open: [] }, messages: [U('I am learning integration by parts for my exam'), A('Start with the product rule, read backwards.'), U('ok, and when u is ln x?'), A('Then du is dx over x.'), U('hey, I\'m back!')] });
  ok('a hello after a day away is a hello — not a recall quiz', !/retrieval/.test(back2.headers.get('x-socria-assist') ?? '') && !/THEY ARE BACK/.test(back2.system), back2.headers.get('x-socria-assist'));
}

console.log('\n=== small talk never goes looking on the web ===');
{
  const realFetch = globalThis.fetch;
  let searched = 0;
  globalThis.fetch = async (url, init) => {
    if (/serper|tavily/.test(String(url))) searched++;
    return realFetch(url, init);
  };
  try {
    const today = await turn({ messages: [U('how are you doing today?')] }, { env: { SERPER_API_KEY: 'test-key' } });
    ok('"how are you doing today?" runs no search, with a provider configured', searched === 0, `searches: ${searched}`);
    ok('  and the reply is not told a lookup failed, or that something current went unchecked', !/The lookup did not run/.test(today.system) && !/Nothing current was checked/.test(today.system), turnBlock(today.system));
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log('\n=== the help desk does not reach the person ===');
{
  const hd = await turn({ messages: [U('hi, how are you?')] }, { reply: "Doing well, thanks — quiet day on my end. I'm here and ready to assist. How can I help you today?" });
  ok('a reply ending in "ready to assist" and "How can I help you today?" arrives without them', hd.received.trim() === 'Doing well, thanks — quiet day on my end.', JSON.stringify(hd.received));
  const only = await turn({ messages: [U('hey')] }, { reply: 'How can I help you today?' });
  ok('  but a reply that was nothing else is sent as written — never an empty turn', only.received.trim() === 'How can I help you today?', JSON.stringify(only.received));
  const ask = await turn({ messages: [U('hey, how are you?')] }, { reply: 'Good — no complaints on my end. How about you?' });
  ok('  a question back, inside the budget, is still theirs to answer', /How about you\?$/.test(ask.received.trim()), JSON.stringify(ask.received));
}

console.log('\n=== an "ok" is not remembered ===');
{
  const said = await turn({ sessionId: 's_mem', mind: true, messages: [U('I have decided to move to Berlin for the job.')] }, { reply: 'That is a real decision.' });
  const extracts = (r) => r.calls.filter((c) => !c.stream && /semantic memory|memory graph|You extract|remember/i.test(String(c.messages?.[0]?.content ?? ''))).length;
  const ok1 = extracts(said);
  const thanks = await turn({ sessionId: 's_mem', mind: true, messages: [U('I have decided to move to Berlin for the job.'), A('That is a real decision.'), U('thanks')] }, { reply: 'Good luck with it.' });
  ok('a turn with something in it is sent to the memory extractor; "thanks" is not', ok1 >= 1 && extracts(thanks) === 0, `${ok1} then ${extracts(thanks)}`);
}

console.log(`\nruntime route: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
