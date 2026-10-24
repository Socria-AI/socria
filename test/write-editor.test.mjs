// THE WORD PROCESSOR — the document model's formatting, tables, pictures and
// page, and every way out and in (lib/write/*).
//
// What is held down:
//   • valued marks — a link's address, a colour, a highlight, a font, a size —
//     have one value per character, travel with their words through every
//     edit, and are checked when they arrive (no script for a link, no
//     invented font name in CSS); superscript and subscript exclude each other;
//   • a paragraph's alignment, indentation and spacing carry onto the block
//     split from it; Backspace takes an indent out a step before it joins;
//   • pictures, lines, page breaks and tables are whole: a range takes them
//     or leaves them, Backspace picks one out before it removes it, a paste
//     splits the paragraph around them, and there is always a line to type on;
//   • a table's cells are blocks of words of their own: found, edited,
//     checked and searched like paragraphs, with the table's words kept in
//     its text for anything older that reads only words;
//   • a document saved before all this reads exactly as it was (no migration),
//     and one saved after it keeps every word in a reader that knows nothing
//     of it — the rollback;
//   • HTML, Markdown, text, Word and PDF carry what each can hold, and come
//     back in as what went out — read again by our readers and, where they are
//     installed, by LibreOffice, pandoc and pdftotext;
//   • a picture is known by its own bytes, and a PDF says which characters it
//     cannot show rather than dropping them;
//   • the checks read table cells and leave code alone; Point & Ask describes
//     a cell; the switch turns the tools off without touching a document.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as W from './.tmp/write-under-test.mjs';
import { png } from './helpers/png.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));
const J = (v) => JSON.stringify(v);
const P = (text, extra = {}) => ({ id: extra.id ?? W.uid('b'), t: extra.t ?? 'p', text, ...extra });
const docOf = (blocks, extra = {}) => ({ ...W.emptyDoc(1), blocks, ...extra });
// is a tool installed? (poppler's tools answer -v, not --version)
const has = (cmd, flag = '--version') => spawnSync(cmd, [flag], { encoding: 'utf8' }).status === 0;

console.log('=== marks with values: one value a character, carried by every edit ===');
{
  let b = P('The red word and a link here', { id: 'm1' });
  b = W.setMark(b, 4, 7, 'color', '#CC0000');
  ok('a colour set, as #rrggbb in lower case', J(b.marks) === J([{ s: 4, e: 7, t: 'color', v: '#cc0000' }]), J(b.marks));
  b = W.setMark(b, 0, 12, 'color', '#0000ff');
  ok('  set again over more words: the later value wins where they overlap — one value a character', J(b.marks) === J([{ s: 0, e: 12, t: 'color', v: '#0000ff' }]), J(b.marks));
  b = W.setMark(b, 4, 7, 'color', null);
  ok('  taken off the middle: what is left either side stays', J(b.marks) === J([{ s: 0, e: 4, t: 'color', v: '#0000ff' }, { s: 7, e: 12, t: 'color', v: '#0000ff' }]), J(b.marks));
  ok('a link that is a script is no link', W.setMark(b, 0, 3, 'a', 'javascript:alert(1)').marks.every((m) => m.t !== 'a'));
  ok('  www. becomes https://, mail and phone are links too, a data address is not', W.hrefValue('www.example.org') === 'https://www.example.org' && W.hrefValue('mailto:a@b.co') === 'mailto:a@b.co' && W.hrefValue('tel:+44 20 7946 0000') && !W.hrefValue('data:text/html,x') && !W.hrefValue('file:///etc/passwd'));
  ok('a font: one of the page’s, or a name safe to put in CSS — never one that could break out of it', W.fontValue('Arial') === 'arial' && W.fontValue('Lato') === 'Lato' && W.fontValue("x'; background:url(evil)") === null && W.fontValue('a'.repeat(60)) === null);
  ok('a size: between 6 and 96, in half points', W.sizeValue(11.3) === '11.5' && W.sizeValue(400) === '96' && W.sizeValue('nope') === null);
  const s = W.spliceBlock(W.setMark(P('alpha beta gamma', { id: 's' }), 6, 10, 'font', 'courier'), 0, 5, 'ALPHA!');
  ok('a valued mark moves with its words when words before it change', J(s.marks) === J([{ s: 7, e: 11, t: 'font', v: 'courier' }]), J(s.marks));
  let sc = W.toggleMark(P('E=mc2 H2O', { id: 'x' }), 4, 5, 'sup');
  sc = W.toggleMark(sc, 4, 5, 'sub');
  ok('superscript and subscript exclude each other', J(sc.marks) === J([{ s: 4, e: 5, t: 'sub' }]), J(sc.marks));
  const typed = W.insertMarked(W.toggleMark(P('bold here', { id: 'y' }), 0, 9, 'b'), 4, ' and', [{ s: 0, e: 0, t: 'i' }]);
  ok('words typed with formatting held at the caret wear exactly it — not the bold around them', typed.text === 'bold and here' && J(typed.marks) === J([{ s: 0, e: 4, t: 'b' }, { s: 4, e: 8, t: 'i' }, { s: 8, e: 13, t: 'b' }]), J(typed.marks));
  const at = W.marksAt(W.setMark(P('abc def', { id: 'z' }), 0, 3, 'size', '18'), 3);
  ok('the marks a caret writes with: those of the character before it', at.length === 1 && at[0].v === '18');
  ok('one value over a range, or none when it differs', W.valueOver(W.setMark(P('abcdef', { id: 'v' }), 0, 6, 'bg', '#ffff00'), 1, 4, 'bg') === '#ffff00' && W.valueOver(W.setMark(P('abcdef', { id: 'v' }), 0, 2, 'bg', '#ffff00'), 0, 4, 'bg') === null);
  const cleared = W.clearMarks(W.setMark(W.setMark(W.toggleMark(P('link and bold', { id: 'c' }), 0, 13, 'b'), 0, 4, 'a', 'https://x.org'), 0, 13, 'color', '#cc0000'), 0, 13);
  ok('clear formatting takes everything but a link', J(cleared.marks) === J([{ s: 0, e: 4, t: 'a', v: 'https://x.org' }]), J(cleared.marks));
  ok('code holds no marks', W.setMark(P('x = 1', { id: 'k', t: 'code' }), 0, 5, 'color', '#cc0000').marks === undefined);
}

