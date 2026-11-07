// lib/guide/session.ts — A GUIDANCE SESSION, STEP BY STEP (Socria Live AR Guidance).
//
// What the screen is doing, as one reducer: asking, looking, guiding a step,
// checking it, paused, done — and what the person did: next, back, replay,
// pause, dismiss, "done", moved an arrow, said which thing is the lid. The
// component (components/logos5/LiveGuide.tsx) only draws this state and sends
// the looks the reducer asks for.
//
// PROGRESS. A step is checked when the person says it is done, or — at most a
// few times a step — when the picture moved and then settled (they did
// something, then stopped), never more often than every few seconds. A check
// that says "not yet" replaces the step's sentence with a clearer one; a second
// "not yet" breaks the step down; the person can always go on by hand.
//
// HUMAN-FIRST. The person is doing the task; Socria shows how. Nothing is done
// for them, nothing moves on without them, and any step can be replayed,
// skipped or corrected.
//
// PURE.

import type { Box, GuideCheck, GuideObject, GuidePlan, GuideStep, Overlay, Pt } from './overlay';
import { UNSURE } from './overlay';
import { isLost, type Anchor } from './tracking';

export type Phase = 'idle' | 'looking' | 'guiding' | 'checking' | 'paused' | 'done' | 'safety' | 'error';

export interface GuideState {
  phase: Phase;
  question: string;
  plan: GuidePlan | null;
  step: number;
  /** checks that said "not yet", per step */
  misses: Record<number, number>;
  /** checks asked, per step (the budget) */
  checks: Record<number, number>;
  /** a clearer sentence for a step, after a check said not yet */
  retry: Record<number, string>;
  /** what the last look saw */
  saw: string | null;
  /** objects moved by hand: id → box (the person's correction wins over any reading) */
  moved: Record<string, Box>;
  /** overlays hidden for this step */
  dismissed: boolean;
  /** replay counter: the component restarts the step's animations when it changes */
  replay: number;
  error: string | null;
  /** looks sent this session (plan + checks) — the cost the person can see */
  looks: number;
}

export const IDLE: GuideState = {
  phase: 'idle',
  question: '',
  plan: null,
  step: 0,
  misses: {},
  checks: {},
  retry: {},
  saw: null,
  moved: {},
  dismissed: false,
  replay: 0,
  error: null,
  looks: 0,
};

export type GuideAction =
  /** `framed: false` — answered from the words alone (an emergency, a stop): no frame sent, so no look counted */
  | { type: 'ask'; question: string; framed?: boolean }
  | { type: 'planned'; plan: GuidePlan }
  | { type: 'failed'; error: string }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'replay' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'dismiss' }
  | { type: 'show' }
  | { type: 'check' }
  | { type: 'checked'; check: GuideCheck }
  | { type: 'move'; id: string; box: Box }
  | { type: 'restart' };

/** Checks a step may ask by itself (on top of the person's own "done"). */
export const AUTO_CHECKS_PER_STEP = 2;
/** Checks a step may ask at all, the person's included. */
export const CHECKS_PER_STEP = 4;
/** The fewest milliseconds between two looks. */
export const MIN_CHECK_GAP_MS = 6000;

