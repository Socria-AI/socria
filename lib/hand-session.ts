// lib/hand-session.ts — ONE CAMERA AND ONE HAND MODEL, FOR ALL OF LOGOS 5.
//
// Hands are a way of using Logos 5, not a separate place: AR Mode moves the
// Logic Map with them (components/logos5/ARMode.tsx), and everywhere else
// they are a pointer (components/logos5/HandControl.tsx). Both read the same
// camera through this session, so going in and out of AR Mode neither asks
// for the camera again nor reloads the model, and there is exactly one thing
// to stop.
//
// THE CAMERA IS NEVER ON BY ITSELF. start() is called only from a person's
// own press (Start hand tracking, Use your hands, or saying so), and stop()
// releases the stream and closes the model at once. Each start is a session:
// a camera or a model that arrives after stop() — a permission answered late,
// a slow download — is released the moment it arrives instead of quietly
// turning the camera on behind the person.
//
// Frames are read in the browser and dropped; nothing is recorded or sent.

import { useSyncExternalStore } from 'react';
import { loadHandLandmarker, openCamera, type Landmarker, type Point } from './hand-tracking';
import { readHand, type HandRead } from './hand-gestures';
import { registerHandStop } from './hand-bus';

export type HandState = 'off' | 'asking' | 'loading' | 'on' | 'error' | 'unsupported';

export interface HandFrame {
  /** the hands seen, read as poses — MIRRORED, so x grows to the person's right as they see themselves; 0…1 of the frame */
  reads: HandRead[];
  /** the model's own landmarks, unmirrored, for drawing the skeleton over the (mirrored) picture */
  landmarks: Point[][];
  video: { w: number; h: number };
  /** performance.now() when the frame was read */
  t: number;
}

export interface HandSnapshot {
  state: HandState;
  /** why it is not on, in a sentence a person can act on; '' otherwise */
  message: string;
  /** the live camera stream while asking/loading/on, for anything that shows the picture */
  stream: MediaStream | null;
}

const OFF: HandSnapshot = { state: 'off', message: '', stream: null };

/** Can this browser run hand tracking at all? Asked before the camera is. */
export function handsSupported(): string | null {
  if (typeof window === 'undefined') return 'Hand tracking runs in a browser.';
  if (!window.isSecureContext) return 'Hand tracking needs a secure page (https).';
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser does not let pages use a camera.';
  if (typeof WebAssembly === 'undefined') return 'This browser cannot run the hand-tracking model (it needs WebAssembly).';
  return null;
}

class HandSession {
  private snap: HandSnapshot = OFF;
  private marker: Landmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private session = 0;
  private lastT = -1;
  private frameListeners = new Set<(f: HandFrame) => void>();
  private stateListeners = new Set<() => void>();
  /** tests only: frames are being fed in (inject), so the camera's own are not followed meanwhile */
  private injecting = false;

  getSnapshot = (): HandSnapshot => this.snap;
  getServerSnapshot = (): HandSnapshot => OFF;
  subscribe = (cb: () => void): (() => void) => {
    this.stateListeners.add(cb);
    return () => {
      this.stateListeners.delete(cb);
    };
  };

  /** Every frame the model reads, while the camera is on. */
  onFrame(cb: (f: HandFrame) => void): () => void {
    this.frameListeners.add(cb);
    return () => {
      this.frameListeners.delete(cb);
    };
  }

  get active(): boolean {
    return this.snap.state === 'asking' || this.snap.state === 'loading' || this.snap.state === 'on';
  }

  private set(next: Partial<HandSnapshot>) {
    this.snap = { ...this.snap, ...next };
    for (const l of this.stateListeners) l();
  }

