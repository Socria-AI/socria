'use client';

// components/ux-v0/boards/BoardCanvas.tsx — the board's infinite canvas.
//
// Pan (drag the background with Space held, the middle button, or the hand; or scroll), zoom (⌘/Ctrl + scroll, pinch,
// the buttons), select (click, Shift-click, drag a marquee), move (drag; snapping to the edges and centres of the
// other things on the board, with guides; Alt to place freely), resize (the corner handle: a material keeps its
// proportions, because its size on the board is only how large it is SHOWN, never its own size), groups (selected and
// moved together). Every change is one operation handed to onOps (the workspace keeps the history).
//
// Dozens of materials stay light: only what is in view is drawn; something very small on screen is drawn as a plain
// block of its ground; each graphic's SVG is made once per document (boardRender.ts); a website's page is framed only
// while it is in view and large enough to read, otherwise its schematic stands in.

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import type { DesignProject } from '@/lib/ux-v0/types';
import type { Measure } from '@/lib/ux-v0/graphics/text';
import { bounds, MOCKUP_LABEL, type BoardNode, type BoardOp, type BoardState, type Material } from '@/lib/ux-v0/boards/model';
import { systemOverviewSvg, websiteSchematicSvg } from '@/lib/ux-v0/boards/export';
import { formatOf, sizeLabel } from '@/lib/ux-v0/graphics/formats';
import { graphicSvg, mockupScene, sourceOf, websiteDoc, websiteInfo, type Href } from './boardRender';

export interface CanvasView {
  x: number;
  y: number;
  k: number;
}
export interface BoardCanvasApi {
  fit: () => void;
  zoomBy: (f: number) => void;
  focus: (ids: readonly string[]) => void;
  view: () => CanvasView;
}

export interface BoardCanvasProps {
  board: BoardState;
  selection: readonly string[];
  onSelect: (ids: string[]) => void;
  onOps: (ops: BoardOp[], label: string) => void;
  /** a double-click: open the material's editor, edit a note's words */
  onOpen: (node: BoardNode) => void;
  onRetry: (materialId: string) => void;
  onKeep: (materialId: string) => void;
  /** a note or heading being written in place, and its words when done (null: unchanged) */
  editing: string | null;
  onEdited: (id: string, text: string | null) => void;
  href: Href;
  measure: Measure;
  websites: ReadonlyMap<string, DesignProject>;
  nonce: string;
  /** generated notes that no longer hold, with why */
  stale: ReadonlyMap<string, string[]>;
  api: MutableRefObject<BoardCanvasApi | null>;
  /** a preview: shown, not changed */
  readOnly?: boolean;
  hand?: boolean;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move'; ids: string[]; sx: number; sy: number; dx: number; dy: number; gx: number[]; gy: number[]; moved: boolean }
  | { kind: 'resize'; id: string; sx: number; sy: number; w0: number; h0: number; w: number; h: number; keep: boolean }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; base: string[] };

const SNAP = 7;
const fill100 = (svg: string) => svg.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, '<svg$1 width="100%" height="100%"');

