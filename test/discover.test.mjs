// Creative discovery (lib/ux-v0/studio/discover.ts, discover-model.ts, brief.ts): the conversation before a graphic,
// a logo, a campaign or a website is made.
//
// No model is called. The model's answers are written here as it would write them (and badly, where that is the point),
// held to shape by the same code the route and the browser use; the reader that decides when the model cannot be
// reached is run as it is. Each scenario of the brief (A–L) is played through the conversation record and read back.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const S = await import(pathToFileURL(join(here, '.tmp', 'studio-under-test.mjs')).href);

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, typeof x === 'string' ? x.slice(0, 600) : JSON.stringify(x).slice(0, 600))));
const sec = (s) => console.log(`\n=== ${s} ===`);
const J = JSON.stringify;
const NOW = 1_800_000_000_000;

/** A conversation begun as the home begins one: the person's words, kept as the first message. */
const begin = (mode, words, modeBy = 'words') => S.said(S.emptyStudio(mode, words, { now: NOW, modeBy }), { from: 'person', kind: 'prompt', text: words, at: NOW });
const last = (st) => st.transcript[st.transcript.length - 1];
/** The model's answer, in the shape it writes (every field present). */
const brief = (over = {}) => ({ kind: '', purpose: '', audience: '', content: '', feel: '', explicit: [], implied: [], tentative: [], avoid: [], references: [], open: [], clear: [], ...over });
const askAns = (text, over = {}) => ({ action: 'ask', say: over.say ?? '', question: { text, suggestions: over.suggestions ?? [], aid: over.aid ?? null }, mode: over.mode ?? null, brief: brief(over.brief) });
const makeAns = (say, b = {}, mode = null) => ({ action: 'make', say, question: null, mode, brief: brief(b) });
/** One turn with a scripted model answer: the decision held to shape, then carried out. */
const turn = (st, answer) => {
  const c = S.discoverContextOf(st);
  const d = S.normalizeDecision(answer, c) ?? S.readerDecision(st);
  return { st: S.applyDecision(st, d, NOW + st.transcript.length), d };
};
const reply = (st, text) => S.personSays(st, text, { now: NOW + st.transcript.length });

sec('what hands the rest to SocriaUX');
{
  const yes = ['Surprise me. Just make something.', 'You decide.', 'you choose', 'I trust your judgment', 'Honestly, up to you', 'just make it', 'Make it now', 'go ahead', 'whatever you think is best', 'ok, go for it!'];
  const no = ['Make me a poster.', 'Surprise me with the colours but keep it minimal', 'You decide the colours, I want serif type', 'make it more futuristic', 'I want something premium', 'no idea what style'];
  ok('“make it”, “you decide”, “surprise me”, “I trust your judgment” hand it over', yes.every((t) => S.wantsMake(t)), yes.filter((t) => !S.wantsMake(t)));
  ok('…but a request, or a partial hand-over with a preference in it, is not', no.every((t) => !S.wantsMake(t)), no.filter((t) => S.wantsMake(t)));
}

