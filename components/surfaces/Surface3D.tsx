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

import './surfaces.css';
import type { VizEntity, VizModelState, VizOp } from '@/lib/viz-model';
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
  /**
   * The handful of facts about named objects that really are live, by entity
   * id: "2 of 6 captured", "inner edge at 3.0 r". Meaning is declared once in
   * lib/viz-semantics.ts; this is only what changes as it runs, and it is what
   * lets the conversation answer "why did that one disappear?" with what the
   * simulation recorded rather than with a plausible story.
   */
  live?: Record<string, string>;
}

/**
 * What every surface takes from whoever mounts it.
 *
 * A surface knows its own controls and their sensible defaults; a caller knows
 * where it is being put and, sometimes, what the conversation already said it
 * should start at — "a ten-solar-mass hole" is a starting value, not a new
 * control. Anything unknown is ignored and anything out of range is clamped by
 * the control itself, so a caller cannot widen a physical range by passing a
 * number through here.
 */
/**
 * Snap a float on its way into an SVG attribute.
 *
 * WHY THIS EXISTS. `Math.pow`, `Math.sin` and `Math.cbrt` are not required to
 * agree to the last bit across two V8 builds, and a server render and the
 * browser that hydrates it ARE two builds. A disc patch came out at
 * fillOpacity 0.2738210066763288 on the server and 0.27382100667632886 in the
 * page: the same number to look at, and a hydration mismatch to React, which
 * then throws away the server's markup for that subtree. Path coordinates
 * already go through `toFixed(1)` for exactly this reason — this is the same
 * discipline for everything that is not a path.
 *
 * Three decimals is far past what an opacity or a radius in viewBox units can
 * show, so the drawing loses nothing by it.
 */
export function snap(n: number, dp = 3): number {
  return Number.isFinite(n) ? Number(n.toFixed(dp)) : 0;
}

