// A CHANGE TO AN ARTIFACT, THROUGH THE REAL REPLY ROUTE (Logos 6, November 2026) — the model scripted
// (test/helpers/fake-openai-logos.mjs), so this shows what the person gets whatever the model writes, not that a real
// model writes it well.
//
// Held down: asked to change the mind map Socria just drew, the reply model is told that map (its JSON and ref) and how
// a change to it is written; the edit block it writes reaches the person in canonical form, what it changes said by the
// code; an edit that would not hold reaches them as a sentence saying so, never as JSON; an edit nobody asked for
// reaches them as nothing; a question about the map gets no edit context at all; the kept artifact open in Artifacts
// is the one changed when there is one.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-artifact-focus');
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
  entryPoints: [join(root, 'app/api/logos/chat/route.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'chat.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
});
await build({
  entryPoints: [join(root, 'lib/inline-ui.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'inline-ui.mjs'), tsconfig: join(root, 'tsconfig.json'), logLevel: 'error',
});
await build({
  entryPoints: [join(root, 'lib/objects/index.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'objects.mjs'), tsconfig: join(root, 'tsconfig.json'), logLevel: 'error',
});

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('logos') || first.startsWith('[logos') || first.startsWith('[socria') || first.startsWith('stream error')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_artifact_focus_e2e';

const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const U = await import(pathToFileURL(join(OUT, 'inline-ui.mjs')).href);
const O = await import(pathToFileURL(join(OUT, 'objects.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const fence = (o) => '```ui\n' + J(o) + '\n```';

const MIND = U.sanitizeInlineSpec({ type: 'diagram', view: 'mind', title: 'The immune system', nodes: [{ id: 'r', label: 'The immune system' }, { id: 'a', label: 'Innate immunity' }, { id: 'b', label: 'Adaptive immunity' }, { id: 'c', label: 'B cells' }, { id: 'd', label: 'T cells' }], edges: [['r', 'a'], ['r', 'b'], ['b', 'c'], ['b', 'd']] });
const REPLY = { id: 'm_reply1', role: 'assistant', content: 'Here is how the parts fit together.\n\n' + fence(MIND) + '\n\nThe innate side acts first; the adaptive side learns.' };
const ADD = { type: 'edit', of: 'm_reply1:0', ops: [{ op: 'add', path: '/nodes/-', value: { id: 'n6', label: 'Memory cells' } }, { op: 'add', path: '/edges/-', value: ['b', 'n6'] }], note: 'added memory cells' };

async function turn(said, reply, extra = {}, history = [{ role: 'user', content: 'How does the immune system fit together?' }, REPLY]) {
  globalThis.__logosPrompts = [];
  globalThis.__logosCalls = [];
  globalThis.__logosScript = [];
  globalThis.__logosReply = reply;
  const req = new NextRequest('http://localhost/api/logos/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [...history, { role: 'user', content: said }], persona: 'logos5-v8', ...extra }),
  });
  const r = await chatRoute.POST(req);
  const text = await r.text();
  return { status: r.status, text, prompt: globalThis.__logosPrompts.join('\n') };
}

console.log('\n=== asked to change the map Socria just drew ===');
{
  const t = await turn('Add memory cells under adaptive immunity', 'I added memory cells under adaptive immunity — they are what makes a second infection milder.\n\n' + fence(ADD) + '\n');
  ok('the route answers', t.status === 200, String(t.status));
  ok('the reply model is told the map they mean: its JSON, its ref, and how a change is written', /THE ARTIFACT THEY MEAN — “The immune system”, a diagram drawn in your last reply \(ref "m_reply1:0"\)/.test(t.prompt) && t.prompt.includes(J(MIND)) && /"type":"edit","of":"m_reply1:0"/.test(t.prompt), t.prompt.slice(-1600));
  const edits = U.editsIn(t.text);
  ok('the edit reaches the person in canonical form, what it changes said by the code', edits.length === 1 && edits[0].edit.of === 'm_reply1:0' && edits[0].edit.said === 'added “Memory cells” under “Adaptive immunity”' && edits[0].edit.title === 'The immune system', t.text);
  ok('…and no second copy of the map is drawn', U.specsIn(t.text).filter(Boolean).length === 0);
  ok('…with the sentence around it', /makes a second infection milder/.test(t.text));
}

console.log('\n=== an edit that would not hold ===');
{
  const orphan = { ...ADD, ops: [{ op: 'add', path: '/nodes/-', value: { id: 'n7', label: 'Orphan' } }] };
  const t = await turn('Add an orphan branch', 'Done.\n\n' + fence(orphan) + '\n');
  ok('reaches the person as a sentence saying it was not made — never JSON, never a broken map', /The change to “The immune system” was not made/.test(t.text) && !/"ops"/.test(t.text) && U.editsIn(t.text).length === 0, t.text);
}

console.log('\n=== nobody asked for a change ===');
{
  const t = await turn('Why is the adaptive side slower?', 'Because it has to find the right cells first.\n\n' + fence(ADD) + '\n');
  ok('a question about the map: no edit context for the model', !/THE ARTIFACT THEY MEAN/.test(t.prompt));
  ok('…and an edit block written anyway reaches the person as nothing', U.editsIn(t.text).length === 0 && !/"type":"edit"/.test(t.text) && /find the right cells first/.test(t.text), t.text);
}

console.log('\n=== the kept artifact open in Artifacts ===');
{
  const kept = O.keptFrom(MIND, undefined, { session: 'sL6_e2e_00001', message: 'm_reply1', said: 'Here is how the parts fit together.', at: 1730000000000 });
  const made = O.makeDisplay(O.EMPTY_SPACE, 'kept', kept, 'socria');
  const id = made.obj.id;
  const edit = { ...ADD, of: id };
  const t = await turn('make it a tree', 'Shown as a tree now.\n\n' + fence({ type: 'edit', of: id, ops: [{ op: 'replace', path: '/view', value: 'tree' }] }) + '\n', { objects: made.space, inHand: id }, [{ role: 'user', content: 'Show me the immune system' }, { id: 'm_other', role: 'assistant', content: 'Something else entirely.' }]);
  ok('in hand: the model is told the kept artifact, by its id', new RegExp(`ref "${id}"`).test(t.prompt) && /a diagram kept in Artifacts/.test(t.prompt), t.prompt.slice(-900));
  const edits = U.editsIn(t.text);
  ok('…and its change reaches the person, said', edits.length === 1 && edits[0].edit.of === id && edits[0].edit.said === 'shown as a hierarchy', t.text);
  void edit;
}

console.log(`\nartifact focus (route): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
