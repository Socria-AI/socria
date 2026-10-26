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
  if (/custom artifact/.test(t)) return 'It is in Artifacts: tick each day as you go — the days and the bar work themselves out. Which habit is the hardest to keep?';
  if (/\bchart|plot|graph\b/.test(t)) return 'Rent is most of it — three-quarters of what you listed. Is that the share you expected?';
  if (/derivative|d\/dx|differentiate/.test(t)) return 'Use the quotient rule or the chain rule — both give $-\\csc(x)\\cot(x)$. Which route do you want to check by hand?';
  if (/what is|what's|define|meaning of/.test(t)) return 'It is the share of a cost that buyers end up paying after a tax, set by how strongly each side reacts to price.';
  if (/offer|job/.test(t)) return 'The raise and the growth are two different reasons, and you have put them in one sentence. Which one would make you leave if the other were missing?';
  if (/\?\s*$/.test(t)) return 'Plainly: it depends on the part you have not stated yet — what you would give up. Name that and the choice gets smaller.';
  return 'Keep going — what is the part you are least sure of?';
}

/**
 * A turn offered an inline element (app/api/logos/chat, lib/runtime/presentation.ts
 * renderPresentation) is answered with one, so the browser can be driven through
 * a chart, a slider, a comparison, choices, a draft and folded reasoning. The
 * chart is drawn from the numbers in their message, as the real model is told to.
 */
