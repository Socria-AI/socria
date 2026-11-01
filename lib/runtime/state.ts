// lib/runtime/state.ts — THE COGNITIVE STATE MODEL.
//
// What the turn is about and where the work stands, read from the
// conversation and the workspace — never from a model. Core 4 fills a larger
// state with a model call on every turn; this is the part of it the runtime
// actually decides on, derived in code in well under a millisecond.
//
// TEMPORARY BY CONSTRUCTION. It is recomputed every turn and never written
// anywhere: the person's lasting memory is the Mind Graph, with its own
// provenance and review (lib/mind). Nothing here is a judgement about the
// person — no personality, no ability label, nothing about health, beliefs or
// identity. "They said they're a beginner" is their word for this
// conversation; "they're struggling" is never inferred.
//
// Pure. No model, no network, no clock (time arrives in the input).

import type { ExplicitSignals, WorkKind } from '../core4/types';
import type { MapDigest } from '../cognition/digest';
import { asksForDecision, isFactQuestion, offersWork, wantsExplanation } from '../cognition/assist';
import { claimCheck } from '../cognition/claims';
import { quickPlot } from './plot-ask';
import { BASE_RATE, LIST_LEAD, PERSONAL_HOW, adviceAsk, adviceKind, comparisonAsk, mathProblem, requestBody, topicAsk } from './asks';
import { looksMath } from '../tex-split';
import { onlyAboutSocria, readExchange, saysFeeling, smallTalk, withoutGreeting, type Exchange } from '../cognition/register';
import type { Intent } from './orchestrate';

export const DOMAINS = ['business', 'research', 'engineering', 'writing', 'learning', 'creative', 'math', 'everyday'] as const;
export type Domain = (typeof DOMAINS)[number];

/** Words that place a conversation, weighed together — one word decides nothing. */
const DOMAIN_WORDS: Record<Exclude<Domain, 'everyday'>, RegExp> = {
  business:
    /\b(?:revenue|customers?|clients?|pricing|market(?:ing)?|marketers?|sales|startup|investors?|funding|roi|kpis?|margins?|profit|competitors?|stakeholders?|budget|hiring|hire|cash runway|months of runway|headcount|payroll|co-?founders?|valuation|marketplace|seed[- ]stage|gmv|okrs?|b2b|saas|churn|go[- ]to[- ]market|business|company|quarter(?:ly)?|forecast)\b/gi,
  research:
    /\b(?:research|stud(?:y|ies) (?:found|shows?|suggests?)|papers?|literature|journal|hypothes[ie]s|evidence|sources?|citations?|methodology|dataset|data set|survey|experiment|findings|peer[- ]review(?:ed)?|meta-analysis|sample size|confound\w*)\b/gi,
  engineering:
    /\b(?:code|coding|bug|debug\w*|error|exception|stack ?trace|api|endpoint|function|compile\w*|deploy\w*|database|sql|query|server|frontend|backend|react|python|javascript|typescript|java|rust|golang|docker|kubernetes|algorithm|latency|refactor\w*|repo|git|circuit|cad|tolerance|beam|torque|voltage)\b/gi,
  writing:
    /\b(?:essay|draft|paragraph|thesis statement|chapter|outline|cover letter|personal statement|blog post|article|proofread\w*|rewrite|prose|wording|my sentence|introduction|conclusion|word count)\b/gi,
  learning:
    /\b(?:exam|quiz|homework|assignment|class|course|lecture|syllabus|studying|study for|learn\w*|understand\w*|revision|tutor|professor|teacher|semester|midterm|finals?|economics|microeconomics|macroeconomics|elasticity|equilibrium|supply and demand|marginal (?:cost|revenue|utility|product)|opportunity cost|tax incidence|deadweight loss|inflation)\b/gi,
  creative:
    /\b(?:story|stories|novel|poem|poetry|characters?|screenplay|song|lyrics|worldbuilding|brainstorm\w*|creative|game idea|name ideas|plot twist|fiction)\b/gi,
  // "Solve 2x^2 - 8x + 6 = 0": the exponent follows a coefficient, so a word boundary before the x never
  // matched it, and the problem was read as nothing in particular (November 2026). "Solve", "prove",
  // "irrational" and "induction" count only beside a mathematical object: "solve a conflict with my
  // roommate", "prove my landlord kept the deposit", "she is being so irrational" and "my induction
  // ceremony" are not mathematics, and once read as it the MATHEMATICS block stayed on for the rest of
  // the conversation (adversarial review, November 2026).
  math:
    /\b(?:derivative|integral|equation|solve for|matri(?:x|ces)|eigen\w*|probabilit\w*|theorem|proof|limit|calculus|algebra|geometry|statistics|regression|variance|polynomial|quadratic|parabola|logarithm|irrational numbers?|(?:by|proof by|mathematical|strong) induction|p-?values?|chain rule)\b|\bsolve\s+(?:the\s+(?:equation|quadratic|system|inequality|integral)|this\s+(?:equation|integral|quadratic)|-?\d|[a-z]\s*[=^+\-<>²])|\bprove\s+that\b[^.?!]{0,80}?(?:=|\d|\b(?:numbers?|primes?|sqrt|integers?|irrational|divisible|even|odd|triangles?|angles?)\b)|\bsquare\s+roots?\s+of\s+(?:\d|[a-z]\b)|[∫∑√]|(?<![a-z])[a-z]\s*\^\s*\d/gi,
};

