// app/sso-callback/layout.tsx — the page is a client component, so its
// noindex lives here: a sign-in callback is never a search result.
import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

export const metadata: Metadata = NOINDEX;

export default function SsoCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
