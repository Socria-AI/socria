'use client';

// components/ux/UXCanvas.tsx — the design, at the centre of the workspace.
//
// An infinite canvas of artboards. The camera is Logos's own (lib/canvas.ts:
// zoom about the pointer, the wheel read as pinch / notch / two-finger pan,
// fit-to-content), so the canvas moves exactly as Logos's map does.
//
// What can be done here: select, move and resize elements (snapping to the
// edges and centres of their neighbours, with guides), edit text in place,
// place new elements, move artboards by their titles, and pin annotations.
// The automatic checks (lib/ux/audit.ts) show as small marks on the elements
// they measured, and SocriaUX's accepted annotations as numbered pins — the
// reasoning sits on the design, not in a separate window.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  boundsOf,
  cameraTransform,
  clampZoom,
  fitCamera,
  isDrag,
  panBy,
  readWheel,
  toScreen,
  toWorld,
  zoomAt,
  type Camera,
} from '@/lib/canvas';
import { makeElement, uid, type Annotation, type Artboard, type ElementKind, type UXElement, type UXProject } from '@/lib/ux/model';
import type { Finding } from '@/lib/ux/audit';
import type { Dispatch } from './useProject';

export type Tool = 'select' | 'hand' | 'annotate' | ElementKind;
export interface Selection {
  artboardId: string | null;
  elementId: string | null;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera; moved: boolean; pointer: string }
  | { kind: 'move'; sx: number; sy: number; ab: Artboard; el: UXElement; moved: boolean; pointer: string }
  | { kind: 'resize'; sx: number; sy: number; ab: Artboard; el: UXElement; corner: string; moved: boolean; pointer: string }
  | { kind: 'board'; sx: number; sy: number; ab: Artboard; moved: boolean; pointer: string };

const SNAP = 4;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

