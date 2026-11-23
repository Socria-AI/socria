// SocriaUX Design System Intelligence — a design system imported, kept, governed and carried into every product, with
// identity fixed and expression free. Checked here by what it does, end to end, with no model and no network: the
// importers (JSON dialects, CSS, PDF guidelines, a website through an injected transport, Figma's API responses, assets,
// projects), the token engine (references, cycles, missing references, modes, layers, types), the SVG sanitizer and
// the website address guard, conflicts, the registry (drafts, publishing, versions, rollback), propagation through
// linked references only (websites, graphics, boards, logos), sync (manual and managed, three-way), export and round
// trips, brand intelligence (inferences never promoted silently), fidelity, and generation within a brand.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './.tmp/dsi-under-test.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'dsi');
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 700))));
const J = JSON.stringify;
const enc = (s) => new TextEncoder().encode(s);
const sec = (t) => console.log(`\n=== ${t} ===`);

// ── 1. JSON import ──
sec('1 JSON import: DTCG, Tokens Studio, Style Dictionary, plain, Figma variables, SocriaUX');
const dtcg = {
  color: {
    $type: 'color',
    $description: 'All colours',
    brand: { primary: { $value: '#0f62fe', $description: 'The brand blue' }, secondary: { $value: { colorSpace: 'oklch', components: [0.7, 0.15, 150] } } },
    neutral: { 0: { $value: '#ffffff' }, 900: { $value: '#161616' } },
    background: { $value: '{color.neutral.0}', $extensions: { mode: { dark: '{color.neutral.900}' } } },
    text: { $value: '{color.neutral.900}', $extensions: { mode: { dark: '{color.neutral.0}' }, 'com.vendor': { keep: true } } },
    action: { primary: { $value: '{color.brand.primary}' } },
  },
  space: { $type: 'dimension', base: { $value: { value: 8, unit: 'px' } }, lg: { $value: '{space.base} * 3' } },
  font: { family: { display: { $type: 'fontFamily', $value: ['Söhne', 'Helvetica', 'sans-serif'] }, body: { $type: 'fontFamily', $value: 'Inter' } }, weight: { bold: { $type: 'fontWeight', $value: 'bold' } } },
  type: { h1: { $type: 'typography', $value: { fontFamily: '{font.family.display}', fontSize: { value: 48, unit: 'px' }, fontWeight: 700, lineHeight: 1.1 } } },
  $metadata: { tool: 'test' },
};
const r1 = D.importJson([{ name: 'tokens.json', text: J(dtcg) }], { now: 1 });
ok('DTCG: read as DTCG, every token kept', r1.format === 'dtcg' && Object.keys(r1.content.tokens).length === 13, J(Object.keys(r1.content.tokens)));
ok('DTCG: group $type inherited, $description kept', r1.content.tokens['color.brand.primary'].type === 'color' && r1.content.tokens['color.brand.primary'].description === 'The brand blue' && r1.content.groups.color?.description === 'All colours');
ok('DTCG: references kept as references', r1.content.tokens['color.action.primary'].value === '{color.brand.primary}');
ok('DTCG: colour objects kept losslessly (oklch)', r1.content.tokens['color.brand.secondary'].value === 'oklch(0.7 0.15 150)' && D.hexOf('oklch(0.7 0.15 150)') === '#4cb86a', r1.content.tokens['color.brand.secondary'].value);
ok('DTCG: dimension objects read as CSS text', r1.content.tokens['space.base'].value === '8px');
ok('DTCG: weight names read as numbers', r1.content.tokens['font.weight.bold'].value === 700);
ok('DTCG: modes from $extensions, the default named light', J(r1.content.modes) === J(['light', 'dark']) && r1.content.tokens['color.background'].modes.dark === '{color.neutral.900}');
ok('DTCG: unknown $extensions kept on the token', r1.content.tokens['color.text'].extensions?.['com.vendor']?.keep === true);
ok('DTCG: unknown root metadata kept, not discarded', J(r1.content.unknown).includes('"tool":"test"'));
ok('provenance: source, property, import time, original value, status, confidence', (() => { const p = r1.content.tokens['color.brand.primary'].provenance; return p.source.kind === 'json' && p.source.property === 'color.brand.primary' && p.importedAt === 1 && p.original === '#0f62fe' && p.status === 'imported' && p.confidence === 1; })());
const ts = { $themes: [{ name: 'Light', selectedTokenSets: { core: 'source', light: 'enabled' } }, { name: 'Dark', selectedTokenSets: { core: 'source', dark: 'enabled' } }], $metadata: { tokenSetOrder: ['core', 'light', 'dark'] }, core: { blue: { value: '#2563eb', type: 'color' }, gap: { value: '12', type: 'spacing' }, lh: { value: '150%', type: 'lineHeights' } }, light: { bg: { value: '#ffffff', type: 'color' }, fg: { value: '{blue}', type: 'color' } }, dark: { bg: { value: '#0b0b0b', type: 'color' }, fg: { value: '#93c5fd', type: 'color' } } };
const r2 = D.importJson([{ name: 'tokens-studio.json', text: J(ts) }]);
ok('Tokens Studio: themes as modes (light default, dark mode)', r2.format === 'tokens-studio' && J(r2.content.modes) === J(['light', 'dark']) && r2.content.tokens.bg.value === '#ffffff' && r2.content.tokens.bg.modes?.dark === '#0b0b0b', J({ m: r2.content.modes, bg: r2.content.tokens.bg }));
ok('Tokens Studio: unitless spacing read as px, line height % as a fraction', r2.content.tokens.gap.value === '12px' && r2.content.tokens.lh.value === 1.5);
const sd = { color: { base: { red: { value: '#e11d48', comment: 'Alert red' } }, alias: { alert: { value: '{color.base.red.value}' } } }, size: { font: { small: { value: '0.75' } } } };
const r3 = D.importJson([{ name: 'style-dictionary.json', text: J(sd) }]);
ok('Style Dictionary: {path.value} references canonicalised; comments as descriptions', r3.format === 'style-dictionary' && r3.content.tokens['color.alias.alert'].value === '{color.base.red}' && r3.content.tokens['color.base.red'].description === 'Alert red');
ok('Style Dictionary: unitless sizes read as rem, said as an inference', r3.content.tokens['size.font.small'].value === '0.75rem' && r3.notes.some((n) => /rem/.test(n)));
const r4 = D.importJson([{ name: 'plain.json', text: J({ primary: '#7c3aed', 'text-color': '#111111', spacing: { sm: '4px' } }) }]);
ok('plain map: types inferred from names and values, marked inferred', r4.format === 'plain' && r4.content.tokens.primary.type === 'color' && r4.content.tokens['spacing.sm'].type === 'dimension' && r4.content.tokens.primary.provenance.status === 'inferred');
const bad = D.importJson([{ name: 'broken.json', text: '{\n  "color": {\n    "a": "#fff",\n  }\n}' }]);
ok('invalid JSON: refused with its line and column and a fix', bad.issues.some((i) => i.severity === 'error' && i.line >= 1 && i.fix), J(bad.issues));
const dotted = D.importJson([{ name: 'tw.json', text: J({ space: { '1.5': { $value: '6px', $type: 'dimension' } }, gap: { $value: '{space.1.5}', $type: 'dimension' } }) }]);
ok('a name with a dot is renamed, and references to it follow', !!dotted.content.tokens['space.1-5'] && dotted.content.tokens.gap.value === '{space.1-5}', J(Object.keys(dotted.content.tokens)));
const proto = D.importJson([{ name: 'p.json', text: '{"__proto__": {"polluted": {"$value": "#000000"}}, "color": {"ok": {"$value": "#111111"}}}' }]);
ok('prototype keys never become tokens (no pollution)', !Object.keys(proto.content.tokens).some((p) => /proto/.test(p)) && ({}).polluted === undefined);

