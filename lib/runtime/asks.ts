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
// AND NEVER A PERSON'S OWN LIFE (adversarial review, November 2026). "Why did
// he end things with me?" is not a causes diagram, "is he worth it?" not a
// balance sheet, "how do I fix my marriage?" not a recipe, "me vs my anxiety
// lol" not a comparison table, and "give me three reasons to live" is not a
// list. Every reader below that would put a structure on a turn stands down
// when the turn is about somebody's own relationships, feelings, grief or
// self (PERSONAL_LIFE), or names a person rather than a subject.
//
// Pure. No imports: lib/runtime/state.ts and lib/runtime/presentation.ts both
// read these.

const clean = (t: string) => t.replace(/```[\s\S]*?```/g, ' ').replace(/^\s*>.*$/gm, ' ').replace(/\s+/g, ' ').trim();

/**
 * Somebody's own life: their relationships, their family's grief, their
 * feelings, their self. A turn about this is answered by a person, in prose —
 * never with a table, a scored decision, a diagram or a recipe.
 */
export const PERSONAL_LIFE =
  /\b(?:my\s+(?:wife|husband|partner|marriage|relationship|boyfriend|girlfriend|bf|gf|ex|crush|life|self|feelings?|grief|anxiety|depression|therapist)|myself|break\s*up|broke\s+up|breaking\s+up|divorc\w*|split\s+up|splitting\s+up|custody|counsell?ing|dumped|cheat(?:ed|ing|s)?|ghost(?:ed|ing)|in\s+love|(?:text|call|message|ask\s+out|kiss|date|marry|forgive|trust|confront|dump|leave|wait\s+for)\s+(?:him|her)|grief|griev\w*|passed\s+away|died|death|dying|funeral|terminal|dementia|hospice|care\s+home|miscarriage|pregnan\w*|lonely|loneliness|heartbr\w*|depress\w*|anxious|anxiety|suicid\w*|self-?harm|panic\s+attacks?|therapy|therapist|trauma)\b/i;

/**
 * The person speaking: I, me, my, we, our, us. Not the "I" of World War I or
 * Henry I, and not the US — "what caused World War I?" and "how is the US
 * government organised?" are subjects, and were read as about the person
 * (adversarial review, November 2026).
 */
const ROMAN_I = String.raw`(?<!\b(?:war|part|chapter|phase|type|stage|class|act|volume|book|section|title|article|level|henry|louis|george|elizabeth|charles|james|william|edward|richard|mary|peter|catherine|nicholas|alexander|frederick|philip|john|pope\s+\w+)\s+)\bi\b`;
const FIRST_PERSON_WORDS = new RegExp(String.raw`${ROMAN_I}|\b(?:me|my|mine|myself|we|our|ours|ourselves)\b`, 'i');
export const firstPerson = (t: string): boolean => FIRST_PERSON_WORDS.test(t) || /\bus\b/.test(t);
/** A person, not a subject: a pronoun or a relation as the thing asked about. */
const THIRD_PERSON = /\b(?:he|she|him|her|they|them|someone|somebody)\b/i;
const aPerson = (t: string): boolean => THIRD_PERSON.test(t) || firstPerson(t);
/**
 * …and the words around a request that are about the asking, not the subject:
 * "help me understand…", "I need to know…", "explain it to me", "…for me".
 */
const ASKING = /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:help\s+me\s+(?:to\s+)?(?:understand|see|get)|i\s+(?:really\s+|still\s+|just\s+)?(?:need|want|'d\s+like|would\s+like|wanna)\s+to\s+(?:know|understand|learn|see)|i'?m\s+(?:so\s+|really\s+|a\s+bit\s+)?(?:confused|curious|lost)\s+(?:about|by|on|as\s+to)|i\s+(?:still\s+)?(?:don'?t|do\s+not|can'?t)\s+(?:really\s+)?(?:get|understand|see)|explain\s+to\s+me)\s+|\s+(?:for|to|with)\s+(?:me|us)\b|\b(?:please|thanks|thank\s+you)\b/gi;
/** "Why did he end things with me?", "why did my ex…", "how is he different from my ex?": one person's story. */
export const aboutAPerson = (t: string): boolean =>
  /^(?:(?:so|ok(?:ay)?|honestly),?\s+)?(?:why|how|what)\s+(?:did|does|do|is|was|were|would|could|can|has|made|makes)\s+(?:he|she|they|him|her|my\s+(?:ex|boyfriend|girlfriend|bf|gf|partner|husband|wife|friend|best\s+friend|mom|mum|dad|mother|father|boss|sister|brother|son|daughter|crush))\b/i.test(t.trim()) ||
  /\b(?:with|to|about|on|at|from)\s+me\s*\??$/i.test(t.trim());