export function ElementView({ el }: { el: UXElement }) {
  const base: React.CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    fontSize: el.fontSize,
    fontWeight: el.fontWeight,
    color: el.color,
    lineHeight: 1.3,
    boxSizing: 'border-box',
  };
  switch (el.kind) {
    case 'heading':
    case 'text':
      return (
        <div className="uxe uxe-text" style={{ ...base, lineHeight: el.kind === 'heading' ? 1.15 : 1.45, letterSpacing: el.kind === 'heading' ? '-0.015em' : 0 }}>
          {el.text}
        </div>
      );
    case 'button': {
      const v = el.variant;
      return (
        <div
          className="uxe uxe-button"
          style={{
            ...base,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: el.radius,
            background: v === 'primary' ? el.fill : 'transparent',
            border: v === 'secondary' ? `1.5px solid ${el.color}` : 'none',
            padding: '0 12px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {el.text}
        </div>
      );
    }
    case 'input':
      return (
        <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h }}>
          {el.label.trim() && (
            <div className="uxe-label" style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, fontSize: 13, fontWeight: 500, color: el.color, whiteSpace: 'nowrap' }}>
              {el.label}
            </div>
          )}
          <div
            className="uxe uxe-input"
            style={{ ...base, left: 0, top: 0, display: 'flex', alignItems: 'center', padding: '0 12px', background: el.fill, border: '1px solid #c9c5b7', borderRadius: el.radius, color: el.color, opacity: 1 }}
          >
            <span style={{ opacity: 0.55, whiteSpace: 'nowrap', overflow: 'hidden' }}>{el.text}</span>
          </div>
        </div>
      );
    case 'checkbox': {
      const box = Math.min(el.h, 24);
      return (
        <div className="uxe uxe-check" style={{ ...base, display: 'flex', alignItems: 'center', gap: 10, overflow: 'visible', whiteSpace: 'nowrap' }}>
          <span style={{ width: box, height: box, flex: '0 0 auto', border: '1.5px solid #8a887f', borderRadius: el.radius, background: el.fill }} />
          <span>{el.label}</span>
        </div>
      );
    }
    case 'link':
      return (
        <div className="uxe" style={{ ...base, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
          {el.text}
        </div>
      );
    case 'image':
      return (
        <div className="uxe uxe-image" style={{ ...base, background: el.fill, borderRadius: el.radius, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <svg className="uxe-image-x" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
            <line x1="0" y1="0" x2="100" y2="100" />
            <line x1="100" y1="0" x2="0" y2="100" />
          </svg>
          <span style={{ position: 'relative', fontSize: Math.min(13, el.fontSize), color: el.color, background: el.fill, padding: '2px 6px', borderRadius: 4, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {el.text}
          </span>
        </div>
      );
    case 'rect':
      return <div className="uxe" style={{ ...base, background: el.fill, borderRadius: el.radius }} />;
    case 'nav': {
      const items = el.text.split(/\s*[·|•]\s*/).filter(Boolean);
      return (
        <div className="uxe" style={{ ...base, background: el.fill, display: 'flex', alignItems: 'center', gap: 28, padding: '0 28px', borderBottom: '1px solid #e7e2d3', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {items.map((t, i) => (
            <span key={i} style={{ opacity: i === 0 ? 1 : 0.72 }}>
              {t}
            </span>
          ))}
        </div>
      );
    }
  }
}

interface Props {
  project: UXProject;
  dispatch: Dispatch;
  selection: Selection;
  onSelect: (s: Selection) => void;
  tool: Tool;
  onTool: (t: Tool) => void;
  findings: Finding[];
  showChecks: boolean;
  activeFinding: string | null;
  onFinding: (f: Finding) => void;
  openPin: string | null;
  onOpenPin: (id: string | null) => void;
  onAsk: (prompt: string, focus: Selection) => void;
  fitSignal: number;
  camRef: React.MutableRefObject<{ zoomBy: (f: number) => void; fit: () => void; k: number } | null>;
  onZoom: (k: number) => void;
}

export function UXCanvas(props: Props) {
  const { project, dispatch, selection, onSelect, tool, onTool, findings, showChecks, openPin, onOpenPin } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Camera>({ x: 80, y: 80, k: 0.8 });
  const camNow = useRef(cam);
  camNow.current = cam;
  const [size, setSize] = useState({ w: 800, h: 600 });
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[]; ab: string } | null>(null);
  const [editing, setEditing] = useState<{ ab: string; el: string } | null>(null);
  const [space, setSpace] = useState(false);
  const fitted = useRef(false);

  // size
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const el = wrap.current;
    const b = boundsOf(project.artboards.map((a) => ({ x: a.x, y: a.y - 28, w: a.w, h: a.h + 28 })));
    if (!el || !b) return;
    setCam(fitCamera(b, el.clientWidth, el.clientHeight, { pad: 72, maxK: 1, minK: 0.15 }));
  }, [project.artboards]);

  // fit once there is something to fit, and whenever asked
  const fittedW = useRef(0);
  useEffect(() => {
    // first fit once there is something to show; again if the viewport changes a lot (a rotated phone, a panel closed)
    if (project.artboards.length && size.w > 100 && (!fitted.current || Math.abs(size.w - fittedW.current) > 240)) {
      fitted.current = true;
      fittedW.current = size.w;
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.artboards.length, size.w]);
  useEffect(() => {
    if (props.fitSignal) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitSignal]);

  useEffect(() => {
    props.onZoom(cam.k);
    props.camRef.current = {
      k: cam.k,
      fit,
      zoomBy: (f: number) => {
        const el = wrap.current;
        if (!el) return;
        setCam((c) => zoomAt(c, clampZoom(c.k * f), el.clientWidth / 2, el.clientHeight / 2));
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam.k, fit]);

  // the wheel: non-passive, so a pinch zooms the canvas, not the page
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.uxc-pop, textarea')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const intent = readWheel(e);
      setCam((c) => (intent.kind === 'zoom' ? zoomAt(c, clampZoom(c.k * intent.factor), e.clientX - r.left, e.clientY - r.top) : panBy(c, intent.dx, intent.dy)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // space to pan
  useEffect(() => {
    const typing = (t: EventTarget | null) => !!(t as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e.target)) {
        setSpace(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return toWorld(camNow.current, e.clientX - r.left, e.clientY - r.top);
  };

  const boardAt = (wx: number, wy: number) =>
    [...project.artboards].reverse().find((a) => wx >= a.x && wy >= a.y && wx <= a.x + a.w && wy <= a.y + a.h) ?? null;

  /** Edges and centres the moving element can snap to. */
  const snapTargets = (ab: Artboard, except: string) => {
    const xs = [0, ab.w / 2, ab.w, 16, 24, ab.w - 16, ab.w - 24];
    const ys = [0, ab.h / 2, ab.h];
    for (const o of ab.elements) {
      if (o.id === except) continue;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    return { xs, ys };
  };
  const snapAxis = (pos: number, len: number, targets: number[], tol: number) => {
    let best: { d: number; v: number; at: number } | null = null;
    for (const t of targets) {
      for (const [off, at] of [
        [0, pos],
        [len / 2, pos + len / 2],
        [len, pos + len],
      ] as const) {
        const d = Math.abs(at - t);
        if (d <= tol && (!best || d < best.d)) best = { d, v: t - off, at: t };
      }
    }
    return best;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const t = e.target as HTMLElement;
    if (t.closest('.uxc-pop, .uxc-edit, .uxc-zoom')) return;
    const pointer = e.pointerType;
    const w = local(e);
    const panning = tool === 'hand' || space || e.button === 1;
    if (panning) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam: camNow.current, moved: false, pointer };
      wrap.current?.setPointerCapture(e.pointerId);
      return;
    }
    const pinEl = t.closest<HTMLElement>('[data-pin]');
    if (pinEl) {
      onOpenPin(openPin === pinEl.dataset.pin ? null : pinEl.dataset.pin!);
      return;
    }
    const markEl = t.closest<HTMLElement>('[data-finding]');
    if (markEl) {
      const f = findings.find((x) => x.id === markEl.dataset.finding);
      if (f) props.onFinding(f);
      return;
    }
    const titleEl = t.closest<HTMLElement>('[data-ab-title]');
    if (titleEl) {
      const ab = project.artboards.find((a) => a.id === titleEl.dataset.abTitle);
      if (!ab) return;
      onSelect({ artboardId: ab.id, elementId: null });
      drag.current = { kind: 'board', sx: e.clientX, sy: e.clientY, ab, moved: false, pointer };
      wrap.current?.setPointerCapture(e.pointerId);
      return;
    }
    const ab = boardAt(w.x, w.y);
    const handle = t.closest<HTMLElement>('[data-handle]');
    if (handle && selection.artboardId && selection.elementId) {
      const sab = project.artboards.find((a) => a.id === selection.artboardId);
      const el = sab?.elements.find((x) => x.id === selection.elementId);
      if (sab && el) {
        drag.current = { kind: 'resize', sx: e.clientX, sy: e.clientY, ab: sab, el, corner: handle.dataset.handle!, moved: false, pointer };
        wrap.current?.setPointerCapture(e.pointerId);
      }
      return;
    }
    const elNode = t.closest<HTMLElement>('[data-el]');

    // placing something new
    if (tool !== 'select' && tool !== 'annotate') {
      if (!ab) return;
      const proto = makeElement(tool as ElementKind);
      const wFull = tool === 'nav' ? ab.w : Math.min(proto.w, ab.w - 32);
      const el = makeElement(tool as ElementKind, {
        x: tool === 'nav' ? 0 : snap(Math.max(0, Math.min(ab.w - wFull, w.x - ab.x - wFull / 2))),
        y: snap(Math.max(0, w.y - ab.y - proto.h / 2)),
        w: wFull,
      });
      dispatch({ type: 'element/add', artboardId: ab.id, element: el });
      onSelect({ artboardId: ab.id, elementId: el.id });
      onTool('select');
      return;
    }

    if (tool === 'annotate') {
      if (!ab) return;
      const elementId = elNode && elNode.dataset.ab === ab.id ? elNode.dataset.el! : null;
      const a: Annotation = {
        id: uid('an'),
        artboardId: ab.id,
        elementId,
        x: Math.round(w.x - ab.x),
        y: Math.round(w.y - ab.y),
        author: 'designer',
        kind: 'note',
        severity: null,
        text: '',
        principle: '',
        status: 'open',
        createdAt: Date.now(),
      };
      dispatch({ type: 'annotation/add', annotation: a });
      onOpenPin(a.id);
      onTool('select');
      return;
    }

    // select
    if (elNode && ab && elNode.dataset.ab === ab.id) {
      const el = ab.elements.find((x) => x.id === elNode.dataset.el);
      if (!el) return;
      onSelect({ artboardId: ab.id, elementId: el.id });
      drag.current = { kind: 'move', sx: e.clientX, sy: e.clientY, ab, el, moved: false, pointer };
      wrap.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (ab) {
      onSelect({ artboardId: ab.id, elementId: null });
      onOpenPin(null);
      return;
    }
    // empty canvas: pan, and a click clears the selection
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
    const k = camNow.current.k;
    if (d.kind === 'pan') {
      setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy });
      return;
    }
    if (d.kind === 'board') {
      dispatch({ type: 'artboard/update', id: d.ab.id, patch: { x: snap(d.ab.x + dx / k), y: snap(d.ab.y + dy / k) } });
      return;
    }
    if (d.kind === 'move') {
      let nx = d.el.x + dx / k;
      let ny = d.el.y + dy / k;
      const gx: number[] = [];
      const gy: number[] = [];
      if (!e.altKey) {
        const { xs, ys } = snapTargets(d.ab, d.el.id);
        const tol = 5 / k;
        const sx = snapAxis(nx, d.el.w, xs, tol);
        const sy = snapAxis(ny, d.el.h, ys, tol);
        if (sx) {
          nx = sx.v;
          gx.push(sx.at);
        } else nx = snap(nx);
        if (sy) {
          ny = sy.v;
          gy.push(sy.at);
        } else ny = snap(ny);
      }
      setGuides(gx.length || gy.length ? { x: gx, y: gy, ab: d.ab.id } : null);
      dispatch({ type: 'element/update', artboardId: d.ab.id, id: d.el.id, patch: { x: Math.round(nx), y: Math.round(ny) } });
      return;
    }
    if (d.kind === 'resize') {
      const el = d.el;
      let { x, y, w, h } = el;
      const ddx = dx / k;
      const ddy = dy / k;
      if (d.corner.includes('e')) w = Math.max(8, snap(el.w + ddx));
      if (d.corner.includes('s')) h = Math.max(8, snap(el.h + ddy));
      if (d.corner.includes('w')) {
        w = Math.max(8, snap(el.w - ddx));
        x = el.x + el.w - w;
      }
      if (d.corner.includes('n')) {
        h = Math.max(8, snap(el.h - ddy));
        y = el.y + el.h - h;
      }
      dispatch({ type: 'element/update', artboardId: d.ab.id, id: el.id, patch: { x, y, w, h } });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGuides(null);
    try {
      wrap.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (d?.kind === 'pan' && !d.moved && tool === 'select' && !space) {
      onSelect({ artboardId: null, elementId: null });
      onOpenPin(null);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // the press before a double-click captures the pointer, which retargets the event to the canvas: hit-test the point
    const t = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null) ?? (e.target as HTMLElement);
    const elNode = t.closest<HTMLElement>('[data-el]');
    if (!elNode) {
      const titleEl = t.closest<HTMLElement>('[data-ab-title]');
      if (titleEl) {
        const ab = project.artboards.find((a) => a.id === titleEl.dataset.abTitle);
        if (!ab) return;
        const name = window.prompt('Rename screen', ab.name);
        if (name && name.trim()) dispatch({ type: 'artboard/update', id: ab.id, patch: { name: name.trim() } });
      }
      return;
    }
    const ab = project.artboards.find((a) => a.id === elNode.dataset.ab);
    const el = ab?.elements.find((x) => x.id === elNode.dataset.el);
    if (!ab || !el || el.kind === 'rect') return;
    setEditing({ ab: ab.id, el: el.id });
  };

  // pins: where each annotation sits, in world coordinates
  const pins = useMemo(() => {
    const out: { a: Annotation; n: number; x: number; y: number }[] = [];
    let n = 0;
    for (const a of project.annotations) {
      if (a.status === 'dismissed') continue;
      const ab = project.artboards.find((b) => b.id === a.artboardId);
      if (!ab) continue;
      n++;
      const el = a.elementId ? ab.elements.find((e) => e.id === a.elementId) : null;
      out.push({ a, n, x: ab.x + (el ? el.x + el.w : a.x), y: ab.y + (el ? el.y : a.y) });
    }
    return out;
  }, [project.annotations, project.artboards]);

  const open = pins.find((p) => p.a.id === openPin) ?? null;
  const editEl = editing ? project.artboards.find((a) => a.id === editing.ab)?.elements.find((e) => e.id === editing.el) : null;
  const editAb = editing ? project.artboards.find((a) => a.id === editing.ab) : null;

  const cursor = tool === 'hand' || space ? 'grab' : tool === 'select' ? 'default' : tool === 'annotate' ? 'cell' : 'crosshair';

  return (
    <div
      ref={wrap}
      className="uxc"
      style={{ cursor, ['--k' as any]: cam.k }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      role="application"
      aria-label="Design canvas"
    >
      <div className="uxc-grid" style={{ backgroundPosition: `${cam.x}px ${cam.y}px`, backgroundSize: `${26 * cam.k}px ${26 * cam.k}px` }} />
      <div className="uxc-world" style={{ transform: cameraTransform(cam) }}>
        {project.artboards.map((ab) => {
          const selectedBoard = selection.artboardId === ab.id;
          const fs = findings.filter((f) => f.artboardId === ab.id);
          return (
            <div key={ab.id} className={`uxc-ab-wrap${selectedBoard ? ' is-sel' : ''}`} style={{ left: ab.x, top: ab.y, width: ab.w, height: ab.h }}>
              <div className="uxc-ab-title" data-ab-title={ab.id} style={{ transform: `scale(${1 / cam.k})`, transformOrigin: '0 100%' }}>
                <span className="uxc-ab-name">{ab.name}</span>
                <span className="uxc-ab-size">
                  {ab.w}×{ab.h}
                  {ab.parentId ? ' · alternative' : ''}
                </span>
              </div>
              <div className="uxc-ab" style={{ width: ab.w, height: ab.h, background: ab.background }}>
                {ab.image && <img className="uxc-ab-img" src={ab.image.src} alt="" draggable={false} />}
                {ab.elements.map((el) => (
                  <div key={el.id} className={`uxc-el${selection.elementId === el.id && selectedBoard ? ' is-sel' : ''}`} data-el={el.id} data-ab={ab.id}>
                    <ElementView el={el} />
                    <div className="uxc-hit" style={{ left: el.x, top: el.y, width: el.w, height: el.h }} />
                  </div>
                ))}
              </div>
              {/* selection, guides, checks: over the artboard, not clipped by it */}
              {selectedBoard &&
                ab.elements
                  .filter((el) => el.id === selection.elementId)
                  .map((el) => (
                    <div key={el.id} className="uxc-sel" style={{ left: el.x, top: el.y, width: el.w, height: el.h }}>
                      {['nw', 'ne', 'sw', 'se', 'e', 's'].map((c) => (
                        <span key={c} className={`uxc-handle h-${c}`} data-handle={c} />
                      ))}
                      <span className="uxc-sel-size" style={{ transform: `translateX(-50%) scale(${1 / cam.k})` }}>
                        {Math.round(el.w)} × {Math.round(el.h)}
                      </span>
                    </div>
                  ))}
              {guides && guides.ab === ab.id && (
                <>
                  {guides.x.map((x, i) => (
                    <div key={`gx${i}`} className="uxc-guide gx" style={{ left: x, top: 0, height: ab.h }} />
                  ))}
                  {guides.y.map((y, i) => (
                    <div key={`gy${i}`} className="uxc-guide gy" style={{ top: y, left: 0, width: ab.w }} />
                  ))}
                </>
              )}
              {showChecks &&
                fs
                  .filter((f) => f.elementId)
                  .map((f) => {
                    const el = ab.elements.find((x) => x.id === f.elementId);
                    if (!el) return null;
                    const same = fs.filter((g) => g.elementId === f.elementId);
                    const idx = same.indexOf(f);
                    return (
                      <button
                        type="button"
                        key={f.id}
                        className={`uxc-mark sev-${f.severity}${props.activeFinding === f.id ? ' is-on' : ''}`}
                        data-finding={f.id}
                        title={f.title}
                        aria-label={`Check: ${f.title}`}
                        style={{ left: el.x - 7 / cam.k + idx * (13 / cam.k), top: el.y - 7 / cam.k, transform: `scale(${1 / cam.k})` }}
                      />
                    );
                  })}
            </div>
          );
        })}
        {pins.map(({ a, n, x, y }) => (
          <button
            type="button"
            key={a.id}
            className={`uxc-pin by-${a.author} kind-${a.kind}${a.status === 'resolved' ? ' is-resolved' : ''}${openPin === a.id ? ' is-open' : ''}`}
            data-pin={a.id}
            style={{ left: x, top: y, transform: `translate(-50%, -50%) scale(${1 / cam.k})` }}
            aria-label={`Annotation ${n}: ${a.text || 'empty'}`}
          >
            {n}
          </button>
        ))}
      </div>

      {open && <PinPopover key={open.a.id} pin={open} cam={cam} dispatch={dispatch} onClose={() => onOpenPin(null)} onAsk={props.onAsk} project={project} />}

      {editEl && editAb && (
        <InlineEdit
          el={editEl}
          ab={editAb}
          cam={cam}
          onDone={(text) => {
            if (text !== null) {
              const patch = editEl.kind === 'checkbox' ? { label: text } : { text };
              dispatch({ type: 'element/update', artboardId: editAb.id, id: editEl.id, patch });
            }
            setEditing(null);
          }}
        />
      )}

      {!project.artboards.length && (
        <div className="uxc-empty">
          <p className="uxc-empty-title">Nothing on the canvas yet.</p>
          <p>Add a screen from the Screens tab, start from a template, or paste a screenshot (⌘V) to critique a design you already have.</p>
        </div>
      )}
    </div>
  );
}

function InlineEdit({ el, ab, cam, onDone }: { el: UXElement; ab: Artboard; cam: Camera; onDone: (t: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const p = toScreen(cam, ab.x + el.x, ab.y + el.y);
  const initial = el.kind === 'checkbox' ? el.label : el.text;
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <textarea
      ref={ref}
      className="uxc-edit"
      defaultValue={initial}
      aria-label="Edit text"
      style={{
        left: p.x,
        top: p.y,
        width: Math.max(120, el.w * cam.k),
        minHeight: Math.max(28, el.h * cam.k),
        fontSize: Math.max(12, el.fontSize * cam.k),
        fontWeight: el.fontWeight,
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDone(null);
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onDone((e.target as HTMLTextAreaElement).value);
        }
        e.stopPropagation();
      }}
      onBlur={(e) => onDone(e.target.value)}
    />
  );
}

function PinPopover({
  pin,
  cam,
  dispatch,
  onClose,
  onAsk,
  project,
}: {
  pin: { a: Annotation; n: number; x: number; y: number };
  cam: Camera;
  dispatch: Dispatch;
  onClose: () => void;
  onAsk: (prompt: string, focus: Selection) => void;
  project: UXProject;
}) {
  const { a, n } = pin;
  const p = toScreen(cam, pin.x, pin.y);
  const [text, setText] = useState(a.text);
  const ab = project.artboards.find((b) => b.id === a.artboardId);
  const el = a.elementId ? ab?.elements.find((e) => e.id === a.elementId) : null;
  const commit = () => {
    if (text !== a.text) dispatch({ type: 'annotation/update', id: a.id, patch: { text } });
  };
  return (
    <div className="uxc-pop" style={{ left: p.x + 18, top: p.y - 10 }} role="dialog" aria-label={`Annotation ${n}`}>
      <div className="uxc-pop-head">
        <span className={`uxc-pop-chip by-${a.author}`}>
          {n} · {a.author === 'socria' ? 'SocriaUX' : 'Your note'}
          {a.kind !== 'note' ? ` · ${a.kind}` : ''}
          {a.severity ? ` · ${a.severity}` : ''}
        </span>
        <button type="button" className="uxr-icon" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {el && <div className="uxc-pop-on">On {el.name || `${el.kind} “${(el.text || el.label).slice(0, 30)}”`}</div>}
      {a.author === 'designer' ? (
        <textarea
          className="uxr-input uxc-pop-text"
          autoFocus={!a.text}
          value={text}
          placeholder="What are you noticing, or unsure about?"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          rows={3}
        />
      ) : (
        <p className="uxc-pop-body">{a.text}</p>
      )}
      {a.principle && <p className="uxc-pop-principle">{a.principle}</p>}
      <div className="uxc-pop-actions">
        <button
          type="button"
          className="uxr-btn ghost sm"
          onClick={() => {
            commit();
            onAsk(`About annotation ${n}${el ? ` on “${(el.text || el.label || el.kind).slice(0, 40)}”` : ''}: ${text || a.text}`, { artboardId: a.artboardId, elementId: a.elementId });
          }}
          disabled={!(text || a.text).trim()}
        >
          Ask SocriaUX
        </button>
        <button
          type="button"
          className="uxr-btn ghost sm"
          onClick={() => {
            commit();
            dispatch({ type: 'annotation/update', id: a.id, patch: { status: a.status === 'resolved' ? 'open' : 'resolved' } });
          }}
        >
          {a.status === 'resolved' ? 'Reopen' : 'Resolve'}
        </button>
        <button
          type="button"
          className="uxr-btn ghost sm danger"
          onClick={() => {
            dispatch({ type: 'annotation/remove', id: a.id });
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
