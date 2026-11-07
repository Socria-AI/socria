// lib/logos5/learning.ts — THE LEARNING LEDGER, in their browser (Logos 5.5, the explanation engine).
//
// What lets an explanation pick up where the last one left off, across
// conversations: the topics they learned, when, how it went, and a Leitner box
// (lib/runtime/explain.ts). Kept here, in this browser only — never on the
// server, never shared — sent with each turn so the reply can bring back what
// is due or retrieve what was met before, and noted after a learning turn
// (the server names the topic in X-Socria-Learn; how their checks went is in
// what they did with the last reply). Forty topics at most.

import { noteTopic, outcomesOf, sanitizeLedger, type LedgerEntry } from '@/lib/runtime/explain';

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

/** A learning turn answered: its topic noted, moved by how the checks they answered went. */
export function noteLearningTurn(header: string | null, did: readonly { said: string }[] | undefined, now: number = Date.now()): LedgerEntry[] | null {
  if (!header) return null;
  let topic = '';
  try {
    topic = decodeURIComponent(header).toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
  } catch {
    return null;
  }
  if (!topic) return null;
  const next = noteTopic(readLedger(now), topic, outcomesOf(did), now);
  writeLedger(next);
  return next;
}

/** Forget it all: what Settings' "clear" would call. */
export function clearLedger(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LEARNING_KEY);
  } catch {
    // nothing kept, nothing to clear
  }
}
