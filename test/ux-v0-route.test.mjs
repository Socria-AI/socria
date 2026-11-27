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
    b.onResolve({ filter: /^@anthropic-ai\/sdk$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-anthropic.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
const ROUTES = ['critique', 'discover', 'brief', 'direct', 'generate', 'refine', 'reference', 'projects', 'design-system', 'assets', 'studio-questions', 'design'];
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
// the sections before "routing" test every route on one model (GPT-6 Luna, Chat Completions), as SocriaUX ran
// before routing; SOCRIAUX_ROUTING=single keeps that. The routing section takes it away.
process.env.SOCRIAUX_ROUTING = 'single';
// the OpenAI paths, tested as they were: Luna for the economy tier, Sol for the premium. The Claude section
// at the end takes these away and tests the default (Claude Sonnet 5.5, the questions on Luna).
process.env.SOCRIAUX_ECONOMY_MODEL = 'gpt-6-luna';
process.env.SOCRIAUX_PREMIUM_MODEL = 'gpt-6.1-sol';
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

console.log('\n=== nobody signed out reaches a model ===');
for (const r of ['critique', 'discover', 'brief', 'direct', 'generate', 'refine']) {
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
  ok('left to SocriaUX, the design still follows an art direction: the faithful reading, named in the response', g.json.artDirection?.language && g.json.spec.look.language === g.json.artDirection.language && g.json.spec.look.language !== 'classic', J(g.json.artDirection?.language));
  ok('…and the generator was told it', J(g.calls[0].messages).includes('THE APPROVED ART DIRECTION'));
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

console.log('\n=== art direction ===');
{
  const brief = { objective: 'Fill weekday mornings at a coffee bar.', audience: 'Commuters', personality: ['warm', 'honest'], visualDirection: 'Handmade, morning light', palette: [{ hex: '#f6f1e9', role: 'background' }, { hex: '#2a2420', role: 'text' }, { hex: '#6b3e1f', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter' }, pageType: 'website' };
  const d = await post('direct', { projectId: 'uxv0_d', brief, notes: '', avoid: '' }, B, [
    { directions: [{ candidate: 1, name: 'Long table mornings', concept: 'A printed card for a room that slows you down.', rationale: ['Warm and honest, like the brief'], voice: 'Plain and particular.', fonts: { display: 'Young Serif', body: 'Comic Sans' } }, { candidate: 2, name: 'Loud roast' }, { candidate: 3, name: 'Third way' }] },
  ]);
  ok('three directions come back, written for this brand', d.status === 200 && d.json.options.length === 3 && d.json.options[0].name === 'Long table mornings' && d.json.options[0].source === 'model', J(d.json).slice(0, 300));
  ok('…each a different visual language', new Set(d.json.options.map((o) => o.language)).size === 3);
  ok('…a face from the list is taken; one off it never is', d.json.options[0].tokens.fonts.display === 'Young Serif' && d.json.options[0].tokens.fonts.body !== 'Comic Sans');
  ok('…one small call, recorded as art direction, with the candidates and the catalogue in it', d.calls.length === 1 && bumps.at(-1)?.p_project === 'uxv0_d' && J(d.calls[0].messages).includes('THE CANDIDATES') && J(d.calls[0].messages).includes('broadsheet'));
  const base = { ...d.json.options[1], locks: ['palette', 'type'] };
  const again = await post('direct', { projectId: 'uxv0_d', brief, notes: 'more like a newspaper', round: 1, seen: d.json.options.map((o) => o.language), base }, B, [{ directions: [{ candidate: 1, fonts: { display: 'Anton', body: 'Inter' } }] }]);
  ok('asked again, what the designer locked stays: colours and type', again.status === 200 && again.json.options.every((o) => J(o.tokens.colors) === J(base.tokens.colors) && J(o.tokens.fonts) === J(base.tokens.fonts)), J(again.json.options.map((o) => o.tokens.fonts)));
  ok('…the model was told what is locked, and the notes', J(again.calls[0].messages).includes('LOCKED BY THE DESIGNER') && J(again.calls[0].messages).includes('more like a newspaper'));
  const broken = await post('direct', { projectId: 'uxv0_d', brief }, B, [new Error('upstream down')]);
  ok('a model failure is a calm 502 (the browser keeps the engine’s three)', broken.status === 502);
  ok('no brief, no call', (await post('direct', { notes: 'x' }, B, [])).status === 400);

  const moodboard = { refs: [] };
  const chosen = { ...d.json.options[2], locks: ['palette'] };
  const sections = [{ id: 'nav', kind: 'nav', content: { brand: 'Halcyon', links: ['Menu'] } }, { id: 'hero', kind: 'hero', variant: 'centered', content: { title: 'Coffee, slowly', primary: 'Book' } }, { id: 'f', kind: 'footer', content: { brand: 'Halcyon' } }];
  const g = await post('generate', { projectId: 'uxv0_d', brief, moodboard, version: 1, artDirection: chosen }, B, [{ title: 'Halcyon', tokens: { colors: { accent: '#ff00ff' }, fonts: { display: 'Inter' } }, sections }]);
  ok('the design follows the approved direction’s colours, type and look, whatever the model wrote', g.status === 200 && J(g.json.spec.tokens.colors) === J(chosen.tokens.colors) && J(g.json.spec.tokens.fonts) === J(chosen.tokens.fonts) && g.json.spec.look.language === chosen.language, J(g.json.spec.tokens.fonts));
  ok('…the generator was given its concept and told not to write tokens', J(g.calls[0].messages).includes(chosen.concept.slice(0, 30)) && J(g.calls[0].messages).includes('do not write'));
  const g2 = await post('generate', { projectId: 'uxv0_d', brief, moodboard, version: 2, artDirection: chosen, direction: 'darker, like an evening bar' }, B, [{ title: 'Halcyon', sections }]);
  ok('a new direction in words revises the approved one and keeps its locks', g2.status === 200 && J(g2.json.spec.tokens.colors) === J(chosen.tokens.colors) && J(g2.json.artDirection.locks) === J(['palette']), J(g2.json.artDirection?.language));

  const spec = g.json.spec;
  const locked = await post('refine', { projectId: 'uxv0_d', spec, moodboard, comment: 'Make the accent pink', locks: ['palette'] }, B, [{ understood: 'Pink accent', patch: { op: 'tokens', tokens: { colors: { accent: '#ff3399' } }, summary: 'Pink' } }]);
  ok('a change to a locked decision is never made silently: SocriaUX asks first', locked.status === 200 && /locked/.test(locked.json.challenge) && J(locked.json.locked) === J(['palette']) && locked.json.applies, J(locked.json));
  ok('…even when the change is one SocriaUX makes in code, with no model asked and nothing charged', locked.json.deterministic === true && locked.calls.length === 0 && locked.json.usage === null && locked.json.patch.tokens.colors.accent === '#db2777', J(locked.json));
  const lockedOpen = await post('refine', { projectId: 'uxv0_d', spec, moodboard, comment: 'Give the accent a more confident, saturated feel', locks: ['palette'] }, B, [{ understood: 'A more confident accent', patch: { op: 'tokens', tokens: { colors: { accent: '#ff3399' } }, summary: 'A stronger accent' } }]);
  ok('…and a change only the model can read is asked of it, told what is locked', lockedOpen.calls.length === 1 && J(lockedOpen.calls[0].messages).includes('LOCKED IN THE ART DIRECTION') && /locked/.test(lockedOpen.json.challenge), J(lockedOpen.json));
  const forced = await post('refine', { projectId: 'uxv0_d', spec, moodboard, comment: 'Make the accent pink', locks: ['palette'], force: true }, B, [{ understood: 'Pink accent', patch: { op: 'tokens', tokens: { colors: { accent: '#ff3399' } }, summary: 'Pink' } }]);
  ok('…once the designer says yes, it is made', forced.json.challenge === '' && forced.json.applies);
  const free = await post('refine', { projectId: 'uxv0_d', spec, moodboard, comment: 'Use heavier rules', locks: ['palette'] }, B, [{ understood: 'Heavier rules', patch: { op: 'look', look: { rules: 'heavy' }, summary: 'Heavy rules' } }]);
  ok('a change to what is not locked goes straight through, as a look patch', free.json.challenge === '' && free.json.applies && free.json.patch.op === 'look');
}

console.log('\n=== websites read for reference ===');
{
  // the reader itself (pages, stylesheets, redirects, the inert preview) is checked in test/studio.test.mjs with a
  // scripted fetcher; here, the route: what it refuses before anything is fetched
  const realFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url) => (fetched.push(String(url)), new Response('no', { status: 500 }));
  const none = await post('reference', {}, A);
  ok('no address: refused, nothing fetched', none.status === 400 && fetched.length === 0, J(none));
  const priv = await post('reference', { url: 'http://127.0.0.1/admin' }, A);
  ok('a private address: refused before any request, and said', priv.status === 400 && /private|reserved|public/i.test(priv.json?.error ?? '') && fetched.length === 0, J(priv.json));
  const meta = await post('reference', { url: 'http://169.254.169.254/latest/meta-data' }, null);
  ok('…signed out too: reading a site needs no account, and never reaches inside a network', meta.status === 400 && fetched.length === 0, J(meta.json));
  const cred = await post('reference', { url: 'https://user:secret@example.com/' }, A);
  ok('an address carrying credentials is refused', cred.status === 400 && fetched.length === 0, J(cred.json));
  ok('nothing in what it said asked a model', [none, priv, meta, cred].every((x) => x.calls.length === 0));
  globalThis.fetch = realFetch;
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

console.log('\n=== graphics projects: kept whole, held to their shape, private ===');
{
  const doc = {
    schema: 1,
    id: 'gd1',
    name: 'Poster',
    tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#555555', accent: '#c2410c', accentText: '#ffffff', line: '#dddddd' }, fonts: { display: 'Fraunces', body: 'Inter' } },
    artboards: [
      {
        id: 'ab1',
        name: 'A4',
        width: 595.28,
        height: 841.89,
        unit: 'pt',
        dpi: 300,
        background: '#ffffff',
        bleed: 8.5,
        safe: 34,
        children: [
          { id: 't1', type: 'text', role: 'headline', text: 'Letters in Motion', x: 34, y: 100, w: 500, h: 200, size: 72, font: 'Fraunces', weight: 700, color: '#111111', rotation: 0, opacity: 1 },
          { id: 'i1', type: 'image', role: 'image', asset: 'up1', x: 0, y: 400, w: 595, h: 300, fit: 'cover', rotation: 0, opacity: 1 },
          { id: 'i2', type: 'image', asset: 'evil', x: 0, y: 0, w: 10, h: 10, fit: 'cover', rotation: 0, opacity: 1 },
        ],
      },
    ],
    assets: [
      { id: 'up1', kind: 'image', src: 'upload:file_abc', width: 1200, height: 800, name: 'Room', source: 'upload' },
      { id: 'evil', kind: 'image', src: 'javascript:alert(1)', width: 1, height: 1, name: 'x', source: 'upload' },
    ],
    revision: 3,
    updatedAt: 2000,
  };
  const g = { v: 1, id: 'uxv0_gfx1', name: 'Letters in Motion', mode: 'create', medium: 'graphic', updatedAt: 2000, createdAt: 1900, cards: [], graphic: { brief: { purpose: 'A poster', kind: 'poster', formats: ['a4'], content: { headline: 'Letters in Motion' }, mood: [], images: [] }, options: [], direction: null, doc, versions: [{ doc, label: 'Composed', at: 2000 }] } };
  const put = await post('projects', { project: g }, A, [], 'PUT');
  const row = db.rows('ux_v0_projects').find((r) => r.id === 'uxv0_gfx1');
  ok('a graphics project syncs for its owner, as a graphic', put.status === 200 && row?.user_id === A && row.doc.medium === 'graphic', J(put));
  ok('…its document whole: the words exactly, its upload kept by reference (the file itself stays in the browser)', row?.doc.graphic.doc.artboards[0].children.some((n) => n.text === 'Letters in Motion') && row.doc.graphic.doc.assets.some((a) => a.src === 'upload:file_abc') && row.doc.graphic.versions.length === 1);
  ok('…held to its shape on the way in: a script address is no picture, and the object that used it goes', !row?.doc.graphic.doc.assets.some((a) => a.id === 'evil') && !row.doc.graphic.doc.artboards[0].children.some((n) => n.id === 'i2'));
  const read = await post('projects', null, A, [], 'GET', '?id=uxv0_gfx1');
  ok('the owner reads it back as a graphic', read.status === 200 && read.json.project.medium === 'graphic' && read.json.project.graphic.doc.artboards[0].children[0].text === 'Letters in Motion');
  ok('nobody else reads it or lists it', (await post('projects', null, B, [], 'GET', '?id=uxv0_gfx1')).status === 404 && !(await post('projects', null, B, [], 'GET')).json.projects.some((x) => x.id === 'uxv0_gfx1'));
  await post('projects', null, B, [], 'DELETE', '?id=uxv0_gfx1');
  ok('…or deletes it', db.rows('ux_v0_projects').some((r) => r.id === 'uxv0_gfx1'));
  ok('signed out: nothing', (await post('projects', null, null, [], 'GET', '?id=uxv0_gfx1')).status === 401 && (await post('projects', { project: g }, null, [], 'PUT')).status === 401);
}

console.log('\n=== boards: kept whole, held to their shape, private ===');
{
  const V = await import(pathToFileURL(join(here, '.tmp', 'ux-v0-under-test.mjs')).href);
  const brief = V.boardPlan.readBoardRequest('A campaign for “Harbour Week”: two posters and an Instagram post');
  const sys = V.boardPipeline.proposeSystems(brief, 'route-test')[0];
  let board = V.boardPipeline.startBoard(brief, sys);
  await V.boardPipeline.generate(board, {}, (op) => {
    const r = V.boardModel.applyBoardOp(board, op);
    if (r.ok) board = r.board;
  });
  const hostile = {
    ...board,
    nodes: [...board.nodes, { id: 'bn_x', type: 'note', text: '<script>alert(1)</script>', generated: false, x: 0, y: 0, w: 300, h: 90 }, { id: 'bn_y', type: 'material', material: 'm_none', x: 0, y: 0, w: 10, h: 10 }],
    materials: [...board.materials, { id: 'm_w', type: 'website', name: 'Site', purpose: '', projectId: '../etc/passwd', view: 'desktop', created: false, status: 'ready', revision: 0 }],
  };
  const p = { v: 1, id: 'uxv0_board1', name: 'Harbour Week', mode: 'create', medium: 'board', intent: 'A campaign', updatedAt: 3000, createdAt: 2900, cards: [], board: hostile };
  const put = await post('projects', { project: p }, A, [], 'PUT');
  const row = db.rows('ux_v0_projects').find((r) => r.id === 'uxv0_board1');
  ok('a board syncs for its owner, as a board: its system and every material whole', put.status === 200 && row?.user_id === A && row.doc.medium === 'board' && row.doc.board.system?.tokens.fonts.display === sys.tokens.fonts.display && row.doc.board.materials.filter((m) => m.type === 'graphic').every((m) => m.doc?.artboards?.length === 1), J(put));
  ok('…held to its shape on the way in: a node pointing at nothing goes, a path is no project id', !row?.doc.board.nodes.some((n) => n.id === 'bn_y') && !row.doc.board.materials.some((m) => m.type === 'website' && String(m.projectId).includes('/')));
  ok('…markup in a note is kept as words, never as markup to run', row?.doc.board.nodes.find((n) => n.id === 'bn_x')?.text === '<script>alert(1)</script>');
  const read = await post('projects', null, A, [], 'GET', '?id=uxv0_board1');
  ok('the owner reads it back as a board', read.status === 200 && read.json.project.medium === 'board' && read.json.project.board.materials.length === row.doc.board.materials.length);
  ok('nobody else reads it or lists it', (await post('projects', null, B, [], 'GET', '?id=uxv0_board1')).status === 404 && !(await post('projects', null, B, [], 'GET')).json.projects.some((x) => x.id === 'uxv0_board1'));
  await post('projects', null, B, [], 'DELETE', '?id=uxv0_board1');
  ok('…or deletes it', db.rows('ux_v0_projects').some((r) => r.id === 'uxv0_board1'));
  ok('signed out: nothing', (await post('projects', null, null, [], 'GET', '?id=uxv0_board1')).status === 401 && (await post('projects', { project: p }, null, [], 'PUT')).status === 401);
}

console.log('\n=== GPT-6.1 Sol through every route (the Responses API) ===');
{
  const C = 'user_v0_sol';
  process.env.SOCRIAUX_MODEL = 'gpt-6.1-sol';
  const sent = (out) => out.calls[0] ?? {};
  const onResponses = (p) => typeof p.instructions === 'string' && Array.isArray(p.input) && p.messages === undefined && p.store === false;
  const formatOf = (p) => (p.text?.format?.type === 'json_schema' ? p.text.format.name : p.text?.format?.type);
  const brief = { objective: 'Fill weekday mornings at a coffee bar.', audience: 'Commuters', personality: ['warm', 'honest'], visualDirection: 'Handmade, morning light', palette: [{ hex: '#f6f1e9', role: 'background' }, { hex: '#2a2420', role: 'text' }, { hex: '#6b3e1f', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter' }, pageType: 'website' };
  const moodboard = { refs: [{ provider: 'openverse', providerId: 'k1', url: 'https://x.org/k1.jpg', category: 'imagery', query: 'q', state: 'kept', asContent: true }] };
  const steps = [];
  // 1 adaptive questions
  const q = await post('discover', { projectId: 'uxv0_sol', action: 'turn', intent: 'A premium coffee shop website', questions: [], understanding: {}, moodboard: {} }, C, [
    { understanding: { summary: 'A café site.', known: { objective: 'mornings' }, gaps: ['audience'] }, questions: [{ topic: 'audience', question: 'Who is it for?', why: 'It sets the tone.', options: ['Commuters', 'Remote workers'] }], moodboard: { queries: [{ category: 'imagery', query: 'espresso bar morning light' }] }, ready: false },
  ]);
  steps.push(['questions', q, 'json_object']);
  // 2 the moodboard: another direction
  const md = await post('discover', { projectId: 'uxv0_sol', action: 'direction', aspect: 'palette', intent: 'A premium coffee shop website', moodboard: {} }, C, [{ direction: 'Cool and spare', moodboard: { queries: [], palettes: [{ name: 'Slate', colors: [{ hex: '#1d2a33', role: 'text' }, { hex: '#f3f5f6', role: 'background' }] }], type: [] } }]);
  steps.push(['moodboard direction', md, 'socriaux_direction']);
  // 3 the Living Brief, written and revised
  const b = await post('brief', { projectId: 'uxv0_sol', action: 'synthesize', intent: 'A premium coffee shop website', moodboard }, C, [
    { objective: 'Fill weekday mornings.', audience: 'Commuters', userGoals: [], personality: ['warm'], visualDirection: 'Morning light', palette: [{ hex: '#f6f1e9', role: 'background' }, { hex: '#222222', role: 'text' }, { hex: '#6b3e1f', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter', rationale: '' }, layoutDirection: '', functionalRequirements: [], references: ['openverse:k1'], openQuestions: [], experience: null, rules: [], accessibility: null, responsive: null, pageType: 'website', platform: 'web' },
  ]);
  steps.push(['brief', b, 'socriaux_brief']);
  const rb = await post('brief', { projectId: 'uxv0_sol', action: 'refine', intent: 'x', current: b.json?.brief, instruction: 'Darker, evening light', moodboard }, C, [{ ...b.json?.brief, visualDirection: 'Evening light', moodboardQueries: [{ category: 'imagery', query: 'candlelit cafe evening' }] }]);
  steps.push(['brief revision', rb, 'socriaux_refine_brief']);
  // 4 art direction
  const d = await post('direct', { projectId: 'uxv0_sol', brief, notes: '', avoid: '' }, C, [{ directions: [{ candidate: 1, language: 'broadsheet', name: 'Long table mornings', concept: 'A printed card.', rationale: ['Warm'], voice: 'Plain.', composition: 'One column.', imagery: 'Window light.', avoid: ['stock'], fonts: null }] }]);
  steps.push(['art direction', d, 'socriaux_art_direction']);
  // 5 generation in that direction
  const g = await post('generate', { projectId: 'uxv0_sol', brief: b.json?.brief, moodboard, version: 1, artDirection: d.json?.options?.[0] }, C, [
    { title: 'Halcyon', sections: [{ id: 'nav', kind: 'nav', content: { brand: 'Halcyon', links: ['Menu'] } }, { id: 'hero', kind: 'hero', variant: 'split', content: { title: 'Coffee, slowly', primary: 'Book' }, images: ['openverse:k1'] }, { id: 'f', kind: 'footer', content: { brand: 'Halcyon' } }] },
  ]);
  steps.push(['generation', g, 'json_object']);
  // 6 a targeted change on the canvas
  const r = await post('refine', { projectId: 'uxv0_sol', spec: g.json?.spec, brief: b.json?.brief, moodboard, selection: { ...elementSel, element: { ...capture, ux: { section: 'hero', path: 'title' } } }, comment: 'Make the headline say mornings' }, C, [
    { understood: 'Rewrite the hero headline.', patch: { op: 'content', sectionId: 'hero', content: { title: 'Mornings, slowly' }, summary: 'Headline about mornings' } },
  ]);
  steps.push(['targeted refinement', r, 'json_object']);
  // 7 critique of an area, with its crop and the thumbnail
  const c = await post('critique', { projectId: 'uxv0_sol', selection: regionSel, comment: 'Why does this feel cluttered?', kind: 'png', name: 'shot.png', thumb: THUMB }, C, [{ ...REASONING, artifactSummary: 'A landing page with a dense header.' }]);
  steps.push(['critique', c, 'socriaux_critique']);
  for (const [what, out, fmt] of steps) {
    const p = sent(out);
    // (the legacy one-model setting runs Sol at medium unless SOCRIAUX_EFFORT says otherwise: the live evaluation found
    // medium as good as high at about 60% of the time, and high's generations ran past a route's 60 seconds)
    ok(`${what}: 200, one Responses call to Sol at effort medium, ${fmt}, not stored`, out.status === 200 && out.calls.length === 1 && onResponses(p) && p.model === 'gpt-6.1-sol' && p.reasoning?.effort === 'medium' && p.temperature === undefined && formatOf(p) === fmt, J({ status: out.status, n: out.calls.length, model: p.model, effort: p.reasoning?.effort, fmt: formatOf(p), err: out.json?.error }));
  }
  ok('the work comes through: a question, palettes, a brief and its searches, three directions, a spec, a patch, a reading', q.json.questions.length === 1 && md.json.palettes.length === 1 && J(b.json.brief.references) === J(['openverse:k1']) && rb.json.queries.length === 1 && d.json.options.length === 3 && d.json.options[0].name === 'Long table mornings' && g.json.spec.sections.length === 3 && r.json.applies === true && c.json.reasoning.read.length > 0);
  ok('the critique sends its crop and thumbnail as input images, high and low detail', J(sent(c).input[0].content.filter((x) => x.type === 'input_image').map((x) => x.detail)) === J(['high', 'low']));
  ok('each call is priced at Sol\'s rates ($2 / $10 per million) and recorded', q.json.usage.model === 'gpt-6.1-sol' && Math.abs(q.json.usage.cost - (1200 * 2 + 300 * 10) / 1e6) < 1e-9 && bumps.at(-1)?.p_project === 'uxv0_sol', J(q.json.usage));
  process.env.SOCRIAUX_EFFORT = 'medium';
  const med = await post('direct', { projectId: 'uxv0_sol', brief, notes: '', avoid: '' }, C, [{ directions: [] }]);
  ok('SOCRIAUX_EFFORT=medium: the same route at medium', med.status === 200 && sent(med).reasoning?.effort === 'medium');
  delete process.env.SOCRIAUX_EFFORT;
  globalThis.__logosRefuse = ['gpt-6.1-sol'];
  const down = await post('direct', { projectId: 'uxv0_sol', brief, notes: '', avoid: '' }, C, [{ directions: [] }]);
  globalThis.__logosRefuse = [];
  ok('Sol not enabled on the account: the ladder answers on GPT-5.6 Sol, and the designer still gets directions', down.status === 200 && down.calls.map((p) => p.model).join() === 'gpt-6.1-sol,gpt-5.6-sol' && down.json.options.length === 3);
  delete process.env.SOCRIAUX_MODEL;
  const back = await post('direct', { projectId: 'uxv0_sol', brief, notes: '', avoid: '' }, C, [{ directions: [] }]);
  ok('SOCRIAUX_MODEL unset: back to Luna on Chat Completions', back.status === 200 && back.calls[0].model === 'gpt-6-luna' && Array.isArray(back.calls[0].messages) && back.calls[0].instructions === undefined);
}

console.log('\n=== routing: the economy model for questions and the brief, the premium model for direction, generation, critique ===');
{
  delete process.env.SOCRIAUX_ROUTING;
  delete process.env.SOCRIAUX_MODEL;
  const U = 'user_v0_route';
  const P = 'uxv0_route';
  const brief = { objective: 'Fill weekday mornings at a coffee bar.', audience: 'Commuters', personality: ['warm', 'honest'], visualDirection: 'Handmade, morning light', palette: [{ hex: '#f6f1e9', role: 'background' }, { hex: '#2a2420', role: 'text' }, { hex: '#6b3e1f', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter' }, userGoals: [], functionalRequirements: [], references: [] };
  const spec = { title: 'Halcyon', pageType: 'website', sections: [{ id: 'nav', kind: 'nav', content: { brand: 'Halcyon', links: ['Menu'] } }, { id: 'hero', kind: 'hero', content: { title: 'Coffee, slowly', primary: 'Book' } }, { id: 'f', kind: 'footer', content: { brand: 'Halcyon' } }] };
  const sel = { ...elementSel, element: { ...capture, ux: { section: 'hero', path: 'title' } } };
  const onSol = (out) => out.calls[0]?.model === 'gpt-6.1-sol' && typeof out.calls[0]?.instructions === 'string' && out.calls[0]?.reasoning?.effort === 'medium';
  const onLuna = (out) => out.calls[0]?.model === 'gpt-6-luna' && Array.isArray(out.calls[0]?.messages);
  const q = await post('discover', { projectId: P, action: 'turn', intent: 'A coffee shop website', questions: [], understanding: {}, moodboard: {} }, U, [{ understanding: { summary: 's', known: {}, gaps: [] }, questions: [], ready: true }]);
  ok('questions: the economy model (GPT-6 Luna), Chat Completions', q.status === 200 && onLuna(q), J(q.calls[0]?.model));
  const b = await post('brief', { projectId: P, action: 'synthesize', intent: 'A coffee shop website', moodboard: {} }, U, [{ objective: 'Fill weekday mornings.', audience: 'Commuters', personality: ['warm'], visualDirection: 'Morning light', palette: brief.palette, typography: { display: 'Fraunces', body: 'Inter' } }]);
  ok('the brief: the economy model', b.status === 200 && onLuna(b));
  const d = await post('direct', { projectId: P, brief, notes: '', avoid: '' }, U, [{ directions: [] }]);
  ok('art direction: the premium model (GPT-6.1 Sol) at medium effort, on the Responses API', d.status === 200 && onSol(d), J(d.calls[0]?.model));
  ok('  with a time limit inside the operation\'s deadline, so a slow answer leaves the economy model its time, and a signal that can stop it', globalThis.__logosOptions.at(-1)?.timeout === 40000 && !!globalThis.__logosOptions.at(-1)?.signal, J(globalThis.__logosOptions.at(-1)));
  const g = await post('generate', { projectId: P, brief, moodboard: {}, version: 1 }, U, [spec]);
  ok('generation: the premium model', g.status === 200 && onSol(g));
  ok('  its usage says the stage, the tier and the effort', g.json.usage.stage === 'generate' && g.json.usage.tier === 'premium' && g.json.usage.effort === 'medium' && g.json.usage.model === 'gpt-6.1-sol', J(g.json.usage));
  const small = await post('refine', { projectId: P, spec: g.json.spec, brief, moodboard: {}, selection: sel, comment: 'Make the headline say mornings' }, U, [{ understood: 'x', patch: { op: 'content', sectionId: 'hero', content: { title: 'Mornings' }, summary: 's' } }]);
  ok('a small change to a selected part: the economy model, and it says why', small.status === 200 && onLuna(small) && small.json.complexity.tier === 'economy', J(small.json.complexity));
  const big = await post('refine', { projectId: P, spec: g.json.spec, brief, moodboard: {}, selection: sel, comment: 'Rethink the whole hierarchy so it feels more editorial' }, U, [{ understood: 'x', patch: { op: 'none' } }]);
  ok('a change to the structure or the feel: the premium model', big.status === 200 && onSol(big) && big.json.complexity.tier === 'premium', J(big.json.complexity));
  const c = await post('critique', { projectId: P, selection: elementSel, comment: 'Is this CTA prominent enough?', kind: 'generated', name: 'Halcyon' }, U, [REASONING]);
  ok('critique: a short question about the selected part, the economy model, and it says why', c.status === 200 && onLuna(c) && c.json.complexity?.tier === 'economy', J(c.json.complexity));
  const cw = await post('critique', { projectId: P, selection: elementSel, comment: 'Does the whole page hierarchy work for a first-time visitor?', kind: 'generated', name: 'Halcyon' }, U, [REASONING]);
  ok('critique: a question about the whole design, the premium model', cw.status === 200 && onSol(cw) && cw.json.complexity?.tier === 'premium', J(cw.json.complexity));
  const logged = db.rows('ux_v0_calls').filter((r) => r.user_id === U);
  ok('every call is logged with its stage, tier, model, effort, API and measured cost', logged.length === 8 && J(logged.map((r) => `${r.stage}:${r.tier}:${r.model}`)) === J(['discover:economy:gpt-6-luna', 'brief:economy:gpt-6-luna', 'art-direction:premium:gpt-6.1-sol', 'generate:premium:gpt-6.1-sol', 'refine:economy:gpt-6-luna', 'refine:premium:gpt-6.1-sol', 'critique:economy:gpt-6-luna', 'critique:premium:gpt-6.1-sol']) && logged.every((r) => typeof r.cost_usd === 'number' && r.input_tokens === 1200) && logged[2].api === 'responses' && logged[2].effort === 'medium' && logged[0].api === 'chat', J(logged.map((r) => [r.stage, r.tier, r.model, r.api, r.effort])));
  ok('…each with its operation record: how it ended, its retries, its times, its reasoning tokens', logged.every((r) => r.outcome === 'ok' && r.retries === 0 && typeof r.total_ms === 'number' && typeof r.queued_ms === 'number' && r.cancelled === false && typeof r.operation_id === 'string' && typeof r.reasoning_tokens === 'number'), J(logged.map((r) => [r.outcome, r.retries, r.total_ms, r.operation_id])));

  // configured, server-side
  process.env.SOCRIAUX_PREMIUM_MODEL = 'gpt-6-luna';
  const all = await post('direct', { projectId: P, brief, notes: '', avoid: '' }, U, [{ directions: [] }]);
  ok('SOCRIAUX_PREMIUM_MODEL=gpt-6-luna keeps every stage on Luna', all.status === 200 && onLuna(all));
  process.env.SOCRIAUX_PREMIUM_MODEL = 'gpt-6.1-sol';
  process.env.SOCRIAUX_TIER_CRITIQUE = 'economy';
  const ce = await post('critique', { projectId: P, selection: elementSel, comment: 'Is this CTA prominent enough?', kind: 'generated', name: 'Halcyon' }, U, [REASONING]);
  ok('SOCRIAUX_TIER_CRITIQUE=economy moves one stage', ce.status === 200 && onLuna(ce));
  delete process.env.SOCRIAUX_TIER_CRITIQUE;
  process.env.SOCRIAUX_MODEL_GENERATE = 'gpt-6.1-terra';
  const gt = await post('generate', { projectId: P, brief, moodboard: {}, version: 2 }, 'user_v0_route2', [spec]);
  ok('SOCRIAUX_MODEL_GENERATE names one stage\'s model', gt.status === 200 && gt.calls[0]?.model === 'gpt-6.1-terra', J(gt.calls[0]?.model));
  delete process.env.SOCRIAUX_MODEL_GENERATE;
  process.env.SOCRIAUX_MODEL = 'gpt-6-luna';
  const legacy = await post('direct', { projectId: P, brief, notes: '', avoid: '' }, U, [{ directions: [] }]);
  ok('legacy SOCRIAUX_MODEL still runs every stage on its one model', legacy.status === 200 && onLuna(legacy));
  delete process.env.SOCRIAUX_MODEL;

  // a premium model that does not answer in time: the economy model answers, and the designer is told
  globalThis.__logosSlow = ['gpt-6.1-sol'];
  const slow = await post('generate', { projectId: P, brief, moodboard: {}, version: 3 }, 'user_v0_route3', [spec]);
  globalThis.__logosSlow = [];
  ok('a premium call past its time limit: Luna answers in the same request, and the designer is told', slow.status === 200 && slow.calls.map((p) => p.model).join() === 'gpt-6.1-sol,gpt-6-luna' && /gave no answer in 40 seconds/.test(slow.json.notice ?? '') && slow.json.usage.model === 'gpt-6-luna', J({ calls: slow.calls.map((p) => p.model), notice: slow.json?.notice }));
  globalThis.__logosScript = [];

  // budgets: measured spend from ux_v0_usage, the call's worst case estimated
  const today = new Date().toISOString().slice(0, 10);
  const seed = (user, project, cost) => db.rows('ux_v0_usage').push({ user_id: user, project_id: project, day: today, calls: 1, generations: 0, input_tokens: 0, output_tokens: 0, cost_usd: cost });
  seed('user_v0_budget', 'uxv0_b', 1.95);
  const tight = await post('generate', { projectId: 'uxv0_b', brief, moodboard: {}, version: 1 }, 'user_v0_budget', [spec]);
  ok('a premium call the day\'s budget would not hold is made on the economy model, and said', tight.status === 200 && onLuna(tight) && /economy model \(gpt-6-luna\)/.test(tight.json.notice ?? '') && /past its limit/.test(tight.json.notice ?? ''), J({ model: tight.calls[0]?.model, notice: tight.json?.notice }));
  ok('  and the designer is warned the budget is nearly used', /9[78]% of a SocriaUX budget is used/.test(tight.json.notice ?? ''), tight.json?.notice);
  seed('user_v0_budget', 'uxv0_b', 0.06);
  const spent = await post('discover', { projectId: 'uxv0_b', action: 'turn', intent: 'A coffee shop website', questions: [], understanding: {}, moodboard: {} }, 'user_v0_budget', [{ understanding: { summary: 's', known: {}, gaps: [] }, questions: [], ready: true }]);
  ok('a day\'s budget spent: refused plainly, nothing asked, the work kept', spent.status === 429 && spent.json.limit === true && /Today’s SocriaUX budget \(US\$2\.00\) is spent/.test(spent.json.error) && /saved/.test(spent.json.error) && spent.calls.length === 0, J(spent.json));
  db.rows('ux_v0_usage').push({ user_id: 'user_v0_proj', project_id: 'uxv0_big', day: '2020-01-01', calls: 90, generations: 9, input_tokens: 0, output_tokens: 0, cost_usd: 5.01 });
  const proj = await post('discover', { projectId: 'uxv0_big', action: 'turn', intent: 'x', questions: [], understanding: {}, moodboard: {} }, 'user_v0_proj', []);
  const other = await post('discover', { projectId: 'uxv0_small', action: 'turn', intent: 'x', questions: [], understanding: {}, moodboard: {} }, 'user_v0_proj', [{ understanding: { summary: 's', known: {}, gaps: [] }, questions: [], ready: true }]);
  ok('a project\'s budget is its own: that project stops, another goes on', proj.status === 429 && /This project’s budget \(US\$5\.00\) is spent/.test(proj.json.error) && other.status === 200, J([proj.json, other.status]));
  process.env.SOCRIAUX_OPERATION_USD = '0.01';
  const op = await post('direct', { projectId: P, brief, notes: '', avoid: '' }, 'user_v0_op', [{ directions: [] }]);
  ok('a premium call that could cost more than one operation may: the economy model, and why', op.status === 200 && onLuna(op) && /more than one change may \(US\$0\.01\)/.test(op.json.notice ?? ''), J(op.json?.notice));
  delete process.env.SOCRIAUX_OPERATION_USD;
  // a section the designer locked on the canvas: a model's change to it is asked about first
  const lockedSpec = { ...g.json.spec, sections: g.json.spec.sections.map((x) => (x.id === 'hero' ? { ...x, locked: true } : x)) };
  const ask = await post('refine', { projectId: P, spec: lockedSpec, brief, moodboard: {}, selection: sel, comment: 'Make the headline say mornings' }, 'user_v0_lock', [{ understood: 'x', patch: { op: 'content', sectionId: 'hero', content: { title: 'Mornings' }, summary: 's' } }]);
  ok('a change to a locked section comes back as a question, with the patch, not applied', ask.status === 200 && /which you locked\. Make the change anyway\?/.test(ask.json.challenge) && J(ask.json.lockedSections) === J(['hero']) && ask.json.applies === true, J({ c: ask.json?.challenge, l: ask.json?.lockedSections }));
  const forced = await post('refine', { projectId: P, spec: lockedSpec, brief, moodboard: {}, selection: sel, comment: 'Make the headline say mornings', force: true }, 'user_v0_lock', [{ understood: 'x', patch: { op: 'content', sectionId: 'hero', content: { title: 'Mornings' }, summary: 's' } }]);
  ok('…and, when the designer says to go ahead, it is not asked again', forced.status === 200 && !/locked/.test(forced.json.challenge ?? ''));
  process.env.SOCRIAUX_ROUTING = 'single';
}


console.log('\n=== the layout: one question, the decisions in the brief, a salt per project ===');
{
  const V = await import(pathToFileURL(join(here, '.tmp', 'ux-v0-under-test.mjs')).href);
  const U = 'user_v0_layout';
  const intent = 'A booking page for a barbershop where people book a haircut';
  const aud = { id: 'q_a', topic: 'audience', question: 'Who is it for?', why: '', options: [], multi: false, answer: 'Regulars and walk-ins', skipped: false, askedAt: 1 };
  const t = await post('discover', { projectId: 'uxv0_l', action: 'turn', intent, questions: [aud], understanding: {}, moodboard: {} }, U, [
    { understanding: { summary: 's', known: {}, gaps: [] }, questions: [{ topic: 'hierarchy', question: 'What matters most on the page?', why: 'x', options: ['a', 'b'] }, { topic: 'brand', question: 'What should it feel like?', why: 'x', options: ['Calm', 'Loud'] }], ready: false },
  ]);
  ok('the model\'s hierarchy question gives way to SocriaUX\'s own layout question, asked after the model\'s other one', t.status === 200 && J(t.json.questions.map((q) => q.topic)) === J(['brand', 'hierarchy']) && t.json.questions[1].id === 'q_layout' && t.json.questions[1].options[0] === 'The times to choose from' && t.json.questions[1].options[1] === 'The haircut itself', J(t.json.questions));
  ok('…the model was told not to ask it, and it cost nothing extra (one call)', J(t.calls[0].messages).includes('Never ask what should come first') && t.calls.length === 1);
  const lq = t.json.questions[1];
  const again = await post('discover', { projectId: 'uxv0_l', action: 'turn', intent, questions: [aud, lq], understanding: {}, moodboard: {} }, U, [{ understanding: { summary: 's', known: {}, gaps: [] }, questions: [], ready: true }]);
  ok('…and it is never asked twice', again.status === 200 && !again.json.questions.some((q) => q.id === 'q_layout'), J(again.json.questions));
  const answered = [aud, { ...lq, answer: lq.options[1] }];
  const b = await post('brief', { projectId: 'uxv0_l', action: 'synthesize', intent: `${intent}. Asymmetric, lots of white space`, questions: answered, moodboard: {} }, U, [
    { objective: 'Fill the chairs on weekdays.', audience: 'Regulars', palette: [], typography: { display: 'Fraunces', body: 'Inter' }, pageType: 'website', layout: { lead: 'picture', align: 'center', from: { lead: { by: 'designer', said: '' }, align: { by: 'designer', said: '' } } } },
  ]);
  const L = b.json?.brief?.layout;
  ok('the brief settles the layout from the designer\'s words and their answer, each said with where it came from', b.status === 200 && L.lead === 'subject' && L.from.lead.by === 'answer' && L.arrangement === 'asymmetric' && L.from.arrangement.by === 'words', J(L));
  ok('…never from the model: a layout it wrote is dropped', L.align === undefined, J(L));
  ok('…and the space the words asked for reaches the spec', b.json.brief.spec?.density === 'spacious', J(b.json.brief?.spec));
  const mine = { ...b.json.brief, layout: V.decideLayout(L, 'align', 'center') };
  const rb = await post('brief', { projectId: 'uxv0_l', action: 'refine', intent, questions: answered, current: mine, instruction: 'Warmer colours', moodboard: {} }, U, [{ ...mine, visualDirection: 'Warmer, like late sun.', layout: null }]);
  ok('a rewrite keeps what the designer set in the brief, and what was read before', rb.status === 200 && rb.json.brief.layout.align === 'center' && rb.json.brief.layout.from.align.by === 'designer' && rb.json.brief.layout.arrangement === 'asymmetric', J(rb.json.brief?.layout));
  const told = await post('brief', { projectId: 'uxv0_l', action: 'refine', intent, questions: answered, current: mine, instruction: 'Make it left-aligned', moodboard: {} }, U, [{ ...mine, layout: null }]);
  ok('…unless the instruction itself says otherwise: the newest word', told.status === 200 && told.json.brief.layout.align === 'left' && told.json.brief.layout.from.align.by === 'words', J(told.json.brief?.layout));

  // the project's salt: the server draws exactly the directions the browser drew for this project
  const brief = b.json.brief;
  const d = await post('direct', { projectId: 'uxv0_salted', brief, notes: '', avoid: '' }, U, [{ directions: [] }]);
  const local = V.proposeDirections({ brief: V.normalizeBrief(brief), notes: '', avoid: '', base: null, round: 0, seen: [], board: V.normalizeReading(undefined), salt: 'uxv0_salted' });
  const sig = (os) => J(os.map((o) => [o.language, o.compose, o.shapes]));
  ok('the server draws the directions the browser drew for this project: languages, compositions, settings', d.status === 200 && sig(d.json.options) === sig(local), `${sig(d.json.options)} vs ${sig(local)}`);
  const other = await post('direct', { projectId: 'uxv0_other', brief, notes: '', avoid: '' }, U, [{ directions: [] }]);
  ok('another project with the same brief is composed differently', other.status === 200 && sig(other.json.options) !== sig(d.json.options));
  ok('every direction honours the decisions: the haircut first (a split with its card)', d.json.options.every((o) => o.compose?.booking === 'split' && o.shapes?.booking?.summary === 'card'), J(d.json.options.map((o) => [o.compose, o.shapes?.booking])));
  const g = await post('generate', { projectId: 'uxv0_salted', brief, moodboard: {}, version: 1 }, U, [
    { title: 'Fade', sections: [{ id: 'b', kind: 'booking', variant: 'list', content: V.sampleFor('booking', V.intentOf(brief), brief) }] },
  ]);
  const auto = V.autoDirection(V.normalizeBrief(brief), '', '', 'uxv0_salted');
  const bk = g.json?.spec?.sections.find((x) => x.kind === 'booking');
  ok('left to SocriaUX, a generation is composed for this project, and the decisions hold whatever the model drew', g.status === 200 && g.json.artDirection.language === auto.language && bk.variant === 'split' && bk.shape?.summary === 'card', J({ lang: [g.json?.artDirection?.language, auto.language], bk }));
  ok('…the generator was told the decisions', J(g.calls[0].messages).includes("THE DESIGNER'S LAYOUT DECISIONS"));
}


console.log('\n=== the designer’s design system, from GitHub, kept through a rewrite ===');
{
  const V = await import(pathToFileURL(join(here, '.tmp', 'ux-v0-under-test.mjs')).href);
  const U = 'user_v0_ds';
  ok('signed out: refused before GitHub is asked', (await post('design-system', { url: 'acme/ds' }, null, [])).status === 401);
  ok('not a GitHub repository: refused, saying what to give', (await post('design-system', { url: 'https://example.com/tokens.json' }, U, [])).status === 400);
  const css = ':root { --color-primary: #c2410c; --color-background: #fafaf9; --color-text: #1c1917; --font-heading: "Instrument Serif"; --font-body: Inter; --radius-lg: 16px; }';
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push(String(url));
    if (String(url).startsWith('https://api.github.com/repos/acme/ds/')) return new Response(J({ tree: [{ path: 'tokens.css', type: 'blob', size: css.length }, { path: 'README.md', type: 'blob', size: 40 }] }), { status: 200 });
    if (String(url).endsWith('/tokens.css')) return new Response(css, { status: 200 });
    if (String(url).endsWith('/README.md')) return new Response('# Acme\n\n## Rules\n- Never use more than one accent', { status: 200 });
    return new Response('', { status: 404 });
  };
  const got = await post('design-system', { url: 'github.com/acme/ds' }, U, []);
  ok('a public repository is read into a system: its roles, faces and rules; only GitHub asked; no model', got.status === 200 && got.json.system.roles.accent === '#c2410c' && got.json.system.fonts[0].standIn === 'Instrument Serif' && got.json.system.rules.length === 1 && asked.every((u) => /^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//.test(u)) && got.calls.length === 0, J({ s: got.status, j: got.json }).slice(0, 300));
  const none = await post('design-system', { url: 'acme/missing' }, U, []);
  ok('a missing or private repository is said plainly', none.status === 404 && /not found, or it is private/.test(none.json.error));
  globalThis.fetch = realFetch;
  // a brief built within it, rewritten: the system stays attached and the brief stays within it
  const b0 = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for an architecture studio', audience: 'clients', personality: ['precise'], visualDirection: 'calm', palette: [{ hex: '#ffffff', role: 'background' }, { hex: '#111111', role: 'text' }, { hex: '#e11d48', role: 'accent' }], typography: { display: 'Syne', body: 'Inter' } }, new Set());
  const within = V.briefWithSystem(b0, V.normalizeDesignSystem(got.json.system));
  const rb = await post('brief', { projectId: 'uxv0_ds', action: 'refine', intent: 'A website for an architecture studio', questions: [], current: within, instruction: 'Make it warmer', moodboard: {} }, U, [{ ...within, palette: [{ hex: '#fff7ed', role: 'background' }, { hex: '#1c1917', role: 'text' }, { hex: '#ea580c', role: 'accent' }], typography: { display: 'Fraunces', body: 'Inter' }, system: null }]);
  ok('a rewrite keeps the system, and the brief stays within it whatever the model wrote', rb.status === 200 && rb.json.brief.system?.name === 'Acme' && rb.json.brief.palette.find((x) => x.role === 'accent').hex === '#c2410c' && rb.json.brief.typography.display === 'Instrument Serif' && rb.json.brief.decisions.colour === 'locked', J(rb.json?.brief?.palette));
  // a change that leaves the system is asked about first
  const spec = V.normalizeSpec({ title: 'Studio', pageType: 'website', tokens: { colors: { background: '#fafaf9', surface: '#ffffff', text: '#1c1917', muted: '#57534e', accent: '#c2410c', accentText: '#ffffff', line: '#e7e5e4' }, fonts: { display: 'Instrument Serif', body: 'Inter' }, scale: 'comfortable', radius: 'round', style: 'editorial', imageTreatment: 'natural' }, sections: [{ id: 'hero', kind: 'hero', variant: 'editorial', content: { title: 'Rooms for thinking' } }] }, { refs: [] });
  const ch = await post('refine', { projectId: 'uxv0_ds', spec, brief: within, moodboard: {}, comment: 'Make the accent purple' }, U, [{ understood: 'Purple accent', patch: { op: 'tokens', tokens: { colors: { accent: '#7c3aed' } }, summary: 'Purple' } }]);
  ok('a change that leaves the design system is asked about first, with the patch', ch.status === 200 && /not in your design system \(Acme\)/.test(ch.json.challenge) && ch.json.applies === true, J(ch.json?.challenge));
}

console.log('\n=== one operation, on a deadline, streamed, cancellable, recorded (lib/ux-v0/stage-server.ts) ===');
{
  delete process.env.SOCRIAUX_ROUTING;
  delete process.env.SOCRIAUX_MODEL;
  process.env.SOCRIAUX_DAILY_CALLS = '500';
  const V = await import(pathToFileURL(join(here, '.tmp', 'ux-v0-under-test.mjs')).href);
  const U = 'user_v0_ops';
  globalThis.__users[U] = { firstName: 'Op', emails: ['op@example.com'] };
  process.env.SOCRIA_ONE_USER_IDS = `${process.env.SOCRIA_ONE_USER_IDS},${U},user_v0_ops2`;
  const turnAnswer = { understanding: { summary: 's', known: {}, gaps: [] }, questions: [{ topic: 'audience', question: 'Who?', why: 'w', options: ['A', 'B'] }], ready: false };
  const turnBody = (n = 0) => ({ projectId: 'uxv0_ops', action: 'turn', intent: `A coffee shop website ${n}`, questions: [], understanding: {}, moodboard: {} });
  /** a request as the browser sends it, its raw response */
  const send = (route, body, uid, { headers = {}, signal } = {}) => {
    globalThis.__uid = uid;
    return R[route].POST(new NextRequest(`http://localhost/api/ux-v0/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: J(body), ...(signal ? { signal } : {}) }));
  };
  /** a streamed answer, read line by line: every event, and when each arrived */
  const readNd = async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const events = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) events.push({ ...JSON.parse(line), at: Date.now() });
      }
    }
    return events;
  };
  const ND = { accept: 'application/x-ndjson, application/json' };
  globalThis.__logosUsage = { prompt_tokens: 1200, completion_tokens: 300, completion_tokens_details: { reasoning_tokens: 120 } };

  // streamed: accepted at once, progress as it happens, then the same answer the JSON route gives
  globalThis.__logosScript = [turnAnswer];
  globalThis.__logosCalls = [];
  const res = await send('discover', turnBody(1), U, { headers: ND });
  ok('a browser that asks for progress gets a stream of JSON lines', /application\/x-ndjson/.test(res.headers.get('content-type') ?? ''), res.headers.get('content-type'));
  const evs = await readNd(res);
  const result = evs.find((e) => e.type === 'result');
  ok('…its first line is "accepted", before any check or model call', evs[0]?.type === 'accepted' && typeof evs[0].op === 'string', J(evs.map((e) => e.type)));
  ok('…then honest progress: checking, the model asked (which, and its tier), writing (so many characters), finishing', ['checking', 'asked', 'writing', 'finishing'].every((ph) => evs.some((e) => e.type === 'progress' && e.phase === ph)) && evs.find((e) => e.phase === 'asked').model === 'gpt-6-luna', J(evs.filter((e) => e.type === 'progress').map((e) => e.phase)));
  ok('…then the result: the same answer, its usage, and its operation record', result?.status === 200 && result.body.questions.length >= 1 && result.body.usage.model === 'gpt-6-luna' && result.body.telemetry?.outcome === 'ok' && result.body.telemetry.stage === 'discover', J(result).slice(0, 300));
  ok('…the record holds numbers and labels only: times, tokens (reasoning apart), retries — no prompt, no words of the designer', result.body.telemetry.reasoning === 120 && result.body.telemetry.input === 1200 && result.body.telemetry.retries === 0 && typeof result.body.telemetry.ttftMs === 'number' && typeof result.body.telemetry.queuedMs === 'number' && !J(result.body.telemetry).includes('coffee'), J(result.body.telemetry));
  ok('…and the call was streamed from the model, with its prompt-cache key and a bounded reasoning room', globalThis.__logosCalls[0]?.stream === true && /^socria-ux-v0-/.test(globalThis.__logosCalls[0]?.prompt_cache_key ?? '') && !('reasoning_room' in globalThis.__logosCalls[0]), J(Object.keys(globalThis.__logosCalls[0] ?? {})));

  // the same action twice (a double-click): one model call, the same answer for both
  globalThis.__logosScript = [turnAnswer, turnAnswer];
  globalThis.__logosCalls = [];
  const op = { 'x-operation-id': 'op_double_click_1' };
  const [d1, d2] = await Promise.all([send('discover', turnBody(2), U, { headers: op }), send('discover', turnBody(2), U, { headers: op })]);
  const [j1, j2] = [await d1.json(), await d2.json()];
  ok('the same action sent twice at once: one model call, and both get its answer', globalThis.__logosCalls.length === 1 && d1.status === 200 && d2.status === 200 && J(j1.questions) === J(j2.questions), J({ calls: globalThis.__logosCalls.length, s: [d1.status, d2.status] }));
  ok('…the second says it was answered once (no tokens of its own)', [j1, j2].some((j) => j.telemetry.outcome === 'coalesced' && j.telemetry.input === 0), J([j1.telemetry.outcome, j2.telemetry.outcome]));
  globalThis.__logosCalls = [];
  const again = await send('discover', turnBody(2), U, { headers: op });
  ok('…and again a moment later (a network retry of a finished action): its answer, still no second call', again.status === 200 && globalThis.__logosCalls.length === 0 && (await again.json()).telemetry.outcome === 'coalesced');
  // unnamed identical requests overlapping: one call
  globalThis.__logosScript = [turnAnswer, turnAnswer];
  globalThis.__logosCalls = [];
  const [u1, u2] = await Promise.all([send('discover', turnBody(3), U), send('discover', turnBody(3), U)]);
  ok('an identical request without a name, while the first is still running: one call', globalThis.__logosCalls.length === 1 && u1.status === 200 && u2.status === 200, globalThis.__logosCalls.length);
  // a failure is never reused: trying again tries again
  globalThis.__logosScript = [new Error('boom'), turnAnswer];
  globalThis.__logosCalls = [];
  const opF = { 'x-operation-id': 'op_failed_then_retried' };
  const f1 = await send('discover', turnBody(4), U, { headers: opF });
  const f2 = await send('discover', turnBody(4), U, { headers: opF });
  ok('a failed action is not kept: the same action again really asks again', f1.status === 502 && f2.status === 200 && globalThis.__logosCalls.length === 2, J([f1.status, f2.status, globalThis.__logosCalls.length]));

  // enough at once, not more: a person's operations, and the instance's
  globalThis.__logosHang = ['gpt-6-luna'];
  process.env.SOCRIAUX_USER_CONCURRENCY = '2';
  globalThis.__logosCalls = [];
  const ctls = [new AbortController(), new AbortController()];
  const held = [send('discover', turnBody(5), U, { signal: ctls[0].signal }), send('discover', turnBody(6), U, { signal: ctls[1].signal })];
  await new Promise((r) => setTimeout(r, 30));
  const third = await send('discover', turnBody(7), U);
  const tj = await third.json();
  ok('past a person\'s limit of operations at once: refused at once, saying why and when to try again — no model call', third.status === 429 && tj.busy === true && tj.retryAfter > 0 && globalThis.__logosCalls.length === 2, J({ s: third.status, j: tj }));
  ctls.forEach((c) => c.abort());
  const heldOut = await Promise.all(held);
  ok('…cancelling the two running stops their model calls, and each says it was cancelled', heldOut.every((r) => r.status === 499), J(heldOut.map((r) => r.status)));
  const heldJson = await Promise.all(heldOut.map((r) => r.json()));
  ok('…recorded as cancelled', heldJson.every((j) => j.cancelled === true && j.telemetry.outcome === 'cancelled' && j.telemetry.cancelled === true), J(heldJson.map((j) => j.telemetry?.outcome)));
  delete process.env.SOCRIAUX_USER_CONCURRENCY;
  process.env.SOCRIAUX_MAX_CONCURRENT = '1';
  const ctl = new AbortController();
  const one = send('discover', turnBody(8), U, { signal: ctl.signal });
  await new Promise((r) => setTimeout(r, 30));
  const other = await send('discover', turnBody(9), 'user_v0_ops2');
  ok('past the instance\'s limit (a workshop setting): another designer is asked to try again in a few seconds', other.status === 503 && (await other.json()).busy === true);
  ctl.abort();
  await one;
  delete process.env.SOCRIAUX_MAX_CONCURRENT;

  // a stalled provider: SocriaUX answers within its deadline, never a platform timeout
  process.env.SOCRIAUX_ROUTE_BUDGET_MS = '5000';
  const t0 = Date.now();
  const stalled = await send('discover', turnBody(10), U, { headers: ND });
  const sev = await readNd(stalled);
  const sres = sev.find((e) => e.type === 'result');
  const took = Date.now() - t0;
  ok('a provider that never answers: SocriaUX itself answers by its deadline, with a 504 that says nothing changed', sres?.status === 504 && sres.body.timeout === true && /Nothing changed/.test(sres.body.error) && took < 7000 && took >= 4500, J({ took, s: sres?.status, e: sres?.body?.error }));
  ok('…and while it waited, the browser heard that it was still thinking or checking (not silence)', sev.filter((e) => e.type === 'progress').length >= 2, J(sev.map((e) => e.phase ?? e.type)));
  globalThis.__logosHang = [];
  delete process.env.SOCRIAUX_ROUTE_BUDGET_MS;

  // the provider's rate limit, said as itself with when to try again
  globalThis.__logosScript = [Object.assign(new Error('Rate limit reached for requests'), { status: 429, headers: { 'retry-after': '7' } }), Object.assign(new Error('Rate limit reached'), { status: 429 }), Object.assign(new Error('Rate limit reached'), { status: 429 })];
  const rl = await send('discover', turnBody(11), U);
  const rlj = await rl.json();
  ok('the provider\'s rate limit: a 503 that says so, nothing changed, and when to try again', rl.status === 503 && rlj.providerLimit === true && rlj.retryAfter > 0 && /Nothing changed/.test(rlj.error), J({ s: rl.status, j: rlj }));

  // an organisation's budget, summed across its members
  process.env.SOCRIAUX_ORG_DAILY_USD = '0.5';
  db.rows('ux_v0_calls').push({ user_id: 'someone_else', project_id: 'p', at: Date.now(), day: new Date().toISOString().slice(0, 10), stage: 'generate', tier: 'premium', model: 'gpt-6.1-sol', api: 'responses', effort: 'medium', input_tokens: 0, cached_tokens: 0, output_tokens: 0, cost_usd: 0.6, downgraded: false, org_id: 'org_ux_club' });
  globalThis.__orgId = 'org_ux_club';
  globalThis.__logosScript = [turnAnswer];
  const orgOut = await send('discover', turnBody(12), U);
  const orgJ = await orgOut.json();
  ok('an organisation over its daily budget: its members are told, before any model is asked', orgOut.status === 429 && /organisation/.test(orgJ.error) && orgJ.limit === true, J(orgJ));
  globalThis.__orgId = 'org_other';
  globalThis.__logosScript = [turnAnswer];
  const orgOk = await send('discover', turnBody(13), U);
  ok('…another organisation is not', orgOk.status === 200);
  const mine = db.rows('ux_v0_calls').filter((r) => r.user_id === U).at(-1);
  ok('…and each call is recorded with its organisation, for the sum', mine?.org_id === 'org_other', J(mine));
  globalThis.__orgId = null;
  delete process.env.SOCRIAUX_ORG_DAILY_USD;

  // a database from before the telemetry columns: calls are still logged, without them
  db.missing.ux_v0_calls = new Set(['operation_id', 'outcome', 'retries', 'reasoning_tokens', 'queued_ms', 'ttft_ms', 'model_ms', 'total_ms', 'cancelled', 'operation']);
  const before = db.rows('ux_v0_calls').length;
  globalThis.__logosScript = [turnAnswer];
  const oldDb = await send('discover', turnBody(14), U);
  ok('a database without the telemetry columns yet: the call still answers, and is still logged', oldDb.status === 200 && db.rows('ux_v0_calls').length === before + 1, J({ s: oldDb.status, n: db.rows('ux_v0_calls').length - before }));
  delete db.missing.ux_v0_calls;

  // the budget the browser sees, to warn before an expensive step
  globalThis.__logosScript = [turnAnswer];
  const bj = await (await send('discover', turnBody(15), U)).json();
  ok('every answer says what is spent of each budget, and the limits, for a warning before an expensive step', typeof bj.budget?.day?.spent === 'number' && bj.budget.day.limit > 0 && typeof bj.budget.project.limit === 'number', J(bj.budget));

  // SocriaUX's saves have their own rate limit: a busy session's syncs never use up its model calls
  delete process.env.RATE_LIMIT_DISABLED;
  const RU = 'user_v0_rl';
  globalThis.__users[RU] = { firstName: 'Rl', emails: ['rl@example.com'] };
  let refusedSync = 0;
  for (let i = 0; i < 45; i++) if ((await post('projects', null, RU, [], 'GET')).status === 429) refusedSync++;
  globalThis.__logosScript = [turnAnswer];
  const afterSyncs = await send('discover', turnBody(16), RU);
  ok('45 project reads in a minute (more than the old shared limit of 40) are not refused, and a model call after them still answers', refusedSync === 0 && afterSyncs.status === 200, J({ refusedSync, s: afterSyncs.status }));
  process.env.RATE_LIMIT_DISABLED = '1';

  // unusual use is flagged in the logs, once, the person hashed; nothing is blocked by it
  process.env.SOCRIAUX_UNUSUAL_CALLS = '3';
  const UU = 'user_v0_unusual_person';
  globalThis.__users[UU] = { firstName: 'Un', emails: ['un@example.com'] };
  process.env.SOCRIA_ONE_USER_IDS = `${process.env.SOCRIA_ONE_USER_IDS},${UU}`;
  const warned = [];
  const quietWarn = console.warn;
  const { format } = await import('node:util');
  console.warn = (...a) => warned.push(format(...a));
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    globalThis.__logosScript = [turnAnswer];
    statuses.push((await send('discover', turnBody(100 + i), UU)).status);
  }
  console.warn = quietWarn;
  const unusual = warned.filter((w) => w.includes('[ux-v0 unusual]'));
  ok('a burst of calls past the unusual-use line: flagged once in the logs, the person hashed, nothing refused', unusual.length === 1 && !unusual[0].includes(UU) && /calls_10m=4/.test(unusual[0]) && statuses.every((x) => x === 200), J({ unusual, statuses }));
  delete process.env.SOCRIAUX_UNUSUAL_CALLS;

  // a quick edit that would make text hard to read is asked about first, not applied silently
  const sp = V.normalizeSpec({ title: 'Studio', pageType: 'website', tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#555555', accent: '#1d4ed8', accentText: '#ffffff', line: '#e5e5e5' }, fonts: { display: 'Fraunces', body: 'Inter' }, scale: 'comfortable', radius: 'soft', style: 'editorial', imageTreatment: 'natural' }, sections: [{ id: 'hero', kind: 'hero', variant: 'editorial', content: { title: 'Rooms for thinking', primary: 'Visit' } }] }, { refs: [] });
  globalThis.__logosCalls = [];
  const grey = await post('refine', { projectId: 'uxv0_q', spec: sp, moodboard: {}, comment: 'Make the text light grey' }, U, []);
  ok('quick edit: light grey text on white is asked about (its contrast said), with the patch ready — and no model was asked', grey.status === 200 && /contrast of 1\.\d:1/.test(grey.json.challenge) && grey.json.applies === true && grey.json.deterministic === true && grey.calls.length === 0, J(grey.json));
  const btn = await post('refine', { projectId: 'uxv0_q', spec: sp, moodboard: {}, selection: { ...elementSel, element: { ...capture, ux: { section: 'hero', path: 'primary' } } }, comment: 'Change the button color to black' }, U, []);
  ok('quick edit: the button colour to black, its words kept readable on it, at once', btn.json.deterministic === true && btn.json.patch.tokens.colors.accent === '#000000' && btn.json.patch.tokens.colors.accentText === '#ffffff' && btn.json.challenge === '' && btn.calls.length === 0, J(btn.json));
}

console.log('\n=== the Creative DNA through the routes ===');
{
  const V = await import(pathToFileURL(join(here, '.tmp', 'ux-v0-under-test.mjs')).href);
  const DU = 'user_v0_dna';
  const brief = { objective: 'A luxury fashion house: a new collection of tailored coats.', audience: 'Clients of the house', personality: ['quiet', 'exacting'], visualDirection: 'Quiet, assured', palette: [{ hex: '#f4f1ea', role: 'background' }, { hex: '#1b1a17', role: 'text' }, { hex: '#5a2a1c', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter' }, pageType: 'website' };
  const nb = V.normalizeBrief(brief);
  const base = V.deriveDNA({ brief: nb, board: null, kind: V.intentOf(nb).kind });
  const lockAll = (d, vals) => Object.entries(vals).reduce((x, [k, v]) => V.lockDim(V.setDim(x, k, v), k, true), d);
  const quiet = lockAll(base, { composition: 12, motion: 8, typography: 85 });
  // the server draws the same directions from the same DNA as the browser
  const d = await post('direct', { projectId: 'uxv0_dna', brief, dna: quiet }, DU, [{ directions: [{ candidate: 1, name: 'One' }, { candidate: 2, name: 'Two' }, { candidate: 3, name: 'Three' }] }]);
  const local = V.proposeDirections({ brief: nb, dna: V.normalizeDNA(quiet), salt: V.saltOf('uxv0_dna') });
  ok('direct: the three are drawn from the DNA the browser sent — the same languages it drew, each carrying its lean', d.status === 200 && J(d.json.options.map((o) => o.language)) === J(local.map((o) => o.language)) && d.json.options.every((o) => o.dna && o.dna.composition === 12 && typeof o.dnaLean === 'string'), J(d.json.options?.map((o) => [o.language, o.dna?.composition])));
  ok('…and the locks hold in all three: strict grids, still motion', d.json.options.every((o) => ['swiss', 'modular', 'stack'].includes(o.look.grid) && ['still', 'calm'].includes(o.look.motion.feel)), J(d.json.options.map((o) => [o.look.grid, o.look.motion.feel])));
  // a generated page held to its locked DNA, whatever the approved direction or the model did
  const wild = { ...d.json.options[0], look: { ...d.json.options[0].look, grid: 'poster', rhythm: 'dramatic', motion: V.motionFor('kinetic') } };
  const sections = [{ id: 'nav', kind: 'nav', content: { brand: 'Maison', links: ['Collection'] } }, { id: 'hero', kind: 'hero', variant: 'editorial', content: { title: 'Coats, cut slowly', primary: 'Book a fitting' } }, { id: 'f', kind: 'footer', content: { brand: 'Maison' } }];
  const g = await post('generate', { projectId: 'uxv0_dna', brief, moodboard: { refs: [] }, version: 1, artDirection: wild, dna: quiet }, DU, [{ title: 'Maison', sections }]);
  ok('generate: a page that drifted from a locked dimension is moved back in code, and the answer says which', g.status === 200 && g.json.dnaHeld.includes('composition') && g.json.dnaHeld.includes('motion') && ['swiss', 'modular', 'stack'].includes(g.json.spec.look.grid) && g.json.spec.look.motion.feel !== 'kinetic', J({ held: g.json.dnaHeld, grid: g.json.spec.look.grid, feel: g.json.spec.look.motion?.feel }));
  ok('…the generator was told the DNA in one line, with what is locked', J(g.calls[0]).includes('CREATIVE DNA') && J(g.calls[0]).includes('Locked by the designer'));
  const g0 = await post('generate', { projectId: 'uxv0_dna2', brief, moodboard: { refs: [] }, version: 1, artDirection: wild }, 'user_v0_dna2', [{ title: 'Maison', sections }]);
  ok('…and without a DNA, nothing is held and nothing told', g0.status === 200 && J(g0.json.dnaHeld) === '[]' && !J(g0.calls[0]).includes('CREATIVE DNA'), J(g0.json.dnaHeld));
  // a change that moves a locked dimension is asked about first — even one made in code
  const spec = g.json.spec;
  const sans = await post('refine', { projectId: 'uxv0_dna', spec, brief, moodboard: { refs: [] }, comment: 'Use Inter for the headlines', dna: quiet }, DU, []);
  ok('refine: a quick edit that moves the typography away from where it was locked is asked about, the patch ready, no model asked', sans.status === 200 && sans.json.deterministic === true && sans.json.dnaMoved.includes('typography') && /Creative DNA/.test(sans.json.challenge) && sans.json.applies === true && sans.calls.length === 0, J(sans.json));
  const forced = await post('refine', { projectId: 'uxv0_dna', spec, brief, moodboard: { refs: [] }, comment: 'Use Inter for the headlines', dna: quiet, force: true }, DU, []);
  ok('…and once the designer says so, it is made', forced.json.challenge === '' && forced.json.applies === true);
  const free = await post('refine', { projectId: 'uxv0_dna', spec, brief, moodboard: { refs: [] }, comment: 'Use Inter for the headlines', dna: base }, DU, []);
  ok('…nothing is asked when that dimension is not locked', free.json.challenge === '' && J(free.json.dnaMoved) === '[]', J(free.json));
  const viaModel = await post('refine', { projectId: 'uxv0_dna', spec, brief, moodboard: { refs: [] }, comment: 'Make the whole page feel like a poster', dna: quiet }, DU, [{ understood: 'A poster', patch: { op: 'look', look: { grid: 'poster', rhythm: 'dramatic' }, summary: 'Poster grid' } }]);
  ok('…the same for a change the model wrote, checked in code after it answered; the model was told the DNA', viaModel.json.dnaMoved.includes('composition') && /Creative DNA/.test(viaModel.json.challenge) && J(viaModel.calls[0]).includes('CREATIVE DNA'), J(viaModel.json));
  ok('a DNA that does not hold together is ignored, never trusted', (await post('refine', { projectId: 'uxv0_dna', spec, moodboard: { refs: [] }, comment: 'Use Inter for the headlines', dna: { dims: { typography: { value: 'x', locked: true } } } }, DU, [])).json.challenge === '');
}

console.log('\n=== pictures from an image model: off unless configured, priced, capped, recorded apart ===');
{
  const IU = 'user_v0_img';
  const brief = { objective: 'Show a ceramic studio’s new glazes and sell the first run of vessels.', audience: 'Collectors', personality: ['quiet', 'tactile'], visualDirection: 'Warm daylight', palette: [{ hex: '#f2ede4', role: 'background' }, { hex: '#1d1a16', role: 'text' }, { hex: '#7a3b22', role: 'accent' }], typography: { display: 'Fraunces', body: 'Inter' }, pageType: 'website' };
  delete process.env.SOCRIAUX_IMAGE_GEN;
  const g0 = await post('assets', null, IU, [], 'GET');
  ok('off by default: the browser is told it is off, and why', g0.status === 200 && g0.json.enabled === false && /off on this server/.test(g0.json.why) && g0.json.prices.square > 0, J(g0.json));
  globalThis.__imagesScript = [];
  const p0 = await post('assets', { projectId: 'uxv0_img', brief, purpose: 'the opening', ratio: '16:9' }, IU, []);
  ok('…and asking anyway is refused before any provider is called', p0.status === 403 && p0.json.off === true && p0.calls.length === 0, J(p0));
  process.env.SOCRIAUX_IMAGE_GEN = 'on';
  process.env.SOCRIAUX_IMAGE_DAILY_USD = '1';
  const p1 = await post('assets', { projectId: 'uxv0_img', brief, purpose: 'the opening', subject: 'a celadon vessel on a plaster plinth', ratio: '16:9', treatment: 'natural light, documentary', colours: ['bone', 'iron red'], mood: ['quiet'] }, IU, []);
  const call = p1.calls.find((c) => c.images);
  ok('on: one picture from the image model, checked to be a real PNG, returned as a data address', p1.status === 200 && /^data:image\/png;base64,/.test(p1.json.image.dataUrl) && p1.json.image.mime === 'image/png' && p1.calls.length === 1 && call?.images.model === 'gpt-image-1' && call.images.size === '1536x1024' && call.images.n === 1, J({ status: p1.status, calls: p1.calls.length, size: call?.images?.size }));
  ok('…its prompt written from the brief and the direction: the subject, the use, the treatment, the colours; never text or logos', /celadon vessel/.test(p1.json.image.prompt) && /the opening/.test(p1.json.image.prompt) && /natural light/.test(p1.json.image.prompt) && /iron red/.test(p1.json.image.prompt) && /No text, letters, numbers, logos/.test(p1.json.image.prompt) && p1.json.image.prompt === call.images.prompt);
  ok('…priced, and the price recorded as the "image" stage, apart from text', p1.json.image.cost > 0 && p1.json.usage.stage === 'image' && p1.json.usage.cost === p1.json.image.cost && bumps.at(-1)?.p_cost === p1.json.image.cost, J({ usage: p1.json.usage, bump: bumps.at(-1) }));
  process.env.SOCRIAUX_IMAGE_DAILY_USD = '0.01';
  const p2 = await post('assets', { projectId: 'uxv0_img', brief, purpose: 'a project in the gallery', ratio: '1:1' }, IU, []);
  ok('a picture that would pass the day’s budget for pictures is refused before the provider is asked', p2.status === 429 && /budget for pictures/.test(p2.json.error) && p2.calls.length === 0, J(p2));
  process.env.SOCRIAUX_IMAGE_DAILY_USD = '1';
  globalThis.__imagesScript = [Buffer.from('<html>not a picture</html>'.repeat(4)).toString('base64')];
  const p3 = await post('assets', { projectId: 'uxv0_img', brief, purpose: 'the opening', ratio: '4:3' }, IU, []);
  ok('an answer that is not a real picture is refused; nothing kept', p3.status === 502 && /not a picture/.test(p3.json.error), J(p3));
  globalThis.__imagesScript = [Object.assign(new Error('rate limited'), { status: 429 })];
  const p4 = await post('assets', { projectId: 'uxv0_img', brief, purpose: 'the opening', ratio: '4:3' }, IU, []);
  ok('a busy provider is a calm 503', p4.status === 503 && /busy/.test(p4.json.error));
  ok('no purpose, no picture', (await post('assets', { projectId: 'uxv0_img', brief, ratio: '4:3' }, IU, [])).status === 400);
  ok('signed out: refused', (await post('assets', { purpose: 'x' }, null, [])).status === 401);
  delete process.env.SOCRIAUX_IMAGE_GEN;
  delete process.env.SOCRIAUX_IMAGE_DAILY_USD;
  globalThis.__imagesScript = [];
}

console.log('\n=== how demanding a generation is: read in code, said, and the model chosen by it ===');
{
  // two people, so each stays within the day's generations (SOCRIAUX_DAILY_GENERATIONS=2 here)
  const CU = 'user_v0_cx';
  const CU2 = 'user_v0_cx2';
  const page = { title: 'Page', pageType: 'website', sections: [{ id: 'hero', kind: 'hero', content: { title: 'Hello', primary: 'Go' } }, { id: 'f', kind: 'footer', content: { brand: 'B' } }] };
  const formPage = { title: 'Contact', pageType: 'app-screen', sections: [{ id: 'c', kind: 'form', content: { title: 'Write to us', fields: [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }], submit: 'Send' } }] };
  const form = { objective: 'A contact form for a small accounting practice', audience: 'Local businesses', personality: ['clear'], visualDirection: 'Plain and calm' };
  const immersive = { objective: 'An immersive 3D product experience for a new speaker, with a configurator for its finish', audience: 'Audiophiles', personality: ['precise', 'bold'], visualDirection: 'Dark studio, rim light' };
  const g1 = await post('generate', { projectId: 'uxv0_cx', brief: form, moodboard: {}, version: 1 }, CU, [formPage]);
  ok('a simple page is read as simple, and still made on the premium model by default', g1.status === 200 && g1.json.complexity?.level === 'low' && g1.json.complexity.tier === 'premium' && g1.calls[0]?.model === 'gpt-6.1-sol', J({ status: g1.status, cx: g1.json?.complexity, model: g1.calls[0]?.model, err: g1.json?.error }));
  ok('  its usage carries the time it took on the server', typeof g1.json.usage?.ms === 'number' && g1.json.usage.ms >= 0, J(g1.json.usage));
  process.env.SOCRIAUX_SIMPLE_ECONOMY = 'on';
  const g2 = await post('generate', { projectId: 'uxv0_cx', brief: form, moodboard: {}, version: 2 }, CU, [formPage]);
  ok('where the deployment opted in, simple work goes to the economy model, and says so', g2.status === 200 && g2.json.complexity.tier === 'economy' && g2.calls[0]?.model === 'gpt-6-luna' && g2.json.usage.tier === 'economy', J({ status: g2.status, cx: g2.json?.complexity, model: g2.calls[0]?.model }));
  const g3 = await post('generate', { projectId: 'uxv0_cx2', brief: immersive, moodboard: {}, version: 1 }, CU2, [page]);
  ok('demanding work never does: a 3D object and a configurator stay on the premium model, with the reasons said', g3.status === 200 && g3.json.complexity.level === 'high' && g3.json.complexity.tier === 'premium' && g3.calls[0]?.model === 'gpt-6.1-sol' && g3.json.complexity.why.includes('a 3D object') && g3.json.complexity.why.includes('a configurator'), J({ status: g3.status, cx: g3.json?.complexity, model: g3.calls[0]?.model, err: g3.json?.error }));
  ok('  and the page it makes has the 3D object and the configurator the brief needs', g3.status === 200 && ['scene', 'configurator'].every((k) => g3.json.spec.sections.some((x) => x.kind === k)), J(g3.json?.spec?.sections?.map((x) => x.kind)));
  process.env.SOCRIAUX_TIER_GENERATE = 'premium';
  const g4 = await post('generate', { projectId: 'uxv0_cx2', brief: form, moodboard: {}, version: 1 }, CU2, [formPage]);
  ok('an operator’s tier set for the stage still holds over the reading', g4.status === 200 && g4.calls[0]?.model === 'gpt-6.1-sol', J({ status: g4.status, model: g4.calls[0]?.model }));
  delete process.env.SOCRIAUX_TIER_GENERATE;
  delete process.env.SOCRIAUX_SIMPLE_ECONOMY;
  const logged = db.rows('ux_v0_calls').filter((r) => r.user_id === CU || r.user_id === CU2);
  ok('each generation is in the call log with the tier it ran on', logged.length === 4 && J(logged.map((r) => r.tier)) === J(['premium', 'economy', 'premium', 'premium']), J(logged.map((r) => [r.tier, r.model])));
}

console.log('\n=== creative discovery: the next turn, decided by the question model, held to its shape ===');
{
  const Q = 'user_v0_studio';
  const was = { routing: process.env.SOCRIAUX_ROUTING, model: process.env.SOCRIAUX_MODEL };
  process.env.SOCRIAUX_ROUTING = 'single';
  process.env.SOCRIAUX_MODEL = 'gpt-6.1-sol';
  const context = {
    mode: 'graphic',
    conversation: [
      { who: 'person', text: 'Make me a poster.' },
      { who: 'socria', text: 'What’s the poster for?' },
      { who: 'person', text: 'An underground electronic music event.' },
    ],
    brief: null,
    asked: 1,
    shown: [],
    pictures: [],
    sites: [],
    system: null,
  };
  const BRIEF = { kind: 'a poster', purpose: 'an underground electronic music event', audience: '', content: '', feel: '', explicit: ['a poster for an underground electronic music event'], implied: ['a night-time, club audience'], tentative: [], avoid: [], references: [], open: ['how it should feel'], clear: [] };
  const ASK = {
    action: 'ask',
    say: 'Got it — a club night.',
    question: {
      text: 'Do you imagine it dark and atmospheric, or more chaotic and experimental?',
      suggestions: [],
      aid: {
        kind: 'moods',
        sample: 'Underground',
        palettes: null,
        faces: null,
        moods: [
          { name: 'Fog and strobe', note: 'near-black ground, one acid accent, condensed type', colours: ['#0b0b0d', '#e9e6df', '#c6ff3d'], display: 'Anton' },
          { name: 'Photocopy riot', note: 'xeroxed greys, red marks, type that collides', colours: ['#d9d6cf', '#151515', '#e2261c'], display: 'Archivo Black' },
          { name: 'Unreadable', note: 'ink the same as the ground', colours: ['#777777', '#787878', '#797979'], display: 'Anton' },
          { name: 'Invented face', note: 'not a library face', colours: ['#000000', '#ffffff', '#ff0000'], display: 'Comic Sans' },
        ],
      },
    },
    mode: null,
    brief: BRIEF,
  };
  const signedOut = await post('studio-questions', { context }, null, [ASK]);
  ok('signed out: refused, told to sign in, nothing asked', signedOut.status === 401 && signedOut.calls.length === 0, J(signedOut));
  ok('no conversation: no call', (await post('studio-questions', {}, Q, [ASK])).status === 400 && (await post('studio-questions', { context: { ...context, mode: 'critique' } }, Q, [ASK])).status === 400 && (await post('studio-questions', { context: { ...context, conversation: [] } }, Q, [ASK])).status === 400);

  const r = await post('studio-questions', { projectId: 'uxv0_studio', context }, Q, [ASK]);
  const d = r.json?.decision;
  ok('a question comes back, decided by the model, with what it took from the reply', r.status === 200 && d?.action === 'ask' && d.by === 'model' && /club night/.test(d.say) && /chaotic/.test(d.ask.text), J(r.json));
  ok('  its moods hold only real colours that read and faces from the library (two of four kept)', d?.ask?.aid?.kind === 'moods' && d.ask.aid.options.length === 2 && d.ask.aid.options.every((m) => /^#[0-9a-f]{6}$/.test(m.colours[0]) && ['Anton', 'Archivo Black'].includes(m.display)), J(d?.ask?.aid));
  ok('  the brief comes back in the person’s words', d?.brief?.purpose === 'an underground electronic music event' && d.brief.open.includes('how it should feel'), J(d?.brief));
  const sent = r.calls[0] ?? {};
  ok('the model is asked under a strict schema', sent.text?.format?.type === 'json_schema' && sent.text.format.name === 'socriaux_studio_questions' && sent.text.format.strict === true, J(sent.text));
  ok('  told how to decide, how to ask and the font library; given the conversation in order', /Each turn, decide one thing/.test(sent.instructions ?? '') && /FONT LIBRARY/.test(sent.instructions ?? '') && /Fraunces/.test(sent.instructions ?? '') && /PERSON: Make me a poster\.[\s\S]*SOCRIAUX: What’s the poster for\?[\s\S]*PERSON: An underground/.test(J(sent.input ?? '')), J(sent.input).slice(0, 600));

  const shown = await post('studio-questions', { projectId: 'uxv0_studio', context: { ...context, shown: ['moods'] } }, Q, [ASK]);
  ok('an aid already shown is not shown again (the question stands without it)', shown.status === 200 && shown.json.decision.action === 'ask' && shown.json.decision.ask.aid === null, J(shown.json));
  const late = await post('studio-questions', { projectId: 'uxv0_studio', context: { ...context, asked: 5 } }, Q, [ASK]);
  ok('past the question limit: made, whatever the model asked', late.status === 200 && late.json.decision.action === 'make', J(late.json));
  const make = await post('studio-questions', { projectId: 'uxv0_studio', context }, Q, [{ action: 'make', say: 'That’s enough — chaotic, but controlled.', question: null, mode: null, brief: { ...BRIEF, feel: 'chaotic, but still sophisticated' } }]);
  ok('“make it”: said, with the brief to make it from', make.status === 200 && make.json.decision.action === 'make' && make.json.decision.brief.feel === 'chaotic, but still sophisticated', J(make.json));
  const pic = 'data:image/jpeg;base64,' + Buffer.from('not really a jpeg but shaped like one').toString('base64');
  const withPic = await post('studio-questions', { projectId: 'uxv0_studio', context: { ...context, pictures: ['moodboard.jpg'] }, images: [pic, pic, pic, 'https://example.com/x.jpg'] }, Q, [ASK]);
  const parts = J(withPic.calls[0]?.input ?? '');
  ok('the person’s pictures go to the model to be looked at (at most two, data addresses only)', withPic.status === 200 && (parts.match(/data:image\/jpeg;base64/g) ?? []).length === 2 && !/example\.com\/x\.jpg/.test(parts), parts.slice(0, 300));
  const prose = await post('studio-questions', { projectId: 'uxv0_studio', context }, Q, ['I would ask about the mood.']);
  ok('an answer that is not a decision: refused, nothing made up', prose.status !== 200 && !prose.json?.decision, J(prose));
  const broken = await post('studio-questions', { projectId: 'uxv0_studio', context }, Q, [new Error('upstream down')]);
  ok('a model failure is a calm error the browser falls back from', broken.status >= 500 && !!broken.json?.error && !/without a model/i.test(broken.json.error), J(broken));
  const logged = db.rows('ux_v0_calls').filter((x) => x.user_id === Q);
  ok('each turn is in the call log on its own stage, priced', logged.length >= 5 && logged.every((x) => x.stage === 'studio-questions' && typeof x.cost_usd === 'number'), J(logged.map((x) => [x.stage, x.cost_usd])));
  if (was.routing === undefined) delete process.env.SOCRIAUX_ROUTING;
  else process.env.SOCRIAUX_ROUTING = was.routing;
  if (was.model === undefined) delete process.env.SOCRIAUX_MODEL;
  else process.env.SOCRIAUX_MODEL = was.model;
}

console.log('\n=== Claude Sonnet 5.5 by default; the questions on GPT-6 Luna ===');
{
  delete process.env.SOCRIAUX_ROUTING;
  delete process.env.SOCRIAUX_MODEL;
  delete process.env.SOCRIAUX_ECONOMY_MODEL;
  delete process.env.SOCRIAUX_PREMIUM_MODEL;
  process.env.ANTHROPIC_API_KEY = 'test-anthropic';
  const U = 'user_v0_claude';
  const P = 'uxv0_claude';
  const brief = { objective: 'Fill weekday mornings at a coffee bar.', audience: 'Commuters', personality: ['warm', 'honest'], visualDirection: 'Handmade, morning light', palette: [{ hex: '#f6f1e9', role: 'background' }, { hex: '#2a2420', role: 'text' }, { hex: '#6b3e1f', role: 'accent' }], typography: { display: 'Fraunces', body: 'Inter' }, references: [], requirements: [], constraints: [], openQuestions: [] };
  const spec = { title: 'Halcyon', pageType: 'website', sections: [{ id: 'nav', kind: 'nav', content: { brand: 'Halcyon', links: ['Menu'] } }, { id: 'hero', kind: 'hero', content: { title: 'Coffee, slowly', primary: 'Book' } }, { id: 'f', kind: 'footer', content: { brand: 'Halcyon' } }] };
  const onClaude = (out, effort) => out.calls[0]?.provider === 'anthropic' && out.calls[0]?.model === 'claude-sonnet-5-5' && out.calls[0]?.output_config?.effort === effort && !('temperature' in out.calls[0]);
  const q = await post('discover', { projectId: P, action: 'turn', intent: 'A coffee shop website', questions: [], understanding: {}, moodboard: {} }, U, [{ understanding: { summary: 's', known: {}, gaps: [] }, questions: [], ready: true }]);
  ok('the questions: GPT-6 Luna, Chat Completions', q.status === 200 && q.calls[0]?.model === 'gpt-6-luna' && Array.isArray(q.calls[0]?.messages), J(q.calls[0]?.model));
  const d = await post('direct', { projectId: P, brief, notes: '', avoid: '' }, U, [{ directions: [] }]);
  ok('art direction: Claude Sonnet 5.5 at medium effort, through Anthropic\'s client with its own key', d.status === 200 && onClaude(d, 'medium') && globalThis.__claudeKey === 'test-anthropic', J(d.calls[0]));
  const g = await post('generate', { projectId: P, brief, moodboard: {}, version: 1 }, U, [spec]);
  ok('generation: Claude at medium, its usage priced and said with its stage and tier', g.status === 200 && onClaude(g, 'medium') && g.json.usage?.model === 'claude-sonnet-5-5' && g.json.usage.tier === 'premium' && typeof g.json.usage.cost === 'number', J(g.json?.usage ?? g.json));
  const logged = db.rows('ux_v0_calls').filter((r) => r.user_id === U);
  ok('each call is in the call log with its provider\'s model and a measured cost', logged.length === 3 && J(logged.map((r) => r.model)) === J(['gpt-6-luna', 'claude-sonnet-5-5', 'claude-sonnet-5-5']) && logged.every((r) => typeof r.cost_usd === 'number'), J(logged.map((r) => [r.stage, r.model, r.cost_usd])));
  delete process.env.ANTHROPIC_API_KEY;
  const none = await post('direct', { projectId: P, brief, notes: '', avoid: '' }, U, [{ directions: [] }]);
  ok('no Anthropic key: a Claude step says it is not configured, and no model is asked', none.status === 500 && /not configured/.test(none.json?.error ?? '') && none.calls.length === 0, J(none));
  const stillQ = await post('discover', { projectId: P, action: 'turn', intent: 'A coffee shop website', questions: [], understanding: {}, moodboard: {} }, U, [{ understanding: { summary: 's', known: {}, gaps: [] }, questions: [], ready: true }]);
  ok('…while the questions, on Luna, still work', stillQ.status === 200 && stillQ.calls[0]?.model === 'gpt-6-luna');
}

console.log('\n=== the designer: a design written as HTML, streamed ===');
{
  delete process.env.SOCRIAUX_ROUTING;
  delete process.env.SOCRIAUX_MODEL;
  delete process.env.SOCRIAUX_ECONOMY_MODEL;
  delete process.env.SOCRIAUX_PREMIUM_MODEL;
  process.env.ANTHROPIC_API_KEY = 'test-anthropic';
  const U = 'user_v0_design';
  const P = 'uxv0_design';
  const ANSWER = '<say>A section cut open.</say><artboard id="new-1" name="Poster" format="a3"><style>h1{font-size:160px}</style><h1>Rooms for Living</h1></artboard>';
  const doc = { artboards: [{ id: 'ab1', name: 'Poster', format: 'a3', width: 1123, height: 1587, medium: 'print', html: '<h1 data-sx="e1">Rooms for Living</h1>', x: 0, y: 0 }], tokens: ':root{--ink:#111}' };
  ok('signed out: refused, nothing asked', (await post('design', { words: 'a poster' }, null, [ANSWER])).status === 401);
  ok('no words: no call', (await post('design', { doc }, U, [ANSWER])).status === 400);
  const w = await post('design', { projectId: P, words: 'Make the headline smaller', doc, kind: 'poster', format: 'a3', memory: { brief: 'A lecture poster for Northlight', decisions: ['keep the serif'], rejected: [] }, selection: { artboard: 'ab1', element: 'e1', label: 'h1' }, turns: [], comments: [] }, U, [ANSWER]);
  const call = w.calls[0];
  const sys = J(call?.system ?? '');
  const user = J(call?.messages ?? '');
  ok('the answer is the text as written (no JSON asked for, none read)', w.status === 200 && w.json.text === ANSWER && !/Answer with the one JSON object/.test(user), J(w.json).slice(0, 300));
  ok('Claude, with room for a whole design; an exact change on the economy tier', call?.provider === 'anthropic' && call.model === 'claude-sonnet-5-5' && call.max_tokens >= 16000 && w.json.tier === 'economy' && call.output_config?.effort === 'low', J({ m: call?.model, t: call?.max_tokens, tier: w.json.tier, e: call?.output_config }));
  const big = await post('design', { projectId: P, words: 'Make it feel more cinematic', doc }, U, [ANSWER]);
  ok('…a change of feel on the premium tier', big.json.tier === 'premium' && big.calls[0]?.output_config?.effort === 'medium', J(big.calls[0]?.output_config));
  ok('the instructions: the tags, the formats, no house style (cached as one block)', /<artboard/.test(sys) && /a3: A3 poster/.test(sys) && /no house style/i.test(sys) && /ephemeral/.test(sys));
  ok('the message: the words, the selection, the project, the artboard in full with its ids', /Make the headline smaller/.test(user) && /data-sx=\\"e1\\"/.test(user) && /Northlight/.test(user) && /keep the serif/.test(user), user.slice(0, 600));
  const png = `data:image/jpeg;base64,${'A'.repeat(400)}`;
  ok('a look needs the artboards and their pictures', (await post('design', { projectId: P, mode: 'look', words: 'x', doc, artboards: ['ab1'] }, U, ['<ok/>'])).status === 400);
  const lk = await post('design', { projectId: P, mode: 'look', words: 'a poster', made: 'made one artboard', doc, artboards: ['ab1'], pictures: [png], measured: { ab1: ['words cut off in e1'] } }, U, ['<say>Fine.</say><ok/>']);
  ok('a look: the economy tier, the picture attached, what was measured said', lk.status === 200 && lk.json.text.includes('<ok/>') && /"type":"image"/.test(J(lk.calls[0]?.messages)) && /words cut off in e1/.test(J(lk.calls[0]?.messages)) && lk.calls[0]?.output_config?.effort === 'low', J(lk.calls[0]?.output_config));
  // streamed: the text reaches the browser as it is written
  globalThis.__uid = U;
  globalThis.__logosScript = [ANSWER];
  globalThis.__logosCalls = [];
  const res = await R.design.POST(new NextRequest('http://localhost/api/ux-v0/design', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson, application/json' }, body: J({ projectId: P, words: 'a poster', doc: { artboards: [], tokens: '' } }) }));
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  const text = lines.filter((l) => l.type === 'text').map((l) => l.delta).join('');
  const result = lines.find((l) => l.type === 'result');
  ok('streamed: the answer arrives as text events, then the whole answer', text === ANSWER && result?.status === 200 && result.body.text === ANSWER, J(lines.map((l) => l.type)));
  const logged = db.rows('ux_v0_calls').filter((r) => r.user_id === U);
  ok('each call is logged on its stage, priced', logged.some((r) => r.stage === 'design-write') && logged.some((r) => r.stage === 'design-look') && logged.every((r) => typeof r.cost_usd === 'number'), J(logged.map((r) => r.stage)));
  delete process.env.ANTHROPIC_API_KEY;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
