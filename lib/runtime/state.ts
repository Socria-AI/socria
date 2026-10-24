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
import type { Intent } from './orchestrate';

export const DOMAINS = ['business', 'research', 'engineering', 'writing', 'learning', 'creative', 'math', 'everyday'] as const;
export type Domain = (typeof DOMAINS)[number];

/** Words that place a conversation, weighed together — one word decides nothing. */
const DOMAIN_WORDS: Record<Exclude<Domain, 'everyday'>, RegExp> = {
  business:
    /\b(?:revenue|customers?|clients?|pricing|market(?:ing)?|sales|startup|investors?|funding|roi|kpis?|margins?|profit|competitors?|stakeholders?|budget|hiring|okrs?|b2b|saas|churn|go[- ]to[- ]market|business|company|quarter(?:ly)?|forecast)\b/gi,
  research:
    /\b(?:research|stud(?:y|ies) (?:found|shows?|suggests?)|papers?|literature|journal|hypothes[ie]s|evidence|sources?|citations?|methodology|dataset|data set|survey|experiment|findings|peer[- ]review(?:ed)?|meta-analysis|sample size|confound\w*)\b/gi,
  engineering:
    /\b(?:code|coding|bug|debug\w*|error|exception|stack ?trace|api|endpoint|function|compile\w*|deploy\w*|database|sql|query|server|frontend|backend|react|python|javascript|typescript|java|rust|golang|docker|kubernetes|algorithm|latency|refactor\w*|repo|git|circuit|cad|tolerance|beam|torque|voltage)\b/gi,
  writing:
    /\b(?:essay|draft|paragraph|thesis statement|chapter|outline|cover letter|personal statement|blog post|article|proofread\w*|rewrite|prose|wording|my sentence|introduction|conclusion|word count)\b/gi,
  learning:
    /\b(?:exam|quiz|homework|assignment|class|course|lecture|syllabus|studying|study for|learn\w*|understand\w*|revision|tutor|professor|teacher|semester|midterm|finals?)\b/gi,
  creative:
    /\b(?:story|stories|novel|poem|poetry|characters?|screenplay|song|lyrics|worldbuilding|brainstorm\w*|creative|game idea|name ideas|plot twist|fiction)\b/gi,
  math:
    /\b(?:derivative|integral|equation|solve for|matri(?:x|ces)|eigen\w*|probabilit\w*|theorem|proof|limit|calculus|algebra|geometry|statistics|regression|variance|polynomial|logarithm)\b|[∫∑√]|\b[a-z]\s*\^\s*\d/gi,
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
  return texts.some((t) => re.test(t) || /\$[^$\n]{1,80}\$|\\(?:frac|int|sum|sqrt)\b/.test(t));
}

const PROBLEM = /\b(?:solve|prove|derive|integrate|differentiate|factor|simplify|show that|work (?:out|through)|my (?:homework|assignment|problem set))\b/i;
/** Their own thing is broken — code, a build, a device, a formula — not a broken thing mentioned in passing. */
const DIAGNOSIS = /\b(?:bug|stack ?trace|exception|traceback|segfault|crash(?:es|ed|ing)?|throws?|(?:my|the|this) (?:code|script|program|app|build|test|tests|query|formula|function|setup|config)\b[^.?!]{0,40}\b(?:broken|fails?|failing|doesn'?t work|isn'?t working|not working|errors?)|(?:it|this) (?:doesn'?t|won'?t|isn'?t) (?:work|working|compile|run|load)|why (?:won'?t|doesn'?t|isn'?t) (?:it|this|my))\b/i;
const RESEARCH = /\b(?:find (?:me )?(?:sources|studies|papers|evidence)|look (?:it |this )?up|research (?:this|the|how|whether)|what does the (?:research|evidence|literature) say|is there (?:evidence|research))\b/i;
const EXECUTION = /\b(?:convert|format|reformat|translate|summari[sz]e|rewrite|proofread|calculate|compute|sort|rename|fix (?:this|my|the)|clean up|tighten|shorten)\b/i;
/** A request that opens with what to do: the work is the doing. */
const LEADS_WITH_DOING = /^(?:(?:can|could|would) you |please |pls |now )?(?:write|draft|compose|create|generate|make|design|come up with|translate|convert|format|reformat|summari[sz]e|rewrite|proofread|tighten|shorten|calculate|compute)\b/i;
const CREATION = /\b(?:write|draft|compose|create|generate|make|invent|come up with|design|name)\b[^.?!]{0,60}\b(?:story|essay|e-?mail|post|article|letter|message|script|poem|speech|pitch|proposal|outline|plan|bio|resume|cv|cover letter|slides?|report|memo|ideas?|names?|titles?|lyrics|song|code|function|app|program)\b/i;

/** What they want done this turn, read deterministically — Core 4's `work`, without the model call. */
export function readWork(text: string, signals: ExplicitSignals, intent: Intent, checkedWork: boolean): WorkKind {
  const t = text.trim();
  if (!t) return 'conversation';
  if (signals.vent) return 'reflection';
  if (checkedWork || offersWork(t)) return 'verification';
  if (LEADS_WITH_DOING.test(t)) return CREATION.test(t) ? 'creation' : 'execution';
  if (DIAGNOSIS.test(t)) return 'diagnosis';
  if (intent === 'visual' || intent === 'structure') return 'execution';
  if (signals.practiceIntent || (PROBLEM.test(t) && signals.learningGoal !== false)) return 'practice';
  if (asksForDecision(t, signals)) return 'judgment';
  if (RESEARCH.test(t)) return 'research';
  if (wantsExplanation(t, signals)) return 'explanation';
  if (isFactQuestion(t) || /^(?:what|which|who|whom|whose|when|where)\b[^?]{0,160}\?\s*$/i.test(t)) return 'information';
  if (CREATION.test(t)) return 'creation';
  if (EXECUTION.test(t)) return 'execution';
  if (t.length < 25 && !t.includes('?')) return 'conversation';
  return 'reflection';
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
  return {
    objective: line(i.building || first, 140),
    intent: i.intent,
    domain: readDomain(userTexts, i.map?.context ?? null),
    work: readWork(i.text, s, i.intent, checked.length > 0),
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
