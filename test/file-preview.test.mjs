// Native file preview: an uploaded file opened as ITSELF, not as the text Socria read from it.
//
// The preview and the reading are two different things on purpose. The reading
// (lib/docs) keeps stored values and plain text for reasoning; the preview opens the
// original again and draws it as the application that made it would: a workbook's
// grid with its number formats, a deck's slides with every shape where it sits.
// These fixtures are Office files written by hand (test/helpers/office-writer.mjs),
// so what each should look like is known exactly.

import { xlsx, pptx, zip } from './helpers/office-writer.mjs';
import { png } from './helpers/png.mjs';
import * as P from './.tmp/preview-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== numbers as the spreadsheet shows them ===');
{
  const f = (v, code) => P.formatCell(String(v), code).text;
  ok('#,##0.00', f(1234.5, '#,##0.00') === '1,234.50', f(1234.5, '#,##0.00'));
  ok('0%', f(0.125, '0%') === '13%', f(0.125, '0%'));
  ok('0.00%', f(0.125, '0.00%') === '12.50%');
  ok('currency', f(1234.5, '"$"#,##0.00') === '$1,234.50', f(1234.5, '"$"#,##0.00'));
  ok('£ in brackets', f(1234.5, '[$£-809]#,##0') === '£1,235', f(1234.5, '[$£-809]#,##0'));
  ok('negative in brackets and red', (() => { const s = P.formatCell('-50', '#,##0_);[Red](#,##0)'); return s.text === '(50)' && s.color; })(), JSON.stringify(P.formatCell('-50', '#,##0_);[Red](#,##0)')));
  ok('scientific', f(123456, '0.00E+00') === '1.23E+05', f(123456, '0.00E+00'));
  ok('a date', f(45358, 'd mmm yyyy') === '7 Mar 2024', f(45358, 'd mmm yyyy'));
  ok('built-in 14', f(45358, P.BUILTIN_FORMATS[14]) === '3/7/2024', f(45358, P.BUILTIN_FORMATS[14]));
  ok('a time', f(0.5625, 'h:mm AM/PM') === '1:30 PM', f(0.5625, 'h:mm AM/PM'));
  ok('minutes, not months, after hours', f(0.5625, 'hh:mm') === '13:30');
  ok('General', f(0.1 + 0.2, 'General') === '0.3' && f(1234567, 'General') === '1234567');
  ok('zero section', f(0, '#,##0;(#,##0);"-"') === '-');
  ok('text through @', P.formatCell('abc', '@').text === 'abc');
}

console.log('\n=== a workbook drawn as its grid ===');
{
  const file = xlsx({
    sheets: [
      { name: 'Budget', rows: [[{ v: 'Item', b: true }, { v: 'Cost', b: true }, { v: 'Share', b: true }], ['Rent', { v: 1200, fmt: 'money' }, { v: 0.4, fmt: 'pct' }], ['Food', { v: 450.5, fmt: 'money' }, { v: 0.15, fmt: 'pct' }], ['When', { v: 45358, fmt: 'date' }, true]], merges: ['A6:C6'] },
      { name: 'Hidden', state: 'hidden', rows: [['x']] },
    ],
  });
  const wb = await P.readWorkbook(file);
  ok('both sheets, in order, the hidden one marked', wb.sheets.length === 2 && wb.sheets[0].name === 'Budget' && wb.sheets[1].hidden === true, JSON.stringify(wb.sheets.map((s) => [s.name, s.hidden])));
  const s = wb.sheets[0];
  ok('a heading cell is bold', s.cells[0][0].text === 'Item' && s.cells[0][0].style?.b === true, JSON.stringify(s.cells[0][0]));
  ok('money as money', s.cells[1][1].text === '$1,200.00' && s.cells[1][1].num, JSON.stringify(s.cells[1][1]));
  ok('a share as a percentage', s.cells[1][2].text === '40.00%', JSON.stringify(s.cells[1][2]));
  ok('a date as a date', s.cells[3][1].text === '3/7/2024', JSON.stringify(s.cells[3][1]));
  ok('a boolean as TRUE', s.cells[3][2].text === 'TRUE');
  ok('a merge kept', s.merges.some((m) => m.r === 5 && m.c === 0 && m.cols === 3), JSON.stringify(s.merges));
  ok('rows reach the merge', s.rows >= 6);
  ok('widths and heights for every column and row', s.colWidths.length === s.cols && s.rowHeights.length === s.rows && s.colWidths.every((w) => w > 0));
  ok('refToRC', JSON.stringify(P.refToRC('AB12')) === JSON.stringify([11, 27]) && P.colName(27) === 'AB');
}

