// SocriaUX 2.0 — the creative platform: designs combined across artboards ("the typography of the first with the
// composition of the second", "combine the best elements"), alternatives on artboards of their own ("try something
// completely different", "keep the visual language but change the composition"), artboards with a visual language of
// their own, identities generated from words ("a premium architectural studio identity"), vague improvements read
// against the design in front ("make it more interesting"), precise edits by degree ("slightly smaller"), comments
// pinned on objects. No model, no network: everything here is the engine's own.

import * as P from './.tmp/platform-under-test.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 900))));
const J = JSON.stringify;

const BRIEF = { purpose: 'A poster for an architecture studio open house', kind: 'poster', formats: ['a4'], content: { headline: 'Open Studio', subhead: 'Drawings, models and conversations', details: ['14 March 2027', 'Kanso Architects, Leeds'], brand: 'Kanso' }, mood: ['minimal'], images: [] };
const calmDir = P.languageDirection('Open Studio', ['minimal', 'calm'], 'one');
const loudDir = P.languageDirection('Open Studio', ['bold', 'expressive', 'playful'], 'two-x');
const calm = () => P.composeGraphic(BRIEF, calmDir, { seed: 3 }).doc;
const loud = () => P.composeGraphic(BRIEF, loudDir, { seed: 17 }).doc;
/** Two designs in one document, the second made in another direction (a visual language of its own). */
const pair = () => {
  const a = calm();
  const b = loud();
  return P.normalizeDoc({ ...a, artboards: [{ ...a.artboards[0], name: 'Calm' }, { ...b.artboards[0], id: 'ab_second', name: 'Loud', tokens: b.tokens, direction: { name: loudDir.name, language: loudDir.language }, children: b.artboards[0].children.map((n) => ({ ...n, id: `x${n.id}` })) }] });
};
const texts = (board) => P.walk(board).filter((l) => l.node.type === 'text' && !l.node.decorative).map((l) => l.node.text).sort().join('|');
const sim = (a, b) => P.similarity(P.signatureOfBoard(a), P.signatureOfBoard(b));
const high = (doc, board) => P.checkDoc({ ...doc, artboards: [board], tokens: P.boardTokens(doc, board) }).filter((f) => f.severity === 'high');

// ── 1. artboards with a visual language of their own ──
{
  const doc = pair();
  ok('an artboard keeps tokens of its own through normalisation', !!doc.artboards[1].tokens && doc.artboards[1].tokens.fonts.display === loud().tokens.fonts.display && !doc.artboards[0].tokens, J(doc.artboards.map((b) => !!b.tokens)));
  ok('  and the direction it came from', doc.artboards[1].direction?.name === loudDir.name);
  const d1 = P.readDecisions(doc, doc.artboards[1].id);
  const d0 = P.readDecisions(doc, doc.artboards[0].id);
  ok('decisions are read in each artboard’s own colours', d1.palette.accent === doc.artboards[1].tokens.colors.accent && d0.palette.accent === doc.tokens.colors.accent, J([d0.palette, d1.palette]));
  const view = P.boardView(doc, 'ab_second');
  ok('the view of an artboard puts its tokens in the document’s place, the others holding theirs', view.tokens === doc.artboards[1].tokens && J(view.artboards[0].tokens) === J(doc.tokens));
  const back = P.fromBoardView(doc, view, 'ab_second');
  ok('  and goes back exactly', J(back) === J(doc));
  // an edit on the second artboard changes its own colours only
  const r = P.applyOps(view, [{ op: 'tokens', set: { colors: { accent: '#123456' } } }]);
  const after = P.fromBoardView(doc, r.doc, 'ab_second');
  ok('a change of colour on an artboard of its own stays on it', after.artboards[1].tokens.colors.accent === '#123456' && after.tokens.colors.accent === doc.tokens.colors.accent && !after.artboards[0].tokens, J([after.tokens.colors.accent, after.artboards[1].tokens.colors.accent]));
  const svg = P.renderArtboard(doc, doc.artboards[1]);
  ok('an artboard of its own renders', svg.startsWith('<svg') && svg.length > 500);
}

