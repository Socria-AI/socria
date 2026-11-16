// evals/visual/scenarios.mjs — THE BRIEF'S CASES FOR VISUAL EXPLANATIONS, AS TURNS.
//
// Each is what a person asks, the representation the planner should choose (`expect`: the element offered, the graph
// variant, the representation named), and a reply a model could write in that shape (`reply`, with its element), so the
// runner can send it through the real route and its gate in both arms. THE REPLIES ARE OURS, not a model's: they show
// what the pipeline does with a well-formed visual reply (and, in the text-only arm, without one). Nothing here is
// evidence of what a model would write, or of what anyone would understand.

const ui = (spec) => '\n\n```ui\n' + JSON.stringify(spec) + '\n```\n\n';

export const SCENARIOS = [
  {
    id: 'V01', name: 'A limit that is not the value (the acceptance case)',
    user: 'A function approaches 2 as x approaches 1, but f(1) = 3. What is the limit and why is it not 3?',
    expect: { form: 'graph', graph: 'limit', repr: 'graph' },
    reply: 'The limit is 2: where the curve heads as x nears 1. The value 3 is what it is defined to be at 1.' + ui({ type: 'graph', title: 'The limit, and the value', expr: '(x^2-1)/(x-1)', x: [-1, 3], params: [{ name: 'p', label: 'x', value: 0.2, min: -0.8, max: 2.8, step: 0.05 }], at: ['p'], points: [{ x: 1, open: true }, { x: 1, y: 3 }] }) + 'Drag the point toward x = 1.',
  },
  {
    id: 'V02', name: 'Derivative as a tangent',
    user: 'explain derivatives as the slope of a tangent line',
    expect: { form: 'graph', graph: 'tangent', repr: 'graph' },
    reply: 'The derivative at a point is the slope of the line that just touches the curve there.' + ui({ type: 'graph', title: 'The slope at a point', expr: 'x^2', x: [-3, 3], params: [{ name: 'p', label: 'point', value: 1, min: -2.5, max: 2.5, step: 0.1 }], tangent: 'p' }) + 'Drag the point and watch the slope.',
  },
  {
    id: 'V03', name: 'Riemann sums',
    user: 'how do Riemann sums approximate the integral of x^2 from 0 to 2?',
    expect: { form: 'graph', graph: 'area', repr: 'graph' },
    reply: 'Rectangles under-count with left endpoints, and the gap shrinks as they get thinner.' + ui({ type: 'graph', title: 'Rectangles under y = x²', expr: 'x^2', x: [0, 2.2], params: [{ name: 'n', label: 'rectangles', value: 6, min: 1, max: 40, step: 1 }], area: { from: 0, to: 2, rects: { n: 'n', rule: 'left' } } }) + 'Slide the count up.',
  },
  {
    id: 'V04', name: 'A tax shifts supply',
    user: 'how does a tax shift supply and demand?',
    expect: { form: 'graph', graph: 'market', repr: 'graph' },
    reply: 'A tax on sellers lifts the supply curve by the tax; the new crossing is at a higher price and a lower quantity.' + ui({ type: 'graph', title: 'A tax on sellers', expr: '10-x', label: 'demand', curves: [{ expr: '2+x+t', label: 'supply' }], x: [0, 10], params: [{ name: 't', label: 'tax', value: 0, min: 0, max: 4, step: 0.5 }], features: ['crossings'] }),
  },
  {
    id: 'V05', name: 'Monopoly equilibrium',
    user: 'how does a monopoly choose its price and quantity?',
    expect: { form: 'graph', graph: 'monopoly', repr: 'graph' },
    reply: 'It produces where marginal revenue meets marginal cost, and charges what demand bears at that quantity.' + ui({ type: 'graph', title: 'A monopoly picks its output', expr: '12-x', label: 'demand', curves: [{ expr: '12-2*x', label: 'marginal revenue' }, { expr: '2+c', label: 'marginal cost' }], x: [0, 8], y: [0, 13], params: [{ name: 'c', label: 'cost shift', value: 0, min: -1, max: 4, step: 0.5 }], features: ['crossings'] }),
  },
  {
    id: 'V06', name: 'Forces on a box',
    user: 'what is the net force on a box pulled at 30 degrees with friction?',
    expect: { form: 'vectors', repr: 'diagram' },
    reply: 'Vertically they cancel; horizontally, what is left of the pull after friction moves it.' + ui({ type: 'vectors', title: 'A box pulled on a rough floor', body: 'box', unit: 'N', vectors: [{ label: 'pull', mag: 'p', angle: 30 }, { label: 'friction', mag: 12, angle: 180 }, { label: 'weight', mag: 49, angle: 270 }, { label: 'normal', mag: '49-p*sin(30*pi/180)', angle: 90 }], params: [{ name: 'p', label: 'pull', value: 20, min: 0, max: 40, step: 1, unit: 'N' }] }),
  },
  {
    id: 'V07', name: 'An algorithm, stepped through',
    user: 'how does binary search work?',
    expect: { form: 'trace', repr: 'simulation' },
    reply: 'It keeps halving the part of a sorted list that could still hold the target.' + ui({ type: 'trace', title: 'Binary search for 23', kind: 'array', steps: [{ cells: [2, 5, 8, 12, 16, 23, 38], pointers: { lo: 0, hi: 6, mid: 3 }, mark: [3], note: 'Middle is 12; 23 is bigger, so drop the left half.' }, { cells: [2, 5, 8, 12, 16, 23, 38], pointers: { lo: 4, hi: 6, mid: 5 }, mark: [5], note: 'Middle is 23: found it.' }] }),
  },
  {
    id: 'V08', name: 'A data structure',
    user: 'how does a stack work?',
    expect: { form: 'trace', repr: 'simulation' },
    reply: 'Last in, first out: you only ever touch the top.' + ui({ type: 'trace', title: 'Push, push, pop', kind: 'stack', steps: [{ cells: ['a'], pointers: { top: 0 }, note: 'Push a.' }, { cells: ['a', 'b'], pointers: { top: 1 }, note: 'Push b: it goes on top.' }, { cells: ['a'], pointers: { top: 0 }, note: 'Pop: b comes off first.' }] }),
  },
  {
    id: 'V09', name: 'Causes, mapped',
    user: 'why do bridges collapse?',
    expect: {},
    reply: 'Usually several things at once: a weakness, a load, and something that tips it.',
  },
  {
    id: 'V10', name: 'An expert, in notation',
    user: "I'm a mathematician — what is the limit of (x^2-1)/(x-1) as x approaches 1?",
    expect: { noForm: 'graph' },
    reply: '$\\lim_{x\\to 1}\\frac{x^2-1}{x-1} = \\lim_{x\\to1}(x+1) = 2$, the singularity being removable.',
  },
  { id: 'V11', name: 'A fact', user: "what's the capital of Australia?", expect: { repr: 'text' }, reply: 'Canberra.' },
  { id: 'V12', name: 'Small talk', user: 'hey, how are you?', expect: { repr: 'text' }, reply: 'Doing well — what is on your mind?' },
  {
    id: 'V13', name: 'An invalid picture, written anyway',
    user: 'A function approaches 2 as x approaches 1, but f(1) = 3. What is the limit?',
    expect: { form: 'graph', graph: 'limit' },
    // a filled point off the curve with no hole: refused by the gate, so the prose must stand alone
    reply: 'The limit is 2; the value is 3.' + ui({ type: 'graph', expr: 'x+1', x: [-1, 3], params: [], points: [{ x: 1, y: 3 }] }),
    invalid: true,
  },
];
