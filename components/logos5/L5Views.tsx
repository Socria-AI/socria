'use client';
// components/logos5/L5Views.tsx — THE LOGOS 5 SHELL (Alex Tran, Logos 5 Comments v2).
//
// A line of thinking is four views — Chat, Content, Artifacts, Logic Map —
// switched in a tab row; something opened (a made thing, the Logic Map, a file)
// can sit beside the view. The header keeps only what is global: the way back
// to the Universal Map, search, and the account. (Split View, the menu that
// put a view beside, is gone: things open beside by being pressed.)
//
// Every control here is a button with a name, the tabs are a tablist with
// arrow keys, and the divider is a separator that takes the arrow keys. Behaviour lives in
// lib/logos5/views.ts; this file only draws it.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { L5Close } from './L5Chrome';
import { SIDES, VIEW_LABELS, VIEW_ORDER, clampShare, nearestSide, shareAt, type Side, type Viewport } from '@/lib/logos5/views';

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');

// ── the header (Logos 5) ───────────────────────────────────────────
//
// One bar, 56px: where you are on the left (the rail, the mark that goes home,
// a label and the line's name in italic), the switch between the four views in
// the middle, and what is global on the right — search, Memory, More, the
// account. Selected is the wash; nothing in it is filled.

export function L5TopBar({
  kind,
  title,
  onHome,
  onRail,
  railOpen,
  switcher,
  onSearch,
  memory,
  zoom,
  presence,
  menu,
  account,
  narrow,
}: {
  /** the label above the name: Project, Study, Line of thinking */
  kind?: string;
  title: string;
  onHome: () => void;
  /** your lines of thinking, as a list */
  onRail?: () => void;
  railOpen?: boolean;
  /** Chat · Files · Artifacts · Logic Map (L5Switch) */
  switcher?: ReactNode;
  /** search, here — absent on a phone, where it is in the ⋯ menu so the title has room */
  onSearch?: () => void;
  /** Memory's door (MindButton) */
  memory?: ReactNode;
  /** the way to the line of thinking zoomed out (components/logos5/L5Canvas.tsx) */
  zoom?: ReactNode;
  presence?: ReactNode;
  menu?: ReactNode;
  account?: ReactNode;
  narrow: boolean;
}) {
  return (
    <header className={`l5v-top${narrow ? ' is-narrow' : ''}`}>
      <div className="l5v-top-l">
        <button type="button" className="l5v-home" onClick={onHome} aria-label="Back to the Universal Map" title="Your Universal Map">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/socria-mark.png" alt="" width={22} height={22} />
          {!narrow && <span className="l5v-home-w">Socria</span>}
        </button>
        {(onRail || kind || title) && <span className="l5v-rule" aria-hidden="true" />}
        {/* Revision II: the rail's glyph is a breadcrumb — "Sessions /" then the line's name in serif italic */}
        {onRail && !narrow && (
          <>
            <button type="button" className="l5v-crumb" onClick={onRail} aria-expanded={!!railOpen} title="Your lines of thinking">
              Sessions
            </button>
            {title && (
              <span className="l5v-slash" aria-hidden="true">
                /
              </span>
            )}
          </>
        )}
        <h1 className="l5v-where" title={[kind, title].filter(Boolean).join(' · ')}>
          {kind && !narrow && <span className="l5-label">{kind}</span>}
          {title && <span className="l5v-title">{title}</span>}
        </h1>
      </div>
      <div className="l5v-top-c">{switcher}</div>
      <div className="l5v-top-r">
        {zoom}
        {onSearch && (
          <button type="button" className="l5-link l5v-search" onClick={onSearch} aria-label="Search everything" aria-keyshortcuts="Meta+K Control+K" title="Search everything">
            <span>Search</span>
            {!narrow && <kbd className="l5v-kbd l5-kbd">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>}
          </button>
        )}
        {memory}
        {presence}
        {menu}
        {account}
      </div>
    </header>
  );
}

// ── the four views ───────────────────────────────────────────────────

