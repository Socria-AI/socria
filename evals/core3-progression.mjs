// evals/core3-progression.mjs
//
// A/B conversational eval for Socria Core 3.1.
//
// Each scenario is a SEQUENCE of user turns (a real conversation), not an
// isolated prompt. We replay every scenario TWICE against the same running
// server — once with the per-turn controller ON (the shipped behavior) and
// once with it OFF (baseline: bare system prompt) — feeding each assistant
// reply back in, and score every assistant turn. The point is a side-by-side
// comparison, per the "iterate against transcripts, don't expand the prompt"
// principle: measure whether the change actually moves conversation quality.
//
// Usage:
//   1. Run the app in dev:     npm run dev
//   2. In another terminal:    node evals/core3-progression.mjs
//        (add OPENAI_API_KEY=sk-... to enable the semantic LLM judge)
//
// Env:
//   BASE_URL          default http://localhost:3000
//   SOCRIA_ACCESS_KEY default "SMART" (x-socria-key, skips auth)
//   OPENAI_API_KEY    optional; adds gpt-4o-mini judge for semantic checks
//   JUDGE_MODEL       default gpt-4o-mini
//   LIMIT             cap scenarios (default all)
//   VARIANTS          "controller,baseline" (default) | "controller" only
//
// The controller-off variant requires NODE_ENV !== production on the server
// (it honors the x-socria-no-controller header only in dev).

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ACCESS_KEY = process.env.SOCRIA_ACCESS_KEY || 'SMART';
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const VARIANTS = (process.env.VARIANTS || 'controller,baseline').split(',').map((s) => s.trim());

// --- ~24 multi-turn scenarios --------------------------------------------
const SCENARIOS = [
  { name: 'fear-of-failure', turns: ["Honestly, I'm afraid of failing.", 'Success would mean achieving my goals.', 'I need to clarify my goals first.'] },
  { name: 'transferring-schools', turns: ["I'm not sure what to do.", "I'm thinking of transferring schools.", "I don't like it here."] },
  { name: 'startup-uncertainty', turns: ['maybe I should build a startup', 'I like solving complex problems.', 'the hard ones nobody else wants', "but I don't have an idea yet"] },
  { name: 'relationship-conflict', turns: ['My partner and I keep fighting about the same thing.', 'I guess I just want to know if I should stay.', 'Maybe I already know the answer.'] },
  { name: 'repeated-i-dont-know', turns: ['I feel stuck.', "I don't know.", "I don't know.", 'Not sure.'] },
  { name: 'already-concluded', turns: ["I've decided to take the job.", "I'm just a little nervous about it.", 'But it feels right.'] },
  { name: 'factual-question', turns: ['What actually is the sunk cost fallacy?', "Okay, so I think I'm doing that with this project."], expectDirectAnswerOnTurn: 0 },
  { name: 'contradiction', turns: ["I don't care what other people think.", "I'm mostly worried my parents will be disappointed."] },
  { name: 'quitting-job', turns: ["I think I want to quit my job.", "The pay is good but I dread Mondays.", "I keep telling myself it's fine."] },
  { name: 'choosing-major', turns: ["I can't decide between CS and design.", "I'm better at CS but design feels more me.", "Everyone says CS is safer."] },
  { name: 'creative-block', turns: ["I can't write anything lately.", "Everything I make feels derivative.", "Maybe I'm afraid it won't be good enough."] },
  { name: 'moving-cities', turns: ['Thinking about moving to a new city.', "I don't really know anyone there.", "I think I want a fresh start more than the city itself."] },
  { name: 'imposter-syndrome', turns: ['I got promoted but I feel like a fraud.', "I keep waiting to be found out.", "Objectively I've done the work though."] },
  { name: 'perfectionism', turns: ["I never finish anything.", "It's never good enough to ship.", "I guess unfinished can't be judged."] },
  { name: 'burnout', turns: ["I'm exhausted all the time.", "I still love the work, I think.", "Maybe it's not the work, it's the pace."] },
  { name: 'ending-friendship', turns: ["I think I'm outgrowing a friend.", "We don't really talk about anything real anymore.", "I feel guilty even thinking it."] },
  { name: 'values-vs-money', turns: ['I got offered way more money at a company I dislike.', "I care about doing meaningful work.", "But I also want to stop worrying about rent."] },
  { name: 'procrastination', turns: ["I keep putting off this big project.", "I work on everything except it.", "I think the project matters too much to me."] },
  { name: 'comparing-two-offers', turns: ['Two job offers, totally different.', 'One is prestigious, one is a small team.', "I keep listing pros and cons and getting nowhere."] },
  { name: 'identity-shift', turns: ["I don't feel like myself lately.", "I used to be so driven.", "Maybe what I wanted at 22 isn't what I want now."] },
  { name: 'overthinking', turns: ["I overthink every decision.", "I research everything to death.", "I think I'm trying to remove all risk."] },
  { name: 'saying-no', turns: ["I say yes to everything.", "Then I resent it later.", "I think I'm scared of disappointing people."] },
];

