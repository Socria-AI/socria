// lib/science/geo.ts
//
// POSITIONS ON THE EARTH, and the honest arithmetic on them.
//
//   haversine   great-circle distance on a sphere — fast, ~0.5% from the truth
//   vincenty    the geodesic on the WGS84 ellipsoid — sub-millimetre, and it
//               says when it fails to converge (nearly antipodal points)
//               instead of returning a number it does not have
//   bearing, destination, midpoint
//   generalize  snap a coordinate to a coarser grid, for sensitive records,
//               returning the uncertainty the snapping added — the original
//               is never recoverable from the result
//   spaceTimeJoin  attach the nearest covariate within BOTH a distance and a
//               time tolerance, or nothing, with the reason — never "the
//               nearest one, however far"
//   gridCells   aggregate records into lat/lon cells, effort alongside counts
//
// Coordinates are decimal degrees, WGS84; distances metres; times ms UTC.
// Nothing here knows what a bird is.
//
// PURE.

export interface LatLon {
  lat: number;
  lon: number;
}

/** Mean Earth radius (IUGG), metres. A choice, stated: the atlas asks that R be named. */
export const EARTH_RADIUS_M = 6_371_008.8;
/** WGS84 */
export const WGS84 = { a: 6_378_137, f: 1 / 298.257223563 } as const;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export type CoordinateProblem = 'not_finite' | 'lat_out_of_range' | 'lon_out_of_range' | 'null_island';

/** What is wrong with a coordinate, or null. (0, 0) is a valid place, and also the commonest typo — flagged, not rejected. */
export function coordinateProblem(p: Partial<LatLon> | null | undefined): CoordinateProblem | null {
  if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return 'not_finite';
  if (p.lat < -90 || p.lat > 90) return 'lat_out_of_range';
  if (p.lon < -180 || p.lon > 180) return 'lon_out_of_range';
  if (p.lat === 0 && p.lon === 0) return 'null_island';
  return null;
}