// ── 2. CSS import ──
sec('2 CSS custom properties');
const css = `@import url("https://evil.example/x.css");
:root { --color-brand-primary: #c2410c; --color-bg: #fafaf9; --color-text: #1c1917; --space-base: 4px; --space-lg: calc(var(--space-base) * 4); --font-display: "Instrument Serif", serif; --link: var(--color-brand-primary); --x: var(--undefined, 12px); --weight-bold: 700; }
@media (prefers-color-scheme: dark) { :root { --color-bg: #0c0a09; --color-text: #fafaf9; } }
[data-theme="dark"] { --color-brand-primary: #fb923c; }
.button { --button-pad: 12px; padding: var(--button-pad); }
@property --brand-angle { syntax: '<number>'; inherits: false; initial-value: 45; }`;
const c1 = D.importCss([{ name: 'tokens.css', text: css }]);
ok('CSS: variables become tokens, :root the default mode, themes and media queries the dark mode', J(c1.content.modes) === J(['light', 'dark']) && c1.content.tokens['color.bg'].modes.dark === '#0c0a09' && c1.content.tokens['color.brand.primary'].modes.dark === '#fb923c');
ok('CSS: var() is a reference; calc() over variables is token maths', c1.content.tokens.link.value === '{color.brand.primary}' && D.resolveToken(c1.content, 'space.lg').value === '16px');
ok('CSS: an undefined var() with a fallback takes the fallback, said', c1.content.tokens.x.value === '12px' && c1.notes.some((n) => /--undefined/.test(n)));
ok('CSS: @property gives an explicit type; numbers stay numbers', c1.content.tokens['brand.angle'].type === 'number' && c1.content.tokens['brand.angle'].provenance.status === 'imported' && c1.content.tokens['weight.bold'].value === 700);
ok('CSS: inferred semantics marked inferred (types read from names and values)', c1.content.tokens['color.bg'].provenance.status === 'inferred' && /inferred/.test(c1.content.tokens['color.bg'].provenance.note));
ok('CSS: component-scoped variables kept unread, not discarded', J(c1.content.unknown['css.scoped']).includes('--button-pad'));
ok('CSS: @import listed, never fetched', c1.notes.some((n) => /listed, not fetched/.test(n)));
ok('CSS: provenance carries the file, selector and line', c1.content.tokens['color.bg'].provenance.source.selector === ':root' && c1.content.tokens['color.bg'].provenance.source.line === 2);
const sheet = D.parseCss('a{color:red;background:url("data:image/png;base64,AA;BB")} .x{ &:hover{color:blue} margin:0 } /* } { */ b{}');
ok('CSS parsing: semicolons inside url() and comments do not break rules; nesting flattened', sheet.rules.some((r) => r.decls.some((d) => d.prop === 'background' && d.value.includes('AA;BB'))) && sheet.rules.some((r) => r.selectors.includes('.x:hover')) && sheet.rules.some((r) => r.selectors.includes('.x') && r.decls.some((d) => d.prop === 'margin')));

// ── 3. normalization ──
sec('3 normalization');
const n1 = D.normalizeContent(r1.content);
ok('normalizeContent is idempotent', J(D.normalizeContent(n1)) === J(n1));
const evilContent = D.normalizeContent({ tokens: { 'a.b': { path: 'a.b', type: 'color', value: '#fff' }, '{bad}': { path: '{bad}', type: 'color', value: '#000' }, 'x.__proto__': { path: 'x.__proto__', type: 'color', value: '#000' } }, assets: [{ id: 'z', format: 'svg', svg: '<svg onload="x()"></svg>', hash: 'a'.repeat(64) }] });
ok('normalization drops unusable paths, prototype keys and unsafe stored SVG', Object.keys(evilContent.tokens).length === 1 && !evilContent.assets.length);

// ── 4–6. references, cycles, missing references ──
sec('4–6 references, cycles, missing references');
const chain = D.resolveToken(r1.content, 'color.action.primary');
ok('a reference chain resolves, with the chain said', chain.ok && chain.value === '#0f62fe' && J(chain.chain) === J(['color.action.primary', 'color.brand.primary']));
const typo = D.resolveToken(r1.content, 'type.h1');
ok('references inside composites resolve with their field types', typo.ok && typo.value.fontFamily.join?.(',') === 'Söhne,Helvetica,sans-serif' && typo.value.fontSize === '48px', J(typo));
const cyc = D.importJson([{ name: 'c.json', text: J({ a: { $type: 'color', x: { $value: '{a.y}' }, y: { $value: '{a.z}' }, z: { $value: '{a.x}' } } }) }]);
const cycIssues = cyc.issues.filter((i) => /cycle/i.test(i.message));
ok('a cycle is found once, named token by token', cycIssues.length === 1 && /a\.x → a\.y → a\.z → a\.x|a\.y → a\.z → a\.x → a\.y|a\.z → a\.x → a\.y → a\.z/.test(cycIssues[0].message), J(cyc.issues));
const miss = D.importJson([{ name: 'm.json', text: J({ c: { $type: 'color', a: { $value: '{c.nope}' } } }) }]);
ok('a missing reference is said with what to do', miss.issues.some((i) => /c\.a refers to \{c\.nope\}, which does not exist/.test(i.message) && i.fix));
const wrongType = D.importJson([{ name: 't.json', text: J({ s: { $type: 'dimension', $value: '4px' }, c: { $type: 'color', $value: '{s}' } }) }]);
ok('a reference to a token of another type is refused, saying so', wrongType.issues.some((i) => /is a color but refers to \{s\}, a dimension/.test(i.message)), J(wrongType.issues));
const badExpr = D.importJson([{ name: 'e.json', text: J({ a: { $type: 'dimension', $value: '4px' }, b: { $type: 'dimension', $value: '{a} + 2em' } }) }]);
ok('token maths with mismatched units is refused, saying why', badExpr.issues.some((i) => /does not compute/.test(i.message)));
ok('the arithmetic evaluator is safe and exact', D.evaluate('(16px + 8px) / 2') === '12px' && D.evaluate('2 * 3') === 6 && D.evaluate('alert(1)') === null && D.evaluate('4px * 2px') === null);

// ── 7. themes and modes ──
sec('7 modes');
ok('a mode resolves through references in that mode', D.resolveToken(r1.content, 'color.background', { mode: 'dark' }).value === '#161616');
const fb = D.resolveToken({ ...r1.content, tokens: { ...r1.content.tokens, 'color.solo': { path: 'color.solo', type: 'color', value: '#123456', modes: { 'high-contrast': '#000000' }, provenance: r1.content.tokens['color.text'].provenance } }, modes: ['light', 'dark', 'high-contrast'] }, 'color.solo', { mode: 'dark' });
ok('a token without a value for a mode falls back to the default, said', fb.ok && fb.value === '#123456' && fb.fellBack === true);

// ── 8. typography ──
sec('8 typography');
ok('font families, weights and composite styles typed', r1.content.tokens['font.family.display'].type === 'fontFamily' && r1.content.tokens['type.h1'].type === 'typography');
ok('roles bind display and body faces', r1.content.roles.display?.path === 'font.family.display' && r1.content.roles.body?.path === 'font.family.body');
const pal = D.productPalette(r1.content);
ok('a face SocriaUX cannot serve is drawn with the closest it can, said', pal.families.find((f) => f.role === 'display').family === 'Söhne' && pal.families.find((f) => f.role === 'display').standIn === 'Inter');

// ── 9–10. assets and SVG ──
sec('9–10 assets and SVG sanitization');
const evil = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 40" onload="alert(1)"><style>.a{fill:#e30613} .b{fill:url(https://evil.example/x.svg#p)} @import url(https://evil.example/x.css);</style><script>alert(1)</script><foreignObject><div>x</div></foreignObject><a href="javascript:alert(1)"><path class="a" d="M0 0h40v40H0z" onclick="x()"/></a><use xlink:href="https://evil.example/s.svg#x"/><use xlink:href="#p1"/><path id="p1" fill="#111" d="M50 0h20v40H50z" style="fill:#111;behavior:url(x.htc)"/><image href="https://evil.example/t.png" width="10" height="10"/></svg>`;
const s1 = D.sanitizeSvg(evil);
ok('SVG: scripts, handlers, foreign objects, external references and unsafe styles removed', !/script|onload|onclick|foreignObject|evil\.example|javascript|behavior|@import/i.test(s1.svg), s1.svg);
ok('SVG: the drawing survives (a link unwrapped, local references kept, styles kept)', /class="a"/.test(s1.svg) && /xlink:href="#p1"/.test(s1.svg) && /\.a\{fill:#e30613\}/.test(s1.svg));
ok('SVG: what was removed is said', s1.removed.some((r) => /script/.test(r)) && s1.removed.some((r) => /event handler/.test(r)));
let entityRefused = false;
try {
  D.sanitizeSvg('<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg>&a;</svg>');
} catch (e) {
  entityRefused = /entities/.test(e.message);
}
ok('SVG: entity declarations refused outright', entityRefused);
const logoAsset = (await D.importAsset({ name: 'acme-logo.svg', bytes: enc(evil) })).asset;
ok('an SVG logo arrives unapproved, hashed, with its role read from its name', logoAsset.kind === 'logo' && logoAsset.role === 'primary' && !logoAsset.approved && /^[0-9a-f]{64}$/.test(logoAsset.hash));
const png1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const small = await D.importAsset({ name: 'logo-small.png', bytes: png1, mime: 'image/png' });
ok('a tiny raster logo is a reference, not a master, and cannot be approved', small.asset.lowRes === true && D.approveAsset(small.asset, true).approved === false);
const lie = await D.importAsset({ name: 'logo.png', bytes: enc('<html><script>x</script></html>'), mime: 'image/png' });
ok('a file is judged by its bytes, not its name or claimed type', !lie.asset && /not a file SocriaUX keeps/.test(lie.error));
ok('sniffing: PNG, JPEG, WebP, fonts by their signatures', D.sniff(png1) === 'png' && D.sniff(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])) === 'jpeg' && D.sniff(enc('RIFF0000WEBPVP8 ')) === 'webp' && D.sniff(enc('wOF2abcd')) === 'woff2' && D.sniff(Uint8Array.from([0, 1, 0, 0, 0, 0])) === 'ttf');
ok('an approved logo is protected', D.approveAsset(logoAsset, true).protected === true);

