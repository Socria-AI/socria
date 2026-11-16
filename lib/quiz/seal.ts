// lib/quiz/seal.ts — ANSWER KEYS THE BROWSER HOLDS BUT CANNOT READ, AND GRADES IT CANNOT FORGE.
//
// SERVER ONLY. A question's key (lib/quiz/grade.ts QuestionKey: which option is right, the number and its
// tolerance, the explanation, what each wrong option may suggest) is sealed with AES-256-GCM before the quiz is
// sent to the browser, and opened only by the grading route, for the student it was made for:
//
//   sealed   "k1." + base64url(iv · tag · ciphertext). The additional data binds it to its owner, its quiz and its
//            question, so a key copied to another question, quiz or account does not open.
//   signed   every grade the server gives is HMAC-signed over owner, quiz, question, attempt, a digest of the
//            answer and the grade: a record, so the conversation can tell a server's grade from an edited one.
//
// The secret is QUIZ_SECRET, else the app's existing server secrets (CONNECTION_SECRET, CLERK_SECRET_KEY), each
// derived for this use alone (sha256 of a scoped label and the secret), as the guest pass and the connections
// store already do. Without any secret, quizzes cannot be sealed and the routes say so.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { QuestionKey } from './grade';
import type { Grade } from './types';

function secret(): string | null {
  return process.env.QUIZ_SECRET || process.env.CONNECTION_SECRET || process.env.CLERK_SECRET_KEY || null;
}

/** Who a quiz's keys are sealed for: the account, or (with the typed access key, no account) the conversation. */
export function ownerOf(userId: string | null, sessionId: unknown): string | null {
  if (userId) return userId;
  const s = typeof sessionId === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(sessionId) ? sessionId : null;
  return s ? `anon:${s}` : null;
}

/** Can quizzes be sealed on this deployment? */
export const sealingReady = (): boolean => !!secret();

const derive = (use: string) => {
  const s = secret();
  if (!s) throw new Error('quiz-secret-missing');
  return createHash('sha256').update(`socria.quiz.${use}.v1|${s}`).digest();
};

const b64 = (b: Buffer) => b.toString('base64url');
const aadOf = (owner: string, quiz: string, qid: string) => Buffer.from(`${owner}|${quiz}|${qid}`, 'utf8');

/** Seal a question's key for its owner. */
export function sealKey(key: QuestionKey, owner: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', derive('key'), iv);
  c.setAAD(aadOf(owner, key.quiz, key.qid));
  const body = Buffer.concat([c.update(JSON.stringify(key), 'utf8'), c.final()]);
  return `k1.${b64(Buffer.concat([iv, c.getAuthTag(), body]))}`;
}

/** Open a sealed key for its owner, quiz and question; null when it does not open (or is not theirs). */
export function openKey(sealed: unknown, owner: string, quiz: string, qid: string): QuestionKey | null {
  if (typeof sealed !== 'string' || !sealed.startsWith('k1.') || sealed.length > 12_000) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), 'base64url');
    if (raw.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', derive('key'), raw.subarray(0, 12));
    d.setAAD(aadOf(owner, quiz, qid));
    d.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
    const key = JSON.parse(text) as QuestionKey;
    return key && key.quiz === quiz && key.qid === qid ? key : null;
  } catch {
    return null;
  }
}

const digest = (answer: string) => createHash('sha256').update(answer, 'utf8').digest('base64url').slice(0, 16);

/** The server's signature on one grade. */
export function signGrade(owner: string, quiz: string, qid: string, attempt: number, answer: string, grade: Grade): string {
  return createHmac('sha256', derive('grade')).update(`${owner}|${quiz}|${qid}|${attempt}|${digest(answer)}|${grade}`).digest('base64url').slice(0, 32);
}

/** Is a grade the server's? */
export function verifyGrade(sig: unknown, owner: string, quiz: string, qid: string, attempt: number, answer: string, grade: Grade): boolean {
  if (typeof sig !== 'string' || sig.length !== 32) return false;
  try {
    const want = Buffer.from(signGrade(owner, quiz, qid, attempt, answer, grade));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}
