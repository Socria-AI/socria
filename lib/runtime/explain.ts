// lib/runtime/explain.ts — THE ADAPTIVE EXPLANATION ENGINE (Logos 5.5, II).
//
// Not only what to explain, but how to make it understood — chosen from
// evidence of understanding, not guessed from wording. One pass of pure code
// before the one model call; nothing here calls a model or the network.
//
//   evidence      what the turn shows, strongest first: the maths engine's verdict
//                 on their working, what they did with the last reply's checks, an
//                 answer to the question Socria last asked, a belief they state,
//                 being lost (weak as self-report, strong as a sign the approach
//                 failed), what they say about themselves, the ledger. Socria's own
//                 scaffolding (Logos 4's move, MR's "more support") is a SUPPORT
//                 level, never evidence of a mistake.
//   the ladder    the first rung that applies wins:
//                   1 restraint   a hello, a fact, "just tell me", a hurry, "solve it
//                                 for me", a thing to make, an expert's one-liner:
//                                 nothing added
//                   2 feedback    they tried something: confirm it, or point to the
//                                 first wrong step — never redo it for them
//                   3 refute      a belief that does not survive: the verdict first
//                   4 reframe     lost after an explanation: a way in not yet tried
//                   5 diagnose    lost twice running: one question that finds where
//                   6 explain     a first explanation, by the kind of the last
//                                 question sentence
//                   7 practice    practice, review, a quiz
//                 then at most one closing move (a try like it, a prediction, a
//                 recall of what is due, a say-it-back) — never two turns running
//                 while one is unanswered
//   the lines     one short block, filled with this turn's facts (the belief in
//                 their words, what was tried, the terms, what is due), said once,
//                 under one length budget, and never against the shape the
//                 presentation planner chose
//   continuity    a thread note on each reply (the moves it made, the question it
//                 left, the concept) and a ledger in their browser keyed by concept,
//                 credited only from checks they answered
//
// The twenty strategies of the first engine are kept as the trace's vocabulary,
// with three moves the ladder needed (transfer, predict, diagnose). Invisible: no
// mode, no badge, no setting. LOGOS_EXPLAIN=off takes it out without a deploy.

import type { ExplicitSignals } from '../core4/types';
import { SHOWN_INLINE, type InlineKind } from '../inline-ui';
import type { Presentation } from './presentation';
import type { TurnState } from './state';

export const STRATEGIES = [
  'insight', // 1 Essential Insight — the one idea that makes the rest make sense, first
  'analogy', // 2 Analogy — a familiar system with the same structure, and where it breaks
  'compare', // 3 Comparative Explanation — side by side on the features that differ (or a near case where it fails)
  'worked', // 4 Worked Examples — one complete example (or one concrete instance), every step with its reason
  'faded', // 5 Faded Guidance — the method named, the steps theirs to take
  'segmented', // 6 Segmented Explanation — the first part now, the rest offered
  'pretrain', // 7 Concept Pretraining — the terms (or the idea it rests on) before the mechanism
  'visual', // 8 Visual-Verbal Explanation — a picture, and words that point into it
  'conceptmap', // 9 Concept Mapping — how the ideas relate, laid out as parts
  'causal', // 10 Causal Explanation — the chain (or the interacting causes)
  'misconception', // 11 Misconception Correction — the verdict, why it tempts, why it fails, the model that replaces it
  'error', // 12 Error-Based Explanation — their slip located, why it seemed right, the rule that fixes it
  'elaborate', // 13 Elaborative Interrogation — "why does that hold?", once, about what they can reason out
  'selfexplain', // 14 Self-Explanation — they say why a step works, in their words
  'retrieval', // 15 Retrieval Practice — recall of what was met before
  'spaced', // 16 Spaced Reinforcement — what is due comes back, once, briefly
  'interleave', // 17 Interleaved Explanation — practice that mixes kinds, choosing the method first
  'teachback', // 18 Teach-Back — they explain it back in a sentence or two
  'argument', // 19 Argument Mapping — the claim, its reasons, the objections, what it rests on
  'tradeoffs', // 20 Decision Tradeoffs — the options on the criteria that matter, the call theirs
  'transfer', // 21 Near Transfer — one problem like it, different on the surface, for them to try
  'predict', // 22 Prediction — they commit to what will happen before it is shown
  'diagnose', // 23 Diagnosis — lost twice: one question with two named places it may break
] as const;
export type Strategy = (typeof STRATEGIES)[number];

/** The moves that put a question to them: at most one a turn, and only within the turn's question budget. */
export const ASKING: ReadonlySet<Strategy> = new Set(['elaborate', 'selfexplain', 'retrieval', 'spaced', 'teachback', 'interleave', 'transfer', 'predict', 'diagnose']);

/** What the turn needs most — the rung of the ladder that applied. */
export const NEEDS = ['direct', 'feedback', 'refute', 'reframe', 'diagnose', 'explain', 'practice'] as const;
export type ExplainNeed = (typeof NEEDS)[number];

/** The question a reply left them, as its thread note keeps it. */
export const PENDING = ['recall', 'teachback', 'why', 'try', 'predict', 'diagnose'] as const;
export type Pending = (typeof PENDING)[number];

/** A way in to an idea: what a reframe rotates through. */
export const APPROACHES = ['example', 'picture', 'analogy', 'contrast', 'stepback'] as const;
export type Approach = (typeof APPROACHES)[number];

export type Level = 'novice' | 'intermediate' | 'expert';

/** What the learning ledger holds about one concept (kept in their browser; nothing here is stored on the server). */
export interface LedgerEntry {
  /** the concept, in a few words */
  topic: string;
  /** times it came up */
  seen: number;
  /** checks on it answered right, and not right */
  right: number;
  wrong: number;
  /** when it was last practised — answered, recalled or reviewed (ms). The review clock runs from here. */
  last: number;
  /** when it last came up at all (ms); a mention never resets the review clock */
  met?: number;
  /** Leitner box: 0 new or slipped, up to 4 */
  box: number;
  /** how much of a worked example they now take themselves: 0 all of it shown … 3 a problem of their own */
  fade?: number;
  /** ways in that left them lost on this concept, most recent first */
  failed?: Approach[];
}

/** What Socria's reply did, saved on the reply as the client received it: enum codes and the concept, nothing else. */
export interface ThreadNote {
  /** the moves it made */
  s: Strategy[];
  /** the rung it was on */
  n: ExplainNeed;
  /** the question it left them, if it asked one */
  q?: Pending;
  /** the concept, in a few words */
  c?: string;
}

export interface ExplainInput {
  /** their newest message */
  text: string;
  history: readonly { role: 'user' | 'assistant'; content: string }[];
  signals: ExplicitSignals;
  state: TurnState;
  /** the presentation already planned for the turn */
  presentation: Presentation;
  /** questions the reply may ask this turn, after the engine and MR decided */
  questions: number;
  guard: boolean;
  /** working it out is theirs (Core 4's split: human or scaffold) */
  ownReasoning?: boolean;
  /** the decision is theirs (Core 4's split) */
  ownJudgment?: boolean;
  /** what Logos 4's move (and MR) already ask for: retrieval on return, a why after a right step, a scaffold — read as support, never as a mistake */
  assist?: { retrieval?: boolean; selfExplain?: boolean; scaffold?: 'none' | 'hint' | 'steps' };
  /** what they did with checks in the last reply: answers right and not right */
  did?: { right: number; wrong: number };
  /** the learning ledger from their browser, sanitised (empty when the privacy gate is closed) */
  ledger?: readonly LedgerEntry[] | null;
  /** the notes saved on Socria's earlier replies, oldest first, sanitised (the newest is the last reply's) */
  thread?: readonly ThreadNote[] | null;
  /** their chosen reply length */
  length?: 'concise' | 'standard' | 'detailed' | null;
  now: number;
}

export interface ExplainPlan {
  /** the rung of the ladder that applied */
  need: ExplainNeed;
  /** the moves, primary first; at most three */
  strategies: Strategy[];
  level: Level;
  /** 1 a sentence answers it, 2 it has parts, 3 a mechanism with several parts or new terms */
  complexity: 1 | 2 | 3;
  /** what kind of question it is (the last question sentence) */
  ask: AskKind;
  /** the concept, in a few words — what the ledger keys on (their own words, or the thread's concept carried forward) */
  topic: string | null;
  /** a direct answer is better: nothing forced, nothing added */
  direct: boolean;
  /** the inline elements the moves call for, merged into the presentation where the planner's rules allow */
  forms: InlineKind[];
  /** the one question the reply ends on, if any */
  question: Strategy | null;
  /** the concepts due for review that this turn brings back */
  due: string[];
  /** the turn is learning: the client notes the concept in the ledger */
  learning: boolean;
  /** this turn's facts the lines are filled with — clipped, never more than a few words each */
  fill: {
    /** the belief they stated, in their words (≤12 words) */
    belief?: string;
    /** what the last reply tried, said plainly */
    tried?: string;
    /** …as a code, for the ledger: the way in that left them lost on this concept */
    lostAfter?: Approach;
    /** the way in this reframe takes */
    approach?: Approach;
    /** terms a newcomer may not know (≤3) */
    terms?: string[];
    /** how the support is set: more steps (Socria's scaffold, MR's "more support") or fewer */
    support?: 'more' | 'normal';
    /** the answer they gave was to this question kind */
    answered?: Pending;
    /** close with the reusable rule and one case beyond this one */
    transfer?: boolean;
    /** the causes interact rather than run in one chain (history, society, health) */
    manyCauses?: boolean;
    /** the procedure is theirs: method and the next step only */
    theirs?: boolean;
    /** what was asked is a procedure (a reframe of one rotates through procedural ways in) */
    procedure?: boolean;
  };
  /** where the topic came from: their own words, the concept carried forward from the thread, or none */
  topicFrom: 'own' | 'carried' | null;
  /** content-free reasons */
  reasons: string[];
}

export type AskKind = 'why' | 'how' | 'what' | 'compare' | 'decide' | 'claim' | 'solve' | 'procedure' | 'relate' | 'practice' | 'other';

// ── reading the turn ──────────────────────────────────────────────────