export interface SurfaceProps {
  initial?: Record<string, number>;
  fill?: boolean;
  /**
   * The seam to the conversation. The frame hands back a function that reads
   * the surface's whole state at the moment it is called — not a copy pushed
   * on every frame, because the clock ticks sixty times a second and the only
   * moment the state actually matters is the moment somebody presses send.
   */
  onRead?: (read: (() => VizModelState) | null) => void;
  /**
   * Changes asked for in words. `seq` is what makes it fire: the same batch
   * handed down twice does nothing, and a reply with no changes in it never
   * touches the picture.
   */
  ops?: { seq: number; ops: VizOp[] } | null;
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
  /**
   * Who this surface is, for the conversation: the surface id, what each
   * rendered object means, and what the model behind it holds fixed. Declared
   * in lib/viz-semantics.ts rather than here so a reviewer can read every
   * claim the product makes about its own pictures in one file.
   */
  surface: string;
  entities?: VizEntity[];
  model?: string;
  assumptions?: string[];
  equations?: string[];
  /**
   * Fill the box it is mounted in rather than standing as a card of its own.
   * Set wherever something else has already decided the size — the Logos plot
   * lens, a workspace pane — so the surface does not draw a border inside a
   * border and ignore the height it was handed.
   */
  fill?: boolean;
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
  fill = false,
  surface,
  entities = [],
  model = '',
  assumptions = [],
  equations = [],
  onRead,
  ops = null,
}: Surface3DProps & Pick<SurfaceProps, 'onRead' | 'ops'>) {
  const [vals, setVals] = useState<Record<string, number>>(initial);
  const [cam, setCam] = useState<Cam>(initialCam);
  const [on, setOn] = useState<Record<string, boolean>>(
    () => Object.fromEntries(layers.map((l) => [l.id, true]))
  );
  const [group, setGroup] = useState(groups[0]?.id ?? '');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(animated);
  const [full, setFull] = useState(false);
  /**
   * What the reader last clicked, by entity id.
   *
   * THIS IS WHAT MAKES "what is this?" ANSWERABLE. A pronoun with nothing
   * behind it is the commonest thing anyone says to a picture, and it was the
   * one thing the conversation could not resolve. Held here, beside the state
   * it belongs to, and sent with the next message.
   */
  const [selected, setSelected] = useState<string | null>(null);
  // The panel's own height, which the reader drags. Stored rather than derived
  // so it survives a re-render and a full-screen round trip.
  const [tall, setTall] = useState(460);

  const stage = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const orbit = useRef<{
    x: number;
    y: number;
    yaw: number;
    pitch: number;
    moved: number;
    /** what was under the finger when it went down — see `up` */
    hit: string | null;
  } | null>(null);
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
      // WHAT WAS CLICKED IS READ HERE, NOT ON THE CLICK.
      //
      // The stage captures the pointer so a drag that leaves the panel still
      // turns the camera — and a captured pointer retargets everything after
      // it, including the click, to the capturing element. So by the time a
      // click event arrives its target is the stage div and the mark under
      // the finger is gone. Pointerdown is the one event that still knows.
      const hit = (e.target as Element | null)?.closest?.('[data-obj]') ?? null;
      orbit.current = {
        x: e.clientX,
        y: e.clientY,
        yaw: cam.yaw,
        pitch: cam.pitch,
        moved: 0,
        hit: hit?.getAttribute('data-obj') ?? null,
      };
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
    // How far this press has travelled, so a turn is not also a selection.
    d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
    setCam((c) => ({
      ...c,
      yaw: d.yaw + (e.clientX - d.x) * 0.008,
      // Clamped short of the poles: at ±π/2 the projection is edge-on and the
      // object vanishes, which reads as a bug however correct it is.
      pitch: Math.min(1.45, Math.max(-1.45, d.pitch - (e.clientY - d.y) * 0.006)),
    }));
  }, []);
  // ── letting go: a press that did not travel is a click on a thing ──
  //
  // Every surface tags its marks with `data-obj="<entity id>"`, so this is the
  // whole of the picking logic and it is the same for all of them. A press
  // that turned the camera is not a selection, and a press on empty paper
  // clears it, which is what empty paper should do.
  const up = useCallback(() => {
    const d = orbit.current;
    orbit.current = null;
    if (!d || d.moved > 4) return;
    setSelected(d.hit && entities.some((x) => x.id === d.hit) ? d.hit : null);
  }, [entities]);

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
    setSelected(null);
    // Deliberately NOT the panel height or full screen: those are the
    // reader's window onto the thing, not part of the thing, and having
    // "reset" collapse the panel they just enlarged is a small betrayal.
  }, [initial, initialCam, layers]);

  // ── changes asked for in words ──
  //
  // Every op has already been checked against the state that was sent (see
  // lib/viz-model.ts parseVizOps): the ids exist and the numbers are inside
  // the ranges. So this applies them and does not second-guess them — except
  // for the camera distance, whose limits belong to THIS surface and are not
  // in the state at all.
  const seen = useRef(-1);
  useEffect(() => {
    if (!ops || ops.seq === seen.current) return;
    seen.current = ops.seq;
    for (const op of ops.ops) {
      if (op.op === 'set') setVals((v) => ({ ...v, [op.id]: op.value }));
      else if (op.op === 'layer') setOn((o) => ({ ...o, [op.id]: op.on }));
      else if (op.op === 'select') setSelected(op.id);
      else if (op.op === 'play') setPlaying(true);
      else if (op.op === 'pause') setPlaying(false);
      else if (op.op === 'reset') reset();
      else if (op.op === 'camera') {
        setCam((c) =>
          op.field === 'dist'
            ? { ...c, dist: Math.min(distRange[1], Math.max(distRange[0], op.value)) }
            : { ...c, [op.field]: op.value }
        );
      }
    }
  }, [ops, reset, distRange]);

  const W = Math.max(140, Math.round(box.w));
  const H = Math.max(90, Math.round(box.h));
  const out = useMemo(
    () => render({ W, H, cam, t, vals, layers: on }),
    [render, W, H, cam, t, vals, on]
  );
  const active = groups.find((g) => g.id === group) ?? groups[0];
  const sel = selected ? entities.find((e) => e.id === selected) ?? null : null;

  // ── the state, when somebody asks for it ──
  //
  // PULLED, NOT PUSHED. The clock advances sixty times a second and a state
  // pushed up on every tick would re-render the whole chat around it for no
  // reader's benefit. What the conversation needs is the state at ONE moment —
  // the moment a message is sent — so the frame hands out a function that
  // reads the current state, and holds the pieces in a ref that every render
  // refreshes. The reply is then answering the picture as it actually stood,
  // not as it stood some number of frames ago.
  const now = useRef({ vals, on, cam, t, playing, out, selected });
  useEffect(() => {
    now.current = { vals, on, cam, t, playing, out, selected };
  });
  const read = useCallback((): VizModelState => {
    const c = now.current;
    const live = c.out.live ?? {};
    const ctls = groups.flatMap((g) => g.ctls);
    return {
      surface,
      title,
      model,
      assumptions,
      equations,
      entities: entities.map((e) => {
        const state = live[e.id];
        return state ? { ...e, state } : e;
      }),
      params: ctls.map((ctl) => {
        const v = c.vals[ctl.id] ?? ctl.min;
        return {
          id: ctl.id,
          label: ctl.label,
          value: v,
          read: ctl.read(v),
          min: ctl.min,
          max: ctl.max,
          ...(ctl.help ? { means: ctl.help } : {}),
        };
      }),
      layers: layers.map((l) => ({ id: l.id, label: l.label, on: c.on[l.id] !== false })),
      camera: { ...c.cam },
      ...(animated
        ? { clock: { t: c.t, playing: c.playing, rate: c.vals.rate ?? 1 } }
        : {}),
      readouts: [c.out.left, c.out.right, c.out.note].filter(Boolean) as string[],
      selected: c.selected,
    };
    // Everything read inside comes from the ref or from props that do not
    // change for the life of a surface, so this function is stable — which is
    // what lets the effect below register it once instead of on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    onRead?.(read);
    return () => onRead?.(null);
  }, [onRead, read]);

  return (
    <div
      ref={shell}
      className={`sfx${full ? ' is-full' : ''}${fill ? ' is-fill' : ''}`}
      style={full || fill ? undefined : ({ ['--sfx-h' as string]: `${tall}px` })}
    >
      <div className="sfx-head">
        <span className="sfx-title">{title}</span>
        <span className="sfx-head-r">
          {/* What "this" means, if they have clicked something. Said out loud
              rather than left as a highlight, because a highlight tells you
              something is selected and not what it is — and the whole point of
              selecting is to be able to ask about it by pronoun. */}
          {sel && (
            <button
              type="button"
              className="sfx-sel"
              onClick={() => setSelected(null)}
              title="Clear the selection"
            >
              <span>{sel.label}</span>
              <i aria-hidden="true">×</i>
            </button>
          )}
          <button type="button" className="sfx-icon" onClick={toggleFull} aria-pressed={full}>
            {full ? 'Exit full screen' : 'Full screen'}
          </button>
        </span>
      </div>
      <p className="sfx-live" aria-live="polite">
        {sel ? `Selected: ${sel.label}. ${sel.meaning}` : ''}
      </p>

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
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="sfx-svg"
          // The selection is marked in one attribute and drawn by one CSS rule
          // (`[data-sel="x"] [data-obj="x"]`), so no surface has to know that
          // selection exists — it only has to say what its marks are.
          data-sel={selected ?? undefined}
        >
          {/* WHY A STYLE TAG AND NOT A CLASS. CSS cannot say "the mark whose
              id matches the one on the svg" — it has no way to compare two
              attributes — and the alternative is for the frame to reach into
              every surface's rendered nodes and add a class, which would make
              selection something each surface has to know about. One rule,
              written for the id that is actually selected, keeps it the
              frame's business alone. The id comes from this surface's own
              entity list and is checked against it, so there is nothing here
              a page could inject into. */}
          {selected && /^[\w-]+$/.test(selected) && (
            <style>{`.sfx-svg[data-sel="${selected}"] [data-obj]:not([data-obj="${selected}"]){opacity:.42}`}</style>
          )}
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
