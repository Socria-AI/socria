// lib/ux-v0/structure.ts — how different two designs are in STRUCTURE, not only in colour and type.
//
// Three directions that differ only in tokens (a palette, a pairing) look like
// one template recoloured. This measures what the template would not change:
// which parts the design has, in what order (what leads), and how each part
// is laid out. It is what the benchmark's diversity check reports
// (test/browser/ux-v0/overhaul-bench.mjs), next to the token distance.
//
//   structuralDistance  0 (the same structure) … 1 (nothing in common): half
//                       the edit distance between the sequences of parts, half
//                       the share of shared parts laid out differently
//   tokenDistance       0 … 1: palette roles that differ, and the type pairing

import type { DesignSpec } from './spec';

/** The parts that frame a page rather than say anything: left out of the comparison. */
const FRAME = new Set(['nav', 'app-nav', 'footer', 'app-header']);

/** A design's structure: its parts in order, each as kind/variant. */
export function structureOf(spec: Pick<DesignSpec, 'sections'>): string[] {
  return spec.sections.filter((s) => !FRAME.has(s.kind)).map((s) => `${s.kind}/${s.variant}`);
}

function editDistance(a: readonly string[], b: readonly string[]): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function structuralDistance(a: Pick<DesignSpec, 'sections'>, b: Pick<DesignSpec, 'sections'>): number {
  const sa = structureOf(a);
  const sb = structureOf(b);
  if (!sa.length && !sb.length) return 0;
  const kinds = (s: string[]) => s.map((x) => x.split('/')[0]);
  const order = editDistance(kinds(sa), kinds(sb)) / Math.max(sa.length, sb.length);
  // of the kinds both have, how many are laid out differently (first of each kind against first of each kind)
  const firstOf = (s: string[]) => new Map(s.map((x) => [x.split('/')[0], x.split('/')[1]] as const).reverse());
  const fa = firstOf(sa);
  const fb = firstOf(sb);
  const shared = [...fa.keys()].filter((k) => fb.has(k));
  const layout = shared.length ? shared.filter((k) => fa.get(k) !== fb.get(k)).length / shared.length : 1;
  return Math.round((0.5 * order + 0.5 * layout) * 1000) / 1000;
}

export function tokenDistance(a: Pick<DesignSpec, 'tokens'>, b: Pick<DesignSpec, 'tokens'>): number {
  const roles = ['background', 'surface', 'text', 'accent'] as const;
  const colours = roles.filter((r) => String((a.tokens.colors as any)[r]).toLowerCase() !== String((b.tokens.colors as any)[r]).toLowerCase()).length / roles.length;
  const type = (a.tokens.fonts.display !== b.tokens.fonts.display ? 0.5 : 0) + (a.tokens.fonts.body !== b.tokens.fonts.body ? 0.5 : 0);
  return Math.round((0.6 * colours + 0.4 * type) * 1000) / 1000;
}

/** Every pair's distances, and the closest pair: how different a set of designs really is. */
export function diversityOf(specs: readonly Pick<DesignSpec, 'sections' | 'tokens'>[]): { pairs: { a: number; b: number; structure: number; tokens: number }[]; minStructure: number; minTokens: number } {
  const pairs: { a: number; b: number; structure: number; tokens: number }[] = [];
  for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) pairs.push({ a: i, b: j, structure: structuralDistance(specs[i], specs[j]), tokens: tokenDistance(specs[i], specs[j]) });
  return { pairs, minStructure: pairs.length ? Math.min(...pairs.map((p) => p.structure)) : 0, minTokens: pairs.length ? Math.min(...pairs.map((p) => p.tokens)) : 0 };
}
