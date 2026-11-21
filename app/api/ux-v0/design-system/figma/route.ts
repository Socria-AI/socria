// app/api/ux-v0/design-system/figma/route.ts
// POST { file, token? } → { result, file, calls } — a Figma file's variables, styles, components and logo exports,
// through the official REST API (lib/ux-v0/dsi/figma-server.ts), mapped to the canonical system (lib/ux-v0/dsi/figma.ts)
//
// Authorised access only. The designer's personal access token travels with this one request over HTTPS and is
// never stored, logged or returned; without one, a server-side FIGMA_TOKEN is used where the deployment set one.
// Without either, the answer says how to provide one — nothing is fabricated. Signed in only, rate-limited, no model.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { figmaKey } from '@/lib/ux-v0/dsi/figma';
import { fetchFigmaFile, tokenOk } from '@/lib/ux-v0/dsi/figma-server';
import { finish } from '@/lib/ux-v0/dsi/import-json';
import { bad, readBody, signInFirst } from '@/lib/ux-v0/route-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FIGMA_SETUP = 'Paste a Figma personal access token (Figma → Settings → Security → Personal access tokens, with the file_content:read scope; on an Enterprise plan add file_variables:read for variables). It is used for this import only and never stored. A deployment can set FIGMA_TOKEN on the server instead.';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return signInFirst();
  const limited = await enforceRateLimit(req, userId, 'uxsync');
  if (limited) return limited;
  const body = await readBody(req, 8000);
  const key = figmaKey(body?.file);
  if (!key) return bad('Give a Figma file link (figma.com/design/…) or its file key.');
  const token = tokenOk(body?.token) ? body.token : tokenOk(process.env.FIGMA_TOKEN) ? process.env.FIGMA_TOKEN! : null;
  if (!token) return NextResponse.json({ error: 'No Figma access token.', setup: FIGMA_SETUP }, { status: 400 });
  try {
    const r = await fetchFigmaFile(key, token);
    if (!r.ok) return NextResponse.json({ error: r.error, calls: r.calls, ...(r.status === 403 ? { setup: FIGMA_SETUP } : {}) }, { status: r.status });
    const result = finish(r.content.content, 'figma', r.content.issues.map((i) => ({ ...i })), new Set(r.content.notes), Date.now());
    return NextResponse.json({ result, file: { key, ...r.file }, calls: r.calls });
  } catch (e) {
    console.error('ux-v0 figma import failed:', e instanceof Error ? e.name : 'unknown');
    return NextResponse.json({ error: 'Figma could not be reached just now.' }, { status: 502 });
  }
}