console.log('\n=== a paragraph’s settings ===');
{
  let d = docOf([P('Centred and spaced', { id: 'a' }), P('Second', { id: 'b' })]);
  d = W.setParaAttrs(d, ['a'], { align: 'center', lh: 2, sb: 12, sa: 6 });
  ok('alignment, line spacing and space before and after set on a paragraph', J(['align', 'lh', 'sb', 'sa'].map((k) => d.blocks[0][k])) === J(['center', 2, 12, 6]));
  const sp = W.splitBlock(d, 'a', 8);
  ok('  Enter: the new paragraph keeps them', sp.doc.blocks[1].align === 'center' && sp.doc.blocks[1].lh === 2);
  d = W.setParaAttrs(d, ['a'], { align: null, lh: null });
  ok('  null takes a setting away', d.blocks[0].align === undefined && d.blocks[0].lh === undefined && d.blocks[0].sb === 12);
  let i = W.indentBlocks(docOf([P('Indented', { id: 'i' })]), ['i'], 1);
  i = W.indentBlocks(i, ['i'], 1);
  ok('indent: half an inch a step', i.blocks[0].ind === 2);
  const back = W.mergeBack(i, 'i');
  ok('  Backspace at its start takes it out a step before anything else', back.doc.blocks[0].ind === 1 && back.doc.blocks.length === 1);
  ok('a list item indents by its depth, not by inches', W.indentBlocks(docOf([P('item', { id: 'l', t: 'ul', lvl: 1 })]), ['l'], 1).blocks[0].lvl === 2);
}

console.log('\n=== pictures, lines, page breaks: whole ===');
{
  const img = { ...W.makeImage({ src: 'm:' + 'a'.repeat(32), alt: 'chart', iw: 400, ih: 200 }), id: 'img' };
  let d = docOf([P('Before the picture', { id: 'p1' }), img, P('After it', { id: 'p2' })]);
  const across = W.replaceRange(d, { block: 'p1', offset: 6 }, { block: 'p2', offset: 5 });
  ok('a range across a picture takes it; the words either side join', across.doc.blocks.length === 1 && across.doc.blocks[0].text === 'Before it', J(across.doc.blocks.map((b) => b.text)));
  const upTo = W.replaceRange(d, { block: 'p1', offset: 6 }, { block: 'img', offset: 0 });
  ok('  a range that ends before it leaves it', upTo.doc.blocks.some((b) => b.id === 'img') && upTo.doc.blocks[0].text === 'Before');
  const whole = W.replaceRange(d, { block: 'img', offset: 0 }, { block: 'img', offset: 1 }, 'X');
  ok('  the picture chosen whole and typed over: it becomes the words', !whole.doc.blocks.some((b) => b.t === 'img') && whole.doc.blocks[1].text === 'X');
  const copied = W.blocksInRange(d, { block: 'p1', offset: 0 }, { block: 'p2', offset: 2 });
  ok('a copy across it carries the picture whole', copied.map((b) => b.t).join() === 'p,img,p' && copied[1].src === img.src);
  const mb = W.mergeBack(d, 'p2');
  ok('Backspace after a picture picks it out — it does not delete it, and joins nothing', mb.select === 'img' && mb.doc === d);
  const mbEmpty = W.mergeBack(docOf([P('x', { id: 'p1' }), img, P('', { id: 'e' }), P('y', { id: 'p3' })]), 'e');
  ok('  an empty line after it goes, and the picture is picked out', mbEmpty.select === 'img' && !mbEmpty.doc.blocks.some((b) => b.id === 'e'));
  ok('Delete before a picture picks it out', W.mergeForward(d, 'p1').select === 'img');
  const put = W.insertAt(docOf([P('Split here please', { id: 'h' })]), { block: 'h', offset: 6 }, [{ ...W.makeImage({ src: 'm:' + 'b'.repeat(32) }), id: 'new' }]);
  ok('a picture put in mid-paragraph splits it around itself', put.doc.blocks.map((b) => b.t + ':' + b.text).join('|') === 'p:Split |img:|p:here please', put.doc.blocks.map((b) => b.t + ':' + b.text).join('|'));
  const atStart = W.insertAt(docOf([P('Words', { id: 'h' })]), { block: 'h', offset: 0 }, [{ ...W.makeImage({ src: 'm:' + 'b'.repeat(32) }), id: 'n2' }]);
  ok('  at a paragraph’s start it goes above it, the caret staying with the words', atStart.doc.blocks.map((b) => b.t).join() === 'img,p' && atStart.caret.block === 'h');
  const lonely = W.withTextAround(docOf([P('x', { id: 'x' }), W.makeRule(), W.makePageBreak()]));
  ok('there is always a line to type on after a line, a page break, a picture or a table', lonely.blocks.map((b) => b.t).join() === 'p,hr,p,pb,p', lonely.blocks.map((b) => b.t).join());
  ok('an empty document is one with no pictures or tables either', !W.isEmptyDoc(docOf([img])) && W.isEmptyDoc(docOf([P('')])));
  ok('every picture the writing holds — and its versions — by media id', J(W.mediaIds({ blocks: [img], versions: [{ blocks: [{ ...img, src: 'm:' + 'c'.repeat(32) }] }] })) === J(['a'.repeat(32), 'c'.repeat(32)]));
}

