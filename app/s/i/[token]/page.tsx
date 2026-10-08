// /s/i/<token> — an emailed invitation. Accepted only by the account that
// holds the address it was sent to (lib/share/server.ts acceptInvite).
import { AcceptShare } from '@/components/share/AcceptShare';

export const dynamic = 'force-dynamic';

export default function InvitePage({ params }: { params: { token: string } }) {
  return <AcceptShare token={params.token} kind="invite" />;
}
