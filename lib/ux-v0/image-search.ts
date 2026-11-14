// lib/ux-v0/image-search.ts — how the moodboard searches, shared by the browser and the server.
//
// Real libraries answer short queries. On Openverse two words ("espresso bar")
// find hundreds of images where five ("morning light espresso bar marble
// counter") find none. So a query that finds too little is asked again in two
// words. Pages are fetched whole, PAGE_SIZE at a time, and served a few images
// per click, staying on a page while it still holds images not yet seen. Lists
// from several libraries are interleaved, so the board draws on all of them.
//
// Openverse needs no key and limits each caller, not each app, so the browser
// asks it directly, as openverse.org itself does. The libraries that need a key
// (Unsplash, Pexels) are asked by the server, where the keys stay.

import { normalizeRef, type MoodCategory, type MoodboardRef } from './types';

export const PAGE_SIZE = 20;

const STOP = new Set(['the', 'and', 'with', 'for', 'close', 'up', 'shot', 'view', 'photo', 'image', 'style']);

/** The query as asked, then the two-word forms of it worth trying when it finds too little. */
export function shorterQueries(query: string): string[] {
  const words = query
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const out = [words.join(' ')];
  // in a long query the subject tends to sit in the middle ("morning light ESPRESSO BAR marble counter"),
  // so that pair goes first; then the opening and closing pairs
  if (words.length >= 4) {
    const mid = Math.floor((words.length - 2) / 2);
    out.push(words.slice(mid, mid + 2).join(' '));
  }
  if (words.length >= 3) out.push(words.slice(0, 2).join(' '), words.slice(-2).join(' '));
  return [...new Set(out.filter(Boolean))];
}

/**
 * Up to `per` images not yet seen, alternating between the lists so every
 * library is represented. `left` counts the unseen images not taken: while
 * there are any, the next click stays on the same page.
 */
export function interleave(lists: MoodboardRef[][], seen: ReadonlySet<string>, per: number): { taken: MoodboardRef[]; left: number } {
  const queues = lists.map((l) => l.filter((r) => !seen.has(r.id)));
  const taken: MoodboardRef[] = [];
  const ids = new Set<string>();
  let more = true;
  while (taken.length < per && more) {
    more = false;
    for (const q of queues) {
      while (q.length && ids.has(q[0].id)) q.shift();
      const r = q.shift();
      if (!r) continue;
      more = true;
      ids.add(r.id);
      taken.push(r);
      if (taken.length >= per) break;
    }
  }
  const left = new Set(queues.flat().map((r) => r.id).filter((id) => !ids.has(id))).size;
  return { taken, left };
}

// ── Openverse ────────────────────────────────────────────────────────

const CC: Record<string, string> = { by: 'CC BY', 'by-sa': 'CC BY-SA', 'by-nd': 'CC BY-ND', cc0: 'CC0', pdm: 'Public domain' };

/**
 * One page of a search: only licences that allow commercial use and change. No kind filter: Openverse's
 * "photograph" category leaves out most of what it holds ("magazine spread": 240 results, 13 as photographs).
 */
export function openverseUrl(query: string, page: number): string {
  return `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page=${page}&page_size=${PAGE_SIZE}&license_type=commercial,modification&mature=false`;
}

/** Openverse's results in the shape every library is read into: its own URLs, creator, source and licence. */
export function mapOpenverse(json: unknown): Record<string, unknown>[] {
  const results = (json as { results?: unknown[] } | null)?.results;
  return (Array.isArray(results) ? results : []).map((p: any) => {
    const lic = String(p?.license ?? '').toLowerCase();
    const license = `${CC[lic] ?? lic.toUpperCase()}${p?.license_version && lic !== 'cc0' && lic !== 'pdm' ? ` ${p.license_version}` : ''}`.trim();
    return {
      provider: 'openverse',
      providerId: String(p?.id ?? ''),
      url: p?.url,
      thumb: p?.thumbnail || p?.url,
      width: p?.width,
      height: p?.height,
      title: p?.title || '',
      creator: p?.creator || '',
      creatorUrl: p?.creator_url || '',
      sourceUrl: p?.foreign_landing_url || '',
      license,
      licenseUrl: p?.license_url || '',
      attribution: `“${p?.title || 'Image'}”${p?.creator ? ` by ${p.creator}` : ''}${license ? `, ${license}` : ''}`,
      tags: (Array.isArray(p?.tags) ? p.tags : []).map((t: any) => String(t?.name ?? '').toLowerCase()).filter(Boolean).slice(0, 30),
    };
  });
}