// ── 2. combining designs: reading ──
{
  const doc = pair();
  const cur = 'ab_second';
  const read = (w) => P.readSynthesis(w, doc, cur);
  const t6 = read('Take the typography from the first and the visual composition from the second.');
  ok('“the typography from the first and the visual composition from the second” is read as two decisions from two artboards', t6?.plan && t6.plan.onto === 'new' && t6.plan.base.id === cur && t6.plan.takes.some((t) => t.key === 'type' && t.from.id === doc.artboards[0].id) && t6.plan.takes.some((t) => t.key === 'composition' && t.from.id === cur), J(t6));
  const other = read('the layout of this one with the fonts of the other one');
  ok('“this one” and “the other one” are the artboard in front and the one beside it', other?.plan && other.plan.takes.find((t) => t.key === 'composition')?.from.id === cur && other.plan.takes.find((t) => t.key === 'type')?.from.id === doc.artboards[0].id, J(other));
  const waiting = read('the typography and the colours from the first, the composition from the second');
  ok('decisions said before their source wait for it', waiting?.plan && waiting.plan.takes.find((t) => t.key === 'type')?.from.id === doc.artboards[0].id && waiting.plan.takes.find((t) => t.key === 'palette')?.from.id === doc.artboards[0].id, J(waiting));
  const rest = read('keep the typography of the first, everything else from the second');
  ok('“everything else from the second” takes the rest (and the composition) from it', rest?.plan && rest.plan.base.id === cur && rest.plan.takes.find((t) => t.key === 'type')?.from.id === doc.artboards[0].id && rest.plan.takes.find((t) => t.key === 'palette')?.from.id === cur, J(rest));
  const one = read('use the colours of the first');
  ok('one decision from one other artboard comes onto the artboard in front (no new artboard)', one?.plan && one.plan.onto === 'current' && one.plan.takes.length === 1 && one.plan.takes[0].key === 'palette', J(one));
  const merge = read('merge these two');
  ok('“merge these two” asks which should lead, its answers ready to say', merge?.question && merge.question.options.length === 3 && merge.question.options.every((o) => P.readSynthesis(o.words, doc, cur)), J(merge));
  for (const w of ['make the colours of the first one warmer', 'Keep the typography and logo, but completely redesign the rest.', 'take a second look at the typography', 'first, use a darker palette', 'Make the headline slightly smaller.', 'Give me five different versions', 'undo the last change'])
    ok(`“${w}” is not a combination`, read(w) === null, J(read(w)));
  const best = read('combine the best elements');
  ok('“combine the best elements” chooses by measure, each choice with what was measured', best?.plan?.measured && best.plan.takes.filter((t) => t.why).length === 3 && best.plan.takes.every((t) => doc.artboards.some((b) => b.id === t.from.id)), J(best));
  const single = P.readSynthesis('combine the best elements', calm(), calm().artboards[0].id);
  ok('  with one design there is nothing to combine, and it says how to get more', single?.note && /versions/.test(single.note), J(single));
}

// ── 3. combining designs: the combination ──
{
  const doc = pair();
  const cur = 'ab_second';
  const { plan } = P.readSynthesis('Take the typography from the first and the visual composition from the second.', doc, cur);
  const r = P.synthesize(doc, plan, { current: cur, said: 'take the typography from the first and the visual composition from the second', now: 1 });
  const made = r.doc.artboards.find((b) => b.id === r.board);
  ok('the combination is a new artboard, after the two it came from', r.created && r.doc.artboards.length === 3 && r.doc.artboards[2].id === r.board, J(r.doc.artboards.map((b) => b.name)));
  ok('  the designs it came from are unchanged', J(r.doc.artboards[0]) === J(doc.artboards[0]) && J(r.doc.artboards[1]) === J(doc.artboards[1]));
  ok('  its composition is the second’s (the same arrangement)', sim(made, doc.artboards[1]) >= 0.95, sim(made, doc.artboards[1]));
  const h = P.mainWords(made);
  const h0 = P.mainWords(doc.artboards[0]);
  ok('  its typography is the first’s (the headline’s face, weight and case)', h.font === h0.font && h.weight === h0.weight && (h.case ?? 'none') === (h0.case ?? 'none'), J([h.font, h.weight, h0.font, h0.weight]));
  ok('  its own faces are the first’s; the document’s are untouched', made.tokens?.fonts.display === h0.font && J(r.doc.tokens) === J(doc.tokens), J(made.tokens?.fonts));
  ok('  its colours are the second’s', made.background === doc.artboards[1].background && made.tokens.colors.accent === doc.artboards[1].tokens.colors.accent);
  ok('  its words are the person’s own, all of them', texts(made) === texts(doc.artboards[1]));
  ok('  nothing overflows or fails contrast', high(r.doc, made).length === 0, J(high(r.doc, made).map((f) => f.message)));
  ok('  and it says what came from where', r.done.some((d) => /typography of “Calm”/.test(d)) && r.done.some((d) => /composition of “Loud”/.test(d)), J(r.done));
  // the best of each
  const best = P.readSynthesis('combine the best elements', doc, cur).plan;
  const rb = P.synthesize(doc, best, { current: cur, said: 'combine the best elements', now: 2 });
  const mb = rb.doc.artboards.find((b) => b.id === rb.board);
  ok('the best of each makes a coherent new artboard', rb.created && mb && high(rb.doc, mb).length === 0 && texts(mb) === texts(doc.artboards[0]), J(rb.notes));
  // onto the artboard in front
  const onto = P.synthesize(doc, P.readSynthesis('use the colours of the first', doc, cur).plan, { current: cur, said: 'use the colours of the first', now: 3 });
  const front = onto.doc.artboards.find((b) => b.id === cur);
  ok('one decision taken onto the artboard in front changes its colours, not its arrangement or the other artboard', !onto.created && onto.doc.artboards.length === 2 && front.tokens.colors.accent === doc.tokens.colors.accent && sim(front, doc.artboards[1]) > 0.9 && J(onto.doc.artboards[0]) === J(doc.artboards[0]), J([front.tokens.colors, doc.tokens.colors.accent]));
}

