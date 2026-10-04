'use client';
// app/mind-ar/MindAR.tsx
//
// The Mind Graph, floating in the room. A test bench in the spirit of
// /logos2-test: the camera is the background, the graph hangs in front of it
// in three dimensions, and you move through it — pinch or scroll to zoom,
// drag to orbit, tilt the phone to look around it, tap a node to fly in, or
// pinch in the air with your hands.
//
// NOTHING LEAVES THE DEVICE. The video is drawn behind the graph and never
// recorded or uploaded; hand tracking runs MediaPipe in the browser, loaded
// from jsDelivr at runtime so the app gains no dependency for a bench.
//
// The geometry — layout, projection, picking, zoom — is lib/mind/ar.ts, pure
// and tested. This file is input and drawing.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  layout3d,
  project,
  pick,
  pinchZoom,
  clampDist,
  easeCamera,
  SAMPLE_GRAPH,
  type ArCamera,
  type ArEdge,
  type ArNode,
  type Positions3,
} from '@/lib/mind/ar';

const MP_VERSION = '1.0.1';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** At most this many nodes in the room: the most important ones. */
const CAP = 240;

const HOME: ArCamera = { pivot: { x: 0, y: 0, z: 0 }, yaw: 0.5, pitch: -0.25, dist: 2.6 };

/** The colour a node carries, by what kind of thing it is. */
function tone(type: string): string {
  const t = type.toLowerCase();
  if (t === 'person' || t === 'self') return '#9fbf5f';
  if (/goal|decision|project|plan|milestone/.test(t)) return '#7da447';
  if (/tension|contradiction|conflict|counter|misconception|error/.test(t)) return '#e07a52';
  if (/evidence|source|fact|observation/.test(t)) return '#6ea0d8';
  if (/belief|claim|assumption|hypothesis|question/.test(t)) return '#e8b62c';
  if (/value|principle|identity/.test(t)) return '#b38fd0';
  if (/pattern|preference|habit|style/.test(t)) return '#55b7a8';
  return '#cdd5b8';
}

type Point = { x: number; y: number; z: number };
type Landmarker = {
  detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Point[][] };
  close: () => void;
};

