// test/browser/ux-v0/export-bench.mjs — a generated website, exported, built and served outside SocriaUX.
//
// Two websites (a restaurant with a booking, a form, a gallery and a menu; an artist's portfolio composed by its
// direction) are exported by lib/ux-v0/export-site.ts into a clean folder, built with their own zero-dependency
// build (`npm run build`), served with their own preview server, and opened in a browser that can reach nothing
// else. Checked: the build's own checks, the files, the head, every link, the runtimes (menu, gallery, booking, form
// validation and real submission to the configured destination), a strict Content Security Policy, no request to
// SocriaUX, accessibility by axe-core, and nothing sideways at 1440 / 834 / 390. No model is called.
//
//   node test/browser/ux-v0/export-bench.mjs        (needs test/.tmp: node test/run.mjs builds it)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium, ROOT, S, underTest } from './env.mjs';

const V = await underTest();
const J = JSON.stringify;
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 500))));
const AXE = readFileSync(ROOT + 'node_modules/axe-core/axe.min.js', 'utf8');
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; form-action 'self' https: mailto:; base-uri 'self'";

// ── the two websites, made as the app makes them ──
function made(brief0, answer, salt, refsKinds) {
  const brief = V.normalizeBrief(brief0, new Set());
  const dirs = V.proposeDirections({ brief, salt });
  const dir = dirs[0];
  const pal = V.paletteOf(dir.tokens, dir.look.accent2 ?? '');
  const refs = refsKinds.map((k, i) => V.normalizeRef({ ...V.procRef(V.normalizeProc({ kind: k, seed: 3 + i * 11, ratio: i ? '4:3' : '16:9', palette: pal }), 'a stand-in picture'), state: 'kept', asContent: true }));
  const moodboard = V.normalizeMoodboard({ refs });
  const ans = answer(refs);
  const spec = V.parseGenerate(ans, brief, moodboard, 1, `Generated in the “${dir.name}” direction`, dir);
  return { spec, refs: refs.map((r) => (r.proc ? { ...r, url: V.proceduralUri(r.proc) } : r)), dir };
}
const restaurant = made(
  { pageType: 'website', platform: 'web', objective: 'A website for Salt & Ember, a twelve-table restaurant cooking over fire, where guests book a table and read the menu.', audience: 'Diners in the city', personality: ['warm', 'confident'], visualDirection: 'Warm and editorial, firelight and dark wood.', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } },
  (refs) => ({
    title: 'Salt & Ember',
    sections: [
      { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Salt & Ember', links: ['Menu', 'Book', 'Contact'], cta: 'Book a table' } },
      { id: 'hero', kind: 'hero', variant: 'split', content: { title: 'Cooked over *fire*, served at twelve tables', subtitle: 'A small dining room in the old harbour, open Wednesday to Sunday.', primary: 'Book a table', secondary: 'See the menu' }, images: [refs[0].id] },
      { id: 'menu', kind: 'list', variant: 'menu', content: { title: 'The menu', groups: [{ title: 'From the fire', items: [{ name: 'Leeks, hazelnut, brown butter', price: '14' }, { name: 'Hake, mussels, sea herbs', price: '28' }] }, { title: 'After', items: [{ name: 'Burnt honey custard', price: '9' }] }] } },
      { id: 'room', kind: 'gallery', variant: 'grid', content: { title: 'The room' }, images: refs.slice(1).map((r) => r.id) },
      { id: 'book', kind: 'booking', variant: 'strip', content: V.sampleFor('booking', V.intentOf(V.normalizeBrief({ pageType: 'website', objective: 'book a table at a restaurant' }, new Set())), V.normalizeBrief({ pageType: 'website', objective: 'book a table' }, new Set())) ?? {} },
      { id: 'write', kind: 'form', variant: 'stacked', content: { title: 'Private dining and enquiries', intro: 'Tell us the date and how many you are.', fields: [{ label: 'Your name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Message', type: 'textarea', required: false }], submit: 'Send the enquiry' } },
      { id: 'foot', kind: 'footer', variant: 'simple', content: { brand: 'Salt & Ember', columns: [{ title: 'Visit', links: ['Book', 'Menu'] }, { title: 'Elsewhere', links: ['Instagram'] }] } },
    ],
  }),
  'export-restaurant',
  ['field', 'contour', 'grain', 'lattice'],
);
const artist = made(
  { pageType: 'website', platform: 'web', objective: 'A portfolio for an experimental artist working in collage and installation.', audience: 'Curators and collectors', personality: ['raw', 'daring'], visualDirection: 'Experimental and fragmented: collage, torn and cut-up, abstract and off-grid, layered with depth.', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } },
  (refs) => ({
    title: 'Ines Varga',
    sections: [
      { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Ines Varga', links: ['Work', 'Method'], cta: 'See the archive' } },
      { id: 'hero', kind: 'hero', variant: 'centered', content: { title: 'Things broken on purpose', subtitle: 'Collage, print and installation.', primary: 'See the archive' }, images: [refs[0].id] },
      { id: 'method', kind: 'features', variant: 'grid', content: { title: 'Method', items: [{ title: 'Tear', text: 'Paper first, by hand.' }, { title: 'Set', text: 'Pieces placed, moved, placed again.' }, { title: 'Fix', text: 'Glued only when it holds.' }] } },
      { id: 'work', kind: 'gallery', variant: 'grid', content: { title: 'Work' }, images: refs.slice(1).map((r) => r.id) },
      { id: 'foot', kind: 'footer', variant: 'simple', content: { brand: 'Ines Varga', columns: [] } },
    ],
  }),
  'export-artist',
  ['field', 'contour', 'lattice', 'grain'],
);

