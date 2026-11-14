import 'server-only';
// lib/ux-v0/images-server.ts — moodboard images from licensed libraries, never scraped.
//
// Three providers behind one shape (docs/SOCRIAUX-V0.md, D2):
//   Unsplash   with UNSPLASH_ACCESS_KEY — the best photography. Its guidelines:
//              hotlink the returned URLs, credit the photographer and Unsplash
//              with links (utm_source/utm_medium), and tell its download
//              endpoint when a photo is used (pingUse).
//   Pexels     with PEXELS_API_KEY.
//   Openverse  no key — openly licensed images (Creative Commons and public
//              domain) with their licence and a ready credit line; the
//              default, and the fallback when another provider fails.
// SOCRIAUX_IMAGE_PROVIDER can name one. Every URL kept is one a provider
// returned; nothing is assembled from model text. Results are cached for a day
// per query in Next's data cache (no new infrastructure), and ids the project
// has already seen are left out, so a replacement never repeats.

import { normalizeRef, type MoodCategory, type MoodboardRef, type Provider } from './types';

const UTM = 'utm_source=socria&utm_medium=referral';
const DAY = 86400;

export interface SearchResult {
  refs: MoodboardRef[];
  provider: Provider | null;
  error: string;
}

type Env = Record<string, string | undefined>;

export function providerOrder(env: Env = process.env): Provider[] {
  const asked = (env.SOCRIAUX_IMAGE_PROVIDER ?? '').trim().toLowerCase();
  const have: Provider[] = [];
  if (env.UNSPLASH_ACCESS_KEY) have.push('unsplash');
  if (env.PEXELS_API_KEY) have.push('pexels');
  have.push('openverse');
  if (asked === 'unsplash' || asked === 'pexels' || asked === 'openverse') {
    return [asked as Provider, ...have.filter((p) => p !== asked)].filter((p) => p === 'openverse' || have.includes(p));
  }
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

const CC: Record<string, string> = { by: 'CC BY', 'by-sa': 'CC BY-SA', 'by-nd': 'CC BY-ND', cc0: 'CC0', pdm: 'Public domain' };

async function openverse(query: string, page: number, per: number, _env: Env, fetcher: typeof fetch): Promise<Record<string, unknown>[]> {
  const j = await getJson(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page=${page}&page_size=${per}&license_type=commercial,modification&mature=false`,
    {},
    fetcher
  );
  return (j?.results ?? []).map((p: any) => {
    const lic = String(p.license ?? '').toLowerCase();
    const license = `${CC[lic] ?? lic.toUpperCase()}${p.license_version && lic !== 'cc0' && lic !== 'pdm' ? ` ${p.license_version}` : ''}`.trim();
    return {
      provider: 'openverse',
      providerId: String(p.id ?? ''),
      url: p.url,
      thumb: p.thumbnail || p.url,
      width: p.width,
      height: p.height,
      title: p.title || '',
      creator: p.creator || '',
      creatorUrl: p.creator_url || '',
      sourceUrl: p.foreign_landing_url || '',
      license,
      licenseUrl: p.license_url || '',
      attribution: p.attribution || `“${p.title || 'Image'}”${p.creator ? ` by ${p.creator}` : ''}${license ? `, ${license}` : ''}`,
    };
  });
}

const PROVIDERS: Record<Provider, typeof openverse> = { unsplash, pexels, openverse };

/**
 * Images for one query, excluding ids already seen. Tries providers in order;
 * a provider that fails or finds nothing hands over to the next.
 */
export async function searchImages(
  q: { category: MoodCategory; query: string; page: number },
  seen: ReadonlySet<string>,
  opts: { per?: number; env?: Env; fetcher?: typeof fetch; now?: number } = {}
): Promise<SearchResult> {
  const env = opts.env ?? process.env;
  const fetcher = opts.fetcher ?? fetch;
  const per = Math.min(12, Math.max(2, opts.per ?? 6));
  let lastError = '';
  for (const provider of providerOrder(env)) {
    try {
      const raw = await PROVIDERS[provider](q.query, q.page, per + 4, env, fetcher);
      const refs = raw
        .map((r) => normalizeRef({ ...r, category: q.category, query: q.query, state: 'proposed', addedAt: opts.now ?? Date.now() }))
        .filter((r): r is MoodboardRef => !!r && !seen.has(r.id))
        .slice(0, per);
      if (refs.length) return { refs, provider, error: '' };
      lastError = 'no results';
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'failed';
      console.warn('[ux-v0] %s search failed for "%s": %s', provider, q.query, lastError);
    }
  }
  return { refs: [], provider: null, error: lastError === 'no results' ? 'Nothing found for that.' : 'The image libraries could not be reached just now.' };
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
