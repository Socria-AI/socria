// app/api/logos/challenge/route.ts
// POST /api/logos/challenge → { challenge }
//
// WHAT AM I MISSING? (Logos 6, Phase 1; lib/challenge/). One engine for every way of asking: words, the chip, a
// card's "Challenge it", a selection, a document. Reads the person's own words in this line, their map, the
// passages of their documents the browser sends (readings live in the browser), and — signed in — any earlier
// position memory holds that this line seems to cut against. The structure's findings are found in code first;
// the model is asked for findings with exact quotes; every one goes through the gate (challenge-gate.ts) before
// it leaves: no quote that holds, no finding. Nothing passes: it holds up on what is here.
//
// If no model answers — no key, a refusal down the whole ladder — the structure answers alone, plainer and never
// less honest, and says that is all it could check. Resting (the week or the trial's day spent) is said as Sleep
// Mode, as on every route that asks a model for the person.
// Nothing here writes to the map: a finding becomes a card only when the person keeps it.
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { chooseAuxModel, firstAccepted, tierOf } from '@/lib/model-router';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote } from '@/lib/entitlements';
import { spend } from '@/lib/usage';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';
import { LOGOS_MODEL, sanitizeMap } from '@/lib/logos';
import { coverage } from '@/lib/docs/text';
import { weightOf } from '@/lib/logos6/support';
import { CHALLENGE_SCOPES, FINDING_KINDS, LIMITS, challengeId, type Challenge, type ChallengeScopeKind, type FindingKind } from '@/lib/challenge/challenge';
import { scopeIds, structureFindings } from '@/lib/challenge/challenge-targets';
import { gate, type GateMaterial } from '@/lib/challenge/challenge-gate';
import { CHALLENGE_SYSTEM, challengeUser } from '@/lib/challenge/challenge-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SAID = 14;
const MAX_SOURCES = 8;
const REF = /^[A-Za-z0-9_.:-]{1,80}$/;
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Earlier positions memory holds that this line cuts against: the other side of a conflict it recorded here. */
async function earlierFor(userId: string, conversationId: string | null, lineText: string): Promise<{ id: string; text: string }[]> {
  if (!conversationId || !lineText.trim()) return [];
  try {
    const [{ loadGraph }, { changesOf }] = await Promise.all([import('@/lib/mind/store'), import('@/lib/mind/evolve')]);
    const graph = await loadGraph(userId);
    const out: { id: string; text: string }[] = [];
    for (const c of changesOf(graph, { excludePrivate: true, here: conversationId, withAffected: false, limit: 60 })) {
      if ((c.kind !== 'conflict' && c.kind !== 'possible-conflict') || c.review === 'rejected') continue;
      const a = c.from.content || c.from.label;
      const b = c.to.content || c.to.label;
      // the side this line says is "here"; the other is what they held before
      const here = coverage(a, lineText) >= coverage(b, lineText) ? 'from' : 'to';
      const other = here === 'from' ? c.to : c.from;
      const text = str(other.content || other.label, 400);
      if (text && Math.max(coverage(a, lineText), coverage(b, lineText)) >= 0.3 && !out.some((x) => x.id === other.id)) out.push({ id: other.id, text });
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    // memory is a help here, never a dependency
    return [];
  }
}

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const body = await req.json().catch(() => null);

  const map = sanitizeMap(body?.map, { trust: 'stored' });
  const sk = CHALLENGE_SCOPES.includes(body?.scope?.kind) ? (body.scope.kind as ChallengeScopeKind) : 'line';
  const ids: string[] = (Array.isArray(body?.scope?.ids) ? body.scope.ids : []).filter((x: unknown): x is string => typeof x === 'string' && REF.test(x)).slice(0, 40);
  const docName = str(body?.scope?.doc, 120);
  const scope = { kind: sk, ...(ids.length ? { ids } : {}) };
  const lean: FindingKind[] = (Array.isArray(body?.lean) ? body.lean : []).filter((k: unknown): k is FindingKind => FINDING_KINDS.includes(k as FindingKind)).slice(0, 3);
  const sessionId = typeof body?.sessionId === 'string' && REF.test(body.sessionId) ? body.sessionId : null;

  // their own words, with the ids a quote can point at; Socria's last reply for context only
  const msgs: { id?: unknown; role?: unknown; content?: unknown }[] = Array.isArray(body?.messages) ? body.messages.slice(-60) : [];
  const said = msgs
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m && m.role === 'user' && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_SAID)
    .map(({ m, i }) => ({ id: typeof m.id === 'string' && REF.test(m.id) ? m.id : `m${i}`, text: String(m.content).slice(0, 4000) }));
  const replies = msgs.filter((m) => m && m.role === 'assistant' && typeof m.content === 'string').map((m) => String(m.content).slice(0, 1500)).slice(-3);
  const sources = (Array.isArray(body?.sources) ? body.sources : [])
    .filter((s: any) => s && typeof s.key === 'string' && /^[A-Z]\d{1,4}\.\d{1,5}$/.test(s.key) && typeof s.text === 'string' && s.text.trim())
    .slice(0, MAX_SOURCES)
    .map((s: any) => ({
      key: s.key as string,
      text: String(s.text).slice(0, 1600),
      ...(typeof s.doc === 'string' && REF.test(s.doc) ? { doc: s.doc } : {}),
      ...(typeof s.block === 'string' && REF.test(s.block) ? { block: s.block } : {}),
      ...(typeof s.name === 'string' ? { name: str(s.name, 80) } : {}),
    }));
  const considered: string[] = (Array.isArray(body?.considered) ? body.considered : []).filter((x: unknown): x is string => typeof x === 'string').map((x: string) => x.slice(0, 300)).slice(-80);
  const guessIn = body?.guess && typeof body.guess === 'object' ? { id: typeof body.guess.id === 'string' && REF.test(body.guess.id) ? body.guess.id : undefined, label: str(body.guess.label, LIMITS.label) } : null;

  if (!said.length && !map.nodes.length && !sources.length) {
    return NextResponse.json({ error: 'There is nothing here to check yet. Say what you are thinking, and ask again.' }, { status: 400 });
  }

  const structural = structureFindings(map, scope);
  const within = scopeIds(map, scope);
  const ideas = map.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label, ...(n.detail ? { detail: n.detail } : {}) }));
  const lineText = said.map((s) => s.text).join('\n');
  const earlier = userId ? await earlierFor(userId, sessionId, lineText) : [];
  const material: GateMaterial = {
    said,
    replies,
    ideas,
    sources,
    earlier,
    considered,
    structural,
    weightOf: (id) => weightOf(map, id),
  };
  const at = Date.now();
  const files = new Set(sources.map((s: { key: string }) => s.key[0])).size;
  const base = (findings: Challenge['findings'], extra: Partial<Challenge> = {}): Challenge => {
    const guess = guessIn?.label
      ? { label: guessIn.label, ...(guessIn.id ? { id: guessIn.id } : {}), hit: !!guessIn.id && findings.some((f) => f.target === guessIn.id || f.anchors.some((a) => a.ref === guessIn.id)) }
      : undefined;
    return {
      id: challengeId(at),
      at,
      scope: { kind: sk, ...(ids.length ? { ids } : {}), ...(docName ? { doc: docName } : {}) },
      findings,
      holds: !findings.length,
      checked: { turns: said.length, ideas: map.nodes.length, files, earlier: earlier.length },
      ...(guess ? { guess } : {}),
      ...extra,
    };
  };
  const fromStructure = (): Challenge => {
    const { findings } = gate(null, material, { lean });
    return base(findings, {
      structural: true,
      ...(findings.length ? {} : { why: 'Nothing on the map is unsupported or in conflict — and without a model to read your words, that is all this could check.' }),
    });
  };

  const plan = await resolvePlanForRequest(req, userId);
  // counted, and uncapped on both plans, as Explore's challenge always was (app/api/logos/explore)
  const allowance = await spend(userId, plan, 'challenge', sessionId);
  if (!allowance.ok) {
    return NextResponse.json({ error: boundaryNote('challenge'), upgrade: 'challenge', used: allowance.used, limit: allowance.limit }, { status: 402 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ challenge: fromStructure() });

  try {
    // THE WEEK'S TOKENS, and the trial's day (lib/sleep-server.ts): spent, it rests — said as Sleep Mode, as every
    // route that asks a model for the person says it; awake, every call this request makes is metered
    const sleep = await sleepGate(req, userId, plan);
    if (sleep.refuse) return sleep.refuse;
    if (sleep.meter) meterFor(sleep.meter);
    const openai = tracked(new OpenAI({ apiKey }), 'logos/challenge');
    // by tier (lib/model-router.ts): One on its standard model, the trial on its light one, a guest on the smallest
    const routed = chooseAuxModel(tierOf(userId, plan), 'standard', process.env, process.env.OPENAI_MODEL_LOGOS_CHALLENGE || process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL);
    const user = challengeUser({
      said: said.map((s, i) => ({ id: s.id.startsWith('m') && /^m\d+$/.test(s.id) ? s.id : `m${i + 1}`, text: s.text })),
      lastReply: replies[replies.length - 1],
      ideas,
      sources,
      earlier,
      structural,
      focus: {
        kind: sk,
        ...(within && (sk === 'card' || sk === 'selection') ? { labels: map.nodes.filter((n) => ids.includes(n.id)).map((n) => n.label) } : {}),
        ...(docName ? { doc: docName } : {}),
      },
      lean,
    });
    const ask = (model: string) =>
      openai.chat.completions.create({
        model,
        temperature: 0.3,
        max_tokens: 1100,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CHALLENGE_SYSTEM },
          { role: 'user', content: user },
        ],
      });
    const { result: completion } = await firstAccepted(routed.ladder, ask, (from, to, why) => console.warn('logos challenge: %s refused (%s); asking %s', from, why, to));
    const text = completion.choices?.[0]?.message?.content;
    const parsed = text ? JSON.parse(text) : null;
    const { findings } = gate(parsed, material, { lean });
    const why = findings.length ? '' : str(parsed?.why, LIMITS.why);
    const weakest = findings.length ? '' : str(parsed?.weakest, LIMITS.weakest);
    return NextResponse.json({ challenge: base(findings, { ...(why ? { why } : {}), ...(weakest ? { weakest } : {}) }) });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.warn('logos challenge: the model did not answer; answering from structure', e instanceof Error ? e.message : e);
    return NextResponse.json({ challenge: fromStructure() });
  }
});