console.log('\n=== tables: cells are blocks of words of their own ===');
{
  let t = W.makeTable(2, 2);
  const [[c00, c01], [c10, c11]] = t.rows;
  let d = docOf([P('Above', { id: 'a' }), t, P('Below', { id: 'z' })]);
  d = W.updateCell(d, c00.id, { ...c00, text: 'Year' });
  d = W.updateCell(d, c01.id, { ...c01, text: 'Rent' });
  d = W.updateCell(d, c10.id, { ...c10, text: '2020' });
  d = W.updateCell(d, c11.id, { ...c11, text: '1,200' });
  t = d.blocks[1];
  ok('a cell’s words set; the table’s words follow, for anything that reads only words', t.text === 'Year\tRent\n2020\t1,200', J(t.text));
  ok('  a cell found by its id — its table, row and column', J((({ r, c }) => [r, c])(W.findCell(d, c11.id))) === J([1, 1]) && W.findText(d, c11.id).text === '1,200');
  ok('  every block of words in reading order, cells included', W.textBlocks(d).map((b) => b.text).join('|') === 'Above|Year|Rent|2020|1,200|Below');
  const typed = W.replaceText(d, W.spliceBlock(W.findText(d, c10.id), 4, 4, ' Q1'));
  ok('  typing in a cell is an edit to that cell', W.findText(typed, c10.id).text === '2020 Q1' && typed.blocks[1].text.includes('2020 Q1'));
  const enter = W.splitBlock(d, c00.id, 4);
  ok('  Enter in a cell is a line break in it, never a new paragraph', W.findText(enter.doc, c00.id).text === 'Year\n' && enter.doc.blocks.length === 3);
  const pasted = W.insertAt(d, { block: c00.id, offset: 0 }, [P('one', { marks: [{ s: 0, e: 3, t: 'b' }] }), P('two')]);
  ok('  a paste into a cell arrives as its lines', W.findText(pasted.doc, c00.id).text === 'one\ntwoYear' && J(W.findText(pasted.doc, c00.id).marks) === J([{ s: 0, e: 3, t: 'b' }]));
  const cellRange = W.replaceRange(d, { block: c01.id, offset: 0 }, { block: c01.id, offset: 4 }, 'Cost');
  ok('  a range inside a cell is replaced in the cell', W.findText(cellRange.doc, c01.id).text === 'Cost');
  let g = W.insertRow(d, t.id, 1);
  g = W.insertCol(g, t.id, 2);
  ok('rows and columns put in', g.blocks[1].rows.length === 3 && g.blocks[1].rows.every((r) => r.length === 3) && g.blocks[1].rows[0][0].text === 'Year');
  g = W.deleteCol(W.deleteRow(g, t.id, 1), t.id, 2);
  ok('  and taken out again, the words as they were', g.blocks[1].text === 'Year\tRent\n2020\t1,200');
  ok('the last row taken out takes the table', !W.deleteRow(W.deleteRow(d, t.id, 0), t.id, 0).blocks.some((b) => b.t === 'table'));
  const w = W.setTable(d, t.id, { cols: [3, 1], head: false });
  ok('column widths as fractions that add to one; the header row turned off', J(w.blocks[1].cols) === J([0.75, 0.25]) && w.blocks[1].head === undefined);
  const ids = new Set(W.textBlocks(W.insertBlocks(d, 'z', [t])).map((b) => b.id));
  ok('a table pasted again gets cells of its own — no two cells share an id', ids.size === W.textBlocks(W.insertBlocks(d, 'z', [t])).length);
  const across = W.replaceRange(d, { block: 'a', offset: 2 }, { block: c10.id, offset: 1 });
  ok('a range from the words above into a cell takes the table whole', !across.doc.blocks.some((b) => b.t === 'table'));
  ok('find searches the cells too; replace keeps a cell a cell', W.findAll(d, '20').length === 3 && W.findText(W.replaceHits(d, W.findAll(d, '2020'), '2021'), c10.id).text === '2021');
}

console.log('\n=== find and replace; the outline ===');
{
  const d = docOf([P('Rent rises. RENT falls.', { id: 'a', marks: [{ s: 0, e: 4, t: 'b' }] }), P('rental market', { id: 'b' })]);
  ok('find: in any case, or matching case, or whole words only', W.findAll(d, 'rent').length === 3 && W.findAll(d, 'rent', { matchCase: true }).length === 1 && W.findAll(d, 'rent', { wholeWord: true }).length === 2);
  const r = W.replaceHits(d, W.findAll(d, 'rent', { wholeWord: true }), 'Price');
  ok('replace: each found word replaced where it is, its emphasis carried onto what replaced it', r.blocks[0].text === 'Price rises. Price falls.' && J(r.blocks[0].marks) === J([{ s: 0, e: 5, t: 'b' }]) && r.blocks[1].text === 'rental market');
  const o = docOf([P('One', { id: 'h1', t: 'h1' }), P('a', { id: 'x' }), P('Sub', { id: 'h2', t: 'h2' }), P('b', { id: 'y' }), P('Two', { id: 'h1b', t: 'h1' }), P('c', { id: 'z' })]);
  ok('the outline: the headings, with their levels', J(W.outlineOf(o).map((i) => [i.level, i.text])) === J([[1, 'One'], [2, 'Sub'], [1, 'Two']]));
  ok('a section: a heading and everything under it to the next of its level', J(W.sectionOf(o, 'h1')) === J([0, 4]));
  const m = W.moveSection(o, 'h1b', -1);
  ok('  moved up past the section before it at its level — every block in both kept, in order', m.blocks.map((b) => b.id).join() === 'h1b,z,h1,x,h2,y', m.blocks.map((b) => b.id).join());
  ok('  nothing at its level before it: nothing moves', W.moveSection(o, 'h2', -1) === o);
}

