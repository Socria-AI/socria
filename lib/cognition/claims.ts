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
// Pure. One import, lib/runtime/asks.ts (somebody's own life), which imports
// nothing: lib/cognition/assist.ts and lib/cognition/register.ts both read
// these, and assist already imports register.

import { firstPerson, normalizeTyping, tenderText } from '../runtime/asks';

const cleanTyped = (t: string) => t.replace(/```[\s\S]*?```/g, ' ').replace(/^\s*>.*$/gm, ' ').replace(/\s+/g, ' ').trim();
const clean = (t: string) => cleanTyped(normalizeTyping(t));

/** Somebody's claim, reported: "my manager says…", "I read that…", "people keep saying…". */
const REPORTED = /\b(?:says?|said|claims?|claimed|told\s+(?:me|us)|tells\s+(?:me|us)|thinks?|believes?|insists?|swears?|heard|read|keeps?\s+saying|argues?|argued)\b(?:\s+that)?\s+\S[^?]{2,220}/i;
/** …and asked whether it holds. */
const IS_IT_SO = /\b(?:is\s+(?:that|this|it|he|she|they)\s+(?:really\s+)?(?:right|true|correct|accurate|so|a\s+myth|legit|real)|are\s+they\s+(?:right|correct)|(?:is|was)\s+(?:he|she|my\s+\w+)\s+right|true\s+or\s+(?:false|not)|fact\s+or\s+(?:fiction|myth)|does\s+that\s+hold\s+up)\b|(?:^|[.!?]\s+)(?:true|real|legit|right|correct|accurate|fact)\s*\?\s*$|[.!]\s+(?:is|was|are|were|does|did|do)\s+(?:he|she|it|they|that|this)(?:\s+really)?\s*\?\s*$/i;
/** A claim asked about directly: "is it true that…", "is there evidence that…", "fact-check this". */
const CLAIM_ASK =
  /^(?:(?:so|ok(?:ay)?|hey|hi|honestly|quick question),?\s+)?(?:(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:fact[- ]?check|verify|double[- ]check)\b(?:\s+(?:this|that|the))?(?:\s+(?:claim|statement|fact))?\s*:?\s*\S|true\s+or\s+false\s*[:\-]|(?:is\s+there\s+)?any\s+truth\s+(?:to|in)\b|is\s+it\s+(?:really\s+)?(?:true|a\s+myth|a\s+fact|correct)\s+(?:that\s+)?\S|(?:is|are)\s+there\s+(?:any\s+)?(?:evidence|proof)\s+(?:that|for)\b|fact[- ]?check\b|does\s+(?:the\s+)?(?:research|science|evidence|data)\s+(?:say|show|support|back(?:\s+up)?)\b)|\bis\s+it\s+(?:really\s+)?(?:true|a\s+myth)\s+that\b|\b(?:is|was)\s+(?:that|this|it)\s+a\s+myth\b/i;
/** "Coffee stunts your growth. True?" — a statement, then the question whether it holds. */
const SAID_THEN_ASKED = /^[^?]{8,220}(?:[.!]|,)\s*(?:is\s+(?:that|this|it)\s+)?(?:really\s+)?(?:true|real|legit|correct|accurate|a\s+myth|fact\s+or\s+(?:fiction|myth)|true\s+or\s+false|any\s+truth\s+to\s+(?:that|this|it))\s*\?\s*$/i;
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
  /^(?:(?:so|ok(?:ay)?|hey|hi|honestly),?\s+)?(?:(?:my\s+[\w-]+|people|everyone|someone|they|a\s+(?:friend|coworker|colleague|teacher|guy|book|video|post|article))\s+(?:says?|said|claims?|claimed|told\s+(?:me|us)|insists?|swears?|keeps?\s+saying|thinks?)|apparently,?|supposedly,?|i\s+(?:heard|read)(?:\s+somewhere)?)\s+(?:that\s+)?([^?]{6,220}?)[.!?]?\s*$/i;
