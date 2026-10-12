// lib/docs/odf.ts — OpenDocument: text (.odt), presentations (.odp), spreadsheets (.ods).
//
// LibreOffice's formats keep everything in one content.xml. The old reader
// stripped its tags; this reads its structure as the Office readers read
// theirs:
//
//   text      headings by outline level, paragraphs by style (title, caption,
//             quotation, preformatted), lists with their depth, tables (spans
//             kept in place, repeated cells expanded only where they hold
//             something), footnotes at the end of their page, comments as
//             notes, images by their title and description, formulas from
//             the MathML LibreOffice embeds — and pages where LibreOffice
//             last broke them (text:soft-page-break), as Word's are read
//   slides    one page per slide, its shapes in reading order, speaker notes
//   sheets    one page per sheet, its tables found as regions, values as the
//             sheet displays them
//
// PURE — works over OfficeParts.

import { DocBuilder, type MediaRef, type ReaderOut } from './build';
import type { RawPage } from './checks';
import { mathml } from './html';
import { guessHead, isLayoutTable, mimeOf, visible, type OfficeParts } from './office';
import { CAPTION, LIST_MARK, toScript } from './text';
import type { BlockKind, Box, DocCheck, DocFormat } from './types';
import { attr, first, kid, kids, parseXml, textOf, type XNode } from './xml';
import { emitCells } from './xlsx';

const BUDGET = 300_000;

/** A node with its namespace prefixes taken off its name — the shape lib/docs/html.ts's MathML reader expects. */
function localTree(n: XNode): XNode {
  return { name: n.name.replace(/^[\w-]+:/, ''), attrs: Object.fromEntries(Object.entries(n.attrs).map(([k, v]) => [k.replace(/^[\w-]+:/, ''), v])), children: n.children.map((c) => (typeof c === 'string' ? c : localTree(c))) };
}

const styleName = (s: string | undefined) => (s ?? '').replace(/_20_/g, ' ').replace(/_[0-9a-f]{2}_/gi, (m) => String.fromCharCode(parseInt(m.slice(1, 3), 16))).toLowerCase();

interface Ctx {
  parts: OfficeParts;
  /** automatic style → the named style it is based on */
  parent: Map<string, string>;
  page: number;
  /** pages from LibreOffice's own record of where it broke them */
  soft: boolean;
  b: DocBuilder;
  notes: DocCheck[];
  footQueue: string[];
  media: { figure: number; part: string }[];
  /** text the reader adds: footnote marks it writes out, comment labels */
  generated: string[];
}

/** A paragraph's text: spans, spaces, tabs, line breaks, links, footnote marks; frames and notes set aside. */
function inlineText(ctx: Ctx, p: XNode, after: XNode[], breaks: { n: number; before: boolean }, seen: { text: boolean }): string {
  let out = '';
  for (const c of p.children) {
    if (typeof c === 'string') {
      out += c;
      if (c.trim()) seen.text = true;
      continue;
    }
    switch (c.name) {
      case 'text:s':
        out += ' '.repeat(Math.min(100, Number(attr(c, 'c') ?? 1) || 1));
        break;
      case 'text:tab':
        out += '\t';
        break;
      case 'text:line-break':
        out += '\n';
        break;
      case 'text:soft-page-break':
        if (ctx.soft) {
          if (seen.text) breaks.n++;
          else breaks.before = true;
        }
        break;
      case 'text:note': {
        // the citation is raised in the text, as LibreOffice shows it
        const cite = textOf(kid(c, 'text:note-citation')).trim();
        const mark = toScript(cite, 'sup') ?? cite;
        out += mark;
        const body = blockText(ctx, kid(c, 'text:note-body'));
        if (body) ctx.footQueue.push(`${mark} ${body}`.trim());
        break;
      }
      case 'office:annotation':
      case 'office:annotation-end':
        if (c.name === 'office:annotation') after.push(c);
        break;
      case 'draw:frame':
      case 'draw:a':
      case 'draw:custom-shape':
        after.push(c);
        break;
      case 'text:bookmark':
      case 'text:bookmark-start':
      case 'text:bookmark-end':
      case 'text:reference-mark':
      case 'text:change-start':
      case 'text:change-end':
      case 'text:change':
        break;
      default:
        out += inlineText(ctx, c, after, breaks, seen);
    }
  }
  return out;
}

