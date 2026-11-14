// lib/runtime/presentation.ts — WHAT SHAPE A REPLY MAY TAKE, this turn.
//
// Adaptive response rendering, decided in code: from what the turn is (the
// exchange, the work, the view it routes to), what they gave (numbers with
// names on them, options set against each other, a formula with something to
// vary) and what is allowed (a question, the Answer Guard, writing that is
// theirs), which of the inline elements (lib/inline-ui.ts) the reply MAY use.
// The reply decides whether to; most turns are offered nothing at all.
//
// WHY THE OFFER, AND NOT THE WHOLE VOCABULARY IN THE PROMPT. Six schemas on
// every turn would cost every turn, and a menu always in view is a menu used:
// charts nobody needed, a comparison for a yes/no question. So the grammar for
// a form travels only on a turn where that form is plausible — a line or two
// each, after the history, outside the cache — and a hello carries none.
//
// THE SHAPE OF THE THOUGHT, NOT THE MODEL'S HABIT. Left alone, a model answers
// "give me an overview of microeconomics" with a bulleted list of bold terms
// and definitions. The core prompt makes prose the default and keeps lists for
// what really is a list (behavior.ts, HOW YOU SPEAK); here, a subject with
// several parts is offered an overview to explore (concepts), and steps or
// events whose order is the point a sequence. A list asked for in so many
// words is a list: nothing is offered in its place.
//
// THE SHAPE OF THE ANSWER, TOO (logos5-v4). Two kinds of turn get a line on
// how the reply itself is shaped, because a model's habit there is the
// chatbot's: an OPEN PIECE OF WORK ("I need to redesign our onboarding") gets
// the problem that matters and one concrete starting point, with the ways it
// could go next offered as paths to open — not a five-section plan of advice
// that would fit anyone's project; and a request to GO DEEPER on a thread
// ("Go deeper: …", "say more about…") gets that thread in full, in parts that
// can be read one at a time (the page folds the later ones, lib/reply-layout.ts).
// A choice that is theirs between named options is offered a decision they
// weigh themselves (decide), instead of a comparison that leans for them.
//
// NEVER FORCED. Small talk, joking and something personal are plain text. A
// thing to be built opens in Artifacts (rule C) and structure in the Logic Map
// (rule D); this never competes with them. At most two forms are offered, and a
// form the last two replies both used is not offered a third time running.
//
// THE VIEW DECIDES THE SHAPE. Chat converses: prose, and a small element only
// where it carries the idea better than a sentence — never an application or a
// dashboard in the conversation. A relationship the person can discover by
// changing something may be drawn to change: a graph whose numbers they drag,
// one small simulation, a question they work out and check — one thing to
// work with in a reply, and what they do with it reaches Socria
// (lib/inline-ui.ts describeInline). Content is read: a write-up
// they asked to keep is written as a document, with headings where they help
// someone find their way, and filed there (place: 'content'). What is made
// belongs to Artifacts, and only when asked for.
//
// MINIMUM EXPLANATION, MAXIMUM UNDERSTANDING (November 2026). Asked to
// understand something — "I need to understand the Mean Value Theorem", "why
// does a tax raise prices by less than the tax?" — the reply opened with the
// topic's name and wrote a textbook: definition, conditions, proof, examples,
// applications. The turn reached the reply with nothing to say otherwise:
// "I need to understand…" was not read as a request at all, maths was told to
// "show the reasoning step by step", and the only graph on offer was a
// parabola. Now such a turn is read (lib/cognition/assist.ts), and gets a
// shape: the central insight in a sentence, with the conditions it cannot do
// without; then one thing that lets them see it — a graph of the relationship
// itself (the chord and the tangent that matches it, a supply curve a tax
// shifts, a point along a demand curve), drawn and computed by the page; then
// the ways deeper, to open one at a time. A simple question stays a sentence.
// A claim to check gets its verdict first, and the parts it rests on to
// inspect (claim) — not two sides of a myth.
//
// TEXT WALLS THE EXCEPTION, NOT THE DEFAULT (November 2026). An audit of
// fifty-nine phrasings found four causes, and this file held two of them.
// Most turns were never read at all — "TCP vs UDP", "how do I hire my first
// engineer?", "causes of inflation" — so nothing was offered and the reply
// wrote its habit: a paragraph each, then bold terms (lib/runtime/asks.ts now
// reads them). And when something was offered, the offer undercut itself:
// every element arrived as "optional; plain prose is often better", so the
// model wrote the comparison in prose AND the table, or the prose alone. Now:
//
//   THE FORM THAT FITS. Where the turn's structure IS the element — options
//   set against each other, one subject's two sides, a cycle, a hierarchy,
//   causes, their own numbers, a claim to inspect, a relationship to see —
//   the element is offered as the form that fits: use it unless one sentence
//   answers them, and when it is used it carries the parts and the prose only
//   frames it. Speculative offers (the ways onward, directions to tap, the
//   reasoning folded under a call, a sequence for how a game works) stay
//   optional. Either way, what a block shows is never written again in words.
//
//   THE PARTS OF SOMETHING. An answer that is a set of parts — a cycle, a
//   hierarchy, causes, effects, types — has no single central sentence, and
//   the understanding shape no longer pretends it does: one sentence on what
//   ties the parts together, and the element (a diagram, an overview) carries
//   them.
//
//   A PRACTICAL QUESTION gets the one thing it hinges on and a concrete
//   default, then the few levers that matter — as a comparison, steps, or the
//   ways onward — not every tip there is.
//
//   PRECISION. A bare noun never forces a visual: "graph" in "how do I change
//   the graph colours in Excel?", "tangent" in "sorry for the tangent", "supply"
//   in "supply chain", "better" in "I'm feeling better", "rate" in "rate my
//   ideas". The mathematical readers count where the conversation is
//   mathematical, or where the words could only be mathematics.
//
//   ONE THING TO WORK WITH. At most one live element is offered in a turn (a
//   graph, a simulation, a slider, a decision, the working, a claim); a second
//   form is only ever one that sits quietly beside it.
//
//   DEPTH ON REQUEST, ONE LAYER AT A TIME. A way deeper, opened, goes one layer
//   down and offers the next layers as ways onward; the whole thread in parts
//   is for depth asked for in so many words ("in detail", "step by step") or a
//   Detailed length setting.
//
// Pure. No model, no network, no clock.

import { LIVE_KINDS, numbersIn, type InlineKind } from '../inline-ui';
import { TRIP, claimCheck, pickAsk, practicalShould } from '../cognition/claims';
import { saysFeeling, withoutGreeting } from '../cognition/register';
import { quickPlot } from './plot-ask';
import {
  BASE_RATE,
  CASUAL_PICK,
  COMPARE_ASK,
  JOKE,
  TASTE,
  LIFE_VALUES,
  LIST_ASK,
  LIST_LEAD,
  MANY_ASK,
  MATH_OBJECT,
  NOT_A_PROBLEM,
  OWN_EVENT,
  PROS_CONS,
  TIMELINE_ASK,
  TIMELINE_NAMED,
  VERSUS,
  ASKS_PICK,
  aboutAPerson,
  adviceAsk,
  adviceKind,
  comparisonAsk,
  ownTimeline,
  partsShape,
  personInRequest,
  normalizeTyping,
  requestBody,
  tenderText,
  twoNamed,
  type PartsShape,
} from './asks';
import type { ExplicitSignals } from '../core4/types';
import type { TurnState } from './state';

export interface PresentationInput {
  text: string;
  state: TurnState;
  signals: ExplicitSignals;
  /** questions the reply may ask this turn — choices are one */
  questions: number;
  /** the substance of what they are writing is theirs (Core 4's split) */
  ownWriting: boolean;
  /** the decision is theirs to make (Core 4's split: judgment) — no conclusion drawn for them */
  ownJudgment?: boolean;
  /** working it out is theirs, or Socria only scaffolds it (Core 4's split: reasoning) */
  ownReasoning?: boolean;
  /** …and of those, Socria scaffolds it (split: reasoning = scaffold): the first steps may be shown, the last left theirs */
  scaffold?: boolean;
  /** the Answer Guard is up */
  guard: boolean;
  /** the conversation before this turn */
  history: readonly { role: 'user' | 'assistant'; content: string }[];
  /** the length they chose for replies (Logos 5): Detailed asks for depth on every thread */
  length?: 'concise' | 'standard' | 'detailed' | null;
}

export type ReplyShape = 'open' | 'deeper' | 'layer' | 'understand' | 'practical';
export type GraphVariant = 'plot' | 'curve' | 'rate' | 'tangent' | 'market' | 'point' | 'limit' | 'area' | 'monopoly';
export type DiagramVariant = 'cycle' | 'tree' | 'flow' | 'causes';

/**
 * HOW THE TURN'S EXPLANATION IS REPRESENTED — the allocation's third question, after who thinks and how the reply
 * meets them. The planner below decides it from the person's words, the kind of work, what the allocation keeps with
 * them and the question budget it left (so a guarded problem never gets the picture that would answer it); this names
 * the decision, for the trace and for measuring it. One of the brief's ten: prose, notation, a function graph, a
 * scientific diagram, a flow, a timeline, a comparison, an interactive simulation, a map of ideas, or a hybrid of two.
 */
export const REPRESENTATIONS = ['text', 'notation', 'graph', 'diagram', 'flow', 'timeline', 'comparison', 'simulation', 'map', 'hybrid'] as const;
export type Representation = (typeof REPRESENTATIONS)[number];
const REPRESENTED: Record<InlineKind, Representation> = {
  chart: 'graph', graph: 'graph', slider: 'simulation', sim: 'simulation', trace: 'simulation', vectors: 'diagram',
  diagram: 'flow', sequence: 'flow', steps: 'notation', equation: 'notation', check: 'notation',
  compare: 'comparison', decide: 'comparison', balance: 'comparison', options: 'text', reasoning: 'text', draft: 'text',
  concepts: 'map', claim: 'map', paths: 'text',
};
/** The representation a plan amounts to: what its element shows (a timeline is a sequence with dates), two elements a hybrid, none prose. */
export function representationOf(p: Pick<Presentation, 'forms'> & { timeline?: boolean; diagramView?: string }): Representation {
  const shown = p.forms.filter((k) => k !== 'paths');
  if (!shown.length) return 'text';
  if (shown.length > 1) return 'hybrid';
  const k = shown[0];
  if (k === 'sequence' && p.timeline) return 'timeline';
  if (k === 'diagram' && p.diagramView && p.diagramView !== 'flow') return 'diagram';
  return REPRESENTED[k];
}

export interface Presentation {
  forms: InlineKind[];
  /** content-free reasons, for the trace and the tests */
  reasons: string[];
  /** where the reply is read: the conversation, or Content (a write-up they asked to keep) — absent is the conversation */
  place?: 'chat' | 'content';
  /**
   * how the reply itself is shaped this turn: an open piece of work, a thread
   * gone into in full or one layer deeper, an idea to understand, a practical
   * question — absent is the core's default
   */
  shape?: ReplyShape;
  /** which graph fits the idea, when a graph is offered: a curve's shape, rates on it, curves that meet, a point along one */
  graph?: GraphVariant;
  /** which diagram fits the parts, when a diagram is offered: a cycle, a hierarchy, a flow, causes converging */
  diagram?: DiagramVariant;
  /**
   * the forms offered because the turn's structure is theirs — the comparison
   * for options set against each other, the diagram for a cycle. The reply is
   * told these fit; the rest of `forms` stays optional.
   */
  strong?: InlineKind[];
  /** depth asked for on an idea in so many words ("in detail, with the proof"), or a Detailed length */
  depth?: boolean;
  /** the answer is a set of parts, though nothing may be drawn to carry them (under the Answer Guard) */
  parts?: PartsShape;
  /** they asked for Socria's own read on a choice that is theirs ("what would you do?", "you decide") */
  lean?: boolean;
  /** no question may be asked this turn: nothing in a block asks one either */
  noQuestion?: boolean;
  /** the Answer Guard is up: nothing drawn or said is the answer they are working toward */
  guard?: boolean;
  /** the depth came from their Detailed length setting, not their words */
  depthFromLength?: boolean;
  /** there is mathematics in the turn to work (a problem, not a mention): what the working element needs */
  math?: boolean;
  /** the working offered is faded: the first lines shown, the step that finishes it theirs, asked as its check */
  stepsFaded?: boolean;
  /**
   * The turn's note asks the reply to leave one line open (lib/runtime/engagement.ts): the shape's "then stop"
   * comes after that line, not instead of it. Set when the shape is rendered (renderPresentation's context), where
   * both are known; never by the planner.
   */
  leaveOpen?: boolean;
}

/**
 * A list of amounts with names on them — "rent 1200, food 400, transport 150",
 * "$90 on gas, $50 on food", "Q1 120k, Q2 135k, Q3 128k". The name comes before
 * the amount (or after "on" or "for"), and is a word or a period's name (Q1, H2,
 * FY24), not "at", "over" or "a": "a 300k mortgage at 6% over 30 years" is three
 * numbers and no list. Percentages are rates, not amounts.
 */
