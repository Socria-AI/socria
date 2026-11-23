// lib/ux-v0/graphics/director/tier.ts — how much a change asked in words needs, read in code before anyone is asked.
//
// Used twice: the browser sends an exact change to something named to the precise reader first (no model at all), and
// the server routes what does reach the director to the economy or the premium tier (lib/ux-v0/model.ts).

/**
 * Whether a change to a graphic needs the premium tier, in code, from what was asked: a short instruction about one
 * named thing with an exact move (smaller, bigger, a colour, a position, bolder, remove) is economy work; anything
 * about the feel, the theme, the composition, the whole, what to keep while the rest changes, or a long instruction,
 * is premium. SOCRIAUX_TIER_CREATIVE_EDIT overrides it either way.
 */
export function editTier(words: string): { tier: 'economy' | 'premium'; why: string } {
  const c = String(words ?? '').toLowerCase();
  const broad = /\b(feel|feels|feeling|mood|vibe|atmospher\w*|theme|themed|aesthetic|style|look like|looks like|direction|concept|sophisticat\w*|premium|luxur\w*|expensive|editorial|cinematic|experimental|corporate|generic|personality|cohesive|professional|better|improve|rethink|redesign|rework|reimagine|transform|everything|whole|overall|entire|composition|layout|focal|hierarchy|balance|keep|preserve|original|go back|restore|like before|instead)\b/;
  const exact = /\b(smaller|bigger|larger|size|bold(er)?|lighter|thinner|heavier|colou?r|black|white|red|blue|green|yellow|move|left|right|top|bottom|cent(re|er)|align|remove|delete|hide|uppercase|lowercase|italic|spacing|tracking|opacity|rotate)\b/;
  if (c.length > 160) return { tier: 'premium', why: 'a long instruction' };
  if (broad.test(c)) return { tier: 'premium', why: 'a change to the feel, the composition or the whole' };
  if (exact.test(c)) return { tier: 'economy', why: 'an exact change to something named' };
  return { tier: 'premium', why: 'an open change' };
}

