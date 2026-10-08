// lib/model/pde.ts
//
// A QUANTITY SPREAD OVER SPACE, STEPPED THROUGH TIME — the `pde` block, read,
// refused or run.
//
// WHAT IT ADDS. A `system` is states that change in time only; a temperature
// along a rod, a dye in a channel, an invading population, a queue of traffic
// or a pattern on a reacting plane is a state at every point. Each is
//
//     u_t = (D u_x)_x − F(u)_x + R(u, x, t)          on a line, or
//     u_t = D ∇²u + R(u, x, y, t)                    on a plane,
//
// for one to four species, with what happens at the ends or edges stated. The
// numerics live in lib/numeric/fields.ts and are tested against exact
// solutions there; this file reads a declaration into them and nothing about
// it is domain-specific — heat, Fisher's equation, Burgers' equation and
// Gray–Scott are the same block with different rates.
//
// REFUSING IS THE FEATURE, as it is for a system. A field nobody started, an
// end nobody stated, a rate for a species the field does not carry: each is
// named, in the person's terms, and nothing is assumed in its place. What the
// engine does choose — a grid, a duration nobody gave — it says.
//
// AND IT MARKS ITS OWN WORK. A closed field conserves what it holds, and the
// run says how well it did; a rod with plain ends has an exact Fourier series,
// and the run says how close it came. A picture of a field with no such check
// is a picture with colours.
//
// PURE: declarations in, numbers out.

import { compileExpr, compileVectorExpr, type VectorExpr } from '@/lib/logos-math';
import { field2D, heatSeries, transport1D, type End } from '@/lib/numeric/fields';
import { scopeOf } from './compile';
import type { P3, Primitive } from './primitives';
import { MODEL_CAPS, type Model, type ModelObject, type PdeDecl, type PdeEndDecl, type PdeSpeciesDecl } from './schema';
import type { Missing } from './system';

export const PDE_CAPS = {
  /** species one field may carry */
  species: MODEL_CAPS.fieldSpecies,
  /** intervals along a line */
  line: 400,
  /** cells along each side of a plane */
  plane: 128,
  /** times kept: along a line, every one is a row of the picture; across a plane, a frame */
  keepLine: 101,
  keepPlane: 31,
  /** steps a line may take */
  steps: 20_000,
  /** cell-steps a plane may take — about a second of arithmetic */
  cellSteps: 3e7,
} as const;

export interface PdeRun {
  dim: 1 | 2;
  /** the species, in the order the arrays are in */
  names: string[];
  /** where the values are: nodes along a line, ends included (none repeated on a ring); cell centres across a plane */
  x: number[];
  y?: number[];
  t: number[];
  /** u[s][k] is species s at t[k] — along the line, or row by row across the plane */
  u: Float64Array[][];
  stopped: null | { why: 'diverged' | 'budget'; at: number };
  /** how it was stepped, in words, for the honest note on the picture */
  note: string;
  /** the run marking its own work */
  checks: { what: string; says: string; value: number }[];
  /** what the engine chose because nobody said */
  chose: string[];
  tEnd: number;
}

type Ready = {
  decl: PdeDecl;
  dim: 1 | 2;
  names: string[];
  params: Record<string, number>;
  tEnd: number;
  chose: string[];
};

const fmt = (v: number) => String(Number(v.toPrecision(4)));

