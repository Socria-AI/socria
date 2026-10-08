// lib/science/random.ts
//
// SEEDED RANDOMNESS, for two things only: synthetic fixtures with a known
// ground truth, and simulations a person asked for. Never for filling in an
// observation that is missing — a number drawn here is `simulated`, and says so
// wherever it travels (lib/science/provenance.ts).
//
// Deterministic by construction: the same seed gives the same draws on every
// machine, so a test that recovers a coefficient from seeded counts is a test,
// not a coin toss.
//
// PURE: no Math.random, no clock.

export interface Rng {
  /** uniform on [0, 1) */
  next(): number;
  /** standard normal */
  normal(): number;
  /** Poisson with mean `lambda` */
  poisson(lambda: number): number;
  /** gamma with shape `k` and scale `theta` */
  gamma(k: number, theta: number): number;
  /** negative binomial (NB2): mean `mu`, size `size`, variance mu + mu²/size */
  negbin(mu: number, size: number): number;
  /** true with probability `p` */
  bernoulli(p: number): boolean;
}

/** mulberry32: small, fast, and good enough for fixtures and Monte Carlo at this scale. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    // Box–Muller, with the second draw kept for the next call.
    let u = 0;
    while (u <= 1e-300) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  const gamma = (k: number, theta: number): number => {
    if (!(k > 0) || !(theta > 0)) return NaN;
    // Marsaglia–Tsang; a shape below one is boosted and corrected.
    if (k < 1) return gamma(k + 1, theta) * Math.pow(next() || 1e-300, 1 / k);
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x = 0;
      let v = 0;
      do {
        x = normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = next();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v * theta;
      if (Math.log(u || 1e-300) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * theta;
    }
  };
  const poisson = (lambda: number): number => {
    if (!(lambda >= 0) || !Number.isFinite(lambda)) return NaN;
    if (lambda === 0) return 0;
    if (lambda < 30) {
      // Knuth: exact, and quick at small means.
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > L);
      return k - 1;
    }
    // Large means: the gamma–Poisson split keeps it exact without a long loop.
    const m = Math.floor(0.875 * lambda);
    const g = gamma(m, 1);
    if (g > lambda) {
      // binomial(m - 1, lambda / g)
      let k = 0;
      const p = lambda / g;
      for (let i = 0; i < m - 1; i++) if (next() < p) k++;
      return k;
    }
    return m + poisson(lambda - g);
  };
  return {
    next,
    normal,
    poisson,
    gamma,
    negbin: (mu, size) => (mu > 0 && size > 0 ? poisson(gamma(size, mu / size)) : NaN),
    bernoulli: (p) => next() < p,
  };
}
