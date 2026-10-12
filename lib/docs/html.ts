// lib/docs/html.ts — a web page or HTML document, read as its blocks.
//
// HTML is not XML: tags are left open, attributes go unquoted, <br> never
// closes. This reads it the way a browser would for these purposes — a
// forgiving tokenizer, implied closes for paragraphs, list items and cells —
// and then reads the tree like any other document:
//
//   headings h1–h6, paragraphs, lists (numbered where the page numbers them),
//   quotations, preformatted code, tables (with column and row spans kept in
//   place), figures and their captions, images by their alt text, and
//   mathematics written in MathML — by its TeX annotation where the page
//   carries one, in linear notation otherwise.
//
// What a browser would not show is not read: scripts, styles, navigation,
// templates, and anything marked hidden.
//
// PURE.

import type { DocBuilder } from './build';
import { guessHead, isLayoutTable } from './office';
import { CAPTION, toScript } from './text';
import type { DocCheck } from './types';

interface HNode {
  name: string;
  attrs: Record<string, string>;
  children: (HNode | string)[];
}

const GREEK = 'Alpha Α Beta Β Gamma Γ Delta Δ Epsilon Ε Zeta Ζ Eta Η Theta Θ Iota Ι Kappa Κ Lambda Λ Mu Μ Nu Ν Xi Ξ Omicron Ο Pi Π Rho Ρ Sigma Σ Tau Τ Upsilon Υ Phi Φ Chi Χ Psi Ψ Omega Ω alpha α beta β gamma γ delta δ epsilon ε zeta ζ eta η theta θ iota ι kappa κ lambda λ mu μ nu ν xi ξ omicron ο pi π rho ρ sigmaf ς sigma σ tau τ upsilon υ phi φ chi χ psi ψ omega ω'.split(' ');
const ENT: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  minus: '−', times: '×', divide: '÷', plusmn: '±', deg: '°', micro: 'µ', middot: '·', bull: '•', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', frac12: '½', frac14: '¼', frac34: '¾',
  sup1: '¹', sup2: '²', sup3: '³', le: '≤', ge: '≥', ne: '≠', asymp: '≈', equiv: '≡', infin: '∞', sum: '∑', prod: '∏', int: '∫', radic: '√', part: '∂', nabla: '∇', isin: '∈', notin: '∉', sub: '⊂', sup: '⊃', cap: '∩', cup: '∪',
  larr: '←', rarr: '→', harr: '↔', uarr: '↑', darr: '↓', rArr: '⇒', lArr: '⇐', hArr: '⇔', forall: '∀', exist: '∃', empty: '∅', prime: '′', Prime: '″', thinsp: ' ', ensp: ' ', emsp: ' ', zwnj: '', zwj: '', shy: '', lowast: '∗', sdot: '⋅', prop: '∝', ang: '∠', and: '∧', or: '∨', there4: '∴', sim: '∼', cong: '≅',
};
for (let i = 0; i < GREEK.length; i += 2) ENT[GREEK[i]] = GREEK[i + 1];

export function decodeHtml(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return ENT[e] ?? (m.endsWith(';') ? m : m);
  });
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template', 'xmp']);
/** Opening one of these closes an open one of the kinds it names — looking no further out than its container. */
const P_STOP = ['div', 'section', 'article', 'main', 'aside', 'td', 'th', 'li', 'blockquote', 'body', 'table', 'form', 'figure', 'header', 'footer', 'dd'];
const IMPLIED: Record<string, { closes: string[]; stop: string[] }> = {
  li: { closes: ['li'], stop: ['ul', 'ol'] },
  dt: { closes: ['dt', 'dd'], stop: ['dl'] },
  dd: { closes: ['dt', 'dd'], stop: ['dl'] },
  tr: { closes: ['tr'], stop: ['table', 'thead', 'tbody', 'tfoot'] },
  td: { closes: ['td', 'th'], stop: ['tr', 'table'] },
  th: { closes: ['td', 'th'], stop: ['tr', 'table'] },
  thead: { closes: ['thead', 'tbody', 'tfoot'], stop: ['table'] },
  tbody: { closes: ['thead', 'tbody', 'tfoot'], stop: ['table'] },
  tfoot: { closes: ['thead', 'tbody', 'tfoot'], stop: ['table'] },
  option: { closes: ['option'], stop: ['select'] },
};
/** Block elements end an open paragraph. */
const BLOCK_CLOSES_P = new Set(['div', 'p', 'ul', 'ol', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'figure', 'hr', 'dl', 'form', 'main', 'aside', 'nav', 'address', 'li', 'tr', 'td', 'th']);

