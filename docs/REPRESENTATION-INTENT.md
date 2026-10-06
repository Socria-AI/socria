# Representation intent

*Logos should not only understand what the person is talking about. It must understand what they are trying to build with their thinking.*

## The failure

Someone designing Socria's onboarding — *the stages a new user goes through* — got a cloud: "user experience" → Constraint, "steps involved" → Constraint, "information to be provided" → Constraint, "easy access" → Value. Each reading was defensible. The map was still wrong, because the extractor answered *what is this about?* and nothing asked *what is this person making?* They were constructing a **process**, and a process is steps, transitions, branches and conditions, with constraints attached to the steps they constrain.

## The fix, in one sentence

Every map now carries **what is being built** (`map.building`), every node carries a **structural role** separate from its **semantic type**, and the shape that is being built decides the representation.

## Pieces

| | Where | What |
|---|---|---|
| Grammars | `lib/representation.ts` `GRAMMARS` | An open registry: process, plan, timeline, system, decision, comparison, argument, research, model, brainstorm. Each declares what it builds, its spine roles, whether it is ordered, and the lenses that draw it. Adding a grammar is one entry. |
| Type vs role | `LogosNode.type` / `LogosNode.role` | "Sign up" is an action (type) and a step (role). "Easy access" is a value (type) and a detail of the steps it constrains (role). "Core or Logos" is a branch. |
| Attachments | `applies_to` relation, `attachmentsOf` | Details hang from the spine node they bear on, so a process is a hierarchy rather than one flat canvas. |
| Conditions | `LogosEdge.when` | The condition a transition is taken on ("entered through Logos"). |
| The reading | `readBuilding` | Weighs three sources: the **person** ("show this as a process" — wins, and sticks until they say otherwise); the **structure** on the map, scored in code (`structuralScores`) from roles, sequence chains, branches, options against criteria, claims over evidence; and the **extractor**'s reading of the conversation. A standing shape only yields to one that is clearly better *and* that the structure bears out (hysteresis), so one ambiguous turn does not flip a flow into a cloud. Secondary shapes are kept in `also`. |
| The prompt | `buildMapPrompt` | "WHAT ARE THEY BUILDING?" comes before any node is typed. The grammar list is generated from the registry. It separates type from role, forbids "steps involved"-style description nodes, and says that a statement about the order changes the order. |
| The repair | map route + `buildRestructurePrompt` | When the reading names a shape the structure does not satisfy (`satisfies`) — a process with no transitions — the map is restructured once for that shape, and kept only if every idea survives (`keptEverything`). |
| Representation | `availableLenses`, `leadLens`, `lensFor` | The shape picks the lens: process/plan → **Flow**, timeline → **Timeline**, decision/comparison → Compare (matrix), argument → Evidence, research → Structure, model → Plot, system/brainstorm → Graph. A lens is offered only when the structure is there to draw. |
| Flow | `layoutFlow` | The spine in order, left to right, wrapping into rows like text; branches as parallel paths; conditions on the arrows; loops drawn as returns; details as a count on the step and listed when it is opened; anything not yet placed in the shape stays visible beneath it. Top to bottom on narrow panels. |
| Timeline | `layoutTimeline` | Events along an axis, alternating above and below. |
| The reply | `briefOf` → `buildingBlock` | The chat route is told the shape and its spine in order, so it talks in steps and branches. |

## What it is not

There is no `if topic === onboarding`. Nothing in the registry, the scoring or the prompt names a subject (a test enforces it). The same pipeline reads a hiring loop as a process, a germination experiment as research with a process inside it, a move between cities as a decision, a four-day-week case as an argument, a damped spring as a model, a launch as a plan, the fall of the Berlin Wall as a timeline, and two pricing strategies as a comparison.

## Verified

- `test/representation.test.mjs` (103): type/role separation; the reported cloud fails `satisfies(process)` and its repair keeps every idea; the onboarding conversation turn by turn — signup moves after the first experience when the person says so, the guest constraint attaches to the guest path, the Core/Logos branch opens two parallel paths that rejoin, the whole flow reads in order with its loop; the flow layout loses nothing; nine tasks pick eight different shapes and their lenses; with the extractor's reading removed, structure alone recognises all nine; corrections parse and questions about a subject do not; hysteresis; the timeline; no subject in the registry.
- `test/representation-e2e.test.mjs` (49): the real map and chat routes with the extractor scripted — the cloud is repaired into a flow in one extra call, a lossy repair is refused, a failed repair still returns the map, nothing is restructured when no shape was claimed; the onboarding conversation through five turns; "Actually, show this as a process." restructures a decision into a flow and stays a process next turn; eight other tasks through the same route.
- Chromium: Flow in Logos 2 and Logos 3 (wide, wrapped into rows; narrow, top to bottom), a step's details listed in its menu, Timeline, the decision table, the cloud as it was.

**Not verified here:** whether the live model follows the new instructions. The sandbox cannot reach it; every extraction in the suites is scripted. The deterministic half — reading, repair, correction, lens and layout — is what the suites hold. The first thing to do with a live key is replay the onboarding conversation and the eight tasks and compare the extractor's `building` and roles against the fixtures in `test/fixtures/shapes.mjs`.
