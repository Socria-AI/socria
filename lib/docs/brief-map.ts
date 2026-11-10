// lib/docs/brief-map.ts — SOCRIA'S READING OF A DOCUMENT, DRAWN.
//
// Two drawings, each made only when the person asks ("Map the terms", "Map the
// argument") and filed in Artifacts as an ordinary Diagram display
// (lib/objects/display-diagram.ts) — theirs to rearrange, relabel and keep:
//
//   · THE TERMS, as a concept map: each term the document rests on, what it
//     means there, and the links between terms the analysis found;
//   · THE ARGUMENT, as a tree: each claim, the evidence under it, what it
//     assumes (Socria's reading, grouped and said so) and the limits the
//     document states.
//
// Nothing is drawn that the analysis did not keep (lib/docs/brief.ts): every
// node is a point that stood on its passages, and its note says the page it
// came from. A drawing that would say nothing — fewer than three terms, no
// claim — is not made.
//
// PURE.

import type { BriefCite, DocBrief } from './brief';

interface Node {
  id: string;
  label: string;
  note?: string;
  group?: string;
  by: 'socria';
}
interface Edge {
  from: string;
  to: string;
  label?: string;
  by: 'socria';
}
export interface BriefDiagram {
  title: string;
  view: 'concept' | 'hierarchy';
  nodes: Node[];
  edges: Edge[];
  detail: 'full';
  root?: string;
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const where = (cites: BriefCite[], unit: string) => {
  const pages = [...new Set(cites.map((c) => c.page))].sort((a, b) => a - b).slice(0, 3);
  return pages.length ? `${unit} ${pages.join(', ')}` : '';
};
const titleOf = (b: DocBrief) => b.name.replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 50);

/** The document's terms and how they connect, as a concept map — or null with fewer than three terms. */
export function termsDiagram(b: DocBrief, unit = 'p.'): BriefDiagram | null {
  if (b.concepts.length < 3) return null;
  const id = (i: number) => `t${i + 1}`;
  const index = new Map(b.concepts.map((c, i) => [c.term, id(i)]));
  const nodes: Node[] = b.concepts.map((c, i) => ({
    id: id(i),
    label: clip(c.term, 60),
    note: clip(`${c.meaning}${where(c.cites, unit) ? ` (${where(c.cites, unit)})` : ''}`, 230),
    by: 'socria',
  }));
  const edges: Edge[] = b.links
    .filter((l) => index.has(l.from) && index.has(l.to))
    .map((l) => ({ from: index.get(l.from)!, to: index.get(l.to)!, label: clip(l.how, 38), by: 'socria' }));
  return { title: clip(`Terms in ${titleOf(b)}`, 78), view: 'concept', nodes, edges, detail: 'full' };
}

/**
 * The document's argument as a tree: what it concludes at the root, each claim
 * beneath, and under each claim its evidence and what it assumes; the limits
 * it states hang from the root. Null when no claim held up.
 */
export function argumentDiagram(b: DocBrief, unit = 'p.'): BriefDiagram | null {
  if (!b.claims.length) return null;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const root = 'root';
  nodes.push({ id: root, label: clip(b.gist || titleOf(b), 78), note: b.gistCites.length ? `What the document is, in Socria’s words (${where(b.gistCites, unit)})` : 'What the document is, in Socria’s words', by: 'socria' });
  b.claims.forEach((c, i) => {
    const cid = `c${i + 1}`;
    nodes.push({ id: cid, label: clip(c.text, 78), note: clip(`${c.quote ? `“${c.quote}” ` : ''}(${where(c.cites, unit)})`, 230), group: 'Claims', by: 'socria' });
    edges.push({ from: root, to: cid, label: 'claims', by: 'socria' });
    c.evidence.forEach((e, j) => {
      const eid = `${cid}e${j + 1}`;
      nodes.push({ id: eid, label: clip(e.text, 78), note: clip(`${e.quote ? `“${e.quote}” ` : ''}(${where(e.cites, unit)})`, 230), group: 'Evidence', by: 'socria' });
      edges.push({ from: cid, to: eid, label: 'because', by: 'socria' });
    });
    c.assumptions.forEach((a, j) => {
      const aid = `${cid}a${j + 1}`;
      nodes.push({ id: aid, label: clip(a.text, 78), note: 'Socria’s reading: the claim relies on this without showing it.', group: 'Assumes', by: 'socria' });
      edges.push({ from: cid, to: aid, label: 'assumes', by: 'socria' });
    });
  });
  b.limits.forEach((l, i) => {
    const lid = `l${i + 1}`;
    nodes.push({ id: lid, label: clip(l.text, 78), note: clip(`${l.quote ? `“${l.quote}” ` : ''}(${where(l.cites, unit)})`, 230), group: 'Limits it states', by: 'socria' });
    edges.push({ from: root, to: lid, label: 'but', by: 'socria' });
  });
  return { title: clip(`The argument of ${titleOf(b)}`, 78), view: 'hierarchy', nodes: nodes.slice(0, 60), edges: edges.filter((e) => nodes.slice(0, 60).some((n) => n.id === e.to)), detail: 'full', root };
}