const WORLD_CLAIM = /\b(?:visible\s+from|causes?|cures?|prevents?|is\s+(?:bad|good|healthy|unhealthy|dangerous|safe|toxic)\s+for|only\s+(?:use|have|has)|never|always|every(?:one|body)?|all\s+\w+s\b|most\s+\w+s\b|\d+\s*(?:percent|times)|myth|scientifically|proven|studies\s+show|science\s+says|can'?t\s+be|doesn'?t\s+exist|keeps?\s+the\s+doctor\s+away)\b|\d+\s*%/i;
const PERSONAL_CLAUSE = /\b(?:i|me|my|we|us|our|you|your|should|need|needs|have\s+to|has\s+to|must|wants?|will|gonna|going\s+to|tonight|tomorrow|today)\b/i;
/**
 * …and not a clinician's word in their own care ("my therapist says anxiety
 * is always about control"), or a claim about love and the people in it ("my
 * mum says all guys cheat"): said to them, about their life, and answered as
 * that — never with a verdict and its parts (adversarial review, November 2026).
 */
const CARE_SOURCE = /^(?:(?:so|ok(?:ay)?|hey|hi|honestly),?\s+)?my\s+(?:therapist|counsell?or|psychiatrist|psychologist|doctor|gp|nurse|coach|sponsor)\b/i;
const ABOUT_LOVE = /\b(?:cheat\w*|love|loves|relationships?|dating|marriage|exes|guys|girls|boyfriends?|girlfriends?|husbands?|wives|partners?|soulmates?)\b/i;
function reportedOnly(t: string): boolean {
  const m = REPORTED_ONLY.exec(t);
  if (!m || CARE_SOURCE.test(t) || !WORLD_CLAIM.test(m[1]) || ABOUT_LOVE.test(m[1])) return false;
  // a generic "we" or "our" in a claim about the world is everyone's ("we only use 10 percent of our brain")
  return !PERSONAL_CLAUSE.test(m[1].replace(/\b(?:we|our|us)\b/gi, 'people'));
}
/**
 * One person's private conduct or feelings: "my ex said he never cheated.
 * true?", "he told me he loves me — is it real?", "my boyfriend says he was at
 * work all night". Nothing there can be checked from outside, and a verdict on
 * it would be a judgement of a person (adversarial review, November 2026).
 */
