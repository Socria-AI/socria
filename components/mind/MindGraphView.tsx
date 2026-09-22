'use client';
// components/mind/MindGraphView.tsx
//
// The Mind Graph, drawn and inspectable.
//
// NOT A SEPARATE REPRESENTATION. The nodes and edges here are the rows from
// mind_nodes and mind_edges, unchanged. That equivalence is the point of the
// whole architecture, so this component holds no model of its own beyond x/y
// positions — which belong to the drawing, not to the memory.
//
// SVG rather than canvas, which is a reversal. Canvas was chosen for the
// thousands of nodes this was expected to hold; what it cost was every node
// being a painted circle rather than a thing — no focus, no keyboard, no
// glyph, nothing a screen reader could reach, and a hit test written by hand.
// The graph is grouped into folders by type now, so what is on screen at any
// moment is tens of elements rather than thousands, and SVG is both cheaper
// to reason about and free of all of that.
//
// A LIST VIEW IS NOT A FALLBACK, it is the other half. The canvas answers
// "what is connected to what"; the list answers "what do you actually hold",
// and the second question is the one somebody arrives with when they want to
// correct something. It is a file explorer because that is the mental model
// people already have for "show me everything you have on me, in folders".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Label, Button } from '@/components/journal/ds';
import { NodeGlyph } from '@/components/NodeGlyph';
import type { LogosNodeType } from '@/lib/logos';
import { settle, foldLayout, type Positions } from '@/lib/mind/layout';
import './mind-graph.css';

interface Provenance {
  kind: string;
  surface: string;
  at: number;
  conversationId?: string;
  sourceNodeId?: string;
  charStart?: number;
  charEnd?: number;
  note?: string;
}
export interface Node {
  id: string; type: string; label: string; content: string; aliases: string[];
  status: string; confidence: number; certainty: number; importance: number;
  seen: number; private: boolean; provenance: Provenance[];
  createdAt: number; updatedAt: number; lastAccessed: number;
}
export interface Edge {
  id: string; sourceId: string; targetId: string; relationship: string;
  confidence: number; strength: number; provenance: Provenance[];
  createdAt: number; updatedAt: number; lastReinforced: number;
}
interface Pending { fingerprint?: string; type: string; label: string; content: string; sources: string[]; firstAt: number; lastAt: number }
interface Source { id: string; name: string; bytes: number; createdAt: number }

/** Mirrors MindStoreFailure in lib/mind/store.ts. */
type StorageFault = 'missing-tables' | 'denied' | 'unavailable';

/**
 * Type → glyph, and type → where it sits in the colour code.
 *
 * FOUR COLOURS, NOT NINETEEN. Colour carries what KIND of thing this is —
 * the person and what they hold, evidence from outside, an open question —
 * and the glyph carries the type itself. Nineteen colours is a legend, and a
 * legend is a thing nobody reads.
 *
 * `type` is an open string in the ontology, so anything unlisted falls to a
 * neutral concept rather than to nothing.
 */
const TYPES: Record<string, { glyph: LogosNodeType; code: 'person' | 'neutral' | 'question' | 'evidence' }> = {
  Person: { glyph: 'character', code: 'person' },
  Organization: { glyph: 'theme', code: 'neutral' },
  Project: { glyph: 'milestone', code: 'neutral' },
  Place: { glyph: 'constraint', code: 'neutral' },
  Concept: { glyph: 'concept', code: 'neutral' },
  Goal: { glyph: 'goal', code: 'person' },
  Plan: { glyph: 'step', code: 'person' },
  Decision: { glyph: 'decision', code: 'person' },
  Preference: { glyph: 'value', code: 'person' },
  Belief: { glyph: 'belief', code: 'person' },
  Assumption: { glyph: 'assumption', code: 'person' },
  Question: { glyph: 'question', code: 'question' },
  Uncertainty: { glyph: 'unknown', code: 'question' },
  Insight: { glyph: 'idea', code: 'person' },
  Evidence: { glyph: 'evidence', code: 'evidence' },
  Source: { glyph: 'source', code: 'evidence' },
  Event: { glyph: 'step', code: 'neutral' },
  Experience: { glyph: 'given', code: 'neutral' },
  Conversation: { glyph: 'claim', code: 'neutral' },
};
const UNKNOWN_TYPE = { glyph: 'concept' as LogosNodeType, code: 'neutral' as const };
const typeOf = (t: string) => TYPES[t] ?? UNKNOWN_TYPE;

