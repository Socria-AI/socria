// test/browser/ux-v0/design-harness/build.mjs — the workspace bundled for a browser page, and the page that runs it.
import { build } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export async function buildHarness(root, out) {
  await build({ entryPoints: [join(root, 'test/browser/ux-v0/design-harness/entry.tsx')], bundle: true, format: 'esm', platform: 'browser', outdir: out, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.png': 'dataurl' }, logLevel: 'error' });
}

/** A page for the harness: its config, and (deterministic) a seeded Math.random and a clock that only moves on. */
export const harnessHtml = (cfg, deterministic = false) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/entry.css">${
    deterministic
      ? `<script>(function(){var s=20251123;Math.random=function(){s=(s*1664525+1013904223)>>>0;return s/4294967296};var t=1800000000000;Date.now=function(){return t+=1};})();</script>`
      : ''
  }<script>window.__HARNESS__=${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`;

/** Serve the harness on a made-up origin; `design` answers the design route. */
export async function serveHarness(ctx, { root, bundle, origin, cfg, design }) {
  await ctx.route(`${origin}/**`, async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: harnessHtml(cfg(), true) });
    if (u.pathname === '/entry.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(`${bundle}entry.js`) });
    if (u.pathname === '/entry.css') return route.fulfill({ status: 200, contentType: 'text/css', body: existsSync(`${bundle}entry.css`) ? readFileSync(`${bundle}entry.css`) : '' });
    if (u.pathname === '/socria-mark.png') return route.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(join(root, 'public/socria-mark.png')) });
    if (u.pathname === '/api/ux-v0/design') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      const text = await design(body);
      if (text == null) return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'result', status: 503, body: { error: 'Waiting for an answer.' } })}\n` });
      const lines = [{ type: 'accepted', op: 'x' }, ...(text.match(/[\s\S]{1,200}/g) ?? []).map((d) => ({ type: 'text', delta: d })), { type: 'result', status: 200, body: { text, model: 'answered', usage: { input: 0, output: 0, cost: 0 } } }];
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
    }
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 404, body: '' });
  });
}
