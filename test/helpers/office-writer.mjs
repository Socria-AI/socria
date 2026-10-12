// Office files written by hand, for fixtures whose contents are known exactly.
//
// A .docx, .xlsx or .pptx is a zip of XML parts. The suites build them here
// from XML they write themselves, so every benchmark document has a ground
// truth: what it says is what the test put in it, character for character.

import { crc32, deflateRawSync } from 'node:zlib';

/** A real zip: local headers, deflated data, a central directory. */
export function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content, method = 8] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const body = method === 8 ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
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
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc32(data), 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
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

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"';

const rels = (list) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map(([id, type, target, ext]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${esc(target)}"${ext ? ' TargetMode="External"' : ''}/>`)
    .join('')}</Relationships>`;

// ── Word ────────────────────────────────────────────────────────────

/** A run of text: { t, b, i, sup, sub, font, size, vanish } or a string. */
export function wr(x) {
  const o = typeof x === 'string' ? { t: x } : x;
  const pr = [o.style ? `<w:rStyle w:val="${o.style}"/>` : '', o.font ? `<w:rFonts w:ascii="${esc(o.font)}" w:hAnsi="${esc(o.font)}"/>` : '', o.b ? '<w:b/>' : '', o.i ? '<w:i/>' : '', o.vanish ? '<w:vanish/>' : '', o.size ? `<w:sz w:val="${o.size}"/>` : '', o.sup ? '<w:vertAlign w:val="superscript"/>' : o.sub ? '<w:vertAlign w:val="subscript"/>' : ''].join('');
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${o.inner ?? ''}${o.t !== undefined ? `<w:t xml:space="preserve">${esc(o.t)}</w:t>` : ''}</w:r>`;
}

