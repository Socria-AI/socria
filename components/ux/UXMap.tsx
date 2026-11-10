'use client';

// components/ux/UXMap.tsx — the reasoning behind the design, drawn.
//
// User needs, evidence, assumptions, decisions, hypotheses, open questions and
// risks, and the relations between them: supports, contradicts, informs,
// tests, depends. A node can name the element it is about, and the map and the
// canvas follow each other — choose the node, see the element; choose the
// element, see what rests on it.
//
// Logos's map semantics carry over: an assumption is dashed (nobody has tested
// it), evidence is Prussian (sourced, checkable), a contradiction is rust. The
// health line at the top says what the designer most often cannot see in their
// own reasoning: decisions resting on nothing but belief.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { boundsOf, cameraTransform, clampZoom, fitCamera, isDrag, readWheel, routeBetween, toWorld, zoomAt, type Camera } from '@/lib/canvas';
import {
  EDGE_KINDS,
  NODE_KINDS,
  NODE_META,
  NODE_STATUSES,
  makeNode,
  ungroundedDecisions,
  uid,
  type EdgeKind,
  type NodeKind,
  type ReasonNode,
  type UXProject,
} from '@/lib/ux/model';
import type { Dispatch } from './useProject';
import type { Selection } from './UXCanvas';

const NODE_W = 232;
const nodeH = (n: ReasonNode) => 54 + Math.ceil(Math.max(1, n.label.length) / 27) * 19 + (n.elementId ? 26 : 0);

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera; moved: boolean; pointer: string }
  | { kind: 'node'; sx: number; sy: number; node: ReasonNode; moved: boolean; pointer: string }
  | { kind: 'link'; from: ReasonNode; x: number; y: number; pointer: string; moved: boolean; sx: number; sy: number };

interface Props {
  project: UXProject;
  dispatch: Dispatch;
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  selection: Selection;
  onShowElement: (s: Selection) => void;
  onAsk: (prompt: string, focus: { nodeId: string }) => void;
}

