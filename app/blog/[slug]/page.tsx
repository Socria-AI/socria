// app/blog/[slug]/page.tsx
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import { BlogNav, BlogFooter } from '@/components/BlogShell';
import { BlogMotion } from '@/components/BlogMotion';
import { CoverArt } from '@/components/CoverArt';
import { getPostBySlug, listPostSlugs } from '@/sanity/lib/queries';

export const revalidate = 60;

export async function generateStaticParams() {
  return (await listPostSlugs()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = await getPostBySlug(params.slug);
  if (!post) return { title: 'Not found — Socria' };
  return {
    title: `${post.title} — Socria Blog`,
    description: post.excerpt,
  };
}

function formatDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const ptComponents: PortableTextComponents = {
  marks: {
    link: ({ children, value }) => (
      <a href={value?.href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  },
};

export default async function BlogPost({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getPostBySlug(params.slug);
  if (!post) notFound();

  return (
    <div className="blog-page">
      <div className="progress" aria-hidden="true" />

      <BlogNav />

      <article className="post-page">
        <header className="post-hero">
          <div className="inner">
            <div className="post-tagline reveal">
              <span className="pill">{post.category?.name}</span>
              <span className="dot" />
              <span className="post-date">{formatDate(post.publishedAt)}</span>
              {post.readingMinutes && (
                <>
                  <span className="dot" />
                  <span className="post-date">
                    {post.readingMinutes} min read
                  </span>
                </>
              )}
            </div>
            <h1 className="reveal d1">{post.title}</h1>
            {post.excerpt && (
              <p className="post-lede reveal d2">{post.excerpt}</p>
            )}
            <div className="post-byline reveal d2">
              <span className="ava bg-moss">
                {(post.authorName?.[0] || '·').toUpperCase()}
              </span>
              <span className="who">
                <span className="nm">{post.authorName}</span>
                {post.authorRole && (
                  <span className="mt">{post.authorRole}</span>
                )}
              </span>
            </div>
          </div>
        </header>

        <div className="post-cover">
          <CoverArt
            color={post.coverColor}
            shape={post.coverShape}
            label={post.category?.name}
          />
        </div>

        <div className="post-body">
          <div className="post-prose">
            {post.body ? (
              <PortableText value={post.body} components={ptComponents} />
            ) : (
              <p>
                <em>This post has no body yet.</em>
              </p>
            )}
          </div>

          <div className="post-end">
            <Link href="/blog" className="post-back">
              <span aria-hidden>←</span> All essays
            </Link>
            <Link href="/chat" className="btn btn-solid btn-md">
              Start a thought session <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </article>

      <BlogFooter />
      <BlogMotion />
    </div>
  );
}
