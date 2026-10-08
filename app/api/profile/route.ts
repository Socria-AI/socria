// app/api/profile/route.ts
// GET /api/profile → { profile, understanding, firstRun, conversationStyle } for the signed-in user
// GET /api/profile?only=conversationStyle → { conversationStyle } (the cheap one a tab re-checks)
// PUT /api/profile → save any of { profile, understanding, firstRun, conversationStyle } (partial)
//
// Backs the "import your history from other AIs" feature: the pasted profile
// is stored per user so it follows them across devices. Anonymous users keep
// theirs in localStorage only; if the user_profiles table doesn't exist yet
// the client silently falls back to local-only.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  sanitizeImportedProfile,
  sanitizeUserUnderstanding,
  hasJourneyContent,
} from '@/lib/socria-prompt';
import { EMPTY_FIRST_RUN, mergeFirstRun, parseFirstRun } from '@/lib/first-run';
import { isProduction } from '@/lib/environment';
import { resolveConversationStyle } from '@/lib/conversation-style';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A column the database does not have yet. Postgres says 42703 when a select
 * names one; PostgREST says PGRST204 when a write does.
 */
function missingColumn(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42703' || code === 'PGRST204';
}

/**
 * What the account says about its Conversation Style. null means the account
 * cannot hold one yet (the column is not there), which the browser reads as
 * "keep your own copy" — not as a choice of the default.
 */
