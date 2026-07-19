'use client';

import { useEffect, useState } from 'react';

// A short editorial "release note" for Socria Core 3.1 — styled like a page
// from the Socria Journal rather than a product-tour popup.
const DISPATCHES: { n: string; h: string; p: string }[] = [
  {
    n: 'i',
    h: 'A conversation, not a script',
    p: 'It sounds like a person thinking with you — building on what you said, not restarting on every message.',
  },
  {
    n: 'ii',
    h: 'Four depths, four registers',
    p: 'Quick stays fast and grounded; Deep goes rich and exploratory. The mode you pick changes the whole conversation.',
  },
  {
    n: 'iii',
    h: 'It notices your language',
    p: 'The words you lean on surface in italic green — the moment a “maybe” hardens into a “definitely.”',
  },
  {
    n: 'iv',
    h: 'Clearer on the page',
    p: 'When you’re weighing options or planning, it lays the thinking out in tidy lists and comparisons — never a wall of text.',
  },
];

export function Core3IntroModal({
  open,
  onClose,
  onTry,
  onUnlock,
  isSignedIn,
  canUseCore3,
}: {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
  onTry: () => void;
  onUnlock: (key: string) => boolean;
  isSignedIn: boolean;
  canUseCore3: boolean;
}) {
  const [dontShow, setDontShow] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(dontShow);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dontShow, onClose]);

  if (!open) return null;

  const showKeyEntry = !isSignedIn && !canUseCore3;

  function submitKey() {
    const ok = onUnlock(keyInput.trim());
    if (!ok) {
      setKeyError(true);
      return;
    }
    setKeyError(false);
    setKeyInput('');
  }

  return (
    <div
      className="core3-modal-backdrop"
      onClick={() => onClose(dontShow)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="core3-modal-title"
    >
      <div className="core3-modal-card j3-card" onClick={(e) => e.stopPropagation()}>
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

        <div className="j3-masthead">
          <span className="j3-brand">Socria</span>
          <span className="j3-folio">Issue №&nbsp;3 · Core&nbsp;3.1</span>
        </div>

        <div className="j3-body">
          <p className="j3-kicker reveal-in" style={{ animationDelay: '60ms' }}>
            Now live
          </p>
          <h2 id="core3-modal-title" className="j3-title reveal-in" style={{ animationDelay: '130ms' }}>
            A conversation that thinks{' '}
            <span className="j3-title-em">with</span> you.
          </h2>
          <p className="j3-standfirst reveal-in" style={{ animationDelay: '200ms' }}>
            The biggest step yet toward an AI that strengthens your thinking
            instead of doing it for you — and the one that finally stops
            sounding like one.
          </p>

          <ol className="j3-dispatches">
            {DISPATCHES.map((d, i) => (
              <li
                key={d.n}
                className="j3-dispatch reveal-in"
                style={{ animationDelay: `${280 + i * 70}ms` }}
              >
                <span className="j3-dispatch-n">{d.n}.</span>
                <div>
                  <h3>{d.h}</h3>
                  <p>{d.p}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="j3-depths reveal-in" style={{ animationDelay: '580ms' }}>
            <span className="j3-depths-label">Set the depth</span>
            <div className="j3-depth-pills">
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

          {showKeyEntry && (
            <div className="core3-modal-key reveal-in" style={{ animationDelay: '640ms' }}>
              <label className="core3-modal-key-label" htmlFor="core3-access-key">
                Have an access key?
              </label>
              <div className="core3-modal-key-row">
                <input
                  id="core3-access-key"
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Enter key"
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    if (keyError) setKeyError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitKey();
                    }
                  }}
                  className={`core3-modal-key-input${keyError ? ' core3-modal-key-input-error' : ''}`}
                  aria-invalid={keyError}
                />
                <button type="button" onClick={submitKey} className="core3-modal-key-btn">
                  Unlock
                </button>
              </div>
              {keyError && (
                <span className="core3-modal-key-error" role="alert">
                  That key isn&rsquo;t right.
                </span>
              )}
            </div>
          )}

          <div className="core3-modal-footer reveal-in" style={{ animationDelay: '700ms' }}>
            <label className="core3-modal-checkbox">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
              />
              <span>Don&rsquo;t show again</span>
            </label>
            <button type="button" onClick={onTry} className="core3-modal-primary">
              <span className="core3-modal-primary-shine" aria-hidden />
              <span className="core3-modal-primary-label">
                {canUseCore3 ? 'Enter Core 3.1' : 'Sign in to unlock'}
              </span>
              <span aria-hidden className="core3-modal-primary-arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
