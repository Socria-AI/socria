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

import { offeredKinds, norm } from './display-base';
import { numberLineFromWords } from './display-numberline';

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
  /** asked for by what the person wants (a kind's `intents`), not by its name */
  intent?: boolean;
}

interface Word {
  word: string;
  kind: string;
  view?: string;
}

/** Every word every display kind answers to, longest first so "comparison table" wins over "table". */
function vocabulary(): Word[] {
  const out: Word[] = [];
  for (const m of offeredKinds()) {
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
  if (!t) return null;
  if (/\b(?:don't|do\s+not|dont|no\s+need\s+to|never|stop)\s+(?:\w+\s+){0,2}?(?:make|create|build|draw|generate|turn|convert|open)\b/.test(t)) return null;
  const words = vocabulary();
  if (!words.length) return null;
  // WHAT THEY WANT, NOT WHAT THEY CALL IT: "should I take the job or stay?" wants a Crossroads, even
  // phrased as a question — unless the words name a display, when they are about that display
  const intended = byIntent(t, words);
  if (intended) return intended;
  if (isQuestionAbout(t)) return null;

  // "Visualize the interval x > 3", "show -2 <= x < 5 on a number line": a set of numbers, on a line
  const lined = numberLineRequest(text);
  if (lined) return lined;

  // "Chart my spending: rent 1200, food 400", "plot my revenue: Jan 10, Feb 12", "pie chart rent
  // 1200 food 400": the verb IS the display, or the display is named first and the numbers follow
  const charted = chartRequest(text, words);
  if (charted) return charted;

  // "quiz me on this map", "test me on the diagram": practice over what is already here —
  // never a quiz written about a topic (display-make.ts makes it from a diagram or the map)
  if (/\b(?:quiz|test)\s+(?:me|us)\b/.test(t) && words.some((w) => w.kind === 'exercise')) {
    return { kind: 'exercise', kinds: ['exercise'], fromMap: new RegExp(String.raw`\b${MAPPED}\b`).test(t), noun: 'quiz' };
  }

  // THE REQUEST, NOT WHAT FOLLOWS IT: in "make a mind map of my project: design, budget, team,
  // timeline" the list after the colon is the content, and "design … timeline" in it asks for nothing
  const cut = text.search(/[:\n]/);
  const head = cut > 0 ? norm(text.slice(0, cut)) : t;
  // every display named by a making or turning verb; the one named FIRST is the one asked for
  // (at the same place, the longer name: "comparison table" over "table")
  let best: { w: Word; at: number; turned: boolean } | null = null;
  for (const w of words) {
    const noun = esc(w.word);
    // TURN: "turn this map into a checklist", "convert my notes to a timeline"
    const turned = new RegExp(String.raw`\b${TURN}\s+${THERE}\s+(?:[a-z0-9]+\s+){0,3}?(?:into|to|as)\s+(?:a|an|the|one|some)?\s*(?:[a-z0-9]+\s+){0,2}?${noun}\b`).exec(head);
    // MAKE: "make me a study plan", "create a comparison table of …", "a quiz from my map"
    const made = new RegExp(String.raw`\b${MAKE}\b${BETWEEN}\s+${noun}\b`).exec(head);
    const hit = turned ?? made;
    if (!hit) continue;
    const at = hit.index + hit[0].length;
    if (!best || at < best.at || (at === best.at && w.word.length > best.w.word.length)) best = { w, at, turned: !!turned };
  }
  if (best) {
    const { w, turned } = best;
    const noun = esc(w.word);
    // "turn this map into a mind map": the thinking map already IS one — that restructures the map
    if (turned && MAP_ITSELF.has(w.word)) return null;
    const named = new RegExp(String.raw`\b${TURN}\s+${MAPPED}\b`).test(t);
    const fromMap = turned || new RegExp(String.raw`\b${noun}\b(?:\s+[a-z0-9]+){0,2}?\s+(?:from|out\s+of|based\s+on|using)\s+${MAPPED}\b`).test(t);
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
  return compareRequest(text) ?? namedFirst(text, words);
}

/**
 * A set of numbers to see on a line: a number line named, or an interval,
 * inequality or solution set asked to be shown — and in the words, a set in
 * one variable that reads whole. "Graph y > 2x + 1" is a region of the plane,
 * and "solve 2x + 1 > 7" asks for working, not a picture: neither is one.
 */
function numberLineRequest(text: string): DisplayRequest | null {
  const low = text.toLowerCase();
  const named = /\bnumber\s?line\b/.test(low);
  const shown =
    /^(?:(?:please|pls|ok|okay|now|so)\s+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:visuali[sz]e|show(?:\s+me)?|draw|graph|plot|shade|sketch|illustrate|picture)\b/.test(low) &&
    (/\b(?:interval|intervals|inequalit(?:y|ies)|solution set|the set|range)\b/.test(low) || /^\S+(?:\s+me)?\s+[a-z]\s*(?:<|>|≤|≥|<=|>=|≠|!=)/.test(low) || /^\S+(?:\s+me)?\s+[\[(|]/.test(low));
  if (!named && !shown) return null;
  if (/\bsolve\b/.test(low) && !named) return null;
  if (!numberLineFromWords(text) && !named) return null;
  return { kind: 'numberline', kinds: ['numberline'], view: 'line', fromMap: false, noun: 'number line' };
}

/** The shapes the thinking map takes itself: turning the map into one restructures it, it does not copy it. */
const MAP_ITSELF = new Set(['mind map', 'mindmap', 'concept map']);

/**
 * A display named first: "checklist: milk, eggs, bread", "venn diagram of
 * cats and dogs", "flowchart: wake up -> shower". Only a name that a kind
 * opens on (one with a view), followed by what it is of or a colon — so
 * "Table 3 shows…" and "a plan would help" are not requests.
 */
function namedFirst(text: string, words: Word[]): DisplayRequest | null {
  const low = text.toLowerCase().replace(/[’']/g, '').trim();
  for (const w of words) {
    if (!w.view) continue;
    const rx = new RegExp(String.raw`^(?:(?:please|pls|ok|okay|now|so)\s+)*(?:(?:a|an|the|my|our)\s+)?(?:(?:quick|simple|new|blank)\s+)?${esc(w.word)}\s*(?::|\n|$|(?:of|for|about|showing|with|comparing|between|from)\b)`);
    if (!rx.test(low)) continue;
    const kinds = [...new Set(words.filter((x) => x.word === w.word).map((x) => x.kind))];
    if (kinds.length !== 1) return null;
    return { kind: kinds[0], kinds, view: w.view, fromMap: new RegExp(String.raw`\b${MAPPED}\b`).test(norm(text)), noun: w.word };
  }
  return null;
}

/**
 * "Compare the iPhone and the Pixel in a table", "compare A, B and C on
 * price, camera and battery": a comparison asked for by its verb, with the
 * shape named or the criteria given. A bare "compare capitalism and
 * socialism" is a conversation, and stays one.
 */
function compareRequest(text: string): DisplayRequest | null {
  const low = text.toLowerCase().trim();
  if (!/^(?:(?:please|pls|ok|okay|now|so)\s+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?compare\s+\S/.test(low)) return null;
  const shaped = /\b(?:in|as|into|with|using)\s+(?:a\s+|an\s+)?(?:table|chart|grid|matrix|scorecard|spreadsheet)\b|\bside\s+by\s+side\b|\b(?:decision|scoring|comparison)\s+(?:matrix|table)\b/.test(low);
  const criteria = /\s(?:on|across|in terms of|by)\s+[^,.?!]+,/.test(low) || /\bcriteria\b/.test(low);
  if (!shaped && !criteria) return null;
  return { kind: 'compare', kinds: ['compare'], view: 'matrix', fromMap: false, noun: 'comparison' };
}

/** The kind whose `intents` the words match — none when they also name a display ("should I use a venn or a table?"). */
function byIntent(t: string, words: Word[]): DisplayRequest | null {
  if (words.some((w) => new RegExp(String.raw`\b${esc(w.word)}\b`).test(t) && !offeredKinds().some((m) => m.intents && m.kind === w.kind))) return null;
  for (const m of offeredKinds()) {
    if (m.intents?.some((rx) => rx.test(t))) return { kind: m.kind, kinds: [m.kind], fromMap: false, noun: m.noun, intent: true };
  }
  return null;
}

// ── a chart asked for by its verb ────────────────────────────────────

/** Mathematics, not a table: "graph y = x²", "plot sin x", "visualize x > 3" stay with the plotting surface. */
const MATHS = /[<>≤≥≠^²³√∫]|!=|\|\s*[a-z]\s*(?:[+\-−]\s*\d+(?:\.\d+)?\s*)?\||\b[a-z]\s*\(\s*[a-z]\s*\)\s*=|(?:^|[\s:])[a-z]\s*=\s*[-\d(a-z]|\b(?:sin|cos|tan|log|ln|sqrt|exp|derivative|integral|function|equation|curve|parabola|interval|inequality)\b/i;
/** What a person keeps numbers about — "plot my revenue", "chart our sales" are tables even before the numbers come. */
const RECORDS =
  /\b(?:spending|expenses?|budget|income|revenue|sales|profits?|costs?|savings|bills|prices|grades?|marks|scores|results|weight|steps|sleep|hours|attendance|signups|visitors|followers|downloads|orders|donations|calories|workouts?|readings|measurements|survey|votes|population of my)\b/i;
const CHART_VERB = /^(?:(?:please|pls|ok|okay|now|so|hey)\s+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(chart|plot|graph|visuali[sz]e|tabulate)\b/i;

/**
 * A chart asked for by the verb ("chart my spending: rent 1200…") or named
 * first ("pie chart rent 1200 food 400"), over numbers the person wrote — or
 * over their own records with none yet ("plot my revenue over six months"),
 * which opens empty. Never mathematics: a function, an equation or an
 * inequality is the plotting surface's.
 */
function chartRequest(text: string, words: Word[]): DisplayRequest | null {
  if (!words.some((w) => w.kind === 'data')) return null;
  const raw = text.trim().slice(0, 600);
  if (MATHS.test(raw)) return null;
  const t = norm(raw);
  const verb = CHART_VERB.exec(raw);
  const named = words.find((w) => w.kind === 'data' && w.view && new RegExp(String.raw`^(?:(?:please|pls|a|an|quick|simple)\s+)*${esc(w.word)}\b`).test(t));
  if (!verb && !named) return null;
  const numbers = (raw.match(/(?<![\p{L}\p{N}.])\d/gu) ?? []).length;
  // their own records, or records kept over time: "plot my revenue", "plot revenue over six months"
  const own = /\b(?:my|our|monthly|weekly|daily|yearly|annual)\b|\b(?:over|for|by|per|each|every|last|past|this)\s+(?:the\s+)?(?:\w+\s+)?(?:months?|weeks?|days?|years?|quarters?)\b/i;
  const records = RECORDS.test(raw) && (own.test(raw) || !!named);
  if (!numbers && !records) return null;
  // the view the words name, anywhere in the request: "chart my spending as a pie"
  const viewed = words.find((w) => w.kind === 'data' && w.view && new RegExp(String.raw`\b${esc(w.word)}\b`).test(t)) ?? (/\bas\s+(?:a\s+)?pie\b/.test(t) ? { word: 'pie chart', kind: 'data', view: 'pie' } : null);
  return { kind: 'data', kinds: ['data'], ...(viewed?.view ? { view: viewed.view } : {}), fromMap: false, noun: viewed?.word ?? 'chart' };
}

/** Words the map has a shape for — said "as a …", they restructure the map; anything else is a display's alone. */
const MAP_SHAPES = new Set(['plan', 'roadmap', 'project plan', 'schedule', 'checklist', 'timeline', 'chronology', 'comparison', 'table', 'matrix', 'argument', 'decision', 'pros and cons', 'concept map', 'mind map']);

function displayOnly(word: string): boolean {
  return !MAP_SHAPES.has(word);
}
