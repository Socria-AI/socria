import 'server-only';
// lib/ux-v0/research/providers-server.ts — search providers for research, behind one interface.
//
// Which provider is used is the workspace's choice, made in its environment, never the person's or the model's:
//   SOCRIAUX_RESEARCH_PROVIDER   brave | google | serper (the first one with a key, when not set)
//   BRAVE_SEARCH_API_KEY         Brave Search API (web and image search)
//   GOOGLE_CSE_KEY, GOOGLE_CSE_CX  Google Programmable Search (Custom Search JSON API)
//   SERPER_API_KEY               Serper (Google results through its API)
// Each is called through its official API with its own key (their terms allow showing results with their source;
// nothing is scraped). A request is time-limited; its results are held to their shape (schema.ts). With no provider
// configured, or one that cannot be reached, the response says so plainly — a search that did not happen is never
// reported as one that did, and no result is ever invented. Adding a provider is one entry in PROVIDERS.

import { cleanResult, type ResearchKind, type ResearchResponse, type ResearchResult } from './schema';

type Env = Record<string, string | undefined>;
type Fetcher = typeof fetch;

export interface ResearchProvider {
  id: 'brave' | 'google' | 'serper';
  label: string;
  configured: (env: Env) => boolean;
  search: (q: { query: string; kind: ResearchKind; count: number }, env: Env, fetcher: Fetcher, signal: AbortSignal) => Promise<ResearchResult[]>;
}

const json = async (r: Response) => {
  if (!r.ok) throw Object.assign(new Error(`status ${r.status}`), { status: r.status });
  return (await r.json()) as Record<string, any>;
};
const list = (v: unknown): Record<string, any>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

export const PROVIDERS: readonly ResearchProvider[] = [
  {
    id: 'brave',
    label: 'Brave Search',
    configured: (env) => !!env.BRAVE_SEARCH_API_KEY,
    async search(q, env, fetcher, signal) {
      const path = q.kind === 'images' ? 'images/search' : 'web/search';
      const u = new URL(`https://api.search.brave.com/res/v1/${path}`);
      u.searchParams.set('q', q.query);
      u.searchParams.set('count', String(q.count));
      u.searchParams.set('safesearch', 'strict');
      const data = await json(await fetcher(u.toString(), { headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY! }, signal }));
      if (q.kind === 'images') return list(data.results).map((x, i) => cleanResult({ title: x.title, url: x.url, thumb: x.thumbnail?.src, image: x.properties?.url, width: x.properties?.width, height: x.properties?.height }, 'Brave Search', 'image', i)).filter((x): x is ResearchResult => !!x);
      return list(data.web?.results).map((x, i) => cleanResult({ title: x.title, url: x.url, snippet: x.description, thumb: x.thumbnail?.src }, 'Brave Search', 'website', i)).filter((x): x is ResearchResult => !!x);
    },
  },
  {
    id: 'google',
    label: 'Google Programmable Search',
    configured: (env) => !!env.GOOGLE_CSE_KEY && !!env.GOOGLE_CSE_CX,
    async search(q, env, fetcher, signal) {
      const u = new URL('https://www.googleapis.com/customsearch/v1');
      u.searchParams.set('key', env.GOOGLE_CSE_KEY!);
      u.searchParams.set('cx', env.GOOGLE_CSE_CX!);
      u.searchParams.set('q', q.query);
      u.searchParams.set('num', String(Math.min(10, q.count)));
      u.searchParams.set('safe', 'active');
      if (q.kind === 'images') u.searchParams.set('searchType', 'image');
      const data = await json(await fetcher(u.toString(), { headers: { Accept: 'application/json' }, signal }));
      return list(data.items)
        .map((x, i) =>
          q.kind === 'images'
            ? cleanResult({ title: x.title, url: x.image?.contextLink, thumb: x.image?.thumbnailLink, image: x.link, width: x.image?.width, height: x.image?.height }, 'Google Programmable Search', 'image', i)
            : cleanResult({ title: x.title, url: x.link, snippet: x.snippet, thumb: x.pagemap?.cse_thumbnail?.[0]?.src }, 'Google Programmable Search', 'website', i),
        )
        .filter((x): x is ResearchResult => !!x);
    },
  },
  {
    id: 'serper',
    label: 'Serper',
    configured: (env) => !!env.SERPER_API_KEY,
    async search(q, env, fetcher, signal) {
      const data = await json(await fetcher(`https://google.serper.dev/${q.kind === 'images' ? 'images' : 'search'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': env.SERPER_API_KEY! }, body: JSON.stringify({ q: q.query, num: q.count }), signal }));
      if (q.kind === 'images') return list(data.images).map((x, i) => cleanResult({ title: x.title, url: x.link, thumb: x.thumbnailUrl, image: x.imageUrl, width: x.imageWidth, height: x.imageHeight }, 'Serper', 'image', i)).filter((x): x is ResearchResult => !!x);
      return list(data.organic).map((x, i) => cleanResult({ title: x.title, url: x.link, snippet: x.snippet }, 'Serper', 'website', i)).filter((x): x is ResearchResult => !!x);
    },
  },
];

/** The provider the workspace configured (named, else the first with a key), or null. */
export function researchProvider(env: Env = process.env): ResearchProvider | null {
  const named = PROVIDERS.find((p) => p.id === (env.SOCRIAUX_RESEARCH_PROVIDER ?? '').trim().toLowerCase());
  if (named) return named.configured(env) ? named : null;
  return PROVIDERS.find((p) => p.configured(env)) ?? null;
}

/** A search, through the configured provider; what happened, said plainly (never an invented result). */
export async function research(q: { query: string; kind: ResearchKind; count?: number }, opts: { env?: Env; fetcher?: Fetcher; timeoutMs?: number } = {}): Promise<ResearchResponse> {
  const env = opts.env ?? process.env;
  const query = q.query.replace(/\s+/g, ' ').trim().slice(0, 160);
  const base = { query, kind: q.kind };
  const p = researchProvider(env);
  if (!p) return { ...base, status: 'not-configured', provider: null, results: [], message: 'Searching the internet needs a search provider set up for this workspace (Brave Search, Google Programmable Search or Serper, each with its own key), and none is. Paste links to sites you admire, or add pictures, and they will be read as references instead.' };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 9000);
  try {
    const results = (await p.search({ query, kind: q.kind, count: Math.max(1, Math.min(12, q.count ?? 8)) }, env, opts.fetcher ?? fetch, ac.signal)).slice(0, 12);
    // one result per page
    const seen = new Set<string>();
    const unique = results.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
    if (!unique.length) return { ...base, status: 'empty', provider: p.label, results: [], message: `${p.label} found nothing for “${query}”. Try other words for it.` };
    return { ...base, status: 'ok', provider: p.label, results: unique, message: `${unique.length} ${q.kind === 'images' ? 'pictures' : 'pages'} found by ${p.label} for “${query}”.` };
  } catch (e) {
    const status = (e as { status?: number }).status;
    const why = (e as Error)?.name === 'AbortError' ? 'it took too long to answer' : status === 401 || status === 403 ? 'its key was refused' : status === 429 ? 'its limit for now is reached' : 'it could not be reached';
    return { ...base, status: 'unavailable', provider: p.label, results: [], message: `The search did not happen: ${p.label} ${why}. Nothing was found, so nothing is shown.` };
  } finally {
    clearTimeout(timer);
  }
}
