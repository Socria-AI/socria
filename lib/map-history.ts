// lib/map-history.ts — what changed on a thinking map, and when: the record the Time Machine reads.
//
// A map is rebuilt every turn, and until this record existed its earlier
// shapes were gone the moment a new one arrived. This keeps, from the moment
// it begins, each change as it happened: which ideas came onto the map, which
// left it, which were reworded — with the time, whether it came from a turn
// of the conversation or an edit by hand, and the person's own words on the
// turn that led to it.
//
// It is EVIDENCE, and it says where it stops. Nothing before `since` is known
// — the ideas already on the map when recording began are kept as `base`,
// named as such, never back-dated. When the person forgets history, the
// forgotten changes are folded into the base and counted in `trimmed`, so
// what is shown afterwards says that earlier history existed and was removed.
//
// PURE.

export interface MapIdea {
  id: string;
  label: string;
  type?: string;
}

export interface MapChange {
  at: number;
  cause: 'turn' | 'edit';
  added: MapIdea[];
  removed: MapIdea[];
  renamed: { id: string; from: string; to: string }[];
  /** the person's own words on the turn that led to it, when it came from a turn */
  said?: string;
}

export interface MapHistory {
  /** when recording began */
  since: number;
  /** what was on the map when recording began — or, after forgetting, at the earliest change kept */
  base: MapIdea[];
  changes: MapChange[];
  /** changes no longer kept, because the person forgot them or the record was full */
  trimmed?: number;
}

export const MAP_HISTORY_LIMITS = { changes: 30, ideas: 24, base: 60, label: 80, said: 140 } as const;
const L = MAP_HISTORY_LIMITS;

const cleanLabel = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
const cleanIdea = (v: unknown): MapIdea | null => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  const id = typeof o?.id === 'string' && /^[A-Za-z0-9_:.-]{1,40}$/.test(o.id) ? o.id : null;
  const label = cleanLabel(o?.label, L.label);
  if (!id || !label) return null;
  const type = typeof o?.type === 'string' && /^[a-z_]{1,20}$/.test(o.type) ? o.type : undefined;
  return { id, label, ...(type ? { type } : {}) };
};
const ideas = (v: unknown, max: number): MapIdea[] => {
  const out: MapIdea[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (out.length >= max) break;
    const i = cleanIdea(x);
    if (i && !out.some((o) => o.id === i.id)) out.push(i);
  }
  return out;
};
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e14 ? Math.round(v) : null);

export function sanitizeHistory(raw: unknown): MapHistory | undefined {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const since = finite(r?.since);
  if (!r || since === null) return undefined;
  const changes: MapChange[] = [];
  let last = since;
  for (const x of Array.isArray(r.changes) ? r.changes : []) {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
    const at = finite(o?.at);
    // a record runs forward in time; a change out of order is not one it kept
    if (!o || at === null || at < last) continue;
    const renamed: MapChange['renamed'] = [];
    for (const y of Array.isArray(o.renamed) ? o.renamed : []) {
      const q = y && typeof y === 'object' ? (y as Record<string, unknown>) : null;
      const id = typeof q?.id === 'string' && /^[A-Za-z0-9_:.-]{1,40}$/.test(q.id) ? q.id : null;
      const from = cleanLabel(q?.from, L.label);
      const to = cleanLabel(q?.to, L.label);
      if (id && from && to && from !== to && renamed.length < L.ideas) renamed.push({ id, from, to });
    }
    const added = ideas(o.added, L.ideas);
    const removed = ideas(o.removed, L.ideas);
    if (!added.length && !removed.length && !renamed.length) continue;
    const said = cleanLabel(o.said, L.said);
    changes.push({ at, cause: o.cause === 'edit' ? 'edit' : 'turn', added, removed, renamed, ...(said ? { said } : {}) });
    last = at;
  }
  const trimmed = typeof r.trimmed === 'number' && Number.isInteger(r.trimmed) && r.trimmed > 0 && r.trimmed < 1e6 ? r.trimmed : 0;
  return { since, base: ideas(r.base, L.base), changes: changes.slice(-L.changes), ...(trimmed + Math.max(0, changes.length - L.changes) ? { trimmed: trimmed + Math.max(0, changes.length - L.changes) } : {}) };
}

