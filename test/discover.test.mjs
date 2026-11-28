// The spatial creative brief (lib/ux-v0/studio/discover.ts, discover-model.ts, brief.ts): what SocriaUX understands
// before a graphic, a logo, a campaign or a website is made, and how the brief changes as the person shapes it.
//
// No model is called. The model's plans are written here as it would write them (and badly, where that is the point),
// held to shape by the same code the route and the browser use; the reader that plans when the model cannot be reached
// is run as it is. Every change a person can make is applied and read back, and the brief is handed to the designer.

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

/** A brief opened as the home opens one: the idea, kept, and an empty spatial brief waiting for its first plan. */
const open = (mode, words, modeBy = 'words') => ({ ...S.said(S.emptyStudio(mode, words, { now: NOW, modeBy }), { from: 'person', kind: 'prompt', text: words, at: NOW }), space: S.emptySpace() });
/** The model's plan, in the shape it writes (every field present). */
const brief = (over = {}) => ({ kind: '', purpose: '', audience: '', content: '', feel: '', explicit: [], implied: [], tentative: [], avoid: [], references: [], open: [], clear: [], ...over });
const raw = (o = {}) => ({ note: o.note ?? '', ready: !!o.ready, mode: o.mode ?? null, modules: o.modules ?? [], answers: o.answers ?? [], retire: o.retire ?? [], brief: brief(o.brief) });
const m = (id, topic, question, o = {}) => ({ id, topic, question, kind: o.kind ?? 'text', lead: !!o.lead, options: o.options ?? null, placeholder: o.placeholder ?? null, sample: o.sample ?? null, palettes: o.palettes ?? null, faces: o.faces ?? null, moods: o.moods ?? null });
/** One refinement with a scripted plan: held to shape against what was sent, then applied. */
const refine = (st, r) => {
  const c = S.spaceContextOf(st);
  const p = S.normalizePlan(r, c) ?? S.readerPlan(st);
  return { st: S.applyPlan(st, p), p, c };
};
const openIds = (st) => st.space.modules.filter((x) => x.status === 'open').map((x) => x.id);

const PALS = [
  { name: 'Acid night', note: 'near black with one acid green', colours: ['#0b0b0d', '#e9e6df', '#c6ff3d'] },
  { name: 'Ink on cream, reversed order', note: 'the readable pair found and put first', colours: ['#f4efe4', '#f1e9d8', '#141414', '#c8102e'] },
  { name: 'Grey on grey', note: 'nothing reads', colours: ['#777777', '#7a7a7a', '#7d7d7d'] },
  { name: 'Not colours', note: '', colours: ['red', 'blue', 'green'] },
];
const MOODS = [
  { name: 'Ethereal', note: 'soft white on pale sky', colours: ['#eef3f8', '#24324a', '#9bb7d4'], display: 'Cormorant Garamond' },
  { name: 'Storm light', note: 'bruised greys, a seam of gold', colours: ['#2a2d34', '#f2efe6', '#d4a548'], display: 'Bodoni Moda' },
  { name: 'Invented', note: 'not a library face', colours: ['#000000', '#ffffff', '#ff0000'], display: 'Comic Sans' },
];
const FACES = [
  { name: 'Tight and loud', note: 'condensed capitals', display: 'Anton', body: 'Inter', weight: 400, upper: true },
  { name: 'Book serif', note: '', display: 'Fraunces', body: 'Instrument Serif', weight: 650, upper: false },
  { name: 'Made up', note: '', display: 'Helvetica Neue', body: 'Inter', weight: null, upper: false },
];

