'use client';
// components/CollabBar.tsx
//
// Logos 2 in the header: who is here, and how to bring someone in.
//
// Three states, and it stays out of the way in all of them:
//  - alone, not shared → a single quiet "Think together" button;
//  - shared, waiting → the code and a copyable link, with the reach spelled
//    out ("across devices" vs "this browser") so nobody is surprised that a
//    link did not reach a phone when Realtime is not configured;
//  - two present → two initials in their seat colours, and Leave.
//
// The colours are the seat colours from lib/collab — moss for the host, slate
// for the guest — the same ones the messages and the map nodes wear, so a
// glance ties a dot to an idea.

import { useState } from 'react';
import { SEAT_COLOR, initialOf } from '@/lib/collab';
import type { CollabHandle as Handle } from '@/components/useLogosCollab';

export function CollabBar({ room }: { room: Handle }) {
  const [copied, setCopied] = useState(false);

  if (!room.active) {
    return (
      <>
      {room.error && <span className="lg-collab-err" role="alert">{room.error}</span>}
      <button type="button" className="lg-collab-start" onClick={room.share} title="Think together">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.4" />
          <path d="M4 19v-1a5 5 0 0 1 9-3M14.5 19v-.5a4 4 0 0 1 6-3.2" />
        </svg>
        Think together
      </button>
      </>
    );
  }

  const copy = async () => {
    if (!room.link) return;
    try {
      await navigator.clipboard.writeText(room.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* a browser that refuses the clipboard still shows the code to read out */
    }
  };

  const alone = room.present.length < 2;

  return (
    <div className="lg-collab" role="group" aria-label="Thinking together">
      <span className="lg-collab-who">
        {room.present.map((p) => (
          <span
            key={p.id}
            className="lg-collab-dot"
            style={{ background: SEAT_COLOR[p.seat] }}
            title={`${p.name}${p.id === room.me.id ? ' (you)' : ''}`}
          >
            {initialOf(p.name)}
          </span>
        ))}
      </span>

      {alone ? (
        <button type="button" className="lg-collab-invite" onClick={copy}>
          {copied ? 'Link copied' : `Invite — ${room.code}`}
          {/* One reach now, and it is the honest one: the room goes through
              Socria's server, which checks who you are before it hands
              anyone a word of it. The old copy had to distinguish "across
              devices" from "this browser" because one of the two paths
              reached anyone holding a public key. */}
          <span className="lg-collab-reach">signed-in only</span>
        </button>
      ) : (
        <span className="lg-collab-live">Thinking together</span>
      )}

      <button type="button" className="lg-collab-leave" onClick={room.leave} title="Leave the shared room">
        Leave
      </button>
      {room.error && (
        <span className="lg-collab-err" role="alert">
          {room.error}
        </span>
      )}
    </div>
  );
}