/**
 * The record with one more change: what differs between the ideas before and
 * after. Nothing is recorded when nothing changed. The first call starts the
 * record, with what was already there as its base.
 */
export function recordChange(
  history: MapHistory | undefined,
  before: readonly { id: string; label: string; type?: string }[],
  after: readonly { id: string; label: string; type?: string }[],
  at: number,
  cause: 'turn' | 'edit',
  said?: string
): MapHistory | undefined {
  const b = new Map(before.map((n) => [n.id, n]));
  const a = new Map(after.map((n) => [n.id, n]));
  const added = after.filter((n) => !b.has(n.id)).map((n) => cleanIdea(n)).filter((n): n is MapIdea => !!n);
  const removed = before.filter((n) => !a.has(n.id)).map((n) => cleanIdea(n)).filter((n): n is MapIdea => !!n);
  const renamed = after
    .filter((n) => b.has(n.id) && cleanLabel(b.get(n.id)!.label, L.label) !== cleanLabel(n.label, L.label))
    .map((n) => ({ id: n.id, from: cleanLabel(b.get(n.id)!.label, L.label), to: cleanLabel(n.label, L.label) }))
    .filter((x) => x.from && x.to);
  const start: MapHistory = history ?? { since: Math.round(at), base: ideas(before, L.base), changes: [] };
  if (!added.length && !removed.length && !renamed.length) return history ?? (before.length ? start : undefined);
  const when = Math.max(Math.round(at), start.changes[start.changes.length - 1]?.at ?? start.since);
  const change: MapChange = {
    at: when,
    cause,
    added: added.slice(0, L.ideas),
    removed: removed.slice(0, L.ideas),
    renamed: renamed.slice(0, L.ideas),
    ...(cleanLabel(said, L.said) ? { said: cleanLabel(said, L.said) } : {}),
  };
  const changes = [...start.changes, change];
  if (changes.length <= L.changes) return { ...start, changes };
  // full: the oldest change is folded into the base, and counted
  return forgetMapBefore({ ...start, changes }, changes.length - L.changes);
}

/** The ideas on the map just after change `i` (−1: at the base). */
export function ideasAt(h: MapHistory, i: number): MapIdea[] {
  const cur = new Map(h.base.map((n) => [n.id, n]));
  for (const c of h.changes.slice(0, i + 1)) {
    for (const n of c.removed) cur.delete(n.id);
    for (const n of c.added) cur.set(n.id, n);
    for (const r of c.renamed) {
      const n = cur.get(r.id);
      if (n) cur.set(r.id, { ...n, label: r.to });
    }
  }
  return [...cur.values()];
}

/** What differs between the map after change `i` and after change `j`. */
export function compareMap(h: MapHistory, i: number, j: number): { added: MapIdea[]; removed: MapIdea[]; renamed: { id: string; from: string; to: string }[] } {
  const a = new Map(ideasAt(h, i).map((n) => [n.id, n]));
  const b = new Map(ideasAt(h, j).map((n) => [n.id, n]));
  return {
    added: [...b.values()].filter((n) => !a.has(n.id)),
    removed: [...a.values()].filter((n) => !b.has(n.id)),
    renamed: [...b.values()].filter((n) => a.has(n.id) && a.get(n.id)!.label !== n.label).map((n) => ({ id: n.id, from: a.get(n.id)!.label, to: n.label })),
  };
}

/** Forget the changes before `i`: they are folded into the base, and counted. The map as it is now does not change. */
export function forgetMapBefore(h: MapHistory, i: number): MapHistory {
  const k = Math.max(0, Math.min(Math.round(i), h.changes.length));
  if (!k) return h;
  const base = ideasAt(h, k - 1).slice(0, L.base);
  const since = h.changes[k - 1].at;
  return { since, base, changes: h.changes.slice(k), trimmed: (h.trimmed ?? 0) + k };
}
