// lib/guide/overlay.ts — WHAT LIVE GUIDANCE DRAWS, AS DATA (Socria Live AR Guidance, Logos 5.5).
//
// The camera is never redrawn by a model. A frame is read once, and what comes
// back is a small structured plan: the objects that matter, where they are in
// the frame (boxes, 0…1 of its width and height), and the steps — each a
// sentence and a few overlays anchored to those objects: an arrow, a
// highlight, a label, a movement to make (twist, push, lift…), a small
// step diagram, or a simple model of the thing being handled. The browser
// draws them over the live picture and keeps them on their objects as the
// camera moves (lib/guide/tracking.ts).
//
// Everything a model returns passes through here before it is drawn: shaped,
// clipped, bounded, its references checked. Nothing it says is trusted as
// markup; a target that names no object is drawn unanchored, never guessed.
//
// PURE. No DOM, no network.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}

/** A thing in view that the task is about: the jar, its lid, the tap. */
export interface GuideObject {
  id: string;
  label: string;
  box: Box;
  /** how sure the reading is that this is the thing, 0…1 */
  confidence: number;
}

export const OVERLAY_KINDS = ['arrow', 'highlight', 'label', 'motion', 'diagram', 'model'] as const;
export type OverlayKind = (typeof OVERLAY_KINDS)[number];

/** Movements a hand makes, drawn as an animated cue on the object. */
export const MOTIONS = ['twist-ccw', 'twist-cw', 'push', 'pull', 'lift', 'lower', 'press', 'tap', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'tilt', 'shake', 'squeeze'] as const;
export type Motion = (typeof MOTIONS)[number];

/** Simple shapes a model of the object can be drawn as (a 2.5D outline that turns, not a scene). */
export const MODELS = ['jar', 'bottle', 'box', 'screw', 'knob', 'lever', 'plug', 'hinge', 'latch', 'cable'] as const;
export type ModelShape = (typeof MODELS)[number];

export interface Overlay {
  kind: OverlayKind;
  /** the object it is anchored to, when it is about one */
  target?: string;
  /** where it sits when it is not anchored to an object, 0…1 of the frame */
  at?: Pt;
  /** an arrow's end: another object, or a point */
  to?: string | Pt;
  /** a few words: a label's text, or what an arrow or a highlight points out */
  text?: string;
  /** the movement to make, for a motion cue */
  motion?: Motion;
  /** the shape to draw, for a model */
  model?: ModelShape;
  /** a small numbered diagram of the steps, for a diagram */
  steps?: string[];
}

export interface GuideStep {
  id: string;
  /** what to do, in a sentence, said to the person */
  say: string;
  overlays: Overlay[];
  /** what done looks like, so the next look can tell */
  check?: string;
}

export type Safety = 'none' | 'caution' | 'stop';

export interface GuidePlan {
  /** the task, in a few words */
  task: string;
  objects: GuideObject[];
  steps: GuideStep[];
  /** how sure the reading is overall, 0…1 */
  confidence: number;
  /** what Socria is not sure of, said plainly — never hidden */
  uncertain?: string;
  safety: Safety;
  /** why caution or stop, in a sentence */
  safetyNote?: string;
  /** who to call or what to do first, when it is beyond a guide */
  escalate?: string;
  /** an emergency's first steps — set in code from vetted public-safety advice (lib/guide/safety.ts), never by a model */
  first?: string[];
}

/** What a second look at the frame found: is the step done, and what to say if not. */
export interface GuideCheck {
  done: boolean;
  /** what the look saw, in a sentence */
  saw: string;
  /** a clearer or different instruction for the same step, when it is not done */
  retry?: string;
  /** the objects where they are now, when they moved */
  objects?: GuideObject[];
  confidence: number;
  safety?: Safety;
  safetyNote?: string;
}

export const LIMITS = { objects: 6, steps: 8, overlays: 4, diagramSteps: 5, say: 160, text: 48, label: 32, task: 60, note: 200 } as const;

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const txt = (v: unknown, n: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f<>]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, n)
    : '';
const slug = (v: unknown, i: number) => (txt(v, 24).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || `o${i}`);

