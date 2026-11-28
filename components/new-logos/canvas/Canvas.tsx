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
import { SOURCE_DRAG } from '@/lib/new-logos/sources';

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
  /** solid: established (a relation made by the person, or one stated); dashed: unverified, or asked from; dotted: kept from */
  style: 'solid' | 'dashed' | 'dotted';
  /** its words show only while one of its ends is selected (the canvas stays quiet otherwise) */
  quiet?: boolean;
}

/** An expanded group, drawn as a frame behind its members: its label is a handle to move the group whole by. */
export interface CanvasFrame {
  id: string;
  box: Box;
  label: string;
  depth: number;
  selected?: boolean;
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
  /** a source dragged from the library and dropped: at a plane point, onto an object (its ref) or onto the plane (null) */
  onDropSource?: (sourceId: string, at: { x: number; y: number }, onto: string | null) => void;
  /**
   * centre the camera on this object (changes of `nonce` repeat it); `ifHidden`: only when it is not already in view;
   * `refs`: bring all of these into view together (what a change touched), zooming out only as far as they need
   */
  focus?: { ref: string; nonce: number; ifHidden?: boolean; refs?: string[] } | null;
  empty?: ReactNode;
  /** fit everything into view now (changes repeat it) */
  fitNonce?: number;
  /** objects' sizes as drawn, for placing new things where nothing is */
  onSizes?: (sizes: Record<string, { w: number; h: number }>) => void;
  /** everything selected (the primary one is `selected`); shift-click toggles, shift-drag on the plane draws a box */
  selection?: string[];
  onSelectMany?: (refs: string[], how: 'toggle' | 'add' | 'replace') => void;
  /** several selected objects dragged together, by a distance */
  onMoveMany?: (refs: string[], dx: number, dy: number) => void;
  frames?: CanvasFrame[];
  /** a group's frame dragged by its label, by a distance */
  onFrameMove?: (id: string, dx: number, dy: number) => void;
  onFrameSelect?: (id: string) => void;
  /** right-click, or a long press, on an object (its ref) or on the plane (null) */
  onContext?: (ref: string | null, screen: { x: number; y: number }, at: { x: number; y: number }) => void;
  /** objects shown faint and out of the way (a filter: nothing is removed) */
  dimmed?: ReadonlySet<string>;
}