// ── 4. alternatives, each on an artboard of its own ──
{
  const t = (w) => P.readAlternatives(w);
  ok('“Try something completely different” is another direction', t('Try something completely different')?.kind === 'directions' && t('Try something completely different').count === 1);
  ok('“Give me three new directions” is three directions', t('Give me three new directions')?.kind === 'directions' && t('Give me three new directions').count === 3);
  ok('“Give me five different versions” is five arrangements in the same language', t('Give me five different versions')?.kind === 'compositions' && t('Give me five different versions').count === 5);
  ok('“Keep the visual language but change the composition” is one new arrangement, the look kept', t('Keep the visual language but change the composition')?.kind === 'same-look');
  for (const w of ['Make the headline different', 'Try a different font', 'a different style for the headline', 'Make it more interesting', 'Combine the best elements', 'Make this cloud themed.']) ok(`“${w}” is not an alternative`, t(w) === null, J(t(w)));
  // the same look, another arrangement, on a copy (as the editor makes it)
  const doc = calm();
  const b0 = doc.artboards[0];
  const r0 = P.applyOps(doc, [{ op: 'artboard-duplicate', id: b0.id, name: 'copy' }]);
  const id = r0.touched[0];
  const copy = P.withOwnTokens(r0.doc, id, P.boardTokens(doc, b0));
  const plan = { intent: 'composition', summary: 'x', keep: ['palette', 'type', 'forms', 'background', 'depth', 'words', 'logo', 'pictures'], changes: [{ decision: 'composition', action: 'rethink' }], by: 'reader' };
  const e = P.executePlan(copy, plan, { board: id, dir: calmDir, kind: 'poster', said: 'keep the visual language but change the composition', now: 5 });
  const nb = e.doc.artboards.find((b) => b.id === id);
  ok('another arrangement in the same language: a different structure', sim(nb, b0) < 0.86, sim(nb, b0));
  ok('  the same faces and ground, the same words', P.mainWords(nb).font === P.mainWords(b0).font && nb.background === b0.background && texts(nb) === texts(b0));
  ok('  and the original untouched', J(e.doc.artboards[0]) === J(b0));
}

// ── 5. identities generated from words ──
{
  const doc = calm();
  const b = doc.artboards[0];
  const id = P.readIdentity('Turn this into a premium architectural studio identity.', { doc, board: b.id });
  ok('“a premium architectural studio identity” is read as an identity with its qualities', id && /architectural studio/.test(id.subject) && id.qualities.includes('premium'), J(id && { s: id.subject, q: id.qualities }));
  ok('  its plan sets generated colours and faces from the library, keeps the words and the composition', id.plan.changes.some((c) => c.decision === 'palette' && c.colours?.ground && c.colours?.accent) && id.plan.changes.some((c) => c.decision === 'type' && c.display) && id.plan.keep.includes('words') && id.plan.keep.includes('composition'), J(id.plan));
  ok('  and says why', /premium architectural studio identity/.test(id.plan.reason ?? ''), id.plan.reason);
  const other = P.readIdentity('Turn this into a playful kids bookshop brand', { doc, board: b.id });
  const fontsOf = (x) => x.plan.changes.find((c) => c.decision === 'type');
  ok('another identity generates another language', other && (fontsOf(other).display !== fontsOf(id).display || other.plan.changes[0].colours.accent !== id.plan.changes[0].colours.accent), J([fontsOf(other), fontsOf(id)]));
  for (const w of ['Give it a cloud-inspired visual identity', 'Make it more sophisticated', 'Make the headline bigger']) ok(`“${w}” is not a subject identity`, P.readIdentity(w, { doc, board: b.id }) === null);
  const r = P.readCreative('Turn this into a premium architectural studio identity.', { doc, board: b.id });
  const e = P.executePlan(doc, r.plan, { dir: calmDir, kind: 'poster', said: 'identity', now: 9, board: b.id });
  const nb = e.doc.artboards[0];
  ok('carried out: new faces and colours, the same words and arrangement, nothing failing', P.mainWords(nb).font === fontsOf(id).display.replace(/^$/, P.mainWords(nb).font) && texts(nb) === texts(b) && sim(nb, b) > 0.6 && high(e.doc, nb).length === 0, J({ font: P.mainWords(nb).font, want: fontsOf(id).display, sim: sim(nb, b), high: high(e.doc, nb).map((f) => f.message) }));
}

