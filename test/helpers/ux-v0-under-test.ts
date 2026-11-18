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
