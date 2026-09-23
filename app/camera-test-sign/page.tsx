'use client';

// app/camera-test-sign/page.tsx
//
// A test bench: fingerspell to the camera in ASL and read it back as plain
// English. Hold a letter still to write it; drop your hand out of the picture
// to end a word. Everything runs in this browser — nothing is recorded or sent.
//
// What it reads is set out in lib/asl-fingerspell.ts: the static letters of
// the ASL alphabet and the "I love you" handshape. It spells; it does not
// translate signed words, which are movements.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  EMPTY_SPELLER,
  HOLD_MS,
  asEnglish,
  features,
  score,
  step,
  type Reading,
  type SpellerState,
} from '@/lib/asl-fingerspell';
import { drawHands, loadHandLandmarker, openCamera, type Landmarker } from '@/lib/hand-tracking';

type Status = 'idle' | 'loading' | 'running' | 'error';

/** How each supported shape is made, for whoever is testing. */
const GUIDE: [string, string][] = [
  ['A', 'fist, thumb up along the side'],
  ['B', 'flat hand, fingers together, thumb across the palm'],
  ['C', 'curved hand, like holding a cup'],
  ['D', 'index up, other fingertips touching the thumb'],
  ['E', 'fingertips bent down onto the tucked thumb'],
  ['F', 'index and thumb in a circle, three fingers up'],
  ['G', 'index pointing sideways, thumb parallel'],
  ['H', 'index and middle together, pointing sideways'],
  ['I', 'pinky up, thumb across the fist'],
  ['K', 'index and middle up in a V, thumb between them'],
  ['L', 'index up, thumb out: an L'],
  ['O', 'all fingertips meet the thumb: an O'],
  ['P', 'K, pointed down'],
  ['Q', 'G, pointed down'],
  ['R', 'index and middle crossed'],
  ['S', 'fist, thumb across the front'],
  ['U', 'index and middle up, together'],
  ['V', 'index and middle up, apart'],
  ['W', 'index, middle and ring up'],
  ['X', 'index hooked, others in a fist'],
  ['Y', 'thumb and pinky out'],
  ['I love you', 'thumb, index and pinky out'],
];

