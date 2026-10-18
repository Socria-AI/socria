// app/api/events/[id]/ics/route.ts — the event as a calendar file.
//
// Only once its date is confirmed: before that there is nothing true to put in
// a calendar, so this is a 404. Public event facts only — no attendee data.

import { getEvent } from '@/lib/events/store';
import { publicEvent } from '@/lib/events/model';
import { emailBaseUrl } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const row = await getEvent(params.id).catch(() => null);
  const e = row && row.status !== 'draft' ? publicEvent(row) : null;
  if (!e || !e.when.confirmed) return new Response('Not found', { status: 404 });
  const end = e.when.endsAt ?? e.when.startsAt + 2 * 3600_000;
  const url = `${emailBaseUrl()}/events/${e.id}`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Socria//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@socria.app`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(e.when.startsAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(e.title)}`,
    `LOCATION:${text(e.location)}`,
    `DESCRIPTION:${text(`${e.summary}\n\n${url}`)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  return new Response(ics, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${e.id}.ics"`, 'Cache-Control': 'public, max-age=300' },
  });
}