export function guideReducer(s: GuideState, a: GuideAction): GuideState {
  switch (a.type) {
    case 'ask':
      return { ...IDLE, phase: 'looking', question: a.question.trim().slice(0, 300), looks: s.looks + (a.framed === false ? 0 : 1) };
    case 'planned': {
      if (a.plan.safety === 'stop' || !a.plan.steps.length) return { ...s, phase: 'safety', plan: a.plan, step: 0, error: null };
      return { ...s, phase: 'guiding', plan: a.plan, step: 0, error: null, dismissed: false };
    }
    case 'failed':
      return { ...s, phase: s.plan ? 'guiding' : 'error', error: a.error };
    case 'next': {
      if (!s.plan) return s;
      const last = s.plan.steps.length - 1;
      if (s.step >= last) return { ...s, phase: 'done', saw: null };
      return { ...s, phase: 'guiding', step: s.step + 1, saw: null, dismissed: false, replay: s.replay + 1 };
    }
    case 'back':
      if (!s.plan || s.step === 0) return { ...s, phase: s.plan ? 'guiding' : s.phase, replay: s.replay + 1 };
      return { ...s, phase: 'guiding', step: s.step - 1, saw: null, dismissed: false, replay: s.replay + 1 };
    case 'replay':
      return s.plan ? { ...s, phase: s.phase === 'done' ? 'guiding' : s.phase === 'paused' ? 'guiding' : s.phase, dismissed: false, replay: s.replay + 1 } : s;
    case 'pause':
      return s.phase === 'guiding' || s.phase === 'checking' ? { ...s, phase: 'paused' } : s;
    case 'resume':
      return s.phase === 'paused' ? { ...s, phase: 'guiding' } : s;
    case 'dismiss':
      return { ...s, dismissed: true };
    case 'show':
      return { ...s, dismissed: false };
    case 'check':
      if (!s.plan || (s.phase !== 'guiding' && s.phase !== 'paused')) return s;
      if ((s.checks[s.step] ?? 0) >= CHECKS_PER_STEP) return s;
      return { ...s, phase: 'checking', checks: { ...s.checks, [s.step]: (s.checks[s.step] ?? 0) + 1 }, looks: s.looks + 1 };
    case 'checked': {
      if (!s.plan) return s;
      const c = a.check;
      // where the look found the objects, unless the person put them somewhere by hand
      const objects = c.objects?.length ? mergeObjects(s.plan.objects, c.objects, s.moved) : s.plan.objects;
      const plan: GuidePlan = { ...s.plan, objects, ...(c.safety && c.safety !== 'none' ? { safety: c.safety === 'stop' ? 'stop' : s.plan.safety === 'none' ? c.safety : s.plan.safety, safetyNote: c.safetyNote ?? s.plan.safetyNote } : {}) };
      if (plan.safety === 'stop') return { ...s, plan, phase: 'safety', saw: c.saw };
      if (c.done) {
        const last = plan.steps.length - 1;
        if (s.step >= last) return { ...s, plan, phase: 'done', saw: c.saw };
        return { ...s, plan, phase: 'guiding', step: s.step + 1, saw: c.saw, dismissed: false, replay: s.replay + 1 };
      }
      const misses = (s.misses[s.step] ?? 0) + 1;
      return {
        ...s,
        plan,
        phase: 'guiding',
        saw: c.saw,
        misses: { ...s.misses, [s.step]: misses },
        ...(c.retry ? { retry: { ...s.retry, [s.step]: c.retry } } : {}),
        replay: s.replay + 1,
      };
    }
    case 'move': {
      if (!s.plan) return s;
      return { ...s, moved: { ...s.moved, [a.id]: a.box } };
    }
    case 'restart':
      return { ...IDLE, looks: s.looks };
  }
}

function mergeObjects(old: readonly GuideObject[], seen: readonly GuideObject[], moved: Record<string, Box>): GuideObject[] {
  const byId = new Map(seen.map((o) => [o.id, o]));
  const byLabel = new Map(seen.map((o) => [o.label.toLowerCase(), o]));
  return old.map((o) => {
    if (moved[o.id]) return o;
    const n = byId.get(o.id) ?? byLabel.get(o.label.toLowerCase());
    return n ? { ...o, box: n.box, confidence: Math.max(o.confidence, n.confidence) } : o;
  });
}

/** The step on screen, with its sentence as it now stands (a clearer one after a miss). */
export function currentStep(s: GuideState): (GuideStep & { said: string; tries: number }) | null {
  const st = s.plan?.steps[s.step];
  if (!st) return null;
  const tries = s.misses[s.step] ?? 0;
  return { ...st, said: s.retry[s.step] ?? st.say, tries };
}

