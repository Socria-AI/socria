// lib/runtime/asks.ts — WHAT A TURN IS ASKING FOR, BY ITS SHAPE.
//
// The readers the turn's work (state.ts readWork) and its presentation
// (presentation.ts planPresentation) both need, kept in one place so the two
// can never disagree about what a message is.
//
// WHY THESE EXIST (November 2026). An audit of fifty-nine real phrasings found
// that twenty-six reached the reply with nothing to say about their shape:
// "TCP vs UDP" was too short to be a question, "How do I hire my first sales
// rep?" was read as idle reflection, "causes of inflation" as talk. With no
// reading, nothing was offered and nothing was shaped, and the only rule in
// force was the core's — so the reply fell back on its habit: a paragraph
// each, then a list of bolded terms. These readers give those turns a reading:
// a comparison of named things, practical advice, the parts of something
// (a cycle, a hierarchy, causes, types), one subject's two sides.
//
// PRECISION OVER RECALL. A miss leaves the turn as it was — prose, which is
// never wrong. A false positive puts a table in front of somebody who said
// "tea or coffee?", so every reader here needs the shape of a request, never
// a bare noun: "cycle" alone is not the water cycle ("my sleep cycle is a mess
// lately"), "better" alone is not a comparison ("I'm feeling better today").
//
// Pure. No imports: lib/runtime/state.ts and lib/runtime/presentation.ts both
// read these.

const clean = (t: string) => t.replace(/```[\s\S]*?```/g, ' ').replace(/^\s*>.*$/gm, ' ').replace(/\s+/g, ' ').trim();

/** "or" that offers no second option: "or not", "or so", "or something". */
const OR_NOTHING = String.raw`(?:not|no|nah|nope|what|so|anything|something|whatever|else|maybe|never|neither|bad|wrong|false|less|later|worse|lose|die)\b`;

/** Two things set against each other, in so many words: "vs", "versus", "compared to", "X or Y". */
export const VERSUS = new RegExp(String.raw`\b(?:vs\.?|versus|compared?\s+(?:to|with)|or\s+(?!${OR_NOTHING})(?:the\s+|a\s+|an\s+)?[A-Za-z0-9])`, 'i');

