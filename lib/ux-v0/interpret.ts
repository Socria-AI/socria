// lib/ux-v0/interpret.ts — the creative reading: what the designer's words ask for, as execution.
//
// "Monumental, restrained, cinematic, museum-like" is not a list of keywords to match a style against. Each word
// is a decision about scale, space, pace, surface and movement, and the words bear on one another: monumental and
// restrained together mean few things, set very large, with nothing ornamental; "minimal, but not cold" keeps the
// restraint and warms the ground. This module reads those relations, in code, before any model is asked:
//
//   qualities     what the work should feel like, each with what it does to the page (QUALITIES)
//   refusals      what it should not feel like ("avoid the coldness", "not corporate"): the opposite decision,
//                 applied without undoing a quality the designer asked for (a TENSION, said as one)
//   influences    visual languages named together ("architectural minimalism with experimental editorial
//                 typography"): which language, and for which part (type, layout, colour, pictures, motion)
//   restrictions  things the page must not have (cards, gradients, a centred opening, rounded corners…)
//
// The reading becomes an EXECUTION: nudges to the Creative DNA's dimensions, decisions of the look and the motion,
// a temperature for the ground, the arrangement the opening takes (layered, overlapping, off-axis), whether parts
// take a whole screen, and what is forbidden. applyReading() writes it into a direction in code, never against
// what the designer locked; readingBrief() tells the generator what it means for the sections it chooses; the
// fidelity check (lib/ux-v0/evaluate.ts) reads the drawn design back against it. Nothing here calls a model, and
// a reading is recomputed from the brief whenever it is needed: nothing new is stored in a project.

import { hslHex, hslOf } from './color';
import type { DnaKey } from './dna';
import type { DesignTokens, Look, Motion } from './spec';

export type OpeningArrange = 'layered' | 'overlap' | 'offset';
export type ReadAspect = 'type' | 'layout' | 'palette' | 'imagery' | 'motion' | 'surface';

export interface Execution {
  /** how far each DNA dimension is pushed (−40…+40), summed over the qualities */
  dna: Partial<Record<DnaKey, number>>;
  look: Partial<Pick<Look, 'ratio' | 'weight' | 'case' | 'tracking' | 'width' | 'rhythm' | 'containers' | 'rules' | 'frame' | 'grid' | 'align' | 'label'>>;
  tokens: Partial<Pick<DesignTokens, 'scale' | 'radius' | 'imageTreatment'>>;
  motion: Partial<Motion>;
  feel?: Motion['feel'];
  /** the ground and the pictures warmer (+1) or cooler (−1) */
  warmth: -1 | 0 | 1;
  /** the arrangement the opening takes when it is composed from pieces */
  arrange?: OpeningArrange;
  /** parts given a whole screen; pictures run edge to edge */
  tall?: boolean;
  bleed?: boolean;
  /** titles at display size */
  display?: 'xl' | 'giant';
  /** motifs the reading adds or takes away */
  motifs: { add: string[]; drop: string[] };
  forbid: { containers: string[]; grids: string[]; heroes: string[]; radius: string[]; motion: boolean; gradients: boolean; icons: boolean; uppercase: boolean };
}

export interface CreativeReading {
  qualities: { id: string; said: string }[];
  refusals: { id: string; said: string }[];
  /** a quality asked for together with the refusal of what usually comes with it */
  tensions: { keep: string; without: string; resolved: string }[];
  influences: { language: string; aspect: ReadAspect | null; said: string }[];
  restrictions: { id: string; said: string }[];
  execution: Execution;
  /** each decision, said plainly with the word it came from */
  said: string[];
  /** what it asks of the sections a generator chooses */
  sections: string[];
}

interface Quality {
  id: string;
  re: RegExp;
  /** what it does, in a phrase, for the designer */
  does: string;
  /** what it asks of the sections */
  sections?: string;
  ex: Partial<Omit<Execution, 'dna' | 'motifs' | 'forbid'>> & { dna?: Execution['dna']; add?: string[]; drop?: string[] };
}

