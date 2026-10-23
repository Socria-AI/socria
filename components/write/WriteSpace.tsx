'use client';

// components/write/WriteSpace.tsx — the Draft Space and the Writing Space: one document, two faces.
//
// A blank page that can be written on at once, with nothing in the way. The
// Draft Space beside it (or instead of it, on a phone) is where ideas are
// dumped and arranged before they are prose; "Turn into an outline" carries
// the board into the writing, adding to it and never rewriting it. Both are
// the same document (lib/write/doc.ts), saved with the line of thinking.
//
// Everything Socria does here is asked for and reviewable: a reading of the
// selected words, edits proposed one at a time, a proofread whose every
// finding says how sure it is, a reading of the board's gaps. The rules that
// need no model (lib/write/checks.ts) run on the device as the person writes.
// Writing without Socria is the default, and needs nothing switched off.
//
// The document is kept here while it is being written and handed to the line
// of thinking a moment after typing stops (and at once for anything else), so
// a keystroke never waits on the rest of the app; a copy is kept in this
// browser as well, and offered back if a save never landed.

import { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SourceDoc } from '@/lib/docs/types';
import type { ThinkingMap } from '@/lib/logos';
import {
  addCard,
  addCite,
  blocksInRange,
  docText,
  dueForVersion,
  emptyBlock,
  insertBlocks,
  isEmptyDoc,
  isList,
  joinIntoParagraph,
  keepVersion,
  linkCard,
  nearLimit,
  nudgeBlock,
  removeBlocks,
  replaceBlock,
  restoreVersion,
  sanitizeWriteDoc,
  setBlockType,
  spliceBlock,
  uid,
  wordCount,
  type BlockType,
  type Card,
  type CardKind,
  type CardLink,
  type Face,
  type Point,
  type WriteDoc,
} from '@/lib/write/doc';
import { checkDoc, inline, type Issue } from '@/lib/write/checks';
import { boardBrief, boardHints, outlineFrom } from '@/lib/write/board';
import { WRITE_OP_META, type AssistInput, type AssistResult, type Finding, type WriteOp } from '@/lib/write/assist';
import { fileNameFor, toHtml, toMarkdown, toText } from '@/lib/write/render';
import { DOCX_TYPE, toDocx } from '@/lib/write/docx';
import { IMPORT_ACCEPT, importFile, type Imported } from '@/lib/write/import';
import type { WriteSel } from '@/lib/write/focus';
import { Editor, type EditorHandle, type EditorRange, type EditorSelection, type Marked } from './Editor';
import { Board, type CardAction } from './Board';
import { ago, AssistPanel, CheckPanel, IssueCard, LinkPicker, VersionsPanel, type Pick, type Proposal } from './parts';
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
  | null;

interface Snap {
  title: string;
  blocks: WriteDoc['blocks'];
  cards: WriteDoc['cards'];
  groups: WriteDoc['groups'];
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
];

function initialFace(doc: WriteDoc, narrow: boolean): Face {
  if (doc.face && !(doc.face === 'both' && narrow)) return doc.face;
  const words = doc.blocks.some((b) => b.text.trim());
  return !words && doc.cards.length ? 'draft' : 'write';
}

