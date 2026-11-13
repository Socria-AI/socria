// lib/logos6/measure.ts — LOGOS 6, READ BACK (pure). The page is app/dev/logos6; the reads are
// lib/logos6/measure-server.ts.
//
// Two measures from docs/LOGOS-6-PLAN.md §7:
//
//   USE        the first-party counts of the Logos 6 events (lib/product-event-kinds.ts), summed over a
//              window by key, with each arm beside the total while a feature test runs.
//
//   RETURN     voluntary return (H4): of the trial accounts whose seven days are over, how many came back
//              on two or more of days 2 to 7 of their own accord — a day with a turn, when no lifecycle
//              email went to them that day or the day before. By the week the trial began and, while the
//              challenge test runs, by arm.
//
// Neither names anybody. The return measure is given account ids by its reader so it can join a person's
// days to their emails; what it returns is counts and shares, and the ids go no further than this file.

const DAY = 86_400_000;
const dayStart = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const iso = (t: number) => new Date(dayStart(t)).toISOString().slice(0, 10);

// ── use ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EventCountRow {
  /** 'YYYY-MM-DD' (UTC) */
  day: string;
  event: string;
  kind: string;
  n: number;
}

export interface KeyCount {
  kind: string;
  n: number;
  control: number;
  treatment: number;
}

export interface UseModel {
  /** the first day counted, 'YYYY-MM-DD' */
  since: string;
  /** by event: its total, and each key with its arms */
  events: Record<string, { total: number; keys: KeyCount[] }>;
  /** any count carried an arm: a feature test ran in the window */
  armed: boolean;
}

/**
 * The window's counts, by event and key. An event's total is the sum of its first key family (each event
 * counts one key per occurrence in its first family — `from:` for a door, `outcome:` for a result), so the
 * total is occurrences, not keys.
 */
export function useModel(rows: readonly EventCountRow[], now: number, days = 28): UseModel {
  const since = iso(now - (days - 1) * DAY);
  const events: UseModel['events'] = {};
  let armed = false;
  const keyOf = new Map<string, KeyCount>();
  for (const r of rows) {
    if (!r || typeof r.day !== 'string' || r.day < since || typeof r.event !== 'string' || typeof r.kind !== 'string') continue;
    const n = Number.isFinite(r.n) ? Math.max(0, r.n) : 0;
    if (!n) continue;
    const m = /^(.*)\|arm:(control|treatment)$/.exec(r.kind);
    const base = m ? m[1] : r.kind;
    const id = `${r.event}\u0000${base}`;
    let k = keyOf.get(id);
    if (!k) {
      k = { kind: base, n: 0, control: 0, treatment: 0 };
      keyOf.set(id, k);
      (events[r.event] ??= { total: 0, keys: [] }).keys.push(k);
    }
    if (m) {
      armed = true;
      k[m[2] as 'control' | 'treatment'] += n;
    } else k.n += n;
  }
  for (const [ev, e] of Object.entries(events)) {
    e.keys.sort((a, b) => b.n - a.n || a.kind.localeCompare(b.kind));
    const once = occurrence(ev);
    e.total = e.keys.filter((k) => once(k.kind)).reduce((s, k) => s + k.n, 0);
  }
  return { since, events, armed };
}

/** Which of an event's keys is counted exactly once each time it happens, so they sum to its occurrences. */
function occurrence(event: string): (kind: string) => boolean {
  // one `kind:action` key per finding acted on; one `a>b` key per move between levels
  if (event === 'finding_action') return () => true;
  if (event === 'level_changed') return (k) => k.includes('>');
  const prefer: Record<string, string> = {
    challenge_requested: 'from:',
    challenge_shown: 'outcome:',
    focus_opened: 'from:',
    idea_opened: 'from:',
    conversation_opened: 'from:',
    evidence_opened: 'from:',
    simpler_deeper: 'which:',
    source_check: 'outcome:',
    compare_run: 'outcome:',
    explain_back: 'outcome:',
    guess_first: 'outcome:',
    one_checkout_context: 'cap:',
    idea_added: 'any',
  };
  const fam = prefer[event];
  return fam ? (k) => k.startsWith(fam) : () => true;
}

// ── voluntary return ────────────────────────────────────────────────────────────────────────────────────────────

export interface ReturnInputs {
  /** each trial's start, by account */
  starts: readonly { user: string; at: number }[];
  /** the UTC days each account had a turn on ('YYYY-MM-DD') */
  active: readonly { user: string; day: string }[];
  /** lifecycle emails sent, by account, ms */
  emails: readonly { user: string; at: number }[];
  /** the arm of the running challenge test, when one runs */
  armOf?: (user: string) => 'control' | 'treatment' | null;
  now: number;
}

