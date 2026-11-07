// lib/guide/prompt.ts — WHAT THE VISION MODEL IS ASKED (Socria Live AR Guidance).
//
// Two asks, both small, both JSON only:
//   plan   one frame and the question → the objects that matter (boxes) and the
//          steps, each with a few overlays anchored to those objects
//   check  one frame and the step it is on → done or not, what it saw, a
//          clearer instruction if not, and where the objects are now
//
// Short on purpose (they are paid for on every look): the shape, the honesty
// rules (say what you are unsure of; never invent an object you cannot see;
// never guess at something dangerous) and nothing else. The frame is sent at
// low detail (512px at most): enough to find a lid and a hand.

import type { GuideState } from './session';
import { checkContext } from './session';

export const GUIDE_MARK = 'SOCRIA LIVE GUIDE';

export const GUIDE_PLAN_PROMPT = `${GUIDE_MARK} — PLAN. You see one frame from the person's camera and their question. Show them how to do it themselves, step by step, by drawing on their live camera picture.
Return ONLY JSON:
{"task":"…","objects":[{"id":"lid","label":"Lid","box":{"x":0.42,"y":0.18,"w":0.2,"h":0.1},"confidence":0.8}],"steps":[{"say":"…","check":"what done looks like","overlays":[…]}],"confidence":0.7,"uncertain":"…","safety":"none"}
- objects: only things you can actually see that the task needs (at most 6). box = x,y (top-left), w,h as fractions 0–1 of the frame. confidence 0–1, honest.
- steps: 2–6, each "say" one short imperative sentence a beginner can follow, about the visible objects. "check": what the frame looks like when the step is done.
- overlays per step (1–3): {"kind":"highlight","target":"lid","text":"lid"} | {"kind":"arrow","target":"hand-area","to":"lid","text":"grip here"} | {"kind":"label","target":"lid","text":"turn this"} | {"kind":"motion","target":"lid","motion":"twist-ccw"} (motions: twist-ccw, twist-cw, push, pull, lift, lower, press, tap, slide-left, slide-right, slide-up, slide-down, tilt, shake, squeeze) | {"kind":"model","target":"lid","model":"jar","motion":"twist-ccw"} (models: jar, bottle, box, screw, knob, lever, plug, hinge, latch, cable) | {"kind":"diagram","steps":["…","…"]}. target must be an object id.
- If you cannot see what is needed, return one step asking them to point the camera at it, and say so in "uncertain". Never invent objects.
- safety: "none"; "caution" if there is a real risk (blade, heat, chemicals, height) — put the safety step first; "stop" if it should not be done from a guide (mains wiring, gas, brakes, structural, a person hurt or in danger) — then no steps, a "safetyNote" and an "escalate" saying who to call.
Plain words, British spelling, no markdown.`;

export const GUIDE_CHECK_PROMPT = `${GUIDE_MARK} — CHECK. You see one new frame while the person does one step of a task. Decide only whether that step looks done.
Return ONLY JSON: {"done":false,"saw":"one short sentence of what you see","retry":"a clearer instruction for the same step, if not done","objects":[{"id":"lid","label":"Lid","box":{"x":0.4,"y":0.2,"w":0.2,"h":0.1},"confidence":0.8}],"confidence":0.7}
- objects: only those listed, where they are now, only if you can see them.
- If you cannot tell, done=false, say why in "saw", and make "retry" ask them to show it more clearly. If something now looks dangerous, add "safety":"stop" and "safetyNote".
Plain words, no markdown.`;

/** The words with a plan's frame: their question, and what Socria already knows of the task. */
export function planAsk(question: string): string {
  const q = question.replace(/\s+/g, ' ').trim().slice(0, 300);
  return `Question: ${q || 'What should I do here?'}`;
}

/** The words with a check's frame: only the step, what done looks like, and the objects' names. */
export function checkAsk(ctx: NonNullable<ReturnType<typeof checkContext>>): string {
  return [`Task: ${ctx.task}`, `Step: ${ctx.step}`, ctx.done ? `Done looks like: ${ctx.done}` : '', `Objects: ${ctx.objects.join('; ')}`].filter(Boolean).join('\n');
}

/** A check's context from the state, clipped to what a request may carry. */
export function checkBody(s: GuideState): { task: string; step: string; done?: string; objects: string[] } | null {
  const c = checkContext(s);
  if (!c) return null;
  return { task: c.task.slice(0, 80), step: c.step.slice(0, 200), ...(c.done ? { done: c.done.slice(0, 200) } : {}), objects: c.objects.slice(0, 6).map((o) => o.slice(0, 60)) };
}
