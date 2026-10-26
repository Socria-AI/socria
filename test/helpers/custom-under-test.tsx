// Any artifact, from a few primitives: the custom kind (lib/objects/display-custom.ts),
// how it is asked for and drafted (lib/objects), the person's templates (lib/logos5/templates.ts),
// Make's "Your own" (lib/logos5/make.ts) and the figure that draws it — one bundle, for
// test/custom-artifacts.test.mjs.
export * from '@/lib/objects/display-custom';
export { readDisplayRequest, buildDisplayPrompt, readDisplayProposal, makeDisplay, create, apply, EMPTY_SPACE, kindOf, displayMeta, displayKinds, currentOf } from '@/lib/objects';
export { routeTurn } from '@/lib/runtime/orchestrate';
export { readTemplates, saveTemplate, removeTemplate, templateOf, templateChoice, templatePayload, onTemplates, MAX_TEMPLATES } from '@/lib/logos5/templates';
export { MAKE_CHOICES, makeChoice, askFor } from '@/lib/logos5/make';
export { ObjectFigure } from '@/components/objects/ObjectFigure';
export { MakeGallery } from '@/components/logos5/MakeGallery';
export { sampleObject } from '@/components/display/Gallery';
