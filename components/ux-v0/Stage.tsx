'use client';
// components/ux-v0/Stage.tsx — the design, at the centre, to look at and to select from.
//
// One canvas for every kind of design: a page (imported HTML or a generated
// design) drawn in the sandboxed Frame at its full height, or an image drawn
// at its natural size. The camera is Logos's (lib/canvas.ts): zoom about the
// pointer, the wheel read as pinch, notch or two-finger pan — and wheel events
// over the page are passed out of the frame so the canvas still answers them.
//
// Two ways to select: Element (the inspector inside the frame reports what was
// clicked) and Area (a rectangle dragged over the design: the frame says which
// elements it holds; an image is cropped). Both become one SelectionContext.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { cameraTransform, clampZoom, fitCamera, panBy, readWheel, toWorld, zoomAt, type Camera } from '@/lib/canvas';
import { clampBox, cropSize, elementSelection, rectFrom, regionSelection } from '@/lib/ux-v0/selection';
import type { Box, ElementCapture, ReasoningCard, SelectionContext, Viewport } from '@/lib/ux-v0/types';
import { Frame, type FrameHandle, type WheelLikeMsg, type Step } from './Frame';

export type SelectMode = 'element' | 'area';

export interface StageHandle {
  fit: () => void;
  zoomBy: (f: number) => void;
  zoom: () => number;
  /** move the selection to the parent, the first child or a sibling; false when there is none */
  stepFrom: (selector: string, dir: Step) => Promise<boolean>;
  /** find the element again after the page re-rendered */
  repick: (selector: string) => Promise<ElementCapture | null>;
  /** the whole image, small, for the model's one-time read of it */
  thumbnail: () => string | null;
}

interface Props {
  artifactId: string;
  kind: 'page' | 'image';
  doc?: string;
  imageUrl?: string;
  /** a page: the viewport width; an image: its natural width */
  width: number;
  /** an image's natural height (a page measures its own) */
  height?: number;
  viewport: Viewport | null;
  mode: SelectMode;
  selection: SelectionContext | null;
  cards: ReasoningCard[];
  activeCard: string | null;
  onSelection: (s: SelectionContext | null) => void;
  onPin: (cardId: string) => void;
  onPageReady?: (info: { width: number; height: number; outline: string }) => void;
  onMissing?: (list: string[]) => void;
  onZoom?: (k: number) => void;
  title: string;
}

