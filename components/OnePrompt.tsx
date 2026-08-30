'use client';

// components/OnePrompt.tsx
//
// The Socria One invitation plate, at the scale of an interruption.
//
// It is the /one cover, not a lookalike: the same Prussian-blue plate and
// inner rule, the same tracked eyebrow, the same italic monogram in its ring,
// the same serif name with One set italic, the same price with its tracked
// period, the same standfirst voice, and the same cream pill. Someone who
// walks into a boundary here and later opens the Socria One page should
// recognise the second from the first.
//
// What it drops is the ledger of six capabilities. SocriaOneModal keeps that,
// and it is the right thing when someone has chosen to go and look at One.
// It is the wrong thing in front of someone who just pressed Explore and
// found it had stopped: at that moment they have one question — why did that
// stop, and how do I keep going — and a feature list is not an answer to it.
// So this says the answer, in the product's best voice, and the foot links to
// the page that does carry the ledger.
//
// What is deliberately absent: any countdown, any "limited time", any
// animation beyond the one that gets it on screen without a jump. The price
// is on the face of it, because hiding it until checkout is its own kind of
// dark pattern. The dismissal is a real phrase, not a grey ✕ in a corner.

import { useEffect, useRef } from 'react';
import { SOCRIA_ONE } from '@/lib/socria-one';
import type { OnePromptView } from './useOnePrompt';

export function OnePrompt({
  view,
  onDismiss,
  onAccept,
  busy,
  error,
}: {
  view: OnePromptView | null;
  onDismiss: () => void;
  /** Opens checkout. The caller reports the click; this only calls it. */
  onAccept: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const goRef = useRef<HTMLButtonElement>(null);
  const open = !!view?.open;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    // Move focus to the primary action so a keyboard user is not left behind
    // the page. Not a full focus trap — the sheet is four controls, and
    // tabbing out of it lands on the page they were already using.
    goRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!view || !open) return null;

  return (
    <div
      className="lg-op-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lg-op-title"
      aria-describedby="lg-op-body"
    >
      <div className="lg-op-back" onClick={onDismiss} aria-hidden="true" />
      <div className={`lg-op-sheet is-${view.category}`}>
        <p className="lg-op-eyebrow">The complete reasoning environment</p>

        <span className="lg-op-mono" aria-hidden="true">
          <span>I</span>
        </span>

        <h2 id="lg-op-title" className="lg-op-title">
          {view.title}
        </h2>

        {/* The price sits on the face, where the cover puts it. */}
        <p className="lg-op-price">
          <span className="lg-op-amt">
            {SOCRIA_ONE.currency}
            {SOCRIA_ONE.price}
          </span>
          <span className="lg-op-per">/ {SOCRIA_ONE.period}</span>
        </p>

        <p id="lg-op-body" className="lg-op-body">
          {view.body}
        </p>

        {error && (
          <p className="lg-op-err" role="alert">
            {error}
          </p>
        )}

        <div className="lg-op-actions">
          <button
            ref={goRef}
            type="button"
            className="lg-op-go"
            onClick={onAccept}
            disabled={busy}
          >
            {busy ? 'Opening checkout…' : view.primary}
            {!busy && (
              <span className="ar" aria-hidden="true">
                →
              </span>
            )}
          </button>
          <button type="button" className="lg-op-not" onClick={onDismiss}>
            {view.secondary}
          </button>
        </div>

        <p className="lg-op-foot">
          <span>Cancel anytime. Your maps stay yours.</span>
          <span className="lg-op-dot" aria-hidden="true">
            ·
          </span>
          <a className="lg-op-more" href="/one">
            everything One opens
          </a>
        </p>
      </div>
    </div>
  );
}
