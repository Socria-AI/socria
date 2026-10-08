'use client';

// The Thinking Map — four lenses over one extraction.
//
//   Graph      force-directed; everything at once, alive and settling
//   Structure  layered hierarchy with right-angle connectors
//   Tensions   opposing pairs facing each other
//   Evidence   claims with their support beneath
//
// The graph lens runs a hand-written force simulation (repulsion, edge
// springs, weak centring, hard box separation) and writes transforms
// straight to the DOM each frame. The other lenses are computed layouts, so
// they simply render at fixed coordinates and animate in.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ThinkingMap as TMap, LogosRelation, LogosNode } from '@/lib/logos';
import { MODE_META, NODE_MODES, type NodeMode } from '@/lib/logos-explore';
import type { MapEdit } from '@/lib/map-edit';
import { NodeGlyph } from './NodeGlyph';
import { StatusMark } from './StatusMark';
import { TeX, MathText } from './TeX';
import { MathPlot } from './MathPlot';
import { SceneSurface, isSimulation } from '@/components/surfaces/SceneSurface';
import { ModelView } from '@/components/model/ModelView';
import { activeDoc, editsState, EMPTY_WORKSPACE, modelFor } from '@/lib/model/docs';
import type { Model } from '@/lib/model/schema';
import type { VizModelState, VizOp } from '@/lib/viz-model';
import { MathViz } from './MathViz';
import { MatrixLens } from './MatrixLens';
import type { VizScene } from '@/lib/logos-viz';
import { MathBoard } from './MathBoard';
import { StructureView } from './StructureView';

type TabsAt = 'top' | 'bottom' | 'left' | 'right';
const TABS_KEY = 'socria.map.tabs.v1';
/** Fired on window by Logos 3's Reset view; every map goes back to how it starts. */
export const VIEW_RESET = 'socria:view-reset';

/** The lenses that are a canvas of cards — the plot, the Board and the table draw themselves to fit. */
const drawsCards = (l: LensId) => l !== 'plot' && l !== 'board' && l !== 'matrix';
import { LogosMark } from './LogosMark';
import { OneLock } from './OneLock';
import {
  LENSES,
  RELATION_LABEL,
  availableLenses,
  layoutEvidence,
  layoutStructure,
  layoutTensions,
  layoutSolve,
  layoutFlow,
  layoutTimeline,
  layoutWork,
  cardH,
  GRAPH_W,
  type Connector,
  leadLens,
  type LensId,
  type Placed,
  buildMatrix,
} from '@/lib/logos-layout';
import { attachmentsOf, GRAMMARS, spineOf } from '@/lib/representation';
import { ObjectFigure } from '@/components/objects/ObjectFigure';
import { kindOf, objOf, currentOf, type ThoughtObject } from '@/lib/objects';

/** What a person did to an object of thought, on its way up to be computed. */
export type ObjectAction =
  | { type: 'op'; obj: string; op: string; args: Record<string, string | number>; suggested?: boolean; at?: number }
  | { type: 'seek'; obj: string; at: number }
  | { type: 'select'; obj: string; part: string | null }
  | { type: 'view'; obj: string; view: string };
import {
  IDENTITY,
  NO_INSETS,
  ZOOM_MAX,
  ZOOM_MIN,
  FIT_MAX,
  KEY_NUDGE,
  KEY_PAN,
  boundsOf,
  cameraTransform,
  easeCamera,
  fitCamera,
  hashUnit,
  isDrag,
  keepInView,
  panBy,
  pinchCamera,
  readWheel,
  routeBetween,
  sameCamera,
  toScreen,
  visibleShare,
  zoomAt,
  type Camera,
  type Insets,
  type Pt,
  type Rect,
} from '@/lib/canvas';
import {
  emptyCanvas,
  isPinned,
  lensOf,
  loadCanvas,
  pin,
  saveCanvas,
  unpin,
  withCamera,
  withSettled,
  withoutCameras,
  type CanvasDoc,
} from '@/lib/canvas-store';

type P = { x: number; y: number; vx: number; vy: number };

const SPRING_LEN = 186;
const SPRING_K = 0.03;
const REPULSION = 30000;
const CENTER_PULL = 0.005;
const DAMPING = 0.87;
const ALPHA_DECAY = 0.991;
const ALPHA_MIN = 0.004;
/** air kept between two cards, past their own edges */
const GAP = 16;
const SEPARATION_PASSES = 3;
// Roughly the action menu's height — only used to decide which side to open on.
const MENU_H = 330;

/** How far along a centre-to-centre line a card's edge lies, for a card of this size. */
function boxExit(dx: number, dy: number, d?: { w: number; h: number }): number {
  const hw = (d?.w ?? GRAPH_W) / 2 - 2;
  const hh = (d?.h ?? 52) / 2 - 2;
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  return Math.min(tx, ty, 0.5);
}

/**
 * A laid-out lens's connectors, with every line that touches a card the
 * person moved re-drawn from the card's new place. A line that belonged to
 * the card alone (a timeline tick to an axis it has left) is not drawn.
 */
function rerouted(conns: Connector[], placed: Placed[], pins: Record<string, [number, number]>): Connector[] {
  if (!Object.keys(pins).length) return conns;
  const at = new Map(placed.map((p) => [p.id, p]));
  const box = (p: Placed): Rect => ({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h });
  return conns.map((c) => {
    const moved = (c.from && pins[c.from]) || (c.to && pins[c.to]);
    if (!moved) return c;
    if (!c.from || !c.to) return { ...c, path: '' };
    const a = at.get(c.from);
    const b = at.get(c.to);
    if (!a || !b) return c;
    const r = routeBetween(box(a), box(b));
    return { ...c, path: r.d, ...(c.label ? { lx: r.mx, ly: r.my } : {}) };
  });
}

export type MapNodeRef = { id: string; label: string; type: TMap['nodes'][number]['type'] };

