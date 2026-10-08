// lib/numeric/spectral.ts
//
// FREQUENCIES IN A SIGNAL, AND THE SHAPE OF A SET OF POINTS.
//
//   fft              discrete Fourier transform of any length: radix-2 when
//                    the length is a power of two, Bluestein's chirp-z
//                    otherwise — so a 15 000-sample record is transformed
//                    as it is, not padded into a different signal
//   powerSpectrum    the one-sided spectral density of a real series, with a
//                    window and detrending; calibrated so Σ P·Δf equals the
//                    variance (Parseval), checked in the tests
//   spectralPeaks    the dominant frequencies, by prominence
//   autocorrelation  via the FFT, normalized to r(0) = 1
//   delayEmbed       the method of delays: x(t), x(t+τ), … x(t+(p−1)τ)
//   correlationDimension  Grassberger–Procaccia: C(r) ~ r^ν, ν fitted on a
//                    scaling range that is reported with the answer
//   boxCountingDimension  N(ε) ~ ε^−D for a set of points
//   linearFit        least squares y = a + b x with R²
//
// Every estimate here says how it was made (window, range, points used),
// because a dimension or a peak frequency is only as good as those choices.
//
// PURE.

export interface ComplexArrays {
  re: Float64Array;
  im: Float64Array;
}

const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
const nextPow2 = (n: number) => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

/** In-place iterative radix-2 FFT; `inverse` uses the conjugate twiddles (no 1/n scaling). */
function fft2(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** X_k = Σ x_j e^{−2πijk/n}, any n. */
export function fft(reIn: ArrayLike<number>, imIn?: ArrayLike<number>): ComplexArrays {
  const n = reIn.length;
  const re = Float64Array.from(reIn);
  const im = imIn ? Float64Array.from(imIn) : new Float64Array(n);
  if (n <= 1) return { re, im };
  if (isPow2(n)) {
    fft2(re, im);
    return { re, im };
  }
  // Bluestein: x_j e^{−iπj²/n} convolved with the chirp e^{iπj²/n}
  const m = nextPow2(2 * n - 1);
  const ar = new Float64Array(m);
  const ai = new Float64Array(m);
  const br = new Float64Array(m);
  const bi = new Float64Array(m);
  const wr = new Float64Array(n);
  const wi = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    // j² mod 2n keeps the angle accurate for long records
    const jj = (j * j) % (2 * n);
    const ang = (Math.PI * jj) / n;
    wr[j] = Math.cos(ang);
    wi[j] = -Math.sin(ang);
  }
  for (let j = 0; j < n; j++) {
    ar[j] = re[j] * wr[j] - im[j] * wi[j];
    ai[j] = re[j] * wi[j] + im[j] * wr[j];
  }
  br[0] = wr[0];
  bi[0] = -wi[0];
  for (let j = 1; j < n; j++) {
    br[j] = br[m - j] = wr[j];
    bi[j] = bi[m - j] = -wi[j];
  }
  fft2(ar, ai);
  fft2(br, bi);
  for (let k = 0; k < m; k++) {
    const t = ar[k] * br[k] - ai[k] * bi[k];
    ai[k] = ar[k] * bi[k] + ai[k] * br[k];
    ar[k] = t;
  }
  fft2(ar, ai, true);
  for (let k = 0; k < n; k++) {
    const xr = ar[k] / m;
    const xi = ai[k] / m;
    re[k] = xr * wr[k] - xi * wi[k];
    im[k] = xr * wi[k] + xi * wr[k];
  }
  return { re, im };
}

export function ifft(re: ArrayLike<number>, im: ArrayLike<number>): ComplexArrays {
  // conj(fft(conj(X)))/n
  const n = re.length;
  const out = fft(re, Array.from(im, (v) => -v));
  for (let k = 0; k < n; k++) {
    out.re[k] /= n;
    out.im[k] = -out.im[k] / n;
  }
  return out;
}

export type WindowKind = 'hann' | 'none';

export interface Spectrum {
  /** frequencies, 0 … Nyquist (cycles per unit of the sampling interval's time) */
  f: number[];
  /** one-sided power spectral density */
  P: number[];
  df: number;
  nyquist: number;
  n: number;
  window: WindowKind;
  detrended: 'none' | 'mean' | 'linear';
  /** the variance the spectrum accounts for — Σ P Δf */
  variance: number;
}

export function detrend(x: ArrayLike<number>, how: 'none' | 'mean' | 'linear' = 'mean'): number[] {
  const n = x.length;
  const xs = Array.from(x);
  if (how === 'none' || n < 2) return xs;
  if (how === 'mean') {
    const m = xs.reduce((s, v) => s + v, 0) / n;
    return xs.map((v) => v - m);
  }
  const fit = linearFit(xs.map((_, i) => i), xs);
  return xs.map((v, i) => v - (fit.a + fit.b * i));
}

