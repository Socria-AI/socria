'use client';

// components/display/primitives.tsx — the small controls every display is built from.
//
// One vocabulary of controls for nine kinds of display, so a weight in a
// comparison, a probability in a decision tree and an amount in a worksheet
// are changed the same way and look the same. Each control commits once —
// when the person is done with it (Enter, leaving the field, a click) —
// never on every keystroke, so each change is one step in the display's
// history and undoes as one.

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { FigureProps } from '@/components/objects/figures';

/** The selected part: the map's selection when the map keeps one, else the figure's own. */
export function useSelection(p: FigureProps): [string | null, (id: string | null) => void] {
  const [own, setOwn] = useState<string | null>(null);
  if (p.onSelect) return [p.sel ?? null, (id) => p.onSelect?.(id)];
  return [own, setOwn];
}

/** A number, committed on Enter or leaving it. Empty commits null (a cleared value), never 0. */
export function NumberEdit({
  value,
  onDone,
  label,
  min,
  max,
  step,
  placeholder,
  className = '',
  disabled,
}: {
  value: number | null | undefined;
  onDone: (v: number | null) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const shown = value === null || value === undefined ? '' : String(value);
  const [v, setV] = useState(shown);
  useEffect(() => setV(shown), [shown]);
  const commit = () => {
    const t = v.trim();
    if (t === shown) return;
    if (t === '') return onDone(null);
    const n = Number(t.replace(/,/g, ''));
    if (!Number.isFinite(n)) return setV(shown);
    onDone(n);
  };
  return (
    <input
      className={`dsp-num ${className}`}
      inputMode="decimal"
      value={v}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(shown);
      }}
    />
  );
}

/** − value + : a whole number in a range, changed a step at a time (arrow keys too). */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  label,
  onChange,
  disabled,
  format = (n) => String(n),
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  onChange: (n: number) => void;
  disabled?: boolean;
  format?: (n: number) => string;
}) {
  const set = (n: number) => {
    const c = Math.min(max, Math.max(min, Math.round(n / step) * step));
    if (c !== value) onChange(c);
  };
  const keys = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') (e.preventDefault(), set(value + step));
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') (e.preventDefault(), set(value - step));
    if (e.key === 'Home') (e.preventDefault(), set(min));
    if (e.key === 'End') (e.preventDefault(), set(max));
  };
  return (
    <span className="dsp-stepper" role="group" aria-label={label}>
      <button type="button" disabled={disabled || value <= min} onClick={() => set(value - step)} aria-label={`Less ${label.toLowerCase()}`}>
        −
      </button>
      <span
        className="dsp-stepper-v"
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={label}
        onKeyDown={keys}
      >
        {format(value)}
      </span>
      <button type="button" disabled={disabled || value >= max} onClick={() => set(value + step)} aria-label={`More ${label.toLowerCase()}`}>
        +
      </button>
    </span>
  );
}

/**
 * A slider that commits when released (pointer up, or a key) — one step in
 * the history, not one per pixel — and shows the value while it moves.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  label,
  onCommit,
  disabled,
  format = (n) => String(n),
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  onCommit: (n: number) => void;
  disabled?: boolean;
  format?: (n: number) => string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = (n: number) => n !== value && onCommit(n);
  return (
    <span className="dsp-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={format(v)}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => commit(v)}
        onKeyUp={() => commit(v)}
        onBlur={() => commit(v)}
      />
      <span className="dsp-slider-v" aria-hidden="true">
        {format(v)}
      </span>
    </span>
  );
}

/** A small set of choices, one on: a view-like switch inside a display. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: readonly { id: T; label: string; title?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="dsp-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? 'is-on' : ''}
          disabled={disabled}
          title={o.title}
          onClick={() => value !== o.id && onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** A tool in a display's toolbar: a quiet text button, on when its mode is on. */
export function Tool({
  label,
  onClick,
  on,
  disabled,
  title,
  children,
}: {
  label: string;
  onClick: () => void;
  on?: boolean;
  disabled?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`dsp-tool${on ? ' is-on' : ''}`}
      aria-label={label}
      aria-pressed={on === undefined ? undefined : on}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      {children ?? label}
    </button>
  );
}

/** A destructive action asked twice, in place: "Remove" → "Remove ‘Draft’?" → done. */
export function Confirm({ label, ask, onConfirm, disabled }: { label: string; ask: string; onConfirm: () => void; disabled?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="dsp-danger" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="dsp-confirm" role="group" aria-label={ask}>
      <span>{ask}</span>
      <button
        type="button"
        className="dsp-danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Yes
      </button>
      <button type="button" className="dsp-tool" onClick={() => setAsking(false)}>
        Keep
      </button>
    </span>
  );
}

/** A panel for the selected part: what it is, editable, and a way to close it. */
export function Inspector({ title, by, onClose, children }: { title: ReactNode; by?: 'person' | 'socria'; onClose: () => void; children: ReactNode }) {
  return (
    <div className="dsp-editor" role="group" aria-label="Selected">
      <div className="dsp-editor-head">
        <span className="dsp-editor-title">{title}</span>
        {by && <span className="dsp-editor-by">{by === 'person' ? 'yours' : 'drafted by Socria'}</span>}
        <button type="button" className="dsp-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {children}
    </div>
  );
}

/** Text only a screen reader hears. */
export const Sr = ({ children, id }: { children: ReactNode; id?: string }) => (
  <span className="dsp-sr" id={id}>
    {children}
  </span>
);

/** A labelled field in an inspector's grid. */
export const Field = ({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) => (
  <label className={`dsp-field${wide ? ' is-wide' : ''}`}>
    <span>{label}</span>
    {children}
  </label>
);
