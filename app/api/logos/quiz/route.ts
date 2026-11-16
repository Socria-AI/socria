// app/api/logos/quiz/route.ts
// POST /api/logos/quiz → a new quiz: its public questions (each key sealed), its basis, and what was checked
//
// What the browser sends, and why it is the browser: the student's materials and course profile live on their
// device (lib/docs, lib/teaching: the server keeps neither), so the request carries the passages to quiz from,
// the course pack (codes, terms and concepts — never the materials' past questions), the learning ledger (what
// they missed, what is due), and the stems already asked on this scope. Everything is read through the same
// sanitisers the chat route uses, and treated as content, never as instructions.
//
// What happens here:
//   1. the request is read (lib/quiz/scope.ts): count, mode, difficulty, formats, topics, named sources
//   2. the professor's style from the pack, with its basis (lib/quiz/style.ts), and what to aim at (mastery.ts)
//   3. the questions are written in parts at the same time (lib/quiz/generate.ts partsOf, quizPrompt): each a few
//      questions, short enough to finish whole and in time; a part cut off is read for what arrived whole
//      (salvageQuiz), and a quiz short of the number asked for gets one more part while there is time
//   4. every question is checked (lib/quiz/validate.ts); the ones that fail are dropped and counted
//   5. options shuffled with the right answer spread evenly; every key sealed for this student (lib/quiz/seal.ts)
//
// Who may ask: a signed-in account, or the typed access key. It counts against the rate limit and the week's
// tokens like the other study routes.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { randomBytes } from 'node:crypto';
import { tierOf } from '@/lib/model-router';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { sanitizeSourceDoc } from '@/lib/docs/sanitize';
import type { SourceDoc } from '@/lib/docs/types';
import { askJson } from '@/lib/logos5/ask-json';
import { cleanText } from '@/lib/objects/display-base';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';
import { dueTopics, sanitizeLedger } from '@/lib/runtime/explain';
import { sanitizeCoursePack } from '@/lib/teaching/use';
import { candidatesFrom, mergeParts, partsOf, quizPrompt, salvageQuiz, shapeQuiz } from '@/lib/quiz/generate';
import { quizTargets } from '@/lib/quiz/mastery';
import { defaultCount, readScope } from '@/lib/quiz/scope';
import { ownerOf, sealKey, sealingReady } from '@/lib/quiz/seal';
import { planTypes, styleOf } from '@/lib/quiz/style';
import { QUIZ_MODES, type QuestionType, type QuizBasis, type QuizMode } from '@/lib/quiz/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Each part of a quiz gives up after this; everything is done before DEADLINE_MS, inside the route's 60 seconds. */
const PART_MS = 34_000;
const DEADLINE_MS = 52_000;

