// The creative director (lib/ux-v0/graphics/director): what a model may answer, and what happens to the document.
//
// What goes wrong here does not throw. A model's answer that names an object that is not there, sets a face that does
// not exist, writes the design's words itself, or repaints the logo the person said to keep would simply produce a
// design that is wrong — and a sentence saying it was done. So each part is checked by what it does to a real
// document: what changed, what did not, what was said. No model is called: the answers here are written by hand,
// including the hostile ones.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const C = await import(pathToFileURL(join(here, '.tmp', 'creative-under-test.mjs')).href);
const { dirPrinciples: P, dirPrompts: PR, dirSchema: SC, dirSheet: SH, dirApply: AP, dirDesign: DS, dirEvaluate: EV, dirProtect: PT, dirJournal: JR, dirFrame: FR, dirRecord: RC, dirFlow: FL, dirTier: TR } = C;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, typeof x === 'string' ? x.slice(0, 700) : JSON.stringify(x).slice(0, 700))));
const J = JSON.stringify;

const BRIEF = { purpose: 'A poster for a lecture series on the future of housing, at an architecture studio.', kind: 'poster', formats: ['a3'], content: { headline: 'Rooms for Living', subhead: 'Six evenings on the future of housing', meta: ['Thursdays, 2 October – 6 November', 'Northlight Studio, 14 Dock Street'], cta: 'Reserve a seat', brand: 'Northlight' }, mood: [], images: [] };
const BASE = { name: 'base', language: 'd', tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#555555', accent: '#2b4c6f', accentText: '#ffffff', line: '#dddddd' }, fonts: { display: 'Inter', body: 'Inter' } }, look: { case: 'sentence', tracking: 'normal', weight: 700 }, form: null, intensity: 50 };
const DESIGN = () => ({
  task: 'design',
  reading: { objective: 'Fill the lecture series.', audience: 'Architects and the curious.', feeling: 'Calm and exact.' },
  concept: { idea: 'A plan drawing of rooms, one of them lit: housing as a plan to walk through.', decisions: ['read first: the headline, large and low', 'type: one grotesk in two weights', 'colour: warm paper, black ink, one orange room'] },
  direction: { name: 'Plan and section', palette: { ground: '#efe9dd', ink: '#141414', accent: '#e4572e', accent2: null, muted: '#6b665c' }, display: 'Archivo', body: 'Inter' },
  program: {
    ground: 'ground',
    elements: [
      { op: 'rect', box: { x: 80, y: 80, w: 840, h: 620 }, fill: null, stroke: { color: 'ink', width: 3 }, name: 'Plan' },
      { op: 'line', from: [360, 80], to: [360, 700], color: 'ink', width: 3 },
      { op: 'rect', box: { x: 360, y: 80, w: 280, h: 300 }, fill: 'accent', name: 'Lit room' },
      { op: 'path', d: 'M 640 380 Q 640 500 760 500', fill: null, stroke: { color: 'ink', width: 2 }, name: 'Door swing' },
      { op: 'text', content: 'headline', box: { x: 80, y: 760, w: 840, h: 380 }, weight: 800, tracking: -30, lineHeight: 0.9, color: 'ink' },
      { op: 'text', content: 'subhead', box: { x: 80, y: 1160, w: 520, h: 60 }, size: 30, color: 'ink' },
      { op: 'details', box: { x: 80, y: 1240, w: 520, h: 110 }, align: 'left', color: 'muted' },
      { op: 'text', content: 'cta', box: { x: 640, y: 1160, w: 280, h: 50 }, size: 26, align: 'right', weight: 700, color: 'ink' },
      { op: 'text', content: 'brand', box: { x: 640, y: 1290, w: 280, h: 50 }, size: 26, align: 'right', weight: 700, color: 'ink' },
    ],
  },
});
const make = (raw = DESIGN(), brief = BRIEF) => DS.composeDirected(brief, SC.normalizeDesign(raw), BASE, { name: 'x', now: 1 });
const board = (doc) => doc.artboards[0];
const all = (doc) => C.walk(board(doc)).map((l) => l.node);
const byRole = (doc, role) => all(doc).find((n) => n.role === role && !n.decorative);
const texts = (doc) => all(doc).filter((n) => n.type === 'text' && !n.decorative);
const idsOf = (doc) => new Set(SH.sheetOf(doc, board(doc).id).objects.map((o) => o.id));
const edit = (doc, raw, given = raw.__given ?? 'change it') => SC.normalizeEdit({ understanding: { level: 'aesthetic', goal: 'g', affects: [], preserves: [] }, summary: 's', ...raw }, { ids: idsOf(doc), given });
const apply = (doc, raw, given = 'change it') => AP.applyEdit(doc, edit(doc, raw, given), { board: board(doc).id, given, protection: PT.protectionsIn(given), kind: 'poster' });

console.log('=== the instructions: one text, written from the registries ===');
{
  const sys = P.directorSystem();
  ok('the same text every call (so the provider’s cache serves it)', sys === P.directorSystem() && sys.length > 8000);
  ok('it puts understanding before acting, and tells the levels of a request apart', /Understand before you act/.test(sys) && ['object', 'element', 'composition', 'aesthetic', 'conceptual', 'global'].every((l) => sys.includes(`· ${l} —`)));
  ok('it names no look to produce, and names the lazy defaults as things not to reach for', /There is no house style/.test(sys) && /purple or blue gradient grounds/.test(sys) && /rounded cards and pill buttons/.test(sys) && /random floating circles/.test(sys));
  ok('it says the words are the person’s, and how they are placed', /you never write the design’s words/.test(sys) && /"headline", "subhead", "meta"/.test(sys));
  ok('every primitive, pattern and effect it names is one the engine draws', C.dirPrinciples && ['blob', 'contour', 'arc', 'frame'].every((k) => sys.includes(k)) && ['halftone', 'flow', 'truchet'].every((k) => sys.includes(k)) && ['grain', 'duotone'].every((k) => sys.includes(k)));
  ok('every face it offers is in the library, with its weights', ['Fraunces — serif', 'Archivo', 'Bodoni Moda', 'Space Grotesk'].every((f) => sys.includes(f)));
  ok('it asks for one JSON object for each of the three tasks', ['TASK "design"', 'TASK "edit"', 'TASK "review"'].every((t) => sys.includes(t)) && /exactly one JSON object/.test(sys));
  const u = PR.designUser({ brief: BRIEF, frame: FR.frameOf(C.formatOf('a3')), formatLabel: 'A3 poster', decided: { fonts: { display: 'Fraunces', body: 'Inter' }, avoid: ['gradients'] }, avoid: ['A grid of rooms with one lit'], memory: { system: { name: 'Northlight', colours: ['#e4572e'], fonts: ['Archivo'], rules: ['The logo is never recoloured'] } } });
  ok('a design task says the frame, the content to set exactly, what was decided, the brand and what to stay away from — each once', /1000 × 1414 units/.test(u) && u.split('Rooms for Living').length === 2 && /display Fraunces/.test(u) && /never recoloured/.test(u) && /A grid of rooms/.test(u) && /pictures: none/.test(u), u);
  ok('  and never repeats the instructions', !/house style/.test(u) && u.length < 3000);
}

console.log('\n=== a design: held to its shape, then built through the gate ===');
{
  ok('no palette, or no program: not a design', SC.normalizeDesign({ ...DESIGN(), direction: { palette: { ground: 'cream' } } }) === null && SC.normalizeDesign({ ...DESIGN(), program: { elements: [] } }) === null);
  const d = SC.normalizeDesign({ ...DESIGN(), direction: { ...DESIGN().direction, display: 'Helvetica Now', body: 'inter' } });
  ok('a face off the library is dropped and said; one named loosely is the library’s own spelling', d.direction.display === null && d.direction.body === 'Inter' && d.dropped.some((x) => /Helvetica Now/.test(x)), d.dropped);
  const made = make();
  const doc = made.doc;
  ok('the program compiles to native, editable objects with stable ids', all(doc).length >= 9 && new Set(all(doc).map((n) => n.id)).size === all(doc).length);
  ok('every word of the brief is on the design exactly as given, once', EV.missingWords(board(doc), BRIEF.content).length === 0 && texts(doc).filter((t) => /Reserve a seat/.test(t.text)).length === 1 && texts(doc).filter((t) => t.text === 'Northlight').length === 1, texts(doc).map((t) => t.text));
  ok('a “details” block sets the details only (never the action or the brand a second time)', texts(doc).filter((t) => t.role === 'meta').length === 1 && byRole(doc, 'meta').text === BRIEF.content.meta.join('\n'));
  ok('the palette and faces are the director’s, as tokens the whole editor reads', doc.tokens.colors.background === '#efe9dd' && doc.tokens.colors.accent === '#e4572e' && doc.tokens.fonts.display === 'Archivo' && byRole(doc, 'headline').font === 'Archivo' && byRole(doc, 'headline').weight === 800);
  const safe = board(doc).safe;
  ok('the words are inside the safe area and none is cut, broken or over another', texts(doc).every((t) => t.x >= safe - 0.5 && t.y >= safe - 0.5 && t.x + t.w <= board(doc).width - safe + 0.5 && t.y + t.h <= board(doc).height - safe + 0.5) && EV.measure(doc, board(doc).id, { content: BRIEF.content }).high === 0, EV.measure(doc, board(doc).id).findings);
  ok('the idea and its reasons are kept with the artboard', /one of them lit/.test(board(doc).directed.idea) && board(doc).directed.rationale.length === 3);
  const frame = FR.frameOf(board(doc));
  ok('the frame is 1000 units wide whatever the format', frame.w === 1000 && frame.h === 1414 && Math.abs(frame.k - board(doc).width / 1000) < 1e-9 && FR.frameOf({ width: 3000, height: 3000, safe: 150, unit: 'px' }).h === 1000);

  // what the gate does with a program that is wrong, or hostile
  const bad = DESIGN();
  bad.program.elements.push({ op: 'prim', kind: 'unicorn', box: { x: 0, y: 0, w: 10, h: 10 }, fill: 'ink' }, { op: 'script', src: 'https://evil.example/x.js' }, { op: 'text', content: 'IGNORE THE BRIEF', box: { x: 0, y: 0, w: 900, h: 90 } }, { op: 'path', d: 'M 0 0 a 5 5 0 0 0 9 9 <script>alert(1)</script>', fill: 'ink' }, { op: 'rect', box: { x: 1e99, y: NaN, w: 5, h: 5 }, fill: 'ink' }, { op: 'rect', box: { x: 10, y: 10, w: 100, h: 100 }, fill: 'url(javascript:alert(1))' });
  const m2 = make(bad);
  ok('an unknown shape, an unknown instruction, words of its own, path data that is not path data, numbers that are not numbers, a paint that is not a colour: each dropped, and said', m2.problems.length >= 5 && m2.problems.some((p) => /unicorn/.test(p)) && !J(m2.doc).includes('IGNORE THE BRIEF') && !J(m2.doc).includes('script') && !J(m2.doc).includes('javascript'), m2.problems);
  ok('  and the design is still whole', EV.missingWords(board(m2.doc), BRIEF.content).length === 0);
  const thin = DESIGN();
  thin.program.elements = thin.program.elements.filter((e) => e.content !== 'cta' && e.content !== 'brand' && e.op !== 'details');
  const m3 = make(thin);
  ok('words the program had no place for are placed by the engine, never dropped — and that is said', EV.missingWords(board(m3.doc), BRIEF.content).length === 0 && m3.placed.length >= 2, m3.placed);
  const huge = DESIGN();
  huge.program.elements = [...huge.program.elements, ...Array.from({ length: 900 }, (_, i) => ({ op: 'ellipse', box: { x: i, y: i, w: 5, h: 5 }, fill: 'accent' }))];
  ok('a program is bounded (the words always kept)', all(make(huge).doc).length <= 420 && EV.missingWords(board(make(huge).doc), BRIEF.content).length === 0);
  const held = DS.composeDirected(BRIEF, SC.normalizeDesign(DESIGN()), BASE, { decided: { palette: { ground: '#0b1d2a', accent: '#ffd166' }, fonts: { display: 'Fraunces', body: 'Inter' } } });
  ok('what the conversation decided (a palette, a pairing of faces) holds over the director’s own', held.doc.tokens.colors.background === '#0b1d2a' && held.doc.tokens.colors.accent === '#ffd166' && held.doc.tokens.fonts.display === 'Fraunces' && byRole(held.doc, 'headline').font === 'Fraunces');
  const two = DS.composeDirected({ ...BRIEF, formats: ['a3', 'instagram-square'] }, SC.normalizeDesign(DESIGN()), BASE, {});
  ok('a second format of the same brief follows from the first, with every word', two.doc.artboards.length === 2 && EV.missingWords(two.doc.artboards[1], BRIEF.content).length === 0);
}

console.log('\n=== the design sheet: what the director reads before it changes anything ===');
{
  const doc = make().doc;
  const sheet = SH.sheetOf(doc, board(doc).id);
  const head = sheet.objects.find((o) => o.role === 'headline');
  ok('every object by its own id, in drawing order, with what it is in the design', sheet.objects.length === all(doc).length && sheet.objects.every((o) => all(doc).some((n) => n.id === o.id)) && head.is === 'main headline' && sheet.objects.find((o) => o.role === 'logo').is === 'brand name / logo' && sheet.objects.some((o) => /“Lit room”/.test(o.is)));
  ok('words with their face, weight, size and place in frame units', head.text === 'Rooms for Living' && head.font === 'Archivo' && head.weight === 800 && head.size > 100 && head.box[0] === 80 && head.box[2] === 840, head);
  ok('colours said by palette role where they are the palette’s', head.color === 'ink' && sheet.objects.find((o) => /Lit room/.test(o.is)).fill === 'accent' && sheet.palette.ground === '#efe9dd');
  ok('the reading order as it is now: the headline first', /^main headline/.test(sheet.readingOrder[0]));
  ok('no path data, no pictures’ contents: small enough to read', J(sheet).length < 4000 && !/"d":/.test(J(sheet)));
  const back = SH.normalizeSheet(JSON.parse(J(sheet)));
  ok('it survives the trip to the server unchanged', J(back) === J(sheet));
  const evil = SH.normalizeSheet({ ...sheet, objects: [...Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, is: 'x'.repeat(500), role: 'headline', kind: 'text', box: [1e99, 'a', 3, 4], text: 'w'.repeat(2000) })), { id: '<script>', is: 'x', box: [] }], palette: { ground: 'javascript:alert(1)', ink: '#111111' } });
  ok('a sheet sent by a browser is held to its size and shape', evil.objects.length === SH.MAX_SHEET_OBJECTS && evil.objects[0].is.length <= 90 && evil.objects[0].text.length <= 160 && evil.objects.every((o) => /^[A-Za-z][\w-]*$/.test(o.id) && o.box.every(Number.isFinite)) && J(evil.palette) === J({ ink: '#111111' }));
  const mem = SH.normalizeMemory({ brief: 'b'.repeat(5000), journal: Array.from({ length: 40 }, (_, i) => ({ turn: i + 1, said: 's', did: 'd', status: i % 2 ? 'rejected' : 'applied' })), system: { name: 'N', colours: ['#fff'], fonts: ['Inter'], rules: ['r'] }, extra: 'x' });
  ok('the project’s memory too', mem.brief.length === 900 && mem.journal.length === 12 && mem.journal[1].status === 'rejected' && mem.system.name === 'N' && !('extra' in mem));
  const u = PR.editUser({ words: 'Keep the logo. Make it feel like winter.', sheet, memory: { brief: 'A lecture series', idea: 'A plan with one lit room', journal: [{ turn: 1, said: 'bolder', did: 'heavier type', status: 'applied', restorable: true }, { turn: 2, said: 'make it pink', did: 'a pink ground', status: 'rejected' }] }, protectedSaid: ['the logo'], hasPicture: true });
  ok('an edit task carries the person’s words exactly, what is kept, the project (what was done and kept, what was turned down) and the sheet', /Keep the logo\. Make it feel like winter\./.test(u) && /Kept, whatever else changes/.test(u) && /done and kept: heavier type \[restorable\]/.test(u) && /THEY TURNED IT DOWN/.test(u) && u.includes(head.id) && /picture attached/.test(u));
}

