// lib/runtime/orchestrate.ts — INFERENCE ORCHESTRATION.
//
// One decision per turn about how much machinery it deserves, made before any
// model is asked anything, by the same function on the server and in the
// browser so the view that opens and the work that runs cannot disagree:
//
//   fast      no model at all — a map edit, a scene or object command, a view
//             asked for by name. These were always decided in code (send());
//             here they are named so they are counted.
//   standard  one reply. No map pass, no second memory store.
//   verified  the reply with what a claim needs: computation (lib/accuracy),
//             current sources (the web gate), the person's documents, a
//             re-check after a pushback, or the engine's pass for something to
//             be built or a structure to be drawn.
//
// And which view the turn reveals — Alex Tran's rules, in order:
//   A  conversation          stays in Chat; the Logic Map is never opened for it
//   B  documents arrive      Content fills in the background; Chat stays
//   C  something to look at  Artifacts opens, beside the conversation
//   D  structure asked for   the Logic Map opens
//
// Pure. No model, no network, no clock (time arrives in the input).

import { constructAsk } from '../cognition/assist';
import { readViewRequest } from '../view-request';
import { wantedSimulation } from '../model/wants';
import { readDisplayRequest } from '../objects/display-request';
import { isAcknowledgement } from '../map-skip';
import { LOGOS_MAP_MODEL, LOGOS_MODEL } from '../logos';

export const VIEWPORTS = ['chat', 'content', 'artifacts', 'logic_map'] as const;
export type Viewport = (typeof VIEWPORTS)[number];

export type Path = 'fast' | 'standard' | 'verified';

export type Intent =
  /** A: talk — a question, a thought, a follow-up */
  | 'conversation'
  /** B: material arrived to be read */
  | 'ingest'
  /** C: something to look at or work with — a plot, a model, a chart, a plan, flashcards */
  | 'visual'
  /** D: the structure of their reasoning, explicitly */
  | 'structure'
  /** decided in code, no model: a map edit, a scene command, a view by name */
  | 'command';

/** Lenses of the Thinking Map: asking for one is asking for structure. */
const MAP_LENSES = new Set(['structure', 'graph', 'flow', 'timeline', 'tensions', 'evidence', 'matrix']);

const clean = (t: string) =>
  t
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * RULE D, READ FROM THEIR WORDS: an argument audited, reasoning taken apart, a
 * causal or dependency map, a system drawn as a tree. Deliberately explicit —
 * a question ABOUT an argument is conversation; asking to SEE its structure is
 * this.
 */
const STRUCTURE = new RegExp(
  [
    String.raw`\b(?:logic|argument|concept|mind|causal|dependency|system|decision|reasoning|thinking)\s*maps?\b`,
    String.raw`\bmindmap\b`,
    String.raw`\bmap\s+(?:it|this|that|these|them|everything)?\s*(?:out)\b`,
    String.raw`\bmap\s+(?:out\s+)?(?:my|the|this|our)\s+(?:argument|reasoning|logic|thinking|ideas|claims|assumptions|options|decision|system|dependencies|causes|structure)\b`,
    String.raw`\b(?:audit|stress[- ]test|deconstruct|dissect|break\s+down|pick\s+apart|tear\s+apart)\s+(?:my|the|this|that|our|his|her|their)\s+(?:argument|reasoning|logic|case|thesis|claim|claims|position|proof)\b`,
    String.raw`\b(?:logical|structural|argument)\s+(?:audit|analysis|deconstruction|breakdown|structure)\b`,
    String.raw`\b(?:causal|dependency|dependencies)\s+(?:chain|graph|diagram|structure|mapping|tree)\b`,
    String.raw`\b(?:node|decision|argument|issue|logic)\s+tree\b`,
    String.raw`\bwhat\s+(?:does|do)\s+(?:this|that|it|(?:my|the|this|our)(?:\s+\w+){1,3})\s+(?:rest|rests|depend|depends|hinge|hinges)\s+on\b`,
    String.raw`\b(?:show|visuali[sz]e|draw|lay\s+out)\s+(?:me\s+)?(?:the|my|this)\s+(?:structure|logic|reasoning|argument)\b`,
    String.raw`\b(?:open|show|go\s+to|switch\s+to)\s+(?:the\s+)?logic\s+map\b`,
  ].join('|'),
  'i'
);

