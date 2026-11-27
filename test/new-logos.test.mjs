// NEW LOGOS — the node architecture (docs/NEW-LOGOS.md), against the in-memory store that keeps the database's rules.
//
// What is held down:
//   • six node types share one shape; content and states are checked per type;
//   • containment is a tree of objectives with no depth limit — no cycles, no placing into a non-objective or an
//     archived objective, no orphans;
//   • nothing is deleted by accident: archive first, empty only, never recursive; a conversation node may always be
//     removed, and the conversation it placed is untouched (it returns to the unplaced list);
//   • a decision is accepted only by the accept action, never by an edit or a create;
//   • edits are versioned and compare-and-swap: a stale edit is refused, a version's words can be brought back;
//   • relations are a graph beside the tree, owner-scoped, without duplicates;
//   • the context package is selective, honest about provenance and unaccepted decisions, and satisfies the existing
//     chat endpoint's objective contract;
//   • the conversation helpers never drop a stored column from a save.

import * as X from './.tmp/new-logos-under-test.mjs';

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => (cond ? (pass++, console.log('  ok   ' + name)) : (fail++, console.log('  FAIL ' + name + (extra ? '  ' + String(extra).slice(0, 400) : ''))));

const A = 'user_a';
const B = 'user_b';
let t = 1_000_000;
const now = () => (t += 1000);
const store = X.memoryStore({ conversations: [{ id: 'lg_a1', user_id: A }, { id: 'lg_a2', user_id: A }, { id: 'lg_b1', user_id: B }] });
const make = async (input, who = A) => {
  const r = await X.createNode(store, who, input, now());
  if (!r.ok) throw new Error(`create failed: ${r.error.code} ${r.error.message}`);
  return r.value;
};
const get = async (id, who = A) => (await store.nodes(who)).find((n) => n.id === id);

console.log('=== one shape, six types ===');
{
  ok('six node types', X.NODE_TYPES.join() === 'objective,conversation,question,knowledge,decision,artifact');
  const bad = await X.createNode(store, A, { type: 'folder', title: 'x' }, now());
  ok('an unknown type is refused', !bad.ok && bad.error.code === 'invalid');
  const q = await make({ type: 'question', title: '  What   limits growth? ', state: 'exploring' });
  ok('title cleaned, state kept when valid', q.title === 'What limits growth?' && q.state === 'exploring');
  const q2 = await make({ type: 'question', title: 'x', state: 'accepted' });
  ok('a state that does not apply falls back to the first', q2.state === 'open');
  const k = await make({ type: 'knowledge', title: 'Rates rose', content: { body: 'Line one\nLine two', kind: 'evidence', stray: 1 }, provenance: { origin: 'external', source: { label: 'Bulletin', url: 'javascript:alert(1)' } } });
  ok('knowledge keeps its body and kind, drops unknown fields', k.content.body === 'Line one\nLine two' && k.content.kind === 'evidence' && !('stray' in k.content));
  ok('external provenance kept, a script address refused', k.provenance.origin === 'external' && k.provenance.source.label === 'Bulletin' && !k.provenance.source.url);
  const art = await make({ type: 'artifact', title: 'Notes', content: { subtype: 'simulation', body: '# Hi' } });
  ok('an artifact subtype not yet available becomes a document', art.content.subtype === 'document' && art.content.body === '# Hi');
  const untitled = await make({ type: 'objective' });
  ok('an empty title becomes "Untitled objective"', untitled.title === 'Untitled objective');
  ok('every node starts at version 1 with provenance', [q, k, art].every((n) => n.version === 1 && n.provenance.origin));
}

