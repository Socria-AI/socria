// app/page.tsx — Socria — Issue No. 4 · the interrogation.
//
// The homepage is the journal, and the journal is the product arguing for
// itself by running: eight questions, four readings, a live fourteen-step
// demonstration of Socria declining to write a conclusion, and a close that
// admits the last question was always the reader's.
//
// This file stays a SERVER component and does almost nothing, because the
// issue itself has to be a client one — its reveal, word-splitting and
// scroll-scrubbing are direct DOM work (see components/journal/drivers.ts).
// Keeping the metadata out here means the page is still statically described
// for crawlers and social cards even though its body only lives once React has
// mounted.
//
// The stylesheet is imported here rather than inside the client component so
// it is part of the route's CSS from the first paint. Everything in it is
// scoped to `.jr-root`; see the header of app/journal.css for why.

import type { Metadata } from 'next';
import { JournalIssue } from '@/components/journal/JournalIssue';
import './journal.css';

export const metadata: Metadata = {
  title: 'Socria Logos 3 — AI that makes you better at thinking',
  description:
    'Introducing Logos 3: say what you are working through and it becomes a workspace beside you — a map of your reasoning, models the engine solves, and designs drawn in 3D from your words — that you can move, compute and ask about by name. Issue No. 4 of the Socria Journal.',
};

export default function Page() {
  return <JournalIssue />;
}
