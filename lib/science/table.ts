// lib/science/table.ts
//
// A TABLE THAT KNOWS WHAT IT HOLDS: rows read against a schema, with every
// problem said rather than smoothed over.
//
// The rules that matter more than the parsing:
//
//   • MISSING IS NOT ZERO. An empty field, or a token the source uses for "not
//     recorded" ('NA', 'null', '-'…), is null. A count of 0 is a count of 0 —
//     a complete checklist that saw none — and the two are never conflated.
//   • A VALUE OUTSIDE ITS DOMAIN REJECTS THE ROW, with the reason kept beside
//     it: a latitude of 123 is not a bird seen near the pole, and quietly
//     clamping it would invent one. Nothing rejected is silently dropped.
//   • TIME IS UTC, OR IT IS SAID THAT IT ISN'T. A timestamp with a zone
//     (Z, +02:00) is converted. One without is ambiguous: rejected, unless the
//     column's spec says how to read it, in which case the assumption travels
//     as a caveat.
//   • A REPEATED KEY IS A DUPLICATE: the first row stands, the later ones are
//     rejected and named.
//
// RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside
// quotes, CRLF, a byte-order mark.
//
// PURE.

import { fingerprint, type Provenance } from './provenance';

export type ColumnKind = 'number' | 'integer' | 'text' | 'category' | 'datetime' | 'boolean';
export type Cell = number | string | boolean | null;

export interface ColumnSpec {
  name: string;
  kind: ColumnKind;
  /** the unit the values are in, as written: 'm', 'Hz', 'mm', 'degC' */
  unit?: string;
  /** a row without it is rejected */
  required?: boolean;
  /** inclusive bounds for numbers */
  min?: number;
  max?: number;
  /** allowed values for a category */
  values?: readonly string[];
  /** for a datetime without a zone: read it as UTC, and say so */
  assumeUtc?: boolean;
  /** what it is, for a reader */
  describe?: string;
}

export interface Schema {
  name: string;
  columns: readonly ColumnSpec[];
  /** columns that together identify a row */
  key?: readonly string[];
  /** the rule the source's own documentation insists on, kept with the schema */
  rule?: string;
}

export type IssueKind =
  | 'missing_column'
  | 'unknown_column'
  | 'ragged_row'
  | 'missing_required'
  | 'not_a_number'
  | 'not_an_integer'
  | 'out_of_range'
  | 'not_allowed'
  | 'bad_datetime'
  | 'ambiguous_timezone'
  | 'bad_boolean'
  | 'duplicate_key';

export interface Issue {
  /** 1-based data row (the header is row 0); 0 for the table as a whole */
  row: number;
  column?: string;
  kind: IssueKind;
  value?: string;
  message: string;
}

export interface Table {
  schema: Schema;
  columns: string[];
  rows: Record<string, Cell>[];
  /** the data row each kept row came from, 1-based */
  sourceRow: number[];
  rejected: { row: number; raw: string[]; issues: Issue[] }[];
  /** problems with the table itself, and notes that did not reject anything */
  issues: Issue[];
  provenance: Provenance;
  /** sha256 of the kept rows in canonical form */
  fingerprint: string;
}

/** Tokens that mean "not recorded" in common sources. Compared case-insensitively, trimmed. */
export const MISSING_TOKENS: readonly string[] = ['', 'na', 'n/a', 'nan', 'null', 'none', '-', '—', '?'];

