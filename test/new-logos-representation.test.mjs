// NEW LOGOS — REPRESENTATIONS (docs/NEW-LOGOS.md, "Representations"): a problem as typed items and relations that
// evolve, instead of replies that accumulate.
//
// What is held down:
//   • items are checked (kinds, ids that are never prototype names, words within bounds, fields of their kind), and a
//     relation joins two items that are there, with an explicit standing (established or unverified);
//   • a turn REVISES: a possibility made more or less likely keeps its earlier standing readable; an open question is
//     answered in place; duplicates merge with their connections; nothing is appended as a reply;
//   • the assistant never rewords or removes what the person made, nor a connection the person made;
//   • every batch can be reversed exactly, back to any earlier point, and the reversal can itself be reversed;
//   • the interactive model is the existing composition engine: variables, equations, plots, tables and measures share
//     one scope, so moving a variable moves everything that uses it;
//   • what the assistant sends back is read leniently (fences, trailing commas, cut-off output, synonyms) and checked
//     strictly;
//   • the record a turn leaves in the conversation is built from the items, possibilities marked as such.

import * as X from './.tmp/new-logos-under-test.mjs';

const { Rep: R, RepOps: O, RepModel: M } = X;
let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => (cond ? (pass++, console.log('  ok   ' + name)) : (fail++, console.log('  FAIL ' + name + (extra ? '  ' + String(extra).slice(0, 400) : ''))));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let t = 1_700_000_000_000;
const now = () => (t += 1000);

// ── items and relations, checked ──
console.log('items and relations');
ok('an item of a known kind is kept', !!R.sanitizeItem({ id: 'h_attraction', kind: 'hypothesis', text: 'Attraction to you', by: 'ai', at: 1 }));
ok('an unknown kind is refused', R.sanitizeItem({ id: 'x_one', kind: 'opinion', text: 'x' }) === null);
ok('prototype names are never ids', R.sanitizeItem({ id: 'constructor', kind: 'entity', text: 'x' }) === null && R.sanitizeItem({ id: '__proto__', kind: 'entity', text: 'x' }) === null);
ok('the p_ prefix belongs to the model', R.sanitizeItem({ id: 'p_abc', kind: 'statement', text: 'x' }) === null && !!R.sanitizeItem({ id: 'p_abc', kind: 'equation', text: '', prim: { type: 'equation', data: { name: 'y', params: [], expr: '2' } } }));
ok('an item with no words is refused', R.sanitizeItem({ id: 'q_main', kind: 'question', text: '   ' }) === null);
const long = R.sanitizeItem({ id: 'h_long', kind: 'hypothesis', text: 'word '.repeat(80) });
ok('words past the bound are cut at a word, visibly', long.text.length <= R.TEXT_MAX.hypothesis && long.text.endsWith('…') && !long.text.includes('wor…'), long.text);
ok('a possibility starts open', long.status === 'open');
ok('a statement says its basis (an interpretation unless said otherwise)', R.sanitizeItem({ id: 's_one', kind: 'statement', text: 'x' }).basis === 'interpretation');
const rep0 = R.sanitizeRepresentation({
  items: [
    { id: 'q_main', kind: 'question', text: 'Why?' },
    { id: 'q_main', kind: 'question', text: 'Twice' },
    { id: 'h_one', kind: 'hypothesis', text: 'One' },
  ],
  relations: [
    { from: 'h_one', to: 'q_main', kind: 'about' },
    { from: 'h_one', to: 'gone', kind: 'about' },
    { from: 'h_one', to: 'h_one', kind: 'about' },
    { from: 'h_one', to: 'q_main', kind: 'nonsense' },
  ],
});
ok('a representation keeps one item per id', rep0.items.length === 2 && rep0.items[0].text === 'Why?');
ok('relations join two different items that are there, of a known kind', rep0.relations.length === 1 && rep0.relations[0].id === 'h_one>about>q_main');
ok('a relation is unverified unless said otherwise', rep0.relations[0].status === 'unverified');

