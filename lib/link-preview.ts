// lib/link-preview.ts
//
// THE COVER OF AN ARTICLE, read from the article.
//
// A list of four blue-grey URLs under "Searched the web for 'ai articles'" is
// a correct disclosure and a poor one: it says what left the machine, and it
// says nothing about what came back. Publishers already declare a cover — the
// image they want shown when their page is linked anywhere — so the honest
// picture to put beside a source is the one its own page nominates. Nothing
// here is generated, chosen for mood, or paired by resemblance; if a page
// declares no cover, the card carries no picture, and that is the truthful
// outcome rather than a gap to fill.
//
// PURE, because this is where the bugs are. The fetching lives in
// lib/logos-connect.ts, behind the same address screen as every other page
// this product reads.

/** What a page says about itself, as far as it says anything. */
export interface LinkPreview {
  /** an absolute http(s) URL, or nothing — never a placeholder */
  image: string | null;
  title: string | null;
  /** the publication's own name for itself, where it gives one */
  site: string | null;
}

export const EMPTY_PREVIEW: LinkPreview = { image: null, title: null, site: null };

/**
 * The five entities that actually turn up in a `content="…"` attribute.
 *
 * Deliberately not a general entity decoder: an og:image URL is the thing
 * being decoded here, and `&amp;` inside a query string is the one that breaks
 * images in practice. A full table would be more code standing between this
 * and the one case that matters.
 */
function unentity(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

const clean = (s: string | null | undefined, n: number): string | null => {
  if (!s) return null;
  const out = unentity(s).replace(/\s+/g, ' ').trim().slice(0, n);
  return out || null;
};

/**
 * Every `<meta>` on the page, as name → content.
 *
 * Attribute order is not guaranteed by anything, and half the web writes
 * `content` before `property`, so both orders are read. First writer wins,
 * which matches how a browser reads Open Graph.
 */
function metas(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
    const attrs = m[1];
    const key =
      attrs.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '';
    const content = attrs.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    if (key && content && !out.has(key)) out.set(key, content);
  }
  return out;
}

/**
 * Make one absolute, and refuse anything that is not a picture on the web.
 *
 * `data:` is refused deliberately. It would work — a browser draws it — but
 * it means an arbitrary number of bytes of somebody else's choosing travelling
 * inside our JSON, and a cover is not worth that. `javascript:` is refused for
 * the obvious reason.
 */
function absolute(raw: string | null, base: string): string | null {
  if (!raw) return null;
  const v = unentity(raw).trim();
  if (!v || /^(javascript|data|blob|file|vbscript):/i.test(v)) return null;
  try {
    const u = new URL(v, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString().slice(0, 600);
  } catch {
    return null;
  }
}

/**
 * What a page declares about itself.
 *
 * The order is the order of intent: Open Graph is the publisher saying "this
 * is the picture for this page", Twitter's is the same statement in a second
 * dialect, and `link rel="image_src"` is the old one that a surprising number
 * of newsrooms still emit. An `<img>` from the body is NOT reached for: the
 * first image in a document is as often a logo, a tracking pixel or an advert
 * as it is the thing the article is about, and a wrong cover is worse than
 * none.
 */
export function parsePreview(html: string, finalUrl: string): LinkPreview {
  if (typeof html !== 'string' || !html) return EMPTY_PREVIEW;
  const head = html.slice(0, 200_000);
  const m = metas(head);

  const rel = head.match(
    /<link\s+[^>]*rel\s*=\s*["']image_src["'][^>]*href\s*=\s*["']([^"']+)["']/i
  )?.[1];

  const image =
    absolute(m.get('og:image:secure_url') ?? null, finalUrl) ??
    absolute(m.get('og:image') ?? null, finalUrl) ??
    absolute(m.get('twitter:image') ?? null, finalUrl) ??
    absolute(m.get('twitter:image:src') ?? null, finalUrl) ??
    absolute(m.get('image') ?? null, finalUrl) ??
    absolute(rel ?? null, finalUrl);

  const title =
    clean(m.get('og:title'), 200) ??
    clean(m.get('twitter:title'), 200) ??
    clean(head.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1], 200);

  let site = clean(m.get('og:site_name'), 60);
  if (!site) {
    try {
      site = new URL(finalUrl).hostname.replace(/^www\./, '') || null;
    } catch {
      site = null;
    }
  }

  return { image, title, site };
}
