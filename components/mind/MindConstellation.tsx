'use client';
// components/mind/MindConstellation.tsx
//
// EVERYTHING SOCRIA REMEMBERS, DRAWN AS ONE PICTURE (lib/mind/constellation.ts
// does the placing). Memory in the middle; every chat around it, a Logos line
// of thinking drawn as its own map in miniature and filed in its Project's
// arc; what was made in a chat beside it; and between them, threaded to each
// chat it is in, whatever two chats share.
//
// Hover anything to see what it touches — everything else steps back. Choose
// it to read it in the panel beside the picture, and open a chat from there.
//
// The threads are drawn once and only dimmed while something is in focus; the
// few that light up are drawn again on top. That keeps a big account cheap to
// hover: one class on the root, and a handful of paths.

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Atlas, AtlasNode } from '@/lib/mind/atlas';
import { constellation, MEMORY_LABEL, type Constellation, type Placed, type Thread } from '@/lib/mind/constellation';
import './mind-constellation.css';

/** The Memory page's four-colour code (components/mind/MindGraphView.tsx). */
const CODE: Record<string, 'person' | 'evidence' | 'question' | 'neutral'> = {
  Person: 'person', Goal: 'person', Plan: 'person', Decision: 'person', Preference: 'person', Belief: 'person',
  Assumption: 'person', Insight: 'person', Question: 'question', Uncertainty: 'question', Tension: 'question',
  Evidence: 'evidence', Source: 'evidence',
};
const codeOf = (n: AtlasNode) => CODE[n.type] ?? 'neutral';

/**
 * Drawn at the size it is shown, so its words are always their real size —
 * in a panel as on the page. Until it has been measured, these.
 */
const SIZE = { page: { W: 1100, H: 820 }, panel: { W: 600, H: 560 } };
const fit = (w: number, panel: boolean) => {
  const W = Math.round(Math.max(320, w));
  const H = Math.round(panel ? Math.min(760, Math.max(380, W * 0.92)) : Math.min(880, Math.max(520, W * 0.74)));
  return { W, H, room: Math.round(Math.min(175, Math.max(96, Math.min(W, H) * 0.22))) };
};