/** A box kept inside the frame, at least a sliver wide and tall. Accepts {x,y,w,h} or [x,y,w,h], 0…1 or 0…1000. */
export function sanitizeBox(raw: unknown): Box | null {
  let b: Record<string, unknown> | null = null;
  if (Array.isArray(raw) && raw.length === 4) b = { x: raw[0], y: raw[1], w: raw[2], h: raw[3] };
  else if (raw && typeof raw === 'object') b = raw as Record<string, unknown>;
  if (!b) return null;
  const vals = [b.x, b.y, b.w, b.h];
  if (!vals.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  // a model that answers in thousandths (or percent) is read in its own scale
  const big = Math.max(...(vals as number[])) > 1.5;
  const scale = big ? (Math.max(...(vals as number[])) > 100 ? 1000 : 100) : 1;
  let x = (b.x as number) / scale;
  let y = (b.y as number) / scale;
  let w = (b.w as number) / scale;
  let h = (b.h as number) / scale;
  if (w <= 0 || h <= 0) return null;
  x = Math.min(1, Math.max(0, x));
  y = Math.min(1, Math.max(0, y));
  w = Math.min(1 - x, w);
  h = Math.min(1 - y, h);
  if (w < 0.01 || h < 0.01) return null;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}

function sanitizePt(raw: unknown): Pt | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const big = Math.max(p.x, p.y) > 1.5;
  const s = big ? (Math.max(p.x, p.y) > 100 ? 1000 : 100) : 1;
  return { x: Math.min(1, Math.max(0, p.x / s)), y: Math.min(1, Math.max(0, p.y / s)) };
}

function sanitizeObjects(raw: unknown): GuideObject[] {
  if (!Array.isArray(raw)) return [];
  const out: GuideObject[] = [];
  const seen = new Set<string>();
  for (const [i, o] of raw.slice(0, 12).entries()) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    const box = sanitizeBox(r.box ?? r.bbox);
    const label = txt(r.label ?? r.name, LIMITS.label);
    if (!box || !label) continue;
    let id = slug(r.id ?? label, i);
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    out.push({ id, label, box, confidence: num(r.confidence, 0, 1, 0.6) });
    if (out.length >= LIMITS.objects) break;
  }
  return out;
}

function sanitizeOverlay(raw: unknown, ids: ReadonlySet<string>): Overlay | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = (OVERLAY_KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as OverlayKind) : null;
  if (!kind) return null;
  const target = typeof r.target === 'string' && ids.has(slug(r.target, 0)) ? slug(r.target, 0) : undefined;
  const at = sanitizePt(r.at) ?? undefined;
  // an overlay about nothing in view and nowhere in the frame has nowhere to be drawn — except a diagram,
  // which is a panel of its own
  if (!target && !at && kind !== 'diagram') return null;
  const o: Overlay = { kind, ...(target ? { target } : {}), ...(at ? { at } : {}) };
  const text = txt(r.text ?? r.label, LIMITS.text);
  if (text) o.text = text;
  if (kind === 'arrow') {
    const toId = typeof r.to === 'string' && ids.has(slug(r.to, 0)) ? slug(r.to, 0) : undefined;
    const toPt = sanitizePt(r.to);
    if (toId) o.to = toId;
    else if (toPt) o.to = toPt;
    // an arrow needs somewhere to point: its target, when it has one
  }
  if (kind === 'motion') {
    const m = String(r.motion ?? '').toLowerCase();
    if (!(MOTIONS as readonly string[]).includes(m)) return null;
    o.motion = m as Motion;
  }
  if (kind === 'model') {
    const m = String(r.model ?? '').toLowerCase();
    if (!(MODELS as readonly string[]).includes(m)) return null;
    o.model = m as ModelShape;
    if (r.motion && (MOTIONS as readonly string[]).includes(String(r.motion))) o.motion = r.motion as Motion;
  }
  if (kind === 'diagram') {
    const steps = Array.isArray(r.steps) ? r.steps.map((s) => txt(s, LIMITS.text)).filter(Boolean).slice(0, LIMITS.diagramSteps) : [];
    if (steps.length < 2) return null;
    o.steps = steps;
  }
  if (kind === 'label' && !o.text) return null;
  return o;
}