function styleFrom(row: unknown, columnThere: boolean) {
  if (!columnThere) return null;
  return resolveConversationStyle((row as { conversation_style?: unknown } | null)?.conversation_style);
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // The cheap read: an open tab coming back into view asks only this, so a
    // style changed on another device is the one its next message uses.
    if (req.nextUrl.searchParams.get('only') === 'conversationStyle') {
      const { data, error } = await supabaseAdmin()
        .from('user_profiles')
        .select('conversation_style')
        .eq('user_id', userId)
        .maybeSingle();
      if (error && !missingColumn(error)) {
        console.error('GET profile (style) error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ conversationStyle: styleFrom(data, !error) });
    }

    // Deploy-order tolerance: a column that hasn't been added to the database
    // yet (42703 undefined column) narrows the select rather than failing it,
    // so existing sync keeps working. Newest first: conversation_style, then
    // first_run, then understanding.
    const selects = [
      'profile, understanding, first_run, conversation_style',
      'profile, understanding, first_run',
      'profile, understanding',
      'profile',
    ];
    let data: any = null;
    let error: any = null;
    let used = 0;
    for (; used < selects.length; used++) {
      ({ data, error } = await supabaseAdmin()
        .from('user_profiles')
        .select(selects[used])
        .eq('user_id', userId)
        .maybeSingle());
      if (!(error && missingColumn(error))) break;
    }
    if (error) {
      console.error('GET profile error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const understanding = (data as any)?.understanding
      ? sanitizeUserUnderstanding((data as any).understanding)
      : null;
    return NextResponse.json({
      profile: data?.profile ?? null,
      // A CLEARED row is not the same as no row. "Forget everything" leaves a
      // stamped but empty understanding; answering null for it told the
      // browser the account had nothing, and the browser — which still had
      // the old journey in localStorage — helpfully pushed it back up. So an
      // understanding that has been written at all comes back, empty or not,
      // and the client's newest-wins sync sees a clear that is newer than
      // what it holds.
      understanding:
        understanding && (hasJourneyContent(understanding) || understanding.updatedAt > 0)
          ? understanding
          : null,
      // What they have been taught, as the account remembers it. Absent
      // (null) when the column is not there yet; the client then keeps its own.
      firstRun: used <= 1 && (data as any)?.first_run !== undefined ? parseFirstRun((data as any).first_run) : null,
      // How Socria talks with them (lib/conversation-style.ts). The Thinker
      // when they never chose; null only when the account cannot hold it.
      conversationStyle: styleFrom(data, used === 0),
    });
  } catch (e: any) {
    console.error('GET profile error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    const b: Record<string, unknown> =
      body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    // Partial update: only the fields present in the body are written, so a
    // journey sync can never clobber the imported profile and vice versa.
    const row: Record<string, unknown> = {
      user_id: userId,
      updated_at: Date.now(),
    };
    if ('profile' in b) {
      row.profile = sanitizeImportedProfile(b.profile);
    }
    if ('understanding' in b) {
      // The journey fields are the client's to sync. The ENTRIES and the
      // tombstones are not: the server merges those in
      // /api/update-understanding and forgets them in /api/profile/forget,
      // and a client posting its own copy — a stale tab, an older bundle —
      // would wipe or resurrect them. So the row's entries are kept, whatever
      // the body says. If the row cannot be read, nothing is written rather
      // than risk writing a journey with the entries missing; the client
      // syncs again on its next turn.
      const incoming = sanitizeUserUnderstanding(b.understanding);
      const { data: cur, error: readError } = await supabaseAdmin()
        .from('user_profiles')
        .select('understanding')
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) {
        console.error('PUT profile: could not read the current understanding', readError);
        return NextResponse.json({ error: readError.message }, { status: 500 });
      }
      const held = sanitizeUserUnderstanding((cur as { understanding?: unknown } | null)?.understanding);
      row.understanding = { ...incoming, entries: held.entries, forgotten: held.forgotten };
    }
    // The two writes that are not a union: the person asked to see the first
    // run (or part of it) again — Manage Account → Testing. Their own row,
    // their own record of what they have been shown, nothing else. Testing
    // only: refused on production, where a record only ever grows.
    const testing = !isProduction();
    if (testing && b.firstRunReset === true) {
      row.first_run = EMPTY_FIRST_RUN;
    } else if (testing && b.firstRunReplace && typeof b.firstRunReplace === 'object') {
      row.first_run = parseFirstRun(b.firstRunReplace);
    } else if ('firstRun' in b) {
      // A UNION, never a replacement: the earliest time per milestone wins,
      // so a stale tab or an older device cannot un-teach the account.
      const incoming = parseFirstRun(b.firstRun);
      const { data: cur, error: readError } = await supabaseAdmin()
        .from('user_profiles')
        .select('first_run')
        .eq('user_id', userId)
        .maybeSingle();
      if (readError && (readError as any).code === '42703') {
        // The column is not there yet. Nothing to write; the browser keeps it.
        delete row.first_run;
      } else if (readError) {
        console.error('PUT profile: could not read the current first run', readError);
        return NextResponse.json({ error: readError.message }, { status: 500 });
      } else {
        row.first_run = mergeFirstRun(parseFirstRun((cur as { first_run?: unknown } | null)?.first_run), incoming);
      }
    }
    // How Socria talks with them (Manage Account → Personalization). A plain
    // choice rather than a merge: the newest pick is the pick, and anything
    // unknown is stored as the Thinker rather than as whatever was sent.
    if ('conversationStyle' in b) {
      row.conversation_style = resolveConversationStyle(b.conversationStyle);
    }
    let { error } = await supabaseAdmin()
      .from('user_profiles')
      .upsert(row, { onConflict: 'user_id' });
    // Same tolerance on the write: without a column, write the rest, and say
    // which part the account could not keep — the browser holds that one.
    // The column the error names goes first; newest first otherwise.
    const optional: [string, string][] = [
      ['conversation_style', 'conversationStyle'],
      ['first_run', 'firstRun'],
    ];
    const unsaved: string[] = [];
    while (error && missingColumn(error)) {
      const named = optional.find(([col]) => col in row && String((error as { message?: string }).message ?? '').includes(col));
      const drop = named ?? optional.find(([col]) => col in row);
      if (!drop) break;
      delete row[drop[0]];
      unsaved.push(drop[1]);
      if (Object.keys(row).every((k) => k === 'user_id' || k === 'updated_at')) {
        error = null;
        break;
      }
      ({ error } = await supabaseAdmin().from('user_profiles').upsert(row, { onConflict: 'user_id' }));
    }
    if (error) {
      console.error('PUT profile error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(unsaved.length ? { ok: true, unsaved } : { ok: true });
  } catch (e: any) {
    console.error('PUT profile error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
