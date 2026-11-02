'use client';
// components/logos5/HandCam.tsx — THE CAMERA, SMALL, IN A CORNER.
//
// While hands are on (lib/hand-session.ts), a person sees what the camera
// sees: its own picture, mirrored, with the hands it is following drawn over
// it and a line saying what it reads — so their own movements are visibly
// being followed. Hide folds it to a chip; the choice is kept in this
// browser. Stop ends hands everywhere. Used by AR Mode (over the Logic Map)
// and by HandControl (over the rest of Logos 5).

import { useEffect, useRef, useState } from 'react';
import { drawHands } from '@/lib/hand-tracking';
import { handSession, useHandSession } from '@/lib/hand-session';
import type { Pose } from '@/lib/hand-gestures';
import { HANDCAM_EVENT } from '@/lib/logos5/hand-commands';
import './hands.css';

/** whether the small camera view is shown — the person's choice, kept in this browser */
export const CAM_VIEW_KEY = 'socria.ar.camview.v1';

/** a pose, as the camera view and a status line say it */
export const POSE_WORD: Record<string, string> = {
  none: 'tracking',
  open: 'open hand',
  point: 'pointing',
  pinch: 'pinch',
  two: 'two fingers',
  three: 'three fingers',
  fist: 'closed hand',
  thumb: 'thumbs up',
};

/** What the camera view says about the hands it sees. */
export function handCaption(hands: number, pose: Pose | string, both: boolean): string {
  if (hands === 0) return 'No hand in view';
  if (both) return 'Both hands · zoom';
  return `${hands === 1 ? 'One hand' : 'Two hands'} · ${POSE_WORD[pose] ?? pose}`;
}

export function HandCam({
  caption,
  live,
  placement,
  onStop,
}: {
  /** what to say under the picture; while the model loads it says so */
  caption: string;
  /** a hand is being followed right now — the dot is lit */
  live: boolean;
  /** inside AR Mode's overlay, or over the rest of the app */
  placement: 'ar' | 'app';
  /** ends hands everywhere; omitted where the surrounding bar already has Stop */
  onStop?: () => void;
}) {
  const snap = useHandSession();
  const [shown, setShownState] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(CAM_VIEW_KEY) === '0') setShownState(false);
    } catch {}
  }, []);
  const setShown = (on: boolean) => {
    setShownState(on);
    try {
      localStorage.setItem(CAM_VIEW_KEY, on ? '1' : '0');
    } catch {}
  };
  // "hide the camera" / "show the camera", said (Socria Voice)
  useEffect(() => {
    const on = (e: Event) => {
      const shown = (e as CustomEvent<{ shown?: boolean }>).detail?.shown;
      if (typeof shown === 'boolean') setShown(shown);
    };
    window.addEventListener(HANDCAM_EVENT, on);
    return () => window.removeEventListener(HANDCAM_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const on = snap.state === 'on' || snap.state === 'loading';

  // the same stream the model reads — one camera, shown here, never opened twice
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (snap.stream && v.srcObject !== snap.stream) {
      v.srcObject = snap.stream;
      void v.play().catch(() => {});
    }
    if (!snap.stream) v.srcObject = null;
  }, [snap.stream, shown, on]);

  // the hands it is following, drawn over the picture as the model reads them
  useEffect(() => {
    if (!shown || !on) return;
    return handSession.onFrame((f) => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = f.video.w || 640;
      c.height = f.video.h || 480;
      const ctx = c.getContext('2d');
      if (ctx) drawHands(ctx, c.width, c.height, f.landmarks);
    });
  }, [shown, on]);

  if (!on) return null;
  const said = snap.state === 'loading' ? 'Loading hand tracking…' : caption;

  return shown ? (
    <figure className={`hand-cam is-${placement}`} aria-label="Your camera, and the hands it is following">
      <video ref={videoRef} className="hand-cam-v" playsInline muted autoPlay aria-hidden="true" />
      <canvas ref={canvasRef} className="hand-cam-c" aria-hidden="true" />
      <figcaption className="hand-cam-k" role="status" aria-live="polite">
        <i className={`hand-cam-dot${live && snap.state === 'on' ? ' is-live' : ''}`} aria-hidden="true" />
        {said}
      </figcaption>
      <span className="hand-cam-b">
        <button type="button" className="hand-cam-x" onClick={() => setShown(false)} aria-label="Hide the camera view">
          Hide
        </button>
        {onStop && (
          <button type="button" className="hand-cam-x" onClick={onStop} aria-label="Stop using your hands">
            Stop
          </button>
        )}
      </span>
    </figure>
  ) : (
    <span className={`hand-cam-chip is-${placement}`}>
      <button type="button" className="hand-cam-show" onClick={() => setShown(true)}>
        <i className={`hand-cam-dot${live && snap.state === 'on' ? ' is-live' : ''}`} aria-hidden="true" />
        Show camera
      </button>
      {onStop && (
        <button type="button" className="hand-cam-show" onClick={onStop} aria-label="Stop using your hands">
          Stop
        </button>
      )}
    </span>
  );
}
