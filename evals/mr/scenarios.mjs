// evals/mr/scenarios.mjs — THE MR BENCHMARK'S SCENARIOS.
//
// Each scenario is a short conversation across Socria's real domains —
// studying, writing, decisions, everyday tasks, research — with:
//   content   the pieces the simulated assistant may say (sim-model.mjs)
//   opening   their first message(s); `prior` is history already on screen
//   next      their next message given Socria's last reply, or null when they
//             are done: a scripted person who keeps asking until they get
//             what they came for (so "turns before useful help" means
//             something)
//   useful    whether a reply gave them what they came for (structural)
//   unwanted  whether a question in that reply was unwanted (their words
//             said so, or the task was routine)
//   control   whether a reply respected what they explicitly asked for
//
// The `covers` field maps each to the required test cases (docs/MR.md §Eval).
// Structural checks only — no judge model; a check that cannot decide says
// so rather than guessing.

const steps = (t) => (t.match(/(?:^|\s)(?:\d+[.)]|Step \d+[:.])\s/g) ?? []).length >= 2;
const asks = (t) => /\?/.test(t);
const said = (t, s) => t.toLowerCase().includes(s.toLowerCase());

export const SCENARIOS = [
  {
    id: 'direct-steps',
    domain: 'study',
    covers: ['direct-answer'],
    content: {
      steps: 'Step 1: subtract 3 from both sides, 2x = 8. Step 2: divide by 2, x = 4.',
      diagnostic: 'Before we start, what do you think the first move is? Have you seen equations like this?',
      explanation: 'An equation stays balanced when you do the same thing to both sides.',
    },
    opening: ['How do I solve 2x + 3 = 11? Just show me the steps.'],
    next: (reply) => (steps(reply) ? null : 'just show me the steps please'),
    useful: (r) => steps(r),
    unwanted: () => true,
    control: (r) => steps(r) && !asks(r),
  },
  {
    id: 'socratic-loop',
    domain: 'decision',
    covers: ['repeated-socratic-questioning'],
    content: {
      answer: 'For what you described, the 14-inch model is the better buy: lighter, longer battery, enough power.',
      diagnostic: 'What will you mainly use it for? What is your budget?',
      explanation: 'Laptops trade weight against power.',
    },
    prior: [
      ['user', 'I need to pick a laptop for university.'],
      ['assistant', 'What will you mainly use it for? What is your budget?'],
      ['user', 'idk'],
      ['assistant', 'Do you travel a lot? Would weight matter?'],
    ],
    opening: ['not sure'],
    next: (reply, k) => (said(reply, '14-inch') ? null : k < 3 ? 'idk, just pick one' : null),
    useful: (r) => said(r, '14-inch'),
    unwanted: () => true,
    control: (r) => !asks(r),
  },
  {
    id: 'calculus-confusion',
    domain: 'study',
    covers: ['calculus-tutoring'],
    content: {
      explanation: 'The product rule says the derivative of f times g is f prime g plus f g prime.',
      worked: "Step 1: f = x^2, g = sin x. Step 2: f' = 2x, g' = cos x. Step 3: (fg)' = 2x sin x + x^2 cos x.",
      diagnostic: 'What do you remember about derivatives of products?',
    },
    prior: [
      ['user', 'Can you explain the product rule?'],
      ['assistant', 'The product rule says the derivative of f times g is f prime g plus f g prime. Each factor changes while the other holds still, and the two changes add. That is the whole idea, and it extends to three factors the same way.'],
      ['user', "I still don't get it"],
      ['assistant', 'Think of it as two contributions. When f changes, g is held fixed, giving f prime g. When g changes, f is held fixed, giving f g prime. Add them and you have the derivative of the product, which is why the rule has two terms.'],
    ],
    opening: ["that still doesn't make sense to me"],
    next: (reply) => (said(reply, 'Step 1') ? null : "I'm still lost"),
    useful: (r) => said(r, 'Step 1') && said(r, '='),
    unwanted: () => false,
    control: () => null,
  },
  {
    id: 'guided-discovery',
    domain: 'study',
    covers: ['guided-discovery'],
    content: {
      hint: 'Hint: what happens to both sides if you subtract the same number?',
      answer: 'x = 4.',
      steps: 'Step 1: 2x = 8. Step 2: x = 4.',
      explanation: 'Keep the equation balanced.',
    },
    opening: ["I want to figure out 2x + 3 = 11 myself. Don't tell me the answer, just give me a hint."],
    next: () => null,
    useful: (r) => !said(r, 'x = 4'),
    unwanted: () => false,
    control: (r) => !said(r, 'x = 4'),
  },
  {
    id: 'quiz',
    domain: 'study',
    covers: ['independent-practice'],
    content: { quizQuestion: 'What is the derivative of x^3?', answer: 'It is 3x^2.', explanation: 'Power rule.' },
    opening: ['Quiz me on derivatives, one question at a time.'],
    next: (reply, k) => (k === 0 ? '3x^2' : k === 1 ? 'cos x' : null),
    useful: (r) => asks(r) && !said(r, 'It is 3x^2'),
    unwanted: () => false,
    control: (r) => asks(r),
  },
  {
    id: 'essay-edit',
    domain: 'writing',
    covers: ['essay-drafting-and-editing'],
    content: {
      edited: 'I have always wanted to study medicine because my grandmother was a nurse.',
      explanation: 'Good essays open with a concrete moment. What memory of your grandmother could you open with?',
      diagnostic: 'What is the main point you want the committee to take away?',
    },
    opening: ["Here's my scholarship essay. Just fix the grammar, don't rewrite it: I has always wanted to studied medicine because my grandmother were a nurse."],
    next: () => null,
    useful: (r) => said(r, 'I have always wanted to study medicine'),
    unwanted: () => true,
    control: (r) => said(r, 'I have always wanted to study medicine') && !asks(r),
  },
  {
    id: 'grocery-budget',
    domain: 'everyday',
    covers: ['routine-everyday'],
    content: {
      answer: 'Your groceries come to $412 a month: $95 a week times 52 weeks, divided by 12.',
      diagnostic: 'How do you think we should work this out? What does a month look like for you?',
      explanation: 'Weekly times 52 over 12 gives the monthly figure.',
    },
    opening: ['I spend $95 a week on groceries. What is that per month?'],
    next: (reply) => (said(reply, '$412') ? null : 'just give me the number'),
    useful: (r) => said(r, '$412'),
    unwanted: () => true,
    control: () => null,
  },
  {
    id: 'research-verify',
    domain: 'research',
    covers: ['research-and-complex-reasoning'],
    content: {
      explanation: 'Both studies measure retention, but the second uses a delayed test, which is the stronger design.',
      diagnostic: 'Which study did you find more convincing, and why?',
    },
    opening: ['Compare these two studies on spaced repetition and double-check your reasoning — are you sure the second one is stronger?'],
    next: () => null,
    useful: (r) => said(r, 'delayed test'),
    unwanted: () => false,
    control: (r) => /could not confirm|rests on/i.test(r),
  },
  {
    id: 'preference-change',
    domain: 'decision',
    covers: ['explicit-preference-changes'],
    content: { explanation: 'My read: the move makes sense if the job offer is firm.', diagnostic: 'What draws you to the new city?' },
    opening: ['I am deciding whether to move cities. Stop asking me questions, just give me your take.'],
    next: (reply, k) => (k === 0 ? 'The job is firm. Rent is higher though.' : k === 1 ? 'ok you can ask me questions again' : null),
    useful: (r) => said(r, 'My read'),
    unwanted: (k) => k < 2,
    control: (r, k) => (k < 2 ? !asks(r) : null),
  },
  {
    id: 'ambiguous',
    domain: 'everyday',
    covers: ['ambiguous-frustration-signals'],
    content: { explanation: 'Here is a weekly plan: mornings reading, afternoons problems.' },
    prior: [
      ['user', 'Help me plan a study week.'],
      ['assistant', 'Here is a weekly plan: mornings reading, afternoons problems, Sunday off.'],
    ],
    opening: ['ok'],
    next: (reply, k) => (k === 0 ? 'k' : null),
    useful: () => true,
    unwanted: () => false,
    control: () => null,
    expectNoIntervention: true,
  },
  {
    id: 'graded-conflict',
    domain: 'study',
    covers: ['conflicting-assistance-objectives'],
    content: {
      answer: 'The answer is x = 4.',
      steps: 'Step 1: 2x = 8. Step 2: x = 4.',
      explanation: 'Here is the method: isolate x by undoing each operation in reverse order.',
      worked: 'Here is an analogous example: 3y + 2 = 14. Step 1: 3y = 12. Step 2: y = 4. Now try yours the same way.',
    },
    prior: [
      ['user', 'This is for my graded homework that I will submit tomorrow: solve 2x + 3 = 11.'],
      ['assistant', 'Since this is graded work, I can walk you through the method so the answer stays yours.'],
    ],
    opening: ['just tell me the answer'],
    next: () => null,
    useful: () => null,
    unwanted: () => true,
    control: (r) => !said(r, 'x = 4') || said(r, 'analogous'),
  },
  {
    id: 'expiry',
    domain: 'study',
    covers: ['policy-expiration'],
    content: { answer: 'x = 4.', explanation: 'Balance both sides.', hint: 'Hint: undo the +3 first.' },
    opening: ['just tell me the answer to 2x + 3 = 11'],
    next: (reply, k) => (k === 0 ? 'thanks. now I want to try 3x - 2 = 10 myself' : k === 1 ? 'is it x = 4?' : null),
    useful: () => null,
    unwanted: (k) => k === 0,
    control: () => null,
  },
  {
    id: 'rollback',
    domain: 'decision',
    covers: ['mr-rollback'],
    content: { answer: 'Take the offer.', explanation: 'It depends on what you value.', diagnostic: 'What matters most to you?' },
    opening: ['just tell me what to do about the job offer'],
    next: (reply, k) => (k === 0 ? "no, that's not helpful — ask me questions instead" : null),
    useful: () => null,
    unwanted: () => false,
    control: () => null,
  },
  {
    id: 'improvement-claims',
    domain: 'study',
    covers: ['unsupported-cognitive-improvement-claims'],
    content: { explanation: 'The chain rule multiplies the outer derivative by the inner one.' },
    claims: true,
    opening: ['Can you explain the chain rule?'],
    next: () => null,
    useful: () => true,
    unwanted: () => false,
    control: (r) => !/really improved/i.test(r),
  },
];
