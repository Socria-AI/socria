// lib/model/binding.ts
//
// HOW A COEFFICIENT GETS A CONTROL — said once, for everything that asks.
//
// THE FAILURE THIS CLOSES. A log-wage specification arrived with its four
// coefficients as controls named b0, b1, b2, b3 and no `coefficients` map, and
// the engine drew nothing: the expander resolved a coefficient to a control
// only through that map or through an id nobody can write (`spec__b1` does not
// exist until the expander runs), left the symbol in the expression, and the
// sampler reported β₁ as a quantity with no value. Meanwhile the prompt told the
// extractor the opposite — "name it the ordinary way, b0, b1, and the engine
// binds it by that name" — so the two halves of one product disagreed about
// what a control called b1 means, and the person saw the empty frame.
//
// THE RULE, AND WHY IT IS NOT GUESSING. β₁ is the coefficient on the first
// regressor. That is not a resemblance, it is the notation every econometrics
// text uses and the one the person reads on the slider. So a control whose id
// or label IS that notation — b1, beta1, b_1, beta_1, β₁ — binds to that slot,
// exactly, after normalising case, underscores and subscript digits. A control
// called `beta`, `b1x`, `coef_educ` or `slope` is NOT the notation and does not
// bind, which is the line model-binding.test.mjs §3 draws: nothing is matched
// by resemblance. What binds is one of three DECLARED things, in the order that
// lets a person override the model:
//
//   1. the `coefficients` map names a control for the regressor;
//   2. a control whose id is the canonical id of that slot;
//   3. a control whose id or label is the standard notation for that slot.
//
// AND WHEN NOTHING BINDS, THE COEFFICIENT IS A PLACEHOLDER, NOT A REFUSAL.
// sanitizeModel writes a control for it — at 0 for the intercept, 1 for a
// slope, marked `assumed: 'value'` — so the relationship DRAWS, the Model tab
// shows the slider, and every sentence about the picture says the number is a
// placeholder until somebody sets it. An empty frame captioned "β₁ needs a
// value" is the thing a person called bullshit; a drawn line with a slider
// labelled placeholder is the same information with a picture attached.
//
// PURE. Type-only imports, so schema.ts and estimate.ts can both use it.

import type { EstimationDecl, Model, ModelParam } from './schema';

/** Subscript digits, so β1 and β₀ do not sit in the same line looking unrelated. */
const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** The label a coefficient carries, by slot: β₀ for the intercept, β₁ for the first regressor. */
export function labelForSlot(slot: number): string {
  return `β${String(slot).split('').map((d) => SUB[Number(d)] ?? d).join('')}`;
}

/** The id the expander gives the coefficient in `slot` of `carrierId`. */
export function canonicalCoefficientId(carrierId: string, slot: number): string {
  return `${carrierId}__b${slot}`;
}

/** The slots a declaration has: the intercept (0) when it wants one, then each regressor. */
export function slotsOf(decl: Pick<EstimationDecl, 'x' | 'intercept'>): { slot: number; regressor: string }[] {
  const wants = decl.intercept !== false;
  const out: { slot: number; regressor: string }[] = [];
  if (wants) out.push({ slot: 0, regressor: 'intercept' });
  decl.x.forEach((x, i) => out.push({ slot: wants ? i + 1 : i, regressor: x }));
  return out;
}

/**
 * One spelling for every way the notation is written.
 *
 * `β₁`, `β1`, `beta_1`, `Beta1`, `b_1` and `B1` all become `b1`; `beta` on
 * its own becomes `beta`, which matches no slot. Exact after this, never a
 * prefix: `b1x` stays `b1x`.
 */
export function notationKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/β/g, 'b')
    .replace(/beta/g, 'b')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String(SUB.indexOf(c)))
    .replace(/[_\s]/g, '');
}

/** Is this id or label the standard notation for the coefficient in `slot`? */
export function isNotationFor(s: string, slot: number): boolean {
  return notationKey(s) === `b${slot}`;
}

export type CoefficientControl = {
  /** the control's id */
  id: string;
  /** which of the three declared ways found it */
  how: 'declared' | 'canonical' | 'notation';
};

/**
 * The control driving the coefficient in `slot`, if any of the three declared
 * ways reaches one. Undefined is a real answer: nothing binds it.
 */
export function controlFor(
  params: readonly ModelParam[],
  decl: Pick<EstimationDecl, 'x' | 'intercept' | 'coefficients'>,
  carrierId: string,
  slot: number
): CoefficientControl | undefined {
  const entry = slotsOf(decl).find((s) => s.slot === slot);
  if (!entry) return undefined;
  // 1. declared
  const named = decl.coefficients?.[entry.regressor];
  if (named && params.some((p) => p.id === named)) return { id: named, how: 'declared' };
  // 2. canonical
  const canonical = canonicalCoefficientId(carrierId, slot);
  if (params.some((p) => p.id === canonical)) return { id: canonical, how: 'canonical' };
  // 3. notation — the id first, then the label, so `c1` labelled β₁ binds too.
  const byId = params.find((p) => isNotationFor(p.id, slot));
  if (byId) return { id: byId.id, how: 'notation' };
  const byLabel = params.find((p) => isNotationFor(p.label, slot));
  if (byLabel) return { id: byLabel.id, how: 'notation' };
  return undefined;
}

/** Is this control a placeholder — a number nothing has given, standing in so the picture draws? */
export function isPlaceholder(p: ModelParam | undefined): boolean {
  return p?.assumed === 'value';
}

/** The placeholder value a slot stands at until somebody sets it: 0 for the intercept, 1 for a slope. */
export function placeholderValue(slot: number): number {
  return slot === 0 ? 0 : 1;
}

/** The range a placeholder slider spans. Wide enough to reach any ordinary coefficient; the person narrows it by setting one. */
export const PLACEHOLDER_RANGE: [number, number] = [-10, 10];

/** A sentence the Model tab and the inspector show for a placeholder. */
export function placeholderMeans(label: string, value: number): string {
  return `nothing has given ${label} a value yet — this is a placeholder at ${value}, and the picture is drawn at it. Move it, or say what ${label} is.`;
}

/**
 * The placeholder controls a model still needs, given what it already has.
 *
 * Only for specifications WITHOUT data: a fitted model's coefficients come from
 * the fit, and a placeholder control would outrank them. And only for slots
 * that nothing reaches — not a declared, canonical or notation control, not a
 * value an edit wrote on the coefficient object.
 */
export function placeholdersFor(model: Pick<Model, 'objects' | 'params'>): ModelParam[] {
  const out: ModelParam[] = [];
  for (const o of model.objects) {
    const decl = o.estimation;
    if (!decl || decl.data) continue;
    for (const { slot } of slotsOf(decl)) {
      if (controlFor([...model.params, ...out], decl, o.id, slot)) continue;
      const canonical = canonicalCoefficientId(o.id, slot);
      const written = model.objects.find((x) => x.id === canonical);
      const has = written && (written.defs?.value !== undefined || typeof written.value === 'number');
      if (has) continue;
      const value = placeholderValue(slot);
      const label = labelForSlot(slot);
      out.push({
        id: canonical,
        label,
        value,
        min: PLACEHOLDER_RANGE[0],
        max: PLACEHOLDER_RANGE[1],
        step: 0.01,
        assumed: 'value',
        means: placeholderMeans(label, value),
      });
    }
  }
  return out;
}
