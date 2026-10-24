// app/page.tsx — the homepage: "Come out sharper."
//
// The page is components/site/Landing.tsx, from the design project's
// `Socria Landing`. This file stays a server component that names the page
// for search and social cards and carries its structured data.

import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { Landing } from '@/components/site/Landing';
import { DEFAULT_DESCRIPTION, HOME_TITLE, pageMetadata } from '@/lib/seo';
import { organizationLd, softwareApplicationLd, websiteLd } from '@/lib/structured-data';

export const metadata: Metadata = pageMetadata({
  path: '/',
  title: HOME_TITLE,
  absolute: true,
  description: DEFAULT_DESCRIPTION,
  og: 'home',
});

export default function Page() {
  return (
    <>
      <JsonLd data={[organizationLd(), websiteLd(), softwareApplicationLd()]} />
      <Landing />
    </>
  );
}
