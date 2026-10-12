// lib/docs/plain.ts — documents that are text already: Markdown, plain text,
// CSV and TSV, LaTeX, Jupyter notebooks, and code.
//
// Text needs no extraction, but it still has structure the old path threw
// away by handing it to a model as one undifferentiated string: Markdown's
// headings, lists, tables and equations; a CSV's rows and columns; a LaTeX
// paper's sections, equations and tabulars; a notebook's cells. Each is read
// here into the same blocks, tables and figures as any other document, so a
// table in a Markdown file can become a chart and an equation in a .tex file
// can be graphed.
//
// What each block says is the file's own text — inline markup ("**", "`",
// link targets) is taken off, nothing else is changed.
//
// PURE — strings in. Runs in the browser as well as on the server.

import { DocBuilder, type MediaRef, type ReaderOut } from './build';
import { readHtml } from './html';
import { guessHead } from './office';
import { CAPTION, LIST_MARK } from './text';
import type { DocCheck, DocFormat } from './types';

const BUDGET = 300_000;
const MAX_ROWS = 400;

/** The format a text file is read as, from its name. */
export function plainFormat(name: string): DocFormat {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
  if (ext === 'md' || ext === 'markdown' || ext === 'rst' || ext === 'org') return 'md';
  if (ext === 'csv') return 'csv';
  if (ext === 'tsv' || ext === 'tab') return 'tsv';
  if (ext === 'tex' || ext === 'latex') return 'tex';
  if (ext === 'ipynb') return 'ipynb';
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return 'html';
  return CODE.has(ext) ? 'code' : 'txt';
}

/** Files that are programs or data a program reads: kept line for line, as code. */
const CODE = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sql', 'sh', 'bash', 'zsh', 'r', 'm', 'scala', 'lua', 'pl', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'graphql', 'proto', 'dart', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'bib']);

// ── inline Markdown ─────────────────────────────────────────────────

/** Markdown's inline markup taken off, its words kept. */
export function mdInline(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^()\s]|\([^)]*\))*(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/<\/?(?:span|b|i|em|strong|u|sub|sup|small|mark|kbd|code|a|br)\b[^>]*>/gi, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** The text a Markdown file holds for the checks: its words, without link targets or comments. */
const mdRaw = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\]\((?:[^()\s]|\([^)]*\))*(?:\s+"[^"]*")?\)/g, ']')
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1');

const splitRow = (line: string) => {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (t[i] === '|') {
      cells.push(cur);
      cur = '';
    } else cur += t[i];
  }
  cells.push(cur);
  return cells.map((c) => mdInline(c));
};

