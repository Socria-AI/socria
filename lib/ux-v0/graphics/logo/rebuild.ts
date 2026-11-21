// lib/ux-v0/graphics/logo/rebuild.ts — a concept rebuilt from its record: the same method, seed, weight, softness and
// transforms give the same mark, so a record never stores geometry.

import type { LogoBrief } from './brief';
import type { LogoConcept } from './concepts';
import { rebuildMark } from './edits';
import { decodeSig, type ConceptRecord, type LogoRecord } from './record';

export function conceptFrom(r: ConceptRecord, b: LogoBrief): LogoConcept {
  const mark = r.method ? rebuildMark(r.method, r.seed, { name: b.name, initials: b.initials, sw: r.sw, soft: r.soft, avoid: new Set(b.avoid), ...(b.creature ? { creature: b.creature } : {}) }, r.ops) : null;
  return { ...r, mark, sig: decodeSig(r.sig), parents: r.parents, edit: r.edit } as LogoConcept;
}

/** Every concept of a record rebuilt (in the record's order). */
export const conceptsOf = (rec: LogoRecord): LogoConcept[] => rec.concepts.map((c) => conceptFrom(c, rec.brief));

/** The record's selected concept (else its approved one, else its first), rebuilt. */
export function selectedConcept(rec: LogoRecord): LogoConcept | null {
  const r = rec.concepts.find((c) => c.id === rec.selected) ?? rec.concepts.find((c) => c.id === rec.approved) ?? rec.concepts[0];
  return r ? conceptFrom(r, rec.brief) : null;
}