// ── 11. PDF guidelines ──
sec('11 brand guidelines (PDF)');
const pdfBytes = new Uint8Array(readFileSync(join(FIX, 'ferrowmoor-guidelines.pdf')));
const pdf = await D.importPdf({ name: 'ferrowmoor-guidelines.pdf', bytes: pdfBytes });
const pc = pdf.content;
ok('PDF: the brand named from the cover', pc.identity.name === 'Ferrowmoor', pc.identity.name);
ok('PDF: colours stated with HEX are explicit, with their page', pc.tokens['color.brand.moor-green'].value === '#2f4a3a' && pc.tokens['color.brand.moor-green'].provenance.status === 'imported' && pc.tokens['color.brand.moor-green'].provenance.source.page === 4);
ok('PDF: a colour given only in print values is read from its drawn swatch, labelled extracted', pc.tokens['color.brand.lichen'].value === '#8a9a8c' && pc.tokens['color.brand.lichen'].provenance.status === 'inferred' && /swatch/.test(pc.tokens['color.brand.lichen'].provenance.note));
ok('PDF: print values kept as stated (CMYK, Pantone), never claimed as output', pc.tokens['color.brand.moor-green'].extensions['org.socriaux.print'].pantone === '5605 C');
ok('PDF: typefaces with their use and weight', pc.tokens['font.family.display'].value === 'Fraunces' && pc.tokens['font.family.body'].value === 'Inter' && pc.tokens['font.weight.display'].value === 600);
ok('PDF: the type scale read from pt', pc.tokens['font.size.h1'].value === '64px' && /48pt/.test(pc.tokens['font.size.h1'].provenance.note));
ok('PDF: roles the guidelines name are confirmed', pc.roles.accent.path === 'color.brand.ember' && pc.roles.accent.status === 'confirmed' && pc.roles.background.path === 'color.brand.oat');
const pdfRules = pc.intelligence;
ok('PDF: rules with machine checks, worded rules hard', pdfRules.some((i) => i.check?.kind === 'logo-clear-space' && i.check.ratio === 0.5 && i.enforce === 'hard') && pdfRules.some((i) => i.check?.kind === 'logo-min-size' && i.check.px === 24) && pdfRules.some((i) => i.check?.kind === 'no-gradients' && i.enforce === 'hard'));
ok('PDF: a description is a preference, not a rule', pdfRules.find((i) => /single accent/.test(i.statement))?.enforce === 'soft');
ok('PDF: personality, tone, imagery and layout statements, each with page and words', ['personality', 'tone', 'imagery', 'composition', 'motif'].every((k) => pdfRules.some((i) => i.kind === k && i.evidence[0].source.page && i.evidence[0].quote)));
ok('PDF: every statement from the document is confirmed (explicit), nothing invented', pdfRules.every((i) => i.basis === 'explicit' && i.status === 'confirmed'));
ok('PDF: a non-PDF is refused by its bytes', (await D.importPdf({ name: 'x.pdf', bytes: enc('hello') })).issues.some((i) => /not a PDF/.test(i.message)));

// ── 12–13. website extraction and URL security ──
sec('12–13 website extraction and address security');
const html = readFileSync(join(FIX, 'site', 'index.html'), 'utf8');
const siteCss = readFileSync(join(FIX, 'site', 'site.css'), 'utf8');
const served = { 'https://larkfield.example/': { type: 'text/html; charset=utf-8', body: html }, 'https://larkfield.example/assets/site.css': { type: 'text/css', body: siteCss } };
const asked = [];
const fetcher = async (url, init) => {
  asked.push(url);
  ok(`fetch ${url}: redirects by hand, no credentials sent`, init.redirect === 'manual' && !init.headers.cookie && !init.headers.authorization);
  const s = served[url];
  return s ? new Response(s.body, { status: 200, headers: { 'content-type': s.type } }) : new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
};
const publicDns = async () => [{ address: '93.184.215.14', family: 4 }];
const site = await D.extractSite('https://larkfield.example/', { fetcher, resolver: publicDns, now: 5 });
ok('website: page and named stylesheet fetched, nothing else (no scripts, no @import, no crawling)', site.ok && J(asked) === J(['https://larkfield.example/', 'https://larkfield.example/assets/site.css']), J(asked));
const st = site.result.content;
ok('website: CSS variables read as tokens, every one inferred', st.tokens['color.crust']?.value === '#b4532a' && Object.values(st.tokens).every((t) => t.provenance.status === 'inferred'));
ok('website: observed values reconstructed (body colours, heading face, button colour)', st.tokens['font.family.display']?.value === 'Fraunces' && !!st.tokens['color.site.accent']);
ok('website: the dark scheme read as a mode', st.modes.includes('dark'));
ok('website: an inline SVG logo found, sanitized, unapproved', site.assets.length === 1 && site.assets[0].kind === 'logo' && !site.assets[0].approved);
ok('website: said to be a reconstruction, not an authoritative import', site.result.notes.some((n) => /reconstruction|reading of it/.test(n)) && Object.values(st.roles).every((b) => b.status === 'inferred'));
ok('address: only public http(s) on standard ports, no credentials', D.checkUrl('https://example.com').ok && !D.checkUrl('ftp://example.com').ok && !D.checkUrl('https://user:pw@example.com').ok && !D.checkUrl('https://example.com:8080').ok && !D.checkUrl('file:///etc/passwd').ok);
ok('address: localhost, .local, .internal and single-label names refused', ['http://localhost', 'http://foo.localhost', 'http://printer.local', 'http://db.internal', 'http://intranet'].every((u) => !D.checkUrl(u).ok));
ok('address: private and reserved IP literals refused', ['http://127.0.0.1', 'http://10.0.0.1', 'http://192.168.1.1', 'http://169.254.169.254', 'http://[::1]', 'http://[fd00::1]', 'http://0.0.0.0'].every((u) => !D.checkUrl(u).ok));
ok('IP ranges: private, loopback, link-local, CGNAT, documentation, multicast, reserved and mapped IPv6 refused', ['10.1.2.3', '172.16.0.1', '192.168.0.1', '127.0.0.1', '169.254.1.1', '100.64.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2002:7f00:1::', '2001:db8::1', '::'].every((ip) => !D.isPublicIp(ip)) && ['93.184.215.14', '8.8.8.8', '2606:4700::1111'].every((ip) => D.isPublicIp(ip)));
const privDns = async () => [{ address: '93.184.215.14', family: 4 }, { address: '10.0.0.5', family: 4 }];
const rebind = await D.extractSite('https://evil.example/', { fetcher, resolver: privDns });
ok('a name resolving to any private address is refused before fetching', !rebind.ok && /private or reserved/.test(rebind.error));
const redirector = async (url) => (url === 'https://hop.example/' ? new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }) : new Response('x', { status: 200, headers: { 'content-type': 'text/html' } }));
const redir = await D.extractSite('https://hop.example/', { fetcher: redirector, resolver: publicDns });
ok('a redirect to a private address is refused (each hop checked again)', !redir.ok && /private or reserved/.test(redir.error), J(redir));
const loop = await D.extractSite('https://loop.example/', { fetcher: async () => new Response('', { status: 301, headers: { location: 'https://loop.example/' } }), resolver: publicDns });
ok('too many redirects refused', !loop.ok && /too many/.test(loop.error));
const huge = await D.extractSite('https://big.example/', { fetcher: async () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 40; i++) c.enqueue(new Uint8Array(100_000)); c.close(); } }), { status: 200, headers: { 'content-type': 'text/html' } }), resolver: publicDns });
ok('an answer larger than the cap is cut off while it streams', !huge.ok && /too large/.test(huge.error));
const wrongType2 = await D.extractSite('https://bin.example/', { fetcher: async () => new Response('x', { status: 200, headers: { 'content-type': 'application/octet-stream' } }), resolver: publicDns });
ok('a page that is not HTML is refused', !wrongType2.ok && /not what was expected/.test(wrongType2.error));
const lookup = D.guardedLookup(async () => [{ address: '127.0.0.1', family: 4 }]);
const lookedUp = await new Promise((res) => lookup('rebind.example', { all: true }, (err) => res(err)));
ok('the connect-time lookup refuses a private address (DNS rebinding)', lookedUp && lookedUp.code === 'EBLOCKED');

