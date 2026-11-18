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
//
// BUDGETS AND ROUTING. gate() is what every route asks before its model call:
// the daily counts, then what this person has spent today and this month and
// this project in all, held against the budgets (lib/ux-v0/budget.ts) with
// the call's worst-case estimate. It answers with the route to use (a premium
// call moves to the economy model when a budget would not hold it) or a plain
// refusal. Each call is also written to ux_v0_calls (stage, tier, model,
// effort, measured tokens and cost) for cost by stage; without that table,
// the totals above are still kept.

import { supabaseAdmin } from '../supabase';
import { budgets, decide, type Spent } from './budget';
import { dailyCaps, routeFor, type Route, type Tier } from './model';
import type { CallKind, Usage } from './types';

export const USAGE_TABLE = 'ux_v0_usage';
export const CALLS_TABLE = 'ux_v0_calls';

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

/** What this person has spent today and this month, and this project in all (US$, measured). */
export async function spentFor(userId: string, projectId: string, now = Date.now()): Promise<Spent> {
  const today = dayKey(now);
  const project = projectId.slice(0, 96) || 'unknown';
  try {
    const db = supabaseAdmin();
    const [month, own] = await Promise.all([
      db.from(USAGE_TABLE).select('day, cost_usd').eq('user_id', userId).gte('day', `${today.slice(0, 7)}-01`),
      db.from(USAGE_TABLE).select('cost_usd').eq('user_id', userId).eq('project_id', project),
    ]);
    const sum = (rows: any[] | null | undefined, keep: (r: any) => boolean = () => true) => (rows ?? []).filter(keep).reduce((t, r) => t + (Number(r.cost_usd) || 0), 0);
    return {
      day: month.error ? 0 : sum(month.data, (r) => r.day === today),
      month: month.error ? 0 : sum(month.data),
      project: own.error ? 0 : sum(own.data),
    };
  } catch {
    return { day: 0, month: 0, project: 0 };
  }
}

export type Gate = { ok: true; route: Route; downgraded: string | null; warning: string | null } | { ok: false; error: string };

/**
 * Before a model call: the daily counts, then the budgets with this call's worst case. Answers with the
 * route to use, or why not. `inputChars` is the prompt's length (system and user), for the estimate.
 */
export async function gate(userId: string, projectId: string, stage: CallKind, inputChars: number, want: { tier?: Tier } = {}, now = Date.now()): Promise<Gate> {
  const caps = await underCaps(userId, stage, now);
  if (!caps.ok) return caps;
  const route = routeFor(stage, want);
  const d = decide(route, inputChars, await spentFor(userId, projectId, now), budgets());
  if (!d.ok) return d;
  if (d.downgraded) console.info('[ux-v0] %s: %s', stage, d.downgraded);
  return { ok: true, route: d.route, downgraded: d.downgraded, warning: d.warning };
}

/** What the designer is told about this call's model and budget, if anything: said, never hidden. */
export function noticeOf(g: { downgraded: string | null; warning: string | null }, asked: { fellBack?: string }): { notice?: string } {
  const n = [g.downgraded, asked.fellBack, g.warning].filter(Boolean).join(' ');
  return n ? { notice: n } : {};
}

let callsTableMissing = false;

export async function recordUsage(userId: string, projectId: string, kind: CallKind, u: Usage, now = Date.now(), extra: { api?: string; downgraded?: boolean } = {}): Promise<void> {
  const project = projectId.slice(0, 96) || 'unknown';
  if (!callsTableMissing) {
    try {
      const { error } = await supabaseAdmin()
        .from(CALLS_TABLE)
        .insert({
          user_id: userId,
          project_id: project,
          at: now,
          day: dayKey(now),
          stage: u.stage ?? kind,
          tier: u.tier ?? 'economy',
          model: u.model,
          api: extra.api ?? 'chat',
          effort: u.effort ?? 'default',
          input_tokens: u.input,
          cached_tokens: u.cached,
          output_tokens: u.output,
          cost_usd: u.cost,
          downgraded: extra.downgraded === true,
        });
      if (error) {
        // the table not made yet (schema.sql not re-run): said once, then the totals alone
        if (/does not exist|relation|schema cache/i.test(error.message)) callsTableMissing = true;
        console.warn('[ux-v0] call not logged:', error.message);
      }
    } catch (e) {
      console.warn('[ux-v0] call not logged:', e instanceof Error ? e.message : e);
    }
  }
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