console.log('\n=== storage: older documents as they were; newer ones bounded and checked ===');
{
  const old = { v: 2, title: 'Old', blocks: [{ id: 'b1', t: 'p', text: 'Plain', marks: [{ s: 0, e: 5, t: 'b' }] }], cards: [], groups: [], dismissed: [], versions: [], updatedAt: 5 };
  ok('a document saved before the word processor reads exactly as it was', J(W.sanitizeWriteDoc(old)) === J(old));
  const raw = {
    ...old,
    page: { size: 'a4', orient: 'landscape', m: [0.1, 1, 9, 1] },
    font: "Comic Sans'; color:red",
    size: 400,
    view: 'page',
    blocks: [
      { id: 'b1', t: 'p', text: 'Styled', align: 'center', ind: 20, lh: 9, sb: -4, marks: [{ s: 0, e: 6, t: 'a', v: 'javascript:alert(1)' }, { s: 0, e: 3, t: 'color', v: 'red' }, { s: 0, e: 6, t: 'size', v: '13' }, { s: 0, e: 6, t: 'font', v: 'Lato' }] },
      { id: 'img1', t: 'img', src: 'm:' + 'f'.repeat(32), alt: 'x'.repeat(400), w: 300, iw: 10, ih: 5, by: 'not-a-digest' },
      { id: 'img2', t: 'img', src: 'https://tracker.example/pixel.gif' },
      { id: 't1', t: 'table', head: true, cols: [1, 1, 2], rows: [[{ id: 'c1', text: 'A' }, { id: 'c1', text: 'B' }], [{ id: 'c3', text: 'C', marks: [{ s: 0, e: 1, t: 'b' }] }]] },
      { id: 't2', t: 'table', rows: [], text: 'words of a broken table' },
      { id: 'code', t: 'code', text: 'x = 1', marks: [{ s: 0, e: 1, t: 'b' }], align: 'center' },
      { id: 'pb', t: 'pb', text: 'should not be here' },
    ],
  };
  const s = W.sanitizeWriteDoc(raw);
  const b = s.blocks;
  ok('page setup bounded: a known paper, margins between a quarter inch and three', J(s.page) === J({ size: 'a4', orient: 'landscape', m: [0.25, 1, 3, 1] }) && s.view === 'page' && s.size === 36);
  ok('  a document font that is not a safe name is no font', s.font === undefined);
  ok('a paragraph’s settings bounded', b[0].align === 'center' && b[0].ind === 8 && b[0].lh === 3 && b[0].sb === 0);
  ok('  marks checked: no script link, no named colour that is not #rrggbb; a size and a font kept', J(b[0].marks.map((m) => m.t + '=' + m.v)) === J(['font=Lato', 'size=13']), J(b[0].marks));
  ok('a picture kept by its media id, its description and width bounded, a bad owner dropped', b[1].t === 'img' && b[1].alt.length === 300 && b[1].w === 100 && b[1].by === undefined);
  ok('  a picture at an address of its own (a tracking pixel) is not kept', !b.some((x) => x.id === 'img2'));
  const t = b.find((x) => x.id === 't1');
  ok('a table: ragged rows made square, a duplicate cell id renewed, its words recomputed', t.rows.every((r) => r.length === 2) && t.rows[0][0].id !== t.rows[0][1].id && t.text === 'A\tB\nC\t' && t.head === true && t.cols === undefined, J(t));
  ok('  a table with no rows keeps its words as a paragraph', b.find((x) => x.id === 't2')?.t === 'p' && b.find((x) => x.id === 't2').text === 'words of a broken table');
  ok('code keeps no marks and no alignment; a page break no words', b.find((x) => x.id === 'code').marks === undefined && b.find((x) => x.id === 'code').align === undefined && b.find((x) => x.id === 'pb').text === '');
  // the rollback: what the reader before the word processor keeps of a new document
  const oldReader = (doc) => doc.blocks.map((x) => ({ t: ['p', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol'].includes(x.t) ? x.t : 'p', text: x.text }));
  const kept = oldReader(s).map((x) => x.text).join('\n');
  ok('rollback: an older reader keeps every word — a table’s words travel in its text', kept.includes('Styled') && kept.includes('A\tB') && kept.includes('C') && kept.includes('x = 1'));
  ok('the stored draft keeps the new document whole', W.sanitizeStoredDraft({ title: 'x', html: '<p>x</p>', doc: s }).doc.blocks.length === s.blocks.length);
}

console.log('\n=== out: a web page, Markdown, plain text ===');
{
  const t = W.tableFrom([[P('Year'), P('Rent', { align: 'right' })], [P('2020'), P('1,200', { marks: [{ s: 0, e: 5, t: 'b' }] })]], { head: true, cols: [2, 1] });
  const img = W.makeImage({ src: 'm:' + 'a'.repeat(32), alt: 'A chart', w: 50, align: 'center' });
  const d = docOf(
    [
      P('A link, red words and Courier.', { marks: [{ s: 2, e: 6, t: 'a', v: 'https://example.org/x' }, { s: 8, e: 17, t: 'color', v: '#cc0000' }, { s: 22, e: 29, t: 'font', v: 'courier' }, { s: 18, e: 21, t: 's' }], align: 'justify' }),
      P('E=mc2', { marks: [{ s: 4, e: 5, t: 'sup' }] }),
      t,
      img,
      W.makeRule(),
      W.makePageBreak(),
      P('let x = 1;\n  x++', { t: 'code' }),
    ],
    { title: 'Out', page: { size: 'a4', orient: 'portrait', m: [1, 1, 1, 1] }, font: 'arial', size: 11 }
  );
  const html = W.toHtml(d, { standalone: true, src: () => 'data:image/png;base64,AAAA' });
  ok('the web page: links, colours, fonts, strikethrough, superscript, justified', html.includes('<a href="https://example.org/x" rel="noopener noreferrer">link</a>') && html.includes('color:#cc0000') && /font-family:'Courier New'/.test(html) && html.includes('<s>and</s>') && html.includes('<sup>2</sup>') && html.includes('text-align:justify'), html.slice(0, 800));
  ok('  a table with its header row and widths; a picture at its width; a line; a page break; code', html.includes('<thead><tr><th>Year</th><th style="text-align:right">Rent</th></tr></thead>') && html.includes('<col style="width:66.7%">') && html.includes('<img src="data:image/png;base64,AAAA" alt="A chart" style="width:50%">') && html.includes('<hr>') && html.includes('page-break-after:always') && html.includes('<pre><code>let x = 1;\n  x++</code></pre>'));
  ok('  set on its paper, in its own font and size', html.includes('@page{size:A4;margin:1in 1in 1in 1in}') && /font-family:Arial/.test(html) && html.includes('font-size:11pt'));
  const md = W.toMarkdown(d, { src: () => 'data:image/png;base64,AAAA' });
  ok('Markdown: a link’s words in one link, struck words in tildes, superscript as HTML', md.includes('[link](https://example.org/x)') && md.includes('~~and~~') && md.includes('E=mc<sup>2</sup>'), md);
  ok('  a table as a pipe table, its alignment kept; a picture; a line; a page break; fenced code', md.includes('| Year | Rent |\n| --- | ---: |\n| 2020 | **1,200** |') && md.includes('![A chart](data:image/png;base64,AAAA)') && md.includes('\n---\n') && md.includes('page-break-after: always') && md.includes('```\nlet x = 1;\n  x++\n```'), md);
  ok('  and without a picture’s bytes, its description', W.toMarkdown(docOf([img])).includes('*\\[Picture: A chart\\]*'));
  const txt = W.toText(d);
  ok('plain text: a table as tab-separated lines, a picture as its description, a page break as a form feed', txt.includes('Year\tRent\n2020\t1,200') && txt.includes('[Picture: A chart]') && txt.includes('\f'), J(txt));
  const back = W.markdownToBlocks(md, { images: true });
  ok('Markdown read back: the same blocks', back.map((b) => b.t).join() === 'h1,p,p,table,img,hr,pb,code', back.map((b) => b.t).join());
  ok('  the link, the table’s alignment and bold, the picture at its address, the code as written', back[1].marks.some((m) => m.t === 'a' && m.v === 'https://example.org/x') && back[3].rows[0][1].align === 'right' && back[3].rows[1][1].marks?.[0]?.t === 'b' && W.isLooseImage(back[4]) && back[7].text === 'let x = 1;\n  x++');
  const tb = W.textToBlocks(txt);
  ok('plain text read back: a form feed is a page break', tb.some((b) => b.t === 'pb'));
}

console.log('\n=== in: what a paste brings ===');
{
  const gdocs = `<b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="text-align:center;line-height:1.38;margin-top:0pt;margin-bottom:0pt"><span style="font-size:12pt;font-family:Arial;color:#000000;font-weight:400">Black twelve point Arial is the page’s own, </span><span style="font-size:14pt;color:#cc0000">red fourteen</span><span style="font-size:12pt"> and </span><a href="https://example.org/a"><span style="color:#1155cc;text-decoration:underline">a link</span></a></p></b>`;
  const g = W.htmlToBlocks(gdocs, { baseSize: 12 });
  ok('Google Docs: its black and its size on every word are no formatting; a real colour and size are', J(g[0].marks.map((m) => [m.t, m.v ?? '', g[0].text.slice(m.s, m.e)])) === J([['font', 'arial', 'Black twelve point Arial is the page’s own, '], ['color', '#cc0000', 'red fourteen'], ['size', '14', 'red fourteen'], ['a', 'https://example.org/a', 'a link']]), J(g[0].marks));
  ok('  a link’s own blue and underline are the link, not formatting; centred kept; its line height and zero margins ignored', g[0].align === 'center' && g[0].lh === undefined && g[0].sb === undefined);
  const word = `<p class=MsoNormal style='margin-left:.5in'>Indented by Word</p><p class=MsoNormal><span style='font-family:"Times New Roman"'>Times words</span></p><br clear=all style='page-break-before:always'><p class=MsoNormal>Next page</p>`;
  const w = W.htmlToBlocks(word);
  ok('Word: an indent, a font it names, a page break', w[0].ind === 1 && w[1].marks?.[0]?.v === 'times' && w[2].t === 'pb' && w[3].text === 'Next page', J(w));
  const table = `<table><thead><tr><th>Name</th><th colspan="2">Scores</th></tr></thead><tbody><tr><td>Ann</td><td>9</td><td>8</td></tr></tbody></table>`;
  const tt = W.htmlToBlocks(table)[0];
  ok('a table: its header row, a merged cell keeping its words in its first column', tt.t === 'table' && tt.head === true && J(tt.rows.map((r) => r.map((c) => c.text))) === J([['Name', 'Scores', ''], ['Ann', '9', '8']]), J(tt));
  const pics = W.htmlToBlocks('<p>Before</p><img src="data:image/png;base64,iVBORw0KGgo=" alt="dot" width="10" height="10"><img src="file:///C:/x.png"><p>After</p>', { images: true });
  ok('pictures: one at a data address comes in to be kept; one on someone’s disk does not', pics.map((b) => b.t).join() === 'p,img,p' && pics[1].alt === 'dot' && W.isLooseImage(pics[1]));
  ok('  without pictures asked for, none', !W.htmlToBlocks('<img src="data:image/png;base64,iVBORw0KGgo=">').some((b) => b.t === 'img'));
  ok('a page saved as HTML: its doctype is not words', !W.htmlToBlocks('<!doctype html><html><body><p>Hi</p></body></html>').some((b) => /doctype/i.test(b.text)));
  const md = W.markdownToBlocks('Title\n=====\n\nSub\n---\n\nSome ~~gone~~ and `code` and <https://example.org>.\n\n<!-- pagebreak -->\n\n```js\nconst a = 1;\n```');
  ok('Markdown: the other way to write headings, struck words, code as monospace, an address in angle brackets, a page break, a fenced block', J(md.map((b) => b.t)) === J(['h1', 'h2', 'p', 'pb', 'code']) && md[2].marks.some((m) => m.t === 's') && md[2].marks.some((m) => m.t === 'font' && m.v === 'mono') && md[2].marks.some((m) => m.t === 'a'), J(md.map((b) => [b.t, b.text, b.marks])));
}

console.log('\n=== pictures, by their own bytes ===');
{
  const p = png(30, 20);
  ok('a PNG known by its bytes, and its size read from its header', W.sniffImage(p) === 'image/png' && J(W.imageSize(p)) === J({ w: 30, h: 20 }));
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x08, 0x00, 0, 0, 0, 0]);
  ok('  a GIF too', W.sniffImage(gif) === 'image/gif' && J(W.imageSize(gif)) === J({ w: 16, h: 8 }));
  // a JPEG's frame header, after an EXIF block saying it was taken on its side
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0];
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, 0xff, 0xc0, 0, 17, 8, 0, 100, 0, 200, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  ok('  a JPEG: its size and colours from its frame, and that it was taken on its side', W.sniffImage(jpeg) === 'image/jpeg' && J(W.jpegInfo(jpeg)) === J({ w: 200, h: 100, comps: 3, progressive: false }) && W.jpegOrientation(jpeg) === 6);
  ok('something that only says it is a picture is not one', W.sniffImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>')) === null);
  const url = W.bytesToDataUrl(p, 'image/png');
  const back = W.dataUrlBytes(url);
  ok('bytes to a data address and back, exactly', back.type === 'image/png' && back.bytes.length === p.length && back.bytes.every((x, k) => x === p[k]));
  ok('a media id is 128 random bits', /^[a-f0-9]{32}$/.test(W.newMediaId()) && W.newMediaId() !== W.newMediaId() && W.mediaIdOf('m:' + 'a'.repeat(32)) === 'a'.repeat(32) && W.mediaIdOf('https://x') === null);
  const saved = { title: 'x', html: '', doc: { blocks: [{ t: 'p', text: 'm:' + 'f'.repeat(32) }, { t: 'img', src: 'm:' + 'a'.repeat(32) }, { t: 'img', src: 'https://x.org/y.png' }, null], versions: [{ blocks: [{ t: 'img', src: 'm:' + 'b'.repeat(32) }, { t: 'img', src: 'm:' + 'a'.repeat(32) }] }, 'junk'] } };
  ok('the pictures a saved draft points at — its writing and its versions, once each — read from whatever was saved', J(W.draftMediaIds(saved)) === J(['a'.repeat(32), 'b'.repeat(32)]) && J(W.draftMediaIds(null)) === '[]' && J(W.draftMediaIds({ html: '<p>old</p>' })) === '[]' && J(W.draftMediaIds({ doc: { blocks: 'nope' } })) === '[]');
}

// one document with everything, written out and read back by everything
const pic = png(120, 80);
const mid = '0123456789abcdef0123456789abcdef';
const everything = docOf(
  [
    P('Why rents rise', { t: 'h1' }),
    P('Bold, italic, underline, struck, red, highlighted, large, Courier, x2 and H2O, a link.', {
      marks: [
        { s: 0, e: 4, t: 'b' }, { s: 6, e: 12, t: 'i' }, { s: 14, e: 23, t: 'u' }, { s: 25, e: 31, t: 's' }, { s: 33, e: 36, t: 'color', v: '#c0392b' },
        { s: 38, e: 49, t: 'bg', v: '#ffff00' }, { s: 51, e: 56, t: 'size', v: '18' }, { s: 58, e: 65, t: 'font', v: 'courier' }, { s: 68, e: 69, t: 'sup' }, { s: 75, e: 76, t: 'sub' }, { s: 81, e: 85, t: 'a', v: 'https://example.org/city' },
      ],
      align: 'justify',
    }),
    P('Centred and double-spaced.', { align: 'center', lh: 2 }),
    P('Indented, with Greek: α, β, Δ, ≤ → ∞.', { ind: 1 }),
    P('Vacancy fell', { t: 'ul', lvl: 1 }),
    P('permits were down', { t: 'ul', lvl: 2 }),
    P('First', { t: 'ol', lvl: 1 }),
    P('A city that cannot house its workers will not keep them.', { t: 'quote' }),
    P('function rent(x) {\n  return x * 1.05;\n}', { t: 'code' }),
    W.makeRule(),
    W.tableFrom([[P('Year'), P('Rent', { align: 'right' })], [P('2020'), P('1,200', { align: 'right' })], [P('2024'), P('1,450', { align: 'right', marks: [{ s: 0, e: 5, t: 'b' }] })]], { head: true, cols: [2, 1] }),
    P('Below the table.'),
    W.makeImage({ src: 'm:' + mid, alt: 'A red swatch', iw: 120, ih: 80, w: 40, align: 'center' }),
    W.makePageBreak(),
    P('After the break.', { t: 'h2' }),
    P('Last words.'),
  ],
  { title: 'Rent, Rules & the City', page: { size: 'a4', orient: 'portrait', m: [1, 1.25, 1, 1.25] }, font: 'georgia', size: 11 }
);
const media = new Map([[mid, { bytes: pic, type: 'image/png', w: 120, h: 80 }]]);

console.log('\n=== Word: everything out, and back in ===');
{
  const bytes = W.toDocx(everything, new Date(Date.UTC(2026, 9, 24)), media);
  const parts = await W.unzipSome(bytes, () => true);
  const xml = new TextDecoder().decode(parts.get('word/document.xml'));
  const rels = new TextDecoder().decode(parts.get('word/_rels/document.xml.rels'));
  ok('the picture is in the file, with its relationship and its content type', parts.has('word/media/image1.png') && rels.includes('Target="media/image1.png"') && new TextDecoder().decode(parts.get('[Content_Types].xml')).includes('Extension="png"'));
  ok('  a link is a relationship outside the file', rels.includes('Target="https://example.org/city" TargetMode="External"') && /<w:hyperlink r:id="rIdL1" w:history="1">/.test(xml));
  ok('a run’s properties in the order Word requires (font, bold, italic, strike, colour, size, highlight, underline, shading, raise)', !/<w:rPr>(?:(?!<\/w:rPr>).)*<w:sz [^>]*>(?:(?!<\/w:rPr>).)*<w:color /.test(xml) && !/<w:rPr>(?:(?!<\/w:rPr>).)*<w:u [^>]*>(?:(?!<\/w:rPr>).)*<w:b\/>/.test(xml));
  ok('  a paragraph’s in its order too (style, numbering, border, spacing, indent, alignment)', !/<w:pPr>(?:(?!<\/w:pPr>).)*<w:jc [^>]*>(?:(?!<\/w:pPr>).)*<w:spacing /.test(xml));
  ok('the page: A4, its margins', xml.includes('<w:pgSz w:w="11906" w:h="16838"/>') && xml.includes('w:right="1800"') && xml.includes('w:left="1800"'));
  ok('  the document’s own font and size under everything', new TextDecoder().decode(parts.get('word/styles.xml')).includes('w:ascii="Georgia"') && new TextDecoder().decode(parts.get('word/styles.xml')).includes('<w:sz w:val="22"/>'));
  const r = await W.readDocx(bytes);
  const shape = r.blocks.map((b) => b.t);
  ok('read back: every block in its place', J(shape) === J(['h1', 'p', 'p', 'p', 'ul', 'ul', 'ol', 'quote', 'code', 'hr', 'table', 'p', 'img', 'pb', 'h2', 'p']), J(shape));
  const marks = (r.blocks[1].marks ?? []).map((m) => `${m.t}${m.v ? '=' + m.v : ''}[${m.s},${m.e}]`);
  const want = everything.blocks[1].marks.map((m) => `${m.t}${m.v ? '=' + m.v : ''}[${m.s},${m.e}]`);
  ok('  every mark, at its words — fonts, sizes, colours, highlight, link, superscript and subscript', want.every((m) => marks.includes(m)) && marks.length === want.length, J(marks) + ' vs ' + J(want));
  ok('  alignment, line spacing, indentation', r.blocks[1].align === 'justify' && r.blocks[2].align === 'center' && r.blocks[2].lh === 2 && r.blocks[3].ind === 1);
  const t = r.blocks[10];
  ok('  the table: its rows, header, widths, alignment and bold', J(t.rows.map((row) => row.map((c) => c.text))) === J([['Year', 'Rent'], ['2020', '1,200'], ['2024', '1,450']]) && t.head === true && J(t.cols) === J([0.6667, 0.3333]) && t.rows[2][1].align === 'right' && t.rows[2][1].marks?.[0]?.t === 'b', J(t));
  const img = r.blocks[12];
  ok('  the picture: its bytes, description, width and alignment', W.isLooseImage(img) && W.dataUrlBytes(img.src).bytes.length === pic.length && img.alt === 'A red swatch' && img.w === 40 && img.align === 'center');
  ok('  the quotation without its style’s italics as marks; the code as one block', !r.blocks[7].marks && r.blocks[8].text === 'function rent(x) {\n  return x * 1.05;\n}');
  ok('  the title, the page, the font and size', r.title === 'Rent, Rules & the City' && J(r.page) === J({ size: 'a4', orient: 'portrait', m: [1, 1.25, 1, 1.25] }) && r.font === 'georgia' && r.size === 11);
  if (has('soffice')) {
    const dir = mkdtempSync(join(tmpdir(), 'socria-rich-'));
    writeFileSync(join(dir, 'rich.docx'), bytes);
    const conv = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, join(dir, 'rich.docx')], { encoding: 'utf8', timeout: 120_000 });
    const pdf = join(dir, 'rich.pdf');
    let text = '';
    let info = '';
    if (existsSync(pdf) && has('pdftotext', '-v')) {
      text = spawnSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }).stdout;
      info = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' }).stdout;
    }
    ok('LibreOffice opens it: every word, two pages (the page break), A4', conv.status === 0 && text.includes('Why rents rise') && text.includes('1,450') && text.includes('After the break.') && /Pages:\s+2/.test(info) && /A4/.test(info), (conv.stderr || '') + info + text.slice(0, 300));
    rmSync(dir, { recursive: true, force: true });
  } else console.log('  (LibreOffice is not installed here — the Office check is skipped)');
  if (has('pandoc')) {
    const dir = mkdtempSync(join(tmpdir(), 'socria-pandoc-'));
    writeFileSync(join(dir, 'rich.docx'), bytes);
    const md = spawnSync('pandoc', [join(dir, 'rich.docx'), '-t', 'markdown'], { encoding: 'utf8' }).stdout;
    ok('pandoc reads its formatting: bold, strikethrough, highlight, superscript, the link, the table, the picture', md.includes('**Bold**') && md.includes('~~struck~~') && md.includes('{.mark}') && md.includes('x^2^') && md.includes('(https://example.org/city)') && md.includes('**1,450**') && md.includes('![A red swatch]'), md.slice(0, 900));
    rmSync(dir, { recursive: true, force: true });
  } else console.log('  (pandoc is not installed here — its check is skipped)');
}