function inlineReply(messages) {
  const sys = messages.filter((m) => m?.role === 'system').map((m) => String(m.content ?? '')).join('\n');
  // a write-up they asked to keep (lib/runtime/presentation.ts WRITE_UP): a document, title first, for Content
  if (sys.includes('A WRITE-UP, READ IN CONTENT')) {
    const about = (lastUser(messages).match(/\b(?:on|about|to|for)\s+(.{3,80}?)[.?!]*$/i)?.[1] ?? 'what you asked').replace(/^the\s+/i, '');
    const title = about.charAt(0).toUpperCase() + about.slice(1);
    return `# ${title}\n\nNo single cause explains it; several pressures met at once, and each made the others more dangerous.\n\n## Alliances\n\nTwo blocs had promised to fight for each other, so a local quarrel could not stay local.\n\n## Militarism\n\nArms races and rigid mobilisation plans made speed decisive: whoever waited risked losing.\n\n## Nationalism\n\nNew nations and old empires each had a claim the others could not accept.\n\n## The spark\n\nAn assassination in Sarajevo gave all of it a reason to start.`;
  }
  if (!sys.includes('INLINE, IF IT HELPS')) return null;
  const t = lastUser(messages);
  const ui = (o) => '```ui\n' + JSON.stringify(o) + '\n```';
  if (sys.includes('"type":"chart"')) {
    const pairs = [...t.matchAll(/\b([A-Za-z][A-Za-z]{1,20}|[A-Za-z]\d{1,2})\s*[:=]?\s*\$?(\d[\d,]*(?:\.\d+)?)(k?)\b(?!\s*%)/g)]
      .filter((m) => !/^(?:at|of|is|was|are|and|or|my|the|a|over|for|on|in)$/i.test(m[1]))
      .slice(0, 8);
    if (pairs.length >= 3) {
      const x = pairs.map((m) => m[1][0].toUpperCase() + m[1].slice(1));
      const values = pairs.map((m) => Number(m[2].replace(/,/g, '')));
      const top = x[values.indexOf(Math.max(...values))];
      return `${top} is the largest part of it.\n\n${ui({ type: 'chart', kind: 'bar', title: 'What you listed', x, series: [{ values }], basis: 'given' })}\n\nThe rest are close to each other.`;
    }
  }
  if (sys.includes('"type":"slider"')) {
    return `About $1,799 a month at those numbers. Move them to see how it changes.\n\n${ui({ type: 'slider', title: 'Monthly payment', formula: 'p*(r/1200)/(1-(1+r/1200)^(-n))', result: { label: 'Monthly payment', unit: '$', digits: 0 }, vars: [{ name: 'p', label: 'Loan', min: 50000, max: 1000000, step: 5000, value: 300000, unit: '$' }, { name: 'r', label: 'Rate', min: 1, max: 12, step: 0.25, value: 6, unit: '%' }, { name: 'n', label: 'Months', min: 60, max: 480, step: 12, value: 360 }] })}`;
  }
  if (sys.includes('"type":"compare"')) {
    const two = /\b([A-Z][\w+#.]*)\s+(?:and|or|vs\.?|versus)\s+(?:the\s+)?([A-Z][\w+#.]*)/.exec(t);
    const [a, b] = two ? [two[1], two[2]] : ['The first', 'The second'];
    return `They differ most on cost and on how much you have to look after.\n\n${ui({ type: 'compare', options: [a, b], rows: [{ label: 'Cost', values: ['$15 a month', '$25 a month'] }, { label: 'Upkeep', values: ['Low', 'Medium'] }, { label: 'Best for', values: ['Getting started', 'Scaling later'] }], pick: 0 })}\n\nI lean to ${a} for where you are now.`;
  }
  if (sys.includes('"type":"draft"')) {
    return `Here is one you can send.\n\n${ui({ type: 'draft', kind: 'email', title: 'To your landlord', text: 'Hi Sam,\n\nThe heater in my flat stopped working on Monday and the place is getting cold. Could you arrange for someone to look at it this week?\n\nThanks,\nAlex' })}`;
  }
  if (sys.includes('"type":"options"')) {
    return `Happy to. Where do you want to start?\n\n${ui({ type: 'options', options: [{ label: 'The structure' }, { label: 'The opening' }, { label: 'Tightening the argument' }] })}`;
  }
  if (sys.includes('"type":"concepts"')) {
    return `Microeconomics is the study of choices made one market at a time — how buyers and sellers decide, and how their decisions settle into prices. Four ideas carry most of it, and each leans on the others.\n\n${ui({ type: 'concepts', title: 'Microeconomics', items: [
      { name: 'Supply and demand', gist: 'How a price settles where what sellers offer meets what buyers want.', detail: 'Demand falls as price rises; supply rises with it. Where the two meet is the price that clears the market, and anything that shifts either curve moves it.', links: ['Market structure', 'Elasticity'] },
      { name: 'Consumer behaviour', gist: 'How people choose what to buy with a limited budget.', detail: 'People weigh what an extra unit is worth to them against its price. Add up those choices and you get the demand curve.', links: ['Supply and demand'] },
      { name: 'Costs of production', gist: 'What it costs a firm to make one more unit.', detail: 'Fixed costs stay put; variable costs grow with output. A firm keeps producing while one more unit brings in more than it costs.', links: ['Market structure'] },
      { name: 'Market structure', gist: 'How many firms compete, and how much say each has over price.', detail: 'From many small firms that take the price as given to one firm that sets it, the structure decides how far prices sit above costs.' },
      { name: 'Elasticity', gist: 'How strongly buyers or sellers react when the price moves.', detail: 'Necessities barely react; luxuries react a lot. It decides who ends up paying a tax and whether a price rise brings in more or less money.' },
    ] })}`;
  }
  if (sys.includes('"type":"sequence"')) {
    if (sys.includes('sequence:timeline') || /timeline|events|happened|over time|chronolog/i.test(t)) {
      return `It moved fast once it started: in a little over two years the monarchy went from reform to abolition.\n\n${ui({ type: 'sequence', kind: 'timeline', title: 'The French Revolution, the first years', items: [
        { label: 'The Estates-General meets', when: 'May 1789', detail: 'Called to fix the Crown\'s finances, it splits over how votes are counted.' },
        { label: 'The Bastille falls', when: 'July 1789', detail: 'Crowds take the fortress; the King\'s authority in Paris collapses.' },
        { label: 'Declaration of the Rights of Man', when: 'Aug 1789' },
        { label: 'The monarchy is abolished', when: 'Sept 1792', detail: 'The Convention declares a republic.' },
      ] })}`;
    }
    if (sys.includes('sequence:how-it-works') || /football/i.test(t)) {
      return `The whole game is a fight for ten yards: the team with the ball gets four tries, called downs, to carry it ten yards forward. Make it, and the count starts again; fail, and the ball goes to the other side.\n\n${ui({ type: 'sequence', kind: 'steps', title: 'The four downs', items: [
        { label: '1st down — 10 yards to go', detail: 'A run or a pass; whatever is gained comes off the ten.' },
        { label: '2nd down', detail: 'Another try from wherever the last one ended.' },
        { label: '3rd down', detail: 'Usually the decisive one: make the rest of the ten or face fourth.' },
        { label: '4th down', detail: 'Kick it away (a punt), try for a field goal, or gamble on going for it.' },
      ] })}\n\nScoring is how a drive ends well — want that next?`;
    }
    return `Four steps, and the second is the one people skip.\n\n${ui({ type: 'sequence', kind: 'steps', title: 'Setting up a budget', items: [
      { label: 'Add up what comes in each month' },
      { label: 'List every fixed cost', detail: 'Rent, phone, subscriptions — the bills that arrive whether you think about them or not.' },
      { label: 'Set a weekly limit for the rest' },
      { label: 'Check it after a month and adjust' },
    ] })}`;
  }
  if (sys.includes('"type":"reasoning"')) {
    return `Yes — 36 is right, not 42.\n\n${ui({ type: 'reasoning', summary: 'The integral of 2x from 0 to 6 is 36', steps: ['An antiderivative of 2x is x²', 'Evaluate at 6: 36', 'Evaluate at 0: 0', '36 − 0 = 36'] })}`;
  }
  return null;
}

/**
 * The map pass sends the map as it stands and then the conversation, under
 * "=== THE CONVERSATION ===", in one message (app/api/logos/map): the
 * conversation alone, so the canned map is drawn from what was said.
 */
function conversationOf(messages) {
  return messages.map((m) => {
    const text = String(m.content ?? '');
    const at = text.indexOf('=== THE CONVERSATION ===\n');
    return at < 0 ? m : { ...m, content: text.slice(at + '=== THE CONVERSATION ===\n'.length) };
  });
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

/**
 * A custom artifact drafted (lib/objects/display-custom.ts): from their own
 * template when one was handed over (its blocks kept, a table's rows filled
 * from what they asked), else a habit tracker for the things they named.
 */
function customReply(system, transcript) {
  // the latest request: the transcript holds every one made so far
  const asked = [...transcript.matchAll(/Make a custom artifact[^:\n]*:\s*([^\n]+)/gi)].pop()?.[1] ?? '';
  const things = asked
    .replace(/^(?:a|an)\s+[\w\s]*?\bfor\s+/i, '')
    .replace(/\bthis week\b|\bevery day\b/gi, '')
    .split(/,\s*|\s+and\s+/)
    .map((x) => x.trim().replace(/^and\s+/i, ''))
    .filter(Boolean)
    .slice(0, 6);
  const named = things.length ? things : ['Exercise', 'Reading', 'Sleep'];
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const tplName = /THEIR TEMPLATE, “([^”]+)”/.exec(system)?.[1];
  const tpl = /Template: (\{.*\})\s*$/m.exec(system)?.[1];
  if (tplName && tpl) {
    const blocks = JSON.parse(tpl).blocks.map((b) => (b.type === 'table' ? { ...b, rows: named.map((n) => ({ cells: { [b.columns[0].id]: cap(n) } })) } : b));
    return { display: { kind: 'custom', state: { title: `${tplName}: ${named.map(cap).join(', ')}`.slice(0, 80), blocks } }, gaps: [] };
  }
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  return {
    display: {
      kind: 'custom',
      state: {
        title: 'Habit tracker',
        about: 'Tick each day you did it.',
        blocks: [
          { id: 'week', type: 'table', label: 'This week', columns: [{ id: 'habit', label: 'Habit' }, ...days.map((d) => ({ id: d.toLowerCase(), label: d, kind: 'check' })), { id: 'days', label: 'Days', kind: 'calc', expr: days.map((d) => d.toLowerCase()).join(' + '), total: true }], rows: named.map((n) => ({ cells: { habit: cap(n) } })) },
          { id: 'done', type: 'progress', label: 'This week so far', of: 'week' },
          { id: 'goal', type: 'number', label: 'Days a week to aim for', value: 4, min: 1, max: 7, step: 1, control: 'stepper' },
          { id: 'notes', type: 'field', label: 'What got in the way?', multiline: true, placeholder: 'A line for the week' },
        ],
      },
    },
    gaps: [],
  };
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
  if (op === 'structure') {
    // a reverse outline of the paragraphs it was given: roles from their wording, the first sentence that argues as the claim
    const paras = Array.from(system.matchAll(/^\[([A-Za-z0-9_-]+)\](?: \((\w+)\))? (.*)$/gm)).map((m) => ({ id: m[1], t: m[2] ?? 'p', text: m[3] }));
    const role = (x) => (/^h/.test(x.t) ? 'other' : /\b(for example|for instance)\b/i.test(x.text) ? 'example' : /\b(but|however|critics)\b/i.test(x.text) ? 'counter' : /\b(\d+%|data|study|survey)\b/i.test(x.text) ? 'evidence' : /\b(so|therefore|in conclusion)\b/i.test(x.text) ? 'conclusion' : /\b(should|must|because)\b/i.test(x.text) ? 'claim' : 'background');
    const outline = paras.map((x) => ({ block: x.id, role: role(x), does: `${role(x) === 'other' ? 'names the section' : role(x) === 'example' ? 'gives an example' : role(x) === 'evidence' ? 'gives a figure as support' : role(x) === 'claim' ? 'makes the argument' : role(x) === 'counter' ? 'raises an objection' : role(x) === 'conclusion' ? 'draws the conclusion' : 'sets the scene'}` }));
    const claimP = paras.find((x) => role(x) === 'claim');
    const sentence = claimP ? (claimP.text.match(/[^.!?]+[.!?]/) ?? [claimP.text])[0].trim() : null;
    const ex = paras.findIndex((x) => role(x) === 'example');
    const cl = claimP ? paras.indexOf(claimP) : -1;
    const moves = ex >= 0 && cl > ex ? [{ block: paras[ex].id, after: paras[cl].id, why: 'The example comes before the claim it illustrates; after it, a reader knows what it is an example of.' }] : [];
    return { outline, ...(sentence ? { thesis: { block: claimP.id, quote: sentence } } : {}), moves, gaps: ['What would someone who disagrees point to first?'] };
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
        const isCustom = system.startsWith('You draft EVERYDAY DISPLAYS') && /- "custom" —/.test(system);
        const content = JSON.stringify(isWrite ? writeReply(system) : isMap ? mapReply(conversationOf(messages.slice(1))) : isSort ? sortReply(lastUser(messages)) : isEntries ? entriesReply(lastUser(messages)) : isCustom ? customReply(system, messages.slice(1).map((m) => String(m.content ?? '')).join('\n')) : {});
        return send(res, 200, { id: `chatcmpl-local-${Date.now()}`, object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
      }
      const text = inlineReply(messages) ?? chatReply(messages.slice(1));
      if (body.stream) return streamText(res, text, model);
      return send(res, 200, { id: `chatcmpl-local-${Date.now()}`, object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }
    send(res, 404, { error: { message: `not scripted: ${req.method} ${url.pathname}` } });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`fake openai on http://127.0.0.1:${PORT}/v1`));
