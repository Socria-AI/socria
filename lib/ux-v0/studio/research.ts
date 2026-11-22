// lib/ux-v0/studio/research.ts — real references, looked for on the internet: what to search for, how to read what
// comes back, and what the references a person likes say about the direction.
//
// The searching itself happens in the person's browser (components/ux-v0/studio/research-client.ts, over Openverse:
// openly licensed works from Flickr, Wikimedia Commons, museums and more, each with its creator, licence and the page
// it came from). This module is pure: the queries a brief asks for, the ranking of results by what a designer would
// want to see, and the influences and colours of the references liked. References inspire; nothing here ever places
// one in a work — only what they say (their colours, the influences their own words name, their temperament) reaches
// the engines. Every reference keeps its source, so it can be cited.

import type { ResearchLog, ResearchSearch, StudioReference, StudioState } from './schema';
export { REF_TAKES, safeUrl, type RefTake, type ResearchLog, type ResearchSearch, type StudioReference } from './schema';
import { readFacts } from './facts';
import { PERSONALITY } from './catalog';
import { interpretStyle } from '../graphics/styles/interpret';
import { styleById } from '../graphics/styles/registry';
import { mapOpenverse, openverseUrl, shorterQueries } from '../image-search';
import { safeUrl as safe } from './schema';

export interface ResearchQuery {
  q: string;
  /** what it is for, said to the person */
  why: string;
}