console.log('\n=== a large sheet is drawn up to its limit, and says so ===');
{
  const rows = Array.from({ length: P.MAX_ROWS + 50 }, (_, i) => [i, `r${i}`]);
  const wb = await P.readWorkbook(xlsx({ sheets: [{ name: 'Big', rows }] }));
  const s = wb.sheets[0];
  ok('rows capped', s.rows === P.MAX_ROWS, s.rows);
  ok('the full size reported', s.cut && s.cut.rows === P.MAX_ROWS + 50, JSON.stringify(s.cut));
}

console.log('\n=== a damaged workbook says so ===');
{
  let msg = '';
  try {
    await P.readWorkbook(new Uint8Array([1, 2, 3, 4, 5]));
  } catch (e) {
    msg = e.message;
  }
  ok('a sentence, not a stack', /damaged|not the kind of file/i.test(msg), msg);
  let msg2 = '';
  try {
    await P.readWorkbook(zip([['hello.txt', 'hi']]));
  } catch (e) {
    msg2 = e.message;
  }
  ok('a zip that is not a workbook', /no sheets/i.test(msg2), msg2);
}

console.log('\n=== CSV and TSV as a sheet ===');
{
  ok('quoted fields, doubled quotes, newlines inside', JSON.stringify(P.parseDelimited('a,"b, c","say ""hi"""\n1,"two\nlines",3')) === JSON.stringify([['a', 'b, c', 'say "hi"'], ['1', 'two\nlines', '3']]));
  ok('semicolons detected', P.delimiterOf('x.csv', 'a;b;c\n1;2;3') === ';');
  ok('tabs by name', P.delimiterOf('x.tsv', 'a,b\tc') === '\t');
  const wb = P.delimitedSheet('prices.csv', 'Item,Price\nTea,2.50\nCake,3\n');
  const s = wb.sheets[0];
  ok('one sheet named for the file', s.name === 'prices');
  ok('the header row bold and frozen', s.cells[0][0].style?.b === true && s.frozen?.rows === 1);
  ok('numbers marked as numbers', s.cells[1][1].num === true && !s.cells[1][0].num);
}

console.log('\n=== a deck drawn as its slides ===');
{
  const image = png(4, 3);
  const deck = await P.readDeck(
    zip([
      ...(await unzipEntries(
        pptx({
          slides: [
            { shapes: [{ ph: 'title', text: 'Quarterly review' }, { ph: 'body', idx: 1, text: [{ t: 'Revenue up', bullet: true }, { t: 'Costs flat', lvl: 1 }] }], notes: 'Say hello first.' },
            { shapes: [{ table: [['Region', 'Sales'], ['North', '12'], ['South', '9']], x: 914400, y: 914400, w: 6000000, h: 1500000, firstRow: true }, { picture: '../media/image1.png', x: 100, y: 200, w: 914400, h: 685800, alt: 'A chart' }] },
            { hidden: true, shapes: [{ text: 'Spare', x: 0, y: 0, w: 914400, h: 457200 }] },
          ],
        })
      )),
      ['ppt/media/image1.png', image],
    ])
  );
  ok('three slides at the deck size', deck.slides.length === 3 && deck.width === 12192000 && deck.height === 6858000);
  const [one, two, three] = deck.slides;
  const title = one.shapes.find((s) => s.text?.paras[0]?.runs[0]?.t === 'Quarterly review');
  ok('the title placeholder takes its position from the layout', title && title.x === 838200 && title.y === 365125 && title.w === 10515600, JSON.stringify(title && [title.x, title.y, title.w]));
  const body = one.shapes.find((s) => s.text?.paras.some((p) => p.runs.some((r) => r.t === 'Revenue up')));
  ok('the body placeholder by its index', body && body.y === 1825625, JSON.stringify(body && [body.x, body.y]));
  ok('a bullet kept', body?.text.paras[0].bullet === '•', JSON.stringify(body?.text.paras[0]));
  ok('a nested level kept', body?.text.paras[1].level === 1);
  ok('speaker notes read', one.notes === 'Say hello first.', one.notes);
  const table = two.shapes.find((s) => s.kind === 'table');
  ok('a table with its rows and columns', table && table.table.rows.length === 3 && table.table.cols.length === 2, JSON.stringify(table?.table?.rows?.length));
  ok('its heading row filled and bold', table?.table.rows[0].cells[0].fill && table.table.rows[0].cells[0].text.paras[0].runs[0].b === true);
  const pic = two.shapes.find((s) => s.kind === 'picture');
  ok('a picture points at its media part', pic && pic.image === 'ppt/media/image1.png' && pic.mime === 'image/png', JSON.stringify(pic));
  ok('a hidden slide marked', three.hidden === true);
  ok('px', P.px(9525) === 1);
}

