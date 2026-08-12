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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ThinkingMap as TMap, LogosRelation } from '@/lib/logos';
import { NodeGlyph } from './NodeGlyph';
import {
  LENSES,
  RELATION_LABEL,
  availableLenses,
  layoutEvidence,
  layoutStructure,
  layoutTensions,
  cardH,
  GRAPH_W,
  type Connector,
  type LensId,
  type Placed,
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

function boxExit(dx: number, dy: number): number {
  const tx = dx === 0 ? Infinity : TRIM_W / Math.abs(dx);
  const ty = dy === 0 ? Infinity : TRIM_H / Math.abs(dy);
  return Math.min(tx, ty, 0.5);
}

export function ThinkingMap({
  map,
  initialLens = 'graph',
  onExplore,
}: {
  map: TMap;
  initialLens?: LensId;
  /** clicking a card asks to look closer at that piece of reasoning */
  onExplore?: (node: { id: string; label: string; type: TMap['nodes'][number]['type'] }) => void;
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
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const lenses = useMemo(() => availableLenses(map), [map]);

  // If the active lens loses its content, fall back to the graph.
  useEffect(() => {
    if (lenses.length && !lenses.includes(lens)) setLens(lenses[0]);
  }, [lenses, lens]);

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
    if (lens === 'graph') return null;
    const { w, h } = size;
    if (lens === 'structure') return layoutStructure(map, w, h);
    if (lens === 'tensions') return layoutTensions(map, w, h);
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
      if (alpha > ALPHA_MIN) {
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
      sizeRef.current = { w: r.width, h: r.height };
      setSize({ w: r.width, h: r.height });
      alphaRef.current = Math.max(alphaRef.current, 0.4);
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, []);

  const dim = (on: boolean) => (related && !on ? ' is-dim' : '');
  const caption =
    staticLayout?.caption ?? LENSES.find((l) => l.id === 'graph')!.caption;

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
              className={`lg-lens${lens === l.id ? ' is-on' : ''}`}
              onClick={() => {
                setLens(l.id);
                setFocused(null);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      <div className="lg-map" ref={wrapRef} onClick={() => setFocused(null)}>
        {map.nodes.length === 0 && (
          <div className="lg-map-empty">
            <span className="lg-map-empty-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="24" cy="14" r="5" />
                <circle cx="12" cy="34" r="5" />
                <circle cx="36" cy="34" r="5" />
                <path d="M21 18.5 14.5 29.5M27 18.5 33.5 29.5M17 34h14" strokeLinecap="round" />
              </svg>
            </span>
            <p>Your reasoning will take shape here.</p>
          </div>
        )}

        {map.nodes.length > 0 && staticLayout?.empty && (
          <div className="lg-map-empty">
            <p>{staticLayout.empty}</p>
          </div>
        )}

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
              <g key={c.key} className={`lg-conn lg-conn-${c.relation}${dim(on)}${related && on ? ' is-lit' : ''}`}>
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
              className={`lg-node-pos${dim(on)}`}
              style={
                lens === 'graph'
                  ? undefined
                  : { transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }
              }
            >
              <button
                type="button"
                style={{ width: p.w }}
                className={`lg-node lg-node-${p.node.type}${
                  focused === p.id ? ' is-focused' : ''
                }${related && on && active !== p.id ? ' is-lit' : ''}`}
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(p.id)}
                onBlur={() => setHovered(null)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setFocused(p.id);
                  onExplore?.({ id: p.id, label: p.node.label, type: p.node.type });
                }}
              >
                <span className="lg-node-head">
                  <NodeGlyph type={p.node.type} />
                  <span className="lg-node-type">{p.node.type}</span>
                </span>
                <span className="lg-node-label">{p.node.label}</span>
              </button>
            </div>
          );
        })}

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

      {map.nodes.length > 0 && <p className="lg-caption">{caption}</p>}
    </div>
  );
}
