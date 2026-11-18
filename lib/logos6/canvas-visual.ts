// lib/logos6/canvas-visual.ts — THE MIND MAP, ADDRESSABLE (Logos 6; pure).
//
// The canvas is an artifact like any other picture (lib/visual/elements.ts): each card is `node:<id>`, each line
// `edge:<line id>`, so a reply can point at a card while it explains ("[opportunity cost](vis:focus/node:n-oc)"),
// a person can say "highlight opportunity cost", and "this" means the card they pressed. Its key is
// `map:<conversation id>`.

import type { ThinkingMap } from '../logos';
import { slug, wordsFor, type VisualArtifact, type VisualOp } from '../visual/elements';
import { RELATION_SAID, edgeIdOf } from './graph';

/** A card's address on the canvas. */
export const nodeVid = (id: string) => `node:${slug(id) || id.toLowerCase()}`;
/** A line's address on the canvas. */
export const edgeVid = (e: Parameters<typeof edgeIdOf>[0]) => `edge:${edgeIdOf(e).toLowerCase()}`;

const OPS: VisualOp[] = ['highlight', 'unhighlight', 'focus'];

/** The map as an addressable artifact: its cards and its lines, by the words people call them. */
export function canvasArtifact(key: string, map: Pick<ThinkingMap, 'nodes' | 'edges' | 'title'>): VisualArtifact {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  return {
    key,
    type: 'map',
    title: map.title || 'Mind Map',
    ops: [],
    elements: [
      ...map.nodes.map((n) => ({ id: nodeVid(n.id), kind: 'node' as const, label: n.label, words: wordsFor(n.label, n.mind?.subtitle), meta: { nid: n.id, type: n.type }, ops: OPS })),
      ...map.edges
        .filter((e) => byId.has(e.from) && byId.has(e.to))
        .map((e) => ({ id: edgeVid(e), kind: 'edge' as const, label: `${byId.get(e.from)!.label} ${e.kind === 'structure' ? 'sits inside' : RELATION_SAID[e.relation]} ${byId.get(e.to)!.label}`, words: [] as string[], meta: { from: e.from, to: e.to }, ops: OPS })),
    ],
  };
}

/** The open map in a line Socria can read: its cards by exact id, so a reply can point at one. Bounded. */
export function canvasLine(map: Pick<ThinkingMap, 'nodes' | 'title'>, mode: string): string {
  const parts = map.nodes.slice(0, 24).map((n) => `${nodeVid(n.id)} “${n.label.length > 48 ? `${n.label.slice(0, 45)}…` : n.label}”`);
  return `The Mind Map is open (${mode}): ${parts.join('; ')}${map.nodes.length > 24 ? '; …' : ''}`.slice(0, 900);
}