sec('the reader (when the model cannot be reached): only what the work cannot do without');
{
  const a = S.readerDecision(begin('graphic', 'Make me a poster.'));
  ok('A, “make me a poster”: what it is for — never what it should say', a.action === 'ask' && a.ask.text === 'What’s the poster for?' && a.stage === 'purpose', J(a));
  let st = S.applyDecision(begin('graphic', 'Make me a poster.'), a, NOW + 1);
  st = reply(st, 'An underground electronic music event.');
  const a2 = S.readerDecision(st);
  ok('…then it is made; the answer is kept as words, never set as a headline', a2.action === 'make' && a2.brief.content === '' && a2.brief.explicit.includes('An underground electronic music event.'), J(a2.brief));
  const b = S.readerDecision(begin('graphic', 'Create a brutalist editorial poster for a contemporary architecture exhibition, with oversized condensed typography, black and cream colors, asymmetrical composition, and minimal decoration.'));
  ok('B, a detailed brief: made at once, nothing asked', b.action === 'make', J(b));
  const lg = S.readerDecision(begin('logo', 'A logo for a coffee roaster'));
  ok('a logo with no name: its name, exactly as they write it', lg.action === 'ask' && /What’s it called/.test(lg.ask.text) && lg.stage === 'name');
  const lgn = S.readerDecision(begin('logo', 'A logo for a coffee roaster called “Ember & Oak”'));
  ok('…with its name: made', lgn.action === 'make');
  const un = S.readerDecision(begin('graphic', 'something for my bakery', 'unsure'));
  ok('nothing says what it is: what they are making, with three short replies', un.action === 'ask' && un.stage === 'what' && un.ask.suggestions.length === 3, J(un));
  let st2 = S.applyDecision(begin('graphic', 'something for my bakery', 'unsure'), un, NOW + 1);
  st2 = reply(st2, 'a logo, called Crumb');
  const un2 = S.readerDecision(st2);
  ok('…the answer read for the kind of work, then made', un2.mode === 'logo' && un2.action === 'make', J(un2));
  let st3 = begin('graphic', 'A poster');
  for (let i = 0; i < 3; i++) st3 = reply(S.applyDecision(st3, { ...S.readerDecision(st3), action: 'ask', ask: { text: `Question ${i}?`, aid: null, suggestions: [] } }, NOW + i), 'hmm');
  ok('L: never more than two questions from the reader', S.readerDecision(st3).action === 'make');
}

