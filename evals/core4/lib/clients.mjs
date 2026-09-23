// Model clients for the Core 4 evaluation harness.
//
// STEPWISE. Completions come from outside the process. The first time the
// pipeline needs a completion it does not have, the client writes the full
// request to <run>/pending/<key>.json and throws. Whoever is standing in for
// the model — an engineer, or a subagent playing the model role exactly as
// the request describes — writes the completion to <run>/cache/<key>.txt and
// the scenario is replayed from the start. Everything already answered is
// served from the cache, so each replay gets one step further. Keys hash the
// role, the system prompt and the messages, so the SAME request is answered
// the same way wherever it appears, and nothing about which arm or scenario
// asked leaks into the key.
//
// LIVE. No client is installed and the pipeline uses its production client
// (OpenAI via OPENAI_API_KEY). Use this whenever a key is available; it is
// the only mode whose outputs are the production model's own.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class PendingModelCall extends Error {
  constructor(key, file) {
    super(`model call ${key} is pending: ${file}`);
    this.name = 'PendingModelCall';
    this.key = key;
    this.file = file;
  }
}

export function requestKey(req, arm = '') {
  const h = createHash('sha256');
  h.update(JSON.stringify({ arm, role: req.role, system: req.system, messages: req.messages, json: !!req.json }));
  return `${arm ? `${arm}.` : ''}${req.role}-${h.digest('hex').slice(0, 20)}`;
}

/**
 * `arm` namespaces the cache (run 1 lesson): A1 and B+ send an identical
 * first request, so without it two players answering the same key at once
 * overwrote each other and some transcripts mixed turns from both.
 */
export function stepwiseClient(runDir, arm = '') {
  const cacheDir = join(runDir, 'cache');
  const pendingDir = join(runDir, 'pending');
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(pendingDir, { recursive: true });
  const pending = [];
  const calls = [];

  const lookup = (req) => {
    const key = requestKey(req, arm);
    const hit = join(cacheDir, `${key}.txt`);
    calls.push({ role: req.role, key, cached: existsSync(hit) });
    if (existsSync(hit)) return { key, text: readFileSync(hit, 'utf8') };
    const file = join(pendingDir, `${key}.json`);
    // Only the FIRST missing completion of a replay is real. Anything the
    // pipeline asks for after it was computed from a fallback (a state read
    // that "failed" because it was pending), so its request would change once
    // the first is answered — writing it would only waste an answer.
    if (pending.length) {
      calls[calls.length - 1].blocked = true;
      throw new PendingModelCall(key, null);
    }
    if (!existsSync(file)) {
      writeFileSync(
        file,
        JSON.stringify(
          {
            key,
            role: req.role,
            json: !!req.json,
            maxTokens: req.maxTokens,
            temperature: req.temperature,
            model: req.model,
            system: req.system,
            messages: req.messages,
            answerTo: join(cacheDir, `${key}.txt`),
          },
          null,
          2
        )
      );
    }
    pending.push(file);
    throw new PendingModelCall(key, file);
  };

  return {
    pending,
    calls,
    client: {
      async complete(req) {
        const { text } = lookup(req);
        return { text, served: 'stepwise' };
      },
      stream(req) {
        let hit;
        try {
          hit = lookup(req);
        } catch (e) {
          const done = Promise.reject(e);
          done.catch(() => {});
          return {
            deltas: (async function* () {
              throw e;
            })(),
            done,
          };
        }
        return {
          deltas: (async function* () {
            yield hit.text;
          })(),
          done: Promise.resolve({ text: hit.text, served: 'stepwise' }),
        };
      },
    },
  };
}

/** A deterministic clock and random source, so replays are identical. */
export function freezeWorld(start = Date.UTC(2026, 8, 1, 12, 0, 0)) {
  let now = start;
  const realNow = Date.now;
  Date.now = () => (now += 7);
  let seed = 0x9e3779b9;
  const realRandom = Math.random;
  Math.random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };
  return {
    advance(ms) {
      now += ms;
    },
    restore() {
      Date.now = realNow;
      Math.random = realRandom;
    },
  };
}