const DEPTH_SCENARIO = { name: 'depth-comparison', turns: ["I can't tell if I want this career or just the idea of it."] };

// --- Deterministic checks -------------------------------------------------
const BANNED = [
  /\bit sounds like\b/i, /\bit seems like\b/i, /\bthat sounds\b/i, /\bthat suggests\b/i,
  /\bthis could mean\b/i, /\bit'?s important to\b/i, /\bthat'?s understandable\b/i,
  /\bthat'?s (perfectly )?okay\b/i, /\bthat makes sense\b/i,
  /\bwhat are the main (factors|considerations|concerns|reasons)\b/i,
  /\bwhat are you hoping to (find|get|achieve)\b/i, /\bhow does that make you feel\b/i,
];
const DIRECTIVE = [/\byou should\b/i, /\bthe right choice\b/i, /\byou have to\b/i, /\byou need to (leave|stay|quit|go)\b/i];
const CONNECT = /\b(earlier|you said|you mentioned|before|a moment ago|started (on|with)|at first|we (started|began|moved))\b/i;

const STOP = new Set('a an the is are was were be been to of and or but so in on at it this that i you your my me we they them for with about as if not no yes just really very more most'.split(' '));
const words = (s) => (s.toLowerCase().match(/[a-z']+/g) || []).filter((w) => w.length > 3 && !STOP.has(w));
function overlap(reply, user) {
  const u = new Set(words(user));
  const r = words(reply);
  if (!r.length || !u.size) return 0;
  return r.filter((w) => u.has(w)).length / r.length;
}
const qCount = (s) => (s.match(/\?/g) || []).length;

function deterministic(reply, userMsg) {
  const banned = BANNED.some((re) => re.test(reply));
  const paraphrase = reply.length < 220 && overlap(reply, userMsg) > 0.45 && words(reply).filter((w) => !words(userMsg).includes(w)).length < 4;
  return {
    asksNecessaryQuestionOnly: qCount(reply) <= 1,
    avoidsGenericTherapyLanguage: !banned,
    avoidsEmptyParaphrase: !paraphrase,
    preservesUserAgency: !DIRECTIVE.some((re) => re.test(reply)),
  };
}

async function judge(thread, reply) {
  if (!OPENAI_API_KEY) return null;
  const sys = 'You strictly evaluate a Socratic thinking assistant. Given the conversation so far and its latest reply, return ONLY JSON booleans {"usesPriorContext","addsNewInsight","movesConversationForward","synthesisTimingAppropriate"}. usesPriorContext=builds on earlier turns, not just the last message. addsNewInsight=adds a distinction/inference/connection the user could not have predicted, not a restatement. movesConversationForward=the picture changes. synthesisTimingAppropriate=synthesis appears once enough accumulates, not prematurely.';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: JUDGE_MODEL, temperature: 0, response_format: { type: 'json_object' }, max_tokens: 120,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: `Conversation so far:\n${thread}\n\nLatest reply:\n${reply}` }] }),
    });
    return JSON.parse((await res.json()).choices?.[0]?.message?.content || '{}');
  } catch (e) {
    return null;
  }
}

