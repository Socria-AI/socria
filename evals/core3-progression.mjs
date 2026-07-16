// evals/core3-progression.mjs
//
// Repeatable conversational eval for Socria Core 3.1.
//
// Unlike a prompt-in / answer-out test, each scenario is a SEQUENCE of user
// turns. We replay them against the real /api/chat route (so the actual
// system prompt + per-turn controller run), feeding each assistant reply
// back in, and score every assistant turn for progression.
//
// Usage:
//   1. Run the app:            npm run dev   (or point BASE_URL at a deploy)
//   2. In another terminal:    node evals/core3-progression.mjs
//
// Env:
//   BASE_URL          default http://localhost:3000
//   SOCRIA_ACCESS_KEY default "SMART" (sent as x-socria-key to skip auth)
//   OPENAI_API_KEY    if set, adds an LLM judge for the semantic checks;
//                     otherwise scoring is deterministic-only.
//   JUDGE_MODEL       default gpt-4o-mini
//
// Exit code is non-zero if the average progression score is below THRESHOLD.

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ACCESS_KEY = process.env.SOCRIA_ACCESS_KEY || 'SMART';
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const THRESHOLD = Number(process.env.EVAL_THRESHOLD || 0.7);

// --- Scenarios: ordered user turns. depth defaults to 'balanced'. ---------
const SCENARIOS = [
  {
    name: 'fear-of-failure',
    turns: [
      "Honestly, I'm afraid of failing.",
      'Success would mean achieving my goals.',
      'I need to clarify my goals first.',
    ],
  },
  {
    name: 'transferring-schools',
    turns: [
      "I'm not sure what to do.",
      "I'm thinking of transferring schools.",
      "I don't like it here.",
    ],
  },
  {
    name: 'startup-uncertainty',
    turns: [
      "I don't know if I should keep going with my startup.",
      "I'm afraid it won't work.",
      "I don't actually have much evidence either way.",
    ],
  },
  {
    name: 'relationship-conflict',
    turns: [
      'My partner and I keep fighting about the same thing.',
      'I guess I just want to know if I should stay.',
      'Maybe I already know the answer.',
    ],
  },
  {
    name: 'repeated-i-dont-know',
    turns: ['I feel stuck.', "I don't know.", "I don't know.", 'Not sure.'],
  },
  {
    name: 'already-concluded',
    turns: [
      "I've decided to take the job.",
      "I'm just a little nervous about it.",
      'But it feels right.',
    ],
  },
  {
    name: 'factual-question',
    turns: [
      'What actually is the sunk cost fallacy?',
      "Okay, so I think I'm doing that with this project.",
    ],
    expectDirectAnswerOnTurn: 0,
  },
  {
    name: 'contradiction',
    turns: [
      "I don't care what other people think.",
      "I'm mostly worried my parents will be disappointed.",
    ],
  },
];

const DEPTH_SCENARIO = {
  name: 'depth-comparison',
  turns: ["I can't tell if I want this career or just the idea of it."],
};

// --- Deterministic checks -------------------------------------------------
const BANNED = [
  /\bit sounds like\b/i,
  /\bthat sounds\b/i,
  /\bthat'?s understandable\b/i,
  /\bthat'?s (perfectly )?okay\b/i,
  /\bthat makes sense\b/i,
  /\bwhat are the main (factors|considerations|concerns|reasons)\b/i,
  /\bwhat are you hoping to (find|get|achieve)\b/i,
  /\bcan you (tell me more|elaborate)\b/i,
  /\bhow does that make you feel\b/i,
  /\bsignificant decision\b/i,
];
const DIRECTIVE = [/\byou should\b/i, /\bthe right choice\b/i, /\byou have to\b/i, /\byou need to (leave|stay|quit|go)\b/i];

const STOP = new Set('a an the is are was were be been to of and or but so in on at it this that i you your my me we they them for with about as if not no yes just really very more most'.split(' '));
function contentWords(s) {
  return (s.toLowerCase().match(/[a-z']+/g) || []).filter((w) => w.length > 3 && !STOP.has(w));
}
function overlapRatio(reply, userMsg) {
  const u = new Set(contentWords(userMsg));
  const r = contentWords(reply);
  if (!r.length || !u.size) return 0;
  const shared = r.filter((w) => u.has(w)).length;
  return shared / r.length;
}
function questionCount(s) {
  return (s.match(/\?/g) || []).length;
}

function deterministicScore(reply, userMsg, turnIndex) {
  const banned = BANNED.some((re) => re.test(reply));
  const paraphraseHeavy = reply.length < 220 && overlapRatio(reply, userMsg) > 0.45 && contentWords(reply).filter((w) => !contentWords(userMsg).includes(w)).length < 4;
  return {
    asksNecessaryQuestionOnly: questionCount(reply) <= 1,
    avoidsGenericTherapyLanguage: !banned,
    avoidsEmptyParaphrase: !paraphraseHeavy,
    preservesUserAgency: !DIRECTIVE.some((re) => re.test(reply)),
  };
}

// --- Optional LLM judge for the semantic checks ---------------------------
async function judge(thread, reply) {
  if (!OPENAI_API_KEY) return null;
  const sys =
    'You are a strict evaluator of a Socratic thinking assistant. Given the conversation so far and the assistant\'s latest reply, return ONLY JSON with booleans: {"usesPriorContext","addsNewInsight","movesConversationForward","synthesisTimingAppropriate"}. usesPriorContext=does the reply build on earlier turns (not just the last message). addsNewInsight=does it add a distinction/inference/connection rather than restate. movesConversationForward=does the picture change. synthesisTimingAppropriate=synthesis appears when enough has accumulated and not prematurely.';
  const user = `Conversation so far:\n${thread}\n\nLatest assistant reply:\n${reply}`;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0,
        response_format: { type: 'json_object' },
        max_tokens: 120,
      }),
    });
    const json = await res.json();
    return JSON.parse(json.choices?.[0]?.message?.content || '{}');
  } catch (e) {
    console.warn('  (judge failed:', e.message, ')');
    return null;
  }
}

