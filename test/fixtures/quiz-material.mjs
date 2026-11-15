// An invented course's material for the quiz evaluation (test/quiz-eval.test.mjs): two lectures of
// microeconomics and a page of calculus, in the shape the browser's document reader produces (lib/docs), and
// question candidates as a model might write them — fit ones, and ones each carrying one known flaw — with the
// verdict each should get. Nothing here is from a real course.

const doc = (id, name, blocks) => ({ v: 1, id, name, format: 'pdf', pageCount: Math.max(...blocks.map((b) => b.page)), pages: [], blocks: blocks.map((b) => ({ method: 'text', kind: 'paragraph', ...b })), tables: [], figures: [], checks: [] });

export const MICRO_6 = doc('a000000000000006', 'ECO 101 Lecture 6 - Monopoly.pdf', [
  { id: 'p1.1', page: 1, kind: 'heading', text: 'Monopoly: profit maximisation' },
  { id: 'p1.2', page: 1, text: 'A monopolist maximises profit by producing the quantity where marginal revenue equals marginal cost, then charging the highest price the demand curve allows for that quantity.' },
  { id: 'p2.1', page: 2, text: 'With demand P = 100 - 2Q, marginal revenue is MR = 100 - 4Q. If marginal cost is constant at 20, the monopolist produces Q = 20 and charges P = 60.' },
  { id: 'p3.1', page: 3, text: 'A perfectly competitive firm produces where price equals marginal cost. The monopolist restricts output below the competitive level, creating a deadweight loss.' },
]);
export const MICRO_7 = doc('a000000000000007', 'ECO 101 Lecture 7 - Costs.pdf', [
  { id: 'p1.1', page: 1, text: 'Marginal cost is the change in total cost from producing one more unit. Average total cost is total cost divided by quantity.' },
  { id: 'p2.1', page: 2, text: 'When marginal cost is below average total cost, average total cost falls; when marginal cost is above it, average total cost rises. So marginal cost crosses average total cost at its minimum.' },
  { id: 'p3.1', page: 3, text: 'Market supply is S: P = 20 + 2Q and market demand is D: P = 100 - 2Q, so the market clears at Q = 20 and P = 60.' },
]);
export const CALC = doc('a00000000000000c', 'MATH 151 Notes - Derivatives.pdf', [
  { id: 'p1.1', page: 1, text: 'The power rule: the derivative of x^n is n x^(n-1). The derivative of a constant is zero.' },
  { id: 'p2.1', page: 2, text: 'The derivative of sin(x) is cos(x), and the derivative of e^x is e^x.' },
]);
export const DOCS = [MICRO_6, MICRO_7, CALC];

const opt = (text, correct = false, trap) => ({ text, ...(correct ? { correct: true } : {}), ...(trap ? { trap } : {}) });

