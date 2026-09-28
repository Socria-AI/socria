// lib/workspace/portable.ts
//
// THE WORKSPACE AS AN OBJECT IN ITS OWN RIGHT — something you can hand to
// somebody, keep a copy of, read back a year later, and ask questions of.
//
// Three capabilities, and one commitment running through all of them: what
// leaves here says where everything came from. An export that dropped
// provenance would be a tidy list of assertions with no way to tell what the
// person said from what Socria guessed, which is the one thing this product
// exists to keep apart. So provenance, standing and the locked fields travel
// with the objects, and the file records what it is NOT carrying as well.
//
//   exportWorkspace  a portable, versioned document. Plain JSON, ordered
//                    deterministically, so two exports of the same workspace
//                    are byte-identical and a diff between two days is
//                    readable.
//   importWorkspace  the same document back, validated field by field, with
//                    every id re-namespaced so an import can never collide
//                    with or silently overwrite what is already there. An
//                    imported object arrives marked `imported`: it is somebody
//                    else's reasoning until the reader does something with it.
//   query            a structured question over objects and relationships.
//                    Filters compose, the order is stable, and nothing is
//                    ranked by a score — the answer is a set, not a leaderboard.
//
// WHAT AN EXPORT MUST NOT CONTAIN: anything marked private. Private objects
// come from weighty Core conversations and have never been allowed to leave
// that context (invariant 3 in lib/mind/types.ts). `exportWorkspace` drops
// them and says how many it dropped, rather than trusting every caller to have
// passed excludePrivate upstream — a file is forever and a flag is a habit.

import {
  SCHEMA_VERSION,
  UNSETTLED,
  isInferred,
  isUsers,
  sanitizeObject,
  sanitizeRelationship,
  type EpistemicState,
  type ObjectType,
  type Origin,
  type RelationType,
  type Relationship,
  type WObject,
} from './object';
import { add, emptyWorkspace, relate, type Workspace } from './store';

export const PORTABLE_KIND = 'socria.workspace';

export interface PortableWorkspace {
  kind: typeof PORTABLE_KIND;
  version: number;
  /** what the person called it */
  title: string;
  exportedAt: number;
  /** their own words about what this workspace is for, if they wrote any */
  about?: string;
  objects: WObject[];
  relationships: Relationship[];
  /** plain counts, so a reader can see the shape before parsing the rest */
  counts: { objects: number; relationships: number; unsettled: number; inferred: number; yours: number };
  /** what was deliberately left out, named rather than silently missing */
  omitted?: { private: number };
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export interface ExportOptions {
  title?: string;
  about?: string;
  at: number;
}

export function exportWorkspace(ws: Workspace, opts: ExportOptions): PortableWorkspace {
  const objects: WObject[] = [];
  let dropped = 0;
  for (const o of ws.objects.values()) {
    if (o.meta?.private) {
      dropped++;
      continue;
    }
    objects.push(o);
  }
  objects.sort(byId);
  const kept = new Set(objects.map((o) => o.id));
  // An edge to something that was left out goes too: a dangling reference
  // would tell a reader that there is something there and refuse to say what.
  const relationships = [...ws.relationships.values()]
    .filter((r) => kept.has(r.from) && kept.has(r.to))
    .sort(byId);

  return {
    kind: PORTABLE_KIND,
    version: SCHEMA_VERSION,
    title: (opts.title ?? 'Workspace').slice(0, 200),
    exportedAt: opts.at,
    ...(opts.about ? { about: opts.about.slice(0, 2000) } : {}),
    objects,
    relationships,
    counts: {
      objects: objects.length,
      relationships: relationships.length,
      unsettled: objects.filter((o) => UNSETTLED.includes(o.epistemic)).length,
      inferred: objects.filter(isInferred).length,
      yours: objects.filter(isUsers).length,
    },
    ...(dropped ? { omitted: { private: dropped } } : {}),
  };
}

export interface ImportResult {
  workspace: Workspace;
  /** how many survived validation */
  objects: number;
  relationships: number;
  /** how many were refused, and why, so an import is never silently lossy */
  refused: { objects: number; relationships: number };
  title: string;
  say: string;
}

export interface ImportOptions {
  /** where it lands. Every id becomes `<into>:<original>`. */
  into?: string;
  /** an existing workspace to import alongside; a fresh one by default */
  onto?: Workspace;
  at: number;
}

/**
 * Read a portable workspace back.
 *
 * NAMESPACED, ALWAYS. Two people's workspaces routinely contain `map:n3`, and
 * an import that kept raw ids would merge two unrelated objects into one and
 * call it agreement. The prefix defaults to `import`, and a caller that is
 * importing several files at once passes its own.
 *
 * IMPORTED IS ITS OWN ORIGIN. Every object gains a provenance entry saying it
 * arrived from a file and what that file called itself. What the exporting
 * workspace recorded is kept underneath it — the reader can see both that this
 * is somebody else's, and what they said it rested on.
 */
export function importWorkspace(raw: unknown, opts: ImportOptions): ImportResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Record<string, unknown>;
  if (doc.kind !== PORTABLE_KIND) return null;
  const version = typeof doc.version === 'number' ? doc.version : 0;
  // A file from a later version is refused whole rather than read partially:
  // guessing at fields that did not exist yet is how somebody's reasoning
  // comes back subtly altered.
  if (version > SCHEMA_VERSION) return null;