/** "TCP vs UDP", "mitosis versus meiosis?" — the whole message is the two things. */
const BARE_VS = /^\s*[\w .+#/&'’()-]{1,40}?\s+(?:vs\.?|versus)\s+[\w .+#/&'’()-]{1,40}?\s*\??\s*$/i;
/**
 * "Postgres or MongoDB for a chat app?", "Roth IRA or traditional IRA if I'm
 * 25?" — two named options and what they are for. The context ("for", "if",
 * "when") is what makes it a comparison: "tea or coffee?" is small talk, and
 * "should I bring an umbrella or not?" offers no second option.
 */
const OR_FOR = new RegExp(
  String.raw`^\s*(?:(?:should\s+(?:i|we)\s+(?:use|go\s+with|pick|choose|learn|get|buy|take)|is\s+it|which\s+is\s+better,?)\s+)?[\w.+#/&'’-]+(?:\s+[\w.+#/&'’-]+){0,3}\s+or\s+(?!${OR_NOTHING})[\w.+#/&'’-]+(?:\s+[\w.+#/&'’-]+){0,3}\s*,?\s+(?:for|if|when|in|to|as)\b[^?]{2,90}\?\s*$`,
  'i'
);
/** "How is a virus different from bacteria?", "how does a Roth differ from a 401k?" */
const DIFFER = /\b(?:(?:is|are)\s+.{2,40}?\s+different\s+(?:from|than)|differ(?:s|ent)?\s+(?:from|than)|(?:is|are)\s+.{2,40}?\s+better\s+than|as\s+opposed\s+to)\b/i;
/** "How are viruses and bacteria similar?", "in what ways are cats and dogs alike?" */
const ALIKE = /\b(?:how|in\s+what\s+ways?|what\s+ways)\s+(?:is|are)\s+.{2,40}?\s+and\s+.{2,40}?\s+(?:similar|different|alike|related|the\s+same)\b/i;
/** Asked to compare, by the word. */
export const COMPARE_ASK =
  /\b(?:compare|comparison|contrast|difference between|differences between|trade-?offs?\s+between|which\s+(?:one\s+)?(?:is|would\s+be)\s+(?:better|best|worse|cheaper|faster|safer|easier)|better\s+(?:for|than|option)|choose between|decide between)\b/i;
/** Two named things in the message: "X or Y", "X vs Y", "between X and Y". */
export const twoNamed = (t: string): boolean => VERSUS.test(t) || /\bbetween\s+\S.{0,50}?\s+and\s+\S/i.test(t);

/**
 * A comparison of named things, as people actually phrase one. A question
 * (or a bare "X vs Y"), never a remark: "I'm feeling better than yesterday"
 * says something and asks nothing.
 */
export function comparisonAsk(text: string): boolean {
  const t = clean(text);
  if (!t || t.length > 300) return false;
  if (BARE_VS.test(t)) return true;
  // "compare Python and JavaScript for a beginner": asked to compare, by the verb that leads
  if (/^(?:(?:can|could|would)\s+you\s+|please\s+|let'?s\s+)?(?:compare|contrast)\s+\S/i.test(t)) return true;
  const asked = /\?\s*$/.test(t) || /^(?:(?:can|could)\s+you\s+)?(?:compare|contrast)\b/i.test(t);
  if (!asked) return false;
  return OR_FOR.test(t) || DIFFER.test(t) || ALIKE.test(t) || (COMPARE_ASK.test(t) && twoNamed(t));
}

/**
 * ONE SUBJECT'S TWO SIDES: "pros and cons of remote work", "is nuclear power
 * good or bad?", "the trade-offs of microservices". Two subjects set against
 * each other are a comparison instead (comparisonAsk).
 */
export const PROS_CONS =
  /\b(?:pros\s+and\s+cons|pros\s*\/\s*cons|advantages\s+and\s+disadvantages|benefits\s+and\s+(?:drawbacks|risks|costs|downsides)|upsides?\s+and\s+downsides?|strengths\s+and\s+weaknesses|trade-?offs?\s+of)\b|\b(?:is|are)\s+.{2,40}?\s+(?:good\s+or\s+bad|worth\s+it)\b/i;

/**
 * PRACTICAL ADVICE: "How do I price my SaaS?", "how should we grow our
 * newsletter?", "tips for sleeping better", "what's the best way to learn
 * Spanish?", "what metrics should a SaaS startup track?". A question with an
 * answer — the one thing it hinges on, a concrete default, the few levers
 * that matter — not idle reflection, and not a decision between options.
 * Not how to feel, cope or say something hard to someone: that is personal.
 */
/** How to feel, cope, or say something hard to someone: personal, not a practical question. */
export const PERSONAL_HOW =
  /\bhow\s+(?:do|can|should|would|could)\s+(?:i|we|you|one)\s+(?:feel|cope|deal\s+with|get\s+over|stop\s+feeling|forgive|apologi[sz]e|tell\s+(?:my|him|her|them|someone|people|a\s+friend)|talk\s+to\s+(?:my|him|her|them)|know\s+if\s+(?:he|she|they|someone)|convince\s+(?:my|him|her|them)|make\s+(?:him|her|them)\b|break\s+up|move\s+on)\b/i;
const ADVICE_LEAD =
  /^(?:(?:so|ok(?:ay)?|hey|hi|quick question|honestly),?\s+)?(?:how\s+(?:do|can|should|would|could)\s+(?:i|we|you|one)\s+(?!(?:feel|cope|deal\s+with|get\s+over|stop\s+feeling|forgive|apologi[sz]e|tell\s+(?:my|him|her|them|someone|people|a\s+friend)|talk\s+to\s+(?:my|him|her|them)|know\s+if\s+(?:he|she|they|someone)|convince\s+(?:my|him|her|them)|make\s+(?:him|her|them)\b|break\s+up|move\s+on)\b)|what(?:'s|\s+is)\s+the\s+best\s+way\s+to|(?:any\s+|some\s+|good\s+)?tips?\s+(?:for|on)\b|how\s+to\b|what\s+(?:metrics|kpis|numbers|signals)\s+should\b|what\s+should\s+(?:i|we|a|an|my|our)\s+[\w\s'’-]{2,30}?\s+(?:track|measure|charge|look\s+for|focus\s+on|prioriti[sz]e|know)\b)/i;
/** …asked of Socria itself, or of the person's own feelings: not advice. */
const NOT_ADVICE = /\b(?:you\s+(?:feel|think)|are\s+you|do\s+you\s+(?:like|feel|think))\b/i;
export function adviceAsk(text: string): boolean {
  const t = clean(text);
  if (!t || t.length > 400 || NOT_ADVICE.test(t)) return false;
  // the question can follow what it is about: "Our signups have plateaued at 200 a week. How do we grow?"
  return t.split(/(?<=[.!?])\s+/).some((s) => ADVICE_LEAD.test(s));
}

/** What an advice question is about, so the element can carry its levers. */
export type AdviceKind = 'price' | 'grow' | 'setup' | 'procedure' | 'other';
const PRICE = /\b(?:price|pricing|prices|charge|charging|how\s+much\s+(?:should|to|do)\s+(?:i|we)\s+(?:charge|ask))\b/i;
const GROW = /\b(?:grow|growth|acquire|acquisition|(?:get|find|win|reach)\s+(?:more\s+|our\s+|my\s+|the\s+)?(?:first\s+)?(?:\d+\s+)?(?:customers|users|clients|subscribers|readers|members|buyers|signups)|signups?|marketing\s+channels?|go[- ]to[- ]market)\b/i;
const SETUP = /\b(?:hire|hiring|recruit|set\s+up\s+(?:a|an|my|our)\s+(?:llc|company|business|limited\s+company|s-?corp|c-?corp|bank\s+account|pension|trust)|incorporate|register\s+(?:a|an|my|our)\s+(?:business|company|trademark|domain)|apply\s+for|get\s+a\s+(?:visa|passport|licen[cs]e|permit|mortgage)|open\s+a\s+(?:bank\s+account|business|company|llc|shop|store|restaurant))\b/i;
/** A procedure with an order to it: "how to make pancakes", "how do I change a tyre". "Make friends" has no recipe. */
const PROCEDURE =
  /\bhow\s+(?:to|do\s+(?:i|you|we)|can\s+(?:i|you|we)|should\s+(?:i|we))\s+(?:make\s+(?!(?:friends|money|time|sense|progress|peace|love|mistakes|decisions|changes|people|someone|myself|yourself|it|this|that|things|a\s+living|ends\s+meet|him|her|them)\b)|cook|bake|brew|install|replace|change\s+(?:a|an|the|my|your)\b|clean|unclog|fix\s+(?:a|an|the|my)\b|reset|renew|file\s+(?:a|an|my|our)\b|tie|fold|plant|repot|jump[- ]start|set\s+up\s+(?:a|an|the|my|our)\b|assemble|wire|paint|sharpen|descale|defrost|boil|roast|grill|knit|sew)\b/i;
export function adviceKind(text: string): AdviceKind {
  const t = clean(text);
  if (SETUP.test(t)) return 'setup';
  if (PROCEDURE.test(t)) return 'procedure';
  if (PRICE.test(t)) return 'price';
  if (GROW.test(t)) return 'grow';
  return 'other';
}

/**
 * THE PARTS OF SOMETHING. Some answers have no single central sentence: a
 * cycle, a hierarchy, a set of causes, the effects of one thing, its types.
 * Written as prose they become chained paragraphs; written as a list, a list
 * of terms. Each has a form that shows it (lib/inline-ui.ts diagram, concepts).
 */
export type PartsShape = 'cycle' | 'tree' | 'causes' | 'effects' | 'types';
/** A process that returns to where it started. */
const CYCLE = /\b(?:the\s+)?(?:[a-z]+\s+)?(?:cycle|feedback\s+loops?|life\s*cycle|vicious\s+circle|virtuous\s+circle|flywheel)\b/i;
/** How something is organised: a hierarchy with one top. Not "how is your day structured?". */
const STRUCTURE =
  /\bhow\s+(?:is|are)\s+(?!(?:your|my|our\s+(?:day|week|life)|it|this|that)\b)(?:the\s+|a\s+|an\s+|our\s+)?[\w\s'’-]{2,40}?\s+(?:organi[sz]ed|structured|governed|run|set\s+up|divided|arranged|classified)\b|\b(?:structure|hierarchy|org(?:ani[sz]ational)?\s+chart|chain\s+of\s+command|branches\s+of\s+government|levels\s+of\s+government|taxonomy)\s+(?:of|in)\b/i;
/** What brought something about. */
const CAUSES =
  /\b(?:what|which)\s+(?:caused|causes|led\s+to|leads\s+to|triggered|triggers|drives|drove|brought\s+about)\b|\b(?:main\s+|root\s+|underlying\s+)?causes\s+of\b|\bwhy\s+(?:did|do|does|was|were)\s+.{2,60}?\b(?:fall|collapse|happen|start|begin|fail|crash|end|win|lose|decline|rise|break\s+out)\b/i;
/** What one thing brings about. */
const EFFECTS = /\b(?:effects?|impacts?|consequences?|knock-on\s+effects?)\s+of\b|\bwhat\s+(?:happens|happened|would\s+happen)\s+(?:when|if|after)\b|\bhow\s+(?:does|do|did|would)\s+.{2,50}?\s+(?:affect|impact)\b/i;
/** The kinds of a thing. */
const TYPES = /\b(?:types|kinds|sorts|categories|classes|varieties|forms|flavou?rs)\s+of\b|\bwhat\s+(?:types|kinds|sorts)\s+of\s+.{2,40}?\s+(?:are\s+there|exist)\b/i;
/** Their own life or plan: "what happens if I quit my job" is theirs to think through, not a diagram. */
const THEIRS = /\b(?:i|i'm|i've|we|we're|my|our|me|us)\b/i;

export function partsShape(text: string): PartsShape | null {
  const t = clean(text);
  if (!t || t.length > 400) return null;
  if (CAUSES.test(t) && !/\bwhy\s+(?:did|do|does)\s+(?:i|we|my|our)\b/i.test(t)) return 'causes';
  if (STRUCTURE.test(t)) return 'tree';
  if (CYCLE.test(t) && !/\bmy\b|\bour\b/i.test(t)) return 'cycle';
  if (EFFECTS.test(t) && !THEIRS.test(t)) return 'effects';
  if (TYPES.test(t)) return 'types';
  return null;
}

/**
 * EVENTS IN TIME, where the order is the point: a timeline asked for, the
 * key events of something, how it developed, its history. Their own
 * timeline ("a timeline for our launch") is a plan to make in Artifacts.
 */
export const TIMELINE_ASK =
  /\b(?:timeline|chronolog(?:y|ical)|sequence\s+of\s+events|key\s+(?:events|dates|moments|milestones)|what\s+happened\s+(?:in|during|between|when|after|before)|how\s+(?:did|has|have)\s+[\w\s'’-]{2,40}?\s+(?:evolved?|developed?|changed?|unfold(?:ed)?|started|begun|begin|come\s+about)(?:\s+over\s+time)?|(?:a\s+|the\s+|brief\s+|short\s+)?history\s+of|origins?\s+of|rise\s+and\s+fall\s+of)\b/i;
/** …asked for by name ("timeline", "key events", "chronology"), as against a history that may be told as a story. */
export const TIMELINE_NAMED = /\b(?:timeline|chronolog(?:y|ical)|sequence\s+of\s+events|key\s+(?:events|dates|moments|milestones))\b/i;
/** A timeline of their own plans: made in Artifacts, never drawn in a reply. */
export const OWN_TIMELINE = /\b(?:my|our|your)\b|\b(?:project|launch|plan|schedule|roadmap|semester|sprint|wedding|trip|event|deadline|week|month)\b/i;

/**
 * A bare topic, typed the way a search box takes one: "types of machine
 * learning", "causes of inflation", "history of the internet", "pros and
 * cons of remote work". A request for information, though it asks nothing.
 */
const TOPIC = /^(?:the\s+)?(?:main\s+|key\s+|different\s+)?(?:types|kinds|causes|effects|impacts|consequences|history|origins?|pros\s+and\s+cons|advantages\s+and\s+disadvantages|benefits\s+and\s+(?:drawbacks|risks)|timeline|stages|phases|structure|stages|steps|rise\s+and\s+fall)\s+(?:of|for|to|in)\s+\S/i;
export function topicAsk(text: string): boolean {
  const t = clean(text);
  return !!t && t.length <= 160 && (TOPIC.test(t) || BARE_VS.test(t));
}

/** A list asked for in so many words: they get one — the few that matter most — and nothing in its place. */
export const LIST_ASK = /\b(?:list|lists|listing|bullet(?:ed)?|bullets|enumerate|numbered|point\s+form)\b/i;
/** …or an imperative for one: "list the causes of…", "name three…", "give me the main…". */
export const LIST_LEAD = /^(?:(?:can|could)\s+you\s+|please\s+)?(?:list|enumerate|name\s+(?:the|some|a\s+few|\d+|three|five|ten)|give\s+me\s+(?:a\s+list\s+of|the\s+(?:main|key|top|biggest)|some|a\s+few|\d+|three|five|ten))\b/i;
/** Asking for several of something: tips, ways, reasons, ideas. The rest of them can wait behind paths. */
export const MANY_ASK = /\b(?:tips?\s+(?:for|on|to)|ways\s+to|reasons\s+(?:why|for|to)|causes\s+of|signs\s+of|mistakes\s+to\s+avoid|things\s+to\s+(?:know|consider|avoid|do))\b/i;
