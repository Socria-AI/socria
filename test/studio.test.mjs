// SocriaUX studio — one conversation in front of six capabilities. Checked here by what it does, with no model and no
// network: intent recognition (each mode, close calls asked rather than guessed, attachments), the facts an opening
// sentence states (read by the engines' own readers), the adaptive questions (never asking what the words said, questions
// that depend on earlier answers, progressive depth, "enough to begin", skip, back, "you decide", "surprise me", reopen,
// free text), the record (normalised, bounded, kept on the project), and how every decision reaches its engine (graphic
// briefs and directions, logo words, board briefs and systems, a whole website with its working parts, Creative DNA).

import * as S from './.tmp/studio-under-test.mjs';

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
const raw = { mode: 'graphic', prompt: 'x'.repeat(5000), answers: { 'g.kind': { values: ['poster'], source: 'person', at: 1 }, __proto__: { values: ['bad'] }, 'bad key!': { values: ['x'] } }, transcript: [{ id: 'm1', from: 'person', text: 'hi', at: 1, kind: 'prompt' }, { nope: 1 }], attachments: [{ id: 'a1', name: 'p.png', kind: 'image', upload: 'up_1' }, { id: 'a2', kind: 'virus' }], status: 'started', systemId: 'dsys_abcd1234', depth: 2, createdAt: 5 };
const n1 = S.normalizeStudio(raw);
ok('held to its shape: prompt bounded, bad keys and entries dropped', n1 && n1.prompt.length === 2000 && Object.keys(n1.answers).join() === 'g.kind' && n1.transcript.length === 1 && n1.attachments.length === 1 && n1.status === 'started' && n1.depth === 2 && n1.systemId === 'dsys_abcd1234', J(n1));
ok('not a record: undefined', S.normalizeStudio({ mode: 'poster' }) === undefined && S.normalizeStudio(null) === undefined);
const proj = { ...S.makeProject('create', 'Untitled graphic', NOW), studio: start('graphic', 'A poster for “Field Lines”') };
const back = S.normalizeProject(JSON.parse(J(proj)));
ok('kept on the project through storage (a reload, another device)', back.studio && back.studio.mode === 'graphic' && back.studio.answers['g.words']?.fields?.headline === 'Field Lines');
ok('the summary says it was begun in the studio', S.summarize(back).studio?.mode === 'graphic' && S.summarize(back).studio?.status === 'discovering');
ok('a project without one is unchanged', S.normalizeProject(JSON.parse(J(S.makeProject('create', 'x', NOW)))).studio === undefined);

