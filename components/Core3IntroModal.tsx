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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Compact hero band */}
        <div className="core3-modal-hero" aria-hidden="true">
          <div className="core3-modal-hero-sweep" />
          <div className="core3-modal-hero-grid" />
          <span className="core3-modal-sparkle" style={{ top: '20%', left: '18%', animationDelay: '0s' }} />
          <span className="core3-modal-sparkle" style={{ top: '68%', left: '26%', animationDelay: '0.7s' }} />
          <span className="core3-modal-sparkle" style={{ top: '34%', left: '78%', animationDelay: '1.4s' }} />
          <span className="core3-modal-sparkle" style={{ top: '76%', left: '84%', animationDelay: '2.1s' }} />
          <div className="core3-modal-hero-glyphs">
            <svg
              viewBox="0 0 220 100"
              width="200"
              height="90"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              aria-hidden
            >
              <circle className="core3-glyph-circle" cx="72" cy="50" r="28" />
              <line
                className="core3-glyph-beam"
                x1="104"
                y1="50"
                x2="140"
                y2="50"
                strokeDasharray="2 6"
              />
              <rect
                className="core3-glyph-diamond"
                x="150"
                y="28"
                width="44"
                height="44"
                transform="rotate(45 172 50)"
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
            Socria <span className="core3-modal-title-accent">Core 3</span>
          </h2>

          {/* Combined compact feature preview */}
          <div className="core3-modal-preview reveal-in" style={{ animationDelay: '260ms' }}>
            <div className="core3-modal-demo-bubble">
              <span className="core3-modal-bubble-label">Socria</span>
              You said{' '}
              <span className="try-core3-word" aria-label="might">
                might
              </span>{' '}
              — not fully convinced yet.
            </div>
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
          </div>

          <div className="core3-modal-caps reveal-in" style={{ animationDelay: '340ms' }}>
            <span className="core3-modal-cap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" strokeLinecap="round" />
              </svg>
              Language noticing
            </span>
            <span className="core3-modal-cap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3.5" y="4" width="17" height="14" rx="3" />
                <path d="M8 9h8M8 13h5" strokeLinecap="round" />
              </svg>
              Thread memory
            </span>
            <span className="core3-modal-cap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="8" cy="9" r="2.2" />
                <circle cx="16" cy="9" r="2.2" />
                <path d="M6 20c1-3 3-4 6-4s5 1 6 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Progressive synthesis
            </span>
            <span className="core3-modal-cap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Adjustable depth
            </span>
          </div>
          <p className="core3-modal-summary reveal-in" style={{ animationDelay: '440ms' }}>
            Notices your loaded words in italic serif green, remembers the
            thread, and adjusts its register from casual to{' '}
            <em>philosophical</em>.
          </p>

          <div className="core3-modal-footer reveal-in" style={{ animationDelay: '520ms' }}>
            <label className="core3-modal-checkbox">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
              />
              <span>Don&rsquo;t show again</span>
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
