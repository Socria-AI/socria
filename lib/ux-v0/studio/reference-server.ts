import 'server-only';
// lib/ux-v0/studio/reference-server.ts — reading a website the person points to, for reference.
//
// The same guarded reader as the design-system import (lib/ux-v0/dsi/site-server.ts): http or https only, public
// addresses only (checked before the request and again at connect time), redirects checked one by one, every answer
// size- and time-capped, only HTML and CSS taken, nothing run, no crawling — the page and the stylesheets it names.
// What comes back is the reading (./references.ts siteReadOf) and the page drawn inert (previewDoc); the page itself is
// not kept.

import { extractSite, type Fetcher, type Resolver } from '../dsi/site-server';
import { previewDoc, siteReadOf, type SiteRead } from './references';

export type ReferenceResult = { ok: true; read: SiteRead; preview: string } | { ok: false; error: string; status: number };

/** "linear.app" or "https://linear.app/method" → the address to read (https assumed when none is said). */
export function referenceAddress(input: unknown): string {
  if (typeof input !== 'string') return '';
  const t = input.trim().slice(0, 600);
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
}

export async function readSiteReference(input: unknown, deps: { fetcher?: Fetcher; resolver?: Resolver } = {}): Promise<ReferenceResult> {
  const url = referenceAddress(input);
  if (!url) return { ok: false, error: 'Give a website address.', status: 400 };
  const r = await extractSite(url, { ...deps, logos: false });
  if (!r.ok) return { ok: false, error: r.error, status: r.status };
  const read = siteReadOf(r.result, r.source.url);
  return { ok: true, read, preview: previewDoc(r.source.html, r.source.css, r.source.url) };
}
