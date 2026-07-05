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

        {/* Hero band */}
        <div className="core3-modal-hero" aria-hidden="true">
          <div className="core3-modal-hero-sweep" />
          <div className="core3-modal-hero-grid" />
          <span className="core3-modal-sparkle" style={{ top: '18%', left: '14%', animationDelay: '0s' }} />
          <span className="core3-modal-sparkle" style={{ top: '62%', left: '22%', animationDelay: '0.7s' }} />
          <span className="core3-modal-sparkle" style={{ top: '30%', left: '78%', animationDelay: '1.3s' }} />
          <span className="core3-modal-sparkle" style={{ top: '74%', left: '86%', animationDelay: '2s' }} />
          <span className="core3-modal-sparkle" style={{ top: '46%', left: '10%', animationDelay: '2.6s' }} />
          <span className="core3-modal-sparkle" style={{ top: '20%', left: '58%', animationDelay: '1.7s' }} />
          <div className="core3-modal-hero-glyphs">
            <svg
              viewBox="0 0 220 120"
              width="220"
              height="120"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              aria-hidden
            >
              {/* Circle — light — floating */}
              <circle
                className="core3-glyph-circle"
                cx="72"
                cy="60"
                r="34"
              />
              {/* Light beam between */}
              <line
                className="core3-glyph-beam"
                x1="110"
                y1="60"
                x2="140"
                y2="60"
                strokeDasharray="2 6"
              />
              {/* Diamond — foundation — rotating */}
              <rect
                className="core3-glyph-diamond"
                x="146"
                y="34"
                width="52"
                height="52"
                transform="rotate(45 172 60)"
              />
            </svg>
          </div>
        </div>

        <div className="core3-modal-content">
          <p className="core3-modal-eyebrow reveal-in" style={{ animationDelay: '80ms' }}>
            Introducing
          </p>
          <h2
            id="core3-modal-title"
            className="core3-modal-title reveal-in"
            style={{ animationDelay: '160ms' }}
          >
            Socria{' '}
            <span className="core3-modal-title-accent">Core 3</span>
          </h2>
          <p className="core3-modal-lede reveal-in" style={{ animationDelay: '240ms' }}>
            A new mode of thinking — one that <em>notices</em> your words and
            adjusts to your depth.
          </p>

          <div className="core3-modal-section reveal-in" style={{ animationDelay: '360ms' }}>
            <p className="core3-modal-section-title">
              <span className="core3-modal-dot" />
              Language noticing
            </p>
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
              serif, brand green — so you can <em>see</em> the language
              shaping your ideas.
            </p>
          </div>

          <div className="core3-modal-section reveal-in" style={{ animationDelay: '480ms' }}>
            <p className="core3-modal-section-title">
              <span className="core3-modal-dot" />
              Adjustable thinking depth
            </p>
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
              Adjust the register from casual to philosophical. The deeper
              the mode, the more <em>rigorous</em> the reasoning — and the
              more elevated the voice.
            </p>
          </div>

          <div className="core3-modal-footer reveal-in" style={{ animationDelay: '600ms' }}>
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
              <span className="core3-modal-primary-shine" aria-hidden />
              <span className="core3-modal-primary-label">
                {isSignedIn ? 'Try Core 3' : 'Sign in to unlock'}
              </span>
              <span aria-hidden className="core3-modal-primary-arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
