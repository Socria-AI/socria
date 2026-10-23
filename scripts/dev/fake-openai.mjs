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
// FAKE_STREAM_MS=400 slows the stream (default 12ms a word), so a reply can be
// watched arriving — and stopped — in a browser.
//
// What it answers:
//   POST /v1/chat/completions      streamed text, or JSON when json_object is asked
//                                  (a map, a study's topics, journal-entry practice,
//                                  a reading or proposed edits for the writing space)
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

/** The study sort (lib/logos5/study-ask.ts sortAsk): topics from the keyed passages' own headings. */
function sortReply(user) {
  const lines = user.split('\n').map((l) => /^\[(\d+:p\d+\.\d+)\] (?:(heading|title|list|quote|table|caption): )?(.*)$/.exec(l)).filter(Boolean);
  const topics = [];
  let cur = null;
  for (const [, key, kind, text] of lines) {
    if (kind === 'heading' || kind === 'title' || !cur) {
      cur = { title: (kind === 'heading' || kind === 'title' ? text : 'Overview').slice(0, 40), kind: /review|question|exam/i.test(text) ? 'review' : topics.length ? 'procedure' : 'foundation', summary: `What the files say about ${text.toLowerCase().slice(0, 40)}.`, blocks: [], quotes: [], after: topics.length ? [0] : [] };
      topics.push(cur);
    }
    cur.blocks.push(key);
    if (!kind && cur.quotes.length < 2) {
      const first = (text.match(/[^.!?]+[.!?]/) || [text])[0].trim();
      cur.quotes.push({ block: key, text: first });
    }
  }
  const course = (/\b([A-Z]{3,4} ?\d{4})\b/.exec(user) || [])[1];
  return { course: course ? `${course} · Exam 2` : '', topics: topics.filter((t) => t.blocks.length > 1 || t.quotes.length).slice(0, 8), start: 0, why: 'The other topics build on it.' };
}

/** Journal-entry practice (entriesAsk): events from the passages' own numbers. */
function entriesReply(user) {
  const money = (s) => Number(String(s).replace(/[$,]/g, ''));
  const events = [];
  let dA = 0, dL = 0, dE = 0;
  for (const m of user.matchAll(/^\[(\d+:p\d+\.\d+)\] (.*)$/gm)) {
    const [, key, text] = m;
    const amt = /\$([\d,]+)/.exec(text);
    if (!amt) continue;
    const v = money(amt[1]);
    if (/wages/i.test(text)) {
      events.push({ block: key, text: `Mar 31 — wages earned but not yet paid, $${amt[1]}`, lines: [{ account: 'Wages Expense', also: ['Salaries Expense'], side: 'dr', amount: v, why: 'The work was done in March, so the expense belongs to March.' }, { account: 'Wages Payable', side: 'cr', amount: v, why: 'It is owed until payday — a liability.' }], hint: 'What does the business owe at the end of March that its books do not show yet?' });
      dL += v; dE -= v;
    } else if (/rent/i.test(text) && /six months/i.test(text)) {
      const r = v / 6;
      events.push({ block: key, text: 'Mar 31 — one month of the rent paid in advance is used up', lines: [{ account: 'Rent Expense', side: 'dr', amount: r, why: 'One month of the prepaid rent was used in March.' }, { account: 'Prepaid Rent', side: 'cr', amount: r, why: 'The asset shrinks by the month used.' }], hint: 'Something paid for in advance was partly used up. Which asset gets smaller?' });
      dA -= r; dE -= r;
    } else if (/services/i.test(text)) {
      events.push({ block: key, text: `Services provided on account, not yet billed, $${amt[1]}`, lines: [{ account: 'Accounts Receivable', side: 'dr', amount: v, why: 'The customer owes for work already done.' }, { account: 'Service Revenue', side: 'cr', amount: v, why: 'Revenue is recorded when it is earned, billed or not.' }], hint: 'The work is done; nobody has paid. What does the business now have a right to?' });
      dA += v; dE += v;
    }
  }
  const bal = /total assets were \$([\d,]+), liabilities \$([\d,]+) and equity \$([\d,]+)/i.exec(user);
  const balance = bal ? { assets: money(bal[1]) + dA, liabilities: money(bal[2]) + dL, equity: money(bal[3]) + dE } : null;
  return { title: 'Record the adjustments for March 31', events: events.slice(0, 4), balance };
}