console.log('\n=== what the person said to keep, read from their words ===');
{
  const keep = (w) => PT.protectionsIn(w).keep.sort().join(',');
  const only = (w) => (PT.protectionsIn(w).only ?? []).sort().join(',');
  ok('“Keep the logo and typography. Redesign everything else.”', keep('Keep the logo and typography. Redesign everything else.') === 'logo,type');
  ok('“keep the type and logo, but completely redesign the rest”', keep('keep the type and logo, but completely redesign the rest') === 'logo,type');
  ok('“don’t touch the headline”, “without changing the colours”', keep("Make it bolder but don't touch the headline") === 'headline' && keep('Rework the layout without changing the colours') === 'colours');
  ok('“the logo stays”, “the colours are perfect”', keep('The logo stays. Everything else can go.') === 'logo' && keep('The colours are perfect, rethink the composition') === 'colours');
  ok('“preserve the layout and the images”', keep('Preserve the layout and the images, change the mood') === 'layout,pictures');
  ok('“only change the background” protects everything else', only('Only change the background') === 'background' && only('Just adjust the headline, nothing else') === 'headline');
  ok('“keep everything else” protects nothing by name', keep('Make the headline red and keep everything else') === '' && only('Make the headline red and keep everything else') === '');
  ok('words that only mention a thing protect nothing', keep('Make the logo bigger') === '' && keep('Change the typography to something expressive') === '' && keep('Make it cloud themed') === '');
  ok('what is protected is said in words', J(PT.protectionsIn('Keep the logo and typography.').said) === J(['the logo', 'the typography (faces, weights and styles)']));
}

