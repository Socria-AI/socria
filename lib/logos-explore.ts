// lib/logos-explore.ts
//
// Explore — click a node and Logos brings in what the world knows about that
// idea, without ever resolving it for you.
//
// The hard rule: research may offer a DISTINCTION or a frame, never a verdict.
// "Research distinguishes autonomy from other sources of motivation" is the
// job. "You should pursue entrepreneurship" is a product failure.
//
// Sources are real or absent. If no search provider is configured we still
// produce the framing and question, but return zero sources rather than let
// the model invent citations — fabricated references would be worse than none
// in a tool about thinking clearly.

export interface ExploreSource {
  title: string;
  url: string;
  site: string;
}

export interface ExploreImage {
  url: string;
  title?: string;
  link?: string;
}

export interface ExploreResult {
  /** the concept the research angle is named after */
  concept: string;
  /** what research distinguishes — a frame, never a conclusion */
  framing: string;
  /** ties the frame to what they actually said */
  connection: string;
  /** one question that opens the reasoning back up */
  question: string;
  sources: ExploreSource[];
  images: ExploreImage[];
}

const MAX_SOURCES = 5;
const MAX_IMAGES = 6;

function safeUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export interface SearchBundle {
  results: { title: string; url: string; snippet: string; site: string }[];
  images: ExploreImage[];
  provider: string | null;
}

export const EMPTY_SEARCH: SearchBundle = { results: [], images: [], provider: null };

// ── providers ───────────────────────────────────────────────────────
// Serper gives literal Google results; Tavily is the fallback. Neither
// configured is a supported state, not an error.
async function serper(query: string): Promise<SearchBundle> {
  const key = process.env.SERPER_API_KEY!;
  const headers = { 'X-API-KEY': key, 'Content-Type': 'application/json' };
  const [web, img] = await Promise.all([
    fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({ q: query, num: 8 }),
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers,
      body: JSON.stringify({ q: query, num: 10 }),
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const results = (web?.organic ?? [])
    .map((o: any) => {
      const url = safeUrl(o?.link);
      return url
        ? {
            title: String(o?.title ?? '').slice(0, 160),
            url,
            snippet: String(o?.snippet ?? '').slice(0, 400),
            site: siteOf(url),
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 8);

  const images = (img?.images ?? [])
    .map((i: any) => {
      const url = safeUrl(i?.imageUrl);
      return url
        ? { url, title: String(i?.title ?? '').slice(0, 120), link: safeUrl(i?.link) ?? undefined }
        : null;
    })
    .filter(Boolean)
    .slice(0, MAX_IMAGES);

  return { results, images, provider: 'google' };
}

async function tavily(query: string): Promise<SearchBundle> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      include_images: true,
      max_results: 8,
      search_depth: 'basic',
    }),
    cache: 'no-store',
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const results = (res?.results ?? [])
    .map((o: any) => {
      const url = safeUrl(o?.url);
      return url
        ? {
            title: String(o?.title ?? '').slice(0, 160),
            url,
            snippet: String(o?.content ?? '').slice(0, 400),
            site: siteOf(url),
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 8);

  const images = (res?.images ?? [])
    .map((i: any) => {
      const url = safeUrl(typeof i === 'string' ? i : i?.url);
      return url ? { url } : null;
    })
    .filter(Boolean)
    .slice(0, MAX_IMAGES);

  return { results, images, provider: 'tavily' };
}

export function searchConfigured(): boolean {
  return !!(process.env.SERPER_API_KEY || process.env.TAVILY_API_KEY);
}

export async function runSearch(query: string): Promise<SearchBundle> {
  try {
    if (process.env.SERPER_API_KEY) return await serper(query);
    if (process.env.TAVILY_API_KEY) return await tavily(query);
  } catch {
    // A dead search provider must not break the panel.
  }
  return EMPTY_SEARCH;
}

// ── prompts ─────────────────────────────────────────────────────────

export function buildQueryPrompt(): string {
  return `You turn a fragment of someone's reasoning into ONE web search query that would surface the relevant research, concept, or framework.

Return ONLY JSON: {"query": "...", "concept": "..."}

- "query" is what you would type into Google to find the research literature behind this idea. Prefer the academic or conceptual vocabulary over the person's phrasing: "Freedom to build" becomes "autonomy self-determination theory motivation research", not "freedom to build".
- "concept" is the short name of the idea that vocabulary points at ("Autonomy (self-determination theory)"), 2-6 words.
- Never include the person's private details in the query. Search the CONCEPT, not the person.`;
}

export function buildExplorePrompt(
  nodeLabel: string,
  nodeType: string,
  conversation: string,
  concept: string,
  sources: SearchBundle['results']
): string {
  const sourceBlock = sources.length
    ? sources
        .map((s, i) => `[${i + 1}] ${s.title} — ${s.site}\n${s.snippet}`)
        .join('\n\n')
    : '(no search results available)';

  return `You are Logos. Someone clicked one piece of their own reasoning to look closer at it. You bring in what is known about that idea WITHOUT resolving their question.

The piece they clicked:
  ${nodeType}: "${nodeLabel}"
Concept it points at: ${concept}

Their conversation so far:
${conversation}

Research material:
${sourceBlock}

Return ONLY JSON:
{
  "framing": "2-3 sentences. What research or established thinking DISTINGUISHES here — a frame, a distinction, a definition that sharpens the idea. Attribute honestly ('Research on motivation often distinguishes...'). If the material is thin, offer the conceptual distinction without pretending to cite.",
  "connection": "1-2 sentences tying that frame to what THEY actually said, quoting their own language. e.g. 'You've repeatedly connected independence with building Socria.'",
  "question": "ONE question that uses the distinction to open their reasoning. It must be answerable by them and must not have a right answer.",
  "sourceIndexes": [1, 2]
}

Absolute rules:
- NEVER conclude, recommend, advise, or tell them what to do. "You should pursue entrepreneurship" is a total failure, no matter how well supported.
- NEVER resolve the tension or answer the question they are working through. You are adding a lens, not a verdict.
- Research informs the FRAME, never the DECISION. The conclusion is always theirs.
- Do not invent studies, names, statistics, or citations. Only reference what appears in the material above; if it is empty, speak in general conceptual terms and cite nothing.
- "sourceIndexes" lists only the numbered items above you actually drew on. Empty array if none.
- Plain prose. No markdown, no lists, no headings.`;
}

export function sanitizeExplore(
  raw: any,
  search: SearchBundle,
  concept: string
): ExploreResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v: any, n: number) =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';

  const framing = str(raw.framing, 700);
  const question = str(raw.question, 320);
  if (!framing && !question) return null;

  // Only sources the model actually cited, and only ones we really fetched.
  const idxs = Array.isArray(raw.sourceIndexes) ? raw.sourceIndexes : [];
  const picked = idxs
    .map((i: any) => search.results[Number(i) - 1])
    .filter(Boolean)
    .slice(0, MAX_SOURCES);
  const sources: ExploreSource[] = (picked.length ? picked : search.results.slice(0, 3)).map(
    (s: any) => ({ title: s.title, url: s.url, site: s.site })
  );

  return {
    concept: str(concept, 80) || 'Related thinking',
    framing,
    connection: str(raw.connection, 400),
    question,
    sources,
    images: search.images.slice(0, MAX_IMAGES),
  };
}
