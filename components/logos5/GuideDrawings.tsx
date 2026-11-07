'use client';
// components/logos5/GuideDrawings.tsx — WHAT LIVE GUIDANCE DRAWS, AND HOW IT LOOKS DRAWN.
//
// Two kinds of drawing, both by hand rather than by machine:
//
//   on the picture   — a loop round the thing, an arrow that bows as a hand sweeps it, the way round drawn as
//                      an arc of the lid, a word on a paper tag with a line to what it names; warm marigold ink
//                      with a dark edge so it reads on any kitchen or cupboard, drawn on as you watch
//   in the card      — a small sketch of the thing and a hand doing the movement, in the manner of a good
//                      instruction sheet: a jar and a hand turning its lid, a finger on a button, a plug pulled
//
// The wobble of every mark comes from lib/guide/sketch.ts, seeded by its object, so it keeps its shape as the
// camera moves.

import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react';
import type { Box, Pt } from '@/lib/guide/overlay';
import type { Placed } from '@/lib/guide/session';
import { arrowPaths, leaderPath, loopPath, tagSpot, tickPath, turnPaths } from '@/lib/guide/sketch';

// ── icons: one stroke weight, round ends ────────────────────────────────

const ICONS: Record<string, ReactNode> = {
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  next: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  replay: (
    <>
      <path d="M5 12.5a7 7 0 1 0 2.2-5.1" />
      <path d="M5.2 4.6v3.6h3.6" />
    </>
  ),
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8.5 6.2v11.6L18 12z" />,
  adjust: (
    <>
      <path d="M12 4v16M4 12h16" />
      <path d="m9.5 6.5 2.5-2.5 2.5 2.5M9.5 17.5 12 20l2.5-2.5M6.5 9.5 4 12l2.5 2.5M17.5 9.5 20 12l-2.5 2.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12S6 6.5 12 6.5 21.2 12 21.2 12 18 17.5 12 17.5 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2.8 12S6 6.5 12 6.5 21.2 12 21.2 12 18 17.5 12 17.5 2.8 12 2.8 12Z" />
      <path d="M4.5 19.5 19.5 4.5" />
    </>
  ),
  flip: (
    <>
      <path d="M4.5 9.5h2.2l1.6-2.2h7.4l1.6 2.2h2.2v9H4.5z" />
      <path d="M9.6 13.6a2.6 2.6 0 0 0 4.6 1.3M14.4 12.6a2.6 2.6 0 0 0-4.6-1.3" />
    </>
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  mic: (
    <>
      <path d="M12 4.2a2.8 2.8 0 0 1 2.8 2.8v4.6a2.8 2.8 0 0 1-5.6 0V7A2.8 2.8 0 0 1 12 4.2Z" />
      <path d="M6.6 11.2a5.4 5.4 0 0 0 10.8 0M12 16.8v3" />
    </>
  ),
  phone: <path d="M6.2 4.5h3l1.5 4-2 1.3a10 10 0 0 0 5.5 5.5l1.3-2 4 1.5v3a1.8 1.8 0 0 1-2 1.8A15.5 15.5 0 0 1 4.4 6.5a1.8 1.8 0 0 1 1.8-2Z" />,
  arrow: <path d="M5 12h13M13 7l5 5-5 5" />,
  camera: (
    <>
      <path d="M4 8.5h3l1.5-2h7l1.5 2h3v10H4z" />
      <circle cx="12" cy="13.2" r="3.2" />
    </>
  ),
  frame: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <circle cx="12" cy="12" r="1.6" />
    </>
  ),
  ask: (
    <>
      <path d="M12 20.5a8.5 8.5 0 1 0-7.3-4.1L4 20l3.6-.8a8.4 8.4 0 0 0 4.4 1.3Z" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8M12 16.3v.1" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg className="lg5-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[name] ?? null}
    </svg>
  );
}

