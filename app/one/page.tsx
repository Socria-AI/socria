// app/one/page.tsx — Socria One, at its own address. The page is
// components/site/One.tsx, from the design project's `Socria One`.
import type { Metadata } from 'next';
import { One } from '@/components/site/One';
import { onePlanSentence } from '@/lib/entitlements';
import { priceWithPeriod } from '@/lib/socria-one';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/one',
  title: 'Socria One — unlimited Socria, with Voice and sharing',
  absolute: true,
  description: `Socria One: ${onePlanSentence().replace(/^U/, 'u')}, longer documents, and personalisation that learns how you reason. ${priceWithPeriod()}. Socria is free to start.`,
});

export default function OnePage() {
  return <One />;
}