const LABEL_FIRST = /\b([A-Za-z](?:[A-Za-z'’]{1,20}|\d{1,2}|[A-Za-z]?\d{2})(?:\s[A-Za-z]{2,12})?)\s*(?::|=|—|–|-)?\s*[$£€¥₹]?(\d[\d,]*(?:\.\d+)?)(?:\s?k)?\b(?!\s*%|[\d.])/g;
const AMOUNT_FIRST = /[$£€¥₹]?(\d[\d,]*(?:\.\d+)?)(?:\s?k)?\s+(?:on|for)\s+([A-Za-z][A-Za-z ]{1,20})/g;
const NOT_A_NAME = /^(?:at|of|is|was|are|were|for|in|on|by|to|the|a|an|my|our|i|we|over|about|around|under|than|with|per|each|every|and|or|x|y|z|n|it|me|save|saved|spend|spent|pay|paid|got|get|be|have|has|had|from|until|since|after|before|between|year|years|month|months|week|weeks|day|days|hour|hours|minute|minutes|step|page|chapter|question|item|number|version|level|grade|size|age)$/i;
function namedAmounts(t: string): number {
  const seen = new Set<string>();
  for (const m of t.matchAll(LABEL_FIRST)) {
    const name = m[1].trim().split(/\s+/).pop() ?? '';
    if (!NOT_A_NAME.test(name) && !NOT_A_NAME.test(m[1].trim())) seen.add(m[1].trim().toLowerCase());
  }
  for (const m of t.matchAll(AMOUNT_FIRST)) seen.add(m[2].trim().toLowerCase());
  return seen.size;
}
/**
 * …and amounts of one thing. "I slept 5 hours, ran 3 miles, ate 2 meals and
 * drank 4 coffees" names four numbers of four different things: there is no
 * chart of that. Money (a currency, or the words people keep budgets in), or
 * one unit shared by three of them ("5 hours Monday, 7 hours Tuesday…", "120k,
 * 135k, 128k"), is.
 */
const MONEY = /[$£€¥₹]|\b(?:costs?|spend|spent|spending|budget|revenue|sales|income|expenses?|salary|salaries|bills?|prices?|paid|pay|profit|rent|earn(?:ed|s|ings)?|owe|debts?|fees?|donations?)\b/i;
function sharedUnit(t: string): number {
  const tally = new Map<string, number>();
  for (const m of t.matchAll(/\d[\d.]*(?:,\d{3})*\s?(k|m|bn|%|[a-z]{2,10})\b/gi)) {
    const u = m[1].toLowerCase().replace(/s$/, '');
    tally.set(u, (tally.get(u) ?? 0) + 1);
  }
  return Math.max(0, ...tally.values());
}
/** How a quantity moves when something else does — said so, with their numbers in it. */
const WHAT_IF =
  /\b(?:what if|how much (?:would|will|do|does|is|can)|how (?:does|would) (?:it|that|the \w+) change|depends on|if i (?:change|raise|lower|increase|decrease|put|save|invest|borrow)|monthly payments?|compound(?:ing|ed)?|loans?|mortgages?|savings?|invest(?:ing|ment)?|growth rate|break[- ]?even|salary|wages?|commission|(?:raise|raising|cut|cutting|increase|increasing|lower|lowering)\s+(?:the\s+|our\s+|my\s+)?prices?)\b/i;
/** …and words that are only sometimes a quantity: "rate my ideas", "a tip for beginners", "tax law". With a percentage, a currency or "how much", they are. */
const WHAT_IF_WEAK = /\b(?:interest|discount|tip|tax(?:es)?|percent|percentage|rate)\b/i;
/** An amount or a rate of the thing varied: a currency, a percentage, thousands, per month. */
const AMOUNT = /[$£€¥₹]\s?\d|\d\s?%|\b\d[\d,.]*\s?(?:k|m|bn|dollars|pounds|euros|percent|grand)\b|\b\d[\d,.]*\s*(?:a|per|\/)\s*(?:month|year|week|hour|mo|yr)\b/i;
/** …two of them: their own numbers, enough to make the slider the form that fits. */
const AMOUNT_TWO = new RegExp(String.raw`(?:${AMOUNT.source})[\s\S]*?(?:${AMOUNT.source})`, 'i');
const MONEY_OR_PCT = /[$£€¥₹]\s?\d|\d\s?%|\b\d[\d,.]*\s?(?:k|m|bn|dollars|pounds|euros|percent)\b|\bhow much\b/i;
/**
 * A known relationship people ask to understand, with nothing they gave to
 * vary: compound interest, the rule of 72, Bayes, break-even, a payback
 * period, runway. A slider with sensible defaults shows it — said to be
 * defaults, so a number is never mistaken for advice.
 */
const SLIDER_FORMULA =
  /\b(?:compound\s+interest|compounding|rule\s+of\s+72|doubling\s+time|break[- ]?even(?:\s+point)?|payback\s+period|(?:cash|financial|startup)\s+runway|months?\s+of\s+runway|runway\s+(?:left|in\s+months)|net\s+present\s+value|npv|present\s+value|future\s+value|bayes(?:'|’)?s?(?:\s+(?:theorem|rule))?|base\s+rates?|how\s+long\s+(?:until|to|for|before)\s+[^?]{0,40}?\b(?:doubles?|doubling|pay(?:s)?\s+(?:it\s+)?off|paid\s+off|breaks?\s+even|reach(?:es)?\s+\$?\d)|loan\s+payments?|amorti[sz]ation)\b|(?:growing\s+(?:at\s+)?|grows?\s+(?:by|at)\s+)\d+(?:\.\d+)?\s?(?:percent\b|%)/i;
/** A ratio or a definition by formula, asked what it is: one equation and its terms says it — nothing in it is there to vary. */
const EQUATION_NAME =
  /\b(?:ebitda|cac|customer\s+acquisition\s+costs?|c?ltv|(?:customer\s+)?lifetime\s+value|gross\s+margin|net\s+margin|operating\s+margin|profit\s+margin|contribution\s+margin|markup|roi|return\s+on\s+investment|churn\s+rate|conversion\s+rate|arpu|mrr|arr|burn\s+rate|p\/?e\s+ratio|price[- ]to[- ]earnings(?:\s+ratio)?|debt[- ]to[- ]equity(?:\s+ratio)?|current\s+ratio|quick\s+ratio|bmi|body\s+mass\s+index|z-?scores?|standard\s+deviation|variance|churn|roas|return\s+on\s+ad\s+spend|nps|net\s+promoter\s+score|gdp|ctr|click-?through\s+rate|eps|earnings\s+per\s+share|cpa|cpc|cpm|cost\s+per\s+(?:acquisition|click|lead|mille|thousand)|working\s+capital|free\s+cash\s+flow|percentage\s+change|weighted\s+average|sharpe\s+ratio|debt[- ]to[- ]income(?:\s+ratio)?|cagr|compound\s+annual\s+growth\s+rate|kinetic\s+energy|potential\s+energy|density|unemployment\s+rate|inventory\s+turnover|gross\s+profit|(?:average\s+)?speed|velocity|acceleration|momentum|pressure)\b/i;
/**
 * …asked what the term IS, not for a value of it: "what's a good conversion
 * rate for an online store?", "what's the ROI of a college degree?", "the
 * conversion rate from USD to EUR", "a healthy BMI", "my churn" want a number
 * or a benchmark, and an equation is not one (adversarial review, November 2026).
 */
const EQUATION_VALUE =
  /\b(?:a|an)\s+(?:good|healthy|normal|typical|average|reasonable|realistic|decent|bad|high|low|safe|ideal)\s+|\b(?:my|our)\s+(?:\w+\s+)?(?:rate|ratio|margin|markup|roi|bmi|churn|cac|ltv|score|nps|ctr|eps|cpa|density|deviation)\b|\b(?:usually|typically|normally|right\s+now|today|currently|current)\b|\b(?:rate|ratio|margin|markup|roi|bmi|deviation|score|value|churn|gdp|yield|density|speed|velocity|acceleration|momentum|pressure)\s+(?:of|for|on|from|at)\s+/i;
/**
 * …and the term as the thing asked about, not a word inside another thing:
 * "speed dating", "the speed limit", "blood pressure", "peer pressure", "a
 * zoning variance", "momentum investing", and the CPA or EPS that is an
 * accountant or a foam (second adversarial round, November 2026).
 */
const NOT_THE_TERM =
  /\b(?:blood|peer|air|water|tire|tyre|cabin|social|time|oil|bone|population|zoning|signal|sound|voice|food|road|line)\s+(?:pressure|density|variance|speed)\b|\b(?:speed|pressure|density|momentum|markup|variance|velocity)\s+(?:dating|limits?|camera|cameras|trap|bump|bumps|cooker|cookers|washer|gauge|readings?|tests?|chess|reading|investing|language|ulcers?|sores?|points?|groups?|foam|orders?|bag|stockings|socks|skating|boat|train|run|dial|test|ticket|tickets)\b|\bcpa\b(?![^?]*\b(?:marketing|ads?|campaign|acquisition|cost|per\s+action)\b)|\beps\b(?![^?]*\b(?:earnings|shares?|stock|company|per\s+share)\b)/i;
/** A named law or identity, asked what it means: "what does E=mc² mean?" — its equation and terms, not a curve to reshape. */
const NAMED_LAW =
  /\be\s*=\s*mc\s*(?:\^\s*2|²|2)|\bf\s*=\s*ma\b|\bv\s*=\s*ir\b|\bpv\s*=\s*nrt\b|\b(?:ohm|newton|hooke|boyle|coulomb|charles)(?:'s|’s|s)?\s+(?:second\s+|third\s+|first\s+)?law\b|\bpythagor(?:as|ean)(?:'s|’s)?\s+theorem\b|\bideal\s+gas\s+law\b|\ba\s*\^?\s*2\s*\+\s*b\s*\^?\s*2\s*=\s*c\s*\^?\s*2/i;
const DEFINITION_ASK =
  /^[\w\s'’-]{2,30}\s+formula\s*\??$|^(?:what\s+.{2,40}?\s+(?:means|is)\s*\??$)|^(?:(?:so|ok(?:ay)?|hey|hi|quick question|please),?\s+)?(?:what(?:'s|\s+is|\s+are|\s+does)|define|explain|how\s+(?:do|would|can|should)\s+(?:i|you|we|one)\s+(?:calculate|compute|work\s+out|measure|figure\s+out|find)|how\s+(?:is|are)\s+.{2,40}?\s+(?:calculated|computed|measured|worked\s+out))\b/i;
const FORMULA = /\b[a-z]\s*=\s*[^=\n]*[a-z][^=\n]*$|\bf\s*\(\s*x\s*\)\s*=/im;
/** Mathematics written as such: y =, f(x), x^2, x². */
const MATH_MARK = /\by\s*=|\bf\s*\(\s*x\s*\)|(?<![a-z])[a-z]\s*\^\s*\d|(?<![a-z])(?!(?:m|cm|km|mm|ft|in)²)[a-z]²/i;
/**
 * A request for help too open to start on without knowing which way it goes —
 * "help me with my essay". Said as a plan ("I want to start a bakery"), it is
 * something to talk about, not a menu.
 */
const OPEN_ASK = /^(?:hey,?\s+|hi,?\s+)?(?:(?:can|could) you help(?: me)?(?: with)?|help me(?: with)?|i need (?:some )?help(?: with)?)\b/i;
/** Practical writing a person hands over: the words are the job, not theirs to author. */
const PRACTICAL_TEXT = /\b(?:e-?mail|message|text|reply|note|post|caption|announcement|memo|bio|invite|invitation|toast|slack|letter|summary|description|tweet|review|agenda)\b/i;
/** A subject with several parts, asked about as a whole: an overview, its main ideas, its branches. */
const OVERVIEW = /\b(?:overview|introduction to|intro to|primer on|basics of|fundamentals of|crash course|big picture|(?:main|key|major|core|basic|central|important|different) (?:concepts|ideas|areas|branches|parts|components|principles|theories|topics|elements|themes|schools|types|kinds)|(?:branches|areas|schools|subfields|fields) of|what (?:does|do) [\w\s-]{2,40} (?:cover|involve|include)|teach me (?:about )?(?:the )?basics)\b/i;
/** A field of study named on its own: "what is microeconomics?", "explain statistics", "tell me about organic chemistry". */
const FIELD = /^(?:(?:can|could) you |please )?(?:explain|tell me about|what(?:'s| is)|describe|walk me through)\s+(?:the (?:field|subject|study) of\s+)?(?!(?:\S+\s+){0,2}?in\s)(?:[a-z-]+\s){0,2}[a-z-]*(?:ics|ology|onomy|istry|osophy|ography|calculus|algebra|geometry|theory|science|engineering|law|medicine)\s*\??$/i;
/** History by its own words: a war, a revolution, an empire, a century, a year. */
const HISTORY = /\b(?:war|wars|revolution|empire|crisis|depression|collapse|dynasty|treaty|reign|century|ancient|medieval|independence|civil\s+rights|movement|era|coup|invasion|plague|cold\s+war|1[0-9]{3}|20[0-2][0-9]|[0-9]{3}\s?(?:bc|ad|bce|ce))\b/i;
/** Steps to follow, in order. */
const STEPS_ASK = /\b(?:steps? (?:to|for|in|of)|step[- ]by[- ]step|walk me through \w+ing|teach me how to|show me how to|explain how to|how (?:do|can|would|should) (?:i|you|we|one) (?:go about|get started|set up|apply|register|install|start|file|enrol|enroll)|(?:the )?process (?:of|for|to)|stages of|phases of|how does an? [\w\s-]{2,30} become|procedure (?:for|to))\b/i;
/**
 * How a system or a game works, asked about as a whole: "how does American
 * football work?", "how do elections work". A few ordered parts may carry it —
 * the four downs, the stages of a bill — so a compact sequence is offered, and
 * the reply decides; prose is still the answer. Not "how does that work for
 * you on Tuesday?": a pronoun is no system, and "for you" is a diary.
 */
const HOW_IT_WORKS =
  /\bhow\s+(?:does|do)\s+(?!(?:it|that|this|they|you|he|she|we|i|things|everything|anything)\b)(?:an?\s+|the\s+)?(?:[\w'’-]+\s+){0,4}?[\w'’-]+\s+work\b(?!\s+(?:for|with)\s+(?:you|me|us|them|him|her)\b)|(?:^|\b(?:about|know|wondering|wonder|understand|explain|learn|curious)\s+)how\s+(?!(?:it|that|this|they|you|he|she|we|i|things|everything|anything|my|our|your|his|her|their)\b)(?:an?\s+|the\s+)?(?:[\w'’-]+\s+){0,4}?[\w'’-]+\s+works?\b(?!\s+(?:for|with)\s+(?:you|me|us|them|him|her)\b)/i;
/**
 * AN OPEN PIECE OF WORK, said as one: "I need to redesign our onboarding",
 * — a request for help with it, never a statement of what they will do ("we
 * should launch in March" is a claim to talk about, not work to scope) —
 * "we're planning to launch in the spring", "help me think through the
 * offsite", "how should I approach the migration?". Not a concrete task with
 * a deliverable ("write an email", "fix this function") — that is done, not
 * scoped.
 */
const OPEN_WORK =
  /^(?:(?:so|ok(?:ay)?|right|hey|hi|well),?\s+)?(?:(?:(?:i|we)(?:'m| am|'re| are)?\s+(?:need|want|have|got|would like|'d like|plan(?:ning)?|trying|going|hoping|looking|been asked|being asked|asked)\s+to\s+|(?:i|we)'ve been asked to\s+|help (?:me|us) (?:to )?)(?:re-?)?(?:design|build|plan|launch|create|start|set up|develop|improve|rethink|overhaul|figure out|come up with|put together|structure|organi[sz]e|run|prepare|scale|grow|rework|define|map out|think through|work out|approach|restructure|relaunch|reposition)|let'?s\s+(?:re-?)?(?:design|plan|think through|figure out|work out|map out|structure|come up with|rethink))\b/i;
const HOW_APPROACH = /\bhow (?:should|would|do|can|could) (?:i|we) (?:approach|start|begin|tackle|think about|go about|structure|plan)\b|\bwhere (?:do|should) (?:i|we) (?:start|begin)\b/i;
/** …and the concrete tasks that open the same way but are done, not scoped. */
const CONCRETE = /\b(?:e-?mail|message|letter|note|post|tweet|caption|reply|code|function|regex|script|sql|query|formula|spreadsheet|pivot|table|chart|graph|bug|error|class|component|endpoint|cv|resume|invoice)\b/i;
/**
 * A choice that is theirs, between named options: "should I take the offer or
 * stay?", "help me decide between the two flats", "I'm torn between Lisbon and
 * Porto". Weighed by them — their weights decide the leaning — not decided for
 * them. "Should I bring an umbrella or not?" names one option.
 */
const DECIDE_ASK =
  /\b(?:should (?:i|we)\b[^?.!]{0,90}\bor\b(?!\s+(?:not|no|nah|what|so)\b)|help (?:me|us) (?:decide|choose|pick)|(?:i'?m|we'?re|i am|we are) (?:torn|deciding|trying to decide|choosing|stuck) between|can'?t decide (?:between|whether)|which (?:one )?should (?:i|we) (?:pick|choose|go (?:with|for)|take)|decide between|choose between|weigh(?:ing)? (?:up )?(?:my|the|our) options)/i;
/**
 * Socria's own read, asked for on a choice that is theirs: "what would you
 * do?", "which would you recommend?", "you decide", "just tell me". The
 * decision stays theirs to weigh; the read is given once, marked as Socria's —
 * never a block that weighs it and a rule that gags it (adversarial review,
 * November 2026).
 */
/** One subject's two sides that are a course of their own: "pros and cons of quitting my job". */
const OWN_COURSE = /\b(?:quitting|leaving|taking|moving|buying|selling|starting|switching|joining|accepting|renting|hiring|launching|going\s+back|staying|dropping\s+out|retiring|changing)\b/i;
/** …or a team's change set against how things are: "should we raise prices?" is the change against the status quo. */
const CHANGE_ASK = /\bshould\s+we\s+(?:raise|cut|lower|increase|reduce|switch|keep|change|drop|stop|start|move|expand|delay)\b/i;
/**
 * …to something of the business. "Should we move in together?", "should we
 * stop trying for a baby?", "should we move him into a care home?" are a
 * family's, and a 0–3 scoring block is no way to meet them (adversarial
 * review, November 2026).
 */
const BUSINESS_OBJECT =
  /\b(?:prices?|pricing|plans?|tiers?|product|features?|tool|tools|vendors?|suppliers?|stack|budget|launch|hiring|hire|headcount|team|office|market|marketing|ads?|campaign|roadmap|strategy|subscriptions?|discounts?|platform|framework|database|cloud|aws|azure|gcp|servers?|app|website|brand|logo|domain|policy|process|meetings?|standups?|sprints?|release|deadline|contract|clients?|customers?|freemium|free\s+tier|trial|newsletter|shop|store|inventory|salar(?:y|ies)|equity|funding|round|investors?|agency|offering)\b/i;
/** Their own life, by its people: "should I text him first or wait?" is not a scoring exercise. */
const WHICH_SHOULD = /\bwhich\s+(?:one\s+)?(?:should\s+(?:i|we)\s+(?:use|get|buy|learn|pick|choose|take)|would\s+you\s+(?:recommend|pick|choose))\b/i;
/**
 * Going deeper on one thread: a way deeper opened ("Go deeper: …", lib/inline-ui.ts
 * pathAsk), an overview's part followed ("Take me further into …"), or said in
 * words — "say more about the second one", "expand on that", "walk me through
 * it in detail".
 */
const DEEPER =
  /^(?:(?:ok(?:ay)?|great|yes|yeah|sure|right|nice|good|perfect|cool),?\s+)?(?:(?:can|could|would|will)\s+(?:you|we)\s+(?:please\s+)?|please\s+|i'?d\s+(?:love|like)\s+(?:you\s+)?to\s+(?:(?:hear|know)\s+)?|let'?s\s+)?(?:would you mind (?:going deeper|digging (?:deeper|into)|diving (?:deeper|into)|expanding on|elaborating(?: on)?|saying more about|unpacking)|go deeper|dig (?:deeper|into)|dive (?:deeper|into)|say more about|tell me more(?: about)?|expand on|elaborate(?: on)?|unpack|more on|(?:go|get) into (?:more )?detail|more detail on|take me further into|go further (?:on|into)|explain (?:that|this|it) (?:in more detail|further|more)|walk me through (?:that|this|it)(?: in detail)?|go into (?:more )?detail)\b/i;
/** …and depth asked for in so many words: the whole thread, in parts. Anything less goes one layer at a time. */
const FULL_DEPTH = /\b(?:in\s+(?:full|more|great|much\s+more|real|proper)?\s*detail|step[- ]by[- ]step|fully|in[- ]depth|everything\s+(?:about|on)|thoroughly|comprehensive(?:ly)?|the\s+whole\s+(?:thing|story|picture)|all\s+of\s+it|properly)\b/i;
/**
 * A relationship in maths, asked about: something they could see by changing a
 * number. Words that can only be mathematics count anywhere; the everyday ones
 * ("graph", "curve", "function", "slope") only beside another, or in a
 * conversation that is mathematical — "how do I change the graph colours in
 * Excel?", "why does my JavaScript function return undefined?" and "what is
 * the meaning of the curve in this poem?" are not.
 */
const MATH_SURE = /\b(?:parabolas?|quadratics?|polynomials?|cubics?|asymptotes?|logarithm(?:s|ic)?|sine|cosine|sinusoid\w*|linear\s+functions?|exponential\s+(?:functions?|curves?|graphs?)|tangent\s+lines?|y-?intercepts?|x-?intercepts?|turning\s+points?|sine\s+waves?|normal\s+distributions?|bell\s+curves?|gaussian|slope\s+of\s+a\s+line|(?:positive|negative)\s+slope|hyperbolas?|reciprocal\s+functions?|square\s+root\s+functions?|(?:inversely|directly)\s+proportional|(?:direct|inverse)\s+proportion(?:ality)?|area\s+under\s+(?:a|the)\s+curve)\b|\b(?:sin|cos|tan)\s*(?:\(|x\b)|\b\d+\s*\/\s*x\b/i;
const EXP_CURVE = /\bexponential\s+(?:growth|decay)\b/i;
const MATH_MAYBE = /\b(?:slopes?|gradients?|vertex|vertices|intercepts?|amplitudes?|graphs?|curves?|functions?|exponential|derivatives?(?!\s+(?:works?|markets?|trading|contracts?)))\b/gi;
const mathWords = (t: string) => (t.match(MATH_MAYBE) ?? []).length;
const WHY_HOW = /\b(?:why|how|what happens|what does|explain|understand|intuition|make sense|confused|get it|don'?t get|mean|means|change|changes|affect|affects|shift|shifts|move|moves|depend|depends|look like)\b/i;
/**
 * Rates on a curve: the slope at a point against the average over an interval —
 * the mean value theorem, what a derivative is, marginal against average. A
 * derivative in finance is a contract, not a slope.
 */
const RATE_SURE = /\b(?:mean\s+value\s+theorem|mvt|rolle'?s\s+theorem|derivatives?|differentiat\w*|tangent\s+lines?|tangent\s+to\s+(?:a|the)\s+(?:curve|graph|function|parabola|circle)|slope\s+of\s+(?:a|the)\s+(?:curve|tangent|graph)|slope\s+of\s+\S+(?:\s+\S+){0,3}?\s+at\s+(?:x\s*=\s*)?-?\d|secant(?:\s+lines?)?|limit\s+definition|first\s+principles)\b/i;
const NOT_RATE = /\bderivative\s+works?\b|\bfirst\s+principles\s+(?:thinking|reasoning|approach)\b|\bdifferentiat\w*\s+(?:my|our|your|their|his|her|myself|yourself|ourselves|itself|between|from|the\s+brand|a\s+brand|us|them|you)\b/i;
const RATE_SOFT = /\b(?:rates?\s+of\s+change|instantaneous\s+(?:rate|speed|velocity)|average\s+(?:rate|slope|velocity|speed)|marginal\s+(?:cost|revenue|product|utility|benefit))\b/i;
const FINANCE = /\b(?:finance|financial|trading|traders?|options|futures|swaps|hedg\w*|securities|bank(?:s|ing)?|exchange-traded)\b/i;
/** …of which the average over an interval, set against the rate at a point: the chord and the tangent that matches it. */
/** Limits and continuity: what a curve approaches, against the value it takes. */
const LIMIT_ASK = /\b(?:limits?\s+(?:of|as|at)\b|(?:left|right|one|two)[- ]?(?:hand(?:ed)?|sided)\s+limits?|the\s+limit\b|a\s+limit\b|continuit\w*|(?:dis)?continuous|discontinu\w*|removable|jump\s+discontinuit\w*|hole\s+in\s+(?:the|a)\s+graph|open\s+(?:circle|dot|point)|as\s+x\s+(?:approaches|goes\s+to|tends\s+to|gets\s+close)|(?:approaches|tends\s+to)\s+[-−]?\d|x\s*(?:→|->)\s*[-−]?\d|lim\s*_?\s*\{?\s*x)/i;
const NOT_LIMIT = /\b(?:speed|credit|age|word|character|time|rate|upload|file|size|spending|budget|legal|data|usage)\s+limits?\b|\blimits?\s+(?:of\s+(?:my|our|your|the\s+(?:law|account|plan|app))|on\s+(?:my|our|your))\b/i;
/** Areas under curves, integrals and their sums. */
const AREA_ASK = /\b(?:integrals?|integrat(?:e|ion|ing)|area\s+under|riemann|(?:left|right|midpoint)\s+(?:sum|rule|endpoint)|trapezoid(?:al)?\s+rule|definite|antiderivative|accumulat\w+\s+(?:area|change)|fundamental\s+theorem\s+of\s+calculus)\b/i;
/** Market structure with a price-setter: marginal revenue against marginal cost. */
const MONOPOLY_ASK = /\b(?:monopol\w+|marginal\s+revenue|mr\s*=\s*mc|price[- ]setter|deadweight\s+loss|profit[- ]maximi[sz]\w*)\b/i;
/** Forces on a body: what pushes and pulls, and what they add up to. */
const FORCES_ASK = /\b(?:forces?\s+(?:on|acting|diagram)|free[- ]body|net\s+force|resultant|vectors?\s+(?:add|sum|addition|components?)|add(?:ing)?\s+(?:two\s+|the\s+|these\s+)?vectors|(?:tension|normal\s+force|friction)\b[^.?!]{0,60}\b(?:force|block|box|incline|slope|rope)|inclined?\s+plane|equilibrium\s+of\s+forces|(?:balanced|unbalanced)\s+forces|newton'?s\s+(?:first|second|third)\s+law)\b/i;
/** An algorithm worked through: the steps it takes on some data. */
const ALGO_ASK = /\b(?:(?:a\s+|the\s+)?(?:stack|queue)s?\b(?!\s+(?:overflow|exchange|trace|of\s+(?:paper|books|cards)))|(?:bubble|insertion|selection|merge|quick|heap|counting|radix)\s*sort|sorting\s+algorithm|binary\s+search|linear\s+search|two[- ]pointers?|sliding\s+window|(?:breadth|depth)[- ]first\s+search|bfs|dfs|dijkstra|euclid(?:'s|ean)?\s+algorithm|stack\s+(?:push|pop)|push\s+and\s+pop|queue\s+(?:enqueue|dequeue)|fibonacci\s+(?:with|using)\s+dynamic|dynamic\s+programming)\b/i;
const ALGO_HOW = /\b(?:how\s+(?:does|do|is)|walk\s+(?:me\s+)?through|step\s+(?:by|through)|trace|show\s+(?:me\s+)?(?:how|the\s+steps)|explain|visuali[sz]e|work(?:s)?)\b/i;

/** Consumer or producer surplus: an area between demand and a price. */
const SURPLUS_ASK = /\b(?:consumer|producer)\s+surplus\b/i;

const AVERAGE_RATE = /\b(?:mean\s+value\s+theorem|mvt|rolle'?s\s+theorem|average\s+(?:rate|slope|velocity|speed)|secant(?:\s+lines?)?)\b/i;
/** Curves that meet and shift: a market, a tax, a price control — never a supply chain. */
const MARKET_SURE =
  /\b(?:supply\s+and\s+demand|demand\s+and\s+supply|supply\s+curves?|demand\s+curves?|(?:supply|demand)\s+shifts?|shifts?\s+in\s+(?:supply|demand)|price\s+(?:ceilings?|floors?|controls?|caps?)|rent\s+control|minimum\s+wages?|tax(?:es)?\s+on\s+(?:sellers|buyers|producers|consumers|suppliers|goods|imports)|tax\s+incidence|who\s+(?:really\s+)?(?:pays|bears)\s+(?:a|the)\s+(?:\w+\s+)?tax|tariffs?|subsid(?:y|ies|ise|ize|ised|ized)|deadweight(?:\s+loss)?|market\s+equilibrium|equilibrium\s+(?:price|quantity))\b|\btax(?:es)?\b[^.?!]{0,40}\b(?:raise|raises|push|pushes|increase|increases)\s+(?:the\s+)?prices?\b/i;
const MARKET_SOFT = /\b(?:equilibrium|shortages?|surplus(?:es)?|break[- ]?even)\b/i;
const ECON = /\b(?:price|prices|market|markets|buyers|sellers|consumers|producers|economy|economics|goods|costs?|revenue)\b/i;
/** A quantity that changes along a curve: elasticity — of demand, not of rubber. */
const ELASTIC = /\b(?:elasticit(?:y|ies)|(?:price[- ])?(?:in)?elastic)\b/i;
/** What a concept question asks about — a subject's idea, not a lookup ("what's the capital of Peru?" is not one). */
const SUBJECT = /\b(?:theorem|lemma|principle|paradox|equation|formula|derivative|integral|vector|matrix|probability|distribution|variance|entropy|momentum|evolution|photosynthesis|elasticit(?:y|ies)|opportunity cost|inflation|equilibrium|supply|demand|marginal|algorithm|recursion|statistic\w*|correlation|causation|regression|hypothesis|theory)\b/i;
/** …and the words that are a subject only in a subject's conversation: "the law", "the effect of", "interest". */
const SUBJECT_GENERIC = /\b(?:law|effect|energy|force|interest|function|limit)\b/i;
/** A question of what an idea is or means: "what is a derivative?", "what does elasticity mean?". */
const CONCEPT_Q = /^(?:(?:so|ok(?:ay)?|hey|hi),?\s+)?(?:what(?:'s|\s+is|\s+are|\s+does)|what\s+exactly\s+is|define)\b/i;
/** A word looked up: its meaning is a sentence, not an idea to build (a definition of a term, a usage question). */
const LOOKUP = /^(?:(?:so|ok(?:ay)?|hey|hi),?\s+)?(?:define\b|definition\s+of\b|what(?:'s|\s+is)\s+the\s+(?:definition|meaning)\s+of\b|what\s+does\s+(?:the\s+word\s+)?["“'‘]?\w+["”'’]?\s+mean\s+in\b)/i;
/**
 * Motion, asked about: a small simulation to try. Physics by its own words
 * (a projectile, a pendulum, an orbit), or a throw, a jump or a fall WITH the
 * words that make it physics (an angle, a speed, a height, a ball) — "why did
 * the Roman Republic fall?" is history.
 */
const SIM_CORE = /\b(?:projectiles?|trajector(?:y|ies)|pendulums?|orbit(?:s|al|ing)?|oscillat\w*|simple harmonic)\b/i;
const SIM_MOVE = /\b(?:throw(?:n|ing|s)?|launch(?:ed|es|ing)?|kick(?:ed|ing|s)?|toss(?:ed|ing)?|shoot(?:ing|s)?|jump(?:s|ed|ing)?|bounc\w*|swing(?:s|ing)?|springs?|falls?|falling|dropp?(?:ed|ing|s)?)\b/i;
const SIM_PHYS = /\b(?:angles?|degrees?|°|speed|velocity|gravity|heights?|metres?|meters?|m\/s|ball|arrow|cannon|rocket|mass|air resistance|farthest|furthest|highest|range|seconds?|feather|stone)/i;
const SIM_SUBJECT = /\b(?:planets?|moons?|satellites?|earth|sun|electrons?|comets?|asteroids?|spacecraft|rockets?|springs?|mass|masses|bob|balls?|projectiles?|cannon(?:ball)?s?|arrows?|bullets?|missiles?|waves?|particles?|objects?|pendulums?|clock)\b/i;
const simAsk = (t: string) => (SIM_CORE.test(t) && (SIM_SUBJECT.test(t) || SIM_PHYS.test(t))) || (SIM_MOVE.test(t) && SIM_PHYS.test(t));
/** The working, asked for — of mathematics. "Mitosis vs meiosis, step by step" is steps to follow, not TeX. */
const WORKING_ASK = /\b(?:how do (?:i|you|we) (?:solve|find|work out|calculate|complete|factor|simplify|integrate|differentiate)|explain how to (?:solve|find|calculate|factor|simplify|integrate|differentiate|derive|complete)|(?:understand|know|learn) how to (?:solve|integrate|differentiate|factor|simplify|find|complete)|show (?:me )?(?:the )?(?:working|steps|how)|work (?:it |this |that )?(?:out|through)|walk me through (?:solving|the (?:maths|math|algebra|derivation|working))|derive|derivation|complete the square|solve (?:for|this|it|the)|step[- ]by[- ]step)\b/i;
const WORKING_MATH = /\b(?:solve|solving|integrate|differentiate|factori[sz]e|factor|simplify|derive|derivation|complete the square|completing the square|algebra|equation)\b/i;
/** Practising: a question of their own to work out. */
const PRACTICE_ASK = /\b(?:quiz me|test me|check (?:my|if i) understand\w*|practice (?:question|problem)s?|give me (?:a|one|another|some) (?:problem|question|example)s?(?: to try)?|let me try|can i try|another one)\b/i;
/** Their own life or plan, weighed: a decision that is theirs, not a balance sheet of the subject. */
const THEIR_OWN = /\b(?:i|i'm|i've|we|we're|my|our|me|us)\b/i;
/** Work that is not reading an explanation: making something, doing it themselves, checking or fixing. */
const NOT_READING = new Set(['creation', 'practice', 'verification', 'diagnosis', 'execution']);
/** Forms whose job is to show the parts of the answer: with one of these, the reply's own sentence only ties them together. */
const PARTS_FORMS: ReadonlySet<InlineKind> = new Set<InlineKind>(['diagram', 'concepts', 'sequence', 'balance']);
const DIAGRAM_OF: Record<Exclude<PartsShape, 'types'>, DiagramVariant> = { cycle: 'cycle', tree: 'tree', causes: 'causes', effects: 'flow' };

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Which inline forms the last replies used, newest first. */
function usedRecently(history: PresentationInput['history']): InlineKind[][] {
  return history
    .filter((m) => m.role === 'assistant')
    .slice(-2)
    .reverse()
    // a block as written, or as the route reads it back ("[shown inline — chart: …]", lib/inline-ui.ts contentForHistory)
    .map((m) => [...m.content.matchAll(/```[ \t]*ui[ \t]*\n\s*\{\s*"type"\s*:\s*"(\w+)"|\[shown inline — (\w+):/gi)].map((x) => (x[1] ?? x[2]) as InlineKind));
}

export function planPresentation(i: PresentationInput): Presentation {
  // the request under its greeting and its polite lead-in ("tell me about the water cycle"), the way the
  // turn's work was read (lib/runtime/state.ts readWork) — a field named is read as said ("tell me about
  // organic chemistry")
  const raw = normalizeTyping(i.text).trim();
  const t = requestBody(withoutGreeting(raw));
  const x = i.state.exchange;
  const reasons: string[] = [];
  const none = (why: string): Presentation => ({ forms: [], reasons: [why] });
  if (!t) return none('empty');
  // a write-up they asked to read and keep: a document, filed in Content — no inline elements in it
  if (i.state.intent === 'reading') return { forms: [], reasons: ['place:content'], place: 'content' };
  // plain text for greetings, jokes, something personal
  if (x.kind === 'social' || x.kind === 'playful' || x.kind === 'personal') return none(`talk:${x.kind}`);
  // a thing to build, structure to see, a document to read: their own views answer those
  if (i.state.intent !== 'conversation') return none(`view:${i.state.intent}`);

  const offered: InlineKind[] = [];
  const strong: InlineKind[] = [];
  // asked for in so many words this turn ("compare…", "pros and cons", "a timeline"): never held back for
  // having been used before
  const named = new Set<InlineKind>();
  const offer = (k: InlineKind, why: string, fit: 'strong' | 'soft' = 'strong', asked = false): boolean => {
    if (offered.includes(k) || offered.length >= 2) return false;
    // one thing to work with in a reply: a second live element is never offered beside the first
    if (LIVE_KINDS.includes(k) && offered.some((o) => LIVE_KINDS.includes(o))) return false;
    offered.push(k);
    reasons.push(why);
    if (fit === 'strong') strong.push(k);
    if (asked) named.add(k);
    return true;
  };
  const work = i.state.work;
  const domain = i.state.domain;
  const task = x.kind === 'task';
  const nums = numbersIn(t).filter((n) => Math.abs(n) >= 1);
  // a conversation about mathematics, or words that could only be mathematics
  const technical = domain === 'engineering' || domain === 'creative' || domain === 'writing';
  const mathy = domain === 'math' || domain === 'learning' || FORMULA.test(t) || MATH_MARK.test(t);
  const mathRel =
    MATH_SURE.test(t) || MATH_MARK.test(t) || FORMULA.test(t) || (EXP_CURVE.test(t) && domain !== 'business') || (!FINANCE.test(t) && (mathWords(t) >= 2 || (mathWords(t) >= 1 && (domain === 'math' || domain === 'learning') && !technical)));
  const rate = ((RATE_SURE.test(t) && !FINANCE.test(t)) || (RATE_SOFT.test(t) && mathy)) && !NOT_RATE.test(t);
  const livedOn = /\bhow\s+(?:do|can|could|would|will)\s+(?:i|we|you)\s+(?:survive|live|get\s+by|pay|qualify|earn|make\s+ends\s+meet|afford)\b/i.test(t);
  const market = !livedOn && (MARKET_SURE.test(t) || (MARKET_SOFT.test(t) && (ECON.test(t) || domain === 'learning' || domain === 'business')));
  const elastic = ELASTIC.test(t) && (mathy || /\b(?:demand|supply|price|prices|pricing)\b/i.test(t));
  const limitAsk = LIMIT_ASK.test(t) && !NOT_LIMIT.test(t) && !/\bcontinuous\s+(?:integration|deployment|delivery|improvement|learning|monitoring|glucose)\b/i.test(t) && (mathy || /\b(?:x|f\s*\(|function|curve|graph|calculus|continuity|discontinu\w*|removable)\b/i.test(t));
  const areaAsk = (AREA_ASK.test(t) && (mathy || /\b(?:curve|function|calculus|x)\b/i.test(t))) || SURPLUS_ASK.test(t);
  const monopoly = MONOPOLY_ASK.test(t) && (ECON.test(t) || /\b(?:firm|market|output|quantity)\b/i.test(t) || domain === 'learning' || domain === 'business');
  const subject = SUBJECT.test(t) || ((domain === 'math' || domain === 'learning' || domain === 'research') && SUBJECT_GENERIC.test(t)) || mathRel || rate || market || elastic || limitAsk || areaAsk || monopoly || domain === 'math';
  const listAsked = LIST_ASK.test(t) || LIST_LEAD.test(t);
  // somebody's own life — their relationships, grief, feelings, self: no table, no recipe, no diagram of it
  // (lib/runtime/asks.ts PERSONAL_LIFE) — and with a sensitive subject (a diagnosis, debt, a divorce) no
  // scoring block and no balance sheet either
  const personal = tenderText(t);
  // …and what they said they feel ("I'm so sad. should I call my mom or wait?"), which readExchange leaves to the
  // task when a task was read (second adversarial round, November 2026)
  const felt = saysFeeling(raw);
  const tender = personal || !!i.signals.sensitive || felt;
  // …and a person's own life or a feeling, not a sensitive subject: the Great Depression keeps its timeline
  const own = personal || felt;
  // one person's story: never a verdict, a scoring block, a live element or a diagram
  const story = aboutAPerson(t);
  const kind = adviceKind(t, domain);

  // ── the shape of the reply itself, before what may be drawn in it ──
  const deeper = DEEPER.test(t);
  const fullDepth = deeper && (FULL_DEPTH.test(t) || i.length === 'detailed');
  const openWork0 =
    !deeper && !own && !aboutAPerson(t) && x.kind !== 'brainstorm' && !CONCRETE.test(t) && (OPEN_WORK.test(t) || HOW_APPROACH.test(t)) && !['verification', 'diagnosis', 'practice', 'information'].includes(work);
  // a claim put up to be checked (lib/cognition/claims.ts): the verdict first, the parts it rests on to inspect
  const claim = (claimCheck(t) || claimCheck(raw)) && !story && !tender;
  const two = twoNamed(t);
  // a choice that is theirs, between options they named (or a team's change to the business against the
  // status quo): weighed by them. Their decision however they phrase it — "do you think I should take the
  // job or stay?", "what would you do, take the offer or stay?" (read as judgment, lib/cognition/assist.ts)
  // — and never their relationships, their family's grief or a sensitive subject.
  const changing = CHANGE_ASK.test(t) && (domain === 'business' || BUSINESS_OBJECT.test(t));
  // …and never a dinner choice or a sigh ("should I laugh or cry at this point?")
  const casual = CASUAL_PICK.test(t) || /\b(?:laugh\s+or\s+cry|scream\s+or\s+cry|cry\s+or\s+laugh)\b/i.test(t);
  const deciding = !claim && !tender && !casual && !practicalShould(t) && work !== 'creation' && ((two && (DECIDE_ASK.test(t) || WHICH_SHOULD.test(t) || work === 'judgment')) || changing);
  // a choice between options they named is weighed, not scoped as open work ("we need to launch — iOS or Android
  // first?") (second adversarial round, November 2026)
  const openWork = openWork0 && !deciding;
  // options set against each other, as people phrase it — "TCP vs UDP", "Postgres or MongoDB for a chat app?"
  const comparing =
    !deciding && !claim && !personal && !LIFE_VALUES.test(t) && !JOKE.test(t) && !TASTE.test(t) && !casual && work !== 'creation' && x.kind !== 'brainstorm' && (comparisonAsk(t) || (COMPARE_ASK.test(t) && (two || (task && /\band\b/i.test(t)))));
  // one subject's two sides ("pros and cons of remote work"); two subjects are a comparison
  const prosCons = !claim && !deciding && !tender && work !== 'creation' && PROS_CONS.test(t);
  // the parts of something: a cycle, a hierarchy, causes, effects, types (lib/runtime/asks.ts)
  const parts = task && (work === 'explanation' || work === 'information') && x.kind !== 'brainstorm' ? partsShape(t) : null;
  // a ratio, or a relationship with a name, asked what it is — never for a value or a benchmark of it
  const equationAsk = EQUATION_NAME.test(t) && DEFINITION_ASK.test(t) && !EQUATION_VALUE.test(t) && !NOT_THE_TERM.test(t);
  const namedLaw = NAMED_LAW.test(t) && !/\b(?:change|vary|varies|what\s+if|depends?|graph|plot|draw)\b/i.test(t);
  const formulaAsk = equationAsk || namedLaw || SLIDER_FORMULA.test(t);
  // a practical question with an answer: the one thing it hinges on, a default, the few levers
  // (a pick asked for is one too: "recommend me a sci-fi book", "three days in Lisbon — what should I do?")
  const picking = pickAsk(t);
  // "walk me through replacing a bike chain", "could you explain how to file a tax return?": a procedure, asked
  // politely, gets the practical shape the direct "how do I…?" gets
  const procedural = (kind === 'procedure' || kind === 'setup') && work === 'explanation';
  const practical =
    !deeper && !openWork && !claim && !deciding && !comparing && !prosCons && !parts && !formulaAsk && !own && task && (work === 'information' || procedural) && (adviceAsk(t) || picking || procedural);
  // an idea to understand: wanting the reasoning (lib/cognition/assist.ts wantsExplanation, said as a need
  // or a question), or asking what an idea in a subject is — never a lookup, a claim, a choice or a discussion
  const understanding =
    !deeper && !openWork && !deciding && !claim && !practical && !listAsked && task && !LOOKUP.test(t) && !/\bwork\s+for\s+(?:you|me|us|them)\b/i.test(t) &&
    // one person's story ("why did he end things with me?") or one of their own events ("why did the meeting end so
    // early?") is told by a person, not shaped as an idea (adversarial review, November 2026)
    !personal && !aboutAPerson(t) && !OWN_EVENT.test(t) &&
    (work === 'explanation' || (work === 'information' && ((CONCEPT_Q.test(t) && subject) || !!parts || formulaAsk)));
  const shape: ReplyShape | undefined = deeper ? (fullDepth ? 'deeper' : 'layer') : openWork ? 'open' : practical ? 'practical' : understanding ? 'understand' : undefined;
  if (shape) reasons.push(`shape:${shape}`);

  // ── what may be drawn ──
  // a list of their own amounts, with names: a small chart says it at a glance
  if (namedAmounts(t) >= 3 && nums.length <= 24 && (MONEY.test(t) || sharedUnit(t) >= 3)) offer('chart', 'chart:their-numbers');
  // the working, asked for — of mathematics, never the working that is theirs, never under the guard. Asked
  // for, it comes before anything inferred: "how do I solve this by completing the square?" wants the lines
  const mathWorking = !NOT_A_PROBLEM.test(t) && (MATH_OBJECT.test(t) || domain === 'math' || FORMULA.test(t) || MATH_MARK.test(t)) && (mathy || WORKING_MATH.test(t));
  if (!i.guard && !i.ownReasoning && WORKING_ASK.test(t) && mathWorking) offer('steps', 'steps:working');
  // …and when Socria only scaffolds it, the working faded: the first lines shown, the last step theirs (never under the guard)
  else if (!i.guard && i.ownReasoning && i.scaffold && WORKING_ASK.test(t) && mathWorking) offer('steps', 'steps:faded');
  // a relationship they could discover by changing a number: a graph to change (under the guard too —
  // nothing that would be the answer is marked on it). Which graph follows the idea: rates on a curve
  // (the chord and the tangent that matches it), curves that meet (a tax shifting supply), a point along
  // a curve (elasticity), or the curve's own shape.
  // a quick plot of one function asked for (lib/runtime/plot-ask.ts): that function, drawn in place
  const plotted = quickPlot(t);
  // which picture the idea needs: the asked plot first; then the idea's own construction — a hole and a value for a
  // limit, an area or its rectangles for an integral, marginal revenue against cost for a price-setter, a surplus
  // between demand and price — before the general ones
  // an expert (in their own words: "I'm a mathematician") asking about the idea gets it in notation, compactly — the
  // picture a beginner is shown is in their way — unless they asked to see it. A plot they asked for is still drawn.
  const compact = i.signals.expertise === 'expert' && !/\b(?:plot|graph|draw|sketch|show|visuali[sz]e|picture|diagram|see)\b/i.test(t);
  const variant: GraphVariant | null = plotted ? 'plot' : compact ? null : limitAsk ? 'limit' : areaAsk ? 'area' : monopoly ? 'monopoly' : rate ? (AVERAGE_RATE.test(t) ? 'rate' : 'tangent') : market ? 'market' : elastic ? 'point' : mathRel ? 'curve' : null;
  let graph: GraphVariant | undefined;
  // (not where steps were asked for: the steps are the answer, and a second picture of the same thing is not)
  // (and never on a problem they are working or a proof: "prove by induction that 1 + 2 + … + n = n(n+1)/2" has
  // an equals sign, not a curve to see — the working is the answer there)
  const proving = /\b(?:prove|proof|induction|show\s+that)\b/i.test(t);
  const liveOk = !tender && !story;
  if (variant && liveOk && !namedLaw && work !== 'creation' && work !== 'diagnosis' && (work !== 'verification' || /\b(?:plot|graph|draw|sketch|show)\b/i.test(t)) && (plotted || (work !== 'practice' && !proving)) && x.kind !== 'brainstorm' && !claim && !comparing && (plotted || !STEPS_ASK.test(t)) && (plotted || understanding || WHY_HOW.test(t) || FORMULA.test(t) || variant === 'limit' || (variant === 'area' && /\b(?:riemann|surplus|area\s+under)\b/i.test(t)))) {
    // (a limit is what a curve approaches against what it takes: asked as plainly as "what is the limit?", the picture
    // is the explanation — and so are rectangles under a curve, and a surplus)
    if (offer('graph', `graph:${variant}`)) graph = variant;
  }
  // motion, or something that unfolds in time, asked why or how: one small simulation to try
  if (liveOk && work !== 'creation' && simAsk(t) && WHY_HOW.test(t)) offer('sim', 'sim:try-it');
  // forces on a body, asked about: the arrows and what they add up to (not their own working, not under the guard)
  // ("draw a free body diagram" is asking to see it, not to make something of their own)
  if (liveOk && !i.guard && !i.ownReasoning && (work !== 'creation' || /\b(?:draw|show|sketch)\b/i.test(t)) && FORCES_ASK.test(t) && !offered.includes('graph') && !offered.includes('sim')) offer('vectors', 'vectors:forces');
  // an algorithm, asked how it works: its steps on a small example, to step through (never code they are writing)
  if (liveOk && !i.ownReasoning && work !== 'creation' && work !== 'diagnosis' && ALGO_ASK.test(t) && ALGO_HOW.test(t) && !/```/.test(t)) offer('trace', 'trace:algorithm');
  // a claim to check: the verdict, and the parts it rests on to open and doubt (not laid out under the guard)
  if (claim && !i.guard) offer('claim', 'claim:inspect', /\?\s*$/.test(t) ? 'strong' : 'soft');
  // a choice that is theirs: a decision they weigh, not one that leans for them — with Socria's read, once, when asked
  const lean = ASKS_PICK.test(t);
  if (deciding) offer('decide', lean ? 'decide:asked-pick' : 'decide:their-choice', 'strong', true);
  // one subject's two sides, weighed as their own course, is a decision too ("pros and cons of quitting my job")
  else if (prosCons && THEIR_OWN.test(t) && (work === 'judgment' || OWN_COURSE.test(t))) offer('decide', 'decide:their-choice', 'strong', true);
  // two things set against each other — the facts side by side; their own, weighed by them
  else if (comparing || (prosCons && two)) {
    if (i.ownJudgment && THEIR_OWN.test(t) && work === 'judgment') offer('decide', 'decide:their-choice', 'strong', true);
    else offer('compare', 'compare:options', 'strong', true);
  }
  // one subject's two sides: for and against, and the one thing it turns on — not two bulleted lists
  // (offered, not fitted, when it is about something of theirs: "pros and cons of remote work for my team")
  else if (prosCons && !i.guard) offer('balance', 'balance:one-subject', THEIR_OWN.test(t) ? 'soft' : 'strong', true);
  // a quantity that moves with something they can vary — unless a graph or a simulation already shows it
  if (!i.guard && liveOk && !offered.includes('graph') && !offered.includes('sim')) {
    // "do I need to file taxes if I made $5000?" asks whether, not what if: a threshold, said in a sentence
    const eligibility = /^(?:do|does|can|is|are|am|will)\s+(?:i|we|you|my)\s+(?:\w+\s+)?(?:need|have\s+to|qualify|owe|pay|count|get\s+taxed)\b/i.test(t);
    const whatIf = !eligibility && (WHAT_IF.test(t) || (WHAT_IF_WEAK.test(t.replace(/\d\s?percent\b/gi, '%')) && MONEY_OR_PCT.test(t)));
    // "how much is a 12 pack of beer?" and "the iPhone 16 Pro" ask a price, which is looked up, not varied
    const priceAsked = /^how\s+much\s+(?:is|are|does|do)\s+(?:a|an|the|one)?\s*[^?$£€%]{2,60}?(?:\s+cost)?\s*\??\s*$/i.test(t);
    const amounts = AMOUNT.test(t);
    if ((whatIf && amounts && !priceAsked) || (FORMULA.test(t) && /\b(?:change|vary|depends?|how does|what happens)\b/i.test(t)))
      offer('slider', 'slider:what-if', AMOUNT_TWO.test(t) || FORMULA.test(t) ? 'strong' : 'soft');
    // a base rate with their numbers: the posterior moves as they move the rate, which is the whole surprise
    else if (BASE_RATE.test(t)) offer('slider', 'slider:base-rate');
    // a known relationship, asked to understand: sensible defaults to move, said to be defaults
    else if (SLIDER_FORMULA.test(t) && (work === 'explanation' || work === 'information' || work === 'execution')) offer('slider', 'slider:formula', understanding ? 'strong' : 'soft');
  }
  // a ratio or a formula's definition, asked — or a named law, asked what it means: the equation and its
  // terms, nothing in it to vary
  // (not beside a comparison: "the difference between standard deviation and variance" is answered side by side,
  // the formulas in its rows — an equation as well said it twice)
  if ((equationAsk || namedLaw) && !offered.includes('slider') && !offered.includes('graph') && !offered.includes('compare')) offer('equation', namedLaw ? 'equation:named-law' : 'equation:definition');
  // practising, asked for in so many words ("let me try one"): a question they work out and check, their
  // own work — a question, so only where one may go. A problem handed over ("solve 2x + 3 = 7") is not this.
  if (i.questions > 0 && PRACTICE_ASK.test(t)) offer('check', 'check:practice');
  // practical writing they handed over: editable in place
  if (work === 'creation' && PRACTICAL_TEXT.test(t) && !i.ownWriting) offer('draft', 'draft:practical-writing');

  // The parts of the answer, shown as parts — never under the guard (laid out to read instead of working it),
  // never in place of a list asked for, and never beside a graph or a simulation that already shows the idea.
  const shown = offered.includes('graph') || offered.includes('sim') || offered.includes('slider');
  const reading = !i.guard && !listAsked && x.kind !== 'brainstorm';
  if (parts && reading && !shown && understanding) {
    if (parts === 'types') offer('concepts', 'concepts:types');
    else if (offer('diagram', `diagram:${DIAGRAM_OF[parts]}`)) reasons.push(`parts:${parts}`);
  }
  // the parts of a subject, to explore one at a time — an overview, not a list of terms and definitions
  if (reading && !own && !NOT_READING.has(work) && (OVERVIEW.test(t) || FIELD.test(raw))) offer('concepts', 'concepts:overview');
  // events whose order is the point (not under the guard: the gate would drop it, lib/inline-ui.ts) — a
  // timeline asked for by name is the form that fits; a history may be told as a story, so it is offered
  // a timeline of their own events ("what happened in the meeting?") is theirs: Socria was not there
  const timeline = TIMELINE_ASK.test(t) && !ownTimeline(t) && !personInRequest(t) && !own;
  // a cycle's stages are its diagram, and a method's lines are its working: shown once, not twice
  const partsShown = offered.some((k) => PARTS_FORMS.has(k) || k === 'steps');
  if (partsShown || own) {
    // the parts are already shown, or the turn is somebody's own life: no steps or timeline beside it
  } else if (reading && timeline && !shown) offer('sequence', 'sequence:timeline', TIMELINE_NAMED.test(t) || (/\bwhat\s+happened\b/i.test(t) && HISTORY.test(t)) ? 'strong' : 'soft', TIMELINE_NAMED.test(t));
  // steps to follow — never the steps of something that is theirs to work out
  else if (!i.guard && !listAsked && !i.ownReasoning && work !== 'creation' && STEPS_ASK.test(t)) offer('sequence', 'sequence:steps', 'strong', true);
  // a trip's days, in order: Day 1, Day 2 — the picks laid out where they happen
  else if (picking && TRIP.test(t) && !i.guard && !listAsked) offer('sequence', 'sequence:itinerary');
  // a practical procedure — setting something up, hiring, a recipe: its steps, in order
  else if (practical && !i.guard && !listAsked && !i.ownReasoning && (kind === 'setup' || kind === 'procedure')) offer('sequence', 'sequence:steps');
  // how a system works, asked about as a whole: its ordered parts may carry it (the four downs)
  else if (!i.guard && !listAsked && !i.ownReasoning && work !== 'creation' && x.kind !== 'brainstorm' && HOW_IT_WORKS.test(t) && !shown && !offered.includes('trace')) offer('sequence', 'sequence:how-it-works', 'soft');
  // a practical question about pricing or growth: the options it comes down to, side by side
  if (practical && !offered.length && (kind === 'price' || kind === 'grow')) {
    const priced = kind === 'price';
    if (priced && nums.length >= 1 && !i.guard) offer('slider', 'slider:what-if');
    else offer('compare', priced ? 'compare:pricing-models' : 'compare:channels');
  }
  // a check, or a call Socria may weigh in on: the answer up top, the steps folded under it. Not an
  // explanation — prose is the explanation — and never reasoning that is theirs to do or a decision
  // that is theirs to make. A comparison already lays the reasoning out, and a quick call ("what tip
  // should I leave?") needs none.
  const call = work === 'judgment' && !i.ownJudgment && !tender && words(t) >= 10 && !offered.includes('compare') && !offered.includes('decide');
  if (!i.guard && !i.ownReasoning && ((work === 'verification' && words(t) >= 6) || call) && x.kind !== 'brainstorm' && offer('reasoning', 'reasoning:steps', 'soft') && work === 'verification')
    reasons.push('reasoning:check-work', i.state.understanding.wrong > 0 ? 'check:slips' : i.state.understanding.right > 0 ? 'check:holds' : 'check:open');

  // ── the ways onward, after the useful part, never instead of it ──
  const sideBySide = offered.includes('compare') || offered.includes('balance');
  // an open piece of work: the ways it could go next, to open one at a time
  if (openWork && !offered.includes('draft')) offer('paths', 'paths:open-work');
  // one layer down: the next layers, to choose how far to go
  else if (shape === 'layer' && offer('paths', 'paths:next-layer', 'soft')) {
    // the next ways onward are of the thread's kind: what the work could do next, what else matters, or deeper
    const prev = [...i.history].reverse().find((m) => m.role === 'user')?.content ?? '';
    reasons.push(OPEN_WORK.test(prev) || HOW_APPROACH.test(prev) ? 'layer:work' : adviceAsk(prev) ? 'layer:more' : 'layer:idea');
  }
  // a practical question: the rest of what matters, to open when they want it — not every tip there is
  else if (practical && !picking && (['price', 'grow', 'setup'].includes(kind) || MANY_ASK.test(t) || listAsked || domain === 'business')) offer('paths', 'paths:more', 'soft');
  // an idea with depth to it: the ways deeper (the formal statement, why a condition matters, where it is used),
  // opened one at a time instead of written out unasked — not for an everyday why, which a sentence answers,
  // and not beside a comparison, which already lays it out (unless they are learning it)
  else if (understanding && (!sideBySide || domain === 'learning') && (offered.includes('graph') || subject || domain === 'learning' || domain === 'research')) offer('paths', 'paths:deeper', 'soft');
  // many of something asked for (tips, ways, reasons): the few that matter most in the reply, the rest behind paths
  else if (task && (MANY_ASK.test(t) || listAsked) && !offered.length) offer('paths', 'paths:more', 'soft');
  // an open request: a few directions to tap instead of typing — a question, so only where one may go
  else if (i.questions > 0 && words(t) <= 8 && OPEN_ASK.test(t) && !t.includes('?')) offer('options', 'options:open-request', 'soft');

  // not the same form a third time running — unless asked for by name this turn
  const recent = usedRecently(i.history);
  const forms = offered.filter((k) => named.has(k) || !(recent.length === 2 && recent.every((r) => r.includes(k))));
  if (forms.length < offered.length) reasons.push('repeat-held');
  const fits = strong.filter((k) => forms.includes(k));
  return {
    forms,
    reasons: reasons.length ? reasons : ['nothing-fits'],
    ...(shape ? { shape } : {}),
    ...(graph && forms.includes('graph') ? { graph } : {}),
    ...(parts && parts !== 'types' && forms.includes('diagram') ? { diagram: DIAGRAM_OF[parts] } : {}),
    ...(fits.length ? { strong: fits } : {}),
    ...(shape === 'understand' && (FULL_DEPTH.test(t) || i.length === 'detailed') ? { depth: true, ...(FULL_DEPTH.test(t) ? {} : { depthFromLength: true }) } : {}),
    ...(i.guard ? { guard: true } : {}),
    ...(shape === 'understand' && parts ? { parts } : {}),
    ...(lean && forms.includes('decide') ? { lean: true } : {}),
    ...(i.questions <= 0 ? { noQuestion: true } : {}),
    ...(mathWorking ? { math: true } : {}),
    ...(forms.includes('steps') && reasons.includes('steps:faded') ? { stepsFaded: true } : {}),
  };
}

// ── what the reply is told ───────────────────────────────────────────
//
// Every example below is a valid instance of its element — it parses, passes
// the gate and draws (test/inline-contract.test.mjs) — because a model copies
// an example's shape exactly, and an example its own sanitizer refuses teaches
// the model to write an element that is never shown. Each ends on what the
// prose around it is for: the element carries the parts, the words frame them.

/**
 * Each form's grammar, as short as it can be and still be written right.
 *
 * NEUTRAL EXAMPLES (adversarial review, November 2026). A model copies an
 * example's content as readily as its shape: with the French Revolution as the
 * timeline example, the microeconomics overview as the overview example and
 * the startup-or-the-bank as the decision, those turns came back as the
 * example. So every example is on a topic nobody is likely to ask about in
 * the same breath, no two share a domain, and none holds a placeholder value
 * ("a few words why") a model would copy as content.
 */
const GRAMMAR: Record<InlineKind, string> = {
  chart:
    '{"type":"chart","kind":"bar","title":"Hours this week","x":["Reading","Running","Cooking"],"series":[{"name":"Hours","values":[6,4,3]}],"unit":"h","basis":"given"} — kind bar, line or pie; values exactly as they gave them (basis "given") or from a source this turn ("source"); figures from anywhere else are not drawn. Your prose: what stands out, in a sentence.',
  slider:
    '{"type":"slider","title":"Monthly payment","formula":"p*(r/1200)/(1-(1+r/1200)^(-n))","result":{"label":"Monthly payment","unit":"$","digits":0},"vars":[{"name":"p","label":"Loan","min":1000,"max":60000,"step":500,"value":12000,"unit":"$"},{"name":"r","label":"Rate","min":1,"max":15,"step":0.25,"value":6,"unit":"%"},{"name":"n","label":"Months","min":12,"max":84,"step":12,"value":48}]} — 1–3 single-letter variables at their numbers, or sensible defaults said to be defaults; the result is computed live (plain arithmetic, ^ for powers), so state none you have not computed. Your prose: what moves it most.',
  compare:
    '{"type":"compare","options":["A fountain pen","A ballpoint"],"rows":[{"label":"Writing feel","values":["Glides, no pressure","Needs pressure"]},{"label":"Upkeep","values":["Ink and cleaning","None"]}]} — 2–4 options and the 2–6 points that separate them, a few words a cell; "pick" (an option\'s index) only when what they told you settles it; figures you are unsure of marked unchecked. Your prose: the difference that decides most cases, and the pick if there is one.',
  reasoning:
    '{"type":"reasoning","summary":"It pays only if you stay past the break-even","steps":["The closing costs come back through the lower payment","Three years is shorter than that"]} — the reasoning folds under the answer. Your prose: the answer, in a sentence.',
  options:
    '{"type":"options","options":[{"label":"Start from the outline"},{"label":"Fix the introduction"}]} — 2–4 directions to tap instead of typing; then do not also ask in words. Your prose: a line on where you could start, not a question.',
  draft:
    '{"type":"draft","kind":"email","title":"Running late","text":"Hi,\\n\\nI am running about ten minutes late. Please start without me and I will catch up.\\n\\nThanks"} — the text they asked for, whole, editable in place, with only what they told you in it. Your prose: a line around it at most.',
  concepts:
    '{"type":"concepts","title":"Bookbinding","items":[{"name":"Signatures","gist":"folded sheets in groups","detail":"Folded, nested, then sewn through the fold.","links":["Sewing"]},{"name":"Sewing","gist":"thread through the folds"},{"name":"Casing in","gist":"the book into its cover"}]} — 3–7 parts of the subject; "detail" is read when one is opened; links name other items. Your prose: a short introduction, what holds the parts together. Do not also list them.',
  sequence:
    '{"type":"sequence","kind":"steps","title":"Waxing a snowboard","items":[{"label":"Clean the base"},{"label":"Drip wax from a warm iron","detail":"keep the iron moving"},{"label":"Iron it in, let it cool, scrape it thin"}]} — 3–8 in order, only when the order is the point; kind "timeline" gives each a "when" ("1840"). Your prose: why the order matters, in a line; the items are not numbered again in prose.',
  paths:
    '{"type":"paths","items":[{"label":"Map who decides","gist":"the people whose yes it needs"},{"label":"Choose the first test","gist":"the smallest thing that shows it works"}]} — 2–4 ways the work could go next, a few words each; opening one sends it as their next message. Ways to explore, not questions. Your prose: the useful part, above it.',
  decide:
    '{"type":"decide","title":"Which allotment plot","options":["The sunny plot","The plot by the tap"],"rows":[{"label":"Sun","scores":[3,1]},{"label":"Carrying water","scores":[1,3],"note":"the tap is a few steps away"}]} — a choice that is theirs: 2–4 options, 2–5 things it rests on (from what they said matters), your honest first reading of each (0 poor – 3 strong, in option order). They set how much each matters; the leaning is computed from their weights, so name no winner in your prose. Your prose: the one thing it turns on, in a sentence or two; the rows carry the rest.',
  graph:
    '{"type":"graph","title":"Reshape a parabola","expr":"a*x^2+b*x+c","x":[-6,4],"params":[{"name":"a","value":1,"min":-3,"max":3,"step":0.5},{"name":"b","value":2,"min":-6,"max":6,"step":1},{"name":"c","value":-1,"min":-5,"max":5,"step":1}],"features":["turning","roots","intercept"],"predict":{"prompt":"If b doubles, which way does the vertex move?","options":["Left","Right","It stays put"]}} — y over x and 0–3 single-letter parameters they drag; turning points, roots and the y-intercept are found on the curve live, so state none you have not computed. "predict" (optional) has them commit before they move anything: use it when the point is a relationship they can discover. Your prose: one or two lines — what to try in it.',
  claim:
    '{"type":"claim","claim":"Ostriches bury their heads in the sand","verdict":"fails","parts":[{"text":"They lower their heads to the nest to turn their eggs","holds":"yes","basis":"observations of nesting birds"},{"text":"They hide by burying their heads","holds":"no","basis":"threatened birds lie flat or run"}]} — the claim inspected: verdict "holds", "fails", "partly" or "unsettled"; 2–5 parts it rests on, each "yes", "no", "partly" or "unclear", with what that rests on in a few words — the kind of evidence, never a study, figure or source you are not sure of. Your prose: the verdict and the one reason that settles it, in a sentence or two; the parts carry the rest, so do not also list them. They can open each part and say which one they doubt.',
  sim:
    '{"type":"sim","title":"Throw at 10 m/s","x":"v*cos(a*pi/180)*t","y":"v*sin(a*pi/180)*t-4.9*t^2","t":[0,"2*v*sin(a*pi/180)/9.8"],"view":{"x":[0,15],"y":[0,8]},"params":[{"name":"a","label":"angle","value":45,"min":5,"max":85,"step":1,"unit":"°"},{"name":"v","label":"speed","value":10,"min":2,"max":12,"step":1,"unit":"m/s"}],"readouts":[{"label":"range","expr":"v^2*sin(2*a*pi/180)/9.8","unit":"m","digits":1}],"predict":{"prompt":"Throw it half as fast again. How much further does it land?","options":["Half as far again","Over twice as far","About the same"]}} — a path over time t with 1–3 parameters; the view holds the path at every setting; when it ends and its readings are formulas, computed live, and each setting they try stays on the picture. Only for one relationship worth trying, never a dashboard. Your prose: what to try, in a line.',
  check:
    '{"type":"check","prompt":"Where is the vertex of y = 2x² − 8x + 3?","label":"x","answer":"-(-8)/(2*2)","explain":"x = −b/2a = 8/4 = 2"} — a question they work out and check: "answer" is plain arithmetic the engine evaluates, and "explain" shows only after they try. To let them try, never instead of explaining. Your prose: what it practises — never its answer.',
  steps:
    '{"type":"steps","title":"Complete the square","lines":[{"tex":"y = x^2 - 8x + 10"},{"tex":"= (x^2 - 8x + 16) - 16 + 10","why":"half of −8, squared, makes a perfect square"},{"tex":"= (x-4)^2 - 6"}],"check":{"prompt":"Now you: where is the vertex of y = x² + 2x − 5?","label":"x","answer":"-2/2"}} — the working as lines of maths (TeX), with their own numbers when they have them; "why" folds under a line; "check" (optional) gives them one like it to do. Never the working that is theirs to do. Your prose: the method in a line; the lines carry the working.',
  diagram:
    '{"type":"diagram","view":"flow","title":"How a fever starts","nodes":[{"id":"a","label":"An infection"},{"id":"b","label":"Immune signals released","detail":"they reach the brain through the blood"},{"id":"c","label":"The brain raises its set point"},{"id":"d","label":"Shivering heats the body"}],"edges":[["a","b"],["b","c"],["c","d"]]} — a chain from cause to effect (it may branch); 3–9 nodes, labels a few words, "detail" a line read when opened. Your prose: what drives it, in a sentence; the nodes carry the parts — do not also list them.',
  balance:
    '{"type":"balance","subject":"Owning a hot tub","for":[{"text":"Unwinding without leaving home","detail":"no booking, no travel"},{"text":"Warmth for stiff muscles"}],"against":[{"text":"Power and water bills"},{"text":"Weekly cleaning and chemicals"}],"turns_on":"how often you would really use it"} — one subject, 2–4 points each side, a few words each, "detail" read when opened; "turns_on" is the one thing that decides which side wins for most people. Your prose: that one thing, in a sentence; do not also list the sides.',
  vectors:
    '{"type":"vectors","title":"A box pulled on a rough floor","body":"box","unit":"N","vectors":[{"label":"pull","mag":"p","angle":30},{"label":"friction","mag":12,"angle":180},{"label":"weight","mag":49,"angle":270},{"label":"normal","mag":"49-p*sin(30*pi/180)","angle":90}],"params":[{"name":"p","label":"pull","value":20,"min":0,"max":40,"step":1,"unit":"N"}]} — forces on one body: 1–5 vectors, each a size ("mag", never negative) and a direction ("angle", degrees from the positive x-axis, anticlockwise: 0 right, 90 up, 180 left, 270 down), numbers or formulas in up to three parameters they slide; their sum is drawn and read out, live ("resultant":false to leave it off). Keep the physics true: a normal force that depends on the pull is a formula of it. Your prose: what to try, and what the sum tells them — the readings carry the numbers.',
  trace:
    '{"type":"trace","title":"Binary search for 23","kind":"array","steps":[{"cells":[2,5,8,12,16,23,38],"pointers":{"lo":0,"hi":6,"mid":3},"mark":[3],"note":"Middle is 12; 23 is bigger, so drop the left half."},{"cells":[2,5,8,12,16,23,38],"pointers":{"lo":4,"hi":6,"mid":5},"mark":[5],"note":"Middle is 23: found it, at index 5."}]} — an algorithm on a small example: 2–12 steps, each the cells after that step (at most 16, a few characters each), "mark" the positions it is looking at, "done" the ones settled, "pointers" named positions, and a short "note" on what the step did. Work every step out yourself before writing it: they read it step by step, and a wrong state teaches the wrong thing. Your prose: the idea in a sentence; the steps carry the rest.',
  equation:
    '{"type":"equation","tex":"\\\\text{mpg} = \\\\frac{\\\\text{miles}}{\\\\text{gallons}}","terms":[{"sym":"miles","means":"how far you drove"},{"sym":"gallons","means":"the fuel it took"}],"example":{"tex":"\\\\frac{300\\\\text{ miles}}{10\\\\text{ gallons}} = 30\\\\text{ mpg}"}} — the definition as one equation (TeX), each term a line, and one worked example (TeX, optional). Your prose: what it tells you, in a sentence.',
};

/** A known relationship to understand, at sensible defaults: the quantity grows, and they move what it grows with. */
const SLIDER_FORMULA_EX =
  '{"type":"slider","title":"Money left to grow","formula":"p*(1+r/100)^t","result":{"label":"After t years","unit":"$","digits":0},"vars":[{"name":"p","label":"Start","min":100,"max":20000,"step":100,"value":1000,"unit":"$"},{"name":"r","label":"Rate","min":0,"max":12,"step":0.5,"value":5,"unit":"%"},{"name":"t","label":"Years","min":1,"max":40,"step":1,"value":10}]} — 1–3 single-letter variables at sensible defaults said to be defaults, so a number is never mistaken for advice; the result is computed live (plain arithmetic, ^ for powers), so state none you have not computed. Your prose: what moves it most.';
/** A base rate, with their numbers: the chance a positive is real moves as they move the rate. */
const SLIDER_BASE_RATE =
  '{"type":"slider","title":"A positive test, read right","formula":"100*s*b/(s*b+f*(100-b))","result":{"label":"Chance it is real","unit":"%","digits":1},"vars":[{"name":"b","label":"Base rate","min":0.1,"max":20,"step":0.1,"value":1,"unit":"%"},{"name":"s","label":"Sensitivity","min":50,"max":100,"step":1,"value":99,"unit":"%"},{"name":"f","label":"False positives","min":0.5,"max":20,"step":0.5,"value":5,"unit":"%"}]} — their numbers at their values (a rate of 1 in 1000 is 0.1%); the result is computed live, so state none you have not computed. Your prose: why the answer surprises, in a sentence.';
/**
 * Their own work, checked — shown the shape of the verdict the engine reached
 * (lib/core4 verify): a slip only when the engine refuted their answer, that it
 * holds when it confirmed it, and when it checked nothing, a check that may go
 * either way. An example that always slipped taught every check to find a slip
 * (adversarial review, November 2026).
 */
const CHECK_SLIPS =
  '{"type":"reasoning","summary":"The first step is where it slips","steps":["Multiplying 90 by 40 counts the minutes as hours","90 minutes is 1.5 hours, so it is 1.5 × 40 = 60 miles"]} — the check folds under the verdict: the first place it goes wrong, then what holds from there. Your prose: the verdict, in a sentence.';
const CHECK_HOLDS =
  '{"type":"reasoning","summary":"It holds: 60 miles","steps":["90 minutes is 1.5 hours","1.5 hours at 40 mph is 1.5 × 40 = 60 miles"]} — the check folds under the verdict: that it holds, and why. Your prose: that it holds, first, in a sentence; there is nothing to correct.';
const CHECK_OPEN =
  '{"type":"reasoning","summary":"It holds: 60 miles","steps":["90 minutes is 1.5 hours","1.5 hours at 40 mph is 1.5 × 40 = 60 miles"]} — the check folds under the verdict: whether it holds and why, or, only if something does not, the first place it goes wrong ("The first step is where it slips"). It may well be right: check it before you say either. Your prose: the verdict, in a sentence.';
/** A decision they asked Socria's read on: still weighed by them, with Socria's lean said once and marked as its own. */
const DECIDE_LEAN =
  '{"type":"decide","title":"Which allotment plot","options":["The sunny plot","The plot by the tap"],"rows":[{"label":"Sun","scores":[3,1]},{"label":"Carrying water","scores":[1,3],"note":"the tap is a few steps away"}]} — a choice that is theirs: 2–4 options, 2–5 things it rests on (from what they said matters), your honest first reading of each (0 poor – 3 strong, in option order). They set how much each matters, and the leaning is computed from their weights. They asked for your read, so give it once, after the block, marked as yours and tied to what matters to them ("If carrying water decides it, the plot by the tap"). Your prose: the one thing it turns on, and that read.';

/** A timeline is a sequence too: what changes is that every item has its date, and the prose names the turning point. */
const SEQUENCE_TIMELINE =
  '{"type":"sequence","kind":"timeline","title":"The first postage stamp","items":[{"label":"Rowland Hill proposes prepaid post","when":"1837"},{"label":"The Penny Black goes on sale","when":"1840"},{"label":"The Penny Red replaces it","when":"1841"}]} — 3–8 events in order, each with its "when"; "detail" (optional) is read when opened. Your prose: the turning point, in a sentence; the items carry the dates.';

/**
 * The ways onward, by what they lead to: for an idea, the ways deeper into it;
 * for practical advice, the rest of what matters; one layer down, the next.
 * An example about work, shown on a question about an idea, gets copied as
 * work ("Sketch the first five minutes" under the mean value theorem) — and an
 * example about one idea gets copied onto every other ("Why continuity
 * matters" under the types of machine learning).
 */
const PATHS_DEEPER =
  '{"type":"paths","items":[{"label":"Where it breaks down","gist":"the case it does not cover"},{"label":"Why the condition matters","gist":"what goes wrong without it"}]} — 2–4 ways deeper into this idea, a few words each, such as the formal statement, why a condition matters, where it is used; never the way they just opened; opening one sends it as their next message. Ways to explore, not questions. Your prose: the idea itself, above them.';
const PATHS_MORE =
  '{"type":"paths","items":[{"label":"Watering in a heatwave","gist":"when twice a day beats once"},{"label":"Feeding the soil","gist":"what to add, and when"}]} — 2–4 of what else matters here, a few words each; opening one sends it as their next message. Your prose: the few that matter most; what you left out goes here.';
/**
 * One layer down, the next ways onward follow what the thread is: the work's
 * next moves, the rest of the practical question, or further into the idea —
 * each on its own example, so the way just opened (copied, perhaps, from the
 * first turn's example) is never the one offered again.
 */
const PATHS_NEXT_WORK =
  '{"type":"paths","items":[{"label":"Who holds the keys","gist":"and who opens up on Saturdays"},{"label":"A watering rota","gist":"so August is covered"}]} — 2–4 ways the work could go from here, a few words each — never the way they just opened; opening one sends it as their next message. Ways to explore, not questions. Your prose: the useful part, above it.';
const PATHS_NEXT_MORE =
  '{"type":"paths","items":[{"label":"Checking the queen","gist":"what a healthy brood looks like"},{"label":"Feeding in winter","gist":"what to give them, and when"}]} — 2–4 of what else matters from here, a few words each — never the way they just opened; opening one sends it as their next message. Your prose: what to do, above it.';
const PATHS_NEXT_IDEA =
  '{"type":"paths","items":[{"label":"Why the gnomon tilts","gist":"it points at the pole"},{"label":"The equation of time","gist":"why sundial noon drifts"}]} — 2–4 ways further in from here, a few words each — never the way they just opened, nor one the conversation already took; opening one sends it as their next message. Ways to explore, not questions. Your prose: the layer itself, above them.';

/**
 * Which graph fits the idea: the same element, shown the construction the
 * idea needs — so a question about the mean value theorem is shown a chord
 * and the tangent that matches it, not a parabola to reshape.
 */
const GRAPH_MARKS = ' Everything marked on it — turning points, roots, crossings, slopes, where a tangent matches a chord, the readings — is computed on the curve as it is now, so state no value you have not computed.';
const GRAPH_TAIL = GRAPH_MARKS + ' Your prose: one or two lines — what to try in it.';
const GRAPH_GRAMMAR: Record<GraphVariant, string> = {
  plot:
    '{"type":"graph","title":"y = x²","expr":"x^2","x":[-3,3],"params":[],"features":["turning","roots","intercept"]} — the function exactly as they wrote it, over the range they gave (or one that shows its shape); no parameters unless they asked to vary something. One line of prose at most: what to notice, never a value you have not computed. If they want to come back to it, Keep files it in Artifacts.' + GRAPH_TAIL,
  curve: GRAMMAR.graph,
  rate:
    '{"type":"graph","title":"Average slope, matched","expr":"x^3-3*x","x":[-2.5,2.5],"params":[{"name":"a","value":-1.5,"min":-2.5,"max":2.5,"step":0.1},{"name":"b","value":2,"min":-2.5,"max":2.5,"step":0.1}],"chord":["a","b"],"features":["mean-value"]} — rates on a curve: y over x and up to three single-letter parameters. "chord" names two parameters that are x positions: the chord between them and its slope (the average rate) are drawn, and they drag its ends along the curve; "mean-value" marks where a tangent runs parallel to the chord — or says why none does (a corner, a break). For the rate at one point: "tangent":"p" with a parameter p, the tangent there and its slope, live. Pick a curve that shows the idea at a glance.' + GRAPH_TAIL,
  tangent:
    '{"type":"graph","title":"The slope at a point","expr":"x^2","x":[-3,3],"params":[{"name":"p","label":"point","value":1,"min":-2.5,"max":2.5,"step":0.1}],"tangent":"p"} — the rate at a point: "tangent" names a parameter that is an x position; the tangent there and its slope are drawn live, and they drag the point along the curve. For the average over an interval instead, "chord":["a","b"] draws the chord between two such positions and its slope. Pick a curve that shows the idea at a glance.' + GRAPH_TAIL,
  market:
    '{"type":"graph","title":"A tax on sellers","expr":"10-x","label":"demand","curves":[{"expr":"2+x+t","label":"supply"}],"x":[0,10],"params":[{"name":"t","label":"tax","value":0,"min":0,"max":4,"step":0.5}],"features":["crossings"]} — curves that meet: the first curve and one or two more ("curves") over the same x and parameters (quantity across, price up), each with a label; "crossings" marks where they meet, live, and where they met at first stays visible as they change things.' + GRAPH_TAIL,
  limit:
    '{"type":"graph","title":"The limit, and the value","expr":"(x^2-1)/(x-1)","x":[-1,3],"params":[{"name":"p","label":"x","value":0.2,"min":-0.8,"max":2.8,"step":0.05}],"at":["p"],"points":[{"x":1,"open":true},{"x":1,"y":3}]} — a limit against the value taken: "points" marks an open circle (a hole: "open":true, the value the curve approaches there — give no "y" and it is computed from the curve) and a filled point (the value the function takes, its own "y"). A filled point off the curve needs its open circle at the same x, or the graph is refused; a hole must sit where the curve goes. For the curve, a formula that is undefined at the point ((x^2-1)/(x-1)) or one the hole sits on; "at" gives them a point to drag toward it. Your prose: the limit and the value, each in a few words — the picture carries the rest.' + GRAPH_TAIL,
  area:
    '{"type":"graph","title":"Rectangles under y = x²","expr":"x^2","x":[0,2.2],"params":[{"name":"n","label":"rectangles","value":4,"min":1,"max":40,"step":1}],"area":{"from":0,"to":2,"rects":{"n":"n","rule":"left"}}} — an area under the curve: "area" from–to shades it (with "between":1 to shade down to the second curve instead of the axis — a surplus between demand and a price line); "rects" draws Riemann rectangles instead, how many ("n": a number, or the parameter they slide) and where each takes its height ("left", "right", "mid"); their total, the exact area and the gap are computed live.' + GRAPH_TAIL,
  monopoly:
    '{"type":"graph","title":"A monopoly picks its output","expr":"12-x","label":"demand","curves":[{"expr":"12-2*x","label":"marginal revenue"},{"expr":"2+c","label":"marginal cost"}],"x":[0,8],"y":[0,13],"params":[{"name":"c","label":"cost shift","value":0,"min":-1,"max":4,"step":0.5}],"features":["crossings"]} — curves that meet: demand, marginal revenue and marginal cost over quantity, each labelled; "crossings" marks where they meet, live. The firm produces where marginal revenue meets marginal cost and charges what demand bears at that quantity — say so in a line; the crossing is computed, never asserted.' + GRAPH_TAIL,
  point:
    '{"type":"graph","title":"Elasticity along a demand curve","expr":"10-x","label":"demand","x":[0,10],"params":[{"name":"q","label":"quantity","value":3,"min":0.5,"max":9.5,"step":0.5}],"at":["q"],"readouts":[{"label":"elasticity","expr":"(10-q)/q","digits":2}]} — a point they drag along the curve ("at" names a parameter that is an x position), with readings that are formulas in the parameters ("readouts"), computed live.' + GRAPH_TAIL,
};

/**
 * Which diagram fits the parts: a ring for what returns to its start, a tree
 * for what has one top, a chain for what flows from one thing to the next,
 * and causes that converge on what they brought about.
 */
const DIAGRAM_TAIL = ' 3–9 nodes, labels a few words, "detail" a line read when opened. Your prose: one sentence on what ties them together; the nodes carry the parts — do not also list them.';
const DIAGRAM_GRAMMAR: Record<DiagramVariant, string> = {
  cycle:
    '{"type":"diagram","view":"cycle","title":"A habit loop","nodes":[{"id":"a","label":"Cue","detail":"the trigger that starts it"},{"id":"b","label":"Craving"},{"id":"c","label":"Response"},{"id":"d","label":"Reward"}],"edges":[["a","b"],["b","c"],["c","d"],["d","a"]]} — a cycle: each stage to the next, and the last back to the first (if it does not come back, "view":"flow").' + DIAGRAM_TAIL,
  tree:
    '{"type":"diagram","view":"tree","title":"A school district","nodes":[{"id":"a","label":"School board"},{"id":"b","label":"Superintendent"},{"id":"c","label":"Principals","detail":"one for each school"},{"id":"d","label":"Operations"},{"id":"e","label":"Finance"}],"edges":[["a","b"],["b","c"],["b","d"],["b","e"]]} — a hierarchy: one root, edges parent → child, three levels at most.' + DIAGRAM_TAIL,
  flow: GRAMMAR.diagram,
  causes:
    '{"type":"diagram","view":"causes","title":"Why the loaf did not rise","nodes":[{"id":"a","label":"Old yeast","role":"underlying"},{"id":"b","label":"A cold kitchen","role":"amplifier"},{"id":"c","label":"Salt poured onto the yeast","role":"trigger"},{"id":"d","label":"A flat loaf","role":"effect"}],"edges":[["a","d"],["b","d"],["c","d"]]} — causes converging on what they brought about: each node a role — "underlying", "trigger", "amplifier" or "effect" — and edges pointing to the effect; only causes you could defend, and where the causes are disputed, say so in your prose.' + DIAGRAM_TAIL,
};

/** The grammar for a form as this turn needs it. */
/**
 * THE WORKING, FADED. The reasoning is theirs and Socria scaffolds it: the first lines of their own problem,
 * each with its reason, and the step that finishes it asked in "check" — computed by the engine when they
 * answer, never written as a line. Under the guard there is no working at all.
 */
const STEPS_FADED =
  '{"type":"steps","title":"Complete the square","lines":[{"tex":"x^2 - 8x + 10 = 0"},{"tex":"x^2 - 8x = -10","why":"move the constant across"},{"tex":"x^2 - 8x + 16 = 6","why":"half of −8, squared, added to both sides"}],"check":{"prompt":"Now you: the left side is (x − ?)². What goes in the gap?","label":"?","answer":"8/2"}} — the working is theirs, so only the first lines of their own problem, each with its reason; the step that finishes it is theirs, asked in "check" ("answer" is plain arithmetic the engine evaluates), never written as a line. Your prose: the method in a line, and nothing that gives the last step away.';

function grammarFor(k: InlineKind, p: Presentation): string {
  const g = grammarOf(k, p);
  return p.guard && GUARDED[k] ? guarded(g, k) : g;
}
function grammarOf(k: InlineKind, p: Presentation): string {
  const r = p.reasons;
  if (k === 'graph') return GRAPH_GRAMMAR[p.graph ?? 'curve'];
  if (k === 'diagram') return DIAGRAM_GRAMMAR[p.diagram ?? 'flow'];
  if (k === 'sequence' && r.includes('sequence:timeline')) return SEQUENCE_TIMELINE;
  if (k === 'slider' && r.includes('slider:formula')) return SLIDER_FORMULA_EX;
  if (k === 'slider' && r.includes('slider:base-rate')) return SLIDER_BASE_RATE;
  if (k === 'reasoning' && r.includes('reasoning:check-work')) return r.includes('check:slips') ? CHECK_SLIPS : r.includes('check:holds') ? CHECK_HOLDS : CHECK_OPEN;
  if (k === 'decide' && p.lean) return DECIDE_LEAN;
  if (k === 'steps' && p.stepsFaded) return STEPS_FADED;
  if (k === 'paths' && r.includes('paths:next-layer')) return r.includes('layer:work') ? PATHS_NEXT_WORK : r.includes('layer:more') ? PATHS_NEXT_MORE : PATHS_NEXT_IDEA;
  if (k === 'paths') return r.includes('paths:more') ? PATHS_MORE : r.includes('paths:deeper') ? PATHS_DEEPER : GRAMMAR.paths;
  return GRAMMAR[k];
}

/**
 * UNDER THE GUARD, THE EXAMPLE IS WHAT IS DRAWN. The gate takes off a graph's
 * marks and readings, a simulation's readings, an equation's worked example and
 * a check's explanation (lib/inline-ui.ts checkInlineSpec) — the answer, in each.
 * Shown them in the example, the reply wrote them, and said them in prose when
 * the block came back without them (adversarial review, November 2026). So the
 * example loses what the gate would take, and the grammar says why.
 */
const GUARDED: Partial<Record<InlineKind, { drop: string[]; cut: [string, string][]; why: string }>> = {
  graph: {
    drop: ['features', 'readouts'],
    cut: [
      [GRAPH_MARKS, ''],
      [', so state none you have not computed', ''],
      [' and its slope (the average rate) are drawn', ' is drawn'],
      [' and its slope are drawn live', ' is drawn live'],
      [' between two such positions and its slope.', ' between two such positions.'],
      ['the tangent there and its slope, live', 'the tangent there, live'],
      ['; "mean-value" marks where a tangent runs parallel to the chord — or says why none does (a corner, a break)', ''],
      ['; turning points, roots and the y-intercept are found on the curve live', ''],
      ['; "crossings" marks where they meet, live, and where they met at first stays visible as they change things', ''],
      [', with readings that are formulas in the parameters ("readouts"), computed live', ''],
    ],
    why: 'Under the Answer Guard nothing on it is marked or read out — no turning points, roots, crossings, slopes or readings, whatever is said above — because finding them is their work.',
  },
  sim: { drop: ['readouts'], cut: [['when it ends and its readings are formulas, computed live', 'when it ends is a formula, computed live']], why: 'Under the Answer Guard it shows no readings: what they would read off it is theirs to find.' },
  equation: { drop: ['example'], cut: [[', and one worked example (TeX, optional)', '']], why: 'Under the Answer Guard, no worked example: it would be the worked answer.' },
  check: { drop: ['explain'], cut: [[', and "explain" shows only after they try', '']], why: 'Under the Answer Guard, no "explain": how it comes out is theirs.' },
};
function guarded(g: string, k: InlineKind): string {
  const rule = GUARDED[k]!;
  const at = g.indexOf('{"type"');
  let end = -1;
  for (let i = at, d = 0, str = false, esc = false; at >= 0 && i < g.length; i++) {
    const c = g[i];
    if (str) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') str = false;
    } else if (c === '"') str = true;
    else if (c === '{') d++;
    else if (c === '}' && !--d) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) return g;
  const ex = JSON.parse(g.slice(at, end)) as Record<string, unknown>;
  for (const key of rule.drop) delete ex[key];
  const rest = rule.cut.reduce((r, [from, to]) => r.split(from).join(to), g.slice(end));
  const cut = rest.search(/\s*Your prose:/);
  const prose = k === 'graph' || k === 'sim' ? ' Your prose: what to try in it, in a line — never what they would find.' : cut >= 0 ? rest.slice(cut) : '';
  return `${g.slice(0, at)}${JSON.stringify(ex)}${cut >= 0 ? rest.slice(0, cut) : rest} ${rule.why}${prose}`;
}

/** What the element is called in the reply's instructions: "the comparison below". */
const NOUN: Partial<Record<InlineKind, string>> = {
  graph: 'graph',
  sim: 'simulation',
  slider: 'slider',
  compare: 'comparison',
  balance: 'two sides',
  diagram: 'diagram',
  concepts: 'overview',
  sequence: 'sequence',
  equation: 'equation',
  steps: 'working',
  chart: 'chart',
};

/** In detail, by the block that carries the parts: each part a short paragraph, in the block's own order. */
const PARTS_IN_DETAIL: Partial<Record<InlineKind, string>> = {
  diagram: 'each part in a short paragraph, in the order the diagram connects them: what it does and how it bears on the rest',
  sequence: 'each step or event in a short paragraph, in the sequence\'s order: what happens and why it comes there',
  concepts: 'each part in a short paragraph, in the order that builds the subject: what it is and how it ties to the others',
  balance: 'each point in a short paragraph, one side and then the other, as the block sets them out',
};

/** What a block that fits carries, in the header's words: "the options side by side go in the block below". */
const CARRIES: Partial<Record<InlineKind, string>> = {
  compare: 'the options, side by side',
  balance: 'the two sides',
  diagram: 'the parts and how they connect',
  concepts: 'the parts of the subject',
  sequence: 'the steps or events, in order',
  claim: 'the claim and what it rests on',
  decide: 'the choice, for them to weigh',
  equation: 'the definition and its terms',
  graph: 'the relationship, to change',
  slider: 'the quantity, to move',
  chart: 'their numbers',
  steps: 'the working',
  draft: 'the text itself',
  sim: 'the motion, to try',
  paths: 'the ways it could go next',
  reasoning: 'the reasoning',
  check: 'the question to try',
};

/** A practical question's levers, by the element that carries them this turn. */
function leversFor(p: Presentation, element: InlineKind | undefined): string {
  if (!element) return 'the two or three levers that matter most for them, a line each, most important first';
  const r = p.reasons;
  if (r.includes('compare:pricing-models')) return 'the pricing models it comes down to, side by side in the comparison below';
  if (r.includes('compare:channels')) return 'the two to four channels worth trying first, side by side in the comparison below';
  if (r.includes('sequence:itinerary')) return 'the days in order — Day 1, Day 2 — each with its picks, in the sequence below';
  if (r.includes('sequence:steps')) return 'the steps in order, in the sequence below';
  if (element === 'slider') return 'the number that moves it, in the slider below';
  return `the few levers that matter most, in the ${NOUN[element] ?? 'element'} below`;
}

/**
 * How the reply itself is shaped, on the kinds of turn where a model's habit
 * is the chatbot's. A starting point, never a word limit: the deeper shape
 * takes as long as the thread needs, and an idea to understand takes the
 * one sentence that carries it and what makes that sentence land — or, when
 * they asked for it in detail, what they asked for, part by part.
 *
 * SAID ONCE (adversarial review, November 2026). Where the reply has a shape,
 * the shape is the one statement of what the prose is: the grammars' own
 * "Your prose" clauses are left off, the header drops its escape clause, and
 * an element the header calls optional is written here as optional too.
 */
/**
 * Where an idea's explanation ends. "Then stop" closed every one of them — right about the lecture it replaced,
 * and it also told a reply to end with nothing in it to answer. Where the turn's note asks for one closing line
 * (lib/runtime/engagement.ts: asked out of curiosity), the stop comes after that line.
 */
const thenStop = (p: Presentation) => (p.leaveOpen ? "Then the one closing line this turn's note asks for, if there is a real one — and stop." : 'Then stop.');

const SHAPES: Record<ReplyShape, (p: Presentation) => string> = {
  understand: (p) => {
    const element = p.forms.find((k) => k !== 'paths');
    const fits = !!element && !!p.strong?.includes(element);
    const paths = p.forms.includes('paths');
    const deeperWays = paths
      ? '; if there is more worth going into, the ways deeper go in the paths block — two or three, a few words each, such as the formal statement, why a condition matters, where it is used — to open one at a time'
      : '';
    // in detail, by what carries it: the parts each get a paragraph, the working's lines carry themselves, and
    // only an idea has a proof, its conditions and a worked case (adversarial review, November 2026)
    const asked = p.depthFromLength ? 'Their replies are set to Detailed' : 'They asked for it in detail';
    const partsLed = (!!element && PARTS_FORMS.has(element) && fits) || (!element && !!p.parts);
    const stop = !p.depth
      ? null
      : partsLed
        ? `${asked}: after that, ${PARTS_IN_DETAIL[element ?? 'concepts'] ?? PARTS_IN_DETAIL.concepts} — never a label repeated as a line of its own. No headings, no summary${deeperWays}.`
        : element === 'steps' && fits
          ? `${asked}: the lines carry the working, so after them only what the lines cannot hold — why the method works, and the step most often got wrong — in a short paragraph each. No headings, no summary${deeperWays}.`
          : `${asked}: after that, go through what they asked for — the proof, the conditions, a worked case — in order, a short paragraph each, built on what is drawn and never restating it. No headings, no summary${deeperWays}.`;
    // the answer is a set of parts: there is no single central sentence, and the element carries them — when
    // the parts ARE the answer (the form that fits), not when a sequence is only offered beside an idea
    if (partsLed) {
      const carried = element
        ? `Then the ${NOUN[element] ?? 'element'} below carries the parts.`
        : 'Then the parts themselves, briefly, in the order they connect — a sentence each, in prose.';
      return `\n\nTHE SHAPE OF THIS REPLY — they want to understand something made of parts. Minimum explanation, maximum understanding:\n- Open with one plain sentence on what ties the parts together — what drives it, or the principle that organises it — not the topic's name, its history, or "X is a fundamental concept in…". Keep everything as true as you can state it: where it is contested, say so.\n- ${carried}\n- ${stop ?? `${thenStop(p)} No headings or sections, no applications or history they did not ask for${deeperWays}.`}\n${stop || p.leaveOpen ? '' : 'If a sentence carries it, that is the whole reply.\n'}`;
    }
    const after = !element
      ? 'one concrete example or image, if the sentence needs one'
      : !fits
        ? `one concrete example or image, if the sentence needs one — or the ${NOUN[element] ?? 'element'} below, if it shows it better`
        : element === 'graph'
          ? 'the graph below, with one line on what to try in it'
          : element === 'compare'
            ? 'the comparison below — the difference that decides most cases is your sentence, and the rows carry the rest'
            : element === 'equation'
              ? 'the equation below and its terms, with one line on what it tells you'
              : `the ${NOUN[element] ?? 'element'} below, with a line on what to do with it`;
    // under the guard the central insight may be the very result they are working toward: open on what it rests on
    const opening = p.guard
      ? 'Open with what the idea rests on, in one plain sentence — never the result they are working toward, which is theirs to reach; not the topic\'s name, its history, or "X is a fundamental concept in…".'
      : 'Open with the central insight in one plain sentence: what it says and why it holds — the relationship itself, not the topic\'s name, its history, or "X is a fundamental concept in…".';
    return `\n\nTHE SHAPE OF THIS REPLY — they want to understand an idea. Minimum explanation, maximum understanding:\n- ${opening} A condition it is false without (continuity, a sign, a domain, all else equal) belongs in that sentence or the next: never drop one for brevity, and never state something more strongly than it is true.\n- Then only what makes that sentence land: ${after} — not a second explanation of the same thing.\n- ${stop ?? `${thenStop(p)} No headings or sections${element === 'compare' ? '' : ', no list of properties'}, no applications, history or proof they did not ask for${deeperWays}.`}\n${stop || p.leaveOpen ? '' : 'If a sentence or two carries it, that is the whole reply.\n'}`;
  },
  practical: (p) => {
    const element = p.forms.find((k) => k !== 'paths');
    const paths = p.forms.includes('paths');
    return `\n\nTHE SHAPE OF THIS REPLY — a practical question with an answer. Open with the one thing it hinges on for them and a concrete default — a number, a first move — in a sentence or two. Then ${leversFor(p, element)}${paths ? '; the rest of what matters, if there is more worth having, in the paths block, to open one at a time' : ''}. Nothing that would fit anyone: no generic best practice, no headings, no closing list of tips.\n`;
  },
  open: (p) => {
    const paths = p.forms.includes('paths');
    // a block that is the point of the turn says its part: a choice laid out is theirs to call, their numbers are drawn
    const start = p.forms.includes('decide')
      ? 'Then what the choice turns on, in a short paragraph: the options are weighed in the decide block below, and the call is theirs.'
      : `Then the one starting point you would take, concrete and particular to their situation, in a short paragraph${p.forms.includes('chart') ? ' — the chart below shows their numbers, so do not list them again' : ''}.`;
    const question = p.noQuestion ? ', and no question' : ', and no closing question unless one answer would change everything you would say';
    return `\n\nTHE SHAPE OF THIS REPLY — an open piece of work. Don't write the plan. Open with the problem that actually matters here, in a sentence or two: the thing that will make or break it, which they may not have put into words — not a restatement of what they asked. ${start} Then ${paths ? 'the ways it could go next as a paths block (below) — two to four, each a few words and a line on what opening it gives them — and stop there' : 'name the two or three ways it could go next, in a sentence, and stop there'}. No headings, no bolded sections, no generic best practice${question}.\n`;
  },
  layer: (p) => {
    const element = p.forms.find((k) => k !== 'paths');
    const fits = !!element && !!p.strong?.includes(element);
    const paths = p.forms.includes('paths');
    const shown = !element ? '' : fits ? `, shown in the ${NOUN[element] ?? 'element'} below` : `, or the ${NOUN[element] ?? 'element'} below if it shows it better`;
    const r = p.reasons;
    const down = r.includes('layer:work')
      ? 'what to do on that part first and what it depends on, particular to their situation'
      : r.includes('layer:more')
        ? 'what to do and when, for their situation'
        : r.includes('layer:idea')
          ? 'the mechanism under it, or the one result that matters'
          : 'how it works under the surface, or what to do next';
    const next = r.includes('layer:work') ? 'the next ways the work could go' : r.includes('layer:more') ? 'what else matters from here' : 'the next ways in';
    return `\n\nTHE SHAPE OF THIS REPLY — they opened one way further. Go one layer down, not the whole of it: ${down}, in a few sentences${shown} — built on what the conversation already said, never repeating it. ${paths ? `Then, if there is more worth going into, ${next} as a paths block — two or three, a few words each, never the one just opened — so they choose how far to go.` : 'End on what it opens up next, in a sentence.'} No headings, no summary.\n`;
  },
  deeper: () =>
    `\n\nTHE SHAPE OF THIS REPLY — they asked to go deeper on one thread. Go deep on that thread and only that: the reasoning in full, worked through for their situation, as long as it needs. You have the whole conversation, so build on it rather than repeating it. Open with the most important thing about it, in a sentence. If it has distinct parts, give each a short heading line of its own (### A few words) — here, unlike most replies — so it can be read a part at a time. End on what it opens up next, in a sentence; no summary.\n`,
};

/**
 * A write-up, read in Content. The core says no headings in the conversation;
 * this one is not in the conversation — it is a document they will come back
 * to, so its structure is how they find their way in it.
 */
export const WRITE_UP = `\n\nA WRITE-UP, READ IN CONTENT. They asked for something to read and keep, so this reply is filed in Content and read there as a document; the conversation shows only its title and opening. Put its title on the first line as "# Title". Then write it to be read: a short opening paragraph, sections under "## " headings where they help someone find their way, prose paragraphs, and a list only for what really is a list. No inline blocks, no preamble, no sign-off. Everything you know about accuracy and about what is theirs to do still holds.\n`;

/**
 * One rule for every element: what it shows, the words never say again — but
 * for the one point the prose is asked for (the verdict, what it turns on, the
 * pick), which is the prose's and the block's both.
 */
const NO_RESTATE = 'What a block shows, your words never repeat, beyond the one point your prose is for.';
const FENCED = 'fenced on its own lines (```ui, the JSON on one line, ```)';
const withoutProse = (g: string) => g.replace(/\s*Your prose:[\s\S]*$/, '');

export interface PresentationContext {
  /** Socria's own regulation asked this turn to say what was checked (lib/mr/execute.ts VERIFY OUT LOUD) */
  verifyOutLoud?: boolean;
  /** the turn's note asks for one closing line (lib/runtime/engagement.ts leavesOpen): "then stop" comes after it */
  leaveOpen?: boolean;
}

/**
 * The turn's shape and offer, or '' when there is neither — which is most
 * turns. A form that fits the turn's structure is offered as the form that
 * fits; the rest as optional, after it.
 */
export function renderPresentation(p: Presentation, ctx: PresentationContext = {}): string {
  if (p.place === 'content') return WRITE_UP;
  // the turn's note asks for one closing line (lib/runtime/engagement.ts): the shape's "then stop" comes after it
  const shape = p.shape ? SHAPES[p.shape](ctx.leaveOpen ? { ...p, leaveOpen: true } : p) : '';
  if (!p.forms.length) return shape;
  const fits = p.forms.filter((k) => p.strong?.includes(k));
  const maybe = p.forms.filter((k) => !fits.includes(k));
  // what the prose is for is said once: by the shape when there is one, else by the first form's grammar
  const first = fits[0] ?? maybe[0];
  const line = (k: InlineKind) => `- ${p.shape || k !== first ? withoutProse(grammarFor(k, p)) : grammarFor(k, p)}`;
  let out = shape;
  if (fits.length) {
    const one = fits.length === 1;
    const what = one ? `${CARRIES[fits[0]] ?? 'the parts'} in the block below` : `${fits.map((k) => CARRIES[k] ?? 'the parts').join(', and ')} in the blocks below`;
    out += `\n\nTHE FORM THAT FITS — ${what}: use ${one ? 'it' : 'them'}${p.shape ? '' : ' unless one sentence fully answers them'}, and let your prose frame ${one ? 'it' : 'them'}. ${NO_RESTATE} Each ${FENCED}:\n${fits.map(line).join('\n')}\n`;
    if (maybe.length) out += `Optional, after it, if it helps:\n${maybe.map(line).join('\n')}\n`;
  } else {
    out += `\n\nINLINE, IF IT HELPS — optional; plain prose is often better. You may include ${maybe.length === 1 ? 'this' : 'one of these'}, ${FENCED}. ${NO_RESTATE}\n${maybe.map(line).join('\n')}\n`;
  }
  // no question this turn: nothing in a block asks one either
  if (p.noQuestion && p.forms.some((k) => k === 'graph' || k === 'sim' || k === 'steps')) out += 'No question this turn: leave out "predict" and "check".\n';
  // one rule about what was checked: with a claim laid out, it is the parts' bases that say it
  if (ctx.verifyOutLoud && p.forms.includes('claim')) out += "What was checked goes in each part's basis; your prose keeps the verdict and its reason, and adds only what could not be checked.\n";
  return out;
}

/**
 * The ceiling a reply needs when an element may be in it: a cut-off spec is
 * dropped whole. A draft and an overview (several parts, each with a few
 * sentences to open) need the most; steps a little more than a chart. A
 * ceiling, not a cost: nothing is spent that the reply does not write.
 */
export function presentationRoom(p: Presentation): number {
  // a write-up is a document: room for its sections, not a chat reply's length
  if (p.place === 'content') return 1100;
  // going deeper on a thread takes the room the thread needs: a cut-off part is worse than a long one;
  // one layer down needs a little, for the next ways deeper
  const deeper = p.shape === 'deeper' ? 600 : p.shape === 'layer' ? 200 : p.depth ? 400 : 0;
  if (!p.forms.length) return deeper;
  if (p.forms.includes('draft') || p.forms.includes('concepts')) return 700 + deeper;
  // a diagram is nodes, each with a line to open, and the edges between them
  if (p.forms.includes('diagram')) return 600 + deeper;
  // a graph, a simulation or the working is one longer line of JSON: a cut-off one is not drawn at all
  if (p.forms.includes('graph') || p.forms.includes('sim') || p.forms.includes('steps') || p.forms.includes('vectors')) return 550 + deeper;
  // an algorithm's states, written out step by step, need the most room of any element
  if (p.forms.includes('trace')) return 800 + deeper;
  return (['sequence', 'decide', 'claim', 'balance', 'equation'].some((k) => p.forms.includes(k as InlineKind)) ? 450 : 350) + deeper;
}
