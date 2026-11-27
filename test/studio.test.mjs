// SocriaUX studio — one conversation in front of six capabilities, led by a creative director. Checked here by what it
// does, with no model and no network: intent recognition, the facts an opening sentence states, how much is asked (a
// detailed brief made at once; a vague one asked what it cannot be made without, then at most a few creative questions
// generated for it — a mood, colours, lettering — never all three visual ones, never what the words already say),
// replies read in the person's own words (answers, a tap on an option, a colour or a typeface named, commands, changes of
// mind, links), gaps left as marked placeholders when the person says to just make it, the work made as soon as the
// brief is enough (no direction to choose first), websites read for reference through the guarded reader and drawn
// inert, and how every decision reaches its engine.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from './.tmp/studio-under-test.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'dsi');
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 700))));
const J = JSON.stringify;
const sec = (t) => console.log(`\n=== ${t} ===`);
const NOW = 1_800_000_000_000;
const start = (mode, prompt, extra = {}) => S.seedFromWords(S.emptyStudio(mode, prompt, { now: NOW, ...extra }), NOW);

// ── intent recognition ──
sec('intent: each mode from words, close calls asked, attachments');
const cases = [
  ['A poster for “Field Lines”, a creative coding night', 'graphic'],
  ['An Instagram carousel “Five habits of calm teams”', 'graphic'],
  ['A website for a yoga studio with bookings', 'website'],
  ['A landing page for our app launch with a waiting list', 'website'],
  ['A logo for “Halden”, a small coffee roastery', 'logo'],
  ['A monogram for an architecture practice', 'logo'],
  ['Import our design tokens and brand guidelines', 'system'],
  ['A launch campaign: two posters, three Instagram posts and a website', 'board'],
  ['Critique this landing page — what is not working?', 'critique'],
];
for (const [t, m] of cases) {
  const r = S.recognizeIntent(t);
  ok(`“${t.slice(0, 40)}” reads as ${m}`, r.mode === m, J({ mode: r.mode, ranked: r.ranked.slice(0, 3) }));
}
const vague = S.recognizeIntent('something for my bakery');
ok('words that settle nothing are asked about, not guessed', vague.mode === null && vague.confidence < 0.5, J(vague.ranked.slice(0, 3)));
ok('a logo on a poster is a poster', S.recognizeIntent('A poster for our open day with our logo').mode === 'graphic');
ok('a tokens file attached reads as a design system', S.recognizeIntent('here you go', [{ kind: 'tokens' }]).mode === 'system');
ok('a page attached with "review" reads as a critique', S.recognizeIntent('Can you review this?', [{ kind: 'page' }]).mode === 'critique');
ok('a picture attached alone is a reference, not a critique', S.recognizeIntent('A poster like this', [{ kind: 'image' }]).mode === 'graphic');
ok('a Figma link reads as a design system', S.recognizeIntent('https://www.figma.com/design/abc123/Aster').mode === 'system');
ok('attachment kinds are read from names', S.attachmentKindOf({ name: 'tokens.json' }) === 'tokens' && S.attachmentKindOf({ name: 'brand.pdf' }) === 'pdf' && S.attachmentKindOf({ name: 'home.html' }) === 'page' && S.attachmentKindOf({ name: 'a.PNG', type: 'image/png' }) === 'image' && S.attachmentKindOf({ name: 'x.woff2' }) === 'font');
ok('every reading ranks all six modes with reasons', S.recognizeIntent(cases[0][0]).ranked.length === 6 && S.recognizeIntent(cases[0][0]).ranked[0].why.length > 0);


