import { groq } from 'next-sanity';
import { sanityClient } from './client';

export interface PostListItem {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  readingMinutes: number | null;
  featured: boolean;
  authorName: string;
  authorRole: string | null;
  coverColor: string;
  coverShape: string;
  category: { name: string; slug: string };
}

export interface PostDetail extends PostListItem {
  body: any[];
}

export interface CategoryWithCount {
  name: string;
  slug: string;
  count: number;
}

const postFields = `
  _id,
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  readingMinutes,
  featured,
  authorName,
  authorRole,
  coverColor,
  coverShape,
  "category": category->{ name, "slug": slug.current }
`;

async function safeFetch<T>(query: string, params: any, fallback: T): Promise<T> {
  const client = sanityClient();
  if (!client) return fallback;
  try {
    return await client.fetch<T>(query, params);
  } catch (e) {
    console.error('Sanity fetch failed:', e);
    return fallback;
  }
}

export function listPosts(): Promise<PostListItem[]> {
  return safeFetch<PostListItem[]>(
    groq`*[_type == "post" && defined(slug.current)] | order(publishedAt desc) { ${postFields} }`,
    {},
    []
  );
}

export function getFeaturedPost(): Promise<PostListItem | null> {
  return safeFetch<PostListItem | null>(
    groq`*[_type == "post" && featured == true && defined(slug.current)] | order(publishedAt desc)[0] { ${postFields} }`,
    {},
    null
  );
}

export function listCategoriesWithCount(): Promise<CategoryWithCount[]> {
  return safeFetch<CategoryWithCount[]>(
    groq`*[_type == "category"] | order(name asc) {
      name,
      "slug": slug.current,
      "count": count(*[_type == "post" && references(^._id)])
    }`,
    {},
    []
  );
}

export function totalPostCount(): Promise<number> {
  return safeFetch<number>(
    groq`count(*[_type == "post" && defined(slug.current)])`,
    {},
    0
  );
}

export function getPostBySlug(slug: string): Promise<PostDetail | null> {
  return safeFetch<PostDetail | null>(
    groq`*[_type == "post" && slug.current == $slug][0] { ${postFields}, body }`,
    { slug },
    null
  );
}

export function listPostSlugs(): Promise<{ slug: string }[]> {
  return safeFetch<{ slug: string }[]>(
    groq`*[_type == "post" && defined(slug.current)] { "slug": slug.current }`,
    {},
    []
  );
}
