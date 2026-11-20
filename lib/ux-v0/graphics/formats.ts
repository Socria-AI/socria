// lib/ux-v0/graphics/formats.ts — the sizes a graphic is made at, digital and print.
//
// Screens are laid out in pixels and exported at that size (or twice it). Print is laid out in points (1/72 inch),
// so a page's size in a PDF is exact, and exported at its resolution (300 dpi by default) with its bleed. Each preset
// says its safe area: the margin words and logos keep out of (a platform's interface, a guillotine's wander).

import type { Unit } from './doc';

export interface Format {
  id: string;
  label: string;
  /** what it is usually for, in a few words */
  use: string;
  width: number;
  height: number;
  unit: Unit;
  dpi: number;
  /** print bleed, in the format's units */
  bleed: number;
  /** keep-out margin, in the format's units */
  safe: number;
  medium: 'screen' | 'print';
}

const MM = 72 / 25.4;
const IN = 72;
const pt = (mm: number) => Math.round(mm * MM * 10) / 10;

export const FORMATS: readonly Format[] = [
  { id: 'instagram-square', label: 'Instagram post (square)', use: 'a feed post, a carousel slide', width: 1080, height: 1080, unit: 'px', dpi: 72, bleed: 0, safe: 64, medium: 'screen' },
  { id: 'instagram-portrait', label: 'Instagram post (portrait)', use: 'a feed post that takes more of the screen', width: 1080, height: 1350, unit: 'px', dpi: 72, bleed: 0, safe: 64, medium: 'screen' },
  { id: 'story', label: 'Story (vertical)', use: 'Instagram, Facebook or TikTok stories', width: 1080, height: 1920, unit: 'px', dpi: 72, bleed: 0, safe: 120, medium: 'screen' },
  { id: 'linkedin', label: 'LinkedIn post', use: 'an announcement in the feed', width: 1200, height: 1200, unit: 'px', dpi: 72, bleed: 0, safe: 72, medium: 'screen' },
  { id: 'landscape', label: 'Landscape post (1.91:1)', use: 'a link preview, a LinkedIn or X image', width: 1200, height: 628, unit: 'px', dpi: 72, bleed: 0, safe: 48, medium: 'screen' },
  { id: 'banner-wide', label: 'Web banner (wide)', use: 'a site header or a display advertisement', width: 1920, height: 600, unit: 'px', dpi: 72, bleed: 0, safe: 60, medium: 'screen' },
  { id: 'leaderboard', label: 'Display ad (leaderboard)', use: 'a banner advertisement, 728 × 90', width: 728, height: 90, unit: 'px', dpi: 72, bleed: 0, safe: 8, medium: 'screen' },
  { id: 'rectangle-ad', label: 'Display ad (medium rectangle)', use: 'a 300 × 250 advertisement', width: 300, height: 250, unit: 'px', dpi: 72, bleed: 0, safe: 12, medium: 'screen' },
  { id: 'presentation', label: 'Presentation slide (16:9)', use: 'a slide, a screen', width: 1920, height: 1080, unit: 'px', dpi: 72, bleed: 0, safe: 80, medium: 'screen' },
  { id: 'album', label: 'Album cover', use: 'streaming services and sleeves, square', width: 3000, height: 3000, unit: 'px', dpi: 72, bleed: 0, safe: 150, medium: 'screen' },
  { id: 'a4', label: 'A4 poster or flyer', use: 'print, 210 × 297 mm', width: pt(210), height: pt(297), unit: 'pt', dpi: 300, bleed: pt(3), safe: pt(12), medium: 'print' },
  { id: 'a3', label: 'A3 poster', use: 'print, 297 × 420 mm', width: pt(297), height: pt(420), unit: 'pt', dpi: 300, bleed: pt(3), safe: pt(15), medium: 'print' },
  { id: 'letter', label: 'US Letter flyer', use: 'print, 8.5 × 11 in', width: 8.5 * IN, height: 11 * IN, unit: 'pt', dpi: 300, bleed: 0.125 * IN, safe: 0.5 * IN, medium: 'print' },
  { id: 'poster-18x24', label: 'Poster 18 × 24 in', use: 'print, a wall poster', width: 18 * IN, height: 24 * IN, unit: 'pt', dpi: 150, bleed: 0.125 * IN, safe: 0.75 * IN, medium: 'print' },
  { id: 'magazine', label: 'Magazine cover', use: 'print, 8.375 × 10.875 in', width: 8.375 * IN, height: 10.875 * IN, unit: 'pt', dpi: 300, bleed: 0.125 * IN, safe: 0.375 * IN, medium: 'print' },
  { id: 'book', label: 'Book cover (6 × 9 in)', use: 'print, a trade paperback front', width: 6 * IN, height: 9 * IN, unit: 'pt', dpi: 300, bleed: 0.125 * IN, safe: 0.375 * IN, medium: 'print' },
  { id: 'business-card', label: 'Business card', use: 'print, 85 × 55 mm', width: pt(85), height: pt(55), unit: 'pt', dpi: 300, bleed: pt(3), safe: pt(4), medium: 'print' },
  { id: 'label', label: 'Product label', use: 'print, 100 × 150 mm', width: pt(100), height: pt(150), unit: 'pt', dpi: 300, bleed: pt(2), safe: pt(6), medium: 'print' },
  { id: 'brochure-page', label: 'Brochure page (A5)', use: 'print, one page of a booklet', width: pt(148), height: pt(210), unit: 'pt', dpi: 300, bleed: pt(3), safe: pt(10), medium: 'print' },
];

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));
export function formatOf(id: string | undefined | null): Format | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** Words for each format, as a designer says them. */
const FORMAT_WORDS: readonly [RegExp, string][] = [
  [/\b(instagram|ig)\s+stor(y|ies)\b|\bstor(y|ies)\b|\btiktok\b|\breels?\b|\bvertical (video )?(post|graphic)\b/, 'story'],
  [/\bcarousel\b/, 'instagram-square'],
  [/\binstagram\b.*\bportrait\b|\b4:5\b|\bportrait (post|feed)\b/, 'instagram-portrait'],
  [/\binstagram\b|\bsquare post\b|\bsocial (media )?(post|graphic)\b/, 'instagram-square'],
  [/\blinkedin\b/, 'linkedin'],
  [/\b(link preview|open graph|twitter|x post|facebook post|landscape post)\b/, 'landscape'],
  [/\bleaderboard\b|\b728\s*[x×]\s*90\b/, 'leaderboard'],
  [/\b300\s*[x×]\s*250\b|\bmedium rectangle\b/, 'rectangle-ad'],
  [/\b(web )?banner\b|\bhero banner\b|\bdisplay ad\b|\bheader image\b/, 'banner-wide'],
  [/\b(slide|presentation|keynote|deck)\b/, 'presentation'],
  [/\balbum\b|\bep cover\b|\bsingle cover\b|\bcover art\b|\bvinyl\b/, 'album'],
  [/\bmagazine\b/, 'magazine'],
  [/\bbook cover\b|\bnovel\b|\bpaperback\b/, 'book'],
  [/\bbusiness cards?\b/, 'business-card'],
  [/\b(product |packaging )?label\b|\bpackaging\b|\bjar\b|\bbottle\b/, 'label'],
  [/\bbrochure\b|\bbooklet\b|\bzine\b/, 'brochure-page'],
  [/\ba3\b/, 'a3'],
  [/\b(us )?letter\b/, 'letter'],
  [/\b18\s*[x×]\s*24\b|\bwall poster\b/, 'poster-18x24'],
  [/\ba4\b|\bflyer\b|\bposter\b|\bleaflet\b/, 'a4'],
];

