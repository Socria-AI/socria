'use client';

// A small mark per node type. The glyph does the identifying work before the
// label is read — a target for a goal, a fork for a decision, a dashed ring
// for an assumption that hasn't been examined, opposing arrows for tension.

import type { LogosNodeType } from '@/lib/logos';

const PATHS: Record<LogosNodeType, JSX.Element> = {
  // target — what you are aiming at
  goal: (
    <>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.4" />
    </>
  ),
  // a fork in the path
  decision: (
    <>
      <path d="M8 14V9" />
      <path d="M8 9 3.5 4.5M8 9l4.5-4.5" />
    </>
  ),
  // diamond — the thing held underneath
  value: <path d="M8 2.4 13.6 8 8 13.6 2.4 8Z" />,
  // quote bars — a position held
  belief: (
    <>
      <path d="M4 5v6M7 5v6" />
      <path d="M10.5 8h3" />
    </>
  ),
  // spark
  idea: (
    <>
      <circle cx="8" cy="7" r="3.6" />
      <path d="M6.4 12.6h3.2" />
    </>
  ),
  // dashed ring — provisional, unexamined
  assumption: <circle cx="8" cy="8" r="5.6" strokeDasharray="2.6 2.4" />,
  // a page with a line of record
  evidence: (
    <>
      <path d="M4 2.8h6l2.2 2.2v8.2H4Z" />
      <path d="M6.2 8.4h4M6.2 10.8h2.6" />
    </>
  ),
  question: (
    <>
      <path d="M5.9 6.1a2.1 2.1 0 1 1 2.9 1.95c-.6.28-.8.7-.8 1.25v.5" />
      <path d="M8 12.4h.01" />
    </>
  ),
  // pulling apart
  tension: (
    <>
      <path d="M6.4 5.2 3.2 8l3.2 2.8M9.6 5.2 12.8 8l-3.2 2.8" />
      <path d="M8 3.6v8.8" strokeDasharray="1.6 1.8" />
    </>
  ),
  // what follows
  consequence: (
    <>
      <path d="M3.4 4v4.2a2.4 2.4 0 0 0 2.4 2.4h6.8" />
      <path d="M10.4 8.4l2.4 2.2-2.4 2.2" />
    </>
  ),
};

export function NodeGlyph({ type }: { type: LogosNodeType }) {
  return (
    <svg
      className="lg-node-glyph"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[type]}
    </svg>
  );
}
