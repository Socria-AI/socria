// WHAT EACH MODEL CALL COST — lib/openai-usage.ts, scripts/token-report.mjs.
//
// What is held down:
//   • every call through a tracked client is logged once, as one line —
//     route, model, tokens read, tokens served from the prompt cache, tokens
//     written — buffered calls from their usage, streamed calls from the usage
//     chunk the stream is asked for at its end;
//   • nothing about the call or its answer changes: the stream is the same
//     object, every chunk reaches the reader, the usage chunk (no choices)
//     passes the readers' `choices?.[0]` untouched;
//   • a provider that refuses `stream_options` gets the call as it was asked;
//     any other refusal is not hidden;
//   • wrapping twice logs once; SOCRIA_TOKEN_LOG=off is silent; no usage, no line;
//   • every model client in the app is a tracked one (the health check aside);
//   • the report totals the lines by route, with the cache's share.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as U from './.tmp/openai-usage.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;

const lines = [];
const info = console.info;
console.info = (...a) => (String(a[0]).startsWith('[tokens]') ? lines.push(String(a[0])) : info(...a));
const logged = () => lines.map((l) => JSON.parse(l.slice('[tokens] '.length)));

function fakeClient(script) {
  const seen = [];
  return {
    seen,
    chat: {
      completions: {
        create: async (p) => {
          seen.push(p);
          const step = script.shift();
          if (step instanceof Error) throw step;
          return typeof step === 'function' ? step(p) : step;
        },
      },
    },
  };
}

console.log('=== a buffered call: one line, from its usage ===');
{
  lines.length = 0;
  const c = U.tracked(fakeClient([{ model: 'gpt-x-2026', usage: { prompt_tokens: 20000, completion_tokens: 600, prompt_tokens_details: { cached_tokens: 19456 } }, choices: [{ message: { content: '{}' } }] }]), 'logos/map');
  const r = await c.chat.completions.create({ model: 'gpt-x', messages: [] });
  ok('the answer is the answer', r.choices[0].message.content === '{}');
  ok('one line: route, the model that served it, in, cached, out', J(logged()) === J([{ route: 'logos/map', model: 'gpt-x-2026', in: 20000, cached: 19456, out: 600 }]), J(logged()));
  ok('the call asked for nothing it did not ask for', J(c.seen[0]) === J({ model: 'gpt-x', messages: [] }));
}

console.log('\n=== a streamed call: the usage chunk asked for, logged at the end ===');
{
  lines.length = 0;
  const gen = async function* () {
    yield { model: 'gpt-x-2026', choices: [{ delta: { content: 'Hel' } }] };
    yield { model: 'gpt-x-2026', choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] };
    yield { model: 'gpt-x-2026', choices: [], usage: { prompt_tokens: 8000, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 6400 }, completion_tokens_details: { reasoning_tokens: 0 } } };
  };
  const stream = gen();
  stream.extra = 'kept';
  const c = U.tracked(fakeClient([stream]), 'logos/chat');
  const s = await c.chat.completions.create({ model: 'gpt-x', stream: true, messages: [] });
  ok('the usage chunk is asked for', J(c.seen[0].stream_options) === J({ include_usage: true }));
  ok('the same stream object comes back, with whatever else it carries', s === stream && s.extra === 'kept');
  let text = '';
  let chunks = 0;
  for await (const ch of s) {
    chunks++;
    text += ch.choices?.[0]?.delta?.content ?? '';
  }
  ok('every chunk reaches the reader, the usage one passing as nothing', chunks === 3 && text === 'Hello');
  ok('logged once, when the stream ended', J(logged()) === J([{ route: 'logos/chat', model: 'gpt-x-2026', in: 8000, cached: 6400, out: 2 }]), J(logged()));
  lines.length = 0;
  const early = U.tracked(fakeClient([gen()]), 'core/chat');
  const s2 = await early.chat.completions.create({ model: 'gpt-x', stream: true, messages: [] });
  for await (const ch of s2) {
    void ch;
    break;
  }
  ok('a reader that stops early logs nothing it does not know', lines.length === 0, J(logged()));
  lines.length = 0;
  const own = U.tracked(fakeClient([gen()]), 'core/chat');
  await own.chat.completions.create({ model: 'gpt-x', stream: true, stream_options: { include_usage: false }, messages: [] });
  ok('stream options a call sets itself are left as they are', J(own.seen[0].stream_options) === J({ include_usage: false }));
}

