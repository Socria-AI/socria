// lib/core4/corrections.ts
//
// What the person can do to what Core 4 recorded about their thinking.
//
// A record you can only look at is a report; a record you can correct is
// memory (the Mind Graph's rule, applied here). Every correction is itself
// recorded — in the entry's revision history, by 'user' — so the ledger
// says a person changed it, and when, rather than silently showing
// different words. Deleting is separate and final (store.deleteEntry).
//
//   retract   "I don't hold this any more" — kept as history, never used
//   disown    "that wasn't my idea" — ownership leaves them; it can still
//             stop Socria repeating it, but is never said back as theirs
//   edit      "what I meant was…" — their words now, so quoted, and theirs
//   restore   undo a retraction or dispute
//
// And for the Cognitive State: any INFERRED field can be set by the person
// (which makes it explicit) or reset to "not known". Directness is theirs to
// set only in the conversation itself, where it applies.
//
// Pure.

import type { CognitiveState } from '../cognition/state';
import type { LedgerEntry } from './types';

export const ENTRY_ACTIONS = ['retract', 'disown', 'edit', 'restore'] as const;
export type EntryAction = (typeof ENTRY_ACTIONS)[number];

const MAX_TEXT = 280;

export function correctEntry(e: LedgerEntry, action: EntryAction, now: number, text?: string): LedgerEntry | null {
  const rev = (change: LedgerEntry['revisions'][number]['change'], from?: string, to?: string) =>
    [...e.revisions, { at: now, by: 'user' as const, change, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) }].slice(-20);
  switch (action) {
    case 'retract':
      if (e.status === 'retracted') return null;
      return { ...e, status: 'retracted', updatedAt: now, revisions: rev('status', e.status, 'retracted') };
    case 'restore':
      if (e.status !== 'retracted' && e.status !== 'disputed') return null;
      return { ...e, status: 'active', updatedAt: now, revisions: rev('status', e.status, 'active') };
    case 'disown':
      if (e.owner !== 'user') return null;
      // Never re-attributed to Socria by guesswork either: unknown is the
      // honest owner of an idea nobody has claimed.
      return { ...e, owner: 'unknown', basis: 'inferred', quote: '', stance: 'entertains', confidence: Math.min(e.confidence, 0.4), updatedAt: now, revisions: rev('owner', 'user', 'unknown') };
    case 'edit': {
      const t = (text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!t || t === e.text) return null;
      // Their words, now — whatever the entry was before.
      return { ...e, text: t, owner: 'user', basis: 'quoted', quote: t.slice(0, 200), status: e.status === 'disputed' ? 'active' : e.status, confidence: 1, updatedAt: now, revisions: rev('corrected', e.text, t) };
    }
  }
}

/** The Cognitive State fields a person may set or reset from the Memory page. */
export const CORRECTABLE_FIELDS = {
  learningGoal: ['yes', 'no'],
  expertise: ['novice', 'intermediate', 'expert'],
  stakes: ['low', 'medium', 'high'],
  authorship: ['theirs', 'shared', 'none'],
} as const;
export type CorrectableField = keyof typeof CORRECTABLE_FIELDS;

export function isCorrectableField(f: unknown): f is CorrectableField {
  return typeof f === 'string' && Object.prototype.hasOwnProperty.call(CORRECTABLE_FIELDS, f);
}

/**
 * Set a field to what the person says (explicit, confidence 1) or, with
 * value null, reset it to "not known" — and let the next conversation turn
 * infer it afresh, if it must.
 */
export function correctState(s: CognitiveState, field: CorrectableField, value: string | null, now: number): CognitiveState | null {
  const allowed = CORRECTABLE_FIELDS[field] as readonly string[];
  if (value !== null && !allowed.includes(value)) return null;
  const next =
    value === null
      ? { value: field === 'stakes' ? 'low' : field === 'authorship' ? 'none' : 'unknown', source: 'default' as const, confidence: 0 }
      : { value, source: 'explicit' as const, confidence: 1, evidence: `set by them on the Memory page (${new Date(now).toISOString().slice(0, 10)})` };
  return { ...s, [field]: next } as CognitiveState;
}

/** What the Memory page shows of a conversation's state: what they said, and what was inferred — separately. */
export function stateSummary(conversationId: string, s: CognitiveState, updatedAt: number) {
  const fields = (['learningGoal', 'expertise', 'stakes', 'authorship', 'directness'] as const).map((k) => {
    const f = s[k];
    return { field: k, value: f.value, source: f.source, confidence: f.confidence, evidence: f.evidence ?? '' };
  });
  return {
    conversationId,
    updatedAt,
    turn: s.turn,
    work: s.work,
    focus: s.currentFocus,
    said: fields.filter((f) => f.source === 'explicit' || f.source === 'observed'),
    inferred: fields.filter((f) => f.source === 'inferred'),
    questionsPreference: s.questionsPreference,
  };
}
