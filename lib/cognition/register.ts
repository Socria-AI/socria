// lib/cognition/register.ts — WHAT KIND OF EXCHANGE THIS IS.
//
// Not every message is a task. "hi, how are you?", "lol you sound like my
// advisor", "I got the internship!!", "my grandmother is in the hospital",
// "let's brainstorm names", "do you think free will is real?", "no, that's
// absurd" — each wants a different kind of answer, and every reader
// downstream of this one (the move, who does what, whether to search) was
// written for work. Read as work, a hello was handed "the useful answer first
// … do the arithmetic", "how are you feeling?" was told to EXPLAIN, good news
// was told to VERIFY ("I got" is how a worked answer begins), and "how are you
// doing today?" went to the web because it says "today". The reply did what it
// was told, and sounded like a help desk.
//
// So the exchange is read first, from their words — no model, no extra call:
//   social        a hello, "how are you", thanks, a goodbye
//   playful       joking, teasing, a joke asked for
//   personal      good news, a rough day, a worry — said in so many words
//   brainstorm    ideas wanted, loosely and many
//   discussion    an idea or a big question to think about; an opinion asked for
//   disagreement  pushback on what Socria just said
//   conversation  talk that is none of these and asks for nothing in particular
//   task          something to answer, explain, check, make, fix or decide
//
// WHAT IT IS NOT. Not a judgement about the person: nothing is inferred about
// who they are and nothing is kept — a feeling counts only when they said it
// this turn, the way "I'm a beginner" counts in lib/core4/signals.ts. And not a
// gate on help: a message with work in it is a task whatever else it carries
// ("ugh, rough day — can you check my proof?" is a task, from somebody having a
// rough day), and the reply still reads everything they wrote.
//
// CONSERVATIVE, AND WHY. A miss leaves a turn reading as it always did. A false
// positive is worse — a real question taken for small talk gets a line — so
// small talk needs the WHOLE message to be social, and whether there is a
// request in it is the caller's reading of the work (lib/runtime/state.ts),
// which outranks everything here but disagreement.
//
// Pure. No model, no network, no clock, and no imports, so the web gate
// (lib/core4/web.ts) can ask `smallTalk` without a cycle.

export const EXCHANGES = ['social', 'playful', 'personal', 'brainstorm', 'discussion', 'disagreement', 'conversation', 'task'] as const;
export type ExchangeKind = (typeof EXCHANGES)[number];

/** The exchanges that are talk rather than work: nothing to allocate, nothing to look up. */
export const TALK: ReadonlySet<ExchangeKind> = new Set(['social', 'playful', 'personal']);

export interface Exchange {
  kind: ExchangeKind;
  /** they asked about Socria itself: how it is, what it is, what it likes or feels */
  aboutSocria: boolean;
  /** a feeling they said they have, this turn, in their words — never inferred, never kept */
  saidFeeling: 'up' | 'down' | null;
  /** they are joking or teasing */
  joking: boolean;
  /** they asked for a joke, a pun, a riddle */
  wantsJoke: boolean;
  /** how they wrote: how much, and how casually — to answer in kind */
  manner: { words: number; casual: boolean };
  /** machine-readable, content-free reasons (tests, the trace) */
  reasons: string[];
}

export interface ExchangeInput {
  text: string;
  /** the conversation before this turn, oldest first */
  history?: readonly { role: 'user' | 'assistant'; content: string }[];
  /** the caller read work in the message: a question to answer, something to make, check, fix or decide */
  task?: boolean;
  /** which work, when the caller read it (lib/runtime/state.ts readWork): a decision stays a task */
  work?: string;
  /** explicit signals already read (lib/core4/signals.ts) */
  signals?: { vent?: boolean; safety?: boolean; correction?: boolean; recommendationRequested?: boolean };
  /** the map's reading of the thinking, when there is one */
  mapContext?: string | null;
}

/** Their words without code, quotations or attachment blocks: what they said to Socria. */
function spoken(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^\s*>.*$/gm, ' ')
    .replace(/\[Attached [^\]]*\][\s\S]*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── small talk ──────────────────────────────────────────────────────────