/** What the step card adds after misses: a gentler pace the second time, the way on by hand always. */
export function missHint(tries: number): string | null {
  if (tries <= 0) return null;
  if (tries === 1) return 'Not quite yet — try it this way.';
  return 'Take it in smaller moves. You can go on whenever you are ready — press Next.';
}

/**
 * Should a step be checked by itself now? Only while guiding, a few times a step, not too often — and only once
 * the picture has moved (they did something) and then settled (they stopped).
 */
export function shouldAutoCheck(i: { phase: Phase; autoChecks: number; sinceLastLookMs: number; moved: boolean; settledMs: number }): boolean {
  if (i.phase !== 'guiding') return false;
  if (i.autoChecks >= AUTO_CHECKS_PER_STEP) return false;
  if (i.sinceLastLookMs < MIN_CHECK_GAP_MS) return false;
  return i.moved && i.settledMs >= 1200;
}

/** The picture changed enough to count as something done (frame difference, 0…1). */
export const MOVED = 0.06;
/** …and is still enough to count as settled. */
export const STILL = 0.02;

// ── where things are drawn ─────────────────────────────────────────

/** How a frame sits in a box drawn with object-fit: cover — the scale and the crop. */
export interface Fit {
  scale: number;
  ox: number;
  oy: number;
  vw: number;
  vh: number;
  sw: number;
  sh: number;
  /** the picture is shown mirrored (a front camera) */
  mirror: boolean;
}

export function coverFit(videoW: number, videoH: number, screenW: number, screenH: number, mirror = false): Fit {
  const scale = videoW && videoH ? Math.max(screenW / videoW, screenH / videoH) : 1;
  return { scale, ox: (screenW - videoW * scale) / 2, oy: (screenH - videoH * scale) / 2, vw: videoW, vh: videoH, sw: screenW, sh: screenH, mirror };
}

/** A point of the frame (0…1) on the screen, in pixels. */
export function toScreen(p: Pt, f: Fit): Pt {
  const x = f.ox + p.x * f.vw * f.scale;
  return { x: f.mirror ? f.sw - x : x, y: f.oy + p.y * f.vh * f.scale };
}

/** A box of the frame on the screen. */
export function boxToScreen(b: Box, f: Fit): Box {
  const a = toScreen({ x: b.x, y: b.y }, f);
  const c = toScreen({ x: b.x + b.w, y: b.y + b.h }, f);
  return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
}

/** A point on the screen back in the frame (for an arrow dragged by hand). */
export function toFrame(p: Pt, f: Fit): Pt {
  const sx = f.mirror ? f.sw - p.x : p.x;
  return { x: Math.min(1, Math.max(0, (sx - f.ox) / (f.vw * f.scale))), y: Math.min(1, Math.max(0, (p.y - f.oy) / (f.vh * f.scale))) };
}

/** Is a frame box on the screen at all (a cover fit crops the edges)? */
export function onScreen(b: Box, f: Fit): boolean {
  const s = boxToScreen(b, f);
  return s.x + s.w > 8 && s.y + s.h > 8 && s.x < f.sw - 8 && s.y < f.sh - 8;
}

export interface Placed {
  overlay: Overlay;
  /** anchored to its object, on screen — or drawn at the screen's edge as a 2D note */
  mode: 'anchored' | 'free' | 'fallback';
  /** the box it is drawn on (screen pixels), when anchored or free */
  box?: Box;
  /** an arrow's end, screen pixels */
  to?: Pt;
  /** the object it is about */
  object?: GuideObject;
  /** the object is a guess: drawn dashed, said "I think…" */
  unsure: boolean;
  /** why it fell back, said to the person */
  why?: string;
}

/**
 * Where each overlay of a step is drawn now: on its object while the object is followed with confidence and on
 * screen, as a 2D note at the edge otherwise ("Point the camera at the lid"). Moved-by-hand boxes win.
 */
