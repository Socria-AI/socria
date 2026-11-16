// SOCRIA CHANGES THE ARTIFACT IN PLACE, AND THE CONVERSATION AND ARTIFACTS SHOW ONE ARTIFACT (Logos 6, November 2026).
//
// What is held down here:
//   • what asks for a change: an edit verb in the imperative ("add memory cells under adaptive immunity", "make it a
//     tree"), never a question about the artifact ("what does the tax do?") or a request for something else;
//   • what it is about: the kept artifact open in Artifacts, else the element in Socria's last reply — as what it was
//     kept as, when it was kept — and nothing further back;
//   • what the model is told: the artifact's JSON, how a change is written, that nothing else changes;
//   • the gate: an edit block checked whole against that artifact — canonical with what changed said by the code, a
//     notice when it would not hold, nothing when it was not asked for or names another artifact; never two;
//   • landing it: applied as Socria's step (a reply's element kept first, linked where it was drawn), once, and when it
//     no longer holds, nothing — not even the keep;
//   • one identity: a kept element is drawn in the conversation as it now stands, with Edit beside Keep; the edit card
//     shows the change on the artifact itself, with Open and Undo; using it in a run is one step, not many.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const S = (o) => I.sanitizeInlineSpec(o);
const fence = (o) => '```ui\n' + JSON.stringify(o) + '\n```';

const MIND = S({ type: 'diagram', view: 'mind', title: 'The immune system', nodes: [{ id: 'r', label: 'The immune system' }, { id: 'a', label: 'Innate immunity' }, { id: 'b', label: 'Adaptive immunity' }, { id: 'c', label: 'B cells' }, { id: 'd', label: 'T cells' }], edges: [['r', 'a'], ['r', 'b'], ['b', 'c'], ['b', 'd']] });
const MARKET = S({ type: 'graph', title: 'A tax on sellers', expr: '10-x', label: 'demand', curves: [{ expr: '2+x+t', label: 'supply' }], x: [0, 10], params: [{ name: 't', label: 'tax', value: 0, min: 0, max: 4, step: 0.5 }], features: ['crossings'] });

console.log('\n=== what asks for a change ===');
{
  for (const t of ['Add memory cells under adaptive immunity', 'add a branch for vaccines', 'Can you add another curve for supply before the tax?', 'remove T cells', 'rename B cells to B lymphocytes', 'Now make it a tree', 'make the tax 2', 'change the title to Market for bread', 'please connect vaccines to adaptive immunity', 'ok, show the roots', 'restructure the map around cells', 'Great — could you shade the area from 0 to 3?', 'take out innate immunity'])
    ok(`a change: "${t}"`, I.asksToChange(t));
  for (const t of ['What does the tax do to the price?', 'why is adaptive immunity slower?', 'how do B cells make antibodies', 'Make me a study plan for my exam', 'make sense of this for me', 'Show me how photosynthesis works', 'Is the supply curve right?', 'thanks!', 'Tell me more about T cells', 'add up 3 and 4', 'should I add a branch?'])
    ok(`…not a change to an artifact: "${t}"`, !I.asksToChange(t));
  ok('a long new message is never read as one', !I.asksToChange('Add ' + 'more context about the history of vaccination and how it changed medicine, '.repeat(6)));
}

