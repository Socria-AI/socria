// Run one scenario through one arm.
//
// CORE 4 arm: the real chat route, in process, with every model call going
// through the installed client. Sessions are separate conversations for the
// same person, so the Mind Graph, the reasoning ledger and everything else
// Core 4 keeps across time is exercised exactly as it would be in use.
//
// BASELINE arm: the same model, the strongest Human-First system prompt we
// could write (evals/core4/baseline-prompt.md), and ordinary memory — the
// conversation itself, plus the full transcripts of earlier sessions. That
// is a generous memory, stronger than most shipped assistants have: the
// baseline is not allowed to lose because it forgot.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const here = new URL('.', import.meta.url).pathname;
export const BASELINE_PROMPT = readFileSync(join(here, '..', 'baseline-prompt.md'), 'utf8');

const DAY = 86_400_000;

async function settle(db, calls, world) {
  let last = -1;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 15));
    const n = db.log.length + calls.length;
    if (n === last) return;
    last = n;
  }
}

function seedProject(db, userId, project, now) {
  const nodeId = `n-${project.id}`;
  db.rows('mind_nodes').push({
    user_id: userId, id: nodeId, type: 'Project', label: project.name, content: project.description ?? '',
    aliases: [], status: 'active', confidence: 1, certainty: 1, importance: 0.8, activation: 0.2, seen: 1,
    private: false, provenance: [{ kind: 'stated', surface: 'user', at: now }], created_at: now, updated_at: now,
    last_accessed: now,
  });
  db.rows('mind_projects').push({
    user_id: userId, id: project.id, node_id: nodeId, name: project.name, description: project.description ?? '',
    instructions: project.instructions ?? '', archived: false, created_at: now, updated_at: now,
  });
}

/**
 * @returns {{status: 'done'|'pending'|'error', sessions: object[], pending?: string[], error?: string}}
 */
export async function runCore4(scenario, { routePath, db, step, world }) {
  const chat = await import(pathToFileURL(routePath).href);
  const { NextRequest } = await import('next/server.js');
  db.reset();
  const userId = `eval-${scenario.id}`;
  globalThis.__uid = userId;
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'eval';
  process.env.RATE_LIMIT_DISABLED = '1';
  if (scenario.project) seedProject(db, userId, scenario.project, Date.now());

  const out = [];
  for (let si = 0; si < scenario.sessions.length; si++) {
    const session = scenario.sessions[si];
    const conversationId = `${scenario.id}-s${si + 1}`;
    const messages = [];
    const turns = [];
    for (const t of session.turns) {
      messages.push({ role: 'user', content: t.user, ...(t.attachments ? { attachments: t.attachments } : {}) });
      globalThis.__socriaTrace = [];
      const req = new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'core-4',
          messages,
          conversationId,
          ...(scenario.project ? { projectId: scenario.project.id } : {}),
        }),
      });
      let reply = '';
      let status = 0;
      try {
        const r = await chat.POST(req);
        status = r.status;
        reply = await r.text();
      } catch (e) {
        if (!step.pending.length) return { status: 'error', sessions: out, error: String(e?.stack || e) };
      }
      await settle(db, step.calls, world);
      if (step.pending.length) return { status: 'pending', sessions: out, pending: [...new Set(step.pending)] };
      if (status !== 200) return { status: 'error', sessions: out, error: `route returned ${status}: ${reply.slice(0, 400)}` };
      messages.push({ role: 'assistant', content: reply });
      turns.push({ user: t.user, reply, trace: globalThis.__socriaTrace?.[0] ?? null, expect: t.expect ?? null });
      world.advance(90_000);
    }
    out.push({ conversationId, turns });
    world.advance(7 * DAY);
  }
  return { status: 'done', sessions: out };
}

/**
 * The B+ critique pass (council D16: the PRIMARY comparator). The same model
 * reviews its own draft once against the same Human-First rubric and
 * returns the revised reply — the strongest thing a prompt-only system can
 * do for the price of one extra call, which is what Core 4's extra calls
 * are competing with.
 */
const CRITIQUE_PROMPT = `You are reviewing your own draft reply before the person sees it. Check it against these rules and return ONLY the final reply text (revised if needed, unchanged if it already complies):
- If they asked for the answer, a fix, a calculation or information, it gives it directly and first.
- It holds back an answer only if they said they want to work it out themselves; even then it says whether their attempt is right and where it goes wrong.
- At most one question, and only if genuinely needed; no "does that make sense?", no closing offers, no question just to keep things going.
- It does not raise, as new, anything they already considered; it adds something they have not.
- No praise, no filler, no claim to have searched or run anything.
Do not mention this review.`;

// Equal token ceilings for every arm (council D16): Core 4's largest move
// budget, so no arm wins or loses on length allowance.
export const ARM_MAX_TOKENS = 1200;

export async function runBaseline(scenario, { step, world, model = 'eval-model', critique = false }) {
  const client = globalThis.__socriaModelClient;
  const out = [];
  const history = [];
  for (let si = 0; si < scenario.sessions.length; si++) {
    const session = scenario.sessions[si];
    const messages = [];
    const turns = [];
    const memory = history.length
      ? '\n\nMEMORY FROM EARLIER SESSIONS WITH THIS PERSON (verbatim transcripts):\n' +
        history
          .map((h, i) => `--- Session ${i + 1} ---\n` + h.map((m) => `${m.role === 'user' ? 'Person' : 'You'}: ${m.content}`).join('\n'))
          .join('\n\n')
      : '';
    const project = scenario.project
      ? `\n\nTHIS CONVERSATION IS IN THE PROJECT "${scenario.project.name}". The person's instructions for it: ${scenario.project.instructions || '(none)'}`
      : '';
    for (const t of session.turns) {
      const content = t.attachments?.length
        ? `${t.user}\n\n${t.attachments.map((a) => `[Attached ${a.kind === 'image' ? 'image' : 'file'} "${a.name}"]\n${a.text ?? a.reading ?? ''}`).join('\n\n')}`
        : t.user;
      messages.push({ role: 'user', content });
      let reply;
      try {
        const c = await client.complete({
          role: 'baseline',
          model,
          system: BASELINE_PROMPT + project + memory,
          messages,
          maxTokens: ARM_MAX_TOKENS,
          temperature: 0.7,
        });
        reply = c.text;
        if (critique) {
          const r = await client.complete({
            role: 'baseline',
            model,
            system: CRITIQUE_PROMPT,
            messages: [...messages, { role: 'assistant', content: reply }, { role: 'user', content: '[Review the draft above per your instructions and return only the final reply.]' }],
            maxTokens: ARM_MAX_TOKENS,
            temperature: 0.3,
          });
          reply = r.text;
        }
      } catch (e) {
        if (step.pending.length) return { status: 'pending', sessions: out, pending: [...new Set(step.pending)] };
        return { status: 'error', sessions: out, error: String(e?.stack || e) };
      }
      messages.push({ role: 'assistant', content: reply });
      turns.push({ user: t.user, reply, trace: null, expect: t.expect ?? null });
      world.advance(90_000);
    }
    history.push(messages);
    out.push({ conversationId: `${scenario.id}-s${si + 1}`, turns });
    world.advance(7 * DAY);
  }
  return { status: 'done', sessions: out };
}
