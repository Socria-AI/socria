// Split View, redone: what it offers (lib/logos5/views.ts splitMenu), the
// shell that draws a view beside another (components/logos5/L5Views.tsx), a
// model's own tools inside its artifact (components/logos5/ModelTools.tsx), and
// CAD as something made (lib/logos5/make.ts) — one bundle, for
// test/split-view.test.mjs.
export { splitMenu, screenForRequest, choose, dock, fit, onMade, SPLIT_NAMES, OPENING } from '@/lib/logos5/views';
export { L5Layout, SplitView } from '@/components/logos5/L5Views';
export { ModelArtifact, MODEL_TOOLS } from '@/components/logos5/ModelTools';
export { MAKE_CHOICES, makeChoice, askFor } from '@/lib/logos5/make';
export { MakeGallery } from '@/components/logos5/MakeGallery';
