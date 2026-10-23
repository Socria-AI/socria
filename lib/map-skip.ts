// lib/map-skip.ts — the turns the map is not redrawn for.
//
// Every accepted turn sends the whole conversation to the map extractor
// (app/api/logos/map) — the largest prompt Socria sends, read in full each
// time — and the extractor is told that a message which adds nothing
// structural returns the map unchanged (lib/logos.ts buildMapPrompt). A turn
// that says nothing but "ok" or "thanks" is that message, so it is not sent.
// Nothing is lost: the next turn that says something sends the whole
// conversation, that "ok" included, as before.
//
// DELIBERATELY NARROW. Anything that might be an answer, or a stance, is
// never skipped:
//   - "yes", "sure", "do it", "go on" — answers, and often a yes to something
//     Socria offered to build — and "exactly", "fair enough", "makes sense",
//     "sounds good" — a stance the map may record — are not acknowledgements
//     here;
//   - after a reply that asked anything (any "?") or offered anything ("I
//     can…", "shall I…"), "ok" may be the answer or the yes, so nothing is
//     skipped;
//   - a reply to one particular message, a turn that brings a file, and a map
//     that is still empty (it is owed its first drawing) are never skipped.
//
// Pure and deterministic: no model decides what the model is spared.

/** One unit of an acknowledgement: a thanks, an "ok", a reaction, a laugh. */
const UNIT = String.raw`(?:ok(?:ay|ey|ie|i)?|k{1,2}|alright|all right|got it|gotcha|i see|cool|nice|great|perfect|awesome|lovely|wow|oh|ah|thanks(?: a lot| so much)?|thank you(?: so much| very much)?|thx|ty|tysm|cheers|much appreciated|appreciate it|(?:that )?(?:helps|helped)|(?:very |really |super )?helpful|lo+l|lmao|(?:ha)+h?)`;
const ACK = new RegExp(String.raw`^${UNIT}(?: ${UNIT})*$`);

/** Emoji, and the punctuation that goes with them — never a question mark. */
const MARKS = /[\p{Extended_Pictographic}\u200d\ufe0f\u{1F3FB}-\u{1F3FF}.,!…~:;()'"*_-]/gu;

/** A reply that offered something — what an "ok" after it may be agreeing to. */
const OFFERED = /\b(?:want me to|shall i|should i|would you like|do you want|if you(?:['’]d)? like|let me|i can|i could|i['’]ll|i will)\b/i;

/** A message that is an acknowledgement and nothing else: "ok", "thanks!", "got it 👍", "🙏". */
export function isAcknowledgement(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t || t.length > 40 || t.includes('?')) return false;
  const words = t.replace(MARKS, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
  // nothing but emoji and punctuation: a thumbs up, a "!!"
  if (!words) return true;
  if (words.split(' ').length > 5) return false;
  return ACK.test(words);
}

export interface TurnFacts {
  /** What the person wrote. */
  text: string;
  /** How many files came with it. */
  attachments?: number;
  /** A reply to one particular message. */
  replying?: boolean;
  /** Socria's turn just before it, if there was one. */
  lastReply?: string | null;
  /** How many nodes the map holds now. */
  mapNodes: number;
}

/** Socria's last turn in a conversation, if it has one. */
export function lastReplyIn(messages: readonly { role: string; content?: unknown }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === 'assistant') return typeof m.content === 'string' ? m.content : '';
  }
  return null;
}

/** Whether this turn can leave the map as it is — no extraction is asked for. */
export function skipsMap(t: TurnFacts): boolean {
  if (t.attachments) return false;
  if (t.replying) return false;
  if (!(t.mapNodes > 0)) return false;
  const before = t.lastReply ?? '';
  if (before.includes('?') || OFFERED.test(before)) return false;
  return isAcknowledgement(t.text);
}
