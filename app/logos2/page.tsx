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

export const metadata: Metadata = {
  title: 'Logos 2 — a workspace you arrange',
  description:
    'Every pane closes and comes back. A Thinking Map, a transcript, and a working surface where the physics is real: a Kerr black hole with integrated geodesics, the thermal history of the universe, and gravity as an N-body integration.',
};

export default function Logos2Page() {
  return <Logos2Workspace />;
}
