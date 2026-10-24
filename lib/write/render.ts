// lib/write/render.ts — the writing, as HTML, Markdown and plain text.
//
// What leaves Socria is exactly what was written: the same words, in the same
// order, with the same headings, lists, emphasis, links, tables and pictures.
// Each format keeps what it can hold — a web page keeps everything, colours
// and fonts included; Markdown keeps structure, emphasis, links, tables and
// pictures but has no way to say a colour or a size; plain text keeps the
// words. Citations are the passages the person chose, numbered in order of
// first use, with a Sources list built from what was read — never from
// anything a model said.
//
// PURE.

import {
  citedSources,
  DEFAULT_FONT,
  DEFAULT_SIZE,
  fontInfo,
  isList,
  pageOf,
  paperOf,
  type Block,
  type FlagMark,
  type Mark,
  type ValueMark,
  type WriteDoc,
} from './doc';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

const FLAG_ORDER: FlagMark[] = ['b', 'i', 'u', 's', 'sup', 'sub'];
const FLAG_TAG: Record<FlagMark, string> = { b: 'strong', i: 'em', u: 'u', s: 's', sup: 'sup', sub: 'sub' };

export interface Segment {
  text: string;
  /** the on/off marks it carries, in a fixed order */
  on: FlagMark[];
  /** the valued marks it carries */
  val: Partial<Record<ValueMark, string>>;
}

/** Segments of a block's text, each with the marks it carries — the one walk every renderer shares. */
export function segments(text: string, marks: readonly Mark[] | undefined): Segment[] {
  if (!marks?.length) return text ? [{ text, on: [], val: {} }] : [];
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) {
    cuts.add(Math.max(0, Math.min(text.length, m.s)));
    cuts.add(Math.max(0, Math.min(text.length, m.e)));
  }
  const at = Array.from(cuts).sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let k = 0; k < at.length - 1; k++) {
    const s = at[k];
    const e = at[k + 1];
    if (e <= s) continue;
    const covering = marks.filter((m) => m.s <= s && m.e >= e);
    const on = FLAG_ORDER.filter((t) => covering.some((m) => m.t === t));
    const val: Segment['val'] = {};
    for (const m of covering) if (m.v && (m.t === 'a' || m.t === 'color' || m.t === 'bg' || m.t === 'font' || m.t === 'size')) val[m.t] = m.v;
    const last = out[out.length - 1];
    if (last && last.on.join() === on.join() && sameVal(last.val, val)) last.text += text.slice(s, e);
    else out.push({ text: text.slice(s, e), on, val });
  }
  return out;
}

const VAL_KEYS: ValueMark[] = ['a', 'color', 'bg', 'font', 'size'];
const sameVal = (a: Segment['val'], b: Segment['val']) => VAL_KEYS.every((k) => a[k] === b[k]);

export interface InlineOpts {
  /** drawn on the editing page: sizes in the page's own points, and every value said again as data, to read back exactly */
  editor?: boolean;
}

/** A segment's look, as CSS. */
function styleOf(val: Segment['val'], opts: InlineOpts): string {
  const css: string[] = [];
  if (val.color) css.push(`color:${val.color}`);
  if (val.bg) css.push(`background-color:${val.bg}`);
  if (val.font) css.push(`font-family:${fontInfo(val.font).css.replace(/"/g, "'")}`);
  if (val.size) css.push(opts.editor ? `font-size:calc(var(--w-pt, 1.3333px) * ${Number(val.size)})` : `font-size:${Number(val.size)}pt`);
  return css.join(';');
}

/** A block's words as inline HTML: escaped, marks as tags, links as links, line breaks as <br>. */
export function inlineHtml(text: string, marks?: readonly Mark[], opts: InlineOpts = {}): string {
  return segments(text, marks)
    .map((seg) => {
      let h = escapeHtml(seg.text).replace(/\n/g, '<br>');
      for (let k = seg.on.length - 1; k >= 0; k--) h = `<${FLAG_TAG[seg.on[k]]}>${h}</${FLAG_TAG[seg.on[k]]}>`;
      const style = styleOf(seg.val, opts);
      if (style) {
        const data = opts.editor
          ? `${seg.val.color ? ` data-c="${seg.val.color}"` : ''}${seg.val.bg ? ` data-bg="${seg.val.bg}"` : ''}${seg.val.font ? ` data-f="${escapeHtml(seg.val.font)}"` : ''}${seg.val.size ? ` data-z="${seg.val.size}"` : ''}`
          : '';
        h = `<span${data} style="${escapeHtml(style)}">${h}</span>`;
      }
      if (seg.val.a) h = `<a href="${escapeHtml(seg.val.a)}"${opts.editor ? '' : ' rel="noopener noreferrer"'}>${h}</a>`;
      return h;
    })
    .join('');
}

