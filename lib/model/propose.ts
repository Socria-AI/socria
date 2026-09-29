// lib/model/propose.ts
//
// THE ON-RAMP. A conversation asks for something formal; this is where that
// request either becomes a model the engine owns, or is honestly refused.
//
// THE TRUST BOUNDARY IS THE WHOLE POINT OF THIS FILE.
//
// `VizScene.built` means: THIS STATE WAS PRODUCED AND VERIFIED BY THE MODEL
// ENGINE. It does not mean "a language model wrote JSON shaped like a model".
// The distinction is not pedantry — everything downstream trusts `built`: the
// router runs solvers on it, ModelView draws it as computed, `modelStateFrom`
// tells the conversation its numbers are results, and Trace attributes
// provenance to it. Let an unvalidated proposal in and every one of those
// becomes a confident lie.
//
// So the arrangement is:
//
//   THE MODEL PROPOSES     a bounded ModelProposal — objects, params, blocks,
//                          equations, assumptions. It never writes `built`;
//                          sanitizeViz strips that field from anything a model
//                          produced (lib/logos-viz.ts, trust: 'proposal').
//   THE ENGINE VALIDATES   sanitizeModel → route → missingStructure →
//                          capabilityOf, all of which already existed. A
//                          proposal that cannot be computed is REFUSED, with
//                          what is missing named in the person's terms.
//   THE ENGINE BUILDS      only this function returns a built model, and it
//                          stamps what produced it.
//   THE HUMAN DECIDES      everything consequential: a method, an assumption,
//                          whether the thing is worth believing.
//
// AND THE PROPOSAL IS MARKED AS A PROPOSAL. Every object the model proposed
// carries provenance origin 'inference' unless it says otherwise, because a
// parameter Socria chose and a parameter the person chose must never read the
// same — see ORIGIN_SAYS in lib/model/schema.ts.
//
// PURE. No network, no clock of its own (an `at` is passed in), no React.

import { capabilityOf, missingStructure, route, type Capability } from './solve';
import { expand } from './mechanism';
import { sanitizeModel, type Fidelity, type Model, type ModelObject } from './schema';
import { overallFidelity } from './schema';
import type { Missing } from './system';

/** What a conversation may propose. The same shape a model has, minus what it may not set. */
export type ModelProposal = unknown;

export interface BuildReport {
  /** the id the built model carries, which is the id every later edit keeps */
  id: string;
  title: string;
  capability: Capability['level'];
  /** why it reached that level, in the engine's own words */
  because: string[];
  /** which solvers would actually run, by object */
  solvers: { of: string; object: string; solver: string }[];
  /** what would have to be supplied for more of it to compute */
  missing: { of: string; label: string; missing: Missing[] }[];
  /** the modest fidelity of everything in it */
  fidelity: Fidelity;
  /** one line a reply can use without inventing anything */
  says: string;
}

export interface Refusal {
  /** what the conversation asked for, if it said */
  title: string;
  /** why nothing was built — never a shrug */
  because: string;
  /** what would let it build, in the person's terms */
  missing: { of: string; label: string; missing: Missing[] }[];
  /**
   * What the conversation should do instead. A refusal that does not say this
   * leaves the person stuck holding a blank.
   */
  says: string;
}

export type Built =
  | { ok: true; model: Model; report: BuildReport }
  | { ok: false; refusal: Refusal };

/** Caps on what one proposal may carry. Bounded, because it arrived from outside. */
export const PROPOSAL_CAPS = {
  /** rows in any one data column: a proposal is a specification, not a dataset */
  dataRows: 2_000,
  objects: 60,
  params: 24,
} as const;

/**
 * Trim a proposal to what a proposal is allowed to be.
 *
 * sanitizeModel already bounds types, ids, expressions and counts. This adds the
 * limits that exist because the author is a language model rather than a
 * library: a proposal may not arrive carrying twenty thousand data points (that
 * is a dataset, and a dataset comes from a file or a connector with provenance
 * of its own), and it may not claim to have been built.
 */
function trim(model: Model): Model {
  const objects = model.objects.slice(0, PROPOSAL_CAPS.objects);
  const params = model.params.slice(0, PROPOSAL_CAPS.params);
  const data = model.data
    ? Object.fromEntries(
        Object.entries(model.data).map(([k, block]) => [
          k,
          {
            ...block,
            ...(block.columns
              ? {
                  columns: Object.fromEntries(
                    Object.entries(block.columns).map(([c, v]) => [c, v.slice(0, PROPOSAL_CAPS.dataRows)])
                  ),
                }
              : {}),
            ...(block.points ? { points: block.points.slice(0, PROPOSAL_CAPS.dataRows) } : {}),
          },
        ])
      )
    : undefined;
  return { ...model, objects, params, ...(data ? { data } : {}) };
}

/**
 * Stamp what a thing came from, where nothing said.
 *
 * A PROPOSED PARAMETER IS NOT A CHOSEN ONE. The default provenance for anything
 * arriving through this path is `inference`, which the state layer renders to the
 * conversation as "Socria proposed it and nothing has confirmed it". An object
 * the model explicitly attributes to the person, to a dataset or to a source
 * keeps that attribution — it is making a claim about where the value came from,
 * and claims are allowed; silence is not.
 */
