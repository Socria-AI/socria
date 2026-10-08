// app/api/shared/comments/route.ts
// GET   ?type=&id=                         → the comments on it
// POST  {type, id, anchor, body, parentId?} → comment (commenter and up)
// PATCH {type, id, commentId, resolve?|body?|remove?} → resolve, edit, delete
//
// Who may do which is decided in lib/share/collab.ts, on the server.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { cleanType } from '@/lib/share/roles';
import { ShareError } from '@/lib/share/server';
import { addComment, changeComment, listComments } from '@/lib/share/collab';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cleanId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(v) ? v : null);
function fail(e: unknown) {
  if (e instanceof ShareError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('[shared/comments] failed', e);
  return NextResponse.json({ error: 'That could not be done just now.' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'room');
  if (limited) return limited;
  const type = cleanType(req.nextUrl.searchParams.get('type'));
  const id = cleanId(req.nextUrl.searchParams.get('id'));
  if (!type || !id) return NextResponse.json({ error: 'Nothing here.' }, { status: 400 });
  try {
    return NextResponse.json({ comments: await listComments(userId, type, id) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const b = await req.json().catch(() => null);
  const type = cleanType(b?.type);
  const id = cleanId(b?.id);
  if (!type || !id) return NextResponse.json({ error: 'Nothing here.' }, { status: 400 });
  try {
    await addComment(userId, type, id, typeof b?.anchor === 'string' ? b.anchor : '', typeof b?.body === 'string' ? b.body : '', cleanId(b?.parentId));
    return NextResponse.json({ comments: await listComments(userId, type, id) });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const b = await req.json().catch(() => null);
  const type = cleanType(b?.type);
  const id = cleanId(b?.id);
  const commentId = cleanId(b?.commentId);
  if (!type || !id || !commentId) return NextResponse.json({ error: 'Nothing here.' }, { status: 400 });
  try {
    await changeComment(userId, type, id, commentId, {
      ...(typeof b?.resolve === 'boolean' ? { resolve: b.resolve } : {}),
      ...(typeof b?.body === 'string' ? { body: b.body } : {}),
      ...(b?.remove === true ? { remove: true } : {}),
    });
    return NextResponse.json({ comments: await listComments(userId, type, id) });
  } catch (e) {
    return fail(e);
  }
}
