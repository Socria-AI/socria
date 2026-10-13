// app/llms.txt/route.ts — /llms.txt
//
// A plain summary of Socria for AI assistants and answer engines
// (llmstxt.org), built from the same lists as the sitemap — see llmsTxt in
// lib/seo.ts for what it says and why every line of it has to stay true.

import { llmsTxt } from '@/lib/seo';

export const revalidate = 3600;

export function GET() {
  return new Response(llmsTxt({ now: Date.now() }), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
