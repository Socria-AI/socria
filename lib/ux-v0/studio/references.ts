// lib/ux-v0/studio/references.ts — a website the person points to, read for what a designer would take from it.
//
// Reference discovery is optional and on request: a link in the conversation ("something like linear.app") is read
// through the same guarded reader the design-system import uses (lib/ux-v0/dsi/site-server.ts: public addresses only,
// every hop checked, size- and time-capped, nothing run), and what comes back is said in a designer's words — its
// ground, its text and its accent, its typefaces, whether its headings shout or its corners are soft. The person says
// what to take (its colours, its type, its layout, its mood, or the whole of it). A reference is never placed in the
// work: only what it says reaches the engines (a palette, faces the font library has, words for the look). A page is
// also drawn as it is, without its scripts, in a sealed frame, so the person sees what was read.
//
// Pure: the fetching is the server's (./reference-server.ts); this module reads and draws.

import type { RefTake, StudioReference, StudioState } from './schema';
import { linkUrl, said } from './schema';
import type { SystemContent } from '../dsi/schema';
import type { PageRefs } from '../dsi/site';

/** What was read from a website, before the person has said what to take from it. */
export interface SiteRead {
  url: string;
  host: string;
  title: string;
  description?: string;
  colours: string[];
  ground?: string;
  ink?: string;
  accent?: string;
  fonts: string[];
  notes: string[];
}

const HEX = /^#[0-9a-f]{6}$/i;
const hex6 = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  if (/^#[0-9a-f]{8}$/.test(s)) return s.slice(0, 7);
  return HEX.test(s) ? s : '';
};
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const sat = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};
const hueWord = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx - mn < 0.08) return '';
  let hue = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
  hue = (hue * 60 + 360) % 360;
  return hue < 15 || hue >= 345 ? 'red' : hue < 40 ? 'orange' : hue < 65 ? 'yellow' : hue < 160 ? 'green' : hue < 200 ? 'teal' : hue < 255 ? 'blue' : hue < 290 ? 'violet' : 'pink';
};

const SERIFS = /\b(serif|georgia|times|garamond|caslon|baskerville|bodoni|didot|playfair|fraunces|lora|merriweather|libre baskerville|crimson|cormorant|tiempos|freight|publico|domaine|canela|newsreader|source serif|noto serif|instrument serif|dm serif|eb garamond|spectral|literata|charter|ivar|gt sectra|editorial new|ogg)\b/i;
const MONOS = /\b(mono|code|courier|consolas|menlo|monaco)\b/i;
const faceKind = (f: string) => (MONOS.test(f) ? 'monospaced' : SERIFS.test(f) && !/\bsans\b/i.test(f) ? 'serif' : 'sans-serif');

