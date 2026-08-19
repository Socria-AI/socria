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
  // a flag planted — something asserted
  claim: (
    <>
      <path d="M4.6 13.4V3" />
      <path d="M4.6 3.4h7.2l-1.7 2.4 1.7 2.4H4.6" />
    </>
  ),
  // the arrow that comes back the other way
  counterpoint: (
    <>
      <path d="M13 6H5.4" />
      <path d="M7.6 3.6 5 6l2.6 2.4" />
      <path d="M3 12h8" strokeDasharray="1.8 1.8" />
    </>
  ),
  // a book — where the fact came from, not the fact
  source: (
    <>
      <path d="M2.8 3.6h4.2c.6 0 1 .4 1 1v8c0-.6-.4-1-1-1H2.8Z" />
      <path d="M13.2 3.6H9c-.6 0-1 .4-1 1v8c0-.6.4-1 1-1h4.2Z" />
    </>
  ),
  // held in the mind — an idea being understood rather than argued
  concept: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 5.8V3.2M8 10.2v2.6M5.8 8H3.2M10.2 8h2.6" strokeDasharray="1.4 1.6" />
    </>
  ),
  // a crossed path — understood wrongly
  misconception: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />
    </>
  ),
  // a thread running through
  theme: (
    <path d="M2.6 10.4c1.6-4.4 3.2-4.4 4.8 0s3.2 4.4 4.8 0" />
  ),
  // a figure
  character: (
    <>
      <circle cx="8" cy="5.6" r="2.4" />
      <path d="M3.6 13.4a4.4 4.4 0 0 1 8.8 0" />
    </>
  ),
  // walls — a fixed limit
  constraint: (
    <>
      <path d="M3.2 3v10M12.8 3v10" />
      <path d="M5.8 8h4.4" />
      <path d="M8.4 6.2 10.6 8l-2.2 1.8" />
    </>
  ),
  // a marker on the way
  milestone: (
    <>
      <path d="M5 13.4V2.8" />
      <path d="M5 3.4h6.6l-1.2 2.2 1.2 2.2H5" fill="currentColor" fillOpacity="0.14" />
    </>
  ),

  // ── mathematics ──
  // given — a value handed to you, in brackets
  given: (
    <>
      <path d="M6 3H4.2v10H6M10 3h1.8v10H10" />
      <path d="M8 7.6v.8" />
    </>
  ),
  // unknown — the x you solve for
  unknown: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  // equation — the balance of an equals sign
  equation: (
    <>
      <path d="M3 6.4h10M3 9.6h10" />
    </>
  ),
  // definition — a labelled marker (≝)
  definition: (
    <>
      <path d="M3 6h10M3 9h10" />
      <path d="M8 3.4v.6M8 11.4v.6" />
    </>
  ),
  // transformation — an operation carrying one thing to another
  transformation: (
    <>
      <path d="M3 8h8" />
      <path d="M8.4 5.4 11 8l-2.6 2.6" />
      <circle cx="3" cy="8" r="0.6" fill="currentColor" />
    </>
  ),
  // theorem — a rule invoked, a stamped seal
  theorem: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M5.6 8.2 7.2 9.8 10.4 6.4" />
    </>
  ),
  // step — one stair on the way down
  step: (
    <path d="M3 4.5h3.5V8H10v3.5h3" strokeLinejoin="round" />
  ),
  // inference — therefore (∴)
  inference: (
    <>
      <circle cx="8" cy="4.6" r="0.7" fill="currentColor" />
      <circle cx="5.4" cy="10" r="0.7" fill="currentColor" />
      <circle cx="10.6" cy="10" r="0.7" fill="currentColor" />
    </>
  ),
  // verification — a checked box
  verification: (
    <>
      <rect x="3.2" y="3.6" width="9.6" height="8.8" rx="1.4" />
      <path d="M5.6 8.2 7.2 9.8 10.6 6" />
    </>
  ),
  // result — the boxed answer, doubled edge
  result: (
    <>
      <rect x="2.8" y="4" width="10.4" height="8" rx="1" />
      <rect x="4.4" y="5.6" width="7.2" height="4.8" rx="0.6" opacity="0.5" />
    </>
  ),
  // error — where it diverged
  error: (
    <>
      <path d="M8 2.8 14 12.6H2Z" />
      <path d="M8 6.4v3M8 11h.01" />
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
