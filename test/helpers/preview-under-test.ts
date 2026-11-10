// Native file preview: the original file drawn as itself — the workbook's grid and number formats,
// the deck's slides, delimited text as a sheet (lib/preview/*). The reading Socria reasons with is elsewhere.
export * from '@/lib/preview/numfmt';
export * from '@/lib/preview/sheet';
export * from '@/lib/preview/slides';
export { openPackage, resolveTarget, relsPathOf, hexColor, lum, tint } from '@/lib/preview/ooxml';
