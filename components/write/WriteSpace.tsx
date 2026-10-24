'use client';

// components/write/WriteSpace.tsx — the Draft Space and the Writing Space: one document, two faces.
//
// A blank page that can be written on at once, with nothing in the way — and
// a word processor's tools one row above it when they are wanted: styles,
// fonts and sizes, emphasis and colour, links, pictures, tables, alignment,
// spacing, lists, find and replace, an outline, page setup, and every export
// a writer needs (Word, PDF, print, Markdown, text, a web page). The Draft
// Space beside it (or instead of it, on a phone) is where ideas are dumped and
// arranged before they are prose; "Turn into an outline" carries the board
// into the writing, adding to it and never rewriting it. Both are the same
// document (lib/write/doc.ts), saved with the line of thinking.
//
// Everything Socria does here is asked for and reviewable: a reading of the
// selected words, edits proposed one at a time (shown on the words, accepted
// or rejected where they are), a proofread whose every finding says how sure
// it is — of everything, or of the language only — a reverse outline of the
// argument with moves the person can make, a reading of the board's gaps. The
// rules that need no model (lib/write/checks.ts) run on the device as the
// person writes. Writing without Socria is the default, and needs nothing
// switched off.
//
// The document is kept here while it is being written and handed to the line
// of thinking a moment after typing stops (and at once for anything else), so
// a keystroke never waits on the rest of the app; a copy is kept in this
// browser as well, and offered back if a save never landed. Pictures are kept
// apart from the document (components/write/media-client.ts) and sent to the
// account as they are put in.

import { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SourceDoc } from '@/lib/docs/types';
import type { ThinkingMap } from '@/lib/logos';
import {
  addCard,
  addCite,
  blockIndex,
  blocksInRange,
  deleteCol,
  deleteRow,
  docText,
  dueForVersion,
  emptyBlock,
  findCell,
  findText,
  fontInfo,
  insertBlocks,
  insertCol,
  insertMarked,
  insertRow,
  isEmptyDoc,
  isList,
  isOpaque,
  isTextType,
  joinIntoParagraph,
  keepVersion,
  lineWidthOf,
  linkCard,
  makeImage,
  makePageBreak,
  makeRule,
  makeTable,
  marksAt,
  mediaIds,
  moveBlocks,
  moveSection,
  nearLimit,
  nudgeBlock,
  pageOf,
  paperOf,
  removeBlocks,
  replaceHits,
  replaceText,
  restoreVersion,
  sanitizeWriteDoc,
  setBlockType,
  setImage,
  setMark,
  setParaAttrs,
  setTable,
  spliceBlock,
  splitBlock,
  textBlocks,
  textOrder,
  uid,
  withTextAround,
  wordCount,
  DEFAULT_FONT,
  DEFAULT_SIZE,
  type Block,
  type BlockType,
  type Card,
  type CardKind,
  type CardLink,
  type Face,
  type Hit,
  type Point,
  type WriteDoc,
} from '@/lib/write/doc';
import { checkDoc, inline, type Issue } from '@/lib/write/checks';
import { boardBrief, boardHints, outlineFrom } from '@/lib/write/board';
import { WRITE_OP_META, type AssistInput, type AssistResult, type Finding, type WriteOp } from '@/lib/write/assist';
import { fileNameFor, toHtml, toMarkdown, toText } from '@/lib/write/render';
import { DOCX_TYPE, toDocx, type MediaBytes } from '@/lib/write/docx';
import { PDF_TYPE, pdfCoverage, toPdf, type PdfPicture } from '@/lib/write/pdf';
import { IMPORT_ACCEPT, importFile, type Imported } from '@/lib/write/import';
import { settleImages } from '@/lib/write/parse';
import { bytesToDataUrl, mediaIdOf } from '@/lib/write/media';
import { richWriting } from '@/lib/write/flags';
import type { WriteSel } from '@/lib/write/focus';
import { Editor, pasteInto, type EditorHandle, type EditorRange, type EditorSelection, type FormatOp, type FormatState, type Marked } from './Editor';
import { Board, type CardAction } from './Board';
import { Toolbar } from './Toolbar';
import { AltEditor, FindBar, LinkBubble, LinkEditor, OutlinePanel, PagePanel } from './panels';
import { mediaClient } from './media-client';
import { ago, AssistPanel, CheckPanel, IssueCard, LinkPicker, ProposalCard, StructurePanel, VersionsPanel, type Pick, type Proposal } from './parts';
import './write.css';

export type SaveState = 'saved' | 'saving' | 'local' | 'offline';

export interface WriteSpaceHandle {
  /** a card added from elsewhere — a Logic Map idea, a passage — while the space is open */
  addCard(text: string, opts?: { kind?: CardKind; links?: CardLink[] }): void;
  show(face: Face): void;
  /** hand over what is still being typed, now — before the page goes away */
  flush(): void;
}

type Panel =
  | { kind: 'assist'; op: WriteOp; input: AssistInput; range: EditorRange | null; result: AssistResult | null; loading: boolean; error: string | null }
  | { kind: 'check' }
  | { kind: 'versions' }
  | { kind: 'link'; mode: 'doc' | 'node' | 'card'; card?: string; block?: string }
  | { kind: 'outline' }
  | { kind: 'page' }
  | { kind: 'structure'; result: AssistResult | null; loading: boolean; error: string | null }
  | null;

interface Snap {
  title: string;
  blocks: WriteDoc['blocks'];
  cards: WriteDoc['cards'];
  groups: WriteDoc['groups'];
  page: WriteDoc['page'];
  font: WriteDoc['font'];
  size: WriteDoc['size'];
  caret: Point | null;
}

const UNDERLINE_KEY = 'socria.write.underline';
const TYPES: [BlockType, string][] = [
  ['p', 'Paragraph'],
  ['h1', 'Heading'],
  ['h2', 'Subheading'],
  ['h3', 'Minor heading'],
  ['quote', 'Quotation'],
  ['ul', 'Bulleted list'],
  ['ol', 'Numbered list'],
  ['code', 'Code'],
];

function initialFace(doc: WriteDoc, narrow: boolean): Face {
  if (doc.face && !(doc.face === 'both' && narrow)) return doc.face;
  const words = doc.blocks.some((b) => b.text.trim() || isOpaque(b.t));
  return !words && doc.cards.length ? 'draft' : 'write';
}

/** Findings Socria made, kept on the words they were made on — or dropped when those words are gone. */
function relocate(found: Issue[], doc: WriteDoc): Issue[] {
  const out: Issue[] = [];
  const dismissed = new Set(doc.dismissed);
  for (const i of found) {
    if (dismissed.has(i.id)) continue;
    const b = findText(doc, i.block);
    if (!b) continue;
    if (b.text.slice(i.s, i.e) === i.text) {
      out.push(i);
      continue;
    }
    const k = nearest(b.text, i.text, i.s);
    if (k >= 0) out.push({ ...i, s: k, e: k + i.text.length });
  }
  return out;
}

/** Blocks added after the writing; the empty lines at its very end are not writing, and go. */
function appendBlocks(d: WriteDoc, add: WriteDoc['blocks']): WriteDoc {
  let blocks = d.blocks;
  while (blocks.length && blocks[blocks.length - 1].t === 'p' && !blocks[blocks.length - 1].text.trim()) blocks = blocks.slice(0, -1);
  if (!blocks.length) return { ...d, blocks: add.length ? add : [emptyBlock()] };
  return insertBlocks({ ...d, blocks }, blocks[blocks.length - 1].id, add);
}

/** The occurrence of some words nearest to where they were. */
function nearest(text: string, words: string, near: number): number {
  if (!words) return -1;
  let best = -1;
  for (let k = text.indexOf(words); k >= 0; k = text.indexOf(words, k + 1)) if (best < 0 || Math.abs(k - near) < Math.abs(best - near)) best = k;
  return best;
}

/** The link a caret is in: its address and the words it covers. */
function linkAt(b: Block, offset: number): { s: number; e: number; v: string } | null {
  const m = (b.marks ?? []).find((x) => x.t === 'a' && x.s < offset && x.e >= offset) ?? (b.marks ?? []).find((x) => x.t === 'a' && x.s <= offset && x.e > offset);
  return m && m.v ? { s: m.s, e: m.e, v: m.v } : null;
}

export const WriteSpace = forwardRef<
  WriteSpaceHandle,
  {
    sessionId: string;
    doc: WriteDoc;
    onChange: (doc: WriteDoc) => void;
    saveState: SaveState;
    docs: ReadonlyMap<string, SourceDoc>;
    map: ThinkingMap | null;
    assist: (input: AssistInput) => Promise<AssistResult>;
    /** Point & Ask: these words, asked about in the conversation */
    onAsk: (sel: WriteSel) => void;
    /** what is being asked about now, drawn on the words */
    asking?: WriteSel | null;
    onOpenPassage?: (doc: string, block: string) => void;
    onOpenNode?: (id: string) => void;
    /** the paragraph the caret is in, for the map to light what it touches */
    onParagraph?: (text: string) => void;
    readOther?: (file: File) => Promise<SourceDoc>;
    narrow: boolean;
    where: 'artifact' | 'column';
    onClose?: () => void;
    autoFocus?: boolean;
    /** signed in: pictures are kept under the account as well as in this browser */
    cloud?: boolean;
    /** the line of thinking's name, for Socria's readings */
    topic?: string;
    /** words kept in memory (the Mind Graph), when the person asks; says what happened */
    onKeep?: (text: string, kind: CardKind) => Promise<string>;
  }