/** The one-sided power spectral density of a real series sampled every `dt`. */
export function powerSpectrum(x: ArrayLike<number>, dt: number, opts: { window?: WindowKind; detrend?: 'none' | 'mean' | 'linear' } = {}): Spectrum {
  const n = x.length;
  const window = opts.window ?? 'hann';
  const how = opts.detrend ?? 'mean';
  const y = detrend(x, how);
  const w = Array.from({ length: n }, (_, i) => (window === 'hann' && n > 1 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) : 1));
  const s2 = w.reduce((s, v) => s + v * v, 0);
  const X = fft(y.map((v, i) => v * w[i]));
  const fs = 1 / dt;
  const half = Math.floor(n / 2);
  const f: number[] = [];
  const P: number[] = [];
  for (let k = 0; k <= half; k++) {
    let p = (X.re[k] * X.re[k] + X.im[k] * X.im[k]) / (fs * s2);
    // fold the negative frequencies onto the positive, except DC and (even n) Nyquist
    if (k > 0 && !(n % 2 === 0 && k === half)) p *= 2;
    f.push(k * (fs / n));
    P.push(p);
  }
  const df = fs / n;
  return { f, P, df, nyquist: fs / 2, n, window, detrended: how, variance: P.reduce((s, p) => s + p * df, 0) };
}

export interface Peak {
  f: number;
  P: number;
  /** the period 1/f */
  period: number;
  /** how far the peak stands above the higher of its two flanking minima, as a ratio */
  prominence: number;
}

/** Local maxima of the spectrum, the most prominent first; DC excluded. Parabolic interpolation refines f. */
export function spectralPeaks(s: Spectrum, count = 5, minProminence = 3): Peak[] {
  const { f, P } = s;
  const out: Peak[] = [];
  for (let k = 1; k < P.length - 1; k++) {
    if (!(P[k] > P[k - 1] && P[k] >= P[k + 1])) continue;
    let l = k;
    while (l > 0 && P[l - 1] <= P[l]) l--;
    let r = k;
    while (r < P.length - 1 && P[r + 1] <= P[r]) r++;
    const base = Math.max(P[l], P[r], 1e-300);
    const prominence = P[k] / base;
    if (prominence < minProminence) continue;
    // parabolic refinement on log power
    const a = Math.log(P[k - 1] + 1e-300);
    const b = Math.log(P[k] + 1e-300);
    const c = Math.log(P[k + 1] + 1e-300);
    const den = a - 2 * b + c;
    const delta = den !== 0 ? (0.5 * (a - c)) / den : 0;
    const fk = f[k] + Math.max(-0.5, Math.min(0.5, delta)) * s.df;
    out.push({ f: fk, P: P[k], period: fk > 0 ? 1 / fk : Infinity, prominence });
  }
  return out.sort((u, v) => v.P - u.P).slice(0, count);
}

/** Normalized autocorrelation r(k), k = 0 … maxLag, via a zero-padded FFT. */
export function autocorrelation(x: ArrayLike<number>, maxLag?: number): number[] {
  const n = x.length;
  const y = detrend(x, 'mean');
  const m = nextPow2(2 * n);
  const re = new Float64Array(m);
  y.forEach((v, i) => (re[i] = v));
  const X = fft(re);
  const pw = new Float64Array(m);
  for (let k = 0; k < m; k++) pw[k] = X.re[k] * X.re[k] + X.im[k] * X.im[k];
  const r = ifft(pw, new Float64Array(m)).re;
  const L = Math.min(maxLag ?? n - 1, n - 1);
  const r0 = r[0] || 1;
  return Array.from({ length: L + 1 }, (_, k) => r[k] / r0);
}

/** The first lag at which the autocorrelation falls below 1/e — a common choice of delay τ. */
export function decorrelationLag(x: ArrayLike<number>): number {
  const r = autocorrelation(x, Math.min(x.length - 1, 5000));
  const k = r.findIndex((v) => v < 1 / Math.E);
  return k > 0 ? k : 1;
}

/** x(t), x(t+τ), …, x(t+(p−1)τ) — the reconstructed state, τ and p in samples. */
export function delayEmbed(x: ArrayLike<number>, dim: number, tau: number): number[][] {
  const n = x.length - (dim - 1) * tau;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const v: number[] = [];
    for (let d = 0; d < dim; d++) v.push(x[i + d * tau]);
    out.push(v);
  }
  return out;
}

export interface LinearFit {
  a: number;
  b: number;
  r2: number;
  n: number;
}

export function linearFit(x: readonly number[], y: readonly number[]): LinearFit {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1, n };
}

export interface DimensionEstimate {
  /** the fitted slope */
  value: number;
  r2: number;
  /** the scaling range used, and the curve it was fitted on, for showing */
  range: [number, number];
  curve: { x: number[]; y: number[] };
  points: number;
  method: string;
}

/**
 * Grassberger–Procaccia: C(r) = fraction of pairs closer than r; ν = d log C / d log r
 * over a scaling range. Pairs closer in time than `theiler` samples are left
 * out so a smooth trajectory does not count its own neighbours.
 */
