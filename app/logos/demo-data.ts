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

/**
 * The same opening sentence, answered at each of the four registers.
 *
 * Depth is the setting people most expect to mean "longer", so the point of
 * showing it rather than describing it is that the four replies differ in
 * ALTITUDE, not word count: Quick names the split, Deep reads the wording it
 * came in, Abstract asks what the whole question is standing on. Balanced is
 * verbatim the reply in DEMO_TURNS, so the page never contradicts itself.
 *
 * All four end on a question. Depth changes how far the thinking goes; it
 * never buys a verdict.
 */
export const DEMO_DEPTH_ANSWERS: Record<string, { note: string; body: string }> = {
  quick: {
    note: 'a gut-check, in plain words',
    body: "Two reasons in one sentence, and only one of them is about the work. Would you still want it if the pay were identical?",
  },
  balanced: {
    note: 'the everyday register — a thoughtful mentor, at your pace',
    body: "Three years of the same problems is a real reason to leave. The money is a separate one — and you've put them in the same sentence, as though the first were evidence for the second. What would the new role teach you that this one has stopped teaching you?",
  },
  deep: {
    note: 'slow, rigorous, reading the reasoning itself',
    body: "Look at the order you said it in. The money came first, plainly. The stagnation came second, behind an “honestly” — which is the word people put in front of the reason they actually believe. The one you trust is the one you hedged.\n\nAnd the two measure different things. A raise prices the skills you already have; growth is about the ones you don't. They track each other often enough to feel like one measure, and they come apart precisely in roles that pay well for learning you've already finished.\n\nWhich of the two would you defend to someone who thought you were making a mistake?",
  },
  abstract: {
    note: 'the furthest register — principles, structures, first causes',
    body: "Underneath this is a question about what a career is for, and you're holding two answers at once.\n\nIf it's a store of value, the raise settles it and the boredom is a cost you're choosing to pay. If it's a sequence of problems that keep changing you, the raise is close to irrelevant and the boredom is the entire finding. Most people carry both accounts and never have to choose, because the two usually recommend the same job. Yours have come apart, which is why the sentence needed a “so” to hold together.\n\nWhich account were you reasoning from when you wrote “stopped growing”?",
  },
};

/**
 * The Board, drawn in the order it is actually worked — each step with the
 * line that names what just happened. The mistake is step four and the
 * correction is step five, because that sequence is the whole argument for
 * the Board: the wrong turn stays on the page.
 */
export const DEMO_BOARD_STEPS: { id: string; say: string }[] = [
  { id: 'g1', say: 'the equation you were handed' },
  { id: 'u1', say: '…and what you are after' },
  { id: 's1', say: 'factored — the first real move' },
  { id: 'e1', say: 'set each factor to zero, and slip a sign' },
  { id: 'r1', say: 'struck through, the fix beside it — nothing erased' },
];

/**
 * What each of the four moves actually returns, for the assumption node
 * "More money means progress".
 *
 * Written to the same ExploreResult shape the routes produce, so the page can
 * render them through the app's own result markup. They also demonstrate the
 * boundary: each ends on a question rather than a verdict, and Trace quotes
 * the person verbatim instead of paraphrasing them.
 */
export const DEMO_MOVE_RESULTS: Record<
  'explore' | 'challenge' | 'research' | 'trace',
  {
    concept: string;
    framing: string;
    points?: string[];
    origins?: { who: 'you' | 'logos'; quote: string }[];
    lineage?: string[];
    connection: string;
    question: string;
    sources?: { title: string; site: string; cited?: boolean }[];
  }
> = {
  explore: {
    concept: 'Compensation as a proxy',
    framing:
      'A raise measures what a market will pay for the work you can already do. Progress measures what you will be able to do next. They move together often enough to feel like one thing, and come apart exactly when a role pays well for skills you have finished learning.',
    connection:
      'You put the money and the stagnation in the same sentence, as though the first answered the second.',
    question: 'If the offer paid the same as your current job, would you still want it?',
  },
  challenge: {
    concept: 'Where this breaks',
    framing: 'Three ways the assumption could be wrong in your case.',
    points: [
      'A higher salary can price the same work — the market rate moved, not your ceiling.',
      'Senior titles often trade learning for scope: more people, fewer new problems.',
      'The thing you called stagnation might be the team, not the role. That travels.',
    ],
    connection:
      'You have evidence for the boredom — three years, same problems. You have none yet for the new role being different.',
    question: 'What would you need to see in the first month to know it was not the same job with a bigger number?',
  },
  research: {
    concept: 'Pay and skill growth',
    framing:
      'Studies of job switching find compensation jumps are driven largely by market timing and negotiation, and correlate weakly with reported skill development in the following year.',
    points: [
      'Salary gains from switching are typically largest in the first year, then flatten.',
      'Self-reported learning tracks task novelty and autonomy far more closely than pay.',
    ],
    connection: 'Which suggests the raise and the growth are worth judging separately — as you were doing before you joined them.',
    question: 'What in the new role is genuinely new work, not the same work at a higher grade?',
    sources: [
      { title: 'Job mobility and wage growth over a career', site: 'nber.org', cited: true },
      { title: 'What actually predicts skill development at work', site: 'hbr.org' },
    ],
  },
  trace: {
    concept: '',
    framing: '',
    origins: [
      {
        who: 'you',
        quote:
          'I got an offer with a lot more money. I think I should take it — honestly I’ve stopped growing where I am.',
      },
      { who: 'you', quote: '…I guess I’m treating the raise as proof it’s a step up.' },
    ],
    lineage: ['Sits under: “It pays more”', 'Pulls against: “Security ↔ growth”'],
    connection:
      'It entered as a link between two separate reasons, then you named the link yourself a turn later.',
    question: 'Does it still hold now that you have seen it written down?',
  },
};
