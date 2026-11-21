// lib/ux-v0/graphics/logo/constants.ts — the logo engine's vocabularies, in one light module the document model can
// load without the engine itself: the construction methods, the categories, the lockups, the colour schemes and the
// lettering modifications.

export const METHOD_IDS = [
  'convergence',
  'interlock',
  'modular',
  'negative',
  'monogram',
  'radial',
  'fold',
  'strata',
  'orbit',
  'split',
  'grid',
  'wave',
  'organic',
  'spiral',
  'angle',
  'emblem',
  'mascot',
  'bridge',
  'trace',
  'steps',
  'aperture',
  'seed',
  'letter',
  'pixel',
  'frame',
] as const;
export type MethodId = (typeof METHOD_IDS)[number];

export const LOGO_CATEGORIES = ['wordmark', 'lettermark', 'monogram', 'abstract', 'geometric', 'organic', 'combination', 'emblem', 'mascot', 'typographic', 'negative', 'minimal', 'expressive', 'modular', 'responsive'] as const;
export type LogoCategory = (typeof LOGO_CATEGORIES)[number];

export const LOCKUPS = ['horizontal', 'stacked', 'symbol', 'wordmark', 'emblem'] as const;
export type LockupKind = (typeof LOCKUPS)[number];

export const COLOUR_SCHEMES = ['full', 'black', 'white', 'grayscale', 'single', 'reversed'] as const;
export type ColourScheme = (typeof COLOUR_SCHEMES)[number];

export const MODIFICATIONS = ['none', 'cut', 'ligature', 'swash', 'lift', 'accent', 'inline'] as const;
export type ModificationKind = (typeof MODIFICATIONS)[number];
