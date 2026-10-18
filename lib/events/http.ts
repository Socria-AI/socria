// lib/events/http.ts — what the event routes share: one way to turn a store
// error into a response, and one way to mirror a change to the sheet after
// the response has gone.

import 'server-only';
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { EventStoreError } from './store';
import { syncEvent } from './sheets';

export const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function storeFailure(e: unknown): NextResponse {
  if (e instanceof EventStoreError) {
    switch (e.kind) {
      case 'not-found':
        return json({ error: 'Not found.' }, 404);
      case 'duplicate':
        return json({ error: 'Already registered.', code: 'duplicate' }, 409);
      case 'closed':
        return json({ error: 'Registration for this event is closed.', code: 'closed' }, 409);
      case 'full':
        return json({ error: 'This event is full.', code: 'full' }, 409);
      case 'conflict':
        return json({ error: 'That changed while you were looking. Refresh and try again.', code: 'conflict' }, 409);
      default:
        return json({ error: 'Events are unavailable right now. Please try again shortly.' }, 503);
    }
  }
  console.error('[events] unexpected', e instanceof Error ? e.name : typeof e);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

/** Mirror the event to its sheet once the response is on its way; a sheet outage never fails a registration. */
export function afterChange(eventId: string): void {
  const work = syncEvent(eventId).catch(() => undefined);
  try {
    waitUntil(work);
  } catch {
    void work;
  }
}

/** Same-origin check for browser POSTs that change something (a second line behind auth). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
