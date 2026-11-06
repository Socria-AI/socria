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

import { quickPlot } from './plot-ask';
import { OWN_TIMELINE, TIMELINE_NAMED, ownTimeline, partsShape } from './asks';
import { constructAsk } from '../cognition/assist';
import { readViewRequest } from '../view-request';
import { wantedSimulation } from '../model/wants';
import { readDisplayRequest } from '../objects/display-request';
import { isAcknowledgement } from '../map-skip';
import { LOGOS_MAP_MODEL, LOGOS_MODEL } from '../logos';
import { normalizeTyping } from './asks';

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

/**
 * THE SHAPES A DIAGRAM CAN TAKE ON THE LOGIC MAP (Logos 5.5): each is one of
 * its grammars (lib/representation.ts GRAMMAR_IDS), so the shape asked for is
 * the shape the map is read as and the lens it opens on.
 */
export type DiagramShape = 'process' | 'cycle' | 'hierarchy' | 'concept' | 'causal' | 'parts' | 'system' | 'timeline';

/**
 * A DIAGRAM, ASKED FOR BY WHAT IT IS — a flowchart, a cycle diagram, a
 * hierarchy or an org chart, a family tree, a concept map, a cause-and-effect
 * or fishbone diagram, a labelled diagram of the parts, a block or system
 * diagram. The Logic Map draws almost anything that has parts and connections
 * (lib/logos.ts mapInstructions, THE SUBJECT, DRAWN), so these open it. A
 * picture of a field, a force or a function is not one of these: it is made
 * in Artifacts, as before; so is a Venn diagram, a display of its own.
 */
const DIAGRAM_NAMED: readonly (readonly [DiagramShape, RegExp])[] = [
  ['process', /\bflow\s*-?\s*charts?\b|\bflow\s+diagrams?\b|\bprocess\s+(?:maps?|diagrams?|flow\s*charts?)\b|\bswim\s*-?\s*lane\s+diagrams?\b|\bworkflow\s+(?:diagram|chart|map)s?\b|\bstate\s+(?:machine|transition)\s+diagrams?\b/i],
  ['cycle', /\b(?:cycle|life\s*-?\s*cycle|feedback\s+loop|loop)\s+(?:diagram|chart|map)s?\b|\bcircular\s+(?:diagram|flow\s*chart)s?\b/i],
  ['hierarchy', /\b(?:hierarchy|hierarchical|tree|taxonomy|classification|breakdown)\s+(?:diagram|chart|map)s?\b|\borg(?:ani[sz]ation(?:al)?)?\s+charts?\b|\borganogram\b|\bfamily\s+trees?\b|\bwork\s+breakdown\s+structure\b|\bphylogenetic\s+trees?\b/i],
  ['concept', /\bconcept\s+(?:diagrams?|webs?)\b|\bknowledge\s+maps?\b|\bspider\s+(?:diagram|map)s?\b/i],
  ['causal', /\bcause[- ](?:and|&)[- ]effect\s+(?:diagram|chart|map)s?\b|\bfish\s*-?\s*bone(?:\s+diagram)?s?\b|\bishikawa\b|\bcausal\s+loop\s+diagrams?\b|\broot[- ]cause\s+(?:diagram|tree|map)s?\b/i],
  ['parts', /\b(?:parts|anatomy|anatomical|components?|labell?ed)\s+diagrams?\b|\bexploded\s+view\b/i],
  ['system', /\b(?:block|system|systems|architecture|network|context)\s+diagrams?\b|\b(?:er|entity[- ]relationship)\s+diagrams?\b/i],
  ['timeline', /\btimeline\s+(?:diagram|map)s?\b/i],
];

/**
 * …or by drawing what has that shape: "draw the water cycle", "diagram the
 * stages of mitosis", "show me the hierarchy of the Catholic Church",
 * "sketch the causes of the Great Depression", "draw how a bill becomes law".
 * The thing drawn is named, and it has parts in an order, a loop or a tree —
 * "draw the field" names none of these, and is a picture.
 */
