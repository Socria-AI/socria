// lib/ux-v0/design/brand.ts — a design system as the designer receives it: CSS tokens and rules in plain words.
//
// A project linked to a registry system (lib/ux-v0/dsi) is designed in it. Its tokens become the design's shared
// stylesheet (custom properties every artboard can use, exported exactly as the system exports CSS), and what the
// system knows about the brand — its description, confirmed and approved guidance, locked tokens — becomes rules the
// designer is told on every request. Hard rules are said as rules; preferences as preferences.

import { assetHref } from '../dsi/assets';
import { contentForLink, designCss } from '../dsi/link';
import type { DesignAsset } from './doc';
import { brandBasis, type BrandBasis } from './brandcheck';
import type { SystemRecord } from '../dsi/registry';
import type { SystemLink } from '../dsi/link-schema';

export interface BrandForDesign {
  name: string;
  css: string;
  rules: string[];
  /** the system's approved pictures a design can place as they are (its logos first), each with how it may be used */
  pictures: (DesignAsset & { note: string })[];
  /** what a design is checked against: its colours and faces, and how firmly each holds (brandcheck.ts) */
  basis: BrandBasis;
  /** the pictures among them that are protected logos (their ids on a design) */
  protected: string[];
}

/** The linked system's version as tokens, rules and pictures, or null when it has nothing published. */
export function brandForDesign(rec: SystemRecord, link: SystemLink | undefined): BrandForDesign | null {
  const c = contentForLink(rec, link?.pin ?? 'latest');
  if (!c) return null;
  const content = c.content;
  const css = designCss(content);
  const rules: string[] = [];
  if (content.identity.description) rules.push(`About the brand: ${content.identity.description.slice(0, 400)}`);
  if (content.identity.audience) rules.push(`Its audience: ${content.identity.audience.slice(0, 200)}`);
  for (const i of content.intelligence) {
    if (i.status === 'inferred' && i.enforce === 'none') continue;
    rules.push(`${i.enforce === 'hard' ? 'Rule' : 'Preference'}: ${i.statement.slice(0, 280)}`);
    if (rules.length >= 24) break;
  }
  if (content.governance.locked.length) rules.push(`Use these tokens as they are, never another value: ${content.governance.locked.slice(0, 20).join(', ')} (as CSS custom properties in the shared styles).`);
  // the system's approved pictures, placed as themselves (a file that is the same bytes as one in the company's
  // library has the same id there: lib/ux-v0/company/told.ts libraryAssetId)
  const pictures = content.assets
    .filter((a) => a.approved && a.kind !== 'font' && !a.lowRes && !!assetHref(a))
    .sort((a, b) => Number(b.kind === 'logo') - Number(a.kind === 'logo'))
    .slice(0, 8)
    .map((a) => ({
      id: `lib-${a.hash.slice(0, 12)}`,
      name: a.name.slice(0, 80),
      src: assetHref(a)!,
      width: a.width ?? 1000,
      height: a.height ?? 1000,
      note: `${rec.name}'s ${a.kind}${a.role ? ` (${a.role})` : ''}; ${a.protected ? 'APPROVED AND PROTECTED: place it exactly as it is — never redraw, trace, recolour, crop, stretch, tilt or put effects on it; give it clear space' : 'approved'}`,
    }));
  const logos = content.assets.filter((a) => a.kind === 'logo');
  if (pictures.some((p) => /'s logo/.test(p.note))) rules.push('The brand has an approved logo, given with the pictures: where a logo goes, place that picture exactly as it is. Never redraw or imitate it, and never set the name in type as a stand-in for it.');
  else if (logos.length) rules.push(`The brand has a logo (${logos.map((l) => l.name).slice(0, 3).join(', ')}) that cannot be placed here: set the brand's name as text where the logo goes, never redraw or imitate the logo.`);
  rules.push('Use the shared custom properties for colour and type rather than other values, unless the person asks for something the system does not have.');
  return { name: rec.name, css, rules, pictures, basis: brandBasis(rec.name, content), protected: pictures.filter((p) => /APPROVED AND PROTECTED/.test(p.note)).map((p) => p.id) };
}
