// lib/mr/outcome.ts — THE COGNITIVE OUTCOME MODEL.
//
// After a decision, did it work? The answer is six separate readings
// (OUTCOME_DIMENSIONS in lib/mr/types.ts), never summed into one score,
// because they measure different things and a sum would let one stand in for
// another: a reply that pleased somebody is not one that taught them, and a
// conversation with no friction may be one where the challenge was simply
// taken away.
//
// WHAT ONE CONVERSATION CAN MEASURE, AND WHAT IT CANNOT.
//   taskCompletion   whether the reply did, structurally, what the decision
//                    asked of it (no questions, steps, answer first, short
//                    enough, …) — a check on the text, not on its quality
//   satisfaction     their stated reaction, and only that: "thanks, that
//                    helped" is satisfaction, never evidence of learning
//   friction         counts: questions the reply asked, a repeated request,
//                    their own words of complaint, turns to useful help
//   independentPerformance
//                    an attempt of theirs decided by the engine — ONLY when
//                    the decision kept the answer back, or the attempt may
//                    just repeat what they were told; a single observation,
//                    never a capability
//   retention        needs a delayed, independent check across sessions
//   autonomy         needs a study instrument
// The last two are always 'unknown' here. Unknown is a value: nothing is
// estimated to fill it.
//
// REGULATION (keep / revert / inconclusive) is for MR's own control loop —
// whether a decision stays in force — and is never reported as a claim that
// the person improved. THE PROXY GUARD: 'keep' needs the reply to have
// delivered what was asked, structurally, and no complaint after it.
// Satisfaction is never consulted for 'keep', so "thanks!" after a reply
// that did not do what the decision required cannot keep it.
//
// WHAT COUNTS AS THE ANSWER GIVEN. A reply "gave the answer" when it says
// "the answer is …" other than to confirm their attempt ("Right, the answer
// is 56. Now 7 × 9?" keeps the next one theirs), or when it states the very
// thing they then type ("so x = 4" … "x = 4"). Either way their next attempt
// is not independent performance.
//
// Content-free: refs are turn indices, roles and codes.
//
// Pure. Deterministic. No model, no network, no clock.

import { speech } from '../core4/signals';
import { englishDominant, hasFillerOpener, interrogatives, isAnnouncement, isDefinitionalOpener, pleasantryOf, questionLoad, sentencesOf } from '../core4/questions';
import { paramsFor, type StrategyParams } from './config';
import type { TurnView } from './ifr';
import type { Dimension, EvidenceRef, FrictionReading, MRDecision, Observation, ObservationCode, OutcomeVector, ReplyMeasures, TypedControls } from './types';

/** Words: whitespace-separated runs with a letter or a digit in them. Markdown bullets and lone symbols are not words. */
export function wordCount(text: string): number {
  let n = 0;
  for (const w of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(w)) n++;
  return n;
}

// ── did the reply do what the decision asked? ────────────────────────

/** The structural tests deliveredFor knows. */
export type DeliveryTest = 'no_questions' | 'one_question' | 'steps' | 'answer_first' | 'shorter' | 'worked_example' | 'execute' | 'preserve_challenge' | 'edit_as_asked' | 'verify';

/**
 * EvaluationPlan.expect codes that name a structural test, for a decision
 * whose action and controls alone do not (e.g. "show me the steps" decided as
 * strategy 'direct' with expect 'steps_delivered').
 */
export const DELIVERY_EXPECTS: Readonly<Record<string, DeliveryTest>> = Object.freeze({
  'questions=0': 'no_questions',
  'questions<=1': 'one_question',
  steps_delivered: 'steps',
  answer_first: 'answer_first',
  shorter: 'shorter',
  worked_example: 'worked_example',
  executed: 'execute',
  challenge_preserved: 'preserve_challenge',
  edit_as_asked: 'edit_as_asked',
  verification_stated: 'verify',
  // the policy's own names for the same tests (lib/mr/policy.ts RULES plans)
  asks_one: 'preserve_challenge',
  no_reveal: 'preserve_challenge',
  edits_only: 'edit_as_asked',
  says_what_was_checked: 'verify',
});

/**
 * What an explicit.revoke took back, as the ref code IFR puts on it
 * (lib/mr/ifr.ts IFR_REF_CODES): the question rules only ("you can ask me
 * questions again"), or every adjustment ("go back to how you were").
 */
export const REVOKE_SCOPE = Object.freeze({ questions: 'revoke.questions', all: 'revoke.all' } as const);

