// How Socria introduces itself — to search engines, answer engines and link
// previews — and how a visit is traced to a sign-up.
//
// What this guards, in order of how badly it would go wrong:
//   - a page telling search engines it is a copy of another (the bug that
//     had every page pointing its canonical at the homepage);
//   - a private page — a share link, a person's own view — reaching results;
//   - the sitemap listing a redirect, a private path, or nothing at all;
//   - a preview card printing words the address carried, or an offer that
//     has ended;
//   - structured data that claims what is not true, or can break out of its
//     script element;
//   - a first-touch note kept where consent is needed, or carrying more than
//     the kind of page and the kind of site;
//   - the homepage losing its one heading, or the student page promising a
//     month after the close.

import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as SEO from './.tmp/seo.mjs';
import { DEFAULT_CARD, fit, ogCardFor } from './.tmp/og-cards.mjs';
import * as LD from './.tmp/structured-data.mjs';
import * as FT from './.tmp/first-touch.mjs';
import { scrub, EVENTS } from './.tmp/analytics.mjs';
import { attributionAllowed } from './.tmp/newsletter-consent.mjs';
import { STUDENT_OFFER } from './.tmp/socria-edu.mjs';
import { TOPICS } from './.tmp/support-faq.mjs';
import { DOC_PAGES } from './.tmp/registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const BEFORE = STUDENT_OFFER.closes - 86_400_000;
const AFTER = STUDENT_OFFER.closes + 1;
const SITE = SEO.SITE_URL;
const PRIVATE = /\/(api|chat|account|studio|memory|onboarding|s|sso-callback|logos2-test|model|mind-ar)(\/|$)/;

console.log('=== the line, and the homepage ===');
{
  ok('the line', SEO.TAGLINE === 'Think for Yourself');
  ok('the homepage title leads with it', SEO.HOME_TITLE.startsWith('Socria — Think for Yourself'));
  ok('…and fits a result (≤ 60)', SEO.HOME_TITLE.length <= 60, String(SEO.HOME_TITLE.length));
  ok('the description fits a result (≤ 160)', SEO.DEFAULT_DESCRIPTION.length <= 160, String(SEO.DEFAULT_DESCRIPTION.length));
  ok('…and says it is free, with no sign-up', /Free, no sign-up\./.test(SEO.DEFAULT_DESCRIPTION));
}

console.log('\n=== one page, one address ===');
{
  const m = SEO.pageMetadata({ path: '/one', title: 'Socria One — x', absolute: true, description: 'd' });
  ok('its own canonical', m.alternates?.canonical === '/one');
  ok('an absolute title is not suffixed', m.title?.absolute === 'Socria One — x');
  ok('the card is the page’s', m.openGraph?.images?.[0]?.url === '/og/one' && m.twitter?.images?.[0] === '/og/one');
  ok('the card is the right size', m.openGraph?.images?.[0]?.width === 1200 && m.openGraph?.images?.[0]?.height === 630);
  ok('previews carry the page’s own title', m.openGraph?.title === 'Socria One — x' && m.twitter?.title === 'Socria One — x');
  ok('summary_large_image', m.twitter?.card === 'summary_large_image');
  ok('no robots unless asked', !('robots' in m));

  const t = SEO.pageMetadata({ path: '/support', title: 'Support', description: 'd' });
  ok('a plain title leaves the suffix to the layout', t.title === 'Support');
  ok('…but the preview names Socria', t.openGraph?.title === 'Support — Socria');

  const n = SEO.pageMetadata({ path: '/students', title: 'x', description: 'd', noindex: true });
  ok('noindex when asked', n.robots?.index === false);
  ok('the private-page metadata is noindex, nofollow', SEO.NOINDEX.robots?.index === false && SEO.NOINDEX.robots?.follow === false);

  ok('the homepage card key', SEO.ogImagePath('/') === '/og/home' && SEO.ogImagePath('docs/models') === '/og/docs/models');
  ok('absolute addresses', SEO.absoluteUrl('/') === `${SITE}/` && SEO.absoluteUrl('/one') === `${SITE}/one`);
  ok('the overview IS /docs', SEO.docPath('overview') === '/docs' && SEO.docPath('models') === '/docs/models');
}

