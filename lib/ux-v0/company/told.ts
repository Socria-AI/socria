// lib/ux-v0/company/told.ts — the company as the designer is told of it, and its library as the work can use it.
//
// What is told is only what the person has confirmed. What is not confirmed is not said at all; what is known to be
// missing is said as missing, so the designer writes "no approved logo was supplied" rather than drawing one.
//
// THE LIBRARY IS REAL OR IT IS ABSENT. An item reaches a design only as itself: its own bytes, placed with
// src="asset:<id>". Each is told with what it is and how it may be used; a protected logo with the rule that it is
// never redrawn, recoloured, cropped or distorted; a picture of real people with the rule that they are never altered.
// Looking for something in the library in plain words (find) returns what is there, ranked — and when what was asked
// for is not there, says so (missingFor) instead of offering something that looks like it.

import { assetHref } from '../dsi/assets';
import type { CompanyTold } from '../design/prompts';
import type { DesignAsset } from '../design/doc';
import { WHAT_LABEL, type Company, type ItemWhat, type LibraryItem } from './schema';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const confirmed = (c: Company, kind: string) => c.facts.filter((f) => f.kind === kind && f.confirmed).map((f) => cut(f.text, 300));

/** Whether an item can be placed on a design as a picture. */
export const drawable = (i: LibraryItem) => !i.retired && i.asset.kind !== 'font' && !!assetHref(i.asset);

/** An approved logo that can be placed (not a low-resolution reference). */
export const approvedLogos = (c: Company) => c.library.filter((i) => drawable(i) && i.asset.approved && (i.what === 'logo' || i.what === 'mark') && !i.asset.lowRes);

/** What the work may need that the company does not have: said, so that nothing is invented in its place. */
export function knownMissing(c: Company): string[] {
  const out: string[] = [];
  const live = c.library.filter((i) => !i.retired);
  if (!approvedLogos(c).length) out.push(live.some((i) => i.what === 'logo' || i.what === 'mark') ? 'an approved logo (the library holds one, not yet approved: set the name as text where a logo goes)' : 'a logo (none supplied: set the name as text where a logo goes, never draw one)');
  if (!live.some((i) => i.what === 'photograph')) out.push('photographs (none supplied: use no pictures of people, places or events, and imply none)');
  for (const p of c.products) if (p.status !== 'retired' && !p.what) out.push(`what ${p.name} is (nothing supplied: name it only, describe nothing)`);
  return [...out, ...c.missing.map((m) => cut(m, 200))].slice(0, 12);
}

/** The company as the designer is told of it (lib/ux-v0/design/prompts.ts companyLines). */
export function companyTold(c: Company): CompanyTold {
  const name = new Map(c.products.map((p) => [p.id, p.name]));
  void name;
  return {
    name: c.name,
    about: [
      ...confirmed(c, 'mission').map((x) => `Mission: ${x}`),
      ...confirmed(c, 'positioning').map((x) => `Positioning: ${x}`),
      ...confirmed(c, 'philosophy').map((x) => `It believes: ${x}`),
      ...confirmed(c, 'preference').map((x) => `It tends to prefer (a leaning, not a rule): ${x}`),
    ].slice(0, 14),
    products: c.products.filter((p) => p.confirmed && p.status !== 'retired').map((p) => cut(`${p.name}${p.what ? ` — ${p.what}` : ''}${p.audience ? ` (for ${p.audience})` : ''}${p.status === 'planned' ? ' [planned, not released]' : ''}`, 260)),
    audiences: confirmed(c, 'audience').slice(0, 8),
    principles: confirmed(c, 'principle').slice(0, 12),
    avoid: confirmed(c, 'avoid').slice(0, 12),
    missing: knownMissing(c),
  };
}

/** An item's id on a design: stable for the same bytes, and never one a project's own picture could have. */
export const libraryAssetId = (i: LibraryItem) => `lib-${i.asset.hash.slice(0, 12)}`;

