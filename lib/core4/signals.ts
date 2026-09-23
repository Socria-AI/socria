// lib/core4/signals.ts
//
// What the person said, in so many words, about how they want to be helped.
//
// WHY THIS IS CODE AND NOT PART OF THE STATE READER. The costliest mistakes
// Core 4 can make are about things the person states plainly: "just tell me",
// "don't give me the answer", "I'm learning this", "stop asking me
// questions", "that's not what I meant". A model reading 8,000 characters of
// transcript misses these often enough to matter, and an inferred reading of
// "I think they want to learn" must never outrank "just give me the answer".
// So explicit statements are read deterministically, and anything read here
// is EXPLICIT: it carries full confidence and beats every inference.
//
// Conservative by construction: each pattern needs the person to have said
// the thing. A miss here is harmless — the reader may still infer it, at
// lower authority. A false positive is not, so patterns are specific and
// quoted text and code are stripped first (a pasted error message saying
// "stop" is not an instruction).
//
// Pure. No model, no network.

import type { Directness, ExplicitSignals } from './types';

export const NO_SIGNALS: ExplicitSignals = {
  directness: 'none',
  learningGoal: null,
  expertise: null,
  assessment: false,
  redundancy: false,
  frustration: false,
  stopQuestions: false,
  wantsQuestions: false,
  correction: false,
  feedback: null,
  practiceIntent: false,
  safety: false,
  recommendationRequested: false,
  dontKnow: false,
  tooDirect: false,
  offRecord: false,
  onRecord: false,
  sensitive: false,
  endQuiz: false,
  revision: false,
  vent: false,
  horizon: false,
  done: false,
  requestedTokens: 0,
  flagOnly: false,
  requestsQuestions: false,
  delegate: false,
  ownWork: false,
  urgent: false,
  evidence: [],
};

