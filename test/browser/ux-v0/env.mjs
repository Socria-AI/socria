// test/browser/ux-v0/env.mjs — where things are, for the SocriaUX v0 browser checks.
//
// UXV0_BASE           the running app (default http://localhost:3100; the v0 switch must be on)
// UXV0_OUT            where screenshots and captures go (default: a folder in the system temp dir)
// UXV0_FORWARD=1      the browser cannot reach the app itself (a container whose browser may only go out
//                     through a proxy that refuses loopback): every request to UXV0_BASE is answered by Node,
//                     which can. Use a production build (next start): a dev server's live-reload socket
//                     cannot be forwarded this way.
// PLAYWRIGHT_MODULE   a Playwright to load instead of the one Node's require finds
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..', '..') + '/';
export const FX = join(here, 'fx') + '/';
export const S = (process.env.UXV0_OUT || join(tmpdir(), 'ux-v0-browser')) + '/';
mkdirSync(S, { recursive: true });
export const BASE = (process.env.UXV0_BASE || 'http://localhost:3100').replace(/\/$/, '');
const pw = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : createRequire(import.meta.url)('playwright');

/** Every request to the app, answered by Node fetching it (headers, body and status as the app gave them). */
async function forwardApp(ctx) {
  const origin = new URL(BASE).origin;
  await ctx.route((url) => url.origin === origin, async (route) => {
    const req = route.request();
    try {
      const headers = { ...req.headers() };
      delete headers.host;
      const res = await fetch(req.url(), { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() ?? undefined, redirect: 'manual' });
      const out = {};
      res.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v;
      });
      await route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) {
      await route.abort('connectionrefused');
    }
  });
}

export const chromium = process.env.UXV0_FORWARD
  ? {
      ...pw.chromium,
      launch: async (opts) => {
        const browser = await pw.chromium.launch(opts);
        const newContext = browser.newContext.bind(browser);
        browser.newContext = async (o) => {
          const ctx = await newContext(o);
          await forwardApp(ctx);
          return ctx;
        };
        browser.newPage = async (o) => (await browser.newContext(o)).newPage();
        return browser;
      },
    }
  : pw.chromium;

/** the modules under test, as `node test/run.mjs` builds them (test/.tmp) */
export const underTest = () => import(pathToFileURL(join(ROOT, 'test/.tmp/ux-v0-under-test.mjs')).href);

// ── ways in that the checks share ──

const COMPOSER = 'textarea[aria-label="What do you want to make?"]';

/** A project put in this browser's store as the app keeps it (the page must be on the app, so the store is its). */
export async function putProjectInBrowser(page, project) {
  if (!/\/ux-v0/.test(page.url())) await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
  await page.waitForSelector('.sd-home, .v0', { timeout: 15000 });
  await page.evaluate(
    (value) =>
      new Promise((res, rej) => {
        const req = indexedDB.open('socria-ux-v0');
        req.onsuccess = () => {
          const t = req.result.transaction('projects', 'readwrite');
          t.objectStore('projects').put(value);
          t.oncomplete = () => res(true);
          t.onerror = () => rej(t.error);
        };
        req.onerror = () => rej(req.error);
      }),
    project,
  );
}

/**
 * The home's one composer, with words and Begin: what a person does to start anything. Used for a design brought to
 * critique (attached first): the design is the request, so the critique opens at once.
 */
export async function beginWith(page, words = 'Critique this design') {
  await page.fill(COMPOSER, words);
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForTimeout(300);
}

/**
 * The website workspace's own way in — its questions, references, brief and directions with a model (each check fakes
 * the model's routes) — rather than the studio's conversation: an empty website project kept in this browser, opened
 * at its address, and the words said where the workspace asks for them.
 */
export async function websiteWorkspace(page, words) {
  const { makeProject } = await underTest();
  const p = makeProject('create', 'Untitled design');
  await putProjectInBrowser(page, p);
  await page.goto(`${BASE}/ux-v0?p=${encodeURIComponent(p.id)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.v0-intent textarea', { timeout: 15000 });
  await page.fill('.v0-intent textarea', words);
  await page.locator('.v0-intent').getByRole('button', { name: 'Begin' }).click();
  return p.id;
}

/**
 * A graphic or a board whose brief is written by hand in its workspace (the workspaces' own forms, which the checks of
 * the engines drive): a project of that kind kept in this browser with the words as its intent, opened at its address.
 */
export async function handBrief(page, medium, words) {
  const { makeProject } = await underTest();
  const base = makeProject('create', medium === 'board' ? 'Untitled board' : 'Untitled graphic');
  const p =
    medium === 'board'
      ? { ...base, intent: words, medium: 'board', board: { schema: 1, request: '', brief: null, system: null, options: [], materials: [], nodes: [], connectors: [], assets: [], background: { color: '#ecebe6', pattern: 'dots' }, annotations: true, arrangement: 'editorial', versions: [] } }
      : { ...base, intent: words, medium: 'graphic', graphic: { brief: null, options: [], direction: null, doc: null, versions: [] } };
  await putProjectInBrowser(page, p);
  await page.goto(`${BASE}/ux-v0?p=${encodeURIComponent(p.id)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector(medium === 'board' ? '.bd-brief' : '.gx-brief', { timeout: 15000 });
  return p.id;
}
