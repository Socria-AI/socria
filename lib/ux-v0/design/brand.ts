// lib/ux-v0/design/brand.ts — a design system as the designer receives it: CSS tokens and rules in plain words.
//
// A project linked to a registry system (lib/ux-v0/dsi) is designed in it. Its tokens become the design's shared
// stylesheet (custom properties every artboard can use, exported exactly as the system exports CSS), and what the
// system knows about the brand — its description, confirmed and approved guidance, locked tokens — becomes rules the
// designer is told on every request. Hard rules are said as rules; preferences as preferences.

import { contentForLink, designCss } from '../dsi/link';
import type { SystemRecord } from '../dsi/registry';
import type { SystemLink } from '../dsi/link-schema';

export interface BrandForDesign {
  name: string;
  css: string;
  rules: string[];
}

/** The linked system's version as tokens and rules, or null when it has nothing published. */
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
  const logos = content.assets.filter((a) => a.kind === 'logo');
  if (logos.length) rules.push(`The brand has an approved logo (${logos.map((l) => l.name).slice(0, 3).join(', ')}): set the brand's name as text where the logo goes, never redraw or imitate the logo.`);
  rules.push('Use the shared custom properties for colour and type rather than other values, unless the person asks for something the system does not have.');
  return { name: rec.name, css, rules };
}
