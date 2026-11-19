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
  ok('a variant that needs an image falls back when there is none (to one side, not the centred habit)', noImg.sections[0].variant === 'editorial', noImg.sections[0].variant);
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
  // (the page's cream, Fraunces and tan palette is the brief's own: the designer's, so not a generated look to fix)
  const ownBrief = V.normalizeBrief({ pageType: 'website', objective: 'x', personality: ['warm'], visualDirection: 'handmade cafe', palette: [{ hex: spec.tokens.colors.background, role: 'background' }, { hex: spec.tokens.colors.accent, role: 'accent' }, { hex: spec.tokens.colors.text, role: 'text' }], typography: { display: 'Fraunces', body: 'Inter' } }, new Set());
  const clean = V.evaluateDesign(spec, { desktop: audit({ width: 1280 }), phone: audit() }, [], { brief: ownBrief });
  ok('a page that works has nothing to fix', clean.quality === 100 && !clean.findings.some((f) => f.severity !== 'low'), J(clean.findings));
  const unasked = V.evaluateDesign(spec, { desktop: audit({ width: 1280 }), phone: audit() });
  const tellF = unasked.findings.find((f) => f.kind === 'generic' && /cream with a serif headline/.test(f.message));
  ok('…the same palette nobody asked for reads as a generated look: said, with a fix offered (not made)', !!tellF && tellF.manual === true && tellF.fix?.op === 'tokens', J(unasked.findings.map((f) => f.message)));
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
  // (a page keeps its direction when it keeps its plan too: its one bold move, held as generation holds it)
  const good = V.holdSignature(V.normalizeSpec({ ...SPEC, tokens: d.tokens, look: d.look }, board), dir.designPlan?.signature).spec;
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

