'use client';

// components/ux-v0/boards/BoardWorkspace.tsx — a board: many materials, one design system, one canvas.
//
// Brief (the request read into materials and words, corrected in fields) → the Master Design System (three proposed
// by the art-direction engine, or a website's approved one) → the board: its materials planned, placed and composed in
// that one system, at most three at a time, each with its status (planned, generating, rendering, ready, failed); a
// material that fails leaves the others as they are and is retried alone. Then the board is arranged and its notes are
// written from the facts. Nothing here calls a model.
//
// Every change to the board (moving, arranging, notes, a change asked in words) is one validated operation list,
// refused whole or applied whole, and one undo step. A change to the system is shown first (which materials it reaches,
// which local overrides are kept), then synced deterministically (sync.ts). A graphic is edited in the Graphics editor
// itself (GraphicEditor); a website in the website editor (it is a project of its own); a mockup by its scene and the
// design it shows. The board is saved like any project (useV0Project).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SAVE_WORDS, useV0Project } from '../useV0Project';
import { addUpload } from '../uploads';
import { getProject, listProjects, putProject } from '@/lib/ux-v0/store';
import { makeNonce } from '@/lib/ux-v0/sandbox';
import { currentSpec, normalizeProject, type DesignProject } from '@/lib/ux-v0/types';
import { exportSite } from '@/lib/ux-v0/export-site';
import { newId, type Asset, type GraphicDoc } from '@/lib/ux-v0/graphics/doc';
import { canvasMeasure, exportPdf } from '@/lib/ux-v0/graphics/raster';
import { applyBoardOps, boardId, bounds, emptyBoard, MAX_BOARD_VERSIONS, MOCKUP_LABEL, snapshotOf, type Arrangement, type BoardBrief, type BoardNode, type BoardOp, type BoardState, type GraphicMaterial, type Material, type MaterialSpec, type MockupMaterial, type MockupTemplate, type WebsiteMaterial } from '@/lib/ux-v0/boards/model';
import { directionOfSystem, resetOverrides as resetOverridesOf, systemFaces, type MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { planMaterials, readBoardRequest } from '@/lib/ux-v0/boards/plan';
import { applyAll, finishOps, generate, interruptedOps, proposeSystems, startBoard, systemFromWebsite } from '@/lib/ux-v0/boards/pipeline';
import { arrange, presentSize } from '@/lib/ux-v0/boards/layout';
import { annotate, verifyNotes } from '@/lib/ux-v0/boards/annotate';
import { evaluateBoard, refineBoardOps } from '@/lib/ux-v0/boards/evaluate';
import { readBoardEdit, type BoardAction } from '@/lib/ux-v0/boards/edit';
import { syncSystem, type SyncPlan } from '@/lib/ux-v0/boards/sync';
import { planRestyle } from '@/lib/ux-v0/boards/style';
import type { StyleSelection } from '@/lib/ux-v0/graphics/styles/blend';
import { useStyleLibrary } from '../graphics/styleLibrary';
import { syncWebsite, websiteConcept, websiteDrift } from '@/lib/ux-v0/boards/website';
import { boardFile, openBoardFile, systemOverviewSvg } from '@/lib/ux-v0/boards/export';
import { GraphicEditor, type EditorNote } from '../graphics/GraphicEditor';
import { planChange } from '../graphics/creativePlanner';
import { executePlan } from '@/lib/ux-v0/graphics/creative/execute';
import type { Change } from '@/lib/ux-v0/graphics/creative/plan';
import { brandBoardOptions } from '@/lib/ux-v0/dsi/generate';
import { logoBoardAsset } from '@/lib/ux-v0/dsi/adapters';
import { useLinkedSystem } from '../systems/useLinkedSystem';
import { SystemBadge } from '../systems/SystemBadge';
import { StudioRail, useRailReply } from '../studio/StudioRail';
import { prefsOf, systemsWithPrefs } from '@/lib/ux-v0/studio/apply';
import { download, facesUsed, loadFaces, slug, useAssetUrls, useFaceMeasure, type Face } from '../graphics/faces';
import { BoardCanvas, type BoardCanvasApi } from './BoardCanvas';
import { AddPanel, BoardInspector, ChecksPanel, MaterialsPanel, SystemPanel, VersionsPanel } from './BoardPanels';
import { exportMaterialsZip, exportOverview, loadWebsites, websiteInfo } from './boardRender';

type View = 'brief' | 'system' | 'board';
type Tab = 'materials' | 'system' | 'add' | 'checks' | 'versions';
type Note = EditorNote;
type Pending = { kind: 'ops'; label: string; ops: BoardOp[]; preview: BoardState } | { kind: 'sync'; label: string; plan: SyncPlan; next: MasterDesignSystem; reset: Record<string, 'all'> } | { kind: 'confirm'; label: string; text: string; run: () => void };

const DEFAULT_NAMES = new Set(['Untitled board', 'Untitled design', '']);
const SPEC_KINDS: [MaterialSpec['kind'], string, string?, MockupTemplate?][] = [
  ['poster', 'Poster'],
  ['social', 'Instagram post'],
  ['social', 'Story', 'story'],
  ['banner', 'Web banner'],
  ['ad', 'Advertisement'],
  ['card', 'Business card'],
  ['label', 'Product label'],
  ['website', 'Website'],
  ['mockup', 'Phone mockup', undefined, 'phone'],
  ['mockup', 'Poster on a wall', undefined, 'poster-wall'],
  ['mockup', 'Packaging mockup', undefined, 'box'],
  ['mockup', 'Billboard', undefined, 'billboard'],
  ['mockup', 'Laptop mockup', undefined, 'laptop'],
];
const specLabel = (s: MaterialSpec) => SPEC_KINDS.find(([k, , f, t]) => k === s.kind && (f ?? undefined) === (s.format === 'story' ? 'story' : undefined) && (t ?? undefined) === s.template)?.[1] ?? s.kind;
const withVersion = (b: BoardState, label: string, from: BoardState = b): BoardState => ({ ...b, versions: [...b.versions, { label: label.slice(0, 160), at: Date.now(), state: snapshotOf(from) }].slice(-MAX_BOARD_VERSIONS) });
const systemFacesOf = (sys: MasterDesignSystem): Face[] => systemFaces(sys);

export function BoardWorkspace({ initial, signedIn, onExit, startIntent, onOpenProject }: { initial: DesignProject; signedIn: boolean; onExit: () => void; startIntent?: string; onOpenProject: (id: string) => void }) {
  const { project, update, save, current } = useV0Project(initial, signedIn);
  const { library: styleLibrary } = useStyleLibrary();
  // while the conversation is open beside the board it is the one place to type
  const [railOpen, setRailOpen] = useState(false);
  const [matInbox, setMatInbox] = useState<{ id: number; words: string } | null>(null);
  const [matSaid, setMatSaid] = useState<{ text: string } | null>(null);
  const b: BoardState = project.board ?? emptyBoard();
  const setBoard = useCallback((fn: (x: BoardState) => BoardState) => update((p) => ({ ...p, board: fn(p.board ?? emptyBoard()) })), [update]);
  const boardNow = useCallback(() => current.current.board ?? emptyBoard(), [current]);
  // the registry design system the board is built in: its identity fixed, every system option a different expression
  const linked = useLinkedSystem(project.systemLink);
  const brandOptions = useCallback(
    (brief: BoardBrief, round = 0): { options: MasterDesignSystem[]; logo: Asset | null } => {
      if (!linked) return { options: [], logo: null };
      const logo = logoBoardAsset(linked.content);
      const link = { id: linked.rec.id, version: linked.version, name: linked.rec.name };
      return { options: brandBoardOptions(linked.content, brief, project.id, { round, link, mode: project.systemLink?.mode, overrides: project.systemLink?.overrides, ...(logo ? { assetId: logo.id } : {}) }), logo };
    },
    [linked, project.id, project.systemLink],
  );
  /** A whole new board as the current one, readable at once (the next change in the same moment chains on it). */
  const commitBoard = useCallback(
    (next: BoardState) => {
      current.current = { ...current.current, board: next };
      setBoard(() => next);
    },
    [current, setBoard],
  );
  const nonce = useMemo(() => makeNonce(), []);

  const [view, setView] = useState<View>(b.system ? 'board' : b.options.length ? 'system' : 'brief');
  const [note, setNote] = useState<Note>(null);
  const [error, setError] = useState('');

  // ── the brief ──
  const [words, setWords] = useState(b.request || startIntent || project.intent || '');
  const [draft, setDraft] = useState<BoardBrief | null>(() => b.brief ?? ((b.request || startIntent || project.intent || '').trim() ? readBoardRequest(b.request || startIntent || project.intent || '') : null));
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    listProjects()
      .then((xs) => setSites(xs.filter((s) => !s.graphic && !s.board && s.mode === 'create' && s.direction && s.id !== project.id).map((s) => ({ id: s.id, name: s.name || 'Untitled' }))))
      .catch(() => undefined);
  }, [project.id]);

  // ── fonts, measuring, pictures ──
  const faces = useMemo(() => [...(b.system ? systemFacesOf(b.system) : []), ...b.options.flatMap(systemFacesOf), ...b.materials.flatMap((m) => (m.type === 'graphic' && m.doc ? facesUsed(m.doc) : []))], [b.system, b.options, b.materials]);
  const { measure, refresh: refreshMeasure } = useFaceMeasure(faces);
  const allAssets = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of b.assets) map.set(a.id, a);
    for (const m of b.materials) if (m.type === 'graphic' && m.doc) for (const a of m.doc.assets) map.set(a.id, a);
    return [...map.values()];
  }, [b.assets, b.materials]);
  const { href, resolve, missing } = useAssetUrls(allAssets);

  // ── the websites the board links to (projects of their own, loaded from the store) ──
  const [websites, setWebsites] = useState<Map<string, DesignProject>>(new Map());
  const siteKey = b.materials.map((m) => (m.type === 'website' ? m.projectId : '')).join(',');
  useEffect(() => {
    let live = true;
    loadWebsites(boardNow()).then((w) => live && setWebsites(w));
    return () => {
      live = false;
    };
  }, [siteKey, boardNow]);
  const syncUp = useCallback(
    async (p: DesignProject) => {
      if (!signedIn) return;
      try {
        await fetch('/api/ux-v0/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: normalizeProject(p, { forSync: true }) }) });
      } catch {
        /* kept in this browser; it syncs when the website is next opened */
      }
    },
    [signedIn],
  );

  // ── the board's history: every change one step (generation's progress is not a step) ──
  const past = useRef<{ board: BoardState; label: string }[]>([]);
  const future = useRef<{ board: BoardState; label: string }[]>([]);
  const [, setTick] = useState(0);
  const apply = useCallback(
    (ops: BoardOp[], label: string, opts: { version?: string } = {}): BoardState | null => {
      const cur = boardNow();
      if (!ops.length) return cur;
      const r = applyBoardOps(cur, ops);
      if (!r.ok) {
        setNote({ tone: 'warn', text: `Nothing changed: ${r.error}${r.locked?.length ? ' Unlock it first (select it, then “Unlock it”), or ask for something else.' : ''}` });
        return null;
      }
      past.current.push({ board: cur, label });
      if (past.current.length > 80) past.current.shift();
      future.current = [];
      const next = opts.version ? withVersion(r.board, opts.version, cur) : r.board;
      current.current = { ...current.current, board: next };
      // if the board moved on meanwhile (generation's progress still being applied), the same change is made on it
      setBoard((x) => {
        if (x === cur) return next;
        const again = applyBoardOps(x, ops);
        return again.ok ? (opts.version ? withVersion(again.board, opts.version, x) : again.board) : x;
      });
      setTick((t) => t + 1);
      return next;
    },
    [boardNow, current, setBoard],
  );
  const undo = () => {
    if (signal.current) return setNote({ tone: 'ask', text: 'Materials are being made: undo once they have settled.' });
    const p = past.current.pop();
    if (!p) return;
    const cur = boardNow();
    future.current.push({ board: cur, label: p.label });
    commitBoard({ ...p.board, versions: cur.versions });
    setPending(null);
    setNote({ tone: 'ok', text: `Undone: ${p.label}.` });
    setTick((t) => t + 1);
  };
  const redo = () => {
    if (signal.current) return;
    const f = future.current.pop();
    if (!f) return;
    const cur = boardNow();
    past.current.push({ board: cur, label: f.label });
    commitBoard({ ...f.board, versions: cur.versions });
    setPending(null);
    setNote({ tone: 'ok', text: `Redone: ${f.label}.` });
    setTick((t) => t + 1);
  };

  // ── selection, the canvas, panels ──
  const [selection, setSelection] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('materials');
  const [hand, setHand] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [askWords, setAskWords] = useState('');
  const [busy, setBusy] = useState('');
  const canvas = useRef<BoardCanvasApi | null>(null);
  const openInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setSelection((s) => {
      const kept = s.filter((id) => b.nodes.some((n) => n.id === id));
      return kept.length === s.length ? s : kept;
    });
  }, [b.nodes]);
  const selectedMaterials = useMemo(() => new Set(selection.map((id) => b.nodes.find((n) => n.id === id)).flatMap((n) => (n?.type === 'material' ? [n.material] : []))), [selection, b.nodes]);
  const stale = useMemo(() => new Map(verifyNotes(b).map((s) => [s.note, s.reasons])), [b]);
  const websiteFacts = useMemo(() => {
    const out: Record<string, { display: string; body: string; accent: string } | null> = {};
    for (const m of b.materials) {
      if (m.type !== 'website' || m.projectId === 'pending') continue;
      const info = websiteInfo(websites.get(m.projectId) ?? null);
      out[m.projectId] = info ? { display: info.display, body: info.body, accent: info.colors.accent } : null;
    }
    return out;
  }, [b.materials, websites]);
  const evaluation = useMemo(() => (b.materials.some((m) => m.status === 'ready') ? evaluateBoard(b, { measure, websites: websiteFacts, missingUploads: missing }) : null), [b, measure, websiteFacts, missing]);

  // a page closed while materials were being made: they are said interrupted, never left “generating”
  useEffect(() => {
    const stuck = interruptedOps(boardNow());
    if (stuck.length) setBoard((x) => applyAll(x, interruptedOps(x)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── generation ──
  const [generating, setGenerating] = useState<{ done: number; total: number; started: number } | null>(null);
  const signal = useRef<{ aborted: boolean } | null>(null);
  const sitePromise = useRef<Promise<string> | null>(null);
  const makeWebsite = useCallback(
    async (m: WebsiteMaterial, board: BoardState): Promise<string> => {
      if (board.brief?.website) {
        const p = await getProject(board.brief.website);
        if (!p) throw new Error('That website project is not in this browser');
        return p.id;
      }
      if (m.projectId && m.projectId !== 'pending' && (await getProject(m.projectId))) return m.projectId;
      // one website project for the board, however many views of it (desktop, phone) are on it
      sitePromise.current ??= (async () => {
        const r = websiteConcept(board.brief!, board.system!, { board: current.current.name || board.brief!.name });
        if (!r.ok) throw new Error(r.error);
        const saved = await putProject(r.project);
        if (!saved.ok) throw new Error('The website project could not be kept in this browser (its storage is full or refused)');
        void syncUp(r.project);
        setWebsites((w) => new Map(w).set(r.project.id, r.project));
        return r.project.id;
      })();
      try {
        return await sitePromise.current;
      } catch (e) {
        sitePromise.current = null;
        throw e;
      }
    },
    [current, syncUp],
  );

  // `from` is the board to generate from, given explicitly: the project's state may not have taken a change made in
  // the same moment yet (a material just added, a status just reset)
  const runGeneration = useCallback(
    async (only: string[] | null, finish: boolean, from?: BoardState) => {
      const start = from ?? boardNow();
      if (!start.system || signal.current) return;
      const sig = { aborted: false };
      signal.current = sig;
      const t0 = performance.now();
      const todo = start.materials.filter((m) => (only ? only.includes(m.id) : m.status !== 'ready'));
      setGenerating({ done: 0, total: todo.length, started: t0 });
      // the system's faces loaded before anything is measured
      const changed = await loadFaces(systemFacesOf(start.system));
      if (changed) refreshMeasure();
      const m = canvasMeasure();
      const res = await generate(
        start,
        { measure: m, website: makeWebsite },
        (op) => {
          setBoard((x) => applyAll(x, [op]));
          if (op.op === 'material-update' && (op.set.status === 'ready' || op.set.status === 'failed')) setGenerating((g) => (g ? { ...g, done: g.done + 1 } : g));
        },
        { concurrency: 3, only: only ?? undefined, signal: sig },
      );
      const ms = Math.round(performance.now() - t0);
      if (finish) setBoard((x) => withVersion(applyAll(x, finishOps(x)), `Generated: ${res.ready} ready${res.failed ? `, ${res.failed} failed` : ''}`));
      else setBoard((x) => (x.nodes.some((n) => n.type === 'note' && n.generated) ? applyAll(x, annotate(x)) : x));
      signal.current = null;
      setGenerating(null);
      const stopped = sig.aborted ? Math.max(0, todo.length - res.ready - res.failed) : 0;
      setNote({
        tone: res.failed || stopped ? 'warn' : 'ok',
        text: `${res.ready} material${res.ready === 1 ? '' : 's'} made in this system${res.failed ? `; ${res.failed} failed and ${res.failed === 1 ? 'is' : 'are'} said on the board: retry ${res.failed === 1 ? 'it' : 'each'} on its own` : ''}${stopped ? `; stopped with ${stopped} not started` : ''}. No model calls${ms ? `, ${ms} ms` : ''}.`,
      });
    },
    [boardNow, makeWebsite, refreshMeasure, setBoard],
  );

  // the palette and faces chosen in the studio's conversation, held by the systems proposed (never a design system's)
  const heldToStudio = (xs: MasterDesignSystem[]) => (project.studio ? systemsWithPrefs(xs, prefsOf(project.studio)) : xs);

  // ── the brief → systems → the board ──
  const readWords = () => {
    const r = readBoardRequest(words);
    setDraft({ ...r, images: draft?.images ?? [], annotate: draft?.annotate ?? r.annotate, ...(draft?.systemFrom ? { systemFrom: draft.systemFrom } : {}) });
  };
  const continueFromBrief = async () => {
    if (!draft || !draft.content.headline.trim()) return setError('Write the headline first: SocriaUX composes every material around your words and never invents them.');
    if (!draft.materials.length) return setError('Name at least one material.');
    setError('');
    const brief: BoardBrief = { ...draft, name: draft.name || draft.content.headline.slice(0, 80) };
    update((p) => ({ ...p, name: DEFAULT_NAMES.has(p.name) ? brief.name.slice(0, 80) : p.name, intent: p.intent || words.slice(0, 600) }));
    if (brief.systemFrom) {
      const site = await getProject(brief.systemFrom);
      const sys = site ? systemFromWebsite(site, brief.name) : null;
      if (!sys) return setError('That website has no approved direction yet: approve one there, or let SocriaUX propose systems.');
      setBoard((x) => ({ ...x, request: words, brief, options: [sys] }));
      setView('system');
      return;
    }
    if (linked) {
      // within a design system: the brand is named (its approved logo takes the place), three expressions of its identity
      const named: BoardBrief = { ...brief, content: { ...brief.content, brand: brief.content.brand || linked.content.identity.name } };
      const b = brandOptions(named);
      setBoard((x) => ({ ...x, request: words, brief: named, options: b.options, assets: b.logo ? [...x.assets.filter((a) => a.id !== b.logo!.id), b.logo] : x.assets }));
      setView('system');
      return;
    }
    const options = heldToStudio(proposeSystems(brief, project.id));
    setBoard((x) => ({ ...x, request: words, brief, options }));
    setView('system');
  };
  const moreSystems = () => {
    const cur = boardNow();
    if (!cur.brief) return;
    const seen = cur.options.map((o) => o.direction.language);
    const round = Math.ceil(seen.length / 3);
    setBoard((x) => ({ ...x, options: linked ? brandOptions(cur.brief!, round).options : heldToStudio(proposeSystems(cur.brief!, project.id, { round, seen })) }));
  };
  const chooseSystem = async (sys: MasterDesignSystem) => {
    const cur = boardNow();
    if (!cur.brief) return;
    const start: BoardState = { ...startBoard(cur.brief, sys, { request: cur.request, assets: cur.assets, websiteProject: cur.brief.website }), options: cur.options, versions: cur.versions };
    commitBoard(start);
    past.current = [];
    future.current = [];
    setSelection([]);
    setView('board');
    window.setTimeout(() => canvas.current?.fit(), 60);
    await runGeneration(null, true, start);
    window.setTimeout(() => canvas.current?.fit(), 60);
  };

  // ── materials: retry, keep, regenerate, add ──
  const retry = (id: string) => {
    const m = boardNow().materials.find((x) => x.id === id);
    if (!m) return;
    const r = apply([{ op: 'material-update', id, set: { status: 'planned', error: '', ...(m.type === 'graphic' && m.doc ? { variant: m.variant + 1 } : {}) } }], `retrying ${m.name}`);
    if (r) void runGeneration([id], false, r);
  };
  const keep = (id: string) => {
    const m = boardNow().materials.find((x) => x.id === id);
    if (!m) return;
    apply([{ op: 'material-update', id, set: { status: 'ready', error: '', accepted: true } }], `${m.name} kept as it is`);
  };
  const regenerate = (ids: string[]) => {
    const cur = boardNow();
    const list = cur.materials.filter((m): m is GraphicMaterial => ids.includes(m.id) && m.type === 'graphic');
    if (!list.length) return setNote({ tone: 'ask', text: 'Only graphics are composed again here: a website is changed in the website editor, a mockup follows the design it shows.' });
    const locked = list.filter((m) => cur.nodes.find((n) => n.type === 'material' && n.material === m.id)?.locked);
    if (locked.length) return setNote({ tone: 'warn', text: `${locked.map((m) => m.name).join(', ')} ${locked.length === 1 ? 'is' : 'are'} locked: unlock first to regenerate.` });
    const r = apply(
      list.map((m) => ({ op: 'material-update', id: m.id, set: { status: 'planned', variant: m.variant + 1 } }) as BoardOp),
      `${list.map((m) => m.name).join(', ')} regenerated in the same system`,
    );
    if (r) void runGeneration(list.map((m) => m.id), false, r);
  };
  const placeFor = (cur: BoardState, w: number, h: number) => {
    const bb = cur.nodes.length ? bounds(cur.nodes) : { x: 0, y: 0, w: 0, h: 0 };
    return { x: bb.x + bb.w + 160, y: bb.y + 230, w, h };
  };
  const addMaterial = (kind: string, format?: string) => {
    const cur = boardNow();
    if (!cur.system || !cur.brief) return;
    const planned = planMaterials({ ...cur.brief, materials: [{ kind: kind as MaterialSpec['kind'], count: 1, ...(format ? { format } : {}) }] }, {});
    const m0 = planned[0];
    if (!m0) return;
    const base = m0.name.replace(/\s+\d+$/, '');
    const same = cur.materials.filter((x) => x.name.replace(/\s+\d+$/, '') === base).length;
    const m = { ...m0, name: same ? `${base} ${same + 1}` : base } as Material;
    const s = presentSize(m);
    const r = apply([{ op: 'material-add', material: m, place: placeFor(cur, s.w, s.h) }], `${m.name} added in the system`);
    if (r) void runGeneration([m.id], false, r);
  };
  const addMockup = (template: MockupTemplate) => {
    const cur = boardNow();
    const sel = cur.materials.find((m) => selectedMaterials.has(m.id) && m.type === 'graphic') as GraphicMaterial | undefined;
    const graphics = cur.materials.filter((m): m is GraphicMaterial => m.type === 'graphic');
    const src = sel ?? (template === 'box' ? graphics.find((g) => g.brief.kind === 'label') : template === 'phone' ? graphics.find((g) => g.brief.kind === 'social') : graphics.find((g) => g.brief.kind === 'poster')) ?? graphics[0];
    if (!src) return;
    const name = `${MOCKUP_LABEL[template]} mockup${cur.materials.some((x) => x.type === 'mockup' && x.template === template) ? ` ${cur.materials.filter((x) => x.type === 'mockup' && x.template === template).length + 1}` : ''}`;
    const m: MockupMaterial = { id: boardId('m'), type: 'mockup', name, purpose: `Shows ${src.name} in use; it follows ${src.name} whenever it changes.`, template, source: { material: src.id, artboard: 0 }, status: 'planned', revision: 0 };
    const s = presentSize(m);
    const r = apply([{ op: 'material-add', material: m, place: placeFor(cur, s.w, s.h) }], `${name} of ${src.name} added`);
    if (r) void runGeneration([m.id], false, r);
  };
  const addNodeAtCentre = (node: Record<string, unknown>, label: string) => {
    const v = canvas.current?.view() ?? { x: 0, y: 0, k: 1 };
    const cx = (600 - v.x) / v.k;
    const cy = (400 - v.y) / v.k;
    const id = boardId('bn');
    const r = apply([{ op: 'node-add', node: { id, x: Math.round(cx), y: Math.round(cy), ...node } }], label);
    if (r) {
      setSelection([id]);
      if (node.type === 'note' || node.type === 'heading') setEditingText(id);
    }
  };
  const uploadPicture = async (f: File): Promise<Asset | null> => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) {
      setNote({ tone: 'warn', text: `“${f.name}” is not a picture SocriaUX can use here (PNG, JPG, WebP or GIF).` });
      return null;
    }
    const r = await addUpload(f);
    if (!r.ok) {
      setNote({ tone: 'warn', text: r.error });
      return null;
    }
    return { id: newId('as'), kind: 'image', src: `upload:${r.ref.providerId}`, width: r.ref.width, height: r.ref.height, name: (r.ref.title || f.name).slice(0, 120), credit: 'Your own', source: 'upload' };
  };
  const addReference = async (f: File) => {
    const a = await uploadPicture(f);
    if (!a) return;
    const w = 520;
    const h = Math.round((w * a.height) / Math.max(1, a.width));
    const v = canvas.current?.view() ?? { x: 0, y: 0, k: 1 };
    const id = boardId('bn');
    apply([{ op: 'asset', asset: a }, { op: 'node-add', node: { id, type: 'reference', asset: a.id, caption: a.name, x: Math.round((600 - v.x) / v.k), y: Math.round((400 - v.y) / v.k), w, h } }], 'reference picture added');
  };

  // ── the board's design language: planned (rebuilt where untouched, carried through bindings elsewhere), previewed ──
  const proposeRestyle = (sel: StyleSelection | null, label: string) => {
    const cur = boardNow();
    const plan = planRestyle(cur, sel, { measure, customs: styleLibrary.styles, assets: cur.assets });
    if (!plan) return setNote({ tone: 'warn', text: 'There is no design system to change yet.' });
    const preview = applyAll(cur, plan.ops);
    setPending({ kind: 'ops', label: `${label}. ${plan.summary}`, ops: plan.ops, preview });
  };

  // ── the design system: a change proposed, then synced ──
  const proposeSystem = (next: MasterDesignSystem, label: string, reset: Record<string, 'all'> = {}) => {
    const cur = boardNow();
    if (!cur.system) return;
    const plan = syncSystem(cur, next, { measure, reset });
    if (!plan.changed.length) return setNote({ tone: 'ok', text: 'That is already the system.' });
    setPending({ kind: 'sync', label, plan, next, reset });
  };
  const applySync = (p: Extract<Pending, { kind: 'sync' }>) => {
    const r = apply(p.plan.ops, p.label, { version: `Before ${p.label}` });
    setPending(null);
    if (r) setNote({ tone: p.plan.entries.some((e) => e.kept.length) ? 'warn' : 'ok', text: `${p.plan.summary} The board as it was is kept in Versions; undo takes it back.` });
  };
  const resetOverrides = (materialId: string, nodes: string[] | 'all') => {
    const cur = boardNow();
    const m = cur.materials.find((x): x is GraphicMaterial => x.id === materialId && x.type === 'graphic');
    if (!m?.doc || !cur.system) return;
    // the designer asked: these local overrides (or all) set back to the system's values, nothing else touched
    const r = resetOverridesOf(m.doc, m.bindings, cur.system, nodes === 'all' ? undefined : nodes, measure);
    if (!r.reset) return setNote({ tone: 'warn', text: r.skipped.length ? `Nothing was reset: ${r.skipped.map((x) => `${x.name} (${x.why})`).join('; ')}.` : 'Nothing to reset.' });
    apply([{ op: 'material-update', id: m.id, set: { doc: r.doc } }], `${m.name}: ${nodes === 'all' ? 'all local changes' : 'a local change'} reset to the system`);
    setNote({ tone: 'ok', text: `${m.name} follows the system again (${r.reset} reset). Undo takes it back.` });
  };
  const syncWebsites = async (ids: string[], what: { fonts: boolean; colours: boolean }) => {
    const cur = boardNow();
    if (!cur.system) return;
    const done: string[] = [];
    for (const m of cur.materials) {
      if (m.type !== 'website' || (ids.length && !ids.includes(m.id))) continue;
      const p = await getProject(m.projectId);
      if (!p) continue;
      const next = syncWebsite(p, cur.system, what);
      if (!next) continue;
      await putProject(next);
      void syncUp(next);
      setWebsites((w) => new Map(w).set(next.id, next));
      done.push(`${p.name} (version ${next.specs[next.specIndex].version})`);
    }
    setNote(done.length ? { tone: 'ok', text: `Carried into the website as a new version, the earlier one kept: ${done.join(', ')}.` } : { tone: 'ok', text: 'The website already follows the system.' });
  };

  // ── a change asked in words ──
  const runAction = (a: BoardAction, label: string) => {
    const cur = boardNow();
    if (a.kind === 'system') return proposeSystem(a.system, label);
    if (a.kind === 'regenerate') {
      const names = a.materials.map((id) => cur.materials.find((m) => m.id === id)?.name).filter(Boolean);
      return setPending({ kind: 'confirm', label, text: `Compose ${names.join(', ')} again in the same system? Everything else on the board stays exactly as it is.`, run: () => regenerate(a.materials) });
    }
    if (a.kind === 'add-material') return addMaterial(a.spec.kind, a.spec.format);
    if (a.kind === 'annotate') {
      const ops = annotate(cur);
      const r = apply(ops.length ? [...ops, ...(cur.annotations ? [] : [{ op: 'annotations', visible: true } as BoardOp])] : [], 'notes written again from the facts');
      if (r) setNote({ tone: 'ok', text: `The notes say what is true of each material now: ${r.nodes.filter((n) => n.type === 'note' && n.generated).length} notes, each tied to what it explains.` });
      return;
    }
    if (a.kind === 'restyle') return proposeRestyle(a.selection, label);
    if (a.kind === 'polish') {
      const ops1 = arrange(cur, 'editorial');
      const b1 = applyAll(cur, ops1);
      const n = b1.nodes.some((x) => x.type === 'note' && x.generated) ? annotate(b1) : [];
      const b2 = applyAll(b1, n);
      apply([...ops1, ...n, ...arrange(b2, 'editorial')], label);
      window.setTimeout(() => canvas.current?.fit(), 60);
      return;
    }
    if (a.kind === 'website-sync') {
      const drift = cur.materials.filter((m) => m.type === 'website').map((m) => websites.get((m as WebsiteMaterial).projectId)).filter((p): p is DesignProject => !!p).map((p) => websiteDrift(p, cur.system!));
      if (!drift.some((d) => (a.fonts && d.fonts.length) || (a.colours && d.colours.length))) return setNote({ tone: 'ok', text: 'The website already follows the system in that.' });
      return setPending({ kind: 'confirm', label, text: `Carry the system’s ${[a.fonts ? 'typefaces' : '', a.colours ? 'colours' : ''].filter(Boolean).join(' and ')} into the website as a new version of it? The current version is kept in its history.`, run: () => void syncWebsites(a.materials, { fonts: a.fonts, colours: a.colours }) });
    }
  };
  /**
   * A creative change of the look said to the board (“make it cloud themed”, “more sophisticated”): planned once (the
   * model when it can help, the reader always), carried out by the engine on each graphic (the selected ones, else all)
   * and previewed on the board. What one object or one concept should do belongs inside a material, and is said so.
   */
  const askCreative = async (w: string): Promise<boolean> => {
    const cur = boardNow();
    const picked = new Set(cur.nodes.filter((n) => selection.includes(n.id) && n.type === 'material').map((n) => (n as { material: string }).material));
    const graphics = cur.materials.filter((m): m is GraphicMaterial => m.type === 'graphic' && !!m.doc);
    const chosen = graphics.filter((m) => picked.has(m.id)).length ? graphics.filter((m) => picked.has(m.id)) : graphics;
    if (!chosen.length) return false;
    const first = chosen[0];
    const dir = cur.system ? directionOfSystem(cur.system) : null;
    const planned = await planChange(w, first.doc!, { board: first.doc!.artboards[0].id, dir, projectId: project.id });
    if (planned.cancelled) return true;
    const plan = planned.plan;
    if (!plan) return false;
    if (!plan.changes.length) {
      if (!plan.question) return false;
      setNote({ tone: 'ask', text: `${plan.question.text} ${plan.question.options.map((o, i) => `${i + 1}. ${o.label}`).join(' · ')} — or say it your own way.` });
      return true;
    }
    // the look changes on every graphic; what one object or one concept should do is for inside a material
    const changes = plan.changes.filter((c: Change) => c.decision !== 'concept' && c.decision !== 'object' && c.decision !== 'content');
    if (!changes.length) {
      setNote({ tone: 'ask', text: 'That is a change inside one material: open it (double-click it on the board) and say it there, or select it and say how its look should change.' });
      return true;
    }
    const ops: BoardOp[] = [];
    const done = new Set<string>();
    const notes = new Set<string>();
    for (const m of chosen) {
      const x = executePlan(m.doc!, { ...plan, changes }, { kind: m.brief.kind, dir, measure, said: w });
      x?.notes.forEach((n) => notes.add(n));
      if (x && x.doc !== m.doc && x.done.length) {
        ops.push({ op: 'material-update', id: m.id, set: { doc: x.doc } });
        x.done.forEach((d) => done.add(d));
      }
    }
    if (!ops.length) {
      setNote({ tone: 'warn', text: [...notes].join(' ') || 'The graphics already are what those words ask for.' });
      return true;
    }
    const r = applyBoardOps(cur, ops);
    if (!r.ok) {
      setNote({ tone: 'warn', text: `Nothing changed: ${r.error}` });
      return true;
    }
    const what = [...done].slice(0, 4).join('; ');
    setPending({ kind: 'ops', label: `${what.replace(/^./, (x) => x.toUpperCase())} — on ${ops.length === graphics.length ? (ops.length === 1 ? 'the graphic' : `all ${ops.length} graphics`) : `${ops.length} of the graphics`}`, ops, preview: r.board });
    setNote(notes.size ? { tone: 'warn', text: [...notes].slice(0, 2).join(' ') } : null);
    return true;
  };
  const ask = async (said?: string) => {
    const w = (typeof said === 'string' ? said : askWords).trim();
    if (!w) return;
    const e = readBoardEdit(w, boardNow(), { selection });
    if (!e) {
      if (await askCreative(w)) return;
      return setNote({ tone: 'ask', text: 'Say how the board should change: its arrangement (“arrange these materials into two rows”), a material (“regenerate only the second poster”, “make the posters slightly larger”), the look of its graphics (“make it cloud themed”, “more sophisticated”, “warmer colours”), or open a material to change it in detail.' });
    }
    if (e.question && !e.ops && !e.action) return setNote({ tone: 'ask', text: e.question });
    if (e.ops) {
      const r = applyBoardOps(boardNow(), e.ops);
      if (!r.ok) return setNote({ tone: 'warn', text: `Nothing changed: ${r.error}` });
      setPending({ kind: 'ops', label: e.label, ops: e.ops, preview: r.board });
      setNote(null);
      return;
    }
    if (e.action) runAction(e.action, e.label);
  };
  const applyPending = () => {
    const p = pending;
    if (!p) return;
    if (p.kind === 'ops') {
      setPending(null);
      if (apply(p.ops, p.label)) setNote({ tone: 'ok', text: `Applied: ${p.label}. Undo takes it back.` });
      setAskWords('');
    } else if (p.kind === 'sync') {
      applySync(p);
      setAskWords('');
    } else {
      setPending(null);
      p.run();
      setAskWords('');
    }
  };

  // ── the board's checks: one bounded round at a time, at most two ──
  const [refining, setRefining] = useState(false);
  const refine = async () => {
    setRefining(true);
    const said: string[] = [];
    let regen: string[] = [];
    for (let round = 0; round < 2; round++) {
      const cur = boardNow();
      const ev = evaluateBoard(cur, { measure, websites: websiteFacts, missingUploads: missing });
      const r = refineBoardOps(cur, ev, measure);
      if (!r.ops.length && !r.regenerate.length) break;
      if (r.ops.length && !apply(r.ops, `the board refined (round ${round + 1})`)) break;
      said.push(...r.said);
      regen = [...new Set([...regen, ...r.regenerate])];
      if (!r.ops.length) break;
      await new Promise((res) => window.setTimeout(res, 0));
    }
    setRefining(false);
    if (regen.length) regenerate(regen);
    setNote(said.length || regen.length ? { tone: 'ok', text: `Fixed: ${said.join('; ')}${regen.length ? `${said.length ? '; ' : ''}composed again to differ: ${regen.map((id) => boardNow().materials.find((m) => m.id === id)?.name).join(', ')}` : ''}.` } : { tone: 'warn', text: 'Nothing could be fixed without taking a decision away: what is left is yours to decide.' });
  };

  // ── export ──
  const exportCtx = () => ({
    websites,
    resolve,
    measure,
    exportSite: async (p: DesignProject) => {
      const spec = currentSpec(p);
      if (!spec) return null;
      const site = exportSite(spec, p.moodboard.refs, { projectName: p.name, direction: p.direction.chosen ? { name: p.direction.chosen.name, language: p.direction.chosen.language } : null });
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const folder = zip.folder(site.name)!;
      for (const f of site.files) folder.file(f.path, f.data);
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    },
    pdf: async (doc: GraphicDoc) => (await exportPdf(doc, doc.artboards, { measure, resolve })).blob,
  });
  const exportAs = async (kind: 'overview-png' | 'overview-png-clean' | 'overview-pdf' | 'overview-svg' | 'all' | 'selected' | 'board') => {
    const cur = boardNow();
    const base = slug(project.name || cur.brief?.name || 'board');
    setBusy('Exporting…');
    try {
      if (kind === 'board') {
        download(new Blob([boardFile(cur)], { type: 'application/json' }), `${base}.socriaux-board.json`);
        setNote({ tone: 'ok', text: 'The board file is downloaded: open it here again with “Open a board file”. Its website stays a project of its own (referenced by its id), and pictures from this browser go by reference.' });
      } else if (kind.startsWith('overview')) {
        const k = kind === 'overview-pdf' ? 'pdf' : kind === 'overview-svg' ? 'svg' : 'png';
        const r = await exportOverview(cur, k, { annotations: kind !== 'overview-png-clean', websites, resolve, measure });
        download(r.blob, `${base}-overview${kind === 'overview-png-clean' ? '-no-notes' : ''}.${k}`);
        setNote({ tone: r.fontsSubstituted || r.missing.length ? 'warn' : 'ok', text: `The board overview is downloaded (${r.w} × ${r.h}${k === 'svg' ? ' units' : ' px'}${kind === 'overview-png-clean' ? ', without the notes' : ''}): the presentation of the board, not its materials (export those with “All materials”). Websites appear in it as a schematic of their page.${r.fontsSubstituted ? ' A fallback face stood in for one that could not be fetched.' : ''}` });
      } else {
        const ids = kind === 'selected' ? [...selectedMaterials] : null;
        if (ids && !ids.length) return setNote({ tone: 'ask', text: 'Select the materials to export first (or export all of them).' });
        const r = await exportMaterialsZip(cur, ids, { ...exportCtx(), overview: kind === 'all' });
        download(r.blob, `${base}-${kind === 'all' ? 'materials' : 'selected'}.zip`);
        setNote({ tone: r.notes.length ? 'warn' : 'ok', text: `${r.count} file${r.count === 1 ? '' : 's'} of ${ids ? ids.length : cur.materials.length} material${(ids ? ids.length : cur.materials.length) === 1 ? '' : 's'} downloaded in one .zip, each in its own folder, with manifest.json naming every file by material id${kind === 'all' ? ', the board overview and the board file' : ''}.${r.notes.length ? ` ${r.notes.join(' ')}` : ''}` });
      }
    } catch (e) {
      setNote({ tone: 'warn', text: `The export did not finish: ${(e as Error).message || 'the browser refused it'}. The board is unchanged.` });
    } finally {
      setBusy('');
    }
  };
  const exportOne = async (id: string) => {
    const cur = boardNow();
    const m = cur.materials.find((x) => x.id === id);
    if (!m) return;
    setBusy('Exporting…');
    try {
      const r = await exportMaterialsZip(cur, [id], exportCtx());
      download(r.blob, `${slug(m.name)}.zip`);
      setNote({ tone: r.notes.length ? 'warn' : 'ok', text: `${m.name} downloaded in its own formats (${r.count} file${r.count === 1 ? '' : 's'}), with its manifest.${r.notes.length ? ` ${r.notes.join(' ')}` : ''}` });
    } catch (e) {
      setNote({ tone: 'warn', text: `The export did not finish: ${(e as Error).message}.` });
    } finally {
      setBusy('');
    }
  };
  const openFile = async (f: File) => {
    if (f.size > 30_000_000) return setNote({ tone: 'warn', text: 'That file is larger than 30 MB: not a SocriaUX board file.' });
    const opened = openBoardFile(await f.text());
    if (!opened) return setNote({ tone: 'warn', text: `“${f.name}” is not a SocriaUX board, or it is damaged. Nothing was changed.` });
    const cur = boardNow();
    past.current.push({ board: cur, label: `opened ${f.name}` });
    future.current = [];
    commitBoard(withVersion({ ...opened, versions: cur.versions }, `Before opening ${f.name}`, cur));
    setView(opened.system ? 'board' : 'brief');
    window.setTimeout(() => canvas.current?.fit(), 60);
    setNote({ tone: 'ok', text: `Opened “${f.name}”. The board as it was is kept in Versions.` });
  };

  // ── versions ──
  const keepVersion = () => setBoard((x) => withVersion(x, 'Kept by hand'));
  const restoreVersion = (i: number) => {
    const cur = boardNow();
    const v = cur.versions[i];
    if (!v) return;
    past.current.push({ board: cur, label: `restored “${v.label}”` });
    future.current = [];
    commitBoard({ ...(v.state as BoardState), versions: cur.versions });
    setNote({ tone: 'ok', text: `Restored “${v.label}”. Undo goes back.` });
  };

  // ── the material editor (the Graphics editor itself) ──
  const [editing, setEditing] = useState<string | null>(null);
  const [editorNote, setEditorNote] = useState<Note>(null);
  const editStart = useRef<BoardState | null>(null);
  const openEditor = (id: string) => {
    const m = boardNow().materials.find((x) => x.id === id);
    if (!m || m.type !== 'graphic' || !m.doc) return;
    editStart.current = boardNow();
    setEditorNote(null);
    setEditing(id);
  };
  const closeEditor = () => {
    const before = editStart.current;
    const cur = boardNow();
    const m = before?.materials.find((x) => x.id === editing);
    const now = cur.materials.find((x) => x.id === editing);
    if (before && m && now && m !== now) {
      past.current.push({ board: before, label: `${m.name} edited` });
      future.current = [];
      const staleNow = verifyNotes(cur).length;
      setNote({ tone: staleNow ? 'warn' : 'ok', text: `${m.name} edited: what differs from the system is kept as its local changes (listed in the inspector, with a reset).${staleNow ? ' Some notes no longer hold: write them again (select nothing, then “Write the notes again”).' : ''}` });
    }
    editStart.current = null;
    setEditing(null);
    setTick((t) => t + 1);
  };
  const editingMaterial = editing ? (b.materials.find((x) => x.id === editing) as GraphicMaterial | undefined) : undefined;

  const openNode = (n: BoardNode) => {
    if (n.type === 'material') {
      const m = boardNow().materials.find((x) => x.id === n.material);
      if (m?.type === 'graphic' && m.doc) return openEditor(m.id);
      if (m?.type === 'website' && websites.get(m.projectId)) return setNote({ tone: 'ask', text: `${m.name} is a website project of its own: open it in the website editor (Inspector, on the right) to change it. The board shows its page live.` });
      return;
    }
    if ((n.type === 'note' || n.type === 'heading') && !n.locked) setEditingText(n.id);
  };
  const onEdited = (id: string, text: string | null) => {
    setEditingText(null);
    const n = boardNow().nodes.find((x) => x.id === id);
    if (text === null || !n || (n.type !== 'note' && n.type !== 'heading') || text.trim() === n.text) return;
    if (!text.trim()) return void apply([{ op: 'node-remove', ids: [id] }], `${n.type} removed`);
    apply([{ op: 'node-update', id, set: { text } }], n.type === 'note' ? (n.generated ? 'note rewritten (now yours)' : 'note changed') : 'heading changed');
  };

  // ── keyboard ──
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e: KeyboardEvent) => {
    if (view !== 'board' || editing) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input,textarea,select,[contenteditable]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') return e.preventDefault(), e.shiftKey ? redo() : undo();
    if (mod && k === 'y') return e.preventDefault(), redo();
    if (mod && k === '0') return e.preventDefault(), canvas.current?.fit();
    if (mod && (k === '=' || k === '+')) return e.preventDefault(), canvas.current?.zoomBy(1.25);
    if (mod && k === '-') return e.preventDefault(), canvas.current?.zoomBy(0.8);
    if (mod && k === 'a') return e.preventDefault(), setSelection(boardNow().nodes.map((n) => n.id));
    if (e.key === 'Escape') return pending ? setPending(null) : setSelection([]);
    if (!selection.length) return;
    const cur = boardNow();
    const nodes = selection.map((id) => cur.nodes.find((n) => n.id === id)).filter((n): n is BoardNode => !!n);
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const mats = nodes.filter((n) => n.type === 'material').map((n) => (n as Extract<BoardNode, { type: 'material' }>).material);
      const others = nodes.filter((n) => n.type !== 'material' && n.type !== 'system').map((n) => n.id);
      return void apply([...(others.length ? [{ op: 'node-remove', ids: others } as BoardOp] : []), ...mats.map((id) => ({ op: 'material-remove', id }) as BoardOp)], nodes.length > 1 ? `${nodes.length} things removed` : 'removed');
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 40 : 4;
      return void apply([{ op: 'node-move', ids: nodes.map((n) => n.id), dx: e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy: e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0 }], 'nudged');
    }
    if (mod && k === 'g') {
      e.preventDefault();
      return void apply([{ op: e.shiftKey ? 'ungroup' : 'group', ids: nodes.map((n) => n.id) }], e.shiftKey ? 'ungrouped' : 'grouped');
    }
    if (mod && k === 'd') {
      e.preventDefault();
      const mats = nodes.filter((n) => n.type === 'material').map((n) => (n as Extract<BoardNode, { type: 'material' }>).material);
      return void apply(mats.map((id) => ({ op: 'material-duplicate', id }) as BoardOp), 'duplicated');
    }
    if (e.key === 'Enter' && nodes.length === 1) return e.preventDefault(), openNode(nodes[0]);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const shown = pending?.kind === 'ops' ? pending.preview : b;
  const steps: { id: View; label: string; ok: boolean }[] = [
    // a board begun in conversation has its brief there, not in a form
    ...(project.studio && project.studio.via !== 'hand' ? [] : [{ id: 'brief' as View, label: 'Brief', ok: true }]),
    { id: 'system', label: 'System', ok: !!b.brief && b.options.length > 0 },
    { id: 'board', label: 'Board', ok: !!b.system },
  ];
  const sourceName = b.system?.source?.name;

  // ── a board begun in the studio: its brief came from the conversation, so its systems are proposed at once ──
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (project.systemLink && !linked) return;
    autoStarted.current = true;
    if (project.studio?.status !== 'started' || !b.brief || b.options.length || b.system) return;
    void continueFromBrief();
  }, [linked]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the conversation beside the board: words go to the board's own changes in words ──
  const heard = useMemo(() => (pending ? { text: pending.kind === 'ops' ? `Previewing: ${pending.label}. Apply or Discard it under the board.` : pending.kind === 'confirm' ? pending.text : `Previewing the system change: ${pending.label}.` } : note ? { text: note.text } : null), [pending, note]);
  const waitReply = useRailReply(heard, (h) => h.text);
  const waitMaterial = useRailReply(matSaid, (h) => h.text);
  const railAsk = async (said: string): Promise<string | null> => {
    const low = said.toLowerCase();
    // a material open in the graphics editor takes the words, as if typed there
    if (editingMaterial?.doc) {
      // a creative change may be read by the model: the reply can take a little longer than a precise edit
      const wait = waitMaterial(50_000);
      setMatInbox((i) => ({ id: (i?.id ?? 0) + 1, words: said }));
      return wait;
    }
    // a preview waiting: “apply” or “discard” said in words settles it
    if (pending && /^\s*(apply( it)?|yes|keep( it)?|do it|ok(ay)?|looks good|perfect)\b/i.test(said)) {
      applyPending();
      return 'Applied. Undo takes it back.';
    }
    if (pending && /^\s*(discard( it)?|no\b|cancel|not that|never ?mind)/i.test(said)) {
      setPending(null);
      setNote({ tone: 'ok', text: 'Discarded: the board is as it was.' });
      return 'Discarded: the board is as it was.';
    }
    if (view === 'board' && b.system) {
      const wait = waitReply(50_000);
      void ask(said);
      return wait;
    }
    if (view === 'system' && b.options.length) {
      const ord = [/\b(first|1st|one|1)\b/, /\b(second|2nd|two|2)\b/, /\b(third|3rd|three|3)\b/].findIndex((re) => re.test(low));
      if (/\b(more|others?|another|different|again)\b/.test(low)) {
        moreSystems();
        return 'More systems, kept apart from those you have seen.';
      }
      if (ord >= 0 && b.options[ord]) {
        void chooseSystem(b.options[ord]);
        return `Making the board in “${b.options[ord].direction.name}”: every material composed in it, at most three at a time.`;
      }
      return 'Choose the system the board is made in — say “the first one”, or “more” for others.';
    }
    return 'Finish the brief and continue: the systems follow from it.';
  };

  return (
    <>
    {project.studio && <StudioRail studio={project.studio} onStudio={(fn) => update((p) => (p.studio ? { ...p, studio: fn(p.studio) } : p))} onAsk={railAsk} placeholder={view === 'board' ? 'Ask the board: “arrange these into two rows”, “change the accent to green”…' : view === 'system' ? '“The first one”, or “more”' : 'Say what to change'} systemName={linked?.rec.name ?? null} onOpenChange={setRailOpen} />}
    <div className="v0 sb gx bd">
      <header className="v0-head">
        <div className="v0-head-l">
          <button type="button" className="v0-home" onClick={onExit} aria-label="All designs">
            <img src="/socria-mark.png" alt="" width={20} height={20} />
            <span className="v0-brand">
              Socria<em>UX</em>
            </span>
            <span className="v0-tag">Board</span>
          </button>
          <span className="v0-slash" aria-hidden="true">
            /
          </span>
          <input className="v0-name" value={project.name} onChange={(e) => update((p) => ({ ...p, name: e.target.value.slice(0, 80) }))} aria-label="Board name" />
        </div>
        <nav className="sb-seg v0-steps" aria-label="Steps">
          {steps.map((s) => (
            <button key={s.id} type="button" className={`sb-seg-item${view === s.id ? ' is-on' : ''}`} aria-current={view === s.id ? 'step' : undefined} disabled={!s.ok || !!generating} onClick={() => setView(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="v0-head-r">
          <SystemBadge
            project={project}
            linked={linked}
            onApply={(fn) => {
              const r = fn(current.current);
              update(() => r.project);
              setNote({ tone: 'ok', text: r.say });
            }}
          />
          <span className="gx-free" title="Planning, composition, checks and notes run in this browser, at no cost. A change in words is read here too; only one it cannot read plainly is read by the model, within your budget.">
            Made in your browser
          </span>
          <span className={`v0-save s-${save}`} role="status">
            {SAVE_WORDS[save]}
          </span>
          {!signedIn && (
            <a className="sb-link is-meta is-strong" href="/sign-in?redirect_url=/ux-v0">
              Sign in
            </a>
          )}
        </div>
      </header>

      {busy && (
        <p className="gx-busy" role="status">
          {busy}
        </p>
      )}

      {view === 'brief' && (
        <main className="bd-brief">
          <section className="bd-brief-col">
            <p className="sb-label">A board</p>
            <h1 className="bd-h1">Many materials, one design system.</h1>
            <p className="v0-quiet">Say what the campaign is and what it needs: posters, posts, a website, mockups. Every material is composed in one shared system, each its own composition. Your words are used exactly; nothing is invented.</p>
            <label className="gx-field is-wide">
              <span>The request</span>
              <textarea className="bd-words" rows={4} value={words} onChange={(e) => setWords(e.target.value)} placeholder="A launch campaign for “Night Market Lisbon”, “Food, music and makers after dark”: three posters, two Instagram graphics, a website and a product mockup. Annotate the design decisions." />
            </label>
            <button type="button" className="sb-btn is-sm" disabled={!words.trim()} onClick={readWords}>
              Read it
            </button>
          </section>
          {draft && (
            <section className="bd-brief-col" aria-label="What SocriaUX read">
              <p className="gx-panel-sub">The materials</p>
              <ul className="bd-specs">
                {draft.materials.map((s, i) => (
                  <li key={`${s.kind}-${s.format ?? ''}-${s.template ?? ''}-${i}`}>
                    <span>{specLabel(s)}</span>
                    <span className="bd-stepper">
                      <button type="button" className="sb-link is-meta" aria-label={`One fewer ${specLabel(s)}`} onClick={() => setDraft({ ...draft, materials: draft.materials.flatMap((x, j) => (j === i ? (x.count > 1 ? [{ ...x, count: x.count - 1 }] : []) : [x])) })}>
                        −
                      </button>
                      <b>{s.count}</b>
                      <button type="button" className="sb-link is-meta" aria-label={`One more ${specLabel(s)}`} onClick={() => setDraft({ ...draft, materials: draft.materials.map((x, j) => (j === i ? { ...x, count: Math.min(12, x.count + 1) } : x)) })}>
                        +
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <label className="gx-field">
                <span>Add</span>
                <select
                  className="v0-select"
                  value=""
                  onChange={(e) => {
                    const def = SPEC_KINDS[Number(e.target.value)];
                    if (!def) return;
                    const [kind, , format, template] = def;
                    setDraft({ ...draft, materials: [...draft.materials, { kind, count: 1, ...(format ? { format } : {}), ...(template ? { template } : {}) }] });
                  }}
                >
                  <option value="">A material…</option>
                  {SPEC_KINDS.map(([, label], i) => (
                    <option key={label} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="gx-panel-sub">The words (exactly as they will be set)</p>
              {(
                [
                  ['headline', 'Headline'],
                  ['subhead', 'Supporting line'],
                  ['brand', 'Brand or name'],
                  ['cta', 'Call to action'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="gx-field is-wide">
                  <span>{label}</span>
                  <input className="v0-input" value={(draft.content[k] as string | undefined) ?? ''} onChange={(e) => setDraft({ ...draft, content: { ...draft.content, [k]: e.target.value } })} />
                </label>
              ))}
              <label className="gx-field is-wide">
                <span>Details (one a line: dates, a place)</span>
                <textarea className="v0-input" rows={2} value={(draft.content.meta ?? []).join('\n')} onChange={(e) => setDraft({ ...draft, content: { ...draft.content, meta: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4) } })} />
              </label>
              <p className="gx-panel-sub">The design system</p>
              <label className="gx-check">
                <input type="radio" name="bd-src" checked={!draft.systemFrom} onChange={() => setDraft({ ...draft, systemFrom: undefined })} /> Three systems proposed for this board
              </label>
              <label className="gx-check">
                <input type="radio" name="bd-src" checked={!!draft.systemFrom} disabled={!sites.length} onChange={() => setDraft({ ...draft, systemFrom: sites[0]?.id })} /> The system of a website {sites.length ? '' : '(none with a direction yet)'}
              </label>
              {draft.systemFrom && (
                <select className="v0-select" value={draft.systemFrom} onChange={(e) => setDraft({ ...draft, systemFrom: e.target.value })} aria-label="The website">
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="gx-check">
                <input type="checkbox" checked={draft.annotate} onChange={(e) => setDraft({ ...draft, annotate: e.target.checked })} /> Write notes explaining the design decisions
              </label>
              {error && (
                <p className="v0-error-line" role="alert">
                  {error}
                </p>
              )}
              <button type="button" className="sb-btn is-primary" onClick={() => void continueFromBrief()}>
                {draft.systemFrom ? 'Use the website’s system' : 'Propose design systems'} <span className="sb-ar">→</span>
              </button>
            </section>
          )}
        </main>
      )}

      {view === 'system' && b.brief && (
        <main className="bd-systems">
          <p className="sb-label">One design system for every material</p>
          <h1 className="bd-h1">Choose the system the {b.brief.materials.reduce((s, m) => s + m.count, 0)} materials will share.</h1>
          <p className="v0-quiet">Not separate directions for separate materials: every poster, post, page and mockup is composed in the one you choose, each its own composition. Its colours, type and shapes can be changed later, and the materials follow.</p>
          <div className="bd-sys-grid">
            {b.options.map((s, i) => (
              <article key={`${s.id}-${i}`} className="bd-sys">
                <div className="bd-sys-art" dangerouslySetInnerHTML={{ __html: systemOverviewSvg(s, 960, 640, `opt${i}`, measure).replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, '<svg$1 width="100%" height="100%"') }} />
                <h2>{s.direction.name}</h2>
                <p className="v0-quiet">
                  {s.tokens.fonts.display} and {s.tokens.fonts.body} · accent {s.tokens.colors.accent}
                  {s.source ? ` · from the website “${s.source.name}”` : ''}
                </p>
                {s.accentWhy && <p className="v0-quiet">Accent: {s.accentWhy}.</p>}
                <button type="button" className="sb-btn is-sm is-primary" onClick={() => void chooseSystem(s)}>
                  Use this system
                </button>
              </article>
            ))}
          </div>
          <div className="bd-row">
            {!b.brief.systemFrom && (
              <button type="button" className="sb-btn is-sm" onClick={moreSystems}>
                Show three others
              </button>
            )}
            <button type="button" className="sb-link is-meta" onClick={() => setView('brief')}>
              Back to the brief
            </button>
          </div>
        </main>
      )}

      {view === 'board' && b.system && (
        <div className="gx-ws bd-ws">
          <aside className="gx-left bd-left" aria-label="Materials, system, adding, checks and versions">
            <nav className="gx-tabs" role="tablist" aria-label="Panels">
              {(
                [
                  ['materials', 'Materials'],
                  ['system', 'System'],
                  ['add', 'Add'],
                  ['checks', 'Checks'],
                  ['versions', 'Versions'],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={`gx-tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </nav>
            <div className="gx-left-body" role="tabpanel">
              {tab === 'materials' && (
                <MaterialsPanel
                  board={b}
                  selected={selectedMaterials}
                  generating={!!generating}
                  onGenerateRest={() => void runGeneration(null, false)}
                  onFocus={(id) => {
                    const n = b.nodes.find((x) => x.type === 'material' && x.material === id);
                    if (n) {
                      setSelection([n.id]);
                      canvas.current?.focus([n.id]);
                    }
                  }}
                  onRetry={retry}
                  onKeep={keep}
                />
              )}
              {tab === 'system' && <SystemPanel board={b} source={sourceName} onPropose={(next, label) => proposeSystem(next, label)} customs={styleLibrary.styles} onRestyle={proposeRestyle} />}
              {tab === 'add' && (
                <AddPanel
                  board={b}
                  disabled={!!generating}
                  onAddMaterial={addMaterial}
                  onAddWebsite={() => addMaterial('website')}
                  onAddMockup={addMockup}
                  onAddNote={() => addNodeAtCentre({ type: 'note', text: 'A note', generated: false, w: 340, h: 120 }, 'note added')}
                  onAddHeading={() => addNodeAtCentre({ type: 'heading', text: 'A section', level: 2, w: 900, h: 52 }, 'heading added')}
                  onAddPicture={(f) => void addReference(f)}
                />
              )}
              {tab === 'checks' && <ChecksPanel evaluation={evaluation} refining={refining} onRefine={() => void refine()} />}
              {tab === 'versions' && <VersionsPanel board={b} onKeep={keepVersion} onRestore={restoreVersion} />}
            </div>
          </aside>

          <main className="gx-center bd-center">
            <div className="v0-toolbar gx-toolbar" role="toolbar" aria-label="Board">
              <span className="v0-zoom">
                <button type="button" className="sb-link is-meta" onClick={undo} disabled={!past.current.length} title="Undo (⌘Z)">
                  Undo
                </button>
                <button type="button" className="sb-link is-meta" onClick={redo} disabled={!future.current.length} title="Redo (⇧⌘Z)">
                  Redo
                </button>
              </span>
              <span className="v0-zoom">
                <button type="button" className="sb-link is-meta" onClick={() => canvas.current?.zoomBy(0.8)} aria-label="Zoom out">
                  −
                </button>
                <button type="button" className="sb-link is-meta" onClick={() => canvas.current?.fit()} title="Fit (⌘0)">
                  Fit
                </button>
                <button type="button" className="sb-link is-meta" onClick={() => canvas.current?.zoomBy(1.25)} aria-label="Zoom in">
                  +
                </button>
              </span>
              <button type="button" className={`sb-seg-item bd-hand${hand ? ' is-on' : ''}`} aria-pressed={hand} onClick={() => setHand((h) => !h)} title="Pan by dragging (or hold Space)">
                Hand
              </button>
              <details className="gx-export">
                <summary className="sb-btn is-sm is-primary">Export</summary>
                <div className="gx-export-menu" role="menu">
                  <p className="gx-panel-sub">The board overview (a presentation)</p>
                  <button type="button" role="menuitem" onClick={() => void exportAs('overview-png')}>
                    PNG, with the notes
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportAs('overview-png-clean')}>
                    PNG, without the notes
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportAs('overview-pdf')}>
                    PDF
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportAs('overview-svg')}>
                    SVG
                  </button>
                  <p className="gx-panel-sub">The materials (their own files)</p>
                  <button type="button" role="menuitem" onClick={() => void exportAs('all')}>
                    All materials (.zip, with a manifest)
                  </button>
                  <button type="button" role="menuitem" disabled={!selectedMaterials.size} onClick={() => void exportAs('selected')}>
                    The selected materials (.zip)
                  </button>
                  <p className="gx-panel-sub">The board</p>
                  <button type="button" role="menuitem" onClick={() => void exportAs('board')}>
                    Save the board file
                  </button>
                  <button type="button" role="menuitem" onClick={() => openInput.current?.click()}>
                    Open a board file…
                  </button>
                  <p className="v0-quiet gx-export-note">The overview is the board as arranged; each material exports in its own formats (PNG, SVG, PDF for print, a website package).</p>
                </div>
              </details>
              <input ref={openInput} type="file" accept=".json,application/json" hidden onChange={(e) => (e.target.files?.[0] && void openFile(e.target.files[0]), (e.target.value = ''))} />
            </div>
            {generating && (
              <div className="bd-gen" role="status">
                <span>
                  Composing in “{b.system.direction.name}”: {generating.done} of {generating.total} settled, at most 3 at a time · no model calls, $0
                </span>
                <span className="bd-gen-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round((generating.done / Math.max(1, generating.total)) * 100)}%` }} />
                </span>
                <button type="button" className="sb-link is-meta" onClick={() => signal.current && (signal.current.aborted = true)}>
                  Stop after these
                </button>
              </div>
            )}
            <div className={`bd-stage${pending?.kind === 'ops' ? ' is-preview' : ''}`}>
              <BoardCanvas
                board={shown}
                selection={selection}
                onSelect={setSelection}
                onOps={(ops, label) => void apply(ops, label)}
                onOpen={openNode}
                onRetry={retry}
                onKeep={keep}
                editing={editingText}
                onEdited={onEdited}
                href={href}
                measure={measure}
                websites={websites}
                nonce={nonce}
                stale={stale}
                api={canvas}
                readOnly={pending?.kind === 'ops'}
                hand={hand}
              />
              {pending?.kind === 'ops' && <span className="gx-preview-tag">Preview</span>}
            </div>
            {(!(railOpen && project.studio) || pending || note) && (
            <div className="gx-askbar bd-askbar">
              {pending ? (
                <div className="gx-pending bd-pending" role="status">
                  {pending.kind === 'sync' ? (
                    <SyncReview pending={pending} onReset={(id, on) => proposeSystem(pending.next, pending.label, on ? { ...pending.reset, [id]: 'all' } : Object.fromEntries(Object.entries(pending.reset).filter(([k]) => k !== id)))} />
                  ) : (
                    <span>
                      <b>{pending.kind === 'ops' ? 'Preview:' : 'Confirm:'}</b> {pending.kind === 'ops' ? pending.label : pending.text}
                    </span>
                  )}
                  <button type="button" className="sb-btn is-sm is-primary" onClick={applyPending}>
                    Apply
                  </button>
                  <button type="button" className="sb-btn is-sm" onClick={() => (setPending(null), setNote({ tone: 'ok', text: 'Discarded: the board is as it was.' }))}>
                    Discard
                  </button>
                </div>
              ) : (
                railOpen && project.studio ? null : (
                <form
                  className="gx-ask"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask();
                  }}
                >
                  <label htmlFor="bd-ask-in" className="v0-sr">
                    Ask the board for a change
                  </label>
                  <input id="bd-ask-in" value={askWords} onChange={(e) => setAskWords(e.target.value)} placeholder={selection.length ? 'Change the selection: “make these larger on the board”, “regenerate this”, “keep these exactly as they are”…' : 'Ask the board: “arrange these into two rows”, “change the accent to green”, “regenerate only the second poster”…'} autoComplete="off" />
                  <button type="submit" className="sb-btn is-sm is-primary" disabled={!askWords.trim() || !!generating}>
                    Preview
                  </button>
                </form>
                )
              )}
              {note && (
                <p className={`gx-note is-${note.tone}`} role={note.tone === 'warn' ? 'alert' : 'status'}>
                  {note.text}
                </p>
              )}
            </div>
            )}
          </main>

          <aside className="gx-right bd-right" aria-label="Inspector">
            <BoardInspector
              board={b}
              selection={selection}
              websites={websites}
              stale={stale}
              onOps={(ops, label) => void apply(ops, label)}
              onEditMaterial={openEditor}
              onOpenWebsite={(id) => onOpenProject(id)}
              onRegenerate={(ids) => setPending({ kind: 'confirm', label: 'regenerate', text: `Compose ${ids.map((id) => b.materials.find((m) => m.id === id)?.name).join(', ')} again in the same system? Everything else stays exactly as it is.`, run: () => regenerate(ids) })}
              onResetOverrides={resetOverrides}
              onEditNote={(id) => setEditingText(id)}
              onAnnotate={() => runAction({ kind: 'annotate' }, 'notes written again')}
              onArrange={(how: Arrangement) => {
                apply(arrange(boardNow(), how), `arranged: ${how}`);
                window.setTimeout(() => canvas.current?.fit(), 60);
              }}
              onExportMaterial={(id) => void exportOne(id)}
            />
          </aside>

          {editingMaterial?.doc && (
            <div className="bd-editor" role="dialog" aria-label={`${editingMaterial.name} in the graphics editor`}>
              <GraphicEditor
                doc={editingMaterial.doc}
                onChange={(next) => setBoard((x) => applyAll(x, [{ op: 'material-update', id: editingMaterial.id, set: { doc: next } }]))}
                name={`${project.name} ${editingMaterial.name}`}
                direction={directionOfSystem(b.system)}
                kind={editingMaterial.brief.kind}
                kindLabel={editingMaterial.name}
                measure={measure}
                href={href}
                resolve={resolve}
                missingUploads={missing}
                upload={uploadPicture}
                note={editorNote}
                onNote={setEditorNote}
                planNotes={editingMaterial.plan?.said}
                brand={{ title: b.system.name, note: <p className="v0-quiet">The board’s design system. A change made here is local to {editingMaterial.name}: kept when the system changes, reset from the board’s inspector.</p> }}
                toolbarStart={
                  <button type="button" className="sb-btn is-sm bd-back" onClick={closeEditor}>
                    ← Back to the board
                  </button>
                }
                inbox={matInbox}
                onAsked={(t) => setMatSaid({ text: t })}
                hideAsk={!!project.studio && railOpen}
                projectId={project.id}
              />
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

/** A system change before it is applied: what it reaches, what each material keeps, and approval to reset overrides. */
function SyncReview({ pending, onReset }: { pending: Extract<Pending, { kind: 'sync' }>; onReset: (materialId: string, on: boolean) => void }) {
  const { plan } = pending;
  return (
    <div className="bd-sync">
      <p>
        <b>Proposed:</b> {plan.summary}
      </p>
      <ul>
        {plan.entries.map((e) => (
          <li key={e.id} className={`is-${e.outcome}`}>
            <b>{e.name}</b>{' '}
            <span className="v0-quiet">
              {e.outcome === 'updated' ? `${e.updated} propert${e.updated === 1 ? 'y' : 'ies'} updated${e.reset ? `, ${e.reset} reset` : ''}${e.repaired.length ? `, ${e.repaired.length} colour${e.repaired.length === 1 ? '' : 's'} adjusted to stay readable` : ''}` : e.outcome === 'unaffected' ? 'uses nothing that changed' : e.outcome === 'follows-source' ? 'follows the design it shows' : e.outcome === 'website' ? 'a project of its own: carried in separately, as a new version' : 'not composed yet: it will be composed in the new system'}
            </span>
            {e.kept.length > 0 && (
              <span className="bd-kept">
                Kept: {e.kept.map((k) => `${k.name} (${k.prop}): ${k.why}`).join('; ')}.{' '}
                <label className="gx-check">
                  <input type="checkbox" checked={pending.reset[e.id] === 'all'} onChange={(ev) => onReset(e.id, ev.target.checked)} /> Reset {e.name}’s local changes to the system too
                </label>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