/** Great-circle distance on a sphere of radius R (metres). */
export function haversine(a: LatLon, b: LatLon, R = EARTH_RADIUS_M): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The geodesic distance on the WGS84 ellipsoid (Vincenty's inverse formula).
 * `converged` is false for nearly antipodal points, where the iteration does
 * not settle — the caller should then use haversine and say so.
 */
export function vincenty(a: LatLon, b: LatLon): { meters: number; converged: boolean; iterations: number } {
  const { a: A, f } = WGS84;
  const B = A * (1 - f);
  const L = rad(b.lon - a.lon);
  const U1 = Math.atan((1 - f) * Math.tan(rad(a.lat)));
  const U2 = Math.atan((1 - f) * Math.tan(rad(b.lat)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1), sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L;
  let iter = 0;
  let sinSigma = 0, cosSigma = 0, sigma = 0, cosSqAlpha = 0, cos2SigmaM = 0;
  for (; iter < 200; iter++) {
    const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinL) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosL) ** 2);
    if (sinSigma === 0) return { meters: 0, converged: true, iterations: iter }; // the same point
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0; // equatorial line
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const prev = lambda;
    lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
    if (Math.abs(lambda - prev) < 1e-12) {
      iter++;
      const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
      const Ak = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
      const Bk = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
      const dSigma =
        Bk * sinSigma * (cos2SigmaM + (Bk / 4) * (cosSigma * (-1 + 2 * cos2SigmaM ** 2) - (Bk / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
      return { meters: B * Ak * (sigma - dSigma), converged: true, iterations: iter };
    }
  }
  return { meters: NaN, converged: false, iterations: iter };
}

/** The geodesic where it converges, the sphere where it does not — and which one it was. */
export function distance(a: LatLon, b: LatLon): { meters: number; method: 'vincenty' | 'haversine' } {
  const v = vincenty(a, b);
  return v.converged ? { meters: v.meters, method: 'vincenty' } : { meters: haversine(a, b), method: 'haversine' };
}

/** Initial bearing from a to b, degrees clockwise from north, [0, 360). */
export function bearing(a: LatLon, b: LatLon): number {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δλ = rad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `meters` from p along `bearingDeg`, on the sphere. */
export function destination(p: LatLon, bearingDeg: number, meters: number, R = EARTH_RADIUS_M): LatLon {
  const δ = meters / R, θ = rad(bearingDeg), φ1 = rad(p.lat), λ1 = rad(p.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: deg(φ2), lon: ((deg(λ2) + 540) % 360) - 180 };
}

/**
 * A sensitive coordinate, generalised: snapped to the centre of a `cellDeg`
 * grid cell, with the uncertainty that adds (half the cell's diagonal at that
 * latitude, plus any uncertainty it already had). Deterministic, so the same
 * record always lands in the same cell — and the original is not recoverable.
 */
export function generalize(p: LatLon, cellDeg: number, priorUncertaintyM = 0): LatLon & { uncertaintyM: number; cellDeg: number } {
  if (!(cellDeg > 0)) throw new Error('cellDeg must be positive');
  const snap = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, (Math.floor(v / cellDeg) + 0.5) * cellDeg));
  const lat = snap(p.lat, -90 + cellDeg / 2, 90 - cellDeg / 2);
  const lon = snap(p.lon, -180 + cellDeg / 2, 180 - cellDeg / 2);
  const half = haversine({ lat: lat - cellDeg / 2, lon: lon - cellDeg / 2 }, { lat: lat + cellDeg / 2, lon: lon + cellDeg / 2 }) / 2;
  return { lat: +lat.toFixed(10), lon: +lon.toFixed(10), uncertaintyM: Math.round(half + priorUncertaintyM), cellDeg };
}

export interface Located extends LatLon {
  /** ms UTC */
  t: number;
}

export type JoinMiss = 'none_in_time' | 'none_in_distance' | 'no_covariates';

/**
 * Each event joined to the covariate nearest in time among those within
 * `maxDistanceM` and `maxDtMs` of it — or to nothing, with which tolerance
 * failed. Ties in time go to the nearer in space.
 */
export function spaceTimeJoin<E extends Located, C extends Located>(
  events: readonly E[],
  covariates: readonly C[],
  tol: { maxDistanceM: number; maxDtMs: number }
): { event: E; match: C | null; distanceM: number | null; dtMs: number | null; miss?: JoinMiss }[] {
  const byTime = [...covariates].sort((a, b) => a.t - b.t);
  const times = byTime.map((c) => c.t);
  const lowerBound = (x: number) => {
    let lo = 0, hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return events.map((event) => {
    if (!byTime.length) return { event, match: null, distanceM: null, dtMs: null, miss: 'no_covariates' as const };
    let best: C | null = null, bestDt = Infinity, bestD = Infinity, anyInTime = false;
    for (let i = lowerBound(event.t - tol.maxDtMs); i < byTime.length && byTime[i].t <= event.t + tol.maxDtMs; i++) {
      anyInTime = true;
      const c = byTime[i];
      const dt = Math.abs(c.t - event.t);
      const d = haversine(event, c);
      if (d > tol.maxDistanceM) continue;
      if (dt < bestDt || (dt === bestDt && d < bestD)) {
        best = c;
        bestDt = dt;
        bestD = d;
      }
    }
    if (best) return { event, match: best, distanceM: bestD, dtMs: bestDt };
    return { event, match: null, distanceM: null, dtMs: null, miss: anyInTime ? ('none_in_distance' as const) : ('none_in_time' as const) };
  });
}

export interface GridCell {
  key: string;
  lat: number;
  lon: number;
  records: number;
  /** the sum of a count field, where there was one; null counts are not zeros */
  total: number;
  withCount: number;
  /** the sum of an effort field (minutes, km…), where there was one */
  effort: number;
}

/** Records gathered into `cellDeg` cells: how many, the counts they carry, and the effort behind them. */
export function gridCells<T extends LatLon>(
  records: readonly T[],
  cellDeg: number,
  opts: { count?: (r: T) => number | null | undefined; effort?: (r: T) => number | null | undefined } = {}
): GridCell[] {
  const cells = new Map<string, GridCell>();
  for (const r of records) {
    if (coordinateProblem(r) && coordinateProblem(r) !== 'null_island') continue;
    const i = Math.floor(r.lat / cellDeg), j = Math.floor(r.lon / cellDeg);
    const key = `${i}:${j}`;
    let c = cells.get(key);
    if (!c) {
      c = { key, lat: (i + 0.5) * cellDeg, lon: (j + 0.5) * cellDeg, records: 0, total: 0, withCount: 0, effort: 0 };
      cells.set(key, c);
    }
    c.records++;
    const n = opts.count?.(r);
    if (typeof n === 'number' && Number.isFinite(n)) {
      c.total += n;
      c.withCount++;
    }
    const e = opts.effort?.(r);
    if (typeof e === 'number' && Number.isFinite(e)) c.effort += e;
  }
  return [...cells.values()].sort((a, b) => a.key.localeCompare(b.key));
}
