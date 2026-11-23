// lib/ux-v0/graphics/creative/alternatives.ts — alternatives asked for in words, each on an artboard of its own.
//
// An alternative never replaces the design it is an alternative to: "try something completely different", "give me
// three more directions", "keep the visual language but change the composition" and "five different versions" each
// add artboards beside the one in front, which stays as it is. This reads which kind of alternative the words ask for:
//   directions    another way of seeing the brief — its own palette, faces and composition (the workspace composes
//                 them from the brief in directions not yet used: GraphicsWorkspace onAlternatives);
//   compositions  other arrangements in the same visual language (the generative engine's explore);
//   same-look     one new arrangement, the colours, type, forms and ground kept (the executor, on a copy).
// Deterministic; words about one object or one decision ("a different font") are not alternatives.

export type AlternativeKind = 'directions' | 'compositions' | 'same-look';

export interface AlternativeAsk {
  kind: AlternativeKind;
  count: number;
  /** what will be made, said to the person */
  summary: string;
}

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const COUNT: Record<string, number> = { a: 1, an: 1, one: 1, another: 1, single: 1, two: 2, couple: 2, pair: 2, three: 3, few: 3, some: 3, more: 3, several: 4, four: 4, five: 5, six: 6 };
const countIn = (w: string, fallback: number): number => {
  const m = w.match(/\b(\d{1,2}|an?|one|another|single|two|couple|pair|three|few|some|more|several|four|five|six)\b(?= (?:\w+ ){0,3}?(?:directions?|concepts?|ideas?|looks?|styles?|approaches|takes?|routes?|versions?|compositions?|layouts?|variations?|options?|designs?|alternatives?|arrangements?))/);
  if (!m) return fallback;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : COUNT[m[1]] ?? fallback;
  return Math.max(1, Math.min(6, n));
};

const ASKING = /\b(give me|show me|make|generate|create|try|explore|i want|i'?d like|can (i|you|we) (see|have|get|try)|let me see|let'?s (see|try)|could you|can you|do|produce|offer|sketch|propose|suggest|draw up|come up with)\b/;

/** The alternative the words ask for, or null when they ask for something else. */
export function readAlternatives(words0: string): AlternativeAsk | null {
  const w = lower(words0);
  if (!w || w.length > 300) return null;
  // the same visual language, another arrangement
  const sameLook =
    /\b(keep|same|retain|preserve|hold( on to)?|stick with|maintain)\b[^.]*?\b(visual language|look( and feel)?|style|aesthetic|identity|colou?rs? and (type|typography|fonts))\b[^.]*?\b(change|different|new|another|rethink|other|try|rework|redo)\b[^.]*?\b(composition|layout|arrangement|structure)\b/.test(w) ||
    /\b(different|another|new|other)\s+(composition|layout|arrangement|structure)s?\b[^.]*?\b(same|this|the current)\s+(look|style|visual language|aesthetic|colou?rs?)\b/.test(w);
  if (sameLook) {
    const n = countIn(w, 1);
    return { kind: n > 1 ? 'compositions' : 'same-look', count: n, summary: n > 1 ? `${n} other arrangements in the same visual language, beside this one` : 'another arrangement in the same visual language, beside this one' };
  }
  // something completely different: another direction altogether
  if (/\b(something|anything) (completely |totally |entirely |radically |very |quite |really )?(different|else|new)\b/.test(w) || /\b(completely|totally|entirely|radically) (different|new|other) (direction|approach|idea|concept|design|take|look|style|route)\b/.test(w) || /\b(start (over|again|afresh)|from scratch)\b/.test(w)) {
    if (/\b(font|typeface|colou?r|palette|headline|background|logo)\b/.test(w)) return null;
    const n = countIn(w, 1);
    return { kind: 'directions', count: n, summary: n === 1 ? 'a different direction, beside this one' : `${n} different directions, beside this one` };
  }
  // N directions, concepts, ideas, looks, styles
  if (/\b(directions?|concepts?|ideas|looks|styles|approaches|routes)\b/.test(w) && (ASKING.test(w) || /^\s*(\d+|two|three|four|five|a few|some|more|other|another|different|new)\b/.test(w)) && /\b(\d|an?|one|two|three|four|five|six|few|couple|several|some|more|other|another|different|new|alternative|fresh)\b/.test(w)) {
    // "a different style for the headline" is one object's change, not an alternative
    if (/\b(for|of) (the|this) (headline|title|logo|button|text|background)\b/.test(w)) return null;
    // a style named ("try a Swiss style") is a change of style, read elsewhere
    if (/\b(swiss|bauhaus|brutalist|art deco|minimalist|editorial|retro|vintage|y2k|memphis)\b/.test(w)) return null;
    const n = countIn(w, /\b(directions|concepts|ideas|looks|styles|approaches|routes)\b/.test(w) ? 3 : 1);
    return { kind: 'directions', count: n, summary: n === 1 ? 'another direction, beside this one' : `${n} new directions, beside this one` };
  }
  // N versions, compositions, layouts, variations: the same language, other arrangements
  if (/\b(versions?|compositions?|layouts?|variations?|options|alternatives|arrangements)\b/.test(w) && ASKING.test(w) && /\b(\d|two|three|four|five|six|few|couple|several|some|more|other|another|different|new|alternative)\b/.test(w)) {
    if (/\b(keep the typography|for the (headline|logo))\b/.test(w)) return null;
    const n = countIn(w, 4);
    return { kind: n === 1 ? 'same-look' : 'compositions', count: n, summary: n === 1 ? 'another version, beside this one' : `${n} different versions, beside this one` };
  }
  return null;
}
