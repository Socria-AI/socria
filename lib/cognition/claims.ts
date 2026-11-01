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
//   And in their everyday forms (November 2026): "coffee stunts your growth.
//   True?", "does sugar make kids hyperactive?", "is the 10,000 hour rule
//   real?", "my friend says the Great Wall is visible from space" — each a
//   claim to give a verdict on, and each was read as idle talk. "Recommend me
//   a sci-fi book" was read as a decision to lay out and not make; a pick asked
//   for is a pick.
//
// Pure. No imports: lib/cognition/assist.ts and lib/cognition/register.ts both
// read these, and assist already imports register.

const clean = (t: string) => t.replace(/```[\s\S]*?```/g, ' ').replace(/^\s*>.*$/gm, ' ').replace(/\s+/g, ' ').trim();

/** Somebody's claim, reported: "my manager says…", "I read that…", "people keep saying…". */
const REPORTED = /\b(?:says?|said|claims?|claimed|told\s+(?:me|us)|tells\s+(?:me|us)|thinks?|believes?|insists?|swears?|heard|read|keeps?\s+saying|argues?|argued)\b(?:\s+that)?\s+\S[^?]{2,220}/i;
/** …and asked whether it holds. */
const IS_IT_SO = /\b(?:is\s+(?:that|this|it|he|she|they)\s+(?:really\s+)?(?:right|true|correct|accurate|so|a\s+myth|legit|real)|are\s+they\s+(?:right|correct)|(?:is|was)\s+(?:he|she|my\s+\w+)\s+right|true\s+or\s+(?:false|not)|fact\s+or\s+(?:fiction|myth)|does\s+that\s+hold\s+up)\b|(?:^|[.!?]\s+)(?:true|real|legit|right|correct|accurate|fact)\s*\?\s*$/i;
/** A claim asked about directly: "is it true that…", "is there evidence that…", "fact-check this". */
const CLAIM_ASK =
  /^(?:(?:so|ok(?:ay)?|hey|hi|honestly|quick question),?\s+)?(?:is\s+it\s+(?:really\s+)?(?:true|a\s+myth|a\s+fact|correct)\s+(?:that\s+)?\S|(?:is|are)\s+there\s+(?:any\s+)?(?:evidence|proof)\s+(?:that|for)\b|fact[- ]?check\b|does\s+(?:the\s+)?(?:research|science|evidence|data)\s+(?:say|show|support|back(?:\s+up)?)\b)|\bis\s+it\s+(?:really\s+)?(?:true|a\s+myth)\s+that\b|\b(?:is|was)\s+(?:that|this|it)\s+a\s+myth\b/i;
/** "Coffee stunts your growth. True?" — a statement, then the question whether it holds. */
const SAID_THEN_ASKED = /^[^?]{8,220}[.!]\s*(?:is\s+(?:that|this|it)\s+)?(?:really\s+)?(?:true|real|legit|correct|accurate|a\s+myth|fact\s+or\s+(?:fiction|myth))\s*\?\s*$/i;
/**
 * "Does sugar make kids hyperactive?", "does coffee stunt your growth?", "does
 * vaping cause cancer?" — an effect on people, asked whether it is real. Not a
 * question about code ("does the API cause a memory leak?" is diagnosis), and
 * not "does this make sense?".
 */
