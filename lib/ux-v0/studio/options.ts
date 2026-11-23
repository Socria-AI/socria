// lib/ux-v0/studio/options.ts — the looks a website could take, proposed by the engines from the person's words.
//
// Nothing here is a stock palette, a stock pairing or a style picked from a list: a website's looks are systems the
// board engine proposes for this conversation's words (lib/ux-v0/boards/pipeline.ts), held to the colours and faces the
// person chose — in the conversation's creative questions, or from their references. The page is made in the first
// (there is no line-up to choose from: studio/begin.ts startFrom); two can still be combined (one's colours with the
// other's type and structure).

import type { StudioState } from './schema';
import { readFacts } from './facts';
import { prefsOf, systemsWithPrefs, websiteAskOf, wordsOf } from './apply';
import { proposeSystems } from '../boards/pipeline';
import type { MasterDesignSystem } from '../boards/system';

export interface OptionSeed {
  id: string;
  label: string;
  hint?: string;
  swatches?: string[];
  faces?: { display: string; body: string };
  recommended?: boolean;
}

const salt = (st: StudioState) => `${st.createdAt}|${st.prompt.slice(0, 80)}${st.round ? `|round ${st.round}` : ''}`;

/** Three systems a website could be made in, proposed by the board engine for these words (or none without them). */
export function websiteSystems(st: StudioState): MasterDesignSystem[] {
  const ask = websiteAskOf(st);
  if (!ask) return [];
  // each time other looks are asked for, the languages already shown are kept apart (as a board's "more systems" does)
  const round = Math.min(st.round ?? 0, 8);
  const seen: string[] = [];
  let systems: MasterDesignSystem[] = [];
  for (let r = 0; r <= round; r++) {
    systems = proposeSystems(ask.board, salt({ ...st, round: r }), { round: r, seen: [...seen] }).slice(0, 3);
    seen.push(...systems.flatMap((x) => [x.direction.language, ...(x.style?.primary ? [x.style.primary] : [])]));
  }
  // proposed from the words, then held to the colours and faces the person chose or their references gave
  return systemsWithPrefs(systems, prefsOf(st));
}

export function websiteOptions(systems: readonly MasterDesignSystem[]): OptionSeed[] {
  return systems.map((s, i) => ({ id: `sys-${i}`, label: s.direction.name, hint: s.direction.concept?.split(/(?<=\.)\s/)[0]?.slice(0, 90) ?? s.personality.slice(0, 3).join(', '), swatches: [s.tokens.colors.background, s.tokens.colors.text, s.tokens.colors.accent], faces: { display: s.tokens.fonts.display, body: s.tokens.fonts.body } }));
}

/** Two looks made one: the first's colours, the second's type, structure and voice. */
export function combineSystems(colour: MasterDesignSystem, rest: MasterDesignSystem): MasterDesignSystem {
  return {
    ...rest,
    name: `${colour.direction.name} × ${rest.direction.name}`.slice(0, 80),
    direction: { ...rest.direction, name: `${colour.direction.name} × ${rest.direction.name}`.slice(0, 80), concept: `The colours of ${colour.direction.name}, with the type and structure of ${rest.direction.name}.` },
    tokens: { ...rest.tokens, colors: { ...colour.tokens.colors } },
  };
}

/** The look a website is made in, from what was chosen: one of the three (sys-i), or two combined (mix-i-j). */
export function systemChosen(systems: readonly MasterDesignSystem[], value: string | undefined): MasterDesignSystem | null {
  const mix = value?.match(/^mix-(\d)-(\d)$/);
  if (mix) {
    const a = systems[Number(mix[1])];
    const b = systems[Number(mix[2])];
    if (a && b) return combineSystems(a, b);
  }
  const one = value?.match(/^sys-(\d)$/);
  return systems[one ? Number(one[1]) : 0] ?? systems[0] ?? null;
}

/** The words to compose previews with: the person's headline, else their name, else the opening sentence's subject. */
export function previewWords(st: StudioState): { headline: string; subhead: string } {
  const stage = st.mode === 'board' ? 'b.words' : st.mode === 'website' ? 'w.words' : 'g.words';
  const w = wordsOf(st, stage);
  const f = readFacts(st.prompt);
  const headline = w.headline || w.brand || f.brand || f.headline || (st.prompt.split(/[.,;:]/)[0] ?? '').replace(/^\s*(an?|the|make|create|design)\s+/i, '').slice(0, 48) || 'Your words here';
  return { headline, subhead: w.subhead || f.subhead || '' };
}