/** How an item may be used, said to the designer with it. */
export function itemNote(c: Company, i: LibraryItem): string {
  const product = i.product ? c.products.find((p) => p.id === i.product)?.name : null;
  const parts = [
    `${c.name}'s ${WHAT_LABEL[i.what].toLowerCase()}${i.asset.role && (i.what === 'logo' || i.what === 'mark') ? ` (${i.asset.role})` : ''}${product ? ` of ${product}` : ''}`,
    i.description && cut(i.description, 160),
    i.asset.protected ? 'APPROVED AND PROTECTED: place it exactly as it is — never redraw, trace, recolour, crop, stretch, tilt or put effects on it; give it clear space' : i.asset.approved ? 'approved' : 'NOT YET APPROVED: use it only if asked for by name',
    i.what === 'screenshot' && 'a real screenshot: show it as it is (scale and frame it; never redraw it, change what it shows or add to its interface)',
    i.people && 'shows real people: never alter them, never suggest they said or did anything',
    i.rights && `rights: ${cut(i.rights, 120)}`,
  ];
  return parts.filter(Boolean).join('; ');
}

// ── looking for something in plain words ──

const SYN: Record<string, ItemWhat[]> = {
  logo: ['logo', 'mark'], logos: ['logo', 'mark'], wordmark: ['logo'], logotype: ['logo'], lockup: ['logo'], mark: ['mark', 'logo'], symbol: ['mark'], emblem: ['mark', 'logo'], monogram: ['mark'],
  icon: ['icon'], icons: ['icon'], glyph: ['icon'],
  photo: ['photograph'], photos: ['photograph'], photograph: ['photograph'], photographs: ['photograph'], photography: ['photograph'], portrait: ['photograph'], headshot: ['photograph'], picture: ['photograph', 'illustration'], pictures: ['photograph', 'illustration'],
  screenshot: ['screenshot'], screenshots: ['screenshot'], screen: ['screenshot'], screens: ['screenshot'], interface: ['screenshot'], ui: ['screenshot'], product: ['screenshot'], app: ['screenshot'],
  illustration: ['illustration'], illustrations: ['illustration'], drawing: ['illustration'],
  pattern: ['pattern'], texture: ['pattern'], font: ['font'], fonts: ['font'], typeface: ['font'], document: ['document'], pdf: ['document'],
};
const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'our', 'my', 'with', 'and', 'or', 'in', 'on', 'to', 'use', 'using', 'show', 'find', 'get', 'me', 'us', 'we', 'that', 'this', 'from', 'please', 'approved', 'official', 'new', 'latest', 'one', 'some', 'any', 'all', 'is', 'are', 'it', 'its', 'at', 'as', 'by', 'be']);
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w));

export interface Found {
  item: LibraryItem;
  score: number;
}

/** The library searched in plain words ("the approved logo for dark grounds", "screenshots of Logos"): what is there, best first. */
export function findItems(c: Company, query: string, o: { includeRetired?: boolean } = {}): Found[] {
  const q = tokens(query);
  const wantApproved = /\b(approved|official|final|signed[- ]off)\b/i.test(query);
  // (a word that is one of the company's product names is the product, not a kind of file: Socria's "Logos")
  const productWords = new Set(c.products.flatMap((p) => tokens(p.name)));
  const whats = new Set(q.filter((w) => !productWords.has(w)).flatMap((w) => SYN[w] ?? []));
  const productByName = c.products.filter((p) => q.some((w) => tokens(p.name).includes(w)));
  const out: Found[] = [];
  for (const item of c.library) {
    if (item.retired && !o.includeRetired) continue;
    const hay = new Set([...tokens(item.asset.name), ...tokens(item.description), ...item.tags.flatMap(tokens), ...tokens(item.asset.role ?? ''), ...tokens(WHAT_LABEL[item.what])]);
    let score = 0;
    if (whats.has(item.what)) score += 4;
    for (const w of q) if (hay.has(w)) score += SYN[w] && !productWords.has(w) ? 1 : 2;
    if (productByName.some((p) => p.id === item.product)) score += 3;
    if (!q.length) score = 1;
    if (score <= 0) continue;
    if (whats.size && !whats.has(item.what) && score < 4) continue;
    if (wantApproved && !item.asset.approved) continue;
    if (item.asset.approved) score += 0.5;
    out.push({ item, score });
  }
  return out.sort((a, b) => b.score - a.score || b.item.asset.importedAt - a.item.asset.importedAt);
}

