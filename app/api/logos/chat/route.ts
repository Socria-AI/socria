// app/api/logos/chat/route.ts
// POST /api/logos/chat  → streaming plain-text conversational reply.
//
// Gated like Core 3.1: a Clerk session OR a verified unlock grant — an
// httpOnly cookie this server signed after checking a typed code against its
// environment (lib/access-codes-server.ts). It used to be a constant compared
// against an `x-socria-key` header, and that constant shipped in the browser
// bundle, so the gate was open to anyone who read the JS. With no code
// configured — the default — this route simply requires an account. Rate
// limited either way.

import { NextRequest, NextResponse } from 'next/server';
import { streamFailureNotice } from '@/lib/upstream-error';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import {
  LOGOS_CHAT_PROMPT,
  LOGOS_MODEL,
  LOGOS_FALLBACK_MODEL,
  NODE_TYPES,
  buildFocusPrompt,
} from '@/lib/logos';
import { renderMessageForModel, sanitizeAttachments } from '@/lib/logos-attachments';
import { collabBlock, type Seat } from '@/lib/collab';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote, limitOf } from '@/lib/entitlements';
import { reportUpstream } from '@/lib/upstream-error';
import { sanitizeViz, sceneBlock } from '@/lib/logos-viz';
import {
  bumpUsage,
  chatAlreadyCounted,
  checkAllowance,
  markChatCounted,
} from '@/lib/usage';
import { renderContextsForNode, sanitizeNodeContextList } from '@/lib/logos-sources';
import { guidanceBlock, resolveDepth, resolveGuard } from '@/lib/logos-guidance';
import { styleBlock } from '@/lib/logos-style';
import { personalityBlock, personalityMaxTokens } from '@/lib/logos-personality';
import {
  hasJourneyContent,
  renderJourneyBrief,
  sanitizeUserUnderstanding,
} from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';
import { eggFor } from '@/lib/easter-eggs';
import { claimLifecycle } from '@/lib/lifecycle-store';
import { LIMIT_DELAY_MS } from '@/lib/lifecycle';
import { lifecycleEmailsOn, withTimeout } from '@/lib/email';
import {
  memoryCaps,
  renderPersonMemory,
  selectRelevant,
  visibleEntries,
} from '@/lib/person-memory';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generous: people paste whole journal entries in here. Anything much longer
// arrives as a note attachment instead, which has its own budget.
const MAX_INPUT_LEN = 12_000;
const MAX_HISTORY = 24;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });
    }

    const { userId } = auth();
    // Same gate as Core 3.1: a Clerk session or the typed access key.
    const keyUnlocked = mayUse(req, userId);
    if (!userId && !keyUnlocked) {
      return NextResponse.json(
        { error: 'Logos requires an access key.', requiresKey: true },
        { status: 401 }
      );
    }

    const limited = await enforceRateLimit(req, userId, 'chat');
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const messages = body?.messages;

    // The two people in a shared room, if this is one. Names only — never who
    // is signed in, never an id — and cleaned to shape like every other field
    // that arrives from a browser.
    const collabPeopleFrom = (raw: unknown): { name: string; seat: Seat }[] => {
      if (!raw || typeof raw !== 'object') return [];
      const people = (raw as { people?: unknown }).people;
      if (!Array.isArray(people)) return [];
      return people
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({
          name: typeof p.name === 'string' ? p.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '',
          seat: (p.seat === 'host' || p.seat === 'guest' ? p.seat : 'guest') as Seat,
        }))
        .filter((p) => p.name)
        .slice(0, 2);
    };
    const nameOf = (by: unknown): string =>
      by && typeof by === 'object' && typeof (by as { name?: unknown }).name === 'string'
        ? (by as { name: string }).name.replace(/\s+/g, ' ').trim().slice(0, 40)
        : '';

    // ── "Can you?" ───────────────────────────────────────────────────
    //
    // Answered here, before the model and before any counter is spent: it is
    // a fixed two-word reply, so paying OpenAI for it — or charging one of a
    // free tier's two lines of thinking for it — would both be absurd. After
    // the rate limit, though, so it cannot be used to get around one.
    //
    // See lib/easter-eggs.ts for why this is a real answer in Socria's voice
    // rather than a gag, and for the care taken to keep it from firing on
    // somebody's genuine question.
    const lastUser = Array.isArray(messages)
      ? [...messages].reverse().find((m: { role?: string }) => m?.role === 'user')
      : null;
    const egg = eggFor((lastUser as { content?: unknown } | undefined)?.content);
    if (egg) {
      // The same content type the streamed replies use, so every client reads
      // it the way it reads any other turn — one chunk instead of many.
      return new Response(egg.reply, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 });
    }
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || typeof last.content !== 'string') {
      return NextResponse.json({ error: 'last message must be from user' }, { status: 400 });
    }
    if (last.content.length > MAX_INPUT_LEN) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_INPUT_LEN} chars).` },
        { status: 400 }
      );
    }

    const kept = messages
      .filter(
        (m: any) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string'
      )
      .slice(-MAX_HISTORY);

    // Two people, or one? A shared Logos 2 room passes `collab.people` — the
    // two display names — and each human turn carries a `by`. When both are
    // present, every human line is prefixed with its author's name so the
    // model always knows who said what; alone, nothing changes.
    const collabPeople = collabPeopleFrom(body?.collab);
    const twoPeople = collabPeople.length >= 2;

    // Attachments are flattened into the text the model reads. Only the turn
    // being answered carries a long note in full.
    const clean = kept
      .map((m: any, i: number) => {
        const rendered = renderMessageForModel(
          { role: m.role, content: m.content, attachments: sanitizeAttachments(m.attachments) },
          i === kept.length - 1
        );
        const name = twoPeople && m.role === 'user' ? nameOf(m.by) : '';
        return {
          role: m.role as 'user' | 'assistant',
          content: name && rendered ? `${name}: ${rendered}` : rendered,
        };
      })
      .filter((m) => m.content.trim());

    if (!clean.length) {
      return NextResponse.json({ error: 'Nothing to respond to.' }, { status: 400 });
    }

    // Optional: this turn belongs to a node the person opened, not to the
    // main thread. Same prompt, narrower aperture.
    const f = body?.focus;
    const trim = (v: any, n: number) =>
      typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
    const plan = await resolvePlanForRequest(req, userId);

    // ── the metered boundaries ────────────────────────────────────
    //
    // Two counts happen here because this is the only route that sees a turn
    // arrive with its attachments and its history.
    //
    // A "chat" is counted when a line of thinking BEGINS — one user turn and
    // nothing before it — not when an empty session is created. So opening
    // Logos and closing it again costs nothing, and the count matches what
    // the person would call a conversation. A node-focus request is never a
    // beginning, whatever its history looks like.
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
    const userTurns = clean.filter((m: { role: string }) => m.role === 'user').length;
    //
    // …and it is counted ONCE PER CONVERSATION, not once per first-turn
    // REQUEST. `chats` is monthly, so its scope is the month and the
    // conversation id is thrown away — which meant a first message that
    // failed and was retried charged twice, and two sends of one conversation
    // could spend a whole free month. The marker below is what remembers.
    const isNewChat = !body?.focus && userTurns <= 1;
    const alreadyCounted = isNewChat && (await chatAlreadyCounted(userId, sessionId));
    // Whether THIS request is the one that will pay for the conversation.
    // Checked here, charged further down — see the note at the charge itself.
    const willCharge = isNewChat && !alreadyCounted;

    if (willCharge) {
      const allowance = await checkAllowance(userId, plan, 'chats');
      if (!allowance.ok) {
        // A note about this boundary may go by email — a day from now, not
        // now, and only if they are still free then. All that happens here
        // is the claim: a ledger row with a due date, which the daily run
        // reads. Bounded and wrapped: the 402 is the answer to this request
        // and nothing about email may delay or change it.
        // Only where email is actually switched on: a claim recorded on a
        // deployment that never sends is a row that silently blocks the note
        // for good, since the ledger promises once-ever.
        if (userId && lifecycleEmailsOn()) {
          const now = Date.now();
          await withTimeout(
            claimLifecycle(userId, 'limit-chats', { now, dueAt: now + LIMIT_DELAY_MS }).catch(() => 'unavailable' as const),
            300,
            'unavailable' as const
          );
        }
        return NextResponse.json(
          {
            error: boundaryNote('chats'),
            upgrade: 'chats',
            used: allowance.used,
            limit: allowance.limit,
          },
          { status: 402 }
        );
      }
    }

    // Files are counted on the turn that carries them — only the newest one,
    // since the history repeats every earlier attachment on every request and
    // counting those again would charge the same file over and over.
    const newest = clean[clean.length - 1] as { role?: string; attachments?: unknown[] } | undefined;
    const freshFiles =
      newest?.role === 'user'
        ? (newest.attachments ?? []).filter(
            (a) => (a as { kind?: string })?.kind === 'text'
          ).length
        : 0;
    if (freshFiles > 0) {
      const allowance = await checkAllowance(userId, plan, 'files', sessionId);
      if (!allowance.ok) {
        return NextResponse.json(
          {
            error: boundaryNote('files'),
            upgrade: 'files',
            used: allowance.used,
            limit: allowance.limit,
          },
          { status: 402 }
        );
      }
      if (userId && allowance.limit !== null) {
        await bumpUsage(userId, 'files', sessionId, freshFiles);
      }
    }

    const focusLabel = trim(f?.label, 120);
    const focusContexts = sanitizeNodeContextList(f?.contexts);
    const system = focusLabel
      ? buildFocusPrompt({
          label: focusLabel,
          type: NODE_TYPES.includes(f?.type) ? f.type : 'idea',
          concept: trim(f?.concept, 100) || undefined,
          framing: trim(f?.framing, 700) || undefined,
          grounded: focusContexts.length
            ? renderContextsForNode(focusContexts, 2_000)
            : undefined,
        })
      : LOGOS_CHAT_PROMPT;

    // Depth (how deeply to help them think) + the Answer Guard (learning math:
    // hints, not answers). The guard is the same one every surface honours.
    // What Logos knows about this person between lines of thinking.
    //
    // Only for an account — anonymous, key-unlocked Logos has no person to
    // remember — and only what the plan carries: a member gets the relevant
    // entries and the journey brief; the free tier gets its two strongest
    // reasoning patterns, so that "you've leaned on this before" can happen
    // once and be missed afterwards. Nothing marked private ever reaches
    // this surface, whose map can be saved as a picture. The recurrence line
    // is included only while the client says it is still owed.
    let memoryBlock = '';
    if (userId && body?.understanding && !focusLabel) {
      const u = sanitizeUserUnderstanding(body.understanding);
      const caps = memoryCaps(plan);
      const now = Date.now();
      const contextText = clean
        .slice(-4)
        .map((m: { content?: unknown }) => (typeof m.content === 'string' ? m.content : ''))
        .join('\n')
        .slice(0, 2_000);
      const pool = visibleEntries(u.entries, plan, now).filter(
        (e) => plan === 'one' || e.confidence === 'stated'
      );
      const chosen = selectRelevant(pool, contextText, {
        now,
        n: caps.injectLogos,
        excludePrivate: true,
        ...(plan === 'one' ? {} : { kinds: ['pattern', 'decision'] as const }),
      });
      memoryBlock = renderPersonMemory(chosen, 'logos', { recurrence: body?.recurrence !== false });
      if (plan === 'one' && hasJourneyContent(u)) {
        const brief = renderJourneyBrief(u);
        if (brief) memoryBlock += `\nWhere their thinking has been lately, across conversations (a snapshot, not a truth): ${brief}\n`;
      }
    }

    const guided =
      system +
      guidanceBlock(resolveDepth(body?.depth), resolveGuard(body?.guard), 'chat') +
      // The hierarchy, in reading order: protected principles and depth
      // (above), then their personality settings, then their free-text
      // instructions — each block subordinating itself to what came before.
      personalityBlock(body?.persona) +
      styleBlock(body?.style) +
      // What they are looking at. Re-sanitised here rather than trusted: the
      // scene arrives from the browser like everything else in this body, and
      // a picture is a place to hide an instruction.
      sceneBlock(
        body?.viz ? sanitizeViz(body.viz) : null,
        body?.vizValues && typeof body.vizValues === 'object' ? body.vizValues : undefined
      ) +
      memoryBlock +
      // Logos 2: when two people are in the room, Socria becomes the layer
      // between them. See lib/collab.ts collabBlock — it names both, confines
      // the model to surfacing connections/disagreements/assumptions/questions
      // between what each said, and forbids taking a side or concluding.
      (twoPeople ? collabBlock(collabPeople) : '');

    const openai = new OpenAI({ apiKey });
    const configured = process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;

    const make = (model: string) =>
      openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: guided }, ...clean],
        temperature: 0.7,
        // Short is the prompt's default; the ceiling leaves room for the
        // people whose custom instructions ask for more than four sentences —
        // and rises again for somebody who has actually set Length: Detailed,
        // since promising three paragraphs and truncating at two is worse
        // than never offering them.
        max_tokens: personalityMaxTokens(body?.persona, 640),
        stream: true,
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
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[logos] model "${configured}" rejected; falling back to ${LOGOS_FALLBACK_MODEL}`
          );
        }
        completion = await make(LOGOS_FALLBACK_MODEL);
      } else {
        throw e;
      }
    }

    // ── charged here, and not one line earlier ────────────────────
    //
    // The allowance was CHECKED before the model ran, so somebody out of
    // lines of thinking is still refused without a model call. But the charge
    // waits until OpenAI has accepted the turn and handed back a stream,
    // because a turn that never produced an answer must not cost one.
    //
    // This is the bug Tobias reported: every one of his chats errored before
    // saying anything, and after two attempts the product told him he had
    // used a month he had never got a word out of. Charging up-front makes
    // the count a record of REQUESTS; the count is supposed to be a record of
    // CONVERSATIONS, and a conversation that never happened is not one.
    //
    // Deliberately before the stream rather than after it: from here the
    // answer is being written, and a connection that drops halfway through
    // one is a turn the person had. The marker goes with it, so the retry of
    // an answered turn is still free.
    if (willCharge && userId && limitOf(plan, 'chats') !== null) {
      await bumpUsage(userId, 'chats');
      await markChatCounted(userId, sessionId);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let sent = false;
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              sent = true;
              controller.enqueue(encoder.encode(delta));
            }
          }
        } catch (e) {
          // Was `catch {}` with a fixed line: the failure reached neither the
          // person nor the log, so an expired key looked like a flaky network.
          controller.enqueue(encoder.encode(streamFailureNotice('logos chat stream', e, sent)));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    // This used to answer every failure with { error: 'Internal error' }, and
    // that single string is why a person who reported the fault, offered to
    // help, and pasted four network responses still could not say what had
    // happened — the one response that knew had thrown the reason away.
    const f = reportUpstream('logos chat', e);
    return NextResponse.json({ error: f.reason, code: f.code, ref: f.ref }, { status: f.status });
  }
}