//
// A message is small talk when every clause of it is one of these: a greeting
// (with a name, if they used one), how-are-you in any of its forms, thanks or
// an acknowledgement, a goodbye, a pleasantry, a laugh. "hi, how are you?" is;
// "hi, can you look at my essay?" is not — one clause asks for something.

const GREETING = /^(?:hi+|he+y+|hel+o+|hiya|howdy|heya|hallo|hola|yo+|sup|ahoy|greetings|g'?day|good (?:morning|afternoon|evening|day)|morning|evening|afternoon|gm)(?:\s+(?:there|again|all|everyone|folks|friend|buddy|mate|you|socria|logos|y'?all))*$/;
const HOW_ASKED = [
  "how (?:are|r) (?:you|u|ya)",
  "how(?:'re| are) things",
  "how(?:'s| is| has) (?:it going|life|everything|things|your (?:day|week|weekend|morning|afternoon|evening|night)(?: going| been)?)",
  "how (?:have|'ve) you been",
  "how(?:'s| is) it hanging",
  'how do you do',
  "what(?:'s| is) (?:up|new|good)",
  'wh?ass?up',
  'what are you up to',
  'wyd',
  'you (?:ok|okay|alright|good|doing (?:ok|okay|well|good|alright))',
  '(?:what about |how about )?(?:you|yourself)',
  'are you (?:ok|okay|alright|well|good|doing (?:ok|okay|well|good|alright))',
].join('|');
const HOW_TAIL = 'doing|feeling|holding up|today|tonight|right now|this (?:morning|afternoon|evening|week)|lately|these days|then|now|so far|over there|on your end|socria|buddy|mate|friend|my friend';
const HOW_ARE_YOU = new RegExp(`^(?:and |so |anyway |well )?(?:${HOW_ASKED})(?:\\s+(?:${HOW_TAIL}))*$`);
const THANKS = /^(?:thanks?|thank (?:you|u)|thx|tysm|ty|cheers|much appreciated|appreciate (?:it|that|you|the help)|many thanks)(?:\s+(?:so much|very much|a lot|a ton|a bunch|a million|again|socria|buddy|mate))*$/;
const ACK = /^(?:ok(?:ay)?|k+|sure|cool|nice|neat|great|perfect|awesome|lovely|brilliant|amazing|excellent|good|fine|alright|all right|right|yep|yeah|yes|yup|ah+|oh+|aha|i see|got it|gotcha|makes sense|that makes sense|(?:that|this|it) (?:helps|helped|was helpful|is helpful|is great|is perfect|works)(?: (?:a lot|so much|a ton))?|very helpful|super helpful|sounds good|will do|noted|fair(?: enough)?|true|same|agreed|indeed|of course|no worries|no problem|np|wow|whoa|omg|interesting|good to know|love (?:it|that)|nice one|good one)$/;
const BYE = /^(?:bye(?:\s*bye)?|goodbye|good night|night|nighty night|gn|see (?:you|ya|u)(?: (?:later|soon|tomorrow|around|next time))?|talk (?:to you )?(?:later|soon|tomorrow)|ttyl|catch you later|later|gotta go|got to go|i(?:'m| am) off|i(?:'ll| will) be back|be right back|brb|have a (?:good|great|nice|lovely) (?:one|day|night|evening|weekend|week)|take care|anyway|well)(?:\s+(?:socria|then|now|for now|all|everyone))*$/;
const PLEASANTRY = /^(?:nice to (?:meet|see) you|(?:good|great) to see you|long time no see|happy (?:friday|monday|weekend|holidays|new year|birthday|thanksgiving|easter|diwali|eid|hanukkah)|merry christmas|good luck|you too|same to you|likewise|i(?:'m| am) (?:good|fine|great|ok|okay|alright|well|doing (?:good|well|fine|ok|okay|great|alright))|not bad|pretty good|can'?t complain|all good|doing (?:good|well|fine|great|ok|okay|alright)|meh|i(?:'m| am) back|back again|we(?:'re| are) back|i(?:'m| am) here)$/;
const LAUGHTER = /^(?:lol+|lmao+|lmfao|rofl|(?:ha)+h?|he(?:he)+|heh|xd|jk|lolol)$/;
/** Closing a turn without asking for anything: "no thanks", "that's all". */
const CLOSING = /^(?:no thanks|no thank you|nope|nah|that(?:'s| is) (?:all|it|everything)(?: for now)?|nothing else|i(?:'m| am) (?:all )?set|all set)$/;
const SOCIAL_PHRASES = [GREETING, HOW_ARE_YOU, THANKS, ACK, BYE, PLEASANTRY, LAUGHTER, CLOSING];

/**
 * One clause, read as a run of phrases — "ok cool", "haha thanks", "hey there
 * socria". Matched word by word, never as one combined pattern: phrases share
 * words ("you" ends a greeting and is also "you?"), and a single regex over a
 * run of ambiguous phrases backtracks exponentially.
 */
function phraseRun(c: string, phrases: readonly RegExp[]): boolean {
  const w = c.split(' ');
  if (w.length > 14) return false;
  const reach = new Array<boolean>(w.length + 1).fill(false);
  reach[0] = true;
  for (let i = 1; i <= w.length; i++)
    for (let j = 0; j < i && !reach[i]; j++) if (reach[j] && phrases.some((re) => re.test(w.slice(j, i).join(' ')))) reach[i] = true;
  return reach[w.length];
}
const socialClause = (c: string) => phraseRun(c, SOCIAL_PHRASES);
/** A plain yes, no or nod: what answers a question, or says "go on". */
const ANSWER_WORD = /^(?:no|nope|nah|not really|maybe|kind of|sort of|definitely|exactly|totally|absolutely|correct|yes please|go on|go ahead|continue)$/;

/** Clauses of a short message, lowercased, with emoji and closing punctuation taken off. */
function clauses(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[:;]-?[)(dpo]/gi, ' ')
    .replace(/[’‘]/g, "'")
    .split(/[,.!?;:…\n]+|\s[—–-]\s/)
    .map((c) => c.replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Nothing but a nod or a yes or no — "ok", "yes", "got it", "sure", "no". In
 * the middle of a conversation that answers what Socria asked, or says go on;
 * it is not small talk to be answered as small talk.
 */
export function onlyANod(text: string): boolean {
  const parts = clauses(spoken(text));
  return parts.length > 0 && parts.length <= 3 && parts.every((c) => phraseRun(c, [ACK, ANSWER_WORD]));
}

/** Every clause of the message is social, and it is short: small talk, with nothing asked for. */
export function smallTalk(text: string): boolean {
  const t = spoken(text);
  if (!t || t.length > 140) return false;
  const parts = clauses(t);
  if (!parts.length || parts.length > 5) return false;
  return parts.every(socialClause);
}

// ── about Socria ────────────────────────────────────────────────────────

const ASKS_ABOUT_SOCRIA = new RegExp(
  [
    String.raw`\bhow (?:are|r) (?:you|u)\b`,
    String.raw`\bhow (?:do|did) you (?:feel|sleep)\b(?! about)`,
    String.raw`\bhow(?:'s| is| was) your (?:day|week|weekend|morning|evening|night)\b`,
    String.raw`\bhow (?:have|'ve) you been\b`,
    String.raw`\b(?:are|r) (?:you|u) (?:ok|okay|alright|conscious|sentient|self[- ]aware|alive|real|human|a (?:person|human|robot|bot|machine|real person|program)|an ai|happy|sad|lonely|bored|tired|awake|ever)\b`,
    String.raw`\bdo you (?:ever )?(?:get (?:bored|tired|lonely|sad|annoyed|angry|confused|frustrated|happy)|feel(?! like (?:i|we|it|this|that))|sleep|dream|eat|have (?:feelings|emotions|a body|a name|friends|preferences|opinions|a favou?rite|consciousness|a personality|a life|a gender|thoughts)|enjoy (?:this|talking|your)|remember (?:me|our|anything)|miss|care about|mind (?:if|when|being)|like (?:being|it when|talking|your job|me))\b`,
    String.raw`\bwhat (?:do|did) you (?:do (?:for fun|all day|today|when)|like to do|enjoy|dream about|think about all day)\b`,
    String.raw`\bwhat(?:'s| is| are) your (?:favou?rite|hobbies|day like|name|pronouns)\b`,
    String.raw`\b(?:who|what) (?:are you|made you|built you|created you)\b`,
    String.raw`\btell me (?:about|a bit about) yourself\b`,
    String.raw`\bcan you (?:feel|think|dream|love|get bored)\b`,
  ].join('|'),
  'i'
);
/** Words that make a question about Socria a question about minds, not a pleasantry. */
const NATURE = /\b(?:conscious\w*|sentien\w*|self[- ]aware\w*|alive|real|feelings|emotions|think|mind|soul|experience|free will|understand|suffer)\b/i;

/** They asked about Socria — how it is, what it is, what it likes. A question, not a remark. */
export function asksAboutSocria(text: string): boolean {
  const t = spoken(text);
  if (!t || t.length > 300) return false;
  const question = /\?/.test(t) || /^(?:how|what|who|are|do|can|tell)\b/i.test(t);
  return question && ASKS_ABOUT_SOCRIA.test(t);
}

const sentencesIn = (t: string) => t.split(/(?<=[.!?…])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

/**
 * Nothing in the message but small talk and questions about Socria — "how are
 * you? what's your favourite book?" — so there is no work in it, whatever a
 * fact-reader makes of a sentence that begins "what's".
 */
export function onlyAboutSocria(text: string): boolean {
  const t = spoken(text);
  if (!t || t.length > 300) return false;
  const parts = sentencesIn(t);
  return parts.some((p) => asksAboutSocria(p)) && parts.every((p) => asksAboutSocria(p) || smallTalk(p));
}

/** A clause that only leads into the request: "quick question", "btw", "ok so". */
const PREFACE = /^(?:(?:quick|random|silly|dumb|serious|small|one|another|real quick) question|question|one more thing|(?:ok(?:ay)? )?so|anyway|btw|by the way|also|real quick)$/;

/**
 * The message with what leads into it taken off — "good morning! what is the
 * capital of Peru?" is the question — so the readers that look at how a message
 * begins see where the request begins. Unchanged when it is all greeting, or
 * there is nothing in front.
 */
export function withoutGreeting(text: string): string {
  const t = (text ?? '').trim();
  let rest = t;
  for (let i = 0; i < 3; i++) {
    const m = /^([^,.!?;:—–\n]{1,40})(?:[,.!?;:]+|\s[—–-]\s)\s*/.exec(rest);
    if (!m || rest.length - m[0].length < 2) break;
    const lead = m[1].toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!smallTalk(m[1]) && !PREFACE.test(lead)) break;
    rest = rest.slice(m[0].length);
  }
  return rest;
}

// ── feeling, humour, pushback, brainstorming, discussion ───────────────

const DOWN = new RegExp(
  [
    String.raw`\bi(?:'m| am|'ve been| have been| feel| felt|'m feeling| am feeling)(?: (?:so|really|kind of|kinda|a bit|a little|pretty|super|very|just|totally|completely|honestly|feeling|getting|all))* (?:sad|down|low|depressed|stressed(?: out)?|anxious|nervous|worried|scared|afraid|terrified|overwhelmed|exhausted|tired|drained|burnt out|burned out|lonely|frustrated|upset|angry|annoyed|gutted|heartbroken|miserable|crushed|devastated|hurt|guilty|ashamed|embarrassed|discouraged|hopeless|struggling|not (?:ok|okay|great|good|doing (?:well|great|good)))\b`,
    String.raw`\b(?:rough|bad|hard|tough|long|awful|terrible|horrible|crap|crappy|shitty|exhausting|brutal) (?:day|week|night|morning|month|year|time)\b`,
    String.raw`\bfeeling (?:down|low|blue|off|rough|awful|terrible|crap|crappy|meh|sad|lost)\b`,
    String.raw`\bmy (?:\w+ ){0,2}(?:died|passed away|passed|is (?:sick|ill|unwell|in (?:the )?hospital|dying)|(?:left|dumped) me|broke up with me)\b`,
    String.raw`\bi (?:got|was|have been|'ve been|just got) (?:fired|laid off|dumped|rejected|let go|turned down)\b`,
    String.raw`\bi (?:failed|bombed|flunked|didn'?t (?:get|make) (?:it|the (?:job|offer|internship|cut|team)))\b`,
    String.raw`(?:^|\s)(?:ugh+|sigh|oof)\b`,
    String.raw`[😢😭😞😔😩😫💔]`,
  ].join('|'),
  'iu'
);
const UP = new RegExp(
  [
    String.raw`\bi (?:just )?(?:got|landed|won|earned|received) (?:the |an? |my |into |in |accepted|engaged|married|promoted)(?:(?:job|offer|internship|part|role|grant|scholarship|promotion|raise|place|spot|interview|callback|award|prize|position|fellowship|apartment|house|puppy|dog|cat)\b|accepted|engaged|married|promoted|\w+ (?:program|school|university|college))`,
    // news, not a report: nothing asked between the verb and the end, or an exclamation
    String.raw`\bi (?:just )?(?:passed|aced|nailed|finished|finally finished|submitted|defended|shipped|launched|published|graduated|made it|did it|got in)\b(?=[^.?]*(?:!|$))`,
    String.raw`\bwe (?:won|did it|made it|shipped it|launched it|pulled it off)(?=\s*(?:[!.]|$))`,
    String.raw`\bwe got (?:funded|in|accepted|the (?:deal|contract|grant|funding|offer|job))\b`,
    String.raw`\bi(?:'m| am)(?: (?:so|really|super|very|pretty|just|honestly))* (?:excited|thrilled|happy|stoked|pumped|proud|relieved|over the moon|buzzing|ecstatic|delighted)\b`,
    String.raw`\b(?:good|great|big|amazing|exciting) news\b`,
    String.raw`\bfinally (?:friday|done|finished|over|home)\b`,
    String.raw`(?:^|\s)(?:yay+|woo+(?:hoo+)?|wahoo|hooray|yess+)\b`,
    String.raw`[🎉🥳🙌🤩]`,
  ].join('|'),
  'iu'
);

// A smile is friendliness, not a joke; a wink or a tongue is.
const LAUGH = /(?:^|[\s(])(?:lol+|lmao+|lmfao|rofl|haha+|hehe+|jk|lolol|xd)\b|[😂🤣😆😜😝😉😏🙃]|(?:^|\s)(?:;-?\)|:-?P)(?:\s|$)/iu;
const JOKE_ASK = /\b(?:tell me (?:a |another |your best )?(?:joke|pun|riddle|limerick)|(?:a|any|got any|know any) (?:good |bad |dad )?(?:jokes?|puns?|riddles?)|make me laugh|say something funny|roast me|dad joke|knock[- ]knock|would you rather|be funny)\b/i;
const TEASE = /\b(?:you sound like|you(?:'re| are) such a|you(?:'re| are) (?:a (?:nerd|dork|robot|know-it-all)|funny|hilarious|ridiculous|so (?:dramatic|extra|formal|serious|polite))|nice try|bet you|admit it|that'?s what (?:a robot|an ai) would say)\b/i;

/** Pushback that opens a message answering Socria. "No thanks" and "nope, that's all" are not it. */
const PUSHBACK_OPENS =
  /^(?:no+\b(?![,\s]*(?:thanks|thank you|worries|problem|that'?s (?:all|it|fine|everything)|need|i'?m good|all good))|nope\b(?![,\s]*(?:that'?s (?:all|it)|i'?m good|all good))|nah\b(?![,\s]*(?:i'?m good|all good|thanks))|not really\b|wrong\b|incorrect\b|i disagree|disagree\b|i (?:don'?t|do not) (?:think so|agree|buy (?:it|that)|see it)|that'?s (?:not (?:right|true|correct|how|what)|wrong|incorrect|absurd|ridiculous|nonsense|silly|a stretch|backwards|too simple|oversimplified)|you(?:'re| are) (?:wrong|mistaken|missing)|but\b|actually,|hmm,? (?:no|not sure|i doubt)|are you sure|i'?m not (?:so )?sure (?:about|that)|i'?m not convinced|that doesn'?t (?:make sense|follow|seem right|add up)|come on\b|no way\b|bs\b|really\?)/i;
const PUSHBACK_ANYWHERE = /\b(?:i (?:disagree|don'?t agree|do not agree)|i (?:don'?t|do not) (?:buy (?:it|that)|think (?:that'?s|that is) (?:right|true|fair))|you(?:'re| are) wrong|that(?:'s| is) (?:wrong|not (?:right|true)|absurd|ridiculous|a stretch)|i(?:'m| am) not convinced|(?:doesn'?t|does not) (?:follow|hold up|add up))\b/i;

const BRAINSTORM = /\b(?:brainstorm\w*|spitball\w*|riff(?:ing)? on|bounce (?:some )?ideas|throw (?:out )?(?:some )?ideas|(?:give me|need|want|got|any|some|more|other|fresh|wild|crazy|fun) (?:\w+ )?(?:ideas|suggestions|names|angles|ways to|twists|options for)\b|ideas? (?:for|about|on) |names? for\b|come up with (?:some |a few |more |\w+ )?(?:ideas|names|ways|options|titles|slogans|taglines)|let'?s (?:think of|come up with|brainstorm|generate|dream up)|what if (?:we|i|you|it|they)\b|how might we\b)/i;
const OPINION = /\b(?:what do you (?:think|make) (?:about|of)|what(?:'s| is) your (?:take|view|opinion|stance|read)\b|do you (?:think|believe|reckon|agree)\b|would you (?:say|agree)\b|(?:any |your )thoughts on\b|hot take|unpopular opinion|controversial opinion|is it (?:true|possible|ethical|wrong|right|fair|moral|immoral|better|worse) (?:that|to)\b|(?:is|are) (?:\w+ ){1,4}(?:overrated|underrated|real|a myth|worth (?:it|the hype)|the future|dead|inevitable)\b|which is (?:better|worse)\b|why do (?:people|we|humans)\b)/i;
const BIG_IDEAS = /\b(?:free will|determinism|consciousness|the meaning of life|meaning of (?:it all|life)|morality|moral|ethic(?:s|al)|justice|philosoph\w*|existential|god|religion|truth|beauty|human nature|society|democracy|capitalism|socialism|the future of|purpose|identity|the mind|reality|the universe|art)\b/i;
/** A view of their own, offered: "I think…", "hot take:". Not a plan of their own ("I think I should…"). */
const OFFERS_VIEW = /^(?:honestly,? |personally,? |tbh,? )?(?:i (?:think|believe|reckon|suspect|feel like)|hot take|unpopular opinion|controversial opinion)\b/i;
const THEIR_PLAN = /\b(?:i|we) (?:should|might|could|will|'ll|need to|have to|want to)\b|\bmy (?:plan|essay|draft|thesis|code|project|idea|business|job|team)\b/i;
/** Socria's own view, asked for in so many words. */
const ASKS_VIEW = /\b(?:what do you (?:think|make) (?:about|of)|what(?:'s| is) your (?:take|view|opinion|read)\b|(?:any |your )thoughts on\b|do you (?:think|reckon)\b|would you say\b)/i;
/** A thing they made, to be read and worked on: feedback on it is work, not a discussion. */
const THEIR_WORK = /\bmy (?:essay|draft|thesis|paper|code|script|function|query|resume|résumé|cv|cover letter|story|poem|article|post|slides?|deck|report|proposal|chapter|outline|app|website|design|answer|proof|solution)\b/i;

const CASUAL = /(?:^|\s)(?:lol|lmao|haha+|hehe|ya|yah|u|ur|gonna|wanna|gotta|kinda|sorta|tbh|ngl|idk|omg|btw|rn|pls|plz|thx|nah|yep|yup|dunno|ok|okay|cool|hey|hi|yo|sup)(?=[\s.,!?]|$)|!!|\?\?|[\u{1F300}-\u{1FAFF}]/iu;

/** How they wrote this message: how many words, and whether casually. */
export function mannerOf(text: string): Exchange['manner'] {
  const t = spoken(text);
  const words = t ? t.split(/\s+/).length : 0;
  const lowerStart = /^[a-z]/.test(t);
  const noEnd = !!t && !/[.?!…)"'”]$/.test(t);
  return { words, casual: CASUAL.test(t) || (lowerStart && noEnd && words <= 20) };
}

/** Where each feeling was said, the later one counting: "ugh, long week. finally friday" ends glad. */
function feelingOf(t: string): 'up' | 'down' | null {
  const last = (re: RegExp) => {
    let at = -1;
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (let m = g.exec(t); m; m = g.exec(t)) {
      at = m.index;
      if (!m[0].length) g.lastIndex++;
    }
    return at;
  };
  const down = last(DOWN);
  const up = last(UP);
  if (down < 0 && up < 0) return null;
  return up > down ? 'up' : 'down';
}

export function readExchange(i: ExchangeInput): Exchange {
  const t = spoken(i.text ?? '');
  const s = i.signals ?? {};
  const reasons: string[] = [];
  const manner = mannerOf(t);
  const aboutSocria = asksAboutSocria(t);
  const saidFeeling = s.safety || s.vent ? 'down' : feelingOf(t);
  const wantsJoke = JOKE_ASK.test(t);
  const joking = wantsJoke || LAUGH.test(t) || TEASE.test(t);
  const done = (kind: ExchangeKind, why: string): Exchange => ({ kind, aboutSocria, saidFeeling, joking, wantsJoke, manner, reasons: [...reasons, why] });
  if (!t) return done('conversation', 'empty');

  // Danger, or "I just need to vent": the person, before anything else.
  if (s.safety) return done('personal', 'safety');

  // Pushback on what Socria just said: only when Socria said something — and
  // a bare "no" to a question Socria asked is an answer, not an argument.
  const replies = (i.history ?? []).filter((m) => m.role === 'assistant');
  const answered = replies.length > 0;
  const askedLast = answered && /\?["'’”)\]*_]*\s*$/.test(replies[replies.length - 1].content.trim());
  if (answered && !s.correction && !smallTalk(t) && !(askedLast && onlyANod(t)) && (PUSHBACK_OPENS.test(t) || PUSHBACK_ANYWHERE.test(t))) return done('disagreement', 'pushback');

  // Work in the message: a task, unless what they want is ideas or a view.
  // Their view of a plan or an idea, asked for, is a discussion; their essay
  // or their code, handed over for a read, is work.
  const asksView = ASKS_VIEW.test(t) && !THEIR_WORK.test(t);
  if (i.task) {
    if (i.work === 'judgment' || i.work === 'verification') return done('task', 'work');
    if (BRAINSTORM.test(t) && !s.recommendationRequested) return done('brainstorm', 'ideas');
    if (asksView || (OPINION.test(t) && !THEIR_PLAN.test(t))) return done('discussion', 'opinion');
    return done('task', 'work');
  }

  if (s.vent) return done('personal', 'vent');
  // "ok", "yes", "no" once the conversation is under way: the thread goes on,
  // and the reply decides from it — not small talk, and not a line that says so.
  if (answered && onlyANod(t)) return done('conversation', 'nod');
  if (smallTalk(t)) return done('social', aboutSocria ? 'how-are-you' : 'small-talk');
  if (saidFeeling) return done('personal', `feeling:${saidFeeling}`);
  if (wantsJoke) return done('playful', 'joke-asked');
  if (joking) return done('playful', 'joking');
  if (aboutSocria) return done(NATURE.test(t) ? 'discussion' : 'social', 'about-socria');
  if (BRAINSTORM.test(t) || ((i.mapContext === 'brainstorming' || i.mapContext === 'creating') && /^(?:and|also|plus|another|oh,?\s+and|maybe|or)\b/i.test(t))) return done('brainstorm', 'ideas');
  if (asksView || (OPINION.test(t) && !THEIR_PLAN.test(t))) return done('discussion', 'opinion');
  if (BIG_IDEAS.test(t) && /\?/.test(t) && !THEIR_PLAN.test(t)) return done('discussion', 'big-question');
  if (OFFERS_VIEW.test(t) && !THEIR_PLAN.test(t)) return done('discussion', 'a-view');
  return done('conversation', 'talk');
}
