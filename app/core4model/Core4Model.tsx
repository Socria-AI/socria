'use client';

// app/core4model/Core4Model.tsx
//
// The object itself: six planes a turn falls through, stacked along the model's
// own z axis, tilted into perspective and turnable.
//
// WHAT IS IN JAVASCRIPT AND WHAT IS NOT. The motion is CSS keyframes
// (core4model.css) — so it runs with scripting off, sits on the compositor,
// and stays smooth on a phone. This file adds three things and no more:
// dragging to orbit, pausing, and keeping the caption in step with the token.
// Take it away and the page is still the page.
//
// THE CAPTION IS THE ONE PLACE THE TWO HAVE TO AGREE. The token's position is
// a keyframe percentage; the words under it come from PHASES below. A clock
// started at mount and read modulo the loop length is what keeps them together
// — no state per frame, no observer, and it re-syncs on pause because the CSS
// animation and this clock are paused by the same flag.

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long one pass through the model takes. Must match --loop in the CSS. */
const LOOP_MS = 26_000;

/**
 * The stages, and where in the loop each one begins.
 *
 * `at` is the fraction of the loop where the token arrives, and it is also what
 * offsets each plane's highlight animation — so a stage moved here moves in the
 * picture too, rather than drifting out of step with it.
 */
const PHASES = [
  {
    at: 0.03,
    step: 'The message arrives',
    line: 'Everything below happens before a single word of the reply is written.',
  },
  {
    at: 0.14,
    step: '01 \u00B7 Understand',
    line: 'Their own words first, read in code. Then the record, then a cheap model\u2019s reading of the transcript \u2014 in that order of authority, and never the other way round.',
  },
  {
    at: 0.30,
    step: '02 \u00B7 Allocate',
    line: 'Eight dimensions of the thinking, one decision each. Most are Socria\u2019s. The ones that are theirs are reserved before any text exists.',
  },
  {
    at: 0.44,
    step: '03 \u00B7 Intervene',
    line: 'Dozens of paths, one door. Every exit passes through the same function, so there is no route that picks a move and skips the constraint.',
  },
  {
    at: 0.58,
    step: '04 \u00B7 Generate',
    line: 'Now the frontier model writes \u2014 and holds no authority at all. Every constraint on it was settled above.',
  },
  {
    at: 0.70,
    step: '05 \u00B7 The guard refuses it',
    line: 'The draft performed work that was theirs. Nothing has been sent yet, which is the only reason it can still be refused.',
  },
  {
    at: 0.78,
    step: '04 \u00B7 Written again',
    line: 'Back to the model that wrote it. One regeneration \u2014 and the retry is checked as hard as the first draft.',
  },
  {
    at: 0.86,
    step: '05 \u00B7 Through',
    line: 'If the second draft failed too, the reply would be built in code rather than shipped. Nothing unchecked leaves.',
  },
  {
    at: 0.93,
    step: '06 \u00B7 Learn',
    line: 'The ledger, the carried-forward state, this turn\u2019s content-free trace, and the PREVIOUS turn\u2019s outcome written onto its own row.',
  },
] as const;

interface Plane {
  i: number;
  at: number;
  by: 'pure' | 'cheap' | 'front' | 'stop';
  num: string;
  title: string;
  sub: string;
  kind?: 'pillars' | 'choke';
}

/** The dimensions, and what happens to each on a turn where writing is theirs. */
const DIMENSIONS: { id: string; role: 'perform' | 'share' | 'scaffold' | 'human' }[] = [
  { id: 'reason', role: 'share' },
  { id: 'meta', role: 'share' },
  { id: 'judge', role: 'scaffold' },
  { id: 'create', role: 'human' },
  { id: 'find', role: 'perform' },
  { id: 'show', role: 'perform' },
  { id: 'check', role: 'perform' },
  { id: 'do', role: 'perform' },
];

const PLANES: Plane[] = [
  {
    i: 0,
    at: 0.14,
    by: 'pure',
    num: '01',
    title: 'Understand',
    sub: 'their own words first, read in code',
  },
  {
    i: 1,
    at: 0.30,
    by: 'pure',
    num: '02',
    title: 'Allocate',
    sub: 'eight dimensions, a decision for each',
    kind: 'pillars',
  },
  {
    i: 2,
    at: 0.44,
    by: 'stop',
    num: '03',
    title: 'Intervene',
    sub: 'dozens of paths, one door',
    kind: 'choke',
  },
  {
    i: 3,
    at: 0.58,
    by: 'front',
    num: '04',
    title: 'Generate',
    sub: 'the model writes, holding no authority',
  },
  {
    i: 4,
    at: 0.70,
    by: 'stop',
    num: '05',
    title: 'The guard',
    sub: 'overreach, and under-help',
  },
  {
    i: 5,
    at: 0.93,
    by: 'pure',
    num: '06',
    title: 'Learn',
    sub: 'written back before the stream closes',
  },
];