console.log('\n=== PDF: made here, read back ===');
{
  const rgb = new Uint8Array(120 * 80 * 3).fill(180);
  const alpha = new Uint8Array(120 * 80).fill(255);
  const bytes = await W.toPdf(everything, { pictures: new Map([[mid, { kind: 'raw', rgb, alpha, w: 120, h: 80 }]]), when: new Date(Date.UTC(2026, 9, 24)) });
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 8));
  const body = new TextDecoder('latin1').decode(bytes);
  ok('a PDF: its header, an xref, its trailer', head === '%PDF-1.4' && body.includes('xref') && body.trimEnd().endsWith('%%EOF'));
  ok('  the standard fonts it uses, and Symbol for the Greek', /\/BaseFont \/Times-Roman/.test(body) && /\/BaseFont \/Symbol/.test(body) && /\/BaseFont \/Courier/.test(body));
  ok('  the picture, with its transparency as a mask; the link as a link', /\/Subtype \/Image/.test(body) && /\/SMask \d+ 0 R/.test(body) && body.includes('/URI (https://example.org/city)'));
  const { getDocumentProxy, extractText } = await import('unpdf');
  // verbosity 0: the reader warns that it has no copies of the standard fonts to draw with — it needs none to read the words
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  ok('read back by a PDF reader: two pages (the page break), every word', totalPages === 2 && text.includes('Rent, Rules & the City') && text.includes('Vacancy fell') && text.includes('1,450') && text.includes('After the break.') && text.includes('function rent(x) {'), `${totalPages} ${text.slice(0, 400)}`);
  ok('  the Greek letters and signs as themselves', /α/.test(text) && /β/.test(text) && /≤/.test(text) && /→/.test(text) && /∞/.test(text), text.slice(text.indexOf('Greek'), text.indexOf('Greek') + 60));
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  ok('  on A4', Math.round(vp.width) === 595 && Math.round(vp.height) === 842, `${vp.width}x${vp.height}`);
  if (has('pdftotext', '-v')) {
    const dir = mkdtempSync(join(tmpdir(), 'socria-pdf-'));
    writeFileSync(join(dir, 'x.pdf'), bytes);
    const out = spawnSync('pdftotext', ['-layout', join(dir, 'x.pdf'), '-'], { encoding: 'utf8' });
    ok('pdftotext reads it too, the table’s numbers in their columns', out.status === 0 && /2024\s+1,450/.test(out.stdout), out.stderr + out.stdout.slice(0, 300));
    rmSync(dir, { recursive: true, force: true });
  }
  const cjk = W.pdfCoverage(docOf([P('Rent 租金 is high')]));
  ok('characters the PDF’s fonts cannot show are named, not dropped in silence', !cjk.ok && J(cjk.missing) === J(['租', '金']) && W.pdfCoverage(everything).ok);
  const long = docOf(Array.from({ length: 140 }, (_, k) => P(`Paragraph ${k + 1}: ${'words that run on and on '.repeat(6)}`)));
  const lp = await getDocumentProxy(new Uint8Array(await W.toPdf(long)), { verbosity: 0 });
  ok('a long document runs onto as many pages as it needs', lp.numPages >= 8, lp.numPages);
}

