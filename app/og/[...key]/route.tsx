// app/og/[...key]/route.tsx — the link-preview card for a page.
//
// /og/home, /og/one, /og/docs/<slug>, /og/blog/<slug>, /og/students,
// /og/invited … Each page names its card through pageMetadata() (lib/seo.ts).
// What a card says is looked up (lib/og-cards.ts): nothing in the address is
// printed, so this cannot be used to make a Socria image saying anything else.
// An unknown key gets the plain "Think for yourself." card, never an error —
// a preview with the wrong words is a bug, a preview with none is a broken
// share.

import type { NextRequest } from 'next/server';
import { DOC_PAGES } from '@/app/docs/registry';
import { ogCardFor } from '@/lib/og-cards';
import { renderCard } from '@/lib/og/card';
import { rewardsConfig } from '@/lib/rewards/rewards-config';
import { apiVersion, dataset, projectId } from '@/sanity/env';

export const runtime = 'edge';

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/i;

/** A post's title and excerpt, straight from Sanity's HTTP API — or null. */
async function postFor(slug: string): Promise<{ title: string; excerpt?: string | null } | null> {
  if (!projectId || !SLUG.test(slug)) return null;
  try {
    const query = encodeURIComponent('*[_type == "post" && slug.current == $slug][0]{title, excerpt}');
    const url = `https://${projectId}.apicdn.sanity.io/v${apiVersion}/data/query/${dataset}?query=${query}&$slug=${encodeURIComponent(JSON.stringify(slug))}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { title?: unknown; excerpt?: unknown } | null };
    const t = json.result?.title;
    return typeof t === 'string' && t.trim()
      ? { title: t, excerpt: typeof json.result?.excerpt === 'string' ? json.result.excerpt : null }
      : null;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, { params }: { params: { key: string[] } }) {
  const key = (params.key ?? []).slice(0, 3).map((s) => decodeURIComponent(s).toLowerCase());
  const post = key[0] === 'blog' && key[1] ? await postFor(key[1]) : null;
  let referral: { enabled: boolean; signupDays: number } | null = null;
  try {
    const cfg = rewardsConfig();
    referral = { enabled: cfg.enabled, signupDays: cfg.referral.signupDays };
  } catch {
    referral = null;
  }
  const card = ogCardFor(key, {
    now: Date.now(),
    docs: DOC_PAGES.map((d) => ({ slug: d.slug, title: d.title, blurb: d.blurb })),
    post,
    referral,
  });
  // The offers change with the date and the settings; their cards are kept
  // for an hour rather than a day.
  const short = key[0] === 'students' || key[0] === 'invited';
  return renderCard(card, { cacheSeconds: short ? 3600 : 86_400 });
}
