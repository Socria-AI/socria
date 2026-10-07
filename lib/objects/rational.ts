// Exact rationals, so a row operation gives the number it gives.
//
// Floating point would turn R2 ← R2 − (1/3)R1 into 0.33333333 and an entry
// that should be 0 into 4.4e-16. A person checking their own elimination
// needs the 0, and "computed" has to mean computed exactly. Stored as text
// ("3", "-1/2") so a state reads back from JSON as itself.
//
// PURE.

export interface Q {
  n: number;
  d: number;
}

/** Beyond this a numerator or denominator is no longer exact in a double. */
export const Q_LIMIT = 1e12;

const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

export function q(n: number, d = 1): Q {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error('not a rational');
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(n, d);
  const s = d < 0 ? -1 : 1;
  return { n: (s * n) / g, d: (s * d) / g };
}

export const ZERO = q(0);
export const ONE = q(1);
export const isZero = (a: Q) => a.n === 0;
export const eq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
export const neg = (a: Q): Q => ({ n: -a.n || 0, d: a.d });
export const add = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Q, b: Q): Q => add(a, neg(b));
export const mul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
export const div = (a: Q, b: Q): Q => {
  if (b.n === 0) throw new Error('division by zero');
  return q(a.n * b.d, a.d * b.n);
};
export const abs = (a: Q): Q => ({ n: Math.abs(a.n), d: a.d });
export const toNumber = (a: Q) => a.n / a.d;
export const safe = (a: Q) => Math.abs(a.n) < Q_LIMIT && Math.abs(a.d) < Q_LIMIT;

/** "3", "-1/2", "0.25", "−4" (a typographic minus), "+2". Null for anything else. */
export function parseQ(raw: unknown): Q | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    if (Number.isInteger(raw)) return Math.abs(raw) < Q_LIMIT ? q(raw) : null;
    return parseQ(String(raw));
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/[−–]/g, '-').replace(/^\+/, '');
  let m = /^(-?\d{1,12})\s*\/\s*(-?\d{1,12})$/.exec(s);
  if (m) {
    const d = Number(m[2]);
    return d === 0 ? null : q(Number(m[1]), d);
  }
  m = /^(-?)(\d{0,12})\.(\d{1,8})$/.exec(s);
  if (m) {
    const scale = 10 ** m[3].length;
    const whole = Number(m[2] || '0') * scale + Number(m[3]);
    return q((m[1] ? -1 : 1) * whole, scale);
  }
  m = /^-?\d{1,12}$/.exec(s);
  if (m) return q(Number(s));
  return null;
}

export const show = (a: Q): string => (a.d === 1 ? String(a.n) : `${a.n}/${a.d}`);

/** For notation: −3, \tfrac{1}{2}. */
export function tex(a: Q): string {
  if (a.d === 1) return a.n < 0 ? `-${-a.n}` : String(a.n);
  return `${a.n < 0 ? '-' : ''}\\tfrac{${Math.abs(a.n)}}{${a.d}}`;
}

/** As a person reads it aloud in a sentence: "−3", "1/2". */
export const say = (a: Q): string => show(a).replace(/^-/, '−');
