// lib/ux-v0/explore.ts — Explore Directions: how the directions differ, said row by row, and checked.
//
// Three directions are only worth comparing if they are different designs, not one design in three colours. Each
// direction is read for the six things a studio compares — its layout system, its typography, its composition, its
// identity, its interaction and its motion — as a short phrase and a key; a row whose keys all differ is a real
// difference. Two directions that differ in nothing but identity (colour and surfaces) are near-identical, and
// the engine's output is checked for that (test/ux-v0.test.mjs, test/browser/ux-v0/dna-bench.mjs).

import { hslOf, isDark } from './color';
import type { ArtDirection } from './direction';
import { dnaDistance, dnaWord, DNA_CORE, DNA_META, type CreativeDNA, type DnaKey, type DnaVector } from './dna';
import { knownFont } from './fonts';

export const DIFFERENCE_ROWS = ['layout', 'typography', 'composition', 'identity', 'interaction', 'motion'] as const;
export type DifferenceRow = (typeof DIFFERENCE_ROWS)[number];

export const DIFFERENCE_LABEL: Record<DifferenceRow, string> = {
  layout: 'Layout system',
  typography: 'Typography',
  composition: 'Composition',
  identity: 'Identity',
  interaction: 'Interaction',
  motion: 'Motion',
};

export interface DifferenceCell {
  /** what decides sameness: two cells with one key are the same choice */
  key: string;
  /** the choice, in a short phrase */
  says: string;
}

const GRID_SAYS: Record<string, string> = { stack: 'a single stacked column', editorial: 'an editorial side column', swiss: 'strict columns', centered: 'a centred axis', asymmetric: 'an asymmetric grid', poster: 'a poster grid', modular: 'modular cells' };
const OPENING_SAYS: Record<string, string> = { split: 'opens beside a picture', centered: 'opens centred', 'full-bleed': 'opens on a full-bleed picture', editorial: 'opens like a magazine page', statement: 'opens on a typographic statement', poster: 'opens on poster-scale type' };
const BOOKING_SAYS: Record<string, string> = { strip: 'a strip of days', calendar: 'a month calendar', list: 'a list of times', split: 'the booking beside the offer', immersive: 'the booking over a full picture' };
const HOVER_SAYS: Record<string, string> = { none: 'no hover', lift: 'lifts on hover', underline: 'underlines on hover', invert: 'inverts on hover', zoom: 'pictures zoom on hover' };

/** The name of a hue, roughly, for saying what an accent is. */
export function hueName(hex: string): string {
  const [h, s, l] = hslOf(hex);
  if (s < 0.12) return l < 0.25 ? 'black' : l > 0.8 ? 'white' : 'grey';
  const names: [number, string][] = [[15, 'red'], [40, 'orange'], [62, 'ochre'], [85, 'yellow-green'], [150, 'green'], [190, 'teal'], [230, 'blue'], [260, 'indigo'], [300, 'violet'], [335, 'magenta'], [360, 'red']];
  return names.find(([max]) => h < max)?.[1] ?? 'red';
}

/** A direction read for the six things a studio compares. */
export function differenceProfile(d: ArtDirection): Record<DifferenceRow, DifferenceCell> {
  const L = d.look;
  const t = d.tokens;
  const display = knownFont(t.fonts.display);
  const serif = display?.kind === 'serif';
  const opening = d.compose?.hero ?? (d.compose?.booking ? `booking:${d.compose.booking}` : '');
  const ratio = L.ratio >= 1.5 ? 'dramatic' : L.ratio >= 1.36 ? 'pronounced' : L.ratio >= 1.26 ? 'balanced' : 'quiet';
  const m = L.motion;
  const [h] = hslOf(t.colors.accent);
  const motif = L.motifs.find((x) => x !== 'captions');
  return {
    layout: { key: `${L.grid}|${d.plan ?? ''}`, says: `${GRID_SAYS[L.grid] ?? L.grid}${d.compose?.booking ? `, ${BOOKING_SAYS[d.compose.booking] ?? d.compose.booking}` : ''}` },
    typography: { key: `${t.fonts.display}|${ratio}|${L.case}`, says: `${t.fonts.display} (${serif ? 'serif' : display?.kind === 'mono' ? 'mono' : 'sans'}) over ${t.fonts.body}; a ${ratio} scale${L.case === 'upper' ? ', in capitals' : ''}` },
    composition: { key: `${opening}|${L.rhythm}|${L.align}|${d.lead ?? ''}`, says: `${opening.startsWith('booking:') ? `leads with ${BOOKING_SAYS[opening.slice(8)] ?? 'the booking'}` : OPENING_SAYS[opening] ?? 'opens on its task'}; ${L.rhythm} rhythm${L.align === 'center' ? ', centred' : ''}` },
    identity: { key: `${isDark(t.colors.background) ? 'dark' : 'light'}|${Math.round(h / 30)}|${L.containers}|${motif ?? ''}`, says: `${isDark(t.colors.background) ? 'a dark ground' : 'a light ground'}, ${hueName(t.colors.accent)} accent, ${L.containers} surfaces${motif ? `, ${motif.replace('-', ' ')}` : ''}` },
    interaction: { key: `${L.buttons}|${m.hover}`, says: `${L.buttons} buttons, ${HOVER_SAYS[m.hover] ?? m.hover}` },
    motion: { key: `${m.feel}|${m.headline}|${m.parallax > 0 ? 'p' : ''}`, says: `${m.feel}${m.headline !== 'none' ? `, the headline ${m.headline === 'words' ? 'word by word' : m.headline === 'letters' ? 'letter by letter' : m.headline === 'mask' ? 'through a mask' : 'fading in'}` : ''}${m.parallax > 0 ? ', parallax' : ''}` },
  };
}

