'use client';

// app/camera-test/page.tsx
//
// A test bench, not a feature: turn the camera on, track hands, draw each
// finger as a line over the picture. Nothing leaves the browser — the video
// is never uploaded; MediaPipe runs on this device.
//
// The library is loaded from jsDelivr at runtime rather than installed, so
// trying this out adds nothing to the app's bundle or dependencies. The hand
// model comes from Google's MediaPipe model bucket.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const MP_VERSION = '1.0.1';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// MediaPipe's 21 hand points: 0 is the wrist, then four per finger from the
// knuckle out. Each finger is drawn as one line from the wrist to its tip.
const FINGERS: { name: string; chain: number[]; color: string }[] = [
  { name: 'thumb', chain: [0, 1, 2, 3, 4], color: '#E0A93B' },
  { name: 'index', chain: [0, 5, 6, 7, 8], color: '#5E7633' },
  { name: 'middle', chain: [0, 9, 10, 11, 12], color: '#3F7CAC' },
  { name: 'ring', chain: [0, 13, 14, 15, 16], color: '#9B5DA8' },
  { name: 'pinky', chain: [0, 17, 18, 19, 20], color: '#D8402F' },
];
// Across the knuckles, so the hand reads as a hand and not five sticks.
const PALM = [5, 9, 13, 17];
const TIPS = [4, 8, 12, 16, 20];

type Point = { x: number; y: number; z: number };
type Landmarker = {
  detectForVideo: (v: HTMLVideoElement, t: number) => {
    landmarks: Point[][];
    handedness?: { categoryName: string; score: number }[][];
  };
  close: () => void;
};

type Status = 'idle' | 'loading' | 'running' | 'error';

