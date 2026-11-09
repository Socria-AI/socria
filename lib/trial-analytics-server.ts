import 'server-only';
// lib/trial-analytics-server.ts — the reads behind app/dev/trial (lib/trial-analytics.ts counts them).
// Three narrow reads of the usage table, each paged and capped: the day counts (no person in them), the
// trial days' tokens (summed here; the account ids are never kept) and the trial starts (only the time).

import { supabaseAdmin } from './supabase';
import { DAY_COUNTER, START_COUNTER, START_SCOPE, startFromStored } from './trial';
import { METRICS_USER } from './trial-server';
import type { MetricRow, TrialInputs } from './trial-analytics';

const PAGE = 1000;
const CAP = 200_000;

async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>): Promise<{ rows: T[]; error?: string }> {
  const rows: T[] = [];
  for (let from = 0; from < CAP; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) return { rows, error: String(error.message ?? 'read failed').slice(0, 160) };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows };
}

export async function collectTrial(now = Date.now()): Promise<{ inputs: TrialInputs; errors: string[] }> {
  const db = supabaseAdmin();
  const errors: string[] = [];
  const m = await pages<{ scope: string; counter: string; n: number; updated_at: number }>((a, b) =>
    db.from('logos_usage').select('scope, counter, n, updated_at').eq('user_id', METRICS_USER).range(a, b)
  );
  if (m.error) errors.push(`counts: ${m.error}`);
  const t = await pages<{ scope: string; n: number }>((a, b) => db.from('logos_usage').select('scope, n').eq('counter', DAY_COUNTER).like('scope', 'tday:%').range(a, b));
  if (t.error) errors.push(`tokens: ${t.error}`);
  const s = await pages<{ n: number }>((a, b) => db.from('logos_usage').select('n').eq('scope', START_SCOPE).eq('counter', START_COUNTER).range(a, b));
  if (s.error) errors.push(`starts: ${s.error}`);
  const tokensByDay: Record<string, number> = {};
  for (const r of t.rows) tokensByDay[r.scope] = (tokensByDay[r.scope] ?? 0) + (typeof r.n === 'number' ? r.n : 0);
  const metrics: MetricRow[] = m.rows.map((r) => ({ scope: r.scope, counter: r.counter, n: r.n, at: Number(r.updated_at) || now }));
  const starts = s.rows.map((r) => startFromStored(r.n)).filter((x): x is number => x !== null);
  return { inputs: { metrics, tokensByDay, starts, now }, errors };
}
