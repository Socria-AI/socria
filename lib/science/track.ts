// lib/science/track.ts
//
// A MOVING THING'S TRACK: fixes in time and space, and what can honestly be
// said about the path between them.
//
//   steps       consecutive fixes paired: distance, elapsed time, speed,
//               bearing, turn. A non-positive Δt (a duplicate, a clock that
//               went backwards) yields no speed — it is flagged, not divided by.
//   flags       speeds above a stated limit are flagged for review, never
//               deleted: the limit is the caller's, because "implausible"
//               depends on what is moving
//   summary     displacement, path length, duration, speeds over valid steps
//   stopovers   runs of fixes staying within a radius for at least a duration.
//               The answer depends on the sampling rate and on both
//               thresholds; all three are returned with it.
//   resample    a regular grid of times: an exact fix where there is one,
//               linear interpolation between fixes no further apart than a
//               stated gap, and NOTHING across a larger gap. Every point says
//               whether it was observed or interpolated.
//
// Times are ms UTC; positions decimal degrees; distances metres; speeds m/s.
//
// PURE.

import { bearing, distance, haversine, type LatLon } from './geo';

export interface Fix extends LatLon {
  /** ms UTC */
  t: number;
  alt?: number | null;
  /** horizontal accuracy of the fix, metres, where the sensor reports one */
  accuracy?: number | null;
}

export interface Step {
  from: number;
  to: number;
  meters: number;
  dtS: number;
  /** null when dt ≤ 0 */
  speed: number | null;
  bearing: number;
  /** change in heading from the previous step, degrees in (−180, 180]; null for the first */
  turn: number | null;
  flag?: 'nonpositive_dt' | 'implausible_speed';
}

/** Fixes in time order. Stable: equal times keep their input order (and become a nonpositive_dt step). */
export function inTimeOrder<F extends Fix>(fixes: readonly F[]): F[] {
  return fixes.map((f, i) => [f, i] as const).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map(([f]) => f);
}

export function steps(fixes: readonly Fix[], opts: { maxSpeed?: number } = {}): Step[] {
  const out: Step[] = [];
  let prevBearing: number | null = null;
  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1], b = fixes[i];
    const meters = distance(a, b).meters;
    const dtS = (b.t - a.t) / 1000;
    const br = bearing(a, b);
    let flag: Step['flag'];
    let speed: number | null = null;
    if (!(dtS > 0)) flag = 'nonpositive_dt';
    else {
      speed = meters / dtS;
      if (opts.maxSpeed !== undefined && speed > opts.maxSpeed) flag = 'implausible_speed';
    }
    let turn: number | null = null;
    if (prevBearing !== null && meters > 0) {
      turn = ((br - prevBearing + 540) % 360) - 180;
      if (turn === -180) turn = 180;
    }
    if (meters > 0) prevBearing = br;
    out.push({ from: i - 1, to: i, meters, dtS, speed, bearing: br, turn, ...(flag ? { flag } : {}) });
  }
  return out;
}

export interface TrackSummary {
  fixes: number;
  durationS: number;
  /** first fix to last, straight */
  displacementM: number;
  /** the sum of step lengths */
  pathM: number;
  /** displacement / path: 1 is a straight line */
  straightness: number | null;
  maxSpeed: number | null;
  meanSpeed: number | null;
  flagged: { nonpositiveDt: number; implausibleSpeed: number };
}

/** Summary over valid steps: a flagged step's speed is excluded, its length is not (the bird still got there). */
export function summarize(fixes: readonly Fix[], opts: { maxSpeed?: number } = {}): TrackSummary {
  const st = steps(fixes, opts);
  const valid = st.filter((s) => s.speed !== null && s.flag !== 'implausible_speed');
  const pathM = st.reduce((s, x) => s + x.meters, 0);
  const displacementM = fixes.length > 1 ? distance(fixes[0], fixes[fixes.length - 1]).meters : 0;
  const durationS = fixes.length > 1 ? (fixes[fixes.length - 1].t - fixes[0].t) / 1000 : 0;
  const validTime = valid.reduce((s, x) => s + x.dtS, 0);
  return {
    fixes: fixes.length,
    durationS,
    displacementM,
    pathM,
    straightness: pathM > 0 ? displacementM / pathM : null,
    maxSpeed: valid.length ? Math.max(...valid.map((s) => s.speed!)) : null,
    meanSpeed: validTime > 0 ? valid.reduce((s, x) => s + x.meters, 0) / validTime : null,
    flagged: {
      nonpositiveDt: st.filter((s) => s.flag === 'nonpositive_dt').length,
      implausibleSpeed: st.filter((s) => s.flag === 'implausible_speed').length,
    },
  };
}