// ── facts ──
sec('facts: what the opening sentence says, read by the engines’ own readers');
const f1 = S.readFacts('A bold, experimental poster for “Field Lines”, “Code that draws”, 12–30 June 2027, no gradients');
ok('quoted words, exactly, in order', f1.headline === 'Field Lines' && f1.subhead === 'Code that draws', J(f1));
ok('the kind named outright (and none when none is named)', f1.kind === 'poster' && S.readFacts('something about trees').kind === undefined);
ok('temperament words', f1.mood.includes('bold') && f1.mood.includes('experimental'));
ok('dates', f1.meta.some((m) => /June/.test(m)));
ok('what to avoid', f1.avoid.some((a) => /gradient/.test(a)), J(f1.avoid));
const f2 = S.readFacts('A launch campaign for “Night Market”: two posters, three Instagram posts and a website');
ok('materials named with their counts (no defaults invented)', f2.materials.find((m) => m.kind === 'poster')?.count === 2 && f2.materials.find((m) => m.kind === 'social')?.count === 3 && f2.materials.some((m) => m.kind === 'website') && S.readFacts('A poster').materials.length <= 1, J(f2.materials));
ok('a style named by name', S.readFacts('A Swiss style poster for a lecture').styles.length > 0);
ok('a colour named, as hex', S.readFacts('a warm orange poster').colours.length > 0);
ok('a logo’s name and category', S.readFacts('A wordmark for “Halden”').brand === 'Halden' && S.readFacts('A wordmark for “Halden”').logoCategory === 'wordmark');
ok('subjects from the lexicon', S.readFacts('a logo for a coffee roastery').domains.includes('food'), J(S.readFacts('a logo for a coffee roastery').domains));


// ── the record ──
sec('the record: normalised, bounded, kept on the project');
const raw = { mode: 'graphic', prompt: 'x'.repeat(5000), answers: { 'g.kind': { values: ['poster'], source: 'person', at: 1 }, __proto__: { values: ['bad'] }, 'bad key!': { values: ['x'] } }, transcript: [{ id: 'm1', from: 'person', text: 'hi', at: 1, kind: 'prompt' }, { nope: 1 }], attachments: [{ id: 'a1', name: 'p.png', kind: 'image', upload: 'up_1' }, { id: 'a2', kind: 'virus' }], status: 'started', systemId: 'dsys_abcd1234', createdAt: 5, modeBy: 'unsure', pending: 'words', asked: ['words', 'feel', 'BAD TOPIC'], round: 2 };
const n1 = S.normalizeStudio(raw);
ok('held to its shape: prompt bounded, bad keys and entries dropped', n1 && n1.prompt.length === 2000 && Object.keys(n1.answers).join() === 'g.kind' && n1.transcript.length === 1 && n1.attachments.length === 1 && n1.status === 'started' && n1.systemId === 'dsys_abcd1234', J(n1));
ok('what the conversation is waiting on, what it has asked and how many times other looks were asked for survive a reload', n1.modeBy === 'unsure' && n1.pending === 'words' && J(n1.asked) === J(['words', 'feel']) && n1.round === 2, J({ modeBy: n1.modeBy, pending: n1.pending, asked: n1.asked, round: n1.round }));
ok('not a record: undefined', S.normalizeStudio({ mode: 'poster' }) === undefined && S.normalizeStudio(null) === undefined);
const oldRefs = S.normalizeStudio({ ...raw, research: { at: 1, searches: [{ query: 'q', provider: 'openverse', found: 1 }] }, references: [{ id: 'openverse:a1', provider: 'openverse', title: 'Poster', thumb: 'https://api.openverse.org/v1/images/a1/thumb/', sourceUrl: 'https://www.flickr.com/x', state: 'liked', at: 1 }] });
ok('a record from before keeps nothing of the old image search (its references and its log are dropped on read)', !oldRefs.references?.length && !('research' in oldRefs), J({ refs: oldRefs.references, research: oldRefs.research }));
const proj = { ...S.makeProject('create', 'Untitled graphic', NOW), studio: start('graphic', 'A poster for “Field Lines”') };
const back = S.normalizeProject(JSON.parse(J(proj)));
ok('kept on the project through storage (a reload, another device)', back.studio && back.studio.mode === 'graphic' && back.studio.answers['g.words']?.fields?.headline === 'Field Lines');
ok('the summary says it was begun in the studio', S.summarize(back).studio?.mode === 'graphic' && S.summarize(back).studio?.status === 'discovering');
ok('a project without one is unchanged', S.normalizeProject(JSON.parse(J(S.makeProject('create', 'x', NOW)))).studio === undefined);

// every line SocriaUX says in these conversations, checked at the end for its voice
const SAID = [];
const keep = (st) => {
  for (const m of st.transcript) if (m.from === 'socria') SAID.push(m.text);
  return st;
};
const open = (mode, prompt, extra = {}, env = {}) => keep(S.opening(S.emptyStudio(mode, prompt, { now: NOW, ...extra }), env, NOW));
const reply = (st, text, env = {}, opts = {}) => {
  const t = S.respond(st, text, env, { now: NOW + st.transcript.length, ...opts });
  keep(t.st);
  return t;
};
const lastSaid = (st) => [...st.transcript].reverse().find((m) => m.from === 'socria');
const questions = (st) => st.transcript.filter((m) => m.from === 'socria' && m.kind === 'question');

