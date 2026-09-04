'use client';

// The animated Graph.
//
// This component knows nothing about derivatives, limits or integrals. It
// draws VizObjects and runs a clock over one swept parameter; lib/logos-viz.ts
// decides what those objects are. That split is the whole point — a new
// mathematical idea is a builder there, not a new renderer here.
//
// Everything is plain SVG over the safe evaluator. No plotting library, no
// eval, no layout thrash: one requestAnimationFrame loop sets a number, React
// rebuilds a pure frame from it.
//
// Two things here are the reader's rather than the model's: the window (scroll
// to zoom, drag to pan) and the scene itself (change the expression, change
// the concept). Logos proposes the picture; you own it once it is on screen.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  autoParams,
  CORE_KINDS,
  buildFrame,
  compileScene,
  defaults,
  fmt,
  freeNamesOf,
  KIND_LABEL,
  kindNarrates,
  kindNeedsExpr,
  precisionFor,
  resolveView,
  scaleView,
  RESERVED_PARAM,
  sanitizeViz,
  overlayId,
  overlayLegend,
  sceneDraws,
  sceneSignature,
  SQUARE_KINDS,
  squareView,
  sweepProgress,
  sweepValue,
  sweptParam,
  VIZ_KINDS,
  type Pt,
  type Tone,
  type Viewport,
  type VizKind,
  type VizFrame,
  type PlotExpression,
  type VizObject,
  type VizParam,
  type VizScene,
} from '@/lib/logos-viz';
import { TeX } from './TeX';
import { LogosMark } from './LogosMark';

const TONE: Record<Tone, string> = {
  primary: 'var(--lg-primary)',
  accent: 'var(--lg-accent)',
  tension: 'var(--lg-tension)',
  muted: 'var(--lg-ink-40)',
  ghost: 'var(--lg-ink-24)',
  // The reader's own curves. Distinct from the teaching palette above so it
  // stays obvious which marks are Socria's and which are yours.
  u1: '#7C6A9C',
  u2: '#3F7F6E',
  u3: '#B07C3A',
  u4: '#5A7BA6',
};

/** One full sweep, at 1×. Slow enough to watch, short enough to rewatch. */
const RUN_MS = 7000;
const SPEEDS = [0.5, 1, 2];
/** How far one notch of the wheel zooms. */
const ZOOM_STEP = 1.14;
/** How long after the last keystroke the edited scene is written to the session. */
const PERSIST_MS = 700;

const PAD = { l: 44, r: 22, t: 20, b: 30 };
/** The narration column, when there is room for one beside the plot. */
const NARR_W = 196;
/** Below this the column would squeeze the plot, so the words go underneath. */
const NARR_MIN_W = 700;

type Geom = { view: Viewport; plotW: number; plotH: number };

/** What the editor is holding, as text, so half-typed numbers survive. */
type Draft = { expr: string; kind: VizKind; a: string; b: string; rule: 'left' | 'right' | 'midpoint' };

