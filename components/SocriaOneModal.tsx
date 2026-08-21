'use client';

// The Socria One screen, styled after the design project's invitation spread:
// a Prussian-blue plate with an inner rule, the italic "I" monogram in its
// ring, serif headline, six capabilities with hand-drawn glyphs, and a cream
// call-to-action. Logos keeps its greens; this is the one place it reaches
// for blue.
//
// It is not a pricing table. What someone decides here is whether to keep the
// reasoning environment they have just been using, so every line is written
// as a capability of thinking, never as an amount of AI.

import { useEffect, useState } from 'react';
import { ONE_FEATURES, SOCRIA_ONE, type OneFeature } from '@/lib/socria-one';

// The design's glyph per feature family.
function Glyph({ kind }: { kind: OneFeature }) {
  const inner =
    kind === 'map' || kind === 'lenses' || kind === 'conversations' ? (
      <>
        <path d="M3,15 L9,9 M9,9 L5,3 M9,9 L15,4" />
        <circle cx="3" cy="15" r="1.4" />
        <circle cx="5" cy="3" r="1.4" />
        <circle cx="15" cy="4" r="1.4" />
      </>
    ) : kind === 'research' ? (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="M12,12 L16,16" />
      </>
    ) : kind === 'draft' || kind === 'images' ? (
      <path d="M14,3 C10,5 6,9 4,14 M4,14 L3,15 M4,14 L8,13" />
    ) : kind === 'history' ? (
      <>
        <path d="M2,12 C5,8 8,14 11,10 C13,7 15,8 16,6" />
        <circle cx="2" cy="12" r="1.4" />
        <circle cx="16" cy="6" r="1.4" />
      </>
    ) : kind === 'connections' ? (
      <>
        <circle cx="6" cy="9" r="4" />
        <circle cx="12" cy="9" r="4" />
      </>
    ) : (
      <circle cx="9" cy="9" r="6.5" />
    );
  return (
    <span className="lg-one-gl" aria-hidden="true">
      <svg viewBox="0 0 18 18">{inner}</svg>
    </span>
  );
}

export function SocriaOneModal({
  open,
  onClose,
  onUnlock,
  reason,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Called with a typed access code, or with '' for the subscribe button.
   * Resolves true when it worked; the button case redirects to Stripe and
   * never resolves in this page's lifetime.
   */
  onUnlock: (key: string) => boolean | Promise<boolean>;
  /** the boundary they walked into, so the page opens where they are */
  reason?: string;
  /** checkout is being opened */
  busy?: boolean;
  /** checkout could not be reached */
  error?: string | null;
}) {
  const [key, setKey] = useState('');
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lg-one-scrim" role="dialog" aria-modal="true" aria-label="Socria One">
      <div className="lg-one-back" onClick={onClose} aria-hidden="true" />
      <div className="lg-one-sheet">
        <button type="button" className="lg-one-x" onClick={onClose} aria-label="Close">
          ×
        </button>

        <header className="lg-one-head">
          <span className="lg-one-mono" aria-hidden="true">
            <span>I</span>
          </span>
          <h2 className="lg-one-title">
            Socria <span className="lg-one-title-one">One</span>
          </h2>
          <p className="lg-one-price">
            <span className="lg-one-amount">
              {SOCRIA_ONE.currency}
              {SOCRIA_ONE.price}
            </span>
            <span className="lg-one-per">/ {SOCRIA_ONE.period}</span>
          </p>
          <p className="lg-one-lede">
            {reason ?? 'Membership in the complete reasoning environment.'}
          </p>
        </header>

        <ul className="lg-one-list">
          {ONE_FEATURES.map((f) => (
            <li key={f.id} className="lg-one-item">
              <Glyph kind={f.id} />
              <span className="lg-one-item-text">
                <em>{f.title}</em> — {f.blurb}
              </span>
            </li>
          ))}
        </ul>

        {error && <p className="lg-one-err">{error}</p>}

        <div className="lg-one-actions">
          <button
            type="button"
            className="lg-one-go"
            onClick={() => void onUnlock('')}
            disabled={busy}
          >
            {busy ? 'Opening checkout…' : `Become a member — ${SOCRIA_ONE.currency}${SOCRIA_ONE.price}/${SOCRIA_ONE.period}`}{' '}
            <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="lg-one-not" onClick={onClose}>
            continue with the free tier
          </button>
          <a className="lg-one-more" href="/one">
            see everything One opens →
          </a>
        </div>

        <p className="lg-one-keep">
          Cancel anytime. Your maps, their lineage and your corrections remain
          open and editable, at every tier.
        </p>

        <form
          className="lg-one-key"
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              const ok = await onUnlock(key);
              setBad(!ok);
              if (ok) setKey('');
            })();
          }}
        >
          <label htmlFor="lg-one-code" className="lg-one-key-label">
            Have an access code?
          </label>
          <div className="lg-one-key-row">
            <input
              id="lg-one-code"
              className={`lg-one-input${bad ? ' is-bad' : ''}`}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setBad(false);
              }}
              placeholder="Enter code"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="lg-one-apply">
              Apply
            </button>
          </div>
          {bad && <p className="lg-one-bad">That code isn’t right.</p>}
        </form>
      </div>
    </div>
  );
}
