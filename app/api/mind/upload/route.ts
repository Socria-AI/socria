// app/api/mind/upload/route.ts
// POST { name, text } → read a .txt file into the Mind Graph.
//
// TXT first, as asked. The pipeline behind it is format-agnostic after the
// parse step, so PDF or Markdown is a matter of swapping that one step.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ingestTextFile, MAX_FILE_BYTES } from '@/lib/mind/ingest-text';
import { deleteSource, getProject, listSources } from '@/lib/mind/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Enough to be useful, few enough that the graph stays somebody's own. */
const MAX_FILES = 20;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Ingestion is many model calls, so it draws on the expensive budget rather
  // than the cheap one.
  const limited = await enforceRateLimit(req, userId, 'chat');
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Reading files is not configured.' }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : 'Uploaded file';
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'That file had no text in it.' }, { status: 400 });
  }
  if (text.length > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `That file is too long (max ${Math.round(MAX_FILE_BYTES / 1024)} KB of text).` },
      { status: 413 }
    );
  }

  const already = await listSources(userId);
  if (already.length >= MAX_FILES) {
    return NextResponse.json(
      { error: `You can keep ${MAX_FILES} files. Remove one from Memory first.` },
      { status: 409 }
    );
  }

  // Uploaded inside a Project? Verified here, scoped to the owner: a
  // Project id that is not theirs is refused outright rather than quietly
  // ignored, because a file silently landing outside the Project they were
  // looking at is its own kind of confusing.
  let project = null;
  if (typeof body?.projectId === 'string' && body.projectId) {
    project = await getProject(userId, body.projectId.slice(0, 80)).catch(() => null);
    if (!project) return NextResponse.json({ error: 'That Project could not be found.' }, { status: 404 });
  }

  const result = await ingestTextFile(userId, { name, text }, { now: Date.now(), apiKey, project });
  if (!result) {
    return NextResponse.json({ error: 'That file could not be read.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result });
}

/**
 * Remove an uploaded file.
 *
 * What it deliberately does NOT remove is what was learned from it. A claim
 * can be true independently of where it was read, and the `derived_from`
 * edge records the provenance either way — so the nodes stay, each still
 * deletable on its own from the Memory page. Taking them silently would mean
 * tidying a file list quietly erased part of what Socria understands.
 *
 * This route did not exist, which made deleteSource dead code and the 409
 * above an instruction to do something impossible.
 */
export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Which file?' }, { status: 400 });

  const ok = await deleteSource(userId, id);
  if (!ok) return NextResponse.json({ error: 'Could not remove that file.' }, { status: 500 });
  return NextResponse.json({
    ok: true,
    note: 'The file is gone. What Socria learned from it stays, and each of those can be removed from Memory on its own.',
  });
}