const DELIM_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Markdown into blocks, in one page. */
function readMarkdown(b: DocBuilder, text: string, notes: DocCheck[], page = 1): void {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  // front matter: its title is the document's; the rest is settings
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, j) => j > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) {
      const title = lines.slice(1, end).map((l) => /^title:\s*["']?(.*?)["']?\s*$/.exec(l)?.[1]).find(Boolean);
      if (title) b.block({ page, kind: 'title', text: title });
      i = end + 1;
    }
  }
  let para: string[] = [];
  const flush = () => {
    if (!para.length) return;
    const t = mdInline(para.join(' '));
    para = [];
    if (!t) return;
    // an image alone in its paragraph is a figure
    b.block({ page, kind: CAPTION.test(t) ? 'caption' : 'paragraph', text: t });
  };
  while (i < lines.length) {
    if (b.chars > BUDGET) {
      notes.push({ id: 'unread', level: 'warn', says: `The file is longer than Socria reads at once: it was read to line ${i}.` });
      return;
    }
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flush();
      i++;
      continue;
    }
    // fenced code (and fenced math)
    const fence = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)/.exec(line);
    if (fence) {
      flush();
      const close = new RegExp(`^\\s*${fence[2][0]}{${fence[2].length},}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i++;
      const src = body.join('\n');
      if (/^(math|latex|tex|katex)$/i.test(fence[3])) b.block({ page, kind: 'equation', text: src.trim(), tex: src.trim() });
      else if (src.trim()) b.block({ page, kind: 'code', text: src });
      continue;
    }
    // display math
    if (/^\$\$/.test(t) || /^\\\[/.test(t)) {
      flush();
      const closer = /^\$\$/.test(t) ? /\$\$\s*$/ : /\\\]\s*$/;
      const body: string[] = [t.replace(/^\$\$|^\\\[/, '')];
      if (!(closer.test(body[0]) && body[0].trim().length > 0)) {
        i++;
        while (i < lines.length && !closer.test(lines[i])) body.push(lines[i++]);
        if (i < lines.length) body.push(lines[i]);
      }
      i++;
      const src = body.join('\n').replace(/\$\$\s*$|\\\]\s*$/, '').trim();
      if (src) b.block({ page, kind: 'equation', text: src, tex: src });
      continue;
    }
    // headings
    const atx = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(t);
    if (atx) {
      flush();
      b.block({ page, kind: 'heading', level: atx[1].length, text: mdInline(atx[2]) });
      i++;
      continue;
    }
    if (para.length === 1 && /^(=+|-+)\s*$/.test(t) && !LIST_MARK.test(para[0])) {
      const h = mdInline(para[0]);
      para = [];
      b.block({ page, kind: 'heading', level: t.startsWith('=') ? 1 : 2, text: h });
      i++;
      continue;
    }
    if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(t)) {
      flush();
      i++;
      continue;
    }
    // tables
    if (t.includes('|') && i + 1 < lines.length && DELIM_ROW.test(lines[i + 1]) && !DELIM_ROW.test(line)) {
      flush();
      const rows = [splitRow(line)];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      const width = Math.max(...rows.map((r) => r.length));
      for (const r of rows) while (r.length < width) r.push('');
      b.table({ page, rows: rows.slice(0, MAX_ROWS), head: 1 });
      if (rows.length > MAX_ROWS) notes.push({ id: 'unread', level: 'warn', says: `A table of ${rows.length} rows was read to row ${MAX_ROWS}.`, pages: [page] });
      continue;
    }
    // quotes
    if (/^>/.test(t)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      const q = mdInline(body.join(' '));
      if (q) b.block({ page, kind: 'quote', text: q });
      continue;
    }
    // list items, with their continuation lines
    const li = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const indent = li[1].replace(/\t/g, '    ').length;
      const body = [li[3]];
      i++;
      while (i < lines.length && lines[i].trim() && !/^\s*([-*+]|\d{1,9}[.)])\s+/.test(lines[i]) && /^\s{2,}/.test(lines[i])) body.push(lines[i++].trim());
      const marker = /^\d/.test(li[2]) ? `${li[2]} ` : '';
      const text = mdInline(`${marker}${body.join(' ')}`);
      if (text) b.block({ page, kind: 'list', level: Math.min(4, Math.floor(indent / 2) + 1), text });
      continue;
    }
    // images alone on a line
    const img = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/.exec(t);
    if (img) {
      flush();
      const alt = img[1].trim();
      b.figure({ page, kind: 'image', ...(alt ? { alt } : {}) }, [alt, img[3]].filter(Boolean).join('\n'));
      i++;
      continue;
    }
    // indented code
    if (/^( {4}|\t)/.test(line) && !para.length) {
      const body: string[] = [];
      while (i < lines.length && (/^( {4}|\t)/.test(lines[i]) || !lines[i].trim())) body.push(lines[i++].replace(/^( {4}|\t)/, ''));
      const src = body.join('\n').replace(/\s+$/, '');
      if (src) b.block({ page, kind: 'code', text: src });
      continue;
    }
    para.push(t);
    i++;
  }
  flush();
}

// ── plain text ──────────────────────────────────────────────────────

const cellsOf = (line: string) => line.trim().split(/\t+| {2,}/).map((c) => c.trim());

/** Plain text: paragraphs at blank lines, pages at form feeds, lists, headings set in capitals or underlined, columns as tables. */
function readText(b: DocBuilder, text: string, notes: DocCheck[]): number {
  const pages = text.replace(/\r\n?/g, '\n').split('\f');
  pages.forEach((pageText, pi) => {
    const page = pi + 1;
    if (b.chars > BUDGET) return;
    const lines = pageText.split('\n');
    let i = 0;
    while (i < lines.length) {
      if (b.chars > BUDGET) {
        notes.push({ id: 'unread', level: 'warn', says: `The file is longer than Socria reads at once: it was read to page ${page}, line ${i}.` });
        return;
      }
      const t = lines[i].trim();
      if (!t) {
        i++;
        continue;
      }
      // a run of lines in the same columns, holding numbers: a table
      const width = cellsOf(lines[i]).length;
      if (width >= 2) {
        let j = i;
        while (j < lines.length && lines[j].trim() && cellsOf(lines[j]).length === width) j++;
        const rows = lines.slice(i, j).map(cellsOf);
        if (rows.length >= 3 && rows.slice(1).some((r) => r.some((c) => /\d/.test(c))) && rows.every((r) => r.every((c) => c.length <= 60))) {
          b.table({ page, rows: rows.slice(0, MAX_ROWS), head: guessHead(rows) });
          i = j;
          continue;
        }
      }
      // an underlined heading
      if (i + 1 < lines.length && /^(=+|-+)\s*$/.test(lines[i + 1].trim()) && lines[i + 1].trim().length >= Math.min(3, t.length)) {
        b.block({ page, kind: 'heading', level: lines[i + 1].trim().startsWith('=') ? 1 : 2, text: t });
        i += 2;
        continue;
      }
      // a short line in capitals, standing alone: a heading
      if (/^[^a-z]*[A-Z][^a-z]*$/.test(t) && t.split(/\s+/).length <= 10 && /[A-Z]{2}/.test(t) && !lines[i + 1]?.trim()) {
        b.block({ page, kind: 'heading', level: 1, text: t });
        i++;
        continue;
      }
      // a paragraph — or a list, when every line starts with a marker
      const body: string[] = [];
      while (i < lines.length && lines[i].trim()) body.push(lines[i++].trim());
      if (body.every((l) => LIST_MARK.test(l))) for (const l of body) b.block({ page, kind: 'list', level: 1, text: l });
      else {
        // hyphenated words broken across lines are left as written: plain text has no line wrapping to undo
        const joined = body.join(' ');
        b.block({ page, kind: CAPTION.test(joined) ? 'caption' : 'paragraph', text: joined });
      }
    }
  });
  return pages.length;
}

// ── CSV and TSV ─────────────────────────────────────────────────────

/** RFC 4180: quoted fields, doubled quotes, line breaks inside quotes. */
export function parseDelimited(text: string, delim: string, maxRows = 100_000): { rows: string[][]; more: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const s = text.replace(/^﻿/, '');
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && !cell.trim()) {
      quoted = true;
      cell = '';
      i++;
      continue;
    }
    if (ch === delim) {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      if (rows.length >= maxRows) return { rows, more: true };
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += ch;
    i++;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return { rows, more: false };
}

/** Which character separates the columns: the one splitting the first lines most consistently. */
export function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => parseDelimited(l, d).rows[0]?.length ?? 1);
    const first = counts[0] ?? 1;
    if (first < 2) continue;
    const same = counts.filter((c) => c === first).length / counts.length;
    const score = same * 10 + Math.min(first, 10) / 10;
    if (score > bestScore) [best, bestScore] = [d, score];
  }
  return best;
}

// ── LaTeX ───────────────────────────────────────────────────────────

/** A LaTeX argument {…}, balanced, starting at s[i] === '{'. */
function braced(s: string, i: number): { body: string; end: number } | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') {
      j++;
      continue;
    }
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return { body: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

/** LaTeX prose with its commands taken off and their words kept; mathematics kept as written. */
export function texInline(s: string): string {
  let out = s
    // a label is an anchor, not text; a reference or citation keeps its key, in brackets
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\(?:cite[tp]?|ref|eqref|autoref|cref|Cref|pageref)\*?(?:\[[^\]]*\])*\{([^}]*)\}/g, '[$1]')
    .replace(/\\(?:footnote)\{/g, ' (')
    .replace(/\\(?:textbf|textit|emph|texttt|textsf|textrm|underline|textsc|mbox|text|hbox|uline|textup|textmd)\{/g, '{')
    .replace(/\\(?:url|href)\{([^}]*)\}(?:\{([^}]*)\})?/g, (_, u, t) => t ?? u)
    .replace(/~/g, ' ')
    .replace(/\\%/g, '%')
    .replace(/\\&/g, '&')
    .replace(/\\\$/g, '$')
    .replace(/\\_/g, '_')
    .replace(/\\#/g, '#')
    .replace(/``|''/g, '"')
    .replace(/\\(?:noindent|centering|small|large|Large|footnotesize|normalsize|bigskip|medskip|smallskip|newline|linebreak|par|clearpage|newpage|maketitle|tableofcontents|hfill|vfill|quad|qquad)\b\s*/g, ' ')
    .replace(/\\\\/g, ' ');
  // braces that only grouped words go
  out = out.replace(/(?<!\\)[{}]/g, '');
  return out.replace(/[ \t]+/g, ' ').trim();
}

const MATH_ENVS = /^(equation|align|gather|multline|eqnarray|displaymath|math|flalign|alignat)\*?$/;

/** A LaTeX source into blocks: sections, equations, lists, tables, figures and captions. */
function readTex(b: DocBuilder, src: string, notes: DocCheck[]): void {
  const page = 1;
  // comments off (an escaped \% stays)
  const text = src.replace(/(^|[^\\])%.*$/gm, '$1').replace(/\r\n?/g, '\n');
  const docStart = text.indexOf('\\begin{document}');
  const preamble = docStart >= 0 ? text.slice(0, docStart) : '';
  let body = docStart >= 0 ? text.slice(docStart + '\\begin{document}'.length) : text;
  const docEnd = body.indexOf('\\end{document}');
  if (docEnd >= 0) body = body.slice(0, docEnd);
  const titleCmd = /\\title(?:\[[^\]]*\])?\{/.exec(preamble) ?? /\\title(?:\[[^\]]*\])?\{/.exec(body);
  if (titleCmd) {
    const src2 = preamble.includes(titleCmd[0]) ? preamble : body;
    const t = braced(src2, src2.indexOf(titleCmd[0]) + titleCmd[0].length - 1);
    if (t) b.block({ page, kind: 'title', text: texInline(t.body) });
  }
  let para: string[] = [];
  const flush = () => {
    const t = texInline(para.join(' '));
    para = [];
    if (t) b.block({ page, kind: 'paragraph', text: t });
  };
  let i = 0;
  const env = /\\begin\{([A-Za-z*]+)\}/y;
  while (i < body.length) {
    if (b.chars > BUDGET) {
      notes.push({ id: 'unread', level: 'warn', says: 'The file is longer than Socria reads at once; its end was not read.' });
      return;
    }
    // blank line: a paragraph ends
    if (body[i] === '\n' && /^\n[ \t]*\n/.test(body.slice(i, i + 40))) {
      flush();
      i = body.indexOf('\n', i + 1) + 1 || body.length;
      continue;
    }
    if (body[i] === '\\') {
      const rest = body.slice(i);
      const sec = /^\\(part|chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\{/.exec(rest);
      if (sec) {
        flush();
        const arg = braced(body, i + sec[0].length - 1);
        if (arg) {
          const level = { part: 1, chapter: 1, section: 1, subsection: 2, subsubsection: 3, paragraph: 4 }[sec[1]] ?? 1;
          b.block({ page, kind: 'heading', level, text: texInline(arg.body) });
          i = arg.end;
          continue;
        }
      }
      if (/^\\\[/.test(rest)) {
        flush();
        const end = body.indexOf('\\]', i + 2);
        const m = body.slice(i + 2, end < 0 ? body.length : end).trim();
        if (m) b.block({ page, kind: 'equation', text: m, tex: m });
        i = end < 0 ? body.length : end + 2;
        continue;
      }
      env.lastIndex = i;
      const e = env.exec(body);
      if (e) {
        const name = e[1];
        const close = `\\end{${name}}`;
        const end = body.indexOf(close, env.lastIndex);
        let inner = body.slice(env.lastIndex, end < 0 ? body.length : end);
        const next = end < 0 ? body.length : end + close.length;
        if (MATH_ENVS.test(name)) {
          flush();
          const m = inner.replace(/\\label\{[^}]*\}/g, '').replace(/\\(?:nonumber|notag)\b/g, '').trim();
          if (m) b.block({ page, kind: 'equation', text: m, tex: m });
          i = next;
          continue;
        }
        if (name === 'itemize' || name === 'enumerate' || name === 'description') {
          flush();
          let n = 0;
          for (const item of inner.split(/\\item\b/).slice(1)) {
            const label = /^\s*\[([^\]]*)\]/.exec(item);
            const t = texInline(item.replace(/^\s*\[[^\]]*\]/, '').replace(/\\begin\{(itemize|enumerate)\}[\s\S]*?\\end\{\1\}/g, ''));
            n++;
            if (t) b.block({ page, kind: 'list', level: 1, text: name === 'enumerate' ? `${n}. ${t}` : label ? `${texInline(label[1])} ${t}` : t });
          }
          i = next;
          continue;
        }
        if (name === 'tabular' || name === 'tabular*' || name === 'tabularx' || name === 'longtable') {
          flush();
          const spec = /^\s*(?:\{[^}]*\})?\s*\{[^}]*\}/.exec(inner);
          const content = spec ? inner.slice(spec[0].length) : inner;
          const rows = content
            .replace(/\\(?:hline|toprule|midrule|bottomrule|cline\{[^}]*\}|cmidrule(?:\([^)]*\))?\{[^}]*\})/g, '')
            .split(/\\\\(?:\[[^\]]*\])?/)
            .map((r) => r.trim())
            .filter(Boolean)
            .map((r) => r.split(/(?<!\\)&/).map((c) => texInline(c.replace(/\\multicolumn\{\d+\}\{[^}]*\}\{([^}]*)\}/g, '$1'))));
          if (rows.length) {
            const width = Math.max(...rows.map((r) => r.length));
            for (const r of rows) while (r.length < width) r.push('');
            b.table({ page, rows: rows.slice(0, MAX_ROWS), head: guessHead(rows) });
          }
          i = next;
          continue;
        }
        if (name === 'figure' || name === 'figure*' || name === 'table' || name === 'table*') {
          flush();
          // the float's tabular is read in place; its caption becomes a caption block beside it
          inner = inner.replace(/^\s*\[[^\]]*\]/, '');
          const cap = /\\caption(?:\[[^\]]*\])?\{/.exec(inner);
          const caption = cap ? braced(inner, cap.index + cap[0].length - 1) : null;
          const graphic = /\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}/.exec(inner);
          const without = caption ? inner.slice(0, cap!.index) + inner.slice(caption.end) : inner;
          if (name.startsWith('table') && caption) b.block({ page, kind: 'caption', text: texInline(caption.body) });
          if (name.startsWith('figure')) b.figure({ page, kind: 'image', ...(graphic ? { alt: graphic[1] } : {}) }, graphic?.[1] ?? '');
          readTex(b, `\\begin{document}${without.replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, '').replace(/\\(?:centering|label\{[^}]*\})/g, '')}\\end{document}`, notes);
          if (name.startsWith('figure') && caption) b.block({ page, kind: 'caption', text: texInline(caption.body) });
          i = next;
          continue;
        }
        if (name === 'abstract' || name === 'quote' || name === 'quotation') {
          flush();
          const t = texInline(inner);
          if (t) b.block({ page, kind: name === 'abstract' ? 'paragraph' : 'quote', text: t });
          i = next;
          continue;
        }
        if (name === 'verbatim' || name === 'lstlisting' || name === 'minted') {
          flush();
          const code = inner.replace(/^\{[^}]*\}/, '').replace(/^\s*\n/, '').replace(/\s+$/, '');
          if (code) b.block({ page, kind: 'code', text: code });
          i = next;
          continue;
        }
        // any other environment: its contents read in place
        i = env.lastIndex;
        continue;
      }
      if (/^\\end\{/.test(rest)) {
        i += /^\\end\{[^}]*\}/.exec(rest)?.[0].length ?? 1;
        continue;
      }
      if (/^\\(?:title|author|date|thanks|bibliographystyle|bibliography|usepackage|documentclass|newcommand|renewcommand|def|input|include)\b/.test(rest)) {
        const cmd = /^\\[A-Za-z]+\*?(?:\[[^\]]*\])?/.exec(rest)![0];
        const arg = braced(body, i + cmd.length);
        if (/^\\author/.test(cmd) && arg) {
          flush();
          const t = texInline(arg.body.replace(/\\and\b/g, ', ').replace(/\\thanks\{[^}]*\}/g, ''));
          if (t) b.block({ page, kind: 'paragraph', text: t });
        }
        i = arg ? arg.end : i + cmd.length;
        continue;
      }
    }
    // display math $$…$$
    if (body.startsWith('$$', i)) {
      flush();
      const end = body.indexOf('$$', i + 2);
      const m = body.slice(i + 2, end < 0 ? body.length : end).trim();
      if (m) b.block({ page, kind: 'equation', text: m, tex: m });
      i = end < 0 ? body.length : end + 2;
      continue;
    }
    const nl = body.indexOf('\n', i);
    const stop = [nl, body.indexOf('\\begin{', i + 1), body.indexOf('\\section', i + 1), body.indexOf('\\subsection', i + 1), body.indexOf('\\[', i + 1), body.indexOf('$$', i + 1)].filter((x) => x > i);
    const until = stop.length ? Math.min(...stop) : body.length;
    para.push(body.slice(i, until));
    i = until === nl ? nl + 1 : until;
    if (until === nl) para.push(' ');
  }
  flush();
}

// ── Jupyter notebooks ───────────────────────────────────────────────

interface NbCell {
  cell_type?: string;
  source?: string | string[];
  outputs?: { output_type?: string; text?: string | string[]; data?: Record<string, string | string[]> }[];
}

const joined = (s: string | string[] | undefined) => (Array.isArray(s) ? s.join('') : (s ?? ''));

function readNotebook(b: DocBuilder, text: string, notes: DocCheck[], figureIndex: { i: number; dataUrl: string }[]): string {
  let nb: { cells?: NbCell[] };
  try {
    nb = JSON.parse(text);
  } catch {
    throw new Error('it is not a notebook Socria can read (its JSON is damaged)');
  }
  const raw: string[] = [];
  for (const cell of nb.cells ?? []) {
    if (b.chars > BUDGET) {
      notes.push({ id: 'unread', level: 'warn', says: 'The notebook is longer than Socria reads at once; its last cells were not read.' });
      break;
    }
    const src = joined(cell.source);
    if (cell.cell_type === 'markdown') {
      readMarkdown(b, src, notes);
      raw.push(mdRaw(src));
    } else if (cell.cell_type === 'code') {
      if (src.trim()) {
        b.block({ page: 1, kind: 'code', text: src.replace(/\s+$/, '') });
        raw.push(src);
      }
      for (const o of cell.outputs ?? []) {
        const out = joined(o.text ?? o.data?.['text/plain']);
        const png = o.data?.['image/png'];
        if (png) {
          const i = b.figure({ page: 1, kind: 'image' });
          figureIndex.push({ i, dataUrl: `data:image/png;base64,${joined(png).replace(/\s+/g, '')}` });
        } else if (out.trim()) {
          b.block({ page: 1, kind: 'code', text: out.replace(/\s+$/, '').slice(0, 6000) });
          raw.push(out.slice(0, 6000));
        }
      }
    }
  }
  return raw.join('\n');
}

// ── code ────────────────────────────────────────────────────────────

/** A program in blocks of whole lines, broken at blank lines, none over ~80 lines. */
function readCode(b: DocBuilder, text: string, notes: DocCheck[]): void {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let cur: string[] = [];
  const flush = () => {
    const t = cur.join('\n').replace(/\s+$/, '');
    cur = [];
    if (t.trim()) b.block({ page: 1, kind: 'code', text: t });
  };
  for (const l of lines) {
    if (b.chars > BUDGET) {
      notes.push({ id: 'unread', level: 'warn', says: 'The file is longer than Socria reads at once; its end was not read.' });
      return;
    }
    cur.push(l);
    if ((cur.length >= 40 && !l.trim()) || cur.length >= 80) flush();
  }
  flush();
}

// ── the reader ──────────────────────────────────────────────────────

/** A text document into a SourceDoc. */
export function readPlain(name: string, text: string, meta: { id: string }): ReaderOut {
  const format = plainFormat(name);
  const clean = text.replace(/^﻿/, '').replace(/\u0000/g, '');
  const b = new DocBuilder('structured');
  const notes: DocCheck[] = [];
  const media: MediaRef[] = [];
  let pageCount = 1;
  let raw = clean;
  const figureData: { i: number; dataUrl: string }[] = [];
  let htmlTitle: string | undefined;
  switch (format) {
    case 'md': {
      readMarkdown(b, clean, notes);
      // front matter is settings, not text — but for its title, which is read
      const fm = /^---\n([\s\S]*?)\n(?:---|\.\.\.)\s*\n/.exec(clean.replace(/\r\n?/g, '\n'));
      const title = fm ? (/^title:\s*["']?(.*?)["']?\s*$/m.exec(fm[1])?.[1] ?? '') : '';
      raw = mdRaw(fm ? `${title}\n${clean.replace(/\r\n?/g, '\n').slice(fm[0].length)}` : clean);
      break;
    }
    case 'html': {
      const r = readHtml(b, clean, notes);
      raw = r.raw;
      if (r.title) htmlTitle = r.title;
      break;
    }
    case 'csv':
    case 'tsv': {
      const delim = format === 'tsv' ? '\t' : sniffDelimiter(clean);
      const { rows, more } = parseDelimited(clean, delim, 20_000);
      const width = Math.max(0, ...rows.map((r) => r.length));
      for (const r of rows) while (r.length < width) r.push('');
      const kept = rows.slice(0, MAX_ROWS).map((r) => r.slice(0, 30));
      if (kept.length) b.table({ page: 1, rows: kept, head: guessHead(kept) });
      if (rows.length > MAX_ROWS || more || width > 30)
        notes.push({ id: 'unread', level: 'warn', says: `The file has ${more ? 'more than ' : ''}${rows.length.toLocaleString('en-US')} rows${width > 30 ? ` and ${width} columns` : ''}; the first ${Math.min(rows.length, MAX_ROWS)} rows${width > 30 ? ' and 30 columns' : ''} were read.`, pages: [1] });
      raw = kept.flat().join('\n');
      break;
    }
    case 'tex':
      readTex(b, clean, notes);
      raw = clean.replace(/(^|[^\\])%.*$/gm, '$1').replace(/\\label\{[^}]*\}/g, '');
      break;
    case 'ipynb':
      raw = readNotebook(b, clean, notes, figureData);
      break;
    case 'txt':
      pageCount = readText(b, clean, notes);
      raw = '';
      break;
    default:
      readCode(b, clean, notes);
  }
  const doc = b.build({ id: meta.id, name, format, pageCount, ...(htmlTitle ? { title: htmlTitle } : {}) });
  for (const f of figureData) media.push({ figure: `f${f.i + 1}`, page: 1, part: '', mime: 'image/png', dataUrl: f.dataUrl });
  // plain text pages are checked page by page: the file's own pages, at its form feeds
  const rawPages = format === 'txt' ? clean.replace(/\r\n?/g, '\n').split('\f').map((t, i) => ({ n: i + 1, text: t })) : [{ n: 0, text: raw }];
  // a reading cut short is checked only as far as it went
  const cut = notes.some((n) => n.id === 'unread');
  return { doc, raw: cut || format === 'tex' ? [] : rawPages, notes, media };
}
