// lib/ux-v0/dsi/site.ts — a website's design system, reconstructed from its HTML and CSS: a reading, never an
// authoritative import.
//
// What a site states in its stylesheets (CSS custom properties) is read as tokens; what it only does (the colours,
// faces, sizes, radii and spacing its rules use, weighted by where they are used: the body, headings, links and
// buttons count most) is read as observed values. Every token from a site is marked inferred, with the site and the
// selector it came from, because a page shows what a design system produced, not the system itself. Nothing on the
// page is run: the HTML is read as text, scripts are ignored, and only the stylesheets and logo candidates the page
// names are fetched (by ./site-server.ts, behind its address checks).

import { parseColour, hexOf } from './colour';
import { parseCss, type CssRule } from './css-parse';
import { importCss } from './import-css';
import { finish, type ImportIssue, type ImportResult } from './import-json';
import { emptyContent, type IntelItem, type SourceRef, type SystemContent, type Token } from './schema';
import { px } from './tokens';

export interface PageRefs {
  title: string;
  description: string;
  themeColor?: string;
  stylesheets: string[];
  inlineStyles: string[];
  icons: string[];
  logos: { src: string; alt: string }[];
  inlineSvgLogos: string[];
  generator?: string;
}

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : '';
};
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** What a page links to and holds, read from its HTML as text (scripts and their contents ignored). */
export function readPage(html: string, base: string): PageRefs {
  const src = html.slice(0, 2_000_000).replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const abs = (u: string) => {
    try {
      const url = new URL(decode(u), base);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  };
  const tags = (name: string) => src.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? [];
  const refs: PageRefs = { title: decode((src.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 120), description: '', stylesheets: [], inlineStyles: [], icons: [], logos: [], inlineSvgLogos: [] };
  for (const t of tags('meta')) {
    const n = (attr(t, 'name') || attr(t, 'property')).toLowerCase();
    const c = decode(attr(t, 'content'));
    if (n === 'description' || n === 'og:description') refs.description ||= c.slice(0, 300);
    if (n === 'theme-color' && parseColour(c)) refs.themeColor = c;
    if (n === 'generator') refs.generator = c.slice(0, 80);
  }
  for (const t of tags('link')) {
    const rel = attr(t, 'rel').toLowerCase();
    const href = abs(attr(t, 'href'));
    if (!href) continue;
    if (/\bstylesheet\b/.test(rel) && !/\balternate\b/.test(rel) && refs.stylesheets.length < 12) refs.stylesheets.push(href);
    if (/\b(icon|apple-touch-icon|mask-icon)\b/.test(rel) && refs.icons.length < 4) refs.icons.push(href);
  }
  for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) if (refs.inlineStyles.length < 20) refs.inlineStyles.push(m[1].slice(0, 400_000));
  for (const t of tags('img')) {
    const s = abs(attr(t, 'src'));
    const hint = `${attr(t, 'alt')} ${attr(t, 'class')} ${attr(t, 'id')} ${attr(t, 'src')}`;
    if (s && /logo|brand|wordmark/i.test(hint) && refs.logos.length < 4) refs.logos.push({ src: s, alt: decode(attr(t, 'alt')).slice(0, 120) });
  }
  // an inline <svg> that says it is the logo (by its class, id, title or label, or a header link around it)
  for (const m of src.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi)) {
    const open = m[0].match(/^<svg\b[^>]*>/i)?.[0] ?? '';
    const before = src.slice(Math.max(0, (m.index ?? 0) - 300), m.index ?? 0);
    const hint = `${attr(open, 'class')} ${attr(open, 'id')} ${attr(open, 'aria-label')} ${m[0].match(/<title[^>]*>([^<]*)</i)?.[1] ?? ''}`;
    if ((/logo|brand|wordmark/i.test(hint) || /<a[^>]*(class|aria-label|id)=["'][^"']*(logo|brand|home)[^"']*["'][^>]*>\s*$/i.test(before)) && m[0].length < 300_000 && refs.inlineSvgLogos.length < 3) refs.inlineSvgLogos.push(m[0]);
  }
  return refs;
}

// ── what the CSS does ──

const WEIGHT_OF = (sel: string): number => {
  const s = sel.toLowerCase();
  if (/^(html|body|:root)$/.test(s)) return 6;
  if (/^h[1-3]\b|\bh[1-3]$|heading|headline|title|display/.test(s)) return 4;
  if (/\bbutton\b|\.btn|\[type=.?submit|\.button|\bcta\b/.test(s)) return 4;
  if (/^a\b|\ba:|\ba$|\blink\b/.test(s)) return 3;
  if (/nav|header|footer|card|hero/.test(s)) return 2;
  return 1;
};

interface Tally {
  value: string;
  score: number;
  where: Set<string>;
  firstSel: string;
}

const tally = (m: Map<string, Tally>, value: string, score: number, sel: string) => {
  const t = m.get(value) ?? { value, score: 0, where: new Set<string>(), firstSel: sel };
  t.score += score;
  t.where.add(sel.slice(0, 60));
  m.set(value, t);
};

export interface Observed {
  colours: Tally[];
  backgrounds: Map<string, string>;
  fonts: Tally[];
  headingFont?: string;
  bodyFont?: string;
  sizes: Tally[];
  radii: Tally[];
  spacing: Tally[];
  shadows: Tally[];
  headingCase?: 'upper' | 'lower';
  bodyColor?: string;
  bodyBackground?: string;
  linkColor?: string;
  buttonBackground?: string;
}

const firstFamily = (v: string) => v.split(',')[0].replace(/["']/g, '').trim();
const GENERIC = /^(inherit|initial|unset|revert|sans-serif|serif|monospace|system-ui|cursive|fantasy|-apple-system|blinkmacsystemfont|ui-sans-serif|ui-serif|ui-monospace|var\(.*)$/i;

/** Values a stylesheet's rules use, weighted by where (see the head of this file). */
export function observe(rules: readonly CssRule[], vars: ReadonlyMap<string, string>): Observed {
  const colours = new Map<string, Tally>();
  const fonts = new Map<string, Tally>();
  const sizes = new Map<string, Tally>();
  const radii = new Map<string, Tally>();
  const spacing = new Map<string, Tally>();
  const shadows = new Map<string, Tally>();
  const backgrounds = new Map<string, string>();
  const o: Observed = { colours: [], backgrounds, fonts: [], sizes: [], radii: [], spacing: [], shadows: [] };
  const resolve = (v: string, n = 0): string => (n > 6 ? v : v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_m, name: string, fb?: string) => resolve(vars.get(name) ?? fb ?? '', n + 1)));
  for (const r of rules) {
    if (r.context.some((c) => /print/i.test(c))) continue;
    for (const sel of r.selectors.slice(0, 12)) {
      const w = WEIGHT_OF(sel.trim());
      for (const d of r.decls) {
        if (d.prop.startsWith('--')) continue;
        const v = resolve(d.value);
        if (/^(color|background|background-color|border-color|border|fill|stroke|outline-color|border-bottom|border-top)$/.test(d.prop)) {
          for (const m of v.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/gi) ?? []) {
            const c = parseColour(m);
            if (!c || c.a < 0.6) continue;
            const hex = hexOf(m)!;
            tally(colours, hex, w, sel);
            if (/^(html|body|:root)$/i.test(sel.trim())) {
              if (d.prop === 'color') o.bodyColor ??= hex;
              if (/^background/.test(d.prop)) o.bodyBackground ??= hex;
            }
            if (/^a\b|^a:link/i.test(sel.trim()) && d.prop === 'color') o.linkColor ??= hex;
            if (WEIGHT_OF(sel.trim()) === 4 && /button|btn|cta|submit/i.test(sel) && /^background/.test(d.prop)) o.buttonBackground ??= hex;
            if (/^background/.test(d.prop)) backgrounds.set(sel.slice(0, 60), hex);
          }
        } else if (d.prop === 'font-family' || d.prop === 'font') {
          const fam = firstFamily(d.prop === 'font' ? v.replace(/^.*?\d[\w.%]*(\/[\w.%]+)?\s+/, '') : v);
          if (!fam || GENERIC.test(fam) || fam.length > 60) continue;
          tally(fonts, fam, w, sel);
          if (/^h[1-3]\b|heading|headline|display|title/i.test(sel.trim())) o.headingFont ??= fam;
          if (/^(html|body|:root)$/i.test(sel.trim())) o.bodyFont ??= fam;
        } else if (d.prop === 'font-size') {
          const p = px(v.trim());
          if (p && p >= 10 && p <= 160) tally(sizes, `${p}px`, w, sel);
        } else if (/^border(-top|-bottom)?(-left|-right)?-radius$|^border-radius$/.test(d.prop)) {
          const p = px(v.trim().split(/\s+/)[0]);
          if (p !== null && p < 999) tally(radii, `${p}px`, w, sel);
        } else if (/^(padding|margin|gap|row-gap|column-gap)(-(top|bottom|left|right|inline|block))?$/.test(d.prop)) {
          for (const part of v.trim().split(/\s+/).slice(0, 4)) {
            const p = px(part);
            if (p && p > 0 && p <= 160) tally(spacing, `${p}px`, w, sel);
          }
        } else if (d.prop === 'box-shadow' && v !== 'none' && /\d/.test(v)) tally(shadows, v.slice(0, 160), w, sel);
        else if (d.prop === 'text-transform' && /^h[1-3]\b|heading|headline|title/i.test(sel.trim()) && /uppercase|lowercase/.test(v)) o.headingCase = v.includes('upper') ? 'upper' : 'lower';
      }
    }
  }
  const top = (m: Map<string, Tally>, n: number) => [...m.values()].sort((a, b) => b.score - a.score).slice(0, n);
  o.colours = top(colours, 12);
  o.fonts = top(fonts, 4);
  o.sizes = top(sizes, 10).sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
  o.radii = top(radii, 5).sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
  o.spacing = top(spacing, 10).sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
  o.shadows = top(shadows, 3);
  return o;
}

/**
 * A site's reconstruction as a system's content: its CSS variables (when it has any) and its observed values, all
 * inferred, each with the site and the selector it came from.
 */
export function reconstructSite(input: { url: string; html: string; css: { url: string; text: string }[] }, opts: { now?: number } = {}): ImportResult & { page: PageRefs } {
  const now = opts.now ?? Date.now();
  const issues: ImportIssue[] = [];
  const notes = new Set<string>();
  const page = readPage(input.html, input.url);
  const host = (() => {
    try {
      return new URL(input.url).hostname;
    } catch {
      return input.url;
    }
  })();
  const sheets = [...input.css.map((c) => ({ name: c.url, text: c.text })), ...page.inlineStyles.map((t, i) => ({ name: `${input.url}#style-${i + 1}`, text: t }))];
  const content: SystemContent = emptyContent(page.title.split(/[|–—:-]/)[0].trim().slice(0, 60) || host);
  content.identity.website = input.url;
  content.identity.description = page.description;
  const src = (property: string, selector?: string, file?: string): SourceRef => ({ kind: 'website', ref: input.url, ...(file ? { file } : {}), property, ...(selector ? { selector } : {}) });
  // 1. what the site states: its custom properties
  let declared = 0;
  if (sheets.length) {
    const vars = importCss(sheets, { now, ref: input.url });
    for (const t of Object.values(vars.content.tokens)) {
      declared++;
      content.tokens[t.path] = { ...t, provenance: { ...t.provenance, source: { ...t.provenance.source, kind: 'website', ref: input.url }, status: 'inferred', confidence: Math.min(0.8, t.provenance.confidence), note: `declared by the site as ${t.provenance.source.property}; read from its CSS — a reconstruction, not the site’s design system` } };
    }
    content.modes = vars.content.modes;
    if (declared) notes.add(`${declared} CSS custom properties declared by the site were read as tokens (inferred: the site shows them, it does not publish them as a design system).`);
  }
  // 2. what it does: observed values, weighted by where they are used
  const allRules: CssRule[] = [];
  const varMap = new Map<string, string>();
  for (const s of sheets) {
    const sheet = parseCss(s.text);
    allRules.push(...sheet.rules);
    for (const r of sheet.rules) if (r.selectors.some((x) => /^(:root|html|body)$/i.test(x.trim()))) for (const d of r.decls) if (d.prop.startsWith('--')) varMap.set(d.prop, d.value);
  }
  const ob = observe(allRules, varMap);
  const put = (path: string, t: Omit<Token, 'path' | 'provenance'>, conf: number, property: string, selector: string) => {
    if (content.tokens[path]) return;
    content.tokens[path] = { path, ...t, provenance: { source: src(property, selector), importedAt: now, original: t.value, status: 'inferred', confidence: Math.round(conf * 100) / 100, note: `observed in the site’s CSS (${selector}) — a reconstruction` } };
  };
  const maxScore = Math.max(1, ...ob.colours.map((c) => c.score));
  if (ob.bodyBackground) put('color.site.background', { type: 'color', value: ob.bodyBackground }, 0.7, 'background', 'body');
  if (ob.bodyColor) put('color.site.text', { type: 'color', value: ob.bodyColor }, 0.7, 'color', 'body');
  const accent = ob.buttonBackground ?? ob.linkColor ?? (page.themeColor ? hexOf(page.themeColor) : null);
  if (accent) put('color.site.accent', { type: 'color', value: accent }, ob.buttonBackground ? 0.65 : 0.5, ob.buttonBackground ? 'background' : 'color', ob.buttonBackground ? 'button' : ob.linkColor ? 'a' : 'meta theme-color');
  ob.colours.forEach((c, i) => {
    if ([ob.bodyBackground, ob.bodyColor, accent].includes(c.value)) return;
    put(`color.site.palette-${i + 1}`, { type: 'color', value: c.value, description: `used in ${[...c.where].slice(0, 3).join(', ')}` }, 0.3 + 0.4 * (c.score / maxScore), 'colour', c.firstSel);
  });
  if (ob.headingFont) put('font.family.display', { type: 'fontFamily', value: ob.headingFont }, 0.65, 'font-family', 'h1–h3');
  if (ob.bodyFont) put('font.family.body', { type: 'fontFamily', value: ob.bodyFont }, 0.65, 'font-family', 'body');
  if (!ob.headingFont && !ob.bodyFont && ob.fonts[0]) put('font.family.body', { type: 'fontFamily', value: ob.fonts[0].value }, 0.45, 'font-family', ob.fonts[0].firstSel);
  ob.sizes.forEach((s, i) => put(`font.size.site-${i + 1}`, { type: 'dimension', value: s.value }, 0.4, 'font-size', s.firstSel));
  ob.radii.forEach((s, i) => put(`radius.site-${i + 1}`, { type: 'dimension', value: s.value }, 0.45, 'border-radius', s.firstSel));
  ob.spacing.forEach((s, i) => put(`space.site-${i + 1}`, { type: 'dimension', value: s.value }, 0.35, 'spacing', s.firstSel));
  ob.shadows.forEach((s, i) => put(`shadow.site-${i + 1}`, { type: 'shadow', value: s.value }, 0.4, 'box-shadow', s.firstSel));
  const items: IntelItem[] = [];
  if (ob.headingCase) items.push({ id: `si-case`, kind: 'typography', statement: `Headings are set in ${ob.headingCase === 'upper' ? 'capitals' : 'lower case'} on the site`, status: 'inferred', basis: 'inferred', evidence: [{ source: src('text-transform', 'h1–h3'), quote: `text-transform: ${ob.headingCase}case` }], confidence: 0.6, enforce: 'none' });
  if (ob.radii.length) {
    const r = parseFloat(ob.radii[Math.floor(ob.radii.length / 2)].value);
    items.push({ id: 'si-shape', kind: 'geometry', statement: r < 2 ? 'Corners are square on the site' : r <= 10 ? 'Corners are softly rounded on the site' : 'Corners are generously rounded on the site', status: 'inferred', basis: 'inferred', evidence: [{ source: src('border-radius', ob.radii[0].firstSel), quote: ob.radii.map((x) => x.value).join(', ') }], confidence: 0.5, enforce: 'none' });
  }
  content.intelligence = items;
  if (!sheets.length) issues.push({ severity: 'warning', message: 'The page names no stylesheets SocriaUX could read; only what its HTML says was used.' });
  notes.add(`Reconstructed from ${host}: ${Object.keys(content.tokens).length} tokens, every one marked inferred. A website shows what a design system made; this is a reading of it, not the system itself.`);
  if (page.generator) notes.add(`The page says it was made with ${page.generator}.`);
  const r = finish(content, 'website', issues, notes, now);
  // nothing from a site is confirmed: roles too stay inferred
  for (const b of Object.values(r.content.roles)) if (b) b.status = 'inferred';
  return { ...r, page };
}