  const prefix = (typeof opts.into === 'string' && opts.into ? opts.into : 'import').replace(
    /[^a-z0-9_-]/gi,
    ''
  );
  const title = typeof doc.title === 'string' ? doc.title.slice(0, 200) : 'An imported workspace';
  const ns = (id: string) => `${prefix}:${id}`;

  const rawObjects = Array.isArray(doc.objects) ? doc.objects : [];
  const rawRels = Array.isArray(doc.relationships) ? doc.relationships : [];

  let ws = opts.onto ?? emptyWorkspace();
  const landed = new Set<string>();
  let refusedObjects = 0;

  for (const r of rawObjects) {
    const clean = sanitizeObject(r);
    if (!clean) {
      refusedObjects++;
      continue;
    }
    const o: WObject = {
      ...clean,
      id: ns(clean.id),
      provenance: [
        { origin: 'imported', at: opts.at, detail: `from “${title}”` },
        ...clean.provenance,
      ],
      // Somebody else's decisions about their own objects do not bind this
      // workspace's reader — but they are not overwritten either, so a locked
      // field arrives locked and stays theirs until the reader corrects it.
    };
    ws = add(ws, o, 'system', opts.at);
    landed.add(o.id);
  }

  let refusedRels = 0;
  for (const r of rawRels) {
    const clean = sanitizeRelationship(r);
    if (!clean) {
      refusedRels++;
      continue;
    }
    const from = ns(clean.from);
    const to = ns(clean.to);
    if (!landed.has(from) || !landed.has(to)) {
      refusedRels++;
      continue;
    }
    ws = relate(
      ws,
      {
        ...clean,
        id: ns(clean.id),
        from,
        to,
        provenance: [{ origin: 'imported', at: opts.at, detail: `from “${title}”` }, ...clean.provenance],
      },
      'system',
      opts.at
    );
  }

  const objects = landed.size;
  const relationships = rawRels.length - refusedRels;
  return {
    workspace: ws,
    objects,
    relationships,
    refused: { objects: refusedObjects, relationships: refusedRels },
    title,
    say:
      `Read ${objects} object${objects === 1 ? '' : 's'} and ${relationships} connection` +
      `${relationships === 1 ? '' : 's'} from “${title}”` +
      (refusedObjects + refusedRels
        ? `; ${refusedObjects + refusedRels} could not be read and were left out.`
        : '.'),
  };
}

// ── asking the workspace something ──────────────────────────────────

