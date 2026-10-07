# Objects of thought

> Visualize the object of thought, not statements about the object.

A user had a friend work through a row reduction in Logos. The map they got was a chain of boxes:

> GIVEN [matrix] → STEP [matrix] → IDEA "pivot positions" → … → RESULT

Their feedback: *"If I could actually SEE the matrix being modified at each step, I would use this … Visualize your problem being solved, but don't fully solve it until you actually solve it yourself."*

## Audit: what already existed

| Piece | Where | What it gave us |
|---|---|---|
| Canonical state | `ThinkingMap` (`lib/logos.ts`) | Nodes, edges, `models` and `viz`, persisted and synced as one document. |
| Documents with history | `lib/model/docs.ts` | Model revisions, undo, branching and a log. This is the precedent for objects with history. |
| Representation registry | `lib/model/views.ts` | View families with availability derived from state, but only for computational models. |
| Matrix support | `lib/logos-viz.ts` | One 2×2 "plane under a map" plot scene. It had no notion of a matrix whose state changes through operations. |
| Focus / "ask about this" | `lib/workspace/focus.ts` | Briefs describing the selection, built from canonical state. |
| Answer Guard | `GuardSignal` | Shared by every surface. |
| Synthesis | `lib/logos-synthesis.ts` | Reads the map's structure through a digest. |

What was missing was any object whose state is transformed by operations. A matrix could only be text in a node, and an intermediate matrix in the map was whatever the extractor wrote, so nothing had computed it.

## The architecture

```
the person's words ──discover──▶ OBJECT (id, kind, origin)
                                   states[0] ──step──▶ states[1] ──step──▶ …
                                   step = { op, args, said, by, suggested?, note }
                                   at   = which state is current
                 registry (kind) ──┘  sanitize · ops{check, apply, say} · readOp ·
                                      consequence · facts(guarded) · parts · views · size
```

- **`lib/objects/core.ts`** holds the substrate.
  - **Object, state, step:** an object has an identity and a history of states; a step records the operation that produced each new state.
  - **Provenance:** where the first state came from (`person`, `source` or `socria`), who chose each step, and whether Socria suggested it.
  - **`apply` / `seek`:** apply an operation, or move between states.
  - **Registry:** kinds register themselves.
  - **`sanitizeSpace`:** re-computes every stored step from the state before it, and cuts a history at the first state that does not follow. Nothing can claim to have been computed that was not.
  - **`mergeSpaces`:** the live object wins over an in-flight extraction, which can only add objects.
- **`lib/objects/matrix.ts`:** exact rational arithmetic (`rational.ts`) and the three elementary row operations. Each operation is reversible; the irreversible ones are refused with the reason. It also contains:
  - an operation reader that accepts `R2 ← R2 − 3R1`, `R3 → R3 − 5R1`, `R1 ↔ R2`, `multiply R2 by −1/4`, and LaTeX forms;
  - matrix discovery in text: bracketed rows, nested arrays, semicolon rows, `bmatrix`, augmented matrices;
  - a consequence or diagnosis note for each step;
  - echelon form checks and three views: Matrix, As equations, On the plane (2×2 only).
- **`lib/objects/function.ts`:** the second kind, which proves the substrate is general. Changing a parameter, looking at a point, or changing the window are operations; the graph is sampled from the expression by code.
- **`lib/objects/index.ts`:**
  - `discover`: objects in the person's text; their own working is checked against the computation, not adopted;
  - `readOperation`;
  - `suggestionsIn`: operations named in Socria's reply, offered but never applied;
  - `objectsBlock`: the block the reply model receives, guarded while the person is learning;
  - `bindNodes`: binds the map's matrices to computed states;
  - the synthesis history lines.
- **Canonical:** objects live at `ThinkingMap.objects` and nodes refer to them with `obj` / `objAt`.

### Mixed representations

- **The Work lens** (`layoutWork`) leads whenever there is an object.
  - Each object is drawn as itself and live: a bracketed matrix you work in.
  - Below it is the trail, `A —R2 ← R2 − 3R1→ A₁ —R3 ← R3 − 5R1→ A₂`: actual matrices joined by the operation between them.
  - Beside it are the semantic cards about it — a question about the pivot, an idea about dependence — joined to it.
  - The rest of the map sits below.
- **Every other lens** (Graph, Structure, Solution, Flow) draws a node that stands for an object as a compact figure of that object, not as text in a box.

### The interaction loop

