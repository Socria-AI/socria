// Reading attached files into text for Core 4.
//
// Every fixture is built here, in memory, the way the real formats are built:
// a .docx is a zip of XML, so the test writes a zip of XML. What is proved is
// that each format comes out as readable text in the right ORDER — slide 2
// before slide 10, columns where they belong — and that a hostile archive
// (one that inflates to far more than it weighs, one that is encrypted, one
// that carries a .env) is refused with a sentence, not a crash.

import { deflateRawSync, crc32 } from 'node:zlib';
import { extractFile, looksLikeText } from './.tmp/file-extract.mjs';
import { kindOfFile, refusalFor, MAX_FILE_TEXT } from './.tmp/file-kinds.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

/** A real zip: local headers, deflated data, a central directory. */
function zip(entries, { encrypt = [] } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content, method = 8] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const body = method === 8 ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name, 'utf8');
    const flags = encrypt.includes(name) ? 1 : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc32(data), 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc32(data), 16);
    ch.writeUInt32LE(body.length, 20);
    // The declared inflated size is a lie on purpose in the bomb test, so it
    // is written as whatever the caller would like the reader to believe.
    ch.writeUInt32LE(Math.min(data.length, 1000), 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** A one-page PDF with a text layer — or without one, for the scanned case. */
function pdf(lines) {
  const stream = lines.map((l, i) => `BT /F1 14 Tf 72 ${720 - i * 20} Td (${l}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const W = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`;
const P = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;

const docx = zip([
  ['[Content_Types].xml', '<Types/>'],
  [
    'word/document.xml',
    W(
      P('Why McCombs') +
        `<w:p><w:r><w:t>Funding</w:t></w:r><w:r><w:tab/><w:t>&amp; investors &lt;UTA&gt;</w:t></w:r></w:p>` +
        `<w:tbl><w:tr><w:tc>${P('School')}</w:tc><w:tc>${P('Startups')}</w:tc></w:tr>` +
        `<w:tr><w:tc>${P('McCombs')}</w:tc><w:tc>${P('Strong')}</w:tc></w:tr></w:tbl>` +
        P('The end.')
    ),
  ],
  ['word/footnotes.xml', W(P('A footnote about funding.'))],
]);

console.log('=== Word ===');
{
  const r = await extractFile('essay.docx', docx);
  const t = r.notes[0]?.text ?? '';
  ok('one note, named for the file', r.notes.length === 1 && r.notes[0].name === 'essay.docx');
  ok('paragraphs in order', t.indexOf('Why McCombs') < t.indexOf('The end.'), t);
  ok('tabs and entities decoded', t.includes('Funding\t& investors <UTA>'), JSON.stringify(t));
  ok('a table row reads as a row', t.includes('School | Startups') && t.includes('McCombs | Strong'), t);
  ok('footnotes come along', /Footnotes:\nA footnote about funding\./.test(t), t);
  ok('nothing skipped', r.skipped.length === 0, r.skipped.join('; '));
}

console.log('\n=== PowerPoint ===');
{
  const A = (t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`;
  const S = (b) => `<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${b}</p:spTree></p:cSld></p:sld>`;
  const pptx = zip([
    ['ppt/slides/slide10.xml', S(A('Tenth'))],
    ['ppt/slides/slide2.xml', S(A('Second') + A('two lines'))],
    ['ppt/slides/slide1.xml', S(A('First'))],
    ['ppt/notesSlides/notesSlide1.xml', S(A('Say this slowly'))],
  ]);
  const t = (await extractFile('deck.pptx', pptx)).notes[0]?.text ?? '';
  ok('slides in NUMERIC order, not string order', t.indexOf('First') < t.indexOf('Second') && t.indexOf('Second') < t.indexOf('Tenth'), t);
  ok('each slide is labelled', /Slide 1\nFirst/.test(t) && /Slide 3\nTenth/.test(t), t);
  ok('speaker notes are kept with their slide', /Slide 1\nFirst\nSpeaker notes: Say this slowly/.test(t), t);
}

console.log('\n=== Excel ===');
{
  const xlsx = zip([
    ['xl/workbook.xml', '<workbook><sheets><sheet name="Budget &amp; plan" sheetId="1"/></sheets></workbook>'],
    ['xl/sharedStrings.xml', '<sst><si><t>Item</t></si><si><t>Cost</t></si><si><r><t>Rent</t></r><r><t> (monthly)</t></r></si></sst>'],
    [
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>1450</v></c></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>Paid?</t></is></c><c r="B3" t="b"><v>1</v></c></row>' +
        '</sheetData></worksheet>',
    ],
  ]);
  const t = (await extractFile('budget.xlsx', xlsx)).notes[0]?.text ?? '';
  ok('sheet named from the workbook', t.startsWith('Sheet: Budget & plan'), t);
  ok('shared strings resolved, rich text joined', t.includes('Item\tCost') && t.includes('Rent (monthly)'), t);
  ok('a skipped column keeps its place', t.includes('Rent (monthly)\t\t1450'), JSON.stringify(t));
  ok('inline strings and booleans', t.includes('Paid?\tTRUE'), t);
}

console.log('\n=== PDF, OpenDocument, RTF ===');
{
  const r = await extractFile('paper.pdf', pdf(['McCombs has a strong startup scene.', 'UTA has less funding.']));
  const t = r.notes[0]?.text ?? '';
  ok('a PDF text layer is read', t.includes('McCombs has a strong startup scene.') && t.includes('UTA has less funding.'), JSON.stringify(r));
  const scanned = await extractFile('scan.pdf', pdf([]));
  ok('a PDF with no text says it looks scanned', scanned.notes.length === 0 && /looks scanned/.test(scanned.skipped[0] ?? ''), scanned.skipped.join(';'));

  const odt = zip([['content.xml', '<office:document-content><office:body><office:text><text:h>Title</text:h><text:p>One<text:tab/>two<text:s text:c="2"/>three</text:p></office:text></office:body></office:document-content>']]);
  const o = (await extractFile('notes.odt', odt)).notes[0]?.text ?? '';
  ok('OpenDocument text, with tabs and spaces', o === 'Title\nOne\ttwo  three', JSON.stringify(o));

  const r2 = await extractFile('letter.rtf', Buffer.from('{\\rtf1\\ansi{\\fonttbl\\f0\\fswiss Helvetica;}\\f0\\pard Dear team,\\par We caf\\\'e9 at nine.\\par}', 'latin1'));
  const rt = r2.notes[0]?.text ?? '';
  ok('RTF control words stripped, text and breaks kept', rt.includes('Dear team,') && rt.includes('We café at nine.') && !rt.includes('\\'), JSON.stringify(rt));
}

console.log('\n=== a zip of a project ===');
{
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const archive = zip([
    ['project/README.md', '# Plan\nShip the beta.'],
    ['project/docs/essay.docx', docx, 0],
    ['project/src/app.py', 'print("hi")'],
    ['project/diagram.png', png],
    ['project/.env', 'OPENAI_API_KEY=sk-live-secret'],
    ['project/keys/id_rsa', '-----BEGIN PRIVATE KEY-----'],
    ['__MACOSX/project/._README.md', 'junk'],
    ['project/node_modules/x/index.js', 'junk'],
    ['project/inner.zip', zip([['a.txt', 'nested']])],
    ['project/blob.bin', Buffer.from([0, 1, 2, 3, 0, 0, 255])],
  ]);
  const r = await extractFile('project.zip', archive);
  const t = r.notes[0]?.text ?? '';
  ok('one note for the whole archive', r.notes.length === 1 && r.notes[0].name === 'project.zip');
  ok('it says what it read', /^Archive project\.zip: 3 files read, 1 image attached separately\./.test(t), t.split('\n')[0]);
  ok('each file headed by its path', t.includes('--- project/README.md ---\n# Plan') && t.includes('--- project/src/app.py ---'), t);
  ok('an Office file inside is read, not dumped as XML', t.includes('--- project/docs/essay.docx ---\nWhy McCombs') && !t.includes('<w:'), t);
  ok('the image comes back to be read', r.images.length === 1 && r.images[0].name === 'diagram.png' && r.images[0].dataUrl.startsWith('data:image/png;base64,'));
  ok('.env is NEVER read', !t.includes('sk-live-secret') && r.skipped.some((s) => s.startsWith('project/.env')), r.skipped.join('; '));
  ok('nor a private key', !t.includes('PRIVATE KEY') && r.skipped.some((s) => s.startsWith('project/keys/id_rsa')));
  ok('macOS and node_modules junk ignored silently', !t.includes('junk') && !r.skipped.some((s) => /MACOSX|node_modules/.test(s)));
  ok('a zip inside a zip is named, not opened', !t.includes('nested') && r.skipped.some((s) => s.startsWith('project/inner.zip')));
  ok('a binary file is named, not dumped', r.skipped.some((s) => s.startsWith('project/blob.bin')));
}

console.log('\n=== hostile archives ===');
{
  // 200 MB of zeros deflates to about 200 KB. The directory claims 1000 bytes.
  const bomb = zip([['huge.txt', Buffer.alloc(200 * 1024 * 1024)], ['ok.txt', 'still read']]);
  const before = process.memoryUsage().rss;
  const r = await extractFile('bomb.zip', bomb);
  const grew = (process.memoryUsage().rss - before) / 1024 / 1024;
  ok('a zip bomb is refused with a reason', r.skipped.some((s) => /huge\.txt \(it inflates to more than Socria will read\)/.test(s)), r.skipped.join('; '));
  ok('without inflating it', grew < 120, `${grew.toFixed(0)} MB`);
  ok('and the rest of the archive is still read', (r.notes[0]?.text ?? '').includes('still read'));

  const locked = await extractFile('locked.zip', zip([['secret.txt', 'hidden']], { encrypt: ['secret.txt'] }));
  ok('an encrypted entry says so', locked.skipped.some((s) => /password-protected/.test(s)) && !locked.notes.length, locked.skipped.join('; '));

  const notZip = await extractFile('broken.zip', Buffer.from('not an archive'));
  ok('a broken zip is a sentence, not a throw', /broken\.zip could not be opened: not a zip file/.test(notZip.skipped[0] ?? ''), notZip.skipped.join(';'));
  const junk = await extractFile('broken.docx', Buffer.from('this is not a zip at all, just bytes pretending'));
  ok('a broken Office file is a sentence, not a crash', /broken\.docx could not be read: not a zip file/.test(junk.skipped[0] ?? ''), junk.skipped.join(';'));
}

console.log('\n=== limits and refusals ===');
{
  const big = await extractFile('long.docx', zip([['word/document.xml', W(P('word '.repeat(20_000)))]]));
  ok('a very long document is cut at the ceiling and says so', big.notes[0].text.length === MAX_FILE_TEXT && big.notes[0].truncated === true);
  ok('an old .doc is told what to do', /Save it as \.docx/.test((await extractFile('old.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).skipped[0] ?? ''));
  ok('a top-level .env is refused outright', /secrets file/.test((await extractFile('.env', Buffer.from('A=1'))).skipped[0] ?? ''));
  ok('HEIC gets advice', /Export it as JPEG/.test(refusalFor('IMG_0001.HEIC')));
  ok('unknown text-ish files are still read', (await extractFile('notes.weird', Buffer.from('plain words here'))).notes[0]?.text === 'plain words here');
  ok('binary sniffing', looksLikeText(Buffer.from('hello\nworld')) && !looksLikeText(Buffer.from([0, 1, 2])));
  ok('kinds', kindOfFile('a.PDF') === 'document' && kindOfFile('a.tsx') === 'text' && kindOfFile('a.jpeg') === 'image' && kindOfFile('.env.local') === 'secret' && kindOfFile('a.exe') === 'unsupported');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
