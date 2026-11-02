'use client';
// components/logos5/HandControl.tsx — YOUR HANDS, ON ALL OF LOGOS 5.
//
// While hands are on (lib/hand-session.ts) and AR Mode is not open — AR Mode
// reads the hands itself, as a map in space — this makes the hand a pointer
// over everything else: the Universal Map, the canvas, the chat, the Logic
// Map, Artifacts, Content, Memory, menus and dialogs. Point to aim; pinch to
// press, drag or scroll; a quick pinch clicks; both hands zoom. What happens
// is whatever that view already does with a pointer (lib/hand-dom.ts), so
// every feature works with hands without being taught them.
//
// The ring is drawn where the hand aims, filled while it presses; whatever a
// pinch would press is outlined. The camera view (HandCam) stays in a corner
// with Hide and Stop. Voice works alongside: "click", "open this", "scroll
// down" act where the hand is (LogosApp's voice commands).

import { useEffect, useRef, useState } from 'react';
import { handSession, useHandSession } from '@/lib/hand-session';
import { HandPointer, frameToScreen } from '@/lib/hand-pointer';
import { HandDriver } from '@/lib/hand-dom';
import { HandCam, handCaption } from './HandCam';
import './hands.css';

export function HandControl({
  active,
  start,
  onEnd,
  onPoint,
}: {
  /** AR Mode is not open: the hands are a pointer over the app (AR Mode reads them itself while it is) */
  active: boolean;
  /** ask for the camera now — the person just chose Use your hands */
  start: boolean;
  /** hands have stopped (Stop, or a failure acknowledged): the app can let this go */
  onEnd: () => void;
  /** what the hand is over now — the app makes a Logic Map card under it "this" (Point & Ask) */
  onPoint?: (el: Element | null) => void;
}) {
  const snap = useHandSession();
  // started by the person's own choice, once, as this mounts
  useEffect(() => {
    if (start) void handSession.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // once hands have been on, their going off is the end of this — Stop, here or in AR Mode, ends it everywhere
  const wasOn = useRef(false);
  useEffect(() => {
    if (snap.state === 'asking' || snap.state === 'loading' || snap.state === 'on') wasOn.current = true;
    else if (snap.state === 'off' && wasOn.current) onEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.state]);
  const onStop = () => handSession.stop();
  const pointRef = useRef(onPoint);
  pointRef.current = onPoint;
  const cursorRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState<{ hands: number; pose: string; both: boolean }>({ hands: 0, pose: 'none', both: false });

  useEffect(() => {
    if (!active || snap.state !== 'on') return;
    const pointer = new HandPointer();
    const driver = new HandDriver({ onHover: (el) => pointRef.current?.(el) });
    let sig = '';
    const off = handSession.onFrame((f) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const hands = f.reads.map((r) => ({ ...r, aim: frameToScreen(r.aim, W, H), palm: frameToScreen(r.palm, W, H) }));
      const step = pointer.step(hands, f.t);
      for (const i of step.intents) driver.apply(i);
      const c = cursorRef.current;
      if (c) {
        if (step.cursor) {
          c.hidden = false;
          c.style.transform = `translate(${Math.round(step.cursor.x)}px, ${Math.round(step.cursor.y)}px)`;
          c.classList.toggle('is-pressed', step.cursor.pressed);
          c.classList.toggle('is-both', step.cursor.both);
        } else c.hidden = true;
      }
      const next = `${step.hands}|${step.pose}|${!!step.cursor?.both}`;
      if (next !== sig) {
        sig = next;
        setSeen({ hands: step.hands, pose: step.pose, both: !!step.cursor?.both });
      }
    });
    return () => {
      off();
      pointer.reset();
      driver.dispose();
      if (cursorRef.current) cursorRef.current.hidden = true;
      setSeen({ hands: 0, pose: 'none', both: false });
    };
  }, [active, snap.state]);

  if (!active) return null;
  const failed = snap.state === 'error' || snap.state === 'unsupported';
  return (
    <>
      {snap.state === 'on' && (
        <div className="hand-layer" aria-hidden="true">
          <div ref={cursorRef} className="hand-cursor" hidden />
        </div>
      )}
      <HandCam placement="app" caption={handCaption(seen.hands, seen.pose, seen.both)} live={seen.hands > 0} onStop={onStop} />
      {snap.state === 'asking' && (
        <p className="hand-note" role="status">
          Waiting for the camera…
        </p>
      )}
      {failed && (
        <p className="hand-note is-warn" role="status">
          {snap.message}{' '}
          <button
            type="button"
            onClick={() => {
              handSession.clear();
              onEnd();
            }}
          >
            OK
          </button>
        </p>
      )}
    </>
  );
}