/** A tick drawn on, in one stroke. */
export function Tick({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`lg5-tick ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={tickPath(3, 3.5, 18)} pathLength={1} />
    </svg>
  );
}

// ── on the picture ──────────────────────────────────────────────────────

/** One mark in ink: a dark edge under it so it reads on any picture, both drawn on (or dashed, for a guess). */
function Ink({ d, dashed, delay = 0, cls = '' }: { d: string; dashed?: boolean; delay?: number; cls?: string }) {
  const style = delay ? ({ animationDelay: `${delay}ms` } as CSSProperties) : undefined;
  const k = dashed ? ' is-dashed' : '';
  return (
    <>
      <path className={`lg5-halo${k} ${cls}`} d={d} pathLength={1} style={style} />
      <path className={`lg5-ink${k} ${cls}`} d={d} pathLength={1} style={style} />
    </>
  );
}

export interface Stage {
  w: number;
  h: number;
}

/** A word on the picture: a paper tag, slightly askew, set at (x, y) — above that point, or below it. */
interface Tag {
  key: string;
  x: number;
  y: number;
  text: string;
  below?: boolean;
  right?: boolean;
  unsure?: boolean;
  tilt: number;
}

/** A small sketch card beside its object, for a "model" overlay. */
interface Card {
  key: string;
  x: number;
  y: number;
  model?: string;
  motion?: string;
}

const centre = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const tiltOf = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 7) - 3) * 0.6;
};

/** The marks for one step: strokes in an SVG over the video, and the tags and cards in a layer above it. */
export function CameraMarks({
  placed,
  stage,
  stepKey,
  paused,
  adjusting,
  onDown,
  onMove,
  onUp,
}: {
  placed: Placed[];
  stage: Stage;
  stepKey: string;
  paused: boolean;
  adjusting: boolean;
  onDown: (e: RPointerEvent<SVGElement>, p: Placed) => void;
  onMove: (e: RPointerEvent<SVGElement>) => void;
  onUp: () => void;
}) {
  const strokes: ReactNode[] = [];
  const tags: Tag[] = [];
  const cards: Card[] = [];
  const handles: ReactNode[] = [];

  placed.forEach((p, i) => {
    if (p.mode === 'fallback' || !p.box) return;
    const b = p.box;
    const key = `${stepKey}:${i}`;
    const seed = `${p.object?.id ?? 'pt'}:${p.overlay.kind}`;
    const name = p.object ? p.object.label.toLowerCase() : '';
    const word = p.unsure && p.object ? `I think this is the ${name}` : (p.overlay.text ?? (p.object ? p.object.label : ''));
    const cls = `lg5-o is-${p.overlay.kind}${p.unsure ? ' is-unsure' : ''}${paused ? ' is-paused' : ''}`;

    switch (p.overlay.kind) {
      case 'highlight': {
        strokes.push(
          <g key={key} className={cls}>
            <Ink d={loopPath(b, seed, 8)} dashed={p.unsure} />
          </g>
        );
        if (word) {
          const at = tagSpot(b, stage);
          tags.push({ key, x: at.x, y: at.y, below: at.below, text: word, unsure: p.unsure, tilt: tiltOf(seed) });
        }
        break;
      }
      case 'label': {
        // a dot on the thing, and a line out to a word beside it — to the right, or the left where there is no room
        const dot = { x: b.x + b.w * 0.5, y: b.y + b.h * 0.38 };
        const right = b.x + b.w + 150 < stage.w;
        const t = { x: right ? b.x + b.w + 18 : b.x - 18, y: clamp(b.y - 14, 70, stage.h - 40) };
        const from = { x: t.x + (right ? -4 : 4), y: t.y + 14 };
        strokes.push(
          <g key={key} className={cls}>
            <Ink d={leaderPath(from, dot, seed)} dashed={p.unsure} />
            <circle className="lg5-dot-halo" cx={dot.x} cy={dot.y} r={6.5} />
            <circle className="lg5-dot" cx={dot.x} cy={dot.y} r={4.5} />
          </g>
        );
        if (word) tags.push({ key, x: t.x, y: t.y, below: true, right: !right, text: word, unsure: p.unsure, tilt: tiltOf(seed) });
        break;
      }
      case 'arrow': {
        const c = centre(b);
        const to = p.to ?? c;
        const from = p.to ? c : { x: b.x - 70, y: b.y - 60 };
        const a = arrowPaths(lerp(from, to, p.to ? 0.14 : 0), lerp(from, to, p.to ? 0.86 : 0.92), seed);
        strokes.push(
          <g key={key} className={cls}>
            <Ink d={a.shaft} />
            <Ink d={a.head} delay={420} cls="is-head" />
          </g>
        );
        if (p.overlay.text) tags.push({ key, x: a.mid.x + 10, y: a.mid.y - 8, text: p.overlay.text, tilt: tiltOf(seed) });
        break;
      }
      case 'motion': {
        strokes.push(
          <g key={key} className={cls}>
            {motionMarks(p.overlay.motion ?? 'press', b, seed)}
          </g>
        );
        if (p.overlay.text || p.unsure) {
          tags.push({ key, x: clamp(b.x, 12, stage.w - 160), y: Math.min(stage.h - 36, b.y + b.h + 18), below: true, text: word, unsure: p.unsure, tilt: tiltOf(seed) });
        }
        break;
      }
      case 'model': {
        // beside the thing: to the right where there is room, else to the left; never under the bar at the top
        const w = stage.w < 600 ? 104 : 128;
        const right = b.x + b.w + 16 + w < stage.w - 8;
        const x = right ? b.x + b.w + 16 : Math.max(8, b.x - 16 - w);
        cards.push({ key, x, y: clamp(b.y - 8, 66, stage.h - w - 12), model: p.overlay.model, motion: p.overlay.motion });
        break;
      }
      default:
        break;
    }

    if (adjusting && p.object && p.mode === 'anchored' && p.overlay.kind !== 'model') {
      handles.push(
        <g key={`h:${key}`}>
          <rect className="lg5-handle" x={b.x} y={b.y} width={b.w} height={b.h} rx={10} onPointerDown={(e) => onDown(e, p)} onPointerMove={onMove} onPointerUp={onUp} />
          <g className="lg5-grip" transform={`translate(${b.x + b.w / 2 - 12}, ${b.y + b.h / 2 - 12})`}>
            <circle cx={12} cy={12} r={15} />
            <path d="M12 6v12M6 12h12" />
          </g>
        </g>
      );
    }
  });

  return (
    <>
      <svg className={`lg5-ov${adjusting ? ' is-adjusting' : ''}`} width="100%" height="100%" aria-hidden={!adjusting}>
        {strokes}
        {handles}
      </svg>
      <div className="lg5-marks" aria-hidden="true">
        {tags.map((t) => (
          <span
            key={t.key}
            className={`lg5-tag${t.below ? ' is-below' : ''}${t.right ? ' is-right' : ''}${t.unsure ? ' is-unsure' : ''}`}
            style={{ left: t.x, top: t.y, ['--tilt' as string]: `${t.tilt}deg` }}
          >
            {t.text}
            {t.unsure ? '?' : ''}
          </span>
        ))}
        {cards.map((c) => (
          <div key={c.key} className={`lg5-card${paused ? ' is-paused' : ''}`} style={{ left: c.x, top: c.y }}>
            <HowSketch model={c.model} motion={c.motion} />
          </div>
        ))}
      </div>
    </>
  );
}

/** The movement to make, drawn on the thing. */
function motionMarks(motion: string, b: Box, seed: string): ReactNode {
  const c = centre(b);
  if (motion === 'twist-ccw' || motion === 'twist-cw') {
    // the way round, round the top of the thing, as a lid is seen from a little above
    const rx = Math.max(30, b.w * 0.62);
    const t = turnPaths({ x: c.x, y: b.y + b.h * 0.18 }, rx, Math.max(10, rx * 0.3), motion === 'twist-ccw' ? 'ccw' : 'cw', seed);
    return (
      <>
        <Ink d={t.arc} />
        <Ink d={t.head} delay={520} cls="is-head" />
        <path className="lg5-comet" d={t.arc} pathLength={1} />
      </>
    );
  }
  const reach = clamp(Math.min(b.w, b.h) * 0.7, 48, 110);
  const dir: Record<string, Pt> = { lift: { x: 0, y: -1 }, lower: { x: 0, y: 1 }, 'slide-left': { x: -1, y: 0 }, 'slide-right': { x: 1, y: 0 }, 'slide-up': { x: 0, y: -1 }, 'slide-down': { x: 0, y: 1 } };
  if (dir[motion]) {
    const d = dir[motion];
    // from the edge of the thing, outwards the way it should go
    const edge = { x: c.x + d.x * (b.w / 2 + 6), y: c.y + d.y * (b.h / 2 + 6) };
    const a = arrowPaths(edge, { x: edge.x + d.x * reach, y: edge.y + d.y * reach }, seed);
    return (
      <g className="lg5-nudge" style={{ ['--nx' as string]: `${d.x * 8}px`, ['--ny' as string]: `${d.y * 8}px` }}>
        <Ink d={a.shaft} />
        <Ink d={a.head} delay={380} cls="is-head" />
      </g>
    );
  }
  if (motion === 'squeeze') {
    const l = arrowPaths({ x: b.x - reach * 0.8, y: c.y }, { x: b.x - 6, y: c.y }, `${seed}:l`);
    const r = arrowPaths({ x: b.x + b.w + reach * 0.8, y: c.y }, { x: b.x + b.w + 6, y: c.y }, `${seed}:r`);
    return (
      <g className="lg5-squeeze">
        <Ink d={l.shaft} />
        <Ink d={l.head} delay={360} cls="is-head" />
        <Ink d={r.shaft} />
        <Ink d={r.head} delay={360} cls="is-head" />
      </g>
    );
  }
  if (motion === 'tilt' || motion === 'shake') {
    const rx = Math.max(34, b.w * 0.6);
    const top = b.y - 14;
    const arc = arrowPaths({ x: c.x - rx, y: top + 10 }, { x: c.x + rx, y: top + 10 }, seed);
    const back = arrowPaths({ x: c.x + rx * 0.2, y: top - 4 }, { x: c.x - rx, y: top + 10 }, `${seed}:b`);
    return (
      <g className={motion === 'shake' ? 'lg5-shake' : 'lg5-rock'} style={{ transformOrigin: `${c.x}px ${b.y + b.h}px` }}>
        <Ink d={arc.shaft} />
        <Ink d={arc.head} delay={380} cls="is-head" />
        <Ink d={back.head} delay={380} cls="is-head" />
      </g>
    );
  }
  if (motion === 'push' || motion === 'pull') {
    // rings that close in on it (push) or open out from it (pull)
    const r = Math.max(18, Math.min(b.w, b.h) * 0.28);
    return (
      <g className={`lg5-depth is-${motion}`}>
        {[1, 1.55, 2.1].map((k, j) => (
          <circle key={j} className="lg5-ring" cx={c.x} cy={c.y} r={r * k} style={{ animationDelay: `${j * 0.22}s` }} />
        ))}
      </g>
    );
  }
  // press, tap: where to press, and the press itself as a ripple
  const r = Math.max(14, Math.min(b.w, b.h) * 0.18);
  return (
    <g className="lg5-press">
      <circle className="lg5-ring" cx={c.x} cy={c.y} r={r} />
      <circle className="lg5-ring" cx={c.x} cy={c.y} r={r} style={{ animationDelay: '0.45s' }} />
      <circle className="lg5-dot-halo" cx={c.x} cy={c.y} r={7} />
      <circle className="lg5-dot" cx={c.x} cy={c.y} r={5} />
    </g>
  );
}

// ── in the card: the thing, and a hand doing it ─────────────────────────

/** Which sketch shows a model and a movement best. */
export function sketchFor(model?: string, motion?: string): { kind: string; flip: boolean; reverse: boolean } {
  const m = model ?? '';
  const mo = motion ?? '';
  const flip = mo === 'twist-cw' || mo === 'slide-left';
  if ((m === 'jar' || m === 'bottle') && (mo.startsWith('twist') || !mo)) return { kind: m === 'bottle' ? 'bottle' : 'jar', flip, reverse: false };
  if (m === 'knob' || m === 'screw' || ((!m || m === 'jar' || m === 'bottle') && mo.startsWith('twist'))) return { kind: 'knob', flip, reverse: false };
  if (m === 'lever' || m === 'latch') return { kind: 'lever', flip: false, reverse: mo === 'lift' || mo === 'pull' };
  if (m === 'plug' || m === 'cable') return { kind: 'plug', flip: false, reverse: mo === 'push' };
  if (mo === 'press' || mo === 'tap' || mo === 'push') return { kind: 'press', flip: false, reverse: false };
  if (mo === 'slide-left' || mo === 'slide-right') return { kind: 'slide', flip, reverse: false };
  if (mo === 'squeeze') return { kind: 'squeeze', flip: false, reverse: false };
  if (mo === 'tilt' || mo === 'shake') return { kind: mo, flip: false, reverse: false };
  if (mo === 'pull') return { kind: 'plug', flip: false, reverse: false };
  if (mo === 'lower' || mo === 'slide-down') return { kind: 'lift', flip: false, reverse: true };
  return { kind: 'lift', flip: false, reverse: false };
}

/** The thing, and a hand doing the movement — a little sketch, drawn on, then moving. */
export function HowSketch({ model, motion }: { model?: string; motion?: string }) {
  const { kind, flip, reverse } = sketchFor(model, motion);
  return (
    <svg className={`lg5-sk is-${kind}${reverse ? ' is-reverse' : ''}`} viewBox="0 0 120 120" aria-hidden="true">
      <g transform={flip ? 'translate(120 0) scale(-1 1)' : undefined}>{SKETCHES[kind] ?? SKETCHES.lift}</g>
    </svg>
  );
}

/** A hand from the upper right, its index finger pressing at about (52, 80). */
const PressingHand = (
  <g className="sk-hand">
    <path className="sk-ink" d="M98 27 L117 14 M104 47 L120 39" />
    <path className="sk-skin" d="M47 76 Q46 82 52 83 Q58 83 59 78 L74 46 L63 41 Z" />
    <path className="sk-skin" d="M62 46 Q60 32 72 28 L92 23 Q102 22 104 31 L106 41 Q106 50 97 53 L80 57 Q70 58 66 52 Z" />
    <path className="sk-soft" d="M80 31 Q83 29 86 31" />
    <path className="sk-skin" d="M64 50 Q58 52 58 58 Q59 63 65 62 L76 56" />
  </g>
);

const SKETCHES: Record<string, ReactNode> = {
  jar: (
    <>
      <ellipse className="sk-shadow" cx="60" cy="110" rx="33" ry="4" />
      <path className="sk-fill" d="M33 56 Q33 51 38 51 L82 51 Q87 51 87 56 L89 99 Q89 107 81 108 Q60 111 39 108 Q31 107 31 99 Z" />
      <path className="sk-soft" d="M36 67 L84 67 M36 90 L85 90 M44 75 L70 75 M44 81 L62 81" />
      <path className="sk-acc" d="M31 35 Q31 31 35 31 L85 31 Q89 31 89 35 L89 47 Q89 51 85 51 L35 51 Q31 51 31 47 Z" />
      <g className="sk-hand sk-nudge">
        <path className="sk-ink" d="M97 12 L116 2 M106 27 L122 19" />
        <path className="sk-skin" d="M57 33 Q55 17 68 12 Q80 7 93 9 Q102 11 106 17 L108 25 Q104 31 96 33 Q86 36 77 35 Z" />
        <rect className="sk-skin" x="57" y="24" width="9.5" height="21" rx="4.7" />
        <rect className="sk-skin" x="67" y="23" width="9.5" height="23.5" rx="4.7" />
        <rect className="sk-skin" x="77" y="24" width="9.5" height="22" rx="4.7" />
        <rect className="sk-skin" x="87" y="26" width="8.5" height="18" rx="4.2" />
        <path className="sk-skin" d="M43 31 Q39 36 41.5 41 Q44 45 49 43 L57 37 L55 29 Q49 27 43 31 Z" />
      </g>
      <path className="sk-cue" d="M24 47 Q34 60 60 61 Q86 60 98 46" pathLength={1} />
      <path className="sk-cue sk-cue-head" d="M89 45 L98 46 L97 37" />
    </>
  ),
  bottle: (
    <>
      <ellipse className="sk-shadow" cx="60" cy="110" rx="24" ry="4" />
      <path className="sk-fill" d="M44 62 Q44 54 52 50 L52 42 L68 42 L68 50 Q76 54 76 62 L78 102 Q78 108 71 109 Q60 111 49 109 Q42 108 42 102 Z" />
      <path className="sk-soft" d="M45 76 L75 76 M45 94 L76 94" />
      <rect className="sk-acc" x="49" y="27" width="22" height="16" rx="3.5" />
      <g className="sk-hand sk-nudge">
        <path className="sk-ink" d="M86 10 L106 0 M94 24 L112 16" />
        <path className="sk-skin" d="M58 30 Q57 18 67 14 Q77 10 86 12 Q93 14 96 20 L96 26 Q92 30 85 31 Q76 33 68 33 Z" />
        <rect className="sk-skin" x="59" y="23" width="7.5" height="17" rx="3.7" />
        <rect className="sk-skin" x="67" y="22" width="7.5" height="19" rx="3.7" />
        <rect className="sk-skin" x="75" y="23" width="7.5" height="17" rx="3.7" />
        <path className="sk-skin" d="M47 29 Q44 33 46 37 Q48 40 52 38 L58 34 L57 27 Q52 26 47 29 Z" />
      </g>
      <path className="sk-cue" d="M34 40 Q42 52 60 52 Q78 52 86 39" pathLength={1} />
      <path className="sk-cue sk-cue-head" d="M78 38 L86 39 L86 31" />
    </>
  ),
  knob: (
    <>
      <circle className="sk-acc" cx="60" cy="64" r="27" />
      <circle className="sk-fill" cx="60" cy="64" r="18" />
      <g className="sk-turn">
        <path className="sk-ink" d="M60 50 L60 58" />
        <path className="sk-soft" d="M60 37 L60 41 M79 45 L76 48 M87 64 L83 64 M79 83 L76 80 M60 91 L60 87 M41 83 L44 80 M33 64 L37 64 M41 45 L44 48" />
      </g>
      <rect className="sk-skin" x="24" y="52" width="11" height="25" rx="5.5" />
      <rect className="sk-skin" x="85" y="51" width="11" height="26" rx="5.5" />
      <path className="sk-cue" d="M92 30 Q74 16 52 20 Q36 24 28 36" pathLength={1} />
      <path className="sk-cue sk-cue-head" d="M27 27 L28 36 L37 35" />
    </>
  ),
  press: (
    <>
      <ellipse className="sk-shadow" cx="58" cy="104" rx="38" ry="4" />
      <rect className="sk-fill" x="18" y="70" width="80" height="30" rx="7" />
      <ellipse className="sk-acc" cx="50" cy="82" rx="13" ry="6" />
      <path className="sk-cue sk-ripple" d="M30 76 Q50 66 70 76" />
      <path className="sk-cue sk-ripple is-far" d="M24 70 Q50 56 76 70" />
      <g className="sk-press">{PressingHand}</g>
    </>
  ),
  slide: (
    <>
      <ellipse className="sk-shadow" cx="60" cy="98" rx="44" ry="4" />
      <path className="sk-fill" d="M14 80 L90 80 L104 70 L28 70 Z" />
      <path className="sk-fill" d="M14 80 L90 80 L90 92 L14 92 Z" />
      <path className="sk-fill" d="M90 80 L104 70 L104 82 L90 92 Z" />
      <g className="sk-hand sk-glide">
        <path className="sk-ink" d="M30 62 L12 50 M38 56 L22 42" />
        <path className="sk-skin" d="M28 66 Q26 56 36 53 L70 50 Q79 50 79 55 Q79 59 72 60 L82 60 Q88 61 87 65 Q86 69 80 69 L40 71 Q30 71 28 66 Z" />
        <path className="sk-soft" d="M58 60 L72 60 M56 65 L76 65" />
        <path className="sk-skin" d="M44 54 Q50 46 58 48 Q60 51 56 54" />
      </g>
      <path className="sk-cue" d="M58 34 Q76 30 96 34" pathLength={1} />
      <path className="sk-cue sk-cue-head" d="M88 28 L96 34 L88 40" />
    </>
  ),
  lift: (
    <>
      <ellipse className="sk-shadow" cx="60" cy="106" rx="40" ry="4" />
      <path className="sk-fill" d="M24 62 L82 62 L82 102 L24 102 Z" />
      <path className="sk-fill" d="M82 62 L98 52 L98 92 L82 102 Z" />
      <path className="sk-soft" d="M24 62 L40 52 L98 52" />
      <g className="sk-rise">
        <path className="sk-acc" d="M22 48 L84 48 L84 54 L22 54 Z" />
        <path className="sk-acc" d="M22 48 L38 38 L100 38 L84 48 Z" />
        <path className="sk-acc" d="M84 48 L100 38 L100 44 L84 54 Z" />
      </g>
      <g className="sk-up">
        <path className="sk-cue" d="M60 30 L60 12" />
        <path className="sk-cue" d="M53 19 L60 11 L67 19" />
        <path className="sk-cue is-faint" d="M38 26 L38 16 M82 26 L82 16" />
      </g>
    </>
  ),
  lever: (
    <>
      <ellipse className="sk-shadow" cx="60" cy="104" rx="40" ry="4" />
      <rect className="sk-fill" x="22" y="86" width="76" height="14" rx="4" />
      <circle className="sk-fill" cx="40" cy="82" r="7" />
      <g className="sk-lever">
        <rect className="sk-acc" x="38" y="78" width="56" height="8" rx="4" transform="rotate(-24 40 82)" />
        <g transform="translate(38 -14) rotate(-10 52 80)">{PressingHand}</g>
      </g>
      <path className="sk-cue" d="M106 52 Q112 66 104 78" pathLength={1} />
      <path className="sk-cue sk-cue-head" d="M99 71 L104 78 L111 72" />
    </>
  ),
  plug: (
    <>
      <rect className="sk-fill" x="12" y="34" width="34" height="52" rx="7" />
      <path className="sk-ink" d="M24 52 L24 60 M34 52 L34 60" />
      <g className="sk-out">
        <rect className="sk-acc" x="54" y="46" width="22" height="26" rx="5" />
        <path className="sk-ink" d="M54 54 L47 54 M54 64 L47 64" />
        <path className="sk-ink" d="M76 59 Q94 60 100 74 Q106 88 120 90" />
        <rect className="sk-skin" x="58" y="36" width="10" height="16" rx="5" />
        <rect className="sk-skin" x="58" y="66" width="10" height="16" rx="5" />
      </g>
      <path className="sk-cue" d="M72 24 L98 24" pathLength={1} />
      <path className="sk-cue sk-cue-head" d="M91 18 L99 24 L91 30" />
    </>
  ),
  squeeze: (
    <>
      <ellipse className="sk-shadow" cx="60" cy="104" rx="26" ry="4" />
      <g className="sk-squash">
        <path className="sk-fill" d="M48 30 L72 30 Q74 50 78 70 Q82 98 74 100 L46 100 Q38 98 42 70 Q46 50 48 30 Z" />
        <rect className="sk-acc" x="50" y="20" width="20" height="10" rx="3" />
      </g>
      <path className="sk-cue" d="M14 66 L34 66 M27 59 L35 66 L27 73" />
      <path className="sk-cue" d="M106 66 L86 66 M93 59 L85 66 L93 73" />
    </>
  ),
  tilt: (
    <>
      <ellipse className="sk-shadow" cx="60" cy="106" rx="24" ry="4" />
      <g className="sk-rock">
        <path className="sk-fill" d="M48 46 Q48 38 54 36 L54 28 L66 28 L66 36 Q72 38 72 46 L72 100 Q72 104 68 104 L52 104 Q48 104 48 100 Z" />
        <rect className="sk-acc" x="52" y="20" width="16" height="9" rx="3" />
      </g>
      <path className="sk-cue" d="M30 34 Q60 10 90 34 M29 25 L30 34 L39 33 M81 33 L90 34 L91 25" />
    </>
  ),
  shake: (
    <>
      <ellipse className="sk-shadow" cx="60" cy="106" rx="24" ry="4" />
      <g className="sk-shake">
        <path className="sk-fill" d="M48 46 Q48 38 54 36 L54 28 L66 28 L66 36 Q72 38 72 46 L72 100 Q72 104 68 104 L52 104 Q48 104 48 100 Z" />
        <rect className="sk-acc" x="52" y="20" width="16" height="9" rx="3" />
      </g>
      <path className="sk-cue" d="M30 50 L18 50 M30 64 L14 64 M30 78 L18 78 M90 50 L102 50 M90 64 L106 64 M90 78 L102 78" />
    </>
  ),
};

// ── before the camera: what it is ───────────────────────────────────────

/** A phone looking at a jar, Socria's marks on the picture — what Live guidance is, drawn. */
export function IntroSketch() {
  return (
    <svg className="lg5-intro-art" viewBox="0 0 280 160" aria-hidden="true">
      <ellipse className="sk-shadow" cx="196" cy="148" rx="46" ry="5" />
      <path className="sk-fill" d="M168 92 Q168 87 173 87 L219 87 Q224 87 224 92 L226 136 Q226 144 218 145 Q196 148 174 145 Q166 144 166 136 Z" />
      <path className="sk-acc" d="M166 72 Q166 68 170 68 L222 68 Q226 68 226 72 L226 84 Q226 88 222 88 L170 88 Q166 88 166 84 Z" />
      <path className="sk-soft" d="M174 104 L218 104 M174 126 L218 126" />
      <g transform="rotate(-8 80 82)">
        <rect className="sk-fill" x="34" y="14" width="92" height="140" rx="14" />
        <rect className="sk-screen" x="42" y="26" width="76" height="116" rx="6" />
        <path className="sk-onscreen" d="M60 104 Q60 100 64 100 L96 100 Q100 100 100 104 L101 130 Q101 136 95 137 Q80 139 65 137 Q59 136 59 130 Z" />
        <path className="sk-onscreen-lid" d="M59 88 Q59 85 62 85 L98 85 Q101 85 101 88 L101 97 Q101 100 98 100 L62 100 Q59 100 59 97 Z" />
        <path className="sk-mark" pathLength={1} d="M52 84 Q50 74 66 72 Q86 70 102 76 Q112 82 106 96 Q100 104 82 104 Q60 104 54 96 Q50 90 56 84" />
        <path className="sk-mark is-later" pathLength={1} d="M52 108 Q60 116 82 116 Q102 116 110 104" />
        <path className="sk-mark is-head" pathLength={1} d="M103 104 L110 104 L110 97" />
        <g className="sk-label">
          <rect x="50" y="48" width="44" height="16" rx="5" />
          <text x="56" y="60">the lid</text>
        </g>
        <circle className="sk-dotbtn" cx="80" cy="149" r="3" />
      </g>
    </svg>
  );
}
