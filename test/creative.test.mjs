// SocriaUX creative intelligence — creative words read into plans of design decisions and carried out by the engine,
// concepts as structured, editable records: the reader on every example the designer gave (broad, ambiguous,
// targeted, compound, redesigns), the plan held to its shape (what a model could send that must never be carried
// out), the executor preserving what was not asked to change (the words, the logo, kept decisions, locks), each
// decision turned down on its own, the ground following the palette, forms kept off the words, concepts kept,
// revisited and combined, the record kept with each artboard and its copies, the model's reading and its strict
// schema. No model, no network.

import * as C from './.tmp/creative-under-test.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 900))));
const J = JSON.stringify;

const POSTER = { purpose: 'A poster for a summer music festival', kind: 'poster', formats: ['a4'], content: { headline: 'Open Air', subhead: 'Music in the park, all weekend', details: ['12–14 July 2027', 'Victoria Park, London'], brand: 'Parklife Society' }, mood: ['bold'], images: [] };
const SOCIAL = { purpose: 'Launch post for Halo, a smart reading lamp', kind: 'social', formats: ['instagram-square'], content: { headline: 'Meet Halo', subhead: 'Light that follows your day', details: ['Available 3 March'], brand: 'Lumen Works', cta: 'Pre-order now' }, mood: ['minimal', 'calm'], images: [] };
const make = (brief, words, seedWord, seed) => {
  const dir = C.languageDirection(brief.content.headline, brief.mood, seedWord);
  return { doc: C.composeGraphic(brief, dir, { seed }).doc, dir, kind: brief.kind };
};
const poster = () => make(POSTER, null, 'seed-a', 5);
const social = () => make(SOCIAL, null, 'seed-h', 3);
const board = (doc) => doc.artboards[0];
const words = (doc) => C.walk(board(doc)).filter((l) => l.node.type === 'text' && !l.node.decorative).map((l) => l.node.text).sort().join('|');
const logoOf = (doc) => C.walk(board(doc)).filter((l) => l.node.role === 'logo').map((l) => l.node);
const read = (w, doc, extra = {}) => C.readCreative(w, { doc, ...extra });
const kinds = (plan) => plan.changes.map((c) => c.decision);
const has = (plan, decision, pred = () => true) => plan.changes.some((c) => c.decision === decision && pred(c));
let clock = 1_800_000_000_000;
const run = (s, w, extra = {}) => {
  const r = read(w, s.doc, extra);
  if (!r || !r.plan.changes.length) return { r, e: null };
  const e = C.executePlan(s.doc, r.plan, { dir: s.dir, kind: s.kind, said: w, now: (clock += 1000), turn: 1, ...extra });
  if (e && e.doc) s.doc = e.doc;
  return { r, e };
};

