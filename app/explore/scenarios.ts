// app/explore/scenarios.ts
//
// The use cases on /explore, as data.
//
// Each one is a real ThinkingMap and a real exchange, not prose about them:
// the page mounts <ThinkingMap> on these exactly as the app does, so what a
// visitor reads is the product rather than a picture of it. That is also why
// they are here rather than inline in the page — a map is a small structured
// artefact, it is easy to get subtly wrong (an edge to a node that does not
// exist, a type outside the ontology), and keeping them as data lets the
// suite check every one.
//
// They are deliberately unfinished pieces of thinking. A map with every
// question resolved would be a worked answer, which is the opposite of what
// Socria is for and would advertise the wrong thing.

import type { ThinkingMap } from '@/lib/logos';

export type Turn = { role: 'user' | 'assistant'; content: string };

export interface Scenario {
  id: string;
  /** the filter it sits under */
  kind: 'Research' | 'Learning' | 'Deciding' | 'Writing' | 'Creating' | 'Conversation';
  /** which model this shows */
  model: 'logos' | 'core';
  title: string;
  /** who arrives with this, in one line */
  who: string;
  /** what the map is doing that a summary would not */
  point: string;
  turns: Turn[];
  /** absent for the Core scenario, which has no map by design */
  map?: ThinkingMap;
  /** the caption under the framed UI */
  caption: string;
  /** how the map reads at a glance, for the panel header */
  contextLabel?: string;
}