/** Active recall, asked for: a practice set is an artifact. */
const PRACTICE = /\b(?:flash\s*cards?|quiz\s+me|test\s+me|practice\s+(?:questions?|problems?|set|test)|make\s+(?:me\s+)?(?:a\s+)?quiz|spaced\s+repetition)\b/i;

/** Something to look at, asked for by a plain verb. Conservative: a question about a chart is not a request for one. */
const VISUAL = /^(?:(?:can|could|would)\s+you\s+|please\s+|now\s+|let'?s\s+)?(?:plot|graph|chart|draw|sketch|diagram|visuali[sz]e|animate|simulate)\b/i;

export interface TurnInput {
  /** what they wrote */
  text: string;
  /** what came with it */
  attachments?: readonly { kind: string }[];
  /** the view they are on */
  view?: Viewport;
  /** the browser already handled it without a model (map edit, scene, object step) */
  command?: boolean;
  /** how many nodes the Thinking Map holds */
  mapNodes?: number;
}

export interface TurnRoute {
  intent: Intent;
  /** content-free, for the trace and the tests */
  reasons: string[];
  /** which view this turn reveals; null keeps the one they are on */
  reveal: { view: Viewport; beside: 'chat' | null } | null;
}

/** Alex's rules A–D, read from the turn. */
export function routeTurn(t: TurnInput): TurnRoute {
  const text = clean(t.text ?? '');
  const reasons: string[] = [];
  if (t.command) return { intent: 'command', reasons: ['command'], reveal: null };

  // D before C: "map out the causes of inflation" is a structure even though
  // it names a thing that could be drawn.
  const view = readViewRequest(text);
  if (STRUCTURE.test(text) || (view && MAP_LENSES.has(view.lens))) {
    reasons.push(view && MAP_LENSES.has(view.lens) ? `structure:lens:${view.lens}` : 'structure:asked');
    // the reply is read beside the map it draws (on a phone, the map alone)
    return { intent: 'structure', reasons, reveal: { view: 'logic_map', beside: 'chat' } };
  }

  const sim = wantedSimulation(text);
  const display = readDisplayRequest(text);
  const construct = constructAsk(text);
  const visual =
    (sim && `visual:simulation`) ||
    (construct && `visual:${construct}`) ||
    // a display asked for BY NAME ("a decision matrix", "a study plan") — one
    // matched only by what they want ("should I take the job or stay?" fits a
    // crossroads display) is a question, and stays in the conversation
    (display && !display.intent && `visual:display:${display.kind ?? 'any'}`) ||
    (view?.lens === 'plot' && 'visual:plot') ||
    (PRACTICE.test(text) && 'visual:practice') ||
    (VISUAL.test(text) && 'visual:asked') ||
    null;
  if (visual) {
    reasons.push(visual);
    return { intent: 'visual', reasons, reveal: { view: 'artifacts', beside: 'chat' } };
  }

  const docs = (t.attachments ?? []).filter((a) => a?.kind === 'doc' || a?.kind === 'note').length;
  if (docs) {
    reasons.push(`ingest:${docs}`);
    // Rule B: Content fills in the background; the conversation stays where it is.
    return { intent: 'ingest', reasons, reveal: null };
  }

  reasons.push('conversation');
  return { intent: 'conversation', reasons, reveal: null };
}

// ── which work runs ──────────────────────────────────────────────────

/**
 * THE MAP PASS, WHEN IT IS WORTH ITS COST.
 *
 * The extractor reads ~19k tokens of instructions and the conversation, and
 * used to run after every turn. It runs now when the turn asked for something
 * to be built or a structure to be drawn; while the Logic Map is the view they
 * are looking at (it is live while it is looked at); and in the background on
 * a light cadence — once a line of thinking has a few substantive turns, then
 * every few more — so the Universal Map, search and anything that reads the
 * stored map (the 5-node rewards challenge among them) still see maps.
 */
export const MAP_FIRST_AFTER = 3;
export const MAP_EVERY = 4;

export interface MapNeedInput {
  route: TurnRoute;
  /** the view they are on when the reply arrives */
  view: Viewport;
  /** a pure acknowledgement ("ok", "thanks") with nothing before it to agree to (lib/map-skip.ts) */
  filler: boolean;
  /** substantive turns of theirs since the map was last drawn (all of them if never) */
  turnsSinceMap: number;
  /** the map has never been drawn for this line of thinking */
  neverDrawn: boolean;
  /** a deployment that wants the old behaviour: a map pass after every turn */
  everyTurn?: boolean;
}

export function needsMap(i: MapNeedInput): { map: boolean; why: string } {
  if (i.route.intent === 'command') return { map: false, why: 'command' };
  if (i.route.intent === 'structure') return { map: true, why: 'structure' };
  if (i.route.intent === 'visual') return { map: true, why: 'visual' };
  if (i.filler) return { map: false, why: 'filler' };
  if (i.everyTurn) return { map: true, why: 'every-turn' };
  if (i.view === 'logic_map') return { map: true, why: 'open' };
  if (i.neverDrawn ? i.turnsSinceMap >= MAP_FIRST_AFTER : i.turnsSinceMap >= MAP_EVERY) return { map: true, why: 'cadence' };
  return { map: false, why: 'not-needed' };
}

/** Their substantive turns after `since` (ms); every one when the map was never drawn. */
export function turnsSince(messages: readonly { role: string; content?: unknown; at?: number }[], since: number | null | undefined): number {
  let n = 0;
  for (const m of messages) {
    if (m?.role !== 'user') continue;
    if (since && typeof m.at === 'number' && m.at <= since) continue;
    if (since && typeof m.at !== 'number') continue; // an old turn with no time is older than any drawing
    const text = typeof m.content === 'string' ? m.content : '';
    if (!text.trim() || isAcknowledgement(text)) continue;
    n++;
  }
  return n;
}

/**
 * THE MEMORY WRITE, WHEN THERE IS ANYTHING TO REMEMBER.
 *
 * The Mind Graph extraction is a model call after the reply. An "ok" or a
 * "thanks" has nothing in it to keep, so it is not asked.
 */
export function memorable(text: string): boolean {
  const t = clean(text);
  return t.length >= 3 && !isAcknowledgement(t);
}

/** The path a turn took, for the trace: decided after the server knows what it checked. */
export function pathOf(r: { intent: Intent; checked: boolean }): Path {
  if (r.intent === 'command') return 'fast';
  if (r.checked || r.intent === 'visual' || r.intent === 'structure') return 'verified';
  return 'standard';
}

// ── the history window ───────────────────────────────────────────────

/**
 * WHERE THE HISTORY STARTS, IN STEPS.
 *
 * The reply used to keep the last 24 messages, so once a conversation was
 * longer than that the first message it sent changed on every turn — and the
 * provider's prompt cache, which serves only a prefix it has seen byte for
 * byte, missed the whole history every time. Now the window starts at a
 * multiple of `step` and holds between `min` and `min + step - 1` messages:
 * the same start for `step` messages at a time, so the history stays in the
 * cache, and about as much of it on average as before.
 */
export function historyStart(count: number, { min = 16, step = 16 }: { min?: number; step?: number } = {}): number {
  if (count <= min + step - 1) return 0;
  return step * Math.floor((count - min) / step);
}

// ── which model ──────────────────────────────────────────────────────

/**
 * ONE TABLE OF WHICH MODEL DOES WHAT, so a change is one line and the cost of
 * a turn can be read in one place. Each has its own environment override, read
 * at call time so it takes effect with no redeploy.
 */
export const MODEL_ROLES = {
  /** the reply — the one call an ordinary turn makes */
  reply: { env: 'OPENAI_MODEL_LOGOS', fallback: LOGOS_MODEL },
  /** the map pass and the engine's construction passes */
  map: { env: 'OPENAI_MODEL_LOGOS_MAP', fallback: LOGOS_MAP_MODEL },
  /** the Mind Graph extraction after a turn */
  memory: { env: 'OPENAI_MODEL_MIND', fallback: 'gpt-4o-mini' },
  /** a conversation's title, once */
  title: { env: 'OPENAI_MEMORY_MODEL', fallback: 'gpt-4o-mini' },
} as const;

export type ModelRole = keyof typeof MODEL_ROLES;

export function modelFor(role: ModelRole, env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}): string {
  const r = MODEL_ROLES[role];
  return (env[r.env] ?? '').trim() || r.fallback;
}