/** A number, or an expression in the given names, evaluated once. */
function scalar(v: number | string | undefined, scope: Record<string, number>, names: string[]): number | null {
  if (v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const e = compileExpr(v, names);
  if (!e) return null;
  const r = e.eval(scope);
  return Number.isFinite(r) ? r : null;
}

/** An expression over a grid, into `out`; a number fills it. False when it will not compile. */
function overGrid(v: number | string, bind: Record<string, number | ArrayLike<number>>, names: string[], out: Float64Array): boolean {
  if (typeof v === 'number') {
    out.fill(v);
    return true;
  }
  const e = compileVectorExpr(v, names);
  if (!e) return false;
  e.evalInto(bind, out);
  return true;
}

/** The parameters an expression in a field may use — the controls, without the clock, which a field binds itself. */
function paramsOf(model: Model): Record<string, number> {
  const s = scopeOf(model);
  delete s.t;
  return s;
}

const endOf = (sp: PdeSpeciesDecl, decl: PdeDecl, side: 'left' | 'right'): PdeEndDecl | undefined => sp[side] ?? decl[side];

/**
 * Read a field declaration, or say exactly what is missing.
 */
export function readPde(model: Model, o: ModelObject): { ok: true; ready: Ready } | { ok: false; missing: Missing[] } {
  const decl = o.pde;
  if (!decl || !Array.isArray(decl.species) || !decl.species.length) {
    return { ok: false, missing: [{ what: 'the quantities the field carries', unlocks: 'anything at all: a field of nothing has nothing to spread' }] };
  }
  if (decl.species.length > PDE_CAPS.species) {
    return {
      ok: false,
      missing: [{ what: `a field of at most ${PDE_CAPS.species} species — this one has ${decl.species.length}`, unlocks: 'a run; running some of them would be running a different field' }],
    };
  }
  const dim: 1 | 2 = decl.y ? 2 : 1;
  const names = decl.species.map((s) => s.name);
  // the grammar reads names without case: a temperature called T IS t, the time, and x and y are position
  const taken = names.filter((n) => ['x', 'y', 't'].includes(n.toLowerCase()));
  if (taken.length) {
    return {
      ok: false,
      missing: taken.map((n) => ({
        what: `another name for ${n}`,
        unlocks: 'a run',
        because: `a species called ${n} is read as ${n.toLowerCase()} — names are read without regard to case, and ${n.toLowerCase() === 't' ? 't is time' : `${n.toLowerCase()} is position`}: call it something else, such as ${n.toLowerCase() === 't' ? 'temp or theta' : `${n}1`}`,
      })),
    };
  }
  const params = paramsOf(model);
  const pn = Object.keys(params);
  const space = dim === 1 ? ['x'] : ['x', 'y'];
  const missing: Missing[] = [];
  const chose: string[] = [];

  // how far each species spreads, sampled where it is declared, so a negative one is refused
  const xs = Array.from({ length: 21 }, (_, i) => decl.x[0] + ((decl.x[1] - decl.x[0]) * i) / 20);
  const spread = (sp: PdeSpeciesDecl): number[] | null => {
    if (sp.D === undefined) return [0];
    if (typeof sp.D === 'number') return [sp.D];
    const e = compileExpr(sp.D, [...pn, ...(dim === 1 ? ['x'] : [])]);
    if (!e) return null;
    return (dim === 1 ? xs : [decl.x[0]]).map((x) => e.eval({ ...params, x }));
  };

  for (const sp of decl.species) {
    if (sp.init === undefined) {
      missing.push({ what: `a starting field for ${sp.name}`, unlocks: `a run: where ${sp.means ?? sp.name} begins is not something to assume` });
    } else if (typeof sp.init === 'string' && !compileVectorExpr(sp.init, [...pn, ...space])) {
      missing.push({ what: `a readable starting field for ${sp.name}`, unlocks: `a run; the one given is not an expression in ${space.join(' and ')} and the parameters` });
    }
    const D = spread(sp);
    if (D === null) {
      missing.push({
        what: `a readable diffusivity for ${sp.name}`,
        unlocks: dim === 2 ? 'a run — on a plane the diffusivity is one number, or an expression in the parameters' : 'a run',
      });
    } else if (D.some((d) => !Number.isFinite(d) || d < 0)) {
      missing.push({ what: `a diffusivity for ${sp.name} that is a number no less than zero everywhere`, unlocks: 'a run: a negative diffusivity un-mixes, and no step is stable for it' });
    }
    if (sp.flux) {
      if (dim === 2) {
        missing.push({
          what: `transport of ${sp.name} across a plane`,
          unlocks: 'a run',
          because: 'a field on a plane is stepped by diffusion and reaction only — transport by a flux F(u) is built for a line, not yet for a plane',
        });
      } else if (!compileVectorExpr(sp.flux, [...pn, ...names, 'x', 't'])) {
        missing.push({ what: `a readable flux for ${sp.name}`, unlocks: 'its transport; the one given does not compile in the species, x, t and the parameters' });
      }
    }
  }
  for (const [k, v] of Object.entries(decl.react ?? {})) {
    if (!names.some((n) => n.toLowerCase() === k.toLowerCase())) {
      missing.push({ what: `a species called ${k}`, unlocks: `its rate — one is given for ${k}, and the field carries ${names.join(', ')}` });
    } else if (!compileVectorExpr(v, [...pn, ...names, ...space, 't'])) {
      missing.push({ what: `a readable rate for ${k}`, unlocks: `its reaction; the one given does not compile in the species, ${space.join(', ')}, t and the parameters` });
    }
  }

  const moves = (sp: PdeSpeciesDecl) => {
    const D = spread(sp);
    return !!sp.flux || (!!D && D.some((d) => d > 0));
  };
  if (dim === 1 && !decl.periodic) {
    for (const sp of decl.species) {
      if (!moves(sp)) continue;
      for (const side of ['left', 'right'] as const) {
        const e = endOf(sp, decl, side);
        if (!e || (e.value === undefined && e.flux === undefined)) {
          missing.push({ what: `what happens at the ${side} end for ${sp.name}: a value held there, or a flux in (0 for insulated)`, unlocks: 'a run — an end nobody stated is not one to assume' });
          continue;
        }
        const v = e.value ?? e.flux!;
        if (typeof v === 'string' && !compileExpr(v, [...pn, 't'])) missing.push({ what: `a readable ${e.value !== undefined ? 'value' : 'flux'} at the ${side} end for ${sp.name}`, unlocks: 'a run; an end may be a number or an expression in t and the parameters' });
      }
    }
  }
  if (dim === 2 && decl.species.some(moves)) {
    if (!decl.edges) missing.push({ what: 'what happens at the edges: periodic, insulated or held', unlocks: 'a run — an edge nobody stated is not one to assume' });
    else if (decl.edges === 'held') {
      for (const sp of decl.species) {
        if (!moves(sp)) continue;
        if (scalar(sp.edge, params, pn) === null) missing.push({ what: `the value held at the edges for ${sp.name}`, unlocks: 'a run with held edges' });
      }
    }
  }

  // HOW LONG: as given; else the model's clock; else one diffusion time across it — and the last two are said
  let tEnd = scalar(decl.tEnd, params, pn);
  if (decl.tEnd !== undefined && !(tEnd !== null && tEnd > 0)) {
    missing.push({ what: 'a duration that is a positive number', unlocks: 'a run' });
    tEnd = null;
  } else if (tEnd === null) {
    if (model.time && model.time.max > 0) {
      tEnd = model.time.max;
      chose.push(`run to t = ${fmt(tEnd)}, the end of the model's clock, as no duration was given`);
    } else {
      const L = Math.max(decl.x[1] - decl.x[0], decl.y ? decl.y[1] - decl.y[0] : 0);
      const Dmax = Math.max(0, ...decl.species.flatMap((sp) => spread(sp) ?? [0]));
      if (Dmax > 0) {
        tEnd = (L * L) / Dmax;
        chose.push(`run for one diffusion time, L²/D = ${fmt(tEnd)}, as no duration was given`);
      } else missing.push({ what: 'how long to run it', unlocks: 'a run: nothing in it spreads, so there is no time of its own to run it for' });
    }
  }
  // A PLANE'S SIZE IS KNOWN BEFORE IT RUNS: its stability bound and its budget of cell-steps are arithmetic, so
  // the router, the capability grade and the picture all hear the refusal, not only the solver
  if (dim === 2 && tEnd !== null && !missing.length) {
    const n = Math.min(PDE_CAPS.plane, Math.max(8, Math.round(decl.n ?? 64)));
    const hx = (decl.x[1] - decl.x[0]) / n;
    const hy = (decl.y![1] - decl.y![0]) / n;
    const Dmax = Math.max(0, ...decl.species.flatMap((sp) => spread(sp) ?? [0]));
    const limit = Dmax > 0 ? 1 / (2 * Dmax * (1 / (hx * hx) + 1 / (hy * hy))) : Infinity;
    const dt = decl.dt ?? Math.min(0.9 * limit, tEnd / 100);
    if (dt > limit * (1 + 1e-12)) {
      missing.push({ what: 'a step within the stability limit', unlocks: 'a run', because: `a step of ${fmt(dt)} is above the stability limit 1/(2·max D·(1/hx² + 1/hy²)) = ${fmt(limit)} for forward Euler; take a smaller one` });
    } else {
      const steps = Math.max(1, Math.ceil(tEnd / dt - 1e-9));
      if (steps * n * n > PDE_CAPS.cellSteps) {
        missing.push({
          what: 'a smaller run',
          unlocks: 'a picture',
          because: `${steps} steps on ${n} × ${n} cells is ${(steps * n * n).toExponential(2)} cell-steps, more than the ${PDE_CAPS.cellSteps.toExponential(1)} a run may take — a coarser grid, a shorter run or a larger step within the limit`,
        });
      }
    }
  }
  if (missing.length) return { ok: false, missing };
  return { ok: true, ready: { decl, dim, names, params, tEnd: tEnd!, chose } };
}

/** Run it: the solver for a line or a plane, and the run's own checks. */
export function simulatePde(model: Model, o: ModelObject): { ok: true; run: PdeRun } | { ok: false; missing: Missing[] } {
  const read = readPde(model, o);
  if (!read.ok) return read;
  const { decl, dim, names, params, tEnd } = read.ready;
  const chose = [...read.ready.chose];
  const pn = Object.keys(params);
  const K = names.length;
  const lower = names.map((n) => n.toLowerCase());
  const rates: (VectorExpr | null)[] = names.map((n) => {
    const key = Object.keys(decl.react ?? {}).find((k) => k.toLowerCase() === n.toLowerCase());
    return key ? compileVectorExpr(decl.react![key], [...pn, ...names, 'x', 'y', 't']) : null;
  });
  const reacts = rates.some(Boolean);

  if (dim === 1) {
    const ring = !!decl.periodic;
    const asked = decl.n ?? 100;
    const n = Math.min(PDE_CAPS.line, Math.max(ring ? 8 : 4, Math.round(asked)));
    if (n !== asked) chose.push(`on ${n} intervals${asked > PDE_CAPS.line ? `, the most a line is given (${asked} were asked for)` : ''}`);
    const N = ring ? n : n + 1;
    const h = (decl.x[1] - decl.x[0]) / n;
    const xs = Float64Array.from({ length: N }, (_, i) => decl.x[0] + i * h);
    const base: Record<string, number | ArrayLike<number>> = { ...params, x: xs };
    const sp = decl.species.map((s) => {
      const init = new Float64Array(N);
      overGrid(s.init!, base, [...pn, 'x'], init);
      const D = new Float64Array(N);
      if (s.D !== undefined) overGrid(s.D, base, [...pn, 'x'], D);
      const end = (side: 'left' | 'right'): End | undefined => {
        const e = endOf(s, decl, side);
        if (!e) return undefined;
        const v = e.value ?? e.flux;
        if (v === undefined) return undefined;
        const f = typeof v === 'number' ? () => v : ((c) => (t: number) => (c ? c.eval({ ...params, t }) : NaN))(compileExpr(v, [...pn, 't']));
        return e.value !== undefined ? { type: 'value', at: f } : { type: 'flux', at: f };
      };
      return { init, D, left: end('left'), right: end('right') };
    });
    const bad = sp.findIndex((s) => !s.init.every(Number.isFinite));
    if (bad >= 0) return { ok: false, missing: [{ what: `a starting field for ${names[bad]} with a value at every point of the line`, unlocks: 'a run; the one given has none somewhere in it' }] };

    const bind = (t: number, u: Float64Array[]) => {
      const b: Record<string, number | ArrayLike<number>> = { ...base, t };
      lower.forEach((n, s) => (b[n] = u[s]));
      return b;
    };
    const react = reacts
      ? (t: number, u: Float64Array[], out: Float64Array[]) => {
          const b = bind(t, u);
          rates.forEach((r, s) => r?.evalInto(b, out[s]));
        }
      : undefined;
    const fluxes = decl.species.map((s) => (s.flux ? compileVectorExpr(s.flux, [...pn, ...names, 'x', 't']) : null));
    const moved = fluxes.map(Boolean);
    const up = new Float64Array(N);
    const dn = new Float64Array(N);
    const Fp = new Float64Array(N);
    const Fm = new Float64Array(N);
    const flux = moved.some(Boolean)
      ? (t: number, u: Float64Array[], F: Float64Array[], speed: Float64Array[]) => {
          const b = bind(t, u);
          fluxes.forEach((f, s) => {
            if (!f) return;
            f.evalInto(b, F[s]);
            // its speed |∂F/∂u|, by a central difference in this species alone
            for (let i = 0; i < N; i++) {
              const d = 1e-6 * (1 + Math.abs(u[s][i]));
              up[i] = u[s][i] + d;
              dn[i] = u[s][i] - d;
            }
            f.evalInto({ ...b, [lower[s]]: up }, Fp);
            f.evalInto({ ...b, [lower[s]]: dn }, Fm);
            for (let i = 0; i < N; i++) speed[s][i] = Math.abs(Fp[i] - Fm[i]) / (up[i] - dn[i]);
          });
        }
      : undefined;
    const run = transport1D(
      { x0: decl.x[0], x1: decl.x[1], n, periodic: ring, species: sp, react, flux, transported: moved },
      tEnd,
      { keep: PDE_CAPS.keepLine, maxSteps: PDE_CAPS.steps, ...(decl.dt ? { dt: decl.dt } : {}) }
    );

    // ── the run marks its own work ──
    const checks: PdeRun['checks'] = [];
    const total = (u: Float64Array) => (ring ? u.reduce((a, v) => a + v, 0) * h : (u.reduce((a, v) => a + v, 0) - (u[0] + u[N - 1]) / 2) * h);
    // CLOSED AS DECLARED: a ring, or every end of every species that spreads stated insulated — a flux that
    // happens to be zero at the start and the end is not an insulated end
    const closed =
      ring ||
      (!moved.some(Boolean) &&
        decl.species.every((s0, si) => !sp[si].D.some((d) => d > 0) || (['left', 'right'] as const).every((side) => endOf(s0, decl, side)?.flux === 0)));
    if (closed && !reacts) {
      names.forEach((nm, s) => {
        const a = total(run.u[s][0]);
        const b = total(run.u[s][run.u[s].length - 1]);
        const rel = Math.abs(b - a) / Math.max(1e-300, Math.abs(a) || 1);
        checks.push({ what: `∫${nm} dx`, value: rel, says: `nothing enters or leaves, and ∫${nm} dx is kept to ${rel.toExponential(1)} of itself` });
      });
    }
    // ONE SPECIES DIFFUSING AT ONE RATE, ITS ENDS HELD AT NUMBERS OR INSULATED: the exact series exists
    const s0 = decl.species[0];
    const D0 = K === 1 ? scalar(s0.D, params, pn) : null;
    if (K === 1 && !reacts && !moved[0] && !ring && D0 !== null && D0 > 0 && s0.init !== undefined) {
      // an end held at a constant — a number or the parameters, not the clock — or stated insulated
      const kindOf = (e: PdeEndDecl | undefined): number | 'insulated' | null => {
        if (e?.value !== undefined) return scalar(e.value, params, pn);
        return e?.flux !== undefined && scalar(e.flux, params, pn) === 0 ? 'insulated' : null;
      };
      const L = kindOf(endOf(s0, decl, 'left'));
      const R = kindOf(endOf(s0, decl, 'right'));
      const u0c = typeof s0.init === 'number' ? null : compileExpr(s0.init, [...pn, 'x']);
      if (L !== null && R !== null) {
        const u0 = (x: number) => (u0c ? u0c.eval({ ...params, x }) : (s0.init as number));
        const held = L !== 'insulated' && R !== 'insulated';
        const ref = heatSeries(u0, decl.x[0], decl.x[1], D0, { left: L, right: R }, 200, 2000);
        const range = Math.max(1e-300, Math.max(...run.u[0][0]) - Math.min(...run.u[0][0]));
        let worst = 0;
        const ks = [0.25, 0.5, 0.75, 1].map((f) => Math.max(1, Math.round(f * (run.t.length - 1))));
        for (const k of ks) for (let i = 0; i < N; i++) worst = Math.max(worst, Math.abs(run.u[0][k][i] - ref(xs[i], run.t[k])));
        const range2 = Math.max(range, Math.abs(ref(xs[0], 0) - ref(xs[N - 1], 0)));
        const series = held ? 'sine' : L === 'insulated' && R === 'insulated' ? 'cosine' : 'quarter-wave';
        checks.push({ what: 'the exact Fourier series', value: worst / range2, says: `against the exact ${series} series it is within ${((100 * worst) / range2).toPrecision(2)}% of its range` });
      }
    }
    const stopped = run.stats.stopped;
    return {
      ok: true,
      run: {
        dim: 1,
        names,
        x: Array.from(xs),
        t: run.t,
        u: run.u,
        stopped,
        note: `${run.stats.scheme}; ${N} points ${ring ? 'round a ring' : 'along a line'}, h = ${fmt(h)}; ${run.stats.steps} steps of ${fmt(run.stats.dtMin)}${run.stats.dtMax > run.stats.dtMin * (1 + 1e-9) ? `–${fmt(run.stats.dtMax)}` : ''}${stopped ? stopped.why === 'diverged' ? `; it left the numbers at t = ${fmt(stopped.at)} and stopped there` : `; it reached its budget of ${PDE_CAPS.steps} steps at t = ${fmt(stopped.at)} and stopped there` : ''}`,
        checks,
        chose,
        tEnd,
      },
    };
  }

  // ── a plane of cells ──
  const asked = decl.n ?? 64;
  const n = Math.min(PDE_CAPS.plane, Math.max(8, Math.round(asked)));
  if (n !== asked) chose.push(`on ${n} × ${n} cells${asked > PDE_CAPS.plane ? `, the most a plane is given (${asked} were asked for)` : ''}`);
  const [x0, x1] = decl.x;
  const [y0, y1] = decl.y!;
  const hx = (x1 - x0) / n;
  const hy = (y1 - y0) / n;
  const N = n * n;
  const X = new Float64Array(N);
  const Y = new Float64Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    X[j * n + i] = x0 + (i + 0.5) * hx;
    Y[j * n + i] = y0 + (j + 0.5) * hy;
  }
  const base: Record<string, number | ArrayLike<number>> = { ...params, x: X, y: Y };
  const edges = decl.edges ?? 'periodic';
  const sp = decl.species.map((s) => {
    const init = new Float64Array(N);
    overGrid(s.init!, base, [...pn, 'x', 'y'], init);
    return { D: scalar(s.D ?? 0, params, pn) ?? 0, init, edge: scalar(s.edge, params, pn) ?? 0 };
  });
  const bad = sp.findIndex((s) => !s.init.every(Number.isFinite));
  if (bad >= 0) return { ok: false, missing: [{ what: `a starting field for ${names[bad]} with a value in every cell`, unlocks: 'a run; the one given has none somewhere on the plane' }] };
  const react = reacts
    ? (t: number, u: Float64Array[], out: Float64Array[]) => {
        const b: Record<string, number | ArrayLike<number>> = { ...base, t };
        lower.forEach((nm, s) => (b[nm] = u[s]));
        rates.forEach((r, s) => r?.evalInto(b, out[s]));
      }
    : undefined;
  const run = field2D({ nx: n, ny: n, hx, hy, edges, species: sp, react }, tEnd, { keep: PDE_CAPS.keepPlane, budget: PDE_CAPS.cellSteps, ...(decl.dt ? { dt: decl.dt } : {}) });
  if ('refused' in run) return { ok: false, missing: [{ what: 'a run this size', unlocks: 'a picture', because: run.refused }] };
  const checks: PdeRun['checks'] = [];
  if (!reacts && edges !== 'held') {
    names.forEach((nm, s) => {
      const tot = (u: Float64Array) => u.reduce((a, v) => a + v, 0) * hx * hy;
      const a = tot(run.u[s][0]);
      const b = tot(run.u[s][run.u[s].length - 1]);
      const rel = Math.abs(b - a) / Math.max(1e-300, Math.abs(a) || 1);
      checks.push({ what: `∬${nm} dA`, value: rel, says: `nothing crosses the edges, and ∬${nm} dA is kept to ${rel.toExponential(1)} of itself` });
    });
  }
  const stopped = run.stats.stopped;
  return {
    ok: true,
    run: {
      dim: 2,
      names,
      x: Array.from({ length: n }, (_, i) => x0 + (i + 0.5) * hx),
      y: Array.from({ length: n }, (_, j) => y0 + (j + 0.5) * hy),
      t: run.t,
      u: run.u,
      stopped,
      note: `${run.stats.method}; ${n} × ${n} cells; ${run.stats.steps} steps of ${fmt(run.stats.dt)} (stable below ${fmt(run.stats.limit)})${stopped ? `; it left the numbers at t = ${fmt(stopped.at)} and stopped there` : ''}`,
      checks,
      chose,
      tEnd,
    },
  };
}

