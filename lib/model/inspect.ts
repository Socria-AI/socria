// lib/model/inspect.ts
//
// WALKING AROUND INSIDE A MODEL.
//
// THE GAP THIS CLOSES. A built model already knows an enormous amount about
// itself — what each object is, what supplies its values, which operation
// produced it, which solver ran, what it rests on, what rests on it, what is
// still missing and why — and almost none of that reaches a reader. The
// interface shows a picture and some sliders. The model is not a picture; it is
// a thing with parts, and the parts have accounts of themselves.
//
// EVERY LINE BELOW IS READ, NEVER COMPOSED. `supply` comes from the symbol
// table, `origin` and `fidelity` from provenance the code path earned, the
// solver from the router, the chain from the dependency graph, the gaps from the
// operation planner. Nothing here computes a new fact about the model and
// nothing here writes a sentence a language model could have written instead:
// the point is that the words are downstream of the structure, so they cannot
// drift from it.
//
// ONLY WHAT EXISTS. A model with no data has no data section; one with no
// uncertainty has no uncertainty section. An empty section is worse than an
// absent one, because it reads as a category the model was measured against and
// failed rather than one that does not apply.
//
// MODEL BEHAVIOUR IS NOT A CLAIM ABOUT THE WORLD. Everything here describes what
// the model does. "This term makes the surface curve" is a fact about the
// mathematics; "this variable causes wages to change" is not, and nothing in
// this file will ever produce the second from the first.
//
// PURE.

import { estimate } from './estimate';
import { expressionOf } from './derive';
import { equationLines, solutionFor } from './equations';
import { restsOn, affectedBy } from './deps';
import { capabilityOf, operationsOn, plan, route, type Operation } from './solve';
import { ORIGIN_SAYS, type Fidelity, type Model, type ModelObject, type Origin } from './schema';
import { freeInputs, symbolTable, withoutDomain, type Supply } from './symbols';
import { DOMAIN_FROM_SAYS } from './kinds';
import { inputsOf } from './derive';
import { runFor } from './system';
import { viewsFor, unavailable, worth } from './views';

/** One fact, with where it came from attached rather than implied. */
export interface Fact {
  label: string;
  value: string;
  /** the object or control this is about, so a reader can select it */
  of?: string;
  origin?: Origin;
  fidelity?: Fidelity;
}

export interface Section {
  id: 'what' | 'state' | 'components' | 'computation' | 'provenance' | 'dependencies' | 'views' | 'gaps';
  label: string;
  /** one line for a collapsed view — progressive disclosure starts here */
  summary: string;
  facts: Fact[];
}

export interface Inspection {
  /** what the thing being inspected IS, in one sentence */
  what: string;
  /**
   * How far it got and what computed it — "Computational · Mathematical —
   * evaluated from the relationships this model states". Set apart from
   * `what` so a title can be set as a title and the grade as a grade; folded
   * into one sentence they read as "wage model — computational. MATHEMATICAL
   * — evaluated…", two dashes and a shout in the middle of a name.
   */
  grade?: string;
  /** the model or object id this is about */
  of: string;
  sections: Section[];
}

const SUPPLY_SAYS: Record<Supply, string> = {
  parameter: 'a parameter — used by the relationship; moving it changes the relationship',
  input: 'a free input — the relationship is evaluated over it; moving it changes where you are reading',
  observed: 'observed — its values come from the supplied data',
  derived: 'derived — computed from other things in this model',
  unbound: 'nothing has given it a value',
};

const FIDELITY_SAYS: Record<Fidelity, string> = {
  conceptual: 'CONCEPTUAL — drawn to make the idea legible; nothing computed it',
  'model-derived': 'MATHEMATICAL — evaluated from the relationships this model states',
  'data-derived': 'DATA-DERIVED — read from or fitted to the supplied observations',
  simulated: 'SIMULATED — produced by stepping a model forward',
  'numerically-computed': 'NUMERICALLY COMPUTED — an integrator or solver ran and this is its output',
};

