// lib/ux-v0/design/identity.ts — the identity a design carries, read from its artboards: colours, faces, a logo.
//
// An identity explored as real work (a logo sheet, a poster, a page) becomes a brand only by being drawn out of the
// work the person approved and published as a design system (lib/ux-v0/dsi/project-extract.ts → a draft → an explicit
// publish). This reads what is there, exactly: the ground and the ink the artboards are set on, the colour that
// carries the accent, the rest of the palette, the face the largest words are set in and the face of the running
// text, and — from an artboard that is a logo — the drawing itself. Nothing is inferred beyond what the styles say.

import { parseColour } from '../dsi/colour';
import type { DesignArtboard } from './doc';
import { scopeCss } from './frame';
import { coloursUsed, effectiveCss, facesUsed } from './pins';

export interface IdentityRead {
  background: string | null;
  text: string | null;
  accent: string | null;
  /** every other colour the artboards use, most used first */
  palette: string[];
  display: string | null;
  body: string | null;
  /** faces used beyond those two */
  faces: string[];
  /** a logo's drawing (inline SVG), from an artboard that is a logo sheet */
  logo: { svg: string; from: string } | null;
  /** the shared custom properties that hold colours, by name */
  named: { name: string; hex: string }[];
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0');
const toHex = (v: string): string | null => {
  const c = parseColour(v.trim());
  return c && c.a > 0.5 ? `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}` : null;
};
const chroma = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return Math.max(r, g, b) - Math.min(r, g, b);
};
const dist = (a: string, b: string) => Math.hypot(...[1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)));

/** Custom properties of a stylesheet, resolved through each other. */
function varsOf(css: string): Map<string, string> {
  const raw = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) raw.set(m[1], m[2].trim());
  const resolve = (v: string, depth = 0): string => (depth > 6 ? v : v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_m, k: string, fb?: string) => resolve(raw.get(k) ?? fb ?? '', depth + 1)));
  return new Map([...raw].map(([k, v]) => [k, resolve(v)]));
}

/** A declaration's value on the root of an artboard (its own styles first, then the shared ones). */
function rootDecl(a: Pick<DesignArtboard, 'html'>, tokens: string, prop: RegExp): string | null {
  const own = [...a.html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const vars = varsOf(`${tokens}\n${own}`);
  for (const css of [own, tokens]) {
    const scoped = scopeCss(css);
    for (const m of scoped.matchAll(/(^|[},\s])\.sx-root\s*(?:,[^{]*)?\{([^}]*)\}/g)) {
      for (const d of m[2].split(';')) {
        const i = d.indexOf(':');
        if (i < 0 || !prop.test(d.slice(0, i).trim())) continue;
        const v = d.slice(i + 1).trim().replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_x, k: string, fb?: string) => vars.get(k) ?? fb ?? '');
        if (v) return v;
      }
    }
  }
  return null;
}

/** The face of the rule with the largest font-size that names one. */
function displayFace(a: Pick<DesignArtboard, 'html'>, tokens: string): string | null {
  const css = effectiveCss(a, tokens);
  const vars = varsOf(css);
  let best: { size: number; face: string } | null = null;
  for (const m of css.matchAll(/\{([^{}]*)\}/g)) {
    const body = m[1].replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_x, k: string, fb?: string) => vars.get(k) ?? fb ?? '');
    const size = /font-size\s*:\s*([\d.]+)px/.exec(body) ?? /font\s*:[^;]*?([\d.]+)px/.exec(body);
    const fam = /font-family\s*:\s*([^;]+)/.exec(body) ?? /font\s*:[^;]*?[\d.]+px(?:\/[\d.]+\w*)?\s+([^;]+)/.exec(body);
    if (!size || !fam) continue;
    const face = fam[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (!face || /^(serif|sans-serif|monospace|inherit|system-ui)$/i.test(face)) continue;
    if (!best || Number(size[1]) > best.size) best = { size: Number(size[1]), face };
  }
  return best?.face ?? null;
}

/** The identity the artboards carry (see the head of this file). */
export function identityOf(artboards: readonly DesignArtboard[], tokens: string): IdentityRead {
  const count = new Map<string, number>();
  const faces = new Map<string, number>();
  let background: string | null = null;
  let text: string | null = null;
  let display: string | null = null;
  let body: string | null = null;
  let logo: IdentityRead['logo'] = null;
  for (const a of artboards) {
    const css = effectiveCss(a, tokens).toLowerCase();
    for (const c of coloursUsed(a, tokens)) count.set(c, (count.get(c) ?? 0) + Math.max(1, css.split(c).length - 1));
    for (const f of facesUsed(a, tokens)) faces.set(f, (faces.get(f) ?? 0) + 1);
    background ??= ((v) => (v ? toHex(v.split(/\s+(?=url|linear|radial)/)[0]) : null))(rootDecl(a, tokens, /^background(-color)?$/));
    text ??= ((v) => (v ? toHex(v) : null))(rootDecl(a, tokens, /^color$/));
    display ??= displayFace(a, tokens);
    body ??= ((v) => (v ? v.split(',')[0].trim().replace(/^['"]|['"]$/g, '') : null))(rootDecl(a, tokens, /^font-family$/));
    if (!logo && (a.format === 'logo-sheet' || a.format === 'logo-square' || /\blogo|wordmark|mark\b/i.test(a.name))) {
      const m = /<svg\b[\s\S]*?<\/svg>/i.exec(a.html);
      if (m && m[0].length < 200_000) logo = { svg: m[0].replace(/\sdata-sx="e\d+"/g, ''), from: a.name };
    }
  }
  const used = [...count.entries()].sort((x, y) => y[1] - x[1]).map(([c]) => c);
  const far = (c: string) => (!background || dist(c, background) > 40) && (!text || dist(c, text) > 40);
  const accent = used.find((c) => chroma(c) >= 0.18 && far(c)) ?? null;
  const allFaces = [...faces.entries()].sort((x, y) => y[1] - x[1]).map(([f]) => f);
  if (body && /^(serif|sans-serif|monospace|inherit|system-ui)$/i.test(body)) body = null;
  display ??= allFaces[0] ?? null;
  body ??= allFaces.find((f) => f !== display) ?? display;
  const named: IdentityRead['named'] = [];
  for (const [k, v] of varsOf(tokens)) {
    const h = toHex(v);
    if (h) named.push({ name: k.replace(/^--/, ''), hex: h });
  }
  return {
    background,
    text,
    accent,
    palette: used.filter((c) => c !== background && c !== text && c !== accent).slice(0, 10),
    display,
    body,
    faces: allFaces.filter((f) => f !== display && f !== body).slice(0, 4),
    logo,
    named: named.slice(0, 24),
  };
}
