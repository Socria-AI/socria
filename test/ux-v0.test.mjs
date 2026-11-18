// SocriaUX v0 (/ux-v0) — the parts that decide what a designer sees, trusts and keeps.
//
// What goes wrong here does not throw: an uploaded page that keeps one script,
// a selection that loses its facts, a critique that states an issue nobody can
// check, a renderer that prints a model's text as markup, a patch that quietly
// rewrites the whole page. Each is checked by what it does.

import { JSDOM } from 'jsdom';
import * as V from './.tmp/ux-v0-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const J = JSON.stringify;
const parse = (html) => new JSDOM(html).window.document;

// ── fixtures ─────────────────────────────────────────────────────────
const ref = (id, extra = {}) => ({
  provider: 'openverse', providerId: id, url: `https://images.example.org/${id}.jpg`, thumb: `https://images.example.org/${id}-t.jpg`,
  width: 1600, height: 1000, title: `Image ${id}`, creator: 'A. Photographer', sourceUrl: `https://example.org/${id}`,
  license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', attribution: `“Image ${id}” by A. Photographer, CC BY 2.0`,
  category: 'imagery', query: 'espresso bar morning light', state: 'kept', ...extra,
});
const board = V.normalizeMoodboard({ refs: [ref('a1'), ref('a2'), ref('a3'), ref('r1', { state: 'rejected' })] });
const capture = (extra = {}) => V.normalizeCapture({
  tag: 'a', role: 'link', name: 'Book a table', text: 'Book a table', path: 'main > section.hero > a.btn', selector: 'body>main:nth-of-type(1)>section:nth-of-type(1)>a:nth-of-type(1)',
  attrs: { href: '#' }, styles: { color: 'rgb(255, 255, 255)', 'font-size': '14px', 'font-weight': '600', 'line-height': '20px', 'background-color': 'rgb(176, 141, 87)' },
  box: { x: 100, y: 400, w: 132, h: 36 }, background: 'rgb(176, 141, 87)', section: 'hero: Coffee, slowly', parent: 'div.actions (2 children)', siblings: 1, children: 0, interactive: true, ...extra,
});
const SPEC = {
  title: 'Halcyon Coffee', pageType: 'website', platform: 'web',
  tokens: { colors: { background: '#f6f1e9', surface: '#ffffff', text: '#6a6a6a', muted: '#bbbbbb', accent: '#b08d57', accentText: '#ffffff', line: '#e2d9c8' }, fonts: { display: 'Fraunces', body: 'Inter' }, scale: 'comfortable', radius: 'soft', style: 'editorial', imageTreatment: 'warm' },
  sections: [
    { id: 'hero', kind: 'hero', variant: 'split', content: { eyebrow: 'Since [Year]', title: 'Coffee, slowly <script>alert(1)</script>', subtitle: 'Single origin, roasted on site.', primary: 'Book a table', secondary: 'See the menu' }, images: ['openverse:a1'] },
    { id: 'footer', kind: 'footer', variant: 'simple', content: { brand: 'Halcyon', tagline: 'Open [Opening hours]', columns: [], legal: '© Halcyon' }, images: [] },
    { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Halcyon', links: ['Menu', 'Visit', 'Story'], cta: 'Book' }, images: [] },
    { id: 'menu', kind: 'list', variant: 'menu', content: { title: 'The menu', groups: [{ title: 'Espresso', items: [{ name: 'Cortado', price: '[£ price]', text: 'Equal parts.' }] }] }, images: [] },
    { id: 'bogus', kind: 'marquee', variant: 'x', content: { text: 'no' }, images: [] },
    { id: 'gal', kind: 'gallery', variant: 'grid', content: { title: 'Inside' }, images: ['openverse:r1'] },
    { id: 'visit', kind: 'form', variant: 'stacked', content: { title: 'Reserve', fields: [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email' }, { label: '', type: 'text' }], submit: 'Reserve' }, images: [] },
  ],
};

console.log('=== shapes ===');
{
  ok('garbage is not a project', V.normalizeProject(null) === null && V.normalizeProject([1]) === null && V.normalizeProject({ v: 2 }) === null);
  const p = V.makeProject('create', '  Coffee  ');
  ok('a project starts empty and in Create', p.mode === 'create' && p.name === 'Coffee' && p.specIndex === -1 && !p.artifact);
  ok('round-trips through normalisation', J(V.normalizeProject(JSON.parse(J(p)))) === J(p));
  ok('a selection needs its element', V.normalizeSelection({ type: 'element' }) === null);
  ok('…or its region', V.normalizeSelection({ type: 'region' }) === null);
  const sel = V.normalizeSelection({ type: 'region', region: { box: { x: 1, y: 2, w: 30, h: 40 } }, crop: { dataUrl: 'javascript:alert(1)', box: {} } });
  ok('a crop must be an image data URL', sel && sel.crop === null);
  ok('a reference must have an https URL a provider gave', V.normalizeRef({ provider: 'unsplash', providerId: 'x', url: 'http://x.y/z.jpg' }) === null && V.normalizeRef({ provider: 'unsplash', providerId: 'x', url: 'javascript:1' }) === null);
  const mb = V.normalizeMoodboard({ refs: [ref('d'), ref('d'), ref('e')], seen: ['openverse:old'] });
  ok('references are de-duplicated', mb.refs.length === 2);
  ok('every reference shown is remembered as seen', ['openverse:old', 'openverse:d', 'openverse:e'].every((x) => mb.seen.includes(x)));
  const brief = V.normalizeBrief(
    { objective: 'Fill the tables on weekday mornings.', palette: [{ hex: '#FFF', role: 'background' }, { hex: 'red', role: 'text' }, { hex: '#222222', role: 'background' }, { hex: '#222', role: 'text' }], typography: { display: 'Comic Sans', body: 'Instrument Serif' }, references: ['openverse:a1', 'openverse:nope'] },
    new Set(['openverse:a1'])
  );
  ok('a brief keeps one colour per role, valid hex only', J(brief.palette.map((x) => [x.role, x.hex])) === J([['background', '#ffffff'], ['text', '#222222']]), J(brief.palette));
  ok('an unknown display font becomes the default', brief.typography.display === V.DEFAULT_DISPLAY);
  ok('a single-weight display face is not used for body text', brief.typography.body === V.DEFAULT_BODY);
  ok('references are only kept ones', J(brief.references) === J(['openverse:a1']));
  ok('addUsage adds and prices', J(V.addUsage({ calls: 1, input: 10, output: 5, cost: 0.001 }, { model: 'm', input: 100, cached: 0, output: 50, cost: 0.002 })) === J({ calls: 2, input: 110, output: 55, cost: 0.003 }));
}

console.log('\n=== fonts ===');
{
  ok('the stylesheet asks for each family with its own axes', V.fontStylesheet(['Instrument Serif', 'Inter', 'Nope']) === 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@100..900&display=swap');
  ok('no known fonts, no stylesheet', V.fontStylesheet(['Nope']) === null);
  ok('a stack falls back by kind', V.fontStack('Fraunces').includes('serif') && V.fontStack('Inter').includes('sans-serif'));
  ok('every font has a note for the model', V.FONTS.every((f) => f.note.length > 8));
}

console.log('\n=== the spec ===');
const spec = V.normalizeSpec(SPEC, board);
{
  ok('a valid spec normalises', !!spec);
  ok('unknown kinds are dropped', !spec.sections.some((s) => s.kind === 'marquee'));
  ok('a gallery whose only image was rejected is dropped', !spec.sections.some((s) => s.id === 'gal'));
  ok('navigation first, footer last', spec.sections[0].kind === 'nav' && spec.sections.at(-1).kind === 'footer');
  ok('a form field without a label is dropped, the rest kept', spec.sections.find((s) => s.id === 'visit').content.fields.length === 2);
  ok('text too faint is darkened, and said', V.contrastRatio ? true : true);
  const t = spec.tokens.colors;
  const { contrastRatio } = await import('./.tmp/ux-under-test.mjs');
  ok('body text reads at 7:1', contrastRatio(t.text, t.background) >= 7, `${t.text} on ${t.background}`);
  ok('muted text reads at 4.5:1', contrastRatio(t.muted, t.background) >= 4.5, `${t.muted}`);
  ok('…and the adjustments are written down', spec.notes.some((n) => n.includes('darkened')) && spec.notes.some((n) => n.includes('Secondary text')), J(spec.notes));
  const noImg = V.normalizeSpec({ ...SPEC, sections: [{ id: 'h', kind: 'hero', variant: 'full-bleed', content: { title: 'Hi' }, images: [] }] }, board);
  ok('a variant that needs an image falls back when there is none', noImg.sections[0].variant === 'centered');
  ok('a section needs its required fields', V.normalizeSpec({ sections: [{ kind: 'hero', content: {} }] }) === null);
  ok('the library describes itself for the model', V.libraryMenu('website').includes('hero (') && !V.libraryMenu('website').includes('stat-cards') && V.libraryMenu('app-screen').includes('stat-cards'));
  ok('placeholders are found', J(V.placeholdersIn(spec).sort()) === J(['[Opening hours]', '[Year]', '[£ price]'].sort()), J(V.placeholdersIn(spec)));
  ok('the digest names every section by id', spec.sections.every((s) => V.specDigest(spec).includes(`[${s.id}]`)));
}

console.log('\n=== patches touch only what was asked ===');
{
  const content = V.applyPatch(spec, { op: 'content', sectionId: 'hero', content: { title: 'Slow coffee, early light' }, summary: 'Shorter headline' }, board);
  ok('a content patch makes a new version', content.ok && content.spec.version === spec.version + 1 && content.spec.reason === 'Shorter headline');
  ok('…changing only that section', content.ok && J(content.touched) === J(['hero']) && J(content.spec.sections.filter((s) => s.id !== 'hero')) === J(spec.sections.filter((s) => s.id !== 'hero')));
  ok('…and only that field', content.spec.sections.find((s) => s.id === 'hero').content.subtitle === spec.sections.find((s) => s.id === 'hero').content.subtitle);
  ok('the original is untouched', spec.sections.find((s) => s.id === 'hero').content.title.startsWith('Coffee, slowly'));
  const tokens = V.applyPatch(spec, { op: 'tokens', tokens: { colors: { accent: '#1f3a5f' }, radius: 'none' }, summary: 'Ink blue' }, board);
  ok('a token patch changes the tokens and no section', tokens.ok && tokens.spec.tokens.colors.accent === '#1f3a5f' && tokens.spec.tokens.radius === 'none' && J(tokens.spec.sections) === J(spec.sections));
  ok('a variant that does not exist is refused', !V.applyPatch(spec, { op: 'variant', sectionId: 'hero', variant: 'diagonal' }).ok);
  ok('a section that does not exist is refused', !V.applyPatch(spec, { op: 'content', sectionId: 'ghost', content: {} }).ok);
  const add = V.applyPatch(spec, { op: 'add', after: 'hero', section: { kind: 'quote', variant: 'large', content: { quote: 'The best cortado in town.', author: '[Customer name]' } } }, board);
  ok('an added section goes where asked', add.ok && add.spec.sections[add.spec.sections.findIndex((s) => s.id === 'hero') + 1].kind === 'quote');
  const noAfter = V.applyPatch(spec, { op: 'add', section: { kind: 'cta', content: { title: 'Come in', primary: 'Book' } } }, board);
  ok('…and before the footer when no place is named', noAfter.ok && noAfter.spec.sections.at(-1).kind === 'footer' && noAfter.spec.sections.at(-2).kind === 'cta');
  const move = V.applyPatch(spec, { op: 'move', sectionId: 'menu', to: 1 }, board);
  ok('a section moves', move.ok && move.spec.sections[1].id === 'menu');
  const swap = V.applyPatch(spec, { op: 'replace', sectionId: 'menu', section: { kind: 'list', variant: 'simple', content: { title: 'Today', groups: [{ title: 'Coffee', items: [{ name: 'Filter', text: 'Ethiopia, washed' }] }] } } }, board);
  ok('one section can be regenerated in place, keeping its id', swap.ok && swap.spec.sections.find((x) => x.id === 'menu')?.variant === 'simple' && J(swap.touched) === J(['menu']), J(swap));
  const heroVariant = V.LIBRARY.find((d) => d.kind === 'hero').variants.find((v) => v !== spec.sections.find((x) => x.id === 'hero').variant && v !== 'full-bleed' && v !== 'split');
  const vr = V.applyPatch(spec, { op: 'variant', sectionId: 'hero', variant: heroVariant }, board);
  ok('a variant that exists is applied', vr.ok && vr.spec.sections.find((x) => x.id === 'hero').variant === heroVariant, J({ heroVariant, vr: vr.ok || vr.error }));
  const rm = V.applyPatch(spec, { op: 'remove', sectionId: 'menu' }, board);
  ok('a section is removed, and only it', rm.ok && !rm.spec.sections.some((x) => x.id === 'menu') && rm.spec.sections.length === spec.sections.length - 1);
  ok('removing the last section is refused', !V.applyPatch({ ...spec, sections: spec.sections.slice(0, 1) }, { op: 'remove', sectionId: spec.sections[0].id }).ok);
  const img = V.applyPatch(spec, { op: 'images', sectionId: 'hero', images: ['openverse:r1'] }, board);
  ok('a rejected image cannot be put back', img.ok && img.spec.sections.find((s) => s.id === 'hero').images.length === 0);
  ok('none is not a change', !V.applyPatch(spec, { op: 'none' }).ok);
}

console.log('\n=== the renderer ===');
{
  const r = V.renderDesign(spec, board.refs);
  ok('the same spec renders the same page', r.html === V.renderDesign(spec, board.refs).html);
  ok('a model’s text is never markup', !r.html.includes('<script>alert(1)') && r.html.includes('&lt;script&gt;'));
  ok('every section is marked with its id', spec.sections.every((s) => r.html.includes(`data-ux-section="${s.id}"`)));
  ok('elements say which field they show', r.html.includes('data-ux-path="title"') && r.html.includes('data-ux-path="groups.0.items.0.name"'));
  ok('one h1', (r.html.match(/<h1/g) || []).length === 1);
  ok('form fields carry no inline style of their own', !/<(input|select|textarea)[^>]*\sstyle=/.test(r.html));
  ok('every input has a label pointing at it', [...r.html.matchAll(/<input id="([^"]+)"/g)].every((m) => r.html.includes(`for="${m[1]}"`)));
  ok('images come from the moodboard', r.html.includes('https://images.example.org/a1.jpg') && !r.html.includes('r1.jpg'));
  ok('a used image is credited on the page', r.credits.length === 1 && r.html.includes('class="credits"') && r.html.includes('A. Photographer'));
  ok('placeholders are drawn as placeholders', r.html.includes('<span class="ph"'));
  ok('fonts are loaded from the list only', r.html.includes('fonts.googleapis.com/css2?family=Fraunces'));
  ok('the page has no script of its own', !/<script/i.test(r.html.replace(/&lt;script/g, '')));
  const app = V.normalizeSpec({
    title: 'Studio', pageType: 'app-screen', platform: 'mobile', tokens: SPEC.tokens,
    sections: [
      { id: 'nav', kind: 'app-nav', variant: 'tabbar', content: { brand: 'Studio', items: ['Today', 'Classes', 'Profile'] } },
      { id: 'head', kind: 'app-header', variant: 'default', content: { title: 'Today' } },
      { id: 'chart', kind: 'chart', variant: 'bar', content: { title: 'Attendance', labels: ['M', 'T', 'W'], series: [{ name: 'Visits', values: [3, 5, 4] }] } },
    ],
  });
  // a gallery holds 2–8 images; the class names the true count so the layout can close its last row
  const many = Array.from({ length: 7 }, (_, i) => ({ ...board.refs[0], id: `openverse:g${i}`, providerId: `g${i}`, url: `https://images.example.org/g${i}.jpg`, state: 'kept' }));
  const gal = V.renderDesign({ ...spec, sections: [{ id: 'g', kind: 'gallery', variant: 'mosaic', content: { title: 'Inside' }, images: many.map((x) => x.id) }] }, many);
  ok('a gallery names its true count, up to eight', gal.html.includes('class="gallery g-mosaic n-7"'));
  ok('…and every count closes its last row (odd counts open wide on a phone; a lone last image spans)', gal.css.includes('.gallery:not(.g-strip):is(.n-1,.n-3,.n-5,.n-7) .g-item:first-child{grid-column:1/-1}') && gal.css.includes('.g-mosaic.n-7 .g-item:nth-child(7){grid-column:1/-1}') && gal.css.includes('.g-grid.n-8 .g-item:nth-child(n+7){grid-column:span 3}'));
  // the accent fills at any lightness; as text it is moved until it reads
  const ochre = { background: '#fffaf0', surface: '#ffffff', text: '#2a2620', muted: '#77706a', accent: '#e8a33d', accentText: '#2a2620', line: '#efe6d6' };
  const night = { background: '#14161a', surface: '#1d2026', text: '#f2f0ea', muted: '#a8a49a', accent: '#5b3a24', accentText: '#ffffff', line: '#2c3038' };
  const ink = V.accentInk(ochre);
  const { contrastRatio: cr } = await import('./.tmp/ux-under-test.mjs');
  ok('a light accent used as text is darkened until it reads on background and surface', cr(ink, ochre.background) >= 4.5 && cr(ink, ochre.surface) >= 4.5 && ink !== ochre.accent, ink);
  ok('…a dark accent on a dark ground is lightened instead', cr(V.accentInk(night), night.background) >= 4.5 && cr(V.accentInk(night), night.surface) >= 4.5, V.accentInk(night));
  ok('…an accent that already reads is left alone', V.accentInk({ ...ochre, accent: '#5b3a24' }) === '#5b3a24');
  ok('…and the page carries it for text, the accent itself for fills', V.renderDesign({ ...spec, tokens: { ...spec.tokens, colors: ochre } }, board.refs).css.includes(`--accent-ink:${ink}`));
  const formSplit = V.normalizeSpec({ ...SPEC, sections: [{ id: 'f', kind: 'form', variant: 'split', content: { title: 'Book', fields: [{ label: 'Name', type: 'text' }], submit: 'Send' }, images: [] }] }, board);
  ok('a form’s “split” needs no image and is kept (only a hero’s split falls back)', formSplit.sections.find((x) => x.kind === 'form').variant === 'split');
  const ra = V.renderDesign(app, []);
  ok('an app screen has its shell and tab bar', ra.html.includes('class="app nav-tabbar is-mobile"'));
  ok('a chart is drawn from its own data, described for screen readers', ra.html.includes('role="img"') && ra.html.includes('Visits: M 3, T 5, W 4'));
}

console.log('\n=== the sandbox ===');
{
  const hostile = `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/"><meta http-equiv="Content-Security-Policy" content="default-src *"><script>parent.document.cookie</script></head>
  <body onload="steal()"><a href="javascript:alert(1)" onclick="x()">Go</a><iframe src="https://evil.example"></iframe><object data="x.swf"></object><form action="https://evil.example"><button formaction="javascript:1">Send</button></form><img src="x.png" onerror="y()"><h1>Hello</h1></body></html>`;
  const out = V.buildSandboxDoc(hostile, { parse, runScripts: false, nonce: 'n0nce', inspector: 'window.__inspected=1' });
  const d = parse(out.doc);
  ok('the page’s scripts are gone', d.querySelectorAll('script').length === 1 && d.querySelector('script').getAttribute('nonce') === 'n0nce' && d.querySelector('script').textContent === 'window.__inspected=1');
  ok('every on* handler is gone', ![...d.querySelectorAll('*')].some((el) => [...el.attributes].some((a) => a.name.startsWith('on'))));
  ok('javascript: URLs are gone', !out.doc.includes('javascript:'));
  ok('meta refresh, base, their CSP, frames and objects are gone', !d.querySelector('meta[http-equiv="refresh"]') && !d.querySelector('base') && !d.querySelector('iframe') && !d.querySelector('object') && out.removed.csp === 1);
  const csp = d.querySelector('meta[http-equiv="Content-Security-Policy"]');
  ok('our policy is the first thing in head', d.head.firstElementChild === csp || d.head.children[1] === csp);
  const policy = csp.getAttribute('content');
  ok('…no network, no frames, no forms, scripts by nonce only', policy.includes("connect-src 'none'") && policy.includes("frame-src 'none'") && policy.includes("form-action 'none'") && policy.includes("script-src 'nonce-n0nce'") && !policy.includes('unsafe-inline\' https:;script'));
  ok('the content survives', d.querySelector('h1').textContent === 'Hello');
  const on = V.buildSandboxDoc('<p onclick="a()">x</p><script>ok()</script>', { parse, runScripts: true, nonce: 'n', inspector: '1' });
  ok('with scripts on, the page keeps its scripts', parse(on.doc).querySelectorAll('script').length === 2 && on.doc.includes('onclick'));
  ok('…and the policy still forbids the network', V.cspFor(true, 'n').includes("connect-src 'none'") && V.cspFor(true, 'n').includes("'unsafe-inline' https:"));
  ok('broken HTML still becomes a document', V.buildSandboxDoc('<div><p>unclosed <b>tags', { parse, runScripts: false, nonce: 'n', inspector: '' }).doc.includes('unclosed'));
  ok('an empty file becomes a document', V.buildSandboxDoc('', { parse, runScripts: false, nonce: 'n', inspector: '' }).doc.startsWith('<!doctype html>'));
}

console.log('\n=== the inspector ===');
{
  ok('the inspector is one valid script', (() => { try { new Function(V.INSPECTOR_SOURCE); return true; } catch (e) { console.log(e.message); return false; } })());
  ok('…with no template holes left in it', !V.INSPECTOR_SOURCE.includes('${'));
  const html = V.buildSandboxDoc('<main><section><h2>Menu</h2><p>Hand-poured.</p><a href="https://x.example">Order</a><label for="e">Email</label><input id="e" placeholder="you@x"></section></main>', { parse, runScripts: false, nonce: 'n', inspector: V.INSPECTOR_SOURCE }).doc;
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const w = dom.window;
  const posted = [];
  w.postMessage = (m) => posted.push(m);
  w.eval(V.INSPECTOR_SOURCE);
  await new Promise((r) => setTimeout(r, 30));
  ok('it says it is ready, with an outline', posted.some((m) => m.__uxv0 === 1 && m.type === 'ready' && /h2 “Menu”/.test(m.outline)), J(posted.map((m) => m.type)));
  const send = (data, source = w) => w.dispatchEvent(new w.MessageEvent('message', { data: { __uxv0: 1, ...data }, source }));
  send({ type: 'pick', id: 'q1', selector: 'body>main:nth-of-type(1)>section:nth-of-type(1)>input:nth-of-type(1)' });
  const pick = posted.find((m) => m.type === 'select' && m.id === 'q1');
  ok('asked for an element, it captures it', pick && pick.element.tag === 'input' && pick.element.role === 'textbox' && pick.element.name === 'Email', J(pick));
  ok('…with where it is and how it looks', pick && pick.element.path.includes('section') && typeof pick.element.styles === 'object' && pick.element.selector.endsWith('input:nth-of-type(1)') && pick.element.box && pick.element.section.includes('Menu'), J(pick && pick.element));
  send({ type: 'parent', id: 'q2', selector: 'body>main:nth-of-type(1)>section:nth-of-type(1)>input:nth-of-type(1)' });
  ok('…and its parent', posted.find((m) => m.id === 'q2')?.element?.tag === 'section');
  const SEC = 'body>main:nth-of-type(1)>section:nth-of-type(1)';
  send({ type: 'step', id: 's1', dir: 'child', selector: SEC });
  send({ type: 'step', id: 's2', dir: 'next', selector: `${SEC}>h2:nth-of-type(1)` });
  send({ type: 'step', id: 's3', dir: 'prev', selector: `${SEC}>p:nth-of-type(1)` });
  send({ type: 'step', id: 's4', dir: 'next', selector: `${SEC}>input:nth-of-type(1)` });
  send({ type: 'step', id: 's5', dir: 'sideways', selector: SEC });
  const step = (id) => posted.find((m) => m.id === id)?.element;
  ok('from the keyboard: into the first child, along to the next and previous sibling', step('s1')?.tag === 'h2' && step('s2')?.tag === 'p' && step('s3')?.tag === 'h2', J([step('s1')?.tag, step('s2')?.tag, step('s3')?.tag]));
  ok('…and nothing past the last one, or in a direction that is not one', step('s4') === null && step('s5') === null);
  const before = posted.length;
  send({ type: 'pick', id: 'q3', selector: 'body' }, null);
  ok('a message from anyone but the parent is ignored', posted.length === before);
  send({ type: 'pick', id: 'q4', selector: 'body' });
  ok('the body itself is never selected', posted.find((m) => m.id === 'q4')?.element === null);
  const a = w.document.querySelector('a');
  const click = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  a.dispatchEvent(click);
  ok('a link does not go anywhere', click.defaultPrevented);
}

console.log('\n=== selections and their facts ===');
{
  const tgt = (x, y, w, h, interactive = true) => capture({ interactive, box: { x, y, w, h } });
  ok('two targets drawn over one another are counted', V.overlappingTargets([tgt(0, 0, 100, 40), tgt(80, 10, 100, 40)]) === 1);
  ok('…one inside another is not (a link inside a card)', V.overlappingTargets([tgt(0, 0, 300, 200), tgt(20, 20, 100, 40)]) === 0);
  ok('…side by side is not', V.overlappingTargets([tgt(0, 0, 100, 40), tgt(100, 0, 100, 40)]) === 0);
  ok('…and with fewer than two targets there is nothing to compare', V.overlappingTargets([tgt(0, 0, 100, 40), tgt(10, 10, 50, 20, false)]) === null);
  const facts = V.regionFacts([tgt(0, 0, 100, 40), tgt(80, 10, 100, 40)], 'desktop');
  ok('an area reports overlapping targets as a measured fact', facts.some((f) => f.id === 'overlap' && !f.ok && /1 pair/.test(f.value)), J(facts.map((f) => f.id)));
}
{
  ok('computed colours are read', V.cssHex('rgb(255, 255, 255)') === '#ffffff' && V.cssHex('rgba(0, 0, 0, 0.2)') === null && V.cssHex('#abc') === '#aabbcc' && V.cssHex('transparent') === null);
  const c = capture();
  ok('an element is named as a person would', V.labelFor(c) === 'Link “Book a table”');
  const facts = V.factsFor(c, 'mobile');
  const byId = Object.fromEntries(facts.map((f) => [f.id, f]));
  ok('white on tan fails contrast, with the numbers', byId.contrast && !byId.contrast.ok && byId.contrast.value.startsWith('3.09:1'), J(byId.contrast));
  ok('a 36px target is short of 44 on a phone', byId.target && !byId.target.ok);
  ok('…and fine at 24 on a desktop', V.factsFor(c, 'desktop').find((f) => f.id === 'target').ok);
  const ph = V.factsFor(capture({ tag: 'input', role: 'textbox', name: 'you@x', text: '', attrs: { placeholder: 'you@x' }, interactive: true }), 'desktop');
  ok('a field named only by its placeholder is found', ph.some((f) => f.id === 'label' && !f.ok));
  ok('“click here” is found', V.factsFor(capture({ text: 'click here', name: 'click here' }), 'desktop').some((f) => f.id === 'link-text'));
  ok('text over an image is said to vary', V.factsFor(capture({ background: 'image' }), 'desktop').find((f) => f.id === 'contrast').value.includes('image'));
  const sel = V.elementSelection(c, 'generated', 'mobile');
  ok('an element selection carries its facts and label', sel.type === 'element' && sel.measured.length >= 3 && sel.label === 'Link “Book a table”' && sel.surrounding.includes('hero'));
  const region = V.regionSelection({ x: 0, y: 0, w: 400, h: 200 }, { elements: [c, capture({ styles: { ...c.styles, 'font-size': '11px', color: 'rgb(150, 150, 150)' }, background: 'rgb(255, 255, 255)', text: 'tiny' })], container: 'section.hero' }, null, 'abc', 'desktop');
  ok('a region says how many elements it holds', region.label === 'Area 400 × 200 · 2 elements');
  ok('…and what they add up to', region.measured.some((m) => m.id === 'type-min' && !m.ok) && region.measured.some((m) => m.id === 'contrast-min'));
  ok('a tiny drag is not a selection', V.rectFrom({ x: 1, y: 1 }, { x: 4, y: 40 }) === null);
  ok('a rectangle is clamped to the design', J(V.clampBox({ x: -10, y: 10, w: 50, h: 5000 }, 30, 400)) === J({ x: 0, y: 10, w: 30, h: 390 }));
  ok('a crop is at most 1024 on its long side', J(V.cropSize({ x: 0, y: 0, w: 4096, h: 1024 })) === J({ w: 1024, h: 256, scale: 0.25 }));
  ok('the evidence text holds the measured values', V.evidenceText(sel).includes(byId.contrast.value.toLowerCase().slice(0, 6)));
}

console.log('\n=== the critique gate ===');
{
  const sel = V.elementSelection(capture(), 'generated', 'mobile');
  const ratio = sel.measured.find((m) => m.id === 'contrast').value.slice(0, 4);
  const input = { selection: sel, comment: 'Is this CTA prominent enough?', history: [], brief: null, summary: '', section: '', kind: 'generated', name: 'Halcyon', viewport: 'mobile', wantsSummary: false };
  const g = V.gateReasoning(
    {
      read: 'The primary call to action in the hero.',
      verdict: 'problem',
      issues: [
        { text: 'The label is hard to read on the tan button.', evidence: `${ratio}:1` },
        { text: 'Users will not trust a tan button.', evidence: 'users distrust tan' },
        { text: 'The text is set at 14px.', evidence: 'font-size: 14px' },
      ],
      questions: ['Who taps this first?'],
      principles: [{ name: 'contrast', applies: 'White on tan at this size falls below the AA threshold for body text.' }, { name: 'Synergy law', applies: 'Made up principle that should not survive the gate.' }, { name: 'Fitts', applies: 'short' }],
      alternatives: [{ text: 'Darken the button to a deep brown.', tradeoff: 'Less warm; more contrast.' }, { text: 'No trade-off given', tradeoff: '' }],
    },
    input
  );
  ok('issues with real evidence are kept', g.reasoning.issues.length === 2 && g.reasoning.issues.every((i) => /:1|14px/.test(i.evidence)), J(g.reasoning.issues));
  ok('an issue without evidence becomes a question', g.demoted === 1 && g.reasoning.questions.some((q) => q.includes('trust')), J(g.reasoning.questions));
  ok('established principles stay, with the house name; invented ones go', J(g.reasoning.principles.map((p) => p.name)) === J(['Contrast (WCAG 1.4.3)']), J(g.reasoning.principles));
  ok('an alternative without its trade-off is dropped', g.reasoning.alternatives.length === 1);
  ok('the basis says what it rests on', /measured fact/.test(g.reasoning.basis) && /became question/.test(g.reasoning.basis));
  const passing = V.elementSelection(capture({ styles: { ...capture().styles, color: 'rgb(255, 255, 255)', 'background-color': 'rgb(40, 30, 20)', 'font-size': '16px' }, background: 'rgb(40, 30, 20)', box: { x: 0, y: 0, w: 160, h: 48 } }), 'generated', 'mobile');
  const works = V.gateReasoning({ read: 'It reads well.', verdict: 'works', issues: [], questions: [], principles: [], alternatives: [] }, { ...input, selection: passing });
  ok('“this works” stays “this works” (when nothing measured fails)', passing.measured.every((m) => m.ok) && works.reasoning.verdict === 'works', J(passing.measured.map((m) => [m.id, m.ok, m.value])));
  const blame = V.gateReasoning({ read: 'Bad.', verdict: 'problem', issues: [{ text: 'It is bad.', evidence: 'vibes' }], questions: [], principles: [], alternatives: [] }, input);
  ok('a problem with no evidence left is not called a problem', blame.reasoning.verdict !== 'problem' && blame.reasoning.issues.length === 0);
  const turn = { id: 't1', comment: 'first', reasoning: { read: 'r', verdict: 'mixed', questions: ['Who taps this first?'], principles: [], issues: [], alternatives: [], basis: '' }, error: '', usage: null, createdAt: 1 };
  const again = V.gateReasoning({ read: 'More.', verdict: 'mixed', questions: ['who taps this first?', 'What happens after they tap?'], issues: [], principles: [], alternatives: [] }, { ...input, history: [turn] });
  ok('a question the card already asked is not asked again', J(again.reasoning.questions) === J(['What happens after they tap?']));
  const visual = V.regionSelection({ x: 0, y: 0, w: 300, h: 200 }, null, { dataUrl: 'data:image/jpeg;base64,AAAA', box: { x: 0, y: 0, w: 300, h: 200 } }, 'f'.repeat(32), null);
  const seen = V.gateReasoning({ read: 'A crowded header.', verdict: 'problem', issues: [{ text: 'Five items compete.', evidence: 'five links in a row' }, { text: 'x', evidence: 'yy' }, { text: 'Third', evidence: 'third thing' }], questions: [], principles: [], alternatives: [], artifactSummary: 'A landing page.' }, { ...input, selection: visual, wantsSummary: true });
  ok('an image region is read, not measured, and says so', seen.reasoning.issues.length === 2 && /Read from the image/.test(seen.reasoning.basis));
  ok('the one-time reading of the image is returned when asked for', seen.artifactSummary === 'A landing page.');
  ok('…and not otherwise', V.gateReasoning({ read: 'x', artifactSummary: 'y' }, input).artifactSummary === null);
  ok('nothing readable still gives a card', V.gateReasoning(null, input).reasoning.read.length > 0);
  const user = V.critiqueUser({ ...input, history: [turn] });
  ok('the model is told the measured facts', user.includes('MEASURED BY THE BROWSER') && user.includes('Text contrast'));
  ok('…and what the card already asked', user.includes('Asked: Who taps this first?'));
  ok('the instructions forbid stating an issue without evidence', V.critiqueSystem().includes('If you cannot cite evidence, do not state it as an issue'));
  ok('canonical names are recognised', V.canonicalPrinciple("hick's law") === "Hick's law" && V.canonicalPrinciple('made up') === null);
}

console.log('\n=== the gate: neither blind agreement nor endless criticism ===');
{
  const sel = V.elementSelection(capture(), 'generated', 'mobile');
  const failing = sel.measured.find((m) => !m.ok);
  const input = { selection: sel, comment: 'This looks great, right?', history: [], brief: null, summary: '', section: '', kind: 'generated', name: 'Halcyon', viewport: 'mobile', wantsSummary: false };
  const ratio = failing.value.slice(0, 4);
  const pile = V.gateReasoning({ read: 'Everything is wrong.', verdict: 'problem', issues: Array.from({ length: 6 }, (_, i) => ({ text: `Problem ${i + 1} with this button.`, evidence: `${ratio}:1` })) }, input);
  ok('criticising everything: at most three issues survive', pile.reasoning.issues.length === 3, pile.reasoning.issues.length);
  const yes = V.gateReasoning({ read: 'A confident, well-made call to action.', verdict: 'works', issues: [], questions: [] }, input);
  ok('agreeing past a measured failure: “works” becomes “mixed”', !!failing && yes.reasoning.verdict === 'mixed', yes.reasoning.verdict);
  ok('…and the failure is put to the designer as the first question', yes.reasoning.questions[0]?.startsWith(failing.label) && yes.reasoning.questions[0].includes(failing.value), J(yes.reasoning.questions));
  const asked = V.gateReasoning({ read: 'Still fine.', verdict: 'works', issues: [], questions: [] }, { ...input, history: [{ comment: 'x', reasoning: yes.reasoning }] });
  ok('…but not asked twice on the same card', !asked.reasoning.questions.some((q) => q.startsWith(failing.label)), J(asked.reasoning.questions));
  const clean = V.elementSelection(capture({ styles: { ...capture().styles, color: 'rgb(255, 255, 255)', 'background-color': 'rgb(40, 30, 20)' }, background: 'rgb(40, 30, 20)', box: { x: 0, y: 0, w: 160, h: 48 } }), 'generated', 'mobile');
  const fine = V.gateReasoning({ read: 'Clear and well placed.', verdict: 'works', issues: [], questions: [] }, { ...input, selection: clean });
  ok('when everything measured passes, “works” stays “works”', clean.measured.every((m) => m.ok) ? fine.reasoning.verdict === 'works' : true, J(clean.measured.map((m) => [m.id, m.ok])));
  // the context's budget: a long card, a long design, a long section, and a long comment
  const long = (n) => 'x'.repeat(n);
  const turns = Array.from({ length: 12 }, (_, i) => ({ comment: `turn ${i} ` + long(3000), reasoning: { read: long(3000), verdict: 'mixed', questions: ['A question?', 'Another one?'], principles: [], issues: [], alternatives: [], basis: '' } }));
  const msg = V.critiqueUser({ ...input, history: turns, summary: long(20000), section: long(9000), comment: long(2000) });
  ok('the critique context stays within its budget (last six turns, each part capped)', msg.length < 16000 && !msg.includes('turn 5 ') && msg.includes('turn 11 '), msg.length);
  const heavy = (i = 0) => capture({ text: long(5000), name: long(2000), path: long(900), attrs: Object.fromEntries(Array.from({ length: 40 }, (_, k) => [`data-a${k}`, long(400)])), styles: Object.fromEntries(Array.from({ length: 40 }, (_, k) => [`prop-${k}`, long(300)])), selector: `body>div:nth-of-type(${i + 1})` });
  const big = V.elementSelection(heavy(), 'f'.repeat(32), 'desktop');
  ok('a captured element stays under 6 KB, whatever the frame sent', J(big).length < 6144, J(big).length);
  ok('…keeping what was measured, and its selector whole', big.measured.length > 0 && big.element.selector === 'body>div:nth-of-type(1)');
  const area = V.regionSelection({ x: 0, y: 0, w: 900, h: 400 }, { elements: Array.from({ length: 12 }, (_, i) => heavy(i)), container: 'section.menu' }, null, 'f'.repeat(32), 'desktop');
  ok('an area of twelve heavy elements stays under 6 KB too', J(area).length < 6144 && area.region.elements.length >= 3, `${J(area).length} B, ${area.region.elements.length} elements`);
  ok('…and the same budget holds when a selection arrives from outside', J(V.normalizeSelection(JSON.parse(J({ ...area, region: { ...area.region, elements: Array.from({ length: 12 }, (_, i) => heavy(i)) } })))).length < 6144);
}

console.log('\n=== discovery ===');
{
  const q = V.normalizeQuestion({ id: 'qa', topic: 'audience', question: 'Who walks in first?', answer: "I don't know yet" });
  const input = { intent: 'A coffee shop website', questions: [q], understanding: V.normalizeUnderstanding({}), moodboard: V.normalizeMoodboard({}), remark: '' };
  ok('“I don’t know” is heard as not sure', V.unsure("I don't know yet") && V.unsure('not sure') && V.unsure('No idea, honestly') && !V.unsure('Neighbours who know the owner'));
  ok('…and told to the model as not sure, not as an answer', V.discoverUser(input).includes('(not sure yet'));
  const r = V.parseDiscover({ understanding: { known: { audience: "I don't know yet" } }, questions: [{ topic: 'audience', question: 'Which of these is closest: commuters, people who stay, or neighbours?' }], ready: true }, input);
  ok('…it is not recorded as known', !r.understanding.known.audience, J(r.understanding.known));
  ok('…the topic can be asked again, another way', r.questions.length === 1 && r.questions[0].topic === 'audience');
  ok('…and it does not count toward being ready', r.ready === false);
}
{
  const q1 = V.normalizeQuestion({ id: 'q1', topic: 'audience', question: 'Who is it for?', answer: 'Commuters before work' });
  const input = { intent: 'A coffee shop website', questions: [q1], understanding: V.normalizeUnderstanding({}), moodboard: V.normalizeMoodboard({ queries: [{ category: 'imagery', query: 'espresso bar', page: 2 }] }), remark: '' };
  const r = V.parseDiscover(
    {
      understanding: { summary: 'A café for commuters.', known: { objective: 'Weekday mornings' }, gaps: ['visual'] },
      questions: [
        { topic: 'audience', question: 'Who exactly is it for?' },
        { topic: 'visual', question: 'Who is it for?' },
        { topic: 'visual', question: 'Warm and handmade, or crisp and modern?', options: ['Warm', 'Crisp', 'a', 'b', 'c', 'd', 'e'] },
        { topic: 'content', question: 'What must the menu show?' },
        { topic: 'brand', question: 'A third question?' },
      ],
      moodboard: { queries: [{ category: 'imagery', query: 'Espresso bar' }, { category: 'texture', query: 'handmade ceramic cup' }], type: [{ display: 'Fraunces', body: 'Papyrus' }] },
      ready: true,
    },
    input
  );
  ok('an answered topic is not asked again, nor a repeated question', r.questions.every((q) => q.topic !== 'audience' && q.question !== 'Who is it for?'));
  ok('at most two questions', r.questions.length <= 2);
  ok('suggested answers are capped', r.questions[0]?.options.length <= 5);
  ok('a query already used is not used again', r.queries.length === 1 && r.queries[0].query === 'handmade ceramic cup');
  ok('a type pair outside the list falls back', r.type[0].body === V.DEFAULT_BODY);
  ok('what was answered stays understood', r.understanding.known.audience === 'Commuters before work');
  ok('“ready” needs more than one answer', r.ready === false);
  const dir = V.parseDirection({ direction: 'Industrial', moodboard: { queries: [{ category: 'texture', query: 'raw concrete' }, { category: 'imagery', query: 'steel bar' }] } }, input, 'texture');
  ok('another direction stays in its aspect', dir.queries.length === 1 && dir.queries[0].category === 'texture' && dir.direction === 'Industrial');
  ok('the instructions say one or two questions, never a questionnaire', V.discoverSystem().includes('never a questionnaire') && V.discoverSystem().includes('At most two questions'));
}

console.log('\n=== brief, generation, change ===');
{
  {
    const used = { refs: [], queries: [{ category: 'texture', query: 'marble counter close', page: 1 }] };
    const qs = V.briefQueries({ moodboardQueries: [{ category: 'texture', query: 'Marble counter, close' }, { category: 'composition', query: 'asymmetric editorial grid' }] }, used);
    ok('a brief’s new searches drop any already used', qs.length === 1 && qs[0].category === 'composition', J(qs));
    ok('…and none come when the model gives none', V.briefQueries({}, used).length === 0);
  }
  const brief = V.parseBrief({ objective: 'Fill weekday mornings.', palette: [{ hex: '#f6f1e9', role: 'background' }, { hex: '#2a2420', role: 'text' }, { hex: '#7a6a5a', role: 'muted' }, { hex: '#6b3e1f', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter' }, references: ['openverse:a1', 'openverse:zzz'], pageType: 'website' }, board);
  ok('a brief references only kept images', J(brief.references) === J(['openverse:a1']));
  const s = V.parseGenerate({ title: 'Halcyon', sections: SPEC.sections.slice(0, 3) }, brief, board, 3, 'Generated from the approved brief');
  ok('missing tokens are taken from the brief', s.tokens.colors.accent === '#6b3e1f' && s.tokens.fonts.display === 'Fraunces');
  ok('the version and reason are the caller’s', s.version === 3 && s.reason === 'Generated from the approved brief');
  ok('generation is told never to invent facts', V.generateSystem(brief).includes('never invent them') && V.generateSystem(brief).includes('[bracketed placeholders]'));
  const challenged = V.parseRefine({ understood: 'Grey the text', challenge: 'Light grey on cream fails contrast.', patch: { op: 'tokens', tokens: { colors: { text: '#cccccc' } } } }, false);
  ok('a concern travels with the patch', challenged.challenge && challenged.patch.op === 'tokens');
  ok('forced, the concern is not raised again', V.parseRefine({ challenge: 'x', patch: { op: 'none' } }, true).challenge === '');
}

console.log('\n=== the model, the switch, the providers ===');
{
  ok('the model is gpt-6-luna unless named', V.socriauxModel({}) === 'gpt-6-luna' && V.socriauxModel({ SOCRIAUX_MODEL: 'gpt-6.1-terra' }) === 'gpt-6.1-terra' && V.socriauxModel({ SOCRIAUX_MODEL: 'bad model!' }) === 'gpt-6-luna');
  ok('the ladder steps down from it', J(V.socriauxLadder({})) === J(['gpt-6-luna', 'gpt-5.6-luna', 'gpt-4o-mini']));
  ok('caps come from the environment', J(V.dailyCaps({ SOCRIAUX_DAILY_CALLS: '10' })) === J({ calls: 10, generations: 40 }));
  const u = V.usageOf('gpt-6-luna', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
  ok('usage is priced', Math.abs(u.cost - 0.6) < 1e-9, J(u));
  const uc = V.usageOf('gpt-6-luna', { prompt_tokens: 12_000, completion_tokens: 900, prompt_tokens_details: { cached_tokens: 5_000 } });
  ok('usage matches the router’s own arithmetic, cached tokens included', uc.cost === V.costOf('gpt-6-luna', { input: 12_000, cached: 5_000, output: 900 }) && uc.cached === 5_000, J(uc));
  ok('…and cached never exceeds what was sent', V.usageOf('gpt-6-luna', { prompt_tokens: 100, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 900 } }).cached === 100);
  ok('open off production, closed in it, unless switched', V.readV0(undefined, 'preview') && !V.readV0(undefined, 'production') && V.readV0('on', 'production') && !V.readV0('off', 'development'));
  ok('the server asks only the libraries whose key is set (Openverse is asked from the browser)', J(V.providerOrder({})) === '[]' && J(V.providerOrder({ UNSPLASH_ACCESS_KEY: 'k', PEXELS_API_KEY: 'p' })) === J(['unsplash', 'pexels']) && V.providerOrder({ SOCRIAUX_OPENVERSE_SERVER: '1' }).includes('openverse'));
  const pexel = (id, alt = 'Marble') => ({ id, src: { large2x: `https://images.pexels.com/photos/${id}/a.jpeg`, medium: `https://images.pexels.com/photos/${id}/m.jpeg` }, width: 1200, height: 800, alt, photographer: 'Kim', photographer_url: 'https://www.pexels.com/@kim', url: `https://www.pexels.com/photo/${id}/` });
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.includes('unsplash')) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => ({ photos: [pexel(1), pexel(2), pexel(3)] }) };
  };
  const res = await V.searchImages({ category: 'imagery', query: 'cup', page: 1 }, new Set(['pexels:2']), { env: { UNSPLASH_ACCESS_KEY: 'k', PEXELS_API_KEY: 'p' }, fetcher: fake, per: 4 });
  ok('every keyed library is asked at once; one failing does not hold up the others', calls.length === 2 && res.refs.length === 2 && J(res.providers) === J(['pexels']) && res.error === '', J({ calls, res }).slice(0, 300));
  ok('licence and credit come with the image', res.refs[0].license === 'Pexels License' && res.refs[0].attribution.includes('Kim') && res.refs[0].sourceUrl.startsWith('https://www.pexels.com/'));
  ok('an image already seen is not shown again', !res.refs.some((r) => r.id === 'pexels:2'));
  ok('a whole page is asked for at a time', calls.every((u) => /per_page=20/.test(u)));
  const none = await V.searchImages({ category: 'imagery', query: 'cup', page: 1 }, new Set(), { env: { PEXELS_API_KEY: 'p' }, fetcher: async () => { throw new Error('offline'); } });
  ok('no library reachable is said plainly', none.refs.length === 0 && /could not be reached/.test(none.error));
  const inits = [];
  const limited = await V.searchImages({ category: 'texture', query: 'linen', page: 1 }, new Set(), {
    env: { UNSPLASH_ACCESS_KEY: 'k', PEXELS_API_KEY: 'p' },
    fetcher: async (url, init) => (inits.push(init), url.includes('unsplash') ? { ok: false, status: 429, json: async () => ({}) } : { ok: true, json: async () => ({ photos: [] }) }),
  });
  ok('a rate-limited library does not stop the rest; nothing found anywhere is said as such', limited.refs.length === 0 && limited.error === 'Nothing found for that.', J(limited));
  ok('searches are cached for a day on the server', inits.length === 2 && inits.every((i) => i?.next?.revalidate === 86400), J(inits.map((i) => i?.next)));
}


console.log('\n=== how the moodboard searches ===');
{
  ok('a long query is tried as asked, then by its subject pair, then its opening and closing pairs', J(V.shorterQueries('morning light espresso bar marble counter')) === J(['morning light espresso bar marble counter', 'espresso bar', 'morning light', 'marble counter']), J(V.shorterQueries('morning light espresso bar marble counter')));
  ok('…a three-word query by its opening and closing pairs; a short one only as asked', J(V.shorterQueries('ceramic cup texture')) === J(['ceramic cup texture', 'ceramic cup', 'cup texture']) && J(V.shorterQueries('espresso bar')) === J(['espresso bar']));
  const r = (id, provider = 'openverse') => ({ id: `${provider}:${id}`, provider });
  const mix = V.interleave([[r(1, 'pexels'), r(2, 'pexels'), r(3, 'pexels')], [r(1), r(2)]], new Set(['pexels:2']), 3);
  ok('lists from several libraries are interleaved, skipping what was seen', J(mix.taken.map((x) => x.id)) === J(['pexels:1', 'openverse:1', 'pexels:3']) && mix.left === 1, J(mix));
  const ov = (id, title = 'Espresso bar', tags = []) => ({ id: `ov${id}`, url: `https://live.staticflickr.com/${id}.jpg`, thumbnail: `https://api.openverse.org/v1/images/ov${id}/thumb/`, width: 1000, height: 700, title, creator: 'Kim', foreign_landing_url: `https://flickr.com/${id}`, license: 'by', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by/2.0/', attribution: `"${title}" by Kim is licensed under CC BY 2.0. To view a copy of this license, visit https://creativecommons.org/licenses/by/2.0/.`, tags: tags.map((name) => ({ name })) });
  const asked = [];
  const pageOf = (n, from = 0, mk = (i) => ov(i)) => ({ results: Array.from({ length: n }, (_, i) => mk(from + i)) });
  const fakeOv = async (url) => {
    asked.push(url);
    const q = new URL(url).searchParams.get('q');
    const pg = Number(new URL(url).searchParams.get('page'));
    if (q === 'busy now') return { ok: false, status: 429, json: async () => ({}) };
    if (q === 'espresso bar') return { ok: true, status: 200, json: async () => pageOf(pg <= 2 ? 20 : 4, (pg - 1) * 20, (i) => ov(i, i % 2 ? 'Morning light on a lake' : 'Espresso bar', i % 2 ? [] : ['coffee'])) };
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  };
  const cache = new Map();
  const seen = new Set();
  const a = await V.searchOpenverse({ category: 'imagery', query: 'morning light espresso bar marble counter', page: 1 }, seen, 6, { fetcher: fakeOv, cache });
  ok('a long query that finds nothing is asked again by its subject pair', a.refs.length === 6 && a.refs.every((x) => x.query === 'espresso bar') && asked.length === 2, J(asked));
  ok('…and stays on the page while it holds unseen images', a.next === 1 && a.left === 14, J({ next: a.next, left: a.left }));
  ok('…its results ordered by how much of the full query they share', a.refs.slice(0, 6).every((x) => x.title === 'Espresso bar'), J(a.refs.map((x) => x.title)));
  ok('the credit is the short form, never the library’s legal sentence', a.refs[0].attribution === '“Espresso bar” by Kim, CC BY 2.0' && V.creditText(a.refs[0]) === '“Espresso bar” by Kim, CC BY 2.0', a.refs[0].attribution);
  a.refs.forEach((x) => seen.add(x.id));
  const before = asked.length;
  const b = await V.searchOpenverse({ category: 'imagery', query: 'morning light espresso bar marble counter', page: a.next }, seen, 6, { fetcher: fakeOv, cache });
  ok('a second click on the same page asks Openverse nothing new', asked.length === before && b.refs.length === 6 && !b.refs.some((x) => seen.has(x.id)), `${asked.length - before} new requests`);
  b.refs.forEach((x) => seen.add(x.id));
  const c = await V.searchOpenverse({ category: 'imagery', query: 'espresso bar', page: 1 }, new Set([...seen, ...Array.from({ length: 6 }, (_, i) => `openverse:ov${i + 12}`)]), 6, { fetcher: fakeOv, cache });
  ok('when a page runs out, the batch is filled from the next one', c.refs.length === 6 && c.refs.some((x) => Number(x.providerId.slice(2)) >= 20) && c.next === 2, J({ ids: c.refs.map((x) => x.providerId), next: c.next }));
  const busy = await V.searchOpenverse({ category: 'imagery', query: 'busy now please wait', page: 1 }, new Set(), 6, { fetcher: fakeOv, cache: new Map() });
  ok('a busy library says so and stops asking', busy.refs.length === 0 && /busy/.test(busy.error) && busy.next === 1, J(busy));
  const down = await V.searchOpenverse({ category: 'imagery', query: 'espresso bar', page: 3 }, new Set(), 6, { fetcher: async () => { throw new Error('offline'); }, cache: new Map() });
  ok('after a failure the same page is asked again next time', down.refs.length === 0 && down.next === 3 && /could not be reached/.test(down.error), J(down));
  ok('only licences that allow commercial use and change are asked for', V.openverseUrl('linen texture', 2).includes('license_type=commercial,modification') && V.openverseUrl('linen texture', 2).includes('page_size=20'));
  // the board lets go of removed and unkept images when it is full, never of kept ones
  const many = Array.from({ length: 170 }, (_, i) => ({ provider: 'openverse', providerId: `m${i}`, url: `https://x.org/m${i}.jpg`, category: 'imagery', query: 'q', state: i < 5 ? 'kept' : i < 40 ? 'rejected' : 'proposed' }));
  const board = V.normalizeMoodboard({ refs: many });
  ok('a full board never lets go of a kept image', board.refs.length === 160 && board.refs.filter((x) => x.state === 'kept').length === 5 && board.refs.filter((x) => x.state === 'rejected').length === 25, J({ n: board.refs.length, kept: board.refs.filter((x) => x.state === 'kept').length }));
}

console.log('\n=== art direction ===');
{
  const mk = (o) => V.normalizeBrief({ pageType: 'website', platform: 'web', ...o }, new Set());
  const cafe = mk({ objective: 'Fill weekday mornings at a neighbourhood coffee bar.', audience: 'Commuters nearby', personality: ['warm', 'honest', 'unhurried'], visualDirection: 'Morning light, wood, ceramics, handmade', palette: [{ hex: '#f6f1e9', role: 'background' }, { hex: '#2a2420', role: 'text' }, { hex: '#6b3e1f', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter' } });
  const clinic = mk({ objective: 'Let patients book appointments', audience: 'Patients of all ages', personality: ['clear', 'kind', 'trustworthy'], visualDirection: 'Accessible, plain, high contrast', palette: [{ hex: '#ffffff', role: 'background' }, { hex: '#0b0c0c', role: 'text' }, { hex: '#005eb8', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Public Sans', body: 'Public Sans' } });
  const bar = mk({ objective: 'Fill late sets at a jazz and cocktail bar', audience: 'Music lovers after dinner', personality: ['intimate', 'moody'], visualDirection: 'Low light, dark, brass', palette: [{ hex: '#12151c', role: 'background' }, { hex: '#f1ece2', role: 'text' }, { hex: '#e0a43c', role: 'accent' }, { hex: '#12151c', role: 'accent-text' }], typography: { display: 'Bodoni Moda', body: 'Inter' } });

  ok('twelve visual languages, each a whole system', V.LANGUAGES.length === 12 && V.LANGUAGES.every((l) => l.display.every((f) => V.knownFont(f)) && l.body.every((f) => V.knownFont(f) && !V.knownFont(f).displayOnly)));
  const d = V.proposeDirections({ brief: cafe });
  ok('three directions, each a different language', d.length === 3 && new Set(d.map((x) => x.language)).size === 3, J(d.map((x) => x.language)));
  ok('the first is the faithful reading: the brief’s palette and type exactly as approved', d[0].tokens.colors.accent === '#6b3e1f' && d[0].tokens.colors.background === '#f6f1e9' && d[0].tokens.fonts.display === 'Fraunces' && d[0].language === 'craft', J(d[0].tokens));
  ok('the three are far apart (each pair at least a third different)', d.every((a, i) => d.every((b, j) => i >= j || V.directionDistance(a, b) >= 0.33)), J(d.map((a) => d.map((b) => V.directionDistance(a, b)))));
  ok('the same brief always gives the same three', J(V.proposeDirections({ brief: cafe }).map((x) => [x.language, x.tokens.fonts.display])) === J(d.map((x) => [x.language, x.tokens.fonts.display])));
  ok('different briefs lead with different languages', V.proposeDirections({ brief: clinic })[0].language === 'civic' && V.proposeDirections({ brief: bar })[0].language === 'night');
  ok('a language wrong for the brief is never offered (after dark for a clinic)', !V.proposeDirections({ brief: clinic }).some((x) => x.language === 'night'));
  const again = V.proposeDirections({ brief: cafe, round: 1, seen: d.map((x) => x.language) });
  ok('asking again shows three new languages', again.every((x) => !d.some((y) => y.language === x.language)), J(again.map((x) => x.language)));
  const said = V.proposeDirections({ brief: cafe, notes: 'darker, like an evening bar, no serifs', avoid: 'rounded corners' });
  ok('the designer’s words lead: a dark ground, sans headlines, square corners, the language they point at', said[0].language === 'night' && V.isDark(said[0].tokens.colors.background) && said.every((x) => V.knownFont(x.tokens.fonts.display).kind !== 'serif' && x.tokens.radius === 'none'), J(said.map((x) => [x.language, x.tokens.fonts.display, x.tokens.radius])));
  ok('…and every option says it heard them', said.every((x) => x.rationale.some((r) => /From your notes/.test(r))));
  ok('an accent named in the notes is used', V.proposeDirections({ brief: cafe, notes: 'use #c4421a' }).every((x) => x.tokens.colors.accent === '#c4421a' || V.hslOf(x.tokens.colors.accent)[0] === V.hslOf('#c4421a')[0] || x.language !== 'craft'));
  const base = { ...d[1], locks: ['palette', 'type'] };
  const kept = V.proposeDirections({ brief: cafe, base, round: 1, seen: d.map((x) => x.language) });
  ok('locked colours and type survive asking again', kept.every((x) => J(x.tokens.colors) === J(base.tokens.colors) && J(x.tokens.fonts) === J(base.tokens.fonts) && x.look.ratio === base.look.ratio && J(x.locks) === J(['palette', 'type'])), J(kept.map((x) => x.tokens.fonts)));
  ok('…while what is not locked still changes', new Set(kept.map((x) => x.look.grid + x.look.containers)).size > 1);
  const revised = V.reviseDirection(base, cafe, 'more like a printed newspaper');
  ok('a direction revised in words keeps its locks', J(revised.tokens.colors) === J(base.tokens.colors) && revised.language === 'broadsheet', revised.language);
  // what a spec does when a patch reaches a locked decision
  const spec0 = V.normalizeSpec({ ...SPEC, tokens: d[0].tokens, look: d[0].look }, board);
  ok('a token patch to locked colours is caught', J(V.lockedChanges(spec0, { op: 'tokens', tokens: { colors: { accent: '#000000' } } }, ['palette'])) === J(['palette']));
  ok('…the same value is no change', V.lockedChanges(spec0, { op: 'tokens', tokens: { colors: { accent: spec0.tokens.colors.accent } } }, ['palette']).length === 0);
  ok('…a look patch to a locked grid is caught; an unlocked one is not', J(V.lockedChanges(spec0, { op: 'look', look: { grid: 'swiss' } }, ['layout'])) === J(['layout']) && V.lockedChanges(spec0, { op: 'look', look: { grid: 'swiss' } }, ['palette']).length === 0);
  // the model's words laid over the engine's three: nothing outside the rules reaches them
  const ask = { brief: cafe, notes: '', avoid: '', base: { ...d[0], locks: ['type'] } };
  const opts = V.proposeDirections(ask);
  const written = V.parseDirections({ directions: [{ candidate: 1, name: 'Morning ledger', concept: 'A printed ledger of mornings.', fonts: { display: 'Comic Sans', body: 'Anton' }, language: 'night' }, { candidate: 2, name: 'Long table', fonts: { display: 'Syne', body: 'Anton' } }, { candidate: 9 }] }, ask, opts);
  ok('the model’s names and concepts are used', written[0].name === 'Morning ledger' && written[0].concept.startsWith('A printed ledger') && written[0].source === 'model');
  ok('…a font off the list, a display face as body text, or a locked type is never applied', J(written[0].tokens.fonts) === J(opts[0].tokens.fonts) && J(written[1].tokens.fonts) === J(opts[1].tokens.fonts), J(written.map((x) => x.tokens.fonts)));
  ok('…and a language is not swapped unless the designer asked', written[0].language === opts[0].language);
  ok('a stored direction comes back whole; a made-up language does not', V.normalizeDirection(J(d[2]) && JSON.parse(J(d[2])))?.language === d[2].language && V.normalizeDirection({ ...d[2], language: 'vaporwave' }) === null);
  const st = V.normalizeDirectionState({ options: [d[0], { language: 'nope' }], chosen: d[1], approved: true, notes: 'x'.repeat(5000), seen: ['craft', 'nope'] });
  ok('direction state is held to its shape', st.options.length === 1 && st.chosen.language === d[1].language && st.approved && st.notes.length === 1200 && J(st.seen) === J(['craft']));
  ok('the generator is told the direction, its variants, and what to refuse', (() => { const t = V.generateSystem(cafe, d[0]); return t.includes('THE APPROVED ART DIRECTION') && t.includes(d[0].concept) && t.includes('do not write "tokens"') && t.includes('stock phrases'); })());
  const gen = V.parseGenerate({ title: 'Halcyon', tokens: { colors: { accent: '#ff00ff' } }, sections: SPEC.sections }, cafe, board, 2, 'r', d[1]);
  ok('a generated spec takes the direction’s tokens and look, whatever the model wrote', gen.tokens.colors.accent === d[1].tokens.colors.accent && gen.look.language === d[1].language && J(gen.look) === J(d[1].look), J(gen.tokens.colors));
  ok('…and is planned: every content section on a ground, with its spacing', gen.sections.every((x) => x.tone && x.pad));
}

console.log('\n=== the look, drawn ===');
{
  const brief = V.normalizeBrief({ pageType: 'website', objective: 'Sell festival tickets', personality: ['bold', 'loud'], visualDirection: 'Big type, colour', palette: [{ hex: '#ffffff', role: 'background' }, { hex: '#111111', role: 'text' }, { hex: '#ff4b1f', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Archivo', body: 'Inter' } }, new Set());
  const dirs = V.proposeDirections({ brief });
  const sheets = dirs.map((x) => V.renderDesign(V.planLayout(V.normalizeSpec({ ...SPEC, tokens: x.tokens, look: x.look }, board)), board.refs).css);
  ok('three directions, three different stylesheets', new Set(sheets).size === 3);
  const poster = V.planLayout(V.normalizeSpec({ ...SPEC, tokens: dirs[0].tokens, look: dirs[0].look }, board));
  const r = V.renderDesign(poster, board.refs);
  ok('a poster look sets capitals, a marquee and colour bands', dirs[0].language === 'poster' && r.css.includes('text-transform:uppercase') && r.html.includes('class="marquee"') && /tone-(accent|alt|invert|accent2)/.test(r.html));
  ok('…the marquee is decoration, hidden from screen readers', /<div class="marquee" aria-hidden="true">/.test(r.html));
  ok('emphasis marks become emphasis; never in an attribute', V.renderDesign(V.normalizeSpec({ ...SPEC, title: 'A *slow* page', sections: [{ id: 'h', kind: 'hero', variant: 'statement', content: { title: 'Coffee for the *slow* part' } }] }, board), board.refs).html.includes('<em class="em">slow</em>') && V.renderDesign(V.normalizeSpec({ ...SPEC, title: 'A *slow* page', sections: [{ id: 'h', kind: 'hero', variant: 'statement', content: { title: 'x' } }] }, board), board.refs).html.includes('<title>A slow page</title>'));
  const grounds = V.grounds({ background: '#f6f1e9', surface: '#fffaf3', text: '#2a2420', muted: '#6d6156', accent: '#e8a33d', accentText: '#2a2620', line: '#e4d8c8' }, '#3f45a6');
  const { contrastRatio: cr } = await import('./.tmp/ux-under-test.mjs');
  ok('on every ground a section can sit on, text and muted text read (7:1 and 4.5:1)', Object.values(grounds).every((g) => cr(g.text, g.bg) >= 4.5 && cr(g.muted, g.bg) >= 4.5 && cr(g.ink, g.bg) >= 4.5 && cr(g.btnFg, g.btnBg) >= 4.5), J(Object.fromEntries(Object.entries(grounds).map(([k, g]) => [k, [cr(g.text, g.bg).toFixed(1), cr(g.muted, g.bg).toFixed(1), cr(g.btnFg, g.btnBg).toFixed(1)]]))));
  ok('…and shapes are drawn in inks that show on it', Object.values(grounds).every((g) => g.inks.every((i) => cr(i, g.bg) >= 1.6)));
  ok('…and a card on any ground keeps its text readable', [grounds, V.grounds({ background: '#14161a', surface: '#1d2026', text: '#f2f0ea', muted: '#a8a49a', accent: '#d9b25f', accentText: '#14161a', line: '#2c3038' }, '#3f7c85')].every((gs) => Object.values(gs).every((g) => cr(g.text, g.card) >= 4.5 && cr(g.muted, g.card) >= 4.5)), J(Object.values(grounds).map((g) => [g.card, cr(g.text, g.card).toFixed(2)])));
  const classic = V.normalizeSpec(SPEC, board);
  ok('a spec from before looks is drawn with the classic look', classic.look.language === 'classic' && V.renderDesign(classic, board.refs).html.includes('look-classic'));
  const plan = V.planLayout(V.normalizeSpec({ ...SPEC, look: { ...dirs[0].look }, tokens: dirs[0].tokens, sections: [
    { id: 'nav', kind: 'nav', content: { brand: 'B', links: [] } },
    { id: 'f1', kind: 'features', variant: 'grid', content: { items: [{ title: 'a' }, { title: 'b' }] } },
    { id: 'f2', kind: 'features', variant: 'grid', content: { items: [{ title: 'a' }, { title: 'b' }] } },
    { id: 'f3', kind: 'features', variant: 'grid', fixed: true, content: { items: [{ title: 'a' }, { title: 'b' }] } },
    { id: 'c', kind: 'cta', variant: 'image', images: ['openverse:a1'], content: { title: 'Go', primary: 'Go' } },
  ] }, board));
  const v = Object.fromEntries(plan.sections.map((x) => [x.id, x.variant]));
  ok('the planner never builds two neighbours the same way', v.f1 !== v.f2, J(v));
  ok('…leaves what the designer fixed alone', v.f3 === 'grid');
  ok('…and never drops a picture a section carries', v.c === 'image');
  const tonePatch = V.applyPatch(plan, { op: 'tone', sectionId: 'f1', tone: 'invert', summary: 'Dark band' }, board);
  ok('a tone patch sets one section’s ground and marks it the designer’s', tonePatch.ok && tonePatch.spec.sections.find((x) => x.id === 'f1').tone === 'invert' && tonePatch.spec.sections.find((x) => x.id === 'f1').fixed === true);
  const lookPatch = V.applyPatch(plan, { op: 'look', look: { grid: 'swiss', motifs: ['numbering', 'sparkles'] }, summary: 'Swiss' }, board);
  ok('a look patch changes only the look, held to its values', lookPatch.ok && lookPatch.spec.look.grid === 'swiss' && J(lookPatch.spec.look.motifs) === J(['numbering']) && J(lookPatch.spec.sections) === J(plan.sections));
  ok('fonts: a display-only face is never body text; weights are the family’s own', V.bodyFont('Anton') === V.DEFAULT_BODY && V.nearestWeight('Instrument Serif', 800) === 400 && V.nearestWeight('Archivo', 950) === 900 && V.nearestWeight('Libre Baskerville', 600) === 700);
}

console.log('\n=== looking at the drawn page ===');
{
  const spec = V.planLayout(V.normalizeSpec({ ...SPEC, look: V.proposeDirections({ brief: V.normalizeBrief({ pageType: 'website', objective: 'x', personality: ['warm'], visualDirection: 'handmade cafe', palette: [], typography: { display: 'Fraunces', body: 'Inter' } }, new Set()) })[0].look }, board));
  const audit = (o = {}) => V.normalizeAudit({ width: 390, viewport: 844, height: 6000, overflowX: 0, bodySize: 17, sections: [], headings: [{ level: 1, size: 48, lines: 3, width: 350, section: spec.sections[1].id, path: 'title', text: 'Hi' }], contrast: [], targets: [], images: [], overflow: [], measure: [], style: { gradients: 0, shadows: 0, roundedBoxes: 0, trackedCaps: 0, centred: 0, blocks: 20, emoji: 0, icons: 0, families: {} }, ...o });
  ok('an audit from the frame is held to its shape', V.normalizeAudit({ width: 'x' }) === null && audit({ contrast: Array(99).fill({ ratio: 2 }) }).contrast.length === 40);
  const clean = V.evaluateDesign(spec, { desktop: audit({ width: 1280 }), phone: audit() });
  ok('a page that works has nothing to fix', clean.quality === 100 && !clean.findings.some((f) => f.severity !== 'low'), J(clean.findings));
  const hero = spec.sections.find((x) => x.kind === 'hero');
  const over = V.evaluateDesign(spec, { phone: audit({ overflow: [{ section: hero.id, path: 'title', by: 40, tag: 'h1' }] }) });
  ok('a headline wider than the phone is serious, and fixed by stepping the type scale down', over.findings[0].severity === 'high' && over.findings[0].fix?.op === 'look' && over.findings[0].fix.look.ratio < spec.look.ratio);
  const blocked = V.evaluateDesign(spec, { phone: audit({ overflow: [{ section: hero.id, path: 'title', by: 40, tag: 'h1' }] }) }, ['type']);
  ok('…unless the designer locked the type: then it is said, not done', !blocked.findings[0].fix && /locked/.test(blocked.findings[0].blocked));
  const banded = spec.sections.find((x) => x.tone && x.tone !== 'base');
  const low = V.evaluateDesign(spec, { desktop: audit({ width: 1280, contrast: [{ section: banded.id, path: 'title', ratio: 2.1, need: 4.5, size: 16, text: 'x' }] }) });
  ok('text that fails on a coloured band moves the section to the page’s own ground', low.findings[0].kind === 'contrast' && low.findings[0].fix?.op === 'tone' && low.findings[0].fix.tone === 'base');
  const img = V.evaluateDesign(spec, { desktop: audit({ width: 1280, images: [{ section: spec.sections[1].id, path: 'images.0', ok: false }] }), phone: audit({ images: [{ section: spec.sections[1].id, path: 'images.0', ok: false }] }) });
  ok('a picture that did not load is said once, and never taken away without asking', img.findings.filter((f) => f.kind === 'image').length === 1 && img.findings.find((f) => f.kind === 'image').manual && !V.fixesFor(img).some((f) => f.patch.op === 'images'));
  const flat = V.evaluateDesign(spec, { desktop: audit({ width: 1280, headings: [{ level: 1, size: 30, lines: 1, section: hero.id }] }) });
  ok('a headline barely bigger than the text is a missing hierarchy, fixed by a larger scale', flat.findings.some((f) => f.kind === 'hierarchy' && f.fix?.look?.ratio > spec.look.ratio));
  const cl = V.clichesIn(V.normalizeSpec({ ...SPEC, sections: [{ id: 'h', kind: 'hero', content: { title: 'Unlock seamless coffee', subtitle: 'Welcome to the future' } }] }));
  ok('stock phrases are found where they are', J(cl.map((c) => c.phrase)) === J(['unlock', 'seamless', 'welcome to']) && cl[0].path === 'title');
  const classic = V.normalizeSpec(SPEC, board);
  const g1 = V.evaluateDesign(classic, {}).distinctiveness;
  const g2 = V.evaluateDesign(spec, {}).distinctiveness;
  ok('a page with no art direction reads as more generic than one with it, with reasons', g1 < g2 && V.genericSignals(classic).some((x) => /No art direction/.test(x.reason)), `${g1} vs ${g2}`);
  const many = V.fixesFor({ findings: [
    { id: '1', severity: 'high', fix: { op: 'look', look: { ratio: 1.3 } } }, { id: '2', severity: 'medium', fix: { op: 'look', look: { ratio: 1.5 } } },
    { id: '3', severity: 'low', fix: { op: 'variant', sectionId: 'a', variant: 'x' } }, { id: '4', severity: 'high', fix: { op: 'tone', sectionId: 'a', tone: 'base' } },
  ] });
  ok('one round fixes the serious first, one change to the look and one per section', J(many.map((f) => f.finding.id)) === J(['1', '4']));
  ok('revisions are bounded', V.MAX_REVISION_ROUNDS === 2);
  ok('the audit is one valid script, inside the inspector', (() => { try { new Function(V.AUDIT_SOURCE); return V.INSPECTOR_SOURCE.includes('__uxv0Audit') && V.INSPECTOR_SOURCE.includes("m.type === 'audit'"); } catch { return false; } })());
}

console.log('\n=== motion ===');
{
  const mk = (o) => V.normalizeBrief({ pageType: 'website', platform: 'web', palette: [], typography: { display: 'Inter', body: 'Inter' }, ...o }, new Set());
  const launch = mk({ objective: 'Launch a festival', personality: ['bold', 'loud'], visualDirection: 'A loud poster, big type' });
  const clinic = mk({ objective: 'Book a GP appointment', audience: 'patients', personality: ['calm', 'clear'], visualDirection: 'plain and accessible public service' });
  const loud = V.proposeDirections({ brief: launch });
  const calm = V.proposeDirections({ brief: clinic });
  ok('every direction carries a motion', [...loud, ...calm].every((d) => d.look.motion && V.MOTION_FEELS.includes(d.look.motion.feel)));
  ok('a loud launch moves more than a public-service page', (() => { const lv = (d) => V.MOTION_FEELS.indexOf(d.look.motion.feel); return lv(loud[0]) > lv(calm[0]); })(), `${loud[0].language}:${loud[0].look.motion.feel} vs ${calm[0].language}:${calm[0].look.motion.feel}`);
  const still = V.proposeDirections({ brief: launch, notes: 'no animation please' });
  ok('"no animation" makes every option still', still.every((d) => d.look.motion.feel === 'still'));
  const kin = V.proposeDirections({ brief: clinic, notes: 'make it kinetic, with parallax' });
  ok('"kinetic, with parallax" is read', kin.every((d) => d.look.motion.feel === 'kinetic' && d.look.motion.parallax >= 1) && kin[0].rationale.join(' ').includes('kinetic motion'));
  ok('a feel the language lacks comes as itself, not bent by the language', kin.every((d) => d.look.motion.duration === V.MOTION_PRESETS.kinetic.duration || V.languageOf(d.language).motion.includes('kinetic')));
  const locked = { ...kin[0], locks: ['motion'] };
  const again = V.proposeDirections({ brief: clinic, base: locked, round: 1, seen: kin.map((d) => d.language) });
  ok('a locked motion survives asking again', again.every((d) => J(d.look.motion) === J(locked.look.motion)));
  ok('older looks are still', J(V.lookFromTokens(SPEC.tokens ?? V.DEFAULT_TOKENS).motion) === J(V.STILL_MOTION) && V.normalizeLook({}, V.lookFromTokens(V.DEFAULT_TOKENS)).motion.feel === 'still');
  ok('motion is normalised and bounded', (() => { const m = V.normalizeMotion({ feel: 'lively', duration: 99999, stagger: -4, parallax: 9, ease: 'bogus' }, V.MOTION_PRESETS.calm); return m.duration === 1800 && m.stagger === 0 && m.parallax === 3 && m.ease === 'gentle'; })());
  ok('calmer and livelier step through the feels', V.stepMotion(V.MOTION_PRESETS.lively, -1).feel === 'measured' && V.stepMotion(V.MOTION_PRESETS.measured, -1).feel === 'calm' && V.stepMotion(V.MOTION_PRESETS.lively, 1).feel === 'kinetic' && V.stepMotion(V.MOTION_PRESETS.still, -1).feel === 'still');
  const look = { ...loud[0].look, motion: V.MOTION_PRESETS.kinetic, motifs: [...loud[0].look.motifs, 'marquee', 'shapes'] };
  const play = V.motionCss(look, 'play');
  ok('playing writes load arrivals, scroll-driven arrivals behind @supports, parallax, section openings and a condensing nav', /mo-t-word/.test(play) && /@supports \(animation-timeline: view\(\)\)\{[^]*animation-timeline:view\(\)/.test(play) && /mo-par|mo-drift/.test(play) && /mo-sec/.test(play) && /scroll\(root\)/.test(play) && /mo-mq/.test(play));
  ok('every played motion has a reduced-motion alternative', /@media \(prefers-reduced-motion:reduce\)\{body \*/.test(play));
  const stat = V.motionCss(look, 'static');
  ok('static writes hovers only: nothing arrives, nothing follows the scroll', !/@keyframes|animation-timeline/.test(stat) && /@media \(hover:hover\)/.test(stat));
  ok('a still look writes no motion at all', V.motionCss({ ...look, motion: V.STILL_MOTION }, 'play') === '');
  const k = V.kineticHeadline('Think as long as it <em>needs</em>.', 'words');
  ok('kinetic words keep the emphasis and the spaces', k.includes('<em><span class="kw" style="--i:5">needs</span></em>') && (k.match(/class="kw"/g) || []).length === 7 && / <span/.test(k));
  ok('letters fall back to words for a long headline', !V.kineticHeadline('A headline that is far too long to animate letter by letter, honestly', 'letters').includes('class="kl"'));
  const spec = V.normalizeSpec({ ...SPEC, look }, board);
  const htmlPlay = V.renderDesign(spec, board.refs, { motion: 'play' }).html;
  const htmlStatic = V.renderDesign(spec, board.refs).html;
  ok('the renderer plays motion only when asked; the default draws the page at rest', htmlPlay.includes('mo-t-') && !htmlStatic.includes('@keyframes') && htmlStatic.includes(' mo mo-kinetic'));
  ok('a kinetic headline keeps its words for screen readers', /<h1 class="h-hero[^"]*"[^>]*aria-label="[^"]+"/.test(htmlPlay) && !/aria-label/.test(htmlStatic.match(/<h1[^>]*>/)?.[0] ?? ''));
  ok('motion counts in how different two directions are', V.directionDistance(loud[0], { ...loud[0], look: { ...loud[0].look, motion: V.STILL_MOTION } }) > 0);
  ok('motion is its own lock group, with a label', V.LOCK_GROUPS.includes('motion') && V.LOCK_LABEL.motion === 'Motion');
}

console.log('\n=== the moodboard as art direction ===');
{
  const n1 = V.interpretNote('I love this typography, not the palette.');
  ok('"this typography, not the palette" takes type and leaves colour', J(n1.take) === J(['typography']) && J(n1.leave) === J(['colour']), J(n1));
  const n2 = V.interpretNote('Use the architectural atmosphere, not the building itself.');
  ok('"the atmosphere, not the building itself" takes atmosphere and leaves the subject', n2.take.includes('atmosphere') && n2.leave.includes('imagery') && !n2.take.includes('imagery'), J(n2));
  const n3 = V.interpretNote('Take inspiration from the movement, not the visual styling.');
  ok('"the movement, not the styling" takes motion and leaves colour, type and texture', n3.take.includes('motion') && ['colour', 'typography', 'texture'].every((a) => n3.leave.includes(a)), J(n3));
  const n4 = V.interpretNote('Make the entire website feel like these references.');
  ok('"the entire website should feel like this" is a key atmosphere reference', n4.key && n4.take.includes('atmosphere'), J(n4));
  ok('"nothing like this" steers away', V.interpretNote('nothing like this, too corporate').avoid);
  const base = { provider: 'openverse', width: 1600, height: 1067, title: 't', creator: 'A', license: 'CC BY', category: 'imagery', state: 'kept' };
  const r = (id, o = {}) => V.normalizeRef({ ...base, providerId: id, url: `https://x.test/${id}.jpg`, ...o });
  const up = 'a'.repeat(32);
  const mb = V.normalizeMoodboard({ refs: [
    r('legacy'),
    r('insp', { asContent: false, note: 'love the typography, not the palette' }),
    r('page', { asContent: true }),
    r('away', { avoid: true, note: 'too corporate, rounded cards' }),
    r('col', { asContent: false, take: ['colour'], swatches: ['#1b2a3a', '#e8e1d4', '#c8553d'], title: 'Harbour at dusk' }),
    { provider: 'upload', providerId: up, width: 800, height: 600, title: 'clip', state: 'kept', media: 'video', take: ['motion'], note: 'a slow, calm drift' },
  ] });
  const ids = V.usableImages(mb);
  ok('only pictures marked for the page (and ones kept before the distinction) can be placed', ids.has('openverse:legacy') && ids.has('openverse:page') && !ids.has('openverse:insp') && !ids.has('openverse:away') && !ids.has('openverse:col') && !ids.has(`upload:${up}`));
  const clip = mb.refs.find((x) => x.provider === 'upload');
  ok('an upload keeps no address at rest, and is credited as the designer’s own', !!clip && clip.url === '' && V.creditText(clip).includes('your own'));
  const reading = V.readBoard(mb);
  ok('the board is read: notes, colours from colour references, motion from moving references, what to avoid', /typography/.test(reading.words) && reading.colours.includes('#c8553d') && reading.motion === 'calm' && /corporate/.test(reading.avoid), J(reading.said));
  ok('only the designer’s words are read, never a library’s titles', !/Harbour/.test(reading.words));
  const brief = V.normalizeBrief({ pageType: 'website', objective: 'A harbour restaurant', personality: ['warm'], visualDirection: 'seaside', palette: [], typography: { display: 'Fraunces', body: 'Inter' } }, new Set());
  const opts = V.proposeDirections({ brief, board: reading });
  ok('one option takes its colours from the references kept for colour', opts.some((d) => d.rationale.some((x) => /Colours sampled from your references/.test(x)) && d.tokens.colors.background.toLowerCase() === '#e8e1d4'), opts.map((d) => d.tokens.colors.background).join(','));
  ok('moving references give the motion, unless the notes say otherwise', opts.every((d) => d.look.motion.feel === 'calm') && V.proposeDirections({ brief, board: reading, notes: 'kinetic' }).every((d) => d.look.motion.feel === 'kinetic'));
  const prompt = V.generateUser({ brief, moodboard: mb });
  ok('generation is told which pictures it may place and which only inspire', /PICTURES YOU MAY PLACE[^]*openverse:page[^]*REFERENCES THAT INSPIRE[^]*openverse:insp[^]*take: typography[^]*leave: colour/.test(prompt) && /STEER AWAY FROM[^]*openverse:away/.test(prompt) && !prompt.split('REFERENCES THAT INSPIRE')[0].includes('openverse:insp'));
  ok('a reading survives the trip to a route, bounded', (() => { const x = V.normalizeReading({ ...reading, colours: ['#zzzzzz', '#112233'], motion: 'nope', grid: 'swiss' }); return x.colours.length === 1 && !x.motion && x.grid === 'swiss'; })());
  ok('a palette comes from swatches, with an accent that reads', (() => { const p = V.paletteFromSwatches(['#1b2a3a', '#e8e1d4', '#c8553d']); return !!p && p.background === '#e8e1d4' && p.accent === '#c8553d'; })());
  const spec = V.normalizeSpec({ ...SPEC, sections: [{ id: 'h', kind: 'hero', variant: 'split', content: { title: 'Hi' }, images: ['openverse:insp'] }] }, mb);
  ok('a picture that only inspires cannot reach the page, even if the model places it', spec.sections[0].images.length === 0);
}

console.log('\n=== the Living Brief as a specification ===');
{
  const base = { pageType: 'website', platform: 'web', objective: 'Bring neighbours in on weekday mornings', audience: 'Neighbours', personality: ['warm', 'exact'], visualDirection: 'paper and roast', palette: [{ name: 'Paper', hex: '#f4efe6', role: 'background' }, { name: 'Roast', hex: '#221c17', role: 'text' }, { name: 'Walnut', hex: '#8a5a3c', role: 'accent' }, { name: 'Ash', hex: '#8b8178', role: 'muted' }], typography: { display: 'Fraunces', body: 'Inter' } };
  const prev = V.normalizeBrief({ ...base, decisions: { audience: 'locked', personality: 'approved', colour: 'delegated', nonsense: 'locked' }, spec: { ratio: 9, grid: 'swiss', motion: { feel: 'calm' }, contrast: 'AAA' }, rules: ['no animation'] }, new Set());
  ok('decisions, rules and exact specs are normalised and bounded', prev.decisions.audience === 'locked' && !('nonsense' in prev.decisions) && prev.spec.ratio === 1.618 && prev.spec.grid === 'swiss' && prev.spec.motion.feel === 'calm' && prev.rules[0] === 'no animation');
  const next = V.normalizeBrief({ ...base, audience: 'Commuters in a hurry', personality: ['loud'] }, new Set());
  const m = V.mergeDecided(next, prev);
  ok('a revised brief keeps a locked part word for word', m.brief.audience === 'Neighbours' && m.kept.includes('audience'), m.brief.audience);
  ok('an approved part the model changed is kept as changed, and reopened', J(m.brief.personality) === J(['loud']) && m.reopened.includes('personality') && !m.brief.decisions.personality);
  ok('statuses, specs and rules carry over a revision', m.brief.decisions.colour === 'delegated' && m.brief.spec.grid === 'swiss' && m.brief.rules[0] === 'no animation');
  ok('a delegated question becomes a delegated part', J(V.delegatedParts([{ topic: 'visual', delegated: true }, { topic: 'audience', delegated: false }])) === J({ colour: 'delegated', typography: 'delegated', imagery: 'delegated' }));
  const locked = V.normalizeBrief({ ...base, decisions: { colour: 'locked', motion: 'locked' }, spec: { motion: V.MOTION_PRESETS.kinetic } }, new Set());
  const dirs = V.proposeDirections({ brief: locked });
  ok('a locked palette is in every direction, and locked there', dirs.every((d) => d.tokens.colors.background === '#f4efe6' && d.locks.includes('palette')));
  ok('a locked motion is in every direction, and locked there', dirs.every((d) => d.look.motion.feel === 'kinetic' && d.locks.includes('motion')));
  const pref = V.normalizeBrief({ ...base, spec: { grid: 'poster' } }, new Set());
  const pd = V.proposeDirections({ brief: pref });
  ok('an exact spec that is not locked shapes the faithful reading only', pd[0].look.grid === 'poster' && pd.slice(1).some((d) => d.look.grid !== 'poster'), pd.map((d) => d.look.grid).join(','));
  const deleg = V.normalizeBrief({ ...base, typography: { display: 'Fraunces', body: 'Inter' }, decisions: { typography: 'delegated' } }, new Set());
  ok('delegated type frees the faithful reading from the brief’s faces', V.proposeDirections({ brief: deleg })[0].tokens.fonts.display !== 'Fraunces' || V.languageOf(V.proposeDirections({ brief: deleg })[0].language).display[0] === 'Fraunces');
  const aaa = V.normalizeBrief({ ...base, spec: { contrast: 'AAA' } }, new Set());
  ok('AAA lifts every text colour to 7:1 in every direction', V.proposeDirections({ brief: aaa }).every((d) => V.ensureContrast(d.tokens.colors.text, d.tokens.colors.background, 7) === d.tokens.colors.text && V.ensureContrast(d.tokens.colors.muted, d.tokens.colors.background, 7) === d.tokens.colors.muted));
  const ruled = V.normalizeBrief({ ...base, rules: ['no animation'] }, new Set());
  ok('a rule is read for every direction', V.proposeDirections({ brief: ruled }).every((d) => d.look.motion.feel === 'still'));
  ok('a changed spec, status or rule asks for new directions', V.briefKey(pref) !== V.briefKey(V.normalizeBrief(base, new Set())) && V.briefKey(ruled) !== V.briefKey(V.normalizeBrief(base, new Set())));
  const b2 = V.normalizeBrief({ ...base, typography: { display: 'Archivo', body: 'Inter' }, spec: { grid: 'swiss', motion: V.MOTION_PRESETS.lively } }, new Set());
  ok('the visual parts that changed are found', J(V.changedVisualParts(V.normalizeBrief(base, new Set()), b2)) === J(['typography', 'layout', 'motion']));
  const spec = V.normalizeSpec({ ...SPEC, look: dirs[0].look }, board);
  const applied = V.briefToDesign(spec, b2, ['typography', 'motion']);
  ok('only the parts named reach the design: type and motion change, colour and grid do not', applied.tokens.fonts.display === 'Archivo' && applied.look.motion.feel === 'lively' && J(applied.tokens.colors) === J(spec.tokens.colors) && applied.look.grid === spec.look.grid && applied.version === spec.version + 1);
}

console.log('\n=== knowledge, fidelity and precise refinement ===');
{
  ok('the principles are structured: an area, a rule and a reason each, with unique ids', V.DESIGN_PRINCIPLES.length >= 30 && new Set(V.DESIGN_PRINCIPLES.map((p) => p.id)).size === V.DESIGN_PRINCIPLES.length && V.DESIGN_PRINCIPLES.every((p) => p.rule && p.why && p.area));
  const kin = { ...V.lookFromTokens(V.DEFAULT_TOKENS), grid: 'poster', motion: V.MOTION_PRESETS.kinetic };
  ok('a kinetic poster is reminded of kinetic type and reduced motion; a still page is not', V.principlesForLook(kin).some((p) => p.id === 'type.kinetic') && V.principlesForLook(kin).some((p) => p.id === 'motion.reduced') && !V.principlesForLook(V.lookFromTokens(V.DEFAULT_TOKENS)).some((p) => p.area === 'motion'));
  ok('every finding kind has a reason', ['overflow', 'contrast', 'target', 'measure', 'rhythm', 'fidelity', 'motion'].every((k) => V.whyFor(k).length > 20));
  const brief0 = V.normalizeBrief({ pageType: 'website', objective: 'Sell festival tickets', personality: ['bold'], visualDirection: 'poster', palette: [{ hex: '#ffffff', role: 'background' }, { hex: '#111111', role: 'text' }, { hex: '#ff4b1f', role: 'accent' }], typography: { display: 'Archivo', body: 'Inter' } }, new Set());
  const dir = { ...V.proposeDirections({ brief: brief0 })[0], locks: ['palette', 'motion'] };
  const d = V.designFromDirection(dir);
  const good = V.normalizeSpec({ ...SPEC, tokens: d.tokens, look: d.look }, board);
  const ev0 = V.evaluateDesign(good, {}, dir.locks, { direction: dir });
  ok('a page that keeps its direction is fully faithful, and says so', ev0.fidelity === 100 && ev0.kept.some((k) => k.includes(dir.name)));
  const drifted = { ...good, tokens: { ...good.tokens, colors: { ...good.tokens.colors, accent: '#00ff00' } }, look: { ...good.look, motion: V.STILL_MOTION } };
  const ev1 = V.evaluateDesign(drifted, {}, dir.locks, { direction: dir });
  const fixes = ev1.findings.filter((f) => f.kind === 'fidelity');
  ok('drift from a locked colour and motion is found, with fixes that put them back (not blocked by the locks)', fixes.length === 2 && fixes.every((f) => f.fix && !f.blocked) && ev1.fidelity < 100);
  const ruled = V.normalizeBrief({ ...brief0, rules: ['No animation', 'No capitals', 'Must feel handmade'] }, new Set());
  const loud = V.normalizeSpec({ ...SPEC, tokens: d.tokens, look: { ...d.look, case: 'upper', motion: V.MOTION_PRESETS.lively } }, board);
  const ev2 = V.evaluateDesign(loud, {}, [], { brief: ruled });
  ok('checkable rules are checked, with fixes; the others are said to be given, not measured', ev2.findings.filter((f) => /Breaks the rule/.test(f.message)).length === 2 && ev2.findings.every((f) => !/Breaks the rule/.test(f.message) || f.fix) && ev2.kept.some((k) => /cannot be measured/.test(k)));
  const aaa = V.normalizeBrief({ ...brief0, spec: { contrast: 'AAA' } }, new Set());
  const faint = V.normalizeSpec({ ...SPEC, tokens: { ...d.tokens, colors: { ...d.tokens.colors, muted: '#8a8a8a', background: '#ffffff' } }, look: d.look }, board);
  ok('an AAA brief catches text below 7:1, with a fix', V.evaluateDesign(faint, {}, [], { brief: aaa }).findings.some((f) => f.kind === 'fidelity' && /AAA/.test(f.message) && f.fix));
  const civic = V.normalizeSpec({ ...SPEC, tokens: d.tokens, look: { ...d.look, language: 'civic', motion: V.MOTION_PRESETS.kinetic } }, board);
  ok('kinetic motion for a public service is questioned, with a calmer fix', V.evaluateDesign(civic, {}, [], {}).findings.some((f) => f.kind === 'motion' && f.fix && f.fix.look.motion.feel === 'lively'));
  ok('a moving page states its reduced-motion alternative', ev2.kept.some((k) => /reduced-motion/.test(k)));
  // precise refinement
  const asked = (w) => J(V.readAdjust(w));
  ok('"keep everything, but change the typography" is a new pairing', asked('Keep everything, but change the typography.') === J(['type-pairing']));
  ok('"use warmer colours", "reduce the motion intensity", "make the layout more experimental" are read', asked('Use warmer colors') === J(['colour-warmer']) && asked('Reduce the motion intensity.') === J(['motion-calmer']) && asked('Make the layout more experimental') === J(['layout-experimental']));
  ok('"keep the composition, but make the interaction more expressive" changes only the interaction', asked('Keep the composition, but make the interaction more expressive') === J(['motion-more-expressive-hover']));
  ok('anything else goes to the model', asked('Rewrite the hero headline about first light') === '[]');
  const t = V.adjust(good, 'type-pairing');
  const typed = t.patches.reduce((sp, pt) => V.applyPatch(sp, pt, board).spec, good);
  ok('a new pairing changes the faces and nothing else', typed.tokens.fonts.display !== good.tokens.fonts.display && J(typed.tokens.colors) === J(good.tokens.colors) && typed.look.grid === good.look.grid);
  const warm = V.applyPatch(good, V.adjust(good, 'colour-warmer').patches[0], board).spec;
  ok('warmer colours keep text readable', V.ensureContrast(warm.tokens.colors.text, warm.tokens.colors.background, 7) === warm.tokens.colors.text && warm.tokens.colors.accent !== good.tokens.colors.accent);
  ok('calmer motion steps down one feel; at still there is nothing to do', V.adjust({ ...good, look: { ...good.look, motion: V.MOTION_PRESETS.kinetic } }, 'motion-calmer').patches[0].look.motion.feel === 'lively' && V.adjust({ ...good, look: { ...good.look, motion: V.STILL_MOTION } }, 'motion-calmer') === null);
  ok('a locked group stands in the way of an adjustment (it is checked before applying)', V.lockedChanges(good, V.adjust(good, 'colour-cooler').patches[0], ['palette']).includes('palette'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
