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
import { TRIP, claimCheck, pickAsk } from '../cognition/claims';
import { quickPlot } from './plot-ask';
import {
  BASE_RATE,
  COMPARE_ASK,
  LIST_ASK,
  LIST_LEAD,
  MANY_ASK,
  OWN_TIMELINE,
  PROS_CONS,
  TIMELINE_ASK,
  TIMELINE_NAMED,
  VERSUS,
  adviceAsk,
  adviceKind,
  comparisonAsk,
  partsShape,
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
  /** the Answer Guard is up */
  guard: boolean;
  /** the conversation before this turn */
  history: readonly { role: 'user' | 'assistant'; content: string }[];
  /** the length they chose for replies (Logos 5): Detailed asks for depth on every thread */
  length?: 'concise' | 'standard' | 'detailed' | null;
}

export type ReplyShape = 'open' | 'deeper' | 'layer' | 'understand' | 'practical';
export type GraphVariant = 'plot' | 'curve' | 'rate' | 'tangent' | 'market' | 'point';
export type DiagramVariant = 'cycle' | 'tree' | 'flow' | 'causes';

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
const MONEY_OR_PCT = /[$£€¥₹]\s?\d|\d\s?%|\b\d[\d,.]*\s?(?:k|m|bn|dollars|pounds|euros|percent)\b|\bhow much\b/i;
/**
 * A known relationship people ask to understand, with nothing they gave to
 * vary: compound interest, the rule of 72, Bayes, break-even, a payback
 * period, runway. A slider with sensible defaults shows it — said to be
 * defaults, so a number is never mistaken for advice.
 */
