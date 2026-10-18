'use client';

// Counts one view of an event page, anonymously: the event id and the link's
// source tag (utm_source or an event referral code) — never who, and never
// the referring address (lib/product-event-kinds.ts decides what is kept).

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

export function EventBeacon({ eventId }: { eventId: string }) {
  useEffect(() => {
    let utm_source: string | undefined;
    let ref: string | undefined;
    try {
      const q = new URLSearchParams(window.location.search);
      utm_source = q.get('utm_source')?.toLowerCase().slice(0, 40) || undefined;
      ref = q.get('ref')?.toLowerCase().slice(0, 40) || undefined;
    } catch {}
    track('event_page_viewed', { event: eventId, ...(utm_source ? { utm_source } : {}), ...(ref ? { ref } : {}) });
  }, [eventId]);
  return null;
}
