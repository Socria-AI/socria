// app/docs/[slug]/page.tsx — every wiki page except the front door.
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DOC_PAGES, docPage } from '../registry';
import { CONTENT } from '../content/index';
import { JsonLd } from '@/components/JsonLd';
import { docPath, pageMetadata } from '@/lib/seo';
import { breadcrumbLd } from '@/lib/structured-data';

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
