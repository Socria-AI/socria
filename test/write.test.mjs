// THE DRAFT SPACE AND THE WRITING SPACE — the document underneath them.
//
// What is held down (lib/write/*):
//   • one document: blocks of the person's prose and the cards of their
//     Draft Space, saved together; every operation returns a new document and
//     none of them can change a word the person did not ask to change;
//   • what comes in — a paste from Word or Google Docs, Markdown, plain text,
//     a .docx written by Word, pandoc or LibreOffice, the old Draft Space's
//     HTML — keeps every word, and its headings, lists and emphasis;
//   • what goes out — HTML, Markdown, text and a real .docx — is the same
//     words with the same shape, and the .docx reads back, here and through
//     the reader every attachment goes through, as what was written;
//   • citations are only ever passages the person chose, numbered in order;
//   • the proofreading rules find what they claim to find and keep quiet on
//     the cases that look like errors and are not ("had had", "would, of
//     course", "an hour", "Plan A is", "e.g. we", a URL, a quotation);
//   • a dismissed finding stays dismissed across edits to the rest;
//   • the board's reading names claims with nothing behind them, evidence
//     that supports nothing, an objection left unanswered and two cards saying
//     the same thing — and turning it into an outline only ever adds.

import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import * as W from './.tmp/write-under-test.mjs';
import * as T from './.tmp/docs-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (p) => new Uint8Array(readFileSync(join(root, 'test/fixtures/write', p)));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = (v) => JSON.stringify(v);

const P = (text, extra = {}) => ({ id: extra.id ?? W.uid('b'), t: extra.t ?? 'p', text, ...extra });
const docOf = (blocks, extra = {}) => ({ ...W.emptyDoc(1), blocks, ...extra });

console.log('=== the model: marks travel with the words ===');
{
  const b = P('Rents rise fast', { id: 'b1', marks: [{ s: 0, e: 5, t: 'b' }, { s: 11, e: 15, t: 'i' }] });
  const s1 = W.spliceBlock(b, 6, 10, 'climb');
  ok('a replacement keeps the words around it', s1.text === 'Rents climb fast', s1.text);
  ok('  a mark before it is untouched, one after moves with the text', J(s1.marks) === J([{ s: 0, e: 5, t: 'b' }, { s: 12, e: 16, t: 'i' }]), J(s1.marks));
  const s2 = W.spliceBlock(b, 0, 5, 'Prices');
  ok('  a mark that covered the replaced words covers what replaced them', J(s2.marks?.[0]) === J({ s: 0, e: 6, t: 'b' }), J(s2.marks));
  const on = W.toggleMark(P('one two three', { id: 'x' }), 4, 7, 'b');
  ok('a mark toggled on', J(on.marks) === J([{ s: 4, e: 7, t: 'b' }]));
  const off = W.toggleMark(on, 4, 7, 'b');
  ok('  and off again, leaving no empty marks', off.marks === undefined, J(off.marks));
  const part = W.toggleMark(W.toggleMark(P('abcdefgh', { id: 'y' }), 0, 8, 'i'), 2, 4, 'i');
  ok('  off in the middle of a longer mark splits it', J(part.marks) === J([{ s: 0, e: 2, t: 'i' }, { s: 4, e: 8, t: 'i' }]), J(part.marks));
  ok('marks are normalised: clipped, joined, ordered', J(W.normalizeMarks([{ s: 5, e: 99, t: 'b' }, { s: 0, e: 6, t: 'b' }, { s: 3, e: 3, t: 'i' }], 10)) === J([{ s: 0, e: 10, t: 'b' }]));
}

console.log('\n=== the model: Enter, Backspace, Delete, as a word processor does them ===');
{
  let d = docOf([P('Title words', { id: 'h', t: 'h1' }), P('first second', { id: 'p', marks: [{ s: 0, e: 5, t: 'b' }] })]);
  const sp = W.splitBlock(d, 'p', 6);
  ok('Enter splits a paragraph where the caret is', sp.doc.blocks.map((b) => b.text).join('|') === 'Title words|first |second', sp.doc.blocks.map((b) => b.text).join('|'));
  ok('  the caret goes to the start of the new block', sp.caret.offset === 0 && sp.caret.block === sp.doc.blocks[2].id);
  ok('  marks stay with their words', J(sp.doc.blocks[1].marks) === J([{ s: 0, e: 5, t: 'b' }]) && sp.doc.blocks[2].marks === undefined);
  const sh = W.splitBlock(d, 'h', 11);
  ok('what follows a heading is a paragraph', sh.doc.blocks[1].t === 'p' && sh.doc.blocks[0].t === 'h1');
  const s0 = W.splitBlock(d, 'p', 0);
  ok('Enter at the start opens a line above and keeps the caret with the words', s0.doc.blocks[1].text === '' && s0.doc.blocks[2].id === 'p' && s0.caret.block === 'p');
  const li = docOf([P('', { id: 'l', t: 'ul', lvl: 1 })]);
  ok('Enter in an empty list item leaves the list', W.splitBlock(li, 'l', 0).doc.blocks[0].t === 'p');

  d = docOf([P('one', { id: 'a' }), P('two', { id: 'b', t: 'ul', lvl: 2, marks: [{ s: 0, e: 3, t: 'i' }] })]);
  let r = W.mergeBack(d, 'b');
  ok('Backspace at the start of a nested item: one level out', r.doc.blocks[1].t === 'ul' && r.doc.blocks[1].lvl === 1);
  r = W.mergeBack(r.doc, 'b');
  ok('  then a paragraph', r.doc.blocks[1].t === 'p' && r.doc.blocks[1].lvl === undefined);
  r = W.mergeBack(r.doc, 'b');
  ok('  then it joins the one above, its marks moved along', r.doc.blocks.length === 1 && r.doc.blocks[0].text === 'onetwo' && J(r.doc.blocks[0].marks) === J([{ s: 3, e: 6, t: 'i' }]), J(r.doc.blocks));
  ok('  the caret lands where they met', r.caret.block === 'a' && r.caret.offset === 3);
  const f = W.mergeForward(docOf([P('ab', { id: 'a' }), P('cd', { id: 'c', cites: [{ id: 'c1', doc: 'D', block: 'p1.1', label: 'Lecture, p. 1' }] })]), 'a');
  ok('Delete at the end pulls the next block up, citations with it', f.doc.blocks[0].text === 'abcd' && f.doc.blocks[0].cites?.length === 1);
  const blank = W.mergeBack(docOf([P('', { id: 'e' }), P('Heading', { id: 'h', t: 'h2' })]), 'h');
  ok('Backspace on a heading turns it into a paragraph first (one press, one change)', blank.doc.blocks[1].t === 'p');
  const del = W.mergeForward(docOf([P('', { id: 'e' }), P('Heading', { id: 'h', t: 'h2' })]), 'e');
  ok('deleting a blank line above a heading keeps the heading a heading', del.doc.blocks.length === 1 && del.doc.blocks[0].t === 'h2' && del.doc.blocks[0].text === 'Heading');
}