export function L5Tabs({
  value,
  onChange,
  counts,
  fresh,
  actions,
}: {
  value: Viewport;
  onChange: (v: Viewport) => void;
  counts: Partial<Record<Viewport, number>>;
  /** something new arrived in a view that is not open */
  fresh?: Partial<Record<Viewport, boolean>>;
  /** the open view's own actions — Synthesize, Add files — at the row's end */
  actions?: ReactNode;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = VIEW_ORDER.indexOf(value);
    const to = e.key === 'ArrowRight' ? VIEW_ORDER[(i + 1) % 4] : e.key === 'ArrowLeft' ? VIEW_ORDER[(i + 3) % 4] : e.key === 'Home' ? VIEW_ORDER[0] : e.key === 'End' ? VIEW_ORDER[3] : null;
    if (!to) return;
    e.preventDefault();
    onChange(to);
    requestAnimationFrame(() => refs.current[to]?.focus());
  };
  return (
    <div className="l5v-tabrow">
      <div className="l5v-tabs" role="tablist" aria-label="Views" onKeyDown={onKey}>
        {VIEW_ORDER.map((v) => {
          const n = counts[v];
          const on = v === value;
          return (
            <button
              key={v}
              ref={(el) => void (refs.current[v] = el)}
              type="button"
              role="tab"
              id={`l5v-tab-${v}`}
              aria-selected={on}
              aria-controls="l5v-primary"
              tabIndex={on ? 0 : -1}
              className={`l5v-tab${on ? ' is-on' : ''}${fresh?.[v] && !on ? ' is-fresh' : ''}`}
              onClick={() => onChange(v)}
            >
              {VIEW_LABELS[v]}
              {typeof n === 'number' && n > 0 && <span className="l5v-count">{n}</span>}
              {fresh?.[v] && !on && <span className="l5v-dot" aria-label="new" />}
            </button>
          );
        })}
      </div>
      {actions && <div className="l5v-tab-acts">{actions}</div>}
    </div>
  );
}

// ── the layout ───────────────────────────────────────────────────────

/** A side, drawn: the screen's outline with the panel docked on that edge. Hand-drawn on the 24 grid, no fill. */
export function SideGlyph({ side, size = 15 }: { side: Side; size?: number }) {
  const panel = side === 'left' ? { x: 6, y: 7, w: 4.5, h: 10 } : side === 'right' ? { x: 13.5, y: 7, w: 4.5, h: 10 } : side === 'top' ? { x: 6, y: 7, w: 12, h: 3.5 } : { x: 6, y: 13.5, w: 12, h: 3.5 };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx="1" />
    </svg>
  );
}


