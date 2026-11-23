// SocriaUX v0 (/ux-v0): shapes, fonts, the spec and its patches, art direction, the renderer,
// the sandbox, the inspector's source, selections and their facts, the
// critique gate, discovery, the brief and design prompts, the model's
// configuration, the switch and the image providers — one bundle, for
// test/ux-v0.test.mjs.
export * from '@/lib/ux-v0/types';
export * from '@/lib/ux-v0/fonts';
export * from '@/lib/ux-v0/spec';
export * from '@/lib/ux-v0/render';
export * from '@/lib/ux-v0/sandbox';
export * from '@/lib/ux-v0/inspector';
export * from '@/lib/ux-v0/selection';
export * from '@/lib/ux-v0/critique';
export * from '@/lib/ux-v0/discovery';
export * from '@/lib/ux-v0/design';
export * from '@/lib/ux-v0/model';
export * from '@/lib/ux-v0/switch';
export { pingUse } from '@/lib/ux-v0/images-server';
export { costOf } from '@/lib/model-router';
// art direction: the visual languages and the engine, colour arithmetic, the rendered-page audit and its evaluation
export * from '@/lib/ux-v0/direction';
export * from '@/lib/ux-v0/color';
export * from '@/lib/ux-v0/evaluate';
export { AUDIT_SOURCE } from '@/lib/ux-v0/audit-source';
// motion: presets, words, the CSS that plays them, kinetic headlines
export * from '@/lib/ux-v0/motion';
// the moodboard as art direction: reading notes and boards, content and inspiration
export * from '@/lib/ux-v0/references';
// the Living Brief's rules: decided stays decided, delegation, applying the brief to a design
export * from '@/lib/ux-v0/brief';
// design knowledge, and one decision changed in code
export * from '@/lib/ux-v0/knowledge';
export * from '@/lib/ux-v0/refine-local';
// the one model call every route makes (Chat Completions, or the Responses API for GPT-6.1 Sol), and the
// structured formats it asks for
export { askJson, askRouted, readJson, setClaudeClient, usageOfClaude } from '@/lib/ux-v0/ask';
export * from '@/lib/ux-v0/schemas';
// what is being made: the intent, fitting a design to it, the Direction studies, the behaviour runtime
export * from '@/lib/ux-v0/intent';
export * from '@/lib/ux-v0/fit';
export * from '@/lib/ux-v0/study';
export { BEHAVIOR_SOURCE } from '@/lib/ux-v0/behaviors';
export * from '@/lib/ux-v0/budget';
export * from '@/lib/ux-v0/edit';
export * from '@/lib/ux-v0/structure';
// the layout: what the designer decided (lead, arrangement, alignment, pictures), the one layout question, and
// the settings each direction varies within
export * from '@/lib/ux-v0/layout';
// the looks generated pages share, detected and kept out unless asked for
export * from '@/lib/ux-v0/tells';
// each direction's plan: named colours, type, layout, one signature move, one subject detail; critiqued
export * from '@/lib/ux-v0/plan';
// the designer's design system: read from their files or GitHub, built within, checked against
export * from '@/lib/ux-v0/design-system';
export { repoTarget, pickFiles, fetchSystemFiles } from '@/lib/ux-v0/design-system-server';
// layout pieces: a section composed from stacks, grids in proportion, boxes, text, figures, pictures
export * from '@/lib/ux-v0/compose';
// performance and reliability: everyday edits in code, each operation's record, the measured estimates
export * from '@/lib/ux-v0/quick-edit';
export * from '@/lib/ux-v0/telemetry';
export * from '@/lib/ux-v0/estimates';
// the Creative DNA: dimensions, derivation, locks, divergence, shaping a design, reading one back
export * from '@/lib/ux-v0/dna';
// a reference's design DNA, measured from its pixels
export * from '@/lib/ux-v0/ref-dna';
// the originality audit: generic patterns, their justification, targeted fixes, four scores
export * from '@/lib/ux-v0/originality';
// Explore Directions: how the directions differ, row by row, and the DNA each explores
export * from '@/lib/ux-v0/explore';
// the scripted layer of the motion: scrub, story, arrivals, magnetic, tilt, line drawing
export { MOTION_RUNTIME } from '@/lib/ux-v0/motion-runtime';
// the 3D scene runtime
export { SCENE_RUNTIME } from '@/lib/ux-v0/scene-runtime';
// pictures SocriaUX draws in code, and the separate image-model pathway (its prompt, price and checks)
export * from '@/lib/ux-v0/assets';
export { imageGenConfig, sizeFor, imagePrice, imagePrompt, checkImage, generateImage } from '@/lib/ux-v0/image-gen-server';
// the creative reading: qualities, refusals, tensions, influences and restrictions, as execution
export * from '@/lib/ux-v0/interpret';
export { holdArrangement } from '@/lib/ux-v0/arrange';
// the shape grammar, the shape systems derived from directions, the compositional strategy and the composer
export * from '@/lib/ux-v0/shape';
export * from '@/lib/ux-v0/form';
export * from '@/lib/ux-v0/strategy';
export * from '@/lib/ux-v0/composer';
export { holdStrategy, strategyHeld } from '@/lib/ux-v0/arrange';
// where every button and link goes (website mastery)
export * from '@/lib/ux-v0/links';
export * from '@/lib/ux-v0/export-site';
export * from '@/lib/ux-v0/quality';
export * from '@/lib/ux-v0/decisions';
export { tightenField, withoutPiece } from '@/lib/ux-v0/compose';
export { AREAS, AREA_LABEL, readScope, changesBetween, inScope, confine, describeBack } from '@/lib/ux-v0/scope';
export { readTargeted, reshape } from '@/lib/ux-v0/targeted';
export { capVersions, describeChanges, restoredVersion, MAX_VERSIONS } from '@/lib/ux-v0/history';
// graphics 1.0: the document, its formats, text layout, the SVG renderer, composition
export * as gfxDoc from '@/lib/ux-v0/graphics/doc';
export * as gfxFormats from '@/lib/ux-v0/graphics/formats';
export * as gfxText from '@/lib/ux-v0/graphics/text';
export * as gfxRender from '@/lib/ux-v0/graphics/render';
export * as gfxCompose from '@/lib/ux-v0/graphics/compose';
export * as gfxCheck from '@/lib/ux-v0/graphics/check';
export * as gfxEdit from '@/lib/ux-v0/graphics/edit';
export * as gfxExport from '@/lib/ux-v0/graphics/export';
export * as boardModel from '@/lib/ux-v0/boards/model';
export * as boardSystem from '@/lib/ux-v0/boards/system';
export * as boardPlan from '@/lib/ux-v0/boards/plan';
export * as boardLayout from '@/lib/ux-v0/boards/layout';
export * as boardAnnotate from '@/lib/ux-v0/boards/annotate';
export * as boardEvaluate from '@/lib/ux-v0/boards/evaluate';
export * as boardEdit from '@/lib/ux-v0/boards/edit';
export * as boardExport from '@/lib/ux-v0/boards/export';
export * as boardMockup from '@/lib/ux-v0/boards/mockup';
export * as boardPipeline from '@/lib/ux-v0/boards/pipeline';
export * as boardSync from '@/lib/ux-v0/boards/sync';
export * as boardWebsite from '@/lib/ux-v0/boards/website';
export * as boardStyle from '@/lib/ux-v0/boards/style';
export * as gfxGeometry from '@/lib/ux-v0/graphics/geometry';
export * as gfxPaint from '@/lib/ux-v0/graphics/paint';
export * as gfxEffects from '@/lib/ux-v0/graphics/effects';
export * as gfxPatterns from '@/lib/ux-v0/graphics/patterns';
export * as gfxVector from '@/lib/ux-v0/graphics/vectorops';
export * as gfxSvgImport from '@/lib/ux-v0/graphics/svgimport';
export * as gfxVocab from '@/lib/ux-v0/graphics/vocabulary';
export * as gfxCaps from '@/lib/ux-v0/graphics/capabilities';
export * as gfxVocabEdit from '@/lib/ux-v0/graphics/vocabedit';
export * as gfxStyleSchema from '@/lib/ux-v0/graphics/styles/schema';
export * as gfxStyles from '@/lib/ux-v0/graphics/styles/registry';
export * as gfxStyleInterpret from '@/lib/ux-v0/graphics/styles/interpret';
export * as gfxStyleBlend from '@/lib/ux-v0/graphics/styles/blend';
export * as gfxStyleApply from '@/lib/ux-v0/graphics/styles/apply';
export * as gfxStyleEdit from '@/lib/ux-v0/graphics/styles/edit';
export * as gfxStyleReference from '@/lib/ux-v0/graphics/styles/reference';
export * as gfxStyleCustom from '@/lib/ux-v0/graphics/styles/custom';
export * as gfxStyleEvaluate from '@/lib/ux-v0/graphics/styles/evaluate';
export * as gfxStylePropose from '@/lib/ux-v0/graphics/styles/propose';
export * as gfxState from '@/lib/ux-v0/graphics/state';
export * as compSchema from '@/lib/ux-v0/graphics/composition/schema';
export * as compRender from '@/lib/ux-v0/graphics/composition/render';
export * as compKit from '@/lib/ux-v0/graphics/composition/kit';
// the generative engine: reading, principles, concepts, programs, construction, evaluation, the engine itself
export * as genReading from '@/lib/ux-v0/graphics/generative/reading';
export * as genPrinciples from '@/lib/ux-v0/graphics/generative/principles';
export * as genConcept from '@/lib/ux-v0/graphics/generative/concept';
export * as genProgram from '@/lib/ux-v0/graphics/generative/program';
export * as genEvaluate from '@/lib/ux-v0/graphics/generative/evaluate';
export * as genEngine from '@/lib/ux-v0/graphics/generative/engine';
export * as genRecord from '@/lib/ux-v0/graphics/generative/record';
export * as genLexicon from '@/lib/ux-v0/graphics/generative/lexicon';
export * as genValidate from '@/lib/ux-v0/graphics/generative/validate';
export * as genEdits from '@/lib/ux-v0/graphics/generative/edits';
export * as genMemory from '@/lib/ux-v0/graphics/generative/memory';
export * as logoBrief from '@/lib/ux-v0/graphics/logo/brief';
export * as logoGlyphs from '@/lib/ux-v0/graphics/logo/glyphs';
export * as logoGeom from '@/lib/ux-v0/graphics/logo/geom';
export * as logoRaster from '@/lib/ux-v0/graphics/logo/raster';
export * as logoSymbols from '@/lib/ux-v0/graphics/logo/symbols';
export * as logoConcepts from '@/lib/ux-v0/graphics/logo/concepts';
export * as logoBuild from '@/lib/ux-v0/graphics/logo/build';
export * as logoEvaluate from '@/lib/ux-v0/graphics/logo/evaluate';
export * as logoEdits from '@/lib/ux-v0/graphics/logo/edits';
export * as logoRecord from '@/lib/ux-v0/graphics/logo/record';
export * as logoRebuild from '@/lib/ux-v0/graphics/logo/rebuild';
export * as logoIdentity from '@/lib/ux-v0/graphics/logo/identity';
export * as logoCompose from '@/lib/ux-v0/graphics/logo/compose';
export * as logoSession from '@/lib/ux-v0/graphics/logo/session';
export * as logoContexts from '@/lib/ux-v0/graphics/logo/contexts';
export * as logoLink from '@/lib/ux-v0/graphics/logo/link';
export * as genLanguage from '@/lib/ux-v0/graphics/generative/language';
