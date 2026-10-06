// test/fixtures/shapes.mjs
//
// What an extractor following the "WHAT ARE THEY BUILDING?" instructions
// returns for nine different pieces of thinking. Shared by the unit suite
// (test/representation.test.mjs) and the route suite
// (test/representation-e2e.test.mjs).
//
// These are SCRIPTED, not recorded: this sandbox cannot reach the model. They
// stand for a well-behaved extraction so the deterministic half of the
// architecture — the reading, the repair, the lens, the layout — can be held
// to account. Each one is written in its own vocabulary; nothing in the code
// under test knows any of these subjects.

const n = (id, type, label, role, extra = {}) => ({ id, type, label, ...(role ? { role } : {}), ...extra });
const e = (from, to, relation, extra = {}) => ({ from, to, relation, ...extra });

// ── the reported failure, as it came back ─────────────────────────────

/** "I am planning Socria's onboarding and the steps a new user goes through." — the cloud. */
export const ONBOARDING_CLOUD = {
  context: 'planning',
  nodes: [
    n('ux', 'constraint', 'user experience'),
    n('steps', 'constraint', 'steps involved'),
    n('info', 'constraint', 'information to be provided'),
    n('easy', 'value', 'easy access'),
  ],
  edges: [e('easy', 'ux', 'supports'), e('steps', 'ux', 'relates')],
};

// ── the onboarding conversation, turn by turn, under the new prompt ───

