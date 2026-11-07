// app/api/logos/guide/route.ts
// POST /api/logos/guide — SOCRIA LIVE AR GUIDANCE: one camera frame read into overlay instructions.
//
//   { mode: 'plan',  image, question }            → { plan }   the objects that matter and the steps, with overlays
//   { mode: 'check', image, step: {task, step, done?, objects[]} } → { check }  is the step done, and what next
//
// SAFETY FIRST, IN CODE. The question is read for danger before any frame is
// looked at (lib/guide/safety.ts): an emergency is answered at once with the
// call to make and the few steps that are safe whatever the details — no model
// is asked and nothing is drawn; a job that should not be learned from a guide
// (mains wiring, gas, brakes) is a stop with who to call. The model's own read
// can make it stricter, never looser.
//
// CHEAP. A frame is a 512px JPEG at most, read at low detail; a plan is one
// call (counted as one image read, like any photo), a check is one smaller
// call (metered against the week like every call, not counted as an image).
// What comes back is held to lib/guide/overlay.ts before it is returned.
//
// PRIVATE. The frame is read and dropped: it is never stored, logged or kept in
// the conversation. Early access, like AR Mode (lib/ar-access.ts): default deny.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { chooseAuxModel, firstAccepted, tierOf } from '@/lib/model-router';
import { cannotSee } from '@/lib/model-params';
import { LOGOS_MODEL } from '@/lib/logos';
import { enforceRateLimit } from '@/lib/rate-limit';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote } from '@/lib/entitlements';
import { spend } from '@/lib/usage';
import { arTester, arViewer } from '@/lib/ar-server';
import { mayUse } from '@/lib/route-guard';
import { parseJsonObject, sanitizeCheck, sanitizePlan, type GuidePlan } from '@/lib/guide/overlay';
import { hazardOf, safetyPlan, stricter } from '@/lib/guide/safety';
import { GUIDE_CHECK_PROMPT, GUIDE_PLAN_PROMPT, checkAsk, planAsk } from '@/lib/guide/prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// a 512px JPEG frame is ~40–90 KB as a data URL; this refuses anything that is not a small frame
const MAX_FRAME = 400_000;
const FRAME = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const line = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  // a session, or the access code's grant (as every Logos route) — and then the early-access rule, which lets a
  // visitor without an account in only where AR Mode is open to everyone, never on production
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Sign in to use Live Guidance.' }, { status: 401 });
  // early access, decided on the server like AR Mode — before anything is read or spent
  if (!arTester(await arViewer())) return NextResponse.json({ error: 'Live Guidance is in early access with AR Mode.', earlyAccess: true }, { status: 403 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const mode = body?.mode === 'check' ? 'check' : body?.mode === 'plan' ? 'plan' : null;
  if (!mode) return NextResponse.json({ error: 'Say what to do: plan or check.' }, { status: 400 });
  const question = line(body?.question, 300);

  // ── danger, read in code, before any frame is looked at ──
  if (mode === 'plan') {
    const stop = safetyPlan(question);
    if (stop) return NextResponse.json({ plan: stop, safety: hazardOf(question).level }, { headers: { 'X-Socria-Guide': `safety:${hazardOf(question).kind}` } });
  }

  const image = typeof body?.image === 'string' ? body.image.trim() : '';
  if (!image || image.length > MAX_FRAME || !FRAME.test(image)) {
    return NextResponse.json({ error: 'A camera frame is needed — a small JPEG.' }, { status: 400 });
  }
  const step = body?.step && typeof body.step === 'object' ? body.step : null;
  const ctx =
    mode === 'check' && step
      ? {
          task: line(step.task, 80),
          step: line(step.step, 200),
          ...(line(step.done, 200) ? { done: line(step.done, 200) } : {}),
          objects: (Array.isArray(step.objects) ? step.objects : []).slice(0, 6).map((o: unknown) => line(o, 60)).filter(Boolean),
        }
      : null;
  if (mode === 'check' && (!ctx || !ctx.step)) return NextResponse.json({ error: 'A check needs the step it is on.' }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });

  const plan = await resolvePlanForRequest(req, userId);
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);
  // a plan reads a photo, and is counted as one, like any other; a check is a glance at the same task
  if (mode === 'plan') {
    const allowance = await spend(userId, plan, 'images', typeof body?.sessionId === 'string' ? body.sessionId : null);
    if (!allowance.ok) return NextResponse.json({ error: boundaryNote('images'), upgrade: 'images', used: allowance.used, limit: allowance.limit }, { status: 402 });
  }

  const openai = tracked(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), 'logos/guide');
  const routed = chooseAuxModel(tierOf(userId, plan), 'standard', process.env, process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL);
  const call = (model: string) =>
    openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: mode === 'plan' ? 800 : 260,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: mode === 'plan' ? GUIDE_PLAN_PROMPT : GUIDE_CHECK_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: mode === 'plan' ? planAsk(question) : checkAsk(ctx!) },
            // low detail: one fixed, small token cost per frame — enough to find a lid and a hand
            { type: 'image_url', image_url: { url: image, detail: 'low' } },
          ],
        },
      ],
    });
  const stepDown = (from: string, to: string, why: string) => console.warn('logos guide: %s refused (%s); asking %s', from, why, to);

  try {
    const first = await firstAccepted(routed.ladder, call, stepDown, cannotSee);
    const parsed = parseJsonObject(first.result.choices?.[0]?.message?.content ?? '');
    if (mode === 'plan') {
      const p = sanitizePlan(parsed);
      if (!p) return NextResponse.json({ error: 'I could not work out what to show from that picture. Try holding the camera steady on the thing, in good light, and ask again.' }, { status: 422 });
      // the stricter of the words and the reading holds
      const safety = stricter(hazardOf(question).level, p.safety);
      const words = hazardOf(question);
      const out: GuidePlan = {
        ...p,
        safety,
        ...(safety === 'stop' ? { steps: [] } : {}),
        ...(safety !== 'none' && !p.safetyNote && words.note ? { safetyNote: words.note } : {}),
        ...(safety === 'stop' && !p.escalate && words.escalate ? { escalate: words.escalate } : {}),
      };
      return NextResponse.json({ plan: out }, { headers: { 'X-Socria-Guide': `plan:${out.steps.length}:${out.objects.length}:${out.safety}:${Math.round(out.confidence * 100)}` } });
    }
    const c = sanitizeCheck(parsed);
    if (!c) return NextResponse.json({ check: { done: false, saw: 'I could not tell from that picture.', retry: 'Hold the camera steady on it and press Done again.', confidence: 0 } });
    return NextResponse.json({ check: c }, { headers: { 'X-Socria-Guide': `check:${c.done ? 'done' : 'not-yet'}:${Math.round(c.confidence * 100)}` } });
  } catch (e) {
    const resting = sleepAnswer(e);
    if (resting) return resting;
    // content-free: never the frame, never the question
    console.error('logos guide error:', e instanceof Error ? e.name : 'error');
    return NextResponse.json({ error: 'I could not look at that just now — try again in a moment.' }, { status: 500 });
  }
});
