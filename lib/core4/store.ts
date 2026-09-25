import 'server-only';
// lib/core4/store.ts
//
// Persistence for Core 4's per-person reasoning state. Five tables, one
// responsibility each (Cognitive Design Council #1, D14):
//
//   core4_state          the Cognitive State of one conversation (what is
//                        happening now), carried turn to turn
//   reasoning_entries    the Reasoning Ledger — and the already-considered
//   reasoning_links      record is a VIEW over it, not a second store
//   core4_turns          intervention history + outcome + content-free trace
//   capability_evidence  observable, task-scoped capability events
//
// Every read and write is scoped to the owner. Every function fails SOFT and
// says so in the log: a Core 4 turn that cannot read its state runs from the
// state reader alone; a turn that cannot write loses one turn of continuity.
// Neither may take the conversation down. A missing table (schema not yet
// applied) is reported once per process, not per turn.

import { supabaseAdmin } from '../supabase';
import type { CognitiveState } from '../cognition/state';
import type { CapabilityEvidence, LedgerEntry, LedgerLink, OutcomeReading } from './types';
import type { TurnTrace } from './trace';

const warned = new Set<string>();
function fail(table: string, error: { code?: string; message?: string } | unknown) {
  const e = error as { code?: string; message?: string };
  const missing = e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|schema cache/i.test(e?.message ?? '');
  const key = `${table}:${missing ? 'missing' : e?.code ?? 'error'}`;
  if (missing && warned.has(key)) return;
  warned.add(key);
  console.error(`[socria/core4] ${table}: ${missing ? 'table missing — apply supabase/schema.sql' : e?.message ?? String(error)}`);
}

// ── the Cognitive State ──────────────────────────────────────────────

/**
 * Last turn's state — and whether the READ worked, which is not the same
 * question as whether there was a row.
 *
 * It used to answer null for both, and the caller could not tell "this is the
 * first turn" from "the database had a bad second". The difference is a
 * privacy promise: `persistPolicy` lives in this row, so a failed read on turn
 * five of an OFF THE RECORD conversation looked exactly like turn one, the
 * state started from EMPTY_STATE with persistPolicy 'full', and the
 * conversation somebody had explicitly asked not to be remembered was written
 * to durable memory. Silently, and only when the database was already having a
 * bad minute, which is the hardest kind of bug to ever see.
 */
export async function loadState(
  userId: string,
  conversationId: string
): Promise<{ state: CognitiveState | null; ok: boolean }> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('core4_state').select('state').eq('user_id', userId).eq('conversation_id', conversationId).maybeSingle();
    if (error) {
      fail('core4_state', error);
      return { state: null, ok: false };
    }
    return { state: (data?.state as CognitiveState) ?? null, ok: true };
  } catch (e) {
    fail('core4_state', e);
    return { state: null, ok: false };
  }
}

export async function saveState(userId: string, conversationId: string, state: CognitiveState, now: number): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from('core4_state')
      .upsert({ user_id: userId, conversation_id: conversationId, state, updated_at: now }, { onConflict: 'user_id,conversation_id' });
    if (error) fail('core4_state', error);
  } catch (e) {
    fail('core4_state', e);
  }
}

// ── the Reasoning Ledger ─────────────────────────────────────────────

function rowToEntry(r: Record<string, unknown>): LedgerEntry {
  return {
    id: r.id as string,
    kind: r.kind as LedgerEntry['kind'],
    text: (r.text as string) ?? '',
    owner: (r.owner as LedgerEntry['owner']) ?? 'unknown',
    stance: (r.stance as LedgerEntry['stance']) ?? 'entertains',
    basis: (r.basis as LedgerEntry['basis']) ?? 'inferred',
    quote: (r.quote as string) ?? '',
    reason: (r.reason as string) ?? '',
    status: (r.status as LedgerEntry['status']) ?? 'active',
    confidence: Number(r.confidence ?? 0.5),
    conversationId: (r.conversation_id as string) ?? '',
    projectId: (r.project_id as string) ?? null,
    turn: Number(r.turn ?? 0),
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0),
    revisions: Array.isArray(r.revisions) ? (r.revisions as LedgerEntry['revisions']) : [],
    private: r.private === true,
  };
}

function entryToRow(userId: string, e: LedgerEntry) {
  return {
    user_id: userId, id: e.id, kind: e.kind, text: e.text, owner: e.owner, stance: e.stance, basis: e.basis,
    quote: e.quote, reason: e.reason, status: e.status, confidence: e.confidence, conversation_id: e.conversationId,
    project_id: e.projectId, private: !!e.private, turn: e.turn, created_at: e.createdAt, updated_at: e.updatedAt, revisions: e.revisions,
  };
}

