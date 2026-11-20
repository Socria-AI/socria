'use client';

// components/ux-v0/graphics/GraphicCanvas.tsx — the artboard, drawn and handled directly.
//
// The artboard is the same SVG every export starts from (lib/ux-v0/graphics/render.ts), scaled to the zoom. Selecting
// uses the SVG's own hit testing (what the eye sees is what the pointer hits). Over it, an overlay draws the selection's
// box, its eight handles and its rotation handle, and the snapping guides. A drag is previewed live (the document is
// re-rendered at most once a frame) and committed once, on release, as one operation the workspace's history takes
// back. Locked objects can be selected, to see and unlock them, never moved.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyOps, boxOnBoard, isLocked, walk, type Artboard, type GraphicDoc, type Located, type Op } from '@/lib/ux-v0/graphics/doc';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import type { Measure } from '@/lib/ux-v0/graphics/text';

type Drag =
  | { kind: 'move'; x0: number; y0: number; ids: string[]; box: { x: number; y: number; w: number; h: number } }
  | { kind: 'resize'; x0: number; y0: number; id: string; handle: string; start: { x: number; y: number; w: number; h: number; r: number }; aspect: number }
  | { kind: 'rotate'; id: string; cx: number; cy: number; a0: number; r0: number }
  | { kind: 'pan'; x0: number; y0: number; px: number; py: number };

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const SNAP = 6;

export interface CanvasHandle {
  fit: () => void;
  zoomBy: (k: number) => void;
}

