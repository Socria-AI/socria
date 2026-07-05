'use client';

import { useEffect, useState } from 'react';

export function Core3IntroModal({
  open,
  onClose,
  onTry,
  isSignedIn,
}: {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
  onTry: () => void;
  isSignedIn: boolean;
}) {
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(dontShow);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dontShow, onClose]);

  if (!open) return null;

  return (
    <div
      className="core3-modal-backdrop"
      onClick={() => onClose(dontShow)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="core3-modal-title"
    >
      <div className="core3-modal-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onClose(dontShow)}
          className="core3-modal-close"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <p className="core3-modal-eyebrow">Introducing</p>
        <h2 id="core3-modal-title" className="core3-modal-title">
          Socria Core 3
        </h2>
        <p className="core3-modal-lede">
          A new mode of thinking — one that notices your words and adjusts to
          your depth.
        </p>

        <div className="core3-modal-section">
          <p className="core3-modal-section-title">Language noticing</p>
          <div className="core3-modal-demo-bubble">
            <span className="core3-modal-bubble-label">Socria</span>
            You said{' '}
            <span className="try-core3-word" aria-label="might">
              might
            </span>{' '}
            — not fully convinced yet. What&rsquo;s holding you back?
          </div>
          <p className="core3-modal-section-desc">
            Reflects the loaded words in your thinking back at you — italic
            serif, in the brand green — so you can see the language shaping
            your ideas.
          </p>
        </div>

        <div className="core3-modal-section">
          <p className="core3-modal-section-title">Adjustable thinking depth</p>
          <div className="core3-modal-depth-pills">
            {['Quick', 'Balanced', 'Deep', 'Abstract'].map((label, i) => (
              <span
                key={label}
                className="depth-cycle-pill"
                style={{ animationDelay: `${i}s` }}
              >
                {label}
              </span>
            ))}
          </div>
          <p className="core3-modal-section-desc">
            Adjust the register from casual to philosophical. The deeper the
            mode, the more rigorous the reasoning and the more elevated the
            voice.
          </p>
        </div>

        <div className="core3-modal-footer">
          <label className="core3-modal-checkbox">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
            />
            <span>Don&rsquo;t show this again</span>
          </label>
          <button
            type="button"
            onClick={onTry}
            className="core3-modal-primary"
          >
            {isSignedIn ? 'Try Core 3' : 'Sign in to unlock'}
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
