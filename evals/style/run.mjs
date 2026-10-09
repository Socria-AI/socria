#!/usr/bin/env node
// evals/style/run.mjs — does choosing a Conversation Style change what Socria says?
//
// The unit tests (test/conversation-style.test.mjs) prove the CONFIGURATION
// changes: the prompt block, Core 4's per-turn register and proportion, and
// everything that must not move. This asks the next question — given those
// prompts, do the replies actually differ, in the directions each style
// promises, without breaking what no style may break?
//
//   node evals/style/run.mjs prompts --out <dir>
//       The exact system prompt for every (product, style, scenario):
//       <dir>/core/<style>/<id>.txt (Core 4, with that turn's decision and
//       register) and <dir>/logos/<style>.txt (Logos chat).
//   node evals/style/run.mjs live --out <dir>
//       Ask the production models (OPENAI_API_KEY; OPENAI_MODEL_CORE_4 and
//       OPENAI_MODEL_LOGOS as the routes read them). Writes the replies files.
//   node evals/style/run.mjs score --out <dir>
//       Metrics per style from <dir>/out/<product>-<style>.json, and a blind
//       packet for a judge: <dir>/blind.json (replies under letters) and
//       <dir>/blind-key.json (which letter is which style — keep it from the judge).
//   node evals/style/run.mjs judged --out <dir>
//       Scores <dir>/judge.json ({ "core/c1": { "A": "direct", … }, … })
//       against the key: how often a blind reader can tell the styles apart.
//
// STAND-IN OR LIVE. Without a key, the replies files are written by whoever
// stands in for the model — an engineer, or a subagent told to answer exactly
// as each prompt file says. That measures the prompts with a capable model,
// not the production model; only `live` measures the production model.
// docs/CONVERSATION-STYLE.md says which one each recorded result was.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const mode = process.argv[2];
const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const OUT = resolve(arg('out') || join(root, 'evals/style/runs/scratch'));

// ── the turns ───────────────────────────────────────────────────────────
//
// First turns only, so nothing but the style differs between arms. Each Core
// turn carries the state a reader would report for it, because Core 4's
// per-turn decision — and the register the style moves — is computed from it.
// The sixth of each is the one where the register is HELD: somebody close to
// giving up, who must not be pushed on whatever style they chose.

