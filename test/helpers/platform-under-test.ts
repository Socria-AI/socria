// SocriaUX 2.0 (the creative platform): designs combined across artboards, alternatives on artboards of their own,
// artboards with a visual language of their own, comments on objects, creative controls bound to the design, the
// visual review, the research layer — with the engine pieces they work on, for test/platform.test.mjs.
export * from '@/lib/ux-v0/graphics/creative/synthesis';
export { readCreative } from '@/lib/ux-v0/graphics/creative/interpret';
export { executePlan, conceptRef } from '@/lib/ux-v0/graphics/creative/execute';
export { conceptRefs, saveConcept, revisitConcept } from '@/lib/ux-v0/graphics/creative/concepts';
export { readDecisions, mainWords } from '@/lib/ux-v0/graphics/creative/decisions';
export { composeGraphic, type GraphicBrief } from '@/lib/ux-v0/graphics/compose';
export { languageDirection } from '@/lib/ux-v0/graphics/generative/language';
export { renderArtboard } from '@/lib/ux-v0/graphics/render';
export { refineDoc, checkDoc } from '@/lib/ux-v0/graphics/check';
export { readGraphicEdit } from '@/lib/ux-v0/graphics/edit';
export { applyOps, walk, normalizeDoc, boardView, fromBoardView, boardTokens, withOwnTokens, normalizeComments } from '@/lib/ux-v0/graphics/doc';
export { contrastRatio } from '@/lib/ux/audit';
export { signatureOfBoard, similarity } from '@/lib/ux-v0/graphics/generative/evaluate';
export * from '@/lib/ux-v0/graphics/creative/alternatives';
export { answerOf } from '@/lib/ux-v0/graphics/creative/interpret';
export * from '@/lib/ux-v0/graphics/creative/identity';
export * from '@/lib/ux-v0/graphics/creative/improve';
export { readScoped } from '@/lib/ux-v0/graphics/creative/scoped';
export { nudgeColour } from '@/lib/ux-v0/graphics/creative/lexicon';
export * from '@/lib/ux-v0/graphics/creative/controls';
export * from '@/lib/ux-v0/graphics/visual';
export * from '@/lib/ux-v0/research/schema';
export { research, researchProvider, PROVIDERS as RESEARCH_PROVIDERS } from '@/lib/ux-v0/research/providers-server';
export { respond, hear } from '@/lib/ux-v0/studio/director';
export { emptyStudio, normalizeStudio, said } from '@/lib/ux-v0/studio/schema';
export { briefRealisation, vibeRealisation } from '@/lib/ux-v0/studio/realise';
export { readingOf, normalizeReading, creativeSystem } from '@/lib/ux-v0/graphics/creative/model';
export { FORM_LABEL } from '@/lib/ux-v0/graphics/creative/forms';
