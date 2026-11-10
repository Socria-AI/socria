// SOCRIAUX'S TWO ROUTES, THROUGH THEIR REAL HANDLERS — with the model scripted.
//
// /api/ux/reason: only a session (or an access grant) may ask; what the model
// is told is the design itself, element by element, with the measured checks,
// in the mode the designer chose; screenshots never reach it; what comes back
// is made safe (invented element ids unpinned, links to missing nodes dropped)
// and returned as suggestions, never written anywhere.
//
// /api/ux/projects: one designer's projects, normalised before they are
// stored, invisible to anyone else, the newer copy winning.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-ux');
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
const bundle = (entry, out) =>
  build({
    entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, out),
    tsconfig: join(root, 'tsconfig.json'), plugins: [swap], external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
  });
await bundle('app/api/ux/reason/route.ts', 'reason.mjs');
await bundle('app/api/ux/projects/route.ts', 'projects.mjs');
await bundle('test/helpers/ux-under-test.ts', 'ux.mjs');

console.warn = () => {};
console.error = () => {};
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.SOCRIA_ONE_USER_IDS = 'user_ux_a,user_ux_b';

const A = 'user_ux_a';
const B = 'user_ux_b';
globalThis.__users = { [A]: { firstName: 'Ada', emails: ['a@example.com'] }, [B]: { firstName: 'Bo', emails: ['b@example.com'] } };

