'use client';
// components/logos5/Universe.tsx — the Universal Map: every line of thinking
// as a mind graph, on one map (lib/logos5/universe.ts).
//
// Each conversation is its own small graph — the Thinking Map it grew, or the
// topics its files were sorted into — and the ideas more than one shares are
// drawn as bridges between them. Press one to go there. Drag to move about;
// the wheel or the buttons zoom. For a signed-in person, "Everything Socria
// remembers" shows the Mind Atlas — every chat, Core's too — in the same place.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { universeOf, type Cluster, type UniverseIn } from '@/lib/logos5/universe';

/** "7 topics · 6 ideas" */
function countSaid(c: Cluster): string {
  const topics = c.nodes.filter((n) => n.from === 'topic').length;
  const ideas = c.nodes.length - topics + c.more;
  return [topics ? `${topics} ${topics === 1 ? 'topic' : 'topics'}` : '', ideas ? `${ideas} ${ideas === 1 ? 'idea' : 'ideas'}` : ''].filter(Boolean).join(' · ');
}

/** The cards named on a cluster: the most connected few, so the names never crowd. */
function labelled(c: Cluster): Set<string> {
  return new Set(
    [...c.nodes]
      .sort((a, b) => b.degree - a.degree || c.nodes.indexOf(a) - c.nodes.indexOf(b))
      .slice(0, 3)
      .map((n) => n.id)
  );
}