console.log('\n=== the root never names a canonical ===');
{
  for (const prod of [true, false]) {
    const r = SEO.rootMetadata(prod);
    ok(`no canonical (production=${prod})`, !r.alternates);
    ok(`the template (production=${prod})`, r.title?.template === '%s — Socria' && r.title?.default === SEO.HOME_TITLE);
    ok(`a default card (production=${prod})`, r.openGraph?.images?.[0]?.url === '/og/home');
  }
  ok('a preview is noindex', SEO.rootMetadata(false).robots?.index === false);
  ok('production carries no robots tag', !('robots' in SEO.rootMetadata(true)));
  const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');
  ok('app/layout.tsx sets no canonical', !/canonical\s*:/.test(layout) && /rootMetadata\(isProduction\(\)\)/.test(layout));
}

console.log('\n=== every public page names itself ===');
{
  const file = (p) => (p === '/' ? 'app/page.tsx' : ['/privacy', '/terms', '/security', '/subprocessors'].includes(p) ? `app/(legal)${p}/page.tsx` : `app${p}/page.tsx`);
  for (const p of SEO.PUBLIC_PAGES) {
    const f = join(root, file(p.path));
    ok(`${p.path} exists`, existsSync(f), f);
    if (!existsSync(f)) continue;
    const src = readFileSync(f, 'utf8');
    ok(`${p.path} uses pageMetadata with its own path`, src.includes('pageMetadata(') && src.includes(`path: '${p.path}'`));
    ok(`${p.path} has no doubled brand in its title`, !/title: '[^']*— Socria'/.test(src));
  }
  const docs = readFileSync(join(root, 'app/docs/[slug]/page.tsx'), 'utf8');
  ok('docs pages name themselves', docs.includes('pageMetadata(') && docs.includes('path: docPath(page.slug)'));
  const blog = readFileSync(join(root, 'app/blog/[slug]/page.tsx'), 'utf8');
  ok('blog posts name themselves', blog.includes('path: `/blog/${params.slug}`'));
  for (const f of ['app/s/[token]/page.tsx', 'app/s/i/[token]/page.tsx', 'app/memory/layout.tsx', 'app/sso-callback/layout.tsx']) {
    ok(`${f} is noindex`, /export const metadata: Metadata = NOINDEX;/.test(readFileSync(join(root, f), 'utf8')));
  }
  const robots = readFileSync(join(root, 'app/robots.ts'), 'utf8');
  ok('robots still closes the private paths', ["'/api/'", "'/chat'", "'/account'", "'/studio'"].every((x) => robots.includes(x)));
  ok('robots points at the sitemap', robots.includes('/sitemap.xml'));
}

console.log('\n=== the sitemap ===');
{
  const posts = [{ slug: 'clear-thinking', publishedAt: '2026-09-01T00:00:00Z' }, { slug: '../x' }, { slug: '' }, { slug: 'no-date' }];
  const s = SEO.sitemapEntries({ now: BEFORE, posts });
  const urls = s.map((e) => e.url);
  ok('the homepage', urls.includes(`${SITE}/`));
  ok('every public page', SEO.PUBLIC_PAGES.every((p) => urls.includes(SEO.absoluteUrl(p.path))));
  ok('every docs page but the overview', DOC_PAGES.filter((d) => d.slug !== 'overview').every((d) => urls.includes(`${SITE}/docs/${d.slug}`)));
  ok('never the redirect', !urls.includes(`${SITE}/docs/overview`));
  ok('a post, dated', s.some((e) => e.url === `${SITE}/blog/clear-thinking` && e.lastModified instanceof Date));
  ok('a post without a date is listed undated', s.some((e) => e.url === `${SITE}/blog/no-date` && !('lastModified' in e)));
  ok('a bad slug is not', !urls.some((u) => u.includes('/blog/../') || u.endsWith('/blog/')));
  ok('no private path', !urls.some((u) => PRIVATE.test(new URL(u).pathname)));
  ok('all on the site', urls.every((u) => u.startsWith(SITE)));
  ok('no duplicates', new Set(urls).size === urls.length);
  ok('the student page while the offer is open', urls.includes(`${SITE}/students`));
  ok('…and not after', !SEO.sitemapEntries({ now: AFTER }).some((e) => e.url.endsWith('/students')));
  // The Core 4 model page was taken out with the archived models.
  ok('the Core 4 model page is not a public page', !SEO.PUBLIC_PAGES.some((p) => p.path === '/core4model'));
  ok('…nor in the sitemap', !urls.some((u) => new URL(u).pathname.startsWith('/core4model')));
  ok('…nor on disk', !existsSync(join(root, 'app/core4model')));
  ok('no public page is named or summed up with Core', SEO.PUBLIC_PAGES.every((p) => !/\bCore\b/.test(`${p.name} ${p.summary}`)));
}

