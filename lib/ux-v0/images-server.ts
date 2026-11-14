import 'server-only';
// lib/ux-v0/images-server.ts — moodboard images from the licensed libraries that need a key.
//
//   Unsplash   with UNSPLASH_ACCESS_KEY — the best photography. Its guidelines:
//              hotlink the returned URLs, credit the photographer and Unsplash
//              with links (utm_source/utm_medium), and tell its download
//              endpoint when a photo is used (pingUse).
//   Pexels     with PEXELS_API_KEY.
//
// Openverse (no key, openly licensed images) is asked from the person's browser
// instead (lib/ux-v0/image-search.ts): it limits each caller, so a server asking
// for everyone would share one small allowance between all of them.
//
// Every library configured here is asked at once and the results interleaved.
// Every URL kept is one a library returned; nothing is assembled from model
// text. Pages are cached for a day in Next's data cache (no new
// infrastructure), and ids the project has already seen are left out, so a
// replacement never repeats.

import { PAGE_SIZE, interleave, mapOpenverse, openverseUrl } from './image-search';
import { normalizeRef, type MoodCategory, type MoodboardRef, type Provider } from './types';

const UTM = 'utm_source=socria&utm_medium=referral';
const DAY = 86400;

export interface SearchResult {
  refs: MoodboardRef[];
  /** the libraries that answered with images */
  providers: Provider[];
  /** the page to ask for next: the same one while it still holds unseen images */
  next: number;
  left: number;
  error: string;
}

type Env = Record<string, string | undefined>;

/** The libraries this server can ask: those whose key is set. Openverse only when SOCRIAUX_OPENVERSE_SERVER=1. */
export function providerOrder(env: Env = process.env): Provider[] {
  const have: Provider[] = [];
  if (env.UNSPLASH_ACCESS_KEY) have.push('unsplash');
  if (env.PEXELS_API_KEY) have.push('pexels');
  if (env.SOCRIAUX_OPENVERSE_SERVER === '1') have.push('openverse');
  return have;
}

const withUtm = (u: string) => (u ? `${u}${u.includes('?') ? '&' : '?'}${UTM}` : '');

async function getJson(url: string, headers: Record<string, string>, fetcher: typeof fetch): Promise<any> {
  const res = await fetcher(url, { headers: { Accept: 'application/json', ...headers }, next: { revalidate: DAY } } as RequestInit);
  if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status });
  return res.json();
}

async function unsplash(query: string, page: number, per: number, env: Env, fetcher: typeof fetch): Promise<Record<string, unknown>[]> {
  const j = await getJson(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=${per}&content_filter=high`,
    { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' },
    fetcher
  );
  return (j?.results ?? []).map((p: any) => ({
    provider: 'unsplash',
    providerId: String(p.id ?? ''),
    url: p.urls?.regular,
    thumb: p.urls?.small,
    width: p.width,
    height: p.height,
    color: p.color,
    title: p.alt_description || p.description || '',
    creator: p.user?.name || '',
    creatorUrl: withUtm(p.user?.links?.html || ''),
    sourceUrl: withUtm(p.links?.html || ''),
    license: 'Unsplash License',
    licenseUrl: 'https://unsplash.com/license',
    attribution: `Photo by ${p.user?.name || 'an Unsplash photographer'} on Unsplash`,
    downloadPing: p.links?.download_location || '',
  }));
}

async function pexels(query: string, page: number, per: number, env: Env, fetcher: typeof fetch): Promise<Record<string, unknown>[]> {
  const j = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${per}`, { Authorization: String(env.PEXELS_API_KEY) }, fetcher);
  return (j?.photos ?? []).map((p: any) => ({
    provider: 'pexels',
    providerId: String(p.id ?? ''),
    url: p.src?.large2x || p.src?.large,
    thumb: p.src?.medium,
    width: p.width,
    height: p.height,
    color: p.avg_color,
    title: p.alt || '',
    creator: p.photographer || '',
    creatorUrl: p.photographer_url || '',
    sourceUrl: p.url || '',
    license: 'Pexels License',
    licenseUrl: 'https://www.pexels.com/license/',
    attribution: `Photo by ${p.photographer || 'a Pexels photographer'} on Pexels`,
  }));
}

async function openverse(query: string, page: number, _per: number, _env: Env, fetcher: typeof fetch): Promise<Record<string, unknown>[]> {
  return mapOpenverse(await getJson(openverseUrl(query, page), {}, fetcher));
}

const PROVIDERS: Record<Provider, (query: string, page: number, per: number, env: Env, fetcher: typeof fetch, category?: MoodCategory) => Promise<Record<string, unknown>[]>> = { unsplash, pexels, openverse };

/**
 * Images for one query from every library this server can ask, at once,
 * interleaved, excluding ids already seen. A library that fails does not hold
 * up the others.
 */
export async function searchImages(
  q: { category: MoodCategory; query: string; page: number },
  seen: ReadonlySet<string>,
  opts: { per?: number; env?: Env; fetcher?: typeof fetch; now?: number } = {}
): Promise<SearchResult> {
  const env = opts.env ?? process.env;
  const fetcher = opts.fetcher ?? fetch;
  const per = Math.min(12, Math.max(1, opts.per ?? 6));
  const providers = providerOrder(env);
  if (!providers.length) return { refs: [], providers: [], next: q.page, left: 0, error: '' };
  const lists = await Promise.all(
    providers.map(async (provider) => {
      try {
        const raw = await PROVIDERS[provider](q.query, q.page, PAGE_SIZE, env, fetcher, q.category);
        return {
          provider,
          refs: raw.map((r) => normalizeRef({ ...r, category: q.category, query: q.query, state: 'proposed', addedAt: opts.now ?? Date.now() })).filter((r): r is MoodboardRef => !!r),
          error: '',
        };
      } catch (e) {
        const error = e instanceof Error ? e.message : 'failed';
        console.warn('[ux-v0] %s search failed for "%s": %s', provider, q.query, error);
        return { provider, refs: [] as MoodboardRef[], error };
      }
    })
  );
  const { taken, left } = interleave(lists.map((l) => l.refs), seen, per);
  const answered = [...new Set(taken.map((r) => r.provider))] as Provider[];
  const failed = lists.every((l) => l.error);
  return {
    refs: taken,
    providers: answered,
    next: left > 0 ? q.page : q.page + 1,
    left,
    error: taken.length ? '' : failed ? 'The image libraries could not be reached just now.' : 'Nothing found for that.',
  };
}

/** Unsplash asks to be told when a photo is used in a design. Best effort; never fails the request. */
export async function pingUse(ref: { provider: string; downloadPing: string }, opts: { env?: Env; fetcher?: typeof fetch } = {}): Promise<void> {
  const env = opts.env ?? process.env;
  if (ref.provider !== 'unsplash' || !ref.downloadPing || !env.UNSPLASH_ACCESS_KEY) return;
  if (!/^https:\/\/api\.unsplash\.com\//.test(ref.downloadPing)) return;
  try {
    await (opts.fetcher ?? fetch)(ref.downloadPing, { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' }, cache: 'no-store' });
  } catch {
    /* best effort */
  }
}