/** "MATHEMATICAL — evaluated…" as a line a person reads: "Mathematical — evaluated…". */
const sentence = (s: string): string => {
  const [tag, ...rest] = s.split(' — ');
  const t = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();
  return rest.length ? `${t} — ${rest.join(' — ')}` : t;
};

/** Kinds that are read rather than computed — they do not set the floor. */
const SAYS_NOTHING = new Set(['annotation', 'assumption', 'source', 'axis', 'grid', 'label']);

const section = (id: Section['id'], label: string, summary: string, facts: Fact[]): Section | null =>
  facts.length ? { id, label, summary, facts } : null;

/**
 * WHAT IS THIS MODEL, WHAT IS IN IT, WHAT IS HAPPENING, AND WHAT COMPUTED IT.
 *
 * The sections are the progressive disclosure: a reader opens the ones they
 * want, and a section that does not apply is not there to open.
 */
/**
 * A number a person reads, not a number a machine stored.
 *
 * A domain read off supplied data is a floating-point extreme — a column's
 * minimum came out as “−3.016598715849769”, and seventeen digits of a bound
 * nobody chose is noise that makes a real fact unreadable. Four significant
 * figures, and nothing is rounded anywhere a value is USED: this is the reading
 * layer.
 */
function sig(v: number | undefined): string {
  return v === undefined || !Number.isFinite(v) ? String(v) : String(Number(v.toPrecision(4)));
}