export function MindAR() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<ArCamera>({ ...HOME, pivot: { ...HOME.pivot } });
  const targetRef = useRef<Partial<ArCamera> | null>(null);
  const posRef = useRef<Positions3>({});
  const graphRef = useRef<{ nodes: ArNode[]; edges: ArEdge[] }>({ nodes: [], edges: [] });
  const selectedRef = useRef<string | null>(null);
  const gyroRef = useRef<{ base: { a: number; b: number } | null; yaw: number; pitch: number }>({ base: null, yaw: 0, pitch: 0 });
  const handsRef = useRef<{ lm: Landmarker | null; last: number; tips: { x: number; y: number; pinch: boolean }[]; prev: { one?: { x: number; y: number }; two?: number } }>({
    lm: null,
    last: -1,
    tips: [],
    prev: {},
  });
  const facingRef = useRef<'environment' | 'user'>('environment');

  const [source, setSource] = useState<'loading' | 'yours' | 'sample'>('loading');
  const [why, setWhy] = useState('');
  const [count, setCount] = useState({ nodes: 0, edges: 0, shown: 0 });
  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [gyroOn, setGyroOn] = useState(false);
  const [handsOn, setHandsOn] = useState<'off' | 'loading' | 'on'>('off');
  const [selected, setSelected] = useState<ArNode | null>(null);
  const [note, setNote] = useState('');

  // ── the graph ─────────────────────────────────────────────────────
  const adopt = useCallback((nodes: ArNode[], edges: ArEdge[]) => {
    const kept = [...nodes].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)).slice(0, CAP);
    const ids = new Set(kept.map((n) => n.id));
    const e = edges.filter((x) => ids.has(x.sourceId) && ids.has(x.targetId));
    graphRef.current = { nodes: kept, edges: e };
    posRef.current = layout3d(kept, e, kept.length > 120 ? 80 : 160);
    setCount({ nodes: nodes.length, edges: e.length, shown: kept.length });
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch('/api/mind', { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status === 401 ? 'signed-out' : 'unavailable');
        const j = await r.json();
        const nodes: ArNode[] = (j.nodes ?? []).map((n: Record<string, unknown>) => ({
          id: String(n.id),
          type: String(n.type ?? 'concept'),
          label: String(n.label ?? ''),
          content: typeof n.content === 'string' ? n.content : '',
          importance: typeof n.importance === 'number' ? n.importance : 0.5,
        }));
        const edges: ArEdge[] = (j.edges ?? []).map((e: Record<string, unknown>) => ({
          sourceId: String(e.sourceId),
          targetId: String(e.targetId),
          relationship: String(e.relationship ?? ''),
        }));
        if (dead) return;
        if (!nodes.length) throw new Error('empty');
        adopt(nodes, edges);
        setSource('yours');
      } catch (e) {
        if (dead) return;
        const m = (e as Error).message;
        setWhy(
          m === 'signed-out'
            ? 'Sign in on this deployment to walk through your own.'
            : m === 'empty'
              ? 'Nothing is remembered yet — talk to Core 4 and come back.'
              : 'Memory is not reachable here just now.'
        );
        adopt(SAMPLE_GRAPH.nodes, SAMPLE_GRAPH.edges);
        setSource('sample');
      }
    })();
    return () => {
      dead = true;
    };
  }, [adopt]);

  // ── flying ────────────────────────────────────────────────────────
  const flyTo = useCallback((id: string | null) => {
    selectedRef.current = id;
    if (!id) {
      setSelected(null);
      targetRef.current = { pivot: { x: 0, y: 0, z: 0 }, dist: HOME.dist };
      return;
    }
    const p = posRef.current[id];
    const n = graphRef.current.nodes.find((x) => x.id === id) ?? null;
    setSelected(n);
    if (p) targetRef.current = { pivot: { ...p }, dist: 0.75 };
  }, []);

  const zoomBy = useCallback((f: number) => {
    const cam = camRef.current;
    targetRef.current = { ...(targetRef.current ?? {}), dist: clampDist(cam.dist * f) };
  }, []);

  // ── the camera feed ───────────────────────────────────────────────
  const startCamera = useCallback(async (want: 'environment' | 'user') => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setNote('The camera needs a secure (https) page and a browser that allows it.');
      return;
    }
    try {
      const old = videoRef.current?.srcObject as MediaStream | null;
      old?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: want }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      const actual = (stream.getVideoTracks()[0]?.getSettings().facingMode as string | undefined) ?? want;
      const f = actual === 'user' ? 'user' : want === 'user' ? 'user' : 'environment';
      facingRef.current = f;
      setFacing(f);
      setCameraOn(true);
      setNote('');
    } catch {
      setNote('The camera was not allowed. The graph still works without it.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    const s = videoRef.current?.srcObject as MediaStream | null;
    s?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setHandsOn('off');
    handsRef.current.lm?.close();
    handsRef.current.lm = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── looking around: the phone's orientation turns the view ────────
  useEffect(() => {
    if (!gyroOn) return;
    const g = gyroRef.current;
    g.base = null;
    const on = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null) return;
      if (!g.base) g.base = { a: e.alpha, b: e.beta };
      let da = e.alpha - g.base.a;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      g.yaw = (-da * Math.PI) / 180;
      g.pitch = Math.max(-1.2, Math.min(1.2, ((e.beta - g.base.b) * Math.PI) / 180));
    };
    window.addEventListener('deviceorientation', on);
    return () => {
      window.removeEventListener('deviceorientation', on);
      g.yaw = 0;
      g.pitch = 0;
    };
  }, [gyroOn]);

  const toggleGyro = useCallback(async () => {
    if (gyroOn) {
      setGyroOn(false);
      return;
    }
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceOrientationEvent;
    try {
      if (D?.requestPermission) {
        const r = await D.requestPermission();
        if (r !== 'granted') {
          setNote('Motion was not allowed, so tilting will not turn the view.');
          return;
        }
      }
      if (!('DeviceOrientationEvent' in window)) {
        setNote('This device does not report its orientation.');
        return;
      }
      setGyroOn(true);
      setNote('Tilt and turn the phone to look around the graph.');
    } catch {
      setNote('Motion is not available here.');
    }
  }, [gyroOn]);

  // ── hands: pinch in the air ───────────────────────────────────────
  const toggleHands = useCallback(async () => {
    if (handsOn !== 'off') {
      handsRef.current.lm?.close();
      handsRef.current.lm = null;
      handsRef.current.tips = [];
      setHandsOn('off');
      return;
    }
    if (!cameraOn) await startCamera('user');
    setHandsOn('loading');
    try {
      const vision = await import(/* webpackIgnore: true */ `${MP_BASE}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const make = (delegate: 'GPU' | 'CPU') =>
        vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      handsRef.current.lm = await make('GPU').catch(() => make('CPU'));
      setHandsOn('on');
      setNote('Pinch and move one hand to turn it. Pinch with both hands and pull apart to zoom.');
    } catch {
      setHandsOn('off');
      setNote('Hand tracking could not load here.');
    }
  }, [handsOn, cameraOn, startCamera]);

  // ── touch, mouse and wheel ────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch0 = 0;
    const down = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX;
      p.y = e.clientY;
      const cam = camRef.current;
      if (pts.size === 1) {
        cam.yaw += dx * 0.006;
        cam.pitch = Math.max(-1.4, Math.min(1.4, cam.pitch + dy * 0.006));
        if (targetRef.current) {
          delete targetRef.current.yaw;
          delete targetRef.current.pitch;
        }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) cam.dist = pinchZoom(cam.dist, pinch0, d);
        pinch0 = d;
        if (targetRef.current) delete targetRef.current.dist;
      }
    };
    const up = (e: PointerEvent) => {
      const wasOne = pts.size === 1;
      pts.delete(e.pointerId);
      if (wasOne && moved < 8) {
        const r = cv.getBoundingClientRect();
        const id = pick(posRef.current, viewCam(), r.width, r.height, e.clientX - r.left, e.clientY - r.top, 30);
        flyTo(id);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camRef.current;
      cam.dist = clampDist(cam.dist * Math.exp(e.deltaY * 0.0015));
      if (targetRef.current) delete targetRef.current.dist;
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      cv.removeEventListener('wheel', wheel);
    };
  }, [flyTo]);

  /** The camera as drawn: the orbit, turned by the phone's tilt. */
  function viewCam(): ArCamera {
    const c = camRef.current;
    const g = gyroRef.current;
    return { ...c, yaw: c.yaw + g.yaw, pitch: Math.max(-1.5, Math.min(1.5, c.pitch + g.pitch)) };
  }

  // ── the frame ─────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = canvasRef.current;
      if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Ease toward wherever a tap or a button asked to go.
      if (targetRef.current) {
        camRef.current = easeCamera(camRef.current, targetRef.current, 0.12);
        const t = targetRef.current;
        const c = camRef.current;
        const near =
          (t.dist === undefined || Math.abs(c.dist - t.dist) < 0.002) &&
          (!t.pivot || Math.hypot(c.pivot.x - t.pivot.x, c.pivot.y - t.pivot.y, c.pivot.z - t.pivot.z) < 0.002);
        if (near) targetRef.current = null;
      } else if (!selectedRef.current) {
        camRef.current.yaw += 0.0009; // a slow drift, so the depth reads
      }

      // Hands, at the video's own pace.
      const v = videoRef.current;
      const hs = handsRef.current;
      if (hs.lm && v && v.readyState >= 2 && v.currentTime !== hs.last) {
        hs.last = v.currentTime;
        try {
          const res = hs.lm.detectForVideo(v, performance.now());
          hs.tips = [];
          const mirror = facingRef.current === 'user';
          // the video is drawn object-fit: cover — map its coordinates the same way
          const vw = v.videoWidth || 1;
          const vh = v.videoHeight || 1;
          const s = Math.max(W / vw, H / vh);
          const ox = (W - vw * s) / 2;
          const oy = (H - vh * s) / 2;
          const toScreen = (p: Point) => ({ x: ox + (mirror ? 1 - p.x : p.x) * vw * s, y: oy + p.y * vh * s });
          const pinches: { x: number; y: number }[] = [];
          for (const hand of res.landmarks ?? []) {
            const t = hand[4];
            const i = hand[8];
            const span = Math.hypot(hand[5].x - hand[17].x, hand[5].y - hand[17].y) || 0.1;
            const pinching = Math.hypot(t.x - i.x, t.y - i.y) < span * 0.45;
            const a = toScreen(t);
            const b = toScreen(i);
            hs.tips.push({ x: a.x, y: a.y, pinch: pinching }, { x: b.x, y: b.y, pinch: pinching });
            if (pinching) pinches.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          }
          const cam = camRef.current;
          if (pinches.length === 2) {
            const d = Math.hypot(pinches[0].x - pinches[1].x, pinches[0].y - pinches[1].y);
            if (hs.prev.two) cam.dist = pinchZoom(cam.dist, hs.prev.two, d);
            hs.prev = { two: d };
            targetRef.current = null;
          } else if (pinches.length === 1) {
            const p = pinches[0];
            if (hs.prev.one) {
              cam.yaw += (p.x - hs.prev.one.x) * 0.008;
              cam.pitch = Math.max(-1.4, Math.min(1.4, cam.pitch + (p.y - hs.prev.one.y) * 0.008));
            }
            hs.prev = { one: p };
          } else hs.prev = {};
        } catch {
          /* a dropped frame is fine */
        }
      }

      const cam = viewCam();
      const pos = posRef.current;
      const { nodes, edges } = graphRef.current;
      const sel = selectedRef.current;
      const near = new Set<string>();
      if (sel) for (const e of edges) {
        if (e.sourceId === sel) near.add(e.targetId);
        if (e.targetId === sel) near.add(e.sourceId);
      }

      // Edges first, fainter with depth.
      ctx.lineCap = 'round';
      for (const e of edges) {
        const a = pos[e.sourceId] && project(pos[e.sourceId], cam, W, H);
        const b = pos[e.targetId] && project(pos[e.targetId], cam, W, H);
        if (!a || !b) continue;
        const lit = sel && (e.sourceId === sel || e.targetId === sel);
        const fade = Math.max(0.08, Math.min(1, 2.2 / ((a.depth + b.depth) / 2 + 0.6)));
        ctx.strokeStyle = lit ? `rgba(232,182,44,${0.9 * fade})` : `rgba(240,236,220,${0.32 * fade})`;
        ctx.lineWidth = lit ? 2 : 1.1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Nodes, back to front, so nearer ones sit on top.
      const drawn = nodes
        .map((n) => ({ n, s: pos[n.id] ? project(pos[n.id], cam, W, H) : null }))
        .filter((x): x is { n: ArNode; s: NonNullable<ReturnType<typeof project>> } => !!x.s)
        .sort((a, b) => b.s.depth - a.s.depth);
      for (const { n, s } of drawn) {
        const r = Math.max(2, Math.min(40, s.scale * (0.018 + 0.02 * (n.importance ?? 0.5))));
        const col = tone(n.type);
        const isSel = n.id === sel;
        const dim = sel && !isSel && !near.has(n.id);
        ctx.globalAlpha = dim ? 0.35 : 1;
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 3);
        glow.addColorStop(0, col + 'aa');
        glow.addColorStop(1, col + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (isSel) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Labels once a node is close enough to read, or when it matters.
        if (isSel || near.has(n.id) || s.scale > 260 || (n.importance ?? 0) > 0.8) {
          const fs = Math.max(11, Math.min(22, s.scale * 0.035));
          ctx.font = `500 ${fs}px Inter, system-ui, sans-serif`;
          const text = n.label.length > 42 ? n.label.slice(0, 41) + '…' : n.label;
          const tw = ctx.measureText(text).width;
          const lx = s.x + r + 8;
          const ly = s.y + fs * 0.35;
          ctx.fillStyle = 'rgba(20,24,14,0.62)';
          const ph = fs + 10;
          ctx.beginPath();
          ctx.roundRect(lx - 6, ly - fs - 2, tw + 12, ph, 6);
          ctx.fill();
          ctx.fillStyle = '#f4f1e8';
          ctx.fillText(text, lx, ly);
        }
        ctx.globalAlpha = 1;
      }

      // Fingertips, when hands are on.
      for (const t of hs.tips) {
        ctx.fillStyle = t.pinch ? '#e8b62c' : 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.pinch ? 9 : 6, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const links = selected
    ? graphRef.current.edges
        .filter((e) => e.sourceId === selected.id || e.targetId === selected.id)
        .map((e) => {
          const other = e.sourceId === selected.id ? e.targetId : e.sourceId;
          return { id: other, rel: (e.relationship ?? '').replace(/_/g, ' '), label: graphRef.current.nodes.find((n) => n.id === other)?.label ?? other };
        })
        .slice(0, 8)
    : [];

  return (
    <div className={`mar-root${cameraOn ? ' has-camera' : ''}`}>
      <video
        ref={videoRef}
        className={`mar-video${facing === 'user' ? ' is-mirrored' : ''}`}
        playsInline
        muted
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="mar-canvas" aria-label="Your Mind Graph in three dimensions" />

      <header className="mar-top">
        <Link href="/memory" className="mar-back">
          ← Memory
        </Link>
        <div className="mar-title">
          <strong>Mind Graph · AR</strong>
          <span>
            {source === 'loading'
              ? 'reading your memory…'
              : source === 'yours'
                ? `${count.shown}${count.nodes > count.shown ? ` of ${count.nodes}` : ''} things Socria remembers · ${count.edges} links`
                : `A sample graph. ${why}`}
          </span>
        </div>
        <span className="mar-badge">dev only</span>
      </header>

      {!cameraOn && (
        <div className="mar-intro">
          <p>
            Point your camera anywhere and the graph hangs in the room. Pinch or scroll to zoom, drag
            to turn it, tap a thought to fly into it.
          </p>
          <button type="button" className="mar-go" onClick={() => void startCamera('environment')}>
            Open the camera
          </button>
          <p className="mar-fine">The video stays on this device. Nothing is recorded or sent.</p>
        </div>
      )}

      <div className="mar-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(0.7)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => flyTo(null)} aria-label="Back to the whole graph" className="is-fit">
          ⤢
        </button>
      </div>

      <nav className="mar-tools" aria-label="Camera and controls">
        {cameraOn ? (
          <>
            <button type="button" onClick={() => void startCamera(facing === 'user' ? 'environment' : 'user')}>
              Flip camera
            </button>
            <button type="button" onClick={stopCamera}>
              Camera off
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void startCamera('environment')}>
            Camera on
          </button>
        )}
        <button type="button" aria-pressed={gyroOn} onClick={() => void toggleGyro()}>
          {gyroOn ? 'Tilt: on' : 'Look around'}
        </button>
        <button type="button" aria-pressed={handsOn === 'on'} onClick={() => void toggleHands()}>
          {handsOn === 'loading' ? 'Loading hands…' : handsOn === 'on' ? 'Hands: on' : 'Hands'}
        </button>
      </nav>

      {note && (
        <p className="mar-note" role="status">
          {note}
        </p>
      )}

      {selected && (
        <aside className="mar-card" aria-label={selected.label}>
          <button type="button" className="mar-x" onClick={() => flyTo(null)} aria-label="Close">
            ×
          </button>
          <span className="mar-type" style={{ color: tone(selected.type) }}>
            {selected.type.replace(/_/g, ' ')}
          </span>
          <h2>{selected.label}</h2>
          {selected.content && <p>{selected.content}</p>}
          {links.length > 0 && (
            <ul>
              {links.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => flyTo(l.id)}>
                    <em>{l.rel || 'linked to'}</em> {l.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  );
}
