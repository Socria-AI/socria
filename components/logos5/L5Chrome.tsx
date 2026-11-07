'use client';
// components/logos5/L5Chrome.tsx — the few controls around the conversation.
//
// The header holds what is always worth one press: the rail, where you are,
// the workspace (and how much is in it), who is here, and one "More" menu for
// everything else. Nothing in it is decoration; anything used rarely is in
// the menu, not on the bar.

import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// ── the one close: × top right of whatever it closes (l5-controls.css .l5-close) ──

/** The close glyph, 24 grid, stroke 1.7 (Logos 5's glyph table). */
export function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function L5Close({ label, onClose, className = '', title }: { label: string; onClose: () => void; className?: string; title?: string }) {
  return (
    <button type="button" className={`l5-icon l5-close${className ? ` ${className}` : ''}`} aria-label={label} title={title ?? label} onClick={onClose}>
      <CloseGlyph />
    </button>
  );
}

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
  word = false,
}: {
  /** what the button is called, for a screen reader */
  label: string;
  button: ReactNode;
  items: L5MenuItem[];
  align?: 'start' | 'end';
  up?: boolean;
  className?: string;
  /** the button is a word (Revision II: icons become words), not a glyph */
  word?: boolean;
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
  // l5-menuhost holds the button and places the panel; the panel itself is the
  // one menu, .l5-menu (l5-controls.css), and each item the one .l5-mi
  return (
    <div ref={root} className={`l5-menuhost ${className}`}>
      <button type="button" className={word ? 'l5-link' : 'l5-icon'} aria-label={word ? undefined : label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((v) => !v)}>
        {button}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          className={`l5-menu is-${align}${up ? ' is-up' : ''}`}
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
                className={`l5-mi${it.hint ? ' has-hint' : ''}`}
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
  eyebrow,
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
  /** where you are, beside the mark: the line of thinking's name, in italic */
  title: string;
  /** above-the-title words in small capitals: its Project, its course, "Universal Map" */
  eyebrow?: string;
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
    <header className={`l5-head${center ? ' has-center' : ''}`}>
      {onToggleRail && (
        <button
          type="button"
          className="l5-icon l5-railbtn"
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
      <div className="l5-head-start">
        {onHome && (
          <button type="button" className="l5-brand" onClick={onHome} aria-label="Socria Logos — your Universal Map" title="Your Universal Map">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socria-mark.png" alt="" width={22} height={22} />
            <span className="l5-brand-w">Socria</span>
          </button>
        )}
        {onHome && (eyebrow || title) && <span className="l5-head-rule" aria-hidden="true" />}
        <h1 className="l5-where" title={[eyebrow, title].filter(Boolean).join(' · ')}>
          {eyebrow && <span className="l5-label l5-eyebrow">{eyebrow}</span>}
          {title && <span className="l5-title">{title}</span>}
        </h1>
      </div>
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
        {/* the same word as a line's header (Revision II: icons become words) — one More, wherever you are */}
        <L5Menu label="More" items={menu} word button="More" />
        {account}
      </div>
    </header>
  );
}

// ── Memory's door (the Mind Graph, drawn) ──

/** A neuron: what Socria remembers, as its own place. */
export function MindButton({ onOpen, waiting = 0 }: { onOpen: () => void; waiting?: number }) {
  // Revision II: icons become words — "Memory", with a gold count when something waits to be confirmed
  return (
    <button type="button" className="l5-link l5-mindbtn" onClick={onOpen} aria-label={waiting > 0 ? `Memory — ${waiting} waiting` : 'Memory — what Socria remembers'} title="Memory — what Socria remembers">
      Memory
      {waiting > 0 && <span className="l5-badge">{waiting}</span>}
    </button>
  );
}

// ── the switch: what the screen shows ──

export interface L5SwitchItem {
  id: string;
  label: string;
  /** how many it holds — said beside it, and left off at none */
  count?: number;
  /** something new in it while another was showing */
  fresh?: boolean;
}

export function L5Switch({ items, value, onChange, label, wide = false }: { items: L5SwitchItem[]; value: string; onChange: (id: string) => void; label: string; wide?: boolean }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  // the tab that takes the focus: the one chosen, or the first when none is (the canvas, zoomed out)
  const focusId = items.some((it) => it.id === value) ? value : items[0]?.id;
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = Math.max(0, items.findIndex((it) => it.id === (document.activeElement as HTMLElement | null)?.dataset?.tab));
    const n = items.length;
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    refs.current[items[to].id]?.focus();
  };
  return (
    <div className={`l5-switch${wide ? ' is-wide' : ''}`} role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map((it) => (
        <button
          key={it.id}
          ref={(el) => void (refs.current[it.id] = el)}
          type="button"
          role="tab"
          data-tab={it.id}
          id={`l5-switch-${it.id}`}
          aria-selected={value === it.id}
          tabIndex={it.id === focusId ? 0 : -1}
          className="l5-switch-i"
          onClick={() => onChange(it.id)}
        >
          {it.label}
          {!!it.count && <span className="l5-count">{it.count}</span>}
          {it.fresh && value !== it.id && <span className="l5-new" aria-label="something new" />}
        </button>
      ))}
    </div>
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
          <button type="button" className="l5-icon is-sm" aria-label="Previous" onClick={() => onStep(-1)}>
            ‹
          </button>
          <span aria-label={`${at + 1} of ${count}`}>
            {at + 1}/{count}
          </span>
          <button type="button" className="l5-icon is-sm" aria-label="Next" onClick={() => onStep(1)}>
            ›
          </button>
        </span>
      )}
      <L5Close label="Clear" onClose={onClear} />
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
      <L5Close className="l5-stage-x" label="Put the workspace away" onClose={onClose} />
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
