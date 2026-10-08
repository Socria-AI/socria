# Logos 3 — the composable workspace

*"My thinking environment reconfigures around what I am trying to understand."*

One canonical intellectual state, many representations, many arrangements, one human in control.

## 1. How the Logos workspace was structured

`components/LogosApp.tsx` (≈3,700 lines) rendered a fixed CSS grid: the rail, the conversation column, the Thinking Map column and an optional draft column. The map column was `ThinkingMap`, which itself switches between lenses (graph, structure, tensions, evidence, solve, plot, board, compare — Logos 3 has no board; see §12); the **plot lens** is where a built model is drawn, by `ModelView`, the one renderer for every model. On a phone a switcher shows one column at a time.

## 2. Where canonical state lives

All of it is in the **session** (`lib/logos-sessions.ts`) that `LogosApp` holds and persists:

- `messages` — the conversation;
- `map` — the Thinking Map (nodes, edges, context, removed), plus a picture (`viz`) when there is one;
- `map.models` — the **model workspace** (`lib/model/docs.ts`): model documents, each with revisions, a one-line change log, undo/redo, restore and branches. A model's **selected object** and **open view** are canonical — they live on the model, so every view of it agrees on what "this" is.

The engine re-derives everything drawn (`unpack`, `buildSpec`, `viewdata`) from the model on render; nothing drawn is stored.

## 3. Surfaces that became panels

| Panel | What it is | Reused |
|---|---|---|
| Conversation | the conversation column, unchanged | the same JSX |
| Thinking Map | the map, any lens | `ThinkingMap` |
| Model | one model, or one pinned representation of it | `ModelView`, `SceneSurface`, `MathViz` |
| Parameters | the model's controls and free inputs | new; writes through the same path as the model's own sliders |
| Inspector | what the selected thing is, how it was computed | new; `lib/model/inspect.ts` |
| Trace | the model's history of substance, undoable | new; `lib/model/docs.ts` undo / redo / restore |

## 4. What blocked composability

- The layout was hard-coded columns in one component.
- `ModelView` read the open view only from the model, so two panels could not show one model two ways.
- Map selection lived inside `ThinkingMap`; nothing outside it knew which idea was selected.
- The model-edit and "ask about this" handlers were inline props on `ThinkingMap`, so no other surface could share them.

## 5. What is reused

The document layer (revisions, coalesced adoption, undo), the representation registry (`lib/model/views.ts`), the inspector, the renderer, the map, the conversation and its send path, unchanged.

## 6. The workspace architecture

- **`lib/workspace/tiling.ts`** — a layout is a tree of splits and panels. Pure operations: split (at any share), close, replace, configure, resize, maximise/restore, move (edge or swap), add. `singleLayout` is where Logos 3 rests; `dominantPanel` is the panel with the most room. `sanitizeLayout` reads storage defensively.
- **`lib/workspace/surfaces.ts`** — `suggestViews` (representations worth opening) and `arrangementsFor` (arrangements worth making: compare, model with its controls, map beside the model, map beside its evidence, one view), each offered only when the state gives it meaning.
- **`components/workspace/Workspace.tsx`** — draws a layout and writes only the layout. A single panel has no chrome. Among several, hairline dividers (pointer and keyboard) and a corner chip — name, ⤢, × — that shows on hover; drag the name to move, double-click or ⤢ to maximise, Esc to restore. `+ View` in the header holds the views and the arrangements. Slots for the host's header, a dock beneath the stage and a contextual card over the panel in focus. Narrow screens show one surface; tabs appear only when there are several.
- **`LogosApp`** renders the same named pieces (`convoHead`, `convoBody`, `mapBody`) either in Logos 2's columns or as Logos 3's panels. A model with `workspace: true` (`lib/socria-prompt.ts`) gets the workspace.

## 7. The panel contract (`lib/workspace/surfaces.ts`)

Each surface declares what it represents, what selections it **emits** and **responds to**, whether it is **duplicable**, whether it **can be stale**, and whether it is **heavy**. `suggestViews` reads the state and offers only valid representations, each with a reason: a model offers its registry's views; an argument offers the map's lenses; nobody is offered a model panel for a question with no model.

## 8. Shared selection and context

