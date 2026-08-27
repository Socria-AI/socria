// app/docs/page.tsx — the wiki's front door.
import type { Metadata } from 'next';
import { CONTENT } from './content/index';

export const metadata: Metadata = {
  title: 'Socria Docs — how the whole thing works',
  description:
    'The Socria documentation: all three models (Core 2, Core 3.1, Logos), every feature of the reasoning environment, Socria One, and the technical reference.',
};

export default function DocsIndex() {
  const Overview = CONTENT['overview'];
  return <Overview />;
}
