// app/api/new-logos/context/route.ts
// GET /api/new-logos/context?conversation=<id>&turns=<n> → the objective context for a conversation, or { turn: null }
//
// Assembled here, from the person's own nodes, so what a conversation is told comes from authorised records rather
// than from whatever a page sends (lib/new-logos/context.ts says what is included, and what never is). The page passes
// it to the existing chat endpoint as `objective`, which re-sanitises it like every other field.

import { NextRequest, NextResponse } from 'next/server';
import { signedIn, unauthorized, withStore } from '@/lib/new-logos/http';
import { cleanId } from '@/lib/new-logos/model';
import { contextFor } from '@/lib/new-logos/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const conversation = cleanId(req.nextUrl.searchParams.get('conversation'));
  if (!conversation) return NextResponse.json({ ok: false, error: 'Which conversation?', code: 'invalid' }, { status: 400 });
  const turns = Math.max(0, Math.min(100000, Number(req.nextUrl.searchParams.get('turns')) || 0));
  return withStore(async (store) => {
    const [nodes, relations] = await Promise.all([store.nodes(userId), store.relations(userId)]);
    return NextResponse.json({ ok: true, turn: contextFor(nodes, relations, conversation, turns) });
  }, false);
}
