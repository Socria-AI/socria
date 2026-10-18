// app/api/cron/events/route.ts
// GET — the daily events sweep. Called by Vercel's cron (vercel.json).
//
//   - RETENTION: deletes every registration of an event that ended more than
//     EVENT_RETENTION_DAYS ago (default 365), and resyncs those events' sheet
//     tabs so the rows leave the spreadsheet too.
//   - CATCH-UP: any event whose sheet has changes it never received (a sync
//     that failed, or ran while Google was down) is synced again.
//
// Like the other crons it will not run without CRON_SECRET, and it answers
// with counts only.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { retentionDays } from '@/lib/events/model';
import { purgeEndedBefore } from '@/lib/events/store';
import { sheetCredentials, syncEvent } from '@/lib/events/sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorised(req: NextRequest, secret: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  if (!authorised(req, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const out = { purged: 0, synced: 0, failed: 0 };
  try {
    const { deleted, events } = await purgeEndedBefore(Date.now() - retentionDays() * 86_400_000);
    out.purged = deleted;
    const dirty = new Set(events);
    if (sheetCredentials()) {
      const { data } = await supabaseAdmin().from('event_sheet_sync').select('event_id').eq('dirty', true).limit(50);
      for (const r of (data ?? []) as { event_id: string }[]) dirty.add(r.event_id);
    }
    for (const id of dirty) {
      const r = await syncEvent(id);
      if (r.status === 'synced') out.synced++;
      else if (r.status === 'failed') out.failed++;
    }
    return NextResponse.json({ ok: true, ...out });
  } catch {
    return NextResponse.json({ ok: false, ...out }, { status: 500 });
  }
}