console.log('\n=== groups, theme colours and geometry ===');
{
  const NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const rels = (rs) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rs.map(([id, t, tg]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${t}" Target="${tg}"/>`).join('')}</Relationships>`;
  const theme = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="x"><a:dk1><a:srgbClr val="111111"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="222222"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="FF0000"/></a:accent1></a:clrScheme></a:themeElements></a:theme>`;
  const slide = `<p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:grpSp><p:grpSpPr><a:xfrm><a:off x="1000" y="2000"/><a:ext cx="2000" cy="2000"/><a:chOff x="0" y="0"/><a:chExt cx="1000" cy="1000"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="5" name="Oval"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="500" cy="500"/></a:xfrm><a:prstGeom prst="ellipse"/><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></p:spPr></p:sp></p:grpSp></p:spTree></p:cSld></p:sld>`;
  const master = `<p:sldMaster ${NS}><p:cSld><p:spTree/></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"/></p:sldMaster>`;
  const layout = `<p:sldLayout ${NS}><p:cSld><p:spTree/></p:cSld></p:sldLayout>`;
  const file = zip([
    ['ppt/presentation.xml', `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', rels([['rId1', 'slide', 'slides/slide1.xml']])],
    ['ppt/slides/slide1.xml', slide],
    ['ppt/slides/_rels/slide1.xml.rels', rels([['rIdL', 'slideLayout', '../slideLayouts/slideLayout1.xml']])],
    ['ppt/slideLayouts/slideLayout1.xml', layout],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rIdM', 'slideMaster', '../slideMasters/slideMaster1.xml']])],
    ['ppt/slideMasters/slideMaster1.xml', master],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rIdT', 'theme', '../theme/theme1.xml']])],
    ['ppt/theme/theme1.xml', theme],
  ]);
  const d = await P.readDeck(file);
  const s = d.slides[0];
  ok('a 4:3 deck', d.width === 9144000);
  ok('background from the theme accent', s.bg?.color === '#FF0000', JSON.stringify(s.bg));
  const oval = s.shapes[0];
  ok('a shape inside a group placed through the group', oval && oval.x === 1200 && oval.y === 2200 && oval.w === 1000 && oval.h === 1000, JSON.stringify(oval));
  ok('its geometry and theme fill through the colour map', oval?.geom === 'ellipse' && oval.fill === '#111111', JSON.stringify(oval));
  ok('lum: lumMod/lumOff', P.lum('#FF0000', 0.5, 0) === '#800000', P.lum('#FF0000', 0.5, 0));
  ok('resolveTarget', P.resolveTarget('ppt/slides/slide1.xml', '../media/a.png') === 'ppt/media/a.png');
}

/** The entries of a zip the fixture writer made, for adding a part to it. */
async function unzipEntries(buf) {
  const pkg = await P.openPackage(buf);
  const out = [];
  for (const p of pkg.paths()) out.push([p, Buffer.from(await pkg.bytes(p))]);
  return out;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