export function inspectModel(model: Model): Inspection {
  const cap = capabilityOf(model);
  const table = symbolTable(model);
  const sections: (Section | null)[] = [];

  // ── WHAT IS THIS ────────────────────────────────────────────────
  const kinds = new Map<string, number>();
  for (const o of model.objects) kinds.set(o.kind, (kinds.get(o.kind) ?? 0) + 1);
  sections.push(
    section('what', 'What this is', cap.says, [
      { label: 'Capability', value: `${cap.level} — ${cap.because.join('; ')}` },
      ...(model.domain ? [{ label: 'Field', value: model.domain }] : []),
      {
        label: 'Contains',
        value: [...kinds.entries()].map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', '),
      },
      ...(model.assumptions ?? []).map((a) => ({ label: 'Holds fixed', value: a })),
      ...(model.equations ?? []).map((e) => ({ label: 'States', value: e })),
    ])
  );

  // ── WHAT IS HAPPENING RIGHT NOW ─────────────────────────────────
  const state: Fact[] = [];
  for (const q of inputsOf(model)) {
    state.push({
      label: q.label,
      value: `at ${sig(q.at)}${q.units ? ` ${q.units}` : ''}, over ${sig(q.min)} to ${sig(q.max)}`,
      of: q.id,
    });
  }
  for (const p of model.params) {
    state.push({
      label: p.label,
      value: `${p.value}${p.units ? ` ${p.units}` : ''}${p.assumed === 'value' ? ' — a placeholder, not yet set' : ''}`,
      of: p.id,
      origin: p.assumed === 'value' ? 'inference' : 'user',
    });
  }
  if (model.time) {
    state.push({ label: 'Clock', value: `t = ${model.time.t} of ${model.time.min}–${model.time.max}${model.time.units ? ` ${model.time.units}` : ''}` });
  }
  // The values the model currently computes — read from the objects that hold
  // one, rather than recomputed here.
  for (const o of model.objects) {
    const v = typeof o.meta?.value === 'number' ? (o.meta.value as number) : undefined;
    if (v === undefined) continue;
    state.push({
      label: o.label, value: String(Number(v.toPrecision(6))), of: o.id,
      origin: o.provenance?.origin, fidelity: o.fidelity,
    });
  }
  if (model.selected) {
    const sel = model.objects.find((o) => o.id === model.selected);
    if (sel) state.unshift({ label: 'Selected', value: sel.label, of: sel.id });
  }
  sections.push(
    section('state', 'What is happening now', `${state.length} things currently set or computed`, state)
  );

  // ── WHAT IT IS MADE OF ──────────────────────────────────────────
  const components: Fact[] = [];
  for (const q of table.by.values()) {
    components.push({
      label: q.display,
      value:
        `${SUPPLY_SAYS[q.supply]}` +
        (q.value !== undefined ? `, = ${q.value}${q.units ? ` ${q.units}` : ''}` : '') +
        (q.domain ? `, over ${sig(q.domain[0])} to ${sig(q.domain[1])} (from ${q.domainFrom ? DOMAIN_FROM_SAYS[q.domainFrom] : 'nowhere'})` : '') +
        (q.control ? `, driven by ${q.control}` : ''),
      of: q.id,
      origin: q.origin,
      fidelity: q.fidelity,
    });
  }
  for (const o of model.objects) {
    if (!o.equations) continue;
    for (const line of equationLines(o, solutionFor(model, o))) {
      components.push({ label: 'Relation', value: line.trim(), of: o.id });
    }
  }
  for (const [key, block] of Object.entries(model.data ?? {})) {
    const cols = Object.keys(block.columns ?? {});
    const n = block.columns ? Object.values(block.columns)[0]?.length ?? 0 : 0;
    components.push({
      label: block.label ?? key,
      value: `${n} observations of ${cols.join(', ')}${block.index ? `, indexed by ${Object.keys(block.index).join(', ')}` : ''}`,
      origin: 'dataset', fidelity: 'data-derived',
    });
  }
  sections.push(
    section('components', 'What it is made of', `${components.length} parts`, components)
  );

  // ── WHAT ACTUALLY COMPUTED ──────────────────────────────────────
  sections.push(
    section('computation', 'What actually computed', transparencyLine(model), computationFacts(model))
  );

  // ── WHERE EACH THING CAME FROM ──────────────────────────────────
  const byOrigin = new Map<Origin, number>();
  for (const o of model.objects) {
    const org = o.provenance?.origin;
    if (org) byOrigin.set(org, (byOrigin.get(org) ?? 0) + 1);
  }
  sections.push(
    section(
      'provenance',
      'Where things came from',
      [...byOrigin.entries()].map(([k, n]) => `${n} ${ORIGIN_SAYS[k]}`).join('; ') || 'nothing records an origin',
      [...byOrigin.entries()].map(([k, n]) => ({
        label: ORIGIN_SAYS[k],
        value: `${n} object${n === 1 ? '' : 's'}`,
        origin: k,
      }))
    )
  );

  // ── WHAT IS STILL MISSING, PER OPERATION ────────────────────────
  const gaps: Fact[] = [];
  for (const p of plan(model)) {
    if (!p.blocked.length) continue;
    for (const b of p.blocked) {
      for (const m of b.missing) {
        gaps.push({ label: p.operation.toUpperCase(), value: m.because ?? `needs ${m.what}`, of: b.of });
      }
    }
  }
  for (const q of withoutDomain(table)) {
    gaps.push({ label: 'RANGE', value: `${q.display} is a free input with no range — it needs one, and it does not need observations`, of: q.id });
  }
  sections.push(section('gaps', 'What it is waiting for', `${gaps.length} thing${gaps.length === 1 ? '' : 's'}`, gaps));

  // ── WHAT ELSE CAN I LOOK AT ─────────────────────────────────────
  const views = viewsFor(model);
  sections.push(
    section('views', 'What else you can look at', `${views.length} representation${views.length === 1 ? '' : 's'} available`, [
      ...views.map((v) => ({
        label: v.label,
        value: `${v.family}, ${v.dimensionality}D${v.notDrawnYet ? ' (declared; no renderer yet)' : ''} — ${v.shows}`,
        of: v.of || undefined,
        fidelity: v.fidelity,
      })),
      ...unavailable(model).map((u) => ({
        label: `${u.family} — not available`,
        value: `would need ${u.wouldNeed}`,
      })),
    ])
  );

  return {
    what: model.title,
    grade: `${sentence(cap.level)} · ${sentence(FIDELITY_SAYS[earned(model).best])}`,
    of: model.id,
    sections: sections.filter(Boolean) as Section[],
  };
}

