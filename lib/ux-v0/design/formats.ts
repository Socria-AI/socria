// lib/ux-v0/design/formats.ts — the sizes a design can be made at.
//
// An artboard is an HTML document at a fixed size in CSS pixels. Screen formats are their pixels. Print formats are
// measured in points (1/72 in) and drawn at 96 CSS pixels to the inch, so a model writes "font-size: 64px" on an A3
// poster and it means what it means in a browser; export renders at the print resolution and the PDF page is the
// exact trim size. A web page is 1440 wide and as tall as it is set.

export type Medium = 'screen' | 'print' | 'web';

export interface Format {
  id: string;
  label: string;
  /** what it is usually for, in a few words */
  use: string;
  /** CSS pixels */
  width: number;
  height: number;
  medium: Medium;
  /** print: points per CSS pixel is 0.75; the resolution export renders at */
  dpi: number;
  /** print bleed and the keep-out margin for words, in CSS pixels */
  bleed: number;
  safe: number;
  /**
   * where a platform's own interface covers the picture (the top and bottom of a story, the corner of a video
   * thumbnail), in CSS pixels from each edge: words and logos stay out of these
   */
  cover?: { top?: number; bottom?: number; left?: number; right?: number; why: string };
  /** what the platform does to it that the design must survive ("shown cropped to 4:5 in the grid") */
  note?: string;
}

const MM = 96 / 25.4;
const IN = 96;
const r = (v: number) => Math.round(v);