export function ThinkingMap({
  map,
  initialLens: askedLens,
  onAction,
  onNodePress,
  explored,
  changed,
  relevant,
  canFocus,
  onFocus,
  grounded,
  onAddContext,
  onEdit,
  emerging,
  onAskAbout,
  onModelEdited,
  onSelectNode,
  picked,
  onPick,
  guarded,
  lensLimit,
  onLocked,
  researchLocked,
  onViz,
  onVizRead,
  vizOps,
  layoutKey,
  embedded,
  onObject,
  objectSel,
  objectSuggestions,
  workspace,
}: {
  map: TMap;
  initialLens?: LensId;
  /** a card is never inert: pick what to do with this piece of reasoning */
  onAction?: (mode: NodeMode, node: MapNodeRef) => void;
  /** a card was pressed and its actions appeared — for the first-run sequence */
  onNodePress?: () => void;
  /** ids already looked at — marked so you can see what you've examined */
  explored?: Set<string>;
  /** ids that moved in the last extraction, briefly highlighted */
  changed?: Set<string>;
  /** ids the passage being written touches — a soft, persistent light */
  relevant?: Set<string>;
  /** the draft is open, so a node can be held in view while writing */
  canFocus?: boolean;
  onFocus?: (node: MapNodeRef) => void;
  /** how many pieces of grounded context each node carries */
  grounded?: Record<string, number>;
  /** open the Add-context picker for this node */
  onAddContext?: (node: MapNodeRef) => void;
  /** the person edits the map by hand — remove a card, change its status (lib/map-edit.ts) */
  onEdit?: (edit: MapEdit) => void;
  /**
   * The first map, arriving: cards rise one after another and the lines
   * between them draw. A fact about this moment (the person's language has
   * just become structure), not decoration — it is on for a few seconds the
   * first time and never again. Reduced motion turns it off.
   */
  emerging?: boolean;
  /**
   * "Ask about this", carrying a model object's CANONICAL IDENTITY.
   *
   * The host turns it into a turn of conversation. What travels is an id the
   * model owns — so the reply reasons about the object, its provenance and its
   * dependency chain, rather than about what a picture looks like near a pixel.
   */
  onAskAbout?: (id: string, label: string) => void;
  /** a change the surface made to a document's model — a slider, a cursor, a selection, an open view */
  onModelEdited?: (docId: string, model: Model) => void;
  /**
   * A card was selected. In the Logos 3 workspace this makes the idea the
   * workspace's focus — what the inspector describes and what the
   * conversation means by "this". Single-player Logos 2 passes nothing.
   */
  onSelectNode?: (id: string) => void;
  /** objects picked for a synthesis of just those (shift- or ⌘-click) */
  picked?: ReadonlySet<string>;
  onPick?: (id: string) => void;
  /** Answer Guard is on — the board must not reveal a withheld result */
  guarded?: boolean;
  /**
   * How many lenses this plan offers; null or absent is all of them.
   *
   * Both plans offer all of them now: a map read only one way is a map that
   * looks like a diagram rather than like thinking, and that is not a thing
   * anyone upgrades to fix. Kept as a number rather than a boolean so a plan
   * can open two of four without this needing a second shape.
   */
  lensLimit?: number | null;
  onLocked?: () => void;
  /**
   * Research's fair-use ceiling has been reached in this conversation.
   *
   * Not a plan boundary — Socria One stops in the same place — so this only
   * dims the row and routes the press to the explanation, and never to a
   * subscription.
   */
  researchLocked?: boolean;
  /** the reader edited the interactive graph — keep it with the session */
  onViz?: (scene: VizScene) => void;
  /**
   * The seam between the picture and the conversation.
   *
   * Whatever is mounted in the plot lens — a working surface or a plot — hands
   * back a function that reads its own state, and this passes it straight up.
   * The map itself learns nothing about black holes or tangent lines by doing
   * so, which is the property that keeps this general.
   */
  onVizRead?: (read: (() => VizModelState) | null) => void;
  /** changes the conversation asked for, on their way down to the picture */
  vizOps?: { seq: number; ops: VizOp[] } | null;
  /**
   * Which line of thinking this map is, so where the person put its cards
   * (and the view they left it at) is kept for it — in this browser, apart
   * from the map itself (lib/canvas-store.ts). Absent: kept for the visit.
   */
  layoutKey?: string | null;
  /**
   * The map sits inside a page that scrolls (a demo, the showcase): the wheel
   * and a one-finger swipe stay the page's, and only a pinch zooms the map.
   */
  embedded?: boolean;
  /**
   * An object of thought was worked on — an operation chosen, a state
   * stepped to, a part selected. The host computes it (lib/objects/) and the
   * next state comes back down in `map.objects`; an operation's answer says
   * whether it was computed and, if not, why.
   */
  onObject?: (a: ObjectAction) => { ok: boolean; why?: string } | void;
  /** the part of an object the person has selected */
  objectSel?: { obj: string; part: string } | null;
  /** operations Socria suggested in its last reply, offered on the object */
  objectSuggestions?: { id: string; op: string; args: Record<string, string | number>; said: string }[];
  /**
   * Logos 3: no Board, and Structure is a detailed outline that takes the
   * whole panel (components/StructureView.tsx) rather than a canvas of cards.
   */
  workspace?: boolean;
}) {
  /** a canvas of cards, which pans, zooms and drags — every lens but those that draw themselves */
  const isCanvasLens = (l: LensId) => drawsCards(l) && !(workspace && l === 'structure');
  const initialLens: LensId = askedLens ?? 'graph';
  /**
   * A lens the panel was opened on — pinned from "+ View", or asked for by
   * name ("show this as a structure"). It is shown whenever the map can draw
   * it, ahead of the lens the map would lead with, until the person picks
   * another tab. Without this the lead replaced it on the first render.
   */
  const askedRef = useRef<LensId | null>(askedLens ?? null);
  // ── THREE HANDS, THREE THINGS ────────────────────────────────────
  //   drag the canvas  → the camera (lib/canvas.ts), presentational
  //   drag a card      → the layout (lib/canvas-store.ts), this browser's
  //   edit a card      → the map (onEdit → lib/map-edit.ts), canonical
  // Nothing in this block writes to the map, calls a model, or re-renders the
  // component per frame: pointer moves write transforms straight to the DOM
  // and settle into React state once, when the hand lets go.
  const wrapRef = useRef<HTMLDivElement>(null);
  /** the world layer: every card and line, moved as one by the camera */
  const worldRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<Map<string, P>>(new Map());
  const nodeElRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const edgeElRef = useRef<Map<string, SVGPathElement>>(new Map());
  const labelElRef = useRef<Map<string, SVGTextElement>>(new Map());
  /** each graph card's real size, measured — not one size assumed for all */
  const dimsRef = useRef<Map<string, { w: number; h: number }>>(new Map());
  const alphaRef = useRef(1);
  const rafRef = useRef(0);
  const mapRef = useRef(map);
  mapRef.current = map;

  const [lens, setLens] = useState<LensId>(initialLens);
  const lensRef = useRef<LensId>(initialLens);
  lensRef.current = lens;
  /** the lenses that are a canvas of cards — the rest draw themselves to fit */
  const isCanvas = isCanvasLens(lens);

  // ── the layout this browser keeps for this line of thinking ──────
  const canvasRef = useRef<CanvasDoc>(emptyCanvas());
  const keyRef = useRef<string | null | undefined>(undefined);
  const [pinsVer, setPinsVer] = useState(0);
  /** Load the arrangement when the line of thinking changes; its graph positions go with it. */
  // Read in an effect, not during render: the server has no storage, and a
  // first render that differed between the two would not hydrate.
  useLayoutEffect(() => {
    if (keyRef.current === layoutKey) return;
    keyRef.current = layoutKey;
    canvasRef.current = loadCanvas(layoutKey);
    posRef.current = new Map();
    camLensRef.current = null;
    setPinsVer((v) => v + 1);
  }, [layoutKey]);
  const pinsOf = (l: LensId) => canvasRef.current.lenses[l]?.pins ?? {};
  const commitCanvas = (next: CanvasDoc, rerender = true) => {
    canvasRef.current = next;
    saveCanvas(keyRef.current, next);
    if (rerender) setPinsVer((v) => v + 1);
  };

  // WHERE THE LENS TABS SIT — any edge of the map, the person's choice, kept per browser.
  const outerRef = useRef<HTMLDivElement>(null);
  const [tabsAt, setTabsAt] = useState<TabsAt>('top');
  const [tabsDrag, setTabsDrag] = useState<TabsAt | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(TABS_KEY);
      if (v === 'top' || v === 'bottom' || v === 'left' || v === 'right') setTabsAt(v);
    } catch {}
  }, []);
  const placeTabs = (at: TabsAt) => {
    setTabsAt(at);
    try {
      localStorage.setItem(TABS_KEY, at);
    } catch {}
  };

  // The model document this line of thinking is holding, if any. Read from the
  // MAP rather than passed in: the map is the session's canonical state, and a
  // model is part of the thinking rather than a property of this component.
  const doc = useMemo(() => activeDoc(map.models ?? EMPTY_WORKSPACE), [map.models]);
  // Once the person picks a lens by hand, stop auto-switching for them.
  const lensManual = useRef(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // The action menu is drawn in the viewport, above the world — readable at
  // any zoom, and never fighting a neighbouring card for paint order. It is
  // placed in viewport pixels, so the camera moving closes it.
  const [menu, setMenu] = useState<{
    id: string;
    x: number;
    y: number;
    above: boolean;
  } | null>(null);
  const menuFor = menu?.id ?? null;
  const menuRef = useRef(menu);
  menuRef.current = menu;

  // ── the camera ───────────────────────────────────────────────────
  const camRef = useRef<Camera>(IDENTITY);
  /** the person has moved the camera on this lens: from then on, nothing re-centres it for them */
  const movedRef = useRef(false);
  const camLensRef = useRef<LensId | null>(null);
  const vpRef = useRef({ w: 800, h: 600 });
  const insetsRef = useRef<Insets>(NO_INSETS);
  const tweenRef = useRef<Camera | null>(null);
  const frameRef = useRef(0);
  const camSaveRef = useRef(0);
  const zoomLevelRef = useRef<HTMLButtonElement>(null);
  const zoomInRef = useRef<HTMLButtonElement>(null);
  const zoomOutRef = useRef<HTMLButtonElement>(null);
  const fitRef = useRef<HTMLButtonElement>(null);

  // ── a gesture in progress ────────────────────────────────────────
  type Gesture =
    | { kind: 'press'; on: 'canvas' | 'node'; id?: string; pid: number; type: string; x0: number; y0: number }
    | { kind: 'pan'; pid: number; x0: number; y0: number; cam0: Camera }
    | { kind: 'node'; pid: number; id: string; x0: number; y0: number; sx: number; sy: number; k: number }
    | { kind: 'pinch'; a: number; b: number; a0: Pt; b0: Pt; cam0: Camera };
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef<Map<number, Pt>>(new Map());
  /** a drag just ended: the click the browser is about to send is not a click */
  const suppressClickRef = useRef(false);
  /** a card being dragged on a laid-out lens: where it is right now */
  const dragAtRef = useRef<{ id: string; x: number; y: number } | null>(null);
  /** the cards and connectors as last rendered, for re-routing a dragged card's lines */
  const placedNowRef = useRef<Placed[]>([]);
  const connNowRef = useRef<Connector[]>([]);

  // Hold the graph still while a menu is open or a card is in the hand — a
  // target that drifts out from under the cursor is the fastest way to make
  // this feel cheap.
  const frozenRef = useRef(false);
  frozenRef.current = menu !== null;
  const held = () => frozenRef.current || gestureRef.current?.kind === 'node';

  const dimOf = (id: string) => dimsRef.current.get(id) ?? { w: GRAPH_W, h: 64 };

  /** Everything on the canvas, in world coordinates. */
  const contentBounds = (): Rect | null => {
    if (lensRef.current === 'graph') {
      const rects: Rect[] = [];
      for (const n of mapRef.current.nodes) {
        const p = posRef.current.get(n.id);
        if (!p) continue;
        const d = dimOf(n.id);
        rects.push({ x: p.x - d.w / 2, y: p.y - d.h / 2, w: d.w, h: d.h });
      }
      return boundsOf(rects);
    }
    return boundsOf(placedNowRef.current.map((p) => ({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h })));
  };

  /** Fit was asked for by name: show ALL of it, however small that makes it. */
  const fitAllRef = useRef(false);
  const fitTarget = (): Camera | null => {
    const b = contentBounds();
    if (!b) return null;
    const graph = lensRef.current === 'graph';
    if (fitAllRef.current) return fitCamera(b, vpRef.current.w, vpRef.current.h, { pad: 28, insets: insetsRef.current, maxK: FIT_MAX, minK: ZOOM_MIN });
    return fitCamera(b, vpRef.current.w, vpRef.current.h, {
      pad: graph ? 44 : 28,
      insets: insetsRef.current,
      maxK: FIT_MAX,
      // Fitting a hundred cards into a panel makes them unreadable; past this
      // floor the map is shown legibly from its centre (graph) or its start.
      minK: graph ? 0.45 : 0.6,
      align: graph ? 'center' : 'start',
    });
  };

  /** Write the camera to the DOM — the world's transform, the grid, the readout. */
  const applyCam = () => {
    const c = camRef.current;
    const world = worldRef.current;
    if (world) world.style.transform = cameraTransform(c);
    const el = wrapRef.current;
    if (el && isCanvasLens(lensRef.current)) {
      // the notebook grid moves with the paper, so a pan reads as a pan
      let g = 26 * c.k;
      while (g < 13) g *= 2;
      el.style.backgroundSize = `${g}px ${g}px`;
      el.style.backgroundPosition = `${Math.round(c.x)}px ${Math.round(c.y)}px`;
    }
    const pct = Math.round(c.k * 100);
    if (zoomLevelRef.current) {
      zoomLevelRef.current.textContent = `${pct}%`;
      zoomLevelRef.current.setAttribute('aria-label', `Zoom ${pct} percent — back to 100`);
    }
    if (zoomOutRef.current) zoomOutRef.current.disabled = c.k <= ZOOM_MIN + 0.001;
    if (zoomInRef.current) zoomInRef.current.disabled = c.k >= ZOOM_MAX - 0.001;
  };

  /** Is any of the map off-screen? Then the Fit control says so, quietly. */
  const markOffscreen = () => {
    const b = contentBounds();
    const off = !!b && visibleShare(camRef.current, b, vpRef.current.w, vpRef.current.h) < 0.995;
    fitRef.current?.classList.toggle('is-hint', off && movedRef.current);
  };

  const saveCamSoon = () => {
    window.clearTimeout(camSaveRef.current);
    camSaveRef.current = window.setTimeout(() => {
      commitCanvas(withCamera(canvasRef.current, lensRef.current, camRef.current, movedRef.current), false);
      markOffscreen();
    }, 260);
  };

  const flush = () => {
    const t = tweenRef.current;
    if (t) {
      camRef.current = easeCamera(camRef.current, t, 0.24);
      if (camRef.current === t) tweenRef.current = null;
    }
    const drag = dragAtRef.current;
    if (drag) moveStaticCard(drag.id, drag.x, drag.y);
    if (lensRef.current === 'graph' && gestureRef.current?.kind === 'node') paint();
    applyCam();
    if (tweenRef.current) schedule();
  };
  const schedule = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      flush();
    });
  };
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const reducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animateTo = (to: Camera) => {
    if (reducedMotion()) {
      tweenRef.current = null;
      camRef.current = to;
      applyCam();
      return;
    }
    tweenRef.current = to;
    schedule();
  };

  /** The person moved the camera. It is theirs now: auto-fit stops on this lens. */
  const userCam = (next: Camera, animate = false) => {
    const kept = keepInView(next, contentBounds(), vpRef.current.w, vpRef.current.h);
    movedRef.current = true;
    fitAllRef.current = false;
    if (menuRef.current) setMenu(null);
    if (animate) animateTo(kept);
    else {
      tweenRef.current = null;
      camRef.current = kept;
      schedule();
    }
    saveCamSoon();
  };

  /** Show all of it — and go back to following the map as it grows. */
  const fitAll = (animate = true, everything = true) => {
    movedRef.current = false;
    fitAllRef.current = everything;
    const t = fitTarget();
    fitRef.current?.classList.remove('is-hint');
    if (!t) return;
    if (animate) animateTo(t);
    else {
      tweenRef.current = null;
      camRef.current = t;
      applyCam();
    }
    saveCamSoon();
  };

  /** Until the person moves the camera, it keeps the whole map in view as it changes. */
  const follow = (instant = false) => {
    if (movedRef.current || held() || gestureRef.current) return;
    const t = fitTarget();
    if (!t) return;
    if (instant || camLensRef.current !== lensRef.current) {
      tweenRef.current = null;
      camRef.current = t;
      applyCam();
    } else if (!sameCamera(camRef.current, t)) animateTo(t);
  };

  /** The camera this lens was last looked at from — or a fresh fit. */
  const enterLens = (l: LensId) => {
    const saved = canvasRef.current.lenses[l]?.cam;
    const b = contentBounds();
    if (saved?.moved && b && visibleShare(saved, b, vpRef.current.w, vpRef.current.h) > 0.02) {
      // A remembered view that still shows some of the map is kept. One that
      // shows nothing (the map changed elsewhere) would open on blank paper.
      camRef.current = { x: saved.x, y: saved.y, k: saved.k };
      movedRef.current = true;
      tweenRef.current = null;
      applyCam();
    } else {
      movedRef.current = false;
      fitAllRef.current = false;
      camLensRef.current = null;
      follow(true);
    }
    camLensRef.current = l;
    markOffscreen();
  };

  const zoomStep = (dir: -1 | 1) => {
    const c = tweenRef.current ?? camRef.current;
    userCam(zoomAt(c, c.k * (dir > 0 ? 1.25 : 0.8), vpRef.current.w / 2, vpRef.current.h / 2), true);
  };

  /** Keyboard focus landed on a card the camera cannot see: bring it into view. */
  const ensureVisible = (id: string) => {
    const r = rectOf(id);
    if (!r) return;
    const c = camRef.current;
    const a = toScreen(c, r.x, r.y);
    const w = r.w * c.k;
    const h = r.h * c.k;
    const m = 24;
    let dx = 0;
    let dy = 0;
    if (a.x < m) dx = m - a.x;
    else if (a.x + w > vpRef.current.w - m) dx = vpRef.current.w - m - (a.x + w);
    if (a.y < m) dy = m - a.y;
    else if (a.y + h > vpRef.current.h - m) dy = vpRef.current.h - m - (a.y + h);
    if (dx || dy) userCam(panBy(c, dx, dy), true);
  };

  /** A card's box in world coordinates, wherever it is right now. */
  function rectOf(id: string): Rect | null {
    if (lensRef.current === 'graph') {
      const p = posRef.current.get(id);
      if (!p) return null;
      const d = dimOf(id);
      return { x: p.x - d.w / 2, y: p.y - d.h / 2, w: d.w, h: d.h };
    }
    const p = placedNowRef.current.find((q) => q.id === id);
    if (!p) return null;
    const at = dragAtRef.current?.id === id ? dragAtRef.current : p;
    return { x: at.x - p.w / 2, y: at.y - p.h / 2, w: p.w, h: p.h };
  }

  /** A laid-out lens, mid-drag: the card and the lines that touch it, straight to the DOM. */
  function moveStaticCard(id: string, x: number, y: number) {
    const el = nodeElRef.current.get(id);
    if (el) el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    for (const c of connNowRef.current) {
      if (c.from !== id && c.to !== id) continue;
      const path = edgeElRef.current.get(c.key);
      if (!path) continue;
      if (!c.from || !c.to) {
        path.setAttribute('d', '');
        continue;
      }
      const a = rectOf(c.from);
      const b = rectOf(c.to);
      if (!a || !b) continue;
      const r = routeBetween(a, b);
      path.setAttribute('d', r.d);
      const t = labelElRef.current.get(c.key);
      if (t) {
        t.setAttribute('x', String(r.mx));
        t.setAttribute('y', String(r.my - 9));
      }
    }
  }

  /** Put back what a cancelled drag moved, from what was last rendered. */
  function restoreStatic(id: string) {
    const p = placedNowRef.current.find((q) => q.id === id);
    const el = nodeElRef.current.get(id);
    if (p && el) el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`;
    for (const c of connNowRef.current) {
      if (c.from !== id && c.to !== id) continue;
      edgeElRef.current.get(c.key)?.setAttribute('d', c.path);
      const t = labelElRef.current.get(c.key);
      if (t && c.lx != null && c.ly != null) {
        t.setAttribute('x', String(c.lx));
        t.setAttribute('y', String(c.ly - 9));
      }
    }
  }

  /** A card was put down: it is pinned there, in this lens, until they let it go. */
  const placeCard = (id: string, x: number, y: number) => {
    const l = lensRef.current;
    if (l === 'graph') {
      const p = posRef.current.get(id);
      if (p) {
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
      }
      // the neighbours that were not placed by hand make room, gently
      alphaRef.current = Math.max(alphaRef.current, 0.12);
    }
    // Moving a card is taking the camera's job back too: a map that
    // re-centred itself under a card just put down would undo the gesture.
    movedRef.current = true;
    fitAllRef.current = false;
    commitCanvas(withCamera(pin(canvasRef.current, l, id, x, y), l, camRef.current, true));
  };

  const releaseCard = (id: string) => {
    const l = lensRef.current;
    commitCanvas(unpin(canvasRef.current, l, id));
    if (l === 'graph') alphaRef.current = Math.max(alphaRef.current, 0.3);
  };

  // RESET VIEW (Logos 3's "+ View"): the tabs, the camera and the zoom go back
  // to where they start. Where the person put their cards is their work, not
  // the view, and stays.
  const resetRef = useRef(() => {});
  resetRef.current = () => {
    setTabsAt('top');
    setMenu(null);
    try {
      localStorage.removeItem(TABS_KEY);
    } catch {}
    commitCanvas(withoutCameras(canvasRef.current), false);
    fitAll(false, false);
  };
  useEffect(() => {
    const reset = () => resetRef.current();
    window.addEventListener(VIEW_RESET, reset);
    return () => window.removeEventListener(VIEW_RESET, reset);
  }, []);

  useEffect(() => {
    if (!menuFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuFor]);

  // ── the wheel: zoom where the pointer is, pan where the trackpad goes ──
  // Registered by hand because React attaches wheel listeners passively, and
  // without preventDefault the browser zooms or scrolls the page instead.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if (!isCanvasLens(lensRef.current)) return;
    if ((e.target as Element | null)?.closest?.('.lg-acts')) return;
    // On a page that scrolls past the map (a demo, the showcase) the wheel is
    // the page's; only a pinch, or ctrl, belongs to the map.
    if (embedded && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const it = readWheel(e);
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const c = camRef.current;
    if (it.kind === 'zoom') userCam(zoomAt(c, c.k * it.factor, e.clientX - r.left, e.clientY - r.top));
    else userCam(panBy(c, it.dx, it.dy));
  };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const on = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, []);

  // ── pointers: one handler for mouse, pen and touch ──────────────────
  const endGesture = (commit: boolean) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    const el = wrapRef.current;
    el?.classList.remove('is-panning', 'is-dragging-node');
    if (!g) return;
    if (g.kind === 'pan' || g.kind === 'pinch') {
      suppressClickRef.current = true;
      saveCamSoon();
      return;
    }
    if (g.kind !== 'node') return;
    nodeElRef.current.get(g.id)?.classList.remove('is-dragging');
    suppressClickRef.current = true;
    const graph = lensRef.current === 'graph';
    if (!commit) {
      // cancelled — Escape, a lost pointer, the window losing focus: it goes back
      if (graph) {
        const p = posRef.current.get(g.id);
        if (p) {
          p.x = g.sx;
          p.y = g.sy;
        }
        paint();
      } else restoreStatic(g.id);
      dragAtRef.current = null;
      return;
    }
    const at = graph ? posRef.current.get(g.id) : dragAtRef.current;
    dragAtRef.current = null;
    if (at) placeCard(g.id, at.x, at.y);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isCanvasLens(lensRef.current)) return;
    suppressClickRef.current = false;
    const pts = pointersRef.current;
    const t = e.target as HTMLElement;
    // Controls keep their own clicks: the menu, the zoom, the tabs, the bar.
    if (t.closest('.lg-acts, .lg-zoom, .mp-tabs, .mp-top, a, input, textarea, select') ||
        (t.closest('button') && !t.closest('.lg-node'))) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // A second finger turns whatever the first was doing into a pinch.
    if (pts.size === 2) {
      const g = gestureRef.current;
      if (g?.kind === 'node') endGesture(true);
      const [a, b] = Array.from(pts.keys());
      try {
        wrapRef.current?.setPointerCapture(a);
        wrapRef.current?.setPointerCapture(b);
      } catch {}
      gestureRef.current = { kind: 'pinch', a, b, a0: { ...pts.get(a)! }, b0: { ...pts.get(b)! }, cam0: camRef.current };
      if (menuRef.current) setMenu(null);
      return;
    }
    if (pts.size > 2) return;

    const card = t.closest('.lg-node-pos') as HTMLElement | null;
    const id = card?.dataset.id;
    // The middle button always pans, whatever it lands on.
    const onNode = !!id && e.button !== 1;
    gestureRef.current = { kind: 'press', on: onNode ? 'node' : 'canvas', id: onNode ? id : undefined, pid: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY };
    if (e.button === 1) e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pts = pointersRef.current;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      const a1 = pts.get(g.a);
      const b1 = pts.get(g.b);
      if (!a1 || !b1) return;
      const r = wrapRef.current!.getBoundingClientRect();
      const o = (p: Pt) => ({ x: p.x - r.left, y: p.y - r.top });
      userCam(pinchCamera(g.cam0, o(g.a0), o(g.b0), o(a1), o(b1)));
      return;
    }
    if (e.pointerId !== g.pid) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.kind === 'press') {
      if (!isDrag(dx, dy, g.type)) return;
      try {
        wrapRef.current?.setPointerCapture(e.pointerId);
      } catch {}
      if (menuRef.current) setMenu(null);
      if (g.on === 'node' && g.id) {
        const r = rectOf(g.id);
        if (!r) {
          gestureRef.current = null;
          return;
        }
        const sx = r.x + r.w / 2;
        const sy = r.y + r.h / 2;
        gestureRef.current = { kind: 'node', pid: g.pid, id: g.id, x0: g.x0, y0: g.y0, sx, sy, k: camRef.current.k };
        nodeElRef.current.get(g.id)?.classList.add('is-dragging');
        wrapRef.current?.classList.add('is-dragging-node');
        setHovered(null);
      } else {
        gestureRef.current = { kind: 'pan', pid: g.pid, x0: g.x0, y0: g.y0, cam0: camRef.current };
        wrapRef.current?.classList.add('is-panning');
      }
      return onPointerMove(e);
    }
    if (g.kind === 'pan') {
      userCam(panBy(g.cam0, dx, dy));
      return;
    }
    if (g.kind === 'node') {
      const x = g.sx + dx / g.k;
      const y = g.sy + dy / g.k;
      if (lensRef.current === 'graph') {
        const p = posRef.current.get(g.id);
        if (p) {
          p.x = x;
          p.y = y;
          p.vx = 0;
          p.vy = 0;
        }
      } else dragAtRef.current = { id: g.id, x, y };
      schedule();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const pts = pointersRef.current;
    pts.delete(e.pointerId);
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      // One finger lifted: the other carries on as a pan, from where it is.
      const rest = Array.from(pts.entries())[0];
      if (rest && (rest[0] === g.a || rest[0] === g.b)) {
        gestureRef.current = { kind: 'pan', pid: rest[0], x0: rest[1].x, y0: rest[1].y, cam0: camRef.current };
        return;
      }
      endGesture(true);
      return;
    }
    if (e.pointerId !== g.pid) return;
    if (g.kind === 'press') {
      gestureRef.current = null;
      return;
    }
    endGesture(true);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === 'pinch' || ('pid' in g && g.pid === e.pointerId)) endGesture(g.kind !== 'node');
  };

  // Escape puts a card back mid-drag; the window losing focus ends whatever
  // the hand was doing, so nothing is left stuck to a pointer that is gone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gestureRef.current?.kind === 'node') {
        e.preventDefault();
        endGesture(false);
      }
    };
    const onBlur = () => {
      pointersRef.current.clear();
      if (gestureRef.current) endGesture(gestureRef.current.kind !== 'node');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
    // endGesture reads only refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The canvas itself, focused: arrows move around, + and − zoom, 0 fits. */
  const onCanvasKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !isCanvasLens(lensRef.current)) return;
    const c = camRef.current;
    const step = e.shiftKey ? KEY_PAN * 4 : KEY_PAN;
    const pans: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (pans[e.key]) {
      e.preventDefault();
      userCam(panBy(c, ...pans[e.key]), true);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomStep(1);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomStep(-1);
    } else if (e.key === '0') {
      e.preventDefault();
      fitAll();
    } else if (e.key === 'Escape') {
      setMenu(null);
      setFocused(null);
    }
  };

  /** Alt (Option) + arrows on a focused card moves it, the keyboard's drag. */
  const nudgeCard = (id: string, key: string, big: boolean) => {
    const d = big ? KEY_NUDGE * 4 : KEY_NUDGE;
    const by: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    const r = rectOf(id);
    if (!r || !by[key]) return false;
    const x = r.x + r.w / 2 + by[key][0];
    const y = r.y + r.h / 2 + by[key][1];
    setMenu(null);
    placeCard(id, x, y);
    if (lensRef.current === 'graph') paint();
    requestAnimationFrame(() => ensureVisible(id));
    return true;
  };

  const lenses = useMemo(() => availableLenses(map, { workspace }), [map, workspace]);


  // The lens this map leads with — the signature view for what it holds,
  // never a stub. Every plan opens all of them, so `open` below is null and
  // nothing is locked; where a plan does clip them, it keeps the lead first
  // and then the rest in order, so the reading that IS the answer is never
  // the one withheld and nobody is dropped onto a tab they cannot open.
  // A built model is a picture of its own: it leads the same way a scene
  // does. Without this a map carrying a document and no scene opened on the
  // concept graph, and the first-model sequence asked for a value to be
  // moved on a surface that was a tab away.
  const lead = leadLens(lenses, !!map.viz || !!map.models?.docs?.length, map.building);
  const open = useMemo(() => {
    if (lensLimit === null || lensLimit === undefined) return null;
    const ordered = [
      ...(lead ? [lead] : []),
      ...lenses.filter((l) => l !== lead),
    ];
    return new Set(ordered.slice(0, Math.max(1, lensLimit)));
  }, [lensLimit, lead, lenses]);
  const lensLocked = (id: LensId) => !!open && !open.has(id);

  // Open on the lens that IS the answer, unless the reader has since chosen
  // otherwise. A map carrying a scene used to open on the concept graph with
  // the diagram an unlabelled tab away — the picture had been built and
  // nothing showed it.
  useEffect(() => {
    if (!lenses.length) return;
    // Where a plan does clip the lenses, nothing may leave the reader on one
    // they cannot open. The click handler already refuses a locked tab, but
    // two paths went around it: an initialLens outside the open set, and the
    // fallback below, which reached for lenses[0] rather than for one they
    // can actually use. Either put a locked lens in the active slot, where
    // its content then rendered: the panel checks which lens is selected,
    // never whether it is allowed.
    if (open && !open.has(lens)) {
      setLens(lead ?? lenses[0]);
      return;
    }
    const asked = askedRef.current;
    if (asked && !lensManual.current && lenses.includes(asked) && !(open && !open.has(asked))) {
      if (lens !== asked) setLens(asked);
      return;
    }
    // The lens they were on no longer exists. Fall back to the one that IS
    // the answer for this map rather than to whatever sorts first.
    if (!lenses.includes(lens)) {
      setLens(lead ?? lenses[0]);
      return;
    }
    if (!lensManual.current && lead && lens !== lead) setLens(lead);
  }, [lenses, lens, lead, open]);

  const edgeKey = (e: { from: string; to: string; relation: string }) =>
    `${e.from}~${e.to}~${e.relation}`;

  const active = hovered ?? focused;
  const related = useMemo(() => {
    if (!active) return null;
    const nodes = new Set<string>([active]);
    const edges = new Set<string>();
    for (const e of map.edges) {
      if (e.from === active || e.to === active) {
        nodes.add(e.from);
        nodes.add(e.to);
        edges.add(edgeKey(e));
      }
    }
    return { nodes, edges };
  }, [active, map.edges]);

  // ── static lenses ────────────────────────────────────────────────
  const staticLayout = useMemo(() => {
    if (lens === 'graph' || !drawsCards(lens) || (workspace && lens === 'structure')) return null;
    const { w, h } = size;
    if (lens === 'structure') return layoutStructure(map, w, h);
    if (lens === 'tensions') return layoutTensions(map, w, h);
    if (lens === 'solve') return layoutSolve(map, w, h);
    if (lens === 'flow') return layoutFlow(map, w, h);
    if (lens === 'timeline') return layoutTimeline(map, w, h);
    if (lens === 'work') return layoutWork(map, w, h);
    return layoutEvidence(map, w, h);
  }, [lens, map, size, workspace]);

  // ── graph lens: seed positions ───────────────────────────────────
  // Deterministic, so the same map opens the same way on every load; and
  // incremental, so a new turn of conversation places what is new near what
  // it touches without shaking everything that was already settled.
  const edgeSigRef = useRef('');
  useLayoutEffect(() => {
    if (lens !== 'graph') return;
    const pos = posRef.current;
    const ids = new Set(map.nodes.map((n) => n.id));
    let removed = 0;
    for (const id of Array.from(pos.keys()))
      if (!ids.has(id)) {
        pos.delete(id);
        removed++;
      }
    const lay = lensOf(canvasRef.current, 'graph');
    const before = pos.size;
    let fresh = 0;
    let remembered = 0;
    let spiral = 0;
    // where a brand-new, unconnected card goes: around what is already there
    let cx = 0;
    let cy = 0;
    if (pos.size) {
      for (const p of pos.values()) {
        cx += p.x;
        cy += p.y;
      }
      cx /= pos.size;
      cy /= pos.size;
    }
    for (const n of map.nodes) {
      const pinned = lay.pins[n.id];
      const have = pos.get(n.id);
      if (pinned) {
        if (have) {
          have.x = pinned[0];
          have.y = pinned[1];
        } else {
          pos.set(n.id, { x: pinned[0], y: pinned[1], vx: 0, vy: 0 });
          remembered++;
        }
        continue;
      }
      if (have) continue;
      const settled = lay.settled?.[n.id];
      if (settled) {
        pos.set(n.id, { x: settled[0], y: settled[1], vx: 0, vy: 0 });
        remembered++;
        continue;
      }
      fresh++;
      const neighbour = map.edges.find(
        (e) => (e.from === n.id && pos.has(e.to)) || (e.to === n.id && pos.has(e.from))
      );
      const anchor = neighbour ? pos.get(neighbour.from === n.id ? neighbour.to : neighbour.from) : null;
      if (anchor) {
        const angle = hashUnit(n.id) * Math.PI * 2;
        pos.set(n.id, {
          x: anchor.x + Math.cos(angle) * SPRING_LEN * 0.85,
          y: anchor.y + Math.sin(angle) * SPRING_LEN * 0.85,
          vx: 0,
          vy: 0,
        });
      } else {
        // a sunflower spiral: evenly spread from the first card, so a large
        // map starts out spread rather than piled on one point
        const i = before + spiral++;
        const r = 96 * Math.sqrt(i + 0.5);
        const a = i * 2.399963;
        pos.set(n.id, { x: cx + Math.cos(a) * r * 1.5, y: cy + Math.sin(a) * r, vx: 0, vy: 0 });
      }
    }
    const sig = map.edges.map((e) => `${e.from}>${e.to}`).join('|');
    const edgesChanged = sig !== edgeSigRef.current;
    edgeSigRef.current = sig;
    if (fresh) alphaRef.current = Math.max(alphaRef.current, before + remembered === 0 ? 1 : 0.4);
    else if (remembered && before === 0) alphaRef.current = 0.03; // as it was left
    else if (edgesChanged || removed) alphaRef.current = Math.max(alphaRef.current, 0.15);
    paint();
    if (camLensRef.current !== 'graph') enterLens('graph');
    else follow();
    // `paint` and the camera helpers read refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, lens, pinsVer]);

  // Each card's real size, so cards of three lines are kept apart as cards of
  // three lines — the old separation assumed every card was one size.
  useLayoutEffect(() => {
    if (lens !== 'graph') return;
    const dims = dimsRef.current;
    for (const [id, el] of nodeElRef.current) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w && h) dims.set(id, { w, h });
    }
  }, [map, lens]);

  const paint = useCallback(() => {
    // The same card elements serve every lens. A frame of the graph's loop
    // that lands after the switch to a laid-out lens must not write graph
    // positions over the lens's own.
    if (lensRef.current !== 'graph') return;
    const pos = posRef.current;
    for (const [id, el] of nodeElRef.current) {
      const p = pos.get(id);
      if (p && el) el.style.transform = `translate(-50%, -50%) translate(${Math.round(p.x * 10) / 10}px, ${Math.round(p.y * 10) / 10}px)`;
    }
    for (const [key, el] of edgeElRef.current) {
      const [from, to] = key.split('~');
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b || !el) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      // leave each card at its own edge
      const ta = boxExit(dx, dy, dimsRef.current.get(from));
      const tb = boxExit(dx, dy, dimsRef.current.get(to));
      if (ta + tb >= 0.98) {
        el.setAttribute('d', '');
        continue;
      }
      const ax = a.x + dx * ta;
      const ay = a.y + dy * ta;
      const bx = b.x - dx * tb;
      const by = b.y - dy * tb;
      const off = Math.min(22, len * 0.1);
      const cx = (ax + bx) / 2 - (dy / len) * off;
      const cy = (ay + by) / 2 + (dx / len) * off;
      el.setAttribute('d', `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`);
    }
  }, []);

  // ── graph lens: simulation ───────────────────────────────────────
  // No box: the canvas is as large as the thinking. It used to clamp every
  // card inside the panel AFTER separating them, which pushed cards straight
  // back into each other at the edges — the clumping people saw. The camera
  // now follows the map instead (until the person moves it).
  useEffect(() => {
    if (lens !== 'graph') return;
    let frame = 0;
    const step = () => {
      if (lensRef.current !== 'graph') return;
      const alpha = alphaRef.current;
      const graphPins = canvasRef.current.lenses.graph?.pins;
      const dragging = gestureRef.current?.kind === 'node' ? gestureRef.current.id : null;
      const fixed = (id: string) => id === dragging || !!graphPins?.[id];
      if (alpha > ALPHA_MIN && !held()) {
        const pos = posRef.current;
        const nodes = mapRef.current.nodes;
        const edges = mapRef.current.edges;

        for (let i = 0; i < nodes.length; i++) {
          const a = pos.get(nodes[i].id);
          if (!a) continue;
          for (let j = i + 1; j < nodes.length; j++) {
            const b = pos.get(nodes[j].id);
            if (!b) continue;
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let d = Math.hypot(dx, dy);
            if (d < 0.01) {
              // deterministic, so two loads of one map come to rest alike
              dx = ((i * 7 + j * 3) % 11) - 5;
              dy = ((i * 5 + j * 11) % 13) - 6;
              d = Math.hypot(dx, dy) || 1;
            }
            const eff = Math.max(d, 82);
            const f = (REPULSION / (eff * eff)) * alpha;
            a.vx -= (dx / d) * f;
            a.vy -= (dy / d) * f;
            b.vx += (dx / d) * f;
            b.vy += (dy / d) * f;
          }
        }
        for (const e of edges) {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const f = (d - SPRING_LEN) * SPRING_K * alpha;
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
        }
        for (const n of nodes) {
          const p = pos.get(n.id);
          if (!p) continue;
          if (fixed(n.id)) {
            p.vx = 0;
            p.vy = 0;
            continue;
          }
          p.vx += -p.x * CENTER_PULL * alpha;
          p.vy += -p.y * CENTER_PULL * alpha;
          p.vx *= DAMPING;
          p.vy *= DAMPING;
          p.x += p.vx;
          p.y += p.vy;
        }
        // hard separation, card by card at each card's real size; a card
        // the person placed never moves — the other one makes room
        for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
          for (let i = 0; i < nodes.length; i++) {
            const ia = nodes[i].id;
            const a = pos.get(ia);
            if (!a) continue;
            const da = dimOf(ia);
            const fa = fixed(ia);
            for (let j = i + 1; j < nodes.length; j++) {
              const ib = nodes[j].id;
              const b = pos.get(ib);
              if (!b) continue;
              const fb = fixed(ib);
              if (fa && fb) continue;
              const db = dimOf(ib);
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const ox = (da.w + db.w) / 2 + GAP - Math.abs(dx);
              const oy = (da.h + db.h) / 2 + GAP - Math.abs(dy);
              if (ox <= 0 || oy <= 0) continue;
              const wa = fa ? 0 : fb ? 1 : 0.5;
              const wb = fb ? 0 : fa ? 1 : 0.5;
              if (ox < oy) {
                const s = ox * (dx < 0 ? -1 : 1);
                a.x -= s * wa;
                b.x += s * wb;
              } else {
                const s = oy * (dy < 0 ? -1 : 1);
                a.y -= s * wa;
                b.y += s * wb;
              }
            }
          }
        }
        const next = alpha * ALPHA_DECAY;
        alphaRef.current = next;
        paint();
        // remember where it came to rest, once, as it comes to rest
        if (next <= ALPHA_MIN) {
          const settled: Record<string, [number, number]> = {};
          for (const n of nodes) {
            const p = pos.get(n.id);
            if (p) settled[n.id] = [p.x, p.y];
          }
          commitCanvas(withSettled(canvasRef.current, 'graph', settled), false);
          markOffscreen();
        }
        if (++frame % 5 === 0) follow();
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // the loop reads refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint, lens]);

  // The panel's size. A laid-out lens is computed for it; the camera keeps
  // following the map (or, once the person has moved it, stays exactly where
  // they left it — a panel growing shorter under an open menu moves nothing).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      insetsRef.current = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };
      const wider = Math.abs(r.width - vpRef.current.w) > 1;
      vpRef.current = { w: r.width, h: r.height };
      setSize({ w: r.width, h: r.height });
      if (wider && menuRef.current) setMenu(null);
      follow(true);
      markOffscreen();
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tabs moved to a side: the canvas's free area changed with them.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    insetsRef.current = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    follow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsAt]);

  // The camera is the DOM's, not React's: put it back after every render.
  useLayoutEffect(() => {
    applyCam();
  });


  const dim = (on: boolean) => (related && !on ? ' is-dim' : '');

  /** The node types on screen, in the order they first appear — see the key below. */
  const legendTypes = useMemo(() => {
    const seen: string[] = [];
    for (const n of map.nodes) if (n.type && !seen.includes(n.type)) seen.push(n.type);
    return seen.slice(0, 8);
  }, [map.nodes]);
  const caption =
    staticLayout?.caption ?? LENSES.find((l) => l.id === lens)!.caption;
  /** Where the surface's close goes: the map, or the first lens the reader may open that is not the surface. */
  const closeTo = lenses.find((l) => l !== 'plot' && !lensLocked(l)) ?? null;
  /** The model on the plate when the plot lens is showing one — the design's "working surface". */
  const surfaceTitle =
    lens !== 'plot'
      ? null
      : doc
        ? modelFor(doc).title
        : map.viz?.built?.title
          ? map.viz.built.title
          : map.viz && isSimulation(map.viz)
            ? String(map.viz.sim?.object ?? 'simulation').replace(/-/g, ' ')
            : map.viz
              ? 'Plot'
              : null;

  // THE DETAILS OF EACH PART OF THE SHAPE — a constraint on a step, a question
  // about a branch — read from canonical state, so the card's menu lists them
  // in whichever lens it is opened from.
  const details = useMemo(() => {
    const kind = map.building?.kind;
    const spine = spineOf(map, kind && GRAMMARS[kind].ordered ? kind : undefined);
    return spine.size ? attachmentsOf(map, spine) : new Map<string, LogosNode[]>();
  }, [map]);
  // In a shape's own lens a card says what it DOES there; elsewhere, what it is.
  const shapeLens = lens === 'flow' || lens === 'timeline';

  // A laid-out lens, with the cards the person moved where they put them —
  // and every line touching a moved card re-routed to where it now is.
  const lensPins = lens !== 'graph' && isCanvas ? pinsOf(lens) : {};
  const placedWithPins: Placed[] = (staticLayout?.placed ?? []).map((p) =>
    lensPins[p.id] ? { ...p, x: lensPins[p.id][0], y: lensPins[p.id][1] } : p
  );
  const cards: Placed[] =
    lens === 'graph'
      ? map.nodes.map((n) => ({
          id: n.id,
          node: n,
          x: 0,
          y: 0,
          w: GRAPH_W,
          h: cardH(n.label, GRAPH_W),
        }))
      : placedWithPins;

  const connectors: Connector[] =
    lens === 'graph'
      ? map.edges.map((e) => ({
          key: edgeKey(e),
          path: '',
          relation: e.relation as LogosRelation,
          strength: e.strength,
        }))
      : rerouted(staticLayout?.connectors ?? [], placedWithPins, lensPins);
  placedNowRef.current = lens === 'graph' ? [] : cards;
  connNowRef.current = lens === 'graph' ? [] : connectors;

  // Each new lens, and each new arrangement of a laid-out one: the camera
  // either follows it (nobody has moved it) or stays exactly where it was.
  useLayoutEffect(() => {
    if (!isCanvasLens(lens) || lens === 'graph') return;
    if (camLensRef.current !== lens) enterLens(lens);
    else follow();
    // the camera helpers read refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, staticLayout, pinsVer]);

  return (
    <div ref={outerRef} className={`lg-map-wrap${emerging ? ' is-emerging' : ''} tabs-${tabsAt}${tabsDrag ? ' is-moving-tabs' : ''}`} data-lens={lens}>
      {/* ── THE PLATE'S TOP BAR, from the design project's Copy 8 ────────
          The lenses used to float bare above the figure with nothing holding
          them, so the panel began with a row of pills and no statement of what
          you were looking at. The design puts them on a rule under a bar that
          names the lens and asks its question — the caption that was already
          written for every lens and was printed at the FOOT of the panel,
          where it arrived after the thing it was meant to introduce. */}
      {lenses.length > 1 && (
        <div className="mp-top">
          {surfaceTitle ? (
            // A WORKING SURFACE, named as the design names it: "{what} surface ·
            // a working surface", with the design's close — which here means
            // back to the map, since the map is what the plate is when no
            // surface is up. The lens tabs stay, because they are how the
            // surfaces are reached; the design's select was the same control.
            <>
              <span className="l">{surfaceTitle} surface</span>
              <span className="st">a working surface</span>
              {/* Only where there is somewhere to close TO: a plan that clips
                  the lenses to this one has no map behind the surface, and a
                  close that bounced straight back would be a dead button. */}
              {closeTo && (
                <button
                  type="button"
                  className="mp-x"
                  aria-label="Close the surface"
                  title="Back to the map"
                  onClick={() => {
                    lensManual.current = true;
                    askedRef.current = null;
                    setLens(closeTo);
                    setFocused(null);
                    setMenu(null);
                  }}
                >
                  ×
                </button>
              )}
            </>
          ) : (
            <>
              <span className="l">{LENSES.find((l) => l.id === lens)?.label ?? 'Map'}</span>
              <span className="st">{caption}</span>
            </>
          )}
        </div>
      )}
      {lenses.length > 1 && (
        <div className="mp-tabs" role="tablist" aria-label="Map lens">
          {/* The tabs go where the person wants them: drag the grip to any
              edge of the map, or use the arrow keys on it. */}
          <button
            type="button"
            className="mp-tabs-grip"
            aria-label={`Move the lens tabs — now at the ${tabsAt}. Drag, or use the arrow keys.`}
            title="Drag to move the tabs"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setTabsDrag(tabsAt);
            }}
            onPointerMove={(e) => {
              if (!tabsDrag) return;
              const r = outerRef.current?.getBoundingClientRect();
              if (!r) return;
              const d: [TabsAt, number][] = [
                ['left', (e.clientX - r.left) / r.width],
                ['right', (r.right - e.clientX) / r.width],
                ['top', (e.clientY - r.top) / r.height],
                ['bottom', (r.bottom - e.clientY) / r.height],
              ];
              const z = d.sort((a, b) => a[1] - b[1])[0][0];
              if (z !== tabsDrag) setTabsDrag(z);
            }}
            onPointerUp={() => {
              if (tabsDrag) placeTabs(tabsDrag);
              setTabsDrag(null);
            }}
            onPointerCancel={() => setTabsDrag(null)}
            onKeyDown={(e) => {
              const to: Partial<Record<string, TabsAt>> = { ArrowUp: 'top', ArrowDown: 'bottom', ArrowLeft: 'left', ArrowRight: 'right' };
              if (to[e.key]) {
                e.preventDefault();
                placeTabs(to[e.key]!);
              }
            }}
          >
            <span aria-hidden="true" />
          </button>
          {LENSES.filter((l) => lenses.includes(l.id)).map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={lens === l.id}
              className={`lg-lens${lens === l.id ? ' is-on' : ''}${
                lensLocked(l.id) ? ' is-locked' : ''
              }`}
              data-lens={l.id}
              onClick={() => {
                if (lensLocked(l.id)) {
                  onLocked?.();
                  return;
                }
                lensManual.current = true;
                askedRef.current = null;
                setLens(l.id);
                setFocused(null);
                setMenu(null);
              }}
            >
              {l.label}
              {lensLocked(l.id) && <OneLock />}
            </button>
          ))}
        </div>
      )}

      <div
        className={`lg-map${isCanvas ? ' can-pan' : ''}${embedded ? ' is-embedded' : ''}`}
        ref={wrapRef}
        data-tour={embedded ? undefined : 'map'}
        // THE CANVAS. Drag empty paper to move around; drag a card to move
        // it; wheel or pinch to zoom where the pointer is; two fingers pan and
        // pinch on a touch screen. Focused, the arrow keys move around it.
        tabIndex={isCanvas && map.nodes.length ? 0 : undefined}
        role={isCanvas ? 'region' : undefined}
        aria-label={
          isCanvas
            ? 'Map. Drag to move around, or use the arrow keys; plus and minus zoom; 0 shows all of it. Alt and an arrow key moves a card.'
            : undefined
        }
        onKeyDown={onCanvasKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={(e) => {
          // the browser took the pointer away (an element went, a system
          // gesture began): whatever it was doing ends, kept where it is
          // Only the canvas's own capture. A touch is captured implicitly by
          // the card it starts on; taking it over for a drag releases that
          // one, and the release bubbles here — it is not the end of anything.
          if (e.target !== e.currentTarget) return;
          const g = gestureRef.current;
          if (g && g.kind !== 'press' && g.kind !== 'pinch' && g.pid === e.pointerId) {
            pointersRef.current.delete(e.pointerId);
            endGesture(true);
          }
        }}
        // A drag is never also a click: the click the browser sends at the end
        // of one is swallowed here, before any card or the canvas sees it.
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onClick={() => {
          setFocused(null);
          setMenu(null);
        }}
      >
        {map.nodes.length === 0 && (
          <div className="lg-map-empty">
            <span className="lg-map-empty-mark" aria-hidden="true">
              <LogosMark size={46} />
            </span>
            <p>The map builds as you talk.</p>
          </div>
        )}

        {map.nodes.length > 0 && staticLayout?.empty && (
          <div className="lg-map-empty">
            <p>{staticLayout.empty}</p>
          </div>
        )}

        {/* The plot lens draws the mathematics itself, not cards. A scene
            makes it interactive — parameters, a clock, the idea in motion;
            without one it stays the static drawing it has always been. */}
        {lens === 'plot' &&
          (map.viz || doc ? (
            // A SIMULATED OBJECT GETS ITS OWN SURFACE, not the plot renderer.
            //
            // Everything else here is a picture of a formula, and MathViz draws
            // those exactly right: orthographic, because a perspective camera
            // makes equal quantities look unequal and a graph must not lie
            // about that. An accretion disc is the opposite case — it is a
            // thing at a place, and drawn flat with no camera and nothing
            // passing behind anything it reads as a diagram of a black hole
            // rather than one. The surfaces are the real ones; this is where
            // the lens reaches them.
            // A SCENE THAT CARRIES A MODEL IS DRAWN BY THE ENGINE.
            //
            // Three routes out of one lens, in order of how much the picture
            // knows about itself: a structured model (lib/model/) drawn by
            // the one renderer that draws every model; a named simulated
            // object with a surface of its own; and everything else, which is
            // a figure of an expression and belongs on the plot renderer.
            // The lens learns nothing new for any of them.
            // A MODEL DOCUMENT FIRST, when this line of thinking holds one.
            //
            // Four routes now, and the new one is the important one: a document
            // has a stable id and revisions, so what is drawn is "this model, at
            // revision three" rather than the third picture in a row. The
            // document's state travels to the conversation through `edits`,
            // which is what lets a reply edit it — remove a part, undo, branch —
            // instead of describing what removing a part would look like.
            doc ? (
              <div className="lg-viz-surface lg-tokens">
                <ModelView
                  model={modelFor(doc)}
                  edits={editsState(map.models ?? EMPTY_WORKSPACE) ?? undefined}
                  onRead={onVizRead}
                  ops={vizOps}
                  // THE DOCUMENT HEARS ABOUT EVERY CHANGE THE SURFACE MAKES.
                  // Without this a slider, a cursor or a selection lived only
                  // in the view and was gone on reload (lib/model/docs.ts adopt).
                  onModel={(m) => onModelEdited?.(doc.id, m)}
                  onAsk={(id) => {
                    const m = modelFor(doc);
                    const o = m.objects.find((x) => x.id === id);
                    onAskAbout?.(id, o?.label ?? id);
                  }}
                />
              </div>
            ) : map.viz?.built ? (
              <div className="lg-viz-surface lg-tokens">
                <ModelView model={map.viz.built} onRead={onVizRead} ops={vizOps} />
              </div>
            ) : map.viz && isSimulation(map.viz) ? (
              <div className="lg-viz-surface">
                <SceneSurface scene={map.viz} onRead={onVizRead} ops={vizOps} />
              </div>
            ) : map.viz ? (
              <MathViz
                scene={map.viz}
                width={size.w}
                height={size.h}
                onRead={onVizRead}
                ops={vizOps}
                guarded={guarded}
                onSceneChange={onViz}
              />
            ) : null
          ) : (
            <MathPlot map={map} width={size.w} height={size.h} guarded={guarded} />
          ))}
        {/* the board is worked-by-hand notebook, not cards */}
        {lens === 'board' && (
          <MathBoard map={map} width={size.w} height={size.h} guarded={guarded} />
        )}
        {/* Logos 3's Structure: the whole panel, in detail */}
        {workspace && lens === 'structure' && (
          <StructureView
            map={map}
            width={size.w}
            height={size.h}
            guarded={guarded}
            onSelect={onSelectNode}
            onAction={onAction}
            researchLocked={researchLocked}
            grounded={grounded}
          />
        )}

        {/* A comparison is a table, so it is a table — not cards, and not an
            SVG pretending to be one. Rebuilt from the map on every render for
            the same reason the other lenses are: the map is the state. */}
        {lens === 'matrix' &&
          (() => {
            const mx = buildMatrix(map);
            return mx ? (
              <MatrixLens
                matrix={mx}
                width={size.w}
                height={size.h}
                guarded={guarded}
                onPick={
                  canFocus && onFocus
                    ? (id) => {
                        const n = map.nodes.find((q) => q.id === id);
                        if (n) onFocus({ id: n.id, label: n.label, type: n.type });
                      }
                    : undefined
                }
              />
            ) : null;
          })()}

        {/* THE WORLD: every card and every line, in world coordinates, moved
            as one by the camera's transform (written to the DOM directly —
            see applyCam). Not rendered on the lenses that draw themselves:
            it would lie over the plot and the Board like a sheet of glass. */}
        {isCanvas && (
          <div className="lg-map-world" ref={worldRef}>
        <svg className="lg-edges" aria-hidden="true">
          <defs>
            <marker
              id="lg-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L7,4 L0,7" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </marker>
          </defs>
          {connectors.map((c) => {
            const on = related ? related.edges.has(c.key) : true;
            return (
              <g
                key={c.key}
                className={`lg-conn lg-conn-${c.relation} lg-str-${c.strength ?? 'normal'}${dim(on)}${
                  related && on ? ' is-lit' : ''
                }`}
                style={{ '--i': connectors.indexOf(c) } as React.CSSProperties}
              >
                <path
                  ref={(el) => {
                    if (el) edgeElRef.current.set(c.key, el);
                    else edgeElRef.current.delete(c.key);
                  }}
                  className="lg-edge"
                  d={lens === 'graph' ? undefined : c.path}
                  pathLength={1}
                  fill="none"
                  markerEnd={c.arrow ? 'url(#lg-arrow)' : undefined}
                  markerStart={c.double ? 'url(#lg-arrow)' : undefined}
                />
                {c.label && c.lx != null && c.ly != null && (
                  <text
                    ref={(el) => {
                      if (el) labelElRef.current.set(c.key, el);
                      else labelElRef.current.delete(c.key);
                    }}
                    className="lg-conn-label"
                    x={c.lx}
                    y={c.ly - 9}
                    textAnchor="middle"
                  >
                    {c.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {cards.map((p) => {
          const on = related ? related.nodes.has(p.id) : true;
          // Answer Guard backstop on the card lenses (Structure is the default
          // math lens): mask a concluding node — a stated result, or a
          // verification that restates it — so the map can't reveal an answer
          // Chat is withholding. The working nodes stay visible.
          // A counterexample joins the concluding types: "find a case where
          // this fails" is an exercise, and the case IS its answer. Lemma and
          // conjecture deliberately do NOT — a conjecture is unproven by
          // definition, and masking lemmas would blind the proof-tracing this
          // ontology exists for.
          const hideVal =
            !!guarded &&
            (p.node.type === 'result' ||
              p.node.type === 'verification' ||
              p.node.type === 'counterexample');
          // AN OBJECT OF THOUGHT, AS ITSELF. Not a card with a matrix written
          // in it: the matrix, which the person works in (live) or a state in
          // its trail. Dragging it by its frame moves it like any card.
          if (p.objRef) {
            const o = objOf(map.objects, p.objRef.id);
            if (!o) return null;
            const live = p.objRef.live;
            return (
              <div
                key={p.id}
                ref={(el) => {
                  if (el) nodeElRef.current.set(p.id, el);
                  else nodeElRef.current.delete(p.id);
                }}
                data-id={p.id}
                className={`lg-node-pos is-obj${live ? ' is-obj-live' : ' is-obj-trail'}${p.objRef.undone ? ' is-obj-undone' : ''}${dim(on)}${
                  isPinned(canvasRef.current, lens, p.id) ? ' is-placed' : ''
                }`}
                style={{ '--i': cards.indexOf(p), transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` } as React.CSSProperties}
              >
                <div className="lg-node lg-obj" style={{ width: p.w }}>
                  <ObjectFigure
                    obj={o}
                    at={p.objRef.at}
                    mode={live ? 'live' : 'trail'}
                    guarded={guarded}
                    sel={objectSel?.obj === o.id ? objectSel.part : null}
                    onSelect={(part) => onObject?.({ type: 'select', obj: o.id, part })}
                    onSeek={(at) => onObject?.({ type: 'seek', obj: o.id, at })}
                    onView={(view) => {
                      onObject?.({ type: 'view', obj: o.id, view });
                      if (view === 'plane' && lenses.includes('plot')) {
                        lensManual.current = true;
                        askedRef.current = null;
                        setLens('plot');
                      }
                    }}
                    {...(live
                      ? {
                          onOp: (op: string, args: Record<string, string | number>, suggested?: boolean) =>
                            onObject?.({ type: 'op', obj: o.id, op, args, suggested }) ?? { ok: false, why: 'Nothing here can compute that.' },
                          readOp: (text: string) => kindOf(o.kind)?.readOp(text, currentOf(o)) ?? null,
                          suggestions: objectSuggestions?.filter((x) => x.id === o.id),
                        }
                      : {})}
                  />
                </div>
              </div>
            );
          }
          return (
            <div
              key={p.id}
              ref={(el) => {
                if (el) nodeElRef.current.set(p.id, el);
                else nodeElRef.current.delete(p.id);
              }}
              data-id={p.id}
              className={`lg-node-pos${dim(on)}${menuFor === p.id ? ' is-menu' : ''}${p.loose ? ' is-loose' : ''}${
                isPinned(canvasRef.current, lens, p.id) ? ' is-placed' : ''
              }`}
              style={
                {
                  // Its place in the sequence, for the emergence.
                  '--i': cards.indexOf(p),
                  ...(lens === 'graph'
                    ? {}
                    : { transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }),
                } as React.CSSProperties
              }
            >
              <button
                type="button"
                // the first card is the one the tour points at
                data-tour={!embedded && p === cards.find((c) => !c.objRef) ? 'card' : undefined}
                style={{ width: p.w }}
                className={`lg-node lg-node-${p.node.type} lg-st-${p.node.status ?? 'open'}${
                  focused === p.id ? ' is-focused' : ''
                }${related && on && active !== p.id ? ' is-lit' : ''}${
                  explored?.has(p.id) ? ' is-explored' : ''
                }${changed?.has(p.id) ? ' is-changed' : ''}${
                  menuFor === p.id ? ' is-open' : ''
                }${relevant?.has(p.id) ? ' is-relevant' : ''}${
                  p.node.flag ? ` lg-flag-${p.node.flag}` : ''
                }${p.branch ? ' is-branch' : ''}${shapeLens && !p.loose ? ' is-shaped' : ''}${
                  picked?.has(p.id) ? ' is-picked' : ''
                }${p.node.origin === 'socria' ? ' is-socria' : ''}`}
                title={shapeLens && p.node.role ? `${p.node.role} · ${p.node.type}` : undefined}
                aria-haspopup="menu"
                aria-expanded={menuFor === p.id}
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={(ev) => {
                  setHovered(p.id);
                  // reached by Tab, somewhere the camera is not looking: look there
                  if (ev.currentTarget.matches(':focus-visible')) ensureVisible(p.id);
                }}
                onBlur={() => setHovered(null)}
                // A right-click is the same press: the card's menu is the
                // card's menu, and the browser's own has nothing to offer here.
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  if (menu?.id === p.id) return;
                  ev.currentTarget.click();
                }}
                onKeyDown={(ev) => {
                  // Alt + an arrow moves the card — the keyboard's drag. It
                  // changes where the card sits, never what it says.
                  if (ev.altKey && ev.key.startsWith('Arrow') && isCanvas) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    nudgeCard(p.id, ev.key, ev.shiftKey);
                    return;
                  }
                  if (ev.key === 'Escape') {
                    ev.stopPropagation();
                    if (menu) setMenu(null);
                    else {
                      setFocused(null);
                      wrapRef.current?.focus();
                    }
                    return;
                  }
                  // Delete on a focused card takes it off the map, the same
                  // edit the menu offers — so a keyboard can do what a mouse can.
                  if ((ev.key === 'Delete' || ev.key === 'Backspace') && onEdit) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setMenu(null);
                    onEdit({ op: 'remove', id: p.id });
                  }
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  // Shift or ⌘: pick it, for a synthesis of just what is picked.
                  if (onPick && (ev.shiftKey || ev.metaKey || ev.ctrlKey)) {
                    setMenu(null);
                    onPick(p.id);
                    return;
                  }
                  setFocused(p.id);
                  onSelectNode?.(p.id);
                  if (menu?.id === p.id) {
                    setMenu(null);
                    return;
                  }
                  const card = ev.currentTarget.getBoundingClientRect();
                  const el = wrapRef.current;
                  const box = el?.getBoundingClientRect();
                  if (!el || !box) return;
                  // Flip above the card when there isn't room beneath it.
                  const above = card.bottom - box.top + MENU_H > box.height;
                  // The menu is in the viewport, not the world: placed in the
                  // panel's own pixels, kept inside it, the same size at any zoom.
                  onNodePress?.();
                  setMenu({
                    id: p.id,
                    x: Math.min(Math.max(card.left - box.left + card.width / 2, 100), Math.max(100, box.width - 100)),
                    y: above
                      ? Math.max(card.top - box.top - 8, MENU_H * 0.4)
                      : Math.max(8, card.bottom - box.top + 8),
                    above,
                  });
                }}
              >
                <span className="lg-node-head">
                  <NodeGlyph type={p.node.type} />
                  <span className="lg-node-type">{shapeLens && p.node.role ? p.node.role : p.node.type}</span>
                  {/* Logos 2: whose idea this was, a small dot in their seat
                      colour. Absent on a single-player map, where no node
                      carries an author. */}
                  {p.node.by && (
                    <span
                      className="lg-node-by"
                      style={{ background: p.node.by.seat === 'guest' ? '#3A6EA5' : '#5e7633' }}
                      title={`${p.node.by.name}'s idea`}
                      aria-hidden="true"
                    />
                  )}
                  {p.node.status && p.node.status !== 'open' && (
                    <StatusMark status={p.node.status} />
                  )}
                  {!!grounded?.[p.id] && (
                    <span
                      className="lg-node-ctxn"
                      title={`Grounded in ${grounded[p.id]} piece${grounded[p.id] === 1 ? '' : 's'} of your material`}
                    >
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                        <path d="M8.8 5.2 5.6 8.4a1.8 1.8 0 0 1-2.6-2.6l3.9-3.9a1.3 1.3 0 0 1 1.9 1.9L5.2 7.4" />
                      </svg>
                      {grounded[p.id]}
                    </span>
                  )}
                </span>
                <span className="lg-node-label">
                  {p.node.obj && objOf(map.objects, p.node.obj) ? (
                    <ObjectFigure obj={objOf(map.objects, p.node.obj) as ThoughtObject} at={p.node.objAt ?? (objOf(map.objects, p.node.obj) as ThoughtObject).at} mode="card" guarded={guarded} />
                  ) : hideVal ? (
                    <TeX tex={'=\\ ?'} />
                  ) : p.node.tex ? (
                    <TeX tex={p.node.tex} />
                  ) : (
                    p.node.label
                  )}
                </span>
                {/* a repair hint on an error, or a short note on a step —
                    hidden on a guarded conclusion, where it spells the answer */}
                {p.node.note && !hideVal && (
                  <span className="lg-node-note">
                    <MathText>{p.node.note}</MathText>
                  </span>
                )}
                {!!p.attached?.length && (
                  <span className="lg-node-attached" title={p.attached.map((d) => `${d.role ?? d.type}: ${d.label}`).join('\n')}>
                    {p.attached.length} {p.attached.length === 1 ? 'detail' : 'details'}
                  </span>
                )}
                {!!p.node.merged?.length && (
                  <span
                    className="lg-node-merged"
                    title={`Folded in: ${p.node.merged.join('; ')}`}
                  >
                    +{p.node.merged.length} folded in
                  </span>
                )}
              </button>

            </div>
          );
        })}
          </div>
        )}

        {menu && isCanvas &&
          (() => {
            const node = map.nodes.find((n) => n.id === menu.id);
            if (!node) return null;
            return (
              <div
                className={`lg-acts${menu.above ? ' is-above' : ''}`}
                role="menu"
                style={{ left: menu.x, top: menu.y }}
                onClick={(ev) => ev.stopPropagation()}
              >
                {/* WHAT HANGS FROM THIS PART OF THE SHAPE — the constraints,
                    values and questions that apply to it, under it rather
                    than beside it on the canvas. */}
                {!!details.get(node.id)?.length && (
                  <div className="lg-acts-details" role="group" aria-label={`On ${node.label}`}>
                    {details.get(node.id)!.map((d) => (
                      <p key={d.id} className="lg-acts-detail">
                        <span className="lg-acts-detail-k">{d.role ?? d.type}</span>
                        <span className="lg-acts-detail-v">{d.label}</span>
                      </p>
                    ))}
                    <span className="lg-act-sep" role="separator" />
                  </div>
                )}
                {NODE_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitem"
                    className={`lg-act lg-act-${m}${
                      m === 'research' && researchLocked ? ' is-locked' : ''
                    }`}
                    onClick={() => {
                      setMenu(null);
                      onAction?.(m, { id: node.id, label: node.label, type: node.type });
                    }}
                  >
                    {/* No padlock here. It said "Socria One opens this",
                        and One does not: Research's ceiling is fair use, the
                        same on both plans. The row still dims, and pressing
                        it opens the panel with the explanation in it. */}
                    <span className="lg-act-label">{MODE_META[m].label}</span>
                    <span className="lg-act-blurb">{MODE_META[m].blurb}</span>
                  </button>
                ))}
                {/* Ground this piece in real material — a doc, a page, the
                    calendar. Context, never authority. */}
                <button
                  type="button"
                  role="menuitem"
                  className="lg-act lg-act-context"
                  onClick={() => {
                    setMenu(null);
                    onAddContext?.({ id: node.id, label: node.label, type: node.type });
                  }}
                >
                  <span className="lg-act-label">Add context</span>
                  <span className="lg-act-blurb">Ground it in your material</span>
                </button>
                {/* Only offered while the draft is open — it holds the node
                    beside the writing, and copies nothing into it. */}
                {canFocus && (
                  <button
                    type="button"
                    role="menuitem"
                    className="lg-act lg-act-focus"
                    onClick={() => {
                      setMenu(null);
                      onFocus?.({ id: node.id, label: node.label, type: node.type });
                    }}
                  >
                    <span className="lg-act-label">Hold in view</span>
                    <span className="lg-act-blurb">Keep this beside the draft</span>
                  </button>
                )}
                {/* The map is theirs to edit. Settle or reopen a card, or take
                    it off — a removal stays removed (lib/map-edit.ts). */}
                {onEdit && (
                  <>
                    <span className="lg-act-sep" role="separator" />
                    <button
                      type="button"
                      role="menuitem"
                      className="lg-act lg-act-status"
                      onClick={() => {
                        setMenu(null);
                        onEdit({ op: 'status', id: node.id, status: node.status === 'resolved' ? 'open' : 'resolved' });
                      }}
                    >
                      <span className="lg-act-label">{node.status === 'resolved' ? 'Reopen' : 'Mark resolved'}</span>
                      <span className="lg-act-blurb">{node.status === 'resolved' ? 'It is open again' : 'Settled, and kept'}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="lg-act lg-act-remove"
                      onClick={() => {
                        setMenu(null);
                        onEdit({ op: 'remove', id: node.id });
                      }}
                    >
                      <span className="lg-act-label">Remove from map</span>
                      <span className="lg-act-blurb">Gone, and it stays gone</span>
                    </button>
                  </>
                )}
                {/* Where it sits is the person's to undo, quietly: a card
                    they placed by hand can be handed back to the layout. */}
                {isPinned(canvasRef.current, lens, node.id) && (
                  <>
                    <span className="lg-act-sep" role="separator" />
                    <button
                      type="button"
                      role="menuitem"
                      className="lg-act lg-act-unpin"
                      onClick={() => {
                        setMenu(null);
                        releaseCard(node.id);
                      }}
                    >
                      <span className="lg-act-label">Return to its place</span>
                      <span className="lg-act-blurb">Let the layout place it again</span>
                    </button>
                  </>
                )}
              </div>
            );
          })()}

        {related && active && lens === 'graph' && (
          <div className="lg-legend" aria-live="polite">
            {map.edges
              .filter((e) => e.from === active || e.to === active)
              .slice(0, 4)
              .map((e) => {
                const other = e.from === active ? e.to : e.from;
                const otherNode = map.nodes.find((n) => n.id === other);
                const self = map.nodes.find((n) => n.id === active);
                if (!otherNode || !self) return null;
                const forward = e.from === active;
                return (
                  <div className="lg-legend-row" key={edgeKey(e)}>
                    <span className="lg-legend-a">{forward ? self.label : otherNode.label}</span>
                    <span className={`lg-legend-rel lg-rel-${e.relation}`}>
                      {RELATION_LABEL[e.relation]}
                    </span>
                    <span className="lg-legend-b">{forward ? otherNode.label : self.label}</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* The camera's controls. Zoom is meaningless on the plot, the Board and
          the table, which draw to fit. The readout and the disabled states
          are written by applyCam, so a pinch never re-renders the map. */}
      {map.nodes.length > 0 && isCanvas && (
        <div className="lg-zoom" role="group" aria-label="Zoom and view">
          <button ref={zoomOutRef} type="button" onClick={() => zoomStep(-1)} aria-label="Zoom out" title="Zoom out (−)">
            −
          </button>
          <button
            ref={zoomLevelRef}
            type="button"
            className="lg-zoom-level"
            onClick={() => {
              const c = camRef.current;
              userCam(zoomAt(c, 1, vpRef.current.w / 2, vpRef.current.h / 2), true);
            }}
            aria-label="Zoom 100 percent — back to 100"
            title="Back to 100% — or scroll, or pinch, to zoom where you point"
          >
            100%
          </button>
          <button ref={zoomInRef} type="button" onClick={() => zoomStep(1)} aria-label="Zoom in" title="Zoom in (+)">
            +
          </button>
          <button
            ref={fitRef}
            type="button"
            className="lg-zoom-fit"
            onClick={() => fitAll()}
            aria-label="Show all of the map"
            title="Show all of it (0)"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
            </svg>
          </button>
        </div>
      )}

      {/* THE CAPTION MOVED UP, into the bar — it introduces the lens, and an
          introduction that arrives after the thing is a label. It stays here
          for the one case the bar does not cover: a plan that offers a single
          lens, where there are no tabs and so no bar to put it in. */}
      {map.nodes.length > 0 && lenses.length <= 1 && <p className="lg-caption">{caption}</p>}

      {/* ── THE KEY, which this map has never carried ─────────────────
          Every node is coloured by its TYPE and nothing said what the colours
          meant: a reader had to infer the scheme from the nodes themselves.
          
          IT KEYS THIS MAP, NOT THE SCHEME. There are fifteen node types and a
          legend listing all of them would be a glossary; what is useful is the
          five or six actually on screen. So it is derived from the map, and
          changes as the map does.
          
          AND THE SWATCH TAKES ITS COLOUR FROM THE NODE RULE — `lg-node` plus
          `lg-node-<type>`, the same classes the card carries — rather than
          from a hex written out again here. A legend with its own copy of the
          palette is a legend that will one day describe a colour the map
          stopped using, which is worse than no legend at all. */}
      {map.nodes.length > 0 && lens === 'graph' && legendTypes.length > 0 && (
        <div className="mp-bot">
          <div className="mp-legend">
            {legendTypes.map((t) => (
              <span key={t}>
                <i className={`lg-node lg-node-${t}`} />
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
