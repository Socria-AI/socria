// lib/model/viewdata.ts
//
// WHAT A CHOSEN REPRESENTATION ACTUALLY CONTAINS.
//
// THE GAP THIS CLOSES. `viewsFor` enumerates what a model can be looked at as,
// and clicking one of those did nothing but select an object: the registry knew
// about a dozen representations and the interface could render one. A list of
// views nobody can open is a menu in a restaurant with one dish.
//
// PURE, AND THAT IS THE POINT. A representation's CONTENT is derived here —
// from the model, by the same machinery everything else uses — and a component
// renders it. So what a table contains, what an equation view says and what the
// structure view's edges are can all be tested without a browser, and the
// component is left with nothing to decide.
//
// TWO KINDS OF REPRESENTATION, and the split is `ViewSpec.marks`: one occupies a
// FRAME — a surface, a curve, a field, contours, a cross-section — and is a
// VisualizationSpec the existing renderer already draws; the other is READ — an
// equation, a table, the dependency graph, the model's own account — and is a
// structure a panel prints. Nothing here invents a third renderer.
//
// NO DOMAIN APPEARS BELOW.

import { buildContours, buildObject, buildSlice } from './compile';
import { buildSpec, type VisualizationSpec } from './spec';
import { equationLines, solutionFor } from './equations';
import { parse, print, rename } from './expr';
import { estimate } from './estimate';
import { marginalOf } from './derive';
import { inspectModel, type Fact, type Section } from './inspect';
import { restsOn } from './deps';
import { runFor } from './system';
import { symbolTable } from './symbols';
import type { Primitive } from './primitives';
import type { Model, ModelObject } from './schema';
import { RENDERED, viewsFor, type ViewSpec } from './views';
import { unitOf, unitOfObject, withUnit } from './units';

/** What a view that is READ rather than looked at contains. */
/** How a table column should be set: words, a number, an expression, or a quiet remark. */
export type ColumnKind = 'text' | 'number' | 'math' | 'note';

export type PanelContent =
  | { kind: 'equation'; rows: { label: string; body: string; of?: string }[] }
  | {
      kind: 'table';
      columns: string[];
      rows: string[][];
      note: string;
      /** per column, how to set it; absent means words */
      kinds?: ColumnKind[];
      /** per row, the object it is about, so a row can be selected like a mark */
      refs?: (string | undefined)[];
    }
  | { kind: 'structure'; nodes: { id: string; label: string; of: string }[]; edges: { from: string; to: string; why: string }[] }
  | { kind: 'text'; what: string; sections: Section[] }
  | { kind: 'none'; why: string };

/** The view with this id, or null. */
export function viewById(model: Model, id: string): ViewSpec | null {
  return viewsFor(model).find((v) => v.id === id) ?? null;
}

/**
 * Does this view go in the frame, or in a panel?
 *
 * `marks` already answers it — a view that occupies extent is drawn, one that
 * does not is printed — so this is the same question asked once rather than a
 * second classification that could drift from the first.
 */
export function rendersAs(v: ViewSpec): 'frame' | 'panel' {
  return v.marks ? 'frame' : 'panel';
}

/**
 * The spec for a view that occupies a frame.
 *
 * Built from the SAME model and the SAME compiler as the default picture —
 * `only` narrows it to the object in question, and contours and cross-sections
 * come from the functions that already computed them (compile.ts buildContours,
 * buildSlice), which is why they are as true as the surface they came from
 * rather than traced off its mesh.
 */
