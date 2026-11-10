'use client';

// components/preview/ImageView.tsx — the original picture, at any size.
//
// Zoom 1 fits the whole picture in the panel; above that it grows and can be
// dragged (or scrolled) around; a double press switches between fitting and its
// real pixels. A HEIC photo a browser cannot show is converted here first. When
// only the conversation's smaller copy is at hand, it is shown and said so.

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';

export function ImageView({ blob, src: given, name, zoom, onZoom, onSize, onError }: { blob: Blob | null; src?: string; name: string; zoom: number; onZoom: (z: number) => void; onSize: (w: number, h: number) => void; onError: (msg: string) => void }) {
  const [src, setSrc] = useState<string | null>(given ?? null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!blob) return;
    let url = '';
    let live = true;
    (async () => {
      let b = blob;
      // a HEIC original most browsers cannot draw: converted to JPEG in the browser
      if (/heic|heif/i.test(blob.type) || /\.(heic|heif)$/i.test(name)) {
        try {
          const { heicTo } = await import('heic-to/next');
          b = (await heicTo({ blob, type: 'image/jpeg', quality: 0.92 })) as Blob;
        } catch {
          /* drawn as it is; a browser that can, will */
        }
      }
      if (!live) return;
      url = URL.createObjectURL(b);
      setSrc(url);
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob, name]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = nat && boxSize.w ? Math.min(1, (boxSize.w - 24) / nat.w, (boxSize.h - 24) / nat.h) : 1;
  const w = nat ? Math.round(nat.w * fit * zoom) : undefined;

  const down = (e: RPointerEvent) => {
    const el = box.current;
    if (!el || zoom <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    const el = box.current;
    if (!d || !el) return;
    el.scrollLeft = d.l - (e.clientX - d.x);
    el.scrollTop = d.t - (e.clientY - d.y);
  };

  return (
    <div ref={box} className={`fp-img${zoom > 1 ? ' is-zoomed' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          draggable={false}
          style={w ? { width: w } : undefined}
          onLoad={(e) => {
            const i = e.currentTarget;
            setNat({ w: i.naturalWidth, h: i.naturalHeight });
            onSize(i.naturalWidth, i.naturalHeight);
          }}
          onError={() => onError('This picture could not be drawn in this browser.')}
          onDoubleClick={() => onZoom(zoom > 1 ? 1 : nat ? Math.max(1, 1 / fit) : 2)}
        />
      ) : (
        <p className="fp-wait">Opening the picture…</p>
      )}
    </div>
  );
}