// ── 14. Figma ──
sec('14 Figma mapping');
const F = await import('./fixtures/dsi/figma.mjs');
const fv = D.mapFigmaVariables(F.variables.meta, { fileKey: F.FILE_KEY, version: '4211', now: 1 });
ok('Figma: every variable a token; collection modes as modes', Object.keys(fv.content.tokens).length === 9 && J(fv.content.modes) === J(['light', 'dark']));
ok('Figma: aliases as references; mode values kept', fv.content.tokens['color.background.default'].value === '{gray.0}' && fv.content.tokens['color.background.default'].modes.dark === '{gray.900}');
ok('Figma: scopes give types (corner radius → dimension, font family)', fv.content.tokens['radius.md'].type === 'dimension' && fv.content.tokens['radius.md'].value === '8px' && fv.content.tokens['font.family.sans'].type === 'fontFamily');
ok('Figma: source mappings kept (file, variable, collection, mode, version)', (() => { const s = fv.content.tokens['color.action.primary'].provenance.source; return s.kind === 'figma' && s.ref === F.FILE_KEY && s.variableId === 'VariableID:2:4' && s.collectionId === 'VariableCollectionId:2:1' && s.mode === 'Light' && s.version === '4211'; })());
ok('Figma: a variable from another library is said, not invented', fv.issues.some((i) => /another library/.test(i.message)) && /figma-remote/.test(fv.content.tokens['color.border.subtle'].value));
const fs1 = D.mapFigmaStyles(F.file, F.nodes, { fileKey: F.FILE_KEY, version: '4211' });
ok('Figma styles: fill, text (with its family as a token), shadow and grid', fs1.tokens['color.Brand.Signal']?.value === '#ef4423' && fs1.tokens['typography.Heading.Large']?.value.fontFamily === '{font.family.ibm-plex-sans}' && fs1.tokens['shadow.Elevation.Raised']?.type === 'shadow' && fs1.tokens['grid.Layout.Desktop.columns']?.value === 12, J(Object.keys(fs1.tokens)));
const comps = D.mapFigmaComponents(F.file, { fileKey: F.FILE_KEY });
ok('Figma components: a component set with its variants and properties, as definitions', comps.some((c) => c.name === 'Button' && c.variants.length === 3 && c.properties.some((p) => p.name === 'Size' && p.options.includes('Large'))));
ok('Figma: logo-named nodes found for SVG export', D.logoNodeIds(F.file).some((x) => x.id === '20:1'));
const figCalls = [];
const figFetch = async (url, init) => {
  figCalls.push({ url, token: init.headers?.['X-Figma-Token'] });
  if (url.includes('/variables/local')) return new Response(J(F.variables), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.includes('/nodes?')) return new Response(J(F.nodes), { status: 200 });
  if (url.includes('/v1/images/')) return new Response(J(F.images), { status: 200 });
  if (url.startsWith('https://figma-alpha-api.s3')) return new Response(F.logoSvg, { status: 200, headers: { 'content-type': 'image/svg+xml' } });
  if (url.includes('/v1/files/')) return new Response(J(F.file), { status: 200 });
  return new Response('', { status: 404 });
};
const ff = await D.fetchFigmaFile(F.FILE_KEY, 'figd_test_token_000000000000', { fetcher: figFetch, now: 1 });
ok('Figma file: variables, styles, components and the logo through the API; the token only to api.figma.com', ff.ok && Object.keys(ff.content.content.tokens).length >= 13 && ff.assets.length === 1 && figCalls.filter((c) => c.token).every((c) => c.url.startsWith('https://api.figma.com/')) && !figCalls.some((c) => c.url.startsWith('https://figma-alpha') && c.token));
const ff403 = await D.fetchFigmaFile(F.FILE_KEY, 'figd_test_token_000000000000', { fetcher: async (url, init) => (url.includes('/variables/local') ? new Response('', { status: 403 }) : figFetch(url, init)) });
ok('Figma: variables refused (not Enterprise) → styles still come, and that is said', ff403.ok && ff403.content.issues.some((i) => /Enterprise/.test(i.message)) && Object.keys(ff403.content.content.tokens).length >= 4);
const ffBad = await D.fetchFigmaFile(F.FILE_KEY, 'figd_test_token_000000000000', { fetcher: async () => new Response('', { status: 403 }) });
ok('Figma: a refused token is said plainly, nothing fabricated', !ffBad.ok && /refused the token/.test(ffBad.error));
ok('Figma: file keys read from links; tokens checked before sending', D.figmaKey('https://www.figma.com/design/AbC123dEf456GhI789/Aster?node-id=1') === F.FILE_KEY && D.figmaKey('https://evil.example/design/AbC123dEf456GhI789') === null && !D.tokenOk('short') && !D.tokenOk('has space in it but long enough xx'));
const figJson = D.importJson([{ name: 'figma-variables.json', text: J(F.variables) }]);
ok('a Figma variables JSON export imports through the same mapping', figJson.format === 'figma-variables' && Object.keys(figJson.content.tokens).length === 9);

// ── 15. previews ──
sec('15 previews and roles');
const cen = D.census(r1.content);
ok('the census counts by category, aliases and modes', cen.total === 13 && cen.aliases >= 3 && cen.modes === 2 && cen.byTop.colour >= 6);
ok('roles inferred with confidence and a reason; semantic before primitive', r1.content.roles.background.path === 'color.background' && r1.content.roles.accent.path === 'color.action.primary' && r1.content.roles.accent.status === 'inferred' && r1.content.roles.accent.why);
ok('a role nothing fits is left unbound for products to derive, never invented in the system', !r1.content.roles.line && D.productPalette(r1.content).derived.some((d) => /Lines/.test(d)));

// ── 16. conflicts ──
sec('16 conflicts');
let rec = D.newRecord(pc, { now: 10 });
const inc = D.importJson([{ name: 'b.json', text: J({ color: { $type: 'color', brand: { ember: { $value: '#ff8800' }, sky: { $value: '#00aaff' } } } }) }]).content;
const plan = D.planMerge(rec.draft, inc);
ok('conflicts found per token with options and a suggestion with its reason', plan.conflicts.some((c) => c.id === 'token:color.brand.ember' && c.options.includes('rename') && c.suggested === 'replace' && c.reason) && plan.added.tokens.includes('color.brand.sky'));
const edited = D.updateDraft(rec, D.setToken(rec.draft, 'color.brand.ember', { value: '#cc5522' }).content, 'edit');
ok('a value the owner edited is suggested to be kept', D.planMerge(edited.draft, inc).conflicts.find((c) => c.id === 'token:color.brand.ember').suggested === 'keep');
const renamed = D.applyMerge(rec.draft, { ...inc, tokens: { ...inc.tokens, 'color.alias.hot': { ...inc.tokens['color.brand.sky'], path: 'color.alias.hot', value: '{color.brand.ember}' } } }, { 'token:color.brand.ember': 'rename' });
ok('rename keeps both and rewrites the incoming references', renamed.content.tokens['color.brand.ember'].value === '#d9632b' && renamed.content.tokens['color.brand.ember-imported'].value === '#ff8800' && renamed.content.tokens['color.alias.hot'].value === '{color.brand.ember-imported}');
const approvedLogo = D.approveAsset({ ...logoAsset, role: 'primary' }, true);
const withLogo = { ...rec.draft, assets: [approvedLogo] };
const newLogo = (await D.importAsset({ name: 'other-logo.svg', bytes: enc('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>') })).asset;
const lp = D.planMerge(withLogo, { ...inc, assets: [newLogo] });
const lc = lp.conflicts.find((c) => c.kind === 'asset');
ok('an approved logo is never replaced by default: the new one is kept beside it', lc && lc.suggested === 'rename' && D.applyMerge(withLogo, { ...inc, assets: [newLogo] }).content.assets.find((a) => a.id === approvedLogo.id));
const two = D.combineSources([D.importJson([{ name: 'a.json', text: J({ c: { $type: 'color', $value: '#111111' } }) }]).content, D.importCss([{ name: 'b.css', text: ':root{--c:#222222}' }]).content]);
ok('two sources that disagree: the first leads unless the owner chooses', two.conflicts.length === 1 && two.content.tokens.c.value === '#111111' && D.combineSources([D.importJson([{ name: 'a.json', text: J({ c: { $type: 'color', $value: '#111111' } }) }]).content, D.importCss([{ name: 'b.css', text: ':root{--c:#222222}' }]).content], { 'token:c': 'replace' }).content.tokens.c.value === '#222222');