1. **The person writes the matrix.** It becomes object A, marked as theirs.
2. **They select a row or an entry.** It becomes the conversation's focus ("Row 2 of A", with facts from state), so they can ask about it.
3. **They choose an operation**, typed in the composer or in the figure. Templates give the form (`R3 ← R3 + ·R1`) and never the multiplier.
4. **Code computes the result exactly.**
   - The changed entries are marked, and their old values lift away.
   - The step is written beside the row it changed.
   - The step line says who chose it and that it was computed.
   - The trail grows by one state.
5. **A step that missed is computed honestly** and the note asks a question instead of giving the answer: *"Entry (3, 1) was 5 and is now 1, not 0. What multiple of R1 would make it vanish?"*
6. **An irreversible operation is refused with the reason**, for example scaling a row by 0.
7. **Step back and forward through states.** A new step taken from an earlier state replaces what came after it.
8. **Socria replies.** When the step came from the composer, the reply is told what *their* step did: state, step and provenance, already computed. A step taken in the figure calls no model at all.
9. **Synthesis reads the transformation history** (for example "You chose R2 ← R2 − 3R1 on A — Entry (2, 1) is now 0. A — an entry beneath a leading entry still nonzero, at (3, 1).") rather than the chat.

### Human-first boundaries

- Arithmetic is done for the person. The choice of operation never is.
- **While the person is learning (the Answer Guard is on):**
  - the reply is told not to name the next operation or multiplier;
  - facts that would be the answer, such as rank, are withheld or marked "not to state";
  - leading entries are not underlined for them;
  - Socria's suggestions are not offered;
  - the function figure hides the slope.
- **Otherwise:** Socria may suggest an operation in the workspace's notation. It appears as "Socria suggested … · Try it"; it is never applied by being read, and if the person applies it the step records both who suggested it and who applied it.

## Verification

- **`test/logos3-objects.test.mjs`** — 122 checks.
  - **Arithmetic:** exact arithmetic, plus 300 random operations checked against independent arithmetic; reversibility; refusals with reasons.
  - **Reading and diagnosis:** 16 operation phrasings read, and 7 non-operations (questions, negations) left as words; diagnosis that never names the multiplier.
  - **History and provenance:** step-back semantics; forged histories cut; provenance on every path.
  - **Discovery and binding:** discovery in five formats; checking a person's own working; binding map matrices, including not showing ones nothing computed.
  - **Conversation, focus and synthesis:** reply block guarded and unguarded; focus on a part; synthesis from history.
  - **Function kind and Work lens:** function operations; Work lens layout with no overlaps.
  - **A representation benchmark, A–H:**

| | Case | Exposes |
|---|---|---|
| A | Linear algebra | the matrix itself (Work) |
| B | Calculus | the function and its graph (Work) |
| C | Economics | the supply/demand scene with computed equilibrium (Plot) |
| D | Onboarding design | Flow |
| E | Argument | semantic structure |
| F | Research | structure, not objects |
| G | Spring–mass | the engine's model (Plot) |
| H | Small dataset | **known gap** — no data object yet; asserted that nothing is invented |

- **Chromium, 34 checks** on the external user's own matrix:
  - write it, select a row and ask about it;
  - `R2 ← R2 − 3R1` from the composer (verified against independent arithmetic);
  - a wrong multiple from the figure (computed honestly, with the question), then step back and redo;
  - a refused ×0, a template, continuing to `[0 0 0 −10]`;
  - in the Solution lens, the given matrix drawn as the object and an uncomputed matrix not shown;
  - a refresh keeps everything;
  - unguarded: a suggestion offered, applied, and recorded as Socria's suggestion that the person applied; the equations view;
  - a function with a parameter change verified against the true vertex (0.75, 0.875), and a point picked on the graph with the slope hidden under the guard;
  - a 2×2 matrix opened on the plane (det 5; eigenvalues 3.618 and 1.382).

## Not yet

- **Data objects** — tables, distributions and charts of a dataset — are the next kind.
- **Vectors and geometry** as objects of their own.
- **Equation manipulation** as operations on an expression. `lib/model/terms.ts` already has the algebra.
- **The extractor proposing objects.** Today they come only from the person's words and attachments. A matrix that exists only in an image is found only if the image reading writes it out.
- **Branches** that keep both futures. Today a new step after stepping back replaces what came after.
- **Collaboration and models.** Objects sync with the map, but a collaborator's figure operations are not yet attributed per seat. Model documents (`lib/model/docs.ts`) are not yet registered as an object kind; they keep their own revision system.