console.log('\n=== what it is about ===');
{
  const reply = { id: 'm_reply1', role: 'assistant', content: 'Here is how the parts fit.\n\n' + fence(MIND) + '\n\nThe innate side acts first.' };
  const msgs = (t, r = reply) => [{ role: 'user', content: 'How does the immune system fit together?' }, r, { role: 'user', content: t }];
  const t1 = I.editTargetOf({ text: 'Add memory cells under adaptive immunity', space: null, messages: msgs('Add memory cells under adaptive immunity') });
  ok('the element in Socria’s last reply, named by the reply and its position', t1 && t1.ref === 'm_reply1:0' && t1.where === 'reply' && t1.title === 'The immune system' && t1.spec.type === 'diagram', J(t1));
  ok('a question about it is not a change: nothing', I.editTargetOf({ text: 'Why is adaptive immunity slower?', space: null, messages: msgs('Why is adaptive immunity slower?') }) === null);
  const older = [{ role: 'user', content: 'x' }, reply, { role: 'user', content: 'thanks' }, { id: 'm_plain', role: 'assistant', content: 'Glad it helped.' }, { role: 'user', content: 'add memory cells under adaptive immunity' }];
  ok('nothing further back than the last reply: "it" is what is on screen', I.editTargetOf({ text: 'add memory cells under adaptive immunity', space: null, messages: older }) === null);
  // kept since: the change lands on what it was kept as — the version they have been changing
  const kept = I.keptFrom(MIND, undefined, { session: 'sL6_focus_001', message: 'm_reply1', said: 'Here is how the parts fit.', at: 1730000000000 });
  let made = I.makeDisplay(I.EMPTY_SPACE, 'kept', kept, 'socria');
  const id = made.obj.id;
  const renamed = I.applyObjectStep(made.space, id, 'edit', { ops: J([{ op: 'replace', path: '/nodes/3/label', value: 'B lymphocytes' }]), said: 'renamed B cells' }, { by: 'person', at: 1730000001000 });
  const space = renamed.space;
  const linked = { ...reply, ui: { 0: { artifact: id } } };
  const t2 = I.editTargetOf({ text: 'add plasma cells under B lymphocytes', space, messages: msgs('add plasma cells under B lymphocytes', linked) });
  ok('kept since: the kept artifact, as it now stands (their rename in it)', t2 && t2.ref === id && t2.where === 'kept' && t2.spec.nodes.some((n) => n.label === 'B lymphocytes'), J(t2));
  const t3 = I.editTargetOf({ text: 'make it a tree', space, inHand: id, messages: [{ role: 'user', content: 'make it a tree' }] });
  ok('the kept artifact open in Artifacts comes first, whatever the conversation last drew', t3 && t3.ref === id, J(t3));
  ok('…an id that is not a kept artifact is not one', I.editTargetOf({ text: 'make it a tree', space, inHand: 'nope', messages: [{ role: 'user', content: 'make it a tree' }] }) === null);
  const block = I.editFocusBlock(t1);
  ok('the model is told: the artifact’s JSON, its ref, the edit grammar, change only what was asked, never redraw it', block.includes(J(MIND)) && /ref "m_reply1:0"/.test(block) && /"type":"edit","of":"m_reply1:0"/.test(block) && /Change only what they asked for/.test(block) && /never draw it again as a new element/.test(block) && /a plain pair hangs a part under another/.test(block));
}

console.log('\n=== the gate: checked whole against the artifact ===');
{
  const target = { ref: 'm_reply1:0', title: 'The immune system', spec: MIND, where: 'reply' };
  const add = { type: 'edit', of: 'm_reply1:0', ops: [{ op: 'add', path: '/nodes/-', value: { id: 'n6', label: 'Memory cells' } }, { op: 'add', path: '/edges/-', value: ['b', 'n6'] }], note: 'added memory cells' };
  const seen = { n: 0 };
  const out = I.gateEditBlock(fence(add), target, seen);
  const e = out && I.parseEditSpec(out.replace(/^```ui\n|\n```\s*$/g, ''));
  ok('a change that holds goes out canonical, with what it changes said by the code', e && e.of === 'm_reply1:0' && /added “Memory cells” under “Adaptive immunity”/.test(e.said) && e.title === 'The immune system' && e.note === 'added memory cells', out);
  ok('…once: a second edit in the same reply is dropped', I.gateEditBlock(fence(add), target, seen) === '');
  const two = { n: 0 };
  const orphan = { ...add, ops: [{ op: 'add', path: '/nodes/-', value: { id: 'n7', label: 'Orphan' } }] };
  const refused = I.gateEditBlock(fence(orphan), target, two);
  ok('one that would not hold (a part hung from nothing in a mind map) changes nothing and says so', /^_The change to “The immune system” was not made/.test(refused) && two.n === 0, refused);
  ok('one naming another artifact: nothing', I.gateEditBlock(fence({ ...add, of: 'K9' }), target, { n: 0 }) === '');
  ok('one with no change asked for this turn: nothing', I.gateEditBlock(fence(add), null, { n: 0 }) === '');
  ok('…but a ```json block on such a turn is code, left for the element gate (someone asked for JSON)', I.gateEditBlock('```json\n' + J(add) + '\n```', null, { n: 0 }) === null);
  ok('cut off mid-stream: nothing yet', I.gateEditBlock('```ui\n{"type":"edit","of":"m_reply1:0","ops":[', target, { n: 0 }, true) === '');
  ok('anything that is not an edit block is left to the element gate', I.gateEditBlock(fence(MIND), target, { n: 0 }) === null && I.gateEditBlock('```python\nprint(1)\n```', target, { n: 0 }) === null);
  ok('a type change is refused like any other edit that would not hold', /was not made/.test(I.gateEditBlock(fence({ ...add, ops: [{ op: 'replace', path: '/type', value: 'graph' }] }), target, { n: 0 })));
}

