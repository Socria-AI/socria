// The interrogation loop, through the real chat route.
//
// question-pressure.test.mjs proves the budget and the engine against states
// built by hand. This proves the wiring around them, where the old loop could
// still survive a correct policy:
//
//   - the question streak is measured from the transcript the client sends,
//     so pressure does not depend on the state reader getting anything right;
//   - the move the engine chose is the one Core 4 is actually handed;
//   - a generic coaching question on a move that allows none is removed
//     before the person sees it (Phase 0: ASK was the default);
//   - a reflexive question on the end of a move that should stop is removed
//     before the person sees it;
//   - and when an answer connects two things already in the Mind Graph, the
//     edge lands between the EXISTING nodes, not beside copies of them.
//
// Real route handler; the database, Clerk and the model are replaced (see
// test/helpers). The Cognitive State and the draft reply are scripted, so
// what this cannot prove is that the real reader reports these states or the
// real model writes these drafts. It proves that when they do, the person
// gets the reply the design intends.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-q');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: [join(root, 'app/api/chat/route.ts')],
  bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'chat.mjs'),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [{
    name: 'swap',
    setup(b) {
      b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
        const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
        if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
        return undefined;
      });
      b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
      b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai.mjs')).href, external: true }));
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
      b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
    },
  }],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'],
  logLevel: 'error',
});

const quietLog = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[socria') || first.startsWith('conversations')) return;
  orig(...a);
};
console.log = quietLog(console.log.bind(console));
console.error = quietLog(console.error.bind(console));
console.warn = quietLog(console.warn.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';

const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

async function quiet() {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 25));
    if (db.log.length === last) return;
    last = db.log.length;
  }
}

/**
 * One Core 4 turn. `state` is what the Cognitive State reader reports,
 * `draft` what the model writes. Returns what Core 4 was told and what the
 * person received.
 */
async function turn(messages, { state, draft, extract }) {
  globalThis.__state = state;
  globalThis.__reply = draft;
  globalThis.__prompts = [];
  globalThis.__extract = extract ? [extract] : [];
  globalThis.__socriaTrace = [];
  const req = new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'core-4', messages, conversationId: 'mccombs' }),
  });
  const r = await chatRoute.POST(req);
  const received = await r.text();
  await quiet();
  const prompt = globalThis.__prompts[0] ?? '';
  // The decision, from the eval trace: an unforced move is not named in the
  // prompt (council D1 envelope), so the prompt is checked for constraints.
  const dec = globalThis.__socriaTrace[0]?.decision ?? null;
  const move = dec?.type ?? null;
  return { status: r.status, prompt, move, objective: dec?.objective ?? '', forced: !!dec?.forced, received };
}

const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const C = (type, label, content) => ({ type, label, content, kind: 'stated', importance: 0.6 });

db.reset();
globalThis.__uid = 'u1';

// ── the conversation from the brief ─────────────────────────────────

const u1 = U('McCombs has a strong startup scene compared to other colleges.');
const a1 = A('A vibrant startup scene can offer great networking and learning opportunities. How do you see that contributing to your goals or career path?');
const u2 = U('want to be an entrepreneur longterm');

console.log('=== turn 1: a statement gets a contribution, not a coaching question ===');
const t1 = await turn([u1], {
  state: { taskKind: 'decide', latest: 'information', currentGoal: 'choosing where to study' },
  draft: a1.content,
  extract: {
    nodes: [
      C('Concept', 'McCombs startup ecosystem', 'McCombs has a strong startup scene compared to other colleges.'),
      C('Goal', 'long-term entrepreneurship', 'Wants to be an entrepreneur in the long term.'),
    ],
    edges: [],
  },
});
ok('the reply went out', t1.status === 200, String(t1.status));
// v1 of this test asserted ASK here. That default was Phase 0's failure 3:
// an open statement is not a reason to interview someone.
ok('Core 4 was told to contribute', t1.move === 'CONTRIBUTE', t1.move);
ok('with no questions', /Questions this turn: NONE/.test(t1.prompt));
ok('and, resting on an inference, not imposed: constraints only', !t1.forced && /No move is imposed/.test(t1.prompt));
ok('the generic question was removed, the substance kept',
   t1.received.trim() === 'A vibrant startup scene can offer great networking and learning opportunities.', t1.received);

console.log('\n=== turn 2: the answer is USED ===');
const reflexive =
  'Then it isn’t just a general advantage of McCombs. You’re looking for an environment where building companies is part of the ecosystem around you — directly connected to what you want to do long term. What do you think are the key factors that will help you achieve your entrepreneurial goals?';
