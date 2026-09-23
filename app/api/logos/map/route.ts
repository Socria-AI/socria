// app/api/logos/map/route.ts
// POST /api/logos/map  → { map } — the rebuilt Thinking Map.
//
// Runs INDEPENDENTLY of the conversational reply (the client fires both in
// parallel), so the map grows while the answer is still streaming.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import {
  buildMapPrompt,
  sanitizeMap,
  LOGOS_MODEL,
  LOGOS_FALLBACK_MODEL,
  EMPTY_MAP,
} from '@/lib/logos';
import { renderMessageForModel, sanitizeAttachments } from '@/lib/logos-attachments';
import { renderContextsForMap, sanitizeContexts } from '@/lib/logos-sources';
import { guidanceBlock, resolveDepth, resolveGuard } from '@/lib/logos-guidance';
import { isValidAccessKey } from '@/lib/socria-prompt';
import { capMapForFree, depthForPlan } from '@/lib/socria-one';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HISTORY = 16;

/** Appended to the retry after a truncated response: map only, no picture. */
const NO_PICTURE = `

THIS TURN ONLY: omit "viz" entirely. The previous attempt ran out of room. Return the nodes and edges and nothing else — the picture already on screen stays as it is.`;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  const keyUnlocked = isValidAccessKey(req.headers.get('x-socria-key'));
  if (!userId && !keyUnlocked) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const current = sanitizeMap(body?.map);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  // Grounded material attached to nodes — the extractor sees what is attached
  // and to which node, tagged with whose thinking it is.
  const grounded = renderContextsForMap(sanitizeContexts(body?.contexts));
  // The extractor is itself an answer-revealing surface — while the guard is on
  // it must not populate the result. Depth also shapes how much it extracts.
  // Depth is one of the things One opens, so a free request is answered at
  // Balanced whatever it asked for — clamped here rather than trusted.
  const plan = await resolvePlanForRequest(req, userId);
  const depth = depthForPlan(resolveDepth(body?.depth), plan);
  const guidance = guidanceBlock(depth, resolveGuard(body?.guard), 'surface');

  const kept = messages
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .slice(-MAX_HISTORY);

  // The extractor sees attachments too — a pasted page of notes or a photo of
  // a whiteboard is structural material, and a map blind to it would be a map
  // of half the conversation. The newest turn gets more room than the rest.
  const transcript = kept
    .map((m: any, i: number) => {
      const rendered = renderMessageForModel(
        { role: m.role, content: m.content, attachments: sanitizeAttachments(m.attachments) },
        i === kept.length - 1
      );
      const room = i === kept.length - 1 ? 6_000 : 700;
      return rendered.trim()
        ? `${m.role === 'user' ? 'User' : 'Logos'}: ${rendered.slice(0, room)}`
        : '';
    })
    .filter(Boolean)
    .join('\n');

  // Nothing to extract from — hand back what we already have.
  if (!transcript) return NextResponse.json({ map: current });

  try {
    const openai = new OpenAI({ apiKey });
    const configured =
      process.env.OPENAI_MODEL_LOGOS_MAP || process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;

    // The ceiling has to fit the JSON the prompt asks for, which is now a map
    // AND, when the conversation wants one, a picture the model authors part
    // by part. At 900 a busy turn ran out mid-object; the JSON then failed to
    // parse and the route quietly returned the map it was given — which on a
    // first turn is empty. Nothing drew, nothing errored, and nothing said
    // why.
    const CEILING = 3200;

    const make = (model: string, cap = CEILING, withPicture = true) =>
      openai.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: cap,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              buildMapPrompt(current, grounded) +
              guidance +
              (withPicture ? '' : NO_PICTURE),
          },
          { role: 'user', content: transcript },
        ],
      });

    let completion;
    try {
      completion = await make(configured);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const isModelError =
        status === 404 ||
        /model/i.test(e?.code || '') ||
        /model|not found|does not exist|unknown/i.test(e?.message || '');
      if (isModelError && configured !== LOGOS_FALLBACK_MODEL) {
        completion = await make(LOGOS_FALLBACK_MODEL);
      } else {
        throw e;
      }
    }

    // Ran out of room even at the ceiling. The map is the product and the
    // picture is the extra, so drop the picture and ask again rather than
    // returning nothing: from the outside, a turn that produces no map at all
    // is indistinguishable from Logos having stopped working.
    if (completion.choices?.[0]?.finish_reason === 'length') {
      console.warn('logos map: truncated at the ceiling — retrying without the picture');
      try {
        completion = await make(configured, CEILING, false);
      } catch {
        /* keep the truncated one; the parse below will decide */
      }
    }

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      console.warn('logos map: empty completion');
      return NextResponse.json({ map: current });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Said out loud, because the silent version of this looks exactly like
      // a map that has decided to stop building.
      console.error(
        'logos map: model returned unparseable JSON',
        completion.choices?.[0]?.finish_reason,
        raw.slice(0, 200)
      );
      return NextResponse.json({ map: current });
    }

    const next = sanitizeMap(parsed);
    // Never let a malformed extraction blank a map the user has built up.
    if (next.nodes.length === 0 && current.nodes.length > 0) {
      return NextResponse.json({ map: current });
    }
    // A free map stops taking on NEW nodes at its boundary; everything already
    // on it — including anything the extractor has since refined — is kept.
    // `capped` tells the client the thinking outgrew the free map, so it can
    // say so once, quietly, instead of the map just going still.
    if (plan === 'free') {
      const held = capMapForFree(next, current);
      return NextResponse.json({ map: held.map, capped: held.capped });
    }
    return NextResponse.json({ map: next });
  } catch (e) {
    console.error('logos map error:', e);
    return NextResponse.json({ map: current ?? EMPTY_MAP });
  }
}