// ── 17–19. persistence, versions, rollback ──
sec('17–19 registry: persistence, versions, rollback');
const stored = JSON.parse(J(rec));
ok('a record survives storage and normalization (idempotent)', J(D.normalizeRecord(D.normalizeRecord(stored))) === J(D.normalizeRecord(stored)));
ok('a record without a valid id is refused', D.normalizeRecord({ id: 'x' }) === null);
let pub = D.publish(rec, { now: 20 });
ok('publishing asks for review first (the owner confirms)', pub.needsConfirmation === true && !pub.version);
pub = D.publish(rec, { now: 20, confirm: true });
rec = pub.record;
ok('published v1, the audit says so', rec.published === 1 && rec.audit.some((a) => a.action === 'published'));
ok('nothing changed: nothing to publish', /Nothing has changed/.test(D.publish(rec, { confirm: true }).error));
const broken = D.updateDraft(rec, D.setToken(rec.draft, 'color.brand.oat', { value: '{color.brand.nope}' }).content, 'break');
ok('a draft with errors cannot be published', /must be fixed/.test(D.publish(broken, { confirm: true }).error));
rec = D.updateDraft(rec, D.setToken(rec.draft, 'color.brand.ember', { value: '#c0392b' }).content, 'deeper ember', { now: 30 });
ok('a draft never reaches products: published content unchanged', D.publishedContent(rec).tokens['color.brand.ember'].value === '#d9632b' && D.draftChanges(rec).length === 1);
rec = D.publish(rec, { now: 40, confirm: true }).record;
rec = D.rollback(rec, 1, { now: 50 }).record;
ok('rollback publishes the earlier version as a new one; history kept', rec.versions.length === 3 && rec.versions[2].label === 'Rollback to v1' && D.publishedContent(rec).tokens['color.brand.ember'].value === '#d9632b' && rec.audit.some((a) => a.action === 'rolled-back'));
ok('versions compare change by change', D.compareVersions(rec, 1, 2).some((c) => c.key === 'color.brand.ember'));
const dup = D.duplicateRecord(rec);
ok('duplicate: a new id, its own history', dup.id !== rec.id && dup.versions.length === 0 && dup.audit[0].action === 'duplicated');
ok('archive keeps projects’ versions and clears the default', D.archiveRecord({ ...rec, isDefault: true }, true).isDefault === false);
ok('ownership: the application’s single-owner model', D.canEdit({ ...rec, owner: 'user_a' }, 'user_a') && !D.canEdit({ ...rec, owner: 'user_a' }, 'user_b') && D.canEdit({ ...rec, owner: null }, null));

// ── 20. overrides ──
sec('20 overrides and governance');
const layered = D.resolveToken(r1.content, 'color.action.primary', { layers: [{ level: 'project', overrides: { 'color.brand.primary': '#ff0000' } }, { level: 'material', overrides: { 'color.brand.primary': '#00ff00' } }, { level: 'object', overrides: { 'color.brand.primary': '#0000ff' } }] });
ok('precedence: object over material over project over system', layered.value === '#0000ff');
ok('a project override reaches what refers to the token', D.resolveToken(r1.content, 'color.action.primary', { layers: [{ level: 'project', overrides: { 'color.brand.primary': '#ff0000' } }] }).value === '#ff0000');
const gov = { ...r1.content, governance: { ...r1.content.governance, locked: ['color.brand.*'], overridable: { project: ['color.*'], material: ['color.background'], object: ['*'] } } };
ok('a locked token can never be overridden', !D.canOverride(gov, 'project', 'color.brand.primary').ok && /locked/.test(D.canOverride(gov, 'project', 'color.brand.primary').why));
ok('overrides only where governance allows', D.canOverride(gov, 'material', 'color.background').ok && !D.canOverride(gov, 'material', 'color.text').ok);
ok('adapters apply only allowed project overrides', D.productPalette(gov, { overrides: { 'color.brand.primary': '#ff0000', 'color.background': '#000000' } }).colors.background === '#000000' && D.productPalette(gov, { overrides: { 'color.brand.primary': '#ff0000' } }).colors.accent === '#0f62fe');

