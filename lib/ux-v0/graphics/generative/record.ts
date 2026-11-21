// lib/ux-v0/graphics/generative/record.ts — what an artboard keeps of the concept it was generated from: the idea in
// words, its structural keys, the strategies, the language it was read in, its structural signature, and the request
// that produced it (so a token change or a regeneration can rebuild the same concept, and memory can stay away from
// it). Held to its shape like everything else the document stores.

import { EMPHASES, IMAGERY, type CreativeConcept } from './concept';
import { MOTIFS } from './lexicon';
import { COLOURINGS, OPS, ORGS, SOURCES, TYPE_STRATEGIES } from './principles';

export interface ConceptRecord {
  schema: 1;
  seed: number;
  emphasis: string;
  source: string;
  motif: string | null;
  org: string;
  org2: string | null;
  type: string;
  operations: string[];
  colouring: string;
  imagery: string;
  focal: { x: number; y: number };
  metaphor: { name: string; domain: string } | null;
  idea: string;
  artDirection: string;
  strategies: { typography: string; geometry: string; imagery: string; composition: string; colour: string; texture: string; space: string };
  language: { source: 'style' | 'brief'; name: string };
  /** the structure, encoded (evaluate.ts encodeSignature) */
  signature: string;
  /** what produced it: replayed to rebuild the same concept in new tokens */
  request: { seed: string; emphasis?: string; constraints?: Record<string, string | number | boolean> };
}

const STRATS = ['typography', 'geometry', 'imagery', 'composition', 'colour', 'texture', 'space'] as const;
const o = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, n = 400) => (typeof v === 'string' ? v.replace(/[<>\u0000-\u001f]/g, '').slice(0, n) : '');
const pick = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null);
const unit = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5);

/** The record of a concept as built (see the head of this file). */
export function conceptRecord(c: CreativeConcept, signature: string, request: { seed?: string | number; emphasis?: string; constraints?: object }): ConceptRecord {
  return normalizeConceptRecord({
    ...c,
    signature,
    metaphor: c.metaphor ? { name: c.metaphor.name, domain: c.metaphor.domain } : null,
    request: { seed: String(request.seed ?? c.seed), ...(request.emphasis ? { emphasis: request.emphasis } : {}), ...(request.constraints ? { constraints: request.constraints } : {}) },
  })!;
}

/** A stored concept record, held to its shape; undefined when it is not one. */
export function normalizeConceptRecord(v: unknown): ConceptRecord | undefined {
  const r = o(v);
  const emphasis = pick(r.emphasis, EMPHASES);
  const source = pick(r.source, SOURCES);
  const org = pick(r.org, ORGS);
  const type = pick(r.type, TYPE_STRATEGIES);
  if (!emphasis || !source || !org || !type || typeof r.seed !== 'number' || !Number.isFinite(r.seed)) return undefined;
  const st = o(r.strategies);
  const lang = o(r.language);
  const req = o(r.request);
  const cons = Object.fromEntries(
    Object.entries(o(req.constraints))
      .filter(([, x]) => ['string', 'number', 'boolean'].includes(typeof x) && (typeof x !== 'number' || Number.isFinite(x)))
      .slice(0, 16)
      .map(([k, x]) => [k.replace(/[^\w-]/g, '').slice(0, 24), typeof x === 'string' ? str(x, 60) : x]),
  ) as Record<string, string | number | boolean>;
  const met = o(r.metaphor);
  return {
    schema: 1,
    seed: Math.round(Math.abs(r.seed)) % 4294967296,
    emphasis,
    source,
    motif: pick(r.motif, MOTIFS),
    org,
    org2: pick(r.org2, ORGS),
    type,
    operations: Array.isArray(r.operations)
      ? r.operations
          .map((x) => pick(x, OPS))
          .filter((x): x is (typeof OPS)[number] => !!x)
          .slice(0, 4)
      : [],
    colouring: pick(r.colouring, COLOURINGS) ?? 'figure-ground',
    imagery: pick(r.imagery, IMAGERY) ?? 'none',
    focal: { x: unit(o(r.focal).x), y: unit(o(r.focal).y) },
    metaphor: typeof met.name === 'string' ? { name: str(met.name, 60), domain: str(met.domain, 60) } : null,
    idea: str(r.idea),
    artDirection: str(r.artDirection),
    strategies: Object.fromEntries(STRATS.map((k) => [k, str(st[k], 300)])) as ConceptRecord['strategies'],
    language: { source: lang.source === 'style' ? 'style' : 'brief', name: str(lang.name, 80) },
    signature: str(r.signature, 400).replace(/[^a-z0-9.,-]/gi, ''),
    request: { seed: str(req.seed, 120) || String(r.seed), ...(typeof req.emphasis === 'string' && pick(req.emphasis, EMPHASES) ? { emphasis: req.emphasis } : {}), ...(Object.keys(cons).length ? { constraints: cons } : {}) },
  };
}

const BOOL_KEYS = ['keepType', 'unexpected', 'unconventional', 'imagePrimary', 'abstractMotif', 'notAiLook', 'dynamic', 'asymmetric', 'diagonal', 'headlineCentral'] as const;

/** A request for the engine as a direction or a Board carries it, held to its shape (signatures bounded). */
export function normalizeGenerativeRequest(v: unknown): import('./engine').GenerativeRequest | undefined {
  const r = o(v);
  if (!Object.keys(r).length) return undefined;
  const c = o(r.constraints);
  const focal = o(c.focal);
  const constraints: Record<string, unknown> = {};
  for (const k of BOOL_KEYS) if (c[k] === true) constraints[k] = true;
  const org = pick(c.org, ORGS);
  const type = pick(c.type, TYPE_STRATEGIES);
  const emphasis = pick(c.emphasis, EMPHASES);
  const colouring = pick(c.colouring, COLOURINGS);
  if (org) constraints.org = org;
  if (type) constraints.type = type;
  if (emphasis) constraints.emphasis = emphasis;
  if (colouring) constraints.colouring = colouring;
  if (typeof focal.x === 'number' && typeof focal.y === 'number') constraints.focal = { x: unit(focal.x), y: unit(focal.y) };
  if (typeof c.negativeSpace === 'number' && Number.isFinite(c.negativeSpace)) constraints.negativeSpace = Math.max(0, Math.min(100, Math.round(c.negativeSpace)));
  if (typeof c.experimentation === 'number' && Number.isFinite(c.experimentation)) constraints.experimentation = Math.max(0, Math.min(100, Math.round(c.experimentation)));
  if (typeof c.family === 'string') constraints.family = str(c.family, 40).replace(/[^a-z0-9-]/g, '');
  const seed = typeof r.seed === 'number' && Number.isFinite(r.seed) ? r.seed : typeof r.seed === 'string' ? str(r.seed, 160) : undefined;
  const em = pick(r.emphasis, EMPHASES);
  const sigs = Array.isArray(r.avoidSignatures)
    ? r.avoidSignatures
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.replace(/[^a-z0-9.,-]/gi, '').slice(0, 400))
        .filter(Boolean)
        .slice(-12)
    : [];
  return {
    ...(seed !== undefined ? { seed } : {}),
    ...(em ? { emphasis: em } : {}),
    ...(sigs.length ? { avoidSignatures: sigs } : {}),
    ...(typeof r.variants === 'number' && Number.isFinite(r.variants) ? { variants: Math.max(1, Math.min(4, Math.round(r.variants))) } : {}),
    ...(Object.keys(constraints).length ? { constraints: constraints as never } : {}),
  };
}
