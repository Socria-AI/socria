// SOCRIAUX V0'S ROUTES, THROUGH THEIR REAL HANDLERS — the model and the image libraries scripted.
//
// Held down: nobody signed out reaches a model or a library; each route sends
// the model what its task needs and nothing more (a crop, not the image; a
// thumbnail only once); what comes back passes its validator and the critique
// gate before anyone sees it; every call's tokens and price are recorded per
// person and project; the daily caps refuse before a model is asked; projects
// are stored normalised, privately, newest copy winning.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-ux-v0');
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
const ROUTES = ['critique', 'discover', 'brief', 'generate', 'refine', 'images', 'projects'];
await Promise.all(
  ROUTES.map((r) =>
    build({
      entryPoints: [join(root, `app/api/ux-v0/${r}/route.ts`)], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, `${r}.mjs`),
      tsconfig: join(root, 'tsconfig.json'), plugins: [swap], external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
    })
  )
);

console.warn = () => {};
console.error = () => {};
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.SOCRIA_ONE_USER_IDS = 'user_v0_a,user_v0_b';
process.env.SOCRIAUX_DAILY_CALLS = '50';
process.env.SOCRIAUX_DAILY_GENERATIONS = '2';
delete process.env.UNSPLASH_ACCESS_KEY;
delete process.env.PEXELS_API_KEY;

const A = 'user_v0_a';
const B = 'user_v0_b';
globalThis.__users = { [A]: { firstName: 'Ada', emails: ['a@example.com'] }, [B]: { firstName: 'Bo', emails: ['b@example.com'] } };

const R = Object.fromEntries(await Promise.all(ROUTES.map(async (r) => [r, await import(pathToFileURL(join(OUT, `${r}.mjs`)).href)])));
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

const bumps = [];
db.rpcs.bump_ux_v0_usage = (a) => {
  bumps.push(a);
  const rows = db.rows('ux_v0_usage');
  let row = rows.find((r) => r.user_id === a.p_user && r.project_id === a.p_project && r.day === a.p_day);
  if (!row) rows.push((row = { user_id: a.p_user, project_id: a.p_project, day: a.p_day, calls: 0, generations: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }));
  row.calls += a.p_calls;
  row.generations += a.p_generations;
  row.input_tokens += a.p_input;
  row.output_tokens += a.p_output;
  row.cost_usd += a.p_cost;
  return { data: null, error: null };
};

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));
const J = JSON.stringify;

async function post(route, body, uid, script = [], method = 'POST', query = '') {
  globalThis.__uid = uid;
  globalThis.__logosScript = [...script];
  globalThis.__logosCalls = [];
  globalThis.__logosUsage = { prompt_tokens: 1200, completion_tokens: 300 };
  const init = method === 'GET' || method === 'DELETE' ? { method } : { method, headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : J(body) };
  const r = await R[route][method](new NextRequest(`http://localhost/api/ux-v0/${route}${query}`, init));
  let json = null;
  try { json = await r.json(); } catch { /* not json */ }
  return { status: r.status, json, calls: globalThis.__logosCalls };
}

const capture = {
  tag: 'a', role: 'link', name: 'Book a table', text: 'Book a table', path: 'main > section.hero > a.btn', selector: 'body>main:nth-of-type(1)>a:nth-of-type(1)',
  attrs: { href: '#' }, styles: { color: 'rgb(255, 255, 255)', 'font-size': '14px', 'font-weight': '600' }, box: { x: 10, y: 20, w: 130, h: 36 },
  background: 'rgb(176, 141, 87)', section: 'hero: Coffee', parent: 'div.actions', siblings: 1, children: 0, interactive: true,
};
const measured = [{ id: 'contrast', label: 'Text contrast', value: '3.09:1 (#ffffff on #b08d57; needs 4.5:1)', ok: false, principle: 'WCAG 1.4.3 Contrast' }];
const elementSel = { id: 'sel_1', type: 'element', artifactId: 'generated', viewport: 'mobile', element: capture, region: null, crop: null, surrounding: 'Inside hero.', measured, label: 'Link “Book a table”' };
const CROP = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
const THUMB = 'data:image/jpeg;base64,' + 'B'.repeat(1000);
const regionSel = { id: 'sel_2', type: 'region', artifactId: 'f'.repeat(32), viewport: null, element: null, region: { box: { x: 0, y: 0, w: 300, h: 200 }, elements: [], container: '' }, crop: { dataUrl: CROP, box: { x: 0, y: 0, w: 300, h: 200 } }, surrounding: '', measured: [], label: 'Area 300 × 200' };