const BLOCK_TAG: Record<string, string> = { p: 'p', h1: 'h1', h2: 'h2', h3: 'h3', quote: 'blockquote' };

/** Superscript numbers for a block's citations, in the order the Sources list gives them. */
function citeMarks(b: Block, numbers: Map<string, number>, fmt: (n: number) => string): string {
  return (b.cites ?? [])
    .map((c) => numbers.get(`${c.doc}:${c.block}`))
    .filter((n): n is number => typeof n === 'number')
    .map(fmt)
    .join('');
}

/** How a word processor's line spacing reads in CSS: "single" is a little more than the font's own height. */
export const cssLineHeight = (lh: number) => Math.round(lh * 1.15 * 1000) / 1000;

/** A block's paragraph settings, as CSS. */
export function paraStyle(b: Block): string {
  const css: string[] = [];
  if (b.align) css.push(`text-align:${b.align}`);
  if (b.ind) css.push(`margin-left:${b.ind * 0.5}in`);
  if (b.lh) css.push(`line-height:${cssLineHeight(b.lh)}`);
  if (b.sb !== undefined) css.push(`margin-top:${b.sb}pt`);
  if (b.sa !== undefined) css.push(`margin-bottom:${b.sa}pt`);
  return css.join(';');
}

const styleAttr = (css: string) => (css ? ` style="${escapeHtml(css)}"` : '');

export interface HtmlOpts {
  /** a whole page: the title, the writing and the Sources list, ready to save or print */
  standalone?: boolean;
  /** a picture's address in this HTML — a data address for a page that must stand alone; none leaves its description */
  src?: (b: Block) => string | null;
}

function pictureHtml(b: Block, opts: HtmlOpts): string {
  const src = opts.src?.(b) ?? null;
  const alt = b.alt ?? '';
  const align = b.align === 'center' ? 'center' : b.align === 'right' ? 'right' : 'left';
  const fig = `text-align:${align}`;
  if (!src) return `<p class="picture-missing"${styleAttr(fig)}>[${escapeHtml(alt ? `Picture: ${alt}` : 'Picture')}]</p>`;
  return `<figure${styleAttr(fig)}><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${b.w && b.w < 100 ? ` style="width:${b.w}%"` : ' style="max-width:100%"'}${b.iw && b.ih ? ` width="${b.iw}" height="${b.ih}"` : ''}></figure>`;
}

function tableHtml(b: Block): string {
  const rows = b.rows ?? [];
  const cols = b.cols?.length === rows[0]?.length ? `<colgroup>${b.cols.map((w) => `<col style="width:${Math.round(w * 1000) / 10}%">`).join('')}</colgroup>` : '';
  const cell = (c: Block, tag: 'td' | 'th') => `<${tag}${styleAttr(c.align ? `text-align:${c.align}` : '')}>${inlineHtml(c.text, c.marks)}</${tag}>`;
  const head = b.head && rows.length ? `<thead><tr>${rows[0].map((c) => cell(c, 'th')).join('')}</tr></thead>` : '';
  const body = (b.head ? rows.slice(1) : rows).map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('');
  return `<table>${cols}${head}<tbody>${body}</tbody></table>`;
}

// CSS knows every paper Socria offers by name, and so does a printer
const PAGE_KEYWORD: Record<string, string> = { letter: 'letter', a4: 'A4', legal: 'legal', a5: 'A5' };
const inches = (n: number) => `${Math.round(n * 1e4) / 1e4}in`;

/**
 * The blocks as HTML — lists as real nested lists, tables as tables,
 * pictures as figures. `standalone` makes a whole page: the title, the
 * writing and the Sources list, set on the document's paper, ready to save or
 * print.
 */