// ── an interpersonal question, represented ──
console.log('\nan interpersonal question');
let rec = O.EMPTY_RECORD;
const turn1 = [
  { op: 'turn', message: 'm_turn0001' },
  { op: 'add', item: { id: 'q_main', kind: 'question', text: 'Why did she cheat on her boyfriend to get with me?' } },
  { op: 'add', item: { id: 'e_her', kind: 'entity', text: 'Her' } },
  { op: 'add', item: { id: 'e_him', kind: 'entity', text: 'Her boyfriend' } },
  { op: 'add', item: { id: 'e_you', kind: 'entity', text: 'You' } },
  { op: 'relate', from: 'e_her', to: 'e_him', kind: 'relates', status: 'established', label: 'was with' },
  { op: 'relate', from: 'e_her', to: 'e_you', kind: 'relates', status: 'established', label: 'began seeing' },
  { op: 'add', item: { id: 'o_overlap', kind: 'observation', from: 'person', text: 'She began seeing you while still with him.' } },
  { op: 'add', item: { id: 'h_attraction', kind: 'hypothesis', text: 'Attraction to you', detail: 'A strong pull towards someone new can outweigh loyalty in the moment.' }, near: 'q_main' },
  { op: 'add', item: { id: 'h_unhappy', kind: 'hypothesis', text: 'Unhappy in that relationship' } },
  { op: 'add', item: { id: 'h_avoid', kind: 'hypothesis', text: 'Avoiding a hard conversation' } },
  { op: 'relate', from: 'h_attraction', to: 'o_overlap', kind: 'explains' },
  { op: 'relate', from: 'h_unhappy', to: 'o_overlap', kind: 'explains' },
  { op: 'relate', from: 'h_avoid', to: 'o_overlap', kind: 'explains' },
  { op: 'add', item: { id: 'u_why', kind: 'unknown', text: 'Has she said why she ended it?' } },
  { op: 'add', item: { id: 'u_long', kind: 'unknown', text: 'How long had things been difficult between them?' } },
  { op: 'relate', from: 'u_long', to: 'h_unhappy', kind: 'about' },
  { op: 'add', item: { id: 'c_only', kind: 'caveat', text: 'Only she knows her reasons; these are possibilities, not conclusions.', weight: 'important' } },
];
let r1 = O.commit(rec, turn1, { by: 'ai', at: now(), turn: 'm_turn0001', read: 'interpersonal: her motives' });
rec = r1.record;
ok('every operation of a well-formed turn applies', r1.result.skipped.length === 0, JSON.stringify(r1.result.skipped));
ok('the turn is taken in once', eq(rec.rep.turns, ['m_turn0001']));
ok('possibilities are open, unverified, the assistant’s', rec.rep.items.filter((i) => i.kind === 'hypothesis').every((h) => h.status === 'open' && h.by === 'ai'));
ok('connections from a possibility are unverified (drawn dashed)', rec.rep.relations.filter((r) => r.kind === 'explains').every((r) => r.status === 'unverified'));
ok('what the person told is established (drawn solid)', rec.rep.relations.filter((r) => r.from === 'e_her').every((r) => r.status === 'established'));
ok('an observation the person made is said to be theirs', R.itemById(rec.rep, 'o_overlap').from === 'person');
ok('where a new item should sit is kept for the canvas', r1.result.near.some(([id, n]) => id === 'h_attraction' && n === 'q_main'));
ok('the batch is summarised in words', /Added .*3 possibilities.*2 open questions/.test(r1.entry.summary), r1.entry.summary);
ok('the log keeps how the turn was read', r1.entry.read === 'interpersonal: her motives');
const record1 = R.recordOf(rec.rep, r1.result.changes);
ok('the conversation’s record marks possibilities as not established', /\*\*Possibilities\*\* \(not established\)/.test(record1) && /Attraction to you/.test(record1), record1);
ok('…and says what would help', /\*\*What would help\*\*/.test(record1) && /Has she said why/.test(record1));
ok('…with the caveat kept visible', /_Only she knows her reasons/.test(record1));

