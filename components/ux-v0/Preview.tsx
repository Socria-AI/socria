'use client';
// components/ux-v0/Preview.tsx — the design as a visitor meets it, with its motion playing.
//
// The canvas draws a page at its full height, still, so it can be selected and
// measured. Motion that follows the scroll needs a real viewport that scrolls,
// so the preview gives it one: a desktop, tablet or phone viewport, the page in
// the same sealed frame (no scripts: the motion is CSS), "Replay" to see the
// first screen arrive again, and the reduced-motion alternative to check it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { describeMotion, MOTION_LABEL } from '@/lib/ux-v0/motion';
import { renderDesign } from '@/lib/ux-v0/render';
import { BEHAVIOR_SOURCE } from '@/lib/ux-v0/behaviors';
import { buildSandboxDoc } from '@/lib/ux-v0/sandbox';
import { STILL_MOTION, type DesignSpec } from '@/lib/ux-v0/spec';
import type { MoodboardRef } from '@/lib/ux-v0/types';

type Device = 'desktop' | 'tablet' | 'phone';
const DEVICES: Record<Device, { label: string; w: number }> = { desktop: { label: 'Desktop', w: 1280 }, tablet: { label: 'Tablet', w: 820 }, phone: { label: 'Phone', w: 390 } };

export function Preview({ spec, refs, nonce, title, onClose }: { spec: DesignSpec; refs: readonly MoodboardRef[]; nonce: string; title: string; onClose: () => void }) {
  const [device, setDevice] = useState<Device>('desktop');
  const [reduced, setReduced] = useState(false);
  const [run, setRun] = useState(0);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const motion = spec.look?.motion ?? STILL_MOTION;

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), onClose());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setArea({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const doc = useMemo(() => {
    const html = renderDesign(spec, refs, { motion: reduced ? 'reduced' : 'play' }).html;
    return buildSandboxDoc(html, { parse: (h) => new DOMParser().parseFromString(h, 'text/html'), runScripts: false, nonce, inspector: BEHAVIOR_SOURCE }).doc;
  }, [spec, refs, reduced, nonce]);

  const W = DEVICES[device].w;
  const scale = area.w ? Math.min(1, (area.w - 32) / W) : 1;
  const H = area.h ? Math.max(320, Math.floor((area.h - 24) / scale)) : 800;

  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label={`Preview of ${title}`}>
      <header className="pv-bar">
        <div className="pv-id">
          <p className="pv-title">{title}</p>
          <p className="pv-motion">
            <span className="pv-feel">{MOTION_LABEL[motion.feel]}</span> {reduced ? 'Reduced motion: nothing travels; the first screen fades in.' : describeMotion(motion)}
          </p>
        </div>
        <span className="sb-seg is-tight" role="radiogroup" aria-label="Viewport">
          {(Object.keys(DEVICES) as Device[]).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} className={`sb-seg-item${device === d ? ' is-on' : ''}`} onClick={() => setDevice(d)}>
              {DEVICES[d].label}
            </button>
          ))}
        </span>
        <button type="button" className="sb-link is-meta" onClick={() => setRun((n) => n + 1)} disabled={motion.feel === 'still'}>
          Replay
        </button>
        <label className="pv-check">
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} /> Reduced motion
        </label>
        <button ref={close} type="button" className="sb-btn is-sm" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="pv-stage" ref={stage}>
        <div className="pv-device" style={{ width: Math.round(W * scale), height: Math.round(H * scale) }}>
          <iframe
            key={`${run}-${device}-${reduced}`}
            className="pv-frame"
            title={`${title}, ${DEVICES[device].label.toLowerCase()} preview`}
            sandbox=""
            srcDoc={doc}
            style={{ width: W, height: H, transform: `scale(${scale})` }}
          />
        </div>
      </div>
    </div>
  );
}
