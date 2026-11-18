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
import { LANGUAGES } from './direction';
import { MOOD_CATEGORIES, PALETTE_ROLES, VERDICTS, type CallKind } from './types';

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
const strs: Schema = { type: 'array', items: str };
const oneOf = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] });
/** An object whose every field is required and nothing else allowed: what strict mode asks. */
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (items: Schema): Schema => ({ type: 'array', items });

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
      rationale: strs,
      voice: str,
      composition: str,
      imagery: str,
      avoid: strs,
      // optional in the prompt: null keeps the candidate's own faces
      fonts: { anyOf: [object({ display: DISPLAY, body: BODY }), { type: 'null' }] },
    })
  ),
});

/** lib/ux-v0/design.ts briefSystem: the Living Brief (and, when revising, searches for a moved direction). */
const briefFields = {
  objective: str,
  audience: str,
  userGoals: strs,
  personality: strs,
  visualDirection: str,
  palette: list(colour),
  typography: object({ display: DISPLAY, body: BODY, rationale: str }),
  layoutDirection: str,
  functionalRequirements: strs,
  references: strs,
  openQuestions: strs,
  experience: strOrNull,
  rules: strs,
  accessibility: strOrNull,
  responsive: strOrNull,
  pageType: oneOf(['website', 'app-screen']),
  platform: oneOf(['web', 'mobile']),
};
const brief = object(briefFields);
const refineBrief = object({ ...briefFields, moodboardQueries: list(query) });

/** lib/ux-v0/discovery.ts directionSystem: another direction for one aspect of the moodboard. */
const moodDirection = object({
  direction: str,
  moodboard: object({
    queries: list(query),
    palettes: list(object({ name: str, colors: list(colour) })),
    type: list(object({ display: DISPLAY, body: BODY, note: str })),
  }),
});

/** lib/ux-v0/critique.ts critiqueSystem: a reading of the selection, with evidence. */
const critique = object({
  read: str,
  verdict: oneOf(VERDICTS),
  issues: list(object({ text: str, evidence: str })),
  questions: strs,
  principles: list(object({ name: str, applies: str })),
  alternatives: list(object({ text: str, tradeoff: str })),
  // only when the route asks for it; null otherwise
  artifactSummary: strOrNull,
});

const SCHEMAS: Partial<Record<CallKind, Schema>> = {
  'art-direction': artDirection,
  brief,
  'refine-brief': refineBrief,
  direction: moodDirection,
  critique,
};

/** The structured format for a kind of call, or undefined when it answers in plain JSON (see above). */
export function formatFor(kind: CallKind): JsonFormat | undefined {
  const schema = SCHEMAS[kind];
  return schema ? { type: 'json_schema', name: `socriaux_${kind.replace(/-/g, '_')}`, schema, strict: true } : undefined;
}

/** Every kind with a schema, for the tests. */
export const STRUCTURED_KINDS = Object.keys(SCHEMAS) as CallKind[];
