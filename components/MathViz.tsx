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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildFrame,
  compileScene,
  defaults,
  fmt,
  resolveView,
  sweepProgress,
  sweepValue,
  sweptParam,
  type Pt,
  type Tone,
  type VizObject,
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
};

/** One full sweep, at 1×. Slow enough to watch, short enough to rewatch. */
const RUN_MS = 7000;
const SPEEDS = [0.5, 1, 2];

export function MathViz({
  scene,
  width,
  height,
  guarded,
}: {
  scene: VizScene;
  width: number;
  height: number;
  guarded?: boolean;
}) {
  // The compiled expression and the viewport are fixed for the life of the
  // scene. Recomputing the window per frame would let it breathe as the
  // parameter moves, which hides the very motion this exists to show.
  const compiled = useMemo(() => compileScene(scene), [scene]);
  const view = useMemo(
    () => (compiled ? resolveView(scene, compiled) : null),
    [scene, compiled]
  );

  const swept = useMemo(() => sweptParam(scene), [scene]);
  const [vals, setVals] = useState<Record<string, number>>(() => defaults(scene));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Progress along the swept parameter, 0 → 1. Held in a ref as well as state
  // because the animation loop reads it every frame and must not close over a
  // stale render.
  const progRef = useRef(swept ? sweepProgress(swept, defaults(scene)[swept.id]) : 0);

  // A new scene is a new problem: reset rather than carrying the old h across.
  useEffect(() => {
    setVals(defaults(scene));
    setPlaying(false);
    const p = sweptParam(scene);
    progRef.current = p ? sweepProgress(p, defaults(scene)[p.id]) : 0;
  }, [scene]);

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
    // Replaying from the end should start over, not sit there finished.
    if (progRef.current >= 0.999) setProgress(0);
    setPlaying(true);
  }, [setProgress]);

  const reset = useCallback(() => {
    setPlaying(false);
    setVals(defaults(scene));
    progRef.current = swept ? sweepProgress(swept, defaults(scene)[swept.id]) : 0;
  }, [scene, swept]);

  const step = useCallback(
    (dir: -1 | 1) => {
      setPlaying(false);
      setProgress(progRef.current + dir * 0.05);
    },
    [setProgress]
  );

  const frame = useMemo(
    () => (compiled && view ? buildFrame(scene, compiled, vals, view, !!guarded) : null),
    [scene, compiled, vals, view, guarded]
  );

  if (!compiled || !view || !frame) {
    return (
      <div className="lg-map-empty">
        <span className="lg-map-empty-mark" aria-hidden="true">
          <LogosMark size={46} />
        </span>
        <p>Nothing to draw here yet.</p>
      </div>
    );
  }

  const pad = { l: 44, r: 22, t: 20, b: 30 };
  const W = Math.max(300, width - 32);
  const H = Math.max(220, height - (swept || scene.params.length ? 150 : 96));
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const sx = (x: number) => pad.l + ((x - view.xMin) / (view.xMax - view.xMin)) * plotW;
  const sy = (y: number) =>
    pad.t + (1 - (y - view.yMin) / (view.yMax - view.yMin || 1)) * plotH;

  const xTicks = ticks(view.xMin, view.xMax);
  const yTicks = ticks(view.yMin, view.yMax);

  // Clip everything to the plot box so a steep secant or a tall bar cannot
  // draw over the axis labels.
  const clipId = 'lgviz-clip';

  return (
    <div className="lg-viz">
      {scene.title && <p className="lg-viz-title">{scene.title}</p>}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="lg-viz-svg"
        role="img"
        aria-label={scene.title || 'Mathematical visualisation'}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={pad.l} y={pad.t} width={plotW} height={plotH} />
          </clipPath>
          <marker
            id="lgviz-arrow"
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
          <line key={`gx${x}`} x1={sx(x)} y1={pad.t} x2={sx(x)} y2={pad.t + plotH} className="lg-viz-grid" />
        ))}
        {yTicks.map((y) => (
          <line key={`gy${y}`} x1={pad.l} y1={sy(y)} x2={pad.l + plotW} y2={sy(y)} className="lg-viz-grid" />
        ))}

        {/* axes */}
        {view.yMin <= 0 && view.yMax >= 0 && (
          <line x1={pad.l} y1={sy(0)} x2={pad.l + plotW} y2={sy(0)} className="lg-viz-axis" />
        )}
        {view.xMin <= 0 && view.xMax >= 0 && (
          <line x1={sx(0)} y1={pad.t} x2={sx(0)} y2={pad.t + plotH} className="lg-viz-axis" />
        )}

        {/* tick labels */}
        {xTicks.filter((x) => x !== 0).map((x) => (
          <text key={`tx${x}`} x={sx(x)} y={pad.t + plotH + 16} className="lg-viz-tick" textAnchor="middle">
            {fmt(x, 2)}
          </text>
        ))}
        {yTicks.filter((y) => y !== 0).map((y) => (
          <text key={`ty${y}`} x={pad.l - 7} y={sy(y) + 3} className="lg-viz-tick" textAnchor="end">
            {fmt(y, 2)}
          </text>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {frame.objects.map((ob) => (
            <Obj key={ob.id} ob={ob} sx={sx} sy={sy} view={view} pad={pad} plotW={plotW} plotH={plotH} />
          ))}
        </g>
      </svg>

      {frame.readouts.length > 0 && (
        <div className="lg-viz-readouts">
          {frame.readouts.map((r) => (
            <span key={r.id} className={`lg-viz-readout${r.value === null ? ' is-held' : ''}`}>
              <TeX tex={r.tex} />
              <i aria-hidden="true">=</i>
              {/* A withheld value is not rendered at all — not hidden with CSS,
                  not present in the DOM. The guard has to hold when someone
                  opens the inspector, or it is theatre. */}
              {r.value === null ? (
                <b className="lg-viz-held" title="yours to find">
                  ?
                </b>
              ) : (
                <b>{r.value}</b>
              )}
            </span>
          ))}
        </div>
      )}

      <Controls
        scene={scene}
        vals={vals}
        swept={swept}
        playing={playing}
        speed={speed}
        onPlay={play}
        onPause={() => setPlaying(false)}
        onReset={reset}
        onStep={step}
        onSpeed={setSpeed}
        onParam={(id, v) => {
          setPlaying(false);
          setVals((prev) => ({ ...prev, [id]: v }));
          if (swept && id === swept.id) progRef.current = sweepProgress(swept, v);
        }}
      />

      <p className="lg-viz-caption">
        {guarded && frame.ask ? frame.ask : frame.caption}
      </p>
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
}: {
  ob: VizObject;
  sx: (x: number) => number;
  sy: (y: number) => number;
  view: { xMin: number; xMax: number; yMin: number; yMax: number };
  pad: { l: number; r: number; t: number; b: number };
  plotW: number;
  plotH: number;
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
            markerEnd="url(#lgviz-arrow)"
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
// Present only where they mean something. A scene with no parameters gets no
// control bar at all, which is the difference between an instrument and a
// dashboard.

function Controls({
  scene,
  vals,
  swept,
  playing,
  speed,
  onPlay,
  onPause,
  onReset,
  onStep,
  onSpeed,
  onParam,
}: {
  scene: VizScene;
  vals: Record<string, number>;
  swept: ReturnType<typeof sweptParam>;
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: (dir: -1 | 1) => void;
  onSpeed: (s: number) => void;
  onParam: (id: string, v: number) => void;
}) {
  if (!scene.params.length) return null;

  return (
    <div className="lg-viz-controls">
      {swept && (
        <div className="lg-viz-transport">
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
            <span>{playing ? 'Pause' : 'Animate'}</span>
          </button>
          <button type="button" onClick={() => onStep(-1)} aria-label="Step back" title="Step back">
            ‹
          </button>
          <button type="button" onClick={() => onStep(1)} aria-label="Step forward" title="Step forward">
            ›
          </button>
          <button type="button" onClick={onReset} aria-label="Reset" title="Reset">
            ↺
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

      <div className="lg-viz-sliders">
        {scene.params.map((p) => (
          <label key={p.id} className="lg-viz-slider">
            <span className="lg-viz-sym">
              <TeX tex={(() => {
                const sym = p.symbol || p.id;
                return p.toward ? `${sym} \\to ${p.toward}` : sym;
              })()} />
            </span>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.integer ? 1 : p.step}
              value={vals[p.id] ?? p.value}
              onChange={(e) => onParam(p.id, Number(e.target.value))}
              aria-label={p.id}
            />
            <output>{p.integer ? Math.round(vals[p.id] ?? p.value) : fmt(vals[p.id] ?? p.value, 3)}</output>
          </label>
        ))}
      </div>
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