console.log('\n=== the model: ranges, pastes, moves ===');
{
  const d = docOf([P('Alpha beta', { id: 'a' }), P('gamma', { id: 'g' }), P('delta epsilon', { id: 'd', marks: [{ s: 6, e: 13, t: 'b' }] })]);
  const r = W.replaceRange(d, { block: 'd', offset: 6 }, { block: 'a', offset: 6 }, 'X ');
  ok('a selection across blocks is replaced as one, whichever way it was made', r.doc.blocks.length === 1 && r.doc.blocks[0].text === 'Alpha X epsilon', r.doc.blocks.map((b) => b.text).join('|'));
  ok('  the tail keeps its emphasis', J(r.doc.blocks[0].marks) === J([{ s: 8, e: 15, t: 'b' }]), J(r.doc.blocks[0].marks));
  ok('  the caret after what was typed', r.caret.offset === 8);
  const paste = W.insertAt(docOf([P('Start end', { id: 's' })]), { block: 's', offset: 6 }, [P('one', { id: 'n1' }), P('Middle', { id: 'n2', t: 'h2' }), P('two ', { id: 'n3' })]);
  ok('a paste of several blocks splits the block it lands in', paste.doc.blocks.map((b) => `${b.t}:${b.text}`).join('|') === 'p:Start one|h2:Middle|p:two end', paste.doc.blocks.map((b) => `${b.t}:${b.text}`).join('|'));
  ok('  and the caret is after the pasted words', paste.caret.offset === 4);
  const one = W.insertAt(docOf([P('', { id: 'e' })]), { block: 'e', offset: 0 }, [P('A heading', { t: 'h1' })]);
  ok('a single pasted heading into an empty line is a heading', one.doc.blocks[0].t === 'h1');
  const m = docOf(['a', 'b', 'c', 'd'].map((t) => P(t, { id: t })));
  ok('moving blocks down', W.moveBlocks(m, ['a'], 3).blocks.map((b) => b.id).join('') === 'bcad');
  ok('moving blocks to the end', W.moveBlocks(m, ['a', 'b'], 4).blocks.map((b) => b.id).join('') === 'cdab');
  ok('nudging up and down', W.nudgeBlock(m, 'c', -1).blocks.map((b) => b.id).join('') === 'acbd' && W.nudgeBlock(m, 'c', 1).blocks.map((b) => b.id).join('') === 'abdc');
  ok('  nudging past an end changes nothing', W.nudgeBlock(m, 'a', -1) === m && W.nudgeBlock(m, 'd', 1) === m);
  const j = W.joinIntoParagraph(docOf([P('rent too high', { id: 'x', t: 'ul', lvl: 1 }), P('people move out', { id: 'y', t: 'ul', lvl: 2, marks: [{ s: 0, e: 6, t: 'b' }] })]), ['x', 'y']);
  ok('outline items joined into one paragraph, their words in order', j.blocks.length === 1 && j.blocks[0].t === 'p' && j.blocks[0].text === 'rent too high. people move out', j.blocks[0].text);
  ok('  emphasis moved with its words', J(j.blocks[0].marks) === J([{ s: 15, e: 21, t: 'b' }]), J(j.blocks[0].marks));
  ok('a document is never left with no block', W.removeBlocks(docOf([P('x', { id: 'x' })]), ['x']).blocks.length === 1);
}

console.log('\n=== the Draft Space: cards and piles ===');
{
  ok('a card guesses its kind from its words — a question', W.guessKind('Does rent control help?') === 'question');
  ok('  an objection', W.guessKind('But landlords would stop building') === 'counter');
  ok('  evidence', W.guessKind('Vacancy fell 12% last year') === 'evidence');
  ok('  an example', W.guessKind('For example, Berlin froze rents') === 'example');
  ok('  a conclusion', W.guessKind('So the city should build more') === 'conclusion');
  ok('  and when nothing in the words says, an idea', W.guessKind('housing near transit') === 'idea');
  let d = W.emptyDoc(1);
  const g1 = W.addGroup(d, 'Why rents rise');
  d = g1.doc;
  const a = W.addCard(d, 'Rents rise when supply lags', { kind: 'claim', group: g1.group.id });
  d = a.doc;
  const b = W.addCard(d, 'Vacancy fell 12%', { group: g1.group.id, links: [{ k: 'doc', doc: 'D1', id: 'p2.4', label: 'Housing report, p. 2' }] });
  d = b.doc;
  const c = W.addCard(d, 'loose thought');
  d = c.doc;
  ok('cards land in their pile, in order', W.cardsIn(d, g1.group.id).map((x) => x.id).join() === [a.card.id, b.card.id].join() && W.cardsIn(d, null)[0].id === c.card.id);
  d = W.moveCard(d, c.card.id, g1.group.id, 0);
  ok('a card moved to the top of a pile', W.cardsIn(d, g1.group.id)[0].id === c.card.id);
  d = W.moveCard(d, c.card.id, null, 0);
  ok('  and back to the loose pile', W.cardsIn(d, null).length === 1);
  const withBlock = W.insertBlocks(d, null, [P('from b', { id: 'fb', from: [b.card.id] })]);
  const merged = W.mergeCards(withBlock, [a.card.id, b.card.id]);
  ok('two cards merged: their words joined, in order', merged.card?.text === 'Rents rise when supply lags Vacancy fell 12%');
  ok('  every link kept', merged.card?.links?.length === 1 && merged.card.links[0].id === 'p2.4');
  ok('  and a block that grew from the merged card now points at the one left', merged.doc.blocks[0].from?.[0] === a.card.id);
  const grouped = W.groupCards(d, [c.card.id], 'New pile');
  ok('selected cards gathered into a new pile', grouped.group && W.cardsIn(grouped.doc, grouped.group.id).length === 1);
  const gone = W.removeGroup(d, g1.group.id);
  ok('a pile taken away sends its cards back to the loose pile — nothing lost', gone.cards.length === d.cards.length && gone.cards.every((x) => x.group === null));
  const linked = W.linkCard(d, c.card.id, { k: 'card', id: a.card.id, label: 'Rents rise' });
  const removed = W.removeCards(linked, [a.card.id]);
  ok('removing a card removes the links other cards had to it', !removed.cards.find((x) => x.id === c.card.id).links);
}

console.log('\n=== versions: nothing is lost to an edit ===');
{
  let d = docOf([P('First draft of the opening paragraph.', { id: 'a' })], { title: 'Essay' });
  d = W.keepVersion(d, 'manual', 1000, 'Before the rewrite');
  ok('a version kept, named', d.versions.length === 1 && d.versions[0].name === 'Before the rewrite');
  ok('  the same writing again is not kept twice', W.keepVersion(d, 'auto', 2000).versions.length === 1);
  d = W.replaceBlock(d, { ...d.blocks[0], text: 'A rewritten opening.' });
  const restored = W.restoreVersion(d, d.versions[0].id, 3000);
  ok('a restore brings the old words back', restored.blocks[0].text === 'First draft of the opening paragraph.');
  ok('  and keeps what was there first', restored.versions[0].blocks[0].text === 'A rewritten opening.' && restored.versions[0].why === 'restore');
  ok('due for an automatic version only when the writing moved on and time passed', !W.dueForVersion(d, 1000 + 60_000) && W.dueForVersion(d, 1000 + 11 * 60_000));
  let many = docOf([P('x', { id: 'a' })]);
  for (let k = 0; k < 30; k++) many = W.keepVersion(W.replaceBlock(many, { ...many.blocks[0], text: `version ${k} ${'words '.repeat(5)}` }), 'auto', k * 1000);
  ok('versions are bounded', many.versions.length === W.MAX_VERSIONS, many.versions.length);
  ok('  the newest kept', many.versions[0].blocks[0].text.startsWith('version 29'));
}