/** Faded when it is not current. The statuses are visible, never hidden. */
const FADE: Record<string, number> = {
  active: 1, tentative: 0.8, uncertain: 0.8, contradicted: 0.7,
  historical: 0.55, superseded: 0.45, archived: 0.38,
};
const fade = (s: string) => FADE[s] ?? 0.6;

const STATUSES = ['active', 'tentative', 'uncertain', 'historical', 'superseded', 'contradicted', 'archived'];

const when = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** [source, target, relationship] — what the drawing and the layout both want. */
type Tri = [string, string, string];

// ── the canvas ──────────────────────────────────────────────────────

function Graph({
  nodes, edges, sel, onSel,
}: {
  nodes: Node[]; edges: Tri[]; sel: string | null; onSel: (id: string) => void;
}) {
  const [fold, setFold] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const dense = nodes.length > 60;
  const W = 1000;
  const H = open ? 620 : dense ? (fold ? 1000 : 780) : 520;

  /**
   * Inside a folder: everything in it, named, with its own connections — and
   * one marker per NEIGHBOURING folder, so you can see where the rest goes
   * and step across without going back out first.
   */
  const sub = useMemo(() => {
    if (!open) return null;
    const mine = nodes.filter((d) => d.type === open);
    const ids = new Set(mine.map((d) => d.id));
    const tOf = new Map(nodes.map((d) => [d.id, d.type]));
    const inner = edges.filter(([a, b]) => ids.has(a) && ids.has(b));
    const out: Tri[] = [];
    const markers = new Map<string, { id: string; type: string; label: string; n: number }>();
    for (const [a, b, rel] of edges) {
      const here = ids.has(a) ? a : ids.has(b) ? b : null;
      if (!here) continue;
      const other = here === a ? b : a;
      const ot = tOf.get(other);
      if (!ot || ot === open) continue;
      const pid = `FOLDER:${ot}`;
      const m = markers.get(pid) ?? { id: pid, type: ot, label: ot, n: 0 };
      m.n++;
      markers.set(pid, m);
      out.push([here, pid, rel]);
    }
    return { mine, markers: [...markers.values()], edges: [...inner, ...out] };
  }, [open, nodes, edges]);

  const shown = useMemo(
    () => (sub ? sub.mine.map((d) => ({ id: d.id, type: d.type })) : nodes.map((d) => ({ id: d.id, type: d.type }))),
    [sub, nodes]
  );
  const vEdges = sub ? sub.edges : edges;

  const fl = useMemo(
    () => (fold && !open ? foldLayout(nodes.map((d) => ({ id: d.id, type: d.type })), edges, W, H) : null),
    [nodes, edges, fold, open, H]
  );
  const base: Positions = useMemo(() => {
    if (sub) {
      const all = [...shown, ...sub.markers.map((m) => ({ id: m.id, type: m.type }))];
      return settle(all, sub.edges.map(([a, b]) => [a, b] as [string, string]), W, H, 300);
    }
    if (fl) return fl.pos;
    return settle(shown, edges.map(([a, b]) => [a, b] as [string, string]), W, H, nodes.length > 120 ? 200 : 300);
  }, [sub, shown, fl, edges, nodes.length, H]);

  const [pos, setPos] = useState<Positions>(base);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hov, setHov] = useState<string | null>(null);
  const [hovFolder, setHovFolder] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  useEffect(() => { setPos(base); setView({ x: 0, y: 0, k: 1 }); setMoved(false); setHovFolder(null); }, [base]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ id?: string; dx?: number; dy?: number; far?: boolean; pan?: boolean; sx?: number; sy?: number; ox?: number; oy?: number } | null>(null);
  const vb = { x: view.x, y: view.y, w: W / view.k, h: H / view.k };

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: vb.x + ((e.clientX - r.left) / r.width) * vb.w,
      y: vb.y + ((e.clientY - r.top) / r.height) * vb.h,
    };
  };

  const byId = useMemo(() => new Map(nodes.map((d) => [d.id, d])), [nodes]);
  const markerById = useMemo(() => new Map((sub?.markers ?? []).map((m) => [m.id, m])), [sub]);

  const near = useMemo(() => {
    const s = new Set<string>();
    const f = hov || sel;
    if (!f) return s;
    for (const [a, b] of vEdges) { if (a === f) s.add(b); if (b === f) s.add(a); }
    return s;
  }, [sel, hov, vEdges]);

  const focus = hov || sel;
  const big = shown.length > 60;
  const r = big ? 3.4 : 6;
  const hovNode = hov ? byId.get(hov) : null;
  const drawIds = sub ? [...shown, ...sub.markers.map((m) => ({ id: m.id, type: m.type }))] : shown;

  return (
    <div className={`mem-plate${dense ? ' is-dense' : ''}`}>
      <span className="cap">
        {open ? (
          <>
            <button className="crumb" onClick={() => setOpen(null)}>← all folders</button>
            <span className="here">{open.toUpperCase()} · {shown.length} {shown.length === 1 ? 'thing' : 'things'}</span>
          </>
        ) : (
          <>
            The graph · {nodes.length} things
            <button className="fold-t" onClick={() => setFold(!fold)} aria-pressed={fold}>
              {fold ? '▾ folders' : '▸ loose'}
            </button>
          </>
        )}
      </span>
      <span className="settled">
        {moved ? (
          <button className="reset" onClick={() => { setPos(base); setView({ x: 0, y: 0, k: 1 }); setMoved(false); }}>
            reset the view
          </button>
        ) : open ? 'everything in this folder'
          : fold ? 'settled · click a folder to open it'
          : 'settled · drag a node, or the ground'}
      </span>

      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="is-live"
        onPointerDown={(e) => {
          drag.current = { pan: true, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const g = drag.current;
          if (!g || !g.pan) return;
          const rect = svgRef.current!.getBoundingClientRect();
          setView({ ...view, x: g.ox! - ((e.clientX - g.sx!) / rect.width) * vb.w, y: g.oy! - ((e.clientY - g.sy!) / rect.height) * vb.h });
          setMoved(true);
        }}
        onPointerUp={() => { drag.current = null; }}
        onWheel={(e) => {
          const p = toSvg(e);
          const k = Math.max(0.6, Math.min(4, view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
          setView({ k, x: p.x - (p.x - view.x) * (view.k / k), y: p.y - (p.y - view.y) * (view.k / k) });
          setMoved(true);
        }}
        role="img"
        aria-label={`A map of ${shown.length} remembered things and ${vEdges.length} connections. The same rows are in the list view, which is easier to read with a screen reader.`}
      >
        {fold && fl && fl.links.map((l, i) => {
          const lit = hovFolder != null && (l.a === hovFolder || l.b === hovFolder);
          return (
            <g key={`L${i}`} opacity={hovFolder && !lit ? 0.2 : 1}>
              <line className={`gr-link${lit ? ' on' : ''}`} x1={l.ax} y1={l.ay} x2={l.bx} y2={l.by} strokeWidth={Math.min(4, 1 + l.n * 0.7)} />
              <text className="gr-elabel" x={(l.ax + l.bx) / 2} y={(l.ay + l.by) / 2 - 4} textAnchor="middle">
                {l.n === 1 ? l.rel : `${l.n} connections`}
              </text>
            </g>
          );
        })}

        {fold && fl && fl.groups.map((g) => {
          const lit = hovFolder === g.type;
          return (
            <g
              key={`G${g.type}`}
              className={`gr-fold${lit ? ' on' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Open the ${g.type} folder, ${g.items.length} things`}
              onPointerEnter={() => setHovFolder(g.type)}
              onPointerLeave={() => setHovFolder(null)}
              onClick={(e) => { e.stopPropagation(); setOpen(g.type); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(g.type); } }}
            >
              <circle className="hull" cx={g.x} cy={g.y} r={g.r} />
              {g.items.map((d) => {
                const p = base[d.id];
                return p ? <line key={d.id} className="branch" x1={g.x} y1={g.y} x2={p.x} y2={p.y} /> : null;
              })}
              <circle className="hub" cx={g.x} cy={g.y} r={3.2} />
              <text className="fold-l" x={g.x} y={g.y - g.r - 7} textAnchor="middle">
                {g.type.toUpperCase()} · {g.items.length}
              </text>
              {lit && <text className="fold-open" x={g.x} y={g.y + g.r + 14} textAnchor="middle">open it</text>}
            </g>
          );
        })}

        {vEdges.map(([a, b, rel], i) => {
          const pa = pos[a], pb = pos[b];
          if (!pa || !pb) return null;
          const lit = !!focus && (a === focus || b === focus);
          return (
            <g key={i} opacity={focus && !lit ? 0.25 : 1}>
              <line
                className={`gr-edge${lit ? ' on' : ''}`}
                x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                strokeDasharray={rel === 'superseded_by' ? '4 4' : undefined}
              />
              {!big && !fold && (
                <text className="gr-elabel" x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2 - 3} textAnchor="middle">{rel}</text>
              )}
            </g>
          );
        })}

        {drawIds.map((d) => {
          const p = pos[d.id];
          if (!p) return null;
          const marker = markerById.get(d.id);
          const node = byId.get(d.id);
          const code = typeOf(d.type).code;
          let dim = focus && d.id !== focus && !near.has(d.id) ? 0.28 : 1;
          if (hovFolder && !open) dim = d.type === hovFolder ? 1 : 0.22;
          const status = node?.status ?? 'active';
          const show = !big || d.id === hov || d.id === sel;
          const label = node?.label ?? d.type;
          return (
            <g
              key={d.id}
              className={`gr-node${d.id === sel ? ' sel' : ''} grab`}
              transform={`translate(${p.x},${p.y})`}
              opacity={(marker ? 1 : fade(status)) * dim}
              tabIndex={0}
              role="button"
              aria-label={marker ? `Open the ${marker.type} folder` : `${d.type}: ${label}. Status ${status}.`}
              onPointerDown={(e) => {
                e.stopPropagation();
                const q = toSvg(e);
                drag.current = { id: d.id, dx: p.x - q.x, dy: p.y - q.y, far: false };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const g = drag.current;
                if (!g || g.id == null) return;
                const q = toSvg(e);
                const nx = q.x + g.dx!, ny = q.y + g.dy!;
                if (Math.abs(nx - pos[g.id].x) > 2 || Math.abs(ny - pos[g.id].y) > 2) g.far = true;
                setPos({ ...pos, [g.id]: { x: nx, y: ny } });
                if (g.far) setMoved(true);
              }}
              onPointerUp={() => {
                const g = drag.current;
                drag.current = null;
                if (!g || g.far) return;
                if (marker) setOpen(marker.type); else onSel(d.id);
              }}
              onPointerEnter={() => setHov(d.id)}
              onPointerLeave={() => setHov(null)}
              onFocus={() => setHov(d.id)}
              onBlur={() => setHov(null)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (marker) setOpen(marker.type); else onSel(d.id);
                }
              }}
            >
              {marker && <circle className="fold-chip" r={13} />}
              {d.id === sel && !marker && <circle className="ring" r={r + 5} />}
              {d.id === hov && d.id !== sel && !marker && <circle className="ring hov" r={r + 4} />}
              {!marker && (
                <circle
                  className={`dot c-${code}`}
                  r={r}
                  strokeDasharray={status === 'uncertain' || status === 'tentative' ? '2.5 2' : undefined}
                />
              )}
              {marker ? (
                <>
                  <text className="fold-chip-t" y={3.5} textAnchor="middle">{marker.n}</text>
                  <text className="fold-l" y={26} textAnchor="middle">{marker.type.toUpperCase()}</text>
                </>
              ) : (
                show && <text className="lbl" x={r + 6} y={3.5}>{label.length > 30 ? label.slice(0, 29) + '…' : label}</text>
              )}
            </g>
          );
        })}
      </svg>

      {hovNode && (
        <span className="gr-read">
          <b>{hovNode.type}</b> · {hovNode.label}
          {hovNode.status !== 'active' && <em> · {hovNode.status}</em>}
        </span>
      )}
    </div>
  );
}

