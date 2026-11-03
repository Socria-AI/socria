// test/helpers/routing-corpus.mjs — TURNS, AND HOW MUCH EACH NEEDS.
//
// A labelled set across the subjects people bring to Logos 5, for the router's
// tests (test/model-router.test.mjs) and its benchmark (scripts/bench-routing.mjs).
// Each turn carries what the chat route would know about it — the facts
// lib/model-router.ts levelOf reads — and the level a careful person would give
// it. `share` is roughly how often turns like it arrive, from the mix the
// engine's own evals assume (lib/runtime evals): talk is common, proofs rare.

export const CORPUS = [
  // ── talk: light ──
  { subject: 'talk', text: 'thanks!', exchange: 'social', expect: 'light', share: 6 },
  { subject: 'talk', text: 'hi', exchange: 'social', expect: 'light', share: 4 },
  { subject: 'talk', text: 'ok got it', exchange: 'conversation', expect: 'light', share: 5 },
  { subject: 'talk', text: 'haha that is a good way to put it', exchange: 'playful', expect: 'light', share: 2 },
  { subject: 'talk', text: 'rough day honestly', exchange: 'personal', expect: 'light', share: 2 },
  { subject: 'talk', text: 'Good morning!', exchange: 'social', expect: 'light', share: 2 },
  { subject: 'talk', text: 'perfect, thank you so much', exchange: 'social', expect: 'light', share: 3 },

  // ── everyday: standard ──
  { subject: 'everyday', text: 'What should I look for when buying a used bike?', exchange: 'task', move: 'inform', expect: 'standard', share: 5 },
  { subject: 'everyday', text: 'Help me write a short note to my landlord about the boiler.', exchange: 'task', move: 'construct', expect: 'standard', share: 4 },
  { subject: 'everyday', text: 'Is it worth getting a heat pump in a small flat?', exchange: 'task', move: 'explain', expect: 'standard', share: 3 },
  { subject: 'everyday', text: 'Plan a three-day trip to Lisbon on a budget.', exchange: 'task', move: 'construct', expect: 'standard', share: 3 },

  // ── study: standard, deep when it asks for rigour ──
  { subject: 'study', text: 'Explain photosynthesis simply.', exchange: 'task', move: 'explain', expect: 'standard', share: 4 },
  { subject: 'study', text: 'What caused the First World War?', exchange: 'task', move: 'explain', expect: 'standard', share: 3 },
  { subject: 'study', text: 'Quiz me on European capitals.', exchange: 'task', move: 'ask', expect: 'standard', share: 2 },
  { subject: 'study', text: 'Summarise chapter 3 of the reading for me.', exchange: 'task', move: 'inform', docs: 1, expect: 'deep', share: 2 },
  { subject: 'study', text: 'Compare and contrast Hobbes and Locke on the state of nature.', exchange: 'task', move: 'explain', expect: 'deep', share: 1 },

  // ── maths: deep when there is something to check or prove ──
  { subject: 'maths', text: 'Is the derivative of x^3 equal to 3x^2?', exchange: 'task', move: 'verify', mathCheck: true, expect: 'deep', share: 3 },
  { subject: 'maths', text: 'Prove that the square root of 2 is irrational.', exchange: 'task', move: 'explain', expect: 'deep', share: 1 },
  { subject: 'maths', text: 'I think the answer is 12, not 14 — you made a mistake.', exchange: 'disagreement', move: 'verify', pushback: true, mathCheck: true, expect: 'deep', share: 1,
    history: [{ role: 'user', content: 'What is 3 + 4 × 2 + 3?' }, { role: 'assistant', content: '3 + 4 × 2 + 3 = 14.' }] },
  { subject: 'maths', text: 'What is a derivative, in plain words?', exchange: 'task', move: 'explain', expect: 'standard', share: 2 },
  { subject: 'maths', text: 'Derive the quadratic formula step by step.', exchange: 'task', move: 'explain', expect: 'deep', share: 1 },

  // ── science and building: deep when something is built ──
  { subject: 'science', text: 'Why is the sky blue?', exchange: 'task', move: 'explain', expect: 'standard', share: 2 },
  { subject: 'science', text: 'Build a simulation of a pendulum I can play with.', exchange: 'task', move: 'construct', construct: 'simulation', expect: 'deep', share: 1 },
  { subject: 'science', text: 'Model how a pulsar beam sweeps.', exchange: 'task', move: 'construct', construct: 'model', expect: 'deep', share: 1 },

  // ── decisions and business ──
  { subject: 'decision', text: 'Should I take the job offer in Leeds?', exchange: 'task', move: 'perspective', expect: 'standard', share: 3 },
  { subject: 'decision', text: 'Walk me through the trade-offs of raising a seed round now versus in six months.', exchange: 'task', move: 'perspective', expect: 'deep', share: 1 },
  { subject: 'business', text: 'What is a good price for a weekly newsletter subscription?', exchange: 'task', move: 'inform', expect: 'standard', share: 2 },
  { subject: 'business', text: 'Here is our pricing doc — where does the logic fail?', exchange: 'task', move: 'challenge', docs: 1, expect: 'deep', share: 1 },

  // ── argument and writing ──
  { subject: 'argument', text: 'Steelman the case against remote work.', exchange: 'discussion', move: 'challenge', expect: 'deep', share: 1 },
  { subject: 'argument', text: 'I think social media has made people lonelier. Push back if I am wrong — I want the strongest counter-argument, the evidence on both sides, and where my reasoning is weakest, because I am writing an essay on it and need to get the argument right before Friday.', exchange: 'discussion', move: 'challenge', expect: 'deep', share: 1 },
  { subject: 'writing', text: 'Make this paragraph clearer.', exchange: 'task', move: 'construct', expect: 'standard', share: 3 },
  { subject: 'writing', text: 'What do you think of my opening line?', exchange: 'task', move: 'perspective', expect: 'standard', share: 2 },

  // ── coding ──
  { subject: 'coding', text: 'What does this error mean: TypeError undefined is not a function?', exchange: 'task', move: 'explain', expect: 'standard', share: 2 },
  { subject: 'coding', text: 'What is the time complexity of this sort, and can you optimise it?', exchange: 'task', move: 'explain', expect: 'deep', share: 1 },

  // ── many-part ──
  { subject: 'study', text: 'What is inflation? Why does it happen? Who does it hurt most? And what can a central bank do?', exchange: 'task', move: 'explain', expect: 'deep', share: 1 },
];
