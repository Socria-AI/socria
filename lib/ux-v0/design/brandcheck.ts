// lib/ux-v0/design/brandcheck.ts — whether a design belongs to its brand, checked — and how firmly each thing holds.
//
// A brand is consistent through what it owns, not through repeating a layout: its colours, its typefaces, its logo.
// Those can be checked on any composition, however different. What is checked here is only that; nothing here judges
// a layout.
//
// NOT EVERYTHING A BRAND SAYS IS A RULE. Four things are kept apart:
//   a requirement  — the system states it as a hard rule ("these colours only"), or it protects a logo: a breach is
//                    a defect unless the person authorized it
//   a principle    — the system has a palette and faces and no hard rule about them: a departure is worth saying,
//                    and is the designer's and the person's call
//   a preference   — something only inferred or marked as information: never checked, never enforced
//   an exception   — what the person allowed for this project ("use the red, for this campaign"): never reported
//
// The logo is checked as drawn (the frame measures it): at its own proportions, uncropped, unfiltered, upright, and
// not smaller than the brand's stated minimum.

import { hexOf } from '../dsi/colour';
import { bindingRules } from '../dsi/intelligence';
import type { SystemContent } from '../dsi/schema';
import { resolveAll } from '../dsi/tokens';
import type { DesignArtboard } from './doc';
import { colourKept, coloursUsed, facesUsed } from './pins';

export type BrandLevel = 'requirement' | 'principle';

export interface BrandBasis {
  name: string;
  /** every colour the system holds */
  palette: string[];
  /** its typefaces, by name */
  faces: string[];
  colour: BrandLevel;
  face: BrandLevel;
  /** the smallest a logo may be drawn (px on its shorter side), when the brand says */
  logoMinPx: number | null;
}

/** What the person allowed beyond the brand, for this project. */
export interface Allowed {
  faces?: string[];
  colours?: string[];
}

export interface BrandFact {
  level: BrandLevel;
  about: 'colour' | 'face' | 'logo';
  /** the colour or face in question (to allow it, if the person chooses) */
  value: string;
  text: string;
}

/** What a design is held to, from a system's published content. */
export function brandBasis(name: string, c: SystemContent): BrandBasis {
  const palette = new Set<string>();
  const faces = new Set<string>();
  for (const mode of c.modes.length ? c.modes : ['light']) {
    for (const r of resolveAll(c, { mode }).values()) {
      if (!r.ok) continue;
      if (r.type === 'color') {
        const h = hexOf(r.value);
        if (h) palette.add(h.toLowerCase());
      } else if (r.type === 'fontFamily') {
        const first = (Array.isArray(r.value) ? String(r.value[0] ?? '') : String(r.value ?? '')).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
        if (first && !/^(serif|sans-serif|monospace|system-ui|inherit)$/i.test(first)) faces.add(first);
      }
    }
  }
  const { hard } = bindingRules(c);
  const min = [...hard, ...bindingRules(c).soft].map((i) => i.check).find((k): k is { kind: 'logo-min-size'; px: number } => k?.kind === 'logo-min-size');
  return {
    name,
    palette: [...palette],
    faces: [...faces],
    colour: hard.some((i) => i.check?.kind === 'palette-only') ? 'requirement' : 'principle',
    face: hard.some((i) => i.check?.kind === 'fonts-only') ? 'requirement' : 'principle',
    logoMinPx: min ? min.px : null,
  };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The colours and faces an artboard uses that are not the brand's, nor allowed (see the head of this file). */
export function brandFacts(a: Pick<DesignArtboard, 'html'>, tokens: string, basis: BrandBasis | null, allowed: Allowed | undefined): BrandFact[] {
  if (!basis) return [];
  const out: BrandFact[] = [];
  if (basis.faces.length) {
    const ok = [...basis.faces, ...(allowed?.faces ?? [])];
    for (const f of facesUsed(a, tokens)) {
      if (ok.some((x) => same(x, f))) continue;
      out.push({ level: basis.face, about: 'face', value: f, text: `set in ${f}, which is not one of ${basis.name}'s typefaces (${basis.faces.join(', ')})` });
    }
  }
  if (basis.palette.length) {
    const ok = [...basis.palette, ...(allowed?.colours ?? [])];
    const off = coloursUsed(a, tokens).filter((c) => !colourKept(c, ok));
    for (const c of off.slice(0, 5)) out.push({ level: basis.colour, about: 'colour', value: c, text: `uses ${c}, which is not one of ${basis.name}'s colours nor a tint or shade of one` });
  }
  return out;
}

/** A picture as the frame drew it (frame.ts measure). */
export interface ImageBox {
  id: string;
  nw: number;
  nh: number;
  w: number;
  h: number;
  fit: string;
  filter: string;
  opacity: number;
  blend: string;
  tilt: boolean;
  clip: string;
  /** a vector picture (it has no resolution to run out of) */
  vec?: boolean;
}

/** The asset each <img> element of an artboard places, by element id. */
export function placedAssets(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const id = /\bdata-sx="(e\d+)"/.exec(m[0])?.[1];
    const asset = /\bsrc="asset:([A-Za-z0-9_-]{1,40})"/.exec(m[0])?.[1];
    if (id && asset) out.set(id, asset);
  }
  return out;
}

/** What was done to a protected logo that a protected logo does not allow, as measured. Always a requirement. */
export function logoFacts(images: readonly ImageBox[], html: string, protectedIds: ReadonlySet<string>, basis: Pick<BrandBasis, 'logoMinPx'> | null): BrandFact[] {
  if (!protectedIds.size) return [];
  const placed = placedAssets(html);
  const out: BrandFact[] = [];
  for (const im of images) {
    const asset = placed.get(im.id);
    if (!asset || !protectedIds.has(asset) || !im.nw || !im.nh || !im.w || !im.h) continue;
    const said = (text: string) => out.push({ level: 'requirement', about: 'logo', value: im.id, text: `the protected logo (data-sx="${im.id}") ${text}` });
    const off = im.w / im.h / (im.nw / im.nh);
    const fit = (im.fit || 'fill').toLowerCase();
    if (Math.abs(off - 1) > 0.03) {
      if (fit === 'fill') said(`is drawn stretched: ${im.w}×${im.h} against its own ${im.nw}×${im.nh}; give it its own proportions`);
      else if (fit === 'cover') said(`is cropped by its box (${im.w}×${im.h}, object-fit: cover, against its own ${im.nw}×${im.nh}); show all of it`);
    }
    if (im.filter && im.filter !== 'none') said(`has a filter on it (${im.filter.slice(0, 40)}); a protected logo is shown as it is`);
    if (im.blend && im.blend !== 'normal') said(`is blended into what is behind it (${im.blend}); a protected logo is shown as it is`);
    if (Number.isFinite(im.opacity) && im.opacity < 0.98) said(`is drawn at ${Math.round(im.opacity * 100)}% opacity; a protected logo is shown as it is`);
    if (im.tilt) said('is tilted or skewed; a protected logo is shown upright');
    if (im.clip && im.clip !== 'none') said('is cut by a clip path; show all of it');
    if (basis?.logoMinPx && Math.min(im.w, im.h) < basis.logoMinPx) said(`is ${Math.min(im.w, im.h)} px on its shorter side, below the brand's minimum of ${basis.logoMinPx} px`);
  }
  return out;
}

/** A finding in words, for the designer and for a review: what it is, and how firmly it holds. */
export const brandSaid = (f: BrandFact): string => `${f.level === 'requirement' ? 'brand requirement, checked' : 'brand principle (a departure is a choice, not a defect), checked'}: ${f.text}`;