// the person adds what they know: the picture is revised, not appended to
const before2 = JSON.parse(JSON.stringify(rec.rep));
const turn2 = [
  { op: 'turn', message: 'm_turn0002' },
  { op: 'add', item: { id: 'o_unhappy', kind: 'observation', from: 'person', text: 'She told me she had been unhappy for months.' } },
  { op: 'answer', id: 'u_long', answer: 'Months, by her account.' },
  { op: 'status', id: 'h_unhappy', status: 'stronger', because: 'She said she had been unhappy for months.' },
  { op: 'status', id: 'h_avoid', status: 'weaker', because: 'She talked about it openly.' },
  { op: 'relate', from: 'o_unhappy', to: 'h_unhappy', kind: 'supports', status: 'established' },
];
const r2 = O.commit(rec, turn2, { by: 'ai', at: now(), turn: 'm_turn0002' });
rec = r2.record;
ok('a second turn revises: one observation added, three items revised', r2.result.changes.added.length === 1 && r2.result.changes.revised.length === 3, JSON.stringify(r2.result.changes));
ok('a revised possibility keeps its earlier standing readable', R.itemById(rec.rep, 'h_unhappy').status === 'stronger' && /Open/.test(R.itemById(rec.rep, 'h_unhappy').was?.[0]?.text ?? ''));
ok('an open question is answered in place', R.itemById(rec.rep, 'u_long').answer === 'Months, by her account.');
ok('the summary says what was revised', /Marked more likely ‘Unhappy in that relationship’/.test(r2.entry.summary) && /Marked less likely/.test(r2.entry.summary) && /Answered/.test(r2.entry.summary), r2.entry.summary);
ok('what bears on a possibility is found', R.bearingOn(rec.rep, 'h_unhappy').supports.some((i) => i.id === 'o_unhappy') && R.bearingOn(rec.rep, 'h_unhappy').explains.some((i) => i.id === 'o_overlap'));
const record2 = R.recordOf(rec.rep, r2.result.changes);
ok('the second record is the change, not the whole again', /\*\*Revised\*\*/.test(record2) && !/Attraction to you/.test(record2), record2);

// the person's own words are theirs
console.log('\nwhat the person made');
const r3 = O.commit(rec, [{ op: 'add', item: { id: 'h_mine', kind: 'hypothesis', text: 'She wanted a way out anyway' } }, { op: 'relate', from: 'h_mine', to: 'o_overlap', kind: 'explains', status: 'unverified' }], { by: 'person', at: now() });
rec = r3.record;
ok('the person adds a possibility of their own', R.itemById(rec.rep, 'h_mine')?.by === 'person');
const r4 = O.commit(rec, [{ op: 'update', id: 'h_mine', set: { text: 'Something else' } }, { op: 'remove', id: 'h_mine' }, { op: 'unrelate', from: 'h_mine', to: 'o_overlap' }, { op: 'status', id: 'h_mine', status: 'weaker', because: 'Nothing she said points to it.' }], { by: 'ai', at: now() });
ok('the assistant may not reword, remove, or disconnect what the person made', r4.result.skipped.length === 3 && r4.result.skipped.every((s) => /made by the person/.test(s.why)), JSON.stringify(r4.result.skipped));
ok('…but may weigh it, saying why', R.itemById(r4.record.rep, 'h_mine').status === 'weaker' && R.itemById(r4.record.rep, 'h_mine').text === 'She wanted a way out anyway');
rec = r4.record;

const reworded = O.applyRepOps(rec.rep, [{ op: 'update', id: 'h_attraction', set: { text: 'Drawn to you' } }], { by: 'person', at: now() });
ok('words the person rewrites become theirs, so the assistant cannot change them back', R.itemById(reworded.rep, 'h_attraction').by === 'person' && O.applyRepOps(reworded.rep, [{ op: 'update', id: 'h_attraction', set: { text: 'Attraction' } }], { by: 'ai', at: now() }).skipped.length === 1);