/** What a quality does to the page. Each is a decision a designer would recognise, not a style to switch to. */
export const QUALITIES: readonly Quality[] = [
  { id: 'monumental', re: /\b(monumental|monolithic|imposing|towering|colossal|massive|grand(eur)?|heroic scale)\b/, does: 'few things, set very large, with room around them', sections: 'Monumental: one idea to a screen, its title at display size (xl or giant in a composed section); fewer sections, each given a whole screen; no grids of small things.', ex: { dna: { density: -28, typography: 12, restraint: -8 }, look: { ratio: 1.6, rhythm: 'dramatic', width: 'wide' }, tokens: { scale: 'spacious' }, tall: true, display: 'giant', drop: ['icons', 'shapes'] } },
  { id: 'restrained', re: /\b(restrain(ed|t)|understated|pared[- ]back|reduced|reticent|disciplined|sober|austere|spare)\b/, does: 'nothing ornamental: one ink, open surfaces, quiet movement', sections: 'Restrained: no decorative sections, no icon rows, one action per screen.', ex: { dna: { restraint: -32, motion: -14, colour: -14 }, look: { containers: 'open', rules: 'hairline' }, feel: 'calm', drop: ['shapes', 'marquee', 'icons', 'big-numerals'] } },
  { id: 'minimal', re: /\b(minimal(ist|ism)?|essential|bare|clean lines|less is more)\b/, does: 'only what is needed, on open ground', sections: 'Minimal: few sections, short copy, no card grids.', ex: { dna: { restraint: -26, density: -14 }, look: { containers: 'open' }, drop: ['shapes', 'marquee', 'icons'] } },
  { id: 'cinematic', re: /\b(cinematic|filmic|film[- ]like|widescreen|like a film|title sequence|letterbox(ed)?)\b/, does: 'pictures edge to edge, words laid over them, slow long movement', sections: 'Cinematic: full-screen composed sections (span "bleed", tall "screen") with the words layered over a wide picture (a "layer" piece, picture ratio 21:9 or 16:9); the page reads as a sequence of scenes, each held; little text per scene.', ex: { dna: { imagery: 14, motion: 14, density: -14 }, tokens: { imageTreatment: 'contrast' }, motion: { duration: 1100, ease: 'expo', entrance: 'fade', media: 'scale', scrub: 1, parallax: 2 }, feel: 'measured', arrange: 'layered', tall: true, bleed: true, display: 'xl' } },
  { id: 'museum', re: /\b(museum(-| )?(like|quality|grade)?|gallery[- ]like|curated|exhibition|archival|like an exhibition|white cube)\b/, does: 'each thing shown as a plate, captioned, with a wall of space around it', sections: 'Museum-like: each work or idea shown alone with a short caption (place, year, material), wide margins, small precise labels; no sales language.', ex: { dna: { density: -24, restraint: -16, typography: 6 }, look: { frame: 'inset', label: 'sentence', rhythm: 'even', width: 'standard' }, tokens: { scale: 'spacious' }, feel: 'calm', add: ['captions'], drop: ['icons', 'marquee'] } },
  { id: 'architectural', re: /\b(architectur(al|e)|structural|tectonic|load[- ]bearing)\b/, does: 'a strict grid that shows, heavy horizontals, type as structure', sections: 'Architectural: sections aligned to one visible grid; project facts (place, year, area) set as small data beside each piece.', ex: { dna: { composition: -8, typography: 6 }, look: { grid: 'swiss', rules: 'heavy', tracking: 'tight' }, tokens: { radius: 'none' }, add: ['numbering'] } },
  { id: 'editorial', re: /\b(editorial|magazine|printed page|like a (magazine|journal|book)|typographic)\b/, does: 'type leads: a wide scale, heads in a side column, pictures as plates', sections: 'Editorial: long-form text sections, a pull quote, captioned pictures; headlines written as headlines, not slogans.', ex: { dna: { typography: 26 }, look: { ratio: 1.5, grid: 'editorial' }, add: ['captions', 'pull-quote'] } },
  { id: 'experimental', re: /\b(experimental|avant[- ]garde|unconventional|unexpected|rule[- ]breaking|broken grid|off[- ]grid|deconstructed|radical)\b/, does: 'the grid broken on purpose: pieces off-axis and crossing one another', sections: 'Experimental: compose the opening and at least one other section on a "field" (pieces placed by hand, off-axis, overlapping); vary the arrangement from section to section; no two neighbouring sections built the same way.', ex: { dna: { composition: 32, typography: 10 }, look: { grid: 'asymmetric', rhythm: 'dramatic' }, arrange: 'overlap', display: 'xl' } },
  { id: 'layered', re: /\b(layer(ed|ing|s)|overlap(ping|s)?|collage|superimposed|stacked planes|depth)\b/, does: 'pieces laid over one another, in planes', sections: 'Layered: use "layer" and "field" pieces so type crosses pictures and pictures cross one another.', ex: { dna: { composition: 20 }, arrange: 'overlap' } },
  { id: 'asymmetric', re: /\b(asymmetr(ic|ical|y)|off[- ]cent(re|er)|off[- ]axis|uneven|lopsided)\b/, does: 'weight to one side, columns left empty', ex: { dna: { composition: 16 }, look: { grid: 'asymmetric', align: 'left' }, arrange: 'offset' } },
  { id: 'immersive', re: /\b(immersive|full[- ]screen|enveloping|all[- ]encompassing|world[- ]building)\b/, does: 'each part a whole screen, the picture filling it', sections: 'Immersive: full-screen sections (tall "screen", span "bleed"); navigation kept to a minimum.', ex: { dna: { motion: 16, imagery: 10 }, tall: true, bleed: true, arrange: 'layered', motion: { scrub: 1 } } },
  { id: 'brutal', re: /\b(brutal(ist|ism)?|raw|unpolished|blunt|uncompromising|stark)\b/, does: 'raw structure: heavy rules, square corners, type at full weight', sections: 'Brutalist: plain statements, visible structure (rules, numbers, labels), no softening copy.', ex: { dna: { restraint: 6, composition: 10 }, look: { rules: 'heavy', containers: 'ruled', weight: 800, label: 'mono' }, tokens: { radius: 'none' }, drop: ['icons'] } },
  { id: 'maximal', re: /\b(maximal(ist|ism)?|exuberant|abundant|more is more|ornate|rich and layered|lavish)\b/, does: 'plenty: a second ink, patterns, pictures in number', sections: 'Maximalist: more pictures, more voices, running text bands; density is the point, but one clear path through it.', ex: { dna: { restraint: 34, density: 22, colour: 22 }, add: ['marquee', 'shapes', 'big-numerals'], arrange: 'overlap' } },
  { id: 'luxurious', re: /\b(luxur(y|ious)|refined|couture|haute|opulent|exquisite|premium|high[- ]end)\b/, does: 'space as the expensive material: wide margins, light weights, wide small capitals', ex: { dna: { restraint: -20, density: -18 }, look: { weight: 400, label: 'caps', tracking: 'normal' }, tokens: { scale: 'spacious' }, feel: 'calm' } },
  { id: 'warm', re: /\b(warm(th)?|inviting|welcoming|human(e|ist)?|friendly|tender|intimate|cos(y|ier))\b/, does: 'a warmer ground and warmer pictures', ex: { warmth: 1, tokens: { imageTreatment: 'warm' } } },
  { id: 'cool', re: /\b(cool(er)?|cold|clinical|icy|sterile on purpose|crisp)\b/, does: 'a cooler ground', ex: { warmth: -1 } },
  { id: 'playful', re: /\b(playful|fun|joyful|whimsical|cheeky|witty|lighthearted|delight(ful)?)\b/, does: 'rounder corners, a second ink, livelier movement', ex: { dna: { restraint: 16, motion: 12, colour: 14 }, tokens: { radius: 'round' }, feel: 'lively', add: ['shapes'] } },
  { id: 'expressive', re: /\b(expressive|emotive|gestural|dramatic|theatrical|bold)\b/, does: 'a steeper scale and heavier headlines', ex: { dna: { typography: 16, restraint: 14 }, look: { ratio: 1.5, weight: 700, rhythm: 'dramatic' }, display: 'xl' } },
  { id: 'industrial', re: /\b(industrial|utilitarian|workshop|factory|engineered|mechanical|machined)\b/, does: 'labels in mono, hairlines, numbered parts', ex: { dna: { restraint: -6 }, look: { label: 'mono', rules: 'hairline', grid: 'modular' }, tokens: { radius: 'none' }, add: ['numbering'] } },
  { id: 'futuristic', re: /\b(futuris(tic|m)|sci[- ]?fi|speculative|next[- ]gen|cyber|space[- ]age)\b/, does: 'wide tracking, mono labels, cool light on a dark field', ex: { dna: { motion: 10 }, look: { label: 'mono', tracking: 'wide' }, warmth: -1 } },
  { id: 'organic', re: /\b(organic|natural|botanical|earthy|soft forms|flowing|hand[- ]?made)\b/, does: 'soft corners, arched frames, warm ground', ex: { warmth: 1, look: { frame: 'arch' }, tokens: { radius: 'round' } } },
  { id: 'geometric', re: /\b(geometr(ic|y)|bauhaus|constructivist|primary shapes)\b/, does: 'flat shapes as a second voice', ex: { add: ['shapes'], tokens: { radius: 'none' } } },
  { id: 'abstract', re: /\b(abstract|non[- ]representational|generative|digital art|algorithmic)\b/, does: 'made pictures rather than photographs, set large', sections: 'Abstract: pictures are made drawings (fields, contours, orbits), used large and uncaptioned.', ex: { dna: { imagery: 26, composition: 12 }, arrange: 'overlap' } },
  { id: 'dense', re: /\b(dense|information[- ]rich|data[- ]rich|packed|compact|encyclop(a)?edic)\b/, does: 'more to a screen, tighter spacing', ex: { dna: { density: 30 }, tokens: { scale: 'compact' } } },
  { id: 'airy', re: /\b(airy|spacious|generous (white ?)?space|negative space|breathing room|silent|stillness)\b/, does: 'generous space', ex: { dna: { density: -24 }, tokens: { scale: 'spacious' } } },
  { id: 'calm', re: /\b(calm|quiet|serene|peaceful|tranquil|hushed)\b/, does: 'little moves, and gently', ex: { dna: { motion: -12 }, feel: 'calm' } },
  { id: 'kinetic', re: /\b(kinetic|in motion|always moving|animated throughout|motion[- ]led|motion[- ]rich|motion[- ]intensive)\b/, does: 'movement carries the page: a pinned story, type that arrives', sections: 'Kinetic: include one sequence of three to six points right after the opening (it is pinned and told step by step); headlines short enough to arrive letter by letter.', ex: { dna: { motion: 34 }, feel: 'kinetic' } },
  { id: 'slow', re: /\b(slow(ly)?|unhurried|patient|lingering|contemplative|meditative)\b/, does: 'longer, gentler movement', ex: { dna: { motion: -8 }, motion: { duration: 1100, ease: 'gentle' } } },
  { id: 'precise', re: /\b(precise|precision|exact(ing)?|rigorous|technical|scientific|measured)\b/, does: 'hairlines, small exact labels, a strict grid', ex: { look: { rules: 'hairline', tracking: 'normal' }, dna: { composition: -10 } } },
];