// ── how much to ask: a detailed brief is made at once ──
sec('adaptive: a detailed brief needs no questions; a vague one gets a few, one at a time');
const detailed = open('graphic', 'A bold, experimental poster for “Field Lines”, “Code that draws”, 12–30 June 2027, Lisbon, in the style of a Swiss poster');
ok('a detailed brief: nothing is asked, the work is made', questions(detailed).length === 0 && S.nextMove(detailed).kind === 'create', J(detailed.transcript));
ok('…said in one turn: what was understood, then what happens now (marked as making, so a reload picks it up)', detailed.transcript.length === 1 && lastSaid(detailed).stage === 'making' && /Bold and experimental poster for “Field Lines”/i.test(lastSaid(detailed).text) && /That’s enough to begin/.test(lastSaid(detailed).text), lastSaid(detailed).text);
ok('…with no direction to choose first: the work itself is next', !/three directions|choose one|pick one/i.test(lastSaid(detailed).text), lastSaid(detailed).text);
ok('…what the words said is recorded as said, never asked', detailed.answers['g.kind']?.source === 'words' && detailed.answers['g.words']?.fields?.headline === 'Field Lines' && detailed.answers['g.words']?.fields?.subhead === 'Code that draws' && detailed.answers['g.personality']?.values.includes('bold'), J(detailed.answers));
ok('…and the work begins with it: a graphic project, composed the moment it opens', S.startProject({ ...S.makeProject('create', 'Untitled graphic', NOW), medium: 'graphic' }, detailed, { now: NOW }).ok);

const logoFull = open('logo', 'A logo for “Halden”, a small coffee roastery, warm and crafted');
ok('a logo with its name, its subject and its feel: made at once', questions(logoFull).length === 0 && S.nextMove(logoFull).kind === 'create' && /Constructing “Halden”/.test(lastSaid(logoFull).text), J(logoFull.transcript.map((m) => m.text)));
const siteFull = open('website', 'A website for “Stillwater Yoga” with bookings, calm and warm');
ok('a website with its name, its purpose and its feel: made at once, in a look drawn from the words (no looks to choose from)', questions(siteFull).length === 0 && S.nextMove(siteFull).kind === 'create' && lastSaid(siteFull).stage === 'making' && S.readyToMake(siteFull), J(siteFull.transcript.map((m) => m.text)));


// commands understood in the person's words
const fresh = start('graphic', 'A poster for “Field Lines”');
ok('commands in the person’s words: make it, surprise me, skip, something different, show me some ideas', S.hear(fresh, 'Go ahead').kind === 'make' && S.hear(fresh, 'Surprise me!').kind === 'surprise' && S.hear(fresh, 'not sure').kind === 'skip' && S.hear(fresh, 'something completely different').kind === 'different' && S.hear(fresh, 'Show me others').kind === 'different' && S.hear(fresh, 'Show me some directions').kind === 'looks' && S.hear(fresh, 'a poster about trees').kind === 'words');
ok('“actually, a website instead” changes the kind', S.hear(fresh, 'Actually I need a website instead').kind === 'switch' && S.hear(fresh, 'Actually I need a website instead').mode === 'website');
let t = reply(open('graphic', 'A poster for “Field Lines”, warm and quiet'), 'Actually, make it a website instead');
ok('…and the turn hands the switch to the conversation', t.switchTo === 'website');
const switched = S.switchKind(S.respond(open('graphic', 'A poster for “Field Lines”'), 'warm and quiet', {}, { now: NOW + 1 }).st, 'website', {}, NOW + 2);
ok('switching keeps what the person said (the feel) and asks only what a website still needs', switched.mode === 'website' && switched.answers['w.personality']?.values.includes('warm') && switched.transcript.at(-1).from === 'socria' && /A website, then/.test(switched.transcript.at(-1).text), J({ a: switched.answers, said: switched.transcript.at(-1).text }));

