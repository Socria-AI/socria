#!/usr/bin/env node
// evals/challenge/run.mjs — THE CHALLENGE BENCHMARK (docs/LOGOS-6-PLAN.md §7.B), a run.
//
//   node evals/challenge/run.mjs                    every case, three systems, on the live model (OPENAI_API_KEY)
//   node evals/challenge/run.mjs --structure-only   no model: what the structure alone finds (Logos 6's fallback)
//   node evals/challenge/run.mjs --fake             a scripted model that quotes each planted flaw — checks the plumbing
//   node evals/challenge/run.mjs --only stu-01,fou-03 --model gpt-6.1-terra
//
// THE THREE SYSTEMS, on the same model:
//   logos6     the shipped engine: what the structure shows, found in code; the prompt (lib/challenge/challenge-prompt.ts);
//              every finding through the gate (lib/challenge/challenge-gate.ts). What a person would see.
//   plain      what a frontier assistant does: the person's messages as a conversation, then "What am I missing?" —
//              no structure, no gate. Its answer is split into points.
//   logos55    Logos 5.5's challenge panel on the line's main card (lib/logos-explore.ts buildChallengePrompt).
//
// Each run writes evals/challenge/runs/<stamp>/<case>.json and run.json. Grade it with grade.mjs. Nothing here is a
// result until a run has been graded — and the judged half (precision: real and new / real but known / wrong) needs
// raters: grade.mjs writes the blind packets for them.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const MODE = flag('--structure-only') ? 'structure' : flag('--fake') ? 'fake' : 'live';
const ONLY = (opt('--only') ?? '').split(',').filter(Boolean);
const MODEL = opt('--model') ?? process.env.OPENAI_MODEL_LOGOS_CHALLENGE ?? 'gpt-6.1-terra';

// ── the modules under test, bundled as they ship ────────────────────────────────────────────────────────────────
const OUT = join(here, '.build');
mkdirSync(OUT, { recursive: true });
await build({
  stdin: {
    contents: [
      "export * from '@/lib/challenge/challenge';",
      "export { structureFindings } from '@/lib/challenge/challenge-targets';",
      "export { gate } from '@/lib/challenge/challenge-gate';",
      "export { CHALLENGE_SYSTEM, challengeUser } from '@/lib/challenge/challenge-prompt';",
      "export { weightOf } from '@/lib/logos6/support';",
      "export { sanitizeMap } from '@/lib/logos';",
      "export { buildChallengePrompt } from '@/lib/logos-explore';",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, 'engine.mjs'),
  tsconfig: join(ROOT, 'tsconfig.json'),
  alias: { 'server-only': join(ROOT, 'test', 'helpers', 'server-only-shim.mjs') },
  external: ['openai', 'undici', 'react', 'react-dom'],
  logLevel: 'error',
});
const E = await import(pathToFileURL(join(OUT, 'engine.mjs')).href + `?t=${Date.now()}`);

const data = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));
const cases = data.cases.filter((c) => !ONLY.length || ONLY.includes(c.id));

// ── the model ───────────────────────────────────────────────────────────────────────────────────────────────────
let openai = null;
if (MODE === 'live') {
  if (!process.env.OPENAI_API_KEY) {
    console.error('No OPENAI_API_KEY: run with --structure-only or --fake, or set a key.');
    process.exit(1);
  }
  const { default: OpenAI } = await import('openai');
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/** The scripted model: Logos 6 quotes each planted flaw where it lives; the plain one restates them; nothing on sound cases. */
function fakeModel(c, system) {
  const flaws = c.flaws ?? [];
  if (system === 'logos6') {
    return JSON.stringify({
      findings: flaws.map((f) => ({ kind: f.kind, text: `${f.what}`, quotes: [{ quote: f.quote }], confidence: 'high', settle: 'Check it.' })),
      ...(flaws.length ? {} : { why: 'Each step is supported by what you said.' }),
    });
  }
  if (system === 'logos55') return JSON.stringify({ framing: 'x', points: flaws.map((f) => f.what), connection: '', question: '' });
  return flaws.length ? flaws.map((f, i) => `${i + 1}. ${f.what}`).join('\n') : 'This looks solid to me.';
}

async function complete(messages, json, c, system) {
  if (MODE === 'fake') return fakeModel(c, system);
  const r = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 1100,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages,
  });
  return r.choices?.[0]?.message?.content ?? '';
}

