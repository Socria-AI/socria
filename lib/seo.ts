// lib/seo.ts
//
// How Socria introduces itself to search engines, AI answer engines and link
// previews — in one place, so a page's address, its title, the card a shared
// link shows and the sitemap can never disagree about it.
//
// THE LINE: Think for Yourself. It is what Socria is for — an AI that
// strengthens a person's reasoning instead of doing it for them — and it leads
// the homepage title, the default description and every preview card.
//
// WHAT WENT WRONG BEFORE THIS FILE. The root layout set
// `alternates.canonical: '/'`, and Next.js hands a layout's metadata to every
// page that does not set its own. So every docs page, every blog post, the
// Socria One page and the rest each told search engines it was a copy of the
// homepage, and the sitemap robots.txt pointed at did not exist. Now no layout
// sets a canonical: every public page names its own address through
// pageMetadata(), and the sitemap and llms.txt are built from the same list.
//
// Pure: no request, no React. Pages, the sitemap, llms.txt and the suite call
// it; the clock is a parameter wherever the answer depends on the date.

import type { Metadata, MetadataRoute } from 'next';
import { DOC_PAGES } from '@/app/docs/registry';
import { priceWithPeriod } from './socria-one';
import { STUDENT_OFFER } from './socria-edu';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://socria.app').replace(/\/+$/, '');
export const SITE_NAME = 'Socria';
export const TAGLINE = 'Think for Yourself';

/** The homepage's title: the brand, the line, and what it is, as somebody would search it. */
export const HOME_TITLE = 'Socria — Think for Yourself. AI That Sharpens Your Reasoning';

/**
 * What Socria does, in the words a search result shows. Every clause is true
 * of the product as it ships: the map shows assumptions, open questions and
 * what a view rests on, and Core runs without an account.
 */
export const DEFAULT_DESCRIPTION =
  'Talk it through and see your reasoning take shape: what you’re assuming, what’s missing, what it rests on. Think clearer, decide better. Free, no sign-up.';

/** The address a page is known by, absolute. */
export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return p === '/' ? `${SITE_URL}/` : `${SITE_URL}${p}`;
}

/**
 * The preview card for a page: `/og/<key>`, where the key is the page's path
 * without its leading slash ('home' for the homepage). The card route only
 * draws cards it can look up (lib/og-cards.ts) — nothing in the address
 * becomes words on the image.
 */
export function ogImagePath(key: string): string {
  const k = key.replace(/^\/+|\/+$/g, '') || 'home';
  return `/og/${k}`;
}

export interface PageMetaInput {
  /** the page's own path — its canonical address */
  path: string;
  /** the page's title; the layout adds " — Socria" unless `absolute` */
  title: string;
  description: string;
  /** the title already names Socria, so the layout must not add it again */
  absolute?: boolean;
  /** the preview card's key, when it is not the path */
  og?: string;
  type?: 'website' | 'article';
  /** ISO date, for an article */
  publishedTime?: string;
  /** keep this page out of search results */
  noindex?: boolean;
}

/**
 * Everything a public page tells the outside world, from one call.
 *
 * Open Graph and Twitter are filled in full on every page, image included,
 * rather than left to inherit: a page that sets any `openGraph` of its own
 * replaces the parent's whole object, and a shared link without its card is
 * the failure this exists to end.
 *
 * `robots` is only ever written to say noindex. A preview deployment's
 * noindex comes from the root layout, and a page saying "index" here would
 * overrule it.
 */
