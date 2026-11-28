'use client';
// components/new-logos/primitives/Board.tsx — the RELATIONSHIP GRAPH and the DIAGRAM: things and the connections
// between them, worked on directly. Both are drawn and handled by one board — items (a graph's concepts; a diagram's
// boxes, rounded steps, ellipses, decisions and free labels) and links (a graph's relationships; a diagram's
// connectors) — and differ only in what they keep: a concept is a labelled point that sizes to its words, a shape has
// its own size and kind.
//
// In place: drag an item to move it; double-click the empty board to add one; double-click an item to rename it; drag
// from the small circle on a selected item to another item to connect them; select a connection to label it, give it
// a direction or remove it; Delete removes what is selected inside the board (not the whole primitive). A graph can
// also arrange itself (a simple force layout). Every change is one operation on the primitive.

import { useMemo, useRef, useState } from 'react';
import type { DiagramData, GraphData, PrimitiveOf, ShapeKind } from '@/lib/new-logos/primitives';
import { newItemId } from '@/lib/new-logos/primitives';
import { CommitInput, Hint, useSize, type PrimProps } from './common';

type Kind = 'pill' | ShapeKind;
interface Item {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: Kind;
  label: string;
}
interface Link {
  id: string;
  from: string;
  to: string;
  label: string;
  end: boolean;
  start: boolean;
  dashed: boolean;
}

const pillWidth = (label: string) => Math.max(64, Math.min(240, Math.round(label.length * 7.4 + 30)));

function itemsOf(p: PrimitiveOf<'graph'> | PrimitiveOf<'diagram'>): Item[] {
  if (p.type === 'graph')
    return p.data.nodes.map((n) => {
      const w = pillWidth(n.label);
      return { id: n.id, x: n.x - w / 2, y: n.y - 17, w, h: 34, kind: 'pill' as const, label: n.label };
    });
  return p.data.shapes.map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, kind: s.kind, label: s.label }));
}
function linksOf(p: PrimitiveOf<'graph'> | PrimitiveOf<'diagram'>): Link[] {
  if (p.type === 'graph') return p.data.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label, end: e.directed, start: false, dashed: false }));
  return p.data.connectors.map((c) => ({ id: c.id, from: c.from, to: c.to, label: c.label, end: c.end !== 'none', start: c.end === 'both', dashed: c.style === 'dashed' }));
}

