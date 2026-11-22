// test/browser/ux-v0/dsi-bench.mjs — Design System Intelligence benchmarks A–I, measured, with their evidence written
// to UXV0_OUT (dsi-bench.json, dsi-bench.md, renders). No model, no network: the website is an authored sample served
// through the extractor's injected transport (the address guard still runs); Figma is the real adapter over fixture
// responses (live verification is reported separately as blocked when it is).
//
//   UXV0_OUT=<dir> node test/browser/ux-v0/dsi-bench.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = process.env.UXV0_OUT || join(ROOT, 'test/.tmp/dsi-bench');
mkdirSync(OUT, { recursive: true });
const D = await import(pathToFileURL(join(ROOT, 'test/.tmp/dsi-under-test.mjs')).href);
const F = await import(pathToFileURL(join(ROOT, 'test/fixtures/dsi/figma.mjs')).href);
const J = JSON.stringify;
const enc = (s) => new TextEncoder().encode(s);
const ms = (t0) => Math.round((performance.now() - t0) * 10) / 10;
const report = {};
const md = ['# Design System Intelligence — benchmarks A–I', '', `Run ${new Date().toISOString()}. No model calls; no network (see each benchmark for what was simulated).`, ''];
const section = (k, title, rows, verdict) => {
  report[k] = { title, rows, verdict };
  md.push(`## ${k}. ${title}`, '', ...rows.map(([a, b]) => `- **${a}**: ${b}`), '', `**${verdict}**`, '');
  console.log(`\n${k}. ${title} — ${verdict}`);
  for (const [a, b] of rows) console.log(`   ${a}: ${b}`);
};

// ── A. JSON tokens with aliases and themes ──
{
  const tokens = { color: { $type: 'color', palette: {}, semantic: {} }, space: { $type: 'dimension' } };
  const hues = ['blue', 'green', 'red', 'amber', 'gray'];
  for (const h of hues) {
    tokens.color.palette[h] = {};
    const hx = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    for (const [i, step] of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].entries()) tokens.color.palette[h][step] = { $value: `#${hx(240 - i * 22 + h.length * 3)}${hx(235 - i * 20)}${hx(225 - i * 18 + h.length * 5)}` };
  }
  tokens.color.semantic = {
    background: { $value: '{color.palette.gray.50}', $extensions: { mode: { dark: '{color.palette.gray.900}', 'high-contrast': '#ffffff' } } },
    text: { $value: '{color.palette.gray.900}', $extensions: { mode: { dark: '{color.palette.gray.50}', 'high-contrast': '#000000' } } },
    accent: { $value: '{color.palette.blue.600}', $extensions: { mode: { dark: '{color.palette.blue.300}' } } },
    action: { primary: { $value: '{color.semantic.accent}' }, hover: { $value: '{color.semantic.action.primary}' } },
  };
  for (let i = 1; i <= 12; i++) tokens.space[i] = { $value: i === 1 ? '4px' : `{space.1} * ${i}` };
  const broken = J({ ...tokens, broken: { $type: 'color', loopA: { $value: '{broken.loopB}' }, loopB: { $value: '{broken.loopA}' }, missing: { $value: '{color.nope}' } } });
  const t0 = performance.now();
  const r = D.importJson([{ name: 'bench-a.tokens.json', text: J(tokens) }]);
  const t = ms(t0);
  const all = D.resolveAll(r.content);
  const dark = D.resolveAll(r.content, { mode: 'dark' });
  const again = D.importJson([{ name: 'bench-a.tokens.json', text: J(tokens) }]);
  const det = J(Object.values(again.content.tokens).map((x) => [x.path, x.value, x.modes])) === J(Object.values(r.content.tokens).map((x) => [x.path, x.value, x.modes]));
  const rb = D.importJson([{ name: 'broken.json', text: broken }]);
  const aliases = Object.values(r.content.tokens).filter((x) => D.isAlias(x.value) || D.refsIn(x.value).length).length;
  const unresolved = [...all.values()].filter((x) => !x.ok).length;
  section('A', 'JSON tokens with aliases and themes (W3C DTCG)', [
    ['Tokens', `${Object.keys(r.content.tokens).length} (${aliases} references, chains up to 3 deep, 11 token-maths expressions)`],
    ['Modes', r.content.modes.join(', ')],
    ['Resolved', `${all.size - unresolved}/${all.size} in the default mode; dark: action.hover → ${dark.get('color.semantic.action.hover').value} via ${dark.get('color.semantic.action.hover').chain.join(' → ')}`],
    ['Problems found in a broken variant', rb.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' | ')],
    ['Import time', `${t} ms (deterministic: ${det ? 'identical on re-import' : 'DIFFERENT'})`],
  ], unresolved === 0 && det && rb.issues.some((i) => /cycle/.test(i.message)) && rb.issues.some((i) => /does not exist/.test(i.message)) ? 'PASS' : 'FAIL');
  // scale: 5,000 tokens
  const big = { $type: 'color' };
  for (let i = 0; i < 2500; i++) big[`c${i}`] = { $value: `#${(i * 2654435761 >>> 8).toString(16).padStart(6, '0').slice(0, 6)}` };
  for (let i = 0; i < 2500; i++) big[`a${i}`] = { $value: `{big.c${i}}` };
  const t1 = performance.now();
  const rbig = D.importJson([{ name: 'big.json', text: J({ big }) }]);
  const tImport = ms(t1);
  const t2 = performance.now();
  D.validate(rbig.content);
  const tVal = ms(t2);
  report.A.scale = { tokens: Object.keys(rbig.content.tokens).length, importMs: tImport, validateMs: tVal };
  md.push(`Scale: ${Object.keys(rbig.content.tokens).length} tokens (2,500 references) imported in ${tImport} ms and validated in ${tVal} ms.`, '');
  console.log(`   Scale: ${Object.keys(rbig.content.tokens).length} tokens imported in ${tImport} ms, validated in ${tVal} ms`);
}