export interface LibraryResult {
  refs: MoodboardRef[];
  /** the page to ask for next: the same one while it still holds unseen images */
  next: number;
  /** unseen images found but not taken */
  left: number;
  error: string;
}

/** Pages already fetched in this browser session, so a second click on the same page asks nothing of Openverse. */
const pages = new Map<string, unknown>();

export class LibraryBusy extends Error {}

/**
 * One query against Openverse, from wherever it runs: the query as asked,
 * then its two-word forms while it has found fewer than `per` unseen images.
 * Each image keeps the query that found it, so *Replace* asks the same thing.
 */
export async function searchOpenverse(
  q: { category: MoodCategory; query: string; page: number },
  seen: ReadonlySet<string>,
  per: number,
  opts: { fetcher?: typeof fetch; now?: number; cache?: Map<string, unknown> } = {}
): Promise<LibraryResult> {
  const fetcher = opts.fetcher ?? fetch;
  const cache = opts.cache ?? pages;
  const got: MoodboardRef[] = [];
  const ids = new Set(seen);
  let error = '';
  let failed = false;
  let busy = false;
  // unseen images left over, by page: the next click goes to the first page that still has some
  const leftOn = new Map<number, number>();
  let lastFull = 0;
  const page = async (query: string, pg: number): Promise<Record<string, unknown>[] | null> => {
    const url = openverseUrl(query, pg);
    let json = cache.get(url);
    if (json === undefined) {
      try {
        const res = await fetcher(url, { headers: { Accept: 'application/json' } });
        if (res.status === 429) throw new LibraryBusy('busy');
        if (!res.ok) throw new Error(String(res.status));
        json = await res.json();
        if (cache.size > 300) cache.delete(cache.keys().next().value as string);
        cache.set(url, json);
      } catch (e) {
        failed = true;
        busy = e instanceof LibraryBusy;
        error = busy ? 'The image library is busy for a moment; try again in a minute.' : 'The image library could not be reached just now.';
        return null;
      }
    }
    return mapOpenverse(json);
  };
  const tries = shorterQueries(q.query);
  // a shortened query's results are ordered by what they share with the full one: its own words (the subject)
  // count twice, the rest of the full query once, so "espresso bar in the morning light" leads "morning light"
  const words = (t: string) =>
    t
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 2 && !STOP.has(w));
  const want = words(tries[0] || '');
  const score = (r: Record<string, unknown>, subject: string[]) => {
    const hay = `${String(r.title ?? '').toLowerCase()} ${((r.tags as string[]) ?? []).join(' ')}`;
    return want.reduce((n, w) => n + (hay.includes(w) ? (subject.includes(w) ? 2 : 1) : 0), 0);
  };
  for (const query of tries) {
    if (got.length >= per || busy) break;
    // this page, and the next one when this one runs out before the batch is full
    for (let pg = q.page; pg <= q.page + 1 && got.length < per && !busy; pg++) {
      const raw = await page(query, pg);
      if (!raw) break;
      const subject = words(query);
      const ordered = query === tries[0] ? raw : raw.map((r, i) => ({ r, i, s: score(r, subject) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);
      const fresh = ordered
        .map((r) => normalizeRef({ ...r, category: q.category, query, state: 'proposed', addedAt: opts.now ?? Date.now() }))
        .filter((r): r is MoodboardRef => !!r && !ids.has(r.id));
      for (const r of fresh) {
        if (got.length < per) {
          got.push(r);
          ids.add(r.id);
        } else leftOn.set(pg, (leftOn.get(pg) ?? 0) + 1);
      }
      if (raw.length < PAGE_SIZE) break; // the last page there is
      lastFull = Math.max(lastFull, pg);
    }
  }
  const left = [...leftOn.values()].reduce((a, b) => a + b, 0);
  const firstLeft = [...leftOn.keys()].sort((a, b) => a - b)[0];
  // stay where unseen images remain; after a failure, ask the same page again; otherwise move on
  const next = firstLeft ?? (failed ? q.page : Math.max(q.page, lastFull) + 1);
  return { refs: got, next, left, error: got.length ? '' : error || 'Nothing found for that.' };
}