// consolidation
console.log('\nconsolidating');
const r5 = O.commit(rec, [{ op: 'add', item: { id: 'h_attract2', kind: 'hypothesis', text: 'Drawn to you', cites: [{ sourceId: 's_abcdefghij', passage: 'p1.2' }] } }, { op: 'relate', from: 'h_attract2', to: 'u_why', kind: 'about' }, { op: 'relate', from: 'h_attract2', to: 'h_attraction', kind: 'relates' }], { by: 'ai', at: now() });
rec = r5.record;
const r6 = O.commit(rec, [{ op: 'merge', ids: ['h_attract2'], into: 'h_attraction', text: 'Attraction to you' }], { by: 'ai', at: now() });
rec = r6.record;
ok('a duplicate merges into the other', !R.itemById(rec.rep, 'h_attract2') && !!R.itemById(rec.rep, 'h_attraction'));
ok('its connections move to what it merged into, with no item joined to itself', rec.rep.relations.some((r) => r.id === 'h_attraction>about>u_why') && !rec.rep.relations.some((r) => r.from === r.to || r.from === 'h_attract2' || r.to === 'h_attract2'));
ok('its documents come too', (R.itemById(rec.rep, 'h_attraction').cites ?? []).some((c) => c.sourceId === 's_abcdefghij'));

// reversing
console.log('\nreversing');
const latest = rec.log[rec.log.length - 1];
const undone = O.revertTo(rec, latest.id, 'person', now());
ok('the latest change is reversed exactly', eq(undone.record.rep, r5.record.rep));
ok('…and the reversal is itself logged', /^Undid: /.test(undone.entry.summary), undone.entry.summary);
const redone = O.revertTo(undone.record, undone.entry.id, 'person', now());
ok('…so it can be reversed too', eq(redone.record.rep.items, r6.record.rep.items) && eq(redone.record.rep.relations, r6.record.rep.relations));
const toSecond = O.revertTo(rec, rec.log.find((e) => e.turn === 'm_turn0002').id, 'person', now());
ok('back to before an earlier turn: it and everything after are reversed', eq(toSecond.record.rep, before2), JSON.stringify(toSecond.record.rep.items.map((i) => i.id)));
ok('…in one step that says how many later changes went with it', /later change/.test(toSecond.entry.summary), toSecond.entry.summary);
// undo twice, as pressing Undo twice does; then undo the undo
const z1 = O.revertTo(rec, O.lastInEffect(rec.log).id, 'person', now());
const z2 = O.revertTo(z1.record, O.lastInEffect(z1.record.log).id, 'person', now());
ok('undoing twice goes two changes back', eq(z2.record.rep, r4.record.rep));
ok('…each undo says which change it undid, and the log keeps the whole chain', eq(z1.entry.undoes, [r6.entry.id]) && eq(z2.entry.undoes, [r5.entry.id]) && z2.record.log.length === rec.log.length + 2);
ok('…so nothing undone is in effect', O.lastInEffect(z2.record.log).id === r4.entry.id);
const redo = O.revertTo(z2.record, z2.entry.id, 'person', now());
ok('undoing an undo redoes it', eq(redo.record.rep, z1.record.rep) && /^Redid/.test(redo.entry.summary), redo.entry.summary);
ok('a log entry that is not there reverses nothing', O.revertTo(rec, 'bnothere', 'person', now()) === null);
ok('a batch that changes nothing is not logged', O.commit(rec, [{ op: 'remove', id: 'not_there' }], { by: 'ai', at: now() }).entry === null);
const stored = O.sanitizeLog(JSON.parse(JSON.stringify(rec.log)));
ok('the log survives being stored and read back', stored.length === rec.log.length && eq(O.revertTo({ rep: rec.rep, log: stored }, stored[0].id, 'person', 1).record.rep.items, []));