export function correlationDimension(points: readonly (readonly number[])[], opts: { maxPoints?: number; theiler?: number; radii?: number; lo?: number; hi?: number } = {}): DimensionEstimate {
  const maxPoints = opts.maxPoints ?? 1500;
  const stride = Math.max(1, Math.floor(points.length / maxPoints));
  const P = points.filter((_, i) => i % stride === 0);
  const m = P.length;
  const w = Math.max(0, Math.round((opts.theiler ?? 0) / stride));
  const d: number[] = [];
  for (let i = 0; i < m; i++)
    for (let j = i + 1 + w; j < m; j++) {
      let s = 0;
      for (let k = 0; k < P[i].length; k++) s += (P[i][k] - P[j][k]) ** 2;
      d.push(Math.sqrt(s));
    }
  d.sort((a, b) => a - b);
  const q = (p: number) => d[Math.min(d.length - 1, Math.max(0, Math.floor(p * d.length)))] || 1e-12;
  const countBelow = (r: number) => {
    let a = 0;
    let b = d.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (d[mid] < r) a = mid + 1;
      else b = mid;
    }
    return a;
  };
  // C(r) over a wide range of radii
  const R = opts.radii ?? 40;
  const rLo = opts.lo ?? q(0.0005);
  const rHi = opts.hi ?? q(0.5);
  const lx: number[] = [];
  const ly: number[] = [];
  const counts: number[] = [];
  for (let k = 0; k < R; k++) {
    const r = rLo * Math.pow(rHi / rLo, k / (R - 1));
    const c = countBelow(r);
    if (c > 0) {
      lx.push(Math.log(r));
      ly.push(Math.log(c / d.length));
      counts.push(c);
    }
  }
  // THE SCALING REGION: the longest run of radii whose local slopes agree (within ±12% of the
  // run's median), where enough pairs are counted for the count to mean something. When the
  // caller fixes the range, it is used as given.
  let from = 0;
  let to = lx.length - 1;
  if (opts.lo === undefined && opts.hi === undefined && lx.length >= 6) {
    const slope = lx.slice(1).map((x, i) => (ly[i + 1] - ly[i]) / (x - lx[i]));
    let best: [number, number] = [0, Math.min(4, slope.length - 1)];
    for (let i = 0; i < slope.length; i++) {
      if (counts[i] < 50) continue;
      for (let j = i + 4; j < slope.length; j++) {
        const run = slope.slice(i, j + 1).sort((a, b) => a - b);
        const med = run[Math.floor(run.length / 2)];
        if (!(med > 0) || run[0] < 0.88 * med || run[run.length - 1] > 1.12 * med) break;
        if (j - i > best[1] - best[0]) best = [i, j];
      }
    }
    from = best[0];
    to = best[1] + 1;
  }
  const xs = lx.slice(from, to + 1);
  const ys = ly.slice(from, to + 1);
  const fit = linearFit(xs, ys);
  const lo = Math.exp(xs[0] ?? 0);
  const hi = Math.exp(xs[xs.length - 1] ?? 0);
  return {
    value: fit.b,
    r2: fit.r2,
    range: [lo, hi],
    curve: { x: lx, y: ly },
    points: m,
    method: `Grassberger–Procaccia on ${m} points (every ${stride === 1 ? '' : `${stride}th `}sample), Theiler window ${w}, slope of log C(r) over the scaling region r ∈ [${lo.toPrecision(3)}, ${hi.toPrecision(3)}] (${xs.length} radii)`,
  };
}

/** Box counting: occupied boxes of side ε for ε halving from the set's extent; slope of log N vs log(1/ε). */
export function boxCountingDimension(points: readonly (readonly number[])[], opts: { levels?: number; skip?: number } = {}): DimensionEstimate {
  const dim = points[0]?.length ?? 0;
  const lo = Array.from({ length: dim }, (_, k) => Math.min(...points.map((p) => p[k])));
  const hi = Array.from({ length: dim }, (_, k) => Math.max(...points.map((p) => p[k])));
  const L = Math.max(...hi.map((h, k) => h - lo[k])) || 1;
  const levels = opts.levels ?? 10;
  const skip = opts.skip ?? 2;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = skip; k < levels; k++) {
    const eps = L / 2 ** k;
    const boxes = new Set<string>();
    for (const p of points) boxes.add(p.map((v, i) => Math.min(2 ** k - 1, Math.floor((v - lo[i]) / eps))).join(','));
    xs.push(Math.log(1 / eps));
    ys.push(Math.log(boxes.size));
  }
  const fit = linearFit(xs, ys);
  return {
    value: fit.b,
    r2: fit.r2,
    range: [L / 2 ** (levels - 1), L / 2 ** skip],
    curve: { x: xs, y: ys },
    points: points.length,
    method: `box counting over ${levels - skip} scales, ε from L/${2 ** skip} to L/${2 ** (levels - 1)}`,
  };
}
