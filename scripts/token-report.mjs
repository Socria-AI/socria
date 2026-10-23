#!/usr/bin/env node
// scripts/token-report.mjs — what the model calls cost, from the logs.
//
//   node scripts/token-report.mjs < exported-logs.txt
//   node scripts/token-report.mjs logs-1.txt logs-2.txt
//
// Reads the `[tokens] {…}` lines lib/openai-usage.ts writes (one per model
// call) and totals them by route: how many calls, the tokens read, how many of
// those the provider served from its prompt cache, and the tokens written.
// A cache share that stays near zero on a route whose prompt is long is the
// thing to look at first.

import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
const text = files.length ? files.map((f) => readFileSync(f, 'utf8')).join('\n') : readFileSync(0, 'utf8');

const by = new Map();
for (const line of text.split('\n')) {
  const at = line.indexOf('[tokens] ');
  if (at < 0) continue;
  let row;
  try {
    row = JSON.parse(line.slice(at + 9).trim());
  } catch {
    continue;
  }
  const r = by.get(row.route) ?? { calls: 0, in: 0, cached: 0, out: 0 };
  r.calls++;
  r.in += Number(row.in) || 0;
  r.cached += Number(row.cached) || 0;
  r.out += Number(row.out) || 0;
  by.set(row.route, r);
}

if (!by.size) {
  console.log('No [tokens] lines found.');
  process.exit(0);
}

const rows = [...by.entries()].sort((a, b) => b[1].in + b[1].out - (a[1].in + a[1].out));
const total = rows.reduce((t, [, r]) => ({ calls: t.calls + r.calls, in: t.in + r.in, cached: t.cached + r.cached, out: t.out + r.out }), { calls: 0, in: 0, cached: 0, out: 0 });
const n = (v) => v.toLocaleString('en-US');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const table = [['route', 'calls', 'in', 'cached', 'cache share', 'out', 'in per call'], ...rows.map(([route, r]) => [route, n(r.calls), n(r.in), n(r.cached), pct(r.cached, r.in), n(r.out), n(Math.round(r.in / r.calls))]), ['total', n(total.calls), n(total.in), n(total.cached), pct(total.cached, total.in), n(total.out), n(Math.round(total.in / total.calls))]];
const widths = table[0].map((_, k) => Math.max(...table.map((row) => String(row[k]).length)));
for (const [k, row] of table.entries()) {
  console.log(row.map((cell, j) => (j === 0 ? String(cell).padEnd(widths[j]) : String(cell).padStart(widths[j]))).join('  '));
  if (k === 0 || k === table.length - 2) console.log(widths.map((w) => '-'.repeat(w)).join('  '));
}