- A model's **selected object** stays canonical (on the model).
- The workspace **focus** (`lib/workspace/focus.ts`) is per person and ephemeral: a parameter, a free input, a model object or a map idea. Selecting it anywhere makes it what the inspector describes and what the conversation means by "this".
- Each turn carries `describeFocus(focus, map)` — built from canonical state, never pixels — and the chat route adds it as a block (`focusBlock`).

## 9. Persistence, history, Think Together

- The **layout** persists per browser (`localStorage`, `socria.logos3.workspace.v2`), never in the session and never into a shared room. Two people thinking together share the model and keep their own layouts and focus.
- **Focus** is never persisted.
- **Layout changes never touch model history.** Model changes from any panel go through one write path — `adopt` into the document, coalesced per drag — so they appear in Trace and can be undone.

## 10. The vertical slice that shipped

Tiled workspace with resize, split, close, replace, move, maximise/restore, reset; six presets (Think, Model, Research, Compare, Deep work, Brainstorm); `+ View` ranked by state; Conversation, Thinking Map, Model (with pinned representations), Parameters, Inspector and Trace panels over one session; shared focus into the conversation; layout persistence; a suggestion line Socria may offer and the person accepts or dismisses.

### Acceptance (Chromium, real engine, scripted model calls)

A saddle built from the conversation; Model preset (model, conversation, parameters, inspector). Moving `a` to −1.2 in Parameters moved the model's own slider, the inspector, the conversation's context ("a parameter of A saddle, now −1.2 … what depends on it: z, ∂z/∂x") and the Trace ("a to −1.2"). Maximise, restore, split with a linked Level sets view, close and reopen the conversation: `a` stayed −1.2. Reload: the layout and the value returned. A conceptual decision: `+ View` offered the map's lenses, the inspector and the conversation — no model, parameters or trace.

## 11. Simple at rest, powerful on demand

The first slice exposed the architecture itself: six permanent modes, a header on every panel, a large conversation column, a menu in every corner. A new person did not know where to look. The architecture stayed; its expression changed.

**One thing in focus. Anything available when needed.**

| At rest | On demand |
|---|---|
| One surface: the Thinking Map, or the model once there is one | `+ View` opens a representation beside it, or an arrangement |
| The conversation is a composer beneath the stage, with Socria's latest reply as a few lines | "Conversation" opens the history above the composer; it can also be a panel |
| No panel chrome | Several panels: a corner chip on hover (name, maximise, close) |
| No inspector | Selecting a part, parameter or input brings a card describing it; "Keep open" makes it a panel |
| No modes | Arrangements — compare, model with its controls, map beside the model, map beside its evidence, one view — offered only when they mean something |
| The model's name and its view switcher | "Understand" opens how it was computed, what it can't show, and the structural views |

Rules that keep it that way:

- The one surface follows the work **only while it is one surface**: a map that builds its first model becomes the model; a line with no model shows its map. An arrangement of several panels is the person's and never moves.
- A surface that serves another (parameters, inspector, trace, conversation) opens at a third of the room, so the thing being thought about keeps it.
- Nothing is said twice in Logos 3: the map's lens bar and legend, the model's corner labels and transparency caption, and the model's own sliders while a Parameters panel is open, are hidden there. Logos 2 is unchanged.
- Socria's suggestion is one quiet line, only when the conversation asks for a different arrangement ("compare", "evidence"), applied only if accepted.

Verified in Chromium against the real engine with scripted model calls: fresh line (map + composer only), a decision drawn, the saddle built (the single surface switches to the model), Model with its controls, parameter `a` to −1.2 with the inspector card and the conversation focus, Keep open, close, One view, reload; a phone at 390px with no horizontal scroll; Logos 2 unchanged.

## 12. Structure in place of the Board

Logos 3 has no Board. The Board drew the working a second time, as if by
hand, beside the Solution lens that already shows it step by step. Structure
takes its place, for mathematics as well as for an argument (`availableLenses(map,
{ workspace: true })`). Logos 2 keeps its Board.

In Logos 3, Structure is not a canvas of small cards. It is a detailed
outline that fills the panel (`components/StructureView.tsx`, read by the pure
`lib/logos-structure.ts`):

- **An argument, a decision, a plan.** The goal heads it. What serves the goal
  hangs beneath it, and what supports each part hangs beneath that. Nesting
  uses the same rules as the card layout (`HIERARCHY`). Each part shows:
  - its kind, and how it hangs from its parent ("supports", "depends on");
  - its note and its status (Supported, Settled, Open);
  - who added it, when the session is shared;
  - every other relation it has, as a link to the part it names. Conflicts
    come first.