// ── 6. vague improvements, measured ──
{
  const doc = calm();
  const b = doc.artboards[0];
  for (const w of ['Make it more interesting.', 'it feels flat', 'make it better', 'improve it']) {
    const r = P.readCreative(w, { doc, board: b.id });
    ok(`“${w}” is measured: at most three moves, with the reason said (or one question when nothing measures weak)`, r && ((r.plan.changes.length >= 1 && r.plan.changes.length <= 3 && r.plan.reason && !r.plan.question) || (!r.plan.changes.length && r.plan.question?.options.length === 4)), J(r?.plan));
  }
  ok('the aims are told apart', P.improveAimOf('Make it more interesting') === 'interest' && P.improveAimOf('make it better') === 'quality' && P.improveAimOf('Make the headline bigger') === null && P.improveAimOf('make it more editorial') === null);
  // a centred, symmetrical design with nothing but type: the measures find both
  const flat = P.normalizeDoc({ ...doc, artboards: [{ ...b, children: b.children.filter((n) => n.type === 'text').map((n) => ({ ...n, x: b.width / 2 - n.w / 2, align: 'center' })) }] });
  const w = P.weaknesses(flat, flat.artboards[0].id, 'interest');
  ok('a centred, symmetrical, type-only design: the composition and the missing forms are what the measures find', w.some((x) => x.key === 'composition' && x.change.action === 'asymmetric') && w.some((x) => x.key === 'forms'), J(w.map((x) => [x.key, x.found, x.gain])));
  const plan = P.improvementPlan(flat, flat.artboards[0].id, 'make it more interesting', 'interest').plan;
  const e = P.executePlan(flat, plan, { dir: calmDir, kind: 'poster', said: 'make it more interesting', now: 11, board: flat.artboards[0].id });
  ok('  carried out, the words all kept and nothing failing', e && e.done.length >= 1 && texts(e.doc.artboards[0]) === texts(flat.artboards[0]) && high(e.doc, e.doc.artboards[0]).length === 0, J(e && { done: e.done, notes: e.notes }));
}

// ── 7. precise edits by degree, the rest untouched ──
{
  const doc = calm();
  const b = doc.artboards[0];
  const h = P.mainWords(b);
  const size = (w) => {
    const e = P.readGraphicEdit(w, doc, { artboard: b.id, selection: [] });
    const r = P.applyOps(doc, e.ops);
    return { r, s: P.mainWords(r.doc.artboards[0]).size, e };
  };
  const s1 = size('Make the headline slightly smaller.');
  ok('“slightly smaller” is a nudge (under 10%)', s1.s < h.size && s1.s > h.size * 0.9, [h.size, s1.s]);
  const others = (d) => J(P.walk(d.artboards[0]).filter((l) => l.node.id !== h.id).map((l) => l.node));
  ok('  only the headline changes', others(s1.r.doc) === others(doc));
  const s2 = size('make the headline much smaller');
  ok('“much smaller” is a real change (over 25%)', s2.s < h.size / 1.25, [h.size, s2.s]);
  const s3 = size('make the headline 30% smaller');
  ok('  a percentage is that percentage', Math.abs(s3.s - h.size / 1.3) < 0.2, [h.size, s3.s]);
}

// ── 8. keep the typography and logo, completely redesign the rest ──
{
  const doc = calm();
  const b = doc.artboards[0];
  const w = 'Keep the typography and logo, but completely redesign the rest.';
  const r = P.readCreative(w, { doc, board: b.id });
  ok('kept: the typography and the logo; changed: the composition, the colours, the ground', r.plan.keep.includes('type') && r.plan.keep.includes('logo') && r.plan.changes.some((c) => c.decision === 'composition') && r.plan.changes.some((c) => c.decision === 'palette') && r.plan.changes.some((c) => c.decision === 'background'), J(r.plan));
  const e = P.executePlan(doc, r.plan, { dir: calmDir, kind: 'poster', said: w, now: 13, board: b.id });
  const nb = e.doc.artboards[0];
  const fonts = (x) => P.walk(x).filter((l) => l.node.type === 'text' && !l.node.decorative).map((l) => `${l.node.role}:${l.node.font}`).sort().join('|');
  const logo = (x) => P.walk(x).filter((l) => l.node.role === 'logo').map((l) => `${l.node.text ?? ''}|${l.node.font ?? ''}`).join(',');
  ok('  the faces stay as they were, role by role', fonts(nb) === fonts(b), J([fonts(nb), fonts(b)]));
  ok('  the logo is the same logo (its words and face)', logo(nb) === logo(b), J([logo(nb), logo(b)]));
  ok('  the rest is new: another arrangement and another ground', sim(nb, b) < 0.86 && nb.background !== b.background, J({ sim: sim(nb, b), bg: [b.background, nb.background] }));
  ok('  the words are the person’s own and nothing fails', texts(nb) === texts(b) && high(e.doc, nb).length === 0, J(high(e.doc, nb).map((f) => f.message)));
}

// ── 9. comments pinned on objects ──
{
  const doc = calm();
  const b = doc.artboards[0];
  const h = P.mainWords(b);
  const list = P.normalizeComments([{ id: 'cm1', board: b.id, nodes: [h.id, 'nope'], text: ' Make this feel lighter ', at: 5, status: 'open' }, { board: 'gone', nodes: [], text: 'x' }, { board: b.id, nodes: [], text: '' }], doc);
  ok('a comment keeps only the objects that exist, on an artboard that exists, with words', list.length === 1 && J(list[0].nodes) === J([h.id]) && list[0].text === 'Make this feel lighter' && list[0].status === 'open', J(list));
  const r = P.applyOps(doc, [{ op: 'comments', comments: list }]);
  ok('comments are kept with the design through its operation, and back through normalisation', r.ok && r.doc.comments?.length === 1 && P.normalizeDoc(r.doc).comments?.length === 1);
  const many = P.normalizeComments(Array.from({ length: 90 }, (_, i) => ({ board: b.id, nodes: [h.id], text: `c${i}` })), doc);
  ok('comments are bounded', many.length <= 60);
}