// clipped before any pattern runs: a very long message is read by its first and last parts, never by every regex over
// twelve thousand characters (several patterns backtrack on long runs)
const clip = (t: string) => (t.length > 1600 ? `${t.slice(0, 800)} … ${t.slice(-800)}` : t);
const lc = (t: string) => clip(t).replace(/```[\s\S]*?```/g, ' ').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const LEAD = /^(?:(?:so|ok(?:ay)?|hey|hi|hello|please|honestly|um+|uh+|hmm+|well|right|alright|cool|thanks|thank\s+you|great|nice|quick\s+question|question|another\s+question|follow[- ]up|wait|sorry|also|and|but|real\s+quick|really\s+quick|just\s+a\s+quick\s+one|quick\s+one|one\s+more\s+thing|technically|basically|actually|literally|seriously|genuinely|essentially|like)[,:.!]?\s+)+/;
/** A reaction that opens a message before its question: "ok that makes sense, so why…", "got it. so what's…". */
const REACTION_LEAD = /^(?:(?:ok(?:ay)?|alright|right|cool|nice|great|thanks|ah+|oh+|ohh+)[,.!]?\s+)?(?:that\s+(?:makes\s+(?:more\s+)?sense|helps|clicks)|(?:i\s+)?(?:get|got)\s+it(?:\s+now)?|makes\s+(?:more\s+)?sense(?:\s+(?:now|so\s+far))?|i\s+see|understood|fair\s+enough|perfect)[,.!]*\s+(?:(?:so|but|and|then)[,]?\s+)?/;
/** Asking leads that carry no content: "can you help me understand", "i want to know", "teach me". */
const ASKING_LEAD = /^(?:(?:can|could|would|will)\s+(?:you|someone|somebody|anyone|anybody)\s+(?:please\s+)?|please\s+)?(?:(?:help\s+me\s+(?:to\s+)?)?(?:understand|get|grasp|see)|explain(?:\s+to\s+me)?|tell\s+me(?:\s+about)?|teach\s+me(?:\s+about)?|walk\s+me\s+through|show\s+me|remind\s+me|i\s+(?:want|need|would\s+like|'d\s+like)\s+to\s+(?:know|understand|learn|see)|i'?m\s+(?:trying\s+to\s+understand|wondering|curious(?:\s+about)?)|i\s+(?:don'?t|dont|do\s+not)\s+(?:get|understand|see))\s+/;
const BARE_NOUN_ASK = /^(?:(?:can|could|would|will)\s+(?:you|someone|somebody|anyone|anybody)\s+(?:please\s+)?|please\s+)?(?:(?:help\s+me\s+(?:to\s+)?)?(?:understand|grasp)|explain(?:\s+to\s+me)?|tell\s+me\s+about|teach\s+me(?:\s+about)?|i\s+(?:want|need)\s+to\s+(?:understand|learn(?:\s+about)?))\s+(?!how\b|why\b|what\b|when\b|where\b|which\b|who\b|if\b|whether\b)/;

const WHY = /\bwhy\s+(?:is|are|was|were|does|do|did|would|could|can|can'?t|isn'?t|aren'?t|doesn'?t|don'?t|didn'?t|won'?t|should|must|has|have|the|a|an|this|that|it|they|we|people|some|so)\b|\b(?:intuition|explanation|reason)\s+for\s+why\b|\b(?:happen(?:ed)?|start(?:ed)?|begin|began|collapse[sd]?|fail(?:ed)?)\s+(?:basically\s+|just\s+|only\s+)?because\b|\bwhere\s+does\s+.{2,60}\s+come\s+from\b|^(?:why\b|what\s+(?:causes|caused|leads?\s+to|drives?)\b|what\s+(?:makes|made)\s+(?!(?:a|an|the)\s+(?:good|great|strong|bad|weak|effective|successful)\b)|how\s+come\b)|\bwhat\s+(?:causes|caused|leads?\s+to|drives?)\b|\b(?:the\s+)?(?:cause|causes|reason)\s+(?:of|for|behind)\b|\beffects?\s+of\b/;
const HOW_WORKS = /^how\s+(?:does|do|did|is|are|can|could)\s+(?!(?:i|we|you|u)\b)(?:the\s+|a\s+|an\s+)?[a-z][\w-]*(?:\s+[a-z][\w-]*){0,3}\s+[a-z]{3,}|\bhow\s+(?:does|do|did|is|are|can)\s+.{2,80}?\b(?:work|works|happen|happens|form|forms|function|functions|spread|grow|move|run|operate)\b|^how\s+.{2,40}\s+works?\b|\bhow\s+.{2,40}\s+works?\b|\bwhat\s+happens\s+(?:when|if|in|during|to)\b|\bexplain\s+(?:how|the\s+process)\b|\bthe\s+process\s+of\b/;
const WHAT_IS = /^(?:what(?:'s|s|\s+is|\s+are|\s+was|\s+were)\s+(?:a|an|the)?\s*\w|what\s+(?:a|an|the)\s+[\w-]+(?:\s+[\w-]+){0,4}\s+(?:is|are|means?|does)\b|what\s+(?:[\w-]+\s+){1,4}(?:measures?|means?|stands\s+for|is\s+for|represents?)\b|what\s+does\s+.+\s+mean|what\s+makes\s+(?:a|an|the)\s+(?:good|great|strong|bad|weak|effective|successful)\b|define\b|meaning\s+of\b|explain\s+(?!how|why)\w)/;
const COMPARE = /\b(?:difference|differences|differ|different)\s+(?:between|from)\b|\bvs\.?\b|\bversus\b|\bcompared?\s+(?:to|with)\b|\bcompare\b|\bsame\s+(?:thing\s+)?as\b|\bmix(?:ing|ed)?\s+(?:\w+\s+){0,4}?up\b|\bconfuse\b.*\band\b|\bhow\s+(?:are|is|do|does)\s+(?:they|these|those|the\s+two|[\w-]+(?:\s+[\w-]+){0,3})\s+(?:different|differ)\b|\b(?:different|differs?)\s+(?:from|than|to)\b|\bwhat'?s\s+the\s+difference\b/;
const DECIDE = /\b(?:should\s+i|should\s+we|which\s+(?:one\s+)?should|help\s+me\s+(?:decide|choose|pick)|is\s+it\s+worth|better\s+(?:option|choice)|trade-?offs?|worth\s+it|trying\s+to\s+(?:decide|choose|pick)|deciding\s+(?:between|whether)|which\s+(?:one\s+)?(?:to|would\s+you|is\s+better)|can'?t\s+decide)\b|\b(?:next\s+step|best\s+move|better\s+move|first\s+move)\b[^?]{0,120}?\bor\b[^?]{0,120}?\?|^[\w-]+(?:\s+[\w-]+){0,3}\s+or\s+[\w-]+(?:\s+[\w-]+){0,3}\s*\?+/;
const CLAIM = /^(?:is\s+it\s+(?:true|right|correct)\s+that|is\s+(?:this|that)\s+(?:true|right|correct|a\s+good\s+argument)|does\s+(?:this|my)\s+argument|(?:my|the)\s+(?:argument|thesis|claim)\b)|\b(?:argue|argument\s+(?:for|against)|counter-?argument|debate|is\s+(?:the|this)\s+claim)\b|,\s*right\s*\?\s*$|\b(?:is|are)\s+there\s+(?:any\s+|actually\s+|really\s+)?(?:solid\s+|good\s+|real\s+|strong\s+|much\s+)?(?:evidence|proof|research|science)\b|\bdoes\s+(?:the\s+)?(?:research|science|evidence|data|literature)\s+(?:actually\s+|really\s+)?(?:back|support|show|say)\b|\bis\s+(?:this|that|it)\s+(?:actually\s+|really\s+)?(?:true|legit|a\s+myth)\b|\bmyth\s+or\b|\bdebunk|\bhype\s+or\b/;
const SOLVE = /\b(?:solve|calculate|compute|work\s+out|find\s+(?:the|x|y)|simplify|differentiate|integrate|derive|factori[sz]e|expand|evaluate|prove|show\s+that)\b|[=]\s*-?\d|\d\s*[x×*+^/-]\s*\d|\bx\s*[+\-=^]/;
const PROCEDURE = /^(?:how\s+(?:do|can|would|should|could)\s+(?:i|we|you)\b|walk\s+me\s+through|show\s+me\s+how|what\s+are\s+the\s+steps|what'?s\s+the\s+(?:procedure|process|method|formula|way|best\s+way)\s+(?:for|to|of)\b)|\bwhat\s+(?:do\s+i\s+do|should\s+i\s+do|comes|happens|do\s+we\s+do)\s+(?:next|after|now|then)\b|\bthen\s+what\b|\bwhat'?s\s+(?:the\s+)?next\s+step\b|\bwhat\s+comes\s+after\b|\bwhere\s+do\s+i\s+go\s+from\s+here\b/;
const RELATE = /\bhow\s+(?:do|does|are)\s+.{2,80}?\b(?:relate|connect|fit\s+together|link|interact)\b|\b(?:relationship|connection)s?\s+between\b|\bbig\s+picture\b|\boverview\s+of\b|\bmap\s+(?:out|of)\b/;
const PRACTICE = /\b(?:quiz\s+me|test\s+me|practi[cs]e|give\s+me\s+(?:a|some|another|more|one\s+more|a\s+few)\s+(?:(?:practice|harder|easier|similar)\s+)?(?:problem|question|example|exercise)s?|give\s+me\s+(?:another|one\s+more)(?:\s+one)?|(?:another|one\s+more)\s+(?:problem|question|one\s+like\s+(?:that|it)|one)|let\s+me\s+try|can\s+i\s+try\s+(?:a|another|one)|(?:a\s+)?harder\s+one|more\s+problems|drill(?:\s+me)?|flashcards?|mix\s+it\s+up|questions?\s+(?:from|on|about)\s+(?:all|everything|a\s+bit\s+of\s+everything)|(?:a\s+)?(?:random\s+)?mix\s+of)\b/;
const REVIEW = /\b(?:revision\s+session|revise\s+with\s+me|what(?:ever)?\s+i'?m\s+weak(?:est)?\s+(?:on|at|in)|my\s+weak(?:est)?\s+(?:spots?|areas?|topics?|points?)|what\s+should\s+i\s+(?:review|revise|study|go\s+over)|what\s+do\s+i\s+need\s+to\s+(?:review|revise|study|go\s+over)|help\s+me\s+(?:review|revise)|revise\s+for|review\s+for|go\s+over\s+(?:again\s+)?before)\b/;
/** Studying, said: a fact asked for a class is learned, not looked up. */
const LEARN_CONTEXT = /\b(?:homework|coursework|revising|revision|studying|study(?:ing)?\s+for|for\s+(?:my|a|the|our)\s+(?:\w+\s+)?(?:class|course|exam|test|mock|final|midterm|module|essay|assignment|quiz|lecture|seminar)|this\s+(?:term|semester)|in\s+(?:class|school|lecture|uni)|we'?re\s+(?:doing|learning|covering|studying)|my\s+(?:\w+\s+)?(?:exam|mock|test|final|midterm)\b|keep\s+(?:mixing|forgetting|getting))\b/;

/** They say they are new to it — about themselves, or by asking to be treated so ("explain like I'm five"). */
const NOVICE_SAID = /\b(?:eli5|like\s+(?:i'?m|im|i\s+am)\s+(?:5|five|a\s+(?:kid|child|5\s+year\s+old))|explain\s+(?:it\s+)?like\s+(?:i'?m|i\s+am)\s+(?:5|five|a\s+(?:kid|child))|in\s+(?:really\s+|very\s+)?simple\s+terms|plain\s+english|for\s+dummies|from\s+scratch|i'?m\s+(?:totally\s+|completely\s+|very\s+)?(?:new\s+to|a\s+(?:total\s+|complete\s+)?beginner|a\s+novice|not\s+(?:a\s+)?(?:maths?|math|science|numbers)\s+person)|i\s+am\s+(?:new\s+to|a\s+beginner)|(?:total|complete)\s+beginner|never\s+(?:learned|learnt|studied|done|taken)\b|no\s+idea\s+(?:what|how)|just\s+started\s+(?:learning|studying|taking))\b/;
/** They say they know the field — about themselves, never a word like "technically" or "formally". */
const EXPERT_ROLE = String.raw`(?:(?:senior|staff|principal|professional|practising|practicing|working|research|qualified|consultant|clinical|structural|civil|mechanical|electrical|software|data|chartered|registered)\s+)*(?:engineer|developer|programmer|scientist|doctor|physician|surgeon|clinician|nurse|pharmacist|physicist|mathematician|statistician|biostatistician|economist|chemist|biologist|researcher|professor|lecturer|phd|postdoc|accountant|lawyer|attorney|actuary|epidemiologist|cardiologist|neurologist|oncologist|radiologist|immunologist|pathologist|psychologist|psychiatrist|paediatrician|pediatrician|geologist|sociologist|toxicologist|pharmacologist|anaesthetist|anesthesiologist|dietitian|specialist|consultant|architect|analyst|teacher\s+of\s+\w+|(?:maths?|physics|chemistry|biology|stats|statistics|history|economics|english)\s+teacher)`;
const EXPERT_SAID = new RegExp(
  String.raw`\b(?:i'?m|i\s+am)\s+(?:a|an)\s+(?:\w+\s+)?` + EXPERT_ROLE + String.raw`\b(?!\s+student)|\bas\s+(?:a|an)\s+(?:\w+\s+)?` + EXPERT_ROLE + String.raw`\b(?!\s+student)|\b(?:[\w-]+\s+){0,3}(?:specialist|consultant|surgeon|engineer|physicist|economist|statistician|nurse|doctor)\s+here\b|\bi\s+(?:teach|lecture\s+in|lecture)\s+(?:intro(?:ductory)?\s+|undergrad(?:uate)?\s+|graduate\s+|high\s+school\s+|a\s+)?(?:maths?|math|stats|statistics|physics|chemistry|biology|economics|computer\s+science|cs|history|law|medicine|engineering|philosophy|psychology)\b|\bi\s+(?:have\s+a\s+phd\s+in|prescribe|practise\s+(?:medicine|law)|practice\s+(?:medicine|law))\b`
);

/**
 * Being lost after an explanation. Weak as a report of what they know, strong as a sign the approach did not land.
 * The bare forms ("huh?", "what?") are read on the message as typed: "so what?" is not being lost.
 */
const CONFUSED =
  /\bstill\s+(?:don'?t|dont|do\s+not|confused|lost|not\s+(?:getting|following|sure\s+(?:i\s+get|why|how)))\b|\b(?:i'?m|i\s+am)\s+(?:so\s+|still\s+|a\s+bit\s+|a\s+little\s+|kind\s+of\s+|kinda\s+|really\s+|totally\s+|completely\s+)?(?:confused|lost)\b|\bdoesn'?t\s+make\s+(?:any\s+)?sense\b|\bmakes\s+no\s+sense\b|\bi\s+(?:still\s+)?(?:don'?t|dont|do\s+not)\s+(?:get|understand|see|follow)\b|\bnot\s+following\b|\b(?:you\s+)?lost\s+me\b|\bover\s+my\s+head\b|\b(?:i'?m|im|i\s+am|still|so|really)\s+confused\b|\b(?:this|that|it)(?:'s|\s+is)\s+(?:so\s+|really\s+)?confusing\b|\b(?:explain|say|put|show|describe)\s+(?:it|that|this)?\s*(?:in\s+)?(?:another|a\s+different|some\s+other|an\s+easier|a\s+simpler)\s+way\b|\b(?:explain|say|put)\s+(?:it|that|this)\s+differently\b|\b(?:another|a\s+different)\s+way\s+(?:of\s+explaining|to\s+(?:explain|think\s+about|see|look\s+at))\b|\bcan\s+you\s+(?:simplify|break)\s+(?:it|that|this)(?:\s+down)?\b|\b(?:idk|i\s+(?:don'?t|dont|do\s+not)\s+know)\s+what\s+(?:you\s+mean|that\s+means|you'?re\s+(?:saying|asking))\b|\bwhat\s+do\s+you\s+mean\b|\b(?:that|this|it|the\s+\w+)\s+(?:didn'?t|did\s+not|doesn'?t|does\s+not)\s+(?:really\s+)?help\b|\bnone\s+of\s+(?:this|that|it)\s+(?:is\s+)?(?:clicking|making\s+sense)\b/;
const BARE_LOST = /^(?:huh|what|wait,?\s*what|sorry,?\s*what|eh|um+\s*what|\?+|i'?m\s+lost|lost|confused)\s*[?!.]*$/;
const GOT_IT = /\b(?:(?:oh,?\s+|ah+,?\s+|ohh+,?\s+)?(?:i\s+(?:get|got)\s+it(?:\s+now)?|that\s+(?:makes\s+(?:more\s+)?sense|clicks|helps|clears\s+it\s+up)|makes\s+(?:more\s+)?sense(?:\s+now)?|i\s+see\s+now|ah+,?\s+i\s+see|now\s+i\s+(?:get|understand|see)|got\s+it|understood|that\s+clicked))\b/;
const SIMPLER = /\b(?:too\s+(?:long|much|complicated|complex|technical)|simpler|shorter|tl;?dr|in\s+(?:one|a)\s+(?:sentence|line)|keep\s+it\s+short)\b/;
/** A belief they hold, said as one — never "so basically…", which is a summary of what Socria said. */
const BELIEF = /\b(?:i\s+(?:always\s+)?(?:thought|believed|heard|read|assumed)|i\s+(?:was\s+)?(?:told|taught)|my\s+(?:[\w-]+\s+)?(?:teacher|lecturer|professor|tutor|friend|dad|mum|mom|boss|parents?|doctor|coach)\s+(?:said|says|told\s+me|taught\s+me)|isn'?t\s+it\s+(?:true\s+)?that|doesn'?t\s+(?:that|it)\s+mean|everyone\s+(?:knows|says)|people\s+say)\b|,\s*right\s*\?\s*$|\bisn'?t\s+it\s*\?\s*$/;
const JUST_ANSWER = /\b(?:just\s+(?:tell|give)\s+me|quick(?:ly)?\s+answer|no\s+(?:need\s+to\s+)?explain(?:ation)?|no\s+explanation|skip\s+the\s+(?:explanation|lecture)|tl;?dr|only\s+the\s+(?:final\s+)?answer|answer\s+only|final\s+answer\s+only|just\s+the\s+(?:formula|answer|number|result|date|year))\b/;
/** A feeling, said: someone to hear, not something to explain — even about an exam. */
const FEELING = /\bi\s+(?:just\s+|really\s+|kind\s+of\s+|kinda\s+)?(?:feel|felt)\s+(?:so\s+|really\s+|totally\s+|a\s+bit\s+)?(?:stupid|dumb|down|sad|awful|terrible|useless|anxious|overwhelmed|hopeless|lost\s+in\s+life|like\s+(?:a\s+failure|giving\s+up|an?\s+idiot))\b|\bfeeling\s+(?:really\s+|so\s+|a\s+bit\s+)?(?:down|low|sad|awful|anxious|overwhelmed|stupid|hopeless)\b|\b(?:i'?m|i\s+am)\s+(?:so\s+)?(?:upset|devastated|heartbroken|gutted|exhausted|burnt\s+out|burned\s+out)\b/;
/** Laughing at their own riddle: a question answered in the same breath, with a laugh. */
const JOKE_TOLD = /(?:😂|🤣|😆|😹|\blol\b|\blmao\b|\bha(?:ha)+\b|\bjk\b)/;
/** A hurry: an exam in minutes, "quick," as the first word — never "quick question:", which only announces one. */
const HURRY = /\b(?:exam|test|quiz|interview|meeting|presentation|class)\s+(?:is\s+|starts\s+)?in\s+(?:\d+|a\s+few|five|ten|twenty|thirty)\s*(?:min|mins|minutes|hours?|hrs?)\b|\bin\s+a\s+(?:rush|hurry)\b|\b(?:i\s+have|i'?ve\s+got|i\s+got|there'?s)\s+no\s+time\b|\bno\s+time\s+to\s+(?:explain|read|learn)\b|^quick[,!:]\s+(?!question)|\basap\b|\b(?:walking\s+into|about\s+to\s+(?:start|sit|take|walk\s+into))\s+(?:my\s+|the\s+|an?\s+)?(?:\w+\s+)?(?:exam|test|quiz|interview|meeting|class)\b|\bquick\s*[!?.]*$/;
/** A handover: they want it done, not learned. */
const HANDOVER = /\b(?:(?:solve|do|work\s+out|compute|calculate|finish|answer|figure\s+out)\s+(?:it|this|that|these|them)(?:\s+one)?\s+for\s+me|just\s+(?:solve|compute|calculate|work\s+out|find|do)\b|just\s+give\s+me\s+the\s+(?:answer|result|number)|i\s+(?:don'?t|do\s+not)\s+(?:need|want)\s+(?:an\s+)?(?:explanation|to\s+learn|the\s+steps|a\s+walkthrough)|no\s+need\s+to\s+(?:walk\s+me\s+through|explain|show\s+(?:me\s+)?(?:the\s+)?(?:steps|working))|(?:only|just)\s+(?:need|want)\s+the\s+(?:final\s+)?(?:answer|result|number))\b|\b(?:solve|compute|calculate|work\s+out|figure\s+out)\b[^.?!]{0,60}\bfor\s+me\b/;
/** Working or an answer of their own in the message. */
const WORKING = /(?:^|[\s(])(?:[a-z]\s*=\s*-?\d|[a-z]\s*\^?\s*\d?\s*[+\-*/]\s*\d+\s*=|-?\d+(?:\.\d+)?\s*[+\-*/x×]\s*-?\d+(?:\.\d+)?\s*=)|\bi\s+got\s+(?:-?\d|[a-z]\s*=|that\b|it\s+as\b)|\bmy\s+(?:answer|working|solution|attempt)\s+(?:is|was)\b|\bmy\s+[a-z]+(?:\s+[a-z]+)?\s+(?:was|is|came\s+out\s+(?:as|at)|=)\s+-?\d|\bso\s+(?:it'?s|its|the\s+answer\s+is|[a-z]\s+is)\s+-?\d|\bi\s+(?:think|reckon)\s+(?:it'?s|the\s+answer\s+is|x\s*=)\s*/;
const VERIFY_ASK = /\b(?:is|was)\s+(?:this|that|it|my\s+(?:answer|working|reasoning|solution))\s+(?:right|correct|ok|okay)\b|\bright\s*\?|\bisn'?t\s+it\s*\?|\bcorrect\s*\?|\bdid\s+i\s+(?:get|do)\s+(?:it|this|that)\s+right\b|\bam\s+i\s+(?:right|correct|on\s+the\s+right\s+track)\b|\bcheck\s+my\s+(?:working|answer|reasoning|solution)\b/;
/** A reply that ended by asking them to recall, explain, predict or try — read from its text when it has no note. */
/** An offer at the end of a reply ("Want me to show you…?") is not a question put to them. */
const OFFER = /\b(?:want\s+me\s+to|shall\s+i|should\s+i|would\s+you\s+like|do\s+you\s+want|want\s+to\s+(?:see|try|go)|happy\s+to|if\s+you\s+(?:like|want))\b[^?]*\?\s*$/;
const ASKED_THEM = /(?:\bin\s+your\s+own\s+words\b|\bwhy\s+(?:does|do|is|would|did)\b|\bwhat\s+(?:would|do\s+you\s+think|happens|will\s+happen)\b|\bcan\s+you\s+(?:explain|say|recall|remember|try|tell\s+me)\b|\btry\s+(?:it|this|the\s+next|one)\b|\bnow\s+you\b|\byour\s+turn\b|\bwhich\s+(?:one|method|step|part)\b|\bpredict\b|\bremember\s+(?:what|how|why)\b)[^?]*\?\s*$/;
const REACTION_WORDS = new Set('thanks thank you ok okay k kk cool great nice awesome perfect sure yes yeah yep yup no nope nah fine lol haha good alright right got it that makes sense i see oh ah ahh ohh wow interesting hmm hm wait huh what sorry still dont don\'t do not get understand follow following lost confused me this that is am i\'m im really so totally completely very bit kind of kinda now makes sense clicks clear clearer helps helped understood love it'.split(' '));

/** Common beliefs that do not survive the evidence — used only to judge a belief they state, never to label them. */
const MYTHS: readonly { re: RegExp; quantity?: boolean }[] = [
  { re: /\b(?:only\s+use|use\s+only)\s+(?:10|ten)\s*(?:%|percent)\s+of\s+(?:our|your|the)\s+brains?\b/ },
  { re: /\bheav(?:y|ier)\s+(?:things|objects|stuff|balls?|bodies|weights?|ones)\s+(?:fall|drop)\s+faster\b|\b(?:\d+\s*(?:kg|lb|pound|kilo)s?|heavier|heavy)\b[^.?!]*\b(?:hits?|lands?|reach(?:es)?)\s+the\s+ground\s+(?:first|before|sooner)\b/, quantity: true },
  { re: /\bseasons?\s+(?:are|is)\s+(?:caused\s+by|because\s+of|due\s+to)\s+(?:how\s+close|the\s+distance|being\s+closer)|\bsummer\s+(?:is\s+)?(?:because|when)\s+(?:the\s+)?earth\s+is\s+closer\b|\bcloser\s+to\s+the\s+sun\s+in\s+(?:the\s+)?summer\b/ },
  { re: /\bglass\s+is\s+(?:a\s+)?(?:slow[- ]?moving\s+)?liquid\b/ },
  { re: /\b(?:blood|veins?)\s+(?:is|are)\s+blue\b|\bdeoxygenated\s+blood\s+is\s+blue\b/ },
  { re: /\blightning\s+never\s+strikes\s+(?:the\s+same\s+place\s+)?twice\b/ },
  { re: /\bgoldfish\s+(?:have|has|only\s+have)\s+(?:a\s+)?(?:3|three)[- ]second\s+memor/ },
  { re: /\bbulls?\s+(?:hate|are\s+angered\s+by|get\s+angry\s+at)\s+(?:the\s+colou?r\s+)?red\b/ },
  { re: /\bhumans?\s+(?:evolved|descended|came)\s+from\s+(?:monkeys|chimps|chimpanzees|apes\s+like\s+chimps)\b/ },
  { re: /\btongue\s+(?:has|map|zones)\b.*\b(?:sweet|sour|bitter|salty)\b|\btaste\s+map\b/ },
  { re: /\bcracking\s+(?:your\s+)?knuckles\s+(?:causes|gives\s+you|leads\s+to)\s+arthritis\b/ },
  { re: /\bsugar\s+makes\s+(?:kids|children)\s+hyper(?:active)?\b/ },
  { re: /\bvaccines?\s+(?:cause|causes|gives?)\s+autism\b/ },
  { re: /\bantibiotics?\s+(?:kill|cure|treat|work\s+(?:on|against))\s+(?:a\s+)?(?:virus|viruses|viral|the\s+flu|colds?|the\s+common\s+cold)\b/ },
  { re: /\bp[- ]?values?\s+(?:is|are|tells?\s+you|gives?)\s+(?:the\s+)?(?:probability|chance)\s+(?:that\s+)?(?:the\s+)?(?:null|hypothesis|result\s+is\s+(?:due\s+to\s+)?chance)\b/, quantity: true },
  { re: /\bmultiplying\s+(?:always\s+)?makes\s+(?:it\s+|things\s+|numbers\s+)?bigger\b|\bdividing\s+(?:always\s+)?makes\s+(?:it\s+|things\s+|numbers\s+)?smaller\b/, quantity: true },
  { re: /\b0\.9+(?:\.\.\.|…|\s+recurring|\s+repeating)\s+is\s+(?:less|smaller)\s+than\s+1\b|\b0\.9+(?:\.\.\.|…)?\s+(?:isn'?t|is\s+not|doesn'?t)\s+(?:equal|equals?)\s+1\b/, quantity: true },
  { re: /\b(?:tails|heads|red|black)\s+is\s+(?:due|more\s+likely)\s+(?:now|next|after)\b|\bdue\s+for\s+a\s+(?:win|tails|heads)\b/, quantity: true },
  { re: /\b(?:objects?|things?)\s+need\s+(?:a\s+)?(?:constant\s+)?force\s+to\s+keep\s+moving\b|\bmotion\s+needs\s+a\s+force\b/, quantity: true },
  { re: /\bplants\s+get\s+(?:their|most\s+of\s+their)\s+(?:mass|weight|food)\s+from\s+(?:the\s+)?soil\b/, quantity: true },
  { re: /\bplants\s+(?:don'?t|do\s+not)\s+(?:respire|do\s+respiration|breathe)\b|\bplants\s+only\s+(?:take\s+in|breathe\s+in)\s+co2\b/ },
  { re: /\b(?:hair|nails)\s+(?:keeps?|continue)\s+(?:to\s+)?grow(?:ing)?\s+after\s+(?:you\s+)?die\b/ },
  { re: /\bgreat\s+wall\b.*\bvisible\s+from\s+(?:space|the\s+moon)\b/ },
  { re: /\bnapoleon\s+was\s+(?:really\s+|very\s+)?short\b/ },
  { re: /\b(?:most|half)\s+(?:of\s+)?(?:your\s+|our\s+|body\s+)?heat\s+(?:is\s+)?lost\s+through\s+(?:your\s+|the\s+)?head\b/ },
  { re: /\bshaving\s+makes\s+(?:hair|it)\s+(?:grow\s+back\s+)?(?:thicker|darker|faster)\b/ },
  { re: /\bevolution\s+(?:means|is)\s+(?:animals|organisms|individuals)\s+(?:change|adapt)\s+(?:during|in)\s+(?:their|its)\s+(?:life|lifetime)\b|\bgiraffes?\s+(?:got|grew)\s+long\s+necks\s+(?:by|from)\s+stretching\b/ },
  { re: /\b(?:moon'?s?\s+phases?|phases\s+of\s+the\s+moon)\s+(?:are|is)\s+(?:caused\s+by|because\s+of|due\s+to)\s+(?:the\s+)?earth'?s\s+shadow\b/ },
  { re: /\b(?:a\s+)?tax\s+(?:on\s+\w+\s+)?is\s+(?:all\s+|fully\s+|entirely\s+)?paid\s+by\s+whoever\b|\bwhoever\s+(?:the\s+tax\s+is\s+)?(?:levied|charged)\s+on\s+pays\s+(?:all\s+of\s+)?it\b/, quantity: true },
  { re: /\bcorrelation\s+(?:means|implies|proves)\s+causation\b/ },
  { re: /\b(?:absorbed|absorbs|absorption)\s+and\s+re-?emit/ },
  { re: /\btacoma\b[^?]*\bresonan|\bresonan\w*\b[^?]*\btacoma\b/ },
  { re: /\bbreaking\s+(?:the\s+|a\s+|that\s+|its\s+)?(?:high[- ]energy\s+)?(?:phosphate\s+|chemical\s+)?bonds?\s+(?:releases?|gives?\s+off|produces?)\s+energy\b|\benergy\s+(?:is\s+)?stored\s+in\s+(?:the\s+|its\s+)?(?:high[- ]energy\s+)?(?:phosphate\s+|chemical\s+)?bonds?\b/ },
  { re: /\blactic\s+acid\b[^.?!]*\b(?:sore|soreness|built\s+up|build[- ]?up|still\s+(?:in|there)|days?\s+later)\b|\b(?:sore|soreness)\b[^.?!]*\blactic\s+acid\b/ },
  { re: /\b(?:0?\.0\d+\s*%|tiny|trace|small\s+amount)\b[^?]*\b(?:how\s+can|can'?t\s+(?:possibly\s+)?(?:matter|control|affect)|cannot)\b[^?]*\b(?:control|matter|affect|warm|heat|temperature)\b/, quantity: true },
  { re: /\b(?:is\s+it\s+(?:actually\s+)?distance|tilt\w*\b[^?]*\bcloser\b|\bcloser\b[^?]*\btilt\w*)\b/ },
  { re: /\b(?:bats?\s+are\s+blind|ostriches\s+bury\s+their\s+heads)\b/ },
  { re: /\bwe\s+(?:only\s+)?have\s+(?:5|five)\s+senses\b/ },
];

/** A common myth, CORRECTED — what they say is right: confirmed, never refuted. */
const TRUE_SAYINGS: readonly RegExp[] = [
  /\bbats?\s+(?:aren'?t|are\s+not|isn'?t)\s+(?:actually\s+|really\s+)?blind\b|\bbats?\s+can\s+(?:actually\s+|really\s+)?see\b|\bblind\s+as\s+a\s+bat\b[^.?!]*\b(?:wrong|myth|not\s+true|untrue|false)\b/,
  /\bglass\s+(?:isn'?t|is\s+not)\s+(?:really\s+|actually\s+)?(?:a\s+)?liquid\b|\bglass\s+is\s+(?:an?\s+)?(?:amorphous\s+)?solid\b/,
  /\b(?:all\s+)?(?:objects|things|everything)\s+fall\s+at\s+the\s+same\s+(?:rate|speed|acceleration)\b|\bheav(?:y|ier)\s+(?:things|objects)\s+(?:don'?t|do\s+not)\s+fall\s+faster\b/,
  /\b(?:we|you|humans)\s+(?:use|uses)\s+(?:all|most|way\s+more\s+than\s+10\s*%)\s+of\s+(?:our|your|the)\s+brains?\b|\b10\s*%\s+(?:of\s+the\s+brain\s+)?(?:thing\s+)?is\s+(?:a\s+)?(?:myth|wrong|false)\b/,
  /\bseasons?\s+(?:are|is)\s+(?:caused\s+by|because\s+of|due\s+to)\s+(?:the\s+)?(?:earth'?s\s+)?(?:tilt|axial\s+tilt)\b/,
  /\bantibiotics?\s+(?:don'?t|do\s+not|can'?t|cannot)\s+(?:work\s+on|kill|treat|help\s+with)\s+(?:a\s+)?(?:virus|viruses|viral|colds?|the\s+flu)\b/,
  /\bvaccines?\s+(?:don'?t|do\s+not)\s+cause\s+autism\b/,
  /\bcorrelation\s+(?:doesn'?t|does\s+not|isn'?t|is\s+not)\s+(?:mean\s+|imply\s+|prove\s+)?causation\b/,
  /\b0\.9+(?:\.\.\.|…|\s+recurring|\s+repeating)?\s+(?:is|equals)\s+(?:exactly\s+)?1\b/,
];

/** The words they wrote, as a sentence the model can quote: clipped, nothing that could read as an instruction. */
function quoted(s: string, words: number): string {
  const clean = s.replace(/[`<>{}[\]\\|]/g, ' ').replace(/\b(?:ignore|system|assistant|instructions?|prompt)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const w = clean.split(' ');
  return (w.length > words ? w.slice(0, words).join(' ') + '…' : clean).replace(/["“”]/g, "'");
}

/** The sentence a question is in: the last one that asks, read after any preamble ("I'm new to this. What is…?"). */
export function focusOf(text: string): string {
  const t = lc(text).replace(REACTION_LEAD, '');
  const parts = t
    .split(/(?<=[?!.:])\s+|\s+[—–]\s+|\n+|,\s+(?=(?:so|but|and|then)\s+(?:why|how|what|when|where|which|who|whose|is|are|was|were|does|do|did|can|could|should|would|will)\b)/)
    .map((s) => s.replace(REACTION_LEAD, '').replace(/^(?:so|but|and|then)[,]?\s+/, '').trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? t;
  // the last sentence that asks — "thats it?" or "right?" alone is a tag on what came before, not the question
  const asking = [...parts].reverse().find((s) => /\?\s*$/.test(s) && s.replace(LEAD, '').replace(/[?!.\s]+$/, '').split(' ').length >= 3);
  return asking ?? parts[parts.length - 1];
}

const strip = (s: string) => s.replace(LEAD, '').replace(ASKING_LEAD, '').replace(LEAD, '').trim();

/** What kind of question it is, read from the last question sentence after its asking lead. */
export function askKind(text: string): AskKind {
  const whole = lc(text).replace(LEAD, '');
  if (!whole) return 'other';
  if (PRACTICE.test(whole) || REVIEW.test(whole)) return 'practice';
  const f0 = focusOf(text).replace(LEAD, '');
  const f = strip(f0);
  const kindOf = (t: string): AskKind | null => {
    if (!t) return null;
    if (DECIDE.test(t)) return 'decide';
    if (COMPARE.test(t)) return 'compare';
    if (CLAIM.test(t)) return 'claim';
    if (RELATE.test(t)) return 'relate';
    if (WHY.test(t)) return 'why';
    // "how would I work out compound interest?": a method asked for, not a mechanism — unless there are numbers to solve
    if (PROCEDURE.test(t) && !/\d/.test(t)) return 'procedure';
    if (HOW_WORKS.test(t)) return 'how';
    if (SOLVE.test(t) && !/^(?:what(?:'s|s)?\s+(?:even\s+|exactly\s+|actually\s+)?(?:is|are|does|do)?\b|why|how\s+does)/.test(t)) return 'solve';
    if (PROCEDURE.test(t)) return 'procedure';
    if (WHAT_IS.test(t)) return 'what';
    return null;
  };
  const k = kindOf(f) ?? kindOf(f0) ?? kindOf(whole);
  // "tcp vs udp — what's actually different?": the comparison is named before the question that asks for it
  if ((k === 'what' || k === 'other' || k === null) && COMPARE.test(whole)) return 'compare';
  if ((k === 'what' || k === null) && DECIDE.test(whole)) return 'decide';
  if (k) return k;
  // "help me understand derivatives", "explain inflation": a concept named after the asking lead
  if (BARE_NOUN_ASK.test(f0) || BARE_NOUN_ASK.test(whole)) return 'what';
  return 'other';
}

const STOP = new Set(
  (
    'a an the of to in on for and or but is are was were be been being it its this that these those how why what which when where who whom whose does do did doing done can could would should will shall may might must i me my mine we us our you your yours they them their he she him her his hers about into from with without as at by so than then there here really actually exactly just please ' +
    "explain tell show help understand understanding mean means meant work works working worked happen happens happening difference differences between versus vs compare is it true like simple simply terms eli5 kid five year years old way ways review revise revision exam exams test tests tomorrow today tonight week weekend study studying learn learning quiz practice practise question questions problem problems need needs want wants know knows get gets got still now some more again also don't dont doesn't doesnt can't cant won't isn't isnt i'm im it's thats that's what's whats there's i've ive i'd you're youre let's lets okay ok thanks thank cool great nice yes yeah sure right wrong correct answer answers basically technically literally honestly anyway idea ideas thing things stuff something anything everything bit lot lots kind sort quick quickly next another one two three first second last other same different new beginner novice expert confused confusing lost follow following sense makes make made making clicks clear huh wait sorry hmm well very much many most part parts step steps start begin solve solving solved calculate calculating compute find finding finds simplify evaluate prove show proof example examples mean average good bad better best cause causes caused causing reason reasons effect effects affect affects use uses used using drive drives driven take takes taking give gives giving go goes going come comes keep keeps look looks think thinks feel try trying see seen say said saying ask asking called call does homework assignment class course lecture teacher professor school college university uni unit chapter module topic topics subject concept concepts definition define defined meaning process processes always thought believed heard told pretty sure true false wrong tbh pls plz thx tho rn imo lol haha heyyy hey hiya all not arrows arrow lines line bits bit diagram picture analogy explanation explanations nope none clicking click getting research evidence blog blogs says say back legit claim claims data studies study procedure method methods formula formulas harder easier before after details detail map pieces piece main put pick choose decide deciding open pay start starting trying try tried bet settle remind reminds sorry roughly mock revising term semester mixed mixing keep keeps forgetting drill mix random shuffled bunch few couple across whole entire actual solid strong weak pub night brother sister friend friends talk talking chat chatting seems seem looks idk dunno while ago earlier remember recall forgot forget"
  ).split(/\s+/)
);

/** A subject for a maths problem with no named concept: what kind of problem it is. */
function mathTopic(t: string): string | null {
  if (/\bderivative|differentiat|d\/dx|\bdy\/dx|\bf'\(/.test(t)) return 'derivatives';
  if (/\bintegra(?:l|te|tion)|∫/.test(t)) return 'integrals';
  if (/\blimit|\blim\b/.test(t) && /\bx\s*(?:→|->|approaches|tends)/.test(t)) return 'limits';
  if (/[a-z]\s*(?:\^\s*2|²)/.test(t) && /=/.test(t)) return 'quadratic equations';
  if (/\b(?:simultaneous|system\s+of)\s+equations\b/.test(t)) return 'simultaneous equations';
  if (/\b[a-z]\s*[+\-]\s*\d+\s*=|\d\s*[a-z]\s*[+\-]\s*\d+\s*=|=\s*-?\d+\s*$/.test(t) && /[a-z]/.test(t.replace(/\b(?:solve|for|find|is|this|right|so|x)\b/g, ''))) return 'linear equations';
  if (/\b\d+\s*%|\bpercent/.test(t)) return 'percentages';
  if (/\bfraction|\d+\s*\/\s*\d+/.test(t)) return 'fractions';
  return null;
}

/** The topic, in a few words: the content words of the question sentence, lower-cased. Null when there is no subject. */
const contentWords = (t: string) =>
  t
    .replace(/[^a-z0-9' -]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, '').replace(/^-+|-+$/g, ''))
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w) && !/^[a-z]?\d/.test(w) && !/'(?:s|t|re|ve|ll|d|m)$/.test(w));

/** The topic, in a few words: names and acronyms first ("SGLT2", "IRA"), then the content words of the question sentence. Null when there is no subject. */
export function topicOf(text: string): string | null {
  // what they named, in capitals, is the subject more often than the words around it
  const named = [...text.replace(/```[\s\S]*?```/g, ' ').matchAll(/\b([A-Z][A-Z0-9]{1,7}(?:-[A-Z0-9]+)?)\b/g)]
    .map((m) => m[1].toLowerCase())
    .filter((w) => !/^(?:i|ok|okay|eli5|tl|dr|tldr|asap|pls|plz|lol|omg|btw|fyi|faq|am|pm|uk|us|usa|vs|idk)$/.test(w) && !STOP.has(w));
  const strip0 = (t: string) => t.replace(LEAD, '').replace(ASKING_LEAD, '');
  let words = contentWords(strip0(focusOf(text)));
  if (!words.length) words = contentWords(strip0(lc(text).replace(REACTION_LEAD, '')));
  const all = [...new Set([...named, ...words])].filter(Boolean);
  if (!all.length) return mathTopic(lc(text));
  // a single short word is not a subject ("solve", "next")
  if (all.length === 1 && all[0].length < 3) return mathTopic(lc(text));
  return all.slice(0, 3).join(' ').slice(0, 48);
}

/** Nothing in it but a reaction: "thanks", "ok cool", "I still don't get it", "huh?". */
export function reactionOnly(text: string): boolean {
  const words = lc(text).replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 9 && words.every((w) => REACTION_WORDS.has(w));
}

/** How many terms in it a newcomer may not know: long, Latinate words that are not everyday ones. */
const TERM = /\b[a-z]{4,}(?:tion|sis|ism|ity|ance|ence|ment|ics|ology|ase|ide|ate|ine|ium|um|us|al)\b/g;
const EVERYDAY = /^(?:question|information|attention|situation|important|different|actually|personal|national|general|total|usual|natural|position|education|statement|moment|government|condition|decision|explanation|mention|function|basically|literally|probably|definitely|usually|already|minimum|maximum|several|beginner|homework|confusion|difference|sentence|relationship|ultimate|separate|morning|evening|nothing|something|anything|everything|together|whatever|business|economics|physics|science|biology|chemistry|history|maths|mathematics|technically|totally|completely|really|finally|eventually|yesterday|tomorrow|instance|elaborate|figure|picture|example|problem|between|another|explain|understand|anymore|general|original|individual|material|interval|terminal|mention|mentions)$/;
export function termsIn(text: string): string[] {
  const seen: string[] = [];
  for (const w of lc(text).match(TERM) ?? []) if (!EVERYDAY.test(w) && !seen.includes(w)) seen.push(w);
  return seen;
}
export function termCount(text: string): number {
  return termsIn(text).length;
}

/**
 * The markers a reply's inline elements leave in the history the model (and this engine) reads — written by
 * lib/inline-ui.ts contentForHistory with the same constant, so the two can never drift apart.
 */
const SHOWN_RE = SHOWN_INLINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What the last reply did, from its note when it has one, else read from its text as the route sends it. */
export function usedBefore(history: ExplainInput['history'], note?: ThreadNote | null): Set<Strategy> {
  const used = new Set<Strategy>(note?.s ?? []);
  const prev = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  if (!prev) return used;
  const shown = (kinds: string) => new RegExp(`(?:${SHOWN_RE}(?:${kinds}):|\`\`\`ui\\s*\\n\\s*\\{"type":"(?:${kinds})")`).test(prev);
  if (/\b(?:think\s+of\s+(?:it|this|them)\s+(?:as|like)|picture\s+(?:a|an|it\s+as)|imagine\s+(?:a|an|you|that)|it'?s\s+(?:a\s+bit\s+|kind\s+of\s+)?like\s+(?:a|an|the)|is\s+(?:a\s+bit\s+)?like\s+(?:a|an)|works\s+like\s+(?:a|an)|analogy)\b/i.test(prev)) used.add('analogy');
  if (shown('steps')) used.add('worked');
  if (shown('compare')) used.add('compare');
  if (shown('diagram|graph|sim|sequence|concepts')) used.add('visual');
  if (shown('check')) used.add('retrieval');
  if (/\bin\s+your\s+own\s+words\b/i.test(prev)) used.add('teachback');
  return used;
}

/** How much they know about this, from what they said about themselves and what they showed — never a label kept about them. */
export function levelOf(i: Pick<ExplainInput, 'text' | 'signals' | 'state' | 'did' | 'ledger'>, _topic?: string | null): Level {
  const t = lc(i.text);
  const wrong = i.state.understanding.wrong + (i.did?.wrong ?? 0);
  const right = i.state.understanding.right + (i.did?.right ?? 0);
  // what they say about themselves (signals read self-descriptions only), or asking to be taught from the start
  if (NOVICE_SAID.test(t) || i.state.understanding.saidStuck || i.signals.expertise === 'novice') return 'novice';
  if (EXPERT_SAID.test(t) || i.signals.expertise === 'expert') return 'expert';
  if (wrong > right) return 'novice';
  return 'intermediate';
}

/** How much there is to it. */
export function complexityOf(text: string, kind: AskKind): 1 | 2 | 3 {
  const t = lc(text);
  const words = t.split(' ').filter(Boolean).length;
  const terms = termCount(focusOf(text));
  const parts = (t.match(/\?/g) ?? []).length + (t.match(/\b(?:and\s+(?:also|then|how|why|what)|also)\b/g) ?? []).length;
  let c = 1;
  if (kind === 'relate' || kind === 'solve' || kind === 'compare' || kind === 'claim' || kind === 'decide' || ((kind === 'how' || kind === 'why') && (terms >= 1 || words >= 9))) c = 2;
  if (terms >= 2 || parts >= 2 || words >= 40 || (kind === 'relate' && terms >= 1) || (kind === 'how' && terms >= 1)) c = Math.max(c, 2);
  if ((terms >= 3 && (kind === 'how' || kind === 'why' || kind === 'relate')) || parts >= 3 || words >= 70) c = 3;
  return c as 1 | 2 | 3;
}

// ── the ledger: continuity across conversations ───────────────────────

/** Days until a concept in each box is due again (Leitner, expanding). */
export const INTERVAL_DAYS = [1, 3, 7, 16, 35] as const;
const DAY = 86_400_000;
const LEDGER_MAX = 40;

const stem = (w: string) => (w.length > 4 ? w.replace(/(?:ies)$/, 'y').replace(/(?:sses)$/, 'ss').replace(/(?:es|s)$/, '').replace(/(?:ing|ed)$/, '') : w);
const keyWords = (s: string) => s.split(' ').filter((w) => w.length > 3 && !STOP.has(w)).map(stem);

export function sameTopic(a: string, b: string): boolean {
  if (a === b) return true;
  const A = new Set(keyWords(a));
  const B = keyWords(b);
  if (!A.size || !B.length) return false;
  const shared = B.filter((w) => A.has(w)).length;
  return shared >= Math.min(2, Math.min(A.size, B.length));
}

/** A topic worth keeping: at least one content word that is not a reaction, an asking word or a contraction. */
export function goodTopic(topic: string): boolean {
  return keyWords(topic).length > 0 || /^(?:quadratic|linear|simultaneous) equations$|^(?:derivatives|integrals|limits|percentages|fractions)$/.test(topic);
}

/**
 * A concept met again: counted; moved by how its checks went (right up a box, a slip back to the first); marked
 * practised when they answered or recalled it (the review clock restarts only then — a mention never resets it);
 * a way in that left them lost remembered.
 */
export function noteTopic(
  ledger: readonly LedgerEntry[],
  topic: string,
  outcome: { right?: number; wrong?: number; tries?: number; reviewed?: boolean; failed?: Approach; fade?: -1 | 0 | 1 },
  at: number
): LedgerEntry[] {
  if (!goodTopic(topic)) return [...ledger];
  const i = ledger.findIndex((e) => sameTopic(e.topic, topic));
  const right = Math.max(0, outcome.right ?? 0);
  const wrong = Math.max(0, outcome.wrong ?? 0);
  const prev: LedgerEntry = i >= 0 ? ledger[i] : { topic, seen: 0, right: 0, wrong: 0, last: at, met: at, box: 0 };
  // a right answer after several tries is not yet a step up
  const firstTry = right > 0 && wrong === 0 && (outcome.tries ?? 1) <= 1;
  const box = wrong > 0 ? 0 : firstTry ? Math.min(INTERVAL_DAYS.length - 1, prev.box + 1) : prev.box;
  const practised = right > 0 || wrong > 0 || !!outcome.reviewed;
  const fade = Math.max(0, Math.min(3, (prev.fade ?? 0) + (wrong > 0 ? -1 : firstTry ? 1 : outcome.fade ?? 0)));
  const failed = outcome.failed ? [outcome.failed, ...(prev.failed ?? []).filter((a) => a !== outcome.failed)].slice(0, 3) : prev.failed;
  const next: LedgerEntry = {
    topic: prev.topic,
    seen: prev.seen + 1,
    right: prev.right + right,
    wrong: prev.wrong + wrong,
    last: practised || i < 0 ? at : prev.last,
    met: at,
    box,
    ...(fade ? { fade } : {}),
    ...(failed?.length ? { failed } : {}),
  };
  const rest = ledger.filter((_, j) => j !== i);
  return [next, ...rest].slice(0, LEDGER_MAX);
}

/** What is due for review now: met before, at least a day ago, and past its box's interval since it was last practised. Oldest-due first. */
export function dueTopics(ledger: readonly LedgerEntry[], now: number): LedgerEntry[] {
  return ledger
    .filter((e) => e.seen >= 1 && goodTopic(e.topic) && now - e.last >= DAY && now - e.last >= INTERVAL_DAYS[Math.min(e.box, INTERVAL_DAYS.length - 1)] * DAY)
    .sort((a, b) => a.last + INTERVAL_DAYS[a.box] * DAY - (b.last + INTERVAL_DAYS[b.box] * DAY));
}

/** The ledger as it came from a browser: shaped, clipped, forty at most, junk topics dropped — context, trusted for nothing else. */
export function sanitizeLedger(raw: unknown, now: number): LedgerEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LedgerEntry[] = [];
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
  for (const v of raw.slice(0, LEDGER_MAX)) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    const topic = typeof o?.topic === 'string' ? o.topic.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48) : '';
    const last = n(o?.last, now);
    if (!topic || !last || !goodTopic(topic)) continue;
    const met = n(o?.met, now);
    const fade = n(o?.fade, 3);
    const failed = Array.isArray(o?.failed) ? (o!.failed as unknown[]).filter((a): a is Approach => typeof a === 'string' && (APPROACHES as readonly string[]).includes(a)).slice(0, 3) : [];
    out.push({
      topic,
      seen: n(o?.seen, 9999),
      right: n(o?.right, 9999),
      wrong: n(o?.wrong, 9999),
      last,
      ...(met ? { met } : {}),
      box: n(o?.box, INTERVAL_DAYS.length - 1),
      ...(fade ? { fade } : {}),
      ...(failed.length ? { failed } : {}),
    });
  }
  return out;
}

/** The outcomes of the checks they answered, from what they did ("… — right", "… — not right (after 3 tries)"). */
export function outcomesOf(did: readonly { said: string }[] | undefined): { right: number; wrong: number; tries: number } {
  let right = 0;
  let wrong = 0;
  let tries = 0;
  for (const d of did ?? []) {
    const m = /\(after\s+(\d+)\s+tr(?:y|ies)\)/.exec(d.said);
    if (m) tries = Math.max(tries, Number(m[1]));
    if (/—\s*not right\b/.test(d.said)) wrong++;
    else if (/—\s*right\b/.test(d.said)) right++;
  }
  return { right, wrong, tries: tries || (right || wrong ? 1 : 0) };
}

/** A thread note as it came back from a browser (saved on a reply): enum codes and a clipped concept, nothing else. */
export function sanitizeThreadNote(raw: unknown): ThreadNote | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o) return null;
  const n = typeof o.n === 'string' && (NEEDS as readonly string[]).includes(o.n) ? (o.n as ExplainNeed) : null;
  if (!n) return null;
  const s = (Array.isArray(o.s) ? o.s : []).filter((x): x is Strategy => typeof x === 'string' && (STRATEGIES as readonly string[]).includes(x)).slice(0, 4);
  const q = typeof o.q === 'string' && (PENDING as readonly string[]).includes(o.q) ? (o.q as Pending) : undefined;
  const c = typeof o.c === 'string' ? o.c.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48) : '';
  return { s, n, ...(q ? { q } : {}), ...(c && goodTopic(c) ? { c } : {}) };
}

/** The note a plan leaves on its reply — the question only if the reply really asked one (checked by the client on the reply's text). */
export function threadNoteOf(plan: ExplainPlan | null): ThreadNote | null {
  if (!plan) return null;
  const q = pendingOf(plan.question);
  return { s: plan.strategies.slice(0, 4), n: plan.need, ...(q ? { q } : {}), ...(plan.topic ? { c: plan.topic } : {}) };
}

export function pendingOf(s: Strategy | null): Pending | undefined {
  switch (s) {
    case 'retrieval':
    case 'spaced':
      return 'recall';
    case 'teachback':
      return 'teachback';
    case 'elaborate':
    case 'selfexplain':
      return 'why';
    case 'transfer':
    case 'interleave':
      return 'try';
    case 'predict':
      return 'predict';
    case 'diagnose':
      return 'diagnose';
    default:
      return undefined;
  }
}

/** Whether a reply left a question open: it ends asking, or it carries something to answer. */
export function replyAsks(reply: string): boolean {
  const prose = reply.replace(/```[\s\S]*?```/g, ' ').trim();
  return /\?\s*(?:\*\*)?\s*$/.test(prose) || /```ui\s*\n\s*\{"type":"check"/.test(reply) || /"check"\s*:\s*\{/.test(reply) || /"predict"\s*:\s*\{/.test(reply);
}

// ── choosing ──────────────────────────────────────────────────────────

/** Strategies that do the same job: never two of one group in a turn. */
const GROUPS: Strategy[][] = [
  ['worked', 'faded', 'error'],
  // one worked instance or the first part of many: not both
  ['worked', 'segmented'],
  ['compare', 'tradeoffs'],
  ['conceptmap', 'argument'],
];
/** The forms each move carries its work in, best first (the planner's own elements). */
const FORMS: Partial<Record<Strategy, InlineKind[]>> = {
  compare: ['compare'],
  tradeoffs: ['decide'],
  worked: ['steps'],
  causal: ['diagram'],
  visual: ['diagram'],
  conceptmap: ['concepts'],
  argument: ['claim'],
  // (an unjudged belief is weighed in words: see finish — no element is added for it)
  segmented: ['paths'],
  interleave: ['check'],
  transfer: ['check'],
};
const VISUAL_FORMS: readonly InlineKind[] = ['diagram', 'graph', 'sim', 'slider', 'concepts', 'sequence', 'chart'];

/** The order a reframe tries ways in, by what was asked. */
const ROTATION: Record<'concept' | 'procedure' | 'claim' | 'choice', Approach[]> = {
  concept: ['example', 'picture', 'analogy', 'contrast', 'stepback'],
  procedure: ['example', 'stepback', 'picture', 'contrast'],
  claim: ['example', 'contrast', 'stepback'],
  choice: ['example', 'contrast', 'stepback'],
};
const APPROACH_OF: Partial<Record<Strategy, Approach>> = { worked: 'example', faded: 'example', visual: 'picture', analogy: 'analogy', compare: 'contrast', pretrain: 'stepback' };
const STRATEGY_OF: Record<Approach, Strategy> = { example: 'worked', picture: 'visual', analogy: 'analogy', contrast: 'compare', stepback: 'pretrain' };
const SAID_TRIED: Record<Approach, string> = { example: 'a worked example', picture: 'a picture', analogy: 'an analogy', contrast: 'a comparison', stepback: 'the idea underneath' };

export function planExplanation(i: ExplainInput): ExplainPlan {
  const raw = i.text.trim();
  const t = lc(raw);
  const kind = askKind(raw);
  const thread = i.thread ?? [];
  const note = thread.length ? thread[thread.length - 1] : null;
  const prevUser = [...i.history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const prevReply = [...i.history].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  const reaction = reactionOnly(raw);
  const own = reaction ? null : topicOf(raw);
  // the concept carried forward: the last reply's note, else the last question in the history that had a subject
  const carried = note?.c ?? (() => {
    for (let j = i.history.length - 1; j >= 0; j--) {
      const m = i.history[j];
      if (m.role === 'user' && !reactionOnly(m.content)) {
        const tp = topicOf(m.content);
        if (tp) return tp;
      }
    }
    return null;
  })();
  const level = levelOf(i);
  const complexity = complexityOf(raw, kind);
  const x = i.state.exchange.kind;
  const work = i.state.work;
  const reasons: string[] = [`ask:${kind}`, `level:${level}`, `complexity:${complexity}`];
  const before = usedBefore(i.history, note);
  // "idk" in answer to Socria's question is being stuck, not an answer
  const stuckOnIt = !!i.signals.dontKnow && !!prevReply;
  const confused = CONFUSED.test(t) || BARE_LOST.test(t) || stuckOnIt;
  const gotIt = GOT_IT.test(t);
  const simpler = SIMPLER.test(t) || !!i.signals.redundancy;
  const did = i.did ?? { right: 0, wrong: 0 };
  // EVIDENCE OF A MISTAKE is a mistake: a refuted step, a check not right. Socria's scaffold never is.
  const wrongNow = i.state.understanding.wrong + did.wrong > 0;
  const rightNow = i.state.understanding.right + did.right > 0;
  const working = WORKING.test(t);
  // their working with a question about it — "where does the 24x come from?", "the answer key says…" — is theirs to have checked
  const disputed = working && /\b(?:answer\s+key|where\s+(?:does|did)\s+(?:the|that|this)|why\s+(?:is|isn'?t)\s+it|textbook\s+says|marked\s+(?:it\s+|me\s+)?wrong|got\s+it\s+wrong)\b/.test(t);
  const verify = (VERIFY_ASK.test(t) || disputed) && (working || /\d/.test(t) || t.split(' ').length >= 8);
  // an answer to the question Socria left them: its note says so, or its text ended asking them something
  // a note, where the reply has one, is the record: no question in it means none was left. Only older replies, with
  // no note, are read from their text — and an offer ("Want me to show you…?") is not a question put to them
  const prevPlain = prevReply.replace(new RegExp(`${SHOWN_RE}[^\\]]*\\]`, 'g'), ' ').trim().slice(-600);
  const pendingQ = note ? note.q : prevPlain && ASKED_THEM.test(prevPlain) && !OFFER.test(prevPlain) ? ('why' as Pending) : undefined;
  const answering = !!pendingQ && !confused && !reaction && !/\?\s*$/.test(t) && kind !== 'practice' && t.split(' ').length <= 80;
  // anything Socria said that was more than a hello counts: "Entropy measures the number of microstates." is an explanation
  const priorExplanation = !!prevReply && (note ? note.n !== 'direct' : prevReply.split(/\s+/).length >= 5 && !/^(?:hi|hello|hey|good|thanks|you'?re welcome|no problem)\b/i.test(prevReply.trim()));
  // their own summary of what was explained ("so basically the light part makes ATP…", "ok so X = Y, thats it?"): a
  // teach-back they offered — confirmed or sharpened, never re-explained
  const summary =
    priorExplanation &&
    t.split(' ').length >= 7 &&
    (/(?:^|[,.;—–-]\s*|\bnow\s+|\bit\s+)(?:(?:ok(?:ay)?|right|alright|wait)[,.]?\s+)?so\s+(?:basically|essentially|in\s+(?:other\s+words|short)|what\s+you'?re\s+saying\s+is|the\s+(?:idea|point)\s+is|it'?s\s+(?:like|basically))\b/.test(t) ||
      /^(?:(?:ok(?:ay)?|right|alright)[,.]?\s+)?so\s+[^?]{6,}(?:=|→|->)/.test(t) ||
      /\bin\s+other\s+words\b/.test(t) ||
      /\b(?:is\s+that|thats|that'?s)\s+(?:it|right|correct)\s*\??\s*$|\bright\s*\?\s*$/.test(t) && /^(?:(?:ok(?:ay)?|right|alright)[,.]?\s+)?so\b/.test(t));
  // "that makes sense" with something of their own in it — but a new question after it is a new question
  const tagOnly = /^(?:right|correct|yeah|yes|no|true|ok|okay|is\s+that\s+(?:it|right)|thats\s+(?:it|right)|am\s+i\s+right)\s*\?+\s*$/.test(focusOf(raw));
  const newQuestion = /\?\s*$/.test(focusOf(raw)) && !summary && !tagOnly;
  // "that makes sense" with an account of their own — a long one stays a teach-back even when it ends asking "right?"
  // — unless what it asks is a question of its own (a wh-question, or a choice between options)
  const asksOwn = /\b(?:what|which|how|why|when|where|who|should\s+i|do\s+i)\b|\b\w+\s+or\s+\w+[^,]*\?\s*$/.test(focusOf(raw));
  const statesUnderstanding = summary || (gotIt && !reaction && !!own && t.split(' ').length >= 6 && (!newQuestion || (t.split(' ').length >= 15 && !asksOwn)));
  // a myth corrected is a TRUE belief: confirmed, never refuted
  const trueSaying = TRUE_SAYINGS.some((re) => re.test(t));
  // a belief is theirs and stated — "I read a chapter on the Krebs cycle, how does it work?" or "I thought I had it" is
  // context, not a claim to weigh; a how/why question after it is still the question
  const contextOnly = /\bi\s+(?:thought|think)\s+i\s+(?:had|got|understood|knew|get)\b|\bi\s+(?:read|heard)\s+(?:a|an|the|about|some)\s+(?:chapter|book|article|paper|post|bit|lot)\b/.test(t);
  const askedSomethingElse = ['why', 'how', 'what', 'relate', 'procedure', 'solve', 'compare', 'decide'].includes(kind) && !/,\s*right\s*\?\s*$|\bis\s+(?:that|this|it)\s+(?:true|right|correct)\b/.test(t);
  const belief = BELIEF.test(t) && !summary && !contextOnly && !askedSomethingElse && !(CONFUSED.test(t) || BARE_LOST.test(t));
  const myth = trueSaying ? undefined : MYTHS.find((m) => m.re.test(t));
  const judgedWrong = !!myth || (belief && i.state.understanding.wrong > 0);
  const studying = LEARN_CONTEXT.test(t);
  const support: 'more' | 'normal' = i.assist?.scaffold === 'steps' || i.assist?.scaffold === 'hint' ? 'more' : 'normal';
  const ledger = i.ledger ?? [];
  // being lost, answering, practising more: the subject is the thread's, not the few words of the message
  const followOn = confused || answering || kind === 'practice' || (gotIt && (note?.n === 'reframe' || note?.n === 'diagnose'));
  const topic0 = followOn && carried && (confused || t.split(' ').length <= 12) ? carried : own ?? (followOn || wrongNow || rightNow ? carried : null);
  // a direct turn that is not practice notes nothing
  const topic = topic0;
  const metBefore = topic ? ledger.find((e) => sameTopic(e.topic, topic)) : undefined;
  const learning =
    !i.state.sensitive &&
    !i.signals.offRecord &&
    (i.signals.learningGoal === true ||
      i.state.preferences.learning === true ||
      i.state.domain === 'learning' ||
      i.state.domain === 'math' ||
      work === 'practice' ||
      kind === 'practice' ||
      REVIEW.test(t) ||
      studying ||
      NOVICE_SAID.test(t) ||
      confused ||
      answering ||
      statesUnderstanding ||
      rightNow ||
      wrongNow ||
      !!metBefore ||
      (note ? note.n !== 'direct' && !!note.c : false));
  const forms: InlineKind[] = [];
  const fill: ExplainPlan['fill'] = support === 'more' ? { support } : {};
  const base = (need: ExplainNeed, direct: boolean, strategies: Strategy[], question: Strategy | null = null, due: string[] = []): ExplainPlan => {
    // a direct answer notes nothing — unless it is practice they asked to have built, which the ledger still hears about
    const noted = direct && kind !== 'practice' ? null : topic;
    return {
      need,
      strategies,
      level,
      complexity,
      ask: kind,
      topic: noted,
      direct,
      forms: [...new Set(forms)],
      question,
      due,
      learning: learning && !!noted,
      fill,
      topicFrom: noted ? (noted === own ? 'own' : 'carried') : null,
      reasons,
    };
  };

  // ── 1 RESTRAINT: a direct answer is better ──
  const asksSomethingEarly = /\?\s*$/.test(t) && t.split(' ').length >= 6;
  const substantive = kind !== 'other' || belief || !!myth || trueSaying || studying || confused || statesUnderstanding || wrongNow || rightNow || answering || (working && verify);
  // "got it" after being lost twice over: understanding claimed, not shown — one chance to say it back
  if (gotIt && reaction && (note?.n === 'reframe' || note?.n === 'diagnose') && i.questions > 0 && !i.signals.stopQuestions && !i.signals.frustration && learning) {
    reasons.push('feedback:claims-it');
    return base('feedback', false, ['teachback'], 'teachback');
  }
  if (reaction && !confused && !answering && !wrongNow && !rightNow) return (reasons.push('direct:reaction'), base('direct', true, []));
  if (x === 'social' || x === 'playful' || x === 'personal' || (x === 'conversation' && !substantive && !(asksSomethingEarly && !reaction))) return (reasons.push(`direct:talk:${x}`), base('direct', true, []));
  // a riddle they answer themselves, laughing: banter, not a why to explain
  if (JOKE_TOLD.test(t) && /\?\s*(?:because|'?cause|cos|coz|bc)\b/.test(t) && !studying) return (reasons.push('direct:talk:joke'), base('direct', true, []));
  // a feeling with no question in it: heard, not explained — even when it is about an exam
  if (FEELING.test(t) && !/\?/.test(t) && !wrongNow && !rightNow && !myth) return (reasons.push('direct:talk:feeling'), base('direct', true, []));
  // no question of any kind, no attempt, no belief: nothing for an explanation to do — but a question asked
  // mid-sentence ("…so why are groceries still…") or with a question mark is a question
  const asksSomething = /\?/.test(t) || /\b(?:why|how\s+(?:does|do|did|is|are|can|come|would)|what(?:'s|\s+(?:is|are|does|do|makes|happens))|which|explain|can\s+(?:i|you)|should\s+i|is\s+(?:it|that|this)\s+(?:true|right|correct))\b/.test(t);
  if (kind === 'other' && !substantive && !asksSomething) return (reasons.push('direct:nothing-asked'), base('direct', true, []));
  if (i.presentation.place === 'content' || i.state.intent !== 'conversation') return (reasons.push('direct:view'), base('direct', true, []));
  if (!myth && (work === 'creation' || work === 'execution' || work === 'research' || (work === 'reflection' && !substantive && !asksSomething))) return (reasons.push(`direct:work:${work}`), base('direct', true, ['insight']));
  if (HANDOVER.test(t)) return (reasons.push('direct:handover'), base('direct', true, ['insight']));
  const hurried = JUST_ANSWER.test(t) || HURRY.test(t) || i.signals.directness === 'answer' || i.signals.answersOnly || i.signals.urgent;
  // their own answer offered for checking ("so my average speed was 50 mph right?") is an attempt, worked or not
  // their own answer or working offered for checking is an attempt; a number inside someone else's claim is not
  const attempt = wrongNow || rightNow || (verify && working) || answering || statesUnderstanding || trueSaying;
  // a plain fact: one sentence answers it, and it is not a mechanism, a comparison, a claim or a method
  const factAsked = /^(?:when|what\s+(?:year|date|time|day)|who|where|how\s+(?:many|much|old|long|far|tall|big))\b|\b(?:in\s+)?what\s+(?:year|century|decade)\b|\bwhen\s+(?:did|was|is|were)\b/.test(strip(focusOf(raw).replace(LEAD, '')));
  const fact = (work === 'information' || factAsked) && complexity === 1 && !['compare', 'why', 'how', 'claim', 'solve', 'procedure', 'decide', 'practice', 'relate'].includes(kind);
  // an expert's question that a sentence answers — a value, a yes or no, a definition — is answered, not taught
  const expertOneLiner = level === 'expert' && !confused && (complexity === 1 || kind === 'other' || kind === 'what');
  // a fact is taught only to someone who says they are studying it — a domain read from one word ("pub quiz") is not that
  const studyingIt = i.signals.learningGoal === true || studying || NOVICE_SAID.test(t) || REVIEW.test(t) || !!metBefore;
  if (!attempt && (hurried || (fact && !studyingIt && !belief && !myth) || expertOneLiner)) {
    reasons.push(hurried ? 'direct:asked' : fact ? 'direct:fact' : 'direct:expert');
    return base('direct', true, ['insight']);
  }

  const mayDraw = !i.guard;
  const mayWork = !i.guard && !i.ownReasoning;
  const forms0 = i.presentation.forms;
  const mayAsk = i.questions > 0 && !i.signals.stopQuestions && i.signals.directness !== 'answer' && !i.signals.frustration;
  // never a second closing question while the last one waits unanswered
  const unanswered = !!note?.q && !answering;
  const due = dueTopics(ledger, i.now);
  const dueHere = topic ? due.filter((e) => !sameTopic(e.topic, topic)) : due;
  const terms = termsIn(focusOf(raw)).slice(0, 3);
  if (terms.length && level === 'novice') fill.terms = terms;
  const strategies: Strategy[] = [];
  let question = null as Strategy | null;
  const push = (s: Strategy, why: string) => {
    if (strategies.includes(s) || strategies.length >= 3) return;
    if (GROUPS.some((g) => g.includes(s) && g.some((o) => o !== s && strategies.includes(o)))) return;
    if (i.guard && s === 'worked') return;
    if (ASKING.has(s)) {
      // practice that mixes kinds can carry the recall of what is due: still one question
      const rides = s === 'interleave' && question === 'spaced';
      if ((question && !rides) || !mayAsk || (unanswered && s !== 'diagnose')) return;
      if (!rides) question = s;
    }
    strategies.push(s);
    reasons.push(`${s}:${why}`);
  };
  const close = (allowed: Strategy[]) => {
    for (const s of allowed) {
      if (question) return;
      push(s, 'close');
    }
  };

  // ── 2 FEEDBACK: they tried something ──
  if (attempt && !(belief && judgedWrong && !working)) {
    const procedure = ['solve', 'procedure'].includes(kind) || working || i.state.domain === 'math' || /\bsolve|equation|derivative|integral\b/.test(lc(prevUser));
    if (wrongNow) {
      push('error', did.wrong ? 'check-not-right' : 'refuted-step');
    } else if (rightNow) {
      reasons.push(did.right ? 'feedback:check-right' : 'feedback:verified');
      if (learning) {
        if ((i.assist?.selfExplain || before.has('worked')) && did.right) close(['selfexplain']);
        else if (procedure) close(['transfer']);
        else if (level !== 'novice') close(['elaborate']);
      }
    } else if (trueSaying) {
      reasons.push('feedback:true-belief');
    } else if (answering) {
      fill.answered = pendingQ;
      reasons.push(`feedback:answer:${pendingQ}`);
    } else if (statesUnderstanding) {
      reasons.push('feedback:says-it');
      // they said it in their words: a try on a near case tests whether it carries — never for someone who says they are still lost
      if (learning && procedure && !confused) close(['transfer']);
    } else {
      reasons.push('feedback:verify');
    }
    if (!strategies.length) strategies.push('insight');
    if (i.ownReasoning || i.guard) fill.theirs = true;
    return finish('feedback');
  }

  // ── 3 REFUTE: a belief that does not survive ──
  if (belief || myth) {
    if (judgedWrong) {
      // the sentence the myth was found in — never a question or someone else's correct rule around it
      const sentences = lc(raw).split(/(?<=[.!?])\s+|\n+/);
      const said = myth ? sentences.find((x) => myth.re.test(x)) : sentences.find((x) => BELIEF.test(x));
      if (said && !/\?\s*$/.test(said)) fill.belief = quoted(said, 12);
      push('misconception', myth ? 'known-myth' : 'refuted');
      // a belief about a quantity: commit to a prediction where something live can show it
      if (myth?.quantity && forms0.some((k) => k === 'sim' || k === 'graph' || k === 'slider')) close(['predict']);
      return finish('refute');
    }
    // a belief not judged either way: weighed on its evidence, never declared wrong
    reasons.push('belief:unjudged');
    push('argument', 'their-belief');
    return finish('explain');
  }

  // ── 4/5 REFRAME, DIAGNOSE: lost after an explanation ──
  if (confused && priorExplanation) {
    const secondTime = note?.n === 'reframe' || (!note && (CONFUSED.test(lc(prevUser)) || BARE_LOST.test(lc(prevUser))));
    if (secondTime && mayAsk) {
      push('diagnose', 'lost-twice');
      return finish('diagnose');
    }
    const asked = askKind(prevUser);
    const family: keyof typeof ROTATION = asked === 'solve' || asked === 'procedure' ? 'procedure' : asked === 'claim' ? 'claim' : asked === 'decide' || asked === 'compare' ? 'choice' : 'concept';
    const tried = new Set<Approach>([...before].map((s) => APPROACH_OF[s]).filter((a): a is Approach => !!a));
    for (const f of metBefore?.failed ?? []) tried.add(f);
    // a picture only where drawing is allowed; the rest are words
    const admissible = (a: Approach) => a !== 'picture' || mayDraw;
    const pick = ROTATION[family].find((a) => !tried.has(a) && admissible(a)) ?? ROTATION[family].find((a) => admissible(a) && !before.has(STRATEGY_OF[a])) ?? 'stepback';
    fill.approach = pick;
    if (family === 'procedure') fill.procedure = true;
    const lastTried = [...before].map((s) => APPROACH_OF[s]).find(Boolean);
    if (lastTried) {
      fill.tried = SAID_TRIED[lastTried];
      fill.lostAfter = lastTried;
    }
    reasons.push(`reframe:${pick}${lastTried ? `:after-${lastTried}` : ''}`);
    const s = pick === 'example' && family === 'procedure' && !mayWork ? 'faded' : STRATEGY_OF[pick];
    push(s, 'another-way');
    if (s === 'faded') fill.theirs = true;
    if (pick === 'example' && family === 'concept' && mayDraw && forms0.some((k) => VISUAL_FORMS.includes(k))) push('visual', 'drawn');
    return finish('reframe');
  }

  // ── 7 PRACTICE ──
  if (kind === 'practice') {
    const kinds = new Set(ledger.filter((e) => i.now - e.last < 30 * DAY).map((e) => e.topic));
    const review = REVIEW.test(t);
    if (dueHere.length && review) push('spaced', 'review-due');
    if (kinds.size >= 2 || review) push('interleave', 'mixed-practice');
    else push('transfer', 'one-to-try');
    if (!strategies.length) strategies.push('insight');
    return finish('practice', strategies.includes('spaced') ? dueHere.slice(0, 2).map((e) => e.topic) : []);
  }

  // ── 6 EXPLAIN: a first explanation, by the kind of question ──
  if (simpler || level === 'expert') reasons.push(simpler ? 'insight:simpler' : 'insight:expert');
  if (kind === 'compare' || forms0.includes('compare')) push('compare', 'asked');
  const namedOptions = /\b(?:or|vs\.?|versus)\b/.test(focusOf(raw)) || /\bbetween\s+.+\s+and\b/.test(t);
  if (forms0.includes('decide') || (kind === 'decide' && (namedOptions || work === 'judgment'))) push('tradeoffs', i.ownJudgment ? 'theirs' : 'asked');
  if (kind === 'claim' || forms0.includes('claim')) push('argument', 'claim');
  if (kind === 'relate' || forms0.includes('concepts')) push('conceptmap', 'relations');
  if (kind === 'solve' || kind === 'procedure') {
    const fadeLevel = metBefore?.fade ?? 0;
    if (mayWork && !rightNow && !before.has('worked') && fadeLevel === 0) push('worked', 'example');
    else {
      const nextStep = before.has('worked') && /\bnext\s+step|what\s+(?:do\s+i\s+do|comes)\s+(?:next|after)|\bthen\s+what\b/.test(t);
      push('faded', !mayWork ? 'theirs-to-finish' : nextStep ? 'next-step' : before.has('worked') ? 'after-example' : `fade:${fadeLevel}`);
      fill.theirs = !mayWork;
    }
  }
  if (kind === 'why') {
    if (/\b(?:war|wars|revolution|empire|dynasty|recession|depression|crisis|crash|famine|uprising|rebellion|election|independence|reformation|renaissance|great\s+leap|cold\s+war|civil\s+rights|industrial\s+revolution|the\s+fall\s+of|collapse\s+of\s+(?:the\s+)?[a-z]+\s+(?:empire|union|republic|kingdom|economy))\b/.test(t)) fill.manyCauses = true;
    push('causal', fill.manyCauses ? 'interacting-causes' : 'why');
  }
  if (kind === 'how') push('causal', 'mechanism');
  // a picture where one is drawn: words that point into it
  if (mayDraw && forms0.some((k) => VISUAL_FORMS.includes(k)) && (kind === 'how' || kind === 'why' || kind === 'relate' || kind === 'what')) push('visual', 'drawn');
  // how much they know
  if (level === 'novice' && (kind === 'what' || kind === 'how' || kind === 'why') && !before.has('analogy')) push('analogy', 'novice');
  if (level === 'novice' && terms.length >= 2 && complexity >= 2 && kind !== 'solve') push('pretrain', 'new-terms');
  if (i.length !== 'detailed' && i.length !== 'concise' && (complexity === 3 || (level === 'novice' && complexity >= 2 && support === 'more'))) push('segmented', complexity === 3 ? 'complex' : 'novice');
  if (!strategies.length || (strategies.length < 2 && !strategies.includes('insight') && level !== 'expert' && kind !== 'solve' && kind !== 'procedure')) strategies.unshift('insight');

  // the most an explanation carries for an expert: one move, and no closing question added after it
  if (level === 'expert') strategies.splice(1);
  // at most one closing move, on learning turns, never while a question waits
  if (learning && mayAsk && !unanswered && level !== 'expert') {
    if (i.assist?.retrieval) push('retrieval', 'resumed');
    else if (metBefore && i.now - metBefore.last >= DAY && i.history.length <= 2) push('retrieval', 'met-before');
    else if ((kind === 'solve' || kind === 'procedure') && strategies.includes('worked') && mayWork) push('transfer', 'one-like-it');
    else if (dueHere.length && complexity <= 2 && kind !== 'decide') push('spaced', 'due');
  }
  // one sentence that carries it beyond this case: the reusable rule, applied once more — on learning turns with parts
  const stops = i.presentation.shape === 'understand' && !i.presentation.depth;
  if (learning && level !== 'expert' && i.length !== 'concise' && complexity >= 2 && ['why', 'how', 'relate', 'solve', 'procedure'].includes(kind) && !simpler && !stops && !factAsked && !/\bquick\b/.test(t)) {
    fill.transfer = true;
    reasons.push('transfer-hook');
  }
  return finish('explain', question === 'spaced' ? dueHere.slice(0, 2).map((e) => e.topic) : []);

  function finish(need: ExplainNeed, dueList: string[] = []): ExplainPlan {
    // the forms the moves carry their work in, where the turn allows drawing (the planner decides what fits)
    for (const s of strategies) {
      if (s === 'argument' && reasons.includes('belief:unjudged')) continue;
      for (const k of FORMS[s] ?? []) {
        if (!mayDraw && k !== 'paths') continue;
        if (k === 'steps' && !mayWork) continue;
        if (k === 'diagram' && !forms0.includes('diagram') && (!((kind === 'how' && complexity >= 2) || (kind === 'why' && complexity === 3 && !fill.manyCauses) || need === 'reframe') || forms0.some((f) => f === 'sequence' || f === 'steps' || f === 'graph' || f === 'sim' || f === 'concepts' || f === 'slider'))) continue;
        if (k === 'check' && !(i.questions > 0)) continue;
        forms.push(k);
        break;
      }
    }
    // a picture is pointed into only where one is drawn
    if (strategies.includes('visual') && !forms.includes('diagram') && !forms0.some((k) => VISUAL_FORMS.includes(k))) {
      strategies.splice(strategies.indexOf('visual'), 1);
      reasons.push('visual:nothing-drawn');
      if (need === 'reframe' && !strategies.length) {
        fill.approach = 'analogy' === fill.approach ? 'stepback' : before.has('analogy') ? 'stepback' : 'analogy';
        strategies.push(STRATEGY_OF[fill.approach]);
      }
      if (!strategies.length) strategies.push('insight');
    }
    return base(need, false, strategies.slice(0, 3), question, dueList);
  }
}

// ── folding into the presentation ─────────────────────────────────────

const LIVE: readonly InlineKind[] = ['graph', 'sim', 'slider', 'decide', 'steps', 'claim'];

/**
 * Whether the planner's own rules admit a form the moves ask for: a decision needs named options and a choice
 * that is theirs, the working needs mathematics to work, nothing is drawn under the guard, and nothing that
 * shows an answer sits beside a live element asking them to predict it.
 */
export function admits(p: Presentation, k: InlineKind, plan: ExplainPlan): boolean {
  if (p.guard && k !== 'paths') return false;
  if (k === 'decide') return plan.strategies.includes('tradeoffs') && plan.ask === 'decide';
  if (k === 'steps') return !!p.math && !p.stepsFaded;
  // nothing that shows the answer beside a live element asking them to predict it
  if ((k === 'diagram' || k === 'compare') && plan.question === 'predict' && p.forms.some((f) => f === 'graph' || f === 'sim' || f === 'slider')) return false;
  return true;
}

/**
 * The moves' forms merged into the turn's presentation by the planner's own rules: two elements at most, one
 * live element, nothing drawn under the guard, a write-up untouched. Only what the planner admits becomes the
 * form that fits.
 */
export function applyExplanation(p: Presentation, plan: ExplainPlan): Presentation {
  if (plan.direct || p.place === 'content') return p;
  const forms = [...p.forms];
  const strong = [...(p.strong ?? [])];
  const reasons = [...p.reasons];
  for (const k of plan.forms) {
    if (forms.includes(k)) {
      if (!strong.includes(k) && k !== 'paths' && admits(p, k, plan)) strong.push(k);
      continue;
    }
    if (!admits(p, k, plan)) {
      reasons.push(`explain:refused:${k}`);
      continue;
    }
    if (forms.length >= 2) {
      // a way onward gives its place to what explains
      const pi = forms.indexOf('paths');
      if (pi >= 0 && k !== 'paths') forms.splice(pi, 1);
      else continue;
    }
    if (LIVE.includes(k) && forms.some((f) => LIVE.includes(f))) continue;
    forms.push(k);
    if (k !== 'paths') strong.push(k);
    reasons.push(`explain:${k}`);
  }
  const diagram = forms.includes('diagram') && !p.diagram ? (plan.ask === 'why' ? 'causes' : 'flow') : p.diagram;
  return {
    ...p,
    forms,
    reasons,
    ...(strong.filter((k) => forms.includes(k)).length ? { strong: [...new Set(strong.filter((k) => forms.includes(k)))] } : {}),
    ...(diagram ? { diagram } : {}),
  };
}

// ── what the reply is told ────────────────────────────────────────────
//
// One short block, said as what to do — the behaviour, never its name — filled
// with this turn's facts, and never against the shape: the central idea first
// is the shape's (and the core's) to say, so it is never said here; a picture is
// pointed into only when it is the form that fits; nothing for a direct answer.

export interface GuidanceContext {
  /** what Logos 4's move already says this turn (not said twice) */
  said?: { retrieval?: boolean; selfExplain?: boolean };
}

const APPROACH_LINE: Record<Approach, (procedure: boolean, theirs: boolean) => string> = {
  example: (procedure, theirs) =>
    procedure
      ? theirs
        ? 'name the kind of problem and the method, then give only the next single step and let them take it'
        : 'work one close example completely, each step with its reason'
      : 'one concrete instance — a real case or real numbers — worked through before any general statement',
  picture: () => 'a picture that carries the structure, your words pointing to its parts by name',
  analogy: () => 'one everyday analogy with the same structure, then say in a clause where it stops holding',
  contrast: () => 'set it beside a near case where it does not hold, and name the one difference that matters',
  stepback: () => 'step back to the idea it rests on — say that in plain words first, then come back up to their question',
};

function lineFor(s: Strategy, plan: ExplainPlan, p: Presentation | null): string | null {
  const strong = (k: InlineKind) => !!p?.strong?.includes(k) && p.forms.includes(k);
  const drawn = p?.forms.find((k) => VISUAL_FORMS.includes(k) && strong(k));
  const theirs = !!plan.fill.theirs || !!p?.guard;
  switch (s) {
    case 'insight':
      return null;
    case 'analogy':
      return 'Give one everyday analogy with the same structure, then say in a clause where it stops holding.';
    case 'compare':
      return strong('compare') ? null : 'Set them side by side on the few features that actually differ, and say what follows from the difference.';
    case 'worked':
      return plan.ask === 'solve' || plan.ask === 'procedure'
        ? `Work one complete example${/\d/.test(plan.topic ?? '') ? ' with their numbers' : ', with their numbers if they gave any'}, each step with its reason.`
        : 'Work one concrete instance through — a real case or real numbers — before any general statement.';
    case 'faded':
      if (plan.reasons.includes('faded:next-step')) return 'Give only the next step, with its reason — not the steps already shown — and leave the one after it to them.';
      if (p?.stepsFaded) return 'Show the first steps of their own problem with their reasons; the step that finishes it goes in the working\'s "check", never as a line.';
      return theirs
        ? 'Name the kind of problem and the method in a line; then give only the next single step and let them take it — the rest stays theirs.'
        : 'Show the first steps with their reasons, then leave the last step for them, saying what it needs.';
    case 'segmented':
      return 'Give only the first part, in a few sentences; offer the next parts as ways onward rather than writing them.';
    case 'pretrain':
      return plan.fill.terms?.length ? `Before the mechanism, say what ${plan.fill.terms.map((x) => `“${x}”`).join(', ')} mean${plan.fill.terms.length === 1 ? 's' : ''}, a few plain words each.` : 'Before the mechanism, name the two or three terms it uses, each in a few plain words.';
    case 'visual':
      return drawn ? `Let the ${drawn === 'diagram' ? 'picture' : 'element'} carry the structure; your words point to its parts by name, not describe it again.` : null;
    case 'conceptmap':
      return strong('concepts') ? null : 'Lay out how the ideas relate, each with its link to the others; the parts first, detail on demand.';
    case 'causal':
      if (strong('diagram')) return 'The picture carries the chain: in words, name only the link that surprises.';
      return plan.fill.manyCauses
        ? 'Give the main causes and how they fed each other — not one forced chain, and say which mattered most where historians agree.'
        : 'Give the chain of causes in order, each link with why it leads to the next.';
    case 'misconception':
      return `They believe ${plan.fill.belief ? `“${plan.fill.belief}”` : 'something that is not so'}. Say plainly, first, that it is not so; then why it is tempting, the one fact it cannot survive, and the accurate picture in its place.`;
    case 'error':
      if (plan.reasons.includes('error:check-not-right'))
        return theirs
          ? 'Their answer was not right: say so plainly and point to the idea it missed — never the answer itself.'
          : 'Their answer was not right: say so plainly, give the right one, and the one idea that gets there.';
      return theirs
        ? 'Their working has a slip: point to the first place it goes wrong and why it seemed right — never the corrected answer; the repair is theirs.'
        : 'Their working has a slip: point to the first place it goes wrong, say why it seemed right, and give the rule that fixes it — do not redo the rest for them.';
    case 'elaborate':
      return 'If it fits, end by asking once why that holds — only about something they can reason out from what they did, never a fact they were not given.';
    case 'selfexplain':
      return 'Confirm the step in a sentence, then ask them, once, why it works.';
    case 'retrieval':
      return `Answer what they asked first; then, in one short question, have them recall ${plan.topic ? `what they met before about “${plan.topic}”` : 'the key idea from before'}.`;
    case 'spaced':
      return plan.strategies.includes('interleave')
        ? `Bring back ${plan.due.length ? plan.due.map((d) => `“${d}”`).join(' and ') : 'what they met before'} in the practice: one question, mixed with today's.`
        : `After the answer, close with one quick recall of ${plan.due.length ? `“${plan.due[0]}”` : 'what they met before'}, a single question.`;
    case 'interleave':
      return 'Mix the kinds of problem rather than repeating one; ask which method fits before solving.';
    case 'teachback':
      return 'End by asking them, once, to say it back in a sentence or two, as if to a friend.';
    case 'argument':
      return strong('claim') ? null : plan.need === 'explain' && plan.reasons.includes('belief:unjudged') ? 'Weigh what they were told on its evidence: what it rests on, what speaks against it, and how sure anyone can be — say plainly where it holds and where it does not.' : 'Lay out the claim, the reasons it rests on, the strongest objection, and the assumption it all depends on.';
    case 'tradeoffs':
      return strong('decide') ? null : `Weigh the options on the criteria that matter to them; ${plan.reasons.includes('tradeoffs:theirs') ? 'the call stays theirs' : 'end on what would tip it'}.`;
    case 'transfer':
      return p?.forms.includes('steps') ? 'Put one problem like it, different on the surface, in the working\'s "check" for them to try.' : 'End with one problem like it, different on the surface, for them to try — as a check element if its answer is a number.';
    case 'predict':
      return 'Before the answer is shown, have them commit to a prediction — in the element\'s "predict" if it has one.';
    case 'diagnose':
      return 'They are lost a second time: do not explain again yet. Ask one short question that finds where it breaks — two named places from what you explained ("is it A, or B?") — and nothing else.';
  }
}

/** The opening line of the block: what the turn needs, with its facts. */
function needLine(plan: ExplainPlan, p: Presentation | null): string | null {
  const theirs = !!plan.fill.theirs || !!p?.guard;
  switch (plan.need) {
    case 'feedback':
      if (plan.strategies.includes('error')) return null;
      if (plan.reasons.includes('feedback:claims-it')) return 'They say it makes sense now: acknowledge it in a few words — no more explanation.';
      if (plan.fill.answered)
        return `They answered your question. Respond to their answer first: say in a clause what in it holds; if part of it is wrong or missing, name that part and why${theirs ? ' — never the answer itself' : ''}. Then build only on that.`;
      if (plan.reasons.includes('feedback:true-belief')) return 'What they say is right — the common belief is the wrong one. Confirm it plainly first, then add the one detail that shows why the myth took hold or what is actually going on.';
      if (plan.reasons.includes('feedback:says-it')) return 'They put it in their own words. Say first whether it holds: confirm what is right, and if any part is wrong, say so plainly and give the accurate picture of that part — without re-explaining what they already have.';
      if (plan.reasons.some((r) => r.startsWith('feedback:check-right') || r === 'feedback:verified')) return 'They got it right. Say so in a few words and name what made it right; do not re-explain what they already showed.';
      return `Check what they wrote and say plainly what holds and what does not; if something is wrong, name the first place it goes wrong${theirs ? ' and let them repair it' : ' and help them repair that step'} — never replace their work with a clean solution.`;
    case 'reframe': {
      const a = plan.fill.approach ?? 'stepback';
      return `They are still lost${plan.fill.tried ? ` after ${plan.fill.tried}` : ''}: do not repeat it or say the same thing at greater length. Come at it another way — ${APPROACH_LINE[a](!!plan.fill.procedure, theirs || plan.strategies.includes('faded'))}. Shorter than last time.`;
    }
    default:
      return null;
  }
}

/**
 * The turn's guidance block: the need with its facts, then the moves the shape does not already say, then who
 * they are. '' for a direct answer, or when nothing would be said that the core and the shape do not say already.
 */
export function renderTurnGuidance(plan: ExplainPlan | null, p: Presentation | null = null, ctx: GuidanceContext = {}): string {
  if (!plan || plan.direct) return '';
  const said = ctx.said ?? {};
  const lines: string[] = [];
  const head = needLine(plan, p);
  if (head) lines.push(head);
  for (const s of plan.strategies) {
    if (plan.need === 'reframe' && (s === STRATEGY_OF[plan.fill.approach ?? 'stepback'] || (s === 'faded' && plan.fill.approach === 'example'))) continue;
    if ((s === 'retrieval' && said.retrieval) || (s === 'selfexplain' && said.selfExplain)) continue;
    const l = lineFor(s, plan, p);
    if (l) lines.push(l);
  }
  if (plan.fill.transfer && !plan.question) lines.push('Before you stop, one sentence that carries it beyond this case: the general rule it is an instance of, applied to one different example.');
  if (plan.fill.support === 'more' && plan.need !== 'diagnose' && plan.level !== 'expert') lines.push('Smaller steps than usual, one idea at a time.');
  if (!lines.length) return '';
  const who = plan.level === 'novice' ? 'They are new to this: plain words, no unexplained terms.' : plan.level === 'expert' ? 'They know the field: skip the basics.' : '';
  return `\n\nHOW TO MAKE IT UNDERSTOOD${who ? ` — ${who}` : ''}\n${lines.map((l) => `- ${l}`).join('\n')}\n`;
}

/** The block without a presentation to read against (kept for callers and tests that have none). */
export function renderExplanation(plan: ExplainPlan | null, said: { retrieval?: boolean; selfExplain?: boolean } = {}): string {
  return renderTurnGuidance(plan, null, { said });
}

/** Content-free, for the response header and the trace. */
export function explainTrace(plan: ExplainPlan | null): string {
  if (!plan) return 'off';
  return [
    plan.direct ? 'direct' : plan.strategies.join('+') || 'none',
    plan.level,
    `c${plan.complexity}`,
    plan.ask,
    `n=${plan.need}`,
    ...(plan.question ? [`q=${plan.question}`] : []),
    ...(plan.fill.approach ? [`a=${plan.fill.approach}`] : []),
    ...(plan.learning ? ['learn'] : []),
  ].join(';');
}

// ── what the reply carried ────────────────────────────────────────────

/**
 * Whether a reply carries the surface cue of each move, read from its text and elements. A CUE, not proof the
 * move was done well: for the content-free trace and the tests, never a claim about understanding.
 */
export function cueCheck(reply: string, plan: ExplainPlan): Partial<Record<Strategy, boolean>> {
  const prose = reply.replace(/```[\s\S]*?```/g, ' ').trim();
  const has = (type: string) => new RegExp('```ui\\s*\\n\\s*\\{"type":"' + type + '"').test(reply);
  const first = prose.split(/(?<=[.!?])\s/)[0] ?? '';
  const endsAsking = /\?\s*(?:\*\*)?\s*$/.test(prose);
  const out: Partial<Record<Strategy, boolean>> = {};
  for (const s of plan.strategies) {
    out[s] = (() => {
      switch (s) {
        case 'insight':
          return first.trim().length > 0 && first.split(/\s+/).length <= 25;
        case 'analogy':
          return /\b(?:like\s+(?:a|an|the)|think\s+of|imagine|as\s+if|works\s+like|is\s+like|picture\s+(?:a|an))\b/i.test(prose);
        case 'compare':
          return has('compare') || /\|.*\|/.test(prose) || /\bwhereas\b|\bwhile\b.*\b(?:instead|but)\b|\bunlike\b/i.test(prose);
        case 'worked':
          return has('steps') || (prose.match(/^\s*(?:\d+[.)]|step\s+\d)/gim) ?? []).length >= 2 || /\bfor\s+example\b|\bsay\s+(?:you|we)\s+have\b|\btake\s+(?:a|an)\b/i.test(prose);
        case 'faded':
          return /\b(?:your\s+turn|over\s+to\s+you|now\s+you|you\s+finish|last\s+step\s+is\s+yours|try\s+the\s+(?:last|next)|what\s+do\s+you\s+get)\b|_{3,}|\?\s*$/i.test(prose) || /"check"\s*:\s*\{/.test(reply);
        case 'segmented':
          return prose.split(/\s+/).length <= 180 && has('paths');
        case 'pretrain':
          return /\b(?:means|is\s+the\s+name\s+for|refers\s+to|is\s+just\s+(?:a|the))\b/i.test(prose.slice(0, 500));
        case 'visual':
          return has('diagram') || has('graph') || has('sim') || has('concepts') || has('sequence');
        case 'conceptmap':
          return has('concepts') || has('diagram') || /→|->/.test(prose);
        case 'causal':
          return has('diagram') || /→|->|\bwhich\s+(?:causes|leads\s+to|means)\b|\bso\b.*\bso\b|\bbecause\b/i.test(prose);
        case 'misconception':
          return /\b(?:not\s+(?:so|true|quite|really)|isn'?t\s+(?:so|true|right)|no[,.]|myth|tempting|actually|in\s+fact|it\s+(?:looks|seems)\s+like)\b/i.test(prose);
        case 'error':
          return /\b(?:step|line|where|slip|went\s+wrong|instead\s+of|should\s+be|mistake)\b/i.test(prose);
        case 'elaborate':
        case 'selfexplain':
        case 'retrieval':
        case 'spaced':
        case 'teachback':
        case 'diagnose':
          return endsAsking || has('check');
        case 'transfer':
        case 'interleave':
          return has('check') || /"check"\s*:\s*\{/.test(reply) || /\b(?:try|your\s+turn|which\s+(?:method|approach|rule))\b/i.test(prose);
        case 'predict':
          return /"predict"\s*:\s*\{/.test(reply) || /\bpredict|\bguess|\bwhat\s+do\s+you\s+(?:think|expect)\b/i.test(prose);
        case 'argument':
          return has('claim') || (/\bbecause\b|\brests\s+on\b|\bassum|\bevidence\b/i.test(prose) && /\bobjection|\bbut\b|\bhowever\b/i.test(prose));
        case 'tradeoffs':
          return has('decide') || has('compare') || /\btrade-?off|\bon\s+the\s+other\s+hand\b|\bif\s+.+\bmatters\b|\bdepends\s+on\b/i.test(prose);
      }
    })();
  }
  return out;
}

/** The earlier name: a cue check, for the tests that know it so. */
export const checkExplanation = cueCheck;
