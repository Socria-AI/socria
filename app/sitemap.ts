// app/sitemap.ts — /sitemap.xml
//
// robots.txt has pointed search engines here for months, and until now there
// was nothing here. Built from the same lists as the pages themselves
// (lib/seo.ts): the public pages, every docs page, every published post, and
// the student page only while its offer is open.

import type { MetadataRoute } from 'next';
import { sitemapEntries, type PostRef } from '@/lib/seo';
import { listPosts } from '@/sanity/lib/queries';

// New posts reach the sitemap within the hour, without a deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let posts: PostRef[] = [];
  try {
    posts = (await listPosts()).map((p) => ({ slug: p.slug, publishedAt: p.publishedAt }));
  } catch {
    // No blog configured, or Sanity unreachable: the rest of the site is still listed.
  }
  return sitemapEntries({ now: Date.now(), posts });
}