const inf = (value, confidence = 0.8) => ({ value, source: 'inferred', confidence, evidence: 'reader' });
export const CORE = [
  ['c1', "I'm thinking of quitting my stable job to open a bakery. My savings would cover about eight months. Thoughts?", { taskKind: 'decide', work: 'judgment', latest: 'question', stakes: inf('high') }],
  ['c2', 'Remote work obviously makes teams less productive — that is why every big company is ordering people back to the office.', { taskKind: 'explore', work: 'judgment', latest: 'claim', tensions: ['remote work against team productivity'] }],
  ['c3', "I'm studying for my calculus exam. Why is the derivative of x^2 equal to 2x? I want to understand it, not memorise it.", { taskKind: 'learn', work: 'explanation', latest: 'question', learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I want to understand it' } }],
  ['c4', "honestly I can't tell if I even like my own novel anymore lol", { taskKind: 'explore', work: 'conversation', latest: 'reaction' }],
  ['c5', "What's the actual difference between weather and climate?", { taskKind: 'learn', work: 'information', latest: 'question' }],
  ['c6', "I failed the exam again. I honestly don't know why I keep trying.", { taskKind: 'explore', work: 'reflection', latest: 'information' }],
];
export const LOGOS = [
  ['l1', 'Make a model of how a savings account grows with a monthly deposit and compound interest.'],
  ['l2', 'Remote work obviously makes teams less productive.'],
  ['l3', 'Raising the minimum wage always causes unemployment. That is just economics.'],
  ['l4', "Help me think through whether to take a job offer in another city — more money, but I'd leave my friends."],
  ['l5', 'What does a p-value actually mean?'],
  ['l6', "I've been stuck on this proof all day and I'm about to give up."],
];

async function modules() {
  const { buildAll, OUT: T } = await import(pathToFileURL(join(root, 'test/helpers/build.mjs')).href);
  await buildAll();
  const m = async (name) => import(pathToFileURL(join(T, `${name}.mjs`)).href);
  return {
    ...(await m('conversation-style')),
    ...(await m('socria-prompt')),
    ...(await m('logos-guidance')),
    LOGOS_CHAT_PROMPT: (await m('logos')).LOGOS_CHAT_PROMPT,
    LOGOS_MODEL: (await m('logos')).LOGOS_MODEL,
    ...(await m('cognition-state')),
    ...(await m('signals')),
    ...(await m('allocation')),
    ...(await m('budget')),
    ...(await m('intervene')),
    ...(await m('voice')),
  };
}

/** Every system prompt, exactly as the routes would assemble it for this first turn. */
async function prompts(M) {
  const out = [];
  for (const style of M.CONVERSATION_STYLES) {
    for (const [id, said, over] of CORE) {
      const state = { ...M.EMPTY_STATE, currentFocus: said, ...over };
      const signals = M.readSignals(said);
      const dim = M.diminishingReturns(state, signals, []);
      const budget = M.budgetFrom(state, signals, 0, 0, dim);
      const allocation = M.allocate({ state, signals, contract: M.NO_SIGNALS });
      const prefs = { readability: 'standard', length: 'standard', style };
      const decision = M.selectIntervention({ state, allocation, budget, diminishing: dim, signals, considered: [], lastUserText: said, prefs });
      const voice = M.voiceFor({ state, signals, decision, prefs });
      const cognition = { state: '\n\n' + M.renderState(state), move: '\n\n' + M.renderDecision(decision, allocation) + M.renderVoice(voice) };
      const system = M.buildSystemPrompt('core-4', 'balanced', null, null, null, null, null, cognition, null, style).prompt;
      out.push({ product: 'core', style, id, said, system, decision: { move: decision.type, proportion: decision.proportion, maxQuestions: decision.maxQuestions }, voice });
    }
    const system = M.LOGOS_CHAT_PROMPT + M.guidanceBlock('balanced', '', 'chat') + M.conversationStyleBlock(style, 'logos');
    for (const [id, said] of LOGOS) out.push({ product: 'logos', style, id, said, system });
  }
  return out;
}

const STYLES = ['thinker', 'direct', 'companion', 'challenger'];
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ── metrics: descriptive, never the verdict ─────────────────────────────
const count = (t, re) => (t.match(re) ?? []).length;
export function measure(text) {
  const t = String(text ?? '');
  return {
    words: t.split(/\s+/).filter(Boolean).length,
    questions: count(t, /\?/g),
    hedges: count(t, /\b(?:might|perhaps|maybe|possibly|it could be|it seems)\b/gi),
    exclaims: count(t, /!/g),
    together: count(t, /\b(?:we|let's|us|together)\b/gi),
    pressure: count(t, /\b(?:evidence|assum\w*|doesn'?t follow|does not follow|survivor\w*|counter\w*|steelman\w*|what would (?:change|make)|prove|test it|weakest)\b/gi),
  };
}

/** A fixed shuffle per item, so a packet can be rebuilt and checked. */
function order(key) {
  const h = createHash('sha256').update(key).digest();
  return STYLES.map((s, i) => [s, h[i]]).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}

if (mode === 'prompts') {
  const M = await modules();
  for (const p of await prompts(M)) {
    if (p.product === 'core') {
      mkdirSync(join(OUT, 'core', p.style), { recursive: true });
      writeFileSync(join(OUT, 'core', p.style, `${p.id}.txt`), p.system);
    } else {
      mkdirSync(join(OUT, 'logos'), { recursive: true });
      writeFileSync(join(OUT, 'logos', `${p.style}.txt`), p.system);
    }
  }
  writeFileSync(join(OUT, 'scenarios.json'), JSON.stringify({ core: CORE.map(([id, said]) => ({ id, said })), logos: LOGOS.map(([id, said]) => ({ id, said })) }, null, 2));
  console.log(`prompts written to ${OUT}`);
} else if (mode === 'live') {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('live needs OPENAI_API_KEY. Without one, write the replies files from the prompts (see the header).');
    process.exit(2);
  }
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: key });
  const M = await modules();
  const model = { core: process.env.OPENAI_MODEL_CORE_4 || M.CORE_4_MODEL, logos: process.env.OPENAI_MODEL_LOGOS || M.LOGOS_MODEL };
  const replies = {};
  for (const p of await prompts(M)) {
    const r = await openai.chat.completions.create({
      model: model[p.product],
      messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.said }],
      temperature: 0.7,
      max_tokens: 700,
    });
    ((replies[`${p.product}-${p.style}`] ??= {})[p.id] = r.choices?.[0]?.message?.content ?? '');
    process.stdout.write('.');
  }
  mkdirSync(join(OUT, 'out'), { recursive: true });
  for (const [k, v] of Object.entries(replies)) writeFileSync(join(OUT, 'out', `${k}.json`), JSON.stringify(v, null, 2));
  writeFileSync(join(OUT, 'out', 'SOURCE'), `live: ${model.core} (core), ${model.logos} (logos)\n`);
  console.log(`\nreplies written to ${join(OUT, 'out')}`);
} else if (mode === 'score') {
  const report = { byStyle: {}, byItem: {}, identical: [] };
  const blind = {}, keyOut = {};
  for (const product of ['core', 'logos']) {
    const ids = (product === 'core' ? CORE : LOGOS).map(([id]) => id);
    const replies = Object.fromEntries(STYLES.map((s) => {
      const f = join(OUT, 'out', `${product}-${s}.json`);
      return [s, existsSync(f) ? read(f) : null];
    }));
    for (const s of STYLES) {
      if (!replies[s]) continue;
      const ms = ids.map((id) => measure(replies[s][id]));
      const mean = (k) => +(ms.reduce((a, m) => a + m[k], 0) / ms.length).toFixed(2);
      report.byStyle[`${product}/${s}`] = Object.fromEntries(Object.keys(ms[0]).map((k) => [k, mean(k)]));
    }
    for (const id of ids) {
      const texts = STYLES.map((s) => replies[s]?.[id] ?? null);
      if (texts.some((t) => t == null)) continue;
      if (new Set(texts).size < texts.length) report.identical.push(`${product}/${id}`);
      report.byItem[`${product}/${id}`] = Object.fromEntries(STYLES.map((s, i) => [s, measure(texts[i])]));
      const ord = order(`${product}/${id}`);
      blind[`${product}/${id}`] = Object.fromEntries(ord.map((s, i) => ['ABCD'[i], replies[s][id]]));
      keyOut[`${product}/${id}`] = Object.fromEntries(ord.map((s, i) => ['ABCD'[i], s]));
    }
  }
  writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, 'blind.json'), JSON.stringify(blind, null, 2));
  writeFileSync(join(OUT, 'blind-key.json'), JSON.stringify(keyOut, null, 2));
  console.log('mean per reply, by product and style:');
  for (const [k, v] of Object.entries(report.byStyle)) console.log(`  ${k.padEnd(18)} ${Object.entries(v).map(([a, b]) => `${a} ${b}`).join('  ')}`);
  console.log(`identical replies across styles: ${report.identical.length ? report.identical.join(', ') : 'none'}`);
  console.log(`blind packet: ${join(OUT, 'blind.json')} (key kept apart)`);
} else if (mode === 'judged') {
  const key = read(join(OUT, 'blind-key.json'));
  const judge = read(join(OUT, 'judge.json'));
  let right = 0, all = 0;
  const per = Object.fromEntries(STYLES.map((s) => [s, { right: 0, all: 0 }]));
  const confusion = Object.fromEntries(STYLES.map((s) => [s, Object.fromEntries(STYLES.map((t) => [t, 0]))]));
  const byProduct = { core: { right: 0, all: 0 }, logos: { right: 0, all: 0 } };
  for (const [item, labels] of Object.entries(key)) {
    const guess = judge[item] ?? {};
    for (const [letter, truth] of Object.entries(labels)) {
      const g = guess[letter];
      all++;
      per[truth].all++;
      byProduct[item.split('/')[0]].all++;
      if (g && STYLES.includes(g)) confusion[truth][g]++;
      if (g === truth) {
        right++;
        per[truth].right++;
        byProduct[item.split('/')[0]].right++;
      }
    }
  }
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');
  console.log(`a blind reader matched ${right}/${all} replies to their style (${pct(right, all)}; chance is 25%)`);
  for (const p of ['core', 'logos']) console.log(`  ${p}: ${byProduct[p].right}/${byProduct[p].all} (${pct(byProduct[p].right, byProduct[p].all)})`);
  for (const s of STYLES) console.log(`  ${s.padEnd(11)} ${per[s].right}/${per[s].all}   read as: ${Object.entries(confusion[s]).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  writeFileSync(join(OUT, 'judged.json'), JSON.stringify({ right, all, per, byProduct, confusion }, null, 2));
} else {
  console.log('usage: node evals/style/run.mjs <prompts|live|score|judged> --out <dir>');
  process.exit(mode ? 1 : 0);
}
