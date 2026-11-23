// lib/ux-v0/schemas.ts — the shapes of SocriaUX's creative specifications, for structured outputs.
//
// When SocriaUX runs on the Responses API (lib/ux-v0/model.ts, GPT-6.1 Sol),
// a call whose answer has a fixed shape asks for it as a strict JSON schema
// (`text.format: { type: "json_schema", strict: true }`), so the model cannot
// return a field the parser does not expect, a font outside the allowlist, a
// visual language outside the catalogue, or a verdict outside the four. Each
// schema matches its prompt's "Respond with ONE JSON object" contract field
// for field; strict mode needs every field present, so a field the prompt
// calls optional is `null` when there is nothing to say (each parser reads a
// null as absent, tested in test/ux-v0.test.mjs).
//
// Two calls have no schema, on purpose, and ask for plain JSON instead:
//   discover   its `known` is a map from topic to text, whose keys strict mode cannot leave open;
//   generate,
//   refine     a section's content depends on its kind (lib/ux-v0/spec.ts) and is checked there,
//              field by field, which a single schema would only loosen or duplicate.
//
// The Chat Completions path (every other model) is unchanged: JSON mode, as before.

import { FONTS } from './fonts';
import { EXPERIENCES } from './intent';
import { LANGUAGES } from './direction';
import { SIGNATURES } from './plan';
import { MOOD_CATEGORIES, PALETTE_ROLES, VERDICTS, type CallKind } from './types';
import { CREATIVE_PLAN_SCHEMA } from './graphics/creative/model';

type Schema = Record<string, unknown>;

/** A Responses API structured format: `text.format`. */
export interface JsonFormat {
  type: 'json_schema';
  name: string;
  schema: Schema;
  strict: true;
}

const str: Schema = { type: 'string' };
const strOrNull: Schema = { type: ['string', 'null'] };
/**
 * Every list is bounded, at a little over what its prompt asks for: a strict schema with an open list let
 * one live answer run on until it hit its cap (17,184 tokens, docs/SOCRIAUX-SOL.md), and a bound keeps a
 * list from becoming that loop. The parsers keep their own, tighter limits.
 */
const strs = (max: number): Schema => ({ type: 'array', items: str, maxItems: max });
const oneOf = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] });
/** An object whose every field is required and nothing else allowed: what strict mode asks. */
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (items: Schema, max: number): Schema => ({ type: 'array', items, maxItems: max });

const DISPLAY = oneOf(FONTS.filter((f) => f.kind !== 'mono').map((f) => f.name));
const BODY = oneOf(FONTS.filter((f) => !f.displayOnly && f.kind !== 'mono').map((f) => f.name));
const colour = object({ hex: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, role: oneOf(PALETTE_ROLES) });
const query = object({ category: oneOf(MOOD_CATEGORIES), query: str });

/** lib/ux-v0/direction.ts directSystem: three art directions, written for this brand. */
const artDirection = object({
  directions: list(
    object({
      candidate: { type: 'integer' },
      language: oneOf(LANGUAGES.map((l) => l.id)),
      name: str,
      concept: str,
      rationale: strs(4),
      voice: str,
      composition: str,
      imagery: str,
      avoid: strs(5),
      // optional in the prompt: null keeps the candidate's own faces
      fonts: { anyOf: [object({ display: DISPLAY, body: BODY }), { type: 'null' }] },
      // the plan (lib/ux-v0/plan.ts): its one bold move, and one detail only this subject has; null keeps the engine's
      signature: { anyOf: [oneOf([...SIGNATURES]), { type: 'null' }] },
      detail: strOrNull,
    }),
    3
  ),
});

/** lib/ux-v0/design.ts briefSystem: the Living Brief (and, when revising, searches for a moved direction). */
const briefFields = {
  objective: str,
  audience: str,
  userGoals: strs(8),
  personality: strs(6),
  visualDirection: str,
  palette: list(colour, 8),
  typography: object({ display: DISPLAY, body: BODY, rationale: str }),
  layoutDirection: str,
  functionalRequirements: strs(12),
  references: strs(12),
  openQuestions: strs(8),
  experience: strOrNull,
  rules: strs(10),
  accessibility: strOrNull,
  responsive: strOrNull,
  pageType: oneOf(['website', 'app-screen']),
  platform: oneOf(['web', 'mobile']),
  experienceKind: oneOf(EXPERIENCES),
};
const brief = object(briefFields);
const refineBrief = object({ ...briefFields, moodboardQueries: list(query, 3) });

/** lib/ux-v0/discovery.ts directionSystem: another direction for one aspect of the moodboard. */
const MOOD_PARTS = {
  queries: list(query, 5),
  palettes: list(object({ name: str, colors: list(colour, 8) }), 3),
  type: list(object({ display: DISPLAY, body: BODY, note: str }), 3),
};
const moodDirection = object({ direction: str, moodboard: object(MOOD_PARTS) });
/**
 * Only the part the aspect asks for: searches for imagery, texture or composition, palettes for colour,
 * pairs for type. Making the model close two empty lists it was never asked about did it no good (in the
 * first live run, this call ran on to its cap twice in four tries with all three required).
 */
const moodDirectionFor = (aspect: string): Schema =>
  object({ direction: str, moodboard: object(aspect === 'palette' ? { palettes: MOOD_PARTS.palettes } : aspect === 'type' ? { type: MOOD_PARTS.type } : { queries: MOOD_PARTS.queries }) });

/** lib/ux-v0/critique.ts critiqueSystem: a reading of the selection, with evidence. */
const critique = object({
  read: str,
  verdict: oneOf(VERDICTS),
  issues: list(object({ text: str, evidence: str }), 3),
  questions: strs(2),
  principles: list(object({ name: str, applies: str }), 3),
  alternatives: list(object({ text: str, tradeoff: str }), 3),
  // only when the route asks for it; null otherwise
  artifactSummary: strOrNull,
});

const SCHEMAS: Partial<Record<CallKind, Schema>> = {
  'art-direction': artDirection,
  brief,
  'refine-brief': refineBrief,
  direction: moodDirection,
  critique,
  // lib/ux-v0/graphics/creative/model.ts: a creative change read into a plan of decisions in the engine's vocabulary
  'creative-edit': CREATIVE_PLAN_SCHEMA,
};

/** The structured format for a kind of call, or undefined when it answers in plain JSON (see above). */
export function formatFor(kind: CallKind, aspect?: string): JsonFormat | undefined {
  const schema = kind === 'direction' && aspect ? moodDirectionFor(aspect) : SCHEMAS[kind];
  return schema ? { type: 'json_schema', name: `socriaux_${kind.replace(/-/g, '_')}`, schema, strict: true } : undefined;
}

/** Every kind with a schema, for the tests. */
export const STRUCTURED_KINDS = Object.keys(SCHEMAS) as CallKind[];