export const FORMATS: readonly Format[] = [
  { id: 'instagram-square', label: 'Instagram post (square)', use: 'a feed post, a carousel slide', width: 1080, height: 1080, medium: 'screen', dpi: 72, bleed: 0, safe: 64 },
  { id: 'instagram-portrait', label: 'Instagram post (portrait)', use: 'a feed post that takes more of the screen', width: 1080, height: 1350, medium: 'screen', dpi: 72, bleed: 0, safe: 64 },
  { id: 'story', label: 'Story or reel (vertical)', use: 'Instagram, Facebook or TikTok stories, reels and shorts', width: 1080, height: 1920, medium: 'screen', dpi: 72, bleed: 0, safe: 64, cover: { top: 250, bottom: 340, why: 'the platform draws the account, the caption and its buttons over the top 250 px and the bottom 340 px' } },
  { id: 'linkedin', label: 'LinkedIn post', use: 'an announcement in the feed', width: 1200, height: 1200, medium: 'screen', dpi: 72, bleed: 0, safe: 72 },
  { id: 'landscape', label: 'Landscape post (1.91:1)', use: 'a link preview, a LinkedIn or X image', width: 1200, height: 628, medium: 'screen', dpi: 72, bleed: 0, safe: 48 },
  { id: 'x-post', label: 'X post (16:9)', use: 'a single image in the X timeline', width: 1600, height: 900, medium: 'screen', dpi: 72, bleed: 0, safe: 64 },
  { id: 'open-graph', label: 'Link preview (Open Graph)', use: 'the card a link shows when shared', width: 1200, height: 630, medium: 'screen', dpi: 72, bleed: 0, safe: 60, note: 'some places crop it to a square around its centre: keep what matters in the middle 630 px' },
  { id: 'youtube-thumbnail', label: 'Video thumbnail (16:9)', use: 'a YouTube thumbnail', width: 1280, height: 720, medium: 'screen', dpi: 72, bleed: 0, safe: 48, cover: { bottom: 110, right: 190, why: 'the duration is drawn over the bottom-right corner' } },
  { id: 'linkedin-banner', label: 'LinkedIn company banner', use: 'the banner across a company page', width: 1128, height: 191, medium: 'screen', dpi: 72, bleed: 0, safe: 16, cover: { left: 240, why: 'the company logo sits over the bottom-left' } },
  { id: 'banner-wide', label: 'Web banner (wide)', use: 'a site header or a display advertisement', width: 1920, height: 600, medium: 'screen', dpi: 72, bleed: 0, safe: 60 },
  { id: 'leaderboard', label: 'Display ad (leaderboard)', use: 'a banner advertisement, 728 × 90', width: 728, height: 90, medium: 'screen', dpi: 72, bleed: 0, safe: 8 },
  { id: 'rectangle-ad', label: 'Display ad (medium rectangle)', use: 'a 300 × 250 advertisement', width: 300, height: 250, medium: 'screen', dpi: 72, bleed: 0, safe: 12 },
  { id: 'presentation', label: 'Presentation slide (16:9)', use: 'a slide, a screen', width: 1920, height: 1080, medium: 'screen', dpi: 72, bleed: 0, safe: 80 },
  { id: 'album', label: 'Album cover', use: 'streaming services and sleeves, square', width: 1500, height: 1500, medium: 'screen', dpi: 144, bleed: 0, safe: 75 },
  { id: 'a4', label: 'A4 poster or flyer', use: 'print, 210 × 297 mm', width: r(210 * MM), height: r(297 * MM), medium: 'print', dpi: 300, bleed: r(3 * MM), safe: r(12 * MM) },
  { id: 'a3', label: 'A3 poster', use: 'print, 297 × 420 mm', width: r(297 * MM), height: r(420 * MM), medium: 'print', dpi: 300, bleed: r(3 * MM), safe: r(15 * MM) },
  { id: 'letter', label: 'US Letter flyer', use: 'print, 8.5 × 11 in', width: r(8.5 * IN), height: r(11 * IN), medium: 'print', dpi: 300, bleed: r(0.125 * IN), safe: r(0.5 * IN) },
  { id: 'poster-18x24', label: 'Poster 18 × 24 in', use: 'print, a wall poster', width: r(18 * IN), height: r(24 * IN), medium: 'print', dpi: 150, bleed: r(0.125 * IN), safe: r(0.75 * IN) },
  { id: 'magazine', label: 'Magazine cover', use: 'print, 8.375 × 10.875 in', width: r(8.375 * IN), height: r(10.875 * IN), medium: 'print', dpi: 300, bleed: r(0.125 * IN), safe: r(0.375 * IN) },
  { id: 'book', label: 'Book cover (6 × 9 in)', use: 'print, a trade paperback front', width: r(6 * IN), height: r(9 * IN), medium: 'print', dpi: 300, bleed: r(0.125 * IN), safe: r(0.375 * IN) },
  { id: 'business-card', label: 'Business card', use: 'print, 85 × 55 mm', width: r(85 * MM), height: r(55 * MM), medium: 'print', dpi: 300, bleed: r(3 * MM), safe: r(4 * MM) },
  { id: 'label', label: 'Product label', use: 'print, 100 × 150 mm', width: r(100 * MM), height: r(150 * MM), medium: 'print', dpi: 300, bleed: r(2 * MM), safe: r(6 * MM) },
  { id: 'brochure-page', label: 'Brochure page (A5)', use: 'print, one page of a booklet', width: r(148 * MM), height: r(210 * MM), medium: 'print', dpi: 300, bleed: r(3 * MM), safe: r(10 * MM) },
  { id: 'logo-sheet', label: 'Logo sheet', use: 'a logo presented on its ground, with its variants', width: 1600, height: 1000, medium: 'screen', dpi: 72, bleed: 0, safe: 80 },
  { id: 'logo-square', label: 'Logo (square)', use: 'a symbol, an avatar, an app icon', width: 1024, height: 1024, medium: 'screen', dpi: 72, bleed: 0, safe: 64 },
  { id: 'web-page', label: 'Web page (desktop)', use: 'a landing page or a home page, 1440 wide', width: 1440, height: 3200, medium: 'web', dpi: 72, bleed: 0, safe: 48 },
  { id: 'mobile-screen', label: 'App screen (mobile)', use: 'a phone screen, 390 × 844', width: 390, height: 844, medium: 'web', dpi: 144, bleed: 0, safe: 16 },
  { id: 'tablet-screen', label: 'App screen (tablet)', use: 'a tablet screen, 834 × 1194', width: 834, height: 1194, medium: 'web', dpi: 144, bleed: 0, safe: 24 },
  { id: 'desktop-screen', label: 'App screen (desktop)', use: 'a product screen in a desktop window, 1440 × 900', width: 1440, height: 900, medium: 'web', dpi: 72, bleed: 0, safe: 24 },
];

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));

