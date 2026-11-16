# Visual explanations: the representation a turn gets

What happens to an element after it is drawn — kept, edited, changed in place by Socria, checked before it is shown — is in `docs/LOGOS-6-ARTIFACTS.md`.

Socria already drew in the conversation: a graph to change (curves, sliders, a tangent, a chord), a small simulation, flows, cycles, trees and causes, timelines, comparisons, worked steps, claims to inspect, and, in the workspace, calculus pictures in MathViz. This work adds what was missing for the brief's core cases, inside the same pipeline:

- a graph's **points**, filled or open (a hole), checked against the curve;
- a **shaded area** under a curve or between two curves, and **Riemann rectangles** with their total against the exact area;
- crossings between **every pair** of curves (marginal revenue meeting marginal cost);
- a **forces** element: vectors on a body and their sum;
- a **trace** element: an algorithm's states, stepped through;
- planner variants that choose these when the idea needs them: limit, area, monopoly, forces, algorithm;
- the turn's **representation**, named and traced.

No new engine and no new pass. No model call is added, and no model-written code is run.

## 1. What the audit found

| Area | Where | State before |
|---|---|---|
| Representation choice | `lib/runtime/presentation.ts` `planPresentation`, called by the route right after Cognitive Allocation with its move and question budget | Working. It chose among 18 inline elements from the person's words, the kind of work and what the allocation keeps with them. It had no variant for limits, areas or market power, nothing for forces or algorithms, and did not name its choice. |
| Structured specifications | `lib/inline-ui.ts`: a ```ui JSON block per element, parsed, repaired, validated (`sanitize*`), checked by the gate (`checkInlineSpec`: one live element a reply, the Answer Guard, figures from their own data) | Working and strict. |
| Maths | `lib/inline-math.ts` over the engine's own parser (`lib/logos-math.ts`, no `eval`) | Curves, turning points, roots, crossings, slopes, the mean value theorem. No limits, areas or sums. |
| Rendering | `components/inline/InlineUI.tsx` (SVG, React), `inline.css` | Graph: no points of its own, no regions. |
| Streaming | `lib/rich-text.ts` and `RichText`: a ```ui block is drawn only once its fence closes | Working. Held down in the new tests. |
| Workspace pictures | `components/MathViz.tsx` (limits, derivatives, Riemann sums, Taylor, ODEs, vectors in the workspace) | Working. Untouched: the workspace remains the place for a larger, persistent model. |
| Logic Maps, documents | `lib/logos5`, `lib/docs` | Untouched. Claims and concept overviews remain the conversation's maps. |

## 2. Representation, as part of the allocation

The allocation decides who thinks and how the reply meets them. The planner then decides how the explanation is represented, from the same turn: the person's words, the work, the allocation's split, its question budget and the Answer Guard. `representationOf()` names the outcome as one of the brief's ten: `text`, `notation`, `graph`, `diagram`, `flow`, `timeline`, `comparison`, `simulation`, `map` or `hybrid` (two elements). It is traced on every turn as `repr=` in `X-Socria-Runtime`, beside `inline=`.

| Asked | Gets |
|---|---|
| "approaches 2 as x approaches 1, but f(1) = 3…", "limit of (x²−1)/(x−1)", "continuity and removable discontinuities" | graph: limit |
| "slope of a tangent line" | graph: tangent (as before) |
| "Riemann sums…", "what does the integral mean geometrically", "consumer surplus" | graph: area |
| "a tax shifts supply and demand" | graph: market (as before) |
| "how does a monopoly choose its price" | graph: monopoly |
| "net force on a box pulled at 30°", "add two vectors" | forces |
| "how does binary search work", "walk me through bubble sort" | trace |
| a capital city, a greeting, "speed limit", "upload limit", thanks, a unit conversion | text: nothing drawn |

**Beginners and experts.** Someone who says they are an expert ("I'm a mathematician") gets the idea in notation, without a picture, unless they ask to see it. Asked to be shown, it is drawn in the workspace. Everyone else gets the picture. The planner already folded an expert's reply to a single move and left the graph out where steps were asked for.

**Asked plainly.** A limit is what a curve approaches against the value it takes, so "…what is the limit?" gets its picture as surely as "why is it not 3?" does. Riemann sums and surplus are treated the same way. A stack or a queue, asked how it works, gets its states to step through.

## 3. The acceptance case

*A function approaches y = 2 as x approaches 1, but its value at x = 1 is 3.*

```json
{"type":"graph","title":"The limit, and the value","expr":"(x^2-1)/(x-1)","x":[-1,3],
 "params":[{"name":"p","label":"x","value":0.2,"min":-0.8,"max":2.8,"step":0.05}],"at":["p"],
 "points":[{"x":1,"open":true},{"x":1,"y":3}]}
```

