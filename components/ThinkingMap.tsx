'use client';

// The Thinking Map — the artifact Logos is really about.
//
// Layout is a small force simulation written by hand (no graph library):
// repulsion between every pair, springs along edges, a weak pull to centre.
// Existing nodes keep their position across map updates so the map *grows*
// rather than reshuffling; new nodes spawn beside something they connect to.
//
// Rendering is SVG edges underneath absolutely-positioned HTML nodes, so
// labels get real text wrapping and CSS transitions. Positions are written
// straight to the DOM each frame — React only re-renders when the map itself
// changes, never per frame.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ThinkingMap, LogosRelation } from '@/lib/logos';

type P = { x: number; y: number; vx: number; vy: number };

const SPRING_LEN = 186;
const SPRING_K = 0.03;
const REPULSION = 30000;
const MIN_DIST = 150;
const CENTER_PULL = 0.005;
const DAMPING = 0.87;
const ALPHA_DECAY = 0.991;
const ALPHA_MIN = 0.004;
const PAD = 104;
// Cards are wide, so point-repulsion alone lets them overlap. These are the
// half-extents used for hard box separation after each integration step.
const HALF_W = 92;
const HALF_H = 46;
const GAP = 14;
const SEPARATION_PASSES = 3;

// Fraction along a centre-to-centre vector at which it leaves a card's box.
// Used to trim edges so they run card-edge to card-edge.
const TRIM_W = 88;
const TRIM_H = 38;
function boxExit(dx: number, dy: number): number {
  const tx = dx === 0 ? Infinity : TRIM_W / Math.abs(dx);
  const ty = dy === 0 ? Infinity : TRIM_H / Math.abs(dy);
  return Math.min(tx, ty, 0.5);
}

const RELATION_LABEL: Record<LogosRelation, string> = {
  supports: 'supports',
  conflicts: 'conflicts with',
  depends: 'depends on',
  relates: 'relates to',
};

export function ThinkingMap({ map }: { map: ThinkingMap }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const posRef = useRef<Map<string, P>>(new Map());
  const nodeElRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const edgeElRef = useRef<Map<string, SVGPathElement>>(new Map());
  const sizeRef = useRef({ w: 800, h: 600 });
  const alphaRef = useRef(1);
  const rafRef = useRef(0);
  const mapRef = useRef(map);

  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  mapRef.current = map;

  const edgeKey = (e: { from: string; to: string; relation: string }) =>
    `${e.from}~${e.to}~${e.relation}`;

  // Which nodes/edges are lit for the current hover or focus.
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

  // Seed positions for nodes we haven't placed yet, and forget dropped ones.
  useEffect(() => {
    const { w, h } = sizeRef.current;
    const pos = posRef.current;
    const ids = new Set(map.nodes.map((n) => n.id));

    for (const id of Array.from(pos.keys())) {
      if (!ids.has(id)) pos.delete(id);
    }

    for (const n of map.nodes) {
      if (pos.has(n.id)) continue;
      // Spawn beside a neighbour that already exists, so a new thought
      // appears to grow out of the one it came from.
      const neighbour = map.edges.find(
        (e) =>
          (e.from === n.id && pos.has(e.to)) || (e.to === n.id && pos.has(e.from))
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

    alphaRef.current = 1; // let the map settle again
  }, [map]);

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

      // Trim both ends to the card boundary, otherwise the opaque cards sit
      // on top of the line and the relationship reads as a floating stub.
      const t = boxExit(dx, dy);
      const ax = a.x + dx * t;
      const ay = a.y + dy * t;
      const bx = b.x - dx * t;
      const by = b.y - dy * t;

      // If the cards are practically touching there is no line to draw.
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

  // Force simulation.
  useEffect(() => {
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
            const eff = Math.max(d, MIN_DIST * 0.55);
            const f = (REPULSION / (eff * eff)) * alpha;
            const ux = dx / d;
            const uy = dy / d;
            a.vx -= ux * f;
            a.vy -= uy * f;
            b.vx += ux * f;
            b.vy += uy * f;
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
          const ux = dx / d;
          const uy = dy / d;
          a.vx += ux * f;
          a.vy += uy * f;
          b.vx -= ux * f;
          b.vy -= uy * f;
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

        // Hard box separation — the force field alone lets wide cards sit on
        // top of each other, so push any overlapping pair apart along their
        // axis of least penetration. A few relaxation passes settle it.
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
                const shift = (ox / 2) * (dx < 0 ? -1 : 1);
                a.x -= shift;
                b.x += shift;
              } else {
                const shift = (oy / 2) * (dy < 0 ? -1 : 1);
                a.y -= shift;
                b.y += shift;
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
  }, [paint]);

  // Track panel size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
      alphaRef.current = Math.max(alphaRef.current, 0.4);
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    sizeRef.current = { w: r.width, h: r.height };
    return () => ro.disconnect();
  }, []);

  const dimmed = (on: boolean) => (related && !on ? ' is-dim' : '');

  return (
    <div
      className="lg-map"
      ref={wrapRef}
      onClick={() => setFocused(null)}
      aria-label="Thinking map"
    >
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

      <svg className="lg-edges" ref={svgRef} aria-hidden="true">
        {map.edges.map((e) => {
          const key = edgeKey(e);
          const on = related ? related.edges.has(key) : true;
          return (
            <path
              key={key}
              ref={(el) => {
                if (el) edgeElRef.current.set(key, el);
                else edgeElRef.current.delete(key);
              }}
              className={`lg-edge lg-edge-${e.relation}${dimmed(on)}${
                related && on ? ' is-lit' : ''
              }`}
              pathLength={1}
              fill="none"
            />
          );
        })}
      </svg>

      {map.nodes.map((n) => {
        const on = related ? related.nodes.has(n.id) : true;
        return (
          <div
            key={n.id}
            ref={(el) => {
              if (el) nodeElRef.current.set(n.id, el);
              else nodeElRef.current.delete(n.id);
            }}
            className={`lg-node-pos${dimmed(on)}`}
          >
            <button
              type="button"
              className={`lg-node lg-node-${n.type}${
                focused === n.id ? ' is-focused' : ''
              }${related && on && active !== n.id ? ' is-lit' : ''}`}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(n.id)}
              onBlur={() => setHovered(null)}
              onClick={(ev) => {
                ev.stopPropagation();
                setFocused((f) => (f === n.id ? null : n.id));
              }}
            >
              <span className="lg-node-type">{n.type}</span>
              <span className="lg-node-label">{n.label}</span>
            </button>
          </div>
        );
      })}

      {/* Relation labels appear only for the node being examined. */}
      {related && active && (
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
                  <span className="lg-legend-a">
                    {forward ? self.label : otherNode.label}
                  </span>
                  <span className={`lg-legend-rel lg-rel-${e.relation}`}>
                    {RELATION_LABEL[e.relation]}
                  </span>
                  <span className="lg-legend-b">
                    {forward ? otherNode.label : self.label}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
