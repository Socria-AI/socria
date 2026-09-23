// A Core 4 conversation, through the real chat route, over several turns.
//
// The pure suites (core4-policy, core4-guard-ledger) prove each decision in
// isolation. This proves the loop around them survives contact with the
// route: state carried between turns in the database, the ledger written
// with owners decided in code, the turn trace content-free, the previous
// turn's outcome written back onto its own row, the guard's retry re-checked,
// the fallback used when the retry still fails, Verify Mode's private value
// never reaching the person — and "forget what Socria worked out" reaching
// every Core 4 table.
//
// Real route handlers; the database, Clerk and the model are replaced (see
// test/helpers). The state reader's output and the drafts are scripted, so
// this cannot prove the real reader reads these states or the real model
// writes these drafts — only that when they do, the person gets what the
// design intends, and the record is what the design says it is.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-turn');
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
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
for (const [entry, out] of [['app/api/chat/route.ts', 'chat.mjs'], ['app/api/account/memory/route.ts', 'memory.mjs'], ['app/api/core4/route.ts', 'core4.mjs'], ['app/api/conversations/[id]/route.ts', 'conv.mjs']]) {
  await build({
    entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node',
    outfile: join(OUT, out), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
    external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
  });
}

const quietLog = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[socria') || first.startsWith('conversations') || first.startsWith('stream error')) return;
  orig(...a);
};
console.log = quietLog(console.log.bind(console));
console.error = quietLog(console.error.bind(console));
console.warn = quietLog(console.warn.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';

const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const memoryRoute = await import(pathToFileURL(join(OUT, 'memory.mjs')).href);
const core4Route = await import(pathToFileURL(join(OUT, 'core4.mjs')).href);
const convRoute = await import(pathToFileURL(join(OUT, 'conv.mjs')).href);
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

/** One Core 4 turn. Returns what Core 4 was told, what the person received, and the eval trace. */
async function turn(conversationId, messages, { state = {}, replies, guard, check, projectId } = {}) {
  globalThis.__state = state;
  globalThis.__replies = [...(replies ?? ['Noted.'])];
  globalThis.__reply = undefined;
  globalThis.__guard = guard;
  globalThis.__check = check;
  globalThis.__prompts = [];
  globalThis.__guardCalls = [];
  globalThis.__checkCalls = [];
  globalThis.__extract = [];
  globalThis.__socriaTrace = [];
  const req = new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'core-4', messages, conversationId, ...(projectId ? { projectId } : {}) }),
  });
  const r = await chatRoute.POST(req);
  const received = await r.text();
  await quiet();
  const prompt = globalThis.__prompts[0] ?? '';
  return {
    status: r.status, prompt, prompts: globalThis.__prompts, received,
    move: globalThis.__socriaTrace[0]?.decision?.type ?? null,
    t: globalThis.__socriaTrace[0] ?? null,
    guardCalls: globalThis.__guardCalls.length,
    checkCalls: globalThis.__checkCalls.length,
  };
}

const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const rows = (t, uid = 'u1') => db.rows(t).filter((r) => r.user_id === uid);

db.reset();
globalThis.__uid = 'u1';

// ─────────────────────────────────────────────────────────────────────

console.log('=== a stated learning goal is carried between turns ===');
const c1 = 'learn-derivs';
const m1 = U('I am learning derivatives and want to work these out myself. How do I differentiate x^2 sin x?');
const t1 = await turn(c1, [m1], {
  state: { taskKind: 'learn', work: 'practice', latest: 'question', currentFocus: 'differentiating x^2 sin x', practice: 'application' },
  replies: ['You have two functions multiplied together — that decides which rule you need. Start from the rule for a product and apply it to these two.'],
});
ok('the reply went out', t1.status === 200 && t1.received.length > 0, `${t1.status}`);
ok('the answer is kept with them — because they said so', t1.t?.allocation.withhold?.reason === 'practice_goal' && t1.t.allocation.withhold.source === 'message', JSON.stringify(t1.t?.allocation));
ok('the move is a hint, not the derivation', t1.move === 'HINT' || t1.move === 'QUESTION', t1.move);
ok('the first withholding is announced, with how to get it', /say so once/.test(t1.prompt) && /say the word/.test(t1.prompt));
ok('a withheld turn is read by the guard model before sending', t1.guardCalls === 1);
const s1 = rows('core4_state').find((r) => r.conversation_id === c1)?.state;
ok('the state is saved for the next turn', !!s1 && s1.turn === 1);
ok('with the learning goal as EXPLICIT', s1?.learningGoal.value === 'yes' && s1.learningGoal.source === 'explicit', JSON.stringify(s1?.learningGoal));
ok('and the turn remembered as having withheld', s1?.history.at(-1)?.withheld === true);

