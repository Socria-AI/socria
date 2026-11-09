// THE LIVE GUIDANCE ROUTE, THROUGH ITS REAL HANDLER — with the vision model scripted.
//
// What is held down: only signed-in testers may look (the same early-access
// rule as AR Mode, decided before anything is read or spent); an emergency or
// a job not to learn from a guide is answered from the words, with no model
// asked and no frame needed; only a small camera frame is accepted; what the
// model says is shaped before it is returned, and its reading can make the
// guidance stricter, never looser; a frame goes at low detail and is never
// logged; a plan counts as one image read, a check does not.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-guide');
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
  entryPoints: [join(root, 'app/api/logos/guide/route.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'guide.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
});

await build({
  entryPoints: [join(root, 'lib/access-codes-server.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'access.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], logLevel: 'error',
});

const warned = [];
const errored = [];
console.warn = (...a) => warned.push(a.map(String).join(' '));
console.error = (...a) => errored.push(a.map(String).join(' '));
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.SOCRIA_AR_TESTERS = 'tester@example.com';
// Live Guidance is one of the experiments, which are Socria One's (lib/entitlements.ts, November 9, 2026):
// the suite's two accounts hold Socria One through the operator's list
process.env.SOCRIA_ONE_USER_IDS = 'user_guide_tester,user_guide_other';
delete process.env.SOCRIA_DASHBOARD_ADMINS;

const TESTER = 'user_guide_tester';
const OTHER = 'user_guide_other';
globalThis.__users = {
  [TESTER]: { firstName: 'Tess', emails: ['tester@example.com'] },
  [OTHER]: { firstName: 'Olly', emails: ['other@example.com'] },
};

const route = await import(pathToFileURL(join(OUT, 'guide.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');
const access = await import(pathToFileURL(join(OUT, 'access.mjs')).href);

// a plan counts one image read: count the counter the route bumps, as the database function does
const bumps = [];
const installCounter = () => {
  db.rpcs.bump_logos_usage = (a) => {
    bumps.push(a);
    const rows = db.rows('logos_usage');
    let row = rows.find((r) => r.user_id === a.p_user && r.scope === a.p_scope && r.counter === a.p_counter);
    if (!row) rows.push((row = { user_id: a.p_user, scope: a.p_scope, counter: a.p_counter, n: 0 }));
    row.n += a.p_by ?? 1;
    return { data: row.n, error: null };
  };
};
installCounter();

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));
const J = JSON.stringify;

// a tiny real JPEG header is not needed: the route checks the shape of a data URL, the model reads it
const FRAME = 'data:image/jpeg;base64,' + Buffer.from('a small camera frame '.repeat(40)).toString('base64');

async function ask(body, script = [], uid = TESTER, cookie = null) {
  globalThis.__uid = uid;
  globalThis.__logosScript = [...script];
  globalThis.__logosCalls = [];
  const headers = { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) };
  const r = await route.POST(new NextRequest('http://localhost/api/logos/guide', { method: 'POST', headers, body: typeof body === 'string' ? body : J(body) }));
  let json = null;
  try { json = await r.json(); } catch { /* not json */ }
  return { status: r.status, json, calls: globalThis.__logosCalls, guide: r.headers.get('x-socria-guide') };
}

const JAR = {
  task: 'Open the jar',
  objects: [
    { id: 'jar', label: 'Jar', box: { x: 0.3, y: 0.35, w: 0.3, h: 0.45 }, confidence: 0.9 },
    { id: 'lid', label: 'Lid', box: { x: 0.32, y: 0.25, w: 0.26, h: 0.1 }, confidence: 0.5 },
  ],
  steps: [
    { say: 'Hold the jar firmly with your other hand.', check: 'One hand round the jar', overlays: [{ kind: 'highlight', target: 'jar', text: 'hold here' }] },
    { say: 'Twist the lid anticlockwise.', check: 'The lid is loose', overlays: [{ kind: 'motion', target: 'lid', motion: 'twist-ccw' }, { kind: 'arrow', target: 'ghost', to: 'lid' }] },
    { say: 'Lift the lid off.', overlays: [{ kind: 'arrow', target: 'jar', to: 'lid', text: 'lift' }] },
  ],
  confidence: 0.8,
  uncertain: 'The lid might be a pull-off cap.',
  safety: 'none',
};

