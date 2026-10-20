'use client';
// components/logos5/L5Chrome.tsx — the few controls around the conversation.
//
// The header holds what is always worth one press: the rail, where you are,
// the workspace (and how much is in it), who is here, and one "More" menu for
// everything else. Nothing in it is decoration; anything used rarely is in
// the menu, not on the bar.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// ── a small menu: a button and a list, Escape and outside-press close it ──

export interface L5MenuItem {
  label: string;
  hint?: string;
  onSelect: () => void;
  disabled?: boolean;
  /** a section break above this item */
  sep?: boolean;
}

export function L5Menu({
  label,
  button,
  items,
  align = 'end',
  up = false,
  className = '',
}: {
  /** what the button is called, for a screen reader */
  label: string;
  button: ReactNode;
  items: L5MenuItem[];
  align?: 'start' | 'end';
  up?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus());
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={root} className={`l5-menu ${className}`}>
      <button type="button" className="l5-iconbtn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((v) => !v)}>
        {button}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          className={`l5-menu-list is-${align}${up ? ' is-up' : ''}`}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const all = [...(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
            const at = all.indexOf(document.activeElement as HTMLButtonElement);
            all[(at + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
          }}
        >
          {items.map((it, i) => (
            <div key={i}>
              {it.sep && <hr />}
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                <span>{it.label}</span>
                {it.hint && <small>{it.hint}</small>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── the header ──

export function L5Header({
  railOpen,
  onToggleRail,
  onHome,
  title,
  stage,
  presence,
  menu,
  account,
  center,
  extra,
}: {
  railOpen?: boolean;
  /** the rail's button — Logos 5 keeps the rail put away, so it may be absent */
  onToggleRail?: () => void;
  /** the mark: home, the Universal Map */
  onHome?: () => void;
  /** where you are, in small capitals beside the mark: LOGOS, a course, a line of thinking */
  title: string;
  /** what sits in the middle of the bar — a study's steps */
  center?: ReactNode;
  /** a control before the rest at the end — the Universal Map */
  extra?: ReactNode;
  /** the workspace's button: what is in it, and whether it is open */
  stage: { label: string; count: number; open: boolean; fresh: boolean; onToggle: () => void } | null;
  presence?: ReactNode;
  menu: L5MenuItem[];
  account?: ReactNode;
}) {
  return (
    <header className={`l5-head${center ? ' has-steps' : ''}`}>
      {onToggleRail && (
        <button
          type="button"
          className="l5-iconbtn l5-railbtn"
          onClick={onToggleRail}
          aria-expanded={railOpen}
          aria-label={railOpen ? 'Hide your lines of thinking' : 'Your lines of thinking'}
          title={railOpen ? 'Hide the rail' : 'Your lines of thinking'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </button>
      )}
      {onHome && (
        <button type="button" className="l5-brand" onClick={onHome} aria-label="Socria Logos — your Universal Map" title="Your Universal Map">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/socria-mark.png" alt="" width={22} height={22} />
          <span className="l5-brand-w">Socria</span>
        </button>
      )}
      <h1 className="l5-title" title={title}>
        {title}
      </h1>
      {center && <div className="l5-head-mid">{center}</div>}
      <div className="l5-head-end">
        {extra}
        {stage && (
          <button
            type="button"
            className={`l5-stagebtn${stage.open ? ' is-on' : ''}${stage.fresh ? ' is-fresh' : ''}`}
            onClick={stage.onToggle}
            aria-pressed={stage.open}
            title={stage.open ? 'Put the workspace away' : 'Open the workspace'}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M12 4.5v15" />
            </svg>
            <span className="l5-stagebtn-l">{stage.label}</span>
            {stage.count > 0 && <span className="l5-count">{stage.count}</span>}
          </button>
        )}
        {presence}
        <L5Menu
          label="More"
          items={menu}
          button={
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <circle cx="5.5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="18.5" cy="12" r="1.6" />
            </svg>
          }
        />
        {account}
      </div>
    </header>
  );
}

// ── a card selected on the map, and the turns it came from ──

export function L5LinkBar({ label, count, at, onStep, onClear }: { label: string; count: number; at: number; onStep: (dir: 1 | -1) => void; onClear: () => void }) {
  return (
    <div className="l5-linkbar" role="status" aria-live="polite">
      <span className="l5-linkbar-dot" aria-hidden="true" />
      <span className="l5-linkbar-t">
        {count ? (
          <>
            <b>“{label}”</b> came from {count === 1 ? 'this message' : `${count} messages`}
          </>
        ) : (
          <>
            <b>“{label}”</b> isn’t tied to a message here
          </>
        )}
      </span>
      {count > 1 && (
        <span className="l5-linkbar-step">
          <button type="button" className="l5-iconbtn is-sm" aria-label="Previous" onClick={() => onStep(-1)}>
            ‹
          </button>
          <span aria-label={`${at + 1} of ${count}`}>
            {at + 1}/{count}
          </span>
          <button type="button" className="l5-iconbtn is-sm" aria-label="Next" onClick={() => onStep(1)}>
            ›
          </button>
        </span>
      )}
      <button type="button" className="l5-iconbtn is-sm" aria-label="Clear" onClick={onClear}>
        ×
      </button>
    </div>
  );
}

// ── the stage's own head ──

export function L5StageHead({ title, sub, onClose, actions }: { title: string; sub?: string; onClose: () => void; actions?: ReactNode }) {
  return (
    <div className="l5-stagehead">
      <button type="button" className="l5-stage-back" onClick={onClose} aria-label="Back to the conversation">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span>Conversation</span>
      </button>
      <span className="l5-stagehead-t">
        {title}
        {sub && <small>{sub}</small>}
      </span>
      <span className="l5-stagehead-acts">{actions}</span>
      <button type="button" className="l5-iconbtn is-sm l5-stage-x" onClick={onClose} aria-label="Put the workspace away" title="Put the workspace away">
        ×
      </button>
    </div>
  );
}

// ── jump to a turn ──

export function L5Outline({ items, onJump }: { items: { id: string; text: string }[]; onJump: (id: string) => void }) {
  if (items.length < 3) return null;
  return (
    <L5Menu
      label="Jump to a question"
      className="l5-outline"
      align="end"
      button={
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      }
      items={items.map((it) => ({ label: it.text.length > 72 ? `${it.text.slice(0, 71)}…` : it.text, onSelect: () => onJump(it.id) }))}
    />
  );
}
