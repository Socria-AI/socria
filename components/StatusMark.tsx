// A node's standing, drawn small. Reasoning settles — a question gets answered,
// an assumption earns its evidence, a belief is replaced — and the map should
// show that happening rather than quietly rewriting itself.

import type { LogosNodeStatus } from '@/lib/logos';

const TITLE: Record<Exclude<LogosNodeStatus, 'open'>, string> = {
  supported: 'Backed by evidence you gave',
  resolved: 'You resolved this',
  revised: 'Replaced by a later version',
};

export function StatusMark({ status }: { status: LogosNodeStatus }) {
  if (status === 'open') return null;

  return (
    <span className={`lg-status lg-status-${status}`} title={TITLE[status]}>
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {status === 'resolved' && (
          <path d="M2.5 6.3 5 8.6 9.5 3.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {status === 'supported' && (
          // a base line with weight resting on it
          <>
            <path d="M2 9.5h8" strokeLinecap="round" />
            <path d="M6 8.6V3.2M3.8 5.2 6 3l2.2 2.2" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {status === 'revised' && (
          // a turn away from where it was
          <path
            d="M9.4 4.2H4.6a2.4 2.4 0 0 0 0 4.8h1.2M7.6 2.4l1.9 1.8-1.9 1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span className="lg-status-word">{status}</span>
    </span>
  );
}
