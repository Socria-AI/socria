// app/api/logos/quiz/grade/route.ts
// POST /api/logos/quiz/grade { sessionId, quiz, action, items: [{ qid, sealed, answer?, attempt? }] } → { results }
//
// The only place a quiz's answers are known. Each item's sealed key (lib/quiz/seal.ts) is opened for this
// student, quiz and question — a key that is not theirs does not open — and the answer graded by rule
// (lib/quiz/grade.ts gradeAnswer). What comes back is decided by the quiz's mode, sealed into the key
// (verdictFor): in practice a first miss gets a cue, not the answer; marks as you go get right or not; an exam
// simulation gets nothing until the end. Every grade is signed, so the record the browser keeps is the
// server's word, and a grade is computed afresh each time it is asked for (the same answer, the same grade), so
// a retry after a lost connection cannot grade differently.
//
//   grade    one answer (the question in front of them)
//   reveal   practice: the answer and why, for a question they chose to see
//   finish   the end: every answer graded and explained; for a question not answered, the answer and why
//
// No model is asked. It counts against a rate limit made for frequent, cheap requests.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';
import { verdictFor } from '@/lib/quiz/grade';
import { openKey, ownerOf, sealingReady, signGrade } from '@/lib/quiz/seal';
import type { Graded } from '@/lib/quiz/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QID = /^q\d{1,3}$/;
const QUIZ = /^[A-Za-z0-9_-]{1,24}$/;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Logos requires an access key.', requiresKey: true }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'capture');
  if (limited) return limited;
  if (!sealingReady()) return NextResponse.json({ error: 'Quizzes are not set up on this server.' }, { status: 503 });

  const body = await req.json().catch(() => null);
  const owner = ownerOf(userId, body?.sessionId);
  const quiz = typeof body?.quiz === 'string' && QUIZ.test(body.quiz) ? body.quiz : null;
  const action = body?.action === 'reveal' || body?.action === 'finish' ? body.action : 'grade';
  const items = Array.isArray(body?.items) ? body.items.slice(0, action === 'finish' ? 40 : 1) : [];
  if (!owner || !quiz || !items.length) return NextResponse.json({ error: 'That could not be read.' }, { status: 400 });

  const at = Date.now();
  const results: Record<string, { graded?: Graded; shown?: { correct: string; why: string } }> = {};
  for (const it of items) {
    const qid = typeof it?.qid === 'string' && QID.test(it.qid) ? it.qid : null;
    if (!qid) continue;
    const key = openKey(it.sealed, owner, quiz, qid);
    // a key that does not open for this student is refused outright: not theirs, or altered
    if (!key) return NextResponse.json({ error: 'not-yours' }, { status: 403 });
    const answer = typeof it.answer === 'string' ? it.answer.slice(0, 400) : '';
    const attempt = typeof it.attempt === 'number' && Number.isInteger(it.attempt) && it.attempt >= 0 && it.attempt < 3 ? it.attempt : 0;
    if (action === 'reveal') {
      if ((key.mode ?? 'practice') !== 'practice') return NextResponse.json({ error: 'Answers are shown at the end of this quiz.' }, { status: 409 });
      results[qid] = { shown: { correct: key.answerText, why: key.why } };
      continue;
    }
    if (!answer) {
      // not answered: at the end, the answer and why — no grade
      if (action === 'finish') results[qid] = { shown: { correct: key.answerText, why: key.why } };
      continue;
    }
    const v = verdictFor(key, answer, attempt, { final: action === 'finish' });
    if (!v) return NextResponse.json({ error: 'This quiz is graded at the end.' }, { status: 409 });
    results[qid] = { graded: { ...v, sig: signGrade(owner, quiz, qid, attempt, answer, v.grade), at } };
  }
  return NextResponse.json({ results });
}