- **Not connected yet.** Parts the goal does not reach are listed under this
  heading, so a gap in the reasoning shows instead of hiding.
- **Mathematics.** The outline follows the order a person works a problem:
  what is given, what is being solved for, what the working uses, the working
  itself (ordered by its step-to-step relations, each step naming the
  operation that produced it), the checks, and where it lands. Under the
  Answer Guard a concluding part is masked, as it is on its card.
- **Selecting a part** works like selecting its card. The conversation becomes
  about that part, its comment pin follows it, and Explore, Challenge,
  Research and Trace are offered under it.

**Asking for a view by name.** Phrases like "show this as a structure",
"organize it into a mind map", "put it in a table" or "switch to the
timeline" are read by `lib/view-request.ts`. The reader is conservative: a
question about a structure is not a request to see one. The map then takes
over the stage in that view (`showLens`):

- a single surface becomes the map in that view;
- in an arrangement of several panels, the map panel is pointed at the view
  and maximised, so the arrangement comes back on restore.

What happens to the message depends on whether the view can be drawn yet:

- **It can.** The switch is the whole answer, and no model call is made.
- **It can't yet** (a timeline before the map has an order). The sentence
  still goes to Socria. Its map pass reorganizes the thinking into that shape
  (`statedBuilding`, which now also knows "plot", "chart" and "concept map"),
  and the view opens as soon as it can.

A lens a panel was opened on, whether pinned from `+ View` or asked for by
name, now holds whenever the map can draw it, until the person picks another
tab. Before this change, the lens the map would lead with replaced it on the
first render.

Tests: `test/logos3-structure.test.mjs` (65 checks). Verified in Chromium:
- maths on Logos 3 shows Structure and no Board;
- the outline fills the panel;
- "show this as a structure", "organize it into a mind map" and "switch to
  the outline" each switch views with no model call;
- links, selection and actions work;
- dark theme renders correctly;
- a 390px phone has no sideways scroll.

## 13. Notes in the conversation; the chrome put away

**Notes on the work sit in the conversation.** Three notes used to be strips
across the top of the map:
- what the engine did with a model this turn proposed, which may be a
  refusal or a variable it left out;
- a cue to something worth finding ("See where this came from…");
- the first map's save-as-image nudge.

In Logos 3 they are said under Socria's latest reply instead, where the
person is already reading. They sit in the thread when the conversation is
open, and under the reply's preview when it is folded. Each can be put away.
The map keeps the screen. Logos 2 keeps its strips.

**The chats bar and header, put away.** A control at the far right of the
header hides both, and the thinking takes the whole window. One small button
in the top-right corner brings them back. The choice is kept per browser
(`socria.logos.chrome.v1`). The ≡ at the top left still hides the chats bar
on its own.

Tests: `test/logos3-chat-notes.test.mjs`. Verified in Chromium:
- no strip over the map;
- the cue under the folded reply, and the build note, including what it left
  out, in the thread directly under the reply;
- dismissing a note;
- hiding and restoring the chats bar and header, which persists across a
  reload;
- a phone at 390px.

## 14. Live 3D (experimental)

A scene, built by describing it. "+ View" offers **Live 3D**: a panel with a
3D view, a line to describe what to build or change, the parts, and an
inspector. What is typed is read as it is typed, and the scene it would make
is drawn at once, with what would change ghosted. Nothing is in the scene
until Enter.

The scene is an object of thought, kind `scene` (`lib/objects/scene.ts`). It
lives in the map, so it persists and syncs with the line of thinking, and the
conversation is told about it. Selecting a part is the workspace's shared
focus: "About box of Scene". The map's Work lens draws the scene as a plan
seen from above, with each step in its trail and an "Open in 3D" button.

It says what it is. The panel, the facts and the reply model's rules all
call it a geometric preview: shapes, sizes and positions, computed exactly.
Nothing in it is loaded, stressed or simulated (a mass, where a density is given, is density × volume and no more), and the reply model is told
never to say it would stand, hold or float.

The full account is in `docs/LOGOS3-LIVE-3D.md`. Tests:
`test/logos3-scene.test.mjs`.

## Next

Sources and Evidence as their own surfaces; a Compare/Differences panel over `compareRevisions`; branch selection; per-panel cameras that survive remounts; suggestions from the conversation's own ask (`lib/model/ask.ts`) rather than keywords.