- **The open circle's height is computed.** Its y is the limit, read off the curve from both sides (`limitAt`). The curve is undefined at 1, and the limit is 2.
- **The filled point is checked.** It is off its curve, so it needs the hole at the same x.
- **Contradictions are refused.** A hole where the curve does not go is refused. So is a filled point off the curve with no hole, which would show a line running straight through a value it does not take. In each case the block is dropped and the prose stands alone.
- **Interaction.** They drag the point toward x = 1 from either side, by pointer or keyboard, and watch its height.
- **Readings.** "as x → 1, y → 2" and "at x = 1, y = 3" are read out beside the picture and to screen readers.
- **Follow-up questions.** Socria's history carries the graph as "an open circle (the curve approaches but does not take it) at (1, 2), a filled point at (1, 3)", so a question about it is answered from what is drawn.
- **Answer Guard.** Under the guard, the marks are drawn and their coordinates are not.
- **Layout.** It renders at phone and desktop widths. The figure scales with its container.

## 4. The pieces

| | Specification | Computed | Interaction |
|---|---|---|---|
| Points | `points: [{x, y?, open?, label?, curve?}]`, numbers or formulas in the parameters | the limit (open, no y) or value (filled, no y); consistency against the curve | they move with the parameters |
| Area | `area: {from, to, between?, label?}` | Simpson's rule; between two curves for a surplus | from/to may be parameters |
| Riemann | `area.rects: {n, rule}`, `n` a number or a parameter | each rectangle's height, the total, the exact area, the gap | slide n |
| Crossings | `features: ["crossings"]` | every pair of curves | live |
| Forces | `{type:"vectors", vectors:[{label, mag, angle}], params, resultant?, unit?, body?}` | each component, the sum, its size and direction; "zero, they balance" | sliders |
| Trace | `{type:"trace", kind, steps:[{cells, mark?, done?, pointers?, note}]}` | nothing (what is written is what is shown) | Back, Next, a step slider, arrow keys, Home, End |

**Validation.** Sizes must not be negative. Directions are required. Indices and pointers must fall inside the cells. A trace needs 2 to 40 steps, at most 16 short cells and a note on every step. Formulas must be readable by the engine and finite as they start.

**Under the Answer Guard,** forces and traces are refused, since they would be the worked answer. Points and areas are drawn without their numbers. Graphs, simulations, forces and traces count as live elements, and a reply carries at most one.

## 5. Against text only

`evals/visual/run.mjs` sends 13 cases from this brief through the real route twice: text only (`LOGOS_INLINE=off`) and visual.

| Offline result (`evals/visual/results/offline-2026-11-14.md`) | |
|---|---|
| Representation as each case expects | 13 of 13 |
| Turns given a picture | 10 of 13: a fact, small talk and the expert get none |
| A valid picture reaches the person intact through the gate | in every visual case; never in the text arm |
| An invalid picture | refused; its prose reaches them alone |
| Model calls per turn | 1 in both arms: none added |
| Cost of the offer | about 1,100 prompt characters (≈ 270 tokens) a turn on average, at most 1,850, all in the per-turn note (the cached system message is unchanged) |
| Route time with an instant model | about the same in both arms (11 ms median) |

The live mode saves blind pairs for readers. None has been read, so no claim is made about understanding.

## 6. Tested

- `test/visual-explanations.test.mjs`, 82 checks:
  - the planner across the brief's scenarios, including those that must get nothing;
  - the acceptance case, including its three refusals, the readings, the history text and the Answer Guard;
  - derivative slopes, Riemann totals for each rule, and convergence;
  - equilibrium before and after a tax, a monopoly's MR = MC at q = 5, and consumer surplus of 18;
  - force sums and balance;
  - trace validation, rendering and keyboard;
  - refusal of an unreadable formula, of code, and of chart figures that are not in what the person gave;
  - one live element per reply;
  - a half-streamed block, which draws nothing and shows none of its JSON;
  - every example format Socria is shown validates;
  - the expert rule, the plain limit question, the stack trace;
  - each new element said in words when it cannot be drawn;
  - the comparison's scenarios.
- The existing graph, inline, presentation and explanation suites pass unchanged, as does the full suite.
- In the browser (Chromium, the production build, desktop 1440 × 900 and an iPhone-sized 390 × 844): the limit graph, Riemann rectangles, forces and a trace, in the real conversation, with no page errors.

## 7. Limits

- **Comprehension is not measured.** Nothing here shows that people understand more from these pictures than from text. A blind comparison needs a live model and readers, as in the engagement evaluation.
- **"Draw a free body diagram" goes to the workspace.** Requests to draw or be shown something go to the workspace's own picture beside the conversation, as they did before. The forces element is offered inline when someone asks about forces. Offering both would draw the same thing twice.
- **Error boundaries run only in the browser.** A component that throws falls back to words there (`InlineSafe`). Server rendering cannot exercise that, so the tests hold down the fallback text instead.
- **Uploaded diagrams are not reconstructed.** Existing behaviour holds: a chart of "their" figures that are not in what they gave is refused, with a line saying so. Reading a screenshot of a graph back into an exact picture is not built.
- **Some brief items are not separate elements.** Circuits, state machines and system architecture are drawn with the existing diagram views (flow, cycle, tree), not as new kinds. Argument maps and concept networks remain the claim and concept elements and the Logic Map.
- **A trace is only as right as its steps.** It shows exactly what the reply wrote. The format asks the model to work every step out first, but the states are not re-executed.
- **Rendering failures are contained, not prevented.** A component that throws is caught by `InlineSafe`, and the element is said in words instead.
