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
// Pure. No model, no network, no clock.

import { numbersIn, type InlineKind } from '../inline-ui';
import { claimCheck } from '../cognition/claims';
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
}

export interface Presentation {
  forms: InlineKind[];
  /** content-free reasons, for the trace and the tests */
  reasons: string[];
  /** where the reply is read: the conversation, or Content (a write-up they asked to keep) — absent is the conversation */
  place?: 'chat' | 'content';
  /** how the reply itself is shaped this turn: an open piece of work, going deeper on one thread, or an idea to understand — absent is the core's default */
  shape?: 'open' | 'deeper' | 'understand';
  /** which graph fits the idea, when a graph is offered: a curve's shape, rates on it, curves that meet, a point along one */
  graph?: GraphVariant;
}
export type GraphVariant = 'curve' | 'rate' | 'tangent' | 'market' | 'point';

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
/** Two or more named options, set against each other. */
const VERSUS = /\b(?:vs\.?|versus|compared?\s+(?:to|with)|or\s+(?:the\s+)?[A-Za-z0-9])/i;
const COMPARE_ASK = /\b(?:compare|comparison|difference between|differences between|which (?:is|one|of these|should|would)|better(?: for| option)?|pros and cons|trade-?offs?|should i (?:go with|pick|choose|take|get|buy)|choose between|decide between)\b/i;
/** How a quantity moves when something else does. */
const WHAT_IF = /\b(?:what if|how much (?:would|will|do|does|is|can)|how (?:does|would) (?:it|that|the \w+) change|depends on|if i (?:change|raise|lower|increase|decrease|put|save|invest|borrow)|monthly payments?|interest|compound(?:ing|ed)?|loan|mortgage|savings?|invest(?:ing|ment)?|growth rate|break[- ]?even|discount|tip|tax(?:es)?|salary|wage|commission|percent|percentage|rate)\b/i;
const FORMULA = /\b[a-z]\s*=\s*[^=\n]*[a-z][^=\n]*$|\bf\s*\(\s*x\s*\)\s*=/im;
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
/** A list asked for in so many words: they get a list, not something in its place. */
const LIST_ASK = /\b(?:list|lists|listing|bullet(?:ed)?|bullets|enumerate|numbered|point form)\b/i;
/** Steps to follow, in order. */
const STEPS_ASK = /\b(?:steps? (?:to|for|in|of)|step[- ]by[- ]step|how (?:do|can|would|should) (?:i|you|we|one) (?:go about|get started|set up|apply|register|install|prepare|start|file|enrol|enroll)|(?:the )?process (?:of|for|to)|stages of|phases of|life ?cycle of|how does an? [\w\s-]{2,30} become|procedure (?:for|to))\b/i;
/**
 * How a system or a game works, asked about as a whole: "how does American
 * football work?", "how do elections work". A few ordered parts may carry it —
 * the four downs, the stages of a bill — so a compact sequence is offered, and
 * the reply decides; prose is still the answer.
 */
