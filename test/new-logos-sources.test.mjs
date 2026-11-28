// NEW LOGOS — SOURCES (docs/NEW-LOGOS.md, "Sources"): the canonical record, references, and what a question draws.
//
// What is held down:
//   • one record per file: the same file (by reading or by original) brought in twice is the same source, joined to
//     the new conversation; a file with neither an original nor a reading is refused;
//   • how well a file was read is said from what the reader recorded (read, partly read, scans waiting, nothing);
//   • a reading too large to keep is trimmed visibly (marked unread), never silently;
//   • references tie components to sources without copying them; the same tie twice is one; removing one leaves the
//     source; deleting a source takes its references and nothing else; another account sees and changes nothing;
//   • a question gets the outline and the passages that bear on it — never the whole document — as a reading of the
//     same document the existing chat endpoint accepts;
//   • documents already in conversations are found (existing uploads kept in view); where a source is used is known;
//   • @-mentions find by name; a component's standing on its sources is said in words.

import * as X from './.tmp/new-logos-under-test.mjs';

const { Src: S, SrcOps: O } = X;
let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => (cond ? (pass++, console.log('  ok   ' + name)) : (fail++, console.log('  FAIL ' + name + (extra ? '  ' + String(extra).slice(0, 400) : ''))));

const A = 'user_a', B = 'user_b';
let t = 1_000_000;
const now = () => (t += 1000);
// a real reading, made by the existing reader
const text = [
  '# Business plan',
  '',
  'We sell repair kits to independent cycle shops in the north of England.',
  '',
  '## Market',
  '',
  'There are about 1,200 independent shops; we assume 15% will stock the kit in year one.',
  '',
  '## Pricing',
  '',
  'Each kit sells for £24 wholesale. Gross margin is 58% after freight.',
  '',
  '## Risks',
  '',
  'The main risk is that large chains undercut the price within two years.',
  ...Array.from({ length: 60 }, (_, i) => `\nFiller paragraph ${i} about operations, staffing and the warehouse lease that says nothing about pricing.`),
].join('\n');
const reading = X.sanitizeSourceDoc(X.readPlain('Business plan.md', text, { id: 'abcdef0123456789' }).doc);
const FILE = 'a'.repeat(32);

console.log('\n=== the record ===');
{
  ok('the existing reader makes a reading these tests use', !!reading && reading.blocks.length > 20 && reading.id === 'abcdef0123456789');
  const inp = S.sanitizeSourceInput({ name: ' Business plan.md ', mime: 'text/markdown', size: 4321, fileId: FILE, reading, conversationIds: ['lg_c1', 'lg_c1', 'bad id!'] });
  ok('input checked: name, kind from the file, the reading’s id, conversations cleaned', inp.name === 'Business plan.md' && inp.kind === 'text' && inp.doc_id === reading.id && inp.file_id === FILE && inp.conversation_ids.join() === 'lg_c1');
  ok('a file with neither an original nor a reading is not a source', S.sanitizeSourceInput({ name: 'x.pdf' }) === null && S.sanitizeSourceInput({ name: 'x.pdf', fileId: 'not-hex' }) === null);
  ok('an image is kept as itself', S.sanitizeSourceInput({ name: 'photo.jpg', mime: 'image/jpeg', fileId: FILE }).kind === 'image' && S.statusOf(null, 'image') === 'stored');
  ok('how well it was read, from what the reader recorded', S.statusOf(reading, 'text') === 'ready' && S.statusOf({ ...reading, unread: { from: 5, to: 9 } }, 'document') === 'partial' && S.statusOf({ ...reading, pages: [{ ...reading.pages[0], ocr: 'needed' }] }, 'document') === 'scanned' && S.statusOf({ ...reading, blocks: [] }, 'document') === 'failed');
  ok('…and in words', S.statusLabel({ status: 'partial', pages: 9, format: 'pdf' }, { unread: { from: 5, to: 9 } }) === 'Partly read · pages 5–9 not read' && S.statusLabel({ status: 'ready', pages: 1, format: 'pptx' }) === 'Read · 1 slide');
  const big = { ...reading, blocks: Array.from({ length: 4000 }, (_, i) => ({ id: `p${1 + Math.floor(i / 100)}.${i % 100}`, page: 1 + Math.floor(i / 100), kind: 'paragraph', text: 'x'.repeat(800), method: 'text' })), pageCount: 40, pages: Array.from({ length: 40 }, (_, i) => ({ n: i + 1, method: 'text', chars: 80000, images: 0, ocr: 'none' })) };
  const fitted = S.fitReading(big);
  ok('a reading too large to keep is trimmed, and the rest said to be unread', JSON.stringify(fitted).length <= S.SOURCE_LIMITS.readingChars && fitted.unread && fitted.unread.to === 40 && fitted.blocks.length < big.blocks.length);
}

