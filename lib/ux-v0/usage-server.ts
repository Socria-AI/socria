import 'server-only';
// lib/ux-v0/usage-server.ts — what SocriaUX v0 spends, per person, per project, per day.
//
// Every model call's tokens and price (lib/ux-v0/model.ts usageOf) are added to
// one row per (person, project, UTC day) in ux_v0_usage, through the database
// function bump_ux_v0_usage so two calls at once cannot lose each other's
// count. Before a call, the person's day is summed and checked against the
// daily caps (SOCRIAUX_DAILY_CALLS, SOCRIAUX_DAILY_GENERATIONS). The weekly
// token allowance (lib/sleep-server.ts) and the rate limit apply on top.
//
// A deployment without the table (schema.sql not re-run) neither blocks nor
// fails a call: the caps then rest on the allowance and the rate limit, and
// the spend is still in the logs (lib/openai-usage.ts).

import { supabaseAdmin } from '../supabase';
import { dailyCaps } from './model';
import type { CallKind, Usage } from './types';

export const USAGE_TABLE = 'ux_v0_usage';

export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export async function underCaps(userId: string, kind: CallKind, now = Date.now()): Promise<{ ok: true } | { ok: false; error: string }> {
  const caps = dailyCaps();
  try {
    const { data, error } = await supabaseAdmin().from(USAGE_TABLE).select('calls, generations').eq('user_id', userId).eq('day', dayKey(now));
    if (error || !data) return { ok: true };
    const calls = data.reduce((s: number, r: any) => s + (Number(r.calls) || 0), 0);
    const generations = data.reduce((s: number, r: any) => s + (Number(r.generations) || 0), 0);
    if (calls >= caps.calls) return { ok: false, error: `That is today’s SocriaUX limit (${caps.calls} requests). It resets at midnight UTC; your work is saved.` };
    if (kind === 'generate' && generations >= caps.generations) return { ok: false, error: `That is today’s limit for generating designs (${caps.generations}). Changes to the current design still work.` };
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export async function recordUsage(userId: string, projectId: string, kind: CallKind, u: Usage, now = Date.now()): Promise<void> {
  const project = projectId.slice(0, 96) || 'unknown';
  try {
    const db = supabaseAdmin();
    const { error } = await db.rpc('bump_ux_v0_usage', {
      p_user: userId,
      p_project: project,
      p_day: dayKey(now),
      p_calls: 1,
      p_generations: kind === 'generate' ? 1 : 0,
      p_input: u.input,
      p_output: u.output,
      p_cost: u.cost ?? 0,
      p_at: now,
    });
    if (error) console.warn('[ux-v0] usage not recorded:', error.message);
  } catch (e) {
    console.warn('[ux-v0] usage not recorded:', e instanceof Error ? e.message : e);
  }
}
