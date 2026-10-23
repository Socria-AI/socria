// lib/write/docx.ts — the writing as a Word document.
//
// A real .docx: Word's own built-in styles (Title, Heading 1–3, Quote, List
// Paragraph), so the navigation pane, the table of contents and every style
// change in Word work on it as on a document typed there; real numbered and
// bulleted lists; bold, italic and underline as written. Citations are the
// passages the person linked, numbered in order of first use, with a Sources
// list at the end — made from what was read, never from a model.
//
// PURE. Built in the browser; nothing is sent anywhere to make it.

import { citedSources, isList, type Block, type WriteDoc } from './doc';
import { segments } from './render';
import { zipStore } from './zip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// XML 1.0 has no place for most control characters; the model keeps none, this makes sure
const xmlText = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const xmlAttr = (s: string) => xmlText(s).replace(/"/g, '&quot;');

/** One run of text with its emphasis — line breaks and tabs as Word writes them. */
function runs(text: string, on: string[], extra = ''): string {
  if (!text) return '';
  const props = `${on.includes('b') ? '<w:b/><w:bCs/>' : ''}${on.includes('i') ? '<w:i/><w:iCs/>' : ''}${on.includes('u') ? '<w:u w:val="single"/>' : ''}${extra}`;
  const rPr = props ? `<w:rPr>${props}</w:rPr>` : '';
  const body = text
    .split(/(\n|\t)/)
    .map((piece) => (piece === '\n' ? '<w:br/>' : piece === '\t' ? '<w:tab/>' : piece ? `<w:t xml:space="preserve">${xmlText(piece)}</w:t>` : ''))
    .join('');
  return `<w:r>${rPr}${body}</w:r>`;
}

function para(style: string | null, content: string, numPr = ''): string {
  const pPr = style || numPr ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${numPr}</w:pPr>` : '';
  return `<w:p>${pPr}${content}</w:p>`;
}

const STYLE: Record<string, string | null> = { p: null, h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', quote: 'Quote' };

function documentXml(doc: Pick<WriteDoc, 'title' | 'blocks'>): { xml: string; ordered: number } {
  const sources = citedSources(doc);
  const numbers = new Map(sources.map((s) => [s.key, s.n]));
  const sup = (b: Block) =>
    (b.cites ?? [])
      .map((c) => numbers.get(`${c.doc}:${c.block}`))
      .filter((n): n is number => typeof n === 'number')
      .map((n) => runs(`[${n}]`, [], '<w:vertAlign w:val="superscript"/>'))
      .join('');
  const out: string[] = [];
  if (doc.title.trim()) out.push(para('Title', runs(doc.title.trim(), [])));
  // numId 1 is bullets; every numbered list gets its own numId, so each one counts from 1
  let ordered = 0;
  let curOl: number | null = null;
  for (const b of doc.blocks) {
    const body = segments(b.text, b.marks)
      .map((s) => runs(s.text, s.on))
      .join('') + sup(b);
    if (isList(b.t)) {
      const lvl = Math.max(1, Math.min(3, b.lvl ?? 1));
      let numId = 1;
      if (b.t === 'ol') {
        if (curOl === null) curOl = 2 + ordered++;
        numId = curOl;
      } else if (lvl === 1) curOl = null;
      out.push(para('ListParagraph', body, `<w:numPr><w:ilvl w:val="${lvl - 1}"/><w:numId w:val="${numId}"/></w:numPr>`));
      continue;
    }
    curOl = null;
    if (!b.text.trim() && b.t === 'p') continue;
    out.push(para(STYLE[b.t] ?? null, body));
  }
  if (sources.length) {
    out.push(para('Heading2', runs('Sources', [])));
    for (const s of sources) out.push(para(null, runs(`[${s.n}] ${s.cite.label}${s.cite.quote ? ` — “${s.cite.quote}”` : ''}`, [])));
  }
  const sect =
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  return {
    xml: `${XML}<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${out.join('')}${sect}</w:body></w:document>`,
    ordered,
  };
}

function numberingXml(ordered: number): string {
  const bullets = ['•', '◦', '▪'];
  const fmts = [
    ['decimal', '%1.'],
    ['lowerLetter', '%2.'],
    ['lowerRoman', '%3.'],
  ];
  const lvl = (k: number, fmt: string, text: string) =>
    `<w:lvl w:ilvl="${k}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${xmlAttr(text)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (k + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
  const abstractBullets = `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bullets.map((g, k) => lvl(k, 'bullet', g)).join('')}</w:abstractNum>`;
  const abstractNumbers = `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${fmts.map(([f, t], k) => lvl(k, f, t)).join('')}</w:abstractNum>`;
  const nums = [`<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`];
  for (let k = 0; k < ordered; k++)
    nums.push(`<w:num w:numId="${k + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`);
  return `${XML}<w:numbering xmlns:w="${W}">${abstractBullets}${abstractNumbers}${nums.join('')}</w:numbering>`;
}

const STYLES = `${XML}<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:eastAsia="Georgia" w:cs="Georgia"/><w:sz w:val="23"/><w:szCs w:val="23"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="320"/><w:outlineLvl w:val="9"/></w:pPr><w:rPr><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="4B4C45"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>
</w:styles>`;

const SETTINGS = `${XML}<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

const CONTENT_TYPES = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

const ROOT_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const DOC_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`;

function coreXml(title: string, when: Date): string {
  const at = when.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${title ? `<dc:title>${xmlText(title)}</dc:title>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${at}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${at}</dcterms:modified></cp:coreProperties>`;
}

const APP = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Socria</Application></Properties>`;

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The document as the bytes of a .docx file. */
export function toDocx(doc: Pick<WriteDoc, 'title' | 'blocks'>, when: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { xml, ordered } = documentXml(doc);
  return zipStore(
    [
      { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
      { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
      { name: 'word/document.xml', data: enc.encode(xml) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(DOC_RELS) },
      { name: 'word/styles.xml', data: enc.encode(STYLES) },
      { name: 'word/numbering.xml', data: enc.encode(numberingXml(ordered)) },
      { name: 'word/settings.xml', data: enc.encode(SETTINGS) },
      { name: 'docProps/core.xml', data: enc.encode(coreXml(doc.title.trim(), when)) },
      { name: 'docProps/app.xml', data: enc.encode(APP) },
    ],
    when
  );
}