export function toHtml(doc: Pick<WriteDoc, 'title' | 'blocks'> & Partial<Pick<WriteDoc, 'page' | 'font' | 'size'>>, opts: HtmlOpts = {}): string {
  const sources = citedSources(doc);
  const numbers = new Map(sources.map((s) => [s.key, s.n]));
  const sup = (b: Block) => citeMarks(b, numbers, (n) => `<sup><a href="#source-${n}">[${n}]</a></sup>`);
  const out: string[] = [];
  // open lists, innermost last: their tag and depth
  const open: { tag: 'ul' | 'ol'; lvl: number }[] = [];
  const closeTo = (lvl: number, tag?: 'ul' | 'ol') => {
    while (open.length && (open[open.length - 1].lvl > lvl || (open[open.length - 1].lvl === lvl && tag && open[open.length - 1].tag !== tag))) {
      out.push(`</li></${open.pop()!.tag}>`);
    }
  };
  for (const b of doc.blocks) {
    if (isList(b.t)) {
      const tag = b.t as 'ul' | 'ol';
      const lvl = Math.max(1, Math.min(3, b.lvl ?? 1));
      closeTo(lvl, tag);
      const top = open[open.length - 1];
      const li = `<li${styleAttr(paraStyle({ ...b, ind: undefined }))}>`;
      if (top && top.lvl === lvl) out.push(`</li>${li}`);
      else {
        // deeper than anything open: open the levels in between, so the nesting is always valid
        for (let d = (top?.lvl ?? 0) + 1; d <= lvl; d++) {
          out.push(`<${tag}>${d === lvl ? li : '<li>'}`);
          open.push({ tag, lvl: d });
        }
      }
      out.push(inlineHtml(b.text, b.marks) + sup(b));
      continue;
    }
    closeTo(0);
    if (b.t === 'hr') {
      out.push('<hr>');
      continue;
    }
    if (b.t === 'pb') {
      out.push('<div class="page-break" style="break-after:page;page-break-after:always"></div>');
      continue;
    }
    if (b.t === 'img') {
      out.push(pictureHtml(b, opts));
      continue;
    }
    if (b.t === 'table') {
      out.push(tableHtml(b));
      continue;
    }
    if (b.t === 'code') {
      out.push(`<pre${styleAttr(paraStyle(b))}><code>${escapeHtml(b.text)}</code></pre>`);
      continue;
    }
    if (!b.text && b.t === 'p') continue;
    const tag = BLOCK_TAG[b.t] ?? 'p';
    const body = inlineHtml(b.text, b.marks) + sup(b);
    const st = styleAttr(paraStyle(b));
    out.push(tag === 'blockquote' ? `<blockquote${st}><p>${body}</p></blockquote>` : `<${tag}${st}>${body}</${tag}>`);
  }
  closeTo(0);
  const body = out.join('');
  if (!opts.standalone) return body;
  const list = sources.length
    ? `<section class="sources"><h2>Sources</h2><ol>${sources
        .map((s) => `<li id="source-${s.n}">${escapeHtml(s.cite.label)}${s.cite.quote ? ` — <q>${escapeHtml(s.cite.quote)}</q>` : ''}</li>`)
        .join('')}</ol></section>`
    : '';
  const title = doc.title.trim();
  const page = pageOf(doc);
  const paper = paperOf(page);
  const font = fontInfo(doc.font ?? DEFAULT_FONT).css.replace(/var\(--font-sans, Inter\), /, '');
  const size = doc.size ?? DEFAULT_SIZE;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title || 'Untitled')}</title>
