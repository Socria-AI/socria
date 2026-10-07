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

import { buildingBlock, sanitizeBrief } from '@/lib/representation';
import { isSynthesisText, SYNTHESIS_CORRECTION } from '@/lib/logos-synthesis';
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
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote, limitOf } from '@/lib/entitlements';
import { reportUpstream } from '@/lib/upstream-error';
import { sanitizeViz, sceneBlock } from '@/lib/logos-viz';
import { sanitizeModelState, vizModelBlock } from '@/lib/viz-model';
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
import { collabBlock, type Seat } from '@/lib/collab';
import { focusBlock, sanitizeFocus } from '@/lib/workspace/focus';
import { objectsBlock, sanitizeSpace } from '@/lib/objects';
import { roleBlock } from '@/lib/onboarding-roles';
import { nameBlock } from '@/lib/onboarding-name';
import { wantedSimulation, bareRequest, hasSurface, simulationBlock } from '@/lib/model/wants';

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

    // Two people, or one? A shared Logos 3 room passes `collab.people` — the
    // two display names — and each human turn carries a `by`. When both are
    // present, every human line is prefixed with its author's name so the
    // model always knows who said what; alone, nothing changes. Names only —
    // never who is signed in, never an id — and cleaned like every other
    // field that arrives from a browser.
    const cleanPerson = (v: unknown) =>
      typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    const collabPeople: { name: string; seat: Seat }[] = (() => {
      const people = (body?.collab as { people?: unknown } | undefined)?.people;
      if (!Array.isArray(people)) return [];
      return people
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({ name: cleanPerson(p.name), seat: (p.seat === 'host' ? 'host' : 'guest') as Seat }))
        .filter((p) => p.name)
        .slice(0, 2);
    })();
    const twoPeople = collabPeople.length >= 2;
    // The assistant turn just before this one was a synthesis.
    const repliesToSynthesis = (() => {
      for (let i = kept.length - 2; i >= 0; i--) if (kept[i]?.role === 'assistant') return isSynthesisText(kept[i].content);
      return false;
    })();

    // Attachments are flattened into the text the model reads. Only the turn
    // being answered carries a long note in full.
    const clean = kept
      .map((m: any, i: number) => {
        const rendered = renderMessageForModel(
          { role: m.role, content: m.content, attachments: sanitizeAttachments(m.attachments) },
          i === kept.length - 1
        );
        const name = twoPeople && m.role === 'user' ? cleanPerson(m.by?.name) : '';
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

    const vizState = sanitizeModelState(body?.vizState);

    // A BARE REQUEST FOR ONE OF THE ENGINE'S OWN SURFACES. The map route
    // answers "generate black hole" with the Kerr surface every time
    // (lib/model/wants.ts answersOutright), and this reply runs in parallel
    // with it — so without being told, the reply answered a request to make a
    // black hole by asking which aspect of black holes they wanted to
    // understand. It is told the one thing it cannot see, and only on the turn
    // where that thing is certain to be on screen.
    const asked = focusLabel ? null : wantedSimulation(last.content);
    const opening =
      asked && hasSurface(asked.object) && bareRequest(last.content, asked) ? simulationBlock(asked) : '';

    const guided =
      system +
      guidanceBlock(resolveDepth(body?.depth), resolveGuard(body?.guard), 'chat') +
      // The hierarchy, in reading order: protected principles and depth
      // (above), then their personality settings, then their free-text
      // instructions — each block subordinating itself to what came before.
      personalityBlock(body?.persona) +
      styleBlock(body?.style) +
      // What they are looking at.
      //
      // TWO BLOCKS, AND ONLY ONE OF THEM AT A TIME. `vizState` is the picture
      // reporting itself — every object with what it means, every control
      // where it stands, what is selected — and where it is present it says
      // strictly more than the scene description ever could, including the
      // fact that the values are CURRENT rather than where the picture opened.
      // The older block stays for the case it was written for: a scene that is
      // on screen but has not reported, on a client that has not caught up.
      //
      // Re-sanitised here rather than trusted. Both arrive from a browser like
      // everything else in this body, and a description of a picture is a
      // fine place to hide an instruction.
      (vizState
        ? vizModelBlock(vizState)
        : sceneBlock(
            body?.viz ? sanitizeViz(body.viz) : null,
            body?.vizValues && typeof body.vizValues === 'object' ? body.vizValues : undefined
          )) +
      opening +
      // Logos 3: what they have selected in the workspace — a parameter, a
      // part of a model, an idea on the map — described from canonical state,
      // so "why is this negative?" is about the thing they are looking at.
      // Not on a focused node thread, which is already about one node.
      (focusLabel ? '' : focusBlock(sanitizeFocus(body?.focus))) +
      // what they mostly think about, from onboarding — examples, not assumptions
      roleBlock(body?.role) +
      nameBlock(body?.name) +
      // THE OBJECTS THEY ARE WORKING ON — the matrix, the function — as the
      // workspace holds them. Re-sanitised, which RE-COMPUTES every step from
      // the state before it (lib/objects/core.ts), so nothing a browser sends
      // can make the reply believe a state was computed that was not. The
      // reply is told what the person's step did; it never does the arithmetic.
      (() => {
        const space = sanitizeSpace(body?.objects);
        if (!space) return '';
        const guarded = resolveGuard(body?.guard) === 'guard';
        const st = body?.objectStep;
        const o = st && typeof st.obj === 'string' ? space.objs.find((x) => x.id === st.obj) : null;
        const step = o && o.at === o.states.length - 1 ? o.steps[o.at - 1] : null;
        const lastStep = step && step.said === st.said ? { obj: o!.id, step } : null;
        const refused = typeof body?.objectRefused === 'string' ? body.objectRefused.replace(/\s+/g, ' ').slice(0, 200) : null;
        const claims = (Array.isArray(body?.objectClaims) ? body.objectClaims : [])
          .slice(0, 2)
          .map((c: any) => {
            const ob = space.objs.find((x) => x.id === c?.obj);
            const cells = (Array.isArray(c?.cells) ? c.cells : []).slice(0, 6).filter((x: any) => Number.isInteger(x?.r) && Number.isInteger(x?.c) && typeof x?.was === 'string' && typeof x?.is === 'string' && x.was.length < 24 && x.is.length < 24);
            return ob && cells.length
              ? `They wrote out their own working for ${ob.name}; it differs from the computed state at ${cells.map((x: any) => `(${x.r}, ${x.c}) — theirs ${x.is}, computed ${x.was}`).join('; ')}. Point them at that entry and ask how they got it; do not simply correct it.`
              : '';
          })
          .filter(Boolean);
        return objectsBlock(space, { guarded, lastStep, refused }) + (claims.length ? claims.join('\n') + '\n' : '');
      })() +
      // What they are building — a process, a decision, a timeline — and its
      // spine as it stands, so the reply talks in steps and branches when
      // they are designing a sequence, rather than in loose concepts.
      (focusLabel ? '' : buildingBlock(sanitizeBrief(body?.building))) +
      // Answering a synthesis: a correction of Socria's READING is not a change
      // to the person's thinking, and the reply has to know which it is.
      (repliesToSynthesis ? SYNTHESIS_CORRECTION : '') +
      // Logos 3: when two people are in the room, Socria becomes the layer
      // between them — it names both, surfaces the connections, the
      // disagreements, the assumptions and the open questions between what
      // each said, and does not take a side or conclude (lib/collab.ts).
      (twoPeople ? collabBlock(collabPeople) : '') +
      // ONCE. This was appended twice, so everything Socria remembers about
      // the person reached the model as two identical blocks — twice the
      // tokens, and twice the weight against the guidance above it.
      memoryBlock;

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