console.log('\n=== who may look ===');
{
  const r = await ask({ mode: 'plan', image: FRAME, question: 'How do I open this jar?' }, [JAR], null);
  ok('signed out: refused, nothing asked', r.status === 401 && r.calls.length === 0, J(r));
}
{
  bumps.length = 0;
  const r = await ask({ mode: 'plan', image: FRAME, question: 'How do I open this jar?' }, [JAR], OTHER);
  ok('signed in but not a tester: early access, nothing asked or spent', r.status === 403 && r.json?.earlyAccess === true && r.calls.length === 0 && bumps.length === 0, J(r));
}
{
  // a tester on the trial: the experiments are Socria One's, so nothing is asked or spent
  globalThis.__users.user_guide_trial = { emails: ['tester@example.com'] };
  const r = await ask({ mode: 'plan', image: FRAME, question: 'jar' }, [JAR], 'user_guide_trial');
  ok('a tester without Socria One: told it is part of Socria One, nothing asked or spent', r.status === 402 && r.json?.upgrade === 'experiments' && r.calls.length === 0, J(r));
}
{
  // an address on the list that was never confirmed proves nothing
  globalThis.__users.user_guide_unverified = { emails: ['tester@example.com'], unverified: ['tester@example.com'] };
  const r = await ask({ mode: 'plan', image: FRAME, question: 'jar' }, [JAR], 'user_guide_unverified');
  ok('an unverified address on the list is not a tester', r.status === 403, J(r));
}
{
  process.env.SOCRIA_AR_TESTERS = '*';
  const r = await ask({ mode: 'plan', image: FRAME, question: 'How do I open this jar?' }, [JAR], OTHER);
  ok('`*` off production opens it to anyone signed in', r.status === 200 && r.json?.plan, J(r));
  process.env.SOCRIA_AR_TESTERS = 'tester@example.com';
}
{
  // a visitor without an account, holding the access code's grant (as every Logos route accepts)
  process.env.SOCRIA_ACCESS_CODE = 'guide-test-code-1234';
  const cookie = `${access.ACCESS_COOKIE}=${access.issueGrant('core', Date.now())}`;
  const shut = await ask({ mode: 'plan', image: FRAME, question: 'How do I open this jar?' }, [JAR], null, cookie);
  ok('a visitor with the access code but no account: early access still says no', shut.status === 403 && shut.calls.length === 0, J(shut));
  process.env.SOCRIA_AR_TESTERS = '*';
  const open = await ask({ mode: 'plan', image: FRAME, question: 'How do I open this jar?' }, [JAR], null, cookie);
  ok('  …and even where AR Mode is open to everyone, a visitor has no Socria One: the experiments are One’s', open.status === 402 && open.json?.upgrade === 'experiments' && open.calls.length === 0, J(open));
  const forged = await ask({ mode: 'plan', image: FRAME, question: 'jar' }, [JAR], null, `${access.ACCESS_COOKIE}=core.9999999999999.forged`);
  ok('  …a forged grant is no grant', forged.status === 401 && forged.calls.length === 0, J(forged));
  process.env.SOCRIA_AR_TESTERS = 'tester@example.com';
  delete process.env.SOCRIA_ACCESS_CODE;
}

console.log('\n=== safety first, from the words ===');
{
  bumps.length = 0;
  const r = await ask({ mode: 'plan', question: 'my friend is choking and can’t breathe' }, [JAR]);
  ok('an emergency: answered at once, no model asked, no frame needed, nothing spent', r.status === 200 && r.calls.length === 0 && bumps.length === 0, J(r));
  ok('  …a stop, with who to call and the first safe things to do, and no steps', r.json?.plan?.safety === 'stop' && /999|112|911/.test(r.json.plan.escalate ?? '') && (r.json.plan.first ?? []).length > 0 && r.json.plan.steps.length === 0, J(r.json));
  // the header names the rule that matched — a word from the code, never the person's own words
  ok('  …and the header names the rule, not the question', /^safety:[a-z-]+$/.test(r.guide ?? '') && !/friend|breathe/.test(r.guide ?? ''), r.guide);
  ok('  …labelled an emergency', r.json?.safety === 'emergency', J(r.json));
}
{
  const r = await ask({ mode: 'plan', image: FRAME, question: 'how do I rewire this plug socket in the wall' }, [JAR]);
  ok('mains wiring: a stop with who to call, no model asked', r.status === 200 && r.calls.length === 0 && r.json?.plan?.safety === 'stop' && /electrician/i.test(r.json.plan.escalate ?? ''), J(r.json));
}