// ── the list ────────────────────────────────────────────────────────

type SortKey = 'label' | 'status' | 'confidence' | 'seen' | 'updatedAt';
const COLS: { k: SortKey; t: string; cls: string }[] = [
  { k: 'status', t: 'Status', cls: 'c-stat' },
  { k: 'confidence', t: 'Sure', cls: 'c-num' },
  { k: 'seen', t: 'Come up', cls: 'c-num' },
  { k: 'updatedAt', t: 'Changed', cls: 'c-date' },
];

function List({ nodes, sel, onSel }: { nodes: Node[]; sel: string | null; onSel: (id: string) => void }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'updatedAt', dir: -1 });
  const [grouped, setGrouped] = useState(true);
  const [shut, setShut] = useState<Record<string, boolean>>({});

  const cmp = useCallback(
    (a: Node, b: Node) => {
      const va = a[sort.k], vb = b[sort.k];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb)) * sort.dir;
    },
    [sort]
  );
  const hit = (k: SortKey) => setSort((s) => (s.k === k ? { k, dir: (-s.dir) as 1 | -1 } : { k, dir: k === 'label' ? 1 : -1 }));

  const folders = useMemo(() => {
    const m: Record<string, Node[]> = {};
    for (const d of nodes) (m[d.type] = m[d.type] ?? []).push(d);
    return Object.keys(m).sort().map((t) => ({ t, items: [...m[t]].sort(cmp) }));
  }, [nodes, cmp]);
  const flat = useMemo(() => [...nodes].sort(cmp), [nodes, cmp]);

  const row = (d: Node, inFolder: boolean) => (
    <button
      key={d.id}
      className={`ex-row${fade(d.status) < 0.6 ? ' faded' : ''}${inFolder ? ' nested' : ''}`}
      aria-current={d.id === sel}
      onClick={() => onSel(d.id)}
    >
      <span className="c-name">
        <span className="g"><NodeGlyph type={typeOf(d.type).glyph} /></span>
        <span className="lb">{d.label}</span>
        {d.private && <span className="priv">private</span>}
      </span>
      <span className="c-stat">
        {d.status === 'active'
          ? <span className="st-ok">active</span>
          : <span className={`st-badge st-${d.status}`}>{d.status}</span>}
      </span>
      <span className="c-num">{Math.round(d.confidence * 100)}%</span>
      <span className="c-num">{d.seen}×</span>
      <span className="c-date">{when(d.updatedAt)}</span>
    </button>
  );

  return (
    <div className="explorer">
      <div className="ex-head">
        <span className="c-name">
          <button
            className="gb"
            onClick={() => setGrouped(!grouped)}
            aria-pressed={grouped}
            title={grouped ? 'Show every row in one list' : 'Group into folders by type'}
          >
            {grouped ? '▾ folders' : '▸ all rows'}
          </button>
          <button className={`sh${sort.k === 'label' ? ' on' : ''}`} onClick={() => hit('label')}>
            Name{sort.k === 'label' && <i>{sort.dir > 0 ? '↑' : '↓'}</i>}
          </button>
        </span>
        {COLS.map((c) => (
          <button key={c.k} className={`${c.cls} sh${sort.k === c.k ? ' on' : ''}`} onClick={() => hit(c.k)}>
            {c.t}{sort.k === c.k && <i>{sort.dir > 0 ? '↑' : '↓'}</i>}
          </button>
        ))}
      </div>

      {grouped
        ? folders.map((f) => {
            const openF = !shut[f.t];
            return (
              <div className="ex-folder" key={f.t}>
                <button className="ex-dir" aria-expanded={openF} onClick={() => setShut({ ...shut, [f.t]: openF })}>
                  <span className="c-name">
                    <span className="tw" aria-hidden="true">{openF ? '▾' : '▸'}</span>
                    <span className="g"><NodeGlyph type={typeOf(f.t).glyph} /></span>
                    <span className="dn">{f.t}</span>
                    <span className="ct">{f.items.length}</span>
                  </span>
                </button>
                {openF && f.items.map((d) => row(d, true))}
              </div>
            );
          })
        : flat.map((d) => row(d, false))}
    </div>
  );
}