/** HTML into a tree, the way a browser forgives it. */
export function parseHtml(src: string): { root: HNode; title?: string } {
  const root: HNode = { name: '#root', attrs: {}, children: [] };
  const stack: HNode[] = [root];
  let title: string | undefined;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  const top = () => stack[stack.length - 1];
  /** Close the nearest open element named in `closes`, not looking past one named in `stop`. */
  const closeTo = (closes: string[], stop: string[] = []) => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (closes.includes(stack[i].name)) {
        stack.length = i;
        return true;
      }
      if (stop.includes(stack[i].name)) return false;
    }
    return false;
  };
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) {
      top().children.push(m[1]);
      continue;
    }
    if (m[6] !== undefined) {
      top().children.push(decodeHtml(m[6]));
      continue;
    }
    const [, , close, rawName, attrText, self] = m;
    if (!rawName) {
      if (m[0] === '<') top().children.push('<');
      continue;
    }
    const name = rawName.toLowerCase();
    if (close) {
      closeTo([name], name === 'li' ? ['ul', 'ol'] : /^(td|th|tr)$/.test(name) ? ['table'] : name === 'p' ? P_STOP : []);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (attrText ?? '').matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) attrs[a[1].toLowerCase()] = decodeHtml(a[2] ?? a[3] ?? a[4] ?? '');
    if (BLOCK_CLOSES_P.has(name)) closeTo(['p'], P_STOP);
    const implied = IMPLIED[name];
    if (implied) closeTo(implied.closes, implied.stop);
    if (RAW.has(name)) {
      const end = src.toLowerCase().indexOf(`</${name}`, re.lastIndex);
      const body = src.slice(re.lastIndex, end < 0 ? src.length : end);
      if (name === 'title' && !title) title = decodeHtml(body).replace(/\s+/g, ' ').trim() || undefined;
      re.lastIndex = end < 0 ? src.length : src.indexOf('>', end) + 1 || src.length;
      continue;
    }
    const node: HNode = { name, attrs, children: [] };
    top().children.push(node);
    if (!self && !VOID.has(name)) stack.push(node);
  }
  return { root, ...(title ? { title } : {}) };
}

const SKIP = new Set(['head', 'nav', 'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object', 'embed', 'canvas', 'select', 'button', 'input', 'audio', 'video', 'map', 'dialog']);
const hidden = (n: HNode) =>
  'hidden' in n.attrs || n.attrs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attrs.style ?? '') || n.attrs.type === 'hidden';
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'address', 'center', 'form', 'fieldset', 'details', 'summary', 'dl', 'dt', 'dd', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'figure', 'figcaption', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'caption', 'body', 'html', '#root', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot']);
const isNode = (c: HNode | string): c is HNode => typeof c !== 'string';

// ── MathML ──────────────────────────────────────────────────────────

const atomic = (s: string) => {
  const t = s.trim();
  return [...t].length <= 1 || /^[\p{L}][\p{L}\p{N}]{0,2}$/u.test(t) || /^\d+(\.\d+)?$/.test(t) || (/^\(.*\)$/.test(t) && balanced(t));
};
const balanced = (t: string) => {
  let d = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(') d++;
    else if (t[i] === ')' && --d === 0 && i < t.length - 1) return false;
  }
  return d === 0;
};
const wrap = (s: string) => (atomic(s) ? s.trim() : `(${s.trim()})`);

