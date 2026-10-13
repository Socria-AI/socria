// app/one/page.tsx — the Socria One page, at its own address.
import type { Metadata } from 'next';
// one.css is NOT imported: it styles `.one-root`, the root of OneStory,
// which this page replaced and which nothing renders — 28KB matching nothing.
// The live page is `.jr-root one-issue`, styled by journal.css.
import { OneIssue } from './OneIssue';
import { priceWithPeriod } from '@/lib/socria-one';
import '../journal.css';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/one',
  title: 'Socria One — the complete reasoning environment',
  absolute: true,
  description: `Socria One. Everything Socria does, without the ceiling: no daily count, in Core or in Logos. ${priceWithPeriod()}.`,
});

export default function OnePage() {
  return <OneIssue />;
}
