// lib/core4/questions.ts
//
// Interrogative work in what Socria actually SAYS, whatever the move is called.
//
// The old question limit priced only the move labelled ASK. A HINT that was
// two questions, or a CHALLENGE ending "what would happen if…?", cost nothing
// — so once asking was priced out, the questions moved into other labels and
// the person kept getting interviewed. The fix is to measure the thing the
// person experiences: sentences that hand them thinking to do. That includes
// the disguised forms — "consider whether…", "ask yourself…", "it might be
// worth thinking about…" — which are questions with the question mark taken
// off, and which perform exactly the same function.
//
// Pure. Deterministic.

/** Code and quotations are set aside: a question inside them is not put to the person. */
function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    // A blockquote is text Socria wrote FOR them — a draft email, a quoted
    // passage — not something it asks them (run 4, expert-017).
    .replace(/^[ \t]*>.*$/gm, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/[“"][^”"\n]{0,300}[”"]/g, ' ');
}

/**
 * Sentences, each with its trailing punctuation and whitespace, in order.
 *
 * A sentence ends at terminal punctuation — with any closing quotes,
 * brackets or markdown emphasis after it — followed by whitespace or the
 * end; or at a newline. So "1.3558" and "e.g." mid-sentence do not split,
 * and "**Revenue.** Exempting…" keeps its bold markers together (a deletion
 * that split them left a stray "**" in front of the next sentence).
 */
export function sentencesOf(text: string): string[] {
  // Abbreviations never end a sentence (council D4): "e.g." was splitting
  // a sentence in two, and half of it was then taken for a closing offer.
  const ABBR = /\b(e\.g|i\.e|etc|vs|cf|et al|approx|Dr|Mr|Mrs|Ms|St|No|Fig|Eq|p|pp)\.(?=\s)/g;
  const shielded = text.replace(ABBR, (m) => m.slice(0, -1) + '\u2024');
  const out0 = shielded.match(/(?:[^.!?\n]|[.!?](?![.!?]*["'’”)\]*_]*(?:\s|$)))+(?:[.!?]+["'’”)\]*_]*(?=\s|$)|\n+|$)\s*/g) ?? [];
  return out0.map((s) => s.replace(/\u2024/g, '.')).filter((s) => s.trim());
}

/** A bare markdown header sentence: "**Revenue.**", "### Costs". */
const HEADER = /^(?:\*\*[^*\n]{1,80}\*\*|__[^_\n]{1,80}__|#{1,6} [^\n]{1,80})\s*$/;

/**
 * The text with the named sentences removed — matched by containment in
 * either direction, so a quote that includes or omits a bold lead-in still
 * finds its sentence — and any header left with nothing under it removed
 * too. Null if nothing is left. Code blocks are never touched.
 */
export function deleteSentences(text: string, drop: readonly string[]): string | null {
  const targets = drop.map((d) => d.trim()).filter(Boolean);
  if (!targets.length) return text.trim() || null;
  const blocks: string[] = [];
  const shielded = text.replace(/```[\s\S]*?```/g, (m) => {
    blocks.push(m);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  const parts = sentencesOf(shielded);
  const gone = parts.map((raw) => {
    const t = raw.trim();
    if (!t || t.includes('\u0000')) return false;
    // Exact always; containment only between substantial texts, so a short
    // fragment cannot take an unrelated sentence with it.
    return targets.some((d) => d === t || (t.length >= 12 && d.length >= 12 && (d.includes(t) || t.includes(d))));
  });
  const kept: string[] = [];
  parts.forEach((raw, i) => {
    if (gone[i]) return;
    // A header whose content was all deleted: the next surviving sentence is
    // a new paragraph (or there is none), and the one after it was removed.
    if (HEADER.test(raw.trim()) && gone[i + 1]) {
      let j = i + 1;
      while (j < parts.length && gone[j]) j++;
      const nextStartsParagraph = j >= parts.length || /\n\s*$/.test(parts[j - 1]) || HEADER.test(parts[j].trim());
      if (nextStartsParagraph) return;
    }
    kept.push(raw);
  });
  const out = kept.join('').replace(/\u0000(\d+)\u0000/g, (_, n) => blocks[Number(n)]).replace(/\n{3,}/g, '\n\n').trim();
  return out || null;
}

const WH = String.raw`(?:whether|what|how|why|which|where|when|who|if)`;

/**
 * Directing the person to do the thinking, without a question mark.
 * Each needs a wh-clause (or an explicit "yourself") after the verb, so
 * "Consider the case x = 0: …" — which SUPPLIES content — is not counted.
 */
const DISGUISED = new RegExp(
  [
    String.raw`^(?:so,?\s+|now,?\s+|maybe\s+|perhaps\s+|first,?\s+|next,?\s+)?(?:think about|consider|reflect on|ponder|notice|figure out|work out)\s+${WH}\b`,
    String.raw`^(?:so,?\s+|now,?\s+)?ask yourself\b`,
    String.raw`^(?:so,?\s+|now,?\s+)?(?:try to|see if you can)\s+(?:figure|work|think|spot|find|notice)\b`,
    String.raw`\b(?:i(?:'d| would)|let me) (?:encourage|invite|challenge|urge) you to (?:think|consider|reflect|ask)\b`,
    String.raw`\bit (?:might|may|could|would) be worth (?:thinking|considering|asking yourself|reflecting)\b`,
    String.raw`\bworth (?:thinking|asking yourself) (?:about )?${WH}\b`,
    String.raw`^(?:so,?\s+)?what do you think\b`,
    String.raw`^i wonder ${WH}\b`,
    String.raw`^(?:so,?\s+)?how (?:might|would|could) you\b`,
  ].join('|'),
  'i'
);

/** Closing offers: a request for more of the person's time, not a move. */
// Closing offers, and comprehension checks that are always stripped (council D4).
// An offer has a first-person shape (council D4): "I can also…", "want me
// to…", "let me know if…". A conditional that gives ADVICE ("If you want
// something to suggest, a short comment would…") is not an offer — run 1
// deleted one from the middle of a reply because it started "If you want".
//
// The help-desk forms are offers too, whatever their punctuation: "How can I
// help you today?", "Is there anything else I can do?", "What would you like to
// work on?", "I'm here and ready to assist." They ask for nothing the person
// could answer except by starting a task, and they were what a hello got back.
const OFFER = /^(?:let me know|feel free to (?:ask|reach|ping|let me)|if you(?:'d| would) like(?:,)? (?:i|me)\b|if you want(?:,)? (?:i|me)\b|if (?:that|this) helps,? (?:i|let me)\b|want me to|shall i|should i|would you like (?:me|to see|a|an|the)|happy to|i can also|do you want me to|does (?:that|this) (?:make sense|help)|make sense\?|any questions|is (?:that|this) clear|sound good|hope (?:this|that) helps|how (?:can|may) i (?:help|assist)|what can i (?:help you with|do for you)|(?:is there )?anything (?:else )?(?:i can (?:help|do)|you(?:'d| would) like (?:me )?to|you want (?:me )?to)|what would you like to (?:work on|focus on|explore|tackle|dig into)|what are you working on|what brings you (?:here|in|by|to socria)|what(?:'s| is) on (?:your|the) agenda|(?:i'?m|i am) (?:always )?(?:here|ready|available) (?:and ready )?(?:to (?:help|assist)|if you need)|i'?d be (?:happy|glad|delighted) to (?:help|assist)|i(?:'m| am) all ears)\b/i;

// The one-time notice that something is held back and how to get it
// (council D6: a withhold is disclosed once, with the way out). Never a
// question to strip: run 6 (learning-020) lost "…if you'd rather just have
// the answer, say so and I'll give it to you" as a "disguised question"
// because the sentence opened "Work out what that means…".
const DISCLOSURE = /\b(?:say so|just ask|say the word|ask and i'?ll|ask for it and|if you(?:'d| would) rather (?:just )?have (?:it|the answer|the fix))\b/i;

const SYCOPHANCY = /^(?:great|excellent|good|fantastic|wonderful|interesting|fascinating) (?:question|point|thought|observation)[.!,]?|^(?:you(?:'re| are) (?:absolutely |completely |totally )?right)[.!,]|^(?:what a (?:great|good|fascinating) )|^(?:i love (?:this|that|how you))/i;

/**
 * Generic reassurance and hedged advice: the sentences that make a reply read
 * as a chatbot rather than a person.
 *
 * THESE ARE OBSERVED, NOT IMAGINED. Reported from a live reply to "I'm worried
 * about whether I'm doing enough for McCombs": a line telling them the feeling
 * was natural, then advice that would have fitted any applicant. The move block
 * now forbids both, but a prompt is a probability and a person who gets the
 * paragraph anyway is not consoled by the instruction having existed.
 *
 * ONLY EVER APPLIED TO THE OPENING SENTENCE, and only on a turn that was marked
 * brief. Mid-reply the same words can be load-bearing — "it is worth noting
 * that the migration is idempotent" is a real caveat — and council D4 forbids
 * cutting from the middle of a reply regardless.
 */
const FILLER = /^(?:it(?:'s| is) (?:completely |perfectly |totally |entirely )?(?:natural|normal|understandable|common|okay|ok|fine|valid)\b|(?:that|this) (?:is|sounds like) a (?:completely |perfectly )?(?:natural|normal|understandable|common|valid)\b|(?:many|most|a lot of|plenty of) (?:people|students|founders|applicants|engineers)\b.{0,60}\b(?:feel|worry|wonder|struggle|experience)\b|(?:first(?:ly)?,? )?(?:let me|i want to) (?:acknowledge|validate|say)\b|(?:i (?:can )?(?:hear|sense|understand) (?:that|how|why|you))\b|(?:what you(?:'re| are) (?:feeling|describing|going through) is)\b)/i;

/** Does the reply OPEN with generic reassurance or a hedge? */
export function hasFillerOpener(text: string): boolean {
  const first = sentencesOf(text.trim())[0]?.trim() ?? '';
  return FILLER.test(first);
}

/**
 * The reply without its filler opening sentence; null if nothing substantive
 * is left, which sends the turn back to be written again rather than shipping
 * a fragment.
 */
export function stripFillerOpener(text: string): string | null {
  const t = text.trim();
  if (!hasFillerOpener(t)) return t;
  const parts = sentencesOf(t);
  const rest = parts.slice(1).join('').trim();
  if (!rest) return null;
  // A remaining reply that is only a few words was carried by the sentence just
  // removed; better to regenerate than to ship the remnant.
  return rest.split(/\s+/).length >= 5 ? rest.charAt(0).toUpperCase() + rest.slice(1) : null;
}

export interface Interrogatives {
  explicit: string[];
  disguised: string[];
  offers: string[];
}

/**
 * `lineHead` is what the line held before this text began (the stream gate
 * sees sentences without their line), and `draft` says the text lies inside
 * a draft written for somebody else (see quotedOrDraft). Either way, quoted
 * material is not a question or an offer put to the person, and nothing in it
 * is counted. Unset: the text is read as it stands.
 */
export function interrogatives(text: string, lineHead = '', draft = false): Interrogatives {
  const out: Interrogatives = { explicit: [], disguised: [], offers: [] };
  if ((lineHead || draft) && quotedOrDraft(lineHead, text, draft)) return out;
  for (const raw of sentencesOf(prose(text))) {
    // A sentence that opens a blockquote line (the stream gate sees sentences
    // without their line) is quoted material, not a question to them.
    if (/^\s*>/.test(raw)) continue;
    const s = raw.trim().replace(/^[-*•\d.)\s]+/, '');
    if (!s || DISCLOSURE.test(s)) continue;
    if (OFFER.test(s)) out.offers.push(raw.trim());
    else if (/\?["'’”)\]]*\s*$/.test(s)) out.explicit.push(raw.trim());
    else if (DISGUISED.test(s)) out.disguised.push(raw.trim());
  }
  return out;
}

/** How much interrogative work a reply puts to the person. Offers are not counted here. */
export function questionLoad(text: string): number {
  const q = interrogatives(text);
  return q.explicit.length + q.disguised.length;
}

export function asksAnything(text: string): boolean {
  return questionLoad(text) > 0;
}

/**
 * How many of Socria's most recent replies in a row put interrogative work to
 * the person, and the share of the last `window` replies that did.
 * Read from the transcript the person saw — the move labels do not matter.
 */
export function questionPressure(
  messages: readonly { role: string; content: string }[],
  window = 6
): { streak: number; density: number; recent: number } {
  const replies = messages.filter((m) => m.role === 'assistant');
  let streak = 0;
  for (let i = replies.length - 1; i >= 0; i--) {
    if (!asksAnything(replies[i].content)) break;
    streak++;
  }
  const recent = replies.slice(-window);
  const density = recent.length ? recent.filter((m) => asksAnything(m.content)).length / recent.length : 0;
  // Question-bearing replies among the last three (council D4: at most one
  // in any four consecutive replies outside practice).
  const last3 = replies.slice(-3).filter((m) => asksAnything(m.content)).length;
  return { streak, density, recent: last3 };
}

/**
 * The reply with interrogative work beyond `keep` removed, closing offers
 * removed, and a sycophantic opener removed. Returns null if nothing of
 * substance would remain — the caller must then regenerate rather than send
 * an empty or gutted reply.
 *
 * Deterministic and conservative: it deletes sentences, never rewrites them.
 */
export function stripInterrogatives(text: string, keep: 0 | 1 = 0): { text: string | null; removed: string[] } {
  const removed: string[] = [];
  // Work on the reply with code blocks and blockquotes protected: sentences
  // inside code, or inside a draft written for them, are never removed.
  const blocks: string[] = [];
  const shielded = text.replace(/```[\s\S]*?```|^[ \t]*>.*$/gm, (m) => {
    blocks.push(m);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  const parts = sentencesOf(shielded);
  let kept = 0;
  const out: string[] = [];
  parts.forEach((raw, i) => {
    const s = raw.trim().replace(/^[-*•\d.)\s]+/, '');
    if (s.includes('\u0000')) {
      out.push(raw);
      return;
    }
    if (DISCLOSURE.test(s)) {
      out.push(raw);
      return;
    }
    if (i === 0 && SYCOPHANCY.test(s)) {
      const rest = raw.replace(SYCOPHANCY, '').replace(/^[\s,.!-]+/, '');
      removed.push(raw.trim());
      if (rest.trim()) out.push(rest.charAt(0).toUpperCase() + rest.slice(1));
      return;
    }
    if (OFFER.test(s)) {
      removed.push(raw.trim());
      return;
    }
    const isQ = /\?["'’”)\]]*\s*$/.test(s) || DISGUISED.test(s);
    if (isQ) {
      if (kept < keep) {
        kept++;
        out.push(raw);
      } else {
        removed.push(raw.trim());
      }
      return;
    }
    out.push(raw);
  });
  const joined = out
    .join('')
    .replace(/\u0000(\d+)\u0000/g, (_, n) => blocks[Number(n)])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Substance: at least one non-trivial sentence left.
  const substantive = sentencesOf(prose(joined)).some((s) => s.trim().split(/\s+/).length >= 4) || /```/.test(joined);
  return { text: substantive ? joined : null, removed };
}

export function hasSycophanticOpener(text: string): boolean {
  const first = sentencesOf(text.trim())[0]?.trim() ?? '';
  return SYCOPHANCY.test(first);
}

/** The reply without its sycophantic opener (and nothing else changed); null if nothing is left. */
export function stripSycophanticOpener(text: string): string | null {
  const t = text.trim();
  if (!hasSycophanticOpener(t)) return t;
  const rest = t.replace(SYCOPHANCY, '').replace(/^[\s,.!—-]+/, '');
  return rest.trim() ? rest.charAt(0).toUpperCase() + rest.slice(1) : null;
}

// ── Somebody else's words: quotations, tables, drafts and lists ──────
//
// THE CLOSING-OFFER RULE WAS DELETING WHAT THEY ASKED FOR. The stream gate
// reads a reply a sentence at a time, and a sentence does not carry its line
// with it: the second sentence of a blockquote line ("> Hi Sam, … Could you
// send someone this week? Let me know if you have any questions.") reached
// interrogatives() without its ">", was read as Socria's own closing offer,
// and was dropped from the end of the draft the person had asked for. The
// same went for the last line of an unquoted email, a table cell, and the
// third of "three polite ways to end a work email". So the line a sentence
// sits on, and whether it lies inside a draft written for somebody else, are
// decided here, once, and the gate and interrogatives() both read the answer.
// A miss keeps a sentence that might have gone; that is the safe direction,
// because keeping content beats deleting it.

/** A line that is quoted (a blockquote) or a row of a table: somebody else's words, or cells. */
export function quotedOrTableLine(line: string): boolean {
  return /^[ \t]{0,3}(?:>|\|)/.test(line);
}

/** A line of a markdown list: "- item", "* item", "2. item", "3) item". */
export const LIST_ITEM = /^[ \t]*(?:[-*+•]|\d{1,3}[.)])[ \t]+/;

/** The line this text starts on, given what the line held before it (`lineHead`). */
function lineAt(lineHead: string, piece: string): string {
  const text = lineHead + piece;
  const first = text.search(/\S/);
  if (first < 0) return '';
  const start = text.lastIndexOf('\n', first - 1) + 1;
  const end = text.indexOf('\n', first);
  return text.slice(start, end < 0 ? undefined : end);
}

/**
 * Is this piece somebody else's words rather than Socria speaking to them?
 * True when the line it starts on is a blockquote or a table row, or when it
 * lies inside a draft (`draft`, which only the caller following the whole
 * reply can know: see draftStep).
 */
export function quotedOrDraft(lineHead: string, piece: string, draft = false): boolean {
  if (draft) return true;
  return quotedOrTableLine(lineAt(lineHead, piece));
}

/**
 * Where a reply stands with respect to a draft written for somebody else.
 *
 *   none     Socria speaking to them
 *   armed    a line that hands them words ("Here's a draft:") was just read;
 *            the draft starts at the next line that is not blank
 *   body     inside the draft: nothing here is trimmed or held
 *   signoff  the draft's sign-off was read ("Best,"); its name line follows,
 *            and the draft ends at the next blank line
 *
 * A draft begins at a label line, a "Subject:" line or a salutation line on
 * its own ("Hi Sam,"). It ends at a heading, a rule, a paragraph that talks
 * about the draft ("This keeps it short…", "Feel free to tweak…"), or the
 * blank line after its sign-off. A draft that never signs off runs to the end
 * of the reply, which may keep a genuine trailing offer in place after it:
 * acceptable, since keeping content beats deleting it. A label followed by a
 * blockquote or a fence is left to that quote or fence, which already marks
 * where the draft ends.
 */
export type DraftState = 'none' | 'armed' | 'body' | 'signoff';

// Words that name a piece of writing for somebody else. The generic ones
// ("text", "note", "reply", "version") count only beside a verb of sending or
// using it, so "A note on units:" and "Note:" do not start a draft.
const DRAFT_NOUN = String.raw`(?:draft|e-?mail|message|letter|script|template|caption|bio|toast|speech|invitation|invite|dm|voicemail|sign-?off|cover letter)s?`;
const SENDABLE = String.raw`(?:text|note|reply|response|post|version|line|wording|opener)s?`;
/** "Here's a draft:", "Here is a short email you could send:", "**Email:**", "A version you could send:", "You could say:", "Something like:". */
const DRAFT_LABEL = new RegExp(
  String.raw`^(?:\*\*|__)?(?:[^\n:?]{0,100}\b${DRAFT_NOUN}\b[^\n:?]{0,60}|[^\n:?]{0,60}\b${SENDABLE}\b[^\n:?]{0,30}\b(?:send|use|post|say|try|copy|paste)\b[^\n:?]{0,30}|(?:you (?:could|can|might) |try )?(?:say(?:ing)?|writ(?:e|ing)|send(?:ing)?|text(?:ing)?|reply(?:ing)?)(?: (?:something like|this|them|him|her))?|something like)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*$`,
  'i'
);
const SUBJECT = /^(?:\*\*|__)?subject(?:\*\*|__)?\s*:/i;
const SALUTATION = /^(?:hi|hello|dear|hey|good (?:morning|afternoon|evening))\b[^\n]{0,40},\s*$/i;
const SIGNOFF = /^(?:best(?: regards| wishes)?|kind regards|warm regards|regards|many thanks|thanks(?: so much| again| in advance)?|thank you(?: so much| again)?|cheers|sincerely|yours sincerely|yours truly|warmly|all the best|talk soon|take care)\s*[,!.]?\s*$/i;
/** A paragraph that steps out of the draft to talk about it, a heading, or a rule. */
const DRAFT_ENDS = /^(?:#{1,6}\s|-{3,}\s*$|\*{3,}\s*$|_{3,}\s*$|this (?:draft|version|wording|keeps|stays|reads)\b|(?:feel free to|you (?:can|could|may|might want to)) (?:adjust|tweak|change|edit|swap|personali[sz]e|shorten|cut|replace|add)\b)/i;

/** The draft state after one line (or the start of one) of a reply. Pure. */
export function draftStep(state: DraftState, line: string): DraftState {
  const t = line.trim();
  if (!t) return state === 'signoff' ? 'none' : state;
  if (state === 'armed') {
    // a quoted or fenced draft marks its own end; a table is cells, not a draft
    if (/^(?:>|\||```|~~~)/.test(t)) return 'none';
    state = 'body';
  }
  if (state === 'body' || state === 'signoff') {
    if (DRAFT_ENDS.test(t)) return 'none';
    if (state === 'body' && SIGNOFF.test(t)) return 'signoff';
    return state;
  }
  if (SUBJECT.test(t) || SALUTATION.test(t)) return 'body';
  if (isDraftLabel(t)) return 'armed';
  return 'none';
}

/**
 * A label that hands them words to use. One that explains something about a
 * piece of writing is not one: "Here's what the error message means:" is
 * followed by Socria's own explanation, which the offer rule still reads.
 */
function isDraftLabel(t: string): boolean {
  return DRAFT_LABEL.test(t) && !/\b(?:what|why|how|where|when|which|whether)\b/i.test(t);
}

/** A line that hands them words to use: never trimmed as an announcement ("Here's a draft:"). */
export function labelsContent(line: string): boolean {
  const t = line.trim();
  return isDraftLabel(t) || SUBJECT.test(t) || /\b(?:code|example|examples|script|snippet|query|command|formula|table|chart|graph|template|version)\b/i.test(t);
}

// ── Filler, by class (the stream gate decides when each may go) ──────
//
// THE PROMPT ALREADY BANS ALL OF THIS, AND THE MODEL STILL WRITES IT. "Sure!",
// "Certainly! Let's dive in.", "Here's a breakdown of the key differences…",
// "In summary, …" and "I hope this helps!" were all received unchanged on the
// real route. Each class below is a pattern only; whether it may be removed
// is the stream gate's decision (position, what follows, the trim mode), so
// that nothing here can delete text on its own. English pattern lists only:
// the gate runs none of them on a reply that is not English-dominant, where
// they would misfire without a corpus. Each pattern is anchored to the whole
// piece or to its start, never a match in the middle of a sentence.

/** Class A: an interjection in front of the answer. Never "Yes" or "No", which are the answer. */
const INTERJECTION = /^(?:sure|certainly|absolutely|of course|definitely|alright|all right|got it|perfect|happy to help)\s*[!.,—–-]+[ \t]*/i;

/**
 * The Class A interjection a piece opens with, if any: the text it takes and
 * what remains. Read on the raw piece, so a quoted '"Sure!" she said' (which
 * opens with a quotation mark) and "Sure is the word to use there" (no
 * punctuation after it) never match.
 */
export function openerInterjection(piece: string): { cut: string; rest: string } | null {
  const m = INTERJECTION.exec(piece);
  return m ? { cut: m[0], rest: piece.slice(m[0].length) } : null;
}

/**
 * Class B: a whole line (or a whole first sentence) that only announces what
 * follows. "Here's a breakdown of the key differences between TCP and UDP.",
 * "Let's dive in.", "Let's break it down." — never "Let's take a look at your
 * budget." (it names something), and never a line that labels content they
 * asked for (labelsContent).
 */
const ANNOUNCE = /^(?:here(?:'s| is) (?:a |an |the )?(?:quick |brief |short |detailed |simple |clear )?(?:breakdown|overview|rundown|summary|structured approach|step-by-step (?:guide|breakdown|explanation)|explanation)(?: of [^\n:]{0,80})?|let(?:'s| us) (?:dive (?:right |straight )?in(?:to (?:it|this|that))?|break (?:it|this|that) down(?: step by step)?|unpack (?:it|this|that)|take a (?:closer )?look(?: at (?:it|this|that))?|get started|walk through (?:it|this|that)))\s*[:.!]\s*$/i;
export function isAnnouncement(line: string): boolean {
  const t = line.trim();
  return ANNOUNCE.test(t) && !labelsContent(t);
}

/** A recap that opens a sentence: "In summary, …", "To sum up, …", "Overall, …". */
const RECAP = /^(?:in (?:summary|conclusion|short|a nutshell|sum)|to (?:summari[sz]e|sum up|recap|conclude)|overall|all in all|ultimately|in the end)\s*,\s*/i;
export function recapOf(piece: string): string | null {
  const t = piece.trim();
  const m = RECAP.exec(t);
  return m && t.length > m[0].length ? t.slice(m[0].length) : null;
}

/**
 * A pleasantry tail: "Happy studying!", "Enjoy your eggs!", "Have fun!". Never
 * "Good luck", which is something a person says and means.
 */
const PLEASANTRY = /^(?:happy (?:studying|coding|learning|reading|writing|cooking|baking|hacking|exploring|building|revising|gardening|travels|travelling|traveling)|enjoy(?: (?:your|the) [\w' -]{1,30})?|have fun(?: (?:with (?:it|that|this|the [\w' -]{1,24}))?)?)\s*[!.]*\s*$/i;
/** "I hope this helps!", "I really hope that helps.", "Hope it clarifies things." — the whole sentence, nothing after it. */
const HOPE = /^(?:i (?:really |do |truly )?)?hope (?:this|that|it) (?:helps|clarifies(?: things)?|answers (?:your|the) question|makes (?:things|it) clearer)(?: (?:a bit|a little|somewhat))?\s*[!.]*\s*$/i;
export function pleasantryOf(piece: string): 'pleasantry' | 'hope' | null {
  const t = piece.trim();
  if (/\bgood luck\b/i.test(t)) return null;
  if (HOPE.test(t)) return 'hope';
  if (PLEASANTRY.test(t)) return 'pleasantry';
  return null;
}

/**
 * The textbook opener: "Opportunity cost is a fundamental concept in
 * economics." Nothing may follow the field's name — "Entropy is a key concept
 * because it sets the direction of heat flow" says something.
 */
const DEFINITIONAL = /^[^.,;:\n]{1,60} (?:is|are) (?:a|an|one of the most) (?:fundamental|fascinating|important|key|core|central|crucial|powerful|foundational)(?: \w+)? (?:concept|idea|topic|principle|tool)s?((?: (?:in|of|within) [^.,;:\n]{1,40})?)[.!]$/i;
export function isDefinitionalOpener(piece: string): boolean {
  const t = piece.trim();
  const m = DEFINITIONAL.exec(t);
  if (!m) return false;
  return !/\b(?:because|that|which|since|so|when|where|as|if|but|and)\b|\d|\$/i.test(m[1]);
}

/** A question that can be answered yes or no: "Can I freeze rice?" — where "Absolutely." is the answer, not an opener. */
const POLAR = /^(?:can|could|is|are|am|do|does|did|should|will|would|has|have|had|was|were|may|might|shall|must|isn'?t|aren'?t|don'?t|doesn'?t|didn'?t|won'?t|can'?t|couldn'?t|shouldn'?t|wouldn'?t)\b/i;
export function isPolarQuestion(text: string): boolean {
  const parts = sentencesOf(prose(text).trim()).map((s) => s.trim());
  return parts.some((s) => POLAR.test(s) && (/\?["'’”)\]]*$/.test(s) || parts.length === 1));
}

/**
 * Mostly English? The filler lists are English, so a reply (or a message)
 * that is not stays exactly as written: "¡Claro! La derivada…", "J'espère que
 * cela vous aide !". Short texts with no telling words count as English; the
 * test is what the words are, not how many.
 */
const OTHER_WORDS = new Set('el la los las que es por para una del al con como pero muy le les est et des une pour vous nous avec dans sur pas cette der die das und ist nicht ein eine ich sie mit auf il che di per sono della non um uma com não você está são'.split(' '));
const EN_WORDS = new Set('the and is are of to it you that this with for in on was be not have what your'.split(' '));
export function englishDominant(text: string): boolean {
  if (/[¡¿]/.test(text)) return false;
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length >= 8 && letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length < 0.9) return false;
  let en = 0;
  let other = 0;
  for (const w of text.toLowerCase().match(/[\p{L}]+/gu) ?? []) {
    if (EN_WORDS.has(w)) en++;
    else if (OTHER_WORDS.has(w)) other++;
  }
  return other < 2 || other <= en;
}

/**
 * A sentence that tells them to work an element: "Drag a and watch the
 * vertex.", "Pick one to open.", "Set b to 0 and see what happens." Only ever
 * read on the sentence directly after an element the gate dropped, where it
 * would point at nothing. "Drag" and "Slide" only make sense of an element;
 * the other verbs need a word for one ("Try restarting the router" is advice
 * and stays).
 */
const ELEMENT_VERB = /^(?:\*\*|__)?(drag|move|slide|tap|press|pick|try|change|set|open)\b/i;
const ELEMENT_WORD = /\b(?:sliders?|handles?|points?|dots?|curves?|graph|chart|plot|table|bars?|lines?|cards?|options?|steps?|toggle|button|box|values?|one|any|each|either|above|below|watch|see (?:how|what|where|when|which|whether)|and see|to see|vertex|markers?|knob|tabs?|panel)\b/i;
export function elementImperative(piece: string, kind = ''): boolean {
  const t = piece.trim();
  const m = ELEMENT_VERB.exec(t);
  if (!m) return false;
  if (/^(?:drag|slide)$/i.test(m[1])) return true;
  return ELEMENT_WORD.test(t) || (/^[a-z][a-z-]{1,30}$/.test(kind) && new RegExp(String.raw`\b${kind}\b`, 'i').test(t));
}