console.log('\n=== landing it on the artifact ===');
{
  const reply = { id: 'm_reply1', content: 'Here is how the parts fit.\n\n' + fence(MIND) };
  const edit = I.parseEditSpec(J({ type: 'edit', of: 'm_reply1:0', title: 'The immune system', ops: [{ op: 'add', path: '/nodes/-', value: { id: 'n6', label: 'Memory cells' } }, { op: 'add', path: '/edges/-', value: ['b', 'n6'] }], said: 'added the part “Memory cells”' }));
  const find = (id) => (id === 'm_reply1' ? reply : null);
  const r = I.landEdit(I.EMPTY_SPACE, edit, 'm_reply2#0', find, { session: 'sL6_focus_001', said: () => 'Here is how the parts fit.', at: 1730000000000 });
  const o = r.space?.objs.find((x) => x.id === r.id);
  ok('a reply’s element not kept yet: kept first, the change made to it as Socria’s step, the link back returned', !r.skip && o?.kind === 'kept' && o.steps.length === 1 && o.steps[0].by === 'socria' && o.steps[0].op === 'edit' && J(r.link) === J({ msg: 'm_reply1', n: 0 }), J(r).slice(0, 300));
  const now = I.currentOf(o);
  ok('…only what was asked changed: the new part under Adaptive immunity, every other part as it was', now.spec.nodes.length === 6 && now.spec.edges.some((e) => e[0] === 'b' && e[1] === 'n6') && J(now.spec.nodes.slice(0, 5)) === J(MIND.nodes), J(now.spec));
  ok('…and kept from where it came from', now.from.message === 'm_reply1');
  const again = I.landEdit(r.space, { ...edit, of: r.id }, 'm_reply2#0', find);
  ok('landed once: the same block read again changes nothing', again.skip === 'Already made.', J(again));
  const bad = I.landEdit(I.EMPTY_SPACE, { ...edit, ops: [{ op: 'remove', path: '/nodes/0' }] }, 'm_reply3#0', find);
  ok('a change that no longer holds: nothing made — and nothing kept for it either', bad.skip && !bad.space, J(bad));
  ok('an artifact that is not here: nothing', I.landEdit(I.EMPTY_SPACE, { ...edit, of: 'm_gone:0' }, 'm_x#0', find).skip);
}

console.log('\n=== one identity: the conversation draws the artifact as it now stands ===');
{
  const reply = 'Here is how the parts fit.\n\n' + fence(MARKET);
  const edited = I.applyEdits(MARKET, [{ op: 'add', path: '/curves/-', value: { expr: '2+x', label: 'supply before the tax' } }]).spec;
  const host = (extra = {}) => ({ live: true, onState: () => {}, onOpen: () => {}, state: { 0: { artifact: 'K1' } }, ...extra });
  const R = (hst) => renderToStaticMarkup(h(I.RichText, { rich: true, text: reply, inline: hst }));
  const drawn = R(host({ resolve: () => ({ spec: edited, edits: 1 }), onEdit: () => {} }));
  ok('kept and changed since: the reply draws the changed artifact, not its original', /supply before the tax/.test(drawn), drawn.slice(0, 300));
  ok('…still marked as kept, with how often it changed since', /Kept — open in Artifacts/.test(drawn) && /Changed once since it was kept/.test(drawn));
  ok('Edit sits beside Keep, a real button', /<button type="button" class="ln-keep is-edit"[^>]*>.*Edit<\/button>/.test(drawn));
  const gone = R(host({ resolve: () => null, onEdit: () => {} }));
  ok('what was kept is gone: the reply’s own element, as before', !/supply before the tax/.test(gone) && /supply/.test(gone));
  ok('no Edit where nothing can be kept (someone else’s line)', !/is-edit/.test(R({ live: true, onState: () => {} })));
}

