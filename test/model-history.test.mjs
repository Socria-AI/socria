// A model's history, held to what a person means by it.
//
// The audit ran the document layer (lib/model/docs.ts) through the edits a
// person actually makes and found five ways the history said one thing and did
// another (scratchpad audit exp1-docs.mjs, exp2-caps.mjs). Each is replayed
// here, on the real engine:
//
//   (a) drags on two different controls merged into one revision — the first
//       one's line was overwritten and one Undo took both back;
//   (b) past the cap of eight, the log kept indices into revisions that had
//       moved, so three lines said "now" and Trace restored the wrong one;
//   (c) reset stopped meaning "as built" once eight edits had pushed the
//       built revision out (h = 0.51, built 0.4);
//   (d) undo-then-edit left the abandoned future's line pointing at an index
//       that now held a different revision;
//   (e) a seventh model deleted the first in silence.
//
// And the merge two screens use when one's write lost the race
// (mergeWorkspaces): nobody's revision is lost, and nothing deleted returns.

import {
  openFromProposal, adopt, setValue, undo, redo, reset, restore, duplicate, branch, applyModelOps,
  current, docOf, sanitizeWorkspace, serializeWorkspace, mergeWorkspaces, mergeById, stableKey, docKey,
  evictionNote, nextEviction, builtOf, sinceBuilt, docLines, remove as removeDoc,
  EMPTY_WORKSPACE, REVISION_CAP, DOC_CAP,
} from './.tmp/docs.mjs';
import { setParam } from './.tmp/schema.mjs';
import { sanitizeMap } from './.tmp/logos.mjs';
import { LIBRARY, torus, saddle } from './.tmp/library.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

// The rocket nose cone of the incident, as the audit built it (exp1-docs.mjs).
const cone = () => ({
  id: 'nose-cone',
  title: 'Rocket nose cone',
  domain: 'geometry',
  params: [
    { id: 'd', label: 'base diameter', value: 0.2, min: 0.05, max: 1, units: 'm' },
    { id: 'h', label: 'height', value: 0.4, min: 0.05, max: 2, units: 'm' },
  ],
  objects: [
    {
      id: 'skin', kind: 'surface', label: 'Cone surface',
      defs: { px: '(d/2)*(1-v)*cos(u)', py: '(d/2)*(1-v)*sin(u)', pz: 'h*v' },
      over: { u: [0, 6.283185], v: [0, 1] }, depends: ['d', 'h'],
    },
    { id: 'vol', kind: 'scalar', label: 'Volume', definition: 'pi*(d/2)^2*h/3', depends: ['d', 'h'] },
  ],
});

const made = openFromProposal(EMPTY_WORKSPACE, cone(), { at: 1 });
ok('the nose cone builds as a document', !!made.doc, made.says);
const ID = made.doc.id;
const val = (ws, p, id = ID) => current(docOf(ws, id)).params.find((q) => q.id === p)?.value;
/** a slider drag, through the surface's own write path */
const drag = (ws, p, v, t, id = ID) => adopt(ws, id, setParam(current(docOf(ws, id)), p, v, t), t);

console.log('=== (a) each control is its own change ===');
{
  let ws = made.workspace;
  ws = drag(ws, 'd', 0.25, 10);
  ws = drag(ws, 'd', 0.3, 11); // the same drag, still going
  ws = drag(ws, 'h', 0.6, 5000); // a different control, later
  const doc = docOf(ws, ID);
  ok('one drag on d is one revision, wherever it passed through', doc.revisions.filter((m) => m.params.find((p) => p.id === 'd').value === 0.25).length === 0);
  ok('a drag on h after a drag on d is a revision of its own', doc.revisions.length === 3, String(doc.revisions.length));
  ok('  with a line of its own — the d line is not overwritten', doc.log.some((l) => /^d to 0\.3/.test(l.said)) && doc.log.some((l) => /^h to 0\.6/.test(l.said)), JSON.stringify(doc.log.map((l) => l.said)));
  ok('  each line names its control', doc.log.some((l) => l.kind === 'control:d') && doc.log.some((l) => l.kind === 'control:h'));
  const once = undo(ws, ID);
  ok('one Undo takes back only the last drag (h back to 0.4)', val(once, 'h') === 0.4, String(val(once, 'h')));
  ok('  and leaves the drag on d where it ended (d = 0.3)', val(once, 'd') === 0.3, String(val(once, 'd')));
  ok('  a second Undo takes back d', val(undo(once, ID), 'd') === 0.2);
  ok('  and redo brings h back', val(redo(once, ID), 'h') === 0.6);
  // the kind survives a round trip, so coalescing still works after a save
  const back = sanitizeWorkspace(JSON.parse(JSON.stringify(ws)));
  ok('the control a line names survives being stored', docOf(back, ID).log.some((l) => l.kind === 'control:h'), JSON.stringify(docOf(back, ID).log));
  const more = drag(back, 'h', 0.7, 6000);
  ok('  so the same drag continued after a save is still one revision', docOf(more, ID).revisions.length === 3 && val(more, 'h') === 0.7);
  // a selection or an opened view still coalesces as one kind
  const m = current(docOf(ws, ID));
  let sel = adopt(ws, ID, { ...m, version: (m.version ?? 0) + 1, selected: 'skin', lastChange: { what: 'select', to: 'skin', affected: [], at: 1 } }, 7000);
  const m2 = current(docOf(sel, ID));
  sel = adopt(sel, ID, { ...m2, version: (m2.version ?? 0) + 1, selected: 'vol', lastChange: { what: 'select', to: 'vol', affected: [], at: 2 } }, 7001);
  ok('clicking around is one change, whatever it lands on', docOf(sel, ID).revisions.length === 4, String(docOf(sel, ID).revisions.length));
}