sec('what the model writes, held to shape and to the conversation’s rules');
{
  const st = S.applyDecision(begin('graphic', 'Make me a poster.'), S.readerDecision(begin('graphic', 'Make me a poster.')), NOW + 1);
  const c = S.discoverContextOf(reply(st, 'An underground electronic music event.'));
  ok('the model reads the whole conversation in order, the questions asked and the aids shown', c.conversation.map((m) => m.who).join() === 'person,socria,person' && c.asked === 1 && c.shown.length === 0, J(c));
  const pal = {
    kind: 'palettes',
    sample: null,
    palettes: [
      { name: 'Acid night', note: 'near black with one acid green', colours: ['#0b0b0d', '#e9e6df', '#c6ff3d'] },
      { name: 'Ink on cream, reversed order', note: 'the readable pair found and put first', colours: ['#f4efe4', '#f1e9d8', '#141414', '#c8102e'] },
      { name: 'Grey on grey', note: 'nothing reads', colours: ['#777777', '#7a7a7a', '#7d7d7d'] },
      { name: 'Not colours', note: '', colours: ['red', 'blue', 'green'] },
    ],
    faces: null,
    moods: null,
  };
  const d = S.normalizeDecision(askAns('What kind of colour atmosphere are you imagining?', { aid: pal, suggestions: ['dark'] }), c);
  ok('palettes: only real colours whose ink reads on their ground (two of four kept), each put in order', d.ask.aid.options.length === 2 && d.ask.aid.options.every((p) => S.contrast(p.colours[0], p.colours[1]) >= 4.5), J(d.ask.aid));
  ok('…and no tap-replies beside an aid', d.ask.suggestions.length === 0);
  const faces = { kind: 'type', sample: 'Low Tide', palettes: null, moods: null, faces: [
    { name: 'Tight and loud', note: 'condensed capitals', display: 'Anton', body: 'Inter', weight: 400, upper: true },
    { name: 'Book serif', note: '', display: 'Fraunces', body: 'Instrument Serif', weight: 650, upper: false },
    { name: 'Made up', note: '', display: 'Helvetica Neue', body: 'Inter', weight: null, upper: false },
  ] };
  const dt = S.normalizeDecision(askAns('Should the lettering carry the personality?', { aid: faces }), c);
  ok('type: faces only from the library (an invented one dropped); a display-only face never sets the text — the pairing’s display face does', dt.action === 'ask' && dt.ask.aid?.options.length === 2 && dt.ask.aid.options[1].body === 'Fraunces', J(dt.ask));
  const lone = S.normalizeDecision(askAns('Lettering?', { aid: { ...faces, faces: [faces.faces[0], faces.faces[2]] } }), c);
  ok('…and with only one real pairing left, no aid at all (the question stands)', lone.action === 'ask' && lone.ask.aid === null, J(lone.ask));
  const faces2 = { ...faces, faces: [faces.faces[0], { ...faces.faces[1], body: 'Newsreader' }] };
  const dt2 = S.normalizeDecision(askAns('Should the lettering carry the personality?', { aid: faces2 }), c);
  ok('…two real pairings: shown, the weight rounded to a real one', dt2.ask.aid?.kind === 'type' && dt2.ask.aid.options[1].weight === 700 && dt2.ask.aid.sample === 'Low Tide', J(dt2.ask.aid));
  ok('an aid already shown in this conversation is not shown again', S.normalizeDecision(askAns('Colours?', { aid: pal }), { ...c, shown: ['palettes'] }).ask.aid === null);
  ok('past the question limit, a question becomes the making', S.normalizeDecision(askAns('One more?'), { ...c, asked: 5 }).action === 'make');
  ok('an answer that is not a decision is no decision (the reader decides)', S.normalizeDecision({ action: 'maybe' }, c) === null && S.normalizeDecision('prose', c) === null && S.normalizeDecision(askAns(''), c) === null);
  ok('the work turned out to be another kind: said', S.normalizeDecision(makeAns('A logo, then.', {}, 'logo'), c).mode === 'logo');
  // what was picked from an aid is kept by the conversation, not by the model's memory
  const picked = { ...c, brief: { ...S.emptyBrief('a poster'), chosen: { palette: { name: 'Acid night', note: '', colours: ['#0b0b0d', '#e9e6df', '#c6ff3d'] } } } };
  const kept = S.normalizeDecision(makeAns('Making it.', { kind: 'a poster' }), picked);
  ok('a palette they picked stays in the brief whatever the model returns', kept.brief.chosen.palette?.name === 'Acid night');
  ok('…unless they let it go (“not those colours”)', !S.normalizeDecision(makeAns('Other colours, then.', { clear: ['palette'] }), picked).brief.chosen.palette);
  ok('…and no palettes are offered once colours are picked', S.normalizeDecision(askAns('Colours?', { aid: pal }), picked).ask.aid === null);
  ok('…but never the pick their latest reply just made (a model reading “clear” as “this question is settled” cannot wipe it)', S.normalizeDecision(makeAns('Acid night, then.', { clear: ['palette'] }), { ...picked, justPicked: ['palette'] }).brief.chosen.palette?.name === 'Acid night');
  // the context says what the latest reply picked, from the aid the question before it showed
  let pk = S.said(S.emptyStudio('graphic', 'A gig poster', { now: 1, modeBy: 'words' }), { from: 'person', kind: 'prompt', text: 'A gig poster', at: 1 });
  pk = S.applyDecision(pk, { action: 'ask', say: '', ask: { text: 'Which colours?', aid: S.normalizeAid({ kind: 'palettes', options: pal.palettes }), suggestions: [] }, brief: S.emptyBrief('a poster'), mode: null, by: 'model' }, 2);
  ok('a pick from the aid shown: the context says it was just picked', J(S.discoverContextOf(S.chooseAid(pk, 0, 3)).justPicked) === '["palette"]');
  ok('…a reply in words after an aid picks nothing', J(S.discoverContextOf(S.personSays(pk, 'Something greener', { now: 3 })).justPicked) === '[]');
  ok('…and once something more is said, it is no longer the latest pick', J(S.discoverContextOf(S.personSays(S.chooseAid(pk, 0, 3), 'and make it loud', { now: 4 })).justPicked) === '[]');
  const sys = S.normalizeDecision(askAns('Colours?', { aid: pal }), { ...c, system: 'Halden' });
  ok('in a design system: no palettes or lettering to pick (the system decides them)', sys.ask.aid === null);
  // what the route sent, checked again in the browser
  const routeD = S.normalizeDecision(askAns('What kind of colour atmosphere?', { aid: pal, say: 'A club night.' }), c);
  const revived = S.reviveDecision(JSON.parse(J(routeD)), c);
  ok('the route’s decision, held to shape again in the browser, is the same decision', revived && revived.action === 'ask' && revived.ask.aid.options.length === 2 && revived.say === 'A club night.', J(revived));
  ok('the context the browser sends is held to its shape by the route (a conversation is needed; the mode one of four)', S.normalizeDiscoverContext({ ...c, mode: 'critique' }) === null && S.normalizeDiscoverContext({ ...c, conversation: [] }) === null && S.normalizeDiscoverContext(JSON.parse(J(c)))?.conversation.length === 3);
  ok('the schema lets the model name only library faces', J(S.DISCOVER_SCHEMA.properties.question.anyOf[0].properties.aid.anyOf[0].properties.faces.anyOf[0].items.properties.display.enum) === J(S.FONTS.map((f) => f.name)));
  const sys2 = S.discoverSystem();
  ok('the model is told how to decide, how to ask, the voice, the aids, the brief and the font library', ['Each turn, decide one thing', 'Good questions', 'Never perform enthusiasm', 'Visual aids', 'tentative', 'FONT LIBRARY', 'Fraunces'].every((w) => sys2.includes(w)));
}

