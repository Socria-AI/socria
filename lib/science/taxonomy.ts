// lib/science/taxonomy.ts
//
// NAMES ARE NOT TAXA. A taxonomy is versioned; a name can be accepted in one
// version, a synonym in the next, and split across two taxa in a third. So:
//
//   resolveName   a name, in a stated taxonomy version, to exactly one taxon —
//                 or to 'ambiguous' with every candidate, or 'unknown'.
//                 It never picks between candidates, and never merges two
//                 taxa because their names look alike.
//   tallyByTaxon  counts gathered per resolved taxon id, with everything that
//                 did not resolve kept aside and named — not dropped, not
//                 guessed into a bucket
//   versionChanges  names whose resolution differs between two versions
//                 (splits, lumps, renames), so a trend across a taxonomy
//                 update is not read as a change in the birds
//
// Matching folds case, spacing and diacritics; nothing fuzzier. A misspelling
// is resolved only through a synonym entry someone wrote down.
//
// PURE.

export interface Taxon {
  taxon_id: string;
  scientific_name: string;
  common_name?: string | null;
  authority?: string | null;
  taxonomic_rank?: string | null;
  parent_taxon_id?: string | null;
  source_version: string;
}

export interface Synonym {
  name: string;
  taxon_id: string;
  source_version: string;
  kind?: 'synonym' | 'common' | 'misspelling' | 'legacy';
}

export interface Taxonomy {
  taxa: readonly Taxon[];
  synonyms?: readonly Synonym[];
}

export type Resolution =
  | { status: 'accepted' | 'synonym' | 'common'; taxon_id: string; version: string; via: string }
  | { status: 'ambiguous'; candidates: string[]; version: string; via: string }
  | { status: 'unknown'; version: string; via: string };

export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function resolveName(name: string, tx: Taxonomy, version: string): Resolution {
  const key = foldName(name);
  const taxa = tx.taxa.filter((t) => t.source_version === version);
  const sci = taxa.filter((t) => foldName(t.scientific_name) === key);
  const common = taxa.filter((t) => t.common_name && foldName(t.common_name) === key);
  const syn = (tx.synonyms ?? []).filter((s) => s.source_version === version && foldName(s.name) === key);
  const ids = new Set<string>([...sci.map((t) => t.taxon_id), ...common.map((t) => t.taxon_id), ...syn.map((s) => s.taxon_id)]);
  if (ids.size === 0) return { status: 'unknown', version, via: key };
  if (ids.size > 1) return { status: 'ambiguous', candidates: [...ids].sort(), version, via: key };
  const id = [...ids][0];
  const status = sci.length ? 'accepted' : common.length ? 'common' : 'synonym';
  return { status, taxon_id: id, version, via: key };
}

/** Counts per taxon id; names that did not resolve to exactly one taxon are returned with their counts, untouched. */
export function tallyByTaxon(records: readonly { name: string; count: number | null }[], tx: Taxonomy, version: string) {
  const byTaxon = new Map<string, { count: number; uncounted: number; names: Set<string> }>();
  const unresolved: { name: string; count: number | null; resolution: Resolution }[] = [];
  for (const r of records) {
    const res = resolveName(r.name, tx, version);
    if (res.status === 'unknown' || res.status === 'ambiguous') {
      unresolved.push({ name: r.name, count: r.count, resolution: res });
      continue;
    }
    const t = byTaxon.get(res.taxon_id) ?? { count: 0, uncounted: 0, names: new Set<string>() };
    if (r.count === null) t.uncounted++;
    else t.count += r.count;
    t.names.add(r.name);
    byTaxon.set(res.taxon_id, t);
  }
  return {
    taxa: [...byTaxon.entries()].map(([taxon_id, t]) => ({ taxon_id, count: t.count, uncounted: t.uncounted, names: [...t.names].sort() })).sort((a, b) => a.taxon_id.localeCompare(b.taxon_id)),
    unresolved,
  };
}

/** Names whose resolution differs between two versions. */
export function versionChanges(names: readonly string[], tx: Taxonomy, from: string, to: string) {
  const out: { name: string; before: Resolution; after: Resolution; change: 'renamed' | 'split' | 'lumped' | 'appeared' | 'disappeared' }[] = [];
  for (const n of names) {
    const a = resolveName(n, tx, from), b = resolveName(n, tx, to);
    const ida = a.status === 'ambiguous' ? a.candidates.join('|') : 'taxon_id' in a ? a.taxon_id : '';
    const idb = b.status === 'ambiguous' ? b.candidates.join('|') : 'taxon_id' in b ? b.taxon_id : '';
    if (ida === idb) continue;
    const change =
      a.status === 'unknown' ? 'appeared' : b.status === 'unknown' ? 'disappeared' : b.status === 'ambiguous' && a.status !== 'ambiguous' ? 'split' : a.status === 'ambiguous' && b.status !== 'ambiguous' ? 'lumped' : 'renamed';
    out.push({ name: n, before: a, after: b, change });
  }
  return out;
}
