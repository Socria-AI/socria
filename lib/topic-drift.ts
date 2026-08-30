// lib/topic-drift.ts
//
// "Did this message go to the wrong conversation?"
//
// The asymmetry here is the whole design. Missing a genuinely misfiled
// message costs a shrug. Interrupting someone who meant exactly what they
// said costs their trust in every future prompt, and they will start reading
// the interface instead of their own thinking. So this refuses far more often
// than it fires, and every rule below is written to make firing harder.
//
// Deterministic and local. It runs once, at submission — never while typing —
// and never calls a model, so it cannot be slow, cannot be expensive, and
// cannot be non-deterministic in a way that makes a false positive
// unreproducible.

/** Coarse subject areas. Two named, different domains is the core signal. */
export type Domain =
  | 'math'
  | 'writing'
  | 'code'
  | 'career'
  | 'marketing'
  | 'science'
  | 'personal'
  | 'business';

const DOMAIN_MARKS: [Domain, RegExp][] = [
  ['math', /\b(lim|derivative|integral|equation|theorem|proof|calculus|algebra|matrix|probability|graph of|solve for|asymptote|polynomial|converge)\b/i],
  ['code', /\b(function|api|bug|deploy|typescript|python|repo|refactor|endpoint|compile|stack trace|database|commit)\b/i],
  ['writing', /\b(paragraph|essay|draft|prose|sentence|chapter|thesis statement|edit this|rewrite|tone|manuscript)\b/i],
  ['marketing', /\b(caption|instagram|linkedin|tweet|post for|brand|campaign|audience|launch post|copy for|tagline|followers)\b/i],
  ['career', /\b(job|salary|offer|resume|cv|interview|promotion|manager|quit|career|hiring)\b/i],
  ['science', /\b(experiment|hypothesis|molecule|cell|reaction|physics|chemistry|biology|dataset|clinical)\b/i],
  ['business', /\b(revenue|pricing|customer|startup|investor|runway|margin|market fit|cofounder)\b/i],
  ['personal', /\b(my (mum|mom|dad|partner|friend|therapist)|feeling|anxious|relationship|sleep|grief)\b/i],
];

/** Every domain the text visibly belongs to. */
export function domainsOf(text: string): Set<Domain> {
  const out = new Set<Domain>();
  for (const [d, re] of DOMAIN_MARKS) if (re.test(text)) out.add(d);
  return out;
}

const STOP = new Set(
  ('a an the and or but if then than that this these those is are was were be been being do does did of to in on at for with from by as it its i you we they he she' +
    ' what why how when where which who can could would should will not no yes so just about into over under out up down my your our their me him her them there here')
    .split(' ')
);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

/** Share of the message's own content words that the conversation has used. */
function overlap(message: string, conversation: string): number {
  const m = words(message);
  if (!m.size) return 1; // nothing to judge; treat as related
  const c = words(conversation);
  let hit = 0;
  for (const w of m) if (c.has(w)) hit++;
  return hit / m.size;
}

/**
 * Messages that are ABOUT the conversation rather than in its subject —
 * "can you explain that again", "why?", "keep going". They share almost no
 * vocabulary with anything and would otherwise look maximally unrelated,
 * which is exactly backwards.
 */
const CONTINUATION =
  /^\s*(ok|okay|yes|no|thanks?|got it|i see|hmm+|wait|and|but|so|why|how|what about|explain|again|more|keep going|continue|go on|elaborate|simpler|slower|show me|sorry)\b/i;

/** A request to change subject on purpose is not a misfiled message. */
const DELIBERATE =
  /\b(new topic|changing (the )?subject|unrelated|off topic|different question|switching gears|by the way|btw|side note|quick question|random but|while i('| a)m here)\b/i;

export interface DriftInput {
  /** what they just sent */
  message: string;
  /** the conversation's title, if it has earned one */
  title?: string;
  /** the last several messages, any role */
  recent: string[];
  /** the map's reading of the work, when there is one */
  context?: string;
  /** how many times this person has waved the suggestion away */
  dismissals?: number;
}

export interface DriftVerdict {
  /** only ever true at high confidence */
  flag: boolean;
  /** the domain the message looks like it belongs to, when nameable */
  domain?: Domain;
  /** why, for the log and for anyone debugging a false positive */
  reason: string;
}

/** After this many "continue here"s, stop asking. */
export const DRIFT_DISMISS_LIMIT = 3;
/** A conversation shorter than this has no established topic to diverge from. */
const MIN_TURNS = 4;
/** Below this share of shared vocabulary the message looks like a stranger. */
const MAX_OVERLAP = 0.06;
/** Short messages carry too little signal to judge. */
const MIN_WORDS = 5;

/**
 * The verdict. Every branch above the last one is a reason NOT to fire, which
 * is the correct shape for this feature: the default is silence, and the
 * suggestion has to earn its way past all of them.
 */
export function readDrift(input: DriftInput): DriftVerdict {
  const no = (reason: string): DriftVerdict => ({ flag: false, reason });

  if ((input.dismissals ?? 0) >= DRIFT_DISMISS_LIMIT) {
    return no('this person has waved it away enough times');
  }
  if (input.recent.length < MIN_TURNS) return no('no established topic yet');

  const msg = input.message.trim();
  const wordCount = msg.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_WORDS) return no('too short to judge');
  if (CONTINUATION.test(msg)) return no('reads as a continuation');
  if (DELIBERATE.test(msg)) return no('they signalled the change themselves');

  const convo = input.recent.slice(-12).join('\n');
  const conversationDomains = domainsOf(`${input.title ?? ''}\n${convo}`);
  if (input.context === 'math') conversationDomains.add('math');
  const messageDomains = domainsOf(msg);

  // A named domain shared with the conversation settles it immediately.
  for (const d of messageDomains) {
    if (conversationDomains.has(d)) return no(`shares the ${d} domain`);
  }

  const share = overlap(msg, `${input.title ?? ''}\n${convo}`);
  if (share > MAX_OVERLAP) return no(`shares vocabulary (${share.toFixed(2)})`);

  // Both sides must be recognisably ABOUT something, and about different
  // things. "Unrecognised" is not a domain — an unfamiliar subject is the
  // commonest thing in the world and must never be read as misfiled.
  if (!conversationDomains.size) return no('conversation has no nameable domain');
  if (!messageDomains.size) return no('message has no nameable domain');

  const domain = [...messageDomains][0];
  return {
    flag: true,
    domain,
    reason: `looks like ${domain}; conversation is ${[...conversationDomains].join('/')}, and they share almost no vocabulary (${share.toFixed(2)})`,
  };
}
