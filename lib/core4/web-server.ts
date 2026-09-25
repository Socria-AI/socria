import 'server-only';
import type { Activity } from './activity';
// lib/core4/web-server.ts
//
// The half of Core 4's internet access that touches the network — and it owns
// almost none of it, deliberately.
//
// SEARCH IS LOGOS'S SEARCH. lib/logos-explore.ts already had a provider layer
// (Serper, then Tavily, both env-gated, neither configured being a supported
// state rather than an error), and the sub-processor register already names
// those two companies. A second provider layer here would have meant two
// places to keep a key, two timeout policies, two sets of response parsing to
// follow when a vendor changes a field name — and a privacy page that was
// quietly wrong about who receives what. This calls `runSearch`.
//
// PAGE READING IS LOGOS'S FETCHER. lib/logos-connect's `fetchWeb` is the
// hardened one: every redirect hop screened by hand, the address check inside
// the socket's own DNS lookup so a rebind cannot slip between the check and the
// connection, and a byte ceiling on the body. It has a test suite pointed at
// it. Writing a second fetcher would have meant a second fetcher to keep safe.
//
// NO KEY MEANS NO SEARCH. There is no scraping fallback: a deployment with
// neither key cannot search, and Core 4 says it could not check rather than
// answering from a memory of how the world was.
//
// EVERYTHING FAILS SOFT. A provider that is down, slow or rate-limited costs
// the turn its evidence and nothing else.

import { fetchWeb } from '../logos-connect';
import { runSearch, searchConfigured } from '../logos-explore';
import { buildQuery, flatten, webIntent, type Research, type WebSource } from './web';
import type { ExplicitSignals } from './types';

/** Long enough for a search to answer, short enough not to hold a reply. */
const SEARCH_TIMEOUT_MS = 6000;
/** A page is bigger than a snippet, and fetchWeb has its own 12 s ceiling. */
const PAGE_TIMEOUT_MS = 9000;
/** Four is enough to disagree with itself; ten is a wall of text. */
const MAX_SOURCES = 4;
/** How much of a fetched page reaches the prompt. */
const MAX_PAGE_CHARS = 4000;

/** Whether this deployment can search at all. Read before anything else. */
export function webAvailable(): boolean {
  return searchConfigured();
}

function site(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** One search, or nothing. Never throws. */
export async function searchWeb(query: string): Promise<{ sources: WebSource[]; provider: string }> {
  if (!searchConfigured() || !query.trim()) return { sources: [], provider: '' };
  try {
    // Logos's own search, with a shorter leash: Explore runs in a panel the
    // person is watching fill, where this is holding up a reply.
    // `images: false`: a reply has nowhere to put a picture, and asking for
    // them anyway spent a second billed request per search and added a second
    // endpoint that could fail on a turn that would have discarded the answer.
    const bundle = await withTimeout(runSearch(query, { images: false }), SEARCH_TIMEOUT_MS);
    if (!bundle) {
      console.error('[core4/web] search timed out', { ms: SEARCH_TIMEOUT_MS });
      return { sources: [], provider: '' };
    }
    // A NAMED NOTHING. The provider says why it had nothing — a rejected key,
    // an account out of credits, blocked egress, or a query that genuinely
    // matched nothing — and those need entirely different fixes. Reaching the
    // rest of the turn as one empty array is what made four rounds of "search
    // still isn't working" unanswerable from outside.
    if (bundle.failure) {
      console.error('[core4/web] no sources for this turn', bundle.failure);
    }
    const sources = bundle.results
      .filter((r) => r.url.startsWith('http'))
      .slice(0, MAX_SOURCES)
      // The numbering is assigned HERE, after filtering, so [1] is the first
      // source the prompt actually lists — a number that referred to a
      // discarded row would be a citation pointing at nothing.
      .map((r, i) => ({
        n: i + 1,
        title: flatten(r.title).slice(0, 160) || site(r.url),
        url: r.url,
        site: r.site || site(r.url),
        // A date decides most of whether a source answers a question about how
        // things are now, which is the main reason the gate opened at all.
        ...(r.published ? { published: flatten(r.published) } : {}),
        snippet: flatten(r.snippet).slice(0, 400),
      }));
    // Images are dropped. Explore shows them beside a node; a reply has
    // nowhere to put one, and fetching them would be bytes for nothing.
    return { sources, provider: bundle.provider ?? '' };
  } catch (e) {
    console.error('[core4/web] search failed; the turn continues without it', e);
    return { sources: [], provider: '' };
  }
}

/** One page they pointed at, as text. Never throws. */
export async function readPage(url: string): Promise<WebSource | null> {
  try {
    const got = await withTimeout(fetchWeb(url), PAGE_TIMEOUT_MS);
    if (!got) return null;
    return {
      n: 1,
      title: flatten(got.title) || site(url),
      url,
      site: site(url),
      snippet: '',
      text: got.text.slice(0, MAX_PAGE_CHARS),
    };
  } catch (e) {
    console.error('[core4/web] page read failed; the turn continues without it', e);
    return null;
  }
}

export interface ResearchInput {
  lastUserText: string;
  signals: ExplicitSignals;
  /** names the query must not carry — the account's own, when known */
  names?: string[];
  /**
   * What the conversation was already marked as (the carried-forward state's
   * persistPolicy). A conversation established as sensitive, or put off the
   * record, stays that way on every later turn — including the ones that read
   * as ordinary questions.
   */
  policy?: 'full' | 'conversation_only' | 'none';
  /** the word under the dots — see lib/core4/activity.ts. Presentation only. */
  onActivity?: (activity: Activity, phase: 'start' | 'end') => void;
}

/**
 * The whole errand: decide, build the query, go, come back.
 *
 * Returns null when the gate stayed shut, when nothing is configured, or when
 * the network said no — three different reasons that all mean the same thing
 * to the rest of the turn, which is why they are one return value. What they
 * do NOT mean is a turn that stalls: every path here is bounded by a timeout
 * and every failure is swallowed after being logged.
 */
export async function runResearch(input: ResearchInput): Promise<Research | null> {
  const intent = webIntent(input.lastUserText, input.signals, input.policy);
  if (!intent.want) return null;

  // THE INDICATOR SAYS "searching" ONLY WHERE A QUERY ACTUALLY GOES OUT.
  //
  // Emitted from here rather than from the caller, which cannot know: most turns
  // never search at all — the gate is the policy, the signals and a configured
  // provider — and a word announced beside a call that returns null on the first
  // line would be exactly the fake state the indicator exists to avoid.
  const say = input.onActivity;
  if (intent.kind === 'page' && intent.url) {
    say?.('reading', 'start');
    const page = await readPage(intent.url);
    say?.('reading', 'end');
    if (!page) return null;
    return { query: page.url, why: intent.why, sources: [page], provider: 'fetch' };
  }

  if (!webAvailable()) return null;
  const query = buildQuery(input.lastUserText, input.names ?? []);
  if (query.length < 3) return null;
  say?.('searching', 'start');
  const { sources, provider } = await searchWeb(query);
  say?.('searching', 'end');
  if (!sources.length) return null;
  // The pages themselves were fetched inside searchWeb; saying so after the fact
  // would be a lie about when. What IS true now is that their text is about to be
  // read into the prompt, and that is what this names.
  if (sources.some((x) => x.text)) {
    say?.('reading', 'start');
    say?.('reading', 'end');
  }
  return { query, why: intent.why, sources, provider };
}
