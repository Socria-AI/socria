// app/blog/[slug]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPost, listPosts, formatPostDate } from '@/lib/blog';
import { BlogNav, BlogFoot } from '@/components/BlogShell';

export function generateStaticParams() {
  return listPosts().map((p) => ({ slug: p.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const post = getPost(params.slug);
  if (!post) return { title: 'Not found — Socria' };
  return {
    title: `${post.title} — Socria`,
    description: post.excerpt,
  };
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();

  return (
    <div className="blog-root">
      <BlogNav />
      <article className="blog-article">
        <p className="eyebrow">
          <span className="tick" />
          {formatPostDate(post.date)}
        </p>
        <h1 className="blog-post-title">{post.title}</h1>
        {post.excerpt && <p className="blog-post-lede">{post.excerpt}</p>}
        <div
          className="blog-prose"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
        <div className="blog-post-end">
          <Link href="/blog" className="blog-back">
            <span aria-hidden>←</span> All posts
          </Link>
          <Link href="/chat" className="blog-post-cta">
            Start a thought session <span aria-hidden>→</span>
          </Link>
        </div>
      </article>
      <BlogFoot />
    </div>
  );
}