/** A paragraph: runs (strings, run objects or raw XML starting with "<"), with a style, list numbering, breaks. */
export function wp(runs, o = {}) {
  const ppr = [o.style ? `<w:pStyle w:val="${o.style}"/>` : '', o.pageBreakBefore ? '<w:pageBreakBefore/>' : '', o.num ? `<w:numPr><w:ilvl w:val="${o.num.ilvl ?? 0}"/><w:numId w:val="${o.num.id}"/></w:numPr>` : '', o.outline !== undefined ? `<w:outlineLvl w:val="${o.outline}"/>` : '', o.sect ? `<w:sectPr><w:type w:val="${o.sect}"/></w:sectPr>` : ''].join('');
  const body = (Array.isArray(runs) ? runs : [runs]).map((r) => (typeof r === 'string' && r.startsWith('<') ? r : wr(r))).join('');
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${body}</w:p>`;
}

/** A table: rows of cells; a cell is text, or { t, span, vmerge: 'restart'|'continue', p: [paragraph XML] }. */
export function wtbl(rows, o = {}) {
  const grid = Math.max(...rows.map((r) => r.reduce((n, c) => n + (typeof c === 'object' && c?.span ? c.span : 1), 0)));
  return `<w:tbl><w:tblPr>${o.caption ? `<w:tblCaption w:val="${esc(o.caption)}"/>` : ''}</w:tblPr><w:tblGrid>${'<w:gridCol/>'.repeat(grid)}</w:tblGrid>${rows
    .map(
      (r, i) =>
        `<w:tr>${i < (o.headerRows ?? 0) ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${r
          .map((c) => {
            const cell = typeof c === 'object' && c !== null ? c : { t: c };
            const pr = [cell.span ? `<w:gridSpan w:val="${cell.span}"/>` : '', cell.vmerge ? `<w:vMerge${cell.vmerge === 'restart' ? ' w:val="restart"' : ''}/>` : ''].join('');
            const content = cell.p ? cell.p.join('') : wp(cell.t === undefined || cell.t === '' ? [] : [{ t: String(cell.t), b: cell.b ?? (i < (o.boldRows ?? 0)) }]);
            return `<w:tc>${pr ? `<w:tcPr>${pr}</w:tcPr>` : ''}${content}</w:tc>`;
          })
          .join('')}</w:tr>`
    )
    .join('')}</w:tbl>`;
}

const STYLES_W = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS_W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="berschrift3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="MyHeading"><w:name w:val="My Heading"/><w:basedOn w:val="Heading2"/></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
</w:styles>`;

const NUMBERING_W = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS_W}>
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl><w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%1.%2.%3"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#xF0B7;"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
<w:num w:numId="3"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
</w:numbering>`;

/**
 * A .docx. `body` is the XML inside w:body. Optional parts: footnotes
 * (id → paragraph XML), endnotes, comments ({ id, author, text }), charts
 * (name → chart XML), diagrams, media (name → bytes), headers/footers (XML
 * inside w:hdr / w:ftr), extra rels, title, embeddings (name → bytes).
 */
export function docx({ body, footnotes = {}, endnotes = {}, comments = [], charts = {}, diagrams = {}, media = {}, header, footer, rels: extraRels = [], title, embeddings = {}, sectPr = '' }) {
  const docRels = [
    ['rIdStyles', 'styles', 'styles.xml'],
    ['rIdNumbering', 'numbering', 'numbering.xml'],
    ...(Object.keys(footnotes).length ? [['rIdFoot', 'footnotes', 'footnotes.xml']] : []),
    ...(Object.keys(endnotes).length ? [['rIdEnd', 'endnotes', 'endnotes.xml']] : []),
    ...(comments.length ? [['rIdComments', 'comments', 'comments.xml']] : []),
    ...Object.keys(charts).map((n) => [`rId_${n}`, 'chart', `charts/${n}.xml`]),
    ...Object.keys(diagrams).map((n) => [`rId_${n}`, 'diagramData', `diagrams/${n}.xml`]),
    ...Object.keys(media).map((n) => [`rId_${n.replace(/\W/g, '_')}`, 'image', `media/${n}`]),
    ...Object.keys(embeddings).map((n) => [`rId_${n.replace(/\W/g, '_')}`, 'package', `embeddings/${n}`]),
    ...(header ? [['rIdHeader1', 'header', 'header1.xml']] : []),
    ...(footer ? [['rIdFooter1', 'footer', 'footer1.xml']] : []),
    ...extraRels,
  ];
  const finalSect = `<w:sectPr>${header ? '<w:headerReference w:type="default" r:id="rIdHeader1"/>' : ''}${footer ? '<w:footerReference w:type="default" r:id="rIdFooter1"/>' : ''}${sectPr}</w:sectPr>`;
  const entries = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['_rels/.rels', rels([['rId1', 'officeDocument', 'word/document.xml']])],
    ['word/_rels/document.xml.rels', rels(docRels)],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS_W}><w:body>${body}${finalSect}</w:body></w:document>`],
    ['word/styles.xml', STYLES_W],
    ['word/numbering.xml', NUMBERING_W],
  ];
  const sep = '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>';
  if (Object.keys(footnotes).length)
    entries.push(['word/footnotes.xml', `<?xml version="1.0" encoding="UTF-8"?><w:footnotes ${NS_W}>${sep}${Object.entries(footnotes).map(([id, xml]) => `<w:footnote w:id="${id}">${xml}</w:footnote>`).join('')}</w:footnotes>`]);
  if (Object.keys(endnotes).length)
    entries.push(['word/endnotes.xml', `<?xml version="1.0" encoding="UTF-8"?><w:endnotes ${NS_W}>${sep.replace(/footnote/g, 'endnote')}${Object.entries(endnotes).map(([id, xml]) => `<w:endnote w:id="${id}">${xml}</w:endnote>`).join('')}</w:endnotes>`]);
  if (comments.length)
    entries.push(['word/comments.xml', `<?xml version="1.0" encoding="UTF-8"?><w:comments ${NS_W}>${comments.map((c) => `<w:comment w:id="${c.id}" w:author="${esc(c.author)}">${wp([{ inner: '<w:annotationRef/>' }, c.text])}</w:comment>`).join('')}</w:comments>`]);
  for (const [n, xml] of Object.entries(charts)) entries.push([`word/charts/${n}.xml`, xml]);
  for (const [n, xml] of Object.entries(diagrams)) entries.push([`word/diagrams/${n}.xml`, xml]);
  for (const [n, bytes] of Object.entries(media)) entries.push([`word/media/${n}`, bytes, 0]);
  for (const [n, bytes] of Object.entries(embeddings)) entries.push([`word/embeddings/${n}`, bytes, 0]);
  if (header) entries.push(['word/header1.xml', `<?xml version="1.0" encoding="UTF-8"?><w:hdr ${NS_W}>${header}</w:hdr>`]);
  if (footer) entries.push(['word/footer1.xml', `<?xml version="1.0" encoding="UTF-8"?><w:ftr ${NS_W}>${footer}</w:ftr>`]);
  if (title) entries.push(['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`]);
  return zip(entries);
}

/** An inline picture with alt text, pointing at a media rel. */
export const wpicture = (relId, { alt = '', title = '', id = 1, decorative = false } = {}) =>
  `<w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="952500"/><wp:docPr id="${id}" name="Picture ${id}"${alt ? ` descr="${esc(alt)}"` : ''}${title ? ` title="${esc(title)}"` : ''}>${decorative ? '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>' : ''}</wp:docPr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="img"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

/** An inline chart pointing at a chart rel. */
export const wchart = (relId, { alt = '', id = 2 } = {}) =>
  `<w:r><w:drawing><wp:inline><wp:extent cx="5486400" cy="3200400"/><wp:docPr id="${id}" name="Chart ${id}"${alt ? ` descr="${esc(alt)}"` : ''}/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="${relId}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

/** A floating text box, in both forms Word writes (the modern shape and its VML fallback). */
export const wtextbox = (paragraphs, id = 3) =>
  `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><wp:extent cx="1828800" cy="914400"/><wp:docPr id="${id}" name="Text Box ${id}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:txbx><w:txbxContent>${paragraphs.join('')}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent>${paragraphs.join('')}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;

/** A chart part: { kind: 'bar'|'line'|'pie'|'scatter', dir: 'col'|'bar', title, catTitle, valTitle, categories, series: [{ name, values, format }], dateFormat } */
export function chartXml({ kind = 'bar', dir = 'col', title, catTitle, valTitle, categories = [], series = [], catFormat, xs }) {
  const tx = (t) => (t ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx></c:title>` : '');
  const strCache = (vals) => `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
  const numCache = (vals, fmt = 'General') => `<c:numCache><c:formatCode>${esc(fmt)}</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache>`;
  const plot = kind === 'bar' ? 'c:barChart' : kind === 'line' ? 'c:lineChart' : kind === 'pie' ? 'c:pieChart' : 'c:scatterChart';
  const sers = series
    .map(
      (s, i) =>
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${s.name !== undefined ? `<c:tx><c:strRef><c:f>Sheet1!$${String.fromCharCode(66 + i)}$1</c:f>${strCache([s.name])}</c:strRef></c:tx>` : ''}${
          kind === 'scatter'
            ? `<c:xVal><c:numRef><c:f>Sheet1!$A$2</c:f>${numCache(s.xs ?? xs ?? [])}</c:numRef></c:xVal><c:yVal><c:numRef><c:f>x</c:f>${numCache(s.values, s.format)}</c:numRef></c:yVal>`
            : `<c:cat>${catFormat ? `<c:numRef><c:f>Sheet1!$A$2</c:f>${numCache(categories, catFormat)}</c:numRef>` : `<c:strRef><c:f>Sheet1!$A$2</c:f>${strCache(categories)}</c:strRef>`}</c:cat><c:val><c:numRef><c:f>x</c:f>${numCache(s.values, s.format)}</c:numRef></c:val>`
        }</c:ser>`
    )
    .join('');
  const axes = kind === 'pie' ? '' : kind === 'scatter' ? `<c:valAx><c:axId val="1"/><c:axPos val="b"/>${tx(catTitle)}</c:valAx><c:valAx><c:axId val="2"/><c:axPos val="l"/>${tx(valTitle)}</c:valAx>` : `<c:catAx><c:axId val="1"/><c:axPos val="b"/>${tx(catTitle)}</c:catAx><c:valAx><c:axId val="2"/><c:axPos val="l"/>${tx(valTitle)}</c:valAx>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart>${tx(title)}<c:plotArea><c:layout/><${plot}>${kind === 'bar' ? `<c:barDir val="${dir}"/>` : ''}${sers}</${plot}>${axes}</c:plotArea></c:chart></c:chartSpace>`;
}

