// lib/ux-v0/structure.ts — how different two designs are in STRUCTURE, not only in colour and type.
//
// Three directions that differ only in tokens (a palette, a pairing) look like
// one template recoloured. This measures what the template would not change:
// which parts the design has, in what order (what leads), how each part is laid
// out (its variant), and how that layout is set (its shape: which side, what
// proportion, how its parts are shown). It is what the benchmarks' diversity
// checks report (test/browser/ux-v0/overhaul-bench.mjs, layout-bench.mjs), next
// to the token distance.
//
//   structuralDistance  0 (the same structure) … 1 (nothing in common): half
//                       the edit distance between the sequences of parts, half
//                       how differently the parts both designs have are laid out
//   tokenDistance       0 … 1: palette roles that differ, and the type pairing

import { shapeSignature, type DesignSpec, type Section } from './spec';
import { composeSignature, type Piece } from './compose';

/** The parts that frame a page rather than say anything: left out of the comparison. */
const FRAME = new Set(['nav', 'app-nav', 'footer', 'app-header']);

type Part = Pick<Section, 'kind' | 'variant'> & Partial<Pick<Section, 'shape' | 'content'>>;

/**
 * A design's structure: its parts in order, each as kind/variant, with the shape it draws in brackets; a
 * composed section by the arrangement of its pieces (lib/ux-v0/compose.ts), proportions included.
 */
export function structureOf(spec: { sections: readonly Part[] }): string[] {
  return spec.sections
    .filter((s) => !FRAME.has(s.kind))
    .map((s) => {
      if (s.kind === 'compose' && s.content?.root) return `compose/${composeSignature(s.content.root as Piece)}`;
      const sig = shapeSignature(s.kind, s.variant, s.shape);
      return `${s.kind}/${s.variant}${sig ? `[${sig}]` : ''}`;
    });
}

function editDistance(a: readonly string[], b: readonly string[]): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** How differently one part is laid out in two designs: 1 for another variant, else the share of its settings that differ. */
function partDistance(a: string, b: string): number {
  const [va, sa = ''] = a.split('[');
  const [vb, sb = ''] = b.split('[');
  if (va !== vb) return 1;
  const pa = new Map(sa.replace(/\]$/, '').split(',').filter(Boolean).map((x) => x.split('=') as [string, string]));
  const pb = new Map(sb.replace(/\]$/, '').split(',').filter(Boolean).map((x) => x.split('=') as [string, string]));
  const keys = new Set([...pa.keys(), ...pb.keys()]);
  if (!keys.size) return 0;
  return [...keys].filter((k) => pa.get(k) !== pb.get(k)).length / keys.size;
}

export function structuralDistance(a: { sections: readonly Part[] }, b: { sections: readonly Part[] }): number {
  const sa = structureOf(a);
  const sb = structureOf(b);
  if (!sa.length && !sb.length) return 0;
  const kinds = (s: string[]) => s.map((x) => x.split('/')[0]);
  const order = editDistance(kinds(sa), kinds(sb)) / Math.max(sa.length, sb.length);
  // of the kinds both have, how differently each is laid out (first of each kind against first of each kind)
  const firstOf = (s: string[]) => new Map(s.map((x) => [x.split('/')[0], x.slice(x.indexOf('/') + 1)] as const).reverse());
  const fa = firstOf(sa);
  const fb = firstOf(sb);
  const shared = [...fa.keys()].filter((k) => fb.has(k));
  const layout = shared.length ? shared.reduce((t, k) => t + partDistance(fa.get(k)!, fb.get(k)!), 0) / shared.length : 1;
  return Math.round((0.5 * order + 0.5 * layout) * 1000) / 1000;
}

export function tokenDistance(a: Pick<DesignSpec, 'tokens'>, b: Pick<DesignSpec, 'tokens'>): number {
  const roles = ['background', 'surface', 'text', 'accent'] as const;
  const colours = roles.filter((r) => String((a.tokens.colors as any)[r]).toLowerCase() !== String((b.tokens.colors as any)[r]).toLowerCase()).length / roles.length;
  const type = (a.tokens.fonts.display !== b.tokens.fonts.display ? 0.5 : 0) + (a.tokens.fonts.body !== b.tokens.fonts.body ? 0.5 : 0);
  return Math.round((0.6 * colours + 0.4 * type) * 1000) / 1000;
}

/** Every pair's distances, and the closest pair: how different a set of designs really is. */
export function diversityOf(specs: readonly ({ sections: readonly Part[] } & Pick<DesignSpec, 'tokens'>)[]): { pairs: { a: number; b: number; structure: number; tokens: number }[]; minStructure: number; minTokens: number } {
  const pairs: { a: number; b: number; structure: number; tokens: number }[] = [];
  for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) pairs.push({ a: i, b: j, structure: structuralDistance(specs[i], specs[j]), tokens: tokenDistance(specs[i], specs[j]) });
  return { pairs, minStructure: pairs.length ? Math.min(...pairs.map((p) => p.structure)) : 0, minTokens: pairs.length ? Math.min(...pairs.map((p) => p.tokens)) : 0 };
}