/** What the site reader found (lib/ux-v0/dsi/site.ts reconstructSite), said as a designer would. */
export function siteReadOf(r: { content: SystemContent; page: Pick<PageRefs, 'title' | 'description' | 'themeColor'> }, url: string): SiteRead {
  const tokens = Object.values(r.content.tokens ?? {});
  const colourOf = (path: string) => hex6(r.content.tokens?.[path]?.value);
  const ground = colourOf('color.site.background');
  const ink = colourOf('color.site.text');
  const accent = colourOf('color.site.accent') || hex6(r.page.themeColor);
  // the site's own palette first (what it uses), then what its stylesheet declares
  const used = tokens.filter((t) => t.type === 'color' && /^color\.site\.palette-/.test(t.path)).map((t) => hex6(t.value));
  const declared = tokens.filter((t) => t.type === 'color' && !t.path.startsWith('color.site.')).map((t) => hex6(t.value));
  const colours = [...new Set([ground, ink, accent, ...used, ...declared].filter(Boolean))].slice(0, 8);
  const fontOf = (path: string) => {
    const v = r.content.tokens?.[path]?.value;
    return typeof v === 'string' ? v.split(',')[0].replace(/["']/g, '').trim() : '';
  };
  const fonts = [...new Set([fontOf('font.family.display'), fontOf('font.family.body'), ...tokens.filter((t) => t.type === 'fontFamily').map((t) => (typeof t.value === 'string' ? t.value.split(',')[0].replace(/["']/g, '').trim() : ''))].filter((f) => f && !/^var\(|^inherit$/i.test(f)))].slice(0, 4);
  const notes: string[] = [];
  if (ground) notes.push(lum(ground) > 0.6 ? 'a light ground' : lum(ground) < 0.12 ? 'a dark ground' : 'a mid-tone ground');
  if (accent && sat(accent) > 0.25) notes.push(`${hueWord(accent) || 'a strong'} accent`.replace(/^(\w+) accent$/, 'a $1 accent'));
  const vivid = colours.filter((c) => sat(c) > 0.45 && lum(c) > 0.05 && lum(c) < 0.85).length;
  if (vivid >= 4) notes.push('a lot of colour');
  else if (colours.length && vivid === 0) notes.push('almost no colour');
  if (fonts[0]) notes.push(`${faceKind(fonts[0])} headings`);
  for (const i of r.content.intelligence ?? []) {
    if (i.kind === 'typography' && /capitals/.test(i.statement)) notes.push('headings in capitals');
    if (i.kind === 'geometry') notes.push(/square/.test(i.statement) ? 'square corners' : /generously/.test(i.statement) ? 'very rounded corners' : 'softly rounded corners');
  }
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();
  const title = (r.page.title || host).replace(/\s+/g, ' ').trim().slice(0, 160);
  const description = (r.page.description || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { url, host, title, ...(description ? { description } : {}), colours, ...(ground ? { ground } : {}), ...(ink ? { ink } : {}), ...(accent ? { accent } : {}), fonts, notes: [...new Set(notes)].slice(0, 6) };
}

/** A read, kept with the conversation as a reference. */
export function referenceOf(read: SiteRead, now = Date.now()): StudioReference {
  const url = linkUrl(read.url);
  let path = '';
  try {
    path = new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    /* the host alone */
  }
  return {
    id: `site:${read.host}${path}`.slice(0, 160),
    kind: 'site',
    url,
    host: read.host.slice(0, 120),
    title: read.title.slice(0, 160),
    ...(read.description ? { description: read.description.slice(0, 300) } : {}),
    colours: read.colours.filter((c) => HEX.test(c)).slice(0, 8),
    ...(read.ground ? { ground: read.ground } : {}),
    ...(read.ink ? { ink: read.ink } : {}),
    ...(read.accent ? { accent: read.accent } : {}),
    fonts: read.fonts.slice(0, 4),
    notes: read.notes.slice(0, 8),
    state: 'liked',
    at: now,
  };
}

/** The references the person wants learnt from. */
export const likedRefs = (st: Pick<StudioState, 'references'>): StudioReference[] => (st.references ?? []).filter((r) => r.state === 'liked');

const takes = (r: StudioReference, t: RefTake) => !r.take?.length || r.take.includes(t);

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

/** The palette a reference gives, when the person takes its colour (or the whole of it): its own ground, text and
 *  accent where it says them, else read from the colours it uses. */
export function referencePalette(refs: readonly StudioReference[]): { ground: string; ink: string; accent: string; accent2?: string } | null {
  const r = refs.find((x) => takes(x, 'colour') && (x.colours.length >= 3 || (x.ground && x.ink)));
  if (!r) return null;
  if (r.ground && r.ink && r.accent && r.accent !== r.ground && r.accent !== r.ink) return { ground: r.ground, ink: r.ink, accent: r.accent };
  return paletteOutOf(r.colours);
}

/** The typefaces a reference uses, when the person takes its type (or the whole of it). */
export function referenceFaces(refs: readonly StudioReference[]): string[] {
  const r = refs.find((x) => takes(x, 'type') && x.fonts.length);
  return r ? r.fonts.slice(0, 2) : [];
}

/** What the references say about the look, in words the engines read ("like linear.app: a dark ground, sans-serif
 *  headings, square corners"). */
export function referenceWords(refs: readonly StudioReference[]): string {
  return refs
    .filter((r) => takes(r, 'layout') || takes(r, 'mood'))
    .map((r) => `like ${r.host}${r.notes.length ? `: ${r.notes.slice(0, 4).join(', ')}` : ''}`)
    .join('; ')
    .slice(0, 400);
}

/** A reference's line, as the conversation says it. */
export function referenceSaid(r: StudioReference): string {
  const bits = [r.notes.slice(0, 3).join(', '), r.fonts.length ? `set in ${r.fonts.slice(0, 2).join(' and ')}` : ''].filter(Boolean);
  return `I looked at ${r.host}${bits.length ? `: ${bits.join(', ')}` : ''}. I’ll take ${r.take?.length ? `its ${r.take.map((t) => (t === 'colour' ? 'colours' : t)).join(' and ')}` : 'its colours, type and feel'} as a starting point — never the page itself. Say if you meant only part of it.`;
}

// ── the page, drawn as it is, without its scripts ──

const PREVIEW_HTML = 300_000;
const PREVIEW_CSS = 300_000;

/** Every relative url(...) in a stylesheet made absolute against the stylesheet's own address. */
function absoluteCss(text: string, base: string): string {
  return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q: string, u: string) => {
    if (/^(data:|https?:|#)/i.test(u.trim())) return m;
    try {
      return `url(${q}${new URL(u.trim(), base).href}${q})`;
    } catch {
      return m;
    }
  });
}

/**
 * A page and its stylesheets as one inert document: scripts, frames, objects, forms' targets, inline handlers,
 * javascript: links, refreshes and the page's own policy taken out; its stylesheets inlined (their addresses made
 * absolute); a policy that lets it load only pictures, styles and fonts over https. It is drawn in an iframe with an
 * empty sandbox (no scripts, no forms, no navigation, an opaque origin) — the frame is the wall, this is the second.
 */
export function previewDoc(html: string, css: readonly { url: string; text: string }[], base: string): string {
  const safeBase = linkUrl(base);
  let body = html
    .slice(0, PREVIEW_HTML * 3)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '')
    .replace(/<(iframe|frame|frameset|object|embed|applet|portal)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(iframe|frame|frameset|object|embed|applet|portal)\b[^>]*>/gi, '')
    .replace(/<(link|base|meta)\b[^>]*>/gi, (tag) => (/^<meta\b/i.test(tag) && /charset=/i.test(tag) && !/http-equiv/i.test(tag) ? tag : ''))
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, '$1="#"')
    // nothing in it submits anywhere
    .replace(/\s(action|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  if (body.length > PREVIEW_HTML) body = body.slice(0, PREVIEW_HTML);
  let styles = '';
  for (const sheet of css) {
    if (styles.length > PREVIEW_CSS) break;
    // the stylesheets the page names are already here: nothing they import is fetched
    styles += `\n${absoluteCss(sheet.text.replace(/@import\b[^;]*;?/gi, ''), sheet.url).replace(/<\/style/gi, '<\\/style')}`;
  }
  styles = styles.slice(0, PREVIEW_CSS);
  // nothing runs, connects or submits; only the site's own pictures and fonts are drawn, as the site shows them
  const policy = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; media-src https:; form-action 'none'";
  const head = `<meta http-equiv="Content-Security-Policy" content="${policy}">${safeBase ? `<base href="${safeBase.replace(/"/g, '&quot;')}">` : ''}<style>${styles}</style><style>html,body{overflow:hidden!important}</style>`;
  if (/<head\b[^>]*>/i.test(body)) return body.replace(/<head\b[^>]*>/i, (m) => `${m}${head}`);
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

/** A reference read, kept with the conversation and said in it (read again: the newer reading replaces the older). */
export function addReference(st: StudioState, ref: StudioReference, now = Date.now()): StudioState {
  const kept = (st.references ?? []).filter((r) => r.id !== ref.id);
  return said({ ...st, references: [...kept, ref].slice(-MAX_KEPT) }, { from: 'socria', kind: 'reference', stage: ref.id, text: referenceSaid(ref), at: now });
}
const MAX_KEPT = 12;