// limits and refusals
console.log('\nlimits');
const many = [];
for (let k = 0; k < 130; k++) many.push({ op: 'add', item: { id: `s_${k}`, kind: 'statement', text: `Point ${k}` } });
const full = O.applyRepOps(R.EMPTY_REPRESENTATION, many.slice(0, 80), { by: 'ai', at: 1 });
const full2 = O.applyRepOps(full.rep, many.slice(80), { by: 'ai', at: 2 });
ok('no more than the item limit', full2.rep.items.length === R.REP_LIMITS.items && full2.skipped.some((s) => /full/.test(s.why)));
ok('a batch past the operation limit applies its first operations and says why the rest did not', O.applyRepOps(R.EMPTY_REPRESENTATION, many.slice(0, 85), { by: 'ai', at: 1 }).skipped.filter((s) => /too many operations/.test(s.why)).length === 5);
const huge = O.applyRepOps(R.EMPTY_REPRESENTATION, [{ op: 'add', item: { id: 'tl_big', kind: 'timeline', text: 'Big', events: Array.from({ length: 40 }, (_, k) => ({ when: String(1900 + k), text: 'x'.repeat(190) })) } }], { by: 'ai', at: 1 });
ok('a timeline keeps at most its event limit, in bounds', huge.rep.items[0].events.length === 40 && huge.rep.items[0].events.every((e) => e.text.length <= R.REP_LIMITS.eventText));
const rel = O.applyRepOps(rec.rep, [{ op: 'relate', from: 'h_attraction', to: 'h_attraction', kind: 'supports' }, { op: 'relate', from: 'h_attraction', to: 'nowhere', kind: 'supports' }, { op: 'relate', from: 'h_attraction', to: 'q_main', kind: 'nonsense' }], { by: 'person', at: 1 });
ok('a connection to itself, to nothing, or of no kind is refused', rel.skipped.length === 3);
const again = O.applyRepOps(rec.rep, [{ op: 'relate', from: 'h_attraction', to: 'o_overlap', kind: 'explains', status: 'established' }], { by: 'person', at: 1 });
ok('connecting the same two the same way again changes its standing, not its number', again.rep.relations.length === rec.rep.relations.length && again.rep.relations.find((r) => r.id === 'h_attraction>explains>o_overlap').status === 'established');
const re = O.applyRepOps(rec.rep, [{ op: 'add', item: { id: 'h_attraction', kind: 'hypothesis', text: 'Attraction to you, mostly' } }], { by: 'ai', at: 1 });
ok('the same id added again as the same kind revises it', re.rep.items.filter((i) => i.id === 'h_attraction').length === 1 && R.itemById(re.rep, 'h_attraction').text === 'Attraction to you, mostly');
const clash = O.applyRepOps(rec.rep, [{ op: 'add', item: { id: 'h_attraction', kind: 'unknown', text: 'Different?' } }, { op: 'relate', from: 'h_attraction', to: 'q_main', kind: 'about' }], { by: 'ai', at: 1 });
const newId = clash.ids.find(([w]) => w === 'h_attraction')?.[1];
ok('an id taken by another kind is given a fresh one, and the batch’s later uses follow it', !!newId && newId !== 'h_attraction' && clash.rep.relations.some((r) => r.from === newId && r.to === 'q_main'), JSON.stringify(clash.ids));