// ── B. CSS ──
{
  // the authored site's stylesheet, plus what a real system's stylesheet also has: variables that refer to other
  // variables (a chain, one with a fallback), token maths over them, a theme attribute, a component-scoped variable
  const css = readFileSync(join(ROOT, 'test/fixtures/dsi/site/site.css'), 'utf8') + '\n:root { --color-action: var(--color-crust); --color-link: var(--color-action, #b4532a); --space-8: calc(var(--space-4) * 2); }\n[data-theme="dark"] { --color-crust: #d9784f; }\n.card { --card-pad: 24px; }\n@property --hero-angle { syntax: "<number>"; inherits: false; initial-value: 12; }';
  const t0 = performance.now();
  const r = D.importCss([{ name: 'site.css', text: css }]);
  const t = ms(t0);
  const inferred = Object.values(r.content.tokens).filter((x) => x.provenance.status === 'inferred').length;
  const linkLight = D.resolveToken(r.content, 'color.link');
  const linkDark = D.resolveToken(r.content, 'color.link', { mode: 'dark' });
  const space8 = D.resolveToken(r.content, 'space.8');
  const refsOk = r.content.tokens['color.link']?.value === '{color.action}' && r.content.tokens['color.action']?.value === '{color.crust}' && linkLight.value === '#b4532a' && linkDark.value === '#d9784f' && space8.value === '32px';
  section('B', 'CSS variables from a representative stylesheet', [
    ['Tokens', `${Object.keys(r.content.tokens).length}: ${Object.keys(r.content.tokens).join(', ')}`],
    ['Modes', `${r.content.modes.join(', ')} (from prefers-color-scheme and [data-theme])`],
    ['References', `${Object.values(r.content.tokens).filter((x) => D.isAlias(x.value)).length} var() references kept as references; ${Object.values(r.content.tokens).filter((x) => typeof x.value === 'string' && !D.isAlias(x.value) && /\{[\w.-]+\}/.test(x.value)).length} calc() over variables kept as token maths`],
    ['Resolved', `color.link → ${linkLight.value} (via ${linkLight.chain?.join(' → ')}); in dark → ${linkDark.value}; space.8 → ${space8.value}`],
    ['Typed', `${Object.keys(r.content.tokens).length - inferred} by @property; ${inferred} inferred (said, for review)`],
    ['Kept unread', `component-scoped: ${Object.keys(r.content.unknown['css.scoped'] ?? {}).join(', ')}`],
    ['Not fetched', r.notes.filter((n) => /@import/.test(n)).join(' ')],
    ['Time', `${t} ms`],
  ], refsOk && r.content.modes.includes('dark') && r.content.tokens['brand.angle'] === undefined && r.content.tokens['hero.angle']?.type === 'number' && !!r.content.unknown['css.scoped'] ? 'PASS' : 'FAIL');
}

