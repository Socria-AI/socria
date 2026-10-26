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
// FOUR VIEWS, FOUR JOBS: Chat converses, Content is read, Artifacts are made,
// the Logic Map tracks the conversation. A view is opened by what the person
// asked for, never by what could have been shown: something is made only when
// it was asked for in words (or an offer of one was accepted), a write-up they
// asked to read and keep is filed in Content, and structure opens only when
// they ask to see it. Everything else is conversation.
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
  /** B, written: something substantial to read and keep — notes, a guide, a report — filed in Content */
  | 'reading'
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

/**
 * HOW A REQUEST BEGINS — "can you…", "please…", "build…" — so that "I want to
 * make a game" (their project) is not taken for "make me a game" (a request).
 * A greeting or a connective in front of it is not where it begins.
 */
const ASKS = String.raw`^(?:(?:hey|hi|ok(?:ay)?|so|and|also|now|great|thanks)[,!.]?\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|please\s+|now\s+|let'?s\s+|i'?d\s+like\s+you\s+to\s+|i\s+want\s+you\s+to\s+|i\s+need\s+you\s+to\s+)?`;

/**
 * Something to look at, asked to be shown: "can you show me a diagram of the
 * field?", "can I see a picture of it?". The thing is named — "show me how to
 * factor this" is an explanation, and stays in the conversation.
 */
const VISUAL_NOUN = String.raw`(?:[\w-]+\s+){0,2}(?:diagram|picture|drawing|sketch|chart|graph|plot|visual(?:i[sz]ation)?|illustration|simulation|animation|3d\s+model)\b`;
const SHOW = new RegExp(String.raw`\b(?:show|give)\s+(?:me|us)\s+(?:a|an|the|some)\s+${VISUAL_NOUN}|\bcan\s+(?:i|we)\s+see\s+(?:a|an|the|this|that)\s+${VISUAL_NOUN}`, 'i');

/**
 * Something to make and use, asked for in words: "build a football simulator
 * so I can learn by playing", "make me a mortgage calculator", "create an
 * interactive model of the heart". A thing is named — "make a decision",
 * "build a habit" and "create a plan of attack" are not artifacts.
 */
const MAKE_VERB = String.raw`(?:build|make|create|generate|code|program|design|set\s+up|put\s+together)`;
const MAKE_NOUN = String.raw`(?:an?|the|my|our|some|one)?\s*(?:(?:[\w'-]+)\s+){0,4}?(?:simulator|simulation|game|app|application|prototype|demo|widget|calculator|dashboard|tracker|visuali[sz]ation|interactive(?:\s+\w+)?|animation|diagram|chart|graph|plot|3d\s+model|model\s+of)\b`;
const MAKE_THING = new RegExp(String.raw`${ASKS}${MAKE_VERB}\s+(?:me\s+|us\s+)?${MAKE_NOUN}|\b${MAKE_VERB}\s+(?:me|us)\s+${MAKE_NOUN}`, 'i');

/**
 * An offer of something to make, in the reply before this turn — "I can build
 * you a simulator in Artifacts if you'd like" — and a yes to it. Saying yes is
 * asking: the offer named the thing, the person accepted it.
 */
const OFFERED = /\b(?:i\s+can|i\s+could|want\s+me\s+to|shall\s+i|should\s+i|would\s+you\s+like\s+me\s+to|happy\s+to)\s+(?:build|make|draw|create|simulate|plot|sketch|chart|set\s+up|put\s+together)\b[^.?!\n]{0,90}(?:artifacts?|simulat\w*|diagram|chart|graph|plot|picture|calculator|model|game|visual\w*)/i;
/** Only a yes — "yes please", "sure, go ahead", "can I see it?" — not a yes with a new question after it. */
const YES = /^\s*(?:(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please(?:\s+do)?|go\s+(?:for\s+it|ahead)|do\s+it|let'?s\s+(?:do\s+it|see\s+it|try\s+it|go)|build\s+it|make\s+it|draw\s+it|show\s+(?:it|me)(?:\s+it)?|can\s+(?:i|we)\s+see\s+it|that\s+would\s+(?:help|be\s+(?:great|nice|good))|sounds\s+(?:good|great)|i'?d\s+(?:like|love)\s+that|absolutely|definitely|why\s+not|thanks|thank\s+you)[\s,.!?]*)+$/i;