// HOW A REQUEST TO DRAW BEGINS: the opening ASKS reads below ("can you…", "please…", "I'd like you to…"), written
// out here because the readers that use it are built as the module loads — at the start of the message or of a
// sentence in it ("I have a test tomorrow. Draw the water cycle."). "What lessons can I draw from the hiring
// process?" does not begin with a request to draw, and is a question.
const DRAW_ASK = String.raw`(?:^|[.!?]\s+)(?:(?:hey|hi|ok(?:ay)?|so|and|also|now|great|thanks)[,!.]?\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|please\s+|now\s+|let'?s\s+|i'?d\s+like\s+you\s+to\s+|i\s+want\s+you\s+to\s+|i\s+need\s+you\s+to\s+)?`;
const DRAW_VERB = String.raw`${DRAW_ASK}(?:draw|diagram|sketch|map\s+out)\s+(?:me\s+|us\s+)?`;
const DRAW_THE = String.raw`(?:out\s+)?(?:for\s+(?:me|us)\s+)?(?:the\s+|a\s+|an\s+|my\s+|our\s+)?`;
const DRAWN_AS: readonly (readonly [DiagramShape, RegExp])[] = [
  ['cycle', new RegExp(String.raw`${DRAW_VERB}${DRAW_THE}(?:[\w'-]+\s+){0,3}?(?:life\s*-?\s*cycle|cycle|feedback\s+loop)s?\b`, 'i')],
  ['hierarchy', new RegExp(String.raw`${DRAW_VERB}${DRAW_THE}(?:[\w'-]+\s+){0,3}?(?:hierarchy|chain\s+of\s+command|family\s+tree|taxonomy|classification)\b`, 'i')],
  ['process', new RegExp(String.raw`${DRAW_VERB}${DRAW_THE}(?:[\w'-]+\s+){0,3}?(?:process|workflow|pipeline|stages|steps|phases|supply\s+chain|food\s+(?:chain|web))\b|${DRAW_ASK}(?:draw|diagram|map\s+out)\s+(?:me\s+|us\s+)?(?:for\s+(?:me|us)\s+)?how\s+(?:[\w'-]+\s+){1,6}?(?:works?|happens?|becomes?|forms?|is\s+(?:made|produced|formed|passed)|are\s+(?:made|produced|formed)|develops?|spreads?|flows?)\b`, 'i')],
  ['causal', new RegExp(String.raw`${DRAW_VERB}${DRAW_THE}(?:(?:main|root|key|underlying|likely)\s+)?(?:causes|effects|consequences)\s+(?:of|and)\b`, 'i')],
  ['parts', new RegExp(String.raw`${DRAW_VERB}${DRAW_THE}(?:main\s+)?(?:parts|anatomy|components|layers|organelles)\s+(?:of|in)\b`, 'i')],
];