// --- Drive one assistant turn through the real route ----------------------
async function askSocria(messages, depth = 'balanced') {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-socria-key': ACCESS_KEY },
    body: JSON.stringify({ messages, model: 'core-3', depth }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  return (await res.text()).trim();
}

function pct(n) {
  return `${Math.round(n * 100)}%`;
}

async function runScenario(sc) {
  console.log(`\n=== ${sc.name} ===`);
  const messages = [];
  const turnScores = [];
  for (let i = 0; i < sc.turns.length; i++) {
    const userMsg = sc.turns[i];
    messages.push({ role: 'user', content: userMsg });
    const reply = await askSocria(messages);
    messages.push({ role: 'assistant', content: reply });

    const det = deterministicScore(reply, userMsg, i);
    const thread = messages.slice(0, -1).map((m) => `${m.role}: ${m.content}`).join('\n');
    const j = await judge(thread, reply);
    const score = {
      usesPriorContext: j ? !!j.usesPriorContext : i > 0 && /\b(earlier|you said|you mentioned|before|a moment ago|started)\b/i.test(reply),
      addsNewInsight: j ? !!j.addsNewInsight : det.avoidsEmptyParaphrase,
      avoidsEmptyParaphrase: det.avoidsEmptyParaphrase,
      asksNecessaryQuestionOnly: det.asksNecessaryQuestionOnly,
      movesConversationForward: j ? !!j.movesConversationForward : det.avoidsEmptyParaphrase && det.avoidsGenericTherapyLanguage,
      preservesUserAgency: det.preservesUserAgency,
      avoidsGenericTherapyLanguage: det.avoidsGenericTherapyLanguage,
      synthesisTimingAppropriate: j ? !!j.synthesisTimingAppropriate : true,
    };
    turnScores.push(score);
    const passed = Object.values(score).filter(Boolean).length;
    const total = Object.values(score).length;
    console.log(`\n  [turn ${i + 1}] user: ${userMsg}`);
    console.log(`  socria: ${reply.replace(/\n+/g, ' ').slice(0, 240)}${reply.length > 240 ? '…' : ''}`);
    console.log(`  score: ${passed}/${total}  ${Object.entries(score).filter(([, v]) => !v).map(([k]) => '✗' + k).join(' ') || '✓ all'}`);
  }
  const flat = turnScores.flatMap((s) => Object.values(s));
  const ratio = flat.filter(Boolean).length / flat.length;
  console.log(`  scenario score: ${pct(ratio)}`);
  return ratio;
}

async function runDepthComparison() {
  console.log(`\n=== ${DEPTH_SCENARIO.name} (same prompt, four depths) ===`);
  for (const depth of ['quick', 'balanced', 'deep', 'abstract']) {
    try {
      const reply = await askSocria([{ role: 'user', content: DEPTH_SCENARIO.turns[0] }], depth);
      console.log(`\n  [${depth}] ${reply.replace(/\n+/g, ' ').slice(0, 260)}${reply.length > 260 ? '…' : ''}`);
    } catch (e) {
      console.log(`  [${depth}] error: ${e.message}`);
    }
  }
}

async function main() {
  console.log(`Core 3.1 progression eval → ${BASE_URL}`);
  console.log(`Judge: ${OPENAI_API_KEY ? JUDGE_MODEL : 'disabled (deterministic only)'}`);
  const ratios = [];
  for (const sc of SCENARIOS) {
    try {
      ratios.push(await runScenario(sc));
    } catch (e) {
      console.error(`  ${sc.name} failed: ${e.message}`);
    }
  }
  await runDepthComparison();

  const avg = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
  console.log('\n────────────────────────────────────────');
  console.log(`Overall progression score: ${pct(avg)} (threshold ${pct(THRESHOLD)})`);
  console.log(
    avg >= THRESHOLD
      ? '✓ PASS — replies build on context, add insight, and avoid the loop.'
      : '✗ BELOW THRESHOLD — inspect the ✗ turns above for reassure/paraphrase/broad-question regressions.'
  );
  console.log('\nOld behavior (Core-2-style, for comparison): acknowledgment → paraphrase → broad question, repeated each turn, no accumulation.');
  console.log('New behavior (target): each turn names what changed, connects to the thread, asks ≤1 narrow question (often none).');
  process.exit(avg >= THRESHOLD ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