export const Stage = forwardRef<StageHandle, Props>(function Stage(p, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<FrameHandle>(null);
  const img = useRef<HTMLImageElement>(null);
  const [cam, setCam] = useState<Camera>({ x: 48, y: 48, k: 0.6 });
  const camNow = useRef(cam);
  camNow.current = cam;
  const [pageH, setPageH] = useState(900);
  const [hover, setHover] = useState<{ box: Box; label: string } | null>(null);
  const [drag, setDrag] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [space, setSpace] = useState(false);
  const pan = useRef<{ sx: number; sy: number; cam: Camera } | null>(null);
  const fittedFor = useRef('');
  const W = p.width;
  const H = p.kind === 'image' ? p.height ?? 800 : pageH;

  const fitWidth = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const k = clampZoom(Math.min(1, (vw - 96) / Math.max(1, W)));
    const y = H * k < vh - 96 ? (vh - H * k) / 2 : 48;
    setCam({ x: (vw - W * k) / 2, y, k });
  }, [W, H]);

  const fitAll = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    setCam(fitCamera({ x: 0, y: 0, w: W, h: H }, el.clientWidth, el.clientHeight, { pad: 48, maxK: 1, minK: 0.05 }));
  }, [W, H]);

  // fit to the width when the design or its width changes
  useLayoutEffect(() => {
    const key = `${p.artifactId}:${W}`;
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    fitWidth();
  }, [p.artifactId, W, fitWidth]);

  useEffect(() => {
    p.onZoom?.(cam.k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam.k]);

  const wheelAt = useCallback((w: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, sx: number, sy: number) => {
    const intent = readWheel(w);
    setCam((c) => (intent.kind === 'zoom' ? zoomAt(c, clampZoom(c.k * intent.factor), sx, sy) : panBy(c, intent.dx, intent.dy)));
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      wheelAt(e, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wheelAt]);

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

  const zoomBy = useCallback((f: number) => {
    const el = wrap.current;
    if (!el) return;
    setCam((c) => zoomAt(c, clampZoom(c.k * f), el.clientWidth / 2, el.clientHeight / 2));
  }, []);

  const crop = useCallback((b: Box): { dataUrl: string; box: Box } | null => {
    const im = img.current;
    if (!im || !im.complete) return null;
    const s = cropSize(b, 1024);
    const c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const rx = im.naturalWidth / W || 1;
    const ry = im.naturalHeight / H || 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s.w, s.h);
    try {
      ctx.drawImage(im, b.x * rx, b.y * ry, b.w * rx, b.h * ry, 0, 0, s.w, s.h);
      return { dataUrl: c.toDataURL('image/jpeg', 0.86), box: b };
    } catch {
      return null;
    }
  }, [W, H]);

  useImperativeHandle(
    ref,
    () => ({
      fit: fitAll,
      zoomBy,
      zoom: () => camNow.current.k,
      stepFrom: async (selector, dir) => {
        const c = await frame.current?.pick(selector, dir);
        if (c) p.onSelection(elementSelection(c, p.artifactId, p.viewport));
        return !!c;
      },
      repick: async (selector) => (await frame.current?.pick(selector)) ?? null,
      thumbnail: () => {
        const im = img.current;
        if (!im || !im.complete || !im.naturalWidth) return null;
        const long = Math.max(im.naturalWidth, im.naturalHeight);
        const k = Math.min(1, 512 / long);
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k);
        c.height = Math.round(im.naturalHeight * k);
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        try {
          ctx.drawImage(im, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', 0.7);
        } catch {
          return null;
        }
      },
    }),
    [fitAll, zoomBy, p]
  );

  const world = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return toWorld(camNow.current, e.clientX - r.left, e.clientY - r.top);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-pin]')) return;
    const ground = t === e.currentTarget || t.classList.contains('v0-stage-ground');
    // pan: Space, the middle button, or the empty ground in element mode
    if (e.button === 1 || space || (p.mode === 'element' && ground)) {
      pan.current = { sx: e.clientX, sy: e.clientY, cam: camNow.current };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (p.mode === 'area') {
      const w = world(e);
      setDrag({ a: w, b: w });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pan.current) {
      const d = pan.current;
      setCam({ ...d.cam, x: d.cam.x + e.clientX - d.sx, y: d.cam.y + e.clientY - d.sy });
      return;
    }
    if (drag) setDrag({ a: drag.a, b: world(e) });
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (pan.current) {
      const moved = Math.hypot(e.clientX - pan.current.sx, e.clientY - pan.current.sy) > 4;
      pan.current = null;
      if (!moved && p.mode === 'element') p.onSelection(null);
      return;
    }
    if (!drag) return;
    const d = drag;
    setDrag(null);
    const raw = rectFrom(d.a, d.b, 6);
    const box = raw ? clampBox(raw, W, H) : null;
    if (!box) return;
    if (p.kind === 'image') {
      p.onSelection(regionSelection(box, null, crop(box), p.artifactId, p.viewport));
    } else {
      const found = await frame.current?.query(box);
      p.onSelection(regionSelection(box, found ?? null, null, p.artifactId, p.viewport));
    }
  };

  const onFrameWheel = (w: WheelLikeMsg) => {
    const c = camNow.current;
    wheelAt(w, c.x + w.x * c.k, c.y + w.y * c.k);
  };

  const pins = p.cards
    .filter((c) => c.state !== 'dismissed' && c.selection.artifactId === p.artifactId && (!p.viewport || !c.selection.viewport || c.selection.viewport === p.viewport))
    .map((c) => {
      const b = c.selection.element?.box ?? c.selection.region?.box ?? null;
      return b ? { id: c.id, n: c.n, x: b.x + b.w, y: b.y } : null;
    })
    .filter((x): x is { id: string; n: number; x: number; y: number } => !!x);

  const selBox = p.selection?.element?.box ?? p.selection?.region?.box ?? null;
  const dragBox = drag ? rectFrom(drag.a, drag.b, 1) : null;
  const k = cam.k;
  const overlayCapture = p.mode === 'area' || space;

  return (
    <div
      ref={wrap}
      className={`v0-stage${space ? ' is-panning' : ''}${p.mode === 'area' ? ' is-area' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="application"
      aria-label={`${p.title}. ${p.mode === 'area' ? 'Drag to select an area.' : 'Click an element to select it.'} Space and drag to move; Command and plus or minus to zoom.`}
      style={{ ['--k' as any]: k }}
    >
      <div className="v0-stage-ground" />
      <div className="v0-world" style={{ transform: cameraTransform(cam) }}>
        <div className="v0-artifact" style={{ width: W, height: H }}>
          {p.kind === 'page' && p.doc !== undefined ? (
            <Frame
              ref={frame}
              doc={p.doc}
              width={W}
              height={H}
              mode={overlayCapture ? 'none' : 'element'}
              title={p.title}
              onReady={(info) => {
                setPageH(Math.min(30000, Math.max(200, info.height)));
                p.onPageReady?.(info);
              }}
              onSize={(h) => setPageH(Math.min(30000, Math.max(200, h)))}
              onHover={(box, label) => setHover(box ? { box, label } : null)}
              onSelect={(c) => p.onSelection(elementSelection(c, p.artifactId, p.viewport))}
              onWheel={onFrameWheel}
              onKey={(key, mod) => {
                if (key === 'Escape') p.onSelection(null);
                else if (mod && (key === '=' || key === '+')) zoomBy(1.2);
                else if (mod && key === '-') zoomBy(1 / 1.2);
                else if (mod && key === '0') fitAll();
              }}
              onMissing={(list) => p.onMissing?.(list)}
            />
          ) : (
            <img ref={img} className="v0-image" src={p.imageUrl} alt={p.title} width={W} height={H} draggable={false} />
          )}
        </div>
        {hover && p.mode === 'element' && !space && (
          <div className="v0-hover" style={{ left: hover.box.x, top: hover.box.y, width: hover.box.w, height: hover.box.h }}>
            <span className="v0-hover-label" style={{ transform: `scale(${1 / k})` }}>
              {hover.label}
            </span>
          </div>
        )}
        {p.selection?.region?.elements.map((e, i) => (
          <div key={i} className="v0-sel-el" style={{ left: e.box.x, top: e.box.y, width: e.box.w, height: e.box.h }} />
        ))}
        {selBox && (
          <div className={`v0-sel${p.selection?.type === 'region' ? ' is-region' : ''}`} style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }}>
            <span className="v0-sel-label" style={{ transform: `scale(${1 / k})`, transformOrigin: '0 0' }}>
              {p.selection?.label}
            </span>
          </div>
        )}
        {dragBox && <div className="v0-drag" style={{ left: dragBox.x, top: dragBox.y, width: dragBox.w, height: dragBox.h }} />}
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            data-pin={pin.id}
            className={`v0-pin${p.activeCard === pin.id ? ' is-on' : ''}`}
            style={{ left: pin.x, top: pin.y, transform: `translate(-50%, -50%) scale(${1 / k})` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => p.onPin(pin.id)}
            aria-label={`Card ${pin.n}`}
          >
            {pin.n}
          </button>
        ))}
      </div>
      {overlayCapture && <div className="v0-capture" aria-hidden="true" />}
    </div>
  );
});