/**
 * The BEST fidelity anything in this model actually earns, and the worst.
 *
 * EARNED, NOT DECLARED — the same rule the view's own caption follows, and for
 * the same reason it had to be fixed there. Reading `o.fidelity` off the objects
 * reports a model that integrates a damped oscillator by Runge–Kutta as
 * CONCEPTUAL, because the author of the model never filled the field in. The
 * router knows what would actually run; that is what this asks.
 *
 * Both ends, because they answer different questions: the best says what this
 * model is capable of, the worst says what the least of it is worth, and a
 * reader deserves not to have the second silently stand for the first.
 */
function earned(model: Model): { best: Fidelity; worst: Fidelity } {
  const rank: Fidelity[] = ['conceptual', 'data-derived', 'model-derived', 'simulated', 'numerically-computed'];
  let best: Fidelity = 'conceptual';
  let worst: Fidelity | null = null;
  for (const o of model.objects) {
    const f = worth(model, o);
    if (rank.indexOf(f) > rank.indexOf(best)) best = f;
    // THE FLOOR IS OVER THINGS THAT STATE SOMETHING. An axis, a note, a label
    // and an assumption are conceptual by nature — they are not marks and were
    // never going to be computed — so counting them drags "at least" down to
    // conceptual for every model that has a caption on it, which says nothing
    // about the model and reads as a warning.
    if (SAYS_NOTHING.has(o.kind)) continue;
    if (worst === null || rank.indexOf(f) < rank.indexOf(worst)) worst = f;
  }
  return { best, worst: worst ?? best };
}

/**
 * COMPUTATION TRANSPARENCY: the operation, the backend, and the settings.
 *
 * Read from the router and from the run rather than described, so "RK4, 4000
 * steps of dt = 0.005" is the integrator's own account of what it did and not a
 * sentence about integration.
 */
export function computationFacts(model: Model): Fact[] {
  const out: Fact[] = [];
  for (const o of model.objects) {
    for (const { operation, routed } of operationsOn(model, o)) {
      if (routed.status !== 'runnable') continue;
      const bits: string[] = [`${routed.solver.label} (${routed.solver.id})`];
      if (o.system) {
        const got = runFor(model, o);
        if (got.ok) {
          bits.push(got.run.note);
          bits.push(`${got.run.names.length} states`);
        }
      }
      if (o.estimation) {
        const fit = estimate(model, o);
        if (fit.ok) {
          bits.push(`${fit.fit.n} observations, ${fit.fit.k} coefficients, ${fit.fit.df} degrees of freedom`);
          bits.push(`${fit.fit.se} standard errors`);
          if (fit.fit.dropped) bits.push(`${fit.fit.dropped.rows} rows left out: ${fit.fit.dropped.why}`);
          for (const w of fit.fit.warnings.slice(0, 3)) bits.push(w);
        }
      }
      if (o.equations) {
        const got = solutionFor(model, o);
        if (got) bits.push(`${got.status}, rank ${got.rank}${got.residual !== undefined ? `, residual ${got.residual.toExponential(1)}` : ''}`);
      }
      out.push({
        label: `${operation.toUpperCase()} — ${o.label}`,
        value: bits.join('; '),
        of: o.id,
        fidelity: routed.solver.produces,
      });
    }
  }
  return out;
}

/** The one line that says which of the six kinds of thing this model is. */
export function transparencyLine(model: Model): string {
  const running = model.objects.filter((o) => operationsOn(model, o).some((v) => v.routed.status === 'runnable'));
  if (!running.length) {
    return 'CONCEPTUAL — no computational backend ran. What is shown is the structure this model declares.';
  }
  const { best, worst } = earned(model);
  return (
    `${running.length} object${running.length === 1 ? '' : 's'} ${running.length === 1 ? 'has' : 'have'} a backend that runs. ` +
    `At best: ${FIDELITY_SAYS[best]}` +
    (best === worst ? '.' : `. At least: ${FIDELITY_SAYS[worst]}.`)
  );
}

// ── one object ──────────────────────────────────────────────────────