/** The ledger entries relevant to this conversation: its own, its Project's, and the person's recent ones. */
export async function loadLedger(userId: string, opts: { conversationId: string; projectId: string | null; limit?: number }): Promise<LedgerEntry[]> {
  try {
    const db = supabaseAdmin();
    const recent = db.from('reasoning_entries').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(opts.limit ?? 200);
    const here = db.from('reasoning_entries').select('*').eq('user_id', userId).eq('conversation_id', opts.conversationId);
    const [a, b] = await Promise.all([recent, here]);
    if (a.error) return fail('reasoning_entries', a.error), [];
    const byId = new Map<string, LedgerEntry>();
    for (const r of [...(a.data ?? []), ...(b.data ?? [])]) byId.set(String((r as { id: string }).id), rowToEntry(r as Record<string, unknown>));
    return [...byId.values()];
  } catch (e) {
    fail('reasoning_entries', e);
    return [];
  }
}

/**
 * The edges between ledger entries, for the turn that is about to happen.
 *
 * saveLedger has written links since the ledger existed and nothing ever read
 * them back on the reply path — the graph view at /api/core4 was the only
 * consumer. So the structure was being recorded and never used, which is a
 * more expensive kind of dead code than an unused function: it costs a write
 * every turn and pays nothing.
 */
export async function loadLinks(userId: string, limit = 400): Promise<LedgerLink[]> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('reasoning_links')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return fail('reasoning_links', error), [];
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        from: String(row.from_id),
        to: String(row.to_id),
        rel: row.rel as LedgerLink['rel'],
        owner: row.owner as LedgerLink['owner'],
        reason: String(row.reason ?? ''),
        createdAt: Number(row.created_at ?? 0),
      };
    });
  } catch (e) {
    fail('reasoning_links', e);
    return [];
  }
}

export async function saveLedger(userId: string, entries: LedgerEntry[], links: LedgerLink[]): Promise<void> {
  try {
    const db = supabaseAdmin();
    if (entries.length) {
      const { error } = await db.from('reasoning_entries').upsert(entries.map((e) => entryToRow(userId, e)), { onConflict: 'user_id,id' });
      if (error) fail('reasoning_entries', error);
    }
    if (links.length) {
      const { error } = await db.from('reasoning_links').insert(
        links.map((l) => ({ user_id: userId, id: l.id, from_id: l.from, to_id: l.to, rel: l.rel, owner: l.owner, reason: l.reason, created_at: l.createdAt }))
      );
      if (error) fail('reasoning_links', error);
    }
  } catch (e) {
    fail('reasoning_entries', e);
  }
}

export async function listLedger(userId: string): Promise<{ entries: LedgerEntry[]; links: LedgerLink[] }> {
  try {
    const db = supabaseAdmin();
    const [a, b] = await Promise.all([
      db.from('reasoning_entries').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(2000),
      db.from('reasoning_links').select('*').eq('user_id', userId).limit(4000),
    ]);
    if (a.error) fail('reasoning_entries', a.error);
    if (b.error) fail('reasoning_links', b.error);
    return {
      entries: (a.data ?? []).map((r) => rowToEntry(r as Record<string, unknown>)),
      links: (b.data ?? []).map((r) => {
        const x = r as Record<string, unknown>;
        return { id: x.id as string, from: x.from_id as string, to: x.to_id as string, rel: x.rel as LedgerLink['rel'], owner: x.owner as LedgerLink['owner'], reason: (x.reason as string) ?? '', createdAt: Number(x.created_at ?? 0) };
      }),
    };
  } catch (e) {
    fail('reasoning_entries', e);
    return { entries: [], links: [] };
  }
}

// ── intervention history, outcomes, telemetry ────────────────────────

/** Traces are operational data and do not outlive their usefulness. */
export const TRACE_RETENTION_MS = 180 * 86_400_000;

export async function insertTurn(userId: string, conversationId: string, trace: TurnTrace, now: number): Promise<void> {
  try {
    const db = supabaseAdmin();
    const { error } = await db.from('core4_turns').upsert(
      { user_id: userId, conversation_id: conversationId, turn: trace.turn, created_at: now, trace },
      { onConflict: 'user_id,conversation_id,turn' }
    );
    if (error) return fail('core4_turns', error);
    // Retention, enforced where the data is written: the first turn of a
    // conversation clears this person's traces older than the window.
    if (trace.turn === 1) {
      const { error: e2 } = await db.from('core4_turns').delete().eq('user_id', userId).lt('created_at', now - TRACE_RETENTION_MS);
      if (e2) fail('core4_turns', e2);
    }
  } catch (e) {
    fail('core4_turns', e);
  }
}

/** How the previous turn landed — written onto ITS row once the person has replied. */
export async function recordOutcome(userId: string, conversationId: string, turn: number, o: OutcomeReading): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from('core4_turns')
      .update({ outcome_label: o.label, outcome_confidence: o.confidence, outcome_source: o.source })
      .eq('user_id', userId).eq('conversation_id', conversationId).eq('turn', turn);
    if (error) fail('core4_turns', error);
  } catch (e) {
    fail('core4_turns', e);
  }
}

// ── capability evidence ──────────────────────────────────────────────

export async function insertCapability(userId: string, ev: CapabilityEvidence[]): Promise<void> {
  if (!ev.length) return;
  try {
    const { error } = await supabaseAdmin().from('capability_evidence').insert(
      ev.map((e) => ({ user_id: userId, id: e.id, concept: e.concept, event: e.event, assistance: e.assistance, conversation_id: e.conversationId, turn: e.turn, confidence: e.confidence, at: e.at }))
    );
    if (error) fail('capability_evidence', error);
  } catch (e) {
    fail('capability_evidence', e);
  }
}