/** Candidates, each labelled with the verdict it should get: null (fit) or the reason it must be refused. */
export const CANDIDATES = [
  // ── fit ──
  { want: null, q: { concept: 'monopoly profit maximisation', topic: 'Monopoly', type: 'single', difficulty: 2, demand: 'recall', stem: 'At which output does a monopolist maximise profit?', options: [opt('Where marginal revenue equals marginal cost', true), opt('Where price equals marginal cost', false, { tag: 'p-equals-mc', note: 'May mean the competitive rule is being used.' }), opt('Where average total cost is lowest'), opt('Where demand is unit elastic')], explanation: 'Profit is largest where the last unit adds as much to revenue as to cost.', sources: ['1:p1.2'] } },
  { want: null, q: { concept: 'monopoly price', topic: 'Monopoly', type: 'numeric', difficulty: 2, demand: 'application', stem: 'Demand is P = 100 - 2Q and marginal cost is 20. What price maximises the monopolist\'s profit?', answer: { value: 60, unit: '$', tolerance: { abs: 0.5 }, calc: '100 - 2*((100 - 20) / 4)' }, explanation: 'MR = 100 - 4Q = 20 gives Q = 20; demand then gives P = 60.', sources: ['1:p2.1'] } },
  { want: null, q: { concept: 'deadweight loss', topic: 'Monopoly', type: 'truefalse', difficulty: 1, demand: 'recall', stem: 'A monopolist produces less than a perfectly competitive industry with the same costs.', answer: { value: true }, explanation: 'It restricts output below the competitive level, creating a deadweight loss.', sources: ['1:p3.1'] } },
  { want: null, q: { concept: 'mc and atc', topic: 'Costs', type: 'single', difficulty: 2, demand: 'application', stem: 'Average total cost is falling as output rises. What must be true of marginal cost?', options: [opt('It is below average total cost', true), opt('It is above average total cost'), opt('It equals average total cost'), opt('It is falling as well')], explanation: 'Average total cost falls only when the extra unit costs less than the average.', sources: ['2:p2.1'] } },
  { want: null, q: { concept: 'market equilibrium', topic: 'Markets', type: 'numeric', difficulty: 2, demand: 'application', stem: 'Using the graph, what quantity clears the market?', answer: { value: 20, unit: 'units', tolerance: { abs: 0.5 } }, figure: { x: { label: 'Quantity', min: 0, max: 40 }, y: { label: 'Price', min: 0, max: 100 }, curves: [{ id: 'S', label: 'Supply', expr: '20 + 2*x' }, { id: 'D', label: 'Demand', expr: '100 - 2*x' }] }, from_figure: { meet: ['S', 'D'], axis: 'x' }, explanation: 'Supply meets demand where 20 + 2Q = 100 - 2Q, at Q = 20.', sources: ['2:p3.1'] } },
  { want: null, q: { concept: 'power rule', topic: 'Derivatives', type: 'expression', difficulty: 1, demand: 'application', stem: 'Differentiate $f(x) = x^3$.', answer: { expr: '3*x^2', vars: ['x'] }, explanation: 'By the power rule, the derivative of x^n is n x^(n-1).', sources: ['3:p1.1'] } },
  { want: null, q: { concept: 'derivative of sine', topic: 'Derivatives', type: 'short', difficulty: 1, demand: 'recall', stem: 'What is the derivative of sin(x)?', answer: { accept: ['cos(x)', 'cos x', 'cosine of x'], terms: ['cos'], model: 'cos(x)' }, explanation: 'The derivative of sin(x) is cos(x).', sources: ['3:p2.1'] } },
  { want: null, q: { concept: 'monopoly vs competition', topic: 'Monopoly', type: 'multi', difficulty: 3, demand: 'transfer', stem: 'Compared with perfect competition at the same costs, which hold for a monopoly?', options: [opt('Output is lower', true), opt('Price is higher', true), opt('There is no deadweight loss'), opt('Price equals marginal cost')], explanation: 'A monopolist restricts output and charges more, which creates a deadweight loss.', sources: ['1:p3.1'] } },
  // ── each with one known flaw ──
  { want: 'answer-key', q: { concept: 'x1', topic: 'Monopoly', type: 'single', stem: 'Which describes the number of sellers in a monopoly market?', options: [opt('One seller', true), opt('A single firm', true), opt('Many small sellers')], explanation: 'A monopoly has exactly one seller.', sources: ['1:p1.1'] } },
  { want: 'ambiguous', q: { concept: 'x2', topic: 'Costs', type: 'single', stem: 'What is marginal cost, as defined in the lecture?', options: [opt('The change in total cost from one more unit', true), opt('The change in total cost from one more unit.'), opt('Total cost divided by quantity')], explanation: 'It is the change in total cost from one more unit.', sources: ['2:p1.1'] } },
  { want: 'options', q: { concept: 'x3', topic: 'Monopoly', type: 'single', stem: 'Which statements about monopoly are correct in the standard model?', options: [opt('It is a price maker'), opt('It faces market demand'), opt('All of the above', true)], explanation: 'Both statements hold for a monopolist.', sources: ['1:p1.2'] } },
  { want: 'giveaway', q: { concept: 'x4', topic: 'Monopoly', type: 'single', stem: 'The rule marginal revenue equals marginal cost is what a monopolist follows: which rule is it?', options: [opt('marginal revenue equals marginal cost', true), opt('price equals marginal cost'), opt('price equals average cost')], explanation: 'It is the MR = MC rule.', sources: ['1:p1.2'] } },
  { want: 'units', q: { concept: 'x5', topic: 'Monopoly', type: 'single', stem: 'What price does the monopolist in the lecture example charge?', options: [opt('$60', true), opt('20 units'), opt('$40')], explanation: 'Demand at Q = 20 gives P = 60.', sources: ['1:p2.1'] } },
  { want: 'arithmetic', q: { concept: 'x6', topic: 'Monopoly', type: 'numeric', stem: 'With demand P = 100 - 2Q and MC = 20, what quantity maximises profit?', answer: { value: 30, unit: 'units', calc: '(100 - 20) / 4' }, explanation: 'MR = MC gives the profit-maximising quantity.', sources: ['1:p2.1'] } },
  { want: 'figure', q: { concept: 'x7', topic: 'Markets', type: 'numeric', stem: 'Using the graph, what quantity clears the market here?', answer: { value: 25, unit: 'units', tolerance: { abs: 0.5 } }, figure: { x: { label: 'Quantity', min: 0, max: 40 }, y: { label: 'Price', min: 0, max: 100 }, curves: [{ id: 'S', label: 'Supply', expr: '20 + 2*x' }, { id: 'D', label: 'Demand', expr: '100 - 2*x' }] }, from_figure: { meet: ['S', 'D'], axis: 'x' }, explanation: 'Supply meets demand at the clearing quantity.', sources: ['2:p3.1'] } },
  { want: 'ungrounded', q: { concept: 'x8', topic: 'Monopoly', type: 'truefalse', stem: 'A monopolist always charges the highest price any buyer would pay.', answer: { value: false }, explanation: 'It charges what demand allows at its chosen quantity.', sources: ['1:p9.9'] } },
  { want: 'predicts-exam', q: { concept: 'x9', topic: 'Monopoly', type: 'truefalse', stem: 'Deadweight loss arises because a monopolist restricts output.', answer: { value: true }, explanation: 'This will definitely be on the exam, so learn it well.', sources: ['1:p3.1'] } },
  { want: 'ambiguous', q: { concept: 'x10', topic: 'Costs', type: 'truefalse', stem: 'Marginal cost can sometimes be below average total cost.', answer: { value: true }, explanation: 'It is below it whenever average total cost is falling.', sources: ['2:p2.1'] } },
  { want: 'explanation', q: { concept: 'x11', topic: 'Derivatives', type: 'expression', stem: 'Differentiate $f(x) = x^4$.', answer: { expr: '4*x^3', vars: ['x'] }, explanation: 'Power.', sources: ['3:p1.1'] } },
  { want: 'duplicate', q: { concept: 'x12', topic: 'Monopoly', type: 'single', stem: 'At which output level does a monopolist maximise its profit?', options: [opt('Where marginal revenue equals marginal cost', true), opt('Where price equals marginal cost'), opt('Where average cost is lowest')], explanation: 'MR = MC maximises profit for a monopolist.', sources: ['1:p1.2'] } },
];

