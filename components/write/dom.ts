// components/write/dom.ts — the page's DOM and the document model, kept in step.
//
// The Writing Space is one contentEditable page whose children are the
// document's blocks, one element each, tagged with the block's id. The model
// is the truth; the DOM is drawn from it, and read back from it only where the
// browser itself typed (a character, a deletion inside one block, a spelling
// correction, an input method's composition). These are the two directions:
//
//   fill(el, block)     a block's words and marks drawn into its element
//   readBlock(el)       an element's words and marks read back
//   offsetIn / pointIn  a caret between DOM positions and offsets in a block's text
//
// One rule makes them agree: a '\n' in the text is a <br>, and an element whose
// text ends in '\n' (or is empty) carries one more <br> that is only there so
// the line can hold a caret. Reading drops that one.

import { normalizeMarks, type Block, type BlockType, type Mark, type MarkType } from '@/lib/write/doc';
import { inlineHtml } from '@/lib/write/render';

export const BLOCK_ATTR = 'data-b';

export function tagFor(t: BlockType): string {
  if (t === 'h1' || t === 'h2' || t === 'h3') return t;
  if (t === 'quote') return 'blockquote';
  if (t === 'ul' || t === 'ol') return 'div';
  return 'p';
}

/** The element's class and attributes for its block's shape. */
export function shape(el: HTMLElement, b: Block) {
  const list = b.t === 'ul' || b.t === 'ol';
  const cls = list ? `w-li is-${b.t} lvl-${b.lvl ?? 1}` : `w-${b.t}`;
  if (el.className !== cls) el.className = cls;
  if (list) el.setAttribute('role', 'listitem');
  else el.removeAttribute('role');
}

export function fill(el: HTMLElement, b: Block) {
  const html = inlineHtml(b.text, b.marks) + (!b.text || b.text.endsWith('\n') ? '<br>' : '');
  if (el.innerHTML !== html) el.innerHTML = html;
}

const MARK_OF: Record<string, MarkType> = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u' };

function marksOf(el: HTMLElement, on: MarkType[]): MarkType[] {
  const out = new Set(on);
  const m = MARK_OF[el.tagName];
  if (m) out.add(m);
  // the browser carries formatting forward as styled spans in some cases
  const st = el.style;
  if (st) {
    const fw = st.fontWeight;
    if (fw === 'bold' || Number(fw) >= 600) out.add('b');
    else if (fw === 'normal' || (fw && Number(fw) <= 500)) out.delete('b');
    if (st.fontStyle === 'italic') out.add('i');
    else if (st.fontStyle === 'normal') out.delete('i');
    const td = st.textDecorationLine || st.textDecoration;
    if (td && /underline/.test(td)) out.add('u');
  }
  return Array.from(out);
}

const BLOCKISH = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'UL', 'OL', 'PRE']);

/** An element's words and marks, as the model holds them. */
export function readEl(el: HTMLElement): { text: string; marks: Mark[] } {
  let text = '';
  const marks: Mark[] = [];
  const add = (s: string, on: MarkType[]) => {
    const at = text.length;
    text += s;
    for (const t of on) {
      const last = marks.length ? [...marks].reverse().find((x) => x.t === t) : undefined;
      if (last && last.e === at) last.e = at + s.length;
      else marks.push({ s: at, e: at + s.length, t });
    }
  };
  const walk = (n: Node, on: MarkType[]) => {
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
  for (const c of Array.from(el.childNodes)) walk(c, []);
  // the one <br> that holds a caret on an empty or ending line is not the person's
  if (text.endsWith('\n')) text = text.slice(0, -1);
  return { text, marks: normalizeMarks(marks, text.length) ?? [] };
}

export function sameMarks(a: readonly Mark[] | undefined, b: readonly Mark[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i].s !== y[i].s || x[i].e !== y[i].e || x[i].t !== y[i].t) return false;
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

export function typeOfEl(el: HTMLElement): BlockType {
  const tag = el.tagName;
  if (tag === 'H1' || tag === 'H2' || tag === 'H3') return tag.toLowerCase() as BlockType;
  if (tag === 'H4' || tag === 'H5' || tag === 'H6') return 'h3';
  if (tag === 'BLOCKQUOTE') return 'quote';
  if (el.classList.contains('is-ol')) return 'ol';
  if (el.classList.contains('is-ul') || tag === 'LI') return 'ul';
  return 'p';
}