/** Does the material hold enough numbers that calculation questions fit? */
function quantitativeOf(docs: SourceDoc[]): boolean {
  let numbers = 0;
  let blocks = 0;
  for (const d of docs)
    for (const b of d.blocks) {
      blocks++;
      if (/\d+(?:\.\d+)?\s*(?:%|\$|=)|=\s*-?\d|\$\s?\d/.test(b.text)) numbers++;
    }
  return blocks > 0 && numbers / blocks >= 0.12;
}

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Logos requires an access key.', requiresKey: true }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  if (!sealingReady()) return NextResponse.json({ error: 'Quizzes are not set up on this server.' }, { status: 503 });

  const body = await req.json().catch(() => null);
  const owner = ownerOf(userId, body?.sessionId);
  if (!owner) return NextResponse.json({ error: 'This conversation could not be identified.' }, { status: 400 });
  const request = cleanText(body?.request, 600);
  if (!request) return NextResponse.json({ error: 'Say what the quiz is for.' }, { status: 400 });

  // ── what was asked ──
  const scope = readScope(request);
  const reason = body?.reason === 'weak-spots' || body?.reason === 'another' || body?.reason === 'retest' ? body.reason : 'request';
  if ((QUIZ_MODES as readonly string[]).includes(body?.mode)) scope.mode = body.mode as QuizMode;
  if (typeof body?.count === 'number' && body.count >= 1 && body.count <= 25) scope.count = Math.round(body.count);
  if (body?.difficulty === 'harder' || body?.difficulty === 'easier' || body?.difficulty === 'mixed') scope.difficulty = body.difficulty;
  const focus = (Array.isArray(body?.focus) ? body.focus : []).map((f: unknown) => cleanText(f, 60).toLowerCase()).filter(Boolean).slice(0, 6);
  const count = reason === 'weak-spots' || reason === 'retest' ? Math.min(scope.count ?? 5, 6) : defaultCount(scope);

  // ── the material, the course, what they know ──
  const docs: SourceDoc[] = [];
  for (const raw of (Array.isArray(body?.docs) ? body.docs : []).slice(0, 8)) {
    const d = sanitizeSourceDoc(raw);
    if (d && !docs.some((x) => x.id === d.id)) docs.push(d);
  }
  const kinds: Record<string, string> = body?.kinds && typeof body.kinds === 'object' ? body.kinds : {};
  const pack = sanitizeCoursePack(body?.course);
  const now = Date.now();
  const ledger = sanitizeLedger(body?.ledger, now);
  const style = styleOf(pack);
  const dueSet = new Set(dueTopics(ledger, now).map((e) => e.topic));
  const targets: QuizBasis['targets'] = quizTargets(ledger, now, { asked: [...focus, ...scope.topics], course: pack?.concepts, due: (e) => dueSet.has(e.topic) }).map((t) =>
    focus.includes(t.concept) && reason !== 'request' ? { ...t, why: 'missed' as const } : t
  );
  const avoidStems = (Array.isArray(body?.avoidStems) ? body.avoidStems : []).map((s: unknown) => cleanText(s, 300)).filter(Boolean).slice(0, 60);
  const missing = (Array.isArray(body?.missing) ? body.missing : []).map((s: unknown) => cleanText(s, 160)).filter(Boolean).slice(0, 4);
  const courseName = cleanText(body?.courseName, 80) || null;
  const instructor = cleanText(body?.instructor, 80) || null;
  // named material that is not here: a quiz confined to it cannot be made honestly from general knowledge
  if (scope.strictSources && !docs.length && !scope.allowGeneral)
    return NextResponse.json({ error: 'missing-sources', missing: missing.length ? missing : scope.sourcesNamed }, { status: 409 });

  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'Socria cannot make a quiz just now.' }, { status: 503 });
  try {
    const sleep = await sleepGate(req, userId);
    if (sleep.refuse) return sleep.refuse;
    if (sleep.meter) meterFor(sleep.meter);
    const quantitative = quantitativeOf(docs) || style.numbers === 'often';
    const tier = tierOf(userId, await resolvePlanForRequest(req, userId));
    const model = process.env.OPENAI_MODEL_LOGOS_QUIZ || process.env.OPENAI_MODEL_LOGOS_STUDY;
    const course = courseName ? { name: courseName, instructor } : null;
    const topicHint = cleanText(body?.topicHint, 200) || undefined;
    const started = Date.now();

    // ── written in parts at the same time: each a few questions, short enough to finish whole and in time ──
    const types = planTypes(count, style, scope, quantitative);
    const parts = partsOf(types, scope.mode);
    const aims = parts.map((_, i) => targets.filter((_, j) => j % parts.length === i).map((t) => t.concept));
    let firstError: unknown = null;
    const write = async (p: { plan: QuestionType[]; variants: number; aim: string[]; others: string[]; index: number; of: number; avoid: string[]; timeoutMs: number }) => {
      const asked = quizPrompt({
        request,
        scope,
        count: p.plan.length,
        docs,
        style,
        targets: p.of > 1 ? targets.filter((t) => p.aim.includes(t.concept)) : targets,
        avoidStems: p.avoid,
        avoidHashes: pack?.avoid ?? [],
        course,
        topicHint,
        reason: reason === 'retest' ? 'weak-spots' : reason,
        quantitative,
        plan: p.plan,
        variants: p.variants,
        part: { index: p.index, of: p.of, aim: p.aim, others: p.others },
      });
      try {
        const raw = await askJson(
          { system: asked.system, user: asked.user },
          { model, tier, maxTokens: Math.min(6000, 800 + (p.plan.length + p.variants) * 480), timeoutMs: p.timeoutMs, salvage: salvageQuiz }
        );
        return candidatesFrom(raw);
      } catch (e) {
        firstError ??= e;
        console.warn(`[quiz] part ${p.index + 1}/${p.of} failed:`, e instanceof Error ? e.message.slice(0, 160) : e);
        return { title: '', candidates: [] };
      }
    };
    const written = await Promise.all(
      parts.map((p, i) =>
        write({ ...p, aim: aims[i], others: aims.filter((_, j) => j !== i).flat(), index: i, of: parts.length, avoid: avoidStems, timeoutMs: PART_MS })
      )
    );
    const quiz = `z${randomBytes(6).toString('hex')}`;
    let merged = mergeParts(written);
    let shaped = shapeQuiz(quiz, merged.title, merged.candidates, docs, { count, strictSources: scope.strictSources, avoidHashes: pack?.avoid ?? [], avoidStems });

    // ── short of the number asked for (a part failed, or questions did not pass their checks): one more part,
    //    for what is missing, while there is still time to write it ──
    const short = count - shaped.main;
    const elapsed = Date.now() - started;
    if (short > 0 && elapsed < DEADLINE_MS - 15_000) {
      const covered = [...new Set(shaped.questions.map((q) => q.concept))];
      const more = await write({
        plan: planTypes(short, style, scope, quantitative),
        variants: 0,
        aim: [],
        others: covered,
        index: parts.length,
        of: parts.length + 1,
        avoid: [...avoidStems, ...shaped.questions.map((q) => q.stem)],
        timeoutMs: Math.min(PART_MS, DEADLINE_MS - elapsed),
      });
      if (more.candidates.length) {
        merged = mergeParts([merged, more]);
        shaped = shapeQuiz(quiz, merged.title, merged.candidates, docs, { count, strictSources: scope.strictSources, avoidHashes: pack?.avoid ?? [], avoidStems });
      }
    }
    // too few questions held up to their checks to make a quiz worth taking: said, never padded
    if (shaped.main < Math.min(2, count)) {
      if (!merged.candidates.length && firstError) throw firstError;
      console.warn(`[quiz] too few held up: ${shaped.main}/${count} in ${Date.now() - started}ms rejected=${JSON.stringify(shaped.rejected)}`);
      return NextResponse.json({ error: 'too-few', rejected: shaped.rejected }, { status: 422 });
    }
    // the mode is sealed into each key, so what a grade reveals is the server's rule, not the browser's claim
    const questions = shaped.questions.map((q, i) => ({ ...q, sealed: sealKey({ ...shaped.keys[i], mode: scope.mode }, owner) }));
    const basis: QuizBasis = {
      course: courseName,
      instructor,
      sources: docs.map((d) => ({ doc: d.id, title: (d.title || d.name).slice(0, 80), ...(typeof kinds[d.id] === 'string' ? { kind: cleanText(kinds[d.id], 20) } : {}) })),
      grounding: shaped.grounding,
      missing,
      style: { basis: style.basis, said: style.said },
      targets,
    };
    const priority: Record<string, number> = {};
    targets.forEach((t, i) => (priority[t.concept] = Math.round(Math.max(0.5, 3 - i * 0.4) * 100) / 100));
    console.info(`[quiz] made q=${shaped.main}+${questions.length - shaped.main} of ${count} in ${Date.now() - started}ms parts=${parts.length} style=${style.basis} grounding=${shaped.grounding} rejected=${JSON.stringify(shaped.rejected)}`);
    return NextResponse.json({
      quiz,
      title: shaped.title,
      mode: scope.mode,
      count: shaped.main,
      asked: count,
      difficulty: scope.difficulty,
      questions,
      basis,
      priority,
      rejected: shaped.rejected,
    });
  } catch (e) {
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.warn('logos quiz: the model did not answer', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Socria could not make the quiz just now — try again in a moment.' }, { status: 502 });
  }
});