// ── 1. the reader on every example the designer gave ──
{
  const { doc } = poster();
  const t = (w) => read(w, doc);
  const cloud = t('I want to make it cloud themed');
  ok('“make it cloud themed” is a theme, read plainly (no question, no model needed)', cloud && has(cloud.plan, 'theme', (c) => c.theme === 'cloud') && cloud.certain && !cloud.plan.question, J(cloud));
  const identity = t('Give it a cloud-inspired visual identity');
  ok('“a cloud-inspired visual identity” is a theme, as a brand change', identity && has(identity.plan, 'theme', (c) => c.theme === 'cloud') && identity.plan.intent === 'brand', J(identity?.plan));
  for (const [w, q] of [
    ['Make this more futuristic', 'futuristic'],
    ['Make it more editorial', 'editorial'],
    ['Make it more sophisticated', 'sophisticated'],
    ['Turn this into a premium brand experience', 'premium'],
    ['Make it more expressive', 'expressive'],
    ['Make the design feel more alive', 'alive'],
    ['Make it more dramatic', 'dramatic'],
    ['Make it pop', 'expressive'],
  ]) {
    const r = t(w);
    ok(`“${w}” is the quality “${q}” of the whole design, acted on`, r && has(r.plan, 'mood', (c) => c.qualities.includes(q)) && !has(r.plan, 'object') && !r.plan.question, J(r?.plan));
  }
  const depth = t('Create more visual depth');
  ok('“create more visual depth” deepens the design', depth && (has(depth.plan, 'depth') || has(depth.plan, 'mood', (c) => c.qualities.includes('depth'))), J(depth?.plan));
  const rethink = t('Completely rethink the composition');
  ok('“completely rethink the composition” re-conceives the composition', rethink && has(rethink.plan, 'composition', (c) => c.action === 'rethink'), J(rethink?.plan));
  const generic = t('This feels too generic. Try something more original');
  ok('“too generic, try something more original” asks for an original concept (a redesign)', generic && has(generic.plan, 'mood', (c) => c.qualities.includes('original')) && generic.plan.intent === 'redesign', J(generic?.plan));
  const keepType = t('Keep the typography but change the background');
  ok('“keep the typography but change the background”: the type kept, the ground changed', keepType && keepType.plan.keep.includes('type') && has(keepType.plan, 'background') && !has(keepType.plan, 'type'), J(keepType?.plan));
  const like = t('I like the direction, but make it more sophisticated');
  ok('“I like the direction, but make it more sophisticated” keeps the concept’s structure and refines its style', like && like.plan.keep.includes('composition') && has(like.plan, 'mood', (c) => c.qualities.includes('sophisticated')), J(like?.plan));
  const dramatic = t('Make it more dramatic');
  ok('a quality alone keeps the composition (only “original” re-conceives it)', dramatic && !has(dramatic.plan, 'composition'), J(dramatic?.plan));
  const compound = t('Keep the composition, make the typography more editorial, replace the clouds with abstract organic forms, and make the overall aesthetic more sophisticated.');
  ok('the four-part instruction is four separate decisions', compound && compound.plan.keep.includes('composition') && has(compound.plan, 'type', (c) => c.character === 'editorial') && has(compound.plan, 'forms', (c) => c.kind === 'organic' && c.abstraction >= 70) && has(compound.plan, 'mood', (c) => c.qualities.includes('sophisticated')) && !has(compound.plan, 'composition'), J(compound?.plan));
  ok('  and, being several instructions, it is one the model reads when it can', compound && !compound.certain);
  const abstract = t('Make the clouds more abstract');
  ok('“make the clouds more abstract” moves the forms’ abstraction', abstract && has(abstract.plan, 'forms', (c) => c.delta > 0), J(abstract?.plan));
  const head = t('make the headline bigger');
  ok('“make the headline bigger” is about one object: the precise reader’s', head && kinds(head.plan).every((k) => k === 'object'), J(head?.plan));
  const editorialHead = t('make the headline more editorial');
  ok('a quality said of one named object goes to that object, not the whole design', editorialHead && has(editorialHead.plan, 'object'), J(editorialHead?.plan));
  const undo = t('Undo the typography change');
  ok('“undo the typography change” turns down that one decision', undo && J(undo.plan.changes) === J([{ decision: 'revert', target: 'type' }]), J(undo?.plan));
  const dislike = t('I don’t like the new colours');
  ok('“I don’t like the new colours” turns down the palette alone', dislike && has(dislike.plan, 'revert', (c) => c.target === 'palette'), J(dislike?.plan));
  const content = t('change the headline to "Summer Nights"');
  ok('words for the design are carried exactly as written', content && has(content.plan, 'content', (c) => c.role === 'headline' && c.text === 'Summer Nights'), J(content?.plan));
  const open = t('Change the overall aesthetic');
  ok('“change the overall aesthetic” has no direction: one question, four ways to answer, nothing changed yet', open && !open.plan.changes.length && open.plan.question?.options.length === 4 && !open.certain, J(open?.plan));
  const answer = read('the second one', doc, { asked: open.plan.question });
  ok('a short answer is read against the question asked', answer && answer.plan.changes.length > 0 && J(answer.plan.changes) === J(read(open.plan.question.options[1].words, doc).plan.changes), J(answer?.plan));
  const better = t('make it better');
  ok('“make it better” is genuinely open: one question', better && better.plan.question && !better.plan.changes.length, J(better?.plan));
  const nonsense = t('flibber the wotsit');
  ok('words nothing can be made of: a question whose answers get somewhere (never an internal limitation)', nonsense && nonsense.plan.question?.options.length === 4 && !/model/i.test(J(nonsense.plan)), J(nonsense?.plan));
  // concepts
  const cm = (w) => read(w, doc)?.plan.changes.find((c) => c.decision === 'concept');
  ok('“keep this concept” keeps it', cm('keep this concept')?.action === 'save');
  ok('“save it as a concept called Dawn” keeps it by that name', cm('save it as a concept called Dawn')?.action === 'save' && /dawn/i.test(cm('save it as a concept called Dawn')?.name ?? ''));
  ok('“duplicate this concept” makes a copy to explore', cm('duplicate this concept')?.action === 'duplicate');
  ok('“compare the concepts” compares them', cm('compare the concepts')?.action === 'compare');
  ok('“go back to concept 1” revisits it', cm('go back to concept 1')?.action === 'revisit' && cm('go back to concept 1')?.ref === '1');
  ok('“show me new concepts” asks for new ones', cm('show me new concepts')?.action === 'new');
  ok('“another interpretation” keeps the decisions and conceives it again', cm('give me another interpretation')?.action === 'alternative');
  const combine = read('use the typography from concept 2', doc)?.plan;
  ok('“the typography from concept 2” takes that one decision from it', combine && J(combine.changes) === J([{ decision: 'type', from: '2' }]), J(combine));
}