export default function CameraTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<Landmarker | null>(null);
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hands, setHands] = useState<string[]>([]);
  const [fps, setFps] = useState(0);
  const [showVideo, setShowVideo] = useState(true);

  async function loadLandmarker(): Promise<Landmarker> {
    if (landmarkerRef.current) return landmarkerRef.current;
    // webpackIgnore: a URL import is resolved by the browser, not the bundler.
    const vision = await import(/* webpackIgnore: true */ `${MP_BASE}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    const make = (delegate: 'GPU' | 'CPU') =>
      vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    // GPU where the browser allows it; CPU otherwise, which is slower but works.
    let lm: Landmarker;
    try {
      lm = await make('GPU');
    } catch {
      lm = await make('CPU');
    }
    landmarkerRef.current = lm;
    return lm;
  }

  async function start() {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('The camera needs a secure page (https or localhost) and a browser that allows camera access.');
      return;
    }
    setStatus('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const lm = await loadLandmarker();
      setStatus('running');
      loop(lm);
    } catch (e: unknown) {
      stop();
      setStatus('error');
      const name = e instanceof DOMException ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in the address bar and try again.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : name === 'NotReadableError'
              ? 'The camera is in use by another app.'
              : `Could not start: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const c = canvasRef.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setHands([]);
    setFps(0);
    setStatus((s) => (s === 'error' ? s : 'idle'));
  }

  function loop(lm: Landmarker) {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let lastVideoTime = -1;
    let frames = 0;
    let since = performance.now();

    const tick = () => {
      if (!streamRef.current) return;
      if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      // Only a new frame is worth detecting on.
      if (video.currentTime !== lastVideoTime && video.videoWidth) {
        lastVideoTime = video.currentTime;
        const now = performance.now();
        const res = lm.detectForVideo(video, now);
        draw(ctx, canvas.width, canvas.height, res.landmarks);
        setHands(
          (res.handedness ?? []).map((h) => {
            const c = h[0];
            // The picture is mirrored, so MediaPipe's "Left" is the person's right.
            return c ? `${c.categoryName === 'Left' ? 'Right' : 'Left'} ${(c.score * 100).toFixed(0)}%` : '';
          })
        );
        frames++;
        if (now - since >= 1000) {
          setFps(Math.round((frames * 1000) / (now - since)));
          frames = 0;
          since = now;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, all: Point[][]) {
    ctx.clearRect(0, 0, w, h);
    const lw = Math.max(3, w / 220);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pts of all) {
      const at = (i: number) => ({ x: pts[i].x * w, y: pts[i].y * h });

      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      PALM.forEach((i, k) => {
        const p = at(i);
        if (k === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      for (const f of FINGERS) {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        f.chain.forEach((i, k) => {
          const p = at(i);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }

      for (let i = 0; i < pts.length; i++) {
        const p = at(i);
        const tip = TIPS.includes(i);
        ctx.fillStyle = tip ? '#fff' : 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, tip ? lw * 1.4 : lw * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
    },
    []
  );

  const running = status === 'running';

  return (
    <main className="ct-root">
      <header className="ct-head">
        <div>
          <p className="ct-eyebrow">Test bench</p>
          <h1 className="ct-title">Camera test</h1>
        </div>
        <Link href="/chat" className="ct-back">Back to Socria →</Link>
      </header>

      <div className="ct-stage">
        {/* Mirrored, like a mirror: move your right hand, the right side moves. */}
        <video ref={videoRef} className={`ct-video${showVideo ? '' : ' is-hidden'}`} playsInline muted />
        <canvas ref={canvasRef} className="ct-canvas" />
        {!running && (
          <div className="ct-overlay">
            {status === 'loading' ? (
              <p>Starting the camera and loading the hand model…</p>
            ) : status === 'error' ? (
              <p className="ct-err">{error}</p>
            ) : (
              <p>Nothing is recorded or sent anywhere. Tracking runs in this browser.</p>
            )}
          </div>
        )}
      </div>

      <div className="ct-bar">
        {running ? (
          <button type="button" className="ct-btn" onClick={stop}>Stop camera</button>
        ) : (
          <button type="button" className="ct-btn is-go" onClick={start} disabled={status === 'loading'}>
            {status === 'loading' ? 'Starting…' : 'Start camera'}
          </button>
        )}
        <label className="ct-check">
          <input type="checkbox" checked={showVideo} onChange={(e) => setShowVideo(e.target.checked)} />
          Show video
        </label>
        <span className="ct-stat" aria-live="polite">
          {running ? `${hands.length ? hands.join(' · ') : 'No hands'} · ${fps} fps` : ''}
        </span>
      </div>

      <ul className="ct-legend" aria-label="Finger colours">
        {FINGERS.map((f) => (
          <li key={f.name}>
            <span style={{ background: f.color }} aria-hidden="true" />
            {f.name}
          </li>
        ))}
      </ul>

      <style>{`
        body { background: #1b1c18; }
        .ct-root { min-height: 100dvh; background: #1b1c18; color: #f4f1e8; padding: 20px 16px 40px;
          font-family: var(--font-sans, system-ui, sans-serif); max-width: 1100px; margin: 0 auto; }
        .ct-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .ct-eyebrow { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .55; margin: 0; }
        .ct-title { font-family: var(--font-serif, Georgia, serif); font-style: italic; font-weight: 400; font-size: 34px; margin: 2px 0 0; }
        .ct-back { font-size: 13px; color: inherit; opacity: .7; text-decoration: none; white-space: nowrap; }
        .ct-back:hover { opacity: 1; }
        .ct-stage { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 14px; overflow: hidden; }
        .ct-video, .ct-canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
        .ct-video.is-hidden { opacity: 0; }
        .ct-overlay { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; font-size: 14px; opacity: .8; }
        .ct-err { color: #ff8a7a; }
        .ct-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 14px; }
        .ct-btn { height: 38px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(244,241,232,.3);
          background: transparent; color: inherit; font: inherit; font-size: 14px; cursor: pointer; }
        .ct-btn.is-go { background: #5E7633; border-color: #5E7633; color: #fff; }
        .ct-btn:disabled { opacity: .6; cursor: default; }
        .ct-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; opacity: .8; }
        .ct-stat { font-size: 13px; opacity: .7; font-variant-numeric: tabular-nums; }
        .ct-legend { display: flex; flex-wrap: wrap; gap: 14px; list-style: none; padding: 0; margin: 14px 0 0; font-size: 12px; opacity: .75; }
        .ct-legend li { display: inline-flex; align-items: center; gap: 6px; text-transform: capitalize; }
        .ct-legend span { width: 18px; height: 4px; border-radius: 2px; display: inline-block; }
      `}</style>
    </main>
  );
}
