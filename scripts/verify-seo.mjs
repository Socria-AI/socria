// scripts/verify-seo.mjs
//
// READ THE SITE THE WAY A SEARCH ENGINE DOES, AND SAY WHAT IS WRONG WITH IT.
//
// test/seo.test.mjs checks the lists and the metadata objects (lib/seo.ts). This checks what a running server
// actually sends, page by page: the status, the <head> as it arrives in the HTML (before any JavaScript runs), the
// headings and links once the page is drawn, the structured data, robots.txt and the sitemap, and the private routes'
// noindex. Run it against a production build (`next build && next start`) or a deployment:
//
//   node scripts/verify-seo.mjs [--url http://localhost:3000] [--site https://socria.app] [--axe] [--json out.json]
//
// --site is the address the pages are expected to name as canonical (NEXT_PUBLIC_SITE_URL). --axe also runs the
// accessibility rules that bear on search (alt text, link names, headings, lang, title). Exits non-zero on any failure.

import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);
const BASE = arg('url', 'http://localhost:3000').replace(/\/+$/, '');
const SITE = arg('site', 'https://socria.app').replace(/\/+$/, '');
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

// Routes that must never be indexed, whatever robots.txt says (they are protected by sign-in or are a person's own).
const PRIVATE = ['/chat', '/account', '/memory', '/onboarding', '/sso-callback', '/s/abc123', '/dev/dashboard', '/logos-5-internal', '/studio'];
// What a page's description and title should stay within to show whole in a result.
const TITLE_MAX = 65;
const DESC_MIN = 70;
const DESC_MAX = 165;

const problems = [];
const report = [];
const fail = (where, what) => problems.push(`${where}: ${what}`);

/** The <head> facts from raw HTML, as a crawler reads them before rendering. */
function headOf(html) {
  const head = (html.match(/<head[^>]*>([\s\S]*?)<\/head>/i) ?? [, ''])[1];
  const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i')) ?? [, null])[1];
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (key, val) => {
    const t = metas.find((m) => (attr(m, key) ?? '').toLowerCase() === val);
    return t ? decode(attr(t, 'content') ?? '') : null;
  };
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const canonical = links.find((l) => (attr(l, 'rel') ?? '').toLowerCase() === 'canonical');
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  return {
    title: decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [, ''])[1].trim()),
    description: meta('name', 'description'),
    robots: meta('name', 'robots'),
    canonical: canonical ? attr(canonical, 'href') : null,
    ogTitle: meta('property', 'og:title'),
    ogDescription: meta('property', 'og:description'),
    ogImage: meta('property', 'og:image'),
    ogUrl: meta('property', 'og:url'),
    twitterCard: meta('name', 'twitter:card'),
    lang: (html.match(/<html[^>]*\slang="([^"]*)"/i) ?? [, null])[1],
    ld,
  };
}
function decode(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
}

async function get(path, opts = {}) {
  const r = await fetch(BASE + path, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; SocriaSEOCheck/1.0)' }, ...opts });
  return { status: r.status, headers: r.headers, text: r.status < 300 ? await r.text() : '', location: r.headers.get('location') };
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// A LOCAL SERVER, read through this process. A sandboxed browser may have no direct route to loopback (its network is a
// proxy for the outside world), so the page's own requests to BASE are fetched here and handed back; requests to other
// origins (a sign-in script's CDN) are dropped — they change nothing in the HTML this reads. And with Clerk's development
// keys, any browser-like request is sent through a sign-in handshake on Clerk's domain until a dev-browser cookie exists
// (production keys do not do that to a visitor with no session, a crawler included), so the forwarded requests are plain.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE);
if (LOCAL) {
  await context.route('**/*', async (route) => {
    const req = route.request();
    if (new URL(req.url()).origin !== new URL(BASE).origin) return route.abort();
    const h = req.headers();
    for (const k of Object.keys(h)) if (k === 'host' || k === 'connection' || k === 'user-agent' || k.startsWith('sec-fetch')) delete h[k];
    h.accept = '*/*';
    try {
      const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() ?? undefined, redirect: 'manual' });
      const headers = Object.fromEntries(r.headers.entries());
      for (const k of ['content-encoding', 'content-length', 'transfer-encoding']) delete headers[k];
      await route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
    } catch {
      await route.abort();
    }
  });
}
const page = await context.newPage();
const axeSource = has('axe') ? readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8') : null;

