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
import { leastSure, planAsSteps, UNSURE, type GuidePlan, type Overlay, type Pt } from '@/lib/guide/overlay';
import { hazardOf } from '@/lib/guide/safety';
import { placeAnchor, stepAnchors, toGray, trackSize, frameChange, type Anchor, type Gray } from '@/lib/guide/tracking';
import {
  IDLE,
  MOVED,
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
    if (!s.plan || !step || s.dismissed) return [];
    return placeOverlays({ plan: s.plan, step, anchors, moved: s.moved, fit, now, tracking });
  }, [s.plan, step, s.dismissed, anchors, s.moved, fit, now, tracking]);
  const fallbacks = placed.filter((p) => p.mode === 'fallback' && p.overlay.kind !== 'diagram' && p.why);
  // the movement to make, still shown when its object cannot be anchored: a small 2D figure in the step card
  const how = useMemo(() => {
    const lost = placed.filter((p) => p.mode === 'fallback' && (p.overlay.kind === 'motion' || p.overlay.kind === 'model'));
    if (!lost.length) return null;
    const model = lost.find((p) => p.overlay.kind === 'model');
    const moving = lost.find((p) => p.overlay.motion);
    const motion = moving?.overlay.motion;
    const obj = (moving ?? model)?.object;
    return { model: model?.overlay.model, motion, word: motion ? motionSay(motion, obj?.label) : obj ? `The ${obj.label.toLowerCase()}` : '' };
  }, [placed]);
  const diagram = step?.overlays.find((o) => o.kind === 'diagram');
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

  if (!open) return null;

  // ── early access: a preview, and the waitlist ──
  if (access === 'preview') {
    return (
      <div className="lg5" role="dialog" aria-modal="true" aria-label="Live guidance">
        <div className="lg5-sheet lg5-intro">
          <span className="l5-label">Live guidance · early access</span>
          <h2 className="lg5-h">Point your camera, ask, and Socria shows you how — on the picture.</h2>
          <p className="lg5-p">Arrows, highlights and the movement to make, drawn on the things in front of you, step by step. It is in early access with AR Mode.</p>
          <div className="lg5-row">
            <button type="button" className="l5-btn is-primary" onClick={joinWaitlist} disabled={join === 'sending' || join === 'done'}>
              {join === 'done' ? 'You are on the waitlist' : join === 'sending' ? 'Joining…' : 'Join the waitlist'}
            </button>
            <button type="button" className="l5-btn" onClick={onClose}>
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
          <span className="l5-label">Live guidance</span>
          <h2 className="lg5-h">Show Socria what you are doing, and it shows you how — on your camera.</h2>
          <ul className="lg5-list">
            <li>The camera is on only while this is open. Its picture stays on your screen.</li>
            <li>A small still frame is sent to Socria only when you ask, or when a step is checked — read, then discarded. Nothing is recorded or kept.</li>
            <li>The microphone is used only while you hold the mic button.</li>
            <li>When Socria is not sure what it sees, it says so — check it against what is in front of you.</li>
            <li>
              <b>Not for emergencies.</b> If someone is hurt or in danger, call your local emergency number first.
            </li>
          </ul>
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
            <button type="button" className="l5-btn" onClick={onClose}>
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
  return (
    <div className="lg5 is-live" role="dialog" aria-modal="true" aria-label="Live guidance">
      <div ref={stageRef} className="lg5-stage">
        <video ref={videoRef} className={`lg5-video${facing === 'user' ? ' is-mirror' : ''}`} playsInline muted aria-label="Your camera" />
        <svg className={`lg5-ov${adjusting ? ' is-adjusting' : ''}`} width="100%" height="100%" aria-hidden={!adjusting} key={s.replay}>
          <defs>
            <marker id="lg5-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {placed.map((p, i) => (p.mode === 'fallback' ? null : <OverlayEl key={i} p={p} paused={s.phase === 'paused'} adjusting={adjusting} onDown={onHandleDown} onMove={onHandleMove} onUp={onHandleUp} />))}
        </svg>
        <div className="lg5-top">
          <span className="lg5-live" aria-live="polite">
            <i aria-hidden="true" /> Camera on
          </span>
          {s.looks > 0 && <span className="lg5-looks">{s.looks === 1 ? '1 look' : `${s.looks} looks`}</span>}
          <span className="lg5-sp" />
          <button type="button" className="lg5-chip" onClick={() => {
            const next = facing === 'environment' ? 'user' : 'environment';
            setFacing(next);
            void startCamera(next);
          }} aria-label="Turn the camera round">
            Flip
          </button>
          <button type="button" className="lg5-chip" onClick={onClose} aria-label="Stop the camera and close Live guidance">
            Close
          </button>
        </div>
        {fallbacks.length > 0 && (
          <div className="lg5-edge" role="status">
            {[...new Set(fallbacks.map((f) => f.why))].map((w) => (
              <span key={w} className="lg5-edge-i">
                ↗ {w}
              </span>
            ))}
          </div>
        )}
        {!tracking && s.plan && <div className="lg5-edge is-quiet">Overlays stay where Socria last saw things — move the camera slowly.</div>}
      </div>

      <div className="lg5-sheet lg5-guide">
        {s.phase === 'safety' && s.plan ? (
          <div className="lg5-safety" role="alert">
            <span className="l5-label">{hazardOf(s.question).level === 'emergency' ? 'Get help now' : 'Not one to guide'}</span>
            {s.plan.escalate && <p className="lg5-escalate">{s.plan.escalate}</p>}
            {s.plan.first?.length ? (
              <ol className="lg5-first">
                {s.plan.first.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ol>
            ) : null}
            {s.plan.safetyNote && <p className="lg5-p">{s.plan.safetyNote}</p>}
            <div className="lg5-row">
              <button type="button" className="l5-btn" onClick={() => dispatch({ type: 'restart' })}>
                Ask something else
              </button>
            </div>
          </div>
        ) : s.plan && step && (s.phase === 'guiding' || s.phase === 'checking' || s.phase === 'paused') ? (
          <div className="lg5-step">
            {s.plan.safety === 'caution' && <p className="lg5-caution">⚠ {s.plan.safetyNote ?? 'Take care with this one.'}</p>}
            <div className="lg5-step-h">
              <span className="l5-label">
                Step {s.step + 1} of {s.plan.steps.length} · {s.plan.task}
              </span>
              {s.phase === 'paused' && <span className="lg5-paused">Paused</span>}
            </div>
            <p className="lg5-say" aria-live="polite">
              {step.said}
            </p>
            {missHint(step.tries) && <p className="lg5-hint">{missHint(step.tries)}</p>}
            {s.saw && <p className="lg5-saw">Socria saw: {s.saw}</p>}
            {(s.plan.uncertain || s.plan.confidence < 0.5) && (
              <p className="lg5-unsure">{s.plan.uncertain ? `I’m not sure: ${s.plan.uncertain}` : 'This is my best reading — check it against what you see.'}</p>
            )}
            {askConfirm && (
              <p className="lg5-confirm">
                Is the dashed box the {askConfirm.label.toLowerCase()}?{' '}
                <button type="button" className="l5-link" onClick={() => setConfirmed((c) => ({ ...c, [askConfirm.id]: true }))}>
                  Yes
                </button>{' '}
                ·{' '}
                <button type="button" className="l5-link" onClick={() => setAdjusting(true)}>
                  No — let me move it
                </button>
              </p>
            )}
            {how && (
              <figure className="lg5-how">
                <svg width="96" height="104" viewBox="0 0 96 104" aria-hidden="true">
                  {how.model ? (
                    <g transform="translate(5, 4)">
                      <ModelGlyph shape={how.model} motion={how.motion} />
                    </g>
                  ) : (
                    <g transform="translate(48, 52)" className="lg5-how-cue">
                      <MotionCue motion={how.motion ?? 'press'} r={30} />
                    </g>
                  )}
                </svg>
                {how.word && <figcaption>{how.word}</figcaption>}
              </figure>
            )}
            {diagram?.steps && (
              <ol className="lg5-diagram" aria-label="Steps at a glance">
                {diagram.steps.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ol>
            )}
            {s.error && <p className="lg5-note">{s.error}</p>}
            <div className="lg5-controls" role="toolbar" aria-label="Guidance">
              <button type="button" className="l5-btn is-sm" onClick={() => dispatch({ type: 'back' })} disabled={s.step === 0} aria-label="Previous step">
                ←
              </button>
              <button type="button" className="l5-btn is-sm" onClick={() => dispatch({ type: 'replay' })}>
                Replay
              </button>
              <button type="button" className="l5-btn is-sm" onClick={() => dispatch({ type: s.phase === 'paused' ? 'resume' : 'pause' })}>
                {s.phase === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className={`l5-btn is-sm${adjusting ? ' is-on' : ''}`} aria-pressed={adjusting} onClick={() => setAdjusting((v) => !v)}>
                Adjust
              </button>
              <button type="button" className="l5-btn is-sm" onClick={() => dispatch({ type: s.dismissed ? 'show' : 'dismiss' })}>
                {s.dismissed ? 'Show' : 'Hide'}
              </button>
              <span className="lg5-sp" />
              <button type="button" className="l5-btn is-sm is-primary" onClick={() => void check(false)} disabled={busy || s.phase === 'paused'}>
                {s.phase === 'checking' ? 'Looking…' : 'Done'}
              </button>
              <button type="button" className="l5-btn is-sm" onClick={() => dispatch({ type: 'next' })} aria-label="Next step">
                →
              </button>
            </div>
            <p className="lg5-sr" aria-live="polite">
              {placed
                .filter((p) => p.overlay.kind === 'motion' && p.overlay.motion)
                .map((p) => motionSay(p.overlay.motion!, p.object?.label))
                .join('. ')}
            </p>
          </div>
        ) : s.phase === 'done' && s.plan ? (
          <div className="lg5-step">
            <span className="l5-label">Done · {s.plan.task}</span>
            <p className="lg5-say">That’s it — you did it.</p>
            {s.saw && <p className="lg5-saw">Socria saw: {s.saw}</p>}
            <ol className="lg5-diagram">{planAsSteps(s.plan).map((t) => <li key={t}>{t.replace(/^\d+\.\s*/, '')}</li>)}</ol>
            <div className="lg5-row">
              {onKeep && (
                <button type="button" className="l5-btn is-primary" onClick={() => onKeep(s.question, s.plan!)}>
                  Keep these steps
                </button>
              )}
              <button type="button" className="l5-btn" onClick={() => dispatch({ type: 'replay' })}>
                Go through again
              </button>
              <button type="button" className="l5-btn" onClick={() => dispatch({ type: 'restart' })}>
                Ask something else
              </button>
            </div>
          </div>
        ) : null}

        {(s.phase === 'idle' || s.phase === 'error' || s.phase === 'looking') && (
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
            <input id="lg5-q" className="lg5-input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How do I open this jar?" disabled={s.phase === 'looking'} autoComplete="off" />
            {voice.available && (
              <button
                type="button"
                className={`lg5-mic${voice.state === 'recording' ? ' is-on' : ''}`}
                onPointerDown={() => voice.press()}
                onPointerUp={() => voice.release()}
                onPointerLeave={() => voice.state === 'recording' && voice.release()}
                aria-label={voice.state === 'recording' ? 'Listening — let go to ask' : 'Hold to say your question'}
              >
                {voice.state === 'recording' ? 'Listening…' : voice.state === 'transcribing' ? '…' : 'Hold to talk'}
              </button>
            )}
            <button type="submit" className="l5-btn is-primary" disabled={!question.trim() || s.phase === 'looking'}>
              {s.phase === 'looking' ? 'Looking…' : 'Show me'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** One overlay, drawn on its object. */
function OverlayEl({
  p,
  paused,
  adjusting,
  onDown,
  onMove,
  onUp,
}: {
  p: Placed;
  paused: boolean;
  adjusting: boolean;
  onDown: (e: RPointerEvent<SVGElement>, p: Placed) => void;
  onMove: (e: RPointerEvent<SVGElement>) => void;
  onUp: () => void;
}) {
  const b = p.box!;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const cls = `lg5-o is-${p.overlay.kind}${p.unsure ? ' is-unsure' : ''}${paused ? ' is-paused' : ''}`;
  const label = p.overlay.text ?? (p.object ? p.object.label : '');
  const unsureWord = p.unsure && p.object ? `I think this is the ${p.object.label.toLowerCase()}` : '';
  const handle = adjusting && p.object && p.mode === 'anchored' ? (
    <rect className="lg5-handle" x={b.x} y={b.y} width={b.w} height={b.h} rx={10} onPointerDown={(e) => onDown(e, p)} onPointerMove={onMove} onPointerUp={onUp} />
  ) : null;
  const chip = (text: string, x: number, y: number) => (
    <g className="lg5-chiptext" transform={`translate(${Math.max(8, x)}, ${Math.max(24, y)})`}>
      <text x={0} y={0}>
        {text}
      </text>
    </g>
  );
  switch (p.overlay.kind) {
    case 'highlight':
      return (
        <g className={cls}>
          <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} rx={12} />
          {(label || unsureWord) && chip(unsureWord || label, b.x, b.y - 10)}
          {handle}
        </g>
      );
    case 'label':
      return (
        <g className={cls}>
          <circle cx={cx} cy={cy} r={5} />
          <line x1={cx} y1={cy} x2={cx} y2={b.y - 18} />
          {chip(unsureWord || label, cx - 4, b.y - 24)}
          {handle}
        </g>
      );
    case 'arrow': {
      const to: Pt = p.to ?? { x: cx, y: cy };
      // from the target to its end; with no end, into the target from above and to the left
      const from: Pt = p.to ? { x: cx, y: cy } : { x: b.x - 70, y: b.y - 60 };
      return (
        <g className={cls}>
          <line className="lg5-arrow" x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#lg5-head)" />
          {label && chip(label, (from.x + to.x) / 2 + 8, (from.y + to.y) / 2 - 8)}
          {handle}
        </g>
      );
    }
    case 'motion':
      return (
        <g className={cls} transform={`translate(${cx}, ${cy})`}>
          <MotionCue motion={p.overlay.motion ?? 'press'} r={Math.max(28, Math.min(90, Math.min(b.w, b.h) / 2))} />
          {(label || unsureWord) && chip(unsureWord || label, -Math.min(b.w, 120) / 2, -Math.min(b.h, 160) / 2 - 12)}
          {handle && <g transform={`translate(${-cx}, ${-cy})`}>{handle}</g>}
        </g>
      );
    case 'model':
      return (
        <g className={cls} transform={`translate(${b.x + b.w + 16}, ${b.y})`}>
          <ModelGlyph shape={p.overlay.model ?? 'box'} motion={p.overlay.motion} />
          {handle && <g transform={`translate(${-(b.x + b.w + 16)}, ${-b.y})`}>{handle}</g>}
        </g>
      );
    default:
      return null;
  }
}

/** The movement to make, as a small animation centred on the object. */
function MotionCue({ motion, r }: { motion: string; r: number }) {
  if (motion === 'twist-ccw' || motion === 'twist-cw') {
    const cw = motion === 'twist-cw';
    // three quarters of a circle, its head showing the way round
    const d = `M ${r} 0 A ${r} ${r} 0 1 ${cw ? 1 : 0} 0 ${cw ? r : -r}`;
    return (
      <g className={`lg5-spin${cw ? ' is-cw' : ' is-ccw'}`}>
        <path d={d} markerEnd="url(#lg5-head)" />
      </g>
    );
  }
  const dirs: Record<string, [number, number]> = { push: [0, 0], pull: [0, 0], lift: [0, -1], lower: [0, 1], 'slide-left': [-1, 0], 'slide-right': [1, 0], 'slide-up': [0, -1], 'slide-down': [0, 1] };
  if (motion in dirs && motion !== 'push' && motion !== 'pull') {
    const [dx, dy] = dirs[motion];
    return (
      <g className="lg5-slide" style={{ ['--dx' as string]: `${dx * r * 0.6}px`, ['--dy' as string]: `${dy * r * 0.6}px` }}>
        <line x1={-dx * r * 0.6} y1={-dy * r * 0.6} x2={dx * r} y2={dy * r} markerEnd="url(#lg5-head)" />
      </g>
    );
  }
  if (motion === 'push' || motion === 'pull') {
    return (
      <g className={`lg5-depth is-${motion}`}>
        <circle r={r * 0.55} />
        <circle r={r * 0.25} />
      </g>
    );
  }
  if (motion === 'squeeze') {
    return (
      <g className="lg5-squeeze">
        <line x1={-r} y1={0} x2={-r * 0.3} y2={0} markerEnd="url(#lg5-head)" />
        <line x1={r} y1={0} x2={r * 0.3} y2={0} markerEnd="url(#lg5-head)" />
      </g>
    );
  }
  if (motion === 'tilt' || motion === 'shake') {
    return (
      <g className={`lg5-wobble is-${motion}`}>
        <path d={`M ${-r} ${-r * 0.2} Q 0 ${-r * 0.6} ${r} ${-r * 0.2}`} markerEnd="url(#lg5-head)" />
      </g>
    );
  }
  // press, tap: a ring that pulses where to press
  return (
    <g className="lg5-pulse">
      <circle r={r * 0.35} />
      <circle className="lg5-pulse-ring" r={r * 0.35} />
    </g>
  );
}

/** A simple model of the thing, drawn beside it, turning the way it should go. */
function ModelGlyph({ shape, motion }: { shape: string; motion?: string }) {
  const turn = motion === 'twist-ccw' ? ' is-ccw' : motion === 'twist-cw' ? ' is-cw' : '';
  return (
    <g className={`lg5-model is-${shape}`}>
      <rect className="lg5-model-card" x={0} y={0} width={86} height={96} rx={10} />
      <g transform="translate(43, 52)">
        {shape === 'jar' || shape === 'bottle' ? (
          <>
            <path d="M -22 -14 L -22 26 Q 0 36 22 26 L 22 -14" />
            <ellipse cx={0} cy={-14} rx={22} ry={7} />
            <g className={`lg5-model-lid${turn}`}>
              <rect x={-24} y={shape === 'bottle' ? -34 : -28} width={48} height={shape === 'bottle' ? 10 : 12} rx={3} />
            </g>
          </>
        ) : shape === 'screw' || shape === 'knob' ? (
          <g className={`lg5-model-lid${turn}`}>
            <circle r={20} />
            <line x1={-12} y1={0} x2={12} y2={0} />
            {shape === 'screw' && <line x1={0} y1={-12} x2={0} y2={12} />}
          </g>
        ) : shape === 'lever' || shape === 'latch' || shape === 'hinge' ? (
          <>
            <rect x={-26} y={8} width={52} height={10} rx={3} />
            <g className="lg5-model-lever">
              <rect x={-4} y={-26} width={8} height={36} rx={3} />
            </g>
          </>
        ) : shape === 'plug' || shape === 'cable' ? (
          <>
            <rect x={-14} y={-18} width={28} height={24} rx={4} />
            <line x1={-6} y1={-26} x2={-6} y2={-18} />
            <line x1={6} y1={-26} x2={6} y2={-18} />
            <path d="M 0 6 Q 0 24 18 26" />
          </>
        ) : (
          <>
            <path d="M -22 -10 L 0 -22 L 22 -10 L 22 16 L 0 28 L -22 16 Z" />
            <path d="M -22 -10 L 0 2 L 22 -10 M 0 2 L 0 28" />
          </>
        )}
      </g>
    </g>
  );
}

/** For a check's context in tests and the trace: what the step card asks Socria to look for. */
export function checkLine(s: Parameters<typeof checkContext>[0]): string {
  const c = checkContext(s);
  return c ? `${c.step}${c.done ? ` (done: ${c.done})` : ''}` : '';
}

export type { Overlay };