export const SCENARIOS: Scenario[] = [
  /* ── Research ─────────────────────────────────────────────────────────── */
  {
    id: 'research',
    kind: 'Research',
    model: 'logos',
    title: 'Reason across papers, not summaries of them',
    who: 'A literature review where two studies disagree and you need to know why.',
    point:
      'The map holds each source separately from the claim it is being used to support. A disagreement that looked like a contradiction turns out to be two papers measuring different things — visible because the outcomes are their own nodes.',
    caption: 'Three sources, two outcomes, one word doing double duty',
    contextLabel: 'researching',
    turns: [
      {
        role: 'user',
        content:
          'Two papers on whether remote work hurts junior developers. One says yes, one says no.',
      },
      {
        role: 'assistant',
        content:
          'They may not be measuring the same thing. One tracks promotion at 18 months, the other self-reported mentorship. Which is your claim about?',
      },
    ],
    map: {
      context: 'researching',
      nodes: [
        { id: 'c_harm', type: 'claim', label: 'Remote slows junior progression', status: 'open' },
        { id: 'c_no', type: 'counterpoint', label: 'No effect once team size is controlled', status: 'open' },
        { id: 's1', type: 'source', label: 'Emanuel & Harrington (2023)', status: 'supported' },
        { id: 's3', type: 'source', label: 'Choudhury (2021)', status: 'supported' },
        { id: 'e_prom', type: 'evidence', label: 'Promotion rate at 18 months', status: 'supported' },
        { id: 'e_ment', type: 'evidence', label: 'Self-reported mentorship access' },
        {
          id: 'a_same',
          type: 'assumption',
          label: 'Both measure the same outcome',
          status: 'revised',
        },
        { id: 't', type: 'tension', label: 'Different outcome, same word' },
      ],
      edges: [
        { from: 'c_harm', to: 'c_no', relation: 'conflicts', strength: 'strong' },
        { from: 's1', to: 'e_prom', relation: 'supports', strength: 'strong' },
        { from: 's3', to: 'e_ment', relation: 'supports' },
        { from: 'e_prom', to: 'c_harm', relation: 'supports', strength: 'strong' },
        { from: 'e_ment', to: 'c_no', relation: 'supports' },
        { from: 'a_same', to: 't', relation: 'leads_to' },
        { from: 't', to: 'c_harm', relation: 'relates' },
      ],
    },
  },

  /* ── Learning ─────────────────────────────────────────────────────────── */
  {
    id: 'learning',
    kind: 'Learning',
    model: 'logos',
    title: 'Move the variable and watch what the concept does',
    who: 'A student who can compute a derivative and cannot say what one is.',
    point:
      'The parameter is a slider, not a sentence. Drag h toward zero and the secant becomes the tangent in front of you — the definition stops being a formula you accept and becomes something you watched happen.',
    caption: 'The mathematics itself, with the parameter live — drag h',
    contextLabel: 'math · learning',
    turns: [
      {
        role: 'user',
        content: 'I can do the chain rule fine but I genuinely do not know what a derivative IS.',
      },
      {
        role: 'assistant',
        content:
          'Then let us not define it. Pull h toward zero on the secant beside you and say what the line is doing — not what it equals.',
      },
    ],
    map: {
      context: 'math',
      intent: 'learning',
      nodes: [
        { id: 'c', type: 'concept', label: 'derivative as a limit of slopes' },
        {
          id: 'd',
          type: 'definition',
          label: 'the difference quotient',
          tex: "f'(a) = \\lim_{h \\to 0} \\frac{f(a+h) - f(a)}{h}",
        },
        {
          id: 'm',
          type: 'misconception',
          label: 'the derivative is a formula you apply',
          flag: 'error',
          note: 'it is a number at a point — the slope there',
        },
        // No `given` node for the curve: it is already the scene's expr, and
        // a second chain-typed node beside the definition would make this a
        // solution chain in availableLenses' eyes and open the panel on
        // Solution — a step-by-step reading of work that is not being done.
        { id: 'q', type: 'question', label: 'what is the line doing as h shrinks?' },
      ],
      edges: [
        { from: 'c', to: 'd', relation: 'part_of' },
        { from: 'm', to: 'c', relation: 'conflicts', strength: 'strong' },
        { from: 'q', to: 'c', relation: 'leads_to' },
      ],
      viz: {
        kind: 'derivative',
        expr: 'x^2',
        varName: 'x',
        view: { xMin: -1, xMax: 4, yMin: -1, yMax: 9 },
        a: 1.5,
        params: [{ id: 'h', min: 0.05, max: 2, step: 0.05, value: 1.2 }],
        says: {
          caption: 'the secant through a and a+h',
          ask: 'what does the line do as h shrinks — and what does it never quite reach?',
        },
      },
    },
  },

  /* ── Deciding ─────────────────────────────────────────────────────────── */
  {
    id: 'deciding',
    kind: 'Deciding',
    model: 'logos',
    title: 'See what the decision is actually resting on',
    who: 'Anyone circling the same choice for the third week running.',
    point:
      'Ask most tools to help you decide and you get a recommendation. Here the assumption underneath the appealing option is drawn as its own node, because that is usually the thing doing the deciding.',
    caption: 'The decision, and the assumption quietly holding it up',
    contextLabel: 'deciding',
    turns: [
      {
        role: 'user',
        content:
          'Offered a job. More money, bigger company. I keep going back and forth.',
      },
      {
        role: 'assistant',
        content:
          'You said "more money" twice and "I have stopped growing" once — and only the second came with an example. Which is the reason you are still thinking about it?',
      },
    ],
    map: {
      context: 'deciding',
      nodes: [
        { id: 'q', type: 'question', label: 'Should I take the job?' },
        { id: 'pay', type: 'claim', label: 'It pays more', status: 'open' },
        { id: 'grow', type: 'claim', label: 'I have stopped growing', status: 'supported' },
        { id: 'assume', type: 'assumption', label: 'More money means progress' },
        { id: 'tension', type: 'tension', label: 'Security ↔ growth' },
        { id: 'value', type: 'value', label: 'Work that keeps teaching me' },
        { id: 'ev', type: 'evidence', label: 'Three years, same problems', status: 'supported' },
      ],
      edges: [
        { from: 'q', to: 'pay', relation: 'depends' },
        { from: 'q', to: 'grow', relation: 'depends' },
        { from: 'pay', to: 'assume', relation: 'depends', strength: 'strong' },
        { from: 'grow', to: 'tension', relation: 'relates' },
        { from: 'pay', to: 'tension', relation: 'conflicts' },
        { from: 'value', to: 'grow', relation: 'supports' },
        { from: 'ev', to: 'grow', relation: 'supports', strength: 'strong' },
      ],
    },
  },

  /* ── Writing ──────────────────────────────────────────────────────────── */
  {
    id: 'writing',
    kind: 'Writing',
    model: 'logos',
    title: 'Turn scattered thoughts into an argument that holds',
    who: 'An essay, a pitch, a paper — anything that has to survive a reader who disagrees.',
    point:
      'The strongest objection to your own argument gets a node of its own, sitting next to the claim it threatens. An argument you have not drawn is an argument whose weakest joint you have not found.',
    caption: 'Five reasons resting on one, and the objection that threatens it',
    contextLabel: 'writing',
    turns: [
      {
        role: 'user',
        content:
          'Arguing to abolish grading in first-year courses. Six reasons, no idea what order.',
      },
      {
        role: 'assistant',
        content:
          'Order is downstream of load-bearing. Five of your six rest on one claim — that grades crowd out motivation. Is it the one you can defend best?',
      },
    ],
    map: {
      context: 'writing',
      nodes: [
        { id: 'thesis', type: 'claim', label: 'Abolish grading in first-year courses', status: 'open' },
        { id: 'motiv', type: 'claim', label: 'Grades crowd out intrinsic motivation', status: 'open' },
        { id: 'risk', type: 'claim', label: 'Students take fewer intellectual risks', status: 'supported' },
        { id: 'obj', type: 'counterpoint', label: 'Employers and graduate schools need a signal' },
        { id: 'ev', type: 'evidence', label: 'Deci & Ryan on extrinsic reward', status: 'supported' },
        { id: 'assume', type: 'assumption', label: 'Feedback can carry what grades carried' },
        { id: 't', type: 'tension', label: 'Freedom to fail ↔ needing a signal' },
      ],
      edges: [
        { from: 'motiv', to: 'thesis', relation: 'supports', strength: 'strong' },
        { from: 'risk', to: 'thesis', relation: 'supports' },
        { from: 'ev', to: 'motiv', relation: 'supports', strength: 'strong' },
        { from: 'obj', to: 'thesis', relation: 'conflicts', strength: 'strong' },
        { from: 'thesis', to: 'assume', relation: 'depends' },
        { from: 'obj', to: 't', relation: 'relates' },
        { from: 'motiv', to: 't', relation: 'relates' },
      ],
    },
  },

  /* ── Creating ─────────────────────────────────────────────────────────── */
  {
    id: 'creating',
    kind: 'Creating',
    model: 'logos',
    title: 'Develop the idea without handing it over',
    who: 'A novel, a screenplay, a game — work where having it written for you defeats the point.',
    point:
      'Nothing here writes your scene. The map holds the theme, the characters and the thing that is not yet working, so the shape of the problem is visible while the prose stays yours.',
    caption: 'Theme, characters, and the thing that is not yet working',
    contextLabel: 'creating',
    turns: [
      {
        role: 'user',
        content:
          'My protagonist is meant to be sympathetic. Every reader finds her cold. Do not rewrite her.',
      },
      {
        role: 'assistant',
        content:
          'I will not. She does things in eleven scenes and wants something in none of them. Cold may be a symptom of that rather than a trait.',
      },
    ],
    map: {
      context: 'creating',
      nodes: [
        { id: 'theme', type: 'theme', label: 'Inheritance as an obligation you did not accept' },
        { id: 'ch1', type: 'character', label: 'Mara — reads as cold' },
        { id: 'q', type: 'question', label: 'Is cold the problem, or is opacity?' },
        { id: 'obs', type: 'evidence', label: 'Eleven scenes of action, no stated want', status: 'supported' },
        { id: 'idea', type: 'idea', label: 'Let her want something small and say it once' },
        { id: 't', type: 'tension', label: 'Restraint ↔ legibility' },
        { id: 'con', type: 'constraint', label: 'First person, present tense throughout' },
      ],
      edges: [
        { from: 'ch1', to: 'theme', relation: 'part_of' },
        { from: 'obs', to: 'q', relation: 'supports', strength: 'strong' },
        { from: 'q', to: 'idea', relation: 'leads_to' },
        { from: 'idea', to: 't', relation: 'relates' },
        { from: 'con', to: 't', relation: 'relates' },
        { from: 'ch1', to: 'q', relation: 'relates' },
      ],
    },
  },

  /* ── Core 3.1 ─────────────────────────────────────────────────────────── */
  {
    id: 'core',
    kind: 'Conversation',
    model: 'core',
    title: 'Or just think out loud, with something that pushes back',
    who: 'When you want the conversation and not the apparatus.',
    point:
      'Core 3.1 is the same posture without the map: it will not hand you the conclusion, and it will tell you when your reason is not the reason. No panel, no nodes — the thinking stays in the sentences.',
    caption: 'Socria Core 3.1 — conversation, no map',
    turns: [
      {
        role: 'user',
        content: 'I think I only want to do the PhD because I do not know what else to do.',
      },
      {
        role: 'assistant',
        content:
          'A real reason, and not automatically a bad one — plenty of good work starts as a way of buying time. What would have to be true in three years for you to be glad you did?',
      },
      { role: 'user', content: 'I suppose that I still find the questions interesting.' },
      {
        role: 'assistant',
        content:
          'Which questions? You said "the questions" rather than naming one — and you named three specific ones about the job you are avoiding.',
      },
    ],
  },
];

export const KINDS = ['All', 'Research', 'Learning', 'Deciding', 'Writing', 'Creating', 'Conversation'] as const;
export type Kind = (typeof KINDS)[number];