// ── one case ────────────────────────────────────────────────────────────────────────────────────────────────────
function materialOf(c) {
  const map = E.sanitizeMap(c.map ?? { nodes: [], edges: [] }, { trust: 'stored' });
  const said = c.said.map((t, i) => ({ id: `m${i + 1}`, text: t }));
  const sources = (c.sources ?? []).map((s) => ({ key: s.key, text: s.text, name: s.name, doc: s.key[0], block: `p${s.key.slice(1)}` }));
  const structural = E.structureFindings(map, { kind: 'line' });
  return { map, said, sources, structural };
}

/** A prose answer, as points: numbered or bulleted lines, else sentences. */
function pointsOf(text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const marked = lines.filter((l) => /^(?:\d+[.)]|[-*•])\s+/.test(l)).map((l) => l.replace(/^(?:\d+[.)]|[-*•])\s+/, ''));
  if (marked.length) return marked;
  return String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
}

async function runCase(c) {
  const m = materialOf(c);
  const out = { id: c.id, segment: c.segment, sound: c.sound, systems: {} };
  const material = { said: m.said, ideas: m.map.nodes, sources: m.sources, considered: [], structural: m.structural, weightOf: (id) => E.weightOf(m.map, id) };

  // logos6
  if (MODE === 'structure') {
    const { findings } = E.gate(null, material);
    out.systems.logos6 = { findings, structural: true };
  } else {
    const user = E.challengeUser({ said: m.said, ideas: m.map.nodes, sources: m.sources, structural: m.structural, focus: { kind: 'line' } });
    let raw = null;
    try {
      raw = JSON.parse(await complete([{ role: 'system', content: E.CHALLENGE_SYSTEM }, { role: 'user', content: user }], true, c, 'logos6'));
    } catch (e) {
      out.systems.logos6 = { error: String(e?.message ?? e).slice(0, 200) };
    }
    if (raw) {
      const { findings, dropped } = E.gate(raw, material);
      out.systems.logos6 = { findings, dropped, holds: !findings.length, why: raw.why ?? '' };
    }
  }
  if (MODE === 'structure') return out;

  // plain: the conversation, then the question, as any assistant would get it
  try {
    const convo = [...c.said.map((t) => ({ role: 'user', content: t })), ...(c.sources?.length ? [] : [])];
    const docs = c.sources?.length ? `\n\n(Attached: ${c.sources.map((s) => `${s.name ?? s.key}: ${s.text}`).join(' | ')})` : '';
    const text = await complete(
      [{ role: 'system', content: 'You are a helpful assistant.' }, ...convo.slice(0, -1), { role: 'user', content: `${convo[convo.length - 1].content}${docs}\n\nWhat am I missing?` }],
      false,
      c,
      'plain'
    );
    out.systems.plain = { findings: pointsOf(text).map((t, i) => ({ id: `p${i + 1}`, text: t })), raw: text.slice(0, 4000) };
  } catch (e) {
    out.systems.plain = { error: String(e?.message ?? e).slice(0, 200) };
  }

  // logos55: Explore's challenge panel on the line's main card (the most connected of theirs, else the first message)
  try {
    const main = [...m.map.nodes].sort((a, b) => m.map.edges.filter((e) => e.from === b.id || e.to === b.id).length - m.map.edges.filter((e) => e.from === a.id || e.to === a.id).length)[0];
    const label = main?.label ?? c.said[0].slice(0, 120);
    const sys = E.buildChallengePrompt(label, main?.type ?? 'claim', c.said.map((t) => `User: ${t}`).join('\n'), (c.sources ?? []).map((s) => s.text).join('\n'));
    const text = await complete([{ role: 'system', content: sys }, { role: 'user', content: 'Compose the panel.' }], true, c, 'logos55');
    const p = JSON.parse(text);
    out.systems.logos55 = { findings: (Array.isArray(p.points) ? p.points : []).map((t, i) => ({ id: `q${i + 1}`, text: String(t) })) };
  } catch (e) {
    out.systems.logos55 = { error: String(e?.message ?? e).slice(0, 200) };
  }
  return out;
}

// ── the run ─────────────────────────────────────────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = join(here, 'runs', `${stamp}-${MODE}`);
mkdirSync(dir, { recursive: true });
let done = 0;
for (const c of cases) {
  const r = await runCase(c);
  writeFileSync(join(dir, `${c.id}.json`), JSON.stringify(r, null, 2));
  done++;
  if (done % 10 === 0) console.log(`  ${done}/${cases.length}`);
}
writeFileSync(join(dir, 'run.json'), JSON.stringify({ mode: MODE, model: MODE === 'live' ? MODEL : null, cases: cases.map((c) => c.id), at: stamp }, null, 2));
console.log(`run written: ${dir}\ngrade it: node evals/challenge/grade.mjs --run ${dir}`);