console.log('\n=== containment: a tree of objectives, any depth, no cycles ===');
let top, mid, deep, leafQ;
{
  top = await make({ type: 'objective', title: 'Finish the degree' });
  mid = await make({ type: 'objective', title: 'Pass year two', parentId: top.id });
  deep = await make({ type: 'objective', title: 'Statistics module', parentId: mid.id });
  let at = deep;
  for (let i = 0; i < 12; i++) at = await make({ type: 'objective', title: `Level ${i}`, parentId: at.id });
  const idx = X.indexNodes(await store.nodes(A));
  ok('no arbitrary depth limit (15 levels)', X.ancestorsOf(idx, at.id).length === 14);
  leafQ = await make({ type: 'question', title: 'Which test?', parentId: deep.id });
  const intoQuestion = await X.createNode(store, A, { type: 'knowledge', title: 'x', parentId: leafQ.id }, now());
  ok('only an objective can contain', !intoQuestion.ok && intoQuestion.error.code === 'bad_parent');
  const cyc = await X.moveNode(store, A, top.id, deep.id, (await get(top.id)).version, now());
  ok('moving an objective inside its own descendant is refused (cycle)', !cyc.ok && cyc.error.code === 'cycle');
  const self = await X.moveNode(store, A, mid.id, mid.id, (await get(mid.id)).version, now());
  ok('moving a node into itself is refused', !self.ok && self.error.code === 'cycle');
  const mv = await X.moveNode(store, A, leafQ.id, top.id, leafQ.version, now());
  ok('a valid move lands, and is versioned', mv.ok && mv.value.parent_id === top.id && mv.value.version === 2);
  const ghost = await X.createNode(store, A, { type: 'question', title: 'x', parentId: 'n_doesnotexist' }, now());
  ok('a parent that does not exist is refused (no orphans)', !ghost.ok && ghost.error.code === 'bad_parent');
  const kids = X.childrenOf(await store.nodes(A), top.id).map((n) => n.title);
  ok('a matrix lists its direct members in order', kids.join('|') === 'Pass year two|Which test?', kids.join('|'));
}

console.log('\n=== account isolation ===');
{
  const foreignParent = await X.createNode(store, B, { type: 'question', title: 'x', parentId: top.id }, now());
  ok("another account cannot place into this account's objective", !foreignParent.ok && foreignParent.error.code === 'bad_parent');
  const foreignEdit = await X.updateNode(store, B, top.id, { version: 1, title: 'mine now' }, now());
  ok("another account cannot edit this account's node", !foreignEdit.ok && foreignEdit.error.code === 'not_found');
  const foreignConv = await X.createNode(store, B, { type: 'conversation', conversationId: 'lg_a1' }, now());
  ok("another account cannot place this account's conversation", !foreignConv.ok && foreignConv.error.code === 'conversation_unknown');
  ok('lists are per account', (await store.nodes(B)).length === 0);
  const foreignLink = await X.linkNodes(store, B, { fromId: top.id, toId: mid.id, kind: 'informs' }, now());
  ok("another account cannot relate this account's nodes", !foreignLink.ok && foreignLink.error.code === 'not_found');
}

console.log('\n=== conversations: placed, never copied, never deleted with their node ===');
let convNode;
{
  convNode = await make({ type: 'conversation', conversationId: 'lg_a1', parentId: mid.id, title: 'ignored' });
  ok('a conversation node holds only the canonical id; its title stays on the conversation', convNode.conversation_id === 'lg_a1' && convNode.title === '');
  const again = await make({ type: 'conversation', conversationId: 'lg_a1', parentId: top.id });
  ok('placing it again moves the one node (one placement per conversation)', again.id === convNode.id && again.parent_id === top.id);
  ok('…and no second node exists', (await store.nodes(A)).filter((n) => n.conversation_id === 'lg_a1').length === 1);
  const rename = await X.updateNode(store, A, convNode.id, { version: again.version, title: 'x' }, now());
  ok("a conversation node's title is not edited here (it is renamed on the conversation)", !rename.ok && rename.error.code === 'invalid');
  const all = [{ id: 'lg_a1', title: 'One', messages: [], updatedAt: 1 }, { id: 'lg_a2', title: 'Two', messages: [], updatedAt: 1 }];
  ok('unplaced lists conversations with no active node', X.unplaced(all, await store.nodes(A)).map((c) => c.id).join() === 'lg_a2');
  const arch = await X.archiveNode(store, A, convNode.id, again.version, now());
  ok('archiving a conversation node returns the conversation to unplaced', arch.ok && X.unplaced(all, await store.nodes(A)).map((c) => c.id).join() === 'lg_a1,lg_a2');
  const back = await make({ type: 'conversation', conversationId: 'lg_a1', parentId: mid.id });
  ok('placing an archived conversation restores its node instead of making another', back.id === convNode.id && back.archived_at === null && back.parent_id === mid.id);
  const del = await X.deleteNode(store, A, convNode.id);
  ok('a conversation node can be removed at any time…', del.ok && del.value.conversationId === 'lg_a1');
  ok('…and the canonical conversation is untouched', store.conversations.some((c) => c.id === 'lg_a1' && c.user_id === A));
  convNode = await make({ type: 'conversation', conversationId: 'lg_a1', parentId: mid.id });
}

