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
ok('the home goes straight to the work only when the opening said it is making it', S.readyToMake(detailed) && !S.readyToMake(open('graphic', 'A poster for “Open Day”')) && !S.readyToMake(open('website', 'A website for “Stillwater Yoga” with bookings')));

const logoFull = open('logo', 'A logo for “Halden”, a small coffee roastery, warm and crafted');
ok('a logo with its name, its subject and its feel: made at once', questions(logoFull).length === 0 && S.nextMove(logoFull).kind === 'create' && /Constructing “Halden”/.test(lastSaid(logoFull).text), J(logoFull.transcript.map((m) => m.text)));
const siteFull = open('website', 'A website for “Stillwater Yoga” with bookings, calm and warm');
ok('a website with its name, its purpose and its feel: made at once, in a look drawn from the words (no looks to choose from)', questions(siteFull).length === 0 && S.nextMove(siteFull).kind === 'create' && lastSaid(siteFull).stage === 'making' && S.readyToMake(siteFull), J(siteFull.transcript.map((m) => m.text)));

// a vague request: what it is, then only what the work cannot be made without, then the creative questions worth asking
const vagueIntent = S.recognizeIntent('something for my bakery');
let v = open(vagueIntent.ranked[0].mode, 'something for my bakery', { modeBy: 'unsure' });
ok('words that settle nothing: the first question is what it is, said plainly, with at most three ways to answer', S.nextMove(v).kind === 'ask' && v.pending === 'what' && questions(v).length === 1 && S.questionFor(v, 'what').suggestions.length <= 3, J(v.transcript));
let t = reply(v, 'a poster for the opening weekend');
v = t.st;
ok('“a poster”: it is a poster now, chosen by the person, and the next question is the one thing a poster needs — its words', v.mode === 'graphic' && v.modeBy === 'person' && v.pending === 'words' && t.move.kind === 'ask', J({ mode: v.mode, pending: v.pending, said: lastSaid(v).text }));
ok('…one question per turn, never a list of them', v.transcript.filter((m) => m.from === 'socria').every((m) => (m.text.match(/\?/g) ?? []).length <= 2));
t = reply(v, 'Grand Opening — Saturday 4 May, 9am, 12 Mill Lane');
v = t.st;
ok('the words, in the person’s own way of writing them: headline, then what supports it', v.answers['g.words']?.fields?.headline === 'Grand Opening' && /4 May|9am|Mill Lane/.test(J(v.answers['g.words']?.fields)), J(v.answers['g.words']));
ok('with its words, a date and a place, one creative question is left worth asking: how it should feel, with moods drawn for it', t.move.kind === 'discover' && t.move.question.kind === 'vibe' && v.pending === 'discover' && v.discovery?.current?.vibes?.length >= 3 && questions(v).length === 3, J({ move: t.move.kind, q: questions(v).length, said: lastSaid(v).text }));
t = reply(v, 'warm and handmade');
v = t.st;
ok('…answered in the person’s words: the feel kept, and the work is made (three questions in all)', t.move.kind === 'create' && v.answers['g.personality']?.values.includes('warm') && lastSaid(v).stage === 'making' && questions(v).length === 3, J({ move: t.move.kind, p: v.answers['g.personality'], said: lastSaid(v).text }));