// ── a website: made at once when the brief is enough, in a look drawn from the words ──
sec('a website: made from the words and answers, its look drawn by the engine (never a line-up to choose from)');
let w = siteFull;
ok('name, purpose and what it must do, from the words', w.answers['w.words']?.fields?.brand === 'Stillwater Yoga' || w.answers['w.words']?.fields?.headline === 'Stillwater Yoga', J(w.answers['w.words']));
ok('…purpose bookings, a booking calendar and a contact form', w.answers['w.purpose']?.values[0] === 'bookings' && w.answers['w.functions']?.values.includes('booking'), J({ p: w.answers['w.purpose'], f: w.answers['w.functions'] }));
const systems = S.websiteSystems(w);
ok('the board engine draws the look from these words (the page is made in the first it proposes)', systems.length === 3 && systems.every((s) => s.art) && S.systemChosen(systems, undefined) === systems[0], J(systems.map((s) => s.direction.name)));
const mixed = S.systemChosen(systems, 'mix-0-2');
ok('two systems can still be made one: the colours of one, the type and structure of the other', mixed.tokens.colors.accent === systems[0].tokens.colors.accent && mixed.tokens.fonts.display === systems[2].tokens.fonts.display && /×/.test(mixed.direction.name));
const site = S.startWebsite(w, systems[0], { now: NOW });
const spec = site.ok ? site.project.specs[0] : null;
ok('a whole website project, its direction approved, a first design made', site.ok && site.project.brief.approved && site.project.direction.approved && spec && spec.sections.length >= 4, site.ok ? '' : site.error);
ok('…with a working booking calendar (what the words asked for)', spec && spec.sections.some((s) => s.kind === 'booking' && s.content.days?.length >= 5), J(spec?.sections.map((s) => s.kind)));
const wc = open('website', 'A website for “Stillwater Yoga” where people can book classes and get in touch');
const siteC = S.startWebsite(wc, S.websiteSystems(wc)[0], { now: NOW });
ok('…and a contact form when the words ask for one (the interface’s own labels)', siteC.ok && siteC.project.specs[0].sections.some((s) => s.kind === 'form' && s.content.fields.some((f) => f.type === 'email')), J(siteC.ok && siteC.project.specs[0].sections.map((s) => s.kind)));
ok('…the person’s words exactly, nothing invented', spec && spec.sections.find((s) => s.kind === 'hero')?.content.title === 'Stillwater Yoga');
ok('…and it renders', site.ok && S.renderDesign(spec, []).html.includes('Stillwater Yoga'));
ok('…the conversation goes with it, marked started', site.ok && site.project.studio?.status === 'started' && site.project.studio.transcript.length > 0);
let wn = open('website', 'a website for my pottery classes');
ok('a website without its name: what it is called is asked first', wn.pending === 'name', wn.pending);
t = reply(wn, 'Make it now');
ok('…“make it now”: the name left as a marked gap, and the page made', t.move.kind === 'create' && /^\[.+\]$/.test(t.st.answers['w.words']?.fields?.brand ?? ''), J(t.st.answers['w.words']));

// ── a board, a critique, a design system ──
sec('a board, a critique and an import: only what each cannot be made without');
let b = open('board', 'A launch campaign for “Night Market Lisbon”: two posters, three Instagram posts and a website');
ok('materials counted from the words; the objective read (a launch)', b.answers['b.materials']?.numbers?.poster === 2 && b.answers['b.materials']?.numbers?.social === 3 && b.answers['b.materials']?.numbers?.website === 1 && b.answers['b.objective']?.values[0] === 'launch', J(b.answers));
t = reply(b, 'skip');
t = reply(t.st, 'skip');
const bs = S.startProject({ ...S.makeProject('create', 'Untitled board', NOW), medium: 'board' }, t.st, { now: NOW });
ok('a board project ready to make: brief, materials, the request', t.move.kind === 'create' && bs.ok && bs.project.board.brief.materials.length === 3 && bs.project.board.brief.content.headline === 'Night Market Lisbon', J(bs.ok && bs.project.board.brief));
let bm = open('board', 'A campaign for “Harbour Week”');
ok('a campaign without its pieces: what it should include is asked, with examples', bm.pending === 'materials' && S.questionFor(bm, 'materials').suggestions.length > 0);
t = reply(bm, 'four posters and a website');
ok('…answered in the person’s words, counted', t.st.answers['b.materials']?.numbers?.poster === 4 && t.st.answers['b.materials']?.numbers?.website === 1, J(t.st.answers['b.materials']));

