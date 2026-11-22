'use client';
// components/logos6/ThinkingCanvas.tsx — THE MIND MAP: ONE MAP, THREE WAYS OF WORKING WITH IT (Logos 6).
//
// Ideas, the Logic Map and Structure used to be separate places. Here they are three ways of working on the same
// cards and lines (lib/logos6/graph.ts):
//   • Ideas — put cards anywhere, drag from a card's edge to connect it, group them;
//   • Logic — the lines made explicit: what supports, conflicts with, depends on, causes what; each line can be
//     opened to say why it holds and what bears it out, and confirmed (or taken off) when Socria read it;
//   • Structure — what sits inside what, as an outline: indent, outdent, reorder, fold.
// Switching keeps everything: a card's data is the card's, where it was put is kept per way of working, and the
// structure is laid out from the tree. Cards are never made here: an idea is made in the chatbox, which says its words,
// its kind and the card it sits inside ("Idea: … inside …").
//
// Pressing a card opens what it means, why it matters, its notes, tags, sources, assumptions, fields, what it
// connects to and why — what the person wrote kept apart from what Socria read, and said as such. Pressing a line
// opens why the two connect. Every change is an edit of the one map (lib/map-edit.ts), so it is saved, synced to
// the Everything view and every other view of the map, and undoable like any other.
//
// The canvas is addressable (lib/logos6/canvas-visual.ts): Socria can point at a card while it explains, a person
// can ask to see one, and a pressed card is "this" in their next message.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { MIND_TONES, NODE_TYPES, type LogosEdge, type LogosNode, type LogosRelation, type MindTone, type NodeMind, type ThinkingMap } from '@/lib/logos';
import type { MapEdit } from '@/lib/map-edit';
import { CANVAS_MODES, CARD_H, CARD_W, CHOOSABLE, FAMILY_LABEL, FAMILY_OF, MODE_LABEL, MODE_SAID, RELATION_SAID, STATUS_SAID, connectionsOf, edgeEnds, edgeIdOf, ideasPlaces, lineStatus, logicFocus, logicPlaces, outlineOf, structureRows, wouldCycle, type CanvasMode, type LogicFilter, type StructureMove, type TreeRow } from '@/lib/logos6/graph';
import { workLabelFor, type WorkItem } from '@/lib/logos6/work';
import { canvasArtifact, edgeVid, nodeVid } from '@/lib/logos6/canvas-visual';
import { act, emphClass, reducedMotion, select as visSelect, touch, useRegister, useVisual } from '@/components/inline/visual-bus';
import './thinking-canvas.css';

const PAD = 48;

/** The kinds a card can be given here: the everyday ones of the map's own list. */
const TYPES_OFFERED = ['idea', 'concept', 'claim', 'question', 'evidence', 'assumption', 'goal', 'decision', 'consequence', 'tension', 'definition', 'source', 'step', 'constraint', 'theme'].filter((t) => (NODE_TYPES as readonly string[]).includes(t)) as LogosNode['type'][];
const FILTERS: { id: LogicFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tensions', label: 'Tensions' },
  { id: 'evidence', label: 'Support' },
  { id: 'assumptions', label: 'Assumptions' },
  { id: 'suggested', label: 'Suggested' },
];
const TONE_SAID: Record<MindTone, string> = { moss: 'Moss', sky: 'Sky', amber: 'Amber', rose: 'Rose', violet: 'Violet', slate: 'Slate' };

type Sel = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

export interface ThinkingCanvasProps {
  map: ThinkingMap;
  /** every change, as edits of the one map */
  onEdits: (edits: MapEdit[]) => void;
  /** ask Socria about a card (the question is the person's to send) */
  onAsk?: (node: { id: string; label: string }) => void;
  /** ask Socria about a line: why these two connect */
  onAskLine?: (text: string) => void;
  /** the conversation's id: the canvas's address on the page, and where its way of working is remembered */
  mapKey?: string;
  /** the map is being read by the map pass */
  busy?: boolean;
  readOnly?: boolean;
  narrow?: boolean;
  /** the cards the open turn put there */
  lit?: ReadonlySet<string>;
  initialMode?: CanvasMode;
  /** other drawings of the same map (flow, timeline, cycle…), offered beside the three ways of working */
  drawings?: ReactNode;
  /** from outside (the Omnibox): a way of working to switch to, and a card or line to open — `n` is new for each ask */
  ask?: { mode?: CanvasMode; node?: string; edge?: string; n: number } | null;
  /** a structure proposed for them to apply or not ("Organize these ideas", lib/logos6/graph.ts structureProposal) */
  proposal?: { moves: readonly StructureMove[] } | null;
  onProposal?: (apply: boolean) => void;
  /** THE CHAT'S WORK (lib/logos6/work.ts): its artifacts, quizzes and sources — opened in focus, or placed as cards */
  work?: readonly WorkItem[];
  onOpenWork?: (w: WorkItem) => void;
  onPlaceWork?: (w: WorkItem, at: [number, number]) => void;
}

const modeKey = (k?: string) => `socria.mindmap.mode.${k ?? 'any'}`;
function readMode(k?: string): CanvasMode | null {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(modeKey(k)) : null;
    return (CANVAS_MODES as readonly string[]).includes(v ?? '') ? (v as CanvasMode) : null;
  } catch {
    return null;
  }
}
function keepMode(k: string | undefined, m: CanvasMode) {
  try {
    window.localStorage.setItem(modeKey(k), m);
  } catch {
    // a private window: the way of working is not remembered, and that is all
  }
}