/** A numbered, bulleted or "Step n" line, markdown included: "1. …", "**1.** …", "- …", "### Step 1: …", "**Step 2:** …". */
export const STEP_LINE = /^\s*(?:#{1,6}\s+)?(?:\*\*|__)?(?:\d{1,2}[.)](?:\*\*|__)?\s|[-*•+]\s|step\s*\d+\b)/i;
/** Handing the work back where the decision said to do it. */
export const HANDS_BACK = /\b(?:let'?s think|what do you think|your turn|over to you|have a go|(?:can|could) you try|try (?:it|this|that) yourself|you try)\b/i;
/** Saying the answer out loud ("the answer is 63"; not "the answer isn't 54"). */
export const REVEALS_ANSWER = /\b(?:the (?:final |correct |right )?answer is(?!n'?t\b)(?!\s+not\b)|the solution is(?!n'?t\b)(?!\s+not\b)|the answer:\s)/i;
/** A sentence that confirms their attempt: "Right, …", "Correct!", "Yes — …". Not "good try, but …". */
const CONFIRMS = /^[\W_]*(?:yes|yep|yeah|right|correct|exactly|good|great|nice|perfect|spot on|well done|that'?s (?:right|correct|it)|you got it|you'?re right)\b(?!\s+(?:try|attempt|effort|guess|start|idea|thinking|question|direction))/i;
const BUT = /\b(?:but|however|not quite|actually|close|almost)\b/i;
/** A full rewrite where an edit was asked for. */
export const REWRITE = /\b(?:here'?s (?:a |the |your )?(?:rewrite|rewritten (?:version|draft|essay|text)|revised version|new version|polished version)|(?:a |the )?rewritten version|i(?:'ve| have) rewritten|i rewrote)\b/i;
/** Saying what was checked, or what could not be. */
export const STATES_CHECKED = /\b(?:i (?:checked|verified|confirmed|re-?ran|recomputed|could(?: not|n'?t) (?:check|verify|confirm))|checked|verified|confirmed|unverified|not verified|unchecked|not checked|(?:can'?t|cannot|couldn'?t|could not) (?:verify|confirm|check)|according to|sources?:)/i;

type Result = 'pass' | 'partial' | 'fail';

const lines = (reply: string) => reply.split('\n').filter((l) => STEP_LINE.test(l)).length;

/**
 * Every sentence that puts something to them: explicit, disguised, and a
 * check-in or offer ANYWHERE BUT THE CLOSE ("Step 1 … Does that make sense?
 * Step 2 …"). A decision that took questions away is judged on all of them:
 * a mid-reply check-in interrupts with a question, and a tail-only cap
 * cannot catch it. A closing offer of more help ("Want me to show the
 * working?") hands nothing back and is not counted — the stream gate drops
 * trailing offers anyway, so one is in a sent reply only when it was all
 * there was to send.
 */
export function questionsPutTo(reply: string): number {
  const q = interrogatives(reply);
  const close = last(reply);
  return q.explicit.length + q.disguised.length + q.offers.filter((o) => o !== close).length;
}

function first(reply: string): string {
  return sentencesOf(reply.trim())[0]?.trim() ?? '';
}

function last(reply: string): string {
  const s = sentencesOf(reply.trim());
  return s[s.length - 1]?.trim() ?? '';
}

function asksAt(sentence: string): boolean {
  return /\?["'’”)\]]*\s*$/.test(sentence) || questionLoad(sentence) > 0;
}

// ── the shape of a reply: a measure, never read by regulation ────────
//
// What a reply looked like, as counts and codes (lib/mr/types.ts
// ReplyMeasures), so two policies can be compared on the same yardstick. The
// counts are observed. Where the first thing they could act on sat, whether a
// next step or a check was offered, are ESTIMATES read off English wording:
// they are recorded, and nothing that decides or regulates reads them (there
// is no DeliveryTest for them and no observation code).

/** An opening that gives the answer: "In short, …", "The main reason is …", "Because …", "Yes, …", "It depends on …". */
export const ANSWER_MARK = /^(?:\*\*|__)?(?:(?:in short|short answer|the short answer|bottom line|tl;?dr)\b|(?:the|my) (?:short |main |real |core |biggest |simple )?(?:answer|reason|problem|issue|point|catch|key|fix|bottleneck|culprit|difference) (?:is|was|here is|:)|(?:mostly|largely|mainly|partly) because\b|because\b|it'?s because\b|(?:yes|no|yep|nope)\b[,.!—–-]|it depends on\b|you(?:'re| are) (?:right|close)\b)/i;
/**
 * The verbs a sentence opens with when it tells them what to do: the everyday
 * troubleshooting ones ("Update the driver", "Reboot the router", "Turn off
 * power saving", "Forget the network") and the working ones ("Divide both
 * sides", "Let u = x^2", "Take the derivative"). Several are nouns as well
 * ("List", "Set", "Change", "Test", "Note"): DIRECTIVE reads what follows the
 * verb before it calls the sentence one.
 */
const DO_VERB = String.raw`(?:try|use|run|back up|rerun|open|close|click|tap|go|set|add|remove|replace|change|check|install|reinstall|uninstall|start|restart|reboot|reset|update|upgrade|downgrade|disable|enable|turn|switch|forget|unplug|plug|clear|download|wait|keep|follow|drag|save|find|connect|disconnect|reconnect|let|take|rename|delete|create|write|call|ask|text|send|say|tell|email|message|reply|make|put|pick|choose|avoid|stop|type|press|select|look at|focus on|begin|swap|move|read|compare|test|measure|list|note|copy|paste|log in|sign in|log out|sign out|multiply|divide|subtract|factor|substitute|isolate|simplify|rewrite|expand|differentiate|integrate|solve|plot|draw|label|write down)`;
/**
 * An alternation of lowercase words matched with either case on each word's
 * first letter ("Update", "update"), so the rest of DIRECTIVE can tell a name
 * after the verb ("Disable IPv6") from a lowercase noun ("Set theory").
 */
const anyCase = (alts: string) => alts.replace(/(^|\(\?:|\||\s)([a-z])/g, (_m, p: string, c: string) => `${p}[${c}${c.toUpperCase()}]`);
/** A word that may follow an imperative verb directly: an object's first word, a particle, a preposition. */
const AFTER_VERB = String.raw`(?:the|a|an|your|this|that|these|those|it|its|them|each|every|all|both|any|some|one|two|three|four|five|six|ten|thirty|a few|another|other|everything|anything|something|whatever|what|which|how|where|whether|if|off|on|up|down|out|in|into|to|back|over|through|with|without|from|for|by|at|again|away|around|ahead|first|now|here|there|once|instead|and|or|as|about|after|before|until)`;
/**
 * A finite verb after the first word: the verb that opened the sentence was a
 * noun, and the two words its subject ("List comprehensions are …", "Check
 * digits catch …", "Read replicas let …", "Measure theory generalises …").
 */
const FINITE_NEXT = String.raw`(?:is|are|was|were|be|been|has|have|had|can|could|will|would|may|might|must|should|does|do|did|means?|lets?|catch(?:es)?|avoids?|var(?:y|ies)|generali[sz]es?|makes?|helps?|works?|allows?|gives?|causes?|becomes?|remains?|describes?|refers?|takes?|keeps?|tells?|shows?|needs?|depends?|requires?|returns?|stores?|holds?|happens?|matters?|exists?|serves?|stands?|comes?|goes?|gets?|seems?|tends?|appears?|differs?|grows?|leads?|decides?|determines?|controls?|defines?)`;
/** A number after the verb, then a copula: a name ("Connect four is a two-player game"), never "Take two of them". */
const NUMBER_WORD = String.raw`(?:one|two|three|four|five|six|ten|thirty)`;
/** A copula or auxiliary straight after the first word: the first word was a noun ("Change is hard", "Test results are in"). */
const NOT_OBJECT = String.raw`(?:is|are|was|were|be|been|has|have|had|can|will|would|should|could|may|might|must|does|do|did|means|mean)`;
/**
 * Something to do: "Try …", "First, open …", "Update the driver", "Turn off
 * power saving", "Let u = x^2", "You should restart it". The verb opens the
 * sentence (after an optional "first", "next", "then", …, or a clause that
 * sets it up: "To solve a quadratic, move …", "If it still drops, update …")
 * and is followed by what an instruction has next: the end of the sentence,
 * an object's first word or a particle ("Reboot the router", "Turn off …",
 * "Go into Settings"), a name ("Disable IPv6", "Open Device Manager"), a
 * variable or an expression ("Plug x = 3 back in", "Next, write du = 2x
 * dx"), a quotation or emphasis, an -ing form ("Try restarting"), or a
 * lowercase word that is not then followed by a finite verb ("Add salt to
 * taste", "Install updates.", "Use git rebase -i"). "you can / could /
 * should / need to" counts only with one of the verbs straight after it.
 * Near-misses read as no instruction: a verb-led noun phrase as the subject
 * ("List comprehensions are …", "Set theory is …", "Change is hard",
 * "Check digits catch …", "Read replicas let …", "Restart policies decide
 * …", "Find my iPhone is …", "Connect four is …"), a hyphened compound
 * ("Test-driven development …", "Start-up costs …", "Compare-and-swap …"),
 * "Let me explain", "Let us think", "Let's" and "Tell me …" (Socria
 * narrating or asking), "Just say so" (an offer), a verb with only a comma
 * after it ("Close, but …", "Wait, that is wrong"), "You can think of a
 * monad as …", "you should never use goto". A leading emoji or symbol is
 * read past (replyShape).
 */
export const DIRECTIVE = new RegExp(
  String.raw`^(?:\*\*|__)?(?:${anyCase(String.raw`(?:first|next|then|now|so|instead|finally|also|just|simply|please|after that|start by|to fix (?:it|this),?)`)}[,:]?\s+|${anyCase(String.raw`(?:to|if|when|once|after|before)`)} [^,.;:!?\n]{1,80},\s*)?${anyCase(DO_VERB)}\b` +
    String.raw`(?=\s*(?:[.!:)]|$)|\s+(?!${NUMBER_WORD}\s+${NOT_OBJECT}\b)${AFTER_VERB}\b|\s+[A-Z0-9"'“‘\x60*_(\[$]|\s+[a-z]\b|\s+[a-z]+ing\b|\s+[\w^]+\s*[=+*/^<>]|\s+(?!(?:${NOT_OBJECT}|me|us|so)\b)[a-z][\w'-]*\b(?!\s+(?:(?!(?:that|which|who|where|when|if|to|and|or|from|for|with|in|on|at|of|by)\b)[\w'-]+\s+)?${FINITE_NEXT}\b))` +
    String.raw`|\b[yY]ou (?:can|could|should|need to|'ll want to|might want to|may want to|want to|have to|'ll need to|must)\s+(?:(?:also|just|then|first|now|simply|still|try to)\s+)?${DO_VERB}\b`
);
/** A result stated: "= 42", "comes to about $30". */
export const RESULT = /=\s*-?\d|\b(?:is|equals|comes to|works out to) (?:about |roughly |approximately |exactly )?-?\$?\d/i;
/**
 * A next step named as one: "the next step", "start by", "now try …", "Next,
 * update …", "Then reboot …", "subtract 3, then divide by 2", "check this
 * first". "now", "next" and "then" count opening a clause (the start, after a
 * stop, a comma or an emoji, or after "and"): "the next set of results" and
 * "at their next turn" are no step.
 */
export const NEXT_STEP_MARK = new RegExp(
  String.raw`\b(?:next step|first step|the next (?:thing|move)|start (?:by|with)|${DO_VERB} (?:this|that|it|the \w+) (?:next|first))\b|(?:^|[.:;!?,\p{Extended_Pictographic}]\s*|\band\s+)["'“‘*_(]*(?:now|next|then|after that|finally),?\s+${DO_VERB}\b`,
  'iu'
);
/**
 * A check they can run: "check whether …", "run ping 8.8.8.8 to see whether
 * …", "open config.yaml and check whether …", "plug in a cable and see if
 * …", "if it drops too, then …", "if that works, the problem is the laptop",
 * and a sentence that opens on one ("Check that the import uses …", "Make
 * sure the cable is in"). The gap may cross a dot with no space after it (an
 * address, a file name).
 * Near-misses that stay out: "that" and "which" are not completions after a
 * verb inside a sentence ("I cannot confirm that the figure is accurate",
 * "The test which failed …", "Unit tests verify that each function …",
 * "restart the server so that it picks up …"); "see" with words between it
 * and "if" ("I can see the case for the bigger model if you need more
 * ports") or after "like to" ("I'd like to see if I remember it"); "make sure
 * you understand it" (no state to test); and a check said to be impossible
 * ("It is hard to test whether a model generalises": CANNOT_CHECK, read in
 * replyShape).
 */
export const CHECK_SUGGESTED =
  /\b(?:check|confirm|verify|test|run|look at|open|print|log|ping)\b(?:[^.?!\n]|\.(?=\S)){0,80}?\b(?:whether|if|to see)\b|(?:^|\band\s+|\bthen\s+|[,;:]\s*)see (?:if|whether)\b|^(?:\*\*|__)?(?:(?:first|then|next|now|also|and)[,:]?\s+)?(?:check|confirm|verify|double-check|make sure|ensure)\s+that\b|^(?:\*\*|__)?(?:(?:first|then|next|now|also|and)[,:]?\s+)?(?:make sure|ensure)\s+(?:the|your|it|it'?s|nothing|no|both|all|every)\b|\bif (?:it|that|this|you see|the)\b(?:[^.?!\n]|\.(?=\S)){0,80}?(?:\b(?:then|means|it['’]?s)\b|\b(?:at fault|the (?:problem|cause|culprit) is|is the (?:problem|cause|culprit))\b)/i;
/** A check said to be out of reach: "hard to test whether", "you can't check if", "no way to tell whether". */
const CANNOT_CHECK = /\b(?:hard|difficult|impossible|no way|not possible|cannot|can['’]?t|couldn['’]?t|unable)\s+(?:to\s+)?(?:check|confirm|verify|test|tell|see)\b/i;
/** A unit's leading emoji, pictographs and arrows, read past before asking whether it is an instruction (a party emoji and then "Restart the router", "→ Restart it"). Never a heading's "#" or a result's "=". */
const LEADING_SYMBOLS = /^[\s\p{Extended_Pictographic}\p{So}\u2190-\u21FF\uFE0F\u200D]+/u;

// ── a question that is not put to them (the stream gate's own reading) ──
//
// The stream gate (lib/mr/index.ts replyGate) keeps a question Socria answers
// itself and a question used as a heading, even under a hard "stop asking":
// neither is put to them. The measure reads them the same way, so a turn
// where the gate did its job does not record the question it rightly kept.
// These are the gate's tests (PUT_TO_THEM, STRONG_ANSWER, WEAK_ANSWER, TO_YOU,
// ANSWER_FORMS, ASKS_THEIR_MIND), kept here beside the measure; the gate does
// not read them from here.

/** Socria asking something of THEM ("**Should I buy the warranty?** Only if…" is not). */
const PUT_TO_THEM = /\b(?:you|your|you'?re|you'?d|you'?ll|you'?ve|yours|yourself)\b|^\W*(?:want|wanna|shall i|should i (?:make|send|write|draw|show|give|put|walk|do) (?:you|that|it|one)|let me know|does that|is that|sound good|ready|any questions)\b/i;
const ANSWER_LABEL = String.raw`(?:\*\*|__)?(?:(?:a|answer)\s*[:.)]\s*(?:\*\*|__)?\s*)?`;
/** The next unit answers in so many words: "Yes, if …", "No, …", "Only if …", "Because …", "It depends." */
const STRONG_ANSWER = new RegExp(String.raw`^\s*${ANSWER_LABEL}(?:\*\*|__)?(?:yes|no|yep|nope|nah|only(?: if| when| with| for| on| in| after| before| until| by| up to| at| the)?|not (?:really|usually|much|if|always|necessarily|at all|for|unless|quite|by much|until|before|yet)|because|that depends|it depends|depends|in most cases|for most)\b`, 'i');
/** An adverb that answers standing as one: "Usually, yes.", "Usually not." */
const WEAK_ANSWER = new RegExp(String.raw`^\s*${ANSWER_LABEL}(?:\*\*|__)?(?:usually|probably|possibly|definitely|absolutely|generally|mostly|rarely|never|always|sometimes|often)\b(?=\s*(?:[,.;:!—–-]|$|(?:yes|no|not|so)\b))`, 'i');
const TO_YOU = /\b(?:you|your|you'?re|you'?d|you'?ll|you'?ve|yours|yourself)\b/i;
/** Forms that answer only the question they fit ("Is it safe…? It is, until 36 weeks."), never one put to "you". */
const ANSWER_FORMS: [RegExp, RegExp][] = [
  [new RegExp(String.raw`^\s*${ANSWER_LABEL}(?:it (?:is|does|can|will|was|might|should|isn'?t|doesn'?t|can'?t|won'?t)|it'?s)\b`, 'i'), /\b(?:is|does|can|will|was|would|should|could|might|did|isn'?t|doesn'?t) (?:it|this|that)\b|^\W*(?:what|which|who|how (?:much|long|many|big|far|often|old))\b/i],
  [/^\s*(?:\*\*|__)?they (?:do|don'?t|can|can'?t|are|aren'?t|will|won'?t)\b/i, /\b(?:they|these|those|them)\b|\b(?:do|are|can|will|should|would) (?:the |most |all |some )?[a-z]+s\b/i],
  [/^\s*(?:\*\*|__)?there (?:is|are|isn'?t|aren'?t)\b/i, /\b(?:is|are) there\b/i],
];
/** A question about THEIR mind, which only they can answer, whatever follows it. */
const ASKS_THEIR_MIND = /\byou(?:'re|'d|'ll|'ve)?\s+(?:really\s+|still\s+|actually\s+|already\s+|even\s+|personally\s+)?(?:feel|think|prefer|want|wanna|like|love|wish|reckon|mean|plan|hope|expect|imagine|guess|remember|agree|mind|care|believe|decide|sure|ready|comfortable|happy|okay|ok|worried|excited|interested|considering|leaning|planning)\b|\bhow (?:are|do) you\b|\byour (?:take|view|views|opinion|thoughts|preference|preferences|budget|goal|goals|plan|plans|timeline|situation|experience|level|sense|gut|feeling|feelings|reason|reasons|priority|priorities)\b/i;
/** "Because…" opening the next unit: an answer to a question about the world, the reason for one put to them. */
const BECAUSE = new RegExp(String.raw`^\s*${ANSWER_LABEL}(?:\*\*|__)?because\b`, 'i');
/** A markdown heading line ("## Why does this happen?"): a label, never a question put to them. */
const HEADING_LINE = /^\s*#{1,6}\s/;
/** A line that is all emphasis ("**Why does this happen?**"). */
const BOLD_LINE = /^\s*(?:\*\*[^*\n]+\*\*|__[^_\n]+__)\s*[:.]?\s*$/;
/** Emphasis off, as the gate reads a sentence: "**What is your budget?**" is a question. */
const unemphasised = (s: string) => s.replace(/\*\*|__/g, '');
const plainOf = (s: string) => unemphasised(s).trim();
/**
 * The next unit answers the question (STRONG / WEAK answer, or a form that fits a question not put to "you"); never a
 * question about their mind, and never a question put to them that the next unit gives the reason for ("Can you tell
 * me which router you have? Because the steps differ by brand."). The gate keeps that one with its "Because…", so as
 * not to leave a reason for nothing; the measure counts it, as what it is: a question put to them.
 */
function answeredBy(q: string, next: string): boolean {
  const a = plainOf(next);
  const asked = plainOf(q);
  if (!a) return false;
  if (BECAUSE.test(a) && TO_YOU.test(asked)) return false;
  if (STRONG_ANSWER.test(a)) return true;
  if (ASKS_THEIR_MIND.test(asked)) return false;
  if (WEAK_ANSWER.test(a)) return true;
  return !TO_YOU.test(asked) && ANSWER_FORMS.some(([form, fits]) => form.test(a) && fits.test(asked));
}

/** The opening of a reply replyShape reads: a longer reply is measured on its first 12000 characters. */
const SHAPE_CHARS = 12000;
/** A fenced code block (``` or ~~~), closed or cut off at the end. */
const FENCE = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g;
/** What a fenced block becomes: one unit, whatever is in it. */
const CODE_UNIT = '```code```';
/** Inline code on one line: `x ?? y`. */
const INLINE_CODE = /`[^`\n]*`/g;

/** The fields of ReplyMeasures read off the reply alone. */
type ReplyShape = Required<
  Pick<
    ReplyMeasures,
    | 'words'
    | 'sentences'
    | 'paragraphs'
    | 'questions'
    | 'explicitQuestions'
    | 'opensWithQuestion'
    | 'wordsBeforeQuestion'
    | 'openerSentences'
    | 'steps'
    | 'code'
    | 'english'
    | 'firstActionable'
    | 'wordsBeforeActionable'
    | 'paragraphsBeforeActionable'
    | 'nextStep'
    | 'checkSuggested'
  >
>;

/** A unit that only opens: reassurance, an announcement, a textbook definition, a pleasantry. */
const opensOnly = (unit: string) => hasFillerOpener(unit) || isAnnouncement(unit) || isDefinitionalOpener(unit) || pleasantryOf(unit) !== null;

type ShapeUnit = { text: string; code: boolean; words: number; asks: boolean; paragraph: number; label: boolean };

/**
 * The reply read as replyShape reads it: its units in order, the paragraphs and step lines, what asks but is not put
 * to them (a label, a question the next unit answers), and the reply as put to them — no code (closed or cut off by
 * the ceiling), no labels, no question it answers itself. One reading for the shape and for afterReply's count.
 */
function shapeUnits(reply: string): { text: string; code: boolean; units: ShapeUnit[]; paragraphs: number; steps: number; puts: (u: ShapeUnit) => boolean; asked: string } {
  const text = reply.slice(0, SHAPE_CHARS);
  const code = text.includes('```') || text.includes('~~~');
  type Unit = ShapeUnit;
  const units: Unit[] = [];
  /** every line read, in order, with the units it gave (to rebuild the reply without what is not put to them) */
  const lineUnits: { raw: string; units: Unit[]; blockEnd: boolean }[] = [];
  let paragraphs = 0;
  let steps = 0;
  for (const block of text.replace(FENCE, CODE_UNIT).split(/\n\s*\n/)) {
    if (!/[\p{L}\p{N}]/u.test(block)) continue;
    for (const line of block.split('\n')) {
      if (!line.trim()) continue;
      const step = STEP_LINE.test(line);
      if (step) steps++;
      // a heading, or a line all in emphasis not addressed to them, is a label: what it asks is not put to them
      const label = HEADING_LINE.test(line) || (BOLD_LINE.test(line) && !PUT_TO_THEM.test(plainOf(line)));
      const here: Unit[] = [];
      // (a "?" or a full stop in inline code ends no sentence and asks nothing: "Use the `a ? b : c` form here.")
      const read = line.replace(INLINE_CODE, (m) => m.replace(/[?!.]/g, '·'));
      for (const raw of step ? [read] : sentencesOf(read)) {
        const t = raw.trim();
        // a unit with no letter or digit in it (a table separator, a rule, "$$") is no sentence
        if (!t || !/[\p{L}\p{N}]/u.test(t)) continue;
        const isCode = t === CODE_UNIT;
        const u: Unit = { text: t, code: isCode, words: isCode ? 0 : wordCount(t), asks: !isCode && asksAt(unemphasised(t)), paragraph: paragraphs, label };
        units.push(u);
        here.push(u);
      }
      lineUnits.push({ raw: line, units: here, blockEnd: false });
    }
    if (lineUnits.length) lineUnits[lineUnits.length - 1].blockEnd = true;
    paragraphs++;
  }
  // what asks but is not put to them: a label, or a question the next unit answers
  const notPut = new Set<Unit>();
  units.forEach((u, i) => {
    if (!u.asks) return;
    const next = units[i + 1];
    if (u.label || (next && !next.code && answeredBy(u.text, next.text))) notPut.add(u);
  });
  const puts = (u: Unit) => u.asks && !notPut.has(u);
  // the reply as put to them: no code, no labels, no question it answers itself (a line untouched stays as written)
  const asked = lineUnits
    .map((l) => {
      const kept = l.units.filter((u) => !u.code && !notPut.has(u));
      const body = kept.length === l.units.length && !l.units.some((u) => u.code) ? l.raw : kept.map((u) => u.text).join(' ');
      return unemphasised(body) + (l.blockEnd ? '\n\n' : '\n');
    })
    .join('');
  return { text, code, units, paragraphs, steps, puts, asked };
}

/** The reply as put to them (shapeUnits): what afterReply counts the questions on under a precision policy. */
export function putToThem(reply: string): string {
  return shapeUnits(reply).asked;
}

/**
 * The shape of a reply, as ints, booleans and enum codes: no word of it is
 * kept. Pure, over at most 12000 characters.
 *
 * A reply is read as UNITS in order: a step line ("1. …", "- …", "Step 2: …")
 * is one unit, any other line is split into sentences, and a fenced code
 * block is one unit. A line with no letter or digit (a table's "|---|---|", a
 * "---" rule, a "$$" fence) is no unit. `sentences` counts the units that are
 * not code; `paragraphs` the blank-line blocks with a letter or a digit in
 * them.
 *
 * What is put to them, read as the stream gate reads it: `questions` counts
 * what is put to them as the delivery tests do (questionsPutTo), and
 * `explicitQuestions` the sentences that end in a question mark, both on the
 * reply with its code blocks taken out (``` or ~~~, closed or cut off by the
 * ceiling: a "?" in code asks nothing, inline code too) and without a question
 * that is not put to them —
 * a markdown heading ("## Why does this happen?"), a line all in emphasis
 * that is not addressed to them ("**Why does the cache go stale?**"), and a
 * question the next unit answers ("Why does the cache serve old data?
 * Because …", "Is it safe? It is, until …"). Emphasis is read past, as the
 * gate reads it ("**What is your budget?**" is a question). A question about their own mind
 * or things stays theirs whatever follows it ("How do you feel about that?
 * It is about 4800 a year."), and so does one put to them that the next unit
 * gives the reason for ("Can you tell me which router you have? Because the
 * steps differ by brand.": the gate keeps it, the measure counts it). `opensWithQuestion` and `wordsBeforeQuestion`
 * (-1: none) read the first unit that puts anything to them, a closing offer
 * included.
 *
 * Estimates: `firstActionable` is the index of the first unit that neither
 * only opens nor asks and gives something to act on (an answer mark, a
 * directive, a result, a named next step, a step line, code). -1 when there is
 * none, -2 when the reply is unreadable — not English, only code, or no
 * letter or digit at all (an emoji): unreadable is not absent, and a reply
 * with no prose is not English. `wordsBeforeActionable` and
 * `paragraphsBeforeActionable` carry the same -1 and -2. `nextStep` and
 * `checkSuggested` are 'unknown' when the reply is not English or has fewer
 * than 3 words outside code.
 */
export function replyShape(reply: string): ReplyShape {
  const { text, code, units, paragraphs, steps, puts, asked } = shapeUnits(reply);
  const prose = units.filter((u) => !u.code);
  const proseWords = prose.reduce((n, u) => n + u.words, 0);
  // no unit at all (an emoji, symbols): nothing in it is English
  const english = units.length > 0 && englishDominant(prose.map((u) => u.text).join(' '));
  const wordsBefore = (at: number) => units.slice(0, at).reduce((n, u) => n + u.words, 0);

  const asking = units.findIndex(puts);
  let openerSentences = 0;
  while (openerSentences < Math.min(5, units.length) && !units[openerSentences].code && opensOnly(units[openerSentences].text)) openerSentences++;

  let firstActionable = -1;
  if (!english || (units.length > 0 && prose.length === 0)) firstActionable = -2;
  else {
    firstActionable = units.findIndex((u) => {
      if (u.code) return true;
      if (u.asks || opensOnly(u.text)) return false;
      return STEP_LINE.test(u.text) || ANSWER_MARK.test(u.text) || DIRECTIVE.test(u.text.replace(LEADING_SYMBOLS, '')) || RESULT.test(u.text) || NEXT_STEP_MARK.test(u.text);
    });
  }
  const unreadable = !english || proseWords < 3;
  const said = (test: (t: string) => boolean): 'yes' | 'no' | 'unknown' => (unreadable ? 'unknown' : prose.some((u) => test(u.text)) ? 'yes' : 'no');

  return {
    words: wordCount(text),
    sentences: prose.length,
    paragraphs,
    questions: questionsPutTo(asked),
    explicitQuestions: interrogatives(asked).explicit.length,
    opensWithQuestion: units.length > 0 && puts(units[0]),
    wordsBeforeQuestion: asking < 0 ? -1 : wordsBefore(asking),
    openerSentences,
    steps,
    code,
    english,
    firstActionable,
    wordsBeforeActionable: firstActionable < 0 ? firstActionable : wordsBefore(firstActionable),
    paragraphsBeforeActionable: firstActionable < 0 ? firstActionable : units[firstActionable].paragraph,
    nextStep: said((t) => NEXT_STEP_MARK.test(t)),
    checkSuggested: said((t) => CHECK_SUGGESTED.test(t) && !CANNOT_CHECK.test(t)),
  };
}

/**
 * Does the reply give the answer away? "The answer is …" counts unless the
 * sentence (or a short one right before it) confirms their attempt — a quiz
 * reply that says "Right, the answer is 56. Now, what is 7 × 9?" kept the
 * open question theirs. "Not quite — the answer is 63" gave it away.
 */
export function revealsAnswer(reply: string): boolean {
  const ss = sentencesOf(reply.trim()).map((x) => x.trim());
  return ss.some((x, i) => {
    if (!REVEALS_ANSWER.test(x)) return false;
    const confirms = (y: string) => CONFIRMS.test(y) && !BUT.test(y);
    return !(confirms(x) || (i > 0 && wordCount(ss[i - 1]) <= 4 && confirms(ss[i - 1])));
  });
}

/** Their attempt, as compared with the reply: lowercase, no spaces, no closing punctuation. */
const squash = (x: string) => x.toLowerCase().replace(/\s+/g, '').replace(/[.!?,;]+$/, '');

/**
 * Did the reply state the very thing they then typed? Only for a short
 * attempt with a digit or an operator in it (a number, an expression, an
 * equation), and only where the reply gives it as a result: after "=",
 * "is" or ":", or the whole equation ("so x = 4" … "x = 4"). Copying it back
 * is not an independent attempt.
 */
export function attemptStatedIn(reply: string, attempt: string): boolean {
  const a = squash(speech(attempt));
  if (!a || a.length > 60 || !/[\d=+*/^√]/.test(a)) return false;
  const r = squash(reply);
  if (a.includes('=')) return r.includes(a);
  return ['=', 'is', ':'].some((p) => r.includes(p + a));
}

/** The tests that apply to this decision, from its action, its controls and its expectations. */
function testsFor(d: MRDecision): DeliveryTest[] {
  const c = d.controls;
  const t = new Set<DeliveryTest>();
  if (c.questionBudget?.max === 0) t.add('no_questions');
  if (c.questionBudget?.max === 1 && d.action === 'fewer_questions') t.add('one_question');
  if (c.answerFirst || d.action === 'direct') t.add('answer_first');
  if (d.action === 'shorter' || c.verbosity) t.add('shorter');
  if (d.action === 'worked_example' || c.strategy === 'worked_example') t.add('worked_example');
  if (d.action === 'execute' || c.strategy === 'execute') t.add('execute');
  if (d.action === 'preserve_challenge' || c.strategy === 'preserve_challenge' || c.noRevealAnswers) t.add('preserve_challenge');
  if (c.strategy === 'edit_as_asked') t.add('edit_as_asked');
  if (d.action === 'verify' || c.verification === 'explicit') t.add('verify');
  for (const e of d.evaluationPlan?.expect ?? []) if (DELIVERY_EXPECTS[e]) t.add(DELIVERY_EXPECTS[e]);
  // preserve_challenge allows one question; no_questions would contradict it.
  if (t.has('preserve_challenge')) t.delete('no_questions');
  return [...t];
}

function run(test: DeliveryTest, d: MRDecision, reply: string, params: StrategyParams): Result {
  switch (test) {
    case 'no_questions':
      return questionsPutTo(reply) === 0 ? 'pass' : 'fail';
    case 'one_question':
      return questionsPutTo(reply) <= 1 ? 'pass' : 'fail';
    case 'steps':
      return lines(reply) >= 2 ? 'pass' : 'fail';
    case 'answer_first': {
      const f = first(reply);
      return f && !asksAt(f) ? 'pass' : 'fail';
    }
    case 'shorter': {
      // Words ≈ 0.75 × tokens; the decision's own ceiling, else its policy's.
      const ceiling = d.controls.verbosity?.ceilingTokens ?? params.shorterCeiling;
      return wordCount(reply) <= ceiling * 0.75 ? 'pass' : 'fail';
    }
    case 'worked_example': {
      // Numbered steps, or worked in plain words — the instruction asks for
      // "step by step in plain words" — with at least two sentences that do a
      // step of the working ("7 × 4 doubled is 56", "6 × 10 minus 6"). An
      // explanation with no working in it is partial: not what was asked,
      // not nothing either (it is not rolled back on that alone).
      if (lines(reply) >= 2 && /=|\bstep\b/i.test(reply)) return 'pass';
      const working = sentencesOf(reply).filter((x) => /\d\s*(?:[=+\-*/^×÷]|times|minus|plus|divided by|doubled|halved)|[=×÷]\s*\d/i.test(x)).length;
      if (working >= 2) return 'pass';
      return sentencesOf(reply).filter((x) => wordCount(x) >= 5).length >= 3 ? 'partial' : 'fail';
    }
    case 'execute': {
      // A closing offer ("Want me to show the working?") is not handing the
      // task back — the task is done — as it is not a question for
      // no_questions either.
      const l = last(reply);
      const offer = !!l && interrogatives(l).offers.length > 0;
      return l && (offer || !asksAt(l)) && !HANDS_BACK.test(reply) ? 'pass' : 'fail';
    }
    case 'preserve_challenge': {
      if (revealsAnswer(reply)) return 'fail';
      const n = questionLoad(reply);
      // Kept the answer back but either posed nothing or asked more than one: half done.
      return n === 1 ? 'pass' : 'partial';
    }
    case 'edit_as_asked':
      return REWRITE.test(reply) ? 'fail' : 'pass';
    case 'verify':
      return STATES_CHECKED.test(reply) ? 'pass' : 'fail';
  }
}

/** Each structural test the decision implies, and how the reply did on it. Exported for the Integrity Monitor's task_regression. */
export function deliveryChecks(decision: MRDecision, reply: string, params: StrategyParams = paramsFor(decision.policyVersion)): { test: DeliveryTest; result: Result }[] {
  const empty = !reply.trim();
  return testsFor(decision).map((test) => ({ test, result: empty ? 'fail' : run(test, decision, reply, params) }));
}

function verdictOf(checks: readonly { result: Result }[]): 'delivered' | 'partial' | 'not_delivered' | 'unknown' {
  if (!checks.length) return 'unknown';
  if (checks.every((c) => c.result === 'pass')) return 'delivered';
  if (checks.every((c) => c.result === 'fail')) return 'not_delivered';
  return 'partial';
}

/**
 * Did the reply do what the decision asked of it? Structural only: every
 * applicable test passed → 'delivered'; every one failed → 'not_delivered';
 * otherwise 'partial'. 'unknown' when no structural test exists for the
 * decision (a 'none', 'simplify' or 'more_scaffolding' decision has none:
 * whether a text is simpler is not a structural fact).
 */
export function deliveredFor(decision: MRDecision, reply: string): 'delivered' | 'partial' | 'not_delivered' | 'unknown' {
  return verdictOf(deliveryChecks(decision, reply));
}

// ── the outcome of a decision ────────────────────────────────────────

export interface OutcomeInput {
  decision: MRDecision;
  /**
   * The controls actually in force when the reply was written, when they
   * differ from the decision's own (it was one member of a composition): the
   * structural tests judge the reply against these. Everything else — what
   * their words revoke, what contradicts it — is about the decision itself.
   */
  enforced?: TypedControls;
  /** the questions in that reply were the content they asked for (a list, a draft to somebody): no question test applies */
  questionsWereContent?: boolean;
  /** the reply that followed the decision's turn */
  reply: string | null;
  /** their next turn, if it exists */
  next: TurnView | null;
  /** observeTurn at the next turn */
  nextObservations: readonly Observation[];
  params: StrategyParams;
}

/** Their own words of complaint, read from the next turn's observations. */
export const OUTCOME_COMPLAINTS: readonly ObservationCode[] = ['explicit.shorter', 'explicit.stop_questions', 'explicit.frustration', 'explicit.confused', 'explicit.negative'];

const unknown = <T>(note: string): Dimension<T> => ({ value: 'unknown', provenance: 'none', refs: [], note });

const keepsAnswerBack = (d: MRDecision) => !!d.controls.noRevealAnswers || d.action === 'guided_discovery' || d.action === 'preserve_challenge';
const keepsQuestions = (d: MRDecision) => keepsAnswerBack(d) || d.controls.strategy === 'guided' || d.controls.strategy === 'preserve_challenge';
const lowersQuestions = (d: MRDecision) => d.controls.questionBudget?.max === 0 || d.action === 'fewer_questions' || !!d.controls.questionWindow;
const shortens = (d: MRDecision) => d.action === 'shorter' || !!d.controls.verbosity;

/**
 * An explicit preference at the next turn that says the decision went the
 * wrong way: asking for questions or a quiz after MR lowered questions; for
 * more length after MR shortened; for the answer or the steps after MR gave a
 * locating question or one step instead (and no questions after the
 * question); for the answer, the steps, or no questions after MR held the
 * answer back. Returns the code that contradicts, or null.
 */
export function contradictingPreference(decision: MRDecision, next: ReadonlySet<ObservationCode>): ObservationCode | null {
  if (lowersQuestions(decision)) {
    if (next.has('explicit.wants_questions')) return 'explicit.wants_questions';
    // a quiz asked for together with the answer is not a wish to be asked (MR acts on neither, and their stop stands)
    if (next.has('explicit.quiz') && !next.has('explicit.direct_answer')) return 'explicit.quiz';
  }
  if (shortens(decision) && next.has('explicit.longer')) return 'explicit.longer';
  // A locating question or a single step hands over less than the whole answer: asking for the answer or the steps
  // after one says it went the wrong way, and so does "stop asking" after the question. A next step asks nothing, so
  // their stop does not contradict it.
  const handsOverLess = decision.controls.strategy === 'diagnose' || decision.controls.strategy === 'next_step';
  if (handsOverLess) {
    if (next.has('explicit.direct_answer')) return 'explicit.direct_answer';
    if (next.has('explicit.show_steps')) return 'explicit.show_steps';
    if (decision.controls.strategy === 'diagnose' && next.has('explicit.stop_questions')) return 'explicit.stop_questions';
  }
  if (keepsQuestions(decision)) {
    if (next.has('explicit.direct_answer')) return 'explicit.direct_answer';
    // "show me the steps" in a quiz is asking for the solution (the policy's
    // quiz rule is revoked by it too)
    if (next.has('explicit.show_steps')) return 'explicit.show_steps';
    if (next.has('explicit.stop_questions')) return 'explicit.stop_questions';
  }
  return null;
}

/**
 * Does their revocation take THIS decision back? "Go back to how you were"
 * takes back everything; "you can ask me questions again" takes back only a
 * decision that lowered questions — not a "keep it short" or a quiz. A
 * revocation without a scope ref (not read by IFR) is read as everything.
 */
function revokes(d: MRDecision, next: readonly Observation[]): boolean {
  const r = next.find((o) => o.code === 'explicit.revoke');
  if (!r) return false;
  const questionsOnly = r.refs.some((x) => x.code === REVOKE_SCOPE.questions) && !r.refs.some((x) => x.code === REVOKE_SCOPE.all);
  return !questionsOnly || lowersQuestions(d);
}

/**
 * What decided the regulation reading, as a code — for the State Engine's
 * endReason, and to tell a revert their own words caused (an 'explicit.*'
 * code: the decision is REVOKED) from one the outcome caused
 * ('delivery.not_delivered': it is ROLLED BACK). 'delivery.delivered' for a
 * keep; null when inconclusive.
 */
export function regulationCause(i: OutcomeInput): string | null {
  return regulate(i).cause;
}

interface Regulated {
  regulation: OutcomeVector['regulation'];
  cause: string | null;
  delivered: 'delivered' | 'partial' | 'not_delivered' | 'unknown' | null;
  codes: Set<ObservationCode>;
  complaints: ObservationCode[];
  repeats: number;
}

function regulate(i: OutcomeInput): Regulated {
  const d = i.decision;
  const codes = new Set<ObservationCode>(i.next ? i.nextObservations.map((o) => o.code) : []);
  const judged = i.enforced ? { ...d, controls: i.enforced } : d;
  const checks = i.reply === null ? [] : deliveryChecks(judged, i.reply, i.params).filter((c) => !(i.questionsWereContent && (c.test === 'no_questions' || c.test === 'one_question')));
  const delivered = i.reply === null ? null : verdictOf(checks);
  const complaints = OUTCOME_COMPLAINTS.filter((c) => codes.has(c));
  const repeats = i.next ? i.nextObservations.filter((o) => o.code === 'observed.repeated_request').length : 0;
  const base = { delivered, codes, complaints, repeats };
  // Revert on their word or a failed delivery; keep only on a delivered
  // reply with nothing said against it; otherwise wait. Satisfaction is not
  // read here at all — that is the proxy guard.
  if (i.next && revokes(d, i.nextObservations)) return { ...base, regulation: 'revert', cause: 'explicit.revoke' };
  if (codes.has('explicit.negative')) return { ...base, regulation: 'revert', cause: 'explicit.negative' };
  const against = contradictingPreference(d, codes);
  if (against) return { ...base, regulation: 'revert', cause: against };
  if (delivered === 'not_delivered') return { ...base, regulation: 'revert', cause: 'delivery.not_delivered' };
  if (i.next && delivered === 'delivered' && complaints.length === 0 && repeats === 0) return { ...base, regulation: 'keep', cause: 'delivery.delivered' };
  return { ...base, regulation: 'inconclusive', cause: null };
}

/**
 * Read the outcome of one decision from the reply that followed it and the
 * turn of theirs after that. Without a next turn, everything that rests on
 * their reaction is 'unknown', and regulation is 'inconclusive' unless the
 * reply itself failed every structural test (then 'revert': that needs no
 * reaction to see).
 */
export function evaluateOutcome(i: OutcomeInput): OutcomeVector {
  const d = i.decision;
  const at = d.issuedAtTurn;
  const next = i.next;
  const { regulation, delivered, codes, complaints, repeats } = regulate(i);
  const nextRef = (code: string): EvidenceRef => ({ turn: next!.index, role: 'user', code });

  // taskCompletion — structural, on the reply
  let taskCompletion: OutcomeVector['taskCompletion'];
  if (delivered === null) taskCompletion = unknown('no_reply');
  else if (delivered === 'unknown') taskCompletion = unknown('no_structural_test');
  else taskCompletion = { value: delivered, provenance: 'observed', refs: [{ turn: at, role: 'assistant', code: `delivery.${delivered}` }] };

  // satisfaction — their stated reaction, nothing else. Silence is not
  // neutrality: with no word either way it is unknown.
  let satisfaction: OutcomeVector['satisfaction'];
  if (!next) satisfaction = unknown('no_next_turn');
  else if (codes.has('explicit.negative')) satisfaction = { value: 'negative', provenance: 'explicit', refs: [nextRef('explicit.negative')], note: 'satisfaction_is_not_learning' };
  else if (codes.has('explicit.positive')) satisfaction = { value: 'positive', provenance: 'explicit', refs: [nextRef('explicit.positive')], note: 'satisfaction_is_not_learning' };
  else satisfaction = unknown('no_stated_reaction');

  // friction — counts over the reply and their next turn
  let friction: OutcomeVector['friction'];
  if (i.reply === null) friction = unknown('no_reply');
  else if (!next) friction = unknown('no_next_turn');
  else {
    const asked = questionsPutTo(i.reply);
    const value: FrictionReading = {
      questionsAsked: asked,
      repeatRequests: repeats,
      complaints: complaints.length,
      turnsToUseful: delivered === 'delivered' ? 0 : delivered === 'not_delivered' ? 1 : null,
    };
    const refs: EvidenceRef[] = [{ turn: at, role: 'assistant', code: `questions.${asked}` }];
    for (const c of complaints) refs.push(nextRef(c));
    if (repeats) refs.push(nextRef('observed.repeated_request'));
    friction = { value, provenance: 'observed', refs };
  }

  // independentPerformance — an engine-decided attempt, only where the answer
  // was kept back (and the reply did not give it anyway: said "the answer
  // is", or stated the very thing they then typed).
  let independentPerformance: OutcomeVector['independentPerformance'];
  const given = i.reply !== null && (revealsAnswer(i.reply) || (!!next && attemptStatedIn(i.reply, next.text)));
  // (a next step hands over one step, not the answer: what they do with it next is theirs, unless the reply gave it)
  if ((!keepsAnswerBack(d) && d.controls.strategy !== 'next_step') || given) independentPerformance = unknown('answer_may_have_been_given');
  else if (!next) independentPerformance = unknown('no_next_turn');
  else {
    const right = codes.has('observed.verified_correct');
    const wrong = codes.has('observed.verified_incorrect');
    if (right === wrong) independentPerformance = unknown(right ? 'mixed_verdicts' : 'no_decided_attempt');
    else {
      const code = right ? 'observed.verified_correct' : 'observed.verified_incorrect';
      independentPerformance = { value: right ? 'verified_correct' : 'verified_incorrect', provenance: 'observed', refs: [nextRef(code)], note: 'single_observation_not_capability' };
    }
  }

  return {
    interventionId: d.interventionId,
    turn: next ? next.index : at,
    taskCompletion,
    satisfaction,
    friction,
    independentPerformance,
    retention: unknown('needs_delayed_independent_check'),
    autonomy: unknown('needs_study_instrument'),
    regulation,
  };
}
