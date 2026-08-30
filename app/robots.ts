// app/robots.ts
//
// Only the real site is indexable.
//
// Every preview deployment had a public URL and no robots directive, so
// unfinished work could be crawled and cached — the most literal sense in
// which development was "public". A preview now refuses every crawler, and
// says so at the protocol level rather than relying on nobody finding it.

import type { MetadataRoute } from 'next';
import { currentEnv, isProduction } from '@/lib/environment';

// Evaluated per request, not baked at build. Next prerenders this route by
// default, which meant it was generated with whatever environment the BUILD
// ran in — and a preview built once and served forever would keep handing out
// production's "Allow: /". The whole point of this file is to be right about
// which deployment is serving it.
export const dynamic = 'force-dynamic';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://socria.app';

export default function robots(): MetadataRoute.Robots {
  if (!isProduction()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Nothing behind sign-in, and nothing that is a person's own work.
        disallow: ['/api/', '/chat', '/account', '/studio'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