export const ONBOARDING_TURNS = [
  {
    said: "I am planning Socria's onboarding and the steps a new user goes through.",
    map: {
      context: 'planning',
      building: { kind: 'process', why: 'laying out the stages a new user moves through' },
      nodes: [
        n('landing', 'concept', 'Landing page', 'start'),
        n('signup', 'step', 'Sign up', 'step'),
        n('intro', 'concept', 'Universal Socria intro', 'step'),
        n('first', 'step', 'First thought', 'step'),
        n('easy', 'value', 'Easy access', 'value'),
      ],
      edges: [e('landing', 'signup', 'precedes'), e('signup', 'intro', 'precedes'), e('intro', 'first', 'precedes'), e('easy', 'landing', 'applies_to'), e('easy', 'signup', 'applies_to')],
    },
  },
  {
    said: "I don't want signup before users experience Socria.",
    map: {
      context: 'planning',
      building: { kind: 'process', why: 'the onboarding sequence' },
      nodes: [
        n('landing', 'concept', 'Landing page', 'start'),
        n('try', 'step', 'Try Socria', 'step'),
        n('intro', 'concept', 'Universal Socria intro', 'step'),
        n('first', 'step', 'First thought', 'step'),
        n('signup', 'step', 'Sign up', 'step'),
        n('easy', 'value', 'Easy access', 'value'),
        n('nosign', 'constraint', 'No signup before they experience Socria', 'constraint'),
      ],
      edges: [
        e('landing', 'try', 'precedes'),
        e('try', 'intro', 'precedes'),
        e('intro', 'first', 'precedes'),
        e('first', 'signup', 'precedes'),
        e('easy', 'try', 'applies_to'),
        e('nosign', 'signup', 'applies_to'),
      ],
    },
  },
  {
    said: 'Guest users get one temporary session.',
    map: {
      context: 'planning',
      building: { kind: 'process' },
      nodes: [
        n('landing', 'concept', 'Landing page', 'start'),
        n('try', 'step', 'Try Socria', 'step'),
        n('guest', 'concept', 'Guest session', 'state'),
        n('intro', 'concept', 'Universal Socria intro', 'step'),
        n('first', 'step', 'First thought', 'step'),
        n('signup', 'step', 'Sign up', 'step'),
        n('easy', 'value', 'Easy access', 'value'),
        n('nosign', 'constraint', 'No signup before they experience Socria', 'constraint'),
        n('onesess', 'constraint', 'One temporary session', 'constraint'),
        n('demo', 'goal', 'Show value before authentication', 'goal'),
        n('when', 'question', 'When should signup trigger?', 'question'),
      ],
      edges: [
        e('landing', 'try', 'precedes'),
        e('try', 'guest', 'precedes'),
        e('guest', 'intro', 'precedes'),
        e('intro', 'first', 'precedes'),
        e('first', 'signup', 'precedes'),
        e('easy', 'try', 'applies_to'),
        e('nosign', 'signup', 'applies_to'),
        e('onesess', 'guest', 'applies_to'),
        e('demo', 'guest', 'applies_to'),
        e('when', 'guest', 'applies_to'),
        e('when', 'signup', 'applies_to'),
      ],
    },
  },
  {
    said: "After the first thought they go to Core or Logos. Users entering directly through Logos shouldn't have to use Core first.",
    map: {
      context: 'planning',
      building: { kind: 'process' },
      nodes: [
        n('landing', 'concept', 'Landing page', 'start'),
        n('try', 'step', 'Try Socria', 'step'),
        n('guest', 'concept', 'Guest session', 'state'),
        n('intro', 'concept', 'Universal Socria intro', 'step'),
        n('first', 'step', 'First thought', 'step'),
        n('choose', 'decision', 'Core or Logos', 'branch'),
        n('coreaha', 'concept', 'Core aha moment', 'step'),
        n('logosaha', 'concept', 'Logos aha moment', 'step'),
        n('signup', 'step', 'Sign up', 'step'),
        n('easy', 'value', 'Easy access', 'value'),
        n('nosign', 'constraint', 'No signup before they experience Socria', 'constraint'),
        n('onesess', 'constraint', 'One temporary session', 'constraint'),
        n('demo', 'goal', 'Show value before authentication', 'goal'),
        n('nocore', 'constraint', 'Logos entrants skip Core', 'constraint'),
      ],
      edges: [
        e('landing', 'try', 'precedes'),
        e('try', 'guest', 'precedes'),
        e('guest', 'intro', 'precedes'),
        e('intro', 'first', 'precedes'),
        e('first', 'choose', 'precedes'),
        e('choose', 'coreaha', 'precedes', { when: 'chooses Core' }),
        e('choose', 'logosaha', 'precedes', { when: 'entered through Logos' }),
        e('coreaha', 'signup', 'precedes'),
        e('logosaha', 'signup', 'precedes'),
        e('easy', 'try', 'applies_to'),
        e('nosign', 'signup', 'applies_to'),
        e('onesess', 'guest', 'applies_to'),
        e('demo', 'guest', 'applies_to'),
        e('nocore', 'choose', 'applies_to'),
      ],
    },
  },
  {
    said: 'Then the normal product, progressive discovery of features, and finally conversion to Socria One. Discovery keeps feeding back into the product.',
    map: {
      context: 'planning',
      building: { kind: 'process' },
      nodes: [
        n('landing', 'concept', 'Landing page', 'start'),
        n('try', 'step', 'Try Socria', 'step'),
        n('guest', 'concept', 'Guest session', 'state'),
        n('intro', 'concept', 'Universal Socria intro', 'step'),
        n('first', 'step', 'First thought', 'step'),
        n('choose', 'decision', 'Core or Logos', 'branch'),
        n('coreaha', 'concept', 'Core aha moment', 'step'),
        n('logosaha', 'concept', 'Logos aha moment', 'step'),
        n('signup', 'step', 'Sign up', 'step'),
        n('product', 'concept', 'Normal product', 'step'),
        n('discovery', 'concept', 'Progressive discovery', 'step'),
        n('convert', 'goal', 'Conversion to Socria One', 'end'),
        n('easy', 'value', 'Easy access', 'value'),
        n('nosign', 'constraint', 'No signup before they experience Socria', 'constraint'),
        n('onesess', 'constraint', 'One temporary session', 'constraint'),
        n('demo', 'goal', 'Show value before authentication', 'goal'),
        n('nocore', 'constraint', 'Logos entrants skip Core', 'constraint'),
        n('once', 'constraint', 'Each discovery shown once', 'constraint'),
      ],
      edges: [
        e('landing', 'try', 'precedes'),
        e('try', 'guest', 'precedes'),
        e('guest', 'intro', 'precedes'),
        e('intro', 'first', 'precedes'),
        e('first', 'choose', 'precedes'),
        e('choose', 'coreaha', 'precedes', { when: 'chooses Core' }),
        e('choose', 'logosaha', 'precedes', { when: 'entered through Logos' }),
        e('coreaha', 'signup', 'precedes'),
        e('logosaha', 'signup', 'precedes'),
        e('signup', 'product', 'precedes'),
        e('product', 'discovery', 'precedes'),
        e('discovery', 'product', 'precedes'),
        e('discovery', 'convert', 'precedes'),
        e('easy', 'try', 'applies_to'),
        e('nosign', 'signup', 'applies_to'),
        e('onesess', 'guest', 'applies_to'),
        e('demo', 'guest', 'applies_to'),
        e('nocore', 'choose', 'applies_to'),
        e('once', 'discovery', 'applies_to'),
      ],
    },
  },
];

