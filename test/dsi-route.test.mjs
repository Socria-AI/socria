// SOCRIAUX DESIGN SYSTEM INTELLIGENCE — ITS ROUTES, THROUGH THEIR REAL HANDLERS (Clerk, Supabase and the network faked).
//
// Held down: nobody signed out reaches the network or the account copy; a design system is stored normalised, owned by
// the account that sent it, newest copy winning, and never visible to another account; a website is read only through
// the address guard; Figma is read only with a token, the token never echoed, and a missing token answered with how to
// provide one; GitHub hands back its files for the import; no model is ever asked.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-dsi');
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
const ROUTES = { systems: 'systems', site: 'design-system/site', figma: 'design-system/figma', github: 'design-system' };
await Promise.all(Object.entries(ROUTES).map(([k, r]) => build({ entryPoints: [join(root, `app/api/ux-v0/${r}/route.ts`)], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, `${k}.mjs`), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], external: ['next', 'next/*', 'undici', '@supabase/*', 'unpdf'], logLevel: 'error' })));

console.warn = () => {};
console.error = () => {};
process.env.RATE_LIMIT_DISABLED = '1';
delete process.env.FIGMA_TOKEN;
const A = 'user_dsi_a';
const B = 'user_dsi_b';
globalThis.__users = { [A]: { firstName: 'Ada', emails: ['a@example.com'] }, [B]: { firstName: 'Bo', emails: ['b@example.com'] } };
const R = Object.fromEntries(await Promise.all(Object.keys(ROUTES).map(async (k) => [k, await import(pathToFileURL(join(OUT, `${k}.mjs`)).href)])));
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');
const D = await import(pathToFileURL(join(here, '.tmp', 'dsi-under-test.mjs')).href);

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 600))));
const J = JSON.stringify;
async function call(key, body, uid, method = 'POST', query = '') {
  globalThis.__uid = uid;
  globalThis.__logosCalls = [];
  const init = method === 'GET' || method === 'DELETE' ? { method } : { method, headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : J(body) };
  const r = await R[key][method](new NextRequest(`http://localhost/api/ux-v0/${ROUTES[key]}${query}`, init));
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* not json */
  }
  return { status: r.status, json, text: J(json), calls: globalThis.__logosCalls ?? [] };
}

console.log('\n=== the account copy of design systems ===');
{
  const content = D.importJson([{ name: 't.json', text: J({ color: { $type: 'color', primary: { $value: '#0f62fe' }, bg: { $value: '#ffffff' }, text: { $value: '#161616' } } }) }]).content;
  let rec = D.newRecord(content, { now: 1000 });
  rec = D.publish(rec, { now: 2000, confirm: true }).record;
  ok('signed out: refused', (await call('systems', null, null, 'GET')).status === 401 && (await call('systems', { system: rec }, null, 'PUT')).status === 401);
  const put = await call('systems', { system: rec }, A, 'PUT');
  ok('stored, normalised, owned by the account that sent it', put.status === 200 && db.rows('ux_v0_systems').some((r) => r.id === rec.id && r.user_id === A && r.doc.owner === A && r.doc.versions.length === 1));
  ok('the owner lists it; nobody else does', (await call('systems', null, A, 'GET')).json.systems.some((x) => x.id === rec.id) && !(await call('systems', null, B, 'GET')).json.systems.some((x) => x.id === rec.id));
  ok('nobody else can read it', (await call('systems', null, B, 'GET', `?id=${rec.id}`)).status === 404);
  const got = await call('systems', null, A, 'GET', `?id=${rec.id}`);
  ok('the owner reads it back, as stored', got.status === 200 && got.json.system.id === rec.id && got.json.system.published === 1);
  const older = await call('systems', { system: { ...rec, updatedAt: 1 } }, A, 'PUT');
  ok('an older copy never writes over a newer one', older.status === 409 && older.json.stale === true);
  const claimed = await call('systems', { system: { ...rec, owner: B, updatedAt: 5000 } }, A, 'PUT');
  ok('a record claiming another owner is refused', claimed.status === 403);
  const byB = await call('systems', { system: { ...rec, updatedAt: 6000 } }, B, 'PUT');
  ok('another account writing the same id keeps its own row (never the owner’s)', byB.status === 200 && db.rows('ux_v0_systems').filter((r) => r.id === rec.id).length === 2 && db.rows('ux_v0_systems').find((r) => r.id === rec.id && r.user_id === A).updated_at !== 6000);
  ok('a malformed record is refused', (await call('systems', { system: { id: 'nope' } }, A, 'PUT')).status === 400);
  ok('too large: refused, kept in the browser', (await call('systems', 'x'.repeat(4_000_100), A, 'PUT')).status === 413);
  ok('deleted only for its owner', (await call('systems', null, A, 'DELETE', `?id=${rec.id}`)).status === 200 && !db.rows('ux_v0_systems').some((r) => r.id === rec.id && r.user_id === A) && db.rows('ux_v0_systems').some((r) => r.id === rec.id && r.user_id === B));
  ok('no model is ever asked', put.calls.length === 0);
}