export function ThinkingCanvas(p: ThinkingCanvasProps) {
  const { map, onEdits, readOnly = false, narrow = false } = p;
  const [mode, setModeState] = useState<CanvasMode>(() => readMode(p.mapKey) ?? p.initialMode ?? 'ideas');
  const setMode = (m: CanvasMode) => {
    setModeState(m);
    keepMode(p.mapKey, m);
  };
  const [sel, setSel] = useState<Sel>(null);
  const [filter, setFilter] = useState<LogicFilter>('all');
  const [moved, setMoved] = useState<Record<string, [number, number]>>({});
  const [linking, setLinking] = useState<{ from: string; x: number; y: number } | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [note, setNote] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // "More" puts itself away on a press elsewhere or Escape, like every other menu here
  const moreRef = useRef<HTMLDetailsElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const d = moreRef.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
      if (trayRef.current && !trayRef.current.contains(e.target as Node)) setTrayOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      const d = moreRef.current;
      if (e.key === 'Escape' && d?.open) {
        d.open = false;
        d.querySelector('summary')?.focus();
      }
      if (e.key === 'Escape') setTrayOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, []);
  const vkey = p.mapKey ? `map:${p.mapKey}` : undefined;
  const vis = useVisual(vkey);
  const mapRef = useRef(map);
  mapRef.current = map;
  useRegister(vkey, () => canvasArtifact(vkey!, mapRef.current), () => ({}));

  // an ask from outside (the Omnibox): switch the way of working, open the card or the line it names
  const askN = p.ask?.n;
  useEffect(() => {
    if (!p.ask) return;
    if (p.ask.mode) setMode(p.ask.mode);
    // chosen as a press would choose it: opened here, and "this" for their next message (the bus is told)
    if (p.ask.node) choose({ kind: 'node', id: p.ask.node });
    else if (p.ask.edge) choose({ kind: 'edge', id: p.ask.edge });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askN]);
  const work = p.work ?? [];
  const [trayOpen, setTrayOpen] = useState(false);

  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map]);
  const rows = useMemo(() => structureRows(map), [map]);
  // EVERY CARD AS TALL AS IT IS DRAWN. A card's height is its content's (a long label wraps, a subtitle or marks add a
  // line), so it is measured before the page is painted and the layout steps each row by its tallest card; the lines
  // meet each card at its real edge. Laid out by one assumed height, a long card ran over the one beneath it.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const heightOf = (id: string) => heights[id] ?? CARD_H;
  const measureRef = useRef<() => void>(() => {});
  measureRef.current = () => {
    const host = hostRef.current;
    if (!host) return;
    const next: Record<string, number> = {};
    for (const el of host.querySelectorAll<HTMLElement>('.tc-card[data-nid]')) {
      const h = el.offsetHeight; // the card's own height, whatever the zoom (offsetHeight ignores the layer's scale)
      if (h) next[el.dataset.nid!] = h;
    }
    setHeights((was) => {
      const ids = Object.keys(next);
      const same = ids.length === Object.keys(was).length && ids.every((id) => Math.abs((was[id] ?? 0) - next[id]) <= 1);
      return same ? was : next;
    });
  };
  // what a card holds changes only with the map, and how it is drawn with the way of working: measured then, before
  // paint — and once more when the faces have loaded, since a late font rewraps a label (never per frame of a drag)
  useLayoutEffect(() => measureRef.current(), [map, mode]);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready?.then(() => live && measureRef.current());
    return () => {
      live = false;
    };
  }, []);
  const placesRaw = useMemo(() => (mode === 'logic' ? logicPlaces(map, heightOf) : ideasPlaces(map, heightOf)), [map, mode, heights]);
  // where each card is drawn: as placed, or where the hand is moving it now
  const places = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    for (const [id, at] of placesRaw) out.set(id, moved[id] ? { x: moved[id][0], y: moved[id][1] } : { x: at.x, y: at.y });
    return out;
  }, [placesRaw, moved]);
  const bounds = useMemo(() => {
    const xs = [...places.values()].map((v) => v.x), ys = [...places.values()].map((v) => v.y);
    const minX = xs.length ? Math.min(...xs) : 0, minY = ys.length ? Math.min(...ys) : 0;
    const maxX = xs.length ? Math.max(...xs) + CARD_W : 400, maxY = ys.length ? Math.max(...[...places.entries()].map(([id, v]) => v.y + heightOf(id))) : 240;
    return { minX: minX - PAD, minY: minY - PAD, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 };
  }, [places, heights]);
  const focusSet = useMemo(() => (mode === 'logic' ? logicFocus(map, filter) : null), [map, mode, filter]);

  // what was selected and has gone (removed, or the pass reorganised) is let go
  useEffect(() => {
    if (sel?.kind === 'node' && !byId.has(sel.id)) setSel(null);
    if (sel?.kind === 'edge' && !map.edges.some((e) => edgeIdOf(e) === sel.id)) setSel(null);
  }, [map, byId, sel]);
  // moves the map has taken in are no longer the hand's
  useEffect(() => setMoved({}), [map, mode]);

  // fit the map in view when the way of working changes, or the map first arrives. In a narrow space (a phone, a
  // narrow pane) the cards stay legible — no smaller than 0.7 — and a map that does not fit at that size starts from
  // its top left, to be moved about. Fit, pressed, shows all of it however small.
  const fit = (all = false) => {
    const el = hostRef.current;
    if (!el || mode === 'structure') return;
    const W = el.clientWidth || 800, H = el.clientHeight || 520;
    const least = !all && W < 560 ? 0.7 : 0.35;
    const k = Math.max(least, Math.min(1.15, Math.min(W / bounds.w, H / bounds.h)));
    const x = bounds.w * k <= W ? (W - bounds.w * k) / 2 - bounds.minX * k : -bounds.minX * k;
    const y = bounds.h * k <= H ? (H - bounds.h * k) / 2 - bounds.minY * k : -bounds.minY * k;
    setView({ k, x, y });
    return { k, x, y };
  };
  // the view the last automatic fit made: while the view is still that one, the person has not moved it
  const fitted = useRef<{ k: number; x: number; y: number } | null>(null);
  // each way of working keeps its own view: back in Ideas, the space is where it was left (fitted only the first time,
  // or when the number of cards changes)
  const views = useRef<Partial<Record<CanvasMode, { x: number; y: number; k: number; n: number }>>>({});
  const shown = useRef<CanvasMode | null>(null);
  useEffect(() => {
    if (shown.current && shown.current !== mode) views.current[shown.current] = { ...viewRef.current, n: map.nodes.length };
    shown.current = mode;
    const kept = views.current[mode];
    if (kept && kept.n === map.nodes.length) {
      setView({ x: kept.x, y: kept.y, k: kept.k });
      fitted.current = null;
    } else {
      fitted.current = fit() ?? null;
      views.current[mode] = undefined;
    }
  }, [mode, map.nodes.length]);
  // the cards are measured after that first fit (and again once the faces load), and their real heights make the map
  // taller than the fit allowed for — its last row out of view. Fitted again then, but only while the view is still the
  // one the fit made: never once the person has moved or zoomed it.
  useEffect(() => {
    const f = fitted.current, v = viewRef.current;
    if (f && Math.abs(v.k - f.k) < 1e-6 && Math.abs(v.x - f.x) < 0.5 && Math.abs(v.y - f.y) < 0.5) fitted.current = fit() ?? null;
  }, [heights]);

  /** Select a card or a line: opened in the inspector, and "this" for the person's next message. */
  function choose(next: Sel) {
    setSel(next);
    if (!vkey) return;
    touch(vkey);
    if (!next) visSelect(vkey, null);
    else if (next.kind === 'node') visSelect(vkey, nodeVid(next.id));
    else {
      const e = map.edges.find((x) => edgeIdOf(x) === next.id);
      if (e) visSelect(vkey, edgeVid(e));
    }
  }

  // a card selected by words ("select opportunity cost") is the card selected here
  useEffect(() => {
    const id = vis.selected;
    if (!id?.startsWith('node:')) return;
    const n = map.nodes.find((x) => nodeVid(x.id) === id);
    if (n && !(sel?.kind === 'node' && sel.id === n.id)) setSel({ kind: 'node', id: n.id });
  }, [vis.selected]);
  // a card pointed at (Socria's words, their request): lit, and brought into view; focused, opened
  useEffect(() => {
    if (!vis.emph) return;
    const n = map.nodes.find((x) => vis.emph!.ids.includes(nodeVid(x.id)));
    if (!n) return;
    if (vis.emph.op === 'focus') setSel({ kind: 'node', id: n.id });
    if (mode === 'structure') {
      // unfold what it sits under, so it can be seen
      const r = rows.find((x) => x.id === n.id);
      if (r?.hidden) {
        const folds: MapEdit[] = [];
        for (let at = r.parent; at; at = rows.find((x) => x.id === at)?.parent ?? null) if (byId.get(at)?.mind?.folded) folds.push({ op: 'fold', id: at, folded: false });
        if (folds.length && !readOnly) onEdits(folds);
      }
      hostRef.current?.querySelector(`[data-nid="${CSS.escape(n.id)}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    const at = places.get(n.id);
    const el = hostRef.current;
    if (at && el) setView((v) => ({ ...v, x: el.clientWidth / 2 - (at.x + CARD_W / 2) * v.k, y: el.clientHeight / 2 - (at.y + CARD_H / 2) * v.k }));
  }, [vis.emph?.n]);

  // ── adding: never here ──
  // An idea is made in the chatbox — its words, its kind, the card it sits inside ("Idea: … inside …", "add an idea
  // called … inside …"; lib/logos6/omnibox.ts, lib/map-edit.ts readMapAdd). The canvas moves, connects, structures and
  // opens what is there.

  // ── moving and connecting, by pointer ──
  const toCanvas = (cx: number, cy: number) => {
    const r = hostRef.current!.getBoundingClientRect();
    return [(cx - r.left - view.x) / view.k, (cy - r.top - view.y) / view.k] as const;
  };
  const dragRef = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const onCardDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (readOnly) return choose({ kind: 'node', id });
    const at = places.get(id)!;
    const [x, y] = toCanvas(e.clientX, e.clientY);
    dragRef.current = { id, dx: x - at.x, dy: y - at.y, sx: e.clientX, sy: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onCardMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    const [x, y] = toCanvas(e.clientX, e.clientY);
    setMoved((m) => ({ ...m, [d.id]: [Math.round(x - d.dx), Math.round(y - d.dy)] }));
  };
  const onCardUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) return choose({ kind: 'node', id: d.id });
    const [x, y] = toCanvas(e.clientX, e.clientY);
    onEdits([{ op: 'place', id: d.id, mode: mode === 'logic' ? 'logic' : 'ideas', x: Math.round(x - d.dx), y: Math.round(y - d.dy) }]);
  };
  const onLinkDown = (e: React.PointerEvent, from: string) => {
    e.stopPropagation();
    if (readOnly) return;
    const [x, y] = toCanvas(e.clientX, e.clientY);
    setLinking({ from, x, y });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onLinkMove = (e: React.PointerEvent) => {
    if (!linking) return;
    const [x, y] = toCanvas(e.clientX, e.clientY);
    setLinking({ ...linking, x, y });
  };
  const onLinkUp = (e: React.PointerEvent) => {
    if (!linking) return;
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-nid]')?.dataset.nid;
    const from = linking.from;
    setLinking(null);
    if (!target || target === from) return;
    const exists = map.edges.some((x) => x.kind !== 'structure' && ((x.from === from && x.to === target) || (x.from === target && x.to === from)));
    if (exists) return setNote('Those two are already connected: open the line to change what it says.');
    onEdits([{ op: 'link', from, to: target, relation: 'relates', status: 'confirmed' }]);
    // the new line, opened, so what it means can be said at once
    setSel({ kind: 'edge', id: edgeIdOf({ from, to: target, relation: 'relates' }) });
    setNote('Connected. Say what kind of connection it is, and why, in the panel.');
  };
  const onHostDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-nid],.tc-edge-hit,.tc-label')) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, x: view.x, y: view.y };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onHostMove = (e: React.PointerEvent) => {
    if (linking) return onLinkMove(e);
    const pn = panRef.current;
    if (!pn) return;
    setView((v) => ({ ...v, x: pn.x + e.clientX - pn.sx, y: pn.y + e.clientY - pn.sy }));
  };
  const onHostUp = (e: React.PointerEvent) => {
    if (linking) return onLinkUp(e);
    const pn = panRef.current;
    panRef.current = null;
    if (pn && Math.hypot(e.clientX - pn.sx, e.clientY - pn.sy) < 4) choose(null);
  };
  const zoomBy = (f: number) =>
    setView((v) => {
      const el = hostRef.current;
      const cx = (el?.clientWidth ?? 800) / 2, cy = (el?.clientHeight ?? 520) / 2;
      const k = Math.max(0.3, Math.min(2.2, v.k * f));
      return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
    });

  // ── what is drawn ──
  const selNode = sel?.kind === 'node' ? byId.get(sel.id) ?? null : null;
  const selEdge = sel?.kind === 'edge' ? map.edges.find((e) => edgeIdOf(e) === sel.id) ?? null : null;
  const neighbours = useMemo(() => {
    if (!selNode) return null;
    return new Set(map.edges.flatMap((e) => (e.from === selNode.id ? [e.to] : e.to === selNode.id ? [e.from] : [])));
  }, [map, selNode]);
  const groups = useMemo(() => {
    if (mode !== 'ideas') return [];
    const by = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
    for (const n of map.nodes) {
      if (!n.group) continue;
      const at = places.get(n.id);
      if (!at) continue;
      const g = by.get(n.group) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      by.set(n.group, { x0: Math.min(g.x0, at.x), y0: Math.min(g.y0, at.y), x1: Math.max(g.x1, at.x + CARD_W), y1: Math.max(g.y1, at.y + heightOf(n.id)) });
    }
    return [...by.entries()];
  }, [map, places, mode, heights]);

  const drawnLines = mode === 'structure' ? [] : map.edges.filter((e) => places.has(e.from) && places.has(e.to) && (mode === 'logic' || e.kind !== 'structure'));
  const centre = (id: string) => {
    const at = places.get(id)!;
    return { x: at.x + CARD_W / 2, y: at.y + heightOf(id) / 2 };
  };
  const boxOf = (id: string) => {
    const at = places.get(id)!;
    return { x: at.x, y: at.y, w: CARD_W, h: heightOf(id) };
  };
  const lineOf = (e: { from: string; to: string }) => edgeEnds(boxOf(e.from), boxOf(e.to));
  const linkFrom = linking ? centre(linking.from) : null;

  const modeTabs = (
    <div className="tc-modes" role="tablist" aria-label="Way of working">
      {CANVAS_MODES.map((m) => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} className={`tc-mode${mode === m ? ' is-on' : ''}`} onClick={() => setMode(m)} title={MODE_SAID[m]}>
          <ModeGlyph m={m} />
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );

  return (
    <section className={`tc is-${mode}${narrow ? ' is-narrow' : ''}${vis.emph ? ' has-vlit' : ''}`} aria-label="Mind Map">
      <header className="tc-bar">
        {modeTabs}
        <span className="tc-sp" />
      </header>
      {/* One quiet row, only what this way of working needs: a filter in Logic, the zoom, and the rest under More.
          The help says itself once — while the map is still small — and stays for screen readers after that. */}
      <div className="tc-tools">
        {mode === 'logic' && (
          <label className="tc-filter">
            <span className="tc-filter-k">Show</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as LogicFilter)} aria-label="Bring forward">
              {FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === 'all' ? 'All lines' : f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === 'structure' && <span className="tc-sr">Tab moves a card inside the one above; Shift+Tab moves it out; Alt+↑↓ reorders.</span>}
        {mode === 'ideas' && !readOnly && (map.nodes.length <= 3 ? <span className="tc-hint">Drag a card to move it, or from its ◦ to another card to connect them. New ideas come from the chat box.</span> : <span className="tc-sr">Drag a card to move it, or from its ◦ to another card to connect them. New ideas come from the chat box.</span>)}
        <span className="tc-sp" />
        {p.busy && <span className="tc-busy">Reading…</span>}
        {work.length > 0 && (
          <div className={`tc-tray${trayOpen ? ' is-open' : ''}`} ref={trayRef}>
            <button type="button" className="tc-tray-b" aria-expanded={trayOpen} onClick={() => setTrayOpen((v) => !v)}>
              {narrow ? 'Work' : 'This chat’s work'} <span className="tc-tray-n">{work.length}</span>
              <span className="tc-sr">{narrow ? ': this chat’s artifacts, quizzes and sources' : ''}</span>
            </button>
            {trayOpen && (
              <ul className="tc-tray-list" aria-label="This chat’s artifacts, quizzes and sources">
                {work.map((w) => (
                  <li key={w.key} className={`tc-work is-${w.kind}`}>
                    <span className="tc-work-k">{w.kind === 'quiz' ? 'Quiz' : w.kind === 'source' ? 'Source' : 'Artifact'}</span>
                    <span className="tc-work-t">{w.title}</span>
                    {w.sub && <span className="tc-work-s">{w.sub}</span>}
                    <span className="tc-work-acts">
                      {p.onOpenWork && (
                        <button type="button" className="tc-link" onClick={() => {
                            setTrayOpen(false);
                            p.onOpenWork!(w);
                          }} aria-label={`Open ${w.title}`}>
                          Open
                        </button>
                      )}
                      {w.placed ? (
                        <button type="button" className="tc-link" onClick={() => {
                            setTrayOpen(false);
                            choose({ kind: 'node', id: w.placed! });
                          }} aria-label={`Show the card for ${w.title}`}>
                          Show card
                        </button>
                      ) : (
                        !readOnly &&
                        p.onPlaceWork &&
                        (w.obj || w.doc) && (
                          <button
                            type="button"
                            className="tc-link"
                            aria-label={`Place ${w.title} on the canvas`}
                            onClick={() => {
                              const el = hostRef.current;
                              const v = viewRef.current;
                              const W = el?.clientWidth || 800, H = el?.clientHeight || 500;
                              const at: [number, number] = [Math.round((W / 2 - v.x) / v.k - CARD_W / 2), Math.round((H / 2 - v.y) / v.k - 30)];
                              p.onPlaceWork!(w, at);
                            }}
                          >
                            Place on canvas
                          </button>
                        )
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {mode !== 'structure' && (
          <span className="tc-zoom" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
              −
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>
              +
            </button>
            <button type="button" onClick={() => fit(true)}>
              Fit
            </button>
          </span>
        )}
        {(p.drawings || map.nodes.length > 0) && (
          <details className="tc-more" ref={moreRef}>
            <summary aria-label="More ways to see and keep the map">More</summary>
            <div className="tc-more-b">
              {p.drawings}
              {map.nodes.length > 0 && (
                <button
                  type="button"
                  className="tc-btn"
                  onClick={() => {
                    if (moreRef.current) moreRef.current.open = false;
                    void navigator.clipboard?.writeText(outlineOf(map)).then(() => setNote('The outline is copied.'), () => setNote('The outline could not be copied here.'));
                  }}
                >
                  Copy the outline
                </button>
              )}
            </div>
          </details>
        )}
      </div>
      {note && (
        <p className="tc-note" role="status">
          {note}
          <button type="button" aria-label="Dismiss" onClick={() => setNote(null)}>
            ×
          </button>
        </p>
      )}
      {p.proposal && (
        <div className="tc-proposal" role="group" aria-label="A proposed structure">
          {p.proposal.moves.length ? (
            <>
              <p className="tc-proposal-h">
                <span className="tc-inspect-k">Proposed structure</span> from the lines already on your map — nothing moves until you apply it.
              </p>
              <ul>
                {p.proposal.moves.slice(0, 8).map((m) => (
                  <li key={m.id}>
                    <b>{m.label}</b> inside <b>{m.parentLabel}</b>
                  </li>
                ))}
                {p.proposal.moves.length > 8 && <li>…and {p.proposal.moves.length - 8} more</li>}
              </ul>
              <span className="tc-acts">
                {!readOnly && (
                  <button type="button" className="tc-btn is-go" onClick={() => p.onProposal?.(true)}>
                    Apply this structure
                  </button>
                )}
                <button type="button" className="tc-btn is-quiet" onClick={() => p.onProposal?.(false)}>
                  Not now
                </button>
              </span>
            </>
          ) : (
            <>
              <p className="tc-proposal-h">
                <span className="tc-inspect-k">Nothing to propose yet</span> No line on the map says what sits inside what. Move cards with Tab and Shift+Tab here, or connect them first.
              </p>
              <span className="tc-acts">
                <button type="button" className="tc-btn is-quiet" onClick={() => p.onProposal?.(false)}>
                  Close
                </button>
              </span>
            </>
          )}
        </div>
      )}
      <div className="tc-body">
        {!map.nodes.length ? (
          <div className="tc-empty">
            <p>Nothing on the map yet.</p>
            <p className="tc-empty-s">Ideas are made in the chat box: write “Idea: …” or “I think …”, or just keep talking — what you put into words lands here, ready to connect and organise.</p>
          </div>
        ) : mode === 'structure' ? (
          <Outline map={map} rows={rows} byId={byId} sel={sel} vis={vis} readOnly={readOnly} onSelect={(id) => choose({ kind: 'node', id })} onEdits={onEdits} onNote={setNote} />
        ) : (
          <div
            ref={hostRef}
            className={`tc-host${linking ? ' is-linking' : ''}`}
            onPointerDown={onHostDown}
            onPointerMove={onHostMove}
            onPointerUp={onHostUp}
            onWheel={(e) => {
              if (!e.ctrlKey && !e.metaKey) return;
              e.preventDefault();
              zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
            }}
          >
            <div className="tc-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
              {groups.map(([g, b]) => (
                <div key={g} className="tc-group" style={{ left: b.x0 - 14, top: b.y0 - 28, width: b.x1 - b.x0 + 28, height: b.y1 - b.y0 + 42 }}>
                  <span>{g}</span>
                </div>
              ))}
              <svg className="tc-edges" style={{ left: bounds.minX, top: bounds.minY }} width={bounds.w} height={bounds.h} viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`} aria-hidden="true">
                <defs>
                  <marker id="tc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" />
                  </marker>
                </defs>
                {drawnLines.map((e) => {
                  const a = centre(e.from), b = centre(e.to);
                  const id = edgeIdOf(e);
                  const fam = e.kind === 'structure' ? 'containment' : FAMILY_OF[e.relation];
                  const st = lineStatus(e);
                  const on = sel?.kind === 'edge' && sel.id === id;
                  const away = focusSet ? !focusSet.edges.has(id) : selNode ? e.from !== selNode.id && e.to !== selNode.id : false;
                  const directed = fam !== 'association' && fam !== 'tension';
                  // stop short of the card it points at — where the line meets that card's edge, as drawn — so the arrow is seen
                  const g = lineOf(e);
                  return (
                    <g key={id} className={`tc-edge is-${fam} is-${st}${on ? ' is-on' : ''}${away ? ' is-away' : ''}${emphClass(vis, edgeVid(e))}`}>
                      <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} markerEnd={directed ? 'url(#tc-arrow)' : undefined} />
                      <line className="tc-edge-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} onPointerDown={(ev) => ev.stopPropagation()} onClick={() => choose({ kind: 'edge', id })} />
                    </g>
                  );
                })}
                {linking && linkFrom && <line className="tc-linking" x1={linkFrom.x} y1={linkFrom.y} x2={linking.x} y2={linking.y} />}
              </svg>
              {/* what a line says, readable where it runs: in Logic always, in Ideas only what the person wrote */}
              {drawnLines.map((e) => {
                const said = mode === 'logic' ? e.label || (e.kind === 'structure' ? 'sits inside' : RELATION_SAID[e.relation]) : e.label;
                if (!said) return null;
                // written between the cards, on the part of the line that is seen (lib/logos6/graph.ts edgeEnds)
                const g = lineOf(e);
                const id = edgeIdOf(e);
                const away = focusSet ? !focusSet.edges.has(id) : selNode ? e.from !== selNode.id && e.to !== selNode.id : false;
                return (
                  <button key={`l${id}`} type="button" className={`tc-label is-${lineStatus(e)}${away ? ' is-away' : ''}`} style={{ left: g.lx, top: g.ly }} onClick={() => choose({ kind: 'edge', id })} title={`${STATUS_SAID[lineStatus(e)]} — press to see why`}>
                    {said}
                    {e.why ? <span className="tc-why-mark" aria-label="explained">·</span> : null}
                  </button>
                );
              })}
              {map.nodes.map((n) => {
                const at = places.get(n.id);
                if (!at) return null;
                const away = focusSet ? !focusSet.nodes.has(n.id) : selNode ? n.id !== selNode.id && !neighbours?.has(n.id) : false;
                return (
                  <Card
                    key={n.id}
                    n={n}
                    work={workLabelFor(n.obj, work)}
                    x={at.x}
                    y={at.y}
                    on={sel?.kind === 'node' && sel.id === n.id}
                    away={away}
                    lit={!!p.lit?.has(n.id)}
                    vcls={emphClass(vis, nodeVid(n.id))}
                    readOnly={readOnly}
                    onDown={(e) => onCardDown(e, n.id)}
                    onMove={onCardMove}
                    onUp={onCardUp}
                    onLinkDown={(e) => onLinkDown(e, n.id)}
                    onKey={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        choose({ kind: 'node', id: n.id });
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
        {selNode && <NodeInspector key={selNode.id} n={selNode} map={map} readOnly={readOnly} onEdits={onEdits} onClose={() => choose(null)} onSelectEdge={(id) => choose({ kind: 'edge', id })} onSelectNode={(id) => choose({ kind: 'node', id })} onAsk={p.onAsk} narrow={narrow} work={workLabelFor(selNode.obj, work)} onOpenWork={p.onOpenWork} />}
        {selEdge && <EdgeInspector key={edgeIdOf(selEdge)} e={selEdge} map={map} readOnly={readOnly} onEdits={onEdits} onClose={() => choose(null)} onSelectNode={(id) => choose({ kind: 'node', id })} onAskLine={p.onAskLine} narrow={narrow} />}
      </div>
      <p className="tc-sr" aria-live="polite">
        {vis.emph ? `Showing ${map.nodes.filter((n) => vis.emph!.ids.includes(nodeVid(n.id))).map((n) => n.label).join(' and ')}.` : ''}
      </p>
    </section>
  );
}

// ── a card ───────────────────────────────────────────────────────────

function Card(p: { n: LogosNode; work?: ReturnType<typeof workLabelFor>; x: number; y: number; on: boolean; away: boolean; lit: boolean; vcls: string; readOnly: boolean; onDown: (e: React.PointerEvent) => void; onMove: (e: React.PointerEvent) => void; onUp: (e: React.PointerEvent) => void; onLinkDown: (e: React.PointerEvent) => void; onKey: (e: ReactKeyboardEvent) => void }) {
  const { n } = p;
  const m = n.mind;
  const marks = [m?.notes ? 'notes' : '', m?.sources?.length || n.evidence?.length ? 'sources' : '', m?.assumptions?.length ? 'assumptions' : ''].filter(Boolean);
  const theirs = n.origin === 'socria' ? 'Socria’s suggestion' : '';
  return (
    <div
      className={`tc-card is-${n.type}${p.work ? ` is-work is-${p.work.kind}` : ''}${m?.tone ? ` tone-${m.tone}` : ''}${m?.shape ? ` shape-${m.shape}` : ''}${p.on ? ' is-on' : ''}${p.away ? ' is-away' : ''}${p.lit ? ' is-lit' : ''}${n.origin === 'socria' ? ' is-socria' : ''}${p.vcls}`}
      style={{ left: p.x, top: p.y, width: CARD_W }}
      data-nid={n.id}
      role="button"
      tabIndex={0}
      aria-pressed={p.on}
      aria-label={`${p.work ? `${p.work.said}: ` : ''}${n.label}${m?.subtitle ? `, ${m.subtitle}` : ''}${theirs ? `, ${theirs}` : ''}. Press to open.`}
      onPointerDown={p.onDown}
      onPointerMove={p.onMove}
      onPointerUp={p.onUp}
      onKeyDown={p.onKey}
    >
      <span className="tc-card-k">{p.work ? p.work.said : n.type}</span>
      <span className="tc-card-t">{n.label}</span>
      {m?.subtitle && <span className="tc-card-s">{m.subtitle}</span>}
      {(m?.tags?.length || marks.length) ? (
        <span className="tc-card-m">
          {m?.tags?.slice(0, 3).map((t) => (
            <span key={t} className="tc-tag">
              #{t}
            </span>
          ))}
          {marks.map((k) => (
            <span key={k} className={`tc-mark is-${k}`} title={k === 'notes' ? 'Has your notes' : k === 'sources' ? 'Has sources' : 'Has assumptions'}>
              {k === 'notes' ? '✎' : k === 'sources' ? '❝' : '?'}
            </span>
          ))}
        </span>
      ) : null}
      {!p.readOnly && <span className="tc-link-handle" role="presentation" title="Drag to another card to connect" onPointerDown={p.onLinkDown} />}
    </div>
  );
}

function ModeGlyph({ m }: { m: CanvasMode }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      {m === 'ideas' && (
        <>
          <circle cx="4" cy="5" r="2" />
          <circle cx="12" cy="4" r="2" />
          <circle cx="8" cy="12" r="2" />
        </>
      )}
      {m === 'logic' && (
        <>
          <circle cx="8" cy="3" r="1.8" />
          <circle cx="3.5" cy="12.5" r="1.8" />
          <circle cx="12.5" cy="12.5" r="1.8" />
          <path d="M7 4.6 4.4 10.8M9 4.6l2.6 6.2" />
        </>
      )}
      {m === 'structure' && <path d="M3 3h5M5 3v10M5 8h6M5 13h6" />}
    </svg>
  );
}

// ── Structure: the outline ───────────────────────────────────────────

function Outline(p: { map: ThinkingMap; rows: TreeRow[]; byId: Map<string, LogosNode>; sel: Sel; vis: ReturnType<typeof useVisual>; readOnly: boolean; onSelect: (id: string) => void; onEdits: (e: MapEdit[]) => void; onNote: (s: string | null) => void }) {
  const { rows, byId, map } = p;
  const visible = rows.filter((r) => !r.hidden);
  const siblings = (r: TreeRow) => rows.filter((x) => x.parent === r.parent);
  /** Reorder within the siblings: every sibling gets its place written, so the order is the person's from now on. */
  const reorder = (r: TreeRow, dir: -1 | 1) => {
    const sib = siblings(r);
    const i = sib.findIndex((x) => x.id === r.id), j = i + dir;
    if (j < 0 || j >= sib.length) return;
    const ids = sib.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    p.onEdits(ids.map((id, k) => ({ op: 'order', id, order: k })));
  };
  const indent = (r: TreeRow) => {
    const sib = siblings(r);
    const i = sib.findIndex((x) => x.id === r.id);
    if (i <= 0) return p.onNote('There is no card above it at this level to move it inside.');
    const into = sib[i - 1].id;
    if (wouldCycle(map, r.id, into)) return p.onNote('That would put a card inside itself.');
    p.onEdits([{ op: 'parent', id: r.id, parent: into }]);
  };
  const outdent = (r: TreeRow) => {
    if (!r.parent) return;
    const grand = rows.find((x) => x.id === r.parent)?.parent ?? null;
    p.onEdits([{ op: 'parent', id: r.id, parent: grand }]);
  };
  const onKey = (e: ReactKeyboardEvent, r: TreeRow) => {
    if (p.readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) outdent(r);
      else indent(r);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      reorder(r, e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'Enter') p.onSelect(r.id);
  };
  return (
    <ol className="tc-outline" aria-label="Structure">
      {visible.map((r) => {
        const n = byId.get(r.id)!;
        const on = p.sel?.kind === 'node' && p.sel.id === r.id;
        return (
          <li key={r.id} data-nid={r.id} className={`tc-row${on ? ' is-on' : ''}${r.inferred ? ' is-inferred' : ''}${n.mind?.tone ? ` tone-${n.mind.tone}` : ''}${emphClass(p.vis, nodeVid(r.id))}`} style={{ ['--d' as string]: r.depth }} aria-level={r.depth + 1}>
            <span className="tc-row-fold">
              {r.children > 0 ? (
                <button type="button" aria-expanded={!r.folded} aria-label={r.folded ? `Open ${n.label}` : `Fold ${n.label}`} onClick={() => !p.readOnly && p.onEdits([{ op: 'fold', id: r.id, folded: !r.folded }])}>
                  {r.folded ? '▸' : '▾'}
                </button>
              ) : (
                <span aria-hidden="true">·</span>
              )}
            </span>
            <button type="button" className="tc-row-t" onClick={() => p.onSelect(r.id)} onKeyDown={(e) => onKey(e, r)} title={r.inferred ? 'Placed here from how it connects (not set by you): Tab or the panel sets it' : undefined}>
              <span className="tc-row-l">{n.label}</span>
              {n.mind?.subtitle && <span className="tc-row-s">{n.mind.subtitle}</span>}
              {r.folded && <span className="tc-row-c">{r.children} inside</span>}
              {r.inferred && <span className="tc-row-i">from its connections</span>}
            </button>
            {!p.readOnly && (
              <span className="tc-row-acts">
                <button type="button" aria-label={`Move ${n.label} up`} onClick={() => reorder(r, -1)}>
                  ↑
                </button>
                <button type="button" aria-label={`Move ${n.label} down`} onClick={() => reorder(r, 1)}>
                  ↓
                </button>
                <button type="button" aria-label={`Move ${n.label} out a level`} onClick={() => outdent(r)} disabled={!r.parent}>
                  ←
                </button>
                <button type="button" aria-label={`Move ${n.label} inside the card above`} onClick={() => indent(r)}>
                  →
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── a card, opened ───────────────────────────────────────────────────

/** A field edited in place: kept as typed, saved when the field is left (or Enter, for a line). */
function Field(p: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string; readOnly?: boolean; hint?: string; max?: number }) {
  const [v, setV] = useState(p.value);
  useEffect(() => setV(p.value), [p.value]);
  const save = () => {
    if (v.trim() !== p.value.trim()) p.onSave(v.trim());
  };
  const common = {
    value: v,
    readOnly: p.readOnly,
    placeholder: p.placeholder,
    maxLength: p.max,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: save,
  };
  return (
    <label className="tc-field">
      <span className="tc-field-k">{p.label}</span>
      {p.multiline ? <textarea rows={3} {...common} /> : <input {...common} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />}
      {p.hint && <span className="tc-field-h">{p.hint}</span>}
    </label>
  );
}

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function NodeInspector(p: { n: LogosNode; map: ThinkingMap; readOnly: boolean; onEdits: (e: MapEdit[]) => void; onClose: () => void; onSelectEdge: (id: string) => void; onSelectNode: (id: string) => void; onAsk?: (n: { id: string; label: string }) => void; narrow: boolean; work?: ReturnType<typeof workLabelFor>; onOpenWork?: (w: WorkItem) => void }) {
  const { n, map, readOnly } = p;
  const m = n.mind ?? {};
  const conns = useMemo(() => connectionsOf(map, n.id), [map, n.id]);
  const rows = useMemo(() => structureRows(map), [map]);
  const row = rows.find((r) => r.id === n.id);
  const setMind = (set: Partial<NodeMind>) => p.onEdits([{ op: 'mind', id: n.id, set: { ...set, edited: Date.now() } }]);
  // every card it could sit inside without a loop (a card cannot sit inside one that sits inside it)
  const parentOptions = map.nodes.filter((x) => x.id !== n.id && !wouldCycle(map, n.id, x.id));
  const parentNow = row?.parent ? map.nodes.find((x) => x.id === row.parent) : null;
  const socriaRead = !!n.detail && !m.detailYours;
  // taking a card off is asked once, here, never in a box of the browser's own
  const [sure, setSure] = useState(false);
  const filled = [
    m.subtitle ? 'subtitle' : '',
    n.group ? 'group' : '',
    row?.parent && !row.inferred ? 'placed inside' : '',
    m.tags?.length ? 'tags' : '',
    m.assumptions?.length ? 'assumptions' : '',
    m.sources?.length ? 'sources' : '',
    m.props?.length ? 'fields' : '',
    m.tone || (m.shape && m.shape !== 'card') ? 'look' : '',
  ].filter(Boolean);
  return (
    <aside className={`tc-inspect${p.narrow ? ' is-sheet' : ''}`} aria-label={`About ${n.label}`}>
      <header className="tc-inspect-h">
        <span className="tc-inspect-k">{p.work ? `${p.work.said} · on your canvas` : n.origin === 'socria' ? 'Card · Socria’s suggestion' : n.hand ? 'Card · added by you' : 'Card · from the conversation'}</span>
        <button type="button" className="tc-x" aria-label="Close" onClick={p.onClose}>
          ×
        </button>
      </header>
      {p.work && p.onOpenWork && (
        <p className="tc-work-open">
          <button type="button" className="tc-btn is-go" onClick={() => p.onOpenWork!(p.work!.item)}>
            Open {p.work.kind === 'quiz' ? 'the quiz' : p.work.kind === 'source' ? 'the source' : 'it'}
          </button>
          <span className="tc-quiet">In focus beside the canvas; it is the same {p.work.kind === 'quiz' ? 'quiz' : p.work.kind === 'source' ? 'source' : 'artifact'}, so nothing is lost coming back.</span>
        </p>
      )}
      <Field label="Title" value={n.label} readOnly={readOnly} max={140} onSave={(v) => v && p.onEdits([{ op: 'rename', id: n.id, label: v }])} />
      <h4 className="tc-sec">What it means</h4>
      <Field label="Meaning" value={m.meaning ?? ''} multiline readOnly={readOnly} max={400} placeholder="What it is, in your words" onSave={(v) => setMind({ meaning: v })} />
      <Field label="Why it matters" value={m.why ?? ''} multiline readOnly={readOnly} max={400} placeholder="What it explains, or changes" onSave={(v) => setMind({ why: v })} />
      {n.detail ? (
        <div className="tc-prov">
          <Field
            label={socriaRead ? 'Explanation · Socria’s reading of the conversation' : 'Detailed explanation'}
            value={n.detail ?? ''}
            multiline
            readOnly={readOnly}
            max={300}
            placeholder="The fuller explanation behind the title"
            hint={socriaRead ? 'Written by Socria from what was said. Edit it, and it becomes yours.' : undefined}
            onSave={(v) => p.onEdits([{ op: 'detail', id: n.id, detail: v }, { op: 'mind', id: n.id, set: { detailYours: true, edited: Date.now() } }])}
          />
        </div>
      ) : null}
      {m.ai && (m.ai.meaning || m.ai.why) && (
        <div className="tc-ai" aria-label="Socria’s interpretation">
          <p className="tc-ai-k">Socria’s interpretation — not yours until you keep it</p>
          {m.ai.meaning && <p>{m.ai.meaning}</p>}
          {m.ai.why && <p>{m.ai.why}</p>}
          {!readOnly && (
            <button type="button" className="tc-btn" onClick={() => setMind({ ...(m.ai!.meaning && !m.meaning ? { meaning: m.ai!.meaning } : {}), ...(m.ai!.why && !m.why ? { why: m.ai!.why } : {}) })}>
              Keep it as mine
            </button>
          )}
        </div>
      )}

      <h4 className="tc-sec">Connected to</h4>
      {conns.length ? (
        <ul className="tc-conns">
          {conns.map((c) => (
            <li key={c.id} className={`is-${c.family} is-${c.status}`}>
              <button type="button" className="tc-conn" onClick={() => p.onSelectEdge(c.id)} title="Open this connection: why it holds">
                <span className="tc-conn-s">{c.said}</span> <b>{c.other.label}</b>
                {c.edge.why && <span className="tc-conn-w">{c.edge.why}</span>}
              </button>
              <span className="tc-status">{STATUS_SAID[c.status]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tc-quiet">Not connected yet. In Ideas or Logic, drag from its ◦ to another card.</p>
      )}

      <h4 className="tc-sec">Your notes</h4>
      <Field label="Notes" value={m.notes ?? ''} multiline readOnly={readOnly} max={2000} placeholder="Anything to remember about it" onSave={(v) => setMind({ notes: v })} />
      {!!n.evidence?.length && (
        <>
          <h4 className="tc-sec">In your documents</h4>
          <ul className="tc-evid">
            {n.evidence.map((ev, i) => (
              <li key={i}>
                <q>{ev.quote ?? '…'}</q>
                {ev.verdict && <span className="tc-status">{ev.verdict === 'supported' ? 'Supports it' : ev.verdict === 'partly' ? 'Partly' : 'Contradicts it'}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* the rest of what a card can carry, a step away: what is filled in is named on the way in */}
      <details className="tc-moredet">
        <summary>
          More details{filled.length ? <span className="tc-moredet-n"> · {filled.join(', ')}</span> : null}
        </summary>
        <Field label="Subtitle" value={m.subtitle ?? ''} readOnly={readOnly} max={90} placeholder="A line under the title" onSave={(v) => setMind({ subtitle: v })} />
        <div className="tc-row2">
          <label className="tc-field">
            <span className="tc-field-k">Kind</span>
            <select value={n.type} disabled={readOnly} onChange={(e) => p.onEdits([{ op: 'retype', id: n.id, type: e.target.value as LogosNode['type'] }])}>
              {[...new Set([n.type, ...TYPES_OFFERED])].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <Field label="Group" value={n.group ?? ''} readOnly={readOnly} max={40} placeholder="None" onSave={(v) => p.onEdits([{ op: 'group', id: n.id, group: v }])} />
        </div>

        {!n.detail && (
          <Field
            label="Detailed explanation"
            value=""
            multiline
            readOnly={readOnly}
            max={300}
            placeholder="The fuller explanation behind the title"
            onSave={(v) => p.onEdits([{ op: 'detail', id: n.id, detail: v }, { op: 'mind', id: n.id, set: { detailYours: true, edited: Date.now() } }])}
          />
        )}
        <h4 className="tc-sec">Structure</h4>
        <label className="tc-field">
          <span className="tc-field-k">Sits inside</span>
          <select
            value={row?.parent && !row.inferred ? row.parent : row?.inferred ? `~${row.parent}` : ''}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith('~')) return;
              p.onEdits([{ op: 'parent', id: n.id, parent: v || null }]);
            }}
          >
            <option value="">The top level</option>
            {row?.inferred && parentNow && <option value={`~${parentNow.id}`}>{parentNow.label} (from its connections)</option>}
            {parentOptions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          {row?.inferred && parentNow && <span className="tc-field-h">Placed under “{parentNow.label}” from how they connect. Choose it here to make it yours.</span>}
        </label>

        <h4 className="tc-sec">Labels and sources</h4>
        <Field label="Tags" value={(m.tags ?? []).join(', ')} readOnly={readOnly} placeholder="core, chapter-2" onSave={(v) => setMind({ tags: v.split(/[,\n]/).map((t) => t.trim()).filter(Boolean) })} />
        <Field label="Assumptions" value={(m.assumptions ?? []).join('\n')} multiline readOnly={readOnly} placeholder="One per line: what it takes for granted" onSave={(v) => setMind({ assumptions: lines(v) })} />
        <Field
          label="Sources"
          value={(m.sources ?? []).map((s) => (s.url ? `${s.title} | ${s.url}` : s.title)).join('\n')}
          multiline
          readOnly={readOnly}
          placeholder="One per line: Title | https://…"
          onSave={(v) => setMind({ sources: lines(v).map((l) => {
            const [title, url] = l.split('|').map((x) => x.trim());
            return { title, ...(url ? { url } : {}) };
          }) })}
        />
        <Field
          label="Your fields"
          value={(m.props ?? []).map((x) => `${x.k}: ${x.v}`).join('\n')}
          multiline
          readOnly={readOnly}
          placeholder="One per line: Chapter: 2"
          onSave={(v) => setMind({ props: lines(v).map((l) => {
            const i = l.indexOf(':');
            return i > 0 ? { k: l.slice(0, i).trim(), v: l.slice(i + 1).trim() } : { k: l, v: '' };
          }).filter((x) => x.v) })}
        />
        <h4 className="tc-sec">Look</h4>
        <div className="tc-tones" role="group" aria-label="Tone">
          {MIND_TONES.map((t) => (
            <button key={t} type="button" className={`tc-tone tone-${t}${m.tone === t ? ' is-on' : ''}`} aria-pressed={m.tone === t} aria-label={TONE_SAID[t]} title={TONE_SAID[t]} disabled={readOnly} onClick={() => setMind({ tone: m.tone === t ? ('' as unknown as MindTone) : t })} />
          ))}
          <select aria-label="Shape" value={m.shape ?? 'card'} disabled={readOnly} onChange={(e) => setMind({ shape: e.target.value === 'card' ? ('' as unknown as 'card') : (e.target.value as 'pill' | 'note') })}>
            <option value="card">Card</option>
            <option value="pill">Pill</option>
            <option value="note">Note</option>
          </select>
        </div>
      </details>

      <footer className="tc-inspect-f">
        {p.onAsk && (
          <button type="button" className="tc-btn is-go" onClick={() => p.onAsk!({ id: n.id, label: n.label })}>
            Ask Socria about this
          </button>
        )}
        {!readOnly &&
          (sure ? (
            <span className="tc-sure" role="group" aria-label="Take it off the map?">
              <span>Take “{n.label}” off the map? Its lines go with it.</span>
              <button type="button" className="tc-btn" onClick={() => p.onEdits([{ op: 'remove', id: n.id }])}>
                Take it off
              </button>
              <button type="button" className="tc-btn is-quiet" onClick={() => setSure(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" className="tc-btn is-quiet" onClick={() => setSure(true)}>
              Take off the map
            </button>
          ))}
        {m.edited && <span className="tc-quiet">Changed {new Date(m.edited).toLocaleDateString()}</span>}
      </footer>
    </aside>
  );
}

// ── a line, opened ───────────────────────────────────────────────────

function EdgeInspector(p: { e: LogosEdge; map: ThinkingMap; readOnly: boolean; onEdits: (e: MapEdit[]) => void; onClose: () => void; onSelectNode: (id: string) => void; onAskLine?: (text: string) => void; narrow: boolean }) {
  const { e, map, readOnly } = p;
  const a = map.nodes.find((n) => n.id === e.from), b = map.nodes.find((n) => n.id === e.to);
  if (!a || !b) return null;
  const st = lineStatus(e);
  const structure = e.kind === 'structure';
  const said = structure ? 'sits inside' : RELATION_SAID[e.relation];
  const explain = (set: { why?: string; evidence?: string[]; status?: 'confirmed' | 'suggested' }) => p.onEdits([{ op: 'explain', from: e.from, to: e.to, ...(structure ? {} : { was: e.relation }), ...set }]);
  return (
    <aside className={`tc-inspect is-edge${p.narrow ? ' is-sheet' : ''}`} aria-label={`The connection from ${a.label} to ${b.label}`}>
      <header className="tc-inspect-h">
        <span className="tc-inspect-k">{structure ? 'Structure' : `Connection · ${FAMILY_LABEL[FAMILY_OF[e.relation]]}`}</span>
        <button type="button" className="tc-x" aria-label="Close" onClick={p.onClose}>
          ×
        </button>
      </header>
      <p className="tc-edge-said">
        <button type="button" className="tc-link" onClick={() => p.onSelectNode(a.id)}>
          {a.label}
        </button>{' '}
        <em>{e.label || said}</em>{' '}
        <button type="button" className="tc-link" onClick={() => p.onSelectNode(b.id)}>
          {b.label}
        </button>
      </p>
      <p className={`tc-badge is-${st}`}>
        {STATUS_SAID[st]}
        {st === 'suggested' && e.confidence !== undefined ? ` · ${Math.round(e.confidence * 100)}% sure` : ''}
      </p>
      {!structure && (
        <div className="tc-row2">
          <label className="tc-field">
            <span className="tc-field-k">Kind of connection</span>
            <select value={e.relation} disabled={readOnly} onChange={(ev) => p.onEdits([{ op: 'edge', from: e.from, to: e.to, was: e.relation, relation: ev.target.value as LogosRelation }])}>
              {[...new Set([e.relation, ...CHOOSABLE])].map((r) => (
                <option key={r} value={r}>
                  {RELATION_SAID[r]}
                </option>
              ))}
            </select>
          </label>
          <Field label="Label on the line" value={e.label ?? ''} readOnly={readOnly} max={32} placeholder={said} onSave={(v) => p.onEdits([{ op: 'edge', from: e.from, to: e.to, was: e.relation, label: v }])} />
        </div>
      )}
      <Field label="Why they connect" value={e.why ?? ''} multiline readOnly={readOnly} max={400} placeholder={structure ? 'Why it belongs here' : 'The reasoning behind the line'} onSave={(v) => explain({ why: v })} />
      <Field label="What bears it out" value={(e.evidence ?? []).join('\n')} multiline readOnly={readOnly} placeholder="One per line: a quote, a figure, a source" onSave={(v) => explain({ evidence: lines(v) })} />
      {/* no reason stored is said, never filled in */}
      {!e.why && (
        <p className="tc-quiet">
          {st === 'read'
            ? 'Socria read this line from the conversation; it has no explanation stored. Ask why, or write the reason yourself.'
            : st === 'suggested'
              ? 'Socria suggested this line without a reason stored. Ask why before you confirm it.'
              : 'No reason is written for this line yet.'}
        </p>
      )}
      <footer className="tc-inspect-f">
        {!readOnly && st !== 'confirmed' && (
          <button type="button" className="tc-btn is-go" onClick={() => explain({ status: 'confirmed' })}>
            Confirm this connection
          </button>
        )}
        {p.onAskLine && (
          <button type="button" className="tc-btn" onClick={() => p.onAskLine!(`Why does “${a.label}” ${said} “${b.label}”?`)}>
            Ask Socria why
          </button>
        )}
        {!readOnly && (
          <button type="button" className="tc-btn is-quiet" onClick={() => p.onEdits(structure ? [{ op: 'parent', id: e.from, parent: null }] : [{ op: 'unlink', from: e.from, to: e.to, was: e.relation, kind: 'meaning' }])}>
            {structure ? 'Take out of the structure' : st === 'confirmed' ? 'Remove the connection' : 'Dismiss it'}
          </button>
        )}
      </footer>
    </aside>
  );
}

/** For a test, or a host that wants to show a card: point at it through the bus. */
export function showCard(mapKey: string, nodeId: string) {
  return act(`map:${mapKey}`, { op: 'focus', targets: [nodeVid(nodeId)], hold: true }, 'you');
}