function sanitizeSteps(raw: unknown, ids: ReadonlySet<string>): GuideStep[] {
  if (!Array.isArray(raw)) return [];
  const out: GuideStep[] = [];
  for (const [i, s] of raw.slice(0, 12).entries()) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    const say = txt(r.say ?? r.text ?? r.instruction, LIMITS.say);
    if (!say) continue;
    const overlays = (Array.isArray(r.overlays) ? r.overlays : []).map((o) => sanitizeOverlay(o, ids)).filter((o): o is Overlay => !!o).slice(0, LIMITS.overlays);
    const check = txt(r.check ?? r.done, LIMITS.say);
    out.push({ id: `s${i + 1}`, say, overlays, ...(check ? { check } : {}) });
    if (out.length >= LIMITS.steps) break;
  }
  return out;
}

const SAFETY: readonly Safety[] = ['none', 'caution', 'stop'];
const safetyOf = (v: unknown): Safety => (SAFETY.includes(v as Safety) ? (v as Safety) : 'none');

/** A plan as it came from a model: shaped and bounded, or null when there is nothing to guide with. */
export function sanitizePlan(raw: unknown): GuidePlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const objects = sanitizeObjects(r.objects);
  const ids = new Set(objects.map((o) => o.id));
  const steps = sanitizeSteps(r.steps, ids);
  const safety = safetyOf(r.safety);
  const escalate = txt(r.escalate, LIMITS.note);
  // a stop needs no steps (it is the instruction); anything else needs at least one
  if (!steps.length && safety !== 'stop') return null;
  const uncertain = txt(r.uncertain, LIMITS.note);
  const safetyNote = txt(r.safetyNote ?? r.safety_note, LIMITS.note);
  return {
    task: txt(r.task, LIMITS.task) || 'Your task',
    objects,
    steps: safety === 'stop' ? [] : steps,
    confidence: num(r.confidence, 0, 1, 0.5),
    ...(uncertain ? { uncertain } : {}),
    safety,
    ...(safetyNote ? { safetyNote } : {}),
    ...(escalate ? { escalate } : {}),
  };
}

/** A second look as it came from a model. */
export function sanitizeCheck(raw: unknown): GuideCheck | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.done !== 'boolean') return null;
  const saw = txt(r.saw ?? r.observation, LIMITS.say) || (r.done ? 'That looks done.' : 'Not done yet.');
  const retry = txt(r.retry, LIMITS.say);
  const objects = sanitizeObjects(r.objects);
  const safety = r.safety !== undefined ? safetyOf(r.safety) : undefined;
  const safetyNote = txt(r.safetyNote, LIMITS.note);
  return {
    done: r.done,
    saw,
    ...(retry && !r.done ? { retry } : {}),
    ...(objects.length ? { objects } : {}),
    confidence: num(r.confidence, 0, 1, 0.5),
    ...(safety ? { safety } : {}),
    ...(safetyNote ? { safetyNote } : {}),
  };
}

/** The first JSON object in a model's text (fenced or not), or null. */
export function parseJsonObject(text: string): unknown {
  const t = (text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

/** The steps as text: what "Keep these steps" writes into the line of thinking, and what a screen reader hears. */
export function planAsSteps(plan: GuidePlan): string[] {
  return plan.steps.map((s, i) => `${i + 1}. ${s.say}`);
}

/** The least sure object a step points at: what the step card asks to be confirmed. */
export function leastSure(plan: GuidePlan, step: GuideStep | null | undefined): GuideObject | null {
  if (!step) return null;
  const ids = new Set(step.overlays.flatMap((o) => [o.target, typeof o.to === 'string' ? o.to : undefined]).filter(Boolean) as string[]);
  const objs = plan.objects.filter((o) => ids.has(o.id)).sort((a, b) => a.confidence - b.confidence);
  return objs[0] ?? null;
}

/** Below this, an object is said to be a guess ("I think this is the lid") and drawn dashed. */
export const UNSURE = 0.55;