// ── robots.txt and the sitemap ──
const robots = await get('/robots.txt');
if (robots.status !== 200) fail('/robots.txt', `status ${robots.status}`);
const robotsTxt = robots.text;
const disallowed = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]);
if (!/Sitemap:\s*\S+\/sitemap\.xml/i.test(robotsTxt)) fail('/robots.txt', 'no Sitemap line');
const sm = await get('/sitemap.xml');
if (sm.status !== 200) fail('/sitemap.xml', `status ${sm.status}`);
const urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
if (!urls.length) fail('/sitemap.xml', 'no URLs');
if (new Set(urls).size !== urls.length) fail('/sitemap.xml', 'duplicate URLs');

const seenTitles = new Map();
const seenDescriptions = new Map();
const internal = new Set();

for (const u of urls) {
  if (!u.startsWith(SITE)) {
    fail(u, `sitemap URL not on ${SITE}`);
    continue;
  }
  const path = u.slice(SITE.length) || '/';
  if (disallowed.some((d) => d !== '/' && path.startsWith(d))) fail(path, 'listed in the sitemap but disallowed in robots.txt');
  const r = await get(path);
  const row = { path, status: r.status };
  report.push(row);
  if (r.status !== 200) {
    fail(path, `status ${r.status}${r.location ? ` → ${r.location}` : ''} (a sitemap lists only pages that answer 200)`);
    continue;
  }
  const h = headOf(r.text);
  Object.assign(row, { title: h.title, description: h.description, canonical: h.canonical });
  // the head, as sent
  if (!h.title) fail(path, 'no <title>');
  else if (h.title.length > TITLE_MAX) fail(path, `title is ${h.title.length} characters (> ${TITLE_MAX}): ${h.title}`);
  if (!h.description) fail(path, 'no meta description');
  else if (h.description.length < DESC_MIN || h.description.length > DESC_MAX) fail(path, `description is ${h.description.length} characters (${DESC_MIN}–${DESC_MAX})`);
  const same = (a, b) => a === b || (path === '/' && [a, b].every((x) => x === SITE || x === `${SITE}/`));
  if (!same(h.canonical, u)) fail(path, `canonical is ${h.canonical}, not ${u}`);
  if (h.robots && /noindex/i.test(h.robots)) fail(path, `in the sitemap but noindex (${h.robots})`);
  if (r.headers.get('x-robots-tag') && /noindex/i.test(r.headers.get('x-robots-tag'))) fail(path, 'in the sitemap but X-Robots-Tag noindex');
  if (!h.ogTitle || !h.ogDescription || !h.ogImage) fail(path, 'Open Graph title, description or image missing');
  if (h.ogUrl && !same(h.ogUrl, u)) fail(path, `og:url is ${h.ogUrl}`);
  if (h.twitterCard !== 'summary_large_image') fail(path, `twitter:card is ${h.twitterCard}`);
  if (h.lang !== 'en') fail(path, `<html lang> is ${h.lang}`);
  if (h.title) {
    if (seenTitles.has(h.title)) fail(path, `same title as ${seenTitles.get(h.title)}`);
    seenTitles.set(h.title, path);
  }
  if (h.description) {
    if (seenDescriptions.has(h.description)) fail(path, `same description as ${seenDescriptions.get(h.description)}`);
    seenDescriptions.set(h.description, path);
  }
  // structured data: parses, has a context and a type
  for (const block of h.ld) {
    try {
      const d = JSON.parse(block);
      for (const x of Array.isArray(d) ? d : [d]) {
        if (x['@context'] !== 'https://schema.org' || !x['@type']) fail(path, `JSON-LD without @context/@type: ${block.slice(0, 80)}`);
      }
    } catch {
      fail(path, `JSON-LD does not parse: ${block.slice(0, 80)}`);
    }
  }
  row.ld = h.ld.flatMap((b) => {
    try {
      const d = JSON.parse(b);
      return (Array.isArray(d) ? d : [d]).map((x) => x['@type']);
    } catch {
      return ['(invalid)'];
    }
  });
  // the page, drawn: one h1, no skipped heading levels, images with alt, links with names
  // 'load', not 'networkidle': a page whose sign-in script keeps retrying (a test key, a sandbox) never goes idle
  const went = await page.goto(BASE + path, { waitUntil: 'load', timeout: 45000 }).then(() => true, (e) => (fail(path, `could not be opened in a browser: ${String(e.message).split('\n')[0]}`), false));
  if (!went) continue;
  await page.waitForTimeout(600);
  // a page that moves itself on (a client redirect) is read where it lands, and said
  const landed = new URL(page.url());
  if (landed.pathname !== new URL(BASE + path).pathname) fail(path, `the page moves itself on to ${landed.pathname} once drawn`);
  const read = () => page.evaluate(() => {
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => h.offsetParent !== null || h.getClientRects().length);
    const levels = hs.map((h) => Number(h.tagName[1]));
    const skips = levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1).length;
    // not the site's own: what is hidden from everyone, and Clerk's development-mode badge (test keys only)
    const imgs = [...document.querySelectorAll('img')].filter((i) => !i.closest('[aria-hidden="true"]') && !i.closest('[class*="cl-"], [id^="clerk"], [data-clerk-component]'));
    return {
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
      levels,
      skips,
      noAlt: imgs.filter((i) => !i.hasAttribute('alt')).map((i) => i.getAttribute('src')),
      links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
      emptyLinks: [...document.querySelectorAll('a[href]')].filter((a) => !(a.textContent.trim() || a.getAttribute('aria-label') || a.querySelector('img[alt]:not([alt=""])'))).length,
    };
  });
  let drawn;
  try {
    drawn = await read();
  } catch {
    await page.waitForLoadState('load').catch(() => {});
    drawn = await read().catch(() => null);
  }
  if (!drawn) {
    fail(path, 'could not be read once drawn');
    continue;
  }
  Object.assign(row, { h1: drawn.h1, headingLevels: drawn.levels.join('') });
  if (drawn.h1.length !== 1) fail(path, `${drawn.h1.length} h1 elements (${drawn.h1.join(' | ')})`);
  if (drawn.skips) fail(path, `heading levels skip ${drawn.skips}× (${drawn.levels.join('')})`);
  if (drawn.noAlt.length) fail(path, `${drawn.noAlt.length} image(s) without alt: ${drawn.noAlt.slice(0, 3).join(', ')}`);
  if (drawn.emptyLinks) fail(path, `${drawn.emptyLinks} link(s) with no name`);
  for (const l of drawn.links) if (l.startsWith('/') && !l.startsWith('//')) internal.add(l.split('#')[0].split('?')[0] || '/');
  if (axeSource) {
    await page.addScriptTag({ content: axeSource });
    const ax = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { runOnly: ['image-alt', 'link-name', 'document-title', 'html-has-lang', 'heading-order', 'page-has-heading-one', 'meta-viewport', 'list', 'listitem'] });
      return r.violations.map((v) => `${v.id} (${v.nodes.length})`);
    });
    if (ax.length) fail(path, `axe: ${ax.join(', ')}`);
  }
}

