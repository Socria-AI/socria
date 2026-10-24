// components/write/dom.ts — the page's DOM and the document model, kept in step.
//
// The Writing Space is one contentEditable page whose children are the
// document's blocks, one element each, tagged with the block's id. The model
// is the truth; the DOM is drawn from it, and read back from it only where the
// browser itself typed (a character, a deletion inside one block, a spelling
// correction, an input method's composition). These are the two directions:
//
//   fill(el, block)     a block's words and marks drawn into its element
//   readEl(el)          an element's words and marks read back
//   offsetIn / pointIn  a caret between DOM positions and offsets in a block's text
//
// One rule makes them agree: a '\n' in the text is a <br>, and an element whose
// text ends in '\n' (or is empty) carries one more <br> that is only there so
// the line can hold a caret. Reading drops that one.
//
// A picture, a horizontal line, a page break and a table are islands the
// browser cannot type into (contenteditable=false). A table's cells are
// islands of their own the other way round: each is a small editable page
// (`data-cell`, the cell's id), so a caret is always inside one cell and a
// selection can never straddle two.

import { MARK_TYPES, normalizeMarks, type Block, type BlockType, type FlagMark, type Mark, type ValueMark } from '@/lib/write/doc';
import { cssColor } from '@/lib/write/parse';
import { cssLineHeight, inlineHtml } from '@/lib/write/render';

export const BLOCK_ATTR = 'data-b';
export const CELL_ATTR = 'data-cell';

export function tagFor(t: BlockType): string {
  if (t === 'h1' || t === 'h2' || t === 'h3') return t;
  if (t === 'quote') return 'blockquote';
  if (t === 'code') return 'pre';
  if (t === 'img') return 'figure';
  if (t === 'ul' || t === 'ol' || t === 'hr' || t === 'pb' || t === 'table') return 'div';
  return 'p';
}

/** The element's class, attributes and paragraph settings for its block. */
export function shape(el: HTMLElement, b: Block) {
  const list = b.t === 'ul' || b.t === 'ol';
  const cls = list ? `w-li is-${b.t} lvl-${b.lvl ?? 1}` : `w-${b.t}`;
  if (el.className.split(' ').filter((c) => c !== 'is-selected').join(' ') !== cls) el.className = cls + (el.classList.contains('is-selected') ? ' is-selected' : '');
  if (list) el.setAttribute('role', 'listitem');
  else el.removeAttribute('role');
  const opaque = b.t === 'img' || b.t === 'hr' || b.t === 'pb' || b.t === 'table';
  if (opaque) {
    if (el.getAttribute('contenteditable') !== 'false') el.setAttribute('contenteditable', 'false');
  } else if (el.hasAttribute('contenteditable')) el.removeAttribute('contenteditable');
  const st = el.style;
  const align = b.align ?? '';
  if (st.textAlign !== align) st.textAlign = align;
  const ml = b.ind && !list ? `${b.ind * 2}em` : '';
  if (st.marginLeft !== ml) st.marginLeft = ml;
  const lh = b.lh ? String(cssLineHeight(b.lh)) : '';
  if (st.lineHeight !== lh) st.lineHeight = lh;
  const mt = b.sb !== undefined ? `calc(var(--w-pt, 1.3333px) * ${b.sb})` : '';
  if (st.marginTop !== mt) st.marginTop = mt;
  const mb = b.sa !== undefined ? `calc(var(--w-pt, 1.3333px) * ${b.sa})` : '';
  if (st.marginBottom !== mb) st.marginBottom = mb;
}

/** A block of words drawn into its element. */
export function fill(el: HTMLElement, b: Pick<Block, 't' | 'text' | 'marks'>) {
  const words = b.t === 'code' ? escape(b.text) : inlineHtml(b.text, b.marks, { editor: true });
  const html = words + (!b.text || b.text.endsWith('\n') ? '<br>' : '');
  if (el.innerHTML !== html) el.innerHTML = html;
}

const escape = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;')).replace(/\n/g, '<br>');

const FLAG_OF: Record<string, FlagMark> = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', INS: 'u', S: 's', STRIKE: 's', DEL: 's', SUP: 'sup', SUB: 'sub' };