/** Labels are shown for everything while there is room, and on focus after that. */
const SHOW = { chats: 90, bridges: 16 };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const deg = (a: number) => (a * 180) / Math.PI;
const path = (t: Thread, nodes: Constellation['nodes']) => {
  const a = nodes[t.from];
  const b = nodes[t.to];
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${t.qx.toFixed(1)},${t.qy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
};

export function MindConstellation({
  atlas,
  sel,
  onSel,
  onOpenChat,
  embedded = false,
}: {
  atlas: Atlas;
  sel: string | null;
  onSel: (id: string | null) => void;
  /** a chat's conversation id */
  onOpenChat?: (conversationId: string) => void;
  embedded?: boolean;
}) {
  const box = useRef<HTMLElement>(null);
  const [size, setSize] = useState(() => fit(embedded ? SIZE.panel.W : SIZE.page.W, embedded));
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setSize((s) => (Math.abs(s.W - w) < 4 ? s : fit(w, embedded)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [embedded]);
  const { W, H, room } = size;
  const c = useMemo(() => constellation(atlas, { width: W, height: H, labelRoom: room }), [atlas, W, H, room]);
  const byId = useMemo(() => new Map(atlas.nodes.map((n) => [n.id, n])), [atlas]);
  const [hov, setHov] = useState<string | null>(null);
  // An idea on one map only is part of that map's tile: choosing it from the
  // panel lights its chat.
  const host = useMemo(() => {
    const m = new Map<string, string>();
    for (const [chat, ids] of Object.entries(c.folded)) for (const id of ids) m.set(id, chat);
    return m;
  }, [c]);
  const shown = (id: string | null) => (id && (c.nodes[id] ? id : host.get(id) ?? null)) || null;
  const focus = shown(hov ?? sel);
  const picked = shown(sel);

  // what the focus touches: its threads, and a chat's own satellites
  const near = useMemo(() => {
    const s = new Set<string>();
    if (!focus) return s;
    for (const t of c.threads) {
      if (t.from === focus) s.add(t.to);
      if (t.to === focus) s.add(t.from);
    }
    for (const p of Object.values(c.nodes)) if (p.chat === focus) s.add(p.id);
    const own = c.nodes[focus]?.chat;
    if (own) s.add(own);
    return s;
  }, [c, focus]);
  const lit = useMemo(() => (focus ? c.threads.filter((t) => t.from === focus || t.to === focus) : []), [c, focus]);

  // a satellite's place among its chat's, so their labels can be staggered
  const order = useMemo(() => {
    const m = new Map<string, { j: number; k: number }>();
    const by = new Map<string, string[]>();
    for (const p of Object.values(c.nodes)) if (p.role === 'satellite' && p.chat) by.set(p.chat, [...(by.get(p.chat) ?? []), p.id]);
    for (const ids of by.values()) ids.forEach((id, j) => m.set(id, { j, k: ids.length }));
    return m;
  }, [c]);
  const chats = c.ring_order.length;
  const memories = Object.values(c.nodes).filter((p) => p.role === 'memory' || p.role === 'project').length;
  const bridges = Object.values(c.nodes).filter((p) => p.role === 'bridge').length;

  const act = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSel(id === sel ? null : id);
    }
  };
  const common = (id: string) => ({
    tabIndex: 0,
    role: 'button' as const,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onSel(id === sel ? null : id);
    },
    onKeyDown: act(id),
    onPointerEnter: () => setHov(id),
    onPointerLeave: () => setHov((h) => (h === id ? null : h)),
    onFocus: () => setHov(id),
    onBlur: () => setHov((h) => (h === id ? null : h)),
  });
  const state = (id: string) => `${id === picked ? ' is-sel' : ''}${focus && (id === focus || near.has(id)) ? ' is-near' : ''}`;

  return (
    <figure className={`mc-root${embedded ? ' is-panel' : ''}`} ref={box}>
      <svg
        className={`mc-svg${focus ? ' has-focus' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={`What Socria remembers, connected: ${memories} ${memories === 1 ? 'memory' : 'memories'} in the middle, ${chats} ${chats === 1 ? 'chat' : 'chats'} around it.`}
        onClick={() => onSel(null)}
      >
        <defs>
          <radialGradient id="mc-glow">
            <stop offset="0%" className="mc-glow-in" />
            <stop offset="100%" className="mc-glow-out" />
          </radialGradient>
        </defs>
        <ellipse className="mc-core-glow" cx={c.cx} cy={c.cy} rx={c.core.rx * 1.35} ry={c.core.ry * 1.35} fill="url(#mc-glow)" />
        <ellipse className="mc-guide" cx={c.cx} cy={c.cy} rx={c.ring.rx} ry={c.ring.ry} />
        <ellipse className="mc-guide is-core" cx={c.cx} cy={c.cy} rx={c.core.rx + 14} ry={c.core.ry + 14} />

        <Arcs c={c} />
        <Threads c={c} />
        {lit.length > 0 && (
          <g className="mc-lit" aria-hidden="true">
            {lit.map((t, i) => (
              <path key={i} className={`mc-thread k-${t.kind}`} d={path(t, c.nodes)} />
            ))}
          </g>
        )}

        {/* the core's own caption, where there is room between it and the ring */}
        {c.ring.ry - c.core.ry > 96 && (
          <text className="mc-caption" x={c.cx} y={c.cy + c.core.ry + 34} textAnchor="middle">
            {memories ? `What Socria remembers · ${memories}` : 'Nothing remembered yet'}
          </text>
        )}

        {/* satellites: what was made in one chat */}
        {Object.values(c.nodes)
          .filter((p) => p.role === 'satellite')
          .map((p) => {
            const n = byId.get(p.id)!;
            return (
              <g key={p.id} className={`mc-node mc-sat k-${n.kind}${state(p.id)}`} transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`} aria-label={`${kindWord(n)}: ${n.label}`} {...common(p.id)}>
                <MadeGlyph n={n} />
                {focus && (p.id === focus || near.has(p.id)) && (
                  <SideLabel p={p} c={c} text={clip(n.label, 34)} cls="mc-label is-made" inward dy={((order.get(p.id)?.j ?? 0) - ((order.get(p.id)?.k ?? 1) - 1) / 2) * 13} />
                )}
              </g>
            );
          })}

        {/* bridges: what two or more chats share */}
        {Object.values(c.nodes)
          .filter((p) => p.role === 'bridge')
          .map((p) => {
            const n = byId.get(p.id)!;
            const show = bridges <= SHOW.bridges || p.id === focus || near.has(p.id);
            return (
              <g key={p.id} className={`mc-node mc-bridge k-${n.kind}${state(p.id)}`} transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`} aria-label={`In ${n.chats.length} chats: ${n.label}`} {...common(p.id)}>
                <circle className="mc-halo" r={8.5} />
                {n.kind === 'idea' ? <circle className="mc-dot" r={3.8} /> : <MadeGlyph n={n} />}
                {show && <SideLabel p={p} c={c} text={clip(n.label, 30)} cls="mc-label is-bridge" />}
              </g>
            );
          })}

        {/* the core: memories */}
        {Object.values(c.nodes)
          .filter((p) => p.role === 'memory' || p.role === 'project')
          .map((p) => {
            const n = byId.get(p.id)!;
            const r = 3.6 + Math.min(4, n.chats.length * 0.9);
            // written in the core, or — for what did not fit — on focus only
            const show = !!p.label || p.id === focus || near.has(p.id);
            const fade = n.status && n.status !== 'active' ? ' is-faded' : '';
            return (
              <g key={p.id} className={`mc-node mc-mem c-${p.role === 'project' ? 'project' : codeOf(n)}${fade}${state(p.id)}`} transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`} aria-label={`${p.role === 'project' ? 'Project' : n.type}: ${n.label}`} {...common(p.id)}>
                {p.role === 'project' ? <rect className="mc-dot" x={-r} y={-r} width={r * 2} height={r * 2} rx={1.5} /> : <circle className="mc-dot" r={r} />}
                {show &&
                  (p.label ? (
                    <text className="mc-label is-mem" x={p.label === 'left' ? -9 : 9} y={3.6} textAnchor={p.label === 'left' ? 'end' : 'start'}>
                      {clip(n.label, c.memoryLabel)}
                    </text>
                  ) : (
                    <SideLabel p={p} c={c} text={clip(n.label, MEMORY_LABEL)} cls="mc-label is-mem" />
                  ))}
              </g>
            );
          })}

        {/* the ring: every chat */}
        {c.ring_order.map((id) => {
          const p = c.nodes[id];
          const n = byId.get(id)!;
          const logos = n.surface !== 'core';
          const show = chats <= SHOW.chats || id === focus || near.has(id);
          return (
            <g
              key={id}
              className={`mc-node mc-chat ${logos ? 'is-logos' : 'is-core'}${state(id)}`}
              transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}
              aria-label={`${logos ? 'Line of thinking' : 'Chat'}: ${n.label}`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onOpenChat?.(n.chats[0]);
              }}
              {...common(id)}
            >
              {logos ? <Tile seed={id} count={(c.folded[id]?.length ?? 0) + 1} /> : <circle className="mc-core-chat" r={6} />}
              {show && <RingLabel p={p} c={c} text={n.label} logos={logos} />}
            </g>
          );
        })}
      </svg>
      <figcaption className="mc-legend">
        <span><Tile seed="legend" count={6} static /> a line of thinking, drawn as its map</span>
        <span><svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><circle className="mc-core-chat" r={5} /></svg> a Core chat</span>
        <span className="mc-key-mem">
          <i className="c-person" /> <i className="c-evidence" /> <i className="c-question" /> <i className="c-neutral" /> a memory — yours, evidence, open, an idea
        </span>
        <span><svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><rect className="mc-made" x={-3.6} y={-3.6} width={7.2} height={7.2} transform="rotate(45)" /></svg> a model, plot or object made in a chat</span>
        <span><svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true"><circle className="mc-halo" r={6.5} /><circle className="mc-dot is-key" r={3} /></svg> shared by two chats or more</span>
        {c.dropped > 0 && <span className="mc-dropped">{c.dropped} more connections not drawn, to keep it readable</span>}
      </figcaption>
    </figure>
  );
}

