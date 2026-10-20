'use client';
// components/logos5/Universe.tsx — the Universal Map, Logos 5's home.
//
// Every conversation merged into one mind map (lib/logos5/universe.ts): each
// line of thinking drawn as its own small graph, each Core chat as a point,
// the ideas they share drawn as bridges. Press one to open it, or a card on
// it to open it there. Drag to move about; the wheel, a pinch or the buttons
// zoom; "Fit" brings everything back into view. Search dims what does not
// match. For a signed-in person, "Everything remembered" shows the Mind
// Atlas in the same place.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clusterMatches, universeOf, type Cluster, type UniverseIn } from '@/lib/logos5/universe';
import { relTime } from '@/lib/logos-sessions';

/** "7 topics · 6 ideas" */
function countSaid(c: Cluster): string {
  if (c.kind === 'core') return 'Core chat';
  const topics = c.nodes.filter((n) => n.from === 'topic').length;
  const ideas = c.nodes.length - topics + c.more;
  const said = [topics ? `${topics} ${topics === 1 ? 'topic' : 'topics'}` : '', ideas ? `${ideas} ${ideas === 1 ? 'idea' : 'ideas'}` : ''].filter(Boolean).join(' · ');
  return said || 'no map yet';
}

/** The cards named on a cluster: the most connected few, so the names never crowd. */
function labelled(c: Cluster): Set<string> {
  return new Set(
    [...c.nodes]
      .sort((a, b) => b.degree - a.degree || c.nodes.indexOf(a) - c.nodes.indexOf(b))
      .slice(0, c.r > 70 ? 3 : 2)
      .map((n) => n.id)
  );
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

interface View {
  x: number;
  y: number;
  k: number;
}

export function UniverseView({
  conversations,
  activeId,
  onOpen,
  onOpenChat,
  onNew,
  atlas,
  projects,
  notice,
}: {
  conversations: readonly UniverseIn[];
  activeId: string | null;
  /** open a line of thinking — and, when a card on it was pressed, that card */
  onOpen: (id: string, nodeId?: string) => void;
  /** open a Core chat */
  onOpenChat?: (id: string) => void;
  /** begin a new line of thinking */
  onNew: () => void;
  /** the Mind Atlas, for a signed-in person */
  atlas?: ReactNode;
  projects?: { id: string; name: string }[];
  /** above the map: picking up where they left off */
  notice?: ReactNode;
}) {
  const u = useMemo(() => universeOf(conversations), [conversations]);
  const [mode, setMode] = useState<'map' | 'atlas'>('map');
  const [query, setQuery] = useState('');
  const [project, setProject] = useState<string>('');
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [mode]);

  /** Everything in view: the scale that fits it, centred. */
  const fit = useCallback((): View | null => {
    if (!size.w || !size.h || !u.width) return null;
    const k = Math.max(0.25, Math.min(1.15, Math.min(size.w / u.width, size.h / u.height) * 0.94));
    return { k, x: (size.w - u.width * k) / 2, y: (size.h - u.height * k) / 2 };
  }, [size.w, size.h, u.width, u.height]);
  useEffect(() => {
    if (fitted.current && view) return;
    const f = fit();
    if (f) {
      setView(f);
      fitted.current = true;
    }
  }, [fit, view]);
  // a new set of conversations (one opened, one added) is fitted again
  useEffect(() => {
    fitted.current = false;
    setView(null);
  }, [u.width, u.height]);

  const zoomAt = (f: number, px = size.w / 2, py = size.h / 2) =>
    setView((v) => {
      if (!v) return v;
      const k = Math.max(0.2, Math.min(3, v.k * f));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });

  // dragging moves the map; two fingers pinch it
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; pinch?: number } | null>(null);

  const shown = (c: Cluster) => clusterMatches(c, query) && (!project || c.projectId === project);
  const found = u.clusters.filter(shown);
  const byId = useMemo(() => new Map(u.clusters.map((c) => [c.id, c])), [u.clusters]);
  const lines = u.clusters.filter((c) => c.kind === 'logos').length;
  const chats = u.clusters.length - lines;
  const open = (c: Cluster, node?: string) => (c.kind === 'core' ? onOpenChat?.(c.id) : onOpen(c.id, node));

  return (
    <section className="l5u" aria-label="Universal Map">
      <div className="l5u-bar">
        <div className="l5u-title">
          <h2>Your Universal Map</h2>
          <p>
            {mode === 'atlas'
              ? 'Everything Socria remembers, across every chat'
              : u.clusters.length
                ? [`${lines} ${lines === 1 ? 'line of thinking' : 'lines of thinking'}`, chats ? `${chats} ${chats === 1 ? 'chat' : 'chats'}` : '', u.bridges.length ? `${u.bridges.length} shared ${u.bridges.length === 1 ? 'idea' : 'ideas'}` : ''].filter(Boolean).join(' · ')
                : 'Everything you think through here becomes part of one map'}
          </p>
        </div>
        <div className="l5u-tools">
          {mode === 'map' && u.clusters.length > 0 && (
            <label className="l5u-search">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
              <input
                type="search"
                value={query}
                placeholder="Find an idea or a chat"
                aria-label="Find an idea or a chat"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim() && found[0]) open(found[0]);
                }}
              />
              {query.trim() && <span className="l5u-found">{found.length}</span>}
            </label>
          )}
          {mode === 'map' && projects && projects.length > 0 && (
            <select className="l5u-select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {atlas && (
            <div className="l5u-seg" role="tablist" aria-label="Show">
              <button type="button" role="tab" aria-selected={mode === 'map'} className={mode === 'map' ? 'is-on' : ''} onClick={() => setMode('map')}>
                Map
              </button>
              <button type="button" role="tab" aria-selected={mode === 'atlas'} className={mode === 'atlas' ? 'is-on' : ''} onClick={() => setMode('atlas')}>
                Everything remembered
              </button>
            </div>
          )}
        </div>
      </div>
      {notice}
      {mode === 'atlas' && atlas ? (
        <div className="l5u-atlas">{atlas}</div>
      ) : u.clusters.length === 0 ? (
        <div className="l5u-empty">
          <p>Every line of thinking you start appears here as its own mind graph, and what they share joins them into one map.</p>
          <button type="button" className="l5s-go" onClick={onNew}>
            What are you working on? <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <div
          className="l5u-canvas"
          ref={box}
          onPointerDown={(e) => {
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if ((e.target as Element).closest('[data-open]') && pointers.current.size === 1) return;
            const pts = [...pointers.current.values()];
            drag.current = { x: e.clientX, y: e.clientY, vx: view?.x ?? 0, vy: view?.y ?? 0, ...(pts.length === 2 ? { pinch: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) } : {}) };
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!pointers.current.has(e.pointerId)) return;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const d = drag.current;
            if (!d) return;
            const pts = [...pointers.current.values()];
            if (pts.length === 2 && d.pinch) {
              const now = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
              const r = box.current?.getBoundingClientRect();
              zoomAt(now / d.pinch, (pts[0].x + pts[1].x) / 2 - (r?.left ?? 0), (pts[0].y + pts[1].y) / 2 - (r?.top ?? 0));
              d.pinch = now;
              return;
            }
            setView((v) => (v ? { ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y } : v));
          }}
          onPointerUp={(e) => {
            pointers.current.delete(e.pointerId);
            if (!pointers.current.size) drag.current = null;
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            drag.current = null;
          }}
          onWheel={(e) => {
            const r = box.current?.getBoundingClientRect();
            zoomAt(e.deltaY > 0 ? 1 / 1.12 : 1.12, e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
          }}
        >
          {view && (
            <svg className="l5u-svg" width="100%" height="100%" role="list" aria-label="Your conversations">
              <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                <g className="l5u-bridges">
                  {u.bridges.map((b, i) => {
                    const A = byId.get(b.a.cluster);
                    const B = byId.get(b.b.cluster);
                    if (!A || !B) return null;
                    const na = b.a.node ? A.nodes.find((n) => n.id === b.a.node) : null;
                    const nb = b.b.node ? B.nodes.find((n) => n.id === b.b.node) : null;
                    const x1 = A.x + (na?.x ?? 0);
                    const y1 = A.y + (na?.y ?? 0);
                    const x2 = B.x + (nb?.x ?? 0);
                    const y2 = B.y + (nb?.y ?? 0);
                    const lit = hover === A.id || hover === B.id;
                    const dim = !shown(A) || !shown(B);
                    return (
                      <path key={i} d={`M${x1},${y1} Q${(x1 + x2) / 2},${(y1 + y2) / 2 - Math.min(80, Math.abs(x2 - x1) * 0.18)} ${x2},${y2}`} className={`${lit ? 'is-lit' : ''}${dim ? ' is-dim' : ''}`}>
                        <title>Both talk about “{b.says}”</title>
                      </path>
                    );
                  })}
                </g>
                {u.clusters.map((c) => {
                  const on = c.id === activeId;
                  const dim = !shown(c);
                  const names = labelled(c);
                  return (
                    <g
                      key={c.id}
                      role="listitem"
                      className={`l5u-c is-${c.kind}${on ? ' is-here' : ''}${!c.nodes.length ? ' is-bare' : ''}${dim ? ' is-dim' : ''}`}
                      transform={`translate(${c.x},${c.y})`}
                      onPointerEnter={() => setHover(c.id)}
                      onPointerLeave={() => setHover((h) => (h === c.id ? null : h))}
                    >
                      <circle
                        r={c.r + (c.nodes.length ? 16 : 10)}
                        className="l5u-halo"
                        data-open
                        role="button"
                        tabIndex={dim ? -1 : 0}
                        aria-label={`Open “${c.title}” — ${countSaid(c)}`}
                        onClick={() => open(c)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(c))}
                      >
                        <title>{`${c.title} — ${countSaid(c)}${c.at ? `, ${relTime(c.at)}` : ''}`}</title>
                      </circle>
                      {c.edges.map((e, i) => {
                        const a = c.nodes.find((n) => n.id === e.from);
                        const b = c.nodes.find((n) => n.id === e.to);
                        return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
                      })}
                      {c.nodes.map((n) => {
                        // a few names, set outward from the middle so they never sit on each other; the rest on hover
                        const r = 3.5 + Math.min(4.5, n.degree);
                        const side = Math.abs(n.x) < 12 ? 'middle' : n.x > 0 ? 'start' : 'end';
                        return (
                          <g key={n.id} transform={`translate(${n.x},${n.y})`} className={`l5u-n is-${n.from}`} data-open onClick={() => open(c, n.from === 'idea' ? n.id : undefined)}>
                            <circle r={r} />
                            {names.has(n.id) && (
                              <text x={side === 'start' ? r + 4 : side === 'end' ? -r - 4 : 0} y={side === 'middle' ? (n.y > 0 || (n.x === 0 && n.y === 0) ? r + 12 : -r - 5) : 3.5} textAnchor={side}>
                                {clip(n.label, 20)}
                              </text>
                            )}
                            <title>{n.label}</title>
                          </g>
                        );
                      })}
                      {!c.nodes.length && <circle r={c.kind === 'core' ? 5 : 7} className="l5u-seed" />}
                      <text className="l5u-t" y={c.r + (c.nodes.length ? 32 : 24)} textAnchor="middle">
                        {clip(c.title, c.kind === 'core' ? 26 : 32)}
                      </text>
                      <text className="l5u-s" y={c.r + (c.nodes.length ? 47 : 38)} textAnchor="middle">
                        {countSaid(c)}
                        {c.at ? ` · ${relTime(c.at)}` : ''}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          <div className="l5u-zoom">
            <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.25)}>
              −
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.25)}>
              +
            </button>
            <button type="button" className="is-fit" onClick={() => setView(fit())}>
              Fit
            </button>
          </div>
          <p className="l5u-hint" aria-hidden="true">
            Press a map to open it · drag to move
          </p>
        </div>
      )}
    </section>
  );
}