// ── 21–22. propagation and logos ──
sec('21 propagation through linked references; 27 logos');
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"><path fill="#2f4a3a" d="M10 70 L40 10 L70 70 Z"/><path fill="#d9632b" d="M30 70 Q40 40 50 70 Z"/></svg>`;
const fLogo = D.approveAsset((await D.importAsset({ name: 'ferrowmoor-logo.svg', bytes: enc(logoSvg) })).asset, true);
let brand = D.newRecord(D.analyzeBrand({ ...pc, assets: [fLogo] }), { now: 100 });
brand = D.publish(brand, { now: 101, confirm: true }).record;
const brief = D.readGraphicBrief('A poster for the autumn walking season: “Walk further, stay dry”', { kind: 'poster' });
const base = D.languageDirection(brief.purpose || brief.content.headline, brief.mood, 's1');
const comp = D.composeInBrand(brand.draft, brief, base, { seed: 7, name: 'Poster' });
ok('generated in the brand: palette, faces and the approved logo; fidelity 100', comp.fidelity.score === 100 && comp.fidelity.checks.find((c) => c.name === 'Logo').passed && /approved logo/.test(comp.fidelity.checks.find((c) => c.name === 'Logo').detail), J(comp.fidelity));
// governance: a restricted asset is never placed, even an approved logo
const restricted = { ...brand.draft, governance: { ...brand.draft.governance, restrictedAssets: [fLogo.id] } };
const compR = D.composeInBrand(restricted, brief, base, { seed: 7, name: 'Poster' });
ok('a restricted asset is never placed in a design, even an approved logo', D.brandLogo(brand.draft)?.id === fLogo.id && D.brandLogo(restricted) === null && !compR.doc.artboards.some((b) => b.children.some((n) => n.type === 'image' && n.link?.startsWith('brand:'))));
// the guard judges words on what is really under them once the shapes have their system colours — runs included: an
// emphasis set in the oat must not vanish on a light card, and stays an emphasis (a colour of the system, not a grey)
const hdoc = { schema: 1, id: 'h', name: 'H', tokens: D.toGraphicTokens(brand.draft), artboards: [{ id: 'a', name: 'A', width: 1080, height: 1080, unit: 'px', dpi: 72, format: 'custom', background: '#d9632b', bleed: 0, safe: 0, children: [
  { id: 'card', type: 'shape', name: 'Card', x: 100, y: 500, w: 880, h: 400, rotation: 0, opacity: 1, shape: 'rect', fill: '#f5ece0' },
  { id: 'hl', type: 'text', name: 'Headline', role: 'headline', x: 150, y: 550, w: 780, h: 300, rotation: 0, opacity: 1, text: 'Walk further, stay dry', font: 'Fraunces', weight: 600, size: 96, lineHeight: 1.1, tracking: 0, align: 'left', valign: 'top', color: '#1d1d1b', runs: [{ start: 5, end: 13, color: '#f3efe6' }] },
] }], assets: [], revision: 0, updatedAt: 0 };
const hBefore = D.fidelityOfDoc(hdoc, brand.draft);
const hGuarded = D.enforceBrand(hdoc, brand.draft).doc;
const hCard = hGuarded.artboards[0].children.find((n) => n.id === 'card');
const hRun = hGuarded.artboards[0].children.find((n) => n.id === 'hl').runs[0];
const hAfter = D.fidelityOfDoc(hGuarded, brand.draft);
const hue = (h) => ((c) => Math.max(...c) - Math.min(...c))([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
ok('a coloured run that would vanish on its ground is found (fidelity reads runs), then made readable by the guard, still an emphasis', hBefore.findings.some((f) => f.rule === 'contrast') && hRun.color !== '#f3efe6' && hRun.color !== '#1d1d1b' && hue(hRun.color) >= 40 && !hAfter.findings.some((f) => f.rule === 'contrast' || f.rule === 'palette'), J({ before: hBefore.findings.map((f) => f.rule), card: hCard.fill, run: hRun.color, after: hAfter.findings.map((f) => f.message) }));
const logoNode = comp.doc.artboards[0].children.find((n) => n.link?.startsWith('brand:'));
ok('the logo is a linked image at its own proportions, never redrawn', logoNode && logoNode.type === 'image' && Math.abs(logoNode.w / logoNode.h - fLogo.width / fLogo.height) < 0.02);
let gp = { ...D.makeProject('create', 'Autumn poster', 1), medium: 'graphic', graphic: { ...D.emptyGraphicState(), brief, direction: comp.direction, doc: comp.doc, bindings: comp.bindings } };
gp = D.applySystem(gp, brand, { now: 102 }).project;
ok('linked: the project follows the latest published version', gp.systemLink.id === brand.id && gp.systemLink.pin === 'latest' && gp.systemLink.version === 1);
// the designer overrides one bound property by hand
const headId = gp.graphic.doc.artboards[0].children.find((n) => n.type === 'text' && n.role === 'headline').id;
const handColour = '#123456';
gp = { ...gp, graphic: { ...gp.graphic, doc: { ...gp.graphic.doc, artboards: gp.graphic.doc.artboards.map((b) => ({ ...b, children: b.children.map((n) => (n.id === headId ? { ...n, color: handColour } : n)) })) } } };
brand = D.updateDraft(brand, D.setToken(brand.draft, 'color.brand.peat', { value: '#101820' }).content, 'deeper peat');
const unrelated = { ...D.makeProject('create', 'Unrelated', 1), medium: 'graphic', graphic: { ...D.emptyGraphicState(), doc: comp.doc } };
ok('before publishing, nothing propagates', D.propagateTo(gp, brand).report.outcome === 'unchanged');
brand = D.publish(brand, { now: 110, confirm: true }).record;
const impact = D.impactOn(gp, brand, D.publishedContent(brand), brand.published);
ok('impact preview names what changes before anything is applied', impact.outcome === 'updated' && impact.changed.some((c) => c.slot === 'colors.text' && c.to === '#101820'));
const pr = D.propagateTo(gp, brand, { now: 111 });
const after = pr.project.graphic.doc;
const textNodes = after.artboards[0].children.filter((n) => n.type === 'text' && n.role !== 'logo');
ok('propagation: bound properties take the new value', textNodes.some((n) => n.color === '#101820') && after.tokens.colors.text === '#101820', J(textNodes.map((n) => [n.role, n.color])));
ok('propagation: the hand-set colour is kept as a local override, and said', after.artboards[0].children.find((n) => n.id === headId).color === handColour && pr.report.kept.length > 0, J(pr.report));
const sorted = (o) => J(Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b))));
ok('propagation: the approved logo is never recoloured or moved', sorted(after.artboards[0].children.find((n) => n.link?.startsWith('brand:'))) === sorted(gp.graphic.doc.artboards[0].children.find((n) => n.link?.startsWith('brand:'))));
ok('propagation: an unlinked project is untouched', D.propagateTo(unrelated, brand).report.outcome === 'not-linked' && D.propagateTo(unrelated, brand).project === unrelated);
const pinned = D.setPin(gp, 1);
ok('a pinned project stays on its version, said', D.propagateTo(pinned, brand).report.outcome === 'pinned' && D.propagateTo(pinned, brand).project === pinned);
const undone = D.undoApply(pr.project, pr.report);
ok('an update can be put back (the version before it was saved)', undone.ok && undone.project.graphic.doc.tokens.colors.text === gp.graphic.doc.tokens.colors.text);
// a new approved logo file reaches linked logo images
const logo2 = D.approveAsset((await D.importAsset({ name: 'ferrowmoor-logo-v2.svg', bytes: enc(logoSvg.replace('#d9632b', '#c0392b')) })).asset, true);
const relinked = D.relinkBrandLogo(after, { ...brand.draft, assets: [logo2] });
ok('a new approved logo file replaces linked instances in place', relinked.updated === 1 && relinked.doc.artboards[0].children.some((n) => n.link === `brand:${D.assetDocId(logo2)}`));
const stretched = { ...after, artboards: after.artboards.map((b) => ({ ...b, children: b.children.map((n) => (n.link?.startsWith('brand:') ? { ...n, w: n.w * 2 } : n)) })) };
ok('a logo the designer distorted is kept as an override (and fails fidelity)', D.relinkBrandLogo(stretched, { ...brand.draft, assets: [logo2] }).kept.length === 1 && D.fidelityOfDoc(stretched, brand.draft).findings.some((f) => /stretched/.test(f.message)));

