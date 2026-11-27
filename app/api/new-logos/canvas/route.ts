// app/api/new-logos/canvas/route.ts
// GET /api/new-logos/canvas?key=o:<objective>|c:<conversation> → { layout, version } (version 0: never saved)
// PUT /api/new-logos/canvas { key, layout, version }           → { version } | 409 { layout, version } (saved elsewhere first)
//
// Where things sit on a workspace canvas: presentation only (lib/new-logos/canvas.ts). Owner-scoped like every other
// New Logos table; { setup: false } before the migration, when the page keeps the layout in the browser instead.

import { NextRequest, NextResponse } from 'next/server';
import { signedIn, unauthorized } from '@/lib/new-logos/http';
import { KEY_RE, sanitizeLayout } from '@/lib/new-logos/canvas';
import { readCanvas, writeCanvas } from '@/lib/new-logos/canvas-store';
import { NlSetupError } from '@/lib/new-logos/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 400_000;

function failed(e: unknown, write: boolean) {
  if (e instanceof NlSetupError) return NextResponse.json({ ok: false, setup: false, code: 'setup' }, { status: write ? 503 : 200 });
  console.error('[new-logos canvas]', e);
  return NextResponse.json({ ok: false, error: 'The layout could not be read or saved just now.', code: 'server' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const key = req.nextUrl.searchParams.get('key') ?? '';
  if (!KEY_RE.test(key)) return NextResponse.json({ ok: false, error: 'Which canvas?', code: 'invalid' }, { status: 400 });
  try {
    const c = await readCanvas(userId, key);
    return NextResponse.json({ ok: true, setup: true, layout: c?.layout ?? { items: {} }, version: c?.version ?? 0 });
  } catch (e) {
    return failed(e, false);
  }
}

export async function PUT(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ ok: false, error: 'That layout is too large.', code: 'invalid' }, { status: 413 });
  let b: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    b = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return NextResponse.json({ ok: false, error: 'Not a layout.', code: 'invalid' }, { status: 400 });
  }
  const key = typeof b.key === 'string' ? b.key : '';
  if (!KEY_RE.test(key)) return NextResponse.json({ ok: false, error: 'Which canvas?', code: 'invalid' }, { status: 400 });
  const expected = typeof b.version === 'number' && Number.isInteger(b.version) && b.version >= 0 ? b.version : 0;
  const layout = sanitizeLayout(b.layout);
  try {
    const version = await writeCanvas(userId, key, layout, expected, Date.now());
    if (version === null) {
      const now = await readCanvas(userId, key);
      return NextResponse.json({ ok: false, code: 'conflict', layout: now?.layout ?? { items: {} }, version: now?.version ?? 0 }, { status: 409 });
    }
    return NextResponse.json({ ok: true, version });
  } catch (e) {
    return failed(e, true);
  }
}
