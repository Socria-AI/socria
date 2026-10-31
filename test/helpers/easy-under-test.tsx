// An easy view: the kind (lib/objects/display-easy.ts), what the photo is read
// for (lib/easy-view.ts), the figure that draws it, the sheet the photo is
// taken in (components/logos5/EasyCapture.tsx) and Make's "Easy view" — one
// bundle, for test/easy-view.test.mjs.
export * from '@/lib/objects/display-easy';
export * from '@/lib/easy-view';
export { makeDisplay, create, apply, EMPTY_SPACE, kindOf, displayMeta, readDisplayRequest, readDisplayProposal } from '@/lib/objects';
export { offeredKinds } from '@/lib/objects/display-base';
export { ObjectFigure } from '@/components/objects/ObjectFigure';
export { EASY_SIZES } from '@/components/display/EasyFigure';
export { EasyCapture } from '@/components/logos5/EasyCapture';
export { MAKE_CHOICES, makeChoice, askFor } from '@/lib/logos5/make';
export { MakeGallery } from '@/components/logos5/MakeGallery';
export { READ_MAX_EDGE, EASY_READ_EDGE } from '@/lib/logos-upload';
