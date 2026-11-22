// lib/ux-v0/studio/catalog.ts — the vocabulary the conversation offers: words a person can pick instead of having to
// already know them. Each list is a starting vocabulary, never a set of templates: every choice reaches an engine as
// a word or a parameter it already reads, and every question also takes the person's own words.

import type { GraphicKind } from '../graphics/compose';
import type { Org } from '../graphics/generative/principles';
import type { DnaKey } from '../dna';

export interface CatalogItem {
  id: string;
  label: string;
  hint?: string;
}

// ── graphics ──

/** What can be made as one graphic: the kind and the format it starts in. */
export const GRAPHIC_FORMS: readonly (CatalogItem & { kind: GraphicKind; format: string })[] = [
  { id: 'poster', label: 'Poster', hint: 'One strong page, printed or shared', kind: 'poster', format: 'a4' },
  { id: 'social', label: 'Social post', hint: 'A square for the feed', kind: 'social', format: 'instagram-square' },
  { id: 'story', label: 'Story', hint: 'Tall, full-screen, brief', kind: 'social', format: 'story' },
  { id: 'carousel', label: 'Carousel', hint: 'A cover, a slide per point, an end', kind: 'carousel', format: 'instagram-square' },
  { id: 'banner', label: 'Banner', hint: 'Wide, for a site or a header', kind: 'banner', format: 'banner-wide' },
  { id: 'album', label: 'Album cover', hint: 'Square, seen small and large', kind: 'album', format: 'album' },
  { id: 'book', label: 'Book cover', hint: 'A spine’s worth of attention', kind: 'book', format: 'book' },
  { id: 'card', label: 'Business card', hint: 'Small, exact, kept', kind: 'card', format: 'business-card' },
  { id: 'label', label: 'Label or packaging', hint: 'On the product itself', kind: 'label', format: 'label' },
  { id: 'infographic', label: 'Infographic', hint: 'Your numbers, charted', kind: 'infographic', format: 'instagram-portrait' },
];