// ── one run per model state ──────────────────────────────────────────
//
// As for a system: the run depends on the declaration and the parameters, not
// on the clock, so scrubbing time replays it rather than recomputing it.

const RUNS = new Map<string, { ok: true; run: PdeRun } | { ok: false; missing: Missing[] }>();

function digest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function pdeRunFor(model: Model, o: ModelObject): { ok: true; run: PdeRun } | { ok: false; missing: Missing[] } {
  const p = paramsOf(model);
  const key = `${model.id}:${o.id}:${digest(JSON.stringify({ pde: o.pde, p: Object.keys(p).sort().map((k) => [k, p[k]]), clock: o.pde?.tEnd === undefined ? model.time?.max ?? null : null }))}`;
  const held = RUNS.get(key);
  if (held) return held;
  const made = simulatePde(model, o);
  if (RUNS.size > 24) RUNS.clear();
  RUNS.set(key, made);
  return made;
}

export function forgetPdeRuns(): void {
  RUNS.clear();
}

/** One species at a time, between the times kept — linear in time, which is how a computed field is replayed. */
export function fieldAt(run: PdeRun, s: number, t: number): { u: Float64Array; at: number } {
  const T = run.t;
  const U = run.u[s];
  if (t <= T[0]) return { u: U[0], at: T[0] };
  const last = T.length - 1;
  if (t >= T[last]) return { u: U[last], at: T[last] };
  let k = Math.min(last - 1, Math.max(0, Math.floor(((t - T[0]) / (T[last] - T[0])) * last)));
  while (k > 0 && T[k] > t) k--;
  while (k < last - 1 && T[k + 1] < t) k++;
  const f = (t - T[k]) / Math.max(1e-300, T[k + 1] - T[k]);
  const out = new Float64Array(U[k].length);
  for (let i = 0; i < out.length; i++) out[i] = U[k][i] + f * (U[k + 1][i] - U[k][i]);
  return { u: out, at: t };
}