export function frameFor(model: Model, id: string): VisualizationSpec | null {
  const v = viewById(model, id);
  // NOT DRAWN MEANS NOT DRAWN. Returning the object's ordinary picture for a
  // residual view would put a surface under the word "residuals", which is a
  // worse answer than none: the caption would be the only wrong thing in the
  // frame and the frame is what gets believed.
  if (!v || !v.marks || !RENDERED.has(v.family)) return null;
  const o = (v.of ? model.objects.find((x) => x.id === v.of) : null) ?? null;

  if (v.family === 'residual' && o) return residualFrame(model, o);
  if (v.family === 'interval' && o) return intervalFrame(model, o);

  // ── A SLOPE OPENED ON ITS OWN IS ITS OWN FIGURE ──────────────────
  //
  // `buildObject` deliberately draws NOTHING for a varying marginal in the main
  // frame — it is a different quantity against a shared axis, and one box cannot
  // be honest about both, so the panel builder asks for it separately. Which
  // meant that opening the slope's own view got the empty result intended for
  // the shared box: a button that cleared the picture. Asked for on its own, it
  // is asked for the way the panel builder asks.
  if (o?.meta?.role === 'marginal') {
    const built = buildObject(model, o, { panel: true });
    if (!built.primitives.length) return null;
    const xr = (o.over?.x ?? [-3, 3]) as [number, number];
    const ys = built.primitives.flatMap((p) => ('at' in p && Array.isArray(p.at) ? p.at.map((q) => q.y) : []));
    return reframe(model, o, {
      primitives: built.primitives,
      box: { x: xr, y: extent(ys), z: [0, 1] },
      axisNames: [
        withUnit(typeof o.meta.wrt === 'string' ? o.meta.wrt : 'x', unitOf(model, typeof o.meta.wrt === 'string' ? o.meta.wrt : '')),
        withUnit(o.label, o.units),
        '',
      ],
      note: built.note,
      fidelity: built.fidelity,
    });
  }

  if (v.family === 'contour' && o) {
    const got = buildContours(model, o);
    const base = buildSpec(model, { only: [o.id] });
    if (!got) return base;
    // The level sets REPLACE the surface's own primitives: a contour view is the
    // plan of the surface, not the surface with lines on it.
    return { ...base, dimensionality: 2, primitives: got.value, notes: [{ of: o.id, note: got.note, fidelity: 'model-derived' }] };
  }

  if (v.family === 'slice' && o) {
    // Cut at the middle of the second axis unless something says otherwise: a
    // cross-section has to be somewhere, and the middle is a statement about
    // looking rather than about the model.
    const yr = o.over?.y ?? o.over?.[Object.keys(o.over ?? {})[1] ?? ''];
    const at = Array.isArray(yr) ? (yr[0] + yr[1]) / 2 : 0;
    const got = buildSlice(model, o, 'y', at);
    const base = buildSpec(model, { only: [o.id] });
    if (!got) return base;
    return { ...base, dimensionality: 2, primitives: got.value, notes: [{ of: o.id, note: got.note, fidelity: 'model-derived' }] };
  }

  // Everything else is the ordinary picture, narrowed to this object when the
  // view is of one. A view of the model as a whole is the whole picture.
  return v.of ? buildSpec(model, { only: [v.of] }) : buildSpec(model);
}

