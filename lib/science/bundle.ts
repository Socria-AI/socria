// lib/science/bundle.ts
//
// A RESEARCH BUNDLE: everything needed to check a result, in one export.
//
//   tables      each as CSV, with its schema, its provenance (source,
//               licence, retrieval date, version) and its content digest
//   results     each value with its origin (observed / derived / modeled /
//               imputed / simulated), its method, its parameters and its
//               uncertainty — or the explicit statement that it has none
//   assumptions everything taken as given, in words
//   caveats     carried from every input: generalised coordinates stay
//               generalised, a licence stays attached
//   manifest    sha256 of every file, so a reader can tell the bundle they
//               hold is the one that was exported
//
// Deterministic: the same inputs give the same bytes (keys sorted, no clock —
// the export time is whatever the caller passes).
//
// PURE.

import { sha256, type Provenance } from './provenance';
import { toCSV, type Cell, type Schema } from './table';

export interface BundleTable {
  name: string;
  schema: Schema;
  columns: string[];
  rows: readonly Record<string, Cell>[];
  provenance: Provenance;
}

export interface BundleResult {
  name: string;
  value: number | string | boolean | null;
  unit?: string;
  provenance: Provenance;
  /** an interval, a standard error, or the words saying there is none */
  uncertainty: { low: number; high: number; level: number } | { se: number } | { none: string };
}

export interface Bundle {
  files: { path: string; text: string; sha256: string }[];
  manifest: string;
}

function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])]));
  return v;
}
const json = (v: unknown) => JSON.stringify(sorted(v), null, 2) + '\n';

export function exportBundle(input: {
  title: string;
  exportedAt: string;
  tables: readonly BundleTable[];
  results: readonly BundleResult[];
  assumptions: readonly string[];
}): Bundle {
  const files: Bundle['files'] = [];
  const add = (path: string, text: string) => files.push({ path, text, sha256: sha256(text) });
  for (const t of input.tables) {
    add(`data/${t.name}.csv`, toCSV(t.columns, t.rows) + '\n');
    add(`data/${t.name}.schema.json`, json(t.schema));
    add(`data/${t.name}.provenance.json`, json(t.provenance));
  }
  add('results.json', json(input.results));
  const caveats = [...new Set([...input.tables.flatMap((t) => t.provenance.caveats ?? []), ...input.results.flatMap((r) => r.provenance.caveats ?? [])])].sort();
  const licences = input.tables
    .map((t) => ({ table: t.name, source: t.provenance.source?.name ?? null, licence: t.provenance.source?.license ?? 'not recorded', origin: t.provenance.origin }))
    .sort((a, b) => a.table.localeCompare(b.table));
  const simulated = [...input.tables.filter((t) => t.provenance.origin === 'simulated').map((t) => t.name), ...input.results.filter((r) => r.provenance.origin === 'simulated').map((r) => r.name)];
  add('README.json', json({
    title: input.title,
    exportedAt: input.exportedAt,
    assumptions: [...input.assumptions],
    caveats,
    licences,
    simulated: simulated.length ? { note: 'These are simulated, not observations.', items: simulated } : null,
  }));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = files.map((f) => `${f.sha256}  ${f.path}`).join('\n') + '\n';
  return { files, manifest };
}
