'use client';

// The chrome the policy pages share: the site's masthead with the policies in
// a row under it, the page you are reading marked, and the site's foot
// (components/site/chrome.tsx). A client component only for the pathname.

import { usePathname } from 'next/navigation';
import { POLICIES, SiteFoot, SiteMast } from '@/components/site/chrome';

export function LegalShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="legal-root">
      <SiteMast sub={{ label: 'Policies', links: POLICIES, current: path }} />
      <main>{children}</main>
      <SiteFoot />
    </div>
  );
}
