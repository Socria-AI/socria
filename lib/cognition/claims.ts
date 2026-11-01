// lib/cognition/claims.ts — a claim put up to be checked, and a practical
// question that only sounds like a decision.
//
// Two misreadings that made answers long for no reason (November 2026):
//
//   "Is it true that we only use 10% of our brains?" was read as a discussion
//   ("is it true that…" is how an opinion is asked for, too), and the reply
//   was told to give "the other side at its strongest" — of a myth. "My
//   manager says remote work kills productivity. Is that right?" was read as
//   their own work handed over to be checked, and the reply was told to find
//   where "their attempt" first went wrong. Both are a CLAIM: somebody's, or
//   the world's, put up to be checked. The answer is a verdict first — holds,
//   fails, partly, or not settled — and then what it rests on.
//
//   "How long should I boil an egg?" was read as a consequential decision on
//   the words "should I", and the reply was told to lay out what the choice
//   rests on and the strongest case against it. A how-long, how-much, when or
//   where question has an answer; "should I" there asks for it.
//
// Pure. No imports: lib/cognition/assist.ts and lib/cognition/register.ts both
// read these, and assist already imports register.

const clean = (t: string) => t.replace(/```[\s\S]*?```/g, ' ').replace(/^\s*>.*$/gm, ' ').replace(/\s+/g, ' ').trim();

/** Somebody's claim, reported: "my manager says…", "I read that…", "people keep saying…". */
const REPORTED = /\b(?:says?|said|claims?|claimed|told\s+(?:me|us)|tells\s+(?:me|us)|thinks?|believes?|insists?|swears?|heard|read|keeps?\s+saying|argues?|argued)\b(?:\s+that)?\s+\S[^?]{2,220}/i;
/** …and asked whether it holds. */
const IS_IT_SO = /\b(?:is\s+(?:that|this|it|he|she|they)\s+(?:really\s+)?(?:right|true|correct|accurate|so|a\s+myth|legit|real)|are\s+they\s+(?:right|correct)|(?:is|was)\s+(?:he|she|my\s+\w+)\s+right|true\s+or\s+(?:false|not)|fact\s+or\s+(?:fiction|myth)|does\s+that\s+hold\s+up)\b/i;
/** A claim asked about directly: "is it true that…", "is there evidence that…", "fact-check this". */
const CLAIM_ASK =
  /^(?:(?:so|ok(?:ay)?|hey|hi|honestly|quick question),?\s+)?(?:is\s+it\s+(?:really\s+)?(?:true|a\s+myth|a\s+fact|correct)\s+(?:that\s+)?\S|(?:is|are)\s+there\s+(?:any\s+)?(?:evidence|proof)\s+(?:that|for)\b|fact[- ]?check\b|does\s+(?:the\s+)?(?:research|science|evidence|data)\s+(?:say|show|support|back(?:\s+up)?)\b)|\bis\s+it\s+(?:really\s+)?(?:true|a\s+myth)\s+that\b|\b(?:is|was)\s+(?:that|this|it)\s+a\s+myth\b/i;
/** Their own work, handed over: that is checking their attempt (offersWork), not a claim. */
const OWN_WORK = /\b(?:i\s+got\b|my\s+(?:answer|working|work|solution|attempt|proof|code|essay|draft|result)\b|here'?s\s+my\b|check\s+my\b|did\s+i\s+(?:get|do)\b)/i;
/** A question for thinking together, whatever its grammar: what is true there is the discussion. */
const BIG_QUESTION = /\b(?:free\s+will|consciousness|the\s+meaning\s+of|god|gods|religion|morality|moral(?:ly)?|ethic(?:s|al|ally)|the\s+soul|afterlife|purpose\s+of\s+life|human\s+nature)\b/i;

/**
 * A claim to check — somebody's or the world's, asked whether it holds. Not
 * their own work (that is offersWork), and not a big question to think about
 * together ("is it true that free will is an illusion?" stays a discussion).
 */
export function claimCheck(text: string): boolean {
  const t = clean(text);
  if (!t || t.length > 700 || OWN_WORK.test(t) || BIG_QUESTION.test(t)) return false;
  return CLAIM_ASK.test(t) || (REPORTED.test(t) && IS_IT_SO.test(t));
}

/**
 * A practical question in "should I" clothing — how long, how much, how often,
 * what temperature, when, where: it has an answer, and "should I" asks for it.
 * "Should I take the job?" and "which flat should I pick?" are not this.
 */
export const PRACTICAL_SHOULD =
  /\b(?:how\s+(?:long|much|many|often|far|hot|cold|big|early|late|soon|tight|deep|high|low)|what\s+(?:temperature|temp|time|size|age|setting|dose|dosage|amount|day|year|grit|gauge|pressure|speed)|when|where|at\s+what\s+(?:age|point|temperature|time))\s+(?:\w+\s+)?should\s+(?:i|we)\b/i;
