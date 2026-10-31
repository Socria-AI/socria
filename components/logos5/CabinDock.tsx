'use client';

// components/logos5/CabinDock.tsx — BIG-SCREEN MODE's dock (lib/logos5/cabin.ts).
//
// Down the left of a car's centre screen, a thumb's width: the Universal Map,
// then the line of thinking's four views — Thinking (its Logic Map), Chat,
// Artifacts, Content — then Write and Memory, each a 92px place with a word
// under its drawing, the one you are in held in moss. At its foot, the way
// back to the usual layout. The first time it opens it says, once, that it is
// for when the car is parked.

import { useEffect, useState, type ReactNode } from 'react';
import { CABIN_PLACES, PARKED_NOTE_KEY, type CabinPlace } from '@/lib/logos5/cabin';
import './cabin.css';

const GLYPH: Record<CabinPlace | 'write' | 'memory', ReactNode> = {
  map: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="23" cy="7" r="2.2" />
      <circle cx="20" cy="22" r="4" />
      <circle cx="7" cy="23" r="2" />
      <path d="M10.6 10.6l6.6 8.4M11 9l9.8-1.6M9 21.6l7.2-.4" />
    </>
  ),
  logic_map: (
    <>
      <rect x="4" y="5" width="11" height="7" rx="2" />
      <rect x="18" y="13" width="10" height="7" rx="2" />
      <rect x="5" y="21" width="11" height="7" rx="2" />
      <path d="M15 9c4 0 4 4 4 4M18 17h-4c-3 0-3.5 4-3.5 4" />
    </>
  ),
  chat: (
    <>
      <path d="M5 7.5h22v13H14l-6 5v-5H5z" />
      <path d="M10 12.5h12M10 16h8" />
    </>
  ),
  artifacts: (
    <>
      <rect x="4.5" y="5" width="10" height="10" rx="2" />
      <circle cx="22.5" cy="10" r="5.5" />
      <path d="M5 27l5-9 5 9z" />
      <path d="M18 20h9v7h-9z" />
    </>
  ),
  content: (
    <>
      <path d="M8 4.5h10.5L24 10v17.5H8z" />
      <path d="M18.5 4.5V10H24M12 15h8M12 19h8M12 23h5" />
    </>
  ),
  write: (
    <>
      <path d="M6 26l2-6L21 7l4 4L12 24z" />
      <path d="M18 10l4 4" />
    </>
  ),
  memory: (
    <>
      <path d="M16 6c-5.5 0-9 3.6-9 8.2 0 3 1.6 5 3.6 6.4V26h10.8v-5.4c2-1.4 3.6-3.4 3.6-6.4C25 9.6 21.5 6 16 6z" />
      <path d="M13 13.5c1.4-1.6 4.6-1.6 6 0M16 13v8" />
    </>
  ),
};

function Place({ id, label, says, on, disabled, onPress }: { id: keyof typeof GLYPH; label: string; says: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <button type="button" className={`cab-place${on ? ' is-on' : ''}`} aria-current={on ? 'page' : undefined} disabled={disabled} title={says} onClick={onPress}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        {GLYPH[id]}
      </svg>
      <span>{label}</span>
    </button>
  );
}

export function CabinDock({
  at,
  hasLine,
  onMap,
  onView,
  onWrite,
  onMemory,
  onLeave,
}: {
  /** where the screen is: the Universal Map, or a view of the line of thinking open */
  at: CabinPlace;
  /** a line of thinking is open, so its views can be gone to */
  hasLine: boolean;
  onMap: () => void;
  onView: (v: Exclude<CabinPlace, 'map'>) => void;
  onWrite?: () => void;
  onMemory?: () => void;
  onLeave: () => void;
}) {
  // said once, the first time: it is for when the car is parked
  const [note, setNote] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(PARKED_NOTE_KEY)) setNote(true);
    } catch {
      /* no storage: nothing to remember it by, and it is not shown */
    }
  }, []);
  const seen = () => {
    setNote(false);
    try {
      localStorage.setItem(PARKED_NOTE_KEY, '1');
    } catch {
      /* for this visit */
    }
  };
  return (
    <>
      <nav className="cab-dock" aria-label="Socria">
        <div className="cab-brand" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/socria-mark.png" alt="" width={44} height={41} />
          <span>Socria</span>
        </div>
        <div className="cab-places">
          {CABIN_PLACES.map((p) => (
            <Place key={p.id} id={p.id} label={p.label} says={p.says} on={at === p.id} disabled={p.id !== 'map' && !hasLine} onPress={() => (p.id === 'map' ? onMap() : onView(p.id))} />
          ))}
          {(onWrite || onMemory) && <span className="cab-rule" aria-hidden="true" />}
          {onWrite && <Place id="write" label="Write" says="Your writing and notes" on={false} onPress={onWrite} />}
          {onMemory && <Place id="memory" label="Memory" says="What Socria remembers" on={false} onPress={onMemory} />}
        </div>
        <button type="button" className="cab-leave" onClick={onLeave}>
          Usual layout
        </button>
      </nav>
      {note && (
        <div className="cab-note" role="status">
          <p>
            <b>Big-screen mode.</b> Made for a car’s screen while it is parked, and for any large touchscreen.
          </p>
          <button type="button" onClick={seen}>
            Got it
          </button>
        </div>
      )}
    </>
  );
}