console.log('\n=== nothing deleted by accident ===');
{
  const busy = await X.deleteNode(store, A, mid.id);
  ok('a node that contains others cannot be deleted', !busy.ok && busy.error.code === 'has_children');
  const k = await make({ type: 'knowledge', title: 'Old note', parentId: top.id });
  const live = await X.deleteNode(store, A, k.id);
  ok('a node must be archived before it is deleted', !live.ok && live.error.code === 'not_archived');
  const a = await X.archiveNode(store, A, k.id, k.version, now());
  ok('archived', a.ok && a.value.archived_at !== null);
  const edit = await X.updateNode(store, A, k.id, { version: a.value.version, title: 'x' }, now());
  ok('an archived node cannot be edited', !edit.ok && edit.error.code === 'archived');
  const gone = await X.deleteNode(store, A, k.id);
  ok('archived and empty: deleted', gone.ok && !(await get(k.id)));
  // an archived objective still holds its members; deleting it is refused until they are moved
  const box = await make({ type: 'objective', title: 'Box' });
  const inside = await make({ type: 'question', title: 'Inside', parentId: box.id });
  const ab = await X.archiveNode(store, A, box.id, box.version, now());
  const stillFull = await X.deleteNode(store, A, box.id);
  ok('an archived objective with members is not deleted (never recursive)', ab.ok && !stillFull.ok && stillFull.error.code === 'has_children');
  ok('its members are kept, not archived or deleted', (await get(inside.id))?.archived_at === null);
  const into = await X.moveNode(store, A, leafQ.id, box.id, (await get(leafQ.id)).version, now());
  ok('nothing can be moved into an archived objective', !into.ok && into.error.code === 'archived');
  const r = await X.restoreNode(store, A, box.id, ab.value.version, now());
  ok('restored', r.ok && r.value.archived_at === null);
  // a member restored after its container was archived comes back to the top level, not into hiding
  const m = await make({ type: 'question', title: 'Member', parentId: box.id });
  const am = await X.archiveNode(store, A, m.id, m.version, now());
  const box2 = await get(box.id);
  await X.archiveNode(store, A, box.id, box2.version, now());
  const rm = await X.restoreNode(store, A, m.id, am.value.version, now());
  ok('restoring into an archived container lands at the top level', rm.ok && rm.value.parent_id === null && rm.value.archived_at === null);
}

console.log('\n=== decisions: the person accepts, nothing else does ===');
{
  const d = await make({ type: 'decision', title: 'Use a t-test', state: 'accepted', provenance: { origin: 'ai', approvedAt: 123 }, content: { rationale: 'Small sample', alternatives: ['Mann-Whitney'], uncertainties: ['Normality'] } });
  ok('a created decision is a proposal, whatever was asked', d.state === 'proposed');
  ok('approval cannot be supplied on create', !('approvedAt' in d.provenance) && d.provenance.origin === 'ai');
  const sneak = await X.updateNode(store, A, d.id, { version: d.version, state: 'accepted' }, now());
  ok('an edit cannot accept a decision', !sneak.ok && sneak.error.code === 'needs_acceptance');
  const sneak2 = await X.updateNode(store, A, d.id, { version: d.version, provenance: { origin: 'ai', approvedAt: 5 } }, now());
  ok('an edit cannot add approval', sneak2.ok && !('approvedAt' in sneak2.value.provenance));
  const acc = await X.decide(store, A, d.id, 'accept', sneak2.value.version, now());
  ok('the accept action accepts, and records when', acc.ok && acc.value.state === 'accepted' && acc.value.provenance.approvedAt > 0);
  ok('…keeping that it was proposed by AI', acc.value.provenance.origin === 'ai');
  const un = await X.updateNode(store, A, d.id, { version: acc.value.version, state: 'rejected' }, now());
  ok('an accepted decision is not changed by an edit either', !un.ok && un.error.code === 'needs_acceptance');
  const re = await X.decide(store, A, d.id, 'reopen', acc.value.version, now());
  ok('reopening returns it to a proposal and clears approval', re.ok && re.value.state === 'proposed' && !re.value.provenance.approvedAt);
  const notDecision = await X.decide(store, A, top.id, 'accept', (await get(top.id)).version, now());
  ok('only decisions are accepted', !notDecision.ok && notDecision.error.code === 'invalid');
}