async function ask(messages, { controller = true, depth = 'balanced' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-socria-key': ACCESS_KEY };
  if (!controller) headers['x-socria-no-controller'] = '1';
  const res = await fetch(`${BASE_URL}/api/chat`, { method: 'POST', headers, body: JSON.stringify({ messages, model: 'core-3', depth }) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
  return (await res.text()).trim();
}

const METRICS = ['usesPriorContext', 'addsNewInsight', 'avoidsEmptyParaphrase', 'asksNecessaryQuestionOnly', 'movesConversationForward', 'preservesUserAgency', 'avoidsGenericTherapyLanguage', 'synthesisTimingAppropriate'];

async function scoreReply(messagesBefore, reply, userMsg, turnIndex) {
  const det = deterministic(reply, userMsg);
  const j = await judge(messagesBefore.map((m) => `${m.role}: ${m.content}`).join('\n'), reply);
  return {
    usesPriorContext: j ? !!j.usesPriorContext : turnIndex > 0 && CONNECT.test(reply),
    addsNewInsight: j ? !!j.addsNewInsight : det.avoidsEmptyParaphrase && qCount(reply) <= 1,
    avoidsEmptyParaphrase: det.avoidsEmptyParaphrase,
    asksNecessaryQuestionOnly: det.asksNecessaryQuestionOnly,
    movesConversationForward: j ? !!j.movesConversationForward : det.avoidsEmptyParaphrase && det.avoidsGenericTherapyLanguage,
    preservesUserAgency: det.preservesUserAgency,
    avoidsGenericTherapyLanguage: det.avoidsGenericTherapyLanguage,
    synthesisTimingAppropriate: j ? !!j.synthesisTimingAppropriate : true,
  };
}

async function runVariant(sc, controller) {
  const messages = [];
  const scores = [];
  const replies = [];
  for (let i = 0; i < sc.turns.length; i++) {
    messages.push({ role: 'user', content: sc.turns[i] });
    const reply = await ask(messages, { controller });
    const score = await scoreReply(messages.slice(0, -1).concat({ role: 'user', content: sc.turns[i] }), reply, sc.turns[i], i);
    scores.push(score);
    replies.push(reply);
    messages.push({ role: 'assistant', content: reply });
  }
  return { scores, replies };
}

const pct = (n) => `${Math.round(n * 100)}%`;

async function main() {
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : SCENARIOS.length;
  const scenarios = SCENARIOS.slice(0, limit);
  console.log(`Core 3.1 A/B eval → ${BASE_URL}`);
  console.log(`Variants: ${VARIANTS.join(' vs ')} | Judge: ${OPENAI_API_KEY ? JUDGE_MODEL : 'off (deterministic)'} | Scenarios: ${scenarios.length}\n`);

  const agg = {}; // variant -> metric -> {pass,total}
  for (const v of VARIANTS) agg[v] = Object.fromEntries(METRICS.map((m) => [m, { pass: 0, total: 0 }]));
  const sampleDiffs = [];

  for (const sc of scenarios) {
    const perVariant = {};
    for (const v of VARIANTS) {
      const controller = v === 'controller';
      try {
        const r = await runVariant(sc, controller);
        perVariant[v] = r;
        for (const s of r.scores) for (const m of METRICS) { agg[v][m].total++; if (s[m]) agg[v][m].pass++; }
      } catch (e) {
        console.error(`  ${sc.name} [${v}] failed: ${e.message}`);
      }
    }
    // Capture the last-turn reply of each variant for human side-by-side.
    if (perVariant.controller && perVariant.baseline) {
      const li = perVariant.controller.replies.length - 1;
      sampleDiffs.push({ name: sc.name, user: sc.turns[li], controller: perVariant.controller.replies[li], baseline: perVariant.baseline.replies[li] });
    }
    process.stdout.write('.');
  }
  console.log('\n');

  // Per-metric side-by-side.
  const rate = (v, m) => (agg[v][m].total ? agg[v][m].pass / agg[v][m].total : 0);
  const overall = (v) => { const t = METRICS.reduce((a, m) => a + agg[v][m].total, 0); const p = METRICS.reduce((a, m) => a + agg[v][m].pass, 0); return t ? p / t : 0; };

  console.log('Metric'.padEnd(30) + VARIANTS.map((v) => v.padStart(12)).join('') + (VARIANTS.length === 2 ? '     Δ' : ''));
  console.log('─'.repeat(30 + VARIANTS.length * 12 + 6));
  for (const m of METRICS) {
    let row = m.padEnd(30) + VARIANTS.map((v) => pct(rate(v, m)).padStart(12)).join('');
    if (VARIANTS.length === 2) {
      const d = Math.round((rate('controller', m) - rate('baseline', m)) * 100);
      row += `   ${d >= 0 ? '+' : ''}${d}%`;
    }
    console.log(row);
  }
  console.log('─'.repeat(30 + VARIANTS.length * 12 + 6));
  let orow = 'OVERALL'.padEnd(30) + VARIANTS.map((v) => pct(overall(v)).padStart(12)).join('');
  if (VARIANTS.length === 2) orow += `   ${overall('controller') - overall('baseline') >= 0 ? '+' : ''}${Math.round((overall('controller') - overall('baseline')) * 100)}%`;
  console.log(orow);

  // A few human-readable side-by-side samples.
  console.log('\n── Side-by-side (final turn of a few scenarios) ─────────────');
  for (const d of sampleDiffs.slice(0, 5)) {
    console.log(`\n[${d.name}] user: ${d.user}`);
    console.log(`  baseline:   ${d.baseline.replace(/\n+/g, ' ').slice(0, 220)}`);
    console.log(`  controller: ${d.controller.replace(/\n+/g, ' ').slice(0, 220)}`);
  }

  // Depth comparison (controller on).
  console.log('\n── Depth comparison (controller on) ─────────────────────────');
  for (const depth of ['quick', 'balanced', 'deep', 'abstract']) {
    try {
      const reply = await ask([{ role: 'user', content: DEPTH_SCENARIO.turns[0] }], { controller: true, depth });
      console.log(`  [${depth}] ${reply.replace(/\n+/g, ' ').slice(0, 200)}`);
    } catch (e) { console.log(`  [${depth}] error: ${e.message}`); }
  }

  if (VARIANTS.length === 2) {
    const delta = Math.round((overall('controller') - overall('baseline')) * 100);
    console.log(`\nResult: controller ${delta >= 0 ? 'improves' : 'regresses'} overall progression by ${Math.abs(delta)}% vs baseline.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
