// app/docs/page.tsx — the wiki's front door.
import type { Metadata } from 'next';
import { CONTENT } from './content/index';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/docs',
  title: 'Socria Docs — how the whole thing works',
  absolute: true,
  description:
    'The Socria documentation: Logos 5, every feature of the reasoning environment, Socria One, and the models before it.',
});

export default function DocsIndex() {
  const Overview = CONTENT['overview'];
  return <Overview />;
}