/** What "not X" means: the decision that answers it, applied without undoing a quality that was asked for. */
const REFUSALS: readonly { id: string; re: RegExp; does: string; ex: Quality['ex']; drops?: string[] }[] = [
  { id: 'cold', re: /cold(ness)?|sterile|sterility|clinical|icy|soulless|lifeless|impersonal/, does: 'a warm ground, warm pictures and softened corners, the restraint kept', ex: { warmth: 1, tokens: { imageTreatment: 'warm', radius: 'soft' } } },
  { id: 'corporate', re: /corporate|saas[- ]?(like|y)?|start-?up(py)?|business[- ]?like|generic|template(d|-like)?|cookie[- ]cutter/, does: 'no card grids, no icon rows, the opening set off-axis', ex: { dna: { composition: 14 }, look: { containers: 'open', align: 'left' }, drop: ['icons'] }, drops: ['cards'] },
  { id: 'busy', re: /busy|cluttered|crowded|noisy|overwhelming|chaotic/, does: 'fewer things to a screen', ex: { dna: { density: -22, restraint: -10 }, drop: ['marquee', 'shapes'] } },
  { id: 'heavy', re: /heavy|heaviness|oppressive|dense|weighty/, does: 'lighter headline weights and more space', ex: { look: { weight: 400 }, dna: { density: -12 } } },
  { id: 'childish', re: /childish|cartoonish|cute|twee|juvenile/, does: 'square or soft corners, no flat shapes', ex: { tokens: { radius: 'soft' }, drop: ['shapes'] } },
  { id: 'loud', re: /loud|shouty|shouting|aggressive|garish|flashy|gimmicky/, does: 'one ink, quieter movement', ex: { dna: { restraint: -18, motion: -12, colour: -12 }, drop: ['marquee'] } },
  { id: 'boring', re: /boring|bland|dull|safe|predictable|forgettable/, does: 'a composition of its own: the opening composed off-axis', ex: { dna: { composition: 18 }, arrange: 'offset' } },
  { id: 'slick', re: /slick|glossy|over-?polished|too polished|too perfect/, does: 'visible structure: rules and plain labels', ex: { look: { rules: 'heavy', label: 'sentence' } } },
];

