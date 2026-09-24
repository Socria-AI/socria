'use client';

// The Memory page's third part: the Thinking Journey, which is NOT Core 4's
// memory and is on this page precisely because of that.
//
// Core 4 reads the Mind Graph. Core 2 and Core 3.1 read this — a running
// account of how the person thinks, kept across conversations — and it is
// still sent with every one of their turns. Two stores, two readers, one
// sentence a person would use for both ("what Socria remembers"), which is
// how the chat sidebar came to point at the one the model in front of them
// was not reading.
//
// WHY IT IS HERE AT ALL: the chip that opened it is gone, and it was the only
// place a person could forget ONE thing rather than all of it. Removing a
// deletion control is not a UI cleanup. So the control moved to where the
// link now goes, rather than disappearing with the chip.
//
// The modal is the same component the chip used. A second renderer for the
// same rows would be a second thing to keep honest.

import { useCallback, useEffect, useState } from 'react';
import { JourneyDebugModal } from '@/components/JourneyDebugModal';
import { usePlan } from '@/components/usePlan';
import {
  sanitizeUserUnderstanding,
  hasJourneyContent,
  type UserUnderstanding,
} from '@/lib/socria-prompt';
import './journey-record.css';

/** The same key /chat mirrors it to, so a forget here is not undone there. */
const JOURNEY_KEY = 'socria.journey.v1';

export function JourneyRecord() {
  const [journey, setJourney] = useState<UserUnderstanding | null>(null);
  const [open, setOpen] = useState(false);
  const plan = usePlan();

  const hold = useCallback((next: UserUnderstanding | null) => {
    setJourney(next && hasJourneyContent(next) ? next : null);
    // The browser holds its own copy and syncs it back. A forget that only
    // reached the server would be reproposed from here on the next merge —
    // the tombstone refuses it, but a stale copy on screen is its own bug.
    try {
      if (next) localStorage.setItem(JOURNEY_KEY, JSON.stringify(next));
      else localStorage.removeItem(JOURNEY_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/profile', { cache: 'no-store' });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        const u = j?.understanding ? sanitizeUserUnderstanding(j.understanding) : null;
        if (!cancelled) setJourney(u && hasJourneyContent(u) ? u : null);
      } catch {
        // Silent: this half of the page is additional, and an error banner
        // for a store the person may never have used is noise.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing carried means nothing to correct. An empty section explaining a
  // store they have never filled is an invitation to worry about it.
  if (!journey) return null;

  const kept = journey.entries?.length ?? 0;

  return (
    <section className="jr-root" aria-labelledby="jr-h">
      <span className="jr-kicker">Core 2 and Core 3.1</span>
      <h2 id="jr-h">The Thinking Journey</h2>
      <p className="jr-deck">
        The older Cores keep their own running account of how you think, and it
        travels with every turn you spend on them. Core 4 does not read it — its
        memory is the graph above. It is here so it is one page, and so you can
        take any of it back.
      </p>
      <button type="button" className="jr-open" onClick={() => setOpen(true)}>
        Read it{kept > 0 ? ` — ${kept} ${kept === 1 ? 'thing' : 'things'} carried` : ''} →
      </button>

      <JourneyDebugModal
        open={open}
        onClose={() => setOpen(false)}
        journey={journey}
        plan={plan.known ? plan.plan : 'free'}
        signedIn
        onForget={async (id) => {
          try {
            const res = await fetch('/api/profile/forget', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            });
            if (!res.ok) return;
            const j = await res.json();
            if (j?.understanding) hold(sanitizeUserUnderstanding(j.understanding));
          } catch {}
        }}
        onForgetAll={async () => {
          // The account route, which is the one that also clears the thread
          // memory and everything Core 4 worked out. Nothing about the
          // conversations themselves is touched.
          try {
            await fetch('/api/account/memory', { method: 'DELETE' });
          } catch {}
          hold(null);
          setOpen(false);
        }}
      />
    </section>
  );
}
