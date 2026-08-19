'use client';

// What came back from a draft action. It sits beside the writing and stays
// inert: even Refine's proposal has to be applied by hand, because the moment
// a suggestion lands on the page by itself the authorship has moved.

import { DRAFT_ACTION_META, type DraftResponse } from '@/lib/logos-draft';
import { MathText } from './TeX';

export function DraftResponsePanel({
  open,
  loading,
  error,
  action,
  selection,
  data,
  onApply,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  action: string;
  selection: string;
  data: DraftResponse | null;
  /** hand the proposal to the draft — only ever called from the button */
  onApply: (text: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const meta = DRAFT_ACTION_META[action as keyof typeof DRAFT_ACTION_META];

  return (
    <div className="lg-dr" role="dialog" aria-label={`${meta?.label ?? 'Draft'} response`}>
      <header className="lg-dr-head">
        <span className="lg-dr-action">{meta?.label ?? action}</span>
        <button type="button" onClick={onClose} className="lg-x-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <blockquote className="lg-dr-sel">{selection}</blockquote>

      <div className="lg-dr-body">
        {loading && (
          <div className="lg-x-loading">
            <span className="lg-thinking" aria-label="Working">
              <span /> <span /> <span />
            </span>
            <p>Reading what you wrote…</p>
          </div>
        )}

        {error && !loading && <p className="lg-x-error">{error}</p>}

        {data && !loading && (
          <>
            {data.body && (
              <p className="lg-dr-prose">
                <MathText>{data.body}</MathText>
              </p>
            )}

            {!!data.points?.length && (
              <ul className="lg-dr-points">
                {data.points.map((p, i) => (
                  <li key={i}><MathText>{p}</MathText></li>
                ))}
              </ul>
            )}

            {data.proposal && (
              <div className="lg-dr-proposal">
                <span className="lg-x-block-label">Proposed wording</span>
                <p><MathText>{data.proposal}</MathText></p>
                {!!data.changes?.length && (
                  <ul className="lg-dr-changes">
                    {data.changes.map((c, i) => (
                      <li key={i}><MathText>{c}</MathText></li>
                    ))}
                  </ul>
                )}
                <div className="lg-dr-actions">
                  <button type="button" className="lg-dr-apply" onClick={() => onApply(data.proposal!)}>
                    Use this
                  </button>
                  <button type="button" className="lg-dr-keep" onClick={onClose}>
                    Keep mine
                  </button>
                </div>
                <p className="lg-dr-fine">
                  Nothing changes on the page unless you choose it.
                </p>
              </div>
            )}

            {data.action === 'trace' && (
              <p className="lg-dr-fine">
                {data.nodeIds?.length
                  ? 'Lit up on the map beside you.'
                  : 'Nothing in your map supports this passage yet.'}
              </p>
            )}

            {!!data.sources?.length && (
              <div className="lg-x-sources">
                <span className="lg-x-sources-label">Sources</span>
                {data.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                    <span className="lg-x-src-title">{s.title}</span>
                    <span className="lg-x-src-site">
                      {s.site} <span aria-hidden="true">↗</span>
                    </span>
                  </a>
                ))}
              </div>
            )}

            {data.question && (
              <p className="lg-x-question">
                <MathText>{data.question}</MathText>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