/** The map's own reading of the thinking, where it has one. */
const CONTEXT_DOMAIN: Record<string, Domain> = {
  writing: 'writing',
  creating: 'creative',
  brainstorming: 'creative',
  researching: 'research',
  learning: 'learning',
  math: 'math',
  analysing: 'research',
};

/**
 * WHAT KIND OF CONVERSATION THIS IS, by the words in it. The newest message
 * counts double; the map's reading counts once. Ties go to the newest
 * message's own winner; nothing at all is "everyday".
 */
export function readDomain(userTexts: readonly string[], mapContext?: string | null): Domain {
  const score = new Map<Domain, number>();
  const recent = userTexts.slice(-4);
  recent.forEach((text, i) => {
    const weight = i === recent.length - 1 ? 2 : 1;
    for (const [d, re] of Object.entries(DOMAIN_WORDS) as [Domain, RegExp][]) {
      const n = (text.match(re) ?? []).length;
      if (n) score.set(d, (score.get(d) ?? 0) + Math.min(n, 3) * weight);
    }
  });
  const fromMap = mapContext ? CONTEXT_DOMAIN[mapContext] : undefined;
  if (fromMap) score.set(fromMap, (score.get(fromMap) ?? 0) + 1);
  let best: Domain = 'everyday';
  let top = 0;
  for (const [d, n] of score) {
    if (n > top) {
      best = d;
      top = n;
    }
  }
  return best;
}

/**
 * Has this conversation been mathematical at any point? Once true it stays
 * true, so the block it switches on keeps the system message the same from
 * turn to turn (behavior.ts).
 */
export function looksMathematical(texts: readonly string[]): boolean {
  const re = new RegExp(DOMAIN_WORDS.math.source, 'i');
  // a $…$ span counts only when what is inside it is mathematics: "from $29 to $49" is two prices
  // (lib/tex-split.ts looksMath, the judgement the renderer makes of the same span)
  const tex = (t: string) => [...t.matchAll(/\$([^$\n]{1,80})\$/g)].some((m) => looksMath(m[1]));
  return texts.some((t) => re.test(t) || tex(t) || /\\(?:frac|int|sum|sqrt)\b/.test(t));
}