export default function CameraTestSignPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<Landmarker | null>(null);
  const rafRef = useRef(0);
  const spellRef = useRef<SpellerState>(EMPTY_SPELLER);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Reading | null>(null);
  const [top, setTop] = useState<Reading[]>([]);
  const [hold, setHold] = useState(0);
  const [text, setText] = useState('');
  const [fps, setFps] = useState(0);
  const [showVideo, setShowVideo] = useState(true);
  const [copied, setCopied] = useState(false);

  async function start() {
    setError(null);
    setStatus('loading');
    try {
      const stream = await openCamera();
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      // One hand: fingerspelling is one-handed, and it halves the work.
      landmarkerRef.current ??= await loadHandLandmarker(1);
      setStatus('running');
      loop(landmarkerRef.current);
    } catch (e) {
      stop();
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const c = canvasRef.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setLive(null);
    setTop([]);
    setHold(0);
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
    let lastPaint = 0;

    const tick = () => {
      if (!streamRef.current) return;
      if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      if (video.currentTime !== lastVideoTime && video.videoWidth) {
        lastVideoTime = video.currentTime;
        const now = performance.now();
        const res = lm.detectForVideo(video, now);
        drawHands(ctx, canvas.width, canvas.height, res.landmarks);

        const image = res.landmarks[0];
        const world = res.worldLandmarks?.[0] ?? image;
        let ranked: Reading[] = [];
        if (image && world) ranked = score(features(world, image, video.videoWidth / video.videoHeight));
        const best = ranked[0] && ranked[0].score >= 0.5 ? ranked[0] : null;
        const sp = step(spellRef.current, best, now, !!image);
        spellRef.current = sp;

        // React is told about ~15 times a second; the drawing is every frame.
        if (now - lastPaint > 66) {
          lastPaint = now;
          setLive(best);
          setTop(ranked.slice(0, 3));
          setText(sp.text);
          setHold(
            sp.holding && sp.holding === sp.written ? 1 : sp.holding ? Math.min(1, (now - sp.since) / HOLD_MS) : 0
          );
        }
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

  function edit(next: string) {
    spellRef.current = { ...spellRef.current, text: next };
    setText(next);
  }
  const space = () => edit(text.endsWith(' ') || !text ? text : text + ' ');
  const backspace = () => {
    const t = text.replace(/ +$/, '');
    edit(t.endsWith('I love you') ? t.slice(0, -'I love you'.length) : t.slice(0, -1));
  };
  const clear = () => edit('');
  const english = asEnglish(text);
  async function copy() {
    try {
      await navigator.clipboard.writeText(english);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  function speak() {
    if (!english || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(english));
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
    <main className="cs-root">
      <header className="cs-head">
        <div>
          <p className="cs-eyebrow">Test bench</p>
          <h1 className="cs-title">Sign to text</h1>
          <p className="cs-sub">
            Fingerspell in ASL. Hold a letter still to write it; take your hand out of the picture to end the word.
          </p>
        </div>
        <nav className="cs-nav">
          <Link href="/camera-test">Hand tracking test</Link>
          <Link href="/chat">Back to Socria →</Link>
        </nav>
      </header>

      <div className="cs-grid">
        <section>
          <div className="cs-stage">
            <video ref={videoRef} className={`cs-video${showVideo ? '' : ' is-hidden'}`} playsInline muted />
            <canvas ref={canvasRef} className="cs-canvas" />
            {running && (
              <div className="cs-live" aria-live="polite">
                <span className={`cs-letter${live ? '' : ' is-none'}`}>{live ? live.label : '·'}</span>
                <span className="cs-hold" style={{ ['--p' as string]: hold }} aria-hidden="true" />
                {live && <span className="cs-conf">{Math.round(live.score * 100)}%</span>}
              </div>
            )}
            {!running && (
              <div className="cs-overlay">
                {status === 'loading' ? (
                  <p>Starting the camera and loading the hand model…</p>
                ) : status === 'error' ? (
                  <p className="cs-err">{error}</p>
                ) : (
                  <p>Nothing is recorded or sent anywhere. Everything runs in this browser.</p>
                )}
              </div>
            )}
          </div>

          <div className="cs-bar">
            {running ? (
              <button type="button" className="cs-btn" onClick={stop}>Stop camera</button>
            ) : (
              <button type="button" className="cs-btn is-go" onClick={start} disabled={status === 'loading'}>
                {status === 'loading' ? 'Starting…' : 'Start camera'}
              </button>
            )}
            <label className="cs-check">
              <input type="checkbox" checked={showVideo} onChange={(e) => setShowVideo(e.target.checked)} />
              Show video
            </label>
            {running && (
              <span className="cs-stat">
                {top.length ? top.map((r) => `${r.label} ${Math.round(r.score * 100)}`).join(' · ') : 'No hand'} · {fps} fps
              </span>
            )}
          </div>

          <div className="cs-out">
            <p className="cs-label">In English</p>
            <p className={`cs-english${english ? '' : ' is-empty'}`}>{english || 'Your words will appear here.'}</p>
            <p className="cs-raw" aria-label="Letters as signed">{text || ' '}</p>
            <div className="cs-tools">
              <button type="button" className="cs-btn" onClick={space}>Space</button>
              <button type="button" className="cs-btn" onClick={backspace} disabled={!text}>Delete</button>
              <button type="button" className="cs-btn" onClick={clear} disabled={!text}>Clear</button>
              <button type="button" className="cs-btn" onClick={copy} disabled={!english}>{copied ? 'Copied' : 'Copy'}</button>
              <button type="button" className="cs-btn" onClick={speak} disabled={!english}>Read aloud</button>
            </div>
          </div>
        </section>

        <aside className="cs-guide">
          <p className="cs-label">What it reads</p>
          <ul>
            {GUIDE.map(([l, how]) => (
              <li key={l} className={live?.label === l ? 'is-on' : undefined}>
                <b>{l}</b>
                <span>{how}</span>
              </li>
            ))}
          </ul>
          <p className="cs-note">
            Not yet: J and Z (they are traced in the air), and M, N and T (the thumb hides under the fingers).
            It spells words letter by letter; signed words, which are movements, need a model trained on video.
            Face the camera with your palm toward it, in good light.
          </p>
        </aside>
      </div>

      {/* Raw, not children: React escapes the quotes in `content: ''` on the
          server and not in the browser, and the page fails to hydrate. */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </main>
  );
}

const CSS = `
        body { background: #1b1c18; }
        .cs-root { min-height: 100dvh; background: #1b1c18; color: #f4f1e8; padding: 20px 16px 48px;
          font-family: var(--font-sans, system-ui, sans-serif); max-width: 1200px; margin: 0 auto; }
        .cs-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
        .cs-eyebrow, .cs-label { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .55; margin: 0; }
        .cs-title { font-family: var(--font-serif, Georgia, serif); font-style: italic; font-weight: 400; font-size: 34px; margin: 2px 0 4px; }
        .cs-sub { margin: 0; font-size: 14px; opacity: .7; max-width: 60ch; }
        .cs-nav { display: flex; gap: 16px; font-size: 13px; }
        .cs-nav a { color: inherit; opacity: .7; text-decoration: none; white-space: nowrap; }
        .cs-nav a:hover { opacity: 1; }
        .cs-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
        @media (max-width: 900px) { .cs-grid { grid-template-columns: minmax(0, 1fr); } }
        .cs-stage { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 14px; overflow: hidden; }
        .cs-video, .cs-canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
        .cs-video.is-hidden { opacity: 0; }
        .cs-overlay { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; font-size: 14px; opacity: .8; }
        .cs-err { color: #ff8a7a; }
        .cs-live { position: absolute; top: 14px; left: 14px; display: flex; align-items: center; gap: 10px;
          background: rgba(20,21,18,.72); border-radius: 14px; padding: 8px 14px 8px 12px; backdrop-filter: blur(6px); }
        .cs-letter { font-family: var(--font-serif, Georgia, serif); font-size: 44px; line-height: 1; min-width: 36px; text-align: center; }
        .cs-letter.is-none { opacity: .35; }
        .cs-hold { width: 64px; height: 6px; border-radius: 3px; background: rgba(244,241,232,.18); position: relative; overflow: hidden; }
        .cs-hold::after { content: ''; position: absolute; inset: 0; transform-origin: left; transform: scaleX(var(--p, 0)); background: #9DBB5F; transition: transform 60ms linear; }
        .cs-conf { font-size: 12px; opacity: .7; font-variant-numeric: tabular-nums; }
        .cs-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 14px; }
        .cs-btn { height: 36px; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(244,241,232,.3);
          background: transparent; color: inherit; font: inherit; font-size: 13.5px; cursor: pointer; }
        .cs-btn:hover:not(:disabled) { border-color: rgba(244,241,232,.6); }
        .cs-btn.is-go { background: #5E7633; border-color: #5E7633; color: #fff; }
        .cs-btn:disabled { opacity: .45; cursor: default; }
        .cs-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; opacity: .8; }
        .cs-stat { font-size: 12.5px; opacity: .65; font-variant-numeric: tabular-nums; }
        .cs-out { margin-top: 18px; padding: 18px 20px; border-radius: 14px; background: rgba(244,241,232,.06); border: 1px solid rgba(244,241,232,.12); }
        .cs-english { font-family: var(--font-serif, Georgia, serif); font-size: 30px; line-height: 1.25; margin: 6px 0 4px; min-height: 38px; word-break: break-word; }
        .cs-english.is-empty { opacity: .35; font-style: italic; font-size: 22px; }
        .cs-raw { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; opacity: .5; margin: 0 0 12px; white-space: pre-wrap; }
        .cs-tools { display: flex; flex-wrap: wrap; gap: 8px; }
        .cs-guide { background: rgba(244,241,232,.04); border: 1px solid rgba(244,241,232,.1); border-radius: 14px; padding: 16px; }
        .cs-guide ul { list-style: none; margin: 10px 0 12px; padding: 0; display: grid; gap: 2px; }
        .cs-guide li { display: grid; grid-template-columns: 76px 1fr; gap: 8px; font-size: 12.5px; padding: 4px 6px; border-radius: 6px; }
        .cs-guide li b { font-family: var(--font-serif, Georgia, serif); font-weight: 400; font-size: 15px; }
        .cs-guide li span { opacity: .7; }
        .cs-guide li.is-on { background: rgba(157,187,95,.18); }
        .cs-note { font-size: 12px; line-height: 1.5; opacity: .6; margin: 0; }
      `;