const REASONING = {
  read: 'The hero’s main call to action.',
  verdict: 'problem',
  issues: [{ text: 'The label is hard to read.', evidence: '3.09:1' }, { text: 'It looks cheap.', evidence: 'cheapness' }],
  questions: ['Who is this for at 7am?'],
  principles: [{ name: 'Contrast', applies: 'White on this tan falls below the AA threshold for 14px text.' }],
  alternatives: [{ text: 'Use a deep brown button.', tradeoff: 'Less warm.' }],
};

console.log('\n=== nobody signed out reaches a model or a library ===');
for (const r of ['critique', 'discover', 'brief', 'generate', 'refine', 'images']) {
  const out = await post(r, { comment: 'x', intent: 'y', selection: elementSel }, null, [REASONING]);
  ok(`${r}: refused, told to sign in, nothing asked`, out.status === 401 && out.json?.signIn === true && out.calls.length === 0, J(out));
}

console.log('\n=== critique ===');
{
  const out = await post('critique', { projectId: 'uxv0_p1', selection: elementSel, comment: 'Is this CTA prominent enough?', kind: 'generated', name: 'Halcyon', viewport: 'mobile' }, A, [REASONING]);
  ok('a signed-in comment gets reasoning', out.status === 200 && out.json?.reasoning?.read, J(out.json));
  ok('the gate held the issue without evidence back as a question', out.json.reasoning.issues.length === 1 && out.json.reasoning.questions.some((q) => /cheap/.test(q)));
  ok('one model call, JSON, the configured model', out.calls.length === 1 && out.calls[0].response_format?.type === 'json_object' && out.calls[0].model === 'gpt-6-luna');
  const user = J(out.calls[0].messages);
  ok('the model is told the measured facts and the selection', user.includes('3.09:1') && user.includes('Book a table'));
  ok('an element sends no image', !user.includes('image_url'));
  ok('the call is recorded for the person and the project', bumps.at(-1)?.p_user === A && bumps.at(-1)?.p_project === 'uxv0_p1' && bumps.at(-1)?.p_calls === 1 && bumps.at(-1)?.p_input === 1200);
  ok('the usage comes back priced', out.json.usage.model === 'gpt-6-luna' && typeof out.json.usage.cost === 'number');

  const img = await post('critique', { projectId: 'uxv0_p2', selection: regionSel, comment: 'Why does this feel cluttered?', kind: 'png', name: 'shot.png', thumb: THUMB }, A, [{ ...REASONING, artifactSummary: 'A landing page with a dense header.' }]);
  const parts = img.calls[0]?.messages?.[1]?.content ?? [];
  const images = Array.isArray(parts) ? parts.filter((p) => p.type === 'image_url') : [];
  ok('an image region sends the crop at high detail and the thumbnail at low', images.length === 2 && images[0].image_url.detail === 'high' && images[1].image_url.detail === 'low', J(images.map((i) => i.image_url.detail)));
  ok('the one-time reading of the image comes back', img.json.artifactSummary === 'A landing page with a dense header.');
  const again = await post('critique', { projectId: 'uxv0_p2', selection: regionSel, comment: 'And the logo?', kind: 'png', name: 'shot.png', summary: 'A landing page with a dense header.' }, A, [REASONING]);
  const parts2 = again.calls[0]?.messages?.[1]?.content ?? [];
  ok('after that, only the crop is sent', Array.isArray(parts2) && parts2.filter((p) => p.type === 'image_url').length === 1 && J(parts2).includes('dense header'));
  const hist = await post('critique', { projectId: 'uxv0_p1', selection: elementSel, comment: 'But it is on brand', history: [{ id: 't1', comment: 'Is this CTA prominent enough?', reasoning: { read: 'r', verdict: 'mixed', questions: ['Who is this for at 7am?'], principles: [], issues: [], alternatives: [], basis: '' } }] }, A, [REASONING]);
  ok('a follow-up does not re-ask what the card asked', !hist.json.reasoning.questions.includes('Who is this for at 7am?'));
  ok('…and the model was told it had asked it', J(hist.calls[0].messages).includes('Asked: Who is this for at 7am?'));
  const broken = await post('critique', { projectId: 'p', selection: elementSel, comment: 'x' }, A, [new Error('upstream down')]);
  ok('a model failure is a calm 502', broken.status === 502 && /saved/.test(broken.json?.error ?? ''));
  ok('no selection, no call', (await post('critique', { comment: 'x' }, A, [REASONING])).status === 400);
  // prose instead of JSON: the object inside it is read; with none, a calm, honest reading — never a crash
  const wrapped = await post('critique', { projectId: 'uxv0_p1', selection: elementSel, comment: 'Is this readable?', kind: 'generated', name: 'Halcyon' }, A, ['Here is my reading:\n' + J(REASONING) + '\nHope that helps.']);
  ok('prose around the JSON: the reasoning inside it is used', wrapped.status === 200 && wrapped.json.reasoning.read === REASONING.read, J(wrapped.json).slice(0, 200));
  const prose = await post('critique', { projectId: 'uxv0_p1', selection: elementSel, comment: 'Is this readable?', kind: 'generated', name: 'Halcyon' }, A, ['I think the button is fine, really.']);
  ok('prose with no JSON at all: an honest “could not form a grounded reading”, no invented findings', prose.status === 200 && prose.json.reasoning.verdict === 'unclear' && prose.json.reasoning.issues.length === 0 && /could not form a grounded reading/.test(prose.json.reasoning.read), J(prose.json).slice(0, 240));
}

