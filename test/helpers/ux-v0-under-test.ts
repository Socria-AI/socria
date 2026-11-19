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
export { providerOrder, searchImages, pingUse } from '@/lib/ux-v0/images-server';
export { costOf } from '@/lib/model-router';
export * from '@/lib/ux-v0/image-search';
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
export { askJson, readJson } from '@/lib/ux-v0/ask';
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
