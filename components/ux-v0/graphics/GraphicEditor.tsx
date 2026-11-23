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
import { applyOps, boardTokens, boardView, fromBoardView, locate, newId, withOwnTokens, type Artboard, type Asset, type DocComment, type GraphicDoc, type Located, type Node, type Op } from '@/lib/ux-v0/graphics/doc';
import { readScoped } from '@/lib/ux-v0/graphics/creative/scoped';
import { applyControl, controlsFor, type CreativeControl } from '@/lib/ux-v0/graphics/creative/controls';
import { reviewAndRepair, reviewBoard, saidOf } from './visualReview';
import { weaknesses } from '@/lib/ux-v0/graphics/creative/improve';
import type { Op as DocOp } from '@/lib/ux-v0/graphics/doc';
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
import { browserBench, directorReachable, httpTransport } from './director';
import { editFlow, saidOfEdit } from '@/lib/ux-v0/graphics/director/flow';
import { diffBoards, recordTurn } from '@/lib/ux-v0/graphics/director/journal';
import { protectionsIn } from '@/lib/ux-v0/graphics/director/protect';
import { editTier } from '@/lib/ux-v0/graphics/director/tier';
import { readCreative } from '@/lib/ux-v0/graphics/creative/interpret';
import { conceptRef, executePlan } from '@/lib/ux-v0/graphics/creative/execute';
import { conceptRefs, forgetConcept, revisitConcept, saveConcept } from '@/lib/ux-v0/graphics/creative/concepts';
import type { Change, CreativePlan, PlanQuestion } from '@/lib/ux-v0/graphics/creative/plan';
import { readSynthesis, synthesize, type SynthesisPlan } from '@/lib/ux-v0/graphics/creative/synthesis';
import { readAlternatives, type AlternativeAsk } from '@/lib/ux-v0/graphics/creative/alternatives';
import { answerOf } from '@/lib/ux-v0/graphics/creative/interpret';

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

type Tab = 'logo' | 'layers' | 'concept' | 'comments' | 'boards' | 'add' | 'shapes' | 'pictures' | 'styles' | 'brand' | 'versions';
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
  /** every logo concept side by side, to compare, combine or set aside (offered in the Logo tab when given) */
  onLogoConcepts?: () => void;
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
  /** alternatives in other directions, composed from the brief (each an artboard with its own colours and faces, in
   * the format given); without it, "something completely different" is made from the design in front */
  onAlternatives?: (count: number, opts: { avoid: readonly string[]; said: string; format?: string }) => Promise<Artboard[] | null>;
  /** "make this fit our brand": the design system named, or linked, applied by the workspace (what it did, said; or a
   * question when there are several to choose from) */
  onBrand?: (words: string) => Promise<{ said: string; question?: PlanQuestion } | null>;
  /** what a creative change is read against beyond the design: the brief, references chosen */
  memory?: { brief?: string; references?: readonly string[] };
}

