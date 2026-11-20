// lib/ux-v0/graphics/styles/propose.ts — the directions a graphics brief is offered, each in a design language.
//
// No modern default: the languages come from the brief. A style it names ("an art deco poster", "Swiss typography with
// risograph texture") is honoured first, with its influences, strength and the person's intensities as read
// (interpret.ts); the rest are chosen by what the brief says — subject, tone, audience, kind, whether there is a
// picture — and kept apart from each other (no two of one category building the same way) and from what was already
// shown (selectStyles). Each direction keeps the engine's own name for the colour thinking behind it; the style sets
// its palette, faces, type and composition. Deterministic: the same brief in the same project proposes the same.

import type { GraphicBrief, GraphicDirection } from '../compose';
import { styledDirection } from './apply';
import type { StyleSelection } from './blend';
import { interpretStyle, selectionOf, selectStyles } from './interpret';
import { styleById } from './registry';
import type { StyleDNA } from './schema';

/** The words of a brief that speak of its look: what it is for, its words, its mood. */
export const briefWords = (b: GraphicBrief): string => [b.purpose, b.content.headline, b.content.subhead, b.mood.join(', ')].filter(Boolean).join('. ');

export interface StyledOptions {
  options: GraphicDirection[];
  /** why each language was chosen, in order */
  why: string[];
}

/** Directions dressed in design languages chosen from the brief (see the head of this file). */
export function styledOptions(
  brief: GraphicBrief,
  dirs: readonly GraphicDirection[],
  opts: {
    salt: string;
    seedKey: string;
    seen?: readonly string[];
    customs?: readonly StyleDNA[];
  },
): StyledOptions {
  const customs = opts.customs ?? [];
  const words = briefWords(brief);
  const asked = interpretStyle(words, { customs });
  const picks: { sel: StyleSelection; why: string }[] = [];
  const named = asked.named ? selectionOf(asked, customs) : null;
  if (named)
    picks.push({
      sel: named,
      why: `${styleById(named.primary, customs)?.name ?? named.primary}: named in the brief`,
    });
  const more = selectStyles(
    {
      words,
      mood: brief.mood,
      kind: brief.kind,
      hasImage: brief.images.length > 0,
    },
    {
      count: dirs.length,
      seen: [...(opts.seen ?? []), ...picks.map((p) => p.sel.primary)],
      salt: opts.salt,
      customs,
    },
  );
  for (const c of more) {
    if (picks.length >= dirs.length) break;
    if (picks.some((p) => p.sel.primary === c.style.id)) continue;
    picks.push({
      sel: { primary: c.style.id, strength: 0 },
      why: `${c.style.name}: ${c.why.length ? c.why.slice(0, 2).join(', ') : 'a different language to compare'}`,
    });
  }
  const brand = asked.brand.colours.length ? asked.brand.colours : undefined;
  return {
    options: dirs.map((d, i) =>
      picks[i]
        ? styledDirection(
            d,
            { ...picks[i].sel, seedKey: opts.seedKey },
            {
              customs,
              brand,
              keepColours: asked.brand.keepColours,
              keepFonts: asked.brand.keepFonts,
            },
          )
        : d,
    ),
    why: picks.map((p) => p.why),
  };
}