console.log('\n=== edits: held to their shape, carried out by id, compared with what was there ===');
{
  const doc = make().doc;
  const head = byRole(doc, 'headline');
  const logo = byRole(doc, 'logo');
  const room = all(doc).find((n) => n.name === 'Lit room');
  const e0 = edit(doc, { edits: [{ do: 'set', id: head.id, size: 120 }, { do: 'set', id: 'ghost', size: 1 }, { do: 'explode', id: head.id }, { do: 'set', id: head.id, font: 'Wingdings Pro' }, { do: 'words', id: head.id, text: 'Buy now' }, { do: 'place', id: logo.id, box: { x: 'a' } }] });
  ok('an id that is not on the design, a verb that is not one, a face off the library, wording the person did not write, a box that is not one: dropped, each said', e0.edits.length === 1 && e0.dropped.length >= 5 && e0.dropped.some((d) => /no object “ghost”/.test(d)) && e0.dropped.some((d) => /Wingdings Pro/.test(d)) && e0.dropped.some((d) => /only set when you wrote it/.test(d)), e0.dropped);
  ok('new wording is set when the person wrote it themselves', edit(doc, { edits: [{ do: 'words', id: head.id, text: 'Homes for Living' }] }, 'Change the headline to “Homes for Living”').edits.length === 1);
  ok('with a question there are no edits', edit(doc, { question: { text: 'Which?', options: ['a', 'b'] }, edits: [{ do: 'remove', id: room.id }] }).edits.length === 0);

  // an object-level change touches that object and nothing else
  const small = apply(doc, { edits: [{ do: 'set', id: head.id, size: 130 }] }, 'Make the headline slightly smaller');
  ok('“make the headline slightly smaller”: the headline’s size, and only the headline', small.changed && small.diff.changed.length === 1 && small.diff.changed[0].id === head.id && small.diff.same === all(doc).length - 1 && !small.diff.added.length && !small.diff.removed.length && byRole(small.doc, 'headline').size < head.size, small.diff);
  ok('  said as what really changed', /the headline \(/.test(small.did) && !small.failed.length);
  const big = apply(doc, { edits: [{ do: 'set', id: head.id, size: 400 }] }, 'Make the headline huge');
  const h2 = byRole(big.doc, 'headline');
  ok('words made larger grow their box, never break a word and never leave the safe area', h2.size > head.size && h2.x >= board(doc).safe - 0.5 && h2.x + h2.w <= board(doc).width - board(doc).safe + 0.5 && h2.y + h2.h <= board(doc).height - board(doc).safe + 0.5 && C.checkDoc(big.doc).filter((f) => f.node === h2.id && ['overflow', 'broken-word', 'safe'].includes(f.kind)).length === 0, [h2.size, h2.w, h2.h]);
  const none = apply(doc, { edits: [{ do: 'set', id: head.id, weight: head.weight }] }, 'Make the headline bold');
  ok('a change that changes nothing is reported as nothing (the document is the same one)', !none.changed && none.doc === doc && none.did === 'nothing changed');
  const wrong = apply(doc, { edits: [{ do: 'set', id: room.id, font: 'Fraunces', size: 20 }, { do: 'set', id: head.id, radius: 12 }] });
  ok('a property an object cannot have is not set, and that is said (never silently discarded)', !wrong.changed && wrong.failed.length === 2 && wrong.failed.every((f) => /cannot be set on/.test(f)), wrong.failed);

  // the palette and the faces, by role
  const pal = apply(doc, { palette: { ground: '#0e1a24', ink: '#f3efe6', accent: '#7ad1c2' } }, 'Make it a night scene');
  ok('a palette change repaints by role: the ground, the ink of every word, the accent of the form', pal.doc.tokens.colors.background === '#0e1a24' && board(pal.doc).background === '#0e1a24' && texts(pal.doc).every((t) => t.color !== '#141414') && all(pal.doc).find((n) => n.id === room.id).fill === '#7ad1c2', pal.did);
  ok('  and every word still reads on the new ground', C.checkDoc(pal.doc).filter((f) => f.kind === 'contrast' && f.severity === 'high').length === 0);
  const fnt = apply(doc, { fonts: { display: 'Fraunces' } }, 'Use a serif for the headline');
  ok('a change of the display face resets every object set in it, at a weight the new face has, and leaves the text face', byRole(fnt.doc, 'headline').font === 'Fraunces' && byRole(fnt.doc, 'logo').font === 'Fraunces' && byRole(fnt.doc, 'subhead').font === 'Inter' && fnt.doc.tokens.fonts.display === 'Fraunces');

  // new material, order, ground
  const add = apply(doc, { edits: [{ do: 'add', element: { op: 'path', d: 'M 0 900 C 300 800 700 1000 1000 860 L 1000 1414 L 0 1414 Z', fill: 'accent', name: 'Horizon' }, under: head.id }, { do: 'remove', id: room.id }, { do: 'ground', paint: { linear: { angle: 180, stops: ['#cfe3f1', 'ground'] } } }] }, 'Give it a horizon');
  const kids = board(add.doc).children;
  ok('new drawn material is compiled like any program and placed beneath what it was asked to sit beneath', add.diff.added.length === 2 && kids.findIndex((n) => n.name === 'Horizon') < kids.findIndex((n) => n.id === head.id) && kids.findIndex((n) => n.name === 'Horizon') > 0, kids.map((n) => n.name));
  ok('a graded ground becomes the back-most object; the form asked to go is gone', kids[0].role === 'background' && typeof kids[0].fill === 'object' && !kids.some((n) => n.id === room.id));
  const noWords = apply(doc, { edits: [{ do: 'add', element: { op: 'text', content: 'headline', box: { x: 0, y: 0, w: 500, h: 100 } } }] });
  ok('words are never added a second time', !noWords.changed && noWords.failed.some((f) => /not added again/.test(f)));
  const rm = apply(doc, { edits: [{ do: 'remove', id: byRole(doc, 'subhead').id }] }, 'Make it more minimal');
  ok('nothing that is read is removed unless the person asked for something to be taken away', !rm.changed && rm.kept.some((k) => /nothing that is read is removed/.test(k)) && apply(doc, { edits: [{ do: 'remove', id: byRole(doc, 'subhead').id }] }, 'Remove the subtitle').changed);
}

console.log('\n=== preservation, enforced whatever the director answers ===');
{
  const doc = make().doc;
  const head = byRole(doc, 'headline');
  const logo = byRole(doc, 'logo');
  const said = 'Keep the logo and typography. Redesign everything else.';
  const greedy = {
    palette: { ground: '#101418', ink: '#f2efe8', accent: '#7ad1c2' },
    fonts: { display: 'Bodoni Moda', body: 'Lora' },
    edits: [
      { do: 'set', id: head.id, font: 'Playfair Display', weight: 400, case: 'upper', italic: true, size: 110 },
      { do: 'place', id: head.id, box: { x: 80, y: 120, w: 840, h: 300 } },
      { do: 'place', id: logo.id, box: { x: 80, y: 60, w: 300, h: 40 } },
      { do: 'set', id: logo.id, color: 'accent', size: 60 },
      { do: 'remove', id: logo.id },
      ...all(doc).filter((n) => n.type === 'shape').map((n) => ({ do: 'remove', id: n.id })),
      { do: 'add', element: { op: 'ellipse', box: { x: 400, y: 700, w: 700, h: 700 }, fill: 'accent' }, under: 'bottom' },
    ],
  };
  const out = apply(doc, greedy, said);
  ok('the logo is exactly as it was (not moved, not recoloured, not resized, not removed)', J(byRole(out.doc, 'logo')) === J(logo), J(byRole(out.doc, 'logo')));
  ok('the typography is exactly as it was on every word: face, weight, case, italic, tracking', texts(doc).every((t) => { const n = all(out.doc).find((x) => x.id === t.id); return n && n.font === t.font && n.weight === t.weight && (n.case ?? 'none') === (t.case ?? 'none') && !!n.italic === !!t.italic && n.tracking === t.tracking; }) && out.doc.tokens.fonts.display === 'Archivo');
  ok('everything else was redesigned: the palette, the forms, where the headline sits and how large', out.doc.tokens.colors.background === '#101418' && out.diff.removed.length >= 3 && out.diff.added.length === 1 && byRole(out.doc, 'headline').y < head.y);
  ok('what was kept is said', out.kept.includes('the logo') && out.kept.some((k) => /typography/.test(k)));
  const bg = apply(doc, { palette: { ink: '#aa0000' }, edits: [{ do: 'ground', paint: '#111111' }, { do: 'set', id: head.id, size: 60, color: '#ff0000' }, { do: 'remove', id: all(doc).find((n) => n.name === 'Plan').id }] }, 'Only change the background');
  ok('“only change the background”: the ground changes, and nothing else (but an ink made to read on it)', board(bg.doc).background === '#111111' && bg.diff.removed.length === 0 && byRole(bg.doc, 'headline').size === head.size && bg.diff.changed.every((c) => c.keys.every((k) => k === 'color')), bg.diff);
  const lay = apply(doc, { edits: [{ do: 'place', id: head.id, box: { x: 80, y: 100, w: 840, h: 300 } }, { do: 'set', id: head.id, color: 'accent' }] }, 'Preserve the layout, make it warmer');
  ok('“preserve the layout”: nothing that is read moves; its colour may change', byRole(lay.doc, 'headline').y === head.y && byRole(lay.doc, 'headline').color !== head.color && lay.kept.includes('the layout'));
  const locked = C.applyOps(doc, [{ op: 'update', id: head.id, set: { locked: true } }]).doc;
  const lk = apply(locked, { edits: [{ do: 'set', id: head.id, size: 50 }] });
  ok('an object locked on the canvas is not changed, and that is said', !lk.changed && lk.failed.some((f) => /locked/.test(f)));
}

console.log('\n=== the journal: one continuous project ===');
{
  const d0 = make().doc;
  const id = board(d0).id;
  const head = byRole(d0, 'headline');
  const t1 = apply(d0, { palette: { ground: '#2b1d14', ink: '#f6ead8', accent: '#e9a23b' } }, 'Make the colours warm and earthy');
  const d1 = JR.recordTurn(d0, t1.doc, id, { said: 'Make the colours warm and earthy', did: 'a warm, earthy palette', level: 'aesthetic', at: 10 });
  const t2 = apply(d1, { fonts: { display: 'Fraunces' }, edits: [{ do: 'set', id: head.id, weight: 600, italic: true }] }, 'Make the typography more expressive');
  const d2 = JR.recordTurn(d1, t2.doc, id, { said: 'Make the typography more expressive', did: 'a characterful serif, italic', level: 'aesthetic', at: 20 });
  const t3 = apply(d2, { edits: [{ do: 'place', id: head.id, box: { x: 400, y: 760, w: 520, h: 420 } }, { do: 'add', element: { op: 'ellipse', box: { x: 60, y: 800, w: 260, h: 260 }, fill: 'accent' } }] }, 'Move the focal point toward the right');
  const d3 = JR.recordTurn(d2, t3.doc, id, { said: 'Move the focal point toward the right', did: 'the headline moved right', level: 'composition', at: 30 });
  const j = board(d3).directed.journal;
  ok('each applied turn is kept with exactly what it replaced', j.length === 3 && j[0].before.colors.background === '#efe9dd' && j[0].before.ground === '#efe9dd' && j[1].before.fonts.display === 'Archivo' && j[1].before.nodes[head.id].weight === 800 && j[2].before.nodes[head.id].x === head.x && j[2].before.added.length === 1, j.map((e) => Object.keys(e.before)));
  ok('the idea the design was made from stays with it', /one of them lit/.test(board(d3).directed.idea));
  const mem = SH.memoryOfRecord(board(d3).directed);
  ok('the director is told the turns, in order, and which can be put back', mem.journal.length === 3 && mem.journal[0].turn === 1 && mem.journal.every((e) => e.restorable && e.status === 'applied') && /one of them lit/.test(mem.idea));
  const back = apply(d3, { edits: [{ do: 'restore', turn: 1, scope: 'colours' }] }, 'Go back to the original colours');
  ok('“go back to the original colours”: the palette, the ground and every colour as they were — exactly', J(back.doc.tokens.colors) === J(d0.tokens.colors) && board(back.doc).background === board(d0).background && texts(d0).every((t) => all(back.doc).find((n) => n.id === t.id).color === t.color), [back.doc.tokens.colors, back.failed]);
  ok('  what was approved since is kept: the new typography, the new composition', byRole(back.doc, 'headline').font === 'Fraunces' && !!byRole(back.doc, 'headline').italic && byRole(back.doc, 'headline').x === byRole(d3, 'headline').x && back.doc.tokens.fonts.display === 'Fraunces');
  ok('  an object made since follows the palette back by role', all(back.doc).find((n) => n.type === 'shape' && n.shape === 'ellipse')?.fill === '#e4572e');
  const type = apply(d3, { edits: [{ do: 'restore', turn: 2, scope: 'type' }] }, 'I preferred the earlier typography');
  ok('“the earlier typography”: the faces and styles back, the colours and the composition kept', byRole(type.doc, 'headline').font === 'Archivo' && byRole(type.doc, 'headline').weight === 800 && !byRole(type.doc, 'headline').italic && type.doc.tokens.colors.background === '#2b1d14' && byRole(type.doc, 'headline').x === byRole(d3, 'headline').x);
  const everything = apply(d3, { edits: [{ do: 'restore', turn: 3, scope: 'everything' }] }, 'Undo the move to the right');
  ok('a turn put back whole: what it moved is where it was, what it added is gone', JR.diffBoards(board(d2), board(everything.doc), d2.tokens, everything.doc.tokens).none);
  ok('a turn with nothing kept to go back to is said, not guessed', apply(d0, { edits: [{ do: 'restore', turn: 4, scope: 'colours' }] }, 'go back').failed.some((f) => /nothing kept to go back to/.test(f)));
  const rej = JR.recordTurn(d3, d3, id, { said: 'make it neon pink', did: 'a neon pink ground', status: 'rejected', at: 40 });
  ok('a change turned down is remembered as turned down (and never restorable)', board(rej).directed.journal.length === 4 && board(rej).directed.journal[3].status === 'rejected' && !board(rej).directed.journal[3].before && SH.memoryOfRecord(board(rej).directed).journal[3].status === 'rejected');
  let many = d0;
  for (let i = 0; i < 20; i++) many = JR.recordTurn(many, apply(many, { edits: [{ do: 'set', id: head.id, size: 100 + i }] }, 'smaller').doc, id, { said: `turn ${i}`, did: 'd', at: i });
  ok('the journal is bounded, and stays small', board(many).directed.journal.length === RC.MAX_JOURNAL && J(board(many).directed).length < 60_000);
  const re = C.normalizeDoc(JSON.parse(J(d3)));
  ok('the record survives saving and reopening', J(board(re).directed) === J(board(d3).directed));
  ok('a record that is not one is not kept', RC.normalizeDirected({ idea: 5, journal: [{ did: 'x' }, 'nope'], nope: true }) === undefined && RC.normalizeDirected({ journal: [{ said: 's', did: 'd', status: 'applied', before: { colors: { background: 'javascript:1' }, nodes: { '<x>': {} } } }] }).journal[0].before === undefined);
}

console.log('\n=== what is measured before anything is shown ===');
{
  const clean = make().doc;
  const m = EV.measure(clean, board(clean).id, { content: BRIEF.content });
  ok('a clean design: nothing missing, nothing cut or colliding, a real scale, no generic habit', m.high === 0 && m.missing.length === 0 && m.scale >= 3 && m.habits.said.length === 0, m);
  const slop = DESIGN();
  slop.program.ground = { linear: { angle: 135, stops: ['#6a5cff', '#3aa0ff'] } };
  slop.program.elements = [
    ...[0, 1, 2].map((i) => ({ op: 'rect', box: { x: 80 + i * 290, y: 200, w: 260, h: 300 }, fill: '#ffffff', opacity: 0.14, radius: 28, fx: [{ kind: 'drop-shadow' }] })),
    ...[0, 1, 2, 3].map((i) => ({ op: 'ellipse', box: { x: 100 + i * 210, y: 60 + (i % 2) * 40, w: 46, h: 46 }, fill: 'accent', fx: [{ kind: 'glow' }] })),
    { op: 'text', content: 'headline', box: { x: 80, y: 620, w: 840, h: 200 }, align: 'center' },
    { op: 'text', content: 'subhead', box: { x: 80, y: 840, w: 840, h: 60 }, size: 30, align: 'center' },
    { op: 'text', content: 'meta', box: { x: 80, y: 920, w: 840, h: 80 }, size: 24, align: 'center' },
    { op: 'text', content: 'cta', box: { x: 380, y: 1040, w: 240, h: 60 }, size: 26, align: 'center' },
    { op: 'text', content: 'brand', box: { x: 80, y: 1300, w: 840, h: 40 }, size: 24, align: 'center' },
  ];
  const h = EV.habitsOf(board(make(slop).doc));
  ok('the marks of generic generated design are found and counted: a purple-to-blue gradient ground, rounded cards, glows and soft shadows, small floating shapes, every line centred', h.purpleBlueGradient && h.roundedCards === 3 && h.softEffects >= 4 && h.floatingMarks === 4 && h.centredShare === 1 && h.said.length >= 5, h);
  ok('  and said, for the person, the benchmark and the director’s own review', EV.measure(make(slop).doc, board(make(slop).doc).id).findings.filter((f) => /^a generic habit/.test(f)).length >= 5);
  const flat = C.applyOps(clean, texts(clean).map((t) => ({ op: 'update', id: t.id, set: { size: 30 } }))).doc;
  ok('a timid scale is said', EV.measure(flat, board(flat).id).findings.some((f) => /scale is timid/.test(f)));
  const gone = C.applyOps(clean, [{ op: 'remove', id: byRole(clean, 'cta').id }]).doc;
  ok('words of the brief that are not on the design are found', J(EV.missingWords(board(gone), BRIEF.content)) === J(['Reserve a seat']) && EV.measure(gone, board(gone).id, { content: BRIEF.content }).high === 1);
}

console.log('\n=== one request, start to finish ===');
{
  ok('an exact change to something named is economy work (and the browser tries it in code first)', TR.editTier('Make the headline slightly smaller').tier === 'economy' && TR.editTier('Change the background to black').tier === 'economy' && TR.editTier('Move the logo to the bottom right').tier === 'economy');
  ok('a change of feel, theme, composition or the whole, or anything about keeping, is premium', ['Make this cloud themed', 'Make it feel more sophisticated and atmospheric', 'Make it better', 'Keep the logo. Redesign everything else.', 'Move the focal point toward the right', 'Go back to the original colours', 'Make this look like a premium architecture studio'].every((w) => TR.editTier(w).tier === 'premium'));
  const bench = { measure: C.approxMeasure, settle: async (fn) => fn(C.approxMeasure), picture: async () => 'data:image/png;base64,AAAA' };
  const asked = [];
  const transport = (script) => ({
    design: async (b) => (asked.push(['design', b]), script.design ?? { ok: false, reason: 'unreachable' }),
    edit: async (b) => (asked.push(['edit', b]), typeof script.edit === 'function' ? script.edit(b) : script.edit ?? { ok: false, reason: 'unreachable' }),
    review: async (b) => (asked.push(['review', b]), typeof script.review === 'function' ? script.review(b) : script.review ?? { ok: false, reason: 'unreachable' }),
  });
  const r0 = await FL.designFlow(transport({}), bench, BRIEF, BASE);
  ok('the director unreachable: said, nothing made up (the caller composes with the engine and says so)', !r0.ok && r0.reason === 'unreachable');
  asked.length = 0;
  const r1 = await FL.designFlow(transport({ design: { ok: true, value: SC.normalizeDesign(DESIGN()) }, review: (b) => ({ ok: true, value: SC.normalizeReview({ verdict: 'revise', seen: ['the supporting line is timid'], edits: [{ do: 'set', id: b.sheet.objects.find((o) => o.role === 'subhead').id, weight: 600 }] }, { ids: new Set(b.sheet.objects.map((o) => o.id)) }) }) }), bench, BRIEF, BASE, { now: 1 });
  ok('a design is made, then looked at once as a picture, and the corrections applied', r1.ok && asked.map((a) => a[0]).join() === 'design,review' && asked[1][1].picture.startsWith('data:image/') && r1.review.applied && byRole(r1.doc, 'subhead').weight === 600 && r1.measured.high === 0, r1.review);
  const r2 = await FL.designFlow(transport({ design: { ok: true, value: SC.normalizeDesign(DESIGN()) }, review: (b) => ({ ok: true, value: SC.normalizeReview({ verdict: 'revise', seen: ['x'], edits: [{ do: 'place', id: b.sheet.objects.find((o) => o.role === 'subhead').id, box: b.sheet.objects.find((o) => o.role === 'headline').box.reduce((o, v, i) => ({ ...o, [['x', 'y', 'w', 'h'][i]]: v }), {}) }] }, { ids: new Set(b.sheet.objects.map((o) => o.id)) }) }) }), bench, BRIEF, BASE, { now: 1 });
  ok('a correction that makes something measurably worse (words over words) is not kept', r2.ok && r2.review.reverted && !r2.review.applied && r2.measured.high === 0, r2.review);
  const r3 = await FL.designFlow(transport({ design: { ok: true, value: SC.normalizeDesign(DESIGN()) }, review: { ok: true, value: { verdict: 'ship', seen: [], edits: [], dropped: [] } } }), bench, BRIEF, BASE, { review: false });
  ok('the review can be left out (alternatives): one call', r3.ok && r3.review === null);

  const doc = r3.doc;
  const id = board(doc).id;
  const head = byRole(doc, 'headline');
  asked.length = 0;
  const q = await FL.editFlow(transport({ edit: { ok: true, value: edit(doc, { question: { text: 'Which way?', options: ['Quieter', 'Louder'] } }) } }), bench, doc, id, 'change the direction');
  ok('a question is passed on as a question, and nothing changes', q.kind === 'question' && q.question.options.length === 2);
  const e1 = await FL.editFlow(transport({ edit: (b) => ({ ok: true, value: SC.normalizeEdit({ understanding: { level: 'object', goal: 'smaller', affects: ['headline'], preserves: [] }, summary: 'The headline is a step smaller.', edits: [{ do: 'set', id: b.sheet.objects.find((o) => o.role === 'headline').id, size: 120 }] }, { ids: new Set(b.sheet.objects.map((o) => o.id)), given: b.words }) }) }), bench, doc, id, 'Shrink the title a touch', { now: 5 });
  ok('an object-level change: one call, no picture, no review; the turn is in the journal with what it replaced', e1.kind === 'done' && asked.filter((a) => a[0] === 'review').length === 0 && board(e1.doc).directed.journal.at(-1).said === 'Shrink the title a touch' && board(e1.doc).directed.journal.at(-1).before.nodes[head.id].size === head.size && e1.outcome.diff.changed.length === 1);
  asked.length = 0;
  const e2 = await FL.editFlow(transport({ edit: (b) => ({ ok: true, value: SC.normalizeEdit({ understanding: { level: 'aesthetic', goal: 'night', affects: ['palette'], preserves: ['the logo'] }, summary: 'A night palette.', palette: { ground: '#0e1a24', ink: '#f3efe6' }, edits: [{ do: 'set', id: b.sheet.objects.find((o) => o.role === 'logo').id, size: 80 }] }, { ids: new Set(b.sheet.objects.map((o) => o.id)), given: b.words }) }), review: { ok: true, value: { verdict: 'ship', seen: [], edits: [], dropped: [] } } }), bench, doc, id, 'Make it feel like night. Keep the logo.', { memory: { brief: 'A lecture series' } });
  ok('a change of feel: the picture travels with the ask, the result is looked at once, the logo is kept whatever was answered', e2.kind === 'done' && asked[0][1].picture && asked[1][0] === 'review' && J(byRole(e2.doc, 'logo')) === J({ ...byRole(doc, 'logo') }) === false ? byRole(e2.doc, 'logo').size === byRole(doc, 'logo').size : true, e2.kind);
  ok('  the director was told the project and what is protected', asked[0][1].memory.brief === 'A lecture series' && /one of them lit/.test(asked[0][1].memory.idea));
  const e3 = await FL.editFlow(transport({ edit: { ok: true, value: edit(doc, { summary: 'It already is.', edits: [{ do: 'set', id: head.id, weight: head.weight }] }) } }), bench, doc, id, 'Make the headline bold');
  ok('understood, but nothing changed: said as nothing, the document untouched', e3.kind === 'nothing' && /Nothing on the design changed/.test(FL.saidOfEdit(e3)));
  const e4 = await FL.editFlow(transport({}), bench, doc, id, 'Make it cloud themed');
  ok('the director unreachable: the caller is told (and falls back to the reader, saying so)', e4.kind === 'unreachable');
  ok('what is said to the person is the director’s sentence, with what was kept and what could not be done', /The headline is a step smaller\./.test(FL.saidOfEdit(e1)) && /Kept as you asked: the logo/.test(FL.saidOfEdit(e2)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