export async function listCapability(userId: string): Promise<CapabilityEvidence[]> {
  try {
    const { data, error } = await supabaseAdmin().from('capability_evidence').select('*').eq('user_id', userId).order('at', { ascending: true }).limit(5000);
    if (error) return fail('capability_evidence', error), [];
    return (data ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return { id: x.id as string, concept: x.concept as string, event: x.event as CapabilityEvidence['event'], assistance: Number(x.assistance ?? 0) as CapabilityEvidence['assistance'], conversationId: x.conversation_id as string, turn: Number(x.turn ?? 0), confidence: Number(x.confidence ?? 0.5), at: Number(x.at ?? 0) };
    });
  } catch (e) {
    fail('capability_evidence', e);
    return [];
  }
}

// ── what the Memory page reads and corrects ──────────────────────────

/** Every conversation's state, newest first (for the Memory page). */
export async function listStates(userId: string, limit = 30): Promise<{ conversationId: string; state: CognitiveState; updatedAt: number }[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('core4_state').select('conversation_id, state, updated_at').eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(limit);
    if (error) return fail('core4_state', error), [];
    return (data ?? []).map((r) => {
      const x = r as { conversation_id: string; state: CognitiveState; updated_at: number };
      return { conversationId: x.conversation_id, state: x.state, updatedAt: Number(x.updated_at) };
    });
  } catch (e) {
    fail('core4_state', e);
    return [];
  }
}

export async function getEntry(userId: string, id: string): Promise<LedgerEntry | null> {
  const { data, error } = await supabaseAdmin().from('reasoning_entries').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToEntry(data as Record<string, unknown>) : null;
}

/** Correct one entry. Throws on failure: a correction that silently did not happen is worse than an error. */
export async function putEntry(userId: string, e: LedgerEntry): Promise<void> {
  const { error } = await supabaseAdmin().from('reasoning_entries').upsert(entryToRow(userId, e), { onConflict: 'user_id,id' });
  if (error) throw error;
}

/** Delete an entry and every link touching it. */
export async function deleteEntry(userId: string, id: string): Promise<void> {
  const db = supabaseAdmin();
  const a = await db.from('reasoning_links').delete().eq('user_id', userId).eq('from_id', id);
  if (a.error) throw a.error;
  const b = await db.from('reasoning_links').delete().eq('user_id', userId).eq('to_id', id);
  if (b.error) throw b.error;
  const c = await db.from('reasoning_entries').delete().eq('user_id', userId).eq('id', id);
  if (c.error) throw c.error;
}

export async function getState(userId: string, conversationId: string): Promise<CognitiveState | null> {
  const { data, error } = await supabaseAdmin().from('core4_state').select('state').eq('user_id', userId).eq('conversation_id', conversationId).maybeSingle();
  if (error) throw error;
  return (data?.state as CognitiveState) ?? null;
}

export async function putState(userId: string, conversationId: string, state: CognitiveState, now: number): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('core4_state').upsert({ user_id: userId, conversation_id: conversationId, state, updated_at: now }, { onConflict: 'user_id,conversation_id' });
  if (error) throw error;
}

/** Forget one conversation's state entirely: the next turn starts from what they say. */
export async function deleteState(userId: string, conversationId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('core4_state').delete().eq('user_id', userId).eq('conversation_id', conversationId);
  if (error) throw error;
}

/** Forget the capability evidence for one concept. */
export async function deleteCapability(userId: string, concept: string): Promise<void> {
  const { error } = await supabaseAdmin().from('capability_evidence').delete().eq('user_id', userId).eq('concept', concept);
  if (error) throw error;
}

/**
 * A conversation was deleted: everything Core 4 kept about it goes too
 * (council D10/D15 cascade) — its state, its turn traces, its capability
 * evidence, its ledger entries and every link touching them.
 */
export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: ents, error: e0 } = await db.from('reasoning_entries').select('id').eq('user_id', userId).eq('conversation_id', conversationId);
  if (e0) throw e0;
  const ids = (ents ?? []).map((r) => (r as { id: string }).id);
  if (ids.length) {
    const a = await db.from('reasoning_links').delete().eq('user_id', userId).in('from_id', ids);
    if (a.error) throw a.error;
    const b = await db.from('reasoning_links').delete().eq('user_id', userId).in('to_id', ids);
    if (b.error) throw b.error;
  }
  for (const table of ['reasoning_entries', 'core4_state', 'core4_turns', 'capability_evidence'] as const) {
    const { error } = await db.from(table).delete().eq('user_id', userId).eq('conversation_id', conversationId);
    if (error && !/42p01|pgrst205|relation .*does not exist/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) throw error;
  }
}

/** Every Core 4 table, for account deletion, export and "forget what Socria worked out". */
export const CORE4_TABLES = ['core4_state', 'reasoning_entries', 'reasoning_links', 'core4_turns', 'capability_evidence'] as const;
