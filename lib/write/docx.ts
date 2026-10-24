// lib/write/docx.ts — the writing as a Word document.
//
// A real .docx: Word's own built-in styles (Title, Heading 1–3, Quote, List
// Paragraph, Source Code, Table Grid, Hyperlink), so the navigation pane, the
// table of contents and every style change in Word work on it as on a
// document typed there; real numbered and bulleted lists; bold, italic,
// underline, strikethrough, superscript and subscript; fonts, sizes, colours
// and highlights as written; links that open; paragraphs aligned, indented
// and spaced as set; tables with their header rows and column widths;
// pictures at the width they were given; page breaks; and the page — paper,
// orientation, margins — the writing was set on. Citations are the passages
// the person linked, numbered in order of first use, with a Sources list at
// the end — made from what was read, never from a model.
//
// Word is strict about the ORDER of the properties of a run, a paragraph, a
// table and a cell (ECMA-376 Part 1, §17); each writer below emits them in
// the schema's order, or Word calls the file damaged.
//
// PURE. Built in the browser; nothing is sent anywhere to make it.

import {
  citedSources,
  DEFAULT_FONT,
  DEFAULT_SIZE,
  fontInfo,
  isList,
  lineWidthOf,
  pageOf,
  paperOf,
  type Block,
  type WriteDoc,
} from './doc';
import { extOf, mediaIdOf, sniffImage, type MediaType } from './media';
import { segments, type Segment } from './render';
import { zipStore } from './zip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// XML 1.0 has no place for most control characters; the model keeps none, this makes sure
const xmlText = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const xmlAttr = (s: string) => xmlText(s).replace(/"/g, '&quot;');

/** A picture's bytes, as an export is given them. */
export interface MediaBytes {
  bytes: Uint8Array;
  type: MediaType | string;
  w: number;
  h: number;
}

// Word's sixteen highlight colours; any other colour behind words is cell-style shading
const HIGHLIGHT: Record<string, string> = {
  ffff00: 'yellow', '00ff00': 'green', '00ffff': 'cyan', ff00ff: 'magenta', '0000ff': 'blue', ff0000: 'red', '000080': 'darkBlue', '008080': 'darkCyan',
  '008000': 'darkGreen', '800080': 'darkMagenta', '800000': 'darkRed', '808000': 'darkYellow', '808080': 'darkGray', c0c0c0: 'lightGray', '000000': 'black', ffffff: 'white',
};

/** A run's properties, in the order the schema gives them (CT_RPr). */
function rPr(seg: Pick<Segment, 'on' | 'val'>, extra: { style?: string; bold?: boolean; vert?: 'superscript' } = {}): string {
  const on = seg.on;
  const v = seg.val;
  const parts: string[] = [];
  if (extra.style) parts.push(`<w:rStyle w:val="${extra.style}"/>`);
  if (v.font) {
    const name = xmlAttr(fontInfo(v.font).word);
    parts.push(`<w:rFonts w:ascii="${name}" w:hAnsi="${name}" w:eastAsia="${name}" w:cs="${name}"/>`);
  }
  if (on.includes('b') || extra.bold) parts.push('<w:b/><w:bCs/>');
  if (on.includes('i')) parts.push('<w:i/><w:iCs/>');
  if (on.includes('s')) parts.push('<w:strike/>');
  if (v.color) parts.push(`<w:color w:val="${v.color.slice(1).toUpperCase()}"/>`);
  if (v.size) {
    const hp = Math.round(Number(v.size) * 2);
    parts.push(`<w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/>`);
  }
  const hl = v.bg ? HIGHLIGHT[v.bg.slice(1)] : undefined;
  if (hl) parts.push(`<w:highlight w:val="${hl}"/>`);
  if (on.includes('u')) parts.push('<w:u w:val="single"/>');
  if (v.bg && !hl) parts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${v.bg.slice(1).toUpperCase()}"/>`);
  if (on.includes('sup') || extra.vert === 'superscript') parts.push('<w:vertAlign w:val="superscript"/>');
  else if (on.includes('sub')) parts.push('<w:vertAlign w:val="subscript"/>');
  return parts.length ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
}

/** One run of text with its formatting — line breaks and tabs as Word writes them. */
function run(text: string, props: string): string {
  if (!text) return '';
  const body = text
    .split(/(\n|\t)/)
    .map((piece) => (piece === '\n' ? '<w:br/>' : piece === '\t' ? '<w:tab/>' : piece ? `<w:t xml:space="preserve">${xmlText(piece)}</w:t>` : ''))
    .join('');
  return `<w:r>${props}${body}</w:r>`;
}

const plain = (text: string, extra: Parameters<typeof rPr>[1] = {}) => run(text, rPr({ on: [], val: {} }, extra));

interface Ctx {
  /** relationships beyond the fixed three: links and pictures */
  rels: string[];
  links: Map<string, string>;
  media: Map<string, MediaBytes> | undefined;
  /** pictures written into the file, by media id: their part name and relationship */
  pics: Map<string, { name: string; rid: string; type: string }>;
  files: { name: string; data: Uint8Array }[];
  nextPic: number;
  /** the line's width, in inches — what a picture's percentage is of */
  lineIn: number;
}

function linkRel(ctx: Ctx, href: string): string {
  let rid = ctx.links.get(href);
  if (!rid) {
    rid = `rIdL${ctx.links.size + 1}`;
    ctx.links.set(href, rid);
    ctx.rels.push(`<Relationship Id="${rid}" Type="${R}/hyperlink" Target="${xmlAttr(href)}" TargetMode="External"/>`);
  }
  return rid;
}

/** A block's words as runs: its marks, its links (each a Word hyperlink), its citations' numbers. */
function runsOf(b: Pick<Block, 'text' | 'marks'>, ctx: Ctx, extra: { bold?: boolean } = {}): string {
  const segs = segments(b.text, b.marks);
  const out: string[] = [];
  for (let k = 0; k < segs.length; ) {
    const href = segs[k].val.a;
    if (!href) {
      out.push(run(segs[k].text, rPr(segs[k], extra)));
      k++;
      continue;
    }
    let inner = '';
    while (k < segs.length && segs[k].val.a === href) {
      inner += run(segs[k].text, rPr(segs[k], { ...extra, style: 'Hyperlink' }));
      k++;
    }
    out.push(`<w:hyperlink r:id="${linkRel(ctx, href)}" w:history="1">${inner}</w:hyperlink>`);
  }
  return out.join('');
}

const JC: Record<string, string> = { center: 'center', right: 'right', justify: 'both' };

/** A paragraph's properties, in the schema's order (CT_PPr): style, numbering, border, spacing, indentation, alignment. */
function pPr(o: { style?: string | null; numPr?: string; border?: boolean; b?: Partial<Block>; list?: boolean }): string {
  const parts: string[] = [];
  if (o.style) parts.push(`<w:pStyle w:val="${o.style}"/>`);
  if (o.numPr) parts.push(o.numPr);
  if (o.border) parts.push('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BDB9AD"/></w:pBdr>');
  const b = o.b ?? {};
  if (b.sb !== undefined || b.sa !== undefined || b.lh) {
    const attrs = [
      b.sb !== undefined ? `w:before="${Math.round(b.sb * 20)}"` : '',
      b.sa !== undefined ? `w:after="${Math.round(b.sa * 20)}"` : '',
      b.lh ? `w:line="${Math.round(b.lh * 240)}" w:lineRule="auto"` : '',
    ].filter(Boolean);
    parts.push(`<w:spacing ${attrs.join(' ')}/>`);
  }
  if (b.ind && !o.list) parts.push(`<w:ind w:left="${b.ind * 720}"/>`);
  if (b.align && JC[b.align]) parts.push(`<w:jc w:val="${JC[b.align]}"/>`);
  return parts.length ? `<w:pPr>${parts.join('')}</w:pPr>` : '';
}

const para = (props: string, content: string) => `<w:p>${props}${content}</w:p>`;

const STYLE: Record<string, string | null> = { p: null, h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', quote: 'Quote' };

const EMU_PER_IN = 914400;

/** A picture, inline in its own paragraph, at the width it was given. */
function pictureXml(b: Block, ctx: Ctx): string {
  const id = mediaIdOf(b.src);
  const m = id ? ctx.media?.get(id) : undefined;
  const type = m ? sniffImage(m.bytes) : null;
  const alt = b.alt ?? '';
  const align = pPr({ b: { align: b.align } });
  if (!id || !m || !type || type === 'image/webp') return para(align, plain(alt ? `[Picture: ${alt}]` : '[Picture]'));
  let pic = ctx.pics.get(id);
  if (!pic) {
    const n = ctx.pics.size + 1;
    pic = { name: `media/image${n}.${extOf(type)}`, rid: `rIdP${n}`, type };
    ctx.pics.set(id, pic);
    ctx.files.push({ name: `word/${pic.name}`, data: m.bytes });
    ctx.rels.push(`<Relationship Id="${pic.rid}" Type="${R}/image" Target="${pic.name}"/>`);
  }
  const iw = b.iw || m.w || 800;
  const ih = b.ih || m.h || 600;
  // its width: the share of the line it was given, or its own size at screen resolution, never wider than the line
  const natural = iw / 96;
  const wIn = Math.min(ctx.lineIn, b.w ? (ctx.lineIn * b.w) / 100 : natural);
  const cx = Math.round(wIn * EMU_PER_IN);
  const cy = Math.round((cx * ih) / iw);
  const n = ++ctx.nextPic;
  const name = xmlAttr(`Picture ${n}`);
  const descr = xmlAttr(alt);
  const drawing =
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${n}" name="${name}" descr="${descr}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="${name}" descr="${descr}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${pic.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing>`;
  return para(align, `<w:r>${drawing}</w:r>`);
}

/** A table: Word's Table Grid, its columns' widths, its header row repeated on every page it runs onto. */
function tableXml(b: Block, ctx: Ctx): string {
  const rows = b.rows ?? [];
  if (!rows.length) return '';
  const width = rows[0].length;
  const total = Math.round(ctx.lineIn * 1440);
  const fr = b.cols && b.cols.length === width ? b.cols : Array.from({ length: width }, () => 1 / width);
  const tw = fr.map((f) => Math.max(200, Math.round(f * total)));
  const grid = `<w:tblGrid>${tw.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const tblPr = `<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${total}" w:type="dxa"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;
  const body = rows
    .map((row, r) => {
      const head = !!b.head && r === 0;
      const trPr = head ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
      const cells = row
        .map((c, k) => {
          const tcPr = `<w:tcPr><w:tcW w:w="${tw[k]}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEDE6"/>' : ''}</w:tcPr>`;
          return `<w:tc>${tcPr}${para(pPr({ b: { align: c.align } }), runsOf(c, ctx, head ? { bold: true } : {}))}</w:tc>`;
        })
        .join('');
      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join('');
  return `<w:tbl>${tblPr}${grid}${body}</w:tbl>`;
}

function documentXml(doc: Pick<WriteDoc, 'title' | 'blocks'> & Partial<Pick<WriteDoc, 'page'>>, ctx: Ctx): { xml: string; ordered: number } {
  const sources = citedSources(doc);
  const numbers = new Map(sources.map((s) => [s.key, s.n]));
  const sup = (b: Block) =>
    (b.cites ?? [])
      .map((c) => numbers.get(`${c.doc}:${c.block}`))
      .filter((n): n is number => typeof n === 'number')
      .map((n) => plain(`[${n}]`, { vert: 'superscript' }))
      .join('');
  const out: string[] = [];
  if (doc.title.trim()) out.push(para(pPr({ style: 'Title' }), plain(doc.title.trim())));
  // numId 1 is bullets; every numbered list gets its own numId, so each one counts from 1
  let ordered = 0;
  let curOl: number | null = null;
  doc.blocks.forEach((b, k) => {
    if (isList(b.t)) {
      const lvl = Math.max(1, Math.min(3, b.lvl ?? 1));
      let numId = 1;
      if (b.t === 'ol') {
        if (curOl === null) curOl = 2 + ordered++;
        numId = curOl;
      } else if (lvl === 1) curOl = null;
      out.push(para(pPr({ style: 'ListParagraph', numPr: `<w:numPr><w:ilvl w:val="${lvl - 1}"/><w:numId w:val="${numId}"/></w:numPr>`, b, list: true }), runsOf(b, ctx) + sup(b)));
      return;
    }
    curOl = null;
    if (b.t === 'hr') {
      out.push(para(pPr({ border: true }), ''));
      return;
    }
    if (b.t === 'pb') {
      out.push(para('', '<w:r><w:br w:type="page"/></w:r>'));
      return;
    }
    if (b.t === 'img') {
      out.push(pictureXml(b, ctx));
      return;
    }
    if (b.t === 'table') {
      out.push(tableXml(b, ctx));
      // a table is always followed by a paragraph in Word: one is kept after it when nothing else is
      const next = doc.blocks[k + 1];
      if (!next || next.t === 'table') out.push('<w:p/>');
      return;
    }
    if (b.t === 'code') {
      out.push(para(pPr({ style: 'SourceCode', b: { sb: b.sb, sa: b.sa } }), plain(b.text)));
      return;
    }
    if (!b.text.trim() && b.t === 'p') return;
    out.push(para(pPr({ style: STYLE[b.t] ?? null, b }), runsOf(b, ctx) + sup(b)));
  });
  if (sources.length) {
    out.push(para(pPr({ style: 'Heading2' }), plain('Sources')));
    for (const s of sources) out.push(para('', plain(`[${s.n}] ${s.cite.label}${s.cite.quote ? ` — “${s.cite.quote}”` : ''}`)));
  }
  const page = pageOf(doc);
  const paper = paperOf(page);
  const tw = (inch: number) => Math.round(inch * 1440);
  const sect =
    `<w:sectPr><w:pgSz w:w="${tw(paper.w)}" w:h="${tw(paper.h)}"${page.orient === 'landscape' ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${tw(page.m[0])}" w:right="${tw(page.m[1])}" w:bottom="${tw(page.m[2])}" w:left="${tw(page.m[3])}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  return {
    xml: `${XML}<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${out.join('')}${sect}</w:body></w:document>`,
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

/** The styles: the document's own font and size under everything, headings in proportion to it. */
function stylesXml(fontName: string, size: number): string {
  const f = xmlAttr(fontName);
  const hp = (pt: number) => Math.round(pt * 2);
  const base = hp(size);
  return `${XML}<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/><w:sz w:val="${base}"/><w:szCs w:val="${base}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="320"/><w:outlineLvl w:val="9"/></w:pPr><w:rPr><w:sz w:val="${hp(size * 2.2)}"/><w:szCs w:val="${hp(size * 2.2)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${hp(size * 1.5)}"/><w:szCs w:val="${hp(size * 1.5)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${hp(size * 1.25)}"/><w:szCs w:val="${hp(size * 1.25)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${hp(size * 1.05)}"/><w:szCs w:val="${hp(size * 1.05)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="4B4C45"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="SourceCode"><w:name w:val="Source Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F3EF"/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas" w:cs="Courier New"/><w:sz w:val="${hp(size * 0.85)}"/><w:szCs w:val="${hp(size * 0.85)}"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="2B5C8A"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BDB9AD"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BDB9AD"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BDB9AD"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BDB9AD"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="BDB9AD"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BDB9AD"/></w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
}

const SETTINGS = `${XML}<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

function contentTypes(exts: Set<string>): string {
  const defaults = Array.from(exts)
    .map((e) => `<Default Extension="${e}" ContentType="image/${e}"/>`)
    .join('');
  return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${defaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

const ROOT_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const docRels = (extra: string[]) =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="${R}/settings" Target="settings.xml"/>${extra.join('')}</Relationships>`;

function coreXml(title: string, when: Date): string {
  const at = when.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${title ? `<dc:title>${xmlText(title)}</dc:title>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${at}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${at}</dcterms:modified></cp:coreProperties>`;
}

const APP = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Socria</Application></Properties>`;

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * The document as the bytes of a .docx file. `media` holds the pictures'
 * bytes by media id (PNG, JPEG or GIF — Word's own); a picture without them
 * is written as its description, so nothing is silently missing.
 */
export function toDocx(
  doc: Pick<WriteDoc, 'title' | 'blocks'> & Partial<Pick<WriteDoc, 'page' | 'font' | 'size'>>,
  when: Date = new Date(),
  media?: Map<string, MediaBytes>
): Uint8Array {
  const enc = new TextEncoder();
  const ctx: Ctx = { rels: [], links: new Map(), media, pics: new Map(), files: [], nextPic: 0, lineIn: lineWidthOf(pageOf(doc)) };
  const { xml, ordered } = documentXml(doc, ctx);
  const exts = new Set(Array.from(ctx.pics.values()).map((p) => p.name.split('.').pop()!));
  return zipStore(
    [
      { name: '[Content_Types].xml', data: enc.encode(contentTypes(exts)) },
      { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
      { name: 'word/document.xml', data: enc.encode(xml) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels(ctx.rels)) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml(fontInfo(doc.font ?? DEFAULT_FONT).word, doc.size ?? DEFAULT_SIZE)) },
      { name: 'word/numbering.xml', data: enc.encode(numberingXml(ordered)) },
      { name: 'word/settings.xml', data: enc.encode(SETTINGS) },
      ...ctx.files,
      { name: 'docProps/core.xml', data: enc.encode(coreXml(doc.title.trim(), when)) },
      { name: 'docProps/app.xml', data: enc.encode(APP) },
    ],
    when
  );
}