// the interactive model
console.log('\nthe model');
const biz = O.commit(O.EMPTY_RECORD, [
  { op: 'add', item: { id: 'price', kind: 'variable', name: 'price', value: 24, min: 10, max: 40, unit: '£', text: 'Wholesale price' } },
  { op: 'add', item: { id: 'cost', kind: 'variable', name: 'cost', value: 18, min: 5, max: 30, text: 'Cost per kit' } },
  { op: 'add', item: { id: 'units', kind: 'variable', name: 'units', value: 200, min: 0, max: 1000, step: 10, text: 'Kits a month' } },
  { op: 'add', item: { id: 'profit', kind: 'equation', expr: 'profit = (price - cost) * units', text: 'Monthly profit' } },
  { op: 'add', item: { id: 'curve', kind: 'plot', series: [{ expr: 'y = (x - cost) * units', label: 'profit at price x' }], x: { min: 10, max: 40, label: 'price' }, text: 'Profit by price' } },
  { op: 'add', item: { id: 'm_profit', kind: 'metric', text: 'Profit a month', expr: 'profit', unit: '£', basis: 'derived' } },
  { op: 'add', item: { id: 'options', kind: 'matrix', text: 'Channels', columns: ['Channel', 'Margin', 'Reach'], rows: [['Shops', '6', 'High'], ['Online', '9', 'Low']] } },
  { op: 'relate', from: 'price', to: 'profit', kind: 'causes' },
], { by: 'ai', at: now() });
const v1 = O.valuesOf(biz.record.rep);
ok('variables, equations and measures share one scope', v1.values.profit === 1200 && v1.values['metric:m_profit'] === 1200, JSON.stringify(v1.values));
ok('model items carry their primitive, with primitive ids', biz.record.rep.items.filter((i) => R.isModelKind(i.kind)).every((i) => /^p_/.test(i.id) && i.prim.id === i.id));
ok('a connection between model items is kept', biz.record.rep.relations.length === 1);
const matrix = biz.record.rep.items.find((i) => i.kind === 'matrix');
ok('a comparison: a column of numbers is a number column', matrix.prim.data.columns[1].kind === 'number' && matrix.prim.data.columns[2].kind === 'text');
const priceItem = biz.record.rep.items.find((i) => i.kind === 'variable' && i.prim.data.variable === 'price');
const moved = O.commit(biz.record, [{ op: 'model', ops: [{ op: 'var.set', name: 'price', value: 30 }] }], { by: 'person', at: now() });
ok('moving a variable moves everything that uses it', O.valuesOf(moved.record.rep).values.profit === 2400 && O.valuesOf(moved.record.rep).values['metric:m_profit'] === 2400);
const second = O.applyRepOps(moved.record.rep, [{ op: 'add', item: { id: 'price2', kind: 'variable', name: 'price', value: 26 } }], { by: 'ai', at: now() });
ok('adding a variable that has its control already sets it instead of adding another', second.rep.items.filter((i) => i.kind === 'variable').length === 3 && second.rep.variables.find((v) => v.name === 'price').value === 26);
const back = O.revertTo(moved.record, moved.entry.id, 'person', now());
ok('reversing a model change puts the variable back', back.record.rep.variables.find((v) => v.name === 'price').value === 24);
const gone = O.applyRepOps(biz.record.rep, [{ op: 'remove', id: priceItem.id }], { by: 'person', at: now() });
ok('removing a model item takes its connections with it', !gone.rep.relations.length && !gone.rep.items.some((i) => i.id === priceItem.id));
const brief = R.briefOf(biz.record.rep, v1.values);
ok('the assistant is told the model with its values', /price = 24 \(from 10 to 40/.test(brief) && /profit = \(price - cost\) \* units/.test(brief) && /= profit → 1200/.test(brief), brief);
const bad = O.applyRepOps(R.EMPTY_REPRESENTATION, [{ op: 'add', item: { id: 'eq', kind: 'equation', text: 'Nothing' } }, { op: 'add', item: { id: 'v', kind: 'variable', text: 'No name' } }], { by: 'ai', at: 1 });
ok('a model item without its content is refused, said why', bad.skipped.length === 2 && !bad.rep.items.length, JSON.stringify(bad.skipped));

// the record of a plain answer
console.log('\na factual question');
const fact = O.commit(O.EMPTY_RECORD, [{ op: 'add', item: { id: 'q_cap', kind: 'question', text: 'What is the capital of Australia?' } }, { op: 'add', item: { id: 'a_cap', kind: 'statement', role: 'answer', basis: 'known', text: 'Canberra.' } }, { op: 'relate', from: 'a_cap', to: 'q_cap', kind: 'answers', status: 'established' }], { by: 'ai', at: now() });
ok('a factual question needs one statement; its record is that statement', R.recordOf(fact.record.rep, fact.result.changes) === 'Canberra.');

// reading what the assistant sends
console.log('\nreading the assistant');
const fencedOut = 'Here you go:\n```json\n{"read": {"kind": "factual", "goal": "capital"}, "ops": [{"op": "add", "id": "a1", "kind": "answer", "text": "Canberra.", "basis": "fact",},],}\n```';
const m1 = M.readModelOutput(fencedOut);
ok('a fenced object with trailing commas is read', m1.parsed && m1.ops.length === 1 && m1.read === 'factual: capital');
ok('an answer is a statement in the answer role, well established', m1.ops[0].item.kind === 'statement' && m1.ops[0].item.role === 'answer' && m1.ops[0].item.basis === 'known');
const cut = '{"read":{"kind":"interpersonal"},"ops":[{"op":"add","id":"h1","kind":"possibility","label":"Attraction"},{"op":"connect","from":"h1","to":"q1","kind":"would explain"},{"op":"add","id":"h2","kind":"possib';
const m2 = M.readModelOutput(cut);
ok('output cut short keeps every whole operation', m2.ops.length === 2 && m2.dropped === 1, JSON.stringify(m2));
ok('near-synonyms are understood', m2.ops[0].item.kind === 'hypothesis' && m2.ops[0].item.text === 'Attraction' && m2.ops[1].op === 'relate' && m2.ops[1].kind === 'explains');
const m3 = M.readModelOutput('{"ops":[{"op":"status","id":"h1","status":"less likely","because":"x"},{"op":"add","kind":"constructor","text":"x"},{"op":"assess","id":"h2","to":"ruled out"},{"op":"add","id":"o1","kind":"evidence","text":"Seen","from":"user","links":[{"to":"h1","kind":"supports"}]}]}');
ok('standings in words are understood', m3.ops[0].status === 'weaker' && m3.ops[1].status === 'ruled_out');
ok('a word that is a prototype name finds nothing', !m3.ops.some((o) => o.op === 'add' && o.item.kind === 'constructor') && m3.dropped === 1);
ok('connections written inside an add become connections', m3.ops.some((o) => o.op === 'relate' && o.from === 'o1' && o.to === 'h1' && o.kind === 'supports') && m3.ops.find((o) => o.op === 'add').item.from === 'person');
ok('no JSON at all reads as nothing, said so', !M.readModelOutput('I think she was unhappy.').parsed);
ok('an array of operations alone is read', M.readModelOutput('[{"op":"add","id":"q","kind":"question","text":"Why?"}]').ops.length === 1);
const m4 = M.readModelOutput('{"ops":[{"op":"update","id":"h1","status":"more likely","because":"she said so"},{"op":"set","name":"price","value":"30"}]}');
ok('a status sent inside an update is a status change', m4.ops.some((o) => o.op === 'status' && o.status === 'stronger'));
ok('setting a variable is the model’s own operation', m4.ops.some((o) => o.op === 'model' && o.ops[0].op === 'var.set' && o.ops[0].value === 30));
const m5 = M.readModelOutput('{"ops":[],"alternatives":[{"label":"As a timeline","ask":"Show how this unfolded over time"},"As a comparison",{"label":"","ask":""}]}');
ok('other ways of showing it are read, at most three, never empty', m5.alternatives.length === 2 && m5.alternatives[1].label === 'As a comparison');
// applying what was read, end to end
const applied = O.applyRepOps(R.EMPTY_REPRESENTATION, [{ op: 'add', item: { id: 'q1', kind: 'question', text: 'Why?' } }, ...m2.ops], { by: 'ai', at: 1 });
ok('what was read applies', applied.rep.items.length === 2 && applied.rep.relations.length === 1 && applied.skipped.length === 0, JSON.stringify(applied.skipped));
ok('ordering events: years, BC, months, ISO dates, numbered stages', R.whenKey('c. 500 BC') < R.whenKey('1914') && R.whenKey('June 1914') > R.whenKey('1914') && R.whenKey('2024-03-01') > R.whenKey('2024') && R.whenKey('Week 2') === 2);

console.log(`\nnew-logos-representation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