console.log('\n=== one record per file ===');
const store = X.memorySourceStore({ nodes: [{ id: 'n_q1', user_id: A }, { id: 'n_k1', user_id: A }, { id: 'n_b1', user_id: B }], canvases: [{ user_id: A, key: 'o:n_obj', layout: { items: { 's:PLACEHOLDER': { x: 1, y: 2 } } } }] });
let src;
{
  const r1 = await O.createSource(store, A, { name: 'Business plan.md', mime: 'text/markdown', size: 4321, fileId: FILE, reading, conversationIds: ['lg_c1'] }, now());
  src = r1.value.source;
  ok('a file is brought in once, with its reading kept on the record', r1.ok && !r1.value.existing && src.status === 'ready' && src.doc_id === reading.id && !!(await store.source(A, src.id)).reading);
  const r2 = await O.createSource(store, A, { name: 'Copy of plan.md', fileId: FILE, reading, conversationIds: ['lg_c2'] }, now());
  ok('the same file again is the same source, now also in that conversation', r2.ok && r2.value.existing && r2.value.source.id === src.id && (await store.sources(A)).length === 1 && (await store.source(A, src.id)).conversation_ids.join() === 'lg_c1,lg_c2');
  const r3 = await O.createSource(store, A, { name: 'plan (original only).md', fileId: FILE }, now());
  ok('…found by its original too', r3.ok && r3.value.existing && r3.value.source.id === src.id);
  const theirs = await O.createSource(store, B, { name: 'Business plan.md', fileId: FILE, reading }, now());
  ok('another account’s copy is its own record', theirs.ok && !theirs.value.existing && theirs.value.source.id !== src.id);
  const ren = await O.renameSource(store, A, src.id, '  Plan, final  ', now());
  ok('a source is renamed', ren.ok && ren.value.name === 'Plan, final' && !(await O.renameSource(store, A, src.id, '   ', now())).ok);
  ok('another account cannot rename it', (await O.renameSource(store, B, src.id, 'Mine now', now())).error?.code === 'not_found');
}

console.log('\n=== references ===');
{
  const r1 = await O.addRef(store, A, { sourceId: src.id, nodeId: 'n_q1', passage: 'p1.5', quote: 'we assume 15% will stock the kit', ground: 'verbatim' }, now());
  const r2 = await O.addRef(store, A, { sourceId: src.id, nodeId: 'n_k1', origin: 'ai', ground: 'interpretation' }, now());
  ok('two components refer to one source, without copying it', r1.ok && r2.ok && (await store.sources(A)).length === 2 - 1 && (await store.refs(A)).length === 2);
  const again = await O.addRef(store, A, { sourceId: src.id, nodeId: 'n_q1', passage: 'p1.5' }, now());
  ok('the same reference twice is the one already there', again.ok && again.value.id === r1.value.id && (await store.refs(A)).length === 2);
  ok('a reference needs a real component and a real source of this account', (await O.addRef(store, A, { sourceId: src.id, nodeId: 'n_none' }, now())).error?.code === 'not_found' && (await O.addRef(store, A, { sourceId: 's_doesnotexist00', nodeId: 'n_q1' }, now())).error?.code === 'not_found' && (await O.addRef(store, B, { sourceId: src.id, nodeId: 'n_b1' }, now())).error?.code === 'not_found');
  ok('a malformed passage is dropped, not trusted', (await O.addRef(store, A, { sourceId: src.id, nodeId: 'n_k1', passage: '<script>' }, now())).value.passage === null);
  const rm = await O.removeRef(store, A, r2.value.id);
  ok('removing a reference leaves the source and the other references', rm.ok && !!(await store.source(A, src.id)) && (await store.refs(A)).some((r) => r.id === r1.value.id));
  ok('another account cannot remove a reference', (await O.removeRef(store, B, r1.value.id)).error?.code === 'not_found');
  store.canvases.push({ user_id: A, key: 'c:lg_c1', layout: { items: { [`s:${src.id}`]: { x: 0, y: 0 }, 'x:m1': { x: 1, y: 1 } } } });
  ok('the canvases a source is placed on are known (from the layouts, as references)', (await store.placements(A))[src.id]?.join() === 'c:lg_c1');
}

