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
import type { ThinkingMap as TMap, LogosRelation } from '@/lib/logos';
import { MODE_META, NODE_MODES, type NodeMode } from '@/lib/logos-explore';
import { NodeGlyph } from './NodeGlyph';
import { StatusMark } from './StatusMark';
import { TeX, MathText } from './TeX';
import { MathPlot } from './MathPlot';
import { MathViz } from './MathViz';
import { MatrixLens } from './MatrixLens';
import type { VizScene } from '@/lib/logos-viz';
import { MathBoard } from './MathBoard';

/** The zoom ladder. Discrete steps, so every zoom lands somewhere legible. */
const ZOOMS = [0.55, 0.7, 0.85, 1, 1.2, 1.45];
/** Wheel delta that makes one step — roughly one notch of a mouse wheel. */
const WHEEL_STEP = 60;

/** One rung up or down from wherever `from` sits, clamped at both ends. */
function stepZoom(from: number, dir: -1 | 1): number {
  const i = ZOOMS.indexOf(from);
  const at = i === -1 ? ZOOMS.indexOf(1) : i;
  return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + dir))];
}
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
  cardH,
  GRAPH_W,
  type Connector,
  leadLens,
  type LensId,
  type Placed,
  buildMatrix,
} from '@/lib/logos-layout';

type P = { x: number; y: number; vx: number; vy: number };

const SPRING_LEN = 186;
const SPRING_K = 0.03;
const REPULSION = 30000;
const CENTER_PULL = 0.005;
const DAMPING = 0.87;
const ALPHA_DECAY = 0.991;
const ALPHA_MIN = 0.004;
const PAD = 104;
const HALF_W = 92;
const HALF_H = 46;
const GAP = 14;
const SEPARATION_PASSES = 3;
const TRIM_W = 84;
const TRIM_H = 26;
// Roughly the action menu's height — only used to decide which side to open on.
const MENU_H = 246;

function boxExit(dx: number, dy: number): number {
  const tx = dx === 0 ? Infinity : TRIM_W / Math.abs(dx);
  const ty = dy === 0 ? Infinity : TRIM_H / Math.abs(dy);
  return Math.min(tx, ty, 0.5);
}

export type MapNodeRef = { id: string; label: string; type: TMap['nodes'][number]['type'] };