export function GraphicCanvas({
  doc,
  boardId,
  selection,
  measure,
  href,
  onSelect,
  onCommit,
  onEditText,
  zoomRef,
  guides = true,
  grid = false,
  rulers = true,
}: {
  doc: GraphicDoc;
  boardId: string;
  selection: readonly string[];
  measure: Measure;
  href: (assetId: string, src: string) => string;
  onSelect: (ids: string[]) => void;
  onCommit: (ops: Op[], label: string) => void;
  onEditText?: (id: string) => void;
  /** the workspace's way to fit and zoom (its toolbar) */
  zoomRef?: React.MutableRefObject<CanvasHandle | null>;
  /** the safe area and bleed drawn over the artboard */
  guides?: boolean;
  /** twelve columns within the safe area */
  grid?: boolean;
  /** rulers along the top and the left, in the artboard's own unit */
  rulers?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [delta, setDelta] = useState<{ dx: number; dy: number; box?: { x: number; y: number; w: number; h: number }; rotation?: number } | null>(null);
  const [snaps, setSnaps] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [space, setSpace] = useState(false);
  const raf = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const board = doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0];
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !board) return;
    const r = el.getBoundingClientRect();
    const z = Math.max(0.05, Math.min(4, Math.min((r.width - 80) / board.width, (r.height - 80) / board.height)));
    setZoom(z);
    setPan({ x: (r.width - board.width * z) / 2, y: (r.height - board.height * z) / 2 });
  }, [board]);
  const zoomBy = useCallback(
    (k: number) => {
      const el = box.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.width / 2;
      const cy = r.height / 2;
      setZoom((z0) => {
        const z = Math.max(0.05, Math.min(8, z0 * k));
        setPan((p) => ({ x: cx - ((cx - p.x) * z) / z0, y: cy - ((cy - p.y) * z) / z0 }));
        return z;
      });
    },
    [],
  );
  useEffect(() => {
    if (zoomRef) zoomRef.current = { fit, zoomBy };
  }, [zoomRef, fit, zoomBy]);
  const wheel = useRef<(e: WheelEvent) => void>(() => undefined);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const h = (e: WheelEvent) => wheel.current(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);
  useLayoutEffect(() => fit(), [boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  // the document as drawn now: with the drag in progress applied (a preview, not a change)
  const shown = useMemo(() => {
    if (!drag || !delta) return doc;
    let ops: Op[] = [];
    if (drag.kind === 'move') ops = drag.ids.map((id) => ({ op: 'move', id, dx: delta.dx, dy: delta.dy }) as Op);
    else if (drag.kind === 'resize' && delta.box) ops = [{ op: 'resize', id: drag.id, ...delta.box }];
    else if (drag.kind === 'rotate' && delta.rotation !== undefined) ops = [{ op: 'update', id: drag.id, set: { rotation: delta.rotation } }];
    const r = ops.length ? applyOps(doc, ops) : null;
    return r && r.ok ? r.doc : doc;
  }, [doc, drag, delta]);
  const shownBoard = shown.artboards.find((b) => b.id === board.id) ?? board;
  const svg = useMemo(() => renderArtboard(shown, shownBoard, { guides, hit: true, measure, href, idPrefix: `cv-${shownBoard.id}-` }).replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 width="100%" height="100%"'), [shown, shownBoard, measure, href, guides]);
  // the rulers' step: a round number of units at least 56 px apart at this zoom
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => s * zoom >= 56) ?? 10000;
  const ticks = (from: number, length: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(-from / zoom / step) * step; v * zoom + from < length && out.length < 200; v += step) out.push(v);
    return out;
  };
  const located = useMemo(() => walk(shownBoard), [shownBoard]);
  const sel = located.filter((l) => selection.includes(l.node.id));

  // keyboard: space to pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) setSpace(true);
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const toBoard = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
  };

  /** The object a click lands on: the outermost group around it (a double-click goes inside). */
  const hit = (target: EventTarget | null, deep: boolean): Located | null => {
    const el = (target as Element | null)?.closest?.('[data-gfx-id]');
    const id = el?.getAttribute('data-gfx-id');
    if (!id) return null;
    const l = located.find((x) => x.node.id === id);
    if (!l) return null;
    if (deep || !l.parents.length) return l;
    return located.find((x) => x.node.id === l.parents[0].id) ?? l;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || space) {
      setDrag({ kind: 'pan', x0: e.clientX, y0: e.clientY, px: pan.x, py: pan.y });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const handle = (e.target as HTMLElement).dataset?.gfxHandle;
    const primary = sel[0];
    if (handle && primary && !isLocked(primary)) {
      const b = boxOnBoard(primary);
      if (handle === 'rot') {
        const p = toBoard(e.clientX, e.clientY);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        setDrag({ kind: 'rotate', id: primary.node.id, cx, cy, a0: Math.atan2(p.y - cy, p.x - cx), r0: primary.node.rotation });
      } else setDrag({ kind: 'resize', x0: e.clientX, y0: e.clientY, id: primary.node.id, handle, start: { x: primary.node.x, y: primary.node.y, w: primary.node.w, h: primary.node.h, r: primary.node.rotation }, aspect: primary.node.w / primary.node.h });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const l = hit(e.target, false);
    if (!l) {
      onSelect([]);
      return;
    }
    let ids = selection.includes(l.node.id) ? [...selection] : [l.node.id];
    if (e.shiftKey) ids = selection.includes(l.node.id) ? selection.filter((x) => x !== l.node.id) : [...selection, l.node.id];
    onSelect(ids);
    const movable = located.filter((x) => ids.includes(x.node.id) && !isLocked(x));
    if (!movable.length) return;
    const bs = movable.map(boxOnBoard);
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    setDrag({ kind: 'move', x0: e.clientX, y0: e.clientY, ids: movable.map((m) => m.node.id), box: { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y } });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  /** Snapping: the moving box's edges and centre to the artboard's edges, centre and safe area, and to other objects. */
  const snap = (b: { x: number; y: number; w: number; h: number }, skip: readonly string[]) => {
    const xs = [0, board.width / 2, board.width, board.safe, board.width - board.safe];
    const ys = [0, board.height / 2, board.height, board.safe, board.height - board.safe];
    for (const l of located) {
      if (skip.includes(l.node.id) || l.parents.length) continue;
      const o = boxOnBoard(l);
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    const t = SNAP / zoom;
    let dx = 0;
    let dy = 0;
    const gx: number[] = [];
    const gy: number[] = [];
    let best = t;
    for (const edge of [b.x, b.x + b.w / 2, b.x + b.w]) for (const c of xs) if (Math.abs(c - edge) < best) ((best = Math.abs(c - edge)), (dx = c - edge), gx.splice(0, gx.length, c));
    best = t;
    for (const edge of [b.y, b.y + b.h / 2, b.y + b.h]) for (const c of ys) if (Math.abs(c - edge) < best) ((best = Math.abs(c - edge)), (dy = c - edge), gy.splice(0, gy.length, c));
    return { dx, dy, gx, gy };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { clientX, clientY, shiftKey, altKey } = e;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      if (drag.kind === 'pan') return setPan({ x: drag.px + clientX - drag.x0, y: drag.py + clientY - drag.y0 });
      if (drag.kind === 'move') {
        let dx = (clientX - drag.x0) / zoom;
        let dy = (clientY - drag.y0) / zoom;
        if (shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
        const s = altKey ? { dx: 0, dy: 0, gx: [], gy: [] } : snap({ ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy }, drag.ids);
        setSnaps({ x: s.gx, y: s.gy });
        return setDelta({ dx: dx + s.dx, dy: dy + s.dy });
      }
      if (drag.kind === 'rotate') {
        const p = toBoard(clientX, clientY);
        let r = drag.r0 + ((Math.atan2(p.y - drag.cy, p.x - drag.cx) - drag.a0) * 180) / Math.PI;
        if (shiftKey) r = Math.round(r / 15) * 15;
        r = ((((r + 180) % 360) + 360) % 360) - 180;
        return setDelta({ dx: 0, dy: 0, rotation: Math.round(r * 10) / 10 });
      }
      if (drag.kind === 'resize') {
        // the pointer's movement in the object's own (turned) frame
        const rad = (-drag.start.r * Math.PI) / 180;
        const mx = (clientX - drag.x0) / zoom;
        const my = (clientY - drag.y0) / zoom;
        const lx = mx * Math.cos(rad) - my * Math.sin(rad);
        const ly = mx * Math.sin(rad) + my * Math.cos(rad);
        let { x, y, w, h } = drag.start;
        const hd = drag.handle;
        if (hd.includes('e')) w = Math.max(4, drag.start.w + lx);
        if (hd.includes('s')) h = Math.max(4, drag.start.h + ly);
        if (hd.includes('w')) ((w = Math.max(4, drag.start.w - lx)), (x = drag.start.x + (drag.start.w - w)));
        if (hd.includes('n')) ((h = Math.max(4, drag.start.h - ly)), (y = drag.start.y + (drag.start.h - h)));
        if (shiftKey && hd.length === 2) {
          // the proportions kept from the corner dragged
          const k = Math.max(w / drag.start.w, h / drag.start.h);
          const nw = drag.start.w * k;
          const nh = drag.start.h * k;
          if (hd.includes('w')) x = drag.start.x + drag.start.w - nw;
          if (hd.includes('n')) y = drag.start.y + drag.start.h - nh;
          w = nw;
          h = nh;
        }
        return setDelta({ dx: 0, dy: 0, box: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 } });
      }
    });
  };

  const onPointerUp = () => {
    cancelAnimationFrame(raf.current);
    const d = drag;
    const dl = delta;
    setDrag(null);
    setDelta(null);
    setSnaps({ x: [], y: [] });
    if (!d || !dl) return;
    if (d.kind === 'move' && (Math.abs(dl.dx) > 0.01 || Math.abs(dl.dy) > 0.01)) onCommit(d.ids.map((id) => ({ op: 'move', id, dx: Math.round(dl.dx * 10) / 10, dy: Math.round(dl.dy * 10) / 10 }) as Op), d.ids.length > 1 ? `${d.ids.length} objects moved` : 'moved');
    if (d.kind === 'resize' && dl.box) onCommit([{ op: 'resize', id: d.id, ...dl.box }], 'resized');
    if (d.kind === 'rotate' && dl.rotation !== undefined) onCommit([{ op: 'update', id: d.id, set: { rotation: dl.rotation } }], `turned to ${dl.rotation}°`);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const r = box.current!.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const k = Math.exp(-e.deltaY * 0.0022);
      setZoom((z0) => {
        const z = Math.max(0.05, Math.min(8, z0 * k));
        setPan((p) => ({ x: cx - ((cx - p.x) * z) / z0, y: cy - ((cy - p.y) * z) / z0 }));
        return z;
      });
    } else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
  };

  wheel.current = onWheel;
  const primary = sel.length === 1 ? sel[0] : null;
  const selBox = (l: Located) => {
    const b = boxOnBoard(l);
    return { left: pan.x + b.x * zoom, top: pan.y + b.y * zoom, width: b.w * zoom, height: b.h * zoom, transform: `rotate(${l.node.rotation}deg)` };
  };
  return (
    <div
      ref={box}
      className={`gx-canvas${space || drag?.kind === 'pan' ? ' is-panning' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        const l = hit(e.target, true);
        if (!l) return;
        onSelect([l.node.id]);
        if (l.node.type === 'text') onEditText?.(l.node.id);
      }}
      role="application"
      aria-label={`Artboard “${board.name}”, ${Math.round(board.width)} × ${Math.round(board.height)} ${board.unit}. Click to select, drag to move.`}
    >
      <div className="gx-board" style={{ left: pan.x, top: pan.y, width: board.width * zoom, height: board.height * zoom }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="gx-overlay" aria-hidden="true">
        {sel.map((l) => (
          <div key={l.node.id} className={`gx-sel${isLocked(l) ? ' is-locked' : ''}`} style={selBox(l)}>
            {primary && primary.node.id === l.node.id && !isLocked(l) && (
              <>
                {HANDLES.map((h) => (
                  <span key={h} className={`gx-h gx-h-${h}`} data-gfx-handle={h} />
                ))}
                <span className="gx-h gx-h-rot" data-gfx-handle="rot" title="Turn (Shift: 15° steps)" />
              </>
            )}
            {isLocked(l) && <span className="gx-lockmark">Locked</span>}
          </div>
        ))}
        {snaps.x.map((x) => (
          <span key={`gx${x}`} className="gx-guide gx-guide-v" style={{ left: pan.x + x * zoom, top: pan.y, height: board.height * zoom }} />
        ))}
        {snaps.y.map((y) => (
          <span key={`gy${y}`} className="gx-guide gx-guide-h" style={{ top: pan.y + y * zoom, left: pan.x, width: board.width * zoom }} />
        ))}
        {grid && (
          <div className="gx-grid" style={{ left: pan.x + board.safe * zoom, top: pan.y + board.safe * zoom, width: (board.width - board.safe * 2) * zoom, height: (board.height - board.safe * 2) * zoom, columnGap: Math.max(1, (board.width - board.safe * 2) * 0.02 * zoom) }}>
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
      </div>
      {rulers && size.w > 0 && (
        <>
          <div className="gx-ruler gx-ruler-x" aria-hidden="true">
            {ticks(pan.x, size.w).map((v) => (
              <span key={v} style={{ left: pan.x + v * zoom }}>
                {v}
              </span>
            ))}
          </div>
          <div className="gx-ruler gx-ruler-y" aria-hidden="true">
            {ticks(pan.y, size.h).map((v) => (
              <span key={v} style={{ top: pan.y + v * zoom }}>
                {v}
              </span>
            ))}
          </div>
          <span className="gx-ruler-unit" aria-hidden="true">
            {board.unit}
          </span>
        </>
      )}
      <span className="gx-zoom" aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
}

export type { Artboard };