/** Temperament words: the first vocabulary of how a work should feel. */
export const PERSONALITY: readonly CatalogItem[] = [
  { id: 'warm', label: 'Warm' },
  { id: 'calm', label: 'Calm' },
  { id: 'bold', label: 'Bold' },
  { id: 'playful', label: 'Playful' },
  { id: 'refined', label: 'Refined' },
  { id: 'raw', label: 'Raw' },
  { id: 'precise', label: 'Precise' },
  { id: 'joyful', label: 'Joyful' },
  { id: 'serious', label: 'Serious' },
  { id: 'quiet', label: 'Quiet' },
  { id: 'loud', label: 'Loud' },
  { id: 'crafted', label: 'Crafted' },
  { id: 'modern', label: 'Modern' },
  { id: 'classic', label: 'Classic' },
  { id: 'experimental', label: 'Experimental' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'luxurious', label: 'Luxurious' },
  { id: 'honest', label: 'Honest' },
  { id: 'rebellious', label: 'Rebellious' },
  { id: 'natural', label: 'Natural' },
  { id: 'technical', label: 'Technical' },
  { id: 'poetic', label: 'Poetic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'retro', label: 'Retro' },
  { id: 'futuristic', label: 'Futuristic' },
  { id: 'elegant', label: 'Elegant' },
  { id: 'energetic', label: 'Energetic' },
];

/** The words each subject usually suggests first (a starting order, never a rule). */
export const DOMAIN_TEMPERAMENT: Readonly<Record<string, readonly string[]>> = {
  food: ['warm', 'crafted', 'friendly', 'natural'],
  music: ['bold', 'loud', 'experimental', 'energetic'],
  art: ['experimental', 'poetic', 'refined', 'editorial'],
  craft: ['crafted', 'honest', 'warm', 'natural'],
  architecture: ['precise', 'refined', 'minimal', 'serious'],
  nature: ['natural', 'calm', 'quiet', 'honest'],
  technology: ['precise', 'modern', 'technical', 'futuristic'],
  science: ['precise', 'technical', 'serious', 'modern'],
  fashion: ['refined', 'bold', 'elegant', 'editorial'],
  wellbeing: ['calm', 'warm', 'natural', 'quiet'],
  finance: ['serious', 'precise', 'calm', 'modern'],
  learning: ['friendly', 'honest', 'calm', 'playful'],
  children: ['playful', 'joyful', 'friendly', 'warm'],
  celebration: ['joyful', 'energetic', 'playful', 'bold'],
  performance: ['bold', 'loud', 'energetic', 'experimental'],
  sport: ['energetic', 'bold', 'loud', 'modern'],
  heritage: ['classic', 'refined', 'crafted', 'serious'],
  beauty: ['refined', 'elegant', 'luxurious', 'calm'],
  travel: ['warm', 'joyful', 'natural', 'friendly'],
  activism: ['bold', 'rebellious', 'honest', 'loud'],
};

/** The spatial principles the generative engine can be asked for (ConceptConstraints.org), said plainly. */
export const COMPOSITIONS: readonly (CatalogItem & { org: Org })[] = [
  { id: 'centre', label: 'Centred and still', hint: 'One focus, held in the middle', org: 'centre' },
  { id: 'grid', label: 'On a grid', hint: 'Modular, ordered, calm', org: 'grid' },
  { id: 'edge', label: 'Pushed to the edge', hint: 'Tension against the frame', org: 'edge' },
  { id: 'layers', label: 'Layered', hint: 'Planes over planes, depth', org: 'layers' },
  { id: 'orbit', label: 'In orbit', hint: 'Circular, gathering', org: 'orbit' },
  { id: 'flow', label: 'Flowing', hint: 'Movement across the page', org: 'flow' },
  { id: 'axis', label: 'On an axis', hint: 'One strong line to hang on', org: 'axis' },
  { id: 'partition', label: 'Split in two', hint: 'Two fields in contrast', org: 'partition' },
];

/** How the person's own pictures are treated: each one a stack of the graphics engine's own effects (effects.ts). */
export const IMAGE_TREATMENTS: readonly CatalogItem[] = [
  { id: 'as-is', label: 'As they are', hint: 'Your pictures, untouched' },
  { id: 'mono', label: 'Black and white', hint: 'One colour, all tone' },
  { id: 'duotone', label: 'Two colours', hint: 'Shadows and lights in your palette' },
  { id: 'halftone', label: 'Newsprint', hint: 'Printed as dots' },
  { id: 'riso', label: 'Risograph', hint: 'Two inks, slightly off register, with grain' },
  { id: 'posterize', label: 'Flat colour', hint: 'A few flat tones, like a screen print' },
  { id: 'grain', label: 'Film grain', hint: 'A fine analogue texture' },
];

/** The Creative DNA dimensions offered as sliders, per kind of work (labels come from lib/ux-v0/dna.ts). */
export const FEEL: Readonly<Record<'graphic' | 'website' | 'board' | 'logo', readonly DnaKey[]>> = {
  graphic: ['restraint', 'density', 'colour', 'composition'],
  website: ['restraint', 'density', 'motion', 'typography'],
  board: ['restraint', 'colour', 'composition'],
  logo: ['restraint', 'colour'],
};

export const AVOID_GRAPHIC: readonly CatalogItem[] = [
  { id: 'gradients', label: 'Gradients' },
  { id: 'cliches', label: 'Visual clichés' },
  { id: 'busy', label: 'Busy backgrounds' },
  { id: 'stock', label: 'A stock-photo look' },
  { id: 'neon', label: 'Neon colours' },
  { id: 'script', label: 'Script lettering' },
  { id: 'shadows', label: 'Drop shadows' },
  { id: 'corporate', label: 'A corporate look' },
  { id: 'clipart', label: 'Clip art' },
  { id: 'wordy', label: 'Too many words' },
];

// ── logos ──

/** Forms a logo can take: categories the logo engine explores (LogoCategory). */
export const LOGO_FORMS: readonly (CatalogItem & { category: string; words: string })[] = [
  { id: 'wordmark', label: 'Typographic', hint: 'The name itself, drawn', category: 'wordmark', words: 'a wordmark' },
  { id: 'monogram', label: 'Monogram', hint: 'Initials, built into one mark', category: 'monogram', words: 'a monogram' },
  { id: 'combination', label: 'Symbol and name', hint: 'A mark that works with the name, or alone', category: 'combination', words: 'a combination mark, a symbol with the name' },
  { id: 'abstract', label: 'Abstract mark', hint: 'A shape that carries the idea', category: 'abstract', words: 'an abstract mark' },
  { id: 'emblem', label: 'Emblem', hint: 'Name and mark held in one form', category: 'emblem', words: 'an emblem' },
];

/** Lettering for a name, said as a person would; each maps to temperament words the logo engine reads. */
export const LETTERING: readonly (CatalogItem & { face: string; words: string })[] = [
  { id: 'serif', label: 'Refined serif', hint: 'Classic, considered', face: 'Fraunces', words: 'refined classic serif lettering' },
  { id: 'sans', label: 'Clean sans', hint: 'Plain, modern, sure', face: 'Inter', words: 'clean modern sans lettering' },
  { id: 'geometric', label: 'Geometric', hint: 'Built from circles and lines', face: 'Space Grotesk', words: 'geometric constructed lettering' },
  { id: 'heavy', label: 'Heavy and bold', hint: 'Loud at any size', face: 'Archivo Black', words: 'bold heavy lettering' },
  { id: 'expressive', label: 'Expressive', hint: 'Lettering with a gesture', face: 'Syne', words: 'expressive playful lettering' },
];

export const LOGO_USES: readonly CatalogItem[] = [
  { id: 'app-icon', label: 'App icon' },
  { id: 'website', label: 'Website header' },
  { id: 'signage', label: 'Signage' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'social', label: 'Social avatar' },
  { id: 'print', label: 'Print' },
  { id: 'embroidery', label: 'Embroidery' },
  { id: 'favicon', label: 'Favicon' },
];

// ── websites ──

export const SITE_PURPOSES: readonly (CatalogItem & { sections: readonly string[] })[] = [
  { id: 'business', label: 'A studio or business', hint: 'What you do, and how to reach you', sections: ['hero', 'features', 'text', 'form'] },
  { id: 'portfolio', label: 'A portfolio', hint: 'The work first', sections: ['hero', 'gallery', 'text', 'form'] },
  { id: 'shop', label: 'A shop', hint: 'Products, and a way to buy', sections: ['hero', 'list', 'text', 'form'] },
  { id: 'bookings', label: 'Bookings', hint: 'Appointments, classes, tables', sections: ['hero', 'booking', 'list', 'form'] },
  { id: 'event', label: 'An event', hint: 'When, where, and how to come', sections: ['hero', 'list', 'form', 'text'] },
  { id: 'launch', label: 'A launch page', hint: 'One promise and a waiting list', sections: ['hero', 'features', 'form'] },
  { id: 'restaurant', label: 'A restaurant or café', hint: 'The menu, the hours, a table', sections: ['hero', 'list', 'booking', 'text'] },
  { id: 'organisation', label: 'A club or community', hint: 'Who you are and how to join', sections: ['hero', 'text', 'list', 'form'] },
  { id: 'editorial', label: 'A publication', hint: 'Writing, read well', sections: ['hero', 'feed', 'text', 'form'] },
];

/** What a site can do, by purpose: each becomes a working section in the website engine. */
export const SITE_FUNCTIONS: readonly (CatalogItem & { section: 'booking' | 'form' | 'gallery' | 'list' | 'text' | 'features' | 'feed' | 'quote'; for: readonly string[] })[] = [
  { id: 'booking', label: 'Booking calendar', hint: 'Days, times, one confirmation', section: 'booking', for: ['bookings', 'restaurant', 'business', 'event'] },
  { id: 'contact', label: 'Contact form', hint: 'Name, email, message', section: 'form', for: ['business', 'portfolio', 'shop', 'bookings', 'restaurant', 'organisation', 'event'] },
  { id: 'newsletter', label: 'Newsletter sign-up', hint: 'One field, one button', section: 'form', for: ['shop', 'launch', 'editorial', 'organisation', 'event'] },
  { id: 'waitlist', label: 'Waiting list', hint: 'Join before it opens', section: 'form', for: ['launch'] },
  { id: 'rsvp', label: 'RSVP', hint: 'Who is coming', section: 'form', for: ['event'] },
  { id: 'join', label: 'Join form', hint: 'Become a member', section: 'form', for: ['organisation'] },
  { id: 'gallery', label: 'Gallery', hint: 'Pictures, opened large', section: 'gallery', for: ['portfolio', 'restaurant', 'event', 'business', 'shop'] },
  { id: 'services', label: 'Services', hint: 'What you offer', section: 'features', for: ['business', 'bookings'] },
  { id: 'menu', label: 'Menu', hint: 'What is served', section: 'list', for: ['restaurant'] },
  { id: 'products', label: 'Products', hint: 'What you sell', section: 'list', for: ['shop'] },
  { id: 'schedule', label: 'Schedule', hint: 'What happens when', section: 'list', for: ['event'] },
  { id: 'story', label: 'The story', hint: 'Who you are, in your words', section: 'text', for: ['business', 'shop', 'restaurant', 'organisation', 'portfolio', 'launch'] },
  { id: 'articles', label: 'Articles', hint: 'The latest writing', section: 'feed', for: ['editorial'] },
];

export const AUDIENCES: Readonly<Record<string, readonly string[]>> = {
  business: ['Local customers', 'Companies', 'Professionals', 'Families', 'Visitors'],
  portfolio: ['Art directors', 'Clients', 'Studios hiring', 'Collectors', 'Editors'],
  shop: ['Regular customers', 'Gift buyers', 'Collectors', 'Locals', 'Online shoppers'],
  bookings: ['Regulars', 'Newcomers', 'Locals', 'Busy professionals', 'Families'],
  event: ['Attendees', 'Speakers', 'Press', 'Sponsors', 'Locals'],
  launch: ['Early adopters', 'Press', 'Investors', 'Partners', 'Developers'],
  restaurant: ['Locals', 'Visitors', 'Families', 'Groups', 'Regulars'],
  organisation: ['Members', 'Volunteers', 'Donors', 'Newcomers', 'Partners'],
  editorial: ['Readers', 'Subscribers', 'Students', 'Specialists', 'Curious newcomers'],
};

export const SITE_PRIORITIES: readonly CatalogItem[] = [
  { id: 'contact', label: 'Getting in touch' },
  { id: 'work', label: 'Showing the work' },
  { id: 'book', label: 'Booking' },
  { id: 'offer', label: 'Explaining the offer' },
  { id: 'trust', label: 'Building trust' },
  { id: 'sell', label: 'Selling' },
];

// ── boards ──

export const OBJECTIVES: readonly CatalogItem[] = [
  { id: 'launch', label: 'A launch', hint: 'Something new, said loudly once' },
  { id: 'event', label: 'An event', hint: 'A date to get people to' },
  { id: 'awareness', label: 'Awareness', hint: 'Be known, be remembered' },
  { id: 'offer', label: 'A sale or offer', hint: 'Acted on, soon' },
  { id: 'identity', label: 'An identity rollout', hint: 'A new face, everywhere at once' },
  { id: 'season', label: 'A season', hint: 'A run of weeks, one voice' },
];

/** Materials a board can hold (MaterialSpec kinds and formats). */
export const BOARD_MATERIALS: readonly (CatalogItem & { kind: string; format?: string; template?: string })[] = [
  { id: 'poster', label: 'Posters', kind: 'poster' },
  { id: 'social', label: 'Social posts', kind: 'social' },
  { id: 'story', label: 'Stories', kind: 'social', format: 'story' },
  { id: 'banner', label: 'Banners', kind: 'banner' },
  { id: 'website', label: 'A website', kind: 'website' },
  { id: 'mockup', label: 'Product mockups', kind: 'mockup', template: 'box' },
  { id: 'card', label: 'Business cards', kind: 'card' },
  { id: 'presentation', label: 'Slides', kind: 'presentation' },
  { id: 'label', label: 'Labels', kind: 'label' },
  { id: 'ad', label: 'Advertisements', kind: 'ad' },
];

// ── design systems ──

export const SYSTEM_SOURCES: readonly CatalogItem[] = [
  { id: 'json', label: 'Design tokens', hint: 'A JSON file: DTCG, Tokens Studio, Style Dictionary' },
  { id: 'css', label: 'CSS variables', hint: 'A stylesheet with custom properties' },
  { id: 'pdf', label: 'Brand guidelines', hint: 'A PDF, read with its pages' },
  { id: 'website', label: 'A website', hint: 'Its colours, type and spacing' },
  { id: 'figma', label: 'Figma', hint: 'Variables, styles and components' },
  { id: 'assets', label: 'Logos and fonts', hint: 'Files to approve and protect' },
  { id: 'project', label: 'One of your projects', hint: 'A website, graphic or board made here' },
];

export const SYSTEM_PARTS: readonly CatalogItem[] = [
  { id: 'colour', label: 'Colours' },
  { id: 'typography', label: 'Typography' },
  { id: 'layout', label: 'Layout' },
  { id: 'effects', label: 'Effects' },
  { id: 'components', label: 'Components' },
  { id: 'assets', label: 'Assets' },
  { id: 'rules', label: 'Rules' },
];

// ── critique ──

export const CRITIQUE_FOCUS: readonly CatalogItem[] = [
  { id: 'hierarchy', label: 'Hierarchy', hint: 'What is seen first, second, third' },
  { id: 'readability', label: 'Readability' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'layout', label: 'Layout and spacing' },
  { id: 'typography', label: 'Typography' },
  { id: 'colour', label: 'Colour' },
  { id: 'conversion', label: 'Getting people to act' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'mobile', label: 'On a phone' },
];
