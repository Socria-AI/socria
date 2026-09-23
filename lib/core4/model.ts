// lib/core4/model.ts
//
// The one seam between Core 4 and whichever frontier model it runs on.
//
// Every model call on a Core 4 turn — reading the state, generating the
// reply, the guard, verification, memory extraction — goes through
// `modelClient()`. Two reasons it is a seam and not a scattering of SDK calls:
//
//   MODEL SWAP. The thesis test "does Socria stay Socria on another model"
//   needs the provider behind one interface. Swapping it is this file.
//
//   EVALUATION. The Human-First eval harness (evals/core4) runs the REAL turn
//   pipeline with a client it supplies — a live provider, or a stepwise client
//   whose completions are produced elsewhere. Nothing in the pipeline knows or
//   cares which, so what is evaluated is what ships.
//
// The default client is OpenAI, configured exactly as the route configured
// it before this seam existed, so production behaviour does not move.

import OpenAI from 'openai';

/** Which step of the turn a call belongs to — for logging, caching and evals. */
export type ModelRole = 'state' | 'reply' | 'retry' | 'guard' | 'verify' | 'extract' | 'baseline';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompleteRequest {
  role: ModelRole;
  model: string;
  system: string;
  messages: ChatTurn[];
  /** ask for a JSON object back */
  json?: boolean;
  maxTokens: number;
  temperature: number;
}

export interface Completion {
  text: string;
  /** the model that actually served the call, when the provider says */
  served?: string;
  finishReason?: string;
}

export interface ModelClient {
  complete(req: CompleteRequest): Promise<Completion>;
  /** Stream text deltas. The final Completion (served model, finish reason) is resolved at the end. */
  stream(req: CompleteRequest): { deltas: AsyncIterable<string>; done: Promise<Completion> };
}

// ── OpenAI (production) ─────────────────────────────────────────────

export function openAIClient(apiKey: string): ModelClient {
  const openai = new OpenAI({ apiKey });
  const toMessages = (req: CompleteRequest) => [
    { role: 'system' as const, content: req.system },
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  return {
    async complete(req) {
      const res = await openai.chat.completions.create({
        model: req.model,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        ...(req.json ? { response_format: { type: 'json_object' as const } } : {}),
        messages: toMessages(req),
      });
      return {
        text: res.choices?.[0]?.message?.content ?? '',
        served: (res as { model?: string }).model,
        finishReason: res.choices?.[0]?.finish_reason ?? undefined,
      };
    },
    stream(req) {
      let resolveDone!: (c: Completion) => void;
      let rejectDone!: (e: unknown) => void;
      const done = new Promise<Completion>((res, rej) => {
        resolveDone = res;
        rejectDone = rej;
      });
      // Swallow unhandled rejection noise when the caller only reads deltas.
      done.catch(() => {});
      const deltas = (async function* () {
        let text = '';
        let served: string | undefined;
        let finishReason: string | undefined;
        try {
          const s = await openai.chat.completions.create({
            model: req.model,
            temperature: req.temperature,
            max_tokens: req.maxTokens,
            stream: true,
            messages: toMessages(req),
          });
          for await (const chunk of s as AsyncIterable<any>) {
            served ||= chunk?.model;
            finishReason = chunk?.choices?.[0]?.finish_reason ?? finishReason;
            const d = chunk?.choices?.[0]?.delta?.content ?? '';
            if (d) {
              text += d;
              yield d;
            }
          }
          resolveDone({ text, served, finishReason });
        } catch (e) {
          rejectDone(e);
          throw e;
        }
      })();
      return { deltas, done };
    },
  };
}

// ── selection ───────────────────────────────────────────────────────

/**
 * A client installed by an evaluation harness. Server code never sets this;
 * it exists so evals/core4 can run the real pipeline against a model it
 * controls. Read at call time, so installing it after import works.
 */
declare global {
  // eslint-disable-next-line no-var
  var __socriaModelClient: ModelClient | undefined;
}

export function modelClient(apiKey: string): ModelClient {
  // An installed client is honoured only outside production (council D15).
  if (process.env.NODE_ENV !== 'production' && globalThis.__socriaModelClient) return globalThis.__socriaModelClient;
  return openAIClient(apiKey);
}

/** Read the whole of a stream into one Completion (for callers that need the full draft). */
export async function collect(s: { deltas: AsyncIterable<string>; done: Promise<Completion> }): Promise<Completion> {
  let text = '';
  for await (const d of s.deltas) text += d;
  const c = await s.done.catch(() => ({ text }) as Completion);
  return { ...c, text: c.text || text };
}