/** The content for a view that is read rather than looked at. */
export function panelFor(model: Model, id: string): PanelContent | null {
  const v = viewById(model, id);
  if (!v || v.marks) return null;
  if (!RENDERED.has(v.family)) {
    return { kind: 'none', why: `a ${v.family} view is declared here but nothing renders one yet — it would show ${v.shows}` };
  }
  const o = (v.of ? model.objects.find((x) => x.id === v.of) : null) ?? null;

  switch (v.family) {
    case 'equation':
      return { kind: 'equation', rows: equationRows(model, o) };

    case 'table':
      return tableFor(model, o, v);

    case 'matrix':
      return tableFor(model, o, v);

    case 'derivative':
      return derivativeFor(model, o);

    case 'sensitivity':
      return sensitivityFor(model);

    case 'diagnostic':
      return diagnosticFor(model, o);

    case 'structure': {
      const nodes = model.objects
        .filter((x) => restsOn(model, x.id).objects.length || restsOn(model, x.id).params.length || model.objects.some((y) => restsOn(model, y.id).objects.includes(x.id)))
        .slice(0, 40)
        .map((x) => ({ id: x.id, label: x.label, of: x.id }));
      const have = new Set(nodes.map((n) => n.id));
      const edges: { from: string; to: string; why: string }[] = [];
      for (const x of model.objects) {
        if (!have.has(x.id)) continue;
        const rests = restsOn(model, x.id);
        for (const from of rests.objects) {
          if (!have.has(from)) continue;
          edges.push({ from, to: x.id, why: 'it is named in what this one says' });
        }
        for (const p of rests.params) {
          edges.push({ from: p, to: x.id, why: 'a control it reads' });
        }
      }
      // Controls appear as nodes too, or half the edges point at nothing.
      for (const p of model.params) {
        if (edges.some((e) => e.from === p.id)) nodes.unshift({ id: p.id, label: p.label, of: p.id });
      }
      return nodes.length
        ? { kind: 'structure', nodes, edges }
        : { kind: 'none', why: 'nothing in this model rests on anything else in it' };
    }

    case 'text':
    default: {
      const i = inspectModel(model);
      return { kind: 'text', what: i.what, sections: i.sections };
    }
  }
}

/**
 * The expression, WITH THE VARIABLE IT IS ABOUT PUT BACK.
 *
 * A marginal is stored over its own single axis — `expandMarginals` renames the
 * variable being differentiated with respect to into `x`, because a curve is
 * sampled over `x` and a free name would evaluate to nothing. That is right for
 * the evaluator and wrong for a reader: ∂z/∂y of a saddle then READS as
 * “−(b · 2 · x)”, which names the wrong variable.
 *
 * So the rename is inverted here, and ONLY here — this string is printed, never
 * compiled. Only `x` moves back, which is the exact inverse of what was done;
 * any other name in the expression is a genuine second variable and stays,
 * because a marginal effect that depends on another variable is the thing an
 * interaction term is for and hiding it would hide that.
 */
function asWritten(o: ModelObject, expr: string): string {
  return namedExpr(o, expr);
}

/**
 * An expression with the model's own names in it, for a reader.
 *
 * THE SAME INVERSION, FOR EVERY OBJECT THAT RENAMED. A response surface is
 * evaluated over `x` and `y` because that is what a sampler binds, and records
 * in `meta.axes` that `x` is education and `y` is experience. A marginal
 * records in `meta.wrt` that `x` is the variable it was taken with respect to.
 * Both were being printed as written for the evaluator — "y^2", "2 * x" — in
 * a table whose other rows said "experience^2", so one column named the
 * variables and the next used letters for them. Printed, never compiled.
 */
