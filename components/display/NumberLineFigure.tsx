'use client';

// components/display/NumberLineFigure.tsx — a set of numbers, on a line.
//
// Where everything goes is the kind's (lib/objects/display-numberline.ts):
// the window and its ticks, the union of the pieces, their notation. This
// draws it — each piece written on its own row above the line, their union
// on the line itself — with a filled dot for an included end, an open one
// for an excluded end, and an arrow where it runs on for ever. Every change
// is an operation: drag an end along the line (it snaps to half a tick),
// click it to include or exclude it, or use the keyboard — an end is a
// slider (← → move it, Enter or Space includes or excludes it).

import { useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import {
  inequalityOf,
  intervalNotation,
  lineWindow,
  NL_LIMITS,
  sayNum,
  setBuilder,
  unionOf,
  type NLInterval,
  type NumberLineState,
  type Piece,
} from '@/lib/objects/display-numberline';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, useDisplay, type Display } from './DisplayShell';
import { Confirm } from './primitives';

type D = Display<NumberLineState>;

const W = 600;
const PAD = 28;
const ROW = 26;

export function NumberLineFigure(p: FigureProps) {
  const d = useDisplay<NumberLineState>(p);
  const s = d.state;
  const union = unionOf(s);
  return (
    <DisplayShell p={p} d={d} aside={intervalNotation(union)}>
      {s.view === 'notation' ? <Notation s={s} d={d} /> : <Line s={s} d={d} />}
      <dl className="dsp-nl-says">
        <dt>Interval notation</dt>
        <dd>{intervalNotation(union)}</dd>
        <dt>Inequality</dt>
        <dd>{inequalityOf(union, s.variable)}</dd>
        <dt>Set-builder</dt>
        <dd>{setBuilder(union, s.variable)}</dd>
      </dl>
      {d.live && s.intervals.length + s.points.length < NL_LIMITS.pieces * 2 && (
        <AddRow
          label="Add to the set"
          placeholder={`${s.variable} ≤ −1, 2 < ${s.variable} < 5, [2, 5), |${s.variable} − 1| < 3`}
          onAdd={(text) => d.act('add', { text, by: 'person' })}
        />
      )}
    </DisplayShell>
  );
}

interface Drag {
  id: string;
  side: 'lo' | 'hi';
  value: number;
}

