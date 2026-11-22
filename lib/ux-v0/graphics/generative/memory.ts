// lib/ux-v0/graphics/generative/memory.ts — what the designer chose and turned down, kept with the design (bounded,
// composition/schema.ts normalizeMemory). A concept applied is remembered as chosen; one discarded as "not like this",
// and the next rethink stays away from its structure (edits.ts reads the rejected signatures).

import { applyOps, type Artboard, type GraphicDoc } from '../doc';
import type { MemoryEntry, MemoryVerdict } from '../composition/schema';

/** The concepts that differ between two versions of a document (new or changed artboards), with their artboards. */
export function changedConcepts(base: GraphicDoc, next: GraphicDoc): Artboard[] {
  return next.artboards.filter((b) => b.concept && b.concept.signature && b.concept.signature !== base.artboards.find((x) => x.id === b.id)?.concept?.signature);
}

/** The document with these artboards' concepts remembered under a verdict (one change; the bound kept). */
export function remember(doc: GraphicDoc, boards: readonly Artboard[], verdict: MemoryVerdict, now = Date.now()): GraphicDoc {
  if (!boards.length) return doc;
  const entries: MemoryEntry[] = [
    ...(doc.compositionMemory ?? []),
    ...boards.filter((b) => b.concept).map((b) => ({ at: now, family: `generative:${b.concept!.org}`, sig: b.concept!.signature, verdict, scope: 'artboard' as const, artboard: b.id, ...(doc.style?.primary ? { style: doc.style.primary } : {}) })),
  ];
  const r = applyOps(doc, [{ op: 'composition-memory', entries }]);
  return r.ok ? r.doc : doc;
}
