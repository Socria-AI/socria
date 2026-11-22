// SocriaUX studio (lib/ux-v0/studio): the conversation's record, intent recognition, the adaptive questions, the
// creative context and how it reaches each engine — one bundle, for test/studio.test.mjs.
export * from '@/lib/ux-v0/studio/schema';
export * from '@/lib/ux-v0/studio/modes';
export * from '@/lib/ux-v0/studio/facts';
export * from '@/lib/ux-v0/studio/intent';
export * from '@/lib/ux-v0/studio/catalog';
export * from '@/lib/ux-v0/studio/options';
export * from '@/lib/ux-v0/studio/apply';
export * from '@/lib/ux-v0/studio/discovery';
export * from '@/lib/ux-v0/studio/start';
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