let c = open('critique', 'Critique this landing page');
ok('a critique without its design: the design is asked for', c.pending === 'file');
ok('…and “make it now” cannot do without it', reply(c, 'make it now').move.kind === 'ask');
const cAtt = open('critique', 'Critique this', { attachments: [{ id: 'f1', name: 'home.png', kind: 'image' }] });
ok('with its design attached: opened at once, no creative questions', S.nextMove(cAtt).kind === 'create' && cAtt.answers['c.file']?.values[0] === 'f1' && !cAtt.discovery);
const sys = open('system', 'Import this', { attachments: [{ id: 'a1', name: 'tokens.json', kind: 'tokens' }] });
ok('a tokens file attached: the source and the files are settled, nothing asked', sys.answers['s.source']?.values[0] === 'json' && sys.answers['s.input']?.values[0] === 'a1' && S.nextMove(sys).kind === 'create', J(sys.answers));
ok('the import is asked for in the wizard’s own terms', S.importAskOf(sys).kind === 'json');
const web = start('system', 'Take it from https://larkfield.example');
ok('a website address: the website source and its address', web.answers['s.source']?.values[0] === 'website' && web.answers['s.input']?.fields?.url === 'https://larkfield.example');

// ── a logo: what it stands for, asked only when not said; then its lettering ──
sec('a logo: its name exactly; what it stands for asked only when the words do not say; its lettering in real faces');
t = { st: open('logo', 'A logo for “Halden”: we roast coffee in small batches, by hand') };
const lw = S.logoWordsOf(t.st);
ok('the logo brief carries the name and what it stands for, in words the logo engine reads', /“Halden”/.test(lw.words) && /roast/.test(lw.words), lw.words);
const lb = S.logoBriefOfGraphic(S.logoBriefOf(t.st));
ok('…and the logo engine reads them: the name exactly', lb.name === 'Halden', J({ name: lb.name }));
const concepts = S.exploreLogo(lb, { count: 3, seed: 1 });
ok('concepts are constructed for it (no library)', concepts.length >= 3);

// ── pictures the person brings ──
sec('pictures: placed in the design, or used for their look only — asked only when it matters');
let pics = open('graphic', 'A poster for “Open Day”', { attachments: [{ id: 'at1', name: 'pour.jpg', kind: 'image', upload: 'up_1', width: 1200, height: 900, swatches: ['#f4efe6', '#2b1d14', '#c2410c'] }] });
// treatments of the person's own pictures (kept from the engine)
const tpics = S.respond(pics, 'use #f4efe6, #1b1b1b and #c2410c', {}, { now: NOW + 5 }).st;
const tp = { ...S.prefsOf(tpics), treatment: 'duotone' };
const fx = S.treatmentEffects(tp.treatment, tp.palette);
ok('three colours said become the palette, and a duotone is the engine’s, in the person’s ink and accent', tp.palette?.accent === '#c2410c' && fx.length === 1 && fx[0].kind === 'duotone' && fx[0].color === '#1b1b1b' && fx[0].color2 === '#c2410c', J({ pal: tp.palette, fx }));
const tdoc = { schema: 1, id: 'd', name: 'd', tokens: { colors: { background: '#fff', surface: '#fff', text: '#111', muted: '#555', accent: '#c2410c', accentText: '#fff', line: '#ddd' }, fonts: { display: 'Inter', body: 'Inter' } }, assets: [{ id: 'a1', kind: 'image', src: 'upload:up_1', width: 10, height: 10, name: 'mine', source: 'upload' }, { id: 'a2', kind: 'image', src: 'https://x/y.jpg', width: 10, height: 10, name: 'library', source: 'library' }], artboards: [{ id: 'b', name: 'b', width: 100, height: 100, unit: 'px', dpi: 72, format: 'custom', background: '#fff', bleed: 0, safe: 0, children: [{ id: 'i1', type: 'image', asset: 'a1', fit: 'cover', x: 0, y: 0, w: 50, h: 50, rotation: 0, opacity: 1 }, { id: 'i3', type: 'image', asset: 'a2', fit: 'cover', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1 }] }], revision: 0, updatedAt: 0 };
const treated = S.withTreatment(tdoc, tp);
ok('the person’s own pictures are treated, nothing else; never twice', treated.artboards[0].children[0].effects?.[0]?.kind === 'duotone' && !treated.artboards[0].children[1].effects && S.withTreatment(treated, tp).artboards[0].children[0].effects.length === 1);

