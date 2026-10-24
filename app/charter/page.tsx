// app/charter/page.tsx — the Socria Charter. The page is
// components/site/Charter.tsx, from the design project's `Socria Charter`;
// the same text is kept as a PDF at /socria-charter.pdf.
import type { Metadata } from 'next';
import { Charter } from '@/components/site/Charter';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/charter',
  title: 'The Socria Charter',
  description:
    'The founding constitution of Socria: artificial intelligence built for one purpose, human enhancement. The machines work for us. Not the other way around.',
  og: 'charter',
});

export default function CharterPage() {
  return <Charter />;
}
