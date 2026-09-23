// app/api/core4/route.ts
// GET    → what Core 4 has recorded about this person's thinking
// PATCH  → correct it: a ledger entry (retract / disown / edit / restore),
//          or an inferred field of a conversation's state (set / reset)
// DELETE → forget one entry, one conversation's state, or one concept's
//          capability evidence
//
// The Reasoning Ledger, the Cognitive State and the capability evidence are
// Socria's reading of someone's thinking. They are only acceptable to keep
// if the person can see them, see which parts are their words and which are
// inference, and change or remove any of it (docs/CORE-4-ARCHITECTURE.md,
// "Privacy"). This route is that; the Memory page is its interface.
// Everything is scoped to the signed-in user, and every correction is
// recorded in the entry's history as made by them.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import * as store from '@/lib/core4/store';
import { summarize } from '@/lib/core4/capability';
import { toLogosGraph } from '@/lib/core4/ledger';
import { ENTRY_ACTIONS, correctEntry, correctState, isCorrectableField, stateSummary, type EntryAction } from '@/lib/core4/corrections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID = /^[A-Za-z0-9_-]{1,120}$/;

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const [{ entries, links }, states, capability] = await Promise.all([
    store.listLedger(userId),
    store.listStates(userId),
    store.listCapability(userId),
  ]);
  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id, kind: e.kind, text: e.text, owner: e.owner, stance: e.stance, basis: e.basis, quote: e.quote,
      reason: e.reason, status: e.status, conversationId: e.conversationId, projectId: e.projectId,
      createdAt: e.createdAt, updatedAt: e.updatedAt, revisions: e.revisions,
    })),
    links,
    graph: toLogosGraph(entries.filter((e) => e.status !== 'retracted'), links),
    states: states.map((s) => stateSummary(s.conversationId, s.state, s.updatedAt)),
    capability: summarize(capability),
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const now = Date.now();
  try {
    // A ledger entry.
    if (typeof body?.entryId === 'string') {
      if (!ID.test(body.entryId)) return NextResponse.json({ error: 'Which entry?' }, { status: 400 });
      if (!(ENTRY_ACTIONS as readonly string[]).includes(body?.action)) return NextResponse.json({ error: 'What should change?' }, { status: 400 });
      const e = await store.getEntry(userId, body.entryId);
      if (!e) return NextResponse.json({ error: 'No such entry.' }, { status: 404 });
      const next = correctEntry(e, body.action as EntryAction, now, typeof body?.text === 'string' ? body.text : undefined);
      if (!next) return NextResponse.json({ ok: true, entry: e, unchanged: true });
      await store.putEntry(userId, next);
      return NextResponse.json({ ok: true, entry: next });
    }
    // A field of one conversation's state.
    if (typeof body?.conversationId === 'string') {
      if (!ID.test(body.conversationId)) return NextResponse.json({ error: 'Which conversation?' }, { status: 400 });
      if (!isCorrectableField(body?.field)) return NextResponse.json({ error: 'That cannot be set here.' }, { status: 400 });
      const value = body?.value === null ? null : typeof body?.value === 'string' ? body.value : undefined;
      if (value === undefined) return NextResponse.json({ error: 'Set it to what?' }, { status: 400 });
      const s = await store.getState(userId, body.conversationId);
      if (!s) return NextResponse.json({ error: 'No such conversation state.' }, { status: 404 });
      const next = correctState(s, body.field, value, now);
      if (!next) return NextResponse.json({ error: 'Not a value that field can take.' }, { status: 400 });
      await store.putState(userId, body.conversationId, next, now);
      return NextResponse.json({ ok: true, state: stateSummary(body.conversationId, next, now) });
    }
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  } catch (e) {
    console.error('[socria/core4] correction failed', e);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const q = req.nextUrl.searchParams;
  const entryId = q.get('entryId');
  const conversationId = q.get('conversationId');
  const concept = q.get('concept');
  try {
    if (entryId) {
      if (!ID.test(entryId)) return NextResponse.json({ error: 'Which entry?' }, { status: 400 });
      await store.deleteEntry(userId, entryId);
      return NextResponse.json({ ok: true });
    }
    if (conversationId) {
      if (!ID.test(conversationId)) return NextResponse.json({ error: 'Which conversation?' }, { status: 400 });
      await store.deleteState(userId, conversationId);
      return NextResponse.json({ ok: true });
    }
    if (concept) {
      if (concept.length > 200) return NextResponse.json({ error: 'Which concept?' }, { status: 400 });
      await store.deleteCapability(userId, concept);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Nothing to delete.' }, { status: 400 });
  } catch (e) {
    console.error('[socria/core4] delete failed', e);
    return NextResponse.json({ error: 'Could not delete that.' }, { status: 500 });
  }
}