/** Where the line between two boxes' centres leaves a box. */
function edgePoint(b: { x: number; y: number; w: number; h: number }, tx: number, ty: number) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const s = Math.min(Math.abs(dx) > 1e-6 ? b.w / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? b.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

export function BoardCanvas(props: BoardCanvasProps) {
  const { board, selection, onSelect, onOps, readOnly } = props;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [view, setView] = useState<CanvasView>({ x: 40, y: 40, k: 0.2 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const space = useRef(false);
  const fitted = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, e.contentRect.width), h: Math.max(200, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitTo = useCallback(
    (ns: readonly { x: number; y: number; w: number; h: number }[]) => {
      if (!ns.length) return;
      const b = bounds(ns);
      const pad = 60;
      const k = Math.max(0.02, Math.min(2, Math.min((size.w - pad * 2) / Math.max(1, b.w), (size.h - pad * 2) / Math.max(1, b.h))));
      setView({ k, x: (size.w - b.w * k) / 2 - b.x * k, y: (size.h - b.h * k) / 2 - b.y * k });
    },
    [size.w, size.h],
  );
  const zoomAround = useCallback((f: number, px: number, py: number) => {
    setView((v) => {
      const k = Math.max(0.02, Math.min(4, v.k * f));
      const r = k / v.k;
      return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
    });
  }, []);

  props.api.current = {
    fit: () => fitTo(board.nodes),
    zoomBy: (f) => zoomAround(f, size.w / 2, size.h / 2),
    focus: (ids) => fitTo(board.nodes.filter((n) => ids.includes(n.id))),
    view: () => viewRef.current,
  };

  // the first look: the whole board
  useEffect(() => {
    if (fitted.current || !board.nodes.length || size.w <= 200) return;
    fitted.current = true;
    fitTo(board.nodes);
  }, [board.nodes, size.w, fitTo]);

  // scrolling pans; ⌘/Ctrl + scroll (and a pinch) zooms about the pointer
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAround(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [zoomAround]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement | null)?.closest('input,textarea,select,[contenteditable]')) space.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const toWorld = (cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };
  const nodeById = useMemo(() => new Map(board.nodes.map((n) => [n.id, n])), [board.nodes]);
  const withGroups = (ids: readonly string[]) => {
    const groups = new Set(ids.map((id) => nodeById.get(id)?.group).filter(Boolean));
    return [...new Set([...ids, ...board.nodes.filter((n) => n.group && groups.has(n.group)).map((n) => n.id)])];
  };

  const set = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-bd-ui]') || t.closest('textarea')) return;
    box.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = viewRef.current;
    if (e.button === 1 || space.current || props.hand) return set({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y });
    const p = toWorld(e.clientX, e.clientY);
    const handle = t.closest('[data-handle]') as HTMLElement | null;
    if (handle && !readOnly) {
      const n = nodeById.get(handle.dataset.handle!);
      if (n && !n.locked) return set({ kind: 'resize', id: n.id, sx: p.x, sy: p.y, w0: n.w, h0: n.h, w: n.w, h: n.h, keep: n.type === 'material' || n.type === 'reference' || n.type === 'system' });
    }
    const el = t.closest('[data-node]') as HTMLElement | null;
    if (el) {
      const id = el.dataset.node!;
      let sel = [...selection];
      if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : withGroups([...sel, id]);
      else if (!sel.includes(id)) sel = withGroups([id]);
      onSelect(sel);
      if (readOnly) return;
      const movable = sel.filter((x) => !nodeById.get(x)?.locked);
      if (movable.length && !e.shiftKey) {
        // the edges and centres it may snap to: everything not moving
        const others = board.nodes.filter((n) => !movable.includes(n.id));
        const gx = others.flatMap((n) => [n.x, n.x + n.w / 2, n.x + n.w]);
        const gy = others.flatMap((n) => [n.y, n.y + n.h / 2, n.y + n.h]);
        set({ kind: 'move', ids: movable, sx: p.x, sy: p.y, dx: 0, dy: 0, gx, gy, moved: false });
      }
      return;
    }
    if (!e.shiftKey) onSelect([]);
    set({ kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, base: e.shiftKey ? [...selection] : [] });
  };

  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'pan') return setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    const p = toWorld(e.clientX, e.clientY);
    const k = viewRef.current.k;
    if (d.kind === 'move') {
      let dx = p.x - d.sx;
      let dy = p.y - d.sy;
      const moving = d.ids.map((id) => nodeById.get(id)!).filter(Boolean);
      const b = bounds(moving);
      const gx: number[] = [];
      const gy: number[] = [];
      if (!e.altKey) {
        const t = SNAP / k;
        let best = t + 1;
        for (const edge of [b.x, b.x + b.w / 2, b.x + b.w])
          for (const g of d.gx) {
            const off = g - (edge + dx);
            if (Math.abs(off) < Math.abs(best)) best = off;
          }
        if (Math.abs(best) <= t) {
          dx += best;
          for (const edge of [b.x, b.x + b.w / 2, b.x + b.w]) if (d.gx.some((g) => Math.abs(g - (edge + dx)) < 0.5)) gx.push(edge + dx);
        }
        best = t + 1;
        for (const edge of [b.y, b.y + b.h / 2, b.y + b.h])
          for (const g of d.gy) {
            const off = g - (edge + dy);
            if (Math.abs(off) < Math.abs(best)) best = off;
          }
        if (Math.abs(best) <= t) {
          dy += best;
          for (const edge of [b.y, b.y + b.h / 2, b.y + b.h]) if (d.gy.some((g) => Math.abs(g - (edge + dy)) < 0.5)) gy.push(edge + dy);
        }
      }
      setGuides({ x: gx, y: gy });
      return set({ ...d, dx, dy, moved: d.moved || Math.hypot(p.x - d.sx, p.y - d.sy) * k > 3 });
    }
    if (d.kind === 'resize') {
      let w = Math.max(40, d.w0 + (p.x - d.sx));
      let h = Math.max(30, d.h0 + (p.y - d.sy));
      if (d.keep) {
        const ar = d.w0 / d.h0;
        if (w / h > ar) h = w / ar;
        else w = h * ar;
      }
      return set({ ...d, w, h });
    }
    if (d.kind === 'marquee') {
      const next = { ...d, x1: p.x, y1: p.y };
      const r = { x: Math.min(next.x0, next.x1), y: Math.min(next.y0, next.y1), w: Math.abs(next.x1 - next.x0), h: Math.abs(next.y1 - next.y0) };
      const hit = board.nodes.filter((n) => n.x < r.x + r.w && n.x + n.w > r.x && n.y < r.y + r.h && n.y + n.h > r.y).map((n) => n.id);
      onSelect(withGroups([...new Set([...d.base, ...hit])]));
      return set(next);
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    set(null);
    setGuides({ x: [], y: [] });
    if (!d || readOnly) return;
    if (d.kind === 'move' && d.moved && (Math.abs(d.dx) > 0.01 || Math.abs(d.dy) > 0.01)) onOps([{ op: 'node-move', ids: d.ids, dx: Math.round(d.dx), dy: Math.round(d.dy) }], d.ids.length > 1 ? `${d.ids.length} things moved` : 'moved on the board');
    if (d.kind === 'resize' && (Math.abs(d.w - d.w0) > 0.5 || Math.abs(d.h - d.h0) > 0.5)) onOps([{ op: 'node-set', id: d.id, w: Math.round(d.w), h: Math.round(d.h) }], 'resized on the board (its own size unchanged)');
  };

  // what is in view (and how large on screen)
  const vx0 = -view.x / view.k;
  const vy0 = -view.y / view.k;
  const vx1 = (size.w - view.x) / view.k;
  const vy1 = (size.h - view.y) / view.k;
  const margin = 240 / view.k;
  const moveOf = (id: string) => (drag?.kind === 'move' && drag.ids.includes(id) ? { dx: drag.dx, dy: drag.dy } : null);
  const placed = (n: BoardNode) => {
    const m = moveOf(n.id);
    const r = drag?.kind === 'resize' && drag.id === n.id ? { w: drag.w, h: drag.h } : null;
    return { x: n.x + (m?.dx ?? 0), y: n.y + (m?.dy ?? 0), w: r?.w ?? n.w, h: r?.h ?? n.h };
  };
  const matById = useMemo(() => new Map(board.materials.map((m) => [m.id, m])), [board.materials]);
  const shown = board.nodes.filter((n) => board.annotations || n.type !== 'note');
  const bg: CSSProperties =
    board.background.pattern === 'none'
      ? { background: board.background.color }
      : {
          backgroundColor: board.background.color,
          backgroundImage: board.background.pattern === 'dots' ? 'radial-gradient(circle, rgba(0,0,0,0.16) 1px, transparent 1.3px)' : 'linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px)',
          backgroundSize: `${Math.max(6, 24 * view.k * (view.k < 0.25 ? 4 : 1))}px ${Math.max(6, 24 * view.k * (view.k < 0.25 ? 4 : 1))}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        };

  const sel = new Set(selection);
  const single = selection.length === 1 ? nodeById.get(selection[0]) : undefined;
  const cursor = drag?.kind === 'pan' || props.hand ? 'grabbing' : undefined;

  return (
    <div
      ref={box}
      className={`bd-canvas${readOnly ? ' is-preview' : ''}`}
      style={{ ...bg, cursor }}
      tabIndex={0}
      role="application"
      aria-label="The board: scroll to pan, ⌘/Ctrl and scroll to zoom, drag to move"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        // the canvas holds the pointer while dragging, so a double-click arrives here: the node under it is opened
        const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-node]') as HTMLElement | null;
        const n = el ? nodeById.get(el.dataset.node!) : undefined;
        if (n && !readOnly) props.onOpen(n);
      }}
      data-zoom={view.k.toFixed(4)}
      data-pan={`${Math.round(view.x)},${Math.round(view.y)}`}
    >
      <div className="bd-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, ['--k' as string]: view.k } as CSSProperties}>
        {board.connectors.length > 0 && (
          <svg className="bd-links" aria-hidden="true" style={{ left: vx0 - margin, top: vy0 - margin, width: vx1 - vx0 + margin * 2, height: vy1 - vy0 + margin * 2 }} viewBox={`${vx0 - margin} ${vy0 - margin} ${vx1 - vx0 + margin * 2} ${vy1 - vy0 + margin * 2}`}>
            <defs>
              <marker id="bd-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#3d3a33" />
              </marker>
            </defs>
            {board.connectors.map((c) => {
              const a = nodeById.get(c.from);
              const b = nodeById.get(c.to);
              // an arrow to a note goes with the notes; one between two things on the board stays
              if (!a || !b || (!board.annotations && (a.type === 'note' || b.type === 'note'))) return null;
              const pa = placed(a);
              const pb = placed(b);
              const p1 = edgePoint(pa, pb.x + pb.w / 2, pb.y + pb.h / 2);
              const p2 = edgePoint(pb, pa.x + pa.w / 2, pa.y + pa.h / 2);
              return <line key={c.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#3d3a33" strokeOpacity={0.5} strokeWidth={1.6 / view.k} markerEnd="url(#bd-arrowhead)" />;
            })}
          </svg>
        )}
        {shown.map((n) => {
          const p = placed(n);
          const inView = p.x < vx1 + margin && p.x + p.w > vx0 - margin && p.y < vy1 + margin && p.y + p.h > vy0 - margin;
          const screenW = p.w * view.k;
          const lod: 'off' | 'block' | 'full' = !inView ? 'off' : screenW < 36 ? 'block' : 'full';
          const m = n.type === 'material' ? matById.get(n.material) : undefined;
          const src = m?.type === 'mockup' ? sourceOf(board, m) : null;
          const site = m?.type === 'website' ? props.websites.get(m.projectId) ?? null : null;
          const ref = n.type === 'reference' ? board.assets.find((a) => a.id === n.asset) : undefined;
          return (
            <NodeView
              key={n.id}
              node={n}
              x={p.x}
              y={p.y}
              w={p.w}
              h={p.h}
              material={m}
              source={src}
              site={site}
              liveSite={lod === 'full' && screenW > 180}
              lod={lod}
              selected={sel.has(n.id)}
              board={n.type === 'system' || m?.type === 'mockup' ? board : null}
              href={props.href}
              measure={props.measure}
              nonce={props.nonce}
              stale={n.type === 'note' ? props.stale.get(n.id) : undefined}
              refUrl={ref ? props.href(ref.id, ref.src) : ''}
              editing={props.editing === n.id}
              onEdited={props.onEdited}
              onRetry={props.onRetry}
              onKeep={props.onKeep}
              onOpen={props.onOpen}
            />
          );
        })}
        {single && !readOnly && !single.locked && (
          <div className="bd-handle" data-handle={single.id} style={{ left: placed(single).x + placed(single).w, top: placed(single).y + placed(single).h }} title={single.type === 'material' ? 'Resize on the board (its own size stays as it is)' : 'Resize'} />
        )}
        {guides.x.map((gx, i) => (
          <div key={`gx${i}`} className="bd-guide is-v" style={{ left: gx, top: vy0 - margin, height: vy1 - vy0 + margin * 2 }} />
        ))}
        {guides.y.map((gy, i) => (
          <div key={`gy${i}`} className="bd-guide is-h" style={{ top: gy, left: vx0 - margin, width: vx1 - vx0 + margin * 2 }} />
        ))}
        {drag?.kind === 'marquee' && <div className="bd-marquee" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />}
      </div>
      {!board.nodes.length && <p className="bd-empty">Nothing on the board yet.</p>}
    </div>
  );
}

const STATUS_WORD: Record<string, string> = { planned: 'Planned', generating: 'Generating…', rendering: 'Rendering…', ready: 'Ready', failed: 'Failed' };

interface NodeViewProps {
  node: BoardNode;
  x: number;
  y: number;
  w: number;
  h: number;
  material?: Material;
  source: Material | null;
  site: DesignProject | null;
  liveSite: boolean;
  lod: 'off' | 'block' | 'full';
  selected: boolean;
  board: BoardState | null;
  href: Href;
  measure: Measure;
  nonce: string;
  stale?: string[];
  refUrl: string;
  editing: boolean;
  onEdited: (id: string, text: string | null) => void;
  onRetry: (id: string) => void;
  onKeep: (id: string) => void;
  onOpen: (n: BoardNode) => void;
}

const NodeView = memo(function NodeView(p: NodeViewProps) {
  const { node: n, material: m, lod } = p;
  const style: CSSProperties = { left: p.x, top: p.y, width: p.w, height: p.h };
  const cls = `bd-node is-${n.type}${p.selected ? ' is-selected' : ''}${n.locked ? ' is-locked' : ''}${m ? ` is-${m.type} st-${m.status}` : ''}`;
  const common = { 'data-node': n.id, className: cls, style };
  if (lod === 'off') return <div {...common} aria-hidden="true" />;

  if (n.type === 'material' && m) {
    const ground = m.type === 'graphic' ? m.doc?.artboards[0]?.background ?? '#ffffff' : m.type === 'website' ? '#ffffff' : '#f2f1ec';
    let body: React.ReactNode = null;
    if (lod === 'block') body = <div className="bd-block" style={{ background: ground }} />;
    else if (m.type === 'graphic' && m.doc) body = <GraphicArt doc={m.doc} prefix={`bd-${n.id}-`} href={p.href} measure={p.measure} />;
    else if (m.type === 'mockup' && p.board) body = <MockupArt board={p.board} material={m} source={p.source} prefix={`bd-${n.id}-`} href={p.href} measure={p.measure} />;
    else if (m.type === 'website') body = <WebsiteArt site={p.site} live={p.liveSite} nonce={p.nonce} mobile={m.view === 'mobile'} w={p.w} h={p.h} />;
    const f = m.type === 'graphic' ? formatOf(m.brief.formats[0]) : null;
    const art = m.type === 'graphic' ? m.doc?.artboards[0] : null;
    return (
      <div {...common} aria-label={`${m.name}, ${STATUS_WORD[m.status]}`}>
        <div className="bd-frame">{body}</div>
        {m.status !== 'ready' && lod === 'full' && (
          <div className={`bd-status is-${m.status}`} role="status">
            <b>{STATUS_WORD[m.status]}</b>
            {m.status === 'failed' && m.error && <span>{m.error}</span>}
            {m.status === 'failed' && (
              <span className="bd-status-acts" data-bd-ui>
                <button type="button" className="sb-btn is-sm is-primary" onClick={() => p.onRetry(m.id)}>
                  Retry this one
                </button>
                {m.type === 'graphic' && m.doc && (
                  <button type="button" className="sb-btn is-sm" onClick={() => p.onKeep(m.id)}>
                    Keep it as it is
                  </button>
                )}
              </span>
            )}
          </div>
        )}
        <div className="bd-label">
          <b>{m.name}</b>
          <span>{m.type === 'graphic' ? (art ? `${f?.label ?? 'Graphic'} · ${sizeLabel(art)}` : f?.label ?? 'Graphic') : m.type === 'website' ? (m.view === 'mobile' ? 'Website · phone' : 'Website · desktop') : `Mockup · ${MOCKUP_LABEL[m.template]}`}</span>
          {n.locked && <span className="bd-lock">Locked</span>}
        </div>
      </div>
    );
  }
  if (n.type === 'note') {
    return (
      <div {...common} className={`${cls}${n.generated ? ' is-generated' : ' is-own'}${p.stale ? ' is-stale' : ''}`}>
        {p.editing ? (
          <textarea
            className="bd-note-edit"
            defaultValue={n.text}
            autoFocus
            aria-label="The note’s words"
            onKeyDown={(e) => {
              if (e.key === 'Escape') p.onEdited(n.id, null);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) p.onEdited(n.id, (e.target as HTMLTextAreaElement).value);
            }}
            onBlur={(e) => p.onEdited(n.id, e.target.value)}
          />
        ) : (
          <p className="bd-note-text">{n.text}</p>
        )}
        {p.stale && <p className="bd-note-stale">No longer true: {p.stale.join('; ')}.</p>}
        {lod === 'full' && <span className="bd-note-who">{n.generated ? 'Written from the board’s facts' : 'Your note'}</span>}
      </div>
    );
  }
  if (n.type === 'heading') {
    return (
      <div {...common} className={`${cls} is-h${n.level}`}>
        {p.editing ? (
          <textarea
            className="bd-note-edit"
            defaultValue={n.text}
            autoFocus
            aria-label="The heading’s words"
            onKeyDown={(e) => {
              if (e.key === 'Escape') p.onEdited(n.id, null);
              if (e.key === 'Enter') {
                e.preventDefault();
                p.onEdited(n.id, (e.target as HTMLTextAreaElement).value);
              }
            }}
            onBlur={(e) => p.onEdited(n.id, e.target.value)}
          />
        ) : (
          <span>{n.text}</span>
        )}
      </div>
    );
  }
  if (n.type === 'reference') {
    return (
      <div {...common}>
        <img className="bd-ref" src={p.refUrl} alt={n.caption ?? 'A reference picture'} draggable={false} />
        {n.caption && <div className="bd-label">{n.caption}</div>}
      </div>
    );
  }
  if (n.type === 'system' && p.board?.system) {
    return (
      <div {...common} aria-label="The design system">
        {lod === 'block' ? <div className="bd-block" style={{ background: p.board.system.tokens.colors.background }} /> : <SystemArt board={p.board} measure={p.measure} id={`bd-${n.id}`} />}
        <div className="bd-label">
          <b>The design system</b>
          <span>{p.board.system.direction.name}</span>
        </div>
      </div>
    );
  }
  return <div {...common} />;
});

function GraphicArt({ doc, prefix, href, measure }: { doc: Parameters<typeof graphicSvg>[0]; prefix: string; href: Href; measure: Measure }) {
  const svg = useMemo(() => fill100(graphicSvg(doc, prefix, href, measure)), [doc, prefix, href, measure]);
  return <div className="bd-art" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function MockupArt({ board, material, source, prefix, href, measure }: { board: BoardState; material: Extract<Material, { type: 'mockup' }>; source: Material | null; prefix: string; href: Href; measure: Measure }) {
  // drawn again when its source changes (source is a dependency: the board's identity alone would redraw it always)
  const svg = useMemo(() => {
    const s = mockupScene(board, material, prefix, href, measure);
    return s ? fill100(s.svg) : '';
  }, [material, source, prefix, href, measure, board.system]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="bd-art" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function WebsiteArt({ site, live, nonce, mobile, w, h }: { site: DesignProject | null; live: boolean; nonce: string; mobile: boolean; w: number; h: number }) {
  const doc = useMemo(() => (site && live ? websiteDoc(site, nonce) : null), [site, live, nonce]);
  const schematic = useMemo(() => fill100(websiteSchematicSvg(websiteInfo(site), mobile ? 390 : 1280, mobile ? 844 : 820, mobile)), [site, mobile]);
  if (!site) return <div className="bd-missing">The website project is not in this browser, or it is not yours. Link another, or make it again.</div>;
  if (!doc) return <div className="bd-art" dangerouslySetInnerHTML={{ __html: schematic }} />;
  const native = mobile ? 390 : 1280;
  const k = w / native;
  return (
    <div className="bd-site">
      <iframe title={`${site.name}: the website`} sandbox="" srcDoc={doc} style={{ width: native, height: h / k, transform: `scale(${k})` }} tabIndex={-1} />
    </div>
  );
}

function SystemArt({ board, measure, id }: { board: BoardState; measure: Measure; id: string }) {
  const svg = useMemo(() => (board.system ? fill100(systemOverviewSvg(board.system, 960, 640, id, measure)) : ''), [board.system, measure, id]);
  return <div className="bd-art" dangerouslySetInnerHTML={{ __html: svg }} />;
}