sec('a decision carried out on the conversation');
{
  const st = begin('graphic', 'I want something dreamy.');
  const moods = { kind: 'moods', sample: 'Dreamy', palettes: null, faces: null, moods: [
    { name: 'Cloud hush', note: 'pale haze, soft serif, lots of air', colours: ['#eef0f6', '#2a2d3a', '#9fb4ff'], display: 'Cormorant Garamond' },
    { name: 'Neon reverie', note: 'dusk violet, glowing pink, rounded sans', colours: ['#1c1530', '#f4ecff', '#ff6ec7'], display: 'Fraunces' },
  ] };
  const t = turn(st, askAns('Dreamy like drifting and soft, or dreamy like a surreal, late-night haze?', { say: 'Dreamy can go two ways.', aid: moods, brief: { kind: 'something dreamy', feel: 'dreamy', open: ['what it is', 'what it is for'] } }));
  const q = last(t.st);
  ok('F, “dreamy”: one question, the reading said first, two moods to look at', q.from === 'socria' && q.kind === 'question' && /^Dreamy can go two ways\. Dreamy like drifting/.test(q.text) && q.aid?.options.length === 2, J(q));
  const back = S.normalizeStudio(JSON.parse(J(t.st)));
  ok('the question and its aid, and the brief, survive a reload', back.transcript.at(-1).aid?.options[1].name === 'Neon reverie' && back.brief?.feel === 'dreamy');
  ok('it is the person’s turn now (nothing is waiting on SocriaUX)', !S.awaitingTurn(t.st) && !S.makingNow(t.st));
  const picked = S.chooseAid(t.st, 1, NOW + 9);
  ok('a mood picked: said as their reply, kept as their taste', last(picked).from === 'person' && /This one: Neon reverie/.test(last(picked).text) && picked.brief.chosen.mood?.name === 'Neon reverie' && S.awaitingTurn(picked), J(last(picked)));
  ok('an option that is not there picks nothing', S.chooseAid(t.st, 7) === null && S.chooseAid(picked, 0) === null);
  const made = turn(picked, makeAns('Late-night haze it is — making it now.', { kind: 'a poster', feel: 'dreamy, a surreal late-night haze' }));
  ok('then made: said, and the conversation’s last word is that it is being made', S.makingNow(made.st) && /Late-night haze/.test(last(made.st).text) && made.st.brief.chosen.mood?.name === 'Neon reverie');
}