console.log('\n=== storage: checked and bounded, never reworded ===');
{
  ok('anything but a document is refused', W.sanitizeWriteDoc(null) === null && W.sanitizeWriteDoc({ v: 1, blocks: [] }) === null && W.sanitizeWriteDoc('x') === null);
  const raw = {
    v: 2,
    title: 'T\u0007itle',
    blocks: [
      { id: 'b1', t: 'h9', text: '  spaced  words \u0000kept\n second line  ', marks: [{ s: 0, e: 999, t: 'b' }, { s: 1, e: 2, t: 'strike' }] },
      { id: 'b1', t: 'ul', lvl: 7, text: 'dup id', cites: [{ doc: 'D', block: 'p1.1', label: 'L' }, { doc: '', block: 'x' }] },
      { id: '<script>', t: 'p', text: 42 },
    ],
    cards: [{ id: 'k1', kind: 'nonsense', text: 'card', group: 'missing', links: [{ k: 'doc', id: 'p1', label: 'no doc' }, { k: 'node', id: 'n1', label: 'Node' }] }],
    groups: [{ id: 'g1', title: 'Pile' }],
    dismissed: ['spelling:abc', 'bad sig!', 7],
    versions: [{ id: 'v1', at: 5, why: 'weird', title: 'old', blocks: [{ id: 'z', t: 'p', text: 'old words' }] }],
    face: 'both',
    updatedAt: 9,
  };
  const s = W.sanitizeWriteDoc(raw);
  ok('the person’s spacing is kept exactly; only control characters go', s.blocks[0].text === '  spaced  words kept\n second line  ', J(s.blocks[0].text));
  ok('  an unknown block type is a paragraph, an unknown mark is dropped, marks are clipped', s.blocks[0].t === 'p' && J(s.blocks[0].marks) === J([{ s: 0, e: s.blocks[0].text.length, t: 'b' }]));
  ok('  a duplicate id is renewed; a list depth bounded', s.blocks[1].id !== 'b1' && s.blocks[1].lvl === 3);
  ok('  a citation with no document is dropped', s.blocks[1].cites.length === 1);
  ok('  a bad id is replaced and a non-text text is empty', s.blocks[2].id !== '<script>' && s.blocks[2].text === '');
  ok('  a card in a pile that does not exist is loose; an unknown kind is an idea', s.cards[0].group === null && s.cards[0].kind === 'idea');
  ok('  a passage link with no document is dropped; a node link kept', s.cards[0].links.length === 1 && s.cards[0].links[0].k === 'node');
  ok('  only well-formed dismissals are kept', J(s.dismissed) === J(['spelling:abc']));
  ok('  versions and the face survive', s.versions[0].blocks[0].text === 'old words' && s.versions[0].why === 'auto' && s.face === 'both');
  const huge = { v: 2, title: '', blocks: Array.from({ length: 20 }, (_, k) => ({ id: `b${k}`, t: 'p', text: 'x'.repeat(30_000) })) };
  const bounded = W.sanitizeWriteDoc(huge);
  ok('the document is bounded as a whole', bounded.blocks.reduce((n, b) => n + b.text.length, 0) <= W.MAX_DOC_CHARS);
  ok('a document near the bound says so', W.nearLimit(bounded) && !W.nearLimit(docOf([P('short')])));
  const stored = W.sanitizeStoredDraft({ title: 'x', html: '<p>x</p>', doc: raw });
  ok('the stored draft keeps its title, html and document', stored.title === 'x' && stored.html === '<p>x</p>' && stored.doc.v === 2);
  ok('  an old draft, with no document, is still a draft', W.sanitizeStoredDraft({ title: 't', html: '<p>old</p>' }).doc === undefined);
}

console.log('\n=== out: HTML, Markdown, text ===');
{
  const d = docOf(
    [
      P('Why rents rise', { t: 'h1' }),
      P('Rents rise when demand outpaces supply.', { marks: [{ s: 16, e: 22, t: 'b' }, { s: 32, e: 38, t: 'i' }], cites: [{ id: 'c1', doc: 'D1', block: 'p2.4', label: 'Housing report, p. 2', quote: 'Vacancy fell to 2%.' }] }),
      P('Vacancy fell', { t: 'ul', lvl: 1 }),
      P('permits were down', { t: 'ul', lvl: 2 }),
      P('completions lagged', { t: 'ul', lvl: 2 }),
      P('Building slowed', { t: 'ul', lvl: 1 }),
      P('First', { t: 'ol', lvl: 1 }),
      P('Second', { t: 'ol', lvl: 1 }),
      P('A city that cannot house its workers will not keep them.', { t: 'quote', cites: [{ id: 'c2', doc: 'D1', block: 'p2.4', label: 'Housing report, p. 2' }] }),
      P('Line one\nline two, with <tags> & ampersands; 1. not a list'),
    ],
    { title: 'Rent & the City' }
  );
  const html = W.toHtml(d);
  ok('HTML: nested lists are real nested lists', html.includes('<ul><li>Vacancy fell<ul><li>permits were down</li><li>completions lagged</li></ul></li><li>Building slowed</li></ul><ol><li>First</li><li>Second</li></ol>'), html);
  ok('  emphasis as tags, words escaped, line breaks kept', html.includes('<strong>demand</strong>') && html.includes('<em>supply</em>') && html.includes('&lt;tags&gt; &amp; ampersands') && html.includes('Line one<br>line two'));
  ok('  one passage cited twice is one source, the same number', (html.match(/\[1\]/g) || []).length === 2 && !html.includes('[2]'));
  const page = W.toHtml(d, { standalone: true });
  ok('  the whole page has the title and a Sources list from the passage as read', page.includes('<title>Rent &amp; the City</title>') && page.includes('<h1 class="title">Rent &amp; the City</h1>') && page.includes('Housing report, p. 2 — <q>Vacancy fell to 2%.</q>'));
  const md = W.toMarkdown(d);
  ok('Markdown: title, heading, emphasis, footnote', md.startsWith('# Rent & the City\n\n# Why rents rise\n\nRents rise when **demand** outpaces *supply*.[^1]'), md.slice(0, 200));
  ok('  lists nested and numbered', md.includes('- Vacancy fell\n   - permits were down\n   - completions lagged\n- Building slowed\n1. First\n2. Second'), md);
  ok('  quotes quoted; words that look like syntax escaped', md.includes('> A city that cannot house') && md.includes('\\<tags\\>') && md.includes('[^1]: Housing report, p. 2'));
  ok('  a paragraph starting “1.” stays a paragraph', W.toMarkdown(docOf([P('1. not a list')])).trim() === '1\\. not a list');
  const back = W.markdownToBlocks(md.replace(/\[\^1\]/g, ''));
  ok('  and Markdown read back gives the same shape', back.map((b) => b.t).join(',') === 'h1,h1,p,ul,ul,ul,ul,ol,ol,quote,p,p' || back.map((b) => b.t).join(',').startsWith('h1,h1,p,ul,ul,ul,ul,ol,ol,quote'), back.map((b) => b.t).join(','));
  const txt = W.toText(d);
  ok('text: bullets, numbers, indented quote, numbered citations and Sources', txt.includes('• Vacancy fell\n  • permits were down') && txt.includes('1. First\n2. Second') && txt.includes('    A city that') && txt.includes('[1] Housing report, p. 2'), txt);
  ok('a file name from the title, safe everywhere', W.fileNameFor('Rent: the City / 2026?', 'docx') === 'Rent the City 2026.docx' && W.fileNameFor('', 'md') === 'Untitled.md');
}

console.log('\n=== in: pastes from Word, Google Docs, the web ===');
{
  const gdocs = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h2 dir="ltr"><span style="font-size:16pt;font-weight:700">Heading from Docs</span></h2><p dir="ltr"><span style="font-weight:400">Plain then </span><span style="font-weight:700">bold</span><span style="font-weight:400"> and </span><span style="font-style:italic">italic</span></p><ul><li dir="ltr"><p dir="ltr"><span>Item one</span></p></li><li><p><span>Item two</span></p></li></ul></b>';
  const g = W.htmlToBlocks(gdocs);
  ok('Google Docs: the bold wrapper that is not bold is not bold', g[1].text === 'Plain then bold and italic' && J(g[1].marks) === J([{ s: 11, e: 15, t: 'b' }, { s: 20, e: 26, t: 'i' }]), J(g));
  ok('  headings and list items, a paragraph inside an item continuing it', g[0].t === 'h2' && g[2].t === 'ul' && g[2].text === 'Item one' && g[3].text === 'Item two' && g.length === 4, J(g.map((b) => [b.t, b.text])));
  const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style><!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]--></head><body>