interface On {
  flags: Set<FlagMark>;
  vals: Map<ValueMark, string>;
}

/** What an element turns on or off: its tag, its data (what this page drew), its style (what a browser drew). */
function marksOf(el: HTMLElement, on: On): On {
  const flags = new Set(on.flags);
  const vals = new Map(on.vals);
  const f = FLAG_OF[el.tagName];
  if (f) flags.add(f);
  if (el.tagName === 'A') {
    const href = el.getAttribute('href');
    if (href) vals.set('a', href);
  }
  const d = el.dataset;
  if (d) {
    if (d.c) vals.set('color', d.c);
    if (d.bg) vals.set('bg', d.bg);
    if (d.f) vals.set('font', d.f);
    if (d.z) vals.set('size', d.z);
  }
  // the browser carries formatting forward as styled spans in some cases
  const st = el.style;
  if (st && el.getAttribute('style')) {
    const fw = st.fontWeight;
    if (fw === 'bold' || Number(fw) >= 600) flags.add('b');
    else if (fw === 'normal' || (fw && Number(fw) <= 500)) flags.delete('b');
    if (st.fontStyle === 'italic') flags.add('i');
    else if (st.fontStyle === 'normal') flags.delete('i');
    const td = st.textDecorationLine || st.textDecoration;
    if (td && /underline/.test(td)) flags.add('u');
    if (td && /line-through/.test(td)) flags.add('s');
    if (!d?.c && st.color) {
      const c = cssColor(st.color);
      if (c) vals.set('color', c);
    }
    if (!d?.bg && st.backgroundColor) {
      const c = cssColor(st.backgroundColor);
      if (c) vals.set('bg', c);
    }
  }
  return { flags, vals };
}

const BLOCKISH = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'UL', 'OL', 'PRE']);

/** An element's words and marks, as the model holds them. */
export function readEl(el: HTMLElement): { text: string; marks: Mark[] } {
  let text = '';
  const marks: Mark[] = [];
  const add = (s: string, on: On) => {
    const at = text.length;
    text += s;
    const e = at + s.length;
    const put = (t: Mark['t'], v?: string) => {
      for (let k = marks.length - 1; k >= 0; k--) {
        const m = marks[k];
        if (m.t !== t) continue;
        if (m.e === at && m.v === v) {
          m.e = e;
          return;
        }
        break;
      }
      marks.push({ s: at, e, t, ...(v ? { v } : {}) });
    };
    for (const t of Array.from(on.flags)) put(t);
    for (const [t, v] of Array.from(on.vals)) put(t, v);
  };
  const walk = (n: Node, on: On) => {
    if (n.nodeType === 3) {
      const t = (n.nodeValue ?? '').replace(/ /g, ' ');
      if (t) add(t, on);
      return;
    }
    if (n.nodeType !== 1) return;
    const e = n as HTMLElement;
    if (e.tagName === 'BR') {
      text += '\n';
      return;
    }
    if (e.getAttribute('contenteditable') === 'false') return;
    // a block the browser nested inside this one (a merge, a paste it handled) is a new line
    if (BLOCKISH.has(e.tagName) && text && !text.endsWith('\n')) text += '\n';
    const next = marksOf(e, on);
    for (const c of Array.from(e.childNodes)) walk(c, next);
  };
  for (const c of Array.from(el.childNodes)) walk(c, { flags: new Set(), vals: new Map() });
  // the one <br> that holds a caret on an empty or ending line is not the person's
  if (text.endsWith('\n')) text = text.slice(0, -1);
  return { text, marks: normalizeMarks(marks, text.length) ?? [] };
}

export function sameMarks(a: readonly Mark[] | undefined, b: readonly Mark[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i].s !== y[i].s || x[i].e !== y[i].e || x[i].t !== y[i].t || (x[i].v ?? '') !== (y[i].v ?? '')) return false;
  return true;
}