console.log('=== (b) past the cap, every line still points at its own revision ===');
{
  let ws = drag(made.workspace, 'h', 0.6, 5);
  for (let i = 0; i < 9; i++) ws = setValue(ws, ID, 'h', 0.5 + i * 0.01, 100 + i).workspace; // exp1-docs.mjs
  const doc = docOf(ws, ID);
  ok(`the history keeps ${REVISION_CAP} revisions`, doc.revisions.length === REVISION_CAP && doc.at === REVISION_CAP - 1);
  const hOf = (i) => doc.revisions[i].params.find((p) => p.id === 'h').value;
  const said = doc.log.filter((l) => /^h → /.test(l.said));
  ok('every "h → x" line points at a revision where h is x', said.length > 0 && said.every((l) => Math.abs(hOf(l.at) - Number(l.said.slice(4))) < 1e-9), JSON.stringify(doc.log.map((l) => `${l.at}:${l.said}`)));
  ok('no two lines point at one revision', new Set(doc.log.map((l) => l.at)).size === doc.log.length);
  ok('exactly one line is "now"', doc.log.filter((l) => l.at === doc.at).length === 1);
  ok('every line points inside the history', doc.log.every((l) => l.at >= 0 && l.at < doc.revisions.length));
  ok('a line whose revision was dropped is dropped with it', !doc.log.some((l) => /built from the conversation/.test(l.said)));
  // Trace's restore buttons: each restores the revision its line names
  const line = doc.log.find((l) => l.said === 'h → 0.53');
  const back = restore(ws, ID, line.at);
  ok('Trace\'s "h → 0.53" restores h = 0.53', val(back, 'h') === 0.53, String(val(back, 'h')));
  ok('the conversation is told the right revision numbers', docLines(doc).some((l) => l === `revision ${doc.at + 1}: h → 0.58`), JSON.stringify(docLines(doc)));
}

console.log('=== (c) reset is "as built", however long the history ===');
{
  let ws = made.workspace;
  for (let i = 0; i < 9; i++) ws = setValue(ws, ID, 'h', 0.5 + i * 0.01, 100 + i).workspace;
  const doc = docOf(ws, ID);
  ok('the built revision has left the eight kept', doc.revisions.every((m) => m.params.find((p) => p.id === 'h').value !== 0.4));
  ok('  but it is pinned', !!doc.built && doc.built.params.find((p) => p.id === 'h').value === 0.4);
  const r = reset(ws, ID);
  ok('reset returns to how it was built (h = 0.4) — it used to give 0.51', val(r, 'h') === 0.4, String(val(r, 'h')));
  ok('  and d too', val(r, 'd') === 0.2);
  ok('  as a new revision, so the way back is not lost', docOf(r, ID).at === docOf(r, ID).revisions.length - 1);
  ok('"what have I changed" is measured from the build', !!sinceBuilt(doc) && builtOf(doc) === doc.built);
  const stored = sanitizeWorkspace(JSON.parse(JSON.stringify(serializeWorkspace(ws))));
  ok('the pinned build survives being stored and re-validated', !!docOf(stored, ID).built);
  ok('  so reset after a reload is still "as built"', val(reset(stored, ID), 'h') === 0.4);
  ok('a document that never outgrew the cap carries no extra copy', !docOf(setValue(made.workspace, ID, 'h', 0.9, 1).workspace, ID).built);
  ok('a reset before the cap is still revision one', val(reset(setValue(made.workspace, ID, 'h', 0.9, 1).workspace, ID), 'h') === 0.4);
}