const STOP = new Set(
  'a an the and or for of with to in on at by from my our your their its this that these those new small big little very really make create design designed want need please some something like just into about'.split(' '),
);
/** Words that say what kind of thing it is, not what it is about. */
const KIND_WORDS = /\b(posters?|flyers?|logos?|logotypes?|wordmarks?|monograms?|emblems?|websites?|web ?sites?|sites?|pages?|landing|campaigns?|boards?|graphics?|covers?|banners?|cards?|labels?|packaging|instagram|posts?|stor(?:y|ies)|carousels?|infographics?|identity|brand(?:ing)?|kit|materials?|series|set|launch|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/gi;

/** Words that say how it should feel, not what it is about (the temperament is searched for on its own). */
const FEEL = new Set([...PERSONALITY.map((p) => p.id), ...'clean simple beautiful nice cool fresh sleek stylish premium luxury cute fun striking stunning vibrant colourful colorful dark light bright soft strong'.split(' ')]);

/** What a sentence is about, in two words: the subject a library is asked for ("coffee roastery", "creative coding"). */
export function subjectOf(text: string): string {
  const words = (text ?? '')
    .replace(/“[^”]*”|"[^"]*"/g, ' ')
    .replace(KIND_WORDS, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !FEEL.has(w));
  return words.slice(0, 2).join(' ');
}

const GRAPHIC_KIND_WORD: Record<string, string> = { poster: 'poster', social: 'poster', carousel: 'graphic design', banner: 'banner', album: 'album cover', book: 'book cover', card: 'business card', label: 'label design', infographic: 'infographic', ad: 'poster', magazine: 'magazine cover' };

/** Two to four short searches for a brief — short because real libraries answer two words, not seven. */
export function researchPlan(st: StudioState): ResearchQuery[] {
  const f = readFacts(st.prompt);
  const subject = subjectOf(st.prompt);
  const mood = f.mood[0] ?? '';
  const style = f.styles[0] ? interpretStyleName(f.styles[0]) : '';
  const out: ResearchQuery[] = [];
  const add = (q: string, why: string) => {
    const clean = q.replace(/\s+/g, ' ').trim();
    if (clean && !out.some((x) => x.q === clean)) out.push({ q: clean, why });
  };
  if (st.mode === 'graphic') {
    const kind = GRAPHIC_KIND_WORD[f.kind ?? 'poster'] ?? 'poster';
    if (subject) add(`${subject} ${kind}`, `${kind}s about ${subject}`);
    if (style) add(`${style} ${kind}`, `${style} ${kind}s`);
    if (mood) add(`${mood} ${kind}`, `${kind}s that feel ${mood}`);
    add(`typography ${kind}`, `typographic ${kind}s`);
  } else if (st.mode === 'logo') {
    if (subject) add(`${subject} logo`, `logos for ${subject}`);
    if (f.logoCategory) add(`${f.logoCategory} logo`, `${f.logoCategory}s`);
    if (mood) add(`${mood} logo`, `logos that feel ${mood}`);
    add('logo design', 'marks and wordmarks');
  } else if (st.mode === 'website') {
    if (subject) add(`${subject} website`, `websites for ${subject}`);
    if (subject) add(`${subject} interior`, `the world of ${subject}`);
    if (style) add(`${style} design`, `${style} design`);
    add('web design', 'web pages and layouts');
  } else if (st.mode === 'board') {
    if (subject) add(`${subject} poster`, `posters about ${subject}`);
    if (subject) add(`${subject} branding`, `identities for ${subject}`);
    if (mood) add(`${mood} poster`, `campaign work that feels ${mood}`);
    add('brand identity', 'identities across many materials');
  }
  return out.slice(0, 4);
}

/** A style's name, short enough to search for ("swiss international" → "swiss international"). */
const interpretStyleName = (id: string) => (styleById(id)?.name ?? id.replace(/-/g, ' ')).toLowerCase().split(/\s+/).slice(0, 2).join(' ');

/** What a designer looks for in a reference, by the words a library gives it. */
const DESIGN_WORDS = /\b(poster|posters|typography|typographic|type|lettering|letterpress|logo|logos|logotype|graphic|design|print|printed|screenprint|risograph|layout|branding|brand|identity|signage|sign|label|packaging|illustration|cover|magazine|book|editorial|web|website|interface|screenshot|pattern|bauhaus|swiss|modernist|vintage|art|collage)\b/i;

/** The results of a search, best for a designer first, without repeats or what was turned down before. */
export function rankReferences<T extends { id: string; title: string; creator: string; tags: string[] }>(refs: readonly T[], query: string, exclude: ReadonlySet<string> = new Set()): T[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const seen = new Set<string>();
  return refs
    .filter((r) => !exclude.has(r.id))
    .filter((r) => {
      // the same work posted twice (a title and a creator) counts once
      const key = `${r.title.toLowerCase().replace(/\W+/g, '').slice(0, 24)}|${r.creator.toLowerCase()}`;
      if (seen.has(key) || seen.has(r.id)) return false;
      seen.add(key);
      seen.add(r.id);
      return true;
    })
    .map((r, i) => {
      const hay = `${r.title} ${r.tags.join(' ')}`.toLowerCase();
      const score = (DESIGN_WORDS.test(hay) ? 3 : 0) + words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return { r, i, score };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.r);
}

/** The references the person likes. */
export const likedOf = (st: Pick<StudioState, 'references'>): StudioReference[] => (st.references ?? []).filter((r) => r.state === 'liked');

/** What the liked references say, in their own words: the influences they name and the temperament they carry. */
export function influencesOf(refs: readonly StudioReference[]): { styles: string[]; mood: string[]; words: string } {
  const words = refs.map((r) => [r.title, ...r.tags].join(' ')).join('. ');
  if (!words.trim()) return { styles: [], mood: [], words: '' };
  const styles = new Set<string>();
  for (const r of refs) {
    const s = interpretStyle([r.title, ...r.tags].join(' '));
    if (s.named) for (const x of [s.primary, s.secondary].filter((y): y is string => !!y)) styles.add(x);
  }
  const f = readFacts(words);
  return { styles: [...styles].slice(0, 3), mood: f.mood.slice(0, 4), words: words.slice(0, 600) };
}

const HEX = /^#[0-9a-f]{6}$/i;
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const sat = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};

/** Ground, ink and accent out of a handful of colours: the lightest, the darkest, the most saturated of the rest. */
export function paletteOutOf(colours: readonly string[]): { ground: string; ink: string; accent: string; accent2?: string } | null {
  const xs = [...new Set(colours.filter((c) => HEX.test(c)).map((c) => c.toLowerCase()))];
  if (xs.length < 3) return null;
  const byLum = [...xs].sort((a, b) => lum(b) - lum(a));
  const ground = byLum[0];
  const ink = byLum[byLum.length - 1];
  const rest = xs.filter((c) => c !== ground && c !== ink).sort((a, b) => sat(b) - sat(a));
  return { ground, ink, accent: rest[0] ?? byLum[1], ...(rest[1] ? { accent2: rest[1] } : {}) };
}

/** The colours the liked references hold. A reference liked for its colour speaks for colour; one liked only for
 *  other things (its type, its composition) does not; one liked as a whole does. */
export function referenceColours(refs: readonly StudioReference[]): string[] {
  const forColour = refs.filter((r) => (r.take ?? []).includes('colour'));
  const whole = refs.filter((r) => !(r.take ?? []).length);
  return (forColour.length ? forColour : whole).flatMap((r) => r.swatches ?? []).slice(0, 18);
}

/** A reference's credit line, ready to print. */
export const creditOf = (r: Pick<StudioReference, 'title' | 'creator' | 'license' | 'provider'>) => `“${r.title || 'Untitled'}”${r.creator ? ` by ${r.creator}` : ''}${r.license ? `, ${r.license}` : ''}, via ${r.provider === 'openverse' ? 'Openverse' : r.provider}`;

/** References found, added to those already held: liked and turned-down ones are always kept (a choice stays a
 *  choice); when there are too many, the oldest of those nobody has looked at give way first. */
export function mergeReferences(have: readonly StudioReference[], found: readonly StudioReference[], max = 60): StudioReference[] {
  const ids = new Set(have.map((r) => r.id));
  const all = [...have, ...found.filter((r) => !ids.has(r.id) && (ids.add(r.id), true))];
  let over = all.length - max;
  if (over <= 0) return all;
  return all.filter((r) => (over > 0 && r.state === 'proposed' ? (over--, false) : true)).slice(-max);
}

/** The log of one more round of searching, added to what was searched before (the newest kept). */
export const mergeLog = (have: ResearchLog | undefined, round: ResearchLog): ResearchLog => ({ at: round.at, searches: [...(have?.searches ?? []), ...round.searches].slice(-20) });

/** Where the searching stands, in one honest line. */
export function researchStatus(st: Pick<StudioState, 'references' | 'research'>, busy: boolean): { text: string; failed: boolean } {
  const refs = st.references ?? [];
  const shown = refs.filter((r) => r.state !== 'rejected').length;
  const turned = refs.length - shown;
  const log = st.research;
  if (busy) return { text: shown ? `Searching Openverse for more… (${shown} so far)` : 'Searching Openverse for references…', failed: false };
  if (!log || !log.searches.length) return { text: 'Nothing has been searched for yet.', failed: false };
  const last = log.searches[log.searches.length - 1];
  if (!refs.length && log.searches.every((x) => x.error)) return { text: `Openverse could not be searched just now: ${(last.error ?? 'no answer').toLowerCase()}.`, failed: true };
  const queries = [...new Set(log.searches.filter((x) => !x.error).map((x) => `“${x.query}”`))];
  const said = queries.length > 4 ? `${queries.slice(-4).join(', ')} and ${queries.length - 4} earlier search${queries.length - 4 === 1 ? '' : 'es'}` : queries.join(', ');
  const tail = last.error ? ` Your last search could not be completed (${last.error.toLowerCase()}).` : '';
  if (!shown) return { text: `${turned ? `All ${turned} turned down. ` : 'Nothing found to show. '}Search for something else, or carry on without references.${tail}`, failed: !!last.error };
  return { text: `${shown} found on Openverse${said ? ` for ${said}` : ''}${turned ? ` · ${turned} turned down` : ''}.${tail}`, failed: false };
}

// ── searching (Openverse: openly licensed works, no key, a limit per caller — so it is asked from the person's browser,
// one search after another, each as written and then in its shorter forms while it finds nothing). What is returned is
// exactly what the library returned; the log says what was searched and what came of it, failures included. ──

const cache = new Map<string, unknown>();
const PER = 8;
/** Forget what was fetched (a page answered once is otherwise kept for the session). */
export const clearResearchCache = () => cache.clear();

class Busy extends Error {}

async function page(url: string, fetcher: typeof fetch): Promise<unknown> {
  const have = cache.get(url);
  if (have !== undefined) return have;
  const res = await fetcher(url, { headers: { Accept: 'application/json' } });
  if (res.status === 429) throw new Busy('busy');
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  if (cache.size > 120) cache.delete(cache.keys().next().value as string);
  cache.set(url, json);
  return json;
}

const toReference = (r: Record<string, unknown>, query: string, now: number): StudioReference | null => {
  const thumb = safe(r.thumb);
  const id = String(r.providerId ?? '');
  if (!thumb || !id) return null;
  return {
    id: `openverse:${id}`.slice(0, 140),
    provider: 'openverse',
    title: String(r.title ?? '').slice(0, 200),
    creator: String(r.creator ?? '').slice(0, 120),
    sourceUrl: safe(r.sourceUrl),
    ...(r.origin ? { origin: String(r.origin).slice(0, 40) } : {}),
    thumb,
    width: Number(r.width) || 0,
    height: Number(r.height) || 0,
    license: String(r.license ?? '').slice(0, 60),
    licenseUrl: safe(r.licenseUrl),
    tags: (Array.isArray(r.tags) ? (r.tags as string[]) : []).slice(0, 12),
    query,
    state: 'proposed',
    at: now,
  };
};

/** One search: as asked, then shorter, until something is found or the library says no. */
async function searchOne(q: ResearchQuery, exclude: ReadonlySet<string>, fetcher: typeof fetch, now: number): Promise<{ refs: StudioReference[]; log: ResearchSearch }> {
  let error = '';
  for (const query of shorterQueries(q.q).slice(0, 3)) {
    try {
      const raw = mapOpenverse(await page(openverseUrl(query, 1, { anyLicense: true }), fetcher));
      const refs = rankReferences(
        raw.map((r) => toReference(r, q.q, now)).filter((r): r is StudioReference => !!r),
        q.q,
        exclude,
      ).slice(0, PER);
      if (refs.length) return { refs, log: { query, provider: 'openverse', found: refs.length } };
      error = '';
    } catch (e) {
      // a library that is busy says so once; one that cannot be reached is tried in a shorter form
      if (e instanceof Busy) return { refs: [], log: { query: q.q, provider: 'openverse', found: 0, error: 'Openverse is busy for a moment' } };
      error = /^\d+$/.test((e as Error).message) ? `Openverse answered ${(e as Error).message}` : 'Openverse could not be reached';
    }
  }
  return { refs: [], log: { query: q.q, provider: 'openverse', found: 0, ...(error ? { error } : {}) } };
}

/** Every search of a plan, one after another; what was found, best first, and the log of what really happened. */
export async function runResearch(queries: readonly ResearchQuery[], opts: { exclude?: ReadonlySet<string>; fetcher?: typeof fetch; now?: number } = {}): Promise<{ refs: StudioReference[]; log: ResearchLog }> {
  const fetcher = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now();
  const exclude = new Set(opts.exclude ?? []);
  const refs: StudioReference[] = [];
  const searches: ResearchSearch[] = [];
  for (const q of queries.slice(0, 4)) {
    const r = await searchOne(q, exclude, fetcher, now);
    for (const x of r.refs) exclude.add(x.id);
    refs.push(...r.refs);
    searches.push(r.log);
  }
  return { refs, log: { at: now, searches } };
}

/** The log, said as it happened. */
export function researchSaid(log: ResearchLog, found: number): string {
  const asked = log.searches.map((s) => `“${s.query}”`);
  const failed = log.searches.filter((s) => s.error);
  if (!found && failed.length === log.searches.length) return `I tried to look for references on Openverse (${asked.join(', ')}), but ${failed[0]?.error?.toLowerCase() ?? 'it could not be reached'}. You can search again, add pictures of your own, or carry on without them.`;
  if (!found) return `I searched Openverse for ${asked.join(', ')} and found nothing worth showing. Try other words, or add pictures of your own.`;
  return `I looked for references on Openverse — ${asked.join(', ')} — and found ${found}. They are openly licensed and each says where it comes from. Tell me which feel right; they guide the direction and are never copied into your work.${failed.length ? ` (${failed.length} search${failed.length === 1 ? '' : 'es'} could not be completed.)` : ''}`;
}