export interface ReturnRow {
  /** the Monday of the week the trials began, 'YYYY-MM-DD' */
  cohort: string;
  arm: 'all' | 'control' | 'treatment';
  /** trials begun in the week */
  begun: number;
  /** of those, trials whose seventh day is over — the base of every share */
  complete: number;
  /** complete trials with two or more voluntary return days in days 2–7 */
  returned: number;
  /** returned ÷ complete, or null with none complete */
  share: number | null;
  /** the mean number of voluntary return days in days 2–7, over complete trials */
  meanDays: number | null;
}

export interface ReturnModel {
  rows: ReturnRow[];
  overall: ReturnRow;
  /** a day counted as prompted, because an email went that day or the day before — not voluntary */
  prompted: number;
}

const mondayOf = (t: number) => {
  const d = dayStart(t);
  const wd = (new Date(d).getUTCDay() + 6) % 7; // Monday 0
  return iso(d - wd * DAY);
};

/** Voluntary return over days 2–7 of the trial, by week begun and arm. */
export function returnModel(x: ReturnInputs): ReturnModel {
  const daysOf = new Map<string, Set<number>>();
  for (const a of x.active) {
    if (!a || typeof a.user !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.day)) continue;
    const t = Date.parse(`${a.day}T00:00:00Z`);
    if (!Number.isFinite(t)) continue;
    (daysOf.get(a.user) ?? daysOf.set(a.user, new Set()).get(a.user)!).add(t);
  }
  const mailDays = new Map<string, Set<number>>();
  for (const e of x.emails) {
    if (!e || typeof e.user !== 'string' || !Number.isFinite(e.at)) continue;
    (mailDays.get(e.user) ?? mailDays.set(e.user, new Set()).get(e.user)!).add(dayStart(e.at));
  }
  let prompted = 0;
  type Acc = { begun: number; complete: number; returned: number; days: number };
  const acc = new Map<string, Acc>();
  const bump = (key: string, complete: boolean, voluntary: number) => {
    const a = acc.get(key) ?? { begun: 0, complete: 0, returned: 0, days: 0 };
    a.begun++;
    if (complete) {
      a.complete++;
      a.days += voluntary;
      if (voluntary >= 2) a.returned++;
    }
    acc.set(key, a);
  };
  const seen = new Set<string>();
  for (const s of x.starts) {
    if (!s || typeof s.user !== 'string' || !Number.isFinite(s.at) || seen.has(s.user)) continue;
    seen.add(s.user);
    const d1 = dayStart(s.at);
    // the seventh day is over when the eighth has begun
    const complete = x.now >= d1 + 7 * DAY;
    let voluntary = 0;
    const days = daysOf.get(s.user);
    const mails = mailDays.get(s.user);
    for (let k = 1; k <= 6; k++) {
      const day = d1 + k * DAY;
      if (!days?.has(day)) continue;
      if (mails && (mails.has(day) || mails.has(day - DAY))) {
        prompted++;
        continue;
      }
      voluntary++;
    }
    const cohort = mondayOf(s.at);
    const arm = x.armOf?.(s.user) ?? null;
    bump(`${cohort}|all`, complete, voluntary);
    bump('*|all', complete, voluntary);
    if (arm) {
      bump(`${cohort}|${arm}`, complete, voluntary);
      bump(`*|${arm}`, complete, voluntary);
    }
  }
  const rowOf = (key: string, a: Acc): ReturnRow => {
    const [cohort, arm] = key.split('|') as [string, ReturnRow['arm']];
    return {
      cohort,
      arm,
      begun: a.begun,
      complete: a.complete,
      returned: a.returned,
      share: a.complete ? a.returned / a.complete : null,
      meanDays: a.complete ? a.days / a.complete : null,
    };
  };
  const rows = [...acc.entries()]
    .filter(([k]) => !k.startsWith('*|'))
    .map(([k, a]) => rowOf(k, a))
    .sort((p, q) => q.cohort.localeCompare(p.cohort) || p.arm.localeCompare(q.arm));
  const all = acc.get('*|all');
  const overall = all ? rowOf('*|all', all) : { cohort: '*', arm: 'all' as const, begun: 0, complete: 0, returned: 0, share: null, meanDays: null };
  // the arms' overall rows, after the weekly ones, when a test ran
  for (const arm of ['control', 'treatment'] as const) {
    const a = acc.get(`*|${arm}`);
    if (a) rows.push(rowOf(`*|${arm}`, a));
  }
  return { rows, overall, prompted };
}