const clampK = (k: number) => Math.max(CANVAS_LIMITS.minZoom, Math.min(CANVAS_LIMITS.maxZoom, k));
/** Room kept clear at the top when fitting, so nothing fits under the floating header. */
const TOP_INSET = 112;
/** Room at the bottom taken by the omnibox and the line above it, when bringing what changed into view. */
const BOTTOM_BAND = 150;
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
  // several moved together (a multi-selection, or a group by its frame): how far, while dragging
  const [shift, setShift] = useState<{ refs: Set<string>; dx: number; dy: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const press = useRef<number | null>(null);
  const gesture = useRef<{ kind: 'pan' | 'drag' | 'link' | 'pinch' | 'resize' | 'many' | 'frame' | 'marquee'; [k: string]: unknown } | null>(null);
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
      const base = drag?.ref === ref ? { x: drag.x, y: drag.y } : p.layout.items[ref];
      if (!base) return null;
      const it = shift?.refs.has(ref) ? { x: base.x + shift.dx, y: base.y + shift.dy } : base;
      if (resizing?.ref === ref) return { x: it.x, y: it.y, w: resizing.w, h: resizing.h };
      const o = p.objects.find((x) => x.ref === ref);
      if (o?.height) return { x: it.x, y: it.y, w: o.width, h: o.height };
      const s = sizes[ref] ?? { w: o?.width ?? DEFAULT_SIZE.w, h: DEFAULT_SIZE.h };
      return { x: it.x, y: it.y, w: s.w, h: s.h };
    },
    [drag, shift, resizing, p.layout.items, sizes, p.objects]
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

  // centre on an object when asked; or bring several into view together
  useEffect(() => {
    if (!p.focus) return;
    const el = hostRef.current;
    const v = viewRef.current;
    const many = (p.focus.refs ?? []).map((r) => boxOf(r)).filter((x): x is Box => !!x);
    if (el && v && many.length > 1) {
      const u = { x: Math.min(...many.map((m) => m.x)), y: Math.min(...many.map((m) => m.y)), r: Math.max(...many.map((m) => m.x + m.w)), b: Math.max(...many.map((m) => m.y + m.h)) };
      // the band at the bottom (the omnibox, and the line above it) is not somewhere to look
      const bottom = el.clientHeight - BOTTOM_BAND;
      const inView = (vv: View) => u.x * vv.k + vv.x >= 0 && u.r * vv.k + vv.x <= el.clientWidth && u.y * vv.k + vv.y >= TOP_INSET && u.b * vv.k + vv.y <= bottom;
      if (p.focus.ifHidden && inView(v)) return;
      const centred = { k: v.k, x: Math.round(el.clientWidth / 2 - ((u.x + u.r) / 2) * v.k), y: Math.round(TOP_INSET + (bottom - TOP_INSET) / 2 - ((u.y + u.b) / 2) * v.k) };
      commitView(inView(centred) ? centred : fitInto(many, el.clientWidth, el.clientHeight - BOTTOM_BAND));
      return;
    }
    const b = boxOf(p.focus.ref);
    if (!el || !b || !v) return;
    if (p.focus.ifHidden) {
      const sx = b.x * v.k + v.x, sy = b.y * v.k + v.y;
      if (sx >= 0 && sy >= TOP_INSET && sx + Math.min(b.w, 400) * v.k <= el.clientWidth && sy + Math.min(b.h, 200) * v.k <= el.clientHeight - 90) return;
    }
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
    // a long press on a touch screen is the context menu
    if (e.pointerType !== 'mouse' && p.onContext) {
      const x = e.clientX, y = e.clientY;
      const ref = t.closest<HTMLElement>('[data-ref]')?.dataset.ref ?? null;
      if (press.current) window.clearTimeout(press.current);
      press.current = window.setTimeout(() => {
        press.current = null;
        if (gesture.current && (gesture.current.moved as boolean)) return;
        gesture.current = null;
        p.onContext?.(ref, { x, y }, toPlane(x, y));
      }, 560);
    }
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
      // a drag is a drag: the browser must not start selecting the page's text under it
      e.preventDefault();
      hostRef.current?.focus({ preventScroll: true });
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
    // a group's frame, by its label: the whole group moves
    const frame = t.closest<HTMLElement>('[data-frame]');
    if (frame && p.onFrameMove) {
      const id = frame.dataset.frame as string;
      const members = new Set(p.objects.filter((o) => (o.className ?? '').split(' ').includes(`in-${id}`)).map((o) => o.ref));
      gesture.current = { kind: 'frame', id, members, sx: e.clientX, sy: e.clientY, moved: false };
      e.preventDefault();
      hostRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    // shift-click on an object adds it to (or takes it from) the selection
    if (obj && (e.shiftKey || e.metaKey) && p.onSelectMany && !t.closest(INTERACTIVE)) {
      e.preventDefault();
      p.onSelectMany([obj.dataset.ref as string], 'toggle');
      return;
    }
    const handle = t.closest<HTMLElement>('[data-drag]');
    if (obj && handle && !t.closest(INTERACTIVE) && p.selection && p.selection.length > 1 && p.selection.includes(obj.dataset.ref as string) && p.onMoveMany) {
      // one of several selected: they move together
      gesture.current = { kind: 'many', refs: new Set(p.selection), sx: e.clientX, sy: e.clientY, moved: false, ref: obj.dataset.ref };
      e.preventDefault();
      hostRef.current?.focus({ preventScroll: true });
      hostRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (obj && handle && !t.closest(INTERACTIVE)) {
      const ref = obj.dataset.ref as string;
      const it = p.layout.items[ref] ?? { x: 0, y: 0 };
      const at = toPlane(e.clientX, e.clientY);
      gesture.current = { kind: 'drag', ref, dx: at.x - it.x, dy: at.y - it.y, sx: e.clientX, sy: e.clientY, moved: false };
      // no text selection under a drag; and since that also keeps focus where it was, the canvas takes it (its keys)
      e.preventDefault();
      hostRef.current?.focus({ preventScroll: true });
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
    // shift-drag on the empty plane draws a box: what it touches is selected
    if (e.shiftKey && p.onSelectMany) {
      const at = toPlane(e.clientX, e.clientY);
      gesture.current = { kind: 'marquee', x0: at.x, y0: at.y };
      setMarquee({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
      e.preventDefault();
      hostRef.current?.setPointerCapture(e.pointerId);
      return;
    }
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
    if (g.kind === 'many' || g.kind === 'frame') {
      const k = viewRef.current?.k ?? 1;
      const dx = (e.clientX - (g.sx as number)) / k, dy = (e.clientY - (g.sy as number)) / k;
      if (!g.moved && Math.hypot(dx * k, dy * k) < 4) return;
      g.moved = true;
      setShift({ refs: (g.kind === 'many' ? g.refs : g.members) as Set<string>, dx: Math.round(dx), dy: Math.round(dy) });
      return;
    }
    if (g.kind === 'marquee') {
      const at = toPlane(e.clientX, e.clientY);
      setMarquee({ x0: g.x0 as number, y0: g.y0 as number, x1: at.x, y1: at.y });
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
    if (press.current) {
      window.clearTimeout(press.current);
      press.current = null;
    }
    if (g.kind === 'pinch') {
      if (viewRef.current) commitView(viewRef.current);
      return;
    }
    if (g.kind === 'many') {
      const d = shift;
      setShift(null);
      if (g.moved && d && (d.dx || d.dy)) p.onMoveMany?.([...(g.refs as Set<string>)], d.dx, d.dy);
      else if (!g.moved) p.onSelect(g.ref as string);
      return;
    }
    if (g.kind === 'frame') {
      const d = shift;
      setShift(null);
      if (g.moved && d && (d.dx || d.dy)) p.onFrameMove?.(g.id as string, d.dx, d.dy);
      else if (!g.moved) p.onFrameSelect?.(g.id as string);
      return;
    }
    if (g.kind === 'marquee') {
      const m = marquee;
      setMarquee(null);
      if (m) {
        const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
        const hit = p.objects
          .map((o) => ({ o, b: boxOf(o.ref) }))
          .filter(({ o, b }) => b && !p.dimmed?.has(o.ref) && b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0)
          .map(({ o }) => o.ref);
        if (hit.length) p.onSelectMany?.(hit, 'add');
      }
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
      className={`nl-cv${linking ? ' is-linking' : ''}${v.k < 0.55 ? ' is-far' : ''}${v.k < 0.32 ? ' is-farther' : ''}`}
      tabIndex={0}
      role="application"
      aria-label="Canvas. Drag the empty space to move around; ctrl and the wheel, or a pinch, zooms; arrow keys pan; plus and minus zoom; 0 fits everything."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={
        p.onContext
          ? (e) => {
              const t = e.target as HTMLElement;
              if (t.closest('input, textarea, [contenteditable="true"]')) return;
              e.preventDefault();
              const ref = t.closest<HTMLElement>('[data-ref]')?.dataset.ref ?? null;
              p.onContext?.(ref, { x: e.clientX, y: e.clientY }, toPlane(e.clientX, e.clientY));
            }
          : undefined
      }
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onDragOver={
        p.onDropFiles || p.onDropSource
          ? (e) => {
              const t = e.dataTransfer.types;
              if ((p.onDropFiles && t.includes('Files')) || (p.onDropSource && t.includes(SOURCE_DRAG))) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }
          : undefined
      }
      onDrop={
        p.onDropFiles || p.onDropSource
          ? (e) => {
              const sid = p.onDropSource ? e.dataTransfer.getData(SOURCE_DRAG) : '';
              if (sid) {
                e.preventDefault();
                const onto = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]')?.dataset.ref ?? null;
                p.onDropSource?.(sid, toPlane(e.clientX, e.clientY), onto);
                return;
              }
              const files = [...e.dataTransfer.files];
              if (!files.length || !p.onDropFiles) return;
              e.preventDefault();
              p.onDropFiles(files, toPlane(e.clientX, e.clientY));
            }
          : undefined
      }
      style={{ backgroundPosition: `${v.x}px ${v.y}px`, backgroundSize: `${24 * v.k}px ${24 * v.k}px` }}
    >
      <div className="nl-cv-plane" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` }}>
        {(p.frames ?? []).map((f) => {
          const moving = shift && gesture.current?.kind === 'frame' && gesture.current.id === f.id;
          const box = moving ? { ...f.box, x: f.box.x + shift.dx, y: f.box.y + shift.dy } : f.box;
          return (
            <div key={f.id} className={`nl-cv-frame${f.selected ? ' is-selected' : ''}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: f.depth }} aria-hidden="true">
              <span className="nl-cv-frame-label" data-frame={f.id} title="Drag to move the group; click to select it">
                {f.label}
              </span>
            </div>
          );
        })}
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
        {marquee ? <div className="nl-cv-marquee" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} /> : null}
        {drawn.map(({ l, c }) =>
          l.label && (!l.quiet || p.selected === l.from || p.selected === l.to) ? (
            <span key={`label-${l.id}`} className={`nl-cv-label is-${l.style}`} style={{ left: c.mx, top: c.my }}>
              {l.label}
            </span>
          ) : null
        )}
        {p.objects.map((o) => {
          const base = drag?.ref === o.ref ? drag : p.layout.items[o.ref] ?? { x: 0, y: 0 };
          const it = shift?.refs.has(o.ref) ? { x: base.x + shift.dx, y: base.y + shift.dy } : base;
          const inSel = p.selection?.includes(o.ref) && (p.selection?.length ?? 0) > 1;
          const dim = p.dimmed?.has(o.ref);
          return (
            <div
              key={o.ref}
              ref={measure}
              data-ref={o.ref}
              role="group"
              aria-label={o.label}
              className={`nl-cv-obj${o.className ? ` ${o.className}` : ''}${p.selected === o.ref || inSel ? ' is-selected' : ''}${inSel ? ' is-multi' : ''}${drag?.ref === o.ref || shift?.refs.has(o.ref) ? ' is-dragging' : ''}${hoverTarget === o.ref ? ' is-target' : ''}${dim ? ' is-dimmed' : ''}`}
              {...(dim ? { 'aria-hidden': true, inert: '' as unknown as boolean } : {})}
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
