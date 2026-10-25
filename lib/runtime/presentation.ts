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
// NEVER FORCED. Small talk, joking and something personal are plain text. A
// thing to be built opens in Artifacts (rule C) and structure in the Logic Map
// (rule D); this never competes with them. At most two forms are offered, and a
// form the last two replies both used is not offered a third time running.
//
// Pure. No model, no network, no clock.

import { numbersIn, type InlineKind } from '../inline-ui';
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
/** Events in time, where the order is the point. */
const TIMELINE_ASK = /\b(?:timeline|chronolog(?:y|ical)|sequence of events|key (?:events|dates|moments|milestones)|what happened (?:in|during|between|when|after|before)|how (?:did|has|have) [\w\s-]{2,40} (?:evolved?|developed?|changed?|unfold(?:ed)?) over time)\b/i;
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

  // a list of their own amounts, with names: a small chart says it at a glance
  if (namedAmounts(t) >= 3 && nums.length <= 24) offer('chart', 'chart:their-numbers');
  // options set against each other
  if (COMPARE_ASK.test(t) && (VERSUS.test(t) || /\band\b/i.test(t)) && work !== 'creation') offer('compare', 'compare:options');
  // a quantity that moves with something they can vary
  if (!i.guard && ((WHAT_IF.test(t) && nums.length >= 1) || (FORMULA.test(t) && /\b(?:change|vary|depends?|how does|what happens)\b/i.test(t)))) offer('slider', 'slider:what-if');
  // practical writing they handed over: editable in place
  if (work === 'creation' && PRACTICAL_TEXT.test(t) && !i.ownWriting) offer('draft', 'draft:practical-writing');
  // an open request: a few directions to tap instead of typing — a question, so only where one may go
  if (i.questions > 0 && words(t) <= 8 && OPEN_ASK.test(t) && !t.includes('?')) offer('options', 'options:open-request');
  // A list asked for is a list; and under the guard, nothing laid out to read instead of working it.
  const listAsked = LIST_ASK.test(t);
  // the parts of a subject, to explore one at a time — an overview, not a list of terms and definitions
  if (!i.guard && !listAsked && x.kind !== 'brainstorm' && !NOT_READING.has(work) && (OVERVIEW.test(t) || FIELD.test(t))) offer('concepts', 'concepts:overview');
  // events whose order is the point (not under the guard: the gate would drop it, lib/inline-ui.ts)
  if (!i.guard && !listAsked && TIMELINE_ASK.test(t)) offer('sequence', 'sequence:timeline');
  // steps to follow — never the steps of something that is theirs to work out
  else if (!i.guard && !listAsked && !i.ownReasoning && work !== 'creation' && STEPS_ASK.test(t)) offer('sequence', 'sequence:steps');
  // a check, or a call Socria may weigh in on: the answer up top, the steps folded under it. Not an
  // explanation — prose is the explanation — and never reasoning that is theirs to do or a decision
  // that is theirs to make
  // A comparison already lays the reasoning out, and a quick call ("what tip should I leave?") needs none.
  const call = work === 'judgment' && !i.ownJudgment && words(t) >= 10 && !offered.includes('compare');
  if (!i.guard && !i.ownReasoning && ((work === 'verification' && words(t) >= 6) || call) && x.kind !== 'brainstorm') offer('reasoning', 'reasoning:steps');

  // not the same form a third time running
  const recent = usedRecently(i.history);
  const forms = offered.filter((k) => !(recent.length === 2 && recent.every((r) => r.includes(k))));
  if (forms.length < offered.length) reasons.push('repeat-held');
  return { forms, reasons: reasons.length ? reasons : ['nothing-fits'] };
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
};

/** The turn's offer, or '' when nothing is offered — which is most turns. */
export function renderPresentation(p: Presentation): string {
  if (!p.forms.length) return '';
  return `\n\nINLINE, IF IT HELPS — optional; plain prose is often better. You may include ${p.forms.length === 1 ? 'this' : 'one or both of these'}, each as a fenced block on its own lines (\`\`\`ui, the JSON on one line, \`\`\`), and keep the words around it short:\n${p.forms.map((k) => `- ${GRAMMAR[k]}`).join('\n')}\n`;
}

/**
 * The ceiling a reply needs when an element may be in it: a cut-off spec is
 * dropped whole. A draft and an overview (several parts, each with a few
 * sentences to open) need the most; steps a little more than a chart. A
 * ceiling, not a cost: nothing is spent that the reply does not write.
 */
export function presentationRoom(p: Presentation): number {
  if (!p.forms.length) return 0;
  if (p.forms.includes('draft') || p.forms.includes('concepts')) return 700;
  return p.forms.includes('sequence') ? 450 : 350;
}