console.log('\n=== the frame ===');
{
  const r = await ask({ mode: 'plan', question: 'How do I open this jar?' }, [JAR]);
  ok('no frame: refused before the model', r.status === 400 && r.calls.length === 0, J(r));
}
{
  const r = await ask({ mode: 'plan', image: 'https://example.com/a.jpg', question: 'jar' }, [JAR]);
  ok('a link is not a frame', r.status === 400 && r.calls.length === 0);
}
{
  const r = await ask({ mode: 'plan', image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', question: 'jar' }, [JAR]);
  ok('an SVG is not a camera frame', r.status === 400 && r.calls.length === 0);
}
{
  const r = await ask({ mode: 'plan', image: 'data:image/jpeg;base64,' + 'A'.repeat(400_100), question: 'jar' }, [JAR]);
  ok('a frame far bigger than 512px: refused', r.status === 400 && r.calls.length === 0);
}
{
  const r = await ask({ mode: 'look', image: FRAME, question: 'jar' }, [JAR]);
  ok('an unknown mode: refused', r.status === 400 && r.calls.length === 0);
}
{
  const r = await ask('not json', [JAR]);
  ok('a body that is not JSON: refused', r.status === 400 && r.calls.length === 0);
}

console.log('\n=== a plan ===');
{
  bumps.length = 0;
  const r = await ask({ mode: 'plan', image: FRAME, question: 'How do I open this jar?', sessionId: 'conv_guide_1' }, [JAR]);
  const p = r.json?.plan;
  ok('a plan comes back shaped', r.status === 200 && p && p.task === 'Open the jar' && p.objects.length === 2 && p.steps.length === 3, J(r.json));
  ok('  …an overlay aimed at nothing it saw is dropped', p && p.steps[1].overlays.length === 1 && p.steps[1].overlays[0].kind === 'motion', J(p?.steps?.[1]));
  ok('  …what it is unsure of is kept, to be said', p?.uncertain === JAR.uncertain);
  ok('  …the header carries counts, not content', r.guide === 'plan:3:2:none:80', r.guide);
  ok('  …counted as one image read, in this conversation', bumps.length === 1 && bumps[0].p_counter === 'images' && bumps[0].p_user === TESTER, J(bumps));
  const c = r.calls[0];
  const img = c?.messages?.[1]?.content?.find?.((x) => x.type === 'image_url');
  // the call is shaped for the model it goes to (lib/model-params.ts): a reasoning model takes max_completion_tokens
  const cap = (x) => x?.max_completion_tokens ?? x?.max_tokens;
  ok('one call: JSON only, no reasoning spent, a small answer', r.calls.length === 1 && c.response_format?.type === 'json_object' && (c.temperature === 0 || c.temperature === undefined) && (c.reasoning_effort ?? 'none') === 'none' && cap(c) === 800, J({ ...c, messages: undefined }));
  ok('  …the frame read at low detail', img?.image_url?.detail === 'low' && img.image_url.url === FRAME);
  ok('  …the plan prompt, and the question', /SOCRIA LIVE GUIDE — PLAN/.test(c?.messages?.[0]?.content ?? '') && c.messages[1].content[0].text === 'Question: How do I open this jar?');
}
{
  const before = errored.length + warned.length;
  await ask({ mode: 'plan', image: FRAME, question: 'How do I open this jar?' }, [new Error('upstream down')]);
  const said = [...errored, ...warned].slice(before).join('\n');
  ok('a failure is logged without the frame or the question', !said.includes('base64') && !/jar/i.test(said), said);
}
{
  const r = await ask({ mode: 'plan', image: FRAME, question: 'How do I open this jar?' }, ['I think it is a jar']);
  ok('an answer that is not JSON: said so, nothing made up', r.status === 422 && !r.json?.plan, J(r));
}
{
  const r = await ask({ mode: 'plan', image: FRAME, question: 'How do I open this jar?' }, [new Error('upstream down')]);
  ok('no answer: said so', r.status === 500 && /could not look/.test(r.json?.error ?? ''), J(r));
}
{
  // the model's own reading is stricter than the words: it holds, and no steps are drawn
  const r = await ask({ mode: 'plan', image: FRAME, question: 'how do I fix this?' }, [{ ...JAR, safety: 'stop', safetyNote: 'That is a gas valve.', escalate: 'Call a Gas Safe engineer.' }]);
  ok('the model says stop: no steps, its note and who to call', r.json?.plan?.safety === 'stop' && r.json.plan.steps.length === 0 && /Gas Safe/.test(r.json.plan.escalate ?? ''), J(r.json));
}
{
  // the words are stricter than the model: the words hold, and their note is filled in
  const r = await ask({ mode: 'plan', image: FRAME, question: 'how do I sharpen this kitchen knife' }, [{ ...JAR, task: 'Sharpen the knife', safety: 'none' }]);
  ok('the words say caution and the model said none: caution holds, with a note', r.status === 200 && r.json?.plan?.safety === 'caution' && (r.json.plan.safetyNote ?? '').length > 0 && r.json.plan.steps.length > 0, J(r.json?.plan && { safety: r.json.plan.safety, note: r.json.plan.safetyNote }));
}
{
  // a box in percent, and an object far outside the frame, are brought into it
  const r = await ask({ mode: 'plan', image: FRAME, question: 'jar' }, [{ ...JAR, objects: [{ id: 'jar', label: 'Jar', box: { x: 30, y: 35, w: 30, h: 45 }, confidence: 1.4 }, JAR.objects[1]] }]);
  const b = r.json?.plan?.objects?.[0]?.box;
  ok('boxes in percent are read as fractions, confidence held to 0–1', b && Math.abs(b.x - 0.3) < 1e-9 && Math.abs(b.w - 0.3) < 1e-9 && r.json.plan.objects[0].confidence <= 1, J(r.json?.plan?.objects));
}

console.log('\n=== a check ===');
const STEP = { task: 'Open the jar', step: 'Twist the lid anticlockwise.', done: 'The lid is loose', objects: ['Jar', 'Lid'] };
{
  bumps.length = 0;
  const r = await ask({ mode: 'check', image: FRAME, step: STEP }, [{ done: true, saw: 'The lid is off.', confidence: 0.85 }]);
  ok('done: said so, with what it saw', r.status === 200 && r.json?.check?.done === true && r.json.check.saw === 'The lid is off.', J(r));
  ok('  …a check is not counted as an image read', bumps.length === 0, J(bumps));
  const c = r.calls[0];
  ok('  …a smaller call, at low detail, that carries only the step', (c?.max_completion_tokens ?? c?.max_tokens) === 260 && /CHECK/.test(c.messages[0].content) && c.messages[1].content[0].text === 'Task: Open the jar\nStep: Twist the lid anticlockwise.\nDone looks like: The lid is loose\nObjects: Jar; Lid' && c.messages[1].content[1].image_url.detail === 'low', J(c?.messages?.[1]?.content?.[0]));
  ok('  …the header carries the verdict, not the words', r.guide === 'check:done:85', r.guide);
}
{
  const r = await ask({ mode: 'check', image: FRAME, step: STEP }, [{ done: false, saw: 'The lid has not moved.', retry: 'Grip the lid with a tea towel and twist harder.', confidence: 0.7, objects: [{ id: 'lid', label: 'Lid', box: { x: 0.4, y: 0.2, w: 0.2, h: 0.1 }, confidence: 0.8 }] }]);
  ok('not yet: a clearer instruction, and where things are now', r.json?.check?.done === false && /tea towel/.test(r.json.check.retry ?? '') && r.json.check.objects?.[0]?.id === 'lid', J(r.json));
}
{
  const r = await ask({ mode: 'check', image: FRAME, step: STEP }, ['no idea']);
  ok('could not tell: not done, and it says so', r.status === 200 && r.json?.check?.done === false && /could not tell/i.test(r.json.check.saw) && r.json.check.confidence === 0, J(r.json));
}
{
  const r = await ask({ mode: 'check', image: FRAME, step: STEP }, [{ done: false, saw: 'There is smoke from the socket.', confidence: 0.6, safety: 'stop', safetyNote: 'Switch it off at the wall and step back.' }]);
  ok('a check that sees danger says stop', r.json?.check?.safety === 'stop' && /Switch it off/.test(r.json.check.safetyNote ?? ''), J(r.json));
}
{
  const r = await ask({ mode: 'check', image: FRAME }, [{ done: true, saw: 'x', confidence: 1 }]);
  ok('a check without its step: refused before the model', r.status === 400 && r.calls.length === 0, J(r));
}

console.log('\n=== the allowance ===');
{
  // this conversation has read as many images as it may: a plan is refused, a check still answers
  const scope = bumps.length ? bumps[0].p_scope : null;
  bumps.length = 0;
  await ask({ mode: 'plan', image: FRAME, question: 'jar', sessionId: 'conv_guide_full' }, [JAR]);
  const sc = bumps[0]?.p_scope;
  const row = db.rows('logos_usage').find((x) => x.scope === sc && x.counter === 'images' && x.user_id === TESTER);
  if (row) row.n = 10_000;
  const r = await ask({ mode: 'plan', image: FRAME, question: 'jar', sessionId: 'conv_guide_full' }, [JAR]);
  ok('images spent: a plan is refused with the upgrade, no model asked', r.status === 402 && r.json?.upgrade === 'images' && r.calls.length === 0, J(r));
  const c = await ask({ mode: 'check', image: FRAME, step: STEP, sessionId: 'conv_guide_full' }, [{ done: false, saw: 'x', confidence: 0.4 }]);
  ok('  …a check of a task already planned still answers', c.status === 200 && c.json?.check, J(c));
  void scope;
}

console.log(`\nguide-route: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
