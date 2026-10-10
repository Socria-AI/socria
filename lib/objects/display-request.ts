// lib/objects/display-request.ts — did the person ask for a display, and which?
//
// Read from their own words before any model is asked, the way the map reads
// a shape someone states (lib/representation.ts statedBuilding). There are two
// ways of asking for a display, and they are kept apart because they are
// answered differently:
//
//   MAKE   "make me a study plan for finals", "create a comparison table of
//          the three phones" — a new artifact, drafted from the conversation
//          by the proposal pass (display-propose.ts) and checked by the kind;
//   TURN   "turn this map into a checklist", "make a quiz from my map" — a new
//          artifact made FROM what is already on the map, kept to its words.
//
// Restructuring the THINKING ("show this as a timeline", "this is really a
// decision") stays the map's: statedBuilding answers it and this reader stands
// aside — unless the noun is one only a display can be (a kanban, a worksheet,
// a venn diagram), when the person plainly wants the artifact.
//
// The vocabulary is not written here: every display kind declares the words
// people use for it (DisplayMeta.called), so a new kind is found without this
// file learning its name. And it is conservative — it answers only where a
// making verb governs one of those words, and never for a question about one
// ("how do I make a gantt chart in Excel?"). Everything else is left to the
// extractor's reading of the turn (TurnAsk artifact "display").
//
// PURE.

import { displayKinds, norm } from './display-base';

export interface DisplayRequest {
  /** the kind asked for, or null when the word fits several (a "table") — the pass chooses among `kinds` */
  kind: string | null;
  kinds: string[];
  /** the view the word opens it on — "kanban" is a plan shown as a board */
  view?: string;
  /** made from what is already on the map rather than drafted from the conversation */
  fromMap: boolean;
  /** the words that named it, as they were said */
  noun: string;
}

interface Word {
  word: string;
  kind: string;
  view?: string;
}

/** Every word every display kind answers to, longest first so "comparison table" wins over "table". */
function vocabulary(): Word[] {
  const out: Word[] = [];
  for (const m of displayKinds()) {
    for (const c of m.called ?? []) for (const w of c.words) out.push({ word: norm(w), kind: m.kind, ...(c.view ? { view: c.view } : {}) });
  }
  return out.sort((a, b) => b.word.length - a.word.length);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');

/** Verbs that make something. "show" makes only with "me" — "show this as …" is the map's. */
const MAKE = String.raw`(?:make|create|build|draw|generate|draft|sketch|produce|design|prepare|set\s+up|put\s+together|lay\s+out|map\s+out|plan\s+out|write\s+up|start|give\s+(?:me|us)|show\s+me|i\s+(?:need|want|would\s+like)|id\s+like|can\s+i\s+(?:get|have)|help\s+me\s+(?:make|build|plan|organi[sz]e|create|set\s+up))`;
const TURN = String.raw`(?:turn|convert|transform|change|reorgani[sz]e|organi[sz]e|put|rewrite|recast)`;
/** what is already on the map, named as such */
const MAPPED = String.raw`(?:this|the|my|our)\s+(?:map|concept\s+map|mind\s+map|thinking\s+map|ideas|notes|nodes|brainstorm)`;
/** …or pointed at */
const THERE = String.raw`(?:${MAPPED}|this|that|it|these|them)`;
/** the words between a verb and its noun: never an infinitive ("I want TO plan my week" asks for help, not for a plan) */
const BETWEEN = String.raw`(?:\s+(?!to\b|not\b)[a-z0-9]+){0,5}?`;

/** A question ABOUT a display is not a request for one. */
function isQuestionAbout(t: string): boolean {
  if (/^(?:can|could|would|will)\s+you\b/.test(t)) return false;
  if (/^(?:please\b|pls\b)/.test(t)) return false;
  return /^(?:how|what|why|when|where|who|which|whose|is|are|was|were|does|did|do\s+(?:i|you|we)|should|shall|isnt|arent)\b/.test(t);
}

/**
 * The display a message plainly asks for, or null. `stated` is the map's own
 * reading of a restructure (statedBuilding) — when it answered, a word the map
 * also has a shape for is left to the map.
 */
export function readDisplayRequest(text: unknown, opts: { stated?: string | null } = {}): DisplayRequest | null {
  if (typeof text !== 'string') return null;
  const t = norm(text).slice(0, 400);
  if (!t || isQuestionAbout(t)) return null;
  if (/\b(?:don't|do\s+not|dont|no\s+need\s+to|never|stop)\s+(?:\w+\s+){0,2}?(?:make|create|build|draw|generate|turn|convert)\b/.test(t)) return null;
  const words = vocabulary();
  if (!words.length) return null;

  // "quiz me on this map", "test me on the diagram": practice over what is already here —
  // never a quiz written about a topic (display-make.ts makes it from a diagram or the map)
  if (/\b(?:quiz|test)\s+(?:me|us)\b/.test(t) && words.some((w) => w.kind === 'exercise')) {
    return { kind: 'exercise', kinds: ['exercise'], fromMap: new RegExp(String.raw`\b${MAPPED}\b`).test(t), noun: 'quiz' };
  }

  for (const w of words) {
    const noun = esc(w.word);
    // TURN: "turn this map into a checklist", "convert my notes to a timeline"
    const turned = new RegExp(String.raw`\b${TURN}\s+${THERE}\s+(?:[a-z0-9]+\s+){0,3}?(?:into|to|as)\s+(?:a|an|the|one|some)?\s*(?:[a-z0-9]+\s+){0,2}?${noun}\b`).exec(t);
    // MAKE: "make me a study plan", "create a comparison table of …", "a quiz from my map"
    const made = new RegExp(String.raw`\b${MAKE}\b${BETWEEN}\s+${noun}\b`).exec(t);
    if (!turned && !made) continue;
    const named = new RegExp(String.raw`\b${TURN}\s+${MAPPED}\b`).test(t);
    const fromMap = !!turned || new RegExp(String.raw`\b${noun}\b(?:\s+[a-z0-9]+){0,2}?\s+(?:from|out\s+of|based\s+on|using)\s+${MAPPED}\b`).test(t);
    // "turn this into a timeline" restructures the map's own thinking, as it always has — unless
    // the person named the map as the material, or the word is one only a display can be
    if (turned && !named && opts.stated && !displayOnly(w.word)) return null;
    const same = words.filter((x) => x.word === w.word);
    const kinds = [...new Set(same.map((x) => x.kind))];
    return {
      kind: kinds.length === 1 ? kinds[0] : null,
      kinds,
      ...(kinds.length === 1 && w.view ? { view: w.view } : {}),
      fromMap,
      noun: w.word,
    };
  }
  return null;
}

/** Words the map has a shape for — said "as a …", they restructure the map; anything else is a display's alone. */
const MAP_SHAPES = new Set(['plan', 'roadmap', 'project plan', 'schedule', 'checklist', 'timeline', 'chronology', 'comparison', 'table', 'matrix', 'argument', 'decision', 'pros and cons', 'concept map', 'mind map']);

function displayOnly(word: string): boolean {
  return !MAP_SHAPES.has(word);
}