// ── 28. websites ──
sec('28 websites');
const ws = D.toWebsiteSystem(brand.draft, { link: { id: brand.id, version: brand.published, name: brand.name } });
ok('the website pipeline’s DesignSystem from the canonical one (roles, faces, rules, link)', ws.roles.accent === '#d9632b' && ws.fonts.some((f) => f.family === 'Fraunces') && ws.rules.length > 0 && ws.link.id === brand.id && !!D.normalizeDesignSystem(ws).link);
const wb = D.briefWithSystem({ palette: [], typography: { display: 'Syne', body: 'Inter' }, decisions: {}, rules: [] }, ws);
ok('briefWithSystem locks the brief within it, unchanged code', wb.decisions.colour === 'locked' && wb.typography.display === 'Fraunces' && wb.palette.some((x) => x.hex === '#d9632b'));
const wp = { ...D.makeProject('create', 'Site', 1), specs: [{ version: 1, pageType: 'website', platform: 'web', title: 'Site', tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#555555', accent: '#7c3aed', accentText: '#ffffff', line: '#dddddd' }, fonts: { display: 'Syne', body: 'Inter' }, scale: 'comfortable', radius: 'round', style: 'editorial', imageTreatment: 'natural' }, look: { weight: 700, case: 'upper' }, sections: [], notes: [], reason: 'x', createdAt: 1 }], specIndex: 0 };
const wa = D.applySystem(wp, brand, { now: 200 });
ok('a website design takes the system’s tokens as a new version (the old one kept)', wa.project.specs.length === 2 && wa.project.specs[1].tokens.colors.accent === '#d9632b' && wa.project.specs[1].tokens.fonts.display === 'Fraunces' && wa.project.specIndex === 1 && wa.report.before === 'v1');
ok('website fidelity: in the system after applying', D.fidelityOfTokens(wa.project.specs[1].tokens, brand.draft).findings.filter((f) => f.rule === 'palette').length === 0);

// ── 29. boards ──
sec('29 boards');
const bb = D.readBoardRequest('A campaign for Ferrowmoor’s autumn season: “Walk further, stay dry”. A poster, two social posts and a banner.');
const opts3 = D.brandBoardOptions(brand.draft, bb, 'boardsalt', { link: { id: brand.id, version: brand.published, name: brand.name } });
ok('three board systems: one identity (same tokens, faces, logo, rules), three expressions', opts3.length === 3 && new Set(opts3.map((o) => J(o.tokens))).size === 1 && new Set(opts3.map((o) => J([o.composition, o.style?.primary ?? '', o.direction.language]))).size >= 2 && opts3.every((o) => o.brand?.id === brand.id && o.logo?.asset), J(opts3.map((o) => [o.composition, o.style?.primary, o.direction.language])));
let board = D.startBoard({ ...bb, content: { ...bb.content, brand: brand.name } }, opts3[0], { assets: [D.logoBoardAsset(brand.draft)] });
const mats = board.materials.filter((m) => m.type === 'graphic');
const composed = mats.map((m, i) => ({ m, c: D.composeMaterial(m, board.system, { assets: board.assets, sibling: i, order: i }) }));
board = { ...board, materials: board.materials.map((m) => { const hit = composed.find((x) => x.m.id === m.id); return hit ? { ...m, doc: hit.c.doc, bindings: hit.c.bindings, status: 'ready', composed: hit.c.doc.revision } : m; }) };
ok('board materials carry the approved logo file as linked images', board.materials.filter((m) => m.doc).every((m) => m.doc.artboards.some((b) => b.children.some((n) => n.link?.startsWith('brand:')))), J(board.materials.map((m) => m.doc?.artboards[0].children.filter((n) => n.role === 'logo').map((n) => n.type))));
let bp = { ...D.makeProject('create', 'Autumn board', 1), medium: 'board', board };
bp = D.applySystem(bp, brand, { now: 300 }).project;
brand = D.updateDraft(brand, D.setToken(brand.draft, 'color.brand.ember', { value: '#b03a2e' }).content, 'ember again');
brand = D.publish(brand, { now: 310, confirm: true }).record;
const bprop = D.propagateTo(bp, brand, { now: 311 });
ok('a board update goes through the board’s own sync: materials updated, the board’s system re-versioned', bprop.report.outcome === 'updated' && bprop.project.board.system.tokens.colors.accent === '#b03a2e' && bprop.report.materials.some((m) => m.outcome === 'updated') && bprop.project.board.system.brand.version === brand.published, J(bprop.report.summary));
ok('a board update can be put back', D.undoApply(bprop.project, bprop.report).ok);

// ── 22–23. sync ──
sec('22–23 sync: manual and managed');
let syncRec = D.newRecord(c1.content, { source: { kind: 'css', ref: 'tokens.css' }, importRecord: { id: 'i1', kind: 'css', ref: 'tokens.css', at: 1, files: ['tokens.css'], counts: { tokens: 9, assets: 0, components: 0, rules: 0 }, notes: [], issues: 0, upstream: 'h1' }, now: 1 });
syncRec = D.updateDraft(syncRec, D.setToken(syncRec.draft, 'color.bg', { value: '#ffffff' }).content, 'local bg');
const up = D.importCss([{ name: 'tokens.css', text: css.replace('--color-bg: #fafaf9', '--color-bg: #f5f5f4').replace('--color-text: #1c1917', '--color-text: #0c0a09').replace('--space-base: 4px', '--space-base: 4px; --space-xl: 32px') }]).content;
const diff = D.syncDiff(syncRec.sync.base, syncRec.draft, up);
ok('three-way: a change only upstream comes in; a change on both sides is a conflict', diff.incoming.some((i) => i.key === 'color.text') && diff.incoming.some((i) => i.key === 'space.xl' && i.op === 'added') && diff.conflicts.some((c) => c.key === 'color.bg' && c.suggested === 'local' && c.options.includes('override') && c.options.includes('defer')), J(diff));
const applied = D.applySync(syncRec, up, {}, { upstreamId: 'h2', now: 5 });
ok('applying: incoming accepted into the draft; the local edit never overwritten (deferred by default)', applied.record.draft.tokens['color.text'].value === '#0c0a09' && applied.record.draft.tokens['color.bg'].value === '#ffffff' && applied.deferred.includes('token:color.bg') && applied.record.published === 0);
ok('a deferred conflict is asked about again next time', D.syncDiff(applied.record.sync.base, applied.record.draft, up).conflicts.some((c) => c.key === 'color.bg'));
const overridden = D.applySync(syncRec, up, { 'token:color.bg': 'override' }, { upstreamId: 'h2' });
ok('create override: kept here deliberately, not asked again until upstream moves', overridden.record.draft.tokens['color.bg'].extensions['org.socriaux.sync'].overridden === true && !D.syncDiff(overridden.record.sync.base, overridden.record.draft, up).conflicts.length);
const took = D.applySync(syncRec, up, { 'token:color.bg': 'upstream' }, { upstreamId: 'h2' });
ok('accept upstream takes their value', took.record.draft.tokens['color.bg'].value === '#f5f5f4');
let managed = { ...syncRec, sync: { ...syncRec.sync, mode: 'managed', source: { kind: 'github', ref: 'acme/ds' }, autoAccept: true, lastChecked: 0 } };
ok('a managed system is due for a check', D.syncDue(managed, Date.now()));
const chk = D.recordCheck(managed, { ok: true, upstreamId: 'h2', content: up });
ok('managed: with a conflict, the update waits (never applied silently)', chk.changed && chk.record.sync.pending && chk.record.draft.tokens['color.text'].value === '#1c1917');
const clean = { ...D.newRecord(c1.content, { source: { kind: 'github', ref: 'acme/ds' }, now: 1 }), sync: { ...syncRec.sync, base: c1.content, mode: 'managed', source: { kind: 'github', ref: 'acme/ds' }, autoAccept: true } };
const auto = D.recordCheck({ ...clean, draft: c1.content }, { ok: true, upstreamId: 'h3', content: up });
ok('managed with auto-accept: changes nobody made here come into the draft (still unpublished)', auto.record.draft.tokens['color.text'].value === '#0c0a09' && auto.record.published === 0 && !auto.record.sync.pending);
ok('a failed check is said, nothing changes', D.recordCheck(managed, { ok: false, error: 'GitHub is limiting requests' }).record.sync.error === 'GitHub is limiting requests');

// ── 24–25. export and round trips ──
sec('24–25 export and round trips');
const all = D.exportAll(brand.draft, brand);
ok('every export format is produced', ['socriaux.json', 'tokens.json', 'style-dictionary.json', 'tokens.css', 'tokens.scss', 'guidelines.md', 'guidelines.html'].every((s) => all.some((f) => f.name.endsWith(s))), J(all.map((f) => f.name)));
const same = (a, b) => Object.keys(a.tokens).filter((p) => !b.tokens[p] || J(b.tokens[p].value) !== J(a.tokens[p].value) || b.tokens[p].type !== a.tokens[p].type || J(b.tokens[p].modes ?? {}) !== J(a.tokens[p].modes ?? {}));
for (const [name, content] of [['DTCG sample', r1.content], ['PDF system', brand.draft], ['CSS system', c1.content], ['Figma system', fv.content]]) {
  const back = D.importJson(D.exportDtcg(content).slice(0, 1).map((f) => ({ name: f.name, text: f.text })));
  ok(`round trip DTCG (${name}): same paths, types, values, references and modes`, same(content, back.content).length === 0 && Object.keys(back.content.tokens).length === Object.keys(content.tokens).length, J(same(content, back.content)));
}
for (const [name, content] of [['CSS system', c1.content], ['PDF system', brand.draft]]) {
  const flat = { ...content, tokens: Object.fromEntries(Object.entries(content.tokens).filter(([, t]) => !['typography', 'shadow', 'border', 'gradient', 'transition'].includes(t.type))) };
  const cssOut = D.exportCss(flat);
  const back = D.importCss([{ name: cssOut.name, text: cssOut.text }]);
  ok(`round trip CSS (${name}): flat tokens back exactly, references as var()`, same(flat, back.content).length === 0, J(same(flat, back.content)));
}
const canon = D.exportCanonical(brand.draft, brand);
ok('round trip SocriaUX JSON: identical content, provenance included', J(D.importJson([{ name: canon.name, text: canon.text }]).content) === J(D.normalizeContent(brand.draft)));
const sdOut = D.exportStyleDictionary(r1.content);
const sdBack = D.importJson([{ name: sdOut.name, text: sdOut.text }]);
ok('round trip Style Dictionary: values, types and references', same(r1.content, sdBack.content).length === 0, J(same(r1.content, sdBack.content)));
const md = D.exportGuidelinesMarkdown(brand.draft, brand).text;
ok('the guideline summary separates confirmed, approved and inferred statements', /### Confirmed/.test(md) && /SocriaUX inferences/.test(md) && /approved — protected/.test(md));

// ── brand intelligence ──
sec('12 brand intelligence: confirmed, approved, inferred');
const bi = D.analyzeBrand(pc);
const inf = bi.intelligence.filter((i) => i.status === 'inferred');
ok('inferences read from the system, each with what it rests on, never enforced', inf.length >= 5 && inf.every((i) => i.enforce === 'none' && i.evidence[0].quote));
ok('an inference cannot be made a rule directly', /Approve this reading first/.test(D.enforceIntel(bi, inf[0].id, 'hard').error));
const appr = D.approveIntel(bi, inf[0].id).content;
ok('approving an inference makes it a preference, not a rule', appr.intelligence.find((i) => i.id === inf[0].id).status === 'approved' && appr.intelligence.find((i) => i.id === inf[0].id).enforce === 'soft');
ok('only then can the owner make it a rule', D.enforceIntel(appr, inf[0].id, 'hard').content.intelligence.find((i) => i.id === inf[0].id).enforce === 'hard');
const rej = D.rejectIntel(bi, inf[1].id).content;
ok('a rejected reading stays rejected when the system is read again', D.analyzeBrand(rej).intelligence.find((i) => i.id === inf[1].id).status === 'rejected');
const owned = D.addRule(bi, 'Never place the logo smaller than 32px wide', 'logo', 'hard').content;
ok('a rule the owner states is confirmed, with a check read from its words', owned.intelligence.some((i) => i.status === 'confirmed' && i.check?.kind === 'logo-min-size' && i.check.px === 32));
ok('binding rules: hard and soft, never an unapproved inference', D.bindingRules(bi).hard.every((i) => i.status !== 'inferred') && D.bindingRules(bi).soft.every((i) => i.status !== 'inferred'));
ok('a stored inference can never come back enforced', D.normalizeIntel({ statement: 'x is y', status: 'inferred', enforce: 'hard' }).enforce === 'none');

// ── 26/30. generative brand consistency ──
sec('26/30 generation within a brand: one identity, different compositions');
const kinds = [['poster', 'A poster: “Walk further, stay dry”'], ['social', 'A social post: “New season boots are here”'], ['card', 'A card: “Ferrowmoor field notes”'], ['banner', 'A banner: “Autumn walks, every weekend”']];
const made = kinds.map(([kind, words], i) => D.composeInBrand(brand.draft, D.readGraphicBrief(words, { kind }), D.languageDirection(words, [], `k${i}`), { seed: 11 + i, name: kind }));
ok('every material in the brand’s palette and faces (fidelity ≥ 86, no palette or face findings)', made.every((m) => m.fidelity.score >= 86 && !m.fidelity.findings.some((f) => f.rule === 'palette' || f.rule === 'faces')), J(made.map((m) => [m.fidelity.score, m.fidelity.findings.map((f) => f.message)])));
const sig = (doc) => J(doc.artboards[0].children.filter((n) => !n.decorative).map((n) => [n.type, n.role, Math.round(n.x / doc.artboards[0].width * 10), Math.round(n.y / doc.artboards[0].height * 10), Math.round(n.w / doc.artboards[0].width * 10)]));
ok('and every composition its own (no two share a layout signature)', new Set(made.map((m) => sig(m.doc))).size === made.length);
const offBrand = { ...comp.doc, artboards: comp.doc.artboards.map((b) => ({ ...b, children: b.children.map((n) => (n.type === 'text' && n.role === 'headline' ? { ...n, color: '#ff00ff', font: 'Comic Neue' } : n)) })) };
const offF = D.fidelityOfDoc(offBrand, brand.draft);
ok('an off-brand change is found: the colour and the face, named', offF.findings.some((f) => f.rule === 'palette' && /#ff00ff/.test(f.message)) && offF.findings.some((f) => f.rule === 'faces') && offF.score < 100);
ok('what the system asks, in words, says compositions are free', /compose freely/.test(D.brandAsks(brand.draft)) && /Do not reuse any layout/.test(D.brandAsks(brand.draft)));
// readability across many compositions in the brand, the products' own order (the logo, the hard rules, then the
// document's checks on the colours it really has): words a repair moved are brought back to the palette, and fidelity
// never calls fine what the app's readability check finds unreadable
const sweep = [];
for (let sd = 0; sd < 6; sd++)
  for (const [kind, words] of kinds.slice(0, 3)) {
    const b0 = D.readGraphicBrief(words, { kind });
    const [dir] = D.brandDirections(brand.draft, [D.languageDirection(words, [], `sw${sd}${kind}`)], {});
    const raw = D.composeGraphic({ ...b0, content: { ...b0.content, brand: brand.draft.identity.name } }, dir, { measure: D.approxMeasure, seed: 3 + sd * 5, name: kind });
    const doc = D.guardedForBrand(raw.doc, brand.draft, {}, D.approxMeasure).doc;
    const flagged = new Set(D.checkDoc(doc, D.approxMeasure).filter((f) => f.kind === 'contrast' && f.severity !== 'low').map((f) => f.node));
    sweep.push({ fid: D.fidelityOfDoc(doc, brand.draft), flagged });
  }
ok('across 18 compositions in the brand: no colour left off its palette by a repair, and every word the readability check flags is a fidelity finding too', sweep.every((x) => !x.fid.findings.some((f) => f.rule === 'palette') && (!x.flagged.size || x.fid.findings.some((f) => f.rule === 'contrast'))), J(sweep.map((x) => [x.fid.score, x.flagged.size, x.fid.findings.map((f) => f.message)]).filter((x) => x[0] < 100)));

// ── projects as sources ──
sec('20 a SocriaUX project as a source');
const fromGraphic = await D.extractFromProject(pr.project);
ok('a graphic project gives its tokens and type habits (not its composition)', fromGraphic.content.tokens['color.accent'].value === pr.project.graphic.doc.tokens.colors.accent && fromGraphic.content.roles.accent.status === 'confirmed' && fromGraphic.content.tokens['color.accent'].provenance.source.kind === 'project');
const fromBoard = await D.extractFromProject(bprop.project);
ok('a board gives its Master Design System identity', fromBoard.content.identity.name === bprop.project.board.system.name && fromBoard.content.tokens['font.family.display'].value === bprop.project.board.system.tokens.fonts.display);

// ── a design written as HTML artboards, built in a system ──
sec('a design in the system: its shared styles are the system’s, and follow new versions');
{
  let sysR = D.newRecord(D.analyzeBrand({ ...pc }), { now: 500 });
  sysR = D.publish(sysR, { now: 501, confirm: true }).record;
  const art = { id: 'a1', name: 'Poster', format: 'a3', width: 1123, height: 1587, medium: 'print', html: '<style>h1{color:var(--color-text)}</style><h1>Walk further</h1>', x: 0, y: 0 };
  const ds0 = { v: 1, doc: { artboards: [art], tokens: '' }, versions: [], at: -1, turns: [], memory: { brief: '', decisions: [], rejected: [] }, comments: [], assets: [], kind: 'poster', format: 'a3' };
  let dp = { ...D.makeProject('create', 'Walk poster', 1), medium: 'design', design: ds0 };
  const a1 = D.applySystem(dp, sysR, { now: 502 });
  dp = a1.project;
  ok('linked: the system’s tokens become the design’s shared styles, a version saved', a1.report.outcome === 'applied' && dp.design.doc.tokens.includes('--color-') && dp.design.versions.length === 1 && dp.design.versions[0].said === `Applied ${sysR.name} v1` && !dp.graphic, J(a1.report));
  sysR = D.updateDraft(sysR, D.setToken(sysR.draft, 'color.brand.peat', { value: '#101820' }).content, 'deeper peat');
  sysR = D.publish(sysR, { now: 510, confirm: true }).record;
  const imp = D.impactOn(dp, sysR, D.publishedContent(sysR), sysR.published);
  ok('the impact preview for a design names only what the new version changes', imp.changed.length >= 1 && imp.changed.every((c) => c.from !== c.to) && imp.changed.length < 6 && imp.changed.some((c) => /#101820/i.test(String(c.to))), J(imp.changed));
  const pr2 = D.propagateTo(dp, sysR, { now: 511 });
  ok('a new version reaches the design: its shared styles are the new ones, every artboard that uses them follows', pr2.report.outcome === 'updated' && pr2.project.design.doc.tokens !== dp.design.doc.tokens && /#101820/i.test(pr2.project.design.doc.tokens) && pr2.project.systemLink.version === 2, J(pr2.report));
  const back = D.undoApply(pr2.project, pr2.report);
  ok('…and can be put back (the earlier styles, history kept)', back.ok && back.project.design.doc.tokens === dp.design.doc.tokens && back.project.design.versions.length === 3, back.error);
  // shared styles the person changed are theirs: kept, and said
  const mine = { ...pr2.project, design: { ...pr2.project.design, doc: { ...pr2.project.design.doc, tokens: ':root{--color-text:#ff0066}' } } };
  sysR = D.updateDraft(sysR, D.setToken(sysR.draft, 'color.brand.peat', { value: '#202830' }).content, 'peat again');
  sysR = D.publish(sysR, { now: 520, confirm: true }).record;
  const pr3 = D.propagateTo(mine, sysR, { now: 521 });
  ok('styles changed in the design are kept, and said', pr3.project.design.doc.tokens === ':root{--color-text:#ff0066}' && pr3.report.kept.length === 1 && /kept/.test(pr3.report.summary), J(pr3.report));
}

console.log(`\ndesign-system-intelligence: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
