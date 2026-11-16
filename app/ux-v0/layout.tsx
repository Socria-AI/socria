// app/ux-v0/layout.tsx — how SocriaUX v0 introduces itself. Not indexed: it is a v0.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SocriaUX v0 — reason through the design',
  description: 'A Human-First design environment: Socratic design generation, design import and inspection, and Socratic critique.',
  robots: { index: false, follow: false },
};

export default function UXV0Layout({ children }: { children: React.ReactNode }) {
  return children;
}