console.log('=== (d) undo-then-edit forgets the future it replaced ===');
{
  let ws = made.workspace;
  ws = setValue(ws, ID, 'h', 0.7, 1).workspace; // r1
  ws = setValue(ws, ID, 'h', 0.8, 2).workspace; // r2
  ws = undo(ws, ID); // at r1
  ws = setValue(ws, ID, 'd', 0.5, 3).workspace; // replaces r2
  const doc = docOf(ws, ID);
  ok('the edit replaced the undone revision', doc.revisions.length === 3 && doc.at === 2);
  ok('the abandoned future\'s line is gone', !doc.log.some((l) => l.said === 'h → 0.8'), JSON.stringify(doc.log.map((l) => `${l.at}:${l.said}`)));
  ok('  and every line describes the revision it points at', doc.log.length === 3 && doc.log[2].said === 'd → 0.5' && doc.log[2].at === 2);
  // and a drag after an undo does not coalesce into the future it replaces
  let w2 = drag(made.workspace, 'h', 0.9, 10);
  w2 = undo(w2, ID);
  w2 = drag(w2, 'h', 1.1, 20);
  ok('a drag after an undo is a new revision on the old one', docOf(w2, ID).revisions.length === 2 && val(w2, 'h') === 1.1 && docOf(w2, ID).log.length === 2);
}

console.log('=== (e) a model the cap closes is named ===');
{
  // exp2-caps.mjs: seven library models opened in turn
  let ws = EMPTY_WORKSPACE;
  let last = null;
  for (const e of LIBRARY.slice(0, 7)) {
    const r = openFromProposal(ws, e.build(), { at: 1 });
    if (r.doc) ws = r.workspace;
    last = r;
  }
  ok(`the workspace holds ${DOC_CAP}`, ws.docs.length === DOC_CAP);
  ok('the seventh build says which model it closed', last.evicted?.length === 1 && last.evicted[0].id === LIBRARY[0].id, JSON.stringify(last.evicted));
  ok('  and the sentence the build note can carry names it', /closed/.test(evictionNote(last.evicted)) && evictionNote(last.evicted).includes(`(${LIBRARY[0].id})`), evictionNote(last.evicted));
  ok('  the engine\'s own report is left as it was', !/closed/.test(last.says));
  ok('a build that closes nothing says nothing', openFromProposal(EMPTY_WORKSPACE, torus(), { at: 1 }).evicted === undefined && evictionNote(undefined) === '');
  ok('which model the next build would close can be asked first', nextEviction(ws)?.id === ws.docs[0].id && nextEviction(EMPTY_WORKSPACE) === null);
  const copy = duplicate(ws, ws.docs[2].id);
  ok('a copy that closes one says which', copy.evicted?.[0]?.id === ws.docs[0].id);
  ok('  and so does a branch', branch(ws, ws.docs[2].id, 'what if').evicted?.[0]?.id === ws.docs[0].id);
  const ops = applyModelOps({ ...ws, active: ws.docs[3].id }, [{ op: 'duplicate' }]);
  ok('the conversation is told, in the verb\'s own reply', ops.said.some((s) => /closed/.test(s)), JSON.stringify(ops.said));
  // storage keeps the newest, as a build does
  const over = sanitizeWorkspace({ docs: [...ws.docs, ...openFromProposal(EMPTY_WORKSPACE, saddle(), { at: 1 }).workspace.docs.map((d) => ({ ...d, id: 'late-one' }))], active: 'late-one' });
  ok('a stored workspace over the cap keeps its newest documents, not its oldest', over.docs.length === DOC_CAP && over.docs.some((d) => d.id === 'late-one') && over.active === 'late-one');
}

