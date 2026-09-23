// app/api/account/export/route.ts
// GET → everything we hold about you, as one JSON file.
//
// Portability is a right in both the GDPR and the CCPA, and it is also the
// honest counterpart to "your thinking stays yours": a claim that means little
// if the only way to read your own record is through our interface.
//
// Deliberately complete. Not a summary, not the parts we think are
// interesting — every row keyed to this account, including the memory and the
// journey the product built ABOUT you, which are the parts people least expect
// to exist and most deserve to see.

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const db = supabaseAdmin();
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    note:
      'Everything Socria holds for this account. "memory" and "understanding" ' +
      'are what Socria worked out about your thinking, not what you typed.',
  };

  try {
    const user = await currentUser();
    out.account = {
      id: userId,
      emails: user?.emailAddresses?.map((e) => e.emailAddress) ?? [],
      createdAt: user?.createdAt ?? null,
    };
  } catch {
    out.account = { id: userId };
  }

  // Conversations carry their own messages, memory, map, draft and contexts.
  const { data: convos, error: convosErr } = await db
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  out.conversations = convos ?? [];

  // The cross-conversation profile and Thinking Journey.
  const { data: profile, error: profileErr } = await db
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  out.profile = profile ?? null;

  // Subscription state — the projection of Stripe, not the billing details
  // themselves, which never reach us.
  const { data: sub, error: subErr } = await db
    .from('socria_subscriptions')
    .select('user_id, status, price_id, current_period_end, cancel_at_period_end, created_at')
    .eq('user_id', userId)
    .maybeSingle();
  out.subscription = sub ?? null;

  // Connected accounts: report THAT one exists, never the token itself.
  const { data: conns, error: connsErr } = await db
    .from('logos_connections')
    .select('provider, account, updated_at')
    .eq('user_id', userId);
  out.connections = conns ?? [];

  // Lifecycle email: which notes have gone, and whether they said stop. Ids
  // and timestamps only — the ledger never held an address or a subject.
  const { data: lifecycle, error: lifecycleErr } = await db
    .from('lifecycle_emails')
    .select('kind, created_at, due_at, sent_at')
    .eq('user_id', userId);
  out.lifecycleEmails = lifecycle ?? [];

  // Usage counters. Not content, but it is a record keyed to this person and
  // it was absent from this file for several releases — an export that omits
  // a table is a quieter failure than a deletion that does, because nobody
  // can tell from the outside what is missing.
  const { data: usage, error: usageErr } = await db
    .from('logos_usage')
    .select('scope, counter, n, updated_at')
    .eq('user_id', userId);
  out.logosUsage = usage ?? [];

  // ── The Mind Graph ──────────────────────────────────────────────────
  //
  // Exported whole, not summarised. It is what Socria understands about this
  // person, and an export that paraphrased it would be answering a different
  // question than the one someone asks when they want their data.
  const { data: mindNodes, error: mindNodesErr } = await db
    .from('mind_nodes')
    .select('id, type, label, content, aliases, status, confidence, certainty, importance, seen, private, provenance, created_at, updated_at, last_accessed')
    .eq('user_id', userId);
  out.mindNodes = mindNodes ?? [];

  const { data: mindEdges, error: mindEdgesErr } = await db
    .from('mind_edges')
    .select('id, source_id, target_id, relationship, confidence, strength, provenance, created_at, updated_at, last_reinforced')
    .eq('user_id', userId);
  out.mindEdges = mindEdges ?? [];

  // What was forgotten, and what was noticed once without being believed.
  // Both are things Socria holds about this person, so both belong here —
  // and seeing the pending list is the only way to know a claim is one
  // sighting away from becoming a belief.
  const { data: mindTombstones, error: mindTombstonesErr } = await db
    .from('mind_tombstones').select('fingerprint, created_at').eq('user_id', userId);
  out.mindForgotten = mindTombstones ?? [];

  const { data: mindPending, error: mindPendingErr } = await db
    .from('mind_pending').select('type, label, content, sources, first_at, last_at').eq('user_id', userId);
  out.mindPending = mindPending ?? [];

  // Uploaded files, with their text: a provenance offset into a file that is
  // not in the export points at nothing.
  // `*` rather than a column list, so a file's Project comes with it on a
  // database that has the column and the read still succeeds on one that
  // does not yet.
  const { data: mindSources, error: mindSourcesErr } = await db
    .from('mind_sources').select('*').eq('user_id', userId);
  out.mindSources = mindSources ?? [];

  // Projects: the workspaces. What each one contains is already above, in
  // mindNodes and mindEdges — a Project is a region of that graph, reached
  // through the edges to its node_id, not a separate copy of anything.
  const { data: mindProjects, error: mindProjectsErr } = await db
    .from('mind_projects')
    .select('id, node_id, name, description, instructions, archived, created_at, updated_at')
    .eq('user_id', userId);
  out.mindProjects = mindProjects ?? [];

  // ── Core 4: the reasoning state ─────────────────────────────────────
  //
  // What Core 4 worked out while thinking with this person: each
  // conversation's Cognitive State (what they said they want, kept apart
  // from what Socria inferred), the Reasoning Ledger with who raised each
  // idea, the per-turn traces (content-free: which move, why, how it
  // landed) and the capability evidence. Whole, like the Mind Graph.
  const { data: core4State, error: core4StateErr } = await db
    .from('core4_state').select('conversation_id, state, updated_at').eq('user_id', userId);
  out.core4State = core4State ?? [];

  const { data: reasoningEntries, error: reasoningEntriesErr } = await db
    .from('reasoning_entries').select('*').eq('user_id', userId);
  out.reasoningLedger = reasoningEntries ?? [];

  const { data: reasoningLinks, error: reasoningLinksErr } = await db
    .from('reasoning_links').select('*').eq('user_id', userId);
  out.reasoningLinks = reasoningLinks ?? [];

  const { data: core4Turns, error: core4TurnsErr } = await db
    .from('core4_turns').select('conversation_id, turn, created_at, trace, outcome_label, outcome_confidence, outcome_source').eq('user_id', userId);
  out.core4Turns = core4Turns ?? [];

  const { data: capability, error: capabilityErr } = await db
    .from('capability_evidence').select('*').eq('user_id', userId);
  out.capabilityEvidence = capability ?? [];

  out.core4Note =
    'core4State and reasoningLedger separate what you said from what Socria inferred: an ' +
    'inferred field carries its confidence and the evidence it rests on, and a ledger entry ' +
    'is marked as yours only when it is grounded in your own words. core4Turns hold no text ' +
    'at all. None of this is used to train models.';

  // ── Logos 2: shared rooms ───────────────────────────────────────────
  //
  // A shared room is the one place in Socria where an export cannot simply
  // be "every row with your id on it": the room holds two people's words.
  // What goes in an export is what THIS person contributed, plus the rooms
  // they were in and who else was there — never the other participant's
  // messages, which are that person's to export.
  const { data: memberships, error: membershipsErr } = await db
    .from('logos_room_members')
    .select('room_id, seat, display_name, joined_at, left_at')
    .eq('user_id', userId);
  out.collabMemberships = memberships ?? [];

  // The rooms themselves, so the export stands on its own rather than
  // referring to ids that mean nothing outside our database.
  const roomIds = Array.from(
    new Set((memberships ?? []).map((m: { room_id: string }) => m.room_id))
  );
  const { data: rooms, error: roomsErr } = roomIds.length
    ? await db
        .from('logos_rooms')
        .select('id, code, created_at, closed_at')
        .in('id', roomIds)
    : { data: [] as unknown[], error: null };
  // Never host_user_id: whether the other person hosted is about them.
  out.collabRooms = rooms ?? [];

  const { data: myEvents, error: myEventsErr } = await db
    .from('logos_room_events')
    .select('room_id, seq, kind, payload, created_at')
    .eq('user_id', userId)
    .order('seq', { ascending: true });
  out.collabContributions = myEvents ?? [];

  // Said plainly inside the file itself, because a person reading their own
  // export should not have to infer why a conversation they remember looks
  // one-sided.
  out.collabNote =
    'collabContributions holds only what you contributed to a shared Logos room. ' +
    'What the other person wrote belongs to their account and appears in their export, not yours.';

  // An export that silently ships an empty section is worse than one that
  // fails: the file looks complete and nobody can tell from the outside what
  // is missing. Every read above records its error; if any failed, the file
  // says so at the top rather than quietly under-reporting.
  const problems = [
    ['conversations', convosErr],
    ['profile', profileErr],
    ['subscription', subErr],
    ['connections', connsErr],
    ['lifecycleEmails', lifecycleErr],
    ['logosUsage', usageErr],
    ['collabMemberships', membershipsErr],
    ['collabRooms', roomsErr],
    ['collabContributions', myEventsErr],
    ['mindNodes', mindNodesErr],
    ['mindEdges', mindEdgesErr],
    ['mindForgotten', mindTombstonesErr],
    ['mindPending', mindPendingErr],
    ['mindSources', mindSourcesErr],
    ['mindProjects', mindProjectsErr],
    ['core4State', core4StateErr],
    ['reasoningLedger', reasoningEntriesErr],
    ['reasoningLinks', reasoningLinksErr],
    ['core4Turns', core4TurnsErr],
    ['capabilityEvidence', capabilityErr],
  ]
    .filter(([, e]) => !!e)
    .map(([name]) => name as string);

  if (problems.length) {
    out.incomplete = problems;
    out.incompleteNote =
      'Some sections could not be read and are empty or partial in this file: ' +
      problems.join(', ') +
      '. This export is NOT complete. Please try again, or email hellosocria@gmail.com.';
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(out, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="socria-export-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