/** RFC 4180 CSV into rows of strings. A trailing newline does not make an empty row. */
export function parseCSV(text: string, delimiter = ','): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows of values back to CSV, quoting only where a field needs it. */
export function toCSV(columns: readonly string[], rows: readonly Record<string, Cell>[]): string {
  const q = (v: Cell): string => {
    if (v === null || v === undefined) return '';
    const t = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [columns.map((c) => q(c)).join(','), ...rows.map((r) => columns.map((c) => q(r[c] ?? null)).join(','))].join('\n');
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * An ISO 8601 date or date-time as ms since the epoch, UTC.
 * Returns { ms, zoned } — `zoned` false when no zone was written — or null when it is not a date.
 * A date alone ('2026-05-14') is a day, read as midnight UTC, and is zoned by convention.
 */
export function parseUtc(raw: string): { ms: number; zoned: boolean } | null {
  const m = ISO.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, sec, frac, zone] = m;
  const Y = +y, M = +mo, D = +d;
  if (M < 1 || M > 12 || D < 1 || D > 31) return null;
  const H = h ? +h : 0, MI = mi ? +mi : 0, S = sec ? +sec : 0;
  if (H > 23 || MI > 59 || S > 60) return null;
  const ms = frac ? Math.round(+('0.' + frac) * 1000) : 0;
  let t = Date.UTC(Y, M - 1, D, H, MI, Math.min(S, 59), ms);
  // the calendar must agree: 2026-02-30 is not a date
  const back = new Date(t);
  if (back.getUTCFullYear() !== Y || back.getUTCMonth() !== M - 1 || back.getUTCDate() !== D) return null;
  if (zone && zone.toUpperCase() !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const off = sign * (+digits.slice(0, 2) * 60 + +digits.slice(2, 4));
    t -= off * 60_000;
  }
  return { ms: t, zoned: !!zone || !h };
}

function isMissing(raw: string): boolean {
  return MISSING_TOKENS.includes(raw.trim().toLowerCase());
}

function cellOf(spec: ColumnSpec, raw: string, row: number): { value: Cell; issue?: Issue; caveat?: string } {
  if (isMissing(raw)) {
    if (spec.required) return { value: null, issue: { row, column: spec.name, kind: 'missing_required', value: raw, message: `${spec.name} is required and was not recorded` } };
    return { value: null };
  }
  const t = raw.trim();
  switch (spec.kind) {
    case 'number':
    case 'integer': {
      const n = Number(t);
      if (!Number.isFinite(n) || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) {
        return { value: null, issue: { row, column: spec.name, kind: 'not_a_number', value: raw, message: `${spec.name}: "${raw}" is not a number` } };
      }
      if (spec.kind === 'integer' && !Number.isInteger(n)) {
        return { value: null, issue: { row, column: spec.name, kind: 'not_an_integer', value: raw, message: `${spec.name}: ${raw} is not a whole number` } };
      }
      if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
        const range = `${spec.min ?? '−∞'} to ${spec.max ?? '∞'}${spec.unit ? ' ' + spec.unit : ''}`;
        return { value: null, issue: { row, column: spec.name, kind: 'out_of_range', value: raw, message: `${spec.name}: ${raw} is outside ${range}` } };
      }
      return { value: n };
    }
    case 'boolean': {
      const l = t.toLowerCase();
      if (['true', 't', 'yes', 'y', '1'].includes(l)) return { value: true };
      if (['false', 'f', 'no', 'n', '0'].includes(l)) return { value: false };
      return { value: null, issue: { row, column: spec.name, kind: 'bad_boolean', value: raw, message: `${spec.name}: "${raw}" is not true or false` } };
    }
    case 'category': {
      if (spec.values && !spec.values.includes(t)) {
        return { value: null, issue: { row, column: spec.name, kind: 'not_allowed', value: raw, message: `${spec.name}: "${raw}" is not one of ${spec.values.join(', ')}` } };
      }
      return { value: t };
    }
    case 'datetime': {
      const p = parseUtc(t);
      if (!p) return { value: null, issue: { row, column: spec.name, kind: 'bad_datetime', value: raw, message: `${spec.name}: "${raw}" is not an ISO 8601 date-time` } };
      if (!p.zoned && !spec.assumeUtc) {
        return { value: null, issue: { row, column: spec.name, kind: 'ambiguous_timezone', value: raw, message: `${spec.name}: "${raw}" has no time zone; say how to read it` } };
      }
      return { value: p.ms, caveat: p.zoned ? undefined : `${spec.name} had no time zone and was read as UTC` };
    }
    default:
      return { value: t };
  }
}