console.log('\n=== website extraction ===');
{
  ok('signed out: refused before any network', (await call('site', { url: 'https://example.com' }, null)).status === 401);
  const bad = await call('site', { url: 'http://169.254.169.254/latest/meta-data' }, A);
  ok('a private address is refused before any network', bad.status === 400 && /private or reserved/.test(bad.json.error));
  const local = await call('site', { url: 'http://localhost:3000' }, A);
  ok('localhost is refused', local.status === 400);
  const creds = await call('site', { url: 'https://user:pass@example.com' }, A);
  ok('credentials in the address are refused', creds.status === 400);
}

console.log('\n=== Figma ===');
{
  const F = await import(pathToFileURL(join(here, 'fixtures', 'dsi', 'figma.mjs')).href);
  ok('signed out: refused', (await call('figma', { file: F.FILE_KEY }, null)).status === 401);
  ok('not a Figma link: refused, saying what to give', (await call('figma', { file: 'https://evil.example/x' }, A)).status === 400);
  const noToken = await call('figma', { file: `https://www.figma.com/design/${F.FILE_KEY}/Aster` }, A);
  ok('no token: answered with how to provide one, nothing fabricated', noToken.status === 400 && /personal access token/.test(noToken.json.setup) && !noToken.json.result);
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push({ url: String(url), token: init?.headers?.['X-Figma-Token'] });
    const u = String(url);
    if (u.includes('/variables/local')) return new Response(J(F.variables), { status: 200 });
    if (u.includes('/nodes?')) return new Response(J(F.nodes), { status: 200 });
    if (u.includes('/v1/images/')) return new Response(J(F.images), { status: 200 });
    if (u.startsWith('https://figma-alpha-api.s3')) return new Response(F.logoSvg, { status: 200 });
    if (u.includes('/v1/files/')) return new Response(J(F.file), { status: 200 });
    return new Response('', { status: 404 });
  };
  const TOKEN = 'figd_secret_test_token_1234567890';
  const got = await call('figma', { file: `https://www.figma.com/design/${F.FILE_KEY}/Aster`, token: TOKEN }, A);
  ok('a Figma file through the route: tokens, components and the logo', got.status === 200 && Object.keys(got.json.result.content.tokens).length >= 13 && got.json.result.content.components.length === 2 && got.json.result.content.assets.length === 1, got.text.slice(0, 300));
  ok('the token was sent to api.figma.com only, and never echoed back', asked.filter((a) => a.token).every((a) => a.url.startsWith('https://api.figma.com/')) && !got.text.includes(TOKEN));
  ok('every call is listed for the designer (endpoints only)', got.json.calls.length >= 4 && got.json.calls.every((c) => !c.endpoint.includes(TOKEN)));
  globalThis.fetch = async () => new Response('', { status: 403 });
  const refused = await call('figma', { file: F.FILE_KEY, token: TOKEN }, A);
  ok('a refused token: said plainly with how to fix it', refused.status === 403 && /refused the token/.test(refused.json.error) && refused.json.setup);
  globalThis.fetch = realFetch;
}

console.log('\n=== GitHub files for the import ===');
{
  const realFetch = globalThis.fetch;
  const css = ':root { --color-primary: #c2410c; --color-background: #fafaf9; --color-text: #1c1917; }';
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('https://api.github.com/repos/acme/ds/')) return new Response(J({ tree: [{ path: 'tokens.css', type: 'blob', size: css.length }] }), { status: 200 });
    if (u.endsWith('/tokens.css')) return new Response(css, { status: 200 });
    return new Response('', { status: 404 });
  };
  const raw = await call('github', { url: 'github.com/acme/ds', raw: true }, A);
  ok('raw: the repository’s files, unparsed, for the import to read', raw.status === 200 && raw.json.files.length === 1 && raw.json.files[0].text === css && raw.json.ref === 'acme/ds');
  const imported = D.importCss(raw.json.files.map((f) => ({ name: f.path, text: f.text })));
  ok('read by the canonical importer, references and provenance kept', imported.content.tokens['color.primary'].value === '#c2410c' && imported.content.tokens['color.primary'].provenance.source.kind === 'css');
  globalThis.fetch = realFetch;
}

console.log(`\ndsi-route: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
