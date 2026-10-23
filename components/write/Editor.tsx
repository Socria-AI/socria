'use client';

// components/write/Editor.tsx — the Writing Space's page.
//
// One contentEditable page, one element per block, drawn from the document
// model (lib/write/doc.ts) and never the other way round except where the
// browser itself typed: a character, a deletion inside a paragraph, a word an
// input method composed, a spelling the browser corrected. Everything that
// changes the document's SHAPE — Enter, Backspace at the start of a block, a
// selection deleted across paragraphs, a paste, bold, a list indented, a
// paragraph moved — is an operation on the model, so it can be undone exactly,
// and the page is redrawn from what it produced. Undo and redo are the
// document's own, not the browser's.
//
// Findings are drawn with the CSS Custom Highlight API: underlines that are
// not in the DOM at all, so they can never be typed into, saved, or copied.
// Where a browser has no highlights, the findings are still listed in the
// review panel; nothing depends on the underline.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import {
  blocksInRange,
  indentBlock,
  insertAt,
  isList,
  mergeBack,
  mergeForward,
  moveBlocks,
  nudgeBlock,
  orderPoints,
  replaceBlock,
  replaceRange,
  setBlockType,
  spliceBlock,
  splitBlock,
  toggleMark,
  uid,
  type Block,
  type BlockType,
  type MarkType,
  type Point,
  type WriteDoc,
} from '@/lib/write/doc';
import { toHtml, toText } from '@/lib/write/render';
import { htmlToBlocks, pastedText } from '@/lib/write/parse';
import type { Issue } from '@/lib/write/checks';
import { BLOCK_ATTR, blockElOf, fill, offsetIn, pointIn, readEl, sameMarks, shape, tagFor, typeOfEl } from './dom';

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

export interface EditorHandle {
  focus(at?: Point | 'start' | 'end'): void;
  select(block: string, s: number, e: number): void;
  range(): EditorRange | null;
  /** where some words are on screen, for a card shown beside them */
  rectOf(block: string, s: number, e: number): DOMRect | null;
  /** what the page shows of a block, relative to the page's frame — for the paragraph handle */
  blockTop(id: string): number | null;
  /** bold, italic or underline on the selected words — or off, where all of them have it */
  mark(t: MarkType): void;
}

/** A highlight drawn on words: a finding, a proposed edit's words, what is being asked about. */
export interface Marked {
  block: string;
  s: number;
  e: number;
  kind: 'definite' | 'likely' | 'proposal' | 'focus';
}

const HL_NAMES = { definite: 'w-definite', likely: 'w-likely', proposal: 'w-proposal', focus: 'w-focus' } as const;
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const CLIP_TYPE = 'application/x-socria-blocks';

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
    placeholder: string;
    label: string;
    readOnly?: boolean;
  }
