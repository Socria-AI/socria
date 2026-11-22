// app/logos2/page.tsx — Logos 2, arranged by whoever is using it.
//
// The working surfaces are the real ones (components/surfaces) and the map is
// the real ThinkingMap on a real map. The transcript is a worked example rather
// than a live conversation: wiring this shell onto the running Logos session is
// the next step, and it is a wiring job, not a design one — the panes take
// children and do not care where they came from.

import type { Metadata } from 'next';
import { Logos2Workspace } from './Logos2Workspace';
import './logos2.css';
import { pageMetadata } from '@/lib/seo';

// A prototype of the archived Logos 2 workspace (docs: Earlier Socria). It stays at its address for anyone with a link,
// out of search: its physics is /surfaces', which is indexed, and its history is /docs/logos-2.
export const metadata: Metadata = pageMetadata({
  path: '/logos2',
  title: 'Logos 2 — a workspace you arrange',
  description: 'A prototype of the Logos 2 workspace, an earlier Socria: a Thinking Map, a transcript and a working surface, each pane closed and brought back.',
  noindex: true,
});

export default function Logos2Page() {
  return <Logos2Workspace />;
}
