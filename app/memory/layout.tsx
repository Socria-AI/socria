// app/memory/layout.tsx — the Memory page is a client component, so its
// noindex lives here: a person's own memory is never a search result.
import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

export const metadata: Metadata = NOINDEX;

export default function MemoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