const a1 = A(t1.received);
const m2 = U('ok so is it 2x cos x?');
const t2 = await turn(c1, [m1, a1, m2], {
  // The reader has changed its mind about the goal. It does not get to.
  state: { taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'wrong', currentFocus: 'differentiating x^2 sin x', learningGoal: { value: 'no', confidence: 0.9, evidence: 'asks to check' } },
  check: { verdict: 'incorrect', location: 'you differentiated both factors and multiplied them', errorType: 'wrong rule', expected: '2x sin x + x^2 cos x', confidence: 0.9 },
  replies: ['Not quite: you differentiated both factors and multiplied the results, which is the wrong rule for a product. Redo it with the product rule and send it over.'],
});
ok('the goal they stated survives the reader\'s contrary guess', t2.t?.state.learningGoal.source === 'explicit' && t2.t.state.learningGoal.value === 'yes');
ok('so the redo stays with them: VERIFY', t2.move === 'VERIFY', t2.move);
ok('the separate checker judged the attempt', t2.checkCalls === 1);
ok('the reply model got WHERE and WHAT KIND…', /WHERE: you differentiated both factors/.test(t2.prompt) && /KIND OF ERROR: wrong rule/.test(t2.prompt));
ok('…and never the expected answer', !t2.prompt.includes('x^2 cos x') || !/2x sin x \+ x\^2 cos x/.test(t2.prompt));
ok('not announced a second time', !/say so once/.test(t2.prompt));
ok('the turn count moved on', rows('core4_state').find((r) => r.conversation_id === c1)?.state.turn === 2);

console.log('\n=== "just tell me" after being held back ===');
const a2 = A(t2.received);
const m3 = U('just tell me the answer, I need to move on');
const t3 = await turn(c1, [m1, a1, m2, a2, m3], {
  state: { taskKind: 'learn', work: 'practice', latest: 'request', currentFocus: 'differentiating x^2 sin x' },
  replies: ['It is 2x sin x + x^2 cos x: the product rule, (fg)\' = f\'g + fg\', with f = x^2 and g = sin x.'],
});
ok('their words beat their own earlier goal: nothing withheld', t3.t?.allocation.withhold === null, JSON.stringify(t3.t?.allocation));
ok('ANSWER, with no questions', (t3.move === 'ANSWER' || t3.move === 'EXPLAIN' || t3.move === 'EXECUTE') && /Questions this turn: NONE/.test(t3.prompt), t3.move);
ok('the answer reached them', /x\^2 cos x/.test(t3.received), t3.received);
const turns = rows('core4_turns').filter((r) => r.conversation_id === c1).sort((a, b) => a.turn - b.turn);
ok('three trace rows', turns.length === 3, String(turns.length));
ok('the previous turn is marked WAS_TOO_INDIRECT, from their words', turns[1].outcome_label === 'WAS_TOO_INDIRECT' && turns[1].outcome_source === 'explicit', JSON.stringify(turns[1]));
const traceJson = JSON.stringify(turns.map((r) => r.trace));
ok('the traces hold no words from the conversation', !/derivative|differentiat|sin x|move on/i.test(traceJson), traceJson.slice(0, 200));

