// lib/runtime/engagement.ts — HOW THE REPLY MEETS THEIR THINKING (a dimension of the allocation).
//
// The allocation (allocation.ts) decided who does the work and which move helps. It did not decide what the
// reply leaves for the person to do with it — and every instruction that touched the end of a reply closed
// it: "most replies end on a statement", "Then stop", "no closing question", a trailing question deleted by
// the gate outside the budget. Each was right about the thing it removed (the help desk's "want me to go
// deeper?"), and together they made a reply a finished object: thoughtful, complete, and with nothing in it
// to answer. A person who shared good news got a closed sentence back; one thinking out loud got a summary.
//
// So the turn's allocation carries one more reading, made the way the others are — in code, from their words
// and the transcript, with no model call:
//
//   strategy      what makes this exchange worth having: the answer itself (direct), being met (attune), the
//                 joke kept up (play), something left open (hook), their own contribution built on (build), an
//                 earlier question of theirs connected (thread), their own reasoning drawn out (socratic), or
//                 a clean end (close)
//   invitation    how strongly the reply asks for more: none · subtle (an observation they may pick up) ·
//                 explicit (one question, wanted) · sustained (a back-and-forth already under way)
//   continuation  what the reply does to the conversation: answer, deepen, explore, pivot, invite, conclude
//
// THE INVITATION ADAPTS TO WHAT THEY DID WITH THE LAST ONE (readParticipation). Socria's last question taken
// up, answered in a word, met with "I don't know", waved off, let pass, or closed on — read from the
// transcript, so nothing is stored and nothing is inferred about the person. A question let pass is not asked
// again; two let pass with none taken up, and questions wait until they take one.
//
// IT ONLY EVER LOWERS THE QUESTION BUDGET. Whether a question may ship is still Core 4's budget and the stream
// gate (lib/core4/budget.ts, stream-gate.ts) and their own words through MR (lib/mr): this reading decides
// whether one is WANTED, and can close the budget for a turn (they are finishing; they let the last one pass).
// It never opens it. Where no question may ship, an invitation is a statement.
//
// TWO RULES ABOUT EVIDENCE, learned by failing an adversarial pass (docs/LOGOS-ENGAGEMENT.md §8.2). A line that
// plays, pushes or adds to a reply is given only on POSITIVE evidence that the ground is safe — the thought is not
// about the person or the people in their life — never because nothing was found wrong with a message: no list of
// words that carry distress is complete. And a turn is closed only on a goodbye that is the whole of what was said:
// "I need to leave my husband" and "My laptop will not turn on. Thanks." are not goodbyes. Wherever the evidence is
// missing, the turn is exactly what it is without this reading. evals/engagement/stand-aside.mjs holds the messages.
//
// AND IT IS NOT A MEASURE OF TIME SPENT. Nothing here counts messages or tries to prolong a conversation: a
// fact gets its answer and nothing after it; "thanks, that's all" gets a line and no hook. What is wanted is a
// reply a person would choose to answer, on the turns where there is something to answer.
//
// Independent of how hard the turn is to think about (lib/model-router.ts levelOf): a joke takes little
// reasoning and real attention to the person; a proof takes the deep model and, often, no invitation at all.
//
// Pure. No model, no network, no clock, nothing kept.

import { conceptTerms } from '../core4/considered';
import { sentencesOf } from '../core4/questions';
import type { ExplicitSignals } from '../core4/types';
import type { AssistDecision, AssistView } from '../cognition/assist';
import { onlyANod, saysGoodbye, smallTalk, spoken, takesIn, wrapsUp } from '../cognition/register';
import type { TurnState } from './state';

export const ENGAGE_STRATEGIES = ['direct', 'attune', 'play', 'hook', 'build', 'thread', 'socratic', 'close'] as const;
export type EngageStrategy = (typeof ENGAGE_STRATEGIES)[number];
export const INVITATIONS = ['none', 'subtle', 'explicit', 'sustained'] as const;
export type Invitation = (typeof INVITATIONS)[number];
export const CONTINUATIONS = ['answer', 'deepen', 'explore', 'pivot', 'invite', 'conclude'] as const;
export type Continuation = (typeof CONTINUATIONS)[number];
/** What they did with the question Socria's last reply ended on. */
export const UPTAKES = ['none', 'took', 'brief', 'unsure', 'declined', 'passed', 'closed'] as const;
export type Uptake = (typeof UPTAKES)[number];
/** The line the reply is given, by name (for the trace and the tests). */
export const ENGAGE_CUES = ['close', 'settled', 'letgo', 'objection', 'built', 'goodnews', 'hardday', 'position', 'theirview', 'together', 'riff', 'aloud', 'wonder', 'more', 'forfun', 'thread'] as const;
export type EngageCue = (typeof ENGAGE_CUES)[number];

type Msg = { role: 'user' | 'assistant'; content: string };

/** What the transcript shows of their part in the conversation — counts and codes, never their words. */
export interface Participation {
  /** Socria has replied before in this conversation (false on its first turn) */
  replied: boolean;
  /** Socria's last reply ended on a question */
  asked: boolean;
  /** …or asked or offered anything near its end, in any form (see prompts) */
  prompted: boolean;
  /** what they did with it */
  uptake: Uptake;
  /** of the recent replies that ended on a question: how many they answered, how many they let pass */
  taken: number;
  passed: number;
  /** the last two questions Socria ended on were both let pass, and the last of them was within the last few replies */
  wary: boolean;
  /** this message brings something of their own — a view, an account, an idea — not only a request */
  contributes: boolean;
  /** messages in a row, this one included, that did */
  run: number;
  /** a question about what Socria just said */
  followUp: boolean;
  /** they changed the subject, in so many words */
  shifts: boolean;
}

export interface Engagement {
  strategy: EngageStrategy;
  invitation: Invitation;
  continuation: Continuation;
  /** the most questions this reading leaves the move: it lowers the budget (0) or leaves it alone (1) */
  cap: 0 | 1;
  /** the line the reply gets, if any */
  cue: EngageCue | null;
  /** thread: the earlier question of theirs this touches, in their map's words */
  target?: string;
  participation: Participation;
  /** machine-readable, content-free reasons (tests, the trace) */
  reasons: string[];
}

// ── reading their part ────────────────────────────────────────────────

/** A reply without its fenced blocks, quotations and blockquotes (an element, code, a draft written for somebody
 * else): what was said to them. */
