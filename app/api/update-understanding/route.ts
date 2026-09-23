// app/api/update-understanding/route.ts
// POST /api/update-understanding
// Body: { understanding, memory, title, messages }
// Returns: { understanding } — the user's updated cross-conversation
// thinking journey (narrative + open threads + timeline).
//
// Called by the client every few Core 3.1 turns, after memory extraction.
// Uses a cheap model; timestamps are stamped server-side so the model can
// never invent dates. Auth matches the other Core 3 routes: Clerk session
// OR the typed access key.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import {
  EMPTY_UNDERSTANDING,
  buildJourneyExtractorPrompt,
  sanitizeUserUnderstanding,
  sanitizeMemory,
  renderMemoryForPrompt,
  isValidAccessKey,
  type UserUnderstanding,
} from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import {
  MAX_RETIRE_PER_PASS,
  entryAliases,
  mergeEntries,
  resolveAliases,
  sanitizeIncoming,
  scoreEntry,
  type MemoryEntry,
} from '@/lib/person-memory';

/**
 * How many known entries the extractor is shown.
 *
 * A member can hold 160. Listing all of them on every pass is a prompt that
 * grows with the person, and the extractor only needs enough to recognise a
 * repeat or a reversal — the strongest sixty are where those live.
 */
const EXTRACTOR_ENTRIES = 60;

/**
 * The understanding the server holds for this account, or null when there is
 * no row (or no database) — in which case the client's copy is the only one.
 *
 * THE SERVER OWNS THE ENTRIES. The client syncs its journey with a whole
 * jsonb replacement, so any client — a stale tab, an older bundle, the Logos
 * tab beside a Core tab — could otherwise post its own copy and wipe or
 * resurrect what another pass had just learned or forgotten. So the merge
 * happens into the ROW, and the row is what comes back.
 */
type ServerRead =
  | { ok: true; understanding: UserUnderstanding }
  /** the store could not answer — NOT the same thing as "no row" */
  | { ok: false };

async function readServerUnderstanding(userId: string): Promise<ServerRead> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('user_profiles')
      .select('understanding')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { ok: false };
    return {
      ok: true,
      understanding: sanitizeUserUnderstanding(
        (data as { understanding?: unknown } | null)?.understanding
      ),
    };
  } catch {
    return { ok: false };
  }
}