console.log('\n=== an old address still lands ===');
{
  // next.config.js is CommonJS, as Next reads it; its redirects() is what Next calls.
  const config = createRequire(import.meta.url)(join(root, 'next.config.js'));
  const moved = typeof config.redirects === 'function' ? await config.redirects() : [];
  const c4 = moved.find((r) => r.source === '/core4model');
  ok('/core4model goes to the Logos 5 docs page', c4?.destination === '/docs/logos-5', JSON.stringify(moved));
  ok('…permanently (308), so search moves the address on', c4?.permanent === true);
  ok('…and it lands on a page the docs have', DOC_PAGES.some((d) => SEO.docPath(d.slug) === c4?.destination));
}

console.log('\n=== llms.txt ===');
{
  const t = SEO.llmsTxt({ now: BEFORE });
  ok('a title and a summary', t.startsWith('# Socria\n') && t.includes('> Think for Yourself.'));
  ok('the try link', t.includes(`(${SITE}/chat)`));
  ok('every docs page, the overview at /docs', DOC_PAGES.every((d) => t.includes(`(${SEO.absoluteUrl(SEO.docPath(d.slug))})`)));
  ok('the price, from the one place it lives', t.includes('$15/month'));
  // removed: "says what needs an account" (Logos needed one, Core worked without) — Core was archived, Logos 5 is the one surface
  ok('says what a guest gets, and what an account adds', /Without an account you get one line of thinking and its map; sign up free to start another/.test(t));
  // the summary and the public pages are this file's words; the docs list is the docs registry's
  const own = t.slice(0, t.indexOf('## Docs')) + t.slice(t.indexOf('## More'));
  ok('names no Core in its own words', !/\bCore\b/.test(own), own.match(/.{0,60}\bCore\b.{0,60}/)?.[0]);
  ok('the student page while open', t.includes('/students'));
  ok('…not after', !SEO.llmsTxt({ now: AFTER }).includes('/students'));
  const paths = [...t.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => new URL(m[1]).pathname);
  ok('no private link but the chat', paths.every((p) => p === '/chat' || !PRIVATE.test(p)), paths.join(' '));
}

