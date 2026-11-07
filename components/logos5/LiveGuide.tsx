'use client';
// components/logos5/LiveGuide.tsx — SOCRIA LIVE AR GUIDANCE (Logos 5.5).
//
// The camera, full screen; a question, typed or held-to-say; and Socria
// showing how, on the live picture: arrows, highlights, labels, the movement
// to make, a small step diagram or a simple model of the thing — anchored to
// the objects and kept on them as the camera moves. Step by step, each one
// checked when the person says it is done (or when the picture shows they did
// something), with a clearer instruction when it is not yet.
//
//   camera → a 512px frame → /api/logos/guide (plan) → overlay instructions (lib/guide/overlay.ts)
//          → SVG over the video, anchored and tracked in the browser (lib/guide/tracking.ts)
//          → progress checks on a glance (/api/logos/guide, check) → the next step (lib/guide/session.ts)
//
// The camera is never on until the person starts it, after being told what is
// sent and what is kept (nothing). A frame leaves the device only when they ask
// or a step is checked. The mic is on only while held. Emergencies are not
// guided — the call to make comes first (lib/guide/safety.ts). Early access,
// with AR Mode.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { leastSure, UNSURE, type GuidePlan, type Overlay } from '@/lib/guide/overlay';
import { hazardOf } from '@/lib/guide/safety';
import { placeAnchor, stepAnchors, toGray, trackSize, frameChange, type Anchor, type Gray } from '@/lib/guide/tracking';
import {
  IDLE,
  MOVED,
  boxToScreen,
  STILL,
  checkContext,
  coverFit,
  currentStep,
  guideReducer,
  missHint,
  placeOverlays,
  sendSize,
  shouldAutoCheck,
  toFrame,
  type Fit,
  type Placed,
} from '@/lib/guide/session';
import { checkBody } from '@/lib/guide/prompt';
import { loopPath, tickPath } from '@/lib/guide/sketch';
import { CameraMarks, HowSketch, Icon, IntroSketch, Tick } from '@/components/logos5/GuideDrawings';
import { handSession } from '@/lib/hand-session';
import { useVoiceInput } from '@/components/useVoiceInput';
import './live-guide.css';

export type GuideAccess = 'tester' | 'preview' | 'unknown';

/** what the person agreed to, kept in this browser so the explanation is not repeated every time */
export const GUIDE_CONSENT_KEY = 'socria.guide.consent.v1';

