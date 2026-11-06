// lib/logos5/drawing.ts — A DRAWING, BETWEEN THE LOGIC MAP, THE CONVERSATION AND ARTIFACTS (Logos 5).
//
// The Logic Map draws almost anything now: beside the person's thinking it can
// hold a drawing of the subject — every part of it "origin": "drawn" (lib/logos.ts,
// THE SUBJECT, DRAWN). A drawing moves between the three places a line of
// thinking keeps things, and never by asking a model:
//
//   a reply's diagram → the Logic Map   "Open on the Logic Map" under a reply's
//                                        cycle, tree, flow or causes diagram
//                                        (lib/inline-ui.ts DiagramSpec) puts it
//                                        on the map as a drawing, to open, edit
//                                        and inspect;
//   the Logic Map → Artifacts            "Keep in Artifacts" files the drawing as
//                                        a Diagram display (lib/objects/
//                                        display-diagram.ts), to keep and work
//                                        with as an artifact.
//
// ONE DRAWING AT A TIME. A map has one title and one shape, so a new drawing
// takes the place of the one before; the person's own thinking is never
// touched, and Undo brings the old drawing back (components/LogosApp.tsx).
//
// Pure: no store, no model, no clock.

import type { LogosEdge, LogosNode, LogosRelation, ThinkingMap } from '../logos';
import { mapCaps, RELATIONS } from '../logos';
import type { DiagramSpec } from '../inline-ui';
import type { GrammarId } from '../representation';

/** The drawing on a map, if it holds one: its parts, the lines among them, what it is of and its shape. */
export interface Drawing {
  nodes: LogosNode[];
  edges: LogosEdge[];
  title?: string;
  kind?: GrammarId;
}

export const isDrawn = (n: Pick<LogosNode, 'origin'> | null | undefined): boolean => n?.origin === 'drawn';

/** The drawing a map holds — null when it holds none. Lines from the person's thinking to it are not part of it. */
export function drawingOf(map: Pick<ThinkingMap, 'nodes' | 'edges' | 'title' | 'building'> | null | undefined): Drawing | null {
  const nodes = (map?.nodes ?? []).filter(isDrawn);
  if (!nodes.length) return null;
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (map?.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to));
  return { nodes, edges, ...(map?.title ? { title: map.title } : {}), ...(map?.building?.kind ? { kind: map.building.kind } : {}) };
}

// ── a reply's diagram, onto the Logic Map ────────────────────────────

/** What each of a reply's diagram views is as a shape of the map. */
const SHAPE_OF: Record<DiagramSpec['view'], GrammarId> = { cycle: 'cycle', tree: 'hierarchy', flow: 'process', causes: 'causal' };

/** Where each of a causes diagram's parts sits — a fishbone's bones. */
const CAUSE_GROUP: Record<string, string> = { underlying: 'Underlying causes', trigger: 'Trigger', amplifier: 'Made worse by', effect: 'Effect' };

/**
 * A reply's diagram as a drawing for the map. Ids are its own, prefixed, so
 * they cannot meet the ids already on the map; each part keeps what it says
 * when opened. A tree's lines point up, child to parent, as the map draws
 * containment (part_of); a cycle, a flow and a chain of causes point onward.
 */