// ── 2. a plan held to its shape (what a model might send) ──
{
  const strict = {
    intent: 'theme',
    summary: 'You get a cloud-themed sky.',
    keep: ['words', 'everything'],
    changes: [
      { decision: 'theme', theme: 'cloud', forms: null, abstraction: null, mode: null },
      { decision: 'theme', theme: 'atlantis', forms: null, abstraction: null, mode: null },
      { decision: 'type', character: null, display: 'Comic Sans MS', body: null, weight: null, case: null, from: null },
      { decision: 'palette', shifts: ['cooler', 'sparkly'], colours: { ground: '#zzzzzz', ink: null, accent: '#F0A050', support: ['#ffffff', 'nope'] }, from: null },
      { decision: 'forms', kind: 'cloud', abstraction: 400, delta: null, count: 9, scale: null, remove: null, from: null },
      { decision: 'content', role: 'headline', text: 'Invented copy' },
      { decision: 'delete-everything' },
      { decision: 'concept', action: 'save', ref: null, name: null },
    ],
    question: { text: 'Which?', options: [{ label: 'Only one', words: 'one' }] },
  };
  const p = C.normalizePlan(strict, 'make it cloud themed', 'model');
  ok('a plan with nulls where there is nothing to say is read (the strict schema’s shape)', !!p && p.by === 'model' && p.intent === 'theme', J(p));
  ok('  a theme outside the catalogue is dropped, a real one kept', p.changes.filter((c) => c.decision === 'theme').length === 1);
  ok('  a font off the list leaves the type change empty, so it is dropped', !p.changes.some((c) => c.decision === 'type'));
  ok('  colours that are not colours are dropped; real ones kept, in lower case', J(p.changes.find((c) => c.decision === 'palette')) === J({ decision: 'palette', shifts: ['cooler'], colours: { accent: '#f0a050', support: ['#ffffff'] } }), J(p.changes.find((c) => c.decision === 'palette')));
  ok('  numbers are bounded', p.changes.find((c) => c.decision === 'forms')?.abstraction === 100 && p.changes.find((c) => c.decision === 'forms')?.count === 3);
  ok('  words the designer did not write are never carried', !p.changes.some((c) => c.decision === 'content'));
  ok('  an unknown decision is dropped', !p.changes.some((c) => c.decision === 'delete-everything'));
  ok('  keep holds only what can be kept', J(p.keep) === J(['words']));
  ok('  a question needs at least two answers', !p.question);
  const kept = C.normalizePlan({ intent: 'global', summary: 's', keep: ['type'], changes: [{ decision: 'type', character: 'editorial' }, { decision: 'palette', shifts: ['warmer'] }] }, 'x', 'model');
  ok('a decision kept is never changed by the same plan', kept && !kept.changes.some((c) => c.decision === 'type') && kept.changes.some((c) => c.decision === 'palette'), J(kept));
  ok('nothing to do and nothing to ask: no plan', C.normalizePlan({ intent: 'global', summary: 's', keep: [], changes: [] }, 'x', 'model') === null);
  ok('a question is held to two to four answers', C.normalizeQuestion({ text: 'Which?', options: ['a', 'b', 'c', 'd', 'e'] })?.options.length === 4 && C.normalizeQuestion({ text: 'Which?', options: ['a'] }) === null);
}