/** The format the words ask for, or null. */
export function formatFromWords(words: string): Format | null {
  const n = words.toLowerCase();
  for (const [re, id] of FORMAT_WORDS) if (re.test(n)) return formatOf(id);
  return null;
}

/** A size in the format's own terms: "1080 × 1350 px", "210 × 297 mm". */
export function sizeLabel(f: Pick<Format, 'width' | 'height' | 'unit'>): string {
  if (f.unit === 'px') return `${Math.round(f.width)} × ${Math.round(f.height)} px`;
  const mm = (v: number) => Math.round(v / MM);
  return `${mm(f.width)} × ${mm(f.height)} mm`;
}

/** The pixel size an artboard exports at (print at its resolution). */
export function exportPixels(b: { width: number; height: number; unit: Unit; dpi: number }, scale = 1): { w: number; h: number; scale: number } {
  const k = (b.unit === 'pt' ? b.dpi / 72 : 1) * scale;
  return { w: Math.max(1, Math.round(b.width * k)), h: Math.max(1, Math.round(b.height * k)), scale: k };
}

/** The page size in PDF points: print is already in points; screens at 96 pixels to the inch. */
export function pdfPoints(b: { width: number; height: number; unit: Unit }): { w: number; h: number } {
  return b.unit === 'pt' ? { w: b.width, h: b.height } : { w: b.width * 0.75, h: b.height * 0.75 };
}