>(function Editor({ doc, onChange, onUndo, onRedo, marked, onSelect, onCaret, onPoint, onBlockMenu, placeholder, label, readOnly }, handleRef) {
  const frameRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // the element for each block, and the block it SHOWS — drawn into it, or read back from it after the browser typed
  const drawn = useRef(new Map<string, { el: HTMLElement; block: Block }>());
  const docRef = useRef(doc);
  docRef.current = doc;
  const pendingCaret = useRef<Point | null>(null);
  const composing = useRef(false);
  const [active, setActive] = useState<{ id: string; top: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; line: number; to: number } | null>(null);

  // ── drawing the page from the model ─────────────────────────────────
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
      if (!r || r.el.tagName.toLowerCase() !== tag || r.el.parentNode !== root) {
        const el = document.createElement(tag);
        el.setAttribute(BLOCK_ATTR, b.id);
        shape(el, b);
        fill(el, b);
        if (r && r.el.parentNode === root) r.el.replaceWith(el);
        r = { el, block: b };
        map.set(b.id, r);
      } else if (r.block !== b) {
        // redrawn only when what it shows differs — an undo back to older words does, a keystroke read back does not
        if (r.block.text !== b.text || !sameMarks(r.block.marks, b.marks)) fill(r.el, b);
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
    root.classList.toggle('is-empty', doc.blocks.length === 1 && !doc.blocks[0].text && doc.blocks[0].t === 'p');
    if (pendingCaret.current) {
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
    const by: Record<keyof typeof HL_NAMES, Range[]> = { definite: [], likely: [], proposal: [], focus: [] };
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

  // ── positions ───────────────────────────────────────────────────────
  const elOf = (id: string) => drawn.current.get(id)?.el ?? null;
  const blockOf = (id: string) => docRef.current.blocks.find((b) => b.id === id) ?? null;

  function rangeOf(id: string, s: number, e: number): Range | null {
    const el = elOf(id);
    const b = blockOf(id);
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
      if (end) {
        const el = kids[Math.max(0, Math.min(kids.length - 1, off - 1))];
        const id = el.getAttribute(BLOCK_ATTR)!;
        return { block: id, offset: blockOf(id)?.text.length ?? 0 };
      }
      const el = kids[Math.max(0, Math.min(kids.length - 1, off))];
      return { block: el.getAttribute(BLOCK_ATTR)!, offset: 0 };
    }
    const el = blockElOf(root, node);
    if (!el) return null;
    const id = el.getAttribute(BLOCK_ATTR)!;
    const b = blockOf(id);
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
    const el = elOf(p.block);
    if (!root || !el) return;
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
    if (document.activeElement !== root) root.focus({ preventScroll: true });
    sel.removeAllRanges();
    sel.addRange(r);
    // keep the caret in view without jumping the page about
    const rect = (end ? r : el).getBoundingClientRect?.();
    if (rect && (rect.bottom > window.innerHeight - 40 || rect.top < 0)) el.scrollIntoView({ block: 'nearest' });
  }

  useImperativeHandle(handleRef, () => ({
    focus(at) {
      const blocks = docRef.current.blocks;
      if (!blocks.length) return;
      if (!at || at === 'start') placeCaret({ block: blocks[0].id, offset: 0 });
      else if (at === 'end') {
        const last = blocks[blocks.length - 1];
        placeCaret({ block: last.id, offset: last.text.length });
      } else placeCaret(at);
    },
    select(block, s, e) {
      placeCaret({ block, offset: s }, { block, offset: e });
    },
    range: currentRange,
    rectOf(block, s, e) {
      const r = rangeOf(block, s, e);
      if (!r) return null;
      const rect = r.getBoundingClientRect();
      return rect.width || rect.height ? rect : elOf(block)?.getBoundingClientRect() ?? null;
    },
    blockTop(id) {
      const el = elOf(id);
      return el ? el.offsetTop : null;
    },
    mark(t) {
      if (!readOnly) applyMark(t);
    },
  }));

  // ── changing the model ──────────────────────────────────────────────
  const commit = useCallback(
    (next: WriteDoc, kind: EditorChange['kind'], caret: Point | null, block?: string) => {
      if (caret) pendingCaret.current = caret;
      onChange({ doc: next, kind, block });
    },
    [onChange]
  );

  /** What the browser typed into one block, read back. */
  function readBack(el: HTMLElement): Block | null {
    const id = el.getAttribute(BLOCK_ATTR)!;
    const b = blockOf(id);
    if (!b) return null;
    const { text, marks } = readEl(el);
    if (text === b.text && sameMarks(marks, b.marks)) return b;
    const next: Block = { ...b, text };
    if (marks.length) next.marks = marks;
    else delete next.marks;
    const r = drawn.current.get(id);
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
      if (!mine) {
        id = uid('b');
        el.setAttribute(BLOCK_ATTR, id);
      }
      seen.add(id!);
      const { text, marks } = readEl(el);
      const base: Block = mine ? prior! : { id: id!, t: prior?.t ?? typeOfEl(el), text: '', ...(prior?.lvl ? { lvl: prior.lvl } : {}) };
      let b: Block = base;
      if (!mine || text !== base.text || !sameMarks(marks, base.marks)) {
        b = { ...base, text };
        if (marks.length) b.marks = marks;
        else delete b.marks;
      }
      // what this element shows, as read
      drawn.current.set(id!, { el, block: b });
      out.push(b);
    }
    return out;
  }

  const shortcut = /^(#{1,3}|[-*•]|1[.)]|>) ?\s$/;
  const SHORT: Record<string, BlockType> = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'ul', '*': 'ul', '•': 'ul', '1.': 'ol', '1)': 'ol', '>': 'quote' };

  function onInput(e: React.FormEvent<HTMLDivElement>) {
    const root = rootRef.current;
    if (!root || readOnly) return;
    const native = e.nativeEvent as InputEvent;
    const d = docRef.current;
    const sel = window.getSelection();
    const anchor = sel && sel.rangeCount ? blockElOf(root, sel.anchorNode) : null;
    const structural = root.childElementCount !== d.blocks.length || !anchor || drawn.current.get(anchor.getAttribute(BLOCK_ATTR) ?? '')?.el !== anchor;
    if (structural) {
      const blocks = readAll();
      commit({ ...d, blocks }, 'structure', caretIn(blocks));
      return;
    }
    const b = readBack(anchor);
    if (!b) return;
    let next = b === blockOf(b.id) ? d : replaceBlock(d, b);
    // Markdown's habits, at the start of a paragraph: "# " a heading, "- " a list, "> " a quote
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

  function rangeNow(): EditorRange | null {
    const r = currentRange();
    if (!r) return null;
    const [from, to] = orderPoints(docRef.current, r.from, r.to);
    return { from, to };
  }

  function deleteRange(r: EditorRange, ins = ''): { doc: WriteDoc; caret: Point } {
    return replaceRange(docRef.current, r.from, r.to, ins);
  }

  function applyMark(t: MarkType) {
    const r = rangeNow();
    if (!r) return;
    let d = docRef.current;
    const i = d.blocks.findIndex((b) => b.id === r.from.block);
    const j = d.blocks.findIndex((b) => b.id === r.to.block);
    if (i < 0 || j < 0) return;
    if (i === j && r.from.offset === r.to.offset) return;
    // all of it on, or all of it off: decided by whether every selected character already has it
    const spans = d.blocks.slice(i, j + 1).map((b, k) => ({ b, s: k === 0 ? r.from.offset : 0, e: i + k === j ? r.to.offset : b.text.length })).filter((x) => x.e > x.s);
    const allOn = spans.every((x) => (x.b.marks ?? []).some((m) => m.t === t && m.s <= x.s && m.e >= x.e));
    for (const x of spans) {
      const cur = d.blocks.find((b) => b.id === x.b.id)!;
      const has = (cur.marks ?? []).some((m) => m.t === t && m.s <= x.s && m.e >= x.e);
      if (allOn ? has : !has) d = replaceBlock(d, toggleMark(cur, x.s, x.e, t));
    }
    pendingCaret.current = null;
    onChange({ doc: d, kind: 'structure' });
    // keep the selection where it was
    requestAnimationFrame(() => placeCaret(r.from, r.to));
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
    if (t === 'formatBold' || t === 'formatItalic' || t === 'formatUnderline') {
      e.preventDefault();
      applyMark(t === 'formatBold' ? 'b' : t === 'formatItalic' ? 'i' : 'u');
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
    const collapsed = r.from.block === r.to.block && r.from.offset === r.to.offset;
    const multi = r.from.block !== r.to.block;
    const d = docRef.current;
    if (t === 'insertParagraph') {
      e.preventDefault();
      const cut = collapsed ? { doc: d, caret: r.from } : deleteRange(r);
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
      const b = d.blocks.find((x) => x.id === r.from.block);
      if (collapsed && b) {
        if (back && r.from.offset === 0) {
          e.preventDefault();
          const out = mergeBack(d, b.id);
          if (out.doc !== d) commit(out.doc, 'structure', out.caret);
          return;
        }
        if (!back && r.from.offset >= b.text.length) {
          e.preventDefault();
          const out = mergeForward(d, b.id);
          if (out.doc !== d) commit(out.doc, 'structure', out.caret);
          return;
        }
        return;
      }
      if (multi) {
        e.preventDefault();
        const out = deleteRange(r);
        commit(out.doc, 'structure', out.caret);
      }
      return;
    }
    if (t === 'insertText' || t === 'insertReplacementText') {
      if (multi) {
        e.preventDefault();
        const out = deleteRange(r, ev.data ?? '');
        commit(out.doc, 'structure', out.caret);
      }
      return;
    }
    if (multi) {
      // anything else across paragraphs is done to the model, not left to the browser
      e.preventDefault();
      const out = deleteRange(r);
      commit(out.doc, 'structure', out.caret);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) onRedo();
      else onUndo();
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && k === 'y' && !isMac()) {
      e.preventDefault();
      onRedo();
      return;
    }
    if (readOnly) return;
    if (mod && !e.altKey && !e.shiftKey && (k === 'b' || k === 'i' || k === 'u')) {
      e.preventDefault();
      applyMark(k as MarkType);
      return;
    }
    const r = rangeNow();
    if (!r) return;
    const d = docRef.current;
    const cur = d.blocks.find((b) => b.id === r.from.block);
    if (!cur) return;
    // Tab in a list nests the item; anywhere else Tab moves on, as it should
    if (e.key === 'Tab' && isList(cur.t)) {
      e.preventDefault();
      const ids = d.blocks.slice(d.blocks.findIndex((b) => b.id === r.from.block), d.blocks.findIndex((b) => b.id === r.to.block) + 1).filter((b) => isList(b.t)).map((b) => b.id);
      let next = d;
      for (const id of ids) next = indentBlock(next, id, e.shiftKey ? -1 : 1);
      if (next !== d) commit(next, 'structure', r.from);
      return;
    }
    // a paragraph moved: Alt+Shift+↑/↓, or Ctrl+Shift+↑/↓ on a Mac
    const moveKeys = isMac() ? e.ctrlKey && e.shiftKey && !e.metaKey : e.altKey && e.shiftKey && !e.ctrlKey;
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
      commit(setBlockType(d, cur.id, cur.t === t ? 'p' : t), 'structure', r.from);
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
    let blocks: Block[] = [];
    const own = cd.getData(CLIP_TYPE);
    if (own) {
      try {
        const parsed = JSON.parse(own);
        if (Array.isArray(parsed)) blocks = parsed.filter((b) => b && typeof b.text === 'string' && typeof b.t === 'string');
      } catch {
        blocks = [];
      }
    }
    if (!blocks.length) {
      const html = cd.getData('text/html');
      const text = cd.getData('text/plain');
      if (html && html.trim()) blocks = htmlToBlocks(html);
      if (!blocks.length && text) blocks = pastedText(text);
      // a paste of words with no shape into the middle of a sentence is just the words
      if (!blocks.length && text) blocks = [{ id: uid('b'), t: 'p', text: text.replace(/\r\n?/g, '\n') }];
    }
    if (!blocks.length) return;
    const cut = r.from.block === r.to.block && r.from.offset === r.to.offset ? { doc: docRef.current, caret: r.from } : deleteRange(r);
    const out = insertAt(cut.doc, cut.caret, blocks.map((b) => ({ ...b, id: uid('b') })));
    commit(out.doc, 'structure', out.caret);
  }

  function copyOut(e: React.ClipboardEvent<HTMLDivElement>, cut: boolean) {
    const r = rangeNow();
    if (!r || (r.from.block === r.to.block && r.from.offset === r.to.offset)) return;
    e.preventDefault();
    const blocks = blocksInRange(docRef.current, r.from, r.to);
    const part = { title: '', blocks };
    e.clipboardData.setData('text/plain', toText(part).replace(/\n$/, ''));
    e.clipboardData.setData('text/html', toHtml(part));
    e.clipboardData.setData(CLIP_TYPE, JSON.stringify(blocks));
    if (cut && !readOnly) {
      const out = deleteRange(r);
      commit(out.doc, 'structure', out.caret);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    // words dragged in from elsewhere arrive as a paste at the drop point; a file is not writing
    if (readOnly) return;
    const text = e.dataTransfer.getData('text/plain');
    const html = e.dataTransfer.getData('text/html');
    e.preventDefault();
    if (!text && !html) return;
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
    const blocks = (html ? htmlToBlocks(html) : []).length ? htmlToBlocks(html) : pastedText(text);
    if (!blocks.length) return;
    const out = insertAt(docRef.current, at, blocks);
    commit(out.doc, 'structure', out.caret);
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
        if (document.activeElement !== root) onCaret(null);
        return;
      }
      const r = currentRange();
      if (!r) return;
      const [from, to] = orderPoints(docRef.current, r.from, r.to);
      const el = elOf(from.block);
      if (el) setActive((a) => (a?.id === from.block && a.top === el.offsetTop ? a : { id: from.block, top: el.offsetTop }));
      const collapsed = from.block === to.block && from.offset === to.offset;
      if (collapsed) {
        onSelect(null);
        onCaret(from);
        return;
      }
      const text = blocksInRange(docRef.current, from, to)
        .map((b) => b.text)
        .join('\n\n');
      const range = sel.getRangeAt(0);
      onSelect({ from, to, text, rect: range.getBoundingClientRect() });
      onCaret(null);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    document.addEventListener('selectionchange', on);
    return () => {
      document.removeEventListener('selectionchange', on);
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
      onPoint(r && r.from.block === r.to.block && r.from.offset === r.to.offset ? r.from : null);
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
      if (next !== d) commit(next, 'structure', { block: id, offset: 0 });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

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
