// lib/logos5/learning.ts — THE LEARNING LEDGER, in their browser (Logos 5.5, the explanation engine).
//
// What lets an explanation pick up where the last one left off, across
// conversations: the concepts they learned, when they last came up, when they
// were last PRACTISED (answered, recalled, reviewed — the review clock runs from
// there, and a mention never resets it), how their checks went (a right answer
// moves a concept up a Leitner box only on the first try), how much of a worked
// example they now take themselves, and the ways in that left them lost
// (lib/runtime/explain.ts). Kept here, in this browser only — never on the
// server, never shared — sent with each turn so the reply can bring back what is
// due or recall what was met before, and noted after a learning turn from the
// server's content-free headers. Forty concepts at most.
//
// The route only reads it, sends the concept back, or notes it through one gate
// (app/api/logos/chat/route.ts comprehensionAllowed): never on a shared,
// collaborative, sensitive, off-the-record or incognito turn, never with two
// people present. "Clear memory" clears it (lib/local-data.ts MEMORY_KEYS), and
// the Memory view lists it with a Forget for each concept.

import { APPROACHES, cueCheck, noteTopic, outcomesOf, replyAsks, sameTopic, sanitizeLedger, sanitizeThreadNote, type Approach, type ExplainPlan, type LedgerEntry, type ThreadNote } from '@/lib/runtime/explain';

/**
 * A reply that is, or ends in, the route's failure notice (lib/upstream-error.ts streamFailureNotice): the
 * bracketed line that says the reply stopped, or the bracketed line that stands in for one that never began.
 * Nothing it planned was shown, so nothing is noted from it.
 */
export function replyFailed(reply: string): boolean {
  const t = reply.trim();
  return /\[The reply stopped here\.[^\]]*\]$/.test(t) || /\(ref [A-Za-z0-9-]+\)\]$/.test(t) || /^\[[^\]]+\]$/.test(t);
}

export const LEARNING_KEY = 'socria.learning.v1';

export function readLedger(now: number = Date.now()): LedgerEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LEARNING_KEY);
    return raw ? sanitizeLedger(JSON.parse(raw), now) : [];
  } catch {
    return [];
  }
}

function writeLedger(ledger: readonly LedgerEntry[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LEARNING_KEY, JSON.stringify(ledger));
  } catch {
    // a full or blocked store: the ledger is a convenience, never needed for a reply
  }
}

const clean = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
const decode = (header: string | null): string | null => {
  if (!header) return null;
  try {
    return decodeURIComponent(header);
  } catch {
    return null;
  }
};

/** What the server said about a turn, in its content-free headers. */
export interface LearningHeaders {
  /** X-Socria-Learn: the concept of a learning turn */
  learn: string | null;
  /** X-Socria-Review: the concepts brought back for review this turn (JSON array) */
  review?: string | null;
  /** X-Socria-Lost: the way in the last reply took, which left them lost (an approach code) */
  lost?: string | null;
}

/**
 * A learning turn answered: its concept noted, moved by how the checks they answered went (a right answer after
 * several tries is practice, not a step up a box), a way in that left them lost remembered, and anything brought
 * back for review marked practised — so it is not asked again tomorrow.
 */
export function noteLearningTurn(h: LearningHeaders | string | null, did: readonly { said: string }[] | undefined, now: number = Date.now()): LedgerEntry[] | null {
  const headers: LearningHeaders = typeof h === 'string' || h === null ? { learn: h } : h;
  let ledger = readLedger(now);
  let touched = false;
  // what was due and was brought back: practised now, whatever else happened this turn
  const reviewed = decode(headers.review ?? null);
  if (reviewed) {
    try {
      const list = JSON.parse(reviewed);
      if (Array.isArray(list)) {
        for (const t of list.slice(0, 2)) {
          if (typeof t !== 'string') continue;
          const topic = clean(t);
          if (topic && ledger.some((e) => sameTopic(e.topic, topic))) {
            ledger = noteTopic(ledger, topic, { reviewed: true }, now);
            touched = true;
          }
        }
      }
    } catch {
      // a malformed header notes nothing
    }
  }
  const topic = clean(decode(headers.learn) ?? '');
  if (topic) {
    const lostRaw = decode(headers.lost ?? null);
    const failed = lostRaw && (APPROACHES as readonly string[]).includes(lostRaw) ? (lostRaw as Approach) : undefined;
    const o = outcomesOf(did);
    ledger = noteTopic(ledger, topic, { right: o.right, wrong: o.wrong, tries: o.tries, ...(failed ? { failed } : {}) }, now);
    touched = true;
  }
  if (!touched) return null;
  writeLedger(ledger);
  return ledger;
}

/**
 * The note kept on Socria's reply (X-Socria-Thread): enum codes and the concept, sanitised — and the question it
 * left only if the reply really asked one, so the next turn never waits on a question that was never put.
 */
export function threadNoteFrom(header: string | null, reply: string): ThreadNote | null {
  const raw = decode(header);
  if (!raw) return null;
  try {
    if (replyFailed(reply)) return null;
    const note = sanitizeThreadNote(JSON.parse(raw));
    if (!note) return null;
    // only the moves the reply shows a cue of: a way in it never showed cannot be the one that left them lost
    const cues = cueCheck(reply, { strategies: note.s } as unknown as ExplainPlan);
    const shown: ThreadNote = { ...note, s: note.s.filter((s) => cues[s]) };
    if (shown.q && !replyAsks(reply)) {
      const { q: _q, ...rest } = shown;
      return rest;
    }
    return shown;
  } catch {
    return null;
  }
}

/** One concept forgotten: what the Memory view's Forget does. */
export function forgetTopic(topic: string): LedgerEntry[] {
  const next = readLedger().filter((e) => e.topic !== topic);
  writeLedger(next);
  return next;
}

/** Forget it all: what "Clear memory" and the Memory view's Forget all do. */
export function clearLedger(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LEARNING_KEY);
  } catch {
    // nothing kept, nothing to clear
  }
}