// "find the derivative of x³ sin x" is a problem to work, said the way a problem set says it — it was read as
// nothing in particular and reached the reply with no move (November 2026). "Calculate 18% of 340" is a quick
// sum, answered (isFactQuestion), so "calculate" and "compute" are not here.
//
// …and "solve", "integrate", "factor", "work out" are everyday verbs too: "how do I set up two-factor
// authentication?", "integrate Stripe with my Next.js app", "work out at home", "solve a conflict" were read
// as maths practice and scaffolded, so the steps they asked for were withheld (adversarial review, November
// 2026). The verbs count only beside a mathematical object; the problem-set phrasings count on their own.
const PROBLEM_SURE = /\b(?:my (?:homework|assignment|problem set)|find (?:the )?(?:derivative|integral|antiderivative|limit|roots?|zeros?|area under|slope of|equation of|inverse of)|evaluate (?:the )?(?:integral|limit|derivative))\b/i;
const problemIn = (t: string) => PROBLEM_SURE.test(t) || mathProblem(t);
/** Their own thing is broken — code, a build, a device, a formula — not a broken thing mentioned in passing. */
const DIAGNOSIS = /\b(?:bug|stack ?trace|exception|traceback|segfault|(?:app|program|game|computer|laptop|pc|mac|phone|code|build|server|browser|script|it|this|excel|word|chrome)\s+(?:keeps\s+)?crash(?:es|ed|ing)?|crash(?:es|ed|ing)?\s+(?:on|when|whenever|every\s+time|at\s+startup|on\s+launch)|throws?|(?:my|the|this) (?:code|script|program|app|build|test|tests|query|formula|function|setup|config)\b[^.?!]{0,40}\b(?:broken|fails?|failing|doesn'?t work|isn'?t working|not working|errors?)|(?:it|this) (?:doesn'?t|won'?t|isn'?t) (?:work|working|compile|run|load)|why (?:won'?t|doesn'?t|isn'?t) (?:it|this|my))\b/i;
const RESEARCH = /\b(?:find (?:me )?(?:sources|studies|papers|evidence)|look (?:it |this )?up|research (?:this|the|how|whether)|what does the (?:research|evidence|literature) say|is there (?:evidence|research))\b/i;
const EXECUTION = /\b(?:convert|format|reformat|translate|summari[sz]e|rewrite|proofread|calculate|compute|sort|rename|fix (?:this|my|the)|clean up|tighten|shorten)\b/i;
/** A request that opens with what to do: the work is the doing. */
const LEADS_WITH_DOING = /^(?:(?:can|could|would) you |please |pls |now )?(?:write|draft|compose|create|generate|make|design|come up with|translate|convert|format|reformat|summari[sz]e|rewrite|proofread|tighten|shorten|calculate|compute)\b/i;
const CREATION = /\b(?:write|draft|compose|create|generate|make|invent|come up with|design|name)\b[^.?!]{0,60}\b(?:story|essay|e-?mail|post|article|letter|message|script|poem|speech|pitch|proposal|outline|plan|bio|resume|cv|cover letter|slides?|report|memo|ideas?|names?|titles?|lyrics|song|code|function|app|program)\b/i;

/** What they want done this turn, read deterministically — Core 4's `work`, without the model call. */
export function readWork(text: string, signals: ExplicitSignals, intent: Intent, checkedWork: boolean): WorkKind {
  const said = text.trim();
  if (!said) return 'conversation';
  if (signals.vent) return 'reflection';
  // "how are you?", "thanks!", "what's up?", "what's your favourite book?" —
  // before any reader below takes a how-question for a request to explain, or
  // "what's…" for a fact to look up.
  if (smallTalk(said) || onlyAboutSocria(said)) return 'conversation';
  // The readers below look at how a request begins; a greeting in front of it
  // ("good morning! what is the capital of Peru?") is not where it begins — and nor is a polite lead-in
  // ("tell me about the water cycle", "can you tell me how to change a tyre?"), which was read as idle
  // reflection and got nothing (lib/runtime/asks.ts requestBody).
  const t0 = withoutGreeting(said);
  const t = requestBody(t0);
  const asked = t !== t0;
  // a claim put up to be checked is a question with an answer — the verdict — not their work to correct
  if (!checkedWork && (claimCheck(t0) || claimCheck(t))) return 'information';
  // a quick plot of one function (lib/runtime/plot-ask.ts) is something to do, drawn in the reply
  if (quickPlot(t0) || quickPlot(t)) return 'execution';
  if (checkedWork || offersWork(t)) return 'verification';
  // a feeling said in so many words: the readers that would make the turn a task stand down below
  const felt = saysFeeling(t0);
  if (LEADS_WITH_DOING.test(t)) return CREATION.test(t) ? 'creation' : 'execution';
  if (DIAGNOSIS.test(t)) return 'diagnosis';
  if (intent === 'visual' || intent === 'structure') return 'execution';
  if (signals.practiceIntent || (problemIn(t) && signals.learningGoal !== false)) return 'practice';
  if (asksForDecision(t, signals)) return 'judgment';
  if (RESEARCH.test(t)) return 'research';
  // a procedure asked how to do — "how do you make pancakes?", "how does one apply for a mortgage?" — has
  // steps, not one idea to understand: the single-idea shape forbade the list the answer is
  if (!felt && adviceAsk(t) && ['procedure', 'setup'].includes(adviceKind(t))) return 'information';
  if (wantsExplanation(t, signals)) return 'explanation';
  if (isFactQuestion(t) || /^(?:what|which|who|whom|whose|when|where)\b[^?]{0,160}\?\s*$/i.test(t)) return 'information';
  // ASKED, THOUGH NOT IN THE WORDS OF A QUESTION (November 2026, lib/runtime/asks.ts). "TCP vs UDP" was
  // too short to be anything but talk; "Postgres or MongoDB for a chat app?", "causes of inflation",
  // "list the main causes of the First World War", "how do I hire my first engineer?" and "tips for
  // sleeping better" were read as idle reflection — so nothing was shaped, and the reply wrote its habit.
  // Each asks for something with an answer: a comparison, a topic, a list, practical advice. Before
  // writing and doing: "how do I write a cover letter?" asks how, not for the letter.
  // Not when they said how they feel: "give me some advice, my wife left me" is the person, not a list.
  if (!felt && (comparisonAsk(t) || topicAsk(t) || LIST_LEAD.test(t) || adviceAsk(t) || BASE_RATE.test(t))) return 'information';
  if (CREATION.test(t)) return 'creation';
  if (EXECUTION.test(t)) return 'execution';
  // A QUESTION THAT IS NOTHING ELSE IS STILL A QUESTION: "is nuclear power good or bad?", "does sugar
  // make kids hyperactive?". Not one put to Socria ("do you like jazz?"), not a feeling, not a request
  // for help ("can you help me with…"), and not their own decision ("should I…" is judged above).
  if (plainQuestion(t)) return 'information';
  // "tell me about photosynthesis", "teach me calculus": asked to be told, by the lead-in — an explanation
  if (asked && !felt) return 'explanation';
  if (t.length < 25 && !t.includes('?')) return 'conversation';
  return 'reflection';
}