/** The length a node contributes to its block's text. */
function lengthOf(n: Node): number {
  if (n.nodeType === 3) return (n.nodeValue ?? '').length;
  if (n.nodeType !== 1) return 0;
  const e = n as HTMLElement;
  if (e.tagName === 'BR') return 1;
  if (e.getAttribute('contenteditable') === 'false') return 0;
  let k = 0;
  for (const c of Array.from(e.childNodes)) k += lengthOf(c);
  return k;
}

/** A DOM position inside a block's element, as an offset into the block's text (at most `max`, its length). */
export function offsetIn(el: HTMLElement, node: Node, off: number, max?: number): number {
  let acc = 0;
  let found = -1;
  const visit = (n: Node): boolean => {
    if (n === node) {
      if (n.nodeType === 3) {
        found = acc + Math.min(off, (n.nodeValue ?? '').length);
        return true;
      }
      const kids = Array.from(n.childNodes);
      for (let i = 0; i < Math.min(off, kids.length); i++) acc += lengthOf(kids[i]);
      found = acc;
      return true;
    }
    if (n.nodeType === 3) {
      acc += (n.nodeValue ?? '').length;
      return false;
    }
    if (n.nodeType !== 1) return false;
    const e = n as HTMLElement;
    if (e.tagName === 'BR') {
      acc += 1;
      return false;
    }
    if (e.getAttribute('contenteditable') === 'false') return false;
    for (const c of Array.from(e.childNodes)) if (visit(c)) return true;
    return false;
  };
  if (node === el) {
    const kids = Array.from(el.childNodes);
    for (let i = 0; i < Math.min(off, kids.length); i++) acc += lengthOf(kids[i]);
    found = acc;
  } else {
    for (const c of Array.from(el.childNodes)) if (visit(c)) break;
  }
  const top = max ?? readEl(el).text.length;
  return Math.max(0, Math.min(top, found < 0 ? top : found));
}

/** An offset into a block's text, as a DOM position inside its element. */
export function pointIn(el: HTMLElement, offset: number): { node: Node; offset: number } {
  let acc = 0;
  let out: { node: Node; offset: number } | null = null;
  const visit = (n: Node): boolean => {
    if (n.nodeType === 3) {
      const len = (n.nodeValue ?? '').length;
      if (offset <= acc + len) {
        out = { node: n, offset: offset - acc };
        return true;
      }
      acc += len;
      return false;
    }
    if (n.nodeType !== 1) return false;
    const e = n as HTMLElement;
    if (e.tagName === 'BR') {
      if (offset <= acc) {
        const parent = e.parentNode!;
        out = { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, e) };
        return true;
      }
      acc += 1;
      return false;
    }
    if (e.getAttribute('contenteditable') === 'false') return false;
    for (const c of Array.from(e.childNodes)) if (visit(c)) return true;
    return false;
  };
  for (const c of Array.from(el.childNodes)) if (visit(c)) break;
  return out ?? { node: el, offset: el.childNodes.length };
}

/** The block element a DOM node is in, if it is in this page. */
export function blockElOf(root: HTMLElement, n: Node | null): HTMLElement | null {
  let at: Node | null = n;
  while (at && at !== root) {
    if (at.nodeType === 1 && (at as HTMLElement).hasAttribute(BLOCK_ATTR) && at.parentNode === root) return at as HTMLElement;
    at = at.parentNode;
  }
  return null;
}

/** The table cell a DOM node is in, if it is in one on this page. */
export function cellElOf(root: HTMLElement, n: Node | null): HTMLElement | null {
  let at: Node | null = n;
  while (at && at !== root) {
    if (at.nodeType === 1 && (at as HTMLElement).hasAttribute(CELL_ATTR)) return at as HTMLElement;
    at = at.parentNode;
  }
  return null;
}

export function typeOfEl(el: HTMLElement): BlockType {
  const tag = el.tagName;
  if (tag === 'H1' || tag === 'H2' || tag === 'H3') return tag.toLowerCase() as BlockType;
  if (tag === 'H4' || tag === 'H5' || tag === 'H6') return 'h3';
  if (tag === 'BLOCKQUOTE') return 'quote';
  if (tag === 'PRE') return 'code';
  if (el.classList.contains('is-ol')) return 'ol';
  if (el.classList.contains('is-ul') || tag === 'LI') return 'ul';
  return 'p';
}

