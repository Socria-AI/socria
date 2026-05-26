// app/api/chat/route.ts
// POST /api/chat
// Body: { conversationId: string, content: string }
// Returns a streaming plain-text response.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getOpenAI, OPENAI_MODEL, estimateTokens } from '@/lib/openai';
import { SOCRIA_SYSTEM_PROMPT } from '@/lib/socria-prompt';
import { checkRateLimit, trackUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INPUT_LEN = 8000;
const MAX_HISTORY_MESSAGES = 30;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const conversationId: unknown = body?.conversationId;
    const content: unknown = body?.content;

    // ----- Validate input -----
    if (typeof conversationId !== 'string' || !conversationId) {
      return NextResponse.json(
        { error: 'conversationId required' },
        { status: 400 }
      );
    }
    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }
    if (content.length > MAX_INPUT_LEN) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_INPUT_LEN} chars).` },
        { status: 400 }
      );
    }

    // ----- Rate limit -----
    const rl = await checkRateLimit(userId);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `You've reached today's limit (${rl.used}/${rl.limit}). Come back tomorrow — or upgrade soon.`,
        },
        { status: 429 }
      );
    }

    const db = getSupabaseAdmin();

    // ----- Verify ownership -----
    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('id, user_id, title')
      .eq('id', conversationId)
      .maybeSingle();

    if (convErr || !conv) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    if (conv.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ----- Persist the user message -----
    const userText = content.trim();
    const { error: insertErr } = await db.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userText,
    });
    if (insertErr) {
      console.error('insert user msg:', insertErr);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    // ----- Pull recent history -----
    const { data: history } = await db
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    const recent = (history || []).slice(-MAX_HISTORY_MESSAGES);

    // ----- Compose OpenAI request -----
    const openai = getOpenAI();
    const messages = [
      { role: 'system' as const, content: SOCRIA_SYSTEM_PROMPT },
      ...recent.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
      // Socria responses are intentionally short.
      max_tokens: 500,
      stream: true,
    });

    const encoder = new TextEncoder();
    let assistantText = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              assistantText += delta;
              controller.enqueue(encoder.encode(delta));
            }
          }
        } catch (e) {
          console.error('stream error:', e);
          controller.enqueue(
            encoder.encode('\n\n[Connection interrupted. Please try again.]')
          );
        } finally {
          controller.close();

          // Persist the assistant message + bump conversation
          try {
            if (assistantText.trim()) {
              await db.from('messages').insert({
                conversation_id: conversationId,
                role: 'assistant',
                content: assistantText,
              });
            }

            // If conversation still has the default title and this was the
            // first user message, set a title from the first ~60 chars.
            if (conv.title === 'New thought session') {
              const newTitle = userText.slice(0, 60).replace(/\s+/g, ' ').trim();
              if (newTitle) {
                await db
                  .from('conversations')
                  .update({ title: newTitle })
                  .eq('id', conversationId);
              }
            } else {
              // touch updated_at
              await db
                .from('conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', conversationId);
            }

            // Track usage
            const tokens =
              estimateTokens(userText) + estimateTokens(assistantText);
            await trackUsage(userId, tokens);
          } catch (e) {
            console.error('post-stream persistence:', e);
          }
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
  } catch (e) {
    console.error('chat route error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