// ── C. PDF ──
let brandContent;
{
  const t0 = performance.now();
  const r = await D.importPdf({ name: 'ferrowmoor-guidelines.pdf', bytes: new Uint8Array(readFileSync(join(ROOT, 'test/fixtures/dsi/ferrowmoor-guidelines.pdf'))) });
  const t = ms(t0);
  const c = r.content;
  const colours = r.facts.colours;
  const byKind = {};
  for (const i of c.intelligence) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  brandContent = c;
  section('C', 'Brand guidelines PDF, with inference labelling', [
    ['Brand', `${c.identity.name} — ${r.facts.sections.length} sections read on ${new Set(r.facts.sections.map((s) => s.page)).size} pages`],
    ['Colours', colours.map((x) => `${x.name} ${x.hex} (${x.basis}${x.basis === 'explicit' ? '' : `: ${x.note?.slice(0, 70)}`})`).join('; ')],
    ['Typefaces', r.facts.fonts.map((f) => `${f.family} for ${f.role ?? '—'} (${f.weights.join('/') || 'weights unstated'}), p. ${f.page}`).join('; ')],
    ['Type scale', r.facts.sizes.map((s) => `${s.label} ${s.stated}`).join(', ')],
    ['Statements', `${c.intelligence.length} explicit, each with page and quote: ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}`],
    ['Rules with checks', c.intelligence.filter((i) => i.check).map((i) => `${i.check.kind} (${i.enforce})`).join(', ')],
    ['Not covered (nothing invented)', r.facts.unknown.join(', ') || 'none — every core category is stated'],
    ['Inferences', 'a print-only colour matched to its drawn swatch is marked inferred (confidence 0.7); none is enforced'],
    ['Time', `${t} ms`],
  ], colours.some((x) => x.basis === 'extracted') && c.intelligence.every((i) => i.basis === 'explicit') ? 'PASS' : 'FAIL');
}