/**
 * Something substantial to read and keep, asked for by what it is: "write me
 * detailed study notes on the causes of World War One", "put together a guide
 * to the rules", "a full write-up of what we found". Filed in Content: read
 * there, with the conversation pointing to it. A short answer, a summary in a
 * line, an email or their own essay are not this — the first two are
 * conversation, the last two are writing (practical, or theirs).
 */
const READ_VERB = String.raw`(?:write|draft|prepare|compile|put\s+together|produce|make|create|give)`;
const READ_NOUN = String.raw`(?:an?\s+|some\s+|the\s+)?(?:(?:detailed|full|thorough|comprehensive|in-?depth|complete|proper|longer|long-?form|structured|organi[sz]ed|printable|one-?page|reference)\s+){0,3}(?:study\s+notes|revision\s+notes|notes\s+(?:on|about|for|covering)|study\s+guide|guide\s+(?:to|on|for)|report\s+(?:on|about)|write-?up|explainer|primer|briefing|handout|cheat\s*sheet|reference\s+(?:sheet|guide|page)|fact\s*sheet|reading\s+notes|summary\s+(?:document|of\s+everything)|overview\s+document|white\s*paper|literature\s+review)\b`;
const READING = new RegExp(
  String.raw`${ASKS}${READ_VERB}\s+(?:me\s+|us\s+)?${READ_NOUN}|\b${READ_VERB}\s+(?:me|us)\s+${READ_NOUN}|${ASKS}(?:${READ_VERB}\s+(?:me\s+|us\s+)?)?(?:an?\s+)?(?:detailed|in-?depth|comprehensive|thorough|full)\s+(?:written\s+)?(?:explanation|breakdown|write-?up|overview|summary)\s+(?:of|on|about)\b`,
  'i'
);

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
  /** Socria's reply before this turn (lib/map-skip.ts lastReplyIn): a yes to what it offered to make is a request */
  lastReply?: string | null;
}

export interface TurnRoute {
  intent: Intent;
  /** content-free, for the trace and the tests */
  reasons: string[];
  /** which view this turn reveals; null keeps the one they are on */
  reveal: { view: Viewport; beside: 'chat' | null } | null;
}

/**
 * "Can you put that in a table?" is a table in the reply, not the Logic Map's
 * matrix: the map's comparison opens only when the map, a matrix or their
 * options are what they named. The browser's own lens shortcut asks this too,
 * so a table of the answer is never taken for the map.
 */
export function tableInReply(text: string): boolean {
  const t = clean(text ?? '');
  return readViewRequest(t)?.lens === 'matrix' && !/\b(?:matrix|map|logic|options?|criteria)\b/i.test(t);
}

/** Alex's rules A–D, read from the turn. */
export function routeTurn(t: TurnInput): TurnRoute {
  const text = clean(t.text ?? '');
  const reasons: string[] = [];
  if (t.command) return { intent: 'command', reasons: ['command'], reveal: null };

  // D before C: "map out the causes of inflation" is a structure even though
  // it names a thing that could be drawn.
  const view = readViewRequest(text);
  if (STRUCTURE.test(text) || (view && MAP_LENSES.has(view.lens) && !tableInReply(text))) {
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
    (SHOW.test(text) && 'visual:show') ||
    (MAKE_THING.test(text) && 'visual:make') ||
    // a yes to what the last reply offered to make
    (t.lastReply && OFFERED.test(t.lastReply) && YES.test(text) && 'visual:accepted') ||
    null;
  if (visual) {
    reasons.push(visual);
    return { intent: 'visual', reasons, reveal: { view: 'artifacts', beside: 'chat' } };
  }

  // Something substantial to read and keep: written into Content, the screen stays where it is.
  if (READING.test(text)) {
    reasons.push('reading:write-up');
    return { intent: 'reading', reasons, reveal: null };
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

/**
 * Whether the words could be asking for a write-up — a cheap first look, for
 * readers of a whole conversation (lib/logos5/content.ts): routeTurn decides,
 * since a rule before it may claim the turn, but it reads every display a
 * request could name and costs milliseconds, so it is asked only of these.
 */
export function mayAskToRead(text: string): boolean {
  return READING.test(clean(text ?? ''));
}

/**
 * Whether this turn asked for something to look at (rule C) — the reading the
 * map pass holds a picture to: drawn when asked, or when an offer of one was
 * accepted; never because it could have been.
 */
export function askedToSee(text: string, lastReply?: string | null): boolean {
  return routeTurn({ text, lastReply }).intent === 'visual';
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