// ── Excel ───────────────────────────────────────────────────────────

/**
 * A .xlsx. sheets: [{ name, rows: [[cell…]…], state, merges, comments: [{ ref, author, text }] }],
 * a cell: string | number | boolean | null | { v, f (formula), fmt: 'pct'|'date'|'money', b (bold) }.
 */
export function xlsx({ sheets, title, date1904 = false, oleSize }) {
  const shared = [];
  const sharedIx = new Map();
  const si = (s) => {
    if (!sharedIx.has(s)) {
      sharedIx.set(s, shared.length);
      shared.push(s);
    }
    return sharedIx.get(s);
  };
  // styles: 0 general, 1 percent (10 = 0.00%), 2 date (14), 3 money (custom 164), 4 bold, 5 bold percent
  const styleOf = (c) => (c?.b && c?.fmt === 'pct' ? 5 : c?.b ? 4 : c?.fmt === 'pct' ? 1 : c?.fmt === 'date' ? 2 : c?.fmt === 'money' ? 3 : 0);
  const col = (i) => {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const entries = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['_rels/.rels', rels([['rId1', 'officeDocument', 'xl/workbook.xml']])],
  ];
  const wbRels = [];
  sheets.forEach((s, i) => {
    wbRels.push([`rIdS${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]);
    const rowsXml = (s.rows ?? [])
      .map((r, ri) =>
        r === null
          ? ''
          : `<row r="${ri + 1}"${s.hiddenRows?.includes(ri + 1) ? ' hidden="1"' : ''}>${r
              .map((c, ci) => {
                if (c === null || c === undefined || c === '') return '';
                const ref = `${col(ci)}${ri + 1}`;
                const o = typeof c === 'object' ? c : { v: c };
                const st = styleOf(o);
                const sAttr = st ? ` s="${st}"` : '';
                if (typeof o.v === 'number') return `<c r="${ref}"${sAttr}>${o.f ? `<f>${esc(o.f)}</f>` : ''}<v>${o.v}</v></c>`;
                if (typeof o.v === 'boolean') return `<c r="${ref}" t="b"${sAttr}><v>${o.v ? 1 : 0}</v></c>`;
                if (o.inline) return `<c r="${ref}" t="inlineStr"${sAttr}><is><t>${esc(o.v)}</t></is></c>`;
                return `<c r="${ref}" t="s"${sAttr}><v>${si(String(o.v))}</v></c>`;
              })
              .join('')}</row>`
      )
      .join('');
    const merges = s.merges?.length ? `<mergeCells count="${s.merges.length}">${s.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const sheetRels = [];
    if (s.comments?.length) sheetRels.push(['rIdC', 'comments', `../comments${i + 1}.xml`]);
    if (s.drawing) sheetRels.push(['rIdD', 'drawing', `../drawings/drawing${i + 1}.xml`]);
    entries.push([`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rowsXml}</sheetData>${merges}${s.drawing ? '<drawing r:id="rIdD"/>' : ''}</worksheet>`]);
    if (sheetRels.length) entries.push([`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, rels(sheetRels)]);
    if (s.comments?.length) {
      const authors = [...new Set(s.comments.map((c) => c.author))];
      entries.push([`xl/comments${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors>${authors.map((a) => `<author>${esc(a)}</author>`).join('')}</authors><commentList>${s.comments.map((c) => `<comment ref="${c.ref}" authorId="${authors.indexOf(c.author)}"><text><r><t>${esc(c.text)}</t></r></text></comment>`).join('')}</commentList></comments>`]);
    }
    if (s.drawing) {
      entries.push([`xl/drawings/drawing${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor><xdr:from/><xdr:to/><xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"${s.drawing.alt ? ` descr="${esc(s.drawing.alt)}"` : ''}/></xdr:nvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></xdr:graphicFrame></xdr:twoCellAnchor></xdr:wsDr>`]);
      entries.push([`xl/drawings/_rels/drawing${i + 1}.xml.rels`, rels([['rIdChart', 'chart', `../charts/chart${i + 1}.xml`]])]);
      entries.push([`xl/charts/chart${i + 1}.xml`, s.drawing.chart]);
    }
  });
  wbRels.push(['rIdSS', 'sharedStrings', 'sharedStrings.xml'], ['rIdSt', 'styles', 'styles.xml']);
  entries.push(['xl/_rels/workbook.xml.rels', rels(wbRels)]);
  entries.push([
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>'}<sheets>${sheets
      .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rIdS${i + 1}"/>`)
      .join('')}</sheets>${oleSize ? `<oleSize ref="${oleSize}"/>` : ''}</workbook>`,
  ]);
  entries.push(['xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`]);
  entries.push([
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/></font><font><b/><sz val="11"/></font></fonts><cellXfs count="6"><xf numFmtId="0" fontId="0"/><xf numFmtId="10" fontId="0" applyNumberFormat="1"/><xf numFmtId="14" fontId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1"/><xf numFmtId="10" fontId="1" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  ]);
  if (title) entries.push(['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`]);
  return zip(entries);
}

// ── PowerPoint ──────────────────────────────────────────────────────

/**
 * A .pptx. slides: [{ shapes: [shape…], notes, hidden }], a shape:
 *   { ph: 'title'|'ctrTitle'|'subTitle'|'body', text: string | string[] (paragraphs) | [{ t, lvl }], x, y, w, h }  (EMU; 914400 = 1 inch)
 *   { table: rows, x, y, w, h, firstRow }
 *   { picture: relTarget, alt, x, y, w, h }
 *   { chart: chartXml, alt, x, y, w, h }
 *   { math: OMML XML (an m:oMathPara), x, y, w, h }
 */
export function pptx({ slides, title, size = [12192000, 6858000] }) {
  const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
  const xfrm = (s) => (s.x !== undefined ? `<a:xfrm><a:off x="${s.x}" y="${s.y}"/><a:ext cx="${s.w ?? 914400}" cy="${s.h ?? 457200}"/></a:xfrm>` : '');
  const paras = (text) =>
    (Array.isArray(text) ? text : [text])
      .map((p) => {
        const o = typeof p === 'string' ? { t: p } : p;
        return `<a:p>${o.lvl ? `<a:pPr lvl="${o.lvl}"/>` : o.bullet ? '<a:pPr><a:buChar char="•"/></a:pPr>' : ''}<a:r><a:rPr lang="en-US"${o.b ? ' b="1"' : ''}/><a:t>${esc(o.t)}</a:t></a:r></a:p>`;
      })
      .join('');
  const entries = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']])],
  ];
  const presRels = [];
  slides.forEach((sl, i) => {
    const n = i + 1;
    presRels.push([`rIdSl${n}`, 'slide', `slides/slide${n}.xml`]);
    const sRels = [['rIdLayout', 'slideLayout', '../slideLayouts/slideLayout1.xml']];
    let id = 2;
    const shapes = (sl.shapes ?? [])
      .map((s) => {
        id++;
        if (s.table) {
          return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${s.x ?? 0}" y="${s.y ?? 0}"/><a:ext cx="${s.w ?? 6000000}" cy="${s.h ?? 2000000}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${s.firstRow ? ' firstRow="1"' : ''}/><a:tblGrid>${s.table[0].map(() => '<a:gridCol w="1000000"/>').join('')}</a:tblGrid>${s.table
            .map((r) => `<a:tr h="370840">${r.map((c) => `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>${esc(c)}</a:t></a:r></a:p></a:txBody></a:tc>`).join('')}</a:tr>`)
            .join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
        }
        if (s.picture) {
          sRels.push([`rIdPic${id}`, 'image', s.picture]);
          return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"${s.alt ? ` descr="${esc(s.alt)}"` : ''}/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdPic${id}"/></p:blipFill><p:spPr>${xfrm(s)}</p:spPr></p:pic>`;
        }
        if (s.chart) {
          sRels.push([`rIdChart${id}`, 'chart', `../charts/chart${n}_${id}.xml`]);
          entries.push([`ppt/charts/chart${n}_${id}.xml`, s.chart]);
          return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Chart ${id}"${s.alt ? ` descr="${esc(s.alt)}"` : ''}/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${s.x ?? 0}" y="${s.y ?? 0}"/><a:ext cx="${s.w ?? 6000000}" cy="${s.h ?? 3000000}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart${id}"/></a:graphicData></a:graphic></p:graphicFrame>`;
        }
        if (s.math) {
          return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(s)}</p:spPr><p:txBody><a:bodyPr/><a:p><mc:AlternateContent><mc:Choice Requires="a14"><a14:m>${s.math}</a14:m></mc:Choice><mc:Fallback><a:r><a:t>[equation picture]</a:t></a:r></mc:Fallback></mc:AlternateContent></a:p></p:txBody></p:sp>`;
        }
        return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr${s.ph ? '' : ' txBox="1"'}/><p:nvPr>${s.ph ? `<p:ph type="${s.ph}"${s.idx !== undefined ? ` idx="${s.idx}"` : ''}/>` : ''}</p:nvPr></p:nvSpPr><p:spPr>${xfrm(s)}</p:spPr><p:txBody><a:bodyPr/>${paras(s.text)}</p:txBody></p:sp>`;
      })
      .join('');
    if (sl.notes) {
      sRels.push(['rIdNotes', 'notesSlide', `../notesSlides/notesSlide${n}.xml`]);
      entries.push([`ppt/notesSlides/notesSlide${n}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:notes ${P}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/>${paras(sl.notes)}</p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Number"/><p:cNvSpPr/><p:nvPr><p:ph type="sldNum" idx="5"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:p><a:fld type="slidenum"><a:t>${n}</a:t></a:fld></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`]);
    }
    entries.push([`ppt/slides/slide${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${P}${sl.hidden ? ' show="0"' : ''}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`]);
    entries.push([`ppt/slides/_rels/slide${n}.xml.rels`, rels(sRels)]);
  });
  // one layout, whose title and body placeholders say where those go when a slide does not
  entries.push(['ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8"?><p:sldLayout ${P}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm></p:spPr></p:sp></p:spTree></p:cSld></p:sldLayout>`]);
  entries.push(['ppt/_rels/presentation.xml.rels', rels(presRels)]);
  entries.push(['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${P}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdSl${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${size[0]}" cy="${size[1]}"/></p:presentation>`]);
  if (title) entries.push(['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`]);
  return zip(entries);
}

/** OMML for a fraction, a superscript, a radical and an n-ary sum — the shapes the linear writer must get right. */
export const omml = {
  frac: (num, den) => `<m:f><m:num>${num}</m:num><m:den>${den}</m:den></m:f>`,
  sup: (e, s) => `<m:sSup><m:e>${e}</m:e><m:sup>${s}</m:sup></m:sSup>`,
  sub: (e, s) => `<m:sSub><m:e>${e}</m:e><m:sub>${s}</m:sub></m:sSub>`,
  rad: (e, deg) => `<m:rad><m:radPr>${deg ? '' : '<m:degHide m:val="1"/>'}</m:radPr><m:deg>${deg ?? ''}</m:deg><m:e>${e}</m:e></m:rad>`,
  r: (t) => `<m:r><m:t>${esc(t)}</m:t></m:r>`,
  sum: (sub, sup, e) => `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup><m:e>${e}</m:e></m:nary>`,
  d: (e, beg, end) => `<m:d>${beg ? `<m:dPr><m:begChr m:val="${beg}"/><m:endChr m:val="${end}"/></m:dPr>` : ''}<m:e>${e}</m:e></m:d>`,
  para: (inner) => `<m:oMathPara><m:oMath>${inner}</m:oMath></m:oMathPara>`,
  inline: (inner) => `<m:oMath>${inner}</m:oMath>`,
};
