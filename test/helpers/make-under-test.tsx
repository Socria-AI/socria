// What to make, seen before it is chosen: the gallery (components/logos5/
// MakeGallery.tsx), the choices and the templates they fill (lib/logos5/
// make.ts), the example each preview draws (components/display/Gallery.tsx),
// what the map draws itself as artifacts (lib/logos5/artifacts.ts), and the
// display catalogue every template must belong to — one bundle, for
// test/make-gallery.test.mjs. The Universal Map's list, for Shared with you.
export { MakeGallery } from '@/components/logos5/MakeGallery';
export { MakePicker } from '@/components/logos5/MakePicker';
export { sampleObject } from '@/components/display/Gallery';
export * from '@/lib/logos5/make';
export * from '@/lib/logos5/artifacts';
export { kindOf, isDisplayKind, displayMeta, readDisplayRequest } from '@/lib/objects';
export { UniverseView } from '@/components/logos5/Universe';
