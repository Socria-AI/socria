// lib/ux-v0/research/schema.ts — references found on the internet: what is asked, what comes back, held to its shape.
//
// Research is a search through a provider the workspace has configured (lib/ux-v0/research/providers-server.ts: Brave
// Search, Google Programmable Search or Serper, each with its own key) — never a scrape. A result is a page or a
// picture with where it came from: its title, its address, its site, a short line, a small preview the provider serves.
// Results are held to their shape here: web addresses only (no other scheme), no address on a private network, text
// without markup, everything bounded. They are inspiration — kept as references the person chose, never placed in the
// work and never copied into it. When no provider is configured, or it cannot be reached, that is said; nothing is
// ever made up in a result's place.

export type ResearchKind = 'websites' | 'images';

export interface ResearchResult {
  id: string;
  kind: 'website' | 'image';
  title: string;
  /** the page it is on */
  url: string;
  /** the site, as people know it */
  host: string;
  snippet?: string;
  /** a small preview, served by the provider */
  thumb?: string;
  /** the picture itself (images) */
  image?: string;
  width?: number;
  height?: number;
  /** who found it */
  provider: string;
}

export type ResearchStatus = 'ok' | 'empty' | 'not-configured' | 'unavailable';

export interface ResearchResponse {
  status: ResearchStatus;
  query: string;
  kind: ResearchKind;
  provider: string | null;
  results: ResearchResult[];
  /** what happened, said to the person */
  message: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').replace(/&(amp|quot|#39|lt|gt|nbsp);/g, (m) => ({ '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' })[m] ?? ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** A web address that may be linked to and shown: http(s) only, a public name (no private, local or bare-IP host). */
export function webAddress(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || /^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home\.arpa)$/.test(h) || /^[\d.]+$/.test(h) || h.includes(':')) return null;
  if (u.username || u.password) return null;
  return u.toString();
}

/** One result held to its shape; null when it is not a page or a picture that can be shown and linked. */
export function cleanResult(raw: Record<string, unknown>, provider: string, kind: 'website' | 'image', i: number): ResearchResult | null {
  const url = webAddress(raw.url);
  if (!url) return null;
  const title = str(raw.title, 160) || new URL(url).hostname;
  const thumb = webAddress(raw.thumb) ?? undefined;
  const image = webAddress(raw.image) ?? undefined;
  if (kind === 'image' && !thumb && !image) return null;
  const host = new URL(url).hostname.replace(/^www\./, '');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100000 ? Math.round(v) : undefined);
  return {
    id: `${provider}:${kind}:${i}:${host}`.slice(0, 120),
    kind,
    title,
    url,
    host,
    ...(str(raw.snippet, 280) ? { snippet: str(raw.snippet, 280) } : {}),
    ...(thumb ? { thumb } : {}),
    ...(image ? { image } : {}),
    ...(num(raw.width) ? { width: num(raw.width) } : {}),
    ...(num(raw.height) ? { height: num(raw.height) } : {}),
    provider,
  };
}

/**
 * Words that ask for references to be found ("find me some interesting references for an experimental architecture
 * website"), read into what to search for and whether pages or pictures; null when they ask for something else.
 */
export function researchAskOf(words0: string): { query: string; kind: ResearchKind } | null {
  const w = words0.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  if (!w || w.length > 300) return null;
  const m = w.match(/\b(?:find|search(?: for)?|look for|show me|get me|pull|gather|collect|dig up|research|source|bring me|i need|i want|can you find|could you find)\b\s+(?:me\s+|us\s+)?(?:some\s+|a few\s+|a couple of\s+|any\s+|more\s+|good\s+|great\s+|interesting\s+|inspiring\s+|strong\s+|real\s+|\d+\s+)*(references?|inspiration|inspirations|examples?|precedents?|ideas|moodboard images|mood ?board|pictures|images|photos|websites|sites|portfolios|posters|logos)\b\s*(?:of|for|from|on|about|like|with)?\s*(.*)$/);
  if (!m) return null;
  const what = m[1];
  let topic = m[2].replace(/[.!?]+$/, '').replace(/^(an?|the|some|my|our)\s+/, '').trim();
  if (!topic && /^(websites|sites|portfolios|posters|logos)$/.test(what)) topic = what;
  if (!topic || topic.split(' ').length > 18) return null;
  const images = /\b(pictures|images|photos|photography|moodboard|mood ?board|illustrations?|textures?|posters|logos)\b/.test(`${what} ${topic}`) && !/\b(websites?|sites|web|landing pages?|portfolios)\b/.test(`${what} ${topic}`);
  // a search phrase: the topic, with the kind of work it is when it does not say
  const query = /\b(designs?|websites?|sites?|posters?|logos?|branding|identit(y|ies)|typography|architecture|interiors?|editorial|illustrations?|photography|ui|interfaces?|portfolios?|packaging)\b/.test(topic) ? topic : `${topic} design`;
  return { query: query.slice(0, 160), kind: images ? 'images' : 'websites' };
}
