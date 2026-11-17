// lib/runtime/ideas-wanted.ts — MIND MAPS WHEN THEY HELP (November 2026).
//
// The Logic Map is drawn for every line of thinking: in the background, on a light cadence, so search, the
// Universal Map and the rewards challenge see it (lib/runtime/orchestrate.ts needsMap). Whether its ideas are
// spread across the Everything view is a different question, and the answer is not always.
//
// The ideas are drawn when they help:
//   • asked for — a mind map, a concept map, "map it out", the big picture, how the parts fit together;
//   • needed — a subject whose shape is worth seeing (a structure, a process, causes, a hierarchy: route.draw);
//   • exploring — the person is thinking something through rather than getting something done: weighing a
//     decision, researching, brainstorming, arguing a case, asking what if.
//
// A conversation of answers keeps them folded: a sum worked, a concept explained, a graph drawn, a fact checked,
// code fixed. There the replies and what they made carry it, and the ideas stay one press away ("Ideas" in the
// space's row, or the Logic Map).
//
// Read from what the person said, never from what the replies said: the same reply text can serve either.
//
// Pure: no React, no DOM, no clock.

import { readSignals } from '../core4/signals';
import { isAcknowledgement } from '../map-skip';
import { readWork } from './state';
import { routeTurn } from './orchestrate';

export type IdeasWhy = 'asked' | 'shape' | 'exploring' | 'answers' | 'none';

/** A map, or the whole of something, asked for in so many words. */
const MAP_ASK =
  /\b(?:mind[- ]?maps?|concept[- ]maps?|logic\s+map|map\s+(?:(?:this|it|them|that|everything)\s+)?out|(?:the\s+)?(?:big|whole|bigger)\s+picture|how\s+(?:do|does)\s+[^?]{3,80}?\s+(?:all\s+)?(?:fit|connect|relate|tie|link)\s+(?:together|to\s+each\s+other|up)|how\s+(?:are|is)\s+[^?]{3,80}?\s+(?:connected|related|linked))\b/i;

/** Thinking something through, said in the words people use for it. */
const EXPLORING =
  /\b(?:what\s+if|brainstorm\w*|ideas?\s+(?:for|about|on)|explor(?:e|ing)|pros\s+and\s+cons|trade-?offs?|(?:i'?m|i\s+am)\s+(?:trying\s+to\s+(?:figure|work|decide|understand\s+why)|torn|not\s+sure\s+(?:whether|if|how|what)|thinking\s+(?:about|through|of))|on\s+the\s+other\s+hand|my\s+(?:argument|thesis|theory|hypothesis|plan|idea)|(?:an?|my|the)\s+essay|argue|(?:for|against)\s+the\s+motion|devil'?s\s+advocate|how\s+might|what\s+would\s+happen|is\s+it\s+(?:worth|better|wise|ethical)|which\s+(?:is|would\s+be)\s+better)\b/i;

/** The kinds of turn that are thinking something through (lib/runtime/state.ts readWork). */
const THINKING = new Set(['judgment', 'research']);

/** What each thing said was read as: read once, however often the view is drawn. */
const read = new Map<string, IdeasWhy>();

/** One thing the person said: why it wants the ideas drawn, if it does. */
export function ideasWhyOf(text: string): IdeasWhy {
  const t = (text ?? '').trim();
  const seen = read.get(t);
  if (seen) return seen;
  const why = whyOf(t);
  if (read.size > 400) read.clear();
  read.set(t, why);
  return why;
}

function whyOf(t: string): IdeasWhy {
  if (!t || isAcknowledgement(t)) return 'none';
  if (MAP_ASK.test(t)) return 'asked';
  const route = routeTurn({ text: t });
  if (route.intent === 'structure' || route.diagram) return 'asked';
  if (route.draw) return 'shape';
  if (EXPLORING.test(t)) return 'exploring';
  const work = readWork(t, readSignals(t), route.intent, false);
  if (THINKING.has(work)) return 'exploring';
  // their own thinking, said at length (a paragraph, not "hmm"), is ideas to see
  if (work === 'reflection' && t.split(/\s+/).length >= 18) return 'exploring';
  return 'answers';
}

/**
 * Whether a line of thinking's ideas are drawn across the Everything view, and why. `said` is what the person said, in
 * order. Any turn that asks for the map, needs it or explores is enough: the conversation has become one of ideas,
 * and it stays one.
 */
export function ideasWanted(said: readonly string[]): { show: boolean; why: IdeasWhy } {
  let why: IdeasWhy = 'none';
  for (const text of said) {
    const w = ideasWhyOf(text);
    if (w === 'asked' || w === 'shape' || w === 'exploring') return { show: true, why: w };
    if (w === 'answers') why = 'answers';
  }
  return { show: false, why };
}
