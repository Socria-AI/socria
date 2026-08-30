'use client';

// components/OnePrompt.tsx
//
// The quiet version of the Socria One screen.
//
// SocriaOneModal is the full invitation plate — the monogram, six
// capabilities, the access-code field. It is the right thing when someone has
// chosen to go and look at One. It is the wrong thing to put in front of
// someone who just pressed Explore and found it had stopped: at that moment
// they have one question, "why did that stop and how do I keep going", and a
// feature list is not an answer to it.
//
// So this says the answer and nothing else. A title in their situation, two
// sentences, one action, a quiet way out, and the price stated plainly
// because hiding it until checkout is its own kind of dark pattern. Anyone
// who wants the full picture has the link at the bottom.
//
// What is deliberately absent: any countdown, any "limited time", any
// styling that pulls the eye harder than the thing behind it, any animation
// beyond the one that gets it on screen without a jump. The dismissal is a
// real button with a real word on it, not a grey ✕ hidden in a corner.

import { useEffect, useRef } from 'react';
import { priceWithPeriod } from '@/lib/socria-one';
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
        <p className="lg-op-eyebrow">Socria One</p>

        <h2 id="lg-op-title" className="lg-op-title">
          {view.title}
        </h2>

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
          </button>
          <button type="button" className="lg-op-not" onClick={onDismiss}>
            {view.secondary}
          </button>
        </div>

        <p className="lg-op-foot">
          <span className="lg-op-price">{priceWithPeriod()}</span>
          <span className="lg-op-dot" aria-hidden="true">
            ·
          </span>
          <span>cancel anytime</span>
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