console.log('\n=== preview cards ===');
{
  const ctx = (o = {}) => ({ now: BEFORE, docs: DOC_PAGES, ...o });
  ok('the default card says the line', DEFAULT_CARD.title === 'Think for Yourself.');
  ok('home', ogCardFor(['home'], ctx()) === DEFAULT_CARD);
  ok('no key', ogCardFor([], ctx()) === DEFAULT_CARD);
  const d = ogCardFor(['docs', 'models'], ctx());
  ok('a docs page by its title', d.kicker === 'Socria Docs' && d.title === DOC_PAGES.find((x) => x.slug === 'models').title);
  ok('an unknown docs page gets the docs card', ogCardFor(['docs', 'nope'], ctx()).title === 'How the whole thing works.');
  const words = 'Socria endorses whatever this says';
  ok('the address is never printed', JSON.stringify(ogCardFor([words], ctx())) === JSON.stringify(DEFAULT_CARD));
  ok('…nor under a known prefix', !JSON.stringify(ogCardFor(['docs', words], ctx())).includes('endorses'));
  ok('…nor three deep', ogCardFor(['docs', 'models', 'x'], ctx()) === DEFAULT_CARD);
  ok('a post by the title Sanity holds', ogCardFor(['blog', 'p'], ctx({ post: { title: 'On steelmanning', excerpt: 'e' } })).title === 'On steelmanning');
  ok('a post Sanity does not have', ogCardFor(['blog', 'p'], ctx({ post: null })).title === 'Notes on thinking clearly.');
  const st = ogCardFor(['students'], ctx());
  ok('the student card while open', st.kicker === 'For UTA students' && /9 December/.test(st.line));
  ok('…the plain card after', ogCardFor(['students'], ctx({ now: AFTER })) === DEFAULT_CARD);
  const inv = ogCardFor(['invited'], ctx({ referral: { enabled: true, signupDays: 7 } }));
  ok('the invitation, in words', inv.title === 'Seven days of Socria One, free.');
  ok('…not while referrals are off', ogCardFor(['invited'], ctx({ referral: { enabled: false, signupDays: 7 } })).kicker === 'Socria');
  ok('the One card keeps to the /one page’s own claim', /No daily count/.test(ogCardFor(['one'], ctx()).line));
  ok('…in the words the /one page uses', /lines of thinking as you need them/.test(ogCardFor(['one'], ctx()).line) && /lines of thinking as you need them/.test(readFileSync(join(root, 'app/one/page.tsx'), 'utf8')));
  ok('fit keeps short text', fit('Short title', 20) === 'Short title');
  const f = fit('A rather long title that will not fit on the card at all', 30);
  ok('fit cuts at a word with an ellipsis', f.length <= 30 && f.endsWith('…') && !f.includes('  '), f);
  // every fixed card is worded to fit
  // removed: 'core4model' from this list — its page and its card were taken out with the archived models
  const FIXED_KEYS = ['home', 'logos', 'explore', 'one', 'docs', 'blog', 'support', 'surfaces', 'logos2', 'privacy', 'terms', 'security', 'subprocessors', 'sign-up', 'sign-in'];
  for (const k of FIXED_KEYS) {
    const c = ogCardFor([k], ctx());
    ok(`${k}: title and line fit`, c.title.length <= 70 && c.line.length <= 120 && c.kicker.length <= 30, `${c.title} / ${c.line}`);
  }
  ok('no fixed card says Core', FIXED_KEYS.every((k) => !/\bCore\b/.test(JSON.stringify(ogCardFor([k], ctx())))));
  ok('the Core 4 model card is gone: its key gets the plain card', ogCardFor(['core4model'], ctx()) === DEFAULT_CARD);
}

console.log('\n=== structured data ===');
{
  const org = LD.organizationLd();
  ok('organization', org['@type'] === 'Organization' && org.name === 'Socria' && org.slogan === 'Think for Yourself');
  ok('…with the profiles the site links to', org.sameAs.length === 2 && org.sameAs.every((u) => u.startsWith('https://')));
  const site = LD.websiteLd();
  ok('website, published by the organization', site['@type'] === 'WebSite' && site.publisher['@id'] === org['@id']);
  const app = LD.softwareApplicationLd();
  const one = app.offers.find((o) => o.name === 'Socria One');
  ok('the free plan at 0', app.offers.some((o) => o.name === 'Free' && o.price === '0'));
  ok('Socria One at its real price, monthly', one.price === '15' && one.priceCurrency === 'USD' && one.priceSpecification.unitCode === 'MON');
  ok('no ratings or reviews, anywhere', !/aggregateRating|"review"/i.test(JSON.stringify([org, site, app])));
  const bc = LD.breadcrumbLd([{ name: 'Socria', path: '/' }, { name: 'Docs', path: '/docs' }, { name: 'Models', path: '/docs/models' }]);
  ok('breadcrumbs in order', bc.itemListElement.map((i) => i.position).join() === '1,2,3' && bc.itemListElement[2].item === `${SITE}/docs/models`);
  const post = LD.blogPostingLd({ slug: 's', title: 'T', excerpt: 'E', publishedAt: '2026-09-01T00:00:00Z', authorName: 'A' });
  ok('a post, dated and authored', post.datePublished === '2026-09-01T00:00:00.000Z' && post.author.name === 'A');
  const undated = LD.blogPostingLd({ slug: 's', title: 'T', publishedAt: 'not a date' });
  ok('a bad date is left out, not invented', !('datePublished' in undated) && undated.author['@id']);
  const faq = LD.faqPageLd(TOPICS.flatMap((t) => t.qs));
  ok('every support answer', faq.mainEntity.length === TOPICS.flatMap((t) => t.qs).length && faq.mainEntity.every((q) => q.name && q.acceptedAnswer.text));
  const nasty = LD.safeJsonLd({ t: '</script><script>alert(1)</script>', u: 'a b' });
  ok('cannot close its script element', !nasty.includes('</script') && !nasty.includes('<'));
  ok('…and survives the line separators', !nasty.includes(' ') && JSON.parse(nasty).t === '</script><script>alert(1)</script>');
}

