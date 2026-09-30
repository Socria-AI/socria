// lib/model/equations.ts
//
// A SOLVED SYSTEM, WRITTEN OUT AS OBJECTS.
//
// The fourth expander, and the same move the other three make: a declaration is
// a compact way to write down objects, and this unpacks it. What comes out of a
// system of equations is the values that satisfy them — each one a quantity in
// its own right, with a value, a provenance saying a computation produced it,
// and a place in the dependency graph so that moving a control it depends on
// marks it stale.
//
// WHAT THIS DELIBERATELY DOES NOT DO: arithmetic. Every number here comes from
// lib/model/algebra.ts, which reads the equations into rows, solves by
// elimination and checks the residual. Nothing in this file adds two numbers
// together, and nothing anywhere asks a language model to.
//
// AND IT DOES NOT KNOW WHAT A MARKET IS. The unknowns are whatever the
// declaration named. A market equilibrium, a circuit's node voltages, a static
// force balance and two lines crossing all come out of here as the same shape,
// because to this file they are the same shape.
//
// PURE.

import { solveSystem, type LinearRow, type Solved } from './algebra';
import type { Model, ModelObject } from './schema';
import { bindings, symbolTable } from './symbols';

/** The answer for one carrier, cached per model so a build does not re-solve. */
export function solutionFor(model: Model, carrier: ModelObject): Solved | null {
  if (!carrier.equations) return null;
  return solveSystem(carrier.equations.relations, carrier.equations.unknowns, bindings(symbolTable(model)));
}

/**
 * Turn a solved system into the quantities it determines.
 *
 * Idempotent by id, like every other expander: a model is unpacked on every
 * build, and a build happens on every frame.
 */
export function expandEquations(model: Model): Model {
  const carriers = model.objects.filter((o) => !!o.equations);
  if (!carriers.length) return model;

  // REPLACED, NOT SKIPPED — and this is the one expander where that is true.
  //
  // The others are idempotent by LEAVING an id alone: a body expanded out of a
  // mechanism is the same body every time, because its identity is structural.
  // A SOLVED VALUE IS NOT. It is derived from the parameter values as they
  // stand, so an existing `eq__pp` is not "already done", it is "done from the
  // numbers that were there last time".
  //
  // Verified before this: setting the tax to 20 and then to 0 left the
  // equilibrium reading 24/34/52 — the t = 10 answer — on a document that had
  // faithfully recorded both changes. The solve never re-ran because its
  // output was already present.
  const solved = new Map<string, ModelObject>();
  const added: ModelObject[] = [];

  for (const carrier of carriers) {
    const decl = carrier.equations!;
    const got = solutionFor(model, carrier);
    if (!got) continue;

    for (const name of decl.unknowns) {
      const id = `${carrier.id}__${name}`;
      const value = got.values?.[name];

      solved.set(id, {
        id,
        kind: 'scalar',
        label: name,
        meaning:
          value !== undefined
            ? `solved from ${decl.relations.length} equation${decl.relations.length === 1 ? '' : 's'} holding at once`
            : `an unknown of this system; the equations do not determine it yet`,
        // The value goes in `meta` where the symbol table reads it, so a later
        // expression naming this quantity binds to the solved number.
        meta: {
          of: carrier.id,
          role: 'solution',
          unknown: name,
          ...(value !== undefined ? { value } : {}),
        },
        relations: [
          { to: carrier.id, as: 'derived-from', why: 'it is one of the values that satisfy this system' },
        ],
        // NOT `computation` when nothing was computed. An unknown the equations
        // leave free has no value and must not read as one that does.
        ...(value !== undefined
          ? {
              fidelity: 'model-derived' as const,
              provenance: {
                origin: 'computation' as const,
                detail: `solved by elimination from ${decl.relations.length} equations; residual ${(got.residual ?? 0).toExponential(1)}`,
              },
            }
          : {
              fidelity: 'conceptual' as const,
              provenance: {
                origin: 'equation' as const,
                detail: 'named as an unknown; the equations as written do not determine it',
              },
            }),
      });
    }
  }

  if (!solved.size) return model;
  // Existing solutions are overwritten in place, so the order of the objects
  // does not shift under a recompute; genuinely new ones are appended.
  const kept = model.objects.map((o) => solved.get(o.id) ?? o);
  const fresh = [...solved.entries()].filter(([id]) => !model.objects.some((o) => o.id === id));
  return { ...model, objects: [...kept, ...fresh.map(([, o]) => o)] };
}

