// app/api/ux/reason/route.ts
// POST /api/ux/reason → { message } — one turn of SocriaUX's design reasoning.
//
// The workspace sends the whole project (screenshots stripped), what the
// designer selected, which move they asked for and in which mode. The model is
// told the design element by element (lib/ux/reasoning.ts buildContext) along
// with what the automatic checks measured, and answers in one JSON shape that
// parseReply makes safe: unknown element ids are unpinned, links to nodes that
// do not exist are dropped. Annotations and map nodes come back as suggestions
// only — nothing here writes to the project; the designer decides.
//
// The same gate as the rest of Logos's thinking: a session or an unlock, the
// aux rate limit, the week's tokens (lib/sleep-server.ts), and the tier's model
// ladder (lib/model-router.ts).

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { chooseAuxModel, firstAccepted, tierOf } from '@/lib/model-router';
import { LOGOS_MODEL } from '@/lib/logos';
import { meterFor, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';
import { ASSIST_MODES, normalizeProject, uid, type AssistMode } from '@/lib/ux/model';
import { INTENTS, buildContext, buildSystemPrompt, parseReply, threadForModel, type Intent } from '@/lib/ux/reasoning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGE = 4000;

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) {
    return NextResponse.json({ error: 'Sign in to reason with SocriaUX.', signIn: true }, { status: 401 });
  }
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'The model is not configured on this deployment.' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const project = normalizeProject(body?.project);
  if (!project) return NextResponse.json({ error: 'project required' }, { status: 400 });
  // Pixels are never sent to the model: it reasons from the elements and annotations.
  for (const a of project.artboards) a.image = a.image ? { ...a.image, src: '' } : null;

  const intent: Intent = (INTENTS as readonly string[]).includes(body?.intent) ? body.intent : 'ask';
  const mode: AssistMode = (ASSIST_MODES as readonly string[]).includes(body?.mode) ? body.mode : project.mode;
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : '';
  if (intent === 'ask' && !message) return NextResponse.json({ error: 'message required' }, { status: 400 });
  const f = body?.focus ?? {};
  const focus = {
    artboardId: typeof f.artboardId === 'string' ? f.artboardId : null,
    elementId: typeof f.elementId === 'string' ? f.elementId : null,
    nodeId: typeof f.nodeId === 'string' ? f.nodeId : null,
  };

  const plan = await resolvePlanForRequest(req, userId);
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);

  const openai = tracked(new OpenAI({ apiKey }), 'ux/reason');
  // Implementation help and documentation are the long answers; everything else is a turn.
  const deep = intent === 'code' || intent === 'reflect' || mode === 'instructional';
  const routed = chooseAuxModel(tierOf(userId, plan), deep ? 'deep' : 'standard', process.env, process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL);

  const system = buildSystemPrompt(mode, intent);
  const context = buildContext(project, focus);
  // The designer's own words, or the move's default wording when they chose a move without typing.
  const ask = message || defaultAsk(intent);
  // The thread already holds the turn being asked (the workspace adds it before sending); leave it out.
  const thread = threadForModel(project).filter((m, i, all) => !(i === all.length - 1 && m.role === 'user' && m.content === ask));

  const make = (model: string) =>
    openai.chat.completions.create({
      model,
      temperature: 0.5,
      max_tokens: deep ? 2600 : 1400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `THE WORKSPACE, as it is now:\n\n${context}` },
        { role: 'assistant', content: 'Understood. I have the design, the brief, the map and the research in front of me.' },
        ...thread,
        { role: 'user', content: ask },
      ],
    });

  try {
    const res = (await firstAccepted(routed.ladder, make, (from, to, why) => console.warn('ux reason: %s refused (%s); asking %s', from, why, to))).result;
    const raw = res.choices?.[0]?.message?.content || '';
    const parsed = parseReply(raw, project, focus, () => uid('s'));
    return NextResponse.json({
      message: {
        id: uid('m'),
        role: 'socria',
        mode,
        focus,
        createdAt: Date.now(),
        ...parsed,
      },
      intent,
    });
  } catch (e) {
    console.error('ux reason failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'SocriaUX could not answer just now. Your work is saved; try again in a moment.' }, { status: 502 });
  }
});

function defaultAsk(intent: Intent): string {
  switch (intent) {
    case 'frame': return 'Help me frame the problem this design is solving, and who it is for.';
    case 'critique': return 'Critique the design I have selected.';
    case 'assumptions': return 'What am I assuming here that I have not tested?';
    case 'alternatives': return 'What genuinely different approaches could solve this, and what would each trade away?';
    case 'explain': return 'Explain the principle that matters most for what I have selected.';
    case 'research': return 'Interpret my research notes.';
    case 'code': return 'How would I build the selected part, and what constraints should shape the design?';
    case 'reflect': return 'Document the reasoning behind this design, and where the gaps are.';
    default: return 'Look at what I have selected.';
  }
}