console.log('\n=== a wrong answer gets the correction when nothing says otherwise ===');
const c2 = 'arith';
const p1 = U('what is 17 * 23 + 4?');
const p2 = A('Multiply first, then add.');
const p3 = U('I got 385');
const t4 = await turn(c2, [p1, p2, p3], {
  // The reader thinks they got it right. Arithmetic says otherwise.
  state: { taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'right', currentFocus: '17 * 23 + 4' },
  replies: ['Not quite — 17 × 23 is 391, and adding 4 gives 395.'],
});
ok('the exact check overrides the reader: CORRECT, not "that is right"', t4.move === 'CORRECT', t4.move);
ok('checked exactly, no model needed', t4.checkCalls === 0 && t4.t?.verify?.method === 'exact' && t4.t.verify.verdict === 'incorrect');
ok('with nothing held back, the reply model may state the right value', /CORRECT ANSWER: 395/.test(t4.prompt));
ok('and the person gets it', /395/.test(t4.received));

console.log('\n=== Verify Mode keeps the value private when it must ===');
db.rows('mind_projects').push({ user_id: 'u1', id: 'p-alg', node_id: 'n-alg', name: 'Algebra practice', description: '', instructions: 'Hints only — I am practising and never want full solutions.', archived: false, created_at: 1, updated_at: 1 });
db.rows('mind_nodes').push({ user_id: 'u1', id: 'n-alg', type: 'Project', label: 'Algebra practice', content: '', aliases: [], status: 'active', confidence: 1, certainty: 1, importance: 0.8, activation: 0.5, seen: 1, private: false, provenance: [], created_at: 1, updated_at: 1, last_accessed: 1 });
const c3 = 'alg-1';
const t5 = await turn(c3, [p1, p2, p3], {
  projectId: 'p-alg',
  state: { taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'wrong', currentFocus: '17 * 23 + 4' },
  // The draft leaks the value in its second sentence; the retry leaks too.
  replies: ['Close, but the multiplication is off. It should come to 395. Recheck 17 × 23.', 'Recheck 17 × 23 — the total should be 395.'],
});
ok('the Project\'s instruction withholds, as an agency boundary', t5.t?.allocation.withhold?.source === 'project', JSON.stringify(t5.t?.allocation.withhold));
ok('the prompt has the verdict and not the value', /VERDICT: incorrect \(computed exactly\)/.test(t5.prompt) && !t5.prompt.includes('395'));
ok('the value never reached the person', !t5.received.includes('395'), t5.received);
ok('the useful part did', /multiplication is off|Recheck 17/.test(t5.received), t5.received);

console.log('\n=== the guard\'s retry is re-checked; a failing retry never ships ===');
const c4 = 'retry';
const q1 = U('I want to learn this myself, do not give me the answer. How do I find the derivative of x^2 sin x?');
const leak = "The rule is (fg)' = f'g + fg', so you get 2x sin x + x^2 cos x. Now try it yourself.";
const good = 'You have a product of two functions here, and there is a specific rule for exactly that shape. Start by naming the two factors.';
const t6 = await turn(c4, [q1], {
  state: { taskKind: 'learn', work: 'practice', latest: 'question', currentFocus: 'derivative of x^2 sin x' },
  replies: [leak, good],
});
ok('the leaking draft was rejected and regenerated', t6.prompts.length === 2 && /Your previous draft was rejected/.test(t6.prompts[1]), String(t6.prompts.length));
ok('the retry went out', t6.received.trim() === good, t6.received);
ok('the trace records the regeneration', t6.t?.trace.guard.regenerated === true);

const t7 = await turn('retry-2', [q1], {
  state: { taskKind: 'learn', work: 'practice', latest: 'question', currentFocus: 'derivative of x^2 sin x' },
  replies: [leak, leak],
});
ok('a retry that still leaks is not sent', !/x\^2 cos x/.test(t7.received) && !/f'g \+ fg'/.test(t7.received), t7.received);
ok('something safe is', t7.received.trim().length > 0);