/** The system written out, for a reader and for the conversation. */
export function equationLines(o: ModelObject, got: Solved | null): string[] {
  const decl = o.equations;
  if (!decl) return [];
  const out = [
    `${o.label}: ${decl.relations.length} equations in ${decl.unknowns.join(', ')}.`,
    ...decl.relations.map((r) => `  ${r}`),
  ];
  if (got) {
    out.push(
      got.values
        ? `Solved: ${got.says}. Largest residual ${(got.residual ?? 0).toExponential(1)} — the answer was checked against the equations, not just produced.`
        : `Not solved: ${got.says}`
    );
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// READING A SOLVED SYSTEM AS A FIGURE
//
// WHAT WAS WRONG, and it survived the solver landing: the numbers came out
// right — Pp = 24, Pc = 34, Q* = 52 — and the picture was still empty. A
// dimensionality of 2 instead of 3 is a less wrong empty box, not a figure.
//
// SO WHERE DOES THE PICTURE COME FROM? Not from anybody drawing supply and
// demand. From the rows the solver already built. A linear relation over the
// unknowns IS a line; a solution IS a point; and the only real question is
// WHICH TWO AXES to draw them against.
//
// THAT QUESTION HAS A STRUCTURAL ANSWER. Unknowns are not independent axes —
// some of them are the same kind of quantity as each other, and two quantities
// of the same kind belong on ONE axis. `Qd` and `Qs` are both quantities;
// `Pc` and `Pp` are both prices. Four unknowns, two axes.
//
// HOW THAT IS DECIDED, in order:
//
//   1. DECLARED UNITS. Same unit → same axis. Different units → never.
//      Dimensionally correct, and the author's to state.
//
//   2. THE ALGEBRAIC FORM, when units are absent: a row of the shape
//      `c·u − c·v = k` says v is u shifted by k, and a shift is only
//      meaningful between quantities of the same kind. `Qd = Qs` and
//      `Pc = Pp + t` are both of that shape; `Qd = 120 − 2·Pc` is not.
//
//      This is weaker than units and it is worth saying how it fails: a
//      relation that genuinely subtracts unlike quantities — `profit =
//      revenue − cost` is fine, but `slack = capacity − rate` is not — would
//      group them. Declare units and the question never arises.
//
// EVERY OTHER ROW IS A LOCUS: it touches one unknown on each axis, and with the
// remaining unknowns held at their solved values it is a straight line, drawn
// from its own coefficients at two points. Two points exactly, because a linear
// relation is a line and sampling it forty times would be theatre.
//
// AND THE WEDGE FALLS OUT. `Pc = Pp + t` is an offset between two unknowns on
// the price axis, so at the solution it is a segment from Pp* to Pc*. Its
// length is t. Nothing here knows the word tax; set t = 0 and the segment has
// zero length and is not drawn, which is also correct.
//
// NO DOMAIN APPEARS BELOW. Node voltages against branch currents, two forces
// against two displacements, moles against moles, and two lines crossing all
// come through the same code.

/** Unknowns the system says are the same kind of quantity, so one axis. */
export interface AxisGroup {
  /** the unknowns on it, in the order the declaration named them */
  of: string[];
  label: string;
  units?: string;
  /** what put them together, so the grouping is arguable rather than magic */
  why: string;
}

/** One relation, as the line it is in the plane the figure chose. */
export interface Locus {
  /** the equation this is the graph of */
  from: string;
  /** the unknown of the horizontal group it touches, when it touches one */
  h?: string;
  /** the unknown of the vertical group it touches, when it touches one */
  v?: string;
  at: { x: number; y: number }[];
  /** unknowns held at their solved values to get this line, named not hidden */
  held: string[];
}

/** An offset between two unknowns on one axis, at the solution. */
export interface Gap {
  from: string;
  between: [string, string];
  /** which axis the two unknowns share */
  along: 'h' | 'v';
  /** where on the other axis it is drawn */
  at: number;
  lo: number;
  hi: number;
  size: number;
}

export interface Figure {
  h: AxisGroup;
  v: AxisGroup;
  /** groups this plane does not show; their unknowns are held, and said to be */
  held: AxisGroup[];
  loci: Locus[];
  points: { h: string; v: string; x: number; y: number }[];
  gaps: Gap[];
  why: string;
  /** relations that do not live in this plane, named rather than dropped */
  offPlane: string[];
}

/** The indices whose coefficients are not zero, at the row's own scale. */
function support(row: LinearRow): number[] {
  const scale = Math.max(0, ...row.coefficients.map((c) => Math.abs(c)));
  const floor = Math.max(1e-12, scale * 1e-10);
  const out: number[] = [];
  row.coefficients.forEach((c, i) => {
    if (Math.abs(c) > floor) out.push(i);
  });
  return out;
}

/** Is this row `c·u − c·v = k`? Those two unknowns then share an axis. */
function offsetPair(row: LinearRow): [number, number] | null {
  const sup = support(row);
  if (sup.length !== 2) return null;
  const a = row.coefficients[sup[0]];
  const b = row.coefficients[sup[1]];
  if (Math.abs(a + b) > Math.abs(a) * 1e-9) return null;
  return [sup[0], sup[1]];
}

/**
 * Which unknowns share an axis, and why.
 *
 * Units first, the algebraic form second, and a declared unit can BLOCK a
 * grouping the form would otherwise make — two quantities the author says are
 * measured differently are not put on one axis by an accident of sign.
 */
export function axesFor(
  decl: { unknowns: string[]; units?: Record<string, string> },
  got: Solved
): AxisGroup[] {
  const us = got.unknowns;
  const units = decl.units ?? {};
  const parent = us.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) [i, parent[i]] = [parent[i], r];
    return r;
  };
  const reasons: string[] = [];
  const unlike = (i: number, j: number) => {
    const a = units[us[i]];
    const b = units[us[j]];
    return !!a && !!b && a !== b;
  };
  const join = (i: number, j: number, why: string) => {
    if (unlike(i, j)) return;
    const a = find(i);
    const b = find(j);
    if (a === b) return;
    parent[b] = a;
    reasons.push(why);
  };

  // 1. the same declared unit.
  for (let i = 0; i < us.length; i++) {
    for (let j = i + 1; j < us.length; j++) {
      if (units[us[i]] && units[us[i]] === units[us[j]]) {
        join(i, j, `${us[i]} and ${us[j]} are both in ${units[us[i]]}`);
      }
    }
  }
  // 2. …then a relation of the form `c·u − c·v = k`.
  for (const row of got.rows ?? []) {
    const pair = offsetPair(row);
    if (pair) join(pair[0], pair[1], `“${row.from}” shifts one by a constant, so they are the same kind of quantity`);
  }

  const byRoot = new Map<number, number[]>();
  us.forEach((_, i) => {
    const r = find(i);
    byRoot.set(r, [...(byRoot.get(r) ?? []), i]);
  });

  const rows = got.rows ?? [];
  const groups = [...byRoot.values()].map((idx) => {
    const of = idx.map((i) => us[i]);
    const unit = of.map((u) => units[u]).find(Boolean);
    return {
      idx,
      group: {
        of,
        label: of.join(' / '),
        ...(unit ? { units: unit } : {}),
        why:
          of.length === 1
            ? `${of[0]} is the only unknown of its kind here`
            : reasons.filter((r) => of.some((u) => r.includes(u))).join('; ') || `${of.join(' and ')} share an axis`,
      } as AxisGroup,
    };
  });

  // WHICH GROUP IS HORIZONTAL: the one more of the relations touch, and where
  // that ties, the one the author named first. A tie-break the author controls
  // is better than one they cannot see.
  const touched = (idx: number[]) => rows.filter((r) => support(r).some((i) => idx.includes(i))).length;
  groups.sort((a, b) => touched(b.idx) - touched(a.idx) || Math.min(...a.idx) - Math.min(...b.idx));
  return groups.map((g) => g.group);
}

