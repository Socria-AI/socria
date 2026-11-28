// lib/ux-v0/company/schema.ts — a company: what it is, what it makes, what it owns — apart from any one project.
//
// A project is a piece of work; a company outlives it. What is permanent is kept here: what the company is (its
// mission, positioning and philosophy), who it is for, how it speaks, what it has turned down for good, its products,
// its library of real assets, and the design system that is its brand (a registry system, lib/ux-v0/dsi — its
// versions, approvals and publishing live there and are not repeated here).
//
// NOTHING IS INVENTED, AND NOTHING IS ASSUMED CONFIRMED. Every statement carries where it came from: said by the
// person, found in something they imported (and in what), or inferred. Only what the person has confirmed is told to
// the designer as fact (told.ts); the rest waits. What is known to be missing is written down too ("no photographs of
// the team"), so the designer says so rather than making something up.
//
// A PROJECT NEVER CHANGES THE COMPANY. A project belongs to a company (DesignProject.companyId) and is designed
// within it; what is decided in a project stays in the project (its memory) unless the person promotes it here, by
// their own act.
//
// The library reuses the brand-asset model (lib/ux-v0/dsi/schema.ts BrandAsset: checked bytes, sanitized SVG, hash,
// licence, approved, protected logos) and adds what a library needs to be searched and trusted: what a thing is, a
// description, tags, the product it shows, the rights to it, whether it shows real people.

import { normalizeAsset, type BrandAsset } from '../dsi/schema';

export const FACT_KINDS = ['mission', 'positioning', 'philosophy', 'audience', 'principle', 'preference', 'avoid'] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const FACT_LABEL: Record<FactKind, { title: string; hint: string }> = {
  mission: { title: 'Mission', hint: 'What the company is for.' },
  positioning: { title: 'Positioning', hint: 'What it is, for whom, and against what.' },
  philosophy: { title: 'Philosophy', hint: 'What it believes; the ideas the work should carry.' },
  audience: { title: 'Audiences', hint: 'Who it speaks to.' },
  principle: { title: 'How it communicates', hint: 'Voice, tone and the rules it holds to.' },
  preference: { title: 'Preferences', hint: 'What it tends to like. A leaning, not a rule.' },
  avoid: { title: 'Turned down, for good', hint: 'Characteristics the company has rejected.' },
};

export type FactSource = 'stated' | 'imported' | 'inferred';

export interface Fact {
  id: string;
  kind: FactKind;
  text: string;
  /** said by the person, found in something imported, or inferred from the work */
  source: FactSource;
  /** where: a file's name, an address, a project's name ('' when stated) */
  from: string;
  /** only confirmed statements are told to the designer as fact */
  confirmed: boolean;
  at: number;
}

