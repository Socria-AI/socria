// /s/<token> — a share link. Joins at the link's role and opens what it shares.
import { AcceptShare } from '@/components/share/AcceptShare';

export const dynamic = 'force-dynamic';

export default function SharePage({ params }: { params: { token: string } }) {
  return <AcceptShare token={params.token} kind="link" />;
}
