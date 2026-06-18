// app/blog/page.tsx
import Link from 'next/link';
import type { Metadata } from 'next';
import { listPosts, formatPostDate } from '@/lib/blog';
import { BlogNav, BlogFoot } from '@/components/BlogShell';

export const metadata: Metadata = {
  title: 'Blog — Socria',
  description:
    'Essays on human-first AI, metacognition, and thinking better in an age of generative answers.',
};

export default function BlogIndex() {
  const posts = listPosts();
  return (
    <div className="blog-root">
      <BlogNav />
      <main className="blog-main">
        <header className="blog-head">
          <p className="eyebrow">
            <span className="tick" />
            The Socria journal
          </p>
          <h1 className="blog-h1">Notes on thinking better.</h1>
          <p className="blog-lede">
            Short essays on human-first AI, metacognition, and the habits that
            keep judgment yours.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="blog-empty">No posts yet.</p>
        ) : (
          <ul className="blog-list">
            {posts.map((p) => (
              <li key={p.slug} className="blog-row">
                <Link href={`/blog/${p.slug}`}>
                  <span className="blog-row-date">{formatPostDate(p.date)}</span>
                  <h2 className="blog-row-title">{p.title}</h2>
                  <p className="blog-row-excerpt">{p.excerpt}</p>
                  <span className="blog-row-cta">
                    Read <span aria-hidden>→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <BlogFoot />
    </div>
  );
}
