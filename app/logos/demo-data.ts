// app/logos/demo-data.ts
//
// The canned reasoning the /logos page demonstrates with. It is deliberately
// one real conversation carried all the way through, rather than a different
// toy per section: the same question about a job offer produces the map, the
// lenses, the node actions and the draft, so a reader watches ONE line of
// thinking develop instead of meeting six unrelated screenshots.
//
// Every shape here is the app's own — LogosNode, LogosEdge, ThinkingMap — so
// these feed the real components rather than look-alikes of them.

import type { ThinkingMap } from '@/lib/logos';

/** The map as it stands a few turns into the conversation. */
export const DEMO_MAP: ThinkingMap = {
  context: 'deciding',
  nodes: [
    { id: 'q', type: 'question', label: 'Should I take the job?' },
    { id: 'pay', type: 'claim', label: 'It pays more', status: 'open' },
    { id: 'grow', type: 'claim', label: 'I’ve stopped growing', status: 'open' },
    { id: 'assume', type: 'assumption', label: 'More money means progress' },
    { id: 'tension', type: 'tension', label: 'Security ↔ growth' },
    { id: 'value', type: 'value', label: 'Work that keeps teaching me' },
    { id: 'eq', type: 'evidence', label: 'Three years, same problems', status: 'supported' },
  ],
  edges: [
    { from: 'q', to: 'pay', relation: 'depends' },
    { from: 'q', to: 'grow', relation: 'depends' },
    { from: 'pay', to: 'assume', relation: 'depends', strength: 'strong' },
    { from: 'grow', to: 'tension', relation: 'relates' },
    { from: 'pay', to: 'tension', relation: 'conflicts' },
    { from: 'value', to: 'grow', relation: 'supports' },
    { from: 'eq', to: 'grow', relation: 'supports', strength: 'strong' },
  ],
};

/** The same conversation, as it appears in the thread. */
export const DEMO_TURNS: { role: 'user' | 'assistant'; content: string }[] = [
  {
    role: 'user',
    content:
      "I got an offer with a lot more money. I think I should take it — honestly I've stopped growing where I am.",
  },
  {
    role: 'assistant',
    content:
      "Three years of the same problems is a real reason to leave. The money is a separate one — and you've put them in the same sentence.",
  },
  { role: 'user', content: "…I guess I'm treating the raise as proof it's a step up." },
  {
    role: 'assistant',
    content: 'That is the assumption worth testing. What would the new role teach you?',
  },
];

/** A mathematical map, for the Board and the Answer Guard. */
export const DEMO_MATH_MAP: ThinkingMap = {
  context: 'math',
  intent: 'learning',
  nodes: [
    { id: 'g1', type: 'given', label: 'quadratic', tex: 'x^2 - 5x + 6 = 0' },
    { id: 'u1', type: 'unknown', label: 'solve for x', tex: 'x' },
    { id: 's1', type: 'equation', label: 'factored', tex: '(x-2)(x-3) = 0' },
    {
      id: 'e1',
      type: 'error',
      label: 'sign slip',
      tex: 'x = -2,\\ -3',
      flag: 'error',
      note: 'the roots flip when you solve each factor',
    },
    { id: 'r1', type: 'result', label: 'the roots', tex: 'x = 2,\\ 3' },
  ],
  edges: [
    { from: 'g1', to: 's1', relation: 'transforms_to', op: 'factor' },
    { from: 's1', to: 'e1', relation: 'transforms_to', op: 'set each = 0' },
    { from: 'e1', to: 'r1', relation: 'revises', op: 'fix the sign' },
  ],
};