sec('what hands the rest to SocriaUX, and what passes on a consideration');
{
  const yes = ['Surprise me. Just make something.', 'You decide.', 'you choose', 'I trust your judgment', 'Honestly, up to you', 'just make it', 'generate it', 'go ahead'];
  const no = ['Make me a poster.', 'Surprise me with the colours but keep it minimal', 'make it more futuristic', 'no idea what style'];
  ok('“make it”, “you decide”, “surprise me” hand it over', yes.every((t) => S.wantsMake(t)) && !no.some((t) => S.wantsMake(t)), { yes: yes.filter((t) => !S.wantsMake(t)), no: no.filter((t) => S.wantsMake(t)) });
  ok('“Skip”, “pass”, “next” — and a bare shrug — pass on a consideration; words about the work that start with “skip” or “not sure” are words about the work', ['Skip', 'skip this one', 'pass', 'Next question', 'not sure', 'idk', 'Whatever.', 'I don’t know', "i don't know"].every((t) => S.skips(t)) && !['Skip the gradients', 'skip the date, it is not set yet', 'not sure, maybe something with plants', 'idk, something that looks good'].some((t) => S.skips(t)));
}

sec('the reader (when the model cannot be reached): only what the work cannot do without');
{
  let st = open('graphic', 'something for my bakery', 'unsure');
  let r = refine(st, null);
  ok('nothing says what it is: “What are you making?” with readings to choose, as the lead', J(openIds(r.st)) === '["what"]' && r.st.space.modules[0].kind === 'choice' && r.st.space.modules[0].options.length === 4 && r.st.space.modules[0].lead && r.st.space.by === 'reader', J(r.st.space.modules));
  st = S.answerModule(r.st, 'what', 'A logo', NOW + 2);
  r = refine(st, null);
  ok('“A logo”: a logo now, and its name is raised (never twice)', r.st.mode === 'logo' && r.st.modeBy === 'recognised' && openIds(r.st).includes('name') && !openIds(r.st).includes('what'), J({ mode: r.st.mode, open: openIds(r.st) }));
  st = S.answerModule(r.st, 'name', 'Halden', NOW + 3);
  r = refine(st, null);
  ok('its name given: nothing essential missing — ready', r.st.space.ready && openIds(r.st).length === 0, J(r.st.space));
  r = refine(open('graphic', 'Make me a poster.'), null);
  ok('a vague poster: what it is for (never its headline)', J(openIds(r.st)) === '["purpose"]' && /What’s the poster for\?/.test(r.st.space.modules[0].question), J(r.st.space.modules));
  const skipped = refine(S.skipModule(r.st, 'purpose'), null).st;
  ok('…skipped: ready, never raised again, and “Skip” never read as its subject', skipped.space.ready && !openIds(skipped).length && !/Skip/.test(S.designBriefOf(skipped)), S.designBriefOf(skipped));
  r = refine(open('graphic', 'A bold poster for “Field Lines”, a festival of code that draws, 12–30 June 2027, Lisbon'), null);
  ok('a detailed idea: nothing to raise — ready at once', r.st.space.ready && openIds(r.st).length === 0);
}