>(function WriteSpace(props, ref) {
  // its own width, wherever it is shown: a phone, a column, an artifact beside the conversation
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => setWidth(Math.round(es[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = props.narrow || (width > 0 && width < 640);
  const canSplit = !narrow && (width === 0 || width >= 900);
  const rich = richWriting();
  const media = useMemo(() => mediaClient(!!props.cloud), [props.cloud]);
  const [doc, setDoc] = useState<WriteDoc>(props.doc);
  const docRef = useRef(doc);
  docRef.current = doc;
  const editor = useRef<EditorHandle>(null);
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  // ── handing the document to the line of thinking ───────────────────
  const emitted = useRef(props.doc);
  const pending = useRef<WriteDoc | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const d = pending.current;
    if (!d) return;
    pending.current = null;
    emitted.current = d;
    onChangeRef.current(d);
  }, []);
  const schedule = (d: WriteDoc, typing: boolean) => {
    pending.current = d;
    if (timer.current) clearTimeout(timer.current);
    if (typing) timer.current = setTimeout(flush, 400);
    else flush();
  };
  useEffect(() => {
    const away = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', away);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', away);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);
  // a document changed elsewhere — another device, a card sent here while this was closed — is taken in
  useEffect(() => {
    if (props.doc === emitted.current) return;
    emitted.current = props.doc;
    if (props.doc !== docRef.current && !pending.current) setDoc(props.doc);
  }, [props.doc]);

  // ── undo and redo: the document's own ──────────────────────────────
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const lastTyping = useRef<{ block: string; at: number } | null>(null);
  const caretAfter = useRef<Point | null>(null);
  const snapOf = (d: WriteDoc): Snap => ({ title: d.title, blocks: d.blocks, cards: d.cards, groups: d.groups, page: d.page, font: d.font, size: d.size, caret: editor.current?.range()?.from ?? null });

  const commit = useCallback((next: WriteDoc, kind: 'typing' | 'structure' | 'board' | 'meta', block?: string) => {
    const prev = docRef.current;
    if (next === prev) return;
    const now = Date.now();
    let out: WriteDoc = { ...next, updatedAt: now };
    if (kind !== 'meta') {
      const coalesce = kind === 'typing' && !!block && lastTyping.current?.block === block && now - lastTyping.current.at < 1200;
      if (!coalesce) {
        past.current.push(snapOf(prev));
        if (past.current.length > 200) past.current.shift();
      }
      future.current = [];
      lastTyping.current = kind === 'typing' && block ? { block, at: now } : null;
      // a version kept by itself, every ten minutes or so of writing
      if (next.versions === prev.versions && dueForVersion(prev, now)) out = { ...out, versions: keepVersion(prev, 'auto', now).versions };
    }
    docRef.current = out;
    setDoc(out);
    schedule(out, kind === 'typing');
    if (kind === 'typing' || kind === 'structure') setPointed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = (from: Snap[], to: Snap[]) => {
    const s = from.pop();
    if (!s) return;
    const cur = docRef.current;
    to.push(snapOf(cur));
    const out: WriteDoc = { ...cur, title: s.title, blocks: s.blocks, cards: s.cards, groups: s.groups, page: s.page, font: s.font, size: s.size, updatedAt: Date.now() };
    if (!s.page) delete out.page;
    if (!s.font) delete out.font;
    if (!s.size) delete out.size;
    lastTyping.current = null;
    docRef.current = out;
    setDoc(out);
    schedule(out, false);
    caretAfter.current = s.caret;
  };
  const undo = useCallback(() => restore(past.current, future.current), []);
  const redo = useCallback(() => restore(future.current, past.current), []);
  useEffect(() => {
    if (!caretAfter.current) return;
    const at = caretAfter.current;
    caretAfter.current = null;
    if (findText(docRef.current, at.block)) editor.current?.focus(at);
  });

  // ── which face ─────────────────────────────────────────────────────
  const [face, setFace] = useState<Face>(() => initialFace(props.doc, narrow));
  const shown: Face = face === 'both' && !canSplit ? 'write' : face;
  const choose = (f: Face) => {
    setFace(f);
    commit({ ...docRef.current, face: f }, 'meta');
  };

  // ── checks, findings, proposals ────────────────────────────────────
  const [underline, setUnderline] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(UNDERLINE_KEY) === 'off') setUnderline(false);
    } catch {}
  }, []);
  const setUnderlinePref = (on: boolean) => {
    setUnderline(on);
    try {
      localStorage.setItem(UNDERLINE_KEY, on ? 'on' : 'off');
    } catch {}
  };
  const checked = useDeferredValue(doc);
  const ruleIssues = useMemo(() => checkDoc(checked), [checked]);
  const [socria, setSocria] = useState<Issue[]>([]);
  const located = useMemo(() => relocate(socria, doc), [socria, doc]);
  const issues = useMemo(() => {
    const all = [...ruleIssues];
    for (const i of located) if (!all.some((r) => r.block === i.block && r.s < i.e && i.s < r.e && r.kind === i.kind)) all.push(i);
    const order = textOrder(doc);
    return all.filter((i) => order.has(i.block)).sort((a, b) => order.get(a.block)! - order.get(b.block)! || a.s - b.s);
  }, [ruleIssues, located, doc]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  useEffect(() => {
    setProposals((ps) => {
      let changed = false;
      const next = ps.map((p) => {
        const b = findText(doc, p.block);
        if (!b) return p.stale ? p : ((changed = true), { ...p, stale: true });
        if (b.text.slice(p.s, p.e) === p.from) return p.stale ? ((changed = true), { ...p, stale: false }) : p;
        const k = nearest(b.text, p.from, p.s);
        changed = true;
        return k < 0 ? { ...p, stale: true } : { ...p, s: k, e: k + p.from.length, stale: false };
      });
      return changed ? next : ps;
    });
  }, [doc]);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const hints = useMemo(() => boardHints(doc), [doc.cards, doc.groups]);

  // ── what is selected, where the caret is ───────────────────────────
  const [sel, setSel] = useState<EditorSelection | null>(null);
  const [caret, setCaret] = useState<Point | null>(null);
  const [fmt, setFmt] = useState<FormatState | null>(null);
  const onParagraph = props.onParagraph;
  const onSelect = useCallback((s: EditorSelection | null) => setSel(s), []);
  const onCaret = useCallback(
    (p: Point | null) => {
      setCaret(p);
      if (p && onParagraph) onParagraph(findText(docRef.current, p.block)?.text ?? '');
    },
    [onParagraph]
  );
  const [closedCard, setClosedCard] = useState<string | null>(null);
  // the card under an underline opens where the caret was PUT — a click, a tap, an arrow — never while typing
  const [pointed, setPointed] = useState<Point | null>(null);
  const caretIssue = useMemo(
    () => (pointed && underline ? inline(issues).find((i) => i.kind !== 'spelling' && i.block === pointed.block && i.s <= pointed.offset && pointed.offset <= i.e) ?? null : null),
    [pointed, issues, underline]
  );
  // a proposed edit, offered on its own words: the caret put in them opens it there
  const caretProposal = useMemo(() => (pointed ? proposals.find((p) => !p.stale && p.block === pointed.block && p.s <= pointed.offset && pointed.offset <= p.e) ?? null : null), [pointed, proposals]);
  const [issueRect, setIssueRect] = useState<DOMRect | null>(null);
  const [proposalRect, setProposalRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    setIssueRect(caretIssue && closedCard !== caretIssue.id ? editor.current?.rectOf(caretIssue.block, caretIssue.s, caretIssue.e) ?? null : null);
    setProposalRect(caretProposal && closedCard !== caretProposal.id ? editor.current?.rectOf(caretProposal.block, caretProposal.s, caretProposal.e) ?? null : null);
  }, [caretIssue, caretProposal, closedCard, doc]);

  // ── find ───────────────────────────────────────────────────────────
  const [find, setFind] = useState<{ replace: boolean } | null>(null);
  const [found, setFound] = useState<{ hits: Hit[]; cur: number }>({ hits: [], cur: -1 });
  const onHits = useCallback((hits: Hit[], cur: number) => setFound({ hits, cur }), []);

  const marked: Marked[] = useMemo(() => {
    const out: Marked[] = [];
    if (underline) for (const i of inline(issues)) if (i.kind !== 'spelling') out.push({ block: i.block, s: i.s, e: i.e, kind: i.certainty === 'definite' ? 'definite' : 'likely' });
    for (const p of proposals) if (!p.stale) out.push({ block: p.block, s: p.s, e: p.e, kind: 'proposal' });
    const a = props.asking;
    if (a && a.kind === 'block') out.push({ block: a.block, s: Math.min(a.s, a.e), e: Math.max(a.s, a.e), kind: 'focus' });
    found.hits.forEach((h, k) => out.push({ ...h, kind: k === found.cur ? 'found' : 'find' }));
    return out;
  }, [issues, proposals, props.asking, underline, found]);

  // ── panels and menus ───────────────────────────────────────────────
  const [panel, setPanel] = useState<Panel>(null);
  const [blockMenu, setBlockMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: boolean; action?: { label: string; run: () => void } } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.action ? 12000 : 7000);
    return () => clearTimeout(t);
  }, [toast]);
  const [importing, setImporting] = useState<Imported | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pictureRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const [linkEdit, setLinkEdit] = useState<{ href: string; withText: boolean; rect: DOMRect | null; range: EditorRange | null } | null>(null);
  const [altEdit, setAltEdit] = useState<{ id: string; alt: string } | null>(null);
  const [pages, setPages] = useState(1);
  // a sheet wider than the column it sits in (landscape beside a panel) is shown smaller, never cut off
  const sheetRef = useRef<HTMLDivElement>(null);
  const [columnW, setColumnW] = useState(0);
  useLayoutEffect(() => {
    const col = sheetRef.current?.parentElement;
    if (!col || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => setColumnW(Math.round(es[0].contentRect.width)));
    ro.observe(col);
    return () => ro.disconnect();
  });

  // ── Socria, when asked ─────────────────────────────────────────────
  const seq = useRef(0);
  const [proofreading, setProofreading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const ideas = useMemo(() => (props.map?.nodes ?? []).slice(0, 40).map((n) => n.label).filter(Boolean).slice(0, 12), [props.map]);
  const workspace = () => ({ ...(props.topic?.trim() ? { topic: props.topic.trim() } : {}), ...(ideas.length ? { ideas } : {}) });

  const linkedOf = (ids: string[]) => {
    const d = docRef.current;
    const out: string[] = [];
    for (const id of ids) {
      const b = d.blocks.find((x) => x.id === id);
      if (!b) continue;
      for (const c of b.cites ?? []) out.push(`passage: ${c.label}`);
      for (const f of b.from ?? []) for (const l of d.cards.find((c) => c.id === f)?.links ?? []) out.push(`${l.k === 'doc' ? 'passage' : l.k === 'node' ? 'map idea' : 'card'}: ${l.label}`);
    }
    return Array.from(new Set(out)).slice(0, 8);
  };

  async function runAssist(op: WriteOp, range: EditorRange | null, extra: Partial<AssistInput> = {}) {
    const d = docRef.current;
    let input: AssistInput = { op, title: d.title, ...(op === 'develop' || op === 'critique' ? workspace() : {}), ...extra };
    if (range) {
      const picked = blocksInRange(d, range.from, range.to);
      const inCell = blockIndex(d, range.from.block) < 0;
      if (inCell) {
        const cell = findText(d, range.from.block);
        input = { ...input, selection: picked.map((b) => b.text).join('\n\n'), paragraph: cell?.text ?? '' };
      } else {
        const i = d.blocks.findIndex((b) => b.id === range.from.block);
        const j = d.blocks.findIndex((b) => b.id === range.to.block);
        const para = (k: number, dir: -1 | 1) => {
          for (let x = k + dir; x >= 0 && x < d.blocks.length; x += dir) if (d.blocks[x].text.trim() && isTextType(d.blocks[x].t) && !d.blocks[x].t.startsWith('h')) return d.blocks[x].text;
          return undefined;
        };
        input = {
          ...input,
          selection: picked.map((b) => b.text).join('\n\n'),
          paragraph: d.blocks
            .slice(i, j + 1)
            .filter((b) => isTextType(b.t))
            .map((b) => b.text)
            .join('\n\n'),
          prev: para(i, -1),
          next: para(j, 1),
          linked: linkedOf(d.blocks.slice(i, j + 1).map((b) => b.id)),
        };
      }
    }
    const n = ++seq.current;
    setProposals([]);
    setPanel({ kind: 'assist', op, input, range, result: null, loading: true, error: null });
    try {
      const result = await props.assist(input);
      if (n !== seq.current) return;
      if ((op === 'shorten' || op === 'improve') && range) setProposals(locateEdits(result, range));
      setPanel({ kind: 'assist', op, input, range, result, loading: false, error: null });
    } catch (e) {
      if (n !== seq.current) return;
      setPanel({ kind: 'assist', op, input, range, result: null, loading: false, error: e instanceof Error ? e.message : 'That could not be done just now.' });
    }
  }

  /** An edit's words found where they were selected — an edit to words that are not there is not shown. */
  function locateEdits(result: AssistResult, range: EditorRange): Proposal[] {
    const d = docRef.current;
    const blocks: { b: Block; lo: number; hi: number }[] = [];
    if (blockIndex(d, range.from.block) < 0) {
      const cell = findText(d, range.from.block);
      if (cell) blocks.push({ b: cell, lo: range.from.offset, hi: range.to.offset });
    } else {
      const i = d.blocks.findIndex((b) => b.id === range.from.block);
      const j = d.blocks.findIndex((b) => b.id === range.to.block);
      for (let k = i; k <= j; k++) {
        const b = d.blocks[k];
        if (!isTextType(b.t)) continue;
        blocks.push({ b, lo: k === i ? range.from.offset : 0, hi: k === j ? range.to.offset : b.text.length });
      }
    }
    const out: Proposal[] = [];
    for (const e of result.edits ?? []) {
      if (e.from.includes('\n\n')) continue;
      for (const { b, lo, hi } of blocks) {
        const at = b.text.indexOf(e.from, lo);
        if (at >= 0 && at + e.from.length <= hi && !out.some((o) => o.block === b.id && at < o.e && o.s < at + e.from.length)) {
          out.push({ id: uid('x'), block: b.id, s: at, e: at + e.from.length, from: e.from, to: e.to, why: e.why, ...(e.kind ? { kind: e.kind } : {}) });
          break;
        }
      }
    }
    return out;
  }

  function accept(p: Proposal) {
    const d = docRef.current;
    const b = findText(d, p.block);
    if (!b) return;
    const s = b.text.slice(p.s, p.e) === p.from ? p.s : nearest(b.text, p.from, p.s);
    if (s < 0) {
      setProposals((ps) => ps.map((x) => (x.id === p.id ? { ...x, stale: true } : x)));
      return;
    }
    commit(replaceText(d, spliceBlock(b, s, s + p.from.length, p.to)), 'structure');
    setProposals((ps) => ps.filter((x) => x.id !== p.id));
  }

  function fix(i: Issue) {
    if (i.fix === undefined) return;
    const d = docRef.current;
    const b = findText(d, i.block);
    if (!b) return;
    const s = b.text.slice(i.s, i.e) === i.text ? i.s : nearest(b.text, i.text, i.s);
    if (s < 0) return;
    commit(replaceText(d, spliceBlock(b, s, s + i.text.length, i.fix)), 'structure');
    setSocria((xs) => xs.filter((x) => x.id !== i.id));
  }

  function dismiss(i: Issue) {
    const d = docRef.current;
    commit({ ...d, dismissed: [...d.dismissed, i.id].slice(-600) }, 'meta');
    setSocria((xs) => xs.filter((x) => x.id !== i.id));
  }

  /** What "proofread" covers: the selection, else the whole document when it fits, else the section the caret is in. */
  function proofScope(): { blocks: { id: string; t: string; text: string }[]; label: string } {
    const d = docRef.current;
    const pick = (bs: Block[]) =>
      bs
        .flatMap((b) => (b.t === 'table' ? (b.rows ?? []).flat() : isTextType(b.t) && b.t !== 'code' ? [b] : []))
        .filter((b) => b.text.trim())
        .map((b) => ({ id: b.id, t: b.t, text: b.text }));
    if (sel) {
      if (blockIndex(d, sel.from.block) < 0) {
        const cell = findText(d, sel.from.block);
        return { blocks: cell ? pick([cell]) : [], label: 'the selection' };
      }
      const i = d.blocks.findIndex((b) => b.id === sel.from.block);
      const j = d.blocks.findIndex((b) => b.id === sel.to.block);
      return { blocks: pick(d.blocks.slice(i, j + 1)), label: 'the selection' };
    }
    const total = textBlocks(d).reduce((n, b) => n + b.text.length, 0);
    if (total <= 13_000) return { blocks: pick(d.blocks), label: 'the document' };
    const at = Math.max(0, d.blocks.findIndex((b) => b.id === caret?.block));
    let s = at;
    while (s > 0 && !d.blocks[s].t.startsWith('h')) s--;
    let e = at + 1;
    while (e < d.blocks.length && !d.blocks[e].t.startsWith('h')) e++;
    return { blocks: pick(d.blocks.slice(s, e)), label: 'this section' };
  }

  async function proofread(focus: 'all' | 'grammar' = 'all', scope = proofScope()) {
    if (!scope.blocks.length) return;
    setProofreading(true);
    setProofError(null);
    try {
      const result = await props.assist({ op: 'proofread', blocks: scope.blocks, title: docRef.current.title, ...(focus === 'grammar' ? { focus } : {}) });
      const ids = new Set(scope.blocks.map((b) => b.id));
      setSocria((xs) => [...xs.filter((x) => !ids.has(x.block)), ...(result.issues ?? [])]);
      if (!(result.issues ?? []).length) setToast({ text: focus === 'grammar' ? 'Socria read the language and found nothing worth marking.' : 'Socria read it and found nothing worth marking.' });
    } catch (e) {
      setProofError(e instanceof Error ? e.message : 'That could not be done just now.');
    } finally {
      setProofreading(false);
    }
  }

  async function review() {
    setReviewing(true);
    try {
      const result = await props.assist({ op: 'board', cards: boardBrief(docRef.current), title: docRef.current.title });
      setFindings(result.findings ?? []);
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : 'That could not be done just now.' });
    } finally {
      setReviewing(false);
    }
  }

  /** The argument's structure, read: a reverse outline, the main claim quoted, moves to consider, gaps as questions. */
  async function structure() {
    const d = docRef.current;
    const blocks = d.blocks.filter((b) => isTextType(b.t) && b.t !== 'code' && b.text.trim()).map((b) => ({ id: b.id, t: b.t, text: b.text.length > 900 ? `${b.text.slice(0, 900)}…` : b.text }));
    if (blocks.length < 2) {
      setToast({ text: 'There needs to be more than one paragraph to read an argument’s structure.' });
      return;
    }
    const n = ++seq.current;
    setPanel({ kind: 'structure', result: null, loading: true, error: null });
    try {
      const result = await props.assist({ op: 'structure', blocks, title: d.title, ...workspace() });
      if (n !== seq.current) return;
      setPanel({ kind: 'structure', result, loading: false, error: null });
    } catch (e) {
      if (n !== seq.current) return;
      setPanel({ kind: 'structure', result: null, loading: false, error: e instanceof Error ? e.message : 'That could not be done just now.' });
    }
  }

  // ── Point & Ask ────────────────────────────────────────────────────
  function askAbout(range: EditorRange | null) {
    const r = range ?? (caret ? { from: caret, to: caret } : null);
    if (!r) return;
    const d = docRef.current;
    const b = findText(d, r.from.block);
    if (!b) return;
    const whole = r.from.block === r.to.block && r.from.offset === r.to.offset;
    const s = whole ? 0 : r.from.offset;
    const e = whole ? b.text.length : r.from.block === r.to.block ? r.to.offset : b.text.length;
    props.onAsk({ kind: 'block', block: b.id, s, e });
  }

  // ── linking and citing ─────────────────────────────────────────────
  function onPick(p: Pick) {
    const target = panel && panel.kind === 'link' ? panel : null;
    setPanel(null);
    if (!target) return;
    const d = docRef.current;
    if (target.block && p.k === 'doc' && p.doc) commit(addCite(d, target.block, { doc: p.doc, block: p.id, label: p.label, ...(p.quote ? { quote: p.quote } : {}) }), 'structure');
    else if (target.card) commit(linkCard(d, target.card, { k: p.k, id: p.id, label: p.label, ...(p.doc ? { doc: p.doc } : {}), ...(p.quote ? { quote: p.quote } : {}) }), 'board');
  }

  async function keep(text: string, kind: CardKind) {
    if (!props.onKeep) return;
    try {
      setToast({ text: await props.onKeep(text, kind) });
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : 'That could not be kept just now.' });
    }
  }

  function onCardAction(card: Card, action: CardAction) {
    if (action === 'link-doc' || action === 'link-node' || action === 'link-card') setPanel({ kind: 'link', mode: action === 'link-doc' ? 'doc' : action === 'link-node' ? 'node' : 'card', card: card.id });
    else if (action === 'develop') void runAssist('develop', null, { selection: card.text, linked: (card.links ?? []).map((l) => `${l.k === 'doc' ? 'passage' : l.k === 'node' ? 'map idea' : 'card'}: ${l.label}`) });
    else if (action === 'keep') void keep(card.text, card.kind);
    else props.onAsk({ kind: 'card', card: card.id });
  }

  function openLink(l: CardLink) {
    if (l.k === 'doc' && l.doc) props.onOpenPassage?.(l.doc, l.id);
    else if (l.k === 'node') props.onOpenNode?.(l.id);
    else {
      choose(narrow ? 'draft' : shown === 'write' ? 'both' : shown);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card="${l.id}"]`)?.focus());
    }
  }

  // ── the board into the writing ─────────────────────────────────────
  function outline(pile?: string | null) {
    const d = docRef.current;
    const out = outlineFrom(d, pile === undefined ? undefined : pile);
    if (!out.added) {
      setToast({ text: 'Everything on the board is already in your writing.' });
      return;
    }
    commit(appendBlocks(d, out.blocks), 'structure');
    if (shown === 'draft') choose('write');
    setToast({ text: `Added ${out.added} card${out.added === 1 ? '' : 's'} to the end of your writing as an outline — nothing already written was changed.`, undo: true });
  }

  // ── formatting, from the bar ───────────────────────────────────────
  const format = (op: FormatOp) => editor.current?.format(op);

  function onTableOp(op: 'row-above' | 'row-below' | 'col-left' | 'col-right' | 'del-row' | 'del-col' | 'head' | 'del-table') {
    const c = fmt?.cell;
    if (!c) return;
    const d = docRef.current;
    let next = d;
    let r = c.r;
    let col = c.c;
    if (op === 'row-above') next = insertRow(d, c.table, c.r);
    else if (op === 'row-below') {
      next = insertRow(d, c.table, c.r + 1);
      r = c.r + 1;
    } else if (op === 'col-left') next = insertCol(d, c.table, c.c);
    else if (op === 'col-right') {
      next = insertCol(d, c.table, c.c + 1);
      col = c.c + 1;
    } else if (op === 'del-row') next = deleteRow(d, c.table, c.r);
    else if (op === 'del-col') next = deleteCol(d, c.table, c.c);
    else if (op === 'head') next = setTable(d, c.table, { head: !c.head });
    else next = removeBlocks(d, [c.table]);
    next = withTextAround(next);
    const t = next.blocks.find((b) => b.id === c.table);
    const rows = t?.rows ?? [];
    const cell = rows[Math.min(r, rows.length - 1)]?.[Math.min(col, (rows[0]?.length ?? 1) - 1)];
    commit(next, 'structure');
    if (cell) requestAnimationFrame(() => editor.current?.focus({ block: cell.id, offset: cell.text.length }));
  }

  function onPictureOp(op: { w?: number; align?: 'center' | 'right' | 'justify' | null; alt?: true; replace?: true; remove?: true }) {
    const id = fmt?.selected?.t === 'img' ? fmt.selected.id : null;
    const d = docRef.current;
    const b = id ? d.blocks.find((x) => x.id === id) : null;
    if (!b) return;
    if (op.w) commit(setImage(d, b.id, { w: op.w }), 'structure');
    else if (op.align !== undefined) commit(setParaAttrs(d, [b.id], { align: op.align === 'justify' ? null : op.align }), 'structure');
    else if (op.alt) setAltEdit({ id: b.id, alt: b.alt ?? '' });
    else if (op.replace) {
      replacing.current = b.id;
      pictureRef.current?.click();
    } else if (op.remove) {
      editor.current?.pick(null);
      commit(withTextAround(removeBlocks(d, [b.id])), 'structure');
    }
  }

  /** Pictures from files: made the size they need to be, kept, and put in — at a point, or at the caret. */
  async function addPictures(files: File[], at?: EditorRange) {
    const blocks: Block[] = [];
    setBusy(files.length === 1 ? 'Putting the picture in…' : `Putting ${files.length} pictures in…`);
    try {
      for (const f of files.slice(0, 20)) {
        try {
          const k = await media.addFile(f);
          blocks.push(makeImage({ src: k.src, iw: k.w, ih: k.h, by: k.by }));
        } catch (e) {
          setToast({ text: e instanceof Error ? e.message : 'That picture could not be put in.' });
        }
      }
    } finally {
      setBusy(null);
    }
    if (!blocks.length) return;
    const replaceId = replacing.current;
    replacing.current = null;
    if (replaceId) {
      const d = docRef.current;
      const old = d.blocks.find((x) => x.id === replaceId);
      if (old) {
        const img = blocks[0];
        commit(d.blocks.some((x) => x.id === replaceId) ? { ...d, blocks: d.blocks.map((x) => (x.id === replaceId ? { ...old, src: img.src, iw: img.iw, ih: img.ih, ...(img.by ? { by: img.by } : {}) } : x)) } : d, 'structure');
        return;
      }
    }
    if (at) {
      const out = pasteInto(docRef.current, at, blocks);
      commit(out.doc, 'structure');
      return;
    }
    editor.current?.insert(blocks);
  }

  /** A paste whose pictures came at their own addresses: they are kept first, then the paste goes in. */
  async function settle(blocks: Block[], at: EditorRange) {
    setBusy('Bringing the pictures in…');
    try {
      const out = await settleImages(blocks, async (src) => {
        const k = await media.addSrc(src);
        return k ? { src: k.src, iw: k.w, ih: k.h, by: k.by } : null;
      });
      const put = pasteInto(docRef.current, at, out.blocks);
      commit(put.doc, 'structure');
      if (out.dropped) setToast({ text: out.dropped === 1 ? 'A picture could not be brought in — its website does not let a page copy it. Save it and insert it from a file.' : `${out.dropped} pictures could not be brought in — their websites do not let a page copy them. Save them and insert them from files.` });
    } finally {
      setBusy(null);
    }
  }

  // ── links ──────────────────────────────────────────────────────────
  function openLinkEditor() {
    const r = editor.current?.lastRange() ?? null;
    const d = docRef.current;
    const b = r ? findText(d, r.from.block) : null;
    const collapsed = !!r && r.from.block === r.to.block && r.from.offset === r.to.offset;
    const inLink = b && r ? linkAt(b, r.from.offset) : null;
    const rect = r ? editor.current?.rectOf(r.from.block, r.from.offset, r.from.block === r.to.block ? r.to.offset : r.from.offset) ?? null : null;
    setLinkEdit({ href: inLink?.v ?? (collapsed ? '' : fmt?.link ?? ''), withText: collapsed && !inLink, rect, range: r });
  }

  function applyLink(href: string, text?: string) {
    const le = linkEdit;
    setLinkEdit(null);
    const r = le?.range;
    if (!r) return;
    const d = docRef.current;
    const b = findText(d, r.from.block);
    if (!b) return;
    const collapsed = r.from.block === r.to.block && r.from.offset === r.to.offset;
    const inLink = linkAt(b, r.from.offset);
    if (collapsed && inLink) {
      commit(replaceText(d, setMark(b, inLink.s, inLink.e, 'a', href)), 'structure');
      return;
    }
    if (collapsed) {
      // no words chosen: the address (or the words given) goes in, as a link
      const words = text || href.replace(/^mailto:|^tel:/, '');
      const marks = marksAt(b, r.from.offset).filter((m) => m.t !== 'a');
      const next = insertMarked(b, r.from.offset, words, [...marks, { s: 0, e: 0, t: 'a', v: href }]);
      commit(replaceText(d, next), 'structure');
      requestAnimationFrame(() => editor.current?.focus({ block: b.id, offset: r.from.offset + words.length }));
      return;
    }
    editor.current?.format({ kind: 'value', t: 'a', v: href });
  }

  function removeLink() {
    const r = linkEdit?.range ?? editor.current?.lastRange() ?? null;
    setLinkEdit(null);
    if (!r) return;
    const d = docRef.current;
    const b = findText(d, r.from.block);
    if (!b) return;
    const collapsed = r.from.block === r.to.block && r.from.offset === r.to.offset;
    const inLink = linkAt(b, r.from.offset);
    if (collapsed && inLink) commit(replaceText(d, setMark(b, inLink.s, inLink.e, 'a', null)), 'structure');
    else if (!collapsed) editor.current?.format({ kind: 'value', t: 'a', v: null });
  }

  // ── out and in ─────────────────────────────────────────────────────
  function download(name: string, type: string, data: BlobPart) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** The pictures' bytes, by media id — as a format needs them. */
  async function pictures<T>(d: WriteDoc, get: (id: string, by?: string) => Promise<T | null>): Promise<{ map: Map<string, T>; missing: number }> {
    const map = new Map<string, T>();
    let missing = 0;
    for (const b of d.blocks) {
      if (b.t !== 'img') continue;
      const id = mediaIdOf(b.src);
      if (!id || map.has(id)) continue;
      const got = await get(id, b.by).catch(() => null);
      if (got) map.set(id, got);
      else missing++;
    }
    return { map, missing };
  }

  const missingNote = (n: number) => (n ? ` ${n === 1 ? 'A picture that is not on this device was' : `${n} pictures that are not on this device were`} left as ${n === 1 ? 'its description' : 'their descriptions'}.` : '');

  async function exportAs(kind: 'docx' | 'pdf' | 'md' | 'txt' | 'html' | 'print') {
    setMenuOpen(false);
    flush();
    const d = docRef.current;
    const title = d.title.trim() || 'Untitled';
    // printing opens its window now, while the press still counts as the person's, and fills it once the pictures are read
    const win = kind === 'print' && (narrow || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)) ? window.open('', '_blank') : null;
    setBusy('Making the file…');
    try {
      if (kind === 'docx') {
        const { map, missing } = await pictures<MediaBytes>(d, (id, by) => media.forWord(id, by));
        download(fileNameFor(title, 'docx'), DOCX_TYPE, toDocx(d, new Date(), map) as BlobPart);
        if (missing) setToast({ text: `Saved.${missingNote(missing)}` });
      } else if (kind === 'pdf') {
        const cover = pdfCoverage(d);
        if (!cover.ok) {
          setToast({
            text: `The PDF’s fonts cannot show some characters in your writing (${cover.missing.slice(0, 6).join(' ')}). Print, then “Save as PDF”, keeps them.`,
            action: { label: 'Print instead', run: () => void exportAs('print') },
          });
          return;
        }
        const { map, missing } = await pictures<PdfPicture>(d, (id, by) => media.forPdf(id, by));
        download(fileNameFor(title, 'pdf'), PDF_TYPE, (await toPdf(d, { pictures: map })) as BlobPart);
        if (missing) setToast({ text: `Saved.${missingNote(missing)}` });
      } else if (kind === 'md' || kind === 'html' || kind === 'print') {
        const { map } = await pictures(d, (id, by) => media.bytes(id, by));
        const src = (b: Block) => {
          const id = mediaIdOf(b.src);
          const got = id ? map.get(id) : undefined;
          return got ? bytesToDataUrl(got.bytes, got.type) : null;
        };
        if (kind === 'md') download(fileNameFor(title, 'md'), 'text/markdown;charset=utf-8', toMarkdown(d, { src }));
        else if (kind === 'html') download(fileNameFor(title, 'html'), 'text/html;charset=utf-8', toHtml(d, { standalone: true, src }));
        else {
          const html = toHtml(d, { standalone: true, src });
          if (win) {
            win.document.open();
            win.document.write(html);
            win.document.close();
            setTimeout(() => {
              win.focus();
              win.print();
            }, 400);
          } else {
            const f = document.createElement('iframe');
            f.setAttribute('aria-hidden', 'true');
            f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
            document.body.appendChild(f);
            const w = f.contentWindow;
            if (!w) return;
            w.document.open();
            w.document.write(html);
            w.document.close();
            setTimeout(() => {
              w.focus();
              w.print();
              setTimeout(() => f.remove(), 1500);
            }, 300);
          }
        }
      } else download(fileNameFor(title, 'txt'), 'text/plain;charset=utf-8', toText(d));
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : 'That file could not be made.' });
      win?.close();
    } finally {
      setBusy(null);
    }
  }

  async function onImportFile(file: File) {
    setBusy('Opening the file…');
    try {
      const r = await importFile(file, props.readOther);
      if (!r.blocks.length && !r.title) {
        setToast({ text: 'There were no words in that file to bring in.' });
        return;
      }
      if (isEmptyDoc({ ...docRef.current, cards: [] })) await applyImport(r, 'replace');
      else setImporting(r);
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : 'That file could not be opened.' });
    } finally {
      setBusy(null);
    }
  }
  async function applyImport(r: Imported, how: 'replace' | 'append') {
    setImporting(null);
    setBusy('Bringing the pictures in…');
    let settled: { blocks: Block[]; dropped: number };
    try {
      settled = await settleImages(r.blocks, async (src) => {
        const k = await media.addSrc(src);
        return k ? { src: k.src, iw: k.w, ih: k.h, by: k.by } : null;
      });
    } finally {
      setBusy(null);
    }
    const d = docRef.current;
    if (how === 'replace') {
      const kept = keepVersion(d, 'import');
      const next: WriteDoc = { ...kept, title: d.title.trim() ? d.title : r.title, blocks: settled.blocks.length ? settled.blocks : [emptyBlock()], ...(r.page ? { page: r.page } : {}), ...(r.font ? { font: r.font } : {}), ...(r.size ? { size: r.size } : {}) };
      commit(withTextAround(next), 'structure');
    } else commit(withTextAround(appendBlocks(d, settled.blocks)), 'structure');
    if (shown === 'draft') choose('write');
    const dropped = settled.dropped ? [settled.dropped === 1 ? 'A picture could not be brought in.' : `${settled.dropped} pictures could not be brought in.`] : [];
    setToast({ text: [how === 'replace' && !isEmptyDoc({ ...d, cards: [] }) ? 'Opened — what was here is kept as a version.' : 'Opened.', ...r.notes, ...dropped].join(' ') });
  }

  // ── recovery: a copy in this browser, offered back if a save never landed ──
  const RKEY = `socria.write.recover.${props.sessionId}`;
  const [recover, setRecover] = useState<WriteDoc | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RKEY);
      if (!raw) return;
      const saved = sanitizeWriteDoc(JSON.parse(raw)?.doc);
      const here = props.doc;
      const differs = saved && (saved.title !== here.title || docText(saved) !== docText(here) || saved.cards.length !== here.cards.length);
      if (saved && differs && saved.updatedAt > (here.updatedAt || 0) + 1000) setRecover(saved);
      else localStorage.removeItem(RKEY);
    } catch {}
    // once, for the document as it opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const backupNow = () => {
    if (recover) return;
    try {
      const s = JSON.stringify({ at: Date.now(), doc: docRef.current });
      if (s.length < 2_500_000) localStorage.setItem(RKEY, s);
    } catch {}
  };
  useEffect(() => {
    if (recover) return;
    const t = setTimeout(backupNow, 600);
    return () => clearTimeout(t);
    // backupNow reads the document through its ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, RKEY, recover]);
  useEffect(() => {
    const out = () => backupNow();
    window.addEventListener('beforeunload', out);
    window.addEventListener('pagehide', out);
    return () => {
      window.removeEventListener('beforeunload', out);
      window.removeEventListener('pagehide', out);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RKEY, recover]);
  useEffect(() => {
    if ((props.saveState === 'saved' || props.saveState === 'local') && !pending.current && emitted.current === docRef.current) {
      try {
        localStorage.removeItem(RKEY);
      } catch {}
    }
  }, [props.saveState, RKEY]);

  // pictures kept only in this browser so far go to the account, a little after the writing settles
  const pictureKey = useMemo(() => mediaIds(doc).join(','), [doc]);
  useEffect(() => {
    if (!props.cloud || !pictureKey) return;
    const t = setTimeout(() => void media.sync(pictureKey.split(',')), 2500);
    return () => clearTimeout(t);
  }, [pictureKey, props.cloud, media]);

  useImperativeHandle(ref, () => ({
    addCard(text, opts) {
      const made = addCard(docRef.current, text, opts ?? {});
      commit(made.doc, 'board');
      if (shown === 'write') choose(narrow ? 'draft' : 'both');
      setToast({ text: 'Added to the Draft Space, linked back to where it came from.' });
    },
    show(f) {
      choose(f);
    },
    flush() {
      backupNow();
      flush();
    },
  }));

  useEffect(() => {
    if (props.autoFocus && shown !== 'draft' && isEmptyDoc({ ...doc, cards: [] })) requestAnimationFrame(() => editor.current?.focus('start'));
    // only as it opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── keys for the whole space ───────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const mod = mac ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && k === 'f' && shown !== 'draft') {
      e.preventDefault();
      setFind({ replace: false });
      return;
    }
    if (mod && !e.altKey && ((k === 'h' && !mac) || (k === 'h' && e.shiftKey && mac)) && shown !== 'draft') {
      e.preventDefault();
      setFind({ replace: true });
      return;
    }
    if (e.key === 'Escape') {
      if (linkEdit) setLinkEdit(null);
      else if (altEdit) setAltEdit(null);
      else if (blockMenu) setBlockMenu(null);
      else if (menuOpen) setMenuOpen(false);
      else if (find) setFind(null);
      else if (panel) setPanel(null);
    }
  }

  const words = useMemo(() => wordCount(docText(doc)), [doc.blocks]);
  const selWords = sel ? wordCount(sel.text) : 0;
  const status =
    pending.current || props.saveState === 'saving' ? 'Saving…' : props.saveState === 'offline' ? 'Not saved yet — trying again' : props.saveState === 'local' ? 'Saved on this device' : 'Saved';
  const scope = panel?.kind === 'check' ? proofScope() : null;
  const blk = blockMenu ? doc.blocks.find((b) => b.id === blockMenu.id) : null;
  const toolbarAt = sel && sel.rect && (sel.rect.width || sel.rect.height) ? sel.rect : null;
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const pageView = rich && doc.view === 'page' && !narrow;
  const page = pageOf(doc);
  const paper = paperOf(page);
  const sheetZoom = columnW > 0 ? Math.min(1, Math.max(0.4, (columnW - 32) / (paper.w * 96))) : 1;
  const pageVars = {
    '--w-paper-w': `${Math.round(paper.w * 96)}px`,
    '--w-m-t': `${Math.round(page.m[0] * 96)}px`,
    '--w-m-r': `${Math.round(page.m[1] * 96)}px`,
    '--w-m-b': `${Math.round(page.m[2] * 96)}px`,
    '--w-m-l': `${Math.round(page.m[3] * 96)}px`,
    '--w-line-w': `${Math.round(lineWidthOf(page) * 96)}px`,
    '--w-doc-font': fontInfo(doc.font ?? DEFAULT_FONT).css,
    '--w-doc-size': String(doc.size ?? DEFAULT_SIZE),
  } as React.CSSProperties;
  const linkBubble = rich && fmt?.link && fmt.collapsed && !linkEdit && caret && !sel ? (() => {
    const b = findText(doc, caret.block);
    const l = b ? linkAt(b, caret.offset) : null;
    const rect = l ? editor.current?.rectOf(caret.block, l.s, l.e) ?? null : null;
    return l && rect ? { href: l.v, rect } : null;
  })() : null;

  const editorEl = (
    <div className={`w-page${pageView ? ' is-sheet' : ''}`} style={{ ...pageVars, ...(pageView && sheetZoom < 1 ? { zoom: sheetZoom } : {}) }} ref={sheetRef}>
      <textarea
        className="w-title"
        value={doc.title}
        rows={1}
        placeholder="Untitled"
        aria-label="Title"
        onChange={(e) => commit({ ...docRef.current, title: e.target.value.replace(/\n/g, ' ') }, 'typing', '__title')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            editor.current?.focus('start');
          }
        }}
        ref={(el) => {
          if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }
        }}
      />
      <Editor
        ref={editor}
        doc={doc}
        onChange={(c) => commit(c.doc, c.kind, c.block)}
        onUndo={undo}
        onRedo={redo}
        marked={marked}
        onSelect={onSelect}
        onCaret={onCaret}
        onPoint={setPointed}
        onBlockMenu={(id, rect) => setBlockMenu({ id, rect })}
        onFormat={setFmt}
        onImages={rich ? (files, at) => void addPictures(files, at) : undefined}
        onSettle={rich ? (blocks, at) => void settle(blocks, at) : undefined}
        onLinkKey={rich ? openLinkEditor : undefined}
        pageHeight={pageView ? (paper.h - page.m[0] - page.m[2]) * 96 : null}
        onPages={setPages}
        media={media}
        placeholder={doc.cards.length ? 'Start writing — or turn the Draft Space into an outline' : 'Start writing. Nothing here is Socria’s unless you ask.'}
        label="Your writing"
      />
      {doc.blocks.some((b) => b.cites?.length) && (
        <div className="w-cites" aria-label="What your paragraphs cite">
          {doc.blocks
            .filter((b) => b.cites?.length)
            .flatMap((b) => b.cites!.map((c) => ({ b, c })))
            .slice(0, 40)
            .map(({ b, c }) => (
              <button key={`${b.id}:${c.id}`} type="button" className="w-cite" onClick={() => props.onOpenPassage?.(c.doc, c.block)} title={c.quote ? `“${c.quote}”` : c.label}>
                ¶ {c.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );

  const boardEl = (
    <Board
      doc={doc}
      onChange={(next) => commit(next, 'board')}
      hints={hints}
      findings={findings}
      narrow={narrow}
      onCardAction={onCardAction}
      onOpenLink={openLink}
      onOutline={outline}
      onReview={() => void review()}
      reviewing={reviewing}
      canKeep={!!props.onKeep}
    />
  );

  const panelLabel = !panel
    ? ''
    : panel.kind === 'check'
      ? 'Proofreading'
      : panel.kind === 'versions'
        ? 'Versions'
        : panel.kind === 'link'
          ? 'Link'
          : panel.kind === 'outline'
            ? 'Outline'
            : panel.kind === 'page'
              ? 'Page setup'
              : panel.kind === 'structure'
                ? 'Structure'
                : WRITE_OP_META[panel.op].label;

  const panelEl = panel && (
    <div className="w-panel-body">
      {panel.kind !== 'link' && (
        <button type="button" className="w-x" aria-label="Close" onClick={() => (setPanel(null), panel.kind === 'assist' && setProposals([]))}>
          ×
        </button>
      )}
      {panel.kind === 'assist' && (
        <AssistPanel
          op={panel.op}
          result={panel.result}
          loading={panel.loading}
          error={panel.error}
          proposals={proposals}
          onAccept={accept}
          onReject={(p) => setProposals((ps) => ps.filter((x) => x.id !== p.id))}
          onShow={(p) => editor.current?.select(p.block, p.s, p.e)}
          onUseOption={(text) => {
            const r = panel.range;
            if (!r) return;
            const d = docRef.current;
            if (r.from.block !== r.to.block) return;
            const b = findText(d, r.from.block);
            if (!b || b.text.slice(r.from.offset, r.to.offset) !== panel.input.selection) {
              setToast({ text: 'The words changed since you asked — select them again.' });
              return;
            }
            commit(replaceText(d, spliceBlock(b, r.from.offset, r.to.offset, text)), 'structure');
            setPanel(null);
          }}
          onInsert={(text) => {
            const d = docRef.current;
            const id = panel.range?.from.block ?? caret?.block;
            const b = id ? findText(d, id) : null;
            if (!b) return;
            // a connective at the start of the paragraph; the word after it loses its capital, nothing else changes
            const lower = /^[A-Z][a-z]/.test(b.text) && !/^I\b/.test(b.text) ? b.text[0].toLowerCase() : b.text[0] ?? '';
            const spliced = spliceBlock(spliceBlock(b, 0, b.text.length ? 1 : 0, lower), 0, 0, `${text} `);
            commit(replaceText(d, spliced), 'structure');
          }}
          onAsk={() => askAbout(panel.range)}
          onRetry={() => void runAssist(panel.op, panel.range, panel.range ? {} : { selection: panel.input.selection })}
        />
      )}
      {panel.kind === 'check' && (
        <CheckPanel
          issues={issues}
          onFix={fix}
          onDismiss={dismiss}
          onShow={(i) => editor.current?.select(i.block, i.s, i.e)}
          onProofread={(focus) => void proofread(focus)}
          proofreading={proofreading}
          scopeLabel={scope?.label ?? 'the document'}
          underline={underline}
          onUnderline={setUnderlinePref}
          error={proofError}
        />
      )}
      {panel.kind === 'versions' && (
        <VersionsPanel
          doc={doc}
          onKeep={(name) => {
            const kept = keepVersion(docRef.current, 'manual', Date.now(), name || undefined);
            commit(kept, 'meta');
            setToast({ text: kept === docRef.current ? 'This is already the version kept last.' : 'Version kept.' });
          }}
          onRestore={(v) => {
            commit(withTextAround(restoreVersion(docRef.current, v.id)), 'structure');
            setToast({ text: 'Restored — what was there is kept as a version.', undo: true });
          }}
        />
      )}
      {panel.kind === 'link' && <LinkPicker mode={panel.mode} docs={props.docs} map={props.map} cards={doc.cards} exclude={panel.card} onPick={onPick} onClose={() => setPanel(null)} />}
      {panel.kind === 'outline' && (
        <OutlinePanel
          doc={doc}
          onGo={(id) => editor.current?.focus({ block: id, offset: 0 })}
          onMove={(id, dir) => {
            const next = moveSection(docRef.current, id, dir);
            if (next === docRef.current) setToast({ text: dir < 0 ? 'Nothing at the same level comes before it.' : 'Nothing at the same level comes after it.' });
            else commit(next, 'structure');
          }}
          onStructure={() => void structure()}
          structuring={false}
        />
      )}
      {panel.kind === 'page' && (
        <PagePanel
          doc={doc}
          onChange={(patch) => {
            if (patch.view !== undefined) commit({ ...docRef.current, view: patch.view }, 'meta');
            else commit({ ...docRef.current, ...patch }, 'structure');
          }}
        />
      )}
      {panel.kind === 'structure' && (
        <StructurePanel
          doc={doc}
          result={panel.result}
          loading={panel.loading}
          error={panel.error}
          onShow={(block, s, e) => (e > s ? editor.current?.select(block, s, e) : editor.current?.focus({ block, offset: 0 }))}
          onMove={(block, after) => {
            const d = docRef.current;
            const to = after === null ? 0 : d.blocks.findIndex((b) => b.id === after) + 1;
            const next = moveBlocks(d, [block], to);
            if (next !== d) {
              commit(next, 'structure');
              setToast({ text: 'Moved — the words are as you wrote them.', undo: true });
            }
          }}
          onRetry={() => void structure()}
        />
      )}
    </div>
  );

  const issueCount = issues.length;

  return (
    <div ref={rootRef} className={`w-space is-${shown}${narrow ? ' is-narrow' : ''} in-${props.where}${panel ? ' has-panel' : ''}${pageView ? ' is-pages' : ''}`} onKeyDown={onKeyDown}>
      <div className="w-head">
        <div className="w-bar" role="toolbar" aria-label="Writing">
          <div className="w-faces" role="tablist" aria-label="Draft or write">
            {(canSplit ? (['draft', 'write', 'both'] as Face[]) : (['draft', 'write'] as Face[])).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={shown === f} className={shown === f ? 'is-on' : ''} onClick={() => choose(f)}>
                {f === 'draft' ? 'Draft' : f === 'write' ? 'Write' : 'Side by side'}
              </button>
            ))}
          </div>
          <span className="w-status" aria-live="polite">
            {sel && selWords ? `${selWords.toLocaleString()} of ${words.toLocaleString()} words` : `${words.toLocaleString()} word${words === 1 ? '' : 's'}`}
            {pageView ? ` · ${pages} page${pages === 1 ? '' : 's'}` : ''} · {busy ?? status}
          </span>
          <div className="w-bar-acts">
            {shown !== 'draft' && (
              <button type="button" className={`w-btn is-quiet${panel?.kind === 'check' ? ' is-on' : ''}`} aria-pressed={panel?.kind === 'check'} onClick={() => setPanel((p) => (p?.kind === 'check' ? null : { kind: 'check' }))}>
                Check{issueCount ? <span className="w-num">{issueCount}</span> : null}
              </button>
            )}
            <div className="w-menuwrap">
              <button type="button" className="w-btn is-quiet" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More" onClick={() => setMenuOpen((v) => !v)}>
                ⋯
              </button>
              {menuOpen && (
                <div className="w-menu is-right" role="menu" onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}>
                  <p className="w-menu-k">Save a copy</p>
                  <button type="button" role="menuitem" autoFocus onClick={() => void exportAs('docx')}>
                    Word document (.docx)
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportAs('pdf')}>
                    PDF document (.pdf)
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportAs('print')}>
                    Print…
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportAs('md')}>
                    Markdown (.md)
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportAs('txt')}>
                    Plain text (.txt)
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportAs('html')}>
                    Web page (.html)
                  </button>
                  <p className="w-menu-k">Bring writing in</p>
                  <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), fileRef.current?.click())}>
                    Open a Word document, PDF, Markdown or text…
                  </button>
                  {rich && shown !== 'draft' && (
                    <>
                      <p className="w-menu-k">The page</p>
                      <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), setFind({ replace: false }))}>
                        Find and replace
                      </button>
                      <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), setPanel({ kind: 'outline' }))}>
                        Outline
                      </button>
                      <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), setPanel({ kind: 'page' }))}>
                        Page setup…
                      </button>
                      {!narrow && (
                        <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), commit({ ...docRef.current, view: pageView ? 'flow' : 'page' }, 'meta'))}>
                          {pageView ? 'Show as one flowing page' : 'Show as pages'}
                        </button>
                      )}
                    </>
                  )}
                  <p className="w-menu-k">History</p>
                  <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), setPanel({ kind: 'versions' }))}>
                    Versions{doc.versions.length ? ` (${doc.versions.length})` : ''}
                  </button>
                  <button type="button" role="menuitem" disabled={!past.current.length} onClick={() => (setMenuOpen(false), undo())}>
                    Undo
                  </button>
                  <button type="button" role="menuitem" disabled={!future.current.length} onClick={() => (setMenuOpen(false), redo())}>
                    Redo
                  </button>
                </div>
              )}
            </div>
            {props.onClose && (
              <button type="button" className="w-x is-close" aria-label="Close the writing" onClick={() => (flush(), props.onClose?.())}>
                ×
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={IMPORT_ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onImportFile(f);
            }}
          />
          <input
            ref={pictureRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void addPictures(files);
              else replacing.current = null;
            }}
          />
        </div>
        {rich && shown !== 'draft' && (
          <Toolbar
            state={fmt}
            docFont={doc.font}
            docSize={doc.size}
            narrow={narrow}
            canUndo={past.current.length > 0}
            canRedo={future.current.length > 0}
            onUndo={undo}
            onRedo={redo}
            onFormat={format}
            onLink={openLinkEditor}
            onPicture={() => {
              replacing.current = null;
              pictureRef.current?.click();
            }}
            onTable={(r, c) => editor.current?.insert([makeTable(r, c, r > 1)])}
            onRule={() => editor.current?.insert([makeRule()])}
            onPageBreak={() => editor.current?.insert([makePageBreak()])}
            onFind={() => setFind({ replace: false })}
            onOutline={() => setPanel({ kind: 'outline' })}
            onPage={() => setPanel({ kind: 'page' })}
            onTableOp={onTableOp}
            onPictureOp={onPictureOp}
          />
        )}
        {find && shown !== 'draft' && (
          <FindBar
            doc={doc}
            replace={find.replace}
            onHits={onHits}
            onReveal={(h) => editor.current?.reveal(h.block, h.s, h.e)}
            onReplace={(hits, text) => {
              commit(replaceHits(docRef.current, hits, text), 'structure');
              setToast({ text: hits.length === 1 ? 'Replaced.' : `Replaced ${hits.length}.`, undo: true });
            }}
            onClose={() => {
              setFind(null);
              setFound({ hits: [], cur: -1 });
              const h = found.hits[found.cur];
              if (h) editor.current?.select(h.block, h.s, h.e);
            }}
          />
        )}
      </div>

      {recover && (
        <div className="w-banner" role="status">
          <p>Writing from {ago(recover.updatedAt)} that may not have been saved was found in this browser.</p>
          <div className="w-row">
            <button
              type="button"
              className="w-btn is-primary"
              onClick={() => {
                const kept = keepVersion(docRef.current, 'restore');
                commit({ ...kept, title: recover.title, blocks: recover.blocks, cards: recover.cards, groups: recover.groups, ...(recover.page ? { page: recover.page } : {}), ...(recover.font ? { font: recover.font } : {}), ...(recover.size ? { size: recover.size } : {}) }, 'structure');
                setRecover(null);
                setToast({ text: 'Brought back — what was here before is kept as a version.' });
              }}
            >
              Bring it back
            </button>
            <button
              type="button"
              className="w-btn"
              onClick={() => {
                setRecover(null);
                try {
                  localStorage.removeItem(RKEY);
                } catch {}
              }}
            >
              Discard it
            </button>
          </div>
        </div>
      )}
      {nearLimit(doc) && <p className="w-banner is-warn">This document is near the size kept with a conversation — save a copy (⋯ → Word) to be safe.</p>}
      {importing && (
        <div className="w-banner" role="dialog" aria-label="Open a document">
          <p>
            “{importing.title || 'That document'}” — {importing.blocks.length} paragraph{importing.blocks.length === 1 ? '' : 's'}. Add it after your writing, or replace your writing with it?
          </p>
          <div className="w-row">
            <button type="button" className="w-btn is-primary" onClick={() => void applyImport(importing, 'append')}>
              Add after my writing
            </button>
            <button type="button" className="w-btn" onClick={() => void applyImport(importing, 'replace')}>
              Replace (mine is kept as a version)
            </button>
            <button type="button" className="w-btn is-quiet" onClick={() => setImporting(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {altEdit && (
        <AltEditor
          alt={altEdit.alt}
          onSave={(alt) => {
            commit(setImage(docRef.current, altEdit.id, { alt }), 'structure');
            setAltEdit(null);
          }}
          onClose={() => setAltEdit(null)}
        />
      )}

      <div className="w-body">
        {shown === 'both' ? (
          <div className="w-split">
            <section className="w-split-draft" aria-label="Draft Space">
              {boardEl}
            </section>
            <section className="w-split-write" aria-label="Writing Space">
              {editorEl}
            </section>
          </div>
        ) : shown === 'draft' ? (
          <section className="w-only" aria-label="Draft Space">
            {boardEl}
          </section>
        ) : (
          <section className="w-only is-write" aria-label="Writing Space">
            {editorEl}
          </section>
        )}
        {panel && !narrow && (
          <section className="w-side" aria-label={panelLabel}>
            {panelEl}
          </section>
        )}
      </div>
      {panel && narrow && (
        <div className="w-sheet" role="dialog" aria-label={panelLabel}>
          {panelEl}
        </div>
      )}

      {toolbarAt && shown !== 'draft' && !blockMenu && !(narrow && panel) && !linkEdit && (
        <div
          className={`w-tools${touch ? ' is-below' : ''}`}
          role="toolbar"
          aria-label="Selected words"
          style={{
            top: touch ? Math.min(toolbarAt.bottom + 10, window.innerHeight - 120) : Math.max(8, toolbarAt.top - 46),
            left: Math.max(8, Math.min(toolbarAt.left + toolbarAt.width / 2 - 190, window.innerWidth - 388)),
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {!rich && (
            <>
              <button type="button" className="w-fmt" aria-label="Bold" title="Bold (⌘/Ctrl+B)" onClick={() => format({ kind: 'flag', t: 'b' })}>
                <b>B</b>
              </button>
              <button type="button" className="w-fmt" aria-label="Italic" title="Italic (⌘/Ctrl+I)" onClick={() => format({ kind: 'flag', t: 'i' })}>
                <i>I</i>
              </button>
              <button type="button" className="w-fmt" aria-label="Underline" title="Underline (⌘/Ctrl+U)" onClick={() => format({ kind: 'flag', t: 'u' })}>
                <u>U</u>
              </button>
              <span className="w-sep" aria-hidden="true" />
            </>
          )}
          <button type="button" onClick={() => askAbout(sel)} title="Ask about these words in the conversation">
            Ask
          </button>
          {(['explain', 'critique', 'shorten', 'improve'] as WriteOp[]).map((op) => (
            <button key={op} type="button" onClick={() => sel && void runAssist(op, sel)} title={WRITE_OP_META[op].blurb}>
              {WRITE_OP_META[op].label}
            </button>
          ))}
          <ToolsMore
            canKeep={!!props.onKeep}
            onPick={(what) => {
              if (!sel) return;
              if (what === 'cite') setPanel({ kind: 'link', mode: 'doc', block: blockIndex(docRef.current, sel.from.block) >= 0 ? sel.from.block : findCell(docRef.current, sel.from.block)?.table.id ?? sel.from.block });
              else if (what === 'grammar') {
                setPanel({ kind: 'check' });
                void proofread('grammar');
              } else if (what === 'keep') void keep(sel.text, 'idea');
              else void runAssist(what, sel);
            }}
          />
        </div>
      )}

      {issueRect && caretIssue && !sel && (
        <IssueCard issue={caretIssue} rect={issueRect} onFix={() => fix(caretIssue)} onDismiss={() => dismiss(caretIssue)} onClose={() => setClosedCard(caretIssue.id)} />
      )}
      {proposalRect && caretProposal && !sel && !(issueRect && caretIssue) && (
        <ProposalCard
          proposal={caretProposal}
          rect={proposalRect}
          onAccept={() => accept(caretProposal)}
          onReject={() => setProposals((ps) => ps.filter((x) => x.id !== caretProposal.id))}
          onClose={() => setClosedCard(caretProposal.id)}
        />
      )}
      {linkBubble && !caretIssue && !caretProposal && <LinkBubble href={linkBubble.href} rect={linkBubble.rect} onEdit={openLinkEditor} onRemove={removeLink} />}
      {linkEdit && <LinkEditor href={linkEdit.href} withText={linkEdit.withText} rect={linkEdit.rect} onApply={applyLink} onRemove={removeLink} onClose={() => setLinkEdit(null)} />}

      {blockMenu && blk && (
        <div className="w-scrim" onClick={() => setBlockMenu(null)}>
          <div
            className="w-menu"
            role="menu"
            aria-label={isOpaque(blk.t) ? 'Block' : 'Paragraph'}
            style={narrow ? undefined : { left: Math.min(blockMenu.rect.right + 6, window.innerWidth - 270), top: Math.min(blockMenu.rect.top, window.innerHeight - 440) }}
            onClick={(e) => e.stopPropagation()}
          >
            {isOpaque(blk.t) ? (
              <>
                <p className="w-menu-k">{blk.t === 'img' ? 'This picture' : blk.t === 'table' ? 'This table' : blk.t === 'pb' ? 'This page break' : 'This line'}</p>
                <button type="button" role="menuitem" autoFocus onClick={() => (setBlockMenu(null), commit(nudgeBlock(docRef.current, blk.id, -1), 'structure'))}>
                  Move up
                </button>
                <button type="button" role="menuitem" onClick={() => (setBlockMenu(null), commit(withTextAround(nudgeBlock(docRef.current, blk.id, 1)), 'structure'))}>
                  Move down
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setBlockMenu(null);
                    const sp = splitBlock(docRef.current, blk.id, 0);
                    commit(sp.doc, 'structure');
                    requestAnimationFrame(() => editor.current?.focus(sp.caret));
                  }}
                >
                  Add a line above
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setBlockMenu(null);
                    const sp = splitBlock(docRef.current, blk.id, 1);
                    commit(sp.doc, 'structure');
                    requestAnimationFrame(() => editor.current?.focus(sp.caret));
                  }}
                >
                  Add a line below
                </button>
                {blk.t === 'img' && (
                  <button type="button" role="menuitem" onClick={() => (setBlockMenu(null), setAltEdit({ id: blk.id, alt: blk.alt ?? '' }))}>
                    Describe it…
                  </button>
                )}
                <button type="button" role="menuitem" className="is-danger" onClick={() => (setBlockMenu(null), commit(withTextAround(removeBlocks(docRef.current, [blk.id])), 'structure'))}>
                  Delete
                </button>
              </>
            ) : (
              <>
                <p className="w-menu-k">Turn into</p>
                {TYPES.map(([t, label], k) => (
                  <button key={t} type="button" role="menuitemradio" aria-checked={blk.t === t} autoFocus={k === 0} onClick={() => (setBlockMenu(null), commit(setBlockType(docRef.current, blk.id, t), 'structure'))}>
                    {label}
                  </button>
                ))}
                <p className="w-menu-k">This paragraph</p>
                <button type="button" role="menuitem" onClick={() => (setBlockMenu(null), commit(nudgeBlock(docRef.current, blk.id, -1), 'structure'))}>
                  Move up <kbd>{isMacKeys() ? '⌃⇧↑' : 'Alt+Shift+↑'}</kbd>
                </button>
                <button type="button" role="menuitem" onClick={() => (setBlockMenu(null), commit(nudgeBlock(docRef.current, blk.id, 1), 'structure'))}>
                  Move down <kbd>{isMacKeys() ? '⌃⇧↓' : 'Alt+Shift+↓'}</kbd>
                </button>
                <button type="button" role="menuitem" onClick={() => (setBlockMenu(null), setPanel({ kind: 'link', mode: 'doc', block: blk.id }))}>
                  Cite a passage from your files…
                </button>
                {!!blk.cites?.length && <p className="w-menu-note">Cites {blk.cites.map((c) => c.label).join('; ')}</p>}
                <button type="button" role="menuitem" disabled={!blk.text.trim()} onClick={() => (setBlockMenu(null), void runAssist('develop', { from: { block: blk.id, offset: 0 }, to: { block: blk.id, offset: blk.text.length } }))}>
                  Develop — questions and a shape
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!blk.text.trim()}
                  onClick={() => {
                    setBlockMenu(null);
                    setPanel({ kind: 'check' });
                    void proofread('all', { blocks: [{ id: blk.id, t: blk.t, text: blk.text }], label: 'this paragraph' });
                  }}
                >
                  Proofread this paragraph
                </button>
                {isList(blk.t) &&
                  (() => {
                    const d = docRef.current;
                    const i = d.blocks.findIndex((b) => b.id === blk.id);
                    let s = i;
                    while (s > 0 && isList(d.blocks[s - 1].t)) s--;
                    let e = i;
                    while (e < d.blocks.length - 1 && isList(d.blocks[e + 1].t)) e++;
                    const run = d.blocks.slice(s, e + 1).map((b) => b.id);
                    return run.length > 1 ? (
                      <button type="button" role="menuitem" onClick={() => (setBlockMenu(null), commit(joinIntoParagraph(docRef.current, run), 'structure'))}>
                        Make this list one paragraph
                      </button>
                    ) : null;
                  })()}
                <button type="button" role="menuitem" onClick={() => (setBlockMenu(null), askAbout({ from: { block: blk.id, offset: 0 }, to: { block: blk.id, offset: blk.text.length } }))}>
                  Ask about it in the conversation
                </button>
                <button type="button" role="menuitem" className="is-danger" onClick={() => (setBlockMenu(null), commit(removeBlocks(docRef.current, [blk.id]), 'structure'))}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="w-toast" role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button type="button" className="w-btn is-quiet" onClick={() => (setToast(null), toast.action!.run())}>
              {toast.action.label}
            </button>
          )}
          {toast.undo && (
            <button type="button" className="w-btn is-quiet" onClick={() => (setToast(null), undo())}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
});

const isMacKeys = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function ToolsMore({ onPick, canKeep }: { onPick: (what: 'develop' | 'phrase' | 'cite' | 'grammar' | 'keep') => void; canKeep: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="w-menuwrap">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="More for the selected words" onClick={() => setOpen((v) => !v)}>
        ⋯
      </button>
      {open && (
        <span className="w-menu is-tools" role="menu">
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onPick('develop'))}>
            Develop — questions, not words
          </button>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onPick('grammar'))}>
            Check the grammar and spelling
          </button>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onPick('phrase'))}>
            Suggest other wordings
          </button>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onPick('cite'))}>
            Cite a passage…
          </button>
          {canKeep && (
            <button type="button" role="menuitem" onClick={() => (setOpen(false), onPick('keep'))}>
              Keep in memory
            </button>
          )}
        </span>
      )}
    </span>
  );
}
