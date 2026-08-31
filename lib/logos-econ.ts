// lib/logos-econ.ts
//
// The economics behind the economics diagrams.
//
// Introductory micro and macro — AP or a first college course — is taught
// almost entirely through a handful of pictures: supply and demand meeting at
// a price, a production frontier you cannot get outside of, aggregate demand
// crossing short-run supply somewhere relative to potential output. What
// makes them teachable is that they are *drawings you move*, and what makes
// them hard on paper is that moving them means redrawing them.
//
// So the arithmetic lives here, on its own, with no React and no SVG: given
// the curves and a shift, where do they cross, what does that cost, how much
// surplus is there, and is the economy above or below potential. The scene
// builders in lib/logos-viz.ts turn the answers into objects.
//
// TWO CONVENTIONS, BOTH FROM THE CLASSROOM AND BOTH DELIBERATE.
//
// Price is on the vertical axis and quantity on the horizontal, which is
// backwards from the way an economist would write the functions but is the
// way every textbook draws them, and the drawing is the thing being taught.
// So a "demand curve" here is P as a function of Q.
//
// Everything is linear except the bowed production frontier. Intro courses
// are linear because the algebra has to stay out of the way of the idea, and
// a straight demand curve is not an approximation anyone is being misled by —
// it is the model itself at this level.

// ── straight lines in (Q, P) ────────────────────────────────────────

/** A curve as intro econ writes it: P = intercept + slope·Q. */
export interface PriceLine {
  /** price when quantity is zero */
  intercept: number;
  /** change in price per unit of quantity; negative for demand */
  slope: number;
}

export function priceAt(line: PriceLine, q: number): number {
  return line.intercept + line.slope * q;
}

/** Quantity at a given price — the inverse, which is what a control needs. */
export function quantityAt(line: PriceLine, p: number): number {
  if (line.slope === 0) return NaN;
  return (p - line.intercept) / line.slope;
}

export interface Equilibrium {
  q: number;
  p: number;
}

/**
 * Where two lines cross.
 *
 * Returns null for parallel lines and for a crossing at a negative quantity
 * or price. That second case is not a rounding concern: a market that clears
 * at Q = −4 has not cleared, and drawing the crossing anyway would put a
 * confident dot in a quadrant where the model does not apply. Better to have
 * no equilibrium than a fictional one.
 */
export function equilibrium(demand: PriceLine, supply: PriceLine): Equilibrium | null {
  const dSlope = demand.slope - supply.slope;
  if (Math.abs(dSlope) < 1e-9) return null;
  const q = (supply.intercept - demand.intercept) / dSlope;
  const p = priceAt(demand, q);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return null;
  if (q < 0 || p < 0) return null;
  return { q, p };
}

/** Shift a curve vertically. A demand "increase" raises the whole line. */
export function shift(line: PriceLine, by: number): PriceLine {
  return { intercept: line.intercept + by, slope: line.slope };
}

// ── what a price control does ───────────────────────────────────────

export type ControlKind = 'ceiling' | 'floor';

export interface MarketAt {
  /** the price actually prevailing */
  price: number;
  /** what buyers want at that price */
  qd: number;
  /** what sellers offer at that price */
  qs: number;
  /** what actually trades — the short side of the market, always */
  traded: number;
  /** qd − qs: positive is a shortage, negative a surplus, 0 is clearing */
  imbalance: number;
}

/**
 * The market at an imposed price.
 *
 * `traded` is the smaller of the two quantities, and that is the whole
 * content of a price control: nobody can be made to buy or sell, so whichever
 * side wants less decides how much changes hands. Students reliably expect
 * the long side to win, which is exactly why the number is computed rather
 * than described.
 */
export function marketAt(demand: PriceLine, supply: PriceLine, price: number): MarketAt {
  const qd = Math.max(0, quantityAt(demand, price));
  const qs = Math.max(0, quantityAt(supply, price));
  return {
    price,
    qd,
    qs,
    traded: Math.min(qd, qs),
    imbalance: qd - qs,
  };
}

/**
 * Whether a control actually binds.
 *
 * A ceiling above the equilibrium price and a floor below it change nothing —
 * the market clears where it always would. This is the single most common
 * exam question about controls, and the diagram should be able to show a
 * non-binding one sitting harmlessly off to one side.
 */
export function binds(kind: ControlKind, at: number, eqPrice: number): boolean {
  return kind === 'ceiling' ? at < eqPrice : at > eqPrice;
}

// ── welfare ─────────────────────────────────────────────────────────

export interface Welfare {
  consumer: number;
  producer: number;
  total: number;
  /** surplus destroyed relative to the free-market outcome */
  deadweight: number;
}

/**
 * Consumer and producer surplus at a traded quantity.
 *
 * Both are triangles between a curve and the price line, so both are
 * ½·base·height — except that under a binding control the two sides face
 * different prices at the margin, and the "price" each surplus is measured
 * against is not the same number. Consumers pay the control price; producers
 * receive it; the wedge between what the last buyer would have paid and what
 * the last seller would have accepted is the deadweight loss.
 */