// ── 10. a comment changes only what it is pinned to ──
{
  const doc = calm();
  const b = doc.artboards[0];
  const h = P.mainWords(b);
  const others = (d, id) => J(P.walk(d.artboards[0]).filter((l) => l.node.id !== id).map((l) => l.node));
  const warm = P.readScoped('make this warmer', doc, b.id, [h.id]);
  const rw = P.applyOps(doc, warm.ops);
  ok('“make this warmer” on the headline moves its colour toward warm, and nothing else', warm && P.mainWords(rw.doc.artboards[0]).color !== h.color && others(rw.doc, h.id) === others(doc, h.id), J(warm));
  const prem = P.readScoped('this should feel more premium', doc, b.id, [h.id]);
  const rp = P.applyOps(doc, prem.ops);
  ok('“this should feel more premium” on the headline sets it in a luxurious face, and nothing else changes', prem && P.mainWords(rp.doc.artboards[0]).font !== h.font && others(rp.doc, h.id) === others(doc, h.id), J(prem));
  ok('  and says what it did', /headline|set/i.test(prem.label), prem.label);
  const shape = P.walk(b).find((l) => l.node.type === 'shape' && typeof l.node.fill === 'string' && !l.node.locked);
  if (shape) {
    const sl = P.readScoped('make this darker', doc, b.id, [shape.node.id]);
    const rs = P.applyOps(doc, sl.ops);
    const after = P.walk(rs.doc.artboards[0]).find((l) => l.node.id === shape.node.id).node;
    ok('“make this darker” on a shape darkens that shape alone', sl && after.fill !== shape.node.fill && others(rs.doc, shape.node.id) === others(doc, shape.node.id), J([shape.node.fill, after.fill]));
  }
  ok('words that name nothing an object can do are not guessed at', P.readScoped('hmm what about it', doc, b.id, [h.id]) === null);
  ok('colours move the way they are named', P.nudgeColour('#808080', 'darker') < '#808080' && P.nudgeColour('#336699', 'warmer') !== '#336699');
}

// ── 11. controls made for the design, bound to it ──
{
  let doc = calm();
  const id = doc.artboards[0].id;
  const plain = P.controlsFor(doc, id).map((c) => c.id);
  ok('a design without forms of its own gets no forms controls; one with a headline gets its size, spacing and weight where the face has weights', !plain.some((c) => c.startsWith('forms-')) && plain.includes('head-size') && plain.includes('head-tracking'), J(plain));
  const r = P.readCreative('Make this cloud themed.', { doc, board: id });
  doc = P.executePlan(doc, r.plan, { dir: calmDir, kind: 'poster', said: 'cloud', now: 5, board: id }).doc;
  const cs = P.controlsFor(doc, id);
  ok('made cloud themed, it gets controls named for its clouds', cs.some((c) => c.id === 'forms-count' && /Clouds/.test(c.label)) && cs.some((c) => c.id === 'forms-abstraction') && cs.some((c) => c.id === 'ground-tone' && /Sky/.test(c.label)), J(cs.map((c) => c.label)));
  const want = { 'forms-count': 8, 'forms-abstraction': 85, 'forms-scale': 140, 'head-weight': 700, 'head-tracking': 80, 'ground-tone': 22, 'accent-hue': 200, depth: 3 };
  for (const [cid, v] of Object.entries(want)) {
    const c = cs.find((x) => x.id === cid);
    if (!c) continue;
    const a = P.applyControl(doc, id, cid, v, { dir: calmDir, kind: 'poster', now: 20 });
    const back = a && P.controlsFor(a.doc, id).find((x) => x.id === cid)?.value;
    const hi = a ? high(a.doc, a.doc.artboards[0]) : [];
    ok(`“${c.label}” moved to ${v} changes the design and reads back ${v}, nothing failing`, a && a.doc !== doc && back === v && hi.length === 0 && texts(a.doc.artboards[0]) === texts(doc.artboards[0]), J({ back, hi: hi.map((f) => f.message), label: a?.label }));
  }
  const size = cs.find((c) => c.id === 'head-size');
  const big = P.applyControl(doc, id, 'head-size', size.max, { dir: calmDir, kind: 'poster', now: 21 });
  const got = P.controlsFor(big.doc, id).find((c) => c.id === 'head-size').value;
  ok('the headline grown as far as it goes is as large as it fits, said so, and still fits', got > size.value && high(big.doc, big.doc.artboards[0]).length === 0 && (got >= size.max - 1 || /as large as it fits/.test(big.label)), J({ from: size.value, got, label: big.label }));
  const room = P.applyControl(doc, id, 'room', 60, { dir: calmDir, kind: 'poster', now: 22 });
  ok('the room control lays the composition out again and says what it really leaves open', room && /% left open/.test(room.label) && texts(room.doc.artboards[0]) === texts(doc.artboards[0]), room?.label);
}

