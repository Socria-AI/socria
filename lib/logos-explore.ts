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
  /** true when the framing above actually drew on this one */
  cited?: boolean;
}

export interface ExploreImage {
  url: string;
  title?: string;
  link?: string;
}

// A node is never just a bubble. Four ways to act on one, all of which stop
// short of resolving it for them.
export const NODE_MODES = ['explore', 'challenge', 'research', 'trace'] as const;
export type NodeMode = (typeof NODE_MODES)[number];

export const MODE_META: Record<
  NodeMode,
  { label: string; blurb: string; searches: boolean }
> = {
  explore: {
    label: 'Explore',
    blurb: 'What this idea is, and what it isn’t',
    searches: true,
  },
  challenge: {
    label: 'Challenge',
    blurb: 'Where this would break',
    searches: false,
  },
  research: {
    label: 'Research',
    blurb: 'What the evidence actually says',
    searches: true,
  },
  trace: {
    label: 'Trace',
    blurb: 'Where this came from',
    searches: false,
  },
};

/** A quote pulled verbatim from the transcript — never model-authored. */
export interface ExploreOrigin {
  who: 'you' | 'logos';
  quote: string;
}

export interface ExploreResult {
  mode: NodeMode;
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
  /** challenge: the pressure points, each a way this could fail */
  points?: string[];
  /** trace: verbatim moments this node grew out of */
  origins?: ExploreOrigin[];
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

export function buildQueryPrompt(mode: NodeMode = 'explore'): string {
  if (mode === 'research') {
    return `You turn a fragment of someone's reasoning into ONE web search query aimed at EVIDENCE — studies, data, documented outcomes, base rates — rather than definitions.

Return ONLY JSON: {"query": "...", "concept": "..."}

- "query" should surface what is actually known empirically about this: findings, numbers, replication, failure rates. Prefer terms like "study", "evidence", "data", "outcomes", "meta-analysis" where they fit.
- "concept" is the short name of what is being evidenced, 2-6 words.
- Never include the person's private details in the query. Search the CLAIM, not the person.`;
  }

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

// Challenge — stress-test the node without declaring it wrong. The difference
// matters: "this is a weak assumption" is a verdict; "this holds only if X, and
// you haven't said whether X is true" hands the test back to them.
export function buildChallengePrompt(
  nodeLabel: string,
  nodeType: string,
  conversation: string
): string {
  return `You are Logos. Someone has pointed at one piece of their own reasoning and asked you to put pressure on it. You do NOT tell them it is wrong. You show them where it would break, and leave the testing to them.

The piece:
  ${nodeType}: "${nodeLabel}"

Their conversation so far:
${conversation}

Return ONLY JSON:
{
  "framing": "1-2 sentences naming what this piece is actually load-bearing for — what else in their reasoning falls if this one gives way.",
  "points": ["2-4 pressure points. Each is ONE sentence, and each must be a condition, not a criticism: what would have to be true for this to hold, the strongest version of the opposite case, or the thing they have assumed without checking. Phrase them so they can be tested, not agreed with."],
  "connection": "1 sentence pointing at the specific thing they said that this rests on, in their words.",
  "question": "ONE question that makes the weakest point testable by them."
}

Absolute rules:
- NEVER say they are wrong, mistaken, or should reconsider. Show the load, not the verdict.
- NEVER resolve the tension you expose. Exposing it IS the work.
- Steelman the opposite case rather than knocking down a weak version of it.
- Do not invent facts, studies or statistics. This is about the structure of their reasoning, not about the world.
- Do not be contrarian for its own sake. If a piece is genuinely well-founded on what they've said, say what it would take to move it instead of manufacturing doubt.
- Plain prose. No markdown, no headings.`;
}

// Trace — where did this node come from? Origins are chosen by index and the
// text is sliced from the real transcript server-side, so a quote can never be
// invented.
export function buildTracePrompt(
  nodeLabel: string,
  nodeType: string,
  indexedConversation: string,
  lineage: string
): string {
  return `You are Logos. Someone wants to see where one piece of their reasoning came from. You retrace it — you do not extend it.

The piece:
  ${nodeType}: "${nodeLabel}"

Its place in the map right now:
${lineage || '(standing on its own so far)'}

Their conversation, numbered:
${indexedConversation}

Return ONLY JSON:
{
  "framing": "2-3 sentences retracing how this entered their thinking and what it has done since — did it arrive early and hold, did it appear once and get quiet, did it change shape. Describe the movement, do not judge it.",
  "originIndexes": [0, 3],
  "connection": "1 sentence on how it now sits against the rest of the map, using the lineage above.",
  "question": "ONE question about whether this still means to them what it meant when it first appeared."
}

Absolute rules:
- "originIndexes" are the numbers of the messages this piece actually grew out of — at most 3, most important first. Only real numbers from the list. Empty array if you genuinely cannot tell.
- Never quote text yourself; only give indexes. The quotes are taken from the transcript, not from you.
- NEVER conclude, recommend, or tell them what the trace means they should do.
- Plain prose. No markdown, no headings.`;
}

export function buildResearchPrompt(
  nodeLabel: string,
  nodeType: string,
  conversation: string,
  concept: string,
  sources: SearchBundle['results']
): string {
  const sourceBlock = sources.length
    ? sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.site}\n${s.snippet}`).join('\n\n')
    : '(no search results available)';

  return `You are Logos. Someone wants to know what is actually KNOWN about one piece of their reasoning — the evidence, not the definition. You report the state of the evidence and stop there.

The piece:
  ${nodeType}: "${nodeLabel}"
Concept: ${concept}

Their conversation so far:
${conversation}

Research material:
${sourceBlock}

Return ONLY JSON:
{
  "framing": "3-4 sentences on what the material above actually establishes, and — just as important — where it is thin, contested, or absent. Attribute honestly and say plainly when the evidence does not settle the matter.",
  "points": ["2-3 short findings, each ONE sentence, each traceable to the material above. If the material is empty, return an empty array rather than inventing findings."],
  "connection": "1-2 sentences on which part of THEIR reasoning this evidence bears on, in their words.",
  "question": "ONE question about what evidence would actually change their mind here.",
  "sourceIndexes": [1, 2]
}

Absolute rules:
- NEVER conclude what they should do. Evidence about the world is not a decision about their life.
- Report disagreement in the literature as disagreement. Do not average it into a false consensus.
- Do not invent studies, names, statistics, or citations. Only what appears above. If it is empty, say the evidence was not retrievable and return no findings.
- Say "the evidence is thin here" when it is. That is a real and useful answer.
- Plain prose. No markdown, no headings.`;
}

const MAX_POINTS = 4;
const MAX_ORIGINS = 3;
const MAX_QUOTE = 260;

export function sanitizeExplore(
  raw: any,
  search: SearchBundle,
  concept: string,
  mode: NodeMode = 'explore',
  transcript: { role: 'user' | 'assistant'; content: string }[] = []
): ExploreResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v: any, n: number) =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';

  const framing = str(raw.framing, 900);
  const question = str(raw.question, 320);

  const points = (Array.isArray(raw.points) ? raw.points : [])
    .map((p: any) => str(p, 300))
    .filter(Boolean)
    .slice(0, MAX_POINTS);

  // Quotes are sliced from the real transcript by index — the model chooses
  // which moments, never the words. That makes a fabricated quote impossible.
  const origins: ExploreOrigin[] = (
    Array.isArray(raw.originIndexes) ? raw.originIndexes : []
  )
    .map((i: any) => transcript[Number(i)])
    .filter(Boolean)
    .slice(0, MAX_ORIGINS)
    .map((m: any) => ({
      who: m.role === 'user' ? ('you' as const) : ('logos' as const),
      quote: m.content.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE),
    }))
    .filter((o: ExploreOrigin) => o.quote.length > 0);

  // Each mode has its own minimum bar for being worth showing.
  const usable =
    mode === 'challenge'
      ? !!(points.length || framing)
      : mode === 'trace'
        ? !!(framing || origins.length)
        : !!(framing || question);
  if (!usable) return null;

  // Sources the model actually cited come first, then the rest of what we
  // genuinely fetched — so a panel is never left without somewhere to read
  // further. Everything here was really retrieved; nothing is invented.
  const idxs = Array.isArray(raw.sourceIndexes) ? raw.sourceIndexes : [];
  const cited = idxs
    .map((i: any) => search.results[Number(i) - 1])
    .filter(Boolean);
  const citedUrls = new Set(cited.map((s: any) => s.url));
  const ordered = [...cited, ...search.results.filter((s) => !citedUrls.has(s.url))];
  const sources: ExploreSource[] = ordered.slice(0, MAX_SOURCES).map((s: any) => ({
    title: s.title,
    url: s.url,
    site: s.site,
    cited: citedUrls.has(s.url),
  }));

  return {
    mode,
    concept: str(concept, 80) || 'Related thinking',
    framing,
    connection: str(raw.connection, 400),
    question,
    sources,
    images: search.images.slice(0, MAX_IMAGES),
    ...(points.length ? { points } : {}),
    ...(origins.length ? { origins } : {}),
  };
}