export function ThinkingMap({
  map,
  initialLens = 'graph',
  onAction,
  explored,
  changed,
  relevant,
  canFocus,
  onFocus,
  grounded,
  onAddContext,
  guarded,
  lensesLocked,
  onLocked,
  researchLocked,
  onViz,
}: {
  map: TMap;
  initialLens?: LensId;
  /** a card is never inert: pick what to do with this piece of reasoning */
  onAction?: (mode: NodeMode, node: MapNodeRef) => void;
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
  /** Answer Guard is on — the board must not reveal a withheld result */
  guarded?: boolean;
  /** free tier: the alternate lenses are Socria One's, the default stays open */
  lensesLocked?: boolean;
  onLocked?: () => void;
  /** free tier: Research has been spent in this conversation */
  researchLocked?: boolean;
  /** the reader edited the interactive graph — keep it with the session */
  onViz?: (scene: VizScene) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<Map<string, P>>(new Map());
  const nodeElRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const edgeElRef = useRef<Map<string, SVGPathElement>>(new Map());
  const sizeRef = useRef({ w: 800, h: 600 });
  const alphaRef = useRef(1);
  const rafRef = useRef(0);
  const mapRef = useRef(map);
  mapRef.current = map;

  const [lens, setLens] = useState<LensId>(initialLens);
  // Once the person picks a lens by hand, stop auto-switching for them.
  const lensManual = useRef(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // The action menu is anchored in map coordinates and drawn in its own layer
  // above every card — nesting it inside a card leaves it fighting the
  // neighbours it overlaps for paint order.
  const [menu, setMenu] = useState<{
    id: string;
    x: number;
    y: number;
    above: boolean;
  } | null>(null);
  const menuFor = menu?.id ?? null;

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  /** wheel delta banked toward the next step on the discrete ladder */
  const wheelRef = useRef(0);
  /** scroll offset to restore after a zoom, so the cursor stays anchored */
  const anchorRef = useRef<{ left: number; top: number } | null>(null);

  // Zooming OUT gives the graph simulation more room rather than just shrinking
  // what is already there — a crowded map rendered smaller is still crowded.
  // Zooming IN never shrinks the world: it magnifies, and the container's own
  // overflow does the panning. The static lenses compute their own extents and
  // already overflow, so for them the scale alone is the whole feature.
  const world = useMemo(
    () => ({ w: size.w / Math.min(zoom, 1), h: size.h / Math.min(zoom, 1) }),
    [size.w, size.h, zoom]
  );

  // Widening the world means the graph has somewhere new to spread into, so
  // wake the simulation; a pinned menu is measured against the old scale.
  useEffect(() => {
    zoomRef.current = zoom;
    sizeRef.current = { w: world.w, h: world.h };
    alphaRef.current = Math.max(alphaRef.current, 0.35);
    setMenu(null);
  }, [zoom, world.w, world.h]);

  const zoomBy = (dir: -1 | 1) => setZoom((z) => stepZoom(z, dir));

  // Ctrl/Cmd + wheel zooms, the way every map on the web does. A trackpad
  // pinch arrives as a wheel event with ctrlKey already set, so pinch-to-zoom
  // comes along for free. A plain wheel is left alone: it still pans a map
  // that has grown past the panel, which is the more common thing to want.
  //
  // Registered by hand rather than with onWheel because React attaches wheel
  // listeners passively, and without preventDefault the browser zooms the
  // whole page instead of the map.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      // The plot and the Board draw themselves to fit, so they have no zoom
      // control; changing it behind their backs would only grow the sizer and
      // hang a scrollbar off nothing.
      if (lens === 'plot' || lens === 'board' || lens === 'matrix') return;
      e.preventDefault();

      // One mouse notch (~100) is one step; a pinch sends many small deltas,
      // so they accumulate instead of tearing through the whole ladder in a
      // single gesture. Reversing direction discards what was banked.
      const d = e.deltaY;
      if (d === 0) return;
      if (d > 0 !== wheelRef.current > 0) wheelRef.current = 0;
      wheelRef.current += d;
      if (Math.abs(wheelRef.current) < WHEEL_STEP) return;
      const dir: -1 | 1 = wheelRef.current > 0 ? -1 : 1; // wheel down zooms out
      wheelRef.current = 0;

      const from = zoomRef.current;
      const to = stepZoom(from, dir);
      if (to === from) return;

      // Keep whatever is under the cursor under the cursor. Only meaningful
      // while zoomed past 1:1 — below that the sizer matches the panel and
      // there is nothing to scroll — but harmless to compute either way.
      const box = el.getBoundingClientRect();
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      const sx = (el.scrollLeft + px) / from;
      const sy = (el.scrollTop + py) / from;
      anchorRef.current = { left: sx * to - px, top: sy * to - py };

      setZoom(to);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [lens]);

  // Applied after the sizer has grown, or the scroll offset would be clamped
  // against the old extent and the anchor would slide.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    const a = anchorRef.current;
    anchorRef.current = null;
    if (!el || !a) return;
    el.scrollLeft = a.left;
    el.scrollTop = a.top;
  }, [zoom]);

  // Hold the graph still while a menu is open — a target that drifts out from
  // under the cursor is the fastest way to make this feel cheap.
  const frozenRef = useRef(false);
  frozenRef.current = menu !== null;

  useEffect(() => {
    if (!menuFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuFor]);

  const lenses = useMemo(() => availableLenses(map), [map]);

  // A free reader keeps the lens this map leads with — the signature view,
  // never a stub. The other readings of the same reasoning are One's. The
  // auto-switch below lands on exactly this lens, so nobody is ever dropped
  // onto something they can't open, and nobody is given a free lens they
  // were never shown.
  const lead = leadLens(lenses, !!map.viz);
  const lensLocked = (id: LensId) => !!lensesLocked && id !== lead;

  // Open on the lens that IS the answer, unless the reader has since chosen
  // otherwise. A map carrying a scene used to open on the concept graph with
  // the diagram an unlabelled tab away — the picture had been built and
  // nothing showed it.
  useEffect(() => {
    if (!lenses.length) return;
    // On the free tier exactly one lens is theirs — the lead — and nothing
    // may leave them anywhere else. The click handler already refuses a
    // locked tab, but two paths went around it: an initialLens that is not
    // the lead, and the fallback below, which reached for lenses[0] rather
    // than for the one they can actually use. Either put a locked lens in the
    // active slot, where its content then rendered: the panel checks which
    // lens is selected, never whether it is allowed.
    if (lensesLocked && lead && lens !== lead) {
      setLens(lead);
      return;
    }
    // The lens they were on no longer exists. Fall back to the one that IS
    // the answer for this map rather than to whatever sorts first.
    if (!lenses.includes(lens)) {
      setLens(lead ?? lenses[0]);
      return;
    }
    if (!lensManual.current && lead && lens !== lead) setLens(lead);
  }, [lenses, lens, lead, lensesLocked]);

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
    if (lens === 'graph' || lens === 'plot' || lens === 'board' || lens === 'matrix') return null;
    const { w, h } = size;
    if (lens === 'structure') return layoutStructure(map, w, h);
    if (lens === 'tensions') return layoutTensions(map, w, h);
    if (lens === 'solve') return layoutSolve(map, w, h);
    return layoutEvidence(map, w, h);
  }, [lens, map, size]);

  // ── graph lens: seed positions ───────────────────────────────────
  useEffect(() => {
    if (lens !== 'graph') return;
    const { w, h } = sizeRef.current;
    const pos = posRef.current;
    const ids = new Set(map.nodes.map((n) => n.id));
    for (const id of Array.from(pos.keys())) if (!ids.has(id)) pos.delete(id);

    for (const n of map.nodes) {
      if (pos.has(n.id)) continue;
      const neighbour = map.edges.find(
        (e) => (e.from === n.id && pos.has(e.to)) || (e.to === n.id && pos.has(e.from))
      );
      const anchor = neighbour
        ? pos.get(neighbour.from === n.id ? neighbour.to : neighbour.from)
        : null;
      const angle = Math.random() * Math.PI * 2;
      const base = anchor ?? { x: w / 2, y: h / 2 };
      const dist = anchor ? SPRING_LEN * 0.85 : 40 + Math.random() * 60;
      pos.set(n.id, {
        x: base.x + Math.cos(angle) * dist,
        y: base.y + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
      });
    }
    alphaRef.current = 1;
  }, [map, lens]);

  const paint = useCallback(() => {
    const pos = posRef.current;
    for (const [id, el] of nodeElRef.current) {
      const p = pos.get(id);
      if (p && el) el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`;
    }
    for (const [key, el] of edgeElRef.current) {
      const [from, to] = key.split('~');
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b || !el) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const t = boxExit(dx, dy);
      const ax = a.x + dx * t;
      const ay = a.y + dy * t;
      const bx = b.x - dx * t;
      const by = b.y - dy * t;
      if ((bx - ax) * dx + (by - ay) * dy <= 0) {
        el.setAttribute('d', '');
        continue;
      }
      const off = Math.min(22, len * 0.1);
      const cx = (ax + bx) / 2 - (dy / len) * off;
      const cy = (ay + by) / 2 + (dx / len) * off;
      el.setAttribute('d', `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`);
    }
  }, []);

  // ── graph lens: simulation ───────────────────────────────────────
  useEffect(() => {
    if (lens !== 'graph') return;
    const step = () => {
      const alpha = alphaRef.current;
      if (alpha > ALPHA_MIN && !frozenRef.current) {
        const { w, h } = sizeRef.current;
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
              dx = Math.random() - 0.5;
              dy = Math.random() - 0.5;
              d = 1;
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
          p.vx += (w / 2 - p.x) * CENTER_PULL * alpha;
          p.vy += (h / 2 - p.y) * CENTER_PULL * alpha;
          p.vx *= DAMPING;
          p.vy *= DAMPING;
          p.x += p.vx;
          p.y += p.vy;
        }
        const minX = HALF_W * 2 + GAP;
        const minY = HALF_H * 2 + GAP;
        for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
          for (let i = 0; i < nodes.length; i++) {
            const a = pos.get(nodes[i].id);
            if (!a) continue;
            for (let j = i + 1; j < nodes.length; j++) {
              const b = pos.get(nodes[j].id);
              if (!b) continue;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const ox = minX - Math.abs(dx);
              const oy = minY - Math.abs(dy);
              if (ox <= 0 || oy <= 0) continue;
              if (ox < oy) {
                const s = (ox / 2) * (dx < 0 ? -1 : 1);
                a.x -= s;
                b.x += s;
              } else {
                const s = (oy / 2) * (dy < 0 ? -1 : 1);
                a.y -= s;
                b.y += s;
              }
            }
          }
        }
        for (const n of nodes) {
          const p = pos.get(n.id);
          if (!p) continue;
          p.x = Math.max(PAD, Math.min(w - PAD, p.x));
          p.y = Math.max(PAD * 0.62, Math.min(h - PAD * 0.62, p.y));
        }
        alphaRef.current = alpha * ALPHA_DECAY;
        paint();
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paint, lens]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      // sizeRef is the simulation's world, which zoom can widen; `size` stays
      // the container, because the Board and the plot draw to fit it.
      sizeRef.current = { w: r.width / Math.min(zoomRef.current, 1), h: r.height / Math.min(zoomRef.current, 1) };
      setSize({ w: r.width, h: r.height });
      alphaRef.current = Math.max(alphaRef.current, 0.4);
      // The menu is pinned to coordinates that no longer mean anything.
      setMenu(null);
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, []);

  const dim = (on: boolean) => (related && !on ? ' is-dim' : '');
  const caption =
    staticLayout?.caption ?? LENSES.find((l) => l.id === lens)!.caption;

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
      : (staticLayout?.placed ?? []);

  const connectors: Connector[] =
    lens === 'graph'
      ? map.edges.map((e) => ({
          key: edgeKey(e),
          path: '',
          relation: e.relation as LogosRelation,
          strength: e.strength,
        }))
      : (staticLayout?.connectors ?? []);

  return (
    <div className="lg-map-wrap">
      {lenses.length > 1 && (
        <div className="lg-lenses" role="tablist" aria-label="Map lens">
          {LENSES.filter((l) => lenses.includes(l.id)).map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={lens === l.id}
              className={`lg-lens${lens === l.id ? ' is-on' : ''}${
                lensLocked(l.id) ? ' is-locked' : ''
              }`}
              onClick={() => {
                if (lensLocked(l.id)) {
                  onLocked?.();
                  return;
                }
                lensManual.current = true;
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
        className="lg-map"
        ref={wrapRef}
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
          (map.viz ? (
            <MathViz
              scene={map.viz}
              width={size.w}
              height={size.h}
              guarded={guarded}
              onSceneChange={onViz}
            />
          ) : (
            <MathPlot map={map} width={size.w} height={size.h} guarded={guarded} />
          ))}
        {/* the board is worked-by-hand notebook, not cards */}
        {lens === 'board' && (
          <MathBoard map={map} width={size.w} height={size.h} guarded={guarded} />
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

        {/* The sizer carries the scrollable extent, because a transform does
            not change an element's layout box; the surface inside it is what
            actually scales. Zoomed out the two cancel and the map fits the
            panel exactly; zoomed in the sizer grows and the panel pans.

            Skipped entirely on the lenses that draw themselves. It is a
            full-bleed absolute layer painted after them, so leaving it up
            over the plot or the Board put an invisible sheet across both —
            harmless while neither had anything to click, and not harmless
            now that the plot has controls. */}
        {lens !== 'plot' && lens !== 'board' && (
        <div
          className="lg-map-sizer"
          style={{ width: world.w * zoom, height: world.h * zoom }}
        >
          <div
            className="lg-map-surface"
            style={{ width: world.w, height: world.h, transform: `scale(${zoom})` }}
          >
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
              >
                <path
                  ref={
                    lens === 'graph'
                      ? (el) => {
                          if (el) edgeElRef.current.set(c.key, el);
                          else edgeElRef.current.delete(c.key);
                        }
                      : undefined
                  }
                  className="lg-edge"
                  d={lens === 'graph' ? undefined : c.path}
                  pathLength={1}
                  fill="none"
                  markerEnd={c.arrow ? 'url(#lg-arrow)' : undefined}
                  markerStart={c.double ? 'url(#lg-arrow)' : undefined}
                />
                {c.label && c.lx != null && c.ly != null && (
                  <text className="lg-conn-label" x={c.lx} y={c.ly - 9} textAnchor="middle">
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
          return (
            <div
              key={p.id}
              ref={
                lens === 'graph'
                  ? (el) => {
                      if (el) nodeElRef.current.set(p.id, el);
                      else nodeElRef.current.delete(p.id);
                    }
                  : undefined
              }
              className={`lg-node-pos${dim(on)}${menuFor === p.id ? ' is-menu' : ''}`}
              style={
                lens === 'graph'
                  ? undefined
                  : { transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }
              }
            >
              <button
                type="button"
                style={{ width: p.w }}
                className={`lg-node lg-node-${p.node.type} lg-st-${p.node.status ?? 'open'}${
                  focused === p.id ? ' is-focused' : ''
                }${related && on && active !== p.id ? ' is-lit' : ''}${
                  explored?.has(p.id) ? ' is-explored' : ''
                }${changed?.has(p.id) ? ' is-changed' : ''}${
                  menuFor === p.id ? ' is-open' : ''
                }${relevant?.has(p.id) ? ' is-relevant' : ''}${
                  p.node.flag ? ` lg-flag-${p.node.flag}` : ''
                }`}
                aria-haspopup="menu"
                aria-expanded={menuFor === p.id}
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(p.id)}
                onBlur={() => setHovered(null)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setFocused(p.id);
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
                  // The menu sits inside the scrollable, scaled sizer, so it is
                  // placed in scroll-content coordinates — client rects are
                  // viewport-relative, hence the scroll offsets.
                  setMenu({
                    id: p.id,
                    x: card.left - box.left + el.scrollLeft + card.width / 2,
                    y: above
                      ? card.top - box.top + el.scrollTop - 8
                      : card.bottom - box.top + el.scrollTop + 8,
                    above,
                  });
                }}
              >
                <span className="lg-node-head">
                  <NodeGlyph type={p.node.type} />
                  <span className="lg-node-type">{p.node.type}</span>
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
                  {hideVal ? (
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

        {menu &&
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
                    <span className="lg-act-label">
                      {MODE_META[m].label}
                      {m === 'research' && researchLocked && <OneLock />}
                    </span>
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
              </div>
            );
          })()}
        </div>
        )}

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

      {/* Zoom is meaningless on the plot and the Board, which draw to fit. */}
      {map.nodes.length > 0 && lens !== 'plot' && lens !== 'board' && (
        <div className="lg-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            disabled={zoom <= ZOOMS[0]}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="lg-zoom-level"
            onClick={() => setZoom(1)}
            disabled={zoom === 1}
            aria-label={`Zoom ${Math.round(zoom * 100)} percent — reset`}
            title="Reset zoom — or hold Ctrl and scroll to zoom on the map"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1)}
            disabled={zoom >= ZOOMS[ZOOMS.length - 1]}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
        </div>
      )}

      {map.nodes.length > 0 && <p className="lg-caption">{caption}</p>}
    </div>
  );
}