  /**
   * The picture the model reads. Kept in the page and inside the viewport, if barely: a muted video
   * nobody can see may be paused by the browser to save power, and then the model reads nothing.
   */
  private ensureVideo(): HTMLVideoElement {
    if (this.video && this.video.isConnected) return this.video;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('aria-hidden', 'true');
    v.dataset.handSession = '';
    Object.assign(v.style, { position: 'fixed', right: '0', bottom: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none', zIndex: '0' });
    document.body.appendChild(v);
    this.video = v;
    return v;
  }

  async start(): Promise<void> {
    if (this.active) return;
    const why = handsSupported();
    if (why) {
      this.set({ state: 'unsupported', message: `${why} You can still use the mouse, a trackpad or touch.`, stream: null });
      return;
    }
    const my = ++this.session;
    const stale = () => this.session !== my;
    this.set({ state: 'asking', message: '', stream: null });
    let stream: MediaStream | null = null;
    try {
      // the camera first — the permission prompt is the person's to answer — then the model, which can take a moment
      stream = await openCamera();
      if (stale()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.set({ stream });
      const v = this.ensureVideo();
      v.srcObject = stream;
      await v.play().catch(() => {});
      if (stale()) return; // stop() has already released this stream
      this.set({ state: 'loading' });
      let marker: Landmarker;
      try {
        marker = await loadHandLandmarker(2);
      } catch {
        if (stale()) return;
        this.release();
        this.set({
          state: 'error',
          stream: null,
          message: 'Hand tracking could not load — it downloads a small model the first time. Check the connection and try again; the mouse and touch still work.',
        });
        return;
      }
      if (stale()) {
        marker.close();
        return;
      }
      this.marker = marker;
      this.lastT = -1;
      this.set({ state: 'on' });
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.loop);
    } catch (e) {
      if (stale()) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      this.release();
      this.set({ state: 'error', stream: null, message: `${e instanceof Error ? e.message : 'The camera could not start.'} The mouse and touch still work.` });
    }
  }

  /** Stop: the camera released, the model closed, every listener told there are no hands. */
  stop() {
    this.session += 1;
    this.release();
    const keep = this.snap.state === 'unsupported' || this.snap.state === 'error';
    this.set({ state: keep ? this.snap.state : 'off', stream: null, message: keep ? this.snap.message : '' });
  }

  /**
   * TESTS ONLY — exposed in development builds, never in production (see the foot of this file): feed a
   * frame as if the camera had seen it, so a browser test can put a hand exactly where it means to. While
   * frames are fed, the camera's own are not followed; null hands the hands back to the camera.
   */
  inject(frame: HandFrame | null) {
    this.injecting = !!frame;
    if (!frame) return;
    for (const l of this.frameListeners) {
      try {
        l(frame);
      } catch {}
    }
  }

  /** Forget a refusal or an error, so the next start asks again. */
  clear() {
    if (this.snap.state === 'error' || this.snap.state === 'unsupported') this.set(OFF);
  }

  private release() {
    // a session never started has no frame loop: Stop with nothing on is a no-op, wherever it is called from
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.snap.stream?.getTracks().forEach((t) => t.stop());
    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    this.marker?.close();
    this.marker = null;
    // whoever was following the hands hears that there are none, so nothing stays pressed
    const t = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const l of this.frameListeners) {
      try {
        l({ reads: [], landmarks: [], video: { w: 0, h: 0 }, t });
      } catch {}
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video;
    const mk = this.marker;
    if (!v || !mk || v.readyState < 2 || v.currentTime === this.lastT) return;
    this.lastT = v.currentTime;
    let res;
    try {
      res = mk.detectForVideo(v, performance.now());
    } catch {
      return; // a dropped frame is fine
    }
    if (this.injecting) return;
    const landmarks = res.landmarks ?? [];
    const reads = landmarks
      .slice(0, 2)
      .map((pts, i) =>
        readHand(
          pts.map((p) => ({ ...p, x: 1 - p.x })),
          (res.handedness?.[i]?.[0]?.categoryName?.toLowerCase() as 'left' | 'right' | undefined) ?? 'unknown'
        )
      )
      .filter((r): r is HandRead => !!r);
    const frame: HandFrame = { reads, landmarks, video: { w: v.videoWidth || 640, h: v.videoHeight || 480 }, t: performance.now() };
    for (const l of this.frameListeners) {
      try {
        l(frame);
      } catch {}
    }
  };
}

/** The one session. Constructing it touches nothing; the camera is asked for only by start(). */
export const handSession = new HandSession();
// Stop is reachable from the app without loading this file again (lib/hand-bus.ts): it never waits on a download
registerHandStop(() => handSession.stop());

// a development build lets a browser test reach the session (inject); a production build drops this line
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as unknown as { __socriaHands?: HandSession }).__socriaHands = handSession;
}

/** The session's state, for a component: re-renders when it starts, loads, stops or fails. */
export function useHandSession(): HandSnapshot {
  return useSyncExternalStore(handSession.subscribe, handSession.getSnapshot, handSession.getServerSnapshot);
}