const readConsent = () => {
  try {
    return localStorage.getItem(GUIDE_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
};

/** The camera for looking at things: the back one on a phone, unless the person turns it round. */
async function openGuideCamera(facing: 'environment' | 'user'): Promise<MediaStream> {
  if (typeof window === 'undefined' || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('The camera needs a secure page (https) and a browser that allows camera access.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    throw new Error(
      name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it in the address bar (or your phone’s settings) and try again.'
        : name === 'NotFoundError'
          ? 'No camera was found on this device.'
          : name === 'NotReadableError'
            ? 'The camera is in use by another app.'
            : 'The camera could not start.'
    );
  }
}

/** The movement, said: the verb, then the thing, then which way ("Twist the lid anticlockwise"). */
const MOTION_SAY: Record<string, [string, string]> = {
  'twist-ccw': ['Twist', 'anticlockwise'],
  'twist-cw': ['Twist', 'clockwise'],
  push: ['Push', ''],
  pull: ['Pull', ''],
  lift: ['Lift', ''],
  lower: ['Lower', ''],
  press: ['Press', ''],
  tap: ['Tap', ''],
  'slide-left': ['Slide', 'left'],
  'slide-right': ['Slide', 'right'],
  'slide-up': ['Slide', 'up'],
  'slide-down': ['Slide', 'down'],
  tilt: ['Tilt', ''],
  shake: ['Shake', ''],
  squeeze: ['Squeeze', ''],
};
function motionSay(motion: string, label?: string): string {
  const [verb, way] = MOTION_SAY[motion] ?? ['Move', ''];
  return `${verb} ${label ? `the ${label.toLowerCase()}` : 'it'}${way ? ` ${way}` : ''}`;
}

export function LiveGuide({
  open,
  onClose,
  access,
  onKeep,
  sessionId,
}: {
  open: boolean;
  onClose: () => void;
  access: GuideAccess;
  /** keep the steps in the line of thinking, as a sequence */
  onKeep?: (question: string, plan: GuidePlan) => void;
  sessionId?: string | null;
}) {
  const [consented, setConsented] = useState(false);
  const [camState, setCamState] = useState<'off' | 'starting' | 'on' | 'error'>('off');
  const [camError, setCamError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [s, dispatch] = useReducer(guideReducer, IDLE);
  const [question, setQuestion] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [tracking, setTracking] = useState(true);
  const [fit, setFit] = useState<Fit>(() => coverFit(0, 0, 1, 1));
  const [now, setNow] = useState(0);
  const [confirmed, setConfirmed] = useState<Record<string, true>>({});
  const [join, setJoin] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  /** what the last check saw, and of which step — said under that step, not the next */
  const [lastLook, setLastLook] = useState<{ step: number; saw: string; done: boolean } | null>(null);
  /** bumped each time a frame leaves the device, for the flash that says so */
  const [flash, setFlash] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLVideoElement['srcObject']>(null);
  const trackCanvas = useRef<HTMLCanvasElement | null>(null);
  const sendCanvas = useRef<HTMLCanvasElement | null>(null);
  const prevGray = useRef<Gray | null>(null);
  const anchorsRef = useRef<Anchor[]>([]);
  const stateRef = useRef(s);
  stateRef.current = s;
  const motion = useRef({ moved: false, stillSince: 0, lastLook: 0, autoChecks: {} as Record<number, number> });
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => setConsented(readConsent()), []);

  // ── the camera: started by the person, stopped when they leave ──
  const stopCamera = useCallback(() => {
    const st = streamRef.current as MediaStream | null;
    st?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamState('off');
    prevGray.current = null;
  }, []);
  const startCamera = useCallback(
    async (want: 'environment' | 'user' = facing) => {
      // one camera at a time: hands, if on, are stopped (they read the front camera)
      if (handSession.active) handSession.stop();
      stopCamera();
      setCamState('starting');
      setCamError(null);
      try {
        const st = await openGuideCamera(want);
        streamRef.current = st;
        const v = videoRef.current;
        if (v) {
          v.srcObject = st;
          await v.play().catch(() => {});
        }
        setCamState('on');
      } catch (e) {
        setCamState('error');
        setCamError(e instanceof Error ? e.message : 'The camera could not start.');
      }
    },
    [facing, stopCamera]
  );
  useEffect(() => {
    if (!open) {
      inflight.current?.abort();
      stopCamera();
      dispatch({ type: 'restart' });
      setAdjusting(false);
      setLastLook(null);
    }
  }, [open, stopCamera]);
  useEffect(() => () => stopCamera(), [stopCamera]);
  // the live view has its own video element: the stream follows it there once the camera is on
  useEffect(() => {
    const v = videoRef.current;
    const st = streamRef.current;
    if (camState === 'on' && v && st && v.srcObject !== st) {
      v.srcObject = st;
      void v.play().catch(() => {});
    }
  });
  // a hidden page pauses guidance and checks nothing
  useEffect(() => {
    if (!open) return;
    const on = () => {
      if (document.hidden) dispatch({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [open]);

  // ── a frame, small, as a JPEG data URL (and its greyscale twin for tracking from) ──
  const grab = useCallback((): { url: string; gray: Gray } | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const size = sendSize(v.videoWidth, v.videoHeight);
    const c = (sendCanvas.current ??= document.createElement('canvas'));
    c.width = size.w;
    c.height = size.h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, size.w, size.h);
    const url = c.toDataURL('image/jpeg', 0.7);
    setFlash((f) => f + 1);
    const t = trackSize(v.videoWidth, v.videoHeight);
    const tc = (trackCanvas.current ??= document.createElement('canvas'));
    tc.width = t.w;
    tc.height = t.h;
    const tctx = tc.getContext('2d', { willReadFrequently: true });
    if (!tctx) return { url, gray: { w: 1, h: 1, px: new Uint8Array(1) } };
    tctx.drawImage(v, 0, 0, t.w, t.h);
    const gray = toGray(tctx.getImageData(0, 0, t.w, t.h).data, t.w, t.h);
    return { url, gray };
  }, []);

  // ── asking: a plan from one frame ──
  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text) return;
      // an emergency is answered at once, from the words — before any frame is taken
      const h = hazardOf(text);
      const frame = h.level === 'emergency' || h.level === 'stop' ? null : grab();
      if (!frame && !(h.level === 'emergency' || h.level === 'stop')) {
        dispatch({ type: 'failed', error: 'The camera is not showing anything yet.' });
        return;
      }
      dispatch({ type: 'ask', question: text, framed: !!frame });
      inflight.current?.abort();
      const ac = new AbortController();
      inflight.current = ac;
      try {
        const r = await fetch('/api/logos/guide', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'plan', question: text, ...(frame ? { image: frame.url } : {}), ...(sessionId ? { sessionId } : {}) }),
          signal: ac.signal,
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.plan) {
          dispatch({ type: 'failed', error: j?.error ?? 'I could not look at that just now — try again in a moment.' });
          return;
        }
        const plan = j.plan as GuidePlan;
        // the anchors start where the reading put the objects, placed on the frame it read (and matched against it)
        anchorsRef.current = plan.objects.map((o) => placeAnchor(o.id, o.box, o.confidence, frame?.gray, performance.now()));
        setAnchors(anchorsRef.current);
        if (frame) prevGray.current = frame.gray;
        motion.current = { moved: false, stillSince: performance.now(), lastLook: performance.now(), autoChecks: {} };
        setConfirmed({});
        setLastLook(null);
        dispatch({ type: 'planned', plan });
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') dispatch({ type: 'failed', error: 'I could not reach Socria just now.' });
      }
    },
    [grab, sessionId]
  );

  // ── checking: is the step done? ──
  const check = useCallback(
    async (auto = false) => {
      const st = stateRef.current;
      const body = checkBody(st);
      const frame = grab();
      if (!body || !frame) return;
      if (auto) motion.current.autoChecks[st.step] = (motion.current.autoChecks[st.step] ?? 0) + 1;
      dispatch({ type: 'check' });
      motion.current.lastLook = performance.now();
      motion.current.moved = false;
      try {
        const r = await fetch('/api/logos/guide', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'check', image: frame.url, step: body }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.check) {
          dispatch({ type: 'failed', error: j?.error ?? 'That check did not come back — press Done to try again.' });
          return;
        }
        // where the look found the objects, the anchors restart from (unless moved by hand)
        if (Array.isArray(j.check.objects) && j.check.objects.length) {
          const seen = new Map((j.check.objects as GuidePlan['objects']).map((o) => [o.id, o]));
          anchorsRef.current = anchorsRef.current.map((a) => {
            const o = seen.get(a.id);
            return o ? placeAnchor(a.id, o.box, o.confidence, frame.gray, performance.now()) : a;
          });
          prevGray.current = frame.gray;
          setAnchors(anchorsRef.current);
        }
        setLastLook({ step: st.step, saw: String(j.check.saw ?? ''), done: !!j.check.done });
        dispatch({ type: 'checked', check: j.check });
      } catch {
        dispatch({ type: 'failed', error: 'I could not reach Socria just now.' });
      }
    },
    [grab]
  );

  // ── the loop: track the anchors, notice movement, check by itself now and then ──
  useEffect(() => {
    if (!open || camState !== 'on') return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 80) return; // ~12 frames a second is plenty to follow a hand-held phone
      last = t;
      const v = videoRef.current;
      const el = stageRef.current;
      if (!v || !el || !v.videoWidth) return;
      setFit(coverFit(v.videoWidth, v.videoHeight, el.clientWidth, el.clientHeight, facing === 'user'));
      setNow(t);
      const st = stateRef.current;
      if (st.phase !== 'guiding' && st.phase !== 'checking') return;
      let gray: Gray;
      try {
        const size = trackSize(v.videoWidth, v.videoHeight);
        const tc = (trackCanvas.current ??= document.createElement('canvas'));
        tc.width = size.w;
        tc.height = size.h;
        const ctx = tc.getContext('2d', { willReadFrequently: true });
        if (!ctx) return setTracking(false);
        ctx.drawImage(v, 0, 0, size.w, size.h);
        gray = toGray(ctx.getImageData(0, 0, size.w, size.h).data, size.w, size.h);
      } catch {
        // a canvas the browser will not read (a tainted frame): overlays stay where the reading put them
        setTracking(false);
        return;
      }
      const prev = prevGray.current;
      if (prev && prev.w === gray.w && prev.h === gray.h) {
        const change = frameChange(prev, gray);
        const m = motion.current;
        if (change > MOVED) {
          m.moved = true;
          m.stillSince = t;
        } else if (change > STILL) m.stillSince = t;
        if (anchorsRef.current.length) {
          anchorsRef.current = stepAnchors(anchorsRef.current, prev, gray, t);
          setAnchors(anchorsRef.current);
        }
        if (shouldAutoCheck({ phase: st.phase, autoChecks: m.autoChecks[st.step] ?? 0, sinceLastLookMs: t - m.lastLook, moved: m.moved, settledMs: t - m.stillSince })) void check(true);
      }
      prevGray.current = gray;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, camState, facing, check]);

  // ── voice: held to say the question ──
  const voice = useVoiceInput((text) => {
    setQuestion(text);
    void ask(text);
  });

  // ── keys: Space pauses, arrows step, Esc leaves ──
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea');
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (!typing && stateRef.current.plan) {
        if (e.key === 'ArrowRight') dispatch({ type: 'next' });
        else if (e.key === 'ArrowLeft') dispatch({ type: 'back' });
        else if (e.key === ' ') {
          e.preventDefault();
          dispatch({ type: stateRef.current.phase === 'paused' ? 'resume' : 'pause' });
        }
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, onClose]);

  const step = currentStep(s);
  const placed: Placed[] = useMemo(() => {
    // nothing drawn once it is done, or when the card says to get help instead
    if (!s.plan || !step || s.dismissed || s.phase === 'done' || s.phase === 'safety') return [];
    return placeOverlays({ plan: s.plan, step, anchors, moved: s.moved, fit, now, tracking });
  }, [s.plan, step, s.dismissed, anchors, s.moved, fit, now, tracking]);
  // the movement to make, as a little sketch of a hand doing it: always in the card on a desk, and on a phone
  // when the picture cannot show it (its object is not being followed)
  const how = useMemo(() => {
    if (!s.plan || !step) return null;
    const marks = step.overlays.filter((o) => o.kind === 'motion' || o.kind === 'model');
    if (!marks.length) return null;
    const model = marks.find((o) => o.kind === 'model');
    const moving = marks.find((o) => o.motion);
    const target = (moving ?? model)?.target;
    const obj = target ? s.plan.objects.find((o) => o.id === target) : undefined;
    const lostNow = placed.some((p) => p.mode === 'fallback' && (p.overlay.kind === 'motion' || p.overlay.kind === 'model'));
    // a sketch card already drawn beside its object on the picture is not drawn again in the card
    const onPicture = placed.some((p) => p.overlay.kind === 'model' && p.mode !== 'fallback');
    if (onPicture && !lostNow) return null;
    return { model: model?.model, motion: moving?.motion, word: moving?.motion ? motionSay(moving.motion, obj?.label) : obj ? `The ${obj.label.toLowerCase()}` : '', lost: lostNow };
  }, [s.plan, step, placed]);
  const unsureObj = s.plan && step ? leastSure(s.plan, step) : null;
  const askConfirm = unsureObj && unsureObj.confidence < UNSURE && !confirmed[unsureObj.id] && !s.moved[unsureObj.id] ? unsureObj : null;

  // ── adjusting by hand: drag an object to where it really is ──
  const drag = useRef<{ id: string; dx: number; dy: number; w: number; h: number } | null>(null);
  const onHandleDown = (e: RPointerEvent<SVGElement>, p: Placed) => {
    if (!p.object || !p.box) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const r = stageRef.current!.getBoundingClientRect();
    drag.current = { id: p.object.id, dx: e.clientX - r.left - p.box.x, dy: e.clientY - r.top - p.box.y, w: p.box.w, h: p.box.h };
  };
  const onHandleMove = (e: RPointerEvent<SVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = stageRef.current!.getBoundingClientRect();
    const a = toFrame({ x: e.clientX - r.left - d.dx, y: e.clientY - r.top - d.dy }, fit);
    const b = toFrame({ x: e.clientX - r.left - d.dx + d.w, y: e.clientY - r.top - d.dy + d.h }, fit);
    const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    dispatch({ type: 'move', id: d.id, box });
    // put down by hand on the frame showing now: that is what it is matched against from here
    anchorsRef.current = anchorsRef.current.map((x) => (x.id === d.id ? placeAnchor(x.id, box, 1, prevGray.current, performance.now()) : x));
  };
  const onHandleUp = () => {
    drag.current = null;
  };


  const joinWaitlist = async () => {
    setJoin('sending');
    try {
      const r = await fetch('/api/ar/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      setJoin(r.ok ? 'done' : 'error');
    } catch {
      setJoin('error');
    }
  };

  // where a thing that cannot be followed was last seen, so the note can point there
  const lost = useMemo(() => {
    const seen = new Map<string, { why: string; angle: number }>();
    for (const p of placed) {
      if (p.mode !== 'fallback' || p.overlay.kind === 'diagram' || !p.why || seen.has(p.why)) continue;
      let angle = -90; // up, unless it is known where it went
      const id = p.object?.id;
      const box = id ? (s.moved[id] ?? anchors.find((a) => a.id === id)?.box ?? s.plan?.objects.find((o) => o.id === id)?.box) : undefined;
      if (box && fit.sw) {
        const sb = boxToScreen(box, fit);
        const dx = sb.x + sb.w / 2 - fit.sw / 2;
        const dy = sb.y + sb.h / 2 - fit.sh / 2;
        if (Math.hypot(dx, dy) > 24) angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      }
      seen.set(p.why, { why: p.why, angle });
    }
    return [...seen.values()];
  }, [placed, anchors, s.moved, s.plan, fit]);

  if (!open) return null;

  // ── early access: what it is, drawn, and the waitlist ──
  if (access === 'preview') {
    return (
      <div className="lg5" role="dialog" aria-modal="true" aria-label="Live guidance">
        <div className="lg5-sheet lg5-intro">
          <IntroSketch />
          <span className="l5-label">Live guidance · early access</span>
          <h2 className="lg5-h">Point your camera, ask — and Socria draws the how on the picture.</h2>
          <p className="lg5-p">A loop round the thing that matters, the movement to make, a little sketch of a hand doing it: step by step, on what is in front of you. It is in early access with AR Mode.</p>
          <div className="lg5-row">
            <button type="button" className="l5-btn is-primary" onClick={joinWaitlist} disabled={join === 'sending' || join === 'done'}>
              {join === 'done' ? 'You are on the waitlist' : join === 'sending' ? 'Joining…' : 'Join the waitlist'}
            </button>
            <button type="button" className="l5-link" onClick={onClose}>
              Not now
            </button>
          </div>
          {join === 'error' && <p className="lg5-note">The waitlist could not be reached. Try again in a moment.</p>}
        </div>
      </div>
    );
  }

  // ── before the camera: what is sent, what is kept ──
  if (!consented || camState === 'off' || camState === 'error') {
    return (
      <div className="lg5" role="dialog" aria-modal="true" aria-label="Live guidance">
        <div className="lg5-sheet lg5-intro">
          <IntroSketch />
          <span className="l5-label">Live guidance</span>
          <h2 className="lg5-h">Show Socria what you are doing, and it shows you how — on your camera.</h2>
          <ul className="lg5-promises">
            <li>
              <Icon name="camera" />
              <span>
                <b>The camera stays on your screen.</b> It is on only while this is open.
              </span>
            </li>
            <li>
              <Icon name="frame" />
              <span>
                <b>One still frame, only when you ask</b> or a step is checked — read, then discarded. Nothing is recorded or kept.
              </span>
            </li>
            <li>
              <Icon name="mic" />
              <span>
                <b>The microphone listens only while you hold it.</b>
              </span>
            </li>
            <li>
              <Icon name="ask" />
              <span>
                <b>Honest when unsure.</b> When Socria is not sure what it sees, it says so — check it against what is in front of you.
              </span>
            </li>
          </ul>
          <p className="lg5-sos">
            <b>Not for emergencies.</b> If someone is hurt or in danger, call your local emergency number first.
          </p>
          {camError && (
            <p className="lg5-note" role="alert">
              {camError}
            </p>
          )}
          <div className="lg5-row">
            <button
              type="button"
              className="l5-btn is-primary"
              disabled={camState === 'starting'}
              onClick={() => {
                try {
                  localStorage.setItem(GUIDE_CONSENT_KEY, '1');
                } catch {}
                setConsented(true);
                void startCamera();
              }}
            >
              {camState === 'starting' ? 'Starting the camera…' : 'Start the camera'}
            </button>
            <button type="button" className="l5-link" onClick={onClose}>
              Not now
            </button>
          </div>
        </div>
        {/* the video is in the page from the start, so the stream has somewhere to go the moment it is allowed */}
        <video ref={videoRef} className="lg5-video is-hidden" playsInline muted aria-hidden="true" />
      </div>
    );
  }

  const busy = s.phase === 'looking' || s.phase === 'checking';
  const paused = s.phase === 'paused';
  const total = s.plan?.steps.length ?? 0;
  const emergency = s.phase === 'safety' && !!s.plan && hazardOf(s.question).level === 'emergency';
  // the last step's "done", said on a phone, where the list of steps is folded to the one in hand
  const doneNote = lastLook?.done && lastLook.step === s.step - 1 ? lastLook.saw : null;
  const motionWords = placed.filter((p) => p.overlay.kind === 'motion' && p.overlay.motion).map((p) => motionSay(p.overlay.motion!, p.object?.label));

  return (
    <div className={`lg5 is-live${paused ? ' is-paused' : ''}`} role="dialog" aria-modal="true" aria-label="Live guidance">
      <div ref={stageRef} className="lg5-stage">
        <video ref={videoRef} className={`lg5-video${facing === 'user' ? ' is-mirror' : ''}`} playsInline muted aria-label="Your camera" />
        {!s.dismissed && (
          <CameraMarks
            key={s.replay}
            placed={placed}
            stage={{ w: fit.sw, h: fit.sh }}
            stepKey={`${s.step}`}
            paused={paused}
            adjusting={adjusting}
            onDown={onHandleDown}
            onMove={onHandleMove}
            onUp={onHandleUp}
          />
        )}
        {/* a frame left the device: said, by a soft flash, every time */}
        {flash > 0 && <div key={flash} className="lg5-flash" aria-hidden="true" />}
        {busy && (
          <div className="lg5-seek" aria-live="polite">
            <svg viewBox="0 0 200 120" aria-hidden="true">
              <path pathLength={1} d={loopPath({ x: 40, y: 30, w: 120, h: 60 }, 'seek', 6)} />
            </svg>
            <span>{s.phase === 'checking' ? 'Checking that step…' : 'Looking…'}</span>
          </div>
        )}
        <div className="lg5-top">
          <span className="lg5-live" aria-live="polite">
            <i aria-hidden="true" /> Live
          </span>
          {s.looks > 0 && <span className="lg5-looks">{s.looks === 1 ? '1 frame sent' : `${s.looks} frames sent`}</span>}
          <span className="lg5-sp" />
          <button
            type="button"
            className="lg5-round"
            onClick={() => {
              const next = facing === 'environment' ? 'user' : 'environment';
              setFacing(next);
              void startCamera(next);
            }}
            aria-label="Turn the camera round"
            title="Turn the camera round"
          >
            <Icon name="flip" />
          </button>
          <button type="button" className="lg5-round" onClick={onClose} aria-label="Stop the camera and close Live guidance" title="Close">
            <Icon name="close" />
          </button>
        </div>
        {lost.length > 0 && (
          <div className="lg5-lost" role="status">
            {lost.map((l) => (
              <span key={l.why} className="lg5-lost-i">
                <svg className="lg5-lost-arrow" viewBox="0 0 24 24" style={{ transform: `rotate(${l.angle}deg)` }} aria-hidden="true">
                  <path d="M5 12h13M13 7l5 5-5 5" />
                </svg>
                {l.why}
              </span>
            ))}
          </div>
        )}
        {!tracking && s.plan && <div className="lg5-quiet">Overlays stay where Socria last saw things — move the camera slowly.</div>}
      </div>

      <div className="lg5-sheet lg5-guide">
        {s.phase === 'safety' && s.plan ? (
          <div className="lg5-safety" role="alert">
            <span className="l5-label lg5-sos-label">{emergency ? 'Get help now' : 'Not one to guide'}</span>
            {s.plan.escalate && <p className="lg5-escalate">{s.plan.escalate}</p>}
            {callable(s.plan.escalate).length > 0 && (
              <div className="lg5-calls">
                {callable(s.plan.escalate).map((n) => (
                  <a key={n} className="lg5-call" href={`tel:${n}`}>
                    <Icon name="phone" size={18} /> Call {n}
                  </a>
                ))}
              </div>
            )}
            {s.plan.first?.length ? (
              <ol className="lg5-first">
                {s.plan.first.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ol>
            ) : null}
            {s.plan.safetyNote && <p className="lg5-p">{s.plan.safetyNote}</p>}
            <div className="lg5-row">
              <button type="button" className="l5-link" onClick={() => dispatch({ type: 'restart' })}>
                Ask something else
              </button>
            </div>
          </div>
        ) : s.plan && step && (s.phase === 'guiding' || s.phase === 'checking' || s.phase === 'paused') ? (
          <div className="lg5-gc">
            <div className="lg5-gc-h">
              <span className="lg5-sig">Socria</span>
              <span className="lg5-pips" role="img" aria-label={`Step ${s.step + 1} of ${total}`}>
                {s.plan.steps.map((_, i) => (
                  <i key={i} className={i < s.step ? 'is-done' : i === s.step ? 'is-now' : ''} />
                ))}
              </span>
              <span className="lg5-sp" />
              <div className="lg5-tools" role="toolbar" aria-label="Guidance tools">
                <button type="button" className="lg5-ctl" onClick={() => dispatch({ type: 'replay' })} aria-label="Replay" title="Replay the drawing">
                  <Icon name="replay" />
                </button>
                <button type="button" className="lg5-ctl" onClick={() => dispatch({ type: paused ? 'resume' : 'pause' })} aria-label={paused ? 'Resume' : 'Pause'} title={paused ? 'Resume' : 'Pause'}>
                  <Icon name={paused ? 'play' : 'pause'} />
                </button>
                <button type="button" className={`lg5-ctl${adjusting ? ' is-on' : ''}`} aria-pressed={adjusting} onClick={() => setAdjusting((v) => !v)} aria-label="Adjust" title="Move a mark to where the thing really is">
                  <Icon name="adjust" />
                </button>
                <button type="button" className="lg5-ctl" onClick={() => dispatch({ type: s.dismissed ? 'show' : 'dismiss' })} aria-label={s.dismissed ? 'Show' : 'Hide'} title={s.dismissed ? 'Show the drawing' : 'Hide the drawing'}>
                  <Icon name={s.dismissed ? 'eye' : 'eyeOff'} />
                </button>
              </div>
            </div>
            <p className="l5-label lg5-task">
              {s.plan.task} · Step {s.step + 1} of {total}
              {paused ? ' · Paused' : ''}
            </p>
            {s.plan.safety === 'caution' && (
              <p className="lg5-caution">
                <b>Careful.</b> {s.plan.safetyNote ?? 'Take care with this one.'}
              </p>
            )}
            {doneNote && (
              <p className="lg5-done-note">
                <Tick size={16} /> {doneNote}
              </p>
            )}
            <ol className="lg5-steps">
              {s.plan.steps.map((st, i) => {
                const now = i === s.step;
                return (
                  <li key={st.id} className={i < s.step ? 'is-done' : now ? 'is-now' : 'is-later'} aria-current={now ? 'step' : undefined}>
                    <span className="lg5-num" aria-hidden="true">
                      {i < s.step ? <Tick size={15} /> : i + 1}
                    </span>
                    <div className="lg5-step-b">
                      {now ? (
                        <p className="lg5-say" aria-live="polite">
                          {step.said}
                        </p>
                      ) : (
                        <p className="lg5-say-sm">{st.say}</p>
                      )}
                      {i < s.step && lastLook?.done && lastLook.step === i && <p className="lg5-saw-sm">{lastLook.saw}</p>}
                      {now && (
                        <>
                          {missHint(step.tries) && <p className="lg5-hint">{missHint(step.tries)}</p>}
                          {lastLook && !lastLook.done && lastLook.step === i && (
                            <p className="lg5-saw">
                              <span className="l5-label">What I see</span>
                              {lastLook.saw}
                            </p>
                          )}
                          {adjusting && <p className="lg5-hint is-adjust">Drag a mark to where the thing really is.</p>}
                          {askConfirm && !adjusting && (
                            <p className="lg5-confirm">
                              Is the dashed loop the {askConfirm.label.toLowerCase()}?{' '}
                              <button type="button" className="l5-link is-go" onClick={() => setConfirmed((c) => ({ ...c, [askConfirm.id]: true }))}>
                                Yes
                              </button>
                              <span aria-hidden="true"> · </span>
                              <button type="button" className="l5-link" onClick={() => setAdjusting(true)}>
                                No — let me move it
                              </button>
                            </p>
                          )}
                          {how && (
                            <figure className={`lg5-how${how.lost ? ' is-lost' : ''}`}>
                              <div className="lg5-how-card">
                                <HowSketch model={how.model} motion={how.motion} />
                              </div>
                              {how.word && <figcaption>{how.word}</figcaption>}
                            </figure>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {(s.plan.uncertain || s.plan.confidence < 0.5) && (
              <p className="lg5-unsure">
                <span aria-hidden="true">?</span>
                {s.plan.uncertain ? `I’m not sure: ${s.plan.uncertain}` : 'This is my best reading — check it against what you see.'}
              </p>
            )}
            {s.error && <p className="lg5-note">{s.error}</p>}
            <div className="lg5-controls" role="toolbar" aria-label="Guidance">
              <button type="button" className="lg5-ctl" onClick={() => dispatch({ type: 'back' })} disabled={s.step === 0} aria-label="Previous step" title="Previous step">
                <Icon name="back" />
              </button>
              <button type="button" className="l5-btn is-primary lg5-done" onClick={() => void check(false)} disabled={busy || paused}>
                {s.phase === 'checking' ? 'Looking…' : 'I’ve done it'}
              </button>
              <button type="button" className="lg5-ctl" onClick={() => dispatch({ type: 'next' })} aria-label="Next step" title="Next step">
                <Icon name="next" />
              </button>
            </div>
            <p className="lg5-sr" aria-live="polite">
              {motionWords.join('. ')}
            </p>
          </div>
        ) : s.phase === 'done' && s.plan ? (
          <div className="lg5-gc lg5-finish">
            <div className="lg5-gc-h">
              <span className="lg5-sig">Socria</span>
            </div>
            <svg className="lg5-bigtick" viewBox="0 0 64 64" aria-hidden="true">
              <path pathLength={1} d={tickPath(10, 12, 44)} />
            </svg>
            <h2 className="lg5-h">That’s it — you did it.</h2>
            {lastLook?.done && <p className="lg5-saw-sm is-shown">{lastLook.saw}</p>}
            <ol className="lg5-steps is-all">
              {s.plan.steps.map((st) => (
                <li key={st.id} className="is-done">
                  <span className="lg5-num" aria-hidden="true">
                    <Tick size={15} />
                  </span>
                  <div className="lg5-step-b">
                    <p className="lg5-say-sm">{st.say}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="lg5-row">
              {onKeep && (
                <button type="button" className="l5-btn is-primary" onClick={() => onKeep(s.question, s.plan!)}>
                  Keep these steps
                </button>
              )}
              <button type="button" className="l5-link" onClick={() => dispatch({ type: 'replay' })}>
                Go through again
              </button>
              <button type="button" className="l5-link" onClick={() => dispatch({ type: 'restart' })}>
                Ask something else
              </button>
            </div>
          </div>
        ) : null}

        {(s.phase === 'idle' || s.phase === 'error' || s.phase === 'looking') && (
          <div className="lg5-askbox">
            <div className="lg5-gc-h">
              <span className="lg5-sig">Socria</span>
            </div>
            <h2 className="lg5-h lg5-ask-h">What do you want to do?</h2>
            <p className="lg5-p lg5-ask-p">Point the camera at it and ask. I’ll draw the how on the picture.</p>
            <form
              className="lg5-ask"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              {s.phase === 'error' && s.error && <p className="lg5-note">{s.error}</p>}
              <label className="lg5-sr" htmlFor="lg5-q">
                Ask about what the camera shows
              </label>
              <div className="lg5-field">
                <input id="lg5-q" className={`lg5-input${voice.available ? ' has-mic' : ''}`} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How do I open this jar?" disabled={s.phase === 'looking'} autoComplete="off" />
                {voice.available && (
                  <button
                    type="button"
                    className={`lg5-mic${voice.state === 'recording' ? ' is-on' : ''}`}
                    onPointerDown={() => voice.press()}
                    onPointerUp={() => voice.release()}
                    onPointerLeave={() => voice.state === 'recording' && voice.release()}
                    aria-label={voice.state === 'recording' ? 'Listening — let go to ask' : 'Hold to say your question'}
                    title="Hold to say it"
                  >
                    <Icon name="mic" />
                  </button>
                )}
                <button type="submit" className={`lg5-send${s.phase === 'looking' ? ' is-busy' : ''}`} disabled={!question.trim() || s.phase === 'looking'} aria-label={s.phase === 'looking' ? 'Looking…' : 'Show me'} title="Show me">
                  <Icon name="arrow" />
                </button>
              </div>
            </form>
            {s.phase !== 'looking' && (
              <div className="lg5-ideas" role="group" aria-label="Or start from one of these">
                {IDEAS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="lg5-idea"
                    onClick={() => {
                      setQuestion(q);
                      document.getElementById('lg5-q')?.focus();
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <ol className="lg5-howto" aria-label="How it works">
              <li>
                <span className="lg5-howto-n">1</span> Point the camera at the thing
              </li>
              <li>
                <span className="lg5-howto-n">2</span> Ask — or hold the mic and say it
              </li>
              <li>
                <span className="lg5-howto-n">3</span> Follow what Socria draws, a step at a time
              </li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ways in, for someone who is not sure what to ask. */
const IDEAS = ['How do I open this?', 'How does this work?', 'How do I fix this?'];

/** The numbers an emergency card offers to call: only those its own words name, never a guess. */
function callable(text?: string): string[] {
  return Array.from(new Set((text ?? '').match(/\b(999|112|911|000|111)\b/g) ?? []));
}

/** For a check's context in tests and the trace: what the step card asks Socria to look for. */
export function checkLine(s: Parameters<typeof checkContext>[0]): string {
  const c = checkContext(s);
  return c ? `${c.step}${c.done ? ` (done: ${c.done})` : ''}` : '';
}

export type { Overlay };