// ── 12. the visual review: measured from rendered pixels ──
{
  // a plain artboard: a dark headline over a ground that, as rendered, is dark on its right half (a picture, a form)
  const doc = P.normalizeDoc({ schema: 1, id: 'v', name: 'v', tokens: { colors: { background: '#f5f3eb', surface: '#ffffff', text: '#20201b', muted: '#6b6b60', accent: '#c2410c', accentText: '#ffffff', line: '#d8d3c6' }, fonts: { display: 'Inter', body: 'Inter' } }, artboards: [{ id: 'b', name: 'B', width: 400, height: 300, unit: 'px', background: '#f5f3eb', bleed: 0, safe: 20, children: [{ id: 'h', type: 'text', role: 'headline', name: 'Headline', text: 'A headline across the change', font: 'Inter', weight: 700, size: 28, lineHeight: 1.1, tracking: 0, align: 'left', valign: 'top', color: '#20201b', x: 20, y: 120, w: 360, h: 40, rotation: 0, opacity: 1 }] }], assets: [], revision: 0, updatedAt: 0 });
  const board = doc.artboards[0];
  const k = 1;
  const make = (fn) => {
    const data = new Uint8ClampedArray(400 * 300 * 4);
    for (let y = 0; y < 300; y++) for (let x = 0; x < 400; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * 400 + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    return { width: 400, height: 300, data };
  };
  const light = make(() => [245, 243, 235]);
  const split = make((x) => (x > 200 ? [30, 30, 30] : [245, 243, 235]));
  const ok1 = P.reviewPixels(doc, board, light, light, k);
  ok('a dark headline on a light ground as rendered: it reads, and the review says how well', ok1.method === 'pixels' && !ok1.findings.some((f) => f.kind === 'legibility') && ok1.measures.legibility[0]?.ratio > 10, J(ok1.measures.legibility));
  const bad = P.reviewPixels(doc, board, split, split, k);
  const f = bad.findings.find((x) => x.kind === 'legibility');
  ok('the same headline over a ground that turns dark beneath half of it is found, with the measurement', f && f.node === 'h' && /reads at/.test(f.message) && /sampled/.test(f.measured), J(bad.findings));
  ok('  and the repair is a quiet panel (no single colour reads on both light and dark)', f?.fix?.some((o) => o.op === 'add') && f.fix.some((o) => o.op === 'update' && o.id === 'h'), J(f?.fix));
  const fixed = P.applyOps(doc, P.repairsOf(bad));
  ok('  which applies cleanly', fixed.ok && fixed.doc.artboards[0].children.length === 2, fixed.error);
  const mid = make((x) => (x > 200 ? [120, 120, 120] : [245, 243, 235]));
  const m = P.reviewPixels(doc, board, mid, mid, k);
  const mf = m.findings.find((x) => x.kind === 'legibility');
  ok('over a mid-grey half, a darker ink reads on all of it: the repair is a colour, nothing added', !mf || (mf.fix?.length === 1 && mf.fix[0].op === 'update'), J(mf));
  const busy = make((x, y) => ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? [20, 20, 20] : [240, 240, 240]));
  const bz = P.reviewPixels(doc, board, busy, light, k);
  ok('a picture that is all edges is found busy', bz.findings.some((x) => x.kind === 'clutter') && bz.measures.clutter > 0.2, J(bz.measures));
  ok('weight, coverage and focus are measured, not guessed', Array.isArray(bz.measures.weight) && typeof bz.measures.coverage === 'number' && (bz.measures.focus === null || typeof bz.measures.focus === 'number'));
}