console.log('\n=== refusals ===');
{
  lines.length = 0;
  const refusal = Object.assign(new Error("400 Unrecognized request argument supplied: stream_options"), { status: 400 });
  const plain = (async function* () { yield { choices: [{ delta: { content: 'ok' } }] }; })();
  const c = U.tracked(fakeClient([refusal, plain]), 'logos/chat');
  const s = await c.chat.completions.create({ model: 'gpt-x', stream: true, messages: [] });
  let text = '';
  for await (const ch of s) text += ch.choices?.[0]?.delta?.content ?? '';
  ok('a provider that does not know stream_options gets the call as it was asked', text === 'ok' && c.seen.length === 2 && c.seen[1].stream_options === undefined, J(c.seen));
  const other = Object.assign(new Error('400 max_tokens is too large'), { status: 400 });
  const c2 = U.tracked(fakeClient([other]), 'logos/chat');
  let thrown = null;
  try {
    await c2.chat.completions.create({ model: 'gpt-x', stream: true, messages: [] });
  } catch (e) {
    thrown = e;
  }
  ok('any other refusal is not hidden, and not retried', thrown === other && c2.seen.length === 1);
  const down = Object.assign(new Error('500 upstream'), { status: 500 });
  const c3 = U.tracked(fakeClient([down]), 'logos/map');
  let t3 = null;
  try {
    await c3.chat.completions.create({ model: 'gpt-x', messages: [] });
  } catch (e) {
    t3 = e;
  }
  ok('a failed buffered call throws as it did', t3 === down);
}

console.log('\n=== once, quiet when asked, nothing to say without usage ===');
{
  lines.length = 0;
  const f = fakeClient([{ usage: { prompt_tokens: 5, completion_tokens: 1 } }]);
  U.tracked(U.tracked(f, 'a'), 'b');
  await f.chat.completions.create({ model: 'm', messages: [] });
  ok('wrapped twice, logged once, under the first name', lines.length === 1 && logged()[0].route === 'a', J(logged()));
  lines.length = 0;
  process.env.SOCRIA_TOKEN_LOG = 'off';
  const g = U.tracked(fakeClient([{ usage: { prompt_tokens: 5, completion_tokens: 1 } }]), 'x');
  await g.chat.completions.create({ model: 'm', messages: [] });
  ok('SOCRIA_TOKEN_LOG=off is silent', lines.length === 0);
  delete process.env.SOCRIA_TOKEN_LOG;
  const h = U.tracked(fakeClient([{ choices: [] }]), 'x');
  await h.chat.completions.create({ model: 'm', messages: [] });
  ok('no usage, no line', lines.length === 0);
}

console.log('\n=== every model client in the app is tracked ===');
{
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(join(root, d))) {
      const p = join(d, f);
      if (statSync(join(root, p)).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) files.push(p);
    }
  };
  walk('app');
  walk('lib');
  const untracked = [];
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8');
    const made = src.match(/new OpenAI\(/g)?.length ?? 0;
    if (!made) continue;
    const wrapped = src.match(/tracked\(new OpenAI\(/g)?.length ?? 0;
    if (wrapped < made && !f.includes('health/upstream')) untracked.push(f);
  }
  ok('no client goes untracked (the upstream health check aside, which spends nothing worth counting)', untracked.length === 0, untracked.join(', '));
  ok('the Core 4 seam logs each step under its own name', /tracked\(new OpenAI\(\{ apiKey \}\), `seam\/\$\{role\}`\)/.test(readFileSync(join(root, 'lib/core4/model.ts'), 'utf8')));
}

console.log('\n=== the report ===');
{
  const log = [
    'noise',
    '2026-10-23T10:00:00 [tokens] {"route":"logos/map","model":"m","in":20000,"cached":19000,"out":500}',
    '[tokens] {"route":"logos/map","model":"m","in":20000,"cached":0,"out":700}',
    '[tokens] {"route":"logos/chat","model":"m","in":9000,"cached":6000,"out":300}',
    '[tokens] not json',
  ].join('\n');
  const r = spawnSync(process.execPath, [join(root, 'scripts/token-report.mjs')], { input: log, encoding: 'utf8' });
  const out = r.stdout;
  ok('totals by route, biggest first, with the cache share', r.status === 0 && /logos\/map\s+2\s+40,000\s+19,000\s+48%\s+1,200\s+20,000/.test(out) && out.indexOf('logos/map') < out.indexOf('logos/chat') && /total\s+3\s+49,000\s+25,000\s+51%/.test(out), out);
  const none = spawnSync(process.execPath, [join(root, 'scripts/token-report.mjs')], { input: 'nothing here', encoding: 'utf8' });
  ok('and says so when there is nothing to total', none.stdout.trim() === 'No [tokens] lines found.');
}

console.info = info;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
