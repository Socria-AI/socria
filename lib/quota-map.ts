// lib/quota-map.ts — WHAT A MAP PASS ADDED, AND WHAT THE FREE PLAN KEEPS OF IT.
//
// The map route (app/api/logos/map) holds the free plan's Logic Map
// allowances: nodes, counted as a map gains them, and artifacts — a display
// made in the workspace, a model built, the conversation's picture. These
// are the pure halves: what is new in a pass compared with the map it was
// sent, and the map with what could not be paid for taken back out. Nothing
// the person already had is ever touched — only what this pass would have
// added.
//
// Pure: no store, no clock.

interface NodeLike {
  id: string;
}
interface EdgeLike {
  from: string;
  to: string;
}
interface MapLike {
  nodes: NodeLike[];
  edges: EdgeLike[];
  objects?: { objs: { id: string }[] } | null;
  viz?: unknown;
  models?: { docs: { id: string }[]; active?: string | null } | null;
}

/** The ids of nodes in `after` that `before` did not have, in `after`'s order. */
export function addedNodes(before: MapLike | null | undefined, after: MapLike): string[] {
  const had = new Set((before?.nodes ?? []).map((n) => n.id));
  return after.nodes.filter((n) => !had.has(n.id)).map((n) => n.id);
}

/**
 * `after` keeping only the first `allow` of its new nodes: the rest are taken
 * back out, with every connection that touched them. What `before` had stays,
 * whatever this pass did to it.
 */
export function keepAddedNodes<T extends MapLike>(after: T, before: MapLike | null | undefined, allow: number): { map: T; dropped: string[] } {
  const added = addedNodes(before, after);
  if (added.length <= allow) return { map: after, dropped: [] };
  const dropped = new Set(added.slice(Math.max(0, allow)));
  return {
    map: {
      ...after,
      nodes: after.nodes.filter((n) => !dropped.has(n.id)),
      edges: after.edges.filter((e) => !dropped.has(e.from) && !dropped.has(e.to)),
    },
    dropped: [...dropped],
  };
}

/** What a pass made that counts as an artifact: workspace objects, built models, and the conversation's first picture. */
export interface Made {
  objects: string[];
  models: string[];
  /** a picture where the conversation had none — its picture is one artifact, however often it is redrawn */
  picture: boolean;
}

export const NOTHING_MADE: Made = { objects: [], models: [], picture: false };

export function madeArtifacts(before: MapLike | null | undefined, after: MapLike): Made {
  const hadObj = new Set((before?.objects?.objs ?? []).map((o) => o.id));
  const hadModel = new Set((before?.models?.docs ?? []).map((d) => d.id));
  return {
    objects: (after.objects?.objs ?? []).map((o) => o.id).filter((id) => !hadObj.has(id)),
    models: (after.models?.docs ?? []).map((d) => d.id).filter((id) => !hadModel.has(id)),
    picture: !before?.viz && !!after.viz,
  };
}

export const madeAny = (m: Made) => m.objects.length > 0 || m.models.length > 0 || m.picture;

/**
 * `after` without the artifacts that could not be paid for: those objects and
 * model documents taken out (an active model that was one of them is no longer
 * active), and the picture put back to what it was.
 */
export function withoutArtifacts<T extends MapLike>(after: T, before: MapLike | null | undefined, refused: Made): T {
  if (!madeAny(refused)) return after;
  let out: T = after;
  if (refused.objects.length && after.objects) {
    const gone = new Set(refused.objects);
    out = { ...out, objects: { ...after.objects, objs: after.objects.objs.filter((o) => !gone.has(o.id)) } };
  }
  if (refused.models.length && after.models) {
    const gone = new Set(refused.models);
    const docs = after.models.docs.filter((d) => !gone.has(d.id));
    const active = after.models.active && gone.has(after.models.active) ? null : after.models.active ?? null;
    out = { ...out, models: { ...after.models, docs, active } };
  }
  if (refused.picture) {
    const { viz: _drawn, ...rest } = out as T & { viz?: unknown };
    out = (before?.viz ? { ...rest, viz: before.viz } : rest) as T;
  }
  return out;
}
