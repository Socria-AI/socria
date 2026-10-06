// test/fixtures/synthesis-maps.mjs — ten workspaces for the synthesis suites.
// Canonical maps as a person would have built them; nothing here is a chat.
import { SCENARIOS } from './shapes.mjs';

const n = (id, type, label, extra = {}) => ({ id, type, label, ...extra });
const e = (from, to, relation, extra = {}) => ({ from, to, relation, ...extra });
const scen = (name) => SCENARIOS.find((s) => s.name === name).map;

/** The reported session: onboarding, mid-way. */
export const ONBOARDING = {
  context: 'planning',
  building: { kind: 'process', by: 'inferred', confidence: 0.8 },
  ask: { action: 'map', artifact: 'map', topic: 'Socria onboarding' },
  nodes: [
    n('select', 'step', 'Select what you are', { role: 'step' }),
    n('tailor', 'step', 'Tailor experience to user type', { role: 'step' }),
    n('easy', 'value', 'Easy access onboarding', { role: 'value', status: 'supported' }),
    n('welcome', 'idea', 'Personalized welcome', { status: 'supported' }),
    n('tutorials', 'idea', 'Interactive tutorials'),
    n('tours', 'idea', 'Guided tours'),
    n('examples', 'idea', 'Example use cases'),
    n('annoy', 'constraint', 'Avoid being annoying', { role: 'constraint' }),
    n('need', 'question', 'What does Socria need to know about a new user?'),
  ],
  edges: [
    e('select', 'tailor', 'precedes'),
    e('easy', 'select', 'applies_to'),
    e('annoy', 'tailor', 'applies_to'),
    e('welcome', 'tailor', 'part_of'),
    e('tutorials', 'tailor', 'part_of'),
    e('tours', 'tailor', 'relates'),
    e('examples', 'tutorials', 'relates'),
    e('easy', 'welcome', 'supports'),
    e('need', 'select', 'applies_to'),
  ],
};

export const LAUNCH = { ...scen('planning a product launch'), building: { kind: 'plan', by: 'inferred', confidence: 0.8 } };
export const DECISION = { ...scen('deciding whether to move cities'), building: { kind: 'decision', by: 'inferred', confidence: 0.8 } };
export const ARGUMENT = {
  ...scen('constructing an argument'),
  building: { kind: 'argument', by: 'inferred', confidence: 0.8 },
  nodes: scen('constructing an argument').nodes.map((x) => (x.id === 'c' ? { ...x, status: 'supported' } : x)),
};
export const RESEARCH = { ...scen('designing a scientific experiment'), building: { kind: 'research', also: ['process'], by: 'inferred', confidence: 0.8 } };
export const MODEL = { ...scen('modelling a physical system'), building: { kind: 'model', by: 'inferred', confidence: 0.9 } };
export const SPARSE = { nodes: [n('a', 'idea', 'Start a podcast'), n('b', 'question', 'Who would listen?')], edges: [e('b', 'a', 'relates')] };
export const LARGE = {
  context: 'brainstorming',
  building: { kind: 'brainstorm', by: 'inferred', confidence: 0.6 },
  nodes: Array.from({ length: 72 }, (_, i) =>
    n(`x${i}`, i % 7 === 0 ? 'question' : i % 5 === 0 ? 'value' : 'idea', `Idea number ${i} about the community garden`, i % 11 === 0 ? { status: 'supported' } : {})
  ),
  edges: Array.from({ length: 40 }, (_, i) => e(`x${i}`, `x${(i * 3 + 1) % 72}`, i % 9 === 0 ? 'supports' : 'relates')),
};
export const CONTRADICTORY = {
  context: 'analysing',
  building: { kind: 'argument', by: 'inferred', confidence: 0.7 },
  nodes: [
    n('fast', 'claim', 'Shipping weekly keeps quality high', { status: 'supported', role: 'claim' }),
    n('slow', 'claim', 'Long release cycles keep quality high', { status: 'supported', role: 'claim' }),
    n('data', 'evidence', 'Our bug rate fell after weekly releases', { role: 'evidence' }),
    n('team', 'assumption', 'The team can sustain a weekly pace', { role: 'assumption' }),
  ],
  edges: [e('fast', 'slow', 'conflicts'), e('data', 'fast', 'supports'), e('team', 'fast', 'depends')],
};
export const UNRESOLVED = {
  context: 'reflecting',
  nodes: [
    n('q1', 'question', 'Do I want to manage people?'),
    n('q2', 'question', 'Is the pay difference worth it?'),
    n('q3', 'question', 'What would I miss about building?'),
    n('q4', 'question', 'Who could I ask that has done it?'),
    n('q5', 'question', 'Can I go back if it is wrong?'),
    n('i1', 'idea', 'Try leading one project first'),
  ],
  edges: [e('i1', 'q1', 'relates'), e('q2', 'q1', 'relates'), e('q5', 'i1', 'relates')],
};

export const ALL = { ONBOARDING, LAUNCH, DECISION, ARGUMENT, RESEARCH, MODEL, SPARSE, LARGE, CONTRADICTORY, UNRESOLVED };