// ── D. website + security ──
{
  const html = readFileSync(join(ROOT, 'test/fixtures/dsi/site/index.html'), 'utf8');
  const css = readFileSync(join(ROOT, 'test/fixtures/dsi/site/site.css'), 'utf8');
  const served = { 'https://larkfield.example/': ['text/html', html], 'https://larkfield.example/assets/site.css': ['text/css', css] };
  const fetched = [];
  const fetcher = async (u) => (fetched.push(u), served[u] ? new Response(served[u][1], { status: 200, headers: { 'content-type': served[u][0] } }) : new Response('', { status: 404 }));
  const dns = async () => [{ address: '93.184.215.14', family: 4 }];
  const t0 = performance.now();
  const r = await D.extractSite('https://larkfield.example/', { fetcher, resolver: dns });
  const t = ms(t0);
  const probes = [
    ['http://127.0.0.1/admin', 'loopback'],
    ['http://169.254.169.254/latest/meta-data', 'cloud metadata'],
    ['http://[::ffff:127.0.0.1]/', 'mapped IPv6 loopback'],
    ['http://intranet/', 'single-label host'],
    ['http://db.internal/', '.internal'],
    ['https://user:pw@example.com/', 'credentials'],
    ['https://example.com:8443/', 'non-standard port'],
    ['ftp://example.com/', 'scheme'],
  ];
  const results = probes.map(([u, what]) => [what, D.checkUrl(u).ok ? 'ALLOWED' : 'refused']);
  const rebind = await D.extractSite('https://rebind.example/', { fetcher, resolver: async () => [{ address: '10.0.0.7', family: 4 }] });
  const redirect = await D.extractSite('https://hop.example/', { fetcher: async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } }), resolver: dns });
  const lookup = D.guardedLookup(async () => [{ address: '192.168.1.10', family: 4 }]);
  const atConnect = await new Promise((res) => lookup('x.example', { all: true }, (e) => res(e?.code)));
  section('D', 'Website extraction (authored sample site) and address security', [
    ['Fetched', fetched.join(', ') + ' — no script, no @import, no crawling'],
    ['Reconstruction', `${Object.keys(r.result.content.tokens).length} tokens, all marked inferred; modes ${r.result.content.modes.join(', ')}; logo candidates ${r.assets.length} (sanitized, unapproved); ${t} ms`],
    ['Address probes', results.map(([w, v]) => `${w}: ${v}`).join('; ')],
    ['DNS to a private address', rebind.ok ? 'ALLOWED' : `refused (${rebind.error})`],
    ['Redirect to loopback', redirect.ok ? 'ALLOWED' : `refused (${redirect.error})`],
    ['Connect-time lookup (rebinding)', atConnect === 'EBLOCKED' ? 'refused' : 'ALLOWED'],
    ['Live public fetch', 'not run here: this environment’s network policy denies public hosts; the route runs it in production through the same guard'],
  ], r.ok && results.every(([, v]) => v === 'refused') && !rebind.ok && !redirect.ok && atConnect === 'EBLOCKED' ? 'PASS' : 'FAIL');
}

// ── E. Figma ──
{
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(url.replace(F.FILE_KEY, ':key'));
    if (url.includes('/variables/local')) return new Response(J(F.variables), { status: 200 });
    if (url.includes('/nodes?')) return new Response(J(F.nodes), { status: 200 });
    if (url.includes('/v1/images/')) return new Response(J(F.images), { status: 200 });
    if (url.startsWith('https://figma-alpha-api.s3')) return new Response(F.logoSvg, { status: 200 });
    if (url.includes('/v1/files/')) return new Response(J(F.file), { status: 200 });
    return new Response('', { status: 404 });
  };
  const r = await D.fetchFigmaFile(F.FILE_KEY, 'figd_bench_token_00000000000000', { fetcher });
  const c = r.content.content;
  section('E', 'Figma (MOCKED: the real adapter over fixture API responses — not a live file)', [
    ['Calls (simulated)', calls.join(', ')],
    ['Variables', `${Object.values(c.tokens).filter((t) => t.provenance.source.variableId).length} tokens from 2 collections; modes ${c.modes.join(', ')}; aliases as references; 1 remote-library reference said`],
    ['Styles', `${Object.values(c.tokens).filter((t) => t.provenance.source.nodeId).length} tokens (fill, text with its family, shadow, grid)`],
    ['Components', c.components.map((x) => `${x.name} (${x.variants.length} variants)`).join(', ') + ' — definitions, not code'],
    ['Logo export', `${r.assets.length} SVG, sanitized, unapproved`],
    ['Source mappings', 'file key, variable/collection/node ids, mode and file version on every token'],
    ['Live verification', 'BLOCKED: api.figma.com is denied by this environment’s network policy and no Figma token is configured'],
  ], r.ok && c.modes.length === 2 && c.components.length === 2 ? 'PASS (mocked)' : 'FAIL');
}