console.log('\n=== versions and stale edits ===');
{
  const art = await make({ type: 'artifact', title: 'Draft', content: { body: 'one' } });
  const v2 = await X.updateNode(store, A, art.id, { version: 1, content: { body: 'two' } }, now());
  const v3 = await X.updateNode(store, A, art.id, { version: v2.value.version, title: 'Draft B', content: { body: 'three' } }, now());
  ok('each edit bumps the version', v3.ok && v3.value.version === 3);
  const stale = await X.updateNode(store, A, art.id, { version: 2, title: 'from an old tab' }, now());
  ok('an edit from a stale copy is refused, not applied', !stale.ok && stale.error.code === 'conflict' && (await get(art.id)).title === 'Draft B');
  const same = await X.updateNode(store, A, art.id, { version: 3, title: 'Draft B' }, now());
  ok('an edit that changes nothing writes nothing', same.ok && same.value.version === 3);
  const vs = await store.versions(A, art.id);
  ok('previous states are kept as versions', vs.map((v) => v.version).join() === '2,1' && vs[1].snapshot.content.body === 'one');
  const back = await X.restoreVersion(store, A, art.id, 1, 3, now());
  ok("a version's words can be brought back (as a new version)", back.ok && back.value.content.body === 'one' && back.value.title === 'Draft' && back.value.version === 4);
  let cur = back.value;
  for (let i = 0; i < 60; i++) cur = (await X.updateNode(store, A, art.id, { version: cur.version, content: { body: `v${i}` } }, now())).value;
  ok('only the last 50 versions are kept', (await store.versions(A, art.id)).length === X.LIMITS.versionsKept);
}

console.log('\n=== relations: a graph beside the tree ===');
let k1;
{
  k1 = await make({ type: 'knowledge', title: 'Variance is unknown', provenance: { origin: 'ai', conversationId: 'lg_a1', messageId: 'm_abcdef12' } });
  const r1 = await X.linkNodes(store, A, { fromId: k1.id, toId: deep.id, kind: 'informs' }, now());
  const r2 = await X.linkNodes(store, A, { fromId: k1.id, toId: top.id, kind: 'informs' }, now());
  ok('one knowledge node informs two objectives without being copied', r1.ok && r2.ok && (await store.nodes(A)).filter((n) => n.title === 'Variance is unknown').length === 1);
  const dup = await X.linkNodes(store, A, { fromId: k1.id, toId: deep.id, kind: 'informs' }, now());
  ok('a duplicate relation is refused', !dup.ok && dup.error.code === 'duplicate');
  const selfLink = await X.linkNodes(store, A, { fromId: k1.id, toId: k1.id, kind: 'related_to' }, now());
  ok('a node is not related to itself', !selfLink.ok);
  const badKind = await X.linkNodes(store, A, { fromId: k1.id, toId: top.id, kind: 'owns' }, now());
  ok('an unknown relationship is refused', !badKind.ok && badKind.error.code === 'invalid');
  const un = await X.unlinkNodes(store, A, r2.value.id);
  ok('a relation can be removed; its nodes stay', un.ok && !!(await get(k1.id)) && !!(await get(top.id)));
  const unB = await X.unlinkNodes(store, B, r1.value.id);
  ok("another account cannot remove this account's relation", !unB.ok);
}