export interface Query {
  /** plain text, matched against label, content and meaning */
  text?: string;
  type?: readonly ObjectType[];
  epistemic?: readonly EpistemicState[];
  origin?: readonly Origin[];
  /** only things the person said */
  yours?: boolean;
  /** only things nothing has confirmed */
  unsettled?: boolean;
  /** only things waiting on a change upstream */
  stale?: boolean;
  surface?: readonly string[];
  /** attached to this object… */
  connectedTo?: string;
  /** …by one of these relationships, in this direction */
  by?: readonly RelationType[];
  direction?: 'out' | 'in' | 'either';
  since?: number;
  until?: number;
  limit?: number;
}

export interface QueryResult {
  objects: WObject[];
  /** how many matched before `limit` cut it */
  total: number;
  /** the question in words, so a saved query is readable */
  say: string;
}

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

/**
 * Ask the workspace something.
 *
 * DETERMINISTIC AND UNRANKED. Filters are conjunctive, the order is by
 * modification time and then by id, and there is no relevance score anywhere —
 * a workspace query is not a search engine, and a made-up ranking would decide
 * for the person which of their own objects matter.
 */
export function query(ws: Workspace, q: Query): QueryResult {
  const terms = q.text ? words(q.text) : [];
  const near = q.connectedTo ? reachable(ws, q.connectedTo, q.by, q.direction ?? 'either') : null;

  const matched: WObject[] = [];
  for (const o of ws.objects.values()) {
    if (q.type && !q.type.includes(o.type)) continue;
    if (q.epistemic && !q.epistemic.includes(o.epistemic)) continue;
    if (q.origin && !o.provenance.some((p) => q.origin!.includes(p.origin))) continue;
    if (q.yours && !isUsers(o)) continue;
    if (q.unsettled && !UNSETTLED.includes(o.epistemic)) continue;
    if (q.stale && !o.stale) continue;
    if (q.surface && !(o.surface && q.surface.includes(o.surface))) continue;
    if (near && !near.has(o.id)) continue;
    const when = o.modifiedAt ?? o.createdAt ?? 0;
    if (q.since !== undefined && when < q.since) continue;
    if (q.until !== undefined && when > q.until) continue;
    if (terms.length) {
      const hay = `${o.label} ${o.content ?? ''} ${o.meaning ?? ''}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
    }
    matched.push(o);
  }

  matched.sort(
    (a, b) =>
      (b.modifiedAt ?? b.createdAt ?? 0) - (a.modifiedAt ?? a.createdAt ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  const limit = q.limit && q.limit > 0 ? Math.min(q.limit, 500) : 200;
  return { objects: matched.slice(0, limit), total: matched.length, say: describe(q) };
}

/** One hop from an object, by the relationships asked for. */
function reachable(
  ws: Workspace,
  id: string,
  by: readonly RelationType[] | undefined,
  direction: 'out' | 'in' | 'either'
): Set<string> {
  const out = new Set<string>();
  const take = (rid: string, side: 'from' | 'to') => {
    const r = ws.relationships.get(rid);
    if (!r) return;
    if (by && !by.includes(r.type)) return;
    out.add(side === 'from' ? r.to : r.from);
  };
  if (direction !== 'in') for (const rid of ws.out.get(id) ?? []) take(rid, 'from');
  if (direction !== 'out') for (const rid of ws.into.get(id) ?? []) take(rid, 'to');
  return out;
}

/** The query, in words. Used as the heading over a result. */
export function describe(q: Query): string {
  const bits: string[] = [];
  if (q.yours) bits.push('things you said');
  else if (q.unsettled) bits.push('things nothing has confirmed');
  else bits.push('objects');
  if (q.type?.length) bits.push(`of type ${q.type.join(', ')}`);
  if (q.stale) bits.push('waiting on a change upstream');
  if (q.origin?.length) bits.push(`from ${q.origin.join(', ')}`);
  if (q.surface?.length) bits.push(`on ${q.surface.join(', ')}`);
  if (q.connectedTo) bits.push(`attached to ${q.connectedTo}`);
  if (q.text) bits.push(`mentioning “${q.text}”`);
  if (q.since !== undefined) bits.push('changed since then');
  return bits.join(', ');
}
