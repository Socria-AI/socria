// app/account/layout.tsx — a person's account (billing, data, their picture): never a search result. Signing in is what
// protects it; this only keeps the address out of an index, here and on the response's X-Robots-Tag (next.config.js).
import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

export const metadata: Metadata = { title: 'Account', ...NOINDEX };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
