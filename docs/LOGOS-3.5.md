# Logos 3.5 — Human-First visual intelligence

Logos 3 showed what the engine can compute: models, simulations, CAD. Logos
3.5 points the same machinery at ordinary thinking — a semester to organise,
two job offers to weigh, an essay to structure, a balance sheet to learn —
and gives the person something they can **think with**, not a picture to
look at.

This document is the design and the working log. The status table at the
bottom is the truth about what is done.

## 1. The decision: displays are objects of thought

Four rendering systems already exist (inspected before anything was built):

| System | Where | What it is good at |
|---|---|---|
| Math plots | `lib/logos-viz.ts` → `MathViz` | functions, calculus, economics curves (incl. supply/demand with tax incidence, `lib/logos-econ.ts`), simulations |
| Model engine | `lib/model/*` → `ModelView` | computed models, 25 view families, solids/CAD |
| Objects of thought | `lib/objects/*` → `ObjectFigure` | things with state the person operates on — matrix, function, Live 3D scene |
| Map lenses | `lib/logos-layout.ts` → `ThinkingMap` | the person's own thinking, re-presented (structure, flow, ordinal timeline, compare) |

None of them holds **authored, everyday content** the person edits: a dated
plan, a weighted comparison, an argument with their own evidence, a
worksheet, a chart of their numbers. The map lenses come closest, but they
are rebuilt from extracted nodes every turn and cannot be edited; the map
is capped at ~16–26 nodes and holds only the person's thinking, not outside
content (a history timeline is not the person's thinking).

So the everyday displays are **new kinds in the objects-of-thought
registry** (`lib/objects/core.ts`), not a fifth system. That registry
already gives every kind, for free:

- **persistence and sync** — objects live in `ThinkingMap.objects`, so they
  save, restore and travel to collaborators with the map;
- **integrity** — every state after the first is computed by the kind's own
  operations, and `sanitizeSpace` re-computes the whole history on load;
- **provenance** — each object says where it came from, each step who chose it;
- **undo / redo** — `seek` moves through the history without losing any of it;
- **natural-language edits** — `readOp` runs before any model is called;
- **conversation context** — `facts` / `text` (guard-aware) describe the
  current state to the model on later turns;
- **the Mind view** — the Atlas already projects a chat's objects.

What the registry needed (P0):

1. Operations can know **who** is applying them, so Socria can never
   overwrite what the person wrote (`OpDef.check(state, args, who)`).
2. Room for more objects (the cap of 8 was set for matrices).
3. A figure **registry** in place of `ObjectFigure`'s switch on kind names
   (the registry's own rule 4).

## 2. The kinds

One state shape per kind; views are projections of the same state (a plan
is a timeline, a board, a checklist); a change of state shape is a
conversion that makes a new object linked to the old one.

| Kind | State | Views | Covers |
|---|---|---|---|
| `plan` | items (title, date/end or order, status, lane, notes, by) + dependency links | timeline · board (kanban) · checklist · storyboard · list | semester plans, schedules, historical timelines, kanban, checklists, progress, storyboards |
| `compare` | options × criteria, weights, scores (with uncertainty), notes | matrix · ranking · sensitivity | decisions, trade-offs, comparison matrices |
| `argument` | thesis, claims, evidence, counterarguments, rebuttals, open questions; support/oppose links | map · outline | essays, debates, evidence maps |
| `diagram` | nodes, edges, groups, hierarchy; optional probabilities/payoffs | concept map · mind map · hierarchy (org chart) · flowchart · decision tree · outline | concept/mind maps, networks, org charts, flowcharts, decision trees, cause and effect |
| `data` | a validated table (typed columns) + chart bindings | table · bar · line · area · scatter · pie · histogram · heatmap | charts of the person's numbers |
| `venn` | 2–3 sets and their elements | venn · table | overlaps and differences |
| `worksheet` | template sections and lines the person fills; deterministic rules | worksheet · checks | accounting (balance sheet, journal entry), structured practice |
| `exercise` | a snapshot of another display's parts with labels hidden; the person's answers | label · recall · results | labeling, retrieval practice, "hide the labels so I can test myself" |
| `market` | linear supply and demand, tax/subsidy/shift/control, a prediction | graph · numbers | predict-then-reveal economics, on `lib/logos-econ.ts` |

## 3. AI-directed, deterministic

1. **Intent** — `readDisplayRequest` (deterministic) recognises plain
   requests ("make a timeline of…", "compare…", "a blank balance sheet",
   "hide the labels"); the extractor's `ask` covers the rest.
2. **Representation** — a kind and a view from the catalogue
   (`lib/objects/display/catalogue.ts`).
3. **Spec** — for content only the conversation can supply, a dedicated
   display pass in the map route asks the model for `{kind, title, state}`
   against the catalogue. Deterministic builds (blank worksheets, exercises
   from an existing display, conversions, a default market) need no model.
4. **Validation** — the kind's `sanitize` (caps, references, dates, numbers,
   types). Invalid → refused with the reason; unsupported → said so, with
   what Logos can draw instead. **Nothing is invented to fill a gap**: chart
   numbers come from the person or their material; illustrative data is
   labelled as such.
5. **Render** — deterministic components per view.
6. **Edit** — by words (`readOp`, then a model-proposed op list for complex
   edits, validated op by op) or by hand (each gesture is one op).
7. **Consistency** — every edit is an op on canonical state; views re-derive.

## 4. Human-First learning

Progressive assistance on every exercise: attempt → small hint → specific
guidance → worked explanation → follow-up. Hints are steps in the history,
so they are visible, never silent. Grading is deterministic wherever the
answer is verifiable (balances, classifications, equilibria, labels);
open-ended explanations get AI feedback that says it is AI and how sure it
is. Nothing claims mastery: results describe this attempt.

## 5. Status

| Part | State | Notes |
|---|---|---|
| Inspection | done | four explorers; findings above |
| P0 reliability | in progress | |
| P1 kinds + renderers | — | |
| P2 creation + editing | — | |
| P3 learning | — | |
| P4 polish | — | |
| Tests (10 workflows) | — | |