export const formatOf = (id: string | null | undefined): Format | null => (id ? BY_ID.get(id) ?? null : null);
export const DEFAULT_FORMAT = 'instagram-portrait';

/** A format named in words ("an A3 poster", "for instagram stories"), or null. */
export function formatFromWords(words: string): Format | null {
  const w = words.toLowerCase();
  const pairs: [RegExp, string][] = [
    [/\bstor(y|ies)\b|\breel\b|\btiktok\b/, 'story'],
    [/\binstagram\b.*\bsquare\b|\bsquare\b.*\bpost\b/, 'instagram-square'],
    [/\binstagram\b|\bfeed post\b|\bcarousel\b/, 'instagram-portrait'],
    [/\blinkedin\b.*\bbanner\b|\bbanner\b.*\blinkedin\b/, 'linkedin-banner'],
    [/\blinkedin\b/, 'linkedin'],
    [/\b(youtube|video)\s+thumbnail\b/, 'youtube-thumbnail'],
    [/\bopen ?graph\b|\bog image\b|\blink preview\b|\bshare card\b/, 'open-graph'],
    [/\b(x|twitter)\s+post\b|\btweet\b/, 'x-post'],
    [/\b(dashboard|desktop app|web app|product screen|desktop screen)\b/, 'desktop-screen'],
    [/\btablet\b|\bipad\b/, 'tablet-screen'],
    [/\ba3\b/, 'a3'],
    [/\ba4\b|\bflyer\b/, 'a4'],
    [/\ba5\b|\bbrochure\b/, 'brochure-page'],
    [/\bletter\b/, 'letter'],
    [/\bposter\b/, 'a3'],
    [/\bbusiness card\b/, 'business-card'],
    [/\bmagazine\b/, 'magazine'],
    [/\bbook cover\b/, 'book'],
    [/\balbum\b|\bcover art\b/, 'album'],
    [/\blogo\b|\bwordmark\b|\bmonogram\b/, 'logo-sheet'],
    [/\bapp\b|\bmobile screen\b/, 'mobile-screen'],
    [/\bwebsite\b|\blanding page\b|\bweb page\b|\bhome ?page\b/, 'web-page'],
    [/\bslide\b|\bpresentation\b|\bdeck\b/, 'presentation'],
    [/\bbanner\b|\bheader\b/, 'banner-wide'],
    [/\bleaderboard\b/, 'leaderboard'],
    [/\blabel\b|\bpackag/, 'label'],
  ];
  for (const [re, id] of pairs) if (re.test(w)) return formatOf(id);
  return null;
}

/** The size in words: "1080 × 1350 px" or "297 × 420 mm". */
export function sizeLabel(f: Pick<Format, 'width' | 'height' | 'medium'>): string {
  if (f.medium !== 'print') return `${f.width} × ${f.height} px`;
  const mm = (v: number) => Math.round(v / MM);
  return `${mm(f.width)} × ${mm(f.height)} mm`;
}

/** Pixels an artboard is exported at: screen at its size (times `scale`), print at its resolution. */
export function exportPixels(f: Pick<Format, 'width' | 'height' | 'medium' | 'dpi'>, scale = 1): { w: number; h: number; k: number } {
  const k = (f.medium === 'print' ? f.dpi / 96 : 1) * scale;
  return { w: Math.round(f.width * k), h: Math.round(f.height * k), k };
}

/**
 * A print format's bleed as the printer means it, in millimetres: formats hold it in whole CSS pixels (11 px for
 * 3 mm), which is a twelfth of a millimetre short — a print file is made at the true measure.
 */
export function bleedMm(f: Pick<Format, 'bleed' | 'medium'>): number {
  if (f.medium !== 'print' || !f.bleed) return 0;
  const known = [2, 3, 3.175, 5].find((mm) => Math.round(mm * MM) === f.bleed);
  return known ?? Math.round((f.bleed / MM) * 100) / 100;
}

/** A PDF page's size in points for CSS pixels. */
export const pointsOf = (cssPx: number) => Math.round(cssPx * 0.75 * 100) / 100;