export function UXMap({ project, dispatch, selectedNode, onSelectNode, selection, onShowElement, onAsk }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Camera>({ x: 60, y: 90, k: 0.9 });
  const camNow = useRef(cam);
  camNow.current = cam;
  const drag = useRef<Drag | null>(null);
  const [link, setLink] = useState<{ from: ReasonNode; x: number; y: number } | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'element'>('all');
  const fitted = useRef(false);

  const fit = useCallback(() => {
    const el = wrap.current;
    const b = boundsOf(project.nodes.map((n) => ({ x: n.x, y: n.y, w: NODE_W, h: nodeH(n) })));
    if (!el || !b) return;
    setCam(fitCamera(b, el.clientWidth, el.clientHeight, { pad: 80, maxK: 1, minK: 0.6, insets: { top: 56, left: 0, right: 0, bottom: 0 } }));
  }, [project.nodes]);

  useLayoutEffect(() => {
    if (!fitted.current && project.nodes.length && wrap.current) {
      fitted.current = true;
      fit();
    }
  }, [project.nodes.length, fit]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.uxm-detail, .uxm-edgepop')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const intent = readWheel(e);
      setCam((c) => (intent.kind === 'zoom' ? zoomAt(c, clampZoom(c.k * intent.factor), e.clientX - r.left, e.clientY - r.top) : { ...c, x: c.x + intent.dx, y: c.y + intent.dy }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return toWorld(camNow.current, e.clientX - r.left, e.clientY - r.top);
  };

  const elementHere = selection.artboardId && selection.elementId ? { artboardId: selection.artboardId, elementId: selection.elementId } : null;
  const visible = useMemo(
    () =>
      filter === 'element' && elementHere
        ? new Set(project.nodes.filter((n) => n.elementId === elementHere.elementId && n.artboardId === elementHere.artboardId).map((n) => n.id))
        : null,
    [filter, elementHere, project.nodes]
  );

  const addNode = (kind: NodeKind) => {
    const el = wrap.current;
    const c = el ? toWorld(camNow.current, el.clientWidth / 2, el.clientHeight / 2) : { x: 0, y: 0 };
    const jitter = (project.nodes.length % 5) * 18;
    const n = makeNode(kind, `New ${NODE_META[kind].label.toLowerCase()}`, {
      x: Math.round(c.x - NODE_W / 2 + jitter),
      y: Math.round(c.y - 40 + jitter),
      ...(elementHere && (kind === 'assumption' || kind === 'decision' || kind === 'risk') ? elementHere : {}),
    });
    dispatch({ type: 'node/add', node: n });
    onSelectNode(n.id);
  };

  /** Columns by kind, rows in creation order: a readable starting arrangement. */
  const tidy = () => {
    const cols: NodeKind[][] = [['need'], ['evidence'], ['assumption', 'question'], ['decision', 'risk'], ['hypothesis']];
    cols.forEach((kinds, ci) => {
      let y = 0;
      project.nodes
        .filter((n) => kinds.includes(n.kind))
        .forEach((n) => {
          dispatch({ type: 'node/update', id: n.id, patch: { x: ci * (NODE_W + 90), y } });
          y += nodeH(n) + 36;
        });
    });
    window.setTimeout(fit, 30);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.uxm-detail, .uxm-tools, .uxm-edgepop, .uxm-health, .uxm-elchip')) return;
    const pointer = e.pointerType;
    const linkFrom = t.closest<HTMLElement>('[data-link-from]');
    if (linkFrom) {
      const from = project.nodes.find((n) => n.id === linkFrom.dataset.linkFrom);
      if (!from) return;
      const w = local(e);
      drag.current = { kind: 'link', from, x: w.x, y: w.y, pointer, moved: false, sx: e.clientX, sy: e.clientY };
      setLink({ from, x: w.x, y: w.y });
      wrap.current?.setPointerCapture(e.pointerId);
      return;
    }
    const edgeEl = t.closest<HTMLElement>('[data-edge]');
    if (edgeEl) {
      setSelEdge(edgeEl.dataset.edge!);
      return;
    }
    const nodeEl = t.closest<HTMLElement>('[data-node]');
    if (nodeEl) {
      const node = project.nodes.find((n) => n.id === nodeEl.dataset.node);
      if (!node) return;
      onSelectNode(node.id);
      setSelEdge(null);
      drag.current = { kind: 'node', sx: e.clientX, sy: e.clientY, node, moved: false, pointer };
      wrap.current?.setPointerCapture(e.pointerId);
      return;
    }
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam: camNow.current, moved: false, pointer };
    wrap.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && !isDrag(dx, dy, d.pointer)) return;
    d.moved = true;
    if (d.kind === 'pan') setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy });
    else if (d.kind === 'node') {
      const k = camNow.current.k;
      dispatch({ type: 'node/update', id: d.node.id, patch: { x: Math.round(d.node.x + dx / k), y: Math.round(d.node.y + dy / k) } });
    } else if (d.kind === 'link') {
      const w = local(e);
      setLink({ from: d.from, x: w.x, y: w.y });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    try {
      wrap.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (d?.kind === 'link') {
      setLink(null);
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-node]');
      const to = target?.dataset.node;
      if (to && to !== d.from.id) {
        // a sensible default relation for the pair; one click on its label changes it
        const toNode = project.nodes.find((n) => n.id === to);
        const kind: EdgeKind =
          d.from.kind === 'evidence' ? 'supports' : d.from.kind === 'hypothesis' || toNode?.kind === 'hypothesis' ? 'tests' : d.from.kind === 'risk' ? 'contradicts' : 'informs';
        const id = uid('e');
        dispatch({ type: 'edge/add', edge: { id, from: d.from.id, to, kind } });
        setSelEdge(id);
      }
    }
    if (d?.kind === 'pan' && !d.moved) {
      onSelectNode(null);
      setSelEdge(null);
    }
  };

  const byId = useMemo(() => new Map(project.nodes.map((n) => [n.id, n])), [project.nodes]);
  const ungrounded = useMemo(() => new Set(ungroundedDecisions(project).map((n) => n.id)), [project]);
  const untested = project.nodes.filter((n) => n.kind === 'assumption' && n.status === 'open').length;
  const contradicted = useMemo(
    () => new Set(project.edges.filter((e) => e.kind === 'contradicts').map((e) => e.to)),
    [project.edges]
  );
  const rect = (n: ReasonNode) => ({ x: n.x, y: n.y, w: NODE_W, h: nodeH(n) });
  const sel = selectedNode ? byId.get(selectedNode) ?? null : null;
  const edge = selEdge ? project.edges.find((e) => e.id === selEdge) ?? null : null;

  const elementName = (n: ReasonNode) => {
    const ab = project.artboards.find((a) => a.id === n.artboardId);
    const el = ab?.elements.find((x) => x.id === n.elementId);
    if (!el) return null;
    return el.name || `${el.kind} “${(el.text || el.label).slice(0, 24)}”`;
  };

  return (
    <div
      ref={wrap}
      className="uxm"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="application"
      aria-label="Reasoning map"
    >
      <div className="uxc-grid" style={{ backgroundPosition: `${cam.x}px ${cam.y}px`, backgroundSize: `${26 * cam.k}px ${26 * cam.k}px` }} />

      <div className="uxm-tools" role="toolbar" aria-label="Add to the map">
        <span className="uxr-eyebrow">Add</span>
        {NODE_KINDS.map((k) => (
          <button key={k} type="button" className={`uxm-add kind-${k}`} onClick={() => addNode(k)} title={NODE_META[k].note}>
            <span className="uxm-dot" aria-hidden="true" />
            {NODE_META[k].label}
          </button>
        ))}
        <span className="uxm-sep" />
        <button type="button" className="uxr-btn ghost sm" onClick={tidy} disabled={!project.nodes.length}>
          Tidy
        </button>
        <button type="button" className="uxr-btn ghost sm" onClick={fit} disabled={!project.nodes.length}>
          Fit
        </button>
        {elementHere && (
          <button type="button" className={`uxr-btn ghost sm${filter === 'element' ? ' is-on' : ''}`} onClick={() => setFilter(filter === 'element' ? 'all' : 'element')}>
            {filter === 'element' ? 'Showing selected element' : 'Only the selected element'}
          </button>
        )}
      </div>

      {project.nodes.length > 0 && (
        <div className="uxm-health" aria-live="polite">
          <span className={ungrounded.size ? 'is-warn' : ''}>
            {ungrounded.size ? `${ungrounded.size} decision${ungrounded.size > 1 ? 's' : ''} rest${ungrounded.size > 1 ? '' : 's'} on no evidence` : 'Every decision has evidence behind it'}
          </span>
          <span>
            {untested} untested assumption{untested === 1 ? '' : 's'}
          </span>
          <span>{project.edges.length} relations</span>
        </div>
      )}

      <div className="uxc-world" style={{ transform: cameraTransform(cam) }}>
        <svg className="uxm-edges" width="1" height="1" aria-hidden="true">
          <defs>
            <marker id="uxm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {project.edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const r = routeBetween(rect(a), rect(b));
            const dim = visible && !(visible.has(a.id) || visible.has(b.id));
            return (
              <g key={e.id} className={`uxm-edge k-${e.kind}${selEdge === e.id ? ' is-sel' : ''}${dim ? ' is-dim' : ''}`}>
                <path d={r.d} markerEnd="url(#uxm-arrow)" />
              </g>
            );
          })}
          {link && (
            <path
              className="uxm-linking"
              d={routeBetween(rect(link.from), { x: link.x - 2, y: link.y - 2, w: 4, h: 4 }).d}
            />
          )}
        </svg>
        {project.edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const r = routeBetween(rect(a), rect(b));
          return (
            <button
              type="button"
              key={e.id}
              data-edge={e.id}
              className={`uxm-edge-label k-${e.kind}${selEdge === e.id ? ' is-sel' : ''}`}
              style={{ left: r.mx, top: r.my }}
              aria-label={`${a.label} ${e.kind} ${b.label}`}
            >
              {e.kind}
            </button>
          );
        })}
        {project.nodes.map((n) => {
          const dim = visible && !visible.has(n.id);
          const name = elementName(n);
          return (
            <div
              key={n.id}
              data-node={n.id}
              className={`uxm-node kind-${n.kind} st-${n.status}${selectedNode === n.id ? ' is-sel' : ''}${dim ? ' is-dim' : ''}${ungrounded.has(n.id) ? ' is-ungrounded' : ''}${contradicted.has(n.id) ? ' is-contradicted' : ''}`}
              style={{ left: n.x, top: n.y, width: NODE_W }}
            >
              <div className="uxm-node-head">
                <span className="uxm-kind">
                  <span className="uxm-dot" aria-hidden="true" />
                  {NODE_META[n.kind].label}
                </span>
                {n.status !== 'open' && <span className={`uxm-status st-${n.status}`}>{n.status}</span>}
                {n.source === 'socria' && <span className="uxm-src">SocriaUX</span>}
                {n.source === 'research' && <span className="uxm-src">research</span>}
              </div>
              <div className="uxm-label">{n.label}</div>
              {name && (
                <button
                  type="button"
                  className="uxm-elchip"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => onShowElement({ artboardId: n.artboardId, elementId: n.elementId })}
                  title="Show it on the design"
                >
                  ↳ {name}
                </button>
              )}
              <span className="uxm-port" data-link-from={n.id} title="Drag to another node to relate them" aria-hidden="true" />
            </div>
          );
        })}
      </div>

      {!project.nodes.length && (
        <div className="uxc-empty">
          <p className="uxc-empty-title">No reasoning drawn yet.</p>
          <p>
            Add a user need, an assumption or a decision above — or ask SocriaUX to surface the assumptions in your design. Drag from the small circle on a node to another node to relate them.
          </p>
        </div>
      )}

      {edge && (
        <div className="uxm-edgepop" role="dialog" aria-label="Relation">
          <span className="uxr-eyebrow">
            {byId.get(edge.from)?.label.slice(0, 28)} → {byId.get(edge.to)?.label.slice(0, 28)}
          </span>
          <div className="uxm-edgekinds">
            {EDGE_KINDS.map((k) => (
              <button key={k} type="button" className={`uxr-chip${edge.kind === k ? ' is-on' : ''}`} onClick={() => dispatch({ type: 'edge/update', id: edge.id, kind: k })}>
                {k}
              </button>
            ))}
          </div>
          <div className="uxm-edgeactions">
            <button type="button" className="uxr-btn ghost sm danger" onClick={() => (dispatch({ type: 'edge/remove', id: edge.id }), setSelEdge(null))}>
              Remove relation
            </button>
            <button type="button" className="uxr-btn ghost sm" onClick={() => setSelEdge(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {sel && <NodeDetail key={sel.id} node={sel} project={project} dispatch={dispatch} onClose={() => onSelectNode(null)} onShowElement={onShowElement} onAsk={onAsk} elementHere={elementHere} ungrounded={ungrounded.has(sel.id)} />}
    </div>
  );
}

function NodeDetail({
  node,
  project,
  dispatch,
  onClose,
  onShowElement,
  onAsk,
  elementHere,
  ungrounded,
}: {
  node: ReasonNode;
  project: UXProject;
  dispatch: Dispatch;
  onClose: () => void;
  onShowElement: (s: Selection) => void;
  onAsk: (prompt: string, focus: { nodeId: string }) => void;
  elementHere: { artboardId: string; elementId: string } | null;
  ungrounded: boolean;
}) {
  const set = (patch: Partial<ReasonNode>) => dispatch({ type: 'node/update', id: node.id, patch });
  const ab = project.artboards.find((a) => a.id === node.artboardId);
  const el = ab?.elements.find((e) => e.id === node.elementId);
  const note = project.research.find((r) => r.id === node.researchId);
  const relations = project.edges.filter((e) => e.from === node.id || e.to === node.id);
  return (
    <div className="uxm-detail" role="dialog" aria-label={`${NODE_META[node.kind].label} details`}>
      <div className="uxm-detail-head">
        <select className="uxr-select" value={node.kind} onChange={(e) => set({ kind: e.target.value as NodeKind })} aria-label="Kind">
          {NODE_KINDS.map((k) => (
            <option key={k} value={k}>
              {NODE_META[k].label}
            </option>
          ))}
        </select>
        <select className="uxr-select" value={node.status} onChange={(e) => set({ status: e.target.value as ReasonNode['status'] })} aria-label="Status">
          {NODE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'open' ? (node.kind === 'assumption' || node.kind === 'hypothesis' ? 'untested' : 'open') : s}
            </option>
          ))}
        </select>
        <button type="button" className="uxr-icon" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <label className="uxr-field">
        <span>Statement</span>
        <textarea className="uxr-input" rows={2} value={node.label} onChange={(e) => set({ label: e.target.value })} />
      </label>
      <label className="uxr-field">
        <span>{node.kind === 'decision' ? 'Rationale' : node.kind === 'hypothesis' ? 'How you would test it' : 'Detail'}</span>
        <textarea className="uxr-input" rows={2} value={node.detail} onChange={(e) => set({ detail: e.target.value })} />
      </label>
      {node.kind === 'decision' && (
        <label className="uxr-field">
          <span>Trade-offs accepted</span>
          <textarea className="uxr-input" rows={2} value={node.tradeoffs} onChange={(e) => set({ tradeoffs: e.target.value })} />
        </label>
      )}
      {ungrounded && <p className="uxm-warn">Nothing on the map supports this decision with evidence yet. What would you need to see to be confident in it?</p>}
      {note && (
        <p className="uxm-from">
          From research: “{note.text.slice(0, 120)}
          {note.text.length > 120 ? '…' : ''}” <span>— {note.source || note.kind}</span>
        </p>
      )}
      <div className="uxm-link-row">
        {el ? (
          <>
            <button type="button" className="uxr-btn ghost sm" onClick={() => onShowElement({ artboardId: node.artboardId, elementId: node.elementId })}>
              ↳ {el.name || el.kind} on {ab?.name}
            </button>
            <button type="button" className="uxr-btn ghost sm" onClick={() => set({ artboardId: null, elementId: null })}>
              Unlink
            </button>
          </>
        ) : elementHere ? (
          <button type="button" className="uxr-btn ghost sm" onClick={() => set(elementHere)}>
            Link to the selected element
          </button>
        ) : (
          <span className="uxm-hint">Select an element on the design to link this to it.</span>
        )}
      </div>
      <div className="uxm-detail-foot">
        <span className="uxm-hint">{relations.length} relation{relations.length === 1 ? '' : 's'}</span>
        <button type="button" className="uxr-btn sm" onClick={() => onAsk(`Challenge this ${NODE_META[node.kind].label.toLowerCase()}: “${node.label}”`, { nodeId: node.id })}>
          Challenge with SocriaUX
        </button>
        <button type="button" className="uxr-btn ghost sm danger" onClick={() => (dispatch({ type: 'node/remove', id: node.id }), onClose())}>
          Delete
        </button>
      </div>
    </div>
  );
}
