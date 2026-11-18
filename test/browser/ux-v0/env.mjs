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