/** A diagram of something with that shape, named: "a diagram of the water cycle", "a map of the causes of the war". */
const DIAGRAM_OF = new RegExp(
  String.raw`\b(?:diagram|map|illustration|picture)\s+(?:of|showing|for|explaining|that\s+shows|to\s+show)\s+(?:me\s+)?(?:the\s+|a\s+|an\s+)?(?:[\w'-]+\s+){0,4}?(?:(life\s*-?\s*cycle|cycle|feedback\s+loop)|(process|workflow|pipeline|stages|steps|phases|supply\s+chain|food\s+(?:chain|web))|(hierarchy|chain\s+of\s+command|family\s+tree|taxonomy|classification|organi[sz]ation(?:al)?\s+structure)|(causes|effects|consequences)|(parts|anatomy|components|layers|organelles))\b`,
  'i'
);
const OF_SHAPES: readonly DiagramShape[] = ['cycle', 'process', 'hierarchy', 'causal', 'parts'];
/** …or a diagram of how something works: "a diagram of how a bill becomes law". */
const DIAGRAM_OF_HOW = /\b(?:diagram|map)\s+(?:of|showing|explaining|that\s+shows|to\s+show)\s+(?:me\s+)?how\s+(?:[\w'-]+\s+){1,6}?(?:works?|happens?|becomes?|forms?|is\s+(?:made|produced|formed|passed)|are\s+(?:made|produced|formed)|develops?|spreads?|flows?)\b/i;

/**
 * NOT A DIAGRAM OF A STRUCTURE, whatever else it says. A chart, a graph or a
 * plot is data to see ("a bar chart of the causes of death", "a gantt chart
 * of the phases of our launch", "a graph of the cycle of sin x"); forces, a
 * field, a circuit or a curve are a picture ("a labelled diagram of the
 * forces on a block"). Both are made in Artifacts, as before — unless a
 * structural diagram is named outright (a flowchart, an org chart).
 */
const DATA_VISUAL = /\b(?:chart|graph|plot|histogram|scatter|spreadsheet|gantt)s?\b/i;
const PICTURE_SUBJECT = /\b(?:forces?|free[- ]body|vectors?|(?:electric|magnetic|gravitational|vector)\s+fields?|field\s+lines|circuits?|ray\s+diagrams?|waves?|projectiles?|inclined?\s+planes?|pendulums?|orbits?|functions?|curves?|equations?)\b/i;

/**
 * Made in Artifacts all the same: Artifacts named ("a flowchart in
 * Artifacts"), or the request the Make list sends for a flowchart picked
 * from it ("Make a flowchart: how a bill becomes law", lib/logos5/make.ts).
 */
const INTO_ARTIFACTS = /\b(?:in|into|to|as)\s+(?:an?\s+|the\s+|my\s+)?artifacts?\b/i;
const MADE_FROM_LIST = /^make\s+an?\s+[\w\s/-]{2,40}?(?::|\s+from\s+this\s+conversation\b)/i;

/** The diagram a turn asks for, and its shape — null when it asks for none (or for one to be made in Artifacts). */
export function diagramAsked(text: string): DiagramShape | null {
  const t = clean(normalizeTyping(text ?? ''));
  if (!t || INTO_ARTIFACTS.test(t) || MADE_FROM_LIST.test(t) || /\bvenn\b/i.test(t)) return null;
  const picture = PICTURE_SUBJECT.test(t);
  // a structural diagram named outright wins — but a labelled or block diagram of forces or a circuit is a picture
  for (const [shape, re] of DIAGRAM_NAMED) if (re.test(t) && !(picture && (shape === 'parts' || shape === 'system'))) return shape;
  if (picture || DATA_VISUAL.test(t)) return null;
  for (const [shape, re] of DRAWN_AS) if (re.test(t)) return shape;
  const of = DIAGRAM_OF.exec(t);
  if (of) for (let g = 1; g <= OF_SHAPES.length; g++) if (of[g]) return OF_SHAPES[g - 1];
  if (DIAGRAM_OF_HOW.test(t)) return 'process';
  return null;
}

/**
 * THE SUBJECT HAS A SHAPE WORTH SEEING (Logos 5.5): a question whose answer
 * is a cycle, a hierarchy, a chain of causes, the stages of a process or the
 * kinds of a thing — "explain the water cycle", "how is the UK parliament
 * structured?", "what caused World War I?", "what are the stages of mitosis?".
 * It is still a question, answered in the conversation (rule A — the reply
 * draws its own small diagram, lib/runtime/presentation.ts); the Logic Map
 * draws the subject beside it, in the background, where it can be opened,
 * inspected and edited. Read by the same reader the reply's diagram uses
 * (lib/runtime/asks.ts partsShape), so a person's own story, one event or a
 * body failing is never drawn.
 */
const STAGES_OF = /\b(?:the\s+)?(?:stages|phases|steps)\s+(?:of|in)\s+(?!(?:my|our|your|this|that)\b)\S|\b(?:the\s+)?process\s+of\s+(?!(?:my|our|your|elimination)\b)\S|\bhow\s+(?:does|do|is|are)\s+(?:a\s+|an\s+|the\s+)?(?:[\w'-]+\s+){1,4}?(?:become|becomes|made|produced|formed|passed)\b/i;
export function drawable(text: string): DiagramShape | null {
  const t = clean(normalizeTyping(text ?? ''));
  if (!t || t.length > 400) return null;
  // a chart, a graph or a plot asked for is data to see, made in Artifacts: "a bar chart of the causes of death"
  // is not a cause-and-effect drawing; nor is anything made in Artifacts or from the Make list
  if (DATA_VISUAL.test(t) || INTO_ARTIFACTS.test(t) || MADE_FROM_LIST.test(t)) return null;
  const parts = partsShape(t);
  if (parts === 'cycle') return 'cycle';
  if (parts === 'tree' || parts === 'types') return 'hierarchy';
  if (parts === 'causes' || parts === 'effects') return 'causal';
  if (STAGES_OF.test(t) && !/\b(?:my|our)\b/i.test(t)) return 'process';
  if (TIMELINE_NAMED.test(t) && !ownTimeline(t)) return 'timeline';
  return null;
}

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
  /** a diagram asked for, and its shape: the Logic Map draws it (diagramAsked) */
  diagram?: DiagramShape;
  /** a question whose subject has a shape worth seeing: the map pass draws it in the background (drawable) */
  draw?: DiagramShape;
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

/**
 * ONE SUBJECT'S TWO SIDES, OR A HISTORY'S EVENTS, ASKED FOR IN PASSING
 * (November 2026). "Pros and cons of remote work" and "give me a timeline of
 * the French Revolution" named a display, so both opened Artifacts and the
 * conversation got a sentence about it. Each is drawn in the reply instead —
 * the two sides weighed, the events in order (lib/runtime/presentation.ts) —
 * and Keep files it in Artifacts if they want to come back to it. Made in so
 * many words ("make me a pros and cons table", "build a timeline"), drawn from
 * the map, or a timeline of their own plans ("a timeline for our launch"), it
 * is still made in Artifacts.
 */
const INLINE_DISPLAY = new Set(['pros and cons', 'pros and cons list', 'pro and con list', 'pros cons list', 'pros/cons', 'timeline', 'time line', 'chronology']);
const MADE = /\b(?:make|create|build|draw|generate|draft|design|prepare|set\s+up|put\s+together|lay\s+out|map\s+out|plan\s+out|table|matrix|chart|board|grid|spreadsheet|document|artifact|template|gantt)\b/i;
function inlineInstead(text: string, display: { noun: string; fromMap: boolean } | null): 'balance' | 'timeline' | null {
  if (!display || !INLINE_DISPLAY.has(display.noun) || display.fromMap || MADE.test(text)) return null;
  const timeline = /time\s*line|chronology/.test(display.noun);
  // a timeline of their own plans is a plan, made in Artifacts (lib/runtime/asks.ts)
  if (timeline && OWN_TIMELINE.test(text)) return null;
  return timeline ? 'timeline' : 'balance';
}

/** Alex's rules A–D, read from the turn. */
export function routeTurn(t: TurnInput): TurnRoute {
  const text = clean(normalizeTyping(t.text ?? ''));
  const reasons: string[] = [];
  if (t.command) return { intent: 'command', reasons: ['command'], reveal: null };

  // D before C: "map out the causes of inflation" is a structure even though
  // it names a thing that could be drawn.
  const view = readViewRequest(text);
  if (STRUCTURE.test(text) || (view && MAP_LENSES.has(view.lens) && !tableInReply(text))) {
    reasons.push(view && MAP_LENSES.has(view.lens) ? `structure:lens:${view.lens}` : 'structure:asked');
    // the reply is read beside the map it draws (on a phone, the map alone)
    const asked = diagramAsked(text);
    return { intent: 'structure', reasons, reveal: { view: 'logic_map', beside: 'chat' }, ...(asked ? { diagram: asked } : {}) };
  }

  // A DIAGRAM, asked for by what it is or by drawing something that has its shape (Logos 5.5): the Logic
  // Map draws it — a flowchart, a cycle, a hierarchy, the parts of something — and Keep files it in
  // Artifacts. A picture of a field or a function is still made there (below).
  const diagram = diagramAsked(text);
  if (diagram) {
    reasons.push(`structure:diagram:${diagram}`);
    return { intent: 'structure', reasons, reveal: { view: 'logic_map', beside: 'chat' }, diagram };
  }

  // A QUICK PLOT — one function, a range at most — is drawn in the conversation as a graph to change, and
  // kept in Artifacts only if they press Keep (lib/runtime/plot-ask.ts)
  if (quickPlot(text)) {
    reasons.push('inline:plot');
    return { intent: 'conversation', reasons, reveal: null };
  }

  const sim = wantedSimulation(text);
  const named = readDisplayRequest(text);
  // two sides or a history's events, asked for in passing: drawn in the reply, not made
  const inline = inlineInstead(text, named);
  const display = inline ? null : named;
  const construct = constructAsk(text);
  const visual =
    (sim && `visual:simulation`) ||
    (construct && `visual:${construct}`) ||
    // a display asked for BY NAME ("a decision matrix", "a study plan") — one
    // matched only by what they want ("should I take the job or stay?" fits a
    // crossroads display) is a question, and stays in the conversation. A
    // custom artifact is matched only by a request to make one ("make me a
    // pomodoro timer"), so it is asked for either way
    (display && (!display.intent || display.kind === 'custom') && `visual:display:${display.kind ?? 'any'}`) ||
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

  if (inline) reasons.push(`inline:${inline}`);
  reasons.push('conversation');
  // a subject with a shape worth seeing: still conversation, and the map draws it beside (drawable)
  const draw = drawable(text);
  if (draw) reasons.push(`draw:${draw}`);
  return { intent: 'conversation', reasons, reveal: null, ...(draw ? { draw } : {}) };
}

// ── which work runs ──────────────────────────────────────────────────

/**
 * THE MAP PASS, WHEN IT IS WORTH ITS COST.
 *
 * The extractor reads ~19k tokens of instructions and the conversation, and
 * used to run after every turn. It runs now when the turn asked for something
 * to be built or a structure to be drawn; while the Logic Map is the view they
 * are looking at (it is live while it is looked at); when the question's
 * subject has a shape worth seeing — a cycle, a hierarchy, causes, stages —
 * which the map draws beside the answer without opening (Logos 5.5, `draw`);
 * and in the background on a light cadence — once a line of thinking has a
 * few substantive turns, then every few more — so the Universal Map, search
 * and anything that reads the stored map (the 5-node rewards challenge among
 * them) still see maps.
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
  /**
   * Whether a subject with a shape is drawn in the background, unasked (route.draw). Off for a signed-in
   * free account (lib/token-allowance.ts): a pass nobody asked for would spend the week's tokens. The
   * reply's own diagram still shows, and Open on the Logic Map draws it there without a model.
   */
  drawUnasked?: boolean;
}

export function needsMap(i: MapNeedInput): { map: boolean; why: string } {
  if (i.route.intent === 'command') return { map: false, why: 'command' };
  if (i.route.intent === 'structure') return { map: true, why: 'structure' };
  if (i.route.intent === 'visual') return { map: true, why: 'visual' };
  if (i.filler) return { map: false, why: 'filler' };
  if (i.everyTurn) return { map: true, why: 'every-turn' };
  if (i.view === 'logic_map') return { map: true, why: 'open' };
  if (i.route.draw && i.drawUnasked !== false) return { map: true, why: 'draw' };
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