console.log('=== two screens, one workspace: the merge ===');
{
  const base = openFromProposal(made.workspace, torus(), { at: 2 }).workspace; // the cone and the torus
  // theirs: h moved on the cone; mine: d moved on the cone, R moved on the torus, a saddle built
  const theirs = drag(base, 'h', 0.9, 100);
  let mine = drag(base, 'd', 0.6, 200);
  mine = drag(mine, 'r', 3, 300, 'torus');
  mine = openFromProposal(mine, saddle(), { at: 400 }).workspace;
  const m = mergeWorkspaces(base, mine, theirs);
  const ws = m.workspace;
  ok('their move on the cone survives (h = 0.9)', val(ws, 'h') === 0.9);
  ok('  and mine on the same cone (d = 0.6)', val(ws, 'd') === 0.6);
  ok('a document only I touched is mine (R = 3)', val(ws, 'r', 'torus') === 3);
  ok('a document only I made is kept', !!docOf(ws, 'saddle'));
  ok('  and is the one shown, since I opened it', ws.active === 'saddle');
  ok('their history is kept, with mine replayed on top', docOf(ws, ID).revisions.length === 3 && docOf(ws, ID).log.map((l) => l.said).join('|').includes('h to 0.9|d to 0.6'), JSON.stringify(docOf(ws, ID).log.map((l) => l.said)));
  ok('  each its own revision, so one Undo takes back mine and leaves theirs', val(undo(ws, ID), 'd') === 0.2 && val(undo(ws, ID), 'h') === 0.9);
  ok('  and the next drag of my control joins my replayed revision', docOf(drag(ws, 'd', 0.65, 500), ID).revisions.length === 3);
  ok('nothing was lost', m.lost.length === 0 && m.evicted.length === 0, JSON.stringify(m));

  // deletion on either side holds
  const closedThere = mergeWorkspaces(base, mine, removeDoc(theirs, 'torus'));
  ok('a document they closed stays closed, though I edited it', !docOf(closedThere.workspace, 'torus'));
  ok('  and I am told my edit to it was not kept', closedThere.lost.some((l) => /closed on another screen/.test(l)), JSON.stringify(closedThere.lost));
  const closedHere = mergeWorkspaces(base, removeDoc(mine, 'nose-cone'), theirs);
  ok('a document I closed stays closed, though they edited it', !docOf(closedHere.workspace, ID));
  ok('a document nobody touched is the same document', docKey(docOf(mergeWorkspaces(base, base, base).workspace, 'torus')) === docKey(docOf(base, 'torus')));

  // undo here, edit there: the undo's effect is kept on top of their change
  const moved = drag(base, 'd', 0.6, 10);
  const undone = undo(moved, ID);
  const theirsLater = drag(moved, 'h', 1.2, 20);
  const u = mergeWorkspaces(moved, undone, theirsLater);
  ok('an undo here is kept against an edit there: d back to 0.2, their h stays 1.2', val(u.workspace, 'd') === 0.2 && val(u.workspace, 'h') === 1.2, `${val(u.workspace, 'd')} ${val(u.workspace, 'h')}`);

  // both built a document under one id: both are kept
  const two = mergeWorkspaces(EMPTY_WORKSPACE, openFromProposal(EMPTY_WORKSPACE, saddle(), { at: 1 }).workspace, openFromProposal(EMPTY_WORKSPACE, { ...cone(), id: 'saddle' }, { at: 2 }).workspace);
  ok('two different documents built under one id are both kept, mine renamed', two.workspace.docs.length === 2 && two.renamed.length === 1 && two.renamed[0][0] === 'saddle', JSON.stringify(two.workspace.docs.map((d) => d.id)));
  ok('  every revision of the renamed one carries its new id', two.workspace.docs.every((d) => d.revisions.every((r) => r.id === d.id)));

  // the merge survives the server's re-check
  const back = sanitizeMap({ nodes: [], edges: [], models: JSON.parse(JSON.stringify(ws)) }, { trust: 'stored' });
  ok('the merged workspace is one the engine re-validates whole', back.models?.docs.length === ws.docs.length && val(back.models, 'h') === 0.9 && val(back.models, 'd') === 0.6);
}

console.log('=== the merge\'s pieces ===');
{
  const id = (x) => x.id;
  const b = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }];
  const m = [{ id: 'a', v: 2 }, { id: 'b', v: 1 }, { id: 'd', v: 1 }]; // changed a, dropped c, added d
  const t = [{ id: 'a', v: 1 }, { id: 'c', v: 3 }, { id: 'e', v: 1 }]; // dropped b, changed c, added e
  const r = mergeById(b, m, t, id);
  ok('mine changed: mine; theirs dropped: dropped; mine dropped: dropped; both added: kept', r.items.map((x) => `${x.id}${x.v}`).join(',') === 'a2,e1,d1', JSON.stringify(r.items));
  ok('a thing both sides changed differently is mine, and named', mergeById([{ id: 'x', v: 0 }], [{ id: 'x', v: 1 }], [{ id: 'x', v: 2 }], id).items[0].v === 1 && mergeById([{ id: 'x', v: 0 }], [{ id: 'x', v: 1 }], [{ id: 'x', v: 2 }], id).clashes[0] === 'x');
  ok('equal values in any key order are one value', stableKey({ a: 1, b: [1, { c: 2, d: 3 }] }) === stableKey({ b: [1, { d: 3, c: 2 }], a: 1 }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
