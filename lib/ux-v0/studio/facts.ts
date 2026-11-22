// lib/ux-v0/studio/facts.ts — what an opening sentence already says, read by the engines' own readers.
//
// Nothing here has a word list of its own where an engine already has one: the graphic kind and the quoted words come
// from the graphics brief reader, the materials from the board reader, the name, category and avoid list from the logo
// brief reader, a named style from the style interpreter, the website's experience from the website intent reader.
// What a sentence says is never asked again; what it does not say is never guessed.

import { readGraphicBrief, graphicKindNamed, COLOUR_WORDS, type GraphicKind } from '../graphics/compose';
import { readBoardRequest } from '../boards/plan';
import type { MaterialSpec } from '../boards/model';
import { nameOf, readLogoBrief, type LogoCategory } from '../graphics/logo/brief';
import { interpretStyle } from '../graphics/styles/interpret';
import { readIntent, type Experience } from '../intent';
import { DOMAINS } from '../graphics/generative/lexicon';

export interface StudioFacts {
  /** quoted words, in order, exactly */
  quoted: string[];
  headline?: string;
  subhead?: string;
  /** dates and places named */
  meta: string[];
  brand?: string;
  /** a graphic kind named outright */
  kind?: GraphicKind;
  /** a story asked for (a social post in the story format) */
  story: boolean;
  /** materials named (a board), with their counts */
  materials: MaterialSpec[];
  /** the website's experience, when the words say it */
  experience?: Experience;
  /** the subjects the words are about (the lexicon's domains) */
  domains: string[];
  /** temperament words */
  mood: string[];
  /** style profiles named */
  styles: string[];
  /** colours named, as hex */
  colours: string[];
  logoCategory?: LogoCategory;
  /** what the words ask to avoid (beyond the default clichés) */
  avoid: string[];
  /** links given in the words */
  urls: string[];
}

const PERSONALITY = /\b(warm|calm|bold|playful|refined|raw|precise|joyful|serious|quiet|loud|crafted|handmade|modern|classic|experimental|friendly|luxurious|luxury|premium|honest|rebellious|natural|organic|technical|poetic|minimal|minimalist|editorial|retro|vintage|futuristic|elegant|energetic|cinematic|geometric|brutalist|swiss|maximalist|restrained|daring|soft|confident|trustworthy|youthful|sophisticated|earthy|vibrant)\b/gi;

const CANON: Record<string, string> = { minimalist: 'minimal', luxury: 'luxurious', premium: 'luxurious', handmade: 'crafted', vintage: 'retro', organic: 'natural' };

/** The facts an opening sentence states (see the head of this file). */
export function readFacts(text: string): StudioFacts {
  const words = (text ?? '').slice(0, 2400);
  const low = words.toLowerCase();
  const g = readGraphicBrief(words);
  const kind = graphicKindNamed(words) ?? undefined;
  const quotedRe = /“([^”]{1,160})”|"([^"]{1,160})"/g;
  const quoted = [...words.matchAll(quotedRe)].map((m) => (m[1] ?? m[2] ?? '').trim()).filter(Boolean);
  const named = readBoardRequest(words, { defaults: false }).materials;
  const intent = words.trim() ? readIntent(words) : null;
  const logo = readLogoBrief(words);
  // only a style named outright counts (a decade or a tone merely suggests one, and is the style question's to offer)
  const style = interpretStyle(words);
  const styles = style.named ? [style.primary, style.secondary, style.tertiary].filter((x): x is string => !!x) : [];
  const mood = [...new Set([...(words.match(PERSONALITY) ?? []).map((m) => CANON[m.toLowerCase()] ?? m.toLowerCase()), ...g.mood.map((m) => CANON[m] ?? m)])];
  const colours = [...new Set([...COLOUR_WORDS.filter(([re]) => re.test(low)).map(([, hex]) => hex), ...(words.match(/#[0-9a-f]{6}\b/gi) ?? []).map((h) => h.toLowerCase())])];
  const brandFromName = nameOf(words) ?? undefined;
  // "for Halden", "called Halden": a proper name; a quoted name stays a headline unless it is a logo's
  const brand = kind === 'logo' ? brandFromName : g.content.brand ?? (brandFromName && !quoted.includes(brandFromName) ? brandFromName : undefined);
  const avoidAsked = [...low.matchAll(/\b(?:no|avoid|without|never|don't use|do not use)\s+(?:a |an |any |the )?([a-z][a-z -]{2,30}?)(?=[,.;]|\s+(?:or|and|but)\b|$)/g)].map((m) => m[1].trim());
  return {
    quoted,
    ...(quoted[0] ? { headline: quoted[0] } : {}),
    ...(quoted[1] ? { subhead: quoted[1] } : {}),
    meta: g.content.meta ?? [],
    ...(brand ? { brand } : {}),
    ...(kind ? { kind } : {}),
    story: /\bstor(?:y|ies)\b/.test(low),
    materials: named,
    ...(intent && intent.source === 'words' && intent.kind !== 'site' ? { experience: intent.kind } : {}),
    domains: DOMAINS.filter((d) => d.id !== 'general' && d.words.test(low)).map((d) => d.id),
    mood,
    styles,
    colours,
    ...(logo.wanted ? { logoCategory: logo.wanted } : {}),
    avoid: [...new Set(avoidAsked)].slice(0, 8),
    urls: (words.match(/https?:\/\/[^\s"”)]+/gi) ?? []).slice(0, 4),
  };
}
