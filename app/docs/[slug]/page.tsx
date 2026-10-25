// app/docs/[slug]/page.tsx — every wiki page except the front door.
import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { DOC_PAGES, docPage } from '../registry';
import { CONTENT } from '../content/index';
import { JsonLd } from '@/components/JsonLd';
import { docPath, pageMetadata } from '@/lib/seo';
import { breadcrumbLd } from '@/lib/structured-data';

/**
 * Pages that were taken out of the wiki, and where each address goes now.
 *
 * The pages of the archived chat's three models were taken out after it
 * (docs/ARCHIVE.md). Their conversations open in Logos 5, so their links do
 * too — permanently (308), so a search engine moves the address on rather
 * than keeping a page that is not there.
 */
const MOVED = new Map<string, string>([
  ['core-2', '/docs/logos-5'],
  ['core-3', '/docs/logos-5'],
  ['core-4', '/docs/logos-5'],
]);

// A slug generateStaticParams does not list — /docs/overview, and every
// address in MOVED — still has to reach the page, because the page is what
// sends it on. That is Next's default, said here so it is not switched off
// without seeing what it breaks: with `false`, each of them would be a 404.
export const dynamicParams = true;

export function generateStaticParams() {
  return DOC_PAGES.filter((p) => p.slug !== 'overview').map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const page = docPage(params.slug);
  if (!page) return {};
  return pageMetadata({
    path: docPath(page.slug),
    title: `${page.title} — Socria Docs`,
    absolute: true,
    description: page.blurb,
    og: `docs/${page.slug}`,
  });
}

export default function DocsPage({ params }: { params: { slug: string } }) {
  // /docs/overview is the same page as /docs — one address, not two.
  if (params.slug === 'overview') redirect('/docs');
  // A page that was taken out: its address goes where its readers are now.
  const moved = MOVED.get(params.slug);
  if (moved) permanentRedirect(moved);
  const page = docPage(params.slug);
  const Content = page ? CONTENT[page.slug] : undefined;
  if (!page || !Content) notFound();
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Socria', path: '/' },
          { name: 'Docs', path: '/docs' },
          { name: page.title, path: docPath(page.slug) },
        ])}
      />
      <Content />
    </>
  );
}