const reason = await import(pathToFileURL(join(OUT, 'reason.mjs')).href);
const projects = await import(pathToFileURL(join(OUT, 'projects.mjs')).href);
const ux = await import(pathToFileURL(join(OUT, 'ux.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));
const J = JSON.stringify;

const call = async (handler, url, init, uid, script = []) => {
  globalThis.__uid = uid;
  globalThis.__logosScript = [...script];
  globalThis.__logosCalls = [];
  const r = await handler(new NextRequest(`http://localhost${url}`, init));
  let json = null;
  try { json = await r.json(); } catch { /* not json */ }
  return { status: r.status, json, calls: globalThis.__logosCalls };
};
const post = (body, uid, script) => call(reason.POST, '/api/ux/reason', { method: 'POST', headers: { 'content-type': 'application/json' }, body: J(body) }, uid, script);

const project = ux.exampleProject(1_700_000_000_000);
const ab = project.artboards[0];
// a screenshot under the elements: it must never reach the model
ab.image = { src: 'data:image/jpeg;base64,' + 'A'.repeat(4000), w: 390, h: 844 };
const field = ab.elements.find((e) => e.kind === 'input');
const node = project.nodes[0];

const REPLY = {
  kind: 'critique',
  reply: 'Three fields rely on placeholders.',
  questions: ['What does the field ask once someone types?'],
  principles: [{ name: 'Recognition over recall', summary: 'Keep what people need visible.' }],
  annotations: [
    { elementId: field.id, kind: 'issue', severity: 'high', text: 'The prompt vanishes on the first keystroke.', principle: 'WCAG 3.3.2' },
    { elementId: 'el_made_up', kind: 'issue', severity: 'low', text: 'Pinned to nothing.' },
  ],
  nodes: [
    { kind: 'assumption', label: 'People remember placeholders', elementId: field.id, linkTo: node.id, linkKind: 'contradicts' },
    { kind: 'risk', label: 'Ghost link', linkTo: 'n_ghost', linkKind: 'supports' },
  ],
  code: null,
};

console.log('\n=== who may ask ===');
{
  const r = await post({ project, intent: 'critique', mode: 'guided', message: '', focus: { artboardId: ab.id } }, null, [REPLY]);
  ok('signed out: refused, told to sign in, nothing asked', r.status === 401 && r.json?.signIn === true && r.calls.length === 0, J(r));
}
{
  const r = await post({ intent: 'critique' }, A, [REPLY]);
  ok('no project: a 400, nothing asked', r.status === 400 && r.calls.length === 0, J(r));
  const empty = await post({ project, intent: 'ask', message: '   ' }, A, [REPLY]);
  ok('an empty question: a 400, nothing asked', empty.status === 400 && empty.calls.length === 0, J(empty));
}

console.log('\n=== what the model is told ===');
{
  const r = await post({ project, intent: 'critique', mode: 'direct', message: '', focus: { artboardId: ab.id, elementId: field.id } }, A, [REPLY]);
  ok('a signed-in critique answers', r.status === 200 && r.json?.message?.role === 'socria', J(r));
  const c = r.calls[0];
  const all = J(c?.messages ?? []);
  ok('one model call, in JSON mode', r.calls.length === 1 && c.response_format?.type === 'json_object');
  ok('the system prompt carries the chosen mode', /MODE: Direct assistance/.test(c.messages[0].content));
  ok('…and the move', /Critique the focused design/.test(c.messages[0].content));
  ok('the design is in it, element by element', ab.elements.every((e) => all.includes(e.id)));
  ok('…with the selection named', all.includes('SELECTED ELEMENT'));
  ok('…and what the checks measured', all.includes('AUTOMATIC CHECKS') && all.includes('WCAG 2.2 · 3.3.2'));
  ok('…and the research, beliefs marked as beliefs', all.includes('belief, not observed'));
  ok('the screenshot never reaches the model', !all.includes('AAAAAAAAAA') && all.includes('uploaded screenshot is painted under'));
  ok('the default wording is asked when no words were typed', /Critique the design I have selected/.test(c.messages.at(-1).content));
}

console.log('\n=== what comes back ===');
{
  const r = await post({ project, intent: 'critique', mode: 'guided', message: '', focus: { artboardId: ab.id } }, A, [REPLY]);
  const m = r.json.message;
  const anns = m.suggestions.filter((s) => s.type === 'annotation');
  const nodes = m.suggestions.filter((s) => s.type === 'node');
  ok('the mode is echoed on the message', m.mode === 'guided');
  ok('a real element keeps its pin', anns[0].elementId === field.id);
  ok('an invented element is unpinned', anns[1].elementId === null);
  ok('a link to a real node stays, a ghost link goes', nodes[0].linkTo === node.id && nodes[1].linkTo === null);
  ok('everything is a pending suggestion', m.suggestions.every((s) => s.state === 'pending'));
  ok('nothing was written', db.rows('ux_projects').length === 0);
  const back = ux.reduce(project, { type: 'message/add', message: m });
  ok('the returned message is accepted by the project as it is', back.messages.at(-1).suggestions.length === 4);
}
{
  const r = await post({ project, intent: 'code', mode: 'guided', message: 'How do I build the button?', focus: { artboardId: ab.id } }, A, [
    { kind: 'code', reply: 'A button, not a div.', code: { language: 'html', title: 'Button', content: '<button type="button">Create account</button>', explanation: 'Native semantics.' } },
  ]);
  ok('code is returned in guided mode when it is asked for', r.json?.message?.code?.content.includes('<button'), J(r.json));
  ok('…with a larger budget for the long answer', (r.calls[0].max_completion_tokens ?? r.calls[0].max_tokens) > 2000, J({ a: r.calls[0].max_tokens, b: r.calls[0].max_completion_tokens }));
}
{
  const r = await post({ project, intent: 'ask', message: 'hi' }, A, [new Error('upstream down')]);
  ok('a model failure is a 502 with a calm message, not a crash', r.status === 502 && /saved/.test(r.json?.error ?? ''), J(r));
  const prose = await post({ project, intent: 'ask', message: 'hi' }, A, ['Plain words, no JSON.']);
  ok('prose from the model still arrives as a message', prose.status === 200 && prose.json.message.text === 'Plain words, no JSON.');
}

console.log('\n=== projects: stored, private, newest wins ===');
const put = (p, uid) => call(projects.PUT, '/api/ux/projects', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: J({ project: p }) }, uid);
const get = (q, uid) => call(projects.GET, `/api/ux/projects${q}`, { method: 'GET' }, uid);
const del = (q, uid) => call(projects.DELETE, `/api/ux/projects${q}`, { method: 'DELETE' }, uid);
{
  const p = ux.makeProject('Mine', {}, 1000);
  ok('signed out: no list', (await get('', null)).status === 401);
  ok('signed out: no save', (await put(p, null)).status === 401 && db.rows('ux_projects').length === 0);
  const saved = await put(p, A);
  ok('a signed-in save', saved.status === 200 && saved.json.ok, J(saved));
  const row = db.rows('ux_projects').find((r) => r.id === p.id);
  ok('…stored under its owner', row?.user_id === A);
  ok('the owner lists it', (await get('', A)).json.projects.some((x) => x.id === p.id));
  ok('someone else does not', !(await get('', B)).json.projects.some((x) => x.id === p.id));
  ok('someone else cannot read it by id', (await get(`?id=${p.id}`, B)).status === 404);
  ok('the owner reads it back whole', J((await get(`?id=${p.id}`, A)).json.project) === J(p));
  const stale = await put({ ...p, name: 'Older', updatedAt: 500 }, A);
  ok('an older copy does not overwrite a newer one', stale.status === 409 && stale.json.stale === true);
  const evil = await put({ ...p, updatedAt: 2000, artboards: [{ elements: [{ kind: 'script', fill: 'javascript:x' }] }] }, A);
  ok('a hostile document is stored normalised', evil.status === 200 && J(db.rows('ux_projects').find((r) => r.id === p.id).doc).includes('"kind":"rect"') && !J(db.rows('ux_projects')).includes('javascript:'));
  ok('someone else cannot delete it', (await del(`?id=${p.id}`, B)).status === 200 && db.rows('ux_projects').some((r) => r.id === p.id));
  ok('the owner can', (await del(`?id=${p.id}`, A)).status === 200 && !db.rows('ux_projects').some((r) => r.id === p.id));
  ok('a bad id is refused', (await del('?id=../x', A)).status === 400);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