let thin = open('graphic', 'A poster for “Spring Fair”');
const thinQ = thin.discovery?.current;
ok('a thin brief: the first creative question is how it should feel — moods drawn for it, each the engine’s own qualities with colours, type and forms', thin.pending === 'discover' && thinQ?.kind === 'vibe' && thinQ.vibes.length >= 3 && thinQ.vibes.every((x) => x.qualities.every((q) => S.QUALITIES.some((y) => y.id === q)) && /^#[0-9a-f]{6}$/.test(x.palette.ground) && S.TYPE_CHARACTERS.includes(x.character) && x.form), J(thinQ));
ok('…the moods differ from each other (never four of the same)', new Set(thinQ.vibes.map((x) => x.qualities.join('+'))).size === thinQ.vibes.length && new Set(thinQ.vibes.map((x) => x.name)).size === thinQ.vibes.length, J(thinQ.vibes.map((x) => x.name)));
t = reply(thin, 'warm, a bit retro');
ok('answered in a few words: the feel kept (as the engine’s qualities, and as personality words)', t.st.answers['g.vibe']?.values.includes('warm') && t.st.answers['g.vibe']?.values.includes('retro') && t.st.answers['g.personality']?.values.includes('warm'), J({ v: t.st.answers['g.vibe'], p: t.st.answers['g.personality'] }));
ok('…then its colours, palettes drawn for the feel just chosen', t.move.kind === 'discover' && t.move.question.kind === 'colour' && t.move.question.palettes.length >= 3 && /feel you chose/.test(t.move.question.text), J(t.move.question?.text));
const palPick = t.move.question.palettes[1];
t = S.chooseOption(t.st, palPick.id, {}, NOW + 40);
keep(t.st);
ok('a palette tapped: recorded as the person’s, said back, and the work is made (two creative questions, never all three)', t.move.kind === 'create' && t.st.answers['g.palette']?.fields?.accent === palPick.accent && t.st.answers['g.palette']?.source === 'person' && t.st.transcript.at(-2).from === 'person' && t.st.transcript.at(-2).text === palPick.name && (t.st.discovery?.asked ?? []).filter((d) => ['vibe', 'colour', 'type'].includes(d)).length === 2, J({ move: t.move.kind, pal: t.st.answers['g.palette'], asked: t.st.discovery?.asked }));
ok('…and the engines read it: the tapped palette is the work’s', S.prefsOf(t.st).palette?.accent === palPick.accent && S.prefsOf(t.st).palette?.ground === palPick.ground, J(S.prefsOf(t.st).palette));

const bakery = open('graphic', 'A poster for “Crumb & Co”, our bakery’s opening');
const bakeryVibes = bakery.discovery?.current?.vibes ?? [];
ok('…the moods belong to the subject (a bakery: warm and crafted, never “futuristic” or “professional”)', bakeryVibes.length >= 3 && !bakeryVibes.some((x) => x.qualities.includes('futuristic') || x.qualities.includes('corporate')) && bakeryVibes.some((x) => x.qualities.some((q) => ['warm', 'organic', 'retro', 'alive', 'playful'].includes(q))), J(bakeryVibes.map((x) => [x.name, x.qualities])));
const jazz = open('graphic', 'A poster for “Blue Hour”, a late-night jazz evening');
const jazzVibes = jazz.discovery?.current?.vibes ?? [];
ok('…and another subject gets other moods (a jazz night is not offered the bakery’s)', jazzVibes.length >= 3 && J(jazzVibes.map((x) => x.qualities)) !== J(bakeryVibes.map((x) => x.qualities)), J({ jazz: jazzVibes.map((x) => x.name), bakery: bakeryVibes.map((x) => x.name) }));

// what the director never asks about, and never asks too much
ok('no question is about spacing, kerning, leading or a grid as such', !SAID.some((x) => /\b(spacing|kerning|leading|grid)\b/i.test(x) && /\?/.test(x)), J(SAID.filter((x) => /spacing|kerning|leading|grid/i.test(x))));

// an optional question: asked once, skippable, never again
let o = open('graphic', 'A poster for “Open Day”');
ok('a poster with only its words: how it should feel is asked (optional)', o.pending === 'discover' && o.discovery?.current?.kind === 'vibe');
t = reply(o, 'skip');
o = t.st;
ok('skipped: “I’ll decide that”, and the next question worth asking (its colours)', t.move.kind === 'discover' && t.move.question.kind === 'colour' && /I’ll decide that/.test(lastSaid(o).text) && o.answers['g.vibe']?.skipped === true, lastSaid(o).text);
t = reply(o, 'skip');
o = t.st;
ok('skipped again: the work is made', t.move.kind === 'create' && /I’ll decide that/.test(lastSaid(o).text) && o.answers['g.palette']?.skipped === true, lastSaid(o).text);
ok('…never asked again', S.nextMove({ ...o, answers: { ...o.answers, 'g.vibe': undefined } }).kind === 'create');
ok('…and the conversation is ready to make it (a reload picks it up)', S.readyToMake(o));
const waiting = S.addReference(open('graphic', 'A poster for “Open Day”'), S.referenceOf({ url: 'https://larkfield.example/', host: 'larkfield.example', title: '', colours: ['#f6f1e7', '#2b2118', '#b4532a'], fonts: [], notes: [] }, NOW), NOW);
ok('a question waiting is still waiting after a site is read (not ready to make)', !S.readyToMake(waiting) && waiting.pending === 'discover');
let o2 = open('graphic', 'A poster for “Open Day”');
t = reply(o2, 'make it now');
ok('“make it now” instead of answering: made, the rest left to SocriaUX (said so)', t.move.kind === 'create' && /I’ll decide whatever you left open/.test(lastSaid(t.st).text) && !t.st.pending, lastSaid(t.st).text);
t = reply(open('graphic', 'A poster for “Open Day”'), 'Surprise me');
ok('“surprise me”: made, everything open left to SocriaUX', t.move.kind === 'create' && /Leaving the rest to me/.test(lastSaid(t.st).text), lastSaid(t.st).text);

// a required question cannot be skipped, and "make it now" leaves only what cannot be a gap
let needName = open('logo', 'A logo for a coffee roastery');
ok('a logo without its name: the name is asked (the subject is already known, so not that)', needName.pending === 'name' && !(needName.discovery?.asked ?? []).includes('about'), J({ pending: needName.pending, asked: needName.asked }));
t = reply(needName, 'skip');
ok('…it cannot be skipped: said kindly, asked again', t.move.kind === 'ask' && /can’t make it without that/.test(lastSaid(t.st).text));
t = reply(needName, 'just make it');
ok('…and “make it now” still needs it: a logo means nothing without its name', t.move.kind === 'ask' && t.move.question.topic === 'name' && /I need one thing before I can make it/.test(lastSaid(t.st).text), lastSaid(t.st).text);
t = reply(t.st, 'It’s called Halden');
ok('the name, read from a sentence, set exactly', t.st.answers['l.name']?.fields?.name === 'Halden' && t.move.kind === 'create', J(t.st.answers['l.name']));

// gaps left as marked placeholders when the person asks to just make it
let gap = open('graphic', 'a poster for the open day');
ok('a poster without its words asks for them', gap.pending === 'words' || gap.pending === 'kind', gap.pending);
t = reply(gap, 'Make it now');
gap = t.st;
ok('“make it now”: the words left as a marked gap, in brackets, from what it is about', t.move.kind === 'create' && /^\[.+\]$/.test(gap.answers['g.words']?.fields?.headline ?? '') && gap.answers['g.words'].source === 'socria', J(gap.answers['g.words']));
ok('…shown in the brief as yours to fill in', S.briefLines(gap).some((l) => l.source === 'gap'), J(S.briefLines(gap)));
ok('…and the work can begin with the gap in place', S.startProject({ ...S.makeProject('create', 'Untitled graphic', NOW), medium: 'graphic' }, gap, { now: NOW }).ok);

// a reply that answers nothing is asked again, said another way; a reply that changes something else says so
let w0 = open('logo', 'A logo for a coffee roastery');
t = reply(w0, 'hmm');
ok('a reply that is plainly not a name is still taken as one when short (the person’s words win)', t.st.answers['l.name']?.fields?.name === 'hmm');
let f0 = open('graphic', 'A poster for “Open Day”');
t = reply(f0, 'calm and quiet, a bit like a Swiss poster');
ok('a feel answered in the person’s words: the feel, and the look they named', t.st.answers['g.personality']?.values.includes('calm') && /swiss/i.test(t.st.answers['g.look']?.text ?? ''), J({ p: t.st.answers['g.personality'], l: t.st.answers['g.look'] }));
t = reply(open('graphic', 'A poster for “Open Day”'), 'use #f4f1e8, #20201b and #5e7633');
ok('colours named while the feel is asked: they become the palette, and the feel is still asked (colours are not a feel)', S.prefsOf(t.st).palette?.accent === '#5e7633' && t.st.pending === 'discover' && t.st.discovery?.current?.kind === 'vibe' && !t.st.answers['g.vibe'], J({ pal: S.prefsOf(t.st).palette, pending: t.st.pending, vibe: t.st.answers['g.vibe'] }));

// commands understood in the person's words
const fresh = start('graphic', 'A poster for “Field Lines”');
ok('commands in the person’s words: make it, surprise me, skip, something different, show me some ideas', S.hear(fresh, 'Go ahead').kind === 'make' && S.hear(fresh, 'Surprise me!').kind === 'surprise' && S.hear(fresh, 'not sure').kind === 'skip' && S.hear(fresh, 'something completely different').kind === 'different' && S.hear(fresh, 'Show me others').kind === 'different' && S.hear(fresh, 'Show me some directions').kind === 'looks' && S.hear(fresh, 'a poster about trees').kind === 'words');
let others = open('graphic', 'A poster for “Open Day”');
const firstMoods = others.discovery.current.vibes.map((x) => x.qualities.join('+'));
t = reply(others, 'Show me others');
const nextMoods = t.st.discovery?.current?.vibes?.map((x) => x.qualities.join('+')) ?? [];
ok('“show me others”: the same question with other options, kept apart from those offered', t.move.kind === 'discover' && t.move.question.kind === 'vibe' && nextMoods.length >= 3 && nextMoods.filter((m) => firstMoods.includes(m)).length <= 1 && /some others/i.test(lastSaid(t.st).text), J({ firstMoods, nextMoods }));
ok('“actually, a website instead” changes the kind', S.hear(fresh, 'Actually I need a website instead').kind === 'switch' && S.hear(fresh, 'Actually I need a website instead').mode === 'website');
t = reply(open('graphic', 'A poster for “Field Lines”, warm and quiet'), 'Actually, make it a website instead');
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
const calmSite = S.respond(open('website', 'A website for “Mira Studio”, a ceramics studio'), 'skip', {}, { now: NOW + 1 }).st;
const vibeSite = S.chooseOption(open('website', 'A website for “Mira Studio”, a ceramics studio, where people can book a workshop'), 'vibe-0', {}, NOW + 1).st;
ok('a mood chosen in the conversation reaches the website engine: its colours hold the look drawn', !!vibeSite.answers['w.vibe'] && S.websiteSystems(vibeSite)[0].tokens.colors.background === S.prefsOf(vibeSite).palette.ground, J({ vibe: vibeSite.answers['w.vibe'], pal: S.prefsOf(vibeSite).palette, sys: S.websiteSystems(vibeSite)[0]?.tokens.colors }));
void calmSite;

let wp = open('website', 'A website for “Mira Studio”');
ok('a website whose purpose is not said: what people should be able to do on it is asked first, with a few suggested answers', wp.pending === 'discover' && wp.discovery?.current?.decides === 'purpose' && wp.discovery.current.options.length >= 2 && wp.discovery.current.options.length <= 4, J(wp.discovery?.current));
t = reply(wp, 'people should be able to book a session and get in touch');
ok('…answered in a sentence: bookings, with a booking calendar and a contact form; then how it should feel', t.st.answers['w.purpose']?.values[0] === 'bookings' && t.st.answers['w.functions']?.values.includes('booking') && t.st.answers['w.functions']?.values.includes('contact') && t.move.kind === 'discover' && t.move.question.kind === 'vibe', J({ p: t.st.answers['w.purpose'], f: t.st.answers['w.functions'], m: t.move.kind }));
const wpo = S.chooseOption(wp, wp.discovery.current.options[0].id, {}, NOW + 2);
ok('…or a suggested answer tapped: read as the person’s own words', !!wpo.st.answers['w.purpose'] && wpo.st.transcript.some((m) => m.from === 'person' && m.text === wp.discovery.current.options[0].words), J(wpo.st.answers['w.purpose']));
let wn = open('website', 'a website for my pottery classes');
ok('a website without its name: what it is called is asked first', wn.pending === 'name', wn.pending);
t = reply(wn, 'Make it now');
ok('…“make it now”: the name left as a marked gap, and the page made', t.move.kind === 'create' && /^\[.+\]$/.test(t.st.answers['w.words']?.fields?.brand ?? ''), J(t.st.answers['w.words']));

// ── a board, a critique, a design system ──
sec('a board, a critique and an import: only what each cannot be made without');
let b = open('board', 'A launch campaign for “Night Market Lisbon”: two posters, three Instagram posts and a website');
ok('materials counted from the words; the objective read (a launch)', b.answers['b.materials']?.numbers?.poster === 2 && b.answers['b.materials']?.numbers?.social === 3 && b.answers['b.materials']?.numbers?.website === 1 && b.answers['b.objective']?.values[0] === 'launch', J(b.answers));
ok('…and only how it should feel is asked (optional), since nothing about its feel was said', b.pending === 'discover' && b.discovery?.current?.kind === 'vibe' && questions(b).length === 1);
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
let l = open('logo', 'A logo for “Halden”');
ok('a name and nothing else: what it does or stands for is asked first (optional, once)', l.pending === 'discover' && l.discovery?.current?.decides === 'about' && /“Halden”/.test(l.discovery.current.text));
t = reply(l, 'we roast coffee in small batches, by hand');
ok('…answered: kept in the person’s words', /roast coffee/.test(t.st.answers['l.about']?.text ?? ''), J(t.st.answers['l.about']));
const typeQ = t.move.question;
ok('…then its lettering: pairings of real faces from the library, the body face a text face, each a different personality', t.move.kind === 'discover' && typeQ.kind === 'type' && typeQ.faces.length >= 3 && typeQ.faces.every((f) => S.FONTS.some((x) => x.name === f.display) && S.FONTS.some((x) => x.name === f.body && !x.displayOnly)) && new Set(typeQ.faces.map((f) => f.name)).size === typeQ.faces.length, J(typeQ));
t = S.chooseOption(t.st, typeQ.faces[0].id, {}, NOW + 30);
keep(t.st);
ok('a pairing tapped: the faces recorded, and the engines read them', t.st.answers['l.type']?.fields?.display === typeQ.faces[0].display && S.prefsOf(t.st).faces?.display === typeQ.faces[0].display && S.prefsOf(t.st).faces?.body === typeQ.faces[0].body, J(S.prefsOf(t.st).faces));
ok('…then its colours (a logo: lettering first, then colour, never the third visual question)', t.move.kind === 'discover' && t.move.question.kind === 'colour', J(t.move.kind));
t = reply(t.st, 'surprise me');
ok('“surprise me” on the last question: the concepts are made', t.move.kind === 'create', J(t.move.kind));
const lw = S.logoWordsOf(t.st);
ok('the logo brief carries the name and what it stands for, in words the logo engine reads', /“Halden”/.test(lw.words) && /roast/.test(lw.words), lw.words);
const lb = S.logoBriefOfGraphic(S.logoBriefOf(t.st));
ok('…and the logo engine reads them: the name exactly', lb.name === 'Halden', J({ name: lb.name }));
const concepts = S.exploreLogo(lb, { count: 3, seed: 1 });
ok('concepts are constructed for it (no library)', concepts.length >= 3);

// ── pictures the person brings ──
sec('pictures: placed in the design, or used for their look only — asked only when it matters');
let pics = open('graphic', 'A poster for “Open Day”', { attachments: [{ id: 'at1', name: 'pour.jpg', kind: 'image', upload: 'up_1', width: 1200, height: 900, swatches: ['#f4efe6', '#2b1d14', '#c2410c'] }] });
ok('a picture brought: whether to place it or learn from it is the first question', pics.pending === 'discover' && pics.discovery?.current?.decides === 'pictures' && pics.discovery.current.options.length === 2, pics.pending);
t = reply(pics, 'just take its look, the colours');
ok('“just its look”: recorded, and the work is made (its look gives the colours and the mood: nothing more to ask)', t.st.answers['g.pictures']?.values[0] === 'look' && t.move.kind === 'create', J({ a: t.st.answers['g.pictures'], move: t.move.kind }));
const pl = S.prefsOf(t.st);
ok('…its colours become the palette: the lightest the ground, the darkest the ink, the most saturated the accent', pl.palette?.ground === '#f4efe6' && pl.palette?.ink === '#2b1d14' && pl.palette?.accent === '#c2410c', J(pl.palette));
const placed = reply(pics, 'place it in the design').st;
ok('“place it”: recorded, and its colours are not taken for the palette', placed.answers['g.pictures']?.values[0] === 'place' && S.prefsOf(placed).palette === null, J(S.prefsOf(placed).palette));
ok('a poster with no picture of its own is never asked about pictures', !(open('graphic', 'A poster for “Open Day”').discovery?.asked ?? []).includes('pictures'));

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
ok('what, words, and what was left to SocriaUX', bl[0].label === 'What' && bl.some((x) => x.label === 'Words' && /Open Day/.test(x.value) && x.source === 'words') && bl.some((x) => x.label === 'Left to SocriaUX' && /the feel/.test(x.value)), J(bl));

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

// ── creative questions: generated, never what is known, never too many ──
sec('discovery: never what the brief says, never all three visual questions, at most three in all');
const BRIEFS = [
  ['graphic', 'A poster for a jazz night'],
  ['graphic', 'A poster for “Blue Hour”'],
  ['graphic', 'A poster for “Blue Hour”, warm and smoky'],
  ['graphic', 'A poster for “Blue Hour” in deep blue and gold'],
  ['graphic', 'A poster for “Blue Hour”, set in Fraunces'],
  ['graphic', 'An Instagram post for my bakery opening'],
  ['graphic', 'A typographic poster for “Type Week”, 3 March'],
  ['logo', 'A logo for “Halden”'],
  ['logo', 'A logo for “Halden”, a coffee roastery'],
  ['logo', 'A logo for “Halden”, a coffee roastery, in Fraunces'],
  ['website', 'A website for “Mira Studio”'],
  ['website', 'A website for my pottery studio called “Kiln”'],
  ['board', 'A launch campaign for “Night Market”: two posters and a website'],
];
const walk = (mode, prompt, answer = 'skip') => {
  let st = open(mode, prompt);
  const seen = [];
  for (let i = 0; i < 12 && st.pending; i++) {
    if (st.pending === 'discover') seen.push({ decides: st.discovery.current.decides, kind: st.discovery.current.kind, known: S.knownOf({ ...st, discovery: { asked: [] } }) });
    st = reply(st, st.pending === 'discover' ? answer : st.pending === 'words' ? '“Blue Hour”' : st.pending === 'name' ? 'Halden' : 'skip').st;
  }
  return { st, seen };
};
for (const [mode, prompt] of BRIEFS) {
  const { st, seen } = walk(mode, prompt);
  const visual = seen.filter((x) => ['colour', 'type', 'vibe'].includes(x.kind));
  ok(`“${prompt}”: at most three creative questions, at most two visual, each asked once, then the work`, seen.length <= 3 && visual.length <= 2 && new Set(seen.map((x) => x.decides)).size === seen.length && !st.pending && S.nextMove(st).kind === 'create', J(seen.map((x) => x.decides)));
}
const asksAbout = (mode, prompt) => walk(mode, prompt).seen.map((x) => x.decides);
ok('a feel in the words: no visual questions (its colours and lettering follow from it)', asksAbout('graphic', 'A poster for “Blue Hour”, warm and smoky').length === 0 && asksAbout('logo', 'A logo for “Halden”, a small coffee roastery, warm and crafted').length === 0, J([asksAbout('graphic', 'A poster for “Blue Hour”, warm and smoky'), asksAbout('logo', 'A logo for “Halden”, a small coffee roastery, warm and crafted')]));
ok('colours in the words: never asked about colours', !asksAbout('graphic', 'A poster for “Blue Hour” in deep blue and gold').includes('colour'), J(asksAbout('graphic', 'A poster for “Blue Hour” in deep blue and gold')));
ok('a typeface named: never asked about lettering', !asksAbout('logo', 'A logo for “Halden”, a coffee roastery, in Fraunces').includes('type') && !asksAbout('graphic', 'A poster for “Blue Hour”, set in Fraunces').includes('type'), J(asksAbout('logo', 'A logo for “Halden”, a coffee roastery, in Fraunces')));
ok('a subject named: a logo is not asked what it stands for', !asksAbout('logo', 'A logo for “Halden”, a coffee roastery').includes('about'), J(asksAbout('logo', 'A logo for “Halden”, a coffee roastery')));
ok('a poster is asked about its lettering only when its words make the lettering matter', asksAbout('graphic', 'A typographic poster for “Type Week”, 3 March').length <= 1 && !asksAbout('graphic', 'A poster for “Blue Hour”').includes('type'), J([asksAbout('graphic', 'A typographic poster for “Type Week”, 3 March'), asksAbout('graphic', 'A poster for “Blue Hour”')]));
ok('made in a design system: never asked about mood, colours or lettering (the system’s identity decides)', walk('graphic', 'A poster for “Blue Hour”').seen.length > 0 && S.creativeNeeds({ ...open('graphic', 'A poster for “Blue Hour”', { systemId: 'dsys_abcd1234' }), discovery: undefined }).length === 0 && S.visualBudget(S.emptyStudio('logo', 'A logo for “Halden”', { now: NOW, systemId: 'dsys_abcd1234' })) === 0);
ok('answering one question does not take away the next the brief left room for (the budget is the opening brief’s)', (() => {
  let st = open('graphic', 'A poster for “Blue Hour”');
  st = S.chooseOption(st, st.discovery.current.vibes[0].id, {}, NOW + 50).st;
  return st.pending === 'discover' && st.discovery.current.kind === 'colour' && st.discovery.budget === 2;
})());

sec('discovery: answers in the person’s own words');
const colourQ = () => {
  const st = open('graphic', 'A poster for “Blue Hour”');
  return S.skipDiscovery(st, NOW + 1).discovery ? S.respond(st, 'skip', {}, { now: NOW + 1 }).st : st;
};
let cq = colourQ();
ok('(a colour question is waiting)', cq.pending === 'discover' && cq.discovery.current.kind === 'colour');
let r1 = S.respond(cq, '#c2410c', {}, { now: NOW + 2 }).st;
ok('one hex colour: the accent, on a ground and ink that let it read', S.prefsOf(r1).palette?.accent === '#c2410c' && S.contrastRatio(S.prefsOf(r1).palette.ink, S.prefsOf(r1).palette.ground) >= 4.5, J(S.prefsOf(r1).palette));
r1 = S.respond(cq, 'deep navy with a mustard accent', {}, { now: NOW + 2 }).st;
ok('colours named in words become the palette', !!S.prefsOf(r1).palette && r1.answers['g.palette']?.source === 'person', J(r1.answers['g.palette']));
r1 = S.respond(cq, 'earthy and a bit muted', {}, { now: NOW + 2 }).st;
ok('a way of colouring described: a palette made that way, the words kept', !!S.prefsOf(r1).palette && /earthy/.test(r1.answers['g.palette']?.text ?? ''), J(r1.answers['g.palette']));
r1 = S.respond(cq, 'Use #2e5e4e', {}, { now: NOW + 2 }).st;
ok('a colour of their own picked (“Use #2e5e4e”): the accent', S.prefsOf(r1).palette?.accent === '#2e5e4e', J(S.prefsOf(r1).palette));
let tq = open('logo', 'A logo for “Halden”, a coffee roastery');
ok('(a lettering question is waiting)', tq.pending === 'discover' && tq.discovery.current.kind === 'type');
let r2 = S.respond(tq, 'Fraunces with Inter', {}, { now: NOW + 3 }).st;
ok('typefaces named: those faces, exactly', S.prefsOf(r2).faces?.display === 'Fraunces' && S.prefsOf(r2).faces?.body === 'Inter', J(S.prefsOf(r2).faces));
r2 = S.respond(tq, 'something geometric and modern', {}, { now: NOW + 3 }).st;
ok('a style of letter described: a real pairing in that character', !!S.prefsOf(r2).faces && S.FONTS.some((f) => f.name === S.prefsOf(r2).faces.display) && r2.answers['l.type']?.fields?.name, J(r2.answers['l.type']));
let vq = open('graphic', 'A poster for “Blue Hour”');
let r3 = S.respond(vq, 'moody and cinematic', {}, { now: NOW + 4 }).st;
ok('a feel in their words: the engine’s qualities for it, kept as the vibe', r3.answers['g.vibe']?.values.includes('dramatic') && /moody/i.test(r3.answers['g.vibe']?.fields?.name ?? ''), J(r3.answers['g.vibe']));
r3 = S.respond(vq, 'like a cloudy sky', {}, { now: NOW + 4 }).st;
ok('a world named for the feel: the theme it is', r3.answers['g.vibe']?.fields?.theme === 'cloud', J(r3.answers['g.vibe']));

const pointed = S.respond(open('website', 'A website for “Mira Studio”'), 'something like larkfield.studio, or like nowhere.design', {}, { now: NOW + 5 });
ok('a reply that only points to sites answers nothing: the sites are read, the question goes on waiting, and their addresses never become the brief', pointed.research.length === 2 && pointed.st.pending === 'discover' && pointed.st.discovery?.current?.decides === 'purpose' && !/larkfield/.test(pointed.st.prompt) && S.onlyPointsElsewhere('something like larkfield.studio, or like nowhere.design') && !S.onlyPointsElsewhere('we take bookings, like larkfield.studio does'), J({ pending: pointed.st.pending, q: pointed.st.discovery?.current?.decides, prompt: pointed.st.prompt }));
const coffeeType = S.respond(open('logo', 'A logo for a coffee roastery'), 'It’s called Halden', {}, { now: NOW + 6 }).st;
const coffeeColours = S.chooseOption(coffeeType, coffeeType.discovery.current.faces[0].id, {}, NOW + 7).move.question;
ok('a subject whose own colours are close (a coffee roastery’s browns) still gets real alternatives to choose from', coffeeColours?.kind === 'colour' && coffeeColours.palettes.length >= 3 && new Set(coffeeColours.palettes.map((x) => x.accent)).size === coffeeColours.palettes.length, J(coffeeColours?.palettes?.map((x) => [x.name, x.accent])));

sec('discovery: options held to their shape');
const shapes = ['A poster for a jazz night', 'An Instagram post for my bakery opening', 'A poster for “Field Lines”, a technology festival'].map((pr) => S.respond(open('graphic', pr), 'skip', {}, { now: NOW + 1 }).st).map((st) => st.pending === 'discover' ? st : S.respond(st, '“Blue Hour”', {}, { now: NOW + 2 }).st);
const pals = shapes.flatMap((st) => st.discovery?.current?.palettes ?? S.paletteChoices(st));
ok('every palette reads: its ink at least 4.5:1 on its ground, its accent apart from the ground', pals.length >= 6 && pals.every((p) => S.contrastRatio(p.ink, p.ground) >= 4.5 && S.contrastRatio(p.accent, p.ground) >= 1.6 && [p.ground, p.ink, p.accent, ...p.support].every((c) => /^#[0-9a-f]{6}$/.test(c))), J(pals.filter((p) => S.contrastRatio(p.ink, p.ground) < 4.5)));
ok('palettes are named for what they are and say how their colours relate', pals.every((p) => p.name.length > 3 && /accent/.test(p.note)), J(pals.map((p) => [p.name, p.note])));
ok('palettes for different subjects differ', J(S.paletteChoices(open('graphic', 'A poster for a jazz night')).map((p) => p.accent)) !== J(S.paletteChoices(open('graphic', 'An Instagram post for my bakery opening')).map((p) => p.accent)));
const faceSets = [S.typeChoices(open('logo', 'A logo for “Halden”, a coffee roastery')), S.typeChoices(open('logo', 'A logo for “Orbit”, a space science lab')), S.typeChoices(open('graphic', 'A typographic poster for “Type Week”'))];
ok('every pairing is from the font library, its body face a text face, its weight one the face has', faceSets.flat().every((f) => { const d = S.FONTS.find((x) => x.name === f.display); const bo = S.FONTS.find((x) => x.name === f.body); return d && bo && !bo.displayOnly && f.weight >= 100 && f.weight <= 900; }), J(faceSets));
ok('pairings in one question are different personalities', faceSets.every((xs) => new Set(xs.map((x) => x.name)).size === xs.length && xs.length >= 2), J(faceSets.map((xs) => xs.map((x) => x.name))));
const moods = S.vibeChoices(open('graphic', 'A poster for “Blue Hour”, a cloud-themed evening'));
ok('a world the words name leads the moods, with its own colours and forms', moods[0]?.theme === 'cloud' && moods[0].form === 'cloud', J(moods.map((x) => [x.name, x.theme, x.form])));
ok('moods are named in plain adjectives, never in comparatives', moods.concat(bakeryVibes, jazzVibes).every((x) => !/\b(darker|lighter|warmer|cooler|more)\b/i.test(x.name)), J(moods.concat(bakeryVibes).map((x) => x.name)));
const preview = S.vibePreviewDoc(moods[1] ?? moods[0], 'Blue Hour', 3);
const previewSvg = S.renderArtboard(preview, preview.artboards[0], { idPrefix: 'vp-' });
ok('a mood is drawn small by the engine: its ground, its forms, the brief’s own words in its type', /<svg/.test(previewSvg) && previewSvg.includes('Blue Hour') && preview.artboards[0].children.some((n) => n.role === 'motif') && preview.artboards[0].background === (moods[1] ?? moods[0]).palette.ground, previewSvg.slice(0, 300));

sec('discovery: what the model writes is held to its shape and to the conversation’s rules');
const ctxSt = open('graphic', 'A poster for “Blue Hour”');
const ctx = S.questionContextOf(ctxSt);
ok('the conversation as the model reads it: the brief, what is known, the reader’s question first among what is open, the budget', ctx && ctx.kind === 'poster' && ctx.brief.includes('Blue Hour') && ctx.open[0] === 'vibe' && ctx.remaining === 3 && ctx.visualLeft === 2 && ctx.asked.length === 0 && !ctx.known.vibe, J(ctx));
ok('…never for a critique or an import', S.questionContextOf(cAtt) === null && S.questionContextOf(sys) === null);
const back2 = S.normalizeQuestionContext(JSON.parse(J({ ...ctx, remaining: 99, visualLeft: 9, brief: ctx.brief + '\u0000' })));
ok('a context from the browser is held to its shape: the budget never raised, nothing that is not text', back2.remaining === 3 && back2.visualLeft === 2 && !back2.brief.includes('\u0000') && S.normalizeQuestionContext({ mode: 'critique', brief: 'x' }) === null && S.normalizeQuestionContext({ mode: 'graphic', brief: '' }) === null, J(back2));
const sysText = S.questionsSystem();
ok('the model is told every face in the library and the engine’s vocabulary', S.FONTS.every((f) => sysText.includes(f.name)) && S.THEMES.every((t) => sysText.includes(t.id)) && /never all three/i.test(sysText));
ok('…and what is known, asked and allowed', /ALREADY KNOWN/.test(S.questionsUser(ctx)) && /visual questions still allowed: 2/.test(S.questionsUser(ctx)));
const qSchema = S.STUDIO_QUESTION_SCHEMA;
const faceEnum = qSchema.properties.question.anyOf[0].properties.faces.anyOf[0].items.properties.display.enum;
const bodyEnum = qSchema.properties.question.anyOf[0].properties.faces.anyOf[0].items.properties.body.enum;
ok('the strict schema allows only faces in the library (and only text faces for reading)', faceEnum.length === S.FONTS.length && bodyEnum.every((n) => !S.FONTS.find((f) => f.name === n).displayOnly) && bodyEnum.length < faceEnum.length);
const modelPalettes = { ready: false, question: { kind: 'colour', decides: 'colour', text: 'Which colours feel like a late jazz set to you?', why: null, palettes: [{ name: 'Smoke and brass', note: 'brass on smoke', ground: '#1c1a17', ink: '#1d1d1b', accent: '#c8a24a', support: ['#5a4a3a', 'nope'] }, { name: 'Bad', note: '', ground: 'red', ink: '#000000', accent: '#ffffff', support: [] }, { name: 'Ink and cobalt', note: '', ground: '#f4f1ea', ink: '#141414', accent: '#2a4bd7', support: [] }], faces: null, vibes: null, options: null } };
const nq = S.normalizeQuestionAnswer(modelPalettes, ctx);
ok('a model palette that is not colours is dropped; ink that would not read is made to read', nq.question?.kind === 'colour' && nq.question.palettes.length === 2 && S.contrastRatio(nq.question.palettes[0].ink, nq.question.palettes[0].ground) >= 4.5 && J(nq.question.palettes[0].support) === J(['#5a4a3a']) && nq.question.by === 'model', J(nq));
const modelFaces = { ready: false, question: { kind: 'type', decides: 'type', text: 'How should “Blue Hour” be lettered?', why: null, palettes: null, faces: [{ name: 'Smoky serif', note: '', display: 'Fraunces', body: 'Inter', character: null, weight: 600, case: null }, { name: 'Invented', note: '', display: 'Comic Sans MS', body: 'Inter', character: null, weight: 400, case: null }, { name: 'Display body', note: '', display: 'Inter', body: S.FONTS.find((f) => f.displayOnly)?.name ?? 'X', character: null, weight: 400, case: null }], vibes: null, options: null } };
ok('a face outside the library, or a display face set for reading, is dropped — and fewer than two left means no question', S.normalizeQuestionAnswer(modelFaces, ctx).question === null && S.normalizeDiscoveryQuestion({ ...modelFaces.question, faces: [modelFaces.question.faces[0], { ...modelFaces.question.faces[0], display: 'Inter', name: 'Plain' }] })?.faces?.length === 2);
const modelVibes = { ready: false, question: { kind: 'vibe', decides: 'vibe', text: 'How should it feel?', why: null, palettes: null, faces: null, vibes: [{ name: 'Smoky', note: 'low light', qualities: ['dramatic', 'nonsense'], theme: null, character: 'editorial', palette: { ground: '#141210', ink: '#f2ede4', accent: '#c8a24a' }, form: 'orb' }, { name: 'Bright', note: '', qualities: ['playful'], theme: null, character: null, palette: { ground: 'x', ink: 'y', accent: 'z' }, form: null }, { name: 'Nothing', note: '', qualities: ['made-up'], theme: null, character: null, palette: { ground: '#ffffff', ink: '#000000', accent: '#ff0000' }, form: null }], options: null } };
const nv = S.normalizeQuestionAnswer(modelVibes, ctx).question;
ok('model moods keep only the engine’s qualities, their own colours when they are colours; a mood with none is dropped', nv?.vibes?.length === 2 && J(nv.vibes[0].qualities) === J(['dramatic']) && nv.vibes[0].palette.ground === '#141210' && nv.vibes[0].character === 'editorial' && /^#[0-9a-f]{6}$/.test(nv.vibes[1].palette.ground), J(nv?.vibes));
const asked1 = S.questionContextOf(S.respond(ctxSt, 'skip', {}, { now: NOW + 1 }).st);
ok('a question about what was asked before is refused (the reader’s stands)', S.normalizeQuestionAnswer(modelVibes, asked1).question === null && asked1.asked[0].decides === 'vibe' && /skipped/.test(asked1.asked[0].answer), J(asked1.asked));
const knownCtx = S.questionContextOf(open('graphic', 'A poster for “Blue Hour” in deep blue and gold'));
ok('a question about what the brief already says is refused', !knownCtx || S.normalizeQuestionAnswer(modelPalettes, knownCtx).question === null, J(knownCtx));
ok('no question past the budget: a visual one when none is left is refused, and none at all means ready', S.normalizeQuestionAnswer(modelVibes, { ...ctx, visualLeft: 0 }).question === null && S.normalizeQuestionAnswer(modelVibes, { ...ctx, remaining: 0 }).ready === true);
ok('a site’s purpose is never asked of a poster, a logo’s meaning never of a site', S.normalizeQuestionAnswer({ ready: false, question: { kind: 'text', decides: 'purpose', text: 'What should people do on it?', why: null, palettes: null, faces: null, vibes: null, options: [{ label: 'Book', words: 'Book' }] } }, ctx).question === null);
ok('the model may write a question of its own about the content (who it is for), with suggested answers', S.normalizeQuestionAnswer({ ready: false, question: { kind: 'text', decides: 'audience', text: 'Who is the night for — regulars, or people new to jazz?', why: null, palettes: null, faces: null, vibes: null, options: [{ label: 'Regulars', words: 'For regulars who know the club' }, { label: 'Newcomers', words: 'For people new to jazz' }] } }, ctx).question?.decides === 'audience');
ok('“ready”: the brief is enough', S.normalizeQuestionAnswer({ ready: true, question: null }, ctx).ready === true);

sec('discovery: the model’s question in place of the reader’s, or the work at once');
const readerQ = ctxSt.discovery.current;
const rethought = S.rethinkQuestion(ctxSt, readerQ.id, nq.question);
ok('the model’s question takes the reader’s place: the same turn, its own words and options', rethought.discovery.current.by === 'model' && rethought.discovery.current.kind === 'colour' && rethought.transcript.length === ctxSt.transcript.length && lastSaid(rethought).text.endsWith(nq.question.text) && rethought.discovery.asked.includes('colour') && !rethought.discovery.asked.includes('vibe'), J({ asked: rethought.discovery.asked, said: lastSaid(rethought).text }));
ok('…its options can be tapped like the reader’s', S.chooseOption(rethought, nq.question.palettes[1].id, {}, NOW + 9).st.answers['g.palette']?.fields?.accent === nq.question.palettes[1].accent);
ok('…and nothing changes when the reader’s question was answered in the meantime', S.rethinkQuestion(S.respond(ctxSt, 'warm', {}, { now: NOW + 1 }).st, readerQ.id, nq.question).discovery?.current?.id !== nq.question.id);
const enough = S.enoughToMake(ctxSt, readerQ.id);
ok('“ready”: the turn says the work is being made, nothing more is asked, and a reload picks it up', !enough.pending && lastSaid(enough).stage === 'making' && /That’s enough to begin/.test(lastSaid(enough).text) && enough.discovery.done === true && S.readyToMake(enough) && S.creativeNeeds(enough).length === 0, J(lastSaid(enough)));
const reloaded = S.normalizeStudio(JSON.parse(J(rethought)));
ok('a question waiting survives a reload: its options keep their ids (a tap means the same option)', reloaded.pending === 'discover' && reloaded.discovery.current.id === rethought.discovery.current.id && J(reloaded.discovery.current.palettes.map((x) => x.id)) === J(rethought.discovery.current.palettes.map((x) => x.id)) && S.chooseOption(reloaded, rethought.discovery.current.palettes[0].id, {}, NOW + 9).st.answers['g.palette']?.fields?.accent === rethought.discovery.current.palettes[0].accent, J(reloaded.discovery));
const reloadedV = S.normalizeStudio(JSON.parse(J(open('graphic', 'A poster for “Open Day”'))));
ok('…a mood offered keeps its own colours and forms through a reload', reloadedV.discovery.current.vibes.every((x) => /^#[0-9a-f]{6}$/.test(x.palette.ground) && x.form) && reloadedV.discovery.budget === 2, J(reloadedV.discovery.current.vibes.map((x) => [x.palette.ground, x.form])));

sec('discovery: the mood chosen is carried into the work');
let mood = open('graphic', 'A poster for “Blue Hour”');
const chosenVibe = mood.discovery.current.vibes[0];
mood = S.chooseOption(mood, chosenVibe.id, {}, NOW + 1).st;
mood = S.respond(mood, 'skip', {}, { now: NOW + 2 }).st;
const mp = S.prefsOf(mood);
ok('its colours and lettering reach the engines as the work’s when nothing more particular was chosen', mp.palette?.ground === chosenVibe.palette.ground && !!mp.faces && mp.vibe?.qualities.join() === chosenVibe.qualities.join(), J({ pal: mp.palette, faces: mp.faces, vibe: mp.vibe }));
const plan = S.vibeRealisation(mood);
ok('its qualities are asked of the creative executor as a plan, keeping the palette and faces it already gave', plan && plan.changes.some((c) => c.decision === 'mood' && J(c.qualities) === J(chosenVibe.qualities)) && plan.keep.includes('palette') && plan.keep.includes('type') && plan.keep.includes('words'), J(plan));
// a mood whose qualities ask for forms and depth (not only colours and faces, which the composition already has)
let formed = S.respond(open('graphic', 'A poster for “Blue Hour”'), 'playful and dreamy', {}, { now: NOW + 3 }).st;
formed = S.respond(formed, 'skip', {}, { now: NOW + 4 }).st;
const fplan = S.vibeRealisation(formed);
ok('a mood that asks for forms and depth is a plan of its own', fplan && fplan.changes.some((c) => c.decision === 'mood'), J(fplan));
ok('no mood chosen: nothing to carry', S.vibeRealisation(open('graphic', 'A poster for “Blue Hour”, warm and smoky')) === null);

// ── voice ──
sec('voice: second person, no emoji, never a questionnaire');
ok('no emoji anywhere in what SocriaUX says', ![...SAID, ...S.MODES.flatMap((m) => [m.line, m.does, ...m.examples])].some((s) => /\p{Extended_Pictographic}/u.test(s)), SAID.find((s) => /\p{Extended_Pictographic}/u.test(s)));
ok('six modes, each with a line, a workflow and examples', S.MODES.length === 6 && S.MODES.every((m) => m.line && m.does && m.examples.length >= 2));
ok('options are few: never more than three suggestions, or four creative options, at a tap', SAID.length > 20 && [open('graphic', 'a poster'), open('website', 'A website for “Mira Studio”'), open('logo', 'A logo for “Halden”'), open('graphic', 'A poster for “Open Day”')].every((s) => !s.pending || (s.pending === 'discover' ? [s.discovery.current.palettes, s.discovery.current.faces, s.discovery.current.vibes, s.discovery.current.options].every((x) => !x || x.length <= 4) : S.questionFor(s, s.pending).suggestions.length <= 3)));

console.log(`\nstudio: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