/**
 * WHAT IS THIS? — for whatever the reader selected.
 *
 * The same sections, scoped to one thing, so "what is this" and "what is the
 * model" are answered by one piece of machinery and cannot disagree.
 */
export function inspectObject(model: Model, id: string): Inspection | null {
  const o = model.objects.find((x) => x.id === id);
  const q = symbolTable(model).by.get(id);
  const p = model.params.find((x) => x.id === id);
  if (!o && !q && !p) return null;

  const sections: (Section | null)[] = [];
  const label = o?.label ?? q?.display ?? p?.label ?? id;

  const what: Fact[] = [];
  if (o?.meaning) what.push({ label: 'What it is', value: o.meaning });
  if (o) what.push({ label: 'Kind', value: o.kind, of: o.id });
  if (q) what.push({ label: 'Supplies', value: SUPPLY_SAYS[q.supply], of: q.id });
  if (q?.value !== undefined) what.push({ label: 'Value', value: `${q.value}${q.units ? ` ${q.units}` : ''}` });
  if (q?.domain) what.push({ label: 'Range', value: `${q.domain[0]} to ${q.domain[1]}${q.units ? ` ${q.units}` : ''}, from ${q.domainFrom ? DOMAIN_FROM_SAYS[q.domainFrom] : 'nowhere'}` });
  if (p) what.push({ label: 'Control', value: `${sig(p.value)}${p.units ? ` ${p.units}` : ''}, over ${sig(p.min)} to ${sig(p.max)}` });
  const expr = o ? expressionOf(o) : null;
  if (expr) what.push({ label: 'Says', value: expr });
  if (o?.provenance) {
    what.push({
      label: 'Where it came from',
      value: `${ORIGIN_SAYS[o.provenance.origin]}${o.provenance.detail ? ` — ${o.provenance.detail}` : ''}`,
      origin: o.provenance.origin,
      fidelity: o.fidelity,
    });
  }
  if (o?.fidelity) what.push({ label: 'Worth', value: FIDELITY_SAYS[o.fidelity], fidelity: o.fidelity });
  sections.push(section('what', 'What this is', o?.meaning ?? label, what));

  if (o) {
    // WHAT COMPUTED IT, or what it is waiting for.
    const comp: Fact[] = [];
    for (const { operation, routed } of operationsOn(model, o)) {
      comp.push({
        label: operation.toUpperCase(),
        value:
          routed.status === 'runnable'
            ? `${routed.solver.label} would run it — ${routed.solver.method}`
            : routed.status === 'incomplete'
              ? `not yet: ${routed.missing.map((m) => m.because ?? m.what).join('; ')}`
              : routed.why,
        of: o.id,
      });
    }
    sections.push(section('computation', 'What can be done with it', `${comp.length} operation${comp.length === 1 ? '' : 's'}`, comp));

    // WHAT IT RESTS ON, AND WHAT RESTS ON IT.
    const rests = restsOn(model, o.id);
    const reached = affectedBy(model, [o.id]).filter((x) => x !== o.id);
    const deps: Fact[] = [
      ...rests.params.map((x) => ({ label: 'Rests on', value: model.params.find((y) => y.id === x)?.label ?? x, of: x })),
      ...rests.objects.map((x) => ({ label: 'Rests on', value: model.objects.find((y) => y.id === x)?.label ?? x, of: x })),
      ...reached.map((x) => ({ label: 'Changing it reaches', value: model.objects.find((y) => y.id === x)?.label ?? x, of: x })),
    ];
    sections.push(section('dependencies', 'What it depends on', `${rests.params.length + rests.objects.length} upstream, ${reached.length} downstream`, deps));

    const views = viewsFor(model).filter((v) => v.of === o.id);
    sections.push(
      section('views', 'How you can look at it', `${views.length} representation${views.length === 1 ? '' : 's'}`,
        views.map((v) => ({ label: v.label, value: `${v.family} — ${v.shows}`, of: v.of, fidelity: v.fidelity })))
    );
  }

  return { what: label, of: id, sections: sections.filter(Boolean) as Section[] };
}

// ── why is this happening ───────────────────────────────────────────