export function welfare(
  demand: PriceLine,
  supply: PriceLine,
  traded: number,
  pricePaid: number,
  priceReceived = pricePaid
): Welfare {
  const q = Math.max(0, traded);
  // Consumer surplus: area under demand, above what was paid, out to q.
  // For a straight line that is the average of the height at 0 and at q.
  const csTop = demand.intercept - pricePaid;
  const csEnd = priceAt(demand, q) - pricePaid;
  const consumer = Math.max(0, ((csTop + csEnd) / 2) * q);

  const psTop = priceReceived - supply.intercept;
  const psEnd = priceReceived - priceAt(supply, q);
  const producer = Math.max(0, ((psTop + psEnd) / 2) * q);

  const eq = equilibrium(demand, supply);
  let deadweight = 0;
  if (eq) {
    const free = welfareFree(demand, supply, eq);
    deadweight = Math.max(0, free - (consumer + producer));
  }
  return { consumer, producer, total: consumer + producer, deadweight };
}

/** Total surplus when the market is left alone — the benchmark for DWL. */
function welfareFree(demand: PriceLine, supply: PriceLine, eq: Equilibrium): number {
  const cs = ((demand.intercept - eq.p) / 2) * eq.q;
  const ps = ((eq.p - supply.intercept) / 2) * eq.q;
  return Math.max(0, cs) + Math.max(0, ps);
}

// ── the production possibilities curve ──────────────────────────────

/**
 * How much of the other good a frontier gives up.
 *
 * `bowed` is the whole pedagogical point. A straight frontier means every
 * unit of x costs the same amount of y — constant opportunity cost, resources
 * equally good at both jobs. A bowed one means each extra unit costs more
 * than the last, because the resources best suited to y are the ones being
 * moved last. Students are shown both and asked which the world looks like.
 */
export interface Frontier {
  /** most of good x obtainable if all resources go to x */
  xMax: number;
  /** most of good y */
  yMax: number;
  /** increasing opportunity cost (the usual case) rather than constant */
  bowed: boolean;
}

/** The frontier's height at x, or NaN outside it. */
export function frontierAt(f: Frontier, x: number): number {
  if (f.xMax <= 0 || f.yMax <= 0) return NaN;
  if (x < 0 || x > f.xMax) return NaN;
  const t = x / f.xMax;
  return f.bowed ? f.yMax * Math.sqrt(Math.max(0, 1 - t * t)) : f.yMax * (1 - t);
}

/**
 * Opportunity cost of the NEXT unit of x, in units of y.
 *
 * The magnitude of the frontier's slope. On a straight frontier it is the
 * same everywhere; on a bowed one it climbs toward infinity at the x-axis,
 * which is the honest answer — the last few units of x cost almost everything
 * remaining of y — and is why the value is reported rather than drawn as a
 * number on the curve.
 */
export function opportunityCost(f: Frontier, x: number): number {
  if (f.xMax <= 0 || f.yMax <= 0) return NaN;
  if (x < 0 || x > f.xMax) return NaN;
  if (!f.bowed) return f.yMax / f.xMax;
  const t = x / f.xMax;
  const root = Math.sqrt(Math.max(0, 1 - t * t));
  if (root < 1e-9) return Infinity;
  return (f.yMax / f.xMax) * (t / root);
}

export type PointStanding = 'efficient' | 'inefficient' | 'unattainable';

/**
 * Where a production point stands relative to the frontier.
 *
 * Three answers, and the middle one is the one worth naming out loud:
 * a point inside the curve is not "wrong", it is unemployment or misallocated
 * resources — attainable, and worse than what is attainable.
 */
export function standing(f: Frontier, x: number, y: number, tol = 1e-6): PointStanding {
  const edge = frontierAt(f, x);
  if (!Number.isFinite(edge)) return 'unattainable';
  if (y > edge + tol) return 'unattainable';
  if (y < edge - tol) return 'inefficient';
  return 'efficient';
}

// ── aggregate demand and supply ─────────────────────────────────────

export type GapKind = 'recessionary' | 'inflationary' | 'at potential';

export interface OutputGap {
  /** actual real output minus potential */
  gap: number;
  kind: GapKind;
}

/**
 * The economy against its potential.
 *
 * The tolerance is a fraction of potential output rather than an absolute,
 * because "at potential" is a statement about proportion — half a billion
 * either way is nothing to a large economy and everything to a small one.
 */
export function outputGap(y: number, potential: number, tolFrac = 0.005): OutputGap {
  const gap = y - potential;
  const tol = Math.abs(potential) * tolFrac;
  if (Math.abs(gap) <= tol) return { gap, kind: 'at potential' };
  return { gap, kind: gap < 0 ? 'recessionary' : 'inflationary' };
}
