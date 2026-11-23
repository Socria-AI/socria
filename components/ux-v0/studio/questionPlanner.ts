'use client';
// components/ux-v0/studio/questionPlanner.ts — who writes the studio's next creative question: the model when it can
// be reached, the reader always.
//
// The director (lib/ux-v0/studio/director.ts) asks the reader's question at once, so a conversation never waits on a
// model. When the model can be reached, it is asked to write the question for this brief instead
// (/api/ux-v0/studio-questions): its question — options generated for the brief, held to their shape again here — takes
// the reader's place, or it says the brief is enough and the work is made. When it cannot be reached (signed out, not
// configured, busy, over a limit, the connection lost) the reader's question stands and the model is left alone for a
// while. The person never hears about any of this: they see one question, or the work.

import { operationId, post } from '../api';
import type { StudioState } from '@/lib/ux-v0/studio/schema';
import type { DiscoveryQuestion } from '@/lib/ux-v0/studio/discovery';
import { normalizeQuestionAnswer, questionContextOf } from '@/lib/ux-v0/studio/discovery-model';

let quietUntil = 0;

/** Whether the model is worth asking now (it is left alone for a while after it could not be reached). */
export const questionModelWorthAsking = (now = Date.now()) => now >= quietUntil;

export type PlannedQuestion = { by: 'model'; ready: true; question: null } | { by: 'model'; ready: false; question: DiscoveryQuestion } | { by: 'reader' };

/** The model's question for the conversation as it stands, or "ready", or the reader's (nothing to change). */
export async function planQuestion(st: StudioState, o: { projectId?: string; signal?: AbortSignal } = {}): Promise<PlannedQuestion> {
  if (!questionModelWorthAsking()) return { by: 'reader' };
  const context = questionContextOf(st);
  if (!context) return { by: 'reader' };
  const r = await post<{ ready?: boolean; question?: unknown }>('/api/ux-v0/studio-questions', { context, projectId: o.projectId }, { signal: o.signal, operationId: operationId('question'), timeoutMs: 25_000 });
  if (r.ok) {
    const n = normalizeQuestionAnswer(r.data, context);
    if (n.ready) return { by: 'model', ready: true, question: null };
    if (n.question) return { by: 'model', ready: false, question: n.question };
    return { by: 'reader' };
  }
  if (r.cancelled) return { by: 'reader' };
  // not reachable: the reader's question stands; the model is left alone for a while (long when it cannot answer at all)
  quietUntil = Date.now() + (r.signIn || r.limit || r.status === 500 || r.status === 401 || r.status === 403 ? 30 * 60_000 : 2 * 60_000);
  return { by: 'reader' };
}