/** The writing assist route (lib/write/assist.ts): canned, but always about the words it was given. */
function writeReply(system) {
  const op = /^You help someone with their own writing\. Task: (\w+)\./.exec(system)?.[1] ?? '';
  const sel = /The passage they selected:\n"""\n([\s\S]*?)\n"""/.exec(system)?.[1] ?? '';
  const words = sel.split(/\s+/).filter(Boolean);
  const gist = words.slice(0, 9).join(' ');
  const swaps = [
    [/\bvery very\b/i, 'very', 'One “very” is enough.', 'grammar'],
    [/\balot\b/, 'a lot', '“A lot” is two words.', 'grammar'],
    [/\bcould of\b/i, 'could have', '“could have”, not “could of”.', 'grammar'],
    [/\bin order to\b/i, 'to', '“To” says the same.', 'concision'],
    [/\bdue to the fact that\b/i, 'because', '“Because” says the same.', 'concision'],
    [/\bat this point in time\b/i, 'now', '“Now” says the same.', 'concision'],
    [/\breally /i, '', '“Really” adds little here.', 'concision'],
    [/\bvery /i, '', '“Very” adds little here.', 'concision'],
  ];
  const edits = [];
  for (const [re, to, why, kind] of swaps) {
    const m = re.exec(sel);
    if (m && !edits.some((e) => sel.indexOf(e.from) < m.index + m[0].length && m.index < sel.indexOf(e.from) + e.from.length)) edits.push({ from: m[0], to, why, kind });
  }
  if (op === 'explain') return { body: `A reader takes this as saying: ${gist}${words.length > 9 ? '…' : ''} — and as something you believe, not something you are reporting.`, points: words.length > 6 ? ['“It” could point back to more than one thing here.'] : [] };
  if (op === 'critique') return { body: 'This asks a reader to accept a general claim on the strength of what you have said so far.', points: ['The claim is stated, not shown — a sceptical reader asks for the case behind it.', 'It assumes the reader already agrees about why this matters.'], question: 'What is the one piece of evidence that would convince someone who disagrees?' };
  if (op === 'shorten') return { edits: edits.filter((e) => e.to.length < e.from.length), body: edits.length ? 'The length is in a few words that repeat what the sentence already says.' : 'This is already tight.' };
  if (op === 'improve') return { edits, body: edits.length ? 'A couple of small slips were making it harder to read.' : 'This is already clear.' };
  if (op === 'develop') {
    const key = words.find((w) => w.length > 5)?.replace(/[^\p{L}]/gu, '') || words[0] || 'this';
    const prev = /The paragraph before:/.test(system);
    return { questions: [`What exactly do you mean by “${key}”?`, 'Why is that so — what makes it true?', 'What is one example a reader would recognise?'], shape: '[your claim] because [your reason]. For instance, [your example].', transitions: prev ? [{ text: 'As a result,', why: 'it follows from the paragraph before' }] : [], missing: 'Who or what this is about, specifically.' };
  }
  if (op === 'phrase') return { options: [{ text: sel.includes(' and ') ? sel.replace(' and ', ', and ') : `Put simply, ${sel[0]?.toLowerCase() ?? ''}${sel.slice(1)}`, why: 'a pause where the thought turns' }] };
  if (op === 'proofread') {
    const issues = [];
    for (const m of system.matchAll(/^\[([A-Za-z0-9_-]+)\](?: \(\w+\))? (.*)$/gm)) {
      const [, block, text] = m;
      const g = /\b(they|we|you) was\b/i.exec(text);
      if (g) issues.push({ block, quote: g[0], kind: 'grammar', certainty: 'definite', why: `“${g[1]}” takes “were”.`, fix: `${g[1]} were` });
      const l = /\b(therefore|so) (every|all|always)\b[^.]*/i.exec(text);
      if (l) issues.push({ block, quote: l[0], kind: 'logic', certainty: 'likely', why: 'This goes from one case to every case — a reader will ask what makes it general. It may be right; it is not yet shown.' });
    }
    return { issues };
  }
  if (op === 'board') {
    const cards = Array.from(system.matchAll(/^\[([A-Za-z0-9_-]+)\] \((\w+), pile: ([^)]*)\) (.*)$/gm)).map((m) => ({ id: m[1], kind: m[2], pile: m[3], text: m[4] }));
    const claim = cards.find((c) => c.kind === 'claim');
    const ev = cards.find((c) => c.kind === 'evidence');
    const findings = [];
    if (claim && ev && claim.pile !== ev.pile) findings.push({ kind: 'connection', cards: [claim.id, ev.id], says: 'The evidence that backs this claim sits in a different pile from it — a reader meets the claim with nothing under it.', question: 'Should they be in the same paragraph?' });
    else if (claim && !ev) findings.push({ kind: 'unsupported', cards: [claim.id], says: 'This claim is the centre of the board and nothing on the board supports it yet.', question: 'What would someone who disagrees need to see?' });
    return { findings };
  }
  return {};
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
      setTimeout(tick, Number(process.env.FAKE_STREAM_MS || 12));
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
        const isSort = /sort a student’s files into study topics/.test(system);
        const isEntries = /journal-entry practice/.test(system);
        const isWrite = system.startsWith('You help someone with their own writing.');
        const content = JSON.stringify(isWrite ? writeReply(system) : isMap ? mapReply(messages.slice(1)) : isSort ? sortReply(lastUser(messages)) : isEntries ? entriesReply(lastUser(messages)) : {});
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
