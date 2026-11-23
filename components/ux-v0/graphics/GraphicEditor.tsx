'use client';

// components/ux-v0/graphics/GraphicEditor.tsx — the graphics editor: canvas, layers, artboards, adding, pictures, the
// brand, versions, the inspector, changes asked in words, export, and the keyboard.
//
// It edits a document it is given and hands every new one back (onChange); it keeps the history itself. A change, by
// hand or in words, is one transactional operation: refused whole when it would break a lock or the document (the last
// valid design is never lost), taken back by undo. A change asked in words is read into validated operations
// (readGraphicEdit) and shown as a preview before it is applied. Used by the Graphics workspace and by the graphic
// materials of a board, so there is one graphics editor, not two.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyOps, locate, newId, type Asset, type GraphicDoc, type Located, type Node, type Op } from '@/lib/ux-v0/graphics/doc';
import { formatOf, sizeLabel } from '@/lib/ux-v0/graphics/formats';
import { adaptBoard, type GraphicDirection, type GraphicKind } from '@/lib/ux-v0/graphics/compose';
import { checkDoc, refineDoc } from '@/lib/ux-v0/graphics/check';
import { readGraphicEdit, type GraphicEdit } from '@/lib/ux-v0/graphics/edit';
import { changedConcepts, remember } from '@/lib/ux-v0/graphics/generative/memory';
import { nativeFile, openNativeFile, svgFile } from '@/lib/ux-v0/graphics/export';
import { canvasMeasure, embeddedAssets, exportBoardImage, exportPdf } from '@/lib/ux-v0/graphics/raster';
import { MAX_GRAPHIC_VERSIONS, type GraphicVersion } from '@/lib/ux-v0/graphics/state';
import type { Measure } from '@/lib/ux-v0/graphics/text';
import { GraphicCanvas, type CanvasHandle } from './GraphicCanvas';
import { AddPanel, ArtboardsPanel, Inspector, LayersPanel, nodeLabel } from './GraphicPanels';
import { CeilingInspector, ShapeLibrary } from './CeilingPanels';
import { download, faceKey, facesUsed, loadFaces, slug } from './faces';
import { StyleExplorer, StylePanel } from './StyleExplorer';
import { LogoTab } from './LogoPanel';
import { logoEditFromWords } from '@/lib/ux-v0/graphics/logo/session';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { useStyleLibrary } from './styleLibrary';
import { ConceptCompare, ConceptPanel } from './ConceptPanel';
import { planChange } from './creativePlanner';
import { readCreative } from '@/lib/ux-v0/graphics/creative/interpret';
import { conceptRef, executePlan } from '@/lib/ux-v0/graphics/creative/execute';
import { conceptRefs, forgetConcept, revisitConcept, saveConcept } from '@/lib/ux-v0/graphics/creative/concepts';
import type { Change, CreativePlan, PlanQuestion } from '@/lib/ux-v0/graphics/creative/plan';

/** Creative direction in one click: the same words the ask bar reads (generative/edits.ts). */
const CREATIVE_ACTIONS: readonly [string, string, boolean?][] = [
  ['Rethink the composition', 'Keep the style but completely rethink the composition'],
  ['Something unexpected', 'Make something visually unexpected'],
  ['Another direction', 'Use a completely different creative direction'],
  ['Keep the type, change the rest', 'Keep the typography and change everything else'],
  ['Less conventional', 'Don’t use a conventional poster layout'],
  ['Picture first', 'Make the image the primary visual element', true],
  ['An abstract motif', 'Use an original abstract motif'],
  ['Not generic', 'Create something that doesn’t look like a typical AI-generated graphic'],
  ['More room', 'Use more negative space'],
  ['Headline central', 'Make the headline the central element'],
  ['Four alternatives', 'Show me four different compositions'],
];

type Tab = 'logo' | 'layers' | 'concept' | 'boards' | 'add' | 'shapes' | 'pictures' | 'styles' | 'brand' | 'versions';
export type EditorNote = { tone: 'ok' | 'warn' | 'ask'; text: string; /** ways to answer a question, as they would be said */ options?: { label: string; words: string }[] } | null;
export type ChangeMeta = { label: string; version?: boolean; kind: 'edit' | 'undo' | 'redo' };

/** A direction for a document that has none (one opened from a file): its own tokens, a measured restraint. */
export function directionOfDoc(doc: GraphicDoc): GraphicDirection {
  return { name: doc.direction?.name || 'This design', language: doc.direction?.language || 'editorial', tokens: doc.tokens, look: { case: 'sentence', tracking: 'normal', weight: 600 }, form: null, intensity: 40 };
}

export interface GraphicEditorProps {
  /** the document as it stands */
  doc: GraphicDoc;
  /** every new document, with what made it (a change, an undo, a redo) and whether it is kept as a version */
  onChange: (next: GraphicDoc, meta: ChangeMeta) => void;
  /** the design's name, for the files it exports */
  name: string;
  /** the direction it is composed in (changes asked in words and adapted formats follow it) */
  direction: GraphicDirection | null;
  kind?: GraphicKind;
  kindLabel?: string;
  measure: Measure;
  href: (id: string, src: string) => string;
  resolve: (src: string) => Promise<Blob | null>;
  missingUploads: readonly string[];
  /** a picture the designer gives, kept in this browser (null when refused: the caller says why) */
  upload: (f: File) => Promise<Asset | null>;
  note: EditorNote;
  onNote: (n: EditorNote) => void;
  /** versions kept with the project (the Versions panel shows only when given) */
  versions?: readonly GraphicVersion[];
  onKeepVersion?: (doc: GraphicDoc) => void;
  /** why it is composed this way */
  planNotes?: readonly string[];
  /** what the Brand panel is headed with, and said under its heading */
  brand?: { title: string; note?: ReactNode };
  /** “Open a design file…” in the export menu */
  allowOpen?: boolean;
  /** before the toolbar's own controls (a way back, for a material of a board) */
  toolbarStart?: ReactNode;
  /** after the inspector (what a board says about this material) */
  inspectorExtra?: ReactNode;
  /** a Board made from an approved logo's identity (offered in the Logo tab when given) */
  onMakeBoard?: (sys: MasterDesignSystem) => void;
  /** a change asked in words elsewhere (the studio's conversation beside the workspace), read as if typed here */
  inbox?: { id: number; words: string } | null;
  /** what came of a change asked in words, said back to where it was asked */
  onAsked?: (said: string) => void;
  /** the work alone: the panels put away (the properties come back while something is selected) */
  focus?: boolean;
  /** offered as “Edit by hand” / “Focus on the work” when given */
  onFocus?: (focus: boolean) => void;
  /** words are taken elsewhere (the conversation beside the workspace): no ask bar of its own, only what it previews */
  hideAsk?: boolean;
  /** the project, for the model's budget when a creative change is read by it */
  projectId?: string;
}

