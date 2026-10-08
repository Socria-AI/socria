// lib/view-request.ts
//
// "SHOW THIS AS A STRUCTURE." — a request to see the same thinking another
// way, read from what the person typed. Logos 3 answers it by turning the
// stage to that view and giving it the whole workspace; when the view has
// nothing to draw yet (a timeline before the map has an order, a plot before
// there is anything to plot), the sentence also goes to Socria, whose map
// pass reorganizes the thinking into that shape (lib/representation.ts
// statedBuilding), and the view opens when it can.
//
// Conservative on purpose. A question that mentions a structure ("what is
// the structure of DNA?") is not a request to see one: a request names the
// view after a verb of showing or organizing and "as" / "into", or asks to
// switch to it, or is nothing but its name ("the outline", "mind map view").
//
// PURE.

import type { LensId } from './logos-layout';

const NAMES: { lens: LensId; names: string[] }[] = [
  { lens: 'structure', names: ['structure', 'structured view', 'outline', 'hierarchy', 'tree', 'breakdown'] },
  { lens: 'graph', names: ['mind map', 'mindmap', 'concept map', 'web of ideas', 'map of ideas'] },
  { lens: 'plot', names: ['plot', 'chart', 'curve'] },
  { lens: 'flow', names: ['flowchart', 'flow chart', 'flow', 'process', 'workflow', 'pipeline'] },
  { lens: 'timeline', names: ['timeline', 'chronology'] },
  { lens: 'matrix', names: ['comparison table', 'comparison', 'table', 'matrix', 'side by side'] },
  // "show me the evidence" is usually a request FOR evidence, so these two
  // are only views when called views
  { lens: 'tensions', names: ['tensions view', 'tensions lens'] },
  { lens: 'evidence', names: ['evidence view', 'evidence lens'] },
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SHOW = '(?:show|organi[sz]e|reorgani[sz]e|put|lay(?: it| this| that| everything)? out|lay|turn|arrange|view|see|display|draw|make|restructure|present|sort|structure|map)';
const ART = '(?:a |an |the |my |this )?';

export interface ViewRequest {
  lens: LensId;
  /** the words they used for it, for the reply */
  called: string;
}

export function readViewRequest(text: unknown): ViewRequest | null {
  if (typeof text !== 'string') return null;
  const t = text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  if (!t || t.length > 160) return null;
  // a question about something is not a request to see it
  if (/^(what|why|how|who|when|where|is|are|does|do|can a|could a)\b/.test(t) && !/^(can|could|would) you\b/.test(t)) return null;
  for (const { lens, names } of NAMES) {
    for (const name of names) {
      const n = esc(name);
      const after = `(?:\\s+(?:view|lens|form|shape|instead|please))*\\s*(?:please)?[.!]?$`;
      const patterns = [
        // "show this as a structure", "organize everything into a mind map"
        new RegExp(`\\b${SHOW}\\b[^.?!]{0,48}?\\b(?:as|into|in(?:to)?)\\s+${ART}${n}\\b`),
        // "switch to the outline", "go back to the mind map view"
        new RegExp(`\\b(?:switch|go|change|flip|move)(?: back)?(?: over)? to ${ART}${n}${after}`),
        // "show me the structure", "open the timeline", "let me see the plot"
        new RegExp(`^(?:(?:can|could|would) you |please |now )?(?:show|open|let me see)(?: me| us)? ${ART}${n}${after}`),
        // "the outline please", "mind map view"
        new RegExp(`^${ART}${n}(?:\\s+(?:view|lens))?(?:\\s+please)?[.!]?$`),
      ];
      if (patterns.some((p) => p.test(t))) return { lens, called: name };
    }
  }
  return null;
}

/** What Socria says when it turns the view, in place of a reply. */
export function viewSaid(lens: LensId): string {
  switch (lens) {
    case 'structure':
      return 'Here it is as a structure — every part under what it serves, with what it rests on and what pulls against it.';
    case 'graph':
      return 'Here it is as a mind map — everything and how it connects.';
    case 'plot':
      return 'Here is the plot.';
    case 'flow':
      return 'Here it is as a flow — what happens, in order, and where it branches.';
    case 'timeline':
      return 'Here it is on a timeline.';
    case 'matrix':
      return 'Here it is as a table — each option against what matters.';
    case 'tensions':
      return 'Here are the tensions — what pulls against what.';
    case 'evidence':
      return 'Here is what each belief rests on.';
    default:
      return 'Here it is.';
  }
}