/** All the text of a container (a note body, a cell), paragraphs joined. */
function blockText(ctx: Ctx, n: XNode | undefined): string {
  if (!n) return '';
  const out: string[] = [];
  for (const c of kids(n)) {
    if (c.name === 'text:p' || c.name === 'text:h') out.push(inlineText(ctx, c, [], { n: 0, before: false }, { text: false }).replace(/\s+/g, ' ').trim());
    else if (c.name === 'text:list' || c.name === 'text:list-item' || c.name === 'text:section' || c.name === 'table:table-cell') out.push(blockText(ctx, c));
  }
  return out.filter(Boolean).join('\n');
}

function newPage(ctx: Ctx) {
  for (const f of ctx.footQueue) ctx.b.block({ page: ctx.page, kind: 'footnote', text: f });
  ctx.footQueue = [];
  ctx.page++;
}

/** Frames beside a paragraph: images, formulas, text boxes. */
function frames(ctx: Ctx, list: XNode[]) {
  for (const f of list) {
    if (f.name === 'office:annotation') {
      const who = textOf(kid(f, 'dc:creator')).trim();
      const text = kids(f, 'text:p').map((p) => textOf(p)).join(' ').replace(/\s+/g, ' ').trim();
      if (text) {
        const label = `[Comment${who ? ` — ${who}` : ''}]`;
        ctx.generated.push(label);
        ctx.b.block({ page: ctx.page, kind: 'note', text: `${label} ${text}` });
      }
      continue;
    }
    if (f.name === 'draw:a') {
      frames(ctx, kids(f));
      continue;
    }
    const title = textOf(kid(f, 'svg:title')).trim();
    const desc = textOf(kid(f, 'svg:desc')).trim();
    const obj = kid(f, 'draw:object');
    const img = kid(f, 'draw:image');
    const box = kid(f, 'draw:text-box');
    if (obj) {
      const href = (attr(obj, 'href') ?? '').replace(/^\.\//, '').replace(/\/$/, '');
      const xml = href ? ctx.parts.text(`${href}/content.xml`) : null;
      const math = xml ? first(parseXml(xml), 'math') ?? first(parseXml(xml), 'math:math') : undefined;
      if (math) {
        const m = mathml(localTree(math) as never);
        const ann = /StarMath/i.test(xml ?? '') ? undefined : m.tex;
        if (m.linear) ctx.b.block({ page: ctx.page, kind: 'equation', text: m.linear, tex: ann ?? m.linear });
        continue;
      }
      ctx.b.figure({ page: ctx.page, kind: 'object' }, [title, desc].filter(Boolean).join('\n'), ['illegible']);
      continue;
    }
    if (box) {
      body(ctx, kids(box));
      continue;
    }
    if (img) {
      const href = (attr(img, 'href') ?? '').replace(/^\.\//, '');
      const i = ctx.b.figure({ page: ctx.page, kind: 'image', ...(desc || title ? { alt: desc || title } : {}) }, [title, desc].filter(Boolean).join('\n'));
      if (href && !/^[a-z]+:/i.test(href)) ctx.media.push({ figure: i, part: href });
    }
  }
}

/** A table's rows: repeated cells expanded only while they hold something; spans kept in place. */
function tableRows(ctx: Ctx, t: XNode): { rows: string[][]; head: number } {
  const rows: string[][] = [];
  let head = 0;
  const visitRows = (n: XNode, inHead: boolean) => {
    for (const r of kids(n)) {
      if (r.name === 'table:table-header-rows') visitRows(r, true);
      else if (r.name === 'table:table-rows' || r.name === 'table:table-row-group') visitRows(r, inHead);
      else if (r.name === 'table:table-row') {
        const row: string[] = [];
        for (const c of kids(r)) {
          if (c.name !== 'table:table-cell' && c.name !== 'table:covered-table-cell') continue;
          const text = c.name === 'table:covered-table-cell' ? '' : blockText(ctx, c);
          const rep = Math.min(64, Number(attr(c, 'number-columns-repeated') ?? 1) || 1);
          for (let k = 0; k < (text ? rep : Math.min(rep, 1)); k++) row.push(text);
        }
        while (row.length && !row[row.length - 1]) row.pop();
        const rep = Math.min(400, Number(attr(r, 'number-rows-repeated') ?? 1) || 1);
        for (let k = 0; k < (row.length ? rep : 1); k++) rows.push([...row]);
        if (inHead) head = rows.length;
      }
    }
  };
  visitRows(t, false);
  while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
  const width = Math.max(0, ...rows.map((r) => r.length));
  for (const r of rows) while (r.length < width) r.push('');
  return { rows, head: head || guessHead(rows) };
}

function kindOfStyle(ctx: Ctx, p: XNode): { kind: BlockKind; level?: number } | null {
  let s = attr(p, 'style-name');
  for (let i = 0; i < 6 && s && ctx.parent.has(s); i++) s = ctx.parent.get(s);
  const name = styleName(s);
  if (name === 'title') return { kind: 'title' };
  if (/caption|illustration|table|figure|drawing/.test(name) && name !== 'table contents' && name !== 'table heading') return { kind: 'caption' };
  if (/quotations?/.test(name)) return { kind: 'quote' };
  if (/preformatted|source text|code/.test(name)) return { kind: 'code' };
  const h = /^heading (\d)$/.exec(name);
  if (h) return { kind: 'heading', level: Number(h[1]) };
  return null;
}

/** The body of a text document (or a text box, a section, a list item), in reading order. */
function body(ctx: Ctx, nodes: XNode[], listDepth = 0) {
  for (const n of nodes) {
    if (ctx.b.chars > BUDGET) return;
    switch (n.name) {
      case 'text:h':
      case 'text:p': {
        const after: XNode[] = [];
        const breaks = { n: 0, before: false };
        const raw = inlineText(ctx, n, after, breaks, { text: false });
        if (breaks.before) newPage(ctx);
        const text = raw.replace(/\t/g, ' ').replace(/[  ]{2,}/g, ' ').replace(/ *\n */g, '\n').trim();
        if (text) {
          const styled = n.name === 'text:h' ? { kind: 'heading' as BlockKind, level: Number(attr(n, 'outline-level') ?? 1) || 1 } : kindOfStyle(ctx, n);
          const kind: BlockKind = listDepth ? 'list' : styled?.kind ?? (CAPTION.test(text) ? 'caption' : LIST_MARK.test(text) ? 'list' : 'paragraph');
          const level = listDepth ? Math.min(4, listDepth) : styled?.level ?? (kind === 'list' ? 1 : undefined);
          ctx.b.block({ page: ctx.page, kind, text: kind === 'code' ? raw.replace(/\s+$/, '') : text, ...(level ? { level } : {}) });
        }
        frames(ctx, after);
        for (let i = 0; i < breaks.n; i++) newPage(ctx);
        break;
      }
      case 'text:list':
        for (const item of kids(n)) if (item.name === 'text:list-item' || item.name === 'text:list-header') body(ctx, kids(item), listDepth + 1);
        break;
      case 'text:section':
      case 'text:index-body':
      case 'text:table-of-content':
      case 'text:alphabetical-index':
      case 'text:illustration-index':
      case 'text:table-index':
      case 'text:bibliography':
        body(ctx, kids(n).filter((k) => k.name !== 'text:table-of-content-source' && k.name !== 'text:index-title-template'), listDepth);
        break;
      case 'text:soft-page-break':
        if (ctx.soft) newPage(ctx);
        break;
      case 'table:table': {
        const t = tableRows(ctx, n);
        if (!t.rows.length) break;
        if (isLayoutTable(t.rows)) {
          for (const r of kids(n).filter((k) => k.name === 'table:table-row')) for (const c of kids(r)) body(ctx, kids(c), listDepth);
          break;
        }
        ctx.b.table({ page: ctx.page, rows: t.rows.slice(0, 400), head: t.head });
        break;
      }
      case 'draw:frame':
      case 'draw:a':
        frames(ctx, [n]);
        break;
      default:
        break;
    }
  }
}

/** Every word the document body holds, from the XML directly, for the checks. */
function rawWords(n: XNode, parts: OfficeParts): string {
  const out: string[] = [];
  const walk = (x: XNode) => {
    for (const c of x.children) {
      if (typeof c === 'string') {
        out.push(c);
        continue;
      }
      if (/^(text:tracked-changes|office:forms|text:sequence-decls|text:variable-decls|office:annotation-end|text:table-of-content-source|text:index-title-template|svg:title|svg:desc|presentation:notes)$/.test(c.name)) {
        if (c.name === 'svg:title' || c.name === 'svg:desc') out.push(' ', textOf(c), ' ');
        continue;
      }
      if (c.name === 'text:s') out.push(' ');
      else if (c.name === 'text:note-citation') {
        const cite = textOf(c).trim();
        out.push(toScript(cite, 'sup') ?? cite);
      }
      else if (c.name === 'draw:object') {
        const href = (attr(c, 'href') ?? '').replace(/^\.\//, '').replace(/\/$/, '');
        const xml = href ? parts.text(`${href}/content.xml`) : null;
        const math = xml ? first(parseXml(xml), 'math') ?? first(parseXml(xml), 'math:math') : undefined;
        if (math) out.push(' ', mathml(localTree(math) as never).linear, ' ');
      } else if (c.name === 'text:p' || c.name === 'text:h' || c.name === 'table:table-cell') {
        walk(c);
        out.push('\n');
      } else walk(c);
    }
  };
  walk(n);
  return out.join('');
}

/** An OpenDocument file into a SourceDoc. */
export function readOdf(parts: OfficeParts, meta: { id: string; name: string; format: DocFormat }): ReaderOut {
  const xml = parts.text('content.xml');
  if (xml === null) throw new Error('it has no content inside it');
  const root = parseXml(xml);
  const parent = new Map<string, string>();
  for (const s of [...kids(first(root, 'office:automatic-styles'), 'style:style')]) {
    const name = attr(s, 'name');
    const p = attr(s, 'parent-style-name');
    if (name && p) parent.set(name, p);
  }
  const b = new DocBuilder('structured');
  const notes: DocCheck[] = [];
  const ctx: Ctx = { parts, parent, page: 1, soft: xml.includes('soft-page-break'), b, notes, footQueue: [], media: [], generated: [] };
  const raw: RawPage[] = [];
  const sizes = new Map<number, { w: number; h: number }>();
  const officeBody = first(root, 'office:body');
  const text = first(officeBody, 'office:text');
  const pres = first(officeBody, 'office:presentation');
  const sheet = first(officeBody, 'office:spreadsheet');
  let pageCount = 1;
  let unread: { from: number; to: number } | undefined;

  if (text) {
    body(ctx, kids(text));
    for (const f of ctx.footQueue) b.block({ page: ctx.page, kind: 'footnote', text: f });
    pageCount = ctx.page;
    if (b.chars > BUDGET) notes.push({ id: 'unread', level: 'warn', says: 'The document is longer than Socria reads at once; its end was not read.' });
    else raw.push({ n: 0, text: `${rawWords(text, parts)}\n${ctx.generated.join(' ')}` });
  } else if (pres) {
    const pages = kids(pres, 'draw:page');
    pageCount = pages.length;
    pages.forEach((pg, i) => {
      if (unread) return;
      if (i > 0 && b.chars > BUDGET) {
        unread = { from: i + 1, to: pages.length };
        return;
      }
      ctx.page = i + 1;
      // shapes in reading order: titles first, then by position
      const len = (v: string | undefined) => {
        const m = /^(-?[\d.]+)(cm|mm|in|pt|pc)?$/.exec(v ?? '');
        if (!m) return 0;
        const k = { cm: 28.3465, mm: 2.83465, in: 72, pt: 1, pc: 12 }[m[2] ?? 'pt'] ?? 1;
        return Number(m[1]) * k;
      };
      const shapes = kids(pg).filter((s) => s.name === 'draw:frame' || s.name === 'draw:custom-shape' || s.name === 'draw:g');
      const W = Math.max(1, ...shapes.map((s) => len(attr(s, 'x')) + len(attr(s, 'width'))));
      const H = Math.max(1, ...shapes.map((s) => len(attr(s, 'y')) + len(attr(s, 'height'))));
      sizes.set(i + 1, { w: W, h: H });
      shapes.sort((a, c) => {
        const ta = /title/.test(attr(a, 'class') ?? '') ? 0 : 1;
        const tc = /title/.test(attr(c, 'class') ?? '') ? 0 : 1;
        return ta - tc || Math.floor(len(attr(a, 'y')) / (H * 0.06)) - Math.floor(len(attr(c, 'y')) / (H * 0.06)) || len(attr(a, 'x')) - len(attr(c, 'x'));
      });
      for (const s of shapes) {
        const cls = attr(s, 'class') ?? '';
        const box: Box = [len(attr(s, 'x')) / W, len(attr(s, 'y')) / H, (len(attr(s, 'x')) + len(attr(s, 'width'))) / W, (len(attr(s, 'y')) + len(attr(s, 'height'))) / H].map((v) => Math.min(1, Math.max(0, v))) as Box;
        const tb = kid(s, 'draw:text-box') ?? (s.name === 'draw:custom-shape' ? s : undefined);
        const tbl = kid(s, 'table:table');
        if (tbl) {
          const t = tableRows(ctx, tbl);
          if (t.rows.length) b.table({ page: i + 1, rows: t.rows, head: t.head, box });
          continue;
        }
        if (tb) {
          const paras = kids(tb).flatMap((k) => (k.name === 'text:list' ? listTexts(ctx, k, 1) : k.name === 'text:p' || k.name === 'text:h' ? [{ text: blockText(ctx, { name: '#', attrs: {}, children: [k] }), level: 0 }] : []));
          for (const p of paras) {
            if (!p.text) continue;
            const kind: BlockKind = /title/.test(cls) ? (i === 0 ? 'title' : 'heading') : p.level ? 'list' : 'paragraph';
            b.block({ page: i + 1, kind, text: p.text, ...(kind === 'heading' ? { level: 1 } : p.level ? { level: p.level } : {}), box });
          }
          continue;
        }
        frames(ctx, [s]);
      }
      const notesFrame = first(kid(pg, 'presentation:notes'), 'draw:text-box');
      const noteText = notesFrame ? blockText(ctx, notesFrame) : '';
      if (noteText) b.block({ page: i + 1, kind: 'note', text: noteText });
      raw.push({ n: i + 1, text: `${rawWords({ ...pg, children: pg.children.filter((k) => typeof k === 'string' || k.name !== 'presentation:notes') }, parts)}\n${noteText}` });
    });
  } else if (sheet) {
    const tables = kids(sheet, 'table:table');
    pageCount = tables.length;
    tables.forEach((t, i) => {
      if (unread) return;
      if (i > 0 && b.chars > BUDGET) {
        unread = { from: i + 1, to: tables.length };
        return;
      }
      const page = i + 1;
      const name = attr(t, 'name') ?? `Sheet ${page}`;
      b.block({ page, kind: 'heading', level: 1, text: name });
      const cells = new Map<number, Map<number, { v: string; bold: boolean }>>();
      let r = 0;
      const rowsOf = (n: XNode): XNode[] => kids(n).flatMap((k) => (k.name === 'table:table-row' ? [k] : /^table:table-(header-rows|rows|row-group)$/.test(k.name) ? rowsOf(k) : []));
      for (const row of rowsOf(t)) {
        const rep = Number(attr(row, 'number-rows-repeated') ?? 1) || 1;
        let col = 0;
        const vals = new Map<number, { v: string; bold: boolean }>();
        for (const c of kids(row)) {
          if (c.name !== 'table:table-cell' && c.name !== 'table:covered-table-cell') continue;
          const crep = Number(attr(c, 'number-columns-repeated') ?? 1) || 1;
          const v = c.name === 'table:covered-table-cell' ? '' : kids(c, 'text:p').map((p) => textOf(p)).join('\n').trim();
          if (v) for (let k = 0; k < Math.min(crep, 64); k++) vals.set(col + k, { v, bold: false });
          col += crep;
        }
        if (vals.size) for (let k = 0; k < Math.min(rep, 400); k++) cells.set(r + k, new Map(vals));
        r += rep;
        if (cells.size > 5000) {
          notes.push({ id: 'unread', level: 'warn', says: `${name} is longer than Socria reads: its first rows were looked at.`, pages: [page] });
          break;
        }
      }
      const clipped = emitCells(b, page, cells, notes, name);
      const rawCells: string[] = [name];
      for (const [rr, row] of cells) for (const [cc, cell] of row) if (!clipped.has(`${rr}:${cc}`)) rawCells.push(cell.v);
      raw.push({ n: page, text: rawCells.join('\n') });
    });
  } else throw new Error('it has no content Socria can read');

  const title = textOf(first(parseXml(parts.text('meta.xml') ?? ''), 'dc:title')).trim() || undefined;
  const doc = b.build({ id: meta.id, name: meta.name, format: meta.format, pageCount, ...(title ? { title } : {}), ...(sizes.size ? { sizes } : {}), ...(unread ? { unread } : {}) });
  return {
    doc,
    raw,
    notes,
    media: ctx.media
      .map((m) => ({ figure: `f${m.figure + 1}`, page: doc.figures[m.figure]?.page ?? 1, part: m.part, mime: mimeOf(m.part) }))
      .filter((m): m is MediaRef => visible(m.mime)),
  };
}

/** A presentation list's items with their depth. */
function listTexts(ctx: Ctx, list: XNode, depth: number): { text: string; level: number }[] {
  const out: { text: string; level: number }[] = [];
  for (const item of kids(list)) {
    for (const k of kids(item)) {
      if (k.name === 'text:list') out.push(...listTexts(ctx, k, depth + 1));
      else if (k.name === 'text:p' || k.name === 'text:h') out.push({ text: blockText(ctx, { name: '#', attrs: {}, children: [k] }), level: Math.min(4, depth) });
    }
  }
  return out;
}