console.log('\n=== what a question draws from a source ===');
{
  const r = await O.passagesFor(store, A, { ids: [src.id], query: 'What price and margin does the plan assume?' });
  const d = r.value.docs[0];
  ok('the passages that bear on the question, and the outline', r.ok && d.blocks.some((b) => /£24 wholesale/.test(b.text)) && d.blocks.some((b) => b.kind === 'heading' && /Pricing/.test(b.text)));
  ok('…never the whole document', d.blocks.length < reading.blocks.length / 3 && d.blocks.reduce((n, b) => n + b.text.length, 0) <= S.SOURCE_LIMITS.passageChars + 400);
  ok('…as a reading of the same document the existing chat endpoint accepts', d.id === reading.id && !!X.sanitizeSourceDoc(d) && X.sanitizeSourceDoc(d).blocks.length === d.blocks.length);
  const byDoc = await O.passagesFor(store, A, { docIds: [reading.id], query: 'risks' });
  ok('a source is also found by its reading’s id (a document attached in a conversation)', byDoc.value.docs[0]?.blocks.some((b) => /undercut/.test(b.text)));
  const opening = S.readingForQuestion(reading, '');
  ok('with no question, the opening', opening.blocks.some((b) => /repair kits/.test(b.text)));
  ok('another account’s sources give nothing', (await O.passagesFor(store, B, { ids: [src.id], query: 'price' })).value.docs.every((x) => x.id !== reading.id || false) && (await O.passagesFor(store, B, { ids: [src.id], query: 'price' })).value.sources.every((s) => s.id !== src.id));
}

console.log('\n=== deleting a source ===');
{
  const del = await O.deleteSource(store, A, src.id);
  ok('deleting a source removes it and its references, and says what original it had', del.ok && del.value.file_id === FILE && del.value.references === 1 && !(await store.source(A, src.id)) && (await store.refs(A)).length === 0);
  ok('another account’s copy is untouched', (await store.sources(B)).length === 1);
  ok('another account cannot delete', (await O.deleteSource(store, B, (await store.sources(A))[0]?.id ?? 'x')).error?.code === 'not_found');
}

console.log('\n=== what is in the workspace already ===');
{
  const convs = [
    { id: 'lg_c1', messages: [{ role: 'user', content: 'Read this', attachments: [{ kind: 'doc', doc: reading.id, name: 'Business plan.md', file: FILE, pages: 1, format: 'md', text: 'We sell repair kits' }] }] },
    { id: 'lg_c2', messages: [{ role: 'user', content: 'Again', attachments: [{ kind: 'doc', doc: reading.id, name: 'Business plan.md' }, { kind: 'image', name: 'x.png' }] }] },
  ];
  const docs = S.conversationDocs(convs);
  ok('documents already brought into conversations are found, each once, with every conversation', docs.length === 1 && docs[0].conversation_ids.join() === 'lg_c1,lg_c2' && docs[0].file_id === FILE && docs[0].text.startsWith('We sell'));
  const uses = S.usesOf({ id: 's_x1234567890', doc_id: reading.id, conversation_ids: [] }, [{ source_id: 's_x1234567890', node_id: 'n_q1' }], [{ id: 'n_q1', archived_at: null }, { id: 'n_k1', archived_at: null }], convs, { s_x1234567890: ['o:n_obj'] });
  ok('where a source is used: components, conversations, canvases', uses.nodes.length === 1 && uses.conversations.join() === 'lg_c1,lg_c2' && uses.canvases.join() === 'o:n_obj');
  ok('citation keys in a reply are read', JSON.stringify(S.citationsIn('Margin is 58% [A1.7], see [B2.3] and [A1.7] again.')) === JSON.stringify([{ letter: 'A', block: 'p1.7' }, { letter: 'B', block: 'p2.3' }]));
  ok('kept words lose their citation keys, and nothing else', S.withoutCitations('Kits sell at £24 wholesale [A1.4], leaving room [A1.4][B2.1].\nA [note] stays.') === 'Kits sell at £24 wholesale, leaving room.\nA [note] stays.');
}

console.log('\n=== mentions and standing ===');
{
  const items = [
    { kind: 'source', id: 's1', label: 'Business Plan.pdf', hint: 'Source' },
    { kind: 'knowledge', id: 'n1', label: 'Margins in cycle retail', hint: 'Knowledge' },
    { kind: 'question', id: 'n2', label: 'Will chains undercut us?', hint: 'Question' },
    { kind: 'artifact', id: 'n3', label: 'Pricing model', hint: 'Artifact' },
  ];
  ok('@ finds by the start of a name first, then a word, then anywhere', S.matchMentions(items, 'bus').map((m) => m.id).join() === 's1' && S.matchMentions(items, 'pri').map((m) => m.id).join() === 'n3' && S.matchMentions(items, 'chain').map((m) => m.id).join() === 'n2' && S.matchMentions(items, '').length === 4);
  ok('a component’s standing on its sources, in words', S.standingOf({ provenance: { origin: 'ai' } }, []) === 'AI-generated, no source cited' && S.standingOf({ provenance: { origin: 'ai' } }, [{ source_id: 's1', ground: 'interpretation' }]) === 'AI interpretation of 1 source' && S.standingOf({ provenance: { origin: 'human' } }, [{ source_id: 's1', ground: 'verbatim' }, { source_id: 's2', ground: null }]) === 'Quoted from 2 sources');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
