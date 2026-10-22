'use client';
// components/CelestialSky.tsx
//
// THE SKY, WHEN THE THEME IS CELESTIAL (lib/celestial.ts makes and paints it).
//
// Mounted once at the root (app/layout.tsx) beside ThemeScope, and it watches
// the theme attribute on <html> rather than any one component — so it follows
// the head script, navigation, the picker and the membership guard alike, and
// is gone the moment another theme is chosen.
//
// Fixed behind everything (app/celestial.css): the deep field on two
// canvases painted once, a few milliseconds at a time while the browser is
// idle, and faded in when whole; wheeling very slowly,
// once an hour, the way the sky turns; the brightest stars lifted out of it to
// twinkle; now and then a shooting star. The nearer dust is a tile of its own,
// handed to the page as --cel-dust, which the Universal Map drifts at its own
// depth as it is moved. Under reduced motion, all of it holds still.

import { useEffect, useMemo, useRef, useState } from 'react';
import { makeDust, makeSky, paintDust, skySteps, type PaintCanvas } from '@/lib/celestial';

/** The stored key Celestial keeps from its first name (lib/theme.ts). */
const CELESTIAL = 'night';

export function CelestialSky() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setOn(el.getAttribute('data-theme') === CELESTIAL);
    read();
    const watch = new MutationObserver(read);
    watch.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);
  return on ? <Sky /> : null;
}

/** The square the sky wheels in: the screen's diagonal, so no corner ever shows as it turns. */
function sideOf(): number {
  const w = Math.max(window.innerWidth, window.screen?.width ?? 0);
  const h = Math.max(window.innerHeight, window.screen?.height ?? 0);
  return Math.ceil(Math.hypot(w, h)) + 8;
}

/** Sharp where it can be, but never a canvas bigger than a phone will hold. */
function dprFor(side: number): number {
  const want = Math.min(window.devicePixelRatio || 1, 2);
  const cap = side > 1600 ? 3072 : 2048;
  return Math.max(0.5, Math.min(want, cap / side));
}

type Idle = { timeRemaining(): number };
type IdleWindow = Window & { requestIdleCallback?: (cb: (d: Idle) => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

function Sky() {
  const soft = useRef<HTMLCanvasElement>(null);
  const deep = useRef<HTMLCanvasElement>(null);
  const [side] = useState(sideOf);
  const sky = useMemo(() => makeSky({ side }), [side]);
  const [painted, setPainted] = useState(false);

  // the deep field: painted a few milliseconds at a time, while the page is
  // idle, and shown when it is whole
  useEffect(() => {
    if (!soft.current || !deep.current) return;
    const steps = skySteps(soft.current as unknown as PaintCanvas, deep.current as unknown as PaintCanvas, sky, side, dprFor(side));
    if (!steps) return;
    const w = window as IdleWindow;
    let at = 0;
    let handle: number | null = null;
    const run = (d?: Idle) => {
      const until = performance.now() + 10;
      do steps[at++]();
      while (at < steps.length && (d ? d.timeRemaining() > 3 : performance.now() < until));
      if (at < steps.length) next();
      else setPainted(true);
    };
    const next = () => {
      handle = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 400 }) : window.setTimeout(run, 16);
    };
    next();
    return () => {
      at = steps.length;
      if (handle === null) return;
      if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [sky, side]);

  // the nearer dust, as a tile the map can drift
  useEffect(() => {
    const c = document.createElement('canvas');
    // a little soft is fine for dust that is always moving; a phone keeps the memory
    if (!paintDust(c as unknown as PaintCanvas, makeDust(), 1024, Math.min(window.devicePixelRatio || 1, 1.5))) return;
    let url: string | null = null;
    let live = true;
    c.toBlob((b) => {
      if (!b || !live) return;
      url = URL.createObjectURL(b);
      document.documentElement.style.setProperty('--cel-dust', `url("${url}")`);
    });
    return () => {
      live = false;
      document.documentElement.style.removeProperty('--cel-dust');
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  return (
    <div className="cel-sky" aria-hidden="true">
      <div className="cel-wheel" style={{ width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2 }}>
        <canvas ref={soft} className={`cel-soft${painted ? ' is-in' : ''}`} />
        <canvas ref={deep} className={`cel-deep${painted ? ' is-in' : ''}`} />
        {sky.bright.map((b, i) => (
          <i
            key={i}
            className={`cel-star${b.spike ? ' is-spike' : ''}`}
            style={
              {
                left: `${(b.x * 100).toFixed(3)}%`,
                top: `${(b.y * 100).toFixed(3)}%`,
                '--s': `${(b.r * 2).toFixed(2)}px`,
                '--c': b.c,
                '--a': b.a.toFixed(2),
                '--d': `${b.dur.toFixed(2)}s`,
                '--dl': `${b.delay.toFixed(2)}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <i className="cel-shoot s1" />
      <i className="cel-shoot s2" />
      <i className="cel-shoot s3" />
      <span className="cel-veil" />
    </div>
  );
}
