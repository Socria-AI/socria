// app/one/page.tsx — Socria One, at its own address. The page is
// components/site/One.tsx, from the design project's `Socria One`.
import type { Metadata } from 'next';
import { One } from '@/components/site/One';
import { priceWithPeriod } from '@/lib/socria-one';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/one',
  // the title fits a result whole; what the plan holds is the description's, read from the plan table
  title: 'Socria One — Socria without a daily limit',
  absolute: true,
  description: `Socria without a daily limit: unlimited conversations, Logic Maps and artifacts, longer documents and Socria Voice. ${priceWithPeriod()}. Every account starts free.`,
});

export default function OnePage() {
  return <One />;
}