export interface Comparison {
  rows: { row: DifferenceRow; label: string; cells: DifferenceCell[]; distinct: boolean }[];
  /** rows where every direction made its own choice */
  distinctRows: number;
  pairs: { a: number; b: number; differ: DifferenceRow[]; dna: number }[];
  /** two directions that are nearly one design: they differ in at most one aspect besides identity (colour and surfaces) */
  nearIdentical: [number, number][];
}

/** The directions side by side: each row, whether all differ, and every pair's differences. */
export function compareDirections(ds: readonly ArtDirection[]): Comparison {
  const profiles = ds.map(differenceProfile);
  const rows = DIFFERENCE_ROWS.map((row) => {
    const cells = profiles.map((p) => p[row]);
    return { row, label: DIFFERENCE_LABEL[row], cells, distinct: cells.length > 1 && new Set(cells.map((c) => c.key)).size === cells.length };
  });
  const pairs: Comparison['pairs'] = [];
  const nearIdentical: [number, number][] = [];
  for (let a = 0; a < ds.length; a++)
    for (let b = a + 1; b < ds.length; b++) {
      const differ = DIFFERENCE_ROWS.filter((r) => profiles[a][r].key !== profiles[b][r].key);
      pairs.push({ a, b, differ, dna: Math.round(dnaDistance(ds[a].dna, ds[b].dna) * 100) / 100 });
      if (differ.filter((r) => r !== 'identity').length <= 1) nearIdentical.push([a, b]);
    }
  return { rows, distinctRows: rows.filter((r) => r.distinct).length, pairs, nearIdentical };
}

/** Where a direction's DNA departs from the project's, the largest first: what it explores. */
export function dnaDelta(own: DnaVector | undefined, project: DnaVector | undefined, min = 8): { key: DnaKey; from: number; to: number; says: string }[] {
  if (!own || !project) return [];
  return DNA_CORE.filter((k) => typeof own[k] === 'number' && typeof project[k] === 'number' && Math.abs((own[k] as number) - (project[k] as number)) >= min)
    .map((k) => ({ key: k, from: project[k] as number, to: own[k] as number, says: `${DNA_META[k].label}: ${dnaWord(k, own[k] as number).toLowerCase()} (${(own[k] as number) > (project[k] as number) ? '+' : '−'}${Math.abs((own[k] as number) - (project[k] as number))})` }))
    .sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from));
}

/**
 * Why an aspect the directions share is shared, when it is the designer's own doing: a design system, a group kept in
 * the art direction, a dimension set or locked in the Creative DNA, what leads as the brief decided. An aspect shared
 * for none of these reasons is SocriaUX's to vary, and gets no reason.
 */
export function sharedBecause(c: Comparison, o: { locks: readonly string[]; dna?: CreativeDNA | null; system?: boolean; decided?: { lead?: string; arrangement?: string } | null }): Partial<Record<DifferenceRow, string>> {
  const out: Partial<Record<DifferenceRow, string>> = {};
  const kept = (g: string) => o.locks.includes(g);
  const fixed = (k: DnaKey) => !!o.dna?.dims[k] && (o.dna.dims[k]!.locked || o.dna.dims[k]!.source === 'designer');
  const set = (k: DnaKey) => (o.dna?.dims[k]?.locked ? `the ${DNA_META[k].label.toLowerCase()} you locked` : `the ${DNA_META[k].label.toLowerCase()} you set`);
  for (const r of c.rows) {
    if (r.distinct) continue;
    const why: string[] = [];
    if (r.row === 'layout' || r.row === 'composition') {
      if (kept('layout')) why.push('the layout you kept');
      if (fixed('composition')) why.push(set('composition'));
      if (o.decided?.lead || o.decided?.arrangement) why.push('what leads, as your brief decided');
    } else if (r.row === 'typography') {
      if (o.system) why.push('your design system');
      else if (kept('type')) why.push('the type you kept');
      if (fixed('typography')) why.push(set('typography'));
    } else if (r.row === 'identity') {
      if (o.system) why.push('your design system');
      else {
        if (kept('palette')) why.push('the colours you kept');
        if (kept('surface')) why.push('the surfaces you kept');
      }
      if (fixed('restraint')) why.push(set('restraint'));
    } else if (r.row === 'interaction') {
      if (o.system || kept('surface')) why.push(o.system ? 'your design system' : 'the surfaces you kept');
      if (kept('motion')) why.push('the motion you kept');
      if (fixed('interaction')) why.push(set('interaction'));
    } else if (r.row === 'motion') {
      if (kept('motion')) why.push('the motion you kept');
      if (fixed('motion')) why.push(set('motion'));
    }
    if (why.length) out[r.row] = [...new Set(why)].join(', ');
  }
  return out;
}
