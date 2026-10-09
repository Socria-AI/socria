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

- **`lib/workspace/tiling.ts`** — a layout is a tree of splits and panels. Pure operations: split (at any share), close, replace, configure, resize, maximise/restore, move (edge or swap), add, a weighted row (`rowLayout`) and re-sharing siblings by weight (`reshare`). `singleLayout` is where Logos 3 rests; `dominantPanel` is the panel with the most room; `visiblePanels` is what is on screen. `sanitizeLayout` reads storage defensively.
- **`lib/workspace/surfaces.ts`** — `suggestViews` (representations worth opening), `arrangementsFor` (arrangements worth making: compare, model with its controls, map beside the model, map beside the 3D view, model beside the 3D view, all three, map beside its evidence, one view, and the model just built), each offered only when the state gives it meaning; the layout builders for surfaces asked for by name and for what a build opens (§15–16); the catalogue of every view (§18).
- **`lib/workspace/interface-request.ts`** — reads a request for an interface from what the person typed (§15).
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
| One surface: the Thinking Map, or the model once there is one | `+ View` opens a representation beside it, any view by name, or an arrangement; so does asking in the conversation |
| The conversation is a composer beneath the stage, with Socria's latest reply as a few lines | "Conversation" opens the history above the composer; it can also be a panel |
| No panel chrome | Several panels: a corner chip on hover (name, maximise, close) |
| No inspector | Selecting a part, parameter or input brings a card describing it; "Keep open" makes it a panel |
| No modes | Arrangements — compare, model with its controls, map beside the model, the model or the map beside the 3D view, all three, map beside its evidence, one view — offered only when they mean something |
| The model's name and its view switcher | "Understand" opens how it was computed, what it can't show, and the structural views |

Rules that keep it that way:

- The workspace follows the work **only while it is one map**: a build opens the model beside a lone map (§16); a line with no model shows its map. An arrangement of several panels is the person's and never moves — a build there is offered, not opened.
- A surface that serves another (parameters, inspector, trace, conversation) opens at a third of the room, so the thing being thought about keeps it.
- Nothing is said twice in Logos 3: the map's lens bar and legend, the model's corner labels and transparency caption, and the model's own sliders while a Parameters panel is open, are hidden there. A map beside a model shows its reasoning, not the model a second time (§17). Logos 2 is unchanged.
- Socria's suggestion is one quiet line, only when the conversation asks for a different arrangement ("compare", "evidence", "the map beside the model") or a model was just built where nothing shows it, applied only if accepted.

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

## 15. Read-only panels

A viewer or commenter in a shared line of thinking could drag a slider in the
Model, Parameters or Trace panel. The server refused the write (403), and their
screen stopped following the owner's. Every panel that writes the model now
takes `readOnly?: boolean` (`components/workspace/panels.tsx`):

| Panel | With `readOnly` |
|---|---|
| `ModelPanel` | The model is drawn and can still be turned. Its controls (sliders, the view row, selection) sit inside a disabled `<fieldset>` titled "View only", and `onModel` is never called. |
| `ParamsPanel` | Every slider is shown at its value, disabled and titled "View only", and `onModel` never fires. A control's name still selects it; that is reading, not editing. |
| `TracePanel` | The history is shown. Undo, Redo and every return-to-this-point are disabled and titled "View only", and none of their callbacks fires. |

Absent or false, every panel is exactly as before. The Inspector writes nothing
and has no such prop. The title text is exported as `VIEW_ONLY`. The host
passes `readOnly` when the person's role in the shared session cannot edit
(viewer, commenter).

Tests: `test/workspace-readonly.test.mjs`, on the markup and driven in a DOM,
each check paired with the panel not read-only as its control.

