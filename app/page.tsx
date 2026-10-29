// app/page.tsx — the homepage: "Come out sharper."
//
// The page is components/site/Landing.tsx, from the design project's
// `Socria Landing`. This file stays a server component that names the page
// for search and social cards and carries its structured data.
//
// WHILE THE RELAUNCH RUNS (lib/takeover.ts) the homepage is the campaign
// instead — components/campaign/Campaign.tsx: black, "WE KILLED THE CHATBOT.",
// and a field for the access code — with nothing else said, not even in the
// structured data. It is also what the middleware shows at Logos 5's own
// addresses to somebody who has not entered the code. SOCRIA_TAKEOVER=off
// brings the landing back exactly as it was.

import type { Metadata, Viewport } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { Landing } from '@/components/site/Landing';
import { Campaign } from '@/components/campaign/Campaign';
import { CAMPAIGN_LINE } from '@/lib/campaign';
import { takeoverOn } from '@/lib/takeover';
import { DEFAULT_DESCRIPTION, HOME_TITLE, pageMetadata } from '@/lib/seo';
import { organizationLd, softwareApplicationLd, websiteLd } from '@/lib/structured-data';

const TAKEOVER = takeoverOn();

export const metadata: Metadata = TAKEOVER
  ? pageMetadata({ path: '/', title: CAMPAIGN_LINE, absolute: true, description: CAMPAIGN_LINE, og: 'campaign' })
  : pageMetadata({
      path: '/',
      title: HOME_TITLE,
      absolute: true,
      description: DEFAULT_DESCRIPTION,
      og: 'home',
    });

// black to the edges of a phone's browser, too
export const viewport: Viewport = TAKEOVER ? { themeColor: '#000000', colorScheme: 'dark' } : {};

export default function Page() {
  if (TAKEOVER) return <Campaign />;
  return (
    <>
      <JsonLd data={[organizationLd(), websiteLd(), softwareApplicationLd()]} />
      <Landing />
    </>
  );
}