const SLIDER_FORMULA =
  /\b(?:compound\s+interest|compounding|rule\s+of\s+72|doubling\s+time|break[- ]?even(?:\s+point)?|payback\s+period|(?:cash\s+)?runway|net\s+present\s+value|npv|present\s+value|future\s+value|bayes(?:'|’)?s?(?:\s+(?:theorem|rule))?|base\s+rates?|growing\s+(?:at\s+)?\d+(?:\.\d+)?\s?%|grows?\s+(?:by|at)\s+\d+(?:\.\d+)?\s?%|how\s+long\s+until|loan\s+payments?|amorti[sz]ation)\b/i;
/** A ratio or a definition by formula, asked what it is: one equation and its terms says it — nothing in it is there to vary. */
const EQUATION_NAME =
  /\b(?:ebitda|cac|customer\s+acquisition\s+costs?|c?ltv|(?:customer\s+)?lifetime\s+value|gross\s+margin|net\s+margin|operating\s+margin|profit\s+margin|contribution\s+margin|markup|roi|return\s+on\s+investment|churn\s+rate|conversion\s+rate|arpu|mrr|arr|burn\s+rate|p\/?e\s+ratio|price[- ]to[- ]earnings(?:\s+ratio)?|debt[- ]to[- ]equity(?:\s+ratio)?|current\s+ratio|quick\s+ratio|bmi|body\s+mass\s+index|z-?scores?|standard\s+deviation|variance)\b/i;
const DEFINITION_ASK =
  /^(?:(?:so|ok(?:ay)?|hey|hi|quick question),?\s+)?(?:what(?:'s|\s+is|\s+are|\s+does)|define|explain|how\s+(?:do|would|can|should)\s+(?:i|you|we|one)\s+(?:calculate|compute|work\s+out|measure|figure\s+out|find)|how\s+(?:is|are)\s+.{2,40}?\s+(?:calculated|computed|measured|worked\s+out))\b/i;
const FORMULA = /\b[a-z]\s*=\s*[^=\n]*[a-z][^=\n]*$|\bf\s*\(\s*x\s*\)\s*=/im;
/** Mathematics written as such: y =, f(x), x^2, x². */
const MATH_MARK = /\by\s*=|\bf\s*\(\s*x\s*\)|(?<![a-z])[a-z]\s*\^\s*\d|[a-z]²/i;
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
const FIELD = /^(?:(?:can|could) you |please )?(?:explain|tell me about|what(?:'s| is)|describe|walk me through)\s+(?:the (?:field|subject|study) of\s+)?(?:[a-z-]+\s){0,2}[a-z-]*(?:ics|ology|onomy|istry|osophy|ography|calculus|algebra|geometry|theory|science|engineering|law|medicine)\s*\??$/i;
/** Steps to follow, in order. */
const STEPS_ASK = /\b(?:steps? (?:to|for|in|of)|step[- ]by[- ]step|how (?:do|can|would|should) (?:i|you|we|one) (?:go about|get started|set up|apply|register|install|prepare|start|file|enrol|enroll)|(?:the )?process (?:of|for|to)|stages of|phases of|how does an? [\w\s-]{2,30} become|procedure (?:for|to))\b/i;
/**
 * How a system or a game works, asked about as a whole: "how does American
 * football work?", "how do elections work". A few ordered parts may carry it —
 * the four downs, the stages of a bill — so a compact sequence is offered, and
 * the reply decides; prose is still the answer. Not "how does that work for
 * you on Tuesday?": a pronoun is no system, and "for you" is a diary.
 */
const HOW_IT_WORKS =
  /\bhow\s+(?:does|do)\s+(?!(?:it|that|this|they|you|he|she|we|i|things|everything|anything)\b)(?:an?\s+|the\s+)?(?:[\w'’-]+\s+){0,4}?[\w'’-]+\s+work\b(?!\s+(?:for|with)\s+(?:you|me|us|them|him|her)\b)/i;
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
/** …or a team's change set against how things are: "should we raise prices?" is the change against the status quo. */
const CHANGE_ASK = /\bshould\s+we\s+(?:raise|cut|lower|increase|reduce|switch|keep|change|drop|stop|start|move|expand|delay)\b/i;
/**
 * Going deeper on one thread: a way deeper opened ("Go deeper: …", lib/inline-ui.ts
 * pathAsk), an overview's part followed ("Take me further into …"), or said in
 * words — "say more about the second one", "expand on that", "walk me through
 * it in detail".
 */
const DEEPER =
  /^(?:(?:ok(?:ay)?|great|yes|yeah|sure|right|nice|good|perfect|cool),?\s+)?(?:let'?s\s+)?(?:go deeper|dig (?:deeper|into)|say more about|tell me more(?: about)?|expand on|elaborate on|unpack|more on|take me further into|go further (?:on|into)|explain (?:that|this|it) (?:in more detail|further|more)|walk me through (?:that|this|it)(?: in detail)?|go into (?:more )?detail)\b/i;
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
const MATH_SURE = /\b(?:parabolas?|quadratics?|polynomials?|cubics?|asymptotes?|logarithm(?:s|ic)?|sine|cosine|sinusoid\w*|linear\s+functions?|exponential\s+(?:functions?|curves?|graphs?)|tangent\s+lines?|y-?intercepts?|x-?intercepts?|turning\s+points?)\b|\b(?:sin|cos|tan)\s*\(/i;
const MATH_MAYBE = /\b(?:slopes?|gradients?|vertex|vertices|intercepts?|amplitudes?|graphs?|curves?|functions?|exponential|derivatives?)\b/gi;
const mathWords = (t: string) => (t.match(MATH_MAYBE) ?? []).length;
const WHY_HOW = /\b(?:why|how|what happens|what does|explain|understand|intuition|make sense|confused|get it|don'?t get|mean|means|change|changes|affect|affects|shift|shifts|move|moves|depend|depends|look like)\b/i;
/**
 * Rates on a curve: the slope at a point against the average over an interval —
 * the mean value theorem, what a derivative is, marginal against average. A
 * derivative in finance is a contract, not a slope.
 */
const RATE_SURE = /\b(?:mean\s+value\s+theorem|mvt|rolle'?s\s+theorem|derivatives?|differentiat\w*|tangent\s+lines?|tangent\s+to\s+(?:a|the)\s+(?:curve|graph|function|parabola|circle)|slope\s+of\s+(?:a|the)\s+(?:curve|tangent|graph)|slope\s+of\s+\S+(?:\s+\S+){0,3}?\s+at\s+(?:x\s*=\s*)?-?\d|secant(?:\s+lines?)?|limit\s+definition|first\s+principles)\b/i;
const RATE_SOFT = /\b(?:rates?\s+of\s+change|instantaneous\s+(?:rate|speed|velocity)|average\s+(?:rate|slope|velocity|speed)|marginal\s+(?:cost|revenue|product|utility|benefit))\b/i;
const FINANCE = /\b(?:finance|financial|trading|traders?|options|futures|swaps|hedg\w*|securities|bank(?:s|ing)?|exchange-traded)\b/i;
/** …of which the average over an interval, set against the rate at a point: the chord and the tangent that matches it. */
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
const simAsk = (t: string) => SIM_CORE.test(t) || (SIM_MOVE.test(t) && SIM_PHYS.test(t));
/** The working, asked for — of mathematics. "Mitosis vs meiosis, step by step" is steps to follow, not TeX. */
const WORKING_ASK = /\b(?:how do (?:i|you|we) (?:solve|find|work out|calculate|complete|factor|simplify|integrate|differentiate)|show (?:me )?(?:the )?(?:working|steps|how)|work (?:it |this |that )?(?:out|through)|walk me through (?:solving|the (?:maths|math|algebra|derivation|working))|derive|derivation|complete the square|solve (?:for|this|it|the)|step[- ]by[- ]step)\b/i;
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
  const t = i.text.trim();
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
    MATH_SURE.test(t) || MATH_MARK.test(t) || FORMULA.test(t) || (!FINANCE.test(t) && (mathWords(t) >= 2 || (mathWords(t) >= 1 && (domain === 'math' || domain === 'learning') && !technical)));
  const rate = (RATE_SURE.test(t) && !FINANCE.test(t)) || (RATE_SOFT.test(t) && mathy);
  const market = MARKET_SURE.test(t) || (MARKET_SOFT.test(t) && (ECON.test(t) || domain === 'learning' || domain === 'business'));
  const elastic = ELASTIC.test(t) && (mathy || /\b(?:demand|supply|price|prices|pricing)\b/i.test(t));
  const subject = SUBJECT.test(t) || ((domain === 'math' || domain === 'learning' || domain === 'research') && SUBJECT_GENERIC.test(t)) || mathRel || rate || market || elastic || domain === 'math';
  const listAsked = LIST_ASK.test(t) || LIST_LEAD.test(t);

  // ── the shape of the reply itself, before what may be drawn in it ──
  const deeper = DEEPER.test(t);
  const fullDepth = deeper && (FULL_DEPTH.test(t) || i.length === 'detailed');
  const openWork =
    !deeper && x.kind !== 'brainstorm' && !CONCRETE.test(t) && (OPEN_WORK.test(t) || HOW_APPROACH.test(t)) && !['verification', 'diagnosis', 'practice', 'information'].includes(work);
  // a claim put up to be checked (lib/cognition/claims.ts): the verdict first, the parts it rests on to inspect
  const claim = claimCheck(t);
  const two = twoNamed(t);
  // a choice that is theirs, between options they named (or a change against the status quo): weighed by them
  const deciding = !claim && ((DECIDE_ASK.test(t) && two) || CHANGE_ASK.test(t)) && work !== 'creation';
  // options set against each other, as people phrase it — "TCP vs UDP", "Postgres or MongoDB for a chat app?"
  const comparing =
    !deciding && !claim && work !== 'creation' && x.kind !== 'brainstorm' && (comparisonAsk(t) || (COMPARE_ASK.test(t) && (two || (task && /\band\b/i.test(t)))));
  // one subject's two sides ("pros and cons of remote work"); two subjects are a comparison
  const prosCons = !claim && !deciding && work !== 'creation' && PROS_CONS.test(t);
  // the parts of something: a cycle, a hierarchy, causes, effects, types (lib/runtime/asks.ts)
  const parts = task && (work === 'explanation' || work === 'information') && x.kind !== 'brainstorm' ? partsShape(t) : null;
  // a ratio, or a relationship with a name, asked what it is
  const formulaAsk = (EQUATION_NAME.test(t) && DEFINITION_ASK.test(t)) || SLIDER_FORMULA.test(t);
  // a practical question with an answer: the one thing it hinges on, a default, the few levers
  // (a pick asked for is one too: "recommend me a sci-fi book", "three days in Lisbon — what should I do?")
  const picking = pickAsk(t);
  const practical =
    !deeper && !openWork && !claim && !deciding && !comparing && !prosCons && !parts && !formulaAsk && task && work === 'information' && (adviceAsk(t) || picking);
  // an idea to understand: wanting the reasoning (lib/cognition/assist.ts wantsExplanation, said as a need
  // or a question), or asking what an idea in a subject is — never a lookup, a claim, a choice or a discussion
  const understanding =
    !deeper && !openWork && !deciding && !claim && !practical && !listAsked && task && !LOOKUP.test(t) && !/\bwork\s+for\s+(?:you|me|us|them)\b/i.test(t) &&
    (work === 'explanation' || (work === 'information' && ((CONCEPT_Q.test(t) && subject) || !!parts || formulaAsk)));
  const shape: ReplyShape | undefined = deeper ? (fullDepth ? 'deeper' : 'layer') : openWork ? 'open' : practical ? 'practical' : understanding ? 'understand' : undefined;
  if (shape) reasons.push(`shape:${shape}`);

  // ── what may be drawn ──
  // a list of their own amounts, with names: a small chart says it at a glance
  if (namedAmounts(t) >= 3 && nums.length <= 24 && (MONEY.test(t) || sharedUnit(t) >= 3)) offer('chart', 'chart:their-numbers');
  // the working, asked for — of mathematics, never the working that is theirs, never under the guard. Asked
  // for, it comes before anything inferred: "how do I solve this by completing the square?" wants the lines
  if (!i.guard && !i.ownReasoning && WORKING_ASK.test(t) && (mathy || WORKING_MATH.test(t))) offer('steps', 'steps:working');
  // a relationship they could discover by changing a number: a graph to change (under the guard too —
  // nothing that would be the answer is marked on it). Which graph follows the idea: rates on a curve
  // (the chord and the tangent that matches it), curves that meet (a tax shifting supply), a point along
  // a curve (elasticity), or the curve's own shape.
  // a quick plot of one function asked for (lib/runtime/plot-ask.ts): that function, drawn in place
  const plotted = quickPlot(t);
  const variant: GraphVariant | null = plotted ? 'plot' : rate ? (AVERAGE_RATE.test(t) ? 'rate' : 'tangent') : market ? 'market' : elastic ? 'point' : mathRel ? 'curve' : null;
  let graph: GraphVariant | undefined;
  // (not where steps were asked for: the steps are the answer, and a second picture of the same thing is not)
  // (and never on a problem they are working or a proof: "prove by induction that 1 + 2 + … + n = n(n+1)/2" has
  // an equals sign, not a curve to see — the working is the answer there)
  const proving = /\b(?:prove|proof|induction|show\s+that)\b/i.test(t);
  if (variant && work !== 'creation' && work !== 'diagnosis' && (plotted || (work !== 'practice' && !proving)) && x.kind !== 'brainstorm' && !claim && !comparing && (plotted || !STEPS_ASK.test(t)) && (plotted || understanding || WHY_HOW.test(t) || FORMULA.test(t))) {
    if (offer('graph', `graph:${variant}`)) graph = variant;
  }
  // motion, or something that unfolds in time, asked why or how: one small simulation to try
  if (work !== 'creation' && simAsk(t) && WHY_HOW.test(t)) offer('sim', 'sim:try-it');
  // a claim to check: the verdict, and the parts it rests on to open and doubt (not laid out under the guard)
  if (claim && !i.guard) offer('claim', 'claim:inspect');
  // a choice that is theirs: a decision they weigh, not one that leans for them
  if (deciding) offer('decide', 'decide:their-choice', 'strong', true);
  // one subject's two sides, weighed as their own life choice, is a decision too ("pros and cons of quitting my job")
  else if (prosCons && work === 'judgment' && THEIR_OWN.test(t)) offer('decide', 'decide:their-choice', 'strong', true);
  // two things set against each other — the facts side by side; their own, weighed by them
  else if (comparing || (prosCons && two)) {
    if (i.ownJudgment && THEIR_OWN.test(t) && work === 'judgment') offer('decide', 'decide:their-choice', 'strong', true);
    else offer('compare', 'compare:options', 'strong', true);
  }
  // one subject's two sides: for and against, and the one thing it turns on — not two bulleted lists
  else if (prosCons && !i.guard) offer('balance', 'balance:one-subject', 'strong', true);
  // a quantity that moves with something they can vary — unless a graph or a simulation already shows it
  if (!i.guard && !offered.includes('graph') && !offered.includes('sim')) {
    const whatIf = WHAT_IF.test(t) || (WHAT_IF_WEAK.test(t) && MONEY_OR_PCT.test(t));
    if ((whatIf && nums.length >= 1) || (FORMULA.test(t) && /\b(?:change|vary|depends?|how does|what happens)\b/i.test(t))) offer('slider', 'slider:what-if');
    // a base rate with their numbers: the posterior moves as they move the rate, which is the whole surprise
    else if (BASE_RATE.test(t)) offer('slider', 'slider:base-rate');
    // a known relationship, asked to understand: sensible defaults to move, said to be defaults
    else if (SLIDER_FORMULA.test(t) && (work === 'explanation' || work === 'information' || work === 'execution')) offer('slider', 'slider:formula', understanding ? 'strong' : 'soft');
  }
  // a ratio or a formula's definition, asked: the equation and its terms — nothing in it to vary
  if (EQUATION_NAME.test(t) && DEFINITION_ASK.test(t) && !offered.includes('slider') && !offered.includes('graph')) offer('equation', 'equation:definition');
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
  if (reading && !NOT_READING.has(work) && (OVERVIEW.test(t) || FIELD.test(t))) offer('concepts', 'concepts:overview');
  // events whose order is the point (not under the guard: the gate would drop it, lib/inline-ui.ts) — a
  // timeline asked for by name is the form that fits; a history may be told as a story, so it is offered
  const timeline = TIMELINE_ASK.test(t) && !OWN_TIMELINE.test(t);
  if (reading && timeline && !shown) offer('sequence', 'sequence:timeline', TIMELINE_NAMED.test(t) || /\bwhat\s+happened\b/i.test(t) ? 'strong' : 'soft', TIMELINE_NAMED.test(t));
  // steps to follow — never the steps of something that is theirs to work out
  else if (!i.guard && !listAsked && !i.ownReasoning && work !== 'creation' && STEPS_ASK.test(t)) offer('sequence', 'sequence:steps', 'strong', true);
  // a trip's days, in order: Day 1, Day 2 — the picks laid out where they happen
  else if (picking && TRIP.test(t) && !i.guard && !listAsked) offer('sequence', 'sequence:itinerary');
  // a practical procedure — setting something up, hiring, a recipe: its steps, in order
  else if (practical && !i.guard && !listAsked && !i.ownReasoning && (adviceKind(t) === 'setup' || adviceKind(t) === 'procedure')) offer('sequence', 'sequence:steps');
  // how a system works, asked about as a whole: its ordered parts may carry it (the four downs)
  else if (!i.guard && !listAsked && !i.ownReasoning && work !== 'creation' && x.kind !== 'brainstorm' && HOW_IT_WORKS.test(t) && !shown) offer('sequence', 'sequence:how-it-works', 'soft');
  // a practical question about pricing or growth: the options it comes down to, side by side
  if (practical && !offered.length && (adviceKind(t) === 'price' || adviceKind(t) === 'grow')) {
    const priced = adviceKind(t) === 'price';
    if (priced && nums.length >= 1 && !i.guard) offer('slider', 'slider:what-if');
    else offer('compare', priced ? 'compare:pricing-models' : 'compare:channels');
  }
  // a check, or a call Socria may weigh in on: the answer up top, the steps folded under it. Not an
  // explanation — prose is the explanation — and never reasoning that is theirs to do or a decision
  // that is theirs to make. A comparison already lays the reasoning out, and a quick call ("what tip
  // should I leave?") needs none.
  const call = work === 'judgment' && !i.ownJudgment && words(t) >= 10 && !offered.includes('compare') && !offered.includes('decide');
  if (!i.guard && !i.ownReasoning && ((work === 'verification' && words(t) >= 6) || call) && x.kind !== 'brainstorm') offer('reasoning', 'reasoning:steps', 'soft');

  // ── the ways onward, after the useful part, never instead of it ──
  const sideBySide = offered.includes('compare') || offered.includes('balance');
  // an open piece of work: the ways it could go next, to open one at a time
  if (openWork && !offered.includes('draft')) offer('paths', 'paths:open-work', 'soft');
  // one layer down: the next layers, to choose how far to go
  else if (shape === 'layer') offer('paths', 'paths:next-layer', 'soft');
  // a practical question: the rest of what matters, to open when they want it — not every tip there is
  else if (practical && !picking && (['price', 'grow', 'setup'].includes(adviceKind(t)) || MANY_ASK.test(t) || listAsked || domain === 'business')) offer('paths', 'paths:more', 'soft');
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
  };
}

// ── what the reply is told ───────────────────────────────────────────
//
// Every example below is a valid instance of its element — it parses, passes
// the gate and draws (test/inline-contract.test.mjs) — because a model copies
// an example's shape exactly, and an example its own sanitizer refuses teaches
// the model to write an element that is never shown. Each ends on what the
// prose around it is for: the element carries the parts, the words frame them.

/** Each form's grammar, as short as it can be and still be written right. */
const GRAMMAR: Record<InlineKind, string> = {
  chart:
    '{"type":"chart","kind":"bar","title":"Monthly costs","x":["Rent","Food","Transport"],"series":[{"name":"Cost","values":[1200,400,150]}],"unit":"$","basis":"given"} — kind bar, line or pie; values exactly as they gave them (basis "given") or from a source this turn ("source"); figures from anywhere else are not drawn. Your prose: what stands out, in a sentence.',
  slider:
    '{"type":"slider","title":"Monthly payment","formula":"p*(r/1200)/(1-(1+r/1200)^(-360))","result":{"label":"Monthly payment","unit":"$","digits":0},"vars":[{"name":"p","label":"Loan","min":50000,"max":1000000,"step":5000,"value":300000,"unit":"$"},{"name":"r","label":"Rate","min":1,"max":12,"step":0.25,"value":6,"unit":"%"}]} — 1–3 single-letter variables at their numbers, or sensible defaults said to be defaults; the result is computed live (plain arithmetic, ^ for powers), so state none you have not computed. Your prose: what moves it most.',
  compare:
    '{"type":"compare","options":["Paper notes","A notes app"],"rows":[{"label":"Remembering","values":["Better","Weaker"]},{"label":"Finding later","values":["Hard","Search"]}]} — 2–4 options and the 2–6 points that separate them, a few words a cell; "pick" (an option\'s index) only when what they told you settles it; figures you are unsure of marked unchecked. Your prose: the difference that decides most cases, and the pick if there is one.',
  reasoning:
    '{"type":"reasoning","summary":"It pays only if you stay past the break-even","steps":["The closing costs come back through the lower payment","Three years is shorter than that"]} — the reasoning folds under the answer. Your prose: the answer, in a sentence.',
  options:
    '{"type":"options","options":[{"label":"Start from the outline"},{"label":"Fix the introduction"}]} — 2–4 directions to tap instead of typing; then do not also ask in words. Your prose: what you need from them, in a line.',
  draft:
    '{"type":"draft","kind":"email","title":"The heater","text":"Hi,\\n\\nThe heater stopped working on Monday. Could someone look at it this week?\\n\\nThanks"} — the text they asked for, whole, editable in place. Your prose: a line around it at most.',
  concepts:
    '{"type":"concepts","title":"Microeconomics","items":[{"name":"Supply and demand","gist":"how a price settles","detail":"two or three sentences, read when opened","links":["Elasticity"]},{"name":"Elasticity","gist":"how strongly buyers react"},{"name":"Market structure","gist":"how many firms compete"}]} — 3–7 parts of the subject; links name other items. Your prose: a short introduction, what holds the parts together. Do not also list them.',
  sequence:
    '{"type":"sequence","kind":"steps","title":"Getting a passport","items":[{"label":"Fill in the form","detail":"online or on paper"},{"label":"Add two photos"},{"label":"Pay and send it"}]} — 3–8 in order, only when the order is the point; kind "timeline" gives each a "when" ("1789"). Your prose: why the order matters, in a line; the items are not numbered again in prose.',
  paths:
    '{"type":"paths","items":[{"label":"Sketch the first five minutes","gist":"what a new person sees first"},{"label":"Draft the welcome email","gist":"the message that brings them back"}]} — 2–4 ways the work could go next, a few words each; opening one sends it as their next message. Ways to explore, not questions. Your prose: the useful part, above it.',
  decide:
    '{"type":"decide","title":"Which offer","options":["The startup","The bank"],"rows":[{"label":"Pay now","scores":[1,3]},{"label":"What you would learn","scores":[3,1],"note":"a few words why"}]} — a choice that is theirs: 2–4 options, 2–5 things it rests on (from what they said matters), your honest first reading of each (0 poor – 3 strong, in option order). They set how much each matters; the leaning is computed from their weights, so name no winner in your prose. Your prose: the one thing it turns on, in a sentence or two; the rows carry the rest.',
  graph:
    '{"type":"graph","title":"Reshape a parabola","expr":"a*x^2+b*x+c","x":[-6,4],"params":[{"name":"a","value":1,"min":-3,"max":3,"step":0.5},{"name":"b","value":2,"min":-6,"max":6,"step":1},{"name":"c","value":-1,"min":-5,"max":5,"step":1}],"features":["turning","roots","intercept"],"predict":{"prompt":"If b doubles, which way does the vertex move?","options":["Left","Right","It stays put"]}} — y over x and 0–3 single-letter parameters they drag; turning points, roots and the y-intercept are found on the curve live, so state none you have not computed. "predict" (optional) has them commit before they move anything: use it when the point is a relationship they can discover. Your prose: one or two lines — what to try in it.',
  claim:
    '{"type":"claim","claim":"We only use 10% of our brains","verdict":"fails","parts":[{"text":"Imaging shows activity across virtually every region over a day","holds":"yes","basis":"brain scans of ordinary activity"},{"text":"The 10% figure comes from research","holds":"no","basis":"no study found it; it traces to misquoted popular accounts"}]} — the claim inspected: verdict "holds", "fails", "partly" or "unsettled"; 2–5 parts it rests on, each "yes", "no", "partly" or "unclear", with what that rests on in a few words — the kind of evidence, never a study, figure or source you are not sure of. Your prose: the verdict and the one reason that settles it, in a sentence or two; the parts carry the rest, so do not also list them. They can open each part and say which one they doubt.',
  sim:
    '{"type":"sim","title":"Throw at 10 m/s","x":"v*cos(a*pi/180)*t","y":"v*sin(a*pi/180)*t-4.9*t^2","t":[0,"2*v*sin(a*pi/180)/9.8"],"view":{"x":[0,12],"y":[0,5]},"params":[{"name":"a","label":"angle","value":45,"min":5,"max":85,"step":1,"unit":"°"},{"name":"v","label":"speed","value":10,"min":2,"max":20,"step":1,"unit":"m/s"}],"readouts":[{"label":"range","expr":"v^2*sin(2*a*pi/180)/9.8","unit":"m","digits":1}],"predict":{"prompt":"Which angle lands as far as 30°?","options":["60°","15°","None"]}} — a path over time t with 1–3 parameters; when it ends and its readings are formulas, computed live, and each setting they try stays on the picture. Only for one relationship worth trying, never a dashboard. Your prose: what to try, in a line.',
  check:
    '{"type":"check","prompt":"Where is the vertex of y = 2x² − 8x + 3?","label":"x","answer":"-(-8)/(2*2)","explain":"x = −b/2a = 8/4 = 2"} — a question they work out and check: "answer" is plain arithmetic the engine evaluates, and "explain" shows only after they try. To let them try, never instead of explaining. Your prose: what it practises — never its answer.',
  steps:
    '{"type":"steps","title":"Complete the square","lines":[{"tex":"y = x^2 + 4x - 1"},{"tex":"= (x^2 + 4x + 4) - 4 - 1","why":"half of 4, squared, makes a perfect square"},{"tex":"= (x+2)^2 - 5"}],"check":{"prompt":"Now you: where is the vertex of y = x² − 6x + 2?","label":"x","answer":"6/2"}} — the working as lines of maths (TeX), with their own numbers when they have them; "why" folds under a line; "check" (optional) gives them one like it to do. Never the working that is theirs to do. Your prose: the method in a line; the lines carry the working.',
  diagram:
    '{"type":"diagram","view":"flow","title":"A rate rise, passed on","nodes":[{"id":"a","label":"Rates rise"},{"id":"b","label":"Borrowing costs more","detail":"loans and mortgages reprice"},{"id":"c","label":"Spending slows"},{"id":"d","label":"Prices rise more slowly"}],"edges":[["a","b"],["b","c"],["c","d"]]} — a chain from cause to effect (it may branch); 3–9 nodes, labels a few words, "detail" a line read when opened. Your prose: what drives it, in a sentence; the nodes carry the parts — do not also list them.',
  balance:
    '{"type":"balance","subject":"Index funds","for":[{"text":"Low fees","detail":"often under 0.1% a year"},{"text":"Instant diversification"}],"against":[{"text":"No downside protection"},{"text":"You own the weak companies too"}],"turns_on":"how long you can leave the money alone"} — one subject, 2–4 points each side, a few words each, "detail" read when opened; "turns_on" is the one thing that decides which side wins for most people. Your prose: that one thing, in a sentence; do not also list the sides.',
  equation:
    '{"type":"equation","tex":"\\\\text{CAC} = \\\\frac{\\\\text{sales and marketing spend}}{\\\\text{new customers}}","terms":[{"sym":"sales and marketing spend","means":"all of it, in the same period"},{"sym":"new customers","means":"won in that period"}],"example":{"tex":"\\\\frac{12000}{80} = 150"}} — the definition as one equation (TeX), each term a line, and one worked example in plain arithmetic (optional). Your prose: what it tells you, in a sentence.',
};

/** A timeline is a sequence too: what changes is that every item has its date, and the prose names the turning point. */
const SEQUENCE_TIMELINE =
  '{"type":"sequence","kind":"timeline","title":"The French Revolution","items":[{"label":"The Estates-General meets","when":"May 1789"},{"label":"The Bastille falls","when":"July 1789"},{"label":"The monarchy is abolished","when":"1792"}]} — 3–8 events in order, each with its "when"; "detail" (optional) is read when opened. Your prose: the turning point, in a sentence; the items carry the dates.';

/**
 * The ways onward, by what they lead to: for an idea, the ways deeper into it;
 * for practical advice, the rest of what matters; one layer down, the next.
 * An example about work, shown on a question about an idea, gets copied as
 * work ("Sketch the first five minutes" under the mean value theorem).
 */
const PATHS_DEEPER =
  '{"type":"paths","items":[{"label":"Why continuity matters","gist":"what goes wrong at a break"},{"label":"Where it is used","gist":"what it guarantees"}]} — 2–4 ways deeper, a few words each, such as the formal statement, why a condition matters, where it is used; opening one sends it as their next message. Ways to explore, not questions. Your prose: the idea itself, above them.';
const PATHS_MORE =
  '{"type":"paths","items":[{"label":"Pricing for teams","gist":"when per-seat beats flat"},{"label":"When to raise prices","gist":"the signals that say it is time"}]} — 2–4 of what else matters, a few words each; opening one sends it as their next message. Your prose: the few that matter most; what you left out goes here.';

/**
 * Which graph fits the idea: the same element, shown the construction the
 * idea needs — so a question about the mean value theorem is shown a chord
 * and the tangent that matches it, not a parabola to reshape.
 */
const GRAPH_TAIL = ' Everything marked on it — turning points, roots, crossings, slopes, where a tangent matches a chord, the readings — is computed on the curve as it is now, so state no value you have not computed. Your prose: one or two lines — what to try in it.';
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
    '{"type":"diagram","view":"cycle","title":"The water cycle","nodes":[{"id":"a","label":"Evaporation","detail":"the sun turns surface water to vapour"},{"id":"b","label":"Condensation"},{"id":"c","label":"Precipitation"},{"id":"d","label":"Collection"}],"edges":[["a","b"],["b","c"],["c","d"],["d","a"]]} — a cycle: each stage to the next, and the last back to the first (if it does not come back, "view":"flow").' + DIAGRAM_TAIL,
  tree:
    '{"type":"diagram","view":"tree","title":"A company","nodes":[{"id":"a","label":"Board"},{"id":"b","label":"Chief executive"},{"id":"c","label":"Product","detail":"what gets built"},{"id":"d","label":"Sales"},{"id":"e","label":"Finance"}],"edges":[["a","b"],["b","c"],["b","d"],["b","e"]]} — a hierarchy: one root, edges parent → child, three levels at most.' + DIAGRAM_TAIL,
  flow: GRAMMAR.diagram,
  causes:
    '{"type":"diagram","view":"causes","title":"Why the 2008 crash happened","nodes":[{"id":"a","label":"Cheap credit","role":"underlying"},{"id":"b","label":"Risky mortgages, resold","role":"underlying"},{"id":"c","label":"Heavy borrowing by banks","role":"amplifier"},{"id":"d","label":"Lehman Brothers fails","role":"trigger"},{"id":"e","label":"The crash","role":"effect"}],"edges":[["a","e"],["b","e"],["c","e"],["d","e"]]} — causes converging on what they brought about: each node a role — "underlying", "trigger", "amplifier" or "effect" — and edges pointing to the effect; only causes you could defend, and where historians disagree, say so in your prose.' + DIAGRAM_TAIL,
};

/** The grammar for a form as this turn needs it. */
function grammarFor(k: InlineKind, p: Presentation): string {
  if (k === 'graph') return GRAPH_GRAMMAR[p.graph ?? 'curve'];
  if (k === 'diagram') return DIAGRAM_GRAMMAR[p.diagram ?? 'flow'];
  if (k === 'sequence' && p.reasons.includes('sequence:timeline')) return SEQUENCE_TIMELINE;
  if (k === 'paths') return p.reasons.includes('paths:more') ? PATHS_MORE : p.reasons.includes('paths:deeper') || p.reasons.includes('paths:next-layer') ? PATHS_DEEPER : GRAMMAR.paths;
  return GRAMMAR[k];
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

/**
 * How the reply itself is shaped, on the kinds of turn where a model's habit
 * is the chatbot's. A starting point, never a word limit: the deeper shape
 * takes as long as the thread needs, and an idea to understand takes the
 * one sentence that carries it and what makes that sentence land.
 */
const SHAPES: Record<ReplyShape, (p: Presentation) => string> = {
  understand: (p) => {
    const element = p.forms.find((k) => k !== 'paths');
    const paths = p.forms.includes('paths');
    const deeperWays = paths
      ? '; the ways deeper go in the paths block — two or three, a few words each, such as the formal statement, why a condition matters, where it is used — to open one at a time'
      : '';
    // the answer is a set of parts: there is no single central sentence, and the element carries them — when
    // the parts ARE the answer (the form that fits), not when a sequence is only offered beside an idea
    if (element && PARTS_FORMS.has(element) && p.strong?.includes(element)) {
      return `\n\nTHE SHAPE OF THIS REPLY — they want to understand something made of parts. Minimum explanation, maximum understanding:\n- Open with one plain sentence on what ties the parts together — what drives it, or the principle that organises it — not the topic's name, its history, or "X is a fundamental concept in…". Keep everything as true as you can state it: where it is contested, say so.\n- Then the ${NOUN[element] ?? 'element'} below carries the parts: do not also write them out, in sentences or a list.\n- Then stop. No headings or sections, no applications or history they did not ask for${deeperWays}.\nIf a sentence carries it, that is the whole reply.\n`;
    }
    const after =
      element === 'graph'
        ? 'the graph below, with one line on what to try in it'
        : element === 'compare'
          ? 'the comparison below — the difference that decides most cases is your sentence, and the rows carry the rest'
          : element === 'equation'
            ? 'the equation below and its terms, with one line on what it tells you'
            : element
              ? `the ${NOUN[element] ?? 'element'} below, with a line on what to do with it`
              : 'one concrete example or image, if the sentence needs one';
    return `\n\nTHE SHAPE OF THIS REPLY — they want to understand an idea. Minimum explanation, maximum understanding:\n- Open with the central insight in one plain sentence: what it says and why it holds — the relationship itself, not the topic's name, its history, or "X is a fundamental concept in…". A condition it is false without (continuity, a sign, a domain, all else equal) belongs in that sentence or the next: never drop one for brevity, and never state something more strongly than it is true.\n- Then only what makes that sentence land: ${after} — not a second explanation of the same thing.\n- Then stop. No headings or sections${element === 'compare' ? '' : ', no list of properties'}, no applications, history or proof they did not ask for${deeperWays}.\nIf a sentence or two carries it, that is the whole reply.\n`;
  },
  practical: (p) => {
    const element = p.forms.find((k) => k !== 'paths');
    const paths = p.forms.includes('paths');
    const levers = element
      ? `the few levers that matter most, as the ${NOUN[element] ?? 'element'} below — not also written out`
      : 'the two or three levers that matter most for them, a line each, most important first';
    return `\n\nTHE SHAPE OF THIS REPLY — a practical question with an answer. Open with the one thing it hinges on for them and a concrete default — a number, a first move — in a sentence or two. Then ${levers}${paths ? '; the rest goes in the paths block, to open one at a time' : ''}. Nothing that would fit anyone: no generic best practice, no headings, no closing list of tips.\n`;
  },
  open: (p) => {
    const paths = p.forms.includes('paths');
    return `\n\nTHE SHAPE OF THIS REPLY — an open piece of work. Don't write the plan. Open with the problem that actually matters here, in a sentence or two: the thing that will make or break it, which they may not have put into words — not a restatement of what they asked. Then the one starting point you would take, concrete and particular to their situation, in a short paragraph. Then ${paths ? 'the ways it could go next as a paths block (below) — two to four, each a few words and a line on what opening it gives them — and stop there' : 'name the two or three ways it could go next, in a sentence, and stop there'}. No headings, no bolded sections, no generic best practice, and no closing question unless one answer would change everything you would say.\n`;
  },
  layer: (p) => {
    const element = p.forms.find((k) => k !== 'paths');
    const paths = p.forms.includes('paths');
    return `\n\nTHE SHAPE OF THIS REPLY — they opened one way deeper. Go one layer down, not the whole of it: the mechanism under it, or the one result that matters, in a few sentences${element ? `, or the ${NOUN[element] ?? 'element'} below if it shows it better` : ''} — built on what the conversation already said, never repeating it. ${paths ? 'Then the next ways deeper as a paths block — two or three, a few words each — so they choose how far to go.' : 'End on what it opens up next, in a sentence.'} No headings, no summary.\n`;
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

/** One rule for every element: what it shows, the words never say again. */
const NO_RESTATE = 'What a block shows, your words never repeat: no row, item or value again in sentences or a list.';
const FENCED = 'fenced on its own lines (```ui, the JSON on one line, ```)';

export interface PresentationContext {
  /** Socria's own regulation asked this turn to say what was checked (lib/mr/execute.ts VERIFY OUT LOUD) */
  verifyOutLoud?: boolean;
}

/**
 * The turn's shape and offer, or '' when there is neither — which is most
 * turns. A form that fits the turn's structure is offered as the form that
 * fits; the rest as optional, after it.
 */
export function renderPresentation(p: Presentation, ctx: PresentationContext = {}): string {
  if (p.place === 'content') return WRITE_UP;
  const shape = p.shape ? SHAPES[p.shape](p) : '';
  if (!p.forms.length) return shape;
  const fits = p.forms.filter((k) => p.strong?.includes(k));
  const maybe = p.forms.filter((k) => !fits.includes(k));
  const line = (k: InlineKind) => `- ${grammarFor(k, p)}`;
  let out = shape;
  if (fits.length) {
    const one = fits.length === 1;
    out += `\n\nTHE FORM THAT FITS — this turn is clearer as ${one ? 'this block' : 'these blocks'}: use ${one ? 'it' : 'them'} unless one sentence fully answers them. ${one ? 'It carries' : 'They carry'} the parts; your prose frames ${one ? 'it' : 'them'}. ${NO_RESTATE} Each ${FENCED}:\n${fits.map(line).join('\n')}\n`;
    if (maybe.length) out += `Optional, after it, if it helps:\n${maybe.map(line).join('\n')}\n`;
  } else {
    out += `\n\nINLINE, IF IT HELPS — optional; plain prose is often better. You may include ${maybe.length === 1 ? 'this' : 'one of these'}, ${FENCED}. ${NO_RESTATE}\n${maybe.map(line).join('\n')}\n`;
  }
  // one rule about what was checked: with a claim laid out, it is the parts' bases that say it
  if (ctx.verifyOutLoud && p.forms.includes('claim')) out += "What was checked goes in each part's basis; your prose says only what could not be checked.\n";
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
  const deeper = p.shape === 'deeper' ? 600 : p.shape === 'layer' ? 200 : 0;
  if (!p.forms.length) return deeper;
  if (p.forms.includes('draft') || p.forms.includes('concepts')) return 700 + deeper;
  // a diagram is nodes, each with a line to open, and the edges between them
  if (p.forms.includes('diagram')) return 600 + deeper;
  // a graph, a simulation or the working is one longer line of JSON: a cut-off one is not drawn at all
  if (p.forms.includes('graph') || p.forms.includes('sim') || p.forms.includes('steps')) return 550 + deeper;
  return (['sequence', 'decide', 'claim', 'balance', 'equation'].some((k) => p.forms.includes(k as InlineKind)) ? 450 : 350) + deeper;
}
