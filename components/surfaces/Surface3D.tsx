'use client';

// components/surfaces/Surface3D.tsx
//
// The frame every working surface sits in, and the only place the interaction
// lives.
//
// WHY A SHARED FRAME. The black hole, the Big Bang and the gravity sandbox are
// three different pictures with one set of manners: drag to turn, wheel to
// zoom, a row of control groups, a row of layer toggles, a clock, and a line
// underneath that describes what is happening without stating the conclusion.
// Written three times those manners drift, and the third one is always the one
// that forgets the keyboard. Written once, a new surface is a render function
// and a list of controls.
//
// WHAT THE FRAME OWNS: the camera, the clock, full screen, the panel's height,
// and the controls. What a surface owns: turning (camera, time, its own
// parameters) into SVG. A surface never touches the DOM and never starts a
// timer of its own, which is what makes each of them testable as a pure
// function of its inputs.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface Cam {
  yaw: number;
  pitch: number;
  dist: number;
}

export interface SurfaceCtl {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** what the number means, shown at the right of the slider */
  read: (v: number) => string;
  /** plain words: what moving this does */
  help?: string;
}

export interface SurfaceGroup {
  id: string;
  label: string;
  ctls: SurfaceCtl[];
}

export interface SurfaceLayer {
  id: string;
  label: string;
}

export interface RenderArgs {
  /** the viewBox, in its own units */
  W: number;
  H: number;
  cam: Cam;
  /** seconds of surface time elapsed, already scaled by the rate control */
  t: number;
  vals: Record<string, number>;
  layers: Record<string, boolean>;
}

export interface SurfaceRender {
  /** everything inside the <svg> */
  content: ReactNode;
  /** bottom-left and bottom-right readouts, as plain strings */
  left?: string;
  right?: string;
  /** the line under the controls; it describes, and never concludes */
  note: string;
  /** what a screen reader is told the picture is */
  label: string;
}

export interface Surface3DProps {
  title: string;
  groups: SurfaceGroup[];
  layers?: SurfaceLayer[];
  /** starting values, by control id */
  initial: Record<string, number>;
  initialCam?: Cam;
  /** how far the wheel may zoom, in the model's own units */
  distRange?: [number, number];
  render: (a: RenderArgs) => SurfaceRender;
  /** surfaces with nothing moving hide the clock and the play button */
  animated?: boolean;
}

// THE VIEWBOX IS THE PIXEL BOX, 1:1, and that is not a detail.
//
// A fixed 300-unit viewBox stretched to fit means the SVG's own text scales
// with the panel: 8.5 units of label is six pixels in a wide pane and twenty in
// a narrow one, so the same picture came out with readable labels beside the
// black hole and enormous ones in a column. Matching the viewBox to the real
// pixel size makes a unit a pixel everywhere — labels stay the size they were
// set, and a surface that wants something to scale scales it deliberately.

