// app/api/new-logos/represent/route.ts
// POST { conversationId, message: { id, content }, history?, about?, sourceIds?, docIds? }
//   → { representation, version, log, entry, record, changes, near, alternatives }
//
// THE REPRESENTATION INTELLIGENCE. What the person says on a conversation's canvas is not answered with a message: it
// changes the conversation's REPRESENTATION (lib/new-logos/representation.ts). This reads the turn with what the
// representation already holds, what was said before (including turns made in the other interface and not yet
// represented), what the person is pointing at, and the passages of their documents that bear on it; asks the model
// for operations (lib/new-logos/represent-prompt.ts); reads its answer leniently (represent-model.ts) and applies it
// strictly (representation-ops.ts) as the assistant's, with the person's message taken in. The person's message was
// saved to the conversation before this was asked; the page saves `record` — the turn in words, built from the
// items — as the reply, so the other interface shows the same conversation.
//
// Gated as every route that asks a model for the person: signed in, rate-limited as a chat turn, a new conversation
// counted against the month's conversations as the chat route counts it, the trial's tokens (Sleep Mode), each call
// metered. A second attempt after an unreadable answer is ours, uncounted. Nothing is saved from an answer that
// leaves the representation empty.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { tracked } from '@/lib/openai-usage';
import { chooseAuxModel, firstAccepted, tierOf } from '@/lib/model-router';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { uncounted, withMeter } from '@/lib/token-meter';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { limitOf } from '@/lib/entitlements';
import { chatAlreadyCounted, checkAllowance } from '@/lib/usage';
import { claimUnit, refusal } from '@/lib/quota';
import { enforceRateLimit } from '@/lib/rate-limit';
import { reportUpstream } from '@/lib/upstream-error';
import { LOGOS_MODEL } from '@/lib/logos';
import { bodyUpTo, signedIn, unauthorized } from '@/lib/new-logos/http';
import { NlSetupError } from '@/lib/new-logos/store';
import { statusOf } from '@/lib/new-logos/ops';
import { supabaseRepresentationStore } from '@/lib/new-logos/representation-store-supabase';
import { supabaseSourceStore } from '@/lib/new-logos/source-store-supabase';
import { passagesFor } from '@/lib/new-logos/source-ops';
import { outlineOf } from '@/lib/new-logos/sources';
import { briefOf, clip, recordOf } from '@/lib/new-logos/representation';
import { applyRepOps, valuesOf } from '@/lib/new-logos/representation-ops';
import { readModelOutput } from '@/lib/new-logos/represent-model';
import { REPAIR_NOTE, REPRESENT_SYSTEM, representUser, type TurnContext } from '@/lib/new-logos/represent-prompt';
import { CONVERSATION_ID_RE, assistantTurn, loadRepresentation, logLines } from '@/lib/new-logos/representation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MSG_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const SOURCE_ID_RE = /^s_[A-Za-z0-9]{6,40}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const LIMITS = { said: 12_000, history: 60, message: 4000 } as const;
/** answer within the route's time: every model call gets what is left of this */
const DEADLINE_MS = 52_000;

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export const POST = withMeter(async function POST(req: NextRequest) {
  const started = Date.now();
  const userId = signedIn();
  if (!userId) return unauthorized();
  const limited = await enforceRateLimit(req, userId, 'chat');
  if (limited) return limited;
  const b = await bodyUpTo(req, 400_000);
  if (!b) return NextResponse.json({ ok: false, error: 'That is too long to take in at once.', code: 'limit' }, { status: 413 });

  const convId = typeof b.conversationId === 'string' ? b.conversationId : '';
  const m = obj(b.message);
  const msgId = m && typeof m.id === 'string' && MSG_ID_RE.test(m.id) ? m.id : '';
  const said = m && typeof m.content === 'string' ? m.content.trim() : '';
  if (!CONVERSATION_ID_RE.test(convId) || !msgId || !said) return NextResponse.json({ ok: false, error: 'What should be taken in?', code: 'invalid' }, { status: 400 });
  if (said.length > LIMITS.said) return NextResponse.json({ ok: false, error: 'That is too long to take in at once.', code: 'limit' }, { status: 413 });

  const history = (Array.isArray(b.history) ? b.history : [])
    .slice(-LIMITS.history)
    .map((x) => obj(x))
    .filter((x): x is Record<string, unknown> => !!x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string' && !!(x.content as string).trim())
    .map((x) => ({ id: typeof x.id === 'string' && MSG_ID_RE.test(x.id) ? x.id : '', role: x.role as 'user' | 'assistant', content: (x.content as string).slice(0, LIMITS.message) }))
    .filter((x) => x.id !== msgId);
  const a = obj(b.about);
  const about = a && typeof a.label === 'string' && a.label.trim() ? { label: clip(a.label, 80), of: clip(a.of, 90), lines: (Array.isArray(a.lines) ? a.lines : []).filter((l): l is string => typeof l === 'string').slice(0, 12).map((l) => clip(l, 220)) } : null;
  const sourceIds = (Array.isArray(b.sourceIds) ? b.sourceIds : []).filter((x): x is string => typeof x === 'string' && SOURCE_ID_RE.test(x)).slice(0, 6);
  const docIds = (Array.isArray(b.docIds) ? b.docIds : []).filter((x): x is string => typeof x === 'string' && DOC_ID_RE.test(x)).slice(0, 6);

  const store = supabaseRepresentationStore();
  const key = `c:${convId}`;
  let loaded;
  try {
    if (!(await store.owns(userId, key))) return NextResponse.json({ ok: false, error: 'This conversation is not on this account.', code: 'conversation_unknown' }, { status: 404 });
    const r = await loadRepresentation(store, userId, key);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message, code: r.error.code }, { status: statusOf(r.error.code) });
    loaded = r.value;
  } catch (e) {
    if (e instanceof NlSetupError) return NextResponse.json({ ok: false, setup: false, error: 'Representations are not set up on this database yet.', code: 'setup' }, { status: 503 });
    throw e;
  }
  const rep = loaded.record.rep;

  // what was said and is not yet represented (turns made in the other interface), and the last turns that are
  const untaken: TurnContext['untaken'] = [];
  const recent: TurnContext['recent'] = [];
  const alsoTaken: string[] = [];
  let taken = false;
  for (const h of history) {
    if (h.role === 'user') {
      taken = !!h.id && rep.turns.includes(h.id);
      // read now, so taken in with this turn: it is not shown again as something said and not represented
      if (!taken && h.id) alsoTaken.push(h.id);
    }
    (taken ? recent : untaken).push({ role: h.role, content: h.content });
  }

  const plan = await resolvePlanForRequest(req, userId);
  // the month's conversations: counted once per conversation, at its first turn, as the chat route counts them
  const isNewChat = !rep.turns.length && history.filter((h) => h.role === 'user').length === 0;
  const willCharge = isNewChat && !(await chatAlreadyCounted(userId, convId));
  if (willCharge) {
    const allowance = await checkAllowance(userId, plan, 'chats');
    if (!allowance.ok) {
      const r = refusal('chats', allowance);
      return NextResponse.json(r.body, { status: r.status });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: 'The assistant is not available here.', code: 'unavailable' }, { status: 503 });

  try {
    // THE WEEK'S TOKENS, and the trial's day (lib/sleep-server.ts): spent, it rests — said as Sleep Mode, as every
    // route that asks a model for the person says it; awake, every call this request makes is metered
    const sleep = await sleepGate(req, userId, plan);
    if (sleep.refuse) return sleep.refuse;
    if (sleep.meter) meterFor(sleep.meter);

    // the passages of their documents that bear on what is said (never whole documents)
    let docs: TurnContext['docs'] = [];
    if (sourceIds.length || docIds.length) {
      try {
        const p = await passagesFor(supabaseSourceStore(), userId, { ids: sourceIds, docIds, query: said });
        if (p.ok)
          docs = p.value.docs.map((d, k) => {
            const s = p.value.sources[k];
            const heads = new Set(outlineOf(d, 24).map((h) => h.id));
            return { sourceId: s.id, name: s.name, outline: outlineOf(d, 12).map((h) => h.text), passages: d.blocks.filter((x) => !heads.has(x.id) && x.text.trim()).map((x) => ({ id: x.id, text: x.text })) };
          });
      } catch (e) {
        // documents help; without their table the turn goes on without them
        if (!(e instanceof NlSetupError)) throw e;
      }
    }

    const { values } = valuesOf(rep);
    const user = representUser({ brief: briefOf(rep, values), first: !rep.items.length, untaken, recent: recent.slice(-4), about, docs, said });
    const openai = tracked(new OpenAI({ apiKey }), 'new-logos/represent');
    // by tier (lib/model-router.ts), as the other aux routes choose
    const routed = chooseAuxModel(tierOf(userId, plan), 'standard', process.env, process.env.OPENAI_MODEL_LOGOS_REPRESENT || process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL);
    const warn = (from: string, to: string, why: string) => console.warn('new-logos represent: %s refused (%s); asking %s', from, why, to);
    const ask = (previous?: string) => (model: string) =>
      openai.chat.completions.create(
        {
          model,
          temperature: 0.3,
          max_tokens: 3600,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: REPRESENT_SYSTEM },
            { role: 'user', content: user },
            ...(previous !== undefined ? [{ role: 'assistant' as const, content: previous.slice(0, 8000) || '(nothing)' }, { role: 'user' as const, content: REPAIR_NOTE }] : []),
          ],
        },
        { timeout: Math.max(8000, DEADLINE_MS - (Date.now() - started)), maxRetries: 0 }
      );
    const first = await firstAccepted(routed.ladder, ask(), warn);
    let text = first.result.choices?.[0]?.message?.content ?? '';
    let turn = readModelOutput(text);
    const usable = (t: typeof turn) => t.parsed && applyRepOps(rep, t.ops, { by: 'ai', at: Date.now(), turn: msgId }).rep.items.length > 0 && (t.ops.length > 0 || rep.items.length > 0);
    if (!usable(turn) && Date.now() - started < DEADLINE_MS - 10_000) {
      // our own second attempt: never counted against the person
      const again = await uncounted(() => firstAccepted([first.model], ask(text), warn));
      text = again.result.choices?.[0]?.message?.content ?? '';
      const second = readModelOutput(text);
      if (usable(second)) turn = second;
    }
    if (!usable(turn)) {
      console.warn('new-logos represent: no usable answer (%d operations read, %d unreadable)', turn.ops.length, turn.dropped);
      return NextResponse.json({ ok: false, error: 'The assistant’s answer could not be used. Your message is kept; try again.', code: 'model' }, { status: 502 });
    }

    const r = await assistantTurn(store, userId, key, turn.ops, { at: Date.now(), turn: msgId, read: turn.read, alsoTaken: alsoTaken.slice(-40) });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message, code: r.error.code }, { status: statusOf(r.error.code) });
    if (willCharge && limitOf(plan, 'chats') !== null) {
      // atomic: two first turns racing for the month's last conversation cannot both be counted within it
      const claim = await claimUnit(userId, plan, 'chats', convId);
      if (!claim.ok) console.warn('[quota] a first turn lost the race for the last conversation of the month');
    }
    const { loaded: now, entry, result } = r.value;
    const after = valuesOf(now.record.rep).values;
    return NextResponse.json({
      ok: true,
      representation: now.record.rep,
      version: now.version,
      log: logLines(now.record.log),
      entry: entry ? { id: entry.id, summary: entry.summary, read: entry.read ?? '' } : null,
      record: recordOf(now.record.rep, result.changes, after),
      changes: result.changes,
      near: result.near,
      skipped: result.skipped.length,
      alternatives: turn.alternatives,
      commands: turn.commands,
    });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    if (e instanceof NlSetupError) return NextResponse.json({ ok: false, setup: false, error: 'Representations are not set up on this database yet.', code: 'setup' }, { status: 503 });
    const f = reportUpstream('new-logos/represent', e);
    return NextResponse.json({ ok: false, error: 'The assistant could not take this in just now. Your message is kept; try again.', code: f.code, ref: f.ref }, { status: f.status });
  }
});
