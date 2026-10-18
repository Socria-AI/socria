// app/sitemap.ts — /sitemap.xml
//
// robots.txt has pointed search engines here for months, and until now there
// was nothing here. Built from the same lists as the pages themselves
// (lib/seo.ts): the public pages, every docs page, every published post, and
// the student page only while its offer is open.

import type { MetadataRoute } from 'next';
import { sitemapEntries, type PostRef } from '@/lib/seo';
import { listPosts } from '@/sanity/lib/queries';
import { listEvents } from '@/lib/events/store';
import { absoluteUrl } from '@/lib/seo';

// New posts reach the sitemap within the hour, without a deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let posts: PostRef[] = [];
  try {
    posts = (await listPosts()).map((p) => ({ slug: p.slug, publishedAt: p.publishedAt }));
  } catch {
    // No blog configured, or Sanity unreachable: the rest of the site is still listed.
  }
  // Public events that are open for RSVP (never drafts, never cancelled ones).
  let events: MetadataRoute.Sitemap = [];
  try {
    events = (await listEvents())
      .filter((e) => e.status === 'open')
      .map((e) => ({ url: absoluteUrl(`/events/${e.id}`), lastModified: new Date(e.updated_at), changeFrequency: 'weekly' as const, priority: 0.6 }));
  } catch {
    // No database here: the rest of the site is still listed.
  }
  return [...sitemapEntries({ now: Date.now(), posts }), ...events];
}