<style>
@page{size:${PAGE_KEYWORD[page.size] ?? 'letter'}${page.orient === 'landscape' ? ' landscape' : ''};margin:${page.m.map(inches).join(' ')}}
body{font-family:${font};font-size:${size}pt;line-height:${cssLineHeight(1.15)};color:#23241f;max-width:${inches(Math.max(4, paper.w - page.m[1] - page.m[3]))};margin:3rem auto;padding:0 1.25rem;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3{line-height:1.25;font-weight:600}h1{font-size:1.5em}h2{font-size:1.25em}h3{font-size:1.05em}h1.title{font-size:2.1em;margin-bottom:1.5rem}
p{margin:0 0 .66em}blockquote{margin:1.2em 0;padding-left:1em;border-left:3px solid #c9c4b4;color:#4b4c45}
pre{font-family:'Courier New',Courier,monospace;font-size:.9em;background:#f4f3ef;padding:.75em 1em;border-radius:4px;white-space:pre-wrap}
table{border-collapse:collapse;width:100%;margin:1em 0}td,th{border:1px solid #bdb9ad;padding:4px 7px;vertical-align:top;text-align:left}th{background:#efede6;font-weight:600}
figure{margin:1em 0}figure img{max-width:100%;height:auto}hr{border:0;border-top:1px solid #bdb9ad;margin:1.4em 0}
a{color:#2b5c8a}sup a{text-decoration:none;color:#555}.sources{margin-top:3rem;font-size:.92rem;border-top:1px solid #ddd}
@media print{body{max-width:none;margin:0;padding:0}a{color:inherit}.page-break{break-after:page}}
</style></head><body>
${title ? `<h1 class="title">${escapeHtml(title)}</h1>\n` : ''}${body}
${list}
</body></html>
`;
}

// ── Markdown ─────────────────────────────────────────────────────────

/** Characters Markdown would read as formatting, escaped so the words come back as words. */
function mdEscape(s: string): string {
  return s.replace(/([\\`*_[\]<>|~])/g, '\\$1');
}

function mdSegment(seg: Segment): string {
  // emphasis cannot open or close on a space in Markdown: keep the spaces outside it
  const lead = seg.text.match(/^\s*/)![0];
  const trail = seg.text.slice(lead.length).match(/\s*$/)![0];
  const core = seg.text.slice(lead.length, seg.text.length - trail.length);
  if (!core) return seg.text.replace(/\n/g, '  \n');
  let m = mdEscape(core).replace(/\n/g, '  \n');
  if (seg.on.includes('sub')) m = `<sub>${m}</sub>`;
  if (seg.on.includes('sup')) m = `<sup>${m}</sup>`;
  if (seg.on.includes('u')) m = `<u>${m}</u>`;
  if (seg.on.includes('s')) m = `~~${m}~~`;
  if (seg.on.includes('i')) m = `*${m}*`;
  if (seg.on.includes('b')) m = `**${m}**`;
  return lead + m + trail;
}

/** Inline Markdown: emphasis as asterisks, struck words as tildes, a link's words — however they are dressed — in one link. */
function mdInline(text: string, marks?: readonly Mark[]): string {
  const segs = segments(text, marks);
  const out: string[] = [];
  for (let k = 0; k < segs.length; ) {
    const href = segs[k].val.a;
    if (!href) {
      out.push(mdSegment(segs[k]));
      k++;
      continue;
    }
    let inner = '';
    while (k < segs.length && segs[k].val.a === href) inner += mdSegment(segs[k++]);
    out.push(`[${inner}](${href.replace(/\)/g, '%29').replace(/ /g, '%20')})`);
  }
  return out.join('');
}

/** A line Markdown would take for a heading, list or quote, when it is just words. */
function mdLineStart(s: string): string {
  return s
    .replace(/^(\s*)(#{1,6}\s|>|[-+]\s)/, (_, sp, mark) => `${sp}\\${mark}`)
    .replace(/^(\s*\d+)([.)]\s)/, (_, n, mark) => `${n}\\${mark}`);
}

export interface MarkdownOpts {
  /** a picture's address in the Markdown — a data address keeps it in the file; none leaves its description */
  src?: (b: Block) => string | null;
}

function mdTable(b: Block): string {
  const rows = b.rows ?? [];
  if (!rows.length) return '';
  const cell = (c: Block) => mdInline(c.text, c.marks).replace(/ {2}\n/g, '<br>').replace(/\n/g, '<br>') || ' ';
  const width = rows[0].length;
  const line = (r: Block[]) => `| ${r.map(cell).join(' | ')} |`;
  const rule = `| ${Array.from({ length: width }, (_, k) => {
    const a = rows[0][k]?.align;
    return a === 'center' ? ':---:' : a === 'right' ? '---:' : '---';
  }).join(' | ')} |`;
  return [line(rows[0]), rule, ...rows.slice(1).map(line)].join('\n');
}

export function toMarkdown(doc: Pick<WriteDoc, 'title' | 'blocks'>, opts: MarkdownOpts = {}): string {
  const sources = citedSources(doc);
  const numbers = new Map(sources.map((s) => [s.key, s.n]));
  const notes = (b: Block) => citeMarks(b, numbers, (n) => `[^${n}]`);
  const out: string[] = [];
  if (doc.title.trim()) out.push(`# ${mdEscape(doc.title.trim())}`, '');
  const counters: number[] = [0, 0, 0, 0];
  let prevList = false;
  for (const b of doc.blocks) {
    if (isList(b.t)) {
      const body = mdInline(b.text, b.marks) + notes(b);
      const lvl = Math.max(1, Math.min(3, b.lvl ?? 1));
      for (let d = lvl + 1; d <= 3; d++) counters[d] = 0;
      counters[lvl] = b.t === 'ol' ? counters[lvl] + 1 : 0;
      const marker = b.t === 'ol' ? `${counters[lvl]}.` : '-';
      out.push(`${'   '.repeat(lvl - 1)}${marker} ${body.replace(/\n/g, '\n' + '   '.repeat(lvl))}`);
      prevList = true;
      continue;
    }
    if (prevList) out.push('');
    prevList = false;
    counters.fill(0);
    if (b.t === 'hr') {
      out.push('---', '');
      continue;
    }
    if (b.t === 'pb') {
      out.push('<div style="page-break-after: always;"></div>', '');
      continue;
    }
    if (b.t === 'img') {
      const src = opts.src?.(b) ?? null;
      out.push(src ? `![${mdEscape(b.alt ?? '')}](${src})` : `*\\[${mdEscape(b.alt ? `Picture: ${b.alt}` : 'Picture')}\\]*`, '');
      continue;
    }
    if (b.t === 'table') {
      out.push(mdTable(b), '');
      continue;
    }
    if (b.t === 'code') {
      const run = Math.max(2, ...Array.from(b.text.matchAll(/`+/g)).map((m) => m[0].length));
      const fence = '`'.repeat(run + 1);
      out.push(`${fence}\n${b.text}\n${fence}`, '');
      continue;
    }
    if (!b.text.trim() && b.t === 'p') continue;
    const body = mdInline(b.text, b.marks) + notes(b);
    if (b.t === 'h1') out.push(`# ${body}`);
    else if (b.t === 'h2') out.push(`## ${body}`);
    else if (b.t === 'h3') out.push(`### ${body}`);
    else if (b.t === 'quote') out.push(body.split('\n').map((l) => `> ${l}`).join('\n'));
    else out.push(mdLineStart(body));
    out.push('');
  }
  if (prevList) out.push('');
  if (sources.length) {
    for (const s of sources) out.push(`[^${s.n}]: ${mdEscape(s.cite.label)}${s.cite.quote ? ` — “${mdEscape(s.cite.quote)}”` : ''}`);
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ── plain text ───────────────────────────────────────────────────────

/** A page break in plain text: the form feed printers have always read as one. */
export const FORM_FEED = '\f';

export function toText(doc: Pick<WriteDoc, 'title' | 'blocks'>): string {
  const sources = citedSources(doc);
  const numbers = new Map(sources.map((s) => [s.key, s.n]));
  const notes = (b: Block) => citeMarks(b, numbers, (n) => `[${n}]`);
  const out: string[] = [];
  if (doc.title.trim()) out.push(doc.title.trim(), '');
  const counters: number[] = [0, 0, 0, 0];
  let prevList = false;
  for (const b of doc.blocks) {
    if (isList(b.t)) {
      const lvl = Math.max(1, Math.min(3, b.lvl ?? 1));
      for (let d = lvl + 1; d <= 3; d++) counters[d] = 0;
      counters[lvl] = b.t === 'ol' ? counters[lvl] + 1 : 0;
      out.push(`${'  '.repeat(lvl - 1)}${b.t === 'ol' ? `${counters[lvl]}.` : '•'} ${b.text}${notes(b)}`);
      prevList = true;
      continue;
    }
    if (prevList) out.push('');
    prevList = false;
    counters.fill(0);
    if (b.t === 'hr') {
      out.push('* * *', '');
      continue;
    }
    if (b.t === 'pb') {
      out.push(FORM_FEED);
      continue;
    }
    if (b.t === 'img') {
      out.push(`[${b.alt ? `Picture: ${b.alt}` : 'Picture'}]`, '');
      continue;
    }
    if (b.t === 'table') {
      if (b.text.trim()) out.push(b.text, '');
      continue;
    }
    if (!b.text.trim() && b.t === 'p') continue;
    out.push(b.t === 'quote' ? b.text.split('\n').map((l) => `    ${l}`).join('\n') + notes(b) : b.text + notes(b), '');
  }
  if (sources.length) {
    out.push('Sources', '');
    for (const s of sources) out.push(`[${s.n}] ${s.cite.label}${s.cite.quote ? ` — “${s.cite.quote}”` : ''}`);
  }
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\n*\f\n*/g, '\n\f\n')
      .trim() + '\n'
  );
}

/** A file name from the title, safe on every system. */
export function fileNameFor(title: string, ext: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s.-]+/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return `${base || 'Untitled'}.${ext}`;
}