console.log('\n=== how somebody arrived ===');
{
  ok('home', FT.landingBucket('/') === 'home');
  ok('a docs page', FT.landingBucket('/docs/models') === 'docs');
  ok('an invitation', FT.landingBucket('/sign-up', '?invited=1') === 'invite');
  ok('sign-up', FT.landingBucket('/sign-up', '?x=1') === 'sign-up');
  ok('anything else', FT.landingBucket('/weird/path') === 'other');
  const self = 'socria.app';
  ok('no referrer is direct', FT.referrerBucket('', self) === 'direct' && FT.referrerBucket(null, self) === 'direct');
  ok('the site itself is direct', FT.referrerBucket('https://socria.app/docs', self) === 'direct' && FT.referrerBucket('https://www.socria.app/', self) === 'direct');
  ok('google', FT.referrerBucket('https://www.google.com/search?q=private+words', self) === 'google');
  ok('google abroad', FT.referrerBucket('https://www.google.co.uk/', self) === 'google');
  ok('gmail is email, not search', FT.referrerBucket('https://mail.google.com/mail/u/0/', self) === 'email');
  ok('gemini is gemini', FT.referrerBucket('https://gemini.google.com/app', self) === 'gemini');
  ok('chatgpt', FT.referrerBucket('https://chatgpt.com/', self) === 'chatgpt');
  ok('perplexity', FT.referrerBucket('https://www.perplexity.ai/search', self) === 'perplexity');
  ok('hacker news', FT.referrerBucket('https://news.ycombinator.com/item?id=1', self) === 'hackernews');
  ok('t.co is x', FT.referrerBucket('https://t.co/abc', self) === 'x');
  ok('an unlisted site is "other", never its name', FT.referrerBucket('https://some-blog.example.org/post', self) === 'other');
  ok('a lookalike is not google', FT.referrerBucket('https://google.evil.com/', self) === 'other');
  ok('…nor a google-named subdomain of another site', FT.referrerBucket('https://www.google.com.evil.net/', self) === 'other');
  ok('google in Brazil and Japan', FT.referrerBucket('https://www.google.com.br/', self) === 'google' && FT.referrerBucket('https://www.google.co.jp/', self) === 'google');
  ok('garbage is other', FT.referrerBucket('not a url', self) === 'other');
  ok('a campaign tag, tidied', FT.utmToken('  Spring Launch!! 2026 ') === 'spring-launch-2026');
  ok('…capped', FT.utmToken('x'.repeat(80)).length === 40);
  ok('…or nothing', FT.utmToken('   ') === undefined && FT.utmToken(7) === undefined);
  const ft = FT.firstTouchFrom('https://socria.app/docs/models?utm_source=HackerNews&utm_medium=post&utm_campaign=show-hn&q=secret', 'https://news.ycombinator.com/', 1000);
  ok('a first touch from a page view', ft.landing === 'docs' && ft.referrer === 'hackernews' && ft.utm_source === 'hackernews' && ft.utm_campaign === 'show-hn');
  ok('…carrying nothing else from the address', !JSON.stringify(ft).includes('secret') && !JSON.stringify(ft).includes('models'));

  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
  const s1 = mem();
  ok('kept once', FT.rememberFirstTouch(s1, ft) === true);
  const later = FT.firstTouchFrom('https://socria.app/blog', 'https://www.google.com/', 2000);
  ok('first means first', FT.rememberFirstTouch(s1, later) === false && FT.recallFirstTouch(s1, 3000).landing === 'docs');
  ok('a stale note is not a first touch', FT.recallFirstTouch(s1, 1000 + FT.FIRST_TOUCH_MAX_AGE + 1) === null);
  ok('…and may be replaced', FT.rememberFirstTouch(s1, { ...later, at: 1000 + FT.FIRST_TOUCH_MAX_AGE + 1 }) === true);
  s1.m.set(FT.FIRST_TOUCH_KEY, '{"landing":"<b>x</b>","referrer":"google","at":5}');
  ok('a tampered note is tidied on the way out', FT.recallFirstTouch(s1, 10).landing === 'b-x-b');
  s1.m.set(FT.FIRST_TOUCH_KEY, 'not json');
  ok('a broken note is no note', FT.recallFirstTouch(s1, 10) === null);
  FT.forgetFirstTouch(s1);
  ok('forgotten', s1.m.size === 0);
  ok('a throwing store never throws', FT.rememberFirstTouch({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }, ft) === false);
  ok('the sign-up props', JSON.stringify(FT.signupProps(ft)) === JSON.stringify({ landing: 'docs', referrer: 'hackernews', utm_source: 'hackernews', utm_medium: 'post', utm_campaign: 'show-hn' }));
  ok('…unknown without a note', FT.signupProps(null).landing === 'unknown' && FT.signupProps(null).referrer === 'unknown');
  ok('the event exists', EVENTS.includes('signup_completed'));
  ok('analytics keeps the new keys', JSON.stringify(scrub(FT.signupProps(ft))) === JSON.stringify(FT.signupProps(ft)));
  ok('…and still drops anything else', !('q' in scrub({ ...FT.signupProps(ft), q: 'secret' })));
  ok('kept in the US', attributionAllowed('US') === true);
  ok('not in Germany, the UK, Canada', ['DE', 'GB', 'CA', 'CH', 'NO'].every((c) => attributionAllowed(c) === false));
  ok('not where the country is unknown', attributionAllowed(null) === false && attributionAllowed('XX') === false);
}