export interface Step {
  /** the id at this step */
  of: string;
  label: string;
  /** what this step contributes */
  says: string;
  origin?: Origin;
  fidelity?: Fidelity;
  /** how far from the thing being explained */
  depth: number;
}

/**
 * WHY IS THIS WHAT IT IS — the dependency chain, walked backwards.
 *
 * FROM THE GRAPH, NOT FROM A NARRATIVE. Each step is an object or control the
 * thing actually rests on, with its own provenance, so the chain bottoms out in
 * things somebody supplied or a dataset holds. A language model may read this
 * aloud; it may not invent a link in it.
 *
 * Bounded by depth and by a visited set, because a model of a system has cycles
 * and a chain that loops is not an explanation.
 */
export function whyOf(model: Model, id: string, maxDepth = 6): Step[] {
  const out: Step[] = [];
  const seen = new Set<string>();
  const walk = (at: string, depth: number) => {
    if (depth > maxDepth || seen.has(at)) return;
    seen.add(at);
    const o = model.objects.find((x) => x.id === at);
    const p = model.params.find((x) => x.id === at);
    if (p) {
      out.push({
        of: p.id, label: p.label, depth,
        says: `set to ${p.value}${p.units ? ` ${p.units}` : ''} — a control you move`,
        origin: 'user',
      });
      return;
    }
    if (!o) return;
    const expr = expressionOf(o);
    out.push({
      of: o.id,
      label: o.label,
      depth,
      says:
        (o.provenance?.detail ? `${o.provenance.detail}` : ORIGIN_SAYS[o.provenance?.origin ?? 'inference']) +
        (expr ? ` — ${expr}` : ''),
      origin: o.provenance?.origin,
      fidelity: o.fidelity,
    });
    const rests = restsOn(model, o.id);
    for (const x of [...rests.objects, ...rests.params]) walk(x, depth + 1);
  };
  walk(id, 0);
  return out;
}

/** The chain as lines, for Trace and for the conversation. */
export function whyLines(model: Model, id: string): string[] {
  return whyOf(model, id).map((s) => `${'  '.repeat(s.depth)}${s.depth ? '← ' : ''}${s.label}: ${s.says}`);
}

// ── what changed ────────────────────────────────────────────────────

export interface Changed {
  what: string;
  from?: string;
  to?: string;
  /** what had to be recomputed because of it */
  reached: { of: string; label: string }[];
  /** what did NOT move, which is half the answer */
  untouched: { of: string; label: string }[];
}

/**
 * WHAT CHANGED, WHAT RECOMPUTED, AND WHAT DID NOT.
 *
 * The last is the half that is usually missing and usually the more informative:
 * "the mass and the initial position are unchanged" is what makes "the trajectory
 * moved" mean something. Read from `lastChange`, which every edit writes, and
 * from the dependency graph that decided the reach.
 */
export function whatChanged(model: Model): Changed | null {
  const change = model.lastChange;
  if (!change) return null;
  const reached = new Set(change.affected ?? []);
  const name = (id: string) =>
    model.objects.find((o) => o.id === id)?.label ?? model.params.find((p) => p.id === id)?.label ?? id;
  return {
    what: name(change.what),
    ...(change.from !== undefined ? { from: String(change.from) } : {}),
    ...(change.to !== undefined ? { to: String(change.to) } : {}),
    reached: [...reached].map((of) => ({ of, label: name(of) })),
    untouched: model.objects
      .filter((o) => !reached.has(o.id) && o.id !== change.what)
      .slice(0, 12)
      .map((o) => ({ of: o.id, label: o.label })),
  };
}

/** Every line the inspector would print, flattened — for Trace and for chat. */
export function inspectionLines(i: Inspection, limit = 60): string[] {
  const out: string[] = [i.what];
  for (const s of i.sections) {
    out.push(`${s.label.toUpperCase()} — ${s.summary}`);
    for (const f of s.facts) {
      out.push(`  ${f.label}: ${f.value}${f.origin ? ` [${f.origin}]` : ''}`);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