sec('what the model writes, held to shape and to the brief’s rules');
{
  const st = open('graphic', 'A poster for an underground electronic night');
  const c = S.spaceContextOf(st);
  const p = S.normalizePlan(raw({ note: 'An underground night.', modules: [m('atmosphere', 'Atmosphere', 'Dark and atmospheric, or chaotic?', { kind: 'moods', lead: true, sample: 'Subsonic', moods: MOODS }), m('words', 'Words', 'What must it say?', { lead: true }), m('colour', 'Colour', 'Which colours?', { kind: 'palettes', palettes: PALS }), m('fourth', 'Fourth', 'One too many?')] }), c);
  ok('at most three open considerations, one lead', p.modules.length === 3 && p.modules.filter((x) => x.lead).length === 1 && p.modules[0].lead, J(p.modules.map((x) => [x.id, x.lead])));
  ok('moods hold only real colours that read and faces from the library', p.modules[0].aid?.kind === 'moods' && p.modules[0].aid.options.map((x) => x.name).join() === 'Ethereal,Storm light', J(p.modules[0].aid));
  ok('palettes: unreadable and non-colour options dropped, the readable pair put first', p.modules[2].aid?.options.length === 2 && p.modules[2].aid.options[1].colours[0] === '#f4efe4' && p.modules[2].aid.options[1].colours[1] === '#141414', J(p.modules[2].aid));
  const tp = S.normalizePlan(raw({ modules: [m('type', 'Lettering', 'Which lettering?', { kind: 'type', sample: 'Halden', faces: FACES })] }), c);
  ok('type: faces only from the library (the invented one dropped), a display-only face never sets text', tp.modules[0].aid?.kind === 'type' && tp.modules[0].aid.options.length === 2 && tp.modules[0].aid.options[1].body === 'Fraunces', J(tp.modules[0].aid));
  const WOOD = [{ name: 'Playbill', note: 'wood type', display: 'Rye', body: 'Courier Prime', weight: 400, upper: true }, { name: 'Blackletter', note: 'masthead', display: 'UnifrakturMaguntia', body: 'Newsreader', weight: 400, upper: false }, FACES[0]];
  const wood = S.normalizePlan(raw({ modules: [m('type', 'Lettering', 'Which lettering?', { kind: 'type', faces: WOOD })] }), c);
  ok('lettering can come from every graphics face (wood type, blackletter), not only the website list', wood.modules[0].aid?.options.map((x) => x.display).join() === 'Rye,UnifrakturMaguntia,Anton', J(wood.modules[0].aid));
  const site = S.normalizePlan(raw({ modules: [m('type', 'Lettering', 'Which lettering?', { kind: 'type', faces: WOOD })] }), { ...c, mode: 'website' });
  ok('…but a website is offered only faces a website can load (here too few remain: the question stands in words)', site.modules[0].aid === null && site.modules[0].kind === 'text', J(site.modules[0]));
  ok('the instructions list every graphics face with its character, marking those a website cannot use', /UnifrakturMaguntia \(serif, display only, not for websites; a blackletter/.test(S.discoverSystem()) && /Anton \(sans, display only; tall condensed/.test(S.discoverSystem()));
  const lone = S.normalizePlan(raw({ modules: [m('type', 'Lettering', 'Which lettering?', { kind: 'type', faces: [FACES[0], FACES[2]] })] }), c);
  ok('…with fewer than two real options, the question stands, answered in words', lone.modules[0].kind === 'text' && lone.modules[0].aid === null);
  const choice = S.normalizePlan(raw({ modules: [m('cloud', 'Atmosphere', 'Which kind of cloud?', { kind: 'choice', options: ['Ethereal and airy', 'Dark and dramatic', 'Abstract and futuristic'] })] }), c);
  ok('a choice keeps its readings (two to four)', choice.modules[0].kind === 'choice' && choice.modules[0].options.length === 3);
  ok('an aid kind already shown is not shown again (the question stands)', S.normalizePlan(raw({ modules: [m('colour', 'Colour', 'Colours?', { kind: 'palettes', palettes: PALS })] }), { ...c, shown: ['palettes'] }).modules[0].aid === null);
  ok('in a design system: no palettes or lettering (the system decides them)', S.normalizePlan(raw({ modules: [m('colour', 'Colour', 'Colours?', { kind: 'palettes', palettes: PALS })] }), { ...c, system: 'Halden' }).modules[0].aid === null);
  ok('six considerations shown already: no new one', S.normalizePlan(raw({ modules: [m('x', 'X', 'Another?')] }), { ...c, asked: 6 }).modules.length === 0);
  const answered = { ...c, modules: [{ id: 'purpose', topic: 'What it is for', question: 'What’s it for?', kind: 'text', status: 'answered', answer: 'A club night', offers: [] }] };
  const again = S.normalizePlan(raw({ modules: [m('purpose', 'What it is for', 'What is it for, really?'), m('purpose-2', 'What it is for', 'Tell me its purpose?'), m('audience', 'Who it is for', 'Who should stop for it?')], answers: [{ id: 'purpose', text: 'A club night in a warehouse' }, { id: 'nope', text: 'x' }], retire: ['purpose', 'audience', 'gone'] }), answered);
  ok('never what is answered: not by its id, not by its subject under another id', J(again.modules.map((x) => x.id)) === '["audience"]', J(again.modules));
  ok('answers rewritten only for answered considerations; retire only what is open', J(again.answers) === J([{ id: 'purpose', text: 'A club night in a warehouse' }]) && again.retire.length === 0, J({ a: again.answers, r: again.retire }));
  const picked = { ...c, brief: { ...S.emptyBrief('a poster'), purpose: 'Their own words', chosen: { palette: { name: 'Acid night', note: '', colours: ['#0b0b0d', '#e9e6df', '#c6ff3d'] } } }, own: ['purpose'] };
  const kept = S.normalizePlan(raw({ brief: { kind: 'a poster', purpose: 'The model’s rewording' } }), picked);
  ok('a pick stays whatever the model returns; a line they wrote stays theirs', kept.brief.chosen.palette?.name === 'Acid night' && kept.brief.purpose === 'Their own words', J(kept.brief));
  ok('…a pick is let go only when they took it back — never the one their latest change made', !S.normalizePlan(raw({ brief: { clear: ['palette'] } }), picked).brief.chosen.palette && S.normalizePlan(raw({ brief: { clear: ['palette'] } }), { ...picked, justPicked: ['palette'] }).brief.chosen.palette?.name === 'Acid night');
  ok('no aid offered for what is already chosen', S.normalizePlan(raw({ modules: [m('colour', 'Colour', 'Colours?', { kind: 'palettes', palettes: PALS })] }), picked).modules[0].aid === null);
  ok('the work turned out to be another kind: said', S.normalizePlan(raw({ mode: 'logo' }), c).mode === 'logo');
  ok('an answer that is not a plan is no plan (the reader plans)', S.normalizePlan('prose', c) === null && S.normalizePlan({ modules: [] }, c) === null);
  const routeP = S.normalizePlan(raw({ note: 'x', modules: [m('atmosphere', 'Atmosphere', 'Which night?', { kind: 'moods', sample: 'Subsonic', moods: MOODS, lead: true })] }), c);
  const revived = S.revivePlan(JSON.parse(J(routeP)), c);
  ok('what the route sent, held to shape again in the browser, unchanged', J(revived.modules) === J(routeP.modules), J(revived.modules));
}

sec('a plan carried out on the brief: answered kept, open kept or retired, new ones added in their place');
{
  let st = open('graphic', 'Make me a poster.');
  st = refine(st, raw({ modules: [m('purpose', 'What it is for', 'What’s the poster for?', { lead: true }), m('audience', 'Who it is for', 'Who should stop for it?')] })).st;
  ok('the first plan placed: two open, the lead first, counted', J(openIds(st)) === '["purpose","audience"]' && st.space.modules[0].lead && st.space.asked === 2 && !st.space.stale && st.space.rev === 1, J(st.space));
  st = S.answerModule(st, 'purpose', 'An underground electronic music event.', NOW + 5);
  ok('answered in words: settled at once, marked for the model', st.space.modules[0].status === 'answered' && st.space.stale && /answered “What it is for”/.test(st.space.change));
  st = refine(st, raw({ note: 'An underground night.', modules: [m('atmosphere', 'Atmosphere', 'Which night?', { kind: 'moods', sample: 'Subsonic', moods: MOODS, lead: true })], retire: ['audience'] })).st;
  ok('the next plan: the answered one kept, the retired one gone, the new one in its place as the lead', J(st.space.modules.map((x) => [x.id, x.status])) === J([['purpose', 'answered'], ['atmosphere', 'open']]) && st.space.modules[1].lead && J(st.space.shown) === '["moods"]' && st.space.asked === 3 && st.space.note === 'An underground night.', J(st.space.modules.map((x) => [x.id, x.status, x.lead])));
  st = S.pickOption(st, 'atmosphere', 1, NOW + 9);
  ok('a pick: the mood kept as their taste, the consideration settled with what was picked', st.brief.chosen.mood?.name === 'Storm light' && st.space.modules[1].answer.pick === 1 && /picked for “Atmosphere”/.test(st.space.change), J(st.space.modules[1]));
  const c = S.spaceContextOf(st);
  ok('the model is told the pick was just made, and sees the answer as a pick', J(c.justPicked) === '["mood"]' && /^picked Storm light/.test(c.modules[1].answer), J(c.modules));
  st = refine(st, raw({ note: 'Storm light.', ready: true, brief: { kind: 'poster', purpose: 'An underground electronic music event', clear: ['mood'] } })).st;
  ok('…and the pick survives a plan that tried to clear it', st.brief.chosen.mood?.name === 'Storm light' && st.space.ready);
  st = S.addNote(st, 'Actually darker and more mysterious', NOW + 12);
  st = refine(st, raw({ note: 'Darker, then.', ready: true, answers: [{ id: 'atmosphere', text: 'Darker and more mysterious than Storm light' }], brief: { kind: 'poster', purpose: 'An underground electronic music event', feel: 'dark and mysterious', avoid: ['soft and dreamy'], clear: ['mood'] } })).st;
  ok('a change of mind in a note: the superseded answer rewritten, its pick let go (now words), the rest kept', st.space.modules[1].answer.text === 'Darker and more mysterious than Storm light' && st.space.modules[1].answer.pick === null && !st.brief.chosen.mood && st.brief.feel === 'dark and mysterious' && st.space.modules[0].answer.text === 'An underground electronic music event.', J({ m: st.space.modules, b: st.brief }));
  // the cap: at most three open at once, existing ones keep their places
  let cap = refine(open('graphic', 'A poster'), raw({ modules: [m('a', 'A', 'First?'), m('b', 'B', 'Second?'), m('c', 'C', 'Third?')] })).st;
  cap = refine(cap, raw({ modules: [m('d', 'D', 'Fourth?', { lead: true })] })).st;
  ok('three open already: a fourth waits (no reshuffle of what is there)', J(openIds(cap)) === '["a","b","c"]', J(openIds(cap)));
}

sec('the person shaping the brief in place');
{
  let st = refine(open('graphic', 'A poster for the spring plant sale at our nursery'), raw({ modules: [m('colour', 'Colour', 'Which feels most like your nursery?', { kind: 'palettes', palettes: [PALS[0], PALS[1]], lead: true })], brief: { kind: 'poster', purpose: 'The spring plant sale', tentative: ['A hand-lettered feel'] } })).st;
  st = S.editPrompt(st, 'A poster for the spring plant sale at our nursery, 3 May');
  ok('the idea edited: kept, marked for the model', st.prompt === 'A poster for the spring plant sale at our nursery, 3 May' && /edited their idea/.test(st.space.change) && S.spaceContextOf(st).prompt.endsWith('3 May'));
  st = S.editField(st, 'audience', 'Regulars and their neighbours');
  ok('a line written in place: theirs from then on', st.brief.audience === 'Regulars and their neighbours' && st.space.own.includes('audience'));
  st = S.pickOption(st, 'colour', 0, NOW + 20);
  const was = st.brief.chosen.palette.colours;
  st = S.setPaletteColour(st, 2, '#3fa34d');
  ok('a colour of the picked palette changed: theirs, only that one changed, marked as changed', J(st.brief.chosen.palette.colours) === J([was[0], was[1], '#3fa34d']) && st.brief.chosen.palette.edited === true && /changed a colour/.test(st.space.change), J(st.brief.chosen.palette));
  const unreadable = S.setPaletteColour(st, 1, '#111111');
  ok('…even one whose ink no longer reads: kept, and the brief can say so', unreadable.brief.chosen.palette.colours[1] === '#111111' && !S.paletteReads(unreadable.brief.chosen.palette) && S.paletteReads(st.brief.chosen.palette));
  const back = S.normalizeStudio(JSON.parse(J(unreadable)));
  ok('…and it survives being stored and read back', J(back.brief.chosen.palette.colours) === J(unreadable.brief.chosen.palette.colours) && back.space.own.includes('audience'), J(back.brief.chosen.palette));
  st = S.keepTentative(st, 'A hand-lettered feel');
  ok('SocriaUX’s reading kept: theirs now', st.brief.explicit.includes('A hand-lettered feel') && !st.brief.tentative.includes('A hand-lettered feel'));
  const dropped = S.dropTentative(S.editField(st, 'feel', 'x'), 'nothing');
  ok('turning down a line that is not there changes nothing', dropped.brief.feel === 'x');
  st = S.removeChosen(st, 'palette');
  ok('a pick taken back: gone, its consideration open again to pick or answer', !st.brief.chosen.palette && st.space.modules[0].status === 'open' && st.space.modules[0].answer === null);
  st = S.answerModule(st, 'colour', 'Earthy, like terracotta pots in the sun', NOW + 30);
  st = S.reopenModule(st, 'colour');
  ok('a settled consideration changed again: open where it was', st.space.modules[0].status === 'open' && !st.space.stale);
  st = S.addNote(st, 'Must include the nursery’s fox mascot', NOW + 31);
  const noteId = st.space.notes[0].id;
  ok('a note kept, in their words', st.space.notes[0].text === 'Must include the nursery’s fox mascot' && S.spaceContextOf(st).notes[0] === 'Must include the nursery’s fox mascot');
  st = S.removeNote(st, noteId);
  ok('…and taken back', st.space.notes.length === 0 && /took back their note/.test(st.space.change));
  ok('a skip in words is a skip', S.answerModule(st, 'colour', 'skip').space.modules[0].status === 'skipped');
}

sec('the brief, as the designer reads it');
{
  let st = refine(open('graphic', 'A poster for “Low Tide”, three bands, Saturday 12 April, The Boiler Room'), raw({ modules: [m('feel', 'The feeling', 'Should it convey the sound, or create intrigue?', { lead: true }), m('colour', 'Colour', 'Which colours?', { kind: 'palettes', palettes: [{ name: 'Tidal', note: 'deep teal and sand', colours: ['#0f2a2e', '#efe6d4', '#e0a458'] }, { name: 'Salt', note: 'white and slate', colours: ['#f5f5f2', '#1f2a30', '#3c7a89'] }] }), m('venue', 'The venue', 'Anything about the room?')], brief: { kind: 'a gig poster', content: 'Low Tide\nSaturday 12 April\nThe Boiler Room' } })).st;
  st = S.answerModule(st, 'feel', 'Intrigue, but not cold', NOW + 40);
  st = S.pickOption(st, 'colour', 0, NOW + 41);
  st = S.skipModule(st, 'venue');
  st = S.addNote(st, 'No band photos', NOW + 42);
  st = refine(st, raw({ ready: true, brief: { kind: 'a gig poster', content: 'Low Tide\nSaturday 12 April\nThe Boiler Room', feel: 'intrigue, but not cold', tentative: ['a tide line as the image'], avoid: ['band photos'] } })).st;
  const text = S.designBriefOf(S.startMaking(st, NOW + 50));
  ok('their idea in quotes; what they settled (a skip left to SocriaUX); their notes, the later holding', /^In their words: “A poster for “Low Tide”/.test(text) && /- The feeling \(“Should it convey the sound, or create intrigue\?”\): Intrigue, but not cold/.test(text) && /- The venue[^\n]*: left to SocriaUX/.test(text) && /the later one holds\):\n- No band photos/.test(text), text);
  ok('their words to set, exactly; SocriaUX’s reading marked as not theirs; their pick as taste; what to avoid', /Words to set, exactly as given:\nLow Tide\nSaturday 12 April\nThe Boiler Room/.test(text) && /SocriaUX’s own reading, not confirmed by them[^\n]*\n- a tide line as the image/.test(text) && /Colours they picked \(Tidal\): #0f2a2e, #efe6d4, #e0a458/.test(text) && /Avoid:\n- band photos/.test(text) && /left to SocriaUX’s judgement/.test(text), text);
  ok('kept within what the designer’s memory holds', text.length <= 4000);
  const made = S.startMaking(st, NOW + 50);
  ok('Generate: marked as making (a reload picks it up), the model no longer awaited', S.makingNow(made) && !S.awaitingPlan(made));
  const p = S.designFromStudio(S.makeProject('create', 'Untitled design', NOW), made, { now: NOW });
  ok('handed to the design workspace: named from its words, a poster format, the brief in its memory', p.ok && p.project.medium === 'design' && p.project.name === 'Low Tide' && p.project.design.kind === 'poster' && p.project.design.memory.brief === S.designBriefOf(made), p.ok ? { name: p.project.name, kind: p.project.design.kind } : p);
  const edited = S.setPaletteColour(made, 0, '#102030');
  ok('colours they changed are said to be theirs, in role order', /colours adjusted by them, in this order: ground, ink, accent, support/.test(S.designBriefOf(edited)));
  const bare = S.startMaking(open('graphic', 'A poster'), NOW);
  ok('Generate with nothing answered: stand-in words, everything left to SocriaUX', /stand-in words/.test(S.designBriefOf(bare)) && /left to SocriaUX’s judgement/.test(S.designBriefOf(bare)));
  const lg = S.designFromStudio(S.makeProject('create', 'Untitled design', NOW), S.startMaking(open('logo', 'Surprise me — a logo for a bakery'), NOW), { now: NOW });
  ok('a logo with no name is not refused: the designer invents one (on a logo sheet)', lg.ok && lg.project.design.kind === 'logo' && lg.project.design.format === 'logo-sheet', lg);
}

sec('the model reads the brief as it stands');
{
  let st = refine(open('logo', 'A premium brand, not sure of the style'), raw({ modules: [m('premium', 'Premium', 'Which kind of premium?', { kind: 'moods', sample: 'Aa', moods: MOODS, lead: true })] })).st;
  st = S.editField(st, 'purpose', 'A small fragrance house');
  const c = S.spaceContextOf(st, { systemName: 'Velour Brand' });
  const user = S.discoverUser(c);
  ok('its idea, each consideration with its status and what it offers, its own lines marked, the latest change, the design system', /THEIR IDEA: “A premium brand, not sure of the style”/.test(user) && /\[premium\] Premium — “Which kind of premium\?” \(moods\) — OPEN, offering: Ethereal \/ Storm light/.test(user) && /purpose: A small fragrance house \(they set this themselves\)/.test(user) && /LATEST CHANGE: set “purpose” themselves/.test(user) && /DESIGN SYSTEM: made in “Velour Brand”/.test(user), user);
  const sys = S.discoverSystem();
  ok('told what to return, how to choose what to raise, the visual kinds, and the font library — with no copied example lines', /What you return each time/.test(sys) && /at most three, usually one or two, often none/.test(sys) && /FONT LIBRARY/.test(sys) && !/An underground night/.test(sys), sys.slice(0, 200));
  ok('a critique or an import is never a spatial brief', !S.isCreative('critique') && !S.isCreative('system') && !S.awaitingPlan({ ...open('graphic', 'x'), mode: 'critique' }));
}

console.log(`\ndiscover: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
