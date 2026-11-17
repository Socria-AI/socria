# Visual actions: the conversation and the picture as one system

Logos 6, November 2026. Code in `lib/visual/` (pure) and `components/inline/visual-*.ts`, `VisRef.tsx` (browser).

Socria's pictures used to sit beside its words. Now each can be referred to:
- Socria can point at a part while it explains;
- a person can ask to see something and it is done;
- a change animates the model itself;
- what the person did with a picture reaches Socria with their next message.

## 1. How it fits together

```
their words ─┐                                       ┌─ renderer (graph, forces, trace, steps, diagram, mind map,
Socria's ────┼→ action (data) → target resolution →  │   sequence, simulation, equation, quiz review)
markers      │   (lib/visual/intent.ts,               │   does it with its own model: the same values a slider sets
a press ─────┘    VisRef.tsx)                         │
                 → validation (lib/visual/actions.ts) ┤
                 → the bus (visual-bus.ts)            └─ state for Core: catalogue + note (lib/visual/context.ts)
```

A generated picture takes the same path at the end:
- a request becomes a model specification (the ```ui fence);
- the specification is validated (`lib/inline-ui.ts`, including `animate`);
- the trusted renderer draws it, and its parts register on the bus.

Both paths share:
- one element identity;
- one action check;
- one way of keeping state.

## 2. Parts that can be pointed at (`lib/visual/elements.ts`)

Every artifact has a key. A reply's nth element is `<message id>:<n>`, the key artifact-focus already used. A quiz is `quiz:<object id>`.

Each part is identified by what it is, never by its position on screen or its colour:

| Artifact | Parts |
|---|---|
| graph | `curve:<label>` (`curve:demand`, `curve:mr`; `curve:f` unlabelled), `point:equilibrium` (demand meets supply), `point:mr-mc`, `point:crossing`, `point:turning`, `point:root`, `point:intercept`, `point:<label>` / `point:hole`, `point:<param>` (a dragged point), `line:tangent`, `line:secant`, `region:<area label>`, `region:rectangles`, `mark:<n>` (numbered highlights), `readout:<label>`, `param:<name>` |
| forces | `vector:<label>`, `vector:sum`, `param:<name>` |
| algorithm trace | `step:<n>`, `cell:<i>` |
| worked steps | `step:<n>` |
| diagram, mind map | `node:<id>`, `edge:<from>><to>` |
| sequence, timeline | `item:<n>` |
| simulation | `path:trajectory`, `param:<name>` |
| equation | `term:<symbol>` |
| quiz review | `question:<n>`, `question:<n>/yours` (marked wrong where it was) |

Each part records:
- its kind and a readable label;
- the words people call it by. An economics row lists every name one thing goes by, so "MR" and "marginal revenue" find the same curve;
- its facts as they are now: formula, value, range, start, where it is, slope, area;
- the operations it supports.

An id survives an ordinary edit that keeps the part: a value changed, a title changed, a curve added. A reference spelled another way ("curve:marginal-revenue") is found by the part's names.

## 3. Actions (`lib/visual/actions.ts`)

`highlight`, `unhighlight`, `focus`, `zoom`, `pan`, `trace`, `animate`, `pause`, `resume`, `replay`, `step`, `compare`, `update_parameter`, `reveal`, `reset`.

An action is data, never code: an operation, the parts it is done to, and its numbers (`to`, `by`, `step`, `k`, `ms`, `hold`). It is checked against the artifact as it stands now, before anything moves. Nothing in an action can reach another artifact, the network or the page. What fails is said, and nothing happens. The checks:
- the operation exists, and the artifact or the part supports it;
- every part named exists;
- a number is a number, kept inside the parameter's range and on its step (and said when it was clamped);
- the change is a change;
- a secant's two ends never meet, because its slope is undefined there. The move stops one step short;
- a step exists;
- a move named on a point or a tangent becomes a move of its parameter.

**Shown, or kept.**
- Emphasis, focus, zoom, trace, pause and replay change how the artifact is shown, for a moment. They are held on the bus, never written into the artifact, and never make a version.
- `animate`, `update_parameter`, `reset` and `step` change what the artifact is. They go through the same values a slider sets, so they are kept with the message (or the kept artifact) exactly as a hand on the slider would be.

**Motion follows the model.** Every frame is a state the model can be in:
- a parameter moves on its own step (`tweenAt`);
- a count of rectangles is a whole number at every frame, and grows by ratios, so 4 → 16 takes as long as 16 → 64;
- an approach (a secant closing on a tangent's point) slows as it closes;
- moves take 0.9–3.2 s, and none at all under reduced motion.

## 4. How a request is triggered

**Their words** (`lib/visual/intent.ts`) are read at send time against what is on the page:
- the parts of each artifact, its parameters and its step;
- the part they selected;
- the artifact they last touched.

The outcomes:
- **act** — the actions are done before Socria answers, and Socria is told it was done ("say what to notice; do not explain how to do it").
- **ambiguous** — two parts fit equally ("highlight the curve" on demand and supply). Socria asks which, in a line, never guessing.
- **about** — "why did this move?" with a curve selected. That curve, its state and its recent change go to Socria.
- **cannot** — the request is understood but the picture cannot do it: already at the end of its range, or nothing is marked as a mistake. Socria says so; nothing is faked.
- **null** — a question that only names a part ("what is the demand curve?") is left to Socria. Only an explicit request acts.

Which artifact a request applies to, in order of weight:
1. the one the person last touched;
2. a title word they said ("on the coffee graph");
3. for a change, a part that can move;
4. the newest.

A change is worked out on the model, numerically:
- "demand increases" moves the parameter only demand uses, in the direction that shifts demand right;
- "supply increases" shifts supply right too, which moves it down;
- other curves rise or fall;
- a count ("more rectangles") doubles;
- "make the tangent flatter" moves the point to where the slope is nearer 0.

**Socria's words** use markers on their own words: `[the demand curve](vis:highlight/curve:demand)`, `[demand rises](vis:animate/param:d?to=4)`, `[the second step](vis:step?step=2)`. `lib/rich-text.ts` reads them strictly, on every surface, so the syntax is never shown.
- **In a reply just written**, each marker is done once, in reading order. Each gets its moment, or its motion's own length, before the next. A marker waits until the part it names is drawn (the graph below the sentence).
- **Never repeated.** A marker is never done again when the reply is redrawn. While the reply is still streaming, markers are only words; the final drawing does them.
- **Afterwards**, hovering a marker lights its part, and pressing it shows the action again.
- **A marker that names nothing** is drawn as its words.
- **The prompt's limits:** at most three markers, on the sentence that explains that part, never for decoration (`VISUAL_CUES`).

**A graph's own change.** A graph can carry `"animate": {"param": "b", "to": 2}`. It plays once as a fresh reply's graph comes into view; Play, Pause, Replay and Reset replay it. Forces and simulations take the same field.

**The planner** offers these pictures:
- a secant approaching a tangent;
- animated Riemann sums, kept in the reply rather than sent to the workspace (`INLINE_MOTION`);
- "what happens when demand increases";
- a sampling distribution and its sample size;
- "show me binary search on […]".

A projectile is still the workspace's simulation.

## 5. Socria's knowledge of what is on screen (`lib/visual/context.ts`)

- **The catalogue.** The server builds it from the conversation it already has: the three newest pictures, each with its key and its parts by exact id. It includes the numbers that matter now:
  - a parameter's value, range and starting value;
  - where the curves meet, and where they met;
  - the rectangles' total against the exact area, to four places (2.6658 against 2.6667).
- **The note.** It travels with the person's message (`Msg.vis`) and records:
  - what was done for this message;
  - what they selected;
  - meaningful changes since they last wrote, by whom (a hand on a slider, a request, Socria), with what the model says now;
  - a reference that fitted more than one part;
  - a request that could not be shown.

  The note is untrusted. It is shaped and clipped on the chat route and when saved (`sanitizeVisNote`), and read as one bracketed line before their words. Single frames are never sent.

So "why did the approximation get better?" is answered from the graph as it stands: the function, the method, the old and new counts, and both totals.

## 6. Where it works

- **The conversation.** Elements in `L5Message` carry `host.id` and `host.fresh`, and a reply's markers have its context (`VisReplyContext`).
- **The Everything view.** The board's cards, their enlarged copy and the zoomed-out canvas use the same keys. An enlarged card is the same artifact: its values (kept with the message), its emphasis (on the bus) and its controls carry over, and Reset there is Reset on the card.
- **Quiz review** (`QuizFigure`). A question pointed at is outlined, the others dimmed, and the answer that went wrong is marked "this is where it went wrong". The quiz is never edited.

## 7. Design

- **Emphasis is never colour alone.** What is pointed at is lit by weight and a soft halo; the rest steps back to 30% (dimmed, never hidden). It pulses once when first lit. Points get a ring; HTML parts get an outline and a tint.
- **Forced colours** use the system's `Highlight`.
- **Reduced motion.** There is no pulse, transition or movement: a change jumps to its end, and the start stays drawn faintly beside it, so the change is still shown.
- **Screen readers** hear what is shown ("Showing Demand.").
- **Keyboard.** Every control can be reached: markers, curve names (press to select, so "this" means that curve), Play, Pause, Replay, Reset and "Whole graph".
- **Controls appear only where they do something.** A graph shows Play only when it has a change to play, and Reset only once it has changed.

## 8. Performance

- One `requestAnimationFrame` tween per artifact, held while the artifact is out of view (IntersectionObserver) and cancelled when it goes.
- Values change through React state; nothing is saved per frame, only when a move ends.
- The bus re-renders only subscribers. Commands carry a number, so a redraw never repeats one.
- Everything is SVG, through the renderers that already existed. No dependency was added.

## 9. Tested

**`test/visual-actions.test.mjs`, 85 checks.** It covers:
- identity, including surviving edits;
- every kind's parts;
- strict marker parsing;
- validation, including range, step, no-op, the secant's ends and steps;
- motion: whole numbers, ratios, approach, reduced motion;
- the spec's `animate`;
- intent: scenarios A, E, F and G, ambiguity, the active artifact, a movable part, a named title, "more rectangles", "flatter", the end of a range, a mistake not marked, reset/pause/replay, and a question left alone;
- the note and the catalogue;
- markers on every surface, copied as words;
- the drawn controls;
- the wiring;
- the planner.

**In the real app** (`.mock-ui/va.mjs`, Chromium; not in CI because it needs a browser), against a conversation with a market, a secant, Riemann sums, a binary-search trace, and a fresh monopoly reply with markers:

| | Result |
|---|---|
| A | "Highlight the demand curve." Demand lit, supply dimmed but drawn, no new artifact |
| B | The fresh reply's markers lit MR, then MC, then Demand, in order, once; nothing lit elsewhere |
| C | Play: the average slope fell 4.61 → 4.18 → 4.03 → 4.01, slope at x = 2 is 4; Replay, then Pause held b at 2.43 |
| D | Play: rectangles 4 → 5 → 8 → 19 → 40 → 58 → 64, total 2.67 against 2.67 |
| E | "Show me what happens when demand increases." Demand shift 0 → 1.5 → 2.5, the curves meet at (5.25, 7.25), the start drawn faintly, the equilibrium lit |
| F | Demand selected, "Why did this move?": Socria was told `Demand (curve:demand) on “Market for coffee”` and "Animated demand shift from 0 to 2.5 … (asked by them)" |
| G | "Highlight question 4's incorrect step." Question 4 and the wrong answer were lit. For question 2 (answered right), the reply says there is no incorrect step |
| H | Expanded: demand shift still 2.5, emphasis still lit, Reset in the expanded view reset the card |
| I | Reduced motion: 64 rectangles 120 ms after Play, the highlight with no animation, other curves at 30% |

There were no page errors.

## 10. Limits

- **Which disciplines are covered.** The parts above, drawn by the renderers above, are what can be pointed at and moved:
  - mathematics: calculus, algebra and statistics as graphs with parameters;
  - economics: markets, monopoly, surplus regions;
  - physics: forces, and a trajectory in the inline simulation;
  - computer science: traces of algorithm states;
  - anything drawn as a diagram, timeline or worked steps.

  Chemistry, biology, history and others are covered only as far as they are drawn as diagrams, timelines or steps. There are no new domain simulations, and no claim of physical exactness.
- **Charts** have no parts to point at yet: their renderer does not light them, so no action is offered that would do nothing.
- **Matrix transformations, eigenvectors, waves, circuits and neural networks** have no inline renderer. They remain in the workspace's own pictures, which visual actions do not address.
- **"Compare this graph to the previous one"** compares a graph with its own start, not two artifacts side by side.
- **A trace is exactly what the reply wrote.** Its states are not re-executed (unchanged from before).
- **Markers are done once per page load,** for the newest reply in its first three minutes. Older replies' markers act only when hovered or pressed.
- **How well Socria uses markers** depends on the model following the rule. Only the mechanics are tested here, not the quality of its choices.