/**
 * What the words ask of the library that it does not hold — reported to the person and told to the designer, so the
 * work says what is missing instead of standing something in ("use our team photo" with no photographs supplied).
 */
export function missingFor(c: Company, words: string): string[] {
  const w = ` ${words.toLowerCase()} `;
  const out: string[] = [];
  const has = (...whats: ItemWhat[]) => c.library.some((i) => !i.retired && whats.includes(i.what) && drawable(i));
  if (/\b(our|the|company|official|approved|brand)\s+(logo|wordmark|logotype|lockup|mark)\b|\blogo\b/.test(w) && !approvedLogos(c).length) out.push(has('logo', 'mark') ? `${c.name}'s logo is in the library but not approved` : `no logo of ${c.name} is in the library`);
  if (/\b(photo|photos|photograph|photographs|photography|headshot|headshots|portrait|portraits)\b|\b(picture|pictures|image|images) of (the|our) (team|founder|founders|office|people|staff|customers?)\b/.test(w) && !has('photograph')) out.push('no photographs are in the library');
  if (/\b(screenshot|screenshots|screen ?grabs?|product shots?)\b|\b(real|actual) (product|interface|ui|screens?)\b/.test(w) && !has('screenshot')) out.push('no product screenshots are in the library');
  for (const p of c.products) {
    if (p.status === 'retired' || !new RegExp(`\\b${p.name.toLowerCase().replace(/[^a-z0-9 ]/g, '')}\\b`).test(w)) continue;
    if (/\b(screenshot|screenshots|screen|screens|interface|ui|demo|product shot)\b/.test(w) && !c.library.some((i) => !i.retired && i.what === 'screenshot' && i.product === p.id)) out.push(`no screenshots of ${p.name} are in the library`);
    if (!p.what) out.push(`nothing has been supplied about what ${p.name} is`);
  }
  return [...new Set(out)];
}

/**
 * The library's items a request may use, as pictures of the project: approved ones (and any the words ask for by
 * name), logos first, then what the words point at. Each carries how it may be used.
 */
export function libraryFor(c: Company, words: string, max = 14): (DesignAsset & { note: string })[] {
  const asked = new Map(findItems(c, words).map((f) => [f.item.asset.id, f.score]));
  const pool = c.library.filter((i) => drawable(i) && (i.asset.approved || (asked.get(i.asset.id) ?? 0) >= 4));
  // (the protected logo is always told, and first: it is the one thing that must never be cut from the list)
  const rank = (i: LibraryItem) => (i.asset.protected ? 1000 : 0) + (i.what === 'logo' || i.what === 'mark' ? 100 : 0) + (asked.get(i.asset.id) ?? 0) * 2 + (i.asset.approved ? 1 : 0);
  return pool
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, max)
    .map((i) => ({ id: libraryAssetId(i), name: cut(i.asset.name, 80), src: assetHref(i.asset)!, width: i.asset.width ?? 1000, height: i.asset.height ?? 1000, note: itemNote(c, i) }));
}

/** Every drawable item as a picture a design can resolve (a design made earlier may use one no longer offered). */
export function libraryPictures(c: Company): DesignAsset[] {
  return c.library.filter((i) => i.asset.kind !== 'font' && !!assetHref(i.asset)).map((i) => ({ id: libraryAssetId(i), name: i.asset.name, src: assetHref(i.asset)!, width: i.asset.width ?? 1000, height: i.asset.height ?? 1000 }));
}