// ── the panel ───────────────────────────────────────────────────────

function Sure({ sm, sy }: { sm: number; sy: number }) {
  return (
    <div className="pg">
      <span className="l">How sure</span>
      <div className="sure">
        <div className="one machine">
          <span className="k">How sure Socria is</span>
          <span className="v">{Math.round(sm * 100)}%</span>
          <span className="meter"><i style={{ width: `${sm * 100}%` }} /></span>
        </div>
        <div className="one you">
          <span className="k">How sure you seemed</span>
          <span className="v">{Math.round(sy * 100)}%</span>
          <span className="meter"><i style={{ width: `${sy * 100}%` }} /></span>
        </div>
      </div>
      <p className="sure-note">
        Two different things. Socria can be confident it heard you correctly and still record that you were hedging.
      </p>
    </div>
  );
}

function Panel({
  node, nodes, edges, busy, onClose, onSel, onSave, onForget, onForgetEdge,
}: {
  node: Node;
  nodes: Node[];
  edges: Edge[];
  busy: boolean;
  onClose: () => void;
  onSel: (id: string) => void;
  onSave: (patch: Record<string, unknown>) => void;
  onForget: () => void;
  onForgetEdge: (id: string) => void;
}) {
  const [content, setContent] = useState(node.content);
  const [challenge, setChallenge] = useState('');
  const [step, setStep] = useState(0);
  useEffect(() => { setContent(node.content); setChallenge(''); setStep(0); }, [node.id, node.content]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const conns = useMemo(
    () => edges
      .filter((e) => e.sourceId === node.id || e.targetId === node.id)
      .map((e) => ({ edge: e, other: byId.get(e.sourceId === node.id ? e.targetId : e.sourceId) }))
      .filter((c): c is { edge: Edge; other: Node } => !!c.other),
    [edges, node.id, byId]
  );

  return (
    <aside className="panel" role="dialog" aria-label={`Details: ${node.label}`}>
      <div className="ph">
        <div>
          <span className="ty">{node.type}{node.private && ' · private'}</span>
          <h2>{node.label}</h2>
        </div>
        <button className="x" onClick={onClose} aria-label="Close details">×</button>
      </div>

      <div className="pscroll">
        <div className="pg">
          <span className="l">What Socria has written down</span>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} aria-label="What Socria has written down" />
          <div className="saverow">
            <Button variant="primary" size="sm" disabled={busy || content === node.content} onClick={() => onSave({ content })}>
              Save
            </Button>
          </div>
        </div>

        <div className="pg">
          <span className="l">Status</span>
          <div className="st-pick">
            {STATUSES.map((s) => (
              <button key={s} aria-pressed={node.status === s} disabled={busy} onClick={() => onSave({ status: s })}>{s}</button>
            ))}
          </div>
        </div>

        <Sure sm={node.confidence} sy={node.certainty} />

        <div className="pg">
          <span className="l">History</span>
          <div className="facts">
            <div><span className="k">Come up</span><span className="v">{node.seen} {node.seen === 1 ? 'time' : 'times'}</span></div>
            <div><span className="k">First known</span><span className="v">{when(node.createdAt)}</span></div>
            <div><span className="k">Last changed</span><span className="v">{when(node.updatedAt)}</span></div>
          </div>
        </div>

        <div className="pg">
          <span className="l">How it connects</span>
          <div className="conns">
            {conns.length === 0 && <p className="sure-note" style={{ margin: 0 }}>Nothing connects to this yet.</p>}
            {conns.map(({ edge, other }) => (
              <div className="conn" key={edge.id}>
                <span className="rel">{edge.relationship}</span>
                <button className="to" onClick={() => onSel(other.id)}>{other.label}</button>
                <button
                  className="rm"
                  disabled={busy}
                  onClick={() => onForgetEdge(edge.id)}
                  aria-label={`Remove the ${edge.relationship} connection`}
                >×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="pg">
          <span className="l">Where it came from</span>
          <div className="grounds">
            {node.provenance.map((p, i) => (
              <div className="ground" key={i}>
                <span className="kind">{p.kind}</span>
                <span className="where">
                  {p.surface}{p.note ? ` · ${p.note}` : ''}
                  <span className="when">{when(p.at)}</span>
                </span>
              </div>
            ))}
            {!node.provenance.length && <p className="sure-note" style={{ margin: 0 }}>No grounds recorded.</p>}
          </div>
        </div>

        <div className="pg chal">
          <span className="l">What&rsquo;s wrong with this?</span>
          <input
            value={challenge}
            onChange={(e) => setChallenge(e.target.value)}
            placeholder="say what is wrong with it"
            aria-label="What is wrong with this"
          />
          <div className="row2">
            <Button
              variant="line"
              size="sm"
              disabled={busy || !challenge.trim()}
              onClick={() => onSave({ challenge: challenge.trim() })}
            >
              Mark it
            </Button>
          </div>
          {/* The design offered an Undo here. The API has no undo for this —
              challenging appends to the node's grounds, and erasing that would
              lose the record of Socria having been wrong, which is the thing
              worth keeping. Saying so is better than a button that lies. */}
          <p className="note">
            This does not delete anything. It marks the claim as disputed and records what you said; you can set the
            status back yourself above.
          </p>
        </div>

        <div className="forget">
          {step === 0 ? (
            <button className="start" disabled={busy} onClick={() => setStep(1)}>Forget this permanently</button>
          ) : (
            <div className="confirm">
              <h4>Forget &ldquo;{node.label.length > 42 ? node.label.slice(0, 41) + '…' : node.label}&rdquo;?</h4>
              <p>
                This deletes the row, its {conns.length} connection{conns.length === 1 ? '' : 's'} and its history. It does
                not come back, and Socria will not re-learn it from past conversations.
              </p>
              <div className="acts2">
                <button className="go" disabled={busy} onClick={onForget}>Forget permanently</button>
                <button className="no" onClick={() => setStep(0)}>Keep it</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ── the page ────────────────────────────────────────────────────────

export function MindGraphView() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [forgotten, setForgotten] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageFault | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'graph' | 'list'>('list');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mind', { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const j = await res.json();
      setStorage(j.storage?.ok === false ? (j.storage.reason as StorageFault) : null);
      setNodes(j.nodes ?? []);
      setEdges(j.edges ?? []);
      setPending(j.pending ?? []);
      setSources(j.sources ?? []);
      setForgotten(j.forgotten ?? 0);
      setErr(null);
    } catch {
      setErr('Could not read your memory just now.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function mutate(body: Record<string, unknown>, method: 'PATCH' | 'DELETE') {
    setBusy(true); setNote(null);
    try {
      const res = await fetch('/api/mind/node', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('failed');
      await load();
      if (method === 'DELETE') setSelected(null);
      setNote(method === 'DELETE' ? 'Forgotten. It will not come back.' : 'Saved.');
    } catch {
      setNote('That did not save.');
    }
    setBusy(false);
  }

  async function removeSource(id: string) {
    setBusy(true); setNote(null);
    try {
      const res = await fetch('/api/mind/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'failed');
      await load();
      setNote(j?.note ?? 'File removed.');
    } catch {
      setNote('That file could not be removed.');
    }
    setBusy(false);
  }

  async function upload(file: File) {
    setBusy(true); setNote(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/mind/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, text }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'failed');
      await load();
      setNote(`Read ${j.chunks} passages: ${j.created} new, ${j.reinforced} already known${j.conflicts ? `, ${j.conflicts} in conflict` : ''}.`);
    } catch (e) {
      setNote(e instanceof Error && e.message !== 'failed' ? e.message : 'That file could not be read.');
    }
    setBusy(false);
  }

  const node = useMemo(() => nodes.find((n) => n.id === selected) ?? null, [nodes, selected]);
  const tri = useMemo<Tri[]>(() => edges.map((e) => [e.sourceId, e.targetId, e.relationship]), [edges]);

  const head = (title: string) => (
    <div className="mem-head">
      <div className="mem-top">
        <div>
          <Label tone="moss">Your account · memory</Label>
          <h1>{title}</h1>
        </div>
        <a className="back" href="/account">← Back to your account</a>
      </div>
    </div>
  );

  const uploadControl = (
    <label className="up-btn">
      Add a .txt file
      <input
        type="file"
        accept=".txt,text/plain"
        style={{ display: 'none' }}
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
    </label>
  );

  if (loading) {
    return (
      <div className="mem-root">
        {head('What Socria remembers.')}
        <div className="empty" aria-live="polite">
          <p style={{ marginTop: 0 }}>Reading what it has written down…</p>
          <div className="load-rows" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="mem-root">
        {head('Memory could not be read.')}
        <div className="empty fault"><p role="alert">{err}</p></div>
      </div>
    );
  }

  // NOT "nothing yet". Nothing yet is a fact about the person; this is a fact
  // about the deployment, and showing the first when the second is true tells
  // somebody they have no memories when the truth is that nothing was ever
  // able to store one.
  if (storage) {
    return (
      <div className="mem-root">
        {head('Memory is not running here.')}
        <div className="empty fault">
          <p>
            This is a fault, not an empty page.{' '}
            {storage === 'missing-tables'
              ? 'Memory has not been set up on this deployment — the tables it lives in do not exist.'
              : storage === 'denied'
                ? 'The database refused the read, which usually means the server is holding the wrong key.'
                : 'The database could not be reached just now.'}{' '}
            Nothing is being stored and nothing can be shown — <em>including anything you may have said assuming it was.</em>
          </p>
          <p>Nothing you have written is lost. Your conversations are unaffected.</p>
          <span className="code">
            {storage === 'missing-tables' ? 'MEMORY_BACKEND_UNCONFIGURED' : storage === 'denied' ? 'MEMORY_BACKEND_DENIED' : 'MEMORY_BACKEND_UNREACHABLE'}
          </span>
          <div className="acts3">
            <Button as="a" href="/account" variant="line" size="sm">Back to the app</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!nodes.length && !pending.length && !sources.length) {
    return (
      <div className="mem-root">
        {head('Nothing yet.')}
        <div className="empty">
          <p>
            Talk to Core 4 and what it understands will appear here — every claim, where it came from, and how sure it
            is. <em>Nothing is stored before then.</em>
          </p>
          <p>If it is not on this page, Socria does not know it.</p>
          <div className="acts3">
            <Button as="a" href="/chat" variant="primary" size="sm" arrow>Start a session</Button>
            {uploadControl}
          </div>
        </div>
        {note && <p className="mem-note" role="status">{note}</p>}
      </div>
    );
  }

  return (
    <div className="mem-root">
      <div className="mem-head">
        <div className="mem-top">
          <div>
            <Label tone="moss">Your account · memory</Label>
            <h1>What Socria remembers.</h1>
          </div>
          <a className="back" href="/account">← Back to your account</a>
        </div>
        <p className="deck">
          Everything on this page is a row Socria can actually reach in a conversation. If it is wrong,{' '}
          <em>change it</em> — correcting is the point of the page, not an advanced setting.
        </p>
        <div className="mem-bar">
          <span className="mem-counts">
            <b>{nodes.length}</b> {nodes.length === 1 ? 'thing' : 'things'}<span className="sep">·</span>
            <b>{edges.length}</b> {edges.length === 1 ? 'connection' : 'connections'}
            {forgotten > 0 && <><span className="sep">·</span><b>{forgotten}</b> forgotten</>}
          </span>
          <span className="seg" role="group" aria-label="View">
            <button aria-pressed={view === 'graph'} onClick={() => setView('graph')}>Graph</button>
            <button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          </span>
          {uploadControl}
        </div>
      </div>

      {note && <p className="mem-note" role="status">{note}</p>}

      <div className={`mem-body${node ? ' has-panel' : ''}`}>
        <main className="mem-main">
          {!nodes.length ? (
            <p className="deck">Nothing has been believed yet — only the claims below, noticed once.</p>
          ) : view === 'graph' ? (
            <Graph nodes={nodes} edges={tri} sel={selected} onSel={setSelected} />
          ) : (
            <List nodes={nodes} sel={selected} onSel={setSelected} />
          )}

          {pending.length > 0 && (
            <section className="noticed">
              <Label>Noticed once, not believed</Label>
              <h2>Read between the lines, once.</h2>
              <p className="deck">
                These are not memory. They are not in the graph, and Socria will not use them in a conversation. Each one
                becomes a row only if <em>a different conversation</em> suggests the same thing.
              </p>
              <div className="nlist">
                {pending.map((p) => (
                  <div className="nrow" key={p.fingerprint ?? p.label}>
                    <p>{p.content}</p>
                    <span className="src">{p.type} · {when(p.lastAt)}</span>
                    <button
                      className="no"
                      disabled={busy || !p.fingerprint}
                      onClick={() => p.fingerprint && void mutate({ id: p.fingerprint, kind: 'pending' }, 'DELETE')}
                      aria-label={`Dismiss: ${p.label}`}
                    >
                      No
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sources.length > 0 && (
            <section className="files">
              <Label>Files you added</Label>
              <h2>Read as context, not as authority.</h2>
              {sources.map((s) => (
                <div className="frow" key={s.id}>
                  <span className="fn">{s.name}</span>
                  <span className="fm">{Math.round(s.bytes / 1024)} KB · added {when(s.createdAt)}</span>
                  <button className="rm" disabled={busy} onClick={() => void removeSource(s.id)}>Remove</button>
                </div>
              ))}
            </section>
          )}
        </main>

        {node && (
          <Panel
            node={node}
            nodes={nodes}
            edges={edges}
            busy={busy}
            onClose={() => setSelected(null)}
            onSel={setSelected}
            onSave={(patch) => void mutate({ id: node.id, ...patch }, 'PATCH')}
            onForget={() => void mutate({ id: node.id }, 'DELETE')}
            onForgetEdge={(id) => void mutate({ id, kind: 'edge' }, 'DELETE')}
          />
        )}
      </div>
    </div>
  );
}