export function L5Layout({
  view,
  board = false,
  primary,
  beside,
  besideView = null,
  besideTitle,
  onCloseBeside,
  actions,
  omni,
  omniTop = false,
  share,
  onShare,
  side = 'right',
  onSide,
  narrow,
}: {
  view: Viewport;
  /** One view (Logos 5): the board is the view — it scrolls and zooms itself, and holds the chatbox */
  board?: boolean;
  primary: ReactNode;
  /** the view open beside it, drawn as its own tab draws it */
  beside: ReactNode | null;
  besideView?: Viewport | null;
  besideTitle: string;
  onCloseBeside: () => void;
  /** the open view's own actions — + View, Synthesize, AR Mode, Zoom out — top right on it */
  actions?: ReactNode;
  /** the composer, when the conversation is not on screen */
  omni: ReactNode | null;
  /** the composer floats at the top of the view, not its foot — the conversation was put at the top */
  omniTop?: boolean;
  /** the beside panel's share of the width (or the height, docked top or bottom), 0.28–0.6 */
  share: number;
  onShare: (s: number) => void;
  /** the edge the panel beside is docked on (lib/logos5/views.ts besideSide) */
  side?: Side;
  /** the panel beside put on another edge — by its head dragged there, or a side pressed; absent when it cannot move */
  onSide?: (side: Side) => void;
  narrow: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number } | null>(null);
  // the panel's head, dragged: where it would dock if let go now
  const move = useRef<{ id: number; x: number; y: number; on: boolean } | null>(null);
  const [aim, setAim] = useState<Side | null>(null);
  const across = side === 'top' || side === 'bottom';
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.06 : 0.02;
    // the arrow toward the panel shrinks it, away from it grows it
    const grow = side === 'right' ? 'ArrowLeft' : side === 'left' ? 'ArrowRight' : side === 'bottom' ? 'ArrowUp' : 'ArrowDown';
    const shrink = side === 'right' ? 'ArrowRight' : side === 'left' ? 'ArrowLeft' : side === 'bottom' ? 'ArrowDown' : 'ArrowUp';
    if (e.key === grow) onShare(clampShare(share + step));
    else if (e.key === shrink) onShare(clampShare(share - step));
    else return;
    e.preventDefault();
  };
  const besideOn = !!beside && !narrow;
  const said = besideView === 'chat' ? 'the conversation' : besideTitle;
  // Escape lets a dragged panel go back where it was
  useEffect(() => {
    if (!aim) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      move.current = null;
      setAim(null);
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [aim]);
  const aimAt = (x: number, y: number): Side => {
    const r = body.current?.getBoundingClientRect();
    return r && r.width && r.height ? nearestSide((x - r.left) / r.width, (y - r.top) / r.height) : side;
  };
  return (
    <div
      ref={body}
      className={`l5v-body is-${view}${board ? ' is-board' : ''}${besideOn ? ` has-beside side-${side}` : ''}${narrow ? ' is-narrow' : ''}${omniTop && omni && !narrow ? ' omni-top' : ''}${aim ? ' is-docking' : ''}`}
      style={besideOn ? ({ ['--beside' as string]: `${Math.round(share * 1000) / 10}%` }) : undefined}
    >
      <main id="l5v-primary" className="l5v-primary" role="tabpanel" aria-labelledby={`l5v-tab-${view}`}>
        <div className="l5v-primary-in">{primary}</div>
        {actions && <div className="l5v-acts">{actions}</div>}
        {omni && <div className="l5v-omni">{omni}</div>}
      </main>
      {besideOn && (
        <>
          <div
            className="l5v-divider"
            role="separator"
            aria-orientation={across ? 'horizontal' : 'vertical'}
            aria-label="Resize the panel beside"
            aria-valuemin={28}
            aria-valuemax={60}
            aria-valuenow={Math.round(share * 100)}
            tabIndex={0}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              drag.current = { id: e.pointerId };
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current || drag.current.id !== e.pointerId || !body.current) return;
              onShare(shareAt(side, body.current.getBoundingClientRect(), e.clientX, e.clientY));
            }}
            onPointerUp={() => void (drag.current = null)}
            onPointerCancel={() => void (drag.current = null)}
          />
          <aside className={`l5v-beside${besideView ? ` is-${besideView}` : ''}`} aria-label={besideTitle}>
            <div
              className={`l5v-beside-head${onSide ? ' is-movable' : ''}`}
              title={onSide ? `Drag to any edge to move ${said}` : undefined}
              onPointerDown={(e) => {
                if (!onSide || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
                move.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const m = move.current;
                if (!m || m.id !== e.pointerId) return;
                if (!m.on && Math.hypot(e.clientX - m.x, e.clientY - m.y) < 6) return;
                m.on = true;
                setAim(aimAt(e.clientX, e.clientY));
              }}
              onPointerUp={(e) => {
                const m = move.current;
                move.current = null;
                if (!m || m.id !== e.pointerId || !m.on) return setAim(null);
                const to = aimAt(e.clientX, e.clientY);
                setAim(null);
                if (to !== side) onSide?.(to);
              }}
              onPointerCancel={() => {
                move.current = null;
                setAim(null);
              }}
            >
              <span className="l5v-beside-t">
                {onSide && (
                  <svg className="l5v-grip" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M9 6h0M15 6h0M9 12h0M15 12h0M9 18h0M15 18h0" />
                  </svg>
                )}
                {besideTitle}
              </span>
              <span className="l5v-beside-acts">
                {onSide && (
                  <span className="l5v-sides" role="group" aria-label={`Where ${said} sits`}>
                    {SIDES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`l5v-side${s === side ? ' is-on' : ''}`}
                        aria-pressed={s === side}
                        aria-label={`Put ${said} on the ${s}`}
                        title={`On the ${s}`}
                        onClick={() => s !== side && onSide(s)}
                      >
                        <SideGlyph side={s} />
                      </button>
                    ))}
                  </span>
                )}
                <L5Close label={`Close ${besideTitle}`} onClose={onCloseBeside} />
              </span>
            </div>
            <div className="l5v-beside-body">{beside}</div>
          </aside>
          {/* the four edges, while the head is dragged: the one it would dock on is drawn where the panel would be */}
          {aim && (
            <div className="l5v-dock" aria-hidden="true">
              {SIDES.map((s) => (
                <span key={s} className={`l5v-dock-zone is-${s}${s === aim ? ' is-aim' : ''}`} />
              ))}
              <span className={`l5v-dock-ghost is-${aim}`} style={{ ['--beside' as string]: `${Math.round(share * 1000) / 10}%` }}>
                <span>{aim === side ? 'Back where it was' : `${besideTitle} on the ${aim}`}</span>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── what is happening, truthfully ────────────────────────────────────

/**
 * The turn on its way: a skeleton in the thread with the milestones that are
 * actually happening — reading a file in this browser, sending, waiting for
 * the first words — and nothing that is not. The words of the reply replace it.
 */
export function L5Working({ steps, onStop }: { steps: { label: string; state: 'done' | 'now' | 'next' }[]; onStop?: () => void }) {
  return (
    <div className="l5v-working" role="status" aria-live="polite">
      <div className="l5v-shimmer" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <ol className="l5v-steps">
        {steps.map((s, i) => (
          <li key={i} className={`is-${s.state}`}>
            {s.state === 'now' ? <span className="l5v-spin" aria-hidden="true" /> : s.state === 'done' ? <span className="l5v-tick" aria-hidden="true">✓</span> : <span className="l5v-pend" aria-hidden="true" />}
            {s.label}
          </li>
        ))}
      </ol>
      {onStop && (
        <button type="button" className="l5v-link" onClick={onStop}>
          Stop
        </button>
      )}
    </div>
  );
}