export function placeOverlays(i: { plan: GuidePlan; step: GuideStep; anchors: readonly Anchor[]; moved: Record<string, Box>; fit: Fit; now: number; tracking: boolean }): Placed[] {
  const objs = new Map(i.plan.objects.map((o) => [o.id, o]));
  const anchors = new Map(i.anchors.map((a) => [a.id, a]));
  const boxOf = (id: string): { box: Box; trusted: boolean } | null => {
    const o = objs.get(id);
    if (!o) return null;
    if (i.moved[id]) return { box: i.moved[id], trusted: true };
    const a = anchors.get(id);
    // without tracking (a browser that cannot read frames), the reading's own box holds until the next look
    if (!i.tracking || !a) return { box: o.box, trusted: !i.tracking ? true : false };
    return { box: a.box, trusted: !isLost(a, i.now) };
  };
  return i.step.overlays.map((ov): Placed => {
    const object = ov.target ? objs.get(ov.target) : undefined;
    const unsure = !!object && object.confidence < UNSURE && !i.moved[object.id];
    if (ov.kind === 'diagram') return { overlay: ov, mode: 'fallback', unsure: false };
    if (!ov.target) {
      const at = ov.at ? toScreen(ov.at, i.fit) : null;
      return at ? { overlay: ov, mode: 'free', box: { x: at.x - 1, y: at.y - 1, w: 2, h: 2 }, unsure: false } : { overlay: ov, mode: 'fallback', unsure: false };
    }
    const b = boxOf(ov.target);
    if (!b || !b.trusted || !onScreen(b.box, i.fit)) {
      return { overlay: ov, mode: 'fallback', object, unsure, why: object ? `Point the camera at the ${object.label.toLowerCase()}` : 'Point the camera at it' };
    }
    const placed: Placed = { overlay: ov, mode: 'anchored', box: boxToScreen(b.box, i.fit), object, unsure };
    if (ov.kind === 'arrow' && ov.to) {
      if (typeof ov.to === 'string') {
        const t = boxOf(ov.to);
        if (t && t.trusted) placed.to = toScreen({ x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 }, i.fit);
      } else placed.to = toScreen(ov.to, i.fit);
    }
    return placed;
  });
}

// ── the frame sent to look ───────────────────────────────────────────

/** The size a frame is sent at: its long side at most `long` pixels — small enough to be cheap, large enough to see. */
export function sendSize(videoW: number, videoH: number, long = 512): { w: number; h: number } {
  if (!videoW || !videoH) return { w: long, h: Math.round((long * 3) / 4) };
  const s = Math.min(1, long / Math.max(videoW, videoH));
  return { w: Math.max(32, Math.round(videoW * s)), h: Math.max(32, Math.round(videoH * s)) };
}

/** What a check needs of the plan: the step and the objects' names — not the whole plan again. */
export function checkContext(s: GuideState): { task: string; step: string; done?: string; objects: string[] } | null {
  const st = currentStep(s);
  if (!s.plan || !st) return null;
  return { task: s.plan.task, step: st.said, ...(st.check ? { done: st.check } : {}), objects: s.plan.objects.map((o) => `${o.id}: ${o.label}`) };
}

/** The guidance kept in the line of thinking: a sequence of the steps, as Logos 5's own inline element. */
export function keepAsTurn(question: string, plan: GuidePlan): { asked: string; answer: string } {
  const items = plan.steps.map((s) => ({ label: s.say.slice(0, 80) }));
  const spec = { type: 'sequence', kind: 'steps', title: plan.task.slice(0, 80), items };
  return {
    asked: `Live guidance: ${question.trim().slice(0, 200)}`,
    answer: `Here are the steps from the live guidance, to come back to.\n\n\`\`\`ui\n${JSON.stringify(spec)}\n\`\`\`${plan.uncertain ? `\n\nI wasn't sure of one thing at the time: ${plan.uncertain}` : ''}`,
  };
}
