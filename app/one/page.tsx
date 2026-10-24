// app/one/page.tsx — Socria One, at its own address. The page is
// components/site/One.tsx, from the design project's `Socria One`.
import type { Metadata } from 'next';
import { One } from '@/components/site/One';
import { priceWithPeriod } from '@/lib/socria-one';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/one',
  title: 'Socria One — everything Socria does, without the ceiling',
  absolute: true,
  description: `Socria One: no daily count, lines of thinking as you need them, longer documents, and personalisation that learns how you reason. ${priceWithPeriod()}. Socria is free to start.`,
});

export default function OnePage() {
  return <One />;
}