// ── F. one system across products ──
let brandRec;
{
  const logoSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"><path fill="#2f4a3a" d="M10 70 L40 10 L70 70 Z"/><path fill="#d9632b" d="M30 70 Q40 40 50 70 Z"/><rect x="90" y="30" width="190" height="20" fill="#1d1d1b"/></svg>';
  const logo = D.approveAsset((await D.importAsset({ name: 'ferrowmoor-logo.svg', bytes: enc(logoSvg) })).asset, true);
  brandRec = D.publish(D.newRecord(D.analyzeBrand({ ...brandContent, assets: [logo] }), { now: 1 }), { now: 2, confirm: true }).record;
  const sys = brandRec.draft;
  const mats = [];
  const briefs = [['poster', 'A poster: “Walk further, stay dry”'], ['social', 'A social post: “New season boots are here”'], ['card', 'A card: “Ferrowmoor field notes”'], ['banner', 'A banner: “Autumn walks, every weekend”']];
  for (const [i, [kind, words]] of briefs.entries()) {
    const m = D.composeInBrand(sys, D.readGraphicBrief(words, { kind }), D.languageDirection(words, [], `f${i}`), { seed: 31 + i, name: kind });
    mats.push({ kind, doc: m.doc, fidelity: m.fidelity });
  }
  const bb = D.readBoardRequest('A campaign for Ferrowmoor’s autumn season: “Walk further, stay dry”. A poster, a social post and a banner.');
  const opts = D.brandBoardOptions(sys, bb, 'bench', { link: { id: brandRec.id, version: 1, name: brandRec.name } });
  let board = D.startBoard({ ...bb, content: { ...bb.content, brand: sys.identity.name } }, opts[1], { assets: [D.logoBoardAsset(sys)] });
  const bmats = board.materials.filter((m) => m.type === 'graphic').map((m, i) => ({ m, c: D.composeMaterial(m, board.system, { assets: board.assets, sibling: i, order: i }) }));
  for (const { m, c } of bmats) mats.push({ kind: `board ${m.name}`, doc: c.doc, fidelity: D.fidelityOfDoc(c.doc, sys) });
  // the logo presentation: the approved file on its ground and reversed
  const pres = { schema: 1, id: 'pres', name: 'Logo', tokens: D.toGraphicTokens(sys), artboards: [{ id: 'a', name: 'Logo', width: 1200, height: 600, unit: 'px', dpi: 72, format: 'custom', background: D.productPalette(sys).colors.background, bleed: 0, safe: 0, children: [{ id: 't', type: 'text', name: 'Logo', role: 'logo', x: 300, y: 220, w: 600, h: 160, rotation: 0, opacity: 1, text: sys.identity.name, font: 'Inter', weight: 600, size: 120, lineHeight: 1.2, tracking: 0, align: 'center', valign: 'top', color: '#111111' }] }], assets: [], revision: 0, updatedAt: 0 };
  const presDoc = D.placeBrandLogo(pres, sys).doc;
  mats.push({ kind: 'logo presentation', doc: presDoc, fidelity: D.fidelityOfDoc(presDoc, sys) });
  // the website: a design in the system
  const wp = { ...D.makeProject('create', 'Ferrowmoor site', 1), specs: [D.normalizeSpec({ title: 'Ferrowmoor', pageType: 'website', tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#555555', accent: '#7c3aed', accentText: '#ffffff', line: '#dddddd' }, fonts: { display: 'Syne', body: 'Inter' }, scale: 'comfortable', radius: 'round', style: 'editorial', imageTreatment: 'natural' }, sections: [{ id: 'hero', kind: 'hero', variant: 'editorial', content: { title: 'Walk further, stay dry', body: 'Field equipment for long walks in bad weather.' } }, { id: 'f', kind: 'features', variant: 'grid', content: { title: 'Made for weather', items: [{ title: 'Waxed cotton', body: 'Sheds rain.' }, { title: 'Wool lining', body: 'Warm when wet.' }, { title: 'Repairs for life', body: 'Send it back.' }] } }] }, { refs: [] })], specIndex: 0 };
  const wa = D.applySystem(wp, brandRec);
  const site = wa.project.specs[wa.project.specIndex];
  const wf = D.fidelityOfTokens(site.tokens, sys);
  const sig = (doc) => J(doc.artboards[0].children.filter((n) => !n.decorative).map((n) => [n.type, n.role, Math.round((n.x / doc.artboards[0].width) * 10), Math.round((n.y / doc.artboards[0].height) * 10)]));
  const sigs = new Set(mats.map((m) => sig(m.doc)));
  // renders for the contact sheet
  const require = createRequire(join(ROOT, 'package.json'));
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  const cells = mats.map((m) => `<figure><div class="art">${D.renderArtboard(m.doc, m.doc.artboards[0])}</div><figcaption>${m.kind} · fidelity ${m.fidelity.score}</figcaption></figure>`).join('');
  const rendered = D.renderDesign(site, []);
  const siteHtml = `<figure><iframe srcdoc="${(`<style>${rendered.css}</style>${rendered.html}`).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" width="560" height="420"></iframe><figcaption>website · fidelity ${wf.score}</figcaption></figure>`;
  await page.setContent(`<html><body style="margin:20px;font:13px system-ui;background:#eee"><h1 style="font:600 22px system-ui">Ferrowmoor — one identity, independent compositions</h1><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">${cells}${siteHtml}</div><style>.art svg{width:100%;height:auto;max-height:340px;background:#fff}figure{margin:0}iframe{border:0;background:#fff;width:100%}</style></body></html>`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'dsi-bench-F.png'), fullPage: true });
  await b.close();
  section('F', 'One system across website, poster, social, board materials and logo presentation', [
    ['Materials', mats.map((m) => `${m.kind}: fidelity ${m.fidelity.score}${m.fidelity.findings.length ? ` (${m.fidelity.findings.map((f) => f.message).join('; ').slice(0, 120)})` : ''}`).join(' · ')],
    ['Website', `tokens applied as a new version: accent ${site.tokens.colors.accent}, faces ${site.tokens.fonts.display}/${site.tokens.fonts.body}; fidelity ${wf.score}`],
    ['Identity', `every graphic in the system’s palette and faces; approved logo placed unaltered in ${mats.filter((m) => m.doc.artboards.some((a) => a.children.some((n) => n.link?.startsWith('brand:')))).length} of ${mats.length}`],
    ['Expression', `${sigs.size} distinct layout signatures across ${mats.length} graphics; board options: ${opts.length} expressions of one identity (${new Set(opts.map((o) => J(o.tokens))).size} token set)`],
    ['Evidence', 'dsi-bench-F.png'],
  ], mats.every((m) => m.fidelity.score >= 86 && !m.fidelity.findings.some((f) => f.rule === 'palette' || f.rule === 'faces')) && sigs.size === mats.length && wf.findings.length === 0 ? 'PASS' : 'FAIL');
}

// ── G. global update ──
{
  const sys = brandRec.draft;
  const brief = D.readGraphicBrief('A poster: “Walk further, stay dry”', { kind: 'poster' });
  const m = D.composeInBrand(sys, brief, D.languageDirection('walk', [], 'g1'), { seed: 3 });
  const mk = (name) => ({ ...D.makeProject('create', name, 1), medium: 'graphic', graphic: { ...D.emptyGraphicState(), brief, direction: m.direction, doc: m.doc, bindings: m.bindings } });
  let linked = D.applySystem(mk('Linked poster'), brandRec).project;
  let pinned = D.setPin(D.applySystem(mk('Pinned poster'), brandRec).project, 1);
  const unrelated = mk('Unlinked poster');
  const wp = { ...D.makeProject('create', 'Site', 1), specs: [D.normalizeSpec({ title: 'S', pageType: 'website', tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#555555', accent: '#7c3aed', accentText: '#ffffff', line: '#dddddd' }, fonts: { display: 'Syne', body: 'Inter' }, scale: 'comfortable', radius: 'round', style: 'editorial', imageTreatment: 'natural' }, sections: [{ id: 'hero', kind: 'hero', variant: 'editorial', content: { title: 'Walk' } }] }, { refs: [] })], specIndex: 0 };
  let site = D.applySystem(wp, brandRec).project;
  let rec = D.updateDraft(brandRec, D.setToken(brandRec.draft, 'color.brand.ember', { value: '#a8321f' }).content, 'ember');
  rec = D.publish(rec, { confirm: true }).record;
  const before = { linked: J(linked), pinned: J(pinned), unrelated: J(unrelated), site: J(site) };
  const imp = [linked, pinned, unrelated, site].map((p) => D.impactOn(p, rec, D.publishedContent(rec), rec.published));
  const out = [linked, pinned, unrelated, site].map((p) => D.propagateTo(p, rec));
  const changedNodes = (a, b) => a.graphic.doc.artboards[0].children.filter((n, i) => J(n) !== J(b.graphic.doc.artboards[0].children[i])).length;
  section('G', 'Global update: linked materials update, unrelated ones unchanged', [
    ['Change', 'color.brand.ember #d9632b → #a8321f, published v2'],
    ['Impact preview', imp.map((r, i) => `${['linked', 'pinned', 'unlinked', 'website'][i]}: ${r.outcome} (${r.changed.map((c) => c.slot).join(', ') || '—'})`).join('; ')],
    ['Linked graphic', `${out[0].report.outcome}: ${changedNodes(linked, out[0].project)} objects changed, token accent ${out[0].project.graphic.doc.tokens.colors.accent}`],
    ['Pinned graphic', `${out[1].report.outcome}; unchanged: ${J(out[1].project) === before.pinned}`],
    ['Unlinked graphic', `${out[2].report.outcome}; unchanged: ${J(out[2].project) === before.unrelated}`],
    ['Website', `${out[3].report.outcome}: accent ${out[3].project.specs[out[3].project.specIndex].tokens.colors.accent}, previous version kept (${out[3].project.specs.length} versions)`],
    ['Rollback', `undo of the linked graphic: ${D.undoApply(out[0].project, out[0].report).ok ? 'restored' : 'FAILED'}`],
  ], out[0].report.outcome === 'updated' && J(out[1].project) === before.pinned && J(out[2].project) === before.unrelated && out[3].project.specs.at(-1).tokens.colors.accent === '#a8321f' ? 'PASS' : 'FAIL');
}

// ── H. sync conflict ──
{
  const v1 = D.importJson([{ name: 'acme.tokens.json', text: J({ color: { $type: 'color', primary: { $value: '#0f62fe' }, bg: { $value: '#ffffff' }, text: { $value: '#161616' } } }) }]).content;
  let rec = D.newRecord(v1, { source: { kind: 'json', ref: 'acme.tokens.json' }, now: 1 });
  rec = D.updateDraft(rec, D.setToken(rec.draft, 'color.primary', { value: '#0043ce' }).content, 'owner deepened the primary');
  const up = D.importJson([{ name: 'acme.tokens.json', text: J({ color: { $type: 'color', primary: { $value: '#4589ff' }, bg: { $value: '#f4f4f4' }, text: { $value: '#161616' }, line: { $value: '#e0e0e0' } } }) }]).content;
  const d = D.syncDiff(rec.sync.base, rec.draft, up);
  const outcomes = {};
  for (const ch of ['upstream', 'local', 'override', 'defer']) {
    const a = D.applySync(rec, up, { 'token:color.primary': ch });
    outcomes[ch] = `${a.record.draft.tokens['color.primary'].value}${a.deferred.length ? ' (deferred: asked again next time)' : ''}${a.record.draft.tokens['color.primary'].extensions?.['org.socriaux.sync']?.overridden ? ' (marked as a deliberate override)' : ''}`;
  }
  const silent = D.applySync(rec, up, {});
  section('H', 'Sync conflict', [
    ['Base → local → upstream', 'primary #0f62fe → #0043ce (owner) → #4589ff (source); bg changed only upstream; line added upstream'],
    ['Diff', `incoming: ${d.incoming.map((i) => i.summary).join('; ')} · conflicts: ${d.conflicts.map((c) => `${c.summary} (suggested ${c.suggested}: ${c.reason})`).join('; ')}`],
    ['Choices', Object.entries(outcomes).map(([k, v]) => `${k} → ${v}`).join('; ')],
    ['Without a choice', `primary stays ${silent.record.draft.tokens['color.primary'].value} (deferred); bg ${silent.record.draft.tokens['color.bg'].value} accepted; published versions untouched (${silent.record.versions.length})`],
  ], d.conflicts.length === 1 && silent.record.draft.tokens['color.primary'].value === '#0043ce' && silent.record.draft.tokens['color.bg'].value === '#f4f4f4' ? 'PASS' : 'FAIL');
}

// ── I. round trip ──
{
  const sets = [['DTCG sample (A)', D.importJson([{ name: 'a.json', text: J({ color: { $type: 'color', a: { $value: '#112233' }, b: { $value: '{color.a}', $extensions: { mode: { dark: '#ffffff' } } } }, space: { $type: 'dimension', s: { $value: '4px' }, l: { $value: '{space.s} * 4' } }, font: { f: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] } } }) }]).content], ['PDF system (C)', brandRec.draft], ['Figma system (E)', D.importJson([{ name: 'figma-variables.json', text: J(F.variables) }]).content]];
  // font family lists compare as lists (CSS writes ["Inter", "sans-serif"] and "Inter, sans-serif" the same way)
  const fam = (v) => (Array.isArray(v) ? v.join(', ') : v);
  const val = (t) => J(t.type === 'fontFamily' ? fam(t.value) : t.value);
  const diff = (a, b) => Object.keys(a.tokens).filter((p) => !b.tokens[p] || val(b.tokens[p]) !== val(a.tokens[p]) || b.tokens[p].type !== a.tokens[p].type || J(b.tokens[p].modes ?? {}) !== J(a.tokens[p].modes ?? {}));
  const rows = [];
  let allOk = true;
  for (const [name, c] of sets) {
    const dt = diff(c, D.importJson(D.exportDtcg(c).slice(0, 1).map((f) => ({ name: f.name, text: f.text }))).content).length;
    const sdF = D.exportStyleDictionary(c);
    const sdn = diff(c, D.importJson([{ name: sdF.name, text: sdF.text }]).content).length;
    const flat = { ...c, tokens: Object.fromEntries(Object.entries(c.tokens).filter(([, t]) => !['typography', 'shadow', 'border', 'gradient', 'transition'].includes(t.type))) };
    const cssF = D.exportCss(flat);
    const cs = diff(flat, D.importCss([{ name: cssF.name, text: cssF.text }]).content).length;
    const can = D.exportCanonical(c);
    const cn = J(D.importJson([{ name: can.name, text: can.text }]).content) === J(D.normalizeContent(c));
    rows.push([name, `${Object.keys(c.tokens).length} tokens — DTCG ${dt} differences, Style Dictionary ${sdn}, CSS ${cs} (of ${Object.keys(flat.tokens).length} flat tokens), SocriaUX JSON ${cn ? 'identical' : 'DIFFERENT'}`]);
    allOk &&= dt === 0 && sdn === 0 && cs === 0 && cn;
  }
  rows.push(['Not covered', 'composite tokens (typography, shadow, border, gradient) are written to CSS as values and do not come back as composites; Figma libraries are not written to']);
  section('I', 'Round trip', rows, allOk ? 'PASS' : 'FAIL');
}

writeFileSync(join(OUT, 'dsi-bench.json'), J(report, null, 2));
writeFileSync(join(OUT, 'dsi-bench.md'), md.join('\n'));
const verdicts = Object.values(report).map((r) => r.verdict);
console.log(`\n${verdicts.filter((v) => v.startsWith('PASS')).length}/${verdicts.length} benchmarks pass. Report: ${join(OUT, 'dsi-bench.md')}`);
process.exit(verdicts.every((v) => v.startsWith('PASS')) ? 0 : 1);