/** MathML in linear notation, and its TeX when the page carries it. */
export function mathml(n: HNode): { linear: string; tex?: string } {
  const ann = findAll(n, 'annotation').find((a) => /tex/i.test(a.attrs.encoding ?? ''));
  const tex = ann ? textIn(ann).trim() : undefined;
  const lin = (x: HNode | string): string => {
    if (!isNode(x)) return x.replace(/\s+/g, ' ');
    const k = x.children.filter(isNode);
    switch (x.name) {
      case 'annotation':
      case 'annotation-xml':
      case 'mphantom':
        return '';
      case 'semantics':
        return k[0] ? lin(k[0]) : '';
      case 'mi':
      case 'mn':
      case 'mo':
      case 'mtext':
      case 'ms':
        return textIn(x).trim();
      case 'mspace':
        return ' ';
      case 'mfrac':
        return `${wrap(lin(k[0] ?? ''))}/${wrap(lin(k[1] ?? ''))}`;
      case 'msup':
        return `${wrap(lin(k[0] ?? ''))}^${wrap(lin(k[1] ?? ''))}`;
      case 'msub':
        return `${wrap(lin(k[0] ?? ''))}_${wrap(lin(k[1] ?? ''))}`;
      case 'msubsup':
        return `${wrap(lin(k[0] ?? ''))}_${wrap(lin(k[1] ?? ''))}^${wrap(lin(k[2] ?? ''))}`;
      case 'msqrt':
        return `√${wrap(k.map(lin).join(''))}`;
      case 'mroot': {
        const deg = lin(k[1] ?? '').trim();
        return deg === '3' ? `∛${wrap(lin(k[0] ?? ''))}` : `${wrap(lin(k[0] ?? ''))}^(1/${deg})`;
      }
      case 'mover':
        return x.attrs.accent === 'true' ? `${lin(k[0] ?? '')}${lin(k[1] ?? '')}` : `${wrap(lin(k[0] ?? ''))}^${wrap(lin(k[1] ?? ''))}`;
      case 'munder':
        return `${wrap(lin(k[0] ?? ''))}_${wrap(lin(k[1] ?? ''))}`;
      case 'munderover':
        return `${lin(k[0] ?? '').trim()}_${wrap(lin(k[1] ?? ''))}^${wrap(lin(k[2] ?? ''))}`;
      case 'mfenced': {
        const sep = x.attrs.separators ?? ',';
        return `${x.attrs.open ?? '('}${k.map(lin).join(`${sep.trim()[0] ?? ','} `)}${x.attrs.close ?? ')'}`;
      }
      case 'mtable':
        return `[${k.map((r) => `[${r.children.filter(isNode).map(lin).join(', ')}]`).join(', ')}]`;
      default:
        return x.children.map(lin).join('');
    }
  };
  const linear = lin({ ...n, name: 'mrow' })
    .replace(/\s*([=<>≤≥≠≈→])\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
  return { linear, ...(tex ? { tex } : {}) };
}

function findAll(n: HNode, name: string, out: HNode[] = []): HNode[] {
  for (const c of n.children) {
    if (!isNode(c)) continue;
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

const textIn = (n: HNode | string): string => (isNode(n) ? n.children.map(textIn).join('') : n);

// ── reading ─────────────────────────────────────────────────────────

/** The text of inline content: whitespace collapsed, sub- and superscripts kept as such, maths in linear form. */
function inlineOf(n: HNode | string, pre = false): string {
  if (!isNode(n)) return pre ? n : n.replace(/\s+/g, ' ');
  if (SKIP.has(n.name) || hidden(n)) return '';
  if (n.name === 'br') return '\n';
  if (n.name === 'img') return '';
  if (n.name === 'math') return ` ${mathml(n).linear} `;
  const inner = n.children.map((c) => inlineOf(c, pre || n.name === 'pre')).join('');
  if (n.name === 'sup' || n.name === 'sub') {
    const t = inner.trim();
    return t ? (toScript(t, n.name) ?? (n.name === 'sup' ? `^${t}` : `_${t}`)) : '';
  }
  if (BLOCKS.has(n.name)) return ` ${inner} `;
  return inner;
}

interface Table {
  rows: string[][];
  head: number;
  caption?: string;
  cells: HNode[][];
}

function tableOf(t: HNode): Table {
  const rows: string[][] = [];
  const cells: HNode[][] = [];
  let head = 0;
  let caption: string | undefined;
  const pending: Map<number, number>[] = [];
  const visit = (n: HNode, inHead: boolean) => {
    for (const c of n.children) {
      if (!isNode(c) || hidden(c)) continue;
      if (c.name === 'caption') caption = inlineOf(c).replace(/\s+/g, ' ').trim();
      else if (c.name === 'thead') visit(c, true);
      else if (c.name === 'tbody' || c.name === 'tfoot') visit(c, false);
      else if (c.name === 'tr') {
        const r = rows.length;
        const row: string[] = [];
        const rowCells: HNode[] = [];
        let col = 0;
        const fill = () => {
          while (pending[r]?.has(col)) {
            row[col] = '';
            col++;
          }
        };
        let allTh = true;
        for (const cell of c.children) {
          if (!isNode(cell) || (cell.name !== 'td' && cell.name !== 'th')) continue;
          if (cell.name !== 'th') allTh = false;
          fill();
          const span = Math.max(1, Math.min(60, Number(cell.attrs.colspan) || 1));
          const down = Math.max(1, Math.min(400, Number(cell.attrs.rowspan) || 1));
          row[col] = inlineOf(cell).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
          rowCells[col] = cell;
          for (let s = 1; s < span; s++) row[col + s] = '';
          for (let d = 1; d < down; d++) {
            pending[r + d] = pending[r + d] ?? new Map();
            for (let s = 0; s < span; s++) pending[r + d].set(col + s, 1);
          }
          col += span;
        }
        fill();
        rows.push(Array.from({ length: row.length }, (_, i) => row[i] ?? ''));
        cells.push(rowCells);
        if ((inHead || allTh) && rows.length === head + 1) head++;
      } else visit(c, inHead);
    }
  };
  visit(t, false);
  const width = Math.max(0, ...rows.map((r) => r.length));
  for (const r of rows) while (r.length < width) r.push('');
  return { rows, head: head || guessHead(rows), ...(caption ? { caption } : {}), cells };
}

/** An HTML document into blocks on one page. Returns its visible text, for the checks, and its title. */
export function readHtml(b: DocBuilder, src: string, notes: DocCheck[]): { raw: string; title?: string } {
  const { root, title } = parseHtml(src);
  const page = 1;
  let buf = '';
  let bufKind: { kind: 'paragraph' | 'heading' | 'list' | 'quote' | 'caption'; level?: number } = { kind: 'paragraph' };
  const lists: { ordered: boolean; n: number }[] = [];
  let quote = 0;
  const flush = () => {
    const t = buf.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    buf = '';
    if (!t) return;
    const k = quote && bufKind.kind === 'paragraph' ? { kind: 'quote' as const } : bufKind;
    b.block({ page, kind: k.kind === 'paragraph' && CAPTION.test(t) ? 'caption' : k.kind, text: t, ...(k.level ? { level: k.level } : {}) });
  };
  const walk = (n: HNode) => {
    for (const c of n.children) {
      if (b.chars > 300_000) return;
      if (!isNode(c)) {
        buf += c.replace(/\s+/g, ' ');
        continue;
      }
      if (SKIP.has(c.name) || hidden(c)) continue;
      switch (c.name) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          flush();
          const t = inlineOf(c).replace(/\s+/g, ' ').trim();
          if (t) b.block({ page, kind: 'heading', level: Number(c.name[1]), text: t });
          break;
        }
        case 'br':
          buf += '\n';
          break;
        case 'hr':
          flush();
          break;
        case 'pre': {
          flush();
          const t = c.children.map((ch) => inlineOf(ch, true)).join('').replace(/\s+$/, '').replace(/^\n/, '');
          if (t.trim()) b.block({ page, kind: 'code', text: t });
          break;
        }
        case 'math': {
          const m = mathml(c);
          if (c.attrs.display === 'block' || c.attrs.mode === 'display') {
            flush();
            if (m.linear || m.tex) b.block({ page, kind: 'equation', text: m.linear || m.tex!, tex: m.tex ?? m.linear });
          } else buf += ` ${m.linear} `;
          break;
        }
        case 'img': {
          const alt = (c.attrs.alt ?? '').trim();
          const t = (c.attrs.title ?? '').trim();
          if (c.attrs.role === 'presentation' || (alt === '' && 'alt' in c.attrs)) break;
          flush();
          b.figure({ page, kind: 'image', ...(alt ? { alt } : {}) }, [alt, t].filter(Boolean).join('\n'));
          break;
        }
        case 'ul':
        case 'ol':
          flush();
          lists.push({ ordered: c.name === 'ol', n: Number(c.attrs.start) || 1 });
          walk(c);
          flush();
          lists.pop();
          break;
        case 'li': {
          flush();
          const l = lists[lists.length - 1];
          const prev = bufKind;
          bufKind = { kind: 'list', level: Math.min(4, Math.max(1, lists.length)) };
          if (l?.ordered) buf += `${l.n++}. `;
          walk(c);
          flush();
          bufKind = prev;
          break;
        }
        case 'blockquote':
          flush();
          quote++;
          walk(c);
          flush();
          quote--;
          break;
        case 'figcaption':
        case 'caption': {
          flush();
          const prev = bufKind;
          bufKind = { kind: 'caption' };
          walk(c);
          flush();
          bufKind = prev;
          break;
        }
        case 'table': {
          flush();
          const t = tableOf(c);
          if (!t.rows.length) break;
          if (isLayoutTable(t.rows)) {
            for (const row of t.cells) for (const cell of row) if (cell) {
              walk(cell);
              flush();
            }
          } else {
            if (t.caption) b.block({ page, kind: 'caption', text: t.caption });
            b.table({ page, rows: t.rows.slice(0, 400), head: Math.min(t.head, 5) });
            if (t.rows.length > 400) notes.push({ id: 'unread', level: 'warn', says: `A table of ${t.rows.length} rows was read to row 400.`, pages: [page] });
          }
          break;
        }
        case 'sup':
        case 'sub':
          buf += inlineOf(c);
          break;
        default:
          if (BLOCKS.has(c.name)) {
            flush();
            walk(c);
            flush();
          } else walk(c);
      }
    }
  };
  walk(root);
  flush();
  // the page's visible words, for the checks: everything the walk could have read, in any order
  const visible = (n: HNode | string): string => {
    if (!isNode(n)) return n;
    if (SKIP.has(n.name) || hidden(n)) return '';
    if (n.name === 'math') return ` ${mathml(n).linear} `;
    if (n.name === 'img') return ` ${n.attrs.role === 'presentation' ? '' : `${n.attrs.alt ?? ''} ${n.attrs.title ?? ''}`} `;
    if (n.name === 'sup' || n.name === 'sub') return inlineOf(n);
    // a numbered list's numbers are the page's own, as a browser shows them
    let k = Number(n.attrs.start) || 1;
    return n.children
      .map((c) => (n.name === 'ol' && isNode(c) && c.name === 'li' && !SKIP.has(c.name) && !hidden(c) ? ` ${k++}. ${visible(c)}` : visible(c)))
      .join(BLOCKS.has(n.name) || n.name === 'br' ? ' \n ' : '');
  };
  return { raw: visible(root), ...(title ? { title } : {}) };
}