/** The line: each piece on a row of its own, their union on the line. */
function Line({ s, d }: { s: NumberLineState; d: D }) {
  // THE LINE HOLDS STILL while it is worked on: the window is recomputed only when an end leaves it,
  // so an end dropped where the pointer let go stays under the pointer
  const fresh = lineWindow(s);
  const kept = useRef(fresh);
  const ends = [...s.intervals.flatMap((i) => [i.lo, i.hi]), ...s.points.map((p) => p.x)].filter((v): v is number => v !== null);
  const k = kept.current;
  if (ends.some((v) => v < k.lo + k.step * 0.5 || v > k.hi - k.step * 0.5) || (ends.length && k.hi - k.lo > (fresh.hi - fresh.lo) * 6)) kept.current = fresh;
  const win = kept.current;
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // a press that moved an end is a drag, not a click: the click that follows it must not include or exclude the end
  const dragged = useRef(false);
  const rows = s.intervals.length + s.points.length;
  const showRows = rows > 1;
  const H = 54 + (showRows ? rows * ROW : 0);
  const axisY = H - 30;
  const x = (v: number) => PAD + ((v - win.lo) / (win.hi - win.lo)) * (W - 2 * PAD);
  const snap = (v: number) => {
    const half = win.step / 2;
    return Math.round(v / half) * half;
  };
  const valueAt = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return null;
    const px = ((clientX - r.left) / r.width) * W;
    return snap(win.lo + ((px - PAD) / (W - 2 * PAD)) * (win.hi - win.lo));
  };
  const shown = (i: NLInterval): NLInterval => (drag && drag.id === i.id ? { ...i, [drag.side]: drag.value } : i);
  const finish = () => {
    if (!drag) return;
    const i = s.intervals.find((q) => q.id === drag.id);
    if (i && i[drag.side] !== drag.value) {
      dragged.current = true;
      d.act('end', { id: drag.id, side: drag.side, value: drag.value });
    }
    setDrag(null);
  };
  const clicked = (i: NLInterval, side: 'lo' | 'hi') => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (live) d.act('open', { id: i.id, side, open: 'toggle' });
  };
  const endKey = (e: KeyboardEvent<SVGElement>, i: NLInterval, side: 'lo' | 'hi') => {
    const v = i[side];
    if (v === null || !d.live) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      d.act('open', { id: i.id, side, open: 'toggle' });
      return;
    }
    const by = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!by) return;
    e.preventDefault();
    d.act('end', { id: i.id, side, value: snap(v + by * (win.step / 2)) });
  };
  const live = d.live;

  return (
    <svg
      ref={svg}
      className="dsp-nl"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Number line: ${inequalityOf(unionOf(s), s.variable)}`}
      onPointerMove={(e) => {
        if (!drag) return;
        const v = valueAt(e.clientX);
        if (v !== null) setDrag({ ...drag, value: v });
      }}
      onPointerUp={finish}
      onPointerLeave={finish}
    >
      {/* the line, its ticks and arrows */}
      <line className="dsp-nl-axis" x1={PAD - 14} x2={W - PAD + 14} y1={axisY} y2={axisY} />
      <path className="dsp-nl-axis-arrow" d={`M${W - PAD + 14} ${axisY} l-7 -4 v8 z`} />
      <path className="dsp-nl-axis-arrow" d={`M${PAD - 14} ${axisY} l7 -4 v8 z`} />
      {win.ticks.map((t) => (
        <g key={t}>
          <line className="dsp-nl-tick" x1={x(t)} x2={x(t)} y1={axisY - 5} y2={axisY + 5} />
          <text className="dsp-nl-ticklabel" x={x(t)} y={axisY + 19} textAnchor="middle">
            {sayNum(t)}
          </text>
        </g>
      ))}
      {/* each piece as written, one row each */}
      {showRows &&
        s.intervals.map((i0, k) => {
          const i = shown(i0);
          const y = 18 + k * ROW;
          return (
            <g key={i.id} className={`dsp-nl-piece${i.by === 'socria' ? ' is-socria' : ''}`}>
              <Segment piece={i} y={y} x={x} win={win} />
              {(['lo', 'hi'] as const).map((side) =>
                i[side] === null ? null : (
                  <circle
                    key={side}
                    className={`dsp-nl-end${(side === 'lo' ? i.loOpen : i.hiOpen) ? ' is-open' : ''}${live ? ' is-live' : ''}`}
                    cx={x(i[side]!)}
                    cy={y}
                    r={6}
                    tabIndex={live ? 0 : -1}
                    role={live ? 'slider' : undefined}
                    aria-label={`${side === 'lo' ? 'Left' : 'Right'} end of ${intervalNotation([i])}, ${(side === 'lo' ? i.loOpen : i.hiOpen) ? 'excluded' : 'included'}`}
                    aria-valuenow={live ? i[side]! : undefined}
                    onKeyDown={(e) => endKey(e, i0, side)}
                    onPointerDown={(e: RPointerEvent<SVGCircleElement>) => {
                      if (!live) return;
                      e.preventDefault();
                      dragged.current = false;
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                      setDrag({ id: i.id, side, value: i[side]! });
                    }}
                    onClick={() => clicked(i0, side)}
                  >
                    <title>{`${sayNum(i[side]!)} — ${(side === 'lo' ? i.loOpen : i.hiOpen) ? 'not included' : 'included'}${live ? '. Drag to move, click to include or exclude.' : ''}`}</title>
                  </circle>
                )
              )}
            </g>
          );
        })}
      {showRows &&
        s.points.map((pt, k) => (
          <circle key={pt.id} className="dsp-nl-end" cx={x(pt.x)} cy={18 + (s.intervals.length + k) * ROW} r={6}>
            <title>{`${s.variable} = ${sayNum(pt.x)}`}</title>
          </circle>
        ))}
      {/* their union, on the line itself */}
      {unionOf({ intervals: s.intervals.map(shown), points: s.points }).map((u, k) => (
        <g key={k} className="dsp-nl-union">
          <Segment piece={u} y={axisY} x={x} win={win} />
          {u.lo !== null && <circle className={`dsp-nl-end is-union${u.loOpen ? ' is-open' : ''}`} cx={x(u.lo)} cy={axisY} r={6.5} />}
          {u.hi !== null && u.hi !== u.lo && <circle className={`dsp-nl-end is-union${u.hiOpen ? ' is-open' : ''}`} cx={x(u.hi)} cy={axisY} r={6.5} />}
          {!showRows &&
            s.intervals.map((i) =>
              (['lo', 'hi'] as const).map((side) =>
                i[side] === null || !live ? null : (
                  <circle
                    key={`${i.id}${side}`}
                    className="dsp-nl-hit"
                    cx={x(shown(i)[side]!)}
                    cy={axisY}
                    r={11}
                    tabIndex={0}
                    role="slider"
                    aria-label={`${side === 'lo' ? 'Left' : 'Right'} end, ${(side === 'lo' ? i.loOpen : i.hiOpen) ? 'excluded' : 'included'}`}
                    aria-valuenow={i[side]!}
                    onKeyDown={(e) => endKey(e, i, side)}
                    onPointerDown={(e: RPointerEvent<SVGCircleElement>) => {
                      e.preventDefault();
                      dragged.current = false;
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                      setDrag({ id: i.id, side, value: i[side]! });
                    }}
                    onClick={() => clicked(i, side)}
                  >
                    <title>{`${sayNum(i[side]!)}. Drag to move, click to include or exclude.`}</title>
                  </circle>
                )
              )
            )}
        </g>
      ))}
      <text className="dsp-nl-var" x={W - PAD + 14} y={axisY - 10} textAnchor="end">
        {s.variable}
      </text>
    </svg>
  );
}

/** A piece's stretch of line, with an arrow where it runs on for ever (and clipped to the window). */
function Segment({ piece, y, x, win }: { piece: Piece; y: number; x: (v: number) => number; win: { lo: number; hi: number } }) {
  const x0 = piece.lo === null ? PAD - 8 : x(Math.max(piece.lo, win.lo));
  const x1 = piece.hi === null ? W - PAD + 8 : x(Math.min(piece.hi, win.hi));
  return (
    <>
      {x1 > x0 && <line className="dsp-nl-seg" x1={x0} x2={x1} y1={y} y2={y} />}
      {piece.lo === null && <path className="dsp-nl-arrow" d={`M${x0 - 6} ${y} l9 -6 v12 z`} />}
      {piece.hi === null && <path className="dsp-nl-arrow" d={`M${x1 + 6} ${y} l-9 -6 v12 z`} />}
    </>
  );
}

/** The pieces written, each with its own notation, and a way to take one away. */
function Notation({ s, d }: { s: NumberLineState; d: D }) {
  const rows = [
    ...s.intervals.map((i) => ({ id: i.id, text: intervalNotation([i]), ineq: inequalityOf([i], s.variable), by: i.by })),
    ...s.points.map((pt) => ({ id: pt.id, text: `{${sayNum(pt.x)}}`, ineq: `${s.variable} = ${sayNum(pt.x)}`, by: pt.by })),
  ];
  if (!rows.length) return <p className="dsp-empty">Nothing on the line yet — write an inequality or an interval below.</p>;
  return (
    <ul className="dsp-nl-list">
      {rows.map((r) => (
        <li key={r.id} className={r.by === 'socria' ? 'is-socria' : ''}>
          <span className="dsp-nl-not">{r.text}</span>
          <span className="dsp-nl-ineq">{r.ineq}</span>
          {d.live && <Confirm label="Remove" ask={`Take ${r.text} off the line?`} onConfirm={() => d.act('remove', { id: r.id })} />}
        </li>
      ))}
    </ul>
  );
}