export function GraphicEditor(props: GraphicEditorProps) {
  const { doc: given, onChange, measure, href, note, onNote } = props;
  const setNote = onNote;

  // the document as this editor last knew it (a change in the same moment chains on it), and the history
  const docRef = useRef(given);
  const produced = useRef<GraphicDoc | null>(null);
  const past = useRef<{ doc: GraphicDoc; label: string }[]>([]);
  const future = useRef<{ doc: GraphicDoc; label: string }[]>([]);
  if (given !== docRef.current) {
    // a document this editor did not make (composed again, opened elsewhere): its history no longer applies
    if (given !== produced.current) {
      past.current = [];
      future.current = [];
    }
    docRef.current = given;
  }
  const docNow = () => docRef.current;

  const [boardId, setBoardId] = useState(given.artboards[0]?.id ?? '');
  const [selection, setSelection] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>(() => (given.artboards.some((b) => b.logo) ? 'logo' : 'layers'));
  const [pathEdit, setPathEdit] = useState<string | null>(null);
  const [aids, setAids] = useState({ guides: true, grid: false, rulers: true });
  const [askWords, setAskWords] = useState('');
  const [pending, setPending] = useState<{ edit: GraphicEdit; doc: GraphicDoc; base: GraphicDoc } | null>(null);
  const [busy, setBusy] = useState('');
  const [explorer, setExplorer] = useState<{ open: boolean; query?: string }>({ open: false });
  const { library } = useStyleLibrary();
  const [, setTick] = useState(0);
  const clipboard = useRef<Node[]>([]);
  const zoomRef = useRef<CanvasHandle | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const openInput = useRef<HTMLInputElement>(null);

  // a preview made on an older document is not shown over a newer one
  const live = pending && pending.base === given ? pending : null;
  const doc = live?.doc ?? given;
  const board = doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0];

  useEffect(() => {
    if (!given.artboards.some((b) => b.id === boardId)) setBoardId(given.artboards[0].id);
    setSelection((s) => {
      const kept = s.filter((id) => !!locate(given, id));
      return kept.length === s.length ? s : kept;
    });
  }, [given, boardId]);

  const emit = (next: GraphicDoc, meta: ChangeMeta) => {
    docRef.current = next;
    produced.current = next;
    onChange(next, meta);
  };

  /** A new document as the current one: one step of the history (and a version, for a change asked in words). */
  const commitDoc = (next: GraphicDoc, label: string, opts: { version?: boolean } = {}) => {
    const cur = docNow();
    past.current.push({ doc: cur, label });
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    emit(next, { label, version: opts.version, kind: 'edit' });
    // a new artboard (added, duplicated, adapted) is the one shown
    const fresh = next.artboards.find((b) => !cur.artboards.some((c) => c.id === b.id));
    if (fresh) setBoardId(fresh.id);
    setTick((t) => t + 1);
  };

  const onOps = (ops: Op[], label: string) => {
    const cur = docNow();
    if (!ops.length) return;
    if (pending) setPending(null);
    const r = applyOps(cur, ops);
    if (!r.ok) {
      setNote({ tone: 'warn', text: `Nothing changed: ${r.error}${r.locked?.length ? ' Unlock it first (Layers), or change something else.' : ''}` });
      return;
    }
    commitDoc(r.doc, label);
    // what was just made (added, pasted, duplicated, grouped) is what is selected next
    if (ops.every((o) => ['add', 'asset', 'duplicate', 'group'].includes(o.op))) {
      const made = r.touched.filter((id) => !!locate(r.doc, id));
      if (made.length) setSelection(made);
    }
    setNote(r.notes.length ? { tone: 'warn', text: r.notes.join(' ') } : null);
  };

  const undo = () => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push({ doc: docNow(), label: p.label });
    setPending(null);
    emit(p.doc, { label: p.label, kind: 'undo' });
    setNote({ tone: 'ok', text: `Undone: ${p.label}.` });
    setTick((t) => t + 1);
  };
  const redo = () => {
    const f = future.current.pop();
    if (!f) return;
    past.current.push({ doc: docNow(), label: f.label });
    setPending(null);
    emit(f.doc, { label: f.label, kind: 'redo' });
    setNote({ tone: 'ok', text: `Redone: ${f.label}.` });
    setTick((t) => t + 1);
  };

  // ── a change asked in words ──
  // What one object should do (“make the headline bigger”, “move the logo beneath the title”) goes to the precise
  // reader, as it always has. A creative change — a theme, a quality, a new look for the type, the colours, the forms,
  // the ground or the composition, a decision turned down, a concept kept, revisited or combined — is planned (the
  // model when it can help, the reader always: creativePlanner.ts), carried out by the engine (creative/execute.ts)
  // and previewed. One question is asked only when the words could mean genuinely different things, its answers
  // offered as they would be said; anything else is decided and shown, to keep or to discard.
  const askedRef = useRef<PlanQuestion | null>(null);
  const recentRef = useRef<{ said: string; did: string }[]>([]);
  const planning = useRef<AbortController | null>(null);
  const [thinking, setThinking] = useState('');
  const [compare, setCompare] = useState(false);

  const tell = (tone: 'ok' | 'warn' | 'ask', text: string, show = true, options?: { label: string; words: string }[]) => {
    if (show) setNote({ tone, text, ...(options?.length ? { options } : {}) });
    props.onAsked?.(options?.length ? `${text} ${options.map((o, i) => `${i + 1}. ${o.label}`).join(' · ')} — or say it your own way.` : text);
  };
  const askQuestion = (q: PlanQuestion, lead = '') => {
    askedRef.current = q;
    tell('ask', `${lead}${q.text}`, true, q.options);
  };
  const dirNow = () => props.direction ?? directionOfDoc(docNow());

  /** The precise reader's change of one object, previewed (false when it reads nothing in the words). */
  const precise = (words: string): boolean => {
    const cur = docNow();
    const e = readGraphicEdit(words, cur, { artboard: board.id, selection, dir: dirNow(), measure, kind: props.kind, customs: library.styles });
    if (!e) return false;
    if (e.question && !e.ops.length && !e.next) {
      tell('ask', e.question);
      return true;
    }
    let next: GraphicDoc | null = e.next ?? null;
    if (!next) {
      const r = applyOps(cur, e.ops);
      if (!r.ok) {
        tell('warn', `Nothing changed: ${r.error}`);
        return true;
      }
      next = r.doc;
    }
    setPending({ edit: e, doc: next, base: cur });
    if (e.next) {
      const fresh = next.artboards.find((b) => !cur.artboards.some((c) => c.id === b.id));
      if (fresh) setBoardId(fresh.id);
    }
    recentRef.current = [...recentRef.current, { said: words, did: e.label }].slice(-6);
    setNote(e.question ? { tone: 'ask', text: e.question } : null);
    props.onAsked?.(`Previewing: ${e.label}. Apply or Discard it under the canvas.${e.question ? ` ${e.question}` : ''}`);
    return true;
  };

  /** A move on concepts themselves: keep, explore a copy, compare, go back, new ones, another interpretation. */
  const conceptMove = (c: Extract<Change, { decision: 'concept' }>, words: string) => {
    const cur = docNow();
    if (c.action === 'save') {
      const s = saveConcept(cur, board.id, { name: c.name, said: recentRef.current[recentRef.current.length - 1]?.said });
      onOps([s.op], `kept as “${s.concept.name}”`);
      setTab('concept');
      return tell('ok', `Kept as “${s.concept.name}”. Go back to it any time from Concept, compare it, or take its type, colours or forms into another.${s.dropped ? ` (“${s.dropped.name}”, the oldest kept, made room for it.)` : ''}`);
    }
    if (c.action === 'duplicate') {
      onOps([{ op: 'artboard-duplicate', id: board.id, name: c.name || `${board.name} — to explore` }], 'a copy to explore from');
      return tell('ok', 'A copy to explore from, beside the original: change it as freely as you like — the original stays as it is.');
    }
    if (c.action === 'compare') {
      if (!cur.concepts?.length && cur.artboards.length < 2) return tell('ask', 'There is only this concept so far. Say “keep this concept” or “explore a copy”, change one, and then compare them.');
      setTab('concept');
      setCompare(true);
      return tell('ok', 'The concepts are side by side over the canvas, each with what it decided. Take a decision from one, or go back to it.');
    }
    if (c.action === 'revisit') {
      const refs = conceptRefs(cur, board.id);
      const kept = cur.concepts ?? [];
      const target = c.ref ? conceptRef(refs, c.ref) : kept.length ? refs[kept.length - 1] : null;
      if (!target) return tell('ask', kept.length ? `Which one? ${kept.map((k, i) => `${i + 1}. ${k.name}`).join(' · ')}` : 'No concept has been kept yet. Say “keep this concept” to keep one; then you can always come back to it.');
      if (kept.some((k) => k.id === target.id)) {
        const r = revisitConcept(cur, board.id, target.id);
        if (!r) return tell('warn', 'That concept could not be brought back.');
        commitDoc(r.doc, r.label, { version: true });
        return tell('ok', `Back to “${target.name}”.${r.keptAs ? ` What was here is kept as “${r.keptAs}”, so nothing is lost.` : ''} Undo goes back.`);
      }
      setBoardId(target.id);
      return tell('ok', `“${target.name}” is in front: change it as freely as this one.`);
    }
    if (c.action === 'new') {
      if (precise('Show me four different compositions')) return;
      return tell('warn', 'New concepts need an artboard composed by SocriaUX (with a headline) to start from.');
    }
    // another interpretation: the composition conceived again, the decisions made since put back on it
    runPlan({ intent: 'concept', summary: 'another interpretation of this concept, its decisions kept', keep: [], changes: [{ decision: 'composition', action: 'alternative' }], by: 'reader' }, words);
  };

  /** A plan carried out by the engine and previewed (or its question asked, or its concept move made). */
  const runPlan = async (plan: CreativePlan, words: string) => {
    const base = docNow();
    const move = plan.changes.find((c): c is Extract<Change, { decision: 'concept' }> => c.decision === 'concept');
    if (move) return conceptMove(move, words);
    if (!plan.changes.length) {
      if (plan.question) return askQuestion(plan.question);
      return tell('ok', plan.keep.length ? `Kept as it is: ${plan.summary.replace(/^./, (x) => x.toLowerCase())}. Say what should change.` : 'Say what should change, and how.');
    }
    // the same moment for both passes below, so the forms drawn are the same ones
    const now = Date.now();
    const exec = (m: Measure) => executePlan(base, plan, { board: board.id, dir: dirNow(), kind: props.kind, measure: m, concepts: conceptRefs(base, board.id), said: words, now });
    // a face the design did not use until now is fetched first and the words fitted again to its real widths: until it
    // arrives the browser measures a stand-in, and words fitted to that break once the real face is drawn. The first
    // pass measures with a measure of its own, so the editor's measure never keeps a stand-in's widths
    const browser = typeof document !== 'undefined';
    let r = exec(browser ? canvasMeasure() : measure);
    if (r && r.doc !== base && browser) {
      const known = new Set(facesUsed(base).map(faceKey));
      const fresh = facesUsed(r.doc).filter((f) => !known.has(faceKey(f)));
      if (fresh.length) {
        setThinking('Setting the type…');
        try {
          if (await loadFaces(fresh)) r = exec(canvasMeasure()) ?? r;
        } finally {
          setThinking('');
        }
      }
    }
    if (!r || r.doc === base || !r.done.length) {
      const why = r?.notes.join(' ') || 'This design already is what those words ask for.';
      return plan.question ? askQuestion(plan.question, `${why} `) : tell('warn', why);
    }
    setPending({ edit: { ops: [], next: r.doc, label: r.label || r.done[0], scope: 'artboard' }, doc: r.doc, base });
    recentRef.current = [...recentRef.current, { said: words, did: r.done.join('; ') }].slice(-6);
    const said = `${r.done.join('; ').replace(/^./, (x) => x.toUpperCase())}.${r.kept.length ? ` Kept: ${r.kept.join(', ')}.` : ''}${r.notes.length ? ` ${r.notes.join(' ')}` : ''}`;
    setAskWords('');
    if (plan.question) return askQuestion(plan.question, `${said} `);
    setNote({ tone: 'ok', text: said });
    props.onAsked?.(`Previewing: ${said} Apply or Discard it under the canvas.`);
  };

  const ask = async (said?: string) => {
    let words = (typeof said === 'string' ? said : askWords).trim();
    if (!words || !board) return;
    // a preview waiting: a short “apply” or “discard” settles it (“keep the type, change the rest” is a new change, not a yes)
    if (live && /^\s*(apply( it)?|yes( please)?|keep it|do it|ok(ay)?|looks good|perfect|great|love it)\s*[.!]*\s*$/i.test(words)) {
      const label = live.edit.label;
      applyPending();
      tell('ok', `Applied: ${label}. Undo takes it back.`, false);
      return;
    }
    if (live && /^\s*(discard( it)?|no|nope|undo( that)?|cancel|not that|never ?mind)\s*[.!]*\s*$/i.test(words)) {
      discardPending();
      tell('ok', 'Discarded: the design is as it was.', false);
      return;
    }
    // “undo” with nothing waiting: the last change taken back
    if (!live && /^\s*undo( that| it| the last change)?\s*[.!]*\s*$/i.test(words)) {
      if (!past.current.length) return tell('ok', 'There is nothing to undo yet.');
      undo();
      props.onAsked?.('Undone. Redo brings it back.');
      return;
    }
    if (planning.current) return tell('ask', 'Still reading the last change — a moment, or cancel it first.');
    // a new change while one is previewed builds on it (the preview is taken), unless the words turn it down first
    // (“no, make it darker”): continuous iteration, never a dead end of apply-or-discard
    if (live) {
      const refused = words.match(/^\s*(no|nope|not that|not like that)\b[,.!]?\s*/i);
      if (refused) {
        setPending(null);
        words = words.slice(refused[0].length).trim();
        if (!words) return tell('ok', 'Discarded: the design is as it was.');
      } else takePending();
    }
    const cur = docNow();
    // on a logo artboard, the logo's own edits (more distinctive, simpler, a new wordmark…) are read first
    if (board.logo) {
      const lr = logoEditFromWords(cur, board.id, words);
      if (lr) {
        if (lr.doc !== cur) commitDoc(lr.doc, words.slice(0, 80), { version: true });
        tell(lr.ok ? 'ok' : 'warn', `${lr.said} Undo takes it back.`);
        setAskWords('');
        setTab('logo');
        return;
      }
    }
    const asked = askedRef.current;
    askedRef.current = null;
    const refs = conceptRefs(cur, board.id);
    const read = readCreative(words, { doc: cur, board: board.id, concepts: refs, asked });
    // what one object should do, or a command of the editor's own (a format, a colour for the selection, a size): the
    // precise reader first, whenever the words hold no creative decision
    const creative = !!read && read.plan.changes.some((c) => c.decision !== 'object');
    if (!creative && precise(words)) return;
    const ac = new AbortController();
    planning.current = ac;
    setThinking('Reading the change…');
    let planned: Awaited<ReturnType<typeof planChange>>;
    try {
      planned = await planChange(words, cur, {
        board: board.id,
        dir: dirNow(),
        asked,
        recent: recentRef.current,
        concepts: refs,
        projectId: props.projectId,
        signal: ac.signal,
        onProgress: (p) => (p.phase === 'thinking' ? setThinking('Thinking it through…') : p.phase === 'writing' ? setThinking('Deciding what changes…') : undefined),
      });
    } finally {
      planning.current = null;
      setThinking('');
    }
    if (planned.cancelled) return tell('ok', 'Stopped. Nothing changed.');
    if (!planned.plan) {
      // nothing in the words to act on: one question whose answers get somewhere (never an internal limitation)
      return askQuestion({
        text: `I want to get “${words.slice(0, 80)}” right — which is closest to what you mean?`,
        options: [
          { label: 'A theme (clouds, the ocean, space…)', words: 'give it a theme' },
          { label: 'More refined', words: 'make it more sophisticated' },
          { label: 'Bolder and more alive', words: 'make it more expressive and alive' },
          { label: 'A completely new idea', words: 'this feels too generic, try something more original' },
        ],
      });
    }
    runPlan(planned.plan, words);
  };
  // a change asked in the conversation beside the workspace, read as if typed here
  const inboxId = props.inbox?.id;
  useEffect(() => {
    if (props.inbox?.words) ask(props.inbox.words);
  }, [inboxId]); // eslint-disable-line react-hooks/exhaustive-deps
  /** A document made elsewhere (a change of style) shown as a preview, to apply or discard like a change in words. */
  const previewDoc = (next: GraphicDoc, label: string) => {
    const cur = docNow();
    setPending({ edit: { ops: [], next, label, scope: 'artboard' }, doc: next, base: cur });
    setNote(null);
  };
  /** The preview taken as it is, quietly: the change said next builds on it (undo takes each back in turn). */
  const takePending = () => {
    if (!live) return;
    const p = live;
    setPending(null);
    commitDoc(remember(p.doc, changedConcepts(p.base, p.doc), 'selected'), p.edit.label, { version: true });
  };
  const applyPending = () => {
    if (!live) return;
    const p = live;
    setPending(null);
    // a new concept applied is remembered as chosen (generative/memory.ts)
    commitDoc(remember(p.doc, changedConcepts(p.base, p.doc), 'selected'), p.edit.label, { version: true });
    setNote({ tone: 'ok', text: `Applied: ${p.edit.label}. Undo takes it back.` });
    setAskWords('');
  };
  const discardPending = () => {
    const cur = docNow();
    const turnedDown = live ? changedConcepts(live.base, live.doc) : [];
    setPending(null);
    if (!cur.artboards.some((b) => b.id === boardId)) setBoardId(cur.artboards[0].id);
    // a concept turned down is remembered, so the next rethink stays away from its structure
    if (turnedDown.length) commitDoc(remember(cur, turnedDown, 'rejected'), 'remembered: not like this', { version: false });
    setNote({ tone: 'ok', text: turnedDown.length ? 'Discarded: the design is as it was, and that concept is remembered as not wanted.' : 'Discarded: the design is as it was.' });
  };

  const adapt = (formatId: string) => {
    const cur = docNow();
    if (!board) return;
    const f = formatOf(formatId);
    const nb = adaptBoard(cur, board.id, formatId, props.direction ?? directionOfDoc(cur), { measure, kind: props.kind });
    if (!nb || !f) return setNote({ tone: 'warn', text: 'This artboard has no headline to carry over, so it cannot be adapted.' });
    onOps([{ op: 'artboard-add', artboard: nb, after: board.id }], `adapted to ${f.label}`);
  };

  const addPicture = async (f: File) => {
    if (!board) return;
    const asset = await props.upload(f);
    if (!asset) return;
    const k = Math.min((board.width * 0.6) / asset.width, (board.height * 0.6) / asset.height);
    const w = asset.width * k;
    const h = asset.height * k;
    const id = newId('n');
    onOps(
      [
        { op: 'asset', asset },
        { op: 'add', artboard: board.id, node: { id, type: 'image', role: 'image', asset: asset.id, fit: 'cover', x: (board.width - w) / 2, y: (board.height - h) / 2, w, h, rotation: 0, opacity: 1 } },
      ],
      'picture added',
    );
    setSelection([id]);
  };

  const fixAll = () => {
    const cur = docNow();
    const r = refineDoc(cur, measure);
    if (r.doc === cur || !r.fixed.length) return setNote({ tone: 'warn', text: 'Nothing could be fixed without taking something away. What is left is yours to decide.' });
    commitDoc(r.doc, 'checks fixed');
    setNote({ tone: 'ok', text: `Fixed: ${r.fixed.map((f) => f.replace(/\.$/, '')).join('; ')}.` });
  };

  // ── export ──
  const exportAs = async (kind: 'png' | 'png2' | 'png-clear' | 'jpeg' | 'svg' | 'pdf' | 'pdf-bleed' | 'zip' | 'native') => {
    const cur = docNow();
    if (!board) return;
    const base = slug(props.name || cur.name);
    setBusy('Exporting…');
    try {
      if (kind === 'native') {
        download(new Blob([nativeFile({ ...cur, name: props.name || cur.name })], { type: 'application/json' }), `${base}.socriaux.json`);
        setNote({ tone: 'ok', text: 'The design file is downloaded: open it here again with “Open a design file”. Pictures from this browser go in it only by reference.' });
      } else if (kind === 'svg') {
        const assets = await embeddedAssets(cur, props.resolve);
        const text = svgFile(cur, board, { measure, href: (id, src) => assets.map.get(id) ?? src, linkFonts: true });
        download(new Blob([text], { type: 'image/svg+xml' }), `${base}-${slug(board.name)}.svg`);
        setNote({ tone: assets.missing.length ? 'warn' : 'ok', text: `SVG downloaded: text kept as text, its faces linked from Google Fonts.${assets.missing.length ? ` Left out (could not be read): ${assets.missing.join(', ')}.` : ''}` });
      } else if (kind === 'pdf' || kind === 'pdf-bleed') {
        const r = await exportPdf(cur, cur.artboards, { bleed: kind === 'pdf-bleed', measure, resolve: props.resolve });
        download(r.blob, `${base}.pdf`);
        setNote({ tone: r.fontsSubstituted || r.missing.length ? 'warn' : 'ok', text: `PDF downloaded: ${cur.artboards.length} page${cur.artboards.length === 1 ? '' : 's'} at their exact sizes${kind === 'pdf-bleed' ? ', with bleed and trim boxes' : ''}. Each page is a high-resolution RGB picture: the text is not selectable, and it is not a CMYK print file.${r.fontsSubstituted ? ' A fallback face stood in for a typeface that could not be fetched.' : ''}${r.missing.length ? ` Left out: ${r.missing.join(', ')}.` : ''}` });
      } else if (kind === 'zip') {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        let subs = false;
        for (const b of cur.artboards) {
          const r = await exportBoardImage(cur, b, { type: 'image/png', measure, resolve: props.resolve });
          subs ||= r.fontsSubstituted;
          zip.file(`${slug(b.name)}-${r.w}x${r.h}.png`, r.blob);
        }
        download(await zip.generateAsync({ type: 'blob' }), `${base}-artboards.zip`);
        setNote({ tone: subs ? 'warn' : 'ok', text: `${cur.artboards.length} artboards downloaded as PNG files in one .zip.${subs ? ' A fallback face stood in for a typeface that could not be fetched.' : ''}` });
      } else {
        const type = kind === 'jpeg' ? 'image/jpeg' : 'image/png';
        const r = await exportBoardImage(cur, board, { type, scale: kind === 'png2' ? 2 : 1, transparent: kind === 'png-clear', measure, resolve: props.resolve });
        download(r.blob, `${base}-${slug(board.name)}${kind === 'png2' ? '@2x' : ''}.${kind === 'jpeg' ? 'jpg' : 'png'}`);
        setNote({
          tone: r.fontsSubstituted || r.missing.length ? 'warn' : 'ok',
          text: `${kind === 'jpeg' ? 'JPEG' : 'PNG'} downloaded: ${r.w} × ${r.h} px${board.unit === 'pt' ? ` (${board.dpi} dpi)` : ''}${kind === 'png-clear' ? ', with a transparent ground' : ''}.${r.fontsSubstituted ? ' A fallback face stood in for a typeface that could not be fetched.' : ''}${r.missing.length ? ` Left out: ${r.missing.join(', ')}.` : ''}`,
        });
      }
    } catch (e) {
      setNote({ tone: 'warn', text: `The export did not finish: ${(e as Error).message || 'the browser refused it'}. The design is unchanged.` });
    } finally {
      setBusy('');
    }
  };

  const openFile = async (f: File) => {
    if (f.size > 30_000_000) return setNote({ tone: 'warn', text: 'That file is larger than 30 MB: not a SocriaUX design file.' });
    const r = openNativeFile(await f.text());
    if (!r) return setNote({ tone: 'warn', text: `“${f.name}” is not a SocriaUX graphic, or it is damaged. Nothing was changed.` });
    commitDoc(r.doc, `opened ${f.name}`, { version: true });
    setBoardId(r.doc.artboards[0].id);
    setSelection([]);
    setNote({ tone: r.notes.length ? 'warn' : 'ok', text: `Opened “${f.name}”.${r.notes.length ? ` ${r.notes.slice(0, 3).join(' ')}` : ''}` });
  };

  // ── keyboard ──
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e: KeyboardEvent) => {
    if (!board) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input,textarea,select,[contenteditable]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') return e.preventDefault(), e.shiftKey ? redo() : undo();
    if (mod && k === 'y') return e.preventDefault(), redo();
    if (mod && k === '0') return e.preventDefault(), zoomRef.current?.fit();
    if (mod && (k === '=' || k === '+')) return e.preventDefault(), zoomRef.current?.zoomBy(1.2);
    if (mod && k === '-') return e.preventDefault(), zoomRef.current?.zoomBy(1 / 1.2);
    if (mod && k === 'a') return e.preventDefault(), setSelection(board.children.filter((n) => !n.hidden).map((n) => n.id));
    if (e.key === 'Escape') return live ? discardPending() : setSelection([]);
    if (mod && k === 'v' && clipboard.current.length) {
      e.preventDefault();
      return onOps(clipboard.current.map((n) => ({ op: 'add', artboard: board.id, node: { ...JSON.parse(JSON.stringify(n)), x: n.x + 24, y: n.y + 24, locked: undefined } }) as Op), 'pasted');
    }
    if (!selection.length) return;
    const sel = selection.map((id) => locate(doc, id)).filter((l): l is Located => !!l);
    const ids = sel.map((l) => l.node.id);
    if (e.key === 'Delete' || e.key === 'Backspace') return e.preventDefault(), onOps(ids.map((id) => ({ op: 'remove', id }) as Op), ids.length > 1 ? `${ids.length} objects deleted` : 'deleted');
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      return onOps(ids.map((id) => ({ op: 'move', id, dx, dy }) as Op), 'nudged');
    }
    if (mod && k === 'd') return e.preventDefault(), onOps(ids.map((id) => ({ op: 'duplicate', id }) as Op), 'duplicated');
    if (mod && k === 'g') {
      e.preventDefault();
      if (e.shiftKey) return onOps(sel.filter((l) => l.node.type === 'group').map((l) => ({ op: 'ungroup', id: l.node.id }) as Op), 'ungrouped');
      if (ids.length > 1) return onOps([{ op: 'group', ids }], 'grouped');
      return;
    }
    if (mod && k === 'c') {
      clipboard.current = sel.map((l) => JSON.parse(JSON.stringify(l.node)) as Node);
      return setNote({ tone: 'ok', text: `Copied ${ids.length > 1 ? `${ids.length} objects` : nodeLabel(sel[0].node)}: paste with ⌘V / Ctrl+V.` });
    }
    if (e.key === ']' || e.key === '[') {
      const l = sel[0];
      return onOps([{ op: 'reorder', id: l.node.id, to: l.index + (e.key === ']' ? 1 : -1) }], e.key === ']' ? 'brought forward' : 'sent backward');
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const selected = useMemo(() => selection.map((id) => locate(doc, id)).filter((l): l is Located => !!l), [doc, selection]);
  const findings = useMemo(() => (board ? checkDoc(given, measure).filter((f) => f.artboard === board.id) : []), [given, measure, board]);
  const printBleed = doc.artboards.some((b) => b.unit === 'pt' && b.bleed > 0);
  if (!board) return null;
  const tabs: [Tab, string][] = [
    ...(board.logo ? ([['logo', 'Logo']] as [Tab, string][]) : []),
    ['layers', 'Layers'],
    ['concept', 'Concept'],
    ['boards', 'Artboards'],
    ['add', 'Add'],
    ['shapes', 'Shapes'],
    ['pictures', 'Pictures'],
    ['styles', 'Styles'],
    ['brand', 'Brand'],
    ...(props.versions ? ([['versions', 'Versions']] as [Tab, string][]) : []),
  ];

  const focus = !!props.focus;
  return (
    <div className={`gx-ws${focus ? ' is-focus' : ''}${focus && !selection.length && !pathEdit ? ' no-right' : ''}`}>
      <aside className="gx-left" aria-label="Layers, artboards and adding" hidden={focus}>
        <nav className="gx-tabs" role="tablist" aria-label="Panels">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`gx-tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="gx-left-body" role="tabpanel">
          {tab === 'logo' && board.logo && <LogoTab doc={doc} board={board} measure={measure} onDoc={(next, label) => commitDoc(next, label, { version: true })} onMakeBoard={props.onMakeBoard} />}
          {tab === 'logo' && !board.logo && <p className="v0-quiet">This artboard is not a logo. Pick the logo artboard in Artboards.</p>}
          {tab === 'layers' && <LayersPanel board={board} selection={selection} onSelect={setSelection} onOps={onOps} />}
          {tab === 'boards' && <ArtboardsPanel doc={doc} boardId={board.id} onPick={(id) => (setBoardId(id), setSelection([]))} onOps={onOps} onAdapt={adapt} />}
          {tab === 'add' && <AddPanel board={board} form={props.direction?.form ?? null} doc={doc} onOps={onOps} onUpload={addPicture} />}
          {tab === 'shapes' && <ShapeLibrary board={board} doc={doc} onOps={onOps} onNote={(text) => setNote({ tone: 'warn', text })} />}
          {tab === 'pictures' && (
            <section className="gx-panel" aria-label="Pictures">
              <p className="gx-panel-h">Pictures in this design</p>
              {!doc.assets.length && <p className="v0-quiet">None yet. Add one from “Add”, or below.</p>}
              <ul className="gx-pic-list is-small">
                {doc.assets.map((a) => {
                  const sel = selected[0]?.node.type === 'image' ? selected[0] : null;
                  return (
                    <li key={a.id}>
                      <img src={href(a.id, a.src)} alt={a.name} />
                      <span>
                        {a.name}
                        <em className="v0-quiet">{props.missingUploads.includes(a.src) ? 'Not in this browser: it was added on another device. Add it again here.' : a.credit ?? a.source}</em>
                      </span>
                      {sel ? (
                        <button type="button" className="sb-link is-meta" onClick={() => onOps([{ op: 'update', id: sel.node.id, set: { asset: a.id } }], 'picture replaced')}>
                          Use in the selected picture
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="sb-link is-meta"
                          onClick={() => {
                            const k = Math.min((board.width * 0.6) / a.width, (board.height * 0.6) / a.height);
                            const id = newId('n');
                            onOps([{ op: 'add', artboard: board.id, node: { id, type: 'image', role: 'image', asset: a.id, fit: 'cover', x: (board.width - a.width * k) / 2, y: (board.height - a.height * k) / 2, w: a.width * k, h: a.height * k, rotation: 0, opacity: 1 } }], 'picture placed');
                            setSelection([id]);
                          }}
                        >
                          Place on the artboard
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <label className="sb-btn is-sm gx-file">
                Add a picture
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => (e.target.files?.[0] && void addPicture(e.target.files[0]), (e.target.value = ''))} />
              </label>
            </section>
          )}
          {tab === 'styles' && (
            <StylePanel doc={doc} board={board} dir={props.direction ?? directionOfDoc(doc)} kind={props.kind} measure={measure} href={href} onPreview={previewDoc} onOps={onOps} onNote={(text, tone) => setNote({ tone: tone ?? 'warn', text })} onExplore={(query) => setExplorer({ open: true, query })} />
          )}
          {tab === 'concept' && (
            <ConceptPanel
              doc={doc}
              board={board}
              dir={props.direction ?? null}
              waiting={!!pending || !!thinking}
              onAsk={(w) => void ask(w)}
              onPlan={runPlan}
              onKeep={() => conceptMove({ decision: 'concept', action: 'save' }, 'keep this concept')}
              onDuplicate={() => conceptMove({ decision: 'concept', action: 'duplicate' }, 'explore a copy')}
              onCompare={() => setCompare((c) => !c)}
              onRevisit={(id) => conceptMove({ decision: 'concept', action: 'revisit', ref: id }, 'go back to it')}
              onForget={(id) => {
                const c = (docNow().concepts ?? []).find((x) => x.id === id);
                onOps([forgetConcept(docNow(), id)], `let go of “${c?.name ?? 'a concept'}”`);
                setNote({ tone: 'ok', text: `Let go of “${c?.name ?? 'that concept'}”. Undo brings it back.` });
              }}
              extra={
                <>
                  <p className="gx-panel-sub">Composition moves</p>
                  <div className="gx-concept-acts">
                    {CREATIVE_ACTIONS.filter(([, , needsPicture]) => !needsPicture || doc.assets.length > 0).map(([label, words]) => (
                      <button key={label} type="button" className="sb-btn is-sm" onClick={() => void ask(words)} disabled={!!pending || !!thinking} title={words}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="v0-quiet">Each is shown first; apply or discard it. The words, pictures, style and anything locked are kept.</p>
                </>
              }
            />
          )}
          {tab === 'brand' && (
            <section className="gx-panel" aria-label="Brand">
              <p className="gx-panel-h">{props.brand?.title ?? props.direction?.name ?? doc.direction?.name ?? 'This design'}</p>
              {props.brand?.note}
              <p className="gx-panel-sub">Colours {selected.length ? '(click one to apply it to the selection)' : '(click one to make it the ground)'}</p>
              <div className="gx-palette">
                {Object.entries(doc.tokens.colors).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    className="gx-swatch"
                    style={{ background: v }}
                    title={`${k} ${v}`}
                    aria-label={`${k} ${v}`}
                    onClick={() => {
                      if (!selected.length) return onOps([{ op: 'artboard-update', id: board.id, set: { background: v } }], `ground in ${k}`);
                      onOps(selected.map((l) => ({ op: 'update', id: l.node.id, set: l.node.type === 'text' || l.node.type === 'chart' ? { color: v } : l.node.type === 'shape' && l.node.shape === 'line' ? { stroke: { ...(l.node.stroke ?? { width: 2 }), color: v } } : { fill: v } }) as Op), `${k} applied`);
                    }}
                  />
                ))}
              </div>
              <p className="gx-panel-sub">Typefaces</p>
              <p>
                {doc.tokens.fonts.display} <span className="v0-quiet">display</span> · {doc.tokens.fonts.body} <span className="v0-quiet">text</span>
              </p>
              <p className="gx-panel-sub">Held for the whole design</p>
              <label className="gx-check">
                <input type="checkbox" checked={!!doc.locks?.colors} onChange={(e) => onOps([{ op: 'locks', colors: e.target.checked }], e.target.checked ? 'colours locked' : 'colours unlocked')} /> Lock the colours
              </label>
              <label className="gx-check">
                <input type="checkbox" checked={!!doc.locks?.fonts} onChange={(e) => onOps([{ op: 'locks', fonts: e.target.checked }], e.target.checked ? 'typefaces locked' : 'typefaces unlocked')} /> Lock the typefaces
              </label>
              <p className="v0-quiet">A change by hand or in words that would alter something locked is refused and said, never applied in part.</p>
              {!!props.planNotes?.length && (
                <details className="gx-why" open>
                  <summary>Why it is composed this way</summary>
                  <ul>
                    {props.planNotes.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
          {tab === 'versions' && props.versions && (
            <section className="gx-panel" aria-label="Versions">
              <p className="gx-panel-h">Versions</p>
              <button type="button" className="sb-btn is-sm" onClick={() => props.onKeepVersion?.(docNow())}>
                Keep this as a version
              </button>
              <ol className="gx-versions" reversed>
                {props.versions
                  .map((v, i) => ({ v, i }))
                  .reverse()
                  .map(({ v, i }) => (
                    <li key={`${v.at}-${i}`}>
                      <span>
                        <b>{v.label}</b>
                        <em className="v0-quiet">
                          {new Date(v.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {v.doc.artboards.length} artboard{v.doc.artboards.length === 1 ? '' : 's'}
                        </em>
                      </span>
                      <button type="button" className="sb-link is-meta" onClick={() => (commitDoc(v.doc, `restored “${v.label}”`), setNote({ tone: 'ok', text: `Restored “${v.label}”. Undo goes back.` }))}>
                        Restore
                      </button>
                    </li>
                  ))}
              </ol>
              <p className="v0-quiet">The last {MAX_GRAPHIC_VERSIONS} are kept with the project. Every change since opening can also be undone (⌘Z / Ctrl+Z).</p>
            </section>
          )}
        </div>
      </aside>

      <main className="gx-center">
        <div className="v0-toolbar gx-toolbar" role="toolbar" aria-label="Canvas">
          {props.toolbarStart}
          {props.onFocus && (
            <button type="button" className={`sb-btn is-sm${focus ? '' : ' is-quiet'} gx-focus-btn`} aria-pressed={!focus} onClick={() => props.onFocus?.(!focus)} title={focus ? 'Show the layers, the panels and the properties' : 'Put the panels away and keep the work in front'}>
              {focus ? 'Edit by hand' : 'Focus on the work'}
            </button>
          )}
          <span className="v0-zoom">
            <button type="button" className="sb-link is-meta" onClick={undo} disabled={!past.current.length} title="Undo (⌘Z)">
              Undo
            </button>
            <button type="button" className="sb-link is-meta" onClick={redo} disabled={!future.current.length} title="Redo (⇧⌘Z)">
              Redo
            </button>
          </span>
          <span className="v0-zoom">
            <button type="button" className="sb-link is-meta" onClick={() => zoomRef.current?.zoomBy(1 / 1.2)} aria-label="Zoom out">
              −
            </button>
            <button type="button" className="sb-link is-meta" onClick={() => zoomRef.current?.fit()} title="Fit (⌘0)">
              Fit
            </button>
            <button type="button" className="sb-link is-meta" onClick={() => zoomRef.current?.zoomBy(1.2)} aria-label="Zoom in">
              +
            </button>
          </span>
          <span className="sb-seg is-tight" role="group" aria-label="Canvas aids">
            {(
              [
                ['guides', 'Guides'],
                ['grid', 'Grid'],
                ['rulers', 'Rulers'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" className={`sb-seg-item${aids[k] ? ' is-on' : ''}`} aria-pressed={aids[k]} onClick={() => setAids((a) => ({ ...a, [k]: !a[k] }))}>
                {label}
              </button>
            ))}
          </span>
          <label className="gx-boardpick">
            <span className="v0-sr">Artboard</span>
            <select className="v0-select" value={board.id} onChange={(e) => (setBoardId(e.target.value), setSelection([]))}>
              {doc.artboards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {sizeLabel(b)}
                </option>
              ))}
            </select>
          </label>
          <details className="gx-export">
            <summary className="sb-btn is-sm is-primary">Export</summary>
            <div className="gx-export-menu" role="menu">
              <p className="gx-panel-sub">This artboard</p>
              <button type="button" role="menuitem" onClick={() => exportAs('png')}>
                PNG{board.unit === 'pt' ? ` at ${board.dpi} dpi` : ''}
              </button>
              {board.unit === 'px' && (
                <button type="button" role="menuitem" onClick={() => exportAs('png2')}>
                  PNG at 2×
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => exportAs('png-clear')}>
                PNG, transparent ground
              </button>
              <button type="button" role="menuitem" onClick={() => exportAs('jpeg')}>
                JPEG
              </button>
              <button type="button" role="menuitem" onClick={() => exportAs('svg')}>
                SVG (text kept as text)
              </button>
              <p className="gx-panel-sub">All {doc.artboards.length} artboards</p>
              <button type="button" role="menuitem" onClick={() => exportAs('pdf')}>
                PDF
              </button>
              {printBleed && (
                <button type="button" role="menuitem" onClick={() => exportAs('pdf-bleed')}>
                  PDF with bleed
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => exportAs('zip')}>
                PNG files (.zip)
              </button>
              <p className="gx-panel-sub">The design</p>
              <button type="button" role="menuitem" onClick={() => exportAs('native')}>
                Save the design file
              </button>
              {props.allowOpen && (
                <button type="button" role="menuitem" onClick={() => openInput.current?.click()}>
                  Open a design file…
                </button>
              )}
              <p className="v0-quiet gx-export-note">PDF pages are high-resolution RGB pictures at the exact page size: not selectable text, not CMYK.</p>
            </div>
          </details>
          {props.allowOpen && <input ref={openInput} type="file" accept=".json,application/json" hidden onChange={(e) => (e.target.files?.[0] && void openFile(e.target.files[0]), (e.target.value = ''))} />}
        </div>
        {busy && (
          <p className="gx-busy" role="status">
            {busy}
          </p>
        )}
        {props.missingUploads.some((m) => doc.assets.some((a) => a.src === m)) && (
          <p className="gx-missing" role="status">
            {props.missingUploads.filter((m) => doc.assets.some((a) => a.src === m)).length} picture(s) of this design are not in this browser (they were added on another device): they are left blank, and named in Pictures.
          </p>
        )}
        <StyleExplorer
          key={explorer.query ?? ''}
          open={explorer.open}
          initialQuery={explorer.query}
          onClose={() => setExplorer({ open: false })}
          doc={given}
          board={given.artboards.find((b) => b.id === board.id) ?? given.artboards[0]}
          dir={props.direction ?? directionOfDoc(given)}
          kind={props.kind}
          measure={measure}
          href={href}
          onPreview={previewDoc}
          onOps={onOps}
          onNote={(text, tone) => setNote({ tone: tone ?? 'warn', text })}
        />
        <div className={`gx-stage${live ? ' is-preview' : ''}`}>
          <GraphicCanvas doc={doc} boardId={board.id} selection={selection} measure={measure} href={href} onSelect={(ids) => (setSelection(ids), pathEdit && !ids.includes(pathEdit) && setPathEdit(null))} onCommit={onOps} onEditText={() => window.setTimeout(() => textRef.current?.focus(), 30)} zoomRef={zoomRef} guides={aids.guides} grid={aids.grid} rulers={aids.rulers} pathEdit={pathEdit} onPathEdit={setPathEdit} />
          {pathEdit && (
            <p className="gx-pathtag" role="status">
              Editing nodes: drag a node or a handle; Alt-click a node for smooth or corner; double-click the path to add a node; Delete removes one.{' '}
              <button type="button" className="sb-btn is-sm" onClick={() => setPathEdit(null)}>
                Done
              </button>
            </p>
          )}
          {live && <span className="gx-preview-tag">Preview</span>}
          {compare && (
            <ConceptCompare
              doc={doc}
              board={board}
              measure={measure}
              href={href}
              waiting={!!pending || !!thinking}
              onClose={() => setCompare(false)}
              onRevisit={(id) => (setCompare(false), conceptMove({ decision: 'concept', action: 'revisit', ref: id }, 'go back to it'))}
              onTake={(plan, words) => (setCompare(false), runPlan(plan, words))}
              onShow={(id) => (setCompare(false), setBoardId(id))}
            />
          )}
        </div>
        {(!props.hideAsk || live || note || thinking) && (
        <div className={`gx-askbar${props.hideAsk ? ' is-quiet' : ''}`}>
          {live && (
            <div className="gx-pending" role="status">
              <span>
                <b>Preview:</b> {live.edit.label} <span className="v0-quiet">({live.edit.scope === 'selection' ? 'the selection' : live.edit.scope === 'object' ? 'one object' : live.edit.scope === 'artboard' ? 'this artboard' : 'the whole design'})</span>
              </span>
              <button type="button" className="sb-btn is-sm is-primary" onClick={applyPending}>
                Apply
              </button>
              <button type="button" className="sb-btn is-sm" onClick={discardPending}>
                Discard
              </button>
            </div>
          )}
          {!props.hideAsk && (
            <form
              className="gx-ask"
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
            >
              <label htmlFor="gx-ask-in" className="v0-sr">
                Ask for a change
              </label>
              <input
                id="gx-ask-in"
                value={askWords}
                onChange={(e) => setAskWords(e.target.value)}
                placeholder={live ? 'Keep going: the next change builds on this preview — or “no, …” turns it down' : selection.length ? `Change ${selection.length > 1 ? 'the selection' : nodeLabel(selected[0]?.node ?? doc.artboards[0].children[0])}: “make it bigger”, “move it beneath the title”, “#c2410c”…` : 'Say any change: “make it cloud themed”, “more editorial”, “keep the type, change the background”, “make the headline bigger”…'}
                autoComplete="off"
              />
              <button type="submit" className="sb-btn is-sm is-primary" disabled={!askWords.trim()}>
                Preview
              </button>
            </form>
          )}
          {thinking && (
            <p className="gx-thinking" role="status">
              <span>{thinking}</span>
              <button type="button" className="sb-link is-meta" onClick={() => planning.current?.abort()}>
                Cancel
              </button>
            </p>
          )}
          {note && (
            <p className={`gx-note is-${note.tone}`} role={note.tone === 'warn' ? 'alert' : 'status'}>
              {note.text}
            </p>
          )}
          {note?.options?.length ? (
            <div className="gx-note-opts" role="group" aria-label="Ways to answer">
              {note.options.map((o) => (
                <button key={o.label} type="button" className="gx-move" onClick={() => void ask(o.words)} disabled={!!thinking}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        )}
      </main>

      <aside className="gx-right" aria-label="Properties" hidden={focus && !selection.length && !pathEdit}>
        <Inspector doc={doc} board={board} selected={selected} findings={findings} onOps={onOps} onFix={(f) => f.fix && onOps(f.fix, `fixed: ${f.message}`)} onFixAll={fixAll} textRef={textRef} />
        <CeilingInspector doc={doc} board={board} selected={selected} onOps={onOps} measure={measure} onPathEdit={(id) => (id && setSelection([id]), setPathEdit(id))} />
        {props.kindLabel && (
          <p className="v0-quiet gx-kindline">
            {props.kindLabel} · {doc.artboards.length} artboard{doc.artboards.length === 1 ? '' : 's'}
          </p>
        )}
        {props.inspectorExtra}
      </aside>
    </div>
  );
}