// ── 3. the strict schema the model answers in ──
{
  const S = C.CREATIVE_PLAN_SCHEMA;
  const objects = [];
  const visit = (s) => {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'object') objects.push(s);
    for (const v of Object.values(s)) if (v && typeof v === 'object') Array.isArray(v) ? v.forEach(visit) : visit(v);
  };
  visit(S);
  ok('every object in the plan schema is closed and requires every field (strict mode)', objects.length > 10 && objects.every((o) => o.additionalProperties === false && J([...o.required].sort()) === J(Object.keys(o.properties).sort())), objects.length);
  const lists = [];
  const visitLists = (s) => {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'array') lists.push(s);
    for (const v of Object.values(s)) if (v && typeof v === 'object') Array.isArray(v) ? v.forEach(visitLists) : visitLists(v);
  };
  visitLists(S);
  ok('every list in it is bounded', lists.length > 3 && lists.every((l) => typeof l.maxItems === 'number'), J(lists.map((l) => l.maxItems)));
  const f = C.formatFor('creative-edit');
  ok('the stage asks for it by name, strictly', f?.type === 'json_schema' && f.name === 'socriaux_creative_edit' && f.strict === true && f.schema === S);
  const sys = C.creativeSystem();
  ok('the instructions carry every theme, quality, form and move the engine knows', C.THEMES.every((t) => sys.includes(t.id)) && C.QUALITIES.every((q) => sys.includes(q.id)) && C.FORM_KINDS.every((k) => sys.includes(k)));
  ok('  and say to preserve what was not asked, never to invent copy, and to ask only when the words mean different things', /Change only what the words ask for/.test(sys) && /Never write new words/.test(sys) && /Ask one question only when/.test(sys));
}

