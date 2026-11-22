'use client';
// components/ux-v0/MotionPanel.tsx — the design's motion, edited on the canvas.
//
// Every control writes the design's own motion (spec.look.motion) through a "look" patch: one version per
// change, Undo takes it back, a motion kept in the art direction or locked in the Creative DNA is asked about
// first (the Workspace checks). Nothing here is a mock: the CSS layer (lib/ux-v0/motion.ts) and the scripted
// layer (lib/ux-v0/motion-runtime.ts) read exactly these values, in Preview and in the exported page.

import { useEffect, useState } from 'react';
import { EASE_LABEL, ENTRANCE_LABEL, HEADLINE_LABEL, HOVER_LABEL, MOTION_LABEL, motionFor } from '@/lib/ux-v0/motion';
import { EASES, ENTRANCES, HEADLINES, HOVERS, MOTION_FEELS, type Motion } from '@/lib/ux-v0/spec';

interface Props {
  motion: Motion;
  disabled?: boolean;
  onChange: (next: Partial<Motion>, label: string) => void;
}

/** A range drawn as it moves, applied once when let go: one version, not one per pixel. */
function Range({ label, min, max, step = 1, value, unit, disabled, onCommit }: { label: string; min: number; max: number; step?: number; value: number; unit: string; disabled?: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  return (
    <label className="mp-row">
      <span className="mp-l">{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} disabled={disabled} onChange={(e) => setV(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} aria-valuetext={`${v}${unit}`} />
      <span className="mp-v">
        {v}
        {unit}
      </span>
    </label>
  );
}

function Pick<T extends string>({ label, value, options, names, disabled, onPick }: { label: string; value: T; options: readonly T[]; names: Record<string, string>; disabled?: boolean; onPick: (v: T) => void }) {
  return (
    <label className="mp-row">
      <span className="mp-l">{label}</span>
      <select className="v0-select" value={value} disabled={disabled} onChange={(e) => onPick(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {names[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, on, disabled, onToggle }: { label: string; on: boolean; disabled?: boolean; onToggle: (on: boolean) => void }) {
  return (
    <button type="button" className={`mp-toggle${on ? ' is-on' : ''}`} aria-pressed={on} disabled={disabled} onClick={() => onToggle(!on)}>
      {label}
    </button>
  );
}

export function MotionPanel({ motion: m, disabled, onChange }: Props) {
  const still = m.feel === 'still';
  return (
    <div className="mp" role="group" aria-label="Motion">
      <p className="v0-adjust-l">How the design moves. Each change is a version Undo takes back; it plays in Preview and in the exported page, and not at all for people who ask their device for reduced motion.</p>
      <div className="mp-row">
        <span className="mp-l">Feel</span>
        <span className="sb-seg is-tight" role="radiogroup" aria-label="Feel">
          {MOTION_FEELS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={m.feel === f} className={`sb-seg-item${m.feel === f ? ' is-on' : ''}`} disabled={disabled} onClick={() => m.feel !== f && onChange(motionFor(f), `${MOTION_LABEL[f].toLowerCase()} motion`)}>
              {MOTION_LABEL[f]}
            </button>
          ))}
        </span>
      </div>
      {!still && (
        <>
          <Range label="Duration" min={200} max={1600} step={20} value={m.duration} unit=" ms" disabled={disabled} onCommit={(v) => onChange({ duration: v }, `arrivals over ${v} ms`)} />
          <Range label="Stagger" min={0} max={200} step={5} value={m.stagger} unit=" ms" disabled={disabled} onCommit={(v) => onChange({ stagger: v }, `${v} ms between items`)} />
          <Range label="Travel" min={0} max={80} value={m.distance} unit=" px" disabled={disabled} onCommit={(v) => onChange({ distance: v }, `arrivals travelling ${v} px`)} />
          <Pick label="Easing" value={m.ease} options={EASES} names={EASE_LABEL} disabled={disabled} onPick={(v) => onChange({ ease: v }, `${EASE_LABEL[v].toLowerCase()} easing`)} />
          <Pick label="Headline" value={m.headline} options={HEADLINES} names={HEADLINE_LABEL} disabled={disabled} onPick={(v) => onChange({ headline: v }, `the headline: ${HEADLINE_LABEL[v].toLowerCase()}`)} />
          <Pick label="Arrivals" value={m.entrance} options={ENTRANCES} names={ENTRANCE_LABEL} disabled={disabled} onPick={(v) => onChange({ entrance: v }, `arrivals: ${ENTRANCE_LABEL[v].toLowerCase()}`)} />
          <Pick label="Hover" value={m.hover} options={HOVERS} names={HOVER_LABEL} disabled={disabled} onPick={(v) => onChange({ hover: v }, `hover: ${HOVER_LABEL[v].toLowerCase()}`)} />
          <Range label="Parallax" min={0} max={3} value={m.parallax} unit="" disabled={disabled} onCommit={(v) => onChange({ parallax: v }, v ? `parallax depth ${v}` : 'no parallax')} />
          <div className="mp-row">
            <span className="mp-l">Opening</span>
            <span className="sb-seg is-tight" role="radiogroup" aria-label="The opening as the page scrolls">
              {(['None', 'Gentle', 'Pronounced'] as const).map((n, i) => (
                <button key={n} type="button" role="radio" aria-checked={(m.scrub ?? 0) === i} className={`sb-seg-item${(m.scrub ?? 0) === i ? ' is-on' : ''}`} disabled={disabled} onClick={() => (m.scrub ?? 0) !== i && onChange({ scrub: i }, i ? `the opening transformed by the scroll (${n.toLowerCase()})` : 'the opening still as the page scrolls')}>
                  {n}
                </button>
              ))}
            </span>
          </div>
          <Pick label="Pictures" value={m.media ?? 'none'} options={['none', 'mask', 'scale'] as const} names={{ none: 'As they are', mask: 'Mask reveal', scale: 'Settle in scale' }} disabled={disabled} onPick={(v) => onChange({ media: v }, v === 'none' ? 'pictures as they are' : v === 'mask' ? 'pictures revealed through a mask' : 'pictures settling in scale')} />
          <div className="mp-toggles">
            <Toggle label="Pin a sequence as a story" on={!!m.story} disabled={disabled} onToggle={(on) => onChange({ story: on }, on ? 'one sequence told as a pinned story' : 'no pinned story')} />
            <Toggle label="Magnetic buttons" on={!!m.magnetic} disabled={disabled} onToggle={(on) => onChange({ magnetic: on }, on ? 'buttons drawn to the pointer' : 'buttons that stay put')} />
            <Toggle label="Tilt to the pointer" on={m.cursor === 'tilt'} disabled={disabled} onToggle={(on) => onChange({ cursor: on ? 'tilt' : 'none' }, on ? 'pictures tilting to the pointer' : 'no tilt')} />
            <Toggle label="Line art draws itself" on={!!m.draw} disabled={disabled} onToggle={(on) => onChange({ draw: on }, on ? 'line art drawing itself' : 'line art already drawn')} />
          </div>
        </>
      )}
    </div>
  );
}