// ── internal links: every one lands (a redirect to a page that lands is fine; a 404 is not) ──
for (const l of [...internal].sort()) {
  let r = await get(l);
  let hops = 0;
  while (r.status >= 300 && r.status < 400 && r.location && hops++ < 4) {
    const next = new URL(r.location, BASE + l);
    if (next.origin !== new URL(BASE).origin) break;
    r = await get(next.pathname + next.search);
  }
  if (r.status >= 400) fail(l, `internal link answers ${r.status}`);
}

// ── the private routes: never indexable ──
for (const p of PRIVATE) {
  const r = await get(p);
  const h = r.text ? headOf(r.text) : null;
  const tag = r.headers.get('x-robots-tag') ?? '';
  const meta = h?.robots ?? '';
  const ok = /noindex/i.test(tag) || /noindex/i.test(meta) || (r.status >= 300 && r.status < 400) || r.status === 401 || r.status === 403 || r.status === 404;
  report.push({ path: p, status: r.status, xRobotsTag: tag || null, robots: meta || null });
  if (!ok) fail(p, `private route is indexable (status ${r.status}, no noindex header or meta)`);
}

// ── a page that does not exist ──
const missing = await get('/this-page-does-not-exist-' + Date.now().toString(36));
if (missing.status !== 404) fail('/<missing>', `answers ${missing.status}, not 404`);

await browser.close();

console.log(`\n${report.filter((r) => r.title).length} indexable pages read, ${internal.size} internal links followed, ${PRIVATE.length} private routes checked.`);
for (const r of report) console.log(`  ${String(r.status).padEnd(4)} ${r.path.padEnd(34)} ${r.title ? `${r.title.length}c ${r.title}` : `${r.xRobotsTag ?? ''} ${r.robots ?? ''}`}`);
if (arg('json', null)) writeFileSync(arg('json'), JSON.stringify({ report, problems }, null, 2));
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log('\nNo problems found.');