console.log('\n=== the context package: selective, explicit, honest ===');
{
  // the conversation sits in "Pass year two" (mid); fill its matrix and relate a few things
  const qOpen = await make({ type: 'question', title: 'Is attendance required?', parentId: mid.id });
  const qDone = await make({ type: 'question', title: 'Which textbook?', parentId: mid.id, content: { resolution: 'The blue one' } });
  await X.updateNode(store, A, qDone.id, { version: qDone.version, state: 'resolved' }, now());
  const dAcc = await make({ type: 'decision', title: 'Take the evening class', parentId: mid.id, content: { rationale: 'Work hours' } });
  await X.decide(store, A, dAcc.id, 'accept', dAcc.version, now());
  await make({ type: 'decision', title: 'Drop French', parentId: mid.id, provenance: { origin: 'ai' } });
  await make({ type: 'knowledge', title: 'Exam is open-book', parentId: mid.id, provenance: { origin: 'external', source: { label: 'Handbook' } } });
  const kOld = await make({ type: 'knowledge', title: 'Archived fact', parentId: mid.id });
  await X.archiveNode(store, A, kOld.id, kOld.version, now());
  await make({ type: 'artifact', title: 'Revision plan', parentId: mid.id });
  await make({ type: 'conversation', conversationId: 'lg_a2', parentId: mid.id });
  await X.linkNodes(store, A, { fromId: convNode.id, toId: k1.id, kind: 'references' }, now());
  await X.linkNodes(store, A, { fromId: convNode.id, toId: qOpen.id, kind: 'investigates' }, now());
  await X.updateNode(store, A, mid.id, { version: (await get(mid.id)).version, description: 'Year two of the degree', content: { outcome: 'Average above 65' } }, now());

  const nodes = await store.nodes(A);
  const rels = await store.relations(A);
  const turn = X.contextFor(nodes, rels, 'lg_a1', 7);
  ok('a placed conversation has a context', !!turn);
  ok('the objective is the one that contains it, with its outcome', turn.objective.goal === 'Pass year two' && turn.objective.outcome === 'Average above 65');
  ok('the path above it is said', turn.objective.notes.some((n) => n.t === 'This objective is part of: Finish the degree'));
  ok('what the conversation investigates is said', turn.objective.notes.some((n) => n.t.includes('investigates: Is attendance required?')));
  ok('sub-objectives are threads', turn.objective.threads.includes('Statistics module'));
  ok('accepted decisions are decided, with rationale', turn.work.decisions.join() === 'Take the evening class — Work hours');
  ok('an unaccepted decision is never given as decided', !turn.work.decisions.some((d) => d.includes('Drop French')) && turn.work.questions.includes('Undecided: Drop French'));
  ok('open and resolved questions are told apart', turn.work.questions.includes('Is attendance required?') && turn.work.resolved.join().includes('Which textbook? — The blue one'));
  ok('knowledge says where it came from', turn.work.sources.includes('Exam is open-book (source: Handbook)') && turn.work.sources.includes('Variance is unknown (AI-generated)'));
  ok('archived nodes are never included', !JSON.stringify(turn).includes('Archived fact'));
  ok("other conversations' contents are never included", !JSON.stringify(turn).includes('lg_a2'));
  ok('nothing outside the objective and explicit relations (no deep descendants)', !JSON.stringify(turn).includes('Level 3') && !turn.work.questions.includes('Which test?'));
  const san = X.sanitizeObjectiveTurn(turn);
  ok('it satisfies the existing chat endpoint’s objective contract', !!san && san.objective.goal === 'Pass year two' && san.objective.source === 'stated');
  const block = X.objectiveBlock(san);
  ok('…and reads as an objective block', block.includes('Pass year two') && block.includes('Take the evening class'));
  ok('an unplaced conversation has no context', X.contextFor(nodes, rels, 'lg_zz', 1) === null);
  ok("another account's nodes give no context", X.contextFor(nodes.map((n) => ({ ...n })), rels, 'lg_b1', 1) === null);
}

console.log('\n=== conversation helpers ===');
{
  ok('placeholder titles show as untitled', X.displayTitle('New line of thinking') === 'Untitled conversation' && X.displayTitle('  ') === 'Untitled conversation' && X.displayTitle('Taxes') === 'Taxes');
  ok('a title from the first line, cut at a word', X.titleFromMessage('\n  How do I compute the variance of a sample when the population mean is unknown?\nmore') === 'How do I compute the variance of a sample when the…');
  ok('the instruction line is never shown', X.visibleReply('Answer.\n[[REMEMBER]] be brief') === 'Answer.');
  ok('neutral failure text, no server words', /usage limit/.test(X.failureText(402)) && !/Socria|Logos|Core/.test([402, 429, 401, 413, 500].map(X.failureText).join(' ')));
  const row = { id: 'lg_a1', title: 'T', messages: [{ role: 'user', content: 'hi' }], memory: { secret: 1 }, kind: 'logos', map: { nodes: [{ id: 'x' }] }, draft: { doc: 1 }, contexts: [{ id: 'c' }], projectId: 'p_1', updatedAt: 5 };
  const sb = X.saveBody(row, 5, true, 99).conversation;
  ok('a save carries the whole row: map, draft, contexts, project, kind', sb.map.nodes[0].id === 'x' && sb.draft.doc === 1 && sb.contexts[0].id === 'c' && sb.projectId === 'p_1' && sb.kind === 'logos');
  ok('…with its version, and without memory (the server keeps the stored one)', sb.base === 5 && sb.known === true && !('memory' in sb) && sb.updatedAt === 99);
  const held = new Map([['lg_a1', { ...row, title: 'local' }], ['lg_new', { id: 'lg_new', title: 'n', messages: [], updatedAt: 0 }]]);
  const merged = X.mergeConversations(held, [{ ...row, title: 'server' }], new Set(['lg_new']));
  ok('a fresh list replaces held copies, except one being created here', merged.get('lg_a1').title === 'server' && merged.has('lg_new'));
  ok('a new conversation id has the existing format', /^lg_[a-z0-9]+$/.test(X.newConversationId()));
}

console.log('\n=== the relaunch gate treats it as part of the app ===');
{
  ok('/new-logos is an app path', X.pathClass('/new-logos') === 'app' && X.pathClass('/new-logos/n/abc') === 'app');
  ok('with the gate on and no code, it shows the gate page like the rest of the app', X.takeoverDecide('/new-logos', false).do === 'show');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