export function MathViz({
  scene,
  width,
  height,
  guarded,
  onSceneChange,
}: {
  scene: VizScene;
  width: number;
  height: number;
  guarded?: boolean;
  /** Persist an edited scene back to the session, so it survives a reload. */
  onSceneChange?: (scene: VizScene) => void;
}) {
  // ── which scene is live ───────────────────────────────────────────
  // The prop is what Logos extracted; `edited` is what the reader has since
  // done to it. Compared by CONTENT, because a scene object arrives fresh from
  // JSON on every extraction and identity would say the picture changed when
  // nothing about it did — resetting the window and the animation each time a
  // message went past.
  const uid = useId().replace(/:/g, '');
  const [edited, setEdited] = useState<VizScene | null>(null);
  const propKey = sceneSignature(scene);
  useEffect(() => {
    // Logos has proposed something genuinely different. Once an edit has been
    // persisted the incoming scene IS that edit, so clearing here is a no-op
    // rather than a fight over who owns the picture.
    setEdited(null);
    // The editor was drafting the OLD scene, so it closes with it — but only
    // for a scene arriving from OUTSIDE. Keying this on the active scene
    // instead would slam the editor shut on every edit made THROUGH it: add
    // an expression, and the box you typed it into vanishes.
    setDraft(null);
    setError(null);
    setAsked(null);
  }, [propKey]);

  const active = edited ?? scene;
  const activeKey = sceneSignature(active);

  const compiled = useMemo(() => compileScene(active), [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // vectors / matrix / distribution carry their objects directly; for them a
  // null compile is the normal state, not a failure.
  const usable = sceneDraws(active);
  const autoView = useMemo(
    () => (usable ? resolveView(active, compiled) : null),
    [activeKey, compiled, usable] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const swept = useMemo(() => sweptParam(active), [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [vals, setVals] = useState<Record<string, number>>(() => defaults(active));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // ── the window ────────────────────────────────────────────────────
  // Deliberately NOT part of the scene. Panning is a way of looking, not a
  // change to the mathematics, and writing it into the scene on every wheel
  // tick would also resize h and δ, which are derived from the x-window.
  const [pan, setPan] = useState<Viewport | null>(null);
  const rawView = pan ?? autoView;

  const progRef = useRef(0);
  const geomRef = useRef<Geom | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  /** The stage's real pixel box. See the note where W and H are set. */
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; view: Viewport } | null>(null);
  /**
   * Every pointer currently down on the plot, by id.
   *
   * One is a pan. Two is a pinch, and a pinch is the only way to zoom on a
   * touch device: there is no wheel, and the buttons in the corner were
   * hover-revealed, so before this the graph simply could not be zoomed with
   * a finger. Tracked here rather than in dragRef because a pinch has to know
   * about both pointers at once.
   */
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  /** Span and midpoint of the pinch when the second finger landed. */
  const pinchRef = useRef<{ dist: number; view: Viewport; cx: number; cy: number } | null>(null);
  const persistRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A different scene is a different problem: back to its own defaults, its
  // own window, and stopped.
  useEffect(() => {
    setVals(defaults(active));
    setPlaying(false);
    setPan(null);
    const p = sweptParam(active);
    progRef.current = p ? sweepProgress(p, defaults(active)[p.id]) : 0;
  }, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setProgress = useCallback(
    (p: number) => {
      if (!swept) return;
      const clamped = Math.min(1, Math.max(0, p));
      progRef.current = clamped;
      setVals((v) => ({ ...v, [swept.id]: sweepValue(swept, clamped) }));
    },
    [swept]
  );

  // The clock. One rAF loop, driving one number.
  useEffect(() => {
    if (!playing || !swept) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const next = progRef.current + (dt / RUN_MS) * speed;
      if (next >= 1) {
        setProgress(1);
        setPlaying(false); // stop at the limit rather than looping past it
        return;
      }
      setProgress(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, swept, speed, setProgress]);

  const play = useCallback(() => {
    if (progRef.current >= 0.999) setProgress(0);
    setPlaying(true);
  }, [setProgress]);

  const reset = useCallback(() => {
    setPlaying(false);
    setVals(defaults(active));
    progRef.current = swept ? sweepProgress(swept, defaults(active)[swept.id]) : 0;
  }, [activeKey, swept]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = useCallback(
    (dir: -1 | 1) => {
      setPlaying(false);
      setProgress(progRef.current + dir * 0.05);
    },
    [setProgress]
  );

  // ── zoom and pan ──────────────────────────────────────────────────

  /** Client coordinates → data coordinates, through the SVG's own matrix so
   *  the letterboxing from preserveAspectRatio is accounted for exactly. */
  const dataAt = useCallback((clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    const g = geomRef.current;
    if (!svg || !g) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return {
      x: g.view.xMin + ((p.x - PAD.l) / g.plotW) * (g.view.xMax - g.view.xMin),
      y: g.view.yMin + (1 - (p.y - PAD.t) / g.plotH) * (g.view.yMax - g.view.yMin),
    };
  }, []);

  /** Scale the window about a fixed point, which is what keeps the thing under
   *  the cursor under the cursor. */
  const zoomAbout = useCallback((cx: number, cy: number, factor: number) => {
    const g = geomRef.current;
    if (!g) return;
    // scaleView refuses a degenerate window rather than half-applying it, and
    // is shared with the pinch below so both gestures obey the same limits.
    const next = scaleView(g.view, cx, cy, factor);
    if (next) setPan(next);
  }, []);

  /** Zoom on the centre — what the +/− buttons and the keyboard use. */
  const zoomCentre = useCallback(
    (factor: number) => {
      const g = geomRef.current;
      if (!g) return;
      zoomAbout((g.view.xMin + g.view.xMax) / 2, (g.view.yMin + g.view.yMax) / 2, factor);
    },
    [zoomAbout]
  );

  // Wheel zoom, registered by hand: React attaches wheel listeners passively,
  // and without preventDefault the gesture escapes to the page.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!geomRef.current) return;
      e.preventDefault();
      const at = dataAt(e.clientX, e.clientY);
      if (!at) return;
      // Trackpads send many small deltas and mice send few large ones, so the
      // step is proportional rather than fixed.
      const mag = Math.min(3, Math.abs(e.deltaY) / 100 || 1);
      const factor = e.deltaY > 0 ? Math.pow(ZOOM_STEP, mag) : Math.pow(1 / ZOOM_STEP, mag);
      zoomAbout(at.x, at.y, factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dataAt, zoomAbout]);

  /** Screen distance and midpoint between the two live pointers. */
  const pinchGeom = () => {
    const [a, b] = [...ptrs.current.values()];
    if (!a || !b) return null;
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Touch and pen have no meaningful button; only filter real mouse clicks,
    // or a finger (which reports button 0) would be fine but a pen barrel
    // press would silently do nothing.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const g = geomRef.current;
    if (!g) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    } catch {
      // InvalidPointerId — the pointer can be gone by the time this runs.
      // Capture is an improvement (the drag survives leaving the element),
      // not a requirement, and letting it throw here would abort the handler
      // before either the pan or the pinch had been set up.
    }

    if (ptrs.current.size === 2) {
      // A pinch has begun. Drop the pan so the view does not get moved by one
      // finger and scaled by both at the same time.
      dragRef.current = null;
      const pg = pinchGeom();
      const at = pg && dataAt(pg.mx, pg.my);
      if (pg && at) pinchRef.current = { dist: pg.dist, view: g.view, cx: at.x, cy: at.y };
      return;
    }
    if (ptrs.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, view: g.view };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = geomRef.current;
    if (!g) return;
    if (ptrs.current.has(e.pointerId)) {
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // ── two fingers: scale about the point they started around ──
    const pinch = pinchRef.current;
    if (pinch && ptrs.current.size >= 2) {
      const pg = pinchGeom();
      if (!pg || pg.dist < 1 || pinch.dist < 1) return;
      // Spreading enlarges the picture, so the window shrinks — hence the
      // ratio this way round. Measured against where the pinch STARTED, not
      // the last frame, so the scale cannot drift as the fingers move.
      const next = scaleView(pinch.view, pinch.cx, pinch.cy, pinch.dist / pg.dist);
      if (next) setPan(next);
      return;
    }

    // ── one pointer: pan ──
    const d = dragRef.current;
    if (!d) return;
    // Convert the pixel drag into data units through the same matrix the
    // drawing uses, so the graph tracks the cursor exactly rather than
    // approximately.
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const scale = ctm.a || 1;
    const dx = ((e.clientX - d.x) / scale / g.plotW) * (d.view.xMax - d.view.xMin);
    const dy = ((e.clientY - d.y) / scale / g.plotH) * (d.view.yMax - d.view.yMin);
    setPan({
      xMin: d.view.xMin - dx,
      xMax: d.view.xMax - dx,
      yMin: d.view.yMin + dy,
      yMax: d.view.yMax + dy,
    });
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchRef.current = null;
    if (ptrs.current.size === 1) {
      // Lifting one finger of a pinch: hand the survivor a fresh pan origin,
      // or the view would jump by however far the two had travelled together.
      const g = geomRef.current;
      const [only] = [...ptrs.current.values()];
      if (g && only) dragRef.current = { x: only.x, y: only.y, view: g.view };
    } else {
      dragRef.current = null;
    }
    try {
      (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* the pointer may already be gone */
    }
  };

  /**
   * The plot from the keyboard.
   *
   * It was reachable by mouse and by finger and by nothing else: no tabindex,
   * no key handling, and role="img" telling assistive technology it was a
   * picture rather than an instrument. Arrows pan by a tenth of the window,
   * +/- zoom about the centre, and 0 fits — the same three things the mouse
   * can do, which is the bar this had to clear.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      const g = geomRef.current;
      if (!g) return;
      const v = g.view;
      const stepX = (v.xMax - v.xMin) * 0.1;
      const stepY = (v.yMax - v.yMin) * 0.1;
      const move = (dx: number, dy: number) =>
        setPan({ xMin: v.xMin + dx, xMax: v.xMax + dx, yMin: v.yMin + dy, yMax: v.yMax + dy });

      switch (e.key) {
        case 'ArrowLeft': move(-stepX, 0); break;
        case 'ArrowRight': move(stepX, 0); break;
        case 'ArrowUp': move(0, stepY); break;
        case 'ArrowDown': move(0, -stepY); break;
        // '=' is the unshifted key most people actually press for '+'.
        case '+': case '=': zoomCentre(1 / ZOOM_STEP); break;
        case '-': case '_': zoomCentre(ZOOM_STEP); break;
        case '0': setPan(null); break;
        default: return; // anything else belongs to the page
      }
      e.preventDefault();
    },
    [zoomCentre]
  );

  /**
   * Measure the stage rather than predicting it.
   *
   * W and H set the viewBox, and the SVG letterboxes when that shape does not
   * match its container — so getting them wrong does not clip the plot, it
   * shrinks it and centres it in a field of empty space. They used to be the
   * panel's size minus a hardcoded 96px for "the chrome below", plus a few
   * more constants for the sliders and the editor. Every readout, every
   * narration line and every slider added since then made that guess more
   * wrong, and an economics scene with eight readings and three sliders made
   * it wrong by three hundred pixels: the graph you saw was a quarter of the
   * room it had.
   *
   * The observer watches the stage and sets the viewBox to what is actually
   * there. It cannot feed back: the SVG is flex:1/width:100% inside the
   * stage, so its size comes FROM the stage, and changing a viewBox changes
   * no layout.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setStage((prev) =>
        prev && Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
          ? prev
          : { w: r.width, h: r.height }
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── editing the scene ─────────────────────────────────────────────

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** which term the reader has asked about, by id. One at a time. */
  const [asked, setAsked] = useState<string | null>(null);
  // The scene as it stood when the editor opened, and the ONLY thing a draft
  // is resolved against. Building each keystroke against the live scene lets
  // decisions compound: typing "a*sin(b*x)" passes through the moment where
  // the expression is just "a", the variable is adopted as a, and every later
  // keystroke inherits that — so x ends up a slider and a ends up the axis.
  const baseRef = useRef<VizScene>(active);

  const openEditor = () => {
    baseRef.current = active;
    setDraft({
      expr: active.expr,
      kind: active.kind,
      a: typeof active.a === 'number' ? String(active.a) : '',
      b: typeof active.b === 'number' ? String(active.b) : '',
      rule: active.rule ?? 'left',
    });
    setError(null);
  };

  const applyDraft = (next: Draft) => {
    setDraft(next);
    const built = buildScene(next, baseRef.current, active.params);
    if (!built) {
      setError(explain(next.expr, active.varName, next.kind));
      return;
    }
    setError(null);
    setEdited(built);
    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => onSceneChange?.(built), PERSIST_MS);
  };

  useEffect(() => () => { if (persistRef.current) clearTimeout(persistRef.current); }, []);

  // The column is reserved for the whole life of the scene, not just while
  // the animation runs — a panel that appeared on play would resize the plot
  // mid-sentence, which is exactly when you are trying to read it.
  const narrating = usable && kindNarrates(active.kind);
  const asideNarr = narrating && width >= NARR_MIN_W;
  // The stage's own box once it has been measured; the old arithmetic only as
  // the first-paint fallback, before the observer has said anything.
  const W = Math.max(300, stage ? stage.w : width - 32 - (asideNarr ? NARR_W + 12 : 0));
  const H = Math.max(200, stage ? stage.h : height - 260);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  // Where x and y are the same kind of quantity, force a unit to the same
  // number of pixels both ways — otherwise a rotation renders as a shear.
  // Zooming scales both axes together and panning shifts them, so once square
  // the window stays square; re-applying is a no-op.
  const view = useMemo(
    () =>
      rawView && SQUARE_KINDS.has(active.kind)
        ? squareView(rawView, plotW, plotH)
        : rawView,
    [rawView, active.kind, plotW, plotH]
  );

  // ── frame ─────────────────────────────────────────────────────────

  const frame = useMemo(
    () => (usable && view ? buildFrame(active, compiled, vals, view, !!guarded) : null),
    [activeKey, compiled, usable, vals, view, guarded] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Geometry the imperative handlers read. Updated after every render so the
  // wheel listener, which is registered once, never works from a stale window.
  useEffect(() => {
    geomRef.current = view ? { view, plotW, plotH } : null;
  });

  if (!usable || !view || !frame) {
    return (
      <div className="lg-map-empty">
        <span className="lg-map-empty-mark" aria-hidden="true">
          <LogosMark size={46} />
        </span>
        {/* A dead end is the wrong thing here. If the scene we were handed
            cannot be drawn, the way out is to ask for one — and saying so is
            the difference between a panel that looks broken and one that
            tells you what it wants. */}
        <p>No diagram for this yet. Ask for one — &ldquo;draw the PV cycle&rdquo;, &ldquo;plot pH against volume&rdquo;.</p>
      </div>
    );
  }

  const sx = (x: number) => PAD.l + ((x - view.xMin) / (view.xMax - view.xMin)) * plotW;
  const sy = (y: number) =>
    PAD.t + (1 - (y - view.yMin) / (view.yMax - view.yMin || 1)) * plotH;

  const xTicks = ticks(view.xMin, view.xMax);
  const yTicks = ticks(view.yMin, view.yMax);
  // Unique per instance. These were fixed strings, so two plots on one page
  // would define the same clipPath and marker ids twice and every reference
  // would resolve to whichever mounted last — one plot silently drawing with
  // another's clip. Only one renders today; this costs nothing and removes
  // the trap.
  const clipId = `${uid}-clip`;
  const arrowId = `${uid}-arrow`;

  return (
    <div className="lg-viz">
      {active.title && !draft && <p className="lg-viz-title">{active.title}</p>}

      <div className="lg-viz-body">
      <div className="lg-viz-stage" ref={stageRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="lg-viz-svg"
          /* Not role="img": this is pannable, zoomable and now operable from
             the keyboard, and announcing it as a picture told anyone using a
             screen reader that there was nothing here to do. */
          role="group"
          tabIndex={0}
          aria-label={`${active.title || 'Mathematical visualisation'} — arrow keys pan, plus and minus zoom, 0 fits`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          /* A double click is the one gesture everyone already expects to
             mean "put it back", and it is the only way to fit without going
             to the corner. */
          onDoubleClick={() => setPan(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} />
            </clipPath>
            <marker
              id={arrowId}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 7 4 L 0 7 z" fill="currentColor" />
            </marker>
          </defs>

          {/* grid */}
          {xTicks.map((x) => (
            <line key={`gx${x}`} x1={sx(x)} y1={PAD.t} x2={sx(x)} y2={PAD.t + plotH} className="lg-viz-grid" />
          ))}
          {yTicks.map((y) => (
            <line key={`gy${y}`} x1={PAD.l} y1={sy(y)} x2={PAD.l + plotW} y2={sy(y)} className="lg-viz-grid" />
          ))}

          {/* axes */}
          {view.yMin <= 0 && view.yMax >= 0 && (
            <line x1={PAD.l} y1={sy(0)} x2={PAD.l + plotW} y2={sy(0)} className="lg-viz-axis" />
          )}
          {view.xMin <= 0 && view.xMax >= 0 && (
            <line x1={sx(0)} y1={PAD.t} x2={sx(0)} y2={PAD.t + plotH} className="lg-viz-axis" />
          )}

          {/* tick labels */}
          {xTicks.filter((x) => x !== 0).map((x) => (
            <text key={`tx${x}`} x={sx(x)} y={PAD.t + plotH + 16} className="lg-viz-tick" textAnchor="middle">
              {fmt(x, 3)}
            </text>
          ))}
          {yTicks.filter((y) => y !== 0).map((y) => (
            <text key={`ty${y}`} x={PAD.l - 7} y={sy(y) + 3} className="lg-viz-tick" textAnchor="end">
              {fmt(y, 3)}
            </text>
          ))}

          <g clipPath={`url(#${clipId})`}>
            {frame.objects.map((ob) => (
              <Obj
                key={ob.id}
                ob={ob}
                sx={sx}
                sy={sy}
                view={view}
                pad={PAD}
                plotW={plotW}
                plotH={plotH}
                arrowId={arrowId}
              />
            ))}
          </g>
        </svg>

        {/* Sibling of the svg, so the focus-visible rule above can reveal it
            without JavaScript tracking focus. aria-hidden because the same
            words are already in the svg's own label. */}
        <p className="lg-viz-keys" aria-hidden="true">
          ← → ↑ ↓ pan · + − zoom · 0 fit
        </p>

        <div className="lg-viz-zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomCentre(1 / ZOOM_STEP)} aria-label="Zoom in" title="Zoom in">
            +
          </button>
          <button type="button" onClick={() => zoomCentre(ZOOM_STEP)} aria-label="Zoom out" title="Zoom out">
            −
          </button>
          <button
            type="button"
            onClick={() => setPan(null)}
            disabled={!pan}
            aria-label="Fit the view to the scene"
            title="Fit"
          >
            ⤢
          </button>
        </div>
      </div>

        {asideNarr && frame.narration && (
          <Narration text={frame.narration} playing={playing} />
        )}
      </div>

      {!asideNarr && frame.narration && (
        <Narration text={frame.narration} playing={playing} below />
      )}

      {frame.readouts.length > 0 && (
        <div className="lg-viz-readouts">
          {frame.readouts.map((r) => {
            const body = (
              <>
                <TeX tex={r.tex} />
                <i aria-hidden="true">=</i>
                {/* A withheld value is not rendered at all — not hidden with
                    CSS, not present in the DOM. The guard has to hold when
                    someone opens the inspector, or it is theatre. */}
                {r.value === null ? (
                  <b className="lg-viz-held" title="yours to find">
                    ?
                  </b>
                ) : (
                  <b>{r.value}</b>
                )}
              </>
            );
            const cls = `lg-viz-readout${r.value === null ? ' is-held' : ''}`;
            // Notation is only obvious once you already know it. Anything with
            // an explanation becomes a button; anything without stays inert,
            // so the affordance never promises something it cannot deliver.
            return r.help ? (
              <button
                key={r.id}
                type="button"
                className={`${cls} is-askable${asked === r.id ? ' is-asked' : ''}`}
                aria-expanded={asked === r.id}
                title="What is this?"
                onClick={() => setAsked((cur) => (cur === r.id ? null : r.id))}
              >
                {body}
              </button>
            ) : (
              <span key={r.id} className={cls}>
                {body}
              </span>
            );
          })}
        </div>
      )}

      {asked && <Explain frame={frame} scene={active} id={asked} onClose={() => setAsked(null)} />}

      <Controls
        scene={active}
        vals={vals}
        swept={swept}
        playing={playing}
        speed={speed}
        editing={!!draft}
        onPlay={play}
        onPause={() => setPlaying(false)}
        onReset={reset}
        onStep={step}
        onSpeed={setSpeed}
        asked={asked}
        onAsk={(id) => setAsked((cur) => (cur === id ? null : id))}
        onEdit={() => (draft ? setDraft(null) : openEditor())}
        onParam={(id, v) => {
          setPlaying(false);
          setVals((prev) => ({ ...prev, [id]: v }));
          if (swept && id === swept.id) progRef.current = sweepProgress(swept, v);
        }}
      />

      {draft && <Editor draft={draft} error={error} varName={active.varName} onChange={applyDraft} />}

      {(active.overlays?.length || draft) && (
        <Expressions
          scene={active}
          open={!!draft}
          onChange={(overlays) => {
            const next: VizScene = { ...active, overlays };
            // An overlay-only scene with nothing left on it is no scene at
            // all; keep it rather than blanking the surface mid-edit.
            setEdited(next);
            if (persistRef.current) clearTimeout(persistRef.current);
            persistRef.current = setTimeout(() => onSceneChange?.(next), PERSIST_MS);
          }}
        />
      )}

      <p className="lg-viz-caption">{guarded && frame.ask ? frame.ask : frame.caption}</p>
    </div>
  );
}

/**
 * Subtitles for the mathematics: what is happening, in plain words, changing
 * as the picture does.
 *
 * `key` on the paragraph is load-bearing — it remounts the node when the words
 * change, which is what replays the fade. Without it the text would swap in
 * place and the eye would miss that anything had been said.
 *
 * aria-live is polite and only while playing: a screen reader should hear the
 * commentary during an animation, and should not have it read out every time
 * someone nudges a slider.
 */
function Narration({
  text,
  playing,
  below,
}: {
  text: string;
  playing: boolean;
  below?: boolean;
}) {
  return (
    <aside
      className={`lg-viz-narr${below ? ' is-below' : ''}`}
      aria-live={playing ? 'polite' : 'off'}
    >
      <span className="lg-viz-narr-mark" aria-hidden="true" />
      <p key={text}>{text}</p>
    </aside>
  );
}

/**
 * The plain-language answer to "what is this?".
 *
 * Deliberately reads from the FRAME's help text, not from anything computed
 * here: the builders write it, so it stays with the mathematics it describes
 * and cannot drift from it. Help describes what a quantity IS and never what
 * it equals, which is what makes it safe to show while the guard is up — the
 * point of asking is usually that you cannot read the notation yet, and that
 * is not a moment to withhold anything.
 */
function Explain({
  frame,
  scene,
  id,
  onClose,
}: {
  frame: VizFrame;
  scene: VizScene;
  id: string;
  onClose: () => void;
}) {
  const r = frame.readouts.find((x) => x.id === id);
  const p = scene.params.find((x) => x.id === id);
  const tex = r?.tex ?? p?.symbol ?? p?.id;
  const help = r?.help ?? p?.help;
  if (!help) return null;
  return (
    <div className="lg-viz-explain" role="note">
      <span className="lg-viz-explain-term">{tex && <TeX tex={tex} />}</span>
      <p>{help}</p>
      <button type="button" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  );
}

/**
 * What is on the plot, and the smallest set of controls for changing it:
 * show, hide, remove, add. Deliberately a list and not a panel — the plot is
 * the instrument, and this is a margin note about it.
 *
 * Always visible when there are overlays, because a curve you cannot find the
 * switch for is worse than one you never added. The add row appears only with
 * the editor open, so the resting state stays a legend.
 */
function Expressions({
  scene,
  open,
  onChange,
}: {
  scene: VizScene;
  open: boolean;
  onChange: (next: PlotExpression[]) => void;
}) {
  const [adding, setAdding] = useState('');
  const [addErr, setAddErr] = useState(false);
  const rows = overlayLegend(scene);

  const set = (id: string, patch: Partial<PlotExpression>) =>
    onChange((scene.overlays ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const add = () => {
    const expr = adding.trim();
    if (!expr) return;
    const taken = new Set((scene.overlays ?? []).map((o) => o.id));
    const next: PlotExpression[] = [
      ...(scene.overlays ?? []),
      { id: overlayId(expr, taken), expr, visible: true, source: 'user' },
    ];
    // Validation is the sanitizer's, so a typed curve and a spoken one are
    // held to exactly the same standard.
    const ok = sanitizeViz({ ...scene, overlays: next });
    if (!ok?.overlays?.length || ok.overlays.length !== next.length) {
      setAddErr(true);
      return;
    }
    setAddErr(false);
    setAdding('');
    onChange(ok.overlays);
  };

  if (!rows.length && !open) return null;

  return (
    <div className="lg-viz-exprs">
      {rows.map(({ ov, tone, ok }) => (
        <span key={ov.id} className={`lg-viz-expr${ov.visible ? '' : ' is-off'}`}>
          <button
            type="button"
            className="lg-viz-expr-dot"
            style={{ background: ov.visible && ok ? TONE[tone] : 'transparent', borderColor: TONE[tone] }}
            onClick={() => set(ov.id, { visible: !ov.visible })}
            aria-pressed={ov.visible}
            title={ov.visible ? 'Hide' : 'Show'}
          />
          <span className="lg-viz-expr-tex" title={ov.expr}>
            {ok ? <TeX tex={texify(ov.label || ov.expr)} /> : <em>{ov.expr}</em>}
          </span>
          {open && (
            <button
              type="button"
              className="lg-viz-expr-x"
              onClick={() => onChange((scene.overlays ?? []).filter((o) => o.id !== ov.id))}
              aria-label={`Remove ${ov.expr}`}
              title="Remove"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {open && (
        <span className={`lg-viz-expr-add${addErr ? ' is-bad' : ''}`}>
          <input
            value={adding}
            spellCheck={false}
            placeholder="add an expression"
            aria-label="Add an expression to the plot"
            onChange={(e) => {
              setAdding(e.target.value);
              setAddErr(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" onClick={add} disabled={!adding.trim()} aria-label="Add">
            +
          </button>
        </span>
      )}
      {open && rows.length > 0 && (
        <button type="button" className="lg-viz-expr-clear" onClick={() => onChange([])}>
          clear
        </button>
      )}
    </div>
  );
}

/** Plain notation → LaTeX, well enough for a legend chip. */
function texify(src: string): string {
  return src
    .replace(/\*/g, '\\cdot ')
    .replace(/\bpi\b/g, '\\pi ')
    .replace(/\b(sin|cos|tan|ln|log|exp|sqrt|abs)\b/g, '\\$1 ')
    .replace(/\\sqrt\s*\(([^()]*)\)/g, '\\sqrt{$1}')
    .replace(/\^\(([^()]*)\)/g, '^{$1}');
}

// ── the editor ──────────────────────────────────────────────────────

/**
 * Build a scene from what is in the boxes, or null if it does not hold
 * together. Validation is `sanitizeViz` itself rather than a second set of
 * rules that could disagree with it — whatever the extractor is allowed to
 * say, a person is allowed to type, and vice versa.
 */
function buildScene(d: Draft, base: VizScene, liveParams: VizParam[] = []): VizScene | null {
  const kind = d.kind;
  // Adopt the letter they actually used. Typing sin(t) should draw a curve in
  // t, not fail because the previous scene happened to be in x.
  const free = freeNamesOf(d.expr).filter((n) => n !== RESERVED_PARAM[kind]);
  const varName = free.includes(base.varName)
    ? base.varName
    : free.length === 1
      ? free[0]
      : base.varName;

  const num = (t: string) => {
    const v = Number(t.trim());
    return t.trim() !== '' && Number.isFinite(v) ? v : undefined;
  };
  const a = num(d.a);
  const b = num(d.b);

  return sanitizeViz({
    kind,
    expr: d.expr,
    varName,
    view: { xMin: base.view.xMin, xMax: base.view.xMax },
    // Slider ranges come from whatever is on screen, so a range someone
    // widened survives a retype; the variable and the window come from the
    // fixed base, so nothing drifts.
    params: autoParams(d.expr, varName, kind, [...liveParams, ...base.params]),
    ...(a !== undefined ? { a } : {}),
    ...(b !== undefined ? { b } : {}),
    ...(kind === 'riemann' ? { rule: d.rule } : {}),
    // The kinds that carry data rather than an expression keep it across an
    // edit — retyping nothing should not cost someone their matrix.
    ...(kind === base.kind && base.matrix ? { matrix: base.matrix } : {}),
    ...(kind === base.kind && base.vectors ? { vectors: base.vectors } : {}),
    ...(kind === base.kind && base.dist ? { dist: base.dist } : {}),
    ...(kind === base.kind && base.partial ? { partial: base.partial } : {}),
    ...(base.ghost ? { ghost: base.ghost } : {}),
    // The model's title described the model's picture. Once the reader has
    // changed the expression or the concept it is no longer true, and we are
    // in no position to write a new one, so it goes.
  });
}

/** Say what is wrong in the terms they typed it in. */
function explain(expr: string, varName: string, kind: VizKind): string {
  if (!expr.trim()) return 'Type an expression.';
  if (/=/.test(expr)) return 'Just the right-hand side — no “=”.';
  if (/[^a-zA-Z0-9+\-*/^%.,()\s]/.test(expr)) return 'Only + − × ÷ ^ ( ) and the usual functions.';
  const free = freeNamesOf(expr);
  if (!free.length) return 'That is a constant — it needs a variable to be a curve.';
  if (free.length > 1 + MAX_SLIDERS) return 'Too many letters to make sliders for.';
  if (kind === 'riemann') return 'Check the interval: the right end has to be past the left.';
  return 'Could not read that one. Check the brackets and the function names.';
}

const MAX_SLIDERS = 4;

/**
 * Switching concept carries the numbers across, but they have to still make
 * sense on the other side. An integral inherits a = 1 from "the derivative at
 * x = 1" and, without this, gets b = 1 too — an empty interval, which is
 * rejected, so the button appears to do nothing at all.
 */
function forKind(d: Draft, kind: VizKind): Draft {
  const n = (t: string) => {
    const v = Number(t.trim());
    return t.trim() !== '' && Number.isFinite(v) ? v : null;
  };
  if (kind !== 'riemann') return { ...d, kind, a: d.a || '0' };
  const a = n(d.a) ?? 0;
  const b = n(d.b);
  return { ...d, kind, a: String(a), b: b !== null && b > a ? String(b) : String(a + 2) };
}

function eqLabel(kind: VizKind, varName: string): string {
  if (kind === 'ode') return `\\frac{dy}{d${varName}} =`;
  if (kind === 'sequence') return 'a_n =';
  return `f(${varName}) =`;
}

function Editor({
  draft,
  error,
  varName,
  onChange,
}: {
  draft: Draft;
  error: string | null;
  varName: string;
  onChange: (d: Draft) => void;
}) {
  const needsA =
    kindNeedsExpr(draft.kind) &&
    draft.kind !== 'function' &&
    draft.kind !== 'sequence' &&
    draft.kind !== 'ode';
  const needsB = draft.kind === 'riemann';
  const hasExpr = kindNeedsExpr(draft.kind);
  // The four everyone meets first, plus the one on screen when it is not
  // among them — never a wall of ten chips.
  const chips: VizKind[] = CORE_KINDS.includes(draft.kind)
    ? CORE_KINDS
    : [...CORE_KINDS, draft.kind];
  return (
    <div className="lg-viz-editor">
      {hasExpr && (
      <div className="lg-viz-eqrow">
        <span className="lg-viz-eqlab">
          <TeX tex={eqLabel(draft.kind, varName)} />
        </span>
        <input
          className="lg-viz-eq"
          value={draft.expr}
          spellCheck={false}
          autoComplete="off"
          autoFocus
          aria-label="Expression"
          placeholder="x^2 - 3"
          onChange={(e) => onChange({ ...draft, expr: e.target.value })}
        />
      </div>
      )}

      <div className="lg-viz-editrow">
        <span className="lg-viz-kinds" role="group" aria-label="What to show">
          {chips.map((k) => (
            <button
              key={k}
              type="button"
              className={k === draft.kind ? 'is-on' : ''}
              aria-pressed={k === draft.kind}
              onClick={() => onChange(forKind(draft, k))}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </span>

        {needsA && (
          <label className="lg-viz-field">
            <span>{draft.kind === 'riemann' ? 'from' : 'at'}</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft.a}
              aria-label={draft.kind === 'riemann' ? 'Interval start' : 'Point of interest'}
              onChange={(e) => onChange({ ...draft, a: e.target.value })}
            />
          </label>
        )}
        {needsB && (
          <label className="lg-viz-field">
            <span>to</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft.b}
              aria-label="Interval end"
              onChange={(e) => onChange({ ...draft, b: e.target.value })}
            />
          </label>
        )}
        {needsB && (
          <span className="lg-viz-rules" role="group" aria-label="Where each rectangle touches">
            {(['left', 'midpoint', 'right'] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={r === draft.rule ? 'is-on' : ''}
                aria-pressed={r === draft.rule}
                onClick={() => onChange({ ...draft, rule: r })}
              >
                {r === 'midpoint' ? 'mid' : r}
              </button>
            ))}
          </span>
        )}
      </div>

      {error ? (
        <p className="lg-viz-err">{error}</p>
      ) : (
        <p className="lg-viz-hint">
          Any other letter becomes a slider. Scroll the graph to zoom, drag to move.
        </p>
      )}
    </div>
  );
}

// ── one object ──────────────────────────────────────────────────────

function Obj({
  ob,
  sx,
  sy,
  view,
  pad,
  plotW,
  plotH,
  arrowId,
}: {
  ob: VizObject;
  sx: (x: number) => number;
  sy: (y: number) => number;
  view: { xMin: number; xMax: number; yMin: number; yMax: number };
  pad: { l: number; r: number; t: number; b: number };
  plotW: number;
  plotH: number;
  /** the arrow marker belonging to THIS plot — see the note on clipId */
  arrowId: string;
}) {
  const stroke = TONE[ob.tone ?? 'primary'];
  const dash = 'dashed' in ob && ob.dashed ? '4 4' : undefined;

  switch (ob.o) {
    case 'curve':
      return (
        <path
          d={path(ob.pts, sx, sy, view)}
          fill="none"
          stroke={stroke}
          strokeWidth={ob.width ?? 2}
          strokeDasharray={dash}
          className="lg-viz-curve"
        />
      );

    case 'mesh': {
      // Many polylines, one DOM node — a 40-line grid or a 300-dash field
      // would otherwise be hundreds of elements React reconciles per frame.
      let d = '';
      for (const line of ob.lines) {
        for (let i = 0; i < line.length; i++) {
          const X = sx(line[i].x);
          const Y = sy(line[i].y);
          if (!Number.isFinite(X) || !Number.isFinite(Y)) break;
          d += `${i === 0 ? 'M' : 'L'} ${X.toFixed(1)} ${Y.toFixed(1)} `;
        }
      }
      return <path d={d} fill="none" stroke={stroke} strokeWidth={ob.width ?? 1} className="lg-viz-mesh" />;
    }

    case 'region':
      return <path d={`${path(ob.pts, sx, sy, view)} Z`} fill={stroke} opacity={0.12} stroke="none" />;

    case 'segment':
      return (
        <line
          x1={sx(ob.x1)}
          y1={sy(ob.y1)}
          x2={sx(ob.x2)}
          y2={sy(ob.y2)}
          stroke={stroke}
          strokeWidth={ob.width ?? 1.2}
          strokeDasharray={dash}
        />
      );

    case 'line': {
      // Extended to the viewport edges: a tangent that stops at the point of
      // tangency reads as a stick, not as a line with a slope.
      if (!Number.isFinite(ob.slope) || !Number.isFinite(ob.y)) return null;
      const y1 = ob.y + ob.slope * (view.xMin - ob.x);
      const y2 = ob.y + ob.slope * (view.xMax - ob.x);
      return (
        <line
          x1={sx(view.xMin)}
          y1={sy(y1)}
          x2={sx(view.xMax)}
          y2={sy(y2)}
          stroke={stroke}
          strokeWidth={ob.width ?? 1.5}
          strokeDasharray={dash}
          className="lg-viz-line"
        />
      );
    }

    case 'vector':
      return (
        <g style={{ color: stroke }}>
          <line
            x1={sx(ob.x1)}
            y1={sy(ob.y1)}
            x2={sx(ob.x2)}
            y2={sy(ob.y2)}
            stroke={stroke}
            strokeWidth={2}
            markerEnd={`url(#${arrowId})`}
          />
          {ob.label && (
            <text x={sx(ob.x2) + 6} y={sy(ob.y2) - 6} className="lg-viz-lab" fill={stroke}>
              {ob.label}
            </text>
          )}
        </g>
      );

    case 'rects':
      return (
        <g>
          {ob.bars.map((b, i) => {
            const top = Math.min(sy(b.y), sy(0));
            const h = Math.abs(sy(b.y) - sy(0));
            const x = sx(b.x0);
            const w = Math.max(0.5, sx(b.x1) - sx(b.x0));
            if (!Number.isFinite(top) || !Number.isFinite(h)) return null;
            return (
              <rect
                key={i}
                x={x}
                y={top}
                width={w}
                height={h}
                fill={stroke}
                fillOpacity={0.14}
                stroke={stroke}
                strokeOpacity={0.5}
                strokeWidth={w > 3 ? 1 : 0}
                className="lg-viz-bar"
              />
            );
          })}
        </g>
      );

    case 'sequence':
      return (
        <g>
          {ob.pts.map((p, i) =>
            Number.isFinite(p.y) ? (
              <g key={i}>
                {ob.stems && (
                  <line x1={sx(p.x)} y1={sy(0)} x2={sx(p.x)} y2={sy(p.y)} stroke={stroke} strokeWidth={1} opacity={0.4} />
                )}
                <circle cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill={stroke} />
              </g>
            ) : null
          )}
        </g>
      );

    case 'point':
      return (
        <g className="lg-viz-pt">
          <circle
            cx={sx(ob.x)}
            cy={sy(ob.y)}
            r={4.5}
            fill={ob.hollow ? 'var(--lg-paper)' : stroke}
            stroke={stroke}
            strokeWidth={1.8}
          />
          {ob.label && (
            <text x={sx(ob.x) + 8} y={sy(ob.y) - 8} className="lg-viz-lab" fill={stroke}>
              {ob.label}
            </text>
          )}
        </g>
      );

    case 'vrule':
      return (
        <g>
          <line x1={sx(ob.at)} y1={pad.t} x2={sx(ob.at)} y2={pad.t + plotH} stroke={stroke} strokeWidth={1} strokeDasharray={dash} />
          {ob.label && (
            <text x={sx(ob.at) + 5} y={pad.t + 11} className="lg-viz-lab" fill={stroke}>
              {ob.label}
            </text>
          )}
        </g>
      );

    case 'hrule':
      return (
        <g>
          <line x1={pad.l} y1={sy(ob.at)} x2={pad.l + plotW} y2={sy(ob.at)} stroke={stroke} strokeWidth={1} strokeDasharray={dash} />
          {ob.label && (
            <text x={pad.l + plotW - 5} y={sy(ob.at) - 5} className="lg-viz-lab" textAnchor="end" fill={stroke}>
              {ob.label}
            </text>
          )}
        </g>
      );

    case 'label':
      return (
        <text
          x={sx(ob.x)}
          y={sy(ob.y) + (ob.dy ?? 0)}
          className="lg-viz-lab"
          textAnchor={ob.anchor ?? 'start'}
          fill={stroke}
        >
          {ob.text}
        </text>
      );

    default:
      return null;
  }
}

/** Sampled points → a path, lifting the pen across breaks and excursions. */
function path(
  pts: Pt[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  view: { yMin: number; yMax: number }
): string {
  const span = view.yMax - view.yMin;
  let d = '';
  let pen = false;
  for (const p of pts) {
    // A point far outside the window is still on the way somewhere, but
    // joining across a pole would draw a vertical line that isn't there.
    if (!Number.isFinite(p.y) || p.y < view.yMin - span || p.y > view.yMax + span) {
      pen = false;
      continue;
    }
    const X = sx(p.x);
    const Y = sy(p.y);
    if (!Number.isFinite(X) || !Number.isFinite(Y)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'} ${X.toFixed(1)} ${Y.toFixed(1)} `;
    pen = true;
  }
  return d;
}


// ── controls ────────────────────────────────────────────────────────
//
// Present only where they mean something. A scene with no swept parameter gets
// no transport; one with no parameters at all gets no sliders. The difference
// between an instrument and a dashboard is what it declines to show you.

function Controls({
  scene,
  vals,
  swept,
  playing,
  speed,
  editing,
  onPlay,
  onPause,
  onReset,
  onStep,
  onSpeed,
  asked,
  onAsk,
  onEdit,
  onParam,
}: {
  scene: VizScene;
  vals: Record<string, number>;
  swept: ReturnType<typeof sweptParam>;
  playing: boolean;
  speed: number;
  editing: boolean;
  asked: string | null;
  onAsk: (id: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: (dir: -1 | 1) => void;
  onSpeed: (s: number) => void;
  onEdit: () => void;
  onParam: (id: string, v: number) => void;
}) {
  return (
    <div className="lg-viz-controls">
      {swept && (
        <div className="lg-viz-transport">
          {/* Reset, step back, PLAY, step forward — the shuttle order every
              transport uses, with the one control you actually reach for in
              the middle and filled so the eye lands on it first. */}
          <button type="button" onClick={onReset} aria-label="Reset" title="Reset">
            ↺
          </button>
          <button type="button" onClick={() => onStep(-1)} aria-label="Step back" title="Step back">
            ‹
          </button>
          <button
            type="button"
            className="lg-viz-play"
            onClick={playing ? onPause : onPlay}
            aria-label={playing ? 'Pause' : 'Animate'}
            title={playing ? 'Pause' : 'Animate'}
          >
            {playing ? (
              <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
                <rect x="0" y="0" width="3.5" height="12" rx="1" fill="currentColor" />
                <rect x="7.5" y="0" width="3.5" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
                <path d="M0 0 L11 6 L0 12 Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button type="button" onClick={() => onStep(1)} aria-label="Step forward" title="Step forward">
            ›
          </button>
          <span className="lg-viz-speeds" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className={s === speed ? 'is-on' : ''}
                onClick={() => onSpeed(s)}
                aria-pressed={s === speed}
                title={`${s}× speed`}
              >
                {s}×
              </button>
            ))}
          </span>
        </div>
      )}

      {scene.params.length > 0 && (
        <div className="lg-viz-sliders">
          {scene.params.map((p) => (
            <label key={p.id} className="lg-viz-slider">
              {p.help ? (
                <button
                  type="button"
                  className={`lg-viz-sym is-askable${asked === p.id ? ' is-asked' : ''}`}
                  aria-expanded={asked === p.id}
                  title="What does this do?"
                  onClick={(e) => {
                    // the symbol sits inside the slider's <label>, so a click
                    // would otherwise fall through to the range input
                    e.preventDefault();
                    onAsk(p.id);
                  }}
                >
                  <TeX
                    tex={(() => {
                      const sym = p.symbol || p.id;
                      return p.toward ? `${sym} \\to ${p.toward}` : sym;
                    })()}
                  />
                </button>
              ) : (
                <span className="lg-viz-sym">
                  <TeX
                    tex={(() => {
                      const sym = p.symbol || p.id;
                      return p.toward ? `${sym} \\to ${p.toward}` : sym;
                    })()}
                  />
                </span>
              )}
              {/* Value above the track, right-aligned over its own end, so
                  the number sits where the handle is heading rather than
                  crowding the symbol. */}
              <output>
                {/* Precision from the STEP, not a fixed 3. δ steps in
                    thousandths, so three decimals printed 0.001 next to a
                    readout saying 0.0008 — the same number contradicting
                    itself an inch apart — and made the handle look stuck. */}
                {p.integer
                  ? Math.round(vals[p.id] ?? p.value)
                  : fmt(vals[p.id] ?? p.value, precisionFor(p.step))}
              </output>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.integer ? 1 : p.step}
                value={vals[p.id] ?? p.value}
                onChange={(e) => onParam(p.id, Number(e.target.value))}
                aria-label={p.id}
              />
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        className={`lg-viz-editbtn${editing ? ' is-on' : ''}`}
        onClick={onEdit}
        aria-expanded={editing}
        title={editing ? 'Close the editor' : 'Change the equation or what is being shown'}
      >
        {editing ? 'Done' : 'Edit'}
      </button>
    </div>
  );
}

/** Round tick positions across a range, at a human interval. */
function ticks(min: number, max: number): number[] {
  const raw = (max - min) / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  const stepSize = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / stepSize) * stepSize; v <= max; v += stepSize) {
    out.push(Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);
    if (out.length > 40) break;
  }
  return out;
}