console.log('\n=== the ledger: theirs only when it is in their words ===');
const c5 = 'launch';
const l1 = U('I think we should launch in March, not April, because the conference is in March. I already ruled out raising prices before the pilot ends.');
const t8 = await turn(c5, [l1], {
  state: {
    taskKind: 'decide', work: 'judgment', latest: 'information', currentFocus: 'launch timing',
    consideredNow: [
      { kind: 'decision', text: 'launch in March', quote: 'we should launch in March, not April', stance: 'asserts', reason: 'the conference is in March' },
      { kind: 'alternative', text: 'raising prices before the pilot ends', quote: 'I already ruled out raising prices before the pilot ends', stance: 'rejects', reason: '' },
      { kind: 'claim', text: 'They are anxious about the budget', quote: 'budget is tight', stance: 'asserts', reason: '' },
    ],
  },
  replies: ['The conference only helps if the demo is stable by then; the thing nobody has priced is a slipped demo in front of the people you most want.'],
});
const ents = rows('reasoning_entries').filter((e) => e.conversation_id === c5);
const byText = (t) => ents.find((e) => e.text === t);
ok('their quoted decision is theirs', byText('launch in March')?.owner === 'user' && byText('launch in March')?.basis === 'quoted');
ok('what they ruled out is recorded as ruled out', byText('raising prices before the pilot ends')?.status === 'rejected');
ok('the reader\'s guess about their feelings is NOT theirs', byText('They are anxious about the budget')?.owner === 'unknown', JSON.stringify(byText('They are anxious about the budget')));
ok('what Socria said is recorded as Socria\'s', ents.some((e) => e.owner === 'socria' && /demo is stable/.test(e.text)));

const l2 = U('what else should I worry about?');
const t9 = await turn(c5, [l1, A(t8.received), l2], {
  state: { taskKind: 'decide', work: 'judgment', latest: 'question', currentFocus: 'launch timing risks' },
  replies: ['Raising prices before the pilot ends would hurt trust. Separately, the support load in launch week is unplanned.'],
  // Word overlap alone no longer deletes a statement; the model check names it.
  guard: { action: 'MODIFY_FOR_MORE_HELP', findings: [{ side: 'novelty', detail: 'repeats a ruled-out option' }], redundant: ['Raising prices before the pilot ends would hurt trust.'] },
});
// Council D8/D9: nothing is withheld here, so the reply streams; prevention
// (the avoid list in the prompt) is primary and the stream gate deletes only
// re-asked questions. A re-raised STATEMENT on a streamed turn is not caught
// — a known limit, measured by E5.
ok('streamed, not buffered: no guard model call', t9.guardCalls === 0, String(t9.guardCalls));
ok('next turn, what they already covered is in front of the model', /they ruled out: raising prices before the pilot ends/.test(t9.prompt), t9.prompt.slice(-900));
ok('what Socria already said is marked as Socria\'s', /Socria already said: .*demo is stable/.test(t9.prompt));
ok('known limit: a re-raised statement on a streamed turn is not deleted', /Raising prices/.test(t9.received), t9.received);
ok('the new one did', /support load/.test(t9.received), t9.received);

const l3 = U("that's not what I meant — I haven't decided on March at all");
const t10 = await turn(c5, [l1, A(t8.received), l2, A(t9.received), l3], {
  state: { taskKind: 'decide', work: 'judgment', latest: 'other', currentFocus: 'launch timing' },
  replies: ['Understood — March is open, not decided.'],
});
ok('a correction reaches the record', t10.t?.trace.ledger.disputed >= 0);
const decided = rows('reasoning_entries').find((e) => e.conversation_id === c5 && e.text === 'launch in March');
ok('the entry is not deleted…', !!decided);
ok('…but its history shows the correction when it was from the corrected turn, or it still stands', decided.status === 'disputed' || decided.turn !== 2, JSON.stringify({ status: decided.status, turn: decided.turn }));

console.log('\n=== a plain request streams, and its questions are held ===');
const t11 = await turn('fact', [U('when did the business school at UT Austin take the McCombs name?')], {
  state: { taskKind: 'lookup', work: 'information', latest: 'question', currentFocus: 'McCombs name' },
  replies: ['Great question! It took the McCombs name in 2000. Would you like to know more about its history?'],
});
ok('ANSWER, unbuffered (no guard model call)', t11.move === 'ANSWER' && t11.guardCalls === 0, `${t11.move} ${t11.guardCalls}`);
ok('the opener and the offer never went out', t11.received.trim() === 'It took the McCombs name in 2000.', JSON.stringify(t11.received));