export function pageMetadata(o: PageMetaInput): Metadata {
  const fullTitle = o.absolute ? o.title : `${o.title} — ${SITE_NAME}`;
  const image = ogImagePath(o.og ?? o.path);
  return {
    title: o.absolute ? { absolute: o.title } : o.title,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: {
      type: o.type ?? 'website',
      url: o.path,
      siteName: SITE_NAME,
      title: fullTitle,
      description: o.description,
      images: [{ url: image, width: 1200, height: 630, alt: fullTitle }],
      ...(o.type === 'article' && o.publishedTime ? { publishedTime: o.publishedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: o.description,
      images: [image],
    },
    ...(o.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** For pages that must never appear in search: a share link, a callback, a private view. */
export const NOINDEX: Metadata = { robots: { index: false, follow: false } };

/**
 * The root layout's metadata: the base every page builds on. No canonical
 * here, ever — see the header.
 */
export function rootMetadata(production: boolean): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    // A preview build carries its own noindex, so it stays out of search
    // even if something links to it. robots.txt asks; this tells.
    ...(production ? {} : { robots: { index: false, follow: false, nocache: true } }),
    title: { default: HOME_TITLE, template: `%s — ${SITE_NAME}` },
    description: DEFAULT_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: `${SITE_NAME} — ${TAGLINE}`,
      description: DEFAULT_DESCRIPTION,
      images: [{ url: ogImagePath('home'), width: 1200, height: 630, alt: `${SITE_NAME} — ${TAGLINE}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${SITE_NAME} — ${TAGLINE}`,
      description: DEFAULT_DESCRIPTION,
      images: [ogImagePath('home')],
    },
  };
}

// ── the public pages ────────────────────────────────────────────────

export interface PublicPage {
  path: string;
  /** its name, for llms.txt */
  name: string;
  /** one honest sentence about it, for llms.txt */
  summary: string;
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

/**
 * The pages anyone may land on, in the order a newcomer would want them.
 * The docs and the blog's posts are added from their own lists; the student
 * page only while its offer is open.
 */
export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: '/',
    name: 'Socria',
    summary: 'Think for yourself: an AI that sharpens your reasoning instead of doing it for you.',
    priority: 1,
    changeFrequency: 'weekly',
  },
  {
    path: '/explore',
    name: 'Explore',
    summary: 'Research, learning, decisions, argument and creative work, each shown in the running product.',
    priority: 0.8,
    changeFrequency: 'monthly',
  },
  {
    path: '/one',
    name: 'Socria One',
    summary: `Everything Socria does, without the ceiling — ${priceWithPeriod()}. Socria is free to start.`,
    priority: 0.8,
    changeFrequency: 'monthly',
  },
  {
    path: '/charter',
    name: 'The Socria Charter',
    summary: 'The founding constitution of Socria: artificial intelligence built for human enhancement. The machines work for us, not the other way around.',
    priority: 0.7,
    changeFrequency: 'yearly',
  },
  {
    path: '/docs',
    name: 'Docs',
    summary: 'How Socria works: the models, the Thinking Map, documents, Socria One and your data.',
    priority: 0.7,
    changeFrequency: 'weekly',
  },
  {
    path: '/blog',
    name: 'Blog',
    summary: 'Essays on reasoning, metacognition and human-first AI.',
    priority: 0.6,
    changeFrequency: 'weekly',
  },
  {
    path: '/support',
    name: 'Support',
    summary: 'Answers to what people ask about Socria, and how to reach a person.',
    priority: 0.5,
    changeFrequency: 'monthly',
  },
  {
    path: '/surfaces',
    name: 'Working surfaces',
    summary: 'Physics you can move: a Kerr black hole with integrated geodesics, the thermal history of the universe, and gravity as an N-body integration.',
    priority: 0.5,
    changeFrequency: 'monthly',
  },
  {
    path: '/logos2',
    name: 'Logos 2',
    summary: 'A workspace you arrange: a Thinking Map, a transcript and a working surface.',
    priority: 0.4,
    changeFrequency: 'monthly',
  },
  {
    path: '/core4model',
    name: 'Core 4, as a model',
    summary: 'One Core 4 turn as a three-dimensional object you can turn.',
    priority: 0.4,
    changeFrequency: 'monthly',
  },
  { path: '/privacy', name: 'Privacy', summary: 'What Socria collects, why, and how to get it back or deleted.', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/terms', name: 'Terms', summary: 'The agreement for using Socria.', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/security', name: 'Security', summary: 'How Socria protects accounts and data.', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/subprocessors', name: 'Sub-processors', summary: 'The companies that process data on Socria’s behalf.', priority: 0.2, changeFrequency: 'yearly' },
];

/** A docs page's address. The overview IS /docs — /docs/overview redirects there. */
export function docPath(slug: string): string {
  return slug === 'overview' ? '/docs' : `/docs/${slug}`;
}

/** Whether the student page is up: only while a free month can still begin. */
export function studentPageOpen(now: number): boolean {
  return now < STUDENT_OFFER.closes;
}

export const STUDENT_PAGE: PublicPage = {
  path: '/students',
  name: 'For UTA students',
  summary: 'UTA students get their first month of Socria One free by verifying their university email.',
  priority: 0.7,
  changeFrequency: 'weekly',
};

export interface PostRef {
  slug: string;
  publishedAt?: string | null;
}

/** Every page the sitemap lists, as absolute URLs. */
export function sitemapEntries(opts: { now: number; posts?: readonly PostRef[] }): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  for (const p of PUBLIC_PAGES) {
    out.push({ url: absoluteUrl(p.path), changeFrequency: p.changeFrequency, priority: p.priority });
  }
  if (studentPageOpen(opts.now)) {
    out.push({ url: absoluteUrl(STUDENT_PAGE.path), changeFrequency: STUDENT_PAGE.changeFrequency, priority: STUDENT_PAGE.priority });
  }
  for (const d of DOC_PAGES) {
    // the overview is /docs itself, listed above; a redirect has no place here
    if (docPath(d.slug) === '/docs') continue;
    out.push({ url: absoluteUrl(docPath(d.slug)), changeFrequency: 'monthly', priority: 0.6 });
  }
  for (const post of opts.posts ?? []) {
    if (!post?.slug || !/^[a-z0-9][a-z0-9-]*$/i.test(post.slug)) continue;
    const t = post.publishedAt ? Date.parse(post.publishedAt) : NaN;
    out.push({
      url: absoluteUrl(`/blog/${post.slug}`),
      ...(Number.isFinite(t) ? { lastModified: new Date(t) } : {}),
      changeFrequency: 'yearly',
      priority: 0.5,
    });
  }
  return out;
}

// ── llms.txt ────────────────────────────────────────────────────────
//
// A plain summary of the site for AI assistants and answer engines, at
// /llms.txt (llmstxt.org). Few of them read it yet; it costs nothing, and
// when one does, what it reads is true and current, because it is built from
// the same lists as the sitemap and the docs sidebar.

export function llmsTxt(opts: { now: number }): string {
  const lines: string[] = [];
  lines.push(`# ${SITE_NAME}`, '');
  lines.push(
    `> ${TAGLINE}. Socria is an AI thinking environment that strengthens your reasoning instead of doing it for you: talk something through and it shows what you are assuming, what is missing and what your view rests on.`,
    ''
  );
  lines.push(
    `Socria has two kinds of model. Core is a conversation that asks as well as answers, and works without an account. Logos adds a live map of your reasoning beside the conversation, models it can compute and documents it reads with every citation checked; Logos needs a free account. Socria is free to start; Socria One (${priceWithPeriod()}) removes the limits.`,
    ''
  );
  const link = (name: string, path: string, summary: string) => `- [${name}](${absoluteUrl(path)}): ${summary}`;
  lines.push('## Start', '');
  lines.push(link('Try Socria', '/chat', 'Start a conversation — no account needed.'));
  for (const p of PUBLIC_PAGES.slice(0, 4)) if (p.path !== '/') lines.push(link(p.name, p.path, p.summary));
  if (studentPageOpen(opts.now)) lines.push(link(STUDENT_PAGE.name, STUDENT_PAGE.path, STUDENT_PAGE.summary));
  lines.push('', '## Docs', '');
  for (const d of DOC_PAGES) lines.push(link(d.title, docPath(d.slug), d.blurb));
  lines.push('', '## More', '');
  for (const p of PUBLIC_PAGES.slice(4)) if (p.path !== '/docs') lines.push(link(p.name, p.path, p.summary));
  lines.push('');
  return lines.join('\n');
}