const proseOf = (t: string) =>
  t.replace(/```[\s\S]*?```/g, ' ').replace(/^[ \t]*>.*$/gm, ' ').replace(/[“"][^”"\n]{0,300}[”"]/g, ' ').trim();

/**
 * The end of the last reply asked them something or handed them the next step, in any form: a question in its last
 * two sentences ("Would you like me to draft it? I can keep it short."), an offer ("I can draft one if you like"), a
 * step to report back on ("Tell me when that has finished"). After such a reply, "ok", "yes thanks", "that's it" and
 * "I have to leave tonight" are answers — never an ending.
 */
const PROMPTS =
  /\b(?:tell me (?:when|if|what|how|which)|let me know|if you (?:like|want|wish|prefer|'d like|would like)|when you(?:'re| are) ready|shall (?:i|we)|should i|want me to|would you like|i can (?:draft|write|do|show|make|send|walk|go)|happy to|ready for (?:the next|step)|we(?:'ll| will) do (?:step|the next)|next step|then (?:we|i)(?:'ll| will))\b/i;
function prompts(reply: string): boolean {
  const tail = sentencesIn(proseOf(reply).slice(-600)).slice(-2).join(' ');
  return tail.includes('?') || PROMPTS.test(tail);
}

/** How much of a reply's end is read for the question it closes on. */
const CLOSING_TAIL = 800;

/**
 * The question a reply ends on, or ''. Only the end of the reply is read: a closing question is its last sentence,
 * and the history comes from the client — the sentence splitter is not linear in a long run of "?" (lib/core4/
 * questions.ts sentencesOf), so it is never handed more than this.
 */
export function closingAsk(reply: string): string {
  const prose = proseOf(reply ?? '');
  const t = prose.length > CLOSING_TAIL ? prose.slice(-CLOSING_TAIL) : prose;
  if (!/\?["'’”)\]*_]*\s*$/.test(t)) return '';
  const parts = sentencesOf(t);
  return (parts[parts.length - 1] ?? '').trim();
}

const sentencesIn = (t: string) => t.split(/(?<=[.!?…])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const wordsIn = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
/**
 * How a sentence that asks or requests begins, when it has no question mark: a wh-word, or a request ("can you…",
 * "tell me…", "fix…"). An auxiliary alone is not enough — "did my first 5k this morning" is news, not a question.
 */
const ASK_LEAD =
  /^(?:(?:ok(?:ay)?|so|and|but|also|well|alright|right|hey|now|then|wait)[,\s]+)*(?:what|how|why|when|where|who|whom|whose|which|(?:can|could|would|will) (?:you|u)\b|please|pls|tell me|show me|give me|explain|describe|define|write|draft|make|create|list|summari[sz]e|translate|convert|fix|check|compare|help me|let'?s|walk me)\b/i;
/**
 * A clause that only leads into the request: "different question:", "just curious,", "anyway,". Read here because
 * the register's own list of them is shorter (lib/cognition/register.ts PREFACE) and is left exactly as it is.
 */
const LEAD = String.raw`(?:(?:ok(?:ay)?|so|and|but|also|well|alright|right|hey|now|then|wait|anyway|anyways|btw|by the way)[,\s]+)*(?:(?:(?:a|an|one)\s+)?(?:quick|random|silly|dumb|serious|small|another|different|new|separate|unrelated|other|next|last|final|follow-?up)\s+question|question|one more thing|(?:just\s+)?curious|out of curiosity|just wondering)`;
const LEAD_IN = new RegExp(`^${LEAD}\\s*[:,;.!–—-]+\\s*`, 'i');
const LEAD_ONLY = new RegExp(`^${LEAD}[\\s:,;.!–—-]*$`, 'i');
const asks = (sentence: string) => /\?["'’”)\]]*$/.test(sentence) || ASK_LEAD.test(sentence.replace(LEAD_IN, ''));

/** Every sentence asks for something (a pleasantry beside it aside): a request, with nothing of their own in it. */
function asksOnly(text: string): boolean {
  const parts = sentencesIn(spoken(text));
  let n = 0;
  for (const p of parts) {
    if (asks(p)) n++;
    else if (!smallTalk(p) && !LEAD_ONLY.test(p)) return false;
  }
  return n > 0;
}

/** Wanting to know, said as a statement: "I've always wondered why…", "I don't get how…". A request in all but form. */
const WANTS_TO_KNOW = /\b(?:wonder(?:ed|ing)?|curious|(?:don'?t|do not|never) (?:really )?(?:get|understand|understood)|confus\w+|no idea (?:why|how|what)|(?:want|need|trying|like) to (?:know|understand|figure out))\b/i;

/**
 * A reaction that shows interest in what was just said, and nothing else: "huh, I never knew that", "that's wild",
 * "wow". The whole message, with a bare "that" for its object — "I never knew my grandfather" is their own story.
 * Not "no way": the register reads that as pushing back (lib/cognition/register.ts), and it is the register's to read.
 */
const REACTS =
  /^(?:(?:huh|wow|whoa|woah|oh|ooh|ah|ha(?:ha)*|lol|damn|dang|wait|ok(?:ay)?|hm+|man|dude)[,.!\s]+)*(?:i (?:never|didn'?t|did not|hadn'?t|had not) (?:knew|know|known|reali[sz]ed?|thought (?:of|about)|heard(?: of| about)?)(?: (?:that|this|it|any of (?:that|this)))?|i had no idea|(?:that|this|it)(?:'s| is| was) (?:(?:so|really|pretty|kinda|kind of|actually|genuinely|honestly) )*(?:wild|crazy|cool|insane|amazing|fascinating|interesting|neat|nuts|bizarre|weird|strange|awesome|incredible|mind[- ]?blowing|surprising|counter-?intuitive)|(?:(?:so|very|really) )?(?:wild|fascinating|interesting|neat)|wow|whoa|woah|til|who knew|never knew that)[.!\s]*$/i;
const reacts = (text: string): boolean => REACTS.test(spoken(text));

/**
 * The reply missed, and they said so: "that didn't answer my question", "not what I asked", "that wasn't helpful".
 * Beside Core 4's own readers of the same thing (signals.correction, feedback, tooDirect), which come first.
 */
const MISSED =
  /\b(?:(?:that|this|it|you)\s+(?:didn'?t|doesn'?t|did not|does not|don'?t)\s+(?:really\s+|actually\s+)?(?:answer|address|help|explain)\b|not what i (?:asked|meant|wanted|was asking|was looking for)\b|(?:that|this)(?:'s| is| was)\s+not\s+(?:really\s+|very\s+)?(?:helpful|useful)\b|(?:that|this)\s+(?:wasn'?t|isn'?t)\s+(?:really\s+|very\s+)?(?:helpful|useful)\b|you(?:'ve| have)?\s+(?:missed|misunderstood|misread)\b|missed the point\b)/i;

/**
 * A dispute of what was said, in so many words — "that's wrong", "that can't be right", "I disagree" — as against an
 * answer that happens to begin "no".
 */
const OBJECTS =
  /\b(?:(?:that|this|it|you)(?:'s|'re| is| are| was| were) (?:just |simply |completely |totally |plainly )?(?:wrong|incorrect|mistaken|false|not (?:right|true|correct|accurate))|(?:that|this|it) can(?:'?t|not) be (?:right|true|correct)|can(?:'?t|not) be right|not true|i (?:disagree|don'?t (?:agree|think so|buy (?:it|that)))|(?:that|this|it) doesn'?t (?:make sense|add up|follow)|that'?s not (?:how|what|why|right|true))\b/i;

/**
 * A need or a problem stated as a sentence — "I need help with my resume", "my printer will not connect", "there is
 * water coming through my ceiling". The commonest way to ask for help has no question in it.
 */
const NEEDS =
  /^(?:(?:ok(?:ay)?|so|hi|hey|hello|well|um+|please)[,.!\s]+)*(?:i (?:need|want|would like|'d like|have to|must|can'?t|cannot|can not|couldn'?t|forgot|lost|keep (?:getting|having)|was charged|locked myself|am (?:trying|looking|unable|stuck|locked))\b|i(?:'m| am|'d) (?:trying|looking|unable|stuck|locked|like)\b|(?:looking|need|needing|trying|searching|hoping) (?:for|to|a|an|some|help)\b|need \w+|help (?:me|with)\b|my \w+(?: \w+){0,2} (?:won'?t|will not|doesn'?t|does not|isn'?t|is not|keeps?|stopped|broke|never|is (?:broken|refusing|leaking|cracked|dead|down|stuck)|makes?|has (?:a|an|been|stopped))\b|the \w+(?: \w+){0,2} (?:won'?t|will not|doesn'?t|does not|isn'?t|is not|keeps?|stopped|never)\b|there(?:'s| is| are) )/i;

/**
 * Something of their own: a statement of a few words that is neither a request (in a question's form, or as a need
 * or a problem), a wish to know, a pleasantry, nor a reaction to what Socria just said.
 */
function declares(text: string): boolean {
  if (reacts(text) || NEEDS.test(spoken(text))) return false;
  return sentencesIn(spoken(text)).some((p) => !asks(p) && !smallTalk(p) && !LEAD_ONLY.test(p) && !WANTS_TO_KNOW.test(p) && wordsIn(p) >= 5);
}

const sharesTerm = (a: string, b: string, atLeast = 1): boolean => {
  const A = conceptTerms(a);
  if (!A.size) return false;
  let n = 0;
  for (const w of conceptTerms(b)) if (A.has(w) && ++n >= atLeast) return true;
  return false;
};

const UNSURE = /^(?:idk|i (?:really )?(?:don'?t|do not) know|no (?:idea|clue)|not sure|dunno|beats me|i(?:'m| am) not sure)\b/i;
/** A request in so many words, without a question mark: "can you…", "how do I…", "tell me how…". */
const REQUESTS = /^(?:(?:ok(?:ay)?|so|and|but|also|hey|anyway|right)[,\s]+)*(?:(?:can|could|would|will) (?:you|u)\b|please\b|help me\b|tell me\b|show me\b|give me\b|how (?:do|can|should) (?:i|we)\b|what(?:'s| is| are) (?:the|a|an)\b|where (?:is|are|do|can)\b)/i;
/** An either-or put back to the question: "per month or in total?", "before or after tax?". */
const EITHER = /^(?:\w+\s+){0,4}\w+\s+or\s+(?:\w+\s+){0,4}\w+\s*\?*$/i;
/** The question turned down: "I'd rather not say", "that is not important", "doesn't matter". */
const TURNED_DOWN = /^(?:(?:ok(?:ay)?|well|um+|honestly)[,\s]+)*(?:i(?:'d| would) rather not|(?:that(?:'s| is)|it(?:'s| is)) not (?:important|relevant)|(?:that )?does(?:n'?t| not) matter|not (?:relevant|important)|pass\b|no comment|prefer not to)/i;
/** They are asking what Socria's question meant: it has not been let pass, and it may need asking again in other words. */
const CLARIFY = /^(?:(?:sorry|wait|hm+|huh|um+|er+m?)[,.!?\s]+)*(?:do you mean|you mean|what do you mean|what does that mean|what(?:'s| is) that (?:mean|supposed to mean)|meaning what|in what (?:sense|way)|which (?:one|part|ones)\b|how do you mean|what\?+$|huh\?+$|sorry\?+$|pardon\b|come again|can you (?:rephrase|clarify|explain (?:that|the question|what you mean))|could you (?:rephrase|clarify)|i (?:don'?t|do not) (?:understand|get) (?:the question|what you(?:'re| are) asking|what you mean))/i;
const WAVED = /^(?:just (?:tell|give|show) me|skip (?:that|it|this)|never ?mind|doesn'?t matter|you (?:tell me|decide|pick|choose))\b/i;

/** What a message did with the question before it. */
function uptakeOf(ask: string, msg: string, s?: Pick<ExplicitSignals, 'dontKnow' | 'directness'>): Uptake {
  if (!ask) return 'none';
  if (wrapsUp(msg)) return 'closed';
  const t = spoken(msg);
  if (s?.dontKnow || UNSURE.test(t) || CLARIFY.test(t)) return 'unsure';
  if (s?.directness === 'answer' || WAVED.test(t)) return 'declined';
  if (onlyANod(msg)) return 'brief';
  // they changed the subject in so many words, or turned the question down: let pass
  if (SHIFT.test(t) || TURNED_DOWN.test(t)) return 'passed';
  // a word or three — "1789?", "please", "gross or net?" — is an answer, whatever its punctuation
  if (wordsIn(t) <= 3) return 'brief';
  // a request and nothing else, about something the question did not mention: it was let pass. Only a request in so
  // many words — a question, or "can you…", "how do I…" — and never a statement that begins with a wh-word ("when I
  // open it it closes"), an either-or back at the question ("per month or in total?"), or one that names what was
  // asked about ("which part loses you?" — "can you redo the sum?"), which are answers in a question's form.
  if (asksOnly(msg) && (/\?["'’”)\]]*\s*$/.test(t) || REQUESTS.test(t)) && !EITHER.test(t) && !sharesTerm(ask, msg)) return 'passed';
  return 'took';
}

/**
 * THEY ARE GOING — and it is read strictly, because the cost of reading it wrongly is a reply that closes on somebody
 * who was not leaving. The leave-taking has to be the WHOLE of its sentence: "ok I should go", "gotta run, thanks",
 * "I'll think about it". Never the start of one that goes on — "I need to leave my husband", "I should go see a doctor
 * about this lump", "heading out to the interview now, any last tips", "going to sleep in my car tonight" all begin
 * the same way and are not goodbyes.
 */
const LEAD_ACK = String.raw`(?:(?:ok(?:ay)?|alright|right|well|anyway|anyways|haha|lol|yeah|yep|yes|cool|nice|great|perfect|thanks|thank you|sorry|oh|ah)[,.!\s]+)*`;
const TRAIL = String.raw`(?:[,.!\s]+(?:now|soon|then|though|anyway|for now|for today|for tonight|in a (?:minute|min|bit|sec|second|moment)|sorry|lol|haha|thanks|thank you|thanks again|cheers|bye|good ?night|night|talk (?:later|soon)|see (?:you|ya)|later))*[,.!\s]*`;
const GOING = [
  String.raw`i(?:'d| had)? (?:should|have to|need to|gotta|got to|must|better)(?: really| probably)? (?:go|head (?:off|out)|get going|get back to (?:work|it)|sleep|log off|sign off)(?: to (?:bed|sleep|work|class|school|lunch|dinner))?`,
  String.raw`(?:gotta|got to|have to|need to) (?:go|run|head (?:off|out)|get going)`,
  String.raw`heading (?:out|off|to bed)`,
  String.raw`off to (?:bed|sleep|work|class|school)`,
  String.raw`time for bed`,
  String.raw`going to (?:bed|sleep)`,
  String.raw`(?:i'?ll|i will|let me|i need to|gonna|going to) (?:think (?:about|on) (?:it|this|that)|sleep on it|mull (?:it|this|that) over|come back to (?:this|it)(?: later)?)`,
  String.raw`(?:let'?s|we can) (?:stop|leave it) (?:here|there)`,
  String.raw`that'?s enough for (?:now|today|tonight)`,
];
const LEAVING = new RegExp(`^${LEAD_ACK}(?:${GOING.join('|')})${TRAIL}$`, 'i');

/**
 * Are they finishing?
 *   'close'    the message is nothing but closing talk — thanks, a goodbye, "that's all" (lib/cognition/register.ts
 *              wrapsUp) — or a leave-taking with small talk around it: one line back, and the conversation is let go;
 *   'leaving'  they said something, and then that they are going ("took me two tries. that's all for today"): what
 *              they said is answered as it would be, and nothing is asked of someone on their way out;
 *   null       anything else. In particular: a "Thanks" at the end of a message that says more is manners, not a
 *              goodbye ("My laptop will not turn on. Thanks."), a message that asks anything is not a goodbye, and
 *              there is nothing to leave before the first reply.
 */
function finishing(text: string, replied: boolean, prompted: boolean): 'close' | 'leaving' | null {
  const t = spoken(text);
  // a question is not a goodbye ("that's it?"); and after a reply that asked or offered something, "yes thanks",
  // "that's it", "night" and "let me think about it" are answers to it
  if (!t || t.includes('?') || prompted) return null;
  if (wrapsUp(text)) return 'close';
  if (wordsIn(t) > 24 || !replied) return null;
  const parts = sentencesIn(t);
  const goes = (p: string) => LEAVING.test(p) || saysGoodbye(p);
  if (parts.some((p) => asks(p) && !goes(p))) return null;
  const around = (p: string) => goes(p) || wrapsUp(p) || onlyANod(p) || smallTalk(p);
  if (parts.every(around) && parts.some(goes)) return 'close';
  return parts.length > 1 && goes(parts[parts.length - 1] ?? '') ? 'leaving' : null;
}

/** They changed the subject, and said so. */
const SHIFT =
  /^(?:(?:ok(?:ay)?|right|alright|cool|thanks|great)[,.!]?\s+)?(?:anyway|anyways|anyhow|btw|by the way|unrelated(?:ly)?|on (?:another|a different|an unrelated) note|(?:a\s+)?(?:different|another|new|separate|unrelated) (?:question|topic|thing|subject)|changing (?:the )?(?:subject|topic)|moving on|switching gears|new topic|side note)\b/i;
/** A question that leans on what was just said: "why is that?", "what about…", "so does it…", "does the same thing happen…". */
const LEANS =
  /^(?:(?:and|so|but|then|wait|hang on|hold on|ok(?:ay)?|hmm+|oh|right)[,\s]+)*(?:(?:why|how|what|when|where|who)\b[^?]{0,40}\b(?:that|this|it|those|these|they|then)\b|(?:is|does|did|would|could|can|isn'?t|doesn'?t|wouldn'?t)\s+(?:that|this|it|those|these|they|the same)\b|what about\b|how so\b|why(?: not| so)?\s*\?|meaning\s*\?|such as\s*\?|like what\s*\?|for example\s*\?|and then\s*\?)/i;

/** How many of Socria's recent replies are read for what was done with their questions. */
const WINDOW = 6;
/** Two questions let pass in a row: for this many replies after the second, none is asked. Then one may be tried again. */
const WARY_FOR = 3;

/**
 * Their part in the conversation so far, from the transcript: what they did with the questions Socria ended
 * on, whether they are bringing material of their own, whether this message follows the last reply or leaves it.
 */
export function readParticipation(history: readonly Msg[], text: string, s?: Pick<ExplicitSignals, 'dontKnow' | 'directness'>): Participation {
  const turns = [...history, { role: 'user' as const, content: text }];
  // each reply that ended on a question, with the message that followed it
  const pairs: Uptake[] = [];
  let lastReply = -1;
  let replies = 0;
  let lastAskAt = -1;
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].role !== 'assistant') continue;
    lastReply = i;
    replies++;
    const ask = closingAsk(turns[i].content);
    const next = turns.slice(i + 1).find((m) => m.role === 'user');
    if (!ask || !next) continue;
    lastAskAt = replies;
    pairs.push(uptakeOf(ask, next.content, next === turns[turns.length - 1] ? s : undefined));
  }
  const recent = pairs.slice(-WINDOW);
  // wariness lapses: after a few replies that asked nothing, a question may be tried again
  const wary = pairs.length >= 2 && pairs.slice(-2).every((u) => u === 'passed') && replies - lastAskAt < WARY_FOR;
  const last = lastReply >= 0 ? turns[lastReply].content : '';
  const ask = last ? closingAsk(last) : '';
  const uptake = uptakeOf(ask, text, s);
  const said = spoken(text);
  const contributes = declares(text) && !wrapsUp(text);
  // messages in a row that brought something of their own (this one, and theirs before Socria's last reply)
  let run = 0;
  if (contributes) {
    run = 1;
    const users = history.filter((m) => m.role === 'user');
    for (let k = users.length - 1; k >= 0 && run < 4; k--) {
      if (!declares(users[k].content)) break;
      run++;
    }
  }
  const shifts = SHIFT.test(said);
  const followUp = !!last && !shifts && asks(sentencesIn(said).pop() ?? '') && (LEANS.test(said) || sharesTerm(proseOf(last), said, 2));
  return {
    replied: lastReply >= 0,
    asked: !!ask,
    prompted: !!last && prompts(last),
    uptake,
    taken: recent.filter((u) => u === 'took' || u === 'brief' || u === 'unsure').length,
    passed: recent.filter((u) => u === 'passed').length,
    wary,
    contributes,
    run,
    followUp,
    shifts,
  };
}

// ── reading what they are after ───────────────────────────────────────

/** Asked for the pleasure of knowing — in their words. */
const CURIOUS =
  /\b(?:i wonder|i(?:'ve| have) (?:always |often |long )?wondered|(?:just |so |really |genuinely )?curious\b|out of curiosity|just wondering|been wondering|why is it that|how come\b|ever (?:notice|wonder)|what(?:'s| is) the deal with|is it true that|i (?:just )?(?:read|heard|learned|learnt|saw|found out) (?:that|about|somewhere)|fascinat\w+|blows? my mind|mind[- ]blow\w+|rabbit hole|never understood why|always thought)\b/i;
/**
 * Asked for the fun of it — by what is asked, never by how it is led into. "Random question", "silly question",
 * "dumb question" and "hypothetically" come before real questions as often as before play ("stupid question: how
 * long can someone go without water"), so none of them is evidence of anything.
 */
const FOR_FUN = /^(?:ok(?:ay)?,?\s+|so,?\s+)?(?:just )?for fun\b|\bjust for fun\b|\bin a fight\b|\bwould you rather\b|\bwho would win\b[^?]*\b(?:or|vs\.?|versus|against)\b/i;
/** Needed for something, soon: no time for where it gets interesting. */
const INSTRUMENTAL =
  /\b(?:exam|test (?:tomorrow|today|tonight|on|next|this)|quiz|midterm|finals?|homework|assignment|problem set|due (?:tomorrow|today|tonight|in|on|by)|deadline|asap|urgent(?:ly)?|quick(?:ly)?|real quick|in a (?:hurry|rush)|briefly|tl;?dr|in (?:one|a|two|a few) (?:sentence|line|word)s?|for (?:work|class|school|my (?:boss|client|manager|report|presentation|essay|thesis|paper|interview|meeting)))\b/i;
/**
 * A statement that is a request in all but form: something still wrong, something tried, a result reported —
 * "it still returns undefined", "I tried that and got 12". Said in the middle of work, it asks for the next step,
 * and a line about "telling, not asking" would be exactly wrong for it.
 */
const REPORTS =
  /\b(?:(?:doesn'?t|does not|won'?t|isn'?t|can'?t|cannot|didn'?t|did not) (?:work|run|compile|load|start|open|save|show|help|fix|go|pass)\w*|not working|no luck|errors?|fail\w*|broken|stuck|crash\w*|tried (?:that|it|this|both|again|everything)|i got (?:[-−+]?\d|an? (?:error|warning|exception)|the same|nothing)|it (?:says|gives|returns|shows|throws)|now it|same (?:thing|result|error|problem)|still (?:returns?|fails?|gets?|gives?|shows?|says|broken|wrong|not|doesn'?t|won'?t|can'?t|the same))\b/i;
/** A why about the world, rather than a how-to. */
const WHY_ASKED = /^(?:(?:ok(?:ay)?|so|and|but|wait|hmm+)[,\s]+)*(?:why|how come)\b/i;
/** A message asked for the pleasure of knowing, by its own words alone (for the turn before this one too). */
const wonders = (text: string): boolean => {
  const t = spoken(text);
  return !INSTRUMENTAL.test(t) && (CURIOUS.test(t) || WHY_ASKED.test(t));
};

/**
 * WORDS THAT MAY CARRY REAL DISTRESS. Much broader than the safety gate (lib/core4/signals.ts SAFETY), on purpose:
 * a match here does one thing — this reading stands down, and the turn is exactly what it is without it. So a false
 * positive ("my phone is dead", "kill the process") costs nothing, and a line written for somebody thinking out loud
 * ("a reaction, a connection, where you'd push") never meets somebody who said they do not want to be here.
 */
const HEAVY =
  /\b(?:die|dying|dead|death|kill(?:ed|ing|s)?|suicid\w*|(?:hurt|harm|cut)(?:ting|ing)? myself|self[- ]harm\w*|end(?:ing)? it\b|end(?:ing)? (?:my|it all)|(?:don'?t|do not) want to be (?:here|around|alive)|not be (?:here|around)|(?:can'?t|cannot) (?:do this|go on|take (?:it|this)|keep going|cope)|(?:what'?s|what is|no) (?:the )?point\b|a burden|disappear\w*|(?:if|when|once) i(?:'m| am| was| were) gone|notice if i|giv(?:e|ing) up\b|hopeless\w*|worthless\w*|hate (?:myself|my life)|empty inside|numb\b|so alone|all alone|lonel\w+|terrified|panic\w*|abus\w+|assault\w*|grie(?:f|v\w+)|funeral|miscarr\w+|diagnos\w+|relaps\w+|overdos\w*)\b/i;

/**
 * Harm, loss, illness, fear and want, in the words people use for them — wider than HEAVY, and used the same way: on
 * a match this reading stands down. Still a list, so still incomplete (see below).
 */
const GRAVE =
  /\b(?:cancer|tumou?rs?|chemo\w*|terminal|illness\w*|disease\w*|disorder\w*|hospital\w*|icu|surgery|ambulance|stroke|heart attack|seizure\w*|pain(?:s|ful|fully)?|hurts?|hurting|injur\w+|bleed\w*|wound\w*|fever|unconscious|breath(?:e|ing)|swallow\w*|poison\w*|smell (?:of )?(?:gas|smoke)|depress\w*|anxi\w+|trauma\w*|ptsd|pills?|medicat\w+|dos(?:e|es|age)|drunk|drinking|sober|addict\w*|drugs?|rap(?:e|ed|es|ing|ist)|molest\w*|harass\w*|stalk\w*|violen\w+|hit(?:s|ting)? me|beat(?:s|ing)? me|chok\w+|threat\w*|weapons?|guns?|kni(?:fe|ves)|murder\w*|died|dies|pass(?:ed)? away|passed (?:last|this|on|yesterday|in)|took (?:his|her|their) own life|put (?:\w+ ){1,2}down|lost (?:my|our|the baby|him|her)|widow\w*|orphan\w*|evict\w*|homeless\w*|nowhere to (?:go|live|stay)|laid off|fired|unemploy\w*|bankrupt\w*|debts?|afford|broke up|break ?up|divorc\w*|cheat\w*|affair|custody|left me|find me|bull(?:y|ied|ies|ying)|scared|afraid|frightened|unsafe|cry(?:ing)?|cried|sobbing|alone|no friends|nobody (?:likes|loves|cares|wants)|no ?one (?:likes|loves|cares|wants|to talk to)|pointless|meaningless|failure|terrible (?:mother|father|parent|person|friend)|ashamed|humiliat\w+|never (?:wake|been born)|not wake up|(?:don'?t|do not) want to (?:live|exist|go on)|(?:don'?t|do not) see a future|ending (?:it|things)|end things|pain to stop|can not (?:go on|do (?:it|this)|cope|stop|afford)|can'?t (?:do it|stop|afford|sleep|eat|breathe|anymore)|(?:haven'?t|have not) (?:eaten|slept)|done with (?:everything|life|it all)|tired of (?:living|life|everything)|worth (?:living|it anymore|the effort anymore)|reasons? to (?:live|go on|keep going|stay alive)|(?:meaning|point|purpose) (?:of|in|to) (?:life|living|it all|anything|any of (?:it|this))|want to (?:live|be alive|exist)|better off (?:dead|gone|without me)|(?:miss|notice|care) (?:me|if i)|hearing voices|voices telling|on purpose|locked out|spread to|the scan|a lump|war|wars|genocide|massacre|famine|starv\w+|terroris\w+|shooting|execut\w+|tortur\w+|slaver\w+|holocaust|atrocit\w+|bomb\w*|attacks?|attacked|victims?|casualt\w+|disasters?|pandemic|epidemic|plague)\b/i;
/** A farewell that sounds final — "thanks for everything", "this is goodbye". Never closed in a line. */
const FINAL =
  /\b(?:for everything|forever|for good|this is goodbye|goodbye (?:everyone|all|world|cruel world)|last (?:message|goodbye|time (?:we|you|i))|won'?t (?:be (?:around|here)|see (?:me|you) again|bother you)|hope i (?:don'?t|do not|never) wake|never (?:see|talk to|hear from) (?:me|you) again)\b/i;
/** May carry distress, by any of the three lists: the reading stands down. */
const tender = (text: string): boolean => HEAVY.test(text) || GRAVE.test(text) || FINAL.test(text);

/**
 * AND WHAT NO LIST CAN DO. "She passed last night. I was holding her hand", "we lost the baby", "he said he would
 * find me" — a list of words that carry distress is never complete. So a line that plays, pushes or adds to a reply
 * is never given merely because nothing was found wrong with a message. It needs positive evidence, in the message
 * itself, that the ground is safe: that the thought is not about the person or the people in their life
 * (impersonal), or that they marked it as light themselves (a laugh). Everything else is left exactly as it is
 * without this reading — which is where a model that can tell grief from small talk already does its own reading.
 */
/** The speaker, or somebody in their life. */
const PERSONAL =
  /\b(?:i|i'?m|i'?ve|i'?d|i'?ll|me|my|mine|myself|we|we['’]re|we'?ve|we['’]d|us|our|ours|ourselves|he|he'?s|she|she'?s|him|her|his|hers|(?:mum|mom|mam|mother|dad|father|parent|brother|sister|son|daughter|kid|child|baby|wife|husband|partner|spouse|boyfriend|girlfriend|fianc[eé]e?|ex|friend|roommate|flatmate|boss|manager|coworker|colleague|landlord|neighbou?r|doctor|therapist|teacher)s?|children|family)\b/i;
/** What leads into a thought or a question of curiosity: taken off before asking what the thought itself is about. */
const MARKER =
  /^(?:(?:ok(?:ay)?|so|and|but|well|huh|hmm+|oh|honestly|tbh|lol|haha|wait)[,:\s]+)*(?:i(?:'ve| have)? (?:(?:always|often|long|just|been|never) )*(?:wondered|wondering|thought|thinking|noticed|reali[sz]ed|read|heard|learned|learnt|found out|understood)(?: (?:that|about|somewhere|if|whether|why|how))?|i (?:(?:just|really|honestly|genuinely) )*(?:think|reckon|believe|suspect|wonder|read|heard|learned|learnt|saw)(?: (?:that|about|somewhere|if|whether|why|how))?|i(?:'m| am) (?:(?:just|so|really|genuinely) )*curious(?: (?:about|why|how|whether|if))?|(?:(?:just|so|really|genuinely) )*curious[,:]?|out of curiosity[,:]?|just wondering[,:]?|my (?:theory|take|view|hunch|guess|sense) is(?: that)?|the way i see it[,:]?|it (?:seems|feels) (?:to me )?(?:like|that)|it(?:'?s| is) (?:funny|weird|strange|interesting|wild|crazy|odd) (?:how|that)|funny (?:thing|how)|(?:random|shower) thought[,:]?|hot take[,:]?|unpopular opinion[,:]?|do you (?:think|reckon|believe)(?: that)?|what do you (?:think|make) (?:of|about)|what(?:'s| is) your (?:take|view|opinion|read) on)[,:\s]*/i;
/** A thought said out loud, by how it begins: "I've been thinking that…", "it's funny how…", "my theory is…". */
const THINKS =
  /^(?:(?:ok(?:ay)?|so|and|but|well|huh|hmm+|oh|honestly|tbh|lol|haha)[,:\s]+)*(?:i(?:'ve| have) been thinking|i was (?:just )?thinking|i (?:(?:just|really|honestly|genuinely) )*(?:think|reckon|believe|suspect)|i(?:'ve| have) (?:always thought|noticed|reali[sz]ed|come to think)|my (?:theory|take|view|hunch|sense) is|the way i see it|it (?:seems|feels) (?:to me )?(?:like|that)|it(?:'?s| is) (?:funny|weird|strange|interesting|wild|crazy|odd) (?:how|that)|funny (?:thing|how)|(?:random|shower) thought|hot take|unpopular opinion)\b/i;
/** They ask to be asked: "ask me another", "next question", "do you need any more info from me?". */
const ASKS_FOR_Q = /\b(?:ask me|next question|another (?:question|one)|quiz me|test me|any more info|anything else you need|what else do you need|do you need (?:any|anything|more))\b/i;
/** A fault reported in the form of a thought: "I think the server is down". */
const FAULT = /\b(?:down|bugs?|buggy|issues?|problems?|broken|crash\w*|fail\w*|errors?|slow|leak\w*|outage|wrong|stuck|missing|late|overdue|urgent|hacked|compromised|infected|virus|scam\w*|declined|refused|rejected|denied|rescind\w*|withdr[ae]w\w*|redundan\w*|refund\w*|charged|twice|skipped|blank|#ref|not (?:working|loading|showing)|taking so long|went (?:badly|wrong)|upset|quit|orders?|shipp\w+|arriv\w+|deliver\w*|parcel|package)\b/i;
/** A claim about the world in general, as against one about a particular thing or event: what a view to test sounds like. */
const GENERAL = /\b(?:people|everyone|everybody|nobody|no one|society|humans?|kids|the world|always|never|most|every|should|basically|overrated|underrated|better than|worse than|the best|the worst|ruin\w*|in general|generally|nowadays|these days|anymore|because|only|as you|when you|real|exist\w*|more than|less than|matters? (?:more|less))\b/i;
/** A laugh, in their own message: they marked it as light. */
const LAUGHS = /(?:^|[^a-z])(?:lol+|lmao+|rofl|(?:ha){2,}h?|he(?:he)+)(?![a-z])/i;
/** The thought itself, with what leads into it taken off. */
const claimOf = (text: string): string => spoken(text).replace(MARKER, '').trim();
/** Not about them or anyone in their life, and nothing grave in it: ground a line may push or play on. */
const impersonal = (text: string): boolean => {
  const c = claimOf(text);
  return c.length > 0 && !PERSONAL.test(c) && !tender(text);
};

/** An open question on their map that this message touches, and that Socria has not raised in the last few replies. */
function openThread(text: string, open: readonly string[], history: readonly Msg[]): string | null {
  if (!open.length) return null;
  const said = conceptTerms(text);
  if (said.size < 2) return null;
  const recent = history.filter((m) => m.role === 'assistant').slice(-3).map((m) => conceptTerms(m.content));
  for (const q of open) {
    const terms = conceptTerms(q);
    if (terms.size < 2) continue;
    let hit = 0;
    for (const w of terms) if (said.has(w)) hit++;
    if (hit / terms.size < 0.6) continue;
    // they are asking that very question now: there is nothing to connect it to
    if (hit / said.size >= 0.8) continue;
    const raised = recent.some((r) => {
      let n = 0;
      for (const w of terms) if (r.has(w)) n++;
      return n / terms.size >= 0.6;
    });
    if (!raised) return q;
  }
  return null;
}

// ── the decision ──────────────────────────────────────────────────────

export interface EngageInput {
  state: TurnState;
  signals: ExplicitSignals;
  /** the move, as the allocation left it */
  assist: AssistDecision;
  /** the conversation before this turn, oldest first */
  history: readonly Msg[];
  text: string;
  /** something is kept with them this turn (Core 4's withhold), or the Answer Guard is up */
  held?: boolean;
  /** they asked to be heard (Core 4: HUMAN_REFLECTS) */
  heard?: boolean;
  /** they handed it over in so many words: "you decide", "just write it", "just tell me" */
  handed?: boolean;
  /** the reasoning is theirs to do, or done with them (the split) */
  ownReasoning?: boolean;
  /** the decision is theirs (the split) */
  ownJudgment?: boolean;
  /** more than one person is here */
  group?: boolean;
  /** how much they asked every reply to say */
  length?: 'concise' | 'standard' | 'detailed' | null;
}

export function engageFor(i: EngageInput): Engagement {
  const { state: st, signals: s, assist } = i;
  const x = st.exchange;
  const p = readParticipation(i.history, i.text, s);
  // A question Socria owes this turn — a recall after a gap, a quiz they asked for — is not this reading's to take away.
  const owed = (assist.mode === 'ask' && assist.forced) || assist.retrieval || s.wantsQuestions || ASKS_FOR_Q.test(spoken(i.text));
  // Socria's last two questions were both let pass: questions wait a few replies (readParticipation).
  const wary = !owed && p.wary;
  const cap: 0 | 1 = wary ? 0 : 1;
  const mayAsk = assist.questions === 1 && cap === 1;
  /** without a question to spend, an invitation is a statement */
  const upTo = (inv: Invitation): Invitation => (mayAsk || inv === 'none' ? inv : 'subtle');
  const make = (strategy: EngageStrategy, invitation: Invitation, continuation: Continuation, cue: EngageCue | null, why: string, c: 0 | 1 = cap, target?: string): Engagement => ({
    strategy,
    invitation,
    continuation,
    cap: owed ? 1 : c,
    cue,
    ...(target ? { target } : {}),
    participation: p,
    reasons: [why, ...(wary ? ['wary'] : [])],
  });

  // 1. Not a conversation between two this turn: danger, or a room of several.
  if (s.safety || assist.reasons.includes('safety')) return make('direct', 'none', 'answer', null, 'safety', 1);
  if (i.group) return make('direct', 'none', 'answer', null, 'group', 1);
  // …and anything that may carry real distress, now or in their last few messages: this reading stands down, and
  // the turn is exactly what it is without it — no line, and the question budget untouched ("thanks, bye" after
  // "I can't do this any more" is not a conversation to close in a line).
  const lately = i.history.filter((m) => m.role === 'user').slice(-3);
  if (st.sensitive || s.sensitive || tender(i.text) || lately.some((m) => tender(m.content))) return make('attune', 'subtle', 'answer', null, 'tender', 1);

  // 2. They are finishing: one line back, and the conversation is let go. Or they said something and then that
  //    they are going: that is answered as it would be, and nothing is asked of someone on their way out.
  const going = x.kind !== 'task' ? finishing(i.text, p.replied, p.prompted) : null;
  if (going === 'close') return make('close', 'none', 'conclude', 'close', 'wraps-up', 0);
  if (going === 'leaving') return make('direct', 'none', 'conclude', null, 'leaving', 0);

  // 3. They asked to be heard: room, which the move already gives. Nothing is added to it.
  if (s.vent || i.heard || (assist.mode === 'space' && assist.forced)) return make('attune', 'subtle', 'invite', null, 'heard', 0);

  // 4. They asked for it straight, or handed it over: the answer, and nothing after it.
  //    (A hand-over carried from an earlier turn — Core 4 keeps "just tell me" standing for a while — is about the
  //    work: it does not make their good news a transaction. The budget it closed stays closed.)
  if ((i.handed && x.kind === 'task') || s.answersOnly || s.directness === 'answer' || p.uptake === 'declined' || assist.reasons.includes('answer-asked')) return make('direct', 'none', 'answer', null, 'straight', 0);

  // 5. Something is kept with them, or the Answer Guard is up: the lines that say so govern the turn.
  if (i.held || st.preferences.guard) return make('socratic', upTo('explicit'), 'invite', null, 'kept-with-them');

  // 6. It is not landing, or they said so: no invitations until that passes.
  if (s.frustration || s.redundancy || s.stopQuestions || st.preferences.questions === 'none') return make('direct', 'none', s.redundancy ? 'pivot' : 'answer', null, 'friction', 0);

  // 6b. It missed, and they said so — "that's not what I meant", "that didn't answer my question", "you gave it
  //     away" — or there is no time ("prod is down", "due in an hour"): the repair, or the help, is the move's.
  //     Nothing is invited; and nothing is taken from the move either, because the question that finds out what
  //     they meant may be exactly what is needed.
  if (s.correction || s.feedback === 'negative' || s.tooDirect || MISSED.test(spoken(i.text))) return make('direct', 'none', 'answer', null, 'repair');
  if (s.urgent) return make('direct', 'none', 'answer', null, 'urgent');

  /** their message before this one */
  const before = i.history.filter((m) => m.role === 'user').pop();
  const said = spoken(i.text);
  const workDomain = st.domain !== 'everyday' && st.domain !== 'creative';
  // Ground a line may push or play on (see PERSONAL): the thought is not about them or theirs, or they laughed.
  const open = impersonal(i.text);
  const light = (x.joking || LAUGHS.test(said)) && !tender(i.text);

  // 7. They pushed back on what was said: the objection is the subject, not the answer it objects to. Where
  //    Socria's last reply asked them something, only on a dispute in so many words ("that can't be right"): the
  //    register reads any message that begins "no" as pushing back, and "no, neither: my doctor told me to", "no
  //    error message, it just closes" and "no idea" are answers.
  const disputes = p.replied && OBJECTS.test(said) && !/\?\s*$/.test(said) && !/\b(?:tell me|check|see|know|wondering)\s+(?:if|whether)\b/i.test(said);
  const pleased = /\b(?:cool|wonder|makes sense|helps?|helpful|clear|great|thanks|thank you|amazing|wow|nice|awesome|got it|fine|interesting|wild)\b/i.test(said);
  const pushed = x.kind === 'disagreement' || disputes || assist.reasons.some((r) => r.startsWith('pushback:'));
  if (pushed && (disputes || (!p.prompted && !pleased))) return make('build', 'subtle', 'deepen', 'objection', 'pushback');

  // 8. Socria's last question was let pass: it is not asked again, and nothing else is asked this turn.
  if (p.uptake === 'passed' && !owed) return make('direct', 'none', p.shifts ? 'pivot' : 'answer', 'letgo', 'passed', 0);

  // A back-and-forth that is already one: they took up two of Socria's questions, or have brought something of
  // their own three messages running (two, where the exchange is itself a discussion or a brainstorm).
  const thinking = x.kind === 'discussion' || x.kind === 'brainstorm';
  const engaged = (p.uptake === 'took' && p.taken >= 2) || p.run >= (thinking ? 2 : 3);

  // 9. They took up Socria's last question with something of their own: that is answered first, whatever else
  //    the turn is read as — a task, a discussion, more news. A back-and-forth only where it is one about ideas:
  //    not on a task, not about them or theirs, and not the questions and answers of working something out.
  if (p.uptake === 'took') {
    const together = engaged && (x.kind === 'brainstorm' || (open && thinking && GENERAL.test(said) && !FAULT.test(said)));
    return make('build', upTo(together ? 'sustained' : 'subtle'), 'deepen', together ? 'together' : 'built', together ? 'back-and-forth' : 'took');
  }

  // 10. Talk.
  if (x.kind === 'social') return make('attune', 'subtle', 'answer', null, 'social');
  if (x.kind === 'playful') return make('play', 'subtle', 'explore', null, 'playful');
  if (x.kind === 'personal') {
    if (st.sensitive) return make('attune', 'subtle', 'invite', null, 'sensitive');
    // a feeling they named, one way or the other (the register reads nothing else as personal by this point)
    const up = x.saidFeeling === 'up';
    const down = x.saidFeeling === 'down';
    if (!up && !down) return make('attune', 'subtle', 'answer', null, 'personal');
    return make('attune', upTo('explicit'), 'invite', mayAsk ? (up ? 'goodnews' : 'hardday') : null, up ? 'good-news' : 'hard-day');
  }

  // 11. Thinking together: a brainstorm, a discussion, something said out loud.
  if (x.kind === 'brainstorm') {
    // "what is the name for…" and "any ideas why the page is blank" reach here too: those get the answer
    if (FAULT.test(said) || /\bwhy\b|^what(?:'s| is) (?:the|a) (?:name|word|term)\b/i.test(said) || !/\b(?:brainstorm\w*|ideas|names|ways to|options|come up with|riff|pitch\w*|concepts?)\b/i.test(said)) return make('direct', 'none', 'answer', null, 'brainstorm:plain');
    return make('build', upTo(engaged ? 'sustained' : 'explicit'), 'explore', engaged ? 'together' : 'riff', engaged ? 'back-and-forth' : 'brainstorm');
  }
  if (x.kind === 'discussion') {
    // The register reads "I feel like a complete failure" as a view too. A view is pushed on only where it is about
    // the world: where it is about them, or anyone of theirs, the turn is left as it is.
    if (!open) return make('attune', 'subtle', 'answer', null, 'personal');
    if (FAULT.test(said)) return make('direct', 'none', 'answer', null, 'fault');
    if (engaged) return make('build', upTo('sustained'), 'explore', 'together', 'back-and-forth');
    const theirs = x.reasons.includes('a-view') || (p.contributes && !x.reasons.includes('opinion'));
    if (theirs) return GENERAL.test(claimOf(i.text)) ? make('build', upTo('explicit'), 'explore', 'theirview', 'their-view') : make('direct', 'none', 'answer', null, 'view:particular');
    // "do you think the answer is 12", "do you think this email is ok to send": a check, not a debate
    if (/\d|\b(?:this|that|it|these|those|the answer|ok to|okay to|in time)\b/i.test(claimOf(i.text))) return make('direct', 'none', 'answer', null, 'view:particular');
    return make('hook', upTo('explicit'), 'explore', 'position', 'asked-view');
  }
  if (x.kind === 'conversation') {
    // "ok", "got it", "great, that's what I needed", after a reply that asked nothing: it landed, and nothing more
    // is wanted. Core 4 already reads a short close (signals.done, lib/core4/signals.ts) and that reading comes
    // first; the register's words for it (takesIn) add the ones it does not list. After a reply that asked, the
    // same words are an answer, not an ending — which is how Core 4's own use of the signal treats them.
    if ((s.done || takesIn(i.text)) && !p.prompted && p.replied) return make('close', 'none', 'conclude', 'settled', 'taken-in', 0);
    // a reaction that shows interest — "huh, I never knew that", "wow" — after a reply that asked nothing: the
    // thread is worth one more step. Once: where their last message was a reaction too, the reply before this
    // one already took that step, and feeding every "wow" is a drip, not a conversation. Not where they asked for
    // less (Concise, the answer first).
    if (reacts(i.text) && p.replied && !p.asked) {
      const spare = i.length === 'concise' || st.preferences.answerFirst;
      const again = !!before && reacts(before.content);
      // …and only where what they reacted to was asked out of curiosity, about the world: "wow" after an answer
      // about a diagnosis is not an appetite for the next surprising part
      const curious = !!before && wonders(before.content) && impersonal(before.content) && !FAULT.test(spoken(before.content));
      return make('hook', 'subtle', 'deepen', spare || again || !curious ? null : 'more', again ? 'interest:rested' : curious ? 'interest' : 'reaction');
    }
    // something of their own, said out loud — where it is not work in progress: after a request of theirs in a
    // working conversation, a statement is usually a report ("it still fails"), and what it wants is the next step.
    // "Again" and "still" in talk about the weekend are just words.
    const afterAsk = !!before && asksOnly(before.content);
    const report = REPORTS.test(said);
    const midWork = (afterAsk && (workDomain || report)) || (report && workDomain);
    // …and only on positive evidence that it is a thought to be met, not a need, a problem or a hurt in a
    // statement's form: it begins as a thought does and is not about them or theirs ("I've been thinking that
    // cities are…"), or they marked it as light themselves (a laugh). "My printer will not connect", "she passed
    // last night" and "just got back from the vet" all read as statements too, and are left as they are.
    const thought = (THINKS.test(said) && open && !FAULT.test(said) && GENERAL.test(claimOf(i.text))) || light;
    if (p.contributes && !midWork && thought) return make('build', upTo(engaged ? 'sustained' : 'explicit'), 'explore', engaged ? 'together' : 'aloud', engaged ? 'back-and-forth' : 'aloud');
    // "yes", "go on", a question about what was just said: the thread goes on
    return make('direct', 'none', p.followUp || p.uptake === 'brief' || (onlyANod(i.text) && !takesIn(i.text)) ? 'deepen' : 'answer', null, 'talk');
  }

  // 12. Work.
  const idea = st.work === 'explanation' || st.work === 'information';
  // asked for fun: a real answer, enjoyed
  if (idea && open && (FOR_FUN.test(said) || x.joking)) return make('play', 'subtle', 'answer', 'forfun', 'for-fun');
  // their own reasoning, or their own call: drawn out by the lines that already say whose it is
  if (i.ownReasoning || st.work === 'practice' || st.work === 'verification') return make('socratic', upTo('explicit'), 'invite', null, 'their-reasoning');
  if (i.ownJudgment && st.work === 'judgment') return make('socratic', upTo('explicit'), 'invite', null, 'their-call');
  // no time for where it gets interesting: said so, or they asked for an exact length (Core 4 reads both)
  const hurried = INSTRUMENTAL.test(i.text) || st.preferences.answerFirst || i.length === 'concise' || s.sentences > 0 || s.requestedTokens > 0;
  // they said they are learning it: the question that makes them use it — a prediction, a check, saying it back —
  // is the explanation engine's to plan, inside the same budget (lib/runtime/explain.ts). Nothing is added to it.
  if (st.work === 'explanation' && (s.learningGoal === true || s.practiceIntent)) return make('socratic', upTo('explicit'), 'invite', null, 'learning');
  // an earlier question of theirs that this touches
  const thread = st.progress.turns >= 4 ? openThread(i.text, st.open, i.history) : null;
  if (thread) return make('thread', 'subtle', 'deepen', 'thread', 'open-question', cap, thread);
  // asked out of curiosity — in their words, a why about the world, or a thread they keep pulling. Not two replies
  // running: where their last message was asked the same way, the last reply already ended on such a line, and one
  // on every reply is a habit, not an observation.
  if (idea && !hurried && open && !FAULT.test(said) && (CURIOUS.test(said) || (st.work === 'explanation' && WHY_ASKED.test(said)) || (p.followUp && p.taken + p.run >= 2))) {
    return before && wonders(before.content) ? make('direct', 'none', p.followUp ? 'deepen' : 'answer', null, 'curious:rested') : make('hook', 'subtle', p.followUp ? 'deepen' : 'answer', 'wonder', 'curious');
  }
  return make('direct', 'none', p.followUp ? 'deepen' : 'answer', null, 'work');
}

// ── what the reply is told ────────────────────────────────────────────
//
// One line, on the turns that have one. Each says what the moment is, on the evidence, and what would meet it
// — never words to say. `ask` is the line where one question may ship this turn; `tell`, where none may: the
// same invitation as a statement, or nothing.

const CUE: Record<EngageCue, { ask?: string; tell: string }> = {
  close: { tell: "They're finishing: close in a line, in kind — nothing new, no offer, no question." },
  settled: { tell: "It landed, and they've said so: a word back at most — add nothing, offer nothing." },
  letgo: { tell: 'They let your last question pass: do not repeat it or ask another this turn — go with what they said.' },
  objection: { tell: 'Start from their objection, at its strongest — not from your earlier answer, and do not restate it.' },
  built: { tell: 'They took up your question: answer what they actually said, before adding anything of your own.' },
  goodnews: { ask: "If you're curious about a detail of it — the one a friend would ask about — ask that. One question, or none.", tell: '' },
  hardday: { ask: "If they haven't said what happened and seem to want to talk, one gentle question about it is welcome; otherwise leave room.", tell: '' },
  position: {
    ask: "After your position, hand it back once: where you'd expect them to disagree, or what would change your mind — as a question only if you want their answer.",
    tell: "End on the part of your position you're least sure of, or what would change your mind: a statement they can push on.",
  },
  theirview: {
    ask: "They put a view forward: engage with it honestly — what you'd grant, what you'd push on — and hand back the case that tests it, or the one question that would. If it is really about how they are, answer that instead.",
    tell: "They put a view forward: engage with it honestly — what you'd grant, what you'd push on — and end on the case that tests it. If it is really about how they are, answer that instead.",
  },
  together: {
    ask: "This is a real back-and-forth now: pick up their last point, add one thing of your own, and hand it back — a thought, a case, or one question. No recap.",
    tell: "This is a real back-and-forth now: pick up their last point, add one thing of your own, and leave it with them. No recap, no question.",
  },
  riff: {
    ask: "Hand the choosing back at the end: the one you'd pull on and why, or the constraint that would sharpen the next round — one question at most.",
    tell: "End on the one you'd pull on, and why — theirs to take or to top.",
  },
  aloud: {
    ask: "They're thinking out loud, not asking: meet it like someone interested — a reaction, a connection, or where you'd push — in proportion. A question only if you want the answer. If it is really a problem to solve, or something hard for them, answer that instead.",
    tell: "They're thinking out loud, not asking: meet it like someone interested — a reaction, a connection, or where you'd push — in proportion, and leave it open. If it is really a problem to solve, or something hard for them, answer that instead.",
  },
  wonder: {
    tell: "They're asking because they want to know: after the answer, one line on where it gets strange, stops holding, or touches something unexpected — your own observation, not a question and not \"consider…\". Leave it out if there isn't a real one.",
  },
  more: {
    tell: "They reacted with interest: if there's one more thing about it genuinely worth knowing — the next surprising part, or where it shows up in their own life — give it in a line or two; otherwise a word back. No recap, no question.",
  },
  forfun: { tell: "It's asked for fun: answer it for real, with a straight face — the actual reasoning or estimate — and let the telling detail be the joke." },
  thread: { tell: 'This touches a question they left open earlier: "%s". Connect it if it truly bears on this — in a clause, never forced.' },
};

/** The inline elements that already hand the turn back: a question to work, choices to pick from, a decision laid out. */
const HANDS_BACK = new Set(['check', 'options', 'decide']);
/** The shapes that already end on what comes next: one layer down, a thread in full, open work with its ways onward. */
const ENDS_OPEN = new Set(['layer', 'deeper', 'open']);
/** The lines that add something to the end of a reply, as against saying how to take what they brought. */
const ADDS: ReadonlySet<EngageCue> = new Set(['wonder', 'more', 'position', 'riff']);
/** …and the two of them that add a closing observation of Socria's own: left out where the shape already ends open, or they asked for shorter. */
const OBSERVES: ReadonlySet<EngageCue> = new Set(['wonder', 'more']);

/**
 * The turn's line, read against everything else the reply is told this turn, so nothing is invited twice:
 *   • a write-up filed in Content is a document: no line;
 *   • where a block already hands the turn back (a check, options, a decision laid out), or the shape already ends
 *     on what comes next, nothing is added to the end;
 *   • where the explanation's plan already says they answered Socria's question, or that it landed, that line stands;
 *   • where they asked for shorter replies, no closing observation is asked for.
 * `questions` is the move's final budget — after Core 4's and MR's — and a question the explanation's plan already
 * ends on spends it: a question is only ever asked for where one may ship, and never two.
 */
export function engagementLine(e: Engagement | null | undefined, questions: 0 | 1, view: AssistView = {}): string {
  if (!e?.cue || view.place === 'content') return '';
  const forms = view.forms ?? [];
  if (ADDS.has(e.cue) && (forms.some((k) => HANDS_BACK.has(k)) || (OBSERVES.has(e.cue) && (ENDS_OPEN.has(view.shape ?? '') || view.tight)))) return '';
  if ((e.cue === 'built' && view.answered) || (e.cue === 'settled' && view.landed)) return '';
  const c = CUE[e.cue];
  const line = questions === 1 && e.cap === 1 && !view.asks && c.ask ? c.ask : c.tell;
  return e.cue === 'thread' ? line.replace('%s', (e.target ?? '').replace(/["\n]/g, ' ').slice(0, 140)) : line;
}

/** Does the turn's line ask for a closing line of the reply's own? (The shape's "then stop" then comes after it.) */
export function leavesOpen(e: Engagement | null | undefined, questions: 0 | 1, view: AssistView = {}): boolean {
  return e?.cue === 'wonder' && !!engagementLine(e, questions, view);
}

/**
 * The reading as the reply was finally allowed to act on it: with no question to spend (Core 4's budget, MR's
 * regulation, their own words), an explicit or sustained invitation is a subtle one. For the trace.
 */
export function settleEngagement(e: Engagement, questions: 0 | 1): Engagement {
  return questions === 1 || e.invitation === 'none' || e.invitation === 'subtle' ? e : { ...e, invitation: 'subtle' };
}

/**
 * Content-free: the three readings, the line, what they did with Socria's last question (`unasked`: the last reply
 * ended on a statement; `first`: there was no reply before this one), what this message brought (`own`: something of
 * their own; `follow`: a question about what Socria just said) and why. The last three are how what a reply drew can
 * be counted from the NEXT turn's line — whether it ended on a question or on a statement — without a word of the
 * conversation. Commas and colons only, so it sits inside the runtime's trace (X-Socria-Runtime, whose fields are
 * joined by semicolons).
 */
export function engageTrace(e: Engagement): string {
  const p = e.participation;
  const uptake = p.asked ? p.uptake : p.replied ? 'unasked' : 'first';
  return `${e.strategy}/${e.invitation}/${e.continuation},cue:${e.cue ?? 'none'},uptake:${uptake},cap:${e.cap},own:${p.contributes ? 1 : 0},follow:${p.followUp ? 1 : 0},why:${e.reasons.join('+')}`.slice(0, 180);
}
