'use client';

// The Socria One screen, styled after the design project's invitation spread:
// a Prussian-blue plate with an inner rule, the italic "I" monogram in its
// ring, serif headline, six capabilities with hand-drawn glyphs, and a cream
// call-to-action. Logos keeps its greens; this is the one place it reaches
// for blue.
//
// What someone decides here is whether Socria is worth $15 a month to them, so
// the sheet says plainly what each plan holds — the free plan's allowances
// beside Socria One's, from the one table in lib/entitlements.ts — and, when
// it opened at a limit, says that first. One button to upgrade, one to carry
// on free. (The access-code field that lived at the bottom is gone with the
// codes: Socria One is paid for or it is not held, October 31, 2026.)

import { useEffect } from 'react';
import { SOCRIA_ONE } from '@/lib/socria-one';
import { comparisonRows, LIMIT_HEADLINE } from '@/lib/entitlements';

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const rows = comparisonRows();
  const price = `${SOCRIA_ONE.currency}${SOCRIA_ONE.price}`;

  return (
    <div className="lg-one-scrim" role="dialog" aria-modal="true" aria-labelledby="lg-one-title">
      <div className="lg-one-back" onClick={onClose} aria-hidden="true" />
      <div className="lg-one-sheet">
        <button type="button" className="lg-one-x" onClick={onClose} aria-label="Close">
          ×
        </button>

        <header className="lg-one-head">
          <span className="lg-one-mono" aria-hidden="true">
            <span>I</span>
          </span>
          {limited && <p className="lg-one-limit">{LIMIT_HEADLINE}</p>}
          <h2 className="lg-one-title" id="lg-one-title">
            Socria <span className="lg-one-title-one">One</span>
          </h2>
          <p className="lg-one-price">
            <span className="lg-one-amount">{price}</span>
            <span className="lg-one-per">/ {SOCRIA_ONE.period}</span>
          </p>
          <p className="lg-one-lede">{reason ?? 'Unlimited Socria — every conversation, map, artifact and document you need, with Socria Voice and sharing.'}</p>
        </header>

        {/* what each plan holds, from the one table (lib/entitlements.ts) — never a number written here */}
        <table className="lg-one-cmp">
          <caption className="lg-one-sr">Free compared with Socria One</caption>
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
                <td className={r.free === 'Not included' ? 'is-no' : undefined}>{r.free === 'Not included' ? <span aria-label="Not included">—</span> : r.free}</td>
                <td className="is-one">{r.one}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {error && <p className="lg-one-err">{error}</p>}

        <div className="lg-one-actions">
          <button type="button" className="lg-one-go" onClick={() => void onUnlock('')} disabled={busy}>
            {busy ? 'Opening checkout…' : `Upgrade to Socria One — ${price}/${SOCRIA_ONE.period}`} <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="lg-one-not" onClick={onClose}>
            Not now — keep the free plan
          </button>
          <a className="lg-one-more" href="/one">
            Compare the plans →
          </a>
        </div>

        <p className="lg-one-keep">Cancel anytime. Everything you have made stays open and editable, on either plan.</p>
      </div>
    </div>
  );
}