sec('scenarios A–L, through the conversation');
{
  // A — vague: a relevant opening question, then a feel question with moods, then made
  let a = begin('graphic', 'Make me a poster.');
  a = turn(a, askAns('What’s the poster for?', { brief: { kind: 'a poster', open: ['what it is for'] } })).st;
  a = reply(a, 'An underground electronic music event.');
  a = turn(a, askAns('Do you imagine it dark and atmospheric, or more chaotic and experimental?', { say: 'Got it — a club night.', brief: { kind: 'a poster', purpose: 'an underground electronic music event', open: ['how it should feel'] } })).st;
  a = reply(a, 'Definitely chaotic, but still sophisticated.');
  const aEnd = turn(a, makeAns('Chaotic but controlled — making it now.', { kind: 'a poster', purpose: 'an underground electronic music event', feel: 'definitely chaotic, but still sophisticated' }));
  ok('A: two questions, each acknowledged and built on the last answer, then made', S.questionsAsked(aEnd.st) === 2 && S.makingNow(aEnd.st), J(aEnd.st.transcript.map((m) => m.text)));
  const aBrief = S.designBriefOf(aEnd.st);
  ok('A: the designer reads the opening words, the conversation with its questions, and the feel in their words', /In their words: “Make me a poster\.”/.test(aBrief) && /SocriaUX asked: Got it — a club night\. Do you imagine/.test(aBrief) && /They said: Definitely chaotic, but still sophisticated\./.test(aBrief) && /How it should feel, in their words: definitely chaotic, but still sophisticated/.test(aBrief), aBrief);
  ok('A: no words were given, so the designer writes stand-ins and says so — nothing blocks', /No words were given/.test(aBrief));
  // B — detailed: made with no question
  const bWords = 'Create a brutalist editorial poster for a contemporary architecture exhibition, with oversized condensed typography, black and cream colors, asymmetrical composition, and minimal decoration.';
  const b = turn(begin('graphic', bWords), makeAns('Brutalist, black and cream, the type doing the work — making it now.', { kind: 'a brutalist editorial poster', purpose: 'a contemporary architecture exhibition', explicit: ['oversized condensed typography', 'black and cream colors', 'asymmetrical composition', 'minimal decoration'] }));
  ok('B: a detailed brief is made at once', S.questionsAsked(b.st) === 0 && S.makingNow(b.st));
  // C — premium, then an analogy understood
  let c = begin('logo', 'I want to make a premium-looking brand, but I’m not really sure what style I want.');
  c = turn(c, askAns('What should premium feel like for you — quiet and assured, or something with more theatre?', { brief: { kind: 'a brand identity', feel: 'premium', open: ['what premium means here', 'the name'] } })).st;
  c = reply(c, 'Like an old luxury magazine, but futuristic.');
  const cT = turn(c, askAns('What’s it called?', { say: 'So the poise of an old luxury magazine, pushed somewhere futuristic.', brief: { kind: 'a brand identity', feel: 'like an old luxury magazine, but futuristic', open: ['the name'] } }));
  ok('C: the analogy is taken whole into the brief and said back, then the one thing a logo needs', /old luxury magazine, pushed somewhere futuristic/.test(last(cT.st).text) && cT.st.brief.feel === 'like an old luxury magazine, but futuristic');
  // D — surprise me: made with no model at all (the home does this before the conversation opens)
  ok('D: “Surprise me. Just make something.” is made at once, the rest left to SocriaUX', S.wantsMake('Surprise me. Just make something.') && S.makeNow(begin('graphic', 'Surprise me. Just make something.')).action === 'make');
  // G — a paragraph answer understood
  let g = begin('graphic', 'A poster for our community garden');
  g = turn(g, askAns('What should someone feel when they first see it?', { brief: { kind: 'a poster', purpose: 'our community garden' } })).st;
  const story = 'Honestly it started when my grandmother planted tomatoes in the vacant lot behind the laundromat, and now forty families grow food there; I want people to feel that warmth and a bit of rebellion, not a corporate flyer.';
  g = reply(g, story);
  const gT = turn(g, makeAns('Warmth with a streak of rebellion — homemade, never corporate. Making it now.', { kind: 'a poster', purpose: 'our community garden', feel: 'warmth and a bit of rebellion, not a corporate flyer', implied: ['the story of a vacant lot turned into a garden for forty families'], avoid: ['a corporate flyer look'] }));
  ok('G: a long story is read for its meaning, never refused or set as a headline', gT.st.brief.avoid.includes('a corporate flyer look') && gT.st.brief.content === '' && S.designBriefOf(gT.st).includes(story.slice(0, 80)));
  // H — "you decide"
  ok('H: “You decide.” makes it now', S.wantsMake('You decide.'));
  // I — changed preference: the latest wins, the old one goes to avoid
  let i = begin('graphic', 'A playful poster for a children’s book fair');
  i = turn(i, askAns('Who is it really for — the children, or the parents bringing them?', { brief: { kind: 'a poster', purpose: 'a children’s book fair', feel: 'playful' } })).st;
  i = reply(i, 'Actually make it sophisticated and editorial instead.');
  const iT = turn(i, makeAns('Sophisticated and editorial, then — making it now.', { kind: 'a poster', purpose: 'a children’s book fair', feel: 'sophisticated and editorial', avoid: ['playful'] }));
  ok('I: the new preference replaces the old one, which is kept out', iT.st.brief.feel === 'sophisticated and editorial' && iT.st.brief.avoid.includes('playful') && /Avoid:\n- playful/.test(S.designBriefOf(iT.st)));
  // K — an edit to existing work never comes here: the design workspace makes it directly (lib/ux-v0/design/flow.ts)
  ok('K: discovery is only for work not yet made (a started conversation awaits nothing)', !S.awaitingTurn({ ...reply(begin('graphic', 'x'), 'y'), status: 'started' }));
  // L — vague requests do not become endless interviews
  let l = begin('graphic', 'something cool');
  for (let k = 0; k < 6; k++) l = reply(turn(l, askAns(`Question ${k}?`)).st, 'not sure');
  ok('L: after five questions it is made, whatever the model wanted to ask', S.questionsAsked(l) === 5 && turn(l, askAns('A sixth?')).d.action === 'make');
  // E — never a critique or an import
  ok('E: a critique or an import is not discovered (it keeps its own short exchange)', !S.isCreative('critique') && !S.isCreative('system') && !S.awaitingTurn(reply(begin('critique', 'look at this'), 'ok')));
}

