// lib/ux-v0/graphics/generative/engine.ts — the generative engine, end to end, for one artboard: read the brief, work
// out the language's principles, conceive a concept, build a few variants of it (bounded), validate each program,
// compile it, judge it, keep the best; and if the result is structurally too close to something it was asked to stay
// away from (an earlier design, a Board's sibling, the design being rethought), conceive again (bounded). No model is
// called; no stored layout is read. The same seed gives the same design, so every result can be reproduced.

import type { Ctx, Kit } from '../compose';
import type { Node } from '../doc';
import { hash32 } from '../styles/hash';
import { compileProgram, engineCC, paletteOf } from './compile';
import { conceive, keyOf, type ConceptKey, type ConceptRequest, type CreativeConcept, type Emphasis } from './concept';
import { construct } from './construct';
import { aestheticCost, decodeSignature, encodeSignature, signatureOf, similarity, TOO_SIMILAR, type Signature } from './evaluate';
import { principlesFor, type Principles } from './principles';
import { normalizeProgram, type DesignProgram } from './program';
import { readCreative, type CreativeReading } from './reading';

export interface GenerativeRequest extends ConceptRequest {
  /** structures to stay away from: encoded signatures of earlier designs */
  avoidSignatures?: readonly string[];
  /** variants of the concept tried (bounded by MAX_VARIANTS) */
  variants?: number;
}

export interface Generated {
  nodes: Node[];
  concept: CreativeConcept;
  reading: CreativeReading;
  principles: Principles;
  program: DesignProgram;
  /** what validation dropped from the program (normally nothing) */
  problems: string[];
  trace: string[];
  unresolved: string[];
  signature: string;
  /** concepts conceived before one was far enough from what was to be avoided */
  attempts: number;
  /** the highest similarity to anything avoided (0 when nothing was) */
  closest: number;
  cost: number;
}

export const MAX_VARIANTS = 4;
export const MAX_CONCEPT_ATTEMPTS = 6;

/** A design generated for one artboard (see the head of this file). */
export function generate(k: Kit, x: Ctx, req: GenerativeRequest = {}): Generated {
  const reading = readCreative(x.brief, x.f, { tone: x.style?.dna.tone });
  const principles = principlesFor(x, reading);
  const avoidSigs = (req.avoidSignatures ?? []).map(decodeSignature).filter((s): s is Signature => !!s);
  // a request's own seed names the concept by itself (so it can be replayed in new tokens or another language);
  // without one, the composition's seed and the direction do
  const baseSeed = hash32(req.seed !== undefined ? `${String(req.seed)}|${x.f.id}|${x.brief.content.headline}|${x.style?.id ?? 'brief'}` : `${x.seed}|${x.f.id}|${x.brief.content.headline}|${x.dir.name}`);
  const variants = Math.max(1, Math.min(MAX_VARIANTS, req.variants ?? 3));
  const avoid: ConceptKey[] = [...(req.avoid ?? [])];
  let chosen: Generated | null = null;
  for (let a = 0; a < MAX_CONCEPT_ATTEMPTS; a++) {
    const concept = conceive(reading, principles, { ...req, seed: (baseSeed + a * 7919) >>> 0, avoid });
    const cc = engineCC(k, x, concept.seed, concept.density, concept.experimentation, concept.symmetry);
    const b = {
      W: x.W,
      H: x.H,
      u: x.u,
      safe: cc.safe,
      pal: paletteOf(cc),
      images: x.brief.images.length,
      headline: x.brief.content.headline,
      minText: k.minText(x),
      styleMotifs: (x.vocab?.motifs ?? []).map((m) => ({ kind: m.kind, params: { ...m.params } })),
      pattern: x.vocab?.pattern && (x.vocab.strength >= 2 || principles.ornament.density >= 40) ? x.vocab.pattern.gen : null,
      vocabStrong: !x.style && (x.vocab?.strength ?? 0) >= 3,
      kind: x.brief.kind,
    };
    let best: Omit<Generated, 'attempts' | 'closest' | 'signature'> | null = null;
    for (let v = 0; v < variants; v++) {
      const built = construct(b, concept, principles, reading, v);
      const { program, problems } = normalizeProgram(built.program, { images: b.images });
      if (!program) continue;
      const compiled = compileProgram(cc, program, reading, { keepClear: concept.type !== 'path' });
      const { cost } = aestheticCost(compiled.nodes, x.W, x.H, concept, compiled.unresolved, x.ground);
      if (!best || cost < best.cost) best = { nodes: compiled.nodes, concept, reading, principles, program, problems, trace: built.trace, unresolved: compiled.unresolved, cost };
    }
    if (!best) continue;
    const sig = signatureOf(best.nodes, x.W, x.H, x.ground);
    const closest = avoidSigs.length ? Math.max(...avoidSigs.map((s) => similarity(sig, s))) : 0;
    const result: Generated = { ...best, signature: encodeSignature(sig), attempts: a + 1, closest };
    if (!chosen || closest < chosen.closest) chosen = result;
    if (closest < TOO_SIMILAR) break;
    // too close to what was to be avoided: that concept's structure joins the things to stay away from
    avoid.push(keyOf(concept));
  }
  if (!chosen) throw new Error('The generative engine could not build this brief.');
  return chosen;
}

/** Independent interpretations for one brief: different leads (type, picture, an abstract idea, geometry, an organic
 * form, a collage), each its own seed, so the options are separate concepts rather than variations of one. */
export function interpretations(opts: { count: number; salt: string; hasImage: boolean; hasData?: boolean }): { emphasis: Emphasis; seed: string; unexpected?: boolean }[] {
  const leads: Emphasis[] = opts.hasData ? ['data', 'type', 'abstract', 'geometric', 'organic'] : opts.hasImage ? ['image', 'type', 'abstract', 'collage', 'geometric', 'organic'] : ['type', 'abstract', 'geometric', 'organic', 'type', 'abstract'];
  const out: { emphasis: Emphasis; seed: string; unexpected?: boolean }[] = [];
  const start = hash32(opts.salt) % leads.length;
  for (let i = 0; i < Math.max(1, Math.min(6, opts.count)); i++) out.push({ emphasis: leads[(start + i) % leads.length], seed: `${opts.salt}|${i}`, ...(i === 2 ? { unexpected: true } : {}) });
  return out;
}

export { similarity, signatureOf, encodeSignature, decodeSignature, TOO_SIMILAR };
