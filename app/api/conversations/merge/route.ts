// app/api/conversations/merge/route.ts
//
// POST /api/conversations/merge → { moved, draw, already, recorded }
//
// BRING THIS PERSON'S CORE CHATS INTO LOGOS 5 — ONCE (lib/logos5/merge.ts).
//
// A conversation's `kind` is where it was last left (lib/conversation-surface.ts),
// so bringing a Core chat in is the same narrow write a model switch makes:
// the kind, and nothing else. Its messages, title, memory, map, draft and
// Project are untouched, and so is when it was last worked on — moving is not
// thinking, and the history keeps its order.
//
// Once per account: the 'logos.merged' milestone on the profile's first-run
// record says it has been done, so a second device does not do it again, and a
// chat begun on Core 4 since stays where it was begun. A database without that
// column still has the chats moved; the browser keeps the record.
//
// Never an incognito conversation — one the person asked to keep out of
// everything stays where it is.
//
// The maps are not drawn here: the browser draws them one at a time,
// afterwards (LogosApp), each through the ordinary map pass — `draw` names
// the ones it may. Not one kept quiet (quietConversations): off the record,
// kept to itself, or the source of a private memory. When what would say so
// cannot be read, none are drawn in the background; each is drawn when it is
// opened, as before.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';
import { has, mergeFirstRun, parseFirstRun } from '@/lib/first-run';
import { candidatesForMerge, chunked, quietConversations, type MergeRow } from '@/lib/logos5/merge';

/** Postgres says 42703 on a select; PostgREST says PGRST204 on a write. */
function missingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the '.*' column/i.test(error.message ?? '');
}

/** Ids per update: the filter travels in the request's URL. */
const CHUNK = 100;

/** A table that is not there at all (a schema never applied), as PostgREST says it. */
function missingTable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(error.message ?? ''));
}

/**
 * The conversations kept quiet — whose maps are not drawn in the background —
 * or null when that cannot be told, and then none are drawn. Without Core 4's
 * state table Core 4 kept every turn off the record (lib/core4/turn.ts), so
 * its absence is not "nothing private"; without the memory tables there is no
 * private memory to come from anywhere.
 */
async function keptQuiet(db: ReturnType<typeof supabaseAdmin>, userId: string): Promise<Set<string> | null> {
  const states = await db.from('core4_state').select('conversation_id, state').eq('user_id', userId);
  if (states.error) return null;
  const nodes = await db.from('mind_nodes').select('provenance').eq('user_id', userId).eq('private', true);
  if (nodes.error && !missingTable(nodes.error) && !missingColumn(nodes.error)) return null;
  const profile = await db.from('user_profiles').select('understanding').eq('user_id', userId).maybeSingle();
  if (profile.error && !missingColumn(profile.error) && !missingTable(profile.error)) return null;
  const understanding = (profile.data as { understanding?: { entries?: unknown } } | null)?.understanding;
  return quietConversations({
    states: states.data as { conversation_id?: unknown; state?: unknown }[] | null,
    privateNodes: nodes.error ? [] : (nodes.data as { provenance?: unknown }[] | null),
    entries: Array.isArray(understanding?.entries) ? understanding!.entries : [],
  });
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  try {
    const db = supabaseAdmin();

    // Done before, on this account? Then nothing moves — not a Core chat begun since either.
    let recordable = true;
    const { data: profile, error: profileError } = await db.from('user_profiles').select('first_run').eq('user_id', userId).maybeSingle();
    if (profileError && missingColumn(profileError)) recordable = false;
    else if (profileError) return NextResponse.json({ error: 'Could not read the account' }, { status: 500 });
    const record = parseFirstRun((profile as { first_run?: unknown } | null)?.first_run);
    if (recordable && has(record, 'logos.merged')) return NextResponse.json({ moved: [], draw: [], already: true, recorded: true });

    // Every conversation of theirs, and which of them are incognito where the column exists.
    let rows: MergeRow[] = [];
    // newest first, so the maps drawn first are the ones nearest the top of the map
    let read: { data: unknown[] | null; error: { code?: string; message?: string } | null } = await db
      .from('conversations').select('id, kind, incognito').eq('user_id', userId).order('updated_at', { ascending: false });
    if (read.error && missingColumn(read.error) && /incognito/i.test(read.error.message ?? '')) {
      read = await db.from('conversations').select('id, kind').eq('user_id', userId).order('updated_at', { ascending: false });
    }
    if (read.error) {
      if (missingColumn(read.error)) {
        return NextResponse.json(
          { error: 'This database has no `kind` column, so where a conversation lives cannot be recorded — run supabase/schema.sql.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Could not read the conversations' }, { status: 500 });
    }
    rows = (read.data ?? []) as MergeRow[];
    const moved = candidatesForMerge(rows);

    // read before anything moves: which of them are kept quiet
    const quiet = await keptQuiet(db, userId);

    for (const ids of chunked(moved, CHUNK)) {
      // `kind` only: everything else about each conversation stays as it is
      const { error } = await db.from('conversations').update({ kind: 'logos' }).eq('user_id', userId).in('id', ids);
      if (error) {
        console.error('merge: could not move conversations', error);
        return NextResponse.json({ error: 'Could not move the chats' }, { status: 500 });
      }
    }

    // Recorded, as a union with what the account already holds.
    let recorded = false;
    if (recordable) {
      const first_run = mergeFirstRun(record, { v: 1, at: { 'logos.merged': Date.now() } });
      const { error } = await db.from('user_profiles').upsert({ user_id: userId, updated_at: Date.now(), first_run }, { onConflict: 'user_id' });
      if (!error) recorded = true;
      else if (!missingColumn(error)) console.error('merge: could not record it', error);
    }
    const draw = quiet ? moved.filter((id) => !quiet.has(id)) : [];
    if (!quiet) console.error('merge: could not tell which chats are kept quiet — no map is drawn in the background');
    return NextResponse.json({ moved, draw, already: false, recorded });
  } catch (e) {
    console.error('merge threw:', e);
    return NextResponse.json({ error: 'Could not move the chats' }, { status: 500 });
  }
}