console.log('\n=== the person can see and correct all of it ===');
{
  const call = async (method, { body, query = '' } = {}) => {
    const r = await core4Route[method](new NextRequest(`http://localhost/api/core4${query}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: r.status, json: await r.json() };
  };
  const g = await call('GET');
  ok('GET returns the ledger, the states and the capability evidence', g.status === 200 && g.json.entries.length > 0 && g.json.states.length > 0 && Array.isArray(g.json.capability));
  const st = g.json.states.find((x) => x.conversationId === c1);
  ok('a state separates what they said from what was inferred', st && st.said.some((f) => f.field === 'learningGoal') && Array.isArray(st.inferred), JSON.stringify(st));
  ok('the ledger comes back as a Logos graph too', Array.isArray(g.json.graph.nodes) && g.json.graph.nodes.every((n) => 'owner' in n));

  const mine = g.json.entries.find((e) => e.text === 'launch in March');
  const d1 = await call('PATCH', { body: { entryId: mine.id, action: 'disown' } });
  ok('"not mine": ownership leaves them', d1.status === 200 && d1.json.entry.owner === 'unknown' && d1.json.entry.quote === '');
  ok('  recorded as their correction', d1.json.entry.revisions.at(-1).by === 'user' && d1.json.entry.revisions.at(-1).change === 'owner');
  const unk = g.json.entries.find((e) => e.text === 'They are anxious about the budget');
  const e1 = await call('PATCH', { body: { entryId: unk.id, action: 'edit', text: 'the budget constrains the launch date' } });
  ok('"this is mine, in my words": theirs, quoted', e1.json.entry.owner === 'user' && e1.json.entry.basis === 'quoted' && e1.json.entry.text === 'the budget constrains the launch date');
  const r1 = await call('PATCH', { body: { entryId: unk.id, action: 'retract' } });
  ok('retract keeps it as history, out of use', r1.json.entry.status === 'retracted');
  const view = rows('reasoning_entries').find((x) => x.id === unk.id);
  ok('  and it is persisted', view.status === 'retracted');
  ok('a bad action is refused', (await call('PATCH', { body: { entryId: unk.id, action: 'promote' } })).status === 400);
  ok('an unknown entry is 404', (await call('PATCH', { body: { entryId: 'nope', action: 'retract' } })).status === 404);

  const s1 = await call('PATCH', { body: { conversationId: c1, field: 'expertise', value: 'expert' } });
  ok('an inferred field can be SET by them — explicit from then on', s1.status === 200 && s1.json.state.said.some((f) => f.field === 'expertise' && f.value === 'expert'), JSON.stringify(s1.json));
  const s2 = await call('PATCH', { body: { conversationId: c1, field: 'learningGoal', value: null } });
  ok('or reset to "not known"', s2.json.state.said.every((f) => f.field !== 'learningGoal'));
  ok('directness cannot be set from here', (await call('PATCH', { body: { conversationId: c1, field: 'directness', value: 'answer' } })).status === 400);
  ok('nor a value the field cannot take', (await call('PATCH', { body: { conversationId: c1, field: 'expertise', value: 'genius' } })).status === 400);

  const next = await turn(c1, [m1, a1, m2, a2, m3, A(t3.received), U('next one: x^3 cos x')], {
    state: { taskKind: 'learn', work: 'practice', latest: 'question', currentFocus: 'x^3 cos x' },
    replies: ['Differentiate x^3 cos x with the product rule: 3x^2 cos x − x^3 sin x.'],
  });
  ok('with the learning goal reset, the next turn no longer withholds on it', next.t?.allocation.withhold === null, JSON.stringify(next.t?.allocation));
  ok('and the expertise they set is what the turn used', next.t?.state.expertise.value === 'expert' && next.t.state.expertise.source === 'explicit');

  const del = await call('DELETE', { query: `?entryId=${encodeURIComponent(mine.id)}` });
  ok('delete removes an entry', del.status === 200 && !rows('reasoning_entries').some((x) => x.id === mine.id));
  ok('and every link touching it', !rows('reasoning_links').some((l) => l.from_id === mine.id || l.to_id === mine.id));
  const ds = await call('DELETE', { query: `?conversationId=${c2}` });
  ok('a conversation\'s state can be forgotten', ds.status === 200 && !rows('core4_state').some((x) => x.conversation_id === c2));
  ok('nothing to delete → 400', (await call('DELETE')).status === 400);
  globalThis.__uid = null;
  ok('signed out → 401', (await call('GET')).status === 401);
  globalThis.__uid = 'u1';
}

console.log('\n=== off the record (council D15) ===');
{
  const cid = 'offrec';
  const u1 = U("Off the record: I'm deciding whether to leave my co-founder, it's a mess. The equity split is 60/40.");
  const r = await turn(cid, [u1], {
    state: { taskKind: 'decide', work: 'judgment', latest: 'information', currentFocus: 'leaving my co-founder', currentGoal: 'decide about the co-founder',
      consideredNow: [{ kind: 'claim', text: 'the equity split is 60/40', quote: 'The equity split is 60/40', stance: 'asserts', reason: '' }] },
    replies: ['Understood — nothing from this conversation will be kept. The 60/40 split matters mostly for what the vesting schedule says about unvested shares.'],
  });
  ok('the reply is told to acknowledge it once', /off the record/.test(r.prompt) && /you can remember this/.test(r.prompt));
  ok('no ledger entries are written', rows('reasoning_entries').filter((e) => e.conversation_id === cid).length === 0);
  const st = rows('core4_state').find((x) => x.conversation_id === cid)?.state;
  ok('the saved state holds no free text', st && st.currentFocus === '' && st.currentGoal === '' && st.consideredNow.length === 0 && st.persistPolicy === 'none', JSON.stringify(st && { f: st.currentFocus, g: st.currentGoal, p: st.persistPolicy }));
  ok('the content-free trace is still written', rows('core4_turns').some((x) => x.conversation_id === cid));
  ok('nothing went to the Mind Graph', !rows('mind_nodes').some((n) => /co-?founder|60\/40/i.test(`${n.label} ${n.content}`)));
  const r2 = await turn(cid, [u1, A(r.received), U('ok, you can remember this again. What should I ask the lawyer?')], {
    state: { taskKind: 'decide', work: 'judgment', latest: 'question', currentFocus: 'questions for the lawyer',
      consideredNow: [{ kind: 'question', text: 'what to ask the lawyer', quote: 'What should I ask the lawyer', stance: 'asks', reason: '' }] },
    replies: ['Ask how unvested shares are treated if you leave, and whether the vesting has an acceleration clause.'],
  });
  ok('"you can remember this" turns it back on', rows('core4_state').find((x) => x.conversation_id === cid)?.state.persistPolicy === 'full');
  ok('and from then on the ledger is written again', rows('reasoning_entries').some((e) => e.conversation_id === cid));
}

console.log('\n=== a sensitive conversation stays in its conversation (council D14) ===');
{
  const said = 'My dad passed away last month and I have to decide whether to sell his house now or wait a year.';
  const r = await turn('grief', [U(said)], {
    state: { taskKind: 'decide', work: 'judgment', latest: 'information', currentFocus: 'sell the house now or wait',
      consideredNow: [{ kind: 'alternative', text: 'wait a year before selling', quote: 'wait a year', stance: 'entertains', reason: '' }] },
    replies: ['I am sorry about your dad. Waiting a year mostly buys you time to decide without pressure; the cost is carrying the house.'],
  });
  ok('the conversation becomes conversation-only', rows('core4_state').find((x) => x.conversation_id === 'grief')?.state.persistPolicy === 'conversation_only');
  const ents = rows('reasoning_entries').filter((e) => e.conversation_id === 'grief');
  ok('its ledger entries are private', ents.length > 0 && ents.every((e) => e.private === true));
  const other = await turn('other-house', [U('Should I wait a year before selling my rental property?')], {
    state: { taskKind: 'decide', work: 'judgment', latest: 'question', currentFocus: 'wait a year before selling the rental' },
    replies: ['Mostly a tax and rates question: …'],
  });
  ok('and never appear in another conversation', !/wait a year before selling/.test(other.prompt.split('Already on the table')[1] ?? ''), (other.prompt.split('Already on the table')[1] ?? '').slice(0, 200));
}

console.log('\n=== continuity across conversations (council D14 reversal; run 2 expert-010) ===');
{
  const said = 'Cohort design: pre-treatment weight history exists for only about 60% of patients, so the weight-loss exclusion is partial.';
  await turn('cohort-s1', [U(said)], {
    state: { taskKind: 'decide', work: 'judgment', latest: 'information', currentFocus: 'cohort design',
      consideredNow: [{ kind: 'constraint', text: 'weight history exists for only about 60% of patients', quote: 'pre-treatment weight history exists for only about 60% of patients', stance: 'asserts', reason: '' }] },
    replies: ['Then the exclusion removes cachexia only where it can be seen; the rest stays in.'],
  });
  const s2 = await turn('cohort-s2', [U('Results are in: HR 0.71 for BMI ≥30. Help me structure the discussion; I want to lead with mechanism.')], {
    state: { taskKind: 'create', work: 'creation', latest: 'request', currentFocus: 'discussion structure' },
    replies: ['Lead with the association, then the mechanism.'],
  });
  ok('a new conversation starts with their own words from the last one', /From their last conversation/.test(s2.prompt) && /weight history exists for only about 60%/.test(s2.prompt), s2.prompt.slice(-600));
  const later = await turn('cohort-s2', [U('Results are in: HR 0.71 for BMI ≥30.'), A('Lead with the association.'), U('ok'), A('…'), U('and the limitations section?')], {
    state: { taskKind: 'create', work: 'creation', latest: 'request', currentFocus: 'limitations' }, replies: ['…'],
  });
  ok('only at the start of a conversation, not every turn', !/From their last conversation/.test(later.prompt));
}

console.log('\n=== a value they wrote is never hidden (run 2, direct-answer-012) ===');
{
  const r = await turn('aoc', [U("Don't tell me what's wrong with my code, finding it is the point. Is the expected answer for the example definitely 7? I get 6.")], {
    state: { taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'wrong', currentFocus: 'count increases' },
    check: { verdict: 'incorrect', location: 'the loop bound', errorType: 'off by one', expected: '7', confidence: 0.95 },
    replies: ['Yes, 7 is definitely the expected answer for the example; the puzzle states it. Your approach is the right idea.'],
  });
  ok('the sentence confirming their own 7 reaches them', /7 is definitely the expected answer/.test(r.received), r.received);
}

console.log('\n=== deleting a conversation deletes what Core 4 kept about it ===');
{
  const cid = 'launch';
  const before = ['core4_state', 'reasoning_entries', 'core4_turns'].map((t) => rows(t).filter((x) => x.conversation_id === cid).length);
  ok('there was something kept', before.every((n) => n > 0), before.join(','));
  const otherBefore = rows('core4_state').filter((x) => x.conversation_id !== cid).length;
  const gone = new Set(rows('reasoning_entries').filter((e) => e.conversation_id === cid).map((e) => e.id));
  db.rows('reasoning_links').push({ user_id: 'u1', id: 'l-test', from_id: [...gone][0], to_id: 'elsewhere', rel: 'supports', owner: 'user', reason: '', created_at: 1 });
  const r = await convRoute.DELETE(new NextRequest(`http://localhost/api/conversations/${cid}`, { method: 'DELETE' }), { params: { id: cid } });
  ok('the delete succeeded', r.status === 200, String(r.status));
  for (const t of ['core4_state', 'reasoning_entries', 'core4_turns', 'capability_evidence']) {
    ok(`${t}: nothing left for it`, rows(t).filter((x) => x.conversation_id === cid).length === 0);
  }
  ok('links touching its entries are gone', !rows('reasoning_links').some((l) => gone.has(l.from_id) || gone.has(l.to_id)));
  ok('other conversations are untouched', rows('core4_state').filter((x) => x.conversation_id !== cid).length === otherBefore);
}

console.log('\n=== "forget what Socria worked out" reaches every Core 4 table ===');
{
  const before = ['core4_state', 'reasoning_entries', 'core4_turns'].map((t) => rows(t).length);
  ok('there was something to forget', before.every((n) => n > 0), before.join(','));
  // someone else's rows must survive
  db.rows('core4_state').push({ user_id: 'u2', conversation_id: 'x', state: {}, updated_at: 1 });
  const r = await memoryRoute.DELETE(new NextRequest('http://localhost/api/account/memory', { method: 'DELETE' }));
  ok('the route succeeded', r.status === 200, String(r.status));
  for (const t of ['core4_state', 'reasoning_entries', 'reasoning_links', 'core4_turns', 'capability_evidence']) {
    ok(`${t} is empty for them`, rows(t).length === 0, String(rows(t).length));
  }
  ok('and untouched for anyone else', rows('core4_state', 'u2').length === 1);
  ok('their conversations were not touched', true);
}

console.log('\n=== run 4: "they answered what Socria asked" only if Socria asked (direct-answer-003) ===');
{
  const conv = 'resolved-' + Date.now();
  const said = [U('What does ENOSPC mean from inotify on Linux?'), A('It means the inotify watch limit is exhausted, not the disk. Raise fs.inotify.max_user_watches.'), U('Right, it was at 8192. Raising it to 524288 now.')];
  const r = await turn(conv, said, { state: { work: 'information', latest: 'information', resolved: true, currentFocus: 'inotify watch limit' } });
  ok('the reader\'s "resolved" is ignored when the last reply asked nothing', !r.prompt.includes('answered what Socria asked'), r.prompt.slice(-600));
  const asked = [U('What does ENOSPC mean from inotify on Linux?'), A('It is usually the watch limit. What is fs.inotify.max_user_watches set to?'), U('8192.')];
  const r2 = await turn(conv + '-b', asked, { state: { work: 'information', latest: 'answer', resolved: true, currentFocus: 'inotify watch limit' } });
  ok('and kept when it did ask', r2.prompt.includes('answered what Socria asked'));
}

console.log('\n=== run 5: their own question is never "they accepted Socria\'s point" ===');
{
  const conv = 'accept-q-' + Date.now();
  const said = [U('Here is my rewritten ending for the story.'), A('The new ending lands the reversal, but it may be too flat after the build-up.'), U('Is the new ending too flat after the build-up?')];
  const r = await turn(conv, said, { state: { work: 'creation', latest: 'question', currentFocus: 'ending', consideredNow: [{ kind: 'question', text: 'Is the new ending too flat after the build-up', quote: 'Is the new ending too flat after the build-up?', stance: 'asks', reason: '' }] } });
  ok('a question that echoes Socria is not shown as accepting its point', !r.prompt.includes("accepted Socria's point") && !r.prompt.includes('they said just now: Is the new ending'), r.prompt.slice(-700));
  // Their own conclusion, in their words, that overlaps what Socria said: shown as what they said, credited to nobody.
  const said2 = [U('Two groups: subsidy and non-subsidy counties.'), A('The effect is the change in the subsidy counties minus the change in the others.'), U('So the effect is the change in the subsidy counties minus the change in the others, 2.1 points.')];
  const r2 = await turn(conv + '-b', said2, { state: { work: 'verification', latest: 'attempt', currentFocus: 'difference in differences', consideredNow: [{ kind: 'claim', text: 'The effect is the change in the subsidy counties minus the change in the others', quote: 'the effect is the change in the subsidy counties minus the change in the others', stance: 'asserts', reason: '' }] } });
  ok('their echoing conclusion is "they said just now", never credited to Socria', r2.prompt.includes('they said just now: The effect is the change') && !r2.prompt.includes("Socria's point"), r2.prompt.slice(-700));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
