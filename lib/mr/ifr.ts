// lib/mr/ifr.ts — INTERACTION FRICTION REGULATION: WHAT CAN BE OBSERVED.
//
// IFR's first step, and the State Engine's evidence readers. Every turn of
// theirs is read into Observations (lib/mr/types.ts): their words about how
// they want to be helped ('explicit.*'), counts over the transcript and the
// engine's verdicts ('observed.*'), and two readings that are recorded and
// never acted on alone ('weak.*'). Nothing here decides anything; the policy
// reads these and decides, and most turns produce nothing it acts on.
//
// WHY EVERY DETECTOR IS CONSERVATIVE. A miss means MR does nothing and the
// turn is helped the way it would have been without MR. A false positive
// changes how Socria helps somebody who asked for nothing. So each pattern
// needs the person to have said the thing, in so many words, to Socria:
// quoted text and code are stripped first (speech(), lib/core4/signals.ts), a
// request inside a refusal ("don't make it shorter") does not count, and a
// count needs every link in it to hold. Each pattern's known misses are noted
// beside it. The patterns are English only.
//
// WHAT IS NEVER READ. A psychological state is never observed: frustration
// exists only as their word for it ('explicit.frustration'). A short message
// is a 'hypothesis' at weak strength and nothing more — "ok" is not
// impatience, and three of them in a row are still only a hypothesis. A short
// message can count towards unproductive questions only as one link in a
// counted streak of replies that asked.
//
// CONTENT-FREE. An Observation carries codes, turn indices and roles —
// EvidenceRef pointers, never a word of anybody's — so it can be traced,
// logged and stored as it is.
//
// readSignals' fields are reused wherever they exist; the regexes here cover
// what it does not read (steps, length, simplicity, verification, edit scope,
// confusion, revocation), and narrow the fields that are too broad to act on
// — each narrowing is beside the code that does it: wantsQuestions and
// requestsQuestions ("don't quiz me", "interview questions for my
// candidate"), horizon ("I always forget…"), sentences and requestedTokens
// ("these two sentences", "my essay is about 200 words"), directness ("just
// give me a sec"), ownWork ("let me know"), and frustration ("come on over").
//
// Pure. Deterministic. No model, no network, no clock.

import { speech, readSignals } from '../core4/signals';
import { interrogatives, questionLoad } from '../core4/questions';
import type { ExplicitSignals, ReplyLength } from '../core4/types';
import type { StrategyParams } from './config';
import { REVOKE_SCOPE, wordCount } from './outcome';
import { OBSERVATION_CODES, type EvidenceRef, type Observation, type ObservationCode, type Provenance, type Strength, type TranscriptMessage } from './types';

/** readSignals reads at most this much of a message, as the replay does (lib/runtime/replay.ts READ_CHARS). */
export const IFR_READ_CHARS = 6000;



// ── the turn, as IFR reads it ────────────────────────────────────────

export interface TurnView {
  /** user-turn index, 0-based */
  index: number;
  /** index of this user message in messages */
  at: number;
  text: string;
  signals: ExplicitSignals;
  /** the assistant message right after this user message, if any */
  reply: string | null;
  /** the assistant message right before it, if any */
  prevReply: string | null;
}

/**
 * Their messages, each with the reply before and after it. readSignals runs
 * on each (capped), except the newest, which takes `newest` when the route
 * has already read it — the same reading, not a second one.
 */
export function turnsOf(messages: readonly TranscriptMessage[], newest?: ExplicitSignals): TurnView[] {
  const users: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'user') users.push(i);
  });
  const last = users.length - 1;
  return users.map((at, index) => {
    const text = String(messages[at].content ?? '');
    const before = messages[at - 1];
    const after = messages[at + 1];
    return {
      index,
      at,
      text,
      signals: index === last && newest ? newest : readSignals(text.slice(0, IFR_READ_CHARS)),
      reply: after?.role === 'assistant' ? String(after.content ?? '') : null,
      prevReply: before?.role === 'assistant' ? String(before.content ?? '') : null,
    };
  });
}

// ── the patterns ─────────────────────────────────────────────────────
//
// Applied to speech(text): code, quotes and attachments are gone. Each is
// exported so tests and docs/MR.md can cite the exact rule.

/**
 * The negation that can stand before a request and turn it round: "don't",
 * "never", "without", and the same with a want or a need between — "I don't
 * want more detail", "I don't need it shorter", "I don't want you to quiz
 * me". (A bare "don't" window missed every one of those, and read each as
 * the request it refuses.)
 */
const NEGATED_BEFORE =
  /\b(?:don'?t|do not|didn'?t|did not|never|not|without|no need to)(?:\s+(?:just|even|really|ever|actually))?(?:\s+(?:need|want|ask(?:ed)? for|mean|like|require|expect)(?:\s+(?:you\s+)?to)?(?:\s+(?:be|get|have|make|keep|see|go))?)?(?:\s+(?:it|this|that|them|any|any more|anymore))?\s*$/i;

/**
 * Does `re` match somewhere that is not negated? A match counts unless a
 * negation (NEGATED_BEFORE) stands right before it, so "don't make it
 * shorter" is not a request for shorter. A pattern that contains its own
 * negation ("don't rewrite") is unaffected: only the text BEFORE the match
 * is looked at.
 */
