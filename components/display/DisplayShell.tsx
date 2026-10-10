'use client';

// components/display/DisplayShell.tsx — what every everyday display has in common.
//
// A display draws canonical state and sends what the person does back up as
// an operation (components/objects/figures.ts). The shell is the part every
// kind shares, so a plan and a worksheet feel like one product:
//
//   the head    its name (renamed in place), what kind of thing it is, the
//               views of the SAME state it can be shown as, and undo/redo
//               through its history — nothing is lost by stepping back;
//   the foot    what the last step computed (a clash, a balance), where the
//               display came from and who did what, and — when something
//               could not be done — why, in a sentence, out loud.
//
// It keeps no state of its own but a half-typed title and the last refusal.

import { useEffect, useState, type ReactNode } from 'react';
import { kindOf, originSaid, stepWho, type ThoughtObject } from '@/lib/objects/core';
import type { FigureProps } from '@/components/objects/figures';
import './display.css';

export interface Display<S> {
  state: S;
  /** the figure can change things: live, and the person may edit */
  live: boolean;
  /** apply an operation; false (with the reason shown) when it could not be done */
  act: (op: string, args: Record<string, string | number>) => boolean;
  why: string | null;
}

/** The state at the figure's step, and a way to act on it that remembers why something failed. */
export function useDisplay<S>(p: FigureProps): Display<S> {
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => setWhy(null), [p.at]);
  const state = p.obj.states[Math.min(Math.max(0, p.at), p.obj.states.length - 1)] as S;
  const live = p.mode === 'live' && !!p.onOp;
  const act = (op: string, args: Record<string, string | number>) => {
    if (!p.onOp) return false;
    const r = p.onOp(op, args);
    setWhy(r.ok ? null : r.why ?? 'That could not be done.');
    return r.ok;
  };
  return { state, live, act, why };
}

export function DisplayShell<S extends { title: string; view: string }>({
  p,
  d,
  children,
  aside,
}: {
  p: FigureProps;
  d: Display<S>;
  children: ReactNode;
  /** a line of the kind's own beside the views — progress, a total */
  aside?: ReactNode;
}) {
  const kind = kindOf(p.obj.kind);
  const s = d.state;
  const last = p.at > 0 ? p.obj.steps[p.at - 1] : null;

  if (p.mode !== 'live') {
    return (
      <div className={`dsp is-${p.mode}`} data-kind={p.obj.kind}>
        <div className="dsp-head">
          <span className="dsp-title">{s.title}</span>
          <span className="dsp-kind">{kind?.shape(s as never) ?? kind?.label}</span>
        </div>
        {p.mode === 'card' && <p className="dsp-card-line">{kind?.facts(s as never, { guarded: !!p.guarded })[1] ?? kind?.facts(s as never, { guarded: !!p.guarded })[0]}</p>}
        {p.onView && (
          <button type="button" className="dsp-open" onClick={() => p.onView?.('display')}>
            Open
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="dsp is-live"
      data-kind={p.obj.kind}
      // what the hand works — a bar, a card, a field — keeps the pointer; the
      // rest of the frame still moves the display about the map like any card
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest(WORKED)) e.stopPropagation();
      }}
    >
      <div className="dsp-head">
        <Title value={s.title} live={d.live} onDone={(title) => d.act('title', { title })} />
        <span className="dsp-kind">{kind?.label}</span>
        {aside && <span className="dsp-aside">{aside}</span>}
        <span className="dsp-history" role="group" aria-label="History">
          <button type="button" disabled={!p.onSeek || p.at <= 0} onClick={() => p.onSeek?.(p.at - 1)} aria-label="Undo" title="Undo">
            ↶
          </button>
          <button
            type="button"
            disabled={!p.onSeek || p.at >= p.obj.states.length - 1}
            onClick={() => p.onSeek?.(p.at + 1)}
            aria-label="Redo"
            title="Redo"
          >
            ↷
          </button>
        </span>
      </div>
      {kind && kind.views.length > 1 && (
        <div className="dsp-views" role="tablist" aria-label="Show as">
          {kind.views.map((v) => {
            const off = v.unavailable?.(s as never) ?? null;
            const on = s.view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={on ? 'is-on' : ''}
                disabled={!d.live || !!off}
                title={off ?? v.shows}
                onClick={() => !on && d.act('view', { view: v.id })}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      )}
      <div
        className="dsp-body"
        // a long display scrolls inside itself; only then does the wheel stay here instead of zooming the map
        onWheel={(e) => {
          const b = e.currentTarget;
          if (b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1) e.stopPropagation();
        }}
      >
        {children}
      </div>
      <div className="dsp-foot">
        {d.why && (
          <p className="dsp-why" role="status">
            {d.why}
          </p>
        )}
        {/* what the last step computed — not while the person is practising, when it is what they are working out */}
        {!d.why && last?.note && !p.guarded && (
          <p className="dsp-note" role="status">
            {last.note}
          </p>
        )}
        <p className="dsp-prov">
          {provenance(p.obj)}
          {last ? ` · last: ${last.said} (${stepWho(last)})` : ''}
        </p>
      </div>
    </div>
  );
}

/** The parts of a display the hand works, which the map's canvas must not take the pointer from. */
const WORKED = 'button, input, select, textarea, label, a, [draggable="true"], [data-worked]';

function provenance(o: ThoughtObject): string {
  return o.origin === 'socria' ? 'Drafted by Socria from the conversation — yours to change' : originSaid(o).replace(/^./, (c) => c.toUpperCase());
}

/** The name, renamed where it stands. Committed on Enter or leaving the field. */
function Title({ value, live, onDone }: { value: string; live: boolean; onDone: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!live) return <span className="dsp-title">{value}</span>;
  return (
    <input
      className="dsp-title dsp-title-in"
      value={v}
      aria-label="Name"
      maxLength={80}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v.trim() !== value && onDone(v.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(value);
      }}
    />
  );
}

/** A field committed when the person is done with it — Enter or leaving it — never on every keystroke. */
export function Edit({
  value,
  onDone,
  label,
  className = '',
  max = 120,
  placeholder,
  list,
}: {
  value: string;
  onDone: (v: string) => void;
  label: string;
  className?: string;
  max?: number;
  placeholder?: string;
  /** a <datalist> of choices the field offers */
  list?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className={`dsp-edit ${className}`}
      value={v}
      aria-label={label}
      maxLength={max}
      placeholder={placeholder}
      list={list}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== value && onDone(v.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(value);
      }}
    />
  );
}

/** "Add …": a line of words (and whatever else the kind asks for) committed as one operation. */
export function AddRow({
  label,
  placeholder,
  onAdd,
  extra,
}: {
  label: string;
  placeholder: string;
  onAdd: (text: string) => boolean;
  extra?: ReactNode;
}) {
  const [t, setT] = useState('');
  return (
    <form
      className="dsp-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (t.trim() && onAdd(t.trim())) setT('');
      }}
    >
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={240} />
      {extra}
      <button type="submit" disabled={!t.trim()}>
        Add
      </button>
    </form>
  );
}