// ── 13. research: through the workspace's provider, said as it is, never invented ──
{
  const ask = P.researchAskOf('Find me some interesting references for an experimental architecture website');
  ok('“find me some interesting references for an experimental architecture website” is a search for websites', ask && /experimental architecture website/.test(ask.query) && ask.kind === 'websites', J(ask));
  ok('“show me pictures of brutalist concrete textures” is a search for pictures', P.researchAskOf('show me pictures of brutalist concrete textures')?.kind === 'images');
  for (const w of ['make the headline bigger', 'Make this cloud themed.', 'take the typography from the first']) ok(`“${w}” is not a search`, P.researchAskOf(w) === null);
  ok('only web addresses of public names are kept', P.webAddress('https://example.com/a') && !P.webAddress('javascript:alert(1)') && !P.webAddress('http://localhost:3000') && !P.webAddress('http://10.0.0.2/x') && !P.webAddress('http://intranet.local/') && !P.webAddress('ftp://example.com') && !P.webAddress('https://user:pw@example.com'));
  const clean = P.cleanResult({ title: '<b>Studio</b> &amp; Co', url: 'https://www.studio.example/work', snippet: '<script>x</script>Work', thumb: 'javascript:bad' }, 'Brave Search', 'website', 0);
  ok('a result is held to its shape: markup removed, a bad preview dropped, its site named', clean && clean.title === 'Studio & Co' && !clean.thumb && clean.host === 'studio.example' && !/script/.test(clean.snippet ?? ''), J(clean));
  const none = await P.research({ query: 'experimental architecture website', kind: 'websites' }, { env: {} });
  ok('with no provider configured it says so plainly, and nothing is passed off as found', none.status === 'not-configured' && none.results.length === 0 && /needs a search provider/.test(none.message) && none.provider === null, J(none));
  const calls = [];
  const fake = (body, status = 200) => async (url, init) => (calls.push({ url: String(url), init }), new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  const brave = await P.research({ query: 'experimental architecture website', kind: 'websites' }, { env: { BRAVE_SEARCH_API_KEY: 'k' }, fetcher: fake({ web: { results: [{ title: 'Studio One', url: 'https://one.example/', description: 'Spatial work', thumbnail: { src: 'https://imgs.search.brave.com/one.jpg' } }, { title: 'Bad', url: 'javascript:x' }, { title: 'Dup', url: 'https://one.example/' }, { title: 'Two', url: 'https://two.example/p' }] } }) });
  ok('Brave: its API is called with the key in its header and safe search on', calls[0].url.startsWith('https://api.search.brave.com/res/v1/web/search?') && /safesearch=strict/.test(calls[0].url) && calls[0].init.headers['X-Subscription-Token'] === 'k');
  ok('  and what it returned is kept with its source, bad and repeated addresses dropped', brave.status === 'ok' && brave.results.length === 2 && brave.results[0].host === 'one.example' && brave.results.every((r) => r.provider === 'Brave Search') && /2 pages found by Brave Search/.test(brave.message), J(brave));
  calls.length = 0;
  const g = await P.research({ query: 'brutalist concrete', kind: 'images' }, { env: { GOOGLE_CSE_KEY: 'k', GOOGLE_CSE_CX: 'cx' }, fetcher: fake({ items: [{ title: 'Concrete', link: 'https://img.example/c.jpg', image: { contextLink: 'https://page.example/c', thumbnailLink: 'https://encrypted-tbn0.gstatic.com/t.jpg', width: 800, height: 600 } }] }) });
  ok('Google Programmable Search: images, each with the page it is on', /searchType=image/.test(calls[0].url) && g.status === 'ok' && g.results[0].url === 'https://page.example/c' && g.results[0].thumb && g.results[0].kind === 'image', J(g));
  calls.length = 0;
  const se = await P.research({ query: 'gallery website', kind: 'websites' }, { env: { SOCRIAUX_RESEARCH_PROVIDER: 'serper', SERPER_API_KEY: 'k', BRAVE_SEARCH_API_KEY: 'b' }, fetcher: fake({ organic: [{ title: 'Gallery', link: 'https://gallery.example', snippet: 'Rooms' }] }) });
  ok('the provider the workspace names is the one used (Serper here, though Brave has a key too)', calls[0].url === 'https://google.serper.dev/search' && calls[0].init.headers['X-API-KEY'] === 'k' && se.provider === 'Serper', J(calls[0]));
  const refused = await P.research({ query: 'x design', kind: 'websites' }, { env: { BRAVE_SEARCH_API_KEY: 'k' }, fetcher: fake({ error: 'no' }, 401) });
  ok('a refused key is said as it is; nothing shown', refused.status === 'unavailable' && /key was refused/.test(refused.message) && !refused.results.length, J(refused));
  const slow = await P.research({ query: 'x design', kind: 'websites' }, { env: { BRAVE_SEARCH_API_KEY: 'k' }, timeoutMs: 20, fetcher: (u, init) => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  ok('a provider that takes too long is let go and said', slow.status === 'unavailable' && /too long/.test(slow.message), J(slow));
  const empty = await P.research({ query: 'x design', kind: 'websites' }, { env: { BRAVE_SEARCH_API_KEY: 'k' }, fetcher: fake({ web: { results: [] } }) });
  ok('nothing found is said, not padded', empty.status === 'empty' && !empty.results.length);
  // the conversation: the ask becomes a search for the caller to run, and what it found is kept with its sources
  const st = P.emptyStudio('website', 'A website for Kanso, an architecture studio in Leeds');
  const turn = P.respond(st, 'Find me some interesting references for an experimental architecture website', {});
  ok('in the conversation, the ask is heard as research and becomes a search (no project is started for it)', turn.search && /experimental architecture website/.test(turn.search.query) && turn.move.kind !== 'create', J({ search: turn.search, move: turn.move.kind }));
  const kept = P.said(turn.st, { from: 'socria', kind: 'research', text: 'found', found: { query: 'q', provider: 'Brave Search', results: [{ id: 'a', kind: 'website', title: 'One', url: 'https://one.example/', host: 'one.example', provider: 'Brave Search' }, { id: 'b', kind: 'website', title: 'Bad', url: 'javascript:x', host: 'x', provider: 'Brave Search' }] } });
  const back = P.normalizeStudio(JSON.parse(JSON.stringify(kept)));
  const msg = back.transcript.find((m) => m.kind === 'research');
  ok('what a search found is kept with the conversation, held to its shape when read back', msg && msg.found.results.length === 1 && msg.found.results[0].url === 'https://one.example/', J(msg));
}

// ── 14. understanding at generation (memory in the director's reading: test/director.test.mjs) ──
{
  const themed = P.briefRealisation(P.emptyStudio('graphic', 'A cloud-themed poster for our bakery’s opening day'));
  ok('a world named for the look in the brief (“cloud-themed”) is carried into the first design as a theme', themed && themed.changes.some((c) => c.decision === 'theme' && c.theme === 'cloud') && themed.keep.includes('words'), J(themed));
  ok('a world inside a name is not a theme (“Cloud Nine Bakery”)', P.briefRealisation(P.emptyStudio('graphic', 'A poster for “Cloud Nine Bakery”, opening Saturday')) === null);
  ok('a brief that names no world brings no theme', P.briefRealisation(P.emptyStudio('graphic', 'A poster for our summer sale, bold and loud')) === null);
}

// ── 15. a theme on a crowded composition still makes its world, and says how ──
{
  const doc = P.normalizeDoc({ schema: 1, id: 'v', name: 'v', tokens: { colors: { background: '#f5f3eb', surface: '#ffffff', text: '#20201b', muted: '#6b6b60', accent: '#c2410c', accentText: '#ffffff', line: '#d8d3c6' }, fonts: { display: 'Inter', body: 'Inter' } }, artboards: [{ id: 'b', name: 'B', width: 400, height: 560, unit: 'px', background: '#f5f3eb', bleed: 0, safe: 20, children: [{ id: 'h', type: 'text', role: 'headline', name: 'Headline', text: 'OPEN STUDIO OPEN STUDIO OPEN STUDIO', font: 'Inter', weight: 800, size: 96, lineHeight: 1, tracking: 0, align: 'left', valign: 'top', color: '#20201b', x: 0, y: 0, w: 400, h: 560, rotation: 0, opacity: 1 }] }], assets: [], revision: 0, updatedAt: 0 });
  const e = P.executePlan(doc, P.readCreative('Make this cloud themed.', { doc, board: 'b' }).plan, { kind: 'poster', said: 'cloud', now: 1, board: 'b' });
  const forms = e.doc.artboards[0].creative?.forms;
  const drawn = P.walk(e.doc.artboards[0]).filter((l) => forms?.ids.includes(l.node.id)).map((l) => l.node);
  ok('a composition with no clear room still gets its clouds — faint, behind the words — and is told so', forms?.kind === 'cloud' && drawn.length > 0 && drawn.every((n) => n.opacity <= 0.34) && e.notes.some((n) => /sit faintly behind the words/.test(n)), J({ forms, notes: e.notes }));
  ok('  and the words still read', high(e.doc, e.doc.artboards[0]).filter((f) => f.kind === 'contrast').length === 0, J(high(e.doc, e.doc.artboards[0]).map((f) => f.message)));
}

// ── 16. several versions from one brief: structurally apart, measured ──
for (const [name, make] of [['calm', calm], ['loud', loud]]) {
  const doc = make();
  const e = P.readGraphicEdit('show me 5 different compositions', doc, { artboard: doc.artboards[0].id, selection: [], dir: name === 'calm' ? calmDir : loudDir, kind: 'poster' });
  const boards = e?.next?.artboards ?? [];
  const sims = [];
  for (let i = 0; i < boards.length; i++) for (let j = i + 1; j < boards.length; j++) sims.push(sim(boards[i], boards[j]));
  ok(`five versions of the ${name} poster, each a structure of its own (every pair under the same-structure threshold)`, boards.length === 6 && Math.max(...sims) < 0.86, J({ n: boards.length, max: Math.max(...sims), mean: sims.reduce((a, b) => a + b, 0) / sims.length }));
}

// ── 17. a graded ground is ground, not something drawn on it ──
{
  const stops = [{ at: 0, color: '#9ec5f0' }, { at: 1, color: '#f4f8fd' }];
  const doc = P.normalizeDoc({ schema: 1, id: 'g', name: 'g', tokens: { colors: { background: '#f4f8fd', surface: '#ffffff', text: '#1c2a44', muted: '#6b6b60', accent: '#f0a050', accentText: '#1c2a44', line: '#d8d3c6' }, fonts: { display: 'Inter', body: 'Inter' } }, artboards: [{ id: 'b', name: 'B', width: 200, height: 300, unit: 'px', background: '#f4f8fd', bleed: 0, safe: 10, children: [{ id: 'bg', type: 'shape', shape: 'rect', role: 'background', name: 'Creative ground', x: 0, y: 0, w: 200, h: 300, rotation: 0, opacity: 1, fill: { type: 'linear', angle: 180, stops } }] }], assets: [], revision: 0, updatedAt: 0 });
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const data = new Uint8ClampedArray(200 * 300 * 4);
  for (let y = 0; y < 300; y++) for (let x = 0; x < 200; x++) {
    const t = y / 299;
    const i = (y * 200 + x) * 4;
    data[i] = lerp(0x9e, 0xf4, t); data[i + 1] = lerp(0xc5, 0xf8, t); data[i + 2] = lerp(0xf0, 0xfd, t); data[i + 3] = 255;
  }
  const px = { width: 200, height: 300, data };
  const r = P.reviewPixels(doc, doc.artboards[0], px, px, 1);
  ok('a sky graded from blue to white is measured as ground: almost nothing drawn on it', r.measures.coverage < 0.08 && !r.findings.some((f) => f.kind === 'coverage' && /Almost everything/.test(f.message)), J(r.measures));
}

console.log(`platform: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