/** Answers, each with the grade it should get. */
export const ANSWERS = [
  // numbers
  ...['60', '$60', '60.00', '6e1', '60.2', '120/2', ' 60 '].map((a) => ({ key: { type: 'numeric', value: 60, tolerance: { abs: 0.5 }, unit: '$' }, a, want: 'right' })),
  { key: { type: 'numeric', value: 60, tolerance: { abs: 0.5 }, unit: '$' }, a: '-60', want: 'wrong' },
  { key: { type: 'numeric', value: 60, tolerance: { abs: 0.5 }, unit: '$' }, a: '6', want: 'wrong' },
  { key: { type: 'numeric', value: 60, tolerance: { abs: 0.5 }, unit: '$' }, a: '20', want: 'wrong' },
  { key: { type: 'numeric', value: 60, tolerance: { abs: 0.5 }, unit: '$' }, a: 'sixty', want: 'wrong' },
  ...['0.75', '3/4', '.75', '75%'].map((a) => ({ key: { type: 'numeric', value: 0.75, tolerance: { abs: 0.001 } }, a, want: a === '75%' ? 'close' : 'right' })),
  ...['25', '25%', '25.0'].map((a) => ({ key: { type: 'numeric', value: 25, tolerance: { abs: 0.01 }, unit: '%' }, a, want: 'right' })),
  { key: { type: 'numeric', value: 25, tolerance: { abs: 0.01 }, unit: '%' }, a: '0.25', want: 'close' },
  { key: { type: 'numeric', value: Math.PI / 2, tolerance: { rel: 0.001 } }, a: 'pi/2', want: 'right' },
  { key: { type: 'numeric', value: Math.SQRT2, tolerance: { rel: 0.001 } }, a: 'sqrt(2)', want: 'right' },
  { key: { type: 'numeric', value: 3.14159, tolerance: { abs: 0.005 } }, a: '3.1', want: 'wrong' },
  { key: { type: 'numeric', value: 1200, tolerance: { abs: 0.5 } }, a: '1,200', want: 'right' },
  // expressions
  ...['3x^2', '3*x^2', 'x^2*3', '3 * x * x', 'x^2 + 2x^2'].map((a) => ({ key: { type: 'expression', expr: '3*x^2', vars: ['x'] }, a, want: 'right' })),
  ...['x^3', '3x', '6x', ''].map((a) => ({ key: { type: 'expression', expr: '3*x^2', vars: ['x'] }, a, want: 'wrong' })),
  { key: { type: 'expression', expr: 'cos(x)', vars: ['x'] }, a: 'cos(x)', want: 'right' },
  { key: { type: 'expression', expr: 'cos(x)', vars: ['x'] }, a: 'sin(x + pi/2)', want: 'right' },
  // choices
  { key: { type: 'single', correct: ['b'] }, a: 'b', want: 'right' },
  { key: { type: 'single', correct: ['b'] }, a: 'a', want: 'wrong' },
  { key: { type: 'truefalse', correct: ['true'] }, a: 'true', want: 'right' },
  { key: { type: 'truefalse', correct: ['true'] }, a: 'false', want: 'wrong' },
  { key: { type: 'multi', correct: ['a', 'b'] }, a: 'b,a', want: 'right' },
  { key: { type: 'multi', correct: ['a', 'b'] }, a: 'a', want: 'partial' },
  { key: { type: 'multi', correct: ['a', 'b'] }, a: 'a,b,c', want: 'wrong' },
  // short answers
  ...['cos(x)', 'Cos x', 'the cosine of x', 'cosine of x'].map((a) => ({ key: { type: 'short', accept: ['cos(x)', 'cos x', 'cosine of x'], terms: ['cos'], model: 'cos(x)' }, a, want: 'right' })),
  { key: { type: 'short', accept: ['marginal cost'], terms: ['marginal', 'cost'], model: 'Marginal cost' }, a: 'marginal cots', want: 'close' },
  { key: { type: 'short', accept: ['marginal cost'], terms: ['marginal', 'cost'], model: 'Marginal cost' }, a: 'the marginal cost of the firm', want: 'right' },
  { key: { type: 'short', accept: ['marginal cost'], terms: ['marginal', 'cost'], model: 'Marginal cost' }, a: 'price', want: 'wrong' },
  { key: { type: 'short', accept: ['marginal cost'], terms: ['marginal', 'cost'], model: 'Marginal cost' }, a: 'the extra cost of one more unit', want: 'unsure' },
];
