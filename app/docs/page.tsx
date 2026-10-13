// app/docs/page.tsx — the wiki's front door.
import type { Metadata } from 'next';
import { CONTENT } from './content/index';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/docs',
  title: 'Socria Docs — how the whole thing works',
  absolute: true,
  description:
    'The Socria documentation: every model (Core and Logos), every feature of the reasoning environment, and Socria One.',
});

export default function DocsIndex() {
  const Overview = CONTENT['overview'];
  return <Overview />;
}
