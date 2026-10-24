'use client';

// components/write/Editor.tsx — the Writing Space's page.
//
// One contentEditable page, one element per block, drawn from the document
// model (lib/write/doc.ts) and never the other way round except where the
// browser itself typed: a character, a deletion inside a paragraph, a word an
// input method composed, a spelling the browser corrected. Everything that
// changes the document's SHAPE — Enter, Backspace at the start of a block, a
// selection deleted across paragraphs, a paste, a format, a list indented, a
// paragraph moved, a picture or a table put in — is an operation on the model,
// so it can be undone exactly, and the page is redrawn from what it produced.
// Undo and redo are the document's own, not the browser's.
//
// Formatting chosen with nothing selected (bold, a font, a size, a colour) is
// held at the caret and given to what is typed next — the model inserts those
// words with exactly those marks — until the caret moves. Pictures, lines,
// page breaks and tables are islands the browser cannot type into: a click
// picks one out, and keys act on it (Delete takes it away, Enter opens a line
// after it). A table's cells are small editable pages of their own; Tab moves
// between them, and a Tab in the last cell adds a row.
//
// Findings are drawn with the CSS Custom Highlight API: underlines that are
// not in the DOM at all, so they can never be typed into, saved, or copied.
// Where a browser has no highlights, the findings are still listed in the
// review panel; nothing depends on the underline.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import {
  blockIndex,
  blocksInRange,
  clearMarks,
  findCell,
  findText,
  FONT_SIZES,
  hasMark,
  hrefValue,
  indentBlocks,
  insertAt,
  insertMarked,
  insertRow,
  isList,
  isOpaque,
  isTextType,
  marksAt,
  mergeBack,
  mergeForward,
  moveBlocks,
  nudgeBlock,
  orderPoints,
  removeBlocks,
  replaceBlock,
  replaceRange,
  replaceText,
  setBlockType,
  setImage,
  setMark,
  setParaAttrs,
  setTable,
  spliceBlock,
  splitBlock,
  textInRange,
  toggleMark,
  uid,
  valueOver,
  withTextAround,
  type Align,
  type Block,
  type BlockType,
  type FlagMark,
  type Mark,
  type ParaPatch,
  type Point,
  type ValueMark,
  type WriteDoc,
} from '@/lib/write/doc';
import { mediaIdOf } from '@/lib/write/media';
import { toHtml, toText } from '@/lib/write/render';
import { htmlToBlocks, isLooseImage, pastedText } from '@/lib/write/parse';
import { BLOCK_ATTR, CELL_ATTR, blockElOf, cellElOf, drawTable, fill, offsetIn, pointIn, readEl, sameMarks, shape, tagFor, typeOfEl, type CellMap } from './dom';
import type { MediaClient } from './media-client';

export interface EditorRange {
  from: Point;
  to: Point;
}

export interface EditorSelection extends EditorRange {
  text: string;
  rect: DOMRect;
}

export interface EditorChange {
  doc: WriteDoc;
  /** typing coalesces into one undo step; anything else is a step of its own */
  kind: 'typing' | 'structure';
  /** the block typed into, for coalescing */
  block?: string;
}

/** A formatting command, from the toolbar or a key. */
export type FormatOp =
  | { kind: 'flag'; t: FlagMark }
  | { kind: 'value'; t: ValueMark; v: string | null }
  | { kind: 'size-step'; dir: 1 | -1 }
  | { kind: 'clear' }
  | { kind: 'block'; t: BlockType }
  | { kind: 'para'; patch: ParaPatch }
  | { kind: 'indent'; delta: 1 | -1 }
  | { kind: 'list'; t: 'ul' | 'ol' };

/** What is at the caret or across the selection — what the toolbar shows as on. */
export interface FormatState {
  block: BlockType | null;
  align: Align | 'left';
  lh: number | null;
  flags: Record<FlagMark, boolean>;
  font: string | null;
  size: number | null;
  color: string | null;
  bg: string | null;
  link: string | null;
  /** the caret is in a table's cell */
  cell: { table: string; r: number; c: number; head: boolean } | null;
  /** a picture, line, page break or table picked out */
  selected: { id: string; t: BlockType } | null;
  collapsed: boolean;
}

export interface EditorHandle {
  focus(at?: Point | 'start' | 'end'): void;
  select(block: string, s: number, e: number): void;
  range(): EditorRange | null;
  /** where some words are on screen, for a card shown beside them */
  rectOf(block: string, s: number, e: number): DOMRect | null;
  /** what the page shows of a block, relative to the page's frame — for the paragraph handle */
  blockTop(id: string): number | null;
  /** bold, italic or underline on the selected words — or off, where all of them have it */
  mark(t: FlagMark): void;
  /** a formatting command on the selection, or held at the caret for what is typed next */
  format(op: FormatOp): void;
  /** pictures, a table, a line or a page break put in at the caret */
  insert(blocks: Block[]): void;
  /** a block picked out — a picture, a table */
  pick(id: string | null): void;
  /** where the caret was last, even after a menu took the focus */
  lastRange(): EditorRange | null;
  /** some words scrolled into view, without moving the focus there */
  reveal(block: string, s: number, e: number): void;
}

/** A highlight drawn on words: a finding, a proposed edit's words, what is being asked about, a match of find. */
export interface Marked {
  block: string;
  s: number;
  e: number;
  kind: 'definite' | 'likely' | 'proposal' | 'focus' | 'find' | 'found';
}

const HL_NAMES = { definite: 'w-definite', likely: 'w-likely', proposal: 'w-proposal', focus: 'w-focus', find: 'w-find', found: 'w-found' } as const;
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const CLIP_TYPE = 'application/x-socria-blocks';
const FLAGS: FlagMark[] = ['b', 'i', 'u', 's', 'sup', 'sub'];
const samePoint = (a: Point | null | undefined, b: Point | null | undefined) => !!a && !!b && a.block === b.block && a.offset === b.offset;

interface Pending {
  at: Point;
  flags: Partial<Record<FlagMark, boolean>>;
  vals: Partial<Record<ValueMark, string | null>>;
}

export const Editor = forwardRef<
  EditorHandle,
  {
    doc: WriteDoc;
    onChange: (c: EditorChange) => void;
    onUndo: () => void;
    onRedo: () => void;
    marked: Marked[];
    onSelect: (s: EditorSelection | null) => void;
    onCaret: (p: Point | null) => void;
    /** the caret put somewhere on purpose — a click, a tap, an arrow key — never by typing */
    onPoint?: (p: Point | null) => void;
    /** the paragraph handle: its menu */
    onBlockMenu: (id: string, anchor: DOMRect) => void;
    /** what the toolbar should show as on */
    onFormat?: (s: FormatState) => void;
    /** pictures from a paste or a drop: kept, then put in at the point */
    onImages?: (files: File[], at: EditorRange) => void;
    /** blocks with pictures still at their own addresses: kept, then put in at the point */
    onSettle?: (blocks: Block[], at: EditorRange) => void;
    /** Ctrl/⌘+K */
    onLinkKey?: () => void;
    /** the pages, as sheets: how tall a page's writing area is, in CSS pixels — markers are drawn where pages will likely end */
    pageHeight?: number | null;
    onPages?: (n: number) => void;
    media: MediaClient;
    placeholder: string;
    label: string;
    readOnly?: boolean;
  }