/** Code, quotations and attachment blocks are not the person speaking to Socria. */
export function speech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^\s*>.*$/gm, ' ')
    .replace(/\[Attached [^\]]*\][\s\S]*$/i, ' ')
    .replace(/[“"][^”"\n]{0,400}[”"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


// Asking for the answer / the fix / execution.
const ANSWER = new RegExp(
  [
    String.raw`\bjust (tell|give|show) me\b`,
    String.raw`\b(tell|give|show) me the (answer|fix|solution|result|code|number|formula|derivation)\b`,
    String.raw`\bwhat(?:'s| is) the (answer|fix|solution)\b`,
    String.raw`\bi (?:just )?(?:need|want) the (answer|fix|solution|result)\b`,
    String.raw`\b(?:please |can you |could you )?just (answer|solve|fix|do) (it|this|that)\b`,
    String.raw`\bskip the (questions|hints|socratic)\b`,
    String.raw`\bno more hints\b`,
    String.raw`\bspell it out\b`,
    String.raw`\bstop (quizzing|testing) me\b`,
    String.raw`\bdon'?t make me (guess|work it out)\b`,
    String.raw`\bgive it to me straight\b`,
  ].join('|'),
  'i'
);

// Asking NOT to be given the answer.
const NO_ANSWER = new RegExp(
  [
    String.raw`\b(?:do not|don'?t|please don'?t) (tell|give|show)(?: me)? (?:the |an? )?(answer|answers|solution|fix|result)\b`,
    String.raw`\bwithout (?:telling me|giving (?:me )?|revealing )(?:the (?:answer|solution)|it away)\b`,
    String.raw`\bno (spoilers|answers|solutions)\b`,
    String.raw`\bi want to (figure|work) (it|this|that) out(?: myself| on my own| for myself)?\b`,
    String.raw`\blet me (figure|work) (it|this) out\b`,
    String.raw`\blet me try(?: it| this| the problem)? (?:first|myself|on my own)\b`,
    String.raw`\beven if i ask\b`,
    String.raw`\bdon'?t solve it\b`,
    String.raw`\bdon'?t give (it|the answer|anything) away\b`,
    // Bare "don't tell me" — only when the clause ends there ("nudge me,
    // don't tell me."), so "don't tell me how to…" is not a refusal.
    String.raw`\b(?:do not|don'?t) (?:tell|give|show) me(?: (?:it|the (?:ending|rule|pattern|answer)))?(?=\s*(?:[.,;:!)\]—–-]|$))`,
    String.raw`\bi(?:'d| would) (?:rather|prefer to|like to) (?:work|figure|find) (?:it |this |that |the \w+ )?out\b`,
    String.raw`\b(?:work|figure|find) (?:it|this|that) out (?:myself|on my own|for myself)\b`,
    String.raw`\bi(?:'d| would) rather (?:discover|find|solve|derive) (?:it|this|that|the \w+)\b`,
  ].join('|'),
  'i'
);

// Asking for hints specifically.
const HINTS = /\b(hints? only|only (?:a )?hints?|just (?:a )?(?:hint|nudge)|give me (?:a )?(?:hint|nudge)|small hint|a nudge|nudge me|point me in the right direction|just point me)\b/i;

const LEARNING = new RegExp(
  [
    String.raw`\b(?:i'?m|i am) (?:currently )?(learning|studying|practi[cs]ing|revising|preparing for)\b`,
    String.raw`\b(?:i'?m|i am) (?:trying|teaching myself) to (learn|understand|get better at)\b`,
    String.raw`\bteaching myself\b`,
    String.raw`\bi want to (actually )?(learn|understand|get better at)\b`,
    String.raw`\bfor my (class|course|module|studies|revision)\b`,
    String.raw`\bhelp me (understand|learn)\b`,
    String.raw`\bteach me\b`,
  ].join('|'),
  'i'
);
const NOT_LEARNING = /\b(i (?:don'?t|do not) (?:need|want|care) to (?:learn|understand)(?: (?:it|this|how))?|not trying to learn|i just need (?:it|this) (?:done|working|to work))\b/i;

const EXPERT = new RegExp(
  [
    String.raw`\b(?:i'?m|i am) (?:a |an )?(?:senior |staff |principal |tenured |practicing |practising )?(?!(?:bad|junior|aspiring|former|student|wannabe|new|beginner|terrible|mediocre|self-taught)\b)(?:\w+ )?(professor|statistician|biostatistician|mathematician|physicist|chemist|economist|engineer|researcher|scientist|physician|clinician|doctor|surgeon|lawyer|attorney|litigator|quant|developer|programmer|epidemiologist|philosopher|historian|founder|cto|ceo|analyst|consultant|designer|novelist|editor|investor|accountant|nurse|pharmacist|sre)\b(?! student)`,
    String.raw`\bi (teach|taught|have taught) (?:\w+ ){0,3}(?:at|for|to)\b`,
    String.raw`\bi(?:'ve| have) been (?:doing|working|writing|coding|practi[cs]ing|researching)\b[^.]{0,40}\bfor (?:\d+|over \d+|many|ten|twenty) years\b`,
    String.raw`\bmy (phd|dissertation|research group)\b`,
  ].join('|'),
  'i'
);
const NOVICE = /\b(?:i'?m|i am) (?:new to|a (?:complete |total )?beginner|just starting|not (?:very )?(?:good|familiar) with)\b|\b(beginner question|eli5|never (?:learned|studied|done) (?:this|it|\w+) before)\b/i;

const ASSESSMENT = /\b((?:this|it) (?:is|will be) graded|my graded (?:homework|problem set|assignment|essay|lab)|for (?:a |my )?grade\b|(?:take-?home|open-?book) (?:exam|test)|(?:assignment|problem set|homework|essay) (?:that )?(?:i|i'?ll|i will|i need to|i have to) (?:submit|hand in|turn in)|i(?:'ll| will| have to|'m going to) (?:submit|hand in|turn in) (?:it|this)(?: for (?:a |my )?(?:grade|class|course))?)\b/i;

const REDUNDANT = new RegExp(
  [
    String.raw`\bi(?: have|'ve)? (?:already|just) (?:said|mentioned|told you|considered|thought about|looked (?:at|into)|tried|checked|ruled (?:that|it|this) out|covered|accounted for|addressed)\b`,
    String.raw`\b(?:as|like) i (?:said|mentioned)\b`,
    String.raw`\byes,? i(?:'m| am) aware\b`,
    String.raw`\bthat'?s (?:obvious|what i (?:said|just said))\b`,
    String.raw`\bwe (?:already )?covered (?:that|this)\b`,
    String.raw`\byou (?:already )?asked (?:me )?(?:that|this)\b`,
    String.raw`^i know(?: that|,| this|\.|!| already)`,
  ].join('|'),
  'i'
);

const FRUSTRATED = /\b(i(?:'ve| have) been stuck|this (?:isn'?t|is not) helping|(?:i )?don'?t have time for|getting nowhere|going (?:round|around) in circles|this is (?:frustrating|annoying)|frustrat(?:ed|ing)|come on|ugh+|seriously\?|you'?re not (?:listening|helping))\b/i;

const STOP_QUESTIONS = /\b(stop|quit|no more|enough(?: with)?(?: the)?) (?:asking(?: me)?(?: questions)?|questions|quizzing)\b|\bdon'?t ask me\b|\bstop answering (?:my questions )?with questions\b/i;

const WANTS_QUESTIONS = /\b(quiz me|test me|ask me (?:some |a few )?questions|drill me|question me on)\b/i;

const CORRECTION = /\b(that'?s not what i (?:meant|said)|you misunderstood|you(?:'ve| have)? got (?:it|me|that) wrong|i (?:never|didn'?t|did not) (?:said|say|mean|meant|claim)|not what i meant|you'?re misremembering|that'?s not (?:right|true) about me|i didn'?t say that|i never said)\b/i;

const POSITIVE = /\b(that (?:helped|helps|was (?:really |very )?(?:helpful|useful)|makes sense now|clicked)|(?:very|really|super) helpful|that'?s (?:exactly|precisely) (?:it|what i needed)|oh,? i see|aha|got it,? thanks|perfect,? thanks)\b/i;
const NEGATIVE = /\b(not (?:very |really )?(?:helpful|useful)|that didn'?t help|unhelpful|useless|that'?s not (?:helpful|useful|what i asked)|you'?re not helping|that doesn'?t answer)\b/i;

const DELEGATE = /\b(you (?:do|write|handle|take care of|draft) it|do it for me|write it for me|just (?:do|handle|write|draft|implement) it|can you (?:just )?(?:write|draft|implement|code) (?:it|this|that)(?: for me)?)\b/i;

const OWN_WORK = /\b(don'?t (?:re)?write (?:it|this|my \w+)(?: for me)?|i want to write (?:it|this) myself|(?:it|this) (?:has|needs) to be (?:my|in my) own (?:words|work)|don'?t tell me what to (?:conclude|decide|think)|i(?:'ll| will) (?:decide|make the call)(?: myself)?|keep (?:it|this) in my (?:voice|words))\b/i;

const URGENT = /\b((?:prod(?:uction)?|the site|our site|the app|checkout|the api) is (?:down|broken|failing)|outage|(?:due|deadline|submission|meeting|presentation|demo) (?:is )?(?:in|within) (?:an? |the next )?(?:hour|\d+\s?(?:min(?:ute)?s?|hours?))|urgent(?:ly)?|asap|emergency|customers? (?:are|is) (?:affected|blocked|down))\b/i;

// STRONG practice intent (council D2): the person says producing it is the point.
const PRACTICE = new RegExp(
  [
    String.raw`\bi want to (?:work|figure|solve) (?:it|this|these|that) out(?: myself| on my own| for myself)?\b`,
    String.raw`\b(?:work|figure|solve) (?:it|this|that|these) out (?:myself|on my own|for myself)\b`,
    String.raw`\blet me try(?: it| this| the problem)? (?:first|myself|on my own)\b`,
    String.raw`\bi(?:'d| would) rather (?:work|figure) (?:it |this |that |the \w+ )?out\b`,
    String.raw`\b(?:i need|i want|i have) to be able to do (?:these|this|it|them) (?:cold|myself|on my own|without help|in the exam)\b`,
    String.raw`\b(?:drilling|practi[cs]ing) (?:these|this|problems|questions)\b[^.?!]{0,60}\b(?:myself|on my own|don'?t (?:solve|tell|give))`,
    String.raw`\bhints only\b`,
    String.raw`\b(?:do|solve|work) (?:these|this|it|them) (?:myself|on my own)\b`,
  ].join('|'),
  'i'
);

// Harm now: the safety gate (council D1). Only ever produces MORE help.
const SAFETY = /\b(swallowed (?:a |an |some )?(?:button )?(?:battery|batteries|magnet|bleach|pills?|poison)|overdos\w*|poison(?:ed|ing)\b|chest pain|can'?t breathe|not breathing|unconscious|seizure|anaphyla\w*|severe allergic|bleeding (?:heavily|a lot|won'?t stop)|suicid\w*|kill (?:myself|himself|herself)|self-?harm|stroke symptoms|call (?:911|999|112)|emergency room|money (?:is )?being (?:stolen|taken) (?:right )?now|wire (?:the )?money (?:today|now) (?:or|before)|court deadline (?:is )?(?:today|tomorrow))/i;

const RECOMMEND = /\b(what would you (?:do|pick|choose|go with)|which (?:one )?(?:should|would) (?:i|you) (?:pick|choose|take|go with)|(?:give me |what'?s )?your (?:pick|recommendation|call|vote)|if you were me|which would you (?:pick|choose))\b/i;

const DONT_KNOW = /^(?:\s*(?:idk|i (?:really )?don'?t know|i do not know|no idea|no clue|not sure|dunno|i have no idea))\b[\s\S]{0,40}$/i;

const TOO_DIRECT = /\b(don'?t just (?:give|tell) me the (?:answer|solution)|you gave (?:it|the answer) away|i wanted to (?:figure|work) (?:that|it) out|spoiler|don'?t give (?:me )?so much|that was too much)\b/i;

const OFF_RECORD = /\b(off the record|don'?t remember (?:this|that)|don'?t save (?:this|that)|forget (?:this|that) (?:conversation|chat)?)\b/i;

const ON_RECORD = /\b(you can remember (?:this|that|again)|back on the record|ok to remember|remember this)\b/i;

// Council D14's deterministic backstop for sensitive conversations. It only
// ever REDUCES what is kept (conversation-only), never what is said.
const SENSITIVE = /\b(diagnos(?:is|ed)|my (?:therapist|psychiatrist)|depress(?:ion|ed)|anxiety disorder|panic attacks?|bipolar|adhd|ptsd|eating disorder|chemo(?:therapy)?|cancer|hiv|miscarriage|pregnan(?:t|cy)|abortion|medication|antidepressants?|grief|griev(?:e|ing)|passed away|funeral|divorce|custody|separat(?:ed|ion) from my|my (?:ex|abuser)|abus(?:e|ive)|sexuality|coming out|gay|lesbian|trans(?:gender)?|religio(?:n|us)|faith|immigration status|visa (?:status|overstay)|undocumented|asylum|deport\w*|arrest(?:ed)?|criminal record|lawsuit against me|bankrupt\w*|debt collectors?|in debt|can'?t pay (?:rent|my))\b/i;

const FLAG_ONLY = new RegExp(
  [
    String.raw`\b(?:do not|don'?t) (?:tell|show) me (?:what'?s|what is|where(?:'s| it)?|which (?:line|part)) (?:wrong|broken|the (?:bug|error|mistake|problem))`,
    String.raw`\bfinding (?:it|the (?:bug|error|mistake|problem)) (?:myself )?is the (?:point|whole point)\b`,
    String.raw`\b(?:you )?only tell me (?:if|whether|when) i(?:'ve| have)? (?:gone off the rails|gone wrong|gone off track|made a mistake|got it wrong|am wrong|'m wrong)`,
    String.raw`\bjust (?:tell me|flag|say) (?:if|whether) i(?:'m| am) (?:wrong|off|on the right track)\b`,
    String.raw`\bwarmer (?:or|\/) colder\b`,
    String.raw`\btell me how to (?:look|find it|debug|search|approach it)\b[^.?!]{0,30}\bnot (?:what|where)\b`,
  ].join('|'),
  'i'
);

const HORIZON = /\b(from now on|going forward|always|in general|every time|stop being socratic|for the rest of (?:this|the) (?:chat|conversation))\b/i;
const DONE = /^\s*(?:ok(?:ay)?|great|perfect|cool|nice|got it|makes sense|thanks|thank you|cheers|brilliant)[\s,.!]*(?:(?:got it|thanks|thank you|that'?s (?:it|all|everything|what i needed)|that helps|makes sense|cheers)[\s,.!]*)*$/i;

/** A length they asked for, in tokens (council D17). */
function requestedTokensOf(text: string): number {
  const words = /\b(?:in|about|around|under|max(?:imum)?|at most|~)\s*(\d{2,4})\s*words\b/i.exec(text);
  if (words) return Math.min(4000, Math.round(Number(words[1]) * 1.4));
  if (/\b(?:the )?(?:full|whole|entire|complete) (?:file|script|program|module|section|derivation|proof|essay|draft|code|listing)\b/i.test(text)) return 3000;
  return 0;
}

const VENT = /\b(i (?:just )?(?:need|want) to vent|(?:i )?(?:don'?t|do not) want (?:any )?advice|not looking for (?:advice|solutions)|(?:please )?just listen|i don'?t need (?:you to )?(?:fix|solve) (?:it|this|anything)|(?:just )?need to get (?:this|it) off my chest)\b/i;

const END_QUIZ = /\b(let'?s stop (?:there|here|for (?:now|today))|that'?s enough(?: for (?:now|today))?|enough for today|i(?:'m| am) done for (?:now|today))\b/i;
const REVISION = /\b(i was (?:computing|calculating|doing|asking|solving|answering) the wrong (?:thing|question)|i was wrong(?: about| on| there)?|scratch that|i(?:'ve| have) changed my mind|ignore (?:what|that) i (?:just )?said|forget what i (?:just )?said)\b/i;

const REQUESTS_QUESTIONS = /\b((?:write|give|make|draft|generate|come up with|list|suggest)(?: me)? (?:\w+ ){0,3}(?:questions|quiz|exam items|practice problems|interview questions|test items|flashcards|faq)|quiz me|test me|drill me|interview questions)\b/i;

interface Hit {
  at: number;
  end: number;
  match: string;
}

function allMatches(re: RegExp, text: string): Hit[] {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const out: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    out.push({ at: m.index, end: m.index + m[0].length, match: m[0] });
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
}

function lastIndex(re: RegExp, text: string): Hit | null {
  const all = allMatches(re, text);
  return all.length ? all[all.length - 1] : null;
}

/** A request that sits inside a refusal ("don't TELL ME THE ANSWER") is not a request. */
function negated(h: Hit, refusals: Hit[], text: string): boolean {
  if (refusals.some((r) => h.at < r.end && h.end > r.at)) return true;
  const before = text.slice(Math.max(0, h.at - 16), h.at).toLowerCase();
  return /\b(?:don'?t|do not|never|not|without)(?:\s+just)?\s*$/.test(before);
}

/**
 * Read the explicit signals in one message.
 *
 * Where two directness instructions conflict in the same message, the LATER
 * one wins — people change their minds mid-sentence ("I wanted to work it
 * out myself, but honestly just tell me").
 */
export function readSignals(message: string): ExplicitSignals {
  const text = speech(message);
  if (!text) return NO_SIGNALS;
  const evidence: string[] = [];
  const note = (m: { match: string } | null) => {
    if (m) evidence.push(m.match.trim().slice(0, 60));
    return m;
  };

  const refusals = allMatches(NO_ANSWER, text);
  const requests = allMatches(ANSWER, text).filter((h) => !negated(h, refusals, text));
  const ans = requests.length ? requests[requests.length - 1] : null;
  const no = refusals.length ? refusals[refusals.length - 1] : null;
  const hint = lastIndex(HINTS, text);
  let directness: Directness = 'none';
  const candidates = [
    ans && { d: 'answer' as Directness, ...ans },
    no && { d: 'no_answer' as Directness, ...no },
    hint && { d: 'guidance' as Directness, ...hint },
  ].filter(Boolean) as { d: Directness; at: number; match: string }[];
  if (candidates.length) {
    const winner = candidates.sort((a, b) => b.at - a.at)[0];
    directness = winner.d;
    note(winner);
  }

  const notLearning = note(lastIndex(NOT_LEARNING, text));
  const learning = notLearning ? null : note(lastIndex(LEARNING, text));
  const expert = note(lastIndex(EXPERT, text));
  const novice = expert ? null : note(lastIndex(NOVICE, text));

  const stopQuestions = !!note(lastIndex(STOP_QUESTIONS, text));
  const frustration = stopQuestions || !!note(lastIndex(FRUSTRATED, text));
  const negative = note(lastIndex(NEGATIVE, text));
  const positive = negative ? null : note(lastIndex(POSITIVE, text));

  const practice = notLearning ? null : note(lastIndex(PRACTICE, text));
  // "Only tell me if I've gone off the rails" refuses the fix as surely as
  // "don't tell me the answer" does — unless a later "just tell me" wins.
  if (directness === 'none' && FLAG_ONLY.test(text)) directness = 'no_answer';

  return {
    directness,
    learningGoal: notLearning ? false : learning || practice ? true : null,
    practiceIntent: !!practice || directness === 'no_answer' || directness === 'guidance',
    safety: !!note(lastIndex(SAFETY, text)),
    recommendationRequested: !!note(lastIndex(RECOMMEND, text)),
    dontKnow: DONT_KNOW.test(text),
    tooDirect: !!note(lastIndex(TOO_DIRECT, text)),
    offRecord: !!note(lastIndex(OFF_RECORD, text)),
    onRecord: !!note(lastIndex(ON_RECORD, text)),
    sensitive: SENSITIVE.test(text),
    endQuiz: END_QUIZ.test(text),
    revision: !!note(lastIndex(REVISION, text)),
    vent: VENT.test(text),
    horizon: HORIZON.test(text),
    done: DONE.test(text) && text.length < 80,
    requestedTokens: requestedTokensOf(text),
    flagOnly: !!note(lastIndex(FLAG_ONLY, text)),
    requestsQuestions: !!lastIndex(REQUESTS_QUESTIONS, text),
    expertise: expert ? 'expert' : novice ? 'novice' : null,
    assessment: !!note(lastIndex(ASSESSMENT, text)),
    redundancy: !!note(lastIndex(REDUNDANT, text)),
    frustration,
    stopQuestions,
    wantsQuestions: !stopQuestions && !!note(lastIndex(WANTS_QUESTIONS, text)),
    correction: !!note(lastIndex(CORRECTION, text)),
    feedback: negative ? 'negative' : positive ? 'positive' : null,
    delegate: !!note(lastIndex(DELEGATE, text)),
    ownWork: !!note(lastIndex(OWN_WORK, text)),
    urgent: !!note(lastIndex(URGENT, text)),
    evidence: [...new Set(evidence)].slice(0, 8),
  };
}

/**
 * The standing instructions a Project carries — the person's agency contract
 * for everything in it. Read with the same patterns; only the durable signals
 * are kept (a Project cannot be "frustrated").
 */
export function readContract(instructions: string | null | undefined): ExplicitSignals {
  if (!instructions?.trim()) return NO_SIGNALS;
  const s = readSignals(instructions);
  return {
    ...NO_SIGNALS,
    directness: s.directness,
    learningGoal: s.learningGoal,
    practiceIntent: s.practiceIntent,
    expertise: s.expertise,
    assessment: s.assessment,
    delegate: s.delegate,
    ownWork: s.ownWork,
    evidence: s.evidence,
  };
}