function kindWord(n: AtlasNode) {
  return n.kind === 'model' ? 'Model' : n.kind === 'plot' ? 'Plot' : n.kind === 'object' ? 'Object of thought' : 'Idea';
}

/** Project arcs, just inside the ring, each with its name along it. */
const Arcs = memo(function Arcs({ c }: { c: Constellation }) {
  const at = (a: number, inset: number) => ({ x: c.cx + Math.cos(a) * (c.ring.rx - inset), y: c.cy + Math.sin(a) * (c.ring.ry - inset) });
  const R = (inset: number) => `${(c.ring.rx - inset).toFixed(1)},${(c.ring.ry - inset).toFixed(1)}`;
  return (
    <g className="mc-arcs" aria-hidden="true">
      {c.arcs.map((a) => {
        const p0 = at(a.a0, 15);
        const p1 = at(a.a1, 15);
        const large = a.a1 - a.a0 > Math.PI ? 1 : 0;
        const mid = (a.a0 + a.a1) / 2;
        // the name reads left to right on both halves of the ring
        const bottom = Math.sin(mid) > 0.15;
        const inset = bottom ? 18 : 24;
        const q0 = at(a.a0, inset);
        const q1 = at(a.a1, inset);
        const text = bottom
          ? `M${q1.x},${q1.y} A${R(inset)} 0 ${large} 0 ${q0.x},${q0.y}`
          : `M${q0.x},${q0.y} A${R(inset)} 0 ${large} 1 ${q1.x},${q1.y}`;
        const span = (a.a1 - a.a0) * Math.sqrt(((c.ring.rx - inset) ** 2 + (c.ring.ry - inset) ** 2) / 2);
        const room = Math.max(4, Math.floor(span / 6.4));
        const id = `mc-arc-${hash(a.id).toString(36).slice(2, 9)}`;
        return (
          <g key={a.id} className="mc-arc">
            <path className="mc-arc-line" d={`M${p0.x},${p0.y} A${R(15)} 0 ${large} 1 ${p1.x},${p1.y}`} />
            <path id={id} d={text} fill="none" stroke="none" />
            <text className="mc-arc-label">
              <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                {clip(a.label.toUpperCase(), room)}
              </textPath>
            </text>
          </g>
        );
      })}
    </g>
  );
});

