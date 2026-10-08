// lib/chat-thread.ts
//
// ONE MESSAGE, ONE NAME — and the threads people pull on.
//
// Every message gets a stable id where it is made. Two screens then agree on
// which message is which by that id, never by position: a list that has grown
// on someone else's screen can be joined with this one without losing either
// side's words (lib/share/sync.ts). And a reply can point at the message it
// answers.
//
// A reply carries its own small snapshot of what it answers — who said it and
// a line of it — so the quote still reads when the message it points at has
// scrolled out of the 200 kept, or was written before messages had ids.
//
// In a group, Socria speaks when it is asked: @socria in the message, or a
// reply to something Socria said. People talk to each other without it.
// Alone, everything is said to Socria, as always.
//
// Everything that arrives here from a browser — an id, a reply's snapshot — is
// display data, trusted for nothing: shaped, clipped, made one line, so a
// quote can never pose as anything but a quote.
//
// PURE.

export interface ReplyRef {
  /** the message it answers, when that message has an id */
  id?: string;
  role: 'user' | 'assistant';
  /** who wrote it, as shown: "Socria", or a person's name */
  who: string;
  /** a line of it — enough to recognise, never the whole */
  excerpt: string;
}

const ID_RE = /^[A-Za-z0-9_-]{6,48}$/;
const WHO_MAX = 40;
const EXCERPT_MAX = 240;

/** A new message id: time-ordered enough to read, random enough never to collide. */
export function newMsgId(): string {
  let r = '';
  try {
    const b = new Uint8Array(8);
    globalThis.crypto.getRandomValues(b);
    r = Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 12);
  } catch {
    r = Math.random().toString(36).slice(2, 14);
  }
  return `m_${Date.now().toString(36)}${r}`;
}

/** An id from the wire or from storage, or nothing. */
export function cleanMsgId(v: unknown): string | undefined {
  return typeof v === 'string' && ID_RE.test(v) ? v : undefined;
}

/** When it was said, if that is a plausible time. */
export function cleanAt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
}

/** One line, no control characters, at most `max` characters. */
export function oneLine(text: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const flat = String(text ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** A line of a message, for a quote: the words, without the markup around them. */
export function excerptOf(text: string, max = 140): string {
  const plain = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[\[[A-Z_]+[^\]]*\]\]/g, ' ');
  return oneLine(plain, max);
}

/** A reply's snapshot from the wire or from storage, shaped, or nothing. */
export function cleanReplyRef(v: unknown): ReplyRef | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const role = r.role === 'assistant' ? 'assistant' : r.role === 'user' ? 'user' : null;
  if (!role) return undefined;
  const excerpt = typeof r.excerpt === 'string' ? oneLine(r.excerpt, EXCERPT_MAX) : '';
  if (!excerpt) return undefined;
  const named = typeof r.who === 'string' ? oneLine(r.who, WHO_MAX) : '';
  const who = role === 'assistant' ? 'Socria' : named || 'Someone';
  const id = cleanMsgId(r.id);
  return { ...(id ? { id } : {}), role, who, excerpt };
}

/** The snapshot a reply to this message carries. */
export function replyRefOf(m: { id?: string; role: 'user' | 'assistant'; content: string }, who: string): ReplyRef {
  return cleanReplyRef({ id: m.id, role: m.role, who, excerpt: excerptOf(m.content) || '…' }) as ReplyRef;
}

// ── asking Socria, in a group ───────────────────────────────────────

/**
 * "@socria" as a mention: at the start, or after a space or punctuation — not
 * inside an address (me@socria.app) or a longer handle (@socrian).
 */
const MENTION = /(^|[^\w@.])@socria(?![\w-])/gi;

export function mentionsSocria(text: string): boolean {
  MENTION.lastIndex = 0;
  return MENTION.test(String(text ?? ''));
}

/**
 * Does this message ask Socria to speak? Alone, always. In a group, when it
 * mentions @socria or replies to something Socria said.
 */
export function callsSocria(o: { group: boolean; text: string; replyTo?: ReplyRef | null }): boolean {
  if (!o.group) return true;
  return mentionsSocria(o.text) || o.replyTo?.role === 'assistant';
}

/** A message's text in runs, with each @socria marked — for drawing it as a mention. */
export function mentionParts(text: string): { text: string; mention?: true }[] {
  const s = String(text ?? '');
  const out: { text: string; mention?: true }[] = [];
  let last = 0;
  MENTION.lastIndex = 0;
  for (let m = MENTION.exec(s); m; m = MENTION.exec(s)) {
    const start = m.index + m[1].length;
    if (start > last) out.push({ text: s.slice(last, start) });
    out.push({ text: s.slice(start, start + 7), mention: true });
    last = start + 7;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.length ? out : [{ text: s }];
}

/**
 * The word being typed at the caret, when it is the start of "@socria" — so
 * the composer can offer to finish it. Returns where it starts, or -1.
 */
export function mentionAt(text: string, caret: number): number {
  const before = String(text ?? '').slice(0, Math.max(0, caret));
  const m = before.match(/(^|[\s(])(@[a-z]{0,6})$/i);
  if (!m) return -1;
  const word = m[2].toLowerCase();
  if (!'@socria'.startsWith(word) || word === '@socria') return -1;
  return before.length - m[2].length;
}

/**
 * The line that tells the model what a turn answers. One line, quoted, clipped:
 * it can say "replying to Socria: …" and nothing else.
 */
export function quoteLine(r: ReplyRef): string {
  const who = r.role === 'assistant' ? 'your earlier message' : `${oneLine(r.who, WHO_MAX)}'s message`;
  return `[Replying to ${who}: “${oneLine(r.excerpt, EXCERPT_MAX).replace(/[“”]/g, '"')}”]`;
}

// ── placing messages in a conversation that keeps moving ────────────

type Turnish = { id?: string; role: 'user' | 'assistant'; content: string };

const sameTurn = (a: Turnish, b: Turnish) => (a.id && b.id ? a.id === b.id : a === b || (a.role === b.role && a.content === b.content));

/**
 * Socria's answer, added to the conversation as it is NOW — not to the copy
 * taken when the question was sent. Whatever arrived while it was being
 * written stays; the answer goes after it, where it was said. If the question
 * itself is somehow gone, it goes back with its answer.
 */
export function landReply<T extends Turnish>(current: T[], turn: T, reply: T): T[] {
  if (current.some((m) => sameTurn(m, reply))) return current;
  return current.some((m) => sameTurn(m, turn)) ? [...current, reply] : [...current, turn, reply];
}

/** The conversation without one message — found by id, or as that very message. */
export function withoutTurn<T extends Turnish>(current: T[], turn: T): T[] {
  return current.filter((m) => (turn.id ? m.id !== turn.id : m !== turn));
}

/** A record gains the messages in `list` it does not hold yet, in order; nothing in it is taken away. */
export function withArrived<T extends Turnish>(record: T[], list: T[]): T[] {
  const add = list.filter((m) => !record.some((r) => sameTurn(r, m)));
  return add.length ? [...record, ...add] : record;
}