console.log('\n=== discovery, the brief, generation, change ===');
{
  const d = await post('discover', { projectId: 'uxv0_c', action: 'turn', intent: 'A premium coffee shop website', questions: [], understanding: {}, moodboard: {} }, A, [
    { understanding: { summary: 'A café site.', known: {}, gaps: ['audience'] }, questions: [{ topic: 'audience', question: 'Who is it for?', why: 'It sets the tone.', options: ['Commuters', 'Remote workers'] }], moodboard: { queries: [{ category: 'imagery', query: 'espresso bar morning light' }] }, ready: false },
  ]);
  ok('a discovery turn asks a question and proposes queries', d.status === 200 && d.json.questions.length === 1 && d.json.queries.length === 1 && d.json.ready === false, J(d.json));
  ok('discovery sends no images', !J(d.calls[0].messages).includes('image_url'));
  const dir = await post('discover', { projectId: 'uxv0_c', action: 'direction', aspect: 'palette', intent: 'A premium coffee shop website', moodboard: {} }, A, [{ direction: 'Cool and spare', moodboard: { palettes: [{ name: 'Slate', colors: [{ hex: '#1d2a33', role: 'text' }, { hex: '#f3f5f6', role: 'background' }] }] } }]);
  ok('another direction for the palette gives palettes', dir.status === 200 && dir.json.palettes.length === 1 && dir.json.queries.length === 0);

  const moodboard = { refs: [{ provider: 'openverse', providerId: 'k1', url: 'https://x.org/k1.jpg', category: 'imagery', query: 'q', state: 'kept' }] };
  const b = await post('brief', { projectId: 'uxv0_c', action: 'synthesize', intent: 'A premium coffee shop website', moodboard }, A, [
    { objective: 'Fill weekday mornings.', audience: 'Commuters', palette: [{ hex: '#f6f1e9', role: 'background' }, { hex: '#222222', role: 'text' }, { hex: '#6b3e1f', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter' }, references: ['openverse:k1', 'openverse:invented'], pageType: 'website' },
  ]);
  ok('a brief is written, referencing only kept images', b.status === 200 && J(b.json.brief.references) === J(['openverse:k1']), J(b.json));
  ok('refining needs an instruction', (await post('brief', { action: 'refine', intent: 'x', current: b.json.brief }, A, [])).status === 400);
  ok('writing a brief brings no new searches', J(b.json.queries) === '[]');
  const used = { ...moodboard, queries: [{ category: 'imagery', query: 'espresso bar morning light', page: 2 }] };
  const rb = await post('brief', { projectId: 'uxv0_c', action: 'refine', intent: 'x', current: b.json.brief, instruction: 'Darker and moodier, evening light', moodboard: used }, A, [
    { ...b.json.brief, visualDirection: 'Low evening light, deep browns, candle glow.', moodboardQueries: [{ category: 'imagery', query: 'candlelit cafe evening' }, { category: 'texture', query: 'dark walnut wood grain' }, { category: 'imagery', query: 'Espresso bar, morning light!' }, { category: 'sky', query: 'night street window glow' }, { category: 'imagery', query: 'a fifth search too many' }] },
  ]);
  ok('a refinement that moves the visual direction brings searches for the board', rb.status === 200 && rb.json.queries.length === 3 && rb.json.queries[0].query === 'candlelit cafe evening', J(rb.json.queries));
  ok('…none already used, each in a known category, at most three', !rb.json.queries.some((q) => /espresso bar/i.test(q.query)) && rb.json.queries.every((q) => ['imagery', 'texture', 'composition'].includes(q.category)));
  ok('…and the model was asked for them only when refining', J(rb.calls[0].messages).includes('moodboardQueries') && !J(b.calls[0].messages).includes('moodboardQueries'));

  const g = await post('generate', { projectId: 'uxv0_c', brief: b.json.brief, moodboard, version: 1 }, A, [
    { title: 'Halcyon', sections: [{ id: 'nav', kind: 'nav', content: { brand: 'Halcyon', links: ['Menu'] } }, { id: 'hero', kind: 'hero', variant: 'split', content: { title: 'Coffee, slowly', primary: 'Book' }, images: ['openverse:k1'] }, { id: 'f', kind: 'footer', content: { brand: 'Halcyon', legal: 'Open [Opening hours]' } }] },
  ]);
  ok('a design is generated as a spec', g.status === 200 && g.json.spec.sections.length === 3 && g.json.spec.tokens.colors.accent === '#6b3e1f', J(g.json).slice(0, 300));
  ok('placeholders are reported', J(g.json.placeholders) === J(['[Opening hours]']));
  ok('a generation is counted as one', bumps.at(-1)?.p_generations === 1);
  const junk = await post('generate', { projectId: 'uxv0_c', brief: b.json.brief, moodboard, version: 2 }, A, [{ sections: [{ kind: 'nonsense' }] }]);
  ok('a design that does not hold together is refused, nothing kept', junk.status === 502);
  const capped = await post('generate', { projectId: 'uxv0_c', brief: b.json.brief, moodboard, version: 3 }, A, [{}]);
  ok('the daily generation cap refuses before the model is asked', capped.status === 429 && capped.calls.length === 0, J(capped));

  const spec = g.json.spec;
  const r = await post('refine', { projectId: 'uxv0_c', spec, brief: b.json.brief, moodboard, selection: { ...elementSel, element: { ...capture, ux: { section: 'hero', path: 'title' } } }, comment: 'Make the headline say mornings' }, A, [
    { understood: 'Rewrite the hero headline.', patch: { op: 'content', sectionId: 'hero', content: { title: 'Mornings, slowly' }, summary: 'Headline about mornings' } },
  ]);
  ok('a change becomes a patch that applies', r.status === 200 && r.json.applies === true && r.json.patch.op === 'content' && r.json.patch.sectionId === 'hero', J(r.json));
  ok('the model was told which section and field were selected', J(r.calls[0].messages).includes('section [hero], field title'));
  const c = await post('refine', { projectId: 'uxv0_c', spec, moodboard, comment: 'Make all text light grey' }, A, [{ understood: 'Grey text', challenge: 'Light grey on cream would fail contrast.', patch: { op: 'tokens', tokens: { colors: { text: '#cccccc' } } } }]);
  ok('a concern comes back with the patch, for the designer to decide', c.json.challenge.includes('contrast') && c.json.applies === true);
  const bad = await post('refine', { projectId: 'uxv0_c', spec, moodboard, comment: 'x' }, A, [{ patch: { op: 'content', sectionId: 'ghost', content: {} } }]);
  const newDir = await post('refine', { projectId: 'uxv0_c', spec, moodboard, comment: 'Make it feel like a night-time bar instead' }, A, [{ understood: 'A different direction', regenerate: 'A late-evening bar: low light, deep reds, a cocktail list first.', patch: { op: 'none' } }]);
  ok('a new direction is not forced into a patch: it is offered as a regeneration', newDir.status === 200 && newDir.json.regenerate.includes('late-evening') && newDir.json.applies === false, J(newDir.json).slice(0, 240));
  ok('a patch that does not fit says why', bad.json.applies === false && /not in the design/.test(bad.json.error));
}

console.log('\n=== moodboard images ===');
{
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return { ok: true, status: 200, json: async () => ({ photos: [
      { id: 1, src: { large2x: 'https://images.pexels.com/photos/1/a.jpeg', medium: 'https://images.pexels.com/photos/1/a-m.jpeg' }, width: 1200, height: 800, avg_color: '#776655', alt: 'Marble counter', photographer: 'Kim', photographer_url: 'https://www.pexels.com/@kim', url: 'https://www.pexels.com/photo/1/' },
      { id: 2, src: { large2x: 'https://images.pexels.com/photos/2/b.jpeg', medium: 'https://images.pexels.com/photos/2/b-m.jpeg' }, width: 1200, height: 800, alt: 'Seen before', photographer: 'Lee', url: 'https://www.pexels.com/photo/2/' },
    ] }) };
  };
  // no keyed library set: the server asks nothing and says so; the browser asks Openverse itself
  const bare = await post('images', { projectId: 'uxv0_c', queries: [{ category: 'imagery', query: 'espresso bar', page: 1 }], per: 4 }, A);
  ok('with no keyed library set, the server asks nothing and says so (the browser asks Openverse)', bare.status === 200 && J(bare.json.libraries) === '[]' && bare.json.results[0].refs.length === 0 && fetched.length === 0, J(bare.json));
  process.env.PEXELS_API_KEY = 'pk';
  const out = await post('images', { projectId: 'uxv0_c', queries: [{ category: 'texture', query: 'marble counter', page: 2 }], seen: ['pexels:2'], per: 4 }, A);
  delete process.env.PEXELS_API_KEY;
  globalThis.fetch = realFetch;
  const refs = out.json?.results?.[0]?.refs ?? [];
  ok('a keyed library answers, with licence and credit', out.status === 200 && J(out.json.libraries) === J(['pexels']) && refs.length === 1 && refs[0].license === 'Pexels License' && refs[0].creator === 'Kim', J(out.json).slice(0, 300));
  ok('…in the category asked for, at the page asked for, a whole page at a time', refs[0]?.category === 'texture' && fetched[0].includes('page=2') && fetched[0].includes('per_page=20'), fetched[0]);
  ok('…never one already seen', !refs.some((x) => x.id === 'pexels:2'));
  ok('…and it says which page to ask for next', out.json.results[0].next === 3 && out.json.results[0].left === 0, J(out.json.results[0]).slice(0, 160));
  ok('no queries, no search', (await post('images', { queries: [] }, A)).status === 400);
}

console.log('\n=== projects: private, normalised, newest wins ===');
{
  const p = { v: 1, id: 'uxv0_sync1', name: 'Mine', mode: 'critique', updatedAt: 1000, createdAt: 900, cards: [{ id: 'c1', n: 1, selection: regionSel, turns: [{ id: 't', comment: 'hm' }] }] };
  const put = await post('projects', { project: p }, A, [], 'PUT');
  ok('a signed-in save', put.status === 200 && put.json.ok, J(put));
  const row = db.rows('ux_v0_projects').find((r) => r.id === 'uxv0_sync1');
  ok('stored under its owner, without its crops', row?.user_id === A && row.doc.cards[0].selection.crop === null);
  ok('the owner lists it; nobody else does', (await post('projects', null, A, [], 'GET')).json.projects.some((x) => x.id === 'uxv0_sync1') && !(await post('projects', null, B, [], 'GET')).json.projects.some((x) => x.id === 'uxv0_sync1'));
  ok('nobody else can read it', (await post('projects', null, B, [], 'GET', '?id=uxv0_sync1')).status === 404);
  ok('an older copy does not overwrite it', (await post('projects', { project: { ...p, updatedAt: 10 } }, A, [], 'PUT')).status === 409);
  ok('signed out: nothing', (await post('projects', { project: p }, null, [], 'PUT')).status === 401);
  await post('projects', null, B, [], 'DELETE', '?id=uxv0_sync1');
  ok('nobody else can delete it', db.rows('ux_v0_projects').some((r) => r.id === 'uxv0_sync1'));
  await post('projects', null, A, [], 'DELETE', '?id=uxv0_sync1');
  ok('the owner can', !db.rows('ux_v0_projects').some((r) => r.id === 'uxv0_sync1'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