sec('the brief, as the designer reads it');
{
  let st = begin('graphic', 'A poster for “Low Tide”, three bands, Saturday 12 April, The Boiler Room');
  st = turn(st, askAns('Should it convey the sound, or create intrigue without explaining too much?', { brief: { kind: 'a gig poster', content: 'Low Tide\nSaturday 12 April\nThe Boiler Room' } })).st;
  st = reply(st, 'Intrigue, but not cold');
  st = S.chooseAid(S.applyDecision(st, S.normalizeDecision(askAns('Colours?', { aid: { kind: 'palettes', sample: null, faces: null, moods: null, palettes: [{ name: 'Tidal', note: 'deep teal and sand', colours: ['#0f2a2e', '#efe6d4', '#e0a458'] }, { name: 'Salt', note: 'white and slate', colours: ['#f5f5f2', '#1f2a30', '#3c7a89'] }] } }), S.discoverContextOf(st)), NOW + 50), 0, NOW + 51);
  const made = turn(st, makeAns('Intriguing, warm underneath — making it now.', { kind: 'a gig poster', content: 'Low Tide\nSaturday 12 April\nThe Boiler Room', feel: 'intrigue, but not cold', tentative: ['a tide line as the image'] }));
  const text = S.designBriefOf(made.st);
  ok('their words to set, exactly; their feel; SocriaUX’s reading marked as not theirs; their pick as taste, not a layout', /Words to set, exactly as given:\nLow Tide\nSaturday 12 April\nThe Boiler Room/.test(text) && /SocriaUX’s own reading, not confirmed by them[^\n]*\n- a tide line as the image/.test(text) && /not a layout to copy[^\n]*\n- Colours they picked \(Tidal\): #0f2a2e, #efe6d4, #e0a458/.test(text), text);
  ok('kept within what the designer’s memory holds', text.length <= 4000);
  const p = S.designFromStudio(S.makeProject('create', 'Untitled design', NOW), made.st, { now: NOW });
  ok('handed to the design workspace: named from its words, a poster format, the brief in its memory', p.ok && p.project.medium === 'design' && p.project.name === 'Low Tide' && p.project.design.kind === 'poster' && p.project.design.memory.brief === text, p.ok ? { name: p.project.name, kind: p.project.design.kind, format: p.project.design.format } : p);
  const lg = S.designFromStudio(S.makeProject('create', 'Untitled design', NOW), S.applyDecision(begin('logo', 'Surprise me — a logo for a bakery'), S.makeNow(begin('logo', 'Surprise me — a logo for a bakery'))), { now: NOW });
  ok('a logo with no name is not refused: the designer invents one and says so (on a logo sheet)', lg.ok && lg.project.design.kind === 'logo' && lg.project.design.format === 'logo-sheet', lg);
}

console.log(`\ndiscover: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