export function saidPlainly(re: RegExp, text: string): boolean {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (!NEGATED_BEFORE.test(before)) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

// ── addressed to Socria ──────────────────────────────────────────────
//
// A PATTERN THAT FIRES WHEREVER ITS WORDS APPEAR READS OTHER PEOPLE'S WORDS
// AS THEIRS: "my sister likes to quiz me", "is there a website that can quiz
// me", "why did you stop asking me questions", "I did not ask you to quiz
// me", "how long does it take to get back to normal". Lists of negations never
// caught up with the ways a sentence makes the words somebody else's, a
// refusal, a complaint or a question about something else. So the
// instructions whose false positive costs most — a quiz that keeps the answer
// back, a stop that cuts every question, a revocation that ends a stop
// everywhere, a ceiling on length, an edit-only scope — count only
// ADDRESSED: inside their clause nothing stands before them but a lead-in
// (fillers like "ok so", "please", "actually", and a request frame: "can
// you", "I want you to", "let's"), and their sentence does not put them off
// ("quiz me next week", "you can test me tomorrow", "later, not now").
// Anything else before them and MR does nothing: a miss is the turn as it
// would be without MR; a false positive is not.

/** Words that can stand before an instruction and leave it one. */
const LEAD_WORDS = String.raw`(?:ok(?:ay)?|alright|all right|right|great|cool|good|nice|perfect|fine|thanks|thank you|so|and|but|then|now|also|actually|please|pls|plz|just|maybe|perhaps|hey|hi|hello|yes|yeah|yep|sure|well|hmm+|um+|uh+|oh|anyway|anyways|honestly|seriously|really|kindly|first|instead|again|ugh+|look|listen|come on|lol|this time|for now|from now on|going forward|from here on(?: out)?|for the (?:rest|remainder) of (?:this|the|our) (?:chat|conversation|convo|session|thread)|in this (?:chat|conversation|convo|session)|be|a bit|a little|a lot|much|way|the|a|an|your|more|less)`;
/** A request put to Socria: "can you", "I want you to", "let's", "you can", "give me". */
const REQUEST_FRAME = String.raw`(?:(?:can|could|would|will) you(?: be able to)?|can we|could we|shall we|i (?:want|need|wish) you to|i(?:'d| would) (?:like|love|prefer) (?:you|it if you) to|i(?:'d| would) (?:like|love|prefer)(?! to\b)|go ahead and|feel free to|try to|make sure(?: you| to)?|let'?s|you (?:can|should|could|may|must|need to|have to)|time to|i want(?! to\b)|i need(?! to\b)|give me|let me|help me)`;
const LEAD_IN = new RegExp(String.raw`^[\s,;:!.—–-]*(?:(?:${LEAD_WORDS}|${REQUEST_FRAME})(?![\w'’])[\s,;:!.—–-]*)*$`, 'i');
/**
 * Before words that END something MR keeps in force (a revocation of their
 * stop), a hedge is still their word: "I think you can ask me questions
 * again", "I guess", "turns out I do want you to", "why don't you ask me some
 * questions?". A miss there is not "MR does nothing": it keeps enforcing the
 * instruction they just took back. (Never for what STARTS something.)
 */
const HEDGE_WORDS = String.raw`(?:i think|i guess|i suppose|i reckon|i reali[sz]e(?: now)?|i(?:'ve| have)? decided|turns out|on reflection|thinking about it|in fact|we can|it'?s (?:ok(?:ay)?|fine|alright)(?: if| for)?|why don'?t you|you know what|i do want you to|i(?:'d| would) actually like you to|(?:i(?:'ve| have)? )?changed my mind|my bad|sorry|never ?mind|nevermind|btw|by the way)`;
const LEAD_IN_HEDGED = new RegExp(String.raw`^[\s,;:!.—–-]*(?:(?:${LEAD_WORDS}|${REQUEST_FRAME}|${HEDGE_WORDS})(?![\w'’])[\s,;:!.—–-]*)*$`, 'i');
/** Where a sentence starts: what a revocation must open (after hedges) — "In an interview, you should ask questions" is advice, not one. */
const SENTENCE_EDGE = /[.!?;\n]/;
/**
 * Words put in somebody else's mouth just before: "She said: no more
 * questions", "Her text just says: stop asking me questions", "Rule of our
 * club: don't save any of this". What follows the colon is theirs, not an
 * instruction to Socria.
 */
const REPORTED_THING = String.raw`(?:text|texts|message|note|email|letter|sign|door|poster|sticker|shirt|t-shirt|mug|rule|rules|motto|mantra|slogan|catchphrase|saying|phrase|line|feedback|advice|comment|review|caption|headline|title|quote|policy|instructions?)`;
/** Words on a thing, handed over with a comma ("The sign on his door, stop asking me questions, is that a joke?") — never their own text ("Here's my cover letter, just fix the grammar"). */
const SIGNAGE = String.raw`(?:sign|door|poster|sticker|shirt|t-shirt|mug|motto|mantra|slogan|catchphrase|saying)`;
const REPORTED_BEFORE = new RegExp(
  String.raw`\b(?:said|says|say|told|asked|wrote|writes|replied|reply|answer(?:ed)?|interviewer|me|${REPORTED_THING})\b[^.!?;:]{0,40}[:—–-]\s*$|\b(?:says|said|goes|went|texted|wrote|writes|asked|asks|yells|yelled|keeps saying|kept saying|likes to say|used to say|always says|${SIGNAGE})\b(?: like)?[^.!?;:,]{0,30},\s*$`,
  'i'
);
/**
 * Words after an instruction that start a part of the sentence about
 * something else: "quiz me on hiragana BEFORE my test tomorrow", "…FOR my
 * trip next week", "…BECAUSE I fly out tomorrow", "now RATHER THAN later".
 * A time word after them dates the test or the trip, not the instruction.
 */
const ABOUT_SOMETHING_ELSE = /\b(?:because|cause|since|before|for|until|till|than|so that|ahead of|in time for|after (?!i\b|we\b))\b/i;
/** Where the clause an instruction sits in starts: punctuation, a dash, a bracket, a quote, or a joining word. */
const CLAUSE_EDGE = /[.!?;:,()[\]\n"“”]|\s[—–-]\s?|\s(?:and|but|so|then|or|plus)\s/i;
/** The same, without the joining words — for "always" and "never", whose subject a joining word does not change ("you always… and never…"). */
const PUNCT_EDGE = /[.!?;:,()[\]\n"“”]|\s[—–-]\s?/;
/** Put off until later: "next week", "tomorrow", "when I'm back", "later, not now". */
const DEFERRED = /\b(?:later(?: on| today| tonight)?|tomorrow|tonight|next (?:week|time|month|session|class|lesson|day|semester|term)|some ?(?:other )?time|another (?:time|day)|one day|someday|in (?:a|an|\d+|a few|a couple of) (?:minutes?|hours?|days?|weeks?|months?)|(?:when|once|after) (?:i|we)(?:'m|'re|'ve| am| are| have)? ?(?:get |come |am |are )?(?:back|done|home|finished|ready|through|read|finish)\b|not (?:now|yet|today|tonight|right now))\b/i;
/** A question put by the request itself ("can you…?", "could we…?"), not a bare instruction asked back ("Go back to asking me questions? No…"). */
const ASKS_AS_REQUEST = /\b(?:can|could|would|will|may) (?:you|we|i)\b|\bshall we\b|\bwhy don'?t you\b/i;

/** The words before `at` inside its clause. */
export function leadOf(text: string, at: number, edge: RegExp = CLAUSE_EDGE): string {
  const parts = text.slice(Math.max(0, at - 160), at).split(edge);
  return parts[parts.length - 1] ?? '';
}

/**
 * Around text[at, end): its sentence up to the end of the match's own clause
 * (what can put it off: "quiz me next week", "when I'm back, quiz me" — not
 * "stop asking me questions and quiz me tomorrow", whose "tomorrow" is the
 * quiz's), the mark the sentence closes with, and the sentence after it.
 */
function sentenceAt(text: string, at: number, end: number): { upto: string; mark: string; next: string } {
  let s = at;
  while (s > 0 && !/[.!?;\n]/.test(text[s - 1])) s--;
  let e = end;
  while (e < text.length && !/[.!?;\n]/.test(text[e])) e++;
  // after the match: to the end of its clause, and not into a part about something else
  let tail = text.slice(end, e);
  const cut = tail.search(CLAUSE_EDGE);
  if (cut >= 0) tail = tail.slice(0, cut);
  const other = tail.search(ABOUT_SOMETHING_ELSE);
  if (other >= 0) tail = tail.slice(0, other);
  // before it: the earlier clauses of the sentence ("when I'm back, quiz me"), unless they are about something else ("before my test tomorrow, …")
  const before = text.slice(s, at);
  const lead = ABOUT_SOMETHING_ELSE.test(before.trim().split(/\s+/)[0] ?? '') ? '' : before;
  const mark = text[e] ?? '';
  const n = /^\s*([^.!?;\n]{0,40})/.exec(text.slice(e + 1));
  return { upto: lead + text.slice(at, end) + tail, mark, next: n ? n[1] : '' };
}
/** A short sentence after it that puts it off: "Quiz me. Not now though." */
const DEFERS_NEXT = /^(?:but |though )?(?:not (?:now|yet|today|tonight|right now)|later|tomorrow|some ?other time|another time|next (?:week|time))\b/i;

/**
 * Does `re` match somewhere it is an instruction to Socria (see above)? With
 * `notAsked`, a match whose sentence is a bare question ("Go back to asking
 * me questions?") does not count unless the question is the request itself
 * ("can you…?"). With `forOthers`, a match whose sentence goes on to make it
 * somebody else's ("…that I can give my kids") does not count. With
 * `edge`, the clause is cut only where that pattern says.
 */
export function addressed(re: RegExp, text: string, opts: { notAsked?: boolean; forOthers?: RegExp; edge?: RegExp; hedged?: boolean; noDefer?: boolean } = {}): boolean {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    if (m[0].length === 0) {
      g.lastIndex++;
      continue;
    }
    // from the first word of the match: a pattern may open on the punctuation before it ("Correct! Next question?")
    const w = m[0].search(/[\p{L}\p{N}]/u);
    const at = m.index + Math.max(0, w);
    const end = m.index + m[0].length;
    const lead = leadOf(text, at, opts.edge);
    if (!(opts.hedged ? LEAD_IN_HEDGED : LEAD_IN).test(lead)) continue;
    // the words named, not said: "Get to the point is my manager's favourite phrase"
    if (MENTIONED.test(text.slice(end, end + 24))) continue;
    // somebody else's words, reported: "she said: no more questions"
    if (REPORTED_BEFORE.test(leadOf(text, at, SENTENCE_EDGE).slice(0, Math.max(0, leadOf(text, at, SENTENCE_EDGE).length - lead.length)))) continue;
    const { upto, mark, next } = sentenceAt(text, at, end);
    if (!opts.noDefer && (DEFERRED.test(upto) || DEFERS_NEXT.test(next))) continue;
    if (opts.notAsked && mark === '?' && !ASKS_AS_REQUEST.test(lead + m[0])) continue;
    if (opts.forOthers && opts.forOthers.test(text.slice(end, end + 120).split(/[.!?;\n]/)[0])) continue;
    return true;
  }
  return false;
}

/** What follows words that are named rather than said: "… is my manager's favourite phrase", "… means" — never a question's "… is it". */
const MENTIONED = /^["'’”]?\s+(?:is|was|are|were|means|meant|sounds|seems|has always been)\s+(?!(?:all|exactly what|the only thing|everything|it|this|that|there|they|he|she|i|we|you)\b|what (?:i|i'?m|i'?d|i'?ve|we)\b)/i;

/** A clause ends here: punctuation, the end, or a word that closes the thought ("I don't get it either"). */
const CLAUSE_END = String.raw`(?=\s*(?:[.,;:!?)]|$|\b(?:either|at all|anymore|any more|still|yet|sorry|lol|tbh|honestly|but|and|though|now|please)\b))`;

/**
 * Somebody else doing it, or them doing it, now or later: "I'll go step by
 * step", "let me do it step by step", "I have to solve it step by step for
 * the exam", "I need to double-check with my professor", "they show it step
 * by step in the lecture". Not "you": "can you explain it step by step" is
 * the request itself.
 */
const NOT_A_REQUEST = String.raw`(?<!\b(?:(?:i|we)(?:'ll|'d|'m going to|'re going to| will| would| am going to| are going to| can| could| should| must| might| need to| have to| want to| had to| got to| plan to| tried to| try to| was going to)?|let me|they|he|she) )`;

/**
 * A choice handed over: "just pick one", "you decide", "pick one for me",
 * "make the call for me". A direct request for Socria's answer to the choice
 * (Core 4 still keeps the decision theirs; the reply gives its pick and why).
 * Not "help me pick one" or "I can't decide". Misses: "whatever you think".
 */
export const PICK_FOR_ME = /\b(?:you (?:pick|choose|decide)(?: for me)?|(?:^|just |please |can you |could you )(?:pick|choose) (?:one|for me)|pick one for me|decide for me|make the (?:call|decision) for me)\b/i;

/**
 * "show me the steps", "step by step", "just the steps", "walk me through the
 * steps", "list the steps", "what are the steps", "break it into steps".
 * "Step by step" counts only after a request verb (or opening the message),
 * and not after "I'll" / "let me": "I worked through it step by step" is a
 * report. Misses: "how do I do this, one thing at a time", "numbered please".
 */
export const SHOW_STEPS = new RegExp(
  [
    String.raw`${NOT_A_REQUEST}\b(?:show|give|tell|list|write out|lay out) (?:me )?(?:all |just |only )?(?:the |all the |each of the )?(?:\w+ )?steps\b`,
    String.raw`\bjust the steps\b`,
    String.raw`\bonly the steps\b`,
    String.raw`\bsteps only\b`,
    String.raw`\bwalk me through (?:the |each |all the |all of the )?(?:\w+ )?steps\b`,
    String.raw`\bwhat are the steps\b`,
    String.raw`\b(?:break|split) (?:it|this|that) (?:down )?into (?:\w+ )?steps\b`,
    String.raw`${NOT_A_REQUEST}\b(?:explain|show|solve|do|go through|walk me through|break (?:it|this|that) down|take me through|lay (?:it|this|that) out|write (?:it|this|that) out|work through|answer)\b[^.?!]{0,40}\bstep[- ]by[- ]step\b`,
    // the whole request ("step by step please"), not a report that opens with it ("Step by step, I got 12")
    String.raw`^(?:please |pls |ok,? |okay,? )?step[- ]by[- ]step(?=\s*(?:[.!?]|please|pls|$))`,
    String.raw`\bstep[- ]by[- ]step,? please\b`,
    String.raw`\b(?:a|the) step[- ]by[- ]step (?:guide|walkthrough|breakdown|solution|explanation|list|version)\b`,
  ].join('|'),
  'i'
);

/**
 * Before "quiz me" / "ask me questions": somebody else does it ("the exam
 * will test me"), or it is a complaint about Socria ("you always ask me
 * questions", "why do you quiz me") — neither is a wish to be asked.
 */
const NOT_ASKED_BY_THEM = String.raw`(?<!\b(?:will|would|might|could|going to|gonna|they|he|she|it|exam|teacher|professor|tutor|boss|doctor|always|constantly|still|why (?:do|did|does|would|must) you|you just|you only)\s)`;

/**
 * After "a question" / "a problem": it is for somebody else, or about their
 * own thing, not one to be set to them — "questions to ask at the
 * interview", "questions I can ask the landlord", "a problem with my code",
 * "a question answered". (Shared by the "give me" and "can I have" forms.)
 */
const NOT_SET_TO_THEM = String.raw`(?! (?:for (?:my|our|the|his|her|their|a|an|this|that|it|these|those|each|every|some|someone|somebody|people|students|kids|children|users|customers|candidates)\b|to (?:ask|give|send|use|post|put|include|hand|share)\b|(?:i|we|they|you) (?:can|could|should|might|will|would|may) (?:ask|use|give|send|post)\b|(?:with|in) (?:my|our|this|the|your)\b|answered\b|about (?:my|our) \w+|(?:people|guests|they|interviewers|customers|kids|students|parents) (?:usually |often |always |might |would |could |tend to )?(?:ask|get asked|say|use)\b|(?:that|which) (?:people|beginners|users|guests|they)\b))`;

/**
 * Asking to be quizzed or set problems: "quiz me", "test me", "give me a
 * practice problem", "another question please" (the whole message), "I
 * want to practise". Not questions written for somebody else ("write 5
 * questions for my students", "questions to ask at the interview"), not a
 * code test ("write me a test for this function", "a test case" — "test" as
 * a noun counts only as a practice / mock / sample test), not their own next
 * question ("Next question: how do I sort a list?", "I have one more
 * question, though"), and not somebody else testing them ("the exam will
 * test me on chapter 3"). A false positive here is costly: a quiz keeps the
 * answer back for the rest of the conversation. Misses: "can you check if I
 * know this", "hit me with one", "give me a practice problem for the exam".
 */
export const QUIZ = new RegExp(
  [
    String.raw`${NOT_ASKED_BY_THEM}\b(?:quiz|test|drill) me\b`,
    // not "exercises" on their own ("exercises to strengthen my knee", "3 exercises I can do at my desk"), not "a problem list"
    // a question or a quiz set to them; "problems" only as ones to solve ("practice problems", "5 problems on derivatives"), never "problems with nuclear energy"
    String.raw`\b(?:give|send|set|make|write) me (?:a |an |another |one more |some |a few |a couple (?:of )?|more |\d+ |two |three |four |five |ten )?(?:(?:new|more|similar|harder|easier|quick|short|practice|sample|exam[- ]style|exam|mock|review|tricky) )*(?:(?:question|quiz|drill)s?|practice exercises?|(?:practice|mock|sample) (?:test|exam)s?)\b(?![- ](?:list|statement|solver|area|description|log)\b)${NOT_SET_TO_THEM}`,
    String.raw`\b(?:give|send|set|make|write) me (?:a |an |another |one more |some |a few |a couple (?:of )?|more |\d+ |two |three |four |five |ten )?(?:(?:new|more|similar|harder|easier|practice|sample|exam[- ]style|tricky|maths?|math|physics|chemistry|algebra|calculus|word) )+problems?\b(?![- ](?:list|statement|solver|area)\b)${NOT_SET_TO_THEM}`,
    String.raw`\b(?:give|send|set|make|write) me (?:a |an |another |one more |some |a few |a couple (?:of )?|more |\d+ |two |three |four |five |ten )?problems? (?:on|about|in|to (?:solve|practi[cs]e|try))\b`,
    // "can I have a question about the homework?" is asking to ask one
    String.raw`\bcan i (?:have|get|try) (?:a |an |another |one more |some )?(?:(?:practice|harder|easier|similar) )?(?:problem|question)s?\b(?![- ](?:list|statement)\b)${NOT_SET_TO_THEM}(?! about\b)`,
    String.raw`\b(?:can|could|shall) we (?:do )?(?:a |some )?(?:quiz|practice questions)\b(?=\s*(?:[.!?,;]|$|on\b|about\b|now\b|please\b))`,
    // the whole message, or its last sentence: "Correct! Next question?" — never a preface to a question of theirs
    String.raw`(?:^|[.!?]\s+)(?:(?:ok(?:ay)?|great|good|nice|cool|right|got it|thanks|thank you|yes|yep|correct|done|alright)[,!.]?\s+)*(?:another|one more|next|a new|a harder|an easier|a different) (?:problem|question|exercise)(?:,? please|,? pls)?(?=\s*[.!?]*\s*$)`,
    // practising a skill ("I want to practise piano", "I need to practice parallel parking") is not being quizzed by Socria
    String.raw`\blet'?s (?:do (?:a |some )?)?(?:a quiz|quiz)\b(?=\s*(?:[.!?,;]|$|on\b|about\b|me\b|now\b|please\b))`,
  ].join('|'),
  'i'
);

/** After a quiz request, the words that make it somebody else's: "…that I can give my kids", "…to hand out to my class". */
const QUIZ_FOR_OTHERS = new RegExp(
  String.raw`\b(?:that|which|so) (?:i|we) (?:can|could|will|'ll|might|want to) (?:give|use|hand|send|share|run|play|do with)\b|\bto (?:give|hand|send|share|use)(?: out)?(?: to| with)? (?:my|our|the|his|her|their)\b|\bfor (?:my|our|his|her|their|the) (?:students?|kids?|children|child|class|classes|team|son|daughter|nephew|niece|group|players?|family|friends?|guests?|readers?|audience|staff|employees|club|scouts|campers)\b`,
  'i'
);

/** Asking to be quizzed, addressed (see addressed()), and not a quiz for somebody else. */
export function quizAsked(sp: string): boolean {
  return addressed(QUIZ, sp, { forOthers: QUIZ_FOR_OTHERS });
}

/**
 * Their own "stop asking", as IFR confirms readSignals' stopQuestions: that
 * reader matches inside "don't stop asking me questions", "I never said to
 * stop asking", "why did you stop asking me questions?", "my teacher told me
 * to stop asking questions" and "don't ask me why", and a stop is the
 * strongest control MR has (every question out, for the conversation). So it
 * counts only addressed, and only in a form that is about questions.
 */
export const STOP_ASKING = new RegExp(
  [
    // "stop asking me questions", "stop asking me" — not "stop asking me what I want" (that one question),
    // not "stop asking me so many questions at once" (one at a time is still asking)
    String.raw`\b(?:stop|quit|no more|enough(?: with)?(?: the)?) (?:asking(?: me)? (?:(?:so many|all these|all the|these|any|more|any more|those|all those|stupid|silly) )?(?:questions|things|stuff)|questions|quizzing(?: me)?)\b(?!\s+(?:at once|all at once|at the same time|in one go|in one message|(?:about|on|regarding|concerning)\b(?!\s+(?:it|this|that|them|these|those)\s*(?:$|[.!?,;:)—–-]|\b(?:and|but|please|ok|okay|now|already|anymore)\b))|like|such as|related to|of|re)\b)`,
    // a bare "stop asking (me)" — not "stop asking me what I want" / "…if I'm ready" / "…about my budget" (that one question)
    String.raw`\b(?:stop|quit) asking(?:\s+me)?(?=\s*(?:$|[.!,;:)—–-]|\b(?:and|but|just|please|ok|okay|thanks|already|now|or|anymore|any ?more|altogether|completely|from now on|ever|again|for now|for today|period)\b))`,
    String.raw`\b(?:don'?t|do not) (?:ask|quiz) me (?:any )?(?:more )?(?:questions|anything)\b`,
    String.raw`\b(?:don'?t|do not) ask (?:any )?(?:more )?questions\b`,
    String.raw`\bstop answering (?:my questions )?with questions\b`,
  ].join('|'),
  'i'
);

/**
 * Asking not to be handed the answer — "don't tell me the answer", "let me
 * try it first", "hints only", "just a hint" — IFR's own reader, addressed.
 * readSignals' practiceIntent picks the last of its answer / no-answer /
 * hint readings with no negation check, so "give me the answer, not just a
 * hint", "I can't figure it out on my own" and "I don't want to figure it out
 * myself" came back as practice, and MR kept the answer back for the rest of
 * the conversation from somebody who had asked for it.
 */
export const KEEP_IT_THEIRS = new RegExp(
  [
    String.raw`\b(?:don'?t|do not) (?:tell|give|show|hand)(?: me)? (?:the |an? )?(?:answer|answers|solution|result)\b`,
    String.raw`\b(?:don'?t|do not) (?:give|tell) (?:it|the answer|anything) away\b`,
    String.raw`\bno (?:spoilers|answers|solutions)\b`,
    String.raw`\bwithout (?:telling me|giving me|revealing) (?:the (?:answer|solution)|it away)\b`,
    String.raw`\blet me (?:try|figure|work|solve|do)(?: it| this| the problem)?(?: out)?(?: first| myself| on my own)\b`,
    String.raw`\b(?:i want|i'?d like|i would like|i'?d rather|i would rather) to (?:try|figure|work|solve|do)(?: it| this| the problem)?(?: out)?(?: first| myself| on my own| for myself)\b`,
    String.raw`\bhints? only\b|\bonly (?:a )?hints?\b`,
    String.raw`\b(?:just )?(?:give me )?(?:a )?(?:hint|nudge)(?: please)?(?=\s*(?:[.!,;]|$))`,
  ].join('|'),
  'i'
);

/**
 * readSignals' wantsQuestions, confirmed: it reads "quiz me" / "test me" /
 * "ask me questions" with no negation and no subject, so "don't quiz me"
 * and "the exam will test me" came back as a wish to be asked — which would
 * revoke a standing "stop asking". IFR counts it only where this reading
 * holds too (saidPlainly, so not negated).
 */
const ASKED_TO_ASK = new RegExp(String.raw`${NOT_ASKED_BY_THEM}\b(?:quiz me|test me|ask me (?:some |a few )?questions|drill me|question me on)\b`, 'i');

/** "keep asking me", "ask away", "keep the questions coming". Misses: "your questions help me". */
/** A request whose means is questions: "Help me practise for my theory test by asking me questions". */
const BY_ASKING_ME = /\b(?:help me|can you|could you|would you|will you|please|i want you to|i(?:'d| would) like you to)\s+(?!(?:[\w'-]+\s+){0,6}?(?:stop|quit|not|don'?t|never|without|annoy\w*|bug\w*|bother\w*|wast\w*|interrupt\w*|slow\w*|embarrass\w*|pester\w*|irritat\w*|tir\w*|stress\w*|overwhelm\w*|keeps?|kept|she|he|they|his|their)\b)(?:[\w'-]+\s+){0,6}?by (?:asking|quizzing|questioning|testing) me\b/i;
export const KEEP_ASKING = /\b(?:keep (?:asking|quizzing|testing|questioning) me|keep the questions coming|ask me more questions|ask away|interview me\b(?! (?:later|tomorrow|next))|(?:do|run) a mock interview|by asking me (?:the |some |a few )?questions|question me\b|(?:let'?s )?play (?:20|twenty) questions|be my (?:socratic|quiz|interview)(?: \w+)?|ask me (?:the |some |a few )?questions one at a time)/i;

/**
 * Shorter, about Socria's replies and nothing else: "keep your answers
 * short", "tl;dr?", "wall of text", "get to the point", "explain briefly".
 * These count even when a piece of their writing is named in the message.
 * "tl;dr" counts as a request ("tl;dr?", "tl;dr please"), never as their own
 * summary line ("tl;dr: I need help with my resume"); "briefly" and "in a
 * nutshell" only where they ask ("briefly, what is it"), never where they
 * open their own account ("Briefly, I work at a bank…").
 */
/** "That's a wall of text": a complaint about the reply, said of it ("this is", "what a") — not "my emails are a wall of text". */
const WALL_OF_TEXT = /^\s*(?:(?:ugh|wow|ok(?:ay)?|hmm+|well)[\s,!.]+)*(?:(?:that'?s|that is|this is|it'?s|it is|that was|your (?:answers?|replies|messages?|responses?) (?:is|are|was|were))\s+)?(?:a |an |such a |huge |massive |total |another |another huge )?wall of text\b/i;

export const SHORTER_REPLIES = new RegExp(
  [
    String.raw`\b(?:make|keep|get) your (?:answers?|replies|responses|messages?|explanations?)(?: (?:a (?:lot|bit|little)|much|way))? (?:shorter|short|brief|briefer|concise|tighter|tight|snappy)\b`,
    String.raw`\b(?:shorter|briefer|more concise|less wordy) (?:answers|replies|responses)\b`,
    String.raw`\btl;?dr(?=\s*(?:[?.!]|please|pls|$))`,
    String.raw`\b(?:give me|i need|i want|i'?d like) (?:a |the )?tl;?dr\b`,
    String.raw`\bget to the point\b`,
    String.raw`\b(?:please|just|can you|could you|answer|explain|tell me|describe|say|put it)\s+briefly\b`,
    String.raw`^briefly[,:]? (?:what|how|why|who|which|when|where|can you|could you|explain|tell me|describe)\b`,
    String.raw`\b(?:explain|tell me|say|put|describe)\b[^.?!]{0,30}\bin a nutshell\b`,
    String.raw`\bin a nutshell,? (?:what|how|why|who|which|can you|could you|please|tell me|explain)\b`,
    String.raw`\b(?:i )?(?:don'?t|do not) need (?:an essay|a lecture|all (?:that|this)|the whole (?:essay|lecture|story))\b`,
  ].join('|'),
  'i'
);

/**
 * Shorter, where "it" may be their own text: "shorter", "make it shorter",
 * "short version please", "more concise", "less wordy". Not read when a
 * piece of their writing is named in the message — "can you make my essay
 * shorter" asks for an edit, and reading it as "shorter replies" would put
 * a conversation-long ceiling on the reply that does the edit. "Shorter"
 * counts only clause-final and never as a comparison: "which route is
 * shorter?", "which is shorter, the train or the bus?", "I'll take the
 * shorter one", "it needs to be shorter" are about something else.
 * Misses: "can you not write so much", "skip the preamble", "shorter"
 * beside a named essay even when it meant the reply.
 */
export const SHORTER = new RegExp(
  [
    String.raw`\b(?:make|keep|get) (?:it|this|that|them|things)(?: (?:a (?:lot|bit|little)|much|way))? (?:shorter|short|brief|briefer|concise|tighter|tight|snappy)\b`,
    String.raw`(?<!\b(?:is|are|was|were|be|been|being|seems?|looks?|sounds?|it'?s|that'?s|which'?s|what'?s|the|a|one|any|no)(?: (?:much|way|far|a lot|a bit|a little|even|slightly|so))? )\b(?:shorter|briefer|more concise|less wordy|more brief)(?: (?:please|answers?|replies|responses|version|explanations?|one|this time))?(?=\s*(?:[.,;:!]|$|please|thanks))`,
    String.raw`\b(?:short|brief|quick) (?:answers?|version|reply|response)(?: please| only)?(?=\s*(?:[.,;:!]|$|please))`,
    String.raw`\b(?:less|fewer) (?:text|words|rambling)\b`,
  ].join('|'),
  'i'
);

/**
 * "That's too long" — about a reply only when the subject is the reply or
 * left implicit, the clause ends on it ("it's too long to wait for the bus"
 * is not about a reply), and (in observeTurn) only when there was a reply
 * before it and no piece of their own writing is named: "my essay is too
 * long" and "it's too long, can you cut my draft" are about their text.
 */
export const TOO_LONG = new RegExp(
  String.raw`(?:^|\b(?:that'?s|this is|that was|it'?s|it is|it was|your (?:answers?|replies|responses|messages?|explanations?)(?: (?:is|are|was|were))?) )(?:way |far |much |a bit |a little |kind of |kinda |just )?too (?:long|wordy|verbose|much text|much to read)\b(?:${CLAUSE_END}|\s+to read\b|\s+for me\b)`,
  'i'
);

/**
 * Longer: "more detail", "go deeper", "explain more", "elaborate", "too
 * short". "Elaborate" counts as a request only ("can you elaborate"), never
 * the adjective ("an elaborate plan"); "go further / deeper" only as a
 * request ("can you go deeper?"), never a description ("if I go further
 * down the road"); "in depth" only asked for ("explain it in depth"), never
 * "I read an in-depth article". "No more detail" is the opposite. "Tell me
 * more about X" asks about X, not for length. A false positive here revokes
 * a "keep it short" they gave. Misses: "keep going", "and then?".
 */
export const LONGER = new RegExp(
  [
    // not "no more detail", and not what something else has or wants ("the report goes into more detail", "our client wants more depth")
    String.raw`(?<!\bno |\b(?:goes|went|wants|wanted|needs|needed|has|had|gives|gave|provides|provided|includes|included|offers|requires|required|asked for) (?:into |in |for )?)\b(?:in )?(?:more|greater|much more|a lot more|further) (?:detail|depth)s?\b`,
    // a "shorter" taken back in the ways people say it (a false reading only lifts a ceiling: the reply as without MR)
    String.raw`(?:^|[.!?]\s*)(?:way |far |much |a bit |a little )?too (?:short|brief|terse)(?=\s*[.!]?\s*$)`,
    String.raw`\b(?:that|this|it) is (?:way |far |much |a bit |a little )?too (?:short|brief|terse|thin)\b`,
    String.raw`(?<!\b(?:is|are|was|were|be|been|it'?s|that'?s|which'?s|the|a|one|lasted|lasts|took|takes|stay|stayed|lived|live|wait|waited|ran|runs|run|much|any|no)(?: (?:much|way|far|a lot|a bit|a little|even))? )\blonger(?: please| answers?| replies| version)?(?=\s*(?:[.!,;]|$|please))`,
    String.raw`\bbe more detailed\b|\bmore detailed(?: please| answers?| replies| version)?(?=\s*(?:[.!,;]|$|please))`,
    String.raw`\b(?:give me|write|provide|i want|i need|i'?d like|can (?:i|you) (?:get|have|give me)|let'?s have|go for|be) (?:a |an |the )?(?:detailed|thorough|full|complete|in-depth|longer|comprehensive) (?:explanation|answer|version|breakdown|guide|account|description|overview|reply|response|walkthrough)\b`,
    String.raw`\b(?:explain|describe|tell me about|tell me|go over|cover|discuss|walk me through|break down|write)\b[^.?!]{0,50}\bin (?:full |more |great |much more |complete )?detail\b`,
    String.raw`\bgo into (?:more |full |great |much more )?details?\b`,
    String.raw`\b(?:explain|describe|cover|answer) (?:it |this |that |them |everything )?(?:fully|in full|thoroughly|completely)\b`,
    String.raw`\b(?:the )?(?:long|full|whole|complete|unabridged) version\b`,
    String.raw`\bnormal length\b|\b(?:you )?(?:don'?t|do not) (?:have|need) to keep (?:it|them|things|your (?:answers?|replies)) short\b`,
    String.raw`\btell me everything\b|\ball the details\b|\b(?:more|lots of) details\b`,
    String.raw`(?:^|\b(?:can you|could you|would you|please|pls|let'?s|lets|now|maybe)\s+)go (?:deeper|further)\b`,
    String.raw`\bgo (?:deeper|further)(?: (?:on|into|with) (?:it|this|that))?${CLAUSE_END}`,
    String.raw`\bgo into (?:more )?detail\b`,
    String.raw`\b(?:explain|say|tell me) (?:a (?:bit|little|lot) )?more(?=\s*(?:[.,;:!?]|$|please))`,
    String.raw`\b(?:explain|describe|elaborate on|expand on) (?:it|this|that|the \w+ )?(?:further|in (?:more )?detail|more fully|more thoroughly)\b`,
    String.raw`\b(?:please |can you |could you |would you |pls )elaborate\b|^elaborate(?=\s*(?:[.!,;]|$|please|on\b|a bit|more))|\belaborate (?:on|please|a bit|more)\b`,
    String.raw`\bexpand on (?:it|this|that|the \w+)\b`,
    String.raw`\bmake (?:it|this|that|your (?:answers?|replies|responses)) (?:a (?:bit|lot|little) )?(?:longer|more detailed|more thorough)\b`,
    String.raw`\b(?:longer|more detailed|more thorough|fuller) (?:answers?|version|explanations?|replies|responses)\b`,
    String.raw`\b(?:that'?s|this is|that was|it'?s|it is|your (?:answers?|replies|responses)(?: (?:is|are|was|were))?) (?:way |far |much |a bit |a little )?too (?:short|brief|terse|thin)\b`,
    String.raw`\b(?:explain|go over|describe|cover|discuss|break down|analy[sz]e) (?:it |this |that |them )?in[- ]depth\b`,
    String.raw`\b(?:give me|i want|i need|i'?d like|can i (?:get|have)) an? in[- ]depth\b`,
  ].join('|'),
  'i'
);

/**
 * Simpler: "simpler", "plain English", "like I'm five", "ELI5", "less
 * technical", "dumb it down". The verb "simplify" is NOT read — "simplify
 * 2x + 4x" is algebra — except "simplify (your|the) explanation". Nor is a
 * comparison ("the second method is simpler") or a simpler METHOD ("is
 * there a simpler way to do this?" asks for another approach, not an easier
 * explanation). Misses: "I'm not a math person", "use an analogy".
 */
export const SIMPLER = new RegExp(
  [
    String.raw`\b(?:make (?:it|this|that) |explain (?:it |this |that )?|say (?:it|that) |put (?:it|that) )(?:a (?:bit|lot|little) )?(?:simpler|more simply|in simpler terms)\b`,
    String.raw`\b(?:explain|say|put|describe) (?:it|this|that) (?:in )?a simpler way\b`,
    String.raw`\bsimpler (?:please|explanation|terms|words|language)\b`,
    String.raw`\ba simpler version of (?:that|this|it|the explanation|your (?:answer|explanation))\b`,
    String.raw`(?<!\b(?:is|are|was|were|be|been|being|seems?|looks?|sounds?|it'?s|that'?s|which'?s|what'?s|the|a|one|any)(?: (?:much|way|far|a lot|a bit|a little|even|slightly|so))? )\bsimpler(?: please)?(?=\s*(?:[.!]|$))`,
    String.raw`\bin simple(?:r)? (?:terms|words|language)\b`,
    String.raw`\bplain (?:english|language|words)\b`,
    String.raw`\blike i'?m (?:five|5|a child|a kid|ten|10|twelve|12)\b`,
    String.raw`\beli5\b`,
    String.raw`\bless (?:technical|jargon|jargony|mathy)\b`,
    String.raw`\b(?:no|without (?:the |all the )?)jargon\b`,
    String.raw`\bdumb (?:it|this|that) down\b`,
    String.raw`\blay ?m[ae]n'?s terms\b`,
    String.raw`\bsimplify (?:your|the) (?:explanation|answer|language|wording)\b`,
    String.raw`\b(?:that'?s|that is|this is|it'?s|it is|you'?re being|that was|your (?:explanation|answer)(?: is| was)?) (?:way |far |much |a bit |a little )?too (?:technical|complicated|complex|advanced)\b`,
  ].join('|'),
  'i'
);

/**
 * Asking for verification: "double-check", "are you sure", "verify that",
 * "cite your sources", "is that right?", "how do you know?". "Double-check"
 * by them ("I'll", "let me", "I need to double-check with my professor") is
 * them checking, not a request. "Verify" needs an object and not a how-to:
 * "how do I verify that the certificate is valid" asks how. "Is that right"
 * and "how do you know" count only where the clause ends: "is this true for
 * negative numbers?" and "how do you know when to use the chain rule?" are
 * questions about the subject. Misses: "source?", "that seems off", "is
 * this true for every n, are you sure" (caught by "are you sure").
 */
export const VERIFY_ASK = new RegExp(
  [
    String.raw`${NOT_A_REQUEST}\b(?:double[- ]check|fact[- ]check|re-?check)\b`,
    String.raw`(?<!\b(?:how (?:do|can|would|should|could) (?:i|we|you|one)|i|we|to) )\b(?:please |can you |could you )?verify (?:that|this|it|your (?:answer|work|math|maths|numbers|figures|sources|claims?)|the (?:answer|result|numbers|figures|math|maths|calculation|claim))\b`,
    // not about whether they can: "are you sure you can read a file this big?"
    String.raw`\bare you (?:sure|certain|positive)\b(?! you (?:can|could|want|will|'ll|are able|have time|don'?t mind)\b)`,
    String.raw`\bcite (?:your |the |some )?sources?\b`,
    String.raw`\bwhat(?:'s| is| are) your sources?\b`,
    String.raw`\bis (?:that|this|it) (?:really )?(?:right|correct|true|accurate)(?=\s*(?:[?.!,]|$))`,
    String.raw`\bhow (?:do|can) you (?:know|be sure)(?: (?:that|this|it))?(?=\s*(?:[?.!,]|$))`,
  ].join('|'),
  'i'
);

/**
 * Edit only what they asked: "just fix the grammar", "only proofread",
 * "don't rewrite it", "just check spelling", "only the typos", "keep my
 * voice". Misses: "light touch please", "tidy it a bit" (too vague to scope).
 * The last two forms (EDIT_KEEPS) are also what a rewrite keeps: "rewrite it
 * completely, but keep my voice" asks for the rewrite.
 */
const EDIT_SCOPE = [
    String.raw`\b(?:just|only) (?:fix|correct|check|proofread|look at|clean up) (?:the |my |its )?(?:grammar|spelling|typos|punctuation|commas|mistakes|errors)\b`,
    String.raw`\b(?:just|only) (?:proofread|copy-?edit|spell-?check)\b`,
    String.raw`\bproofread (?:it|this|that|my \w+) only\b`,
    String.raw`\b(?:fix|correct|check) (?:only )?(?:the |my )?(?:grammar|spelling|typos|punctuation)(?: only| and nothing else)\b`,
    // a scope, not a description: "only the typos please", not "the only grammar rule I remember"
    String.raw`(?<!\b(?:the|my|our|an?|your) )\bonly (?:the )?(?:typos|grammar|spelling|punctuation)\b`,
    String.raw`\b(?:do not|don'?t) (?:re-?write|rephrase|reword|change (?:the|my) (?:wording|words|meaning|content|voice|style|tone))\b`,
];
const EDIT_KEEPS = [
  String.raw`\bkeep my (?:words|wording|voice|style|tone)\b`,
  String.raw`\bleave (?:the )?(?:rest|content|wording|meaning|my (?:words|wording|voice)) (?:alone|as (?:it )?is|unchanged)\b`,
];
export const EDIT_ONLY = new RegExp([...EDIT_SCOPE, ...EDIT_KEEPS].join('|'), 'i');
const EDIT_ONLY_SCOPE = new RegExp(EDIT_SCOPE.join('|'), 'i');
const EDIT_ONLY_KEEPS = new RegExp(EDIT_KEEPS.join('|'), 'i');
/** A revision asked for beside "keep my voice": then "keep my voice" is what the revision keeps, not a scope. */
const REVISES = /\b(?:make|improve|translate|turn|rewrite|redo|rework|polish|tighten|shorten|lengthen|expand|extend|revise|adapt|convert|summari[sz]e|simplify|restructure|reorder|punch up|spice up|liven up|smooth|streamline|condense|trim|cut|strengthen|soften|sharpen|rephrase|reword)\b/i;
/** From a negation to the end of its clause: what they say not to do. */
const NEGATED_CLAUSE = /\b(?:don'?t|do not|never|no need to|without|nor|not)\b[^,.;:!?\n]*/gi;

/**
 * A rewrite or new text asked for in their writing: "rewrite it completely,
 * but keep my voice", "now rewrite it", "add a conclusion", "extend it to 500
 * words", "change my wording", "turn it into a persuasive essay". An
 * edit-only scope would forbid what they asked; said later, it ends one
 * (explicit.rewrite).
 */
const REWRITE_ASKED = new RegExp(
  [
    String.raw`(?<!\b(?:don'?t|do not|never|not|no need to|without) )\b(?:re-?write|redo|rework|restructure|overhaul|rephrase|reword|improve|expand|extend|lengthen|polish up) (?:it|this|my (?:essay|draft|paper|text|writing|letter|story|piece|paragraph|intro|introduction|conclusion|post|statement|cv|resume)|the (?:whole |entire )?(?:essay|draft|paper|text|thing|piece|paragraph|intro|introduction|conclusion|section|letter|story|post|statement)|the whole thing|all of it)\b(?! (?:with|using|in (?:british|american|uk|us))\b)`,
    String.raw`\badd (?:a |an |two |three |some |more |another |a few )?(?:more )?(?:[a-z-]+ )?(?:conclusions?|introductions?|intros?|paragraphs?|sections?|endings?|examples?|sentences?|lines?|points?|quotes?|details)\b`,
    String.raw`\bwrite (?:a |an )?(?:new |better |stronger )?(?:conclusion|introduction|intro|ending|paragraph|opening|closing)\b`,
    String.raw`\bturn (?:it|this|that) into\b|\bchange (?:my|the) (?:wording|words|tone|style|voice)\b|\bmake (?:any |whatever )?changes\b|\bin your own words\b`,
  ].join('|'),
  'i'
);

/**
 * Confusion, in their words: "I still don't get it", "that doesn't make
 * sense", "I'm (still) confused", "I'm lost", "I don't follow", "you lost me".
 * Each needs the clause to end on it (or on "it/this/that/you/your
 * explanation"): "I don't understand why my build fails" is a question about
 * the build, and "it doesn't make sense that this returns null" is a report.
 * "Still … why/how" counts: "I still don't see why". Misses: "huh?", "what?",
 * "what do you mean" (a clarification request), "can you say it another way".
 */
export const CONFUSED = new RegExp(
  [
    String.raw`\bi (?:still |really |just |honestly )*(?:don'?t|do not|can'?t|cannot) (?:get|understand|follow|grasp)(?: (?:it|this|that|you|any of (?:it|this|that)|what you(?:'re| are)? (?:saying|mean|meant|said|wrote)|your (?:explanation|answer|point|reasoning)|the (?:\w+ )?(?:explanation|answer|step|part|bit|logic|reasoning|point)))?${CLAUSE_END}`,
    String.raw`\bi still (?:don'?t|do not) (?:get|understand|see) (?:how|why|what)\b`,
    String.raw`\b(?:i'?m|i am) (?:still |so |really |very |a bit |a little |kind of |kinda |completely |totally |just |even more )*(?:confused|lost)(?:${CLAUSE_END}| (?:about|by) (?:it|this|that|what you|your|the (?:\w+ )?(?:step|part|bit|explanation|answer|last)))`,
    String.raw`\b(?:that|this|it|none of (?:this|that|it)|your (?:explanation|answer)) (?:still |just |really )?(?:doesn'?t|does not|didn'?t|did not) make (?:any )?sense(?: to me)?${CLAUSE_END}`,
    String.raw`\b(?:that|this|it) (?:still )?makes no sense(?: to me)?${CLAUSE_END}`,
    String.raw`\bi(?:'m| am) not (?:following|getting (?:it|this|that))${CLAUSE_END}`,
    String.raw`\byou(?:'ve| have)? lost me\b`,
  ].join('|'),
  'i'
);

/**
 * Taking back an earlier instruction about QUESTIONS: "you can ask questions
 * again", "ask me questions again", "go back to asking me", "never mind,
 * ask away", "you can quiz me again". (Asking for questions while a "stop
 * asking" stands is a revocation too — observeTurn adds that.)
 */
export const REVOKE_QUESTIONS = new RegExp(
  [
    String.raw`\b(?:you can|you may|feel free to|it'?s (?:ok(?:ay)?|fine) to|go ahead and|ok(?:ay)? to) (?:start )?ask(?:ing)? (?:me )?(?:questions )?again\b(?=\s*(?:[.!,;]|$|please|now|if|whenever|too))`,
    // "feel free to ask questions", "you can ask questions now", "you're allowed to ask questions again", "it's OK if you ask me questions"
    String.raw`\b(?:you can|you may|feel free to|go ahead and|it'?s (?:ok(?:ay)?|fine|alright) (?:to|if you)|you'?re (?:welcome|allowed|free) to|ok(?:ay)? to|you should) (?:start )?ask(?:ing)? (?:me )?(?:(?:a|some|a few|any|more|your) )?(?:questions?|things)(?: (?:again|now|too|if you (?:need|want) to|whenever you (?:need|want)|as you like))?(?=\s*(?:[.!,;]|$|please))`,
    String.raw`\bask me (?:a|some|any|your|a few) questions?(?: (?:now|again|if you (?:need|want) to))?(?=\s*(?:[.!,;?]|$|please))`,
    String.raw`\b(?:questions|asking(?: me)?(?: questions)?) (?:is|are) (?:ok(?:ay)?|fine|good|welcome|allowed)(?: (?:again|now|with me))?(?=\s*(?:[.!,;]|$))`,
    String.raw`\b(?:you can|feel free to|go ahead and) (?:quiz|test) me (?:again|now)\b`,
    String.raw`\bask me questions again\b`,
    String.raw`\b(?:questions|asking(?: me)?(?: questions)?) (?:is|are) (?:ok(?:ay)?|fine|good|welcome) (?:again|now)\b`,
    // them, not "my surgeon": "go back to asking my physio" is about somebody else
    String.raw`\b(?:go|switch|change|get) back to (?:asking(?! (?:my|his|her|their|the|a|an|your|our|him|them|someone|somebody|people)\b)(?: me)?(?: questions)?|being socratic)\b`,
    String.raw`\bnever ?mind,? (?:ask away|(?:you can |go ahead and )?ask (?:me )?(?:questions|away))\b`,
    String.raw`\b(?:you can|feel free to) (?:quiz|test|challenge) me again\b`,
  ].join('|'),
  'i'
);

/** Taking back everything: "go back to how you were", "back to normal", "never mind, go back". */
export const REVOKE_ALL = /\b(?:(?:go|switch|change|get) back to (?:how you were|the way you were|your (?:normal|usual|default|old) (?:way|mode|self|style)|(?:the )?(?:normal|usual|default|old) (?:way|mode|style)(?=\s*(?:[.!?,;]|$|please))|normal(?=\s*(?:[.!?,;]|$|please|now|again))|how (?:it|things) (?:was|were)(?=\s*(?:[.!?,;]|$|please|before)))|never ?mind,? go back)\b/i;

/**
 * Either. Misses: "ok fine, ask", "I take that back". The observation's
 * refs say which was taken back ('revoke.questions' or 'revoke.all'), so a
 * "you can ask questions again" is not read as taking back "keep it short"
 * (lib/mr/outcome.ts).
 */
export const REVOKE = new RegExp(`${REVOKE_QUESTIONS.source}|${REVOKE_ALL.source}`, 'i');

/**
 * The words that make an instruction standing, tied to an instruction.
 * readSignals' `horizon` also fires on a bare "always" or "in general" ("I
 * always forget the chain rule"), which would make a passing preference
 * permanent; a standing reading needs both `horizon` and one of these.
 * Open-ended only: what they held to this conversation is CONVERSATION_BOUND.
 * Misses: "in general, keep it short" (in general is too often "generally").
 */
export const STANDING_WORDS = new RegExp(
  [
    // an instruction follows, not a plan of theirs: "from now on I want to focus on my essay" is a plan
    // whether an instruction follows ("from now on I want short answers") or a plan of theirs ("from now on I
    // want to focus on my essay") is read in the clause itself (standingIf), not guessed from the next word
    String.raw`\bfrom now on\b`,
    String.raw`\bgoing forward\b`,
    String.raw`\bfrom here on(?: out)?\b`,
    String.raw`\bstop being socratic\b`,
    // an instruction, not a habit of theirs or a complaint: "I always ask too many questions", "you always ask me questions"
    String.raw`(?<!\b(?:i|we|they|he|she|it|you|i'?ve|i have|you'?ve|you have) )\b(?:please )?always (?:give|tell|show|answer|keep|be|use|explain|start|lead|skip|include|put|write|make|ask|just|do)\b`,
    String.raw`\b(?:never|don'?t ever|do not ever) (?:ask|give|tell|show|explain|use|write|make|quiz|test)\b`,
    String.raw`\bin (?:all )?(?:your )?future (?:answers|replies|responses|messages)\b`,
  ].join('|'),
  'i'
);

const CONVERSATION_NOUN = String.raw`(?:chat|conversation|session|thread)`;

/**
 * An instruction they held to THIS conversation in so many words: "for the
 * rest of this chat", "for the remainder of the conversation", "until the end
 * of this session". On its own this makes an instruction last the
 * conversation (no "from now on" needed) and never crosses into another one.
 */
export const CONVERSATION_BOUND = new RegExp(
  [
    String.raw`\bfor the (?:rest|remainder) of (?:this|the|our) (?:${CONVERSATION_NOUN.slice(3, -1)}|convo)\b`,
    String.raw`\b(?:until|till) the end of (?:this|the|our) ${CONVERSATION_NOUN}\b`,
  ].join('|'),
  'i'
);

/**
 * Words that keep an open-ended instruction HERE: "in this chat", "for this
 * conversation", "just for this session", "only here", "every time you answer
 * here". Read only next to open-ended words (STANDING_WORDS): they make the
 * standing instruction this conversation's and veto carrying it anywhere
 * else. On their own they are nothing ("you said earlier in this chat…" is
 * about the past; "I always get lost in this chat" is a complaint).
 */
export const SCOPE_HERE = new RegExp(
  [
    String.raw`\b(?:in|for|during|within) this (?:${CONVERSATION_NOUN.slice(3, -1)}|convo)\b`,
    String.raw`\b(?:only|just) (?:here|in here|for now|for today|today)\b`,
    String.raw`\bhere only\b`,
    String.raw`\b(?:until|till) we(?:'re| are)? (?:done|finished)(?: here)?\b`,
    String.raw`\b(?:answer|reply|respond|talk|chat|write)(?:s|ing)? (?:to me )?(?:in )?here\b`,
  ].join('|'),
  'i'
);

/**
 * Ending the quiz itself, beyond readSignals' endQuiz ("let's stop there",
 * "that's enough for today", "I'm done for now"): "no more quiz", "stop the
 * quiz", "forget the quiz", "let's change the subject", "let's talk about
 * something else", a bare "let's switch", "let's move on to my essay". Not
 * "let's move on", "let's switch to harder ones" or "let's change the topic
 * to African capitals":
 * inside a quiz those are the next question. And never in a message that
 * also asks for another one (readExplicit). Misses: "ok, something else",
 * "can we talk about my essay now".
 */
export const END_PRACTICE = new RegExp(
  [
    String.raw`\blet'?s (?:stop (?:the )?(?:quiz|quizzing|practice|practising|practicing)|change (?:the )?(?:topic|subject)s?(?!\s+to\b(?!\s+(?:my|our|something)\b))|switch (?:topics|subjects)(?!\s+to\b(?!\s+(?:my|our|something)\b))|switch(?=\s*(?:[.!,;]|$))|(?:switch|move on|go|get) (?:back )?to (?:my|our|something else|another (?:topic|subject|thing))\b|talk about something else|do something else|move on to something else|call it a day|take a break|pause (?:the |this )?(?:quiz|practice)|wrap (?:it )?up)\b`,
    String.raw`\b(?:no more|stop the|end the|enough) (?:quiz|quizzes|quizzing|practice)\b`,
    String.raw`\b(?:forget|drop|skip|cancel|end|pause|finish) the (?:quiz|practice)\b`,
    String.raw`\b(?:i'?m|i am) (?:done|finished|through) with (?:the |this |these |all the )?(?:quiz|quizzes|quizzing|practice)\b`,
    String.raw`\b(?:i )?(?:don'?t|do not) want to (?:do )?(?:the |this |any more |anymore )?(?:quiz|quizzes|practice)(?: (?:any ?more|now))?\b`,
    String.raw`\bthat'?s (?:it|all|enough) for (?:the|this) (?:quiz|practice)\b`,
    String.raw`\b(?:the )?quiz(?:'s| is)? over\b`,
    String.raw`\b(?:can|could) we (?:take a break(?: from (?:the |this )?(?:quiz|practice))?|do something else|stop (?:the )?(?:quiz|practice)|move on to something else|talk about something else)\b`,
    String.raw`\bthanks? (?:you )?for the (?:quiz|practice)\b`,
    String.raw`\b(?:don'?t|do not) (?:ever )?(?:quiz|test|drill) me (?:any ?more|again|now)\b`,
    String.raw`\b(?:stop|quit|no more|enough(?: with)?) (?:testing|quizzing|drilling)(?: me)?\b`,
    String.raw`\bstop (?:with )?the (?:quiz|questions|testing|practice)\b`,
    String.raw`\b(?:i )?(?:don'?t|do not) want (?:to be (?:quizzed|tested)|any more (?:questions|quizzes|quiz questions))(?: any ?more)?\b`,
    String.raw`\blet'?s (?:stop|end|finish)(?: (?:now|here|there|it here|it|this|the quiz))?(?=\s*(?:[.!,;]|$))`,
    String.raw`\bcan we (?:stop|end)(?: (?:now|here|the quiz))?(?=\s*(?:[.!,;?]|$))`,
    String.raw`\b(?:i'?m|i am) (?:done|finished)(?: now| for now| for today| here)?(?=\s*(?:[.!,;]|$))`,
    String.raw`\bend (?:the |this )?quiz\b`,
    String.raw`\blet'?s wrap (?:it |this |things )?up\b`,
  ].join('|'),
  'i'
);

/**
 * Their word for frustration. readSignals sets `frustration` whenever it
 * sets `stopQuestions` and then stops reading, so "stop asking me questions"
 * alone comes back frustrated; and its "come on" has no boundary, so "come
 * on over later" and "I'll come on Tuesday" came back frustrated too. So
 * explicit.frustration needs readSignals' flag AND one of these words, with
 * "come on" only as the interjection ("come on, just tell me", "come on!").
 * (The same words as lib/core4/signals.ts FRUSTRATED, which is not
 * exported.)
 */
export const FRUSTRATION_WORDS = /\b(?:(?:frustrat(?:ed|ing)|annoy(?:ed|ing)|ugh+|i(?:'ve| have) been stuck|(?:this|that) (?:isn'?t|is not) helping|getting nowhere|going (?:round|around) in circles|you'?re not (?:listening|helping)|don'?t have time for)(?![a-z])|come on(?=\s*(?:[,.!?]|$|\b(?:just|man|dude|seriously|really|please|now|already)\b))|seriously\?)/i;

/**
 * Writing addressed to somebody else, with the somebody named: "write a note
 * to my student Maya", "draft an email to Sam asking…", "reply to my
 * landlord's email", "what should I text her?", "how do I word this to my
 * boss". In such a reply "you" is the reader of the draft and a question is
 * the draft's own — neither is Socria speaking to them, so MR's reply filters
 * (no questions, no claims that they improved, no check-ins) leave it alone
 * (lib/mr/index.ts). A recipient is required: "write a SQL query that returns
 * the response code" and "how can I tell if my starter is ready?" are not
 * drafts. Misses: "make this sound friendlier" with a pasted text.
 */
const DRAFT_THING = String.raw`(?:note|email|e-mail|message|text|letter|card|toast|speech|announcement|bio|caption|tweet|dm|invitation|invite|thank[- ]you(?: note)?|eulogy|vows|cover letter|recommendation|reference)s?(?![- ]?(?:classifier|parser|validator|queue|bot|app|template|editor|field|box|file|format|generator|model|pipeline|summari[sz]er|analy[sz]er|detector|extractor|tool)s?\b)`;
/** A person: a role or a relation, "him/her/them", or — after "to" only — a name or initials ("to Sam", "to HR"). */
const PERSON = String.raw`(?:boss|manager|landlord|landlady|teacher|professor|tutor|student|students|friend|friends|best friend|bestie|mom|mum|mother|dad|father|parents|sister|brother|partner|wife|husband|spouse|fianc[eé]e?|girlfriend|boyfriend|son|daughter|kid|kids|child|children|grandson|granddaughter|nephew|niece|baby|family|client|clients|customer|customers|colleague|colleagues|coworker|coworkers|co-worker|neighbou?r|neighbou?rs|doctor|tenant|coach|player|players|grandma|grandpa|grandmother|grandfather|aunt|uncle|cousin|roommate|roommates|team|class|group|members|volunteers|readers|followers|audience|guests|fans|mentor|mentee|crew|staff|employees|interviewer|recruiter|principal|everyone|him|her|them)`;
/** A name, where it stands as one: "to Sam", "to Sam about…", "to HR." — not "to Python developers". */
const NAME = String.raw`(?:[A-Z][a-z]+|[A-Z]{2,})\b(?=\s*(?:[,.!?;:]|$|'s\b|\b(?:about|that|asking|telling|saying|and|to|for|when|if|so|who|because|this|today|tomorrow|tonight|on|at|in|with|from|after|before|now|please|thanking|letting|inviting|apologi[sz]ing|explaining)\b))`;
const RECIPIENT = String.raw`(?:(?:to|for) (?:my |our |the |a |an |his |her |their |your )?(?:new |old |former |future |little |younger |older |big )?${PERSON}\b|to (?:Mr\.? |Mrs\.? |Ms\.? |Dr\.? )?${NAME})`;
/** A program, not a message: "an email validation function", "a text parser", "a reply bot". */
const CODE_WORK = /\b(?:function|parser|script|code|program|regex|query|sql|component|module|api|endpoint|bot|app|handler|validator|validation|summari[sz]er|classifier|algorithm|pipeline|macro|plugin|counter|consumer|queue|template engine|scraper|library|cli|server|database)\b/i;
export const DRAFT_FOR_OTHERS = new RegExp(
  [
    String.raw`\b(?:[Ww]rite|[Dd]raft|[Cc]ompose|[Hh]elp me (?:write|draft|word|phrase)|(?:[Cc]an|[Cc]ould|[Ww]ould) you (?:write|draft))\b(?: me)?(?: (?:a|an|the|my|some))?(?: (?:short|quick|brief|polite|formal|friendly|nice|kind|warm|thank[- ]you|follow[- ]up))*\s+${DRAFT_THING}\b[^.?!]{0,40}?\b${RECIPIENT}`,
    String.raw`\b(?:[Ww]rite|[Dd]raft) (?:my|our|the) (?:\w+ )?${PERSON} (?:a|an) (?:\w+ )?${DRAFT_THING}\b`,
    String.raw`\b(?:[Rr]eply|[Rr]espond|[Ww]rite back) to (?:my \w+'s|his|her|their|[A-Z][a-z]+'s) (?:\w+ )?(?:email|e-mail|message|text|letter|dm)\b`,
    String.raw`\b[Ww]hat (?:should|could|do|can) [Ii] (?:text|say to|write to|reply to|send to|write back to) (?:him|her|them|my \w+|${NAME})`,
    String.raw`\b[Hh]ow (?:should|do|can|could) [Ii] (?:word|phrase) (?:this|it|that|my \w+)\b`,
  ].join('|')
);

/**
 * Questions as the CONTENT of what they asked for: "write 5 interview
 * questions for my new boss", "give me a list of questions to ask the
 * landlord", "write the questions for my customer survey", "make
 * flashcards". A verb that makes them is needed — a mention is not ("I
 * already made flashcards", "stop asking me interview questions") — and
 * "give me the answers to these questions" asks for answers.
 * readSignals' requestsQuestions also reads "quiz me", "test me" and "don't
 * quiz me", which are about being asked — never content. (A practice problem
 * set for THEM is a quiz: explicit.quiz.)
 */
const QUESTIONS_AS_CONTENT = new RegExp(
  [
    // a verb that makes them: "write 5 interview questions", "give me some questions to ask the landlord", "make flashcards", "give me a riddle"
    // — never a quantity asked away ("give me less questions", "zero questions", "no more questions")
    String.raw`(?<!\bmake sure )\b(?:write|give|make|draft|generate|come up with|list|suggest|prepare|create|put together|brainstorm|compile|think of)(?: me| us)? (?:(?!(?:answers?|solutions?|responses?|feedback|zero|no|fewer|less|any|more|not|never|without|ask|asking|asked|quit|stop|don'?t|instead)\b)[\w'-]+ ){0,4}(?:questions|exam items|test items|flashcards|prompts|faqs?|icebreakers|riddles?|trivia(?: questions)?|conversation starters|surveys?|questionnaires?|polls?)\b`,
    // "I need questions for my interview", "I want some icebreakers for the meeting" — not "I want to ask you some questions"
    String.raw`\bi (?:need|want|'d like|would like) (?:a list of |a set of |some |a few |several |good |\d+ )?(?:[a-z-]+ )?(?:questions|flashcards|icebreakers|riddles|conversation starters)\b(?= (?:to ask|for|i can|we can|about|on)\b)`,
    // "what questions should I ask at the end of my interview", "what can I ask my landlord", "what should I ask my doctor about…"
    String.raw`\bwhat (?:[a-z-]+ )?questions (?:should|could|can|do|would|might|to)\b`,
    String.raw`\bwhat (?:should|can|could|do) (?:i|we) ask\b`,
    String.raw`\bhelp me (?:with|write|draft|come up with|think of) (?:the |my |some )?(?:[a-z-]+ )?(?:questions|survey|questionnaire|faq|quiz|icebreakers)\b`,
    String.raw`\b(?:write|draft|make|create|design|put together)(?: me| us)? (?:a |an |my |the |our )?(?:short |quick |simple |brief )?(?:[a-z-]+ )?(?:survey|questionnaire|poll|faq(?: page)?)\b`,
    // the words to ask or say something with: "How do I ask where the bathroom is in Spanish?", "translate…"
    String.raw`\bhow (?:do|would|can|should|could) (?:i|you|we|one) (?:ask|say|phrase|word|put)\b|\btranslat(?:e|ion|ing)\b`,
    // their own text, with a question in it, to fix: "Fix the grammar in this: where you going tomorrow?"
    String.raw`\b(?:fix|correct|proofread|check|edit|improve|rewrite|reword|rephrase|polish|tidy up|clean up|format)\b[^\n]{0,80}?:\s*\S[^\n]*\?`,
  ].join('|'),
  'i'
);

export function questionsAsContent(text: string): boolean {
  return saidPlainly(QUESTIONS_AS_CONTENT, speech(String(text ?? '').slice(0, IFR_READ_CHARS)));
}

/**
 * Asking to change a draft just asked for, and nothing else: "make it
 * warmer", "shorter please", "perfect, but sign it from both of us". Short,
 * no question in it, and an edit verb or a register word opening it.
 */
const DRAFT_REVISION =
  /^(?:(?:ok(?:ay)?|great|thanks|good|nice|perfect|lovely|hmm|now|and|also|but)[,!.]?\s+)*(?:but\s+)?(?:can you |could you |please )?(?:make (?:it|that|this)(?: (?:a bit|a little|much|way|slightly))? (?:warmer|friendlier|shorter|longer|softer|firmer|more \w+|less \w+|formal|casual|polite|professional|personal|funnier|sweeter|clearer|simpler|punchier|stronger|kinder|nicer|gentler|sound \w+)|(?:change|reword|rephrase|rewrite|tweak|shorten|lengthen|soften|redo) (?:it|that|this)\b|(?:change|remove|drop|cut|fix|swap) the (?:greeting|opening|closing|intro|introduction|ending|last line|first line|sign[- ]?off|subject(?: line)?|tone|wording|salutation|last sentence|first sentence|p\.?s\.?|signature)|add (?:a line|a sentence|a p\.?s\.?|that|my|our)\b|sign it|start it|end it|less formal|more formal|more casual|less casual|warmer|friendlier|shorter|longer|softer|firmer)\b/i;

/**
 * Their newest message asks for writing addressed to someone else
 * (DRAFT_FOR_OTHERS) — or revises one asked for just before ("make it
 * warmer" after "write a note to my boss", and "shorter please" after that).
 * Never a request for code (CODE_WORK).
 */
export function writingForOthers(text: string, previous?: readonly string[] | string | null): boolean {
  const sp = speech(String(text ?? '').slice(0, IFR_READ_CHARS));
  if (CODE_WORK.test(sp)) return false;
  if (DRAFT_FOR_OTHERS.test(sp)) return true;
  const isRevision = (x: string) => DRAFT_REVISION.test(x.trim()) && x.length < 300 && !/\?/.test(x);
  if (!isRevision(sp)) return false;
  const earlier = Array.isArray(previous) ? previous : previous ? [previous] : [];
  // back through the revisions to the request they revise (three at most)
  for (const p of earlier.slice(0, 3)) {
    const q = speech(String(p).slice(0, IFR_READ_CHARS));
    if (!CODE_WORK.test(q) && DRAFT_FOR_OTHERS.test(q)) return true;
    if (!isRevision(q)) return false;
  }
  return false;
}

/**
 * A piece of writing asked for, whoever it is for: "write a card for my son
 * saying how much he has improved", "draft a speech". In it, a sentence that
 * says somebody improved is the writing's own, not Socria's claim about them
 * — the claim filter leaves it (lib/mr/index.ts). (The question filters need a
 * named recipient: writingForOthers.)
 */
const WRITING_REQUEST = new RegExp(
  String.raw`\b(?:write|draft|compose|help me (?:write|draft|word|phrase)|(?:can|could|would) you (?:write|draft))\b(?: me| us)?(?: (?:a|an|the|my|some|this|our))?(?: (?:short|quick|brief|polite|formal|friendly|nice|kind|warm|thank[- ]you|follow[- ]up|sweet|heartfelt|funny|birthday|congratulations|congratulatory|encouraging|supportive|little|proud))*\s+${DRAFT_THING}\b`,
  'i'
);
/**
 * Their own words to rework: "make this feedback for my student sound
 * warmer", "proofread this comment", "translate into English: …". The reply
 * is that writing, and a sentence in it that says somebody improved is the
 * writing's.
 */
const REWORK_REQUEST = /\b(?:proofread|re-?write|rephrase|reword|edit|polish|tidy(?: up)?|translate|correct|improve|soften|make)\b[^.?!]{0,40}?\b(?:this|that|these|the following|my|his|her|their)\b(?:\s+[a-z-]+){0,3}\s+(?:sound|read|more|less|warmer|kinder|clearer|better|into|in|for|to)\b|\b(?:proofread|translate|edit|polish|tidy up|rephrase|reword)\b(?:\s+(?:this|that|it|the following|my|into \w+))?\s*:/i;
export function writingAsked(text: string, previous?: readonly string[] | string | null): boolean {
  if (writingForOthers(text, previous)) return true;
  const raw = String(text ?? '').slice(0, IFR_READ_CHARS);
  const sp = speech(raw);
  if (CODE_WORK.test(sp)) return false;
  return WRITING_REQUEST.test(sp) || REWORK_REQUEST.test(sp) || REWORK_REQUEST.test(raw);
}

// ── off the record, in so many words ─────────────────────────────────

/**
 * A long earlier message, read for what can put a conversation off the
 * record: its first 4,000 characters whole, and beyond them every passage
 * where the record is mentioned ("…This whole conversation is off the
 * record.", 5,000 characters in). The persist policy reads each piece in
 * order, as it reads the messages (lib/mind/logos-turn.ts).
 */
const RECORD_WORDS = /off the record|on the record|remember|save|keep|store|log|forget|private|confidential|between us/gi;
export function recordPieces(text: string): string[] {
  const t = String(text ?? '');
  if (t.length <= 4000) return [t];
  // the passages, merged where they touch, from just before the cut (a phrase across it is read whole)
  const spans: [number, number][] = [];
  const g = new RegExp(RECORD_WORDS.source, 'gi');
  g.lastIndex = 3800;
  let m: RegExpExecArray | null;
  while ((m = g.exec(t)) && spans.length < 64) {
    const a = Math.max(3800, m.index - 160);
    const b = Math.min(t.length, m.index + m[0].length + 160);
    const last = spans[spans.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else spans.push([a, b]);
  }
  // ONE text for the message, so the persist policy reads it as the message it is: an "off the record" and a
  // later "remember this ratio" in one message keep it off the record, as a whole message would
  return [[t.slice(0, 4000), ...spans.map(([a, b]) => t.slice(a, b))].join(' … ')];
}


/**
 * A new question about something else: "Great. What is the capital of
 * Australia?" after "…the derivative of x^2 sin x? Let me try it first." —
 * not another attempt ("is it 2x cos x?") and nothing about the same problem.
 * Ends "let me try it first" (lib/mr/state.ts): what they ask next is asked for.
 */
/** A new problem asked for, not an attempt: "How do I solve 3x + 5 = 11?", "Can you solve…", "Now find…". */
const NEW_PROBLEM = /^\W*(?:(?:ok(?:ay)?|now|next|and|so)[\s,.!:]+)*(?:(?:a |another )?(?:new|different|next|other) (?:one|problem|question|exercise)\b[\s,.!:—–-]*)?(?:how (?:do|can|would|should) (?:i|you|we)|can you|could you|please|tell me|explain|show me|help me|solve|find|calculate|compute|work out|determine|evaluate|differentiate|integrate|simplify|factori[sz]e|expand|prove|what(?:'s| is))\b/i;
/** Asking for a hint is going on with it, not moving on ("Can you give me a hint?", "a clue?", "a nudge"). */
const HINT_ASKED = /\b(?:hint|clue|nudge|tip|first step|where (?:do|should) i start|how do i (?:start|begin))\b/i;

export function movedOn(from: string, now: string, prev: string | null = null): boolean {
  const n = speech(String(now ?? '').slice(0, IFR_READ_CHARS)).trim();
  const asks = /\?/.test(n) || NEW_PROBLEM.test(n) || /^\s*(?:(?:ok(?:ay)?|now|so|and|great|thanks|please|just|can you|could you)[\s,.!]+)*(?:tell|explain|write|summari[sz]e|list|translate|describe|give|show|help|what|how|why|which|who|when|where)\b/i.test(n);
  if (!asks || HINT_ASKED.test(n)) return false;
  // a short attempt at their problem ("is it 2x cos x?", "x = 3?") is not moving on
  if (wordCount(n) <= 8 && /[=+*/^<>≤≥√∫∑π]|\b\d+\s*[a-z]\b|\b[a-z]\s*=/.test(n) && !NEW_PROBLEM.test(n)) return false;
  const words = (x: string) => new Set([...tokensOf(x)].filter((w) => /[a-z]{3,}/.test(w) && !/^(?:what|how|why|which|when|where|who|tell|explain|give|show|help|please|now|answer|question|first|try|let)$/.test(w)));
  // the problem — and, for a short question back, what Socria last said about it ("Which rule applies?" → "The product rule?")
  const shortBack = /\?\s*$/.test(n) && wordCount(n) <= 5;
  const a = words(speech(String(from ?? '').slice(0, IFR_READ_CHARS)) + (shortBack ? ' ' + String(prev ?? '').slice(-IFR_READ_CHARS) : ''));
  const b = words(n);
  if (b.size < 1) return false;
  for (const w of b) if (a.has(w)) return false;
  return true;
}

/** A piece of their own writing named: "my essay", "the draft", "this cover letter". */
export const WRITING_NAMED = /\b(?:my|our|the|this|that) (?:\w+ ){0,2}?(?:essay|draft|paper|letter|story|statement|thesis|dissertation|report|article|poem|speech|email|e-mail|post|chapter|manuscript|application|resume|résumé|cv|abstract|blog|novel|script|introduction|conclusion|paragraph)s?\b/i;
const WRITING_EDIT = /\b(?:grammar|spelling|typos?|punctuation|proofread\w*|wording|my voice)\b/i;

/**
 * A reply of theirs short enough to read as a hypothesis: 3 words or fewer.
 * Not when it asks for something ("next", "go on", "continue" are requests),
 * not when it is an attempt (a digit or an operator: "2x", "x = 3"), not
 * when it carries any explicit code ("shorter", "ugh", "quiz me").
 * (Whitespace-separated, so it cannot backtrack on a 6000-character token.)
 */
export const SHORT_REPLY = /^\s*\S+(?:\s+\S+){0,2}\s*$/;
const SHORT_REQUEST = /^(?:continue|go on|keep going|carry on|proceed|next(?: one)?|more|again|go ahead|do it|help|please|yes please|another(?: one)?|one more)\b/i;
const ATTEMPT = /[\d=+*/^<>≤≥√∫∑π]/;

/** Asking for another one is asking for more, not for the same thing again. */
const ASKS_FOR_MORE = /\b(?:another|next|one more|a new|a different|more)\b/i;
/**
 * Asking for the next question of the same quiz ("give me another", "next
 * one", "a harder one"): the quiz goes on. Not "one more thing", "a
 * different question: how do I…" or "next question: …" — their own.
 */
/** The last question in a reply (its last sentence ending in "?"), or ''. */
function lastQuestionOf(reply: string | null): string {
  const t = String(reply ?? '').slice(-600);
  const q = t.lastIndexOf('?');
  if (q < 0) return '';
  // (linear: scanning back from the last "?" to the sentence before it)
  let start = q - 1;
  while (start >= 0 && !/[.!?\n]/.test(t[start])) start--;
  return t.slice(start + 1, q + 1);
}
/** Socria's offer to go on: "Want another one?", "Ready for the next?", "Shall we keep going?", "More?" */
const OFFERED_MORE = /\b(?:another(?: one| question| round)?|one more|more|the next(?: one)?|next one|keep going|go on|carry on|continue|again)\b[^?]*\?\s*$/i;
/** A decline of it: "No thanks.", "No, that's enough.", "I'm good.", "Maybe later.", "That will do." — not "No, give me a harder one". */
const DECLINES = /^\W*(?:(?:no|nope|nah)\b(?![\s,.!—–-]*(?:wait|actually|but|give|next|another|one more|harder|easier|i (?:want|think)|keep|go on|more\b(?!,? thanks)))|not (?:right )?now\b|maybe (?:later|another time)\b|later\b|i'?m (?:good|ok(?:ay)?|fine|all set|done)\b|that'?s (?:all|it|enough)\b|no more\b|that(?:'ll| will) do\b|let'?s (?:leave|stop|end) (?:it|there|here)\b|all good\b|we'?re good\b)/i;
const ASKS_FOR_ANOTHER = /\b(?:give me another(?: one| problem)?(?=\s*(?:[.!?,;]|$|please))|another one|one more(?! (?:thing|question)\b)(?=\s*(?:[.!?,;]|$|please|one|problem))|next one|an? (?:harder|easier|tougher|trickier|simpler|different|new) (?:one|question|problem)|(?:harder|easier|tougher|trickier) ones)\b/i;

const STOPWORDS = new Set(
  'a an the and or but if of to in on at for with by from as is are was were be been being it its this that these those i me my we our you your he she they them their what which who whom how why when where can could would should will shall do does did done have has had not no so just please also than then there here about into over again some any all very really ok okay yes yeah hi hey thanks thank im dont doesnt didnt cant wont isnt whats thats its ive id ill get got want need like make'.split(' ')
);

// ── each message, read once ──────────────────────────────────────────

type ExplicitCode = Extract<ObservationCode, `explicit.${string}`>;

/** How sure each explicit reader is that the words mean what the code says. */
const EXPLICIT_WEIGHT: Record<ExplicitCode, readonly [Strength, number]> = {
  'explicit.direct_answer': ['strong', 0.95],
  'explicit.show_steps': ['strong', 0.95],
  'explicit.stop_questions': ['strong', 0.95],
  'explicit.wants_questions': ['strong', 0.9],
  'explicit.quiz': ['strong', 0.9],
  'explicit.own_try': ['strong', 0.9],
  'explicit.shorter': ['strong', 0.9],
  'explicit.longer': ['strong', 0.85],
  'explicit.simpler': ['strong', 0.85],
  'explicit.verify': ['strong', 0.85],
  'explicit.own_work': ['strong', 0.9],
  'explicit.edit_only': ['strong', 0.9],
  'explicit.rewrite': ['strong', 0.85],
  'explicit.learning_goal': ['strong', 0.9],
  'explicit.confused': ['strong', 0.9],
  'explicit.revoke': ['strong', 0.9],
  'explicit.end_practice': ['strong', 0.9],
  // SATISFACTION ONLY. "Thanks, that helped" says how the reply felt, not
  // whether anything was learned or done (the proxy-gaming guard): capped at
  // 0.5 and never read as a success by itself (lib/mr/outcome.ts).
  'explicit.positive': ['moderate', 0.5],
  'explicit.negative': ['strong', 0.85],
  // Their word, but what it is about (Socria, the problem, their day) is not
  // read, and "come on" has other meanings: moderate.
  'explicit.frustration': ['moderate', 0.75],
  'explicit.standing': ['strong', 0.9],
};

/** The preferences "from now on" can make standing. Feelings and reactions cannot be standing. */
const STANDABLE = new Set<ObservationCode>([
  'explicit.direct_answer',
  'explicit.show_steps',
  'explicit.stop_questions',
  'explicit.wants_questions',
  'explicit.quiz',
  'explicit.shorter',
  'explicit.longer',
  'explicit.simpler',
  'explicit.verify',
  'explicit.edit_only',
]);

interface Own {
  /** what they said to Socria (quotes and code gone) */
  sp: string;
  /** words in sp */
  words: number;
  /** words in the whole message, pasted material included */
  rawWords: number;
  /** explicit codes this message alone carries (revocation-by-asking is added in observeTurn) */
  codes: Set<ExplicitCode>;
  /** an attempt: a digit or an operator */
  attempt: boolean;
  /** 3 words or fewer, no request, no attempt, no explicit code */
  short: boolean;
  /** content words, for repeat detection */
  tokens: Set<string>;
  /** the numbers in it, in order — two requests with different numbers are different requests */
  nums: string;
  askMore: boolean;
  writing: boolean;
  /** questionLoad of the reply after it; null when there is none */
  replyLoad: number | null;
}

// One reading per TurnView object: observeTurn looks back over earlier turns
// on every call, and the replay calls it for every turn. A WeakMap, so the
// reading (which holds their words) goes when the request's views do —
// nothing is cached across requests.
const OWN = new WeakMap<TurnView, Own>();

function tokensOf(sp: string): Set<string> {
  return new Set(
    sp
      .toLowerCase()
      .replace(/['’]/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  );
}

/**
 * The explicit codes one message carries, read from its text and its
 * signals — the message alone (asking for questions while a "stop asking"
 * stands is a revocation only observeTurn can see). Exported for docs and tests.
 */
export function explicitCodesOf(text: string, s: ExplicitSignals, opts: { hadReply?: boolean; shorterCeiling?: number; prevReply?: string | null } = {}): ExplicitCode[] {
  return [...readExplicit(speech(text.slice(0, IFR_READ_CHARS)), s, opts.hadReply ?? true, opts.shorterCeiling ?? null, true, opts.prevReply ?? null)];
}

/**
 * readSignals' `sentences` and `requestedTokens` read any count: "which of
 * these two sentences is shorter?" comes back as two sentences, and "my
 * essay is about 200 words" as 280 tokens — neither a length they asked for.
 * These are the forms that ask: "in one sentence", "in under 100 words",
 * "at most 50 words", "100 words or less", "keep it to two sentences".
 */
const ASKED_SENTENCES = /\b(?:in|into|as|give me|write|draft(?: me)?|just|max(?:imum)?|at most|exactly|under|no more than|within|keep it (?:to|under)|summari[sz]e (?:it|this|that) in)\s+(?:one|a single|two|three|[1-3])\s+sentences?\b|^(?:one|a single|two|three|[1-3])\s+sentences?(?: please| max(?:imum)?)?[.!]?$/i;
const ASKED_WORDS = /\b(?:in (?:about |around |roughly |under |less than |fewer than |no more than |at most )?|under |at most |max(?:imum)? |no more than |within |keep it (?:to |under )|less than |fewer than )~?\d{2,4}\s*words\b|\b\d{2,4}\s*words (?:or (?:less|fewer)|max(?:imum)?|tops)\b/i;

/**
 * A length they asked for is "shorter" when it is a sentence count of 3 or
 * fewer ("in one sentence"), or a word count under the policy's own "shorter"
 * ceiling ("in under 100 words"), and the words ask for it (ASKED_SENTENCES,
 * ASKED_WORDS). Without a ceiling only the sentence count is read.
 */
/** A refusal of length, anywhere in the message: "don't give me the long version", "skip all the details", "spare me", "no thanks". */
const REFUSES_LENGTH = /\b(?:(?:don'?t|do not|never|no need to) (?:give|send|write|want|need|tell)(?: me)?|no need for|skip|spare me|forget|without|no(?= (?:long|full|more|detailed))|said no)\b[^.?!]{0,30}\b(?:long|longer|full|detail|details|detailed|everything|elaborate|version|explanation)\b|\bno,? thanks?\b|\bno thank you\b|\bbut i don'?t\b/i;
/** A short length asked for in the same message: "in one line", "briefly", "one sentence". */
const ASKS_SHORT_TOO = /\bin (?:one|a single|1) (?:line|sentence|word|paragraph)\b|\bone[- ]liner\b|\bbriefly\b|\bshort answer\b/i;
/** LONGER, read with the forms that need a request before them: "the long version", "a detailed explanation". */
function longerAsked(sp: string): boolean {
  if (!saidPlainly(LONGER, sp)) return false;
  // "the long version of the film", "a detailed account of the Terror yesterday", "go further back": about something else
  return !/\b(?:the )?(?:long|full|whole|complete|unabridged) version of\b|\b(?:read|watched|saw|heard|found|got) (?:a |an |the )?(?:detailed|thorough|full|complete|long)\b|\bgo further back\b/i.test(sp);
}
/** A long length asked for: "a 1000-word essay", "write 800 words on…" — above the ceiling, so "shorter" cannot hold for it. */
/** A length asked OF SOCRIA ("write me a 1000-word essay", "give me 800 words on"), not their own task's ("I need to write a 1000-word essay"). */
const ASKED_LONG = /\b(?:(?:can|could|would) you |please )?(?:write|give|draft|compose|produce|send|make)(?: me| us)? (?:a |an |about |around |roughly |at least )?(\d{1,2},\d{3}|\d{3,5})[- ]?words?\b/i;
function askedLong(s: ExplicitSignals, ceiling: number | null, sp: string): boolean {
  if (ceiling === null) return false;
  const m = ASKED_LONG.exec(sp);
  // about 1.4 tokens a word, as readSignals' own length reading; only where it is asked of Socria
  return !!m && addressed(ASKED_LONG, sp) && Number(m[1].replace(',', '')) * 1.4 > ceiling;
}
function askedShort(s: ExplicitSignals, ceiling: number | null, sp: string): boolean {
  return (s.sentences > 0 && s.sentences <= 3 && ASKED_SENTENCES.test(sp)) || (ceiling !== null && s.requestedTokens > 0 && s.requestedTokens <= ceiling && ASKED_WORDS.test(sp));
}

/**
 * A "shorter" that is about ONE reply ("write me a 100-word bio", "in one
 * sentence") rather than about Socria's replies from now on ("too long",
 * "keep it short"). The policy holds the first for the reply it was asked of
 * and the second for the conversation (ref code IFR_REF_CODES.lengthOnce).
 */
export function shorterIsOnce(sp: string, hadReply: boolean): boolean {
  const writing = WRITING_NAMED.test(sp);
  return !(saidPlainly(SHORTER_REPLIES, sp) || (!writing && saidPlainly(SHORTER, sp)) || (hadReply && !writing && saidPlainly(TOO_LONG, sp)));
}

/**
 * Two readSignals readings IFR does not take as said. "Just give me a sec"
 * matches its "just give me" (a request for the answer), and in a short
 * message "let me know" matches its "let me" (a claim on the work, which also
 * cancels a delegation in the same message: "just do it and let me know").
 * Each is read again with the phrase taken out, and what survives is what
 * they said. Only these fields change; everything else is readSignals' own.
 */
const STALL = /\b(?:just )?(?:give|let) me (?:a |one )?(?:secs?|seconds?|minutes?|min|moment|mo|bit|while|break|chance)\b|\b(?:hold on|one sec(?:ond)?|wait a (?:sec|second|moment))\b/i;
const LET_ME_KNOW = /\blet me know\b/i;
const without = (sp: string, re: RegExp) => sp.replace(new RegExp(re.source, 'gi'), ' ');

function signalsAsSaid(sp: string, s: ExplicitSignals): Pick<ExplicitSignals, 'directness' | 'delegate' | 'ownWork'> {
  let { directness, delegate, ownWork } = s;
  if (directness === 'answer' && STALL.test(sp)) directness = readSignals(without(sp, STALL)).directness;
  if (ownWork && LET_ME_KNOW.test(sp)) {
    const r = readSignals(without(sp, LET_ME_KNOW));
    ownWork = r.ownWork;
    delegate = r.delegate;
  }
  return { directness, delegate, ownWork };
}

/**
 * Where a message breaks into clauses: sentence ends, dashes, commas, and the
 * words that start a new thought ("but", "or rather", "instead").
 */
const CLAUSE_BREAK = /(?<=[.!?;])\s+|\s+[—–]\s*|\s+-\s+|,\s*|\s+(?=\b(?:but|or rather|instead)\b)/i;
/**
 * How the quiz is to run, said in a clause that asks for something: a
 * condition on their answer ("if I get it wrong", "for the ones I miss"), a
 * time in the quiz ("after each one", "at the end", "afterwards", "then show
 * me the steps"), what the quiz hands them ("just tell me right or wrong",
 * "just give me 10", "random ones", "feedback"), or what they will do with it
 * ("…and I'll name it"). Not "question", "which one" or a closing "then":
 * those are in retractions too ("no wait, just answer my question", "just
 * tell me which one is right", "no, just tell me then").
 */
const QUIZ_PROTOCOL = new RegExp(
  [
    String.raw`\b(?:if|when|whenever|once|after|unless|in case) (?:i|we|it|it'?s|that'?s|i'?m|they'?re|one is)\b`,
    String.raw`\bfor (?:the ones|each one|every one|any (?:i|we|that))\b|\bthe ones (?:i|we|that)\b`,
    String.raw`\b(?:after each(?: one| question)?|at the end|afterwards?|how i did|my score|a score|right or wrong|correct or (?:not|incorrect|wrong)|whether (?:i(?:'m| am)?|it'?s|that'?s|i got it)|answer key|one at a time|feedback|random ones?|harder ones?|easier ones?|the next one|more of them)\b`,
    String.raw`\bafter(?=\s*[.!]?\s*$)`,
    String.raw`^(?:and |so )?then\b`,
    String.raw`\band (?:i'?ll|i will|let me|i can|i'?m going to) (?:name|guess|say|answer|translate|tell you|try|give you|spell|write|work)\b`,
    String.raw`\bjust (?:give|tell|show) me (?:\d+|ten|five|three|a few|some|random|harder|easier|more|another|the next)\b`,
  ].join('|'),
  'i'
);
const OPENS_CONDITION = /^(?:and |but |so )?(?:if|when|whenever|once|unless|in case)\b/i;
/** A condition on their own answers, anywhere in the clause: "if I miss one", "when I get stuck", "after each one". */
const ON_THEIR_ANSWER = /\b(?:if|when|whenever|once|unless|in case) (?:i|we|i'?m|it'?s|it is|that'?s|one is|they'?re)\b|\bafter each\b|\bfor (?:the ones|each one|any) (?:i|we|that)\b/i;
/** "Don't just tell me", "not the answer": a refusal, not a request. */
const REFUSES_IT = /\b(?:don'?t|do not|never|not|no)\s+(?:just\s+)?(?:tell|give|show|reveal|spoil)\b|\bno (?:peeking|spoilers|answers)\b/i;
/** A clause that only takes back what came before it: "scratch that", "never mind", "on second thought", "forget the quiz". */
const CANCEL_ONLY = /^(?:(?:no|nah|nope|hmm+|ok(?:ay)?|wait|actually|oh|well|um+)[\s,.!]*)*(?:scratch that|never ?mind|on second thought|forget (?:it|that|the quiz|about (?:it|the quiz))|(?:i(?:'ve| have) )?changed my mind|cancel that|no quiz)[\s,.!]*$/i;
/** Opening a later clause, the words that take back what came before: "no", "wait", "actually", "or rather", "instead". */
const RETRACTS =
  /^(?:(?:ok(?:ay)?|so|oh|well|hmm+|um+)[\s,.!:—–-]*)*(?:(?:(?:no|nah|nope)(?=[\s,.!:—–-]*(?:$|[,.!:—–-]|just\b|actually\b|wait\b|scratch\b|never\b|forget\b|instead\b|i\b|tell\b|give\b|show\b|answer\b|explain\b|list\b))|wait|actually|instead|or rather|on second thought|scratch that|never ?mind|forget (?:it|that|the quiz)|(?:i(?:'ve| have) )?changed my mind|i take (?:that|it) back)\b[\s,.!:—–-]*)+/i;

/** The retractions that say no to what came before, not only pause on it ("wait", "actually"). */
const NO_TO_IT = /\b(?:no|nah|nope|scratch that|never ?mind|forget|changed my mind|on second thought|instead|or rather|i take (?:that|it) back)\b/i;

/** One clause asks, outright, for the answer or the steps (as said: "just give me a sec" is not). */
function asksForIt(clause: string): boolean {
  if (!clause.trim() || REFUSES_IT.test(clause)) return false;
  const a = signalsAsSaid(clause, readSignals(clause));
  return a.delegate || a.directness === 'answer' || saidPlainly(SHOW_STEPS, clause);
}

/**
 * "You quiz me every time", "every time I ask you quiz me": a complaint about
 * being quizzed, not a request to be — "you" right before it, unless it is
 * a request put to them ("can you quiz me", "I want you to quiz me").
 * (addressed() already turns these away; this stays as the second check.)
 */
function quizComplaint(sp: string, re: RegExp = QUIZ): boolean {
  const g = new RegExp(re.source, 'gi');
  let m: RegExpExecArray | null;
  let asked = false;
  let complained = false;
  while ((m = g.exec(sp))) {
    const before = sp.slice(Math.max(0, m.index - 24), m.index);
    if (/\byou\s+(?:keep\s+|always\s+|just\s+)?$/i.test(before) && !/\b(?:can|could|would|will|wo|please|to|do|did|should|might|may|want|need|let)\s+you\s+$/i.test(before)) complained = true;
    else asked = true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return complained && !asked;
}

/**
 * THE NEWEST CLAUSE WINS — WHEN IT SAYS SO. A quiz (or "let me try it first")
 * and, later in the same message, a clause that asks for the answer or the
 * steps:
 *   • taken back — the later clause opens on a retraction ("no", "wait",
 *     "actually", "or rather", "instead"; "quiz me — no, just tell me the
 *     answer"), or a clause only cancels ("quiz me. Scratch that, what
 *     is…"): what follows is what they asked for;
 *   • how the quiz runs — a condition or a protocol word (QUIZ_PROTOCOL:
 *     "for the ones I get wrong, just give me the answer", "just tell me
 *     right or wrong", "just give me the symbol and I'll name it"): the quiz
 *     stands;
 *   • neither — MR cannot tell which they meant, and does not choose: both
 *     codes, the policy acts on neither, and ACS reads the message as it
 *     would without MR ({ conflict }).
 */
function quizTakenBack(sp: string): { rest: string } | { conflict: true } | null {
  const clauses = sp
    .split(CLAUSE_BREAK)
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .slice(0, 16);
  let quizAt = -1;
  clauses.forEach((c, i) => {
    if (quizAsked(c) || addressed(KEEP_IT_THEIRS, c)) quizAt = i;
  });
  if (quizAt < 0) return null;
  let marked = false;
  let refused = false;
  for (let i = quizAt + 1; i < clauses.length; i++) {
    const c = clauses[i];
    if (CANCEL_ONLY.test(c)) return { rest: clauses.slice(i + 1).join(', ') };
    const lead = RETRACTS.exec(c);
    const body = lead ? c.slice(lead[0].length) : c;
    if (lead) {
      marked = true;
      // a "no" (not a "wait" or an "actually"): what follows is theirs, even a question of their own ("no wait, just answer my question: what is…?")
      if (NO_TO_IT.test(lead[0])) refused = true;
    }
    if (!body.trim()) continue;
    const prev0 = i - 1 > quizAt ? clauses[i - 1] : '';
    const conditional = OPENS_CONDITION.test(body) || ON_THEIR_ANSWER.test(body) || (!!prev0 && !asksForIt(prev0) && (OPENS_CONDITION.test(prev0) || QUIZ_PROTOCOL.test(prev0)));
    // after a "no", what follows is what they want now, whatever it is ("no, just explain it", "no — explain prophase
    // instead", "no wait, just answer my question: what is…?"); after "actually" / "or rather", any request
    if (!conditional && (refused || (marked && REQUEST_BODY.test(body)))) return { rest: [body, ...clauses.slice(i + 1)].join(', ') };
    if (!asksForIt(body)) continue;
    const prev = i - 1 > quizAt ? clauses[i - 1] : '';
    // a condition on their own answers is how the quiz runs, even after "wait" ("…wait, no peeking, just tell me if I got each one right")
    const condition = OPENS_CONDITION.test(body) || ON_THEIR_ANSWER.test(body) || (!!prev && !asksForIt(prev) && (OPENS_CONDITION.test(prev) || QUIZ_PROTOCOL.test(prev)));
    if (marked && !condition) return { rest: [body, ...clauses.slice(i + 1)].join(', ') };
    if (condition || QUIZ_PROTOCOL.test(body)) continue;
    return { conflict: true };
  }
  // the quiz and the answer in one clause ("quiz me on capitals or just tell me
  // the capital of Slovenia"): neither is the newer
  const own = clauses[quizAt].replace(new RegExp(QUIZ.source, 'gi'), ' ').replace(new RegExp(KEEP_IT_THEIRS.source, 'gi'), ' ');
  return asksForIt(own) && !QUIZ_PROTOCOL.test(own) ? { conflict: true } : null;
}

/** The answer asked for in words readSignals does not read as one: "I give up, what is it?", "reveal the answer", "what's the correct answer?". */
const GIVE_UP = /\bi give up\b|\b(?:please )?reveal (?:it|the answer)\b|\bwhat(?:'s| is| was) the (?:correct |right |real )?answer\b|\bwhat(?:'s| is) it\s*\?|\b(?:tell|give|show) me the (?:correct |right )?answer\b/i;
/** After a retraction, any request is what they now ask for: "quiz me — no, just explain it", "…no, list the phases". */
const REQUEST_BODY = /^\s*(?:(?:please|just|do|ok|okay|can you|could you|would you|instead)\s+)*(?:tell|give|show|explain|list|write|describe|walk|help|summari[sz]e|define|answer|go over|what|how|why|which|who|when|where)\b/i;

/** Their open-ended instruction is held to this conversation: CONVERSATION_BOUND, or open-ended words next to SCOPE_HERE. */
export function heldHere(sp: string): boolean {
  return saidPlainly(CONVERSATION_BOUND, sp) || saidPlainly(SCOPE_HERE, sp);
}

/**
 * saidPlainly, and not refused by a contrast right before it in its clause:
 * "no shorter answers", "instead of shorter replies", "rather than a tl;dr".
 */
const CONTRAST_BEFORE = /\b(?:no|not|never|without|instead of|rather than|skip(?:ping)?|over|than|except|other than)\s+(?:(?:a|an|the|any|your|those|these|such|just|really|super|very|overly|too)\s+)*$/i;
function unrefused(re: RegExp, text: string): boolean {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    if (m[0].length === 0) {
      g.lastIndex++;
      continue;
    }
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (!NEGATED_BEFORE.test(before) && !CONTRAST_BEFORE.test(leadOf(text, m.index))) return true;
  }
  return false;
}

/** A request for information beside "let me try it first": a question, or how / what / where / which / why / plan B. */
const ALSO_ASKS = /\?|\b(?:how (?:do|can|should|would) (?:i|we|you)|what (?:is|are|should|do|does|would)|where (?:do|can|is|are)|which (?:one|router|platform|app|is)|plan b|meanwhile|recommend)\b/i;
/**
 * …unless what it asks is the exercise itself: "What is the derivative of
 * x^2 sin x? Let me try it first." (working, an operator, a number, or the
 * verb of an exercise) — not "How do I change a car tyre?".
 */
const THE_EXERCISE_MATH = /\d\s*[-+*^×÷=<>]\s*[\d(a-z]|[a-z]\s*[\^=]\s*[\w(-]|[√∫∑π≤≥]|\b\d+[a-z]\b/;
const THE_EXERCISE_WORDS = /\bwhat(?:'s| is) the (?:derivative|integral|limit|value|sum|square root|answer|solution) (?:of|to)\b|\b(?:solve|simplify|factori[sz]e|differentiate|integrate|prove that)\b/i;
/** (Working with an operator or a variable — "2x + 3 = 11", "x^2" — not a fraction or a part number: "3/4 inch", "12V".) */
const THE_EXERCISE = { test: (x: string) => THE_EXERCISE_MATH.test(x) || THE_EXERCISE_WORDS.test(x) };

/** Where the last match of `re` starts in `text`, or -1. */
function lastIndexOf(re: RegExp, text: string): number {
  const g = new RegExp(re.source, 'gi');
  let m: RegExpExecArray | null;
  let at = -1;
  while ((m = g.exec(text))) {
    at = m.index;
    if (m[0].length === 0) g.lastIndex++;
  }
  return at;
}

/** A quiz asked for now in a clause after the message's last "stop asking": the newest words. */
function quizAfterStop(sp: string): boolean {
  const clauses = sp.split(CLAUSE_BREAK).map((x) => (x ?? '').trim()).filter(Boolean).slice(0, 16);
  let stopAt = -1;
  let quizAt = -1;
  clauses.forEach((c, i) => {
    if (addressed(STOP_ASKING, c, { noDefer: true })) stopAt = i;
    if (quizAsked(c)) quizAt = i;
  });
  return quizAt > stopAt && stopAt >= 0;
}

function readExplicit(sp: string, s: ExplicitSignals, hadReply: boolean, ceiling: number | null, horizon = true, prev: string | null = null): Set<ExplicitCode> {
  const codes = new Set<ExplicitCode>();
  if (!sp) return codes;
  let said = signalsAsSaid(sp, s);
  // readSignals' stopQuestions, confirmed (STOP_ASKING): their own "stop
  // asking", addressed — not "don't stop asking me questions", "why did you
  // stop asking me questions?", "my teacher told me to stop asking".
  // A stop is a stop now, even one with an end ("stop quizzing me until tomorrow"): no deferral.
  let stopAsked = s.stopQuestions && addressed(STOP_ASKING, sp, { noDefer: true });
  // ...but a quiz asked for after it in the same message is what they want now ("stop asking me what I
  // want, just quiz me", "no more questions about my level, quiz me on Asia")
  if (stopAsked && (quizAfterStop(sp) || quizAsked(sp))) stopAsked = false;
  // A "stop asking" in the same message wins over asking for questions, as
  // it does in readSignals ("stop asking me questions and quiz me tomorrow"
  // is a stop): otherwise one message both stops and revokes the stop.
  let quizAsk = !stopAsked && quizAsked(sp);
  // IFR's own reading of "let me try it first" / "don't tell me the answer" / "hints only" (KEEP_IT_THEIRS) — not
  // when the same message asks how, what or where ("I'd like to do it myself. How do I change a car tyre?"):
  // what they asked for is asked for
  const besides = sp.replace(new RegExp(KEEP_IT_THEIRS.source, 'gi'), ' ');
  let practice = addressed(KEEP_IT_THEIRS, sp) && (!ALSO_ASKS.test(besides) || THE_EXERCISE.test(besides));
  // a complaint about being quizzed is not a request to be
  if (quizAsk && quizComplaint(sp)) quizAsk = false;
  // THE NEWEST CLAUSE WINS (quizTakenBack). "Quiz me — no, just tell me the
  // answer" asks for the answer: the quiz it took back is not read at all (it
  // would otherwise keep the answer back for the rest of the conversation).
  const taken = quizAsk || practice ? quizTakenBack(sp) : null;
  const back = taken && 'rest' in taken ? taken : null;
  const conflict = !!taken && 'conflict' in taken;
  const backSignals = back ? readSignals(back.rest) : null;
  if (back && backSignals) {
    quizAsk = false;
    practice = false;
    said = signalsAsSaid(back.rest, backSignals);
  }
  // readSignals' requestsQuestions also fires on questions written for
  // somebody else ("write 5 interview questions for my candidate"). That is
  // content, not a wish to be asked — and reading it as one would revoke a
  // standing "stop asking". So only questions put to THEM count, and
  // readSignals' own wantsQuestions only where it is not negated or somebody
  // else's ("don't quiz me", "the exam will test me").
  // (after a quiz taken back, only what follows it: "quiz me — no, just tell me" does not ask to be asked)
  const asked = back ? back.rest : sp;
  // (a quiz asked for together with the answer — a conflict — is not a wish to be asked: their stop stands)
  const wantsAsked = !stopAsked && !conflict && (((backSignals ?? s).wantsQuestions && addressed(ASKED_TO_ASK, asked, { hedged: true }) && !quizComplaint(asked, ASKED_TO_ASK)) || quizAsk || addressed(KEEP_ASKING, asked, { hedged: true }) || addressed(BY_ASKING_ME, asked, { hedged: true }));
  const writing = WRITING_NAMED.test(sp);

  // "just give me a practice problem" is a direct request FOR a problem: the
  // directness is about the problem, so it is not a request for the answer.
  // (The confirmed reading, not readSignals' raw wantsQuestions: "don't quiz
  // me, just tell me the answer" is a direct request.)
  const gaveUp = saidPlainly(GIVE_UP, asked) && !REFUSES_IT.test(asked);
  if (conflict || said.delegate || ((said.directness === 'answer' || gaveUp) && !quizAsk && !wantsAsked) || (!quizAsk && saidPlainly(PICK_FOR_ME, asked))) codes.add('explicit.direct_answer');
  // inside a quiz that stands, "show me the steps afterwards" is how it runs, not a request for them now;
  // addressed: "our teacher wants us to show the steps" is the teacher's
  if (addressed(SHOW_STEPS, sp) && !quizAsk && !practice) codes.add('explicit.show_steps');
  if (stopAsked) codes.add('explicit.stop_questions');
  if (wantsAsked) codes.add('explicit.wants_questions');
  if (quizAsk) codes.add('explicit.quiz');
  // "let me try it first", "hints only", "don't tell me the answer": not a quiz — this problem's answer stays theirs
  // for a turn or two, no question is added, and a "stop asking" stands
  if (practice && !quizAsk) codes.add('explicit.own_try');
  // "That's enough for today", "no more quiz": the quiz is over — not when the same message asks for another one.
  // (another one asked for NOW keeps it going; "I'll do another one next week" does not)
  // what Socria last asked: "Yes, that's enough." answers "Is there enough O2…?", and "No thanks." declines "Want another one?"
  const lastAsked = lastQuestionOf(prev);
  const endQuiz =
    s.endQuiz &&
    !(/\benough\b/i.test(lastAsked) && /^\W*(?:yes|yeah|yep|no|nope|nah)\b/i.test(sp) && !/\b(?:for (?:now|today|tonight|one day)|let'?s stop|stop (?:here|there|now)|i'?m done)\b/i.test(sp));
  const declined = OFFERED_MORE.test(lastAsked) && DECLINES.test(sp);
  if (!quizAsk && !practice && !addressed(ASKS_FOR_ANOTHER, sp) && (endQuiz || declined || saidPlainly(END_PRACTICE, sp))) codes.add('explicit.end_practice');
  // Their own writing named: only the forms that can only mean Socria's replies.
  // "shorter" as a noun phrase is also how they refuse it ("no short answers please", "the long version,
  // not the short version", "instead of a short answer"): SHORTER counts only addressed
  // addressed too: "my boss wants shorter replies to customers" is the boss's
  // "that's too long" of the reply: the message's first sentence ("I watched Oppenheimer. It was way too long." is the film)
  const first = sp.split(/(?<=[.!?])\s+/)[0] ?? '';
  if (addressed(SHORTER_REPLIES, sp) || (hadReply && WALL_OF_TEXT.test(sp) && unrefused(WALL_OF_TEXT, sp)) || (!writing && addressed(SHORTER, sp)) || (hadReply && !writing && saidPlainly(TOO_LONG, first)) || askedShort(s, ceiling, sp)) codes.add('explicit.shorter');
  // never a refusal of length ("don't give me the long version", "skip all the details", "more detail? no thanks"),
  // and never beside a short length asked for ("…, in one line")
  if ((longerAsked(sp) || askedLong(s, ceiling, sp)) && !REFUSES_LENGTH.test(sp) && !ASKS_SHORT_TOO.test(sp)) {
    codes.add('explicit.longer');
    // "Make it shorter. Actually, no — make it longer": the newer word is the one they mean
    if (codes.has('explicit.shorter') && /\b(?:no|actually|wait|instead|rather|i mean|scratch that|on second thought)\b[\s\S]*\b(?:longer|more detail|detailed|in detail|the long version|elaborate|expand)\b/i.test(sp)) codes.delete('explicit.shorter');
  }
  if (saidPlainly(SIMPLER, sp)) codes.add('explicit.simpler');
  if (saidPlainly(VERIFY_ASK, sp)) codes.add('explicit.verify');
  if (said.ownWork) codes.add('explicit.own_work');
  // never beside a rewrite or new text they asked for ("rewrite it completely, but keep my voice", "keep my style and
  // add a conclusion"); said on its own, a rewrite ends an edit-only scope in force
  // (the newer clause wins: "turn it into… no wait, just fix the grammar" is edit only)
  const editOnly = addressed(EDIT_ONLY_SCOPE, sp) || (addressed(EDIT_ONLY_KEEPS, sp) && !REVISES.test(sp));
  // what they say NOT to do is no request ("just fix the grammar. Don't rewrite it or add a conclusion.")
  const notRefused = sp.replace(NEGATED_CLAUSE, (m) => ' '.repeat(m.length));
  // a scope said after the rewrite narrows it ("rewrite it — actually, just fix the typos"); what a rewrite keeps does not
  const rewrite = addressed(REWRITE_ASKED, notRefused) && !(editOnly && lastIndexOf(EDIT_ONLY_SCOPE, sp) > lastIndexOf(REWRITE_ASKED, notRefused));
  if (rewrite) codes.add('explicit.rewrite');
  if (editOnly && !rewrite) codes.add('explicit.edit_only');
  if (s.learningGoal === true) codes.add('explicit.learning_goal');
  if (saidPlainly(CONFUSED, sp)) codes.add('explicit.confused');
  // addressed (a hedge is still theirs: "I think you can ask me questions again"), and not a bare question asked
  // back ("Go back to asking me questions? No, keep it as it is.")
  if (addressed(REVOKE, sp, { notAsked: true, hedged: true, edge: SENTENCE_EDGE })) codes.add('explicit.revoke');
  if (s.feedback === 'positive') codes.add('explicit.positive');
  if (s.feedback === 'negative') codes.add('explicit.negative');
  if (s.frustration && FRUSTRATION_WORDS.test(sp)) codes.add('explicit.frustration');
  if (horizon) standingIf(codes, s, sp);
  return codes;
}

/**
 * Standing: open-ended words ("from now on", with readSignals' horizon), or
 * "for the rest of this chat" (CONVERSATION_BOUND, which needs no horizon).
 * Held here — CONVERSATION_BOUND, or open-ended words with "in this chat",
 * "only here" (SCOPE_HERE) — the observation carries
 * IFR_REF_CODES.conversationOnly, and the policy keeps it in this
 * conversation (lib/mr/policy.ts).
 */
/** The horizon words alone ("from now on", "for the rest of this chat"), taken out to see what leads the clause; "always" and "never" stay, they lead it. */
const HORIZON_ONLY = /\b(?:from now on|going forward|from here on(?: out)?|in (?:all )?(?:your )?future (?:answers|replies|responses|messages)|for the (?:rest|remainder) of (?:this|the|our) (?:chat|conversation|convo|session|thread)|(?:until|till) the end of (?:this|the|our) (?:chat|conversation|session|thread))\b/gi;
/** A clause an instruction of theirs leads: lead-ins, then an imperative or their own "I want / I'd like / no / don't". */
const INSTRUCTION_LED = new RegExp(
  String.raw`^[\s,;:!.—–-]*(?:(?:${LEAD_WORDS}|${REQUEST_FRAME})(?![\w'’])[\s,;:!.—–-]*)*(?:stop|quit|keep|give|show|answer|be|use|explain|skip|don'?t|do not|no|just|make|ask|quiz|test|tell|write|always|never|only|less|more|shorter|simpler|walk|lead|start|put|i want|i need|i(?:'d| would) (?:like|prefer|rather)|let me|go)\b`,
  'i'
);
function standingIf(codes: Set<ExplicitCode>, s: ExplicitSignals, sp: string): void {
  if (![...codes].some((c) => STANDABLE.has(c))) return;
  // THE HORIZON AND THE INSTRUCTION IN ONE CLAUSE. "Just give me the answer.
  // From now on, the deadlines are stricter at my school" made the answer
  // standing; so did "stop asking me questions, you always make me feel dumb
  // and never give me a straight answer". So the clause that carries the
  // horizon words is read on its own (with the clause after it when it is
  // nothing but those words: "From now on, stop asking"), and only an
  // instruction read THERE makes the message standing. "Always" and "never"
  // also need nothing before them in their clause but a lead-in ("please
  // always…"), not a subject ("you always…", "my mom said always…").
  const clauses = sp
    .split(CLAUSE_BREAK)
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .slice(0, 24);
  const horizonOnly = new RegExp(String.raw`^[\s,;:!.—–-]*(?:(?:${LEAD_WORDS})(?![\w'’])[\s,;:!.—–-]*)*$`, 'i');
  const hits = (c: string): boolean => {
    if (saidPlainly(CONVERSATION_BOUND, c)) return true;
    if (!s.horizon) return false;
    const g = new RegExp(STANDING_WORDS.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = g.exec(c))) {
      if (!/^(?:please |always|never|don'?t ever|do not ever)/i.test(m[0]) || LEAD_IN.test(leadOf(c, m.index, PUNCT_EDGE))) return true;
      if (m[0].length === 0) g.lastIndex++;
    }
    return false;
  };
  for (let i = 0; i < clauses.length; i++) {
    if (!hits(clauses[i])) continue;
    const alone = horizonOnly.test(clauses[i].replace(new RegExp(`${STANDING_WORDS.source}|${CONVERSATION_BOUND.source}`, 'gi'), ' '));
    const clause = alone && clauses[i + 1] ? `${clauses[i]} ${clauses[i + 1]}` : clauses[i];
    // an instruction of theirs leads the clause, not somebody else's ("from now on our teacher wants us to show the steps")
    const rest = clause.replace(HORIZON_ONLY, ' ');
    if (!INSTRUCTION_LED.test(rest)) continue;
    const here = readExplicit(clause, readSignals(clause), true, null, false);
    if ([...here].some((c) => STANDABLE.has(c) && codes.has(c))) {
      codes.add('explicit.standing');
      return;
    }
  }
}

// The per-message reading is policy-free (no word-count ceiling): it is
// shared by every observeTurn call that looks back at this turn, whatever
// params that call carries. The current turn adds the length rule itself.
// Only `sp` and `codes` are read for every message (the fold reads their
// words from every turn); the counts are worked out the first time something
// asks for them, which for most of a long conversation is never.
class OwnReading implements Own {
  readonly sp: string;
  readonly codes: Set<ExplicitCode>;
  private memo: Partial<Record<'words' | 'rawWords' | 'tokens' | 'nums' | 'askMore' | 'writing' | 'replyLoad' | 'attempt' | 'short', unknown>> = {};
  constructor(private readonly t: TurnView) {
    this.sp = speech(t.text.slice(0, IFR_READ_CHARS));
    this.codes = readExplicit(this.sp, t.signals, t.prevReply !== null, null, true, t.prevReply);
  }
  private once<T>(k: keyof OwnReading['memo'], f: () => T): T {
    if (!(k in this.memo)) this.memo[k] = f();
    return this.memo[k] as T;
  }
  get words(): number {
    return this.once('words', () => wordCount(this.sp));
  }
  get rawWords(): number {
    return this.once('rawWords', () => wordCount(this.t.text));
  }
  get attempt(): boolean {
    return this.once('attempt', () => ATTEMPT.test(this.sp));
  }
  get short(): boolean {
    return this.once('short', () => this.words > 0 && SHORT_REPLY.test(this.sp) && !/\?/.test(this.sp) && !SHORT_REQUEST.test(this.sp) && !this.attempt && this.codes.size === 0);
  }
  get tokens(): Set<string> {
    return this.once('tokens', () => tokensOf(this.sp));
  }
  get nums(): string {
    return this.once('nums', () => (this.sp.match(/\d+(?:[.,]\d+)?/g) ?? []).join(' '));
  }
  get askMore(): boolean {
    return this.once('askMore', () => ASKS_FOR_MORE.test(this.sp));
  }
  get writing(): boolean {
    return this.once('writing', () => WRITING_NAMED.test(this.sp));
  }
  get replyLoad(): number | null {
    return this.once('replyLoad', () => (this.t.reply === null ? null : questionLoad(this.t.reply)));
  }
}

function own(t: TurnView): Own {
  const hit = OWN.get(t);
  if (hit) return hit;
  const o = new OwnReading(t);
  OWN.set(t, o);
  return o;
}

// ── observing a turn ─────────────────────────────────────────────────

export interface ObserveContext {
  /** TurnState.work for this turn when known */
  work?: string | null;
  /** engine verdicts on their claims at this turn: 'verified' | 'refuted' | ... */
  verdicts?: readonly { status: string }[];
  /** engine verdicts at earlier turns, keyed by user-turn index */
  verdictsByTurn?: Readonly<Record<number, readonly { status: string }[]>>;
  params: StrategyParams;
  length?: ReplyLength | null;
}

/** How far back the counted detectors look, in user turns (this one included). */
export const IFR_LOOKBACK = 6;

/** The codes an EvidenceRef carries for things that are not themselves observations. */
export const IFR_REF_CODES = {
  replyAsked: 'reply.asked',
  replyExplained: 'reply.explained',
  replyVerbose: 'reply.verbose',
  verified: 'verdict.verified',
  refuted: 'verdict.refuted',
  repeat: 'request.repeat',
  repeatOf: 'request.original',
  short: 'user.short',
  /** an explicit.shorter about one reply's length, not their replies from now on */
  lengthOnce: 'length.once',
  /** an explicit.standing they held to this conversation ("for the rest of this chat"): never carried across */
  conversationOnly: 'horizon.conversation',
  /** what an explicit.revoke takes back: the question rules only, or every adjustment (read by lib/mr/outcome.ts) */
  revokeQuestions: REVOKE_SCOPE.questions,
  revokeAll: REVOKE_SCOPE.all,
} as const;

/** Why an answer to an asking reply did not move anything. */
export type NoAdvance = 'direct_request' | 'stop_request' | 'dont_know' | 'redundant' | 'confused' | 'repeat' | 'short';

const ORDER = new Map<ObservationCode, number>(OBSERVATION_CODES.map((c, i) => [c, i]));

function obs(code: ObservationCode, provenance: Provenance, strength: Strength, turn: number, refs: EvidenceRef[], confidence: number, standing = false): Observation {
  return standing ? { code, provenance, strength, turn, refs, confidence, standing: true } : { code, provenance, strength, turn, refs, confidence };
}

const userRef = (t: TurnView, code: string): EvidenceRef => ({ turn: t.index, role: 'user', code });
const replyRef = (t: TurnView, code: string): EvidenceRef => ({ turn: t.index, role: 'assistant', code });

function verdictsAt(turns: readonly TurnView[], j: number, k: number, ctx: ObserveContext): readonly { status: string }[] | null {
  const v = j === k && ctx.verdicts ? ctx.verdicts : ctx.verdictsByTurn?.[turns[j].index];
  return v && v.length ? v : null;
}

/**
 * A reply that explained: 40 words or more outside its asking sentences. A
 * reply that was only questions did not explain anything, so confusion after
 * it is not a failed explanation.
 */
export function replyExplained(reply: string): boolean {
  const q = interrogatives(reply);
  const asking = [...q.explicit, ...q.disguised].reduce((n, s) => n + wordCount(s), 0);
  return wordCount(reply) - asking >= 40;
}

/**
 * Words a repeat may add without being a new request: "I ASKED for the
 * formula", "just tell me the formula AGAIN", "seriously, the formula".
 */
const REPEAT_WORDS = new Set('asked ask asking said say saying told tell again already still repeat repeating question answer meant mean actually seriously literally simply exactly once more give show explain'.split(' '));

/**
 * Position of an earlier message (among their previous 3) this one repeats,
 * or -1. Not when the numbers differ: "what is 15% of 80 dollars in total"
 * then "what is 20% of 80 dollars in total" is the next problem, not the
 * same request again (their word sets are 60% the same). Not when it adds a
 * content word of its own: "…the Roman empire" then "…the Ottoman empire",
 * "a poem about the ocean at night" then "…the forest at night" are the next
 * item of a series, which a word-overlap score alone reads as the same thing.
 */
function repeatOf(turns: readonly TurnView[], k: number): number {
  const a = own(turns[k]);
  if (a.tokens.size < 4 || a.askMore) return -1;
  for (let j = k - 1; j >= Math.max(0, k - 3); j--) {
    const b = own(turns[j]);
    if (b.tokens.size < 4 || b.nums !== a.nums) continue;
    let both = 0;
    let added = 0;
    for (const w of a.tokens) {
      if (b.tokens.has(w)) both++;
      else if (!REPEAT_WORDS.has(w)) added++;
    }
    const jaccard = both / (a.tokens.size + b.tokens.size - both);
    if (jaccard >= 0.6 && added === 0) return j;
  }
  return -1;
}

/**
 * Did their answer to an asking reply move anything? An attempt always does
 * (the engine decided it, or it has a digit or an operator in it), and so
 * does asking for questions or a quiz. Otherwise it did not when it asked to
 * be told, asked to stop, said they don't know, said they had already said
 * it, said they were confused, repeated an earlier request, or was 5 words
 * or fewer. KNOWN FALSE POSITIVE: a short factual answer to a diagnostic
 * question ("chrome", "yes") counts as not advancing; it takes two of them
 * in a row, each after an asking reply, before anything is observed.
 */
export function answerNoAdvance(turns: readonly TurnView[], u: number, k: number, ctx: ObserveContext): NoAdvance | null {
  const t = turns[u];
  const o = own(t);
  const s = t.signals;
  if (verdictsAt(turns, u, k, ctx)) return null;
  // an answer given while a quiz ran ("Lima") answered the quiz — also on the turn that ends it
  if (u < k && quizSince(turns, u) >= 0) return null;
  if (o.codes.has('explicit.wants_questions') || o.codes.has('explicit.quiz') || o.codes.has('explicit.own_try')) return null;
  if (o.codes.has('explicit.direct_answer') || o.codes.has('explicit.show_steps')) return 'direct_request';
  if (o.codes.has('explicit.stop_questions')) return 'stop_request';
  if (s.dontKnow) return 'dont_know';
  if (s.redundancy) return 'redundant';
  if (o.codes.has('explicit.confused')) return 'confused';
  if (repeatOf(turns, u) >= 0) return 'repeat';
  if (o.words <= 5 && !o.attempt) return 'short';
  return null;
}

/**
 * Inside a quiz that is running, "just give me the next one", "just tell me
 * if I'm right", "you pick the next country", "just give me a score at the
 * end" ask how it runs — readSignals reads each as asking for the answer, and
 * that ended the quiz the person was still taking. Only the answer itself,
 * asked for outside the quiz's protocol ("just tell me the answer", "I give
 * up, what is it?"), counts as the request it is.
 */
/** How a running quiz goes on: the next one, another, a harder one, whether they were right, a score, you pick. */
const IN_QUIZ_NEXT = /\b(?:(?:the )?next (?:one|question|country|word|capital|problem|card|item|verb|element)|another(?: one| question)?|one more(?: question)?|a (?:harder|easier) one|(?:harder|easier) ones|you (?:pick|choose|decide)|pick (?:one|the next)|if i'?m (?:right|wrong|correct)|whether i'?m (?:right|correct)|if (?:that'?s|that is|it'?s|it is|i got it|i was) (?:right|correct)|right or wrong|correct or not|my score|a score|how i(?:'m| am)? doing|keep going|go on|(?:just )?give me (?:one|a word|a sentence|a phrase|a number|a new one|a question|a problem|one practice problem|one more|something)(?: to (?:translate|solve|answer|try|do|name|spell))?|the first letter|a clue|a hint|multiple choice)\b/i;
/** The answer, or something else, asked for: "just tell me", "the answer", "the capital of Kenya", "a list of…", "solve it for me". */
const ANSWER_ITSELF = /\b(?:the|its|that|this|your) (?:answer|answers|solution|result)\b|\bi give up\b|\breveal\b|\bwhat(?:'s| is| was) (?:it|the (?:correct |right |real )?answer)\b|\b(?:just )?(?:tell|give|show) me(?=\s*(?:[.!?,]|$|please|already|the (?:capital|answer|word|meaning|result)|what|how|it\b|about\b))|\b(?:a |the )?(?:list|cheat sheet|summary|overview|tips|history|explanation)\b|\bsolve it\b|\bdo it for me\b|\bthe capital of\b/i;
/**
 * Inside a quiz that is running, a direct request that only says how it goes
 * on ("just give me the next one", "just tell me if I'm right", "you pick
 * the next country", "a score at the end") is the quiz. Anything else asked
 * for — the answer, "just tell me", a list, an explanation — ends it: a quiz
 * held against what they now ask for is MR acting against their words.
 */
function quizProtocolOnly(o: Own): boolean {
  return o.codes.has('explicit.direct_answer') && !o.codes.has('explicit.quiz') && IN_QUIZ_NEXT.test(o.sp) && !ANSWER_ITSELF.test(o.sp);
}
/** Inside a running quiz, something else asked for ("just write me a cheat sheet of the capitals", "explain photosynthesis"): the quiz is over. */
function asksElse(o: Own): boolean {
  return !o.codes.has('explicit.quiz') && !o.codes.has('explicit.wants_questions') && ASKS_SOMETHING_ELSE.test(o.sp) && !IN_QUIZ_NEXT.test(o.sp);
}
/**
 * Inside a quiz, something else asked for in so many words: "just write me a
 * cheat sheet of the capitals", "explain photosynthesis", "tell me about the
 * history of Nairobi", "give me a list of…". Never an answer that opens on a
 * question word ("What about Nairobi?", "Where"), a hint asked for ("give me
 * the first letter"), or a guess ("Give me a sec… Nairobi?").
 */
const ASKS_SOMETHING_ELSE = /^\s*(?:(?:ok(?:ay)?|now|instead|so|and|actually|please|just|can you|could you|would you)[\s,]+)*(?:write|draft|summari[sz]e|translate|explain|describe|tell me about|walk me through|help me (?:with|write|plan|understand)|give me (?:a |an |some |the )?(?:list|summary|cheat sheet|overview|explanation|breakdown|tips|example|recipe|plan)|list (?:all|the|every))\b[^?]{6,}$/i;

/** The position of the "stop asking" still in force before turn k, or -1. Asking for questions, or a revocation, ends it. */
function stopInForce(turns: readonly TurnView[], k: number): number {
  let at = -1;
  for (let j = 0; j < k; j++) {
    const c = own(turns[j]).codes;
    if (c.has('explicit.revoke') || c.has('explicit.wants_questions')) at = -1;
    if (c.has('explicit.stop_questions')) at = j;
  }
  return at;
}

/**
 * The position of the learning goal or quiz still standing at turn k, or -1.
 * Ended by "let's stop there", "stop asking", or "I don't need to learn
 * this". A quiz (not a stated learning goal) also ends when they ask for the
 * answer or the steps: "just tell me the answer" is the end of the quiz, and
 * "I'm learning calculus… just tell me this one" is not the end of learning.
 */
function practiceSince(turns: readonly TurnView[], k: number): number {
  let at = -1;
  let goal = false;
  for (let j = 0; j <= k; j++) {
    const t = turns[j];
    const o = own(t);
    const c = o.codes;
    if (c.has('explicit.end_practice') || c.has('explicit.stop_questions') || t.signals.learningGoal === false) at = -1;
    else if (at >= 0 && !goal && ((c.has('explicit.direct_answer') && !quizProtocolOnly(o)) || c.has('explicit.show_steps') || asksElse(o))) at = -1;
    if (c.has('explicit.learning_goal') || c.has('explicit.quiz') || c.has('explicit.own_try')) {
      if (at < 0) goal = false;
      at = j;
      goal = goal || c.has('explicit.learning_goal');
    }
  }
  return at;
}

/** Their words at turns[k], as observations — the first part of observeTurn, and all the fold reads of turns older than its window. */
function readWords(turns: readonly TurnView[], k: number, p: StrategyParams): { out: Observation[]; codes: Set<ExplicitCode>; revokedByAsking: boolean } {
  const t = turns[k];
  const me = own(t);
  const out: Observation[] = [];
  const codes = new Set(me.codes);
  if (k > 0 && quizSince(turns, k - 1) >= 0) {
    if (quizProtocolOnly(me)) codes.delete('explicit.direct_answer');
    // something else asked for ends the quiz they were taking (the quiz rule stands down on end_practice)
    else if (asksElse(me)) codes.add('explicit.end_practice');
  }
  // a long length asked for ("a 1000-word essay") takes back "shorter" for it
  if (me.sp && askedLong(t.signals, p.shorterCeiling, me.sp)) codes.add('explicit.longer');
  // A word count they asked for, under this policy's "shorter" ceiling.
  if (me.sp && askedShort(t.signals, p.shorterCeiling, me.sp)) {
    codes.add('explicit.shorter');
    standingIf(codes, t.signals, me.sp);
  }
  const stopAt = codes.has('explicit.wants_questions') && !codes.has('explicit.stop_questions') ? stopInForce(turns, k) : -1;
  const revokedByAsking = stopAt >= 0 && !codes.has('explicit.revoke');
  const standing = codes.has('explicit.standing');
  for (const code of codes) {
    const [strength, confidence] = EXPLICIT_WEIGHT[code];
    const st = code === 'explicit.stop_questions' || code === 'explicit.standing' || (standing && STANDABLE.has(code));
    // A revocation says what it takes back: questions, or everything (IFR_REF_CODES).
    const refs =
      code === 'explicit.revoke'
        ? [userRef(t, code), userRef(t, saidPlainly(REVOKE_ALL, me.sp) ? IFR_REF_CODES.revokeAll : IFR_REF_CODES.revokeQuestions)]
        : code === 'explicit.shorter' && shorterIsOnce(me.sp, t.prevReply !== null)
          ? [userRef(t, code), userRef(t, IFR_REF_CODES.lengthOnce)]
          : code === 'explicit.standing' && heldHere(me.sp)
            ? [userRef(t, code), userRef(t, IFR_REF_CODES.conversationOnly)]
            : [userRef(t, code)];
    out.push(obs(code, 'explicit', strength, t.index, refs, confidence, st));
  }
  if (revokedByAsking) {
    const [strength, confidence] = EXPLICIT_WEIGHT['explicit.revoke'];
    out.push(obs('explicit.revoke', 'explicit', strength, t.index, [userRef(t, 'explicit.wants_questions'), userRef(turns[stopAt], 'explicit.stop_questions'), userRef(t, IFR_REF_CODES.revokeQuestions)], confidence));
  }
  return { out, codes, revokedByAsking };
}

/**
 * Only their words at turns[k] (explicit.* observations), sorted like
 * observeTurn's. The State Engine reads turns older than its window this way:
 * an instruction that holds until they take it back ("stop asking me
 * questions", forty turns ago) is still theirs, and so is taking it back.
 */
export function observeWords(turns: readonly TurnView[], k: number, ctx: Pick<ObserveContext, 'params'>): Observation[] {
  if (!turns[k]) return [];
  return readWords(turns, k, ctx.params).out.sort((a, b) => (ORDER.get(a.code) ?? 0) - (ORDER.get(b.code) ?? 0));
}

/**
 * The position of the quiz still running at turn k, or -1: practiceSince for
 * a quiz they asked for only, not a stated learning goal. A learner can still
 * be asked questions that do not help them; a quiz's questions are the help.
 */
function quizSince(turns: readonly TurnView[], k: number): number {
  let at = -1;
  for (let j = 0; j <= k; j++) {
    const t = turns[j];
    const o = own(t);
    const c = o.codes;
    // (readSignals' endQuiz is read through explicit.end_practice, which another one asked for in the same message vetoes)
    if (c.has('explicit.end_practice') || c.has('explicit.stop_questions') || (c.has('explicit.direct_answer') && !(at >= 0 && quizProtocolOnly(o))) || c.has('explicit.show_steps') || (at >= 0 && asksElse(o))) at = -1;
    // a quiz asked for together with the answer (neither enforced) still makes "Lima" an answer to it, not a reply that moved nothing
    if (c.has('explicit.quiz')) at = j;
  }
  return at;
}

/**
 * Everything observable at turns[k]: their words, the counts behind it, and
 * the weak readings. Sorted in OBSERVATION_CODES order; each code at most
 * once. Deterministic: the same turns and context give the same array.
 */
export function observeTurn(turns: readonly TurnView[], k: number, ctx: ObserveContext): Observation[] {
  const t = turns[k];
  if (!t) return [];
  const p = ctx.params;
  const me = own(t);
  // ── their words
  const { out, codes, revokedByAsking } = readWords(turns, k, p);

  // ── Socria kept asking: the replies before this turn, newest first.
  // Not while a quiz they asked for runs: its questions ARE the help, and
  // "Lima", "Nairobi" are answers, not answers that moved nothing. (A stated
  // learning goal is not a quiz: questions can still fail a learner.)
  const practice = practiceSince(turns, k);
  const quizzing = quizSince(turns, k) >= 0;
  const asking: number[] = [];
  for (let j = k - 1; j >= 0 && asking.length < IFR_LOOKBACK; j--) {
    const n = own(turns[j]).replyLoad;
    if (n === null || n === 0) break;
    asking.push(j);
  }
  if (asking.length >= p.unproductiveStreak) {
    out.push(obs('observed.question_streak', 'observed', 'moderate', t.index, asking.map((j) => replyRef(turns[j], IFR_REF_CODES.replyAsked)), 0.7));
    // ...and each of their answers to the most recent of them moved nothing.
    const lastN = asking.slice(0, p.unproductiveStreak);
    const why = !quizzing ? lastN.map((j) => answerNoAdvance(turns, j + 1, k, ctx)) : [];
    if (why.length && why.every((w) => w !== null)) {
      const refs: EvidenceRef[] = [];
      lastN.forEach((j, i) => refs.push(replyRef(turns[j], IFR_REF_CODES.replyAsked), userRef(turns[j + 1], `answer.${why[i]}`)));
      out.push(obs('observed.unproductive_questions', 'observed', 'moderate', t.index, refs, 0.75));
    }
  }

  // ── confusion after an explanation, again (this turn one of them)
  if (codes.has('explicit.confused')) {
    const hits: number[] = [];
    for (let j = Math.max(1, k - IFR_LOOKBACK + 1); j <= k; j++) {
      const r = turns[j].prevReply;
      if (r !== null && own(turns[j]).codes.has('explicit.confused') && replyExplained(r)) hits.push(j);
    }
    if (hits.length >= p.confusionRepeats && hits[hits.length - 1] === k) {
      const refs: EvidenceRef[] = [];
      for (const j of hits) refs.push(replyRef(turns[j - 1], IFR_REF_CODES.replyExplained), userRef(turns[j], 'explicit.confused'));
      out.push(obs('observed.repeated_confusion', 'observed', 'moderate', t.index, refs, 0.8));
    }
  }

  // ── the engine's verdicts: this turn, and attempts that keep failing.
  // Failing "repeatedly" means the most recent decided attempt failed too: a
  // verified attempt since ends it.
  const now = verdictsAt(turns, k, k, ctx);
  if (now?.some((v) => v.status === 'verified'))
    out.push(obs('observed.verified_correct', 'observed', 'strong', t.index, now.filter((v) => v.status === 'verified').map(() => userRef(t, IFR_REF_CODES.verified)), 1));
  if (now?.some((v) => v.status === 'refuted'))
    out.push(obs('observed.verified_incorrect', 'observed', 'strong', t.index, now.filter((v) => v.status === 'refuted').map(() => userRef(t, IFR_REF_CODES.refuted)), 1));
  // A turn counts as decided only when the engine decided something: an
  // 'unchecked' claim (it could not parse or compute it) is neither a failure
  // nor a success, so it neither adds to the run nor ends it.
  const decides = (v: { status: string }) => v.status === 'verified' || v.status === 'refuted';
  const decided: number[] = [];
  for (let j = Math.max(0, k - IFR_LOOKBACK + 1); j <= k; j++) if (verdictsAt(turns, j, k, ctx)?.some(decides)) decided.push(j);
  const refuted = decided.filter((j) => verdictsAt(turns, j, k, ctx)!.some((v) => v.status === 'refuted'));
  // ...and this turn is an attempt (decided or not): "thanks, that makes sense" after a worked example is not another failed one
  // (the engine read a claim of theirs this turn — decided or not; "I get why step 2 works" holds no claim)
  const attemptsNow = !!now;
  if (attemptsNow && refuted.length >= p.failedAttempts && refuted[refuted.length - 1] === decided[decided.length - 1])
    out.push(obs('observed.failed_attempts', 'observed', 'strong', t.index, refuted.map((j) => userRef(turns[j], IFR_REF_CODES.refuted)), 0.9));

  // ── the same request again (their previous 3 messages)
  const rep = repeatOf(turns, k);
  if (rep >= 0) out.push(obs('observed.repeated_request', 'observed', 'moderate', t.index, [userRef(t, IFR_REF_CODES.repeat), userRef(turns[rep], IFR_REF_CODES.repeatOf)], 0.7));

  // ── replies far longer than what they answered, three running. Their
  // pasted material counts in what they sent (a long paste earns a long
  // reply), and a reply to a message that asked for length is not verbose.
  if (ctx.length !== 'detailed' && k >= 3) {
    const js = [k - 1, k - 2, k - 3];
    const verbose = js.every((j) => {
      const r = turns[j].reply;
      if (r === null) return false;
      const o = own(turns[j]);
      if (o.codes.has('explicit.longer') || turns[j].signals.requestedTokens > p.shorterCeiling) return false;
      const w = wordCount(r);
      return w > p.verboseWords && w > p.verboseRatio * Math.max(1, o.rawWords);
    });
    if (verbose) out.push(obs('observed.verbose_replies', 'observed', 'moderate', t.index, js.map((j) => replyRef(turns[j], IFR_REF_CODES.replyVerbose)), 0.65));
  }

  // ── what kind of work is on the table
  // ROUTINE TASK IS AN ESTIMATE TURNED OBSERVATION. It is the runtime's
  // reading of the work (TurnState.work, a deterministic classifier over
  // their message), not a count and not their words. It is recorded as an
  // observation — provenance 'observed', so the policy can act on it at
  // moderate strength — and its ref says what it rests on ('work.<kind>'),
  // so nothing downstream can mistake it for something they said. Not
  // routine while they are practising or learning, or when the work is theirs.
  if ((ctx.work === 'execution' || ctx.work === 'information') && practice < 0 && !codes.has('explicit.own_work') && !codes.has('explicit.learning_goal') && !codes.has('explicit.quiz') && !codes.has('explicit.own_try'))
    out.push(obs('observed.routine_task', 'observed', 'moderate', t.index, [userRef(t, `work.${ctx.work}`)], 0.7));
  // WRITING TASK: their words put their own text on the table (an edit-scope
  // request about grammar, spelling or wording; "my essay" with "I'll write
  // it myself"), or they claimed the work and the runtime reads it as
  // creation. The second rests on the runtime's reading, as routine_task
  // does, and its ref says so ('work.creation').
  const byWords = (codes.has('explicit.edit_only') && (me.writing || WRITING_EDIT.test(me.sp))) || (codes.has('explicit.own_work') && me.writing);
  const byWork = ctx.work === 'creation' && codes.has('explicit.own_work');
  if (byWords || byWork) {
    const ref = byWords ? (codes.has('explicit.edit_only') ? 'explicit.edit_only' : 'explicit.own_work') : 'work.creation';
    out.push(obs('observed.writing_task', 'observed', 'moderate', t.index, [userRef(t, ref)], 0.75));
  }
  if (practice >= 0) {
    const pc = own(turns[practice]).codes;
    out.push(obs('observed.practice', 'observed', 'moderate', t.index, [userRef(turns[practice], pc.has('explicit.quiz') ? 'explicit.quiz' : pc.has('explicit.own_try') ? 'explicit.own_try' : 'explicit.learning_goal')], 0.75));
  }

  // ── weak: recorded, never acted on alone, never stronger than this.
  // A reply only: the first message of a conversation is not short "back".
  const shortHere = (j: number) => j >= 0 && turns[j].prevReply !== null && own(turns[j]).short;
  if (shortHere(k) && !revokedByAsking) {
    out.push(obs('weak.short_reply', 'hypothesis', 'weak', t.index, [userRef(t, IFR_REF_CODES.short)], 0.2));
    if (shortHere(k - 1) && shortHere(k - 2))
      out.push(obs('weak.terse_run', 'hypothesis', 'weak', t.index, [k - 2, k - 1, k].map((j) => userRef(turns[j], IFR_REF_CODES.short)), 0.3));
  }

  return out.sort((a, b) => (ORDER.get(a.code) ?? 0) - (ORDER.get(b.code) ?? 0));
}

/** observeTurn at every turn — the State Engine's replay of a conversation. */
export function observeEveryTurn(turns: readonly TurnView[], ctx: Omit<ObserveContext, 'verdicts' | 'work'> & { workByTurn?: Readonly<Record<number, string | null>> }): Observation[][] {
  return turns.map((t, k) => observeTurn(turns, k, { ...ctx, work: ctx.workByTurn?.[t.index] ?? null }));
}