/** One of their own events: "the meeting", "last night", "my flight". */
export const OWN_EVENT = /\b(?:last\s+night|yesterday|this\s+morning|my\s+(?:flight|meeting|interview|date|trip|exam|test|game|shift)|the\s+(?:meeting|game|match|interview|party|call|date|standup|demo))\b/i;

/** "or" that offers no second option: "or not", "or so", "or something". */
const OR_NOTHING = String.raw`(?:not|no|nah|nope|what|so|anything|something|whatever|else|maybe|never|neither|bad|wrong|false|less|later|worse|lose|die)\b`;

/** Two things set against each other, in so many words: "vs", "versus", "compared to", "X or Y". */
export const VERSUS = new RegExp(String.raw`\b(?:vs\.?|versus|compared?\s+(?:to|with)|or\s+(?!${OR_NOTHING})(?:the\s+|a\s+|an\s+)?[A-Za-z0-9])`, 'i');

/** "TCP vs UDP", "mitosis versus meiosis?" — the whole message is the two things. */
const BARE_VS = /^\s*[\w .+#/&'’()-]{1,40}?\s+(?:vs\.?|versus)\s+[\w .+#/&'’()-]{1,40}?\s*\??\s*$/i;
/** "TCP compared to UDP", "Python compared with Go?" */
const BARE_COMPARED = /^\s*[\w .+#/&'’()-]{1,40}?\s+compared\s+(?:to|with)\s+[\w .+#/&'’()-]{1,40}?\s*\??\s*$/i;
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
/** "How are viruses and bacteria similar?", "in what ways are cats and dogs alike?", "how do stocks and bonds differ?" */
const ALIKE =
  /\b(?:how|in\s+what\s+ways?|what\s+ways)\s+(?:is|are)\s+.{2,40}?\s+and\s+.{2,40}?\s+(?:similar|different|alike|related|the\s+same)\b|\b(?:how|in\s+what\s+ways?)\s+(?:do|does|did)\s+.{2,40}?\s+(?:and|from)\s+.{2,40}?\s+differ\b|\bwhat\s+(?:sets|separates|distinguishes)\s+.{2,40}?\s+(?:apart\s+)?from\b|\bstacks?\s+up\s+(?:against|to)\b|\bsimilarit(?:y|ies)\s+(?:and\s+differences\s+)?between\b/i;
/** Asked to compare, by the word. */
export const COMPARE_ASK =
  /\b(?:compare|comparison|contrast|difference between|differences between|trade-?offs?\s+between|which\s+(?:one\s+)?(?:is|would\s+be)\s+(?:better|best|worse|cheaper|faster|safer|easier|(?:more|less)\s+\w+|\w+er)\b|what'?s\s+better\b|better\s+choice\b|is\s+it\s+(?:better|smarter|cheaper|wiser|safer|healthier|easier)\s+to\b|better\s+(?:for|than|option)|choose between|decide between)\b/i;
/** Two named things in the message: "X or Y", "X vs Y", "between X and Y". */
export const twoNamed = (t: string): boolean => VERSUS.test(t) || /\bbetween\s+\S.{0,50}?\s+and\s+\S/i.test(t);

/**
 * …but not a joke, a title or a person. "Me vs my anxiety lol" and "monday
 * vs me" set a person against something; "Brown vs Board of Education",
 * "Godzilla vs Kong release date?" and "Kramer vs Kramer — worth watching?"
 * are one thing each; "lakers vs celtics tonight" is a score to look up; "I
 * feel different from everyone else" and "am I different from other people?"
 * are about the person.
 */
const SELF_SIDE = /^(?:me|myself|i|you|him|her|us|them|my\s+\w+|everyone|everybody|other\s+people|others|monday|mondays)$/i;
const TITLE_OR_EVENT = /\b(?:about|release\s+date|worth\s+(?:watching|reading|seeing)|movie|film|trailer|cast|ending|review|case|tonight|today|score|odds|kick-?off|live|result|lol|lmao|haha)\b/i;
const PERSON_DIFFERENT = /\b(?:i|i'm|am\s+i|you|we|he|she|they)\b[^?.!]{0,30}\bdifferent\s+(?:from|than)\b|\bdifferent\s+(?:from|than)\s+(?:everyone|everybody|other\s+people|others|the\s+rest|my\s+\w+)\b|\b(?:is|are)\s+(?:my|our|your)\s+(?:anxiety|depression|life|relationship|marriage|feelings?|mood|situation)\b/i;
const CASUAL_PICK = /\b(?:for\s+(?:dinner|lunch|breakfast|brunch|dessert|a\s+snack|tonight|today|the\s+party|the\s+weekend|movie\s+night)|tonight|lol|haha)\b/i;
export const LIFE_VALUES = /\bbeing\s+[\w-]+\s+or\s+(?:being\s+)?[\w-]+|\b(?:money|love|happiness|success|career|family|freedom|security|passion|fame)\s+or\s+(?:money|love|happiness|success|career|family|freedom|security|passion|fame)\b/i;
function sidesOf(t: string): [string, string] | null {
  const m = /^(.*?)\s+(?:vs\.?|versus|compared\s+(?:to|with))\s+(.*?)\s*\??\s*$/i.exec(t);
  return m ? [m[1].trim(), m[2].replace(/\s+(?:lol|lmao|haha)\b.*$/i, '').trim()] : null;
}

/**
 * A comparison of named things, as people actually phrase one. A question
 * (or a bare "X vs Y"), never a remark: "I'm feeling better than yesterday"
 * says something and asks nothing.
 */
export function comparisonAsk(text: string): boolean {
  const t = clean(text);
  if (!t || t.length > 300 || PERSONAL_LIFE.test(t) || PERSON_DIFFERENT.test(t)) return false;
  const sides = sidesOf(t);
  if (sides && (sides.some((s) => SELF_SIDE.test(s)) || TITLE_OR_EVENT.test(t))) return false;
  if (BARE_VS.test(t) || BARE_COMPARED.test(t)) return true;
  // "compare Python and JavaScript for a beginner": asked to compare, by the verb that leads
  if (/^(?:(?:can|could|would)\s+you\s+|please\s+|let'?s\s+)?(?:compare|contrast)\s+\S/i.test(t)) return true;
  const asked = /\?\s*$/.test(t) || /^(?:(?:can|could)\s+you\s+)?(?:compare|contrast)\b/i.test(t);
  if (!asked) return false;
  // "Agile vs waterfall, which should my team use for a fixed-scope contract?": named against each other, and asked
  if (/\b(?:vs\.?|versus)\s+\S/i.test(t)) return true;
  // "which is better, being rich or being happy?" is a question to think about, not a table
  if (LIFE_VALUES.test(t)) return false;
  // "pizza or tacos for dinner tonight?" is small talk
  return (OR_FOR.test(t) && !CASUAL_PICK.test(t)) || DIFFER.test(t) || ALIKE.test(t) || (COMPARE_ASK.test(t) && twoNamed(t));
}

/**
 * ONE SUBJECT'S TWO SIDES: "pros and cons of remote work", "is nuclear power
 * good or bad?", "the trade-offs of microservices". Two subjects set against
 * each other are a comparison instead (comparisonAsk). A person ("is he worth
 * it?") or the person's own feeling ("is it good or bad that I cried at
 * work?") has no balance sheet.
 */
export const PROS_CONS =
  /\b(?:pros\s+and\s+cons|pros\s*\/\s*cons|advantages\s+and\s+disadvantages|benefits\s+and\s+(?:drawbacks|risks|costs|downsides)|upsides?\s+and\s+downsides?|strengths\s+and\s+weaknesses|trade-?offs?\s+of)\b|\b(?:is|are)\s+(?!(?:he|she|they|it|this|that|my|our|your|him|her|them|i|we)\b)[\w\s'’-]{2,40}?\s+(?:good\s+or\s+bad|worth\s+it)\b(?!\s+(?:that|if|when)\s+i\b)/i;

/**
 * PRACTICAL ADVICE: "How do I price my SaaS?", "how should we grow our
 * newsletter?", "tips for sleeping better", "what's the best way to learn
 * Spanish?", "what metrics should a SaaS startup track?". A question with an
 * answer — the one thing it hinges on, a concrete default, the few levers
 * that matter — not idle reflection, and not a decision between options.
 * Not how to feel, cope, grieve or say something hard to someone: that is
 * personal, and is answered by a person.
 */
const PERSONAL_VERBS = String.raw`(?:feel|cope|deal\s+with|get\s+over|get\s+through|stop\s+(?:feeling|thinking|crying|being|loving|missing)|forgive|apologi[sz]e|tell\s+(?:my|him|her|them|someone|people|a\s+friend)|talk\s+to\s+(?:my|him|her|them)|know\s+if\s+(?:he|she|they|someone|i'?m|i\s+am)|convince\s+(?:my|him|her|them)|make\s+(?:him|her|them)\b|break\s+up|move\s+on|live\s+with|keep\s+going|survive|grieve|heal|come\s+out|be\s+happy|love\s+myself|accept\s+(?:myself|it|that))\b`;
export const PERSONAL_HOW = new RegExp(String.raw`\bhow\s+(?:do|can|should|would|could)\s+(?:i|we|you|one)\s+${PERSONAL_VERBS}|\bhow\s+to\s+${PERSONAL_VERBS}`, 'i');
const ADVICE_LEAD = new RegExp(
  String.raw`^(?:(?:so|ok(?:ay)?|hey|hi|quick question|honestly),?\s+)?(?:how\s+(?:do|can|should|would|could)\s+(?:i|we|you|one)\s+(?!${PERSONAL_VERBS})|how\s+does\s+one\s+(?!${PERSONAL_VERBS})|what\s+do\s+(?:i|we|you)\s+need\s+to\s+(?:do|know|bring|have|file|get)\b|what(?:'s|\s+is)\s+the\s+best\s+way\s+to|(?:any\s+|some\s+|good\s+)?tips?\s+(?:for|on)\b|how\s+to\b(?!\s+${PERSONAL_VERBS})|(?:what|which)\s+(?:metrics|kpis|numbers|signals)\s+should\b|what\s+should\s+(?:i|we|a|an|my|our)\s+[\w\s'’-]{2,30}?\s+(?:track|measure|charge|look\s+for|focus\s+on|prioriti[sz]e|know)\b)`,
  'i'
);
/** …asked of Socria itself, or of the person's own feelings: not advice. */
const NOT_ADVICE = /\b(?:you\s+(?:feel|think)|are\s+you|do\s+you\s+(?:like|feel|think))\b/i;
export function adviceAsk(text: string): boolean {
  const t = clean(text);
  if (!t || t.length > 400 || NOT_ADVICE.test(t) || PERSONAL_LIFE.test(t)) return false;
  // the question can follow what it is about: "Our signups have plateaued at 200 a week. How do we grow?"
  return t.split(/(?<=[.!?])\s+/).some((s) => ADVICE_LEAD.test(s));
}

/** What an advice question is about, so the element can carry its levers. */
export type AdviceKind = 'price' | 'grow' | 'setup' | 'procedure' | 'other';
/**
 * Pricing and growth of a business, an offer or an audience — not a used car,
 * a tomato plant, hair, or growing closer to a parent (the review's cases).
 */
const PRICE =
  /\b(?:price|pricing|charge|charging)\s+(?:my|our|the|a|an)?\s*(?:saas|app|product|products|service|services|course|plan|plans|subscription|software|tool|consulting|coaching|freelance\s+\w+|work|time|hourly\s+rate|rate|offer|membership|ebook|book|art|photography)\b|\bpricing\s+(?:model|strategy|page|tiers?)\b|\bhow\s+much\s+(?:should|to|do)\s+(?:i|we)\s+(?:charge|ask)\b/i;
const GROW =
  /\bgrow\s+(?:my|our|the|a|an)?\s*(?:[\w-]+\s+)?(?:business|company|startup|newsletter|audience|revenue|sales|user\s*base|users|customers?|clients?|subscribers?|followers?|brand|email\s+list|list|podcast|blog|channel|community|traffic|mrr|arr|shop|store|agency)\b|\b(?:acquire|acquisition)\b|\b(?:get|find|win|reach)\s+(?:more\s+|our\s+|my\s+|the\s+)?(?:first\s+)?(?:\d+\s+)?(?:customers|users|clients|subscribers|readers|members|buyers|signups)\b|\bsignups?\b|\bmarketing\s+channels?\b|\bgo[- ]to[- ]market\b|\buser\s+growth\b|\brevenue\s+growth\b/i;
const SETUP = /\b(?:hire|hiring|recruit|set\s+up\s+(?:a|an|my|our)\s+(?:llc|company|business|limited\s+company|s-?corp|c-?corp|bank\s+account|pension|trust)|incorporate|register\s+(?:a|an|my|our)\s+(?:business|company|trademark|domain)|apply\s+for|get\s+(?:a|an|my)\s+(?:[\w'’-]+\s+)?(?:visa|passport|licen[cs]e|permit|mortgage)|open\s+a\s+(?:bank\s+account|business|company|llc|shop|store|restaurant))\b/i;
/**
 * A procedure with an order to it: "how to make pancakes", "how do I change a
 * tyre", "how do I factory reset my phone?", "how do I do CPR?". "Make
 * friends" has no recipe, and neither does fixing a marriage or changing a life.
 */
const NOT_A_THING = String.raw`(?!(?:up\s+)?(?:my\s+)?(?:wife|husband|partner|marriage|relationship|life|act|self|myself|friendship|friends|mind|heart|mood|ex|feelings|peace|money|time|sense|progress|love|mistakes|decisions|changes|people|someone|yourself|it|this|that|things|a\s+living|ends\s+meet|him|her|them|my\s+(?:wife|husband|partner|mom|mum|dad)\s+\w+)\b)`;
const PROCEDURE = new RegExp(
  String.raw`(?:\bhow\s+(?:to|do\s+(?:i|you|we)|can\s+(?:i|you|we)|should\s+(?:i|we)|does\s+one)|\bbest\s+way\s+to|\bneed\s+to\s+do\s+to)\s+(?:\w+\s+){0,2}?(?:make\s+${NOT_A_THING}|cook|bake|brew|install|replace|change\s+${NOT_A_THING}(?:a|an|the|my|your)\b|clean\s+${NOT_A_THING}|unclog|fix\s+${NOT_A_THING}(?:a|an|the|my)\b|reset|renew|file\s+(?:a|an|my|our)\b|tie|fold|plant|repot|jump[- ]start|set\s+up\s+(?!(?:a\s+)?(?:date|time\s+to|meeting\s+with)\b)\S|integrate\s+\S+(?:\s+\S+)?\s+(?:with|into)\b|assemble|wire|paint|sharpen|descale|defrost|boil|roast|grill|knit|sew|do\s+cpr|perform\s+cpr|back\s+up|update|upgrade|deploy|remove\s+(?:(?:a|an|the|my)\s+)?(?:[\w-]+\s+){0,3}?stains?|get\s+\S+(?:\s+\S+)?\s+out\s+of|train\s+(?:a|my|your)\s+(?:dog|puppy|cat|kitten)|solder|configure|enable|migrate|transfer)\b`,
  'i'
);
export function adviceKind(text: string, domain?: string): AdviceKind {
  const t = clean(text);
  if (SETUP.test(t)) return 'setup';
  if (PROCEDURE.test(t)) return 'procedure';
  if (PRICE.test(t) || (domain === 'business' && /\b(?:price|pricing|charge)\b/i.test(t))) return 'price';
  if (GROW.test(t) || (domain === 'business' && /\bgrow(?:th)?\b/i.test(t))) return 'grow';
  return 'other';
}

/**
 * THE PARTS OF SOMETHING. Some answers have no single central sentence: a
 * cycle, a hierarchy, a set of causes, the effects of one thing, its types.
 * Written as prose they become chained paragraphs; written as a list, a list
 * of terms. Each has a form that shows it (lib/inline-ui.ts diagram, concepts).
 */
export type PartsShape = 'cycle' | 'tree' | 'causes' | 'effects' | 'types';
/**
 * A process that returns to where it started — named as one: the water,
 * carbon or Krebs cycle, a business cycle, a feedback loop, the phases of the
 * moon. Not a bike ride, a dishwasher programme or "breaking the cycle".
 */
const CYCLE =
  /\b(?:water|carbon|nitrogen|oxygen|phosphorus|rock|krebs|citric\s+acid|calvin|urea|cell|life|menstrual|ovarian|business|economic|credit|product|hype|news|sales|boom(?:\s+and\s+|-)bust|sleep|lunar|seasonal|feedback|virtuous|vicious|cardiac|carnot|otto)\s+(?:cycle|loop|circle)s?\b|\blife\s*cycle\s+of\b|\bfeedback\s+loops?\b|\bphases\s+of\s+the\s+moon\b|\blunar\s+phases\b|\bthe\s+(?:four\s+)?seasons\s+(?:change|happen|work)\b|\bwhy\s+do\s+we\s+have\s+seasons\b/i;
/** How something is organised: a hierarchy with one top — an institution, never a molecule or a poem. */
const ORG = String.raw`(?:government|company|corporation|firm|startup|army|military|navy|air\s+force|team|organi[sz]ation|court|courts|judiciary|university|school|hospital|church|party|congress|parliament|senate|police|nhs|united\s+nations|un|eu|european\s+union|monarchy|cabinet|federal\s+reserve|fed|union|ministry|department|agency|business|bank)`;
const STRUCTURE = new RegExp(
  String.raw`\bhow\s+(?:is|are)\s+(?:the\s+|a\s+|an\s+)?(?:[\w'’-]+\s+){0,3}?${ORG}\s+(?:organi[sz]ed|structured|governed|run|set\s+up|divided|arranged)\b|\b(?:structure|hierarchy|org(?:ani[sz]ational)?\s+chart|chain\s+of\s+command)\s+(?:of|in)\s+(?:the\s+|a\s+|an\s+)?(?:[\w'’-]+\s+){0,3}?${ORG}\b|\b(?:branches|levels)\s+of\s+government\b`,
  'i'
);
/** What brought something about. */
const CAUSES =
  /\b(?:what|which)\s+(?:caused|causes|led\s+(?:up\s+)?to|leads\s+to|triggered|triggers|drives|drove|brought\s+about)\b|\b(?:main\s+|root\s+|underlying\s+)?causes\s+of\b|\bwhy\s+(?:did|do|does|was|were)\s+.{2,60}?\b(?:fall|collapse|happen|start|begin|fail|crash|end|win|lose|decline|rise|break\s+out)\b|\bhow\s+did\s+.{2,60}?\s+(?:start|begin|happen|break\s+out|come\s+about)\b|\bled\s+up\s+to\b/i;
/** What one thing brings about. */
const EFFECTS = /\b(?:effects?|impacts?|consequences?|knock-on\s+effects?)\s+of\b|\bwhat\s+(?:happens|happened|would\s+happen)\s+(?:when|if|after)\b|\bhow\s+(?:does|do|did|would)\s+.{2,50}?\s+(?:affect|impact)\b/i;
/** A chain from one stage to the next: a funnel, a customer journey, a food chain. */
const FLOW = /\b(?:marketing|sales|conversion|purchase|acquisition)\s+funnel\b|\bcustomer\s+journey\b|\bfood\s+(?:chain|web)\b/i;
/** The kinds of a thing, or its parts. */
const TYPES =
  /\b(?:types|kinds|sorts|categories|classes|varieties|forms|flavou?rs)\s+of\b|\b(?:parts|components|organelles|layers|levels|states|pillars|elements)\s+(?:of|in)\b|\b(?:different|main)\s+[\w-]+\s+(?:types|kinds)\b|\bwhat\s+(?:types|kinds|sorts)\s+of\s+.{2,40}?\s+(?:are\s+there|exist)\b|\bfive\s+forces\b|\b(?:4|four)\s*ps\b/i;
/** A particular event, recent or theirs: "the Lakers lost last night", "my flight", "the meeting". */
const ONE_EVENT = /\b(?:last\s+night|tonight|today|yesterday|this\s+(?:morning|afternoon|evening|week)|so\s+early|my\s+flight|the\s+meeting|the\s+game|the\s+match)\b/i;

export function partsShape(text: string): PartsShape | null {
  const t = clean(text);
  if (!t || t.length > 400) return null;
  // a person's story, their own life, or one particular event: told, never diagrammed
  if (PERSONAL_LIFE.test(t) || aPerson(t.replace(ASKING, ' ')) || ONE_EVENT.test(t)) return null;
  if (CAUSES.test(t)) return 'causes';
  if (STRUCTURE.test(t)) return 'tree';
  if (CYCLE.test(t)) return 'cycle';
  if (EFFECTS.test(t) || FLOW.test(t)) return 'effects';
  if (TYPES.test(t)) return 'types';
  return null;
}

/**
 * EVENTS IN TIME, where the order is the point: a timeline asked for, the
 * key events of something, how it developed, its history. Their own
 * timeline ("a timeline for our launch") is a plan to make in Artifacts.
 */
export const TIMELINE_ASK =
  /\b(?:timeline|chronolog(?:y|ical)|sequence\s+of\s+events|(?:key|major|main|important|significant)\s+(?:events|dates|moments|milestones)|what\s+happened\s+(?:in|during|between|when|after|before)|how\s+(?:did|has|have)\s+[\w\s'’-]{2,40}?\s+(?:evolved?|evolve|develop(?:ed)?|changed?|unfold(?:ed)?|started|begun|begin|come\s+about)(?:\s+over\s+time)?|(?:a\s+|the\s+|brief\s+|short\s+)?history\s+of|origins?\s+of|rise\s+and\s+fall\s+of)\b/i;
/** …asked for by name ("timeline", "key events", "chronology"), as against a history that may be told as a story. */
export const TIMELINE_NAMED = /\b(?:timeline|chronolog(?:y|ical)|sequence\s+of\s+events|(?:key|major|main|important|significant)\s+(?:events|dates|moments|milestones))\b/i;
/** A timeline of their own plans: made in Artifacts, never drawn in a reply. */
export const OWN_TIMELINE = /\b(?:my|our|your)\b|\b(?:project|launch|plan|schedule|roadmap|semester|sprint|wedding|trip|event|deadline)\b|\bthe\s+(?:meeting|call|server|deploy|deployment|build|release|interview|party|game|match|incident|outage)\b/i;
/** …or of something that happened to them: "what happened when I restarted the server?" — not the "me" of "give me a timeline". */
const ASKED_OF = /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:give|show|tell|make|draw|walk|send|get)\s+me\b|\b(?:for|to)\s+me\b/gi;
export const ownTimeline = (t: string): boolean => OWN_TIMELINE.test(t) || firstPerson(t.replace(ASKED_OF, ' '));

/**
 * A bare topic, typed the way a search box takes one: "types of machine
 * learning", "causes of inflation", "history of the internet", "pros and
 * cons of remote work". A request for information, though it asks nothing.
 */
const TOPIC = /^(?:the\s+)?(?:main\s+|key\s+|different\s+)?(?:types|kinds|causes|effects|impacts|consequences|history|origins?|pros\s+and\s+cons|advantages\s+and\s+disadvantages|benefits\s+and\s+(?:drawbacks|risks)|timeline|stages|phases|structure|steps|rise\s+and\s+fall|life\s*cycle|layers|parts|components)\s+(?:of|for|to|in)\s+\S/i;
export function topicAsk(text: string): boolean {
  const t = clean(text);
  return !!t && t.length <= 160 && !PERSONAL_LIFE.test(t) && (TOPIC.test(t) || (BARE_VS.test(t) && comparisonAsk(t)));
}

/**
 * A MATHEMATICAL OBJECT beside a problem verb. "Solve", "integrate", "factor",
 * "simplify", "work out" are everyday verbs too: "set up two-factor
 * authentication", "integrate Stripe with my Next.js app", "work out at home",
 * "solve a conflict with my roommate" were read as maths practice and
 * scaffolded, so the steps they asked for were withheld, or TeX working was
 * offered for a quarrel (adversarial review, November 2026).
 */
export const PROBLEM_VERB = /\b(?:solve|prove|derive|integrate|differentiate|factor(?:i[sz]e)?|simplify|show that|work (?:out|through)|complete the square|completing the square)\b/i;
export const MATH_OBJECT =
  /=|\d\s*[-+*/^×÷]\s*\d|[a-z]\s*\^|[a-z]²|[∫∑√]|\b(?:equations?|integrals?|functions?|expressions?|polynomials?|derivatives?|limits?|matri(?:x|ces)|inequalit(?:y|ies)|quadratics?|sqrt|logs?|ln|sin|cos|tan|irrational|primes?|integers?|square\s+roots?|the\s+square|induction|theorem|series|by\s+parts|by\s+substitution|integration|differentiation|chain\s+rule|product\s+rule|quotient\s+rule|long\s+division|synthetic\s+division|gaussian\s+elimination|row\s+reduction|fractions?|area|volume|perimeter|circumference|radius|angles?|triangles?|probabilit(?:y|ies)|numbers?|even|odd|divisible|digits?|sum|x|y|n)\b/i;
export const NOT_A_PROBLEM = /\b(?:two|2|multi)-?factor\b|\bfactor\s+in\b|\bintegrate\s+\S+(?:\s+\S+)?\s+(?:with|into)\b|\bwork\s+out\s+(?:at|in|with|every|daily|today|tonight|before|after|more|less|regularly)\b/i;
export const mathProblem = (t: string): boolean => PROBLEM_VERB.test(t) && MATH_OBJECT.test(t) && !NOT_A_PROBLEM.test(t);

/**
 * A REQUEST, WITH ITS POLITE LEAD-IN: "tell me about the water cycle", "can you
 * tell me what caused World War 1?", "I'd like to know how to change a tyre".
 * Read as idle reflection, each got nothing; the lead-in is not where the
 * request begins, any more than a hello is (lib/cognition/register.ts
 * withoutGreeting). requestBody strips it, so the readers see the request;
 * tellAbout says it was "tell me about…", which asks for an explanation.
 */
const REQUEST_LEAD =
  /^(?:just\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:tell|show|give|explain\s+to|teach)\s+me|(?:please\s+)?(?:tell|show|teach)\s+me|i(?:'d|\s+would)?\s+(?:want|like|love)\s+to\s+(?:know|learn|understand|hear)|i\s+want\s+to\s+(?:know|learn|understand)|do\s+you\s+know|give\s+me\s+a\s+(?:quick\s+)?(?:rundown|summary|breakdown|run-?down)\s+of|break\s+down)\s+(?:about\s+)?/i;
const TELL_ABOUT = /^(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?tell\s+me|(?:please\s+)?tell\s+me|i(?:'d|\s+would)?\s+(?:like|love|want)\s+to\s+(?:know|learn|hear)|give\s+me\s+a\s+(?:quick\s+)?(?:rundown|summary|breakdown|run-?down))\s+(?:about|of)\s+\S/i;
export function requestBody(text: string): string {
  const t = text.trim();
  const m = REQUEST_LEAD.exec(t);
  if (!m) return t;
  const rest = t.slice(m[0].length).trim();
  // "tell me a joke", "tell me something nice": no request to read under it
  return rest.length >= 3 && !/^(?:a\s+joke|something|anything|more|a\s+story)\b/i.test(rest) ? rest : t;
}
export const tellAbout = (text: string): boolean => TELL_ABOUT.test(text.trim());

/**
 * A BASE RATE, asked about with its numbers: "a test is 99% accurate and the
 * disease affects 1 in 1000 — if I test positive, what are the chances?". The
 * answer surprises because it turns on the base rate; a slider with their
 * numbers in it shows why in a way no paragraph does.
 */
export const BASE_RATE =
  /\b(?:\d+(?:\.\d+)?\s?%\s+accurate|accuracy\s+of\s+\d+(?:\.\d+)?\s?%|false\s+positives?|tests?\s+positive|base\s+rates?)\b[\s\S]{0,240}?\b(?:chances?|probability|likely|odds|how\s+sure)\b/i;

/** A list asked for in so many words: they get one — the few that matter most — and nothing in its place. */
export const LIST_ASK = /\b(?:list|lists|listing|bullet(?:ed)?|bullets|enumerate|numbered|point\s+form)\b/i;
/**
 * …or an imperative for one: "list the causes of…", "name three…", "give me
 * the main…". Never time, room or comfort asked for — "give me a few
 * minutes", "give me some encouragement", "give me three reasons to live".
 */
export const LIST_LEAD =
  /^(?:(?:can|could)\s+you\s+|please\s+)?(?:list|enumerate|name\s+(?:the|some|a\s+few|\d+|three|five|ten)|give\s+me\s+(?:a\s+list\s+of|the\s+(?:main|key|top|biggest)|some|a\s+few|\d+|three|five|ten))\b(?!\s*(?:\w+\s+)?(?:minutes?|mins?|secs?|seconds?|hours?|days?|time|space|room|hope|encouragement|advice|support|love|hugs?|strength|courage|motivation|comfort|reasons?\s+to\s+(?:live|keep\s+going|go\s+on|stay)|reason\s+to)\b)/i;
/** Asking for several of something: tips, ways, reasons, ideas. The rest of them can wait behind paths. */
export const MANY_ASK = /\b(?:tips?\s+(?:for|on|to)|ways\s+to|reasons\s+(?:why|for|to)|causes\s+of|signs\s+of|mistakes\s+to\s+avoid|things\s+to\s+(?:know|consider|avoid|do)|(?:metrics|kpis|numbers)\s+(?:should|to\s+track|that\s+matter))\b/i;
