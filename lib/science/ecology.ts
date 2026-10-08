// lib/science/ecology.ts
//
// COUNTING WHAT WAS LOOKED FOR, not what happened to be reported.
//
// Records reflect where people went and how long they looked as much as what
// lives there. Everything here keeps effort in view:
//
//   reportingRate     among COMPLETE checklists only, the share that report a
//                     taxon, with a Wilson interval. An incomplete checklist
//                     cannot establish a non-detection, so it is excluded —
//                     and the number excluded is returned.
//   ratePerEffort     counts per unit effort (birds per hour, per km) over
//                     checklists with both a count and the effort recorded;
//                     a presence without a count ('X') is set aside, not 0
//   matchedComparison two groups (two months, two regions) compared within
//                     effort strata only, and combined by direct
//                     standardisation — so "more checklists in May" cannot
//                     masquerade as "more birds in May". A stratum seen in
//                     only one group is dropped from the comparison, and said.
//   richness          observed richness, Chao2 (a lower bound for the number
//                     of taxa present from incidence data), and the expected
//                     richness of a smaller sample (rarefaction) — the curve
//                     that shows how much of "this site is richer" is just
//                     "this site was visited more"
//
// Nothing here knows what a bird is: a checklist is a sampling event with a
// protocol, an effort and a list of what it recorded.
//
// PURE.

import { normalQuantile } from './special';

export interface SamplingEvent {
  id: string;
  /** every taxon detected was reported (the eBird 'complete checklist' flag) */
  complete: boolean;
  /** effort in the caller's unit — minutes, hours, km; null when not recorded */
  effort: number | null;
  /** a protocol name, for stratifying: 'stationary', 'traveling'… */
  protocol?: string | null;
  /** taxon id → count; null for present-but-not-counted */
  records: Readonly<Record<string, number | null>>;
}

export interface Proportion {
  k: number;
  n: number;
  estimate: number | null;
  low: number | null;
  high: number | null;
}

/** k of n, with a Wilson score interval (good at small n and near 0 or 1). */
export function wilson(k: number, n: number, level = 0.95): Proportion {
  if (n <= 0) return { k, n, estimate: null, low: null, high: null };
  const z = normalQuantile(1 - (1 - level) / 2);
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  // at the edges the interval's end is exact: none seen is a lower bound of 0, all seen an upper bound of 1
  return { k, n, estimate: p, low: k === 0 ? 0 : Math.max(0, centre - half), high: k === n ? 1 : Math.min(1, centre + half) };
}

export function reportingRate(events: readonly SamplingEvent[], taxon: string, level = 0.95) {
  const complete = events.filter((e) => e.complete);
  const k = complete.filter((e) => taxon in e.records).length;
  return { ...wilson(k, complete.length, level), excludedIncomplete: events.length - complete.length };
}

export function ratePerEffort(events: readonly SamplingEvent[], taxon: string) {
  let count = 0, effort = 0, used = 0, noEffort = 0, uncounted = 0;
  for (const e of events) {
    if (!(typeof e.effort === 'number' && e.effort > 0)) {
      noEffort++;
      continue;
    }
    if (!e.complete && !(taxon in e.records)) continue; // an absence on an incomplete list is not a zero
    const c = e.records[taxon];
    if (c === null) {
      uncounted++;
      continue;
    }
    count += c ?? 0;
    effort += e.effort;
    used++;
  }
  return { rate: effort > 0 ? count / effort : null, count, effort, events: used, excluded: { noEffort, uncounted } };
}

export interface Stratum {
  key: string;
  a: Proportion;
  b: Proportion;
}

/**
 * Reporting rates of `taxon` in two groups, compared within effort strata
 * (effort bins × protocol) and combined with weights proportional to the
 * strata's combined sizes. Only complete events with recorded effort enter.
 */
export function matchedComparison(
  a: readonly SamplingEvent[],
  b: readonly SamplingEvent[],
  taxon: string,
  opts: { effortBreaks: readonly number[]; byProtocol?: boolean }
) {
  const breaks = [...opts.effortBreaks].sort((x, y) => x - y);
  const keyOf = (e: SamplingEvent) => {
    if (!e.complete || !(typeof e.effort === 'number' && e.effort > 0)) return null;
    let bin = 0;
    while (bin < breaks.length && e.effort >= breaks[bin]) bin++;
    return `${bin}${opts.byProtocol ? '|' + (e.protocol ?? '?') : ''}`;
  };
  const tally = (events: readonly SamplingEvent[]) => {
    const m = new Map<string, { k: number; n: number }>();
    for (const e of events) {
      const key = keyOf(e);
      if (key === null) continue;
      const t = m.get(key) ?? { k: 0, n: 0 };
      t.n++;
      if (taxon in e.records) t.k++;
      m.set(key, t);
    }
    return m;
  };
  const ta = tally(a), tb = tally(b);
  const strata: Stratum[] = [];
  const dropped: string[] = [];
  for (const key of new Set([...ta.keys(), ...tb.keys()])) {
    const x = ta.get(key), y = tb.get(key);
    if (!x || !y) {
      dropped.push(key);
      continue;
    }
    strata.push({ key, a: wilson(x.k, x.n), b: wilson(y.k, y.n) });
  }
  strata.sort((p, q) => p.key.localeCompare(q.key));
  const W = strata.reduce((s, t) => s + t.a.n + t.b.n, 0);
  let ra = 0, rb = 0, varDiff = 0;
  for (const t of strata) {
    const w = (t.a.n + t.b.n) / W;
    const pa = t.a.k / t.a.n, pb = t.b.k / t.b.n;
    ra += w * pa;
    rb += w * pb;
    varDiff += w * w * ((pa * (1 - pa)) / t.a.n + (pb * (1 - pb)) / t.b.n);
  }
  const z = normalQuantile(0.975);
  const crude = (events: readonly SamplingEvent[]) => {
    const c = events.filter((e) => e.complete);
    return c.length ? c.filter((e) => taxon in e.records).length / c.length : null;
  };
  return {
    strata,
    droppedStrata: dropped,
    standardized: strata.length ? { a: ra, b: rb, difference: rb - ra, low: rb - ra - z * Math.sqrt(varDiff), high: rb - ra + z * Math.sqrt(varDiff) } : null,
    crude: { a: crude(a), b: crude(b) },
  };
}

/** Incidence: in how many sampling units each taxon was recorded. */
export function incidence(units: readonly (readonly string[])[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of units) for (const t of new Set(u)) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/**
 * Richness from incidence data over m sampling units: observed, Chao2 (with
 * the bias-corrected form when no taxon was seen exactly twice), and the
 * expected richness of k units drawn without replacement (rarefaction).
 */
export function richness(units: readonly (readonly string[])[]) {
  const m = units.length;
  const inc = incidence(units);
  const observed = inc.size;
  let q1 = 0, q2 = 0;
  for (const d of inc.values()) {
    if (d === 1) q1++;
    else if (d === 2) q2++;
  }
  const f = m > 0 ? (m - 1) / m : 0;
  const chao2 = q2 > 0 ? observed + (f * q1 * q1) / (2 * q2) : observed + (f * q1 * (q1 - 1)) / 2;
  const rarefied = (k: number) => {
    if (k <= 0) return 0;
    if (k >= m) return observed;
    let s = 0;
    for (const d of inc.values()) s += 1 - Math.exp(logChoose(m - d, k) - logChoose(m, k));
    return s;
  };
  return { units: m, observed, uniques: q1, duplicates: q2, chao2, rarefied };
}