const DOES_IT_CAUSE =
  /^(?:(?:so|ok(?:ay)?|hey|hi|honestly|quick question),?\s+)?(?:does|do|can|will)\s+(?!(?:it|this|that|they|you|i|we)\b)[\w\s'’-]{2,40}?\s+(?:really\s+|actually\s+)?(?:cause|make|stunt|lead\s+to|give|prevent|cure|kill|rot|shrink|damage|boost|lower|raise|weaken|strengthen)\s+(?:you|your|kids|children|people|us|men|women|babies|teens|teenagers|dogs|cats|cancer|autism|weight\s+gain|hair\s+loss|acne|brain|memory|growth|immunity)\b/i;
const CODE = /\b(?:code|api|function|server|bug|app|query|script|build|compile|memory\s+leak|error|exception|database|deploy)\b/i;
/** "Is the 10,000 hour rule real?", "is the Mozart effect a myth?" — a named rule or effect, asked whether it holds. */
const NAMED_RULE = /^(?:(?:so|ok(?:ay)?|hey|hi|honestly),?\s+)?is\s+(?:the\s+)?[\w\s,.'’-]{2,40}?\s+(?:rule|law|theory|effect|thing|diet|method)\s+(?:actually\s+|really\s+)?(?:real|true|legit|a\s+myth|backed\s+by\s+(?:science|evidence|research))\b/i;
/** "Did Einstein actually say that?" — a quotation, asked whether it is real. */
const DID_THEY_SAY = /\bdid\s+[\w\s.'’-]{2,40}?\s+(?:actually|really|ever)\s+say\b/i;
/**
 * "My friend says the Great Wall is visible from space": somebody's claim
 * about the world, reported, with nothing else asked. Only a claim about the
 * world — what is visible, what causes what, "only", "never", a figure —
 * never news ("my boss says the meeting is cancelled") or a plan ("my mum
 * says I should call more"), which are not put up to be checked.
 */
const REPORTED_ONLY =
  /^(?:(?:so|ok(?:ay)?|hey|hi|honestly),?\s+)?(?:my\s+[\w-]+|people|everyone|someone|they|a\s+(?:friend|coworker|colleague|teacher|guy|book|video|post|article))\s+(?:says?|said|claims?|claimed|told\s+me|insists?|swears?|keeps?\s+saying|thinks?)\s+(?:that\s+)?([^?]{6,220}?)[.!]?\s*$/i;
const WORLD_CLAIM = /\b(?:visible\s+from|causes?|cures?|prevents?|is\s+(?:bad|good|healthy|unhealthy|dangerous|safe|toxic)\s+for|only\s+use|never|always|every(?:one|body)?|all\s+\w+s\b|most\s+\w+s\b|\d+\s*(?:%|percent|times)|myth|scientifically|proven|studies\s+show|science\s+says|can'?t\s+be|doesn'?t\s+exist)\b/i;
const PERSONAL_CLAUSE = /\b(?:i|me|my|we|us|our|you|your|should|need|needs|have\s+to|has\s+to|must|wants?|will|gonna|going\s+to|tonight|tomorrow|today)\b/i;
function reportedOnly(t: string): boolean {
  const m = REPORTED_ONLY.exec(t);
  return !!m && WORLD_CLAIM.test(m[1]) && !PERSONAL_CLAUSE.test(m[1]);
}
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
  if (CLAIM_ASK.test(t) || (REPORTED.test(t) && IS_IT_SO.test(t))) return true;
  if (SAID_THEN_ASKED.test(t) || NAMED_RULE.test(t) || DID_THEY_SAY.test(t) || reportedOnly(t)) return true;
  return DOES_IT_CAUSE.test(t) && !CODE.test(t);
}

/**
 * A practical question in "should I" clothing — how long, how much, how often,
 * what temperature, when, where: it has an answer, and "should I" asks for it.
 * "Should I take the job?" and "which flat should I pick?" are not this.
 */
export const PRACTICAL_SHOULD =
  /\b(?:how\s+(?:long|much|many|often|far|hot|cold|big|early|late|soon|tight|deep|high|low)|what\s+(?:temperature|temp|time|size|age|setting|dose|dosage|amount|day|year|grit|gauge|pressure|speed)|when|where|at\s+what\s+(?:age|point|temperature|time))\s+(?:\w+\s+)?should\s+(?:i|we)\b|\bhow\s+should\s+(?:i|we)\s+(?:price|charge|grow|market|promote|hire|name|learn|study|prepare|format|pitch|sell)\b|\bwhat\s+should\s+(?:i|we)\s+(?:see|eat|pack|read|watch|cook|bring|wear|order|visit)\b|\bwhat\s+should\s+(?:i|we)\s+(?:do|try|buy|get)\s+(?:in|at|around|on|while|during|for|with)\b/i;
/** A trip: "three days in Lisbon", "a weekend in Rome", "visiting Tokyo". */
export const TRIP = /\b(?:\d+|one|two|three|four|five|six|seven|a\s+few|a\s+couple\s+of)\s+(?:days?|nights?)\s+(?:in|at|around|on)\b|\bfor\s+(?:\d+|one|two|three|four|five|six|seven|a\s+few|a\s+couple\s+of)\s+(?:days?|nights?)\b|\b(?:a\s+)?(?:weekend|trip|holiday|vacation|day\s+trip|city\s+break)\s+(?:to|in)\b/i;
/** …or a place named, travelled to: "going to Lisbon", "visiting Tokyo" (a capital, so "going to bed" is not one). */
const TRAVEL = /\b(?:going|heading|travelling|traveling|flying|visiting|off)\s+(?:to\s+)?[A-Z][a-z]/;
/**
 * A pick asked for: "recommend me a sci-fi book", "suggest a film for
 * tonight", "what should I do with three days in Lisbon?". It has an answer —
 * a pick, and why — and laying out "what the choice rests on" instead of
 * making it is the help desk's non-answer. A consequential choice ("should I
 * take the job?") is never this.
 */
const PICK = /\b(?:recommend|suggest)\s+(?:me\s+|us\s+)?(?:a|an|some|one|two|three|\d+|a\s+few|a\s+good|any)?\s*(?:good\s+|great\s+|fun\s+|new\s+)?(?:[\w'’-]+\s+){0,2}(?:books?|novels?|films?|movies?|shows?|series|podcasts?|albums?|songs?|bands?|games?|restaurants?|caf[eé]s?|bars?|recipes?|dish(?:es)?|gifts?|hikes?|apps?|wines?|beers?|places?\s+to\s+(?:eat|go|visit|stay))\b/i;
export function pickAsk(text: string): boolean {
  const t = clean(text);
  return PICK.test(t) || (/\bwhat\s+should\s+(?:i|we)\s+(?:do|see|visit)\b/i.test(t) && (TRIP.test(t) || TRAVEL.test(t)));
}
/** "How long should I boil an egg?", a pick asked for, or what to do with three days in Lisbon: a question with an answer. */
export function practicalShould(text: string): boolean {
  const t = clean(text);
  return (PRACTICAL_SHOULD.test(t) && !/\bor\b/i.test(t)) || pickAsk(t);
}