// ── tables ───────────────────────────────────────────────────────────

/** What each drawn cell shows, by its id — read back after the browser typed into it, redrawn when the model differs. */
export type CellMap = Map<string, { el: HTMLElement; block: Block }>;

/**
 * A table drawn into its element, or brought up to date: a cell's words are
 * redrawn only when they differ from what it shows (so a caret in it stays
 * where it is); rows and columns are rebuilt around the cells that remain.
 */
export function drawTable(wrap: HTMLElement, b: Block, cells: CellMap, editable: boolean) {
  const rows = b.rows ?? [];
  const width = rows[0]?.length ?? 0;
  let table = wrap.querySelector(':scope > table') as HTMLTableElement | null;
  if (!table) {
    table = document.createElement('table');
    wrap.appendChild(table);
  }
  // the columns' widths
  let colgroup = table.querySelector(':scope > colgroup') as HTMLElement | null;
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.prepend(colgroup);
  }
  const fr = b.cols && b.cols.length === width ? b.cols : Array.from({ length: width }, () => 1 / Math.max(1, width));
  while (colgroup.children.length > width) colgroup.lastElementChild!.remove();
  while (colgroup.children.length < width) colgroup.appendChild(document.createElement('col'));
  fr.forEach((f, k) => {
    const w = `${Math.round(f * 10000) / 100}%`;
    const col = colgroup!.children[k] as HTMLElement;
    if (col.style.width !== w) col.style.width = w;
  });
  let tbody = table.querySelector(':scope > tbody') as HTMLElement | null;
  if (!tbody) {
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
  }
  const want = rows.map((r) => r.map((c) => c.id).join(',')).join('|');
  const have = Array.from(tbody.children)
    .map((tr) => Array.from(tr.children).map((td) => (td.firstElementChild as HTMLElement | null)?.getAttribute(CELL_ATTR) ?? '').join(','))
    .join('|');
  const seen = new Set<string>();
  const cellEl = (c: Block) => {
    seen.add(c.id);
    let r = cells.get(c.id);
    if (!r) {
      const el = document.createElement('div');
      el.className = 'w-cell';
      el.setAttribute(CELL_ATTR, c.id);
      fill(el, c);
      r = { el, block: c };
      cells.set(c.id, r);
    } else if (r.block !== c) {
      if (r.block.text !== c.text || !sameMarks(r.block.marks, c.marks)) fill(r.el, c);
      r.block = c;
    }
    const ce = editable ? 'true' : 'false';
    if (r.el.getAttribute('contenteditable') !== ce) r.el.setAttribute('contenteditable', ce);
    const align = c.align ?? '';
    if (r.el.style.textAlign !== align) r.el.style.textAlign = align;
    return r.el;
  };
  if (want !== have) {
    // rebuilt around the cells that remain: each keeps its element, and a caret in it
    const frag = document.createDocumentFragment();
    rows.forEach((row, ri) => {
      const tr = document.createElement('tr');
      if (b.head && ri === 0) tr.className = 'is-head';
      for (const c of row) {
        const td = document.createElement(b.head && ri === 0 ? 'th' : 'td');
        td.appendChild(cellEl(c));
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);
  } else {
    rows.forEach((row, ri) => {
      const tr = tbody!.children[ri] as HTMLElement;
      const head = !!b.head && ri === 0;
      if (tr.classList.contains('is-head') !== head) {
        // a header row's cells are header cells: rebuilt with the same cell elements
        const fresh = document.createElement('tr');
        if (head) fresh.className = 'is-head';
        for (const c of row) {
          const td = document.createElement(head ? 'th' : 'td');
          td.appendChild(cellEl(c));
          fresh.appendChild(td);
        }
        tr.replaceWith(fresh);
      } else row.forEach((c) => cellEl(c));
    });
  }
  for (const id of Array.from(cells.keys())) {
    const r = cells.get(id)!;
    if (!seen.has(id) && wrap.contains(r.el) === false && !r.el.isConnected) cells.delete(id);
  }
}

/** The marks a run of the page carries at a point, by type — for the toolbar. */
export const MARK_ORDER = MARK_TYPES;
