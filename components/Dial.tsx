'use client';
// components/Dial.tsx — one dial: three ordered positions, the middle one the
// default. Logos 5's length setting is drawn with it (components/logos5/
// ConcisePicker.tsx); its styles are the composer sheet's (.mp-dial in
// app/app-shell.css).

import { type CSSProperties } from 'react';
import '@/app/app-shell.css';

/**
 * One dial: three ordered positions, the middle one the default.
 *
 * IT IS A REAL RANGE INPUT. Three buttons styled as a track would have needed
 * arrow keys, Home/End, a focus ring and a value announcement written by hand,
 * and would have got at least one of them wrong. `input[type=range]` arrives
 * with all of it — drag, click, arrow keys, page keys, both ends — and CSS
 * makes it look like the control it already behaves as. `aria-valuetext` is
 * the one addition: without it a screen reader says "1 of 3", which is a
 * position, not a setting.
 *
 * The stop labels under the track are a mouse affordance only, and are hidden
 * from the accessibility tree: they duplicate the slider rather than adding
 * anything to it, and two controls for one value read as two values.
 */
export function Dial<T extends string>({
  name,
  options,
  value,
  onPick,
}: {
  name: string;
  options: ReadonlyArray<{ id: T; label: string; description: string }>;
  value: T;
  onPick: (next: T) => void;
}) {
  const at = Math.max(0, options.findIndex((o) => o.id === value));
  const now = options[at] ?? options[0];
  const last = options.length - 1;
  return (
    <div className="mp-dial">
      <input
        type="range"
        className="mp-range"
        min={0}
        max={last}
        step={1}
        value={at}
        aria-label={name}
        aria-valuetext={now.label}
        // The fill stops under the knob rather than running the whole track:
        // a dial whose left half is coloured at the middle position reads as
        // "half way up", and the middle position is not half of anything —
        // it is the default.
        style={{ '--at': `${(at / last) * 100}%` } as CSSProperties}
        // The sheet deliberately stays open. There are two dials here, and
        // closing on the first move would mean reopening to make the second.
        onChange={(e) => onPick(options[Number(e.target.value)]?.id ?? value)}
      />
      <div className="mp-stops" aria-hidden="true">
        {options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            tabIndex={-1}
            className={`mp-stop${o.id === value ? ' on' : ''}`}
            style={{ left: `${(i / last) * 100}%` }}
            onClick={() => onPick(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {/* The sentence belongs to the position the dial is at, and changes with
          it: a static list of all three would put the reader back to reading
          three sentences, which is what the dial replaced. */}
      <p className="mp-dial-does">{now.description}</p>
    </div>
  );
}