/** What the page must not have, said outright. */
const RESTRICTIONS: readonly { id: string; re: RegExp; said: string; apply: (f: Execution['forbid'], ex: Execution) => void }[] = [
  { id: 'cards', re: /\b(cards?|card grids?|bento|tiles|boxes)\b/, said: 'no cards or bento grids', apply: (f) => (f.containers.includes('cards') || f.containers.push('cards')) && f.grids.push('modular') },
  { id: 'gradients', re: /\b(gradients?|glass(morphism)?|glow|neon|purple)\b/, said: 'no gradients, glass or glow', apply: (f) => (f.gradients = true) },
  { id: 'centred', re: /\b(cent(re|er)ed (hero|opening|layout|headline)|hero sections?|a hero)\b/, said: 'no centred opening', apply: (f) => f.heroes.push('centered') && f.grids.push('centered') },
  { id: 'rounded', re: /\b(round(ed)? corners?|rounded|pills?|soft corners)\b/, said: 'square corners', apply: (f) => f.radius.push('round', 'soft') },
  { id: 'motion', re: /\b(animations?|motion|movement|parallax|scroll effects?)\b/, said: 'nothing moves', apply: (f) => (f.motion = true) },
  { id: 'icons', re: /\b(icons?|emoji|illustrations? of features)\b/, said: 'no icons', apply: (f) => (f.icons = true) },
  { id: 'uppercase', re: /\b(all[- ]caps|capitals|uppercase|shouting type)\b/, said: 'no headlines in capitals', apply: (f) => (f.uppercase = true) },
  { id: 'borders', re: /\b(borders?|outlines?|boxes around)\b/, said: 'no ruled boxes', apply: (f) => f.containers.push('ruled', 'framed') },
];