/** Which species the picture shows: the one the block names, else the first. */
export function shownSpecies(o: ModelObject): number {
  const want = o.pde?.show?.toLowerCase();
  const i = want ? (o.pde?.species ?? []).findIndex((s) => s.name.toLowerCase() === want) : -1;
  return i >= 0 ? i : 0;
}

/**
 * The picture of a run.
 *
 * ALONG A LINE: the whole history at once — position across, time up, the
 * value as colour — and a line at the clock's time. Seen in three dimensions
 * the same rows are the surface u(x, t).
 *
 * ACROSS A PLANE: the field at the clock's time, the value as colour; in three
 * dimensions, the surface u(x, y). Scrubbing the clock replays the run.
 */
export function pdePrimitives(model: Model, o: ModelObject, run: PdeRun, layer?: string): { primitives: Primitive[]; note: string } {
  const s = shownSpecies(o);
  const name = run.names[s];
  const extra = run.names.length > 1 ? `; showing ${name} of ${run.names.join(', ')}` : '';
  const checks = run.checks.length ? `; ${run.checks.map((c) => c.says).join('; ')}` : '';
  const chose = run.chose.length ? `; ${run.chose.join('; ')}` : '';
  if (run.dim === 1) {
    const rows: P3[][] = run.t.map((t, k) => run.x.map((x, i) => ({ x, y: t, z: run.u[s][k][i] })));
    const scalar = run.t.map((_, k) => Array.from(run.u[s][k]));
    const prims: Primitive[] = [{ p: 'mesh', of: o.id, rows, fill: true, scalar, layer, tone: 'primary' }];
    const now = model.time?.t;
    if (now !== undefined && now >= run.t[0] && now <= run.t[run.t.length - 1]) {
      const here = fieldAt(run, s, now).u;
      prims.push({ p: 'polyline', of: o.id, at: run.x.map((x, i) => ({ x, y: now, z: here[i] })), layer, tone: 'tension', width: 1.4 });
    }
    return { primitives: prims, note: `${run.note}${extra}${checks}${chose}` };
  }
  const now = model.time?.t ?? run.t[run.t.length - 1];
  const { u, at } = fieldAt(run, s, now);
  const nx = run.x.length;
  const rows: P3[][] = run.y!.map((y, j) => run.x.map((x, i) => ({ x, y, z: u[j * nx + i] })));
  const scalar = run.y!.map((_, j) => Array.from(u.subarray(j * nx, (j + 1) * nx)));
  return {
    primitives: [{ p: 'mesh', of: o.id, rows, fill: true, scalar, layer, tone: 'primary' }],
    note: `${run.note}; at t = ${fmt(at)}${model.time ? '' : ', the end of the run'}${extra}${checks}${chose}`,
  };
}
