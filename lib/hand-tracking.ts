'use client';
// lib/hand-tracking.ts
//
// The camera test benches' shared parts: MediaPipe's hand landmarker, loaded
// from jsDelivr at runtime (so the app gains no dependency), the camera, and
// drawing a hand as lines. Browser only.

export const MP_VERSION = '1.0.1';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export type Point = { x: number; y: number; z: number };

export interface HandResult {
  landmarks: Point[][];
  worldLandmarks?: Point[][];
  handedness?: { categoryName: string; score: number }[][];
}

export interface Landmarker {
  detectForVideo: (v: HTMLVideoElement, t: number) => HandResult;
  close: () => void;
}

// MediaPipe's 21 hand points: 0 is the wrist, then four per finger from the
// knuckle out. Each finger is drawn as one line from the wrist to its tip.
export const FINGERS: { name: string; chain: number[]; color: string }[] = [
  { name: 'thumb', chain: [0, 1, 2, 3, 4], color: '#E0A93B' },
  { name: 'index', chain: [0, 5, 6, 7, 8], color: '#5E7633' },
  { name: 'middle', chain: [0, 9, 10, 11, 12], color: '#3F7CAC' },
  { name: 'ring', chain: [0, 13, 14, 15, 16], color: '#9B5DA8' },
  { name: 'pinky', chain: [0, 17, 18, 19, 20], color: '#D8402F' },
];
const PALM = [5, 9, 13, 17];
const TIPS = [4, 8, 12, 16, 20];

export async function loadHandLandmarker(numHands = 2): Promise<Landmarker> {
  // webpackIgnore: a URL import is resolved by the browser, not the bundler.
  const vision = await import(/* webpackIgnore: true */ `${MP_BASE}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
  const make = (delegate: 'GPU' | 'CPU') =>
    vision.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO',
      numHands,
    });
  // GPU where the browser allows it; CPU otherwise, which is slower but works.
  try {
    return await make('GPU');
  } catch {
    return await make('CPU');
  }
}

/** The camera, or a sentence saying why not. */
export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('The camera needs a secure page (https or localhost) and a browser that allows camera access.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    throw new Error(
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

/** Every hand, fingers as coloured lines wrist-to-tip, a line across the knuckles, a dot per joint. */
export function drawHands(ctx: CanvasRenderingContext2D, w: number, h: number, all: Point[][]) {
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