/** The window one axis is drawn over, taken from the answer's own scale. */
function windowFor(group: AxisGroup, values: Record<string, number>): [number, number] {
  const vs = group.of.map((u) => values[u]).filter((v) => Number.isFinite(v));
  if (!vs.length) return [0, 1];
  const lo0 = Math.min(...vs);
  const hi0 = Math.max(...vs);
  const centre = (lo0 + hi0) / 2;
  // The solution sets the scale: the window reaches as far past it as it is
  // from the origin, which shows the whole of a relation that crosses zero.
  const reach = Math.max(hi0 - lo0, Math.abs(centre), 1);
  let lo = centre - reach;
  const hi = centre + reach;
  // A quantity that never goes negative in the answer is not shown negative.
  if (lo0 >= 0 && lo < 0) lo = 0;
  return [lo, hi];
}

/**
 * The solved system, read as a figure in the plane.
 *
 * Returns null when there is no answer to draw, or when every unknown turns out
 * to be the same kind of quantity and there is therefore no second axis. Both
 * are stated by the caller rather than shown as an empty box.
 */
export function figureFor(model: Model, carrier: ModelObject, got?: Solved | null): Figure | null {
  const decl = carrier.equations;
  if (!decl) return null;
  const solved = got ?? solutionFor(model, carrier);
  if (!solved?.values || !solved.rows) return null;
  const values = solved.values;
  const groups = axesFor(decl, solved);
  if (groups.length < 2) return null;

  const [h, v, ...held] = groups;
  const hx = windowFor(h, values);
  const vy = windowFor(v, values);
  const us = solved.unknowns;
  const pick = (row: LinearRow, group: AxisGroup): string | null => {
    let best: string | null = null;
    let mag = 0;
    for (const u of group.of) {
      const i = us.indexOf(u);
      if (i < 0) continue;
      const c = Math.abs(row.coefficients[i]);
      if (c > mag) {
        mag = c;
        best = u;
      }
    }
    const scale = Math.max(0, ...row.coefficients.map((c) => Math.abs(c)));
    return mag > Math.max(1e-12, scale * 1e-10) ? best : null;
  };

  const loci: Locus[] = [];
  const gaps: Gap[] = [];
  const offPlane: string[] = [];
  const seen = new Set<string>();
  const points: Figure['points'] = [];

  for (const row of solved.rows) {
    const pair = offsetPair(row);
    if (pair) {
      const [a, b] = [us[pair[0]], us[pair[1]]];
      const along: 'h' | 'v' | null = h.of.includes(a) && h.of.includes(b) ? 'h' : v.of.includes(a) && v.of.includes(b) ? 'v' : null;
      if (along) {
        const lo = Math.min(values[a], values[b]);
        const hi = Math.max(values[a], values[b]);
        const size = hi - lo;
        // A zero-length offset is not drawn. With no tax the two prices are one
        // price and a segment of length nothing would be a mark claiming a gap.
        if (Number.isFinite(size) && size > 0) {
          const other = along === 'h' ? v : h;
          const at = other.of.map((u) => values[u]).filter((x) => Number.isFinite(x));
          gaps.push({
            from: row.from,
            between: [a, b],
            along,
            at: at.length ? at.reduce((s, x) => s + x, 0) / at.length : 0,
            lo,
            hi,
            size,
          });
        }
        continue;
      }
    }

    const hu = pick(row, h);
    const vu = pick(row, v);
    // A relation touching neither axis is not in this plane. It is named rather
    // than dropped, because "there is a relationship you are not looking at" is
    // a fact about the figure.
    if (!hu && !vu) {
      offPlane.push(row.from);
      continue;
    }
    const ih = hu ? us.indexOf(hu) : -1;
    const iv = vu ? us.indexOf(vu) : -1;
    // Everything else in the row is held at what the solve says it is, which is
    // the slice this line is a line of — and the slice is reported.
    let rest = 0;
    const heldNames: string[] = [];
    us.forEach((u, i) => {
      if (i === ih || i === iv) return;
      const c = row.coefficients[i];
      if (Math.abs(c) <= 1e-12) return;
      rest += c * (values[u] ?? 0);
      heldNames.push(u);
    });
    const rhs = row.rhs - rest;
    const ch = ih >= 0 ? row.coefficients[ih] : 0;
    const cv = iv >= 0 ? row.coefficients[iv] : 0;
    // THREE SHAPES, AND ALL THREE ARE LINES. A relation over both axes slopes; a
    // relation that fixes the horizontal quantity alone — `qd = 52`, a clamped
    // voltage, a fixed flow — is a vertical line, and one that fixes the vertical
    // quantity alone is a horizontal one. Leaving the last two out is how a
    // relation the model states goes missing from the picture of it.
    const at: { x: number; y: number }[] =
      ih >= 0 && iv >= 0
        ? [hx[0], hx[1]].map((x) => ({ x, y: (rhs - ch * x) / cv }))
        : ih >= 0
          ? [vy[0], vy[1]].map((y) => ({ x: rhs / ch, y }))
          : [hx[0], hx[1]].map((x) => ({ x, y: rhs / cv }));
    if (!at.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
      offPlane.push(row.from);
      continue;
    }
    loci.push({
      from: row.from,
      ...(hu ? { h: hu } : {}),
      ...(vu ? { v: vu } : {}),
      at,
      held: heldNames,
    } as Locus);
    // A POINT NEEDS BOTH COORDINATES. A relation over one axis constrains the
    // line, not the crossing, so it contributes no point of its own.
    if (!hu || !vu) continue;
    const key = `${hu}|${vu}`;
    if (!seen.has(key) && Number.isFinite(values[hu]) && Number.isFinite(values[vu])) {
      seen.add(key);
      points.push({ h: hu, v: vu, x: values[hu], y: values[vu] });
    }
  }

  return {
    h,
    v,
    held,
    loci,
    points,
    gaps,
    offPlane,
    why:
      `${h.label} along one axis and ${v.label} along the other, because ${h.why}, and ${v.why}` +
      (held.length ? `. ${held.map((g) => g.label).join(', ')} held at ${held.flatMap((g) => g.of.map((u) => `${u} = ${values[u]}`)).join(', ')}` : ''),
  };
}