/** Words that ask for the design to fit a brand the person has (a design system in their library), not a look. */
export const BRAND_INTENT = /\b(fit|match|follow|use|apply|put (it|this) in|align (it |this )?with|bring (it|this) in line with|make (it|this) (fit|match|consistent with)|stick to|respect)\b[^.]*\b(our|my|the company'?s|the client'?s|the)\s+(brand( guidelines| system| colou?rs| identity)?|design system|guidelines|style ?guide)\b(?!\s+(name|mark|logo|wordmark))|\bon[- ]brand\b|\bin (our|my) brand\b/i;

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
  // a change previewed: `turn` is what was asked and what it did, for the artboard's journal when it is applied or turned down
  const [pending, setPending] = useState<{ edit: GraphicEdit; doc: GraphicDoc; base: GraphicDoc; turn?: { said: string; did: string; level?: string; recorded?: boolean } } | null>(null);
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
    // an artboard with a visual language of its own is changed in it (its colours and faces, not the document's)
    const view = boardView(cur, board.id);
    const r = applyOps(view, ops);
    if (!r.ok) {
      setNote({ tone: 'warn', text: `Nothing changed: ${r.error}${r.locked?.length ? ' Unlock it first (Layers), or change something else.' : ''}` });
      return;
    }
    commitDoc(fromBoardView(cur, r.doc, board.id), label);
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
  /** The direction an artboard is drawn in: its own when it was made in another direction (its colours and faces). */
  const dirFor = (id: string): GraphicDirection => {
    const base = dirNow();
    const b = docNow().artboards.find((x) => x.id === id);
    if (!b?.tokens) return base;
    return { ...base, name: b.direction?.name || base.name, language: b.direction?.language || base.language, tokens: b.tokens, form: null, style: undefined };
  };

  // ── comments pinned on objects ──
  // Select objects and comment on them: the comment is pinned there (kept with the design), and when it is applied it
  // changes those objects alone — what the precise reader knows first (bigger, bolder, red, centred, these words), then
  // the qualities and colour moves it names (creative/scoped.ts). Kept for later, it waits in Comments until applied or
  // set aside; applied, it is previewed like any change and marked done with what was done.
  const [commenting, setCommenting] = useState<string[] | null>(null);
  const [commentWords, setCommentWords] = useState('');
  const nameOf = (ids: readonly string[], d: GraphicDoc = docNow()) => {
    const names = ids.map((id) => locate(d, id)).filter((l): l is Located => !!l).map((l) => nodeLabel(l.node).toLowerCase());
    return names.length ? (names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')) : 'objects no longer there';
  };
  const setComments = (list: DocComment[], label: string) => onOps([{ op: 'comments', comments: list }], label);
  /** A comment carried out on its objects alone, previewed (the comment marked done with the change). */
  const applyComment = (c: DocComment) => {
    const cur = docNow();
    const n = (cur.comments ?? []).filter((x) => x.board === c.board).findIndex((x) => x.id === c.id) + 1;
    const nodes = c.nodes.filter((id) => !!locate(cur, id));
    if (!nodes.length) return tell('warn', `The objects comment ${n} was about are no longer there. Set it aside, or say what should change in words.`);
    if (c.board !== board.id) setBoardId(c.board);
    setSelection(nodes);
    const view = boardView(cur, c.board);
    let next: GraphicDoc | null = null;
    let label = '';
    const e = readGraphicEdit(c.text, view, { artboard: c.board, selection: nodes, dir: dirFor(c.board), measure, kind: props.kind, customs: library.styles });
    if (e && !e.question && (e.scope === 'selection' || e.scope === 'object')) {
      if (e.next) next = fromBoardView(cur, e.next, c.board);
      else {
        const r = applyOps(view, e.ops);
        if (r.ok) next = fromBoardView(cur, r.doc, c.board);
      }
      label = e.label;
    }
    if (!next) {
      const sc = readScoped(c.text, view, c.board, nodes, measure);
      if (sc) {
        const r = applyOps(view, sc.ops);
        if (r.ok) {
          next = fromBoardView(cur, r.doc, c.board);
          label = sc.label;
        }
      }
    }
    if (!next) return tell('ask', `I could not tell what to change about the ${nameOf(nodes, cur)} from “${c.text.slice(0, 80)}”. Say what it should become — “larger”, “in the accent colour”, “in capitals”, “warmer”, “more premium”, “move it to the top” — and apply it again.`);
    const list = (next.comments ?? cur.comments ?? []).map((x) => (x.id === c.id ? { ...x, status: 'done' as const, said: label.slice(0, 300) } : x));
    const marked = applyOps(next, [{ op: 'comments', comments: list }]);
    const doc2 = marked.ok ? marked.doc : next;
    setPending({ edit: { ops: [], next: doc2, label: `comment ${n}: ${label}`, scope: 'selection' }, doc: doc2, base: cur });
    recentRef.current = [...recentRef.current, { said: c.text, did: label }].slice(-6);
    tell('ok', `Comment ${n}: ${label}. Only the ${nameOf(nodes, cur)} changed.`);
  };
  /** The comment being written: kept on the selection, and applied at once when asked. */
  const submitComment = (now: boolean) => {
    const text = commentWords.trim();
    const nodes = commenting ?? [];
    if (!text || !nodes.length) return;
    const c: DocComment = { id: newId('cm'), board: board.id, nodes, text: text.slice(0, 400), at: Date.now(), status: 'open' };
    setComments([...(docNow().comments ?? []), c], 'comment added');
    setCommenting(null);
    setCommentWords('');
    if (now) applyComment(c);
    else {
      setTab('comments');
      tell('ok', `Kept as a comment on the ${nameOf(nodes)}. Apply it from Comments when you are ready.`);
    }
  };

  // ── creative controls made for this design (creative/controls.ts) ──
  // Moved, a control previews at once; let go, it is applied as one step (undo takes it back), and the words can carry
  // on from there. Each reads its value from the design, so it always tells the truth; reset puts back the value it had
  // when it was first moved.
  const [tuning, setTuning] = useState(false);
  const [sliding, setSliding] = useState<{ id: string; value: number } | null>(null);
  const ctlOrig = useRef<Record<string, Record<string, number>>>({});
  const ctlRaf = useRef(0);
  const moveControl = (c: CreativeControl, value: number, commit: boolean) => {
    const base = docNow();
    const id = board.id;
    const orig = (ctlOrig.current[id] ??= {});
    if (orig[c.id] === undefined) orig[c.id] = c.value;
    const run = () => {
      const r = applyControl(base, id, c.id, value, { dir: dirFor(id), kind: props.kind, measure: typeof document !== 'undefined' ? canvasMeasure() : measure });
      if (!r) {
        setPending(null);
        return tell('warn', `${c.label} could not be set on this artboard.`);
      }
      if (commit) {
        setPending(null);
        setSliding(null);
        commitDoc(r.doc, r.label);
        recentRef.current = [...recentRef.current, { said: `${c.label}: ${value}`, did: r.label }].slice(-6);
        tell('ok', `${r.label.replace(/^./, (x) => x.toUpperCase())}. Undo takes it back; say what else should change, or keep tuning.`);
      } else setPending({ edit: { ops: [], next: r.doc, label: r.label, scope: 'artboard' }, doc: r.doc, base });
    };
    cancelAnimationFrame(ctlRaf.current);
    if (commit || typeof window === 'undefined') return run();
    ctlRaf.current = requestAnimationFrame(run);
  };

  // ── the design looked at as rendered pixels (visualReview.ts; lib/ux-v0/graphics/visual.ts) ──
  /** A design reviewed from its pixels and repaired once if it must be; what was found, said briefly. */
  const lookAt = async (d: GraphicDoc, boardId: string): Promise<{ doc: GraphicDoc; said: string } | null> => {
    setThinking('Looking at the result…');
    try {
      const vr = await reviewAndRepair(d, boardId, { measure: canvasMeasure(), resolve: props.resolve, rounds: 1 });
      return vr ? { doc: vr.doc, said: saidOf(vr, { fixedLead: 'Repaired after looking' }) } : null;
    } finally {
      setThinking('');
    }
  };
  /** The last critique's repairs, to apply when asked ("fix them"). */
  const critiqueRef = useRef<{ board: string; ops: DocOp[]; fixChecks: boolean } | null>(null);
  /** A critique: the rendered pixels, the objects and the measures, each finding with what would answer it. */
  const critique = async () => {
    const cur = docNow();
    const id = board.id;
    setThinking('Looking at it…');
    let vr: Awaited<ReturnType<typeof reviewBoard>> = null;
    try {
      vr = await reviewBoard(cur, id, { measure: canvasMeasure(), resolve: props.resolve });
    } finally {
      setThinking('');
    }
    const view = boardView(cur, id);
    const checks = checkDoc({ ...view, artboards: view.artboards.filter((b) => b.id === id) }, canvasMeasure()).filter((f) => f.severity !== 'low');
    const weak = weaknesses(cur, id, 'quality', canvasMeasure()).filter((w) => w.key !== 'faults' && w.gain >= 10).slice(0, 2);
    const lines: string[] = [];
    // each thing said once (the same finding on several objects is one line)
    const add = (line: string) => {
      if (!lines.includes(line)) lines.push(line);
    };
    for (const f of vr?.report.findings ?? []) add(`${f.message}${f.fix ? ' (I can repair this.)' : ''}`);
    for (const f of checks.slice(0, 6)) add(`${f.message}${f.fix?.length ? ' (I can repair this.)' : ''}`);
    for (const w of weak) add(`${w.found.replace(/^./, (c) => c.toUpperCase())}.`);
    const ops = [...(vr ? vr.report.findings.filter((f) => f.fix).flatMap((f) => f.fix!) : [])];
    critiqueRef.current = { board: id, ops, fixChecks: checks.some((f) => f.fix?.length) };
    const head = vr ? `I rendered it and measured the pixels (${vr.report.size[0]}×${vr.report.size[1]}${vr.fontsSubstituted ? ', a stand-in face where one could not be fetched' : ''}), then checked the objects.` : 'I checked the objects (this browser could not render the pixels to look at).';
    const legible = vr?.report.measures.legibility ?? [];
    const summary = legible.length ? ` Every text was measured against what is beneath it: ${legible.filter((l) => l.ratio >= l.need).length} of ${legible.length} read clearly.` : '';
    if (!lines.length) return tell('ok', `${head}${summary} Nothing measures wrong — balance, room and contrast hold. Say how you would like it to change.`);
    const canFix = ops.length > 0 || critiqueRef.current.fixChecks;
    const text = `${head}${summary} ${lines.slice(0, 5).map((l, i) => `${i + 1}. ${l}`).join(' ')}`;
    if (!canFix && !weak.length) return tell('ok', text);
    askQuestion({ text, options: [...(canFix ? [{ label: 'Repair what can be repaired', words: 'apply the repairs' }] : []), ...weak.slice(0, 2).map((w) => ({ label: w.found.replace(/^./, (c) => c.toUpperCase()).slice(0, 70), words: w.change.decision === 'object' ? w.change.words : w.change.decision === 'composition' ? `make the composition ${w.change.action === 'airy' ? 'airier, with more space' : w.change.action === 'denser' ? 'fuller' : w.change.action}` : 'make it more interesting' })), { label: 'Make it more interesting', words: 'make it more interesting' }].slice(0, 4) });
  };
  /** The critique's repairs carried out (pixels first, then the checks' own), previewed. */
  const applyRepairs = async (): Promise<boolean> => {
    const c = critiqueRef.current;
    if (!c) return false;
    critiqueRef.current = null;
    const cur = docNow();
    let next = cur;
    const done: string[] = [];
    if (c.ops.length) {
      const view = boardView(cur, c.board);
      const r = applyOps(view, c.ops);
      if (r.ok) {
        next = fromBoardView(cur, r.doc, c.board);
        done.push('the words recoloured (or given a quiet panel) to read on what is really beneath them');
      }
    }
    if (c.fixChecks) {
      const view = boardView(next, c.board);
      const mine = view.artboards.find((b) => b.id === c.board);
      if (mine) {
        const fixed = refineDoc({ ...view, artboards: [mine] }, canvasMeasure());
        if (fixed.fixed.length && fixed.doc.artboards[0]) {
          next = fromBoardView(next, { ...view, artboards: view.artboards.map((b) => (b.id === c.board ? fixed.doc.artboards[0] : b)) }, c.board);
          done.push(...fixed.fixed.slice(0, 3).map((f) => f.replace(/\.$/, '').toLowerCase()));
        }
      }
    }
    if (next === cur) {
      tell('ok', 'There was nothing left to repair.');
      return true;
    }
    const looked = await lookAt(next, c.board);
    const shown = looked?.doc ?? next;
    setPending({ edit: { ops: [], next: shown, label: 'repairs from the review', scope: 'artboard' }, doc: shown, base: cur });
    tell('ok', `Repaired: ${done.join('; ')}.${looked ? ` ${looked.said}` : ''}`);
    return true;
  };

  /** The precise reader's change of one object, previewed (false when it reads nothing in the words). */
  const precise = (words: string): boolean => {
    const cur = docNow();
    // read and carried out as the artboard in front sees the design (its own colours and faces, when it has them)
    const view = boardView(cur, board.id);
    const e = readGraphicEdit(words, view, { artboard: board.id, selection, dir: dirFor(board.id), measure, kind: props.kind, customs: library.styles });
    if (!e) return false;
    if (e.question && !e.ops.length && !e.next) {
      tell('ask', e.question);
      return true;
    }
    let next: GraphicDoc | null = e.next ? fromBoardView(cur, e.next, board.id) : null;
    if (!next) {
      const r = applyOps(view, e.ops);
      if (!r.ok) {
        tell('warn', `Nothing changed: ${r.error}`);
        return true;
      }
      next = fromBoardView(cur, r.doc, board.id);
    }
    // a change that changes nothing is not one: the words go on to whoever can read them
    const same = next.artboards.length === cur.artboards.length && next.artboards.every((b, i) => b.id === cur.artboards[i].id && diffBoards(cur.artboards[i], b, cur.artboards[i].tokens ?? cur.tokens, b.tokens ?? next.tokens).none);
    if (same && !e.question) return false;
    setPending({ edit: e, doc: next, base: cur, turn: { said: words, did: e.label, level: 'object' } });
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
      if (props.onAlternatives) return void alternatives({ kind: 'directions', count: 3, summary: 'three new concepts from the brief, beside this one' }, words);
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
    const exec = (m: Measure) => executePlan(base, plan, { board: board.id, dir: dirFor(board.id), kind: props.kind, measure: m, concepts: conceptRefs(base, board.id), said: words, now });
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
    // the result looked at as rendered pixels before it is shown (what is really beneath the words), repaired if it must
    const looked = browser ? await lookAt(r.doc, board.id) : null;
    if (looked) r = { ...r, doc: looked.doc };
    setPending({ edit: { ops: [], next: r.doc, label: r.label || r.done[0], scope: 'artboard' }, doc: r.doc, base, turn: { said: words, did: r.done.join('; '), level: plan.intent } });
    recentRef.current = [...recentRef.current, { said: words, did: r.done.join('; ') }].slice(-6);
    // a vague improvement says what it measured first, then what it did about it
    const did = r.done.join('; ');
    const said = `${plan.reason ? `${plan.reason} So: ${did}` : did.replace(/^./, (x) => x.toUpperCase())}.${r.kept.length ? ` Kept: ${r.kept.join(', ')}.` : ''}${r.notes.length ? ` ${r.notes.join(' ')}` : ''}${looked?.said ? ` ${looked.said}` : ''}`;
    setAskWords('');
    if (plan.question) return askQuestion(plan.question, `${said} `);
    setNote({ tone: 'ok', text: said });
    props.onAsked?.(`Previewing: ${said} Apply or Discard it under the canvas.`);
  };

  /** Designs combined: the synthesis carried out and previewed (on a new artboard, shown in front). */
  const combine = async (plan: SynthesisPlan, words: string) => {
    const base = docNow();
    const here = board.id;
    const now = Date.now();
    const run = (m: Measure) => synthesize(base, plan, { current: here, measure: m, dir: dirFor(here), kind: props.kind, said: words, now });
    const browser = typeof document !== 'undefined';
    let r = run(browser ? canvasMeasure() : measure);
    if (r && browser) {
      const known = new Set(facesUsed(base).map(faceKey));
      const fresh = facesUsed(r.doc).filter((f) => !known.has(faceKey(f)));
      if (fresh.length) {
        setThinking('Setting the type…');
        try {
          if (await loadFaces(fresh)) r = run(canvasMeasure()) ?? r;
        } finally {
          setThinking('');
        }
      }
    }
    if (!r) return tell('warn', 'Those designs could not be combined: one of them is no longer there.');
    const looked = browser ? await lookAt(r.doc, r.board) : null;
    if (looked) r = { ...r, doc: looked.doc, notes: [...r.notes, looked.said] };
    setPending({ edit: { ops: [], next: r.doc, label: r.label, scope: 'artboard' }, doc: r.doc, base });
    if (r.created) setBoardId(r.board);
    recentRef.current = [...recentRef.current, { said: words, did: r.label }].slice(-6);
    const said = `${r.done.join('; ').replace(/^./, (x) => x.toUpperCase())}.${plan.measured ? ` Chosen by measure — ${plan.summary}.` : ''}${r.notes.length ? ` ${r.notes.join(' ')}` : ''}${r.created ? ' The designs it came from are unchanged.' : ''}`;
    setAskWords('');
    setNote({ tone: 'ok', text: said });
    props.onAsked?.(`Previewing: ${said} Apply or Discard it under the canvas.`);
  };

  /** Alternatives, each on an artboard of its own beside the one in front (which stays as it is), previewed. */
  const alternatives = async (alt: AlternativeAsk, words: string) => {
    const base = docNow();
    const from = board;
    const fresh = (d: GraphicDoc) => d.artboards.filter((b) => !base.artboards.some((x) => x.id === b.id));
    const show = (next: GraphicDoc, label: string, said: string) => {
      setPending({ edit: { ops: [], next, label, scope: 'artboard' }, doc: next, base });
      const made = fresh(next);
      if (made[0]) setBoardId(made[0].id);
      recentRef.current = [...recentRef.current, { said: words, did: label }].slice(-6);
      setAskWords('');
      setNote({ tone: 'ok', text: said });
      props.onAsked?.(`Previewing: ${said} Apply or Discard it under the canvas.`);
    };
    if (alt.kind === 'compositions') {
      if (precise(`show me ${alt.count} different compositions`)) return;
      return tell('warn', 'Other arrangements need an artboard composed by SocriaUX (with a headline) to start from.');
    }
    if (alt.kind === 'directions' && props.onAlternatives) {
      setThinking(alt.count > 1 ? `Composing ${alt.count} new directions…` : 'Composing a new direction…');
      let made: Artboard[] | null = null;
      try {
        const avoid = [...new Set([...base.artboards.map((b) => b.direction?.name ?? ''), base.direction?.name ?? '', props.direction?.name ?? ''].filter(Boolean))];
        made = await props.onAlternatives(alt.count, { avoid, said: words, format: from.format });
      } finally {
        setThinking('');
      }
      if (!made?.length) return tell('warn', 'No new direction could be composed for this brief. Say how it should feel instead, and ask again.');
      const r = applyOps(base, made.map((b) => ({ op: 'artboard-add', artboard: b }) as Op));
      if (!r.ok) return tell('warn', `Nothing changed: ${r.error}`);
      const names = fresh(r.doc).map((b) => `“${b.name}”`);
      return show(r.doc, alt.summary, `${names.join(', ')} — ${alt.summary}: ${names.length === 1 ? 'its own' : 'each with its own'} colours, type and composition. “${from.name}” is unchanged. Combine any of them in words (“the type of the first with the composition of the second”).`);
    }
    // the same look in another arrangement (or, with no brief to compose directions from, a bolder departure), on a copy
    const r0 = applyOps(base, [{ op: 'artboard-duplicate', id: from.id, name: `${from.name.slice(0, 40)} — ${alt.kind === 'same-look' ? 'rearranged' : 'another take'}` }]);
    if (!r0.ok) return tell('warn', `Nothing changed: ${r0.error}`);
    const id = r0.touched[0];
    const moved = applyOps(r0.doc, [{ op: 'artboard-reorder', id, to: r0.doc.artboards.length - 1 }]);
    const copy = withOwnTokens(moved.ok ? moved.doc : r0.doc, id, boardTokens(base, from));
    const plan: CreativePlan =
      alt.kind === 'same-look'
        ? { intent: 'composition', summary: alt.summary, keep: ['palette', 'type', 'forms', 'background', 'depth', 'words', 'logo', 'pictures'], changes: [{ decision: 'composition', action: 'rethink' }], by: 'reader' }
        : { intent: 'redesign', summary: alt.summary, keep: ['words', 'logo', 'pictures'], changes: [{ decision: 'composition', action: 'unexpected' }, { decision: 'mood', qualities: ['original'] }], by: 'reader' };
    const m = typeof document !== 'undefined' ? canvasMeasure() : measure;
    const e = executePlan(copy, plan, { board: id, dir: { ...dirFor(from.id), tokens: boardTokens(base, from) }, kind: props.kind, measure: m, concepts: conceptRefs(copy, id), said: words, now: Date.now() });
    if (!e || e.doc === copy || !e.done.length) return tell('warn', e?.notes.join(' ') || 'This artboard cannot be re-composed (it was not made by the composer, or has no headline).');
    show(e.doc, alt.summary, `${e.done.join('; ').replace(/^./, (x) => x.toUpperCase())} — ${alt.summary}. “${from.name}” is unchanged.${e.notes.length ? ` ${e.notes.join(' ')}` : ''}`);
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
    let asked = askedRef.current;
    askedRef.current = null;
    // a short answer to the question asked last ("the second", "2", a few of its words): the words it stands for
    const answer = asked ? answerOf(words, asked) : null;
    if (answer) {
      words = answer;
      asked = null;
    }
    // a critique of the design in front, and its repairs
    if (/^(please )?(critique|review|assess|evaluate|look at|check|judge)( it| this| the design| this design| my design)?( for me)?[.!?]*$|^what'?s wrong( with it| with this)?\??$|^(what do you think|how does it look|how'?s it looking|any (feedback|thoughts|notes))\??$|^(give me )?(feedback|a critique|notes)( on (it|this))?[.!?]*$/i.test(words)) {
      setAskWords('');
      return void critique();
    }
    if (critiqueRef.current && /^(apply|make|do)( the| those| these)? (repairs|fixes|changes)\b|^(fix|repair) (them|it|those|that|all|everything)\b|^yes,? (fix|repair)/i.test(words.trim())) {
      setAskWords('');
      return void applyRepairs();
    }
    // the person's own brand: their design system applied (the workspace knows which, and asks when it cannot tell)
    if (props.onBrand && BRAND_INTENT.test(words)) {
      setThinking('Fitting it to your brand…');
      let r: Awaited<ReturnType<NonNullable<typeof props.onBrand>>> = null;
      try {
        r = await props.onBrand(words);
      } finally {
        setThinking('');
      }
      if (r) {
        setAskWords('');
        return r.question ? askQuestion(r.question, `${r.said} `) : tell('ok', r.said);
      }
    }
    // designs combined ("the typography of the first with the composition of the second", "combine the best elements")
    const syn = readSynthesis(words, cur, board.id, measure);
    if (syn) {
      if ('question' in syn) return askQuestion(syn.question);
      if ('note' in syn) return tell('ask', syn.note);
      return void combine(syn.plan, words);
    }
    // alternatives, each on an artboard of its own ("try something completely different", "five different versions")
    const alt = readAlternatives(words);
    if (alt) return void alternatives(alt, words);
    const refs = conceptRefs(cur, board.id);
    const read = readCreative(words, { doc: cur, board: board.id, concepts: refs, asked });
    // a move on concepts themselves (keep this concept, compare, go back to concept 2, another interpretation) is the
    // workspace's own, read plainly
    if (read?.certain && read.plan.changes.length > 0 && read.plan.changes.every((c) => c.decision === 'concept')) return void runPlan(read.plan, words);
    // a design in a style: its own style speaks first for what only it does well — its gradients made flat everywhere,
    // its layout re-balanced in another style's composition (styles/edit.ts)
    const styleFirst = !!cur.style?.primary && /\b(remove|lose|drop|no|without|get rid of|kill)\b[^.]*\bgradients?\b|\bflat colou?rs?\b|\b(layout|composition|arrangement)\b[^.]*\b(a-?symmetric(al)?|symmetric(al)?|centred|centered|off-?cent(re|er))\b/i.test(words);
    // an exact change to something named ("make the headline smaller", "the background black"): read and carried out
    // in code, at once, with no model — when it is one instruction and it really changes the design
    const exact = editTier(words).tier === 'economy' && !protectionsIn(words).keep.length && !protectionsIn(words).only && !/[,;]|\band\b/i.test(words);
    if ((exact || styleFirst) && precise(words)) return;
    // everything else is read against the design by the creative director: what is meant, how far it reaches, what
    // must stay — then carried out by object id, checked, and previewed
    if (directorReachable()) {
      const ac = new AbortController();
      planning.current = ac;
      setThinking('Reading what you mean…');
      let r: Awaited<ReturnType<typeof editFlow>>;
      try {
        r = await editFlow(
          httpTransport({ projectId: props.projectId, signal: ac.signal, onProgress: (p) => (p.phase === 'thinking' ? setThinking('Thinking it through…') : p.phase === 'writing' ? setThinking('Working out the change…') : undefined) }),
          browserBench(props.resolve),
          cur,
          board.id,
          words,
          { kind: props.kind, memory: { ...(props.memory?.brief ? { brief: props.memory.brief } : {}), ...(props.memory?.references?.length ? { references: [...props.memory.references] } : {}), ...((cm) => (cm.length ? { comments: cm } : {}))((cur.comments ?? []).filter((c) => c.board === board.id && c.status === 'open').slice(-6).map((c) => c.text.slice(0, 200))) }, asked, selection },
        );
      } finally {
        planning.current = null;
        setThinking('');
      }
      if (r.kind === 'cancelled') return tell('ok', 'Stopped. Nothing changed.');
      if (r.kind === 'question') return askQuestion(r.question);
      if (r.kind === 'nothing') return tell('warn', saidOfEdit(r));
      if (r.kind === 'done') {
        // a change of feel or of the whole is looked at as rendered pixels before it is shown (what is really beneath
        // the words); an exact change is shown exactly as made
        const broad = ['aesthetic', 'conceptual', 'global'].includes(r.edit.understanding.level);
        const looked = broad && typeof document !== 'undefined' ? await lookAt(r.doc, board.id) : null;
        const next = looked ? looked.doc : r.doc;
        const said = saidOfEdit(r);
        setPending({ edit: { ops: [], next, label: (r.edit.summary || r.outcome.did).slice(0, 120), scope: 'artboard' }, doc: next, base: cur, turn: { said: words, did: r.edit.summary || r.outcome.did, level: r.edit.understanding.level, recorded: true } });
        recentRef.current = [...recentRef.current, { said: words, did: r.edit.summary || r.outcome.did }].slice(-6);
        setNote(null);
        props.onAsked?.(`${said} Previewing it: Apply or Discard under the canvas, or say what to change next.`);
        return;
      }
      // unreachable or unreadable: SocriaUX's own reader carries on below, and says it did
    }
    const creative = !!read && read.plan.changes.some((c) => c.decision !== 'object');
    if (!creative && precise(words)) return;
    if (!read?.plan) {
      // nothing in the words the reader can act on, and no director to ask: said plainly, with ways on
      return askQuestion({
        text: `I could not reach SocriaUX’s creative director just now, and on my own I can only read plainer instructions than “${words.slice(0, 80)}”. Try again in a moment, or say it one of these ways:`,
        options: [
          { label: 'A theme (clouds, the ocean, space…)', words: 'give it a theme' },
          { label: 'More refined', words: 'make it more sophisticated' },
          { label: 'Bolder and more alive', words: 'make it more expressive and alive' },
          { label: 'A completely new idea', words: 'this feels too generic, try something more original' },
        ],
      });
    }
    runPlan(read.plan, words);
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
  /** The change as it is kept: with its turn in the artboard's journal (what was asked, what it did, what it replaced). */
  const journaled = (p: NonNullable<typeof live>): GraphicDoc => (p.turn && !p.turn.recorded && p.doc.artboards.some((b) => b.id === boardId) && p.base.artboards.some((b) => b.id === boardId) ? recordTurn(p.base, p.doc, boardId, { said: p.turn.said, did: p.turn.did, level: p.turn.level }) : p.doc);
  const takePending = () => {
    if (!live) return;
    const p = live;
    setPending(null);
    commitDoc(remember(journaled(p), changedConcepts(p.base, p.doc), 'selected'), p.edit.label, { version: true });
  };
  const applyPending = () => {
    if (!live) return;
    const p = live;
    setPending(null);
    // a new concept applied is remembered as chosen (generative/memory.ts)
    commitDoc(remember(journaled(p), changedConcepts(p.base, p.doc), 'selected'), p.edit.label, { version: true });
    setNote({ tone: 'ok', text: `Applied: ${p.edit.label}. Undo takes it back.` });
    setAskWords('');
  };
  const discardPending = () => {
    const cur = docNow();
    const turnedDown = live ? changedConcepts(live.base, live.doc) : [];
    const turn = live?.turn;
    setPending(null);
    if (!cur.artboards.some((b) => b.id === boardId)) setBoardId(cur.artboards[0].id);
    // what was turned down is remembered with the artboard (the words and what was proposed), so it is not proposed
    // again; a concept turned down is remembered too, so the next rethink stays away from its structure
    const noted = turn && cur.artboards.some((b) => b.id === boardId) ? recordTurn(cur, cur, boardId, { said: turn.said, did: turn.did, level: turn.level, status: 'rejected' }) : cur;
    if (turnedDown.length || noted !== cur) commitDoc(turnedDown.length ? remember(noted, turnedDown, 'rejected') : noted, 'remembered: not like this', { version: false });
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
    ['comments', (doc.comments ?? []).some((c) => c.board === board.id && c.status === 'open') ? `Comments (${(doc.comments ?? []).filter((c) => c.board === board.id && c.status === 'open').length})` : 'Comments'],
    ['boards', 'Artboards'],
    ['add', 'Add'],
    ['shapes', 'Shapes'],
    ['pictures', 'Pictures'],
    ['styles', 'Styles'],
    ['brand', 'Brand'],
    ...(props.versions ? ([['versions', 'Versions']] as [Tab, string][]) : []),
  ];

  const focus = !!props.focus;
  // the controls this design calls for (read once a render, only while they are shown)
  const ctls = tuning ? controlsFor(doc, board.id) : [];
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
          {tab === 'logo' && board.logo && <LogoTab doc={doc} board={board} measure={measure} onDoc={(next, label) => commitDoc(next, label, { version: true })} onMakeBoard={props.onMakeBoard} onConcepts={props.onLogoConcepts} />}
          {tab === 'logo' && !board.logo && <p className="v0-quiet">This artboard is not a logo. Pick the logo artboard in Artboards.</p>}
          {tab === 'layers' && <LayersPanel board={board} selection={selection} onSelect={setSelection} onOps={onOps} />}
          {tab === 'comments' && (
            <section className="gx-panel" aria-label="Comments">
              <p className="gx-panel-h">Comments</p>
              <p className="v0-quiet">Select objects and press “Comment” beside them. A comment changes only what it is pinned to.</p>
              {selection.length > 0 && !commenting && (
                <button type="button" className="sb-btn is-sm" onClick={() => (setCommenting(selection.slice()), setCommentWords(''))}>
                  Comment on the {nameOf(selection, doc)}
                </button>
              )}
              {!(doc.comments ?? []).some((c) => c.board === board.id) && <p className="v0-quiet">No comments on this artboard yet.</p>}
              <ol className="gx-comments">
                {(doc.comments ?? [])
                  .filter((c) => c.board === board.id)
                  .map((c, i) => (
                    <li key={c.id} className={`gx-comment is-${c.status}`}>
                      <button type="button" className="gx-comment-n" onClick={() => setSelection(c.nodes.filter((id) => !!locate(doc, id)))} aria-label={`Select what comment ${i + 1} is on`}>
                        {i + 1}
                      </button>
                      <span className="gx-comment-body">
                        <span className="gx-comment-text">{c.text}</span>
                        <em className="v0-quiet">
                          On the {nameOf(c.nodes, doc)} · {c.status === 'done' ? `Done${c.said ? `: ${c.said}` : ''}` : c.status === 'dismissed' ? 'Set aside' : 'Open'}
                        </em>
                        <span className="gx-comment-acts">
                          {c.status === 'open' ? (
                            <>
                              <button type="button" className="sb-btn is-sm is-primary" disabled={!!pending || !!thinking} onClick={() => applyComment(c)}>
                                Apply
                              </button>
                              <button type="button" className="sb-link is-meta" onClick={() => setComments((doc.comments ?? []).map((x) => (x.id === c.id ? { ...x, status: 'dismissed' as const } : x)), 'comment set aside')}>
                                Set aside
                              </button>
                            </>
                          ) : (
                            <button type="button" className="sb-link is-meta" onClick={() => setComments((doc.comments ?? []).map((x) => (x.id === c.id ? { ...x, status: 'open' as const } : x)), 'comment reopened')}>
                              Reopen
                            </button>
                          )}
                          <button type="button" className="sb-link is-meta" onClick={() => setComments((doc.comments ?? []).filter((x) => x.id !== c.id), 'comment deleted')}>
                            Delete
                          </button>
                        </span>
                      </span>
                    </li>
                  ))}
              </ol>
            </section>
          )}
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
          <button type="button" className={`sb-btn is-sm${tuning ? '' : ' is-quiet'}`} aria-pressed={tuning} onClick={() => setTuning((t) => !t)} title="Controls made for this design: each one changes the design itself">
            Controls
          </button>
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
          <GraphicCanvas
            doc={doc}
            boardId={board.id}
            selection={selection}
            measure={measure}
            href={href}
            onSelect={(ids) => (setSelection(ids), pathEdit && !ids.includes(pathEdit) && setPathEdit(null))}
            onCommit={onOps}
            onEditText={() => window.setTimeout(() => textRef.current?.focus(), 30)}
            zoomRef={zoomRef}
            guides={aids.guides}
            grid={aids.grid}
            rulers={aids.rulers}
            pathEdit={pathEdit}
            onPathEdit={setPathEdit}
            pins={(doc.comments ?? [])
              .filter((c) => c.board === board.id)
              .map((c, i) => ({ id: c.id, n: i + 1, nodes: c.nodes, open: c.status === 'open', text: c.text, gone: c.status === 'dismissed' }))
              .filter((p) => !p.gone)}
            onPin={(id) => {
              const c = (doc.comments ?? []).find((x) => x.id === id);
              if (c) setSelection(c.nodes.filter((n) => !!locate(doc, n)));
              setTab('comments');
            }}
            onComment={live ? undefined : () => (setCommenting(selection.slice()), setCommentWords(''))}
          />
          {tuning && (
            <aside className="gx-controls" aria-label="Controls for this design">
              <p className="gx-panel-h">Controls</p>
              <p className="v0-quiet">Made for this design from what it holds. Each one changes the design itself; undo takes a change back.</p>
              {(['forms', 'type', 'colour', 'depth', 'space'] as const).map((g) => {
                const list = ctls.filter((c) => c.group === g);
                if (!list.length) return null;
                return (
                  <div key={g} className="gx-ctl-group">
                    {list.map((c) => {
                      const shown = sliding?.id === c.id ? sliding.value : c.value;
                      const orig = ctlOrig.current[board.id]?.[c.id];
                      const resettable = orig !== undefined && orig !== c.value;
                      return (
                        <div key={c.id} className="gx-ctl" title={c.says}>
                          <span className="gx-ctl-head">
                            <span className="gx-ctl-label">{c.label}</span>
                            <span className="gx-ctl-value">{c.kind === 'choice' ? c.options?.find((o) => o.value === shown)?.label ?? shown : `${shown}${c.unit ?? ''}`}</span>
                            {resettable && (
                              <button type="button" className="sb-link is-meta" onClick={() => moveControl(c, orig!, true)} disabled={!!thinking}>
                                Reset
                              </button>
                            )}
                          </span>
                          {c.kind === 'range' ? (
                            <input
                              type="range"
                              min={c.min}
                              max={c.max}
                              step={c.step}
                              value={shown}
                              aria-label={c.label}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setSliding({ id: c.id, value: v });
                                // laying the composition out again waits for the hand to stop
                                if (c.id !== 'room') moveControl(c, v, false);
                              }}
                              onPointerUp={(e) => moveControl(c, Number(e.currentTarget.value), true)}
                              onKeyUp={(e) => /Arrow|Page|Home|End/.test(e.key) && moveControl(c, Number(e.currentTarget.value), true)}
                            />
                          ) : (
                            <span className="sb-seg is-tight" role="group" aria-label={c.label}>
                              {c.options?.map((o) => (
                                <button key={o.value} type="button" className={`sb-seg-item${o.value === c.value ? ' is-on' : ''}`} aria-pressed={o.value === c.value} onClick={() => moveControl(c, o.value, true)}>
                                  {o.label}
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {Object.keys(ctlOrig.current[board.id] ?? {}).length > 0 && (
                <button
                  type="button"
                  className="sb-btn is-sm"
                  onClick={() => {
                    const orig = ctlOrig.current[board.id] ?? {};
                    let d = docNow();
                    for (const [id, v] of Object.entries(orig)) {
                      const r = applyControl(d, board.id, id, v, { dir: dirFor(board.id), kind: props.kind, measure: canvasMeasure() });
                      if (r) d = r.doc;
                    }
                    ctlOrig.current[board.id] = {};
                    commitDoc(d, 'controls reset');
                    tell('ok', 'Every control is back where it was before you moved it. Undo takes that back too.');
                  }}
                >
                  Reset all
                </button>
              )}
            </aside>
          )}
          {commenting && (
            <form
              className="gx-comment-compose"
              aria-label="Comment on the selection"
              onSubmit={(e) => {
                e.preventDefault();
                submitComment(true);
              }}
            >
              <p className="gx-panel-sub">On the {nameOf(commenting, doc)}</p>
              <textarea
                autoFocus
                rows={3}
                value={commentWords}
                onChange={(e) => setCommentWords(e.target.value.slice(0, 400))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitComment(true);
                  }
                  if (e.key === 'Escape') setCommenting(null);
                }}
                placeholder="What should change about it? “Make this lighter”, “this should feel more premium”, “move it to the top”."
                aria-label="What should change about it"
              />
              <span className="gx-comment-acts">
                <button type="submit" className="sb-btn is-sm is-primary" disabled={!commentWords.trim()}>
                  Apply now
                </button>
                <button type="button" className="sb-btn is-sm" disabled={!commentWords.trim()} onClick={() => submitComment(false)}>
                  Keep for later
                </button>
                <button type="button" className="sb-link is-meta" onClick={() => setCommenting(null)}>
                  Cancel
                </button>
              </span>
            </form>
          )}
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
