'use client';

// The Socria One plan sheet: what each plan holds, side by side, and one way
// to upgrade. It is drawn in Logos 5's own paper (components/one/one-sheet.css)
// — the surface, ink, serif and hairlines of every other sheet in here — with
// Socria One's blue kept for what it means: the monogram, the name, the One
// column and the button that buys it. It used to be the /one cover's dark plate
// set over the conversation, which read as a page from somewhere else.
//
// What someone decides here is whether Socria is worth $15 a month to them, so
// the sheet says plainly what each plan holds — the free plan's allowances
// beside Socria One's, from the one table in lib/entitlements.ts — and, when
// it opened at a limit, says that first. One button to upgrade, one to carry
// on free. (The access-code field that lived at the bottom is gone with the
// codes: Socria One is paid for or it is not held, October 31, 2026.)

import { useEffect, useId, useRef } from 'react';
import { SOCRIA_ONE } from '@/lib/socria-one';
import { comparisonRows, LIMIT_HEADLINE } from '@/lib/entitlements';
import './one/one-sheet.css';
import './logos5/l5-controls.css';

/** The ✓ in the One column: drawn, so it is the same weight in every font. */
export function OneCheck() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.2 8.4l3 3 6.6-6.8" />
    </svg>
  );
}

export function OneClose() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function SocriaOneModal({
  open,
  onClose,
  onUnlock,
  reason,
  limited,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with '' for the subscribe button: it redirects to Stripe and never resolves in this page's lifetime. */
  onUnlock: (key: string) => boolean | Promise<boolean>;
  /** the boundary they walked into, so the page opens where they are */
  reason?: string;
  /** opened at a free limit: the sheet says so first, in the same words every limit uses */
  limited?: boolean;
  /** checkout is being opened */
  busy?: boolean;
  /** checkout could not be reached */
  error?: string | null;
}) {
  const id = useId();
  const goRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // the way on has the focus, so a keyboard user is not left behind the page
    goRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const rows = comparisonRows();
  const price = `${SOCRIA_ONE.currency}${SOCRIA_ONE.price}`;

  return (
    <div className="os-scrim" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}>
      <div className="os-back" onClick={onClose} aria-hidden="true" />
      <div className="os-sheet is-wide">
        <span className="os-grab" aria-hidden="true" />
        <button type="button" className="os-x l5-icon" onClick={onClose} aria-label="Close">
          <OneClose />
        </button>

        <p className="os-brand">
          <span className="os-mono" aria-hidden="true">
            <span>I</span>
          </span>
          Socria One
          <span className="os-price">
            {price} a {SOCRIA_ONE.period}
          </span>
        </p>

        <h2 className="os-title" id={`${id}-t`}>
          {limited ? LIMIT_HEADLINE : 'Unlimited Socria'}
        </h2>
        <p className="os-sub" id={`${id}-s`}>
          {reason ?? 'Conversations, Logic Maps, artifacts and documents without a monthly count — with Socria Voice and sharing, which only Socria One includes.'}
        </p>

        {/* what each plan holds, from the one table (lib/entitlements.ts) — never a number written here */}
        <div className="os-cmp-wrap">
          <table className="os-cmp">
            <caption className="os-sr">Free compared with Socria One</caption>
            <thead>
              <tr>
                <td />
                <th scope="col">Free</th>
                <th scope="col" className="is-one">
                  Socria One
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.label}</th>
                  {r.free === 'Not included' ? (
                    <td className="is-no">
                      <span aria-hidden="true">—</span>
                      <span className="os-sr">Not included</span>
                    </td>
                  ) : (
                    <td>{r.free}</td>
                  )}
                  <td className="is-one">
                    <span className="os-check">
                      <OneCheck />
                      {r.one}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="os-err" role="alert">
            {error}
          </p>
        )}

        <div className="os-actions">
          <button ref={goRef} type="button" className="l5-btn is-primary is-one is-wide" onClick={() => void onUnlock('')} disabled={busy}>
            {busy ? (
              'Opening checkout…'
            ) : (
              <>
                {`Upgrade to Socria One — ${price}/${SOCRIA_ONE.period}`}
                <span className="l5-ar" aria-hidden="true">
                  →
                </span>
              </>
            )}
          </button>
          <button type="button" className="l5-btn is-quiet" onClick={onClose}>
            Not now — keep the free plan
          </button>
        </div>

        <p className="os-foot">
          Cancel anytime. Everything you’ve made stays yours. <a href="/one">Compare the plans</a>
        </p>
      </div>
    </div>
  );
}