const t2 = await turn([u1, a1, u2], {
  state: {
    taskKind: 'decide',
    latest: 'answer',
    resolved: true,
    newRelation: 'McCombs startup ecosystem → matters because of → their long-term goal of being an entrepreneur',
    positions: ['McCombs has a strong startup scene', 'wants to be an entrepreneur long term'],
  },
  // The failure in the brief, verbatim at the end: the right observation,
  // then the reflexive next question.
  draft: reflexive,
  extract: {
    nodes: [
      C('Concept', 'McCombs startup ecosystem', 'McCombs has a strong startup scene compared to other colleges.'),
      C('Goal', 'long-term entrepreneurship', 'Wants to be an entrepreneur in the long term.'),
    ],
    edges: [{ sourceLabel: 'McCombs startup ecosystem', relationship: 'relevant_to', targetLabel: 'long-term entrepreneurship', kind: 'stated' }],
  },
});
ok('Core 4 was not told to ask', t2.move !== 'ASK', t2.move);
ok('it was told to CONNECT', t2.move === 'CONNECT', t2.move);
ok('with the connection they made', /McCombs startup ecosystem[^\n]*entrepreneur/.test(t2.objective));
ok('and no question allowed', /Questions this turn: NONE/.test(t2.prompt));
ok('the state it read says they just connected it', /McCombs startup ecosystem → matters because of/.test(t2.prompt));
ok('the reflexive question never reached them', !/\?/.test(t2.received), t2.received);
ok('the observation did, word for word',
   t2.received.trim() === 'Then it isn’t just a general advantage of McCombs. You’re looking for an environment where building companies is part of the ecosystem around you — directly connected to what you want to do long term.',
   t2.received);

console.log('\n=== the answer\'s relationship, in the Mind Graph ===');
{
  const nodes = db.rows('mind_nodes').filter((n) => n.user_id === 'u1');
  const byLabel = (l) => nodes.filter((n) => n.label === l);
  ok('one McCombs node, not a second copy', byLabel('McCombs startup ecosystem').length === 1, String(byLabel('McCombs startup ecosystem').length));
  ok('one goal node, not a second copy', byLabel('long-term entrepreneurship').length === 1);
  const edge = db.rows('mind_edges').find((e) => e.user_id === 'u1' &&
    e.source_id === byLabel('McCombs startup ecosystem')[0]?.id && e.target_id === byLabel('long-term entrepreneurship')[0]?.id);
  ok('the edge the answer established runs between the EXISTING nodes', !!edge && edge.relationship === 'relevant_to', JSON.stringify(edge));
}

console.log('\n=== turn 3: new evidence, no question needed ===');
const a2 = A(t2.received);
const u3 = U('yeah, and at UTA I’ve had trouble finding startup funding and investors');
const t3 = await turn([u1, a1, u2, a2, u3], {
  state: {
    taskKind: 'decide',
    latest: 'information',
    newRelation: 'trouble finding startup funding and investors at UTA → is evidence for → why the McCombs ecosystem matters',
    positions: ['McCombs has a strong startup scene', 'wants to be an entrepreneur long term', 'UTA has been hard for funding'],
  },
  draft: 'That’s a stronger comparison. You’re not saying UTA has nothing for startups; you’re identifying a specific ceiling you’ve actually hit: access to funding and investors.',
});
ok('no question move after new evidence', !['QUESTION', 'CLARIFY'].includes(t3.move), t3.move);
ok('the new evidence is connected to the reason', t3.move === 'CONNECT' && /funding/.test(t3.objective));
ok('the reply reached them unchanged, with no question', !/\?/.test(t3.received) && /specific ceiling/.test(t3.received));

console.log('\n=== pressure is measured from the transcript, not the state reader ===');
{
  // Two questions in a row, and a state reader that has noticed nothing —
  // no answer, no relation, nothing on the table. The old router asked a
  // third time. This one reads the transcript.
  const asked = [U('thinking about grad school'), A('What draws you to it?'), U('not sure'), A('What would you want to study?'), U('something with data')];
  const t = await turn(asked, { state: { taskKind: 'explore' }, draft: 'Data as the subject, not just the tool — that narrows it more than it sounds.' });
  ok('a third question in a row is not chosen', !['QUESTION', 'CLARIFY'].includes(t.move), t.move);
  ok('and none is allowed', /Questions this turn: NONE/.test(t.prompt));
  ok('the reply is an observation that stops', !/\?/.test(t.received), t.received);
}

console.log('\n=== a necessary question still goes through ===');
{
  const conv = [U('my build is failing'), A('What does the error say, exactly?'), U('it just says exit code 1')];
  const t = await turn(conv, {
    state: { taskKind: 'debug', latest: 'answer', resolved: true, blockingUnknown: 'the first error line above "exit code 1" in the build log' },
    draft: 'Scroll up from "exit code 1" — what is the first line in red?',
  });
  // Council D4: no question re-granted for a blocker. Proceed under a stated
  // assumption; say what to send as an instruction.
  ok('not another question: the work, under a stated assumption', t.move === 'EXPLAIN' || t.move === 'EXECUTE', t.move);
  ok('naming exactly the unknown', /first error line/.test(t.objective));
  ok('asking for it as an instruction, not a question', /as an instruction/.test(t.objective) && /Questions this turn: NONE/.test(t.prompt));
  ok('and no question reached them', !/\?\s*$/.test(t.received.trim()), t.received);
}

console.log('\n=== a plain request is answered ===');
{
  const t = await turn([U('what year did UT Austin found McCombs?')], {
    state: { taskKind: 'lookup', latest: 'request' },
    draft: 'The business school dates to 1922; it took the McCombs name in 2000.',
  });
  ok('ANSWER, not a question back', t.move === 'ANSWER', t.move);
  ok('the move says so', /no question back/i.test(t.objective));
  ok('and the answer reached them', /1922/.test(t.received), t.received);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
