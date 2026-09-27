// app/logos2-test/page.tsx — the hand-tracking bench for the Thinking Map.
//
// A bench rather than a feature, in the same spirit as /camera-test: it exists
// to find out whether direct manipulation is actually better than a pointer
// for this surface, which building it does not settle.

import type { Metadata } from 'next';
import { Logos2Test } from './Logos2Test';
import './logos2-test.css';

export const metadata: Metadata = {
  title: 'Logos 2 · hands — Socria',
  description:
    'Move a thinking map with your hands: pinch to pick a node up, hold two fingers to research it, three to challenge it, a closed hand to delete. The video never leaves the device.',
  robots: { index: false, follow: false },
};

export default function Logos2TestPage() {
  return <Logos2Test />;
}