// ── rendered: the public site and the student page ────────────────────

const OUT = join(here, '.tmp', 'e2e-seo');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const SHIMS = {
  'next/navigation': `export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} });
    export const usePathname = () => '/';
    export const useSearchParams = () => new URLSearchParams();`,
  // the masthead's signed-in / signed-out halves; on the server, before
  // Clerk loads, the "loading" half is what renders. /one asks who is
  // signed in (usePlan); on the server nobody has answered yet.
  '@clerk/nextjs': `export const SignedIn = () => null;
    export const SignedOut = () => null;
    export const ClerkLoaded = () => null;
    export const ClerkLoading = ({ children }) => children ?? null;
    export const useAuth = () => ({ isLoaded: false, isSignedIn: false });`,
};
await build({
  entryPoints: [join(here, 'helpers', 'seo-under-test.tsx')],
  bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'seo-ui.mjs'),
  tsconfig: join(root, 'tsconfig.json'), jsx: 'automatic', loader: { '.css': 'empty' },
  alias: { 'next/link': join(here, 'helpers', 'next-link-shim.mjs'), 'next/image': join(here, 'helpers', 'next-image-shim.mjs') },
  plugins: [{ name: 'shims', setup(b) {
    b.onResolve({ filter: /^(next\/navigation|@clerk\/nextjs)$/ }, (a) => ({ path: a.path, namespace: 'shim' }));
    b.onLoad({ filter: /.*/, namespace: 'shim' }, (a) => ({ contents: SHIMS[a.path], loader: 'js' }));
  } }],
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  logLevel: 'error',
});
const UI = await import(pathToFileURL(join(OUT, 'seo-ui.mjs')).href);

