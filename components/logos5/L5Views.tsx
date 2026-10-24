'use client';
// components/logos5/L5Views.tsx — THE LOGOS 5 SHELL (Alex Tran, Logos 5 Comments v2).
//
// A line of thinking is four views — Chat, Content, Artifacts, Logic Map —
// switched in a tab row; one more panel can be docked beside whichever is
// open (Split View); the header keeps only what is global: the way back to
// the Universal Map, search, Split View, and the account.
//
// Every control here is a button with a name, the tabs are a tablist with
// arrow keys, the divider is a separator that takes the arrow keys, and the
// Split View drawer is a menu that closes on Escape. Behaviour lives in
// lib/logos5/views.ts; this file only draws it.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { SPLIT_NAMES, SPLIT_SECTIONS, VIEW_LABELS, VIEW_ORDER, type BesideId, type Viewport } from '@/lib/logos5/views';

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');

// ── the header ───────────────────────────────────────────────────────

export function L5TopBar({
  title,
  onHome,
  onSearch,
  onNew,
  split,
  presence,
  menu,
  account,
  narrow,
}: {
  title: string;
  onHome: () => void;
  onSearch: () => void;
  onNew?: () => void;
  /** Split View — desktop only */
  split?: ReactNode;
  presence?: ReactNode;
  menu?: ReactNode;
  account?: ReactNode;
  narrow: boolean;
}) {
  return (
    <header className="l5v-top">
      <div className="l5v-top-l">
        <button type="button" className="l5v-home" onClick={onHome} aria-label="Back to the Universal Map">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {!narrow && <span>Universal Map</span>}
        </button>
        {title && (
          <h1 className="l5v-title" title={title}>
            {title}
          </h1>
        )}
        {onNew && (
          <button type="button" className="l5v-icon" onClick={onNew} aria-label="Start a new line of thinking" title="New line of thinking">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
      <div className="l5v-top-c">
        <button type="button" className="l5v-search" onClick={onSearch} aria-label="Search everything" aria-keyshortcuts="Meta+K Control+K">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          {!narrow && <span className="l5v-search-l">Search conversations, content, artifacts…</span>}
          {!narrow && <kbd className="l5v-kbd">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>}
        </button>
      </div>
      <div className="l5v-top-r">
        {split}
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

// ── Split View ───────────────────────────────────────────────────────

export function SplitView({
  beside,
  onPick,
  canChat,
  says,
  omit = [],
}: {
  beside: BesideId | null;
  onPick: (id: BesideId | null) => void;
  /** the conversation can be docked (it is not already the view) */
  canChat: boolean;
  /** a line per panel: what it shows */
  says: Partial<Record<BesideId, string>>;
  /** panels the open view already is — the map, beside the Logic Map */
  omit?: readonly BesideId[];
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', off);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const pick = (id: BesideId | null) => {
    setOpen(false);
    onPick(id);
  };
  return (
    <span className="l5v-split" ref={wrap}>
      <button type="button" className={`l5v-btn${beside ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M13 4.5v15" />
        </svg>
        <span>Split View</span>
      </button>
      {open && (
        <div className="l5v-menu" role="menu" id={menuId} aria-label="Open beside">
          <p className="l5v-menu-h">Open beside the view</p>
          {canChat && (
            <button type="button" role="menuitemradio" aria-checked={beside === 'chat'} className={`l5v-mi${beside === 'chat' ? ' is-on' : ''}`} onClick={() => pick('chat')}>
              <span className="l5v-mi-t">{SPLIT_NAMES.chat}</span>
              <span className="l5v-mi-s">the thread and the composer</span>
            </button>
          )}
          {SPLIT_SECTIONS.map((sec) => (
            <div key={sec.title} role="group" aria-label={sec.title} className="l5v-menu-sec">
              <p className="l5v-menu-s">{sec.title}</p>
              {sec.items.filter((id) => !omit.includes(id)).map((id) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={beside === id} className={`l5v-mi${beside === id ? ' is-on' : ''}`} onClick={() => pick(id)}>
                  <span className="l5v-mi-t">{SPLIT_NAMES[id]}</span>
                  {says[id] && <span className="l5v-mi-s">{says[id]}</span>}
                </button>
              ))}
            </div>
          ))}
          {beside && (
            <button type="button" role="menuitem" className="l5v-mi is-close" onClick={() => pick(null)}>
              Close the panel beside
            </button>
          )}
        </div>
      )}
    </span>
  );
}

// ── the layout ───────────────────────────────────────────────────────

export function L5Layout({
  view,
  primary,
  beside,
  besideTitle,
  onCloseBeside,
  omni,
  share,
  onShare,
  narrow,
}: {
  view: Viewport;
  primary: ReactNode;
  /** what is docked beside the view, drawn */
  beside: ReactNode | null;
  besideTitle: string;
  onCloseBeside: () => void;
  /** the composer, when the conversation is not on screen */
  omni: ReactNode | null;
  /** the beside panel's share of the width, 0.28–0.6 */
  share: number;
  onShare: (s: number) => void;
  narrow: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number } | null>(null);
  const clamp = (s: number) => Math.min(0.6, Math.max(0.28, s));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.06 : 0.02;
    if (e.key === 'ArrowLeft') onShare(clamp(share + step));
    else if (e.key === 'ArrowRight') onShare(clamp(share - step));
    else return;
    e.preventDefault();
  };
  const besideOn = !!beside && !narrow;
  return (
    <div ref={body} className={`l5v-body is-${view}${besideOn ? ' has-beside' : ''}${narrow ? ' is-narrow' : ''}`} style={besideOn ? ({ ['--beside' as string]: `${Math.round(share * 1000) / 10}%` }) : undefined}>
      <main id="l5v-primary" className="l5v-primary" role="tabpanel" aria-labelledby={`l5v-tab-${view}`}>
        <div className="l5v-primary-in">{primary}</div>
        {omni && <div className="l5v-omni">{omni}</div>}
      </main>
      {besideOn && (
        <>
          <div
            className="l5v-divider"
            role="separator"
            aria-orientation="vertical"
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
              const r = body.current.getBoundingClientRect();
              onShare(clamp((r.right - e.clientX) / r.width));
            }}
            onPointerUp={() => void (drag.current = null)}
            onPointerCancel={() => void (drag.current = null)}
          />
          <aside className="l5v-beside" aria-label={besideTitle}>
            <div className="l5v-beside-head">
              <span className="l5v-beside-t">{besideTitle}</span>
              <button type="button" className="l5v-icon" aria-label={`Close ${besideTitle}`} onClick={onCloseBeside}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="l5v-beside-body">{beside}</div>
          </aside>
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
