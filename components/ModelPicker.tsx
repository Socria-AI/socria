'use client';
// components/ModelPicker.tsx
//
// One control for both axes, beside the send button.
//
// It used to be two: a model pill and, next to it, a depth pill that appeared
// and disappeared depending on which model was chosen. Two controls for one
// decision, one of which moves — and the second is meaningless without the
// first, since Core 2 answers at one register and Logos has a map instead of
// a depth. The design collapses them: the button reads "Core 3.1 · Balanced",
// and the sheet asks the two questions in order — how it answers, then how
// far it goes — with the second section simply absent when the chosen model
// has no second axis.
//
// Core 4 has a different second axis. It decides its own depth from evidence
// every turn, so asking the person to set one was a question only somebody
// who cannot see the evidence would be answering. What they CAN judge is how
// they want to be written to, so the sheet asks that instead: how it reads,
// and how much it says. Same widget, different table — nothing here special-
// cases a model id, it reads supportsDepth and supportsCommunication.
//
// Ported from the design's chat kit; the stylesheet is app/app-shell.css,
// scoped under .app-root, so the button lives inside an `app-inline` wrapper.
// What is NOT the design's: every list here comes from this product's own
// tables. SOCRIA_MODELS decides which models exist and which need an account;
// THINKING_DEPTHS and READABILITY_OPTIONS/LENGTH_OPTIONS decide the second
// axis; PLANS decides whether a register is
// locked. The mock hard-coded all three, and a menu that disagrees with the
// server about what you can pick is worse than no menu.

import { useEffect, useRef, useState } from 'react';
import {
  SOCRIA_MODELS,
  THINKING_DEPTHS,
  READABILITY_OPTIONS,
  LENGTH_OPTIONS,
  type SocriaModel,
  type ThinkingDepth,
  type Readability,
  type ReplyLength,
} from '@/lib/socria-prompt';
import { PLANS } from '@/lib/entitlements';
import { type Plan } from '@/lib/socria-one';
import { ModelGlyph } from './ModelGlyph';
import { OneLock } from './OneLock';
// The .mp-* rules live in app/app-shell.css, which only the app routes
// import — and this is rendered on /docs/models too, where it was showing as
// an unstyled stack of text in a 420px-tall empty frame. Importing the sheet
// from the component means every route that renders a picker gets the rules.
// It stays .app-root-scoped, so nothing on /docs is touched by it.
import '@/app/app-shell.css';

// The Core answerers, and the Logos surfaces, split by the registry rather
// than by a hard-coded id — a new model lands in the right column on its own.
// A Logos surface (Logos, Logos 2) opens the split screen; everything else is
// a "how it answers" register.
const ANSWERERS = (Object.keys(SOCRIA_MODELS) as SocriaModel[]).filter(
  (id) => !SOCRIA_MODELS[id].logosSurface
);
const SURFACES = (Object.keys(SOCRIA_MODELS) as SocriaModel[]).filter(
  (id) => SOCRIA_MODELS[id].logosSurface
);