async function writeServerUnderstanding(userId: string, u: UserUnderstanding): Promise<void> {
  try {
    await supabaseAdmin()
      .from('user_profiles')
      .upsert({ user_id: userId, understanding: u, updated_at: Date.now() }, { onConflict: 'user_id' });
  } catch (e) {
    console.error('update-understanding: could not write', e);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RECENT_MESSAGES = 8;

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
  // The row when there is one; the client's copy only when there is not.
  //
  // A read that FAILED is not an empty row. Treating it as one would take the
  // client's entries and tombstones — possibly a stale device that has not
  // heard about something forgotten elsewhere — and write them back as the
  // truth, resurrecting the forgotten entry and erasing its tombstone. So a
  // failed read ends the pass; the next turn tries again.
  const fromClient = sanitizeUserUnderstanding(body?.understanding);
  let current: UserUnderstanding = fromClient;
  if (userId) {
    const read = await readServerUnderstanding(userId);
    if (!read.ok) {
      return NextResponse.json({ understanding: fromClient });
    }
    const held = read.understanding;
    current = {
      // Journey fields: whichever is newer — the client may be a turn ahead.
      ...(fromClient.updatedAt > held.updatedAt ? fromClient : held),
      // Entries and tombstones: always the server's.
      entries: held.entries,
      forgotten: held.forgotten,
    };
  }
  const memory = sanitizeMemory(body?.memory);
  const title =
    typeof body?.title === 'string' ? body.title.slice(0, 120) : null;
  const surface: 'core' | 'logos' = body?.surface === 'logos' ? 'logos' : 'core';
  const conversationId =
    typeof body?.conversationId === 'string' ? body.conversationId.slice(0, 80) : '';
  // Reflective conversations teach the memory things that must never reach
  // Logos, whose map can be saved as a picture. Core's read comes from the
  // thread extractor; Logos's from the map.
  const privateSource =
    memory.context === 'reflecting' || body?.mapContext === 'reflecting';
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const recent = messages
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .slice(-MAX_RECENT_MESSAGES)
    .map(
      (m: any) =>
        `${m.role === 'user' ? 'User' : 'Socria'}: ${m.content.slice(0, 800)}`
    )
    .join('\n');

  if (!recent) {
    return NextResponse.json({ understanding: current });
  }

  // A conversation the person is working something personal through teaches
  // this memory nothing it may carry. The entries were already kept out of
  // Logos by their `private` flag — but the NARRATIVE and the open threads
  // are rewritten from the same words and go into Logos whole, so marking the
  // entries was only half the boundary. The whole pass stands down.
  if (privateSource) {
    return NextResponse.json({ understanding: current, skipped: 'private' });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const model =
      process.env.OPENAI_JOURNEY_MODEL ||
      process.env.OPENAI_MEMORY_MODEL ||
      'gpt-4o-mini';
    const now0 = Date.now();
    const shown: MemoryEntry[] = [...current.entries]
      .sort((a, b) => scoreEntry(b, now0) - scoreEntry(a, now0))
      .slice(0, EXTRACTOR_ENTRIES);
    const aliases = entryAliases(shown);
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      // Raised from 1000: the response now carries entries as well as the
      // journey, and a truncated JSON threw the whole pass away.
      max_tokens: 1600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildJourneyExtractorPrompt(
            { ...current, entries: shown },
            title,
            renderMemoryForPrompt(memory),
            recent,
            surface
          ),
        },
      ],
    });

    if (completion.choices?.[0]?.finish_reason === 'length') {
      console.warn('update-understanding: output truncated (length)');
    }
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return NextResponse.json({ understanding: current });

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ understanding: current });
    }

    // Shape precondition for accepting a full replacement: a valid extractor
    // response always carries a narrative array. Anything else (wrong keys,
    // wrong types, {}) must NOT be allowed to wipe the accumulated journey —
    // a single bad model response would otherwise propagate an empty journey
    // to every device via newest-wins sync.
    if (!Array.isArray(parsed?.narrative)) {
      return NextResponse.json({ understanding: current });
    }

    // The pass's own reading of what it just read. The thread memory's
    // context is the signal above, and on the free tier it goes stale: a
    // thread stops being extracted from at twelve turns, so a conversation
    // that turns personal at turn sixteen still reports whatever it was
    // before. This one cannot be stale — it is about the exchange in the
    // prompt — and a "reflecting" answer discards the pass entirely, exactly
    // as the prior signal does.
    if (typeof parsed?.context === 'string' && parsed.context.trim().toLowerCase() === 'reflecting') {
      return NextResponse.json({ understanding: current, skipped: 'private' });
    }

    const now = Date.now();

    const draft = sanitizeUserUnderstanding({
      narrative: parsed.narrative,
      openThreads: parsed?.openThreads,
      // A full replacement, deliberately: these are proposals about what is
      // pending NOW, and a stale one is worse than none. If this pass has
      // nothing to suggest, the chips fall back to the written openings
      // rather than offering a question the person has already answered.
      nextQuestions: parsed?.nextQuestions,
      timeline: current.timeline,
      updatedAt: now,
    });

    // Regression guard: never replace real content with emptiness.
    if (
      (current.narrative.length > 0 || current.openThreads.length > 0) &&
      draft.narrative.length === 0 &&
      draft.openThreads.length === 0
    ) {
      return NextResponse.json({ understanding: current });
    }

    // Open threads: only threads this conversation actually engaged
    // ("touched") get restamped; untouched carried-over threads keep their
    // previous wording and lastTouched so relative ages ("12 days ago")
    // stay honest instead of collapsing to "earlier today".
    const rawThreads = Array.isArray(parsed?.openThreads) ? parsed.openThreads : [];
    draft.openThreads = draft.openThreads.map((t, i) => {
      const touched = rawThreads[i]?.touched !== false;
      const prev = current.openThreads.find(
        (p) => p.topic.trim().toLowerCase() === t.topic.trim().toLowerCase()
      );
      if (prev && !touched) {
        return { ...prev };
      }
      return { ...t, lastTouched: now };
    });

    // Timeline: append at most one new server-stamped event, deduped.
    const ev =
      typeof parsed?.newTimelineEvent === 'string'
        ? parsed.newTimelineEvent.replace(/\s+/g, ' ').trim().slice(0, 160)
        : '';
    if (
      ev &&
      !/^null$/i.test(ev) &&
      !current.timeline.some(
        (e) => e.event.toLowerCase() === ev.toLowerCase()
      )
    ) {
      draft.timeline = [...current.timeline, { at: now, event: ev }].slice(-14);
    }

    // The durable entries. Only when the response carries the array at all —
    // the same shape guard as `narrative` above — and only through the
    // deterministic merge: proposals are cleaned, handles are mapped back to
    // ids (an unknown handle is dropped), a pass may retire at most a few,
    // and anything the person asked us to forget is refused by its tombstone.
    let entries = current.entries;
    if (Array.isArray(parsed?.newEntries)) {
      entries = mergeEntries(
        current.entries,
        sanitizeIncoming(parsed.newEntries, 4),
        resolveAliases(parsed.retire, aliases, MAX_RETIRE_PER_PASS),
        {
          now,
          reinforceIds: resolveAliases(parsed.reinforce, aliases, 20),
          source: conversationId ? { surface, conversationId } : undefined,
          forgotten: current.forgotten,
        }
      );
    }

    const understanding: UserUnderstanding = {
      ...draft,
      entries,
      forgotten: current.forgotten,
      updatedAt: now,
    };
    if (userId) await writeServerUnderstanding(userId, understanding);
    return NextResponse.json({ understanding });
  } catch (e) {
    console.error('update-understanding error:', e);
    return NextResponse.json({ understanding: current ?? EMPTY_UNDERSTANDING });
  }
}
