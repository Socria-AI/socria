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
// WHAT mr-2026.11.1 ADDS, read only under a policy with params.precision
// (an earlier pin reads exactly what it read before). Their words: stuck
// (STUCK, and "still stuck" after an earlier one; put aside beside feelings,
// grief, life logistics, a way out already found, a joke; read with what the
// topic shows of the work, what is on their screen, and whether they refused
// help), a correction of how the question was read or of what was assumed
// (CORRECTED, CORRECTED_SETUP), background they already know or were told
// again (KNOWS_THAT), brevity in words the earlier reader missed (BREVITY).
// Counts: a question that asked for something already said (ALREADY_SAID
// after an asking reply), the same question asked again, stuck twice
// running, a re-ask for the point after a long reply (REASKS), sentences
// repeated from recent replies, a fix reported failing twice (STILL_FAILS).
// One estimate turned observation, as routine_task is: an open request
// (OPEN_REQUEST, MISSING_REFERENT). And a new topic, which only ever ends an
// adjustment. Each pattern's near-misses and known misses are beside it.
//
// Pure. Deterministic. No model, no network, no clock.

import { isFactQuestion, offersWork } from '../cognition/assist';
import { speech, readSignals } from '../core4/signals';
import { interrogatives, isPolarQuestion, sentencesOf } from '../core4/questions';
import type { ExplicitSignals, ReplyLength } from '../core4/types';
import { tenderText } from '../runtime/asks';
import { looksMathematical } from '../runtime/state';
import type { StrategyParams } from './config';
import { attemptStatedIn, questionsPutTo, REVOKE_SCOPE, revealsAnswer, wordCount } from './outcome';
import { MEASURE_VERSION, OBSERVATION_CODES, type EvidenceRef, type Observation, type ObservationCode, type Provenance, type Reaction, type Strength, type TranscriptMessage } from './types';

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

/** An apostrophe as people type it, straight or curly ("I'm", "I’m"): the patterns mr-2026.11.1 adds write every one this way. */
const AP = "['’]";

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
  return addressedAt(re, text, opts) !== null;
}

/**
 * addressed(), and where: the first match that counts, or null. The stuck
 * reader needs the place, to read what comes after their words ("I'm stuck…
 * but I figured it out").
 */
