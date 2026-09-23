// The Core 4 scenario corpus: loading and validation.
//
// A scenario is a person, optionally a Project with instructions, and one or
// more SESSIONS of scripted user turns. Earlier sessions are history; every
// turn can carry EXPECTED BEHAVIOURAL PROPERTIES — never an expected sentence.
//
//   {
//     "id": "expert-003",
//     "category": "expert",
//     "persona": "what the person is like (never shown to either arm)",
//     "project": { "id": "p1", "name": "…", "instructions": "…" },     optional
//     "sessions": [ { "turns": [ { "user": "…", "expect": { … } } ] } ],
//     "notes": "what this scenario tests"
//   }
//
// expect (every field optional):
//   maxQuestions        0 | 1      questions the reply may put to the person
//   mustAnswer          true       the reply must contain the substantive answer / fix / correction
//   mustNotReveal       [regex]    strings that must not appear (withheld answers)
//   alreadyConsidered   [text]     things the person has already considered; the reply must not raise them as new
//   mustContribute      text       the kind of novel, useful contribution a strong reply makes (judged)
//   mustChallenge       true       the reply must push back on something specific
//   mustReference       text       something from earlier (this or a prior session) the reply should use
//   noQuestionEnding    true       the reply must not end with a question
//   stance              "peer" | "teacher" | "listener"  the register the moment calls for
//   notes               text

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
export const CORPUS_DIR = join(here, '..', 'scenarios');

export const CATEGORIES = [
  'expert', 'learning', 'direct-answer', 'decision', 'research', 'debugging', 'math', 'adversarial',
  'creative', 'factual', 'reflective', 'high-stakes', 'repeated-questioning', 'already-considered',
  'no-answer-request', 'expertise-mismatch', 'changing-goals', 'longitudinal',
];

export function validateScenario(s) {
  const errs = [];
  if (!s || typeof s !== 'object') return ['not an object'];
  if (!/^[a-z0-9-]+$/.test(s.id ?? '')) errs.push(`bad id ${s.id}`);
  if (!CATEGORIES.includes(s.category)) errs.push(`${s.id}: unknown category ${s.category}`);
  if (!Array.isArray(s.sessions) || !s.sessions.length) errs.push(`${s.id}: no sessions`);
  for (const [i, sess] of (s.sessions ?? []).entries()) {
    if (!Array.isArray(sess.turns) || !sess.turns.length) errs.push(`${s.id}: session ${i + 1} has no turns`);
    for (const t of sess.turns ?? []) {
      if (typeof t.user !== 'string' || !t.user.trim()) errs.push(`${s.id}: empty user turn`);
      if (t.expect?.mustNotReveal) {
        for (const r of t.expect.mustNotReveal) {
          try { new RegExp(r, 'i'); } catch { errs.push(`${s.id}: bad regex ${r}`); }
        }
      }
    }
  }
  if (s.project && (!s.project.id || !s.project.name)) errs.push(`${s.id}: project needs id and name`);
  return errs;
}

export function loadCorpus(dir = CORPUS_DIR) {
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const s of Array.isArray(raw) ? raw : [raw]) out.push({ ...s, file: f });
  }
  return out;
}
