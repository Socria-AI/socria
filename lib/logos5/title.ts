// lib/logos5/title.ts — WHAT A LINE OF THINKING IS CALLED.
//
// Alex Tran: a node on the Universal Map never mirrors the prompt. "Help me
// study for this big bio test tomorrow night please" is a request; the thing
// it is about is "Biology – Exam Review". Five to seven words at most.
//
// Two passes. This one is immediate and deterministic: the request's own
// scaffolding taken off (help me, can you, please, tomorrow night, lol), the
// common course abbreviations written out, a study request named as a review,
// cut to seven words and set in title case. Then, once per conversation, a
// small model names the topic as a concept (app/api/extract-memory,
// `titleStyle: 'topic'`) — and a title the person chose is never replaced.
//
// Pure.

export const MAX_TITLE_WORDS = 7;

const COURSES: Record<string, string> = {
  bio: 'Biology',
  biology: 'Biology',
  chem: 'Chemistry',
  orgo: 'Organic Chemistry',
  ochem: 'Organic Chemistry',
  calc: 'Calculus',
  econ: 'Economics',
  micro: 'Microeconomics',
  macro: 'Macroeconomics',
  psych: 'Psychology',
  stats: 'Statistics',
  stat: 'Statistics',
  phys: 'Physics',
  physics: 'Physics',
  hist: 'History',
  lit: 'Literature',
  cs: 'Computer Science',
  compsci: 'Computer Science',
  linalg: 'Linear Algebra',
  anat: 'Anatomy',
  'a&p': 'Anatomy and Physiology',
  apush: 'US History',
  gov: 'Government',
  philo: 'Philosophy',
  soc: 'Sociology',
  bio2: 'Biology',
};

const EXAMS = /\b(?:test|exam|midterm|final|finals|quiz|mcat|lsat|sat|act|gre|gmat|boards?)\b/i;
const STUDYING = /\b(?:study(?:ing)?|revise|revising|review(?:ing)?|cram(?:ming)?|prep(?:are|aring)?)\b/i;

/** Openings that are the request, not its subject. */
const LEADS = [
  /^(?:hey|hi|hello|yo|ok(?:ay)?|so|um+|uh+|well)[,!.\s]+/i,
  /^(?:can|could|would|will) you(?: please)?(?: help me(?: to)?)?\s+/i,
  /^(?:please\s+)?help me(?: to| with| figure out| understand| think through)?\s+/i,
  /^(?:i(?:'d| would) like(?: you)? to|i want(?: you)? to|i need(?: you)?(?: help)?(?: to| with)?|i(?:'m| am) trying to|let'?s|let me)\s+/i,
  /^(?:tell me(?: about)?|explain(?: to me)?|teach me(?: about)?|show me)\s+/i,
  /^(?:what(?:'s| is| are)|who(?:'s| is)|how (?:do|does|can|should) (?:i|you|we)|how to|why (?:is|are|do|does))\s+/i,
  /^(?:please)\s+/i,
  /^(?:write|draft|compose|make|create|give|build|generate|put together)(?: me| us)?\s+(?:(?:a|an|the|some|my)\s+)?/i,
];

/** Endings that are the moment, not the subject. */
const TAILS = [
  /[\s,]+(?:please|pls|plz|thanks|thank you|thx|lol|lmao|asap|real quick|quickly|for me|if you can|if possible)[\s.!?]*$/i,
  /[\s,]+(?:to me|for me)?\s*(?:like i(?:'m| am) (?:five|5|a (?:kid|child|beginner)))[\s.!?]*$/i,
  /[\s,]+(?:to me|for me|for us)[\s.!?]*$/i,
  /[\s,]+(?:tomorrow|tonight|today|this (?:week|weekend|morning|afternoon|evening)|next (?:week|month)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?: (?:night|morning|afternoon|evening))?[\s.!?]*$/i,
];

const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'vs', 'via', 'from', 'into', 'as']);
const EDGE_STOP = new Set([...SMALL, 'my', 'our', 'this', 'that', 'these', 'those', 'some', 'big', 'little', 'about', 'it', 'is', 'are', 'i', 'me', 'we', 'you']);

function titleCase(words: string[]): string {
  return words
    .map((w, i) => {
      if (/^[A-Z0-9][A-Z0-9&.-]+$/.test(w) && w.length <= 5) return w; // an acronym stays as written
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Clip to the word limit, never mid-word, never ending on a small word. */
export function clipTitle(t: string, max = MAX_TITLE_WORDS): string {
  const words = t.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  let out = words.slice(0, max);
  while (out.length > 1 && EDGE_STOP.has(out[out.length - 1].toLowerCase().replace(/[^a-z&]/g, ''))) out = out.slice(0, -1);
  return out.join(' ').replace(/[\s,:;–-]+$/, '');
}

/**
 * A node's label on the Universal Map (Alex Tran): at most seven words of the
 * title — an ellipsis when there was more — so a long title never breaks the
 * node it names. The whole title is still the conversation's, for search and
 * for the hover.
 */
export function nodeLabel(title: string): string {
  const full = String(title ?? '').replace(/\s+/g, ' ').trim();
  const cut = clipTitle(full);
  return cut.length < full.length ? `${cut}…` : full;
}

/** The first message, as a title: its subject, at most seven words. '' when there is nothing to name. */
export function topicTitle(text: string): string {
  let t = String(text ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[`*_#>]/g, ' ')
    .split(/(?<=[.!?])\s+|\n/)[0]
    // "I want to start a bakery in Austin, how do I price…" — the first clause names it
    .replace(/^([^,]{12,}?),\s.*$/, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  if (!t) return '';

  // A study request is named for the course and the exam, when it says them.
  const words = t.toLowerCase().replace(/[^a-z0-9&\s]/g, ' ').split(/\s+/).filter(Boolean);
  const course = words.map((w) => COURSES[w]).find(Boolean);
  if (course && (STUDYING.test(t) || EXAMS.test(t))) return clipTitle(`${course} – ${EXAMS.test(t) ? 'Exam Review' : 'Review'}`);

  for (let pass = 0; pass < 3; pass++) {
    for (const re of LEADS) t = t.replace(re, '');
    for (const re of TAILS) t = t.replace(re, '');
  }
  t = t.replace(/[?!.]+$/, '').trim();
  if (!t) return '';
  let parts = t.split(/\s+/).map((w) => w.replace(/^[^\w&$£€]+|[^\w&%)]+$/g, '')).filter(Boolean);
  // course abbreviations, written out
  parts = parts.map((w) => COURSES[w.toLowerCase()] ?? w);
  while (parts.length > 1 && EDGE_STOP.has(parts[0].toLowerCase())) parts = parts.slice(1);
  return clipTitle(titleCase(parts));
}

/** A title the model offered, held to the same limit and kept from echoing the request. */
export function acceptTitle(suggested: unknown, firstMessage: string): string | null {
  if (typeof suggested !== 'string') return null;
  const t = clipTitle(suggested.replace(/["“”]/g, '').replace(/[.!?]+$/, '').trim());
  if (!t || t.length < 3) return null;
  // the request handed back is not a title
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (norm(firstMessage).startsWith(norm(t)) && norm(t).split(' ').length > 3) return null;
  return t;
}