const HOW_IT_WORKS = /\bhow\s+(?:does|do)\s+(?:an?\s+|the\s+)?(?:[\w'’-]+\s+){0,4}?[\w'’-]+\s+work\b/i;
/** Events in time, where the order is the point. */
const TIMELINE_ASK = /\b(?:timeline|chronolog(?:y|ical)|sequence of events|key (?:events|dates|moments|milestones)|what happened (?:in|during|between|when|after|before)|how (?:did|has|have) [\w\s-]{2,40} (?:evolved?|developed?|changed?|unfold(?:ed)?) over time)\b/i;
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
 * them.
 */
const DECIDE_ASK =
  /\b(?:should (?:i|we)\b[^?.!]{0,90}\bor\b|help (?:me|us) (?:decide|choose|pick)|(?:i'?m|we'?re|i am|we are) (?:torn|deciding|trying to decide|choosing|stuck) between|can'?t decide (?:between|whether)|which (?:one )?should (?:i|we) (?:pick|choose|go (?:with|for)|take)|decide between|choose between|weigh(?:ing)? (?:up )?(?:my|the|our) options)/i;
/**
 * Going deeper on one thread: a way deeper opened ("Go deeper: …", lib/inline-ui.ts
 * pathAsk), an overview's part followed ("Take me further into …"), or said in
 * words — "say more about the second one", "expand on that", "walk me through
 * it in detail".
 */
const DEEPER =
  /^(?:(?:ok(?:ay)?|great|yes|yeah|sure|right|nice|good|perfect|cool),?\s+)?(?:let'?s\s+)?(?:go deeper|dig (?:deeper|into)|say more about|tell me more(?: about)?|expand on|elaborate on|unpack|more on|take me further into|go further (?:on|into)|explain (?:that|this|it) (?:in more detail|further|more)|walk me through (?:that|this|it)(?: in detail)?|go into (?:more )?detail)\b/i;
/** A relationship in maths or science, asked about: something they could see by changing a number. */
const MATH_REL = /\b(?:parabolas?|quadratics?|vertex|vertices|slope|gradient|intercepts?|linear functions?|exponential|logarithm(?:s|ic)?|sine|cosine|sin\s*\(|cos\s*\(|amplitude|period|asymptotes?|derivatives?|tangent line|functions?|graphs?|curves?|y\s*=|f\s*\(\s*x\s*\))/i;
const WHY_HOW = /\b(?:why|how|what happens|what does|explain|understand|intuition|make sense|confused|get it|don'?t get|mean|means|change|changes|affect|affects|shift|shifts|move|moves|depend|depends|look like)\b/i;
/**
 * Rates on a curve: the slope at a point against the average over an interval —
 * the mean value theorem, what a derivative is, marginal against average.
 */
/** …of which the average over an interval, set against the rate at a point: the chord and the tangent that matches it. */
const AVERAGE_RATE = /\b(?:mean value theorem|mvt|rolle'?s theorem|average (?:rate|slope|velocity|speed)|secant(?: lines?)?)\b/i;
const RATE = /\b(?:mean value theorem|mvt|rolle'?s theorem|derivatives?|differentiat\w*|tangent(?: lines?)?|secant(?: lines?)?|rates? of change|instantaneous|average (?:rate|slope|velocity|speed)|slope of (?:a|the) (?:curve|tangent|graph)|limit definition|first principles|marginal (?:cost|revenue|product|utility))\b/i;
/** Curves that meet and shift: a market, a tax, a price control. */
const MARKET = /\b(?:supply|demand curve|demand and supply|equilibrium|price (?:ceiling|floor|controls?)|tax(?:es)? on (?:sellers|buyers|producers|consumers|suppliers)|tax incidence|tariffs?|subsid(?:y|ies)|shortages?|surplus(?:es)?|deadweight(?: loss)?|break[- ]even)\b/i;
/** A quantity that changes along a curve: elasticity. */
const ELASTIC = /\b(?:elasticit(?:y|ies)|(?:price[- ])?(?:in)?elastic)\b/i;
/** What a concept question asks about — a subject's idea, not a lookup ("what's the capital of Peru?" is not one). */
const SUBJECT = /\b(?:theorem|lemma|law|principle|effect|theory|paradox|equation|formula|function|derivative|integral|limit|vector|matrix|probability|distribution|variance|entropy|energy|momentum|force|evolution|photosynthesis|elasticit(?:y|ies)|opportunity cost|inflation|interest|equilibrium|supply|demand|marginal|algorithm|recursion|statistic\w*|correlation|causation|regression|hypothesis)\b/i;
/** A question of what an idea is or means: "what is a derivative?", "what does elasticity mean?". */
const CONCEPT_Q = /^(?:(?:so|ok(?:ay)?|hey|hi),?\s+)?(?:what(?:'s|\s+is|\s+are|\s+does)|what\s+exactly\s+is|define)\b/i;
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
/** The working, asked for. */
const WORKING_ASK = /\b(?:how do (?:i|you|we) (?:solve|find|work out|calculate|complete|factor|simplify|integrate|differentiate)|show (?:me )?(?:the )?(?:working|steps|how)|work (?:it |this |that )?(?:out|through)|walk me through (?:solving|the (?:maths|math|algebra|derivation|working))|derive|derivation|complete the square|solve (?:for|this|it|the)|step[- ]by[- ]step)\b/i;
/** Practising: a question of their own to work out. */
const PRACTICE_ASK = /\b(?:quiz me|test me|check (?:my|if i) understand\w*|practice (?:question|problem)s?|give me (?:a|one|another|some) (?:problem|question|example)s?(?: to try)?|let me try|can i try|another one)\b/i;
/** Work that is not reading an explanation: making something, doing it themselves, checking or fixing. */
const NOT_READING = new Set(['creation', 'practice', 'verification', 'diagnosis', 'execution']);

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
  const offer = (k: InlineKind, why: string) => {
    if (!offered.includes(k) && offered.length < 2) {
      offered.push(k);
      reasons.push(why);
    }
  };
  const work = i.state.work;
  const nums = numbersIn(t).filter((n) => Math.abs(n) >= 1);
  // the shape of the reply itself, before what may be drawn in it
  const deeper = DEEPER.test(t);
  const openWork =
    !deeper && x.kind !== 'brainstorm' && !CONCRETE.test(t) && (OPEN_WORK.test(t) || HOW_APPROACH.test(t)) && !['verification', 'diagnosis', 'practice', 'information'].includes(work);
  // a choice that is theirs, between options they named: a decision they weigh, not one that leans for them
  const deciding = DECIDE_ASK.test(t) && (VERSUS.test(t) || /\bbetween\b[\s\S]+\band\b/i.test(t)) && work !== 'creation';
  // a claim put up to be checked (lib/cognition/claims.ts): the verdict first, the parts it rests on to inspect
  const claim = claimCheck(t);
  // an idea to understand: wanting the reasoning (lib/cognition/assist.ts wantsExplanation, said as a need
  // or a question), or asking what an idea in a subject is — never a lookup, a claim, a choice or a discussion
  const subject = SUBJECT.test(t) || MATH_REL.test(t) || RATE.test(t) || MARKET.test(t) || ELASTIC.test(t) || i.state.domain === 'math';
  const understanding =
    !deeper && !openWork && !deciding && !claim && x.kind === 'task' &&
    (work === 'explanation' || (work === 'information' && CONCEPT_Q.test(t) && subject));
  const shape: Presentation['shape'] = deeper ? 'deeper' : openWork ? 'open' : understanding ? 'understand' : undefined;
  if (shape) reasons.push(`shape:${shape}`);

  // a list of their own amounts, with names: a small chart says it at a glance
  if (namedAmounts(t) >= 3 && nums.length <= 24) offer('chart', 'chart:their-numbers');
  if (deciding) offer('decide', 'decide:their-choice');
  // options set against each other — the facts side by side, when the choice is not theirs to weigh here
  else if (COMPARE_ASK.test(t) && (VERSUS.test(t) || /\band\b/i.test(t)) && work !== 'creation') offer('compare', 'compare:options');
  // a relationship they could discover by changing a number: a graph to change (under the guard too —
  // nothing that would be the answer is marked on it). Which graph follows the idea: rates on a curve
  // (the chord and the tangent that matches it), curves that meet (a tax shifting supply), a point along
  // a curve (elasticity), or the curve's own shape.
  const variant: GraphVariant | null = RATE.test(t) ? (AVERAGE_RATE.test(t) ? 'rate' : 'tangent') : MARKET.test(t) ? 'market' : ELASTIC.test(t) ? 'point' : MATH_REL.test(t) ? 'curve' : null;
  let graph: GraphVariant | undefined;
  if (variant && work !== 'creation' && x.kind !== 'brainstorm' && !claim && (understanding || WHY_HOW.test(t) || FORMULA.test(t))) {
    offer('graph', `graph:${variant}`);
    graph = variant;
  }
  // a claim to check: the verdict, and the parts it rests on to open and doubt (not laid out under the guard)
  if (claim && !i.guard) offer('claim', 'claim:inspect');
  // motion, or something that unfolds in time, asked why or how: one small simulation to try
  if (work !== 'creation' && simAsk(t) && WHY_HOW.test(t)) offer('sim', 'sim:try-it');
  // the working, asked for — never the working that is theirs, never under the guard
  if (!i.guard && !i.ownReasoning && WORKING_ASK.test(t)) offer('steps', 'steps:working');
  // practising, asked for in so many words ("let me try one"): a question they work out and check, their
  // own work — a question, so only where one may go. A problem handed over ("solve 2x + 3 = 7") is not this.
  if (i.questions > 0 && PRACTICE_ASK.test(t)) offer('check', 'check:practice');
  // a quantity that moves with something they can vary — unless a graph or a simulation already shows it
  if (!i.guard && !offered.includes('graph') && !offered.includes('sim') && ((WHAT_IF.test(t) && nums.length >= 1) || (FORMULA.test(t) && /\b(?:change|vary|depends?|how does|what happens)\b/i.test(t)))) offer('slider', 'slider:what-if');
  // practical writing they handed over: editable in place
  if (work === 'creation' && PRACTICAL_TEXT.test(t) && !i.ownWriting) offer('draft', 'draft:practical-writing');
  // an open piece of work: the ways it could go next, to open one at a time — after the useful part, never instead of it
  if (openWork && !offered.includes('draft')) offer('paths', 'paths:open-work');
  // an idea with depth to it: the ways deeper (the formal statement, why a condition matters, where it is used),
  // opened one at a time instead of written out unasked — not for an everyday why, which a sentence answers
  else if (understanding && (offered.includes('graph') || subject || i.state.domain === 'learning' || i.state.domain === 'research')) offer('paths', 'paths:deeper');
  // an open request: a few directions to tap instead of typing — a question, so only where one may go
  else if (i.questions > 0 && words(t) <= 8 && OPEN_ASK.test(t) && !t.includes('?')) offer('options', 'options:open-request');
  // A list asked for is a list; and under the guard, nothing laid out to read instead of working it.
  const listAsked = LIST_ASK.test(t);
  // the parts of a subject, to explore one at a time — an overview, not a list of terms and definitions
  if (!i.guard && !listAsked && x.kind !== 'brainstorm' && !NOT_READING.has(work) && (OVERVIEW.test(t) || FIELD.test(t))) offer('concepts', 'concepts:overview');
  // events whose order is the point (not under the guard: the gate would drop it, lib/inline-ui.ts)
  if (!i.guard && !listAsked && TIMELINE_ASK.test(t)) offer('sequence', 'sequence:timeline');
  // steps to follow — never the steps of something that is theirs to work out
  else if (!i.guard && !listAsked && !i.ownReasoning && work !== 'creation' && STEPS_ASK.test(t)) offer('sequence', 'sequence:steps');
  // how a system works, asked about as a whole: its ordered parts may carry it (the four downs)
  else if (!i.guard && !listAsked && !i.ownReasoning && work !== 'creation' && x.kind !== 'brainstorm' && HOW_IT_WORKS.test(t)) offer('sequence', 'sequence:how-it-works');
  // a check, or a call Socria may weigh in on: the answer up top, the steps folded under it. Not an
  // explanation — prose is the explanation — and never reasoning that is theirs to do or a decision
  // that is theirs to make
  // A comparison already lays the reasoning out, and a quick call ("what tip should I leave?") needs none.
  const call = work === 'judgment' && !i.ownJudgment && words(t) >= 10 && !offered.includes('compare') && !offered.includes('decide');
  if (!i.guard && !i.ownReasoning && ((work === 'verification' && words(t) >= 6) || call) && x.kind !== 'brainstorm') offer('reasoning', 'reasoning:steps');

  // not the same form a third time running
  const recent = usedRecently(i.history);
  const forms = offered.filter((k) => !(recent.length === 2 && recent.every((r) => r.includes(k))));
  if (forms.length < offered.length) reasons.push('repeat-held');
  return { forms, reasons: reasons.length ? reasons : ['nothing-fits'], ...(shape ? { shape } : {}), ...(graph && forms.includes('graph') ? { graph } : {}) };
}

// ── what the reply is told ───────────────────────────────────────────

/** Each form's grammar, as short as it can be and still be written right. */
const GRAMMAR: Record<InlineKind, string> = {
  chart:
    '{"type":"chart","kind":"bar","title":"…","x":["Rent","Food","Transport"],"series":[{"name":"…","values":[1200,400,150]}],"unit":"$","basis":"given"} — kind bar, line or pie; values exactly as they gave them (basis "given") or from a source this turn ("source"). A chart of figures from anywhere else is not drawn.',
  slider:
    '{"type":"slider","title":"…","formula":"p*(r/1200)/(1-(1+r/1200)^(-360))","result":{"label":"Monthly payment","unit":"$","digits":0},"vars":[{"name":"p","label":"Loan","min":50000,"max":1000000,"step":5000,"value":300000,"unit":"$"},{"name":"r","label":"Rate","min":1,"max":12,"step":0.25,"value":6,"unit":"%"}]} — 1–3 variables, single letters; the result is computed live from the formula (plain arithmetic, ^ for powers), so state no result you have not computed.',
  compare:
    '{"type":"compare","options":["A","B"],"rows":[{"label":"Cost","values":["…","…"]}],"pick":0} — 2–4 options, up to 6 short rows; "pick" only when you said which and why. Figures you are not sure of are marked unchecked.',
  reasoning:
    '{"type":"reasoning","summary":"the conclusion, in a line","steps":["…","…"]} — the answer stays in your prose, short; the reasoning folds under it.',
  options:
    '{"type":"options","options":[{"label":"Start from the outline"},{"label":"Fix the introduction"}]} — 2–4 directions to tap instead of typing; then do not also ask in words.',
  draft:
    '{"type":"draft","kind":"email","title":"…","text":"…"} — the text they asked for, editable in place; a line around it at most.',
  concepts:
    '{"type":"concepts","title":"…","items":[{"name":"Supply and demand","gist":"what it is, in a line","detail":"two or three sentences, read when opened","links":["Market structure"]}]} — 3–7 parts of the subject; links name other items. Your prose is a short introduction: what holds the parts together. Do not also list them.',
  sequence:
    '{"type":"sequence","kind":"steps","title":"…","items":[{"label":"…","detail":"…"}]} — 3–8 in order; kind "timeline" gives every item a "when" ("1789"). Only when the order is the point; the prose says what it shows.',
  paths:
    '{"type":"paths","items":[{"label":"Sketch the first five minutes","gist":"what opening it would give them, in a line"}]} — 2–4 ways the work could go next, each a few words; opening one sends it as their next message. Ways to explore, not questions; the useful part stays in your prose above it.',
  decide:
    '{"type":"decide","title":"…","options":["…","…"],"rows":[{"label":"Cost over five years","scores":[2,1],"note":"why, in a few words"}]} — a choice that is theirs: 2–4 options, 2–5 things it rests on (from what they said matters), and your honest first reading of each option on each (0 poor – 3 strong, in option order). They set how much each matters and can change any reading; the leaning is computed from their weights, so name no winner in your prose. Your prose: the one thing it turns on, in a sentence or two; the rows carry the rest, so do not also list them.',
  graph:
    '{"type":"graph","title":"…","expr":"a*x^2+b*x+c","x":[-6,4],"params":[{"name":"a","value":1,"min":-3,"max":3,"step":0.5},{"name":"b","value":2,"min":-6,"max":6,"step":1},{"name":"c","value":-1,"min":-5,"max":5,"step":1}],"features":["turning","roots","intercept"],"predict":{"prompt":"If b doubles, which way does the vertex move?","options":["Left","Right","It stays put"]}} — y over x and 0–3 single-letter parameters they drag; turning points, roots and the y-intercept are found on the curve live, so state none you have not computed. "predict" (optional) has them commit before they move anything: use it when the point is a relationship they can discover. One or two lines of prose around it.',
  claim:
    '{"type":"claim","claim":"We only use 10% of our brains","verdict":"fails","parts":[{"text":"Imaging shows activity across virtually every region over a day","holds":"yes","basis":"brain scans of ordinary activity"},{"text":"The 10% figure comes from research","holds":"no","basis":"no study found it; it traces to misquoted popular accounts"}]} — the claim inspected: verdict "holds", "fails", "partly" or "unsettled"; 2–5 parts it rests on, each "yes", "no", "partly" or "unclear", with what that rests on in a few words — the kind of evidence, never a study, figure or source you are not sure of. Your prose: the verdict and the one reason that settles it, in a sentence or two; the parts carry the rest, so do not also list them. They can open each part and say which one they doubt.',
  sim:
    '{"type":"sim","title":"Throw at 10 m/s","x":"v*cos(a*pi/180)*t","y":"v*sin(a*pi/180)*t-4.9*t^2","t":[0,"2*v*sin(a*pi/180)/9.8"],"view":{"x":[0,12],"y":[0,5]},"params":[{"name":"a","label":"angle","value":45,"min":5,"max":85,"step":1,"unit":"°"},{"name":"v","label":"speed","value":10,"min":2,"max":20,"step":1,"unit":"m/s"}],"readouts":[{"label":"range","expr":"v^2*sin(2*a*pi/180)/9.8","unit":"m","digits":1}],"predict":{"prompt":"Which angle lands as far as 30°?","options":["60°","15°","None"]}} — a path over time t with 1–3 parameters; when it ends and its readings are formulas, computed live, and each setting they try stays on the picture. Only for one relationship worth trying, never a dashboard.',
  check:
    '{"type":"check","prompt":"Where is the vertex of y = 2x² − 8x + 3?","label":"x","answer":"-(-8)/(2*2)","explain":"x = −b/2a = 8/4 = 2"} — a question they work out and check themselves: "answer" is plain arithmetic the engine evaluates (not just your number), and "explain" is shown only after they try. To let them try, never instead of explaining.',
  steps:
    '{"type":"steps","title":"…","lines":[{"tex":"y = x^2 + 4x - 1"},{"tex":"= (x^2 + 4x + 4) - 4 - 1","why":"half of 4, squared, makes a perfect square"},{"tex":"= (x+2)^2 - 5"}],"check":{"prompt":"Now you: where is the vertex of y = x² − 6x + 2?","label":"x","answer":"6/2"}} — the working as lines of maths (TeX), with their own numbers when they have them; "why" folds under a line; "check" (optional) gives them one like it to do. Never the working that is theirs to do.',
};

/**
 * Which graph fits the idea: the same element, shown the construction the
 * idea needs — so a question about the mean value theorem is shown a chord
 * and the tangent that matches it, not a parabola to reshape.
 */
const GRAPH_TAIL = ' Everything marked on it — turning points, roots, crossings, slopes, where a tangent matches a chord, the readings — is computed on the curve as it is now, so state no value you have not computed. One or two lines of prose around it: what to try.';
const GRAPH_GRAMMAR: Record<GraphVariant, string> = {
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
 * How the reply itself is shaped, on the kinds of turn where a model's habit
 * is the chatbot's. A starting point, never a word limit: the deeper shape
 * takes as long as the thread needs, and an idea to understand takes the
 * one sentence that carries it and what makes that sentence land.
 */
const SHAPES: Record<NonNullable<Presentation['shape']>, (p: Presentation) => string> = {
  understand: (p) => {
    const element = p.forms.find((k) => k !== 'paths');
    const paths = p.forms.includes('paths');
    return `\n\nTHE SHAPE OF THIS REPLY — they want to understand an idea. Minimum explanation, maximum understanding:\n- Open with the central insight in one plain sentence: what it says and why it holds — the relationship itself, not the topic's name, its history, or "X is a fundamental concept in…". A condition it is false without (continuity, a sign, a domain, all else equal) belongs in that sentence or the next: never drop one for brevity, and never state something more strongly than it is true.\n- Then only what makes that sentence land: ${element === 'graph' ? 'the graph below, with one line on what to try in it' : element ? 'the element below, with a line on what to do with it' : 'one concrete example or image, if the sentence needs one'} — not a second explanation of the same thing.\n- Then stop. No headings or sections, no list of properties, no applications, history or proof they did not ask for${paths ? '; the ways deeper go in the paths block — two or three, a few words each, such as the formal statement, why a condition matters, where it is used — to open one at a time' : ''}.\nIf a sentence or two carries it, that is the whole reply.\n`;
  },
  open: (p) => {
    const paths = p.forms.includes('paths');
    return `\n\nTHE SHAPE OF THIS REPLY — an open piece of work. Don't write the plan. Open with the problem that actually matters here, in a sentence or two: the thing that will make or break it, which they may not have put into words — not a restatement of what they asked. Then the one starting point you would take, concrete and particular to their situation, in a short paragraph. Then ${paths ? 'the ways it could go next as a paths block (below) — two to four, each a few words and a line on what opening it gives them — and stop there' : 'name the two or three ways it could go next, in a sentence, and stop there'}. No headings, no bolded sections, no generic best practice, and no closing question unless one answer would change everything you would say.\n`;
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

/** The turn's shape and offer, or '' when there is neither — which is most turns. */
export function renderPresentation(p: Presentation): string {
  if (p.place === 'content') return WRITE_UP;
  const shape = p.shape ? SHAPES[p.shape](p) : '';
  if (!p.forms.length) return shape;
  const grammar = (k: InlineKind) => (k === 'graph' ? GRAPH_GRAMMAR[p.graph ?? 'curve'] : GRAMMAR[k]);
  return `${shape}\n\nINLINE, IF IT HELPS — optional; plain prose is often better. You may include ${p.forms.length === 1 ? 'this' : 'one or both of these'}, each as a fenced block on its own lines (\`\`\`ui, the JSON on one line, \`\`\`), and keep the words around it short:\n${p.forms.map((k) => `- ${grammar(k)}`).join('\n')}\n`;
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
  // going deeper on a thread takes the room the thread needs: a cut-off part is worse than a long one
  const deeper = p.shape === 'deeper' ? 600 : 0;
  if (!p.forms.length) return deeper;
  if (p.forms.includes('draft') || p.forms.includes('concepts')) return 700 + deeper;
  // a graph, a simulation or the working is one longer line of JSON: a cut-off one is not drawn at all
  if (p.forms.includes('graph') || p.forms.includes('sim') || p.forms.includes('steps')) return 550 + deeper;
  return (p.forms.includes('sequence') || p.forms.includes('decide') || p.forms.includes('claim') ? 450 : 350) + deeper;
}