// ── 4. the executor: what was asked changes; nothing else does ──
{
  const s = poster();
  const before = words(s.doc);
  const logo0 = J(logoOf(s.doc).map((n) => [n.text, n.font, n.color]));
  const { e } = run(s, 'I want to make it cloud themed');
  const rec = board(s.doc).creative;
  ok('the cloud theme is carried out: its palette, its ground, clouds, depth', e && ['palette', 'background', 'forms', 'depth', 'mood'].every((k) => e.changed.includes(k)) && rec?.forms?.kind === 'cloud' && rec.forms.ids.length > 0, J(e?.done));
  ok('  the words are exactly as they were', words(s.doc) === before);
  ok('  the logo is kept, its colours too where it still reads', logoOf(s.doc).length === 1 && (J(logoOf(s.doc).map((n) => [n.text, n.font, n.color])) === logo0 || e.notes.some((n) => /logo/.test(n))), J(logoOf(s.doc)));
  ok('  the type did not change (a theme changes type only for an identity)', s.doc.tokens.fonts.display === poster().doc.tokens.fonts.display);
  const d = C.readDecisions(s.doc);
  ok('  the ground is graded, as the theme has it', d.background.kind === 'gradient' && d.background.colours.length >= 2, J(d.background));
  ok('  the record is kept with the artboard, not the document', !!board(s.doc).creative && s.doc.creative === undefined);
  const findings = C.checkDoc(s.doc).filter((f) => f.severity === 'high');
  ok('  checked: nothing high is left', findings.length === 0, J(findings.map((f) => f.message)));

  // forms stay off the words
  const texts = C.walk(board(s.doc)).filter((l) => l.node.type === 'text').map((l) => l.node);
  const forms = C.walk(board(s.doc)).filter((l) => rec.forms.ids.includes(l.node.id)).map((l) => l.node);
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  ok('  no cloud sits beneath the words', forms.every((f) => texts.every((t) => overlap(f, t) <= 0.05 * f.w * f.h)), J(forms.map((f) => [f.x, f.y, f.w, f.h].map(Math.round))));

  const abstract = run(s, 'Make the clouds more abstract').e;
  ok('“more abstract” redraws the same clouds more abstractly, in place', abstract && board(s.doc).creative.forms.abstraction > rec.forms.abstraction && board(s.doc).creative.forms.seed === rec.forms.seed, J(board(s.doc).creative.forms));
  const fonts0 = J(s.doc.tokens.fonts);
  const bg0 = C.readDecisions(s.doc).background;
  const kt = run(s, 'Keep the typography but change the background').e;
  ok('“keep the typography, change the background”: the ground changes, the type does not', kt && J(s.doc.tokens.fonts) === fonts0 && J(C.readDecisions(s.doc).background) !== J(bg0) && kt.kept.includes('the typography'), J({ bg0, bg: C.readDecisions(s.doc).background, kept: kt?.kept }));

  // the ground follows the palette (a dark palette never leaves a light sky behind the words)
  const dark = run(s, 'Make this more futuristic').e;
  const d2 = C.readDecisions(s.doc);
  const head = C.walk(board(s.doc)).find((l) => l.node.role === 'headline' || (l.node.type === 'text' && l.node.size === Math.max(...texts.map((x) => x.size))))?.node;
  ok('a dark palette brings its ground with it: every stop of the ground is dark', dark && d2.palette.mode === 'dark' && d2.background.colours.every((c) => C.contrastRatio(c, '#000000') < 3.2), J(d2.background));
  ok('  and the words read on it (no repair needed for the headline)', !dark.notes.some((n) => /Headline.*reads at/.test(n)) && C.contrastRatio(head.color.slice(0, 7), d2.palette.ground) >= 3, J(dark?.notes));
  ok('  the clouds took the new colours too', C.walk(board(s.doc)).filter((l) => board(s.doc).creative.forms?.ids.includes(l.node.id)).every((l) => typeof l.node.fill !== 'string' || C.contrastRatio(l.node.fill.slice(0, 7), '#ffffff') > 1.2));

  // one decision turned down, the rest kept
  const fontsDark = J(s.doc.tokens.fonts);
  const palDark = J(s.doc.tokens.colors);
  run(s, 'make the typography more editorial');
  ok('a type change made', J(s.doc.tokens.fonts) !== fontsDark);
  const back = run(s, 'Undo the typography change').e;
  ok('“undo the typography change” puts back only the type', back && J(s.doc.tokens.fonts) === fontsDark && J(s.doc.tokens.colors) === palDark, J({ fonts: s.doc.tokens.fonts, done: back?.done }));
  ok('the words survived every change', words(s.doc) === before);
}

// ── 5. the compound instruction, the qualities, locks ──
{
  const s = poster();
  run(s, 'I want to make it cloud themed');
  const comp0 = J(board(s.doc).children.filter((n) => n.type === 'text').map((n) => [n.id, Math.round(n.x), Math.round(n.y)]));
  const { e } = run(s, 'Keep the composition, make the typography more editorial, replace the clouds with abstract organic forms, and make the overall aesthetic more sophisticated.');
  const rec = board(s.doc).creative;
  ok('the compound instruction: organic forms, abstract, in place of the clouds', e && rec.forms?.kind === 'organic' && rec.forms.abstraction >= 70, J(rec.forms));
  ok('  the type made editorial', e.done.some((d) => /editorial/.test(d)), J(e.done));
  ok('  the palette made sophisticated (muted, restrained)', e.done.some((d) => /muted|restrained/.test(d)), J(e.done));
  ok('  the composition kept: the words where they were', J(board(s.doc).children.filter((n) => n.type === 'text').map((n) => [n.id, Math.round(n.x), Math.round(n.y)])) === comp0 || e.kept.includes('the composition'), comp0);

  const l = poster();
  l.doc = { ...l.doc, locks: { colors: true } };
  const colours0 = J(l.doc.tokens.colors);
  const le = run(l, 'make the colours warmer').e;
  ok('locked colours are kept and said, never overridden', J(l.doc.tokens.colors) === colours0 && (le === null || le.kept.some((k) => /locked/.test(k))), J(le));
}