/** Findings Socria made, kept on the words they were made on — or dropped when those words are gone. */
function relocate(found: Issue[], doc: WriteDoc): Issue[] {
  const out: Issue[] = [];
  const dismissed = new Set(doc.dismissed);
  for (const i of found) {
    if (dismissed.has(i.id)) continue;
    const b = doc.blocks.find((x) => x.id === i.block);
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
  const snapOf = (d: WriteDoc): Snap => ({ title: d.title, blocks: d.blocks, cards: d.cards, groups: d.groups, caret: editor.current?.range()?.from ?? null });

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
    const out: WriteDoc = { ...cur, title: s.title, blocks: s.blocks, cards: s.cards, groups: s.groups, updatedAt: Date.now() };
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
    if (docRef.current.blocks.some((b) => b.id === at.block)) editor.current?.focus(at);
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
    const order = new Map(doc.blocks.map((b, k) => [b.id, k]));
    return all.filter((i) => order.has(i.block)).sort((a, b) => order.get(a.block)! - order.get(b.block)! || a.s - b.s);
  }, [ruleIssues, located, doc.blocks]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  useEffect(() => {
    setProposals((ps) => {
      let changed = false;
      const next = ps.map((p) => {
        const b = doc.blocks.find((x) => x.id === p.block);
        if (!b) return p.stale ? p : ((changed = true), { ...p, stale: true });
        if (b.text.slice(p.s, p.e) === p.from) return p.stale ? ((changed = true), { ...p, stale: false }) : p;
        const k = nearest(b.text, p.from, p.s);
        changed = true;
        return k < 0 ? { ...p, stale: true } : { ...p, s: k, e: k + p.from.length, stale: false };
      });
      return changed ? next : ps;
    });
  }, [doc.blocks]);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const hints = useMemo(() => boardHints(doc), [doc.cards, doc.groups]);

  // ── what is selected, where the caret is ───────────────────────────
  const [sel, setSel] = useState<EditorSelection | null>(null);
  const [caret, setCaret] = useState<Point | null>(null);
  const onParagraph = props.onParagraph;
  const onSelect = useCallback((s: EditorSelection | null) => setSel(s), []);
  const onCaret = useCallback(
    (p: Point | null) => {
      setCaret(p);
      if (p && onParagraph) onParagraph(docRef.current.blocks.find((b) => b.id === p.block)?.text ?? '');
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
  const [issueRect, setIssueRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!caretIssue || closedCard === caretIssue.id) {
      setIssueRect(null);
      return;
    }
    setIssueRect(editor.current?.rectOf(caretIssue.block, caretIssue.s, caretIssue.e) ?? null);
  }, [caretIssue, closedCard, doc]);

  const marked: Marked[] = useMemo(() => {
    const out: Marked[] = [];
    if (underline) for (const i of inline(issues)) if (i.kind !== 'spelling') out.push({ block: i.block, s: i.s, e: i.e, kind: i.certainty === 'definite' ? 'definite' : 'likely' });
    for (const p of proposals) if (!p.stale) out.push({ block: p.block, s: p.s, e: p.e, kind: 'proposal' });
    const a = props.asking;
    if (a && a.kind === 'block') out.push({ block: a.block, s: Math.min(a.s, a.e), e: Math.max(a.s, a.e), kind: 'focus' });
    return out;
  }, [issues, proposals, props.asking, underline]);

  // ── panels and menus ───────────────────────────────────────────────
  const [panel, setPanel] = useState<Panel>(null);
  const [blockMenu, setBlockMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  const [importing, setImporting] = useState<Imported | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Socria, when asked ─────────────────────────────────────────────
  const seq = useRef(0);
  const [proofreading, setProofreading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

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
    let input: AssistInput = { op, title: d.title, ...extra };
    if (range) {
      const picked = blocksInRange(d, range.from, range.to);
      const i = d.blocks.findIndex((b) => b.id === range.from.block);
      const j = d.blocks.findIndex((b) => b.id === range.to.block);
      const para = (k: number, dir: -1 | 1) => {
        for (let x = k + dir; x >= 0 && x < d.blocks.length; x += dir) if (d.blocks[x].text.trim() && !d.blocks[x].t.startsWith('h')) return d.blocks[x].text;
        return undefined;
      };
      input = {
        ...input,
        selection: picked.map((b) => b.text).join('\n\n'),
        paragraph: d.blocks.slice(i, j + 1).map((b) => b.text).join('\n\n'),
        prev: para(i, -1),
        next: para(j, 1),
        linked: linkedOf(d.blocks.slice(i, j + 1).map((b) => b.id)),
      };
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
    const i = d.blocks.findIndex((b) => b.id === range.from.block);
    const j = d.blocks.findIndex((b) => b.id === range.to.block);
    const out: Proposal[] = [];
    for (const e of result.edits ?? []) {
      if (e.from.includes('\n\n')) continue;
      for (let k = i; k <= j; k++) {
        const b = d.blocks[k];
        const lo = k === i ? range.from.offset : 0;
        const hi = k === j ? range.to.offset : b.text.length;
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
    const b = d.blocks.find((x) => x.id === p.block);
    if (!b) return;
    const s = b.text.slice(p.s, p.e) === p.from ? p.s : nearest(b.text, p.from, p.s);
    if (s < 0) {
      setProposals((ps) => ps.map((x) => (x.id === p.id ? { ...x, stale: true } : x)));
      return;
    }
    commit(replaceBlock(d, spliceBlock(b, s, s + p.from.length, p.to)), 'structure');
    setProposals((ps) => ps.filter((x) => x.id !== p.id));
  }

  function fix(i: Issue) {
    if (i.fix === undefined) return;
    const d = docRef.current;
    const b = d.blocks.find((x) => x.id === i.block);
    if (!b) return;
    const s = b.text.slice(i.s, i.e) === i.text ? i.s : nearest(b.text, i.text, i.s);
    if (s < 0) return;
    commit(replaceBlock(d, spliceBlock(b, s, s + i.text.length, i.fix)), 'structure');
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
    const pick = (bs: typeof d.blocks) => bs.filter((b) => b.text.trim()).map((b) => ({ id: b.id, t: b.t, text: b.text }));
    if (sel) {
      const i = d.blocks.findIndex((b) => b.id === sel.from.block);
      const j = d.blocks.findIndex((b) => b.id === sel.to.block);
      return { blocks: pick(d.blocks.slice(i, j + 1)), label: 'the selection' };
    }
    const total = d.blocks.reduce((n, b) => n + b.text.length, 0);
    if (total <= 13_000) return { blocks: pick(d.blocks), label: 'the document' };
    const at = Math.max(0, d.blocks.findIndex((b) => b.id === caret?.block));
    let s = at;
    while (s > 0 && !d.blocks[s].t.startsWith('h')) s--;
    let e = at + 1;
    while (e < d.blocks.length && !d.blocks[e].t.startsWith('h')) e++;
    return { blocks: pick(d.blocks.slice(s, e)), label: 'this section' };
  }

  async function proofread() {
    const scope = proofScope();
    if (!scope.blocks.length) return;
    setProofreading(true);
    setProofError(null);
    try {
      const result = await props.assist({ op: 'proofread', blocks: scope.blocks, title: docRef.current.title });
      const ids = new Set(scope.blocks.map((b) => b.id));
      setSocria((xs) => [...xs.filter((x) => !ids.has(x.block)), ...(result.issues ?? [])]);
      if (!(result.issues ?? []).length) setToast({ text: 'Socria read it and found nothing worth marking.' });
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

  // ── Point & Ask ────────────────────────────────────────────────────
  function askAbout(range: EditorRange | null) {
    const r = range ?? (caret ? { from: caret, to: caret } : null);
    if (!r) return;
    const d = docRef.current;
    const b = d.blocks.find((x) => x.id === r.from.block);
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

  function onCardAction(card: Card, action: CardAction) {
    if (action === 'link-doc' || action === 'link-node' || action === 'link-card') setPanel({ kind: 'link', mode: action === 'link-doc' ? 'doc' : action === 'link-node' ? 'node' : 'card', card: card.id });
    else if (action === 'develop') void runAssist('develop', null, { selection: card.text, linked: (card.links ?? []).map((l) => `${l.k === 'doc' ? 'passage' : l.k === 'node' ? 'map idea' : 'card'}: ${l.label}`) });
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
  function exportAs(kind: 'docx' | 'md' | 'txt' | 'html' | 'print') {
    setMenuOpen(false);
    flush();
    const d = docRef.current;
    const title = d.title.trim() || 'Untitled';
    if (kind === 'docx') download(fileNameFor(title, 'docx'), DOCX_TYPE, toDocx(d) as BlobPart);
    else if (kind === 'md') download(fileNameFor(title, 'md'), 'text/markdown;charset=utf-8', toMarkdown(d));
    else if (kind === 'txt') download(fileNameFor(title, 'txt'), 'text/plain;charset=utf-8', toText(d));
    else if (kind === 'html') download(fileNameFor(title, 'html'), 'text/html;charset=utf-8', toHtml(d, { standalone: true }));
    else {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
      document.body.appendChild(f);
      const w = f.contentWindow;
      if (!w) return;
      w.document.open();
      w.document.write(toHtml(d, { standalone: true }));
      w.document.close();
      setTimeout(() => {
        w.focus();
        w.print();
        setTimeout(() => f.remove(), 1500);
      }, 120);
    }
  }

  async function onImportFile(file: File) {
    try {
      const r = await importFile(file, props.readOther);
      if (!r.blocks.length && !r.title) {
        setToast({ text: 'There were no words in that file to bring in.' });
        return;
      }
      if (isEmptyDoc({ ...docRef.current, cards: [] })) applyImport(r, 'replace');
      else setImporting(r);
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : 'That file could not be opened.' });
    }
  }
  function applyImport(r: Imported, how: 'replace' | 'append') {
    setImporting(null);
    const d = docRef.current;
    if (how === 'replace') {
      const kept = keepVersion(d, 'import');
      commit({ ...kept, title: d.title.trim() ? d.title : r.title, blocks: r.blocks.length ? r.blocks : [emptyBlock()] }, 'structure');
    } else commit(appendBlocks(d, r.blocks), 'structure');
    if (shown === 'draft') choose('write');
    setToast({ text: [how === 'replace' && !isEmptyDoc({ ...d, cards: [] }) ? 'Opened — what was here is kept as a version.' : 'Opened.', ...r.notes].join(' ') });
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
    if (e.key === 'Escape') {
      if (blockMenu) setBlockMenu(null);
      else if (menuOpen) setMenuOpen(false);
      else if (panel) setPanel(null);
    }
  }

  const words = useMemo(() => wordCount(docText(doc)), [doc.blocks]);
  const status =
    pending.current || props.saveState === 'saving' ? 'Saving…' : props.saveState === 'offline' ? 'Not saved yet — trying again' : props.saveState === 'local' ? 'Saved on this device' : 'Saved';
  const scope = panel?.kind === 'check' ? proofScope() : null;
  const blk = blockMenu ? doc.blocks.find((b) => b.id === blockMenu.id) : null;
  const toolbarAt = sel && sel.rect && (sel.rect.width || sel.rect.height) ? sel.rect : null;
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  const editorEl = (
    <div className="w-page">
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
    />
  );

  const panelEl = panel && (
    <div className="w-panel-body">
      {panel.kind !== 'link' && (
        <button type="button" className="w-x" aria-label="Close" onClick={() => (setPanel(null), setProposals([]))}>
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
            const b = d.blocks.find((x) => x.id === r.from.block);
            if (!b || b.text.slice(r.from.offset, r.to.offset) !== panel.input.selection) {
              setToast({ text: 'The words changed since you asked — select them again.' });
              return;
            }
            commit(replaceBlock(d, spliceBlock(b, r.from.offset, r.to.offset, text)), 'structure');
            setPanel(null);
          }}
          onInsert={(text) => {
            const d = docRef.current;
            const id = panel.range?.from.block ?? caret?.block;
            const b = id ? d.blocks.find((x) => x.id === id) : null;
            if (!b) return;
            // a connective at the start of the paragraph; the word after it loses its capital, nothing else changes
            const lower = /^[A-Z][a-z]/.test(b.text) && !/^I\b/.test(b.text) ? b.text[0].toLowerCase() : b.text[0] ?? '';
            const spliced = spliceBlock(spliceBlock(b, 0, b.text.length ? 1 : 0, lower), 0, 0, `${text} `);
            commit(replaceBlock(d, spliced), 'structure');
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
          onProofread={() => void proofread()}
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
            commit(restoreVersion(docRef.current, v.id), 'structure');
            setToast({ text: 'Restored — what was there is kept as a version.', undo: true });
          }}
        />
      )}
      {panel.kind === 'link' && (
        <LinkPicker mode={panel.mode} docs={props.docs} map={props.map} cards={doc.cards} exclude={panel.card} onPick={onPick} onClose={() => setPanel(null)} />
      )}
    </div>
  );

  const issueCount = issues.length;

  return (
    <div ref={rootRef} className={`w-space is-${shown}${narrow ? ' is-narrow' : ''} in-${props.where}${panel ? ' has-panel' : ''}`} onKeyDown={onKeyDown}>
      <div className="w-bar" role="toolbar" aria-label="Writing">
        <div className="w-faces" role="tablist" aria-label="Draft or write">
          {(canSplit ? (['draft', 'write', 'both'] as Face[]) : (['draft', 'write'] as Face[])).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={shown === f} className={shown === f ? 'is-on' : ''} onClick={() => choose(f)}>
              {f === 'draft' ? 'Draft' : f === 'write' ? 'Write' : 'Side by side'}
            </button>
          ))}
        </div>
        <span className="w-status" aria-live="polite">
          {words.toLocaleString()} word{words === 1 ? '' : 's'} · {status}
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
                <button type="button" role="menuitem" autoFocus onClick={() => exportAs('docx')}>
                  Word document (.docx)
                </button>
                <button type="button" role="menuitem" onClick={() => exportAs('print')}>
                  Print, or save as PDF
                </button>
                <button type="button" role="menuitem" onClick={() => exportAs('md')}>
                  Markdown (.md)
                </button>
                <button type="button" role="menuitem" onClick={() => exportAs('txt')}>
                  Plain text (.txt)
                </button>
                <button type="button" role="menuitem" onClick={() => exportAs('html')}>
                  Web page (.html)
                </button>
                <p className="w-menu-k">Bring writing in</p>
                <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), fileRef.current?.click())}>
                  Open a Word document, Markdown or text…
                </button>
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
                commit({ ...kept, title: recover.title, blocks: recover.blocks, cards: recover.cards, groups: recover.groups }, 'structure');
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
            <button type="button" className="w-btn is-primary" onClick={() => applyImport(importing, 'append')}>
              Add after my writing
            </button>
            <button type="button" className="w-btn" onClick={() => applyImport(importing, 'replace')}>
              Replace (mine is kept as a version)
            </button>
            <button type="button" className="w-btn is-quiet" onClick={() => setImporting(null)}>
              Cancel
            </button>
          </div>
        </div>
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
          <section className="w-side" aria-label={panel.kind === 'check' ? 'Proofreading' : panel.kind === 'versions' ? 'Versions' : panel.kind === 'link' ? 'Link' : WRITE_OP_META[panel.op].label}>
            {panelEl}
          </section>
        )}
      </div>
      {panel && narrow && (
        <div className="w-sheet" role="dialog" aria-label={panel.kind === 'check' ? 'Proofreading' : panel.kind === 'versions' ? 'Versions' : panel.kind === 'link' ? 'Link' : WRITE_OP_META[panel.op].label}>
          {panelEl}
        </div>
      )}

      {toolbarAt && shown !== 'draft' && !blockMenu && !(narrow && panel) && (
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
          <button type="button" className="w-fmt" aria-label="Bold" title="Bold (⌘/Ctrl+B)" onClick={() => editor.current && editorMark('b')}>
            <b>B</b>
          </button>
          <button type="button" className="w-fmt" aria-label="Italic" title="Italic (⌘/Ctrl+I)" onClick={() => editorMark('i')}>
            <i>I</i>
          </button>
          <button type="button" className="w-fmt" aria-label="Underline" title="Underline (⌘/Ctrl+U)" onClick={() => editorMark('u')}>
            <u>U</u>
          </button>
          <span className="w-sep" aria-hidden="true" />
          <button type="button" onClick={() => askAbout(sel)} title="Ask about these words in the conversation">
            Ask
          </button>
          {(['explain', 'critique', 'shorten', 'improve'] as WriteOp[]).map((op) => (
            <button key={op} type="button" onClick={() => sel && void runAssist(op, sel)} title={WRITE_OP_META[op].blurb}>
              {WRITE_OP_META[op].label}
            </button>
          ))}
          <ToolsMore
            onPick={(what) => {
              if (!sel) return;
              if (what === 'cite') setPanel({ kind: 'link', mode: 'doc', block: sel.from.block });
              else void runAssist(what, sel);
            }}
          />
        </div>
      )}

      {issueRect && caretIssue && !sel && (
        <IssueCard
          issue={caretIssue}
          rect={issueRect}
          onFix={() => fix(caretIssue)}
          onDismiss={() => dismiss(caretIssue)}
          onClose={() => setClosedCard(caretIssue.id)}
        />
      )}

      {blockMenu && blk && (
        <div className="w-scrim" onClick={() => setBlockMenu(null)}>
          <div
            className="w-menu"
            role="menu"
            aria-label="Paragraph"
            style={narrow ? undefined : { left: Math.min(blockMenu.rect.right + 6, window.innerWidth - 270), top: Math.min(blockMenu.rect.top, window.innerHeight - 440) }}
            onClick={(e) => e.stopPropagation()}
          >
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
                void (async () => {
                  setProofreading(true);
                  try {
                    const result = await props.assist({ op: 'proofread', blocks: [{ id: blk.id, t: blk.t, text: blk.text }], title: docRef.current.title });
                    setSocria((xs) => [...xs.filter((x) => x.block !== blk.id), ...(result.issues ?? [])]);
                  } catch (e) {
                    setProofError(e instanceof Error ? e.message : 'That could not be done just now.');
                  } finally {
                    setProofreading(false);
                  }
                })();
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
          </div>
        </div>
      )}

      {toast && (
        <div className="w-toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button type="button" className="w-btn is-quiet" onClick={() => (setToast(null), undo())}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );

  function editorMark(t: 'b' | 'i' | 'u') {
    editor.current?.mark(t);
  }
});

const isMacKeys = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function ToolsMore({ onPick }: { onPick: (what: 'develop' | 'phrase' | 'cite') => void }) {
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
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onPick('phrase'))}>
            Suggest other wordings
          </button>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onPick('cite'))}>
            Cite a passage…
          </button>
        </span>
      )}
    </span>
  );
}