/** Words that say which part of a design an influence is for. */
const ASPECTS: readonly [RegExp, ReadAspect][] = [
  [/\b(typograph\w*|type|lettering|headlines?|fonts?)\b/, 'type'],
  [/\b(layouts?|composition|grid|structure|spatial|arrangement)\b/, 'layout'],
  [/\b(colou?rs?|palette|tones?)\b/, 'palette'],
  [/\b(photograph\w*|imagery|images?|pictures?|illustration)\b/, 'imagery'],
  [/\b(motion|movement|animation|pace)\b/, 'motion'],
  [/\b(surfaces?|materials?|texture|finish)\b/, 'surface'],
];

/** Phrases that name a visual language (lib/ux-v0/direction.ts LANGUAGES), beyond that language's own keywords. */
export const LANGUAGE_NAMES: readonly [RegExp, string][] = [
  [/\b(swiss|international style|architectural minimalism|modernist)\b/, 'swiss'],
  [/\b(editorial|magazine|journal|broadsheet|newspaper)\b/, 'broadsheet'],
  [/\b(brutal(ist|ism)?)\b/, 'brutal'],
  [/\b(cinematic|filmic|film)\b/, 'cinema'],
  [/\b(futuris(tic|m)|sci[- ]?fi|cyber)\b/, 'future'],
  [/\b(industrial|utilitarian|workshop)\b/, 'industrial'],
  [/\b(maximal(ist|ism)?)\b/, 'maximal'],
  [/\b(luxur(y|ious)|couture|quiet luxury)\b/, 'quiet-luxury'],
  [/\b(gallery|museum|white cube)\b/, 'gallery'],
  [/\b(poster|experimental typograph\w*)\b/, 'poster'],
  [/\b(organic|botanical|natural)\b/, 'organic'],
  [/\b(geometric|bauhaus)\b/, 'geometric'],
  [/\b(retro|vintage|print)\b/, 'retro-print'],
  [/\b(craft|artisan|hand[- ]?made)\b/, 'craft'],
  [/\b(night|after dark|nocturnal)\b/, 'night'],
  [/\b(civic|public service|institutional)\b/, 'civic'],
  [/\b(technical|instrument|utility)\b/, 'utility'],
];