const ASKS = /^(?:how|why|is|are|was|were|does|do|did|can|could|would|will|has|have|isn'?t|aren'?t|doesn'?t|don'?t)\b/i;
const TO_SOCRIA = /^(?:(?:do|did|are|were|can|could|would|will|have|has|is)\s+(?:you|u)\b|how\s+(?:are|do|did|have|would|can|could|will)\s+(?:you|u)\b|(?:can|could|would|will)\s+you\s+help\b)/i;
/**
 * …and not a question about the person, someone in their life, or the
 * conversation: "can I vent for a sec?", "was it my fault?", "does he still
 * love me?", "is it normal to cry after a breakup?", "does anyone else feel
 * this way?", "will it ever get better?". Read as information, each was
 * answered like a lookup (adversarial review, November 2026).
 */
// …but "do I need a visa for Mexico?", "can I freeze cooked rice?", "is this mushroom safe to eat?" and "do they
// still sell the iPhone 12?" are questions of fact, and stay ones.
const PERSONAL_Q =
  /^(?:can|could|may)\s+i\s+(?:vent|tell|talk|ask\s+you|say|be\s+honest|share|rant|cry|just|have\s+a\s+(?:hug|minute|moment))\b|^(?:is|was|does|did|do|could|will|would|have|has|am|are|should)\s+(?:i|he|she|my|we|anyone|everyone|everybody|somebody|someone|life)\b(?!\s+(?:need|have\s+to|qualify|owe|pay|get\s+(?:a|an|the)|still\s+need)\b)|\bis\s+it\s+(?:normal|ok|okay|alright|bad|wrong|weird|selfish|crazy|stupid|fine|silly|too\s+late)\b|^isn'?t\s+it\b|\banyone\s+else\b|^(?:is|was|will|would)\s+it\s+(?:ever|always|my|me)\b|\b(?:my|our)\s+fault\b|\b(?:would|will|is)\s+it\s+be\s+(?:ok|okay|alright|fine|weird|bad|rude|wrong)\b|\bif\s+i\s+(?:just\s+)?(?:talk|talked|vent|vented|rant|ranted|cry|cried)\b/i;
function plainQuestion(t: string): boolean {
  if (!/\?\s*$/.test(t) || t.split(/\s+/).length < 4 || t.length > 300) return false;
  if (!ASKS.test(t) || TO_SOCRIA.test(t) || PERSONAL_Q.test(t) || saysFeeling(t) || PERSONAL_HOW.test(t)) return false;
  // a decision of theirs that the reader above did not take ("should I be worried?") stays where it was
  return !/\bshould\s+(?:i|we)\b/i.test(t);
}

