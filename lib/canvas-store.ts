// Where the cards sit — the VISUAL LAYOUT, kept apart from what they mean.
//
// The canonical map (lib/logos.ts) says what the thinking is: the nodes, their
// types and relations. It never holds a coordinate. This store holds the two
// kinds of position a map can have, per line of thinking and per lens:
//
//   pins     where the PERSON put a card. Theirs: no layout pass moves it,
//            a new turn of conversation does not move it, a refresh does not
//            move it. Released only by them ("Return to its place").
//   settled  where the GRAPH came to rest by itself, remembered so the same
//            map opens looking the same tomorrow instead of re-rolling.
//
// and the camera each lens was last looked at from (presentational — see
// lib/canvas.ts). Writing here never touches the map, never calls a model and
// never goes to the server: it is this browser's arrangement of the thinking.
// A shared room would carry `pins` as its own channel beside the map — layout
// shared, viewport never — which is why it is a separate document already.

import type { Camera } from './canvas';

export interface LensLayout {
  /** id → [x, y] in world coordinates, placed by hand */
  pins: Record<string, [number, number]>;
  /** id → [x, y], the force layout's own resting place (graph lens only) */
  settled?: Record<string, [number, number]>;
  /** the camera, and whether the person has moved it (auto-fit stops once they have) */
  cam?: { x: number; y: number; k: number; moved: boolean };
}

export interface CanvasDoc {
  v: 1;
  lenses: Partial<Record<string, LensLayout>>;
}

export const CANVAS_PREFIX = 'socria.canvas.v1:';
/** A map with thousands of placed cards is not a map; past this the oldest go. */
const MAX_PER_LENS = 600;

export const emptyCanvas = (): CanvasDoc => ({ v: 1, lenses: {} });

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);

function cleanPoints(raw: unknown): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (!raw || typeof raw !== 'object') return out;
  let n = 0;
  for (const [id, p] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_PER_LENS) break;
    if (typeof id !== 'string' || id.length > 200 || !pair(p)) continue;
    // A coordinate a thousand screens away is corruption, not a choice.
    if (Math.abs(p[0]) > 1e6 || Math.abs(p[1]) > 1e6) continue;
    out[id] = [Math.round(p[0]), Math.round(p[1])];
    n++;
  }
  return out;
}

/** Anything read back from storage is checked; a bad document is an empty one, never a crash. */
export function sanitizeCanvas(raw: unknown): CanvasDoc {
  const doc = emptyCanvas();
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return doc;
  const lenses = (raw as { lenses?: unknown }).lenses;
  if (!lenses || typeof lenses !== 'object') return doc;
  for (const [lens, l] of Object.entries(lenses as Record<string, unknown>)) {
    if (!/^[a-z]{2,20}$/.test(lens) || !l || typeof l !== 'object') continue;
    const src = l as Record<string, unknown>;
    const out: LensLayout = { pins: cleanPoints(src.pins) };
    const settled = cleanPoints(src.settled);
    if (Object.keys(settled).length) out.settled = settled;
    const c = src.cam as Record<string, unknown> | undefined;
    if (c && num(c.x) && num(c.y) && num(c.k) && c.k > 0.05 && c.k < 10) {
      out.cam = { x: c.x, y: c.y, k: c.k, moved: c.moved === true };
    }
    doc.lenses[lens] = out;
  }
  return doc;
}

export function lensOf(doc: CanvasDoc, lens: string): LensLayout {
  return doc.lenses[lens] ?? { pins: {} };
}

/** Put a card where the person dropped it. Returns a new document. */
export function pin(doc: CanvasDoc, lens: string, id: string, x: number, y: number): CanvasDoc {
  const l = lensOf(doc, lens);
  return { ...doc, lenses: { ...doc.lenses, [lens]: { ...l, pins: { ...l.pins, [id]: [Math.round(x), Math.round(y)] } } } };
}

/** Let a card go back to wherever the layout puts it. */
export function unpin(doc: CanvasDoc, lens: string, id: string): CanvasDoc {
  const l = lensOf(doc, lens);
  if (!(id in l.pins)) return doc;
  const pins = { ...l.pins };
  delete pins[id];
  const settled = l.settled ? { ...l.settled } : undefined;
  if (settled) delete settled[id];
  return { ...doc, lenses: { ...doc.lenses, [lens]: { ...l, pins, ...(settled ? { settled } : {}) } } };
}

export function isPinned(doc: CanvasDoc, lens: string, id: string): boolean {
  return !!doc.lenses[lens]?.pins[id];
}

export function withSettled(doc: CanvasDoc, lens: string, settled: Record<string, [number, number]>): CanvasDoc {
  const l = lensOf(doc, lens);
  return { ...doc, lenses: { ...doc.lenses, [lens]: { ...l, settled: cleanPoints(settled) } } };
}

export function withCamera(doc: CanvasDoc, lens: string, cam: Camera, moved: boolean): CanvasDoc {
  const l = lensOf(doc, lens);
  const r = (v: number) => Math.round(v * 100) / 100;
  return { ...doc, lenses: { ...doc.lenses, [lens]: { ...l, cam: { x: r(cam.x), y: r(cam.y), k: Math.round(cam.k * 1000) / 1000, moved } } } };
}

/** Forget every camera — Reset view. Placed cards are the person's work and stay. */
export function withoutCameras(doc: CanvasDoc): CanvasDoc {
  const lenses: CanvasDoc['lenses'] = {};
  for (const [k, l] of Object.entries(doc.lenses)) {
    if (!l) continue;
    const { cam: _c, ...rest } = l;
    lenses[k] = rest;
  }
  return { ...doc, lenses };
}

/**
 * Drop positions for cards the map no longer holds. A card removed from the
 * thinking takes its place with it; one that comes back later starts fresh.
 */
export function prune(doc: CanvasDoc, ids: ReadonlySet<string>): CanvasDoc {
  let changed = false;
  const lenses: CanvasDoc['lenses'] = {};
  for (const [k, l] of Object.entries(doc.lenses)) {
    if (!l) continue;
    const keep = (pts?: Record<string, [number, number]>) => {
      if (!pts) return pts;
      const out: Record<string, [number, number]> = {};
      for (const [id, p] of Object.entries(pts)) {
        if (ids.has(id)) out[id] = p;
        else changed = true;
      }
      return out;
    };
    lenses[k] = { ...l, pins: keep(l.pins) ?? {}, ...(l.settled ? { settled: keep(l.settled) } : {}) };
  }
  return changed ? { ...doc, lenses } : doc;
}

// ── this browser's copy ──────────────────────────────────────────────

export function loadCanvas(key: string | null | undefined): CanvasDoc {
  if (!key || typeof localStorage === 'undefined') return emptyCanvas();
  try {
    const raw = localStorage.getItem(CANVAS_PREFIX + key);
    return raw ? sanitizeCanvas(JSON.parse(raw)) : emptyCanvas();
  } catch {
    return emptyCanvas();
  }
}

export function saveCanvas(key: string | null | undefined, doc: CanvasDoc): void {
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CANVAS_PREFIX + key, JSON.stringify(doc));
  } catch {
    // Storage full or blocked: the arrangement lasts the visit, which is all
    // it can do. Nothing the person thought is at risk — it is not here.
  }
}

export function forgetCanvas(key: string | null | undefined): void {
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CANVAS_PREFIX + key);
  } catch {}
}
