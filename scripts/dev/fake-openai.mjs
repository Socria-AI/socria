#!/usr/bin/env node
// scripts/dev/fake-openai.mjs — a scripted stand-in for the OpenAI API, for
// driving the real app in a browser with no key and no spend.
//
//   node scripts/dev/fake-openai.mjs [port]        (default 3999)
//   OPENAI_API_KEY=sk-local OPENAI_BASE_URL=http://127.0.0.1:3999/v1 npm run dev
//
// The SDK reads OPENAI_BASE_URL, so every route's model call lands here. The
// answers are canned and deterministic — enough to exercise the surfaces
// (a streamed reply, a map, a display, a transcription), never a judgement of
// what the real model would say. It must never be pointed at by a deployment.
//
// What it answers:
//   POST /v1/chat/completions      streamed text, or JSON when json_object is asked
//   POST /v1/audio/transcriptions  {"text": …} — the voice composer's path
//   GET  /v1/models                a short list

import http from 'node:http';

const PORT = Number(process.argv[2] || process.env.FAKE_OPENAI_PORT || 3999);

const lastUser = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === 'user') return String(messages[i].content ?? '');
  return '';
};
const allUser = (messages) => messages.filter((m) => m?.role === 'user').map((m) => String(m.content ?? ''));

/** A reply in Logos's register, chosen by what the last message is plainly doing. */
function chatReply(messages) {
  const t = lastUser(messages).toLowerCase();
  if (/\bchart|plot|graph\b/.test(t)) return 'Rent is most of it — three-quarters of what you listed. Is that the share you expected?';
  if (/derivative|d\/dx|differentiate/.test(t)) return 'Use the quotient rule or the chain rule — both give $-\\csc(x)\\cot(x)$. Which route do you want to check by hand?';
  if (/what is|what's|define|meaning of/.test(t)) return 'It is the share of a cost that buyers end up paying after a tax, set by how strongly each side reacts to price.';
  if (/offer|job/.test(t)) return 'The raise and the growth are two different reasons, and you have put them in one sentence. Which one would make you leave if the other were missing?';
  if (/\?\s*$/.test(t)) return 'Plainly: it depends on the part you have not stated yet — what you would give up. Name that and the choice gets smaller.';
  return 'Keep going — what is the part you are least sure of?';
}

/** A Thinking Map for the conversation so far: deterministic, from the person's own sentences. */
function mapReply(messages) {
  const transcript = messages.map((m) => String(m.content ?? '')).join('\n');
  const said = allUser(messages).join(' ');
  const lower = said.toLowerCase();
  if (/\b(chart|plot|graph|pie)\b/.test(lower) && /\d/.test(lower)) {
    return {
      context: 'analysing',
      ask: { action: 'construct', artifact: 'display', topic: 'their numbers' },
      nodes: [{ id: 'numbers', type: 'evidence', label: 'Their numbers', status: 'open' }],
      edges: [],
    };
  }
  if (/derivative|integral|limit|d\/dx|\bx\^/.test(lower)) {
    return {
      context: 'math',
      intent: 'learning',
      ask: { action: 'explain', artifact: 'answer', topic: 'calculus' },
      nodes: [{ id: 'q', type: 'question', label: 'What is the derivative?', status: 'open' }],
      edges: [],
    };
  }
  const sentences = said
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .slice(0, 6);
  const nodes = sentences.map((s, i) => ({
    id: `n${i + 1}`,
    type: i === 0 ? 'question' : /because|since|so\b/i.test(s) ? 'claim' : /maybe|probably|i think|assum/i.test(s) ? 'assumption' : 'claim',
    label: s.replace(/[.!?]+$/, '').slice(0, 60),
    status: 'open',
  }));
  const edges = nodes.slice(1).map((n) => ({ from: 'n1', to: n.id, relation: 'depends' }));
  void transcript;
  return { context: /offer|job|decide|should i/.test(lower) ? 'deciding' : 'reflecting', ask: { action: 'discuss', artifact: 'map' }, nodes, edges };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function streamText(res, text, model) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const id = `chatcmpl-local-${Date.now()}`;
  const words = text.match(/\S+\s*/g) ?? [text];
  let i = 0;
  const tick = () => {
    if (i < words.length) {
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: { content: words[i] }, finish_reason: null }] })}\n\n`);
      i++;
      setTimeout(tick, 12);
      return;
    }
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  };
  tick();
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const raw = Buffer.concat(chunks);
    if (req.method === 'GET' && url.pathname.endsWith('/models')) {
      return send(res, 200, { object: 'list', data: [{ id: 'gpt-local', object: 'model' }] });
    }
    if (req.method === 'POST' && url.pathname.endsWith('/audio/transcriptions')) {
      // the voice composer's request: multipart with a file part. The text is canned.
      const sized = raw.length > 200;
      return send(res, 200, { text: sized ? 'Okay so the new role is mostly maintaining the quarterly reports, which is basically what I do now.' : '' });
    }
    if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
      let body;
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        return send(res, 400, { error: { message: 'bad json' } });
      }
      const model = body.model || 'gpt-local';
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const system = String(messages[0]?.role === 'system' ? messages[0].content : '');
      if (body.response_format?.type === 'json_object') {
        const isMap = /"nodes": \[\{"id": "short_snake_case_id"/.test(system);
        const content = JSON.stringify(isMap ? mapReply(messages.slice(1)) : {});
        return send(res, 200, { id: `chatcmpl-local-${Date.now()}`, object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
      }
      const text = chatReply(messages.slice(1));
      if (body.stream) return streamText(res, text, model);
      return send(res, 200, { id: `chatcmpl-local-${Date.now()}`, object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }
    send(res, 404, { error: { message: `not scripted: ${req.method} ${url.pathname}` } });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`fake openai on http://127.0.0.1:${PORT}/v1`));