/**
 * Read CSV text against a schema.
 *
 * Columns are matched by name, ignoring case and surrounding space. A column
 * the schema does not know is noted and carried as text; a required column
 * the file lacks fails every row, which is said once at the table level.
 */
export function readTable(text: string, schema: Schema, provenance: Provenance): Table {
  const grid = parseCSV(text);
  const issues: Issue[] = [];
  const header = (grid[0] ?? []).map((h) => h.trim());
  const norm = (s: string) => s.trim().toLowerCase();
  const at = new Map<string, number>();
  header.forEach((h, i) => at.set(norm(h), i));
  const known = new Set(schema.columns.map((c) => norm(c.name)));
  for (const c of schema.columns) {
    if (!at.has(norm(c.name)) && c.required) issues.push({ row: 0, column: c.name, kind: 'missing_column', message: `the file has no ${c.name} column` });
  }
  const extras = header.filter((h) => h && !known.has(norm(h)));
  for (const h of extras) issues.push({ row: 0, column: h, kind: 'unknown_column', message: `${h} is not in the ${schema.name} schema; kept as text` });

  const columns = [...schema.columns.map((c) => c.name), ...extras];
  const rows: Record<string, Cell>[] = [];
  const sourceRow: number[] = [];
  const rejected: Table['rejected'] = [];
  const seen = new Map<string, number>();
  const caveats = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r];
    if (raw.length === 1 && raw[0].trim() === '') continue; // a blank line
    const rowIssues: Issue[] = [];
    if (raw.length !== header.length) {
      rowIssues.push({ row: r, kind: 'ragged_row', message: `row ${r} has ${raw.length} fields; the header has ${header.length}` });
    }
    const out: Record<string, Cell> = {};
    for (const spec of schema.columns) {
      const i = at.get(norm(spec.name));
      const cellRaw = i === undefined ? '' : raw[i] ?? '';
      const { value, issue, caveat } = cellOf(spec, cellRaw, r);
      if (issue) rowIssues.push(issue);
      if (caveat) caveats.add(caveat);
      out[spec.name] = value;
    }
    for (const h of extras) out[h] = (raw[at.get(norm(h))!] ?? '').trim() || null;
    if (!rowIssues.length && schema.key?.length) {
      const k = JSON.stringify(schema.key.map((c) => out[c]));
      const first = seen.get(k);
      if (first !== undefined) {
        rowIssues.push({ row: r, kind: 'duplicate_key', value: schema.key.map((c) => String(out[c])).join(' / '), message: `row ${r} repeats the key of row ${first}` });
      } else seen.set(k, r);
    }
    if (rowIssues.length) rejected.push({ row: r, raw, issues: rowIssues });
    else {
      rows.push(out);
      sourceRow.push(r);
    }
  }
  const prov: Provenance = {
    ...provenance,
    ...(caveats.size ? { caveats: [...new Set([...(provenance.caveats ?? []), ...caveats])] } : {}),
  };
  const fp = fingerprint(columns, rows);
  return { schema, columns, rows, sourceRow, rejected, issues, provenance: { ...prov, inputs: [fp] }, fingerprint: fp };
}

/** One column's values, nulls kept as null — the caller decides what missing means for its question. */
export function column(t: Pick<Table, 'rows'>, name: string): Cell[] {
  return t.rows.map((r) => r[name] ?? null);
}

/** One column's numbers, with the rows that had none counted rather than read as zero. */
export function numbers(t: Pick<Table, 'rows'>, name: string): { values: number[]; missing: number } {
  const values: number[] = [];
  let missing = 0;
  for (const r of t.rows) {
    const v = r[name];
    if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    else missing++;
  }
  return { values, missing };
}
