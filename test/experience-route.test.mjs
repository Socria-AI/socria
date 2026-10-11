// THE EXPERIENCE ROUTE, THROUGH ITS REAL HANDLER — with the language model scripted.
//
// What is held down: only signed-in people (or the access key) may ask; only
// the asks it knows are answered; the state it is sent is read by the kind,
// and nothing else of it is trusted; what the model proposes comes back only
// as operations the kind accepts from Socria — a counterpart's line marked
// simulated, never the person's line; suggestions that recommend an option or
// give odds are dropped; and when no model answers, it says so rather than
// making something up.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-experience');
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
await build({
  entryPoints: [join(root, 'app/api/logos/experience/route.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'experience.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
});
await build({
  entryPoints: [join(root, 'lib/objects/index.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'objects.mjs'), tsconfig: join(root, 'tsconfig.json'), logLevel: 'error',
});

console.warn = () => {};
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_experience_e2e';

const route = await import(pathToFileURL(join(OUT, 'experience.mjs')).href);
const { create, apply, currentOf, EMPTY_SPACE } = await import(pathToFileURL(join(OUT, 'objects.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

async function askRoute(body, script) {
  globalThis.__logosScript = [...script];
  globalThis.__logosCalls = [];
  const r = await route.POST(new NextRequest('http://localhost/api/logos/experience', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, json: await r.json(), calls: globalThis.__logosCalls };
}

// a rehearsal where the person has said their first line
let sp = create(EMPTY_SPACE, 'rehearsal', { title: 'Raise', goal: 'ask my manager for a raise', goalBy: 'person', counterpart: { name: '', role: 'my manager', about: 'busy, fair' }, counterpartBy: 'person' }, { origin: 'person', name: 'RR1' }).space;
const id = sp.objs[0].id;
sp = apply(sp, id, 'say', { who: 'you', text: 'Could we talk about my salary?', by: 'person' }, { by: 'person' }).space;
const rr = currentOf(sp.objs[0]);

{
  const r = await askRoute({ kind: 'rehearsal', action: 'reply', state: rr }, [{ line: 'Sure — what did you have in mind?' }]);
  ok('the counterpart’s line comes back as Socria’s operation', r.status === 200 && r.json.ops?.length === 1 && r.json.ops[0].op === 'say' && r.json.ops[0].args.who === 'them' && r.json.ops[0].args.by === 'socria', JSON.stringify(r.json));
  const sys = String(r.calls[0]?.messages?.[0]?.content ?? '');
  ok('the model is told it plays one role and never the person', /ONE role/.test(sys) && /Never write the person's lines/.test(sys));
  ok('…that it is a simulation, not a prediction', /not a prediction/.test(sys));
  ok('…and what the person said about them is their view', /their view, not a fact/.test(sys));
  ok('the conversation is the person’s line as user', r.calls[0].messages[1]?.role === 'user' && /salary/.test(r.calls[0].messages[1].content));
  const applied = apply(sp, id, r.json.ops[0].op, r.json.ops[0].args, { by: 'socria' });
  ok('…which the browser applies, marked simulated', applied.ok && currentOf(applied.space.objs[0]).turns.at(-1).basis === 'simulated');
}
{
  const r = await askRoute({ kind: 'rehearsal', action: 'reply', state: currentOf(apply(sp, id, 'say', { who: 'them', text: 'Go on.', by: 'socria' }, { by: 'socria' }).space.objs[0]) }, [{ line: 'x' }]);
  ok('not the counterpart’s turn: refused before any model is asked', r.status === 409 && r.calls.length === 0, JSON.stringify(r.json));
}
{
  const r = await askRoute({ kind: 'rehearsal', action: 'rephrase', state: rr }, [{ text: 'I’d like to discuss my compensation.' }]);
  ok('another way to say it is offered as a suggestion, not their line', r.status === 200 && r.json.ops[0].op === 'hint' && r.json.ops[0].args.by === 'socria');
}
{
  const r = await askRoute({ kind: 'rehearsal', action: 'reply', state: rr }, ['not json']);
  ok('an unreadable answer: nothing is made up', r.status === 422 && !r.json.ops);
}
{
  const r = await askRoute({ kind: 'rehearsal', action: 'reply', state: rr }, [new Error('upstream down')]);
  ok('no answer: said so', r.status === 502 && /could not answer/.test(r.json.error));
}
{
  const r = await askRoute({ kind: 'rehearsal', action: 'write-my-lines', state: rr }, []);
  ok('an ask it does not know: refused', r.status === 400);
  const bad = await askRoute({ kind: 'rehearsal', action: 'reply', state: 'nonsense' }, []);
  ok('a state the kind cannot read: refused', bad.status === 400);
}

// untangle: readings and groups, never a commitment, never the person's own call
{
  let u = create(EMPTY_SPACE, 'untangle', { dump: 'pay rent; call mom; finish essay' }, { origin: 'person', name: 'UT1' }).space;
  const uid = u.objs[0].id;
  u = apply(u, uid, 'separate', {}, { by: 'person' }).space;
  u = apply(u, uid, 'cat', { id: 't2', cat: 'goal', by: 'person' }, { by: 'person' }).space;
  const st = currentOf(u.objs[0]);
  const r = await askRoute({ kind: 'untangle', action: 'sort', state: st }, [
    { cats: [{ id: 't1', cat: 'task' }, { id: 't2', cat: 'task' }, { id: 't3', cat: 'commitment' }], groups: [{ name: 'Money', ids: ['t1'] }, { name: 'School', ids: ['t3'] }], ties: [{ from: 't1', to: 't3' }] },
  ]);
  const ops = r.json.ops ?? [];
  ok('readings come back as suggestions', ops.some((o) => o.op === 'cat' && o.args.id === 't1'));
  ok('the person’s own call is not overridden', !ops.some((o) => o.op === 'cat' && o.args.id === 't2'));
  ok('nothing is made a commitment', !ops.some((o) => o.args.cat === 'commitment'));
  ok('groups are made and filled', ops.filter((o) => o.op === 'addCluster').length === 2 && ops.filter((o) => o.op === 'place').length === 2);
  ok('a connection is suggested, unconfirmed', ops.some((o) => o.op === 'tie' && o.args.by === 'socria'));
  const sys = String(r.calls[0]?.messages?.[0]?.content ?? '');
  ok('the model is told never to infer feelings', /Never infer emotions/.test(sys));
}

// crossroads: questions and unknowns, never a recommendation; scenarios without odds
{
  const cr = create(EMPTY_SPACE, 'crossroads', { decision: 'Austin or Dallas', alternatives: [{ id: 'a1', name: 'Austin', by: 'person' }, { id: 'a2', name: 'Dallas', by: 'person' }] }, { origin: 'person', name: 'CR1' }).space;
  const st = currentOf(cr.objs[0]);
  const r = await askRoute({ kind: 'crossroads', action: 'consider', state: st }, [
    { questions: ['Is the Austin salary negotiable?', 'You should go with Dallas, honestly.'], assumptions: [{ text: 'Rent in Austin is higher', alt: 'a1' }], unknowns: [{ alt: 'a2', text: 'Whether the Dallas team is stable' }] },
  ]);
  const ops = r.json.ops ?? [];
  ok('questions, assumptions and unknowns come back', ops.some((o) => o.op === 'addQuestion') && ops.some((o) => o.op === 'addAssumption') && ops.some((o) => o.op === 'addNote' && o.args.kind === 'unknown'));
  ok('a recommendation is dropped', !ops.some((o) => /should go with/i.test(String(o.args.text))));
  const im = await askRoute({ kind: 'crossroads', action: 'imagine', alt: 'a1', state: st }, [{ best: 'The new team clicks and you grow fast.', plausible: 'It is good work with a longer commute than hoped.', worst: 'There is a 40% chance the role is cut.' }]);
  const sc = im.json.ops ?? [];
  ok('hypothetical scenarios come back, as Socria’s', sc.length === 2 && sc.every((o) => o.op === 'addScenario' && o.args.by === 'socria'));
  ok('a scenario with odds is dropped', !sc.some((o) => /%/.test(String(o.args.text))));
  const none = await askRoute({ kind: 'crossroads', action: 'imagine', alt: 'zz', state: st }, []);
  ok('an option that is not there: refused', none.status === 409);
}

// common ground: suggestions labelled, agreed by no one; never a perspective
{
  let g = create(EMPTY_SPACE, 'commonground', { question: 'Move to Denver?' }, { origin: 'person', name: 'CG1' }).space;
  const gid = g.objs[0].id;
  g = apply(g, gid, 'join', { as: 'u1', name: 'Ana' }, { by: 'person' }).space;
  g = apply(g, gid, 'perspective', { as: 'u1', position: 'Yes — my job', why: 'career' }, { by: 'person' }).space;
  const r = await askRoute({ kind: 'commonground', action: 'suggest', state: currentOf(g.objs[0]) }, [{ items: [{ kind: 'experiment', text: 'Visit for a week' }, { kind: 'fact', text: 'Denver is cheaper' }, { kind: 'goal', text: 'Both want stability' }] }]);
  const ops = r.json.ops ?? [];
  ok('suggestions come back as Socria’s', ops.length === 2 && ops.every((o) => o.op === 'add' && o.args.by === 'socria'));
  ok('Socria does not assert facts here', !ops.some((o) => o.args.kind === 'fact'));
  const empty = await askRoute({ kind: 'commonground', action: 'suggest', state: { question: 'x' } }, []);
  ok('nothing written yet: no suggestions from nothing', empty.status === 409);
}

{
  globalThis.__uid = null;
  const r = await askRoute({ kind: 'rehearsal', action: 'reply', state: rr }, []);
  ok('signed out without a key: refused', r.status === 401);
  globalThis.__uid = 'user_experience_e2e';
}

console.log(`experience route: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
