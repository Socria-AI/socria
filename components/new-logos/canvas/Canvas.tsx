'use client';
// components/new-logos/canvas/Canvas.tsx — THE SPATIAL CANVAS: a plane where objects sit where they were put.
//
// What it does, and only this: a camera (drag the empty plane to pan; ctrl/⌘+wheel or a pinch to zoom at the
// pointer; the wheel or a two-finger scroll pans; keys pan, zoom and fit), objects placed in plane coordinates and
// moved by dragging their handle (a press that does not move is a click), connections drawn between objects'
// measured edges with their meaning in words, a handle to drag from one object to another to connect them, and a
// double-click on the empty plane to make something there. An object may have a fixed size and a handle to resize it
// by (an artifact's primitives). What the objects ARE, and what a connection means, is the
// workspace's business: this is presentation and direct manipulation, nothing more.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CANVAS_LIMITS, DEFAULT_SIZE, connector, fitView, type Box, type CanvasLayout, type View } from '@/lib/new-logos/canvas';

export interface CanvasObject {
  ref: string;
  /** width in plane units */
  width: number;
  /** height in plane units; without it the height follows the content */
  height?: number;
  /** offers a handle ([data-resize]) to resize it by */
  resizable?: boolean;
  /** read aloud for the object */
  label: string;
  /** offers a handle to drag a connection from */
  connectable?: boolean;
  className?: string;
  content: ReactNode;
}

export interface CanvasLine {
  id: string;
  from: string;
  to: string;
  /** what the connection means, in words (drawn on it) */
  label: string;
  /** solid: a relation made by the person; dashed: asked from; dotted: kept from */
  style: 'solid' | 'dashed' | 'dotted';
}

export interface CanvasProps {
  objects: CanvasObject[];
  lines: CanvasLine[];
  layout: CanvasLayout;
  onMove: (ref: string, x: number, y: number) => void;
  onView: (view: View) => void;
  selected: string | null;
  onSelect: (ref: string | null) => void;
  /** a double-click (or the add button) on the empty plane, at a plane point and a screen point */
  onCreateAt?: (at: { x: number; y: number }, screen: { x: number; y: number }) => void;
  onConnect?: (from: string, to: string) => void;
  /** an object resized by its handle, to a size in plane units */
  onResize?: (ref: string, w: number, h: number) => void;
  /** a file dropped on the plane, at a plane point */
  onDropFiles?: (files: File[], at: { x: number; y: number }) => void;
  /** centre the camera on this object (changes of `nonce` repeat it) */
  focus?: { ref: string; nonce: number } | null;
  empty?: ReactNode;
  /** fit everything into view now (changes repeat it) */
  fitNonce?: number;
  /** objects' sizes as drawn, for placing new things where nothing is */
  onSizes?: (sizes: Record<string, { w: number; h: number }>) => void;
}

const clampK = (k: number) => Math.max(CANVAS_LIMITS.minZoom, Math.min(CANVAS_LIMITS.maxZoom, k));
/** Room kept clear at the top when fitting, so nothing fits under the floating header. */
const TOP_INSET = 112;
const fitInto = (boxes: Box[], w: number, h: number): View => {
  const v = fitView(boxes, w, Math.max(120, h - TOP_INSET), 48, 1);
  return { ...v, y: v.y + TOP_INSET };
};
const INTERACTIVE = 'button, a, input, textarea, select, label, [contenteditable="true"], .nl-cv-noDrag';

