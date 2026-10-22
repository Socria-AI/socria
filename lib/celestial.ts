// lib/celestial.ts
//
// CELESTIAL — the sky Socria is read under when the theme is Celestial.
// (THEMES.night in lib/theme.ts: the stored key keeps its first name, so a
// choice made when it was called Night still holds.)
//
// GENERATED, AND THE SAME EVERY TIME. A seeded generator lays out a deep
// field the way a long exposure shows one: thousands of faint stars in every
// colour a star comes in, the Milky Way as a band of grain and light bent a
// little across the sky with dark dust lanes through its middle, nebulae as
// clouds of coloured gas, and a few bright stars the component lifts out of
// the picture so they can twinkle. `skySteps` paints the soft light at half
// resolution and the stars at full, in steps small enough to run while the
// page is idle — so the sky costs one paint, once, and never a stutter.
//
// Positions are fractions of the square the sky is painted on; star sizes are
// in CSS pixels, so a star is the same size on every screen. Pure: the
// painter draws onto anything shaped like a 2D canvas context, which is how
// the tests count what it would draw.

export type Rng = () => number;

/** mulberry32: small, fast, and the same sky on every machine. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A normal deviate (Box–Muller). */
export function gauss(r: Rng): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** The colours stars come in, hottest first, and how often each is seen. */
export const STAR_COLORS: readonly (readonly [string, number])[] = [
  ['#a9c1ff', 0.1],
  ['#cfdcff', 0.2],
  ['#f6f4ff', 0.34],
  ['#fff1df', 0.19],
  ['#ffd9a8', 0.12],
  ['#ffb59a', 0.05],
];

export function starColor(r: Rng): string {
  let x = r();
  for (const [c, w] of STAR_COLORS) {
    if ((x -= w) <= 0) return c;
  }
  return STAR_COLORS[2][0];
}

/**
 * THE MILKY WAY: a band through the square at an angle, offset a little from
 * its middle and bent like the real one seen from a field — `width` is the
 * spread of its light across the spine, in fractions of the square.
 */
export const BAND = { angle: -0.48, offset: 0.035, width: 0.085, bend: 0.035, core: 0.12 } as const;
const CA = Math.cos(BAND.angle);
const SA = Math.sin(BAND.angle);
const bendAt = (along: number) => BAND.offset + BAND.bend * Math.sin(along * 2 * Math.PI);

/** Where a point is against the band: how far along it, and how far off its spine. */
export function bandCoords(x: number, y: number): { along: number; across: number } {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const along = dx * CA + dy * SA;
  return { along, across: -dx * SA + dy * CA - bendAt(along) };
}

/** The point `along` the band and `across` from its spine. */
export function bandPoint(along: number, across: number): [number, number] {
  const a = across + bendAt(along);
  return [0.5 + along * CA - a * SA, 0.5 + along * SA + a * CA];
}

/** How bright the band is here: its galactic core is warmer and denser. */
export const coreOf = (along: number) => Math.exp(-(((along - BAND.core) / 0.24) ** 2));

/** A star: where (fractions), how big (CSS px), how bright, what colour. */
export interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  c: string;
}
/** A soft light: where (fractions), how wide (a fraction of the square), how strong, what colour. */
export interface Cloud {
  x: number;
  y: number;
  r: number;
  a: number;
  c: string;
}
/** A star bright enough to be lifted out and twinkle; `spike` draws its cross of light. */
export interface Bright extends Star {
  spike: boolean;
  /** seconds for one twinkle, and how far into it this one starts */
  dur: number;
  delay: number;
}
export interface Sky {
  /** everywhere: the faint field */
  field: Star[];
  /** the Milky Way's grain */
  band: Star[];
  /** the Milky Way's light */
  glow: Cloud[];
  /** the dark lanes through it */
  dust: Cloud[];
  /** clouds of coloured gas */
  nebulae: Cloud[];
  /** the twinklers */
  bright: Bright[];
}

/**
 * The nebulae, placed by hand so they sit where the eye is not looking for
 * words: one against the band, one high on the far side, a small rose-gold
 * one, and a wide blue wash low down. Two colours each, mixed across a cloud.
 */
