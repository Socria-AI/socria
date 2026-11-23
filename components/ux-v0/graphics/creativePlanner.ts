'use client';
// components/ux-v0/graphics/creativePlanner.ts — who reads a creative change: the model when it can help, the reader
// always.
//
// The reader (lib/ux-v0/graphics/creative/interpret.ts) reads every change at once, in the browser. When its reading
// is plain — one clear instruction, nothing left over, nothing to ask — that plan is used as it is: the model would
// write the same one. Otherwise (several instructions in one breath, words it could not place, a question it would
// have to ask) the model reads the words against the design (/api/ux-v0/graphic-edit) and its plan is used, held to
// the plan's shape again here. When the model cannot be reached — signed out, not configured, busy, over a limit,
// the connection lost — the reader's plan carries on and the model is left alone for a while. The person never hears
// about any of this: they hear what will change, or one question when the words could mean different things.

import { operationId, post, type Progress } from '../api';
import { readCreative, type ReadResult } from '@/lib/ux-v0/graphics/creative/interpret';
import { normalizePlan, type CreativePlan, type PlanQuestion } from '@/lib/ux-v0/graphics/creative/plan';
import { readingOf } from '@/lib/ux-v0/graphics/creative/model';
import type { GraphicDoc } from '@/lib/ux-v0/graphics/doc';
import type { GraphicDirection } from '@/lib/ux-v0/graphics/compose';

let quietUntil = 0;

/** Whether the model is worth asking now (it is left alone for a while after it could not be reached). */
export const modelWorthAsking = (now = Date.now()) => now >= quietUntil;

export interface Planned {
  plan: CreativePlan | null;
  /** the reader's reading, always made */
  read: ReadResult | null;
  by: 'model' | 'reader';
  /** cancelled by the person: nothing should change */
  cancelled?: boolean;
}

export interface PlanOptions {
  board: string;
  dir?: GraphicDirection | null;
  asked?: PlanQuestion | null;
  recent?: readonly { said: string; did: string }[];
  concepts?: readonly { id: string; name: string }[];
  projectId?: string;
  /** what the model remembers beyond the design: the brief, references chosen */
  memory?: { brief?: string; references?: readonly string[] };
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
}

/** The plan for the words: the reader's when it is plain, the model's when it can help and be reached. */
export async function planChange(words: string, doc: GraphicDoc, o: PlanOptions): Promise<Planned> {
  const read = readCreative(words, { doc, board: o.board, concepts: o.concepts, asked: o.asked ?? null });
  if ((read && read.certain) || !modelWorthAsking()) return { plan: read?.plan ?? null, read, by: 'reader' };
  const r = await post<{ plan: unknown }>(
    '/api/ux-v0/graphic-edit',
    { words, reading: readingOf(doc, o.board, o.dir, o.memory), asked: o.asked ?? null, recent: (o.recent ?? []).slice(-4), projectId: o.projectId },
    { signal: o.signal, operationId: operationId('creative'), timeoutMs: 45_000, onProgress: o.onProgress },
  );
  if (r.ok) {
    const plan = normalizePlan(r.data.plan, words, 'model');
    return plan ? { plan, read, by: 'model' } : { plan: read?.plan ?? null, read, by: 'reader' };
  }
  if (r.cancelled) return { plan: null, read, by: 'reader', cancelled: true };
  // not reachable: the reader carries on; the model is left alone for a while (long when it cannot answer at all)
  quietUntil = Date.now() + (r.signIn || r.limit || r.status === 500 || r.status === 401 || r.status === 403 ? 30 * 60_000 : 2 * 60_000);
  return { plan: read?.plan ?? null, read, by: 'reader' };
}