export interface Stopover {
  first: number;
  last: number;
  start: number;
  end: number;
  durationS: number;
  centre: LatLon;
  fixes: number;
}

/**
 * Stopovers: maximal runs of consecutive fixes that all lie within `radiusM`
 * of the run's running centre, lasting at least `minDurationMs`. A run is cut
 * by any gap longer than `maxGapMs` (default: no limit) — absence of fixes is
 * not evidence of staying.
 */
export function stopovers(
  fixes: readonly Fix[],
  opts: { radiusM: number; minDurationMs: number; maxGapMs?: number }
): { stopovers: Stopover[]; assumptions: { radiusM: number; minDurationMs: number; maxGapMs: number | null; medianIntervalS: number | null } } {
  const out: Stopover[] = [];
  const maxGap = opts.maxGapMs ?? Infinity;
  let i = 0;
  while (i < fixes.length) {
    let latSum = fixes[i].lat, lonSum = fixes[i].lon, n = 1;
    let j = i + 1;
    for (; j < fixes.length; j++) {
      if (fixes[j].t - fixes[j - 1].t > maxGap) break;
      const centre = { lat: latSum / n, lon: lonSum / n };
      if (haversine(centre, fixes[j]) > opts.radiusM) break;
      latSum += fixes[j].lat;
      lonSum += fixes[j].lon;
      n++;
    }
    const last = j - 1;
    const dur = fixes[last].t - fixes[i].t;
    if (last > i && dur >= opts.minDurationMs) {
      out.push({ first: i, last, start: fixes[i].t, end: fixes[last].t, durationS: dur / 1000, centre: { lat: latSum / n, lon: lonSum / n }, fixes: n });
      i = j;
    } else i++;
  }
  const gaps = fixes.slice(1).map((f, k) => (f.t - fixes[k].t) / 1000).filter((g) => g > 0).sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
  return { stopovers: out, assumptions: { radiusM: opts.radiusM, minDurationMs: opts.minDurationMs, maxGapMs: Number.isFinite(maxGap) ? maxGap : null, medianIntervalS: median } };
}

export interface Resampled extends LatLon {
  t: number;
  observed: boolean;
}

/**
 * The track at every `stepMs` from the first fix to the last. Each point is an
 * exact fix (observed), a straight-line interpolation between two fixes at
 * most `maxGapMs` apart (not observed), or absent — across a larger gap the
 * path is unknown and is left so.
 */
export function resample(fixes: readonly Fix[], stepMs: number, maxGapMs: number): { points: Resampled[]; skippedGaps: { from: number; to: number }[] } {
  if (!(stepMs > 0)) throw new Error('stepMs must be positive');
  const points: Resampled[] = [];
  const skippedGaps: { from: number; to: number }[] = [];
  if (fixes.length === 0) return { points, skippedGaps };
  let k = 0;
  for (let t = fixes[0].t; t <= fixes[fixes.length - 1].t; t += stepMs) {
    while (k < fixes.length - 2 && fixes[k + 1].t < t) k++;
    const a = fixes[k], b = fixes[Math.min(k + 1, fixes.length - 1)];
    if (a.t === t) {
      points.push({ lat: a.lat, lon: a.lon, t, observed: true });
      continue;
    }
    if (b.t === t) {
      points.push({ lat: b.lat, lon: b.lon, t, observed: true });
      continue;
    }
    if (b.t - a.t > maxGapMs) {
      if (!skippedGaps.length || skippedGaps[skippedGaps.length - 1].from !== a.t) skippedGaps.push({ from: a.t, to: b.t });
      continue;
    }
    const u = (t - a.t) / (b.t - a.t);
    points.push({ lat: a.lat + u * (b.lat - a.lat), lon: a.lon + u * (b.lon - a.lon), t, observed: false });
  }
  return { points, skippedGaps };
}