/** Where the line from an item's centre towards (dx, dy) leaves its outline. */
function edgePoint(it: Item, dx: number, dy: number): [number, number] {
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2, hw = it.w / 2, hh = it.h / 2;
  if (!dx && !dy) return [cx, cy];
  let t: number;
  if (it.kind === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (it.kind === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

/** A force layout for a graph: connected concepts pulled together, all pushed apart, the whole kept centred. */
function arrange(data: GraphData, w: number, h: number): GraphData {
  const n = data.nodes.length;
  if (n < 2) return data;
  const pos = data.nodes.map((v, i) => ({ x: Number.isFinite(v.x) ? v.x : (i * 97) % w, y: Number.isFinite(v.y) ? v.y : (i * 61) % h }));
  const index = new Map(data.nodes.map((v, i) => [v.id, i]));
  const k = Math.sqrt((w * h) / n) * 0.75;
  let temp = Math.max(w, h) / 6;
  for (let it = 0; it < 160; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) (dx = 0.1 * (i - j), (dy = 0.1), (d = 0.15));
        const f = (k * k) / d;
        disp[i].x += (dx / d) * f;
        disp[i].y += (dy / d) * f;
        disp[j].x -= (dx / d) * f;
        disp[j].y -= (dy / d) * f;
      }
    for (const e of data.edges) {
      const a = index.get(e.from)!, b = index.get(e.to)!;
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = (d * d) / k;
      disp[a].x -= (dx / d) * f;
      disp[a].y -= (dy / d) * f;
      disp[b].x += (dx / d) * f;
      disp[b].y += (dy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      disp[i].x += (w / 2 - pos[i].x) * 0.02;
      disp[i].y += (h / 2 - pos[i].y) * 0.02;
      const d = Math.max(0.01, Math.hypot(disp[i].x, disp[i].y));
      pos[i].x += (disp[i].x / d) * Math.min(d, temp);
      pos[i].y += (disp[i].y / d) * Math.min(d, temp);
    }
    temp *= 0.97;
  }
  return { ...data, nodes: data.nodes.map((v, i) => ({ ...v, x: Math.round(pos[i].x), y: Math.round(pos[i].y) })) };
}

type Sel = { kind: 'item' | 'link'; id: string } | null;

export function BoardPrim({ p, editable, run }: PrimProps<'graph'> | PrimProps<'diagram'>) {
  const graph = p.type === 'graph';
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useSize(hostRef);
  const [sel, setSel] = useState<Sel>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [grow, setGrow] = useState<{ id: string; w: number; h: number } | null>(null);
  const [linking, setLinking] = useState<{ from: string; x: number; y: number } | null>(null);
  const gesture = useRef<{ kind: 'drag' | 'grow' | 'link'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const frozen = useRef<string | null>(null);

  const items = useMemo(() => itemsOf(p), [p]);
  const links = useMemo(() => linksOf(p), [p]);
  const shown = (it: Item): Item => (drag?.id === it.id ? { ...it, x: drag.x, y: drag.y } : grow?.id === it.id ? { ...it, w: grow.w, h: grow.h } : it);
  const byId = new Map(items.map((it) => [it.id, shown(it)]));

  // the view: everything in sight, never magnified past life size; held still while something is being moved
  const W = Math.max(120, size.w), H = Math.max(80, size.h);
  let viewBox = `0 0 ${W} ${H}`;
  if (items.length) {
    const x0 = Math.min(...items.map((i) => i.x)) - 28, y0 = Math.min(...items.map((i) => i.y)) - 28;
    const x1 = Math.max(...items.map((i) => i.x + i.w)) + 28, y1 = Math.max(...items.map((i) => i.y + i.h)) + 28;
    let vw = Math.max(x1 - x0, W), vh = Math.max(y1 - y0, H);
    if (vw / vh < W / H) vw = (vh * W) / H;
    else vh = (vw * H) / W;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    viewBox = `${Math.round(cx - vw / 2)} ${Math.round(cy - vh / 2)} ${Math.round(vw)} ${Math.round(vh)}`;
  }
  if (gesture.current && frozen.current) viewBox = frozen.current;

  const toBoard = (cx: number, cy: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  };
  const itemAt = (x: number, y: number) => [...items].reverse().map(shown).find((it) => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h);

  // ── writing back ──
  const write = (data: Partial<GraphData> | Partial<DiagramData>) => run([{ op: 'update', id: p.id, data: data as Record<string, unknown> }]);
  const moveItem = (id: string, x: number, y: number) => {
    if (p.type === 'graph') write({ nodes: p.data.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(x + pillWidth(n.label) / 2), y: Math.round(y + 17) } : n)) });
    else write({ shapes: p.data.shapes.map((s) => (s.id === id ? { ...s, x: Math.round(x), y: Math.round(y) } : s)) });
  };
  const growItem = (id: string, w: number, h: number) => p.type === 'diagram' && write({ shapes: p.data.shapes.map((s) => (s.id === id ? { ...s, w: Math.round(w), h: Math.round(h) } : s)) });
  const renameItem = (id: string, label: string) => {
    if (p.type === 'graph') write({ nodes: p.data.nodes.map((n) => (n.id === id ? { ...n, label: label || n.label } : n)) });
    else write({ shapes: p.data.shapes.map((s) => (s.id === id ? { ...s, label } : s)) });
  };
  const removeItem = (id: string) => {
    if (p.type === 'graph') write({ nodes: p.data.nodes.filter((n) => n.id !== id), edges: p.data.edges.filter((e) => e.from !== id && e.to !== id) });
    else write({ shapes: p.data.shapes.filter((s) => s.id !== id), connectors: p.data.connectors.filter((c) => c.from !== id && c.to !== id) });
    setSel(null);
  };
  const addItem = (x: number, y: number) => {
    const id = newItemId(graph ? 'g' : 'h');
    if (p.type === 'graph') write({ nodes: [...p.data.nodes, { id, label: 'Concept', x: Math.round(x), y: Math.round(y) }] });
    else write({ shapes: [...p.data.shapes, { id, kind: 'box', x: Math.round(x - 60), y: Math.round(y - 26), w: 120, h: 52, label: 'Step' }] });
    setSel({ kind: 'item', id });
    setEditing(id);
  };
  const addLink = (from: string, to: string) => {
    if (from === to) return;
    const id = newItemId(graph ? 'e' : 'k');
    if (p.type === 'graph') {
      if (p.data.edges.some((e) => e.from === from && e.to === to)) return;
      write({ edges: [...p.data.edges, { id, from, to, label: '', directed: true }] });
    } else {
      if (p.data.connectors.some((c) => c.from === from && c.to === to)) return;
      write({ connectors: [...p.data.connectors, { id, from, to, label: '', end: 'arrow', style: 'solid' }] });
    }
    setSel({ kind: 'link', id });
  };
  const patchLink = (id: string, patch: Partial<Link> & { endKind?: 'arrow' | 'none' | 'both' }) => {
    if (p.type === 'graph') write({ edges: p.data.edges.map((e) => (e.id === id ? { ...e, ...(patch.label !== undefined ? { label: patch.label } : {}), ...(patch.end !== undefined ? { directed: patch.end } : {}) } : e)) });
    else
      write({
        connectors: p.data.connectors.map((c) =>
          c.id === id ? { ...c, ...(patch.label !== undefined ? { label: patch.label } : {}), ...(patch.endKind ? { end: patch.endKind } : {}), ...(patch.dashed !== undefined ? { style: patch.dashed ? ('dashed' as const) : ('solid' as const) } : {}) } : c
        ),
      });
  };
  const removeLink = (id: string) => {
    if (p.type === 'graph') write({ edges: p.data.edges.filter((e) => e.id !== id) });
    else write({ connectors: p.data.connectors.filter((c) => c.id !== id) });
    setSel(null);
  };
  const setKind = (id: string, kind: ShapeKind) => p.type === 'diagram' && write({ shapes: p.data.shapes.map((s) => (s.id === id ? { ...s, kind } : s)) });

  // ── pointers ──
  const begin = (e: React.PointerEvent, kind: 'drag' | 'grow' | 'link', id: string) => {
    if (!editable) return;
    e.stopPropagation();
    const it = byId.get(id);
    if (!it) return;
    frozen.current = viewBox;
    gesture.current = { kind, id, sx: e.clientX, sy: e.clientY, ox: kind === 'grow' ? it.w : it.x, oy: kind === 'grow' ? it.h : it.y, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (kind === 'link') {
      const at = toBoard(e.clientX, e.clientY);
      setLinking({ from: id, ...at });
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3) return;
    g.moved = true;
    const a = toBoard(g.sx, g.sy), b = toBoard(e.clientX, e.clientY);
    if (g.kind === 'drag') setDrag({ id: g.id, x: g.ox + b.x - a.x, y: g.oy + b.y - a.y });
    else if (g.kind === 'grow') setGrow({ id: g.id, w: Math.max(24, g.ox + b.x - a.x), h: Math.max(20, g.oy + b.y - a.y) });
    else setLinking({ from: g.id, x: b.x, y: b.y });
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    frozen.current = null;
    if (!g) return;
    if (g.kind === 'drag') {
      if (g.moved && drag) moveItem(g.id, drag.x, drag.y);
      setDrag(null);
    } else if (g.kind === 'grow') {
      if (g.moved && grow) growItem(g.id, grow.w, grow.h);
      setGrow(null);
    } else {
      const at = toBoard(e.clientX, e.clientY);
      const target = itemAt(at.x, at.y);
      setLinking(null);
      if (target && target.id !== g.id) addLink(g.id, target.id);
    }
  };

  const markerEnd = `url(#arr-${p.id})`;
  const markerStart = `url(#arr0-${p.id})`;
  const selItem = sel?.kind === 'item' ? byId.get(sel.id) : undefined;
  const selLink = sel?.kind === 'link' ? links.find((l) => l.id === sel.id) : undefined;

  return (
    <div
      ref={hostRef}
      className="nl-prim-board nl-cv-noDrag"
      tabIndex={editable ? 0 : -1}
      onKeyDown={(e) => {
        if (!editable || editing) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
          e.preventDefault();
          e.stopPropagation();
          if (sel.kind === 'item') removeItem(sel.id);
          else removeLink(sel.id);
        } else if (e.key === 'Escape' && sel) {
          e.stopPropagation();
          setSel(null);
        }
      }}
    >
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${graph ? 'Relationship graph' : 'Diagram'}: ${links.map((l) => `${byId.get(l.from)?.label} to ${byId.get(l.to)?.label}`).join('; ') || items.map((i) => i.label).join(', ') || 'empty'}`}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerDown={(e) => {
          if ((e.target as Element) === svgRef.current) setSel(null);
        }}
        onDoubleClick={(e) => {
          if (!editable || (e.target as Element) !== svgRef.current) return;
          const at = toBoard(e.clientX, e.clientY);
          addItem(at.x, at.y);
        }}
      >
        <defs>
          <marker id={`arr-${p.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="nl-board-head" />
          </marker>
          <marker id={`arr0-${p.id}`} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M10 0 L0 5 L10 10 z" className="nl-board-head" />
          </marker>
        </defs>
        {links.map((l) => {
          const a = byId.get(l.from), b = byId.get(l.to);
          if (!a || !b) return null;
          const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
          const [x1, y1] = edgePoint(a, dx, dy);
          const [x2, y2] = edgePoint(b, -dx, -dy);
          const on = sel?.kind === 'link' && sel.id === l.id;
          return (
            <g key={l.id} className={`nl-board-link${on ? ' is-on' : ''}`} onPointerDown={(e) => (e.stopPropagation(), setSel({ kind: 'link', id: l.id }))}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="nl-board-hit" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray={l.dashed ? '6 4' : undefined} markerEnd={l.end ? markerEnd : undefined} markerStart={l.start ? markerStart : undefined} className="nl-board-line" />
              {l.label ? (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle" className="nl-board-linklabel">
                  {l.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {linking ? (() => {
          const a = byId.get(linking.from);
          return a ? <line x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={linking.x} y2={linking.y} className="nl-board-line is-linking" /> : null;
        })() : null}
        {items.map((raw) => {
          const it = shown(raw);
          const on = sel?.kind === 'item' && sel.id === it.id;
          const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
          return (
            <g
              key={it.id}
              className={`nl-board-item is-${it.kind}${on ? ' is-on' : ''}`}
              onPointerDown={(e) => {
                setSel({ kind: 'item', id: it.id });
                begin(e, 'drag', it.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (editable) setEditing(it.id);
              }}
            >
              {it.kind === 'ellipse' ? (
                <ellipse cx={cx} cy={cy} rx={it.w / 2} ry={it.h / 2} />
              ) : it.kind === 'diamond' ? (
                <path d={`M${cx} ${it.y} L${it.x + it.w} ${cy} L${cx} ${it.y + it.h} L${it.x} ${cy} Z`} />
              ) : (
                <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={it.kind === 'pill' ? it.h / 2 : it.kind === 'round' ? 14 : it.kind === 'text' ? 0 : 3} className={it.kind === 'text' ? 'is-bare' : undefined} />
              )}
              {editing === it.id ? (
                <foreignObject x={it.x} y={it.y + it.h / 2 - 15} width={Math.max(it.w, 120)} height={30}>
                  <CommitInput
                    autoFocus
                    className="nl-board-input"
                    aria-label="Label"
                    value={it.label}
                    onCommit={(v) => renameItem(it.id, v)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </foreignObject>
              ) : (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="nl-board-label">
                  {it.label.split('\n').slice(0, 3).map((line, k, all) => (
                    <tspan key={k} x={cx} dy={k === 0 ? `${-(all.length - 1) * 0.6}em` : '1.2em'}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )}
              {on && editable ? (
                <>
                  <circle cx={it.x + it.w + 9} cy={cy} r={6} className="nl-board-connect" onPointerDown={(e) => begin(e, 'link', it.id)}>
                    <title>Drag to another item to connect them</title>
                  </circle>
                  {!graph ? <rect x={it.x + it.w - 5} y={it.y + it.h - 5} width={10} height={10} className="nl-board-grow" onPointerDown={(e) => begin(e, 'grow', it.id)} /> : null}
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
      {editable ? (
        <div className="nl-board-bar">
          {selItem ? (
            <>
              <CommitInput className="nl-in is-small" aria-label="Label" value={selItem.label} onCommit={(v) => renameItem(selItem.id, v)} onKeyDown={(e) => e.stopPropagation()} />
              {!graph ? (
                <select className="nl-select is-small" aria-label="Shape" value={selItem.kind} onChange={(e) => setKind(selItem.id, e.target.value as ShapeKind)}>
                  <option value="box">Box</option>
                  <option value="round">Rounded step</option>
                  <option value="ellipse">Ellipse</option>
                  <option value="diamond">Decision</option>
                  <option value="text">Label only</option>
                </select>
              ) : null}
              <button type="button" className="nl-btn is-small" onClick={() => removeItem(selItem.id)}>
                Remove
              </button>
            </>
          ) : selLink ? (
            <>
              <CommitInput className="nl-in is-small" aria-label="Connection label" placeholder="Label" value={selLink.label} onCommit={(v) => patchLink(selLink.id, { label: v })} onKeyDown={(e) => e.stopPropagation()} />
              {graph ? (
                <button type="button" className="nl-btn is-small" aria-pressed={selLink.end} onClick={() => patchLink(selLink.id, { end: !selLink.end })}>
                  {selLink.end ? 'Directed' : 'Undirected'}
                </button>
              ) : (
                <>
                  <select className="nl-select is-small" aria-label="Arrows" value={selLink.start ? 'both' : selLink.end ? 'arrow' : 'none'} onChange={(e) => patchLink(selLink.id, { endKind: e.target.value as 'arrow' | 'none' | 'both' })}>
                    <option value="arrow">Arrow</option>
                    <option value="both">Both ways</option>
                    <option value="none">No arrow</option>
                  </select>
                  <button type="button" className="nl-btn is-small" aria-pressed={selLink.dashed} onClick={() => patchLink(selLink.id, { dashed: !selLink.dashed })}>
                    {selLink.dashed ? 'Dashed' : 'Solid'}
                  </button>
                </>
              )}
              <button type="button" className="nl-btn is-small" onClick={() => removeLink(selLink.id)}>
                Remove
              </button>
            </>
          ) : (
            <>
              <Hint>Double-click to add. Select one, then drag its circle to another to connect.</Hint>
              {p.type === 'graph' && p.data.nodes.length > 2 ? (
                <button type="button" className="nl-btn is-quiet is-small" onClick={() => write(arrange(p.data, Math.max(320, W), Math.max(220, H)))}>
                  Arrange
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