// the restaurant's owner set where its form sends and its address; the artist set nothing
const restaurantSet = V.applyPatch(restaurant.spec, { op: 'site', site: { url: 'https://saltandember.example.com', formAction: 'https://forms.example.test/f/salt', description: 'A twelve-table restaurant cooking over fire in the old harbour. Book a table online.', links: { 'foot:columns.1.links.0': 'https://instagram.com/saltandember' } }, summary: 'Site settings' });
ok('the site settings apply as a version of the design', restaurantSet.ok, restaurantSet.error);

const work = mkdtempSync(join(tmpdir(), 'socriaux-export-'));
const sites = [
  { key: 'restaurant', ...restaurant, spec: restaurantSet.spec },
  { key: 'artist', ...artist },
];
const b = await chromium.launch();
const summary = [];
for (const site of sites) {
  console.log(`\n${site.key}: ${site.spec.title} (${site.dir.name})`);
  const ex = V.exportSite(site.spec, site.refs, { direction: { name: site.dir.name, language: site.dir.language, said: site.dir.strategy?.said ?? [] }, now: Date.UTC(2026, 10, 19) });
  const dir = join(work, ex.name);
  for (const f of ex.files) {
    mkdirSync(dirname(join(dir, f.path)), { recursive: true });
    writeFileSync(join(dir, f.path), typeof f.data === 'string' ? f.data : Buffer.from(f.data));
  }
  const paths = ex.files.map((f) => f.path);
  ok('the export has the site, its runtimes, its build, its docs and its design', ['index.html', 'styles.css', 'js/behaviors.js', 'js/motion.js', 'scripts/build.mjs', 'scripts/preview.mjs', 'package.json', 'README.md', 'CREDITS.md', '.env.example', 'netlify.toml', 'vercel.json', 'socriaux.json'].every((p) => paths.includes(p)), J(paths));
  const index = readFileSync(join(dir, 'index.html'), 'utf8');
  ok('no script runs inline (a strict Content Security Policy holds); data pictures are files', !/<script>(?!\s*$)/.test(index.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')) && !/src="data:/.test(index) && ex.report.assets >= 1, `${ex.report.assets} assets`);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  ok('package.json: build and preview scripts, no dependencies', pkg.scripts.build && pkg.scripts.preview && !pkg.dependencies && !pkg.devDependencies, J(pkg));

  // STRICT fails while something is not done; a normal build says what, and succeeds
  let strictFailed = false;
  try {
    execFileSync('npm', ['run', 'build', '--silent'], { cwd: dir, env: { ...process.env, STRICT: '1' }, stdio: 'pipe' });
  } catch {
    strictFailed = true;
  }
  const todo = ex.report.todo.filter((t) => !/has no address/.test(t) && !/no description/.test(t));
  ok(`STRICT=1 ${todo.length ? 'fails while a link goes nowhere or a form is not connected' : 'passes: everything is connected'}`, strictFailed === todo.length > 0, J(ex.report.todo));
  const built = execFileSync('npm', ['run', 'build', '--silent'], { cwd: dir, env: { ...process.env, SITE_URL: site.key === 'artist' ? 'https://inesvarga.example.com' : '' }, encoding: 'utf8' });
  ok('the build runs on its own and says what it built and what is left', /Built dist\//.test(built), built);
  ok('…dist/ holds the page, its styles, scripts and pictures, a sitemap once the address is known', ['index.html', 'styles.css', 'js/behaviors.js', 'js/motion.js', 'robots.txt', 'sitemap.xml'].every((p) => existsSync(join(dir, 'dist', p))), built);
  const distHtml = readFileSync(join(dir, 'dist', 'index.html'), 'utf8');
  ok('the head: title, description, Open Graph, canonical, structured data (only what the page and the designer said)', /<title>/.test(distHtml) && /name="description"/.test(distHtml) && /og:title/.test(distHtml) && /rel="canonical"/.test(distHtml) && /"@type":"WebSite"/.test(distHtml), distHtml.slice(0, 1200));

  // served by its own preview server; the browser reaches it through Node (it may not open loopback itself)
  const port = 4300 + sites.indexOf(site);
  const server = spawn('node', ['scripts/preview.mjs'], { cwd: dir, env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
  await new Promise((res) => {
    server.stdout.on('data', (d) => /Serving/.test(String(d)) && res());
    setTimeout(res, 3000);
  });
  const origin = `http://site-${site.key}.test`;
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const requests = [];
  const posted = [];
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    requests.push(u.href);
    if (u.origin === origin) {
      const r = await fetch(`http://127.0.0.1:${port}${u.pathname}`);
      const headers = { 'content-type': r.headers.get('content-type') ?? 'text/plain', 'content-security-policy': CSP };
      return route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
    }
    if (u.hostname === 'forms.example.test') {
      posted.push({ method: route.request().method(), body: route.request().postData() ?? '' });
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Thanks</title><p>Thanks: received.</p>' });
    }
    // fonts and anything else outside: answered empty (the site must not depend on them to work)
    return route.fulfill({ status: 200, contentType: u.pathname.endsWith('.css') || u.hostname.includes('fonts') ? 'text/css' : 'text/plain', body: '' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  const res = await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  ok('served by its own preview server: the page, its styles and scripts load', res?.status() === 200 && (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== 'rgba(0, 0, 0, 0)');
  const notFound = [];
  for (const u of requests.filter((x) => x.startsWith(origin))) {
    const r = await fetch(`http://127.0.0.1:${port}${new URL(u).pathname}`);
    if (r.status !== 200) notFound.push(u);
  }
  ok('every file the page asked for was there', !notFound.length, J(notFound));
  ok('nothing asked of SocriaUX or any address the designer did not choose (fonts aside)', !requests.some((u) => /socria|localhost|127\.0\.0\.1/.test(u)), J(requests.filter((u) => !u.startsWith(origin))));
  // scrolled through as a visitor would: every part's words arrive while they are in view (an entrance tied to the
  // scroll shows words as they come into view, so each is measured in the middle of the screen, not from the top)
  const seen = new Map();
  const total = await page.evaluate(() => document.scrollingElement.scrollHeight);
  for (let y = 0; y < total; y += 300) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(260);
    const now = await page.evaluate(() =>
      [...document.querySelectorAll('.sx h1,.sx h2,.sx h3,.sx p,.sx li,.sx label,.sx button')]
        .filter((el) => el.textContent.trim() && el.getClientRects().length && !el.closest('[hidden],[aria-hidden="true"],.nav-over,[role="dialog"]'))
        // a control that cannot be used yet (a full time, a confirm with no time chosen) is dimmed on purpose
        .filter((el) => !el.matches(':disabled,[aria-disabled="true"]') && !el.querySelector('input:disabled') && !el.closest('label')?.querySelector('input:disabled'))
        .map((el, i) => {
          const r = el.getBoundingClientRect();
          if (r.top < innerHeight * 0.2 || r.bottom > innerHeight * 0.8) return null;
          let op = 1;
          for (let n = el; n && n !== document.body; n = n.parentElement) op = Math.min(op, Number(getComputedStyle(n).opacity));
          return [`${el.tagName}:${el.textContent.trim().slice(0, 30)}:${Math.round(r.top + scrollY)}`, op];
        })
        .filter(Boolean),
    );
    for (const [k, op] of now) seen.set(k, Math.max(seen.get(k) ?? 0, op));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const hidden = [...seen.entries()].filter(([, op]) => op < 0.6).map(([k, op]) => `${k} (${op})`);
  ok(`scrolled through, every part’s words arrive while in view (${seen.size} measured)`, seen.size >= 5 && !hidden.length, JSON.stringify(hidden.slice(0, 12)));
  await page.waitForTimeout(600);
  const anchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map((a) => ({ h: a.getAttribute('href'), ok: a.getAttribute('href') === '#' || a.getAttribute('href') === '#top' || !!document.getElementById(a.getAttribute('href').slice(1)), unlinked: a.hasAttribute('data-ux-unlinked'), text: a.textContent.trim() })));
  ok('every link to a part of the page lands on it; the ones going nowhere are marked, not disguised', anchors.every((a) => a.ok) && anchors.filter((a) => a.h === '#').every((a) => a.unlinked), J(anchors.filter((a) => !a.ok || (a.h === '#' && !a.unlinked))));
  ok(`${site.key === 'restaurant' ? 'the buttons go where their words say: “Book a table” to the booking, “See the menu” to the menu' : 'the buttons go where their words say: “See the archive” to the work'}`, site.key === 'restaurant' ? anchors.some((a) => a.text === 'Book a table' && a.h === '#s-book') && anchors.some((a) => a.text === 'See the menu' && a.h === '#s-menu') : anchors.some((a) => a.text === 'See the archive' && a.h === '#s-work'), J(anchors));
  // the runtimes work from their own files
  const counts = await page.evaluate(() => (window.__uxBehaviors ? { galleries: window.__uxBehaviors.galleries, bookings: window.__uxBehaviors.bookings, forms: window.__uxBehaviors.forms } : null));
  ok('the behaviour runtime runs from js/behaviors.js', !!counts, J(counts));
  if (await page.locator('.g-item button, .g-item a, [data-ux-open]').count()) {
    await page.locator('.g-item button, [data-ux-open]').first().click();
    await page.waitForTimeout(400);
    const open = await page.locator('[role="dialog"]:not([hidden])').count();
    await page.keyboard.press('Escape');
    ok('the gallery opens a picture large, and Escape closes it', open >= 1);
  }
  if (site.key === 'restaurant') {
    const self = await page.evaluate(() => window.__uxBehaviors?.selfTest?.() ?? null);
    ok('the booking works when tried in place (choose a time, confirm, change it)', self && (Array.isArray(self) ? self : [self]).every((x) => !x.problems?.length), J(self));
    // the form: checked first; then sent to the destination the owner set
    const form = page.locator('form[data-ux-form]');
    await form.locator('[type=submit]').click();
    await page.waitForTimeout(300);
    const invalid = await form.locator('[aria-invalid="true"]').count();
    ok('an empty form is not sent: each missing answer said beside its field', invalid >= 2 && !posted.length, `${invalid} invalid`);
    await form.locator('input[type=text]').first().fill('Ada Lovelace');
    await form.locator('input[type=email]').fill('ada@example.com');
    await Promise.all([page.waitForURL(/forms\.example\.test/, { timeout: 8000 }).catch(() => {}), form.locator('[type=submit]').click()]);
    await page.waitForTimeout(500);
    ok('a checked form is really sent to the destination the owner set, its answers by name', posted.length === 1 && posted[0].method === 'POST' && /your-name-1=Ada/.test(posted[0].body) && /email-2=ada/.test(posted[0].body), J(posted));
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  }
  // accessibility, by axe-core (WCAG 2.2 A and AA rules)
  // at rest: the opening's entrance motion has finished (mid-fade, words are measured at a fraction of their colour)
  await page.waitForTimeout(2200);
  // evaluated by the browser's own tooling: a script tag would be refused by the page's security policy (as it should)
  await page.evaluate(AXE).catch(() => {});
  // (preload off: axe would otherwise fetch the font stylesheet itself, which the page's policy rightly refuses)
  const axe = await page.evaluate(async () => (window.axe ? (await window.axe.run(document, { preload: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, at: v.nodes.slice(0, 3).map((x) => `${x.target.join(' ')} ${x.any?.[0]?.message ?? ''}`.slice(0, 220)) })) : null)).catch(() => null);
  const serious = (axe ?? []).filter((v) => v.impact === 'serious' || v.impact === 'critical');
  ok('axe-core: no serious or critical WCAG violation', axe !== null && !serious.length, J(axe));
  // nothing sideways; the phone menu opens and closes. The screenshots show the page at rest: loaded afresh as a
  // visitor who asks for reduced motion gets it (a full-page capture of a page in motion catches it mid-movement)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  for (const w of [1440, 834, 390]) {
    await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
    await page.waitForTimeout(250);

    const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    ok(`at ${w} px nothing scrolls sideways`, over <= 0, `${over}px`);
    await page.screenshot({ path: `${S}export-${site.key}-${w}.png`, fullPage: w === 1440 });
  }
  const menu = page.locator('[data-ux-menu]');
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await page.waitForTimeout(300);
    const opened = await page.locator('[data-ux-menu-panel]:not([hidden])').count();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ok('on a phone the menu opens and Escape closes it', opened === 1 && (await page.locator('[data-ux-menu-panel]:not([hidden])').count()) === 0);
  }
  ok('no script error and no security-policy violation', !errors.length, J(errors));
  summary.push({ site: site.key, title: site.spec.title, files: ex.files.length, assets: ex.report.assets, todo: ex.report.todo, axe: axe?.length ?? null, requests: requests.length });
  server.kill();
  await ctx.close();
}
await b.close();
writeFileSync(`${S}export-bench.json`, J(summary, null, 2));
rmSync(work, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