/** Every thread, drawn once. Focus dims this layer as a whole. */
const Threads = memo(function Threads({ c }: { c: Constellation }) {
  return (
    <g className="mc-threads" aria-hidden="true">
      {c.threads.map((t, i) => (
        <path key={i} className={`mc-thread k-${t.kind}`} d={path(t, c.nodes)} />
      ))}
    </g>
  );
});

/** A chat's title, radiating outward from the ring and always upright. */
function RingLabel({ p, c, text, logos }: { p: Placed; c: Constellation; text: string; logos: boolean }) {
  // outward along the ellipse's normal, not its radius
  const n = Math.atan2(c.ring.rx * Math.sin(p.angle), c.ring.ry * Math.cos(p.angle));
  const left = Math.cos(n) < 0;
  const rot = deg(n) + (left ? 180 : 0);
  const off = logos ? 15 : 12;
  // how far it can run before the edge of the picture, along its direction
  const ux = Math.cos(n);
  const uy = Math.sin(n);
  const room = Math.min(
    ux > 1e-6 ? (c.width - p.x) / ux : ux < -1e-6 ? -p.x / ux : Infinity,
    uy > 1e-6 ? (c.height - p.y) / uy : uy < -1e-6 ? -p.y / uy : Infinity
  );
  const fits = Math.max(6, Math.floor((room - off - 6) / 6.6));
  return (
    <text className={`mc-label is-chat${logos ? ' is-logos' : ''}`} transform={`rotate(${rot.toFixed(2)})`} x={left ? -off : off} y={3.6} textAnchor={left ? 'end' : 'start'}>
      {clip(text, Math.min(34, fits))}
    </text>
  );
}

/** A label beside a node, on the side away from the centre (or toward it). */
function SideLabel({ p, c, text, cls, inward = false, dy = 0 }: { p: Placed; c: Constellation; text: string; cls: string; inward?: boolean; dy?: number }) {
  const right = (p.x >= c.cx) !== inward;
  return (
    <text className={cls} x={right ? 10 : -10} y={3.5 + dy} textAnchor={right ? 'start' : 'end'}>
      {text}
    </text>
  );
}

/** A line of thinking: a small square with its map in it (as components/NodeTile draws it). */
function Tile({ seed, count, static: still = false }: { seed: string; count: number; static?: boolean }) {
  const n = Math.max(1, Math.min(9, count));
  const turn = hash(seed) * Math.PI * 2;
  const pts = [{ x: 0, y: 0 }];
  for (let i = 1; i < n; i++) {
    const a = turn + ((i - 1) / Math.max(1, n - 1)) * Math.PI * 2;
    const r = Math.min(6.4, 3.6 + n * 0.3) + (hash(`${seed}:${i}`) - 0.5) * 1.1;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const body = (
    <>
      <rect className="mc-tile" x={-10} y={-10} width={20} height={20} rx={5.5} />
      {pts.slice(1).map((q, i) => (
        <line key={i} className="mc-tile-edge" x1={0} y1={0} x2={q.x} y2={q.y} />
      ))}
      {pts.map((q, i) => (
        <circle key={`d${i}`} className={i ? 'mc-tile-node' : 'mc-tile-hub'} cx={q.x} cy={q.y} r={i ? 1.15 : 1.9} />
      ))}
    </>
  );
  if (!still) return body;
  return (
    <svg width="16" height="16" viewBox="-11 -11 22 22" aria-hidden="true">
      {body}
    </svg>
  );
}

/** What was made in a chat: a model is a diamond, a plot a curve, an object a framed square. */
function MadeGlyph({ n }: { n: AtlasNode }) {
  if (n.kind === 'plot') {
    return (
      <>
        <circle className="mc-made-bg" r={6} />
        <path className="mc-made-line" d="M-4.2,2.6 C-2.2,2.6 -1.6,-3.4 0,-3.4 S2.2,2.6 4.2,2.6" />
      </>
    );
  }
  if (n.kind === 'object') {
    return (
      <>
        <rect className="mc-made" x={-4.4} y={-4.4} width={8.8} height={8.8} rx={1.2} />
        <path className="mc-made-line" d="M-2,-2.6 h-1 v5.2 h1 M2,-2.6 h1 v5.2 h-1" />
      </>
    );
  }
  return <rect className="mc-made" x={-4} y={-4} width={8} height={8} rx={1} transform="rotate(45)" />;
}
