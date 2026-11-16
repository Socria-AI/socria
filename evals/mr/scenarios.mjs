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
const qmarks = (t) => (t.match(/\?/g) ?? []).length;

// Earlier replies the precision scenarios start from: each explains or suggests in 40 words or more and asks nothing.
const WINDOWS = 'On Windows, open Settings, then System, then Storage, and turn on Storage Sense. It clears temporary files and old downloads automatically, and you can run it now from the same page.';
const APPROACH =
  'Substitution works by spotting a function sitting inside another one, with its derivative multiplied alongside. In 2x e^(x^2), the inner function is x^2 and its derivative, 2x, is already there as a factor. So let u be the inner function, rewrite every piece of the integral in terms of u, and it turns into an integral you already know how to do.';
const SUGGEST1 =
  'Wifi that keeps dropping is often the laptop saving power. Open Device Manager, find your wireless adapter under Network adapters, open its properties, and on the Power Management tab untick the option that lets the computer turn the device off to save power. Then restart the laptop and use it as normal for a while.';
const SUGGEST2 =
  'Another common cause is an old network profile. Open Settings, go to Network and Internet, then Wi-Fi, choose Manage known networks, and forget your home network. Join it again with the password, and if the router offers separate 2.4 GHz and 5 GHz names, try the other band for a day.';

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
  {
    // A broad first question that one unsaid thing decides: the key point first, then at most one question.
    id: 'open-question',
    domain: 'research',
    covers: ['open-request'],
    content: {
      insight: 'AI is good at narrow problems with clear goals and plenty of examples, and weak where the goal is fuzzy or the data is thin.',
      diagnostic: 'Do you mean in your own work, or AI in general?',
      reading: 'Taking this as AI in general.',
      explanation:
        'Artificial intelligence has made striking progress in the last decade, yet its effect on everyday life can look smaller than the headlines promise. Part of the gap is expectation: demonstrations show a system at its best, while real deployments meet messy data, shifting goals and people who need to trust a result before they act on it. Organisations also move slowly. A tool that works in a laboratory still has to be connected to old software, approved by managers, checked by lawyers and taught to the staff who will use it, and each of those steps takes months. Then there is measurement. Many valuable tasks have no clear score, so it is hard to show that a model helps, and harder still to justify the cost of building around it. Data is another limit. Models learn from examples, and in many fields the examples are scarce, private or inconsistent, which leaves a system guessing where people most want certainty. Responsibility matters too: when a recommendation affects health, money or safety, someone must answer for a mistake, and that slows adoption in exactly the areas where the stakes are highest. Much of the real benefit is also quiet. Software that drafts a letter, sorts a queue or flags an error saves minutes for millions of people, but that rarely looks like a breakthrough. So the picture is less that the technology is failing and more that turning a capable model into a dependable service is slow, expensive and uneven work, done one organisation at a time.',
    },
    opening: ['Why is AI not solving problems?'],
    next: (reply, k) => (k === 0 ? 'In my own work: support tickets.' : null),
    useful: (r, k) => (k === 0 ? said(r, 'narrow problems') && qmarks(r) <= 1 : null),
    unwanted: () => false,
    control: () => null,
    wantsOneQuestion: true,
  },
  {
    // A clear question: nothing for MR to do.
    id: 'clear-explain',
    domain: 'study',
    covers: ['clear-question'],
    content: { explanation: 'Sunlight scatters off air molecules, and blue light scatters most, so the sky looks blue.' },
    opening: ['Why is the sky blue?'],
    next: () => null,
    useful: (r) => said(r, 'scatter'),
    unwanted: () => false,
    control: () => null,
    expectNoInterventionClear: true,
  },
  {
    // Stuck with their own work on the table: one concrete next step, no question back.
    id: 'stuck-next-step',
    domain: 'study',
    covers: ['stuck-with-own-work'],
    content: {
      nextStep: 'Next, write du = 2x dx, so the integral becomes the integral of e^u du; you can tell it worked because no x is left.',
      hint: 'Next, write du = 2x dx, so the integral becomes the integral of e^u du; you can tell it worked because no x is left.',
    },
    prior: [
      ['user', 'I want to learn substitution: integrate 2x e^(x^2) dx'],
      ['assistant', APPROACH],
    ],
    opening: ["I set u = x^2 but now I'm stuck on the next step"],
    next: () => null,
    useful: (r) => said(r, 'du = 2x dx'),
    unwanted: () => true,
    control: () => null,
  },
  {
    // They corrected the reading of their question: the answer to what they meant, no question.
    id: 'corrected',
    domain: 'everyday',
    covers: ['corrected-reading'],
    content: { answer: 'On a Mac, open Apple menu > System Settings > General > Storage and use the recommendations there.' },
    prior: [
      ['user', 'How do I free up disk space?'],
      ['assistant', WINDOWS],
    ],
    opening: ['No, I meant on my Mac'],
    next: () => null,
    useful: (r) => said(r, 'System Settings'),
    unwanted: () => true,
    control: (r) => !asks(r),
  },
  {
    // The last question asked for something they had already said.
    id: 'redundant',
    domain: 'everyday',
    covers: ['redundant-question'],
    content: { answer: 'On Windows 11, open Task Manager with Ctrl+Shift+Esc, sort by CPU and memory, and turn off the startup apps you do not need.' },
    prior: [
      ['user', 'my laptop is slow, it runs Windows 11'],
      ['assistant', 'Which operating system are you on?'],
    ],
    opening: ['I already told you, Windows 11'],
    // a second turn inside the 3-turn window, where ACS would ask again: the window keeps it to no question
    next: (reply, k) => (k === 0 ? 'ok, and what about the battery draining fast?' : null),
    useful: (r, k) => (k === 0 ? said(r, 'Task Manager') : null),
    unwanted: () => true,
    control: () => null,
  },
  {
    // Two suggested fixes have not worked: a check before another fix.
    id: 'still-failing',
    domain: 'everyday',
    covers: ['failed-fixes'],
    content: {
      check: "This assumed the router is fine: connect your phone to the same network for ten minutes; if it drops too, restart the router; if not, update the laptop's wifi driver.",
      answer: 'Try turning off the wifi adapter in Device Manager, waiting ten seconds and turning it back on.',
    },
    prior: [
      ['user', 'My laptop wifi keeps dropping.'],
      ['assistant', SUGGEST1],
      ['user', "still doesn't work"],
      ['assistant', SUGGEST2],
    ],
    opening: ['same error again'],
    next: () => null,
    useful: (r) => said(r, 'phone'),
    unwanted: () => true,
    control: () => null,
  },
  {
    // "I'm stuck" with nothing before it and nothing on screen: one plain question about what they are working on,
    // not generic advice for blocks of every kind (review N6, N16).
    id: 'stuck-unseen',
    domain: 'study',
    covers: ['stuck-work-not-shown'],
    content: {
      diagnostic: 'What are you working on? Paste the step you are on.',
      reading: 'Tell me the problem, or paste the step you are on, and I will take it from there.',
      explanation:
        'Being stuck is a normal part of working on a hard problem. Try breaking it into smaller parts, re-reading the question slowly, and writing down everything you already know. Often the block is one missing fact or one step that was skipped. Taking a short break and coming back also helps more than people expect.',
    },
    opening: ["I'm stuck"],
    next: () => null,
    useful: (r) => said(r, 'paste') && qmarks(r) <= 1,
    unwanted: () => false,
    control: () => null,
    wantsOneQuestion: true,
  },
  {
    // "How do I fix this?" with nothing attached and nothing on screen: how it goes in general, then a request for the
    // one thing needed, not a made-up fix for an error nobody has seen (review N2, N16).
    id: 'missing-referent',
    domain: 'everyday',
    covers: ['missing-referent'],
    content: {
      insight: 'Fixing an error starts from its exact message and the line it points to.',
      diagnostic: 'Can you paste the error message and the code around it?',
      reading: 'Paste the error message and the code around it, and I can say what to change.',
      explanation:
        'Most errors come from a typo, a missing import or a value of the wrong type. Check the spelling of every name, make sure each module is installed, and read the line the error points to. Restarting the program after each change also helps you see which change made the difference.',
    },
    opening: ['How do I fix this?'],
    next: () => null,
    useful: (r) => said(r, 'paste') && qmarks(r) <= 1,
    unwanted: () => false,
    control: () => null,
    wantsOneQuestion: true,
  },
  {
    // The same words with the error attached as a note: the thing is in the conversation, and MR does nothing
    // (review N10, N18: an attachment is something on their screen).
    id: 'missing-referent-attached',
    domain: 'everyday',
    covers: ['missing-referent', 'attachment'],
    content: {
      insight: 'Fixing an error starts from its exact message and the line it points to.',
      diagnostic: 'Can you paste the error message and the code around it?',
      answer: 'Line 12 adds a number to a piece of text: convert the number with str(count) before joining them, or use an f-string.',
      explanation: 'Line 12 adds a number to a piece of text: convert the number with str(count) before joining them, or use an f-string.',
    },
    opening: ['How do I fix this?'],
    attachments: [{ kind: 'note', name: 'error.txt', text: "Traceback (most recent call last):\n  File \"app.py\", line 12, in main\n    label = 'Total: ' + count\nTypeError: can only concatenate str (not \"int\") to str" }],
    next: () => null,
    useful: (r) => said(r, 'str(count)'),
    // (MR is meant to do nothing here, as on a clear question: any question left is ACS's to price)
    unwanted: () => false,
    control: () => null,
    expectNoInterventionClear: true,
  },
  {
    // Complete solutions: the reply solved it in full and they say thanks. Nothing is left to do, so no question
    // and no step (review N25: MR must not add one where the work is already complete). The pieces a step, a
    // check or a question would bring are on hand, so a line that asked for one would show in the reply.
    id: 'complete-solution',
    domain: 'study',
    covers: ['complete-solution'],
    content: {
      answer: 'You are welcome.',
      explanation: 'You are welcome.',
      nextStep: 'Next, check it by putting x = 4 back into 2x + 3.',
      check: 'Check it: 2 times 4 plus 3 is 11.',
      diagnostic: 'Want to try a harder one?',
      worked: 'Here is a similar one worked through: 3x + 2 = 14, so 3x = 12 and x = 4.',
    },
    prior: [
      ['user', 'Solve 2x + 3 = 11.'],
      ['assistant', 'Subtract 3 from both sides to get 2x = 8, then divide both sides by 2, so x = 4.'],
    ],
    opening: ['Thanks!'],
    next: () => null,
    useful: (r) => said(r, 'welcome') && !said(r, 'x = 4 back') && !said(r, 'similar one'),
    unwanted: () => true,
    control: () => null,
  },
];