export function UniverseMap({
  sessions,
  activeId,
  onOpen,
  onClose,
  atlas,
}: {
  sessions: readonly UniverseIn[];
  activeId: string | null;
  /** go to a line of thinking — and, when a card was pressed, that card */
  onOpen: (sessionId: string, nodeId?: string) => void;
  onClose: () => void;
  /** the Mind Atlas, for a signed-in person */
  atlas?: ReactNode;
}) {
  const [cols, setCols] = useState(4);
  const [mode, setMode] = useState<'lines' | 'atlas'>('lines');
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setCols(Math.max(1, Math.min(5, Math.floor(el.clientWidth / 300))));
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const u = useMemo(() => universeOf(sessions, cols), [sessions, cols]);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  useEffect(() => setView({ x: 0, y: 0, k: 1 }), [cols]);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const at = (c: Cluster) => ({ x: c.x, y: c.y });
  const byId = useMemo(() => new Map(u.clusters.map((c) => [c.id, c])), [u.clusters]);
  const mapped = u.clusters.filter((c) => c.nodes.length).length;
  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.max(0.4, Math.min(2.4, v.k * f)) }));

  return (
    <div className="l5s-uni" role="dialog" aria-modal="true" aria-label="Universal Map">
      <header className="l5s-uni-head">
        <div>
          <h2>Universal Map</h2>
          <p>
            {mode === 'lines'
              ? `${u.clusters.length} ${u.clusters.length === 1 ? 'line of thinking' : 'lines of thinking'}, each as its mind graph${mapped < u.clusters.length ? ` (${u.clusters.length - mapped} with no map yet)` : ''}${u.bridges.length ? ` · ${u.bridges.length} ${u.bridges.length === 1 ? 'idea' : 'ideas'} shared between them` : ''}`
              : 'Everything Socria remembers, across every chat'}
          </p>
        </div>
        <div className="l5s-uni-tools">
          {atlas && (
            <div className="l5s-seg" role="tablist" aria-label="Show">
              <button type="button" role="tab" aria-selected={mode === 'lines'} className={mode === 'lines' ? 'is-on' : ''} onClick={() => setMode('lines')}>
                Lines of thinking
              </button>
              <button type="button" role="tab" aria-selected={mode === 'atlas'} className={mode === 'atlas' ? 'is-on' : ''} onClick={() => setMode('atlas')}>
                Everything remembered
              </button>
            </div>
          )}
          {mode === 'lines' && (
            <>
              <button type="button" className="l5s-iconbtn" aria-label="Zoom out" onClick={() => zoom(1 / 1.25)}>
                −
              </button>
              <button type="button" className="l5s-iconbtn" aria-label="Zoom in" onClick={() => zoom(1.25)}>
                +
              </button>
            </>
          )}
          <button type="button" className="l5s-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      {mode === 'atlas' && atlas ? (
        <div className="l5s-uni-atlas">{atlas}</div>
      ) : (
        <div
          className="l5s-uni-body"
          ref={wrap}
          onPointerDown={(e) => {
            if ((e.target as Element).closest('[data-open]')) return;
            drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
          }}
          onPointerUp={() => (drag.current = null)}
          onWheel={(e) => {
            if (!e.ctrlKey && Math.abs(e.deltaY) < 4) return;
            zoom(e.deltaY > 0 ? 1 / 1.1 : 1.1);
          }}
        >
          {u.clusters.length === 0 ? (
            <p className="l5s-uni-empty">Nothing here yet. Every line of thinking you start appears here as its own map.</p>
          ) : (
            <svg className="l5s-uni-svg" width={u.width} height={u.height} viewBox={`0 0 ${u.width} ${u.height}`} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
              <g className="l5s-uni-bridges">
                {u.bridges.map((b, i) => {
                  const A = byId.get(b.a.cluster);
                  const B = byId.get(b.b.cluster);
                  const na = A?.nodes.find((n) => n.id === b.a.node);
                  const nb = B?.nodes.find((n) => n.id === b.b.node);
                  if (!A || !B || !na || !nb) return null;
                  const x1 = A.x + na.x;
                  const y1 = A.y + na.y;
                  const x2 = B.x + nb.x;
                  const y2 = B.y + nb.y;
                  const lit = hover === A.id || hover === B.id;
                  return (
                    <path key={i} d={`M${x1},${y1} Q${(x1 + x2) / 2},${Math.min(y1, y2) - 40} ${x2},${y2}`} className={lit ? 'is-lit' : ''}>
                      <title>Both talk about “{b.says}”</title>
                    </path>
                  );
                })}
              </g>
              {u.clusters.map((c) => {
                const p = at(c);
                const on = c.id === activeId;
                return (
                  <g
                    key={c.id}
                    className={`l5s-uni-c${on ? ' is-here' : ''}${!c.nodes.length ? ' is-bare' : ''}`}
                    transform={`translate(${p.x},${p.y})`}
                    onPointerEnter={() => setHover(c.id)}
                    onPointerLeave={() => setHover((h) => (h === c.id ? null : h))}
                  >
                    <circle r={c.r + 26} className="l5s-uni-halo" data-open onClick={() => onOpen(c.id)} role="button" aria-label={`Open “${c.title}”`} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(c.id)} />
                    {c.edges.map((e, i) => {
                      const a = c.nodes.find((n) => n.id === e.from);
                      const b = c.nodes.find((n) => n.id === e.to);
                      return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
                    })}
                    {c.nodes.map((n) => {
                      // a few names, set outward from the middle so they never sit on each other; the rest on hover
                      const named = labelled(c).has(n.id);
                      const r = 4 + Math.min(5, n.degree);
                      const side = Math.abs(n.x) < 12 ? 'middle' : n.x > 0 ? 'start' : 'end';
                      return (
                        <g key={n.id} transform={`translate(${n.x},${n.y})`} className={`l5s-uni-n is-${n.from}`} data-open onClick={() => onOpen(c.id, n.from === 'idea' ? n.id : undefined)}>
                          <circle r={r} />
                          {named && (
                            <text x={side === 'start' ? r + 4 : side === 'end' ? -r - 4 : 0} y={side === 'middle' ? (n.y > 0 || (n.x === 0 && n.y === 0) ? r + 13 : -r - 6) : 4} textAnchor={side}>
                              {n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label}
                            </text>
                          )}
                          <title>{n.label}</title>
                        </g>
                      );
                    })}
                    {!c.nodes.length && <circle r={8} className="l5s-uni-seed" />}
                    <text className="l5s-uni-t" y={c.r + 46} textAnchor="middle">
                      {c.title.length > 34 ? c.title.slice(0, 33) + '…' : c.title}
                    </text>
                    <text className="l5s-uni-s" y={c.r + 62} textAnchor="middle">
                      {c.nodes.length ? countSaid(c) : 'no map yet'}
                      {c.turns ? ` · ${c.turns} ${c.turns === 1 ? 'turn' : 'turns'}` : ''}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
