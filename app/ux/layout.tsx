// app/ux/layout.tsx — SocriaUX's address and how it introduces itself.
// The page is a client component (it needs the session and the browser's
// store), so what a shared link says about it lives here.

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/ux',
  title: 'SocriaUX — human-first design reasoning',
  description:
    'A design workspace with a Socratic reasoning system beside it: critique, assumptions, research and implementation, connected to the design itself. It helps designers become better designers.',
});

export default function UXLayout({ children }: { children: React.ReactNode }) {
  return children;
}
