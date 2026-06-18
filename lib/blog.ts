// lib/blog.ts
// Read + render Markdown blog posts from /content/blog at request time.
// Each post is a .md file with YAML frontmatter:
//   ---
//   title: ...
//   date: 2026-06-13
//   excerpt: One-line summary
//   ---

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const POSTS_DIR = path.join(process.cwd(), 'content', 'blog');

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
}

export interface Post extends PostMeta {
  html: string;
}

function readFrontmatter(file: string): { data: matter.GrayMatterFile<string>['data']; content: string } {
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
  const { data, content } = matter(raw);
  return { data, content };
}

export function listPosts(): PostMeta[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));

  const posts = files.map((file) => {
    const { data } = readFrontmatter(file);
    const slug = file.replace(/\.(md|mdx)$/, '');
    return {
      slug,
      title: String(data.title || slug),
      date: String(data.date || ''),
      excerpt: String(data.excerpt || ''),
    } as PostMeta;
  });

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): Post | null {
  if (!fs.existsSync(POSTS_DIR)) return null;
  const candidates = [`${slug}.md`, `${slug}.mdx`];
  const file = candidates.find((c) =>
    fs.existsSync(path.join(POSTS_DIR, c))
  );
  if (!file) return null;

  const { data, content } = readFrontmatter(file);
  const html = marked.parse(content, { async: false }) as string;
  return {
    slug,
    title: String(data.title || slug),
    date: String(data.date || ''),
    excerpt: String(data.excerpt || ''),
    html,
  };
}

export function formatPostDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