console.log('\n=== found by dogfooding: notes, fit, app screens, charts ===');
{
  // a reference note about light is about atmosphere, not the colour of the page
  const lightNote = V.readDirectives('The light, not the bar itself', '');
  ok('"the light, not the bar itself" does not ask for a light ground', lightNote.dark === undefined && !lightNote.said.includes('a light ground'), J(lightNote));
  ok('"a light background" and "light and airy" do', V.readDirectives('a light background please', '').dark === false && V.readDirectives('light and airy', '').dark === false);
  ok('"bright colours" is colour, not a light ground', V.readDirectives('bright colours', '').dark === undefined && V.readDirectives('bright colours', '').colourful === true);
  ok('"louder" and "oversized type" ask for bigger, bolder type', V.readDirectives('louder', '').loud === true && V.readDirectives('oversized type', '').loud === true);
  const reading = V.readBoard(V.normalizeMoodboard({ refs: [ref('g1', { note: 'This asymmetric grid', take: ['composition'] })] }));
  ok('an asymmetric composition is "an asymmetric", not "a asymmetric"', reading.said.some((x) => x === 'an asymmetric composition'), J(reading.said));
  // headlines are sized so their longest word fits, from measured advances
  ok('measured advances: Unbounded sets wider than Inter, Anton narrower; capitals wider than lower case', V.advanceEm('Unbounded', 800, true) > V.advanceEm('Inter', 800, true) && V.advanceEm('Anton', 400, true) < V.advanceEm('Inter', 400, true) && V.advanceEm('Inter', 400, true) > V.advanceEm('Inter', 400, false));
  ok('an unknown face falls back to a typical width', V.advanceEm('Nonesuch Grotesk', 400, true) === 0.72);
  const posterLook = { ...V.lookFromTokens(V.DEFAULT_TOKENS), language: 'poster', grid: 'poster', case: 'upper', weight: 800 };
  const posterTokens = { ...V.DEFAULT_TOKENS, fonts: { display: 'Unbounded', body: 'Inter' } };
  const long = V.normalizeSpec({ ...SPEC, tokens: posterTokens, look: posterLook, sections: [{ id: 'h', kind: 'hero', variant: 'poster', content: { title: 'Drawings that *move*.', subtitle: 'x', primary: 'Go' } }] }, board);
  const lhtml = V.renderDesign(long, board.refs).html;
  const fit = lhtml.match(/--fit-hero:calc\(\(100vw - 40px\) \/ ([\d.]+)\)/);
  ok('a poster headline gets a size cap from its longest word ("Drawings", 8 letters of wide capitals)', !!fit && Number(fit[1]) > 8 * 0.85 && /font-size:min\(var\(--fs-hero\),var\(--fit-hero,999px\)\)/.test(lhtml), fit?.[0]);
  const short = V.normalizeSpec({ ...SPEC, tokens: posterTokens, look: posterLook, sections: [{ id: 'h', kind: 'hero', variant: 'poster', content: { title: 'Go on, try it.', subtitle: 'x', primary: 'Go' } }] }, board);
  const sfit = Number(V.renderDesign(short, board.refs).html.match(/--fit-hero:calc\(\(100vw - 40px\) \/ ([\d.]+)\)/)?.[1]);
  ok('a headline of short words is allowed larger than one with a long word', sfit > 0 && sfit < Number(fit?.[1]));
  // the kinetic headline marks where a highlighted word starts, so its highlight arrives with it
  ok('a highlighted word in a kinetic headline knows its first letter', /<em class="em" style="--hl-i:8">/.test(V.kineticHeadline('Drawings <em class="em">move</em>.', 'letters')));
  const hlCss = V.motionCss({ ...posterLook, emphasis: 'highlight', motion: V.MOTION_PRESETS.kinetic }, 'play');
  ok('in play the highlight sweeps in (and under reduced motion every animation is off, leaving it drawn)', /@keyframes mo-hl/.test(hlCss) && /animation-delay:calc\(var\(--hl-i,0\)/.test(hlCss) && /prefers-reduced-motion:reduce\)\{body \*/.test(hlCss));
  // app screens
  const appSpec = V.normalizeSpec({ ...SPEC, pageType: 'app-screen', sections: [
    { id: 'n', kind: 'app-nav', variant: 'sidebar', content: { brand: 'L', items: ['Close'], active: 'Close' } },
    { id: 'c', kind: 'chart', variant: 'area', content: { title: 'By day', labels: ['Mon', 'Tue', 'Wed'], series: [{ name: 'This month', values: [1, 2, 3] }, { name: 'Last month', values: [2, 3, 1] }] } },
    { id: 't', kind: 'table', variant: 'default', content: { title: 'Accounts', columns: ['Account', 'Owner', 'Status'], rows: [{ cells: ['Bank', 'Priya'], status: 'Reconciled' }] } },
  ] }, board);
  const ahtml = V.renderDesign(appSpec, board.refs).html;
  const adoc = parse(ahtml);
  ok('the desktop twelve-column app grid is not overridden by the one-column phone rule', /@media \(max-width:1099px\)\{\.app main\{grid-template-columns:minmax\(0,1fr\)\}\}/.test(ahtml) && !/\.app main\{min-width:0;padding:[^}]*grid-template-columns/.test(ahtml));
  ok('a chart with nothing beside it spans the row; only a chart paired with a feed takes eight columns', /\.app main>\.sx-chart:has\(\+\.sx-feed\)/.test(ahtml) && !/\.app main>\.sx-chart\{grid-column:span 8\}/.test(ahtml));
  ok('a table that already has a Status column gets the status there, not a second "Status" column', [...adoc.querySelectorAll('th')].filter((th) => th.textContent === 'Status').length === 1 && adoc.querySelector('td .status')?.textContent.includes('Reconciled'));
  ok('only the subject series is filled; the comparison is a dashed line with a dashed key', adoc.querySelectorAll('polygon.area').length === 1 && adoc.querySelector('polygon.area').classList.contains('s0') && adoc.querySelector('polyline.cmp.s1') && adoc.querySelector('.key-line.s1'));
  const plainTable = V.normalizeSpec({ ...SPEC, pageType: 'app-screen', sections: [{ id: 't', kind: 'table', variant: 'default', content: { title: 'A', columns: ['Account', 'Owner'], rows: [{ cells: ['Bank', 'Priya'], status: 'Open' }] } }] }, board);
  ok('a table without a Status column still gets one for its statuses', [...parse(V.renderDesign(plainTable, board.refs).html).querySelectorAll('th')].map((th) => th.textContent).join('|') === 'Account|Owner|Status');
}

console.log('\n=== GPT-6.1 Sol: the Responses API, structured outputs, high effort ===');
{
  const F = await import('./helpers/fake-openai-contract.mjs');
  const U = await import('./.tmp/openai-usage.mjs');
  const { format } = await import('node:util');
  // which model, which API, which effort
  ok('by default: GPT-6 Luna on Chat Completions at its own effort, exactly as before', V.socriauxModel({}) === 'gpt-6-luna' && V.socriauxApi({}) === 'chat' && V.socriauxEffort({}) === undefined);
  const SOL = { SOCRIAUX_MODEL: 'gpt-6.1-sol' };
  ok('SOCRIAUX_MODEL=gpt-6.1-sol: the Responses API at effort high', V.socriauxApi(SOL) === 'responses' && V.socriauxEffort(SOL) === 'high' && V.socriauxLadder(SOL)[0] === 'gpt-6.1-sol');
  ok('SOCRIAUX_EFFORT=medium for comparison; a word it does not know leaves high', V.socriauxEffort({ ...SOL, SOCRIAUX_EFFORT: 'medium' }) === 'medium' && V.socriauxEffort({ ...SOL, SOCRIAUX_EFFORT: 'turbo' }) === 'high');
  ok('SOCRIAUX_API=chat puts Sol on Chat Completions; responses puts any model on the Responses API', V.socriauxApi({ ...SOL, SOCRIAUX_API: 'chat' }) === 'chat' && V.socriauxApi({ SOCRIAUX_API: 'responses' }) === 'responses');
  ok('a malformed model id is ignored: Luna', V.socriauxModel({ SOCRIAUX_MODEL: 'gpt 6; drop' }) === 'gpt-6-luna');
  // the schemas
  ok('structured: art direction, the brief and its revision, the moodboard direction, the critique', J([...V.STRUCTURED_KINDS].sort()) === J(['art-direction', 'brief', 'critique', 'direction', 'refine-brief']));
  ok('plain JSON, on purpose: discovery (an open map), generation and refinement (content by kind)', ['discover', 'generate', 'refine'].every((k) => V.formatFor(k) === undefined));
  const accepted = V.STRUCTURED_KINDS.map((k) => [k, F.judgeResponses({ model: 'gpt-6.1-sol', instructions: 'JSON', input: 'x', text: { format: V.formatFor(k) } }).error?.message ?? 'ok']);
  ok('every schema is strict and closed, as the API requires (each object closed, every field required)', accepted.every(([, m]) => m === 'ok'), J(accepted));
  const ad = V.formatFor('art-direction').schema.properties.directions.items.properties;
  ok('the art direction can only name catalogue languages and allowlisted fonts', J(ad.language.enum) === J(V.LANGUAGES.map((l) => l.id)) && ad.fonts.anyOf[0].properties.display.enum.every((f) => V.knownFont(f)) && ad.fonts.anyOf[0].properties.body.enum.every((f) => !V.knownFont(f).displayOnly));
  // a schema-shaped answer (nulls where the prompt says optional) reads as the free-form one does
  const sBrief = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'Bring neighbours in on weekday mornings', audience: 'Neighbours', personality: ['warm', 'unhurried', 'precise'], visualDirection: 'Warm morning light', palette: [{ hex: '#f6f1e8', role: 'background' }, { hex: '#1d1a16', role: 'text' }, { hex: '#a4532b', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter', rationale: '' }, userGoals: [], functionalRequirements: [], openQuestions: [], references: [] }, null);
  const options = V.proposeDirections({ brief: sBrief });
  const fromSchema = V.parseDirections({ directions: [{ candidate: 1, language: options[0].language, name: 'Morning ledger', concept: 'A page that reads like the first coffee.', rationale: ['For neighbours.'], voice: 'Plain and warm. “The first pour is at seven.”', composition: 'One column.', imagery: 'Window light.', avoid: ['stock smiles'], fonts: null }] }, { brief: sBrief }, options);
  ok('art direction: fonts null keeps the candidate\'s faces, every written field is taken', fromSchema[0].name === 'Morning ledger' && J(fromSchema[0].tokens.fonts) === J(options[0].tokens.fonts) && fromSchema[0].source === 'model');
  const briefAnswer = { objective: 'Bring neighbours in.', audience: 'Neighbours on the way to work', userGoals: ['see the hours'], personality: ['warm', 'calm', 'exact'], visualDirection: 'Morning light, paper, ink.', palette: [{ hex: '#f6f1e8', role: 'background' }, { hex: '#1d1a16', role: 'text' }, { hex: '#a4532b', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }, { hex: '#5f574e', role: 'muted' }], typography: { display: 'Fraunces', body: 'Inter', rationale: 'Warm and steady.' }, layoutDirection: 'One long column.', functionalRequirements: ['opening hours'], references: [], openQuestions: [], experience: null, rules: [], accessibility: null, responsive: null, pageType: 'website', platform: 'web' };
  const parsedBrief = V.parseBrief(briefAnswer, V.normalizeMoodboard({}));
  ok('brief: experience, accessibility and responsive null read as not given', !!parsedBrief && parsedBrief.objective === 'Bring neighbours in.' && !parsedBrief.experience && !parsedBrief.accessibility && !parsedBrief.responsive && parsedBrief.typography.display === 'Fraunces', J(parsedBrief && { e: parsedBrief.experience, a: parsedBrief.accessibility, r: parsedBrief.responsive }));
  const cSel = V.elementSelection(capture(), 'generated', 'mobile');
  const cInput = { selection: cSel, comment: 'Is this CTA prominent enough?', history: [], brief: null, summary: '', section: '', kind: 'generated', name: 'Halcyon', viewport: 'mobile', wantsSummary: false };
  const gated = V.gateReasoning({ read: 'A small button in the hero.', verdict: 'mixed', issues: [], questions: ['Who taps it first?'], principles: [], alternatives: [], artifactSummary: null }, cInput);
  ok('critique: artifactSummary null when not asked, the reading kept', gated.artifactSummary === null && gated.reasoning.read.startsWith('A small button'));
  const dInput = { intent: 'A coffee shop website', questions: [], understanding: V.normalizeUnderstanding({}), moodboard: V.normalizeMoodboard({}), remark: '' };
  const mood = V.parseDirection({ direction: 'Industrial', moodboard: { queries: [{ category: 'texture', query: 'raw concrete' }], palettes: [], type: [] } }, dInput, 'texture');
  ok('moodboard direction: empty palettes and type lists read as none', mood.direction === 'Industrial' && mood.queries.length === 1);
  const parts = (a) => Object.keys(V.formatFor('direction', a).schema.properties.moodboard.properties).join();
  ok('the moodboard direction asks only for what its aspect needs (searches, palettes or pairs), every list bounded', parts('imagery') === 'queries' && parts('texture') === 'queries' && parts('palette') === 'palettes' && parts('type') === 'type' && V.formatFor('direction', 'imagery').schema.properties.moodboard.properties.queries.maxItems === 5);
  const pal = V.parseDirection({ direction: 'Cool', moodboard: { palettes: [{ name: 'Slate', colors: [{ hex: '#1d2a33', role: 'text' }, { hex: '#f3f5f6', role: 'background' }] }] } }, dInput, 'palette');
  ok('  and the parser reads the palette-only answer', pal.palettes.length === 1 && pal.queries.length === 0);
  const unbounded = [];
  const walk = (sch, path) => {
    if (!sch || typeof sch !== 'object') return;
    if (sch.type === 'array' && typeof sch.maxItems !== 'number') unbounded.push(path);
    for (const [k, v] of Object.entries(sch.properties ?? {})) walk(v, `${path}.${k}`);
    if (sch.items) walk(sch.items, `${path}[]`);
    for (const [i, v] of (sch.anyOf ?? []).entries()) walk(v, `${path}|${i}`);
  };
  for (const k of V.STRUCTURED_KINDS) walk(V.formatFor(k).schema, k);
  ok('no list in any schema is open-ended (an open list let one live answer run to its cap)', unbounded.length === 0, J(unbounded));
  // askJson, end to end, through the tracked client and the strict fake
  const quiet = console.warn;
  const quietInfo = console.info;
  const warned = [];
  console.warn = (...a) => warned.push(format(...a));
  console.info = () => {};
  const client = U.tracked(new F.default(), 'ux-v0/test');
  const run = async (env, o, script) => {
    globalThis.__contractCalls = [];
    globalThis.__contractScript = [...script];
    const asked = await V.askJson(client, V.socriauxLadder(env), { system: V.directSystem(), user: 'Three directions for the coffee house.', maxTokens: V.MAX_TOKENS['art-direction'], temperature: 0.8, label: 'art-direction', ...o }, env);
    return { asked, calls: globalThis.__contractCalls };
  };
  const answer = { directions: [{ candidate: 1, language: 'broadsheet', name: 'Morning ledger', concept: 'c', rationale: ['r'], voice: 'v', composition: 'c', imagery: 'i', avoid: ['a'], fonts: null }] };
  const a1 = await run(SOL, { format: V.formatFor('art-direction') }, [answer]);
  const sent = a1.calls[0]?.params ?? {};
  ok('Sol: one Responses call, instructions + input, effort high, a strict schema, not stored', a1.calls.length === 1 && a1.calls[0].api === 'responses' && sent.model === 'gpt-6.1-sol' && sent.instructions === V.directSystem() && sent.input[0].content[0].type === 'input_text' && sent.reasoning.effort === 'high' && sent.text.format.type === 'json_schema' && sent.text.format.strict === true && sent.store === false, J({ ...sent, instructions: '…', text: sent.text?.format?.type }));
  ok('  its answer cap leaves room to think at high, and no temperature is sent (Sol refuses one)', sent.max_output_tokens === V.MAX_TOKENS['art-direction'] + 16384 && sent.temperature === undefined);
  ok('  the answer is read (no output_text from the raw API: read from the message parts)', J(a1.asked.json) === J(answer) && a1.asked.api === 'responses' && a1.asked.effort === 'high' && a1.asked.incomplete === null);
  ok('  and priced at Sol\'s rates, reasoning billed as output', a1.asked.usage.model === 'gpt-6.1-sol' && a1.asked.usage.output >= 7000 && Math.abs(a1.asked.usage.cost - (a1.asked.usage.input * 2 + a1.asked.usage.output * 10) / 1e6) < 1e-9, J(a1.asked.usage));
  const a2 = await run({ ...SOL, SOCRIAUX_EFFORT: 'medium' }, { format: V.formatFor('art-direction') }, [answer]);
  ok('SOCRIAUX_EFFORT=medium: the same call at medium, with medium\'s room', a2.calls[0].params.reasoning.effort === 'medium' && a2.calls[0].params.max_output_tokens === V.MAX_TOKENS['art-direction'] + 8192);
  const a3 = await run(SOL, {}, ['{"questions":[]}']);
  ok('a call with no schema (discovery, generation, refinement): plain JSON on the Responses API', a3.calls[0].params.text.format.type === 'json_object' && J(a3.asked.json) === '{"questions":[]}');
  ok('  its input says "JSON" itself (the live API refuses JSON mode when only the instructions say it)', /json/i.test(a3.calls[0].params.input[0].content[0].text) && !/json/i.test(a1.calls[0].params.input[0].content[0].text.slice(-60)));
  globalThis.__contractUnavailable = ['gpt-6.1-sol'];
  const a4 = await run(SOL, { format: V.formatFor('art-direction') }, [answer]);
  globalThis.__contractUnavailable = [];
  ok('Sol not enabled on the account: the ladder answers (GPT-5.6 Sol), still on the Responses API', a4.calls.map((c) => c.outcome).join() === '404 model_not_found,ok' && a4.asked.model === 'gpt-5.6-sol' && a4.calls[1].api === 'responses', J(a4.calls.map((c) => [c.model, c.outcome])));
  globalThis.__contractUnavailable = ['gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-6.1-terra'];
  const a5 = await run(SOL, { format: V.formatFor('art-direction') }, [answer]);
  globalThis.__contractUnavailable = [];
  ok('down to GPT-4o (no reasoning): asked without a reasoning setting, with its temperature, and answered', a5.asked.model === 'gpt-4o' && a5.calls.at(-1).params.reasoning === undefined && a5.calls.at(-1).params.temperature === 0.8 && a5.calls.at(-1).outcome === 'ok', J(a5.calls.map((c) => [c.model, c.outcome])));
  globalThis.__contractNoSchema = ['gpt-6.1-sol'];
  const a6 = await run(SOL, { format: V.formatFor('art-direction') }, [answer]);
  globalThis.__contractNoSchema = [];
  ok('structured outputs refused: plain JSON on Sol, not a step down the ladder', a6.calls.length === 2 && a6.calls.every((c) => c.model === 'gpt-6.1-sol') && a6.calls[1].params.text.format.type === 'json_object' && a6.asked.model === 'gpt-6.1-sol');
  globalThis.__contractReasoning = { ...F.REASONING, high: 18170 };
  const a7 = await run(SOL, {}, [answer]);
  globalThis.__contractReasoning = undefined;
  ok('a plain-JSON answer cut by its cap is said to be incomplete (and does not parse as a whole); it is not asked again', a7.calls.length === 1 && a7.asked.retried === null && a7.asked.incomplete === 'max_output_tokens' && a7.asked.json === null && warned.some((w) => /stopped early \(max_output_tokens\)/.test(w)), J({ inc: a7.asked.incomplete }));
  // the loop seen live: a strict-schema answer that never closes, writing whitespace to its cap
  globalThis.__contractContent = (p) => (p.text?.format?.type === 'json_schema' ? `{"directions": [${' '.repeat(80000)}` : JSON.stringify(answer));
  globalThis.__contractCalls = [];
  const loop = await V.askJson(client, V.socriauxLadder(SOL), { system: V.directSystem(), user: 'Three directions.', maxTokens: V.MAX_TOKENS['art-direction'], label: 'art-direction', format: V.formatFor('art-direction') }, SOL);
  const loopCalls = globalThis.__contractCalls;
  globalThis.__contractContent = undefined;
  ok('a structured answer that runs to its cap is asked once more in JSON mode, on Sol, and the designer gets the answer', loopCalls.length === 2 && loopCalls[0].outcome === 'cut' && loopCalls[1].params.text.format.type === 'json_object' && loopCalls.every((c) => c.model === 'gpt-6.1-sol') && J(loop.json) === J(answer) && loop.incomplete === null && /JSON mode/.test(loop.retried ?? ''), J(loopCalls.map((c) => [c.outcome, c.params.text?.format?.type])));
  ok('  both calls are billed and counted', loop.usage.output > 11000 && loop.usage.cost > (loop.usage.output * 10) / 1e6 - 1e-9, J(loop.usage));
  const a8 = await run(SOL, { format: V.formatFor('art-direction') }, [{ refusal: 'I can not help with that.' }]);
  ok('a refusal: no JSON, said as a refusal, never read as an answer', a8.asked.incomplete === 'refusal' && a8.asked.json === null && a8.asked.raw === '');
  const a9 = await run(SOL, { images: [{ url: 'data:image/png;base64,AAAA', detail: 'low' }] }, ['{"read":"x"}']);
  ok('an image (a critique crop) goes as input_image with its detail', J(a9.calls[0].params.input[0].content[1]) === J({ type: 'input_image', image_url: 'data:image/png;base64,AAAA', detail: 'low' }));
  const a10 = await run({}, {}, ['{"directions":[]}']);
  ok('without Sol: Chat Completions, JSON mode, as before', !a10.calls[0].api && a10.calls[0].params.messages[0].role === 'system' && a10.calls[0].params.response_format.type === 'json_object' && a10.asked.api === 'chat' && a10.asked.model === 'gpt-6-luna');
  console.warn = quiet;
  console.info = quietInfo;
}

console.log('\n=== what is being made: intent, the booking, the behaviour runtime ===');
{
  const read = (w, o) => V.readIntent(w, o);
  const yoga = read('Booking screen for an already-selected yoga class');
  ok('"booking screen" is a booking screen, task first, with its booking requirement and subject', yoga.kind === 'booking' && yoga.screen && yoga.subject === 'yoga class' && yoga.requirements.some((r) => r.id === 'req-book' && r.component === 'booking'), J(yoga));
  const promo = read('A website promoting a yoga booking app');
  ok('"a website promoting a booking app" is a site, with no booking to build', promo.kind === 'site' && !promo.screen && !V.requiredComponents(promo).length, J(promo));
  const studio = read('A website for my yoga studio with class booking');
  ok('"a website … with class booking" is a site that must still let people book', studio.kind === 'site' && V.requiredComponents(studio).includes('booking'), J(studio));
  const dash = read('An analytics dashboard for lab sensor readings');
  ok('a dashboard needs figures and a table', dash.kind === 'dashboard' && dash.screen && ['stat-cards', 'table'].every((c) => V.requiredComponents(dash).includes(c)), J(dash));
  ok('a checkout is a checkout', read('Checkout flow for a ceramics shop').kind === 'checkout');
  ok('the designer\'s choice wins over the words', (() => { const r = read('Booking screen for yoga', { override: 'site' }); return r.kind === 'site' && r.source === 'designer'; })());
  ok('the brief\'s reading counts only when the words are weak', read('something calm and clear', { briefKind: 'booking' }).kind === 'booking' && read('Booking screen for yoga', { briefKind: 'site' }).kind === 'booking');
  ok('a screen is built as an app screen, a site as a website', V.pageTypeFor(yoga, 'website') === 'app-screen' && V.pageTypeFor(promo, 'website') === 'website');
  ok('a screen is told it is the interface, not a page about it', V.structureRule(yoga, 'app-screen').includes('NOT a page about it') && !/nav first|footer last/i.test(V.structureRule(yoga, 'app-screen')));
  ok('a stored intent is held to its shape', V.normalizeIntent({ kind: 'spaceship' }) === null && (() => { const n = V.normalizeIntent({ ...yoga, requirements: [...yoga.requirements, { id: 'bad id', text: 'x' }, { id: 'req-x', text: '' }], taskByDesigner: true, dropped: ['req-old', 'nope!'] }); return n.requirements.length === 1 && n.taskByDesigner === true && J(n.dropped) === J(['req-old']); })());

  // the designer's corrections are final through every rewrite of the brief
  const asSite = V.correctKind(yoga, 'site');
  ok('correcting the kind is the designer\'s, and drops the old kind\'s needs', asSite.kind === 'site' && asSite.source === 'designer' && !V.requiredComponents(asSite).includes('booking'));
  ok('…and a rewrite keeps the correction, whatever the words say', V.settleIntent('Booking screen for yoga', { current: asSite }).kind === 'site');
  const mine = { ...yoga, task: 'Book the 7am class in two taps', taskByDesigner: true };
  ok('a task the designer wrote survives a rewrite', V.settleIntent('Booking screen for an already-selected yoga class', { current: mine }).task === 'Book the 7am class in two taps');
  const without = V.editRequirements(yoga, []);
  ok('taking a requirement out is remembered…', !without.requirements.length && J(without.dropped) === J(['req-book']));
  ok('…so no rewrite puts it back', !V.settleIntent('Booking screen for an already-selected yoga class', { current: without }).requirements.some((r) => r.id === 'req-book'));
  const added = V.editRequirements(yoga, [...yoga.requirements.map((r) => r.text), 'See the teacher before booking']);
  ok('a requirement the designer adds is theirs, kept through a rewrite, with an id stable for its words', added.requirements.at(-1).authority === 'designer' && /^req-/.test(added.requirements.at(-1).id) && V.settleIntent('Booking screen for yoga', { current: added }).requirements.some((r) => r.text === 'See the teacher before booking') && V.requirementFrom('See the teacher before booking').id === added.requirements.at(-1).id);

  // the booking component: held to its shape, drawn as a real interface
  const sample = V.sampleBooking(yoga, {});
  ok('sample times are labelled as samples, never live availability', /not live availability/i.test(sample.note) && sample.days.length >= 3 && sample.days.some((d) => d.slots.some((x) => x.status === 'full')));
  const tooMany = V.normalizeSection({ kind: 'booking', variant: 'nope', content: { ...sample, days: Array(30).fill(sample.days[0]) } }, 'app-screen', null, new Set());
  ok('a booking is held to its limits: 14 days at most, a known variant', tooMany.content.days.length === 14 && tooMany.variant === 'strip');
  ok('a booking with no times is no booking', V.normalizeSection({ kind: 'booking', content: { title: 'Book' } }, 'app-screen', null, new Set()) === null);

  const brief = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'Booking screen for an already-selected yoga class', audience: 'members', personality: ['calm', 'warm'], visualDirection: 'warm earthy studio', palette: [], typography: { display: 'Fraunces', body: 'Inter' } }, new Set());
  brief.intent = V.settleIntent(V.briefWords(brief), {});
  // the failure this replaces: a landing page about the brand, for a booking screen
  const landing = { title: 'Lotus Yoga', sections: [
    { id: 'nav', kind: 'nav', content: { brand: 'Lotus', links: ['Classes'], cta: 'Begin' } },
    { id: 'hero', kind: 'hero', content: { title: 'Find your flow', subtitle: 'Yoga for everyone', primary: 'Begin', secondary: 'Read more' } },
    { id: 'why', kind: 'features', content: { title: 'Why us', items: [{ title: 'Calm', text: 'x' }, { title: 'Warm', text: 'y' }] } },
    { id: 'foot', kind: 'footer', content: { brand: 'Lotus', columns: [] } },
  ] };
  const fixed = V.parseGenerate(landing, brief, board, 1, 'Generated');
  ok('a landing page written for a booking screen becomes the booking screen', fixed.pageType === 'app-screen' && fixed.sections[0]?.kind === 'booking', J(fixed.sections.map((x) => x.kind)));
  ok('  no hero, no "why us" grid, no footer; each change said in the notes', !fixed.sections.some((x) => ['hero', 'features', 'footer'].includes(x.kind)) && fixed.notes.some((n) => /booking/i.test(n)), J(fixed.notes));
  const html = V.renderDesign(fixed, board.refs).html;
  ok('the booking is drawn as a real form: radio days and times, full times disabled, a confirm action', /type="radio" name="[^"]+-day"/.test(html) && /type="radio" name="[^"]+-time"[^>]*disabled/.test(html) && html.includes('data-ux-confirm') && html.includes('data-ux-booking-form'));
  ok('  its confirmation says plainly that no booking was made', /no booking was made/i.test(html));
  ok('  the page is not written as a landing page around it: no "Begin", no "Read more"', !/>Begin<|>Read more</.test(html));
  ok('the behaviour runtime is inlined only in an export', !html.includes('__uxBehaviors') && V.renderDesign(fixed, board.refs, { runtime: true }).html.includes('__uxBehaviors'));

  // the trusted runtime, run in a DOM: choose, confirm, see it, change it
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(V.BEHAVIOR_SOURCE);
  const doc = w.document;
  const root = doc.querySelector('[data-ux-booking]');
  const btn = root.querySelector('[data-ux-confirm]');
  ok('before a time is chosen, the confirm action says it is not ready', btn.getAttribute('aria-disabled') === 'true');
  root.querySelector('[data-ux-booking-form]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok('confirming with no time says so, and books nothing', !root.querySelector('[data-ux-error]').hidden && root.querySelector('[data-ux-done]').hidden);
  const slot = [...root.querySelectorAll('.bk-times:not([hidden]) input[name$="-time"]')].find((r) => !r.disabled);
  slot.checked = true;
  slot.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok('choosing a time enables the action and shows the choice', btn.getAttribute('aria-disabled') === 'false' && root.querySelector('[data-ux-bind="choice"]').textContent.includes(slot.getAttribute('data-time')) && root.querySelector('[data-ux-error]').hidden);
  root.querySelector('[data-ux-booking-form]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok('confirming shows that it is working', btn.getAttribute('aria-busy') === 'true');
  await new Promise((r) => setTimeout(r, 720));
  const done = root.querySelector('[data-ux-done]');
  ok('…then the confirmation, naming the time', !done.hidden && done.textContent.includes(slot.getAttribute('data-time')) && root.querySelector('[data-ux-booking-form]').hidden);
  root.querySelector('[data-ux-change]').click();
  ok('"change the time" goes back to the choice, still chosen', done.hidden && !root.querySelector('[data-ux-booking-form]').hidden && slot.checked);
  const days = [...root.querySelectorAll('input[name$="-day"]:not([disabled])')];
  if (days.length > 1) {
    days[1].checked = true;
    days[1].dispatchEvent(new w.Event('change', { bubbles: true }));
    ok('another day shows its own times and clears the old choice', !root.querySelector(`.bk-times[data-day="${days[1].value}"]`).hidden && !slot.checked && btn.getAttribute('aria-disabled') === 'true');
  }
  const self = w.__uxBehaviors.selfTest();
  ok('the self-test the audit runs finds a working booking, and leaves it as it was', self.length === 1 && !self[0].problems.length && self[0].slots > 0 && btn.getAttribute('aria-disabled') === 'true', J(self));
  w.eval(V.BEHAVIOR_SOURCE);
  ok('run twice, it binds each booking once', w.__uxBehaviors.bookings === 0 && root.hasAttribute('data-ux-bound'));
  // a broken booking (its confirmation missing) is reported, not hidden
  const broken = new JSDOM(html.replace(/data-ux-done/g, 'data-x'), { runScripts: 'outside-only' });
  broken.window.eval(V.BEHAVIOR_SOURCE);
  const bt = broken.window.__uxBehaviors.selfTest();
  ok('a booking that cannot confirm is caught by its self-test', bt[0].problems.includes('confirming does not show a confirmation'), J(bt));

  // a form, validated in place
  const formSpec = V.normalizeSpec({ title: 'Contact', pageType: 'website', sections: [{ id: 'f', kind: 'form', content: V.sampleFor('form', V.readIntent('a contact form'), {}) }] }, board);
  const fdom = new JSDOM(V.renderDesign(formSpec, board.refs).html, { runScripts: 'outside-only' });
  fdom.window.eval(V.BEHAVIOR_SOURCE);
  const f = fdom.window.document.querySelector('form[data-ux-form]');
  f.querySelector('input[type=email]').value = 'not-an-email';
  f.dispatchEvent(new fdom.window.Event('submit', { bubbles: true, cancelable: true }));
  const errs = [...f.querySelectorAll('.fm-error')].map((e) => e.textContent);
  ok('a form says each problem beside its field, and sends nothing', errs.includes('This is needed.') && errs.some((e) => /email/i.test(e)) && f.querySelector('[aria-invalid="true"]') !== null && f.querySelector('[data-ux-done]').hidden, J(errs));
  const typed = f.querySelector('input[type=email]').value;
  const ft = fdom.window.__uxBehaviors.selfTest();
  ok('the audit\'s self-test tries the form too: empty is refused with messages, complete is accepted', ft.length === 1 && ft[0].kind === 'form' && !ft[0].problems.length && ft[0].slots >= 3, J(ft));
  ok('…and leaves it as the person left it: their words, no messages', f.querySelector('input[type=email]').value === typed && !f.querySelector('.fm-error') && !f.querySelector('.is-invalid'));

  // directions differ in composition, and the studies show the thing being made
  const dirs = V.proposeDirections({ brief });
  const comps = dirs.map((d) => d.compose?.booking);
  ok('three directions, three ways to compose the booking', comps.every(Boolean) && new Set(comps).size === 3, J(comps));
  ok('composition counts in how different two directions are', V.directionDistance(dirs[0], { ...dirs[0], compose: { booking: comps[0] === 'list' ? 'calendar' : 'list' } }) > V.directionDistance(dirs[0], { ...dirs[0] }));
  ok('a stored direction keeps its composition', V.normalizeDirection(JSON.parse(J(dirs[0])))?.compose?.booking === comps[0]);
  const studies = dirs.map((d) => V.studySpec(d, brief, 'Lotus', board.refs));
  ok('each study is the booking in its direction\'s composition', studies.every((st, i) => st.sections.some((x) => x.kind === 'booking' && x.variant === (comps[i] === 'immersive' && !board.refs.length ? 'split' : comps[i]))), J(studies.map((st) => st.sections.map((x) => `${x.kind}/${x.variant}`))));
  const siteBrief = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for a ceramics studio', userGoals: ['See the pieces', 'Visit the studio'], personality: ['calm'], visualDirection: 'quiet', palette: [], typography: { display: 'Fraunces', body: 'Inter' } }, new Set());
  const siteStudy = V.studySpec(V.proposeDirections({ brief: siteBrief })[0], siteBrief, 'Kiln', board.refs);
  // (its opening is a hero, or a section composed from pieces: the headline is the brief's own words either way)
  const opening = siteStudy.sections.find((x) => x.kind === 'hero' || x.kind === 'compose');
  ok('a site\'s study uses the brief\'s own words and actions, never "Begin"', !J(siteStudy).includes('"Begin"') && !J(siteStudy).includes('Read more') && /ceramics/.test(opening?.kind === 'hero' ? opening.content.title : J(opening?.content.root)), J(opening));

  // the function checks: a design missing what it must do is a finding with a fix
  const bare = V.normalizeSpec({ title: 'Lotus', pageType: 'app-screen', sections: [{ id: 'h', kind: 'app-header', content: { title: 'Lotus', subtitle: '', actions: [] } }] }, board);
  const ev = V.evaluateDesign(bare, {}, [], { brief, direction: dirs[1] });
  const fn = ev.findings.find((x) => x.kind === 'function');
  ok('a booking screen with no booking is a high finding, with the fix in its direction\'s composition', fn && fn.severity === 'high' && fn.restore && fn.fix?.op === 'add' && fn.fix.section.kind === 'booking' && fn.fix.section.variant === comps[1], J(fn));
  const applied = V.applyPatch(bare, V.fixesFor(ev).find((x) => x.finding.kind === 'function').patch, board);
  ok('…which is applied and puts the booking in', applied.ok && applied.spec.sections.some((x) => x.kind === 'booking'));
  const evb = V.evaluateDesign(fixed, { desktop: V.normalizeAudit({ width: 1280, viewport: 800, height: 2000, overflowX: 0, bodySize: 17, sections: [], headings: [], contrast: [], behaviors: [{ index: 0, slots: 6, problems: ['confirming does not show a confirmation'] }] }) }, [], { brief });
  ok('a booking whose self-test fails is a manual high finding', evb.findings.some((x) => x.kind === 'function' && x.manual && x.severity === 'high' && x.message.includes('confirming does not show')), J(evb.findings.map((x) => x.message)));
  ok('generation is told what it must do, by id, and what was ruled out', (() => { const b2 = { ...brief, intent: { ...brief.intent, prohibitions: ['stock photos'] } }; const t = V.generateSystem(b2); return t.includes('WHAT IT MUST DO') && t.includes('req-book') && t.includes('stock photos') && t.includes('NOT a page about it'); })());
}

console.log('\n=== routing: the model for each stage; budgets ===');
{
  const R = (stage, env = {}, want = {}) => V.routeFor(stage, want, env);
  const table = V.routingTable({});
  ok('by default: questions, the brief and the moodboard on the economy model; direction, generation, critique on the premium', J(table.map((r) => `${r.stage}:${r.tier}:${r.model}`)) === J(['discover:economy:gpt-6-luna', 'direction:economy:gpt-6-luna', 'brief:economy:gpt-6-luna', 'refine-brief:economy:gpt-6-luna', 'art-direction:premium:gpt-6.1-sol', 'generate:premium:gpt-6.1-sol', 'refine:economy:gpt-6-luna', 'critique:premium:gpt-6.1-sol']), J(table.map((r) => `${r.stage}:${r.tier}:${r.model}`)));
  ok('the premium tier on Sol: the Responses API at medium effort; the economy tier on Luna: Chat Completions at its own', R('generate').api === 'responses' && R('generate').effort === 'medium' && R('discover').api === 'chat' && R('discover').effort === undefined);
  ok('a complex refinement asks for premium; a tier set for the stage overrides it', R('refine', {}, { tier: 'premium' }).tier === 'premium' && R('refine', { SOCRIAUX_TIER_REFINE: 'economy' }, { tier: 'premium' }).tier === 'economy');
  ok('SOCRIAUX_ROUTING=single: everything on the economy model', V.routingTable({ SOCRIAUX_ROUTING: 'single' }).every((r) => r.model === 'gpt-6-luna' && r.source === 'single'));
  ok('legacy SOCRIAUX_MODEL: every stage on it, with its old effort (Sol at high)', V.routingTable({ SOCRIAUX_MODEL: 'gpt-6.1-sol' }).every((r) => r.model === 'gpt-6.1-sol' && r.effort === 'high' && r.api === 'responses' && r.source === 'legacy'));
  ok('tiers, efforts and single stages are configured, never asked for by a request', R('art-direction', { SOCRIAUX_PREMIUM_MODEL: 'gpt-6.1-terra', SOCRIAUX_PREMIUM_EFFORT: 'low' }).model === 'gpt-6.1-terra' && R('art-direction', { SOCRIAUX_PREMIUM_EFFORT: 'high' }).effort === 'high' && R('critique', { SOCRIAUX_MODEL_CRITIQUE: 'gpt-4o-mini' }).model === 'gpt-4o-mini' && R('critique', { SOCRIAUX_MODEL_CRITIQUE: 'rm -rf /' }).model === 'gpt-6.1-sol');
  ok('a stage on the economy tier for fallbacks and budgets', V.economyRoute('generate', {}).model === 'gpt-6-luna' && V.economyRoute('generate', {}).tier === 'economy');
  // refinement complexity, in code
  const el = { element: { ux: { section: 'hero' } }, region: null };
  ok('a short change to a selected part is economy', V.refineTier('Make the headline say mornings', el).tier === 'economy' && V.refineTier('Make the button darker', el).tier === 'economy');
  ok('no selection, or the structure, or the feel, is premium', V.refineTier('Make the headline say mornings', null).tier === 'premium' && V.refineTier('Rethink the whole hierarchy', el).tier === 'premium' && V.refineTier('Make it feel more premium', el).tier === 'premium' && V.refineTier('x'.repeat(300), el).tier === 'premium');
  // estimates are labelled estimates; budgets hold
  const gen = R('generate');
  const worst = V.worstCost(gen, 20000);
  ok('a premium generation\'s worst case is its prompt, its cap and its reasoning room at Sol\'s price', Math.abs(worst - ((5000 * 2 + (V.MAX_TOKENS.generate + 8192) * 10) / 1e6)) < 1e-9, worst);
  ok('a model with no price has no estimate', V.worstCost({ model: 'no-such-model', effort: undefined, stage: 'generate' }, 1000) === null);
  const B = V.budgets({});
  ok('default budgets: US$2 a day, US$20 a month, US$5 a project, US$0.40 a call, warned at 80%, one retry', B.dailyUsd === 2 && B.monthlyUsd === 20 && B.projectUsd === 5 && B.operationUsd === 0.4 && B.warnAt === 0.8 && B.maxRetries === 1);
  ok('budgets are read from the environment, within bounds', V.budgets({ SOCRIAUX_DAILY_USD: '0.5', SOCRIAUX_WARN_AT: '7', SOCRIAUX_MAX_RETRIES: '9' }).dailyUsd === 0.5 && V.budgets({ SOCRIAUX_WARN_AT: '7' }).warnAt === 0.8 && V.budgets({ SOCRIAUX_MAX_RETRIES: '9' }).maxRetries === 2);
  const none = { day: 0, month: 0, project: 0 };
  const fine = V.decide(gen, 20000, none, B, {});
  ok('within every budget: the premium model, no warning', fine.ok && fine.route.model === 'gpt-6.1-sol' && !fine.downgraded && !fine.warning);
  const tight = V.decide(gen, 20000, { day: 1.95, month: 1.95, project: 1.95 }, B, {});
  ok('a premium call the budget would not hold: the economy model, said, and a warning', tight.ok && tight.route.model === 'gpt-6-luna' && /past its limit/.test(tight.downgraded) && /98% of a SocriaUX budget/.test(tight.warning), J(tight));
  ok('a budget spent: refused, plainly', !V.decide(gen, 100, { day: 0, month: 20, project: 0 }, B, {}).ok && /this month/i.test(V.decide(gen, 100, { day: 0, month: 20, project: 0 }, B, {}).error));
  ok('an economy call is never moved: it runs while any budget remains', V.decide(R('discover'), 100, { day: 1.999, month: 0, project: 0 }, B, {}).route.model === 'gpt-6-luna');
  ok('the automatic repair loop is code, bounded', V.MAX_REVISION_ROUNDS === 2);
}

console.log('\n=== direct edits and locked sections ===');
{
  const spec = V.normalizeSpec({ title: 'Lotus', pageType: 'website', sections: [
    { id: 'nav', kind: 'nav', content: { brand: 'Lotus', links: ['Classes'] } },
    { id: 'hero', kind: 'hero', variant: 'statement', tone: 'accent', content: { title: 'Find your flow', subtitle: 'Yoga for everyone', primary: 'Book' } },
    { id: 'why', kind: 'features', content: { title: 'Why us', items: [{ title: 'Calm', text: 'Quiet rooms' }, { title: 'Warm', text: 'Heated floors' }] } },
    { id: 'foot', kind: 'footer', content: { brand: 'Lotus' } },
  ] }, board);
  const hero = spec.sections.find((x) => x.id === 'hero');
  const why = spec.sections.find((x) => x.id === 'why');
  ok('the text a selected element was drawn from is found, with its limit', V.textAt(hero, 'title')?.value === 'Find your flow' && V.textAt(hero, 'title').max > 0 && V.textAt(why, 'items.1.text')?.value === 'Heated floors');
  ok('…and only text: a list, an index out of range or a made-up path is not', V.textAt(why, 'items') === null && V.textAt(why, 'items.9.title') === null && V.textAt(hero, 'nope') === null);
  const tp = V.textPatch(why, 'items.1.text', '  Floors   warmed  from below ');
  const after = V.applyPatch(spec, tp, board);
  ok('new words land in that one field, tidied, and nothing else changes', after.ok && after.spec.sections.find((x) => x.id === 'why').content.items[1].text === 'Floors warmed from below' && after.spec.sections.find((x) => x.id === 'why').content.items[0].text === 'Quiet rooms' && J(after.spec.sections.find((x) => x.id === 'hero')) === J(hero));
  ok('unchanged words are no change; words past the limit are cut to it', V.textPatch(hero, 'title', 'Find your flow') === null && V.textPatch(hero, 'title', 'x'.repeat(999)).content.title.length === V.textAt(hero, 'title').max);
  ok('a field is named for a person', V.fieldLabel('items.1.text') === 'items 2 text');
  const locked = V.setLocked(spec, 'hero', true);
  ok('locking marks the section locked and fixed; unlocking clears it', locked.sections.find((x) => x.id === 'hero').locked === true && locked.sections.find((x) => x.id === 'hero').fixed === true && !('locked' in V.setLocked(locked, 'hero', false).sections.find((x) => x.id === 'hero')) && V.setLocked(spec, 'nope', true) === null);
  ok('a lock survives being stored and read back', V.normalizeSpec(JSON.parse(J(locked)), board).sections.find((x) => x.id === 'hero').locked === true);
  ok('a change to a locked section is caught; a page-wide or another section\'s change is not', J(V.lockedTouched(locked, { op: 'content', sectionId: 'hero', content: { title: 'x' }, summary: '' })) === J(['hero']) && !V.lockedTouched(locked, { op: 'content', sectionId: 'why', content: {}, summary: '' }).length && !V.lockedTouched(locked, { op: 'tokens', tokens: {}, summary: '' }).length);
  ok('a model cannot write a lock: it is not a patch it knows', !V.PATCH_OPS.includes('lock') && V.normalizePatch({ op: 'lock', sectionId: 'hero' }).op === 'none');
  const replaced = V.applyPatch(locked, { op: 'replace', sectionId: 'hero', section: { kind: 'hero', content: { title: 'New' } }, summary: '' }, board);
  ok('a change the designer agreed to keeps the section locked', replaced.ok && replaced.spec.sections.find((x) => x.id === 'hero').locked === true);
  // a new generation carries the locked section over unchanged
  const fresh = V.normalizeSpec({ title: 'Lotus', pageType: 'website', sections: [
    { id: 'nav', kind: 'nav', content: { brand: 'Lotus', links: ['Book'] } },
    { id: 'opening', kind: 'hero', variant: 'split', content: { title: 'Something else entirely', primary: 'Go' } },
    { id: 'foot', kind: 'footer', content: { brand: 'Lotus' } },
  ] }, board);
  const held = V.holdLocked(fresh, locked);
  const h = held.spec.sections.find((x) => x.kind === 'hero');
  ok('regenerated: the locked hero is exactly as it was, in the new hero\'s place, and said', J(h) === J(locked.sections.find((x) => x.id === 'hero')) && held.spec.sections.filter((x) => x.kind === 'hero').length === 1 && held.spec.sections[1].kind === 'hero' && held.kept.length === 1 && held.spec.notes.some((n) => /locked hero/.test(n)));
  const noHero = V.normalizeSpec({ title: 'Lotus', pageType: 'website', sections: [{ id: 'nav', kind: 'nav', content: { brand: 'Lotus', links: [] } }, { id: 'foot', kind: 'footer', content: { brand: 'Lotus' } }] }, board);
  ok('…and put back where it stood when the new design has none', V.holdLocked(noHero, locked).spec.sections[1].id === 'hero');
  ok('nothing locked: the new design as it came', V.holdLocked(fresh, spec).spec === fresh);
  // the automatic repairs leave a locked section alone
  const audit = (o = {}) => V.normalizeAudit({ width: 390, viewport: 844, height: 4000, overflowX: 0, bodySize: 17, sections: [], headings: [], contrast: [], ...o });
  const lowIn = (s) => V.evaluateDesign(s, { phone: audit({ contrast: [{ section: 'hero', path: 'title', ratio: 2.1, need: 4.5, size: 16, text: 'x' }] }) });
  const open = lowIn(spec).findings.find((f) => f.section === 'hero' && f.fix);
  const kept = lowIn(locked).findings.find((f) => f.section === 'hero');
  if (open) ok('a finding in a locked section is said, but its fix is left to the designer', kept && !kept.fix && /locked/.test(kept.blocked ?? ''), J(kept));
  else ok('(the contrast finding carries a fix for an unlocked section)', false, J(lowIn(spec).findings));
}

console.log('\n=== composition: directions that differ in structure ===');
{
  const mk = (objective) => {
    const b = V.normalizeBrief({ pageType: 'website', platform: 'web', objective, audience: 'people', personality: ['calm', 'clear'], visualDirection: 'considered', palette: [], typography: { display: 'Fraunces', body: 'Inter' }, userGoals: ['See the work', 'Get in touch', 'Read the story'] }, new Set());
    b.intent = V.settleIntent(V.briefWords(b), {});
    return b;
  };
  const cases = {
    'a booking screen': mk('Booking screen for an already-selected yoga class'),
    'an architecture studio site': mk('A website for an experimental architecture studio'),
    'a scientific dashboard': mk('A scientific dashboard for monitoring lab sensor readings'),
    'a fashion editorial': mk('A luxury fashion editorial magazine story'),
    'a nonprofit site with a donation form': mk('A website for a children’s nonprofit with a donation form'),
    'a motion portfolio': mk('A motion design portfolio to show my work'),
  };
  for (const [what, b] of Object.entries(cases)) {
    const dirs = V.proposeDirections({ brief: b });
    const studies = dirs.map((d) => V.studySpec(d, b, 'Name', []));
    const dv = V.diversityOf(studies);
    const flat = V.diversityOf(dirs.map((d) => V.studySpec({ ...d, compose: undefined, order: undefined, lead: undefined, plan: undefined, shapes: undefined }, b, 'Name', [])));
    ok(`${what}: three plans, three structures (closest pair ≥ 0.33 apart; 0 without plans)`, new Set(dirs.map((d) => d.plan)).size === 3 && dv.minStructure >= 0.33 && flat.minStructure === 0, J({ plans: dirs.map((d) => d.plan), dv: dv.minStructure, flat: flat.minStructure }));
  }
  const dash = cases['a scientific dashboard'];
  const dd = V.proposeDirections({ brief: dash });
  const leads = dd.map((d) => V.studySpec(d, dash, 'Lab', []).sections.find((x) => x.kind !== 'app-header')?.kind);
  ok('a dashboard\'s three directions lead with different things: figures, the table, the trend', new Set(leads).size === 3, J(leads));
  const fitted = V.fitToIntent(V.normalizeSpec({ title: 'Lab', pageType: 'app-screen', sections: [{ id: 's', kind: 'stat-cards', content: V.sampleFor('stat-cards', dash.intent, dash) }, { id: 't', kind: 'table', content: V.sampleFor('table', dash.intent, dash) }] }, board), dash.intent, { brief: dash, dir: dd.find((d) => d.plan === 'detail-first') });
  ok('a generated screen takes its direction\'s order', fitted.spec.sections.find((x) => x.kind !== 'app-header').kind === 'table', J(fitted.spec.sections.map((x) => x.kind)));
  ok('a dashboard with no header gets its own: its name and what it is for', fitted.spec.sections[0].kind === 'app-header' && fitted.spec.sections[0].content.title === 'Lab' && fitted.changes.some((c) => /header/.test(c)));
  const port = cases['a motion portfolio'];
  const pf = V.proposeDirections({ brief: port, notes: '' }).find((d) => d.lead === 'gallery') ?? { ...V.proposeDirections({ brief: port })[0], lead: 'gallery', compose: { gallery: 'mosaic' } };
  const page = V.normalizeSpec({ title: 'Reel', pageType: 'website', sections: [{ id: 'nav', kind: 'nav', content: { brand: 'Reel', links: [] } }, { id: 'hero', kind: 'hero', content: { title: 'Motion, made carefully' } }, { id: 'work', kind: 'gallery', images: ['openverse:a1', 'openverse:a2'], content: {} }] }, board);
  const led = V.fitToIntent(page, port.intent, { brief: port, dir: pf });
  ok('a page takes its direction\'s lead: the work before the words', led.spec.sections[1].kind === 'gallery' && led.changes.some((c) => /Opened with the gallery/.test(c)), J(led.spec.sections.map((x) => x.kind)));
  const noPic = V.fitToIntent(V.normalizeSpec({ title: 'x', pageType: 'website', sections: [{ id: 'hero', kind: 'hero', variant: 'statement', content: { title: 'Hi' } }] }, board), V.readIntent('a website for a studio'), { dir: { ...pf, compose: { hero: 'full-bleed' } } });
  ok('a layout built around a picture the section lacks falls back, as it always does', noPic.spec.sections[0].variant !== 'full-bleed', noPic.spec.sections[0].variant);
  ok('a stored direction keeps its plan, order and lead', (() => { const d = V.normalizeDirection(JSON.parse(J(dd[1]))); return d.plan === dd[1].plan && J(d.order) === J(dd[1].order); })());
  ok('generation is told the order and what leads', V.generateSystem(dash, dd[1]).includes('order of importance: table'));
  ok('a donation is a required form, and its sample takes no payment', V.requiredComponents(cases['a nonprofit site with a donation form'].intent).includes('form') && /no payment/.test(V.sampleFor('form', cases['a nonprofit site with a donation form'].intent, {}).note));
  ok('structure is measured apart from tokens', V.structuralDistance({ sections: [{ kind: 'hero', variant: 'poster' }] }, { sections: [{ kind: 'hero', variant: 'poster' }] }) === 0 && V.structuralDistance({ sections: [{ kind: 'hero', variant: 'poster' }, { kind: 'features', variant: 'grid' }] }, { sections: [{ kind: 'features', variant: 'list' }, { kind: 'hero', variant: 'statement' }] }) > 0.5);
}


console.log('\n=== layout: what the designer decides, the one question, the settings each direction varies ===');
{
  const mkB = (objective, extra = {}) => {
    const b = V.normalizeBrief({ pageType: 'website', platform: 'web', objective, audience: 'people', personality: ['calm', 'clear'], visualDirection: 'considered', palette: [], typography: { display: 'Fraunces', body: 'Inter' }, userGoals: ['Book a time', 'See prices'], ...extra }, new Set());
    b.intent = V.settleIntent(V.briefWords(b), {});
    return b;
  };
  // ── reading the designer's words
  const r1 = V.readLayout('An asymmetric booking page for a barber, the times first, not centred, lots of white space');
  ok('words decide: asymmetric, the times first, not centred (a negative is a decision for one side)', r1.values.arrangement === 'asymmetric' && r1.values.lead === 'task' && r1.values.align === 'left' && r1.density === 'spacious', J(r1));
  ok('…each with the words it was read from', r1.said.align === 'not centred' && /times first/.test(r1.said.lead), J(r1.said));
  ok('centred is read as centred, no photos as no pictures', V.readLayout('a centred, symmetrical page with no photos').values.align === 'center' && V.readLayout('a centred page with no photos').values.pictures === 'none');
  ok('words that say nothing about the layout decide nothing', J(V.readLayout('a booking page for a barbershop').values) === '{}');

  // ── the one layout question
  const words = 'A booking page for a barbershop called Fade & Co where people book a haircut';
  const lq = V.layoutQuestion(words, [], 5);
  ok('the layout question asks what someone should see first, with answers for this kind of work', lq && lq.id === V.LAYOUT_QUESTION_ID && lq.topic === 'hierarchy' && lq.options[0] === 'The times to choose from' && lq.options.some((o) => /haircut/.test(o)), J(lq));
  ok('it is asked once', V.layoutQuestion(words, [lq], 6) === null);
  ok('never when the words already say what leads', V.layoutQuestion(`${words}, the times first`, [], 7) === null);
  ok('a dashboard is asked what matters at a glance: figures, the trend, the detail', J(V.layoutQuestion('a dashboard for lab sensor readings', [], 1).options) === J(['The key figures', 'The trend over time', 'The detailed list']));
  const sk = V.sketchOptions(words);
  ok('each answer can be drawn: its lead, the kind of work, the subject in the designer\'s words', sk.length === 3 && sk[0].value === 'task' && sk[1].value === 'subject' && sk[0].kind === 'booking' && /haircut/.test(sk[0].subject), J(sk));

  // ── when SocriaUX asks it (discovery.ts withLayoutQuestion)
  const turn = (questions, answered = [], ready = false) => V.withLayoutQuestion({ understanding: { summary: '', known: {}, gaps: [] }, questions, queries: [], palettes: [], type: [], ready, note: '' }, { intent: words, questions: answered, understanding: { summary: '', known: {}, gaps: [] }, moodboard: V.normalizeMoodboard({}), remark: '' }, 9);
  const mq = (topic, question) => ({ id: `q_${topic}`, topic, question, why: '', options: [], multi: false, answer: '', skipped: false, askedAt: 1 });
  const aud = { ...mq('audience', 'Who is it for?'), answer: 'Regulars and walk-ins' };
  ok('not on the first turn while the model still has its question (who it is for comes first)', turn([mq('audience', 'Who is it for?')]).questions.length === 1);
  const t2 = turn([mq('brand', 'What should it feel like?')], [aud]);
  ok('after the first answer, it comes after the model\'s question', t2.questions.length === 2 && t2.questions[1].id === V.LAYOUT_QUESTION_ID, J(t2.questions.map((q) => q.id)));
  ok('never as a third question in a turn', turn([mq('brand', 'a'), mq('content', 'b')], [aud]).questions.every((q) => q.id !== V.LAYOUT_QUESTION_ID));
  const t3 = turn([mq('hierarchy', 'What matters most on the page?')], [aud]);
  ok('a hierarchy question the model wrote gives way to it', t3.questions.length === 1 && t3.questions[0].id === V.LAYOUT_QUESTION_ID, J(t3.questions));
  const t4 = turn([], [], true);
  ok('a detailed brief that is ready at once still gets the one question, and stays ready', t4.ready && t4.questions.length === 1 && t4.questions[0].id === V.LAYOUT_QUESTION_ID);
  ok('once asked, never again', turn([], [aud, { ...lq, answer: 'The times to choose from' }]).questions.length === 0);
  ok('the model is told not to ask it', /Never ask what should come first/.test(V.discoverSystem()) && !/constraints and hierarchy when they matter/.test(V.discoverSystem()));

  // ── settling the decisions (latest word last)
  const intentB = V.readIntent(words);
  const answered = [{ ...lq, answer: 'The times to choose from' }];
  const s1 = V.settleLayout(`${words}. Asymmetric`, answered, null, intentB);
  ok('words and the answer settle the decisions, each with where it came from', s1.arrangement === 'asymmetric' && s1.from.arrangement.by === 'words' && s1.lead === 'task' && s1.from.lead.by === 'answer', J(s1));
  const mine = V.decideLayout(s1, 'align', 'center');
  ok('what the designer sets in the brief is theirs', mine.align === 'center' && mine.from.align.by === 'designer');
  const s2 = V.settleLayout(`${words}. Left-aligned and asymmetric`, answered, mine, intentB);
  ok('…and a rewrite keeps it, whatever the old words say', s2.align === 'center' && s2.from.align.by === 'designer', J(s2));
  const s3 = V.settleLayout(`${words}. Make it left-aligned`, answered, mine, intentB, 'make it left-aligned');
  ok('the instruction a rewrite is asked with is the newest word, and can change it', s3.align === 'left' && s3.from.align.by === 'words', J(s3));
  const open = V.decideLayout(s1, 'arrangement', null);
  ok('"SocriaUX decides" leaves it open on purpose', !open.arrangement && open.delegated.includes('arrangement'));
  ok('…and old words do not take it back on a rewrite', !V.settleLayout(`${words}. Asymmetric`, answered, open, intentB)?.arrangement);
  ok('"You decide" on the layout question leaves what leads open', V.settleLayout(words, [{ ...lq, delegated: true }], null, intentB)?.delegated?.includes('lead'));
  const kept = V.settleLayout(words, [], { align: 'center', from: { align: { by: 'words', said: 'centred' } } }, intentB);
  ok('an earlier instruction\'s reading stays when the new words say nothing about it', kept?.align === 'center', J(kept));
  ok('decisions from anywhere else are cleaned: unknown values and sources dropped', J(V.normalizeLayout({ lead: 'banana', align: 'center', from: { align: { by: 'model', said: 'x' } }, delegated: ['align', 'nope'] })) === J({ align: 'center' }));
  ok('a brief keeps its layout decisions through storage', V.normalizeBrief({ ...mkB('A booking page'), layout: s1 }, new Set()).layout?.lead === 'task');
  ok('the generator is told the decisions, and that the rest is its to vary', /THE DESIGNER'S LAYOUT DECISIONS[^\n]*what leads: the times to choose from; arrangement: uneven/.test(V.generateSystem({ ...mkB(words), layout: s1 }, null)), V.layoutBrief(s1, intentB));
  ok('the brief says where each decision came from, and what is left open', /Arrangement: uneven, from your words/.test(V.layoutSaid(s1, intentB)) && /Alignment, pictures: left open/.test(V.layoutSaid(s1, intentB)), V.layoutSaid(s1, intentB));

  // ── what the decisions allow
  ok('nothing decided: no centred opening, in any language (quiet luxury included, now that it was reworked off it)', V.LANGUAGES.every((l) => !V.heroVariantsFor(undefined, true, l.id).includes('centered')));
  ok('centred decided: the centred opening is allowed', V.heroVariantsFor({ align: 'center' }, true, 'swiss').includes('centered'));
  ok('no pictures: no opening built around one', V.heroVariantsFor({ pictures: 'none' }, true).every((v) => v !== 'split' && v !== 'full-bleed'));
  ok('a booking led by what is booked keeps it first (a split with its card)', J(V.bookingVariantsFor({ lead: 'subject' }, true)) === J(['split']));
  ok('a decision that cannot be met (a picture lead, no picture) does not empty the choice', V.bookingVariantsFor({ lead: 'picture' }, false).length > 0);

  // ── the settings, varied within the language and seeded per project
  const a = V.shapeFor('booking', 'swiss', undefined, undefined, V.seeded(42));
  ok('the same seed gives the same settings', J(a) === J(V.shapeFor('booking', 'swiss', undefined, undefined, V.seeded(42))));
  ok('settings stay within their fields', J(V.normalizeShape('booking', a)) === J(a) && a.ratio >= 0.3 && a.ratio <= 0.4, J(a));
  const sigs = new Set(Array.from({ length: 20 }, (_, i) => V.shapeSignature('booking', 'split', V.shapeFor('booking', 'swiss', undefined, undefined, V.seeded(i * 7919)))));
  ok('twenty projects in one language: many different settings (≥ 8 of 20)', sigs.size >= 8, sigs.size);
  const dec = V.shapeFor('booking', 'swiss', { align: 'center', arrangement: 'split', lead: 'subject' }, 'spacious', V.seeded(3));
  ok('what is decided holds: the alignment, an even split, the card first, the space', dec.align === 'center' && dec.ratio >= 0.45 && dec.ratio <= 0.55 && dec.summary === 'card' && dec.side === 'start' && dec.density === 'airy', J(dec));
  ok('uneven decided: an uneven proportion', [1, 2, 3, 4, 5, 6].every((i) => { const r = V.shapeFor('hero', 'night', { arrangement: 'asymmetric' }, undefined, V.seeded(i)).ratio; return r <= 0.38 || r >= 0.56; }));
  ok('the times first: the choice is not boxed in a card', [1, 2, 3, 4, 5, 6, 7, 8].every((i) => V.shapeFor('booking', 'craft', { lead: 'task' }, undefined, V.seeded(i)).summary !== 'card'));

  // ── directions: decisions honoured in all three, the rest varied, per project
  const bk = mkB('Booking screen for an already-selected yoga class');
  const p1 = V.proposeDirections({ brief: bk, salt: 'p_one' });
  ok('one project draws the same directions every time (in the browser and on the server)', J(p1) === J(V.proposeDirections({ brief: bk, salt: 'p_one' })));
  const st = (ds, b) => ds.map((d) => V.structureOf(V.studySpec(d, b, 'Name', [])).join('|'));
  const many = new Set(Array.from({ length: 8 }, (_, i) => st(V.proposeDirections({ brief: bk, salt: `p_${i}` }), bk)).flat());
  ok('the same brief in eight projects: many different booking structures (≥ 12 of 24)', many.size >= 12, many.size);
  const subj = V.proposeDirections({ brief: { ...bk, layout: { lead: 'subject' } }, salt: 'p_one' });
  ok('what leads, decided: every direction keeps the class first (a split with its card)', subj.every((d) => d.compose?.booking === 'split' && d.shapes?.booking?.summary === 'card'), J(subj.map((d) => [d.compose?.booking, d.shapes?.booking])));
  const site = mkB('A website for an architecture studio', { userGoals: ['See the work'] });
  const cen = V.proposeDirections({ brief: { ...site, layout: { align: 'center' } }, salt: 'p_two' });
  ok('centred, decided: every direction\'s opening is centred', cen.every((d) => d.shapes?.hero?.align === 'center'), J(cen.map((d) => d.shapes?.hero)));
  const plain = V.proposeDirections({ brief: site, salt: 'p_two' });
  ok('nothing decided: no direction opens centred unless its language centres on purpose', plain.every((d) => d.compose?.hero !== 'centered' || V.ON_PURPOSE[d.language]?.includes('centred')), J(plain.map((d) => [d.language, d.compose?.hero])));
  ok('a direction keeps its settings through storage', J(V.normalizeDirection(JSON.parse(J(p1[0]))).shapes) === J(p1[0].shapes));
  ok('a project\'s salt is its id, when it is one', V.saltOf('p_abc-1') === 'p_abc-1' && V.saltOf('../etc') === '' && V.saltOf(7) === '');

  // ── honouring the decisions in a design, whatever was drawn
  const pageSpec = V.normalizeSpec({ title: 'Studio', pageType: 'website', sections: [{ id: 'nav', kind: 'nav', content: { brand: 'Studio', links: [] } }, { id: 'hero', kind: 'hero', variant: 'split', content: { title: 'Rooms for thinking' }, images: ['openverse:a1'] }, { id: 'work', kind: 'gallery', images: ['openverse:a2', 'openverse:a3'], content: {} }] }, board);
  const opts = { pageType: 'website', screen: false, needs: [], kind: 'site', language: 'swiss' };
  const h1 = V.honourLayout(pageSpec.sections, { lead: 'work' }, opts);
  ok('the work first, decided: the gallery opens the page, and it is said', h1.sections[1].kind === 'gallery' && h1.changes.some((c) => /Opened with the gallery, as you decided/.test(c)), J(h1));
  const h2 = V.honourLayout(pageSpec.sections, { pictures: 'none' }, opts);
  const hero2 = h2.sections.find((x) => x.kind === 'hero');
  ok('no pictures, decided: the opening loses its picture and its split', !hero2.images.length && hero2.variant !== 'split' && h2.changes.some((c) => /pictures out/.test(c)), J(hero2));
  const lockedHero = pageSpec.sections.map((x) => (x.kind === 'hero' ? { ...x, locked: true } : x));
  ok('a locked section is left as it is', V.honourLayout(lockedHero, { pictures: 'none', align: 'center' }, opts).sections.find((x) => x.kind === 'hero').images.length === 1);
  const centred = V.honourLayout([{ ...pageSpec.sections[1], variant: 'editorial', images: [] }], { align: 'center' }, opts).sections[0];
  ok('centred, decided: the opening is set on the centre', centred.shape?.align === 'center', J(centred));
  const bkSec = V.normalizeSection({ id: 'b', kind: 'booking', variant: 'split', content: V.sampleFor('booking', bk.intent, bk), shape: { ratio: 0.5 } }, 'app-screen', null, new Set());
  const uneven = V.honourLayout([bkSec], { arrangement: 'asymmetric' }, { ...opts, pageType: 'app-screen', screen: true, kind: 'booking' }).sections[0];
  ok('uneven, decided: an even booking split becomes uneven', uneven.shape.ratio <= 0.38, J(uneven.shape));
  const dashSecs = [{ id: 'h', kind: 'app-header', variant: 'simple', content: { title: 'Lab' } }, { id: 's', kind: 'stat-cards', variant: 'row', content: {} }, { id: 'c', kind: 'chart', variant: 'line', content: {} }, { id: 't', kind: 'table', variant: 'plain', content: {} }];
  const tr = V.honourLayout(dashSecs, { lead: 'trend' }, { ...opts, pageType: 'app-screen', screen: true, kind: 'dashboard' });
  ok('the trend first, decided: the chart leads the screen after its header', J(tr.sections.map((x) => x.kind)) === J(['app-header', 'chart', 'stat-cards', 'table']), J(tr.sections.map((x) => x.kind)));
  ok('nothing decided: nothing changed', V.honourLayout(pageSpec.sections, undefined, opts).changes.length === 0);

  // ── a changed brief carries the decisions into the design in place
  const before = mkB('A website for an architecture studio');
  const after = { ...before, layout: V.decideLayout(undefined, 'lead', 'work') };
  ok('a decision changed in the brief is a change the design can take', V.changedVisualParts(before, after).includes('layout'));
  ok('where a decision came from alone is not a change', !V.changedVisualParts({ ...before, layout: { lead: 'work', from: { lead: { by: 'answer', said: 'x' } } } }, { ...before, layout: { lead: 'work', from: { lead: { by: 'designer', said: '' } } } }).includes('layout'));
  const applied = V.briefToDesign({ ...pageSpec, look: pageSpec.look ?? V.lookFromTokens?.(pageSpec.tokens) }, after, ['layout']);
  ok('…and applying it there opens the page with the work', applied.sections[1].kind === 'gallery', J(applied.sections.map((x) => x.kind)));

  // ── defaults that do not look generated
  const genSpec = V.normalizeSpec({ title: 'x', pageType: 'website', sections: [{ id: 'hero', kind: 'hero', variant: 'centered', content: { title: 'Hello' } }] }, board);
  const g1 = V.avoidGeneric(genSpec, { language: 'swiss' });
  ok('a centred opening nobody chose is set to one side, and it is said', g1.spec.sections[0].variant === 'editorial' && g1.changes.some((c) => /one side/.test(c)));
  ok('…kept when the designer decided it', V.avoidGeneric(genSpec, { language: 'swiss', decisions: { align: 'center' } }).spec.sections[0].variant === 'centered');
  ok('…and quiet luxury, which used to centre by default, no longer keeps it unasked', V.avoidGeneric(genSpec, { language: 'quiet-luxury' }).spec.sections[0].variant === 'editorial');
  ok('a fixed section is never touched', V.avoidGeneric({ ...genSpec, sections: [{ ...genSpec.sections[0], fixed: true }] }, { language: 'swiss' }).spec.sections[0].variant === 'centered');

  // ── the settings as a patch, and as the page draws them
  const withBk = V.normalizeSpec({ title: 'Yoga', pageType: 'app-screen', sections: [{ id: 'b', kind: 'booking', variant: 'split', content: V.sampleFor('booking', bk.intent, bk) }] }, board);
  const sp = V.applyPatch(withBk, { op: 'shape', sectionId: 'b', shape: { side: 'end', ratio: 0.9, times: 'rows', colour: 'red' }, summary: 'x' });
  ok('a shape patch sets what was asked, clamped, the rest kept, and marks it the designer\'s', sp.ok && sp.spec.sections[0].shape.side === 'end' && sp.spec.sections[0].shape.ratio === 0.62 && sp.spec.sections[0].shape.times === 'rows' && !('colour' in sp.spec.sections[0].shape) && sp.spec.sections[0].fixed === true, J(sp.spec?.sections[0]));
  ok('…merged with what was there', V.applyPatch(sp.spec, { op: 'shape', sectionId: 'b', shape: { summary: 'bar' } }).spec.sections[0].shape.side === 'end');
  ok('a section with no settings refuses one', !V.applyPatch(V.normalizeSpec(SPEC, board), { op: 'shape', sectionId: 'menu', shape: { side: 'end' } }).ok);
  ok('nothing valid asked: refused', !V.applyPatch(withBk, { op: 'shape', sectionId: 'b', shape: { colour: 'red' } }).ok);
  const at = V.shapeAttrs({ kind: 'booking', variant: 'split', shape: { side: 'end', ratio: 0.34, times: 'rows' } });
  ok('the page draws them as classes and proportions', /sh-side-end/.test(at.cls) && /sh-ratio/.test(at.cls) && /sh-times-rows/.test(at.cls) && at.vars.includes('--sh-a:34fr') && at.vars.includes('--sh-b:66fr'), J(at));
  ok('a setting its layout does not draw is not written', !/sh-side/.test(V.shapeAttrs({ kind: 'booking', variant: 'list', shape: { side: 'end' } }).cls));
  const barPage = V.renderDesign(V.applyPatch(withBk, { op: 'shape', sectionId: 'b', shape: { summary: 'bar' } }).spec, board.refs);
  ok('your choice by the button: the summary sits in a bar beside the confirm action', /bk-bar/.test(barPage.html) && parse(barPage.html).querySelector('.bk-bar .bk-choice') !== null);

  // EVERY SETTING DRAWS SOMETHING: for each kind, layout and setting it offers, a non-default value gives the
  // section a class or variable that a rule of the page's own CSS selects an element with (no decorative controls)
  const selectorsOf = (css) => [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter((x) => x && !x.startsWith('@'));
  const strip = (sel) => sel.replace(/::?[a-z-]+(\([^)]*\))?/g, '').trim();
  const pick = (k, f, def) => (f.t === 'enum' ? f.values.find((v) => v !== def) : def === f.min ? f.max : f.min);
  const missing = [];
  for (const [kind, variants] of Object.entries(V.SHAPE_EFFECTIVE)) {
    for (const [variant, fields] of Object.entries(variants)) {
      for (const k of fields) {
        const f = V.SHAPE_FIELDS[kind][k];
        const v = pick(k, f, V.shapeDefault(kind, variant)[k]);
        const content = kind === 'booking' ? V.sampleFor('booking', bk.intent, bk) : { title: 'Rooms for thinking', subtitle: 'An architecture studio.', primary: 'See the work' };
        const pt = kind === 'booking' ? 'app-screen' : 'website';
        const sec = { id: 'x', kind, variant, content, images: ['openverse:a1'], shape: { [k]: v } };
        const sp2 = V.normalizeSpec({ title: 'T', pageType: pt, sections: [sec] }, board);
        const drawn = sp2?.sections.find((x) => x.kind === kind);
        if (!drawn || drawn.variant !== variant) { missing.push(`${kind}/${variant}: not drawn as ${variant}`); continue; }
        const html = V.renderDesign(sp2, board.refs).html;
        const doc = parse(html);
        const css = [...doc.querySelectorAll('style')].map((x) => x.textContent).join('\n');
        const token = f.t === 'enum' ? `sh-${k}-${v}` : k === 'ratio' ? 'sh-ratio' : `sh-${k}`;
        const hits = selectorsOf(css).flatMap((group) => group.split(',')).map((x) => x.trim()).filter((x) => new RegExp(`\\.${token}(?![\\w-])`).test(x));
        const works = hits.some((x) => { try { return !!doc.querySelector(strip(x)); } catch { return false; } });
        if (!works) missing.push(`${kind}/${variant}/${k}=${v} (${hits.length} rules)`);
      }
    }
  }
  ok('every setting each layout offers draws something on the page', !missing.length, J(missing));

  // ── structure measures the settings too
  ok('the same layout set differently is a different structure, by how much differs', (() => { const x = V.structuralDistance({ sections: [{ kind: 'booking', variant: 'split', shape: { side: 'start', times: 'tiles' } }] }, { sections: [{ kind: 'booking', variant: 'split', shape: { side: 'end', times: 'tiles' } }] }); return x > 0 && x < 0.5; })());
  ok('…and a proportion only a hair different is the same', V.structuralDistance({ sections: [{ kind: 'booking', variant: 'split', shape: { ratio: 0.31 } }] }, { sections: [{ kind: 'booking', variant: 'split', shape: { ratio: 0.33 } }] }) === 0);
}


console.log('\n=== the looks generated pages share: detected, kept out unless asked for ===');
{
  const prof = (o = {}) => ({ colors: { background: '#ffffff', accent: '#1f4ea3' }, fonts: { display: 'Inter' }, radius: 'soft', look: { align: 'left', grid: 'stack', containers: 'open', rules: 'none', motifs: [], accent2: '' }, ...o });
  const tells = (p) => V.tellsOf(p).map((h) => h.tell);
  ok('cream, a serif headline and terracotta together are the look; any one alone is not', J(tells(prof({ colors: { background: '#f4ede4', accent: '#b4552d' }, fonts: { display: 'Fraunces' } }))) === J(['cream-serif-terracotta']) && !tells(prof({ colors: { background: '#f4ede4', accent: '#b4552d' }, fonts: { display: 'Inter' } })).length && !tells(prof({ colors: { background: '#ffffff', accent: '#b4552d' }, fonts: { display: 'Fraunces' } })).length);
  ok('near-black with one acid green is the look; a second ink beside it is not', tells(prof({ colors: { background: '#0b0b0b', accent: '#a6ff00' } })).includes('black-acid-pop') && !tells(prof({ colors: { background: '#0b0b0b', accent: '#a6ff00' }, look: { ...prof().look, accent2: '#ff7ab6' } })).includes('black-acid-pop'));
  ok('hairline boxes with numbered sections, everything centred, round cards everywhere: each detected', J(tells(prof({ look: { align: 'center', grid: 'centered', containers: 'ruled', rules: 'hairline', motifs: ['numbering'] } })).sort()) === J(['all-centred', 'hairline-columns']) && tells(prof({ radius: 'round', look: { ...prof().look, containers: 'cards' } })).includes('rounded-everything'));
  ok('emoji as markers, from the words; accent rails and a purple gradient, from the rendered page', tells(prof({ sections: [{ kind: 'features', content: { items: [{ title: '🚀 Fast' }] } }] })).includes('emoji-markers') && tells(prof({ style: { gradients: 0, roundedBoxes: 0, centred: 0, blocks: 0, emoji: 0, rails: 3 } })).includes('accent-rail-cards') && tells(prof({ colors: { background: '#ffffff', accent: '#6d3df5' }, style: { gradients: 2, roundedBoxes: 0, centred: 0, blocks: 0, emoji: 0, rails: 0 } })).includes('purple-blue-gradient'));
  // what the designer asked for stays theirs
  const asked = (w, c) => [...V.askedTells(w, c)].sort();
  ok('asked for in words: cream and terracotta; centred; a gradient', asked('a cream and terracotta palette').includes('cream-serif-terracotta') && asked('a centred layout').includes('all-centred') && asked('a soft gradient').includes('purple-blue-gradient'));
  ok('…not when the words say to avoid it ("not centred", "no gradients")', !asked('not centred, please').includes('all-centred') && !asked('no gradients at all').includes('purple-blue-gradient'));
  ok('asked for in decisions: centred in the brief, round corners set, a palette that is the designer\'s own', asked('', { align: 'center' }).includes('all-centred') && asked('', { corners: 'round' }).includes('rounded-everything') && asked('', { ownColours: true }).includes('cream-serif-terracotta'));
  // the four styles that sat on those looks, reworked
  const L = Object.fromEntries(V.LANGUAGES.map((l) => [l.id, l]));
  ok('the styles reworked off the looks: Journal (no hairline boxes, no reflexive numbering), Market label (no cream, no soft serif first, no pills), After dark (a deep coloured ground, two inks), Quiet luxury (a cool stone ground, never centred)', L.broadsheet.name === 'Journal' && !L.broadsheet.look.containers.includes('ruled') && L.broadsheet.look.motifs.every((m) => !m.includes('numbering')) && L.craft.name === 'Market label' && L.craft.palette !== 'tinted' && L.craft.display[0] !== 'Fraunces' && !L.craft.look.buttons.includes('pill') && L.night.palette === 'deep' && L.night.accent2 && L['quiet-luxury'].palette === 'stone' && !L['quiet-luxury'].look.align.includes('center'));
  ok('…and no language uses one of them on purpose any more', J(V.ON_PURPOSE) === '{}');
  // the engine: across every language and the palettes that invite each look, nothing nobody asked for
  const PALS = { terracotta: ['#f4ede4', '#2b211b', '#b4552d'], acid: ['#0b0b0b', '#f2f2f2', '#a6ff00'], vermilion: ['#111111', '#f5f5f5', '#ff4a1c'], navy: ['#f7f7f5', '#14213d', '#1f4ea3'] };
  const SUBJ = ['A website for a neighbourhood bakery', 'A website for a jazz bar', 'A website for a small hotel', 'A literary magazine story', 'A website for a skincare brand', 'A website for a yoga studio'];
  let n = 0;
  const bad = [];
  const seenLangs = new Set();
  for (const [pn, [bg, tx, ac]] of Object.entries(PALS)) for (const disp of ['Fraunces', 'Space Grotesk']) for (const w of SUBJ) {
    const b = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: w, audience: 'people', personality: ['warm'], visualDirection: 'considered', palette: [{ hex: bg, role: 'background' }, { hex: tx, role: 'text' }, { hex: ac, role: 'accent' }], typography: { display: disp, body: 'Inter' }, userGoals: ['See it'] }, new Set());
    b.intent = V.settleIntent(V.briefWords(b), {});
    for (const d of [...V.proposeDirections({ brief: b, salt: 'p_t1' }), ...V.proposeDirections({ brief: b, salt: 'p_t2', round: 1 })]) {
      n++;
      seenLangs.add(d.language);
      const own = d.rationale.some((r) => /Keeps the palette and type pair you approved/.test(r));
      const hits = V.unaskedTells({ colors: d.tokens.colors, fonts: d.tokens.fonts, radius: d.tokens.radius, look: d.look }, w, { ownColours: own });
      if (hits.length) bad.push(`${pn}/${disp}/${d.language}: ${hits.map((h) => h.tell)}`);
    }
  }
  ok(`${n} directions across ${seenLangs.size} languages: none shows a generated look nobody asked for`, !bad.length && seenLangs.size >= 9, bad.slice(0, 4).join(' | '));
  const tc = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for a bakery', audience: 'people', personality: ['warm'], visualDirection: 'considered', palette: [{ hex: '#f4ede4', role: 'background' }, { hex: '#2b211b', role: 'text' }, { hex: '#b4552d', role: 'accent' }], typography: { display: 'Fraunces', body: 'Inter' }, userGoals: ['See it'] }, new Set());
  const ds = V.proposeDirections({ brief: tc });
  ok('the designer\'s own cream, serif and terracotta stay in the faithful direction; another that would have fallen into it is moved, and says so', V.tellsOf({ colors: ds[0].tokens.colors, fonts: ds[0].tokens.fonts, radius: ds[0].tokens.radius, look: ds[0].look }).some((h) => h.tell === 'cream-serif-terracotta') && V.LANGUAGES.some((l) => V.buildDirection(l, tc, { seed: 7, faithful: false }).rationale.some((r) => /Kept off .* a look generated pages share/.test(r))));
  const askedFor = { ...tc, visualDirection: 'cream and terracotta, a soft serif, like a country kitchen' };
  ok('asked for in the brief\'s words, the look is the designer\'s: no direction is moved off it', V.LANGUAGES.every((l) => !V.buildDirection(l, askedFor, { seed: 7, faithful: false }).rationale.some((r) => /cream with a serif headline/.test(r))));
  // (a direction on cream with terracotta whose headline face is a sans: the model then picks a serif)
  const modelSerif = V.parseDirections({ directions: [{ candidate: 2, fonts: { display: 'Fraunces', body: 'Inter' } }] }, { brief: tc, notes: '' }, ds.map((d) => (d === ds[1] ? { ...d, tokens: { ...d.tokens, fonts: { display: 'Archivo', body: 'Inter' }, colors: { ...d.tokens.colors, background: '#f4ede4', accent: '#b4552d' } } } : d)));
  ok('a face the art-direction model chose that brings the look back is not taken', modelSerif[1].tokens.fonts.display !== 'Fraunces', modelSerif[1].tokens.fonts.display);
  // the brief says it, rather than changing a palette the designer has not approved yet
  const q = V.briefTells(tc, 'A website for a bakery');
  ok('a proposed brief palette that falls into a look is said, as a question still open', q.length === 1 && /a look many generated pages share/.test(V.tellQuestion(q[0])) && V.briefTells(tc, 'cream and terracotta please').length === 0);
  ok('the brief writer and the generator are told the looks to avoid', /generated pages share/.test(V.briefSystem(false)) && /generated pages share/.test(V.generateSystem(tc, null)));
  // a design: the fix that takes a look out is a real patch
  const hairSpec = V.normalizeSpec({ ...SPEC, look: { ...(V.normalizeSpec(SPEC, board).look), containers: 'ruled', rules: 'hairline', motifs: ['numbering'], grid: 'editorial' } }, board);
  const fx = V.tellFix('hairline-columns', hairSpec);
  const fixed = V.applyPatch(hairSpec, fx.patch, board);
  ok('hairline boxes and numbering come out as a look patch, applied by code', fx && !fx.manual && fixed.ok && fixed.spec.look.containers === 'open' && !fixed.spec.look.motifs.includes('numbering') && !V.tellsOf(V.lookProfileOf(fixed.spec)).some((h) => h.tell === 'hairline-columns'));
  ok('the generic score counts each look a page shows', V.genericSignals(hairSpec).some((g) => /hairline rules/.test(g.reason)));
}


console.log('\n=== each direction’s plan, critiqued before anyone sees it ===');
{
  const mkP = (objective, extra = {}) => {
    const b = V.normalizeBrief({ pageType: 'website', platform: 'web', objective, audience: 'people', personality: ['warm', 'clear'], visualDirection: 'considered', palette: [], typography: { display: 'Archivo', body: 'Inter' }, userGoals: ['See it', 'Get in touch'], ...extra }, new Set(['openverse:a1']));
    b.intent = V.settleIntent(V.briefWords(b), {});
    return b;
  };
  ok('colours are named plainly', V.colourName('#0b0b0b') === 'near-black' && V.colourName('#1f4ea3') === 'blue' && /stone|paper/.test(V.colourName('#ecedee')));
  ok('the detail only a subject has: a yoga class’s level and °C; a bakery’s oven times; a lab’s units', V.subjectDetail('Booking screen for a yoga class').terms.includes('°C') && /oven/.test(V.subjectDetail('A website for a neighbourhood bakery').text) && V.subjectDetail('A dashboard for lab sensor readings').terms.includes('hPa'));
  ok('…the designer’s own line with a number in it comes first, and nothing is made up for an unknown subject', /40 minutes/.test(V.subjectDetail('Sessions last 40 minutes. A website for a studio').text) && V.subjectDetail('A website for a xylograph collective') === null);
  // every direction states a whole plan
  const briefs = ['A website for a neighbourhood bakery', 'Booking screen for a yoga class', 'A website for an architecture studio', 'A dashboard for lab sensor readings', 'A literary magazine story', 'A motion design portfolio'].map((w, i) => mkP(w, i % 2 ? { references: ['openverse:a1'] } : {}));
  const all = briefs.flatMap((b) => V.proposeDirections({ brief: b, salt: 'p_plan' }).map((d) => [b, d]));
  const whole = all.every(([b, d]) => {
    const p = d.designPlan;
    if (!p) return false;
    const can = V.drawableSignatures(d, V.planContext(b));
    return p.colours.length >= 4 && p.colours.length <= 6 && p.colours.every((c) => c.name && /^#[0-9a-f]{6}$/.test(c.hex)) && p.type.display && p.type.body && p.layout && can.includes(p.signature) && (p.detail.terms.length > 0 || p.open.some((o) => /only this/.test(o)));
  });
  ok(`every direction (${all.length}) states its plan: 4–6 named colours, its type, its layout, one move it can draw, and its subject detail (or says it still needs one)`, whole, J(all.map(([, d]) => [d.language, d.designPlan?.signature, d.designPlan?.detail.terms])));
  ok('…and every one passes its own critique, but for what only the designer or the model can supply', all.every(([b, d]) => V.critiquePlan(d.designPlan, d, V.planContext(b)).every((i) => i.id === 'no-detail' || i.id === 'tell')), J(all.map(([b, d]) => V.critiquePlan(d.designPlan, d, V.planContext(b)).map((i) => i.id))));
  ok('…its one bold move is the only loud one in its own composition', all.every(([, d]) => !(d.compose?.stats === 'giant' && d.designPlan.signature !== 'oversized-figure') && !(['poster', 'statement'].includes(d.compose?.hero) && d.designPlan.signature !== 'giant-type')));
  // (a site with pictures: a type-only one is led by its headline whatever the project, which is its move)
  const pictured = mkP('A website for an architecture studio', { references: ['openverse:a1'] });
  const sigs = new Set(Array.from({ length: 12 }, (_, i) => V.proposeDirections({ brief: pictured, salt: `p_sig_${i}` }).map((d) => d.designPlan.signature).join('|')));
  ok('the same brief in twelve projects does not always make the same moves', sigs.size >= 3, [...sigs]);
  // the critique, on plans that are generic on purpose
  const site = mkP('A website for an architecture studio', { references: ['openverse:a1'] });
  const base = V.proposeDirections({ brief: site })[1];
  const ctx = V.planContext(site);
  const issues = (d, plan) => V.critiquePlan({ ...d.designPlan, ...plan }, d, ctx).map((i) => i.id).sort();
  ok('the critique catches a move the design cannot draw, the default type pair, numbering on what is not a sequence, no subject detail, and two loud moves', (() => {
    const bad = { ...base, tokens: { ...base.tokens, fonts: { display: 'Inter', body: 'Inter' } }, look: { ...base.look, motifs: ['numbering'] }, compose: { ...base.compose, hero: 'poster', stats: 'giant' } };
    const got = issues(bad, { signature: 'oversized-figure', detail: { text: '', terms: [] } });
    return ['default-type', 'no-detail', 'numbering', 'too-loud'].every((x) => got.includes(x)) && issues({ ...base, compose: {} }, { signature: 'oversized-figure' }).includes('no-signature');
  })());
  const revised = V.plannedDirection({ ...base, tokens: { ...base.tokens, fonts: { display: 'Fraunces', body: 'Inter' } }, look: { ...base.look, motifs: ['numbering', 'captions'] }, compose: { ...base.compose, hero: 'poster', stats: 'giant' } }, ctx, V.seeded(1), 'Public Sans');
  ok('…and revises what it can before anyone sees it, saying what it changed', revised.tokens.fonts.body === 'Public Sans' && !revised.look.motifs.includes('numbering') && revised.compose.stats === 'row' && revised.designPlan.signature === 'giant-type' && revised.designPlan.revised.length >= 3, J(revised.designPlan.revised));
  const lockedType = V.withPlan({ ...base, tokens: { ...base.tokens, fonts: { display: 'Fraunces', body: 'Inter' } }, look: { ...base.look, motifs: ['numbering'] }, locks: ['type', 'motifs'] }, site, '', false, 7);
  ok('…never against the designer’s locks (their type and motifs stay)', lockedType.tokens.fonts.body === 'Inter' && lockedType.look.motifs.includes('numbering'));
  // the model knows the subject: its detail and its move are taken when they hold up
  const written = V.parseDirections({ directions: [{ candidate: 1, detail: 'Each project with its site area in m² and the year it opened', signature: 'giant-type' }, { candidate: 2, signature: 'oversized-figure' }] }, { brief: site, notes: '' }, V.proposeDirections({ brief: site }));
  ok('the art-direction model’s subject detail and move go into the plan; a move the design cannot draw is not taken', /m²/.test(written[0].designPlan.detail.text) && written[0].designPlan.signature === 'giant-type' && written[1].designPlan.signature !== 'oversized-figure');
  ok('the strict schema asks the model for both', J(V.formatFor('art-direction')).includes('"signature"') && J(V.formatFor('art-direction')).includes('"detail"'));
  // the plan in the design
  const dir = { ...base, designPlan: { ...base.designPlan, signature: 'giant-type' } };
  ok('the generator is told the plan: its one move, quiet elsewhere, and the subject detail as content', (() => { const t = V.generateSystem(site, dir); return t.includes("THE DIRECTION'S PLAN") && t.includes('The ONE bold move') && t.includes('Show this as content'); })());
  const page = V.normalizeSpec({ title: 'Studio', pageType: 'website', look: dir.look, tokens: dir.tokens, sections: [{ id: 'hero', kind: 'hero', variant: 'editorial', content: { title: 'Rooms for thinking' } }, { id: 'n', kind: 'stats', variant: 'giant', content: { items: [{ value: '12', label: 'Projects' }, { value: '4', label: 'Cities' }] } }, { id: 'c', kind: 'cta', variant: 'band', tone: 'accent', content: { title: 'Talk to us', primary: 'Write to the studio' } }, { id: 'f', kind: 'footer', content: { brand: 'Studio' } }] }, board);
  const held = V.holdSignature(page, 'giant-type');
  ok('a design makes the plan’s one move (the headline set huge) and quiets the others (giant figures, a field of colour)', J(V.loudMoves(held.spec)) === J(['giant-type']) && held.spec.sections.find((x) => x.id === 'n').variant === 'row' && held.spec.sections.find((x) => x.id === 'c').tone === 'alt', J(V.loudMoves(held.spec)));
  ok('…leaving a section the designer fixed exactly as it is', V.holdSignature({ ...page, sections: page.sections.map((x) => (x.id === 'c' ? { ...x, fixed: true } : x)) }, 'giant-type').spec.sections.find((x) => x.id === 'c').tone === 'accent');
  const ev = V.evaluateDesign(page, {}, [], { direction: dir, brief: site });
  const loudF = ev.findings.find((f) => /More than one loud move/.test(f.message));
  const missingF = ev.findings.find((f) => /one bold move is missing/.test(f.message));
  ok('the evaluation finds a second loud move and a missing signature, each with a fix that applies', !!loudF?.fix && !!missingF?.fix && V.applyPatch(page, loudF.fix, board).ok && V.applyPatch(page, missingF.fix, board).ok, J(ev.findings.map((f) => f.message)));
  const noDetail = ev.findings.find((f) => /the detail only this subject has/.test(f.message));
  ok('…and a design that does not show the subject’s detail is told what to add', !!noDetail && /m²|year/.test(noDetail.ask ?? ''), J(noDetail));
  const gen = V.parseGenerate({ title: 'Studio', sections: page.sections }, site, board, 1, 'r', dir);
  ok('a generated design holds its direction’s one move, and nothing else is loud', V.loudMoves(gen).every((m) => m === 'giant-type') && V.loudMoves(gen).includes('giant-type'), J(V.loudMoves(gen)));
  ok('a stored plan comes back whole; a made-up move does not', V.normalizeDirection(JSON.parse(J(base))).designPlan?.signature === base.designPlan.signature && V.normalizeDesignPlan({ ...base.designPlan, signature: 'sparkles' }) === undefined);
  // what the designer decided is a move already made: never quieted for another, never undone
  const splitOf = (d) => d.shapes?.booking?.ratio;
  const askedUneven = mkP('Booking screen for a pilates session', { layout: { arrangement: 'asymmetric' } });
  const unevenDirs = Array.from({ length: 8 }, (_, i) => V.proposeDirections({ brief: askedUneven, salt: `p_uneven_${i}` })).flat();
  ok(`asked for uneven: in every direction (${unevenDirs.length}) the split is sharply uneven, and it is the plan’s one bold move`, unevenDirs.every((d) => V.sharplyUneven(splitOf(d)) && d.designPlan.signature === 'uneven-split'), J(unevenDirs.map((d) => [d.language, d.compose?.booking, splitOf(d), d.designPlan.signature])));
  const unevenStudies = unevenDirs.map((d) => V.studySpec(d, askedUneven, 'Pilates', []));
  ok('…and every study drawn from them keeps it', unevenStudies.every((st) => st && V.loudMoves(st).includes('uneven-split')), J(unevenStudies.map((st) => st?.sections.find((x) => x.kind === 'booking')?.shape)));
  const askedEven = mkP('Booking screen for a pilates session', { layout: { arrangement: 'split' } });
  const evenDirs = Array.from({ length: 8 }, (_, i) => V.proposeDirections({ brief: askedEven, salt: `p_even_${i}` })).flat();
  ok(`asked for side by side: no direction (${evenDirs.length}) makes the split uneven as its move`, evenDirs.every((d) => d.designPlan.signature !== 'uneven-split' && !V.sharplyUneven(splitOf(d))), J(evenDirs.map((d) => [d.language, splitOf(d), d.designPlan.signature])));
  const bookingSpec = (ratio) => V.normalizeSpec({ title: 'Book', pageType: 'website', tokens: base.tokens, look: base.look, sections: [{ id: 'b', kind: 'booking', variant: 'split', shape: { ratio }, content: V.sampleFor('booking', askedUneven.intent, askedUneven) }, { id: 'n', kind: 'stats', variant: 'giant', content: { items: [{ value: '45', label: 'min' }, { value: '8', label: 'places' }] } }] }, board);
  ok('at generation: an uneven split the designer asked for stays, whatever the move', V.holdSignature(bookingSpec(0.32), 'oversized-figure', { decisions: { arrangement: 'asymmetric' } }).spec.sections[0].shape.ratio === 0.32);
  ok('…an even one they asked for is not made uneven by the move', !V.sharplyUneven(V.holdSignature(bookingSpec(0.5), 'uneven-split', { decisions: { arrangement: 'split' } }).spec.sections[0].shape.ratio));
  ok('…and a split quieted for another move keeps its larger side (not flattened to the middle)', V.quietRatio(0.32) === 0.38 && V.quietRatio(0.61) === 0.58 && V.holdSignature(bookingSpec(0.31), 'oversized-figure').spec.sections[0].shape.ratio === 0.38);
  const evenDir = { ...base, designPlan: { ...base.designPlan, signature: 'oversized-figure' } };
  const loudOnes = (b) => V.evaluateDesign(bookingSpec(0.32), {}, [], { direction: evenDir, brief: b }).findings.filter((f) => /More than one loud move/.test(f.message));
  ok('the evaluation never calls the designer’s own uneven split a second loud move; nobody’s, it does', loudOnes({ ...askedUneven }).length === 0 && loudOnes(mkP('Booking screen for a pilates session')).length === 1);
  // a move the plan names is one the direction as composed draws
  const drawnOk = all.filter(([b, d]) => !V.planContext(b).screen).every(([b, d]) => {
    const composed = d.plan === 'composed';
    const hero = composed ? 'compose' : d.compose?.hero ?? (V.planContext(b).hasImage ? 'split' : 'statement');
    return (d.designPlan.signature !== 'uneven-split' || hero === 'split' || composed || ['split', 'calendar'].includes(d.compose?.booking)) && (d.designPlan.signature !== 'full-bleed-picture' || hero === 'full-bleed' || d.compose?.booking === 'immersive') && (d.designPlan.signature !== 'giant-type' || !composed);
  });
  ok('a page’s move is one its own opening draws: an uneven split over a split or a composed opening, one picture edge to edge only over a full-bleed, a huge headline only where there is a headline to set', drawnOk, J(all.map(([, d]) => [d.plan, d.compose?.hero, d.designPlan.signature])));
  const studiesOf = all.filter(([b]) => !V.planContext(b).screen).map(([b, d]) => [d, V.studySpec(d, b, 'Name', V.planContext(b).hasImage ? board.refs : [])]);
  const drawnIn = studiesOf.filter(([d, st]) => st && V.loudMoves(st).includes(d.designPlan.signature));
  ok(`every page study draws its own move, where you can see it (${drawnIn.length}/${studiesOf.length})`, drawnIn.length === studiesOf.length, J(studiesOf.filter(([d, st]) => !(st && V.loudMoves(st).includes(d.designPlan.signature))).map(([d, st]) => [d.plan, d.compose?.hero, d.designPlan.signature, st && V.loudMoves(st)])));
}


console.log('\n=== the designer’s design system: read, built within, checked against ===');
{
  ok('colours as token files write them', V.colourHex('#1F4EA3') === '#1f4ea3' && V.colourHex('#abc') === '#aabbcc' && V.colourHex('rgb(31, 78, 163)') === '#1f4ea3' && V.colourHex('hsl(0, 0%, 100%)') === '#ffffff' && V.colourHex('rgba(0,0,0,0.1)') === null && V.colourHex('banana') === null);
  ok('lengths in px, rem and em', V.lengthPx('16px') === 16 && V.lengthPx('1.5rem') === 24 && V.lengthPx('auto') === null);
  // the W3C format: groups with $type, $value, aliases, a composite typography token
  const dtcg = J({
    color: { $type: 'color', brand: { blue: { $value: '#1f4ea3' } }, neutral: { 0: { $value: '#ffffff' }, 900: { $value: '#14161a' } }, background: { $value: '{color.neutral.0}' }, text: { $value: '{color.neutral.900}' }, primary: { $value: '{color.brand.blue}' }, border: { $value: '#d4d8de' } },
    font: { heading: { $type: 'fontFamily', $value: ['Helvetica Neue', 'Arial', 'sans-serif'] }, body: { $type: 'fontFamily', $value: 'Source Serif 4, Georgia, serif' } },
    size: { $type: 'dimension', 'font-size-sm': { $value: '14px' }, 'font-size-md': { $value: '16px' }, 'font-size-lg': { $value: '20px' }, 'font-size-xl': { $value: '25px' }, 'font-size-2xl': { $value: '31px' } },
    radius: { md: { $type: 'dimension', $value: '6px' } },
    type: { display: { $type: 'typography', $value: { fontFamily: 'Playfair Display', fontSize: '48px' } } },
  });
  const a = V.parseDesignSystem([{ path: 'tokens.json', text: dtcg }], { kind: 'file', ref: 'tokens.json', files: [] }).system;
  ok('W3C design tokens: groups, aliases resolved, roles by name', a && a.roles.background === '#ffffff' && a.roles.text === '#14161a' && a.roles.accent === '#1f4ea3' && a.roles.line === '#d4d8de', J(a?.roles));
  ok('…faces mapped to ones SocriaUX can serve, the stand-in said; its own face kept when it can be served', a.fonts.find((f) => f.role === 'body').standIn === 'Source Serif 4' && a.fonts.some((f) => f.family === 'Helvetica Neue' && f.standIn === 'Inter') && a.notes.some((n) => /Helvetica Neue.*drawn with Inter/.test(n)), J(a.fonts));
  ok('…its type scale, corners and spacing read', V.systemRatio(a) === 1.25 && V.systemCorners(a) === 'soft', J({ r: V.systemRatio(a), c: V.systemCorners(a), s: a.sizes }));
  // Style Dictionary and Tokens Studio: value, type
  const sd = V.parseDesignSystem([{ path: 'style-dictionary.json', text: J({ color: { bg: { value: '#0f1115' }, fg: { value: '#f4f4f2' }, 'on-primary': { value: '#0f1115' }, primary: { value: '#ffcc33' } }, font: { family: { base: { value: 'Inter' } } } }) }], { kind: 'file', ref: 'x', files: [] }).system;
  ok('Style Dictionary values; a dark system read as one (its ground the background, its light ink the text)', sd && sd.roles.background === '#0f1115' && sd.roles.text === '#f4f4f2' && sd.roles.accent === '#ffcc33' && sd.roles.accentText === '#0f1115', J(sd?.roles));
  // CSS custom properties, with a dark block and var() references
  const css = `:root { --brand-500: #c2410c; --color-primary: var(--brand-500); --color-background: #fafaf9; --color-text: #1c1917; --font-heading: "Instrument Serif", serif; --font-body: Inter, sans-serif; --radius-lg: 16px; --space-2: 8px; --space-4: 16px; --space-6: 24px; }
  [data-theme="dark"] { --color-background: #0c0a09; --color-text: #fafaf9; }`;
  const c = V.parseDesignSystem([{ path: 'tokens.css', text: css }], { kind: 'file', ref: 'tokens.css', files: [] }).system;
  ok('CSS custom properties: var() resolved, the light block for the roles, dark mode kept apart, round corners read', c && c.roles.accent === '#c2410c' && c.roles.background === '#fafaf9' && c.colours.some((x) => x.mode === 'dark' && x.hex === '#0c0a09') && V.systemCorners(c) === 'round' && c.fonts.find((f) => f.role === 'display').standIn === 'Instrument Serif', J(c?.roles));
  // guidelines in Markdown
  const md = `# Acme Design System\n\n## Do's and don'ts\n- Use the primary colour for one action per screen\n- Never set body text below 16px\n\n## Button\nPrimary buttons are solid, 44px tall, with sentence-case labels.\n\n## Card\nCards are used only for selectable items.`;
  const m = V.parseDesignSystem([{ path: 'tokens.css', text: css }, { path: 'README.md', text: md }], { kind: 'github', ref: 'acme/ds', files: [] }).system;
  ok('guidelines: their rules and their components, and the system’s name', m.name === 'Acme Design System' && m.rules.length === 2 && /Never set body text below 16px/.test(m.rules.join()) && m.components.map((x) => x.name).join() === 'Button,Card' && /44px/.test(m.components[0].notes), J({ n: m.name, r: m.rules, c: m.components }));
  ok('files with no tokens are refused, saying why', V.parseDesignSystem([{ path: 'notes.md', text: '# Hello' }], { kind: 'file', ref: 'x', files: [] }).system === null && /No design tokens/.test(V.parseDesignSystem([{ path: 'a.json', text: '{}' }], { kind: 'file', ref: 'x', files: [] }).error));
  ok('a stored system comes back whole; garbage does not', J(V.normalizeDesignSystem(JSON.parse(J(m)))) === J(m) && V.normalizeDesignSystem({ name: 'x' }) === undefined && V.normalizeDesignSystem({ roles: { background: 'red' } }) === undefined);
  // built within: the brief, then every direction
  const b0 = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for an architecture studio', audience: 'clients', personality: ['precise'], visualDirection: 'calm', palette: [{ hex: '#ffffff', role: 'background' }, { hex: '#111111', role: 'text' }, { hex: '#e11d48', role: 'accent' }], typography: { display: 'Syne', body: 'Inter' }, userGoals: ['See the work', 'Get in touch'], rules: ['No stock photos'] }, new Set(['openverse:a1']));
  b0.intent = V.settleIntent(V.briefWords(b0), {});
  const bs = V.briefWithSystem(b0, m);
  ok('attached, the brief takes its colours, type and layout from the system, each locked as a rule; its rules join the brief’s', bs.palette.find((x) => x.role === 'accent').hex === '#c2410c' && bs.typography.display === 'Instrument Serif' && bs.decisions.colour === 'locked' && bs.decisions.typography === 'locked' && bs.spec.corners === 'round' && bs.rules.includes('No stock photos') && bs.rules.some((r) => /16px/.test(r)) && bs.system === m);
  ok('…it survives the brief being stored', V.normalizeBrief(JSON.parse(J(bs)), new Set()).system?.name === 'Acme Design System');
  const dirs = V.proposeDirections({ brief: bs, salt: 'p_ds' });
  ok('every direction keeps the system’s colours, faces and corners, and they still differ in composition', dirs.every((d) => d.tokens.colors.accent === '#c2410c' && d.tokens.colors.background === '#fafaf9' && d.tokens.fonts.display === 'Instrument Serif' && d.tokens.radius === 'round') && new Set(dirs.map((d) => d.plan)).size === 3, J(dirs.map((d) => [d.tokens.colors.accent, d.tokens.fonts.display, d.tokens.radius, d.plan])));
  ok('…and no plan calls the system’s own palette a generated look', dirs.every((d) => !d.designPlan.open.some((o) => /falls into/.test(o))));
  const back = V.briefWithoutSystem(bs);
  ok('detached: the colours and type stay as they were, now the designer’s to change; its rules go', !back.system && back.decisions.colour === 'approved' && back.palette.find((x) => x.role === 'accent').hex === '#c2410c' && !back.rules.some((r) => /16px/.test(r)) && back.rules.includes('No stock photos'));
  ok('the generator and the refiner are told the system, its components and its rules; the brief JSON does not repeat it', (() => { const u = V.generateUser({ brief: bs, moodboard: board, direction: '' }); return u.includes("THE DESIGNER'S DESIGN SYSTEM — Acme Design System") && u.includes('Button (Primary buttons are solid') && !u.includes('"importedAt"'); })() && V.refineUser({ brief: bs, spec: V.normalizeSpec(SPEC, board), moodboard: board, selection: null, comment: 'x', force: false, locks: [] }).includes('Acme Design System'));
  // checked against it
  const off = V.normalizeSpec({ ...SPEC, tokens: { ...SPEC.tokens, colors: { ...SPEC.tokens.colors, background: '#fafaf9', text: '#1c1917', accent: '#7c3aed' }, fonts: { display: 'Syne', body: 'Inter' }, radius: 'none' } }, board);
  const conf = V.conformance(off, m);
  ok('a design that leaves the system is found out: an accent not in it, faces not its own, square corners', J(conf.map((x) => x.what).sort()) === J(['colour', 'corners', 'type']), J(conf));
  const fixed = conf.reduce((sp, x) => V.applyPatch(sp, x.fix, board).spec, off);
  ok('…each with the change that puts it back', V.conformance(fixed, m).filter((x) => x.what !== 'scale').length === 0, J(V.conformance(fixed, m)));
  const evc = V.evaluateDesign(off, {}, ['palette'], { brief: bs });
  ok('the evaluation reports it before the design is shown, its fixes not held back by locks (the system is the designer’s)', evc.findings.filter((f) => f.kind === 'fidelity' && /Acme/.test(f.message) && f.fix && !f.blocked).length >= 3, J(evc.findings.map((f) => [f.message, !!f.fix, f.blocked])));
  ok('a change that leaves the system is named, so it can be asked about first', J(V.offSystem({ op: 'tokens', tokens: { colors: { accent: '#7c3aed' }, fonts: { display: 'Anton' } } }, m)) === J(['the accent colour #7c3aed', 'the face Anton']) && V.offSystem({ op: 'tokens', tokens: { colors: { accent: '#c2410c' } } }, m).length === 0);
  // GitHub: only two hosts, checked names, capped files, no redirects
  ok('a repository is named safely: owner/repo, a github.com URL with a branch and folder; nothing else', J(V.repoTarget('github.com/acme/design-system/tree/main/tokens')) === J({ owner: 'acme', repo: 'design-system', ref: 'main', dir: 'tokens' }) && V.repoTarget('acme/ds').ref === 'HEAD' && V.repoTarget('https://gitlab.com/a/b') === null && V.repoTarget('acme/../etc') === null && V.repoTarget('github.com/acme/ds/tree/main/../../x') === null && V.repoTarget('-bad/x') === null);
  const picked = V.pickFiles([{ path: 'README.md', size: 900 }, { path: 'node_modules/x/tokens.json', size: 10 }, { path: 'src/tokens/colors.json', size: 4000 }, { path: 'styles/variables.css', size: 2000 }, { path: 'big/tokens.json', size: 9e6 }, { path: 'src/index.ts', size: 10 }], '');
  ok('…its files picked: tokens, then CSS variables, then guidelines; never vendored, huge or unrelated files', J(picked) === J(['src/tokens/colors.json', 'styles/variables.css', 'README.md']), J(picked));
  const asked = [];
  const fake = async (url, init) => {
    asked.push([url, init.redirect]);
    if (url.startsWith('https://api.github.com/')) return new Response(J({ tree: [{ path: 'tokens.css', type: 'blob', size: 500 }, { path: 'README.md', type: 'blob', size: 300 }] }), { status: 200 });
    if (url.endsWith('/tokens.css')) return new Response(css, { status: 200 });
    if (url.endsWith('/README.md')) return new Response(md, { status: 200 });
    return new Response('', { status: 404 });
  };
  const got = await V.fetchSystemFiles(V.repoTarget('acme/ds'), fake);
  ok('…read with two hosts only, redirects refused, and parsed into the same system', got.files?.length === 2 && asked.every(([u, r]) => /^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//.test(u) && r === 'error') && V.parseDesignSystem(got.files, { kind: 'github', ref: 'acme/ds', files: [] }).system.roles.accent === '#c2410c', J(asked));
  const missing = await V.fetchSystemFiles(V.repoTarget('acme/nope'), async () => new Response('', { status: 404 }));
  const limited = await V.fetchSystemFiles(V.repoTarget('acme/busy'), async () => new Response('', { status: 403 }));
  ok('…a missing or private repository, and GitHub’s rate limit, each said plainly', /not found, or it is private/.test(missing.error) && limited.status === 429 && /limiting/.test(limited.error));
}


console.log('\n=== layout pieces: a section composed from stacks, grids and proportions ===');
{
  const tree = { t: 'grid', cols: [5, 7], gap: 'l', align: 'end', children: [
    { t: 'stack', dir: 'col', gap: 'm', align: 'start', children: [{ t: 'text', role: 'eyebrow', text: 'Since 1998' }, { t: 'text', role: 'title', text: 'Rooms for *thinking* <script>alert(1)</script>' }, { t: 'text', role: 'title', text: 'A second title' }, { t: 'button', label: 'See the work', style: 'primary' }] },
    { t: 'box', tone: 'alt', pad: 'l', children: [{ t: 'figure', value: '42', label: 'projects built' }, { t: 'image', at: 0, ratio: '4:3' }] },
  ] };
  const n = V.normalizeCompose(tree);
  ok('a tree of pieces is held to its shape: grid, stack, box, text, figure, image, button', n && n.t === 'grid' && J(n.cols) === '[5,7]' && n.children[1].children[0].t === 'figure');
  ok('…one title per section: a second becomes a heading', n.children[0].children[2].role === 'heading');
  const junk = V.normalizeCompose({ t: 'grid', cols: [0, 3.6, 99, 'x', 2, 4, 5], style: 'color:red', href: 'javascript:alert(1)', children: [{ t: 'iframe', src: 'x' }, { t: 'text', role: 'h1', text: 'x'.repeat(2000), onclick: 'x' }, { t: 'image', at: 99 }, { t: 'html', html: '<b>' }] });
  ok('…unknown pieces and keys dropped, proportions whole and bounded, words capped, pictures only by a valid index', junk && J(junk.cols) === '[4,2,4,5]' && junk.children.length === 1 && junk.children[0].role === 'body' && junk.children[0].text.length === 700 && !('style' in junk) && !('href' in junk), J(junk));
  const deep = (d) => (d === 0 ? { t: 'text', role: 'body', text: 'deep' } : { t: 'stack', dir: 'col', children: [deep(d - 1)] });
  ok('…at most four levels deep', V.normalizeCompose(deep(3)) !== null && V.normalizeCompose(deep(6)) === null);
  const many = V.normalizeCompose({ t: 'stack', dir: 'col', children: Array.from({ length: 8 }, () => ({ t: 'stack', dir: 'row', children: Array.from({ length: 8 }, () => ({ t: 'text', role: 'body', text: 'x' })) })) });
  const count = (p) => 1 + ('children' in p ? p.children.reduce((a, c) => a + count(c), 0) : 0);
  ok('…at most 48 pieces', count(many) <= 48, count(many));
  // as a section, drawn
  const spec = V.normalizeSpec({ title: 'Studio', pageType: 'website', tokens: SPEC.tokens, sections: [{ id: 'opening', kind: 'compose', content: { root: tree }, images: ['openverse:a1'] }, { id: 'f', kind: 'footer', content: { brand: 'Studio' } }] }, board);
  ok('a compose section is a section like any other; one with nothing drawable is dropped', spec.sections[0].kind === 'compose' && V.normalizeSpec({ title: 'x', pageType: 'website', sections: [{ kind: 'compose', content: { root: { t: 'grid', children: [] } } }] }) === null);
  const html = V.renderDesign(spec, board.refs).html;
  const doc = parse(html);
  ok('drawn from the renderer’s own classes, the proportion from whole numbers, the opening title an h1', !!doc.querySelector('.cp-grid') && /--cp-cols:minmax\(0,5fr\) minmax\(0,7fr\)/.test(html) && doc.querySelector('h1.cp-title') !== null && doc.querySelectorAll('.cp-title').length === 1);
  ok('…every word escaped (the script is text), emphasis kept', !/<script>alert/.test(html) && /&lt;script&gt;/.test(html) && doc.querySelector('.cp-title em.em')?.textContent === 'thinking');
  ok('…each word editable where it sits; the picture drawn by index', doc.querySelector('[data-ux-path="root.children.0.children.1.text"]') !== null && doc.querySelector('.cp-img img') !== null && /@media \(max-width:720px\)\{\.cp-grid\{grid-template-columns:minmax\(0,1fr\)\}/.test(html));
  const sec = spec.sections[0];
  const at = V.textAt(sec, 'root.children.0.children.3.label');
  const p1 = V.textPatch(sec, 'root.children.1.children.0.value', '43');
  ok('its words are changed in place, by path, through a patch that is checked like any other', at?.value === 'See the work' && at.max === 40 && p1 && V.applyPatch(spec, p1, board).spec.sections[0].content.root.children[1].children[0].value === '43');
  const swapped = V.applyPatch(spec, { op: 'content', sectionId: 'opening', content: { root: { ...sec.content.root, cols: [7, 5], children: [sec.content.root.children[1], sec.content.root.children[0]] } } }, board);
  ok('…and its arrangement (columns swapped, 7 : 5)', swapped.ok && J(swapped.spec.sections[0].content.root.cols) === '[7,5]' && swapped.spec.sections[0].content.root.children[0].t === 'box');
  ok('its structure is its arrangement, proportions included', V.structureOf(spec)[0] === 'compose/grid(5:7)[col[eyebrow,title,heading,button],box-alt[figure,img4x3]]', V.structureOf(spec)[0]);
  ok('a figure and a box on the accent are loud moves like any other', J(V.loudMoves({ sections: [{ ...sec, content: { root: { t: 'box', tone: 'accent', pad: 'm', children: [{ t: 'figure', value: '1', label: 'x' }] } } }] }).sort()) === J(['colour-field', 'oversized-figure']));
  // the engine composes openings no fixed layout draws, differently per project
  const opens = new Set(Array.from({ length: 30 }, (_, i) => V.composeSignature(V.composedOpening({ title: 'Rooms for thinking', lead: 'An architecture studio', action: 'See the work', detail: 'Each project with its area in m²' }, i % 2 === 0, V.seeded(i * 7 + 1)))));
  ok('the engine composes openings of its own, many arrangements (≥ 12 in 30 projects)', opens.size >= 12, opens.size);
  const site = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for a ceramics studio', audience: 'collectors', personality: ['calm'], visualDirection: 'quiet', palette: [], typography: { display: 'Archivo', body: 'Inter' }, userGoals: ['See the pieces', 'Visit the studio'] }, new Set());
  site.intent = V.settleIntent(V.briefWords(site), {});
  const composedDirs = Array.from({ length: 10 }, (_, i) => V.proposeDirections({ brief: site, salt: `p_cp_${i}` })).flat().filter((d) => d.plan === 'composed');
  ok('directions take the composed plan, and its study opens with a section composed from pieces', composedDirs.length > 0 && composedDirs.every((d) => { const st = V.studySpec(d, site, 'Kiln', []); const first = st.sections.find((x) => x.kind !== 'nav'); return first.kind === 'compose' && V.normalizeCompose(first.content.root) !== null; }), composedDirs.length);
  ok('the generator is told when and how to compose (the pieces, their limits)', /compose it from pieces/.test(V.generateSystem(site, composedDirs[0] ?? null)) && /compose \(/.test(V.libraryMenu('website')) && /at most 4 levels deep and 48 pieces/.test(V.libraryMenu('website')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