<p class=MsoTitle>Essay title</p>
<p class=MsoNormal>Normal <b>bold</b> text<o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>Bullet one<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='mso-list:l0 level2 lfo1'><![if !supportLists]>o&nbsp;&nbsp;<![endif]>Bullet nested<o:p></o:p></p>
<p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><![if !supportLists]>1.<span>&nbsp;&nbsp;</span><![endif]>Numbered one<o:p></o:p></p>
<p class=MsoQuote>A quoted line &ndash; with a dash</p>
</body></html>`;
  const w = W.htmlToBlocks(word);
  ok('Word: its bookkeeping, styles and drawn bullets left out', !w.some((b) => /OfficeDocumentSettings|Symbol|·|mso/.test(b.text)), J(w));
  ok('  title, emphasis, bullets, nesting, numbers and quote read from its styles', J(w.map((b) => [b.t, b.lvl ?? 0, b.text])) === J([['h1', 0, 'Essay title'], ['p', 0, 'Normal bold text'], ['ul', 1, 'Bullet one'], ['ul', 2, 'Bullet nested'], ['ol', 1, 'Numbered one'], ['quote', 0, 'A quoted line – with a dash']]), J(w.map((b) => [b.t, b.lvl ?? 0, b.text])));
  ok('  bold kept', J(w[1].marks) === J([{ s: 7, e: 11, t: 'b' }]));
  const web = W.htmlToBlocks('<article><h1>Title</h1><p>One&nbsp;two &amp; <a href="x">three</a><br>four</p><script>alert(1)</script><table><tr><td>a</td><td>b</td></tr></table><img src=x alt=pic></article>');
  ok('the web: scripts never come in; a link keeps its words; a table row is a line of cells', J(web.map((b) => b.text)) === J(['Title', 'One two & three\nfour', 'a\tb']), J(web.map((b) => b.text)));
  const legacy = W.fromLegacy('My draft', '<h2>Big idea</h2><div>First line<br></div><div><br></div><blockquote>Someone said this</blockquote><h3>Smaller</h3><p>Last <b>bit</b></p>');
  ok('the old Draft Space: every word kept, in its shape', J(legacy.blocks.map((b) => [b.t, b.text])) === J([['h2', 'Big idea'], ['p', 'First line'], ['quote', 'Someone said this'], ['h3', 'Smaller'], ['p', 'Last bit']]), J(legacy.blocks.map((b) => [b.t, b.text])));
  ok('  with its title', legacy.title === 'My draft');
  const old = W.normalizeDraft({ title: 'Old', html: '<p>Kept words</p>' });
  ok('an old stored draft opens as a document, its html kept beside it until the next save', old.doc.blocks[0].text === 'Kept words' && old.html === '<p>Kept words</p>');
  const fresh = W.storedFrom(old.doc);
  ok('  and a save writes both, the html from the document', fresh.html === '<p>Kept words</p>' && fresh.doc === old.doc);
  ok('nothing stored is nothing', W.normalizeDraft(undefined) === undefined && W.normalizeDraft({}) === undefined);
}

console.log('\n=== in: plain text and Markdown ===');
{
  const wrapped = 'This is a paragraph that was wrapped by an email program at seventy\ncharacters or so, which means its lines are all much the same\nlength and should be joined back together.\n\nA second paragraph.';
  const tw = W.textToBlocks(wrapped);
  ok('wrapped prose is joined back into paragraphs', tw.length === 2 && !tw[0].text.includes('\n'), J(tw));
  const poem = 'Roses are red\nviolets are blue\n\n12 Main Street\nSpringfield';
  ok('short lines keep their breaks — a poem, an address', W.textToBlocks(poem)[0].text === 'Roses are red\nviolets are blue' && W.textToBlocks(poem)[1].text === '12 Main Street\nSpringfield');
  const lists = W.textToBlocks('Ideas:\n- one\n- two\n  - deeper\n1. first\n2) second\n• dot');
  ok('list markers become lists, with depth', J(lists.map((b) => [b.t, b.lvl ?? 0])) === J([['p', 0], ['ul', 1], ['ul', 1], ['ul', 2], ['ol', 1], ['ol', 1], ['ul', 1]]), J(lists.map((b) => [b.t, b.lvl ?? 0, b.text])));
  ok('in plain text, emphasis characters are just characters', W.textToBlocks('a *b* c')[0].text === 'a *b* c');
  const inl = W.parseInline('Some **bold**, *italic*, _also_, snake_case_name, 2 * 3 * 4, `code`, [a link](https://x.org) and \\*escaped\\*');
  ok('Markdown emphasis read into marks', inl.text === 'Some bold, italic, also, snake_case_name, 2 * 3 * 4, code, a link and *escaped*', inl.text);
  ok('  bold and italics where they were, code in monospace, a link as a link — nothing else', J(inl.marks.map((m) => [m.t, inl.text.slice(m.s, m.e), m.v ?? ''])) === J([['b', 'bold', ''], ['i', 'italic', ''], ['i', 'also', ''], ['font', 'code', 'mono'], ['a', 'a link', 'https://x.org']]), J(inl.marks.map((m) => [m.t, inl.text.slice(m.s, m.e), m.v ?? ''])));
  const md = W.markdownToBlocks('# Title\n\nA para\nthat continues  \nwith a break.\n\n> quoted\n> still quoted\n\n```\ncode block\n```\n\n---\n\n### Deep');
  ok('Markdown blocks: headings, joined lines, hard breaks, quotes, code, a horizontal line', J(md.map((b) => [b.t, b.text])) === J([['h1', 'Title'], ['p', 'A para that continues\nwith a break.'], ['quote', 'quoted still quoted'], ['code', 'code block'], ['hr', ''], ['h3', 'Deep']]), J(md.map((b) => [b.t, b.text])));
  ok('Markdown is recognised when pasted; plain text is not mistaken for it', W.looksLikeMarkdown('# Title\n\ntext') && W.looksLikeMarkdown('Some **bold** here') && !W.looksLikeMarkdown('An ordinary sentence. Another one.'));
}

console.log('\n=== Word out: a real .docx ===');
{
  const d = docOf(
    [
      P('Why rents rise', { t: 'h1' }),
      P('Rents rise when demand outpaces supply.', { marks: [{ s: 16, e: 22, t: 'b' }, { s: 32, e: 38, t: 'i' }, { s: 0, e: 5, t: 'u' }], cites: [{ id: 'c1', doc: 'D1', block: 'p2.4', label: 'Housing report, p. 2' }] }),
      P('What the data says', { t: 'h2' }),
      P('Smaller heading', { t: 'h3' }),
      P('Vacancy fell', { t: 'ul', lvl: 1 }),
      P('permits were down', { t: 'ul', lvl: 2 }),
      P('First', { t: 'ol', lvl: 1 }),
      P('Second', { t: 'ol', lvl: 1 }),
      P('A break here.'),
      P('Again one', { t: 'ol', lvl: 1 }),
      P('A city that cannot house its workers will not keep them.', { t: 'quote' }),
      P('Line one\nline two\twith a tab & <angle>'),
    ],
    { title: 'Rent & the City' }
  );
  const bytes = W.toDocx(d, new Date(Date.UTC(2026, 9, 23, 12, 0, 0)));
  ok('a zip, beginning with its content types', bytes[0] === 0x50 && bytes[1] === 0x4b && new TextDecoder().decode(bytes.subarray(30, 49)) === '[Content_Types].xml');
  const parts = await W.unzipSome(bytes, () => true);
  ok('every part Word needs is there', ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/numbering.xml', 'word/settings.xml', 'docProps/core.xml', 'docProps/app.xml'].every((n) => parts.has(n)));
  const xml = new TextDecoder().decode(parts.get('word/document.xml'));
  ok('  Word’s own styles: Title, Heading 1–3, Quote, List Paragraph', /pStyle w:val="Title"/.test(xml) && /Heading1/.test(xml) && /Heading2/.test(xml) && /Heading3/.test(xml) && /pStyle w:val="Quote"/.test(xml) && /ListParagraph/.test(xml));
  ok('  each numbered list counts from one: two numbered lists, two numberings', (new TextDecoder().decode(parts.get('word/numbering.xml')).match(/<w:num w:numId=/g) || []).length === 3);
  ok('  the citation as a superscript number, and a Sources list', /<w:vertAlign w:val="superscript"\/><\/w:rPr><w:t xml:space="preserve">\[1\]<\/w:t>/.test(xml) && xml.includes('[1] Housing report, p. 2'));
  ok('  text escaped, breaks and tabs as Word writes them', xml.includes('&amp; &lt;angle&gt;') && xml.includes('<w:br/>') && xml.includes('<w:tab/>'));
  const core = new TextDecoder().decode(parts.get('docProps/core.xml'));
  ok('  the title in its properties, dates in W3C form', core.includes('<dc:title>Rent &amp; the City</dc:title>') && core.includes('2026-10-23T12:00:00Z'));
  const back = await W.readDocx(bytes);
  ok('it reads back as what was written: the title', back.title === 'Rent & the City', back.title);
  const shape = back.blocks.filter((b) => !/^Sources$|^\[1\]/.test(b.text)).map((b) => [b.t, b.lvl ?? 0, b.text]);
  ok('  every block, in its shape', J(shape) === J([['h1', 0, 'Why rents rise'], ['p', 0, 'Rents rise when demand outpaces supply.[1]'], ['h2', 0, 'What the data says'], ['h3', 0, 'Smaller heading'], ['ul', 1, 'Vacancy fell'], ['ul', 2, 'permits were down'], ['ol', 1, 'First'], ['ol', 1, 'Second'], ['p', 0, 'A break here.'], ['ol', 1, 'Again one'], ['quote', 0, 'A city that cannot house its workers will not keep them.'], ['p', 0, 'Line one\nline two\twith a tab & <angle>']]), J(shape));
  ok('  with its emphasis — and the citation\'s number still raised', J(back.blocks[1].marks) === J([{ s: 0, e: 5, t: 'u' }, { s: 16, e: 22, t: 'b' }, { s: 32, e: 38, t: 'i' }, { s: 39, e: 42, t: 'sup' }]), J(back.blocks[1].marks));
  const server = await T.readDocument('export.docx', Buffer.from(bytes));
  const kinds = server.doc.blocks.map((b) => `${b.kind}:${b.text}`);
  ok('and the reader every attachment goes through reads it the same way', kinds.includes('title:Rent & the City') && kinds.includes('heading:Why rents rise') && kinds.some((k) => k.startsWith('list:') && k.includes('Vacancy fell')) && kinds.some((k) => k.startsWith('quote:A city')), J(kinds));
  // Office itself, where it is installed: LibreOffice opens it and writes its words back out
  const soffice = spawnSync('soffice', ['--version'], { encoding: 'utf8' });
  if (soffice.status === 0) {
    const dir = mkdtempSync(join(tmpdir(), 'socria-docx-'));
    writeFileSync(join(dir, 'export.docx'), bytes);
    const conv = spawnSync('soffice', ['--headless', '--convert-to', 'txt:Text', '--outdir', dir, join(dir, 'export.docx')], { encoding: 'utf8', timeout: 120_000 });
    const txt = existsSync(join(dir, 'export.txt')) ? readFileSync(join(dir, 'export.txt'), 'utf8') : '';
    ok('LibreOffice opens the .docx and finds every word', conv.status === 0 && txt.includes('Rent & the City') && txt.includes('Rents rise when demand outpaces supply.') && txt.includes('permits were down') && txt.includes('A city that cannot house its workers will not keep them.'), (conv.stderr || '') + txt.slice(0, 400));
    rmSync(dir, { recursive: true, force: true });
  } else console.log('  (LibreOffice is not installed here — the Office check is skipped)');
}

console.log('\n=== Word in: documents written elsewhere ===');
{
  const pd = await W.readDocx(fixture('pandoc.docx'));
  ok('pandoc’s .docx: the title from its Title style', pd.title === 'Rent and the City', pd.title);
  const shape = pd.blocks.map((b) => [b.t, b.lvl ?? 0, b.text]);
  ok('  headings, paragraphs, nested bullets, numbers and the quote', J(shape.slice(0, 10)) === J([['h1', 0, 'Why rents rise'], ['p', 0, 'Rents rise when demand outpaces supply, and the gap is not closing.'], ['h2', 0, 'What the data says'], ['ul', 1, 'Vacancy fell in every borough.'], ['ul', 1, 'New building slowed:'], ['ul', 2, 'permits were down;'], ['ul', 2, 'completions lagged.'], ['ol', 1, 'First, wages stalled.'], ['ol', 1, 'Second, costs climbed.'], ['quote', 0, 'A city that cannot house its workers will not keep them.']]), J(shape));
  const para = pd.blocks[1];
  ok('  bold and italics where the author put them', J(para.marks.map((m) => [m.t, para.text.slice(m.s, m.e)])) === J([['b', 'demand'], ['i', 'supply'], ['b', 'not']]), J(para.marks));
  ok('  a line break inside a paragraph kept', pd.blocks.some((b) => b.text === 'The last paragraph has a line\nbreak inside it, and a table follows.'), J(shape.slice(10)));
  const pt = pd.blocks.find((b) => b.t === 'table');
  ok('  the table came in as a table — its rows and cells as written', !!pt && pt.rows.some((r) => r.map((c) => c.text).join('|') === '2020|1,200') && pt.text.includes('2020\t1,200'), J(pt ?? pd.blocks.map((b) => b.t)));
  const lo = await W.readDocx(fixture('libreoffice.docx'));
  const loShape = lo.blocks.map((b) => [b.t, b.lvl ?? 0, b.text]);
  ok('LibreOffice’s .docx: headings, bullets with nesting, numbers', J(loShape) === J([['h1', 0, 'Housing notes'], ['p', 0, 'A paragraph with bold words, italic words and underlined words.'], ['h2', 0, 'Points'], ['ul', 1, 'One bullet'], ['ul', 1, 'Two bullet'], ['ul', 2, 'Nested bullet'], ['ol', 1, 'Numbered one'], ['ol', 1, 'Numbered two'], ['p', 0, 'Ends here.']]), J(loShape));
  const lp = lo.blocks[1];
  ok('  bold, italic and underline', J(lp.marks.map((m) => [m.t, lp.text.slice(m.s, m.e)])) === J([['b', 'bold words'], ['i', 'italic words'], ['u', 'underlined words']]), J(lp.marks));
  let threw = '';
  try {
    await W.readDocx(new TextEncoder().encode('not a zip at all'));
  } catch (e) {
    threw = e.message;
  }
  ok('a file that is not a Word document says so, plainly', /not a Word document/.test(threw), threw);
}

console.log('\n=== the zip: untrusted input, opened within ceilings ===');
{
  const plain = new TextEncoder().encode('hello hello hello');
  const stored = W.zipStore([{ name: 'a.txt', data: plain }], new Date(2026, 0, 1));
  const back = await W.unzipSome(stored, (n) => n === 'a.txt');
  ok('a stored entry reads back', new TextDecoder().decode(back.get('a.txt')) === 'hello hello hello');
  ok('the CRC is the standard one', W.crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')) === 0x414fa339);
  // a deflated entry, hand-built — and one that inflates past the ceiling
  const build = (name, raw, deflated) => {
    const enc = new TextEncoder().encode(name);
    const local = new Uint8Array(30 + enc.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, 8, true); lv.setUint32(18, deflated.length, true); lv.setUint32(22, raw, true); lv.setUint16(26, enc.length, true);
    local.set(enc, 30);
    const central = new Uint8Array(46 + enc.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(20, deflated.length, true); cv.setUint32(24, raw, true); cv.setUint16(28, enc.length, true); cv.setUint32(42, 0, true);
    central.set(enc, 46);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, central.length, true); ev.setUint32(16, local.length + deflated.length, true);
    return W.concat([local, deflated, central, end]);
  };
  const small = build('x.xml', 5000, new Uint8Array(deflateRawSync(Buffer.from('<a>' + 'b'.repeat(4993) + '</a>'))));
  const sm = await W.unzipSome(small, () => true);
  ok('a deflated entry inflates', new TextDecoder().decode(sm.get('x.xml')).length === 5000);
  const bomb = build('bomb.xml', 100, new Uint8Array(deflateRawSync(Buffer.alloc(W.MAX_ENTRY + 1024))));
  let err = '';
  try {
    await W.unzipSome(bomb, () => true);
  } catch (e) {
    err = e.message;
  }
  ok('a zip that inflates past the ceiling is stopped, whatever it declares', /too large/.test(err), err);
}

console.log('\n=== the checks: what a rule can decide ===');
{
  const run = (text, extra = {}) => W.checkBlock(P(text, { id: 'b1', ...extra }), { supported: false, ...(extra.ctx ?? {}) });
  const has = (text, rule, extra) => run(text, extra).some((i) => i.rule === rule);
  const first = (text, rule) => run(text).find((i) => i.rule === rule);
  const r1 = first('It was the the best of times.', 'repeat-word');
  ok('a doubled word, definite, with its fix', r1 && r1.certainty === 'definite' && r1.text === 'the the' && r1.fix === 'the', J(r1));
  ok('  “had had” and “that that” are left alone', !has('She had had enough, and said that that was it.', 'repeat-word'));
  ok('  a name said twice is left alone', !has('We drove to Walla Walla last year.', 'repeat-word'));
  const sp = first('I recieve the letters', 'spelling');
  ok('a misspelling that is never a word, with the word', sp && sp.fix === 'receive' && sp.certainty === 'definite');
  ok('  its capital kept in the fix', first('Thier house is big.', 'spelling').fix === 'Their');
  ok('  British spellings and real words are not misspellings', !has('The colour of the analyse button, the wether grazed.', 'spelling'));
  ok('  nothing is checked inside an address', !has('See www.teh-example.com/recieve for more.', 'spelling'));
  ok('“could of” → “could have”', first('We could of left earlier.', 'could-of')?.fix === 'could have');
  ok('  but “would, of course,” is fine', !has('It would of course rain.', 'could-of'));
  ok('“more then” → “than”, likely, saying when it is right', (() => { const i = first('It costs more then before.', 'then-than'); return i && i.certainty === 'likely' && i.fix === 'than' && /time/.test(i.why); })());
  ok('“it’s own” → “its own”', first('The city has it’s own rules.', 'its-own')?.fix === 'its');
  ok('a / an by sound: “a apple”', first('She ate a apple.', 'a-an')?.fix === 'an');
  ok('  “an university” → “a”', first('He went to an university.', 'a-an')?.fix === 'a');
  ok('  “an hour”, “a one-off”, “a university”, “an MBA” are right', !has('It took an hour, a one-off, at a university, for an MBA.', 'a-an'));
  ok('  “Plan A is better” is a name, not an article', !has('We think Plan A is better.', 'a-an'));
  ok('  at a sentence’s start it still counts', first('A apple fell.', 'a-an')?.fix === 'An');
  ok('a lone lower-case “i” is a capital', first('Then i went home.', 'cap-i')?.fix === 'I' && first('i’m sure.', 'cap-i'));
  ok('  “i.e.” and “(i)” are left alone', !has('That is, i.e. the second (i) option.', 'cap-i'));
  ok('a space before a comma', first('First , second.', 'space-punct')?.fix === ',');
  ok('  an ellipsis and a decimal are not', !has('Wait ... it costs .5 dollars', 'space-punct') && !has('Wait... and then...', 'double-punct'));
  ok('doubled commas, definite; two full stops, likely', first('Yes,, no.', 'double-punct')?.certainty === 'definite' && first('The end..', 'double-punct')?.certainty === 'likely');
  ok('a missing space after a sentence', first('It ended.Then it began.', 'missing-space')?.fix === '. ');
  ok('  not inside a file name or an address', !has('Open report.Docx or Site.Com today.', 'missing-space'));
  ok('a sentence that starts lower case, mid-paragraph', has('The first sentence is fine. the second is not quite right at all here.', 'sentence-cap'));
  ok('  not after “e.g.”, not for iPhone', !has('Many tools exist, e.g. we could use iPhone apps. iPhone sales rose quickly this year.', 'sentence-cap'));
  ok('  not a list item that is a fragment', !W.checkBlock(P('rent too high', { t: 'ul', lvl: 1 }), { supported: false }).some((i) => i.rule === 'sentence-cap'));
  const long = 'This is a sentence that keeps going ' + 'and going and going '.repeat(10) + 'until it ends.';
  ok('a very long sentence is a suggestion, saying how long', (() => { const i = first(long, 'long-sentence'); return i && i.certainty === 'suggestion' && /\d+ words long/.test(i.why); })());
  ok('three sentences with the same opening', has('I think so. I believe it. I know it.', 'same-opening'));
  ok('research with nothing behind it: likely, and Socria does not supply a source', (() => { const i = first('Studies show that rent control reduces supply.', 'unsupported'); return i && i.kind === 'support' && /will not supply one/.test(i.why); })());
  ok('  a statistic too', has('Rents rose 40% in ten years.', 'unsupported'));
  ok('  not when the paragraph cites a passage', !W.checkBlock(P('Studies show that rents rose.', { cites: [{ id: 'c', doc: 'D', block: 'p1.1', label: 'L' }] }), { supported: false }).some((i) => i.rule === 'unsupported'));
  ok('  not when it grew from a card linked to a passage', !W.checkBlock(P('Studies show that rents rose.'), { supported: true }).some((i) => i.rule === 'unsupported'));
  ok('someone else’s words in quotation marks, uncited', has('As she put it, “a city that cannot house its workers will not keep them for long.”', 'uncited-quote'));
  const q = W.checkBlock(P('teh the the studies show 50% of could of', { t: 'quote' }), { supported: false });
  ok('a quotation is someone else’s words: only its citation is checked', q.length === 1 && q[0].rule === 'uncited-quote', J(q));
  ok('headings are not prose: no capital or length rules on them', !W.checkBlock(P('why rents rise', { t: 'h2' }), { supported: false }).some((i) => i.kind === 'clarity' || i.rule === 'sentence-cap'));

  // the verb and its subject, and the words people swap — each with the right uses it must leave alone
  ok('“they was” → “were”, definite', (() => { const i = first('They was late again.', 'agree-was'); return i && i.certainty === 'definite' && i.fix === 'were'; })());
  ok('  “thank you was” and “the singular they was” are not about the pronoun', !has('Thank you was all she said.', 'agree-was') && !has('The singular they was common.', 'agree-was'));
  ok('“I is” → “am”, “I has” → “have”', first('I is ready.', 'agree-i')?.fix === 'am' && first('Today I has a plan.', 'agree-i')?.fix === 'have');
  ok('  a numeral is not the writer: “Part I is”, “World War I has”', !has('Part I is short. In World War I has been written about.', 'agree-i'));
  ok('“she have” → “has”; “it don’t” → “doesn’t”', first('She have a point.', 'agree-3')?.fix === 'has' && first('It don’t matter.', 'agree-3')?.fix === 'doesn’t');
  ok('  a question or a helper puts the bare verb there rightly: “did she have”, “should it have”', !has('Did she have the keys? Should it have broken? Let it have rest.', 'agree-3'));
  ok('“they has”, “you is” → “have”, “are”', first('They has gone.', 'agree-pl')?.fix === 'have' && first('You is welcome.', 'agree-pl')?.fix === 'are');
  ok('  but not “thank you is”', !has('Thank you is not enough.', 'agree-pl'));
  ok('“he were” → “was”, likely', first('Yesterday he were home.', 'agree-were')?.fix === 'was');
  ok('  the subjunctive is left alone: “if he were”, “as though it were”, “as it were”', !has('If he were taller he would play. She looked as though it were raining. As it were, nothing came.', 'agree-were'));
  ok('“their is” → “there”', first('Their is a problem.', 'their-there')?.fix === 'There');
  ok('“there own” → “their own”, definite', (() => { const i = first('They each have there own way.', 'there-own'); return i && i.certainty === 'definite' && i.fix === 'their'; })());
  ok('“between you and I” → “me”', first('This stays between you and I.', 'and-i')?.fix === 'me');
  ok('  but “for you and I think…” starts a new clause, and “to London and I” is a place', !has('I made it for you and I think you will like it. We went to London and I loved it.', 'and-i'));
  ok('“may of” → “may have”; the month is left alone', first('You may of heard.', 'could-of')?.fix === 'may have' && !has('May of 2020 was hard.', 'could-of'));
  ok('“do not loose” → “lose”; “the knot is not loose” is right', first('Do not loose the keys.', 'loose-lose')?.fix === 'lose' && !has('The knot is not loose.', 'loose-lose'));
  ok('“the affect” → “effect”, saying when “affect” is a noun after all', (() => { const i = first('The affect was large.', 'affect-effect'); return i && i.fix === 'effect' && /psychology/.test(i.why); })());
  ok('“less people” → “fewer”; “amount of students” → “number”', first('There were less people.', 'less-fewer')?.fix === 'fewer' && first('A large amount of students came.', 'amount-number')?.fix === 'number');
  ok('“its’” → “its”; “for all intensive purposes”', first('The dog wagged its’ tail.', 'its-apos')?.fix === 'its' && first('For all intensive purposes it is done.', 'intents')?.fix === 'For all intents and purposes');
  ok('“its important” → “it’s”; “its very nature” is the possessive, left alone', first('Its important to rest.', 'its-is')?.fix === 'It’s' && !has('Its very nature is to change.', 'its-is'));
  ok('two spaces between words, definite; after a full stop, likely', (() => { const r = run('Two  spaces. And  more.  Then.').filter((i) => i.rule === 'double-space'); return r.length === 3 && r.filter((i) => i.certainty === 'definite').length === 2 && r.every((i) => i.fix === ' '); })());
  ok('no space after a comma; a space before “;”, “!” (French typography said)', first('Red,green and blue.', 'comma-space')?.fix === ', ' && /French/.test(first('Also this !', 'space-punct')?.why ?? ''));
  ok('  numbers and addresses keep their commas', !has('It cost 1,200 dollars at a,b.example.com.', 'comma-space'));
  ok('a bracket never closed; a stray closing one', has('The plan (as agreed was fine.', 'bracket-open') && has('Then a stray ) appears.', 'bracket-close'));
  ok('  “(see p. 42)”, a list’s “1)” and a face “:)” are right', !run('See p. 42 (in the appendix), and the list: 1) one 2) two. Happy :) and sad :(').some((i) => i.rule.startsWith('bracket')));
  ok('a quotation opened and never closed', has('He said “this is unfinished.', 'quote-open') && !has('He said “this is finished.”', 'quote-open'));
  const wordy = run('In order to win, due to the fact that we can, the vast majority of us want the end result.').filter((i) => i.rule === 'wordy');
  ok('wordiness offered, never underlined: a judgement call with a shorter way', wordy.length === 4 && wordy.every((i) => i.certainty === 'suggestion' && i.kind === 'clarity') && J(wordy.map((i) => i.fix)) === J(['To', 'because', 'most', 'result']), J(wordy.map((i) => i.fix)));
  ok('  a long sentence and the wordy phrase inside it are both kept', (() => { const r = run('In order to see it ' + 'and going and going '.repeat(12) + 'we stop.'); return r.some((i) => i.rule === 'long-sentence') && r.some((i) => i.rule === 'wordy'); })());
}

console.log('\n=== fixing every definite slip at once ===');
{
  const d = docOf([P('They was late and teh  dog barked.', { id: 'a', marks: [{ s: 0, e: 4, t: 'b' }] }), P('Their is a problem with alot of it.', { id: 'b' })]);
  const issues = W.checkDoc(d);
  const definite = issues.filter((i) => i.certainty === 'definite' && i.fix !== undefined);
  const r = W.applyFixes(d, definite);
  ok('every definite fix made, from the end of each paragraph back', r.applied === definite.length && r.doc.blocks[0].text === 'They were late and the dog barked.' && r.doc.blocks[1].text === 'Their is a problem with a lot of it.', J(r.doc.blocks.map((b) => b.text)));
  ok('  what is only likely is left for the writer', r.doc.blocks[1].text.startsWith('Their'));
  ok('  the bold on “They” is where it was', J(r.doc.blocks[0].marks) === J([{ s: 0, e: 4, t: 'b' }]));
  const moved = W.replaceBlock(d, { ...d.blocks[0], text: 'Someone changed this line.' });
  ok('  a fix whose words are gone is not made', W.applyFixes(moved, definite).doc.blocks[0].text === 'Someone changed this line.');
  ok('the Check list’s three groups cover every kind', J(W.ISSUE_GROUPS.flatMap((g) => g.kinds).sort()) === J([...W.ISSUE_KINDS].sort()));
}

console.log('\n=== the checks: across the document, and dismissals that hold ===');
{
  const d = docOf([
    P('Outline heading', { id: 'h1', t: 'h2' }),
    P('Next heading', { id: 'h2', t: 'h2' }),
    P('Housing costs are rising across the region quickly.', { id: 'a' }),
    P('Housing costs are rising across the region quickly. I recieve letters.', { id: 'b' }),
  ]);
  const all = W.checkDoc(d);
  ok('a heading with nothing under it, a suggestion', all.some((i) => i.rule === 'empty-heading' && i.block === 'h1' && i.certainty === 'suggestion'));
  ok('a sentence said twice, word for word', all.some((i) => i.rule === 'duplicate-sentence' && i.block === 'b'));
  ok('findings in reading order', all.map((i) => d.blocks.findIndex((b) => b.id === i.block)).every((v, k, a) => !k || a[k - 1] <= v));
  ok('what is underlined while writing leaves the suggestions out', W.inline(all).every((i) => i.certainty !== 'suggestion') && W.inline(all).some((i) => i.rule === 'spelling'));
  const sp = all.find((i) => i.rule === 'spelling');
  const dismissed = { ...d, dismissed: [sp.id] };
  ok('a dismissed finding is gone', !W.checkDoc(dismissed).some((i) => i.id === sp.id));
  const edited = W.replaceBlock(dismissed, { ...dismissed.blocks[2], text: 'Housing costs are rising everywhere now.' });
  ok('  and stays gone when other writing changes', !W.checkDoc(edited).some((i) => i.rule === 'spelling'));
  const moved = W.moveBlocks(dismissed, ['b'], 0);
  ok('  and when its paragraph moves', !W.checkDoc(moved).some((i) => i.rule === 'spelling'));
  const again = W.replaceBlock(dismissed, { ...dismissed.blocks[3], text: dismissed.blocks[3].text + ' I recieve more.' });
  ok('  a new occurrence of the same slip is a new finding', W.checkDoc(again).filter((i) => i.rule === 'spelling').length === 1);
  // a long document: checked fast, and an unchanged paragraph is not checked again
  const big = docOf(Array.from({ length: 1500 }, (_, k) => P(`Paragraph ${k} says that housing costs rose ${k % 7} times as quickly as wages, and that teh the councils did nothing about it for years.`, { id: `p${k}` })));
  let t = performance.now();
  const first = W.checkDoc(big);
  const cold = performance.now() - t;
  const one = W.replaceBlock(big, { ...big.blocks[700], text: big.blocks[700].text + ' More.' });
  t = performance.now();
  W.checkDoc(one);
  const warm = performance.now() - t;
  ok(`a 1,500-paragraph document checked in ${Math.round(cold)} ms`, cold < 1500 && first.length >= 1500);
  ok(`  and again after one edit in ${Math.round(warm)} ms — only the changed paragraph read`, warm < cold);
}

console.log('\n=== the board: its shape, said on the cards ===');
{
  let d = W.emptyDoc(1);
  const g = W.addGroup(d, 'Why rents rise');
  d = g.doc;
  const claim = W.addCard(d, 'Rents rise because supply lags demand', { kind: 'claim', group: g.group.id });
  d = claim.doc;
  const counter = W.addCard(d, 'But wages rose too', { kind: 'counter', group: g.group.id });
  d = counter.doc;
  const g2 = W.addGroup(d, 'Evidence pile');
  d = g2.doc;
  const ev = W.addCard(d, 'Vacancy fell to 2%', { kind: 'evidence', group: g2.group.id });
  d = ev.doc;
  const dup = W.addCard(d, 'Rents rise since supply lags behind demand', { kind: 'idea' });
  d = dup.doc;
  const hints = W.boardHints(d);
  const of = (id) => hints.find((h) => h.card === id);
  ok('a claim with nothing behind it', of(claim.card.id)?.kind === 'unsupported');
  ok('an objection with nothing after it', of(counter.card.id)?.kind === 'unanswered');
  ok('evidence in a pile with no claim to back', of(ev.card.id)?.kind === 'floating');
  ok('two cards saying the same thing', of(dup.card.id)?.kind === 'repeat' && of(dup.card.id).other === claim.card.id);
  const backed = W.moveCard(d, ev.card.id, g.group.id, 1);
  ok('  evidence in the claim’s pile backs it: that hint goes', W.boardHints(backed).find((h) => h.card === claim.card.id)?.kind !== 'unsupported');
  const linkedEv = W.linkCard(backed, ev.card.id, { k: 'doc', doc: 'D1', id: 'p2.4', label: 'Housing report, p. 2', quote: 'Vacancy fell to 2%.' });
  const before = W.insertBlocks(linkedEv, null, [P('My own opening paragraph.', { id: 'mine' })]);
  const out = W.outlineFrom(before);
  ok('the board as an outline: the pile’s title as a heading, its cards as an outline in their order', J(out.blocks.map((b) => [b.t, b.lvl ?? 0, b.text])) === J([['h2', 0, 'Why rents rise'], ['ul', 1, 'Rents rise because supply lags demand'], ['ul', 2, 'Vacancy fell to 2%'], ['ul', 2, 'But wages rose too'], ['ul', 1, 'Rents rise since supply lags behind demand']]), J(out.blocks.map((b) => [b.t, b.lvl ?? 0, b.text])));
  ok('  evidence keeps its passage, as a citation', out.blocks[2].cites?.[0]?.block === 'p2.4' && out.blocks[2].cites[0].quote === 'Vacancy fell to 2%.');
  ok('  each block remembers its card', out.blocks.slice(1).every((b) => b.from?.length === 1));
  const after = W.insertBlocks(before, before.blocks[before.blocks.length - 1].id, out.blocks);
  ok('  added after what is written, which is untouched', after.blocks[0].id === 'mine' && after.blocks[0].text === 'My own opening paragraph.');
  ok('  running it again adds nothing', W.outlineFrom(after).added === 0 && W.outlineFrom(after).skipped === 4);
  const brief = W.boardBrief(linkedEv);
  ok('what the assist route is shown of the board: kinds, piles, words, links by name', brief.find((c) => c.id === ev.card.id).links[0] === 'passage: Housing report, p. 2' && brief[0].pile === 'Why rents rise');
}

console.log('\n=== import: other readers’ documents ===');
{
  const src = { v: 1, id: 'x', name: 'notes.odt', format: 'odt', pageCount: 1, pages: [], tables: [], figures: [], checks: [], blocks: [
    { id: 'p1.1', page: 1, kind: 'title', text: 'Doc title', method: 'structured' },
    { id: 'p1.2', page: 1, kind: 'heading', level: 2, text: 'Section', method: 'structured' },
    { id: 'p1.3', page: 1, kind: 'list', level: 1, text: '1. First item', method: 'structured' },
    { id: 'p1.4', page: 1, kind: 'list', level: 2, text: '• Sub item', method: 'structured' },
    { id: 'p1.5', page: 1, kind: 'header', text: 'Page header', method: 'structured' },
    { id: 'p1.6', page: 1, kind: 'figure', text: 'A chart', method: 'structured' },
    { id: 'p1.7', page: 1, kind: 'quote', text: 'Quoted words', method: 'structured' },
  ] };
  const r = W.blocksFromSource(src);
  ok('a document read elsewhere: title, headings, lists without their labels, quotes; page furniture left out', r.title === 'Doc title' && J(r.blocks.map((b) => [b.t, b.lvl ?? 0, b.text])) === J([['h2', 0, 'Section'], ['ol', 1, 'First item'], ['ul', 2, 'Sub item'], ['quote', 0, 'Quoted words']]), J(r.blocks));
  ok('  and it says what did not come in', r.notes.some((n) => /picture/.test(n)) && r.notes.some((n) => /bold/.test(n)));
}

console.log('\n=== Point & Ask: words of their own draft, as the conversation knows them ===');
{
  let d = docOf([P('Intro words.', { id: 'p1' }), P('Rents rise when supply lags demand, and wages do not keep up.', { id: 'p2', cites: [{ id: 'c1', doc: 'D1', block: 'p2.4', label: 'Housing report, p. 2' }] })], { title: 'Rent essay' });
  const card = W.addCard(d, 'Vacancy fell to 2%', { kind: 'evidence', links: [{ k: 'node', id: 'n1', label: 'Supply is the bottleneck' }] });
  d = card.doc;
  d = W.replaceBlock(d, { ...d.blocks[1], from: [card.card.id] });
  const b = W.describeWriting(d, { kind: 'block', block: 'p2', s: 0, e: 27 });
  ok('a selection: their words verbatim, where they sit, what they cite and grew from', b.kind === 'writing' && b.label === 'Rents rise when supply lags' && b.of === 'the draft “Rent essay”' && b.lines.some((l) => l === 'their words, verbatim: “Rents rise when supply lags”') && b.lines.some((l) => /paragraph 2 of their draft/.test(l)) && b.lines.some((l) => /cites a passage they linked: Housing report, p. 2/.test(l)) && b.lines.some((l) => /grew from their Draft Space card: “Vacancy fell to 2%”, linked to the map idea Supply is the bottleneck/.test(l)), J(b));
  const c = W.describeWriting(d, { kind: 'card', card: card.card.id });
  ok('a card: its kind, its pile, its words, its links', c.lines[0].includes('evidence') && c.lines[0].includes('not yet in a pile') && c.lines.some((l) => /map idea on their Logic Map|an idea on their Logic Map: Supply is the bottleneck/.test(l)), J(c));
  ok('a selection that is gone describes nothing', W.describeWriting(d, { kind: 'block', block: 'nope', s: 0, e: 3 }) === null && W.describeWriting(d, { kind: 'card', card: 'nope' }) === null);
  const clean = W.sanitizeFocus(b);
  ok('the brief survives the trip from the browser', clean && clean.kind === 'writing' && clean.lines.length === b.lines.length);
  const block = W.focusBlock(clean);
  ok('the reply is told these are their words, and not to rewrite them unasked', /words of their own draft/.test(block) && /do not rewrite it unless they ask you to/.test(block) && block.includes('Rents rise when supply lags'));
  ok('the message keeps what it was about, and the history says so', W.cleanAboutRef({ kind: 'writing', label: b.label, of: b.of })?.kind === 'writing' && /words they selected in their own draft/.test(W.aboutLine({ kind: 'writing', label: b.label, of: b.of })));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