function attribute(model: Model): Model {
  return {
    ...model,
    objects: model.objects.map((o): ModelObject =>
      o.provenance
        ? o
        : {
            ...o,
            provenance: {
              origin: 'inference',
              detail: 'proposed from the conversation and validated by the engine, not chosen by you',
            },
          }
    ),
  };
}

/**
 * Is anything here actually computable?
 *
 * The bar for building at all: at least one object a real solver would run. A
 * proposal of six annotations is a picture of a model, and drawing it as `built`
 * would say the engine had computed something when it had not.
 */
function runnable(model: Model): { of: string; object: string; solver: string }[] {
  const out: { of: string; object: string; solver: string }[] = [];
  for (const o of model.objects) {
    const r = route(model, o);
    if (r.status === 'runnable') out.push({ of: o.id, object: o.label, solver: r.solver.label });
  }
  return out;
}

/**
 * A proposal, validated and built — or refused with what is missing.
 *
 * The order matters and is the order of the brief: sanitize, validate, find the
 * missing structure, work out the capability, route, and only then build.
 */
export function buildProposal(raw: ModelProposal, opts?: { at?: number }): Built {
  const at = opts?.at ?? 0;
  const titleOf = (v: unknown) =>
    v && typeof v === 'object' && typeof (v as { title?: unknown }).title === 'string'
      ? ((v as { title: string }).title || '').slice(0, 90)
      : '';

  const clean = sanitizeModel(raw);
  if (!clean) {
    return {
      ok: false,
      refusal: {
        title: titleOf(raw),
        because: 'the proposal was not a model: it had no id, no title, or nothing the engine recognised',
        missing: [],
        says:
          'I could not turn that into a model the engine can hold. Tell me what the objects are and how they relate, and I will build it properly rather than drawing a picture of it.',
      },
    };
  }

  // Mechanisms become objects before anything is judged, because a mechanism's
  // computability is a fact about its assembled system and not about its
  // declaration (expand is idempotent — see lib/model/mechanism.ts).
  const model = attribute(trim(expand(clean)));

  const solvers = runnable(model);
  const missing = missingStructure(model);

  if (!solvers.length) {
    return {
      ok: false,
      refusal: {
        title: model.title,
        because: missing.length
          ? 'nothing in it can be computed yet'
          : 'nothing in it is of a kind any solver here computes',
        missing,
        says: missing.length
          ? `I can hold the structure, but nothing computes yet: ${missing
              .map((m) => `${m.label} needs ${m.missing.map((x) => x.what).join(', ')}`)
              .join('; ')}. Give me those and it runs.`
          : 'I can hold the structure, but nothing here is something this engine computes. I can still represent it, and say plainly that nothing in it is a computed result.',
      },
    };
  }

  const cap = capabilityOf(model);
  const fidelity = overallFidelity(model.objects);

  // What produced it, recorded on the model itself so a round trip can be told
  // from a fresh build and a reader can be told which.
  const built: Model = {
    ...model,
    version: (model.version ?? 0) + 1,
    lastChange: { what: 'built', affected: model.objects.map((o) => o.id), at },
  };

  const parts = [
    `Built as a ${cap.level} model: ${solvers.map((s) => `${s.solver} runs ${s.of}`).join(', ')}.`,
    missing.length
      ? `Not everything computes — ${missing
          .map((m) => `${m.label} still needs ${m.missing.map((x) => x.what).join(', ')}`)
          .join('; ')}.`
      : '',
  ].filter(Boolean);

  return {
    ok: true,
    model: built,
    report: {
      id: built.id,
      title: built.title,
      capability: cap.level,
      because: cap.because,
      solvers,
      missing,
      fidelity,
      says: parts.join(' '),
    },
  };
}

/**
 * Re-validate a model that arrived from storage or from a browser.
 *
 * THE OTHER HALF OF THE TRUST BOUNDARY, and the reason the seal does not need to
 * be cryptographic. A built model comes back on every turn — the client sends
 * the session, the database returns it, a collaborator's event carries it — and
 * on the way back in it is worth exactly what it can still prove. So it is
 * re-sanitized and re-routed, and a model that no longer computes loses the
 * claim rather than keeping a stamp that says it once did.
 *
 * Returns null when it cannot be trusted, and the caller then has a scene with
 * no built model rather than a built model with no basis.
 */
export function revalidate(raw: unknown): Model | null {
  const clean = sanitizeModel(raw);
  if (!clean) return null;
  const model = expand(clean);
  return runnable(model).length ? clean : null;
}

/** What the conversation is told about a model it is looking at. Bounded. */
export function reportLines(report: BuildReport, limit = 8): string[] {
  const lines = [
    `Model ${report.id} — “${report.title}”, ${report.capability}, ${report.fidelity}.`,
    ...report.solvers.map((s) => `${s.of} (${s.object}): computed by ${s.solver}`),
    ...report.missing.map((m) => `${m.label}: needs ${m.missing.map((x) => x.what).join(', ')}`),
  ];
  return lines.slice(0, limit);
}