export const NEBULAE: readonly { x: number; y: number; r: number; c: readonly [string, string]; n: number; a: number }[] = [
  { x: 0.3, y: 0.64, r: 0.19, c: ['#7c5cff', '#d0479a'], n: 170, a: 1 },
  { x: 0.75, y: 0.27, r: 0.16, c: ['#2bb3c0', '#3f66ff'], n: 150, a: 0.9 },
  { x: 0.17, y: 0.21, r: 0.11, c: ['#ff7aa8', '#f2c46d'], n: 90, a: 0.75 },
  { x: 0.66, y: 0.8, r: 0.24, c: ['#3f66ff', '#7c5cff'], n: 150, a: 0.6 },
];

/** How many of each, for a square of side 2000 CSS px; a sky scales with its area. */
export const DENSITY = { field: 2400, band: 12000, glow: 380, core: 30, dust: 460, bright: 34, spikes: 8 } as const;

/** Star clouds: the band is not even — it gathers in clumps along its length. */
export const clumpAt = (along: number) => 0.55 + 0.45 * Math.sin(along * 17 + 1.3) * Math.sin(along * 7.3 + 0.4);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Mix two hex colours, t of the way from a to b. */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** `#rrggbb` and an alpha as `rgba(…)`. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.round(clamp01(a) * 1000) / 1000})`;
}

/** The whole sky for a square `side` CSS px across. */
export function makeSky({ side, seed = 1729 }: { side: number; seed?: number }): Sky {
  const r = rng(seed);
  const k = Math.min(1.8, Math.max(0.3, (side * side) / 4_000_000));
  const n = (v: number) => Math.round(v * k);
  // a small screen sees the galaxy closer: its band and its clouds wider
  const zoom = Math.min(1.5, Math.max(1, Math.sqrt(1400 / side)));
  const W = BAND.width * zoom;

  const field: Star[] = [];
  for (let i = 0; i < n(DENSITY.field); i++) {
    field.push({ x: r(), y: r(), r: 0.28 + 0.8 * r() ** 3, a: 0.16 + 0.7 * r() ** 1.7, c: starColor(r) });
  }

  // the band's grain: thousands of the faintest stars, gathered into clouds
  // along its length, densest and warmest at the core
  const band: Star[] = [];
  for (let i = 0, tries = 0; i < n(DENSITY.band) && tries < n(DENSITY.band) * 4; tries++) {
    const along = -0.8 + 1.6 * r();
    if (r() > clumpAt(along)) continue;
    const core = coreOf(along);
    const [x, y] = bandPoint(along, gauss(r) * W * (0.36 + 0.26 * core));
    i++;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;
    const warm = core * r();
    band.push({
      x,
      y,
      r: 0.2 + 0.5 * r() ** 4,
      a: (0.12 + 0.55 * r() ** 2) * (0.6 + 0.6 * core),
      c: warm > 0.42 ? '#ffe7c4' : r() < 0.5 ? '#dfe6ff' : starColor(r),
    });
  }

  // its light: wide and faint, blue-white at the edges, cream at the core,
  // a rose knot of glowing gas here and there; added together until it glows
  const glow: Cloud[] = [];
  for (let i = 0; i < n(DENSITY.glow); i++) {
    const along = -0.82 + 1.64 * r();
    const core = coreOf(along);
    const knot = r() < 0.08;
    const [x, y] = bandPoint(along, gauss(r) * W * (knot ? 0.28 : 0.48));
    glow.push({
      x,
      y,
      r: knot ? 0.003 + 0.007 * r() : 0.025 + 0.07 * r(),
      a: knot ? 0.05 + 0.06 * r() : (0.009 + 0.02 * r() + 0.042 * core) * clumpAt(along),
      c: knot ? '#ff8fb8' : mix('#a3b3ff', '#ffe2b5', Math.min(1, core * 0.95)),
    });
  }
  // the galactic core: a warm brightening where the band is thickest
  for (let i = 0; i < n(DENSITY.core); i++) {
    const along = BAND.core + gauss(r) * 0.09;
    const [x, y] = bandPoint(along, gauss(r) * W * 0.22);
    glow.push({ x, y, r: 0.02 + 0.045 * r(), a: 0.04 + 0.05 * r(), c: r() < 0.7 ? '#ffe9c8' : '#ffd2a0' });
  }

  // the dark lanes: two of them winding along just off the spine, made of
  // small dark clouds so their edges are ragged rather than soft
  const dust: Cloud[] = [];
  for (let i = 0; i < n(DENSITY.dust); i++) {
    const lane = i % 3 === 0 ? -0.016 : 0.007;
    const along = -0.66 + 1.32 * r();
    const wind = 0.011 * Math.sin(along * 23 + (lane < 0 ? 2.1 : 0)) + 0.006 * Math.sin(along * 51);
    const [x, y] = bandPoint(along, lane + wind + gauss(r) * 0.0045);
    dust.push({ x, y, r: 0.005 + 0.018 * r(), a: (0.07 + 0.15 * r()) * (0.4 + 0.6 * coreOf(along)), c: '#03040c' });
  }

  // the nebulae: most of their light along a few filaments — small, brighter
  // clouds — over a faint wide wash, with a bright knot or two in the middle
  const nebulae: Cloud[] = [];
  for (const base of NEBULAE) {
    const neb = { ...base, r: base.r * zoom };
    const arcs = Array.from({ length: 4 }, () => {
      const t0 = r() * Math.PI * 2;
      return { a: t0, b: t0 + (r() - 0.5) * 2.8, s: 0.3 + 0.6 * r() };
    });
    const count = Math.round(neb.n * Math.min(1.4, Math.max(0.5, k)));
    for (let i = 0; i < count; i++) {
      const wide = i % 10 < 3;
      const arc = arcs[i % arcs.length];
      const t = r();
      const ang = arc.a + (arc.b - arc.a) * t;
      const rad = neb.r * arc.s * (0.2 + 0.8 * t);
      nebulae.push({
        x: neb.x + (wide ? gauss(r) * neb.r * 0.45 : Math.cos(ang) * rad + gauss(r) * neb.r * 0.06),
        y: neb.y + (wide ? gauss(r) * neb.r * 0.36 : Math.sin(ang) * rad * 0.8 + gauss(r) * neb.r * 0.06),
        r: neb.r * (wide ? 0.25 + 0.3 * r() : 0.04 + 0.12 * r()),
        a: (wide ? 0.006 + 0.012 * r() : 0.016 + 0.04 * r()) * neb.a,
        c: mix(neb.c[0], neb.c[1], clamp01(t + gauss(r) * 0.18)),
      });
    }
    for (let i = 0; i < 3; i++) {
      nebulae.push({ x: neb.x + gauss(r) * neb.r * 0.12, y: neb.y + gauss(r) * neb.r * 0.1, r: neb.r * (0.05 + 0.06 * r()), a: 0.07 * neb.a, c: mix(neb.c[0], '#ffffff', 0.45) });
    }
  }

  // the twinklers: the brightest few cross with light
  const bright: Bright[] = [];
  for (let i = 0; i < DENSITY.bright; i++) {
    bright.push({
      x: 0.04 + 0.92 * r(),
      y: 0.04 + 0.92 * r(),
      r: 1.1 + 1.5 * r() ** 2,
      a: 0.75 + 0.25 * r(),
      c: starColor(r),
      spike: i < DENSITY.spikes,
      dur: 3 + 6 * r(),
      delay: -9 * r(),
    });
  }
  for (const b of bright) if (b.spike) b.r = Math.max(b.r, 2);

  return { field, band, glow, dust, nebulae, bright };
}

// ── painting ──────────────────────────────────────────────────────────

/** What the painter needs of a canvas context — a real one, or a test's. */
export interface Paint2D {
  fillStyle: unknown;
  globalCompositeOperation: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(o: number, c: string): void };
}
export interface PaintCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): Paint2D | null;
}

function cloud(ctx: Paint2D, c: Cloud, S: number) {
  const x = c.x * S;
  const y = c.y * S;
  const rad = Math.max(1, c.r * S);
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, rgba(c.c, c.a));
  g.addColorStop(0.55, rgba(c.c, c.a * 0.45));
  g.addColorStop(1, rgba(c.c, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
}

function star(ctx: Paint2D, s: Star, S: number, dpr: number) {
  const x = s.x * S;
  const y = s.y * S;
  const rad = Math.max(0.4, s.r * dpr);
  // the bigger ones bloom a little, the way a lens sees them
  if (s.r > 0.85) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 4);
    g.addColorStop(0, rgba(s.c, s.a * 0.32));
    g.addColorStop(1, rgba(s.c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgba(s.c, s.a);
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
}

/** The ground the sky is painted on: deepest at the edges, a little light where the band crosses. */
export const GROUND: readonly [number, string][] = [
  [0, '#0c1438'],
  [0.34, '#080d27'],
  [0.68, '#04071a'],
  [1, '#020309'],
];

/** How much goes into one step, so no step holds the page for more than a few milliseconds. */
export const STEP = { clouds: 60, stars: 2000, dust: 120 } as const;

const chunks = <T,>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/**
 * The sky, as a list of small steps to be run when the page has a moment.
 *
 * TWO CANVASES, because the costly part of a soft sky is softening it. The
 * light — the ground, the nebulae, the band's glow — goes on `soft` at half
 * the resolution, which the browser scales up as it shows it (smooth, and
 * free); the stars and the dust lanes go on `deep`, transparent, at full
 * resolution over it — the band's grain, then the lanes that hide part of it,
 * then the near field in front of everything. Null when there is no 2D
 * context to paint with (the sky's CSS ground stands in).
 */
export function skySteps(soft: PaintCanvas, deep: PaintCanvas, sky: Sky, side: number, dpr: number): (() => void)[] | null {
  const sctx = soft.getContext('2d');
  const dctx = deep.getContext('2d');
  if (!sctx || !dctx) return null;
  const S = Math.round(side * dpr);
  const Q = Math.max(64, Math.round(S / 2));
  const steps: (() => void)[] = [
    () => {
      soft.width = Q;
      soft.height = Q;
      const ground = sctx.createRadialGradient(Q * 0.54, Q * 0.46, 0, Q * 0.54, Q * 0.46, Q * 0.74);
      for (const [o, c] of GROUND) ground.addColorStop(o, c);
      sctx.fillStyle = ground;
      sctx.fillRect(0, 0, Q, Q);
      sctx.globalCompositeOperation = 'lighter';
    },
  ];
  for (const part of chunks([...sky.nebulae, ...sky.glow], STEP.clouds)) steps.push(() => part.forEach((c) => cloud(sctx, c, Q)));
  steps.push(() => {
    sctx.globalCompositeOperation = 'source-over';
    deep.width = S;
    deep.height = S;
  });
  for (const part of chunks(sky.band, STEP.stars)) steps.push(() => part.forEach((t) => star(dctx, t, S, dpr)));
  for (const part of chunks(sky.dust, STEP.dust)) steps.push(() => part.forEach((c) => cloud(dctx, c, S)));
  for (const part of chunks(sky.field, STEP.stars)) steps.push(() => part.forEach((t) => star(dctx, t, S, dpr)));
  return steps;
}

/** All of it at once — for a test, or wherever there is no idle time to wait for. */
export function paintSky(soft: PaintCanvas, deep: PaintCanvas, sky: Sky, side: number, dpr: number): boolean {
  const steps = skySteps(soft, deep, sky, side, dpr);
  steps?.forEach((step) => step());
  return !!steps;
}

// ── the near dust, for parallax ──────────────────────────────────────

/** A tile of nearer stars, transparent between them, that repeats without a seam. */
export function makeDust({ seed = 4242, count = 260 }: { seed?: number; count?: number } = {}): Star[] {
  const r = rng(seed);
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    const big = r() < 0.08;
    out.push({ x: r(), y: r(), r: big ? 1.1 + 0.9 * r() : 0.35 + 0.75 * r() ** 2, a: big ? 0.75 + 0.25 * r() : 0.28 + 0.6 * r(), c: starColor(r) });
  }
  return out;
}

/** Paint the dust tile: every star near an edge is drawn again across it, so the repeat has no seam. */
export function paintDust(canvas: PaintCanvas, dust: Star[], tile: number, dpr: number): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const T = Math.round(tile * dpr);
  canvas.width = T;
  canvas.height = T;
  for (const s of dust) {
    for (const ox of [-1, 0, 1]) {
      for (const oy of [-1, 0, 1]) {
        const x = s.x + ox;
        const y = s.y + oy;
        const pad = (s.r * 5) / tile;
        if (x < -pad || x > 1 + pad || y < -pad || y > 1 + pad) continue;
        star(ctx, { ...s, x, y }, T, dpr);
      }
    }
  }
  return true;
}