export function Canvas(p: CanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View | null>(p.layout.view ?? null);
  const viewRef = useRef<View | null>(view);
  viewRef.current = view;
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [drag, setDrag] = useState<{ ref: string; x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState<{ ref: string; w: number; h: number } | null>(null);
  const [linking, setLinking] = useState<{ from: string; x: number; y: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const gesture = useRef<{ kind: 'pan' | 'drag' | 'link' | 'pinch' | 'resize'; [k: string]: unknown } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const viewTimer = useRef<number | null>(null);
  const onViewRef = useRef(p.onView);
  onViewRef.current = p.onView;

  const commitView = useCallback((v: View) => {
    setViewState(v);
    if (viewTimer.current) window.clearTimeout(viewTimer.current);
    viewTimer.current = window.setTimeout(() => onViewRef.current(v), 400);
  }, []);

  const boxOf = useCallback(
    (ref: string): Box | null => {
      const it = drag?.ref === ref ? { x: drag.x, y: drag.y } : p.layout.items[ref];
      if (!it) return null;
      if (resizing?.ref === ref) return { x: it.x, y: it.y, w: resizing.w, h: resizing.h };
      const o = p.objects.find((x) => x.ref === ref);
      if (o?.height) return { x: it.x, y: it.y, w: o.width, h: o.height };
      const s = sizes[ref] ?? { w: o?.width ?? DEFAULT_SIZE.w, h: DEFAULT_SIZE.h };
      return { x: it.x, y: it.y, w: s.w, h: s.h };
    },
    [drag, resizing, p.layout.items, sizes, p.objects]
  );

  // the first view: the saved one, or everything fitted once the objects have a size
  const fitted = useRef(false);
  const fitAll = useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    const boxes = p.objects.map((o) => boxOf(o.ref)).filter((b): b is Box => !!b);
    commitView(fitInto(boxes, el.clientWidth, el.clientHeight));
  }, [p.objects, boxOf, commitView]);
  useLayoutEffect(() => {
    if (fitted.current) return;
    const el = hostRef.current;
    if (!el || !el.clientWidth) return;
    fitted.current = true;
    const boxes = p.objects.map((o) => boxOf(o.ref)).filter((b): b is Box => !!b);
    // a saved camera is kept only if it shows something here: one saved on a wide screen can point past
    // everything on a narrow one
    const seen = (v: View) => boxes.some((b) => (b.x + b.w) * v.k + v.x > 0 && b.x * v.k + v.x < el.clientWidth && (b.y + b.h) * v.k + v.y > TOP_INSET && b.y * v.k + v.y < el.clientHeight);
    if (!view || (boxes.length && !seen(view))) setViewState(fitInto(boxes, el.clientWidth, el.clientHeight));
  }, [view, p.objects, boxOf]);
  useEffect(() => {
    if (p.fitNonce) fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitNonce]);

  // centre on an object when asked
  useEffect(() => {
    if (!p.focus) return;
    const el = hostRef.current;
    const b = boxOf(p.focus.ref);
    const v = viewRef.current;
    if (!el || !b || !v) return;
    const k = Math.max(v.k, 0.85);
    commitView({ k, x: Math.round(el.clientWidth / 2 - (b.x + b.w / 2) * k), y: Math.round(TOP_INSET + (el.clientHeight - TOP_INSET) / 2 - (b.y + Math.min(b.h, 260) / 2) * k) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus?.nonce, p.focus?.ref]);

  // object sizes, as drawn, for the connections and for fitting
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    observer.current = new ResizeObserver((entries) => {
      setSizes((s) => {
        let next = s;
        for (const e of entries) {
          const ref = (e.target as HTMLElement).dataset.ref;
          if (!ref) continue;
          const el = e.target as HTMLElement;
          const w = el.offsetWidth, h = el.offsetHeight;
          if (s[ref]?.w !== w || s[ref]?.h !== h) next = { ...next, [ref]: { w, h } };
        }
        return next;
      });
    });
    hostRef.current?.querySelectorAll<HTMLElement>('[data-ref]').forEach((el) => observer.current?.observe(el));
    return () => observer.current?.disconnect();
  }, []);
  useEffect(() => {
    p.onSizes?.(sizes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes]);
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (el) observer.current?.observe(el);
  }, []);

  const toPlane = useCallback((cx: number, cy: number) => {
    const r = hostRef.current!.getBoundingClientRect();
    const v = viewRef.current ?? { x: 0, y: 0, k: 1 };
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }, []);

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const el = hostRef.current;
      const v = viewRef.current;
      if (!el || !v) return;
      const r = el.getBoundingClientRect();
      const px = cx === undefined ? el.clientWidth / 2 : cx - r.left;
      const py = cy === undefined ? el.clientHeight / 2 : cy - r.top;
      const k = clampK(v.k * factor);
      commitView({ k: Math.round(k * 1000) / 1000, x: Math.round(px - ((px - v.x) / v.k) * k), y: Math.round(py - ((py - v.y) / v.k) * k) });
    },
    [commitView]
  );

  // the wheel: not passive, so a pinch or a scroll moves the plane instead of the page
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.nl-cv-scroll')) return;
      e.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
      else commitView({ ...v, x: Math.round(v.x - e.deltaX), y: Math.round(v.y - e.deltaY) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, commitView]);

  // ── pointers ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target as HTMLElement;
    // the canvas's own controls (zoom, the empty-state note) are pressed, not panned through
    if (t.closest('.nl-cv-ui')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), view: viewRef.current };
      setDrag(null);
      return;
    }
    const connect = t.closest<HTMLElement>('[data-connect]');
    if (connect && p.onConnect) {
      const from = connect.dataset.connect as string;
      const at = toPlane(e.clientX, e.clientY);
      gesture.current = { kind: 'link', from };
      setLinking({ from, ...at });
      hostRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    const grip = t.closest<HTMLElement>('[data-resize]');
    const obj = t.closest<HTMLElement>('[data-ref]');
    if (grip && obj && p.onResize) {
      const ref = obj.dataset.ref as string;
      const o = p.objects.find((x) => x.ref === ref);
      const at = toPlane(e.clientX, e.clientY);
      gesture.current = { kind: 'resize', ref, sx: at.x, sy: at.y, w0: o?.width ?? obj.offsetWidth, h0: o?.height ?? obj.offsetHeight };
      hostRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const handle = t.closest<HTMLElement>('[data-drag]');
    if (obj && handle && !t.closest(INTERACTIVE)) {
      const ref = obj.dataset.ref as string;
      const it = p.layout.items[ref] ?? { x: 0, y: 0 };
      const at = toPlane(e.clientX, e.clientY);
      gesture.current = { kind: 'drag', ref, dx: at.x - it.x, dy: at.y - it.y, sx: e.clientX, sy: e.clientY, moved: false };
      hostRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (obj) {
      // inside an object: its own controls handle their presses; anywhere else on it selects it
      if (!t.closest(INTERACTIVE)) p.onSelect(obj.dataset.ref as string);
      return;
    }
    const v = viewRef.current;
    if (!v) return;
    gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
    hostRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const v0 = g.view as View | null;
      if (!v0 || !(g.d as number)) return;
      const el = hostRef.current!;
      const r = el.getBoundingClientRect();
      const px = (a.x + b.x) / 2 - r.left, py = (a.y + b.y) / 2 - r.top;
      const k = clampK(v0.k * (d / (g.d as number)));
      setViewState({ k, x: px - ((px - v0.x) / v0.k) * k, y: py - ((py - v0.y) / v0.k) * k });
      return;
    }
    if (g.kind === 'pan') {
      const dx = e.clientX - (g.sx as number), dy = e.clientY - (g.sy as number);
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true;
      setViewState({ ...(viewRef.current as View), x: (g.vx as number) + dx, y: (g.vy as number) + dy });
      return;
    }
    if (g.kind === 'drag') {
      if (!g.moved && Math.hypot(e.clientX - (g.sx as number), e.clientY - (g.sy as number)) < 4) return;
      g.moved = true;
      const at = toPlane(e.clientX, e.clientY);
      setDrag({ ref: g.ref as string, x: Math.round(at.x - (g.dx as number)), y: Math.round(at.y - (g.dy as number)) });
      return;
    }
    if (g.kind === 'resize') {
      const at = toPlane(e.clientX, e.clientY);
      setResizing({ ref: g.ref as string, w: Math.max(120, Math.round((g.w0 as number) + at.x - (g.sx as number))), h: Math.max(48, Math.round((g.h0 as number) + at.y - (g.sy as number))) });
      return;
    }
    if (g.kind === 'link') {
      const at = toPlane(e.clientX, e.clientY);
      setLinking({ from: g.from as string, ...at });
      const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-ref]')?.dataset.ref ?? null;
      setHoverTarget(over && over !== g.from ? over : null);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    gesture.current = pointers.current.size === 1 && g?.kind === 'pinch' ? null : null;
    if (!g) return;
    try {
      hostRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (g.kind === 'pinch') {
      if (viewRef.current) commitView(viewRef.current);
      return;
    }
    if (g.kind === 'pan') {
      if (g.moved && viewRef.current) commitView(viewRef.current);
      else p.onSelect(null);
      return;
    }
    if (g.kind === 'drag') {
      const ref = g.ref as string;
      if (g.moved) {
        const at = toPlane(e.clientX, e.clientY);
        p.onMove(ref, Math.round(at.x - (g.dx as number)), Math.round(at.y - (g.dy as number)));
      }
      setDrag(null);
      p.onSelect(ref);
      return;
    }
    if (g.kind === 'resize') {
      const r = resizing;
      setResizing(null);
      if (r && r.ref === g.ref) p.onResize?.(r.ref, r.w, r.h);
      return;
    }
    if (g.kind === 'link') {
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-ref]')?.dataset.ref;
      setLinking(null);
      setHoverTarget(null);
      if (target && target !== g.from) p.onConnect?.(g.from as string, target);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-ref], .nl-cv-ui')) return;
    p.onCreateAt?.(toPlane(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
  };

  // ── keys: arrows pan (or move the selected object), + − zoom, 0 fits ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const v = viewRef.current;
    if (!v) return;
    const step = e.shiftKey ? 64 : 16;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      const sel = p.selected && p.layout.items[p.selected];
      if (p.selected && sel && t.closest(`[data-ref="${CSS.escape(p.selected)}"]`)) p.onMove(p.selected, sel.x + dx * step, sel.y + dy * step);
      else commitView({ ...v, x: v.x - dx * step * 3, y: v.y - dy * step * 3 });
      return;
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomAt(1.2);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomAt(1 / 1.2);
    } else if (e.key === '0') {
      e.preventDefault();
      fitAll();
    } else if (e.key === 'Escape') {
      p.onSelect(null);
    }
  };

  const drawn = useMemo(() => {
    return p.lines
      .map((l) => {
        const a = boxOf(l.from), b = boxOf(l.to);
        if (!a || !b) return null;
        return { l, c: connector(a, b) };
      })
      .filter((x): x is { l: CanvasLine; c: ReturnType<typeof connector> } => !!x);
  }, [p.lines, boxOf]);

  const v = view ?? { x: 0, y: 0, k: 1 };
  const linkFrom = linking ? boxOf(linking.from) : null;

  return (
    <div
      ref={hostRef}
      className={`nl-cv${linking ? ' is-linking' : ''}`}
      tabIndex={0}
      role="application"
      aria-label="Canvas. Drag the empty space to move around; ctrl and the wheel, or a pinch, zooms; arrow keys pan; plus and minus zoom; 0 fits everything."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onDragOver={p.onDropFiles ? (e) => e.dataTransfer.types.includes('Files') && e.preventDefault() : undefined}
      onDrop={
        p.onDropFiles
          ? (e) => {
              const files = [...e.dataTransfer.files];
              if (!files.length) return;
              e.preventDefault();
              p.onDropFiles?.(files, toPlane(e.clientX, e.clientY));
            }
          : undefined
      }
      style={{ backgroundPosition: `${v.x}px ${v.y}px`, backgroundSize: `${24 * v.k}px ${24 * v.k}px` }}
    >
      <div className="nl-cv-plane" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` }}>
        <svg className="nl-cv-lines" width="1" height="1" aria-hidden="true">
          <defs>
            <marker id="nl-cv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" />
            </marker>
          </defs>
          {drawn.map(({ l, c }) => (
            <line key={l.id} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} className={`nl-cv-line is-${l.style}`} markerEnd="url(#nl-cv-arrow)" />
          ))}
          {linking && linkFrom ? <line x1={linkFrom.x + linkFrom.w / 2} y1={linkFrom.y + linkFrom.h / 2} x2={linking.x} y2={linking.y} className="nl-cv-line is-linking" /> : null}
        </svg>
        {drawn.map(({ l, c }) =>
          l.label ? (
            <span key={`label-${l.id}`} className={`nl-cv-label is-${l.style}`} style={{ left: c.mx, top: c.my }}>
              {l.label}
            </span>
          ) : null
        )}
        {p.objects.map((o) => {
          const it = drag?.ref === o.ref ? drag : p.layout.items[o.ref] ?? { x: 0, y: 0 };
          return (
            <div
              key={o.ref}
              ref={measure}
              data-ref={o.ref}
              role="group"
              aria-label={o.label}
              className={`nl-cv-obj${o.className ? ` ${o.className}` : ''}${p.selected === o.ref ? ' is-selected' : ''}${drag?.ref === o.ref ? ' is-dragging' : ''}${hoverTarget === o.ref ? ' is-target' : ''}`}
              style={{ left: it.x, top: it.y, width: resizing?.ref === o.ref ? resizing.w : o.width, ...(o.height || resizing?.ref === o.ref ? { height: resizing?.ref === o.ref ? resizing.h : o.height } : {}) }}
              onFocus={() => p.selected !== o.ref && p.onSelect(o.ref)}
            >
              {o.content}
              {o.connectable && p.onConnect ? <span className="nl-cv-connect" data-connect={o.ref} title="Drag to another object to connect them" aria-hidden="true" /> : null}
              {o.resizable && p.onResize && p.selected === o.ref ? (
                // the same size on screen at any zoom, so it can always be taken hold of
                <span className="nl-cv-resize" data-resize title="Drag to resize" aria-hidden="true" style={{ transform: `scale(${Math.min(4, Math.max(1, 1 / v.k))})` }} />
              ) : null}
            </div>
          );
        })}
      </div>
      {!p.objects.length && p.empty ? <div className="nl-cv-empty nl-cv-ui">{p.empty}</div> : null}
      <div className="nl-cv-zoom nl-cv-ui" role="group" aria-label="View">
        <button type="button" className="nl-icon-btn" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.25)}>
          −
        </button>
        <span className="nl-cv-pct" aria-live="polite">
          {Math.round(v.k * 100)}%
        </span>
        <button type="button" className="nl-icon-btn" aria-label="Zoom in" onClick={() => zoomAt(1.25)}>
          +
        </button>
        <button type="button" className="nl-btn is-quiet is-small" onClick={fitAll}>
          Fit
        </button>
      </div>
    </div>
  );
}