export const PRODUCT_STATUSES = ['current', 'planned', 'retired'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface CompanyProduct {
  id: string;
  name: string;
  /** what it is, in a sentence — as the company says it, never guessed */
  what: string;
  audience: string;
  status: ProductStatus;
  /** its own design system, a child of the company's (lib/ux-v0/dsi) */
  systemId: string | null;
  confirmed: boolean;
  source: FactSource;
  from: string;
}

/** What a thing in the library is, more finely than its file kind. */
export const ITEM_WHATS = ['logo', 'mark', 'icon', 'photograph', 'screenshot', 'illustration', 'pattern', 'font', 'document', 'other'] as const;
export type ItemWhat = (typeof ITEM_WHATS)[number];
export const WHAT_LABEL: Record<ItemWhat, string> = { logo: 'Logo', mark: 'Mark', icon: 'Icon', photograph: 'Photograph', screenshot: 'Screenshot', illustration: 'Illustration', pattern: 'Pattern', font: 'Font', document: 'Document', other: 'Other' };

export interface LibraryItem {
  asset: BrandAsset;
  what: ItemWhat;
  description: string;
  tags: string[];
  /** the product it shows or belongs to (a product's id) */
  product: string | null;
  /** the rights to it, as the company knows them ("ours", "licensed from …, web only") */
  rights: string;
  /** it shows real, identifiable people: never altered in a way that changes who they are or what they did */
  people: boolean;
  /** kept for the record, no longer offered for new work */
  retired: boolean;
}

export interface Company {
  v: 1;
  id: string;
  name: string;
  facts: Fact[];
  products: CompanyProduct[];
  library: LibraryItem[];
  /** the registry design system that is the company's brand, or null */
  systemId: string | null;
  /** what is known not to be available ("photographs of the team", "Stratus: nothing supplied") */
  missing: string[];
  /** the owner's account id when signed in; null: kept in this browser */
  owner: string | null;
  createdAt: number;
  updatedAt: number;
}

export const COMPANY_ID = /^co_[A-Za-z0-9_-]{4,64}$/;
export const MAX_FACTS = 120;
export const MAX_PRODUCTS = 40;
export const MAX_LIBRARY = 300;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => ((all as readonly string[]).includes(String(v)) ? (v as T) : d);
export const newCompanyId = () => `co_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const uid = (p: string) => `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}`;
const idOk = (v: unknown, p: string) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : uid(p));
const SOURCES = ['stated', 'imported', 'inferred'] as const;

export function emptyCompany(name: string, now = Date.now()): Company {
  return { v: 1, id: newCompanyId(), name: name.trim().slice(0, 80) || 'Company', facts: [], products: [], library: [], systemId: null, missing: [], owner: null, createdAt: now, updatedAt: now };
}

function normalizeFact(v: unknown): Fact | null {
  const r = obj(v);
  const text = str(r.text, 600).trim();
  if (!text) return null;
  return { id: idOk(r.id, 'f'), kind: oneOf(r.kind, FACT_KINDS, 'philosophy'), text, source: oneOf(r.source, SOURCES, 'stated'), from: str(r.from, 160), confirmed: r.confirmed === true, at: num(r.at, 0) };
}

function normalizeProduct(v: unknown): CompanyProduct | null {
  const r = obj(v);
  const name = str(r.name, 80).trim();
  if (!name) return null;
  return { id: idOk(r.id, 'p'), name, what: str(r.what, 400).trim(), audience: str(r.audience, 240).trim(), status: oneOf(r.status, PRODUCT_STATUSES, 'current'), systemId: typeof r.systemId === 'string' && /^dsys_[\w-]{4,64}$/.test(r.systemId) ? r.systemId : null, confirmed: r.confirmed === true, source: oneOf(r.source, SOURCES, 'stated'), from: str(r.from, 160) };
}

export const whatOf = (a: BrandAsset): ItemWhat => (a.kind === 'logo' ? (a.role === 'mark' ? 'mark' : 'logo') : a.kind === 'icon' ? 'icon' : a.kind === 'font' ? 'font' : a.kind === 'pattern' ? 'pattern' : /screens?hot|screen[-_ ]|\bui\b|interface/i.test(a.name) ? 'screenshot' : /photo|portrait|team|office/i.test(a.name) ? 'photograph' : 'other');

function normalizeItem(v: unknown): LibraryItem | null {
  const r = obj(v);
  const asset = normalizeAsset(r.asset);
  if (!asset) return null;
  const tags = [...new Set((Array.isArray(r.tags) ? r.tags : []).filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 16);
  return { asset, what: oneOf(r.what, ITEM_WHATS, whatOf(asset)), description: str(r.description, 400).trim(), tags, product: typeof r.product === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.product) ? r.product : null, rights: str(r.rights, 300).trim(), people: r.people === true, retired: r.retired === true };
}

export function normalizeCompany(v: unknown): Company | null {
  const r = obj(v);
  if (!COMPANY_ID.test(String(r.id ?? ''))) return null;
  const seen = new Set<string>();
  const uniq = <T extends { id: string }>(list: (T | null)[]): T[] => list.filter((x): x is T => !!x && !seen.has(x.id) && !!seen.add(x.id));
  const products = uniq((Array.isArray(r.products) ? r.products : []).slice(0, MAX_PRODUCTS).map(normalizeProduct));
  const ids = new Set(products.map((p) => p.id));
  const library: LibraryItem[] = [];
  const hashes = new Set<string>();
  for (const x of (Array.isArray(r.library) ? r.library : []).slice(0, MAX_LIBRARY)) {
    const it = normalizeItem(x);
    if (!it || hashes.has(it.asset.hash)) continue;
    hashes.add(it.asset.hash);
    library.push(it.product && !ids.has(it.product) ? { ...it, product: null } : it);
  }
  return {
    v: 1,
    id: String(r.id),
    name: str(r.name, 80).trim() || 'Company',
    facts: uniq((Array.isArray(r.facts) ? r.facts : []).slice(0, MAX_FACTS).map(normalizeFact)),
    products,
    library,
    systemId: typeof r.systemId === 'string' && /^dsys_[\w-]{4,64}$/.test(r.systemId) ? r.systemId : null,
    missing: [...new Set((Array.isArray(r.missing) ? r.missing : []).filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 200)).filter(Boolean))].slice(0, 30),
    owner: typeof r.owner === 'string' ? r.owner.slice(0, 80) : null,
    createdAt: num(r.createdAt, 0),
    updatedAt: num(r.updatedAt, 0),
  };
}

// ── changes: each returns a new company (the person's own acts; nothing here is called by a project) ──

const touch = (c: Company, now = Date.now()): Company => ({ ...c, updatedAt: now });

/** A statement added. Said by the person: confirmed at once. Found or inferred: it waits to be confirmed. */
export function addFact(c: Company, f: { kind: FactKind; text: string; source?: FactSource; from?: string }, now = Date.now()): Company {
  const text = f.text.trim().slice(0, 600);
  if (!text || c.facts.length >= MAX_FACTS) return c;
  if (c.facts.some((x) => x.kind === f.kind && x.text.toLowerCase() === text.toLowerCase())) return c;
  const source = f.source ?? 'stated';
  return touch({ ...c, facts: [...c.facts, { id: uid('f'), kind: f.kind, text, source, from: (f.from ?? '').slice(0, 160), confirmed: source === 'stated', at: now }] }, now);
}

export const editFact = (c: Company, id: string, patch: Partial<Pick<Fact, 'text' | 'kind' | 'confirmed'>>, now = Date.now()): Company =>
  touch({ ...c, facts: c.facts.map((f) => (f.id === id ? { ...f, ...(patch.text !== undefined ? { text: patch.text.trim().slice(0, 600) || f.text } : {}), ...(patch.kind ? { kind: patch.kind } : {}), ...(patch.confirmed !== undefined ? { confirmed: patch.confirmed } : {}) } : f)) }, now);

export const removeFact = (c: Company, id: string, now = Date.now()): Company => touch({ ...c, facts: c.facts.filter((f) => f.id !== id) }, now);

export function putProduct(c: Company, p: Partial<CompanyProduct> & { name: string }, now = Date.now()): Company {
  const at = p.id ? c.products.findIndex((x) => x.id === p.id) : -1;
  if (at < 0 && c.products.length >= MAX_PRODUCTS) return c;
  const base: CompanyProduct = at >= 0 ? c.products[at] : { id: uid('p'), name: '', what: '', audience: '', status: 'current', systemId: null, confirmed: true, source: 'stated', from: '' };
  const next = normalizeProduct({ ...base, ...p });
  if (!next) return c;
  return touch({ ...c, products: at >= 0 ? c.products.map((x, i) => (i === at ? next : x)) : [...c.products, next] }, now);
}

export const removeProduct = (c: Company, id: string, now = Date.now()): Company => touch({ ...c, products: c.products.filter((p) => p.id !== id), library: c.library.map((i) => (i.product === id ? { ...i, product: null } : i)) }, now);

/** A file put in the library (as it was read by lib/ux-v0/dsi/assets.ts importAsset). The same bytes twice are one item. */
export function addItem(c: Company, asset: BrandAsset, meta: Partial<Omit<LibraryItem, 'asset'>> = {}, now = Date.now()): { company: Company; added: boolean; item: LibraryItem } {
  const had = c.library.find((i) => i.asset.hash === asset.hash);
  if (had) return { company: c, added: false, item: had };
  const item = normalizeItem({ asset, what: meta.what ?? whatOf(asset), description: meta.description ?? '', tags: meta.tags ?? [], product: meta.product ?? null, rights: meta.rights ?? '', people: meta.people ?? false, retired: false })!;
  if (c.library.length >= MAX_LIBRARY) return { company: c, added: false, item };
  return { company: touch({ ...c, library: [...c.library, item] }, now), added: true, item };
}

export function setItem(c: Company, assetId: string, patch: Partial<Omit<LibraryItem, 'asset'>> & { asset?: BrandAsset }, now = Date.now()): Company {
  return touch({ ...c, library: c.library.map((i) => (i.asset.id === assetId ? normalizeItem({ ...i, ...patch }) ?? i : i)) }, now);
}

export const removeItem = (c: Company, assetId: string, now = Date.now()): Company => touch({ ...c, library: c.library.filter((i) => i.asset.id !== assetId) }, now);

export const setMissing = (c: Company, missing: string[], now = Date.now()): Company => touch({ ...c, missing: [...new Set(missing.map((x) => x.trim().slice(0, 200)).filter(Boolean))].slice(0, 30) }, now);