export function namedExpr(o: ModelObject, expr: string): string {
  const onto: Record<string, string> = {};
  const axes = typeof o.meta?.axes === 'string' ? String(o.meta.axes).split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (axes[0] && axes[0] !== 'x') onto.x = axes[0];
  if (axes[1] && axes[1] !== 'y') onto.y = axes[1];
  const wrt = typeof o.meta?.wrt === 'string' ? (o.meta.wrt as string) : null;
  if (o.meta?.role === 'marginal' && wrt && wrt !== 'x') onto.x = wrt;
  if (!Object.keys(onto).length) return expr;
  // Parsed against the names the string itself contains, so nothing about the
  // model's symbol table is needed to re-letter something only going to be read.
  const tree = parse(expr, expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  return tree ? print(rename(tree, onto)) : expr;
}

/**
 * Mathematics set for reading: a dot for a product, a raised figure for a
 * small power, a real minus. DISPLAY ONLY — the string this comes from is the
 * one the evaluator reads, and nothing here is ever parsed back.
 */
export function pretty(expr: string): string {
  // The assembler's scaffolding first — written so the evaluator never
  // misreads precedence, and read by nobody: a name in its own parentheses,
  // a rest position of zero subtracted, doubled parentheses, a plus before a
  // minus. Each is a textual identity for display and would be wrong to
  // apply to anything that is evaluated.
  // The outermost pair goes only when it IS a pair: "(a + b) / (m)" begins
  // with "(" and ends with ")" and they are not each other's match.
  const unwrap = (s: string): string => {
    if (!s.startsWith('(') || !s.endsWith(')')) return s;
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      if (depth === 0 && i < s.length - 1) return s;
    }
    return s.slice(1, -1);
  };
  const tidy = (s: string): string => {
    let out = s;
    for (let i = 0; i < 4; i++) {
      const next = unwrap(
        out
          .replace(/\(([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)\)/g, '$1')
          .replace(/\(([A-Za-z_][A-Za-z0-9_]*) - 0\)/g, '$1')
          .replace(/\(\(([^()]*)\)\)/g, '($1)')
          .replace(/\+\s*-\s*/g, '- ')
      );
      if (next === out) break;
      out = next;
    }
    return out;
  };
  return tidy(expr)
    .replace(/\s*\*\s*/g, ' · ')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/\s*-\s*/g, ' − ')
    .replace(/^ − /, '−')
    .replace(/\( − /g, '(−')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every relationship this model states, as written. */
function equationRows(model: Model, only: ModelObject | null): { label: string; body: string; of?: string }[] {
  const out: { label: string; body: string; of?: string }[] = [];
  const objects = only ? [only] : model.objects;
  for (const o of objects) {
    if (o.equations) {
      for (const line of equationLines(o, solutionFor(model, o))) out.push({ label: o.label, body: line.trim(), of: o.id });
      continue;
    }
    const expr = o.definition ?? o.defs?.z ?? o.defs?.f;
    if (expr) out.push({ label: o.label, body: pretty(asWritten(o, expr)), of: o.id });
    for (const [k, v] of Object.entries(o.system?.rhs ?? {})) out.push({ label: `d${k}/dt`, body: pretty(v), of: o.id });
    if (o.estimation) {
      out.push({
        label: o.label,
        body: `${o.estimation.y} = ${['β₀', ...o.estimation.x.map((x, i) => `β${i + 1}·${x}`)].join(' + ')} + u`,
        of: o.id,
      });
      for (const [name, t] of Object.entries(o.estimation.terms ?? {})) {
        out.push({ label: name, body: `${name} is ${t.op}${t.of && typeof t.of === 'string' ? ` of ${t.of}` : ''}${t.by !== undefined ? ` by ${t.by}` : ''}`, of: o.id });
      }
    }
  }
  if (!out.length && !only) {
    for (const e of model.equations ?? []) out.push({ label: 'stated', body: e });
  }
  return out.slice(0, 40);
}

/**
 * A view as numbers.
 *
 * Three cases and they are genuinely different: a DATA block is the supplied
 * observations, as given; a RUN is the states at each step; a sampled
 * relationship is the value at a grid of inputs. None of them is a fitted line
 * standing in for the other.
 */
function tableFor(model: Model, o: ModelObject | null, v: ViewSpec): PanelContent {
  // A named data block.
  const key = v.id.split(':')[2];
  const block = key ? model.data?.[key] : undefined;
  if (block?.columns) {
    const columns = Object.keys(block.columns).slice(0, 8);
    const index = Object.keys(block.index ?? {}).slice(0, 3);
    const n = Math.min(block.columns[columns[0]]?.length ?? 0, 40);
    const rows: string[][] = [];
    for (let i = 0; i < n; i++) {
      rows.push([
        ...index.map((k) => String(block.index![k][i] ?? '')),
        ...columns.map((c) => String(Number((block.columns![c][i] ?? NaN).toPrecision(6)))),
      ]);
    }
    return {
      kind: 'table',
      columns: [...index, ...columns],
      rows,
      kinds: [...index.map(() => 'text' as const), ...columns.map(() => 'number' as const)],
      note: `${block.columns[columns[0]]?.length ?? 0} observations, as supplied${rows.length < (block.columns[columns[0]]?.length ?? 0) ? `; the first ${rows.length} shown` : ''}`,
    };
  }

  // A run.
  if (o?.system) {
    const got = runFor(model, o);
    if (got.ok) {
      const names = got.run.names.slice(0, 6);
      const stride = Math.max(1, Math.ceil(got.run.t.length / 40));
      const rows: string[][] = [];
      for (let i = 0; i < got.run.t.length; i += stride) {
        rows.push([String(Number(got.run.t[i].toPrecision(5))), ...names.map((_, k) => String(Number((got.run.y[i][k] ?? NaN).toPrecision(5))))]);
      }
      return { kind: 'table', columns: ['t', ...names], rows, kinds: ['t', ...names].map(() => 'number' as const), note: got.run.note };
    }
  }

  // A sampled relationship: the value at a grid of its inputs.
  if (o) {
    const built = buildObject(model, o, { detail: 8 });
    const mesh = built.primitives.find((p) => p.p === 'mesh');
    const line = built.primitives.find((p) => p.p === 'polyline');
    const axes = typeof o.meta?.axes === 'string' ? String(o.meta.axes).split(',').map((s) => s.trim()) : [];
    if (mesh) {
      const pts = mesh.rows.flat().filter(Boolean).slice(0, 40) as { x: number; y: number; z: number }[];
      return {
        kind: 'table',
        columns: [withUnit(axes[0] ?? 'x', unitOf(model, axes[0])), withUnit(axes[1] ?? 'y', unitOf(model, axes[1])), withUnit(o.label, unitOfObject(model, o))],
        rows: pts.map((p) => [p.x, p.y, p.z].map((q) => String(Number(q.toPrecision(6))))),
        kinds: ['number', 'number', 'number'],
        note: `${built.note}; the first ${pts.length} of the grid`,
      };
    }
    if (line && Array.isArray(line.at)) {
      const pts = line.at.slice(0, 40);
      return {
        kind: 'table',
        columns: [withUnit(axes[0] ?? 'x', unitOf(model, axes[0])), withUnit(o.label, unitOfObject(model, o))],
        rows: pts.map((p) => [p.x, p.y].map((q) => String(Number(q.toPrecision(6))))),
        kinds: ['number', 'number'],
        note: `${built.note}; the first ${pts.length} samples`,
      };
    }
  }

  // Everything the model currently holds a number for. The floor, and a real
  // answer: a model with no grid and no data still has values.
  const table = symbolTable(model);
  const rows = [...table.by.values()]
    .filter((q) => q.value !== undefined)
    .slice(0, 40)
    .map((q) => [q.display, String(q.value), q.units ?? '', q.supply]);
  return rows.length
    ? { kind: 'table', columns: ['quantity', 'value', 'units', 'supplies'], rows, kinds: ['text', 'number', 'note', 'note'], note: 'every quantity this model currently has a number for' }
    : { kind: 'none', why: 'nothing in this model has a number yet' };
}

/**
 * WHAT A FIT DOES NOT EXPLAIN, PLOTTED.
 *
 * The residual against the fitted value, which is the plot that shows the two
 * things a table of coefficients cannot: whether the spread widens, and whether
 * the relationship is curved in a way the specification does not allow for.
 * Both are properties of the fit that ran — these are its own numbers, not a
 * second estimation and not a smoother drawn through them.
 */
function residualFrame(model: Model, o: ModelObject): VisualizationSpec | null {
  const got = estimate(model, o);
  if (!got.ok) return null;
  const { residuals, fitted } = got.fit;
  if (!residuals.length) return null;
  const xs = fitted, ys = residuals;
  const bx = extent(xs), by = symmetric(extent(ys));
  const prims: Primitive[] = [
    // THE ZERO LINE FIRST, because a residual plot without it is a cloud. It is
    // the only line here that is not data: residuals are above or below nothing
    // in particular until zero is drawn.
    { p: 'polyline', of: o.id, at: [{ x: bx[0], y: 0, z: 0 }, { x: bx[1], y: 0, z: 0 }], dashed: true, tone: 'muted' },
    { p: 'points', of: o.id, at: xs.map((x, i) => ({ x, y: ys[i], z: 0 })), r: 2.4, tone: 'u1' },
  ];
  return reframe(model, o, {
    primitives: prims,
    box: { x: bx, y: by, z: [0, 1] },
    axisNames: [
      withUnit(`fitted ${o.estimation?.y ?? o.label}`, unitOf(model, o.estimation?.y)),
      withUnit('residual', unitOf(model, o.estimation?.y)),
      '',
    ],
    note: `${residuals.length} residuals from the fit that ran (${got.fit.method}, σ = ${Number(got.fit.sigma.toPrecision(4))}) — what the relationship does not account for at each observation`,
    fidelity: 'data-derived',
  });
}

/**
 * EACH ESTIMATE WITH ITS INTERVAL.
 *
 * The number and its uncertainty in one mark, which is the whole argument for
 * this view: a coefficient printed alone invites a confidence the standard error
 * does not support. Terms with no interval are drawn as the point alone rather
 * than omitted or given a fabricated bar — `Term.ci95` is absent exactly when
 * the degrees of freedom do not justify one, and that absence is information.
 */
function intervalFrame(model: Model, o: ModelObject): VisualizationSpec | null {
  const got = estimate(model, o);
  if (!got.ok) return null;
  const terms = got.fit.terms;
  if (!terms.length) return null;
  const lo = Math.min(...terms.map((t) => t.ci95?.[0] ?? t.value));
  const hi = Math.max(...terms.map((t) => t.ci95?.[1] ?? t.value));
  const bx = extent([lo, hi]);
  const prims: Primitive[] = [];
  if (bx[0] < 0 && bx[1] > 0) {
    prims.push({ p: 'polyline', of: o.id, at: [{ x: 0, y: -0.5, z: 0 }, { x: 0, y: terms.length - 0.5, z: 0 }], dashed: true, tone: 'muted' });
  }
  terms.forEach((t, i) => {
    const y = terms.length - 1 - i;
    if (t.ci95) {
      prims.push({ p: 'polyline', of: o.id, at: [{ x: t.ci95[0], y, z: 0 }, { x: t.ci95[1], y, z: 0 }], width: 2, tone: 'muted' });
    }
    prims.push({ p: 'points', of: o.id, at: [{ x: t.value, y, z: 0 }], r: 3.4, tone: 'primary' });
    prims.push({ p: 'label', of: o.id, at: { x: bx[0], y: y + 0.28, z: 0 }, text: `${t.name} = ${Number(t.value.toPrecision(4))}${t.ci95 ? '' : ' (no interval)'}`, anchor: 'start' });
  });
  return reframe(model, o, {
    primitives: prims,
    box: { x: bx, y: [-0.7, terms.length - 0.3], z: [0, 1] },
    axisNames: ['estimate', 'coefficient', ''],
    note: `${terms.length} estimates on ${got.fit.se === 'HC1' ? 'heteroskedasticity-robust' : 'classical'} standard errors; ${terms.filter((t) => t.ci95).length} carry a 95% interval, and the rest do not have the degrees of freedom for one`,
    fidelity: 'data-derived',
  });
}

/**
 * The same spec the default picture would be, with this view's own contents.
 *
 * Reusing `buildSpec` rather than composing a VisualizationSpec by hand is not
 * laziness: the spec carries a dozen fields — layers, aspect, coordinate system,
 * version, time — that a view has no opinion about, and a hand-built one drifts
 * from the renderer the first time any of them changes.
 */
function reframe(
  model: Model,
  o: ModelObject,
  part: Pick<VisualizationSpec, 'primitives' | 'box' | 'axisNames'> & { note: string; fidelity: VisualizationSpec['fidelity'] }
): VisualizationSpec {
  const base = buildSpec(model, { only: [o.id] });
  return {
    ...base,
    dimensionality: 2,
    primitives: part.primitives,
    box: part.box,
    axisNames: part.axisNames,
    // A view of a fit is 'fit' — the box is not cubic and forcing it to be would
    // make an interval of 0.02 and one of 40 the same length.
    aspect: 'fit',
    annotations: [],
    panels: [],
    fidelity: part.fidelity,
    notes: [{ of: o.id, note: part.note, fidelity: part.fidelity }],
  };
}

/** A little room either side, and never a zero-width box. */
function extent(xs: number[]): [number, number] {
  const ok = xs.filter((x) => Number.isFinite(x));
  if (!ok.length) return [0, 1];
  const lo = Math.min(...ok), hi = Math.max(...ok);
  const pad = (hi - lo) * 0.08 || Math.max(Math.abs(hi), 1) * 0.1;
  return [lo - pad, hi + pad];
}

/** Zero in the middle, because a residual plot's asymmetry should be visible. */
function symmetric([lo, hi]: [number, number]): [number, number] {
  const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
  return [-m, m];
}

/**
 * THE SLOPE, AS AN EXPRESSION AND AS A NUMBER WHERE IT IS ONE.
 *
 * Read rather than drawn precisely when it does not vary: a constant marginal
 * effect plotted against its input is a horizontal line, which is the least
 * informative shape a figure can take and takes the whole frame to say one
 * number. So the registry sends a constant slope here, and this prints it.
 */
function derivativeFor(model: Model, o: ModelObject | null): PanelContent {
  if (!o) return { kind: 'none', why: 'a slope is the slope of something, and no object is named' };

  // ── THE OBJECT IS ALREADY THE SLOPE ──────────────────────────────
  //
  // `expandMarginals` puts each derivative into the model as an object of its
  // own, so the registry's derivative view is a view OF that object rather than
  // of the relationship it came from. Differentiating it again would ask for the
  // second derivative — and for a constant slope, which has no `over`, it asked
  // for the derivative of something evaluated over nothing and got a refusal
  // where the answer was already sitting in the object.
  if (o.meta?.role === 'marginal') {
    const built = buildObject(model, o, { panel: true });
    return {
      kind: 'equation',
      rows: [{ label: o.label, body: built.note, of: o.id }, ...(o.meaning ? [{ label: 'what it means', body: o.meaning, of: o.id }] : [])],
    };
  }
  const rows: { label: string; body: string; of?: string }[] = [];
  const axes = typeof o.meta?.axes === 'string' ? String(o.meta.axes).split(',').map((s) => s.trim()) : [];
  const over = Object.keys(o.over ?? {});
  // THE THINGS IT IS EVALUATED OVER, which is what a slope is taken with
  // respect to — not every name in the expression. ∂wage/∂β₁ is a different
  // question, and it is the sensitivity view's.
  const wrt = (axes.length ? axes : over).filter(Boolean);
  for (const w of wrt) {
    const got = marginalOf(model, o, w);
    rows.push(
      got.ok
        ? { label: `∂${o.label}/∂${w}`, body: `${got.got.expr}${got.got.constant ? ' — the same everywhere' : ` — varies with ${w === 'x' ? 'the input' : w}`}`, of: o.id }
        : { label: `∂${o.label}/∂${w}`, body: got.why, of: o.id }
    );
  }
  return rows.length ? { kind: 'equation', rows } : { kind: 'none', why: `“${o.label}” is not evaluated over anything, so there is no slope to take` };
}

/**
 * HOW MUCH EACH OUTPUT MOVES PER UNIT OF EACH PARAMETER.
 *
 * DIFFERENTIATED, NOT NUDGED. The obvious implementation perturbs a parameter,
 * recomputes and divides; this differentiates the expression with respect to the
 * parameter symbolically and evaluates the result, so the answer is exact where
 * the expression is and does not depend on a step size nobody chose.
 */
function sensitivityFor(model: Model): PanelContent {
  const table = symbolTable(model);
  const movable = [...table.by.values()].filter((q) => q.supply === 'parameter' && q.boundBy === 'control');
  const rows: string[][] = [];
  const refs: string[] = [];
  for (const o of model.objects) {
    if (!(o.definition || o.defs?.z || o.defs?.f)) continue;
    for (const q of movable) {
      const got = marginalOf(model, o, q.machine);
      if (!got.ok) continue;
      // ZERO IS AN ANSWER AND A USEFUL ONE — "this parameter does not reach
      // this object" — but a row per parameter per object that says 0 is noise,
      // and the dependency graph already says which reach which.
      if (got.got.expr === '0') continue;
      rows.push([o.label, q.display, pretty(namedExpr(o, got.got.expr)), got.got.constant ? 'the same everywhere' : 'varies over the inputs']);
      refs.push(o.id);
    }
  }
  return rows.length
    ? {
        kind: 'table',
        columns: ['output', 'parameter', 'per unit of it', 'where'],
        rows: rows.slice(0, 40),
        refs: refs.slice(0, 40),
        kinds: ['text', 'text', 'math', 'note'],
        note: 'differentiated symbolically with respect to each control, not measured by nudging one',
      }
    : { kind: 'none', why: 'nothing here can be differentiated with respect to a control that can be moved' };
}

/**
 * WHAT A READER SHOULD KNOW BEFORE TRUSTING THE FIT.
 *
 * Every line is something the estimator itself recorded — the rows it left out,
 * the degrees of freedom it had, the collinearity it measured, the basis its
 * standard errors are on. Nothing here is a judgement about whether the fit is
 * good; the warnings are the fit's own, and a view that added its own verdict
 * would be the model's opinion dressed as the estimator's.
 */
function diagnosticFor(model: Model, o: ModelObject | null): PanelContent {
  if (!o) return { kind: 'none', why: 'diagnostics belong to a fit, and no fit is named' };
  const got = estimate(model, o);
  // TWO KINDS OF REFUSAL, AND THEY ARE NOT THE SAME. A fit can be waiting on
  // structure somebody has to supply, or on a methodological choice nobody but
  // the person can make. Collapsing them into "no diagnostics" is how a
  // decision that was theirs gets made by default and reported as an absence.
  if (!got.ok) {
    if ('missing' in got) {
      // `because` first where a solver wrote one: naming the missing thing can
      // be circular, and the sentence is the real account. See system.ts Missing.
      return { kind: 'none', why: `this fit is waiting on ${got.missing.map((m) => m.because ?? m.what).join('; ')}` };
    }
    return { kind: 'none', why: `this fit is waiting on a choice of method: ${got.choice.says}` };
  }
  const f = got.fit;
  const facts: Fact[] = [
    { label: 'method', value: f.says },
    { label: 'observations', value: String(f.n) },
    { label: 'coefficients', value: String(f.k) },
    { label: 'residual degrees of freedom', value: String(f.df) },
    { label: 'R²', value: `${Number(f.r2.toPrecision(4))} (adjusted ${Number(f.adjR2.toPrecision(4))})` },
    { label: 'residual standard error', value: String(Number(f.sigma.toPrecision(4))) },
    { label: 'standard errors', value: f.se === 'HC1' ? 'heteroskedasticity-robust (HC1)' : 'classical' },
    ...(f.dropped ? [{ label: 'rows left out', value: `${f.dropped.rows} — ${f.dropped.why}` }] : []),
  ];
  const sections: Section[] = [
    { id: 'computation', label: 'What ran', summary: `${f.n} observations, ${f.k} coefficients`, facts },
    ...(f.warnings.length
      ? [{
          id: 'gaps' as const,
          label: 'What the estimator reported',
          summary: `${f.warnings.length} to know about`,
          facts: f.warnings.map((w, i) => ({ label: `note ${i + 1}`, value: w })),
        }]
      : []),
  ];
  return { kind: 'text', what: `Diagnostics for ${o.label}`, sections };
}