function addressedAt(re: RegExp, text: string, opts: { notAsked?: boolean; forOthers?: RegExp; edge?: RegExp; hedged?: boolean; noDefer?: boolean } = {}): RegExpExecArray | null {
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
    return m;
  }
  return null;
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
  return questionsAsContentSaid(speech(String(text ?? '').slice(0, IFR_READ_CHARS)));
}
/** questionsAsContent on what they said (speech of the read slice, as Own.sp holds it). */
function questionsAsContentSaid(sp: string): boolean {
  return saidPlainly(QUESTIONS_AS_CONTENT, sp);
}
/** Earlier messages, newest first, as speech read only when needed (at most three: a draft and its revisions). */
type SaidLater = readonly (() => string)[];
const saidLater = (previous?: readonly string[] | string | null): SaidLater =>
  (Array.isArray(previous) ? previous : previous ? [previous] : []).slice(0, 3).map((p) => () => speech(String(p).slice(0, IFR_READ_CHARS)));

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
  return writingForOthersSaid(speech(String(text ?? '').slice(0, IFR_READ_CHARS)), saidLater(previous));
}
/** writingForOthers on what they said, the earlier messages read only if it is a revision (the same reading). */
function writingForOthersSaid(sp: string, earlier: SaidLater): boolean {
  if (CODE_WORK.test(sp)) return false;
  if (DRAFT_FOR_OTHERS.test(sp)) return true;
  const isRevision = (x: string) => DRAFT_REVISION.test(x.trim()) && x.length < 300 && !/\?/.test(x);
  if (!isRevision(sp)) return false;
  // back through the revisions to the request they revise (three at most)
  for (const said of earlier) {
    const q = said();
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
  const raw = String(text ?? '').slice(0, IFR_READ_CHARS);
  return writingAskedSaid(speech(raw), raw, saidLater(previous));
}
/** writingAsked on what they said and the read slice of their text (the same reading). */
function writingAskedSaid(sp: string, raw: string, earlier: SaidLater): boolean {
  if (writingForOthersSaid(sp, earlier)) return true;
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
  return movedOnSaid(speech(String(from ?? '').slice(0, IFR_READ_CHARS)), speech(String(now ?? '').slice(0, IFR_READ_CHARS)).trim(), prev);
}
/**
 * movedOn on what they said: speech of each message, as Own.sp holds it, and
 * the earlier one's topicWords when they are known (Own.topic) — so newTopicAt
 * reads no message twice. The same reading as movedOn.
 */
function movedOnSaid(fromSp: string, n: string, prev: string | null, fromTopic?: Set<string>, nowTopic?: Set<string>, nowWords?: number): boolean {
  const asks = /\?/.test(n) || NEW_PROBLEM.test(n) || /^\s*(?:(?:ok(?:ay)?|now|so|and|great|thanks|please|just|can you|could you)[\s,.!]+)*(?:tell|explain|write|summari[sz]e|list|translate|describe|give|show|help|what|how|why|which|who|when|where)\b/i.test(n);
  if (!asks || HINT_ASKED.test(n)) return false;
  // a short attempt at their problem ("is it 2x cos x?", "x = 3?") is not moving on
  const words = nowWords ?? wordCount(n);
  if (words <= 8 && /[=+*/^<>≤≥√∫∑π]|\b\d+\s*[a-z]\b|\b[a-z]\s*=/.test(n) && !NEW_PROBLEM.test(n)) return false;
  // the problem — and, for a short question back, what Socria last said about it ("Which rule applies?" → "The product rule?")
  const shortBack = /\?\s*$/.test(n) && words <= 5;
  const a = shortBack && prev ? topicWords(fromSp + ' ' + String(prev).slice(-IFR_READ_CHARS)) : (fromTopic ?? topicWords(fromSp));
  const b = nowTopic ?? topicWords(n);
  if (b.size < 1) return false;
  for (const w of b) if (a.has(w)) return false;
  return true;
}

/**
 * The words that say what a message is about: its content words of three
 * letters or more, less the question words and request verbs every question
 * shares. (movedOn's own reading; newTopicAt reads stems: topicStemsOf.)
 */
function topicWords(x: string): Set<string> {
  return new Set([...tokensOf(x)].filter((w) => /[a-z]{3,}/.test(w) && !/^(?:what|how|why|which|when|where|who|tell|explain|give|show|help|please|now|answer|question|first|try|let)$/.test(w)));
}

// ── stuck, corrected, already known: what mr-2026.11.1 reads ─────────
//
// THE PRECISION READERS. Each is gated on the policy (StrategyParams
// .precision): under an earlier version none of them is read and MR does what
// it did before, observation for observation. Their words are read as every
// explicit code is — addressed to Socria, in their own clause, never inside
// a quote or reported speech — and a report ("I'm stuck", "No, I meant X",
// "I know that") is never a preference: it is about this turn.

/** The explicit codes read outside readExplicit, so no reading of an earlier version (short, a quiz taken back, weak.short_reply) can change. */
type PreciseCode = 'explicit.stuck' | 'explicit.corrected' | 'explicit.knows_that';

const STUCK_ADV = String.raw`(?:\s+(?:still|completely|totally|really|so|kind of|kinda|a bit|a little|just|pretty|properly))*`;
const STUCK_FOR = String.raw`(?:\s+(?:all day|all week|again|for (?:hours|days|ages|a while|an hour|a week|so long)|since (?:yesterday|this morning|last week)))?`;
/** The pieces of work a stuck can be on ("this step", "my essay intro", "the second part"). */
const STUCK_NOUN = String.raw`(?:step|part|bit|one|line|question|problem|exercise|proof|bug|error|equation|function|derivation|derivative|integral|substitution|factori[sz]ation|calculation|formula|essay|intro(?:duction)?|conclusion|paragraph|thesis|sentence|assignment|task|homework|worksheet|code|script|program|algorithm|loop|query|section)s?`;
/** The verbs of working a piece of work through: "I'm stuck on how to factor this", "trying to solve this". */
const STUCK_VERB = String.raw`(?:start|begin|proceed|continue|go on|solve|factor|factori[sz]e|simplify|integrate|differentiate|rearrange|expand|substitute|prove|derive|calculate|compute|evaluate|balance|convert|answer|approach|tackle|finish|fix|debug|structure|write|set up)`;
/** …and its -ing form after "on" or "at": "I'm stuck at simplifying", "stuck on factoring the quadratic". */
const STUCK_GERUND = String.raw`(?:simplifying|factoring|factori[sz]ing|integrating|differentiating|solving|rearranging|expanding|substituting|proving|deriving|calculating|computing|evaluating|balancing|converting|debugging|writing)`;
/** A part by its number or its letter: "step 3", "part b", "question 3b", "q2a". */
const STUCK_PART = String.raw`(?:step|part|question|problem|exercise|number|q)\s*(?:\d+[a-h]?|[a-h])\b`;
/** An equation or an inequality named as the work: "stuck on 3x + 7 = 22", "stuck solving x^2 - 4 = 0" (a digit in it). */
const STUCK_MATH = String.raw`(?=[^.?!\n]{0,60}\d)[a-z0-9(][a-z0-9()^*/+.√ -]{0,30}?\s*[=<>≤≥]\s*[a-z0-9(-][a-z0-9()^*/+.√ -]{0,30}?`;
const STUCK_ON = String.raw`(?:it|this|that|this one|(?:this|that|the|my|our)\s+(?:[\w-]+\s+){0,3}?${STUCK_NOUN}|the (?:next|last|first|second|third|final) (?:step|part|bit|one|line|question|problem)|${STUCK_PART}|where to (?:go|start|begin)|what to do(?: next)?|how to ${STUCK_VERB}(?:\s+(?:the|this|my|it|that|these|them|this one)(?:\s+[\w-]+){0,2})?|how to do (?:it|this|that|this one|the (?:next|rest|last|first) (?:step|part|bit|one))|${STUCK_GERUND}(?:\s+(?:it|this|that|these|them|the|this|my)(?:\s+[\w-]+){0,2}|\s+${STUCK_MATH})?|${STUCK_MATH})`;
/** "With" takes a piece of work only: "stuck with this essay", never "stuck with it" (a contract, a car) or "stuck with this laptop". */
const STUCK_WITH = String.raw`(?:(?:this|that|the|my|our)\s+(?:[\w-]+\s+)?${STUCK_NOUN}|${STUCK_PART})`;
/** Which part of what: "step 3 of the proof", "the second part of the question", "the bit where you divide". */
const STUCK_OF = String.raw`(?:\s+(?:of|in|from|for) (?:the|this|my|our|that|your) (?:[\w-]+\s+){0,2}?[\w-]+|\s+where (?:you|i|we|it) [\w-]+(?:\s+[\w-]+){0,3})?`;
/**
 * Stuck, in their own words, now: "I'm stuck", "I'm stuck here", "I'm still
 * stuck on step 3 of the proof", "I've been stuck on this part all day",
 * "Stuck on part b", "I don't know where to start", "I'm not sure how to
 * continue", "I have no idea what to do", "I can't figure it out", "I don't
 * know how to solve this", "I've hit a wall", "I've hit a wall with this
 * proof", "I don't know where to start with this essay", "I'm stuck on how to
 * factor this", "I'm stuck again on the substitution", "I'm stuck on the
 * integration by parts part", "I'm stuck at simplifying", "I'm stuck trying
 * to solve this", "No idea how to do this", "I can't work out how to do
 * this", "I can't get past step 2" ("help I'm stuck": stuckWordsOf reads the
 * plea past). On a piece of work only: never a
 * place, a vehicle, a thing or an idea ("I'm stuck in traffic", "the door is
 * stuck", "I'm stuck on the problem of evil", "I'm stuck on why the sky is
 * blue", "I'm stuck with this laptop"), never somebody else ("she's stuck on
 * step 3"), never past or habitual ("I was stuck yesterday", "I got stuck",
 * "I get stuck at part two"), and never a failure that does not say stuck ("it
 * still did not work"). "idk" and a short reply stay what they were (an
 * answer that moved nothing, a weak reading). What the rest of the message
 * says can still put it aside (stuckWordsOf): feelings, grief, life, a way out
 * already found, a joke, a translation, the people around them. Not "I'm
 * stuck on how to tell my parents", "I'm stuck on how to do my taxes", "I'm
 * stuck trying to get home", "I can't get past the bouncer", "I've hit a wall
 * with my landlord". Known misses: "I'm feeling stuck…", "still lost" (left
 * to explicit.confused), "I got stuck on step 3" (read as the past), "I can't
 * figure it out on my own" (the clause goes on), "Stuck." alone, "I give up"
 * (their request for the answer), "I've been staring at this for an hour",
 * "What do I do next?".
 */
export const STUCK = new RegExp(
  [
    String.raw`\b(?:i${AP}?m|i am|im|i${AP}ve been|i have been|i${AP}m getting|i am getting)${STUCK_ADV}\s+stuck${STUCK_FOR}(?:(?:\s+(?:right here|here|at this point))?${CLAUSE_END}|\s+(?:(?:on|at)\s+${STUCK_ON}|with\s+${STUCK_WITH}|${STUCK_GERUND}\s+(?:it|this|that|this one|${STUCK_MATH})|trying to (?:solve|do|figure out|work out|prove|factor|simplify|integrate|differentiate|finish|answer|fix|debug) (?:it|this|that|this one|${STUCK_MATH}))${STUCK_OF}${STUCK_FOR}${CLAUSE_END})`,
    // opening the message, with no subject: "Stuck on step 3", "Stuck on this one"
    String.raw`^\W*stuck\s+(?:on|at)\s+${STUCK_ON}${STUCK_OF}${STUCK_FOR}${CLAUSE_END}`,
    String.raw`\bi(?:\s+(?:really|honestly|just|still))*\s+(?:don${AP}?t|do not|can${AP}?t|cannot)\s+(?:know|see|figure out|work out|tell)\s+(?:where|how)\s+to\s+(?:start|begin|go from here|proceed|continue|go on)(?:\s+(?:with|on)\s+(?:${STUCK_WITH}|it|this|that|this one))?${CLAUSE_END}`,
    // "I can't work out how to do this", "I don't see how to solve it"
    String.raw`\bi(?:\s+(?:really|honestly|just|still))*\s+(?:don${AP}?t|do not|can${AP}?t|cannot)\s+(?:see|figure out|work out|tell)\s+how\s+to\s+(?:do|solve|approach|tackle|answer|finish|prove|factor|simplify)\s+(?:it|this|that|this one)${CLAUSE_END}`,
    String.raw`\bi(?:\s+(?:really|honestly|just|still))*\s+(?:don${AP}?t|do not)\s+know what to do(?:\s+(?:next|now|from here|here|with (?:it|this|that)))?${CLAUSE_END}`,
    // with its subject, so addressed() sees nothing before it: "I'm not sure how to start", "I have no idea where to start"
    String.raw`\b(?:(?:i${AP}?m|i am|im)\s+|i have\s+|i(?:${AP}ve| have) got\s+)?(?:(?:really|honestly|just|still|totally|completely)\s+)?(?:no idea|no clue|not sure)\s+(?:(?:where|how)\s+to\s+(?:start|begin|go from here|proceed|continue|go on)(?:\s+(?:with|on)\s+(?:${STUCK_WITH}|it|this|that|this one))?|how to (?:do|solve|approach|tackle|answer|finish|prove|factor|simplify) (?:it|this|that|this one)|what to do(?:\s+(?:next|now|from here))?)${CLAUSE_END}`,
    String.raw`\bi${AP}?(?:ve| have) hit a wall(?:\s+(?:with|on)\s+(?:${STUCK_WITH}|it|this|that|this one))?${CLAUSE_END}`,
    // "I can't get past step 2", "I can't get past this part"
    String.raw`\bi(?:\s+(?:really|honestly|just|still))*\s+(?:can${AP}?t|cannot|can not)\s+get past\s+(?:${STUCK_PART}|(?:this|that|the next|the first|the second|the last) (?:step|part|bit|one|line|question))${CLAUSE_END}`,
    String.raw`\bi(?:\s+(?:really|honestly|just|still))*\s+(?:can${AP}?t|cannot|can not)\s+figure\s+(?:it|this|that|this one)\s+out${CLAUSE_END}`,
    String.raw`\bi(?:\s+(?:really|honestly|just|still))*\s+(?:can${AP}?t|cannot|can not|don${AP}?t know how to|do not know how to)\s+(?:figure out|work out|solve|do|approach)\s+(?:it|this|that|this one|what to do(?:\s+next)?|the next (?:step|part|bit|one)|the rest)${CLAUSE_END}`,
  ].join('|'),
  'i'
);
/**
 * Stuck again, opening a clause: "still stuck", "nope, still stuck", "Tried
 * that, still stuck", "Still stuck here", "Hmm, still stuck at the same spot",
 * "stuck again". Read only in an episode of a stuck they said (stuckAgainAt),
 * or after a reply with a task on the table (stuckStillAt): alone it could be
 * anything ("still stuck in traffic" is not even this).
 */
export const STILL_STUCK = new RegExp(String.raw`^\W*(?:(?:no|nope|hmm+|ugh+|sorry|ok(?:ay)?|yeah|well|and|but|so|(?:i )?tried (?:that|it|this|both|everything)(?: too| already| again)?|did (?:that|it)|done that)[\s,.!]+)*(?:(?:i${AP}?m|i am|im)\s+)?(?:still\s+stuck|stuck\s+again)(?:\s+(?:right here|here|at this point))?(?:\s+(?:on|at|with)\s+(?:the same (?:step|part|bit|one|problem|line|thing|spot|point|place)|${STUCK_ON}))?${CLAUSE_END}`, 'i');
/** STILL_STUCK at the start of any clause of the message, not only the first: "Thanks. Still stuck though." */
const STILL_STUCK_ANYWHERE = new RegExp(String.raw`(?:^|[.!?;,:\n]\s*|\s[—–-]\s*)` + STILL_STUCK.source.slice(1), 'gi');

/**
 * Feelings and grief beside the stuck words: "I'm so stuck. I can't stop
 * crying", "Honestly I'm stuck, I feel worthless", "my marriage is falling
 * apart and I'm stuck", "I failed my exam and I don't know what to do". What
 * is stuck there is not a piece of work, and a next step or a locating
 * question would answer a feeling with a task. (Their tenderness and
 * readSignals' vent, sensitive and safety are read too: stuckWordsOf.) Life
 * itself and despair count: "I feel stuck in life", "I don't know what to do
 * anymore". Never "dead end", "panic" alone (a kernel panic), "it doesn't work
 * anymore"; "my program died" is a known miss of the other kind.
 */
const STUCK_AFFECT = new RegExp(
  String.raw`\b(?:cry|cries|crying|cried|in tears|worthless|hopeless|pointless|meaningless|hate (?:everything|myself|my life|it all)|exhausted|burn(?:ed|t) out|burnout|fall(?:ing|en)? apart|died|dying|death|dead(?! end)|passed away|funeral|grief|griev\w*|divorc\w*|dumped|break ?up|broke up|marriage|hospital|depress\w*|anxious|anxiety|panic attacks?|panicking|lonely|loneliness|suicid\w*|self[- ]harm|overwhelm\w*|can${AP}?t (?:get out of bed|cope|sleep|breathe|go on|take (?:it|this) any ?more)|nothing (?:will|is going to) (?:ever )?change|emotionally|in a rut|in life|what to do any ?more|(?:can${AP}?t|cannot) (?:do|handle) (?:this|it) any ?more|evict\w*|homeless|fail(?:ed|ing) (?:my|the|this) (?:exam|test|class|course|module|year|interview))\b`,
  'i'
);
/** Life logistics: a trip, a home, a job — "I'm stuck, my flight got cancelled", "my car is in the shop", "my landlord…". */
const STUCK_LIFE = new RegExp(
  String.raw`\b(?:flights?|airport|stranded|in traffic|traffic jam|snowed in|elevator|in the shop|car (?:is|was|broke|won${AP}?t)|flu|covid|fever|landlord|lease|tenancy|visa|mortgage|commute|stuck (?:at|in) (?:home|work|the office)|my (?:job|boss))\b`,
  'i'
);
/**
 * The people and the life around a stuck among other words (stuckWordsOf
 * 'bare'): "I don't know what to do. I think my friend is angry with me", "I'm
 * stuck, my sister won't talk to me", "I feel stuck and I don't know what to
 * do", "I don't know what to do, should I take the job in Berlin or stay?".
 * With no work named beside it, what is stuck there is a life, not a
 * piece of work, whatever task the window holds. A stuck with the work named
 * ("I'm stuck on step 3, my dad couldn't help either") is read.
 */
const STUCK_PEOPLE = new RegExp(
  String.raw`\b(?:my|our) (?:friends?|best friend|partner|boyfriend|girlfriend|bf|gf|wife|husband|ex|family|mum|mom|dad|mother|father|parents?|sister|brother|son|daughter|kids?|children|roommate|flatmate|relationship|crush|neighbou?rs?|boss|manager|colleagues?|co-?workers?|life|career|future)\b|\b(?:angry|mad|upset|annoyed|cross) (?:with|at) me\b|\bignoring me\b|\bwith my life\b|\bfeel(?:s|ing)? (?:so |really |kind of |kinda |a bit )?stuck\b|\b(?:take|took|accept|turn down|quit|leave|got) (?:the|a|my|this|that|an) (?:job|offer|position|role)\b|\bjob offer\b|\bor stay\b|\bmove (?:abroad|out|house|cities|countries)\b`,
  'i'
);
/** "help I'm stuck", "Help me, I'm stuck": a plea before the stuck words, which no lead-in reads ("help" alone is not one). */
const HELP_LEAD = /^\W*help(?:\s+(?:me|pls|please))?[\s,!.:—–-]+(?=(?:i|i['’]m|im|i am)\b)/i;
/** After the stuck words, a way out already found: "…but I figured it out", "…All good now.", "…that step made it click", "…I got it!". */
const STUCK_RESOLVED = new RegExp(
  String.raw`\b(?:(?:figured|worked|sorted|puzzled) (?:it|this|that) out|got it(?=\s*(?:[.!,;:)]|$|\b(?:now|thanks|thank you|lol|haha|after all)\b))|(?:solved|fixed|cracked|nailed) (?:it|this|that)|made it click|(?:it|that|everything) clicked|all good|works now|working now|i (?:see|get|understand) (?:it )?now|never ?mind|nvm|no longer stuck|not stuck any ?more|unstuck)\b`,
  'i'
);
/** …or taken back: "lol jk", "Kidding!", "just joking". */
const STUCK_RETRACTED = /\b(?:jk|j\/k|just kidding|kidding|joking|just joking)\b/i;
/** The words asked about, not said: "Translate to Spanish: I am stuck", "How do you say I'm stuck in French?" */
const STUCK_QUOTED = new RegExp(
  String.raw`\btranslat(?:e|ion|ing)\b|\bhow (?:do|would|can|should) (?:you|i|we|one) say\b|\bsay\b[^.?!]{0,40}\bin (?:english|spanish|french|german|italian|portuguese|japanese|chinese|mandarin|korean|arabic|russian|hindi|dutch|latin|greek)\b|\bwhat(?:${AP}s| is) (?:the )?(?:word|phrase|idiom|expression) for\b`,
  'i'
);
/**
 * A piece of work named in the message, so a stuck among other words is
 * about it: "the next step", "question 3", "my essay", "a hint". (Not "the
 * line at the bank": a line is one of code or of working.)
 */
const STUCK_WORK = new RegExp(
  String.raw`\b(?:problems?|steps?|code|errors?|equations?|essays?|homework|exercises?|questions?|proofs?|assignments?|functions?|bugs?|tasks?|scripts?|paragraphs?|parts?|formula[es]?|formulas|integrals?|derivatives?|substitutions?|calculations?|thesis|sentences?|algorithms?|loops?|queries|query|hints?|clues?|nudge|worksheets?|programs?|line \d+|(?:this|that|the|which|next|first|last) line(?! (?:at|for|of people)\b))\b`,
  'i'
);
/** A plea for help beside the stuck words adds nothing to them: "can you help?", "any hints?", "what now?". */
const STUCK_PLEA = new RegExp(
  String.raw`\b(?:(?:can|could|would|will) you (?:please )?(?:help(?: me)?(?: (?:out|with (?:it|this|that)))?|give me (?:a |some |another )?(?:hint|clue|nudge|tip|pointer)s?)|please help(?: me)?|help(?: me)?(?: please)?|any (?:ideas|tips|hints?|help|clues?)|what (?:should|do|can) i do(?: now| next)?|what now|now what)\b`,
  'gi'
);
/** Words around the stuck words that say nothing of their own. */
const STUCK_FILLER = new Set('i ok okay so and but then now also actually please pls just hey hi hello yes yeah yep well hmm um uh oh honestly really lol ugh help thanks thank you sorry man dude guys again a the this it bit kinda'.split(' '));
/**
 * Their own task, in so many words: their homework, a class, an assignment,
 * something they have to do. What makes the work on the table theirs (and so
 * a next step, not Socria doing it): "for my CS class", "This is for my
 * physics homework", "I have to write an essay on it".
 */
const THEIR_TASK = new RegExp(
  String.raw`\b(?:homework|assignment|coursework|worksheet|problem set|practi[cs]e (?:problem|question)s?|exam|revision|my (?:class|course|module|lesson|teacher|professor|tutor|lecturer)|for (?:my|a|the|our) (?:[\w-]+ )?(?:class|course|module|lesson|exam|test|quiz|lab)|i (?:have|need|got|am supposed) to (?:write|do|solve|finish|submit|answer|learn|prove|find|calculate|work out|balance|translate)|i${AP}?m (?:learning|studying|practi[cs]ing|revising))\b`,
  'i'
);
/** The work pointed at as theirs, when it is on their screen: "I'm stuck on this problem" with a photo of it. */
const POINTS_AT_WORK = new RegExp(String.raw`\b(?:this|these|my)\s+(?:[\w-]+\s+)?${STUCK_NOUN}\b`, 'i');
/** A problem set by the reply itself: "Try this one: integrate x^2 e^x dx.", "What do you get when you plug in u = 12?" */
const TRY_THIS = new RegExp(String.raw`\b(?:try (?:this|these|it|one)|your turn|here(?:${AP}s| is) (?:one|a problem|an exercise|a question)|have a go)\b`, 'i');
/** The verbs of a task the reply asks them to do: "Can you balance it?", "What do you get when you rearrange for h?" */
const TASK_VERB = /\b(?:balance|calculate|compute|evaluate|work out|rearrange|plug in|substitute|factor|expand|translate|rewrite|conjugate|label|convert)\b/i;
/** Where a refusal can stand on its own: what may follow it in its clause ("no hints please", "let me think for a minute", "let me have another go first"). */
const DECLINE_END = String.raw`(?:\s+(?:please|pls|yet|for now|for a (?:minute|moment|second|sec|bit|while)|thanks|thank you|first|myself|on my own|again|a bit (?:longer|more)|about it|it through))*(?=\s*(?:[.,;:!)]|$|\b(?:just|i|i${AP}m|i${AP}ll|i${AP}d|let|and|but|so|i want|thanks|please)\b))`;
/**
 * A refusal of help beside the stuck words: "No hints, just let me think",
 * "but no hints please", "don't give me the next step, I'll figure it out",
 * "I don't want help yet", "I'd like to keep trying on my own", "just let me
 * vent", "let me have another go first". The reading keeps explicit.stuck and
 * adds the ref stuck.declines, on which every stuck rule stands aside
 * (lib/mr/policy.ts): a next step, a locating question or a worked example
 * would run over what they said. ("Don't tell me the answer" is also their
 * own try, read by readExplicit.) A refusal is said, not reported: "no hints"
 * opens its clause and closes it (DECLINE_END), and "let me think" ends its
 * clause — so not "I have no clue where to start", "No clue where to begin",
 * "the textbook is no help", "my notes give no hints on this step", "I found
 * no answers online", "there are no solutions in the back of the book", "Let
 * me try to explain what I did: …" or "let me think out loud: …", each an
 * ordinary stuck report.
 */
export const STUCK_DECLINES = new RegExp(
  [
    String.raw`(?:^|[.!?;,:\n—–]\s*|\s(?:but|and|so|just|please)\s+)(?:(?:but|and|so|just|please|ok(?:ay)?)\s+)*(?:no|without|not any|zero) (?:hints?|help|spoilers?|clues|answers?|solutions?)${DECLINE_END}`,
    String.raw`\b(?:don${AP}?t|do not) (?:give|tell|show|hand) me (?:anything|the (?:next step|answer|solution|steps?)|a hint|hints|any (?:hints?|help|clues?))\b`,
    String.raw`\blet me (?:think|try|keep trying|work (?:it|this) out|figure(?: (?:it|this))?(?: out)?|have (?:a|another) go)${DECLINE_END}`,
    String.raw`\bi${AP}?(?:ll| will) (?:figure|work) (?:it|this) out\b`,
    String.raw`\bi (?:don${AP}?t|do not) (?:want|need) (?:any |your )?(?:help|hints?|clues?|spoilers?|the answer)${DECLINE_END}`,
    String.raw`\bi${AP}?d (?:like|rather|prefer) to (?:keep trying|try (?:again|myself|on my own)|figure (?:it|this) out|work (?:it|this) out)\b`,
    String.raw`\b(?:keep trying|try) on my own\b`,
    String.raw`\b(?:let me|need to|want to) vent\b`,
  ].join('|'),
  'i'
);

/**
 * The solution asked for beside the stuck words: "I got 3x = 15 but I'm stuck.
 * Walk me through the rest.", "Can you solve it for me?", "Give me the full
 * solution please.", "Show me the whole solution.", "Can you do the rest?",
 * "Show me how to do it all the way through.", "Tell me what x is.", "What is
 * x?". The reading keeps explicit.stuck and adds the ref stuck.wants_answer,
 * on which every stuck rule stands aside (lib/mr/policy.ts): one step, a
 * locating question or a worked example would hand over less than they asked
 * for. A request, not a report: "I don't know how to solve this" and "I'm stuck
 * on how to do the rest" ask for nothing (the verb opens a sentence or follows
 * a request frame: "can you", "could you", "please", "just").
 */
export const STUCK_WANTS_ANSWER = new RegExp(
  [
    String.raw`\b(?:walk|talk|take|run) me through (?:it|this|that|the (?:rest|whole (?:thing|problem|solution|working)|solution|steps|working))\b`,
    String.raw`(?:^|[.!?;:\n]\s*|\b(?:can|could|would|will) you (?:please |just )?|\bplease\s+|\bjust\s+)(?:solve|finish|do|complete|work out|answer) (?:it|this|that|the rest|the whole (?:thing|problem|question)|this one|that one|the problem|the question)(?: for me)?(?: please)?(?=\s*(?:[?.!,]|$|\b(?:for me|please|all the way)\b))`,
    String.raw`(?:^|[.!?;:\n]\s*|\b(?:can|could|would|will) you (?:please |just )?|\bplease\s+|\bjust\s+)work (?:it|this|that) out(?: for me)?\b`,
    String.raw`\b(?:give|show|tell|send) me (?:the )?(?:full|whole|complete|entire|final|worked) (?:solution|working|workings|answer|thing|method)\b`,
    String.raw`\bshow me how to (?:do|solve|finish) (?:it|this|that)(?: all the way(?: through)?| to the end| from start to finish)\b`,
    String.raw`\bexplain the (?:whole|full|complete|entire) (?:solution|thing|working|method)\b`,
    String.raw`\btell me (?:what (?:x|y|z|the answer|the result) is|the answer)\b`,
    String.raw`(?:^|[.!?;:\n]\s*)(?:so\s+)?what(?:${AP}s| is) (?:x|y|z|the (?:answer|solution|result))\s*\?`,
  ].join('|'),
  'i'
);

/**
 * A stop on questions in words readExplicit's stop does not read, read only
 * under params.precision (readWords) as explicit.stop_questions: "No follow-up
 * questions please.", "Stop questioning me.", "Stop with the questions.",
 * "Stop asking me follow-up questions.", "Please stop ending every reply with
 * a question.", "Don't ask me any more questions." Said to Socria (addressed),
 * and "no questions" opens and closes its clause — so not "There were no
 * questions on the exam", "no questions about the budget came up", "stop
 * asking me so many questions at once" (fewer, not none), or "my teacher said
 * no questions in class".
 */
export const NO_QUESTIONS_SAID = new RegExp(
  [
    String.raw`(?:^|[.!?;,:\n—–]\s*|\s(?:but|and|so|just|please)\s+)(?:(?:but|and|so|just|please|ok(?:ay)?)\s+)*(?:no|without) (?:more |further |follow[- ]?up |extra |other )?questions(?:\s+(?:please|pls|thanks|thank you|this time|for now))*(?=\s*(?:[.,;:!)]|$|\b(?:just|i|and|but|thanks|please)\b))`,
    String.raw`\bstop (?:questioning|quizzing|interrogating) me\b`,
    String.raw`\bstop with (?:the|all the|your) questions\b`,
    String.raw`\bstop asking (?:me )?(?:any |more |the |your )?(?:follow[- ]?up |further |extra )questions\b`,
    String.raw`\bstop (?:ending|finishing|closing) (?:every|each|all|your) (?:reply|replies|answer|answers|message|messages|response|responses) (?:with|on) (?:a )?questions?\b`,
    String.raw`\b(?:don${AP}?t|do not) (?:ask|give) me (?:any )?(?:more |further |follow[- ]?up )questions\b`,
  ].join('|'),
  'i'
);

/**
 * Brevity asked of Socria in words SHORTER_REPLIES and SHORTER do not read,
 * read only under params.precision (readWords): "Be brief. What is TCP?",
 * "please be concise", "Please keep all your answers short from now on".
 * Addressed, and never beside their own writing named ("help me be concise in
 * my cover letter"). Not "I want to be brief", "how do I be concise in
 * interviews?", "be short with him".
 */
const BREVITY = new RegExp(
  String.raw`\bbe (?:brief|concise|succinct|terse|short)\b(?! (?:with|in|when|about|of|for)\b)|\bkeep (?:all |all of )?your (?:answers?|replies|responses|messages?|explanations?)(?: (?:a (?:lot|bit|little)|much|way))? (?:short|shorter|brief|briefer|concise)\b`,
  'i'
);

/**
 * What can open a correction, at the start of the message or of a sentence:
 * "no", "sorry", "thanks, but", "ok but", "close, but", "not that one", "not
 * quite", "wrong one", "oops", "my bad", "that's not it". Never after a dash
 * or a comma inside a sentence: "quiz me — no, I meant just tell me" takes
 * back their own words, not Socria's reading.
 */
const CORRECTION_LEAD = String.raw`(?:no|nope|nah|sorry|oh|ah|wait|actually|hmm+|well|ok(?:ay)?|but|thanks|thank you|right|close|not (?:that|this|quite)(?: one)?|wrong one|oops|uh+|um+|my bad|that${AP}?s not (?:it|helpful|right|quite (?:it|right)|what i (?:wanted|needed)))`;
const CORRECTION_START = String.raw`(?:^|[.!?\n]\s*)\W*(?:${CORRECTION_LEAD}[\s,.!:—–-]+)*`;
/** …and at the start of the message only, for the present "I mean" (in a later sentence it is as often "I think": "Thanks. I mean the second one is clearer"). */
const CORRECTION_OPENS = String.raw`^\W*(?:${CORRECTION_LEAD}[\s,.!:—–-]+)*`;
/** After "I mean": agreement and filler ("I mean yeah that makes sense", "i mean thats fair", "I mean sure, why not", "I mean both work"). */
const MEAN_FILLER = String.raw`(?:\s*[,—–-]|\s+(?:it|that|like|really|come on|yeah|yes|yep|sure|ok(?:ay)?|honestly|i guess|i suppose|you${AP}?re right|thats|both|these|either|well|whatever|kind of|kinda|sort of|basically|seriously|literally|obviously|of course|why not|fair|true|right|exactly|same|no offen[cs]e|thanks|thank you|its|this is|what if|you could|you can|we could|we can|maybe|perhaps|in a way)\b)`;
/** A verdict on the reply after "I mean": "I mean the explanation was good though", "I mean the first one was clearer", "…is the one I like best". */
const MEAN_VERDICT = String.raw`(?![^.!?]{0,60}\b(?:better|best|great|good|clearer|nicer|easier|helpful|perfect|love|loved|like|liked|cool|interesting)\b)`;
/** After "I meant": what corrects nothing ("I meant to ask earlier", "I meant it", "I meant every word", "I meant that as a compliment"). */
const MEANT_NOT = String.raw`(?:to (?:ask|say|tell|mention|write|type|add)|it|that(?!\s+one)|every word|what i said|well|no offen[cs]e|no harm|it${AP}?s fine|nothing|as a (?:compliment|joke))\b`;
/** Praise after "not what I meant": "Not what I meant but honestly this is better" approves the reply. */
const APPROVES_AFTER = String.raw`(?![^.!?]{0,40}\b(?:better|great|perfect|love|helpful|works|fine|good)\b)`;
/**
 * Their correction of how the question was read, after a reply: "No, I meant
 * on my Mac", "Thanks, but I meant the Leibniz one", "Not that, I meant…",
 * "Sorry, I should have been clearer. I meant Leibniz", "I meant Python, not
 * Java", "that's not what I meant", "That's not what I'm asking", "I didn't
 * mean that", "you misunderstood my question", "Sorry, I was asking about the
 * API", "I'm asking about Leibniz, not Haskell"; a question re-asked because
 * the reply missed it ("You didn't answer my question", "That doesn't answer
 * my question", "No, I asked how to export them", "My question was how…");
 * and a corrected assumption (CORRECTED_SETUP). It opens their message or a
 * sentence: "I meant to ask earlier", "no, I mean it's fine", "I mean, it
 * works but it is slow", "I mean yeah that makes sense", "I meant that as a
 * compliment", "No offence meant" and "Not what I meant but honestly this is
 * better" are not corrections (MEAN_FILLER, MEANT_NOT, CORRECTED_NOT keep the
 * rest out). Never read on a first message. Known misses: "I was asking about
 * the Leibniz monad" (no lead and no "not X"), "But how do I export them?".
 */
export const CORRECTED = new RegExp(
  [
    String.raw`${CORRECTION_START}i meant(?!\s+${MEANT_NOT})\b`,
    String.raw`${CORRECTION_OPENS}i mean(?!${MEAN_FILLER})${MEAN_VERDICT}\b`,
    String.raw`\b(?:that${AP}?s not what (?:i (?:meant|asked|was asking|am asking)|i${AP}?m asking)|not what (?:i (?:meant|asked(?: for)?|was asking(?: about| for)?|am asking(?: about| for)?)|i${AP}?m asking(?: about| for)?)|(?:that${AP}?s|that is|that was|this is) not (?:my|the) question|that (?:isn${AP}?t|wasn${AP}?t) (?:my|the) question|i (?:didn${AP}?t|did not) mean (?:that|it)(?!\s+(?:as|to|in a|personally|badly|literally|any (?:harm|offen[cs]e)))|i (?:didn${AP}?t|did not) ask (?:about|for) (?:that|this)|you misunderstood(?: me| my question| the question)?|you(?:${AP}ve| have)? misread (?:me|my question|the question)|you(?:${AP}re| are) misunderstanding)\b${APPROVES_AFTER}`,
    String.raw`^\W*(?:no|nope|nah|sorry|actually|oh|wait)[\s,.!:—–-]+(?:i was|i${AP}m|i am) (?:asking|talking) about\b`,
    String.raw`${CORRECTION_START}(?:i was|i${AP}?m|i am) (?:asking|talking) about [^.?!]{1,60},? not\s+\S`,
    String.raw`\bi meant [^.?!]{1,60},? not\b`,
    // the reply missed the question
    String.raw`\byou (?:still |really |just )?(?:didn${AP}?t|did not|haven${AP}?t|have not|never) (?:actually |really )?answer(?:ed)? (?:my|the) question\b`,
    String.raw`\b(?:that|this|it) (?:still )?(?:doesn${AP}?t|does not|didn${AP}?t|did not) (?:actually |really )?answer (?:my|the) question\b`,
    String.raw`^\W*(?:(?:no|nope|but|sorry|actually|well|ok(?:ay)?|wait)[\s,.!:—–-]+)*i asked (?:you )?(?:how|what|why|about|for|if|whether|which|where|when|who)\b(?![^.!?]{0,60}\b(?:(?:my|his|her|their) (?:teacher|professor|tutor|boss|friend|mum|mom|dad|parents|doctor|manager|lecturer|colleague)|yesterday|last (?:week|time|year|night)|in class|at school|at work)\b)(?![^.!?]{0,80}\b(?:they|he|she|someone|somebody|nobody|the (?:bank|shop|store|seller|landlord|staff|company|support|agent|clerk))\s+(?:\w+\s+)?(?:said|says|told|replied|answered|refused|ignored|wouldn${AP}?t|couldn${AP}?t|didn${AP}?t|won${AP}?t|can${AP}?t)\b)`,
    String.raw`${CORRECTION_START}my (?:actual |original |real )?question (?:was|is) (?:about|how|what|why|whether|if|which|where|when|who|for|regarding|really|actually|simply|just)\b`,
  ].join('|'),
  'i'
);
/** "I mean it", "I meant it as a joke", "I meant every word", "I meant 'carpe diem' as my motto", "no offence": the words of a correction that correct nothing, anywhere in the message. */
export const CORRECTED_NOT = new RegExp(String.raw`\bi mean(?:t)? (?:it|that)(?: (?:as a joke|literally|seriously|sincerely))?[.!]?\s*$|\bi meant (?:it|that|every word|what i said)\b(?!\s+one\b)|\bas (?:a|an|my|our) (?:compliment|joke|motto|nickname|example|metaphor|tribute|quote|slogan|tagline|title|name)\b|\bi meant to (?:ask|say|tell|mention)\b|\bno offen[cs]e\b`, 'i');
/** What a corrected assumption cannot be about: "No, I have a question", "No, I'm on it", "Actually I have no idea". */
const SETUP_OBJECT = String.raw`(?!(?:(?:a|an|the|my)\s+)?(?:question|questions|idea|clue|problem|doubt|feeling|time|minute|moment|sec(?:ond)?|appointment|meeting|class|exam|test|follow|bit|lot|few|no|any|one|another|nothing|something|to|been|already|never|not|it|this|that|them|you|board|track|holiday|vacation|break|leave|call|fire|my way|the way|same|latest|newest|done|seen|got|gotten|given|taken|made|had|read|heard|gone|found|bought|met|known|thought|said|told|written|begun|kept|lost|won|sent|spent|built|caught|taught|felt|held|brought|paid|sold|watched|[\w-]{3,}ed)\b)(?:(?:a|an|the|my)\s+)?[\w.+#-]+(?:\s+[\w.+#-]+){0,2}`;
/** The state of a fix said with "I have", not a setup: "No, I have the latest driver installed", "Nope, I have tried that already". */
const SETUP_FIX_STATE = String.raw`(?![^.!?]{0,40}\b(?:installed|updated|upgraded|latest|newest|up to date|already|tried|checked|restarted|rebooted|enabled|disabled|turned (?:on|off))\b)`;
/** A device, a system or a language, as "No, it's a Mac" names one. */
const SETUP_THING = String.raw`(?:mac(?:book)?(?: (?:air|pro))?|imac|mac ?os|os x|windows(?: \d+)?|linux|ubuntu|debian|fedora|chromebook|chrome ?os|iphone|ipad|android(?: phone)?|pc|python|javascript|typescript|java|c\+\+|c#|ruby|rust|golang|php|swift|kotlin|excel|google sheets|google docs)`;
/** What the word after "not" cannot be in a correction's "X, not Y": "not sure", "not that it matters", "not just the laptop", "not too long". */
const NOT_WORD = String.raw`(?!(?:sure|that|this|just|only|really|too|very|so|much|quite|certain|exactly|even|yet|necessarily|always|all|everything|anything|everyone|for|to|because|if|in|on|at|with|your|you|me|now|again|anymore|any ?more|working|getting|having|seeing|good|bad|great|ideal|helpful|happy|ready|done|finished|bothered|worried|fussed|important|relevant|urgent|cool|okay|ok|fine|possible|wrong|right|same|one|first|last|next|second|third|only|best|worst|biggest|least|most)\b)`;
const NOT_CONTRAST = String.raw`${NOT_WORD}(?:(?:a|an|the|my)\s+${NOT_WORD})?`;
/**
 * The contrast that makes it a correction: "no", "nope", "actually", "wait",
 * and owning the gap: "Sorry, I should have said, I'm on a Mac", "I should
 * have mentioned I use Linux".
 */
const CONTRAST_LEAD = String.raw`(?:no|nope|nah|actually|sorry|oh|wait|but|hmm+|um+|well|i should(?: have|${AP}ve) (?:said|mentioned|specified|clarified|been clearer)(?: (?:that|earlier|before))?)`;
/**
 * A corrected assumption, after a reply: "No, I'm on a Mac", "Actually I use
 * Linux", "That's for Windows. I have a Mac.", "I'm using macOS, not Windows",
 * "This is JavaScript, not Python", "No, it's a Mac", "I'm not on Windows, I
 * use a Mac", "I don't use Windows, I have a MacBook". A contrast opens it, or
 * it ends in "not X" with a thing for X (NOT_CONTRAST). Not "No, I'm good",
 * "No, I have a question", "No, I'm on it", "This is great, not too long"
 * (praise: CORRECTED_PRAISE), "I use a VPN, not sure if that matters", "I use
 * Chrome, not that it matters", "I have the same problem on my phone, not just
 * the laptop", "Nope, I have tried that already" or "No, I have the latest
 * driver installed" (the state of a fix: SETUP_FIX_STATE), "That's for later.
 * I have another question." Borderline, read: "I have Windows 11, not 10".
 */
const SETUP_AT_START = [
    String.raw`^\W*(?:${CONTRAST_LEAD}[\s,.!:—–-]+)+(?:i${AP}?m|i am|im) (?:on|using|running|in|with)\s+${SETUP_OBJECT}${CLAUSE_END}`,
    String.raw`^\W*(?:${CONTRAST_LEAD}[\s,.!:—–-]+)+i (?:use|have|run|own|work (?:on|with|in))\s+${SETUP_FIX_STATE}${SETUP_OBJECT}${CLAUSE_END}`,
    String.raw`^\W*(?:(?:but|no|nope)[\s,.!:—–-]+)?(?:that|this|it)${AP}?s? (?:only |just |meant )?(?:for|about) (?!(?:later|now|another time|next time|tomorrow|today|you|me|fun|real)\b)[^.?!]{1,30}[.!,;]\s*(?:but\s+)?(?:i${AP}?m|i am|im|i)\s+(?:on|using|use|have|run|running|own)\s+${SETUP_OBJECT}`,
    // "No, it's a Mac", "Wrong OS, it's a Mac"
    String.raw`^\W*(?:(?:no|nope|actually|wrong (?:os|one|platform|system|device|version|language))[\s,.!:—–-]+)+(?:it${AP}?s|it is|this is|that${AP}?s) (?:a |an |on (?:a |an )?)?${SETUP_THING}${CLAUSE_END}`,
    // "I'm not on Windows, I use a Mac", "I don't use Windows, I have a MacBook"
    String.raw`^\W*(?:i${AP}?m not|i am not|im not) (?:on|using|running) [^.?!,;]{1,30}[,;.]\s*(?:i${AP}?m|i am|im|i) (?:on|using|use|have|run|running|own)\s+${SETUP_OBJECT}`,
    String.raw`^\W*i (?:don${AP}?t|do not) (?:use|have|run|own) [^.?!,;]{1,30}[,;.]\s*(?:i${AP}?m|i am|im|i) (?:on|using|use|have|run|running|own)\s+${SETUP_OBJECT}`,
];
export const CORRECTED_SETUP = new RegExp(
  [
    ...SETUP_AT_START,
    String.raw`(?:^|[.!?\n]\s*)\W*(?:${CONTRAST_LEAD}[\s,.!:—–-]+)*(?:i${AP}?m|i am|im|i) (?:using|on|running|use|run|have) (?!(?:it|this|that|them|my way|the way|board|track|the same)\b)[^.?!,]{1,30},? not\s+${NOT_CONTRAST}[\w.+#-]+`,
    String.raw`^\W*(?:(?:but|no|nope|actually)[\s,.!:—–-]+)?(?:this|that|it) (?:is|was|${AP}s) (?:in |for |about )?[^.?!,]{1,30},? not\s+(?:in |for |about )?${NOT_CONTRAST}[\w.+#-]+(?:\s+[\w.+#-]+)?${CLAUSE_END}`,
  ].join('|'),
  'i'
);
/** CORRECTED_SETUP's cheap superset (readPrecise): its other alternatives all need "not" ("…, not Windows"). */
const SETUP_START = new RegExp(SETUP_AT_START.join('|'), 'i');
const setupPossible = (sp: string): boolean => /\bnot\s/i.test(sp) || SETUP_START.test(sp);
/** Praise in the same first sentence turns a "this is X, not Y" into a verdict on the reply. */
const CORRECTED_PRAISE = /\b(?:great|good|fun|nice|perfect|helpful|better|clear|easy|useful|amazing|awesome|brilliant|interesting|cool|fine|correct|right|wrong|true)\b/i;

/**
 * The end of their word that the reply said it again: the clause closes there,
 * and not on a question ("You already covered this? I missed it") or with more
 * of what was said ("You already said that range starts at zero, right?",
 * "You already told me that would happen, and it did!").
 */
const SAID_AGAIN_END = String.raw`(?=\s*(?:[.,;!)]|$|\b(?:already|before|twice|earlier|again|though|but|and|lol|tbh|honestly|man|dude)\b))`;
/** Where "I know that" can open: their message or a sentence, after "yes", "thanks", "got it", "right, but". */
const KNOW_LEAD = String.raw`(?:(?:yes|yeah|yep|ok(?:ay)?|right|sure|um+|well|thanks|thank you|got it|cool|but|great|fine|sorry|honestly|actually|i mean)[\s,.!—–-]+)*`;
const KNOW_START = String.raw`(?:^|[.!?\n]\s*)\W*${KNOW_LEAD}`;
/** CLAUSE_END without "now" and "still": "I know that now" is what the reply taught them, not background they had. Not "thanks to you" either. */
const KNOW_END = String.raw`(?=\s*(?:[.,;:!?)]|$|\b(?:either|at all|already|sorry|lol|tbh|honestly|but|and|though|please|thanks(?! to\b)|thank you|so|too|well)\b))`;
/**
 * The background is known to them, after a reply that explained it: "I know
 * that already", "I know what recursion is, I want to know when to avoid it",
 * "I know how loops work", "I know about loops", "I know that part", "Thanks,
 * I know that", "I understand that part", "I get that", "I'm familiar with
 * loops", "I'm not new to this", "I've done this before", "Yes, I'm aware.",
 * "we covered this", "We went over this", "skip the basics", "Skip the
 * explanation", "No need to explain", "I don't need the background", "I'm not
 * a beginner" — and their word that the reply said it again: "You already
 * said that", "You're repeating yourself", "You keep saying the same thing",
 * "Stop repeating yourself". Not "I know you're busy", "I know, right?", "I
 * know that you said X", "I know that feeling", "I don't know that", "I know
 * a guy who does this", "I don't think we covered this", "I know that now",
 * nor a check or a story of what was said (SAID_AGAIN_END: "You already said
 * that range starts at zero, right?", "You already covered this? I missed
 * it", "You already told me that would happen, and it did!"), "Stop repeating
 * the list, I mean in my code, it prints twice", a complaint taken back
 * ("…Just kidding, it helps"), nor beside words that say they still need it
 * (KNOWS_UNSURE: "…but I forgot", "…go over it again slowly", "…I still don't
 * get the Calvin cycle", "…but please explain it once more"), and never after
 * a reply that only asked (there was no background to know).
 */
export const KNOWS_THAT = new RegExp(
  [
    String.raw`${KNOW_START}i (?:already |do )?know (?:that|this|all (?:that|this)|the (?:basics|theory|concept|background|definition|idea)|(?:that|this) (?:part|bit|one)|what (?:a |an |the )?[\w-]+(?: [\w-]+)? (?:is|are|does|means)|how (?:a |an |the )?(?:it|this|that|they|[\w-]+(?: [\w-]+)?) works?|about (?:it|this|that|[\w-]+(?: [\w-]+)?))(?:\s+already)?${KNOW_END}`,
    String.raw`${KNOW_START}i(?:${AP}m| am) (?:already |well |fully )?aware${KNOW_END}`,
    String.raw`${KNOW_START}i (?:already )?(?:understand|get) (?:that|this)(?: (?:part|bit|one))?(?:\s+already)?${KNOW_END}`,
    String.raw`${KNOW_START}i(?:${AP}m| am) (?:already |quite |very |pretty |really )?familiar with\b`,
    String.raw`${KNOW_START}i(?:${AP}m| am) not new to (?:this|it|that|[\w-]+)${KNOW_END}`,
    String.raw`\bi(?:${AP}m| am) not a beginner\b`,
    String.raw`${KNOW_START}i(?:${AP}ve| have) (?:already )?(?:done|learned|learnt|studied|covered) (?:this|that|it|these|those) (?:before|already|a lot|many times|plenty of times)${KNOW_END}`,
    String.raw`\bwe (?:already |just )?(?:covered|went over|did|discussed|talked about|learned|learnt) (?:that|this|it)(?:\s+(?:already|before|earlier|yesterday|in class|at school|in (?:the )?(?:lecture|lesson|course)|last (?:week|time|lesson|class)))?${KNOW_END}`,
    String.raw`\b(?:skip|spare me|no need for|drop) the (?:basics|background|intro(?:duction)?|history|definitions?|theory|explanation|preamble|lecture)\b`,
    String.raw`\b(?:no need to|you (?:don${AP}?t|do not) (?:need|have) to) explain\b`,
    String.raw`\bi (?:don${AP}?t|do not) need (?:the|a|an|any) (?:background|basics|intro(?:duction)?|explanation|history|theory|definitions?|primer|refresher)\b`,
    // their word that the reply said it again
    String.raw`\byou(?:${AP}ve| have)? already (?:said|explained|told me|covered|mentioned|went over) (?:that|this|it)${SAID_AGAIN_END}`,
    String.raw`\byou(?:${AP}ve| have)? (?:said|explained|told me|covered|mentioned) (?:that|this|it) (?:already|before|twice)${SAID_AGAIN_END}`,
    String.raw`\byou(?:${AP}re| are) repeating yourself\b`,
    String.raw`\byou keep (?:repeating|saying) (?:yourself|the same(?: thing)?|that|it)${SAID_AGAIN_END}`,
    String.raw`\bstop repeating(?: yourself| the same(?: thing)?| that| it)?(?=\s*(?:[.,;:!?)]|$|\b(?:please|already|man|dude|lol|and|but|so|just)\b))`,
  ].join('|'),
  'i'
);
/** Beside "I know that", the words that say they still need it: "…but I forgot", "…go over it again slowly", "…I still don't get the Calvin cycle", "…but please explain it once more". */
const KNOWS_UNSURE = new RegExp(
  String.raw`\b(?:(?:don${AP}?t|do not|didn${AP}?t|did not|can${AP}?t|cannot) (?:really |quite |fully )?(?:get|understand|follow|remember|recall)|still (?:don${AP}?t|do not|not) (?:get|understand|sure|clear)|confus(?:ed|ing)|i${AP}?m lost|forg[eo]t(?:ten)?|again|go over|slow(?:ly|er)|refresh(?:er)?|remind me|recap|once more|one more time|but (?:please |can you |could you |would you )?(?:explain|go through|walk me through|run (?:me )?through|cover) (?:it|that|this))\b`,
  'i'
);

/**
 * They had already said it, after a reply that asked: "I already told you,
 * Windows 11", "I told you", "I told you already", "I said that already",
 * "I literally just said that", "like I said, it's for my team", "you already
 * asked me that", "You've already asked me that", "You keep asking me the
 * same thing", "I already answered that question", "I've already answered
 * that", "See above", "Read my first message" — and the answer itself after
 * "I said" in a short message (ALREADY_SAID_IT: "I said Windows 11"). Not "I
 * already tried restarting it", "I already know Python", "as I said in my
 * essay…", "I already told you this in the session yesterday", "I don't know,
 * I already said I don't know" (the clause goes on: a learner's, not a
 * complaint about the question), a bare "I said, …" (a story: "I said, look,
 * I need time"), or the plain answer to Socria's own "Have you mentioned it
 * to HR?" (observeTurn: ASKED_IF_DONE).
 */
export const ALREADY_SAID = new RegExp(
  [
    String.raw`\bi (?:(?:already|just|literally|clearly|even)\s+)+(?:told you|said|mentioned|answered|gave you)(?: (?:that|this|it|that question|this question|your question))?(?:\s+(?:already|before|earlier|above|twice))?${CLAUSE_END}`,
    String.raw`\bi told you(?:\s+(?:already|before|earlier|twice))?${CLAUSE_END}`,
    String.raw`\bi (?:said|mentioned|answered) (?:that|this|it|that question|this question|your question)(?:\s+(?:already|before|earlier|twice))?${CLAUSE_END}`,
    String.raw`\bi said (?:already|before|earlier|twice)${CLAUSE_END}`,
    String.raw`\b(?:like|as) i (?:already |just )?(?:said|told you|mentioned)(?=\s*(?:[,.!:;—–-]|$|\b(?:before|earlier|above)\b))`,
    String.raw`\byou(?:${AP}ve| have)? (?:already |just )?asked (?:me )?(?:that|this|the same(?: thing| question)?)(?: (?:already|before|twice))?${CLAUSE_END}`,
    String.raw`\byou keep asking (?:me )?(?:that|this|the same(?: thing| question)?)\b`,
    String.raw`\bi${AP}?(?:ve| have) already (?:said|told you|answered) (?:that|this)${CLAUSE_END}`,
    String.raw`\b(?:read|see) (?:my|what i wrote) (?:above|earlier|last message)\b`,
    String.raw`\b(?:see|read|check|look) (?:above|up there|my (?:first|last|previous|earlier|original) (?:message|reply|answer|post))\b`,
  ].join('|'),
  'i'
);
/** The answer itself after "I said" / "I told you", as the whole message: "I said Windows 11", "I already told you Windows 11". Not "I said no", "I told you about my sister". */
export const ALREADY_SAID_IT = new RegExp(
  String.raw`^\W*(?:(?:ugh+|no|but|well|ok(?:ay)?|dude|again|sorry|um+|hmm+)[\s,.!]+)*i (?:(?:already|just|literally|clearly)\s+)*(?:said|told you)\s+(?!(?:i|that i|it|you|he|she|they|we|to|so|yes|no|nope|ok|okay|nothing|something|this|that|about|if|when|because|what|how|why|which|who|where|the same)\b)[\w.+#-]+(?:\s+[\w.+#-]+){0,2}\s*[.!]*$`,
  'i'
);
/** Socria's own question asked whether they had done that very thing ("Have you mentioned it to HR?", "Did you tell your partner…?"): "I already mentioned it" answers it. */
const ASKED_IF_DONE = /\b(?:have|has|had|did) you (?:already |ever |yet |actually |even )?(?:mention|answer|tell|told|say|said|ask|asked|repl(?:y|ied)|respond(?:ed)?|raise|raised|bring|brought|talk|talked|spoke|speak)\w*/i;
/** Their words that they had already said it: ALREADY_SAID addressed, or the answer itself after "I said" (ALREADY_SAID_IT). */
function saidAlready(sp: string): boolean {
  return !!sp && (addressed(ALREADY_SAID, sp, { hedged: true, noDefer: true }) || ALREADY_SAID_IT.test(sp));
}

const REASK_LEAD = String.raw`^\W*(?:(?:ok(?:ay)?|right|sure|hmm+|um+|yes|yeah|thanks|cool|i see|got it)[\s,.!]+)*(?:(?:but|so|and)\s+)*`;
/**
 * Their first sentence asks again for the point: "ok but so what should I
 * do?", "So what's the bottom line?", "which one?", "So which one is it?",
 * "So which one should I pick?", "Which one then?", "So which is better?", "What's the short
 * answer?", "Bottom line?", "So is it yes or no?", "So should I learn Python
 * or not?", "What would you recommend?", "So what's the verdict?", "And the
 * answer is?", "You didn't answer my question.", "You still didn't answer my
 * question", "That didn't answer my question", "Can you just answer the
 * question?". Read only after a long reply (observeTurn): the evidence is
 * their re-ask and the reply's length, never where the answer sat in it. Not
 * "how do I fix my bike chain?" (a new request), "About 50k. What should I do
 * first?" (an answer first), "that doesn't answer it, I need one for video
 * editing", "Which one is best for video editing?", "Which one is it, the
 * red or the blue?" or "What would you recommend for a beginner?" (more said,
 * a new request). "How do I do it?"
 * is REASKS_HOW's.
 */
export const REASKS = new RegExp(
  REASK_LEAD +
    String.raw`(?:what${AP}?s (?:the|your) (?:bottom line|short version|short answer|takeaway|actual answer|verdict|recommendation|final answer)` +
    String.raw`|(?:the )?(?:bottom line|short answer|short version|verdict|tl;?dr)\s*\?` +
    String.raw`|what should i (?:actually )?do(?: then| now| next)?(?=\s*[?.!]|$)` +
    String.raw`|what do i (?:actually )?(?:do|need to do)(?: then| now| next)?(?=\s*[?.!]|$)` +
    String.raw`|what (?:would|do) you (?:recommend|suggest)(?: then)?(?=\s*[?.!]|$)` +
    String.raw`|(?:in )?short\s*\?` +
    String.raw`|(?:is it )?yes or no\s*\?` +
    String.raw`|should i (?:[\w-]+ ){1,5}or not\s*\?` +
    String.raw`|(?:the )?answer is\s*\?` +
    String.raw`|which(?: one(?: is it)?| is (?:it|better))?(?:\s+(?:should|do|would) (?:i|you) (?:pick|choose|start with|go with|recommend|use|learn|get|buy))?(?:\s+then)?\s*\?` +
    String.raw`|you (?:still |really |even |just )?(?:didn${AP}?t|did not|haven${AP}?t|have not) (?:actually |really )?answer(?:ed)? (?:my|the) question` +
    String.raw`|that (?:still )?(?:doesn${AP}?t|does not|didn${AP}?t|did not) (?:actually |really )?answer (?:my|the) question` +
    String.raw`|(?:can|could|would|will) you (?:please )?(?:just )?answer (?:my|the) question)`,
  'i'
);
/**
 * "How do I do it?", "ok how do I fix it?", "Sure, how do I start it?": a
 * re-ask only when the message the long reply answered asked how, or what to
 * do (HOW_ASKED). After a what-is or a why ("What is a Roth IRA?", "Why does
 * my car click?") it is the next request, and the steps it needs are not a
 * point that was lost.
 */
export const REASKS_HOW = new RegExp(REASK_LEAD + String.raw`how do i (?:actually )?(?:do|fix|start|use|solve) (?:it|this|that)(?=\s*[?.!]|$)`, 'i');
const HOW_ASKED = new RegExp(String.raw`\bhow (?:do|can|could|should|would) (?:i|we|you|one)\b|\bhow to\b|\bwhat (?:should|do|can|could) (?:i|we) do\b|\bwhat${AP}?s the (?:best )?way to\b|\b(?:the )?steps? to\b`, 'i');

/**
 * The same material asked for again in another form: bullet points, a list,
 * a table, simpler, shorter, bold, reworded, compared ("Can you put that in
 * bullet points?", "explain it more simply", "make that shorter", "bold the
 * key terms", "compare them in a table", "Could you put it in a table?",
 * "make me a quick checklist", "list them"). The reply to it says the same
 * sentences on purpose (repeated_background stands down). A list, a table,
 * a chart or an outline counts only as the form asked for (in, into or as
 * one; make or give one; list or tabulate them), never as a thing named:
 * "What about my orders table?", "How do I sort a list in Python?", "What
 * format should the dates be in?" are new questions, and background said
 * again in answer to them is read (integration review).
 */
const REFORMAT_ASKED = new RegExp(
  String.raw`\b(?:bullet(?:ed)?(?: points?| list)?|bullets` +
    String.raw`|(?:as|in|into|to) (?:an? )?(?!(?:my|your|our|their|his|her|its|the|this|that) )(?:[\w-]+ )?(?:list|table|chart|checklist|outline|grid)s?` +
    String.raw`|(?:make|give|draw|create|put together) (?:me |us )?(?:an? )?(?:[\w-]+ )?(?:list|table|chart|checklist|outline)s?` +
    String.raw`|(?:list|tabulate|outline) (?:them|these|those|it|that|this|the (?:main |key )?(?:points|steps|ideas|differences|options))` +
    String.raw`|tabulate|simpl(?:er|ify|ified|y)|plain(?:er)? (?:english|words|language)|shorter|shorten|condense|bold|highlight` +
    String.raw`|reformat|format (?:it|that|this|them|these|those)|rephrase|reword|rewrite|restate` +
    String.raw`|compare (?:it|that|this|them|these|those|the two)|comparison (?:table|chart)|side by side|eli5|like i['’]?m (?:five|5|a child|a kid))\b`,
  'i'
);

/** A recap or a repeat asked for: the message a reply answered asked to hear it again, so repeating is what was wanted. */
export const ASKED_AGAIN = /\b(?:repeat|again|summari[sz]e|recap|remind me|go over (?:it|that|this)|one more time|say that)\b/i;

/** What can stand before a failure report in its clause: "nope", "sadly", "tried it", "I did that", "even after a restart". */
const FAIL_LEAD = String.raw`^\W*(?:(?:no|nope|nah|hmm+|ugh+|argh+|sadly|unfortunately|alas|ok(?:ay)?|well|so|but|and|yeah|yes|yep|sorry|still|also|though|tried (?:it|that|this|both|everything|again)|did (?:that|it)|done that|i (?:tried|did)(?: (?:it|that|this|both|everything|all (?:of )?that|those|them))?(?: again)?|even (?:after|with) (?:that|this|it|a restart|restarting))[\s,.!:;—–-]+)*`;
/** Whose failure: the thing being fixed ("it", "this", "the error"), or nobody named — never "the old branch", "the linter", "my phone". */
const FAIL_SUBJECT = String.raw`(?:(?:it|this|that|this one|everything|the (?:problem|error|issue|bug|crash|message|warning|same (?:thing|error|problem|issue)))(?:${AP}?s|\s+is|\s+was)?\s+)?`;
const FAIL_BASE = String.raw`(?:work|load|run|start|compile|build|connect|open|boot|turn on|launch|install|sync|print|respond|go through)`;
const FAIL_ING = String.raw`(?:working|loading|running|starting|compiling|building|connecting|opening|booting|turning on|launching|installing|syncing|printing|responding|going through|helping)`;
/** …and not asked or going on: "Still there?" asks after them, "Still nothing from the landlord" is news of something else. */
const FAIL_END_NOT_ASKED = String.raw`(?=\s*(?:[.,;:!)]|$|\b(?:either|at all|again|unfortunately|sadly|for me|though|but|and|tbh|lol|sorry)\b))`;
/** What still happens: "still not loading", "still drops", "still won't boot", "still the same", "still no luck", "still getting a 404". */
const FAIL_STILL = String.raw`(?:not ${FAIL_ING}|not (?:fixed|resolved|solved|sorted)|(?:does|did|do)(?:n${AP}?t| not) (?:${FAIL_BASE}|help|fix (?:it|anything|the (?:problem|issue|error))|change anything|do anything|solve (?:it|anything|the (?:problem|issue)))|(?:is|are|was|were)(?:n${AP}?t| not) ${FAIL_ING}|(?:wo(?:n${AP}?t|uld not)|will not|ca(?:n${AP}?t|nnot)) ${FAIL_BASE}|fail(?:s|ing|ed)?|crash(?:es|ing|ed)?|freez(?:es|ing)|froze|hang(?:s|ing)|drop(?:s|ping|ped)?(?: out)?|disconnect(?:s|ing|ed)?|happen(?:s|ing)|broken|slow|(?:there|nothing)${FAIL_END_NOT_ASKED}|the same(?: (?:error|problem|issue|result|thing|message))?|no (?:luck|change|difference|good|internet|connection|signal|sound|picture|display|wifi)|erroring(?: out)?|errors?(?: out)?|(?:giving|throwing|showing) (?:me )?(?:the |an |that )?(?:same )?(?:error|exception|message)|getting (?:a |an |the |that )?(?:same )?(?:\d{3}|error|exception|message|warning|crash|timeout|blue screen)|having (?:the|this|that) (?:same )?(?:issue|problem|error))`;
/** The end of a short failure report: "Didn't work.", "didn't help either", "Same error again". */
const FAIL_END = String.raw`(?=\s*(?:[.,;:!?)]|$|\b(?:either|at all|still|again|unfortunately|sadly|for me|though|but|and|tbh|lol|sorry|anymore|any more|this time)\b))`;
/**
 * A suggested fix still fails, said at the start of a clause in their first
 * two sentences: "It's still not working", "still isn't working", "Still
 * drops.", "still no luck", "It still won't turn on", "Still having the
 * issue", "The problem is still there", "Didn't work.", "Nope, didn't work",
 * "Tried it, didn't work", "That didn't solve it", "Didn't change anything",
 * "Same error", "Still the same", "No change", "It made no difference",
 * "Nothing changed", "It keeps happening", "It crashed again". Not a failure
 * turned round ("no errors", "zero errors", "does not crash anymore",
 * "nothing is broken", "Still no errors"), not somebody else's ("the old
 * branch still fails", "the linter still errors", "my phone still crashes
 * the app"), not "I still don't get it" (confusion, not a failed fix),
 * "Every time I run the script it crashes" (no "still"), or "that still
 * doesn't make sense to me", not a question or news of something else
 * ("Still there?", "Still nothing from the landlord about the deposit", "It
 * keeps happening to my friends too, is it common?", "The same thing, but for
 * a desktop: does that work?": FAIL_END_NOT_ASKED, FAIL_VARIANT_ASKED) — and
 * nothing at all when either of their first two sentences says it worked
 * (FIX_WORKED). Known miss: a named subject ("the wifi still drops").
 */
export const STILL_FAILS = new RegExp(
  [
    String.raw`${FAIL_LEAD}${FAIL_SUBJECT}still\s+(?:(?:so|really|very|super|pretty|kind of|kinda|way too|too)\s+)?${FAIL_STILL}\b`,
    String.raw`${FAIL_LEAD}(?:(?:it${AP}?s|it is|still)\s+)?not ${FAIL_ING}${FAIL_END}`,
    String.raw`${FAIL_LEAD}(?:(?:that|it|this|which|nothing)\s+)?(?:still\s+)?(?:did|does)(?:n${AP}?t| not)\s+(?:work|help|fix (?:it|anything|the (?:problem|issue|error))|solve (?:it|anything|the (?:problem|issue))|do (?:it|anything|the trick)|change anything|make (?:a|any) difference)${FAIL_END}`,
    String.raw`${FAIL_LEAD}(?:(?:it${AP}?s|it is|i${AP}?m getting|i get|getting|it${AP}?s (?:doing|giving|showing)(?: me)?|it is (?:doing|giving|showing)(?: me)?)\s+)?(?:the\s+)?same (?:error|thing|problem|issue|result|message|crash|behaviou?r)(?:\s+(?:again|as before|here))?${FAIL_END}`,
    String.raw`${FAIL_LEAD}(?:(?:there${AP}?s|there is)\s+)?no (?:change|difference|luck|improvement)${FAIL_END}`,
    String.raw`${FAIL_LEAD}(?:(?:it|that|this)\s+)?(?:made|makes) no difference${FAIL_END}`,
    String.raw`${FAIL_LEAD}nothing (?:changed|happened|worked|helped|has changed)${FAIL_END}`,
    String.raw`${FAIL_LEAD}(?:it|this|that|the (?:problem|error|issue|crash|bug))\s+(?:still\s+)?keeps (?:happening|crashing|failing|dropping(?: out)?|disconnecting|freezing|coming back|showing up)${FAIL_END}`,
    String.raw`${FAIL_LEAD}(?:(?:it|this|that)\s+)?(?:fail(?:ed|s)|crash(?:ed|es)|dropped|froze|disconnected|broke|happened|errored(?: out)?) again\b`,
  ].join('|'),
  'i'
);
/** The same thing asked of something else, in a question: "The same thing, but for a desktop: does that work?", "Same for my other PC?". */
const FAIL_VARIANT_ASKED = /\bsame(?: (?:thing|one|question|steps?))?[\s,]*(?:but\s+)?(?:for|on|with|in) (?:a|an|my|the|other|another|this|that|your)\b[^?]*\?/i;
/** It worked, in one of their first two sentences: "it works now", "that fixed it", "no errors", "does not crash anymore", "all good". Not "none of it worked". */
const FIX_WORKED = new RegExp(
  String.raw`\b(?:(?<!\bof )(?:it|that|this)(?: works| worked| is working|${AP}?s working| did it| did the trick| fixed it| solved it)|works now|working now|works (?:fine|perfectly|great)|worked (?:now|perfectly|fine|great|like a charm)|fixed it|solved it|(?:it${AP}?s|it is|that${AP}?s|all) (?:fixed|sorted|solved|resolved)|all good|did the trick|got it (?:working|running|to work)|no (?:more )?errors?|zero errors|not (?:crashing|failing|freezing|dropping|disconnecting) (?:anymore|any more)|(?:does(?:n${AP}?t| not)|won${AP}?t|didn${AP}?t|did not) (?:crash|fail|freeze|drop|disconnect|error)(?: out)? (?:anymore|any more|this time)|nothing (?:is |was |${AP}s )?broken|(?:all )?(?:the )?tests? pass(?:es|ed)?|problem solved)\b`,
  'i'
);
/** Where a sentence breaks into the clauses a failure report can open. */
const FAIL_CLAUSE = /[,;:]\s*|\s+[—–]\s*|\s+-\s+|\s+(?=\b(?:but|and|though)\b)/i;
/**
 * The first `n` sentences of a text, read from its opening: when the first
 * 2,000 characters hold more than `n` sentences, those are the text's own
 * first `n` (the boundary after the last of them lies inside the slice);
 * otherwise the whole text is split. The same sentences, without splitting
 * a long paste to read its first two.
 */
function firstSentences(text: string, n: number): string[] {
  if (text.length > 2000) {
    const head = sentencesOf(text.slice(0, 2000));
    if (head.length > n) return head.slice(0, n);
  }
  return sentencesOf(text).slice(0, n);
}

/** Their first two sentences report that the fix still fails (STILL_FAILS), and neither says it worked (FIX_WORKED). */
export function stillFails(sp: string): boolean {
  const first = firstSentences(sp, 2);
  if (first.some((s) => FIX_WORKED.test(s))) return false;
  return first.some((s) => !FAIL_VARIANT_ASKED.test(s) && s.split(FAIL_CLAUSE).slice(0, 12).some((c) => STILL_FAILS.test((c ?? '').trim())));
}

// ── an open request ──────────────────────────────────────────────────
//
// OPEN REQUEST IS AN ESTIMATE TURNED OBSERVATION, as routine_task is: a
// structural reading of their first message (or the first of a new topic),
// not a count and not their words. Its refs name exactly what was read, its
// confidence is 0.6, the rule that reads it records the goal reading as
// uncertain, and it holds one turn. Everything it leads to narrows.

const BROAD = String.raw`(?:generative\s+)?(?:ai|a\.i\.|artificial intelligence|machine learning|llms?|large language models?|chat ?bots?|technology|tech|the internet|social media|software|computers?|robots?|automation|science|scientists|medicine|healthcare|health care|education|schools|universities|the economy|economics|capitalism|politics|politicians|governments?|society|humanity|people|humans|companies|businesses|corporations|startups|the industry|innovation|research|researchers|experts|management|leadership|the media|engineers|developers|blockchain|crypto(?:currency)?)`;
/** A noun the broad subject can stand before: "AI tools", "AI models", "tech companies", "software products". */
const OR_HEAD = String.raw`(?:\s+(?:tools?|models?|systems?|apps?|applications?|products?|companies|firms|platforms?|startups?|chat ?bots?|assistants?|programs?|projects?))?`;
const OR_SUBJECT = String.raw`(?:the\s+)?${BROAD}${OR_HEAD}`;
/**
 * The broad subjects that can stand with no object ("Why isn't AI working?",
 * "Why aren't schools improving?"): the things and institutions of BROAD,
 * never people ("Why don't people help?" has its own answer), and never a
 * thing that is as often their own ("Why isn't the internet working?", "Why
 * doesn't the medicine work?" are their router and their prescription).
 */
const OR_SUBJECT_THING = String.raw`(?:generative\s+)?(?:ai|a\.i\.|artificial intelligence|machine learning|llms?|large language models?|chat ?bots?|technology|tech|social media|automation|science|healthcare|health care|education|schools|universities|the economy|economics|capitalism|politics|governments?|the government|society|companies|businesses|corporations|startups|the industry|innovation|research|management|leadership|the media|blockchain|crypto(?:currency)?)${OR_HEAD}`;
const OR_AUX_NEG = String.raw`(?:isn${AP}?t|aren${AP}?t|doesn${AP}?t|don${AP}?t|didn${AP}?t|can${AP}?t|cannot|won${AP}?t|hasn${AP}?t|haven${AP}?t|is not|are not|does not|do not|did not|has not|have not)`;
const OR_NEG = String.raw`(?:not|never|no longer|isn${AP}?t|aren${AP}?t|doesn${AP}?t|don${AP}?t|didn${AP}?t|can${AP}?t|cannot|won${AP}?t|hasn${AP}?t|haven${AP}?t|failing to|fails to|failed to|unable to)`;
const OR_ADV = String.raw`(?:(?:really|actually|yet|even|ever|properly|still|seem to|seem able to|able to|be able to|managing to)\s+)*`;
/** The verbs of delivering, the perfect's participles too: "Why hasn't AI solved any problems?", "Why haven't governments done anything?". */
const OR_VERB = String.raw`(?:solv(?:e|es|ed|ing)|fix(?:es|ed|ing)?|help(?:s|ed|ing)?(?:\s+(?:with|us|people|anyone))?|chang(?:e|es|ed|ing)|improv(?:e|es|ed|ing)|deliver(?:s|ed|ing)?(?:\s+on)?|do(?:es|ing|ne)?|tackl(?:e|es|ed|ing)|address(?:es|ed|ing)?|work(?:s|ed|ing)?\s+on)`;
/** No "everything": "Why can't computers do everything?" asks about limits, which have a plain answer. */
const OR_OBJ = String.raw`\s+(?:(?:any|real|actual|big|bigger|hard|complex|important|major|practical|pressing|the|many|much|more|most|our|everyday|meaningful|serious|real[- ]world|world${AP}?s)\s+){0,2}(?:problems|things|anything|stuff|issues|the world|much)(?:\s+(?:useful|meaningful|real|important|of value))?`;
/** Delivering with no object: "Why isn't AI working?", "Why doesn't AI work?", "Why is AI not helping?", "Why hasn't AI helped anyone?", "Why isn't AI useful?". */
const OR_INTRANS = String.raw`(?:work(?:s|ed|ing)?|help(?:s|ed|ing)?(?:\s+(?:anyone|people|us))?|improv(?:e|es|ed|ing)|deliver(?:s|ed|ing)?|(?:(?:more|very|that|so|really|actually)\s+)?useful)`;
/** What may follow the object, and then nothing but closing punctuation: an added clause ("…, no questions", "…, go deep") is not read. */
const OR_TAIL_WORD = String.raw`(?:yet|already|anymore|any more|today|now|either|at all|for (?:us|people|anyone|everyone|real|businesses|companies|most people)|in (?:real life|practice|the real world|general)|at scale|(?:that )?people care about|that matter)`;
const OR_END = String.raw`(?:\s+${OR_TAIL_WORD}){0,2}\s*[?.!]*\s*$`;
const OR_LEADS = String.raw`^\W*(?:(?:so|ok(?:ay)?|hey|hi|hello|quick question|honest question|genuine question|serious question)[\s,:!—–-]+)*`;
/**
 * The whole of a short first question that asks why a broad subject is not
 * delivering, with nothing about their own case in it: "Why is AI not
 * solving problems?", "Why can't AI do anything useful?", "How come
 * technology still can't solve real problems?", "Why are AI tools not
 * solving complex problems in general?", "Why hasn't AI solved any
 * problems?", "Why isn't AI working?", "Why aren't schools improving?". What
 * they would count as solved is unsaid, and it decides the answer. Anchored
 * at the end: after the object only the listed tail words, then closing
 * punctuation, so "Why is AI not solving problems, no questions" and "…, go
 * deep" are not read (their added words are theirs to keep). Not "Why is the
 * sky blue?", "Why don't people vote?", "Why is AI not solving problems in
 * healthcare?" (a field named), "Why can't computers do everything?" (limits,
 * with a plain answer), "Why doesn't the chatbot remember things?", "Is AI
 * overhyped?". The topic list is a documented limit: "Is college worth it?"
 * is not read, which is a safe miss. A personal outcome question ("Why is my
 * team not productive?", "How do I fix my sleep?") stays out by decision: it
 * is their own case, and an answer with its assumptions stated serves it
 * without MR.
 */
export const OPEN_REQUEST = new RegExp(
  OR_LEADS +
    String.raw`(?:why|how come)\s+(?:` +
    String.raw`(?:${OR_AUX_NEG}\s+${OR_SUBJECT}|(?:(?:is|are|do|does|did|has|have)\s+)?${OR_SUBJECT}\s+(?:still\s+)?${OR_NEG})\s+${OR_ADV}${OR_VERB}${OR_OBJ}` +
    String.raw`|(?:${OR_AUX_NEG}\s+${OR_SUBJECT_THING}|(?:(?:is|are|do|does|did|has|have)\s+)?${OR_SUBJECT_THING}\s+(?:still\s+)?${OR_NEG})\s+${OR_ADV}${OR_INTRANS}` +
    String.raw`)${OR_END}`,
  'i'
);
/**
 * Anything that ties a question to their own case — a person, a pointer, a
 * number, a quote, an attachment. One of these and the request is not open.
 * (Known miss: the dotted "A.I." trips it.)
 */
export const ANCHOR = /\b(?:my|mine|our|ours|i|i['’]?m|i['’]?ve|i['’]?d|we|we['’]?re|this|that|these|those|here|above|below|it)\b|\d|["“”`]|\[attached/i;
/**
 * A first message that points at something that is not there: "How do I fix
 * this?", "Help me fix this bug.", "Solve this equation", "Can you explain
 * this?", "Why does this happen?", "Why isn't this working?", "Why is it not
 * working?", "Can you help me with this?", "Can you look at / review /
 * summarise / proofread this?", "Can you check this?", "Translate this",
 * "What do you think of this?", "Thoughts on this?", "Can you check my
 * work?". Read only when the route says nothing is on their screen either
 * (ObserveContext.material === false). Not "Write a unit test for this function please", "Can you explain
 * this proof that root 2 is irrational?" (the thing is named in it), "What
 * does this mean?" (a fact question), "Let's do this!" or "You can do it!"
 * (CAN_DO_IT), or the thing handed over after it (HANDED_OVER: "Solve this
 * equation: x squared equals four"). Known miss: the thing said before the
 * pointer ("Photosynthesis converts light into energy. Can you explain
 * this?") is still read as missing.
 */
export const MISSING_REFERENT = new RegExp(
  [
    String.raw`\b(?:fix|solve|debug|explain|answer|understand|approach|start|finish|check|do|look at|review|summari[sz]e|translate|proofread|rewrite|check over|go over)\s+(?:this|it|that|these|them)(?=\s*(?:[?.!,]|$|\b(?:for me|please|properly|correctly|step by step)\b))`,
    String.raw`\b(?:fix|solve|debug|explain|answer|understand|approach|start|finish|check|with|on)\s+(?:this|that)\s+(?:problem|question|exercise|proof|bug|error|issue|task|assignment|equation|function|code|snippet|one)\b(?!\s+(?:of|about|in|on|with|where|that|which|from|for|is|was)\b)`,
    String.raw`\bwhat does (?:this|that|it) mean\b`,
    String.raw`\bwhy (?:does|doesn${AP}?t|did|didn${AP}?t|is|isn${AP}?t|won${AP}?t|will|would|wouldn${AP}?t|can${AP}?t) (?:this|it|that)(?: not)? (?:work(?:s|ing)?|happen(?:s|ing)?|fail(?:s|ing)?|break(?:s|ing)?|crash(?:es|ing)?|compil(?:e|es|ing)|run(?:s|ning)?|load(?:s|ing)?|keep (?:crashing|failing|breaking|happening))\b(?!\s+out\b)`,
    // with nothing after it: "Can you help me with this?", "Help me with this", "help me out with it please"
    String.raw`\b(?:help(?: me| us)?(?: out)?|assist(?: me)?)\s+with\s+(?:this|it|that)(?=\s*(?:[?.!,]|$|\b(?:for me|please)\b))`,
    // their work named, and nothing of it there: "Can you check my work?", "Could you look over my answers?"
    String.raw`\b(?:check|review|look (?:at|over)|go over|proofread|mark|grade)\s+(?:my|our) (?:work|answers?|solutions?|working|essay|homework|draft)(?=\s*(?:[?.!,]|$|\b(?:for me|please)\b))`,
    // a view asked of it, as the whole message: "What do you think of this?", "Thoughts on this?"
    String.raw`^\W*(?:(?:so|ok(?:ay)?|hey|hi)[\s,]+)?(?:what do you think (?:of|about)|(?:any |your )?thoughts on|(?:your )?opinions? on|feedback on|what${AP}?s your (?:take|opinion|view) on) (?:this|it|that)\s*[?.!]*\s*$`,
  ].join('|'),
  'i'
);
/** A task ACS reads as a fact asked ("translate", "convert"), put to a pointer: "Translate this", "Convert it please". */
const POINTER_TASK = /^\W*(?:(?:please|pls|can you|could you)\s+)?(?:translate|convert|calculate|compute)\s+(?:this|it|that|these|them)\b/i;
/** Encouragement, not a pointer: "Let's do this!", "I can do it!", "You can do it!", "We can do this", "Let's start this". */
const CAN_DO_IT = new RegExp(String.raw`\b(?:let${AP}?s|let us|i can|you can|we can|i${AP}?ll|we${AP}?ll|you${AP}?ll|we got|you got|ready to|time to)\s+(?:do|start|finish|nail|crack|beat)\s+(?:this|it|that)\b`, 'i');
/** After the pointer, the thing itself: two words or more after a colon, a comma, a dash ("Explain this error — undefined is not a function", "Solve this equation please: x squared…"). */
const HANDED_OVER = /^\s*(?:(?:please|pls|for me)\s*)?[?!.]*\s*(?:[:,;—–]|-\s)\s*\S+\s+\S+/i;
/** …or on the next line ("Can you explain this?\nPhotosynthesis converts light…"), read on their raw text (speech joins the lines). */
const HANDED_OVER_BELOW = /^[^\S\n]*[?!.]*[^\S\n]*\n\s*\S+\s+\S+/;
/**
 * A thing of theirs named before the pointer, which the pointer then refers
 * back to: "My sink is clogged, how do I fix it?", "My knee hurts after
 * running, why does this happen?", "My Excel formula returns #REF!, why is it
 * not working?". The question is clear (or the details it needs are a matter
 * for ACS), so Branch B is silent; "How do I fix this?" with nothing before it
 * still reads. A known narrowing: "My code doesn't work, can you fix this?",
 * with the code not pasted, is read as their named code and gets no line.
 */
const NAMED_BEFORE = /\b(?:my|our|his|her|their|the|a|an)\s+(?!(?:way|best|turn|time|bad|own)\b)[a-z][\w'’-]*/i;
/** MISSING_REFERENT, with nothing handed over after it and no encouragement (Branch B of openRequestOf). */
function pointsAtNothing(sp: string, raw: string): boolean {
  const m = MISSING_REFERENT.exec(sp);
  if (!m || CAN_DO_IT.test(sp) || HANDED_OVER.test(sp.slice(m.index + m[0].length))) return false;
  // a pointer back to what they have just named is no missing referent: "My sink is clogged, how do I fix it?"
  if (NAMED_BEFORE.test(sp.slice(0, m.index))) return false;
  const r = MISSING_REFERENT.exec(raw);
  return !(r && HANDED_OVER_BELOW.test(raw.slice(r.index + r[0].length)));
}

/**
 * The precise codes one message carries, read from its words and the reply
 * before it. Worked out whatever the policy (a measure reads them under any
 * pin), and never merged into Own.codes: only readWords adds them, and only
 * under a policy with params.precision. A stuck here is one that stands on
 * its own words (stuckWordsOf 'said'); one among other words waits for a task
 * in the window (stuckSaid). A correction and "I know that" are read in the
 * first TOPIC_READ_CHARS of the message (a long paste's own sentences are not
 * theirs). The cheap readings first: replyExplained counts the whole reply.
 */
function readPrecise(said: string, prevReply: string | null, stuck: StuckWords | null): Set<PreciseCode> {
  const out = new Set<PreciseCode>();
  if (!said) return out;
  if (stuck === 'said') out.add('explicit.stuck');
  // a correction and "I know that" are read in the opening of what they said (TOPIC_READ_CHARS): in a long paste,
  // the words of somebody else's text are not theirs to Socria, and reading all of it costs every turn
  const sp = said.length > TOPIC_READ_CHARS ? said.slice(0, TOPIC_READ_CHARS) : said;
  const theirs = (re: RegExp) => addressed(re, sp, { hedged: true, noDefer: true });
  // (praise turns only a "this is X, not Y" into a verdict: a contrast that opens it — "Wrong OS, it's a Mac" — is no praise)
  if (prevReply !== null && !CORRECTED_NOT.test(sp) && ((CORRECTED_ANY.test(sp) && theirs(CORRECTED)) || (setupPossible(sp) && theirs(CORRECTED_SETUP) && (SETUP_START.test(sp) || !CORRECTED_PRAISE.test(firstSentences(sp, 1)[0] ?? ''))))) out.add('explicit.corrected');
  // (not taken back: "Can you stop repeating yourself? Just kidding, it helps.")
  if (prevReply !== null && KNOWS_ANY.test(sp) && !KNOWS_UNSURE.test(sp) && !ASKED_AGAIN.test(sp) && !STUCK_RETRACTED.test(sp) && theirs(KNOWS_THAT) && replyExplained(prevReply)) out.add('explicit.knows_that');
  return out;
}

// CHEAP SUPERSETS, tested before the full patterns on what can be a long
// message (a paste is up to IFR_READ_CHARS): each holds a word or phrase that
// every alternative of its pattern needs, so a message without one cannot
// match it, and the reading is the same, only cheaper.
/** Every alternative of STUCK says one of these: "stuck", "where to", "how to", "what to do", "hit a wall", "get past", "figure", "work out", "solve", "approach", "do it". */
const STUCK_ANY = /stuck|where to|how to|what to do|hit a wall|get past|figure|work out|solve|approach|\bdo (?:it|this|that|what|the)\b/i;
/** …of CORRECTED: "mean(t)", "question", "misunderst…", "misread", "ask…", "talking", "not what". */
const CORRECTED_ANY = /mean|question|misunderst|misread|\bask|talking|not what/i;
/** …of KNOWS_THAT: "know", "aware", "understand", "get that", "familiar", "new to", "beginner", "done", "learn…", "covered", "went over", "skip", "explain", "said", "repeating" and the rest. */
const KNOWS_ANY = /know|aware|understand|get (?:that|this)|familiar|new to|beginner|done|learn|studied|covered|went over|\bdid\b|discussed|talked about|skip|spare me|no need|drop the|need (?:the|a|an|any)|explain|said|told me|mentioned|repeating|keep saying/i;

/**
 * How one message says it is stuck, from its words alone. 'said': the stuck
 * words stand on their own (nothing else in the message but fillers and a
 * plea for help, "help" before them too), or a piece of work is named beside
 * them (STUCK_WORK, a number or an operator, code). 'bare': other words are
 * there and none of them is about work ("I'm stuck, where is the adapter?"),
 * so it counts only with a task on the table (stuckSaid, taskInWindow). Null:
 * no stuck, or one the message puts aside — feelings or grief (their
 * tenderness, readSignals' vent, sensitive and safety, STUCK_AFFECT), life
 * logistics (STUCK_LIFE), the people and the life around a bare stuck
 * (STUCK_PEOPLE: "I don't know what to do. I think my friend is angry with
 * me"), a way out found after it (STUCK_RESOLVED), a joke (STUCK_RETRACTED),
 * or the words asked about rather than said (STUCK_QUOTED).
 */
type StuckWords = 'said' | 'bare';
function stuckWordsOf(said: string, t: TurnView, words: number): StuckWords | null {
  if (!said || !STUCK_ANY.test(said)) return null;
  // ("help I'm stuck": the plea is read past, as STUCK_PLEA reads one after the words)
  let sp = said.replace(HELP_LEAD, '');
  let m = addressedAt(STUCK, sp, { hedged: true, noDefer: true });
  // a stuck on a line of its own after pasted lines (unfenced code): speech joins the lines, so read the last ones alone
  if (!m && t.text.includes('\n')) {
    for (const line of t.text.slice(0, IFR_READ_CHARS).split('\n').slice(-3).reverse()) {
      const l = speech(line).replace(HELP_LEAD, '');
      const lm = l && STUCK_ANY.test(l) ? addressedAt(STUCK, l, { hedged: true, noDefer: true }) : null;
      if (lm) {
        sp = l;
        m = lm;
        break;
      }
    }
  }
  if (!m || stuckPutAside(sp, t, m.index + m[0].length)) return null;
  const rest = (sp.slice(0, m.index) + ' ' + sp.slice(m.index + m[0].length)).replace(STUCK_PLEA, ' ');
  const left = rest.toLowerCase().split(/[^\p{L}\p{N}'’]+/u).filter((w) => w && !STUCK_FILLER.has(w.replace(/['’]/g, '')));
  if (words <= 4 || left.length <= 2) return 'said';
  if (STUCK_WORK.test(sp) || ATTEMPT.test(sp) || /```|`[^`\n]+`/.test(t.text.slice(0, IFR_READ_CHARS))) return 'said';
  // among other words about the people and the life around them, it is not the work in the window that is stuck
  return STUCK_PEOPLE.test(sp) ? null : 'bare';
}
/** What puts a stuck aside, in the message (feelings, grief, life, a translation) or after the stuck words (resolved, a joke). */
function stuckPutAside(sp: string, t: TurnView, end: number): boolean {
  const s = t.signals;
  if (s.vent || s.sensitive || s.safety || tenderText(sp) || STUCK_AFFECT.test(sp) || STUCK_LIFE.test(sp) || STUCK_QUOTED.test(sp)) return true;
  const after = sp.slice(end);
  return STUCK_RESOLVED.test(after) || STUCK_RETRACTED.test(after);
}
/** "Still stuck" opening a clause, not put aside (the contextual reading's words; stuckAgainAt adds the context). */
function stillStuckOf(sp: string, t: TurnView): boolean {
  // (every STILL_STUCK says "stuck")
  if (!sp || !/stuck/i.test(sp)) return false;
  const g = new RegExp(STILL_STUCK_ANYWHERE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = g.exec(sp))) {
    if (!stuckPutAside(sp, t, m.index + m[0].length)) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

/** How much of a message newTopicAt reads for what it is about: its opening (a long paste is still about what it opens with). The reply to it is read to IFR_READ_CHARS. */
const TOPIC_READ_CHARS = 1500;
/** Any broad subject, as one word: to newTopicAt "AI", "technology" and "companies" are one topic (BROAD). */
const BROAD_ANY = new RegExp(String.raw`\b${BROAD}\b`, 'gi');
/** Words that say what is asked of the reply, not what it is about ("mean", "example", "safe", "long", "first"). */
const TOPIC_GENERIC = new Set(
  'what how why which when where who whose tell explain give show help please now answer question questions first try let mean means meaning meant example examples detail details detailed more most less again sense idea ideas thought thoughts advice tip tips suggestion suggestions opinion thing things stuff way ways kind sort type bit lot lots anything something everything nothing someone anyone everyone use used using work works working make made making take takes taking get gets getting got put need needs want wants like know think see look say said mention mentioned add include send ask call handle deal happen happens happened happening real really actually still even also just much many very good better best bad okay fine sure safe long short simple simpler simply easy hard whole entire full different same other another new next last thanks thank great cool nice yes yeah sorry quick quickly instead else then there here today tomorrow'.split(' ')
);
/** TOPIC_GENERIC stemmed, so "makes" and "happening" are generic too (filled in after stemOf). */
const GENERIC_STEMS = new Set<string>();
/** A word without its ending, so "wavelength" meets "wavelengths" and "solving" meets "solve". */
function stemOf(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && /(?:ss|sh|ch|x|z)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !/(?:ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(s) && !/(?:ll|ss|zz|ff)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}
for (const w of TOPIC_GENERIC) GENERIC_STEMS.add(stemOf(w));
/**
 * What a message is about, for newTopicAt: its content words of three letters
 * or more, stemmed, less the words every follow-up shares (TOPIC_GENERIC),
 * with every broad subject one word ("AI" is kept although it has two
 * letters).
 */
function topicStemsOf(x: string): Set<string> {
  const out = new Set<string>();
  for (const w of tokensOf(x.replace(BROAD_ANY, ' broadsubject '))) {
    if (!/[a-z]{3,}/.test(w) || TOPIC_GENERIC.has(w)) continue;
    const s = stemOf(w);
    if (!GENERIC_STEMS.has(s)) out.add(s);
  }
  return out;
}
/** A follow-up that points back at the reply: "Can you give an example?", "Is that safe to do?", "What if I have no admin rights?", "How long does it take?". */
const REFERS_BACK = new RegExp(String.raw`\b(?:it|its|it${AP}s|that|this|those|these|them|there|then|too|the same|more|another|example|again|else|instead|also|what if|how long|is it safe)\b`, 'i');
/** …or carries the thread on by how it opens: "and on my other PC?", "what else can I try?", "what about the fan noise?", "is it the same on a Mac?", "can you redo it…". */
const SAME_THREAD = /^\W*(?:(?:ok(?:ay)?|so|well|hmm+|right|thanks|thank you|great|cool|oh|ah)[\s,.!]+)*(?:and|what else|what about|how about|is (?:it|that|this) the same|(?:can|could|would) you redo|redo|same (?:for|with|on|goes))\b/i;
/** A new topic said in so many words, opening the message: "Unrelated, but…", "Totally separate thing -", "Different question:", "On another note,". */
const NEW_TOPIC_SAID = /^\W*(?:(?:ok(?:ay)?|so|thanks|thank you|great|cool|right|also|oh|and)[\s,.!]+)*(?:unrelated|(?:a |on a )?(?:totally |completely |slightly |quick )?(?:different|separate|new|unrelated|other) (?:question|thing|topic|subject|note)|off[- ]topic|on (?:a|an)(?: \w+)? (?:different|other|unrelated|separate) note|on another note|changing the subject|change of (?:subject|topic)|random question)\b/i;
/** The sentences of a message that ask (or the whole message when none does): "Thanks, that helps. Unrelated: how do I…?" asks only in the second. */
function askingPart(sp: string): string {
  const asks = sentencesOf(sp).filter((s) => /\?/.test(s));
  return asks.length ? asks.join(' ') : sp;
}

// One reading per TurnView, as OWN: new_topic, openRequestOf, the stuck window and the measure all ask it of the
// same turn. Kept with the message before it, so a view read inside another conversation is read again.
const NEW_TOPIC = new WeakMap<TurnView, { prev: TurnView; at: boolean }>();

/**
 * Their message at turns[k] asks about something else: movedOn from their
 * previous message, it neither points back at the reply (REFERS_BACK: "Can
 * you give an example?", "Is that safe to do?", "Does that work on a Mac
 * too?", "What if I have no admin rights?") nor carries the thread on by how
 * it opens (SAME_THREAD: "and on my other PC?", "what else can I try?"), and
 * at least two of its topic words (topicStemsOf, stemmed, a broad subject one
 * word) and none of the others are in neither their previous message nor the
 * whole reply to it (nor inside a word of them, five letters or more: "error"
 * in "TypeError"): one shared topic word keeps it on the thread ("Could my
 * microwave be causing the interference?", "Would a mesh system fix the
 * drops?" after a reply about wifi interference and drops; "Can malware slow
 * down Task Manager?" after one about Task Manager) — unless the message
 * says it is another topic ("Unrelated, but…", "Totally separate thing -":
 * NEW_TOPIC_SAID). So
 * "What does wavelength mean?" after a reply about wavelengths, "Thanks! What
 * should I bake first?" after one about a starter, and "Why can't AI do
 * anything useful?" after their own AI chatbot are not new topics; an answer
 * that reuses the reply's words ("In my own work, support tickets") is not,
 * and nor is a stuck (the work in hand), a hint asked for, a short attempt,
 * or the first turn. "how do I convert 5 miles to km", a reply, then "Why is
 * AI not solving problems?" is. The message is read at its opening
 * (TOPIC_READ_CHARS), the reply to IFR_READ_CHARS. Read once per turn and
 * shared (new_topic, openRequestOf, the stuck window, the measure
 * react.newTopic).
 */
export function newTopicAt(turns: readonly TurnView[], k: number): boolean {
  if (k <= 0 || !turns[k]) return false;
  const hit = NEW_TOPIC.get(turns[k]);
  if (hit && hit.prev === turns[k - 1]) return hit.at;
  const at = readNewTopic(turns, k);
  NEW_TOPIC.set(turns[k], { prev: turns[k - 1], at });
  return at;
}
function readNewTopic(turns: readonly TurnView[], k: number): boolean {
  const me = own(turns[k]);
  const before = own(turns[k - 1]);
  // "I'm stuck, any thoughts on how to move on?" is about the work in hand, whatever its words
  if (me.stuck !== null || me.stillStuck) return false;
  const sp = me.sp;
  // said so: "Unrelated, but what is a good laptop for video editing?" shares "laptop" with the wifi thread and is still new
  if (NEW_TOPIC_SAID.test(sp)) return !REFERS_BACK.test(askingPart(sp.slice(0, TOPIC_READ_CHARS)).replace(NEW_TOPIC_SAID, ''));
  if (!movedOnSaid(before.sp, me.sp, null, before.topic, me.topic, me.words)) return false;
  const asking = askingPart(sp.slice(0, TOPIC_READ_CHARS));
  if (SAME_THREAD.test(sp) || SAME_THREAD.test(asking) || REFERS_BACK.test(asking)) return false;
  const known = [before.replyStems, before.stems];
  // a word of five letters or more inside a known one, or the other way round, is known: "error" in "TypeError"
  const inside = (w: string) => w.length >= 5 && known.some((ks) => [...ks].some((x) => x.length >= 5 && (x.includes(w) || w.includes(x))));
  // two words of its own and none of the thread's: one shared word ("Could my microwave be causing the
  // interference?" after a reply about interference) keeps it on the thread
  let novel = 0;
  for (const w of me.stems) {
    if (known.some((ks) => ks.has(w)) || inside(w)) return false;
    novel++;
  }
  return novel >= 2;
}

/**
 * Branch A after the first turn: everything they said before is short chit-chat
 * ("hi", "hello there", "stop asking me questions"): 5 words or fewer, with
 * nothing of their own case in it (ANCHOR). Once they have told Socria
 * anything, a later "Why can't AI do anything useful?" may be about it.
 */
function onlyChitChatBefore(turns: readonly TurnView[], k: number): boolean {
  for (let j = 0; j < k; j++) {
    const o = own(turns[j]);
    if (o.words > 5 || ANCHOR.test(o.sp)) return false;
  }
  return true;
}

/**
 * What makes turns[k] an open request, as ref codes, or null. Only a first
 * message or the first of a new topic, only under a policy with
 * params.precision, and never when they asked for anything in so many words,
 * are practising, asked a fact or offered their own work, wrote about
 * themselves or someone close, asked to be heard, set the length to
 * detailed, or attached something.
 *
 * Branch A, the vague outcome: a short single sentence of the OPEN_REQUEST
 * kind with no ANCHOR in it, their own work not offered, and nothing on their
 * screen (material true is a document or a photo that may say what they
 * mean; unknown, as in a replay, is read as before). After the first turn it
 * needs a new topic and nothing but chit-chat before it (onlyChitChatBefore):
 * once they have said anything of their own, it may be what they mean.
 * Branch B, the missing referent: a short first message that points at
 * something (MISSING_REFERENT, with nothing handed over after it:
 * pointsAtNothing) when the route says nothing else is on their screen — live
 * only, since a replay cannot know what was on the screen then. offersWork
 * is not read there: with nothing on their screen, nothing can have been
 * offered ("Can you check this?").
 *
 * Known miss, by design: "What's wrong with education?" — every "what's" or
 * "what is" opener is a fact question to ACS (lib/cognition/assist.ts
 * isFactQuestion), and a fact question is never read as open.
 */
export function openRequestOf(turns: readonly TurnView[], k: number, ctx: ObserveContext, me: Own, codes: ReadonlySet<ExplicitCode>): string[] | null {
  const t = turns[k];
  const p = ctx.params;
  if (!t || !p.precision || ctx.length === 'detailed' || codes.size > 0) return null;
  const vagueMax = p.openRequestWords ?? 12;
  const referentMax = p.referentWords ?? 10;
  // (neither branch reads a message outside these lengths: the cheap test first)
  if (me.words < 2 || me.words > Math.max(vagueMax, referentMax)) return null;
  if (practiceSince(turns, k) >= 0) return null;
  // a fact asked is never open; "Translate this" with nothing to translate is a pointer, not a fact (Branch B)
  const fact = isFactQuestion(t.text);
  if (fact && !POINTER_TASK.test(me.sp)) return null;
  const s = t.signals;
  if (s.safety || s.sensitive || s.vent || tenderText(t.text)) return null;
  if (s.directness !== 'none' || s.answersOnly || s.recommendationRequested) return null;
  if (me.writing || /\[Attached /.test(t.text)) return null;
  if (
    ctx.material !== true &&
    me.words >= 3 &&
    me.words <= vagueMax &&
    me.cappedRawWords - me.words <= 3 &&
    !fact &&
    OPEN_REQUEST.test(me.sp) &&
    !ANCHOR.test(me.sp) &&
    sentencesOf(me.sp).length === 1 &&
    !offersWork(t.text) &&
    (k === 0 || (onlyChitChatBefore(turns, k) && newTopicAt(turns, k)))
  )
    return [IFR_REF_CODES.requestOpen, k === 0 ? IFR_REF_CODES.requestFirst : IFR_REF_CODES.requestNewTopic, IFR_REF_CODES.broadSubject, IFR_REF_CODES.vagueOutcome];
  if (k === 0 && ctx.material === false && me.words <= referentMax && me.cappedRawWords - me.words <= 2 && !/\d/.test(me.sp) && pointsAtNothing(me.sp, t.text.slice(0, IFR_READ_CHARS)))
    return [IFR_REF_CODES.requestOpen, IFR_REF_CODES.requestFirst, IFR_REF_CODES.missingReferent, IFR_REF_CODES.nothingShown];
  return null;
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
  // Reports, read only under a policy with params.precision (readPrecise): never standing, never a preference.
  'explicit.stuck': ['strong', 0.85],
  'explicit.corrected': ['strong', 0.85],
  'explicit.knows_that': ['strong', 0.8],
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
  /** words in the first IFR_READ_CHARS of the message, pasted material included: what `words` is measured against for a paste */
  cappedRawWords: number;
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
  /** the precise codes (readPrecise) — read whatever the policy, added to the turn's codes only under params.precision */
  precise: ReadonlySet<PreciseCode>;
  /** how its words say it is stuck (stuckWordsOf): on their own, among other words (a task in the window decides), or not */
  stuck: StuckWords | null;
  /** "still stuck" opening a clause, not put aside (stuckAgainAt adds the earlier stuck it needs) */
  stillStuck: boolean;
  /** the explicit questions of the reply after it, as content-word sets of 3 words or more (at most 8) */
  replyQuestions: readonly Set<string>[];
  /** the distinct sentences of the reply after it, as content-word sets of 8 words or more (at most 40) */
  replySentences: readonly Set<string>[];
  /** what the reply after it was about: topicStemsOf over its first IFR_READ_CHARS (newTopicAt) */
  replyStems: Set<string>;
  /** what it is about: topicWords over the first TOPIC_READ_CHARS of sp, movedOn's reading (newTopicAt) */
  topic: Set<string>;
  /** what it is about, stemmed: topicStemsOf over the first TOPIC_READ_CHARS of sp (newTopicAt) */
  stems: Set<string>;
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
/** An exercise verb put to a pointer or to nothing ("how to solve this", "I'm stuck trying to simplify it"): it names no exercise. */
const EXERCISE_POINTER = /\b(?:solve|simplify|factori[sz]e|differentiate|integrate|prove that)\s+(?:this|it|that|them|these|those)(?:\s+one)?\b|\b(?:solve|simplify|factori[sz]e|differentiate|integrate)(?=\s*(?:[?.!,;]|$))/gi;
/**
 * An exercise in their words (precision readers of stuck): THE_EXERCISE, but an
 * exercise verb whose object is "this", "it" or nothing is no exercise shown —
 * "I don't know how to solve this" with nothing before it is not work on the
 * table, while "solve 3x + 7 = 22" and "simplify (x^2 - 1)/(x - 1)" are.
 */
const exerciseNamed = (x: string): boolean => THE_EXERCISE_MATH.test(x) || THE_EXERCISE_WORDS.test(x.replace(EXERCISE_POINTER, ' '));

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
  private memo: Partial<Record<'words' | 'rawWords' | 'cappedRawWords' | 'tokens' | 'nums' | 'askMore' | 'writing' | 'replyLoad' | 'attempt' | 'short' | 'precise' | 'stuck' | 'stillStuck' | 'replyQuestions' | 'replySentences' | 'replyStems' | 'topic' | 'stems' | 'replyAsks', unknown>> = {};
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
  get cappedRawWords(): number {
    return this.once('cappedRawWords', () => wordCount(this.t.text.slice(0, IFR_READ_CHARS)));
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
  /** interrogatives of the reply after it, parsed once for the question streak and the repeated question */
  private get replyAsks(): ReturnType<typeof interrogatives> | null {
    return this.once('replyAsks', () => (this.t.reply === null ? null : interrogatives(this.t.reply)));
  }
  get replyLoad(): number | null {
    // questionLoad(reply), from the one parse
    return this.once('replyLoad', () => {
      const q = this.replyAsks;
      return q === null ? null : q.explicit.length + q.disguised.length;
    });
  }
  get precise(): ReadonlySet<PreciseCode> {
    return this.once('precise', () => readPrecise(this.sp, this.t.prevReply, this.stuck));
  }
  get stuck(): StuckWords | null {
    return this.once('stuck', () => stuckWordsOf(this.sp, this.t, this.words));
  }
  get stillStuck(): boolean {
    return this.once('stillStuck', () => stillStuckOf(this.sp, this.t));
  }
  get replyQuestions(): readonly Set<string>[] {
    return this.once('replyQuestions', () => {
      const q = this.replyAsks;
      return q === null ? [] : questionSetsOf(q.explicit);
    });
  }
  get replySentences(): readonly Set<string>[] {
    return this.once('replySentences', () => (this.t.reply === null ? [] : sentenceSets(this.t.reply)));
  }
  get topic(): Set<string> {
    return this.once('topic', () => topicWords(this.sp.slice(0, TOPIC_READ_CHARS)));
  }
  get stems(): Set<string> {
    return this.once('stems', () => topicStemsOf(this.sp.slice(0, TOPIC_READ_CHARS)));
  }
  get replyStems(): Set<string> {
    return this.once('replyStems', () => (this.t.reply === null ? new Set<string>() : topicStemsOf(speech(this.t.reply.slice(0, IFR_READ_CHARS)))));
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
  /**
   * Something is on their screen besides the transcript (MRTurnInput
   * .context.material). Set only for the newest turn; undefined is unknown,
   * and a reading that needs nothing to be shown stays silent then.
   */
  material?: boolean;
  /**
   * Their newest message carries an attachment (MRTurnInput.context.attached:
   * a photo, a screenshot, a note, a document). Set only for the newest turn;
   * undefined is unknown. Read defensively: only `true` counts.
   */
  attached?: boolean;
  /**
   * The route reads the turn as mathematics (MRTurnInput.context.accuracy
   * .math). Read only by the measure reactionAt (whether a number in their
   * message can be an attempt); undefined is unknown, and the transcript is
   * read instead. Only `true` counts.
   */
  math?: boolean;
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
  // ── what the precision readers point at (params.precision)
  /** an explicit.stuck whose work is in the conversation (described or pasted in this topic, set by the reply before, explained in it, or on their screen) */
  stuckShown: 'stuck.shown',
  /** an explicit.stuck with nothing of the work in the conversation — live only, when the route says nothing is on their screen either */
  stuckUnseen: 'stuck.unseen',
  /** an explicit.stuck on work that is theirs (practice, an exercise, their paste, their stated goal) */
  stuckOwnWork: 'stuck.own_work',
  /** an explicit.stuck read from "still stuck" after an earlier one */
  stuckAgain: 'stuck.again',
  /** the earlier explicit.stuck an observed.repeated_stuck counts */
  stuckBefore: 'stuck.before',
  /** an explicit.stuck that came with a refusal of help ("no hints, let me think"): every stuck rule stands aside */
  stuckDeclines: 'stuck.declines',
  /** an explicit.stuck with nothing before it: no earlier message of theirs, and nothing of the work shown */
  stuckFirst: 'stuck.first',
  /** an explicit.stuck that came with a request for the solution ("Walk me through the rest"): every stuck rule stands aside */
  stuckWantsAnswer: 'stuck.wants_answer',
  /** their "I already told you" after an asking reply */
  answerRedundant: 'answer.redundant',
  /** the earlier reply that asked the same question */
  replyAskedBefore: 'reply.asked_before',
  /** a reply that repeated sentences of recent replies */
  replyRepeats: 'reply.repeats',
  /** an earlier reply it repeated */
  replyRepeated: 'reply.repeated',
  /** a reply long enough that a re-ask after it says the point was lost */
  replyLong: 'reply.long',
  /** their re-ask for the point */
  reask: 'request.reask',
  /** a reply that suggested a fix (one that explained, before a report it still fails) */
  replySuggested: 'reply.suggested',
  /** their report that a suggested fix still fails */
  stillFailing: 'report.still_failing',
  /** an open request, and what it rests on */
  requestOpen: 'request.open',
  requestFirst: 'request.first',
  requestNewTopic: 'request.new_topic',
  /** the message before a new topic */
  requestPrevious: 'request.previous',
  broadSubject: 'request.broad_subject',
  vagueOutcome: 'request.vague_outcome',
  missingReferent: 'request.missing_referent',
  nothingShown: 'request.nothing_shown',
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

/** Every word of a is in b. */
function within(a: Set<string>, b: Set<string>): boolean {
  for (const w of a) if (!b.has(w)) return false;
  return true;
}
/**
 * Two questions (questionSets) are the same question: alike at the question
 * similarity, and one holds every word of the other ("Which operating system
 * are you using?", "…using right now?"). One that swaps a word for another
 * asks about another item ("…the radius passed in…", "…the value passed
 * in…"; "…by 4?", "…by 5?"). The measure and the reader share it.
 */
function sameQuestion(a: Set<string>, b: Set<string>, sim: number): boolean {
  return jaccard(a, b) >= sim && (within(a, b) || within(b, a));
}

/** |a ∩ b| / |a ∪ b|: how far two word sets are the same set. 0 when both are empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  let both = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const w of small) if (big.has(w)) both++;
  const union = a.size + b.size - both;
  return union === 0 ? 0 : both / union;
}

/** How much of a reply the sentence echo reads: its first 2,500 characters (where background said again sits; the measure reads the same). */
const ECHO_READ_CHARS = 2500;
/** The first `n` characters of a text, back to the end of its last whole sentence: a sentence cut in two is not read as one. */
function wholeSentencesUpTo(text: string, n: number): string {
  if (text.length <= n) return text;
  const cut = text.slice(0, n);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('\n'));
  return end > 0 ? cut.slice(0, end + 1) : cut;
}
const EIGHT_WORDS = /(?:\S+\s+){7}\S/;

/**
 * A question's content words, single letters and digits kept ("…divide both
 * sides by 4?" and "…by 5?" are two questions; tokensOf drops them).
 */
function questionTokensOf(sp: string): Set<string> {
  return new Set(
    sp
      .toLowerCase()
      .replace(/['’]/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 0 && !STOPWORDS.has(w))
  );
}

/**
 * A reply's explicit questions as content-word sets (questionTokensOf), 3
 * words or more each, at most 8. Offers ("Want me to go on?") and disguised
 * questions are not here, and nor is a question too short to say what it
 * asks ("Does that make sense?", "What do you think?"). The reader takes them
 * from the parse the question streak already made of the reply (Own.replyLoad),
 * so a reply is parsed for questions once.
 */
function questionSets(reply: string): Set<string>[] {
  return questionSetsOf(interrogatives(reply).explicit);
}
function questionSetsOf(explicit: readonly string[]): Set<string>[] {
  return explicit
    .map((q) => questionTokensOf(speech(q)))
    .filter((x) => x.size >= 3)
    .slice(0, 8);
}

/**
 * A reply's distinct sentences as content-word sets, 8 words or more each,
 * at most 40, from its first 2,500 characters (whole sentences) — code and quotes gone
 * (speech), and a sentence the reply says twice counted once, so one reply
 * repeating itself is never two echoes.
 */
function sentenceSets(reply: string): Set<string>[] {
  const out: Set<string>[] = [];
  const seen = new Set<string>();
  const said = new Set<string>();
  for (const x of sentencesOf(speech(wholeSentencesUpTo(reply, ECHO_READ_CHARS)))) {
    // (fewer than 8 words cannot hold 8 content words, and a sentence said word for word again adds nothing: neither is tokenised)
    if (said.has(x) || !EIGHT_WORDS.test(x)) continue;
    said.add(x);
    const w = tokensOf(x);
    if (w.size < 8) continue;
    const key = [...w].sort().join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * How much of `reply` says again what the earlier replies said: the distinct
 * sentences (8 content words or more, from its first 2,500 characters) that
 * match a sentence of one of them at the echo similarity, and whether one of
 * its questions (3 content words or more, digits kept) is the same question
 * as one of theirs (sameQuestion: alike at the question similarity, with no
 * word swapped for another). At most 3 earlier replies are read. Thresholds default to mr-2026.11.1's; the measure is the
 * same under any pin.
 *
 * THE MEASURE IS RAW. As measureReply and reactionAt's `clarified` read it,
 * nothing is left out: an earlier reply identical to this one is the most
 * repetition there is (every distinct sentence and every question of it
 * counts), and a question asked again word for word is repeatedQuestion true
 * and clarified 'no'. `skipIdentical` leaves identical earlier replies out,
 * for a caller that has to treat them as re-sends.
 *
 * The regulating readings share the definitions of a sentence, a question,
 * the similarities and the same question, and are recomputed from the
 * transcript, never taken from the measure; their windows and exclusions are
 * their own.
 * observed.repeated_question compares the last reply with the two before it
 * (not three), not while they practise, not against a reply to a message that
 * asked for writing or questions as content, and not against an identical
 * reply unless it is a short asking reply sent after a different message of
 * theirs. observed.repeated_background compares it with the three before it,
 * not when the message it answered asked for a recap or a reformat, not
 * against writing they asked for, and never against an identical reply. So
 * the measure can say true where the readings observe nothing: a question
 * asked again three replies later, a revision they asked for.
 */
export function replyEchoes(
  reply: string,
  earlier: readonly string[],
  p: Pick<StrategyParams, 'echoSimilarity' | 'questionEchoSimilarity'> = {},
  o: { skipIdentical?: boolean } = {}
): { repeatedSentences: number; repeatedQuestion: boolean } {
  const before = earlier.slice(0, 3).filter((x) => typeof x === 'string' && !(o.skipIdentical && x.trim() === reply.trim()));
  if (!before.length) return { repeatedSentences: 0, repeatedQuestion: false };
  const sim = p.echoSimilarity ?? 0.8;
  const qsim = p.questionEchoSimilarity ?? 0.6;
  const theirs = before.map(sentenceSets);
  let repeatedSentences = 0;
  for (const x of sentenceSets(reply)) if (theirs.some((ss) => ss.some((y) => jaccard(x, y) >= sim))) repeatedSentences++;
  const asked = before.map(questionSets);
  const repeatedQuestion = questionSets(reply).some((x) => asked.some((qs) => qs.some((y) => sameQuestion(x, y, qsim))));
  return { repeatedSentences, repeatedQuestion };
}

/** "Yes", "no", "both", "neither": the answer to a yes-or-no question, however short. */
const POLAR_ANSWER = /^\W*(?:yes|yeah|yep|yup|no|nope|nah|sure|right|correct|exactly|both|neither|either)\b/i;
/** "ok", "sure", "idk" as the whole message: an acknowledgement, not an answer to a what-or-which question. */
const FILLER_ANSWER = /^\W*(?:ok(?:ay)?|k|hm+|idk|dunno|sure|fine|cool|yeah|yes)\W*$/i;

/**
 * Does a short message answer the one question the reply before it asked?
 * Only when that reply asked exactly one explicit question and nothing
 * disguised (with more, which one was answered is not known). An attempt
 * does. A yes-or-no question is answered by a yes or a no, or by any content
 * word; a what-or-which question by a content word that is not filler or a
 * request to go on ("chrome", "monday", "work" — not "ok", "sure", "more").
 */
export function answersQuestion(prevReply: string, o: Own): boolean {
  const q = interrogatives(prevReply);
  if (q.explicit.length !== 1 || q.disguised.length !== 0) return false;
  if (o.attempt) return true;
  if (isPolarQuestion(q.explicit[0])) return POLAR_ANSWER.test(o.sp) || o.tokens.size > 0;
  return o.tokens.size > 0 && !FILLER_ANSWER.test(o.sp) && !SHORT_REQUEST.test(o.sp);
}

/**
 * Did their answer to an asking reply move anything? An attempt always does
 * (the engine decided it, or it has a digit or an operator in it), and so
 * does asking for questions or a quiz. Otherwise it did not when it asked to
 * be told, asked to stop, said they don't know, said they had already said
 * it, said they were confused, repeated an earlier request, or was 5 words
 * or fewer. KNOWN FALSE POSITIVE (mr-2026.10.1): a short factual answer to a
 * diagnostic question ("chrome", "yes") counts as not advancing; it takes two
 * of them in a row, each after an asking reply, before anything is observed.
 * Under a policy with params.precision, a short answer to the single question
 * asked (answersQuestion) advances, and so does their correction of how the
 * question was read.
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
  if (ctx.params.precision && o.precise.has('explicit.corrected')) return null;
  if (s.dontKnow) return 'dont_know';
  if (s.redundancy) return 'redundant';
  if (o.codes.has('explicit.confused')) return 'confused';
  if (repeatOf(turns, u) >= 0) return 'repeat';
  if (o.words <= 5 && !o.attempt) return ctx.params.precision && t.prevReply !== null && answersQuestion(t.prevReply, o) ? null : 'short';
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

/**
 * Their words at turns[k], as observations — the first part of observeTurn,
 * and all the fold reads of turns older than its window. `withPrecise` adds
 * the precise codes (stuck, corrected, already known): observeTurn passes it
 * under a policy with params.precision, and observeWords never does, so a
 * turn older than the window is read exactly as before.
 */
function readWords(turns: readonly TurnView[], k: number, p: StrategyParams, withPrecise = false, screen: Pick<ObserveContext, 'material' | 'attached'> = {}): { out: Observation[]; codes: Set<ExplicitCode>; revokedByAsking: boolean } {
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
  // Stuck, corrected, already known — a stuck among other words only with a
  // task in the window (stuckSaid), and "still stuck", which is stuck only
  // when they said so one or two turns before (alone it could be anything).
  let stuckAgain = false;
  let brief = false;
  if (withPrecise) {
    for (const c of me.precise) codes.add(c);
    if (!codes.has('explicit.stuck') && stuckSaid(turns, k)) codes.add('explicit.stuck');
    stuckAgain = stuckAgainAt(turns, k);
    if (stuckAgain || (!codes.has('explicit.stuck') && stuckStillAt(turns, k))) codes.add('explicit.stuck');
    // brevity asked in words readExplicit does not read ("Be brief.", "please be concise", "Keep all your answers
    // short from now on"): about Socria's replies, so it holds for the conversation, not for one reply
    brief = !!me.sp && !codes.has('explicit.shorter') && !codes.has('explicit.longer') && !me.writing && addressed(BREVITY, me.sp);
    if (brief) codes.add('explicit.shorter');
    // a stop on questions in words readExplicit does not read ("No follow-up questions please", "Stop questioning me"):
    // their stop, as "stop asking me questions" is, never beside a request for questions or a quiz
    if (me.sp && !codes.has('explicit.stop_questions') && !codes.has('explicit.wants_questions') && !codes.has('explicit.quiz') && addressed(NO_QUESTIONS_SAID, me.sp, { hedged: true, noDefer: true })) codes.add('explicit.stop_questions');
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
        : code === 'explicit.shorter' && !brief && shorterIsOnce(me.sp, t.prevReply !== null)
          ? [userRef(t, code), userRef(t, IFR_REF_CODES.lengthOnce)]
          : code === 'explicit.standing' && heldHere(me.sp)
            ? [userRef(t, code), userRef(t, IFR_REF_CODES.conversationOnly)]
            : code === 'explicit.stuck'
              ? stuckRefs(turns, k, p, stuckAgain, screen)
              : code === 'explicit.knows_that'
                ? // the reply that explained what they know (none to point at when it opened the conversation)
                  [userRef(t, code), ...(k > 0 ? [replyRef(turns[k - 1], IFR_REF_CODES.replyExplained)] : [])]
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
 * The user messages a stuck at turns[k] can rest on, newest first: the
 * earlier messages of this topic (back to the one that opened it, newTopicAt),
 * within IFR_LOOKBACK user turns counting this one. None when this message
 * opens a new topic itself.
 */
function topicWindow(turns: readonly TurnView[], k: number): number[] {
  const out: number[] = [];
  if (newTopicAt(turns, k)) return out;
  for (let j = k - 1; j >= Math.max(0, k - IFR_LOOKBACK + 1); j--) {
    out.push(j);
    if (newTopicAt(turns, j)) break;
  }
  return out;
}

/** Material pasted in: 15 words or more outside what they said, counted on the same slice as `words` (a long message is not a paste). */
const pastedIn = (o: Own): boolean => o.cappedRawWords - o.words >= 15;

/**
 * An earlier message that puts a task on the table: an exercise, a paste, a
 * description (12 words or more), the work named with something of it
 * (STUCK_WORK or THEIR_TASK beside a number, an operator, a colon, a quote
 * or 8 words: "Balance this for my chemistry homework: Fe + O2 -> Fe2O3"), an
 * assessment or practice signal, their own work offered, or their own work,
 * learning goal, quiz or try said. Not "Can you help me with my homework?":
 * the work is named, not shown. (`describes`: the words a description needs;
 * the message a stuck is in needs more, taskInWindow.)
 */
function statesTask(t: TurnView, describes = 12): boolean {
  const o = own(t);
  if (o.words >= describes || exerciseNamed(o.sp) || pastedIn(o) || t.signals.assessment || t.signals.practiceIntent || offersWork(t.text)) return true;
  // (a part or a question named by its number states no task: "I'm stuck on question 4" says where, not what)
  const unnumbered = o.sp.replace(PART_NUMBER, ' ');
  if ((STUCK_WORK.test(o.sp) || THEIR_TASK.test(o.sp)) && (ATTEMPT.test(unnumbered) || /:\s*\S/.test(o.sp) || o.words >= 8 || o.cappedRawWords - o.words >= 3)) return true;
  return o.codes.has('explicit.own_work') || o.codes.has('explicit.learning_goal') || o.codes.has('explicit.quiz') || o.codes.has('explicit.own_try');
}
/** A part or question named by its number ("question 4", "part 2b", "step 3", "q7"). */
const PART_NUMBER = /\b(?:question|part|step|number|no\.?|exercise|problem|task|section|q|ex)\s*\d+[a-z]?\b/gi;
/** …and one whose task is theirs to do: an exercise, their paste, their homework or class, an assessment or practice signal, their work offered. */
function taskIsTheirs(t: TurnView): boolean {
  const o = own(t);
  return exerciseNamed(o.sp) || pastedIn(o) || THEIR_TASK.test(o.sp) || t.signals.assessment || t.signals.practiceIntent || offersWork(t.text);
}
/** A reply that set them a problem: an exercise or a task's verb in it, and a question or a "try this" ("Try this one: integrate x^2 e^x dx.", "Can you balance the oxygen first?"). */
function replyPosesTask(reply: string | null): boolean {
  if (reply === null) return false;
  const sp = speech(reply.slice(-IFR_READ_CHARS));
  return (THE_EXERCISE.test(sp) || TASK_VERB.test(sp)) && (TRY_THIS.test(sp) || questionsPutTo(reply) > 0);
}
/** The reply before shows the work: an exercise in it ("For example: integrate x e^x dx. Pick u = x…"), whether or not it set it to them. */
function replyShowsWork(reply: string | null): boolean {
  return reply !== null && THE_EXERCISE.test(speech(reply.slice(-IFR_READ_CHARS)));
}
/**
 * A task on the table at turns[j]: what a stuck among other words needs
 * (stuckWordsOf 'bare'), and a "still stuck" with no stuck before it. A task
 * stated in this message or earlier in the topic (statesTask), set by the
 * reply before, or a reply before that explained or worked an exercise — the
 * troubleshooting thread ("My laptop wifi keeps dropping", the Device Manager
 * steps, "I'm stuck, I can't find Device Manager") as much as the homework.
 * Feelings, grief, life and the people around them are put aside before this
 * is asked (stuckPutAside, STUCK_PEOPLE).
 */
function taskInWindow(turns: readonly TurnView[], j: number): boolean {
  const prev = turns[j].prevReply;
  // (the message itself describes a task in 40 words or more: "I'm stuck, I don't know what to do, should I take the job in Berlin or stay?" is not one)
  return replyPosesTask(prev) || (prev !== null && (replyShowsWork(prev) || replyExplained(prev))) || statesTask(turns[j], 40) || topicWindow(turns, j).some((i) => statesTask(turns[i]));
}

/**
 * Their stuck at turns[j]: said on its own words (readPrecise), or among
 * other words with a task on the table ("I'm stuck, can you go over it?"
 * after their homework problem — never "I'm stuck, my visa runs out on
 * Friday" with nothing to work on).
 */
function stuckSaid(turns: readonly TurnView[], j: number): boolean {
  const o = own(turns[j]);
  return o.precise.has('explicit.stuck') || (o.stuck === 'bare' && taskInWindow(turns, j));
}
/**
 * "Still stuck" at turns[j], after a reply, in the same episode as a stuck
 * they said: stuck again (ref stuck.again). The episode is read back through
 * its "still stuck"s to the stuck that opened it, with at most one other turn
 * between any two of them, so the fourth "still stuck" in a row is read as
 * the second was; an earlier "still stuck" read as stuck itself (a task on
 * the table) opens one too.
 */
function stuckAgainAt(turns: readonly TurnView[], j: number): boolean {
  const t = turns[j];
  if (t.prevReply === null || !own(t).stillStuck || stuckSaid(turns, j)) return false;
  let gap = 0;
  for (let i = j - 1; i >= Math.max(0, j - 2 * IFR_LOOKBACK); i--) {
    if (stuckSaid(turns, i)) return true;
    if (turns[i].prevReply !== null && own(turns[i]).stillStuck) {
      if (taskInWindow(turns, i)) return true;
      gap = 0;
      continue;
    }
    if (++gap >= 2) return false;
  }
  return false;
}
/**
 * "Still stuck" at turns[j] with no stuck before it to be again, after a reply
 * and with a task on the table: "Tried that, still stuck" after their
 * integral and an explanation of it is their first stuck, in other words. Not
 * "Still stuck in traffic" (STILL_STUCK reads only the bare words), and
 * nothing with no task on the table ("Tried that, still stuck" after a
 * podcast recommendation).
 */
function stuckStillAt(turns: readonly TurnView[], j: number): boolean {
  const t = turns[j];
  return t.prevReply !== null && own(t).stillStuck && !stuckSaid(turns, j) && !stuckAgainAt(turns, j) && taskInWindow(turns, j);
}
/** Any stuck read at turns[j]: said, again, or a first "still stuck". */
function stuckAt(turns: readonly TurnView[], j: number): boolean {
  return stuckSaid(turns, j) || stuckAgainAt(turns, j) || stuckStillAt(turns, j);
}

/**
 * The work in the conversation at turns[k], from the transcript alone (no
 * screen): an exercise or a paste here or earlier in the topic, a task
 * described here or stated in the topic, a problem the reply before set or
 * worked, or a reply before that explained. stuckRefs adds the screen, and a
 * "still stuck" the work its episode's first stuck had on the table.
 */
function workShownAt(turns: readonly TurnView[], k: number, p: StrategyParams): boolean {
  const t = turns[k];
  const me = own(t);
  const win = topicWindow(turns, k);
  return (
    exerciseNamed(me.sp) ||
    win.some((j) => exerciseNamed(own(turns[j]).sp)) ||
    pastedIn(me) ||
    win.some((j) => pastedIn(own(turns[j]))) ||
    me.words >= (p.stuckShownWords ?? 12) ||
    replyPosesTask(t.prevReply) ||
    win.some((j) => statesTask(turns[j])) ||
    replyShowsWork(t.prevReply) ||
    (t.prevReply !== null && replyExplained(t.prevReply))
  );
}

/**
 * What an explicit.stuck at turns[k] rests on. SHOWN: the work is in the
 * conversation — an exercise in this message or one earlier in the topic
 * (topicWindow), material pasted in either (counted on the read slice), a
 * task described in this message (stuckShownWords words or more) or stated
 * earlier in the topic (statesTask), a problem the reply before set them or
 * worked as an example ("For example: integrate x e^x dx…", set to them or
 * not), a reply before that explained, or something on their screen (the
 * route's material, or an attachment on their newest message). UNSEEN: none of that,
 * read live only and only when the route says nothing is on their screen
 * (material === false) — an earlier turn replayed, or a caller that does not
 * know, gets neither, and no stuck rule acts. OWN WORK: the work is theirs —
 * practice under way, an exercise, a practice or assessment signal, their
 * homework or class (THEIR_TASK) here or earlier in the topic, their own work
 * or learning goal said in the window, their paste, a problem the reply set
 * them, or the work on their screen pointed at as theirs ("this problem").
 * Shown without own work is Socria's task: no rule reads it, and ACS's help
 * stands. DECLINES: the same message refuses help (STUCK_DECLINES). FIRST:
 * nothing precedes it — no earlier message of theirs, and nothing shown.
 */
function stuckRefs(turns: readonly TurnView[], k: number, p: StrategyParams, again: boolean, screen: Pick<ObserveContext, 'material' | 'attached'>): EvidenceRef[] {
  const t = turns[k];
  const me = own(t);
  const win = topicWindow(turns, k);
  const exercise = exerciseNamed(me.sp) || win.some((j) => exerciseNamed(own(turns[j]).sp));
  const pastedHere = pastedIn(me);
  const pastedBefore = win.some((j) => pastedIn(own(turns[j])));
  const posed = replyPosesTask(t.prevReply);
  const onScreen = screen.material === true || screen.attached === true;
  // stuck again: the work the episode's first stuck had on the table is still there ("still stuck" after a short reply)
  let episodeShown = false;
  if (again)
    for (let i = k - 1; i >= Math.max(0, k - 2 * IFR_LOOKBACK) && !episodeShown; i--) {
      if (!stuckAt(turns, i)) continue;
      episodeShown = workShownAt(turns, i, p);
      if (stuckSaid(turns, i)) break;
    }
  const shown = episodeShown || onScreen || workShownAt(turns, k, p);
  let stated = false;
  for (let j = Math.max(0, k - IFR_LOOKBACK + 1); j <= k && !stated; j++) {
    const c = own(turns[j]).codes;
    stated = c.has('explicit.own_work') || c.has('explicit.learning_goal');
  }
  const ownWork =
    practiceSince(turns, k) >= 0 ||
    exercise ||
    t.signals.practiceIntent ||
    t.signals.assessment ||
    stated ||
    pastedHere ||
    pastedBefore ||
    posed ||
    THEIR_TASK.test(me.sp) ||
    win.some((j) => taskIsTheirs(turns[j])) ||
    (onScreen && POINTS_AT_WORK.test(me.sp));
  const unseen = !shown && screen.material === false;
  const earlier = turns.slice(0, k).some((x) => own(x).sp.trim() !== '');
  return [
    userRef(t, 'explicit.stuck'),
    ...(shown ? [userRef(t, IFR_REF_CODES.stuckShown)] : unseen ? [userRef(t, IFR_REF_CODES.stuckUnseen)] : []),
    ...(ownWork ? [userRef(t, IFR_REF_CODES.stuckOwnWork)] : []),
    ...(again ? [userRef(t, IFR_REF_CODES.stuckAgain)] : []),
    ...(STUCK_DECLINES.test(me.sp) ? [userRef(t, IFR_REF_CODES.stuckDeclines)] : []),
    ...(STUCK_WANTS_ANSWER.test(me.sp) ? [userRef(t, IFR_REF_CODES.stuckWantsAnswer)] : []),
    ...(!earlier && !shown ? [userRef(t, IFR_REF_CODES.stuckFirst)] : []),
  ];
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

// One reading per TurnView, kept with the message before it (as NEW_TOPIC): the repeated-question and repeated-
// background readers ask it of the same earlier turns on every observeTurn call of the fold.
const CONTENT_ASKED = new WeakMap<TurnView, { prev: TurnView | undefined; at: boolean }>();
/**
 * Their message at turns[u] asked for writing or for questions as content, or
 * named their own writing: the reply to it says its sentences and questions
 * on purpose, and a later reply that says them again is a revision, not an
 * echo. (writingAsked reads the three messages before it, for a revision of a
 * draft asked for there.)
 */
function contentAskedAt(turns: readonly TurnView[], u: number): boolean {
  const t = turns[u];
  const hit = CONTENT_ASKED.get(t);
  if (hit && hit.prev === turns[u - 1]) return hit.at;
  const o = own(t);
  const at = o.writing || o.codes.has('explicit.edit_only') || o.codes.has('explicit.rewrite') || writingAskedSaid(o.sp, t.text.slice(0, IFR_READ_CHARS), saidBefore(turns, u, 3)) || questionsAsContentSaid(o.sp);
  CONTENT_ASKED.set(t, { prev: turns[u - 1], at });
  return at;
}

/** Their messages before turns[u], newest first, at most n, as what they said (Own.sp): writingAsked's earlier messages. */
function saidBefore(turns: readonly TurnView[], u: number, n: number): SaidLater {
  const out: (() => string)[] = [];
  for (let j = u - 1; j >= Math.max(0, u - n); j--) out.push(() => own(turns[j]).sp);
  return out;
}

/** Their first sentence at turns[k] asks again for the point (REASKS), or asks how to do it after a how-to (REASKS_HOW). */
function reasksAt(turns: readonly TurnView[], k: number): boolean {
  const first = firstSentences(own(turns[k]).sp, 1)[0] ?? '';
  return REASKS.test(first) || (k >= 1 && REASKS_HOW.test(first) && HOW_ASKED.test(own(turns[k - 1]).sp));
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
  const { out, codes, revokedByAsking } = readWords(turns, k, p, p.precision === true, { material: ctx.material, attached: ctx.attached });

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

  const contentAsked = (u: number) => contentAskedAt(turns, u);

  // ── Socria asked for something they had already said: their words
  // ("I already told you"), right after a reply that asked.
  // Not when Socria's own question asked whether they had done that very
  // thing: "I already mentioned it" answers "Have you mentioned it to HR?".
  if (p.precision && k >= 1 && !quizzing && (own(turns[k - 1]).replyLoad ?? 0) > 0 && saidAlready(me.sp) && !ASKED_IF_DONE.test(lastQuestionOf(turns[k - 1].reply)))
    out.push(obs('observed.redundant_question', 'observed', 'moderate', t.index, [replyRef(turns[k - 1], IFR_REF_CODES.replyAsked), userRef(t, IFR_REF_CODES.answerRedundant)], 0.8));

  // ── ...or asked the same question it asked a reply or two before (a
  // count over Socria's own questions): the same words, or the same words
  // and more, never a question that swaps a word for another ("What should
  // happen when the radius passed in is negative?" then "…the value…" asks
  // about another function; the digits count: "…divide both sides by 4?"
  // then "…by 5?"). Not while they practise (a quiz, an own try or a learning
  // goal: the next step of the same exercise asks the same way), not
  // questions they asked to have written (now, or in the list this one
  // revises), and not a reply identical to the earlier one unless it is a
  // short asking reply sent again after a different message of theirs (a real
  // re-ask, word for word): an identical long reply, or the same reply to
  // the same message sent again, is a re-send or a fixture.
  if (p.precision && k >= 2 && !quizzing && practice < 0 && own(turns[k - 1]).replyQuestions.length) {
    const ask = turns[k - 1];
    const mine = own(ask).replyQuestions;
    const sim = p.questionEchoSimilarity ?? 0.6;
    const reasked = (j: number) => (turns[j].reply ?? '').trim() !== (ask.reply ?? '').trim() || (wordCount(ask.reply ?? '') <= 40 && turns[j].text.trim() !== ask.text.trim());
    const before = [k - 2, k - 3].find((j) => j >= 0 && reasked(j) && own(turns[j]).replyQuestions.some((b) => mine.some((a) => sameQuestion(a, b, sim))) && !contentAsked(j));
    // (questions asked for as content now, or in the list this one revises: read only when a question came back)
    if (before !== undefined && !questionsAsContentSaid(own(ask).sp) && !writingForOthersSaid(own(ask).sp, saidBefore(turns, k - 1, 3)))
      out.push(obs('observed.repeated_question', 'observed', 'moderate', t.index, [replyRef(ask, IFR_REF_CODES.replyAsked), replyRef(turns[before], IFR_REF_CODES.replyAskedBefore)], 0.75));
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

  // ── stuck again, within two turns of saying so, with a reply between:
  // one next step was not enough. (No quiz exclusion: a worked example
  // inside a quiz is compose's to keep a quiz, as for repeated confusion.)
  if (p.precision && codes.has('explicit.stuck') && t.prevReply !== null) {
    // (a stuck they said first; else any stuck read there — "still stuck" again, the fourth in a row)
    const before = [k - 1, k - 2].find((j) => j >= 0 && stuckSaid(turns, j)) ?? [k - 1, k - 2].find((j) => j >= 0 && stuckAt(turns, j));
    if (before !== undefined)
      out.push(obs('observed.repeated_stuck', 'observed', 'moderate', t.index, [userRef(t, 'explicit.stuck'), userRef(turns[before], IFR_REF_CODES.stuckBefore)], 0.8));
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

  // ── a suggested fix still fails, reported twice running, each after a
  // reply that explained. Their words for the failure and a count of two;
  // an attempt the engine decided is failed_attempts' to read.
  if (p.precision && k >= 2 && !quizzing && !now) {
    const failed = (u: number) => {
      const r = turns[u].prevReply;
      const o = own(turns[u]);
      return r !== null && !o.codes.has('explicit.confused') && stillFails(o.sp) && replyExplained(r);
    };
    if (failed(k) && failed(k - 1))
      out.push(
        obs('observed.fix_failed', 'observed', 'moderate', t.index, [replyRef(turns[k - 2], IFR_REF_CODES.replySuggested), userRef(turns[k - 1], IFR_REF_CODES.stillFailing), replyRef(turns[k - 1], IFR_REF_CODES.replySuggested), userRef(t, IFR_REF_CODES.stillFailing)], 0.7)
      );
  }

  // ── the same request again (their previous 3 messages)
  const rep = repeatOf(turns, k);
  if (rep >= 0) out.push(obs('observed.repeated_request', 'observed', 'moderate', t.index, [userRef(t, IFR_REF_CODES.repeat), userRef(turns[rep], IFR_REF_CODES.repeatOf)], 0.7));

  // ── their re-ask for the point, in a short message, after a long reply.
  // The evidence is their words and the reply's length — never a reading of
  // where in the reply the answer sat. ("How do I do it?" only after a
  // how-to: REASKS_HOW. The words first: they are cheaper than counting the
  // reply.)
  if (p.precision && k >= 1 && t.prevReply !== null && !quizzing && me.words <= 15 && reasksAt(turns, k) && wordCount(t.prevReply) >= (p.longReplyWords ?? 240))
    out.push(obs('observed.late_answer', 'observed', 'moderate', t.index, [replyRef(turns[k - 1], IFR_REF_CODES.replyLong), userRef(t, IFR_REF_CODES.reask)], 0.65));

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

  // ── the last reply said again what recent replies had said: distinct
  // sentences of 8 content words or more, matched at the echo similarity
  // against the three replies before it. Not when the message it answered
  // asked for a recap, a repeat, the same material in another form (bullet
  // points, simpler, a table: REFORMAT_ASKED) or a piece of writing, nor
  // against a reply that was a piece of writing they asked for (a re-rendered
  // draft says its sentences again on purpose), and not against an identical
  // reply (a re-send or a fixture; the measure counts it: replyEchoes).
  if (p.precision && k >= 2 && ctx.length !== 'detailed' && turns[k - 1].reply !== null) {
    const ask = turns[k - 1];
    const need = p.repeatedSentences ?? 2;
    const sim = p.echoSimilarity ?? 0.8;
    // (fewer distinct sentences than it takes cannot echo enough: the exclusions are read only when they could)
    const said = own(ask).replySentences.length < need || ASKED_AGAIN.test(own(ask).sp) || REFORMAT_ASKED.test(own(ask).sp) ? [] : own(ask).replySentences;
    const mine = said.length >= need && !contentAsked(k - 1) ? said : [];
    const js = mine.length ? [k - 2, k - 3, k - 4].filter((j) => j >= 0 && turns[j].reply !== null && turns[j].reply!.trim() !== ask.reply!.trim()) : [];
    const matched = new Set<number>();
    let n = 0;
    for (const x of mine) {
      const j = js.find((j) => own(turns[j]).replySentences.some((y) => jaccard(x, y) >= sim) && !contentAsked(j));
      if (j === undefined) continue;
      matched.add(j);
      if (++n >= need) break;
    }
    if (n >= need)
      out.push(obs('observed.repeated_background', 'observed', 'moderate', t.index, [replyRef(ask, IFR_REF_CODES.replyRepeats), ...js.filter((j) => matched.has(j)).map((j) => replyRef(turns[j], IFR_REF_CODES.replyRepeated))], 0.7));
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
  // OPEN REQUEST: an estimate turned observation too (openRequestOf); its
  // refs name what was read.
  const open = openRequestOf(turns, k, ctx, me, codes);
  if (open) out.push(obs('observed.open_request', 'observed', 'moderate', t.index, open.map((c) => userRef(t, c)), 0.6));
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
  // ── a new topic: it ends adjustments made for the last one, and starts none.
  if (p.precision && newTopicAt(turns, k))
    out.push(obs('observed.new_topic', 'observed', 'moderate', t.index, [userRef(t, IFR_REF_CODES.requestNewTopic), userRef(turns[k - 1], IFR_REF_CODES.requestPrevious)], 0.6));

  // ── weak: recorded, never acted on alone, never stronger than this.
  // A reply only: the first message of a conversation is not short "back".
  // Under params.precision, a short report ("I'm stuck", "I meant X", "still
  // stuck" after an earlier stuck) is their words, not a short reply.
  const shortHere = (j: number) => j >= 0 && turns[j].prevReply !== null && own(turns[j]).short && !(p.precision && (own(turns[j]).precise.size > 0 || stuckAgainAt(turns, j) || stuckStillAt(turns, j)));
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

// ── measures: how their message met the reply before it ──────────────
//
// MEASUREMENT, NOT POLICY. reactionAt describes their newest message
// against the reply before it, for the exposure row (lib/mr/types.ts
// Reaction, MEASURE_PROVENANCE). It reads no policy parameter — the
// precise codes are read under any pin, and the advance test is
// mr-2026.11.1's whatever the pin — so two versions are compared on one
// yardstick. Nothing that regulates reads it back. Its intended call site is
// lib/mr/state.ts foldConversation, for the newest turn only, after the
// uncertainty block and only when that turn has a reply before it:
//
//   const react = turns[last].prevReply !== null
//     ? reactionAt(turns, last, { params, verdicts: input.context.accuracy.theirs, verdictsByTurn: f.verdictsByTurn, length: input.context.length }, nowObs)
//     : null;
//   // ...then `...(react ? { react } : {})` in the MRState it builds.

/**
 * They SAID they understood, opening their message: "got it", "Got it,
 * thanks!", "that makes sense now", "Ah, I see.", "That helps, thanks", "That
 * helps a lot, thank you", "that helps so much". The short forms ("got it", "I
 * see", "that helps", with "a lot" or "so much") end their clause: not "I see a different error now", "got it
 * working", "got it to run", "that helps a bit but it still drops", nor
 * "That helps, but…" (a qualified complaint). Said, not shown: never evidence
 * that they did.
 */
const UNDERSTOOD_SAID = new RegExp(
  String.raw`^\W*(?:(?:oh|ah|ok(?:ay)?|right|yes|yeah|aha)[\s,!.]+)*(?:(?:(?:that|it) (?:makes|made) sense(?: now)?|makes sense(?: now)?|i (?:get|got|understand|see) (?:it )?now|now i (?:get|see|understand)(?: it)?|that clears it up)\b|(?:got it|i see|that helps(?: (?:a lot|so much|loads|heaps|a ton|tons|massively|a great deal|a bunch|enormously|hugely))?(?![^.!?]*\bbut\b))(?=\s*(?:[,.!;:)]|[—–-]\s|$|\b(?:now|thanks?|thank you|cheers|lol|haha)\b)))`,
  'i'
);

/**
 * answerNoAdvance as mr-2026.11.1 reads it, whatever the policy: a short
 * answer to the one question asked advances, and so does a correction. A
 * measure is the same under any pin.
 */
function advanceOf(turns: readonly TurnView[], u: number, k: number, ctx: ObserveContext): NoAdvance | null {
  return answerNoAdvance(turns, u, k, { ...ctx, params: { ...ctx.params, precision: true } });
}

/** Whether their message at turns[u] answered what the reply before it asked. */
function answeredAt(turns: readonly TurnView[], u: number, asked: number, na: NoAdvance | null): Reaction['answered'] {
  if (asked === 0) return 'not_asked';
  return own(turns[u]).precise.has('explicit.corrected') || na === null ? 'answer' : 'no_advance';
}

/**
 * Can their message at turns[k] be an attempt? A maths turn (the route's
 * reading, ObserveContext.math; a verdict of the engine on it; or the
 * conversation reads as mathematics: looksMathematical, or working with an
 * operator in their message), or a reply before it that held the answer back
 * for them to try (practice, an own try or a quiz in force; a "try this" or a
 * task set in it). A measure's test: it reads no policy.
 */
function attemptPossibleAt(turns: readonly TurnView[], k: number, ctx: ObserveContext): boolean {
  const t = turns[k];
  if (ctx.math === true || (ctx.verdicts?.length ?? 0) > 0 || THE_EXERCISE.test(own(t).sp)) return true;
  if (practiceSince(turns, k) >= 0 || replyPosesTask(t.prevReply) || (t.prevReply !== null && TRY_THIS.test(speech(t.prevReply.slice(-IFR_READ_CHARS))))) return true;
  return looksMathematical([...turns.slice(0, k + 1).map((x) => x.text.slice(0, IFR_READ_CHARS)), (t.prevReply ?? '').slice(0, IFR_READ_CHARS)]);
}

/**
 * How their message at turns[k] met the reply before it, or null when there
 * was none. Observed and explicit fields are counts and their words;
 * `alreadyGiven` and `relevance` are hypotheses (never exported for
 * research, never read by anything that regulates). Nothing here says that
 * they understood: `saidUnderstood` is what they said.
 */
export function reactionAt(turns: readonly TurnView[], k: number, ctx: ObserveContext, nowObs: readonly Observation[]): Reaction | null {
  const t = turns[k];
  if (!t || t.prevReply === null) return null;
  const prev = t.prevReply;
  const me = own(t);
  const said = (c: ObservationCode) => nowObs.some((o) => o.code === c);
  const prevAsked = questionsPutTo(prev);
  const na = advanceOf(turns, k, k, ctx);
  const answered = answeredAt(turns, k, prevAsked, na);
  const corrected = me.precise.has('explicit.corrected');
  const redundantWords = saidAlready(me.sp);
  const confused = said('explicit.confused');
  const repeatRequest = said('observed.repeated_request');
  const v = ctx.verdicts ?? [];
  const verified = v.some((x) => x.status === 'verified');
  const refuted = v.some((x) => x.status === 'refuted');
  const verdict: Reaction['verdict'] = verified && !refuted ? 'verified' : refuted && !verified ? 'refuted' : 'none';
  // copying back what the reply gave away is not an independent attempt
  const given = revealsAnswer(prev) || attemptStatedIn(prev, t.text);
  // An attempt only where one can be made: a maths turn, or a reply that held the answer back for them to try.
  // "Windows 11" answering "Which operating system?" and "3.12" answering "Which version of Python?" have digits
  // in them, and neither is an attempt at anything.
  const attempt = me.attempt && attemptPossibleAt(turns, k, ctx);
  const independent: Reaction['independent'] = given ? 'none' : verdict !== 'none' ? verdict : attempt ? 'attempt' : 'none';
  // the clarification followed through: the reply before last asked, their last message answered it, and the reply since did not ask it again
  let clarified: Reaction['clarified'] = 'unknown';
  const before = k >= 1 ? turns[k - 1].prevReply : null;
  if (before !== null) {
    const a1 = answeredAt(turns, k - 1, questionsPutTo(before), advanceOf(turns, k - 1, k, ctx));
    // (raw, as the measure is: the same question asked again word for word did not follow through)
    if (a1 === 'answer') clarified = !replyEchoes(prev, [before]).repeatedQuestion && !redundantWords && !corrected && !confused && !repeatRequest ? 'yes' : 'no';
  }
  // hypotheses: the reply's question asked for what they had already written; its questions were about what they had said
  const qs = interrogatives(prev).explicit;
  const lastQ = qs.length ? [...tokensOf(speech(qs[qs.length - 1]))] : [];
  const inEarlier = (w: string) => turns.slice(0, k).some((x) => own(x).tokens.has(w));
  const alreadyGiven = lastQ.length >= 2 && lastQ.filter(inEarlier).length >= 0.75 * lastQ.length;
  const asked = new Set(qs.flatMap((q) => [...tokensOf(speech(q))]));
  const relevance: Reaction['relevance'] = prevAsked === 0 || k === 0 ? 'none' : [...asked].some((w) => own(turns[k - 1]).tokens.has(w)) ? 'targets' : 'drifts';
  return {
    mv: MEASURE_VERSION,
    prevAsked,
    answered,
    // why an answer to a question moved nothing: there is none to explain when the reply asked nothing
    noAdvance: prevAsked === 0 ? 'none' : (na ?? 'none'),
    corrected,
    stuck: stuckAt(turns, k),
    knewIt: me.precise.has('explicit.knows_that'),
    redundantWords,
    confused,
    saidUnderstood: UNDERSTOOD_SAID.test(firstSentences(me.sp, 1)[0] ?? ''),
    askedShorter: said('explicit.shorter'),
    askedLonger: said('explicit.longer'),
    negative: said('explicit.negative'),
    repeatRequest,
    newTopic: newTopicAt(turns, k),
    attempt,
    verdict,
    independent,
    clarified,
    alreadyGiven,
    relevance,
  };
}