// ── 6. a crowded square: forms find room or are left out, never beneath the words ──
{
  const s = social();
  const steps = ['Give it a cloud-inspired visual identity', 'Make it more expressive', 'Make the clouds more abstract', 'Make it more dramatic', 'Make it pop'];
  let worst = 0;
  for (const w of steps) {
    run(s, w);
    const b = board(s.doc);
    const texts = C.walk(b).filter((x) => x.node.type === 'text').map((x) => x.node);
    const forms = C.walk(b).filter((x) => b.creative?.forms?.ids.includes(x.node.id)).map((x) => x.node);
    for (const f of forms) for (const t of texts) {
      const o = Math.max(0, Math.min(f.x + f.w, t.x + t.w) - Math.max(f.x, t.x)) * Math.max(0, Math.min(f.y + f.h, t.y + t.h) - Math.max(f.y, t.y));
      worst = Math.max(worst, o / (f.w * f.h));
    }
  }
  ok('through five changes on a crowded square, no form lies beneath the words', worst <= 0.05, worst);
  ok('  and the words are still exactly as written', words(s.doc) === words(social().doc));
}

// ── 7. concepts: kept, revisited, combined; the record follows copies ──
{
  const s = poster();
  run(s, 'I want to make it cloud themed');
  const b = board(s.doc);
  const saved = C.saveConcept(s.doc, b.id, { name: 'Sky', said: 'I want to make it cloud themed', now: 1 });
  let r = C.applyOps(s.doc, [saved.op]);
  ok('a concept is kept: the artboard as it is, its palette and type', r.ok && r.doc.concepts?.length === 1 && r.doc.concepts[0].name === 'Sky' && r.doc.concepts[0].board.creative?.forms?.kind === 'cloud' && J(r.doc.concepts[0].tokens.fonts) === J(s.doc.tokens.fonts), J(r.ok ? r.doc.concepts : r));
  ok('  without the history of how it got there', r.doc.concepts[0].board.creative.history === undefined);
  s.doc = r.doc;
  const skyFonts = J(s.doc.tokens.fonts);
  run(s, 'Make it more dramatic');
  ok('the working artboard moves on', J(s.doc.tokens.fonts) !== skyFonts || J(board(s.doc).creative.qualities) !== J(r.doc.concepts[0].board.creative.qualities));
  const back = C.revisitConcept(s.doc, board(s.doc).id, s.doc.concepts[0].id, 2);
  ok('going back to it puts it on the artboard, with its palette and type', back && J(back.doc.tokens.fonts) === skyFonts && back.doc.artboards[0].creative.forms.kind === 'cloud' && back.doc.artboards[0].id === board(s.doc).id, J(back?.label));
  ok('  what was there is kept first, so nothing is lost', back.keptAs && back.doc.concepts.length === 2 && back.doc.concepts[1].board.creative.qualities?.includes('dramatic'), J(back?.doc.concepts.map((c) => c.name)));
  ok('  the forms it points at are on the artboard', C.creativeFormIds(back.doc, back.doc.artboards[0]).length === back.doc.artboards[0].creative.forms.ids.length);
  const round = C.normalizeDoc(JSON.parse(J(back.doc)));
  ok('kept concepts and each artboard’s record survive being saved and read back', round && round.concepts?.length === 2 && round.artboards[0].creative?.forms?.kind === 'cloud' && round.concepts[0].board.creative?.forms?.kind === 'cloud', J(round?.concepts?.map((c) => c.name)));

  // combining: one decision from another concept, the rest kept
  const t = poster();
  run(t, 'make the typography more editorial');
  const kept = C.saveConcept(t.doc, board(t.doc).id, { name: 'Editorial' });
  t.doc = C.applyOps(t.doc, [kept.op]).doc;
  const editorialFonts = J(t.doc.tokens.fonts);
  run(t, 'Undo the typography change');
  run(t, 'I want to make it cloud themed');
  const colours = J(t.doc.tokens.colors);
  const take = C.executePlan(t.doc, C.takeFrom(t.doc.concepts[0].id, ['type'], 'the typography of “Editorial”'), { kind: 'poster', said: 'the typography of Editorial', concepts: C.conceptRefs(t.doc, board(t.doc).id), now: 5 });
  ok('the typography of a kept concept, taken into this one: its faces, nothing else', take && J(take.doc.tokens.fonts) === editorialFonts && J(take.doc.tokens.colors) === colours && take.doc.artboards[0].creative.forms?.kind === 'cloud', J({ fonts: take?.doc.tokens.fonts, done: take?.done }));
  const refs = C.conceptRefs(t.doc, board(t.doc).id);
  ok('“concept 1” is the first kept', C.conceptRef(refs, 'concept 1')?.id === t.doc.concepts[0].id && C.conceptRef(refs, 'Editorial')?.id === t.doc.concepts[0].id);

  // a copy of the artboard keeps its decisions, pointing at its own forms
  const dup = C.applyOps(s.doc, [{ op: 'artboard-duplicate', id: board(s.doc).id }]);
  const copy = dup.ok && dup.doc.artboards[1];
  ok('a copy of an artboard keeps its decisions, pointing at its own copies of the forms', copy && copy.creative?.forms?.ids.length === board(s.doc).creative.forms.ids.length && C.creativeFormIds(dup.doc, copy).length === copy.creative.forms.ids.length && copy.creative.forms.ids.every((id) => !board(s.doc).creative.forms.ids.includes(id)), J(copy?.creative?.forms));
  // the oldest kept goes past the limit
  let many = s.doc;
  for (let i = 0; i < C.MAX_CONCEPTS + 2; i++) many = C.applyOps(many, [C.saveConcept(many, board(many).id, { name: `K${i}` }).op]).doc;
  ok('at most MAX_CONCEPTS are kept, the oldest letting go first', many.concepts.length === C.MAX_CONCEPTS && many.concepts[many.concepts.length - 1].name === `K${C.MAX_CONCEPTS + 1}`, many.concepts.map((c) => c.name).join(','));
  const forgot = C.applyOps(many, [C.forgetConcept(many, many.concepts[0].id)]);
  ok('a kept concept can be let go', forgot.ok && forgot.doc.concepts.length === C.MAX_CONCEPTS - 1);
}

