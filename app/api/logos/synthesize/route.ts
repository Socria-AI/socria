// app/api/logos/synthesize/route.ts
// POST /api/logos/synthesize → { synthesis }
//
// STRUCTURE → UNDERSTANDING. Reads the session's canonical map — not the
// transcript — into a digest (lib/logos-synthesis.ts), asks the model for the
// editorial layer over it, and holds every word of that to the structure
// before it leaves. If no model answers, the structure writes the synthesis
// itself: plainer, never less honest. Nothing here writes to the map.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { LOGOS_FALLBACK_MODEL, LOGOS_MODEL, sanitizeMap } from '@/lib/logos';
import { enforce, digest, fromStructure, isSynthesisText, sanitizeSynthesis, snapshotOf, synthesisPrompt } from '@/lib/logos-synthesis';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How much of the conversation the model sees: a little, as evidence, never the subject. */
const CONTEXT_TURNS = 6;
const CONTEXT_CHARS = 360;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const map = sanitizeMap(body?.map, { trust: 'stored' });
  const ids: string[] = Array.isArray(body?.scope?.ids) ? body.scope.ids.filter((x: unknown) => typeof x === 'string').slice(0, 40) : [];
  const scope = body?.scope?.kind === 'selection' && ids.length >= 2 ? 'selection' : 'workspace';
  if (map.nodes.length < (scope === 'selection' ? 2 : 2) && !map.models?.docs?.length) {
    return NextResponse.json({ error: 'There is not enough on the map to synthesise yet.' }, { status: 400 });
  }
  const since = sanitizeSynthesis(body?.since)?.snapshot ?? null;
  const d = digest(map, { scope, ids, since: scope === 'workspace' ? since : null });
  const at = Date.now();
  const base = {
    id: 'syn_' + at.toString(36) + Math.random().toString(36).slice(2, 6),
    at,
    scope: { kind: scope, ...(scope === 'selection' ? { ids } : {}) } as const,
    snapshot: snapshotOf(map, at),
  };

  // The conversation, briefly and only as evidence: the last few turns,
  // without Socria's earlier syntheses (a synthesis of a synthesis drifts).
  const context = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && !m.synthesis && !isSynthesisText(m.content))
    .slice(-CONTEXT_TURNS)
    .map((m: any) => `${m.role === 'user' ? 'Person' : 'Logos'}: ${m.content.replace(/\s+/g, ' ').slice(0, CONTEXT_CHARS)}`)
    .join('\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ synthesis: fromStructure(d, base) });

  try {
    const openai = new OpenAI({ apiKey });
    const configured = process.env.OPENAI_MODEL_LOGOS_SYNTHESIS || process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;
    const ask = (model: string) =>
      openai.chat.completions.create({
        model,
        temperature: 0.3,
        max_tokens: 1600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: synthesisPrompt(d, context) },
          { role: 'user', content: scope === 'selection' ? 'Synthesise the selected objects.' : 'Synthesise where my thinking stands.' },
        ],
      });
    let completion;
    try {
      completion = await ask(configured);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if ((status === 404 || /model/i.test(e?.message || '')) && configured !== LOGOS_FALLBACK_MODEL) completion = await ask(LOGOS_FALLBACK_MODEL);
      else throw e;
    }
    const text = completion.choices?.[0]?.message?.content;
    const parsed = text ? JSON.parse(text) : null;
    return NextResponse.json({ synthesis: enforce(parsed, d, base) });
  } catch (e) {
    console.warn('logos synthesize: the model did not answer; synthesising from structure', e instanceof Error ? e.message : e);
    return NextResponse.json({ synthesis: fromStructure(d, base) });
  }
}