export function drawingFromInline(spec: DiagramSpec): Drawing {
  const kind = SHAPE_OF[spec.view];
  const id = (raw: string) => `d_${raw}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40);
  const into = new Set(spec.edges.map(([, to]) => to));
  const outOf = new Set(spec.edges.map(([from]) => from));
  const nodes: LogosNode[] = spec.nodes.map((n, i) => {
    const base: LogosNode = { id: id(n.id), type: 'idea', label: n.label, status: 'open', origin: 'drawn', ...(n.detail ? { detail: n.detail } : {}) };
    if (spec.view === 'cycle') return { ...base, type: 'process', role: 'stage', at: String(i + 1) };
    if (spec.view === 'tree') {
      const root = !into.has(n.id);
      return { ...base, type: 'entity', role: root ? 'whole' : 'part' };
    }
    if (spec.view === 'flow') {
      const start = !into.has(n.id), end = !outOf.has(n.id);
      return { ...base, type: 'step', role: start ? 'start' : end ? 'end' : 'step' };
    }
    const r = n.role ?? (outOf.has(n.id) ? 'underlying' : 'effect');
    return { ...base, type: r === 'effect' ? 'event' : 'state', role: r === 'effect' ? 'effect' : 'cause', group: CAUSE_GROUP[r] };
  });
  const relation: LogosRelation = spec.view === 'causes' ? 'causes' : spec.view === 'flow' ? 'precedes' : 'leads_to';
  const edges: LogosEdge[] = spec.edges.map(([from, to]) =>
    spec.view === 'tree' ? { from: id(to), to: id(from), relation: 'part_of' } : { from: id(from), to: id(to), relation }
  );
  return { nodes, edges, kind, ...(spec.title ? { title: spec.title } : {}) };
}

/**
 * The map with this drawing on it. A drawing already there gives way to it,
 * with its lines; the person's thinking is kept exactly as it was, and so is
 * every line between their ideas. A part they had taken off the map comes
 * back only because they asked for this drawing. When the person's ideas and
 * the drawing together are more than a map holds, nothing changes: the reason
 * is said instead, never half a drawing.
 */
export function withDrawing(map: ThinkingMap, d: Drawing): { map: ThinkingMap } | { refused: string } {
  const theirs = map.nodes.filter((n) => !isDrawn(n));
  const keptIds = new Set(theirs.map((n) => n.id));
  const taken = new Set(keptIds);
  const rename = new Map<string, string>();
  const nodes = d.nodes.map((n) => {
    let nid = n.id;
    while (taken.has(nid)) nid = `${nid}_`;
    taken.add(nid);
    rename.set(n.id, nid);
    return { ...n, id: nid, origin: 'drawn' as const };
  });
  // the drawing's own lines only, between two of its parts, each once
  const edges = d.edges
    .filter((e) => (RELATIONS as readonly string[]).includes(e.relation))
    .map((e) => ({ ...e, from: rename.get(e.from) ?? '', to: rename.get(e.to) ?? '' }))
    .filter((e, i, all) => e.from && e.to && e.from !== e.to && all.findIndex((x) => x.from === e.from && x.to === e.to) === i);
  const next: ThinkingMap = {
    ...map,
    nodes: [...theirs, ...nodes],
    edges: [...map.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to)), ...edges],
    ...(d.title ? { title: d.title } : {}),
    ...(d.kind ? { building: { kind: d.kind, by: 'inferred' as const, confidence: 0.9, why: 'drawn from a reply' } } : {}),
  };
  if (!d.title) delete next.title;
  const caps = mapCaps(next);
  if (next.nodes.length > caps.nodes || next.edges.length > caps.edges) {
    return { refused: `The map holds ${caps.nodes} cards, and this drawing would make ${next.nodes.length}. Take some of your own off, or keep the diagram in Artifacts instead.` };
  }
  // asked for, so not taken off again at the next landing (lib/map-edit.ts dropRemoved)
  const back = new Set(nodes.map((n) => n.label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()));
  if (next.removed?.length) {
    const removed = next.removed.filter((r) => !back.has(r));
    if (removed.length) next.removed = removed;
    else delete next.removed;
  }
  return { map: next };
}

// ── the Logic Map's drawing, kept in Artifacts ────────────────────────

/** The Diagram display's view for each shape of drawing (lib/objects/display-diagram.ts DiagramView). */
const ARTIFACT_VIEW: Partial<Record<GrammarId, 'concept' | 'hierarchy' | 'flow'>> = {
  process: 'flow',
  timeline: 'flow',
  plan: 'flow',
  cycle: 'concept',
  hierarchy: 'hierarchy',
  parts: 'hierarchy',
  concept: 'concept',
  causal: 'concept',
  system: 'concept',
};

/** What a line says in the Diagram display: its own words, its condition, or what kind of line it is. */
const LINE_WORDS: Partial<Record<LogosRelation, string>> = {
  causes: 'causes',
  inhibits: 'holds back',
  becomes: 'becomes',
  flows_to: 'flows to',
  leads_to: 'leads to',
  precedes: 'then',
  is_a: 'is a kind of',
  part_of: 'part of',
  depends: 'depends on',
  supports: 'supports',
  conflicts: 'conflicts with',
};

/**
 * The map's drawing as a Diagram display's state, for "Keep in Artifacts":
 * every part with what it says opened (its note) and the region it sits in
 * (its cluster), every line with its words. A tree's lines turn to point from
 * parent to child, the way the display grows one. Null when there is no
 * drawing to keep.
 */
export function diagramFromDrawing(map: Pick<ThinkingMap, 'nodes' | 'edges' | 'title' | 'building'>): Record<string, unknown> | null {
  const d = drawingOf(map);
  if (!d || d.nodes.length < 2) return null;
  const view = (d.kind && ARTIFACT_VIEW[d.kind]) || 'concept';
  const tree = view === 'hierarchy';
  const nodes = d.nodes.map((n) => ({
    id: n.id,
    label: n.at && !/^\d+$/.test(n.at) ? `${n.label} (${n.at})` : n.label,
    ...(n.detail ? { note: n.detail } : {}),
    ...(n.group ? { group: n.group } : {}),
    by: 'socria',
  }));
  const edges = d.edges.map((e) => {
    const up = tree && (e.relation === 'part_of' || e.relation === 'is_a');
    const words = e.label ?? e.when ?? (tree ? undefined : LINE_WORDS[e.relation]);
    return { from: up ? e.to : e.from, to: up ? e.from : e.to, ...(words ? { label: words } : {}), by: 'socria' };
  });
  const root = tree ? d.nodes.find((n) => !d.edges.some((e) => (e.relation === 'part_of' || e.relation === 'is_a') && e.from === n.id))?.id : undefined;
  return { title: d.title || 'Diagram', view, nodes, edges, ...(root ? { root } : {}), detail: 'full' };
}