// ── adaptive discovery: a graphic ──
sec('a graphic: what the words said is not asked; references, not presets; depth; enough to begin');
// references as the research returns them (the shape lib/ux-v0/studio/research.ts gives an Openverse result)
const ref = (id, title, tags, swatches, extra = {}) => ({ id: `openverse:${id}`, provider: 'openverse', title, creator: 'A. Maker', sourceUrl: `https://www.flickr.com/photos/maker/${id}`, origin: 'flickr', thumb: `https://api.openverse.org/v1/images/${id}/thumb/`, width: 1200, height: 800, license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', tags, query: 'creative coding poster', state: 'proposed', swatches, at: NOW, ...extra });
const FOUND = [
  ref('a1', 'Swiss style poster, Zurich 1961', ['poster', 'typography', 'swiss'], ['#f2efe6', '#141414', '#e2361b']),
  ref('b2', 'Bauhaus exhibition poster', ['bauhaus', 'poster', 'print'], ['#efe9dc', '#1d1d1d', '#2d5fa8', '#e8b523']),
  ref('c3', 'Neon sign at night', ['neon', 'sign'], ['#0b0b12', '#ff2bd6', '#28f0ff']),
];
let g = start('graphic', 'A bold, experimental poster for “Field Lines”, a creative coding night');
ok('the kind, the words and the feel are taken from the sentence, said once', g.answers['g.kind']?.source === 'words' && g.answers['g.words']?.fields?.headline === 'Field Lines' && g.answers['g.personality']?.values.includes('bold') && /From your words/.test(g.transcript[0]?.text ?? ''), J(g.answers));
let cur = S.currentStage(g);
ok('the first question asked is the references found for these words (form, words and feel were said)', cur?.id === 'g.refs' && cur.control === 'references' && cur.select === 'multi', cur?.id);
ok('before anything is found, nothing is offered in its place (no invented references)', cur.options.length === 0);
const allStages = S.pathOf({ ...g, depth: 3 }).map((x) => x.id);
ok('no preset style or direction list anywhere on the path', !allStages.some((id) => /style|direction/.test(id)), J(allStages));
let r = S.readiness(g);
ok('it can start already (the required kind and headline are there), but more is asked first', r.canStart && !r.enough, J(r));
g = { ...g, references: S.mergeReferences(g.references ?? [], FOUND), research: { at: NOW, searches: [{ query: 'creative coding poster', provider: 'openverse', found: 3 }] } };
cur = S.currentStage(g);
ok('what was found becomes the choice, exactly as found (its title, its creator)', cur.options.length === 3 && cur.options[0].label === FOUND[0].title && cur.options[0].hint === 'A. Maker', J(cur.options));
g = { ...g, references: g.references.map((x) => (x.id === 'openverse:a1' || x.id === 'openverse:b2' ? { ...x, state: 'liked' } : x.id === 'openverse:c3' ? { ...x, state: 'rejected' } : x)) };
ok('a reference turned down is no longer offered', S.currentStage(g).options.length === 2 && !S.currentStage(g).options.some((o) => o.id === 'openverse:c3'));
g = S.answerStage(g, 'g.refs', { values: ['openverse:a1', 'openverse:b2'] }, {}, NOW + 1);
r = S.readiness(g);
ok('after the references: enough to begin, with deeper choices on offer', r.canStart && r.enough && r.more >= 3 && S.currentStage(g) === null, J(r));
ok('the answer is said in the transcript, naming what was liked', g.transcript.some((m) => m.from === 'person' && /2 liked/.test(m.text) && /Swiss style poster/.test(m.text)), J(g.transcript.map((m) => m.text)));
const gp0 = S.prefsOf(g);
ok('the influences the liked references name in their own words reach the preferences (Swiss, Bauhaus)', gp0.styles.length >= 1, J(gp0.styles));
ok('their colours become the palette: the lightest the ground, the darkest the ink, the most saturated the accent', gp0.palette?.ground === '#f2efe6' && gp0.palette?.ink === '#141414' && ['#e2361b', '#2d5fa8', '#e8b523'].includes(gp0.palette?.accent), J(gp0.palette));
ok('a turned-down reference speaks for nothing (its neon is nowhere)', !Object.values(gp0.palette ?? {}).some((c) => ['#ff2bd6', '#28f0ff', '#0b0b12'].includes(c)));
const onlyType = { ...g, references: g.references.map((x) => (x.state === 'liked' ? { ...x, take: ['type'] } : x)) };
ok('references liked only for their type give no colour; one liked for its colour speaks for colour alone', S.prefsOf(onlyType).palette === null && S.prefsOf({ ...g, references: g.references.map((x) => (x.id === 'openverse:b2' ? { ...x, take: ['colour'] } : x)) }).palette?.accent !== '#e2361b', J(S.prefsOf(onlyType).palette));
g = S.deeper(g);
cur = S.currentStage(g);
ok('deeper: colour, proposed from the references liked, each of them, and the words (never a stock palette)', cur?.id === 'g.palette' && cur.options[0].label === 'From the references you liked' && cur.options.some((o) => /^From “/.test(o.label)) && cur.options.some((o) => /your words/.test(o.label)) && cur.options.every((o) => o.swatches?.length >= 3), J(cur?.options.map((o) => o.label)));
g = S.answerStage(g, 'g.palette', { values: [cur.options[0].id] }, {}, NOW + 2);
cur = S.currentStage(g);
ok('then type, generated: faces the references’ influences carry, then voices found for the words, each real', cur?.id === 'g.type' && cur.options.length >= 3 && cur.options.every((o) => o.faces?.display && o.faces?.body) && cur.options.some((o) => o.hint === 'From your references'), J(cur?.options));
g = S.skipStage(g, 'g.type', {}, NOW + 3);
cur = S.currentStage(g);
ok('skipped is skipped; then composition, with previews of each spatial idea', cur?.id === 'g.composition' && cur.options.every((o) => o.preview?.kind === 'org'));
g = S.delegateStage(g, 'g.composition', {}, NOW + 4);
ok('"you decide" is recorded as SocriaUX’s', g.answers['g.composition']?.delegated === true && g.answers['g.composition']?.source === 'socria');
ok('the transcript holds each question and answer in the person’s words', g.transcript.filter((m) => m.kind === 'question').length >= 2 && g.transcript.some((m) => m.from === 'person' && /You decide/.test(m.text)));
const backed = S.stepBack(g);
ok('back takes the last answer back to be given again', !backed.answers['g.composition'] && S.currentStage(backed)?.id === 'g.composition');
const reopened = S.reopen(g, 'g.refs');
ok('any decision can be reopened (the references again, still liked)', !reopened.answers['g.refs'] && S.currentStage(reopened)?.id === 'g.refs' && S.likedOf(reopened).length === 2);
ok('from-the-words decisions stay when stepping back', S.stepBack(S.stepBack(S.stepBack(S.stepBack(g)))).answers['g.words']?.source === 'words');
let g2 = start('graphic', 'something for our open day');
ok('without words to set, the words are asked for and required', S.currentStage(g2)?.id === 'g.kind' || S.currentStage(g2)?.id === 'g.words');
g2 = S.surprise(g2, {}, NOW + 5);
ok('"surprise me" leaves every choice to SocriaUX but still asks for the person’s words', !S.readiness(g2).canStart && S.readiness(g2).missing.length > 0 && ['g.kind', 'g.words'].includes(S.currentStage(g2)?.id) && g2.answers['g.refs']?.delegated, J(S.readiness(g2)));
g2 = S.answerStage(g2, 'g.kind', { values: ['carousel'] }, {}, NOW + 6);
const wordsStage = S.currentStage(g2);
ok('a carousel is asked for one point per slide (the question adapts to the form)', wordsStage?.id === 'g.words' && wordsStage.fields.some((f) => f.id === 'items'), J(wordsStage?.fields));
g2 = S.answerStage(g2, 'g.words', { values: [], fields: { headline: 'Open Day', items: 'Labs\nTalks\nFood' } }, {}, NOW + 7);
ok('then it can start with nothing else asked', S.readiness(g2).canStart && S.currentStage(g2) === null);

// ── a logo: questions that depend on answers ──
sec('a logo: the form decides what is asked next');
let l = start('logo', 'A logo for “Halden”, a small coffee roastery, warm and crafted');
ok('name, subject and personality from the words', l.answers['l.name']?.fields?.name === 'Halden' && l.answers['l.about']?.values.length > 0 && l.answers['l.personality']?.values.length >= 2, J(l.answers));
cur = S.currentStage(l);
ok('asked first: typographic, symbolic or both — each drawn by the logo engine for the name', cur?.id === 'l.form' && cur.options.every((o) => o.preview?.kind === 'logo'), cur?.id);
const formed = S.answerStage(l, 'l.form', { values: ['wordmark'] }, {}, NOW + 1);
ok('once the form is known, the references found for it are asked about', S.currentStage(formed)?.id === 'l.refs', S.currentStage(formed)?.id);
const typo = S.deeper(S.skipStage(formed, 'l.refs', {}, NOW + 1));
ok('a typographic logo is asked about its lettering, not about a symbol', S.currentStage(typo)?.id === 'l.lettering' && !S.pathOf(typo).some((s) => s.id === 'l.idea'));
const sym = S.deeper(S.skipStage(S.answerStage(l, 'l.form', { values: ['abstract'] }, {}, NOW + 1), 'l.refs', {}, NOW + 1));
ok('an abstract mark is asked what it should call to mind, from the subject’s own ideas', S.pathOf(sym).some((s) => s.id === 'l.idea') && !S.pathOf(sym).some((s) => s.id === 'l.lettering') && S.stageById(sym, 'l.idea').options.length > 0, J(S.stageById(sym, 'l.idea')?.options));
const lw = S.logoWordsOf(S.answerStage(S.answerStage(typo, 'l.lettering', { values: ['serif'] }, {}, NOW + 2), 'l.avoid', { values: ['leaf'] }, {}, NOW + 3));
ok('the logo brief carries the name, the form, the lettering and what to avoid, in words the logo engine reads', /“Halden”/.test(lw.words) && /wordmark/.test(lw.words) && /serif/.test(lw.words) && /Avoid leaf/.test(lw.words), lw.words);
const lb = S.logoBriefOfGraphic(S.logoBriefOf(S.answerStage(typo, 'l.lettering', { values: ['serif'] }, {}, NOW + 2)));
ok('…and the logo engine reads them: the name exactly, a wordmark asked for', lb.name === 'Halden' && lb.wanted === 'wordmark', J({ name: lb.name, wanted: lb.wanted }));
const concepts = S.exploreLogo(lb, { count: 3, seed: 1 });
ok('concepts are constructed for it (no library)', concepts.length >= 3 && concepts.every((c) => c.wordmark));

// ── a website ──
sec('a website: purpose first, functions by purpose, a whole working site');
let w = start('website', 'A website for “Stillwater Yoga” with bookings, calm and warm');
ok('purpose and name from the words', w.answers['w.purpose']?.values[0] === 'bookings' && w.answers['w.words']?.fields?.headline === 'Stillwater Yoga', J(w.answers));
cur = S.currentStage(w);
ok('who it is for, adapted to the purpose', cur?.id === 'w.audience' && cur.options.some((o) => /Regulars|Newcomers/.test(o.label)), J(cur?.options));
w = S.answerStage(w, 'w.audience', { values: ['Newcomers'] }, {}, NOW + 1);
cur = S.currentStage(w);
ok('then what it must do, for bookings: a booking calendar first', cur?.id === 'w.functions' && cur.options[0].id === 'booking' && cur.options.every((o) => S.SITE_FUNCTIONS.find((x) => x.id === o.id).for.includes('bookings')));
w = S.answerStage(w, 'w.functions', { values: ['booking', 'contact'] }, {}, NOW + 2);
const systems = S.websiteSystems(w);
ok('three systems proposed by the board engine for these words', systems.length === 3 && systems.every((s) => s.art), J(systems.map((s) => s.direction.name)));
const wl = { ...w, references: FOUND.slice(0, 2).map((x) => ({ ...x, state: 'liked' })) };
ok('references liked reach the website looks: each proposed in their colours', S.websiteSystems(wl).length === 3 && S.websiteSystems(wl).every((x) => x.tokens.colors.background === '#f2efe6'), J(S.websiteSystems(wl).map((x) => x.tokens.colors.background)));
const env = { websiteSystems: systems };
cur = S.currentStage(w, env);
ok('then the references found for the site, before its look is chosen (what is liked shapes the looks)', cur?.id === 'w.refs', cur?.id);
w = S.skipStage(w, 'w.refs', env, NOW + 3);
cur = S.currentStage(w, env);
ok('then the look: each a working page', cur?.id === 'w.aesthetic' && cur.options.length === 3 && cur.options.every((o) => o.preview?.kind === 'website'));
w = S.answerStage(w, 'w.aesthetic', { values: ['sys-1'] }, env, NOW + 3);
ok('enough to begin', S.readiness(w, env).enough);
const site = S.startWebsite(w, systems[1], { now: NOW });
const spec = site.ok ? site.project.specs[0] : null;
ok('a whole website project, its direction approved, a first design made', site.ok && site.project.brief.approved && site.project.direction.approved && spec && spec.sections.length >= 4, site.ok ? '' : site.error);
ok('…with a working booking and a contact form (the interface’s own labels)', spec && spec.sections.some((s) => s.kind === 'booking' && s.content.days?.length === 5) && spec.sections.some((s) => s.kind === 'form' && s.content.fields.some((f) => f.type === 'email')), J(spec?.sections.map((s) => s.kind)));
ok('…the person’s words exactly, nothing invented', spec && spec.sections.find((s) => s.kind === 'hero')?.content.title === 'Stillwater Yoga');
ok('…its brief knows who it is for and what it must do', site.ok && site.project.brief.doc.audience === 'Newcomers' && site.project.brief.doc.functionalRequirements.includes('Booking calendar'), J(site.ok && site.project.brief.doc.functionalRequirements));
ok('…and it renders', site.ok && S.renderDesign(spec, []).html.includes('Stillwater Yoga'));
ok('…the conversation goes with it, marked started', site.ok && site.project.studio?.status === 'started' && site.project.studio.transcript.length > 0);

// ── a board ──
sec('a board: materials counted, identity, a website asked about only when there is one');
let b = start('board', 'A launch campaign for “Night Market Lisbon”: two posters, three Instagram posts and a website');
ok('materials counted from the words', b.answers['b.materials']?.numbers?.poster === 2 && b.answers['b.materials']?.numbers?.social === 3 && b.answers['b.materials']?.numbers?.website === 1, J(b.answers['b.materials']));
ok('the objective read (a launch)', b.answers['b.objective']?.values[0] === 'launch');
ok('a board with a website is asked what the website must do (at depth 2)', S.pathOf(S.deeper(b)).some((s) => s.id === 'b.website'));
ok('a board without one is not', !S.pathOf(S.deeper(start('board', 'A campaign for “Harbour Week”: four posters'))).some((s) => s.id === 'b.website'));
ok('the identity question only when there is a system or a website to share', !S.pathOf(b).some((s) => s.id === 'b.identity') && S.pathOf(b, { systems: [{ id: 'dsys_x1234', name: 'Halden' }] }).some((s) => s.id === 'b.identity'));
ok('a board asks for references too, before anything is chosen for it', S.currentStage(b)?.id === 'b.refs', S.currentStage(b)?.id);
b = S.skipStage(b, 'b.refs', {}, NOW + 1);
const p0 = S.makeProject('create', 'Untitled board', NOW);
const bs = S.startProject({ ...p0, medium: 'board' }, b, { now: NOW });
ok('a board project ready to propose: brief, materials, the request', bs.ok && bs.project.board.brief.materials.length === 3 && bs.project.board.brief.content.headline === 'Night Market Lisbon' && bs.project.board.request.length > 0, J(bs.ok && bs.project.board.brief));

// ── the engines read the decisions ──
sec('decisions reach the engines: briefs, directions, DNA');
let gg = start('graphic', 'A poster for “Field Lines”, warm and quiet');
gg = { ...gg, references: FOUND.slice(0, 2).map((x) => ({ ...x, state: 'liked' })) };
gg = S.answerStage(gg, 'g.refs', { values: ['openverse:a1', 'openverse:b2'] }, {}, NOW + 1);
gg = S.answerStage(gg, 'g.palette', { values: [], fields: { ground: '#f4f1e8', ink: '#20201b', accent: '#5e7633' } }, {}, NOW + 2);
gg = S.answerStage(gg, 'g.type', { values: ['Fraunces|Inter'] }, {}, NOW + 3);
gg = S.answerStage(gg, 'g.composition', { values: ['grid'] }, {}, NOW + 4);
gg = S.answerStage(gg, 'g.feel', { values: [], numbers: { restraint: 20, density: 30 } }, {}, NOW + 5);
gg = S.answerStage(gg, 'g.avoid', { values: ['gradients'] }, {}, NOW + 6);
const brief = S.graphicBriefOf(gg);
ok('the graphic brief: the words exactly, the form, the feel, the influences of the references liked and the avoid list in its words', brief.content.headline === 'Field Lines' && brief.kind === 'poster' && brief.mood.includes('warm') && /style of/.test(brief.purpose) && /Avoid gradients/.test(brief.purpose), J(brief));
ok('the person’s own palette outranks the references’ colours', S.prefsOf(gg).palette?.accent === '#5e7633');
const prefs = S.prefsOf(gg);
ok('preferences: palette, faces, composition, DNA', prefs.palette?.accent === '#5e7633' && prefs.faces?.display === 'Fraunces' && prefs.org === 'grid' && prefs.dna.restraint === 20, J(prefs));
const dirs = [S.languageDirection('Field Lines', ['warm'], 'a'), S.languageDirection('Field Lines', ['quiet'], 'b'), S.languageDirection('Field Lines', ['bold'], 'c')];
const held = S.directionsWithPrefs(dirs, prefs);
ok('directions take the palette and faces; two follow the composition, one stays free', held.every((d) => d.tokens.colors.accent === '#5e7633' && d.tokens.colors.background === '#f4f1e8' && d.tokens.fonts.display === 'Fraunces') && held[0].generative?.constraints?.org === 'grid' && held[1].generative?.constraints?.org === 'grid' && held[2].generative?.constraints?.org !== 'grid');
ok('the text colour always reads on the ground', held.every((d) => d.tokens.colors.text));
ok('a linked design system keeps its identity (palette and faces untouched)', S.directionsWithPrefs(dirs, prefs, { keepIdentity: true })[0].tokens.colors.accent === dirs[0].tokens.colors.accent);
const composed = S.composeGraphic(brief, held[0], { seed: 3 });
ok('the graphics engine composes from it: the person’s words, in their palette', composed.doc.artboards[0].children.some((n) => n.type === 'text' && n.text === 'Field Lines') && composed.doc.tokens.colors.accent === '#5e7633');
const dna = S.studioDNA(gg);
ok('Creative DNA: only the sliders moved, as the designer’s', dna && dna.dims.restraint?.value === 20 && dna.dims.restraint?.source === 'designer' && dna.dims.density?.value === 30 && !dna.dims.motion);
const gp = S.startProject({ ...S.makeProject('create', 'Untitled graphic', NOW), medium: 'graphic' }, gg, { now: NOW });
ok('a graphic project ready for its directions: brief, DNA, the conversation marked started', gp.ok && gp.project.graphic.brief.content.headline === 'Field Lines' && gp.project.dna?.dims.restraint && gp.project.studio.status === 'started' && gp.project.name === 'Field Lines');
ok('a graphic without its words cannot start, and says why', !S.startProject(S.makeProject('create', 'x', NOW), start('graphic', 'a poster'), { now: NOW }).ok);

// ── free text ──
sec('free text: commands, answers in the person’s words, a change of kind');
const fresh = start('graphic', 'A poster for “Field Lines”');
ok('"surprise me", "start", "back", "skip", "more" are understood', S.readReply(fresh, 'Surprise me').kind === 'surprise' && S.readReply(fresh, 'start').kind === 'start' && S.readReply(fresh, 'go back').kind === 'back' && S.readReply(fresh, 'skip').kind === 'skip' && S.readReply(fresh, 'keep refining').kind === 'deeper');
const rep = S.readReply(fresh, 'something like a 1970s Swiss poster, very bold');
ok('typed words answer the question being asked, keeping their own words', rep.kind === 'answer' && rep.stage === S.currentStage(fresh).id && rep.answer.text?.includes('Swiss'), J(rep));
ok('"actually, a website instead" changes the kind', S.readReply(fresh, 'Actually I need a website instead').kind === 'switch');
const wordsReply = S.readReply(start('graphic', 'a poster'), '“Open Day”');
ok('words typed for the words question fill the headline', wordsReply.kind === 'answer' && wordsReply.answer.fields?.headline === 'Open Day', J(wordsReply));
// revising a decision in words, once the questions are done
const settled = S.surprise(start('graphic', 'A poster for “Field Lines”, a creative coding night'), {}, NOW);
const rev = S.reviseFromWords(settled, 'Actually call it “Signal Lines”, and make it bold and playful, swiss style', NOW + 1);
ok('a quoted headline said later replaces the words, and says so', S.answerOf(rev.st, 'g.words')?.fields?.headline === 'Signal Lines' && rev.changed.includes('the words'), J(rev.changed));
ok('temperament words said later change the feel (kept to four)', ['bold', 'playful'].every((m) => S.answerOf(rev.st, 'g.personality')?.values.includes(m)) && S.answerOf(rev.st, 'g.personality').values.length <= 4, J(S.answerOf(rev.st, 'g.personality')));
ok('a style named later changes the look, in the person’s words', /swiss/i.test(S.answerOf(rev.st, 'g.refs')?.text ?? '') && S.prefsOf(rev.st).styles.length > 0, J(S.answerOf(rev.st, 'g.refs')));
ok('…and the change is said in the transcript, with the person’s words before it', rev.st.transcript.at(-1).kind === 'change' && /Changed/.test(rev.st.transcript.at(-1).text) && rev.st.transcript.at(-2).from === 'person');
const calmer = S.reviseFromWords(rev.st, 'make it calm', NOW + 4);
ok('“make it calm” replaces the feel', J(S.answerOf(calmer.st, 'g.personality')?.values) === J(['calm']), J(S.answerOf(calmer.st, 'g.personality')));
const plus = S.reviseFromWords(calmer.st, 'also playful', NOW + 5);
ok('“also playful” adds to it', J(S.answerOf(plus.st, 'g.personality')?.values) === J(['playful', 'calm']), J(S.answerOf(plus.st, 'g.personality')));
const pal = S.reviseFromWords(start('graphic', 'A poster for “Open Day”'), 'use #f4efe6, #1b1b1b and #c2410c', NOW + 2);
ok('three colours said become a palette: lightest ground, darkest ink, most saturated accent', J(S.answerOf(pal.st, 'g.palette')?.fields) === J({ ground: '#f4efe6', ink: '#1b1b1b', accent: '#c2410c' }), J(S.answerOf(pal.st, 'g.palette')));
ok('…and the palette reaches the directions as the person’s own colours', S.prefsOf(pal.st).palette?.accent === '#c2410c');
const kept = S.reviseFromWords(start('logo', 'A logo for “Halden”'), 'it is for people who roast at home', NOW + 3);
ok('words that change nothing named are kept with the opening words, and say so', kept.changed.length === 0 && kept.st.prompt.includes('roast at home') && /Kept with everything/.test(kept.st.transcript.at(-1).text));
ok('…the name is never changed by words without quotes', S.answerOf(kept.st, 'l.name')?.fields?.name === 'Halden');

// ── research: real references, looked for on the internet ──
sec('research: what is searched for, what is found, said as it happened, never invented');
const ov = (id, title, tags, extra = {}) => ({ id, title, creator: 'A. Maker', creator_url: '', url: `https://live.staticflickr.com/x/${id}.jpg`, thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`, width: 1200, height: 900, foreign_landing_url: `https://www.flickr.com/photos/maker/${id}`, license: 'by', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by/2.0/', source: 'flickr', tags: tags.map((name) => ({ name })), ...extra });
const answering = (by) => {
  const asked = [];
  const f = async (url) => {
    const q = new URL(url).searchParams.get('q');
    asked.push(q);
    const out = by(q, url);
    return typeof out === 'number' ? { ok: false, status: out, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ results: out }) };
  };
  f.asked = asked;
  return f;
};
const plan = S.researchPlan(start('graphic', 'A bold poster for “Field Lines”, a creative coding night'));
ok('a brief asks for two to four short searches: its subject and its kind, its feel, typography', plan.length >= 2 && plan.length <= 4 && plan[0].q === 'creative coding poster' && plan.some((q) => q.q === 'bold poster') && plan.every((q) => q.q.split(' ').length <= 4), J(plan));
ok('the subject is what it is about, never its temperament or its quoted words', S.subjectOf('A logo for “Halden”, a small coffee roastery, warm and crafted') === 'coffee roastery', S.subjectOf('A logo for “Halden”, a small coffee roastery, warm and crafted'));
ok('each kind of work searches for its own kind of reference', S.researchPlan(start('logo', 'A logo for “Halden”, a coffee roastery'))[0].q === 'coffee roastery logo' && S.researchPlan(start('website', 'A website for a yoga studio'))[0].q === 'yoga studio website' && S.researchPlan(start('board', 'A launch campaign for a night market: two posters'))[0].q.endsWith('poster'));
ok('a design system or a critique searches for nothing', S.researchPlan(start('critique', 'Critique this page')).length === 0 && S.researchPlan(start('system', 'Import our tokens')).length === 0);

S.clearResearchCache();
const fOv = answering((q) => (q === 'creative coding poster' ? [ov('p1', 'Generative poster series', ['poster', 'generative']), ov('p2', 'Plotter drawing', ['plotter']), ov('p1', 'Generative poster series', ['poster'])] : q === 'bold poster' ? [ov('p3', 'Bold type poster', ['typography', 'poster'])] : []));
const run1 = await S.runResearch(plan, { fetcher: fOv, now: NOW });
ok('every search of the plan is asked, one after another, any licence', fOv.asked.length >= plan.length && fOv.asked[0] === 'creative coding poster', J(fOv.asked));
ok('what comes back is exactly what the library returned: its titles, creators, licences, sources and pictures', run1.refs.length === 3 && run1.refs.every((x) => x.provider === 'openverse' && x.thumb.startsWith('https://api.openverse.org/') && x.sourceUrl.startsWith('https://www.flickr.com/') && x.license === 'CC BY 2.0' && x.creator === 'A. Maker' && x.origin === 'flickr' && x.state === 'proposed'), J(run1.refs));
ok('the same work found twice is shown once', new Set(run1.refs.map((x) => x.id)).size === run1.refs.length);
ok('ranked for a designer: a poster before a plotter drawing', run1.refs[0].title === 'Generative poster series');
ok('the log says what was searched and what came of it', run1.log.searches[0].query === 'creative coding poster' && run1.log.searches[0].found === 2 && run1.log.searches.some((x) => x.found === 0 && !x.error), J(run1.log));
const said1 = S.researchSaid(run1.log, run1.refs.length);
ok('said honestly: where it searched, for what, how many, and that references are never copied', /Openverse/.test(said1) && /“creative coding poster”/.test(said1) && /found 3/.test(said1) && /never copied/.test(said1), said1);

S.clearResearchCache();
const f429 = answering(() => 429);
const busy = await S.runResearch(plan.slice(0, 2), { fetcher: f429, now: NOW });
ok('a library that is busy is said to be busy, and nothing is put in its place', busy.refs.length === 0 && busy.log.searches.every((x) => /busy/.test(x.error ?? '')), J(busy.log));
ok('…and the conversation says it could not search, rather than claiming it did', /tried to look/.test(S.researchSaid(busy.log, 0)) && !/found/.test(S.researchSaid(busy.log, 0)), S.researchSaid(busy.log, 0));
S.clearResearchCache();
const down = await S.runResearch([{ q: 'coffee roastery logo', why: '' }], { fetcher: async () => { throw new TypeError('Failed to fetch'); }, now: NOW });
ok('a library that cannot be reached is said to be unreachable', down.refs.length === 0 && /could not be reached/.test(down.log.searches[0].error ?? ''), J(down.log));
S.clearResearchCache();
const f5 = answering((q) => (q === 'quiet harbour photography' ? 504 : q === 'quiet harbour' ? [ov('h1', 'Harbour at dawn', ['harbour'])] : []));
const shorter = await S.runResearch([{ q: 'quiet harbour photography', why: '' }], { fetcher: f5, now: NOW });
ok('a search that fails is tried again in a shorter form, and the log says which words found it', shorter.refs.length === 1 && shorter.log.searches[0].query === 'quiet harbour' && !shorter.log.searches[0].error, J({ asked: f5.asked, log: shorter.log }));
const st0 = S.researchStatus({ references: [], research: busy.log }, false);
ok('the status line says when searching failed', st0.failed && /could not be searched/.test(st0.text), J(st0));
const st1 = S.researchStatus({ references: run1.refs, research: run1.log }, false);
ok('…and what was found, for which words', !st1.failed && /^3 found on Openverse for “creative coding poster”/.test(st1.text), st1.text);
ok('…and that it is searching while it is', /Searching Openverse/.test(S.researchStatus({}, true).text));
ok('the status never claims a search that did not happen', /Nothing has been searched/.test(S.researchStatus({ references: [] }, false).text));

const liked = run1.refs.map((x, i) => (i === 0 ? { ...x, state: 'liked' } : i === 1 ? { ...x, state: 'rejected' } : x));
const merged = S.mergeReferences(liked, [...run1.refs, ...Array.from({ length: 70 }, (_, i) => ({ ...run1.refs[2], id: `openverse:n${i}` }))], 60);
ok('more found are added without repeats, capped; what was liked or turned down always stays', merged.length === 60 && merged.some((x) => x.id === run1.refs[0].id && x.state === 'liked') && merged.some((x) => x.id === run1.refs[1].id && x.state === 'rejected') && new Set(merged.map((x) => x.id)).size === 60);
ok('a credit line names title, creator, licence and the library', S.creditOf(run1.refs[0]) === '“Generative poster series” by A. Maker, CC BY 2.0, via Openverse', S.creditOf(run1.refs[0]));
const unsafe = S.normalizeStudio({ ...start('graphic', 'A poster for “X”'), references: [{ ...run1.refs[0], thumb: 'javascript:alert(1)' }, { ...run1.refs[1], sourceUrl: 'https://user:pw@evil.example/x', thumb: 'http://insecure.example/x.jpg' }, { ...run1.refs[2], tags: Array.from({ length: 40 }, (_, i) => `t${i}`), swatches: ['#fff', '#123456', 'red'] }] });
ok('references are held to their shape: only https pictures, no credentials, bounded tags and colours', unsafe.references.length === 1 && unsafe.references[0].tags.length <= 12 && J(unsafe.references[0].swatches) === J(['#123456']), J(unsafe.references));
const moved = S.normalizeStudio(JSON.parse(J({ ...start('graphic', 'A poster for “X”'), references: liked, research: run1.log })));
ok('kept on the project through storage, with the log', moved.references.length === 3 && moved.research?.searches.length === run1.log.searches.length);

// ── pictures: how the person's own are treated ──
sec('pictures: a treatment, asked only when there are pictures, drawn with the engine’s own effects');
const noPics = S.surprise(start('graphic', 'A poster for “Open Day”'), {}, NOW);
ok('no pictures of their own: the treatment is not asked', !S.pathOf(noPics).some((x) => x.id === 'g.treatment'));
let pics = start('graphic', 'A poster for “Open Day”', { attachments: [{ id: 'at1', name: 'pour.jpg', kind: 'image', upload: 'up_1', width: 1200, height: 900, swatches: ['#f4efe6', '#2b1d14', '#c2410c'] }] });
ok('a picture of their own: the treatment is on the path', S.pathOf({ ...pics, depth: 3 }).some((x) => x.id === 'g.treatment'));
pics = S.answerStage(pics, 'g.palette', { values: [], fields: { ground: '#f4efe6', ink: '#1b1b1b', accent: '#c2410c' } }, {}, NOW);
pics = S.answerStage(pics, 'g.treatment', { values: ['duotone'] }, {}, NOW);
const pp = S.prefsOf(pics);
ok('the treatment chosen is a preference', pp.treatment === 'duotone');
const fx = S.treatmentEffects(pp.treatment, pp.palette);
ok('a duotone is the engine’s duotone, in the person’s ink and accent', fx.length === 1 && fx[0].kind === 'duotone' && fx[0].color === '#1b1b1b' && fx[0].color2 === '#c2410c', J(fx));
ok('“as they are” adds nothing', S.treatmentEffects('as-is', pp.palette).length === 0);
const tdoc = { schema: 1, id: 'd', name: 'd', tokens: { colors: { background: '#fff', surface: '#fff', text: '#111', muted: '#555', accent: '#c2410c', accentText: '#fff', line: '#ddd' }, fonts: { display: 'Inter', body: 'Inter' } }, assets: [{ id: 'a1', kind: 'image', src: 'upload:up_1', width: 10, height: 10, name: 'mine', source: 'upload' }, { id: 'a2', kind: 'image', src: 'https://x/y.jpg', width: 10, height: 10, name: 'library', source: 'library' }], artboards: [{ id: 'b', name: 'b', width: 100, height: 100, unit: 'px', dpi: 72, format: 'custom', background: '#fff', bleed: 0, safe: 0, children: [{ id: 'i1', type: 'image', asset: 'a1', fit: 'cover', x: 0, y: 0, w: 50, h: 50, rotation: 0, opacity: 1 }, { id: 'g', type: 'group', x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1, children: [{ id: 'i2', type: 'image', asset: 'a1', fit: 'cover', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1 }, { id: 'i3', type: 'image', asset: 'a2', fit: 'cover', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1 }] }] }], revision: 0, updatedAt: 0 };
const treated = S.withTreatment(tdoc, pp);
const kids = treated.artboards[0].children;
ok('the person’s own pictures are treated, in groups too', kids[0].effects?.[0]?.kind === 'duotone' && kids[1].children[0].effects?.[0]?.kind === 'duotone', J(kids[0].effects));
ok('…and nothing else is: a library picture is left as it is', !kids[1].children[1].effects);
ok('…and a treatment applied twice is not stacked twice', S.withTreatment(treated, pp).artboards[0].children[0].effects.length === 1);

// ── modes ──
sec('modes: six, each said plainly, likeliest first when asked');
ok('six modes, each with a line, a workflow and examples', S.MODES.length === 6 && S.MODES.every((m) => m.line && m.does && m.examples.length >= 2));
const mo = S.modeOptions(S.recognizeIntent('a logo or maybe a poster').ranked);
ok('the mode question puts the likeliest first and marks it', mo.length === 6 && mo[0].recommended === true, J(mo.map((o) => [o.id, o.recommended])));
ok('no emoji anywhere in what SocriaUX says', ![...S.MODES.flatMap((m) => [m.line, m.does, ...m.examples]), ...S.PERSONALITY.map((p) => p.label)].some((s) => /\p{Extended_Pictographic}/u.test(s)));

// ── design systems and critique ──
sec('design systems and critique: what is attached settles the source');
const sys = start('system', 'Import this', { attachments: [{ id: 'a1', name: 'tokens.json', kind: 'tokens' }] });
ok('a tokens file attached: the source and the files are settled, nothing left to ask before starting', sys.answers['s.source']?.values[0] === 'json' && sys.answers['s.input']?.values[0] === 'a1' && S.readiness(sys).canStart, J(sys.answers));
const imp = S.importAskOf(sys);
ok('the import is asked for in the wizard’s own terms', imp.kind === 'json');
const web = start('system', 'Take it from https://larkfield.example');
ok('a website address: the website source and its address', web.answers['s.source']?.values[0] === 'website' && web.answers['s.input']?.fields?.url === 'https://larkfield.example');
const crit = S.answerStage(start('critique', 'Critique this', { attachments: [{ id: 'f1', name: 'home.png', kind: 'image' }] }), 'c.focus', { values: ['hierarchy', 'accessibility'] }, {}, NOW + 1);
ok('a critique with its file attached is asked only what to look at first', crit.answers['c.file']?.values[0] === 'f1' && S.readiness(crit).canStart);
ok('the focus is said to SocriaUX as a request', /hierarchy, accessibility first/.test(S.critiqueAskOf(crit)), S.critiqueAskOf(crit));

console.log(`\nstudio: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