console.log('\n=== the checks, Point & Ask, the switch ===');
{
  const t = W.tableFrom([[P('teh table')], [P('fine')]]);
  const issues = W.checkDoc(docOf([t, P('x = teh;', { t: 'code' })]));
  ok('the rules read a table’s cells — a slip in a cell is found on that cell', issues.length === 1 && issues[0].block === t.rows[0][0].id && issues[0].fix === 'the', J(issues));
  ok('  and leave code alone', !issues.some((i) => i.text === 'teh' && i.block !== t.rows[0][0].id));
  const head = W.tableFrom([[P('Year'), P('Rent')], [P('2020'), P('1,200')]], { head: true });
  const brief = W.describeWriting(docOf([head]), { kind: 'block', block: head.rows[1][1].id, s: 0, e: 5 });
  ok('Point & Ask on a cell: where it is in the table, under which heading, its words verbatim', /row 2, column 2, under “Rent”/.test(brief.lines[0]) && brief.lines[1].includes('“1,200”'), J(brief));
  ok('the switch: on unless a deployment sets it off', W.richWriting(undefined) && W.richWriting('') && !W.richWriting('off') && !W.richWriting(' OFF '));
}

console.log('\n=== opening files ===');
{
  const docx = new File([W.toDocx(everything, new Date(), media)], 'Rich.docx');
  const r = await W.importFile(docx);
  ok('a .docx opens with its page, font and size, and its picture to be kept', r.title === 'Rent, Rules & the City' && r.page?.size === 'a4' && r.font === 'georgia' && r.blocks.some(W.isLooseImage));
  const html = new File([W.toHtml(everything, { standalone: true, src: () => W.bytesToDataUrl(pic, 'image/png') })], 'Rich.html');
  const h = await W.importFile(html);
  ok('a web page Socria made opens with its title as the title, not a heading', h.title === 'Rent, Rules & the City' && h.blocks[0].t === 'h1' && h.blocks[0].text === 'Why rents rise' && h.blocks.some(W.isLooseImage), J(h.blocks.slice(0, 2)));
  const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'Paper.pdf');
  const read = await W.importFile(pdfFile, async () => ({ id: 'd1', name: 'Paper.pdf', title: 'A paper', format: 'pdf', blocks: [{ id: 'p1.1', kind: 'heading', level: 1, text: 'Intro', page: 1 }, { id: 'p1.2', kind: 'paragraph', text: 'Some words.', page: 1 }] }));
  ok('a PDF opens through the document reader, its headings and words — and says it holds no styles', read.title === 'A paper' && read.blocks.map((b) => b.t).join() === 'h1,p' && /PDF holds words placed on pages/.test(read.notes[0]));
  const settled = await W.settleImages([P('a'), { ...W.makeImage({ src: 'm:' + '0'.repeat(32) }), src: 'data:image/png;base64,AAAA' }, { ...W.makeImage({ src: 'm:' + '0'.repeat(32) }), src: 'https://x.org/y.png' }], async (src) => (src.startsWith('data:') ? { src: 'm:' + 'e'.repeat(32), iw: 3, ih: 2 } : null));
  ok('pictures at their own addresses kept before they join the writing; one that cannot be is counted', settled.blocks.length === 2 && settled.blocks[1].src === 'm:' + 'e'.repeat(32) && settled.dropped === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
