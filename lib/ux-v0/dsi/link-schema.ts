// lib/ux-v0/dsi/link-schema.ts — how a project refers to a registry design system: by id, following its latest
// published version or pinned to one, with the overrides the project made (only where the system allows them) and
// the values each product slot was given when the system was last applied (so a slot the designer changed since is
// recognised as their override and never overwritten). Kept apart from ./link.ts so the project types can import it
// without pulling in the products.

import { normalizePath, plainValue, type TokenValue } from './schema';

export interface SystemLink {
  id: string;
  name: string;
  /** 'latest': follows each published version; a number: pinned to that version */
  pin: number | 'latest';
  /** the version currently applied */
  version: number;
  /** the mode the project uses (the system's default when absent) */
  mode?: string;
  /** project-level overrides, by token path (only paths the system allows a project to override) */
  overrides: Record<string, TokenValue>;
  /** each product slot's value as last applied ("colors.accent" → "#d9632b") */
  applied: Record<string, string | number>;
  at: number;
}

export function normalizeSystemLink(v: unknown): SystemLink | undefined {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : null;
  if (!r || typeof r.id !== 'string' || !/^dsys_[\w-]{4,64}$/.test(r.id)) return undefined;
  const overrides: Record<string, TokenValue> = {};
  for (const [k, val] of Object.entries(r.overrides && typeof r.overrides === 'object' ? r.overrides : {}).slice(0, 200)) {
    const p = normalizePath(k);
    const pv = plainValue(val, 2000);
    if (p && pv !== undefined) overrides[p] = pv;
  }
  const applied: Record<string, string | number> = {};
  for (const [k, val] of Object.entries(r.applied && typeof r.applied === 'object' ? r.applied : {}).slice(0, 200)) if (/^[\w.:-]{1,80}$/.test(k) && (typeof val === 'string' ? val.length <= 200 : typeof val === 'number' && Number.isFinite(val))) applied[k] = val as string | number;
  const pin = r.pin === 'latest' ? 'latest' : Number.isFinite(r.pin) && r.pin >= 1 ? Math.round(r.pin) : 'latest';
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name.slice(0, 80) : '',
    pin,
    version: Number.isFinite(r.version) ? Math.max(0, Math.round(r.version)) : 0,
    ...(typeof r.mode === 'string' && /^[a-z0-9-]{1,40}$/.test(r.mode) ? { mode: r.mode } : {}),
    overrides,
    applied,
    at: Number.isFinite(r.at) ? r.at : 0,
  };
}
