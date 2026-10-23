// lib/write/render.ts — the writing, as HTML, Markdown and plain text.
//
// What leaves Socria is exactly what was written: the same words, in the same
// order, with the same headings, lists and emphasis. Citations are the
// passages the person chose, numbered in order of first use, with a Sources
// list built from what was read — never from anything a model said.
//
// PURE.

import { citedSources, isList, type Block, type Mark, type MarkType, type WriteDoc } from './doc';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

const TAG: Record<MarkType, string> = { b: 'strong', i: 'em', u: 'u' };
const ORDER: MarkType[] = ['b', 'i', 'u'];

/** Segments of a block's text, each with the marks it carries — the one walk every renderer shares. */
export function segments(text: string, marks: readonly Mark[] | undefined): { text: string; on: MarkType[] }[] {
  if (!marks?.length) return text ? [{ text, on: [] }] : [];
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) {
    cuts.add(Math.max(0, Math.min(text.length, m.s)));
    cuts.add(Math.max(0, Math.min(text.length, m.e)));
  }
  const at = Array.from(cuts).sort((a, b) => a - b);
  const out: { text: string; on: MarkType[] }[] = [];
  for (let k = 0; k < at.length - 1; k++) {
    const s = at[k];
    const e = at[k + 1];
    if (e <= s) continue;
    const on = ORDER.filter((t) => marks.some((m) => m.t === t && m.s <= s && m.e >= e));
    const last = out[out.length - 1];
    if (last && last.on.join() === on.join()) last.text += text.slice(s, e);
    else out.push({ text: text.slice(s, e), on });
  }
  return out;
}

/** A block's words as inline HTML: escaped, emphasis as tags, line breaks as <br>. */
export function inlineHtml(text: string, marks?: readonly Mark[]): string {
  return segments(text, marks)
    .map((seg) => {
      let h = escapeHtml(seg.text).replace(/\n/g, '<br>');
      for (let k = seg.on.length - 1; k >= 0; k--) h = `<${TAG[seg.on[k]]}>${h}</${TAG[seg.on[k]]}>`;
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

/**
 * The blocks as HTML — lists as real nested lists. `standalone` makes a whole
 * page: the title, the writing and the Sources list, ready to save or print.
 */
export function toHtml(doc: Pick<WriteDoc, 'title' | 'blocks'>, opts: { standalone?: boolean } = {}): string {
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
      if (top && top.lvl === lvl) out.push('</li><li>');
      else {
        // deeper than anything open: open the levels in between, so the nesting is always valid
        for (let d = (top?.lvl ?? 0) + 1; d <= lvl; d++) {
          out.push(`<${tag}><li>`);
          open.push({ tag, lvl: d });
        }
      }
      out.push(inlineHtml(b.text, b.marks) + sup(b));
      continue;
    }
    closeTo(0);
    if (!b.text && b.t === 'p') continue;
    const tag = BLOCK_TAG[b.t] ?? 'p';
    const body = inlineHtml(b.text, b.marks) + sup(b);
    out.push(tag === 'blockquote' ? `<blockquote><p>${body}</p></blockquote>` : `<${tag}>${body}</${tag}>`);
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
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title || 'Untitled')}</title>
<style>
body{font:17px/1.65 Georgia,'Times New Roman',serif;color:#23241f;max-width:42rem;margin:3rem auto;padding:0 1.25rem}
h1,h2,h3{line-height:1.25;font-weight:600}h1.title{font-size:2.1rem;margin-bottom:1.5rem}
blockquote{margin:1.2em 0;padding-left:1em;border-left:3px solid #c9c4b4;color:#4b4c45}
sup a{text-decoration:none;color:#555}.sources{margin-top:3rem;font-size:.92rem;border-top:1px solid #ddd}
@media print{body{margin:0 auto}a{color:inherit}}
</style></head><body>
${title ? `<h1 class="title">${escapeHtml(title)}</h1>\n` : ''}${body}
${list}
</body></html>
`;
}

// ── Markdown ─────────────────────────────────────────────────────────

/** Characters Markdown would read as formatting, escaped so the words come back as words. */
function mdEscape(s: string): string {
  return s.replace(/([\\`*_[\]<>|])/g, '\\$1');
}

function mdInline(text: string, marks?: readonly Mark[]): string {
  return segments(text, marks)
    .map((seg) => {
      // emphasis cannot open or close on a space in Markdown: keep the spaces outside it
      const lead = seg.text.match(/^\s*/)![0];
      const trail = seg.text.slice(lead.length).match(/\s*$/)![0];
      const core = seg.text.slice(lead.length, seg.text.length - trail.length);
      if (!core) return seg.text.replace(/\n/g, '  \n');
      let m = mdEscape(core).replace(/\n/g, '  \n');
      if (seg.on.includes('u')) m = `<u>${m}</u>`;
      if (seg.on.includes('i')) m = `*${m}*`;
      if (seg.on.includes('b')) m = `**${m}**`;
      return lead + m + trail;
    })
    .join('');
}

/** A line Markdown would take for a heading, list or quote, when it is just words. */
function mdLineStart(s: string): string {
  return s
    .replace(/^(\s*)(#{1,6}\s|>|[-+]\s)/, (_, sp, mark) => `${sp}\\${mark}`)
    .replace(/^(\s*\d+)([.)]\s)/, (_, n, mark) => `${n}\\${mark}`);
}

export function toMarkdown(doc: Pick<WriteDoc, 'title' | 'blocks'>): string {
  const sources = citedSources(doc);
  const numbers = new Map(sources.map((s) => [s.key, s.n]));
  const notes = (b: Block) => citeMarks(b, numbers, (n) => `[^${n}]`);
  const out: string[] = [];
  if (doc.title.trim()) out.push(`# ${mdEscape(doc.title.trim())}`, '');
  const counters: number[] = [0, 0, 0, 0];
  let prevList = false;
  for (const b of doc.blocks) {
    const body = mdInline(b.text, b.marks) + notes(b);
    if (isList(b.t)) {
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
    if (!b.text.trim() && b.t === 'p') continue;
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
    if (!b.text.trim() && b.t === 'p') continue;
    out.push(b.t === 'quote' ? b.text.split('\n').map((l) => `    ${l}`).join('\n') + notes(b) : b.text + notes(b), '');
  }
  if (sources.length) {
    out.push('Sources', '');
    for (const s of sources) out.push(`[${s.n}] ${s.cite.label}${s.cite.quote ? ` — “${s.cite.quote}”` : ''}`);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
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