export interface StateInput {
  text: string;
  /** the conversation before this turn, oldest first */
  history: readonly { role: 'user' | 'assistant'; content: string }[];
  signals: ExplicitSignals;
  intent: Intent;
  map?: MapDigest | null;
  /** what the map reads them as building, in a line */
  building?: string | null;
  workspace?: { docs?: number; artifacts?: number; nodes?: number; writing?: boolean; selection?: string | null };
  guard?: boolean;
  /** the Conversation Style they chose, by id */
  style?: string | null;
  resumedAfterMs?: number | null;
  /** their claims this turn, as the math engine decided them */
  checked?: readonly { status: string }[];
}

export interface TurnState {
  /** what the line of thinking is for, in a line */
  objective: string;
  intent: Intent;
  domain: Domain;
  work: WorkKind;
  /**
   * What kind of exchange this turn is — small talk, joking, something
   * personal, a brainstorm, a discussion, pushback, plain conversation, or a
   * task (lib/cognition/register.ts). Read from their words this turn; a
   * feeling counts only when they said it, and nothing here is kept.
   */
  exchange: Exchange;
  workspace: { docs: number; artifacts: number; nodes: number; writing: boolean; selection: string | null };
  /** what this turn showed — counts, never a label */
  understanding: { right: number; wrong: number; saidStuck: boolean };
  /** questions the map holds open */
  open: string[];
  /** assumptions the map holds unexamined */
  assumptions: string[];
  /** how they asked to be helped, in their words */
  preferences: {
    questions: 'none' | 'fewer' | 'normal' | 'more';
    answerFirst: boolean;
    guard: boolean;
    learning: boolean | null;
    expertise: 'novice' | 'expert' | null;
    style: string | null;
  };
  progress: { turns: number; resumedAfterMs: number | null };
  /** a sensitive subject this turn: no search, no inference about them */
  sensitive: boolean;
}

const line = (t: string, n: number) => t.replace(/\s+/g, ' ').trim().slice(0, n);

export function readTurnState(i: StateInput): TurnState {
  const userTexts = [...i.history.filter((m) => m.role === 'user').map((m) => m.content), i.text];
  const first = userTexts.find((t) => t.trim().length > 12) ?? userTexts[0] ?? '';
  const checked = i.checked ?? [];
  const s = i.signals;
  const work = readWork(i.text, s, i.intent, checked.length > 0);
  // Work in the message, by the readers above: something to answer, explain,
  // check, make, fix or decide, or something to show. Talk is the rest.
  const task = (work !== 'conversation' && work !== 'reflection') || i.intent !== 'conversation';
  return {
    objective: line(i.building || first, 140),
    intent: i.intent,
    domain: readDomain(userTexts, i.map?.context ?? null),
    work,
    exchange: readExchange({
      text: i.text,
      history: i.history,
      task,
      work,
      signals: s,
      mapContext: i.map?.context ?? null,
      claim: work === 'information' && claimCheck(i.text),
      // two named options, compared: a question with an answer, not an opinion asked for (lib/runtime/asks.ts)
      compare: (work === 'information' || work === 'explanation') && comparisonAsk(requestBody(withoutGreeting(i.text.trim()))),
    }),
    workspace: {
      docs: i.workspace?.docs ?? 0,
      artifacts: i.workspace?.artifacts ?? 0,
      nodes: i.workspace?.nodes ?? 0,
      writing: !!i.workspace?.writing,
      selection: i.workspace?.selection ?? null,
    },
    understanding: {
      right: checked.filter((c) => c.status === 'verified').length,
      wrong: checked.filter((c) => c.status === 'refuted').length,
      saidStuck: !!s.dontKnow,
    },
    open: (i.map?.open ?? []).slice(0, 4),
    assumptions: (i.map?.assumptions ?? []).slice(0, 4),
    preferences: {
      questions: s.stopQuestions ? 'none' : s.wantsQuestions ? 'more' : s.redundancy || s.frustration ? 'fewer' : 'normal',
      answerFirst: s.directness === 'answer' || s.answersOnly,
      guard: !!i.guard,
      learning: s.learningGoal,
      expertise: s.expertise,
      style: i.style ?? null,
    },
    progress: { turns: userTexts.length, resumedAfterMs: i.resumedAfterMs ?? null },
    sensitive: !!s.sensitive,
  };
}
