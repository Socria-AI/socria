// SocriaUX studio (lib/ux-v0/studio): the conversation's record, intent recognition, the creative director, websites
// read for reference, the creative context and how it reaches each engine — one bundle, for test/studio.test.mjs.
export * from '@/lib/ux-v0/studio/schema';
export * from '@/lib/ux-v0/studio/modes';
export * from '@/lib/ux-v0/studio/facts';
export * from '@/lib/ux-v0/studio/intent';
export * from '@/lib/ux-v0/studio/catalog';
export * from '@/lib/ux-v0/studio/options';
export * from '@/lib/ux-v0/studio/apply';
export * from '@/lib/ux-v0/studio/director';
export * from '@/lib/ux-v0/studio/start';
export * from '@/lib/ux-v0/studio/references';
export * from '@/lib/ux-v0/studio/discovery';
export { readSiteReference, referenceAddress } from '@/lib/ux-v0/studio/reference-server';
// the engines it reaches, for the end-to-end checks
export { makeProject, normalizeProject, summarize } from '@/lib/ux-v0/types';
export { composeGraphic, readGraphicBrief } from '@/lib/ux-v0/graphics/compose';
export { languageDirection } from '@/lib/ux-v0/graphics/generative/language';
export { logoBriefOf as logoBriefOfGraphic, explore as exploreLogo } from '@/lib/ux-v0/graphics/logo/compose';
export { readBoardRequest } from '@/lib/ux-v0/boards/plan';
export { proposeSystems, startBoard } from '@/lib/ux-v0/boards/pipeline';
export { renderDesign } from '@/lib/ux-v0/render';
export { proposeDirections } from '@/lib/ux-v0/direction';
export { normalizeBrief } from '@/lib/ux-v0/types';
// the creative questions: the model's side, the mood carried into the work, the moods drawn small
export * from '@/lib/ux-v0/studio/discovery-model';
export * from '@/lib/ux-v0/studio/realise';
export * from '@/lib/ux-v0/studio/vibe-preview';
export { executePlan } from '@/lib/ux-v0/graphics/creative/execute';
export { renderArtboard } from '@/lib/ux-v0/graphics/render';
export { FONTS } from '@/lib/ux-v0/fonts';
export { contrastRatio } from '@/lib/ux/audit';
export { QUALITIES, THEMES, TYPE_CHARACTERS } from '@/lib/ux-v0/graphics/creative/lexicon';
