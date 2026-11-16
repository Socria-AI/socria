// lib/quiz/evidence.ts — WHAT A QUIZ ADDS TO THE LEARNING LEDGER ABOUT ONE CONCEPT.
//
// The learning ledger (lib/logos5/learning.ts, lib/runtime/explain.ts LedgerEntry) already keeps, per concept,
// how its checks went and a Leitner box that schedules the next review. A quiz answer moves those exactly as any
// check does. What a quiz knows beyond a right or a wrong is kept beside them, compactly, on the same entry — so
// there is one memory of what the student knows, not two:
//
//   ev    the last answers on the concept: when, right or not, how hard, what it asked (recall, application,
//         transfer), whether it was helped (a hint, a second try), and whether it was a retest of a miss
//   st    where a mistake on it stands: missed → under review → retested → retained (lib/quiz/mastery.ts)
//   tags  what wrong answers on it may have suggested (misconception tags), most recent first
//
// Kept in the browser with the ledger, behind the same gates; nothing here is text the student wrote.
//
// PURE. No imports, so the ledger's sanitiser can use it without a cycle.

/** One answer, as a tuple to keep the ledger small: [at, right, difficulty 1–3, demand 0 recall · 1 application · 2 transfer, helped, retest]. */
export type QuizEv = [number, 0 | 1, 1 | 2 | 3, 0 | 1 | 2, 0 | 1, 0 | 1];

export const MISTAKE_STATES = ['missed', 'review', 'retested', 'retained'] as const;
export type MistakeState = (typeof MISTAKE_STATES)[number];

export interface QuizEvidence {
  ev: QuizEv[];
  st?: MistakeState;
  tags?: string[];
}

export const EVIDENCE_MAX = 12;

/** The quiz evidence on a ledger entry as it came from a browser: shaped and clipped, or null. */
export function sanitizeEvidence(raw: unknown, now: number): QuizEvidence | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ev: QuizEv[] = [];
  if (Array.isArray(o.ev)) {
    for (const e of o.ev.slice(-EVIDENCE_MAX)) {
      if (!Array.isArray(e) || e.length !== 6) continue;
      const [at, r, d, m, h, t] = e;
      if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || at > now + 60_000) continue;
      ev.push([Math.floor(at), r === 1 ? 1 : 0, d === 1 || d === 3 ? d : 2, m === 0 || m === 2 ? m : 1, h === 1 ? 1 : 0, t === 1 ? 1 : 0]);
    }
  }
  const st = typeof o.st === 'string' && (MISTAKE_STATES as readonly string[]).includes(o.st) ? (o.st as MistakeState) : undefined;
  const tags = Array.isArray(o.tags) ? o.tags.filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x)).slice(0, 4) : [];
  if (!ev.length && !st) return null;
  return { ev, ...(st ? { st } : {}), ...(tags.length ? { tags } : {}) };
}