export function ModelPicker({
  value,
  onChange,
  depth,
  onDepth,
  readability,
  onReadability,
  length,
  onLength,
  isSignedIn = true,
  onLockedAttempt,
  plan,
}: {
  value: SocriaModel;
  onChange: (next: SocriaModel) => void;
  /** Omit both to render the model axis alone (the docs demo does). */
  depth?: ThinkingDepth;
  onDepth?: (next: ThinkingDepth) => void;
  /**
   * The other axis, for the models that have one. Same rule as depth: omit
   * them and the section is simply absent.
   */
  readability?: Readability;
  onReadability?: (next: Readability) => void;
  length?: ReplyLength;
  onLength?: (next: ReplyLength) => void;
  isSignedIn?: boolean;
  onLockedAttempt?: (locked: SocriaModel) => void;
  /**
   * What the person holds, when the caller knows. Undefined means "not known
   * yet", and nothing about One is shown: a member flashed a lock for the
   * half-second before the server answers is exactly the kind of thing that
   * makes a product feel like it is selling.
   */
  plan?: Plan;
}) {
  const [open, setOpen] = useState(false);
  /** the register they pressed that their plan does not open, if any */
  const [locked, setLocked] = useState<string | null>(null);
  /** the model they pressed that needs an account, if any */
  const [needs, setNeeds] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Pointerdown rather than click, so the menu is already gone by the time
  // whatever they pressed outside it reacts.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  // Whatever they were told last time is stale the moment the sheet reopens.
  useEffect(() => {
    if (!open) {
      setLocked(null);
      setNeeds(null);
    }
  }, [open]);

  const current = SOCRIA_MODELS[value];
  // The depth axis exists when the model has one AND the caller gave us the
  // state for it. Both, because the docs demo shows the model axis alone.
  const hasDepth = current.supportsDepth && !!depth && !!onDepth;
  // The communication axes, which replace depth on the models that decide
  // their own. Both or neither: they are two halves of one question about how
  // the answer is written, and a sheet offering one of them would read as a
  // half-built control.
  const hasComm =
    !!current.supportsCommunication && !!readability && !!onReadability && !!length && !!onLength;
  const allDepths = plan ? PLANS[plan].allDepths : true;
  // What the button says after the model name, when it is not at its default.
  // Nothing at all when both are standard — a pill that always shows "Standard"
  // is a pill that says nothing.
  const commLabel = !hasComm
    ? null
    : [
        readability !== 'standard' ? READABILITY_OPTIONS.find((r) => r.id === readability)?.label : null,
        length !== 'standard' ? LENGTH_OPTIONS.find((l) => l.id === length)?.label : null,
      ]
        .filter(Boolean)
        .join(', ') || null;

  const pick = (id: SocriaModel) => {
    // Announced but not built — the row is inert; the copy below the name
    // already says why, so a press does nothing rather than lying.
    if (SOCRIA_MODELS[id].soon) return;
    if (SOCRIA_MODELS[id].requiresAuth && !isSignedIn) {
      setNeeds(SOCRIA_MODELS[id].short);
      onLockedAttempt?.(id);
      return;
    }
    onChange(id);
    setOpen(false);
  };

  const row = (id: SocriaModel) => {
    const m = SOCRIA_MODELS[id];
    const surface = !!m.logosSurface;
    const soon = !!m.soon;
    const gated = !soon && m.requiresAuth && !isSignedIn;
    return (
      <button
        key={id}
        type="button"
        role="menuitemradio"
        aria-checked={value === id}
        aria-disabled={soon || undefined}
        className={`mp-row${value === id ? ' on' : ''}${gated || soon ? ' gated' : ''}${
          surface ? ' logos' : ''
        }`}
        onClick={() => pick(id)}
      >
        <span className="top">
          <span className="does">{m.description}</span>
          {soon ? (
            // The roadmap word — where a lock or a sign-in prompt would go.
            <span className="need">{m.soon}</span>
          ) : gated ? (
            <span className="need">Sign in</span>
          ) : surface ? (
            <span className="tag">{m.collab ? 'think together' : 'a different surface'}</span>
          ) : null}
        </span>
        {/* The headline says what it DOES; the name is the footnote. That
            is the design's whole point about naming models — and this table
            already writes the description that way, so nothing is invented
            here and nothing is said twice. */}
        <span className="meta">
          <span className="nm">{m.short}</span>
          {/* "no depth modes" is the footnote for a model that answers at one
              register. It is the wrong footnote for one that sets its own —
              and that model's description already says so, so this says
              nothing rather than saying it twice. */}
          {!m.supportsDepth && !m.supportsCommunication && !surface && !soon
            ? ' — no depth modes.'
            : ''}
        </span>
      </button>
    );
  };

  return (
    <span className="app-root app-inline">
      <div className="mp" ref={box}>
        <button
          type="button"
          data-tour="model"
          className={`mp-btn${open ? ' open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="dot" aria-hidden="true" />
          <span className="nm">{current.short}</span>
          {hasDepth && (
            <>
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <span className="dp">
                {THINKING_DEPTHS.find((d) => d.id === depth)?.label}
              </span>
            </>
          )}
          {commLabel && (
            <>
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <span className="dp">{commLabel}</span>
            </>
          )}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>

        {open && (
          <div className="mp-sheet" role="menu">
            <p className="mp-lbl">How it answers</p>
            {ANSWERERS.map(row)}

            {/* The Logos surfaces below a rule, because picking one is not the
                same kind of choice: the map opens beside the conversation.
                Logos 2 is a second seat in that same room. */}
            <div className="mp-rule" />
            {SURFACES.map(row)}

            {needs && (
              <p className="mp-need">
                <strong>{needs}</strong> needs an account — a map has to be kept
                somewhere, and that somewhere is yours.{' '}
                <em>Core 2 stays open, signed out.</em>
              </p>
            )}

            {hasDepth && (
              <>
                <div className="mp-rule" />
                <p className="mp-lbl">How far it goes</p>
                <div className="mp-depths">
                  {THINKING_DEPTHS.map((d) => {
                    // Today both plans open all four; the table says so, and
                    // this reads the table rather than a list of ids, so the
                    // menu is already right if that ever changes back.
                    const shut = !allDepths && d.id !== 'balanced';
                    return (
                      <button
                        key={d.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={depth === d.id}
                        className={`mp-d${depth === d.id ? ' on' : ''}${
                          shut ? ' locked' : ''
                        }`}
                        onClick={() => {
                          if (shut) {
                            setLocked(d.label);
                            return;
                          }
                          onDepth?.(d.id);
                          setOpen(false);
                        }}
                      >
                        <span className="d">
                          {d.label}
                          {shut && <OneLock />}
                        </span>
                        <span className="does">
                          {shut ? 'opens with One' : d.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {locked ? (
                  <p className="mp-lock">
                    <strong>{locked}</strong> is a Socria One register — slower,
                    and it holds a question longer. Quick and Balanced stay
                    free, always.
                    <a href="/one">See what One opens →</a>
                  </p>
                ) : (
                  <p className="mp-note">
                    Depth changes what it asks — never who is doing the
                    thinking.
                  </p>
                )}
              </>
            )}
            {hasComm && (
              <>
                <div className="mp-rule" />
                {/* Two questions about the writing, never about the thinking.
                    They are independent on purpose: Advanced + Concise and
                    Simple + Detailed are both coherent, and a single dial
                    would have forced one to imply the other. */}
                <p className="mp-lbl">How it reads</p>
                <div className="mp-depths one">
                  {READABILITY_OPTIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={readability === r.id}
                      className={`mp-d${readability === r.id ? ' on' : ''}`}
                      // The sheet stays open: there are two settings here and
                      // closing after the first would mean reopening to make
                      // the second.
                      onClick={() => onReadability?.(r.id)}
                    >
                      <span className="d">{r.label}</span>
                      <span className="does">{r.description}</span>
                    </button>
                  ))}
                </div>

                <div className="mp-rule" />
                <p className="mp-lbl">How much it says</p>
                <div className="mp-depths one">
                  {LENGTH_OPTIONS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={length === l.id}
                      className={`mp-d${length === l.id ? ' on' : ''}`}
                      onClick={() => onLength?.(l.id)}
                    >
                      <span className="d">{l.label}</span>
                      <span className="does">{l.description}</span>
                    </button>
                  ))}
                </div>

                <p className="mp-note">
                  These change how the answer is written — never how hard it is
                  thought about. <em>{current.short} decides that itself.</em>
                </p>
              </>
            )}
            {!hasDepth && !hasComm && current.supportsDepth === false && (
              <p className="mp-note">
                {current.short} answers at one register.{' '}
                <em>Core 3.1 is the one that asks how far to go.</em>
              </p>
            )}
          </div>
        )}
      </div>
    </span>
  );
}