>(function Editor(props, handleRef) {
  const { doc, onChange, onUndo, onRedo, marked, onSelect, onCaret, onPoint, onBlockMenu, placeholder, label, readOnly } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // the element for each block, and the block it SHOWS — drawn into it, or read back from it after the browser typed
  const drawn = useRef(new Map<string, { el: HTMLElement; block: Block }>());
  const cells = useRef<CellMap>(new Map());
  const docRef = useRef(doc);
  docRef.current = doc;
  const pendingCaret = useRef<Point | null>(null);
  /** a selection to put back right after the page is redrawn — a format keeps the words it was given selected */
  const pendingRange = useRef<EditorRange | null>(null);
  const pending = useRef<Pending | null>(null);
  const last = useRef<EditorRange | null>(null);
  const plainPaste = useRef(false);
  const composing = useRef(false);
  const [active, setActive] = useState<{ id: string; top: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; line: number; to: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  // where pages likely end, and whether that is a page break the person put in (drawn by the break itself)
  const [markers, setMarkers] = useState<{ y: number; pb: boolean }[]>([]);
  const mediaRef = useRef(props.media);
  mediaRef.current = props.media;

  // ── drawing the page from the model ─────────────────────────────────
  function drawImage(el: HTMLElement, b: Block) {
    let img = el.querySelector(':scope > img') as HTMLImageElement | null;
    if (!img) {
      img = document.createElement('img');
      img.draggable = false;
      el.appendChild(img);
    }
    if (img.alt !== (b.alt ?? '')) img.alt = b.alt ?? '';
    const natural = b.iw ? `min(100%, calc(var(--w-pt, 1.3333px) * ${Math.round(b.iw * 0.75)}))` : '100%';
    const w = b.w ? `${b.w}%` : natural;
    if (img.style.width !== w) img.style.width = w;
    const ratio = b.iw && b.ih ? `${b.iw} / ${b.ih}` : '';
    if (img.style.aspectRatio !== ratio) img.style.aspectRatio = ratio;
    const id = mediaIdOf(b.src) ?? '';
    if (img.dataset.m !== id) {
      img.dataset.m = id;
      img.removeAttribute('src');
      el.classList.add('is-loading');
      el.classList.remove('is-missing');
      const target = img;
      void mediaRef.current.url(id, b.by).then((u) => {
        if (target.dataset.m !== id) return;
        el.classList.remove('is-loading');
        if (u) target.src = u;
        else el.classList.add('is-missing');
      });
    }
    let note = el.querySelector(':scope > .w-img-missing') as HTMLElement | null;
    if (!note) {
      note = document.createElement('span');
      note.className = 'w-img-missing';
      el.appendChild(note);
    }
    const say = `Picture not on this device${b.alt ? ` — ${b.alt}` : ''}`;
    if (note.textContent !== say) note.textContent = say;
  }

  function draw(el: HTMLElement, b: Block) {
    if (b.t === 'hr') {
      if (!el.firstElementChild) el.innerHTML = '<hr>';
    } else if (b.t === 'pb') {
      if (!el.firstElementChild) el.innerHTML = '<span class="w-pb-label">Page break</span>';
    } else if (b.t === 'img') drawImage(el, b);
    else if (b.t === 'table') drawTable(el, b, cells.current, !readOnly);
    else fill(el, b);
  }

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const map = drawn.current;
    const keep = new Set<string>();
    let prev: Node | null = null;
    for (const b of doc.blocks) {
      keep.add(b.id);
      let r = map.get(b.id);
      const tag = tagFor(b.t);
      const kindChanged = r && (isOpaque(r.block.t) !== isOpaque(b.t) || (isOpaque(b.t) && r.block.t !== b.t) || (r.block.t === 'code') !== (b.t === 'code'));
      if (!r || r.el.tagName.toLowerCase() !== tag || r.el.parentNode !== root || kindChanged) {
        const el = document.createElement(tag);
        el.setAttribute(BLOCK_ATTR, b.id);
        shape(el, b);
        draw(el, b);
        if (r && r.el.parentNode === root) r.el.replaceWith(el);
        r = { el, block: b };
        map.set(b.id, r);
      } else if (r.block !== b) {
        // redrawn only when what it shows differs — an undo back to older words does, a keystroke read back does not
        if (isOpaque(b.t)) draw(r.el, b);
        else if (r.block.text !== b.text || !sameMarks(r.block.marks, b.marks)) fill(r.el, b);
        shape(r.el, b);
        r.block = b;
      }
      const want: Node | null = prev ? prev.nextSibling : root.firstChild;
      if (want !== r.el) root.insertBefore(r.el, want);
      prev = r.el;
    }
    for (const [id, r] of Array.from(map)) {
      if (!keep.has(id)) {
        r.el.remove();
        map.delete(id);
      }
    }
    // anything the browser left behind that is not a block of the document
    for (const n of Array.from(root.childNodes)) {
      const id = n.nodeType === 1 ? (n as HTMLElement).getAttribute(BLOCK_ATTR) : null;
      if (!id || map.get(id)?.el !== n) n.remove();
    }
    for (const r of Array.from(map.values())) r.el.classList.toggle('is-selected', r.block.id === picked);
    root.classList.toggle('is-empty', doc.blocks.length === 1 && !doc.blocks[0].text && doc.blocks[0].t === 'p');
    if (pendingRange.current) {
      const r = pendingRange.current;
      pendingRange.current = null;
      pendingCaret.current = null;
      placeCaret(r.from, r.to);
    } else if (pendingCaret.current) {
      const p = pendingCaret.current;
      pendingCaret.current = null;
      placeCaret(p);
    }
  });

  // ── highlights: findings, proposals, what is being asked about ─────
  useLayoutEffect(() => {
    const hl = typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: Map<string, unknown> }).highlights : undefined;
    const H = typeof window !== 'undefined' ? (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight : undefined;
    if (!hl || !H) return;
    // (after the page is drawn: a range over words that were redrawn would point at nothing)
    const by: Record<keyof typeof HL_NAMES, Range[]> = { definite: [], likely: [], proposal: [], focus: [], find: [], found: [] };
    for (const m of marked) {
      const r = rangeOf(m.block, m.s, m.e);
      if (r) by[m.kind].push(r);
    }
    for (const k of Object.keys(HL_NAMES) as (keyof typeof HL_NAMES)[]) {
      if (by[k].length) hl.set(HL_NAMES[k], new H(...by[k]));
      else hl.delete(HL_NAMES[k]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.blocks, marked]);
  useEffect(
    () => () => {
      const hl = typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: Map<string, unknown> }).highlights : undefined;
      if (hl) for (const n of Object.values(HL_NAMES)) hl.delete(n);
    },
    []
  );

  // ── where pages will likely end, as sheets ─────────────────────────
  const pageH = props.pageHeight ?? null;
  const onPages = props.onPages;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !pageH) {
      if (markers.length) setMarkers([]);
      return;
    }
    const measure = () => {
      const out: { y: number; pb: boolean }[] = [];
      let start = 0;
      for (const b of docRef.current.blocks) {
        const el = drawn.current.get(b.id)?.el;
        if (!el) continue;
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        if (b.t === 'pb') {
          out.push({ y: bottom, pb: true });
          start = bottom;
          continue;
        }
        while (bottom > start + pageH) {
          // a picture or a table that would cross the line goes to the next page whole; words break at a line
          const at = isOpaque(b.t) && top > start && el.offsetHeight <= pageH ? top : start + pageH;
          out.push({ y: at, pb: false });
          start = at;
        }
      }
      setMarkers((m) => (JSON.stringify(m) === JSON.stringify(out) ? m : out));
      onPages?.(out.length + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    return () => ro.disconnect();
    // measured from the page as drawn, each time it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.blocks, pageH, onPages]);

  // ── positions ───────────────────────────────────────────────────────
  const elOf = (id: string) => drawn.current.get(id)?.el ?? cells.current.get(id)?.el ?? null;
  const textOf = (id: string) => findText(docRef.current, id);

  function rangeOf(id: string, s: number, e: number): Range | null {
    const el = elOf(id);
    const b = textOf(id);
    if (!el || !b) return null;
    const lo = Math.max(0, Math.min(b.text.length, Math.min(s, e)));
    const hi = Math.max(0, Math.min(b.text.length, Math.max(s, e)));
    const a = pointIn(el, lo);
    const z = pointIn(el, hi);
    const r = document.createRange();
    try {
      r.setStart(a.node, a.offset);
      r.setEnd(z.node, z.offset);
    } catch {
      return null;
    }
    return r;
  }

  function pointOf(node: Node, off: number, end: boolean): Point | null {
    const root = rootRef.current;
    if (!root) return null;
    if (node === root) {
      // a selection made on the page itself: between blocks
      const kids = Array.from(root.children) as HTMLElement[];
      if (!kids.length) return null;
      const el = end ? kids[Math.max(0, Math.min(kids.length - 1, off - 1))] : kids[Math.max(0, Math.min(kids.length - 1, off))];
      const id = el.getAttribute(BLOCK_ATTR)!;
      const b = docRef.current.blocks.find((x) => x.id === id);
      if (b && isOpaque(b.t)) return { block: id, offset: end ? 1 : 0 };
      return { block: id, offset: end ? b?.text.length ?? 0 : 0 };
    }
    const cell = cellElOf(root, node);
    if (cell) {
      const id = cell.getAttribute(CELL_ATTR)!;
      return { block: id, offset: offsetIn(cell, node, off, textOf(id)?.text.length) };
    }
    const el = blockElOf(root, node);
    if (!el) return null;
    const id = el.getAttribute(BLOCK_ATTR)!;
    const b = docRef.current.blocks.find((x) => x.id === id);
    if (b && isOpaque(b.t)) return { block: id, offset: end ? 1 : 0 };
    return { block: id, offset: offsetIn(el, node, off, b?.text.length) };
  }

  function currentRange(): EditorRange | null {
    const root = rootRef.current;
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!root || !sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
    const from = pointOf(r.startContainer, r.startOffset, false);
    const to = pointOf(r.endContainer, r.endOffset, true);
    if (!from || !to) return null;
    return { from, to };
  }

  function placeCaret(p: Point, end?: Point) {
    const root = rootRef.current;
    if (!root) return;
    const top = docRef.current.blocks.find((b) => b.id === p.block);
    if (top && isOpaque(top.t)) {
      pick(top.id);
      return;
    }
    const el = elOf(p.block);
    if (!el) return;
    const a = pointIn(el, p.offset);
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    try {
      r.setStart(a.node, a.offset);
      if (end) {
        const zel = elOf(end.block);
        if (zel) {
          const z = pointIn(zel, end.offset);
          r.setEnd(z.node, z.offset);
        }
      } else r.collapse(true);
    } catch {
      return;
    }
    if (pickedRef.current) setPicked(null);
    // the editing host that holds the caret: the page, or a table's cell
    const host = cellElOf(root, a.node) ?? root;
    if (document.activeElement !== host) host.focus({ preventScroll: true });
    sel.removeAllRanges();
    sel.addRange(r);
    // keep the caret in view without jumping the page about
    const rect = (end ? r : el).getBoundingClientRect?.();
    if (rect && (rect.bottom > window.innerHeight - 40 || rect.top < 0)) el.scrollIntoView({ block: 'nearest' });
  }

  /**
   * A picture, line, page break or table picked out: keys act on it, the
   * toolbar offers what it can do. The browser's selection is the block
   * itself, whole — so focusing the page cannot leave a stray caret that
   * would take the picking away again, and a copy takes the block.
   */
  function pick(id: string | null) {
    setPicked(id);
    if (!id) return;
    const root = rootRef.current;
    const el = drawn.current.get(id)?.el;
    if (!root || !el) return;
    if (document.activeElement !== root) root.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (sel) {
      const r = document.createRange();
      r.selectNode(el);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    el.scrollIntoView({ block: 'nearest' });
    onSelect(null);
  }

  useImperativeHandle(handleRef, () => ({
    focus(at) {
      const blocks = docRef.current.blocks;
      if (!blocks.length) return;
      const firstText = blocks.find((b) => isTextType(b.t));
      const lastText = [...blocks].reverse().find((b) => isTextType(b.t));
      if (!at || at === 'start') {
        if (firstText) placeCaret({ block: firstText.id, offset: 0 });
      } else if (at === 'end') {
        if (lastText) placeCaret({ block: lastText.id, offset: lastText.text.length });
      } else placeCaret(at);
    },
    select(block, s, e) {
      placeCaret({ block, offset: s }, { block, offset: e });
    },
    range: currentRange,
    lastRange: () => currentRange() ?? last.current,
    reveal(block, s, e) {
      const r = rangeOf(block, s, e);
      const el = elOf(block);
      const rect = r?.getBoundingClientRect();
      if (rect && rect.top > 80 && rect.bottom < window.innerHeight - 80) return;
      el?.scrollIntoView({ block: 'center' });
    },
    rectOf(block, s, e) {
      const r = rangeOf(block, s, e);
      if (!r) return elOf(block)?.getBoundingClientRect() ?? null;
      const rect = r.getBoundingClientRect();
      return rect.width || rect.height ? rect : elOf(block)?.getBoundingClientRect() ?? null;
    },
    blockTop(id) {
      const el = elOf(id);
      return el ? el.offsetTop : null;
    },
    mark(t) {
      if (!readOnly) applyFormat({ kind: 'flag', t });
    },
    format(op) {
      if (!readOnly) applyFormat(op);
    },
    insert(blocks) {
      if (!readOnly) insertBlocksHere(blocks);
    },
    pick,
  }));

  // ── changing the model ──────────────────────────────────────────────
  const commit = useCallback(
    (next: WriteDoc, kind: EditorChange['kind'], caret: Point | null, block?: string) => {
      if (caret) pendingCaret.current = caret;
      onChange({ doc: next, kind, block });
    },
    [onChange]
  );

  /** What the browser typed into one block (or one cell), read back. */
  function readBack(el: HTMLElement, id: string): Block | null {
    const b = textOf(id);
    if (!b) return null;
    const { text, marks } = readEl(el);
    if (text === b.text && sameMarks(marks, b.marks)) return b;
    const next: Block = { ...b, text };
    if (marks.length && b.t !== 'code') next.marks = marks;
    else delete next.marks;
    const r = drawn.current.get(id) ?? cells.current.get(id);
    if (r && r.el === el) r.block = next;
    return next;
  }

  /** The whole page read back — when the browser changed its shape itself (a mobile keyboard's Enter, say). */
  function readAll(): Block[] {
    const root = rootRef.current!;
    const known = new Map(docRef.current.blocks.map((b) => [b.id, b]));
    const seen = new Set<string>();
    const out: Block[] = [];
    for (const n of Array.from(root.childNodes)) {
      let el: HTMLElement;
      if (n.nodeType === 3) {
        if (!(n.nodeValue ?? '').trim()) {
          n.remove();
          continue;
        }
        el = document.createElement('p');
        n.replaceWith(el);
        el.appendChild(n);
      } else if (n.nodeType === 1) el = n as HTMLElement;
      else continue;
      let id = el.getAttribute(BLOCK_ATTR);
      const prior = id ? known.get(id) : undefined;
      const mine = !!(id && prior && drawn.current.get(id)?.el === el && !seen.has(id));
      // a picture, a line, a table: what the browser cannot type into is kept as it was
      if (mine && prior && isOpaque(prior.t)) {
        seen.add(id!);
        out.push(prior);
        continue;
      }
      if (!mine) {
        id = uid('b');
        el.setAttribute(BLOCK_ATTR, id);
      }
      seen.add(id!);
      const { text, marks } = readEl(el);
      const base: Block = mine ? prior! : { id: id!, t: prior && isTextType(prior.t) ? prior.t : typeOfEl(el), text: '', ...(prior?.lvl ? { lvl: prior.lvl } : {}) };
      let b: Block = base;
      if (!mine || text !== base.text || !sameMarks(marks, base.marks)) {
        b = { ...base, text };
        if (marks.length && b.t !== 'code') b.marks = marks;
        else delete b.marks;
      }
      // what this element shows, as read
      drawn.current.set(id!, { el, block: b });
      out.push(b);
    }
    // a picture or a table the browser removed from the page is not removed from the writing by it
    for (const b of docRef.current.blocks) if (isOpaque(b.t) && !seen.has(b.id)) return docRef.current.blocks;
    return out;
  }

  const shortcut = /^(#{1,3}|[-*•]|1[.)]|>|```) ?\s$/;
  const SHORT: Record<string, BlockType> = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'ul', '*': 'ul', '•': 'ul', '1.': 'ol', '1)': 'ol', '>': 'quote', '```': 'code' };

  function onInput(e: React.FormEvent<HTMLDivElement>) {
    const root = rootRef.current;
    if (!root || readOnly) return;
    const native = e.nativeEvent as InputEvent;
    const d = docRef.current;
    const sel = window.getSelection();
    // typed into a table's cell
    const cell = sel && sel.rangeCount ? cellElOf(root, sel.anchorNode) : null;
    if (cell) {
      const id = cell.getAttribute(CELL_ATTR)!;
      const b = readBack(cell, id);
      if (b && b !== textOf(id)) commit(replaceText(d, b), 'typing', null, id);
      return;
    }
    const anchor = sel && sel.rangeCount ? blockElOf(root, sel.anchorNode) : null;
    const structural = root.childElementCount !== d.blocks.length || !anchor || drawn.current.get(anchor.getAttribute(BLOCK_ATTR) ?? '')?.el !== anchor;
    if (structural) {
      const blocks = readAll();
      if (blocks === d.blocks) {
        // redraw what the browser broke; the writing is as it was
        commit({ ...d, blocks: [...d.blocks] }, 'structure', null);
        return;
      }
      commit({ ...d, blocks }, 'structure', caretIn(blocks));
      return;
    }
    const id = anchor.getAttribute(BLOCK_ATTR)!;
    const b = readBack(anchor, id);
    if (!b) return;
    let next = b === textOf(b.id) ? d : replaceBlock(d, b);
    // Markdown's habits, at the start of a paragraph: "# " a heading, "- " a list, "> " a quote, "``` " code
    if (!composing.current && native.inputType === 'insertText' && native.data === ' ' && b.t === 'p') {
      const caret = caretIn([b]);
      const m = shortcut.exec(b.text.slice(0, caret?.offset ?? 0));
      if (m && caret && caret.offset === m[0].length) {
        const type = SHORT[m[1]];
        if (type) {
          // the literal characters are a step of their own, so undo brings them back
          onChange({ doc: next, kind: 'structure' });
          let shaped = setBlockType(next, b.id, type);
          const cur = shaped.blocks.find((x) => x.id === b.id)!;
          shaped = replaceBlock(shaped, spliceBlock(cur, 0, m[0].length, ''));
          commit(shaped, 'structure', { block: b.id, offset: 0 });
          return;
        }
      }
    }
    // an address typed and followed by a space becomes a link — a step of its own, so one undo takes the link and keeps the words
    if (!composing.current && native.inputType === 'insertText' && native.data === ' ' && b.t !== 'code') {
      const caret = caretIn([b]);
      if (caret) {
        const before = b.text.slice(0, caret.offset - 1);
        const m = /(?:^|\s)((?:https?:\/\/|www\.)[^\s]+[^\s.,;:!?)\]'"])$/.exec(before);
        if (m) {
          const s = before.length - m[1].length;
          const href = hrefValue(m[1]);
          if (href && !(b.marks ?? []).some((x) => x.t === 'a' && x.s < before.length && x.e > s)) {
            onChange({ doc: next, kind: 'structure' });
            next = replaceBlock(next, setMark(b, s, before.length, 'a', href));
            commit(next, 'structure', caret);
            return;
          }
        }
      }
    }
    if (next !== d) commit(next, 'typing', null, b.id);
  }

  /** Where the caret is, in blocks just read back — measured against their new text, not the model's old. */
  function caretIn(blocks: Block[]): Point | null {
    const root = rootRef.current;
    const sel = window.getSelection();
    if (!root || !sel || !sel.rangeCount || !sel.focusNode) return null;
    const el = blockElOf(root, sel.focusNode);
    const id = el?.getAttribute(BLOCK_ATTR);
    const b = id ? blocks.find((x) => x.id === id) : undefined;
    if (!el || !b) return null;
    return { block: b.id, offset: offsetIn(el, sel.focusNode, sel.focusOffset, b.text.length) };
  }

  function rangeNow(useLast = false): EditorRange | null {
    const r = currentRange() ?? (useLast ? last.current : null);
    if (!r) return null;
    const d = docRef.current;
    // a range only counts while the blocks it names are still there
    if (!findText(d, r.from.block) && blockIndex(d, r.from.block) < 0) return null;
    if (!findText(d, r.to.block) && blockIndex(d, r.to.block) < 0) return null;
    const [from, to] = orderPoints(d, r.from, r.to);
    return { from, to };
  }

  const collapsedR = (r: EditorRange) => r.from.block === r.to.block && r.from.offset === r.to.offset;

  /** The blocks of words a range covers, each with the part of it covered — a cell's words, or the paragraphs between, and the cells of a table wholly inside. */
  function spansOf(d: WriteDoc, r: EditorRange): { id: string; s: number; e: number; cell: boolean }[] {
    if (blockIndex(d, r.from.block) < 0 || blockIndex(d, r.to.block) < 0) {
      const b = findText(d, r.from.block);
      return b && r.from.block === r.to.block ? [{ id: b.id, s: r.from.offset, e: r.to.offset, cell: true }] : [];
    }
    const i = blockIndex(d, r.from.block);
    const j = blockIndex(d, r.to.block);
    const out: { id: string; s: number; e: number; cell: boolean }[] = [];
    for (let k = i; k <= j; k++) {
      const b = d.blocks[k];
      if (b.t === 'table') {
        if ((k > i || r.from.offset === 0) && (k < j || r.to.offset >= 1)) for (const row of b.rows ?? []) for (const c of row) out.push({ id: c.id, s: 0, e: c.text.length, cell: true });
        continue;
      }
      if (!isTextType(b.t)) continue;
      out.push({ id: b.id, s: k === i ? r.from.offset : 0, e: k === j ? r.to.offset : b.text.length, cell: false });
    }
    return out;
  }

  /** The top-level blocks a range touches (a cell's range touches its table). */
  function blocksOf(d: WriteDoc, r: EditorRange): Block[] {
    const at = (p: Point) => {
      const i = blockIndex(d, p.block);
      return i >= 0 ? i : findCell(d, p.block)?.ti ?? -1;
    };
    const i = at(r.from);
    const j = at(r.to);
    if (i < 0 || j < 0) return [];
    return d.blocks.slice(Math.min(i, j), Math.max(i, j) + 1);
  }

  function applyFormat(op: FormatOp) {
    const r = rangeNow(true);
    let d = docRef.current;
    const sel = pickedRef.current ? d.blocks.find((b) => b.id === pickedRef.current) : null;
    if (sel && op.kind === 'para' && sel.t === 'img') {
      commit(setParaAttrs(d, [sel.id], op.patch), 'structure', null);
      return;
    }
    if (!r) return;
    const collapsed = collapsedR(r);
    // the selection is put back right after the page is redrawn — or now, when nothing is redrawn and a menu took the focus
    const restore = () => {
      pendingRange.current = collapsed ? null : r;
      if (collapsed) pendingCaret.current = r.from;
      if (!currentRange()) placeCaret(r.from, collapsed ? undefined : r.to);
    };
    if (op.kind === 'block' || op.kind === 'list') {
      const ids = blocksOf(d, r).filter((b) => isTextType(b.t)).map((b) => b.id);
      if (!ids.length) return;
      const t = op.t;
      const all = ids.every((id) => d.blocks.find((b) => b.id === id)?.t === t);
      for (const id of ids) d = setBlockType(d, id, all && t !== 'p' ? 'p' : t);
      commit(d, 'structure', null);
      restore();
      return;
    }
    if (op.kind === 'para') {
      const ids = [...blocksOf(d, r).filter((b) => isTextType(b.t)).map((b) => b.id), ...(blockIndex(d, r.from.block) < 0 ? [r.from.block] : [])];
      commit(setParaAttrs(d, ids, op.patch), 'structure', null);
      restore();
      return;
    }
    if (op.kind === 'indent') {
      const ids = blocksOf(d, r).filter((b) => isTextType(b.t)).map((b) => b.id);
      const next = indentBlocks(d, ids, op.delta);
      if (next !== d) commit(next, 'structure', null);
      restore();
      return;
    }
    if (collapsed) {
      // held at the caret, for what is typed next
      const b = findText(d, r.from.block);
      if (!b) return;
      const p: Pending = pending.current && samePoint(pending.current.at, r.from) ? pending.current : { at: r.from, flags: {}, vals: {} };
      const here = marksAt(b, r.from.offset);
      if (op.kind === 'flag') {
        const now = p.flags[op.t] ?? here.some((m) => m.t === op.t);
        p.flags = { ...p.flags, [op.t]: !now };
        if (!now && op.t === 'sup') p.flags.sub = false;
        if (!now && op.t === 'sub') p.flags.sup = false;
      } else if (op.kind === 'value') {
        if (op.t === 'a') return;
        p.vals = { ...p.vals, [op.t]: op.v };
      } else if (op.kind === 'size-step') {
        const cur = Number(p.vals.size ?? here.find((m) => m.t === 'size')?.v ?? d.size ?? 12);
        p.vals = { ...p.vals, size: String(stepSize(cur, op.dir)) };
      } else if (op.kind === 'clear') {
        p.flags = { b: false, i: false, u: false, s: false, sup: false, sub: false };
        p.vals = { color: null, bg: null, font: null, size: null };
      }
      pending.current = p;
      emitState();
      // nothing is redrawn for a choice held at the caret: the caret is only put back if a menu took it away
      if (!currentRange()) placeCaret(r.from);
      return;
    }
    const spans = spansOf(d, r).filter((x) => x.e > x.s);
    if (!spans.length) return;
    if (op.kind === 'flag') {
      // all of it on, or all of it off: decided by whether every selected character already has it
      const allOn = spans.every((x) => {
        const b = findText(d, x.id);
        return !!b && hasMark(b, x.s, x.e, op.t);
      });
      for (const x of spans) {
        const cur = findText(d, x.id)!;
        const has = hasMark(cur, x.s, x.e, op.t);
        if (allOn ? has : !has) d = replaceText(d, toggleMark(cur, x.s, x.e, op.t));
      }
    } else if (op.kind === 'value') {
      for (const x of spans) d = replaceText(d, setMark(findText(d, x.id)!, x.s, x.e, op.t, op.v));
    } else if (op.kind === 'size-step') {
      for (const x of spans) {
        const cur = findText(d, x.id)!;
        const now = Number(valueOver(cur, x.s, x.e, 'size') ?? d.size ?? 12);
        d = replaceText(d, setMark(cur, x.s, x.e, 'size', String(stepSize(now, op.dir))));
      }
    } else if (op.kind === 'clear') {
      for (const x of spans) d = replaceText(d, clearMarks(findText(d, x.id)!, x.s, x.e));
    }
    // keep the selection where it was, right after the page is redrawn
    pendingCaret.current = null;
    pendingRange.current = r;
    onChange({ doc: d, kind: 'structure' });
  }

  function stepSize(cur: number, dir: 1 | -1): number {
    if (dir > 0) return FONT_SIZES.find((s) => s > cur) ?? Math.min(96, cur + 12);
    return [...FONT_SIZES].reverse().find((s) => s < cur) ?? Math.max(6, cur - 1);
  }

  /** Pictures, a table, a line or a page break put in at the caret — or after what is picked out. */
  function insertBlocksHere(blocks: Block[]) {
    const d = docRef.current;
    const sel = pickedRef.current;
    let at: Point | null = null;
    if (sel && blockIndex(d, sel) >= 0) at = { block: sel, offset: 1 };
    else {
      const r = rangeNow(true);
      if (r && blockIndex(d, r.from.block) < 0) {
        // in a table's cell: after the table
        const c = findCell(d, r.from.block);
        if (c) at = { block: c.table.id, offset: 1 };
      } else if (r) {
        const cut = collapsedR(r) ? { doc: d, caret: r.from } : replaceRange(d, r.from, r.to);
        const out = insertAt(cut.doc, cut.caret, blocks);
        const next = withTextAround(out.doc);
        commit(next, 'structure', out.caret);
        afterInsert(next, blocks);
        return;
      }
    }
    if (!at) {
      const lastB = d.blocks[d.blocks.length - 1];
      at = { block: lastB.id, offset: isOpaque(lastB.t) ? 1 : lastB.text.length };
    }
    const out = insertAt(d, at, blocks);
    const next = withTextAround(out.doc);
    commit(next, 'structure', out.caret);
    afterInsert(next, blocks);
  }

  /** A table goes in with the caret in its first cell; a picture, picked out. */
  function afterInsert(next: WriteDoc, blocks: Block[]) {
    const one = blocks.length === 1 ? blocks[0] : null;
    if (!one) return;
    const placed = next.blocks.find((b) => b.id === one.id);
    if (!placed) return;
    requestAnimationFrame(() => {
      if (placed.t === 'table') {
        const first = placed.rows?.[0]?.[0];
        if (first) placeCaret({ block: first.id, offset: first.text.length });
      } else if (placed.t === 'img') pick(placed.id);
    });
  }

  // React's onBeforeInput is an older polyfill with no inputType; the page listens to the real event
  function onBeforeInput(ev: InputEvent) {
    const e = ev;
    if (readOnly) {
      e.preventDefault();
      return;
    }
    if (composing.current || ev.isComposing) return;
    const t = ev.inputType ?? '';
    if (t === 'historyUndo' || t === 'historyRedo') {
      e.preventDefault();
      if (t === 'historyUndo') onUndo();
      else onRedo();
      return;
    }
    if (t === 'formatBold' || t === 'formatItalic' || t === 'formatUnderline' || t === 'formatStrikeThrough' || t === 'formatSuperscript' || t === 'formatSubscript') {
      e.preventDefault();
      applyFormat({ kind: 'flag', t: t === 'formatBold' ? 'b' : t === 'formatItalic' ? 'i' : t === 'formatUnderline' ? 'u' : t === 'formatStrikeThrough' ? 's' : t === 'formatSuperscript' ? 'sup' : 'sub' });
      return;
    }
    if (t.startsWith('format')) {
      // nothing else a browser offers to format is part of this page
      e.preventDefault();
      return;
    }
    if (t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'insertFromYank' || t === 'insertFromPasteAsQuotation') {
      // handled as a paste below, where the clipboard can be read properly
      return;
    }
    const r = rangeNow();
    if (!r) return;
    const collapsed = collapsedR(r);
    const d = docRef.current;
    const inCell = blockIndex(d, r.from.block) < 0;
    const multi = r.from.block !== r.to.block;
    // typed with formatting held at the caret: the model puts the words in, wearing it
    if ((t === 'insertText' || t === 'insertReplacementText') && collapsed && pending.current && samePoint(pending.current.at, r.from) && ev.data) {
      const b = findText(d, r.from.block);
      if (b && b.t !== 'code') {
        e.preventDefault();
        const p = pending.current;
        const marks: Mark[] = marksAt(b, r.from.offset).filter((m) => (m.t in p.flags ? p.flags[m.t as FlagMark] !== false : true) && !(m.t in p.vals));
        for (const f of FLAGS) if (p.flags[f] && !marks.some((m) => m.t === f)) marks.push({ s: 0, e: 0, t: f });
        for (const [k, v] of Object.entries(p.vals) as [ValueMark, string | null][]) if (v) marks.push({ s: 0, e: 0, t: k, v });
        const next = insertMarked(b, r.from.offset, ev.data, marks);
        const caret = { block: b.id, offset: r.from.offset + ev.data.length };
        pending.current = { ...p, at: caret };
        commit(replaceText(d, next), 'typing', caret, b.id);
        return;
      }
    }
    if (t === 'insertParagraph') {
      e.preventDefault();
      const cut = collapsed ? { doc: d, caret: r.from } : deleteRange(r);
      const host = findText(cut.doc, cut.caret.block);
      // in code, Enter is a new line; on a blank last line it leaves the code
      if (host?.t === 'code' && !inCell) {
        const text = host.text;
        if (cut.caret.offset === text.length && text.endsWith('\n')) {
          const trimmed = replaceBlock(cut.doc, spliceBlock(host, text.length - 1, text.length, ''));
          const sp = splitBlock(trimmed, host.id, text.length - 1);
          commit(sp.doc, 'structure', sp.caret);
          return;
        }
        const out = replaceRange(cut.doc, cut.caret, cut.caret, '\n');
        commit(out.doc, 'structure', out.caret);
        return;
      }
      const sp = splitBlock(cut.doc, cut.caret.block, cut.caret.offset);
      commit(sp.doc, 'structure', sp.caret);
      return;
    }
    if (t === 'insertLineBreak') {
      e.preventDefault();
      const out = deleteRange(r, '\n');
      commit(out.doc, 'structure', out.caret);
      return;
    }
    if (t.startsWith('delete')) {
      const back = t.includes('Backward');
      const b = findText(d, r.from.block);
      if (collapsed && b) {
        if (inCell) {
          // a cell's words never run into the next cell's
          if ((back && r.from.offset === 0) || (!back && r.from.offset >= b.text.length)) e.preventDefault();
          return;
        }
        if (back && r.from.offset === 0) {
          e.preventDefault();
          const out = mergeBack(d, b.id);
          if (out.doc !== d) commit(out.doc, 'structure', out.select ? null : out.caret);
          if (out.select) requestAnimationFrame(() => pick(out.select!));
          return;
        }
        if (!back && r.from.offset >= b.text.length) {
          e.preventDefault();
          const out = mergeForward(d, b.id);
          if (out.doc !== d) commit(out.doc, 'structure', out.select ? null : out.caret);
          if (out.select) requestAnimationFrame(() => pick(out.select!));
          return;
        }
        return;
      }
      if (multi) {
        e.preventDefault();
        const out = deleteRange(r);
        commit(withTextAround(out.doc), 'structure', out.caret);
      }
      return;
    }
    if (t === 'insertText' || t === 'insertReplacementText') {
      if (multi) {
        e.preventDefault();
        const out = deleteRange(r, ev.data ?? '');
        commit(withTextAround(out.doc), 'structure', out.caret);
      }
      return;
    }
    if (multi) {
      // anything else across paragraphs is done to the model, not left to the browser
      e.preventDefault();
      const out = deleteRange(r);
      commit(withTextAround(out.doc), 'structure', out.caret);
    }
  }

  function deleteRange(r: EditorRange, ins = ''): { doc: WriteDoc; caret: Point } {
    return replaceRange(docRef.current, r.from, r.to, ins);
  }

  /** The caret moved to the next or previous cell; past the last one, a new row. */
  function moveCell(cellId: string, dir: 1 | -1) {
    const d = docRef.current;
    const at = findCell(d, cellId);
    if (!at) return;
    const rows = at.table.rows ?? [];
    const width = rows[0]?.length ?? 1;
    let k = at.r * width + at.c + dir;
    if (k >= rows.length * width) {
      const next = insertRow(d, at.table.id, rows.length);
      const row = next.blocks.find((b) => b.id === at.table.id)?.rows?.at(-1);
      if (row?.[0]) commit(next, 'structure', { block: row[0].id, offset: 0 });
      return;
    }
    if (k < 0) k = 0;
    const c = rows[Math.floor(k / width)]?.[k % width];
    if (c) placeCaret({ block: c.id, offset: c.text.length });
  }

  /** Whether the caret is on the first (or last) line of the element it is in. */
  function onEdgeLine(el: HTMLElement, dir: -1 | 1): boolean {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return true;
    const rects = sel.getRangeAt(0).getClientRects();
    const box = el.getBoundingClientRect();
    const r = rects[0];
    if (!r) return true;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    return dir < 0 ? r.top - box.top < line * 0.9 : box.bottom - r.bottom < line * 0.9;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const mac = isMac();
    const mod = mac ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) onRedo();
      else onUndo();
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && k === 'y' && !mac) {
      e.preventDefault();
      onRedo();
      return;
    }
    if (readOnly) return;
    const d = docRef.current;
    // a picture, line, page break or table picked out
    const sel = pickedRef.current ? d.blocks.find((b) => b.id === pickedRef.current) : null;
    if (sel) {
      const i = blockIndex(d, sel.id);
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        const next = withTextAround(removeBlocks(d, [sel.id]));
        const near = next.blocks[Math.min(i, next.blocks.length - 1)];
        setPicked(null);
        commit(next, 'structure', near && isTextType(near.t) ? { block: near.id, offset: 0 } : null);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const sp = splitBlock(d, sel.id, e.shiftKey ? 0 : 1);
        setPicked(null);
        commit(sp.doc, 'structure', sp.caret);
        return;
      }
      if (e.key === 'Escape') {
        setPicked(null);
        return;
      }
      if (e.key.startsWith('Arrow') || e.key.length === 1) {
        // the caret goes to the words beside it; a key typed goes after it
        const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key.length === 1;
        const pool = fwd ? d.blocks.slice(i + 1) : d.blocks.slice(0, i).reverse();
        const to = pool.find((b) => isTextType(b.t));
        if (to) {
          if (!e.key.startsWith('Arrow')) {
            // a character typed after a picture starts the line after it
            setPicked(null);
            placeCaret({ block: to.id, offset: 0 });
            return;
          }
          e.preventDefault();
          placeCaret({ block: to.id, offset: fwd ? 0 : to.text.length });
        } else e.preventDefault();
        return;
      }
      if (mod && (k === 'c' || k === 'x')) return;
      if (!mod) e.preventDefault();
    }
    // formatting keys, as word processors have them
    if (mod && !e.altKey && !e.shiftKey && (k === 'b' || k === 'i' || k === 'u')) {
      e.preventDefault();
      applyFormat({ kind: 'flag', t: k as FlagMark });
      return;
    }
    if (mod && e.shiftKey && !e.altKey && k === 'x') {
      e.preventDefault();
      applyFormat({ kind: 'flag', t: 's' });
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && (e.key === '.' || e.key === ',')) {
      e.preventDefault();
      applyFormat({ kind: 'flag', t: e.key === '.' ? 'sup' : 'sub' });
      return;
    }
    if (mod && e.shiftKey && (e.key === '>' || e.key === '<' || e.key === '.' || e.key === ',')) {
      e.preventDefault();
      applyFormat({ kind: 'size-step', dir: e.key === '>' || e.key === '.' ? 1 : -1 });
      return;
    }
    if (mod && !e.altKey && k === 'k') {
      e.preventDefault();
      // the writing's own: not the app's search as well
      e.stopPropagation();
      props.onLinkKey?.();
      return;
    }
    if (mod && !e.shiftKey && e.key === '\\') {
      e.preventDefault();
      applyFormat({ kind: 'clear' });
      return;
    }
    if (mod && e.shiftKey && !e.altKey && (k === 'l' || k === 'e' || k === 'r' || k === 'j')) {
      e.preventDefault();
      applyFormat({ kind: 'para', patch: { align: k === 'l' ? null : k === 'e' ? 'center' : k === 'r' ? 'right' : 'justify' } });
      return;
    }
    if (mod && !e.altKey && (e.key === ']' || e.key === '[')) {
      e.preventDefault();
      applyFormat({ kind: 'indent', delta: e.key === ']' ? 1 : -1 });
      return;
    }
    if (mod && e.shiftKey && !e.altKey && k === 'v') {
      // the next paste comes in as words alone
      plainPaste.current = true;
      setTimeout(() => (plainPaste.current = false), 1500);
      return;
    }
    const r = rangeNow();
    if (!r) return;
    const inCell = blockIndex(d, r.from.block) < 0;
    if (mod && e.key === 'Enter' && !inCell) {
      e.preventDefault();
      insertBlocksHere([{ id: uid('b'), t: 'pb', text: '' }]);
      return;
    }
    if (inCell) {
      const cellEl = elOf(r.from.block);
      if (e.key === 'Tab') {
        e.preventDefault();
        moveCell(r.from.block, e.shiftKey ? -1 : 1);
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && cellEl && onEdgeLine(cellEl, e.key === 'ArrowUp' ? -1 : 1)) {
        const at = findCell(d, r.from.block);
        if (!at) return;
        const rows = at.table.rows ?? [];
        const rr = at.r + (e.key === 'ArrowUp' ? -1 : 1);
        e.preventDefault();
        if (rr >= 0 && rr < rows.length) {
          const c = rows[rr][at.c];
          placeCaret({ block: c.id, offset: e.key === 'ArrowUp' ? c.text.length : 0 });
          return;
        }
        // out of the table, to the words above or below it
        const pool = e.key === 'ArrowUp' ? d.blocks.slice(0, at.ti).reverse() : d.blocks.slice(at.ti + 1);
        const to = pool.find((b) => isTextType(b.t));
        if (to) placeCaret({ block: to.id, offset: e.key === 'ArrowUp' ? to.text.length : 0 });
        return;
      }
      if (e.key === 'Escape') {
        const at = findCell(d, r.from.block);
        if (at) pick(at.table.id);
        return;
      }
      return;
    }
    const cur = d.blocks.find((b) => b.id === r.from.block);
    if (!cur) return;
    // into a table from the words above or below it
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && collapsedR(r)) {
      const i = blockIndex(d, cur.id);
      const nb = d.blocks[i + (e.key === 'ArrowDown' ? 1 : -1)];
      const el = elOf(cur.id);
      if (nb?.t === 'table' && el && onEdgeLine(el, e.key === 'ArrowUp' ? -1 : 1)) {
        e.preventDefault();
        const rows = nb.rows ?? [];
        const c = e.key === 'ArrowDown' ? rows[0]?.[0] : rows[rows.length - 1]?.[0];
        if (c) placeCaret({ block: c.id, offset: 0 });
        return;
      }
    }
    // Tab in a list nests the item; anywhere else Tab moves on, as it should
    if (e.key === 'Tab' && isList(cur.t)) {
      e.preventDefault();
      const ids = blocksOf(d, r).filter((b) => isList(b.t)).map((b) => b.id);
      const next = indentBlocks(d, ids, e.shiftKey ? -1 : 1);
      if (next !== d) commit(next, 'structure', r.from);
      return;
    }
    // a paragraph moved: Alt+Shift+↑/↓, or Ctrl+Shift+↑/↓ on a Mac
    const moveKeys = mac ? e.ctrlKey && e.shiftKey && !e.metaKey : e.altKey && e.shiftKey && !e.ctrlKey;
    if (moveKeys && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const next = nudgeBlock(d, cur.id, e.key === 'ArrowUp' ? -1 : 1);
      if (next !== d) commit(next, 'structure', r.from);
      return;
    }
    // block shapes, the word processors' keys: Ctrl/⌘+Alt+0–3, Ctrl/⌘+Shift+7/8/9
    if (mod && e.altKey && /^Digit[0-3]$/.test(e.code)) {
      e.preventDefault();
      const t: BlockType = e.code === 'Digit0' ? 'p' : e.code === 'Digit1' ? 'h1' : e.code === 'Digit2' ? 'h2' : 'h3';
      commit(setBlockType(d, cur.id, cur.t === t ? 'p' : t), 'structure', r.from);
      return;
    }
    if (mod && e.shiftKey && (e.code === 'Digit7' || e.code === 'Digit8' || e.code === 'Digit9')) {
      e.preventDefault();
      const t: BlockType = e.code === 'Digit7' ? 'ol' : e.code === 'Digit8' ? 'ul' : 'quote';
      applyFormat({ kind: t === 'quote' ? 'block' : 'list', t } as FormatOp);
      return;
    }
    if (e.key === 'Escape') {
      onSelect(null);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (readOnly) return;
    e.preventDefault();
    const r = rangeNow();
    if (!r) return;
    const cd = e.clipboardData;
    const plain = plainPaste.current;
    plainPaste.current = false;
    // pictures: a screenshot, a copied image
    const files = Array.from(cd.files ?? []).filter((f) => /^image\/(png|jpe?g|gif|webp)$/i.test(f.type));
    const html = plain ? '' : cd.getData('text/html');
    if (files.length && !plain && (!html || /<img\b/i.test(html)) && props.onImages) {
      props.onImages(files, r);
      return;
    }
    const text = cd.getData('text/plain');
    // an address pasted over words makes them a link
    if (!plain && text && !collapsedR(r) && r.from.block === r.to.block) {
      const href = hrefValue(text.trim());
      if (href && !/\s/.test(text.trim())) {
        const b = findText(docRef.current, r.from.block);
        if (b) {
          commit(replaceText(docRef.current, setMark(b, r.from.offset, r.to.offset, 'a', href)), 'structure', r.to);
          return;
        }
      }
    }
    let blocks: Block[] = [];
    const own = plain ? '' : cd.getData(CLIP_TYPE);
    if (own) {
      try {
        const parsed = JSON.parse(own);
        if (Array.isArray(parsed)) blocks = parsed.filter((b) => b && typeof b.text === 'string' && typeof b.t === 'string');
      } catch {
        blocks = [];
      }
    }
    if (!blocks.length) {
      if (html && html.trim()) blocks = htmlToBlocks(html, { images: true, baseSize: docRef.current.size ?? 12 });
      if (!blocks.length && text) blocks = plain ? [{ id: uid('b'), t: 'p', text: text.replace(/\r\n?/g, '\n') }] : pastedText(text);
      // a paste of words with no shape into the middle of a sentence is just the words
      if (!blocks.length && text) blocks = [{ id: uid('b'), t: 'p', text: text.replace(/\r\n?/g, '\n') }];
    }
    if (!blocks.length) return;
    if (blocks.some(isLooseImage)) {
      if (props.onSettle) props.onSettle(blocks, r);
      else blocks = blocks.filter((b) => !isLooseImage(b));
      if (props.onSettle) return;
    }
    pasteBlocks(blocks, r);
  }

  /** Blocks put in at a range — what a paste does, now or once its pictures are kept. */
  function pasteBlocks(blocks: Block[], r: EditorRange) {
    const d = docRef.current;
    const cut = collapsedR(r) ? { doc: d, caret: r.from } : replaceRange(d, r.from, r.to);
    const out = insertAt(cut.doc, cut.caret, blocks.map((b) => ({ ...b, id: uid('b') })));
    commit(withTextAround(out.doc), 'structure', out.caret);
  }

  function copyOut(e: React.ClipboardEvent<HTMLDivElement>, cut: boolean) {
    const d = docRef.current;
    const sel = pickedRef.current ? d.blocks.find((b) => b.id === pickedRef.current) : null;
    const r = sel ? { from: { block: sel.id, offset: 0 }, to: { block: sel.id, offset: 1 } } : rangeNow();
    if (!r || collapsedR(r)) return;
    e.preventDefault();
    const blocks = blocksInRange(d, r.from, r.to);
    const part = { title: '', blocks };
    e.clipboardData.setData('text/plain', toText(part).replace(/\n$/, ''));
    e.clipboardData.setData('text/html', toHtml(part));
    e.clipboardData.setData(CLIP_TYPE, JSON.stringify(blocks));
    if (cut && !readOnly) {
      if (sel) {
        setPicked(null);
        commit(withTextAround(removeBlocks(d, [sel.id])), 'structure', null);
        return;
      }
      const out = deleteRange(r);
      commit(withTextAround(out.doc), 'structure', out.caret);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    // words dragged in from elsewhere arrive as a paste at the drop point; a picture file, as a picture
    if (readOnly) return;
    const text = e.dataTransfer.getData('text/plain');
    const html = e.dataTransfer.getData('text/html');
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) => /^image\/(png|jpe?g|gif|webp)$/i.test(f.type));
    e.preventDefault();
    if (!text && !html && !files.length) return;
    const doc_ = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    let node: Node | null = null;
    let off = 0;
    const cr = doc_.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (cr) {
      node = cr.startContainer;
      off = cr.startOffset;
    } else {
      const cp = doc_.caretPositionFromPoint?.(e.clientX, e.clientY);
      if (cp) {
        node = cp.offsetNode;
        off = cp.offset;
      }
    }
    const at = node ? pointOf(node, off, false) : null;
    if (!at) return;
    if (files.length && props.onImages) {
      props.onImages(files, { from: at, to: at });
      return;
    }
    const blocks = (html ? htmlToBlocks(html, { images: true }) : []).length ? htmlToBlocks(html, { images: true }) : pastedText(text);
    if (!blocks.length) return;
    if (blocks.some(isLooseImage) && props.onSettle) {
      props.onSettle(blocks, { from: at, to: at });
      return;
    }
    const out = insertAt(docRef.current, at, blocks.filter((b) => !isLooseImage(b)));
    commit(withTextAround(out.doc), 'structure', out.caret);
  }

  const beforeRef = useRef(onBeforeInput);
  beforeRef.current = onBeforeInput;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const h = (e: Event) => beforeRef.current(e as InputEvent);
    root.addEventListener('beforeinput', h);
    return () => root.removeEventListener('beforeinput', h);
  }, []);

  // ── what the toolbar shows ─────────────────────────────────────────
  const onFormat = props.onFormat;
  const stateKey = useRef('');
  function emitState() {
    if (!onFormat) return;
    const d = docRef.current;
    const sel = pickedRef.current ? d.blocks.find((b) => b.id === pickedRef.current) : null;
    const r = rangeNow(true);
    const flags = { b: false, i: false, u: false, s: false, sup: false, sub: false } as Record<FlagMark, boolean>;
    const state: FormatState = { block: null, align: 'left', lh: null, flags, font: null, size: null, color: null, bg: null, link: null, cell: null, selected: sel ? { id: sel.id, t: sel.t } : null, collapsed: true };
    if (sel) {
      state.align = sel.align ?? 'left';
    } else if (r) {
      const collapsed = collapsedR(r);
      state.collapsed = collapsed;
      const cellAt = blockIndex(d, r.from.block) < 0 ? findCell(d, r.from.block) : null;
      if (cellAt) state.cell = { table: cellAt.table.id, r: cellAt.r, c: cellAt.c, head: !!cellAt.table.head };
      const first = findText(d, r.from.block);
      if (first) {
        const top = d.blocks.find((b) => b.id === first.id);
        state.block = top ? top.t : 'p';
        state.align = first.align ?? 'left';
        state.lh = top?.lh ?? null;
      }
      if (collapsed && first) {
        const here = marksAt(first, r.from.offset);
        const p = pending.current && samePoint(pending.current.at, r.from) ? pending.current : null;
        for (const f of FLAGS) flags[f] = p && f in p.flags ? !!p.flags[f] : here.some((m) => m.t === f);
        const val = (t: ValueMark) => (p && t in p.vals ? p.vals[t] ?? null : here.find((m) => m.t === t)?.v ?? null);
        state.font = val('font');
        const z = val('size');
        state.size = z ? Number(z) : null;
        state.color = val('color');
        state.bg = val('bg');
        state.link = first.text.length ? (first.marks ?? []).find((m) => m.t === 'a' && m.s < r.from.offset && m.e >= r.from.offset)?.v ?? (first.marks ?? []).find((m) => m.t === 'a' && m.s <= r.from.offset && m.e > r.from.offset)?.v ?? null : null;
      } else {
        const spans = spansOf(d, r).filter((x) => x.e > x.s);
        if (spans.length) {
          for (const f of FLAGS) flags[f] = spans.every((x) => hasMark(findText(d, x.id)!, x.s, x.e, f));
          const val = (t: ValueMark) => {
            const vs = spans.map((x) => valueOver(findText(d, x.id)!, x.s, x.e, t));
            return vs.every((v) => v === vs[0]) ? vs[0] : null;
          };
          state.font = val('font');
          const z = val('size');
          state.size = z ? Number(z) : null;
          state.color = val('color');
          state.bg = val('bg');
          state.link = val('a');
        }
      }
    }
    const key = JSON.stringify(state);
    if (key === stateKey.current) return;
    stateKey.current = key;
    onFormat(state);
  }
  const emitRef = useRef(emitState);
  emitRef.current = emitState;
  useEffect(() => {
    emitRef.current();
  }, [doc, picked]);

  // ── where the caret is, and what is selected ───────────────────────
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const root = rootRef.current;
      if (!root) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) {
        // the selection left the page — into the composer, a panel, elsewhere: its tools go with it
        onSelect(null);
        if (document.activeElement !== root && !root.contains(document.activeElement)) onCaret(null);
        return;
      }
      const r = currentRange();
      if (!r) return;
      const [from, to] = orderPoints(docRef.current, r.from, r.to);
      // the selection is one picture, line, page break or table, whole: that block is picked out
      const whole = from.block === to.block && from.offset === 0 && to.offset === 1 ? docRef.current.blocks.find((b) => b.id === from.block) : null;
      if (whole && isOpaque(whole.t)) {
        if (pickedRef.current !== whole.id) setPicked(whole.id);
        onSelect(null);
        onCaret(null);
        emitRef.current();
        return;
      }
      last.current = { from, to };
      if (pickedRef.current) setPicked(null);
      const collapsed = from.block === to.block && from.offset === to.offset;
      if (pending.current && !(collapsed && samePoint(pending.current.at, from))) pending.current = null;
      const top = blockElOf(root, sel.anchorNode);
      if (top) setActive((a) => (a?.id === top.getAttribute(BLOCK_ATTR) && a.top === top.offsetTop ? a : { id: top.getAttribute(BLOCK_ATTR)!, top: top.offsetTop }));
      emitRef.current();
      if (collapsed) {
        onSelect(null);
        onCaret(from);
        return;
      }
      const text = textInRange(docRef.current, from, to);
      const range = sel.getRangeAt(0);
      onSelect({ from, to, text, rect: range.getBoundingClientRect() });
      onCaret(null);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    document.addEventListener('selectionchange', on);
    // the selection's tools follow its words when the page scrolls under them
    document.addEventListener('scroll', on, true);
    return () => {
      document.removeEventListener('selectionchange', on);
      document.removeEventListener('scroll', on, true);
      if (raf) cancelAnimationFrame(raf);
    };
    // the callbacks are read fresh through the closure each frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect, onCaret]);

  /** after a click, a tap or an arrow key: where the caret was put, if it is a caret */
  function pointed() {
    if (!onPoint) return;
    requestAnimationFrame(() => {
      const r = rangeNow();
      onPoint(r && collapsedR(r) ? r.from : null);
    });
  }

  function hover(e: React.MouseEvent) {
    const root = rootRef.current;
    if (!root || drag) return;
    const el = blockElOf(root, e.target as Node);
    if (el) {
      const id = el.getAttribute(BLOCK_ATTR)!;
      setActive((a) => (a?.id === id && a.top === el.offsetTop ? a : { id, top: el.offsetTop }));
    }
  }

  /** A click on a picture, a line, a page break or a table's edge picks it out; a click on a link with ⌘/Ctrl opens it. */
  function onMouseDown(e: React.MouseEvent) {
    const root = rootRef.current;
    if (!root) return;
    const t = e.target as HTMLElement;
    const a = t.closest?.('a[href]') as HTMLAnchorElement | null;
    if (a && root.contains(a) && (isMac() ? e.metaKey : e.ctrlKey)) {
      e.preventDefault();
      const href = hrefValue(a.getAttribute('href'));
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (cellElOf(root, t)) return;
    const el = blockElOf(root, t);
    const id = el?.getAttribute(BLOCK_ATTR);
    const b = id ? docRef.current.blocks.find((x) => x.id === id) : null;
    if (b && isOpaque(b.t) && !t.closest('.w-resize, .w-colgrip')) {
      e.preventDefault();
      pick(b.id);
    }
  }

  // ── a picture made wider or narrower by its corner ────────────────
  function onResizeDown(e: React.PointerEvent<HTMLSpanElement>) {
    const id = pickedRef.current;
    const el = id ? drawn.current.get(id)?.el : null;
    const img = el?.querySelector('img') as HTMLImageElement | null;
    const root = rootRef.current;
    if (!id || !img || !root || readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width;
    const full = root.clientWidth || 1;
    const align = docRef.current.blocks.find((b) => b.id === id)?.align;
    const factor = align === 'center' ? 2 : align === 'right' ? -1 : 1;
    let pct = Math.round((startW / full) * 100);
    const move = (ev: PointerEvent) => {
      const w = Math.max(full * 0.05, Math.min(full, startW + (ev.clientX - startX) * factor));
      pct = Math.round((w / full) * 100);
      img.style.width = `${pct}%`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      commit(setImage(docRef.current, id, { w: pct }), 'structure', null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ── a table's columns made wider or narrower by their edges ───────
  const [grips, setGrips] = useState<{ table: string; xs: number[]; top: number; height: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const id = active?.id;
    const b = id ? doc.blocks.find((x) => x.id === id) : null;
    const el = id ? drawn.current.get(id)?.el : null;
    const frame = frameRef.current;
    if (!b || b.t !== 'table' || !el || !frame || readOnly) {
      if (grips) setGrips(null);
      return;
    }
    const table = el.querySelector('table');
    const row = table?.querySelector('tr');
    if (!table || !row) return;
    const fb = frame.getBoundingClientRect();
    const tb = table.getBoundingClientRect();
    const xs = Array.from(row.children)
      .slice(0, -1)
      .map((td) => (td as HTMLElement).getBoundingClientRect().right - fb.left);
    const next = { table: b.id, xs, top: tb.top - fb.top, height: tb.height, left: tb.left - fb.left, width: tb.width };
    if (!grips || JSON.stringify(grips) !== JSON.stringify(next)) setGrips(next);
  });

  function onGripDown(e: React.PointerEvent<HTMLSpanElement>, k: number) {
    if (!grips || readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const b = docRef.current.blocks.find((x) => x.id === grips.table);
    const el = drawn.current.get(grips.table)?.el;
    const cols = el?.querySelectorAll('col');
    if (!b || !cols) return;
    const width = b.rows?.[0]?.length ?? 0;
    const fr = b.cols && b.cols.length === width ? [...b.cols] : Array.from({ length: width }, () => 1 / width);
    const startX = e.clientX;
    const a0 = fr[k];
    const b0 = fr[k + 1];
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) / grips.width;
      const a = Math.max(0.04, Math.min(a0 + b0 - 0.04, a0 + delta));
      fr[k] = a;
      fr[k + 1] = a0 + b0 - a;
      (cols[k] as HTMLElement).style.width = `${fr[k] * 100}%`;
      (cols[k + 1] as HTMLElement).style.width = `${fr[k + 1] * 100}%`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      commit(setTable(docRef.current, grips.table, { cols: fr }), 'structure', null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ── a paragraph picked up by its handle and put down elsewhere ─────
  function onHandleDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!active || readOnly) return;
    const id = active.id;
    const startY = e.clientY;
    let moved = false;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const where = (y: number) => {
      const els = docRef.current.blocks.map((b) => elOf(b.id)).filter((x): x is HTMLElement => !!x);
      let to = els.length;
      for (let k = 0; k < els.length; k++) {
        const r = els[k].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          to = k;
          break;
        }
      }
      const frame = frameRef.current!.getBoundingClientRect();
      const line = to < els.length ? els[to].getBoundingClientRect().top - frame.top - 3 : els[els.length - 1].getBoundingClientRect().bottom - frame.top + 2;
      return { to, line };
    };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) < 5) return;
      moved = true;
      const w = where(ev.clientY);
      setDrag({ id, ...w });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) {
        onBlockMenu(id, target.getBoundingClientRect());
        return;
      }
      const w = where(ev.clientY);
      const d = docRef.current;
      const next = moveBlocks(d, [id], w.to);
      if (next !== d) commit(withTextAround(next), 'structure', isTextType(d.blocks.find((b) => b.id === id)?.t ?? 'p') ? { block: id, offset: 0 } : null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const pickedEl = picked ? drawn.current.get(picked)?.el : null;
  const pickedBlock = picked ? doc.blocks.find((b) => b.id === picked) : null;
  const resizeAt =
    pickedBlock?.t === 'img' && pickedEl && frameRef.current
      ? (() => {
          const img = pickedEl.querySelector('img');
          if (!img) return null;
          const fb = frameRef.current!.getBoundingClientRect();
          const ib = img.getBoundingClientRect();
          return { left: ib.right - fb.left - 7, top: ib.bottom - fb.top - 7 };
        })()
      : null;

  return (
    <div className="w-frame" ref={frameRef} onMouseMove={hover}>
      {active && !readOnly && (
        <button
          type="button"
          className={`w-handle${drag ? ' is-dragging' : ''}`}
          style={{ top: active.top }}
          aria-label="Paragraph: move it, or change what it is"
          title="Drag to move · click for options"
          onPointerDown={onHandleDown}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onBlockMenu(active.id, e.currentTarget.getBoundingClientRect());
            }
          }}
        >
          <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
            <circle cx="3" cy="3" r="1.3" />
            <circle cx="7" cy="3" r="1.3" />
            <circle cx="3" cy="8" r="1.3" />
            <circle cx="7" cy="8" r="1.3" />
            <circle cx="3" cy="13" r="1.3" />
            <circle cx="7" cy="13" r="1.3" />
          </svg>
        </button>
      )}
      {drag && <div className="w-dropline" style={{ top: drag.line }} aria-hidden="true" />}
      {markers.map((m, k) =>
        m.pb ? null : (
          <div key={k} className="w-pagemark" style={{ top: m.y }} aria-hidden="true">
            <span>Page {k + 2}</span>
          </div>
        )
      )}
      {resizeAt && <span className="w-resize" style={resizeAt} onPointerDown={onResizeDown} role="presentation" title="Drag to make it wider or narrower" />}
      {grips &&
        grips.xs.map((x, k) => <span key={k} className="w-colgrip" style={{ left: x - 4, top: grips.top, height: grips.height }} onPointerDown={(e) => onGripDown(e, k)} role="presentation" title="Drag to change the columns' widths" />)}
      <div
        ref={rootRef}
        className="w-doc"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-placeholder={placeholder}
        spellCheck
        onInput={onInput}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onMouseUp={pointed}
        onTouchEnd={pointed}
        onKeyUp={(e) => {
          if (/^(Arrow|Home|End|Page)/.test(e.key)) pointed();
        }}
        onPaste={onPaste}
        onCopy={(e) => copyOut(e, false)}
        onCut={(e) => copyOut(e, true)}
        onDrop={onDrop}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          onInput(e as unknown as React.FormEvent<HTMLDivElement>);
        }}
      />
    </div>
  );
});

/** Blocks put in at a range, for a caller that kept a paste's pictures first — the same as a paste would. */
export function pasteInto(doc: WriteDoc, r: EditorRange, blocks: Block[]): { doc: WriteDoc; caret: Point } {
  const valid = (p: Point) => !!findText(doc, p.block) || blockIndex(doc, p.block) >= 0;
  const range = valid(r.from) && valid(r.to) ? r : null;
  const lastB = doc.blocks[doc.blocks.length - 1];
  const at = range ?? { from: { block: lastB.id, offset: isOpaque(lastB.t) ? 1 : lastB.text.length }, to: { block: lastB.id, offset: isOpaque(lastB.t) ? 1 : lastB.text.length } };
  const collapsed = at.from.block === at.to.block && at.from.offset === at.to.offset;
  const cut = collapsed ? { doc, caret: at.from } : replaceRange(doc, at.from, at.to);
  const out = insertAt(cut.doc, cut.caret, blocks.map((b) => ({ ...b, id: uid('b') })));
  return { doc: withTextAround(out.doc), caret: out.caret };
}
