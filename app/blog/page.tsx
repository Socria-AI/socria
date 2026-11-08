// app/blog/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { BlogMast } from '@/components/BlogShell';
import { BlogMotion } from '@/components/BlogMotion';
import { SiteFoot } from '@/components/site/chrome';
import { CoverArt } from '@/components/CoverArt';
import { TopicFilter } from '@/components/TopicFilter';
import { SubscribeForm } from '@/components/SubscribeForm';
import {
  listPosts,
  getFeaturedPost,
  listCategoriesWithCount,
  totalPostCount,
  type PostListItem,
} from '@/sanity/lib/queries';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  path: '/blog',
  title: 'Blog — Notes on thinking clearly',
  description: 'Essays on reasoning, metacognition, and human-first AI. Think for yourself.',
});

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function authorInitial(name: string) {
  return (name?.trim()?.[0] || '·').toUpperCase();
}

export default async function BlogIndex() {
  const [allPosts, featured, categories, total] = await Promise.all([
    listPosts(),
    getFeaturedPost(),
    listCategoriesWithCount(),
    totalPostCount(),
  ]);

  // Drop the featured one out of the latest-essays grid so it doesn't appear twice.
  const gridPosts = allPosts.filter(
    (p) => !featured || p._id !== featured._id
  );

  return (
    <>
      <div className="blog-page">
        <div className="progress" aria-hidden="true" />

        <BlogMast />

        <main id="top">
          {/* MASTHEAD */}
          <section className="mast bg-paper">
            <div className="inner">
              <div className="kicker">
                <span className="eyebrow reveal">
                  <span className="tick" />
                  Blog
                </span>
                <span className="eyebrow dim reveal">Essays on reasoning</span>
              </div>
              <h1>
                Notes on{' '}
                <span className="glyph">
                  <svg viewBox="0 0 40 40">
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                    />
                  </svg>
                </span>{' '}
                thinking <span className="b">clearly.</span>
              </h1>
              <div className="lead-row reveal d1">
                <p className="blurb">
                  Field notes on metacognition, the Socratic method, and building
                  AI that strengthens human judgment instead of replacing it.
                </p>
                <p className="count">
                  {total}
                  <small>
                    {total === 1 ? 'Essay published' : 'Essays published'}
                  </small>
                </p>
              </div>
            </div>
          </section>

          {/* TOPIC RAIL */}
          <section className="topics">
            <TopicFilter topics={categories} totalCount={total} />
          </section>

          {/* FEATURED */}
          {featured && (
            <section className="feature">
              <article className="inner reveal">
                <div className="cover">
                  <CoverArt
                    color={featured.coverColor}
                    shape={featured.coverShape}
                    label="Cover · light meets foundation"
                  />
                </div>
                <div className="body">
                  <div>
                    <div className="tagline">
                      <span className="pill">{featured.category?.name}</span>
                      <span className="dot" />
                      <span className="feat-flag">Editor&rsquo;s note</span>
                    </div>
                    <h2>
                      <Link href={`/blog/${featured.slug}`}>{featured.title}</Link>
                    </h2>
                    <p className="excerpt">{featured.excerpt}</p>
                  </div>
                  <div className="foot">
                    <div className="byline">
                      <span className="ava bg-moss">
                        {authorInitial(featured.authorName)}
                      </span>
                      <span className="who">
                        <span className="nm">{featured.authorName}</span>
                        <span className="mt">
                          {[
                            featured.authorRole,
                            featured.readingMinutes
                              ? `${featured.readingMinutes} min read`
                              : null,
                            formatDate(featured.publishedAt),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </div>
                    <Link href={`/blog/${featured.slug}`} className="readlink">
                      Read essay{' '}
                      <span className="circ" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </div>
                </div>
              </article>
            </section>
          )}

          {/* POSTS GRID */}
          <section className="posts">
            <div className="inner">
              <div className="grid-head reveal">
                <h3>Latest essays</h3>
                <span className="nt">Fresh thinking, slowly</span>
              </div>
              {gridPosts.length === 0 ? (
                <p
                  className="dim"
                  style={{
                    fontFamily: 'var(--serif)',
                    fontStyle: 'italic',
                    fontSize: '1.1rem',
                  }}
                >
                  No essays yet.
                  {/* Where they are written is the CMS (/studio), which is for
                      the team, not the public: the pointer is a local build's. */}
                  {process.env.NODE_ENV !== 'production' && (
                    <>
                      {' '}Visit{' '}
                      <Link
                        href="/studio"
                        style={{ color: 'var(--moss-700)', textDecoration: 'underline' }}
                      >
                        /studio
                      </Link>{' '}
                      to publish the first one.
                    </>
                  )}
                </p>
              ) : (
                <div className="grid">
                  {gridPosts.map((p, i) => (
                    <PostCard
                      key={p._id}
                      post={p}
                      delay={(i % 3) as 0 | 1 | 2}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* MARQUEE */}
          <div className="marquee" aria-hidden="true">
            <div className="marquee-track">
              {[
                'Questions before conclusions.',
                'Read slowly.',
                'Think for yourself.',
                'Clarity over convenience.',
                'Questions before conclusions.',
                'Read slowly.',
                'Think for yourself.',
                'Clarity over convenience.',
              ].map((s, i) => (
                <span className="it" key={i}>
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* SUBSCRIBE */}
          <section className="subscribe bg-forest">
            <div className="inner">
              <div>
                <h2>
                  What is new in Socria.
                  <br />
                  <span className="b">No noise.</span>
                </h2>
                <p className="sub">
                  The newsletter: written by a person, sent only when there is
                  something to say and never more than every other day. About
                  Socria, never about you. Unsubscribe in one click.
                </p>
                <SubscribeForm />
                <p className="fine">
                  It comes with a free account: tick its box when you sign up,
                  or turn it on under Data &amp; Privacy in the one you have.
                </p>
              </div>
              <div className="aside reveal d2">
                <p className="q">
                  &ldquo;The goal isn&rsquo;t to think less. The goal is to think
                  better.&rdquo;
                </p>
                <p className="meta">From the Socria manifesto</p>
              </div>
            </div>
          </section>
        </main>

        <BlogMotion />
      </div>
      <SiteFoot />
    </>
  );
}

function PostCard({
  post,
  delay,
}: {
  post: PostListItem;
  delay: 0 | 1 | 2;
}) {
  const delayClass = delay === 1 ? ' d1' : delay === 2 ? ' d2' : '';
  return (
    <article
      className={`card reveal${delayClass}`}
      data-topic={post.category?.slug}
    >
      <Link className="surface" href={`/blog/${post.slug}`}>
        <div className="cover">
          <CoverArt
            color={post.coverColor}
            shape={post.coverShape}
            label={post.category?.name}
            className="ovl"
          />
        </div>
        <div className="meta-top">
          <span className="pill">{post.category?.name}</span>
          {post.readingMinutes && (
            <span className="rt">{post.readingMinutes} min</span>
          )}
        </div>
        <h4>{post.title}</h4>
        <p className="ex">{post.excerpt}</p>
        <p className="by">
          <span className="nb">{post.authorName}</span> ·{' '}
          {formatDate(post.publishedAt)}
        </p>
      </Link>
    </article>
  );
}