const h1Of = (html) => (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').replace(/<[^>]+>/g, '');
const h1Count = (html) => (html.match(/<h1[\s>]/g) ?? []).length;
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

console.log('\n=== the homepage ===');
{
  const html = renderToStaticMarkup(h(UI.Landing, {}));
  ok('exactly one h1', h1Count(html) === 1, String(h1Count(html)));
  ok('it says the line', /Come out sharper\./.test(h1Of(html)), h1Of(html));
  ok('every "Start a conversation" opens Logos', (html.match(/Start a conversation/g) ?? []).length === 3 && hrefs(html).filter((x) => x === '/logos').length === 4);
  ok('the masthead reaches One and the Charter', hrefs(html).includes('/one') && hrefs(html).includes('/charter') && hrefs(html).includes('#session'));
  ok('…and the conversation it scrolls to is there', html.includes('id="session"'));
  ok('the price, from the one place it lives', html.includes('Socria One') && html.includes('· $15 a month'));
  ok('the foot carries Privacy and Terms', hrefs(html).includes('/privacy') && hrefs(html).includes('/terms'));
  ok('the product picture is one labelled figure, inert inside', /<figure class="s-shot" aria-label="Logos 5: /.test(html) && /<div class="s-app" aria-hidden="true" inert=""/.test(html));
  ok('the margin cards are a picture, not controls', (html.match(/<div class="s-margin" inert="">/g) ?? []).length === 2);
  // Before anything runs, a demo is its final state: every line in place,
  // no "Thinking…" row showing, nothing waiting to fade in.
  ok('the demos render finished', html.includes('What in it is owed but not paid?') && html.includes('A repair date, in writing, by Friday') && !/s-step[^"]*is-armed/.test(html) && (html.match(/s-thinking is-gone/g) ?? []).length === 4);
  ok('nothing from the old journal is left', !/jr-root|Logos 3\.5|Issue No/.test(html));
}

console.log('\n=== Socria One ===');
{
  const html = renderToStaticMarkup(h(UI.One, {}));
  ok('exactly one h1', h1Count(html) === 1 && /Socria One/.test(h1Of(html)), h1Of(html));
  ok('the price and its period, from lib/socria-one', html.includes('<span class="s-one-amt">$15</span>') && html.includes('<span class="s-one-per">a month</span>') && html.includes('$15 a month.'));
  ok('the memory line is the plan table’s, not the design’s', html.includes('Free remembers twelve things about you') && html.includes('One remembers 160') && !html.includes('Free remembers the conversation'));
  ok('sharing, from the share rules', html.includes('Free shares one at a time'));
  ok('five chapters', (html.match(/class="s-chapter"/g) ?? []).length === 5);
  ok('the cover and the join band can subscribe', (html.match(/<button type="button" class="s-pill is-cream[^"]*"/g) ?? []).length === 2);
  ok('the masthead goes to the join band', /<a class="s-pill is-deep" href="#join">Become a member<\/a>/.test(html) && html.includes('id="join"'));
  ok('the free tier opens Logos', /<a class="s-free" href="\/logos">continue with the free tier<\/a>/.test(html));
  ok('it says how it renews', html.includes('Renews monthly until you cancel.'));
}

console.log('\n=== the Charter ===');
{
  const html = renderToStaticMarkup(h(UI.Charter, {}));
  ok('exactly one h1', h1Count(html) === 1 && h1Of(html) === 'The Socria Charter', h1Of(html));
  ok('every paragraph, in order', UI.CHARTER_TEXT.length === 12 && UI.CHARTER_TEXT.every((p, i) => html.indexOf(p) > (i === 0 ? 0 : html.indexOf(UI.CHARTER_TEXT[i - 1]))));
  ok('"No." stands alone', html.includes('<p class="s-no">No.</p>'));
  ok('the PDF is offered twice, as a download', (html.match(/href="\/socria-charter\.pdf" download=""/g) ?? []).length === 2);
  ok('it ends on the line', /The machines work for us\.<\/p><p>Not the other way around\.<\/p>/.test(html));
}

console.log('\n=== the student page ===');
{
  const open = renderToStaticMarkup(h(UI.StudentsBody, { open: true }));
  ok('open: the offer', open.includes('Your first month of Socria One') && open.includes('@mavs.uta.edu'));
  ok('open: the real days', open.includes(`${STUDENT_OFFER.days} days`));
  ok('open: the close', open.includes(UI.CLOSES) && UI.CLOSES === '9 December 2026', UI.CLOSES);
  ok('open: no card, nothing renews', /No card, and nothing renews/.test(open));
  ok('open: sign-up returns to the account', open.includes('/sign-up?redirect_url=%2Faccount'));
  ok('open: a try link that needs no account', /Try it first — no account needed/.test(open));
  ok('open: one h1', (open.match(/<h1[\s>]/g) ?? []).length === 1);
  const closed = renderToStaticMarkup(h(UI.StudentsBody, { open: false }));
  ok('closed: says so', closed.includes('has <span class="em">closed.</span>'));
  ok('closed: promises no month', !closed.includes('@mavs.uta.edu') && !/Create my free account/.test(closed));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
