'use client';

// The Socria One screen.
//
// It is not a pricing table. What someone is deciding here is whether to keep
// the reasoning environment they have just been using, so the page reads like
// the frontispiece of a volume rather than a plan comparison: the mark, the
// name, one line about what it is, then what it opens — each written as a
// capability of thinking, never as an amount of AI.
//
// Prussian blue is One's colour; Logos keeps its greens. That's the whole
// visual difference, and it's enough.

import { useEffect, useState } from 'react';
import { LogosMark } from './LogosMark';
import { ONE_FEATURES, SOCRIA_ONE } from '@/lib/socria-one';

export function SocriaOneModal({
  open,
  onClose,
  onUnlock,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  /** returns true when the typed key is good */
  onUnlock: (key: string) => boolean;
  /** the boundary they walked into, so the page opens where they are */
  reason?: string;
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
          <span className="lg-one-mark" aria-hidden="true">
            <LogosMark size={30} />
          </span>
          <h2 className="lg-one-title">Socria One</h2>
          <p className="lg-one-price">
            <span className="lg-one-amount">
              {SOCRIA_ONE.currency}
              {SOCRIA_ONE.price}
            </span>
            <span className="lg-one-per">/{SOCRIA_ONE.period}</span>
          </p>
          <p className="lg-one-lede">
            {reason ?? 'The complete reasoning environment, opened.'}
          </p>
        </header>

        <ul className="lg-one-list">
          {ONE_FEATURES.map((f) => (
            <li key={f.id} className="lg-one-item">
              <span className="lg-one-tick" aria-hidden="true" />
              <span className="lg-one-item-body">
                <span className="lg-one-item-title">{f.title}</span>
                <span className="lg-one-item-blurb">{f.blurb}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="lg-one-keep">
          Everything you have already thought stays yours — your maps, their
          lineage and your corrections remain open and editable, on any plan.
        </p>

        <div className="lg-one-actions">
          <button type="button" className="lg-one-go" onClick={() => onUnlock('')}>
            Continue to Socria One
          </button>
          <button type="button" className="lg-one-not" onClick={onClose}>
            Not now
          </button>
        </div>

        <form
          className="lg-one-key"
          onSubmit={(e) => {
            e.preventDefault();
            const ok = onUnlock(key);
            setBad(!ok);
            if (ok) setKey('');
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