/** What the repair pass returns for the cloud above: the same four ideas, re-roled, plus the steps named in the conversation. */
export const ONBOARDING_REPAIRED = {
  nodes: [
    n('ux', 'constraint', 'user experience', 'value'),
    n('steps', 'constraint', 'steps involved', 'note'),
    n('info', 'constraint', 'information to be provided', 'constraint'),
    n('easy', 'value', 'easy access', 'value'),
    n('landing', 'concept', 'Landing', 'start'),
    n('intro', 'concept', 'Intro', 'step'),
    n('signup', 'step', 'Sign up', 'step'),
  ],
  edges: [
    e('landing', 'intro', 'precedes'),
    e('intro', 'signup', 'precedes'),
    e('easy', 'landing', 'applies_to'),
    e('info', 'signup', 'applies_to'),
    e('ux', 'intro', 'applies_to'),
    e('steps', 'landing', 'applies_to'),
  ],
};

// ── eight other pieces of thinking ───────────────────────────────────

export const SCENARIOS = [
  {
    name: 'planning a hiring process',
    expect: { kind: 'process', lens: 'flow' },
    map: {
      context: 'planning',
      building: { kind: 'process', why: 'the rounds a candidate goes through' },
      nodes: [
        n('apply', 'step', 'Application', 'start'),
        n('screen', 'step', 'Recruiter screen', 'step'),
        n('take', 'step', 'Take-home exercise', 'step'),
        n('onsite', 'step', 'Onsite loop', 'step'),
        n('debrief', 'decision', 'Debrief: hire or not', 'branch'),
        n('offer', 'step', 'Offer', 'end'),
        n('reject', 'step', 'Rejection with feedback', 'end'),
        n('time', 'constraint', 'Under three weeks end to end', 'constraint'),
        n('fair', 'value', 'Same questions for everyone', 'value'),
      ],
      edges: [
        e('apply', 'screen', 'precedes'),
        e('screen', 'take', 'precedes'),
        e('take', 'onsite', 'precedes'),
        e('onsite', 'debrief', 'precedes'),
        e('debrief', 'offer', 'precedes', { when: 'strong yes' }),
        e('debrief', 'reject', 'precedes', { when: 'no hire' }),
        e('time', 'apply', 'applies_to'),
        e('fair', 'onsite', 'applies_to'),
      ],
    },
  },
  {
    name: 'designing a scientific experiment',
    expect: { kind: 'research', lens: 'structure' },
    map: {
      context: 'researching',
      building: { kind: 'research', also: ['process'], why: 'testing whether light colour changes germination' },
      nodes: [
        n('q', 'question', 'Does light colour change germination rate?', 'question'),
        n('h1', 'conjecture', 'Red light speeds germination', 'hypothesis'),
        n('h0', 'conjecture', 'No difference between colours', 'hypothesis'),
        n('m', 'step', 'Three trays under red, blue, white LEDs', 'method'),
        n('measure', 'step', 'Count sprouts daily for 10 days', 'method'),
        n('ctrl', 'constraint', 'Same soil, water and temperature', 'constraint'),
        n('prior', 'evidence', 'Phytochrome responds to red light', 'finding'),
      ],
      edges: [
        e('h1', 'q', 'part_of'),
        e('h0', 'q', 'part_of'),
        e('m', 'h1', 'depends'),
        e('measure', 'm', 'part_of'),
        e('prior', 'h1', 'supports'),
        e('ctrl', 'm', 'applies_to'),
      ],
    },
  },
  {
    name: 'deciding whether to move cities',
    expect: { kind: 'decision', lens: 'matrix' },
    map: {
      context: 'deciding',
      building: { kind: 'decision', why: 'whether to move to Lisbon or stay in Leeds' },
      nodes: [
        n('d', 'decision', 'Move to Lisbon?', 'branch'),
        n('stay', 'decision', 'Stay in Leeds', 'option'),
        n('move', 'decision', 'Move to Lisbon', 'option'),
        n('cost', 'value', 'Cost of living', 'criterion'),
        n('friends', 'value', 'Close friends nearby', 'criterion'),
        n('career', 'goal', 'Career growth', 'criterion'),
        n('unsure', 'question', 'Can I keep my job remotely?', 'question'),
      ],
      edges: [
        e('cost', 'move', 'supports'),
        e('friends', 'stay', 'supports'),
        e('friends', 'move', 'conflicts'),
        e('career', 'move', 'supports'),
        e('unsure', 'move', 'applies_to'),
      ],
    },
  },
  {
    name: 'constructing an argument',
    expect: { kind: 'argument', lens: 'evidence' },
    map: {
      context: 'writing',
      building: { kind: 'argument', why: 'a case that four-day weeks raise output' },
      nodes: [
        n('c', 'claim', 'Four-day weeks raise output', 'claim'),
        n('e1', 'evidence', 'UK pilot: revenue held steady', 'evidence'),
        n('e2', 'evidence', 'Iceland trials: wellbeing up', 'evidence'),
        n('a', 'assumption', 'Output can be measured fairly', 'assumption'),
        n('o', 'counterpoint', 'Self-selected firms', 'objection'),
      ],
      edges: [e('e1', 'c', 'supports'), e('e2', 'c', 'supports'), e('a', 'c', 'depends'), e('o', 'e1', 'conflicts')],
    },
  },
  {
    name: 'modelling a physical system',
    expect: { kind: 'model', lens: 'plot' },
    map: {
      context: 'math',
      building: { kind: 'model', why: 'a damped spring' },
      nodes: [
        n('x', 'unknown', 'Displacement x(t)', 'variable'),
        n('k', 'given', 'Spring constant k', 'parameter'),
        n('c', 'given', 'Damping c', 'parameter'),
        n('eq', 'equation', "m x'' + c x' + k x = 0", 'equation', { tex: "m\\ddot x + c\\dot x + kx = 0" }),
      ],
      edges: [e('k', 'eq', 'part_of'), e('c', 'eq', 'part_of'), e('x', 'eq', 'part_of')],
      viz: { kind: 'function', expr: 'exp(-0.2*x)*cos(2*x)', title: 'Damped oscillation' },
    },
  },
  {
    name: 'planning a product launch',
    expect: { kind: 'plan', lens: 'flow' },
    map: {
      context: 'planning',
      building: { kind: 'plan', why: 'getting the app launched in March' },
      nodes: [
        n('g', 'goal', 'Launch in March', 'goal'),
        n('beta', 'step', 'Private beta', 'action'),
        n('fix', 'step', 'Fix top beta issues', 'action'),
        n('site', 'step', 'Landing page and waitlist', 'action'),
        n('press', 'step', 'Press embargo briefings', 'action'),
        n('ship', 'milestone', 'Public launch', 'milestone'),
        n('budget', 'constraint', '£20k marketing budget', 'constraint'),
      ],
      edges: [
        e('beta', 'fix', 'precedes'),
        e('fix', 'ship', 'precedes'),
        e('site', 'press', 'precedes'),
        e('press', 'ship', 'precedes'),
        e('ship', 'g', 'leads_to'),
        e('budget', 'press', 'applies_to'),
      ],
    },
  },
  {
    name: 'understanding a historical timeline',
    expect: { kind: 'timeline', lens: 'timeline' },
    map: {
      context: 'learning',
      building: { kind: 'timeline', why: 'how the Berlin Wall came down' },
      nodes: [
        n('hu', 'concept', 'Hungary opens its border (May 1989)', 'event'),
        n('lp', 'concept', 'Leipzig Monday demonstrations', 'period'),
        n('sch', 'concept', 'Schabowski press conference', 'event'),
        n('fall', 'concept', 'Wall opened, 9 Nov 1989', 'event'),
        n('re', 'concept', 'Reunification, Oct 1990', 'event'),
        n('why', 'question', 'Was it an accident?', 'question'),
      ],
      edges: [e('hu', 'lp', 'precedes'), e('lp', 'sch', 'precedes'), e('sch', 'fall', 'precedes'), e('fall', 're', 'precedes'), e('why', 'sch', 'applies_to')],
    },
  },
  {
    name: 'comparing two business strategies',
    expect: { kind: 'comparison', lens: 'matrix' },
    map: {
      context: 'analysing',
      building: { kind: 'comparison', why: 'subscription against usage-based pricing' },
      nodes: [
        n('sub', 'idea', 'Subscription pricing', 'alternative'),
        n('use', 'idea', 'Usage-based pricing', 'alternative'),
        n('pred', 'value', 'Predictable revenue', 'dimension'),
        n('adopt', 'value', 'Low barrier to adoption', 'dimension'),
        n('margin', 'value', 'Margin at scale', 'dimension'),
      ],
      edges: [
        e('pred', 'sub', 'supports'),
        e('adopt', 'use', 'supports'),
        e('pred', 'use', 'conflicts'),
        e('margin', 'sub', 'supports'),
      ],
    },
  },
];
