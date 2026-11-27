// app/new-logos/(app)/layout.tsx — every signed-in New Logos page. Signed out: to the neutral sign-in. Signed in:
// straight in, with the same account and the same conversations as everywhere else.

import { redirect } from 'next/navigation';
import { signedInOnServer } from '@/components/new-logos/server-auth';
import { Shell } from '@/components/new-logos/Shell';

export const dynamic = 'force-dynamic';

export default function NewLogosAppLayout({ children }: { children: React.ReactNode }) {
  if (!signedInOnServer()) redirect('/new-logos/sign-in');
  return <Shell>{children}</Shell>;
}