export function Core4Model() {
  const stage = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState(0);
  const [dragging, setDragging] = useState(false);
  // The resting angles, and where a drag leaves them.
  const angles = useRef({ yaw: -26, pitch: 62 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  // Where in the loop the animation is, in ms. Paused time does not count, or
  // the caption would run on while the picture stood still.
  const clock = useRef({ base: 0, at: 0 });

  // ── the caption, kept in step with a token nothing here is driving ──
  useEffect(() => {
    if (paused) return;
    let raf = 0;
    const start = performance.now() - clock.current.at;
    clock.current.base = start;
    const tick = (now: number) => {
      const t = ((now - start) % LOOP_MS) / LOOP_MS;
      clock.current.at = now - start;
      // The last phase whose start has passed.
      let next = 0;
      for (let i = 0; i < PHASES.length; i++) if (t >= PHASES[i].at) next = i;
      setPhase((p) => (p === next ? p : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  const apply = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    el.style.setProperty('--yaw', `${angles.current.yaw}deg`);
    el.style.setProperty('--pitch', `${angles.current.pitch}deg`);
  }, []);

  const onDown = useCallback((e: React.PointerEvent) => {
    // Not from the buttons, which sit over the stage.
    if ((e.target as HTMLElement).closest('.c4m-btn')) return;
    drag.current = { x: e.clientX, y: e.clientY, ...angles.current };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const w = stage.current?.clientWidth || 800;
      const h = stage.current?.clientHeight || 600;
      angles.current = {
        yaw: d.yaw + ((e.clientX - d.x) / w) * 200,
        // Clamped short of flat and of straight down: at 0° the planes are
        // edge-on and the object disappears, at 90° the stack collapses into
        // one rectangle. Neither is a view of anything.
        pitch: Math.min(84, Math.max(16, d.pitch - ((e.clientY - d.y) / h) * 130)),
      };
      apply();
    },
    [apply]
  );

  const onUp = useCallback(() => {
    drag.current = null;
    setDragging(false);
  }, []);

  const reset = useCallback(() => {
    angles.current = { yaw: -26, pitch: 62 };
    apply();
  }, [apply]);

  // Keyboard, because a model you can only turn with a pointer is a model
  // half the people who visit cannot turn at all.
  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 12 : 4;
      const a = angles.current;
      if (e.key === 'ArrowLeft') a.yaw -= step;
      else if (e.key === 'ArrowRight') a.yaw += step;
      else if (e.key === 'ArrowUp') a.pitch = Math.min(84, a.pitch + step);
      else if (e.key === 'ArrowDown') a.pitch = Math.max(16, a.pitch - step);
      else return;
      e.preventDefault();
      apply();
    },
    [apply]
  );

  const now = PHASES[phase];

  return (
    <div className="c4m-stage-wrap" data-paused={paused ? 'true' : 'false'}>
      <div
        ref={stage}
        className={`c4m-stage${dragging ? ' is-dragging' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        tabIndex={0}
        role="img"
        aria-label="A three-dimensional model of one Core 4 turn: six stacked stages — understand, allocate, intervene, generate, guard, learn — with the turn descending through them and being sent back at the guard. The stages are described in full below."
      >
        <div className="c4m-world">
          <div className="c4m-trail" aria-hidden="true" />
          {PLANES.map((p) => (
            <div
              key={p.num}
              className="c4m-plane"
              data-by={p.by}
              style={{ ['--i' as string]: p.i, ['--at' as string]: p.at }}
            >
              <div className="c4m-sign">
                <b>
                  {p.num} {p.title}
                </b>
                <span>{p.sub}</span>
              </div>
              <span className="c4m-num">{p.num}</span>

              {p.kind === 'pillars' && (
                <div className="c4m-pillars" aria-hidden="true">
                  {DIMENSIONS.map((d) => (
                    <div key={d.id} className="c4m-pillar" data-role={d.role}>
                      <span className="c4m-tick">{d.id}</span>
                    </div>
                  ))}
                </div>
              )}

              {p.kind === 'choke' && (
                <div className="c4m-choke" aria-hidden="true">
                  <i /><i /><i /><i />
                  <span>one door</span>
                </div>
              )}
            </div>
          ))}
          <div className="c4m-rider" aria-hidden="true">
            <div className="c4m-token" />
          </div>
        </div>
      </div>

      <div className="c4m-hud">
        <div aria-live="polite">
          <p className="c4m-hud-step">{now.step}</p>
          <p className="c4m-hud-line">{now.line}</p>
        </div>
        <div className="c4m-controls">
          <button type="button" className="c4m-btn" onClick={() => setPaused((p) => !p)}>
            {paused ? 'Play' : 'Pause'}
          </button>
          <button type="button" className="c4m-btn" onClick={reset}>
            Straighten
          </button>
        </div>
      </div>

      <div className="c4m-legend">
        <span><i style={{ background: 'var(--pure)' }} />deterministic code</span>
        <span><i style={{ background: 'var(--cheap)' }} />a cheap model, reading</span>
        <span><i style={{ background: 'var(--front)' }} />the frontier model, writing</span>
        <span><i style={{ background: 'var(--stop)' }} />a door that can close</span>
        <span><i style={{ background: 'var(--human)' }} />reserved for the person</span>
      </div>
    </div>
  );
}