/** Words that say two languages are to be brought together. */
const COMBINES = /\b(combin(e|es|ed|ing)|blend(s|ed|ing)?|mix(es|ed|ing)?|merg(e|es|ed|ing)|fus(e|es|ed|ing|ion)|cross(ed|ing)? with|meets?|married to|hybrid|crossed with|somewhere between|part .{3,30}, part)\b/;
const NEG = /\b(avoid(ing)?|without|not|no|never|nothing|isn't|less|minus|none of|free of|rather than|instead of|anything but)\b/;
const emptyForbid = (): Execution['forbid'] => ({ containers: [], grids: [], heroes: [], radius: [], motion: false, gradients: false, icons: false, uppercase: false });
const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The clauses of what was said: a refusal belongs to its own clause ("…, but avoid the coldness usually associated with minimalist websites"). */
function clauses(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .split(/[.;:!?\n]|,\s*(?=but\b|yet\b|though\b|while\b|without\b|avoid\b|never\b|no\b|not\b|nothing\b)|\bbut\b|\byet\b|\bhowever\b/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * The creative reading of what a designer wrote: the brief's own words, their notes to the direction, anything
 * they said they want to avoid. Deterministic: the same words give the same reading.
 */
export function readCreative(words: string, avoid = ''): CreativeReading {
  const parts = clauses(words);
  const qualities: CreativeReading['qualities'] = [];
  const refusals: CreativeReading['refusals'] = [];
  const restrictions: CreativeReading['restrictions'] = [];
  const influences: CreativeReading['influences'] = [];
  const refused = new Set<string>();
  const neg = (c: string) => {
    // what a negating word governs: the rest of its clause ("avoid the coldness usually associated with minimalism")
    const m = NEG.exec(c);
    return m ? { before: c.slice(0, m.index), after: c.slice(m.index + m[0].length) } : null;
  };
  for (const c of [...parts, ...clauses(avoid).map((a) => `avoid ${a}`)]) {
    const n = neg(c);
    const positive = n ? n.before : c;
    if (n) {
      for (const r of REFUSALS) {
        const m = new RegExp(`\\b(${r.re.source})\\b`).exec(n.after);
        if (m && !refusals.some((x) => x.id === r.id)) refusals.push({ id: r.id, said: m[0] }), refused.add(r.id);
      }
      for (const r of RESTRICTIONS) {
        const m = r.re.exec(n.after);
        if (m && !restrictions.some((x) => x.id === r.id)) restrictions.push({ id: r.id, said: r.said });
      }
      // a quality refused outright ("not minimal", "nothing cinematic"), unless it is only named as what a refusal usually comes with
      for (const q of QUALITIES) if (q.re.test(n.after) && !/\b(associated with|typical of|that comes with|you get with|of most|usual(ly)?)\b/.test(n.after)) refused.add(q.id);
    }
    for (const q of QUALITIES) {
      const m = q.re.exec(positive);
      if (m && !qualities.some((x) => x.id === q.id)) qualities.push({ id: q.id, said: m[0] });
    }
    // languages named together ("combine A with B", "A meets B"), each with the part it is for when one is said beside it
    if (!COMBINES.test(positive)) continue;
    for (const [re, language] of LANGUAGE_NAMES) {
      const m = re.exec(positive);
      if (!m || influences.some((x) => x.language === language)) continue;
      const near = positive.slice(Math.max(0, m.index - 4), m.index + m[0].length + 28);
      const aspect = ASPECTS.find(([a]) => a.test(near.slice(m[0].length + Math.min(4, m.index))))?.[1] ?? null;
      influences.push({ language, aspect, said: m[0] });
    }
  }
  const kept = qualities.filter((q) => !refused.has(q.id));
  // a refusal of what a kept quality usually brings is a tension, resolved by keeping the quality and answering the refusal
  const BRINGS: Record<string, string[]> = { cold: ['minimal', 'restrained', 'architectural', 'precise', 'brutal', 'industrial', 'futuristic'], busy: ['maximal', 'dense', 'experimental', 'layered', 'kinetic'], heavy: ['monumental', 'brutal', 'architectural'], loud: ['expressive', 'maximal', 'kinetic', 'playful'], childish: ['playful'], boring: ['minimal', 'restrained', 'precise'], slick: ['luxurious', 'cinematic'], corporate: ['precise', 'minimal'] };
  const tensions: CreativeReading['tensions'] = [];
  for (const r of refusals) {
    const k = kept.find((q) => (BRINGS[r.id] ?? []).includes(q.id));
    const how = REFUSALS.find((x) => x.id === r.id)!.does;
    if (k) tensions.push({ keep: k.id, without: r.id, resolved: `${k.said}, without the ${r.said}: ${how}` });
  }

  // ── the execution: each quality's decisions, in the order said; a later one refines an earlier one ──
  const ex: Execution = { dna: {}, look: {}, tokens: {}, motion: {}, warmth: 0, motifs: { add: [], drop: [] }, forbid: emptyForbid() };
  const said: string[] = [];
  const sections: string[] = [];
  const merge = (e: Quality['ex']) => {
    for (const [k, v] of Object.entries(e.dna ?? {})) ex.dna[k as DnaKey] = clampN((ex.dna[k as DnaKey] ?? 0) + (v as number), -40, 40);
    Object.assign(ex.look, e.look ?? {});
    Object.assign(ex.tokens, e.tokens ?? {});
    Object.assign(ex.motion, e.motion ?? {});
    if (e.feel) ex.feel = e.feel;
    if (e.warmth) ex.warmth = e.warmth;
    if (e.arrange) ex.arrange = e.arrange;
    if (e.tall) ex.tall = true;
    if (e.bleed) ex.bleed = true;
    if (e.display && !(ex.display === 'giant')) ex.display = e.display;
    for (const m of e.add ?? []) if (!ex.motifs.add.includes(m)) ex.motifs.add.push(m);
    for (const m of e.drop ?? []) if (!ex.motifs.drop.includes(m)) ex.motifs.drop.push(m);
  };
  for (const q of kept) {
    const def = QUALITIES.find((x) => x.id === q.id)!;
    merge(def.ex);
    said.push(`${q.said}: ${def.does}`);
    if (def.sections) sections.push(def.sections);
  }
  // restraint wins over ornament where both were asked: monumental AND restrained is large and plain, not large and loud
  if (kept.some((q) => q.id === 'restrained' || q.id === 'minimal')) {
    ex.motifs.add = ex.motifs.add.filter((m) => m === 'captions' || m === 'numbering');
    if ((ex.dna.restraint ?? 0) > -10) ex.dna.restraint = -20;
    if (ex.feel === 'kinetic' || ex.feel === 'lively') ex.feel = 'measured';
  }
  // refusals last: they answer what the qualities brought, and are never themselves overridden
  for (const r of refusals) {
    const def = REFUSALS.find((x) => x.id === r.id)!;
    // a refusal keeps the quality it is in tension with: only the decisions that do not undo it are taken
    const t = tensions.find((x) => x.without === r.id);
    const e = { ...def.ex };
    const square = kept.some((q) => ['brutal', 'architectural', 'industrial', 'geometric'].includes(q.id));
    if (t && square && e.tokens?.radius) e.tokens = Object.fromEntries(Object.entries(e.tokens).filter(([k]) => k !== 'radius')) as Quality['ex']['tokens'];
    merge(e);
    if (def.drops?.includes('cards') && !ex.forbid.containers.includes('cards')) ex.forbid.containers.push('cards');
    if (!t) said.push(`not ${r.said}: ${def.does}`);
    else if (square && r.id === 'cold') t.resolved = t.resolved.replace(' and softened corners', '');
  }
  for (const t of tensions) said.push(t.resolved);
  for (const r of restrictions) {
    RESTRICTIONS.find((x) => x.id === r.id)!.apply(ex.forbid, ex);
    said.push(r.said);
  }
  if (ex.forbid.icons) ex.motifs.drop.push('icons');
  ex.motifs.add = ex.motifs.add.filter((m) => !ex.motifs.drop.includes(m));
  if (ex.forbid.motion) (ex.feel = 'still'), (ex.motion = {});
  if (ex.forbid.uppercase && ex.look.case === 'upper') delete ex.look.case;
  if (ex.forbid.radius.length && ex.tokens.radius && ex.forbid.radius.includes(ex.tokens.radius)) ex.tokens.radius = 'none';
  if (influences.length >= 2) said.push(`${influences.map((i) => `${i.said}${i.aspect ? ` (its ${i.aspect})` : ''}`).join(' with ')}: one direction built from both`);
  return { qualities: kept, refusals, tensions, influences, restrictions, execution: ex, said, sections };
}

/** Whether a reading says anything at all (most plain briefs say little: nothing is then changed). */
export const readingIsEmpty = (r: CreativeReading | null | undefined) => !r || (!r.qualities.length && !r.refusals.length && !r.restrictions.length && r.influences.length < 2);

/** A colour's hue drawn toward warm (about 38°) or cool (about 215°), keeping how light it is: for grounds and inks. */
export function temper(hex: string, warmth: -1 | 0 | 1, amount = 0.5): string {
  if (!warmth) return hex;
  const [h, s, l] = hslOf(hex);
  const target = warmth > 0 ? 38 : 215;
  // a neutral takes the tint outright (a white ground steps down a little, or no tint could show); a colour of its
  // own is only leaned
  const neutral = s < 0.08;
  const sat = neutral ? (l < 0.25 ? 0.1 + 0.1 * amount : 0.12 + 0.3 * amount) : s;
  const d = ((target - h + 540) % 360) - 180;
  const hue = neutral ? target : (h + d * 0.25 * amount + 360) % 360;
  return hslHex(hue, sat, neutral && l > 0.96 ? 0.96 - 0.01 * amount : l);
}

export interface Readable {
  tokens: DesignTokens;
  look: Look;
  locks: readonly string[];
}

/**
 * A direction with the reading written into it: its look, its tokens, its motion, the ground's temperature, the
 * motifs — each only where the designer has not locked that group, and never a forbidden value. Returns what was
 * changed, said plainly, so the direction can show it and the fidelity check can hold it.
 */
export function applyReading<D extends Readable>(d: D, r: CreativeReading | null | undefined, opts: { keepColours?: boolean; keepType?: boolean; presets?: Record<string, Motion>; /** leave the grid and the alignment to the direction (one of several that should differ in composition) */ ownGrid?: boolean } = {}): { direction: D; applied: string[] } {
  if (readingIsEmpty(r)) return { direction: d, applied: [] };
  const ex = r!.execution;
  const locked = (g: string) => d.locks.includes(g);
  const look: Look = { ...d.look, motifs: [...d.look.motifs] };
  const tokens: DesignTokens = { ...d.tokens, colors: { ...d.tokens.colors }, fonts: { ...d.tokens.fonts } };
  const applied: string[] = [];
  // the other directions read the same words their own way: they keep what the words ask outright (a steeper scale,
  // the motion, the spacing, the ground's warmth, everything refused) and interpret the rest in their own language
  const alt = !!opts.ownGrid;
  if (!locked('type') && !opts.keepType) {
    if (ex.look.ratio && ex.look.ratio > look.ratio) look.ratio = ex.look.ratio;
    if (ex.look.weight && !alt) look.weight = ex.look.weight;
    if (ex.look.tracking && !alt) look.tracking = ex.look.tracking;
    if (ex.look.label && !alt) look.label = ex.look.label;
    if (ex.forbid.uppercase && look.case === 'upper') look.case = 'sentence';
  }
  if (!locked('layout')) {
    if (ex.look.grid && !opts.ownGrid) look.grid = ex.look.grid;
    if (ex.look.align && !opts.ownGrid) look.align = ex.look.align;
    if (ex.look.width && !alt) look.width = ex.look.width;
    if (ex.look.rhythm && !alt) look.rhythm = ex.look.rhythm;
    if (ex.tokens.scale) tokens.scale = ex.tokens.scale;
    if (ex.forbid.grids.includes(look.grid)) look.grid = look.grid === 'centered' ? 'asymmetric' : 'editorial';
    if (ex.forbid.grids.includes('centered')) look.align = 'left';
  }
  if (!locked('surface')) {
    if (ex.look.containers && !alt) look.containers = ex.look.containers;
    if (ex.look.rules && !alt) look.rules = ex.look.rules;
    if (ex.tokens.radius && !alt) tokens.radius = ex.tokens.radius;
    if (ex.forbid.containers.includes(look.containers)) look.containers = 'open';
    if (ex.forbid.radius.includes(tokens.radius)) tokens.radius = 'none';
  }
  if (!locked('imagery') && !alt) {
    if (ex.look.frame) look.frame = ex.look.frame;
    if (ex.tokens.imageTreatment) tokens.imageTreatment = ex.tokens.imageTreatment;
  }
  if (!locked('motifs')) {
    look.motifs = [...new Set([...look.motifs.filter((m) => !ex.motifs.drop.includes(m)), ...((alt ? [] : ex.motifs.add) as Look['motifs'])])].slice(0, 4) as Look['motifs'];
  }
  if (!locked('motion') && (ex.feel || Object.keys(ex.motion).length || ex.forbid.motion)) {
    // another direction moves toward the words' motion by a step rather than copying it (motion refused is refused)
    const FEELS = ['still', 'calm', 'measured', 'lively', 'kinetic'] as const;
    const own = FEELS.indexOf(look.motion.feel);
    const want = ex.feel ? FEELS.indexOf(ex.feel) : -1;
    const feel = alt && !ex.forbid.motion && want >= 0 && own >= 0 ? (Math.abs(own - want) <= 1 ? look.motion.feel : FEELS[own + Math.sign(want - own)]) : ex.feel;
    const base = feel && opts.presets?.[feel] ? { ...opts.presets[feel] } : { ...look.motion };
    look.motion = ex.forbid.motion && opts.presets?.still ? { ...opts.presets.still } : ({ ...base, ...(alt ? {} : ex.motion) } as Motion);
  }
  if (!locked('palette') && !opts.keepColours && ex.warmth) {
    tokens.colors.background = temper(tokens.colors.background, ex.warmth);
    tokens.colors.surface = temper(tokens.colors.surface, ex.warmth, 0.3);
    tokens.colors.line = temper(tokens.colors.line, ex.warmth);
    tokens.colors.muted = temper(tokens.colors.muted, ex.warmth, 0.4);
    applied.push(ex.warmth > 0 ? 'the ground warmed' : 'the ground cooled');
  }
  for (const s of r!.said) applied.push(s);
  return { direction: { ...d, look, tokens }, applied: [...new Set(applied)] };
}

/** The reading for the generator: what it means for the sections it chooses, in a few lines. Empty when nothing was read. */
export function readingBrief(r: CreativeReading | null | undefined): string {
  if (readingIsEmpty(r)) return '';
  const ex = r!.execution;
  const lines = [
    'THE CREATIVE READING — what the designer’s own words ask of the page (already applied to the look in code; the sections you choose must carry it too):',
    ...r!.said.map((s) => `- ${s}`),
    ...r!.sections.map((s) => `- ${s}`),
    ex.arrange ? `- The opening is composed from pieces, ${ex.arrange === 'layered' ? 'its words layered over its picture (a "layer")' : ex.arrange === 'overlap' ? 'on a "field": the title at display size crossing the picture' : 'on a "field": the title off-axis, columns left empty on purpose'}. Do not open with a library hero.` : '',
    ex.forbid.containers.includes('cards') ? '- No card grids: do not use features/cards, pricing cards or stat cards as decoration.' : '',
    ex.forbid.heroes.includes('centered') ? '- No centred opening.' : '',
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Whether a drawn design still keeps the reading: what a model's sections, or a later change, undid.
 * Each breach names what to restore; the caller turns them into findings and fixes.
 */
export function readingBreaches(spec: { tokens: DesignTokens; look?: Look; sections: readonly { id: string; kind: string; variant: string }[] }, r: CreativeReading | null | undefined): { what: string; said: string; look?: Partial<Look>; tokens?: Partial<DesignTokens>; variant?: { sectionId: string; to: string } }[] {
  if (readingIsEmpty(r) || !spec.look) return [];
  const f = r!.execution.forbid;
  const out: ReturnType<typeof readingBreaches> = [];
  if (f.containers.includes(spec.look.containers)) out.push({ what: `${spec.look.containers} surfaces`, said: r!.restrictions.find((x) => x.id === 'cards' || x.id === 'borders')?.said ?? 'no card grids', look: { containers: 'open' } });
  if (f.radius.includes(spec.tokens.radius)) out.push({ what: 'rounded corners', said: 'square corners', tokens: { radius: 'none' } });
  if (f.uppercase && spec.look.case === 'upper') out.push({ what: 'headlines in capitals', said: 'no headlines in capitals', look: { case: 'sentence' } });
  if (f.motion && spec.look.motion && spec.look.motion.feel !== 'still') out.push({ what: 'movement', said: 'nothing moves', look: { motion: { ...spec.look.motion, feel: 'still' } as Motion } });
  if (f.icons && spec.look.motifs.includes('icons')) out.push({ what: 'icons', said: 'no icons', look: { motifs: spec.look.motifs.filter((m) => m !== 'icons') } });
  const hero = spec.sections.find((s) => s.kind === 'hero');
  if (hero && f.heroes.includes(hero.variant)) out.push({ what: 'a centred opening', said: 'no centred opening', variant: { sectionId: hero.id, to: 'editorial' } });
  return out;
}
