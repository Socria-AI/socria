import 'server-only';
// lib/logos6/measure-server.ts — the reads behind app/dev/logos6 (lib/logos6/measure.ts counts them).
//
// Four narrow reads, each paged and capped: this environment's first-party counts of the Logos 6 events
// (no person in them), every trial's start, the days each trial account had a turn (its 'tday:' rows) and
// the lifecycle emails sent. The last three carry account ids, which the return measure needs to join a
// person's days to their emails; they are read here, handed to the pure model, and never leave this file —
// what the page receives is counts and shares.
import { supabaseAdmin } from '../supabase';
import { currentEnv } from '../environment';
import { dayOf } from '../product-event-kinds';
import { DAY_COUNTER, START_COUNTER, START_SCOPE, startFromStored } from '../trial';
import { L6_EVENTS } from './vocab';
import { armIn, runningExperiments } from './arms-server';
import { returnModel, useModel, type EventCountRow, type ReturnModel, type UseModel } from './measure';

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

export interface L6Measures {
  use: UseModel;
  ret: ReturnModel;
  /** the feature tests running here (LOGOS6_EXPERIMENTS) */
  running: string[];
  errors: string[];
}

export async function collectL6(now = Date.now(), windowDays = 28): Promise<L6Measures> {
  const db = supabaseAdmin();
  const errors: string[] = [];
  const env = currentEnv();
  const since = dayOf(now - windowDays * 86_400_000);

  const ev = await pages<{ day: string; event: string; kind: string; n: number }>((a, b) =>
    db.from('product_events').select('day, event, kind, n').eq('env', env).in('event', [...L6_EVENTS]).gte('day', since).range(a, b)
  );
  if (ev.error) errors.push(`events: ${ev.error}`);

  const st = await pages<{ user_id: string; n: number }>((a, b) =>
    db.from('logos_usage').select('user_id, n').eq('scope', START_SCOPE).eq('counter', START_COUNTER).range(a, b)
  );
  if (st.error) errors.push(`trial starts: ${st.error}`);

  const td = await pages<{ user_id: string; scope: string; n: number }>((a, b) =>
    db.from('logos_usage').select('user_id, scope, n').eq('counter', DAY_COUNTER).like('scope', 'tday:%').gt('n', 0).range(a, b)
  );
  if (td.error) errors.push(`trial days: ${td.error}`);

  const em = await pages<{ user_id: string; sent_at: number | null }>((a, b) =>
    db.from('lifecycle_emails').select('user_id, sent_at').not('sent_at', 'is', null).range(a, b)
  );
  if (em.error) errors.push(`emails: ${em.error}`);

  const rows: EventCountRow[] = ev.rows.map((r) => ({ day: String(r.day), event: String(r.event), kind: String(r.kind ?? ''), n: Number(r.n) || 0 }));
  const running = runningExperiments();
  const challengeTest = running.find((x) => x.id === 'l6-challenge');
  const ret = returnModel({
    starts: st.rows.flatMap((r) => {
      const at = startFromStored(r.n);
      return at !== null && typeof r.user_id === 'string' ? [{ user: r.user_id, at }] : [];
    }),
    active: td.rows.flatMap((r) => (typeof r.user_id === 'string' && typeof r.scope === 'string' ? [{ user: r.user_id, day: r.scope.slice(5) }] : [])),
    emails: em.rows.flatMap((r) => (typeof r.user_id === 'string' && Number.isFinite(Number(r.sent_at)) ? [{ user: r.user_id, at: Number(r.sent_at) }] : [])),
    ...(challengeTest ? { armOf: (u: string) => armIn(challengeTest, u) } : {}),
    now,
  });
  return { use: useModel(rows, now, windowDays), ret, running: running.map((x) => x.id), errors };
}