export function Surface3D({
  title,
  groups,
  layers = [],
  initial,
  initialCam = { yaw: 0.5, pitch: 0.34, dist: 15 },
  distRange = [4, 80],
  render,
  animated = true,
}: Surface3DProps) {
  const [vals, setVals] = useState<Record<string, number>>(initial);
  const [cam, setCam] = useState<Cam>(initialCam);
  const [on, setOn] = useState<Record<string, boolean>>(
    () => Object.fromEntries(layers.map((l) => [l.id, true]))
  );
  const [group, setGroup] = useState(groups[0]?.id ?? '');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(animated);
  const [full, setFull] = useState(false);
  // The panel's own height, which the reader drags. Stored rather than derived
  // so it survives a re-render and a full-screen round trip.
  const [tall, setTall] = useState(460);

  const stage = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const orbit = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const sizing = useRef<{ y: number; h: number } | null>(null);
  const [box, setBox] = useState({ w: 600, h: 320 });

  // ── the stage's true size, so the viewBox keeps its aspect ──
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) setBox({ w: r.width, h: r.height });
    };
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [full, tall]);

  // ── the clock ──
  // Stopped under reduced motion, not merely slowed: a surface that keeps
  // moving after the system has asked it not to is not honouring the request.
  const rate = vals.rate ?? 1;
  useEffect(() => {
    if (!animated || !playing) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setT((v) => v + dt * rate);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animated, playing, rate]);

  // ── full screen ──
  // The real Fullscreen API where it exists, and a fixed overlay where it does
  // not (iOS Safari refuses it on anything but a video). Both paths set the
  // same flag, so nothing downstream has to know which one it got.
  const toggleFull = useCallback(() => {
    const el = shell.current;
    if (!el) return;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().then(() => setFull(true)).catch(() => setFull((f) => !f));
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().then(() => setFull(false)).catch(() => setFull(false));
    } else {
      setFull((f) => !f);
    }
  }, []);
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    if (!full) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFull(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [full]);

  // ── turning it ──
  const down = useCallback(
    (e: React.PointerEvent) => {
      orbit.current = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* a pointer that cannot be captured still drags; it just may escape */
      }
    },
    [cam.yaw, cam.pitch]
  );
  const move = useCallback((e: React.PointerEvent) => {
    const d = orbit.current;
    if (!d) return;
    setCam((c) => ({
      ...c,
      yaw: d.yaw + (e.clientX - d.x) * 0.008,
      // Clamped short of the poles: at ±π/2 the projection is edge-on and the
      // object vanishes, which reads as a bug however correct it is.
      pitch: Math.min(1.45, Math.max(-1.45, d.pitch - (e.clientY - d.y) * 0.006)),
    }));
  }, []);
  const up = useCallback(() => {
    orbit.current = null;
  }, []);

  // ── zoom ──
  // Not passive: the wheel has to be claimed or the page scrolls out from
  // under the model. React's onWheel is passive by default in some builds, so
  // the listener is attached by hand.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCam((c) => ({
        ...c,
        dist: Math.min(distRange[1], Math.max(distRange[0], c.dist * (e.deltaY > 0 ? 1.09 : 0.917))),
      }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [distRange]);

  // ── the keyboard, because a model only a pointer can turn is one half the
  // people who arrive cannot turn at all ──
  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const s = e.shiftKey ? 0.28 : 0.09;
      if (e.key === 'ArrowLeft') setCam((c) => ({ ...c, yaw: c.yaw - s }));
      else if (e.key === 'ArrowRight') setCam((c) => ({ ...c, yaw: c.yaw + s }));
      else if (e.key === 'ArrowUp') setCam((c) => ({ ...c, pitch: Math.min(1.45, c.pitch + s) }));
      else if (e.key === 'ArrowDown') setCam((c) => ({ ...c, pitch: Math.max(-1.45, c.pitch - s) }));
      else if (e.key === '+' || e.key === '=') setCam((c) => ({ ...c, dist: Math.max(distRange[0], c.dist * 0.88) }));
      else if (e.key === '-') setCam((c) => ({ ...c, dist: Math.min(distRange[1], c.dist * 1.14) }));
      else if (e.key === 'f') toggleFull();
      else if (e.key === ' ') setPlaying((p) => !p);
      else return;
      e.preventDefault();
    },
    [distRange, toggleFull]
  );

  // ── dragging the panel taller ──
  const sizeDown = useCallback(
    (e: React.PointerEvent) => {
      sizing.current = { y: e.clientY, h: tall };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* as above */
      }
      e.preventDefault();
    },
    [tall]
  );
  const sizeMove = useCallback((e: React.PointerEvent) => {
    const d = sizing.current;
    if (!d) return;
    setTall(Math.min(1400, Math.max(240, d.h + (e.clientY - d.y))));
  }, []);
  const sizeUp = useCallback(() => {
    sizing.current = null;
  }, []);

  const reset = useCallback(() => {
    setVals(initial);
    setCam(initialCam);
    setOn(Object.fromEntries(layers.map((l) => [l.id, true])));
    setT(0);
    // Deliberately NOT the panel height or full screen: those are the
    // reader's window onto the thing, not part of the thing, and having
    // "reset" collapse the panel they just enlarged is a small betrayal.
  }, [initial, initialCam, layers]);

  const W = Math.max(140, Math.round(box.w));
  const H = Math.max(90, Math.round(box.h));
  const out = useMemo(
    () => render({ W, H, cam, t, vals, layers: on }),
    [render, W, H, cam, t, vals, on]
  );
  const active = groups.find((g) => g.id === group) ?? groups[0];

  return (
    <div
      ref={shell}
      className={`sfx${full ? ' is-full' : ''}`}
      style={full ? undefined : ({ ['--sfx-h' as string]: `${tall}px` })}
    >
      <div className="sfx-head">
        <span className="sfx-title">{title}</span>
        <span className="sfx-head-r">
          <button type="button" className="sfx-icon" onClick={toggleFull} aria-pressed={full}>
            {full ? 'Exit full screen' : 'Full screen'}
          </button>
        </span>
      </div>

      <div
        ref={stage}
        className="sfx-stage"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={onKey}
        tabIndex={0}
        role="img"
        aria-label={out.label}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="sfx-svg">
          {out.content}
          {out.left && (
            <text className="sfx-l evidence" x="8" y={H - 7}>
              {out.left}
            </text>
          )}
          {out.right && (
            <text className="sfx-l" x={W - 8} y={H - 7} textAnchor="end">
              {out.right}
            </text>
          )}
        </svg>
      </div>

      <div
        className="sfx-grip"
        onPointerDown={sizeDown}
        onPointerMove={sizeMove}
        onPointerUp={sizeUp}
        onPointerCancel={sizeUp}
        role="separator"
        aria-label="Drag to resize, or use the arrow keys"
        aria-orientation="horizontal"
        tabIndex={0}
        onKeyDown={(e) => {
          const s = e.shiftKey ? 80 : 24;
          if (e.key === 'ArrowUp') setTall((h) => Math.max(240, h - s));
          else if (e.key === 'ArrowDown') setTall((h) => Math.min(1400, h + s));
          else return;
          e.preventDefault();
        }}
      >
        <i />
      </div>

      <div className="sfx-foot">
        <div className="sfx-bar">
          <span className="sfx-seg">
            {animated && (
              <button type="button" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
                {playing ? 'Pause' : 'Play'}
              </button>
            )}
            {animated && (
              <button type="button" onClick={() => setT(0)}>
                Restart
              </button>
            )}
            <button type="button" onClick={reset}>
              Reset all
            </button>
          </span>
          {animated && <span className="sfx-clock">{t.toFixed(1)} s</span>}
        </div>

        {groups.length > 1 && (
          <div className="sfx-groups" role="tablist" aria-label="Control group">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={active?.id === g.id}
                onClick={() => setGroup(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        <div className="sfx-ctls">
          {active?.ctls.map((c) => (
            <label key={c.id} className="sfx-ctl" title={c.help}>
              <span className="k">{c.label}</span>
              <input
                type="range"
                min={c.min}
                max={c.max}
                step={c.step}
                value={vals[c.id] ?? c.min}
                onChange={(e) => setVals((v) => ({ ...v, [c.id]: +e.target.value }))}
              />
              <span className="v">{c.read(vals[c.id] ?? c.min)}</span>
            </label>
          ))}
          {layers.length > 0 && active?.id === groups[groups.length - 1]?.id && (
            <div className="sfx-layers">
              {layers.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={!!on[l.id]}
                  onClick={() => setOn((o) => ({ ...o, [l.id]: !o[l.id] }))}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="sfx-note">{out.note}</p>
      </div>
    </div>
  );
}