In the workspace a 3D panel is titled **Studio (CAD)** (`SURFACES.scene.title`,
`VIEW_NAMES.scene`). Pinned with `obj` it draws a Live 3D scene. Pinned with
`doc` it is that model's 3D view: the solids the model holds, which the panel
renders from the model (the layouts here produce it — §16; drawing it is the
client's, §19). With neither it is the empty studio, where a shape described
in the conversation is drawn.

## 16. Asking for an interface

Before this, only the map's lenses could be asked for in the conversation.
"Open the model", "show it in 3D", "open Live 3D" and "show the map and the
model side by side" went to the reply, which is told never to talk about a
visualization, so nothing on screen changed. "Close the map" and "remove the
3D model" were read as map commands (`lib/map-edit.ts`), and the second could
delete an idea labelled "Interactive 3D model".

`readInterfaceRequest(text, ctx?)` in `lib/workspace/interface-request.ts`
reads them. The client runs it **before map commands**, so a view verb never
reaches a node edit, and applies the result with `layoutForRequest`. It
returns `{ op, surfaces, lens?, called, missing? }`:

- **open** — make them visible beside what is there: "open the model", "show
  me the map", "bring up the parameters", "can you show me the model?", "the
  model, please", "the 3D view".
- **close** — "close the map", "hide the 3D view", "take the map away",
  "remove the 3D model" (the model and its 3D view), "close everything" (back
  to the map).
- **only** — "just the model", "switch to the model", "go back to the map",
  "maximise the 3D view", "make the model full screen". One surface is
  maximised among several, so restore brings the arrangement back (the way a
  lens asked for by name is); several become the whole workspace.
- **pair** and **all** — "show both", "show the map and the model side by
  side", "put the map beside the model", "put them side by side", "show all
  three", "show the map, the model and the 3D view".

The names: the model (also the simulation, modelling); the parameters
(sliders, controls); 3D (3-D, three-d, Live 3D, CAD, the studio, Studio (CAD),
the 3D view, "show it in 3D", "in 3D"); the map (the thinking map); math
plotting (the map's plot lens); the inspector; the trace (history); the Mind
view; the conversation. "Both" and "everything" mean what there is (`ctx`:
`hasModel`, `hasScene`, `hasMap`). A 3D model is its 3D view where there is
one, else the model.

It is conservative on purpose:

- **Questions are not requests.** "What is a model?", "is the map right?",
  "how do I open the model?" go on as messages.
- **Construction is not a request for an interface.** "Model a 2×2×2 m cube",
  "make a 3D model of a cone", "build a model of supply and demand", "create an
  interactive 3D model of a rocket nose cone…" and "show me how a cone's volume
  changes" are not read: there is no verb of making in it, a surface named with
  "a" ("show me a model") begins a description rather than pointing at one,
  and what comes after a name must be nothing but the name. The map pass
  builds; §17 opens what it built.
- **Short messages only:** twelve words, a hundred characters. A bare name
  needs a "please", a panel word or "side by side" to count; "both" on its own
  answers a question as often as it asks for a screen.
- **A lens asked for by name reads exactly as it did.** `readViewRequest` runs
  first, unchanged; its result comes back as the map in that lens and is
  applied with `showLens`, as before, with the same canned line (`viewSaid`).

What Socria says is one line from `interfaceSaid(req)`: "Here is the model.",
"Here it is in 3D.", "Here are the map and the model, side by side.", "Closed
the map." When the context says a surface has nothing to show (`missing`), the
panel still opens on its empty state and the line says why: "There is no
model in this line of thinking yet — ask for one and it appears here."

## 17. What a build opens

The approved decision: a model built from a lone map opens **beside** the map,
as the tour promises, not in its place. `afterBuild(layout, facts, { doc,
solids })` is keyed on the build itself — the server's `build.ok` and
`build.id` — never on a count of documents, so the seventh model, built where
only six are kept (`DOC_CAP`), opens like the first.

- **Already on screen** — a model panel showing it, its 3D view, or a Math
  plotting panel (which draws the active model): nothing.
- **A lone map, or an empty workspace** — map | model, and map | model | 3D
  view when the model holds solids (the 3D panel pinned to it with `doc`). The
  map keeps its place and takes its reasoning lens. The conversation, as a
  panel, keeps its place and room and does not count as a panel here. A map
  with nothing on it yet has no reading but the model, so the model takes the
  stage alone.
- **Any other arrangement** is the person's: nothing moves. The suggestion
  line asks "Open the model?" (or "…and its 3D view?"), id `built:<doc>`,
  arrangement `built`. While `facts.built` is set, `arrangementsFor` offers
  `built` — the model opened into the arrangement as it is, a maximised panel
  restored, nothing of theirs closed — and `suggestLayout` makes the offer, so
  the existing accept path finds it.

## 18. The map beside the model, and 3D

The only arrangement of the map with the model pinned the graph lens, and a
map holding a model never offered the graph, so the map fell back to its plot
and showed the model twice. Now:

- **`availableLenses`** keeps the graph offered when a map holds a model
  (after the plot, so the plot still leads a map on its own; `leadLens` never
  lets the graph take the lead from the plot). Mathematics keeps its own
  readings and gets the graph only when it has none. No test pinned the old
  list.
- **`reasoningLens`** is the lens a map panel shows beside a model or a 3D
  view: what it would lead with if the model were not drawn on it — the
  working, the shape of what is being built, else the graph. Never the plot,
  never the Work lens (which draws the objects a 3D panel already shows).
  `factsFrom` reports it as `reasoning`, and the lead as `lead`.
- **Arrangements:** `map-model` pins the reasoning lens. `map-scene`,
  `model-scene` and `all` (map | model | 3D) are offered when there is
  something in 3D — a model with solids, or a Live 3D scene. The ids that
  existed are unchanged.
- **"Side by side" means what it names.** In a longer message, "the map and
  the model side by side" suggests the map beside the model, never a
  comparison of the model with its own level sets. The compare chip is for two
  models, or for "compare" and "versus" said outright.
- Any map with no lens of its own that ends up beside a model or a 3D view —
  opened from `+ View`, from the catalogue, by a request or by a build — is
  pointed at the reasoning. A lens somebody chose is kept; Math plotting most
  of all.

## 19. Every view, by name

`+ View` leads with what the state makes worth opening ("Open beside"). Under
it, **All views** lists every kind of view, so any can be opened by hand or
put away:

| Name | Panel |
|---|---|
| Thinking Map | `map` |
| Math plotting | `map` pinned to the `plot` lens |
| Modeling | `model` |
| Studio (CAD) | `scene` |
| Parameters | `params` |
| Inspector | `inspector` |
| Trace | `trace` |
| Mind | `mind` |
| Conversation | `chat` |

An open view is marked **Open**, with a × ("Remove … from the workspace")
that closes every panel of that kind; the menu stays open, so several can be
put away in turn. A view not open is added beside the panel with the most
room. A view with nothing to show yet still opens, onto its own empty state,
and its second line says so quietly ("no model yet — ask for one in the
conversation", "empty — describe a shape in the conversation", "nothing to
plot yet — it shows the map until there is"). `viewCatalogue(layout, facts?,
offered?)`, `openView`, `closeView` and `viewOf` are pure; `VIEW_NAMES` and
`VIEW_CATALOGUE` are the names and the order.

## 20. For the client

Everything above is pure and tested; the client wires it in.

- **Facts.** `factsFrom(map, { solids? })`, where `solids(docId, model)` says
  whether a model holds 3D solids. Set `built: { doc, solids }` on the facts
  from the map response's `build.ok`/`build.id` until the next turn.
- **Requests.** In `send`, before `readMapCommand` (and in place of the
  `readViewRequest` branch): `const want = readInterfaceRequest(content,
  interfaceContext(wsFacts))`. If it reads, apply `layoutForRequest(want,
  wsLayout, wsFacts)`; when `want.surfaces` includes `chat`, open (or, for
  close, fold) the dock; post `interfaceSaid(want)` as the reply. A lens that
  cannot be drawn yet still goes on to Socria, as before.
- **Builds.** When a turn's build lands, once: `const r = afterBuild(wsLayout,
  wsFacts, built)`; apply `r.layout` if there is one. The suggestion comes
  through `suggestLayout` while `facts.built` is set, and `acceptSuggestion`
  finds its `built` arrangement.
- **The 3D panel for a model.** `{ type: 'scene', config: { doc } }`: render
  the model's solids; the Live 3D chat builder should build only into a 3D
  panel that is not pinned to a model.
- **`+ View`.** Pass `facts={wsFacts}` to `Workspace`: the catalogue then says
  which views are empty, and a view opened beside a model shows what it
  should. Title a 3D panel `VIEW_NAMES.scene`.

Tests: `test/logos3-interface.test.mjs`, with `test/logos3-workspace.test.mjs`,
`test/logos3-structure.test.mjs` and `test/logos3-scene.test.mjs`.

## Next

Sources and Evidence as their own surfaces; a Compare/Differences panel over `compareRevisions`; branch selection; per-panel cameras that survive remounts; suggestions from the conversation's own ask (`lib/model/ask.ts`) rather than keywords.