console.log('\n=== the edit card: the change, on the artifact itself ===');
{
  const after = I.applyEdits(MIND, [{ op: 'add', path: '/nodes/-', value: { id: 'n6', label: 'Memory cells' } }, { op: 'add', path: '/edges/-', value: ['b', 'n6'] }]).spec;
  const text = 'I added memory cells under adaptive immunity.\n\n' + fence({ type: 'edit', of: 'm_reply1:0', title: 'The immune system', ops: [{ op: 'add', path: '/nodes/-', value: { id: 'n6', label: 'Memory cells' } }], said: 'added the part “Memory cells”' });
  const R = (res) => renderToStaticMarkup(h(I.RichText, { rich: true, text, inline: { live: true, resolveEdit: () => res, onUndoEdit: () => {}, onOpenArtifact: () => {}, onArtifactState: () => {} } }));
  const card = R({ spec: after, id: 'K1', made: true, applied: true, undo: true });
  ok('what changed, said; the artifact drawn as it now stands (the new part in it)', /Changed in place/.test(card) && /Added the part “Memory cells”\./.test(card) && /Memory cells/.test(card.replace(/Added the part “Memory cells”/, '')) && /ln-mind/.test(card), card.slice(0, 400));
  ok('…with Open in Artifacts and Undo this change, real buttons', /<button[^>]*>Open in Artifacts<\/button>/.test(card) && /<button[^>]*>Undo this change<\/button>/.test(card));
  ok('changed again since: no Undo of its own, and it says where the versions are', !/Undo this change/.test(R({ spec: after, id: 'K1', made: true, applied: true, undo: false })) && /Changed again since/.test(R({ spec: after, id: 'K1', made: true, applied: true, undo: false })));
  ok('undone: said', /Undone — the version before it is showing/.test(R({ spec: MIND, id: 'K1', made: true, applied: false, undo: false })));
  ok('not made (the artifact had moved on): said, never claimed', /Not made/.test(R({ spec: MIND, id: 'K1', made: false, applied: false, undo: false })));
  ok('not on this device: said, and no buttons that would do nothing', /not on this device/.test(R(null)) && !/<button/.test(R(null)));
  ok('copied, and read back by the model on a later turn, it is a sentence, not JSON', /Changed “The immune system” in place: added the part “Memory cells”\./.test(I.contentAsText(text)) && /\[Changed “The immune system” in place/.test(I.contentForHistory(text)) && !/"ops"/.test(I.contentForHistory(text)));
  ok('…and it is not mistaken for an element: none drawn from it', I.specsIn(text)[0] === null && I.editsIn(text).length === 1 && I.editsIn(text)[0].n === 0);
}

console.log('\n=== using it in a run is one step ===');
{
  const kept = I.keptFrom(MARKET, undefined, { session: 'sL6_focus_002', message: 'm_g', said: 'A tax', at: 1730000000000 });
  let sp = I.makeDisplay(I.EMPTY_SPACE, 'kept', kept, 'person').space;
  const id = sp.objs[0].id;
  for (const t of [0.5, 1, 1.5, 2]) sp = I.applyObjectStep(sp, id, 'state', { state: J({ values: { t } }) }, { by: 'person' }).space;
  let o = sp.objs[0];
  ok('a slider scrubbed four times: one step, holding where it was left', o.steps.length === 1 && I.currentOf(o).ui.values.t === 2, J(o.steps));
  sp = I.applyObjectStep(sp, id, 'edit', { ops: J([{ op: 'replace', path: '/x', value: [0, 12] }]), said: 'x now runs from 0 to 12' }, { by: 'person' }).space;
  sp = I.applyObjectStep(sp, id, 'state', { state: J({ values: { t: 3 } }) }, { by: 'person' }).space;
  o = sp.objs[0];
  ok('…an edit between two runs keeps them apart', o.steps.map((s) => s.op).join(',') === 'state,edit,state', o.steps.map((s) => s.op).join(','));
  ok('…and the history it makes reads back whole (every step re-computed on load)', J(I.sanitizeSpace(JSON.parse(J(sp))).objs[0].states) === J(o.states));
}

console.log('\n=== a mind map opened on the Logic Map keeps its shape and its kinds of link ===');
{
  const M = await import('./.tmp/universal-map-under-test.mjs');
  const linked = S({ ...MIND, edges: [...MIND.edges, ['d', 'c', 'needs']] });
  const d = M.drawingFromInline(linked);
  const role = (label) => d.nodes.find((n) => n.label === label)?.role;
  ok('the centre is the whole, every other part a part (a link across does not make a child)', role('The immune system') === 'whole' && ['Innate immunity', 'B cells', 'T cells'].every((l) => role(l) === 'part'), J(d.nodes.map((n) => [n.label, n.role])));
  ok('branches point up, part of, as a hierarchy’s do', d.edges.filter((e) => e.relation === 'part_of').length === 4 && d.edges.some((e) => e.from === 'd_c' && e.to === 'd_b' && e.relation === 'part_of'));
  ok('the link across keeps its kind: T cells needs B cells → depends', d.edges.some((e) => e.from === 'd_d' && e.to === 'd_c' && e.relation === 'depends'), J(d.edges));
}

console.log(`\nartifact focus: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
