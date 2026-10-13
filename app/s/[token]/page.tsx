// /s/<token> — a share link. Joins at the link's role and opens what it shares.
import { AcceptShare } from '@/components/share/AcceptShare';
import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

// A person's own link or view: never a search result.
export const metadata: Metadata = NOINDEX;

export const dynamic = 'force-dynamic';

export default function SharePage({ params }: { params: { token: string } }) {
  return <AcceptShare token={params.token} kind="link" />;
}