const PRIVATE =
  /\b(?:he|she|they|him|her|(?:my\s+)?(?:ex|boyfriend|girlfriend|bf|gf|husband|wife|partner|crush|date|best\s+friend|friend|boss|teacher|mom|mum|mother|dad|father|parents|grandma|grandpa|nan|sister|brother|son|daughter|kids|aunt|uncle))\b[^.?!]{0,60}?\b(?:cheat\w*|loves?|loved|lying|lied|lies|was\s+at|were\s+at|feelings?|likes?\s+me|into\s+me|faithful|single|seeing\s+someone|over\s+(?:me|him|her|them)|meant\s+it|means\s+it|sorry|miss(?:es|ed)?\s+me|dying|die|dies|sick|proud|cares?\s+about|hates?|hated|selfish|a\s+mistake|amount\s+to)\b|\bi\s+think\s+i(?:'m|\s+am)\b|\b(?:my|our|your)\s+fault\b|\bi'?m\s+the\s+reason\b|\babout\s+me\b/i;
/** …or somebody named, and what they feel about the person asking: "is Tom really cheating on me?". Case matters: a name is capitalised. */
const PRIVATE_NAMED =
  /\b(?!(?:Is|Was|Does|Did|Do|Are|Were|The|My|I|What|Who|Why|How|When|Where|Can|Could|Should|Would|Will|Has|Have)\b)[A-Z][a-z]+\b[^.?!]{0,40}?\b(?:cheat\w*\s+on\s+me|cheating|loves?\s+me|loved\s+me|lying\s+to\s+me|lied\s+to\s+me|likes?\s+me|into\s+me|proud\s+of\s+me|hates?\s+me|miss(?:es|ed)?\s+me|over\s+me|faithful|seeing\s+someone)\b/;
/** Comfort, not a claim: "it always gets better, doesn't it?" asks to be heard, not for a verdict. */
const COMFORT = /\b(?:gets?|getting|will\s+get|it'?ll\s+get)\s+(?:better|easier)\b|\btime\s+heals\b|\bit'?ll\s+be\s+(?:ok|okay|fine|alright)\b|\beverything\s+happens\s+for\s+a\s+reason\b/i;
/** The clause reported, after "says", "told me", "thinks": the claim itself, checked for whose it is. */
const REPORTED_CLAUSE = /\b(?:says?|said|claims?|claimed|told\s+(?:me|us)|tells\s+(?:me|us)|thinks?|believes?|insists?|swears?|keeps?\s+saying|argues?|read|heard|saw|seen)\b(?:\s+that)?\s+([^?]{2,220})/i;
const aboutThem = (t: string): boolean => {
  const m = REPORTED_CLAUSE.exec(t);
  return firstPerson(m ? m[1] : t.replace(/[.!]\s*(?:is\s+(?:that|this|it)\s+)?(?:really\s+)?(?:true|real|legit|correct|accurate)\s*\?\s*$/i, ''));
};
/**
 * The plainest yes/no forms of an everyday claim (adversarial review, November
 * 2026): "was Napoleon actually short?", "do goldfish really have a 3-second
 * memory?", "does sugar cause diabetes?", "do we only use 10% of our brains?",
 * "Einstein failed maths, right?". Each asks whether something widely said is
 * so. Not about the person, the conversation or code ("does it really
 * matter?", "is this really happening?", "does the API cause the leak?").
 */
const NOT_A_SUBJECT = String.raw`(?!(?:i|me|he|she|they|it|this|that|my|you|we|your|our|his|her|their|people|anyone|everyone|someone|somebody|nobody|there)\b)`;
const REALLY_Q = new RegExp(String.raw`^(?:(?:so|ok(?:ay)?|hey|hi|honestly),?\s+)?(?:do|does|did|is|are|was|were|can|could)\s+${NOT_A_SUBJECT}[^?]{2,80}?\b(?:really|actually|truly)\b[^?]*\?\s*$`, 'i');
const CAUSE_Q = new RegExp(
  String.raw`^(?:(?:so|ok(?:ay)?|hey|hi|honestly),?\s+)?(?:does|do|can|is|are)\s+${NOT_A_SUBJECT}[\w\s'’,-]{2,50}?\s+(?:really\s+|actually\s+)?(?:cause|causes|lead\s+to|linked\s+to|tied\s+to|prevent|cure|ruin|rot|stunt|damage|give\s+you|make\s+(?!sense\b|a\s+difference\b|it\b)|help\s+(?:you|your|with|kids|people)|improve|affect|hurt|harm|weaken|strengthen|shrink|kill)\s*[^?]{2,60}\?\s*$`,
  'i'
);
/** "Do you really need 8 glasses of water a day?", "can you catch a cold from wet hair?": a health myth, asked of anyone. */
const YOU_REALLY = /^(?:(?:so|ok(?:ay)?|hey|hi|honestly),?\s+)?(?:do|can|will|should)\s+you\s+(?:really|actually)\s+(?:need|have\s+to|lose|burn|get|catch|gain|die|go\s+blind|grow|swallow)\b[^?]{2,80}\?\s*$/i;
const CATCH_FROM = /^(?:(?:so|ok(?:ay)?|hey|hi|honestly),?\s+)?can\s+you\s+(?:really\s+|actually\s+)?(?:get|catch|go|become)\s+(?:a\s+|an\s+)?(?:cold|colds|the\s+flu|flu|sick|ill|blind|deaf|cancer|lice|warts|tetanus|rabies|food\s+poisoning|pneumonia|diabetes|arthritis|an\s+infection|infected)\b[^?]{0,60}\bfrom\b[^?]{2,60}\?\s*$/i;
const ONLY_Q = /^(?:(?:so|ok(?:ay)?|hey|hi|honestly),?\s+)?(?:do|does|did|can|are|is)\s+(?:we|you|humans|people|most\s+people|men|women|kids|children|dogs|cats)\s+(?:really\s+|actually\s+)?(?:only|ever|never|always)\b[^?]{2,80}\?\s*$/i;
const TAG_Q = /^([^?]{8,200}?),?\s*(?:right|isn'?t\s+it|aren'?t\s+they|don'?t\s+they|doesn'?t\s+it|didn'?t\s+(?:he|she|they|it)|wasn'?t\s+(?:he|she|it)|true)\s*\?\s*$/i;
const WORLD_FACT = /\b(?:invented|discovered|failed|was\s+born|died|wrote|said|built|is\s+the\s+(?:largest|biggest|tallest|oldest|first|only|smallest|fastest)|are\s+the\s+(?:largest|biggest|only)|only\s+(?:have|has|use|uses|need|needs|live|lives|see|sees|hear|remember|remembers)|(?:five|5|seven|7)\s+senses)\b/i;
function tagClaim(t: string): boolean {
  const m = TAG_Q.exec(t);
  return !!m && (WORLD_CLAIM.test(m[1]) || WORLD_FACT.test(m[1])) && !PERSONAL_CLAUSE.test(m[1]) && !COMFORT.test(m[1]) && !ABOUT_LOVE.test(m[1]) && !/\b(?:the\s+(?:meeting|party|game|match|flight|train|bus|deadline|plan)|tonight|tomorrow)\b/i.test(m[1]);
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
  // somebody's own life, or a private matter, has no verdict (second adversarial round, November 2026)
  if (!t || t.length > 700 || OWN_WORK.test(t) || BIG_QUESTION.test(t) || PRIVATE.test(t) || PRIVATE_NAMED.test(t) || tenderText(t) || COMFORT.test(t)) return false;
  if (CLAIM_ASK.test(t) || (REPORTED.test(t) && IS_IT_SO.test(t) && !CARE_SOURCE.test(t) && !aboutThem(t))) return true;
  if ((SAID_THEN_ASKED.test(t) && !aboutThem(t)) || NAMED_RULE.test(t) || DID_THEY_SAY.test(t) || reportedOnly(t)) return true;
  if (CODE.test(t)) return false;
  return DOES_IT_CAUSE.test(t) || REALLY_Q.test(t) || CAUSE_Q.test(t) || ONLY_Q.test(t) || YOU_REALLY.test(t) || CATCH_FROM.test(t) || tagClaim(t);
}

/**
 * A practical question in "should I" clothing — how long, how much, how often,
 * what temperature, when, where: it has an answer, and "should I" asks for it.
 * "Should I take the job?" and "which flat should I pick?" are not this.
 */
export const PRACTICAL_SHOULD =
  /\b(?:how\s+(?:long|much|many|often|far|hot|cold|big|early|late|soon|tight|deep|high|low)|what\s+(?:temperature|temp|time|size|age|setting|dose|dosage|amount|day|year|grit|gauge|pressure|speed)|when|where|at\s+what\s+(?:age|point|temperature|time))\s+(?:\w+\s+)?should\s+(?:i|we)\b|\bhow\s+should\s+(?:i|we)\s+(?:price|charge|grow|market|promote|hire|name|learn|study|format|pitch|sell)\b(?!\s+(?:to\s+)?(?:myself|my\s+(?:life|self|feelings|grief)|to\s+(?:love|live|cope|forgive)))|\bwhat\s+should\s+(?:i|we)\s+(?:see|eat|pack|read|watch|cook|bring|wear|order|visit)\b/i;
/**
 * A trip: "three days in Lisbon", "a weekend in Rome", "what should I see in
 * Tokyo in 4 days?". A length of time alone is not one — "my exam is in 3
 * days", "a headache 3 days in a row", "my dog hasn't eaten for 2 days" are
 * not plans to fill (third adversarial pass, November 2026) — so a duration
 * or a trip word counts only beside a place named as one, or travel to it.
 */
const N_DAYS = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a\s+few|a\s+couple\s+of)`;
const DURATION = new RegExp(
  String.raw`\b(?:in|for)\s+${N_DAYS}\s+(?:days?|nights?)\b|\b${N_DAYS}\s+(?:days?|nights?)\s+(?:in|at|around|on)\b|\bover\s+(?:a|the)\s+(?:long\s+)?weekend\b|\bif\s+(?:i|we)\s+(?:only\s+)?have\s+${N_DAYS}\s+(?:days?|nights?)\b`,
  'i'
);
const TRIP_WORD = /\b(?:(?:long\s+)?weekend|trip|holiday|vacation|day\s+trip|city\s+break|honeymoon|road\s+trip|layover|stopover|getaway)\s+(?:to|in|around|at)\b/i;
/** A place, named as one: "in Tokyo", "around Lisbon", "to New York", "in the Alps" — a capital, so "in a row" and "in class" are not; nor a month, a day or a school subject. */
const PLACE =
  /\b(?:[Ii]n|[Aa]round|[Tt]o|[Aa]t|[Vv]isit(?:ing)?|[Ee]xplor(?:e|ing))\s+(?:the\s+)?(?!(?:I|I'm|I've|I'll|The|My|Our|Your|His|Her|Their|A|An|It|This|That|Mom|Mum|Dad|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Christmas|Easter|Ramadan|Physics|Chemistry|Biology|Maths?|English|History|Spanish|French|German|Economics|Calculus|Algebra|Geometry|Statistics)\b)[A-Z][\w'’-]+/;
export const TRIP: { test(text: string): boolean } = {
  test: (text: string) => (DURATION.test(text) || TRIP_WORD.test(text)) && (PLACE.test(text) || TRAVEL.test(text)),
};
/** …or a place named, travelled to: "going to Lisbon", "visiting Tokyo" (a capital, so "going to bed" is not one). */
const TRAVEL = /\b(?:going|heading|travelling|traveling|flying|visiting|off)\s+(?:to\s+)?[A-Z][a-z]+\b(?!['’]s\b)/;
/**
 * A pick asked for: "recommend me a sci-fi book", "suggest a film for
 * tonight", "what should I do with three days in Lisbon?". It has an answer —
 * a pick, and why — and laying out "what the choice rests on" instead of
 * making it is the help desk's non-answer. A consequential choice ("should I
 * take the job?") is never this.
 */
const PICK = /\b(?:recommend|suggest)\s+(?:me\s+|us\s+)?(?:a|an|some|one|two|three|\d+|a\s+few|a\s+good|any)?\s*(?:good\s+|great\s+|fun\s+|new\s+)?(?:[\w'’-]+\s+){0,2}(?:books?|novels?|films?|movies?|shows?|series|podcasts?|albums?|songs?|bands?|games?|restaurants?|caf[eé]s?|bars?|recipes?|dish(?:es)?|gifts?|hikes?|apps?|wines?|beers?|places?\s+to\s+(?:eat|go|visit|stay))\b/i;
/**
 * …and what to do, try or buy only on a trip: "what should I do with my life?",
 * "with my savings?", "in this situation?" are not picks (adversarial review,
 * November 2026), and "going to Sarah's wedding" is not travel.
 */
const NOT_A_TRIP =
  /\b(?:my\s+(?:life|savings|money|career|future|marriage|relationship|ex)|this\s+situation|wedding|funeral|party|interview|hospital|court|surgery|operation|treatment|chemo|in\s+a\s+row|straight|headache|migraine|fever|sick|ill|unwell|pain|hurts?|bleeding|vomit\w*|throwing\s+up|cough\w*|rash|flu|covid|diarrh\w*|infection|injur\w*|food\s+poisoning|(?:hasn'?t|not|stopped)\s+eat\w*|awake|insomnia|can'?t\s+sleep|exam|test|deadline|due|expires?|rent|bills?|lost\s+my|stolen|robbed|arrested|stranded|missed\s+my\s+(?:flight|train))\b/i;
export function pickAsk(text: string): boolean {
  const t = clean(text);
  return PICK.test(t) || ((/\bwhat\s+should\s+(?:i|we)\s+(?:do|see|visit|try|buy|get)\b/i.test(t) || /\b(?:any|some)\s+(?:recommendations|suggestions|tips|ideas)\b/i.test(t)) && (TRIP.test(t) || TRAVEL.test(t)) && !NOT_A_TRIP.test(t));
}
/** "How long should I boil an egg?", a pick asked for, or what to do with three days in Lisbon: a question with an answer. */
const WHEN_TO = /\bshould\s+(?:i|we)\s+[^?]{1,60}?\b(?:before|after)\s+or\s+(?:before|after)\b/i;
/** "Should I wash chicken before cooking it?", "should I use who or whom here?": a question with an answer. */
const HOW_TO_SHOULD = /^should\s+(?:i|you|we|u)\s+(?:wash|rinse|refrigerate|freeze|store|reheat|stretch|warm\s+up|water|salt|peel|soak|preheat|tip|capitali[sz]e|take\s+(?:ibuprofen|paracetamol|acetaminophen|tylenol|advil|aspirin|vitamin\s+\w+|a\s+(?:painkiller|supplement)|antibiotics|melatonin)|use\s+(?:who|whom|tu|vous|a|an|affect|effect|its|it'?s|their|there|they'?re|semicolons?|commas?|apostrophes?|capitals?|the\s+word|"[^"]+"|'[^']+'))\b/i;
export function practicalShould(text: string): boolean {
  const t = clean(text);
  return (PRACTICAL_SHOULD.test(t) && !/\bor\b/i.test(t)) || WHEN_TO.test(t) || HOW_TO_SHOULD.test(t) || pickAsk(t);
}