// ── 8. the decisions in words, and the model's reading ──
{
  const s = poster();
  run(s, 'I want to make it cloud themed');
  const views = C.decisionViews(s.doc);
  ok('each decision is said in words, with where it came from', views.length === 7 && views.every((v) => v.value && ['engine', 'you', 'concept'].includes(v.source)) && views.find((v) => v.key === 'forms').source === 'you' && views.find((v) => v.key === 'type').source === 'engine', J(views.map((v) => [v.key, v.source, v.value])));
  ok('  each one changed can be put back on its own', views.filter((v) => v.revertible).map((v) => v.key).sort().join(',') === ['background', 'depth', 'forms', 'mood', 'palette'].sort().join(','), J(views.map((v) => [v.key, v.revertible])));
  const reading = C.readingOf(s.doc, board(s.doc).id);
  ok('the model reads the design compactly: its objects, words, palette, type and decisions — no pictures, no paths', reading.objects.length > 0 && reading.objects.length <= 40 && reading.objects.some((o) => o.words === 'Open Air') && reading.decisions.length === 7 && !/data:image|<path|"d":/.test(J(reading)), J(reading).slice(0, 400));
  const evil = C.normalizeReading({ ...reading, objects: Array.from({ length: 90 }, () => ({ role: 'x'.repeat(99), words: 'w'.repeat(900) })), palette: { background: 'javascript:alert(1)', text: '#111111' } });
  ok('a reading sent by a browser is held to its size and shape', evil.objects.length === 40 && evil.objects[0].words.length <= 80 && evil.objects[0].role.length <= 20 && J(evil.palette) === J({ text: '#111111' }), J(evil).slice(0, 300));
  const user = C.creativeUser('make it cloud themed', reading, null, [{ said: 'warmer', did: 'the colour warmer' }]);
  ok('the model is given the words, the design and the turns before', /THE DESIGNER SAYS: make it cloud themed/.test(user) && /EARLIER IN THIS CONVERSATION/.test(user) && /Open Air/.test(user));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