// ── websites the person points to, read for reference ──
sec('references: websites read on request, said honestly, never placed in the work');
ok('links and named sites are found in what the person writes (two at most, never a Figma file)', J(S.referenceUrls('something like stripe.com, or https://linear.app/method.')) === J(['https://linear.app/method', 'https://stripe.com']) && S.referenceUrls('https://www.figma.com/design/abc/Aster').length === 0 && S.referenceUrls('a b c https://a.example https://b.example https://c.example').length === 2, J(S.referenceUrls('something like stripe.com, or https://linear.app/method.')));
ok('a bare address is read over https', S.referenceAddress('linear.app') === 'https://linear.app' && S.referenceAddress('http://x.example/a') === 'http://x.example/a' && S.referenceAddress('') === '');
ok('“find some references” without a link: told how references work, nothing searched or invented', S.hear(fresh, 'can you find some references?').kind === 'research' && /Paste a link to something you like/.test(lastSaid(reply(open('graphic', 'A poster for “Open Day”'), 'can you find some references?').st).text));
const html = readFileSync(join(FIX, 'site', 'index.html'), 'utf8');
const siteCss = readFileSync(join(FIX, 'site', 'site.css'), 'utf8');
const served = { 'https://larkfield.example/': { type: 'text/html; charset=utf-8', body: html }, 'https://larkfield.example/assets/site.css': { type: 'text/css', body: siteCss } };
const askedFor = [];
const fetcher = async (url, init) => {
  askedFor.push(url);
  const s = served[url];
  return s ? new Response(s.body, { status: 200, headers: { 'content-type': s.type } }) : new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
};
const publicDns = async () => [{ address: '93.184.215.14', family: 4 }];
const rr = await S.readSiteReference('larkfield.example', { fetcher, resolver: publicDns });
ok('a site read through the guarded reader: the page and the stylesheet it names, nothing else (no logos, no scripts, no crawling)', rr.ok && J(askedFor) === J(['https://larkfield.example/', 'https://larkfield.example/assets/site.css']), J({ ok: rr.ok, askedFor, err: rr.error }));
const read = rr.read;
ok('what was read: its address, its colours, its faces, and a designer’s notes', read.host === 'larkfield.example' && read.colours.length >= 3 && read.fonts.includes('Fraunces') && read.notes.length >= 2, J(read));
ok('…its ground, ink and accent when the site says them', [read.ground, read.ink, read.accent].every((x) => !x || /^#[0-9a-f]{6}$/.test(x)) && !!read.accent, J({ g: read.ground, i: read.ink, a: read.accent }));
const pv = rr.preview;
ok('the page drawn inert: no scripts, no handlers, a policy that allows nothing to run or connect, links resolved against the site', !/<script/i.test(pv) && !/\son[a-z]+\s*=/i.test(pv) && /Content-Security-Policy/i.test(pv) && /default-src 'none'/.test(pv) && /<base href="https:\/\/larkfield\.example\/"/.test(pv), pv.slice(0, 400));
const evil = S.previewDoc('<html><head><script>alert(1)</script><meta http-equiv="refresh" content="0;url=https://evil.example"></head><body onload="x()"><a href="javascript:alert(1)">x</a><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input></form><img src="/a.png"></body></html>', [{ url: 'https://shop.example/assets/site.css', text: 'body{background:url(../bg.png)} @import url(https://evil.example/x.css);' }], 'https://shop.example/');
ok('…what could run, navigate or submit is taken out; pictures and backgrounds resolved against the site', !/<script|onload|javascript:|http-equiv="refresh"|<\/?iframe|action=/i.test(evil) && /url\(["']?https:\/\/shop\.example\/bg\.png/.test(evil) && !/@import/i.test(evil) && /form-action 'none'/.test(evil) && !/style-src[^;]*https:/.test(evil), evil);
const big = S.previewDoc('<p>' + 'x'.repeat(900_000) + '</p>', [{ url: 'https://big.example/a.css', text: 'a{}'.repeat(200_000) }], 'https://big.example/');
ok('…and held to a size', big.length < 700_000, big.length);
const refusal = await S.readSiteReference('https://evil.example/', { fetcher, resolver: async () => [{ address: '10.0.0.5', family: 4 }] });
ok('a site that resolves to a private address is refused, and says so (nothing is read)', !refusal.ok && /private or reserved/.test(refusal.error) && refusal.status >= 400, J(refusal));
ok('no address: refused before anything is asked', !(await S.readSiteReference('', { fetcher })).ok);
const ref = S.referenceOf(read, NOW);
ok('kept as a reference: liked until the person says otherwise, its link checked', ref.kind === 'site' && ref.state === 'liked' && ref.url === 'https://larkfield.example/' && ref.id.length > 0);
const unsafe = S.normalizeStudio({ ...start('graphic', 'A poster for “X”'), references: [{ ...ref, url: 'javascript:alert(1)' }, { ...ref, id: 'r2', url: 'https://user:pw@evil.example/' }, { ...ref, id: 'r3', colours: ['#fff', '#123456', 'red'], notes: Array.from({ length: 40 }, (_, i) => `n${i}`) }] });
ok('references are held to their shape on read: http(s) only, no credentials, real colours, bounded notes', unsafe.references.length === 1 && J(unsafe.references[0].colours) === J(['#123456']) && unsafe.references[0].notes.length <= 12, J(unsafe.references));
let rs = S.addReference(open('graphic', 'A poster for “Open Day”'), ref, NOW + 2);
ok('said in the conversation: what was read, in words', rs.transcript.at(-1).kind === 'reference' && rs.transcript.at(-1).stage === ref.id && /larkfield\.example/.test(rs.transcript.at(-1).text));
ok('…read again, the newer reading replaces the older', S.addReference(rs, { ...ref, title: 'Again' }, NOW + 3).references.length === 1);
const rp = S.prefsOf(rs);
ok('a liked site gives its colours to the work when the person named none', rp.palette?.accent === ref.accent || ref.colours.includes(rp.palette?.accent), J(rp.palette));
ok('…and its faces, when the font library knows them', rp.faces?.display === 'Fraunces' || rp.faces?.body === 'Fraunces', J(rp.faces));
ok('the person’s own colours outrank a reference’s', S.prefsOf(S.respond(rs, 'use #f4f1e8, #20201b and #5e7633', {}, { now: NOW + 4 }).st).palette?.accent === '#5e7633');
const typeOnly = { ...rs, references: rs.references.map((x) => ({ ...x, take: ['type'] })) };
ok('a site taken only for its type gives no colour', S.prefsOf(typeOnly).palette === null && (S.prefsOf(typeOnly).faces?.display === 'Fraunces' || S.prefsOf(typeOnly).faces?.body === 'Fraunces'), J(S.prefsOf(typeOnly)));
const turnedDown = { ...rs, references: rs.references.map((x) => ({ ...x, state: 'rejected' })) };
ok('a site set aside speaks for nothing', S.prefsOf(turnedDown).palette === null && !S.prefsOf(turnedDown).faces);
ok('the brief names the sites it learns from', S.briefLines(rs).some((x) => x.label === 'Look' && /larkfield\.example/.test(x.value)), J(S.briefLines(rs)));
const gb = S.graphicBriefOf(rs);
ok('a reference shapes the work but is never placed in it: no picture of it in the brief', gb && !J(gb).includes('larkfield.example/') && !(gb.images ?? []).length, J(gb));

// ── two directions made one, and directions named in words (the editor's concepts and the website engine use them) ──
sec('directions combined and named in words');
const dA = S.languageDirection('Field Lines', ['warm'], 'a');
const dB = S.languageDirection('Field Lines', ['bold'], 'b');
const both = S.combineDirections(dA, dB);
ok('two directions made one: the first’s colours, the second’s type, structure and composition', J(both.tokens.colors) === J(dA.tokens.colors) && both.tokens.fonts.display === dB.tokens.fonts.display && both.language === dB.language && both.name === `${dA.name} × ${dB.name}`);
const ords = [
  ['the second one', [1]],
  ['combine the first and third', [0, 2]],
  ['the third and the first', [2, 0]],
  ['mix 1 and 3', [0, 2]],
  ['option two', [1]],
  ['make it 2 columns', []],
  ['I want 3 sections on the page', []],
  ['none of these', []],
];
for (const [words, want] of ords) ok(`“${words}” names ${J(want)}`, J(S.ordinalsIn(words)) === J(want), J(S.ordinalsIn(words)));
ok('whose colours are wanted: the one named with “colours”, else the first named', J(S.colourFirst('the first with the third’s colours', [0, 2])) === J([2, 0]) && J(S.colourFirst('colours from the second, type from the first', [1, 0])) === J([1, 0]) && J(S.colourFirst('combine the first and third', [0, 2])) === J([0, 2]));
ok('combining is asked for in many ways; choosing one is not combining', ['combine them', 'mix the two', 'the first plus the second', 'one + three', 'the second’s palette'].every((x) => S.COMBINE_WORDS.test(x)) && !S.COMBINE_WORDS.test('the second one please'));

// ── the brief, as understood ──
sec('the brief: each line with where it came from');
const bl = S.briefLines(S.respond(open('graphic', 'A poster for “Open Day”'), 'skip', {}, { now: NOW + 1 }).st);
ok('what it is and its words, each said where it came from', bl[0].label === 'What' && bl.some((x) => x.label === 'Words' && /Open Day/.test(x.value) && x.source === 'words'), J(bl));

// ── the engines read the decisions ──
sec('decisions reach the engines unchanged: briefs, directions, DNA');
let gg = open('graphic', 'A poster for “Field Lines”');
gg = S.respond(gg, 'warm and quiet, no gradients please', {}, { now: NOW + 1 }).st;
gg = S.respond(gg, 'use #f4f1e8, #20201b and #5e7633', {}, { now: NOW + 2 }).st;
const brief = S.graphicBriefOf(gg);
ok('the graphic brief: the words exactly, the form, the feel and what to avoid', brief.content.headline === 'Field Lines' && brief.kind === 'poster' && brief.mood.includes('warm') && /Avoid/i.test(brief.purpose) && /gradient/i.test(brief.purpose), J(brief));
const prefs = S.prefsOf(gg);
ok('preferences: the person’s palette', prefs.palette?.accent === '#5e7633' && prefs.palette?.ground === '#f4f1e8', J(prefs.palette));
const dirs = [S.languageDirection('Field Lines', ['warm'], 'a'), S.languageDirection('Field Lines', ['quiet'], 'b'), S.languageDirection('Field Lines', ['bold'], 'c')];
const held = S.directionsWithPrefs(dirs, prefs);
ok('directions take the palette; the text colour always reads on the ground', held.every((d) => d.tokens.colors.accent === '#5e7633' && d.tokens.colors.background === '#f4f1e8' && d.tokens.colors.text));
ok('a linked design system keeps its identity (palette untouched)', S.directionsWithPrefs(dirs, prefs, { keepIdentity: true })[0].tokens.colors.accent === dirs[0].tokens.colors.accent);
const composed = S.composeGraphic(brief, held[0], { seed: 3 });
ok('the graphics engine composes from it: the person’s words, in their palette', composed.doc.artboards[0].children.some((n) => n.type === 'text' && n.text === 'Field Lines') && composed.doc.tokens.colors.accent === '#5e7633');
const gp = S.startProject({ ...S.makeProject('create', 'Untitled graphic', NOW), medium: 'graphic' }, gg, { now: NOW });
ok('a graphic project ready for its directions, the conversation marked started', gp.ok && gp.project.graphic.brief.content.headline === 'Field Lines' && gp.project.studio.status === 'started' && gp.project.name === 'Field Lines');
ok('a graphic without its words cannot start, and says why', !S.startProject(S.makeProject('create', 'x', NOW), start('graphic', 'a poster'), { now: NOW }).ok);

// (the creative questions themselves — what is asked, its visual aids, the brief they build — are tested in
// test/discover.test.mjs: a graphic, a logo, a campaign or a website is discovered there, never by the director)

// ── voice ──
sec('voice: second person, no emoji, never a questionnaire');
ok('no emoji anywhere in what SocriaUX says', ![...SAID, ...S.MODES.flatMap((m) => [m.line, m.does, ...m.examples])].some((s) => /\p{Extended_Pictographic}/u.test(s)), SAID.find((s) => /\p{Extended_Pictographic}/u.test(s)));
ok('six modes, each with a line, a workflow and examples', S.MODES.length === 6 && S.MODES.every((m) => m.line && m.does && m.examples.length >= 2));
ok('options are few: never more than three suggestions, or four creative options, at a tap', SAID.length > 20 && [open('graphic', 'a poster'), open('website', 'A website for “Mira Studio”'), open('logo', 'A logo for “Halden”'), open('graphic', 'A poster for “Open Day”')].every((s) => !s.pending || (s.pending === 'discover' ? [s.discovery.current.palettes, s.discovery.current.faces, s.discovery.current.vibes, s.discovery.current.options].every((x) => !x || x.length <= 4) : S.questionFor(s, s.pending).suggestions.length <= 3)));

console.log(`\nstudio: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
